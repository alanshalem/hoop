# Feature: user-management

Admin screen to list, create, edit, deactivate and reset the password of user accounts; every user can change their own password; new or reset accounts must change their temporary password at the next login.
Branch: commits go directly on `main` (user request, L1). Not pushed: the user pushes after running the migration on Supabase (L2). UI copy Spanish; code English.

## Specs

- **S1** — "Para gestionar usuarios, setearles contraseñas, cosas y que ellos las cambien, ver todos los usuarios, cosas asi" Only ADMIN (new permission `MANAGE_USERS`) can see the list of every account (name, email, role, active/inactive, must change password) on a new screen `/users`, reachable from the nav rail for admins. Other roles see no nav item and the screen says only the administrator manages users. The server enforces the same rule on every user-management request (401 without session, 403 without `MANAGE_USERS`).
- **S2** — L2 "Temporal + cambio obligatorio": the admin creates an account with name, email, role and a temporary password, and can later reset any account to a new temporary password. Both leave the account flagged "must change password"; a reset also closes every session of that account.
- **S3** — L2 "Temporal + cambio obligatorio": an account flagged "must change password" can log in but, until it chooses a new password, every screen sends it to the change-password screen and the sync API refuses it (403). After the change the flag clears and the user continues to the app.
- **S4** — L2 "Desactivar": the admin deactivates an account instead of deleting it: it stays in the list as inactive, cannot log in (same generic credentials error), its sessions close at once, and it can be reactivated.
- **S5** — L2 "Cambiar su contraseña" (only): every logged-in user can change their own password from the user menu by typing the current one and the new one twice; the other sessions of that user close, the current one stays. Users cannot change their own name, email or role.
- **S6** — Safety guards: the admin can edit name, email and role of any account; emails stay unique (case-insensitive) with a clear error; an admin cannot deactivate or demote their own account, and the last active ADMIN can never be deactivated or demoted. New passwords: 8 to 256 characters.
- **S7** — Docs: `docs/MANUAL.md` (roles, new screens, flows) and `docs/DEPLOY.md` (migration step and creating users from the screen) describe the feature; the schema change is one additive migration.

## Tasks

- [x] T1 [S1-S6] Server: migration (`active`, `must_change_password`), `MANAGE_USERS`, user-admin service with guards, auth changes (inactive login/session, flag in public user, sync refusal), API routes, DB tests. Route: worker (context backstop). Commit: 3f3ebf4
- [ ] T2 [S1-S5] Client: auth API + store (flag), forced change gate, `/account/password` screen, user menu link, `/users` screen with create/edit/reset/deactivate, nav item. Route: worker. Commit: _pending_
- [ ] T3 [S7] Manual + deploy docs. Route: inline. Commit: with T2
- [ ] T4 Independent verify (security, high risk item 2) + full checks + migrate local DB. Route: gentle-ai-verify. Commit: fixes if any

## Log

- L1 (user): "Ya lo hice. Creo que le falta alguna pantalla o algo de gestion del admin no? Para gestionar usuarios, setearles contraseñas, cosas y que ellos las cambien, ver todos los usuarios, cosas asi, no? Haz los cambios directamente en master..."
- L2 (user decisions): new user password -> "Temporal + cambio obligatorio (Recomendado)"; leaving the club -> "Desactivar (Recomendado)"; self-service -> "Cambiar su contraseña" only; publishing -> "No, pusheo yo (Recomendado)". The repository default branch is `main` (no `master`).
- L3 (T1 evidence, commit 3f3ebf4): tsc 0, `npm test` 822/822, `npm run test:db` 65/65, migration 0006 adds `active` (default true) and `must_change_password` (default false). API contract (errors are `{ error, reason? }`, no-store; mutations: same-origin 403 -> non-JSON 415 -> no session 401 -> 403 permission -> body 400):
  - `POST /api/auth/password` `{ currentPassword, newPassword (8..256) }` -> 200 `{ user }` (flag cleared, other sessions closed); 400 invalid body; 400 `WRONG_CURRENT_PASSWORD`.
  - `GET /api/users` -> 200 `{ users: [{ id, email, name, role, active, mustChangePassword, createdAt }] }` sorted by name; 403 without MANAGE_USERS.
  - `POST /api/users` `{ name (2..60), email, role, temporaryPassword (8..256) }` -> 201 `{ user }` (active, must change); 400; 409 `EMAIL_TAKEN`.
  - `PATCH /api/users/[id]` `{ name?, email?, role?, active? }` -> 200 `{ user }`; 400; 404 `USER_NOT_FOUND`; 409 `EMAIL_TAKEN` | `SELF_DEACTIVATION` | `SELF_ROLE_CHANGE` | `LAST_ADMIN` (Spanish messages in the body `error`, show them as-is).
  - `POST /api/users/[id]/password` `{ temporaryPassword }` -> 200 `{ user }` (flag set, ALL sessions of that account closed, including the caller's if self-reset); 400; 404.
  - `/api/sync/push` and `/api/sync/pull` -> 403 `reason: PASSWORD_CHANGE_REQUIRED` while the flag is set. Login, `/api/auth/me` return `mustChangePassword`; `AuthUser` and `AuthUserSchema` already carry it.
  - Worker risks: seed upsert leaves `active`/flag untouched; no rate limit on wrong current password (same as login).
- L4 (native review of T1, committed range 61638bd..674c81a, lineage review-f3725491639288bb): high tier, lenses risk/resilience/reliability -> approved and acknowledged (authority burned). Non-blocking advisories: R3-only-admins-shared-db (service.db.test.ts:50-62 temporarily deactivates other admins in the shared test DB), R3-same-password-clears-flag (password-change.ts:36: choosing the same password as the temporary one clears the flag; the T2 client refuses it, the server does not) -> handle in T4.
- L5 (T2+T3 worker evidence): tsc, eslint, `npm test` 870/870, build green; HTTP smoke /users and /account/password 200. Decisions: v1 auth cache migration keeps the flag if present; client refuses a new password equal to the current one; current-user badge "Tu cuenta"; temporary password shown in the success notice for copying; no /users screen tour.
