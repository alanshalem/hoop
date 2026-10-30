'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Radio } from 'lucide-react';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { isMatchInPlay } from '@/presentation/organisms/MatchCard/match-display';

/** Shortcut from the nav rail: opens the match in play, if any. */
export default function CurrentLiveMatchPage() {
  const router = useRouter();
  const liveMatchId = useClubStore((state) => state.matches.find(isMatchInPlay)?.id);

  useEffect(() => {
    if (liveMatchId) router.replace(`/matches/${liveMatchId}/live`);
  }, [liveMatchId, router]);

  return (
    <TabletAppShell>
      <div className="page-container">
        <PageHeader title="Consola en vivo" />
        {liveMatchId ? (
          <EmptyState icon={Radio} title="Abriendo la consola en vivo" description="Cargando el partido en juego." />
        ) : (
          <EmptyState
            icon={Radio}
            title="No hay partidos en juego"
            description="Cuando inicies un partido desde su convocatoria, la consola en vivo se abre desde aquí."
            action={
              <LinkButton href="/matches" leftIcon={<CalendarDays size={ICON_SIZE.md} />}>
                Ir a partidos
              </LinkButton>
            }
          />
        )}
      </div>
    </TabletAppShell>
  );
}
