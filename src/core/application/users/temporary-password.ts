/**
 * Temporary passwords the admin hands out (S2). The account must replace it
 * at its next login, so it only has to be random and easy to copy by hand:
 * look-alike characters (0/O, 1/l/I) are left out.
 */

export const TEMPORARY_PASSWORD_LENGTH = 12;
export const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Bytes at or above this limit are skipped so every character is equally likely. */
const UNBIASED_LIMIT = 256 - (256 % TEMPORARY_PASSWORD_ALPHABET.length);

/** `crypto.getRandomValues` also works on plain http (LAN tablets), unlike `randomUUID`. */
const cryptoRandom = (bytes: Uint8Array) => {
  crypto.getRandomValues(bytes);
};

export function generateTemporaryPassword(fillRandom: (bytes: Uint8Array) => void = cryptoRandom): string {
  let password = '';
  const bytes = new Uint8Array(TEMPORARY_PASSWORD_LENGTH);
  while (password.length < TEMPORARY_PASSWORD_LENGTH) {
    fillRandom(bytes);
    for (const byte of bytes) {
      if (byte >= UNBIASED_LIMIT) continue;
      password += TEMPORARY_PASSWORD_ALPHABET[byte % TEMPORARY_PASSWORD_ALPHABET.length];
      if (password.length === TEMPORARY_PASSWORD_LENGTH) break;
    }
  }
  return password;
}
