import 'server-only';
import assert from 'node:assert';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import type { DatabaseConnection, DbExecutor } from '../db/client';
import * as schema from '../db/schema';

const POLL_INTERVAL_MS = 25;
const LOCK_WAIT_TIMEOUT_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls until the backend `waiterPid` waits on a lock held by the backend
 * `holderPid`. Returns false when `settled()` turns true first (the waiter
 * finished without waiting) or after ~10 s.
 */
export async function waitForLockWait(
  pool: Pool,
  waiterPid: number,
  holderPid: number,
  settled: () => boolean
): Promise<boolean> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  while (!settled() && Date.now() < deadline) {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock' AND $2 = ANY(pg_blocking_pids(pid))",
      [waiterPid, holderPid]
    );
    if (rowCount) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function clientPid(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  return rows[0].pid;
}

/**
 * Runs `change` inside a transaction that stays open until `overlap`, on a
 * connection of its own, waits on a lock that transaction holds; then commits
 * it. Fails when that wait is never observed: without it the two operations did
 * not overlap and the test would prove nothing.
 */
export async function overlapping<T, U>(
  connection: DatabaseConnection,
  change: (tx: DbExecutor) => Promise<T>,
  overlap: (db: DbExecutor) => Promise<U>
): Promise<[T, U]> {
  const client = await connection.pool.connect();
  try {
    const secondPid = await clientPid(client);
    let commitFirst = () => {};
    const firstMayCommit = new Promise<void>((resolve) => (commitFirst = resolve));
    let firstApplied: (applied: { pid: number; result: T }) => void = () => {};
    const applied = new Promise<{ pid: number; result: T }>((resolve) => (firstApplied = resolve));
    const firstTransaction = connection.db.transaction(async (tx) => {
      const { rows } = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
      firstApplied({ pid: rows[0].pid, result: await change(tx) });
      await firstMayCommit;
    });

    // A failing `change` rejects the transaction before `applied` ever resolves.
    const first = await Promise.race([applied, firstTransaction.then(() => applied)]);
    let secondSettled = false;
    const second = overlap(drizzle(client, { schema })).finally(() => (secondSettled = true));
    let waited = false;
    try {
      waited = await waitForLockWait(connection.pool, secondPid, first.pid, () => secondSettled);
    } finally {
      commitFirst();
    }
    await firstTransaction;
    const secondResult = await second;
    assert.ok(waited, 'The second operation never waited on a lock of the first transaction: they did not overlap.');
    return [first.result, secondResult];
  } finally {
    client.release();
  }
}
