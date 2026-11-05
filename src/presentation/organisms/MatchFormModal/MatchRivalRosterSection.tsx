'use client';

import React, { useId } from 'react';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { IconButton } from '@/presentation/atoms/IconButton/IconButton';
import { formatRivalPlayerCount } from '@/presentation/organisms/RivalTeamFormModal/rival-roster';
import { formatMissingRoster, type MatchRivalRoster, type RosterRow } from './match-rival-roster';
import styles from './MatchFormModal.module.css';

export interface MatchRivalRosterSectionProps {
  /** FOUND or MISSING: the form renders nothing for NONE. */
  roster: Exclude<MatchRivalRoster, { kind: 'NONE' }>;
  /** The shown roster with the form draft applied. */
  rows: RosterRow[];
  divisionName: string;
  rosterName: string;
  canManageRoster: boolean;
  hasPendingRoster: boolean;
  /** Opens the player form: `null` adds a player. */
  onEditPlayer: (row: RosterRow | null) => void;
  onRemovePlayer: (rowKey: string) => void;
}

/** Rival roster of the match form (S16): edits stay in the draft until the match is saved. */
export const MatchRivalRosterSection: React.FC<MatchRivalRosterSectionProps> = ({
  roster,
  rows,
  divisionName,
  rosterName,
  canManageRoster,
  hasPendingRoster,
  onEditPlayer,
  onRemovePlayer,
}) => {
  const titleId = useId();

  return (
    <section className={styles.roster} aria-labelledby={titleId}>
      <div className={styles.rosterHeader}>
        <h3 id={titleId} className={styles.rosterTitle}>
          Plantel rival
        </h3>
        <span className={styles.rosterCount}>{formatRivalPlayerCount(rows.length)}</span>
      </div>
      {roster.kind === 'MISSING' && (
        <p className={styles.rosterNote}>{formatMissingRoster(roster.name, divisionName)}</p>
      )}
      {roster.kind === 'FOUND' && rows.length === 0 && (
        <p className={styles.rosterNote}>Todavía no hay jugadores cargados.</p>
      )}
      {rows.length > 0 && (
        <ul className={styles.rosterList} aria-label={`Plantel de ${rosterName}`}>
          {rows.map((row) => (
            <li key={row.key} className={styles.playerRow}>
              <span className={styles.dorsal}>{row.dorsal}</span>
              <span className={styles.playerName}>
                {row.firstName} <strong>{row.lastName}</strong>
              </span>
              {canManageRoster && (
                <span className={styles.playerActions}>
                  <IconButton
                    aria-label={`Editar a #${row.dorsal} ${row.lastName}`}
                    variant="ghost"
                    icon={<Pencil size={ICON_SIZE.md} />}
                    onClick={() => onEditPlayer(row)}
                  />
                  <IconButton
                    aria-label={`Quitar a #${row.dorsal} ${row.lastName}`}
                    variant="ghost"
                    icon={<Trash2 size={ICON_SIZE.md} />}
                    onClick={() => onRemovePlayer(row.key)}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManageRoster && (
        <TouchButton
          variant="secondary"
          fullWidth
          leftIcon={<UserPlus size={ICON_SIZE.md} />}
          onClick={() => onEditPlayer(null)}
        >
          Agregar jugador
        </TouchButton>
      )}
      {hasPendingRoster && (
        <p className={styles.rosterPending}>
          {roster.kind === 'MISSING'
            ? `Al guardar el partido se crea el rival ${roster.name} en ${divisionName} con estos jugadores.`
            : 'Los cambios del plantel se guardan junto con el partido.'}
        </p>
      )}
    </section>
  );
};
