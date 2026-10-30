import React from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  /** Renders a back link above the title. */
  backHref?: string;
  backLabel?: string;
  /** Buttons or links aligned to the right (stacked below on mobile). */
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  backHref,
  backLabel = 'Volver',
  actions,
  className,
}) => (
  <header className={clsx(styles.pageHeader, className)}>
    <div className={styles.titleArea}>
      {backHref && (
        <Link href={backHref} className={styles.backLink}>
          <ArrowLeft size={ICON_SIZE.sm} aria-hidden="true" />
          <span>{backLabel}</span>
        </Link>
      )}
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </header>
);
