import 'server-only';
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with Node's scrypt.
 * Encoded format: `scrypt$N$r$p$<salt base64url>$<hash base64url>`.
 */

const ALGORITHM = 'scrypt';
const COST = { N: 16384, r: 8, p: 1 } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function deriveKey(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // scrypt needs ~128 * N * r bytes; leave headroom over Node's 32 MiB default.
    const maxmem = 256 * (options.N ?? COST.N) * (options.r ?? COST.r);
    scrypt(password, salt, keyLength, { ...options, maxmem }, (error, key) => {
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
  options: ScryptOptions;
  salt: Buffer;
  key: Buffer;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Parses a stored hash. Only the parameters this module writes are accepted,
 * so a tampered row cannot downgrade the cost or force a huge allocation.
 */
function parseHash(encoded: string): ParsedHash | null {
  const parts = encoded.split('$');
  if (parts.length !== 6) return null;
  const [algorithm, n, r, p, salt, key] = parts;
  if (algorithm !== ALGORITHM) return null;
  if (n !== String(COST.N) || r !== String(COST.r) || p !== String(COST.p)) return null;
  if (!BASE64URL.test(salt) || !BASE64URL.test(key)) return null;

  const saltBuffer = Buffer.from(salt, 'base64url');
  const keyBuffer = Buffer.from(key, 'base64url');
  if (saltBuffer.length !== SALT_BYTES || keyBuffer.length !== KEY_BYTES) return null;

  return { options: COST, salt: saltBuffer, key: keyBuffer };
}

/**
 * Constant-time check of `password` against an encoded hash. Never throws for
 * malformed input; it simply returns false.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parsed = parseHash(encoded);
  if (!parsed) return false;
  const candidate = await deriveKey(password, parsed.salt, parsed.key.length, parsed.options);
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
