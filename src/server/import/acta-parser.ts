import 'server-only';
import type { Division, DivisionCategory, GenderCategory, Player, Team } from '@/core/domain/entities/club.types';
import type { Coach } from '@/core/domain/entities/coach.types';
import {
  OfficialResultSchema,
  QuarterSchema,
  type Match,
  type MatchCondition,
  type ScoreSnapshot,
} from '@/core/domain/entities/match.types';
import type { RivalPlayer, RivalTeam } from '@/core/domain/entities/rival.types';
import { createMatch } from '@/core/application/use-cases/match-use-cases';
import { CLUB_PROFILE } from '@/core/domain/club-profile';

/**
 * =============================================================================
 * HOOP - OFFICIAL MATCH REPORT IMPORT (pure)
 * Turns the CSV extracted from the official match reports (one row per listed
 * player) and the text of each report PDF (`pdftotext -layout`, for the points
 * per period) into club records. Nothing is invented: players keep the name,
 * license and number of the reports, and matches get no plays. Any
 * inconsistency fails the whole import with every problem found.
 * The data is personal: it is read at import time and never committed (L6).
 * =============================================================================
 */

export class ActaImportError extends Error {
  constructor(readonly problems: string[]) {
    super(`The match reports cannot be imported:\n- ${problems.join('\n- ')}`);
    this.name = 'ActaImportError';
  }
}

const CSV_COLUMNS = {
  matchId: 'Partido_ID',
  round: 'Jornada',
  date: 'Fecha',
  time: 'Hora',
  home: 'Local',
  homePoints: 'Pts_Local',
  away: 'Visitante',
  awayPoints: 'Pts_Visitante',
  venue: 'Estadio',
  competition: 'Competencia',
  category: 'Categoria',
  team: 'Equipo',
  isRival: 'Es_rival',
  license: 'Lic',
  player: 'Jugador',
  number: 'Numero',
  headCoach: 'Entrenador',
  assistantCoach: 'Ayudante',
} as const;

type CsvField = keyof typeof CSV_COLUMNS;

/** One listed player of one match report; values trimmed, `line` counts the header as line 1. */
export type ActaCsvRow = Record<CsvField, string> & { line: number };

/** Match-level columns, repeated on every row of a match. */
const MATCH_FIELDS = [
  'round',
  'date',
  'time',
  'home',
  'homePoints',
  'away',
  'awayPoints',
  'venue',
  'competition',
  'category',
] as const satisfies readonly CsvField[];

const ID_PREFIX = 'acta';
/** Fixed offset of America/Argentina/Buenos_Aires (no daylight saving time). */
const REPORT_UTC_OFFSET = '-03:00';

// -----------------------------------------------------------------------------
// CSV
// -----------------------------------------------------------------------------

/** RFC 4180 records with `;` as separator (quoted fields may hold `;`, `""` and newlines). */
function readCsvRecords(text: string): { line: number; fields: string[] }[] {
  const records: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ';') {
      fields.push(field);
      field = '';
    } else if (char === '\n') {
      fields.push(field);
      records.push({ line: recordLine, fields });
      fields = [];
      field = '';
      line += 1;
      recordLine = line;
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (quoted) throw new ActaImportError([`CSV line ${recordLine}: unterminated quoted field`]);
  if (field !== '' || fields.length > 0) {
    fields.push(field);
    records.push({ line: recordLine, fields });
  }
  return records.filter((record) => record.fields.some((value) => value.trim() !== ''));
}

/** Parses the report CSV (UTF-8, optional BOM). Throws `ActaImportError` on a bad header or row shape. */
export function parseActaCsv(text: string): ActaCsvRow[] {
  const [header, ...records] = readCsvRecords(text.replace(/^\uFEFF/, ''));
  const names = (header?.fields ?? []).map((name) => name.trim());
  const missing = Object.values(CSV_COLUMNS).filter((column) => !names.includes(column));
  if (missing.length > 0) throw new ActaImportError([`CSV header: missing columns ${missing.join(', ')}`]);

  const problems: string[] = [];
  const rows: ActaCsvRow[] = [];
  for (const { line, fields } of records) {
    if (fields.length !== names.length) {
      problems.push(`CSV line ${line}: expected ${names.length} fields, found ${fields.length}`);
      continue;
    }
    const row = { line } as ActaCsvRow;
    for (const [field, column] of Object.entries(CSV_COLUMNS) as [CsvField, string][]) {
      row[field] = fields[names.indexOf(column)].trim();
    }
    rows.push(row);
  }
  if (problems.length > 0) throw new ActaImportError(problems);
  return rows;
}

