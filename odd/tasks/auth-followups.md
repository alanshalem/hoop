# Feature: auth-followups

Close the open items left by user-management: throttle wrong passwords (login and own-password change), stop `db:seed` from overwriting existing seeded accounts' profile, and make the concurrency DB tests isolated and provably overlapping.
Commits go directly on `main` (user request, user-management L1). Not pushed: the user pushes after migrating Supabase. UI copy Spanish (tú, like the existing UI); code English.

## Specs

- **S1** — "No hay límite de intentos ante contraseñas incorrectas, ni en el login ni en el cambio de contraseña. ... Arregla todo esto" Login: after 5 failed attempts for the same email within 15 minutes, further logins for that email are refused with 429 for 15 minutes (even with the right password), without revealing whether the email exists (unknown emails are throttled the same way). Also at most 20 failed logins per client IP in 15 minutes, then 429. A successful login clears the email counter. The 429 body carries a Spanish message and `reason: 'TOO_MANY_ATTEMPTS'`; the login screen shows it.
- **S2** — Same request: own password change (`POST /api/auth/password`): after 5 wrong current passwords for the same user within 15 minutes, further attempts answer 429 `TOO_MANY_ATTEMPTS` for 15 minutes; a successful change clears it. The change-password screen shows the message.
- **S3** — Throttle state lives in Postgres (works on Vercel serverless, several instances), in one additive migration; it is safe under concurrent requests; old rows are cleaned up opportunistically. An admin resetting an account's password (`POST /api/users/[id]/password`) also clears that account's login throttle.
- **S4** — "Si volvés a correr db:seed, las cuentas del seed vuelven a su rol original. ... Arregla todo esto" `db:seed` creates missing demo accounts but no longer overwrites name, email or role of seeded accounts that already exist. It still resets their password to `SEED_DEMO_PASSWORD` (documented recovery path) and never changes `active` or `mustChangePassword`.
- **S5** — "Dos mejoras de robustez solo en los tests de concurrencia. ... Arregla todo esto" (review advisories R3-overlap-wait-not-proven, R4-shared-db-admin-deactivation): the concurrency tests fail if the second transaction never waited on the first's lock (instead of passing without overlap), and tests that need "only these admins are active" run against their own isolated database instead of deactivating admins in the shared test database.
- **S6** — `docs/MANUAL.md` and `docs/DEPLOY.md` describe the throttling (limits, 429 message, reset by admin), the seed behavior and the new migration to apply before pushing.

## Tasks

- [x] T1 [S1-S3, S6] Throttling: migration, server module, login + password-change + admin-reset wiring, client messages, docs. Route: worker A. Commit: 42b9f89
- [x] T2 [S4, S5] Seed keeps existing accounts' profile; isolated test DB for admin-guard tests; overlap proof in concurrency tests. Route: worker B (after T1; parallel launch rejected by surface overlap). Commit: 693c09f
- [x] T3 Full checks, native review per RDD, close. Route: inline. Commit: docs

## Log

- L1 (user): "Lo que queda abierto, sin urgencia - No hay límite de intentos ante contraseñas incorrectas, ni en el login ni en el cambio de contraseña. - Dos mejoras de robustez solo en los tests de concurrencia. - Si volvés a correr db:seed, las cuentas del seed vuelven a su rol original. - Sigue en tu disco la carpeta temporal del verificador, fuera del repo: C:\Users\alans\AppData\Local\Temp\gpRv18rB\gaKLNbid\tmp.Ufd8Rnf0Lv. ¿La borro? Arregla todo esto..."
- L2 (evidence): the verifier temp folder no longer exists (`ls` -> No such file or directory); nothing to delete.
- L3 (parent decisions, defaults chosen without a new question because the user asked to fix everything): limits 5 per email / 20 per IP / 5 per user for password change, window and block 15 minutes; client IP from the first `x-forwarded-for` entry (Vercel sets it), else none; seed keeps the documented password reset but stops overwriting profile fields.
- L4 (T1 evidence, commit 42b9f89): tsc, eslint, `npm test` 886/886, `npm run test:db` 90/90 (confirmed by the parent), local dev DB migrated (0007 = CREATE TABLE auth_throttles). Beyond design: admin reset also clears password-user:<id>. Limitations documented: IP limit shared per network and not clearable by the admin; X-Forwarded-For spoofable outside Vercel.
- L5 (native review of T1, 824ab9f..ebc285f, lineage review-8a383fa8decefc38): high tier, lenses risk/resilience/reliability -> approved and acknowledged. Non-blocking advisories: R1-email-lockout-dos (anyone can lock a known email for 15 min; inherent to per-email limits), R1/R3/R4 check-then-act (concurrent bursts can exceed the limit by the number of in-flight attempts), R4-cleanup-scan-per-failure (DELETE without index on every failure), R4-login-hard-dependency (login fails if the throttle table is unavailable), R3-cleanup-cross-test, R3-screen-branch-untested.
- L6 (T2 evidence, commit 693c09f): tsc, eslint, `npm test` 886/886, `npm run test:db` 92/92 (worker 3 runs + parent 1 run). New test databases hoop_test_users_guards and hoop_test_users_service.
- L7 (native review of T2, ebc285f..15cdaf5, lineage review-d9a13b78da4afbcf): high tier, lenses risk/reliability -> approved and acknowledged. Non-blocking advisories: R3-001 (seed.db.test.ts:192-195), R3-002 (seed.ts:111), R3-003 (overlap.ts:68-77). Feature closed; Supabase needs `npm run db:migrate` (0006 + 0007) before the user pushes.
