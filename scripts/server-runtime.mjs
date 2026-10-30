/**
 * Preload for server code that runs outside Next.js (tests, seed, drizzle-kit).
 *
 * 1. Loads `.env.local` and `.env` (same precedence as Next.js: real environment
 *    variables win, then `.env.local`, then `.env`).
 * 2. Resolves `server-only` with the `react-server` condition, so modules under
 *    `src/server/**` can keep their `import 'server-only'` guard. Only that one
 *    specifier is affected; React and every other package resolve as usual.
 *
 * Usage: `tsx --import ./scripts/server-runtime.mjs <entry>`
 */
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { parseEnv } from 'node:util';

for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  const values = parseEnv(readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return nextResolve(specifier, {
        ...context,
        conditions: [...context.conditions, 'react-server'],
      });
    }
    return nextResolve(specifier, context);
  },
});
