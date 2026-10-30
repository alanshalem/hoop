'use client';

import React, { useState } from 'react';
import { Plus, Award } from 'lucide-react';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { DivisionCategory } from '@/core/domain/entities/club.types';
import styles from './page.module.css';

export default function DivisionsPage() {
  const { divisions, teams, players, addDivision } = useClubStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newDivName, setNewDivName] = useState('');
  const [newDivCategory, setNewDivCategory] = useState<DivisionCategory>('U15');
  const [newDivDesc, setNewDivDesc] = useState('');

  const handleCreateDivision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDivName.trim()) return;

    addDivision({
      name: newDivName.trim(),
      category: newDivCategory,
      gender: 'MALE',
      clubId: 'club-hoop-arg',
      description: newDivDesc.trim(),
    });

    setIsModalOpen(false);
    setNewDivName('');
    setNewDivDesc('');
  };

  return (
    <TabletAppShell>
      <div className={styles.pageContainer}>
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h1 className={styles.pageTitle}>Divisiones y Planteles</h1>
            <p className={styles.pageSubtitle}>
              Estructura deportiva del club, categorías formativas y cuerpo técnico.
            </p>
          </div>

          <TouchButton
            variant="primary"
            size="md"
            leftIcon={<Plus size={18} />}
            onClick={() => setIsModalOpen(true)}
          >
            Nueva División
          </TouchButton>
        </div>

        <div className={styles.grid}>
          {divisions.map((div) => {
            const team = teams.find((t) => t.divisionId === div.id);
            const teamPlayers = players.filter((p) => p.teamId === team?.id);

            return (
              <div key={div.id} className={styles.divisionCard}>
                <div>
                  <div className={styles.cardTop}>
                    <h2 className={styles.divName}>{div.name}</h2>
                    <span className={styles.tag}>{div.category}</span>
                  </div>
                  {div.description && (
                    <p className={styles.divDesc}>{div.description}</p>
                  )}
                </div>

                <div className={styles.cardStats}>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>
                      {teamPlayers.length}
                    </span>
                    <span className={styles.statLabel}>Jugadores</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>
                      {team?.season || '2025/2026'}
                    </span>
                    <span className={styles.statLabel}>Temporada</span>
                  </div>
                </div>

                <div className={styles.coachInfo}>
                  <Award size={16} color="var(--color-orange)" />
                  <span>DT Asignado: Federico Balbi</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* MODAL CREAR DIVISION */}
        <ModalSheet
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Agregar Nueva División"
        >
          <form onSubmit={handleCreateDivision} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Nombre de la División</label>
              <input
                type="text"
                value={newDivName}
                onChange={(e) => setNewDivName(e.target.value)}
                placeholder="Ej. Sub-15 (U15) Masculino"
                style={{
                  minHeight: '48px',
                  padding: '0 12px',
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Categoría</label>
              <select
                value={newDivCategory}
                onChange={(e) => setNewDivCategory(e.target.value as DivisionCategory)}
                style={{
                  minHeight: '48px',
                  padding: '0 12px',
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="PRIMERA">Primera División</option>
                <option value="U21">Sub-21 (U21)</option>
                <option value="U19">Sub-19 (U19)</option>
                <option value="U17">Sub-17 (U17)</option>
                <option value="U15">Sub-15 (U15)</option>
                <option value="U13">Sub-13 (U13)</option>
                <option value="MINI">Mini Básquet</option>
                <option value="FEMENINO">Femenino</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Descripción / Torneo</label>
              <input
                type="text"
                value={newDivDesc}
                onChange={(e) => setNewDivDesc(e.target.value)}
                placeholder="Ej. Torneo Apertura Febamba"
                style={{
                  minHeight: '48px',
                  padding: '0 12px',
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              <TouchButton type="button" variant="ghost" size="md" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </TouchButton>
              <TouchButton type="submit" variant="primary" size="md">
                Guardar División
              </TouchButton>
            </div>
          </form>
        </ModalSheet>
      </div>
    </TabletAppShell>
  );
}
