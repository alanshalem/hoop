# Feature: scouting-sheet

Live tactical charting sheet ("Planilla"): the coach's paper "Sistemas" sheet becomes the core of Hoop.
Branch: `feat/scouting-sheet`. UI copy in Spanish, code/identifiers/comments in English (project convention).

## Specs

- **S1** — "Eso es en realidad lo mas importante del sistema... Se cargara en vivo, durante el partido... Eso debe estar si o si." The live console offers a charting panel ("Planilla") to record, during a LIVE match, entries of four categories that mirror the paper sheet: Pérdidas, Puntos recibidos, Acciones ofensivas, Acciones defensivas. Each entry stores the quarter and game clock automatically, the own player involved (or "Equipo" when no player) and a code from the catalog.
- **S2** — "Haz todo como tu pienses/recomiendes... Debe haber un estandar para esto, buscalo en internet si es que hay un estandar o alguna forma de hacer esto y toma el ejemplo desde ahi." There is no universal charting standard (research L3). Default catalog = the coach's paper legend, named with FIBA Statisticians' Manual 2024 Annex B turnover types and common coaching chart terms (turnover chart, defensive breakdown chart, hustle chart). Every code has a short symbol, a Spanish label and a tone: positive (blue, like the sheet's blue ink) or negative (red).
  - Pérdidas (all negative): Pase malo, Caminos, Doble dribling, Manejo de balón, Falta ofensiva, Foul innecesario, Violación de tiempo (3/5/8/24 s), Pelota afuera, Otra.
  - Puntos recibidos (negative; each entry also stores points 1, 2 or 3, default 2): Corte, 1x1, Sin rebote defensivo (2da oportunidad), Foul innecesario, Pérdida + contra, No puntear tiro, No rotar, No transición defensiva, Transición por mal tiro, Pick, Mérito rival.
  - Acciones ofensivas: Buen lanzamiento (A, positive), Mal lanzamiento (R, negative), Bandeja (positive), Forzado permitido (F, negative).
  - Acciones defensivas: Rebote defensivo, Bloqueo de rebote, Ayuda, Contestar tiro, Rotación, Transición defensiva, Presión, Robo, Desvío, Buen foul (positive); 2da oportunidad, Corte, Pick, Mal foul (negative).
- **S3** — Live entry takes at most two taps: pick player (or "Equipo"), tap code. Points allowed uses a 1/2/3 selector that resets to 2 after each entry. The last chart entry can be undone. Recording is refused when the match is not LIVE (same gate as the stat pad).
- **S4** — The sheet view shows the grid category × quarter (Q1-Q4 plus any OT that has entries), each entry as player number + symbol colored by tone, per-quarter totals (count of entries; points for Puntos recibidos), per-half and match totals, the quarter partials (existing table), and a per-player summary. Available on the match page (stats) and from the live console.
- **S5** — Chart entries never change the scoreboard, fouls, box score, shot chart or season analytics, and the stat pad's undo keeps undoing only stat events. Chart entries sync like every play-by-play event (offline-first outbox, append-only).
- **S6** — Manual (`docs/MANUAL.md`) documents the Planilla, its codes and the sources it follows.

- **S7** — Guided tour of the live console works in the default Planilla mode (no step points to a hidden element; the Planilla pad and sheet have their own steps).
- **S8** — Seed: a rival free-throw trip charted as Puntos recibidos counts exactly the free throws made; a trip with no made free throw produces no Puntos recibidos entry.
- **S9** — "Por ahora el catálogo de códigos es fijo. Que cada club cargue los suyos quedó para más adelante. Hace esto..." Each club edits its own charting catalog: rename label/symbol/tone of built-in codes, add custom codes per category, archive codes (never delete; archived codes disappear from the live pad but old entries still render). Editable by roles ADMIN and HEAD_COACH (new permission MANAGE_CHART_CATALOG), enforced server-side; synced offline-first like other records (new sync record kind). Live recording validates against the club's active codes.
- **S10** — Browser check of the live console (Planilla mode) and the sheet on tablet and phone widths, with the seeded data.

## Tasks

- [x] T1 [S1,S2,S3,S5] Domain + use-cases: `CHART` event type with `chart: { category, code, points? }`, catalog, sheet aggregation, `recordChartEntry` / `undoLastChartEntry`, stat undo ignores chart events. Route: inline, test-first. Commit: 56c59cb
- [x] T2 [S1,S3] Live console "Planilla" panel (mode toggle, player chips, code grid, points selector, undo, last entries). Route: inline. Commit: 2142964
- [x] T3 [S4] Sheet view organism + match page integration (stats page section, live console access). Route: inline. Commit: 65a2f27
- [x] T4 [S6] Manual + seed chart entries for finished/live matches. Route: inline. Commit: 97ef965
- [x] T5 [S7] Tour steps for Planilla mode. Route: inline. Commit: 256bd1c
- [x] T6 [S8] Seed free-throw trip points. Route: inline, test-first. Commit: 3800736
- [x] T7 [S9] Club chart catalog: domain, sync kind + migration, RBAC, settings UI. Route: explore, then inline/worker; independent verify (risk items 1, 2). Commit: 217c074, ee77fa2, e0df832
- [x] T8 [S10] Browser check with Docker + seed. Route: inline. Commit: n/a (evidence L10)

## Log

- L1 (user): "[Image#1] tenemos esto en el sistema? podemos escribir este tipo de tabla en el sistema o podemos verla?"
- L2 (user): "Eso es en realidad lo mas importante del sistema... Se cargara en vivo, durante el partido. El resto no es tan importante. Eso es el core del sistema. Que me parece que no se entendio anteriormente. Eso es lo que mas importa que este... El resto esta bien pero tal vez no es necesario... Me explico? Eso debe estar si o si."
- L3 (user): "Haz todo como tu pienses/recomiendes... Debe haber un estandar para esto, buscalo en internet si es que hay un estandar o alguna forma de hacer esto y toma el ejemplo desde ahi. Me explico?"
- L4 (research): No universal charting standard. Sources: FIBA Statisticians' Manual 2024 Annex B (turnover types); hoopcoach.org "How to chart a game" (offense/defense editions); coachingtoolbox.net turnover chart (player, type, how, phase); Tom Kelsey half-court defense chart (each basket allowed: play, missed technique, players, points); NBA.com hustle stats (deflections, contested shots, box outs, charges, loose balls).
- L5 (decision): Chart entries travel as play-by-play events of type `CHART` to reuse the existing offline-first sync (no new table). Existing stat recording stays; the custom per-club catalog is deferred (YAGNI) — codes are stable string ids so it can be added later.
- L6 (evidence): npm test 492/492 pass; tsc clean; eslint clean on touched areas. Seed differential: non-chart seed events byte-identical before/after T4. Browser check not run: Docker (Postgres) was not running, so login was unavailable.
- L7 (user): "Pendiente - Probarla en pantalla ... - El tour guiado de la consola apunta a partes que ahora, en modo Planilla, están ocultas, así que puede fallar. - En los datos de ejemplo, una visita a la línea sin libres convertidos igual cuenta 2 puntos recibidos. No afecta partidos reales. - Por ahora el catálogo de códigos es fijo. Que cada club cargue los suyos quedó para más adelante. Hace esto..."
- L8 (decision): catalog per club, editable by ADMIN and HEAD_COACH, codes archived never deleted, built-in codes editable, custom codes allowed.
- L9 (design, T7): sync record kind `chartCode` (no hyphen). Record `ChartCodeRecord { id: "<clubId>:<category>:<code>", clubId, category, code, symbol (1-3 chars), label (1-40 chars), tone, archived, order }`. No records = built-in catalog (seed adds none). Effective catalog = built-in codes overridden by records with the same category+code, plus custom codes (code `CUSTOM_<id>`), ordered by `order`. Archived codes stay resolvable for rendering old entries but are hidden from the live pad and refused by `recordChartEntry`. New permission `MANAGE_CHART_CATALOG` (ADMIN, HEAD_COACH), enforced on push for kind `chartCode`. Store keeps `chartCodes` with default `[]` on rehydrate (no store version bump, so local data is not reseeded). Migration generated with `npm run db:generate` (additive enum value).
- L10 (evidence): Independent verify of 217c074 passed both risk items (additive enum migration, store merge without reseed; MANAGE_CHART_CATALOG enforced on push, 401/403, malformed records rejected). Advisory fixed in e0df832: chartCode deletes refused for every role. Browser check (headless Chrome, seeded DB, head coach): live console Planilla mode at 1180x820 and 390x844, Ver planilla tab, stats page sheet, /planilla screen; end-to-end record #29 Pase malo -> persisted after reload -> Deshacer restored the previous list. Fixed list bullets on sheet chips. npm test, tsc, test:db green.
- L11 (user): "[Image#2] que podes mejorar de los estilos aca? [Image#3] esta parte tambien... Y aca que se vea el nombre completo y todo [Image#4]... Por otro lado, se puede abrir un tunnel para que el usuario lo vea en una tablet por ejemplo? Dame el usuario y contraseña para que el usuario lo vea..."
- L12 (evidence): style commit 33e853f checked with headless Chrome at 1917x946 and 390x844. Native review of the catalog range stopped with lens_context_budget_exceeded (candidate too large); the independent verify (L10) stands as the outside view for risk items 1-2. Pre-existing hydration mismatch on MatchCard time noted, out of scope.
