'use client';

import React from 'react';
import { CalendarDays, Flame } from 'lucide-react';
import { can } from '@/core/domain/rules/permissions';
import {
  calculateSeasonLeaders,
  calculateSeasonSummary,
  getFinishedTeamMatches,
  type SeasonLeaders,
} from '@/core/domain/rules/season-analytics';
import { useClubStore } from '@/core/application/stores/useClubStore';
import { CLUB_PROFILE } from '@/core/domain/club-profile';
import { TabletAppShell } from '@/presentation/templates/TabletAppShell/TabletAppShell';
import { EmptyState } from '@/presentation/molecules/EmptyState/EmptyState';
import { FilterChipGroup } from '@/presentation/molecules/FilterChipGroup/FilterChipGroup';
import { FilterChip } from '@/presentation/atoms/FilterChip/FilterChip';
import { LinkButton } from '@/presentation/atoms/LinkButton/LinkButton';
import { UserMenu } from '@/presentation/organisms/UserMenu/UserMenu';
import { ClubHero } from '@/presentation/organisms/ClubHero/ClubHero';
import { useScreenTour } from '@/presentation/tour/useScreenTour';
import { hasAnyPlays, sortMatchesForCalendar } from '@/presentation/organisms/MatchCard/match-display';
import { HeroMatch } from './_components/HeroMatch';
import { SeasonKpis } from './_components/SeasonKpis';
import { ScoringLeaderCard } from './_components/ScoringLeaderCard';
import { RecentResultsCard } from './_components/RecentResultsCard';
import { MedicalAlertsCard } from './_components/MedicalAlertsCard';
import styles from './page.module.css';

const RECENT_RESULTS_LIMIT = 5;

/** Matches imported from the official reports have no plays, so there is nobody to lead (S3). */
const NO_LEADERS: SeasonLeaders = { points: null };

export default function DashboardPage() {
  const matches = useClubStore((state) => state.matches);
  const players = useClubStore((state) => state.players);
  const teams = useClubStore((state) => state.teams);
  const divisions = useClubStore((state) => state.divisions);
  const activeDivisionId = useClubStore((state) => state.activeDivisionId);
  const role = useClubStore((state) => state.currentUser.role);
  const setActiveDivision = useClubStore((state) => state.setActiveDivision);
  useScreenTour('dashboard');

  const activeDivision = divisions.find((d) => d.id === activeDivisionId) ?? divisions[0];
  const activeTeam = teams.find((t) => t.divisionId === activeDivision?.id);

  // Live match first, otherwise the soonest scheduled one.
  const [firstInCalendar] = sortMatchesForCalendar(matches);
  const heroMatch = firstInCalendar && firstInCalendar.status !== 'FINISHED' ? firstInCalendar : undefined;

  const summary = activeTeam ? calculateSeasonSummary(matches, activeTeam.id) : null;
  const hasPlays = activeTeam ? hasAnyPlays(getFinishedTeamMatches(matches, activeTeam.id)) : false;
  const leaders = activeTeam
    ? hasPlays
      ? calculateSeasonLeaders(matches, players, activeTeam.id)
      : NO_LEADERS
    : null;
  const recentResults = activeTeam
    ? sortMatchesForCalendar(getFinishedTeamMatches(matches, activeTeam.id)).slice(0, RECENT_RESULTS_LIMIT)
    : [];
  const medicalAlerts = players
    .filter((p) => p.status === 'INJURED' || p.status === 'SUSPENDED')
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'es'));

  const divisionNameOfPlayer = (teamId: string | undefined) => {
    const divisionId = teams.find((t) => t.id === teamId)?.divisionId;
    return divisions.find((d) => d.id === divisionId)?.name ?? 'Sin equipo';
  };

  return (
    <TabletAppShell>
      <div className="page-container">
        <ClubHero
          title="Dashboard"
          subtitle={`${activeDivision?.name ?? CLUB_PROFILE.name} · Temporada ${CLUB_PROFILE.season}`}
          actions={
            // The nav rail holds the role selector on tablet; phones get it here.
            <div className={styles.mobileRoleSwitcher}>
              <UserMenu />
            </div>
          }
        />

        {divisions.length > 1 && (
          <div data-tour="dashboard-divisions">
            <FilterChipGroup label="División del tablero">
              {divisions.map((division) => (
                <FilterChip
                  key={division.id}
                  label={division.name}
                  pressed={division.id === activeDivision?.id}
                  onClick={() => setActiveDivision(division.id)}
                />
              ))}
            </FilterChipGroup>
          </div>
        )}

        {heroMatch ? (
          <HeroMatch match={heroMatch} canManageLineup={can(role, 'MANAGE_LINEUP')} />
        ) : (
          <div>
            <EmptyState
              icon={CalendarDays}
              title="Sin partidos en agenda"
              description="No hay partidos en juego ni programados."
              action={
                <LinkButton href="/matches" variant="secondary">
                  Ir a partidos
                </LinkButton>
              }
            />
          </div>
        )}

        {summary ? (
          <SeasonKpis summary={summary} />
        ) : (
          <div>
            <EmptyState
              icon={Flame}
              title="Sin equipo para analizar"
              description="Crea una división para ver el resumen de su temporada."
              action={
                <LinkButton href="/divisions" variant="secondary">
                  Ir a divisiones
                </LinkButton>
              }
            />
          </div>
        )}

        <div className={styles.sectionGrid}>
          {leaders && (
            <div data-reveal data-tour="dashboard-leaders">
              <ScoringLeaderCard leaders={leaders} withoutPlays={!hasPlays && Boolean(summary?.played)} />
            </div>
          )}

          {activeTeam && (
            <div data-reveal>
              <RecentResultsCard matches={recentResults} />
            </div>
          )}

          <div className={styles.fullWidth} data-reveal data-tour="dashboard-medical">
            <MedicalAlertsCard players={medicalAlerts} divisionNameOf={divisionNameOfPlayer} />
          </div>
        </div>
      </div>
    </TabletAppShell>
  );
}
