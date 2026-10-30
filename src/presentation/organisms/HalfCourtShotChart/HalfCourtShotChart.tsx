'use client';

import React, { useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Crosshair, MousePointerClick, X } from 'lucide-react';
import type { Player } from '@/core/domain/entities/club.types';
import type { PlayByPlayEvent } from '@/core/domain/entities/match.types';
import type { CourtCoordinates } from '@/core/domain/value-objects/coordinates';
import { isFieldGoalAttempt, isFieldGoalMade } from '@/core/domain/rules/event-rules';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { notify } from '@/presentation/organisms/DialogHost/dialog-store';
import styles from './HalfCourtShotChart.module.css';

export interface HalfCourtShotChartProps {
  /** Events to draw; only field goals with coordinates become markers. */
  events: PlayByPlayEvent[];
  /** Shooter for the next tap (live console). */
  selectedPlayer?: Player | null;
  /** Analytical view: markers only, taps do nothing. */
  readOnly?: boolean;
  onRecordShot?: (coordinates: CourtCoordinates, is3pt: boolean, isMade: boolean) => void;
  className?: string;
}

interface PendingShot {
  /** Point in SVG viewBox units. */
  svgX: number;
  svgY: number;
  /** Popup anchor in pixels, relative to the court wrapper. */
  left: number;
  top: number;
  /** Show the popup under the point (taps near the top edge). */
  below: boolean;
  is3pt: boolean;
}

// Court geometry in SVG viewBox units (500 x 470), basket near the top baseline.
const COURT_WIDTH = 500;
const COURT_HEIGHT = 470;
const BASKET_X = 250;
const BASKET_Y = 60;
const THREE_POINT_RADIUS = 235; // FIBA 6.75 m
const CORNER_THREE_X = 45;
const CORNER_THREE_MAX_Y = 120;
const POPUP_HALF_WIDTH = 150;
const POPUP_FLIP_THRESHOLD = 110;

const isThreePointSpot = (x: number, y: number) => {
  const isCorner = (x <= CORNER_THREE_X || x >= COURT_WIDTH - CORNER_THREE_X) && y <= CORNER_THREE_MAX_Y;
  return isCorner || Math.hypot(x - BASKET_X, y - BASKET_Y) >= THREE_POINT_RADIUS;
};

