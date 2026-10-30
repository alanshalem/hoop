import { recordKey, timeOf } from './sync-records';
import type { MatchRecord, VersionMap } from './sync-types';

/**
 * =============================================================================
 * HOOP OS - FIELD-LEVEL MERGE FOR MATCH RECORDS (S13.1)
 * Two devices editing one match (one runs the clock, another fixes the venue)
 * must both keep their edit, so match metadata merges field by field: every
 * field carries the ISO time of its last change and the newer one wins; ties
 * keep the server value. Shared by the server push and the client pull merge.
 * Divisions, teams and players keep whole-record last-write-wins.
 * =============================================================================
 */

/** Recomputed from the play-by-play on every device: never versioned. */
export const MATCH_DERIVED_FIELDS = ['homeScore', 'awayScore', 'homeFoulsQuarter', 'awayFoulsQuarter'] as const;

/** Every other top-level field of a match record (`id` and `events` excluded). */
export const MATCH_VERSIONED_FIELDS = [
  'clubId',
  'divisionId',
  'ownTeamId',
  'ownTeamName',
  'rivalTeamName',
  'rivalLogoUrl',
  'date',
  'condition',
  'tournament',
  'venue',
  'status',
  'currentQuarter',
  'quarterTimeRemainingSeconds',
  'homeTimeouts',
  'awayTimeouts',
  'startingLineupOwn',
  'activeLineupOwn',
  'rosterOwnPlayerIds',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof MatchRecord)[];

export type MatchField = (typeof MATCH_VERSIONED_FIELDS)[number];
type MatchDerivedField = (typeof MATCH_DERIVED_FIELDS)[number];

// Compile-time guard: a new Match field must be classified as versioned or derived.
type UnclassifiedMatchField = Exclude<keyof MatchRecord, 'id' | MatchField | MatchDerivedField>;
const ALL_MATCH_FIELDS_CLASSIFIED: Record<UnclassifiedMatchField, never> = {};
void ALL_MATCH_FIELDS_CLASSIFIED;

/** Field -> ISO time of its last change, as sent and stored (may be partial). */
export type MatchFieldVersions = Partial<Record<MatchField, string>>;
/** A version for every field. */
export type CompleteFieldVersions = Record<MatchField, string>;

/** Version of a field nobody ever wrote: any real change beats it. */
export const EPOCH_VERSION = new Date(0).toISOString();

type FieldValues = Readonly<Record<string, unknown>>;

/**
 * Versions of every field. A record without field versions (written before
 * S13.1) changed every field at `updatedAt`; a field missing from partial
 * versions was never written.
 */
export function resolveFieldVersions(
  versions: MatchFieldVersions | null | undefined,
  updatedAt: string
): CompleteFieldVersions {
  return Object.fromEntries(
    MATCH_VERSIONED_FIELDS.map((field) => [field, versions ? (versions[field] ?? EPOCH_VERSION) : updatedAt])
  ) as CompleteFieldVersions;
}

/** Known match fields only: unknown keys (another app version) are ignored. */
export function pickFieldVersions(raw: Readonly<Record<string, string>>): MatchFieldVersions {
  return Object.fromEntries(
    MATCH_VERSIONED_FIELDS.filter((field) => raw[field] !== undefined).map((field) => [field, raw[field]])
  );
}

/** Newest field version (the record's `updatedAt`). */
export function latestFieldVersion(versions: CompleteFieldVersions): string {
  return MATCH_VERSIONED_FIELDS.reduce(
    (latest, field) => (timeOf(versions[field]) > timeOf(latest) ? versions[field] : latest),
    EPOCH_VERSION
  );
}

/** True when `versions` is equal to or newer than `other` on every field. */
export function coversFieldVersions(versions: CompleteFieldVersions, other: CompleteFieldVersions): boolean {
  return MATCH_VERSIONED_FIELDS.every((field) => timeOf(versions[field]) >= timeOf(other[field]));
}

/** Versioned fields whose value differs (structural comparison; derived fields are ignored). */
export function changedMatchFields(before: FieldValues, after: FieldValues): MatchField[] {
  return MATCH_VERSIONED_FIELDS.filter((field) => !sameValue(before[field], after[field]));
}

export interface VersionedMatchData<T extends FieldValues> {
  data: T;
  fieldVersions: CompleteFieldVersions;
}

export interface MatchFieldMerge<T extends FieldValues> extends VersionedMatchData<T> {
  /** Fields where `incoming` was strictly newer and won. */
  taken: MatchField[];
}

/**
 * Field-level last-write-wins: each field keeps the newer version, a tie keeps
 * `server`. When `incoming` wins at least one field, the unversioned fields
 * (derived scoreboard) follow it; otherwise `server` is returned untouched.
 */
export function mergeMatchFields<T extends FieldValues>(
  server: VersionedMatchData<T>,
  incoming: VersionedMatchData<T>
): MatchFieldMerge<T> {
  const taken = MATCH_VERSIONED_FIELDS.filter(
    (field) => timeOf(incoming.fieldVersions[field]) > timeOf(server.fieldVersions[field])
  );
  if (taken.length === 0) return { ...server, taken };

  const won = new Set<MatchField>(taken);
  const data: Record<string, unknown> = { ...incoming.data };
  const fieldVersions = { ...server.fieldVersions };
  for (const field of MATCH_VERSIONED_FIELDS) {
    if (won.has(field)) {
      fieldVersions[field] = incoming.fieldVersions[field];
    } else if (server.data[field] === undefined) {
      delete data[field];
    } else {
      data[field] = server.data[field];
    }
  }
  return { data: data as T, fieldVersions, taken };
}

// -----------------------------------------------------------------------------
// CLIENT: field versions live in the sync store's versions map, next to the
// record version (`match:<id>`), as `match:<id>#<field>`. Resets of the map
// (logout, full resync) therefore clear them too.
// -----------------------------------------------------------------------------

function fieldVersionKey(matchId: string, field: MatchField): string {
  return `${recordKey('match', matchId)}#${field}`;
}

/** Local field versions of a match: missing ones fall back to the record version, then to the epoch. */
export function readFieldVersions(versions: VersionMap, matchId: string): CompleteFieldVersions {
  const recordVersion = versions[recordKey('match', matchId)] ?? EPOCH_VERSION;
  return Object.fromEntries(
    MATCH_VERSIONED_FIELDS.map((field) => [field, versions[fieldVersionKey(matchId, field)] ?? recordVersion])
  ) as CompleteFieldVersions;
}

/** The versions-map entries that store `fieldVersions` for a match. */
export function fieldVersionEntries(matchId: string, fieldVersions: CompleteFieldVersions): VersionMap {
  return Object.fromEntries(
    MATCH_VERSIONED_FIELDS.map((field) => [fieldVersionKey(matchId, field), fieldVersions[field]])
  );
}

/** A copy of `versions` with the field versions of a match replaced. */
export function writeFieldVersions(
  versions: VersionMap,
  matchId: string,
  fieldVersions: CompleteFieldVersions
): VersionMap {
  return { ...versions, ...fieldVersionEntries(matchId, fieldVersions) };
}

/** Structural equality for JSON-like values; `undefined` properties count as absent. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const entriesOf = (value: object) =>
    Object.entries(value).filter(([, item]) => item !== undefined) as [string, unknown][];
  const left = entriesOf(a);
  const right = new Map(entriesOf(b));
  return left.length === right.size && left.every(([key, item]) => right.has(key) && sameValue(item, right.get(key)));
}
