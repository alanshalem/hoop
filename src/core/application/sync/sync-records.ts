import type { Match, PlayByPlayEvent } from '@/core/domain/entities/match.types';
import type { MatchRecord, SyncRecordKind } from './sync-types';

/** Outbox and versions key of a record (ids of different kinds may collide). */
export function recordKey(kind: SyncRecordKind, id: string): string {
  return `${kind}:${id}`;
}

/** Match metadata without the play-by-play (events sync separately). */
export function toMatchRecord(match: Match): MatchRecord {
  const record: Partial<Match> = { ...match };
  delete record.events;
  return record as MatchRecord;
}

export function timeOf(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** Play-by-play order shared by every device: timestamp, then id. */
export function compareEventsByTime(a: PlayByPlayEvent, b: PlayByPlayEvent): number {
  const byTime = timeOf(a.timestamp) - timeOf(b.timestamp);
  if (byTime !== 0) return byTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}
