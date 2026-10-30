# Feature: hoop-completion
Complete HoopOS end to end (core layers + every screen), replace every browser alert with modals, polish visuals, and write the system manual.
Branch: `feat/hoop-completion`. UI copy stays in Spanish (project convention from `CLAUDE.md`: "nombres semánticos en inglés para el código e interfaz en español"); code, identifiers and comments in English.

## Specs

- **S1** — "No quiero ningun ALERT, todo modales." No `alert(`, `confirm(` or `prompt(` anywhere in `src/`. Every notice, warning and confirmation is shown in an in-app modal dialog (built on `ModalSheet`), with a typed API: `notify({ title, message, tone })` and `confirm({ title, message, confirmLabel, tone }) => Promise<boolean>`.
- **S2** — "NO USES EMOJIS". No emoji characters in `src/` or in docs. Icons only from `lucide-react`.
- **S3** — "MEJORA TAMANIOS, ICONOS". Minimum readable text 12px (tokens `--text-2xs` >= 12px), consistent icon sizes via tokens/constants (16 inline, 20 nav/buttons, 24 hero), touch targets >= 48px (56px in the live console, per `CLAUDE.md`).
- **S4** — "mejora visualmente todo". Every screen polished on the "Hardwood & Neon" design system; no inline `style={...}` except dynamic values (shot-chart coordinates / GSAP). No `<button>` nested inside `<a>`.
- **S5** — "Termina todo lo que falte, frontend y backend". There is no server in this project (offline-first Zustand + localStorage by design), so "backend" = the core layers (`src/core/domain`, `application`, `infrastructure`). Concrete gaps to close:
  - S5.1 Store logic moves to pure, tested use-cases; score and team fouls are derived from events (single source of truth), so undo across quarters is correct.
  - S5.2 `+/-` uses the starting five (`startingLineupOwn`), not the current lineup.
  - S5.3 Timeouts are consumed per FIBA period (2 first half, 3 second half, 1 per OT) for own team and rival; refusal shown in a modal when none remain; the clock pauses.
  - S5.4 Game clock is persisted (saved on pause, on each recorded event, on quarter change, on leaving); events record the real clock; at 00:00 a modal offers to advance the quarter.
  - S5.5 A live match can be finished (confirm modal) and then opens its box score.
  - S5.6 Rival team fouls can be recorded (feed the rival bonus lights).
  - S5.7 Dashboard KPIs, leaders and medical alerts are computed from real data (no hardcoded numbers or injury reasons; players get an optional `medicalNote`).
  - S5.8 Box score quarter partials computed from events (including OT periods that exist).
  - S5.9 Divisions: create (also creates its team), edit, delete (confirm), view roster, assign head coach from users.
  - S5.10 Players: create, edit, delete (confirm), call up juveniles (modal feedback), medical note.
  - S5.11 Matches: create with date/time and team derived from division, edit and delete scheduled matches (confirm), sorted by date.
  - S5.12 Lineup: candidates are the match team roster plus called-up players; 5 starters exactly, max 12 in roster; once LIVE the starters are locked.
  - S5.13 Role switcher in the nav rail is the store's role (not local state); simple RBAC permission matrix in the domain hides/disables actions.
  - S5.14 Persisted store gets a version + migration so old localStorage data reseeds instead of crashing.
  - S5.15 Realistic seed: finished matches with full play-by-play (scores match the events), live match with events, so every screen shows real computed data.
  - S5.16 `/matches/live` opens the current live match or shows an empty state; live console shows a gate when the match is not live.
  - S5.17 Layout metadata: title "HoopOS", `lang="es"`, Geist fonts wired into tokens.
- **S6** — "UTILIZA PRINCIPIOS DRY, KISS, YAGNI, CLEAN CODE, CLEAN ARCHITECTURE". Domain rules pure and framework-free; use-cases in `application`; shared UI primitives instead of duplicated markup (form fields, filter chips, page header, empty state, link buttons); delete empty `export {}` barrels that nothing uses; no `any`.
- **S7** — "HAZ UN MANUAL DEL SISTEMA". `docs/MANUAL.md` (Spanish, user + technical: roles, every screen and flow, FIBA rules applied, architecture, scripts) and a real `README.md` pointing to it.
- **S8** — Quality gates: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` all pass.

## Tasks

- T1 — Core: domain rules, use-cases, store refactor, seed, tests — S5.1-S5.6, S5.8, S5.13-S5.15, S6 — worker (bg) — commit: pending
- T2 — Presentation foundation: tokens, dialog system, shared primitives, layout, app shell — S1, S2, S3, S4, S5.13 (UI), S5.17, S6 — worker (bg) — commit: pending
- T3 — Management screens: dashboard, divisions, players, matches, lineup — S1-S4, S5.7, S5.9-S5.12 — worker — commit: pending
- T4 — Live console + stats screens and their organisms — S1-S4, S5.3-S5.6, S5.8, S5.16 — worker — commit: pending
- T5 — Manual + README + NOTAS — S7 — inline/worker — commit: pending
- T6 — Final gates and audit (alerts, emojis, inline styles) — S1, S2, S4, S8 — inline — commit: n/a

## Log

- L1 (user, verbatim): "Lee el repositorio completo, mejora visualmente todo. Termina todo lo que falte, frontend y backend. No quiero ningun ALERT, todo modales. [Image#1] UTILIZA PRINCIPIOS DRY, KISS, YAGNI, CLEAN CODE, CLEAN ARCHITECTURE, ETC... MEJORA TAMANIOS, ICONOS, NO USES EMOJIS, HAZ UN MANUAL DEL SISTEMA, ETC..." — Image#1 shows a browser `alert` "Tiempo muerto solicitado por Obras Sanitarias. Reloj detenido." in the live console.
- L2 (parent decision): no server/database is added (YAGNI; `CLAUDE.md` mandates offline-first Zustand persist). "Backend" is read as the empty core layers; reported to the user at close.
- L3 (parent audit of the base, commit 2ff282a): 8 `alert()` calls (lineup x3, live x2, players x1, HalfCourtShotChart x1, OnCourtLineup x1); emojis in QuickActionPad, HalfCourtShotChart, lineup page; hardcoded dashboard KPIs/leaders, hardcoded quarter partials in stats, hardcoded coach "Federico Balbi" in divisions; `TabletAppShell` role `<select>` uses local state; `Link > TouchButton` nesting; `+/-` fed with current lineup; clock never persisted; timeouts never decremented; no way to finish a match.
