import React from 'react';
import clsx from 'clsx';
import styles from './JerseyBadge.module.css';

export type JerseyState = 'default' | 'onCourt' | 'bench' | 'foulWarning' | 'fouledOut';

export interface JerseyBadgeProps {
  dorsal: number | string;
  state?: JerseyState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
}

export const JerseyBadge: React.FC<JerseyBadgeProps> = ({
  dorsal,
  state = 'default',
  size = 'md',
  className,
  ariaLabel,
}) => {
  // Format single digit with zero or as string
  const formattedDorsal = typeof dorsal === 'number' ? (dorsal < 10 ? `0${dorsal}` : `${dorsal}`) : dorsal;

  const stateClass = {
    default: styles.stateDefault,
    onCourt: styles.stateOnCourt,
    bench: styles.stateBench,
    foulWarning: styles.stateFoulWarning,
    fouledOut: styles.stateFouledOut,
  }[state];

  const sizeClass = {
    sm: styles.sizeSm,
    md: styles.sizeMd,
    lg: styles.sizeLg,
  }[size];

  return (
    <div
      className={clsx(
        styles.jerseyBadge,
        stateClass,
        sizeClass,
        state === 'fouledOut' && styles.fouledOutStrikethrough,
        className
      )}
      role="status"
      aria-label={ariaLabel || `Dorsal ${formattedDorsal}, estado ${state}`}
    >
      <span>{formattedDorsal}</span>
    </div>
  );
};

