'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, CheckCircle2, AlertCircle, Play, ArrowLeft } from 'lucide-react';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { JerseyBadge } from '@/presentation/atoms/JerseyBadge/JerseyBadge';
import { StatBadge } from '@/presentation/atoms/StatBadge/StatBadge';
import { useClubStore } from '@/core/application/stores/useClubStore';
import clsx from 'clsx';
import styles from './page.module.css';

export default function MatchLineupPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params?.id as string;

  const { matches, players, setStartingLineup, updateMatch } = useClubStore();
  const match = matches.find((m) => m.id === matchId) || matches[0];

  // Eligible players
  const availablePlayers = players.filter((p) => p.status !== 'SUSPENDED');

  // Selected Roster (10-12 players) and Starters (exactly 5)
  const [rosterIds, setRosterIds] = useState<string[]>([]);
  const [starterIds, setStarterIds] = useState<string[]>([]);

  useEffect(() => {
    if (match) {
      if (match.rosterOwnPlayerIds && match.rosterOwnPlayerIds.length > 0) {
        setRosterIds(match.rosterOwnPlayerIds);
      } else {
        // Default first 12 players
        setRosterIds(availablePlayers.slice(0, 12).map((p) => p.id));
      }

      if (match.activeLineupOwn && match.activeLineupOwn.length === 5) {
        setStarterIds(match.activeLineupOwn);
      } else {
        // Default first 5 players
        setStarterIds(availablePlayers.slice(0, 5).map((p) => p.id));
      }
    }
  }, [match]);

  const toggleRoster = (playerId: string) => {
    if (rosterIds.includes(playerId)) {
      // Remove from roster and starters
      setRosterIds((prev) => prev.filter((id) => id !== playerId));
      setStarterIds((prev) => prev.filter((id) => id !== playerId));
    } else {
      if (rosterIds.length >= 12) {
        alert('El reglamento FIBA permite un máximo de 12 jugadores en la planilla.');
        return;
      }
      setRosterIds((prev) => [...prev, playerId]);
    }
  };

  const toggleStarter = (playerId: string) => {
    if (starterIds.includes(playerId)) {
      setStarterIds((prev) => prev.filter((id) => id !== playerId));
    } else {
      if (starterIds.length >= 5) {
        alert('Debe haber exactamente 5 jugadores titulares en el quinteto inicial.');
        return;
      }
      // Ensure player is in roster
      if (!rosterIds.includes(playerId)) {
        setRosterIds((prev) => [...prev, playerId]);
      }
      setStarterIds((prev) => [...prev, playerId]);
    }
  };

  const handleStartMatch = () => {
    if (starterIds.length !== 5) {
      alert('Debes seleccionar exactamente 5 titulares para el salto inicial.');
      return;
    }

    setStartingLineup(match.id, starterIds);
    updateMatch(match.id, {
      status: 'LIVE',
      rosterOwnPlayerIds: rosterIds,
    });

    router.push(`/matches/${match.id}/live`);
  };

  const isValidStarters = starterIds.length === 5;

  return (
    <TabletAppShell>
      <div className={styles.container}>
        {/* HEADER */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <button
              type="button"
              onClick={() => router.back()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                marginBottom: '8px',
                fontSize: 'var(--text-xs)',
              }}
            >
              <ArrowLeft size={16} /> Volver al Calendario
            </button>
            <h1 className={styles.title}>Quinteto Inicial y Convocatoria</h1>
            <p className={styles.subtitle}>
              {match?.ownTeamName} vs {match?.rivalTeamName} · {match?.tournament}
            </p>
          </div>

          <TouchButton
            variant="primary"
            size="lg"
            leftIcon={<Play size={18} />}
            disabled={!isValidStarters}
            onClick={handleStartMatch}
          >
            INICIAR PARTIDO EN VIVO
          </TouchButton>
        </div>

        {/* VALIDATION STATUS BAR */}
        <div className={styles.validationBar}>
          <div className={styles.countsGroup}>
            <div className={styles.countItem}>
              <span className={styles.countNum}>{starterIds.length} / 5</span>
              <span className={styles.countLabel}>Titulares en Cancha</span>
            </div>
            <div className={styles.countItem}>
              <span className={styles.countNum}>{rosterIds.length} / 12</span>
              <span className={styles.countLabel}>Convocados en Planilla</span>
            </div>
          </div>

          <div>
            {isValidStarters ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-green)', fontSize: 'var(--text-xs)', fontWeight: 'bold' }}>
                <CheckCircle2 size={16} /> Quinteto inicial completo
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-amber)', fontSize: 'var(--text-xs)', fontWeight: 'bold' }}>
                <AlertCircle size={16} /> Selecciona 5 titulares para habilitar
              </span>
            )}
          </div>
        </div>

        {/* TWO COLUMN INTERFACE: STARTERS VS ROSTER */}
        <div className={styles.columnsLayout}>
          {/* COLUMN 1: STARTING FIVE SELECTION */}
          <div className={styles.column}>
            <div className={styles.columnHeader}>
              <h2 className={styles.colTitle}>1. Quinteto Titular (5 Jugadores)</h2>
              <span className={styles.badge}>Tocar para alternar titular</span>
            </div>

            <div className={styles.playersList}>
              {rosterIds.map((pid) => {
                const player = players.find((p) => p.id === pid);
                if (!player) return null;
                const isStarter = starterIds.includes(player.id);

                return (
                  <div
                    key={player.id}
                    className={clsx(
                      styles.lineupCard,
                      isStarter && styles.isStarter
                    )}
                    onClick={() => toggleStarter(player.id)}
                  >
                    <div className={styles.playerLeft}>
                      <JerseyBadge
                        dorsal={player.dorsal}
                        state={isStarter ? 'onCourt' : 'bench'}
                        size="md"
                      />
                      <div className={styles.playerInfo}>
                        <span className={styles.name}>
                          {player.lastName}, {player.firstName}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <StatBadge position={player.position} />
                          <span className={styles.positionText}>
                            {player.heightCm} cm
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      {isStarter ? (
                        <span className={styles.tagStarter}>TITULAR</span>
                      ) : (
                        <span className={styles.tagBench}>BANCA</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUMN 2: FULL ROSTER (CONVOCADOS) */}
          <div className={styles.column}>
            <div className={styles.columnHeader}>
              <h2 className={styles.colTitle}>2. Plantel Disponible del Club</h2>
              <span className={styles.badge}>Convocados ({rosterIds.length}/12)</span>
            </div>

            <div className={styles.playersList}>
              {availablePlayers.map((player) => {
                const isSelectedInRoster = rosterIds.includes(player.id);

                return (
                  <div
                    key={player.id}
                    className={clsx(
                      styles.lineupCard,
                      isSelectedInRoster && styles.isStarter
                    )}
                    onClick={() => toggleRoster(player.id)}
                  >
                    <div className={styles.playerLeft}>
                      <JerseyBadge
                        dorsal={player.dorsal}
                        state={isSelectedInRoster ? 'onCourt' : 'default'}
                        size="sm"
                      />
                      <div className={styles.playerInfo}>
                        <span className={styles.name}>
                          {player.lastName}, {player.firstName}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <StatBadge position={player.position} />
                          <span className={styles.positionText}>
                            {player.status === 'INJURED' ? '⚠️ Con molestia' : 'Disponible'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <span className={isSelectedInRoster ? styles.tagStarter : styles.tagBench}>
                        {isSelectedInRoster ? 'CONVOCADO' : 'NO CONVOCADO'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </TabletAppShell>
  );
}