// -----------------------------------------------------------------------------
// REPORT TEXT (pdftotext -layout)
// -----------------------------------------------------------------------------

/** Score of one period as printed: `a` for Equipo A, `b` for Equipo B. */
export interface ReportPeriod {
  a: number;
  b: number;
}

/** A player line of the report: license and name as printed ("SURNAME,INITIALS"). */
export interface ReportPlayer {
  license: string;
  name: string;
}

export interface ActaReport {
  matchId: string;
  teamA: string;
  teamB: string;
  finalA: number;
  finalB: number;
  /** Players listed by both teams, in reading order (used to complete CSV names). */
  players: ReportPlayer[];
  /** Q1-Q4, then the overtimes that were played. */
  periods: ReportPeriod[];
}

const NOT_PLAYED = '--';

/** "082 SURNAME,I.   5 X ...": license, then the name up to the first run of spaces. */
const REPORT_PLAYER_LINE = /^\s*(\d{1,4}) (\S+(?: \S+)*?)(?: \(CAP\))?(?: {2,}.*)?$/;

function readReportPlayers(text: string): ReportPlayer[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = REPORT_PLAYER_LINE.exec(line);
    return match && match[2].includes(',') ? [{ license: match[1], name: match[2] }] : [];
  });
}

/**
 * Reads the match number, teams, final score and points per period of one
 * report. `pdftotext` separates the "Cuarto N" labels from their scores, so
 * the "A: n B: n" pairs after "Tanteos:" are taken in reading order: Q1-Q4,
 * then overtimes ("--" = not played).
 */
export function parseActaReportText(text: string): ActaReport {
  const problems: string[] = [];
  const matchId = /Partido n\S*\s*:\s*(\d+)/.exec(text)?.[1];
  const label = matchId ? `Match ${matchId}` : 'Match report';
  if (!matchId) problems.push(`${label}: no match number (Partido nº)`);

  const teamsLine = text
    .split(/\r?\n/)
    .find((line) => /Equipo A:.*Equipo B:/.test(line) && !/Tanteo final/i.test(line));
  // Long names leave a single space before "Equipo B:".
  const teams = teamsLine ? /Equipo A:\s*(.+?)\s+Equipo B:\s*(.+?)\s*$/.exec(teamsLine) : null;
  if (!teams) problems.push(`${label}: no team names (Equipo A / Equipo B)`);

  const final = /Tanteo final:\s*Equipo A:\s*(\d+)\s+Equipo B:\s*(\d+)/.exec(text);
  if (!final) problems.push(`${label}: no final score (Tanteo final)`);

  const start = text.indexOf('Tanteos:');
  const periods: ReportPeriod[] = [];
  if (start < 0) {
    problems.push(`${label}: no points per quarter (Tanteos)`);
  } else {
    const block = text.slice(start, final && final.index > start ? final.index : undefined);
    const pairs = [...block.matchAll(/A:\s*(--|\d+)\s+B:\s*(--|\d+)/g)].map((pair) => [pair[1], pair[2]] as const);
    if (pairs.length < 4) problems.push(`${label}: found ${pairs.length} quarter scores, expected at least 4`);
    pairs.forEach(([a, b], index) => {
      const played = a !== NOT_PLAYED && b !== NOT_PLAYED;
      if (index < 4 && !played) problems.push(`${label}: quarter ${index + 1} has no score`);
      else if (!played && a !== b) problems.push(`${label}: overtime ${index - 3} has a score for one team only`);
      else if (played) periods.push({ a: Number(a), b: Number(b) });
    });
    if (periods.length > QuarterSchema.options.length) {
      problems.push(`${label}: ${periods.length} periods, at most ${QuarterSchema.options.length} are supported`);
    }
  }

  if (problems.length > 0 || !matchId || !teams || !final) throw new ActaImportError(problems);
  return {
    matchId,
    teamA: teams[1],
    teamB: teams[2],
    finalA: Number(final[1]),
    finalB: Number(final[2]),
    players: readReportPlayers(text),
    periods,
  };
}

