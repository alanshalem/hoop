import React from 'react';
import clsx from 'clsx';
import { Check, Lock } from 'lucide-react';
import type { Player } from '@/core/domain/entities/club.types';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { formatPlayerHeight } from '@/presentation/player-display';
import { JerseyBadge } from '@/presentation/atoms/JerseyBadge/JerseyBadge';
import { StatBadge } from '@/presentation/atoms/StatBadge/StatBadge';
import { StatusPill } from '@/presentation/atoms/StatusPill/StatusPill';
import styles from './LineupPlayerRow.module.css';

export interface LineupPlayerRowProps {
  player: Player;
  /** Highlights the row (called up / starter). */
  selected?: boolean;
  /** Short label on the right, e.g. "Titular" or "Banco". */
  tag?: string;
  /** Extra information shown under the name. */
  meta?: React.ReactNode;
  /** When provided the row is a toggle button; otherwise it is a static row. */
  onToggle?: () => void;
  disabled?: boolean;
  /** Shows a lock icon: the selection can no longer change. */
  locked?: boolean;
  className?: string;
}

/** Player row shared by the lineup columns and the division roster. */
export const LineupPlayerRow: React.FC<LineupPlayerRowProps> = ({
  player,
  selected = false,
  tag,
  meta,
  onToggle,
  disabled = false,
  locked = false,
  className,
}) => {
  const rowClassName = clsx(
    styles.row,
    selected && styles.rowSelected,
    onToggle && styles.rowInteractive,
    className
  );

  const content = (
    <>
      <JerseyBadge dorsal={player.dorsal} state={selected ? 'onCourt' : 'bench'} size="md" />
      <span className={styles.info}>
        <span className={styles.name}>
          {player.lastName}, {player.firstName}
        </span>
        <span className={styles.metaRow}>
          <StatBadge position={player.position} />
          <span className={clsx(styles.height, 'tabular-nums')}>{formatPlayerHeight(player.heightCm)}</span>
          {player.status !== 'ACTIVE' && <StatusPill status={player.status} />}
          {meta}
        </span>
      </span>
      <span className={styles.trailing}>
        {tag && <span className={clsx(styles.tag, selected && styles.tagSelected)}>{tag}</span>}
        {locked ? (
          <Lock size={ICON_SIZE.sm} className={styles.stateIcon} aria-label="Bloqueado" />
        ) : (
          onToggle && (
            <span className={clsx(styles.check, selected && styles.checkSelected)} aria-hidden="true">
              {selected && <Check size={ICON_SIZE.sm} strokeWidth={3} />}
            </span>
          )
        )}
      </span>
    </>
  );

  if (!onToggle) {
    return <div className={rowClassName}>{content}</div>;
  }

  return (
    <button
      type="button"
      className={rowClassName}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
    >
      {content}
    </button>
  );
};
