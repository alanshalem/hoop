import type { Player } from '@/core/domain/entities/club.types';
import {
  CHART_CATALOG,
  findChartCode,
  type ChartCatalog,
  type ChartCategory,
} from '@/core/domain/entities/chart.types';
import type { PlayByPlayEvent } from '@/core/domain/entities/match.types';
import type { RivalPlayer } from '@/core/domain/entities/rival.types';
import {
  TEAM_CHART_KEY,
  isChartEvent,
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

/** Result marker of an offensive action: "+3" when made, "+0" when missed; empty otherwise. */
export function chartEntryResult(entry: Pick<ChartSheetEntry, 'made' | 'points'>): string {
  if (entry.made === undefined) return '';
  return entry.made ? `+${entry.points ?? 0}` : '+0';
}

function describePoints(entry: ChartSheetEntry): string | undefined {
  if (entry.made === true) return `convirtió, ${formatChartPoints(entry.points ?? 0)}`;
  if (entry.made === false) return 'no convirtió';
  return entry.points !== undefined ? formatChartPoints(entry.points) : undefined;
}

/** Rival player as written next to an entry: "#7 Pérez", or "#?" when no longer in the roster (S14). */
export function rivalPlayerTag(player: RivalPlayer | undefined): string {
  return player ? `#${player.dorsal} ${player.lastName}` : '#?';
}

/** How the rival player took part: the scorer of points allowed, the defender of an offensive action. */
export function rivalInvolvement(category: ChartCategory, rival: string): string {
  return category === 'POINTS_ALLOWED' ? `convirtió ${rival}` : `vs ${rival}`;
}

/** Rival player recorded on each chart event (S14); sheet entries carry only the event id. */
export function rivalPlayerIdsByEvent(events: readonly PlayByPlayEvent[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const event of events) {
    if (isChartEvent(event) && event.chart.rivalPlayerId) ids.set(event.id, event.chart.rivalPlayerId);
  }
  return ids;
}

/** Full description for the chip tooltip and accessible name; names the rival player when recorded. */
export function chartEntryTitle(
  category: ChartCategory,
  entry: ChartSheetEntry & { rivalPlayerId?: string },
  playersById: ReadonlyMap<string, Player>,
  catalog: ChartCatalog = CHART_CATALOG,
  rivalById: ReadonlyMap<string, RivalPlayer> = new Map()
): string {
  const label = findChartCode(category, entry.code, catalog)?.label ?? entry.code;
  const detail = describePoints(entry);
  const code = detail ? `${label} (${detail})` : label;
  const player = entry.playerId ? playersById.get(entry.playerId) : undefined;
  const who = !entry.playerId
    ? 'Equipo'
    : player
      ? `#${player.dorsal} ${player.firstName} ${player.lastName}`
      : 'Jugador desconocido';
  const rivalPlayer = entry.rivalPlayerId ? rivalById.get(entry.rivalPlayerId) : undefined;
  const rival = !entry.rivalPlayerId
    ? undefined
    : rivalInvolvement(
        category,
        rivalPlayer
          ? `#${rivalPlayer.dorsal} ${rivalPlayer.firstName} ${rivalPlayer.lastName}`
          : 'jugador rival desconocido'
      );
  return [code, who, rival, entry.gameClockFormatted].filter(Boolean).join(' · ');
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
