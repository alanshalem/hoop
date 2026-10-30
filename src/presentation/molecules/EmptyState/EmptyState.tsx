import React from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /** Usually a TouchButton or LinkButton. */
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action, className }) => (
  <div className={clsx(styles.emptyState, className)}>
    {Icon && (
      <span className={styles.iconWrapper} aria-hidden="true">
        <Icon size={ICON_SIZE.xl} />
      </span>
    )}
    <h2 className={styles.title}>{title}</h2>
    {description && <p className={styles.description}>{description}</p>}
    {action && <div className={styles.action}>{action}</div>}
  </div>
);
