import type { RivalPlayer, RivalTeam } from '@/core/domain/entities/rival.types';
import { findRivalTeam } from '@/core/domain/rules/rival-teams';
import {
  addRivalPlayer,
  updateRivalPlayer,
  type RivalPlayerInput,
} from '@/core/application/use-cases/rival-team-use-cases';
import {
  RIVAL_PLAYER_REFUSAL_MESSAGES,
  RIVAL_TEAM_REFUSAL_MESSAGES,
  sortRivalPlayers,
  type RivalPlayerRefusal,
} from '@/presentation/organisms/RivalTeamFormModal/rival-roster';

/**
 * =============================================================================
 * HOOP OS - RIVAL ROSTER IN THE MATCH FORM (S16)
 * The match form shows the roster of the typed rival in the selected division
 * and edits it as a draft. The draft becomes store actions only when the match
 * is saved; validation runs through the rival-team use-cases.
 * =============================================================================
 */

export type MatchRivalRoster =
  | { kind: 'NONE' }
  | { kind: 'FOUND'; team: RivalTeam }
  /** A rival name with no roster in the division; `name` is trimmed. */
  | { kind: 'MISSING'; name: string };

/** Roster section state for a division and a typed rival name (L18 matching). */
export function resolveMatchRivalRoster(
  rivalTeams: readonly RivalTeam[],
  divisionId: string,
  rivalName: string
): MatchRivalRoster {
  const name = rivalName.trim();
  if (!divisionId || !name) return { kind: 'NONE' };
  const team = findRivalTeam(rivalTeams, divisionId, name);
  return team ? { kind: 'FOUND', team } : { kind: 'MISSING', name };
}

/** Rival teams offered for the "Equipo rival" field, by name. */
export function divisionRivalSuggestions(rivalTeams: readonly RivalTeam[], divisionId: string): RivalTeam[] {
  return rivalTeams
    .filter((team) => team.divisionId === divisionId)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function formatMissingRoster(name: string, divisionName: string): string {
  return `${name} no tiene plantel en ${divisionName}.`;
}

/** A player added in the form; `key` identifies it until it is saved. */
export interface DraftPlayer extends RivalPlayerInput {
  key: string;
}

/** Changes made in the form relative to the roster shown. */
export interface RosterDraft {
  added: DraftPlayer[];
  /** New values by roster player id. */
  edits: Record<string, RivalPlayerInput>;
  removed: string[];
}

export const EMPTY_ROSTER_DRAFT: RosterDraft = { added: [], edits: {}, removed: [] };

export interface RosterRow extends RivalPlayerInput {
  /** Roster player id, or the draft key of a new player. */
  key: string;
  isNew: boolean;
}

/** What the form lists: the roster with the draft applied, by dorsal. */
export function rosterRows(baseline: readonly RivalPlayer[], draft: RosterDraft): RosterRow[] {
  const kept = baseline
    .filter((player) => !draft.removed.includes(player.id))
    .map((player) => ({ ...player, ...draft.edits[player.id] }));
  const rows = [
    ...kept.map(({ id, dorsal, firstName, lastName }) => ({ key: id, dorsal, firstName, lastName, isNew: false })),
    ...draft.added.map(({ key, dorsal, firstName, lastName }) => ({ key, dorsal, firstName, lastName, isNew: true })),
  ];
  return sortRivalPlayers(rows);
}

export type DraftSaveResult = { ok: true; draft: RosterDraft } | { ok: false; reason: RivalPlayerRefusal };

const omitKey = <T>(record: Record<string, T>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key));

const sameFields = (a: RivalPlayerInput, b: RivalPlayerInput) =>
  a.dorsal === b.dorsal && a.firstName === b.firstName && a.lastName === b.lastName;

/**
 * Adds a player (`rowKey` null, stored under `newKey`) or edits the row `rowKey`.
 * The listed rows act as the team, so the use-case refuses a repeated dorsal.
 */
export function saveDraftPlayer(
  baseline: readonly RivalPlayer[],
  draft: RosterDraft,
  input: RivalPlayerInput,
  rowKey: string | null,
  newKey: string
): DraftSaveResult {
  const players = rosterRows(baseline, draft).map(({ key, dorsal, firstName, lastName }) => ({
    id: key,
    dorsal,
    firstName,
    lastName,
  }));
  const team: RivalTeam = { id: 'draft', clubId: 'draft', divisionId: 'draft', name: 'draft', players };
  const key = rowKey ?? newKey;
  const result = rowKey
    ? updateRivalPlayer([team], team.id, rowKey, input)
    : addRivalPlayer([team], team.id, input, { id: newKey });
  if (!result.ok) return result;

  const saved = result.rivalTeams[0].players.find((player) => player.id === key);
  if (!saved) return { ok: false, reason: 'PLAYER_NOT_FOUND' };
  const fields: RivalPlayerInput = { dorsal: saved.dorsal, firstName: saved.firstName, lastName: saved.lastName };

  if (draft.added.some((player) => player.key === key) || !rowKey) {
    const added = rowKey
      ? draft.added.map((player) => (player.key === key ? { key, ...fields } : player))
      : [...draft.added, { key, ...fields }];
    return { ok: true, draft: { ...draft, added } };
  }

  const original = baseline.find((player) => player.id === key);
  const edits = omitKey(draft.edits, key);
  return {
    ok: true,
    draft: { ...draft, edits: original && sameFields(original, fields) ? edits : { ...edits, [key]: fields } },
  };
}

