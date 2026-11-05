import type { Match } from '@/core/domain/entities/match.types';
import { isMatchInPlay } from '@/core/domain/rules/match-status';
import type { TourId } from './tour-model';

/** Where a tour can be replayed from the picker, or why it cannot open now. */
export type TourEntry = { href: string } | { unavailable: string };

const FIXED_ROUTES: Partial<Record<TourId, string>> = {
  welcome: '/',
  dashboard: '/',
  divisions: '/divisions',
  players: '/players',
  matches: '/matches',
  planilla: '/planilla',
  rivales: '/rivales',
  entrenadores: '/entrenadores',
  help: '/ayuda',
};

const byDate = (a: Match, b: Match) => a.date.localeCompare(b.date);

const matchRoute = (match: Match | undefined, screen: string, unavailable: string): TourEntry =>
  match ? { href: `/matches/${match.id}/${screen}` } : { unavailable };

export function tourEntry(tourId: TourId, matches: readonly Match[]): TourEntry {
  const fixed = FIXED_ROUTES[tourId];
  if (fixed) return { href: fixed };

  const inPlay = matches.find(isMatchInPlay);
  if (tourId === 'live') return matchRoute(inPlay, 'live', 'Necesita un partido en juego.');

  if (tourId === 'lineup') {
    const nextScheduled = matches.filter((m) => m.status === 'SCHEDULED').sort(byDate)[0];
    return matchRoute(nextScheduled ?? inPlay, 'lineup', 'Necesita un partido programado o en juego.');
  }

  const lastFinished = matches.filter((m) => m.status === 'FINISHED').sort(byDate).at(-1);
  return matchRoute(lastFinished ?? inPlay, 'stats', 'Necesita un partido en juego o finalizado.');
}
