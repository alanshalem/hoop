# Feature: acta-seed

Replace all data with the 21 official match reports (Acta-Partido-681*.pdf, extracted in planillas_monte_grande_lm_21_partidos.csv) and add a coaches CRUD.
Branch: `feat/acta-seed` (from `main` after merging `feat/scouting-sheet`, f5de171). UI copy Spanish; code English.

## Specs

- **S1** — "elimina todos los datos que hay actualmente" Wipe every club record, event and chart entry on the server; keep only the user account admin@camg.com.ar (password unchanged); other demo accounts and their sessions are removed (L2). Browsers that still hold old local data or an old outbox must not push it back.
- **S2** — "seedea el sistema con los datos que tenemos en todos los pdf que sean de tipo Acta-Partido-681....pdf. Los jugadores nuestros y los otros. Eso necesito que seedeemos, nuestros jugadores, los rivales, el entrenador nuestro, etc..." Seed from the 21 reports: division Primera (PRE FEDERAL MASCULINO), own team MONTE GRANDE LM, its 13 players (license, number, name as in the report), the 11 rival teams with their rosters, the 21 finished matches (date, time, venue, home/away, tournament "Liga Metropolitana 2026 (Febamba) - Fecha N", match roster = own players listed in that report), and the own head coach (entrenador) and assistant (ayudante) listed in the reports, assigned to Primera.
- **S3** — (L2) Matches without play-by-play keep the official result of the report: final score and points per quarter (validated: quarters add up to the final score); the scoreboard, match lists and partials show it when the match has no scoring plays. Nothing is invented (no synthetic plays).
- **S4** — (L2) Player height and position become optional (shown as "—" when missing); players keep the report license number (optional field).
- **S5** — "Ademas deberiamos tener un crud de los entrenadores tambien creo no? Para asignarselos a las divisiones..." Coaches are records without login (L2): name, license (optional), role (entrenador principal / ayudante). Screen to create, edit and delete them; divisions assign a head coach and assistants from these records. Synced like other records; writes need MANAGE_DIVISIONS on the server.

## Tasks

- T1 [S1] Explore: how wiping the server interacts with browser local data, outbox and initial seed; where coaches/users are referenced. Route: explore. Commit: n/a
- T2 [S3,S4,S5] Domain + sync: official result, optional player fields + license, coach record kind (migration, RBAC), division coach assignment. Route: worker; independent verify. Commit: _pending_
- T3 [S1,S2] Seed data from the reports (generator + validation) and the wipe script; client cannot resurrect old data. Route: worker; independent verify. Commit: _pending_
- T4 [S3,S4,S5] UI: coaches screen, division form, official result display, optional player fields; manual. Route: worker. Commit: _pending_
- T5 [S1,S2] Run the wipe + seed on the dev database and verify in the browser. Route: inline. Commit: n/a

## Log

- L1 (user): "mergea todos estos cambios en master. Ademas elimina todos los datos que hay actualmente y seedea el sistema con los datos que tenemos en todos los pdf que sean de tipo Acta-Partido-681....pdf. Los jugadores nuestros y los otros. Eso necesito que seedeemos, nuestros jugadores, los rivales, el entrenador nuestro, etc... Ademas deberiamos tener un crud de los entrenadores tambien creo no? Para asignarselos a las divisiones..."
- L2 (user decisions): results -> "Guardar el resultado oficial del acta"; players -> "Hacerlas opcionales" (height/position); coaches -> "Solo fichas sin login"; accounts -> "Dejar solo admin@camg.com.ar".
- L3 (evidence): merged feat/scouting-sheet into main locally as f5de171 (no `master` branch exists; not pushed). The reports and CSV stay untracked (personal data). CSV: 489 rows, 21 matches 681080-681200, 13 own players, 11 rival teams; quarter scores in the PDF text appear shuffled by pdftotext but sum to the final score (681080: 11+23+9+15=58, 19+28+18+25=90).
- L4 (T1 evidence, explore): a plain wipe lets old browsers resurrect data: the pull cursor is max(seq) so it never detects the wipe; the engine pushes its outbox before pulling when it has a cursor; the server upserts unknown ids; the client initial state is the demo seed (club-state.ts createInitialClubState). Coaches are user ids everywhere (assignHeadCoach requires a HEAD_COACH user; divisions page, DivisionFormModal, DivisionRosterModal). Score derivation consumers: deriveScoreboard/withDerivedScoreboard/getOwnRivalScore/getQuarterPartials (match cards, dashboard, stats page, season analytics); Match fields must be listed in MATCH_VERSIONED_FIELDS. heightCm/position consumers: players page, LineupPlayerRow, PlayerCard, BoxScoreTable, PlayerFormModal.
- L5 (decision): resurrection guard = (a) bump CLUB_STORE_VERSION and SYNC_STORE_VERSION and drop every older outbox/cursor; (b) empty client initial state (no demo seed in the bundle; data comes from the server); (c) server data epoch: stored server-side, returned by pull, required on push (missing/different -> rejected, client resets outbox/cursor/local data and pulls a snapshot); (d) the wipe deletes all sessions and every user except admin@camg.com.ar in one transaction, never restarts sync_seq.
