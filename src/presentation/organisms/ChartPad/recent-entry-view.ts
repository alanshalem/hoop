import type { Player } from '@/core/domain/entities/club.types';
import {
  CHART_CATALOG,
  CHART_CATEGORY_LABELS,
  findChartCode,
  type ChartCatalog,
  type ChartCategory,
  type ChartEntry,
  type ChartTone,
} from '@/core/domain/entities/chart.types';
import type { PlayByPlayEvent } from '@/core/domain/entities/match.types';
import type { RivalPlayer } from '@/core/domain/entities/rival.types';
import { isChartEvent } from '@/core/domain/rules/chart-sheet';
import { QUARTER_SHORT_LABELS } from '@/presentation/organisms/ScoreboardHeader/quarter-labels';
import {
  formatChartPoints,
  rivalInvolvement,
  rivalPlayerTag,
} from '@/presentation/organisms/ChartSheetTable/chart-sheet-view';

/** made = own basket (green), missed = no basket (muted), allowed = rival basket (red). */
export type ChartOutcomeTone = 'made' | 'missed' | 'allowed';

export interface ChartOutcome {
  text: string;
  tone: ChartOutcomeTone;
}

/** One line of "Últimas entradas" in the live pad (S14). */
export interface RecentEntryView {
  id: string;
  /** Period and game clock, e.g. "2C 05:32". */
  clock: string;
  /** "#29 Garino", or "Equipo" for team entries. */
  player: string;
  symbol: string;
  label: string;
  /** Undefined when the code is no longer in the catalog. */
  tone: ChartTone | undefined;
  outcome: ChartOutcome | undefined;
  category: string;
  /** Only when the rival player was recorded, e.g. "convirtió #7 Pérez" or "vs #7 Pérez". */
  rival: string | undefined;
}

export interface RecentEntriesOptions {
  playersById: ReadonlyMap<string, Player>;
  rivalById: ReadonlyMap<string, RivalPlayer>;
  catalog?: ChartCatalog;
  limit?: number;
}

const DEFAULT_RECENT_LIMIT = 5;

/** Own player of an entry: jersey and last name, "Equipo" for team entries, "#?" when unknown. */
export function ownPlayerTag(playerId: string | undefined, playersById: ReadonlyMap<string, Player>): string {
  if (!playerId) return 'Equipo';
  const player = playersById.get(playerId);
  return player ? `#${player.dorsal} ${player.lastName}` : '#?';
}

/** Result of an offensive action or points of a basket allowed; nothing for the other categories. */
export function chartOutcome(chart: ChartEntry): ChartOutcome | undefined {
  if (chart.made === true) return { text: `+${chart.points ?? 0}`, tone: 'made' };
  if (chart.made === false) return { text: 'no convirtió', tone: 'missed' };
  if (chart.category === 'POINTS_ALLOWED' && chart.points !== undefined) {
    return { text: formatChartPoints(chart.points), tone: 'allowed' };
  }
  return undefined;
}

/** Question of the optional rival step of the live pad; null where no rival player is recorded. */
export function rivalStepTitle(category: ChartCategory): string | null {
  if (category === 'POINTS_ALLOWED') return '¿Quién convirtió?';
  if (category === 'OFFENSE') return 'Defensor rival';
  return null;
}

/** The latest chart entries, newest first, ready to render. */
export function buildRecentEntries(
  events: readonly PlayByPlayEvent[],
  { playersById, rivalById, catalog = CHART_CATALOG, limit = DEFAULT_RECENT_LIMIT }: RecentEntriesOptions
): RecentEntryView[] {
  return events
    .filter(isChartEvent)
    .slice(-limit)
    .reverse()
    .map((event) => {
      const { chart } = event;
      const code = findChartCode(chart.category, chart.code, catalog);
      return {
        id: event.id,
        clock: `${QUARTER_SHORT_LABELS[event.quarter]} ${event.gameClockFormatted ?? ''}`.trim(),
        player: ownPlayerTag(event.playerId, playersById),
        symbol: code?.symbol ?? chart.code,
        label: code?.label ?? chart.code,
        tone: code?.tone,
        outcome: chartOutcome(chart),
        category: CHART_CATEGORY_LABELS[chart.category],
        rival: chart.rivalPlayerId
          ? rivalInvolvement(chart.category, rivalPlayerTag(rivalById.get(chart.rivalPlayerId)))
          : undefined,
      };
    });
}