// -----------------------------------------------------------------------------
// RECORDS
// -----------------------------------------------------------------------------

export interface ActaMatchSummary {
  matchId: string;
  round: number;
  /** As printed on the report: local date (YYYY-MM-DD) and time. */
  localDate: string;
  time: string;
  home: string;
  away: string;
  homePoints: number;
  awayPoints: number;
  /** Points per period, home - away (Q1-Q4, then overtimes). */
  quarters: ScoreSnapshot[];
}

/** Own players listed with the same number: kept (own dorsals need not be unique). */
export interface SharedDorsal {
  teamName: string;
  dorsal: number;
  players: string[];
}

/** A rival player whose number was taken by a teammate (rival dorsals are unique per team). */
export interface ReassignedDorsal {
  teamName: string;
  player: string;
  wanted: number;
  assigned: number;
  heldBy: string;
}

/** A CSV name without initials, completed from the player list of its report. */
export interface CompletedName {
  teamName: string;
  matchId: string;
  player: string;
  completed: string;
}

/** A player listed with several numbers across reports, most frequent first. */
export interface NumberVariant {
  teamName: string;
  player: string;
  numbers: number[];
}

export interface ActaImport {
  division: Division;
  team: Team;
  players: Player[];
  coaches: Coach[];
  rivalTeams: RivalTeam[];
  matches: Match[];
  report: {
    matches: ActaMatchSummary[];
    sharedDorsals: SharedDorsal[];
    reassignedDorsals: ReassignedDorsal[];
    numberVariants: NumberVariant[];
    completedNames: CompletedName[];
  };
}

export interface ActaImportOptions {
  clubId: string;
  season: string;
}

