import type { EditHandoffPort, HandoffEdit, KeyValueStoragePort } from './tab-coordinator';

export type { HandoffEdit } from './tab-coordinator';

/**
 * =============================================================================
 * HOOP OS - FOLLOWER EDITS SURVIVE THEIR TAB (S13.3, T14)
 * A follower tab keeps the edits no leader acknowledged yet in localStorage,
 * one key per tab (`hoop-sync-handoff:<tabId>`, so tabs never overwrite each
 * other's list). The next tab to lead drains every key of the same user and
 * enqueues those edits, so an edit made while no tab led is not lost when its
 * tab closes. Edits left by another user are discarded, never pushed. The
 * leader forgets each edit it applies, so a tab that closes before receiving
 * the acknowledgement does not leave it behind to be replayed later.
 * =============================================================================
 */

export const HANDOFF_KEY_PREFIX = 'hoop-sync-handoff:';
/** Bumped when the stored shape changes: another app version's entries are left alone. */
const HANDOFF_VERSION = 1;

interface StoredHandoff {
  v: number;
  owner: string | null;
  /** When the list was saved: older lists are applied first. */
  savedAt: number;
  edits: HandoffEdit[];
}

export interface EditHandoffDeps {
  storage: KeyValueStoragePort;
  tabId: string;
  /** Id of the logged-in user. */
  owner: () => string | null;
  now: () => number;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isHandoffEdit = (value: unknown): value is HandoffEdit =>
  isObject(value) &&
  typeof value.id === 'string' &&
  (value.madeAt === undefined || typeof value.madeAt === 'number') &&
  isObject(value.diff) &&
  Array.isArray(value.diff.records) &&
  Array.isArray(value.diff.events);

/** A list stored by this app version, or null. */
function parseStoredHandoff(raw: string | null): StoredHandoff | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isObject(value) || value.v !== HANDOFF_VERSION) return null;
    const { owner, savedAt, edits } = value;
    const valid =
      (owner === null || typeof owner === 'string') &&
      typeof savedAt === 'number' &&
      Array.isArray(edits) &&
      edits.every(isHandoffEdit);
    return valid ? (value as unknown as StoredHandoff) : null;
  } catch {
    return null;
  }
}

export function createEditHandoff({ storage, tabId, owner, now }: EditHandoffDeps): EditHandoffPort {
  const ownKey = `${HANDOFF_KEY_PREFIX}${tabId}`;
  return {
    save(edits) {
      if (edits.length === 0) {
        storage.removeItem(ownKey);
        return;
      }
      const stored: StoredHandoff = { v: HANDOFF_VERSION, owner: owner(), savedAt: now(), edits: [...edits] };
      storage.setItem(ownKey, JSON.stringify(stored));
    },

    forget(editId) {
      for (const key of storage.keys().filter((name) => name.startsWith(HANDOFF_KEY_PREFIX))) {
        const stored = parseStoredHandoff(storage.getItem(key));
        if (!stored || !stored.edits.some((entry) => entry.id === editId)) continue;
        const edits = stored.edits.filter((entry) => entry.id !== editId);
        if (edits.length === 0) storage.removeItem(key);
        else storage.setItem(key, JSON.stringify({ ...stored, edits } satisfies StoredHandoff));
      }
    },

    drain() {
      const currentOwner = owner();
      const lists: StoredHandoff[] = [];
      for (const key of storage.keys().filter((name) => name.startsWith(HANDOFF_KEY_PREFIX))) {
        const stored = parseStoredHandoff(storage.getItem(key));
        if (!stored) continue;
        storage.removeItem(key);
        if (stored.owner === currentOwner) lists.push(stored);
      }
      return lists.sort((a, b) => a.savedAt - b.savedAt).flatMap((list) => list.edits);
    },
  };
}
