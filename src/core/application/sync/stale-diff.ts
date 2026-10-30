import { readFieldVersions, versionKeyOf } from './match-fields';
import { recordKey, timeOf } from './sync-records';
import type { ClubDiff, RecordChange, VersionMap } from './sync-types';

/**
 * A club diff without the record changes the local versions already superseded
 * (S13.3): an edit handed over between tabs is replayed by the next leader with
 * the time it was made, so it never beats a newer local version (for example a
 * clock saved by a closing tab after the game moved on). Match changes keep only
 * the field groups that are still newer locally; event changes are kept as they
 * are, because events are append-only and tombstones always win.
 */
export function dropSupersededChanges(diff: ClubDiff, madeAtMs: number, versions: VersionMap): ClubDiff {
  const records = diff.records.flatMap((change) => {
    const fresh = withoutSupersededFields(change, madeAtMs, versions);
    return fresh ? [fresh] : [];
  });
  return { records, events: diff.events };
}

const isNewerOrSame = (version: string | undefined, madeAtMs: number) =>
  version !== undefined && timeOf(version) >= madeAtMs;

function withoutSupersededFields(change: RecordChange, madeAtMs: number, versions: VersionMap): RecordChange | null {
  if (change.kind !== 'match' || change.deleted || !change.changedFields) {
    return isNewerOrSame(versions[recordKey(change.kind, change.id)], madeAtMs) ? null : change;
  }
  const fieldVersions = readFieldVersions(versions, change.id);
  const changedFields = change.changedFields.filter((field) => !isNewerOrSame(fieldVersions[versionKeyOf(field)], madeAtMs));
  if (changedFields.length === 0) return null;
  return changedFields.length === change.changedFields.length ? change : { ...change, changedFields };
}
