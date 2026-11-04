import { recordKey, timeOf } from './sync-records';
import type { MatchRecord, VersionMap } from './sync-types';

/**
 * =============================================================================
 * HOOP OS - FIELD-LEVEL MERGE FOR MATCH RECORDS (S13.1)
 * Two devices editing one match (one runs the clock, another fixes the venue)
 * must both keep their edit, so match metadata merges field by field: every
 * field carries the ISO time of its last change and the newer one wins; ties
 * keep the server value. Shared by the server push and the client pull merge.
 * Fields that only make sense together share one version (T14): status,
 * quarter and clock are the `game-state` group, so a merge never combines the
 * quarter of one tablet with the clock of another. Each team's timeouts are one
 * object field: two simultaneous timeout requests resolve to the newer one.
 * Divisions, teams, players, chart codes, rival teams and coaches keep whole-record last-write-wins.
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
  'officialResult',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof MatchRecord)[];

export type MatchField = (typeof MATCH_VERSIONED_FIELDS)[number];
type MatchDerivedField = (typeof MATCH_DERIVED_FIELDS)[number];

/** Fields versioned together: one side wins all of them, never a mix. */
export const MATCH_FIELD_GROUPS = {
  'game-state': ['status', 'currentQuarter', 'quarterTimeRemainingSeconds'],
} as const satisfies Record<string, readonly MatchField[]>;

export type MatchFieldGroup = keyof typeof MATCH_FIELD_GROUPS;
type GroupedField = (typeof MATCH_FIELD_GROUPS)[MatchFieldGroup][number];

/** What carries a version: a field on its own, or a field group. */
export type MatchVersionKey = Exclude<MatchField, GroupedField> | MatchFieldGroup;

const GROUP_ENTRIES = Object.entries(MATCH_FIELD_GROUPS) as [MatchFieldGroup, readonly GroupedField[]][];

export function versionKeyOf(field: MatchField): MatchVersionKey {
  const group = GROUP_ENTRIES.find(([, fields]) => fields.some((grouped) => grouped === field))?.[0];
  return group ?? (field as Exclude<MatchField, GroupedField>);
}

/** Every version key, in field order (a group sits where its first field was). */
export const MATCH_VERSION_KEYS: readonly MatchVersionKey[] = [...new Set(MATCH_VERSIONED_FIELDS.map(versionKeyOf))];

function isGroup(key: string): key is MatchFieldGroup {
  return Object.hasOwn(MATCH_FIELD_GROUPS, key);
}

/** The fields a version key covers. */
function fieldsOf(key: MatchVersionKey): readonly MatchField[] {
  return isGroup(key) ? MATCH_FIELD_GROUPS[key] : [key];
}

/**
 * Names a version may be stored under: the key itself and, for a group, the
 * per-field names written before the group existed (the newest one counts).
 */
function storedNamesOf(key: MatchVersionKey): readonly string[] {
  return isGroup(key) ? [key, ...MATCH_FIELD_GROUPS[key]] : [key];
}

/** The newest version found under `names`, or undefined when there is none. */
function newestStored(names: readonly string[], read: (name: string) => string | undefined): string | undefined {
  return names.reduce<string | undefined>((newest, name) => {
    const version = read(name);
    return version !== undefined && (newest === undefined || timeOf(version) > timeOf(newest)) ? version : newest;
  }, undefined);
}

// Compile-time guard: a new Match field must be classified as versioned or derived.
type UnclassifiedMatchField = Exclude<keyof MatchRecord, 'id' | MatchField | MatchDerivedField>;
const ALL_MATCH_FIELDS_CLASSIFIED: Record<UnclassifiedMatchField, never> = {};
void ALL_MATCH_FIELDS_CLASSIFIED;

/** Version key -> ISO time of its last change, as sent and stored (may be partial). */
export type MatchFieldVersions = Partial<Record<MatchVersionKey, string>>;
/** A version for every version key. */
export type CompleteFieldVersions = Record<MatchVersionKey, string>;

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
    MATCH_VERSION_KEYS.map((key) => [key, versions ? (versions[key] ?? EPOCH_VERSION) : updatedAt])
  ) as CompleteFieldVersions;
}

