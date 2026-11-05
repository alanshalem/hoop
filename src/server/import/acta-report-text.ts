import 'server-only';
import { QuarterSchema } from '@/core/domain/entities/match.types';
import { ActaImportError } from './acta-import-error';

/** Text of one report PDF (`pdftotext -layout`): teams, final score and points per period. */

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
