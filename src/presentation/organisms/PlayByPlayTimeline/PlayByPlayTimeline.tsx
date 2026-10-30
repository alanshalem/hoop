'use client';

import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import clsx from 'clsx';
import { History, Undo2 } from 'lucide-react';
import type { Player } from '@/core/domain/entities/club.types';
import { PLAY_BY_PLAY_EVENT_LABELS, type PlayByPlayEvent } from '@/core/domain/entities/match.types';
import { getEventPoints, isFoulEvent } from '@/core/domain/rules/event-rules';
import { formatGameClock } from '@/core/domain/rules/game-clock';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { QUARTER_SHORT_LABELS } from '@/presentation/organisms/ScoreboardHeader/quarter-labels';
import styles from './PlayByPlayTimeline.module.css';

gsap.registerPlugin(useGSAP);

export interface PlayByPlayTimelineProps {
  /** Full play-by-play; the latest `limit` events are shown, newest first. */
  events: PlayByPlayEvent[];
  players: Player[];
  rivalName: string;
  limit?: number;
  /** Hides the undo button. */
  readOnly?: boolean;
  onUndo?: () => void;
  className?: string;
}

const DEFAULT_LIMIT = 8;

type Tone = 'ownScore' | 'rivalScore' | 'foul' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  ownScore: styles.toneOwnScore,
  rivalScore: styles.toneRivalScore,
  foul: styles.toneFoul,
  neutral: styles.toneNeutral,
};

const toneOf = (event: PlayByPlayEvent): Tone => {
  if (getEventPoints(event.type) > 0) return event.isOwnTeam ? 'ownScore' : 'rivalScore';
  return isFoulEvent(event.type) ? 'foul' : 'neutral';
};

export const PlayByPlayTimeline: React.FC<PlayByPlayTimelineProps> = ({
  events,
  players,
  rivalName,
  limit = DEFAULT_LIMIT,
  readOnly = false,
  onUndo,
  className,
}) => {
  const listRef = useRef<HTMLOListElement | null>(null);
  const recent = events.slice(-limit).reverse();
  const latestId = recent[0]?.id;

  useGSAP(
    () => {
      if (!latestId) return;
      gsap.fromTo(
        `[data-event-id="${latestId}"]`,
        { y: -8, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }
      );
    },
    { dependencies: [latestId], scope: listRef }
  );

  const playerName = (id: string | undefined) => {
    const player = players.find((p) => p.id === id);
    return player ? `#${player.dorsal} ${player.lastName}` : 'Jugador';
  };

  const describe = (event: PlayByPlayEvent) => {
    if (event.substitution) {
      return `Entra ${playerName(event.substitution.playerInId)}, sale ${playerName(event.substitution.playerOutId)}`;
    }
    if (!event.isOwnTeam) return rivalName;
    return event.playerId ? playerName(event.playerId) : 'Equipo';
  };

  return (
    <section className={clsx(styles.timeline, className)} aria-label="Últimas jugadas">
      <div className={styles.header}>
        <h2 className={styles.title}>
          <History size={ICON_SIZE.sm} aria-hidden="true" />
          Últimas jugadas
        </h2>
        {!readOnly && onUndo && (
          <button type="button" className={styles.undoBtn} onClick={onUndo}>
            <Undo2 size={ICON_SIZE.md} aria-hidden="true" />
            Deshacer
          </button>
        )}
      </div>

      {recent.length === 0 ? (
        <p className={styles.empty}>Todavía no hay jugadas registradas.</p>
      ) : (
        <ol ref={listRef} className={clsx(styles.list, 'no-scrollbar')}>
          {recent.map((event) => (
            <li key={event.id} data-event-id={event.id} className={clsx(styles.item, TONE_CLASS[toneOf(event)])}>
              <span className={styles.time}>
                <span className={styles.quarter}>{QUARTER_SHORT_LABELS[event.quarter]}</span>
                {event.gameClockFormatted ?? formatGameClock(event.quarterTimeRemainingSeconds)}
              </span>
              <span className={styles.body}>
                <span className={styles.label}>{PLAY_BY_PLAY_EVENT_LABELS[event.type]}</span>
                <span className={styles.actor}>{describe(event)}</span>
              </span>
              <span className={styles.score}>
                {event.scoreAtEvent.home}-{event.scoreAtEvent.away}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
