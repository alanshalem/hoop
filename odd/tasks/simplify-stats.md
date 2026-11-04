# Feature: simplify-stats

Remove the shot map and simplify the box score now that the stats console mode is gone.
Branch: `feat/simplify-stats` (from main c1da78f). UI copy Spanish; code English.

## Specs

- **S1** — "Saca el mapa de tiros y simplifica el box score" The match page no longer shows the shot map ("Mapa de tiros"): remove the section, the `HalfCourtShotChart` organism and the shot-effectiveness helpers (`selectOwnShots`, `calculateShotEffectiveness`) with their tests, only if nothing else uses them. Keep shared domain code (event coordinates in the model, `isFieldGoalAttempt`, `calculateMatchBoxScore` used by players page and season analytics).
- **S2** — The box score only shows what the system still records per own player (points from the sheet's scoring plays): dorsal + player, PTS, TL (made), 2P (made), 3P (made), plus a team total row. Removed columns: shot attempts/percentages, REB, AST, ROB, TAP, PER, FAL, +/-, VAL. Matches with only an official result keep the existing note.

## Tasks

- [x] T1 [S1,S2] Remove the shot map, simplify BoxScoreTable and the stats page, update tours and manual. Route: worker. Commit: de6da9f

## Log

- L1 (user): "Saca el mapa de tiros y simplifica el box score"
- L2 (context): user asked earlier "Pero si sacamos todo lo de estadistica, de donde muestra esta parte? [shot map] no deberiamos eliminarlo tambien?"; recommendation accepted. Dashboard leaders REB/AST/PIR and FG% KPI are out of scope (report only).