export function removeDraftPlayer(baseline: readonly RivalPlayer[], draft: RosterDraft, rowKey: string): RosterDraft {
  if (draft.added.some((player) => player.key === rowKey)) {
    return { ...draft, added: draft.added.filter((player) => player.key !== rowKey) };
  }
  if (!baseline.some((player) => player.id === rowKey) || draft.removed.includes(rowKey)) return draft;
  return { ...draft, edits: omitKey(draft.edits, rowKey), removed: [...draft.removed, rowKey] };
}

export type RosterOperation =
  | { type: 'CREATE_TEAM'; divisionId: string; name: string }
  | { type: 'REMOVE_PLAYER'; playerId: string }
  | { type: 'UPDATE_PLAYER'; playerId: string; player: RivalPlayerInput }
  | { type: 'ADD_PLAYER'; player: RivalPlayerInput };

const toInput = ({ dorsal, firstName, lastName }: RivalPlayerInput): RivalPlayerInput => ({
  dorsal,
  firstName,
  lastName,
});

/**
 * Store actions that turn the draft into the roster shown, in a fixed order:
 * create the team (no roster yet), removes, updates (roster order), adds (draft
 * order). Removes go first so a freed dorsal can be reused. Empty = no writes.
 */
export function planRosterOperations(
  roster: MatchRivalRoster,
  divisionId: string,
  draft: RosterDraft
): RosterOperation[] {
  if (roster.kind === 'NONE') return [];
  const adds = draft.added.map((player): RosterOperation => ({ type: 'ADD_PLAYER', player: toInput(player) }));
  if (roster.kind === 'MISSING') {
    return adds.length === 0 ? [] : [{ type: 'CREATE_TEAM', divisionId, name: roster.name }, ...adds];
  }

  const players = roster.team.players;
  const removes = players
    .filter((player) => draft.removed.includes(player.id))
    .map((player): RosterOperation => ({ type: 'REMOVE_PLAYER', playerId: player.id }));
  const updates = players
    .filter((player) => !draft.removed.includes(player.id))
    .flatMap((player): RosterOperation[] => {
      const edit = draft.edits[player.id];
      return edit && !sameFields(player, edit)
        ? [{ type: 'UPDATE_PLAYER', playerId: player.id, player: toInput(edit) }]
        : [];
    });
  return [...removes, ...updates, ...adds];
}

/** The rival-team store actions the match form uses (same signatures as the club store). */
export interface RosterActions {
  createRivalTeam: (input: { divisionId: string; name: string }) => { ok: true; id: string } | { ok: false; reason: 'INVALID_NAME' };
  addRivalPlayer: (
    teamId: string,
    input: RivalPlayerInput
  ) => { ok: true; playerId: string } | { ok: false; reason: RivalPlayerRefusal };
  updateRivalPlayer: (
    teamId: string,
    playerId: string,
    updates: Partial<RivalPlayerInput>
  ) => { ok: true } | { ok: false; reason: RivalPlayerRefusal };
  removeRivalPlayer: (teamId: string, playerId: string) => { ok: true } | { ok: false; reason: RivalPlayerRefusal };
}

const playerLabel = ({ dorsal, firstName, lastName }: RivalPlayerInput) => `#${dorsal} ${firstName} ${lastName}`;

/**
 * Runs the plan on `teamId` (null until CREATE_TEAM gives one). Returns the
 * refusal messages; a refused player action does not stop the rest, a refused
 * team creation stops everything.
 */
export function applyRosterOperations(
  operations: readonly RosterOperation[],
  teamId: string | null,
  actions: RosterActions
): string[] {
  const refusals: string[] = [];
  let targetId = teamId;
  for (const operation of operations) {
    if (operation.type === 'CREATE_TEAM') {
      const created = actions.createRivalTeam({ divisionId: operation.divisionId, name: operation.name });
      if (!created.ok) return [...refusals, RIVAL_TEAM_REFUSAL_MESSAGES[created.reason]];
      targetId = created.id;
      continue;
    }
    if (!targetId) return [...refusals, RIVAL_TEAM_REFUSAL_MESSAGES.RIVAL_TEAM_NOT_FOUND];

    if (operation.type === 'REMOVE_PLAYER') {
      const result = actions.removeRivalPlayer(targetId, operation.playerId);
      if (!result.ok) refusals.push(RIVAL_PLAYER_REFUSAL_MESSAGES[result.reason]);
      continue;
    }
    const result =
      operation.type === 'UPDATE_PLAYER'
        ? actions.updateRivalPlayer(targetId, operation.playerId, operation.player)
        : actions.addRivalPlayer(targetId, operation.player);
    if (!result.ok) refusals.push(`${playerLabel(operation.player)}: ${RIVAL_PLAYER_REFUSAL_MESSAGES[result.reason]}`);
  }
  return refusals;
}
