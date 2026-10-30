import 'server-only';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing with Node's scrypt.
 * Encoded format: `scrypt$N$r$p$<salt base64url>$<hash base64url>`.
 */

const ALGORITHM = 'scrypt';
/** Current cost (OWASP: N = 2^17, r = 8, p = 1, about 128 MiB per hash). */
const COST = { N: 2 ** 17, r: 8, p: 1 } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * Bounds for parameters read from a stored hash: low enough to keep verifying
 * hashes written by earlier releases (N = 2^14), capped so a tampered row
 * cannot make a login allocate or spin without limit.
 */
const MIN_N = 2 ** 14;
const MAX_R = 16;
const MAX_P = 4;
/** scrypt uses about 128 * N * r bytes; at most twice the current cost. */
const MAX_MEMORY_BYTES = 2 * 128 * COST.N * COST.r;

interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

function deriveKey(password: string, salt: Buffer, keyLength: number, { N, r, p }: ScryptCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Node's default limit (32 MiB) is below what these costs need; allow twice the working set.
    const maxmem = 2 * 128 * N * r;
    scrypt(password, salt, keyLength, { N, r, p, maxmem }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, KEY_BYTES, COST);
  return [ALGORITHM, COST.N, COST.r, COST.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

interface ParsedHash {
  cost: ScryptCost;
  salt: Buffer;
  key: Buffer;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const POSITIVE_INTEGER = /^[1-9]\d{0,9}$/;

function parseCost(n: string, r: string, p: string): ScryptCost | null {
  if (![n, r, p].every((value) => POSITIVE_INTEGER.test(value))) return null;
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  const powerOfTwo = (cost.N & (cost.N - 1)) === 0;
  if (!powerOfTwo || cost.N < MIN_N || cost.r > MAX_R || cost.p > MAX_P) return null;
  if (128 * cost.N * cost.r > MAX_MEMORY_BYTES) return null;
  return cost;
}

/**
 * Parses a stored hash. Cost parameters are taken from the hash itself (so
 * older hashes keep working) but only within the bounds above.
 */
function parseHash(encoded: string): ParsedHash | null {
  const parts = encoded.split('$');
  if (parts.length !== 6) return null;
  const [algorithm, n, r, p, salt, key] = parts;
  if (algorithm !== ALGORITHM) return null;
  const cost = parseCost(n, r, p);
  if (!cost) return null;
  if (!BASE64URL.test(salt) || !BASE64URL.test(key)) return null;

  const saltBuffer = Buffer.from(salt, 'base64url');
  const keyBuffer = Buffer.from(key, 'base64url');
  if (saltBuffer.length !== SALT_BYTES || keyBuffer.length !== KEY_BYTES) return null;

  return { cost, salt: saltBuffer, key: keyBuffer };
}

/**
 * Whether a stored hash should be replaced by `hashPassword` after the next
 * successful verification: true when its parameters differ from the current
 * cost (or it cannot be parsed at all).
 */
export function needsRehash(encoded: string): boolean {
  const parsed = parseHash(encoded);
  return !parsed || parsed.cost.N !== COST.N || parsed.cost.r !== COST.r || parsed.cost.p !== COST.p;
}

/**
 * Constant-time check of `password` against an encoded hash. Never throws for
 * malformed input; it simply returns false.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parsed = parseHash(encoded);
  if (!parsed) return false;
  const candidate = await deriveKey(password, parsed.salt, parsed.key.length, parsed.cost);
  return timingSafeEqual(candidate, parsed.key);
}

let dummyHash: Promise<string> | undefined;

/**
 * A valid hash of a random password, used to spend the same scrypt time when
 * the email does not exist (no user enumeration by timing).
 */
export function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  return dummyHash;
}
