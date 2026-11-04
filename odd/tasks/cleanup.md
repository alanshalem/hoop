# Feature: cleanup

Apply every simplification of the audit (DRY, KISS, YAGNI, Clean Code, Clean Architecture) without changing what users can do, plus single-language routes.
Branch: `refactor/cleanup` (from main 7b853e2), merged into main at the end. UI copy Spanish; code English. The app is still in development: breaking internal APIs and URLs is allowed.

## Specs

- **S1** — "Haz todas las mejoras 1, 2, 3, 4, 5, 6, 7, 8, 9 y 10 y las otras mejoras tambien..." Every audit item (L2) is applied. User-visible behavior stays the same except URLs (S2); `npm test`, `npm run test:db`, `tsc`, `eslint` and `next build` stay green after every task.
- **S2** — "las rutas si quieres tambien dejalas todas en un idioma" Routes in one language (English, like the code): `/rivales` -> `/rivals`, `/entrenadores` -> `/coaches`, `/planilla` -> `/chart-codes`, `/ayuda` -> `/help`; every link, tour route, manual reference and test updated. No redirects (app not in production).
- **S3** — "piensa que la app todavia esta en desarrollo no la esta usando gente entonces tenes libertad para hacer mas cambios de los normales hasta que salga la app a prod" Schema pruning is allowed: the dev DB has 0 live events (L3), so `SUBSTITUTION` events and event `coordinates` can leave the model.

- **S4** — "Quiero hostear todo el proyecto 100% gratis si es posible" + decision L5 (Vercel + Supabase): the app runs on serverless functions. Live sync without long-lived connections: SSE and LISTEN/NOTIFY are replaced by polling (every few seconds while the page is visible, immediately on focus/online/after a push), with a small DB pool suited to Supabase pooled connections. Same data behavior (outbox, LWW, epoch guard). `docs/DEPLOY.md` describes Vercel + Supabase step by step.

## Tasks

- [x] T1 [S1] #1 #5: shrink the box score to a scoring line; remove PIR, +/-, player/team foul helpers only used by tests, unused event helpers, `setStartingLineup`, unused `RecordEventInput` fields, `calculateNormalizedDistance`, `PLAY_BY_PLAY_EVENT_LABELS`; update tests and manual. Route: worker. Commit: 385671d
- [x] T2 [S1] #4 #9 #10: delete unused barrels; move `CLUB_PROFILE` out of infrastructure; `makeClubData()` test helper. Route: worker. Commit: a34d397
- [x] T3 [S1,S3] Others: demo seed without coordinates/substitutions; drop `SUBSTITUTION` and `coordinates` from the event schema and derivations; `runCollectionUseCase` helper in the store; stale banners. Route: worker. Commit: a34d397
- [x] T4 [S1] #2 #3: table-driven sync record-kind registry shared by client and server; one event-changes helper. Route: worker; independent verify (sync). Commit: bfade8e
- [x] T9b [S4] Hidden-leader polling gap + lock-count test filter (L8). Route: inline/worker. Commit: fb9bc2a
- [x] T5 [S1] #6 #7: `FormModalSheet` template + `useModalForm`; `useEditModal`; division chips helper. Route: worker. Commit: 17304cb
- T6 [S1] #8 + oversized files: domain rules out of presentation/pages (`isMatchInPlay`, roster helpers, season points); split `acta-parser.ts`, `app/page.tsx`, lineup page, `MatchFormModal`. Route: worker. Commit: _pending_
- T7 [S2] Single-language routes. Route: worker. Commit: _pending_
- [x] T9 [S4] Replace SSE/LISTEN with polling; serverless-friendly DB pool. Route: worker after T4; independent verify. Commit: f2fedce
- [x] T10 [S4] Rewrite docs/DEPLOY.md for Vercel + Supabase (free). Route: inline/worker. Commit: e1be58c
- T8 Merge into main after a full check (tests, db tests, build, read-only browser check). Route: inline. Commit: merge

