import type { TimeoutPeriod } from '@/core/domain/rules/timeouts';
import type {
  RecordEventReason,
  RequestTimeoutResult,
  SubstitutionReason,
  UndoReason,
} from '@/core/application/use-cases/match-use-cases';

/** Every refusal the live console can receive from the store. */
export type ConsoleRefusal =
  | RecordEventReason
  | UndoReason
  | SubstitutionReason
  | Extract<RequestTimeoutResult, { ok: false }>['reason']
  | 'MATCH_NOT_FOUND';

export const REFUSAL_MESSAGES: Record<ConsoleRefusal, string> = {
  MATCH_NOT_FOUND: 'El partido ya no existe.',
  MATCH_NOT_LIVE: 'El partido no está en juego, no se pueden registrar jugadas.',
  INVALID_EVENT: 'La acción no es válida para este registro.',
  NO_EVENTS: 'No hay jugadas para deshacer.',
  PLAYER_NOT_ON_COURT: 'El jugador que sale no está en cancha.',
  PLAYER_ALREADY_ON_COURT: 'El jugador que entra ya está en cancha.',
  PLAYER_NOT_IN_ROSTER: 'El jugador no está en la convocatoria del partido.',
  PLAYER_FOULED_OUT: 'El jugador está excluido por 5 faltas y no puede volver a cancha.',
  NO_TIMEOUTS_LEFT: 'No quedan tiempos muertos en este período.',
};

export const TIMEOUT_PERIOD_LABELS: Record<TimeoutPeriod, string> = {
  FIRST_HALF: 'la primera mitad',
  SECOND_HALF: 'la segunda mitad',
  OVERTIME: 'este suplementario',
};

export const formatTimeouts = (count: number): string =>
  `${count} ${count === 1 ? 'tiempo muerto' : 'tiempos muertos'}`;
