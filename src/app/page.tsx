'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Flame,
  HeartPulse,
  History,
  Radio,
} from 'lucide-react';
import clsx from 'clsx';
import type { Match } from '@/core/domain/entities/match.types';
import { formatGameClock } from '@/core/domain/rules/game-clock';
import { can } from '@/core/domain/rules/permissions';
import {
  calculateSeasonLeaders,
  calculateSeasonSummary,
  getFinishedTeamMatches,
  type SeasonLeader,
  type SeasonLeaders,
} from '@/core/domain/rules/season-analytics';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { CLUB_PROFILE } from '@/core/infrastructure/club-profile';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { SectionCard } from '@/presentation/molecules/SectionCard/SectionCard';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { FilterChipGroup } from '@/presentation/molecules/FilterChipGroup/FilterChipGroup';
import { FilterChip } from '@/presentation/atoms/FilterChip/FilterChip';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { JerseyBadge } from '@/presentation/atoms/JerseyBadge/JerseyBadge';
import { StatusPill } from '@/presentation/atoms/StatusPill/StatusPill';
import { UserMenu } from '@/presentation/organisms/UserMenu/UserMenu';
import { ClubHero } from '@/presentation/organisms/ClubHero/ClubHero';
import { MatchStatusBadge } from '@/presentation/organisms/MatchCard/MatchStatusBadge';
import { useScreenTour } from '@/presentation/tour/useScreenTour';
import {
  type MatchOutcome,
  formatMatchDate,
  getMatchOutcome,
  hasAnyPlays,
  isMatchInPlay,
  sortMatchesForCalendar,
} from '@/presentation/organisms/MatchCard/match-display';
import styles from './page.module.css';

const RECENT_RESULTS_LIMIT = 5;

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

/** Matches imported from the official reports have no plays, so there is nobody to lead (S3). */
const NO_LEADERS: SeasonLeaders = { points: null };

const formatOneDecimal = (value: number): string =>
  value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const formatSigned = (value: number): string => `${value > 0 ? '+' : ''}${formatOneDecimal(value)}`;

/** Points only: the sheet records scoring plays, nothing else per player. */
const LEADER_CATEGORIES = [{ key: 'points', label: 'Puntos', unit: 'PPG' }] as const;

interface HeroMatchProps {
  match: Match;
  canManageLineup: boolean;
}

