import React from 'react';
import clsx from 'clsx';
import type { Player } from '@/core/domain/entities/club.types';
import type { PlayerBoxScore, ShootingStats, TeamBoxScore } from '@/core/domain/rules/basketball-rules';
import { StatBadge } from '@/presentation/atoms/StatBadge/StatBadge';
import styles from './BoxScoreTable.module.css';

export interface BoxScoreTableProps {
  playerBoxScores: Array<{
    player: Player;
    stats: PlayerBoxScore;
  }>;
  teamTotal: TeamBoxScore;
  className?: string;
}

const COLUMNS: Array<{ label: string; title: string }> = [
  { label: 'PTS', title: 'Puntos' },
  { label: 'T2', title: 'Dobles convertidos/intentados y porcentaje' },
  { label: 'T3', title: 'Triples convertidos/intentados y porcentaje' },
  { label: 'TL', title: 'Tiros libres convertidos/intentados y porcentaje' },
  { label: 'TC', title: 'Tiros de campo convertidos/intentados y porcentaje' },
  { label: 'REB', title: 'Rebotes ofensivos/defensivos/totales' },
  { label: 'AST', title: 'Asistencias' },
  { label: 'ROB', title: 'Robos' },
  { label: 'TAP', title: 'Tapas' },
  { label: 'PER', title: 'Pérdidas' },
  { label: 'FAL', title: 'Faltas' },
  { label: '+/-', title: 'Diferencia de puntos con el jugador en cancha' },
  { label: 'VAL', title: 'Valoración FIBA (PIR)' },
];

const ShootingCell: React.FC<{ stats: ShootingStats }> = ({ stats }) => (
  <td className={styles.td}>
    {stats.made}/{stats.attempted} <span className={styles.percentage}>{stats.percentage}%</span>
  </td>
);

const ReboundsCell: React.FC<{ offensive: number; defensive: number; total: number }> = ({
  offensive,
  defensive,
  total,
}) => (
  <td className={styles.td}>
    <span className={styles.percentage}>
      {offensive}/{defensive}/
    </span>
    <strong className={styles.strong}>{total}</strong>
  </td>
);

const plusMinusClass = (value: number) =>
  value > 0 ? styles.plusMinusPositive : value < 0 ? styles.plusMinusNegative : styles.plusMinusNeutral;

export const BoxScoreTable: React.FC<BoxScoreTableProps> = ({ playerBoxScores, teamTotal, className }) => (
  <div className={clsx(styles.tableWrapper, 'no-scrollbar', className)}>
    <table className={styles.table}>
      <caption className="visually-hidden">Box score del equipo</caption>
      <thead>
        <tr>
          <th scope="col" className={clsx(styles.th, styles.stickyCol)}>
            Jugador
          </th>
          {COLUMNS.map((column) => (
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
            <td className={clsx(styles.td, styles.highlightPts)}>{stats.points}</td>
            <ShootingCell stats={stats.fg2} />
            <ShootingCell stats={stats.fg3} />
            <ShootingCell stats={stats.ft} />
            <ShootingCell stats={stats.fgTotal} />
            <ReboundsCell
              offensive={stats.offensiveRebounds}
              defensive={stats.defensiveRebounds}
              total={stats.totalRebounds}
            />
            <td className={styles.td}>{stats.assists}</td>
            <td className={styles.td}>{stats.steals}</td>
            <td className={styles.td}>{stats.blocks}</td>
            <td className={styles.td}>{stats.turnovers}</td>
            <td className={clsx(styles.td, stats.fouls.isFouledOut && styles.fouledOut)}>{stats.fouls.total}</td>
            <td className={clsx(styles.td, plusMinusClass(stats.plusMinus))}>
              {stats.plusMinus > 0 ? `+${stats.plusMinus}` : stats.plusMinus}
            </td>
            <td className={clsx(styles.td, styles.highlightVal)}>{stats.pir}</td>
          </tr>
        ))}

        <tr className={styles.totalsRow}>
          <th scope="row" className={clsx(styles.td, styles.stickyCol)}>
            Totales equipo
          </th>
          <td className={clsx(styles.td, styles.highlightPts)}>{teamTotal.points}</td>
          <ShootingCell stats={teamTotal.fg2} />
          <ShootingCell stats={teamTotal.fg3} />
          <ShootingCell stats={teamTotal.ft} />
          <ShootingCell stats={teamTotal.fgTotal} />
          <ReboundsCell
            offensive={teamTotal.offensiveRebounds}
            defensive={teamTotal.defensiveRebounds}
            total={teamTotal.totalRebounds}
          />
          <td className={styles.td}>{teamTotal.assists}</td>
          <td className={styles.td}>{teamTotal.steals}</td>
          <td className={styles.td}>{teamTotal.blocks}</td>
          <td className={styles.td}>{teamTotal.turnovers}</td>
          <td className={styles.td}>{teamTotal.totalFouls}</td>
          <td className={clsx(styles.td, styles.plusMinusNeutral)}>-</td>
          <td className={clsx(styles.td, styles.highlightVal)}>{teamTotal.pir}</td>
        </tr>
      </tbody>
    </table>
  </div>
);
