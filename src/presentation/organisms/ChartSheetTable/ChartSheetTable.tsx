import React from 'react';
import clsx from 'clsx';
import type { Player } from '@/core/domain/entities/club.types';
import {
  CHART_CATEGORIES,
  CHART_CATEGORY_LABELS,
  findChartCode,
  type ChartCatalog,
  type ChartCategory,
  type ChartTone,
} from '@/core/domain/entities/chart.types';
import type { PlayByPlayEvent } from '@/core/domain/entities/match.types';
import type { RivalPlayer } from '@/core/domain/entities/rival.types';
import { activeChartCodes } from '@/core/domain/rules/chart-catalog';
import { buildChartSheet, type ChartSheetCell, type ChartTotals } from '@/core/domain/rules/chart-sheet';
import { QUARTER_LABELS, QUARTER_SHORT_LABELS } from '@/presentation/organisms/ScoreboardHeader/quarter-labels';
import {
  buildChartSummaryRows,
  chartEntryTag,
  chartEntryTitle,
  chartEntryResult,
  formatChartPoints,
  formatCodeCounts,
  rivalPlayerIdsByEvent,
} from './chart-sheet-view';
import styles from './ChartSheetTable.module.css';

export interface ChartSheetTableProps {
  /** Full play-by-play; only chart entries are drawn. */
  events: PlayByPlayEvent[];
  /** Club players, to resolve jersey numbers and names. */
  players: Player[];
  /** The club's catalog: archived codes still render old entries; the legend lists active codes. */
  catalog: ChartCatalog;
  /** Match rival roster (S14): names the rival player in the entry titles. */
  rivalPlayers?: readonly RivalPlayer[];
  /** Grid only: hides the legend and the per-player summary (live console). */
  compact?: boolean;
  className?: string;
}

const TONE_CLASS: Record<ChartTone, string> = {
  POSITIVE: styles.positive,
  NEGATIVE: styles.negative,
};

const TotalsLine: React.FC<{ category: ChartCategory; totals: ChartTotals }> = ({ category, totals }) => (
  <span className={styles.totals}>
    <span className={styles.count}>{totals.count}</span>
    {(category === 'POINTS_ALLOWED' || category === 'OFFENSE') && (
      <span className={styles.points}>{formatChartPoints(totals.points)}</span>
    )}
  </span>
);

