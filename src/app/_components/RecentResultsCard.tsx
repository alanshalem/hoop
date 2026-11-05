import React from 'react';
import Link from 'next/link';
import { ChevronRight, History } from 'lucide-react';
import clsx from 'clsx';
import type { Match } from '@/core/domain/entities/match.types';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { SectionCard } from '@/presentation/molecules/SectionCard/SectionCard';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import {
  type MatchOutcome,
  formatMatchDate,
  getMatchOutcome,
} from '@/presentation/organisms/MatchCard/match-display';
import styles from './RecentResultsCard.module.css';

const OUTCOME_LABELS: Record<MatchOutcome, { short: string; long: string }> = {
  WIN: { short: 'G', long: 'Ganado' },
  LOSS: { short: 'P', long: 'Perdido' },
  DRAW: { short: 'E', long: 'Empatado' },
};

const OUTCOME_CLASS: Record<MatchOutcome, string> = {
  WIN: styles.outcomeWin,
  LOSS: styles.outcomeLoss,
  DRAW: styles.outcomeDraw,
};

/** Latest finished matches of the active team, each linking to its stats. */
export const RecentResultsCard: React.FC<{ matches: Match[] }> = ({ matches }) => (
  <SectionCard
    title="Últimos resultados"
    icon={History}
    actions={
      <LinkButton href="/matches" variant="ghost" rightIcon={<ChevronRight size={ICON_SIZE.md} />}>
        Calendario
      </LinkButton>
    }
  >
    {matches.length === 0 ? (
      <p className={styles.emptyLine}>Todavía no hay partidos finalizados.</p>
    ) : (
      <ul className={styles.resultsList}>
        {matches.map((match) => {
          const { own, rival, outcome } = getMatchOutcome(match);
          const { date } = formatMatchDate(match.date);
          return (
            <li key={match.id}>
              <Link href={`/matches/${match.id}/stats`} className={styles.resultRow}>
                <span
                  className={clsx(styles.outcomeBadge, OUTCOME_CLASS[outcome])}
                  aria-label={OUTCOME_LABELS[outcome].long}
                >
                  {OUTCOME_LABELS[outcome].short}
                </span>
                <span className={styles.resultInfo}>
                  <span className={styles.resultRival}>
                    {match.condition === 'HOME' ? 'vs' : 'en'} {match.rivalTeamName}
                  </span>
                  <span className={styles.resultDate}>{date}</span>
                </span>
                <span className={clsx(styles.resultScore, 'tabular-nums')}>
                  {own}-{rival}
                </span>
                <ChevronRight size={ICON_SIZE.md} className={styles.resultChevron} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    )}
  </SectionCard>
);
