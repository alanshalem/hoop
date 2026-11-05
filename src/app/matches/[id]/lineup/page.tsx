'use client';

import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { CalendarX2 } from 'lucide-react';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { LineupEditor } from './_components/LineupEditor';
import styles from './page.module.css';

// cacheComponents: useParams suspends on dynamic routes, so it needs a Suspense boundary.
export default function MatchLineupPage() {
  return (
    <Suspense
      fallback={
        <p className={styles.loading} role="status">
          Cargando convocatoria...
        </p>
      }
    >
      <MatchLineupContent />
    </Suspense>
  );
}

function MatchLineupContent() {
  const { id } = useParams<{ id: string }>();
  const match = useClubStore((state) => state.matches.find((m) => m.id === id));

  if (!match) {
    return (
      <TabletAppShell>
        <div className="page-container">
          <PageHeader title="Quinteto y convocatoria" backHref="/matches" backLabel="Volver a partidos" />
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

  // Remount the editor (fresh draft) when navigating to another match.
  return <LineupEditor key={match.id} match={match} />;
}