/** Live match scoreboard, or the next scheduled match. */
const HeroMatch: React.FC<HeroMatchProps> = ({ match, canManageLineup }) => {
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

export default function DashboardPage() {
  const matches = useClubStore((state) => state.matches);
  const players = useClubStore((state) => state.players);
  const teams = useClubStore((state) => state.teams);
  const divisions = useClubStore((state) => state.divisions);
  const activeDivisionId = useClubStore((state) => state.activeDivisionId);
  const role = useClubStore((state) => state.currentUser.role);
  const setActiveDivision = useClubStore((state) => state.setActiveDivision);
  useScreenTour('dashboard');

  const activeDivision = divisions.find((d) => d.id === activeDivisionId) ?? divisions[0];
  const activeTeam = teams.find((t) => t.divisionId === activeDivision?.id);

  // Live match first, otherwise the soonest scheduled one.
  const [firstInCalendar] = sortMatchesForCalendar(matches);
  const heroMatch = firstInCalendar && firstInCalendar.status !== 'FINISHED' ? firstInCalendar : undefined;

  const summary = activeTeam ? calculateSeasonSummary(matches, activeTeam.id) : null;
  const hasPlays = activeTeam ? hasAnyPlays(getFinishedTeamMatches(matches, activeTeam.id)) : false;
  const leaders = activeTeam
    ? hasPlays
      ? calculateSeasonLeaders(matches, players, activeTeam.id)
      : NO_LEADERS
    : null;
  const recentResults = activeTeam
    ? sortMatchesForCalendar(getFinishedTeamMatches(matches, activeTeam.id)).slice(0, RECENT_RESULTS_LIMIT)
    : [];
  const medicalAlerts = players
    .filter((p) => p.status === 'INJURED' || p.status === 'SUSPENDED')
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'es'));

  const divisionNameOfPlayer = (teamId: string | undefined) => {
    const divisionId = teams.find((t) => t.id === teamId)?.divisionId;
    return divisions.find((d) => d.id === divisionId)?.name ?? 'Sin equipo';
  };

  return (
    <TabletAppShell>
      <div className="page-container">
        <ClubHero
          title="Dashboard"
          subtitle={`${activeDivision?.name ?? CLUB_PROFILE.name} · Temporada ${CLUB_PROFILE.season}`}
          actions={
            // The nav rail holds the role selector on tablet; phones get it here.
            <div className={styles.mobileRoleSwitcher}>
              <UserMenu />
            </div>
          }
        />

        {divisions.length > 1 && (
          <div data-tour="dashboard-divisions">
            <FilterChipGroup label="División del tablero">
              {divisions.map((division) => (
                <FilterChip
                  key={division.id}
                  label={division.name}
                  pressed={division.id === activeDivision?.id}
                  onClick={() => setActiveDivision(division.id)}
                />
              ))}
            </FilterChipGroup>
          </div>
        )}

        {heroMatch ? (
          <HeroMatch match={heroMatch} canManageLineup={can(role, 'MANAGE_LINEUP')} />
        ) : (
          <div>
            <EmptyState
              icon={CalendarDays}
              title="Sin partidos en agenda"
              description="No hay partidos en juego ni programados."
              action={
                <LinkButton href="/matches" variant="secondary">
                  Ir a partidos
                </LinkButton>
              }
            />
          </div>
        )}

        {summary ? (
          <section className={styles.kpiGrid} aria-label="Resumen de temporada" data-tour="dashboard-kpis">
            <div className={styles.kpiCard} data-reveal>
              <span className={styles.kpiLabel}>Récord</span>
              <span className={clsx(styles.kpiValue, 'tabular-nums')}>
                {summary.wins}-{summary.losses}
              </span>
              <span className={styles.kpiSub}>
                {summary.played > 0
                  ? `${formatOneDecimal(summary.winPct)}% de victorias`
                  : 'Sin partidos finalizados'}
              </span>
            </div>
            <div className={styles.kpiCard} data-reveal>
              <span className={styles.kpiLabel}>Puntos a favor</span>
              <span className={clsx(styles.kpiValue, 'tabular-nums')}>
                {formatOneDecimal(summary.pointsForAvg)}
              </span>
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
              <span className={clsx(styles.kpiValue, 'tabular-nums')}>
                {formatOneDecimal(summary.pointsAgainstAvg)}
              </span>
              <span className={styles.kpiSub}>
                Promedio en {summary.played} {summary.played === 1 ? 'partido' : 'partidos'}
              </span>
            </div>
          </section>
        ) : (
          <div>
            <EmptyState
              icon={Flame}
              title="Sin equipo para analizar"
              description="Crea una división para ver el resumen de su temporada."
              action={
                <LinkButton href="/divisions" variant="secondary">
                  Ir a divisiones
                </LinkButton>
              }
            />
          </div>
        )}

        <div className={styles.sectionGrid}>
          {leaders && (
            <div data-reveal data-tour="dashboard-leaders">
              <SectionCard
                title="Máximo anotador"
                icon={Flame}
                description={
                  hasPlays || !summary?.played
                    ? 'Promedio por partido en la temporada'
                    : 'Sin jugadas registradas: los partidos del acta solo traen el resultado.'
                }
              >
                <ul className={styles.leadersGrid}>
                  {LEADER_CATEGORIES.map((category) => (
                    <LeaderItem
                      key={category.key}
                      label={category.label}
                      unit={category.unit}
                      leader={leaders[category.key]}
                    />
                  ))}
                </ul>
              </SectionCard>
            </div>
          )}

          {activeTeam && (
            <div data-reveal>
              <SectionCard
                title="Últimos resultados"
                icon={History}
                actions={
                  <LinkButton href="/matches" variant="ghost" rightIcon={<ChevronRight size={ICON_SIZE.md} />}>
                    Calendario
                  </LinkButton>
                }
              >
                {recentResults.length === 0 ? (
                  <p className={styles.emptyLine}>Todavía no hay partidos finalizados.</p>
                ) : (
                  <ul className={styles.resultsList}>
                    {recentResults.map((match) => {
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
            </div>
          )}

          <div className={styles.fullWidth} data-reveal data-tour="dashboard-medical">
            <SectionCard
              title="Alertas médicas"
              icon={HeartPulse}
              description="Jugadores lesionados o suspendidos de todo el club"
            >
              {medicalAlerts.length === 0 ? (
                <p className={clsx(styles.emptyLine, styles.emptyLineOk)}>
                  <CheckCircle2 size={ICON_SIZE.sm} aria-hidden="true" />
                  Plantel completo: no hay lesionados ni suspendidos.
                </p>
              ) : (
                <ul className={styles.alertsList}>
                  {medicalAlerts.map((player) => (
                    <li key={player.id} className={styles.alertItem}>
                      <JerseyBadge dorsal={player.dorsal} size="sm" />
                      <span className={styles.alertInfo}>
                        <span className={styles.alertName}>
                          {player.lastName}, {player.firstName}
                          <span className={styles.alertDivision}> · {divisionNameOfPlayer(player.teamId)}</span>
                        </span>
                        <span className={clsx(styles.alertNote, !player.medicalNote && styles.alertNoteMissing)}>
                          {player.medicalNote ?? 'Sin parte médico cargado.'}
                        </span>
                      </span>
                      <StatusPill status={player.status} />
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </TabletAppShell>
  );
}
