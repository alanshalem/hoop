'use client';

import React from 'react';
import { Player } from '@/core/domain/entities/club.types';
import {
  PlayerBoxScore,
  TeamBoxScore,
} from '@/core/domain/rules/basketball-rules';
import { StatBadge } from '@/presentation/atoms/StatBadge/StatBadge';
import clsx from 'clsx';
import styles from './BoxScoreTable.module.css';

export interface BoxScoreTableProps {
  playerBoxScores: Array<{
    player: Player;
    stats: PlayerBoxScore;
  }>;
  teamTotal: TeamBoxScore;
  className?: string;
}

export const BoxScoreTable: React.FC<BoxScoreTableProps> = ({
  playerBoxScores,
  teamTotal,
  className,
}) => {
  return (
    <div className={clsx(styles.tableWrapper, 'no-scrollbar', className)}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={clsx(styles.th, styles.stickyCol)}>Jugador</th>
            <th className={styles.th}>PTS</th>
            <th className={styles.th}>T2 (C/I - %)</th>
            <th className={styles.th}>T3 (C/I - %)</th>
            <th className={styles.th}>TL (C/I - %)</th>
            <th className={styles.th}>TC (C/I - %)</th>
            <th className={styles.th}>REB (O/D/TOT)</th>
            <th className={styles.th}>AST</th>
            <th className={styles.th}>STL</th>
            <th className={styles.th}>BLK</th>
            <th className={styles.th}>TOV</th>
            <th className={styles.th}>FAL</th>
            <th className={styles.th}>+/-</th>
            <th className={styles.th}>VAL (PIR)</th>
          </tr>
        </thead>
        <tbody>
          {playerBoxScores.map(({ player, stats }) => (
            <tr key={player.id}>
              <td className={clsx(styles.td, styles.stickyCol)}>
                <div className={styles.playerCell}>
                  <span className={styles.dorsal}>#{player.dorsal}</span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className={styles.playerName}>
                      {player.lastName}, {player.firstName}
                    </span>
                    <StatBadge position={player.position} />
                  </div>
                </div>
              </td>
              <td className={clsx(styles.td, styles.highlightPts)}>
                {stats.points}
              </td>
              <td className={styles.td}>
                {stats.fg2.made}/{stats.fg2.attempted} ({stats.fg2.percentage}%)
              </td>
              <td className={styles.td}>
                {stats.fg3.made}/{stats.fg3.attempted} ({stats.fg3.percentage}%)
              </td>
              <td className={styles.td}>
                {stats.ft.made}/{stats.ft.attempted} ({stats.ft.percentage}%)
              </td>
              <td className={styles.td}>
                {stats.fgTotal.made}/{stats.fgTotal.attempted} (
                {stats.fgTotal.percentage}%)
              </td>
              <td className={styles.td}>
                {stats.offensiveRebounds}/{stats.defensiveRebounds}/
                <strong style={{ color: 'var(--text-primary)' }}>
                  {stats.totalRebounds}
                </strong>
              </td>
              <td className={styles.td}>{stats.assists}</td>
              <td className={styles.td}>{stats.steals}</td>
              <td className={styles.td}>{stats.blocks}</td>
              <td className={styles.td}>{stats.turnovers}</td>
              <td className={styles.td}>{stats.fouls.total}</td>
              <td
                className={styles.td}
                style={{
                  color:
                    stats.plusMinus > 0
                      ? 'var(--color-green)'
                      : stats.plusMinus < 0
                      ? 'var(--color-red)'
                      : 'var(--text-muted)',
                }}
              >
                {stats.plusMinus > 0 ? `+${stats.plusMinus}` : stats.plusMinus}
              </td>
              <td className={clsx(styles.td, styles.highlightVal)}>
                {stats.pir}
              </td>
            </tr>
          ))}

          {/* TOTALS ROW */}
          <tr className={styles.totalsRow}>
            <td className={clsx(styles.td, styles.stickyCol)}>
              TOTALES EQUIPO
            </td>
            <td className={clsx(styles.td, styles.highlightPts)}>
              {teamTotal.points}
            </td>
            <td className={styles.td}>
              {teamTotal.fg2.made}/{teamTotal.fg2.attempted} (
              {teamTotal.fg2.percentage}%)
            </td>
            <td className={styles.td}>
              {teamTotal.fg3.made}/{teamTotal.fg3.attempted} (
              {teamTotal.fg3.percentage}%)
            </td>
            <td className={styles.td}>
              {teamTotal.ft.made}/{teamTotal.ft.attempted} (
              {teamTotal.ft.percentage}%)
            </td>
            <td className={styles.td}>
              {teamTotal.fgTotal.made}/{teamTotal.fgTotal.attempted} (
              {teamTotal.fgTotal.percentage}%)
            </td>
            <td className={styles.td}>
              {teamTotal.offensiveRebounds}/{teamTotal.defensiveRebounds}/
              <strong style={{ color: 'var(--text-primary)' }}>
                {teamTotal.totalRebounds}
              </strong>
            </td>
            <td className={styles.td}>{teamTotal.assists}</td>
            <td className={styles.td}>{teamTotal.steals}</td>
            <td className={styles.td}>{teamTotal.blocks}</td>
            <td className={styles.td}>{teamTotal.turnovers}</td>
            <td className={styles.td}>{teamTotal.totalFouls}</td>
            <td className={styles.td}>-</td>
            <td className={clsx(styles.td, styles.highlightVal)}>
              {teamTotal.pir}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

