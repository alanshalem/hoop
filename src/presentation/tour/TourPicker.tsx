'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CircleCheck, CircleDashed, CircleSlash, Play, RotateCcw, type LucideIcon } from 'lucide-react';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { TOUR_IDS, WELCOME_TOUR_ID, type TourId } from './tour-model';
import type { TourStatus } from './tour-seen-state';
import { tourEntry } from './tour-entry';
import { getTour } from './tours';
import { useTourControls } from './useScreenTour';
import styles from './TourPicker.module.css';

export interface TourPickerProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_VIEW: Record<TourStatus, { label: string; icon: LucideIcon; className: string }> = {
  completed: { label: 'Visto', icon: CircleCheck, className: styles.statusCompleted },
  skipped: { label: 'Saltado', icon: CircleSlash, className: styles.statusSkipped },
  pending: { label: 'Pendiente', icon: CircleDashed, className: styles.statusPending },
};

/** Replay picker (S12): the welcome tour and every screen tour with their seen status. */
export const TourPicker: React.FC<TourPickerProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const matches = useClubStore((state) => state.matches);
  const { screenTourId, statusOf, startTour, resetAll } = useTourControls();

  const handleStart = (tourId: TourId, href: string) => {
    onClose();
    startTour(tourId);
    // The welcome tour runs on any screen; the others on their own screen.
    if (tourId !== WELCOME_TOUR_ID && tourId !== screenTourId) router.push(href);
  };

  return (
    <ModalSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Tutoriales"
      size="md"
      footer={
        <TouchButton variant="secondary" leftIcon={<RotateCcw size={ICON_SIZE.md} />} onClick={resetAll}>
          Reiniciar todos
        </TouchButton>
      }
    >
      <p className={styles.intro}>
        Elige un recorrido para verlo de nuevo. &quot;Reiniciar todos&quot; hace que cada tutorial vuelva a mostrarse
        automáticamente la próxima vez que abras su pantalla.
      </p>
      <ul className={styles.list}>
        {TOUR_IDS.map((tourId) => {
          const entry = tourEntry(tourId, matches);
          const status = STATUS_VIEW[statusOf(tourId)];
          const StatusIcon = status.icon;
          const title = getTour(tourId).title;
          return (
            <li key={tourId} className={styles.row}>
              <div className={styles.info}>
                <span className={styles.title}>{title}</span>
                <span className={clsx(styles.status, status.className)}>
                  <StatusIcon size={ICON_SIZE.sm} aria-hidden="true" />
                  {status.label}
                </span>
                {'unavailable' in entry && <span className={styles.reason}>{entry.unavailable}</span>}
              </div>
              <TouchButton
                variant={tourId === screenTourId ? 'primary' : 'secondary'}
                leftIcon={<Play size={ICON_SIZE.md} />}
                disabled={'unavailable' in entry}
                aria-label={`Ver tutorial: ${title}`}
                onClick={() => {
                  if ('href' in entry) handleStart(tourId, entry.href);
                }}
              >
                Ver
              </TouchButton>
            </li>
          );
        })}
      </ul>
    </ModalSheet>
  );
};
