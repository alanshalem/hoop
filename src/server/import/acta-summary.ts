import 'server-only';
import type { ScoreSnapshot } from '@/core/domain/entities/match.types';
import type { ActaImport } from './acta-import-types';

function formatPeriods(quarters: readonly ScoreSnapshot[]): string {
  return quarters
    .map(({ home, away }, index) => `${index === 4 ? 'OT ' : ''}${home}-${away}`)
    .join(' ');
}

/** Human-readable summary of what the import writes (dry run and real run). */
export function formatActaImportSummary(data: ActaImport): string {
  const { report } = data;
  const rivalPlayers = data.rivalTeams.reduce((total, team) => total + team.players.length, 0);
  const lines = [
    'Records:',
    '  divisions: 1',
    '  teams: 1',
    `  players: ${data.players.length}`,
    `  coaches: ${data.coaches.length} (${data.coaches.map((c) => `${c.name} ${c.license ?? ''} ${c.role}`.replace(/\s+/g, ' ')).join('; ')})`,
    `  rival teams: ${data.rivalTeams.length} (rival players: ${rivalPlayers})`,
    `  matches: ${data.matches.length}`,
    'Matches (final and points per period, home - away):',
    ...report.matches.map(
      (m) =>
        `  ${m.matchId} Fecha ${m.round} ${m.localDate} ${m.time} ${m.home} ${m.homePoints} - ${m.awayPoints} ${m.away} | ${formatPeriods(m.quarters)} | quarters OK`
    ),
    'Shared own dorsals (kept):',
    ...(report.sharedDorsals.length > 0
      ? report.sharedDorsals.map((s) => `  ${s.teamName} #${s.dorsal}: ${s.players.join(', ')}`)
      : ['  none']),
    'Reassigned rival dorsals:',
    ...(report.reassignedDorsals.length > 0
      ? report.reassignedDorsals.map(
          (r) => `  ${r.teamName}: ${r.player} wanted #${r.wanted} (held by ${r.heldBy}), got #${r.assigned}`
        )
      : ['  none']),
    'Names completed from the reports:',
    ...(report.completedNames.length > 0
      ? report.completedNames.map((c) => `  ${c.teamName}: ${c.player} -> ${c.completed} (match ${c.matchId})`)
      : ['  none']),
    'Players listed with more than one number (most frequent first):',
    ...(report.numberVariants.length > 0
      ? report.numberVariants.map((v) => `  ${v.teamName}: ${v.player} ${v.numbers.map((n) => `#${n}`).join(', ')}`)
      : ['  none']),
  ];
  return lines.join('\n');
}
