'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Plus, Radio, Users, BarChart2 } from 'lucide-react';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { ModalSheet } from '@/presentation/molecules/ModalSheet/ModalSheet';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { MatchCondition } from '@/core/domain/entities/match.types';
import clsx from 'clsx';
import styles from './page.module.css';

export default function MatchesPage() {
  const { matches, divisions, addMatch } = useClubStore();

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [divisionFilter, setDivisionFilter] = useState<string>('ALL');

  // New Match Form Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rivalName, setRivalName] = useState('');
  const [tournament, setTournament] = useState('Torneo Federal');
  const [venue, setVenue] = useState('Estadio Hoop Arena');
  const [condition, setCondition] = useState<MatchCondition>('HOME');
  const [divisionId, setDivisionId] = useState('div-primera');

  const filteredMatches = matches.filter((m) => {
    if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
    if (divisionFilter !== 'ALL' && m.divisionId !== divisionFilter) return false;
    return true;
  });

  const handleCreateMatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rivalName.trim()) return;

    addMatch({
      clubId: 'club-hoop-arg',
      divisionId,
      ownTeamId: 'team-primera',
      ownTeamName: 'Hoop Athletic Club',
      rivalTeamName: rivalName.trim(),
      date: new Date().toISOString(),
      condition,
      tournament: tournament.trim(),
      venue: venue.trim(),
      status: 'SCHEDULED',
      currentQuarter: 'Q1',
      quarterTimeRemainingSeconds: 600,
      homeScore: 0,
      awayScore: 0,
      homeFoulsQuarter: 0,
      awayFoulsQuarter: 0,
      homeTimeouts: { firstHalfRemaining: 2, secondHalfRemaining: 3, overtimeRemaining: 1 },
      awayTimeouts: { firstHalfRemaining: 2, secondHalfRemaining: 3, overtimeRemaining: 1 },
      activeLineupOwn: [],
      rosterOwnPlayerIds: [],
      events: [],
    });

    setIsModalOpen(false);
    setRivalName('');
  };

  return (
    <TabletAppShell>
      <div className={styles.pageContainer}>
        {/* HEADER */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h1 className={styles.pageTitle}>Calendario de Partidos</h1>
            <p className={styles.pageSubtitle}>
              Fixture de fechas oficiales, partidos en vivo y actas estadísticas.
            </p>
          </div>

          <TouchButton
            variant="primary"
            size="md"
            leftIcon={<Plus size={18} />}
            onClick={() => setIsModalOpen(true)}
          >
            Nueva Fecha
          </TouchButton>
        </div>

        {/* FILTERS */}
        <div className={clsx(styles.filtersRow, 'no-scrollbar')}>
          <button
            type="button"
            className={clsx(
              styles.filterBtn,
              statusFilter === 'ALL' && styles.filterBtnActive
            )}
            onClick={() => setStatusFilter('ALL')}
          >
            Todos los Estados
          </button>
          <button
            type="button"
            className={clsx(
              styles.filterBtn,
              statusFilter === 'LIVE' && styles.filterBtnActive
            )}
            onClick={() => setStatusFilter('LIVE')}
          >
            En Juego (Live)
          </button>
          <button
            type="button"
            className={clsx(
              styles.filterBtn,
              statusFilter === 'SCHEDULED' && styles.filterBtnActive
            )}
            onClick={() => setStatusFilter('SCHEDULED')}
          >
            Programados
          </button>
          <button
            type="button"
            className={clsx(
              styles.filterBtn,
              statusFilter === 'FINISHED' && styles.filterBtnActive
            )}
            onClick={() => setStatusFilter('FINISHED')}
          >
            Finalizados
          </button>

          <span style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-subtle)', margin: '0 4px' }} />

          <button
            type="button"
            className={clsx(
              styles.filterBtn,
              divisionFilter === 'ALL' && styles.filterBtnActive
            )}
            onClick={() => setDivisionFilter('ALL')}
          >
            Todas las Divisiones
          </button>
          {divisions.map((d) => (
            <button
              key={d.id}
              type="button"
              className={clsx(
                styles.filterBtn,
                divisionFilter === d.id && styles.filterBtnActive
              )}
              onClick={() => setDivisionFilter(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>

        {/* MATCHES LIST */}
        <div className={styles.matchesList}>
          {filteredMatches.map((match) => (
            <div key={match.id} className={styles.matchCard}>
              <div className={styles.matchTop}>
                <span className={styles.tournament}>
                  {match.tournament} · {match.venue}
                </span>

                {match.status === 'LIVE' && (
                  <span className={styles.statusLive}>
                    <Radio size={14} /> EN VIVO · {match.currentQuarter}
                  </span>
                )}
                {match.status === 'FINISHED' && (
                  <span className={styles.statusFinished}>FINALIZADO</span>
                )}
                {match.status === 'SCHEDULED' && (
                  <span className={styles.statusScheduled}>PROGRAMADO</span>
                )}
              </div>

              <div className={styles.matchScoreSection}>
                <div className={styles.teamSide}>
                  <span className={styles.teamName}>{match.ownTeamName}</span>
                  <span className={styles.conditionBadge}>
                    {match.condition === 'HOME' ? 'Local' : 'Visitante'}
                  </span>
                </div>

                <div className={styles.scoreCenter}>
                  <span>{match.homeScore}</span>
                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                  <span>{match.awayScore}</span>
                </div>

                <div className={styles.teamSide}>
                  <span className={styles.teamName}>{match.rivalTeamName}</span>
                  <span className={styles.conditionBadge}>
                    {match.condition === 'HOME' ? 'Visitante' : 'Local'}
                  </span>
                </div>
              </div>

              <div className={styles.actionsRow}>
                {match.status === 'SCHEDULED' && (
                  <Link href={`/matches/${match.id}/lineup`} style={{ textDecoration: 'none' }}>
                    <TouchButton variant="secondary" size="md" leftIcon={<Users size={16} />}>
                      Armar Quinteto Inicial
                    </TouchButton>
                  </Link>
                )}

                {match.status === 'LIVE' && (
                  <>
                    <Link href={`/matches/${match.id}/lineup`} style={{ textDecoration: 'none' }}>
                      <TouchButton variant="secondary" size="md" leftIcon={<Users size={16} />}>
                        Quinteto / Roster
                      </TouchButton>
                    </Link>
                    <Link href={`/matches/${match.id}/live`} style={{ textDecoration: 'none' }}>
                      <TouchButton variant="primary" size="md" leftIcon={<Radio size={16} />}>
                        Ir a Consola en Vivo
                      </TouchButton>
                    </Link>
                  </>
                )}

                {match.status === 'FINISHED' && (
                  <Link href={`/matches/${match.id}/stats`} style={{ textDecoration: 'none' }}>
                    <TouchButton variant="secondary" size="md" leftIcon={<BarChart2 size={16} />}>
                      Ver Planilla Box Score
                    </TouchButton>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* MODAL CREAR PARTIDO */}
        <ModalSheet
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Crear Nueva Fecha / Partido"
        >
          <form onSubmit={handleCreateMatch} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Equipo Rival</label>
              <input
                type="text"
                value={rivalName}
                onChange={(e) => setRivalName(e.target.value)}
                placeholder="Ej. Club Atlético Platense"
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
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>División</label>
              <select
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
                style={{
                  minHeight: '48px',
                  padding: '0 12px',
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                }}
              >
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Condición</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as MatchCondition)}
                style={{
                  minHeight: '48px',
                  padding: '0 12px',
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="HOME">Local (En nuestro estadio)</option>
                <option value="AWAY">Visitante</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Torneo / Competencia</label>
              <input
                type="text"
                value={tournament}
                onChange={(e) => setTournament(e.target.value)}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>Estadio / Cancha</label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
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
                Crear Partido
              </TouchButton>
            </div>
          </form>
        </ModalSheet>
      </div>
    </TabletAppShell>
  );
}