## Log

- L1 (user): "Quiero hostear todo el proyecto 100% gratis si es posible... Por eso no se si railway es la opcion. Por otro lado. Haz todas las mejoras 1, 2, 3, 4, 5, 6, 7, 8, 9 y 10 y las otras mejoras tambien... las rutas si quieres tambien dejalas todas en un idioma. piensa que la app todavia esta en desarrollo no la esta usando gente entonces tenes libertad para hacer mas cambios de los normales hasta que salga la app a prod"
- L2 (audit, read-only explore): #1 box score fields/PIR/+/-/foul helpers only used by tests (basketball-rules.ts); #2 record kinds hand-listed in ~10 places, same switch 3x; #3 apply-event-changes loop copied (apply-club-diff, pull-merge); #4 unused barrels (infrastructure/index re-exports the demo seed); #5 setStartingLineup, RecordEventInput playerId/assistedByPlayerId/coordinates, calculateNormalizedDistance, PLAY_BY_PLAY_EVENT_LABELS unused; #6 seven ModalSheet forms repeat the same structure; #7 five list pages repeat edit-modal state and division chips; #8 isMatchInPlay, isYouthCategory, getTeamRosterPlayers, season points and lineup candidates live in presentation/pages; #9 application imports CLUB_PROFILE from infrastructure; #10 eight tests rebuild an empty SyncableClubData. Others: demo seed generates coordinates/substitutions; store action boilerplate; oversized files; stale "FIBA PIR" banners; mixed-language routes.
- L3 (evidence): dev DB `select ... from match_events where not deleted` -> 0 SUBSTITUTION, 0 with coordinates, 0 live events.
- L4 (hosting, research): free options checked against vendor docs: Render free sleeps after 15 min and its Postgres expires after 30 days; Koyeb free scales to zero after 60 min; Neon free suspends after 5 min and drops LISTEN; Supabase free pauses after 7 days of low activity; Vercel Hobby functions last at most 300 s and Hobby is personal/non-commercial; Oracle Always Free gives an always-on ARM VM (now 2 OCPU / 12 GB). Pending user decision.
- L5 (user decision): hosting -> "Vercel + Supabase (Recomendado)".
- L6 (review, T2+T3 approved): advisory R3-legacy-outbox-fields (match-fields.ts:39: an old browser outbox may still carry activeLineupOwn in changedFields/fieldVersions) and R3-legacy-starters (lineup page reads startingLineupOwn for IN_PLAY matches). Handle in T9 (drop unknown match fields from queued changes and versions; bump SYNC_STORE_VERSION if needed).
- L7 (T4 checks): review approved (advisories R3-match-events-client-side-untested records.test.ts:71-74, R3-pull-echo-touches-match pull-merge.ts:85); independent verify PASS (8000 differential scenarios, 72 RBAC combos identical; enum unchanged; intentional change: a pulled tombstone for a match not stored locally no longer removes that event id from another match). Follow-up after T9: add the verifier regression tests (diff record order with matches last; JSON-visible resend differences stay stale; pulling an already-present live event leaves data untouched).
- L8 (T9 review approved): advisories R4-hidden-leader-stops-polling (browser-adapters.ts:152-153: if the leader tab is hidden while another tab of the same browser is visible, nobody polls) -> fix in T9b (poll while ANY tab of the browser is visible, e.g. visible followers ask the leader / leadership follows visibility); R4-small-pool-advisory-lock (client.ts:27: pushes queue on the pool while the advisory xact lock is held; acceptable at club scale); R3-pg-locks-global-count (sync.db.test.ts:128-132 counts locks globally; make it filter by the lock key).
- L9 (T5+T9b review approved): advisory R4-hidden-leader-timer-throttling (sync-runtime.ts:74-75: a hidden leader timer may be throttled by the browser; acceptable, visible tabs trigger an immediate pull).
