import type { TimerPort } from './sync-engine';
import type { KeyValueStoragePort, LeaderLockPort, StorageEventsPort } from './tab-coordinator';

/**
 * =============================================================================
 * HOOP OS - LEADER LEASE IN localStorage (S13.3 without Web Locks)
 * Pages served over plain http on the club LAN have no Web Locks (they need a
 * secure context), so the leader tab is elected with a lease instead:
 * - the lease `{ tabId, expiresAt }` lives under SYNC_LEADER_LEASE_KEY;
 * - a tab claims it when it is missing or expired, and leads only if the claim
 *   is still its own after LEASE_SETTLE_MS (two tabs claiming together: the
 *   last write wins and the other one follows);
 * - the leader renews it every LEASE_RENEW_MS for LEASE_TTL_MS, so no other tab
 *   leads while it is valid;
 * - followers check it every LEASE_RENEW_MS and at once on a `storage` event
 *   (the leader released it: logout or the tab closing, see `pageHide`);
 * - a leader that finds a valid lease of another tab (its own expired while the
 *   tab was frozen or throttled) steps down (`onLost`).
 * =============================================================================
 */

export const SYNC_LEADER_LEASE_KEY = 'hoop-sync-leader-lease';
export const LEASE_RENEW_MS = 2_000;
export const LEASE_TTL_MS = 6_000;
export const LEASE_SETTLE_MS = 200;

interface Lease {
  tabId: string;
  expiresAt: number;
}

export interface LeaseLeaderLockDeps {
  storage: KeyValueStoragePort;
  storageEvents: StorageEventsPort;
  /** Unique per tab. */
  tabId: string;
  now: () => number;
  timers: TimerPort;
  /** The tab is going away: its lease is dropped so a follower takes over at once. */
  pageHide?: { subscribe(listener: () => void): () => void };
}

/** A lease written by this app version, or null (missing or unreadable). */
function parseLease(raw: string | null): Lease | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { tabId, expiresAt } = value as Record<string, unknown>;
    return typeof tabId === 'string' && typeof expiresAt === 'number' ? { tabId, expiresAt } : null;
  } catch {
    return null;
  }
}

export function createLeaseLeaderLock(deps: LeaseLeaderLockDeps): LeaderLockPort {
  const { storage, tabId, now, timers } = deps;

  const readLease = () => parseLease(storage.getItem(SYNC_LEADER_LEASE_KEY));
  const writeLease = () =>
    storage.setItem(SYNC_LEADER_LEASE_KEY, JSON.stringify({ tabId, expiresAt: now() + LEASE_TTL_MS } satisfies Lease));
  const heldByAnotherTab = (lease: Lease | null) => lease !== null && lease.tabId !== tabId && lease.expiresAt > now();

  return {
    request(onAcquired, onQueued, onLost) {
      let role: 'undecided' | 'follower' | 'leader' = 'undecided';
      let claiming = false;
      let released = false;
      let timer: unknown = null;

      const schedule = (step: () => void, ms: number) => {
        if (timer !== null) timers.clearTimeout(timer);
        timer = timers.setTimeout(() => {
          timer = null;
          step();
        }, ms);
      };

      const follow = () => {
        claiming = false;
        const previous = role;
        role = 'follower';
        if (previous === 'leader') onLost?.();
        else if (previous === 'undecided') onQueued();
        schedule(tryClaim, LEASE_RENEW_MS);
      };

      function tryClaim(): void {
        if (released) return;
        if (heldByAnotherTab(readLease())) {
          follow();
          return;
        }
        writeLease();
        claiming = true;
        schedule(confirmClaim, LEASE_SETTLE_MS);
      }

      function confirmClaim(): void {
        if (released) return;
        claiming = false;
        if (readLease()?.tabId !== tabId) {
          follow();
          return;
        }
        if (role !== 'leader') {
          role = 'leader';
          onAcquired();
        }
        schedule(renew, LEASE_RENEW_MS);
      }

      function renew(): void {
        if (released) return;
        if (heldByAnotherTab(readLease())) {
          follow();
          return;
        }
        writeLease();
        schedule(renew, LEASE_RENEW_MS);
      }

      const dropOwnLease = () => {
        if (readLease()?.tabId === tabId) storage.removeItem(SYNC_LEADER_LEASE_KEY);
      };

      const stopStorageEvents = deps.storageEvents.subscribe((key) => {
        // Followers react at once (the lease was released or replaced); the leader checks on renewal.
        if (key === SYNC_LEADER_LEASE_KEY && role !== 'leader' && !claiming && !released) tryClaim();
      });
      // Kept running: a page restored from the back/forward cache renews or re-claims it.
      const stopPageHide = deps.pageHide?.subscribe(() => {
        if (role === 'leader') dropOwnLease();
      });

      tryClaim();

      return () => {
        if (released) return;
        released = true;
        if (timer !== null) timers.clearTimeout(timer);
        timer = null;
        stopStorageEvents();
        stopPageHide?.();
        dropOwnLease();
      };
    },
  };
}