/** The coach's paper "Sistemas" sheet: category x period, blue = positive, red = negative. */
export const ChartSheetTable: React.FC<ChartSheetTableProps> = ({
  events,
  players,
  catalog,
  rivalPlayers = [],
  compact = false,
  className,
}) => {
  const sheet = buildChartSheet(events);
  const playersById = new Map(players.map((p) => [p.id, p]));
  const rivalById = new Map(rivalPlayers.map((p) => [p.id, p]));
  const rivalIdByEvent = rivalPlayerIdsByEvent(events);
  const hasEntries = sheet.rows.some((row) => row.total.count > 0);

  const renderCell = (category: ChartCategory, cell: ChartSheetCell) => {
    const codeCounts = category === 'OFFENSE' ? formatCodeCounts(category, cell.codeCounts, catalog) : '';
    return (
      <>
        {cell.entries.length > 0 && (
          <ul className={styles.chips}>
            {cell.entries.map((entry) => {
              const code = findChartCode(category, entry.code, catalog);
              const title = chartEntryTitle(
                category,
                { ...entry, rivalPlayerId: rivalIdByEvent.get(entry.eventId) },
                playersById,
                catalog,
                rivalById
              );
              return (
                <li
                  key={entry.eventId}
                  className={clsx(styles.chip, code && TONE_CLASS[code.tone])}
                  title={title}
                  aria-label={title}
                >
                  {chartEntryTag(entry.playerId, playersById)} {code?.symbol ?? entry.code}
                  {entry.made !== undefined && <span className={styles.result}> {chartEntryResult(entry)}</span>}
                </li>
              );
            })}
          </ul>
        )}
        {cell.count > 0 ? <TotalsLine category={category} totals={cell} /> : <span className={styles.dash}>-</span>}
        {codeCounts && <span className={styles.codeCounts}>{codeCounts}</span>}
      </>
    );
  };

  const summaryRows = compact ? [] : buildChartSummaryRows(events, players, catalog);

  return (
    <div className={clsx(styles.sheet, className)}>
      {!hasEntries && (
        <p className={styles.empty}>
          Todavía no hay entradas en la planilla. Cada entrada que cargues aparece en su categoría y cuarto.
        </p>
      )}
      <div className={clsx(styles.tableWrapper, 'no-scrollbar')}>
        <table className={styles.grid}>
          <caption className="visually-hidden">Planilla táctica por categoría y período</caption>
          <thead>
            <tr>
              <th scope="col" className={clsx(styles.th, styles.categoryCol)}>
                Categoría
              </th>
              {sheet.periods.map((quarter) => (
                <th key={quarter} scope="col" className={styles.th}>
                  <abbr title={QUARTER_LABELS[quarter]}>{QUARTER_SHORT_LABELS[quarter]}</abbr>
                </th>
              ))}
              <th scope="col" className={clsx(styles.th, styles.summaryCol)}>
                1.ª mitad
              </th>
              <th scope="col" className={styles.th}>
                2.ª mitad
              </th>
              <th scope="col" className={clsx(styles.th, styles.totalCol)}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row) => (
              <tr key={row.category}>
                <th scope="row" className={clsx(styles.td, styles.categoryCol)}>
                  {CHART_CATEGORY_LABELS[row.category]}
                </th>
                {sheet.periods.map((quarter) => (
                  <td key={quarter} className={clsx(styles.td, styles.periodCell)}>
                    {renderCell(row.category, row.cells[quarter])}
                  </td>
                ))}
                <td className={clsx(styles.td, styles.summaryCol)}>
                  <TotalsLine category={row.category} totals={row.firstHalf} />
                </td>
                <td className={styles.td}>
                  <TotalsLine category={row.category} totals={row.secondHalf} />
                </td>
                <td className={clsx(styles.td, styles.totalCol)}>
                  <TotalsLine category={row.category} totals={row.total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!compact && (
        <div className={clsx(styles.tableWrapper, 'no-scrollbar')}>
          <table className={styles.summary}>
            <caption className="visually-hidden">Resumen de la planilla por jugador</caption>
            <thead>
              <tr>
                <th scope="col" className={clsx(styles.th, styles.categoryCol)}>
                  Jugador
                </th>
                <th scope="col" className={styles.th}>
                  Pérdidas
                </th>
                <th scope="col" className={styles.th}>
                  Puntos recibidos
                </th>
                <th scope="col" className={styles.th}>
                  Ofensivas
                </th>
                <th scope="col" className={styles.th}>
                  Defensivas
                </th>
                <th scope="col" className={styles.th}>
                  <abbr title="Acciones positivas">+</abbr>
                </th>
                <th scope="col" className={styles.th}>
                  <abbr title="Acciones negativas">−</abbr>
                </th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.key} className={clsx(row.isTeam && styles.teamRow)}>
                  <th scope="row" className={clsx(styles.td, styles.categoryCol)}>
                    <span className={styles.playerCell}>
                      {!row.isTeam && <span className={styles.dorsal}>{row.dorsal ?? '?'}</span>}
                      <span className={styles.playerName}>{row.name}</span>
                    </span>
                  </th>
                  <td className={styles.td}>{row.summary.byCategory.TURNOVER}</td>
                  <td className={styles.td}>
                    {row.summary.byCategory.POINTS_ALLOWED}{' '}
                    <span className={styles.points}>({formatChartPoints(row.summary.pointsAllowed)})</span>
                  </td>
                  <td className={styles.td}>{row.summary.byCategory.OFFENSE}</td>
                  <td className={styles.td}>{row.summary.byCategory.DEFENSE}</td>
                  <td className={clsx(styles.td, styles.positive)}>{row.summary.positive}</td>
                  <td className={clsx(styles.td, styles.negative)}>{row.summary.negative}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!compact && (
        <div className={styles.legend} aria-label="Referencias de la planilla">
          {CHART_CATEGORIES.map((category) => (
            <div key={category} className={styles.legendGroup}>
              <h3 className={styles.legendTitle}>{CHART_CATEGORY_LABELS[category]}</h3>
              <ul className={styles.legendList}>
                {activeChartCodes(catalog, category).map((entry) => (
                  <li key={entry.code} className={styles.legendItem}>
                    <span className={clsx(styles.legendSymbol, TONE_CLASS[entry.tone])}>{entry.symbol}</span>
                    {entry.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
