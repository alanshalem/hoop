'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import { BarChart3, CalendarX2, ClipboardList, Radio, Table2, Target } from 'lucide-react';
import type { Match, Quarter } from '@/core/domain/entities/match.types';
import type { ShootingStats } from '@/core/domain/rules/basketball-rules';
import { calculateMatchBoxScore, getQuarterPartials } from '@/core/domain/rules/match-derivations';
import { useClubStore } from '@/core/application/stores/useClubStore';
import {
  ALL_SHOTS,
  calculateShotEffectiveness,
  selectOwnShots,
} from '@/core/application/hooks/shot-effectiveness';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { SectionCard } from '@/presentation/molecules/SectionCard/SectionCard';
import { FilterChipGroup } from '@/presentation/molecules/FilterChipGroup/FilterChipGroup';
import { FilterChip } from '@/presentation/atoms/FilterChip/FilterChip';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { BoxScoreTable } from '@/presentation/organisms/BoxScoreTable/BoxScoreTable';
import { QuarterPartialsTable } from '@/presentation/organisms/QuarterPartialsTable/QuarterPartialsTable';
import { HalfCourtShotChart } from '@/presentation/organisms/HalfCourtShotChart/HalfCourtShotChart';
import { QUARTER_SHORT_LABELS } from '@/presentation/organisms/ScoreboardHeader/quarter-labels';
import { MatchStatusBadge } from '@/presentation/organisms/MatchCard/MatchStatusBadge';
import {
  MATCH_CONDITION_LABELS,
  formatMatchDate,
  getMatchOutcome,
  isMatchInPlay,
  type MatchOutcome,
} from '@/presentation/organisms/MatchCard/match-display';
import { useScreenTour } from '@/presentation/tour/useScreenTour';
import styles from './page.module.css';

const OUTCOME_LABELS: Record<MatchOutcome, string> = {
  WIN: 'Victoria',
  LOSS: 'Derrota',
  DRAW: 'Empate',
};

const OUTCOME_CLASS: Record<MatchOutcome, string> = {
  WIN: styles.outcomeWin,
  LOSS: styles.outcomeLoss,
  DRAW: styles.outcomeDraw,
};

// cacheComponents: useParams suspends on dynamic routes, so it needs a Suspense boundary.
export default function MatchStatsPage() {
  return (
    <Suspense
      fallback={
        <p className={styles.loading} role="status">
          Cargando planilla...
        </p>
      }
    >
      <MatchStatsGate />
    </Suspense>
  );
}

function MatchStatsGate() {
  const { id } = useParams<{ id: string }>();
  const match = useClubStore((state) => state.matches.find((m) => m.id === id));

  if (!match) {
    return (
      <TabletAppShell>
        <div className="page-container">
          <PageHeader title="Planilla del partido" backHref="/matches" backLabel="Volver a partidos" />
          <EmptyState
            icon={CalendarX2}
            title="Partido no encontrado"
            description="El partido no existe o fue eliminado del calendario."
            action={
              <LinkButton href="/matches" variant="secondary">
                Ir a partidos
              </LinkButton>
            }
          />
        </div>
      </TabletAppShell>
    );
  }

  // Remount (fresh filters) when navigating to another match.
  return <MatchStats key={match.id} match={match} />;
}

const EffectivenessTile: React.FC<{ label: string; stats: ShootingStats }> = ({ label, stats }) => (
  <div className={styles.effTile} data-reveal>
    <span className={styles.effValue}>{stats.percentage}%</span>
    <span className={styles.effLabel}>{label}</span>
    <span className={styles.effDetail}>
      {stats.made}/{stats.attempted}
    </span>
  </div>
);

