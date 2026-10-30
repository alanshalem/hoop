import React from 'react';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { ManualToc } from './ManualToc';
import type { ManualDocument } from './render-manual';
import styles from './ManualView.module.css';

export interface ManualViewProps {
  manual: ManualDocument;
  /** Header slot for page actions, such as replaying the guided tour. */
  actions?: React.ReactNode;
}

/** In-app system manual (S11): header, table of contents and the rendered docs/MANUAL.md. */
export const ManualView: React.FC<ManualViewProps> = ({ manual, actions }) => (
  <div className="page-container">
    <PageHeader title="Ayuda" subtitle={manual.title ?? undefined} actions={actions} />
    <div className={styles.layout}>
      <ManualToc entries={manual.toc} />
      {/* Trusted repository content; render-manual escapes any raw HTML. */}
      <article className={styles.prose} dangerouslySetInnerHTML={{ __html: manual.html }} />
    </div>
  </div>
);
