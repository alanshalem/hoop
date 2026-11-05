import React from 'react';
import clsx from 'clsx';
import type { SeasonSummary } from '@/core/domain/rules/season-analytics';
import { formatOneDecimal, formatSigned } from './dashboard-format';
import styles from './SeasonKpis.module.css';

/** Record, points for and points against of the active team's season. */
export const SeasonKpis: React.FC<{ summary: SeasonSummary }> = ({ summary }) => (
  <section className={styles.kpiGrid} aria-label="Resumen de temporada" data-tour="dashboard-kpis">
    <div className={styles.kpiCard} data-reveal>
      <span className={styles.kpiLabel}>Récord</span>
      <span className={clsx(styles.kpiValue, 'tabular-nums')}>
        {summary.wins}-{summary.losses}
      </span>
      <span className={styles.kpiSub}>
        {summary.played > 0 ? `${formatOneDecimal(summary.winPct)}% de victorias` : 'Sin partidos finalizados'}
      </span>
    </div>
    <div className={styles.kpiCard} data-reveal>
      <span className={styles.kpiLabel}>Puntos a favor</span>
      <span className={clsx(styles.kpiValue, 'tabular-nums')}>{formatOneDecimal(summary.pointsForAvg)}</span>
      <span
        className={clsx(
          styles.kpiSub,
          summary.diffAvg > 0 && styles.kpiPositive,
          summary.diffAvg < 0 && styles.kpiNegative
        )}
      >
        Diferencial {formatSigned(summary.diffAvg)}
      </span>
    </div>
    <div className={styles.kpiCard} data-reveal>
      <span className={styles.kpiLabel}>Puntos en contra</span>
      <span className={clsx(styles.kpiValue, 'tabular-nums')}>{formatOneDecimal(summary.pointsAgainstAvg)}</span>
      <span className={styles.kpiSub}>
        Promedio en {summary.played} {summary.played === 1 ? 'partido' : 'partidos'}
      </span>
    </div>
  </section>
);