function MatchStats({ match }: { match: Match }) {
  const players = useClubStore((state) => state.players);
  const [quarterFilter, setQuarterFilter] = useState<Quarter | typeof ALL_SHOTS>(ALL_SHOTS);
  const [playerFilter, setPlayerFilter] = useState<string>(ALL_SHOTS);
  // A scheduled match shows a gate without the sheet, so it declares no tour.
  useScreenTour('stats', { enabled: match.status !== 'SCHEDULED' });

  const { own, rival, outcome } = getMatchOutcome(match);
  const inPlay = isMatchInPlay(match);
  const { date, time } = formatMatchDate(match.date);

  const partials = useMemo(() => getQuarterPartials(match.events, match.condition), [match.events, match.condition]);
  const box = useMemo(() => calculateMatchBoxScore(match), [match]);

  const boxRows = useMemo(
    () =>
      match.rosterOwnPlayerIds.flatMap((playerId) => {
        const player = players.find((p) => p.id === playerId);
        const stats = box.players[playerId];
        return player && stats ? [{ player, stats }] : [];
      }),
    [match.rosterOwnPlayerIds, players, box]
  );

  const shots = useMemo(
    () => selectOwnShots(match.events, { quarter: quarterFilter, playerId: playerFilter }),
    [match.events, quarterFilter, playerFilter]
  );
  const effectiveness = calculateShotEffectiveness(shots);
  const unplacedShots = shots.filter((shot) => !shot.coordinates).length;
  const shooters = boxRows.filter(({ stats }) => stats.fgTotal.attempted > 0);

  const header = (
    <PageHeader
      title={`${match.ownTeamName} vs ${match.rivalTeamName}`}
      subtitle={`${match.tournament} · ${date} ${time} h · ${MATCH_CONDITION_LABELS[match.condition]}${match.venue ? ` · ${match.venue}` : ''}`}
      backHref="/matches"
      backLabel="Volver a partidos"
      actions={
        inPlay && (
          <LinkButton href={`/matches/${match.id}/live`} leftIcon={<Radio size={ICON_SIZE.md} />}>
            Consola en vivo
          </LinkButton>
        )
      }
    />
  );

  if (match.status === 'SCHEDULED') {
    return (
      <TabletAppShell>
        <div className="page-container">
          {header}
          <EmptyState
            icon={ClipboardList}
            title="El partido todavía no comenzó"
            description="La planilla se completa con las jugadas registradas en la consola en vivo."
            action={
              <LinkButton href={`/matches/${match.id}/lineup`} variant="secondary">
                Ver convocatoria
              </LinkButton>
            }
          />
        </div>
      </TabletAppShell>
    );
  }

  return (
    <TabletAppShell>
      <div className="page-container">
        {header}

        <section className={styles.scoreHero} data-surface="board" aria-label="Resultado" data-tour="stats-score">
          <div className={clsx(styles.heroTeam, styles.heroOwn)}>
            <span className={styles.heroName}>{match.ownTeamName}</span>
            <span className={styles.heroScore}>{own}</span>
          </div>
          <div className={styles.heroCenter}>
            <MatchStatusBadge status={match.status} detail={inPlay ? QUARTER_SHORT_LABELS[match.currentQuarter] : undefined} />
            {!inPlay && <span className={clsx(styles.outcome, OUTCOME_CLASS[outcome])}>{OUTCOME_LABELS[outcome]}</span>}
          </div>
          <div className={clsx(styles.heroTeam, styles.heroRival)}>
            <span className={styles.heroScore}>{rival}</span>
            <span className={styles.heroName}>{match.rivalTeamName}</span>
          </div>
        </section>

        <SectionCard title="Parciales por período" icon={Table2} data-tour="stats-partials">
          <QuarterPartialsTable partials={partials} ownName={match.ownTeamName} rivalName={match.rivalTeamName} />
        </SectionCard>

        <SectionCard
          title="Box score"
          icon={BarChart3}
          data-tour="stats-boxscore"
          description="Estadísticas FIBA del equipo. El +/- se mide desde el quinteto inicial."
        >
          {boxRows.length === 0 ? (
            <p className={styles.note}>No hay jugadores convocados para este partido.</p>
          ) : (
            <BoxScoreTable playerBoxScores={boxRows} teamTotal={box.teamTotal} />
          )}
        </SectionCard>

        <SectionCard title="Mapa de tiros" icon={Target} description="Tiros de campo del equipo filtrados por período y jugador.">
          <div className={styles.shotSection}>
            <div className={styles.shotFilters} data-tour="stats-filters">
              <FilterChipGroup label="Período">
                <FilterChip
                  label="Todos"
                  pressed={quarterFilter === ALL_SHOTS}
                  count={selectOwnShots(match.events, { quarter: ALL_SHOTS, playerId: playerFilter }).length}
                  onClick={() => setQuarterFilter(ALL_SHOTS)}
                />
                {partials.map(({ quarter }) => (
                  <FilterChip
                    key={quarter}
                    label={QUARTER_SHORT_LABELS[quarter]}
                    pressed={quarterFilter === quarter}
                    count={selectOwnShots(match.events, { quarter, playerId: playerFilter }).length}
                    onClick={() => setQuarterFilter(quarter)}
                  />
                ))}
              </FilterChipGroup>

              <FilterChipGroup label="Jugador">
                <FilterChip label="Todo el equipo" pressed={playerFilter === ALL_SHOTS} onClick={() => setPlayerFilter(ALL_SHOTS)} />
                {shooters.map(({ player, stats }) => (
                  <FilterChip
                    key={player.id}
                    label={`${player.dorsal} ${player.lastName}`}
                    pressed={playerFilter === player.id}
                    count={stats.fgTotal.attempted}
                    onClick={() => setPlayerFilter(player.id)}
                  />
                ))}
              </FilterChipGroup>

              <div className={styles.effGrid} aria-label="Efectividad por zona">
                <EffectivenessTile label="Dobles" stats={effectiveness.fg2} />
                <EffectivenessTile label="Triples" stats={effectiveness.fg3} />
                <EffectivenessTile label="Total campo" stats={effectiveness.total} />
              </div>

              {unplacedShots > 0 && (
                <p className={styles.note}>
                  {unplacedShots === 1
                    ? '1 tiro registrado desde el pad no tiene ubicación en el mapa.'
                    : `${unplacedShots} tiros registrados desde el pad no tienen ubicación en el mapa.`}
                </p>
              )}
            </div>

            <div className={styles.chartContainer} data-tour="stats-chart">
              <HalfCourtShotChart events={shots} readOnly />
            </div>
          </div>
        </SectionCard>
      </div>
    </TabletAppShell>
  );
}
