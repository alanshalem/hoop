'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, ClipboardList, Play, Radio, Save, UserX } from 'lucide-react';
import type { Match } from '@/core/domain/entities/match.types';
import {
  FIBA_MAX_ROSTER,
  FIBA_STARTERS,
  getLineupCandidates,
  validateLineup,
} from '@/core/domain/rules/lineup-rules';
import { can } from '@/core/domain/rules/permissions';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { SectionCard } from '@/presentation/molecules/SectionCard/SectionCard';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { LineupPlayerRow } from '@/presentation/organisms/LineupPlayerRow/LineupPlayerRow';
import { formatMatchDate } from '@/presentation/organisms/MatchCard/match-display';
import { useScreenTour } from '@/presentation/tour/useScreenTour';
import { getLineupMode, initialStarterIds } from '../lineup-state';
import { LineupStatusPanel } from './LineupStatusPanel';
import styles from './LineupEditor.module.css';

/** Roster and starting five of one match; the draft is saved on tip-off (or with "Guardar convocatoria"). */
export function LineupEditor({ match }: { match: Match }) {
  const router = useRouter();
  const players = useClubStore((state) => state.players);
  const teams = useClubStore((state) => state.teams);
  const role = useClubStore((state) => state.currentUser.role);
  const startMatch = useClubStore((state) => state.startMatch);
  const updateMatch = useClubStore((state) => state.updateMatch);
  const setActiveMatch = useClubStore((state) => state.setActiveMatch);

  const mode = getLineupMode(match);
  useScreenTour('lineup');
  const canEdit = can(role, 'MANAGE_LINEUP') && mode !== 'FINISHED';
  const committedRoster = match.rosterOwnPlayerIds;

  const team = teams.find((t) => t.id === match.ownTeamId);
  const candidates = getLineupCandidates(match, team, players);
  const candidateSet = new Set(candidates.map((p) => p.id));

  const [rosterIds, setRosterIds] = useState<string[]>(() =>
    mode === 'SETUP' ? committedRoster.filter((pid) => candidateSet.has(pid)) : committedRoster
  );
  const [starterIds, setStarterIds] = useState<string[]>(() => initialStarterIds(match, mode, rosterIds));

  const rosterPlayers = candidates.filter((p) => rosterIds.includes(p.id));
  const issues = mode === 'SETUP' ? validateLineup(rosterIds, starterIds) : [];
  const injuredInRoster = rosterPlayers.filter((p) => p.status === 'INJURED').length;
  const isRosterDirty = mode === 'IN_PLAY' && rosterIds.length !== committedRoster.length;

  const isLockedInRoster = (playerId: string) => mode === 'IN_PLAY' && committedRoster.includes(playerId);

  const toggleRoster = (playerId: string) => {
    if (isLockedInRoster(playerId)) return;
    if (rosterIds.includes(playerId)) {
      setRosterIds(rosterIds.filter((pid) => pid !== playerId));
      setStarterIds(starterIds.filter((pid) => pid !== playerId));
      return;
    }
    if (rosterIds.length >= FIBA_MAX_ROSTER) {
      notify({
        title: 'Convocatoria completa',
        message: `El reglamento FIBA admite como máximo ${FIBA_MAX_ROSTER} jugadores. Quita a alguien antes de sumar otro.`,
        tone: 'warning',
      });
      return;
    }
    setRosterIds([...rosterIds, playerId]);
  };

  const toggleStarter = (playerId: string) => {
    if (starterIds.includes(playerId)) {
      setStarterIds(starterIds.filter((pid) => pid !== playerId));
      return;
    }
    if (starterIds.length >= FIBA_STARTERS) {
      notify({
        title: 'Quinteto completo',
        message: `Ya elegiste ${FIBA_STARTERS} titulares. Toca uno para pasarlo al banco antes de elegir otro.`,
        tone: 'warning',
      });
      return;
    }
    setStarterIds([...starterIds, playerId]);
  };

  const handleStart = () => {
    const result = startMatch(match.id, rosterIds, starterIds);
    if (result.ok) {
      setActiveMatch(match.id);
      router.push(`/matches/${match.id}/live`);
      return;
    }
    if (result.reason === 'INVALID_LINEUP') {
      notify({
        title: 'No se puede iniciar el partido',
        message: (
          <ul className={styles.dialogList}>
            {result.issues.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
        ),
        tone: 'warning',
      });
      return;
    }
    notify({
      title: 'No se puede iniciar el partido',
      message:
        result.reason === 'MATCH_ALREADY_STARTED'
          ? 'El partido ya fue iniciado.'
          : 'El partido ya no existe.',
      tone: 'danger',
    });
  };

  const handleSaveRoster = () => {
    updateMatch(match.id, { rosterOwnPlayerIds: rosterIds });
    notify({
      title: 'Convocatoria actualizada',
      message: `La lista de buena fe tiene ahora ${rosterIds.length} jugadores.`,
      tone: 'success',
    });
  };

  const { date, time } = formatMatchDate(match.date);

  const headerActions = (() => {
    if (mode === 'FINISHED') {
      return (
        <LinkButton href={`/matches/${match.id}/stats`} leftIcon={<BarChart3 size={ICON_SIZE.md} />}>
          Ver box score
        </LinkButton>
      );
    }
    if (mode === 'IN_PLAY') {
      return (
        <>
          {canEdit && (
            <TouchButton
              variant="secondary"
              leftIcon={<Save size={ICON_SIZE.md} />}
              disabled={!isRosterDirty}
              onClick={handleSaveRoster}
            >
              Guardar convocatoria
            </TouchButton>
          )}
          <LinkButton href={`/matches/${match.id}/live`} leftIcon={<Radio size={ICON_SIZE.md} />}>
            Volver a la consola
          </LinkButton>
        </>
      );
    }
    return (
      canEdit && (
        <TouchButton size="lg" leftIcon={<Play size={ICON_SIZE.md} />} onClick={handleStart} data-tour="lineup-start">
          Iniciar partido
        </TouchButton>
      )
    );
  })();

  const rosterList = mode === 'FINISHED' ? rosterPlayers : candidates;

  return (
    <TabletAppShell>
      <div className="page-container">
        <PageHeader
          title="Quinteto y convocatoria"
          subtitle={`${match.ownTeamName} vs ${match.rivalTeamName} · ${date} ${time} h · ${match.tournament}`}
          backHref="/matches"
          backLabel="Volver a partidos"
          actions={headerActions}
        />

        <LineupStatusPanel
          match={match}
          mode={mode}
          canEdit={canEdit}
          rosterCount={rosterIds.length}
          starterCount={starterIds.length}
          issues={issues}
          injuredInRoster={injuredInRoster}
        />

        <div className={styles.columns}>
          <SectionCard
            title="Convocatoria"
            icon={ClipboardList}
            data-tour="lineup-roster"
            description={
              mode === 'FINISHED'
                ? 'Jugadores que integraron la lista de buena fe.'
                : `Toca un jugador para convocarlo (máximo ${FIBA_MAX_ROSTER}).`
            }
          >
            {rosterList.length === 0 ? (
              <EmptyState
                icon={UserX}
                title="Sin jugadores disponibles"
                description="El equipo de este partido no tiene jugadores habilitados. Los suspendidos no pueden ser convocados."
              />
            ) : (
              <ul className={styles.playerList}>
                {rosterList.map((player) => {
                  const selected = rosterIds.includes(player.id);
                  const locked = isLockedInRoster(player.id);
                  return (
                    <li key={player.id}>
                      <LineupPlayerRow
                        player={player}
                        selected={selected}
                        tag={selected ? 'Convocado' : undefined}
                        locked={locked}
                        meta={
                          player.status === 'INJURED' && player.medicalNote ? (
                            <span className={styles.medicalNote}>{player.medicalNote}</span>
                          ) : undefined
                        }
                        onToggle={canEdit && !locked ? () => toggleRoster(player.id) : undefined}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Quinteto inicial"
            icon={Play}
            data-tour="lineup-starters"
            description={
              mode === 'SETUP'
                ? `Elige exactamente ${FIBA_STARTERS} titulares entre los convocados.`
                : 'Quinteto que saltó a la cancha.'
            }
          >
            {rosterPlayers.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Sin convocados"
                description="Primero convoca jugadores para elegir el quinteto inicial."
              />
            ) : (
              <ul className={styles.playerList}>
                {rosterPlayers.map((player) => {
                  const selected = starterIds.includes(player.id);
                  return (
                    <li key={player.id}>
                      <LineupPlayerRow
                        player={player}
                        selected={selected}
                        tag={selected ? 'Titular' : 'Banco'}
                        locked={mode !== 'SETUP' && selected}
                        onToggle={mode === 'SETUP' && canEdit ? () => toggleStarter(player.id) : undefined}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </TabletAppShell>
  );
}
