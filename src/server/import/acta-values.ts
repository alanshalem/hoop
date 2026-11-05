import 'server-only';

/** Value parsing and name normalization shared by the record builders. */

/** Fixed offset of America/Argentina/Buenos_Aires (no daylight saving time). */
const REPORT_UTC_OFFSET = '-03:00';

/** Comparable form of a name: no accents, upper case, single spaces. */
export function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

export function slug(value: string): string {
  return normalizeName(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** "LIGA METROPOLITANA 2026 (Febamba)" -> "Liga Metropolitana 2026 (Febamba)": only all-caps words change. */
export function titleCaseUpperWords(value: string): string {
  return value.replace(/\p{Lu}{2,}/gu, (word) => word[0] + word.slice(1).toLowerCase());
}

/** "SURNAME, INITIALS" as printed on the report. */
export function splitPlayerName(name: string): { lastName: string; firstName: string } | null {
  const comma = name.indexOf(',');
  if (comma < 0) return null;
  const lastName = name.slice(0, comma).trim();
  const firstName = name.slice(comma + 1).trim();
  return lastName && firstName ? { lastName, firstName } : null;
}

/** "SURNAME, I. (090)" -> name and license; the license is optional. */
export function parseStaff(value: string): { name: string; license?: string } | null {
  if (!value) return null;
  const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(value);
  return match ? { name: match[1].trim(), license: match[2].trim() } : { name: value.trim() };
}

export function parseCount(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}

export function parseKickoff(date: string, time: string): { iso: string; localDate: string } | null {
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
export function numberPreference(numbers: readonly number[]): number[] {
  const counts = new Map<number, number>();
  for (const number of numbers) counts.set(number, (counts.get(number) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a - b);
}

export function countOf(numbers: readonly number[], number: number): number {
  return numbers.filter((n) => n === number).length;
}
