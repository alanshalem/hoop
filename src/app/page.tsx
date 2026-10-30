'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import {
  Radio,
  Flame,
  TrendingUp,
  AlertTriangle,
  Play,
  ArrowRight,
} from 'lucide-react';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { TouchButton } from '@/presentation/atoms/TouchButton/TouchButton';
import { UserRoleSwitcher } from '@/presentation/organisms/UserRoleSwitcher/UserRoleSwitcher';
import { useClubStore } from '@/core/application/stores/useClubStore';
import styles from './page.module.css';

export default function DashboardPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { matches, players, activeDivisionId, divisions } = useClubStore();

  const activeDivision =
    divisions.find((d) => d.id === activeDivisionId) || divisions[0];

  // Find live match
  const liveMatch =
    matches.find((m) => m.status === 'LIVE') ||
    matches.find((m) => m.id === 'match-live-today') ||
    matches[0];

  // Injured players
  const injuredPlayers = players.filter((p) => p.status === 'INJURED');

  // GSAP Entrance Animation
  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.dashAnim',
        { opacity: 0, y: 25 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          stagger: 0.08,
          ease: 'power2.out',
        }
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <TabletAppShell>
      <div ref={containerRef} className={styles.dashboardContainer}>
        {/* TOP BAR */}
        <div className={styles.topBar}>
          <div className={styles.welcomeText}>
            <h1 className={styles.title}>HoopOS Dashboard</h1>
            <p className={styles.subtitle}>
              {activeDivision?.name || 'Primera División'} · Temporada 2025/2026
            </p>
          </div>

          <UserRoleSwitcher />
        </div>

        {/* HERO CARD: LIVE MATCH DAY */}
        {liveMatch && (
          <div className={`${styles.heroMatchCard} dashAnim`}>
            <div className={styles.heroTopRow}>
              <div className={styles.liveBadge}>
                <span className={styles.liveDot} />
                <span>
                  {liveMatch.status === 'LIVE' ? 'EN VIVO' : 'HOY EN CANCHA'}
                </span>
              </div>
              <span className={styles.tournamentLabel}>
                {liveMatch.tournament} · {liveMatch.venue}
              </span>
            </div>

            <div className={styles.scoreboardDisplay}>
              <div className={styles.teamCol}>
                <span className={styles.teamName}>{liveMatch.ownTeamName}</span>
                <span className={styles.teamScore}>{liveMatch.homeScore}</span>
              </div>

              <div className={styles.versusCenter}>
                <span className={styles.quarterBadge}>
                  {liveMatch.currentQuarter}
                </span>
                <span className={styles.clockBadge}>
                  {Math.floor(liveMatch.quarterTimeRemainingSeconds / 60)
                    .toString()
                    .padStart(2, '0')}
                  :
                  {(liveMatch.quarterTimeRemainingSeconds % 60)
                    .toString()
                    .padStart(2, '0')}
                </span>
              </div>

              <div className={styles.teamCol}>
                <span className={styles.teamName}>
                  {liveMatch.rivalTeamName}
                </span>
                <span className={styles.teamScore}>{liveMatch.awayScore}</span>
              </div>
            </div>

            <div className={styles.heroActions}>
              <Link href={`/matches/${liveMatch.id}/live`} style={{ textDecoration: 'none' }}>
                <TouchButton
                  variant="primary"
                  size="lg"
                  leftIcon={<Radio size={20} />}
                  rightIcon={<ArrowRight size={18} />}
                >
                  ABRIR CONSOLA EN VIVO
                </TouchButton>
              </Link>
            </div>
          </div>
        )}

        {/* KPIS DE TEMPORADA */}
        <div className={styles.kpiGrid}>
          <div className={`${styles.kpiCard} dashAnim`}>
            <span className={styles.kpiLabel}>Récord de Temporada</span>
            <span className={styles.kpiValue}>9 - 2</span>
            <span className={styles.kpiSub}>81.8% Victorias</span>
          </div>

          <div className={`${styles.kpiCard} dashAnim`}>
            <span className={styles.kpiLabel}>Promedio Anotado</span>
            <span className={styles.kpiValue}>86.4</span>
            <span className={styles.kpiSub}>+8.2 diferencial</span>
          </div>

          <div className={`${styles.kpiCard} dashAnim`}>
            <span className={styles.kpiLabel}>Promedio Recibido</span>
            <span className={styles.kpiValue}>78.2</span>
            <span className={styles.kpiSub}>Defensa #2 en Liga</span>
          </div>

          <div className={`${styles.kpiCard} dashAnim`}>
            <span className={styles.kpiLabel}>Efectividad de Tiro</span>
            <span className={styles.kpiValue}>48.7%</span>
            <span className={styles.kpiSub}>37.2% en Triples</span>
          </div>
        </div>

        {/* LÍDERES Y ALERTAS */}
        <div className={styles.sectionGrid}>
          {/* LÍDERES ESTADÍSTICOS */}
          <div className={`${styles.leadersCard} dashAnim`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Líderes del Equipo</h2>
              <Flame size={18} color="var(--color-orange)" />
            </div>

            <div className={styles.leadersGrid}>
              <div className={styles.leaderItem}>
                <span className={styles.leaderStatType}>Puntos (PPG)</span>
                <span className={styles.leaderValue}>18.5</span>
                <span className={styles.leaderPlayer}>F. Campagna (#7)</span>
              </div>

              <div className={styles.leaderItem}>
                <span className={styles.leaderStatType}>Rebotes (RPG)</span>
                <span className={styles.leaderValue}>9.8</span>
                <span className={styles.leaderPlayer}>L. Scola (#4)</span>
              </div>

              <div className={styles.leaderItem}>
                <span className={styles.leaderStatType}>Asistencias (APG)</span>
                <span className={styles.leaderValue}>7.2</span>
                <span className={styles.leaderPlayer}>N. Laprovíttola (#10)</span>
              </div>

              <div className={styles.leaderItem}>
                <span className={styles.leaderStatType}>Valoración (PIR)</span>
                <span className={styles.leaderValue}>22.4</span>
                <span className={styles.leaderPlayer}>G. Deck (#14)</span>
              </div>
            </div>
          </div>

          {/* ALERTAS MÉDICAS */}
          <div className={`${styles.alertsCard} dashAnim`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Alerta Médica</h2>
              <AlertTriangle size={18} color="var(--color-red)" />
            </div>

            {injuredPlayers.length === 0 ? (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-green)' }}>
                Plantel completo sin lesiones activas.
              </p>
            ) : (
              injuredPlayers.map((player) => (
                <div key={player.id} className={styles.alertItem}>
                  <div className={styles.alertDetails}>
                    <span className={styles.alertPlayer}>
                      #{player.dorsal} {player.lastName}, {player.firstName}
                    </span>
                    <span className={styles.alertReason}>
                      Esguince de tobillo derecho · En recuperación
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </TabletAppShell>
  );
}
