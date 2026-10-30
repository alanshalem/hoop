import React from 'react';
import clsx from 'clsx';
import styles from './FoulDots.module.css';

export interface FoulDotsProps {
  fouls: number;
  maxFouls?: number;
  size?: 'md' | 'lg';
  className?: string;
}

export const FoulDots: React.FC<FoulDotsProps> = ({
  fouls,
  maxFouls = 5,
  size = 'md',
  className,
}) => {
  const dots = Array.from({ length: maxFouls }, (_, i) => i + 1);

  return (
    <div
      className={clsx(
        styles.foulDotsContainer,
        size === 'lg' && styles.sizeLg,
        className
      )}
      role="group"
      aria-label={`${fouls} de ${maxFouls} faltas cometidas`}
    >
      {dots.map((dotNum) => {
        const isCommitted = fouls >= dotNum;
        let activeClass = '';

        if (isCommitted) {
          if (dotNum <= 3) {
            activeClass = styles.dotActiveGreen;
          } else if (dotNum === 4) {
            activeClass = styles.dotActiveAmber;
          } else {
            activeClass = styles.dotActiveRed;
          }
        }

        return (
          <span
            key={dotNum}
            className={clsx(styles.dot, activeClass)}
            title={`Falta ${dotNum}${isCommitted ? ' (Cometida)' : ''}`}
          />
        );
      })}
    </div>
  );
};
