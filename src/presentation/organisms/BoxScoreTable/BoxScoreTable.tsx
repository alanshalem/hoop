import React from 'react';
import clsx from 'clsx';
import type { Player } from '@/core/domain/entities/club.types';
import type { PlayerBoxScore, TeamBoxScore } from '@/core/domain/rules/basketball-rules';
import { StatBadge } from '@/presentation/atoms/StatBadge/StatBadge';
import { BOX_SCORE_COLUMNS, type BoxScoreLine } from './box-score-columns';
import styles from './BoxScoreTable.module.css';

export interface BoxScoreTableProps {
  playerBoxScores: Array<{
    player: Player;
    stats: PlayerBoxScore;
  }>;
  teamTotal: TeamBoxScore;
  className?: string;
}

const StatCells: React.FC<{ line: BoxScoreLine }> = ({ line }) =>
  BOX_SCORE_COLUMNS.map((column, index) => (
    <td key={column.label} className={clsx(styles.td, index === 0 && styles.highlightPts)}>
      {column.value(line)}
    </td>
  ));

export const BoxScoreTable: React.FC<BoxScoreTableProps> = ({ playerBoxScores, teamTotal, className }) => (
  <div className={clsx(styles.tableWrapper, 'no-scrollbar', className)}>
    <table className={styles.table}>
      <caption className="visually-hidden">Box score del equipo</caption>
      <thead>
        <tr>
          <th scope="col" className={clsx(styles.th, styles.stickyCol)}>
            Jugador
          </th>
          {BOX_SCORE_COLUMNS.map((column) => (
            <th key={column.label} scope="col" className={styles.th}>
              <abbr title={column.title}>{column.label}</abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {playerBoxScores.map(({ player, stats }) => (
          <tr key={player.id} className={styles.row}>
            <th scope="row" className={clsx(styles.td, styles.stickyCol)}>
              <span className={styles.playerCell}>
                <span className={styles.dorsal}>{player.dorsal}</span>
                <span className={styles.playerText}>
                  <span className={styles.playerName}>
                    {player.lastName}, {player.firstName}
                  </span>
                  <StatBadge position={player.position} />
                </span>
              </span>
            </th>
            <StatCells line={stats} />
          </tr>
        ))}

        <tr className={styles.totalsRow}>
          <th scope="row" className={clsx(styles.td, styles.stickyCol)}>
            Totales equipo
          </th>
          <StatCells line={teamTotal} />
        </tr>
      </tbody>
    </table>
  </div>
);
