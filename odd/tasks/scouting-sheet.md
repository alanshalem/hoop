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

## Tasks

- T1 [S1,S2,S3,S5] Domain + use-cases: `CHART` event type with `chart: { category, code, points? }`, catalog, sheet aggregation, `recordChartEntry` / `undoLastChartEntry`, stat undo ignores chart events. Route: inline, test-first. Commit: _pending_
- T2 [S1,S3] Live console "Planilla" panel (mode toggle, player chips, code grid, points selector, undo, last entries). Route: inline. Commit: _pending_
- T3 [S4] Sheet view organism + match page integration (stats page section, live console access). Route: inline. Commit: _pending_
- T4 [S6] Manual + seed chart entries for finished/live matches. Route: inline. Commit: _pending_

## Log

- L1 (user): "[Image#1] tenemos esto en el sistema? podemos escribir este tipo de tabla en el sistema o podemos verla?"
- L2 (user): "Eso es en realidad lo mas importante del sistema... Se cargara en vivo, durante el partido. El resto no es tan importante. Eso es el core del sistema. Que me parece que no se entendio anteriormente. Eso es lo que mas importa que este... El resto esta bien pero tal vez no es necesario... Me explico? Eso debe estar si o si."
- L3 (user): "Haz todo como tu pienses/recomiendes... Debe haber un estandar para esto, buscalo en internet si es que hay un estandar o alguna forma de hacer esto y toma el ejemplo desde ahi. Me explico?"
- L4 (research): No universal charting standard. Sources: FIBA Statisticians' Manual 2024 Annex B (turnover types); hoopcoach.org "How to chart a game" (offense/defense editions); coachingtoolbox.net turnover chart (player, type, how, phase); Tom Kelsey half-court defense chart (each basket allowed: play, missed technique, players, points); NBA.com hustle stats (deflections, contested shots, box outs, charges, loose balls).
- L5 (decision): Chart entries travel as play-by-play events of type `CHART` to reuse the existing offline-first sync (no new table). Existing stat recording stays; the custom per-club catalog is deferred (YAGNI) — codes are stable string ids so it can be added later.
