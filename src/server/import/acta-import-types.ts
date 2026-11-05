import 'server-only';
import type { Division, Player, Team } from '@/core/domain/entities/club.types';
import type { Coach } from '@/core/domain/entities/coach.types';
import type { Match, ScoreSnapshot } from '@/core/domain/entities/match.types';
import type { RivalTeam } from '@/core/domain/entities/rival.types';

export interface ActaMatchSummary {
  matchId: string;
  round: number;
  /** As printed on the report: local date (YYYY-MM-DD) and time. */
  localDate: string;
  time: string;
  home: string;
  away: string;
  homePoints: number;
  awayPoints: number;
  /** Points per period, home - away (Q1-Q4, then overtimes). */
  quarters: ScoreSnapshot[];
}

/** Own players listed with the same number: kept (own dorsals need not be unique). */
export interface SharedDorsal {
  teamName: string;
  dorsal: number;
  players: string[];
}

/** A rival player whose number was taken by a teammate (rival dorsals are unique per team). */
export interface ReassignedDorsal {
  teamName: string;
  player: string;
  wanted: number;
  assigned: number;
  heldBy: string;
}

/** A CSV name without initials, completed from the player list of its report. */
export interface CompletedName {
  teamName: string;
  matchId: string;
  player: string;
  completed: string;
}

/** A player listed with several numbers across reports, most frequent first. */
export interface NumberVariant {
  teamName: string;
  player: string;
  numbers: number[];
}

export interface ActaImport {
  division: Division;
  team: Team;
  players: Player[];
  coaches: Coach[];
  rivalTeams: RivalTeam[];
  matches: Match[];
  report: {
    matches: ActaMatchSummary[];
    sharedDorsals: SharedDorsal[];
    reassignedDorsals: ReassignedDorsal[];
    numberVariants: NumberVariant[];
    completedNames: CompletedName[];
  };
}

export interface ActaImportOptions {
  clubId: string;
  season: string;
}
