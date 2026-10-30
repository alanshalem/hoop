import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  Division,
  Player,
  Team,
  User,
  UserRole,
} from '@/core/domain/entities/club.types';
import {
  Match,
  PlayByPlayEvent,
} from '@/core/domain/entities/match.types';
import {
  SEED_USERS,
  SEED_DIVISIONS,
  SEED_TEAMS,
  SEED_PLAYERS,
  SEED_MATCHES,
} from '@/core/infrastructure/mocks/seed-data';

export interface ClubStoreState {
  // Current user / RBAC
  currentUser: User;
  switchRole: (role: UserRole) => void;

  // Divisions
  divisions: Division[];
  activeDivisionId: string;
  setActiveDivision: (divisionId: string) => void;
  addDivision: (division: Omit<Division, 'id'>) => void;
  updateDivision: (id: string, updates: Partial<Division>) => void;
  deleteDivision: (id: string) => void;

  // Teams
  teams: Team[];
  addTeam: (team: Omit<Team, 'id'>) => void;
  updateTeam: (id: string, updates: Partial<Team>) => void;
  deleteTeam: (id: string) => void;

  // Players
  players: Player[];
  addPlayer: (player: Omit<Player, 'id'>) => void;
  updatePlayer: (id: string, updates: Partial<Player>) => void;
  deletePlayer: (id: string) => void;
  callUpPlayerToTeam: (playerId: string, targetTeamId: string) => void;

  // Matches
  matches: Match[];
  activeMatchId: string;
  setActiveMatch: (matchId: string) => void;
  addMatch: (match: Omit<Match, 'id'>) => void;
  updateMatch: (id: string, updates: Partial<Match>) => void;
  setStartingLineup: (matchId: string, playerIds: string[]) => void;
  substitutePlayer: (
    matchId: string,
    playerOutId: string,
    playerInId: string
  ) => void;
  addPlayByPlayEvent: (
    matchId: string,
    event: Omit<PlayByPlayEvent, 'id' | 'timestamp' | 'scoreAtEvent'>
  ) => void;
  undoLastPlayByPlayEvent: (matchId: string) => void;

  // Reset
  resetToSeedData: () => void;
}

