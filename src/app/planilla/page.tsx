'use client';

import React, { useState } from 'react';
import { Archive, ArchiveRestore, Lock, Pencil, Plus, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import {
  CHART_CATEGORIES,
  CHART_CATEGORY_LABELS,
  type ChartCategory,
  type ChartCode,
  type ChartTone,
} from '@/core/domain/entities/chart.types';
import { can } from '@/core/domain/rules/permissions';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { selectChartCatalog } from '@/core/application/stores/club-state';
import { ICON_SIZE } from '@/presentation/icon-sizes';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { PageHeader } from '@/presentation/molecules/PageHeader/PageHeader';
import { SectionCard } from '@/presentation/molecules/SectionCard/SectionCard';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { IconButton } from '@/presentation/atoms/IconButton/IconButton';
import { confirm, notify } from '@/presentation/organisms/DialogHost/dialog-store';
import { ChartCodeFormModal } from '@/presentation/organisms/ChartCodeFormModal/ChartCodeFormModal';
import {
  CHART_CODE_REFUSAL_MESSAGES,
  CHART_TONE_LABELS,
  formatChartCodeCounts,
} from '@/presentation/organisms/ChartCodeFormModal/chart-code-form';
import { useScreenTour } from '@/presentation/tour/useScreenTour';
import styles from './page.module.css';

const TONE_CLASS: Record<ChartTone, string> = {
  POSITIVE: styles.positive,
  NEGATIVE: styles.negative,
};

interface FormTarget {
  category: ChartCategory;
  /** Null adds a custom code to the category. */
  code: ChartCode | null;
}

/** Club chart catalog (S9): rename, add and archive the codes of the live sheet. */
export default function ChartCatalogPage() {
  const catalog = useClubStore(selectChartCatalog);
  const role = useClubStore((state) => state.currentUser.role);
  const setChartCodeArchived = useClubStore((state) => state.setChartCodeArchived);

  const canManage = can(role, 'MANAGE_CHART_CATALOG');
  useScreenTour('planilla');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formTarget, setFormTarget] = useState<FormTarget>({ category: 'TURNOVER', code: null });

  const openForm = (category: ChartCategory, code: ChartCode | null) => {
    setFormTarget({ category, code });
    setIsFormOpen(true);
  };

  const setArchived = async (category: ChartCategory, code: ChartCode, archived: boolean) => {
    const result = setChartCodeArchived(category, code.code, archived);
    if (!result.ok) {
      await notify({
        title: archived ? 'No se pudo archivar el código' : 'No se pudo restaurar el código',
        message: CHART_CODE_REFUSAL_MESSAGES[result.reason],
        tone: 'warning',
      });
    }
  };

  const handleArchive = async (category: ChartCategory, code: ChartCode) => {
    const accepted = await confirm({
      title: 'Archivar código',
      message: `"${code.label}" deja de aparecer en el panel de carga en vivo. Las entradas ya cargadas lo siguen mostrando en la planilla. Puedes restaurarlo cuando quieras.`,
      confirmLabel: 'Archivar código',
      tone: 'warning',
    });
    if (accepted) await setArchived(category, code, true);
  };

  return (
    <TabletAppShell>
      <div className="page-container">
        <PageHeader
          title="Códigos de la planilla"
          subtitle="Símbolos, nombres y tonos de la planilla táctica del club. Los cambios llegan a todas las tablets."
        />

        {!canManage && (
          <p className={styles.readOnlyNote}>
            <Lock size={ICON_SIZE.sm} aria-hidden="true" />
            Solo el administrador y los entrenadores principales pueden editar los códigos.
          </p>
        )}

        <div className={styles.sections}>
          {CHART_CATEGORIES.map((category) => {
            const codes = catalog[category];
            const archivedCount = codes.filter((code) => code.archived).length;
            const label = CHART_CATEGORY_LABELS[category];
            return (
              <SectionCard
                key={category}
                title={label}
                description={formatChartCodeCounts(codes.length - archivedCount, archivedCount)}
                data-tour="chart-catalog-category"
                actions={
                  canManage && (
                    <TouchButton
                      variant="secondary"
                      leftIcon={<Plus size={ICON_SIZE.md} />}
                      onClick={() => openForm(category, null)}
                      aria-label={`Nuevo código en ${label}`}
                      data-tour="chart-catalog-create"
                    >
                      Nuevo código
                    </TouchButton>
                  )
                }
              >
                <ul className={styles.codeList}>
                  {codes.map((code) => (
                    <li
                      key={code.code}
                      className={clsx(styles.codeRow, code.archived && styles.codeRowArchived)}
                      data-tour="chart-catalog-code"
                    >
                      <span className={clsx(styles.symbol, TONE_CLASS[code.tone])}>{code.symbol}</span>
                      <span className={styles.codeText}>
                        <span className={styles.codeLabel}>{code.label}</span>
                        <span className={styles.codeMeta}>
                          <span className={TONE_CLASS[code.tone]}>{CHART_TONE_LABELS[code.tone]}</span>
                          {code.custom && (
                            <span className={styles.tag}>
                              <Sparkles size={ICON_SIZE.xs} aria-hidden="true" />
                              Propio
                            </span>
                          )}
                          {code.archived && (
                            <span className={clsx(styles.tag, styles.tagArchived)}>
                              <Archive size={ICON_SIZE.xs} aria-hidden="true" />
                              Archivado
                            </span>
                          )}
                        </span>
                      </span>
                      {canManage && (
                        <span className={styles.codeActions}>
                          <IconButton
                            aria-label={`Editar ${code.label}`}
                            variant="secondary"
                            icon={<Pencil size={ICON_SIZE.md} />}
                            onClick={() => openForm(category, code)}
                            data-tour="chart-catalog-edit"
                          />
                          {code.archived ? (
                            <IconButton
                              aria-label={`Restaurar ${code.label}`}
                              variant="secondary"
                              icon={<ArchiveRestore size={ICON_SIZE.md} />}
                              onClick={() => void setArchived(category, code, false)}
                            />
                          ) : (
                            <IconButton
                              aria-label={`Archivar ${code.label}`}
                              variant="secondary"
                              icon={<Archive size={ICON_SIZE.md} />}
                              onClick={() => void handleArchive(category, code)}
                              data-tour="chart-catalog-archive"
                            />
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            );
          })}
        </div>
      </div>

      <ChartCodeFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        category={formTarget.category}
        codeToEdit={formTarget.code}
      />
    </TabletAppShell>
  );
}
