import type { Match, MatchCondition, MatchStatus } from '@/core/domain/entities/match.types';
import { getOwnRivalScore } from '@/core/domain/rules/match-derivations';
import { getEventPoints } from '@/core/domain/rules/event-rules';

/**
 * Presentation helpers shared by the match calendar, the dashboard and the lineup screen.
 */

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  SCHEDULED: 'Programado',
  LIVE: 'En vivo',
  HALFTIME: 'Entretiempo',
  FINISHED: 'Finalizado',
};

export const MATCH_CONDITION_LABELS: Record<MatchCondition, string> = {
  HOME: 'Local',
  AWAY: 'Visitante',
};

const DATE_FORMAT = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const TIME_FORMAT = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "sáb, 07 nov 2026" and "21:00" (local time, es-AR). Invalid dates yield empty strings. */
export const formatMatchDate = (iso: string): { date: string; time: string } => {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return { date: '', time: '' };
  return { date: DATE_FORMAT.format(value), time: TIME_FORMAT.format(value) };
};

export const OFFICIAL_RESULT_LABEL = 'Resultado oficial (acta)';

/**
 * The score and partials come from the official report (S3): the match has an
 * official result and no scoring plays, so box score and shot map stay empty.
 */
export const hasOnlyOfficialResult = (match: Pick<Match, 'events' | 'officialResult'>): boolean =>
  match.officialResult !== undefined && !match.events.some((event) => getEventPoints(event.type) > 0);

/** Player stats (leaders, shooting) need recorded plays; imported reports only bring the score (S3). */
export const hasAnyPlays = (matches: readonly Pick<Match, 'events'>[]): boolean =>
  matches.some((match) => match.events.length > 0);

export type MatchOutcome = 'WIN' | 'LOSS' | 'DRAW';

export const getMatchOutcome = (match: Match): { own: number; rival: number; outcome: MatchOutcome } => {
  const { own, rival } = getOwnRivalScore(match);
  const outcome: MatchOutcome = own > rival ? 'WIN' : own < rival ? 'LOSS' : 'DRAW';
  return { own, rival, outcome };
};

const STATUS_ORDER: Record<MatchStatus, number> = {
  LIVE: 0,
  HALFTIME: 0,
  SCHEDULED: 1,
  FINISHED: 2,
};

const timeOf = (match: Match): number => {
  const value = new Date(match.date).getTime();
  return Number.isNaN(value) ? 0 : value;
};

/**
 * Calendar order: matches in play first, then upcoming ones (soonest first),
 * then finished ones (most recent first).
 */
export const sortMatchesForCalendar = (matches: Match[]): Match[] =>
  [...matches].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    const byDate = timeOf(a) - timeOf(b);
    return a.status === 'FINISHED' ? -byDate : byDate;
  });
