import type { Quarter } from '@/core/domain/entities/match.types';
import { getTimeoutPeriod, isLastTwoMinutesOfFourthQuarter, type TimeoutPeriod } from '@/core/domain/rules/timeouts';
import type {
  RecordChartReason,
  RecordEventReason,
  RequestTimeoutResult,
  UndoChartReason,
  UndoOwnFoulReason,
  UndoRivalFoulReason,
} from '@/core/application/use-cases/match-use-cases';

/** Every refusal the live console can receive from the store. */
export type ConsoleRefusal =
  | RecordEventReason
  | UndoRivalFoulReason
  | UndoOwnFoulReason
  | RecordChartReason
  | UndoChartReason
  | Extract<RequestTimeoutResult, { ok: false }>['reason']
  | 'NOT_END_OF_FIRST_HALF'
  | 'NOT_HALFTIME'
  | 'MATCH_NOT_FOUND';

export const REFUSAL_MESSAGES: Record<ConsoleRefusal, string> = {
  MATCH_NOT_FOUND: 'El partido ya no existe.',
  MATCH_NOT_LIVE: 'El partido no está en juego, no se pueden registrar jugadas.',
  HALFTIME: 'Es el entretiempo: no se registran jugadas ni tiempos muertos hasta comenzar el 3.er cuarto.',
  NOT_END_OF_FIRST_HALF: 'El entretiempo solo empieza al terminar el 2.º cuarto.',
  NOT_HALFTIME: 'El partido no está en el entretiempo.',
  NO_RIVAL_FOULS: 'No hay faltas del rival para deshacer.',
  NO_OWN_FOULS: 'No hay faltas de tu equipo para deshacer.',
  INVALID_CHART_CODE: 'El código no corresponde a esa categoría de la planilla.',
  INVALID_CHART_RESULT: 'Elige si la acción ofensiva convirtió o no y de cuántos puntos fue el tiro.',
  INVALID_RIVAL_PLAYER: 'El jugador rival no pertenece al plantel de este rival.',
  NO_CHART_ENTRIES: 'No hay entradas de la planilla para deshacer.',
  NO_TIMEOUTS_LEFT: 'No quedan tiempos muertos en este período.',
};

export const TIMEOUT_PERIOD_LABELS: Record<TimeoutPeriod, string> = {
  FIRST_HALF: 'la primera mitad',
  SECOND_HALF: 'la segunda mitad',
  OVERTIME: 'este suplementario',
};

/** Span the remaining timeouts refer to, including the last 2 minutes of Q4 (FIBA Art. 18.2.5). */
export const timeoutWindowLabel = (quarter: Quarter, clockSeconds: number): string =>
  isLastTwoMinutesOfFourthQuarter(quarter, clockSeconds)
    ? 'los últimos 2 minutos del 4.º cuarto'
    : TIMEOUT_PERIOD_LABELS[getTimeoutPeriod(quarter)];

export const formatTimeouts = (count: number): string =>
  `${count} ${count === 1 ? 'tiempo muerto' : 'tiempos muertos'}`;
