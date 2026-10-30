import { countPending, createEmptyOutbox } from './outbox';
import type { SyncOwner, SyncPersistedData } from './sync-types';

export type SyncOwnership =
  | { action: 'keep'; patch: Pick<SyncPersistedData, 'owner'> }
  | {
      action: 'discard';
      previousOwner: SyncOwner;
      /** Pending changes of the previous owner that will never be pushed. */
      discardedCount: number;
      patch: Pick<SyncPersistedData, 'owner' | 'cursor' | 'versions' | 'outbox'>;
    };

/**
 * Who the device sync data belongs to once `user` authenticates (shared tablet).
 * The outbox holds changes made under an earlier session: pushing them with a
 * different user's cookie would attribute (and authorize) them as that user. So
 * a different user discards them and resyncs from a full snapshot; the same user
 * (back after a 401) or unowned data (first login) keeps the outbox to flush it.
 */
export function resolveSyncOwnership(
  state: Pick<SyncPersistedData, 'owner' | 'outbox'>,
  user: SyncOwner
): SyncOwnership {
  const owner: SyncOwner = { id: user.id, name: user.name };
  if (!state.owner || state.owner.id === user.id) return { action: 'keep', patch: { owner } };
  return {
    action: 'discard',
    previousOwner: state.owner,
    discardedCount: countPending(state.outbox),
    patch: { owner, cursor: null, versions: {}, outbox: createEmptyOutbox() },
  };
}
