'use client';

import React, { useMemo, useState } from 'react';
import { HeartPulse, Plus, Search, UserPlus, Users } from 'lucide-react';
import clsx from 'clsx';
import {
  BASKETBALL_POSITION_LABELS,
  BasketballPositionSchema,
  PLAYER_STATUS_LABELS,
  Player,
  PlayerPhysicalStatusSchema,
} from '@/core/domain/entities/club.types';
import { can } from '@/core/domain/rules/permissions';
import { calculateMatchBoxScore } from '@/core/domain/rules/match-derivations';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { FilterChipGroup } from '@/presentation/molecules/FilterChipGroup/FilterChipGroup';
import { PlayerCard } from '@/presentation/molecules/PlayerCard/PlayerCard';
import { FilterChip } from '@/presentation/atoms/FilterChip/FilterChip';
import { TextField } from '@/presentation/atoms/TextField/TextField';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import {
  DOMINANT_HAND_LABELS,
  PlayerFormModal,
} from '@/presentation/organisms/PlayerFormModal/PlayerFormModal';
import { isYouthCategory } from '@/presentation/organisms/DivisionFormModal/division-labels';
import styles from './page.module.css';

const ALL = 'ALL';
const NO_TEAM = 'NO_TEAM';

type Facet = 'division' | 'position' | 'status';
type Filters = Record<Facet, string>;

const FACETS: Facet[] = ['division', 'position', 'status'];

