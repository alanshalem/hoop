import 'server-only';
import type { Division, DivisionCategory, GenderCategory, Player, Team } from '@/core/domain/entities/club.types';
import type { Coach } from '@/core/domain/entities/coach.types';
import {
  OfficialResultSchema,
  QuarterSchema,
  type MatchCondition,
  type ScoreSnapshot,
} from '@/core/domain/entities/match.types';
import type { RivalPlayer, RivalTeam } from '@/core/domain/entities/rival.types';
import { createMatch } from '@/core/application/use-cases/match-use-cases';
import { CLUB_PROFILE } from '@/core/domain/club-profile';
import { groupByMatch, type ActaCsvRow } from './acta-csv';
import { ActaImportError } from './acta-import-error';
import type {
  ActaImport,
  ActaImportOptions,
  CompletedName,
  ReassignedDorsal,
  SharedDorsal,
} from './acta-import-types';
import type { ActaReport } from './acta-report-text';
import {
  assignRivalDorsals,
  completeFromReport,
  playerLabel,
  Roster,
  tallyStaff,
  type ListedPlayer,
  type StaffTally,
} from './acta-rosters';
import { normalizeName, numberPreference, parseCount, parseKickoff, slug, titleCaseUpperWords } from './acta-values';

const ID_PREFIX = 'acta';

/** "PRE FEDERAL MASCULINO (Primera)" -> the Primera division, described as PRE FEDERAL MASCULINO. */
function buildDivision(category: string, clubId: string): Division {
  const parts = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(category);
  const name = parts ? parts[2].trim() : category;
  const description = parts ? parts[1].trim() : undefined;
  const gender: GenderCategory = /FEMENIN/i.test(category) ? 'FEMALE' : /MASCULIN/i.test(category) ? 'MALE' : 'MIXED';
  const divisionCategory: DivisionCategory = slug(name) === 'primera' ? 'PRIMERA' : 'CUSTOM';
  return {
    id: `${ID_PREFIX}-div-${slug(name)}`,
    name,
    category: divisionCategory,
    gender,
    clubId,
    ...(description ? { description } : {}),
  };
}

/**
 * Builds the club records of the reports: the division of the CSV category,
 * the own team with its players and coaches, one rival team per opponent and
 * one finished match per report with its official result.
 */