export const useClubStore = create<ClubStoreState>()(
  persist(
    (set, get) => ({
      // INITIAL SEED STATE
      currentUser: SEED_USERS[0],
      switchRole: (role: UserRole) => {
        const matchingUser =
          SEED_USERS.find((u) => u.role === role) || {
            ...get().currentUser,
            role,
          };
        set({ currentUser: matchingUser });
      },

      divisions: SEED_DIVISIONS,
      activeDivisionId: 'div-primera',
      setActiveDivision: (divisionId: string) =>
        set({ activeDivisionId: divisionId }),

      addDivision: (newDiv) =>
        set((state) => ({
          divisions: [
            ...state.divisions,
            { ...newDiv, id: `div-${Date.now()}` },
          ],
        })),

      updateDivision: (id, updates) =>
        set((state) => ({
          divisions: state.divisions.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
        })),

      deleteDivision: (id) =>
        set((state) => ({
          divisions: state.divisions.filter((d) => d.id !== id),
        })),

      teams: SEED_TEAMS,
      addTeam: (newTeam) =>
        set((state) => ({
          teams: [...state.teams, { ...newTeam, id: `team-${Date.now()}` }],
        })),

      updateTeam: (id, updates) =>
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),

      deleteTeam: (id) =>
        set((state) => ({
          teams: state.teams.filter((t) => t.id !== id),
        })),

      players: SEED_PLAYERS,
      addPlayer: (newPlayer) =>
        set((state) => {
          const playerId = `p-${Date.now()}`;
          const createdPlayer: Player = { ...newPlayer, id: playerId };
          // If assigned to a team, also update the team roster
          const updatedTeams = state.teams.map((team) => {
            if (team.id === newPlayer.teamId) {
              return {
                ...team,
                playerIds: [...team.playerIds, playerId],
              };
            }
            return team;
          });

          return {
            players: [...state.players, createdPlayer],
            teams: updatedTeams,
          };
        }),

      updatePlayer: (id, updates) =>
        set((state) => ({
          players: state.players.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      deletePlayer: (id) =>
        set((state) => ({
          players: state.players.filter((p) => p.id !== id),
          teams: state.teams.map((t) => ({
            ...t,
            playerIds: t.playerIds.filter((pid) => pid !== id),
          })),
        })),

      callUpPlayerToTeam: (playerId, targetTeamId) =>
        set((state) => {
          const targetTeam = state.teams.find((t) => t.id === targetTeamId);
          if (!targetTeam) return state;

          if (targetTeam.playerIds.includes(playerId)) return state;

          const updatedTeams = state.teams.map((t) =>
            t.id === targetTeamId
              ? { ...t, playerIds: [...t.playerIds, playerId] }
              : t
          );

          return { teams: updatedTeams };
        }),

      matches: SEED_MATCHES,
      activeMatchId: 'match-live-today',
      setActiveMatch: (matchId: string) => set({ activeMatchId: matchId }),

      addMatch: (newMatch) =>
        set((state) => ({
          matches: [
            ...state.matches,
            { ...newMatch, id: `match-${Date.now()}`, events: [] },
          ],
        })),

      updateMatch: (id, updates) =>
        set((state) => ({
          matches: state.matches.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),

      setStartingLineup: (matchId, playerIds) =>
        set((state) => ({
          matches: state.matches.map((m) => {
            if (m.id !== matchId) return m;
            return {
              ...m,
              activeLineupOwn: playerIds.slice(0, 5),
            };
          }),
        })),

      substitutePlayer: (matchId, playerOutId, playerInId) =>
        set((state) => {
          const targetMatch = state.matches.find((m) => m.id === matchId);
          if (!targetMatch) return state;

          const currentLineup = targetMatch.activeLineupOwn || [];
          const newLineup = currentLineup.map((pid) =>
            pid === playerOutId ? playerInId : pid
          );

          const subEvent: PlayByPlayEvent = {
            id: `ev-sub-${Date.now()}`,
            matchId,
            quarter: targetMatch.currentQuarter,
            quarterTimeRemainingSeconds:
              targetMatch.quarterTimeRemainingSeconds,
            teamId: targetMatch.ownTeamId,
            isOwnTeam: true,
            type: 'SUBSTITUTION',
            substitution: { playerInId, playerOutId },
            scoreAtEvent: {
              home: targetMatch.homeScore,
              away: targetMatch.awayScore,
            },
            timestamp: new Date().toISOString(),
          };

          return {
            matches: state.matches.map((m) =>
              m.id === matchId
                ? {
                    ...m,
                    activeLineupOwn: newLineup,
                    events: [...m.events, subEvent],
                  }
                : m
            ),
          };
        }),

      addPlayByPlayEvent: (matchId, eventData) =>
        set((state) => {
          const match = state.matches.find((m) => m.id === matchId);
          if (!match) return state;

          let homeDelta = 0;
          let awayDelta = 0;
          let foulDelta = 0;

          // Points calculation
          let points = 0;
          if (eventData.type === 'FT_MADE') points = 1;
          else if (eventData.type === 'FG2_MADE') points = 2;
          else if (eventData.type === 'FG3_MADE') points = 3;

          const isHomeScore =
            (match.condition === 'HOME' && eventData.isOwnTeam) ||
            (match.condition === 'AWAY' && !eventData.isOwnTeam);

          if (isHomeScore) {
            homeDelta = points;
          } else {
            awayDelta = points;
          }

          // Foul calculation
          if (
            eventData.type === 'FOUL_PERSONAL' ||
            eventData.type === 'FOUL_TECHNICAL' ||
            eventData.type === 'FOUL_UNSPORTSMANLIKE'
          ) {
            foulDelta = 1;
          }

          const newHomeScore = match.homeScore + homeDelta;
          const newAwayScore = match.awayScore + awayDelta;

          const newHomeFouls =
            (match.condition === 'HOME' && eventData.isOwnTeam) ||
            (match.condition === 'AWAY' && !eventData.isOwnTeam)
              ? match.homeFoulsQuarter + foulDelta
              : match.homeFoulsQuarter;

          const newAwayFouls =
            (match.condition === 'HOME' && !eventData.isOwnTeam) ||
            (match.condition === 'AWAY' && eventData.isOwnTeam)
              ? match.awayFoulsQuarter + foulDelta
              : match.awayFoulsQuarter;

          const fullEvent: PlayByPlayEvent = {
            ...eventData,
            id: `ev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            scoreAtEvent: {
              home: newHomeScore,
              away: newAwayScore,
            },
            timestamp: new Date().toISOString(),
          };

          return {
            matches: state.matches.map((m) =>
              m.id === matchId
                ? {
                    ...m,
                    homeScore: newHomeScore,
                    awayScore: newAwayScore,
                    homeFoulsQuarter: newHomeFouls,
                    awayFoulsQuarter: newAwayFouls,
                    events: [...m.events, fullEvent],
                  }
                : m
            ),
          };
        }),

      undoLastPlayByPlayEvent: (matchId) =>
        set((state) => {
          const match = state.matches.find((m) => m.id === matchId);
          if (!match || match.events.length === 0) return state;

          const lastEvent = match.events[match.events.length - 1];
          const remainingEvents = match.events.slice(0, -1);

          // Revert points if last event was scoring
          let homeDelta = 0;
          let awayDelta = 0;
          let points = 0;
          if (lastEvent.type === 'FT_MADE') points = 1;
          else if (lastEvent.type === 'FG2_MADE') points = 2;
          else if (lastEvent.type === 'FG3_MADE') points = 3;

          const isHomeScore =
            (match.condition === 'HOME' && lastEvent.isOwnTeam) ||
            (match.condition === 'AWAY' && !lastEvent.isOwnTeam);

          if (isHomeScore) {
            homeDelta = points;
          } else {
            awayDelta = points;
          }

          // Revert foul if last event was a foul
          let foulDelta = 0;
          if (
            lastEvent.type === 'FOUL_PERSONAL' ||
            lastEvent.type === 'FOUL_TECHNICAL' ||
            lastEvent.type === 'FOUL_UNSPORTSMANLIKE'
          ) {
            foulDelta = 1;
          }

          const newHomeScore = Math.max(0, match.homeScore - homeDelta);
          const newAwayScore = Math.max(0, match.awayScore - awayDelta);

          const newHomeFouls =
            (match.condition === 'HOME' && lastEvent.isOwnTeam) ||
            (match.condition === 'AWAY' && !lastEvent.isOwnTeam)
              ? Math.max(0, match.homeFoulsQuarter - foulDelta)
              : match.homeFoulsQuarter;

          const newAwayFouls =
            (match.condition === 'HOME' && !lastEvent.isOwnTeam) ||
            (match.condition === 'AWAY' && lastEvent.isOwnTeam)
              ? Math.max(0, match.awayFoulsQuarter - foulDelta)
              : match.awayFoulsQuarter;

          // Revert substitution if it was a sub
          let activeLineup = match.activeLineupOwn;
          if (lastEvent.type === 'SUBSTITUTION' && lastEvent.substitution) {
            activeLineup = match.activeLineupOwn.map((pid) =>
              pid === lastEvent.substitution!.playerInId
                ? lastEvent.substitution!.playerOutId
                : pid
            );
          }

          return {
            matches: state.matches.map((m) =>
              m.id === matchId
                ? {
                    ...m,
                    homeScore: newHomeScore,
                    awayScore: newAwayScore,
                    homeFoulsQuarter: newHomeFouls,
                    awayFoulsQuarter: newAwayFouls,
                    activeLineupOwn: activeLineup,
                    events: remainingEvents,
                  }
                : m
            ),
          };
        }),

      resetToSeedData: () =>
        set({
          currentUser: SEED_USERS[0],
          divisions: SEED_DIVISIONS,
          teams: SEED_TEAMS,
          players: SEED_PLAYERS,
          matches: SEED_MATCHES,
          activeDivisionId: 'div-primera',
          activeMatchId: 'match-live-today',
        }),
    }),
    {
      name: 'hoop-club-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
