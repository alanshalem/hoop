'use client';

import React, { useState, useRef } from 'react';
import gsap from 'gsap';
import { RefreshCw } from 'lucide-react';
import { Player } from '@/core/domain/entities/club.types';
import { PlayerCard } from '@/presentation/molecules/PlayerCard/PlayerCard';
import clsx from 'clsx';
import styles from './OnCourtLineup.module.css';

export interface OnCourtLineupProps {
  onCourtPlayers: Player[];
  benchPlayers: Player[];
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  onSubstitute: (playerOutId: string, playerInId: string) => void;
  playerStatsMap?: Record<string, { points: number; fouls: number }>;
}

export const OnCourtLineup: React.FC<OnCourtLineupProps> = ({
  onCourtPlayers,
  benchPlayers,
  selectedPlayerId,
  onSelectPlayer,
  onSubstitute,
  playerStatsMap = {},
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Substitution state machine:
  // 1. isSubMode: true
  // 2. pendingPlayerOutId: player on court selected to leave
  // 3. click on bench player -> trigger substitution + GSAP animation!
  const [isSubMode, setIsSubMode] = useState(false);
  const [pendingPlayerOutId, setPendingPlayerOutId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'court' | 'bench'>('court');

  const handlePlayerClick = (player: Player, isOnCourt: boolean) => {
    if (isSubMode) {
      if (isOnCourt) {
        // Select player to sub OUT
        setPendingPlayerOutId(player.id);
        setActiveTab('bench'); // auto-switch tab to pick replacement
      } else {
        // Bench player clicked while sub mode active
        if (pendingPlayerOutId) {
          // Animate and substitute
          const outEl = document.getElementById(`player-card-${pendingPlayerOutId}`);
          const inEl = document.getElementById(`player-card-${player.id}`);

          if (outEl && inEl) {
            gsap.to(outEl, {
              scale: 0.9,
              opacity: 0.5,
              duration: 0.2,
              onComplete: () => {
                onSubstitute(pendingPlayerOutId, player.id);
                setPendingPlayerOutId(null);
                setIsSubMode(false);
                setActiveTab('court');
                gsap.to(outEl, { scale: 1, opacity: 1, duration: 0.2 });
              },
            });
          } else {
            onSubstitute(pendingPlayerOutId, player.id);
            setPendingPlayerOutId(null);
            setIsSubMode(false);
            setActiveTab('court');
          }
        } else {
          alert('Primero toca el jugador en cancha que sale.');
        }
      }
      return;
    }

    // Normal mode: select player for actions
    onSelectPlayer(player.id);
  };

  return (
    <aside ref={containerRef} className={clsx(styles.container, 'no-scrollbar')} aria-label="Quinteto y banca">
      <div className={styles.sectionHeader}>
        <span className={styles.title}>Quinteto en Cancha (5)</span>
        <button
          type="button"
          className={clsx(styles.subBtn, isSubMode && styles.subModeActive)}
          onClick={() => {
            setIsSubMode(!isSubMode);
            setPendingPlayerOutId(null);
          }}
          aria-label="Modo sustitución"
        >
          <RefreshCw size={14} />
          <span>{isSubMode ? 'Cancelar Cambio' : 'Cambio'}</span>
        </button>
      </div>

      {isSubMode && (
        <div style={{ padding: '6px', backgroundColor: 'var(--color-orange-subtle)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-2xs)', color: 'var(--color-orange)', fontWeight: 'bold', textAlign: 'center' }}>
          {pendingPlayerOutId
            ? '2. Toca el jugador de la banca que ENTRA'
            : '1. Toca el jugador en cancha que SALE'}
        </div>
      )}

      {/* TABS (ESPECIALLY USEFUL ON COMPACT TABLET SCREENS) */}
      <div className={styles.tabButtons}>
        <button
          type="button"
          className={clsx(styles.tabBtn, activeTab === 'court' && styles.tabBtnActive)}
          onClick={() => setActiveTab('court')}
        >
          En Cancha ({onCourtPlayers.length})
        </button>
        <button
          type="button"
          className={clsx(styles.tabBtn, activeTab === 'bench' && styles.tabBtnActive)}
          onClick={() => setActiveTab('bench')}
        >
          Banca ({benchPlayers.length})
        </button>
      </div>

      {/* PLAYERS LIST VIEW */}
      <div className={styles.playersColumn}>
        {(activeTab === 'court' ? onCourtPlayers : benchPlayers).map((player) => {
          const isOnCourt = activeTab === 'court';
          const isSelected = selectedPlayerId === player.id;
          const isOutTarget = pendingPlayerOutId === player.id;
          const stats = playerStatsMap[player.id] || { points: 0, fouls: 0 };

          return (
            <div
              key={player.id}
              id={`player-card-${player.id}`}
              className={clsx(
                styles.playerItem,
                isOutTarget && styles.playerOutTarget
              )}
            >
              <PlayerCard
                player={player}
                points={stats.points}
                fouls={stats.fouls}
                isOnCourt={isOnCourt}
                isSelected={isSelected}
                onClick={() => handlePlayerClick(player, isOnCourt)}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
};
