import 'server-only';
import type { ActaCsvRow } from './acta-csv';
import type { NumberVariant, ReassignedDorsal } from './acta-import-types';
import type { ActaReport } from './acta-report-text';
import { countOf, normalizeName, numberPreference, parseCount, parseStaff, splitPlayerName } from './acta-values';

/** Players and staff of the reports: dedupe, dorsals and names completed from the report text. */

export interface ListedPlayer {
  key: string;
  license: string;
  name: string;
  lastName: string;
  firstName: string;
  /** Number of each listing, in CSV order. */
  numbers: number[];
}

export const playerLabel = (player: Pick<ListedPlayer, 'license' | 'name'>) =>
  player.license ? `${player.license} ${player.name}` : player.name;

/** Players of one team deduped by license (by name when the license is missing), in first-listing order. */
export class Roster {
  readonly players = new Map<string, ListedPlayer>();

  constructor(readonly teamName: string) {}

  /** `name`: the row name, completed from the report when the CSV lost the initials. */
  add(row: ActaCsvRow, name: string, problems: string[]): ListedPlayer | null {
    const number = parseCount(row.number);
    if (number === null || number > 99) {
      problems.push(`CSV line ${row.line}: number "${row.number}" is not 0-99`);
      return null;
    }
    const parts = splitPlayerName(name);
    if (!parts) {
      problems.push(`CSV line ${row.line}: player "${row.player}" is not "SURNAME, INITIALS"`);
      return null;
    }
    const key = row.license || `name:${normalizeName(name)}`;
    const known = this.players.get(key);
    if (known) {
      if (normalizeName(known.name) !== normalizeName(name)) {
        problems.push(`CSV line ${row.line}: license ${row.license} of ${this.teamName} is "${known.name}" elsewhere`);
      }
      known.numbers.push(number);
      return known;
    }
    const player: ListedPlayer = { key, license: row.license, name, ...parts, numbers: [number] };
    this.players.set(key, player);
    return player;
  }

  numberVariants(): NumberVariant[] {
    return [...this.players.values()]
      .map((player) => ({ teamName: this.teamName, player: playerLabel(player), numbers: numberPreference(player.numbers) }))
      .filter((variant) => variant.numbers.length > 1);
  }
}

/**
 * Unique dorsals for a rival roster: players claim their numbers by frequency;
 * the player listed most often with a number keeps it (then more listings,
 * then the lower license), the other takes its next listed number that is free,
 * else the lowest free number.
 */
export function assignRivalDorsals(roster: Roster): { dorsals: Map<string, number>; reassigned: ReassignedDorsal[] } {
  const players = [...roster.players.values()];
  const preference = new Map(players.map((player) => [player.key, numberPreference(player.numbers)]));
  const topCount = (player: ListedPlayer) => countOf(player.numbers, preference.get(player.key)?.[0] ?? -1);
  const order = [...players].sort(
    (a, b) =>
      topCount(b) - topCount(a) || b.numbers.length - a.numbers.length || a.key.localeCompare(b.key, 'en')
  );

  const holders = new Map<number, ListedPlayer>();
  const dorsals = new Map<string, number>();
  const reassigned: ReassignedDorsal[] = [];
  for (const player of order) {
    const wanted = preference.get(player.key) ?? [];
    let assigned = wanted.find((number) => !holders.has(number));
    if (assigned === undefined) {
      assigned = 0;
      while (holders.has(assigned)) assigned += 1;
    }
    holders.set(assigned, player);
    dorsals.set(player.key, assigned);
    if (assigned !== wanted[0]) {
      const holder = holders.get(wanted[0]);
      reassigned.push({
        teamName: roster.teamName,
        player: playerLabel(player),
        wanted: wanted[0],
        assigned,
        heldBy: holder ? playerLabel(holder) : '',
      });
    }
  }
  return { dorsals, reassigned };
}

export interface StaffTally {
  name: string;
  license?: string;
  matches: number;
}

export function tallyStaff(values: readonly string[]): StaffTally[] {
  const tally = new Map<string, StaffTally>();
  for (const value of values) {
    const staff = parseStaff(value);
    if (!staff) continue;
    const key = staff.license ?? normalizeName(staff.name);
    const known = tally.get(key);
    if (known) known.matches += 1;
    else tally.set(key, { ...staff, matches: 1 });
  }
  // Stable sort: equal counts keep their first-listing order.
  return [...tally.values()].sort((a, b) => b.matches - a.matches);
}

/**
 * The CSV loses the initials of some names ("SURNAME,"): the report of the
 * match lists the player with them ("SURNAME,I."), matched by license and surname.
 */
export function completeFromReport(row: ActaCsvRow, report: ActaReport | undefined): string | null {
  if (!report || splitPlayerName(row.player) || !/,\s*$/.test(row.player)) return null;
  const surname = normalizeName(row.player.replace(/,\s*$/, ''));
  for (const listed of report.players) {
    const parts = splitPlayerName(listed.name);
    if (listed.license === row.license && parts && normalizeName(parts.lastName) === surname) {
      return `${parts.lastName}, ${parts.firstName}`;
    }
  }
  return null;
}