/**
 * Known version keys only: unknown keys (another app version) are ignored, and
 * the per-field versions of a group (stored before the group existed) fold
 * into the group as their newest one.
 */
export function pickFieldVersions(raw: Readonly<Record<string, string>>): MatchFieldVersions {
  return Object.fromEntries(
    MATCH_VERSION_KEYS.flatMap((key) => {
      const version = newestStored(storedNamesOf(key), (name) => (Object.hasOwn(raw, name) ? raw[name] : undefined));
      return version === undefined ? [] : [[key, version]];
    })
  );
}

/** Newest field version (the record's `updatedAt`). */
export function latestFieldVersion(versions: CompleteFieldVersions): string {
  return MATCH_VERSION_KEYS.reduce(
    (latest, key) => (timeOf(versions[key]) > timeOf(latest) ? versions[key] : latest),
    EPOCH_VERSION
  );
}

/** True when `versions` is equal to or newer than `other` on every version key. */
export function coversFieldVersions(versions: CompleteFieldVersions, other: CompleteFieldVersions): boolean {
  return MATCH_VERSION_KEYS.every((key) => timeOf(versions[key]) >= timeOf(other[key]));
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
  /** Version keys where `incoming` was strictly newer and won. */
  taken: MatchVersionKey[];
}

/**
 * Field-level last-write-wins: each version key (a field or a whole group)
 * keeps the newer version, a tie keeps `server`. When `incoming` wins at least
 * one key, the unversioned fields (derived scoreboard) follow it; otherwise
 * `server` is returned untouched.
 */
export function mergeMatchFields<T extends FieldValues>(
  server: VersionedMatchData<T>,
  incoming: VersionedMatchData<T>
): MatchFieldMerge<T> {
  const taken = MATCH_VERSION_KEYS.filter(
    (key) => timeOf(incoming.fieldVersions[key]) > timeOf(server.fieldVersions[key])
  );
  if (taken.length === 0) return { ...server, taken };

  const won = new Set<MatchVersionKey>(taken);
  const data: Record<string, unknown> = { ...incoming.data };
  const fieldVersions = { ...server.fieldVersions };
  for (const key of MATCH_VERSION_KEYS) {
    if (won.has(key)) {
      fieldVersions[key] = incoming.fieldVersions[key];
      continue;
    }
    for (const field of fieldsOf(key)) {
      if (server.data[field] === undefined) delete data[field];
      else data[field] = server.data[field];
    }
  }
  return { data: data as T, fieldVersions, taken };
}

// -----------------------------------------------------------------------------
// CLIENT: field versions live in the sync store's versions map, next to the
// record version (`match:<id>`), as `match:<id>#<version key>`. Resets of the
// map (logout, full resync) therefore clear them too.
// -----------------------------------------------------------------------------

function fieldVersionKey(matchId: string, name: string): string {
  return `${recordKey('match', matchId)}#${name}`;
}

/**
 * Local field versions of a match: missing ones fall back to the record
 * version, then to the epoch. A group also reads the per-field entries written
 * before it existed (the newest one counts).
 */
export function readFieldVersions(versions: VersionMap, matchId: string): CompleteFieldVersions {
  const recordVersion = versions[recordKey('match', matchId)] ?? EPOCH_VERSION;
  return Object.fromEntries(
    MATCH_VERSION_KEYS.map((key) => [
      key,
      newestStored(storedNamesOf(key), (name) => versions[fieldVersionKey(matchId, name)]) ?? recordVersion,
    ])
  ) as CompleteFieldVersions;
}

/** The versions-map entries that store `fieldVersions` for a match. */
export function fieldVersionEntries(matchId: string, fieldVersions: CompleteFieldVersions): VersionMap {
  return Object.fromEntries(MATCH_VERSION_KEYS.map((key) => [fieldVersionKey(matchId, key), fieldVersions[key]]));
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
