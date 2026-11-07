import {
  CHART_CATALOG,
  CHART_CATEGORIES,
  findChartCode,
  type ChartCatalog,
  type ChartCategory,
  type ChartEntry,
} from '../entities/chart.types';
import type { PlayByPlayEvent, Quarter } from '../entities/match.types';
import { QUARTER_SEQUENCE, isFirstHalf, isOvertime } from './game-clock';

/**
 * =============================================================================
 * HOOP - CHARTING SHEET AGGREGATION
 * Turns CHART events into the paper sheet grid: category x quarter, with
 * per-quarter, per-half and match totals. Chart events never feed statistics.
 * =============================================================================
 */

/** Player key used for entries charted on the whole team (no player). */
export const TEAM_CHART_KEY = 'TEAM';

export type ChartEvent = PlayByPlayEvent & { type: 'CHART'; chart: ChartEntry };

export function isChartEvent(event: PlayByPlayEvent): event is ChartEvent {
  return event.type === 'CHART' && event.chart !== undefined;
}

export interface ChartSheetEntry {
  eventId: string;
  playerId?: string;
  code: string;
  points?: number;
  /** OFFENSE only: whether the action ended in a basket. */
  made?: boolean;
  gameClockFormatted?: string;
}

export interface ChartTotals {
  count: number;
  /** Sum of points: allowed (POINTS_ALLOWED) or scored (made OFFENSE actions). */
  points: number;
}

export interface ChartSheetCell extends ChartTotals {
  entries: ChartSheetEntry[];
  /** How many entries of each code, e.g. { GOOD_SHOT: 2, FORCED_SHOT: 1 }. */
  codeCounts: Record<string, number>;
}

export interface ChartSheetRow {
  category: ChartCategory;
  cells: Record<Quarter, ChartSheetCell>;
  firstHalf: ChartTotals;
  /** Q3, Q4 and every overtime. */
  secondHalf: ChartTotals;
  total: ChartTotals;
}

export interface ChartSheet {
  /** Q1-Q4 always, plus each overtime that has entries. */
  periods: Quarter[];
  rows: ChartSheetRow[];
}

const emptyCell = (): ChartSheetCell => ({ entries: [], codeCounts: {}, count: 0, points: 0 });
const emptyTotals = (): ChartTotals => ({ count: 0, points: 0 });

function addTo(totals: ChartTotals, points: number): void {
  totals.count += 1;
  totals.points += points;
}

export function buildChartSheet(events: readonly PlayByPlayEvent[]): ChartSheet {
  const rows: ChartSheetRow[] = CHART_CATEGORIES.map((category) => ({
    category,
    cells: Object.fromEntries(QUARTER_SEQUENCE.map((q) => [q, emptyCell()])) as Record<Quarter, ChartSheetCell>,
    firstHalf: emptyTotals(),
    secondHalf: emptyTotals(),
    total: emptyTotals(),
  }));
  const byCategory = new Map(rows.map((row) => [row.category, row]));
  const usedOvertimes = new Set<Quarter>();

  for (const event of events) {
    if (!isChartEvent(event)) continue;
    const row = byCategory.get(event.chart.category);
    if (!row) continue;
    // A missed offensive action keeps the value of the shot, but scores nothing.
    const points = event.chart.made === false ? 0 : (event.chart.points ?? 0);
    const cell = row.cells[event.quarter];
    cell.entries.push({
      eventId: event.id,
      playerId: event.playerId,
      code: event.chart.code,
      points: event.chart.points,
      made: event.chart.made,
      gameClockFormatted: event.gameClockFormatted,
    });
    cell.codeCounts[event.chart.code] = (cell.codeCounts[event.chart.code] ?? 0) + 1;
    addTo(cell, points);
    addTo(isFirstHalf(event.quarter) ? row.firstHalf : row.secondHalf, points);
    addTo(row.total, points);
    if (isOvertime(event.quarter)) usedOvertimes.add(event.quarter);
  }

  const periods = QUARTER_SEQUENCE.filter((q) => !isOvertime(q) || usedOvertimes.has(q));
  return { periods, rows };
}

export interface PlayerChartSummary {
  byCategory: Record<ChartCategory, number>;
  positive: number;
  negative: number;
  pointsAllowed: number;
}

/**
 * Per-player charting summary; team-level entries are keyed by TEAM_CHART_KEY.
 * Tones come from the club catalog, so renamed tones and custom codes count.
 */
export function summarizeChartByPlayer(
  events: readonly PlayByPlayEvent[],
  catalog: ChartCatalog = CHART_CATALOG
): Map<string, PlayerChartSummary> {
  const summary = new Map<string, PlayerChartSummary>();
  for (const event of events) {
    if (!isChartEvent(event)) continue;
    const key = event.playerId ?? TEAM_CHART_KEY;
    let line = summary.get(key);
    if (!line) {
      line = {
        byCategory: { TURNOVER: 0, POINTS_ALLOWED: 0, OFFENSE: 0, DEFENSE: 0 },
        positive: 0,
        negative: 0,
        pointsAllowed: 0,
      };
      summary.set(key, line);
    }
    line.byCategory[event.chart.category] += 1;
    const tone = findChartCode(event.chart.category, event.chart.code, catalog)?.tone;
    if (tone === 'POSITIVE') line.positive += 1;
    else if (tone === 'NEGATIVE') line.negative += 1;
    if (event.chart.category === 'POINTS_ALLOWED') line.pointsAllowed += event.chart.points ?? 0;
  }
  return summary;
}
