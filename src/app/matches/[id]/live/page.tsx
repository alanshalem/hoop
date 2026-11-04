'use client';

import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { BarChart3, CalendarX2, ClipboardList } from 'lucide-react';
import { can } from '@/core/domain/rules/permissions';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { getMatchOutcome, isMatchInPlay } from '@/presentation/organisms/MatchCard/match-display';
import { LiveConsole } from './_components/LiveConsole';
import styles from './page.module.css';

const GateShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TabletAppShell>
    <div className="page-container">
      <PageHeader title="Consola en vivo" backHref="/matches" backLabel="Volver a partidos" />
      <div className={styles.gate}>{children}</div>
    </div>
  </TabletAppShell>
);

// cacheComponents: useParams suspends on dynamic routes, so it needs a Suspense boundary.
export default function MatchLiveConsolePage() {
  return (
    <Suspense
      fallback={
        <p className={styles.loading} role="status">
          Cargando consola en vivo...
        </p>
      }
    >
      <MatchLiveConsoleGate />
    </Suspense>
  );
}

function MatchLiveConsoleGate() {
  const { id } = useParams<{ id: string }>();
  const match = useClubStore((state) => state.matches.find((m) => m.id === id));
  const role = useClubStore((state) => state.currentUser.role);

  if (!match) {
    return (
      <GateShell>
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
      </GateShell>
    );
  }

  if (match.status === 'SCHEDULED') {
    const canManageLineup = can(role, 'MANAGE_LINEUP');
    return (
      <GateShell>
        <EmptyState
          icon={ClipboardList}
          title="El partido todavía no comenzó"
          description={`Para abrir la consola contra ${match.rivalTeamName}, primero arma la convocatoria y el quinteto inicial e inicia el partido.`}
          action={
            <LinkButton
              href={`/matches/${match.id}/lineup`}
              leftIcon={<ClipboardList size={ICON_SIZE.md} />}
            >
              {canManageLineup ? 'Armar quinteto' : 'Ver convocatoria'}
            </LinkButton>
          }
        />
      </GateShell>
    );
  }

  if (!isMatchInPlay(match)) {
    const { own, rival } = getMatchOutcome(match);
    return (
      <GateShell>
        <EmptyState
          icon={BarChart3}
          title="El partido ya finalizó"
          description={`${match.ownTeamName} ${own} - ${rival} ${match.rivalTeamName}. Consulta la planilla y el box score del partido.`}
          action={
            <LinkButton href={`/matches/${match.id}/stats`} leftIcon={<BarChart3 size={ICON_SIZE.md} />}>
              Ver planilla
            </LinkButton>
          }
        />
      </GateShell>
    );
  }

  return <LiveConsole key={match.id} matchId={match.id} />;
}
