import React from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import styles from './SectionCard.module.css';

export interface SectionCardProps {
  title: string;
  icon?: LucideIcon;
  /** Optional line under the title. */
  description?: React.ReactNode;
  /** Buttons or links aligned to the right of the title. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  icon: Icon,
  description,
  actions,
  children,
  className,
  bodyClassName,
}) => (
  <section className={clsx(styles.sectionCard, className)}>
    <div className={styles.header}>
      <div className={styles.heading}>
        {Icon && (
          <span className={styles.icon} aria-hidden="true">
            <Icon size={ICON_SIZE.md} />
          </span>
        )}
        <div className={styles.headingText}>
          <h2 className={styles.title}>{title}</h2>
          {description && <p className={styles.description}>{description}</p>}
        </div>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
    <div className={clsx(styles.body, bodyClassName)}>{children}</div>
  </section>
);
