import 'server-only';
import { ActaImportError } from './acta-import-error';

/** CSV extracted from the official match reports: one row per listed player. */

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

export interface MatchRows {
  matchId: string;
  rows: ActaCsvRow[];
}

export function groupByMatch(rows: readonly ActaCsvRow[], problems: string[]): MatchRows[] {
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
