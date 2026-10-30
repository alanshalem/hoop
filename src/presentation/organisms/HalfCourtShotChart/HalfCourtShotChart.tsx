'use client';

import React, { useState, useRef } from 'react';
import { RotateCcw, Check, X } from 'lucide-react';
import { PlayByPlayEvent } from '@/core/domain/entities/match.types';
import { Player } from '@/core/domain/entities/club.types';
import clsx from 'clsx';
import styles from './HalfCourtShotChart.module.css';

export interface HalfCourtShotChartProps {
  events: PlayByPlayEvent[];
  selectedPlayer: Player | null;
  onRecordShot: (coords: { x: number; y: number }, is3pt: boolean, isMade: boolean) => void;
  onUndoLastEvent: () => void;
  className?: string;
}

export const HalfCourtShotChart: React.FC<HalfCourtShotChartProps> = ({
  events,
  selectedPlayer,
  onRecordShot,
  onUndoLastEvent,
  className,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Radial popup state
  const [radialPrompt, setRadialPrompt] = useState<{
    xSvg: number;
    ySvg: number;
    xPercent: number;
    yPercent: number;
    xPixel: number;
    yPixel: number;
    is3pt: boolean;
  } | null>(null);

  // Court dimensions in SVG coordinate space: 500w x 470h
  const BASKET_X = 250;
  const BASKET_Y = 60;
  const THREE_POINT_RADIUS = 235; // FIBA 6.75m scaled to SVG

  const handleCourtClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!selectedPlayer) {
      alert('Toca un jugador del quinteto en cancha para asignarle el tiro.');
      return;
    }

    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert pixel coordinates to SVG viewBox (0-500, 0-470)
    const svgX = (clickX / rect.width) * 500;
    const svgY = (clickY / rect.height) * 470;

    // Geometric 2pt vs 3pt detection:
    // Distance from center of hoop
    const distFromHoop = Math.hypot(svgX - BASKET_X, svgY - BASKET_Y);
    // FIBA corners are straight lines at x <= 45 and x >= 455 up to y <= 120
    const isCorner3 = (svgX <= 45 || svgX >= 455) && svgY <= 120;
    const is3pt = isCorner3 || distFromHoop >= THREE_POINT_RADIUS;

    // Normalized coordinates in percentage (0 to 100)
    const xPercent = Math.round((svgX / 500) * 1000) / 10;
    const yPercent = Math.round((svgY / 470) * 1000) / 10;

    setRadialPrompt({
      xSvg: svgX,
      ySvg: svgY,
      xPercent,
      yPercent,
      xPixel: clickX,
      yPixel: clickY,
      is3pt,
    });
  };

  const handleConfirmShot = (isMade: boolean) => {
    if (!radialPrompt) return;

    onRecordShot(
      { x: radialPrompt.xPercent, y: radialPrompt.yPercent },
      radialPrompt.is3pt,
      isMade
    );

    setRadialPrompt(null);
  };

  // Filter shooting events that have coordinates to draw on court
  const shotEvents = events.filter(
    (ev) =>
      ev.coordinates &&
      (ev.type === 'FG2_MADE' ||
        ev.type === 'FG2_MISS' ||
        ev.type === 'FG3_MADE' ||
        ev.type === 'FG3_MISS')
  );

  // Last 5 events for timeline
  const recentEvents = events.slice(-5).reverse();

  return (
    <div className={clsx(styles.container, className)}>
      {/* HEADER / ACTIVE PLAYER PROMPT */}
      <div className={styles.chartHeader}>
        {selectedPlayer ? (
          <div className={styles.activePlayerIndicator}>
            <span className={styles.activeDot} />
            <span>
              Tiro para: #{selectedPlayer.dorsal} {selectedPlayer.lastName}
            </span>
          </div>
        ) : (
          <div className={styles.activePlayerIndicator}>
            <span style={{ color: 'var(--color-amber)', fontSize: '11px' }}>
              👈 Toca un jugador para registrar tiros en cancha
            </span>
          </div>
        )}

        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
          Cancha FIBA (15m x 14m)
        </span>
      </div>

      {/* SVG COURT DISPLAY */}
      <div className={styles.courtWrapper}>
        <svg
          ref={svgRef}
          viewBox="0 0 500 470"
          className={styles.svgCourt}
          onClick={handleCourtClick}
        >
          {/* COURT BOUNDARY */}
          <rect
            x="5"
            y="5"
            width="490"
            height="460"
            className={styles.courtLine}
          />

          {/* BASKETBALL KEY / PAINT AREA */}
          <rect
            x="170"
            y="5"
            width="160"
            height="190"
            className={styles.courtKeyArea}
          />

          {/* FREE THROW CIRCLE (TOP HALF SOLID, BOTTOM DASHED) */}
          <circle
            cx="250"
            cy="195"
            r="60"
            className={styles.courtLine}
          />

          {/* RESTRICTED AREA NO-CHARGE ARC UNDER HOOP */}
          <path
            d="M 220 60 A 30 30 0 0 0 280 60"
            className={styles.courtLine}
          />

          {/* BACKBOARD & HOOP */}
          <line
            x1="220"
            y1="40"
            x2="280"
            y2="40"
            className={styles.courtBackboard}
          />
          <circle cx="250" cy="55" r="14" className={styles.courtHoop} />

          {/* FIBA 3-POINT LINE (CORNER STRAIGHT LINES + 6.75M ARC) */}
          <path
            d="M 45 5 L 45 100 A 235 235 0 0 0 455 100 L 455 5"
            className={styles.courtLine}
          />

          {/* HALF COURT CENTER CIRCLE ARC */}
          <path
            d="M 190 465 A 60 60 0 0 1 310 465"
            className={styles.courtLine}
          />

          {/* DRAW PREVIOUS SHOT MARKERS */}
          {shotEvents.map((ev) => {
            if (!ev.coordinates) return null;
            const xSvg = (ev.coordinates.x / 100) * 500;
            const ySvg = (ev.coordinates.y / 100) * 470;
            const isMade = ev.type === 'FG2_MADE' || ev.type === 'FG3_MADE';

            if (isMade) {
              return (
                <circle
                  key={ev.id}
                  cx={xSvg}
                  cy={ySvg}
                  r="7"
                  className={styles.markerMade}
                />
              );
            }

            return (
              <g key={ev.id} className={styles.markerMiss}>
                <line x1={xSvg - 6} y1={ySvg - 6} x2={xSvg + 6} y2={ySvg + 6} />
                <line x1={xSvg + 6} y1={ySvg - 6} x2={xSvg - 6} y2={ySvg + 6} />
              </g>
            );
          })}
        </svg>

        {/* RADIAL INSTANT ACTION POPUP */}
        {radialPrompt && (
          <div
            className={styles.radialPopup}
            style={{
              left: `${radialPrompt.xPixel}px`,
              top: `${radialPrompt.yPixel}px`,
            }}
          >
            <button
              type="button"
              className={styles.actionMadeBtn}
              onClick={() => handleConfirmShot(true)}
            >
              <Check size={16} style={{ display: 'inline', marginRight: '4px' }} />
              ¡ADENTRO! ({radialPrompt.is3pt ? '+3P' : '+2P'})
            </button>
            <button
              type="button"
              className={styles.actionMissBtn}
              onClick={() => handleConfirmShot(false)}
            >
              <X size={16} style={{ display: 'inline', marginRight: '4px' }} />
              FALLO ({radialPrompt.is3pt ? '3P' : '2P'})
            </button>
            <button
              type="button"
              onClick={() => setRadialPrompt(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0 6px',
              }}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* TIMELINE / UNDO BAR */}
      <div className={styles.timelineBar}>
        <div className={styles.recentEventsList}>
          {recentEvents.length === 0 ? (
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
              Sin jugadas registradas en este período.
            </span>
          ) : (
            recentEvents.map((ev) => (
              <div key={ev.id} className={styles.eventPill}>
                <span style={{ fontWeight: 'bold' }}>{ev.type.replace('_', ' ')}</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  ({ev.scoreAtEvent.home}-{ev.scoreAtEvent.away})
                </span>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          className={styles.undoBtn}
          onClick={onUndoLastEvent}
          title="Deshacer la última acción registrada"
        >
          <RotateCcw size={14} />
          <span>DESHACER (Undo)</span>
        </button>
      </div>
    </div>
  );
};