/** Comparable form of a name: no accents, upper case, single spaces. */
function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function slug(value: string): string {
  return normalizeName(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** "LIGA METROPOLITANA 2026 (Febamba)" -> "Liga Metropolitana 2026 (Febamba)": only all-caps words change. */
function titleCaseUpperWords(value: string): string {
  return value.replace(/\p{Lu}{2,}/gu, (word) => word[0] + word.slice(1).toLowerCase());
}

/** "SURNAME, INITIALS" as printed on the report. */
function splitPlayerName(name: string): { lastName: string; firstName: string } | null {
  const comma = name.indexOf(',');
  if (comma < 0) return null;
  const lastName = name.slice(0, comma).trim();
  const firstName = name.slice(comma + 1).trim();
  return lastName && firstName ? { lastName, firstName } : null;
}

/** "SURNAME, I. (090)" -> name and license; the license is optional. */
function parseStaff(value: string): { name: string; license?: string } | null {
  if (!value) return null;
  const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(value);
  return match ? { name: match[1].trim(), license: match[2].trim() } : { name: value.trim() };
}

function parseCount(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}

function parseKickoff(date: string, time: string): { iso: string; localDate: string } | null {
  const day = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!day || !clock) return null;
  const localDate = `${day[3]}-${day[2]}-${day[1]}`;
  const kickoff = new Date(`${localDate}T${clock[1]}:${clock[2]}:00${REPORT_UTC_OFFSET}`);
  if (Number.isNaN(kickoff.getTime())) return null;
  // Reject impossible days that Date would roll over (31/02).
  const check = new Date(kickoff.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return check === localDate ? { iso: kickoff.toISOString(), localDate } : null;
}

/** Numbers by frequency (most frequent first, ties by the lowest number). */
function numberPreference(numbers: readonly number[]): number[] {
  const counts = new Map<number, number>();
  for (const number of numbers) counts.set(number, (counts.get(number) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a - b);
}

function countOf(numbers: readonly number[], number: number): number {
  return numbers.filter((n) => n === number).length;
}

interface ListedPlayer {
  key: string;
  license: string;
  name: string;
  lastName: string;
  firstName: string;
  /** Number of each listing, in CSV order. */
  numbers: number[];
}

const playerLabel = (player: Pick<ListedPlayer, 'license' | 'name'>) =>
  player.license ? `${player.license} ${player.name}` : player.name;

/** Players of one team deduped by license (by name when the license is missing), in first-listing order. */
class Roster {
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
function assignRivalDorsals(roster: Roster): { dorsals: Map<string, number>; reassigned: ReassignedDorsal[] } {
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

interface MatchRows {
  matchId: string;
  rows: ActaCsvRow[];
}

function groupByMatch(rows: readonly ActaCsvRow[], problems: string[]): MatchRows[] {
  const groups = new Map<string, ActaCsvRow[]>();
  for (const row of rows) {
    if (!/^\d+$/.test(row.matchId)) {
      problems.push(`CSV line ${row.line}: match number "${row.matchId}" is not numeric`);
      continue;
    }
    const group = groups.get(row.matchId);
    if (group) group.push(row);
    else groups.set(row.matchId, [row]);
  }
  for (const [matchId, group] of groups) {
    const [first] = group;
    for (const row of group.slice(1)) {
      const differing = MATCH_FIELDS.filter((field) => row[field] !== first[field]);
      if (differing.length > 0) {
        problems.push(
          `Match ${matchId}: CSV line ${row.line} disagrees on ${differing.map((f) => CSV_COLUMNS[f]).join(', ')}`
        );
      }
    }
  }
  return [...groups].map(([matchId, group]) => ({ matchId, rows: group }));
}

/** "PRE FEDERAL MASCULINO (Primera)" -> the Primera division, described as PRE FEDERAL MASCULINO. */
function buildDivision(category: string, clubId: string): Division {
  const parts = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(category);
  const name = parts ? parts[2].trim() : category;
  const description = parts ? parts[1].trim() : undefined;
  const gender: GenderCategory = /FEMENIN/i.test(category) ? 'FEMALE' : /MASCULIN/i.test(category) ? 'MALE' : 'MIXED';
  const divisionCategory: DivisionCategory = slug(name) === 'primera' ? 'PRIMERA' : 'CUSTOM';
  return {
    id: `${ID_PREFIX}-div-${slug(name)}`,
    name,
    category: divisionCategory,
    gender,
    clubId,
    ...(description ? { description } : {}),
  };
}

interface StaffTally {
  name: string;
  license?: string;
  matches: number;
}

function tallyStaff(values: readonly string[]): StaffTally[] {
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
function completeFromReport(row: ActaCsvRow, report: ActaReport | undefined): string | null {
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

/**
 * Builds the club records of the reports: the division of the CSV category,
 * the own team with its players and coaches, one rival team per opponent and
 * one finished match per report with its official result.
 */
export function buildActaImport(
  rows: readonly ActaCsvRow[],
  reports: readonly ActaReport[],
  options: ActaImportOptions = { clubId: CLUB_PROFILE.id, season: CLUB_PROFILE.season }
): ActaImport {
  const problems: string[] = [];
  const fail = (): never => {
    throw new ActaImportError(problems);
  };
  const { clubId, season } = options;

  for (const row of rows) {
    if (row.isRival !== 'Si' && row.isRival !== 'No') {
      problems.push(`CSV line ${row.line}: Es_rival must be "Si" or "No", found "${row.isRival}"`);
    }
  }
  const matchRows = groupByMatch(rows, problems);
  const ownNames = [...new Set(rows.filter((row) => row.isRival === 'No').map((row) => row.team))];
  if (ownNames.length !== 1) {
    problems.push(`CSV: expected one own team (Es_rival = No), found ${ownNames.length}: ${ownNames.join(', ')}`);
  }
  const categories = [...new Set(rows.map((row) => row.category))];
  if (categories.length !== 1) {
    problems.push(`CSV: expected one category, found ${categories.length}: ${categories.join(', ')}`);
  }
  if (problems.length > 0) fail();

  const ownTeamName = ownNames[0];
  const division = buildDivision(categories[0], clubId);
  const teamId = `${ID_PREFIX}-team-${slug(division.name)}`;
  const ownRoster = new Roster(ownTeamName);
  const rivalRosters = new Map<string, Roster>();
  const reportsById = new Map<string, ActaReport>();
  for (const report of reports) {
    if (reportsById.has(report.matchId)) problems.push(`Match ${report.matchId}: more than one report`);
    reportsById.set(report.matchId, report);
  }

  interface PlannedMatch {
    matchId: string;
    first: ActaCsvRow;
    condition: MatchCondition;
    rivalName: string;
    kickoff: { iso: string; localDate: string };
    round: number;
    homePoints: number;
    awayPoints: number;
    roster: ListedPlayer[];
    quarters: ScoreSnapshot[];
  }
  const planned: PlannedMatch[] = [];
  const headCoaches: string[] = [];
  const assistantCoaches: string[] = [];
  const completedNames: CompletedName[] = [];

  for (const { matchId, rows: group } of matchRows) {
    const [first] = group;
    const label = `Match ${matchId}`;
    const condition: MatchCondition | null =
      first.home === ownTeamName ? 'HOME' : first.away === ownTeamName ? 'AWAY' : null;
    const kickoff = parseKickoff(first.date, first.time);
    const round = parseCount(first.round);
    const homePoints = parseCount(first.homePoints);
    const awayPoints = parseCount(first.awayPoints);
    if (!condition) problems.push(`${label}: ${ownTeamName} is neither Local nor Visitante`);
    if (!kickoff) problems.push(`${label}: date "${first.date} ${first.time}" is not DD/MM/YYYY HH:MM`);
    if (round === null) problems.push(`${label}: Jornada "${first.round}" is not a number`);
    if (homePoints === null || awayPoints === null) problems.push(`${label}: the CSV score is not numeric`);
    if (!condition || !kickoff || round === null || homePoints === null || awayPoints === null) continue;

    const rivalName = condition === 'HOME' ? first.away : first.home;
    const rivalRoster = rivalRosters.get(rivalName) ?? new Roster(rivalName);
    rivalRosters.set(rivalName, rivalRoster);
    const report = reportsById.get(matchId);
    const roster: ListedPlayer[] = [];
    for (const row of group) {
      const own = row.isRival === 'No';
      if (row.team !== (own ? ownTeamName : rivalName)) {
        problems.push(`CSV line ${row.line}: team "${row.team}" does not play match ${matchId}`);
        continue;
      }
      const completed = completeFromReport(row, report);
      const player = (own ? ownRoster : rivalRoster).add(row, completed ?? row.player, problems);
      if (completed && player) {
        const label = row.license ? `${row.license} ${row.player}` : row.player;
        if (!completedNames.some((c) => c.teamName === row.team && c.player === label)) {
          completedNames.push({ teamName: row.team, matchId, player: label, completed });
        }
      }
      if (own && player && !roster.includes(player)) roster.push(player);
    }
    const ownRow = group.find((row) => row.isRival === 'No');
    if (ownRow) {
      headCoaches.push(ownRow.headCoach);
      assistantCoaches.push(ownRow.assistantCoach);
    }

    if (!report) {
      problems.push(`${label}: no match report`);
      continue;
    }
    const ownName = normalizeName(ownTeamName);
    const ownIsA = normalizeName(report.teamA).includes(ownName);
    const ownIsB = normalizeName(report.teamB).includes(ownName);
    if (ownIsA === ownIsB) {
      problems.push(`${label}: the report names "${ownTeamName}" on ${ownIsA ? 'both' : 'neither'} Equipo A ${ownIsA ? 'and' : 'nor'} Equipo B`);
      continue;
    }
    // Equipo A is the home side when it is the own team playing at home, or the rival playing at home.
    const homeIsA = ownIsA === (condition === 'HOME');
    const reportHome = homeIsA ? report.finalA : report.finalB;
    const reportAway = homeIsA ? report.finalB : report.finalA;
    if (reportHome !== homePoints || reportAway !== awayPoints) {
      problems.push(
        `${label}: the report final (${report.finalA}-${report.finalB}) does not match the CSV score (${homePoints}-${awayPoints})`
      );
      continue;
    }
    const sumA = report.periods.reduce((total, period) => total + period.a, 0);
    const sumB = report.periods.reduce((total, period) => total + period.b, 0);
    if (sumA !== report.finalA) {
      problems.push(`${label}: quarters of Equipo A add up to ${sumA}, the final score is ${report.finalA}`);
    }
    if (sumB !== report.finalB) {
      problems.push(`${label}: quarters of Equipo B add up to ${sumB}, the final score is ${report.finalB}`);
    }
    if (sumA !== report.finalA || sumB !== report.finalB) continue;
    const quarters = report.periods.map(({ a, b }) => (homeIsA ? { home: a, away: b } : { home: b, away: a }));
    planned.push({ matchId, first, condition, rivalName, kickoff, round, homePoints, awayPoints, roster, quarters });
  }
  const csvMatchIds = new Set(matchRows.map((group) => group.matchId));
  for (const report of reports) {
    if (!csvMatchIds.has(report.matchId)) problems.push(`Match ${report.matchId}: report without CSV rows`);
  }

  const rivalTeamIds = new Map<string, string>();
  for (const name of rivalRosters.keys()) {
    const id = `${ID_PREFIX}-rival-${slug(name)}`;
    const clash = [...rivalTeamIds].find(([, other]) => other === id);
    if (clash) problems.push(`Rival teams "${clash[0]}" and "${name}" have the same name once normalized`);
    rivalTeamIds.set(name, id);
  }
  if (problems.length > 0) fail();

  const playerId = (player: ListedPlayer) => `${ID_PREFIX}-player-${slug(player.key)}`;
  const ownPlayers = [...ownRoster.players.values()];
  const players: Player[] = ownPlayers.map((player) => ({
    id: playerId(player),
    firstName: player.firstName,
    lastName: player.lastName,
    dorsal: numberPreference(player.numbers)[0],
    dominantHand: 'RIGHT',
    status: 'ACTIVE',
    teamId,
    clubId,
    ...(player.license ? { license: player.license } : {}),
  }));

  const byDorsal = new Map<number, string[]>();
  players.forEach((player, index) => {
    const labels = byDorsal.get(player.dorsal) ?? [];
    labels.push(playerLabel(ownPlayers[index]));
    byDorsal.set(player.dorsal, labels);
  });
  const sharedDorsals: SharedDorsal[] = [...byDorsal]
    .filter(([, labels]) => labels.length > 1)
    .sort(([a], [b]) => a - b)
    .map(([dorsal, labels]) => ({ teamName: ownTeamName, dorsal, players: labels }));

  const reassignedDorsals: ReassignedDorsal[] = [];
  const rivalTeams: RivalTeam[] = [...rivalRosters].map(([name, roster]) => {
    const id = rivalTeamIds.get(name) ?? '';
    const { dorsals, reassigned } = assignRivalDorsals(roster);
    reassignedDorsals.push(...reassigned);
    const rivalPlayers: RivalPlayer[] = [...roster.players.values()].map((player) => ({
      id: `${id}-${slug(player.key)}`,
      dorsal: dorsals.get(player.key) ?? 0,
      firstName: player.firstName,
      lastName: player.lastName,
    }));
    return { id, clubId, divisionId: division.id, name, players: rivalPlayers };
  });

  const coachId = (staff: StaffTally) => `${ID_PREFIX}-coach-${slug(staff.license ?? staff.name)}`;
  const heads = tallyStaff(headCoaches);
  const headIds = new Set(heads.map(coachId));
  const assistants = tallyStaff(assistantCoaches).filter((staff) => !headIds.has(coachId(staff)));
  const toCoach = (staff: StaffTally, role: Coach['role']): Coach => ({
    id: coachId(staff),
    clubId,
    name: staff.name,
    role,
    ...(staff.license ? { license: staff.license } : {}),
  });
  const coaches = [...heads.map((staff) => toCoach(staff, 'HEAD')), ...assistants.map((staff) => toCoach(staff, 'ASSISTANT'))];

  const team: Team = {
    id: teamId,
    name: ownTeamName,
    divisionId: division.id,
    season,
    ...(heads[0] ? { headCoachId: coachId(heads[0]) } : {}),
    assistantCoachIds: assistants.map(coachId),
    playerIds: players.map((player) => player.id),
    clubId,
  };

  const matches = planned.map((plan) => {
    const officialResult = OfficialResultSchema.parse({
      home: plan.homePoints,
      away: plan.awayPoints,
      quarters: plan.quarters,
    });
    return createMatch(
      {
        clubId,
        divisionId: division.id,
        ownTeamId: teamId,
        ownTeamName,
        rivalTeamName: plan.rivalName,
        date: plan.kickoff.iso,
        condition: plan.condition,
        tournament: `${titleCaseUpperWords(plan.first.competition)} - Fecha ${plan.round}`,
        venue: plan.first.venue,
        status: 'FINISHED',
        currentQuarter: QuarterSchema.options[plan.quarters.length - 1],
        quarterTimeRemainingSeconds: 0,
        rosterOwnPlayerIds: plan.roster.map(playerId),
        officialResult,
      },
      { id: `${ID_PREFIX}-match-${plan.matchId}` }
    );
  });

  return {
    division,
    team,
    players,
    coaches,
    rivalTeams,
    matches,
    report: {
      matches: planned.map((plan) => ({
        matchId: plan.matchId,
        round: plan.round,
        localDate: plan.kickoff.localDate,
        time: plan.first.time,
        home: plan.first.home,
        away: plan.first.away,
        homePoints: plan.homePoints,
        awayPoints: plan.awayPoints,
        quarters: plan.quarters,
      })),
      sharedDorsals,
      reassignedDorsals,
      numberVariants: [ownRoster, ...rivalRosters.values()].flatMap((roster) => roster.numberVariants()),
      completedNames,
    },
  };
}

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------

function formatPeriods(quarters: readonly ScoreSnapshot[]): string {
  return quarters
    .map(({ home, away }, index) => `${index === 4 ? 'OT ' : ''}${home}-${away}`)
    .join(' ');
}

/** Human-readable summary of what the import writes (dry run and real run). */
export function formatActaImportSummary(data: ActaImport): string {
  const { report } = data;
  const rivalPlayers = data.rivalTeams.reduce((total, team) => total + team.players.length, 0);
  const lines = [
    'Records:',
    '  divisions: 1',
    '  teams: 1',
    `  players: ${data.players.length}`,
    `  coaches: ${data.coaches.length} (${data.coaches.map((c) => `${c.name} ${c.license ?? ''} ${c.role}`.replace(/\s+/g, ' ')).join('; ')})`,
    `  rival teams: ${data.rivalTeams.length} (rival players: ${rivalPlayers})`,
    `  matches: ${data.matches.length}`,
    'Matches (final and points per period, home - away):',
    ...report.matches.map(
      (m) =>
        `  ${m.matchId} Fecha ${m.round} ${m.localDate} ${m.time} ${m.home} ${m.homePoints} - ${m.awayPoints} ${m.away} | ${formatPeriods(m.quarters)} | quarters OK`
    ),
    'Shared own dorsals (kept):',
    ...(report.sharedDorsals.length > 0
      ? report.sharedDorsals.map((s) => `  ${s.teamName} #${s.dorsal}: ${s.players.join(', ')}`)
      : ['  none']),
    'Reassigned rival dorsals:',
    ...(report.reassignedDorsals.length > 0
      ? report.reassignedDorsals.map(
          (r) => `  ${r.teamName}: ${r.player} wanted #${r.wanted} (held by ${r.heldBy}), got #${r.assigned}`
        )
      : ['  none']),
    'Names completed from the reports:',
    ...(report.completedNames.length > 0
      ? report.completedNames.map((c) => `  ${c.teamName}: ${c.player} -> ${c.completed} (match ${c.matchId})`)
      : ['  none']),
    'Players listed with more than one number (most frequent first):',
    ...(report.numberVariants.length > 0
      ? report.numberVariants.map((v) => `  ${v.teamName}: ${v.player} ${v.numbers.map((n) => `#${n}`).join(', ')}`)
      : ['  none']),
  ];
  return lines.join('\n');
}
