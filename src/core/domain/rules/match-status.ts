import type { Match } from '../entities/match.types';

/** LIVE and HALFTIME are both "in play": the match has started and is not finished. */
export const isMatchInPlay = (match: Pick<Match, 'status'>): boolean =>
  match.status === 'LIVE' || match.status === 'HALFTIME';
