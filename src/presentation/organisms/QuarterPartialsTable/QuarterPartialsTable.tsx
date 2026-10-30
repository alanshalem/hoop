import React from 'react';
import clsx from 'clsx';
import type { QuarterPartial } from '@/core/domain/rules/match-derivations';
import { QUARTER_LABELS, QUARTER_SHORT_LABELS } from '@/presentation/organisms/ScoreboardHeader/quarter-labels';
import styles from './QuarterPartialsTable.module.css';

export interface QuarterPartialsTableProps {
  /** From getQuarterPartials: Q1-Q4 plus the overtimes that were played. */
  partials: QuarterPartial[];
  ownName: string;
  rivalName: string;
  className?: string;
}

export const QuarterPartialsTable: React.FC<QuarterPartialsTableProps> = ({
  partials,
  ownName,
  rivalName,
  className,
}) => {
  const ownTotal = partials.reduce((sum, p) => sum + p.own, 0);
  const rivalTotal = partials.reduce((sum, p) => sum + p.rival, 0);

  const rows = [
    { key: 'own', name: ownName, total: ownTotal, opponentTotal: rivalTotal, value: (p: QuarterPartial) => p.own, opponent: (p: QuarterPartial) => p.rival },
    { key: 'rival', name: rivalName, total: rivalTotal, opponentTotal: ownTotal, value: (p: QuarterPartial) => p.rival, opponent: (p: QuarterPartial) => p.own },
  ];

  return (
    <div className={clsx(styles.tableWrapper, 'no-scrollbar', className)}>
      <table className={styles.table}>
        <caption className="visually-hidden">Puntos por período</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.teamCol}>
              Equipo
            </th>
            {partials.map((p) => (
              <th key={p.quarter} scope="col">
                <abbr title={QUARTER_LABELS[p.quarter]}>{QUARTER_SHORT_LABELS[p.quarter]}</abbr>
              </th>
            ))}
            <th scope="col" className={styles.finalCol}>
              Final
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={clsx(row.key === 'own' && styles.ownRow)}>
              <th scope="row" className={styles.teamCol}>
                {row.name}
              </th>
              {partials.map((p) => (
                <td key={p.quarter} className={clsx(row.value(p) > row.opponent(p) && styles.periodWon)}>
                  {row.value(p)}
                </td>
              ))}
              <td className={clsx(styles.finalCol, row.total > row.opponentTotal && styles.finalWon)}>{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
