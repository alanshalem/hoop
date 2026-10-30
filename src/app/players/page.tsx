'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Search, UserPlus, ArrowUpRight } from 'lucide-react';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { PlayerCard } from '@/presentation/molecules/PlayerCard/PlayerCard';
import { PlayerFormModal } from '@/presentation/organisms/PlayerFormModal/PlayerFormModal';
import { useClubStore } from '@/core/application/stores/useClubStore';
import {
  BasketballPosition,
  Player,
  PlayerPhysicalStatus,
} from '@/core/domain/entities/club.types';
import clsx from 'clsx';
import styles from './page.module.css';

export default function PlayersPage() {
  const { players, divisions, teams, callUpPlayerToTeam } = useClubStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('ALL');
  const [selectedPosition, setSelectedPosition] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [playerToEdit, setPlayerToEdit] = useState<Player | null>(null);

  // Filtered Players
  const filteredPlayers = useMemo(() => {
    return players.filter((player) => {
      // Search
      const searchLower = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !searchLower ||
        player.lastName.toLowerCase().includes(searchLower) ||
        player.firstName.toLowerCase().includes(searchLower) ||
        player.dorsal.toString().includes(searchLower);

      if (!matchesSearch) return false;

      // Division
      if (selectedDivisionId !== 'ALL') {
        const team = teams.find((t) => t.id === player.teamId);
        if (team?.divisionId !== selectedDivisionId) return false;
      }

      // Position
      if (selectedPosition !== 'ALL' && player.position !== selectedPosition) {
        return false;
      }

      // Status
      if (selectedStatus !== 'ALL' && player.status !== selectedStatus) {
        return false;
      }

      return true;
    });
  }, [
    players,
    teams,
    searchQuery,
    selectedDivisionId,
    selectedPosition,
    selectedStatus,
  ]);

  const handleCallUp = (player: Player) => {
    const primeraTeam = teams.find((t) => t.divisionId === 'div-primera');
    if (!primeraTeam) return;

    callUpPlayerToTeam(player.id, primeraTeam.id);
    alert(
      `¡${player.firstName} ${player.lastName} convocado al plantel de Primera División!`
    );
  };

  const positions: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const statuses: PlayerPhysicalStatus[] = ['ACTIVE', 'INJURED', 'SUSPENDED'];

  return (
    <TabletAppShell>
      <div className={styles.pageContainer}>
        {/* HEADER */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h1 className={styles.pageTitle}>Plantel de Jugadores</h1>
            <p className={styles.pageSubtitle}>
              Gestión de jugadores, ficha médica, dorsales y convocatoria de juveniles.
            </p>
          </div>

          <TouchButton
            variant="primary"
            size="md"
            leftIcon={<Plus size={18} />}
            onClick={() => {
              setPlayerToEdit(null);
              setIsFormModalOpen(true);
            }}
          >
            Nuevo Jugador
          </TouchButton>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div className={styles.filterBar}>
          <div className={styles.searchBox}>
            <Search size={18} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Buscar por apellido, nombre o dorsal..."
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* DIVISION CHIPS */}
          <div className={clsx(styles.filterScrollRow, 'no-scrollbar')}>
            <button
              type="button"
              className={clsx(
                styles.filterChip,
                selectedDivisionId === 'ALL' && styles.filterChipActive
              )}
              onClick={() => setSelectedDivisionId('ALL')}
            >
              Todas las Divisiones
            </button>
            {divisions.map((div) => (
              <button
                key={div.id}
                type="button"
                className={clsx(
                  styles.filterChip,
                  selectedDivisionId === div.id && styles.filterChipActive
                )}
                onClick={() => setSelectedDivisionId(div.id)}
              >
                {div.name}
              </button>
            ))}
          </div>

          {/* POSITION & STATUS CHIPS */}
          <div className={clsx(styles.filterScrollRow, 'no-scrollbar')}>
            <button
              type="button"
              className={clsx(
                styles.filterChip,
                selectedPosition === 'ALL' && styles.filterChipActive
              )}
              onClick={() => setSelectedPosition('ALL')}
            >
              Cualquier Posición
            </button>
            {positions.map((pos) => (
              <button
                key={pos}
                type="button"
                className={clsx(
                  styles.filterChip,
                  selectedPosition === pos && styles.filterChipActive
                )}
                onClick={() => setSelectedPosition(pos)}
              >
                {pos}
              </button>
            ))}

            <span style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-subtle)', margin: '0 4px' }} />

            <button
              type="button"
              className={clsx(
                styles.filterChip,
                selectedStatus === 'ALL' && styles.filterChipActive
              )}
              onClick={() => setSelectedStatus('ALL')}
            >
              Todos los Estados
            </button>
            {statuses.map((st) => (
              <button
                key={st}
                type="button"
                className={clsx(
                  styles.filterChip,
                  selectedStatus === st && styles.filterChipActive
                )}
                onClick={() => setSelectedStatus(st)}
              >
                {st === 'ACTIVE' && 'Disponible'}
                {st === 'INJURED' && 'Lesionado'}
                {st === 'SUSPENDED' && 'Suspendido'}
              </button>
            ))}
          </div>
        </div>

        {/* PLAYERS LIST GRID */}
        {filteredPlayers.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No se encontraron jugadores con los filtros seleccionados.</p>
          </div>
        ) : (
          <div className={styles.playersGrid}>
            {filteredPlayers.map((player) => {
              const team = teams.find((t) => t.id === player.teamId);
              const isJuvenile =
                team?.divisionId === 'div-u19' || team?.divisionId === 'div-u17';

              return (
                <div key={player.id} className={styles.playerCardWrapper}>
                  <PlayerCard
                    player={player}
                    points={0}
                    fouls={0}
                    onClick={() => {
                      setPlayerToEdit(player);
                      setIsFormModalOpen(true);
                    }}
                  />

                  <div className={styles.playerActionsRow}>
                    <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                      {player.heightCm} cm · {player.dominantHand === 'LEFT' ? 'Zurdo' : 'Diestro'}
                    </span>

                    {isJuvenile && (
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={() => handleCallUp(player)}
                        title="Convocar a Primera División"
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <UserPlus size={12} />
                          Convocar a Primera
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MODAL CREAR / EDITAR JUGADOR */}
        <PlayerFormModal
          isOpen={isFormModalOpen}
          onClose={() => setIsFormModalOpen(false)}
          playerToEdit={playerToEdit}
        />
      </div>
    </TabletAppShell>
  );
}
