import React from 'react';
import { Flame } from 'lucide-react';
import clsx from 'clsx';
import type { SeasonLeader, SeasonLeaders } from '@/core/domain/rules/season-analytics';
import { SectionCard } from '@/presentation/molecules/SectionCard/SectionCard';
import { JerseyBadge } from '@/presentation/atoms/JerseyBadge/JerseyBadge';
import { formatOneDecimal } from './dashboard-format';
import styles from './ScoringLeaderCard.module.css';

/** Points only: the sheet records scoring plays, nothing else per player. */
const LEADER_CATEGORIES = [{ key: 'points', label: 'Puntos', unit: 'PPG' }] as const;

const LeaderItem: React.FC<{ label: string; unit: string; leader: SeasonLeader | null }> = ({
  label,
  unit,
  leader,
}) => (
  <li className={styles.leaderItem}>
    <span className={styles.leaderLabel}>
      {label} <abbr className={styles.leaderUnit}>{unit}</abbr>
    </span>
    <span className={clsx(styles.leaderValue, 'tabular-nums')}>
      {leader ? formatOneDecimal(leader.value) : '-'}
    </span>
    {leader ? (
      <span className={styles.leaderPlayer}>
        <JerseyBadge dorsal={leader.player.dorsal} size="sm" />
        <span>
          {leader.player.firstName.charAt(0)}. {leader.player.lastName}
        </span>
      </span>
    ) : (
      <span className={styles.leaderEmpty}>Sin datos</span>
    )}
  </li>
);

export interface ScoringLeaderCardProps {
  leaders: SeasonLeaders;
  /** Imported matches only bring the result, so there are no plays to lead (S3). */
  withoutPlays: boolean;
}

export const ScoringLeaderCard: React.FC<ScoringLeaderCardProps> = ({ leaders, withoutPlays }) => (
  <SectionCard
    title="Máximo anotador"
    icon={Flame}
    description={
      withoutPlays
        ? 'Sin jugadas registradas: los partidos del acta solo traen el resultado.'
        : 'Promedio por partido en la temporada'
    }
  >
    <ul className={styles.leadersGrid}>
      {LEADER_CATEGORIES.map((category) => (
        <LeaderItem key={category.key} label={category.label} unit={category.unit} leader={leaders[category.key]} />
      ))}
    </ul>
  </SectionCard>
);