export default function PlayersPage() {
  const players = useClubStore((state) => state.players);
  const teams = useClubStore((state) => state.teams);
  const divisions = useClubStore((state) => state.divisions);
  const matches = useClubStore((state) => state.matches);
  const role = useClubStore((state) => state.currentUser.role);
  const callUpPlayerToTeam = useClubStore((state) => state.callUpPlayerToTeam);

  const canManage = can(role, 'MANAGE_PLAYERS');

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({ division: ALL, position: ALL, status: ALL });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [playerToEdit, setPlayerToEdit] = useState<Player | null>(null);

  const divisionIdOf = (player: Player): string =>
    teams.find((t) => t.id === player.teamId)?.divisionId ?? NO_TEAM;
  const divisionOf = (player: Player) => divisions.find((d) => d.id === divisionIdOf(player));

  const facetValue = (player: Player, facet: Facet): string => {
    if (facet === 'division') return divisionIdOf(player);
    if (facet === 'position') return player.position;
    return player.status;
  };

  // Season points per player, from the finished matches of every team.
  const seasonPoints = useMemo(() => {
    const totals = new Map<string, number>();
    for (const match of matches) {
      if (match.status !== 'FINISHED') continue;
      for (const stats of Object.values(calculateMatchBoxScore(match).players)) {
        totals.set(stats.playerId, (totals.get(stats.playerId) ?? 0) + stats.points);
      }
    }
    return totals;
  }, [matches]);

  const query = search.trim().toLowerCase();
  const searched = players.filter(
    (p) =>
      !query ||
      p.firstName.toLowerCase().includes(query) ||
      p.lastName.toLowerCase().includes(query) ||
      p.dorsal.toString() === query
  );

  /** Matches every active filter except `skip` (faceted counts). */
  const matchesFilters = (player: Player, skip?: Facet) =>
    FACETS.every((facet) => facet === skip || filters[facet] === ALL || facetValue(player, facet) === filters[facet]);

  const countFor = (facet: Facet, value: string) =>
    searched.filter((p) => matchesFilters(p, facet) && (value === ALL || facetValue(p, facet) === value))
      .length;

  const visiblePlayers = searched
    .filter((p) => matchesFilters(p))
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'es'));

  const setFilter = (facet: Facet, value: string) => setFilters((current) => ({ ...current, [facet]: value }));

  const hasUnassigned = players.some((p) => divisionIdOf(p) === NO_TEAM);
  const divisionChips = [
    { value: ALL, label: 'Todas' },
    ...divisions.map((d) => ({ value: d.id, label: d.name })),
    ...(hasUnassigned ? [{ value: NO_TEAM, label: 'Sin equipo' }] : []),
  ];
  const positionChips = [
    { value: ALL, label: 'Todas' },
    ...BasketballPositionSchema.options.map((p) => ({ value: p, label: BASKETBALL_POSITION_LABELS[p].short })),
  ];
  const statusChips = [
    { value: ALL, label: 'Todos' },
    ...PlayerPhysicalStatusSchema.options.map((s) => ({ value: s, label: PLAYER_STATUS_LABELS[s] })),
  ];

  const firstTeam = teams.find(
    (t) => divisions.find((d) => d.id === t.divisionId)?.category === 'PRIMERA'
  );

  const openForm = (player: Player | null) => {
    setPlayerToEdit(player);
    setIsFormOpen(true);
  };

  const handleCallUp = (player: Player) => {
    if (!firstTeam) return;
    const fullName = `${player.firstName} ${player.lastName}`;
    const result = callUpPlayerToTeam(player.id, firstTeam.id);
    if (result.ok) {
      notify({
        title: 'Jugador convocado',
        message: `${fullName} ya forma parte del plantel de Primera y puede ser elegido en la convocatoria de sus partidos.`,
        tone: 'success',
      });
    } else if (result.reason === 'ALREADY_IN_TEAM') {
      notify({
        title: 'Ya estaba convocado',
        message: `${fullName} ya figura en el plantel de Primera.`,
        tone: 'warning',
      });
    } else {
      notify({
        title: 'No se pudo convocar',
        message: 'El jugador o el equipo de Primera ya no existen.',
        tone: 'danger',
      });
    }
  };

  const renderChips = (facet: Facet, chips: Array<{ value: string; label: string }>) =>
    chips.map((chip) => (
      <FilterChip
        key={chip.value}
        label={chip.label}
        pressed={filters[facet] === chip.value}
        count={countFor(facet, chip.value)}
        onClick={() => setFilter(facet, chip.value)}
      />
    ));

  return (
    <TabletAppShell>
      <div className="page-container">
        <PageHeader
          title="Jugadores"
          subtitle="Plantel del club, ficha física y médica, y convocatoria de juveniles."
          actions={
            canManage && (
              <TouchButton leftIcon={<Plus size={ICON_SIZE.md} />} onClick={() => openForm(null)}>
                Nuevo jugador
              </TouchButton>
            )
          }
        />

        <section className={styles.filterPanel} aria-label="Búsqueda y filtros">
          <TextField
            label="Buscar jugador"
            type="search"
            placeholder="Apellido, nombre o dorsal"
            leftIcon={<Search size={ICON_SIZE.md} />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <FilterChipGroup label="División">{renderChips('division', divisionChips)}</FilterChipGroup>
          <FilterChipGroup label="Posición">{renderChips('position', positionChips)}</FilterChipGroup>
          <FilterChipGroup label="Estado">{renderChips('status', statusChips)}</FilterChipGroup>
        </section>

        {visiblePlayers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={players.length === 0 ? 'Todavía no hay jugadores' : 'Sin resultados'}
            description={
              players.length === 0
                ? 'Agrega jugadores para armar los planteles de cada división.'
                : 'Ningún jugador coincide con la búsqueda y los filtros elegidos.'
            }
          />
        ) : (
          <ul className={styles.grid}>
            {visiblePlayers.map((player) => {
              const division = divisionOf(player);
              const canCallUp =
                canManage && firstTeam !== undefined && division !== undefined && isYouthCategory(division.category);
              const isCalledUp = firstTeam?.playerIds.includes(player.id) && player.teamId !== firstTeam.id;

              return (
                <li key={player.id} className={styles.playerItem} data-reveal>
                  <PlayerCard
                    player={player}
                    points={seasonPoints.get(player.id) ?? 0}
                    onClick={canManage ? () => openForm(player) : undefined}
                  />

                  <dl className={styles.meta}>
                    <div className={styles.metaItem}>
                      <dt>Altura</dt>
                      <dd className="tabular-nums">{player.heightCm} cm</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>Mano</dt>
                      <dd>{DOMINANT_HAND_LABELS[player.dominantHand]}</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>División</dt>
                      <dd>{division?.name ?? 'Sin equipo'}</dd>
                    </div>
                  </dl>

                  {player.medicalNote && (
                    <p
                      className={clsx(
                        styles.medicalNote,
                        player.status === 'ACTIVE' && styles.medicalNoteResolved
                      )}
                    >
                      <HeartPulse size={ICON_SIZE.sm} aria-hidden="true" />
                      <span>{player.medicalNote}</span>
                    </p>
                  )}

                  {(canCallUp || isCalledUp) && (
                    <div className={styles.itemActions}>
                      {isCalledUp && <span className={styles.calledUpTag}>Convocado a Primera</span>}
                      {canCallUp && (
                        <TouchButton
                          variant="secondary"
                          leftIcon={<UserPlus size={ICON_SIZE.md} />}
                          onClick={() => handleCallUp(player)}
                        >
                          Convocar a Primera
                        </TouchButton>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PlayerFormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} playerToEdit={playerToEdit} />
    </TabletAppShell>
  );
}
