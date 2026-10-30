'use client';

import React, { useState, useMemo, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, BarChart2, Radio, Target } from 'lucide-react';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { BoxScoreTable } from '@/presentation/organisms/BoxScoreTable/BoxScoreTable';
import { HalfCourtShotChart } from '@/presentation/organisms/HalfCourtShotChart/HalfCourtShotChart';
import { useClubStore } from '@/core/application/stores/useClubStore';
import {
  calculateTeamBoxScore,
  calculatePercentage,
} from '@/core/domain/rules/basketball-rules';
import { Quarter } from '@/core/domain/entities/match.types';
import clsx from 'clsx';
import styles from './page.module.css';

function MatchStatsContent() {
  const router = useRouter();
  const params = useParams();
  const matchId = (params?.id as string) || 'match-past-1';

  const { matches, players } = useClubStore();
  const match = matches.find((m) => m.id === matchId) || matches[0];

  // Filters for Shot Chart
  const [selectedQuarter, setSelectedQuarter] = useState<string>('ALL');
  const [selectedPlayerFilter, setSelectedPlayerFilter] = useState<string>('ALL');

  // Compute Full Box Score
  const rosterPlayerIds = useMemo(() => {
    return match?.rosterOwnPlayerIds?.length
      ? match.rosterOwnPlayerIds
      : match?.activeLineupOwn || [];
  }, [match]);

  const { players: playerStats, teamTotal } = useMemo(() => {
    if (!match) {
      return {
        players: {},
        teamTotal: {
          teamId: '',
          points: 0,
          ft: { made: 0, attempted: 0, percentage: 0 },
          fg2: { made: 0, attempted: 0, percentage: 0 },
          fg3: { made: 0, attempted: 0, percentage: 0 },
          fgTotal: { made: 0, attempted: 0, percentage: 0 },
          offensiveRebounds: 0,
          defensiveRebounds: 0,
          totalRebounds: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
          turnovers: 0,
          totalFouls: 0,
          pir: 0,
        },
      };
    }

    return calculateTeamBoxScore(
      match.ownTeamId,
      rosterPlayerIds,
      match.events || [],
      match.activeLineupOwn
    );
  }, [match, rosterPlayerIds]);

  const playerBoxScoreList = useMemo(() => {
    return rosterPlayerIds
      .map((pid) => {
        const player = players.find((p) => p.id === pid);
        const stats = playerStats[pid];
        if (!player || !stats) return null;
        return { player, stats };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [rosterPlayerIds, players, playerStats]);

  // Filtered Events for Analytical Shot Chart
  const filteredShotEvents = useMemo(() => {
    if (!match?.events) return [];
    return match.events.filter((ev) => {
      if (selectedQuarter !== 'ALL' && ev.quarter !== selectedQuarter) return false;
      if (
        selectedPlayerFilter !== 'ALL' &&
        ev.playerId !== selectedPlayerFilter
      )
        return false;
      return true;
    });
  }, [match, selectedQuarter, selectedPlayerFilter]);

  // Effectiveness calculation for filtered events
  const shotAnalytics = useMemo(() => {
    let fg2Made = 0;
    let fg2Att = 0;
    let fg3Made = 0;
    let fg3Att = 0;

    for (const ev of filteredShotEvents) {
      if (ev.type === 'FG2_MADE') {
        fg2Made++;
        fg2Att++;
      } else if (ev.type === 'FG2_MISS') {
        fg2Att++;
      } else if (ev.type === 'FG3_MADE') {
        fg3Made++;
        fg3Att++;
      } else if (ev.type === 'FG3_MISS') {
        fg3Att++;
      }
    }

    const fgTotalMade = fg2Made + fg3Made;
    const fgTotalAtt = fg2Att + fg3Att;

    return {
      fg2Pct: calculatePercentage(fg2Made, fg2Att),
      fg2Stats: `${fg2Made}/${fg2Att}`,
      fg3Pct: calculatePercentage(fg3Made, fg3Att),
      fg3Stats: `${fg3Made}/${fg3Att}`,
      totalPct: calculatePercentage(fgTotalMade, fgTotalAtt),
      totalStats: `${fgTotalMade}/${fgTotalAtt}`,
    };
  }, [filteredShotEvents]);

  if (!match) {
    return (
      <TabletAppShell>
        <div style={{ padding: '40px', color: '#fff', textAlign: 'center' }}>
          Partido no encontrado.
        </div>
      </TabletAppShell>
    );
  }

  const quartersList: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

  return (
    <TabletAppShell>
      <div className={styles.pageContainer}>
        {/* HEADER */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => router.push('/matches')}
            >
              <ArrowLeft size={16} /> Volver a Partidos
            </button>
            <h1 className={styles.pageTitle}>Planilla Estadística & Shot Chart</h1>
            <p className={styles.pageSubtitle}>
              {match.ownTeamName} ({match.homeScore}) vs {match.rivalTeamName} ({match.awayScore}) · {match.tournament}
            </p>
          </div>

          {match.status === 'LIVE' && (
            <TouchButton
              variant="primary"
              size="md"
              leftIcon={<Radio size={16} />}
              onClick={() => router.push(`/matches/${match.id}/live`)}
            >
              Volver a Consola en Vivo
            </TouchButton>
          )}
        </div>

        {/* 1. COMPARATIVA POR CUARTOS */}
        <div className={styles.quarterComparisonCard}>
          <h2 className={styles.cardTitle}>Parciales por Cuarto</h2>
          <table className={styles.quarterTable}>
            <thead>
              <tr>
                <th className={styles.teamColHeader}>Equipo</th>
                <th>Q1</th>
                <th>Q2</th>
                <th>Q3</th>
                <th>Q4</th>
                <th>FINAL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.teamColHeader}>{match.ownTeamName}</td>
                <td>22</td>
                <td>14</td>
                <td>26</td>
                <td>22</td>
                <td className={styles.finalScoreCol}>{match.homeScore}</td>
              </tr>
              <tr>
                <td className={styles.teamColHeader}>{match.rivalTeamName}</td>
                <td>19</td>
                <td>12</td>
                <td>24</td>
                <td>23</td>
                <td className={styles.finalScoreCol}>{match.awayScore}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 2. TABLA BOX SCORE FIBA PROFESIONAL */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <BarChart2 size={20} color="var(--color-orange)" />
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'bold' }}>
              Box Score Oficial FIBA
            </h2>
          </div>
          <BoxScoreTable
            playerBoxScores={playerBoxScoreList}
            teamTotal={teamTotal}
          />
        </div>

        {/* 3. SHOT CHART ANALÍTICO CON FILTROS POR JUGADOR Y POR CUARTO */}
        <div className={styles.shotChartSection}>
          <div className={styles.shotChartLeft}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={20} color="var(--color-orange)" />
              <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'bold' }}>
                Mapa de Tiros Analítico
              </h2>
            </div>

            <div className={styles.filtersPanel}>
              {/* FILTRO POR CUARTO */}
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Filtrar por Cuarto:</span>
                <div className={styles.filterChips}>
                  <button
                    type="button"
                    className={clsx(
                      styles.chip,
                      selectedQuarter === 'ALL' && styles.chipActive
                    )}
                    onClick={() => setSelectedQuarter('ALL')}
                  >
                    Todos
                  </button>
                  {quartersList.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className={clsx(
                        styles.chip,
                        selectedQuarter === q && styles.chipActive
                      )}
                      onClick={() => setSelectedQuarter(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* FILTRO POR JUGADOR */}
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Filtrar por Jugador:</span>
                <div className={styles.filterChips}>
                  <button
                    type="button"
                    className={clsx(
                      styles.chip,
                      selectedPlayerFilter === 'ALL' && styles.chipActive
                    )}
                    onClick={() => setSelectedPlayerFilter('ALL')}
                  >
                    Todo el Equipo
                  </button>
                  {playerBoxScoreList.map(({ player }) => (
                    <button
                      key={player.id}
                      type="button"
                      className={clsx(
                        styles.chip,
                        selectedPlayerFilter === player.id && styles.chipActive
                      )}
                      onClick={() => setSelectedPlayerFilter(player.id)}
                    >
                      #{player.dorsal} {player.lastName}
                    </button>
                  ))}
                </div>
              </div>

              {/* EFECTIVIDAD CALCULADA */}
              <div className={styles.accuracySummary}>
                <div className={styles.accItem}>
                  <span className={styles.accVal}>{shotAnalytics.fg2Pct}%</span>
                  <span className={styles.accLbl}>Dobles ({shotAnalytics.fg2Stats})</span>
                </div>
                <div className={styles.accItem}>
                  <span className={styles.accVal}>{shotAnalytics.fg3Pct}%</span>
                  <span className={styles.accLbl}>Triples ({shotAnalytics.fg3Stats})</span>
                </div>
                <div className={styles.accItem}>
                  <span className={styles.accVal}>{shotAnalytics.totalPct}%</span>
                  <span className={styles.accLbl}>Total Campo ({shotAnalytics.totalStats})</span>
                </div>
              </div>
            </div>
          </div>

          {/* DIBUJO DE MEDIA CANCHA CON TIROS FILTRADOS */}
          <div className={styles.chartContainer}>
            <HalfCourtShotChart
              events={filteredShotEvents}
              selectedPlayer={null}
              onRecordShot={() => {}}
              onUndoLastEvent={() => {}}
            />
          </div>
        </div>
      </div>
    </TabletAppShell>
  );
}

export default function MatchStatsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#fff' }}>Cargando estadísticas...</div>}>
      <MatchStatsContent />
    </Suspense>
  );
}
