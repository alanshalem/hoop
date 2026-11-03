import type { Player } from '@/core/domain/entities/club.types';
import {
  CHART_CATALOG,
  findChartCode,
  type ChartCatalog,
  type ChartCategory,
} from '@/core/domain/entities/chart.types';
import type { PlayByPlayEvent } from '@/core/domain/entities/match.types';
import {
  TEAM_CHART_KEY,
  summarizeChartByPlayer,
  type ChartSheetEntry,
  type PlayerChartSummary,
} from '@/core/domain/rules/chart-sheet';

/** Compact per-code counts in catalog order, e.g. "A=1 F=4"; archived codes still count. */
export function formatCodeCounts(
  category: ChartCategory,
  codeCounts: Record<string, number>,
  catalog: ChartCatalog = CHART_CATALOG
): string {
  return catalog[category]
    .filter((entry) => (codeCounts[entry.code] ?? 0) > 0)
    .map((entry) => `${entry.symbol}=${codeCounts[entry.code]}`)
    .join(' ');
}

/** Who the entry belongs to, as written on the paper sheet: "#7", or "EQ" for the team. */
export function chartEntryTag(playerId: string | undefined, playersById: ReadonlyMap<string, Player>): string {
  if (!playerId) return 'EQ';
  const player = playersById.get(playerId);
  return player ? `#${player.dorsal}` : '#?';
}

export function formatChartPoints(points: number): string {
  return points === 1 ? '1 pt' : `${points} pts`;
}

/** Full description for the chip tooltip and accessible name. */
export function chartEntryTitle(
  category: ChartCategory,
  entry: ChartSheetEntry,
  playersById: ReadonlyMap<string, Player>,
  catalog: ChartCatalog = CHART_CATALOG
): string {
  const label = findChartCode(category, entry.code, catalog)?.label ?? entry.code;
  const code = entry.points !== undefined ? `${label} (${formatChartPoints(entry.points)})` : label;
  const player = entry.playerId ? playersById.get(entry.playerId) : undefined;
  const who = !entry.playerId
    ? 'Equipo'
    : player
      ? `#${player.dorsal} ${player.firstName} ${player.lastName}`
      : 'Jugador desconocido';
  return [code, who, entry.gameClockFormatted].filter(Boolean).join(' · ');
}

export interface ChartSummaryRow {
  /** Player id, or TEAM_CHART_KEY for team entries. */
  key: string;
  dorsal?: number;
  name: string;
  isTeam: boolean;
  summary: PlayerChartSummary;
}

/** Per-player summary sorted by negative entries (then jersey); the team row goes last. */
export function buildChartSummaryRows(
  events: readonly PlayByPlayEvent[],
  players: readonly Player[],
  catalog: ChartCatalog = CHART_CATALOG
): ChartSummaryRow[] {
  const playersById = new Map(players.map((p) => [p.id, p]));
  const rows: ChartSummaryRow[] = [];
  let teamRow: ChartSummaryRow | undefined;

  for (const [key, summary] of summarizeChartByPlayer(events, catalog)) {
    if (key === TEAM_CHART_KEY) {
      teamRow = { key, name: 'Equipo', isTeam: true, summary };
      continue;
    }
    const player = playersById.get(key);
    rows.push({
      key,
      dorsal: player?.dorsal,
      name: player ? `${player.firstName} ${player.lastName}` : 'Jugador desconocido',
      isTeam: false,
      summary,
    });
  }

  rows.sort(
    (a, b) =>
      b.summary.negative - a.summary.negative ||
      (a.dorsal ?? Number.MAX_SAFE_INTEGER) - (b.dorsal ?? Number.MAX_SAFE_INTEGER)
  );
  return teamRow ? [...rows, teamRow] : rows;
}
