'use client';

import React, { useState, useMemo, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Users, Crosshair, Zap } from 'lucide-react';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ScoreboardHeader } from '@/presentation/organisms/ScoreboardHeader/ScoreboardHeader';
import { OnCourtLineup } from '@/presentation/organisms/OnCourtLineup/OnCourtLineup';
import { HalfCourtShotChart } from '@/presentation/organisms/HalfCourtShotChart/HalfCourtShotChart';
import { QuickActionPad } from '@/presentation/organisms/QuickActionPad/QuickActionPad';
import { PlayByPlayEventType, Quarter } from '@/core/domain/entities/match.types';
import { calculatePlayerBoxScore } from '@/core/domain/rules/basketball-rules';
import clsx from 'clsx';
import styles from './page.module.css';

function MatchLiveConsoleContent() {
  const params = useParams();
  const matchId = (params?.id as string) || 'match-live-today';

  const {
    matches,
    players,
    addPlayByPlayEvent,
    undoLastPlayByPlayEvent,
    substitutePlayer,
    updateMatch,
  } = useClubStore();

  const match = matches.find((m) => m.id === matchId) || matches[0];

  // Selected player for recording actions
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Mobile layout tab: 'lineup' | 'chart' | 'pad'
  const [mobileTab, setMobileTab] = useState<'lineup' | 'chart' | 'pad'>('chart');

  // Active Lineup (5 on court) and Bench (rest of roster)
  const onCourtIds = useMemo(() => match?.activeLineupOwn || [], [match?.activeLineupOwn]);
  const onCourtPlayers = useMemo(() => {
    return onCourtIds
      .map((id) => players.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
  }, [onCourtIds, players]);

  const benchPlayers = useMemo(() => {
    const rosterIds = match?.rosterOwnPlayerIds || [];
    return rosterIds
      .filter((id) => !onCourtIds.includes(id))
      .map((id) => players.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
  }, [match?.rosterOwnPlayerIds, onCourtIds, players]);

  // Compute live points & fouls for each player in roster
  const playerStatsMap = useMemo(() => {
    const map: Record<string, { points: number; fouls: number }> = {};
    if (!match) return map;

    const allPlayerIds = [...onCourtIds, ...benchPlayers.map((p) => p.id)];
    for (const pid of allPlayerIds) {
      const box = calculatePlayerBoxScore(
        pid,
        match.events || [],
        onCourtIds,
        match.ownTeamId
      );
      map[pid] = { points: box.points, fouls: box.fouls.total };
    }
    return map;
  }, [match, onCourtIds, benchPlayers]);

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId) || null;
  const selectedPlayerFouls = selectedPlayerId
    ? playerStatsMap[selectedPlayerId]?.fouls || 0
    : 0;

  // HANDLERS
  const handleRecordShot = (
    coords: { x: number; y: number },
    is3pt: boolean,
    isMade: boolean
  ) => {
    if (!selectedPlayerId || !match) return;

    let eventType: PlayByPlayEventType;
    if (is3pt) {
      eventType = isMade ? 'FG3_MADE' : 'FG3_MISS';
    } else {
      eventType = isMade ? 'FG2_MADE' : 'FG2_MISS';
    }

    addPlayByPlayEvent(match.id, {
      matchId: match.id,
      quarter: match.currentQuarter,
      quarterTimeRemainingSeconds: match.quarterTimeRemainingSeconds,
      teamId: match.ownTeamId,
      isOwnTeam: true,
      playerId: selectedPlayerId,
      type: eventType,
      coordinates: coords,
    });
  };

  const handleRecordPadAction = (type: PlayByPlayEventType) => {
    if (!selectedPlayerId || !match) return;

    addPlayByPlayEvent(match.id, {
      matchId: match.id,
      quarter: match.currentQuarter,
      quarterTimeRemainingSeconds: match.quarterTimeRemainingSeconds,
      teamId: match.ownTeamId,
      isOwnTeam: true,
      playerId: selectedPlayerId,
      type,
    });
  };

  const handleScoreRival = (points: number) => {
    if (!match) return;
    const eventType: PlayByPlayEventType =
      points === 1 ? 'FT_MADE' : points === 2 ? 'FG2_MADE' : 'FG3_MADE';

    addPlayByPlayEvent(match.id, {
      matchId: match.id,
      quarter: match.currentQuarter,
      quarterTimeRemainingSeconds: match.quarterTimeRemainingSeconds,
      teamId: 'rival-team',
      isOwnTeam: false,
      type: eventType,
    });
  };

  const handleTimeoutRival = () => {
    if (!match) return;
    alert(`Tiempo muerto solicitado por ${match.rivalTeamName}. Reloj detenido.`);
  };

  const handleTimeoutOwn = () => {
    if (!match) return;
    alert(`Tiempo muerto solicitado por ${match.ownTeamName}. Reloj detenido.`);
  };

  const handleQuarterChange = (q: Quarter) => {
    if (!match) return;
    updateMatch(match.id, {
      currentQuarter: q,
      homeFoulsQuarter: 0,
      awayFoulsQuarter: 0,
    });
  };

  if (!match) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>
        Partido no encontrado.
      </div>
    );
  }

  return (
    <div className={styles.liveViewport}>
      {/* 1. ELECTRONIC SCOREBOARD HEADER */}
      <div className={styles.headerArea}>
        <ScoreboardHeader
          match={match}
          onQuarterChange={handleQuarterChange}
          onScoreRival={handleScoreRival}
          onTimeoutRival={handleTimeoutRival}
          onTimeoutOwn={handleTimeoutOwn}
        />
      </div>

      {/* MOBILE SWITCHER TABS (HIDDEN ON TABLET LANDSCAPE >= 900px) */}
      <div className={styles.mobileTabs}>
        <button
          type="button"
          className={clsx(
            styles.mobileTabBtn,
            mobileTab === 'lineup' && styles.mobileTabActive
          )}
          onClick={() => setMobileTab('lineup')}
        >
          <Users size={16} /> Quinteto ({onCourtPlayers.length})
        </button>
        <button
          type="button"
          className={clsx(
            styles.mobileTabBtn,
            mobileTab === 'chart' && styles.mobileTabActive
          )}
          onClick={() => setMobileTab('chart')}
        >
          <Crosshair size={16} /> Cancha / Mapa
        </button>
        <button
          type="button"
          className={clsx(
            styles.mobileTabBtn,
            mobileTab === 'pad' && styles.mobileTabActive
          )}
          onClick={() => setMobileTab('pad')}
        >
          <Zap size={16} /> Acciones Rápidas
        </button>
      </div>

      {/* 2. THREE COLUMN LAYOUT FOR TABLET */}
      <div className={styles.mainConsole}>
        {/* COLUMN 1: QUINTETO EN CANCHA + BANCA */}
        <div
          className={clsx(
            styles.columnSection,
            mobileTab !== 'lineup' && styles.columnHidden
          )}
        >
          <OnCourtLineup
            onCourtPlayers={onCourtPlayers}
            benchPlayers={benchPlayers}
            selectedPlayerId={selectedPlayerId}
            onSelectPlayer={(id) => {
              setSelectedPlayerId(id);
              if (window.innerWidth < 900) setMobileTab('pad');
            }}
            onSubstitute={(outId, inId) => substitutePlayer(match.id, outId, inId)}
            playerStatsMap={playerStatsMap}
          />
        </div>

        {/* COLUMN 2: MEDIA CANCHA INTERACTIVA SVG + TIMELINE */}
        <div
          className={clsx(
            styles.columnSection,
            mobileTab !== 'chart' && styles.columnHidden
          )}
        >
          <HalfCourtShotChart
            events={match.events || []}
            selectedPlayer={selectedPlayer}
            onRecordShot={handleRecordShot}
            onUndoLastEvent={() => undoLastPlayByPlayEvent(match.id)}
          />
        </div>

        {/* COLUMN 3: PAD DE ACCIONES EN 1 TOQUE */}
        <div
          className={clsx(
            styles.columnSection,
            mobileTab !== 'pad' && styles.columnHidden
          )}
        >
          <QuickActionPad
            selectedPlayer={selectedPlayer}
            playerFouls={selectedPlayerFouls}
            onRecordAction={handleRecordPadAction}
            onRequestSub={() => {
              setMobileTab('lineup');
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function MatchLiveConsolePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#fff' }}>Cargando consola en vivo...</div>}>
      <MatchLiveConsoleContent />
    </Suspense>
  );
}
