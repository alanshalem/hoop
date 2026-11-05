'use client';

import { Suspense, useMemo } from 'react';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import { BarChart3, CalendarX2, ClipboardList, Radio, Table2 } from 'lucide-react';
import type { Match } from '@/core/domain/entities/match.types';
import { calculateMatchBoxScore, getQuarterPartials } from '@/core/domain/rules/match-derivations';
import { isMatchInPlay } from '@/core/domain/rules/match-status';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { selectChartCatalog, selectRivalRoster } from '@/core/application/stores/club-state';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { SectionCard } from '@/presentation/molecules/SectionCard/SectionCard';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { BoxScoreTable } from '@/presentation/organisms/BoxScoreTable/BoxScoreTable';
import { QuarterPartialsTable } from '@/presentation/organisms/QuarterPartialsTable/QuarterPartialsTable';
import { ChartSheetTable } from '@/presentation/organisms/ChartSheetTable/ChartSheetTable';
import { QUARTER_SHORT_LABELS } from '@/presentation/organisms/ScoreboardHeader/quarter-labels';
import { MatchStatusBadge } from '@/presentation/organisms/MatchCard/MatchStatusBadge';
import { OfficialResultBadge } from '@/presentation/organisms/MatchCard/OfficialResultBadge';
import {
  MATCH_CONDITION_LABELS,
  formatMatchDate,
  getMatchOutcome,
  hasOnlyOfficialResult,
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

  // Remount when navigating to another match.
  return <MatchStats key={match.id} match={match} />;
}

function MatchStats({ match }: { match: Match }) {
  const players = useClubStore((state) => state.players);
  const chartCatalog = useClubStore(selectChartCatalog);
  // Stable reference: the rival team's players, or one shared empty list (S14).
  const rivalRoster = useClubStore((state) => selectRivalRoster(state, match));
  // A scheduled match shows a gate without the sheet, so it declares no tour.
  useScreenTour('stats', { enabled: match.status !== 'SCHEDULED' });

  const { own, rival, outcome } = getMatchOutcome(match);
  const inPlay = isMatchInPlay(match);
  const officialOnly = hasOnlyOfficialResult(match);
  const { date, time } = formatMatchDate(match.date);

  const partials = useMemo(() => getQuarterPartials(match), [match]);
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

        {officialOnly && (
          <div className={styles.officialNote} role="note">
            <OfficialResultBadge />
            <p>
              El resultado y los parciales vienen del acta oficial. El partido no tiene jugadas cargadas, por eso la
              planilla y el box score quedan vacíos.
            </p>
          </div>
        )}

        <SectionCard
          title="Planilla"
          icon={ClipboardList}
          description="Planilla táctica cargada en vivo: azul = acción positiva, rojo = negativa."
        >
          <ChartSheetTable
            events={match.events}
            players={players}
            catalog={chartCatalog}
            rivalPlayers={rivalRoster}
          />
        </SectionCard>

        <SectionCard title="Parciales por período" icon={Table2} data-tour="stats-partials">
          <QuarterPartialsTable partials={partials} ownName={match.ownTeamName} rivalName={match.rivalTeamName} />
        </SectionCard>

        <SectionCard
          title="Box score"
          icon={BarChart3}
          data-tour="stats-boxscore"
          description="Puntos de cada convocado según las jugadas de puntos de la planilla: tiros libres, dobles y triples convertidos."
        >
          {boxRows.length === 0 ? (
            <p className={styles.note}>No hay jugadores convocados para este partido.</p>
          ) : (
            <BoxScoreTable playerBoxScores={boxRows} teamTotal={box.teamTotal} />
          )}
        </SectionCard>
      </div>
    </TabletAppShell>
  );
}
