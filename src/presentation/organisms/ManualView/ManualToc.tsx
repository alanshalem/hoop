'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ListTree } from 'lucide-react';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import type { ManualTocEntry } from './render-manual';
import styles from './ManualView.module.css';

export interface ManualTocProps {
  entries: ManualTocEntry[];
}

interface TocSection {
  entry: ManualTocEntry;
  children: ManualTocEntry[];
}

const groupSections = (entries: ManualTocEntry[]): TocSection[] => {
  const sections: TocSection[] = [];
  for (const entry of entries) {
    const current = sections.at(-1);
    if (entry.depth === 3 && current) current.children.push(entry);
    else sections.push({ entry, children: [] });
  }
  return sections;
};

// A heading becomes the active one once it crosses the top 30% of the viewport.
const ACTIVE_LINE_RATIO = 0.3;

/** Id of the last heading above the active line, or null before the first one. */
function findActiveHeading(ids: string[]): string | null {
  const line = window.innerHeight * ACTIVE_LINE_RATIO;
  let active: string | null = null;
  for (const id of ids) {
    const heading = document.getElementById(id);
    if (!heading) continue;
    if (heading.getBoundingClientRect().top > line) break;
    active = id;
  }
  return active;
}

interface TocListProps {
  sections: TocSection[];
  activeId: string | null;
  activeSectionId: string | null;
  /** Desktop shows the subsections of the active section only; the mobile panel shows them all. */
  expandAll: boolean;
  onNavigate: (id: string) => void;
}

const TocList: React.FC<TocListProps> = ({ sections, activeId, activeSectionId, expandAll, onNavigate }) => {
  const renderLink = (entry: ManualTocEntry) => (
    <a
      href={`#${entry.id}`}
      className={clsx(
        styles.tocLink,
        entry.depth === 3 && styles.tocLinkNested,
        entry.id === activeId && styles.tocLinkActive
      )}
      aria-current={entry.id === activeId ? 'location' : undefined}
      data-toc-id={entry.id}
      onClick={() => onNavigate(entry.id)}
    >
      {entry.text}
    </a>
  );

  return (
    <ol className={styles.tocList}>
      {sections.map(({ entry, children }) => (
        <li key={entry.id}>
          {renderLink(entry)}
          {children.length > 0 && (expandAll || entry.id === activeSectionId) && (
            <ol className={styles.tocSublist}>
              {children.map((child) => (
                <li key={child.id}>{renderLink(child)}</li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ol>
  );
};

/**
 * Table of contents of the manual: a sticky column on large screens and a
 * collapsible panel on phones and portrait tablets. The section being read is
 * highlighted (IntersectionObserver on the headings).
 */
export const ManualToc: React.FC<ManualTocProps> = ({ entries }) => {
  const sections = useMemo(() => groupSections(entries), [entries]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);

  const activeSection =
    sections.find(({ entry, children }) => entry.id === activeId || children.some((child) => child.id === activeId)) ??
    null;

  useEffect(() => {
    const ids = entries.map((entry) => entry.id);
    const headings = ids
      .map((id) => document.getElementById(id))
      .filter((heading): heading is HTMLElement => heading !== null);
    if (headings.length === 0) return;

    // The observer only signals that a heading crossed the band; the active one is measured.
    const observer = new IntersectionObserver(() => setActiveId(findActiveHeading(ids)), {
      rootMargin: `0px 0px -${100 - ACTIVE_LINE_RATIO * 100}% 0px`,
    });
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [entries]);

  // Keep the highlighted link visible inside the scrollable sticky column.
  useEffect(() => {
    const aside = asideRef.current;
    if (!aside || !activeId) return;
    const link = aside.querySelector<HTMLElement>(`[data-toc-id="${CSS.escape(activeId)}"]`);
    if (!link) return;
    const asideBox = aside.getBoundingClientRect();
    const linkBox = link.getBoundingClientRect();
    if (linkBox.top < asideBox.top || linkBox.bottom > asideBox.bottom) {
      aside.scrollTop += linkBox.top - asideBox.top - asideBox.height / 2;
    }
  }, [activeId]);

  const handleNavigate = (id: string) => {
    setActiveId(id);
    if (detailsRef.current) detailsRef.current.open = false;
  };

  return (
    <>
      <details ref={detailsRef} className={styles.tocPanel}>
        <summary className={styles.tocSummary}>
          <ListTree size={ICON_SIZE.md} aria-hidden="true" />
          <span className={styles.tocSummaryText}>
            <span className={styles.tocSummaryLabel}>Contenido</span>
            {activeSection && <span className={styles.tocSummaryCurrent}>{activeSection.entry.text}</span>}
          </span>
          <ChevronDown size={ICON_SIZE.md} aria-hidden="true" className={styles.tocChevron} />
        </summary>
        <nav aria-label="Contenido del manual" className={styles.tocPanelBody}>
          <TocList
            sections={sections}
            activeId={activeId}
            activeSectionId={activeSection?.entry.id ?? null}
            expandAll
            onNavigate={handleNavigate}
          />
        </nav>
      </details>

      <aside ref={asideRef} className={styles.tocColumn}>
        <nav aria-label="Contenido del manual">
          <p className={styles.tocTitle}>
            <ListTree size={ICON_SIZE.sm} aria-hidden="true" />
            Contenido
          </p>
          <TocList
            sections={sections}
            activeId={activeId}
            activeSectionId={activeSection?.entry.id ?? null}
            expandAll={false}
            onNavigate={handleNavigate}
          />
        </nav>
      </aside>
    </>
  );
};
