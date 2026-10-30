import React from 'react';
import clsx from 'clsx';
import { CalendarDays, Clock, MapPin, Trophy } from 'lucide-react';
import type { Match } from '@/core/domain/entities/match.types';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { MatchStatusBadge } from './MatchStatusBadge';
import { MATCH_CONDITION_LABELS, formatMatchDate, isMatchInPlay } from './match-display';
import styles from './MatchCard.module.css';

export interface MatchCardProps {
  match: Match;
  /** Name of the match division; the page passes a fallback when the division was deleted. */
  divisionName: string;
  /** Buttons and links for the match status (decided by the page, RBAC included). */
  actions?: React.ReactNode;
  className?: string;
}

interface TeamSideProps {
  name: string;
  label: string;
  isOwn: boolean;
}

const TeamSide: React.FC<TeamSideProps> = ({ name, label, isOwn }) => (
  <div className={clsx(styles.teamSide, isOwn && styles.teamSideOwn)}>
    <span className={styles.teamName}>{name}</span>
    <span className={styles.teamLabel}>{label}</span>
  </div>
);

/** Calendar card: date, competition, teams (home on the left), score and status. */
export const MatchCard: React.FC<MatchCardProps> = ({ match, divisionName, actions, className }) => {
  const { date, time } = formatMatchDate(match.date);
  const ownIsHome = match.condition === 'HOME';
  const home = ownIsHome ? match.ownTeamName : match.rivalTeamName;
  const away = ownIsHome ? match.rivalTeamName : match.ownTeamName;
  const hasScore = match.status !== 'SCHEDULED';
  const inPlay = isMatchInPlay(match);

  return (
    <article className={clsx(styles.matchCard, inPlay && styles.matchCardLive, className)}>
      <div className={styles.topRow}>
        <div className={styles.when}>
          <span className={styles.whenItem}>
            <CalendarDays size={ICON_SIZE.sm} aria-hidden="true" />
            {date}
          </span>
          <span className={styles.whenItem}>
            <Clock size={ICON_SIZE.sm} aria-hidden="true" />
            <span className="tabular-nums">{time} h</span>
          </span>
        </div>
        <MatchStatusBadge status={match.status} detail={inPlay ? match.currentQuarter : undefined} />
      </div>

      <div className={styles.metaRow}>
        <span className={styles.metaItem}>
          <Trophy size={ICON_SIZE.sm} aria-hidden="true" />
          {match.tournament}
        </span>
        {match.venue && (
          <span className={styles.metaItem}>
            <MapPin size={ICON_SIZE.sm} aria-hidden="true" />
            {match.venue}
          </span>
        )}
        <span className={styles.divisionTag}>{divisionName}</span>
      </div>

      <div className={styles.scoreRow}>
        <TeamSide name={home} label={MATCH_CONDITION_LABELS.HOME} isOwn={ownIsHome} />
        <div
          className={clsx(styles.score, 'tabular-nums')}
          aria-label={hasScore ? `Resultado ${match.homeScore} a ${match.awayScore}` : 'Sin comenzar'}
        >
          {hasScore ? (
            <>
              <span>{match.homeScore}</span>
              <span className={styles.scoreSeparator} aria-hidden="true">
                -
              </span>
              <span>{match.awayScore}</span>
            </>
          ) : (
            <span className={styles.versus}>vs</span>
          )}
        </div>
        <TeamSide name={away} label={MATCH_CONDITION_LABELS.AWAY} isOwn={!ownIsHome} />
      </div>

      {actions && <div className={styles.actionsRow}>{actions}</div>}
    </article>
  );
};
