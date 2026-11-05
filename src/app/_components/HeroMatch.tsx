import React from 'react';
import { ArrowRight, CalendarDays, ClipboardList, Radio } from 'lucide-react';
import clsx from 'clsx';
import type { Match } from '@/core/domain/entities/match.types';
import { formatGameClock } from '@/core/domain/rules/game-clock';
import { isMatchInPlay } from '@/core/domain/rules/match-status';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { MatchStatusBadge } from '@/presentation/organisms/MatchCard/MatchStatusBadge';
import { formatMatchDate } from '@/presentation/organisms/MatchCard/match-display';
import styles from './HeroMatch.module.css';

export interface HeroMatchProps {
  match: Match;
  canManageLineup: boolean;
}

/** Live match scoreboard, or the next scheduled match. */
export const HeroMatch: React.FC<HeroMatchProps> = ({ match, canManageLineup }) => {
  const inPlay = isMatchInPlay(match);
  const ownIsHome = match.condition === 'HOME';
  const { date, time } = formatMatchDate(match.date);
  const teams = [
    { name: ownIsHome ? match.ownTeamName : match.rivalTeamName, score: match.homeScore, isOwn: ownIsHome },
    { name: ownIsHome ? match.rivalTeamName : match.ownTeamName, score: match.awayScore, isOwn: !ownIsHome },
  ];

  return (
    <section
      className={clsx(styles.hero, inPlay && styles.heroLive)}
      aria-label={inPlay ? 'Partido en vivo' : 'Próximo partido'}
      data-surface="board"
      data-tour="dashboard-hero"
    >
      <div className={styles.heroTop}>
        {inPlay ? (
          <MatchStatusBadge status={match.status} />
        ) : (
          <span className={styles.heroEyebrow}>
            <CalendarDays size={ICON_SIZE.sm} aria-hidden="true" />
            Próximo partido · {date} · {time} h
          </span>
        )}
        <span className={styles.heroCompetition}>
          {match.tournament}
          {match.venue && ` · ${match.venue}`}
        </span>
      </div>

      <div className={styles.heroBoard}>
        {teams.map((team, index) => (
          <React.Fragment key={team.name + index}>
            {index === 1 && (
              <div className={styles.heroCenter}>
                {inPlay ? (
                  <>
                    <span className={styles.heroQuarter}>{match.currentQuarter}</span>
                    <span className={clsx(styles.heroClock, 'tabular-nums')}>
                      {formatGameClock(match.quarterTimeRemainingSeconds)}
                    </span>
                  </>
                ) : (
                  <span className={styles.heroVersus}>vs</span>
                )}
              </div>
            )}
            <div className={clsx(styles.heroTeam, team.isOwn && styles.heroTeamOwn)}>
              <span className={styles.heroTeamName}>{team.name}</span>
              {inPlay && <span className={clsx(styles.heroScore, 'tabular-nums')}>{team.score}</span>}
              <span className={styles.heroTeamSide}>{index === 0 ? 'Local' : 'Visitante'}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className={styles.heroActions}>
        {inPlay ? (
          <>
            <LinkButton
              href={`/matches/${match.id}/lineup`}
              variant="secondary"
              size="lg"
              leftIcon={<ClipboardList size={ICON_SIZE.md} />}
            >
              Convocatoria
            </LinkButton>
            <LinkButton
              href={`/matches/${match.id}/live`}
              size="lg"
              leftIcon={<Radio size={ICON_SIZE.md} />}
              rightIcon={<ArrowRight size={ICON_SIZE.md} />}
            >
              Abrir consola en vivo
            </LinkButton>
          </>
        ) : (
          <>
            <LinkButton href="/matches" variant="ghost" size="lg">
              Ver calendario
            </LinkButton>
            <LinkButton
              href={`/matches/${match.id}/lineup`}
              size="lg"
              leftIcon={<ClipboardList size={ICON_SIZE.md} />}
              rightIcon={<ArrowRight size={ICON_SIZE.md} />}
            >
              {canManageLineup ? 'Armar quinteto' : 'Ver convocatoria'}
            </LinkButton>
          </>
        )}
      </div>
    </section>
  );
};