export function buildActaImport(
  rows: readonly ActaCsvRow[],
  reports: readonly ActaReport[],
  options: ActaImportOptions = { clubId: CLUB_PROFILE.id, season: CLUB_PROFILE.season }
): ActaImport {
  const problems: string[] = [];
  const fail = (): never => {
    throw new ActaImportError(problems);
  };
  const { clubId, season } = options;

  for (const row of rows) {
    if (row.isRival !== 'Si' && row.isRival !== 'No') {
      problems.push(`CSV line ${row.line}: Es_rival must be "Si" or "No", found "${row.isRival}"`);
    }
  }
  const matchRows = groupByMatch(rows, problems);
  const ownNames = [...new Set(rows.filter((row) => row.isRival === 'No').map((row) => row.team))];
  if (ownNames.length !== 1) {
    problems.push(`CSV: expected one own team (Es_rival = No), found ${ownNames.length}: ${ownNames.join(', ')}`);
  }
  const categories = [...new Set(rows.map((row) => row.category))];
  if (categories.length !== 1) {
    problems.push(`CSV: expected one category, found ${categories.length}: ${categories.join(', ')}`);
  }
  if (problems.length > 0) fail();

  const ownTeamName = ownNames[0];
  const division = buildDivision(categories[0], clubId);
  const teamId = `${ID_PREFIX}-team-${slug(division.name)}`;
  const ownRoster = new Roster(ownTeamName);
  const rivalRosters = new Map<string, Roster>();
  const reportsById = new Map<string, ActaReport>();
  for (const report of reports) {
    if (reportsById.has(report.matchId)) problems.push(`Match ${report.matchId}: more than one report`);
    reportsById.set(report.matchId, report);
  }

  interface PlannedMatch {
    matchId: string;
    first: ActaCsvRow;
    condition: MatchCondition;
    rivalName: string;
    kickoff: { iso: string; localDate: string };
    round: number;
    homePoints: number;
    awayPoints: number;
    roster: ListedPlayer[];
    quarters: ScoreSnapshot[];
  }
  const planned: PlannedMatch[] = [];
  const headCoaches: string[] = [];
  const assistantCoaches: string[] = [];
  const completedNames: CompletedName[] = [];

  for (const { matchId, rows: group } of matchRows) {
    const [first] = group;
    const label = `Match ${matchId}`;
    const condition: MatchCondition | null =
      first.home === ownTeamName ? 'HOME' : first.away === ownTeamName ? 'AWAY' : null;
    const kickoff = parseKickoff(first.date, first.time);
    const round = parseCount(first.round);
    const homePoints = parseCount(first.homePoints);
    const awayPoints = parseCount(first.awayPoints);
    if (!condition) problems.push(`${label}: ${ownTeamName} is neither Local nor Visitante`);
    if (!kickoff) problems.push(`${label}: date "${first.date} ${first.time}" is not DD/MM/YYYY HH:MM`);
    if (round === null) problems.push(`${label}: Jornada "${first.round}" is not a number`);
    if (homePoints === null || awayPoints === null) problems.push(`${label}: the CSV score is not numeric`);
    if (!condition || !kickoff || round === null || homePoints === null || awayPoints === null) continue;

    const rivalName = condition === 'HOME' ? first.away : first.home;
    const rivalRoster = rivalRosters.get(rivalName) ?? new Roster(rivalName);
    rivalRosters.set(rivalName, rivalRoster);
    const report = reportsById.get(matchId);
    const roster: ListedPlayer[] = [];
    for (const row of group) {
      const own = row.isRival === 'No';
      if (row.team !== (own ? ownTeamName : rivalName)) {
        problems.push(`CSV line ${row.line}: team "${row.team}" does not play match ${matchId}`);
        continue;
      }
      const completed = completeFromReport(row, report);
      const player = (own ? ownRoster : rivalRoster).add(row, completed ?? row.player, problems);
      if (completed && player) {
        const label = row.license ? `${row.license} ${row.player}` : row.player;
        if (!completedNames.some((c) => c.teamName === row.team && c.player === label)) {
          completedNames.push({ teamName: row.team, matchId, player: label, completed });
        }
      }
      if (own && player && !roster.includes(player)) roster.push(player);
    }
    const ownRow = group.find((row) => row.isRival === 'No');
    if (ownRow) {
      headCoaches.push(ownRow.headCoach);
      assistantCoaches.push(ownRow.assistantCoach);
    }

    if (!report) {
      problems.push(`${label}: no match report`);
      continue;
    }
    const ownName = normalizeName(ownTeamName);
    const ownIsA = normalizeName(report.teamA).includes(ownName);
    const ownIsB = normalizeName(report.teamB).includes(ownName);
    if (ownIsA === ownIsB) {
      problems.push(`${label}: the report names "${ownTeamName}" on ${ownIsA ? 'both' : 'neither'} Equipo A ${ownIsA ? 'and' : 'nor'} Equipo B`);
      continue;
    }
    // Equipo A is the home side when it is the own team playing at home, or the rival playing at home.
    const homeIsA = ownIsA === (condition === 'HOME');
    const reportHome = homeIsA ? report.finalA : report.finalB;
    const reportAway = homeIsA ? report.finalB : report.finalA;
    if (reportHome !== homePoints || reportAway !== awayPoints) {
      problems.push(
        `${label}: the report final (${report.finalA}-${report.finalB}) does not match the CSV score (${homePoints}-${awayPoints})`
      );
      continue;
    }
    const sumA = report.periods.reduce((total, period) => total + period.a, 0);
    const sumB = report.periods.reduce((total, period) => total + period.b, 0);
    if (sumA !== report.finalA) {
      problems.push(`${label}: quarters of Equipo A add up to ${sumA}, the final score is ${report.finalA}`);
    }
    if (sumB !== report.finalB) {
      problems.push(`${label}: quarters of Equipo B add up to ${sumB}, the final score is ${report.finalB}`);
    }
    if (sumA !== report.finalA || sumB !== report.finalB) continue;
    const quarters = report.periods.map(({ a, b }) => (homeIsA ? { home: a, away: b } : { home: b, away: a }));
    planned.push({ matchId, first, condition, rivalName, kickoff, round, homePoints, awayPoints, roster, quarters });
  }
  const csvMatchIds = new Set(matchRows.map((group) => group.matchId));
  for (const report of reports) {
    if (!csvMatchIds.has(report.matchId)) problems.push(`Match ${report.matchId}: report without CSV rows`);
  }

  const rivalTeamIds = new Map<string, string>();
  for (const name of rivalRosters.keys()) {
    const id = `${ID_PREFIX}-rival-${slug(name)}`;
    const clash = [...rivalTeamIds].find(([, other]) => other === id);
    if (clash) problems.push(`Rival teams "${clash[0]}" and "${name}" have the same name once normalized`);
    rivalTeamIds.set(name, id);
  }
  if (problems.length > 0) fail();

  const playerId = (player: ListedPlayer) => `${ID_PREFIX}-player-${slug(player.key)}`;
  const ownPlayers = [...ownRoster.players.values()];
  const players: Player[] = ownPlayers.map((player) => ({
    id: playerId(player),
    firstName: player.firstName,
    lastName: player.lastName,
    dorsal: numberPreference(player.numbers)[0],
    dominantHand: 'RIGHT',
    status: 'ACTIVE',
    teamId,
    clubId,
    ...(player.license ? { license: player.license } : {}),
  }));

  const byDorsal = new Map<number, string[]>();
  players.forEach((player, index) => {
    const labels = byDorsal.get(player.dorsal) ?? [];
    labels.push(playerLabel(ownPlayers[index]));
    byDorsal.set(player.dorsal, labels);
  });
  const sharedDorsals: SharedDorsal[] = [...byDorsal]
    .filter(([, labels]) => labels.length > 1)
    .sort(([a], [b]) => a - b)
    .map(([dorsal, labels]) => ({ teamName: ownTeamName, dorsal, players: labels }));

  const reassignedDorsals: ReassignedDorsal[] = [];
  const rivalTeams: RivalTeam[] = [...rivalRosters].map(([name, roster]) => {
    const id = rivalTeamIds.get(name) ?? '';
    const { dorsals, reassigned } = assignRivalDorsals(roster);
    reassignedDorsals.push(...reassigned);
    const rivalPlayers: RivalPlayer[] = [...roster.players.values()].map((player) => ({
      id: `${id}-${slug(player.key)}`,
      dorsal: dorsals.get(player.key) ?? 0,
      firstName: player.firstName,
      lastName: player.lastName,
    }));
    return { id, clubId, divisionId: division.id, name, players: rivalPlayers };
  });

  const coachId = (staff: StaffTally) => `${ID_PREFIX}-coach-${slug(staff.license ?? staff.name)}`;
  const heads = tallyStaff(headCoaches);
  const headIds = new Set(heads.map(coachId));
  const assistants = tallyStaff(assistantCoaches).filter((staff) => !headIds.has(coachId(staff)));
  const toCoach = (staff: StaffTally, role: Coach['role']): Coach => ({
    id: coachId(staff),
    clubId,
    name: staff.name,
    role,
    ...(staff.license ? { license: staff.license } : {}),
  });
  const coaches = [...heads.map((staff) => toCoach(staff, 'HEAD')), ...assistants.map((staff) => toCoach(staff, 'ASSISTANT'))];

  const team: Team = {
    id: teamId,
    name: ownTeamName,
    divisionId: division.id,
    season,
    ...(heads[0] ? { headCoachId: coachId(heads[0]) } : {}),
    assistantCoachIds: assistants.map(coachId),
    playerIds: players.map((player) => player.id),
    clubId,
  };

  const matches = planned.map((plan) => {
    const officialResult = OfficialResultSchema.parse({
      home: plan.homePoints,
      away: plan.awayPoints,
      quarters: plan.quarters,
    });
    return createMatch(
      {
        clubId,
        divisionId: division.id,
        ownTeamId: teamId,
        ownTeamName,
        rivalTeamName: plan.rivalName,
        date: plan.kickoff.iso,
        condition: plan.condition,
        tournament: `${titleCaseUpperWords(plan.first.competition)} - Fecha ${plan.round}`,
        venue: plan.first.venue,
        status: 'FINISHED',
        currentQuarter: QuarterSchema.options[plan.quarters.length - 1],
        quarterTimeRemainingSeconds: 0,
        rosterOwnPlayerIds: plan.roster.map(playerId),
        officialResult,
      },
      { id: `${ID_PREFIX}-match-${plan.matchId}` }
    );
  });

  return {
    division,
    team,
    players,
    coaches,
    rivalTeams,
    matches,
    report: {
      matches: planned.map((plan) => ({
        matchId: plan.matchId,
        round: plan.round,
        localDate: plan.kickoff.localDate,
        time: plan.first.time,
        home: plan.first.home,
        away: plan.first.away,
        homePoints: plan.homePoints,
        awayPoints: plan.awayPoints,
        quarters: plan.quarters,
      })),
      sharedDorsals,
      reassignedDorsals,
      numberVariants: [ownRoster, ...rivalRosters.values()].flatMap((roster) => roster.numberVariants()),
      completedNames,
    },
  };
}