const toPercent = (value: number, size: number) => Math.round((value / size) * 1000) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const HalfCourtShotChart: React.FC<HalfCourtShotChartProps> = ({
  events,
  selectedPlayer = null,
  readOnly = false,
  onRecordShot,
  className,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [pending, setPending] = useState<PendingShot | null>(null);

  const shots = events.filter((ev) => ev.coordinates && isFieldGoalAttempt(ev.type));

  const handleCourtClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly) return;
    if (!selectedPlayer) {
      void notify({
        title: 'Selecciona un jugador',
        message: 'Toca un jugador del quinteto en cancha y después la posición del tiro en la media cancha.',
        tone: 'info',
      });
      return;
    }

    const svg = svgRef.current;
    const wrapper = wrapperRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !wrapper || !matrix) return;

    // Screen -> viewBox, exact even when the court is letterboxed.
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    const svgX = clamp(point.x, 0, COURT_WIDTH);
    const svgY = clamp(point.y, 0, COURT_HEIGHT);

    const rect = wrapper.getBoundingClientRect();
    const left = clamp(e.clientX - rect.left, POPUP_HALF_WIDTH, Math.max(POPUP_HALF_WIDTH, rect.width - POPUP_HALF_WIDTH));
    const top = e.clientY - rect.top;

    setPending({ svgX, svgY, left, top, below: top < POPUP_FLIP_THRESHOLD, is3pt: isThreePointSpot(svgX, svgY) });
  };

  const handleConfirmShot = (isMade: boolean) => {
    if (!pending) return;
    onRecordShot?.(
      { x: toPercent(pending.svgX, COURT_WIDTH), y: toPercent(pending.svgY, COURT_HEIGHT) },
      pending.is3pt,
      isMade
    );
    setPending(null);
  };

  const madeCount = shots.filter((ev) => isFieldGoalMade(ev.type)).length;

  return (
    <div className={clsx(styles.container, className)}>
      <div className={styles.chartHeader}>
        {readOnly ? (
          <span className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.legendMade} aria-hidden="true" /> Convertidos {madeCount}
            </span>
            <span className={styles.legendItem}>
              <X size={ICON_SIZE.sm} className={styles.legendMiss} aria-hidden="true" /> Fallados {shots.length - madeCount}
            </span>
          </span>
        ) : selectedPlayer ? (
          <span className={clsx(styles.playerIndicator, styles.playerIndicatorActive)}>
            <Crosshair size={ICON_SIZE.sm} aria-hidden="true" />
            Tiro para <strong>#{selectedPlayer.dorsal} {selectedPlayer.lastName}</strong>
          </span>
        ) : (
          <span className={styles.playerIndicator}>
            <MousePointerClick size={ICON_SIZE.sm} aria-hidden="true" />
            Elige un jugador en cancha para registrar tiros
          </span>
        )}
        <span className={styles.courtCaption}>Media cancha FIBA</span>
      </div>

      <div ref={wrapperRef} className={styles.courtWrapper}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${COURT_WIDTH} ${COURT_HEIGHT}`}
          className={clsx(styles.svgCourt, readOnly && styles.svgCourtReadOnly)}
          onClick={handleCourtClick}
          role={readOnly ? 'img' : undefined}
          aria-label={readOnly ? `Mapa de tiros: ${madeCount} convertidos de ${shots.length}` : 'Media cancha: toca la posición del tiro'}
        >
          <rect x="5" y="5" width="490" height="460" className={styles.courtLine} />
          <rect x="170" y="5" width="160" height="190" className={styles.courtKeyArea} />
          <circle cx="250" cy="195" r="60" className={styles.courtLine} />
          <path d="M 220 60 A 30 30 0 0 0 280 60" className={styles.courtLine} />
          <line x1="220" y1="40" x2="280" y2="40" className={styles.courtBackboard} />
          <circle cx="250" cy="55" r="14" className={styles.courtHoop} />
          <path d="M 45 5 L 45 100 A 235 235 0 0 0 455 100 L 455 5" className={styles.courtLine} />
          <path d="M 190 465 A 60 60 0 0 1 310 465" className={styles.courtLine} />

          {shots.map((ev) => {
            if (!ev.coordinates) return null;
            const x = (ev.coordinates.x / 100) * COURT_WIDTH;
            const y = (ev.coordinates.y / 100) * COURT_HEIGHT;
            return isFieldGoalMade(ev.type) ? (
              <circle key={ev.id} cx={x} cy={y} r="7" className={styles.markerMade} />
            ) : (
              <g key={ev.id} className={styles.markerMiss}>
                <line x1={x - 6} y1={y - 6} x2={x + 6} y2={y + 6} />
                <line x1={x + 6} y1={y - 6} x2={x - 6} y2={y + 6} />
              </g>
            );
          })}

          {pending && <circle cx={pending.svgX} cy={pending.svgY} r="10" className={styles.markerPending} />}
        </svg>

        {pending && (
          <div
            className={clsx(styles.radialPopup, pending.below && styles.radialPopupBelow)}
            style={{ left: pending.left, top: pending.top }}
            role="dialog"
            aria-label="Resultado del tiro"
          >
            <button type="button" className={styles.actionMadeBtn} onClick={() => handleConfirmShot(true)}>
              <Check size={ICON_SIZE.md} aria-hidden="true" />
              Convertido {pending.is3pt ? '+3' : '+2'}
            </button>
            <button type="button" className={styles.actionMissBtn} onClick={() => handleConfirmShot(false)}>
              <X size={ICON_SIZE.md} aria-hidden="true" />
              Fallado {pending.is3pt ? '3P' : '2P'}
            </button>
            <button
              type="button"
              className={styles.actionCancelBtn}
              onClick={() => setPending(null)}
              aria-label="Cancelar tiro"
            >
              <X size={ICON_SIZE.md} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
