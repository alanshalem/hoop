import { rolesWith, type TourDefinition, type TourId } from './tour-model';

/**
 * Guided tour catalog (S12). Each target is the `data-tour` attribute of an
 * element on screen; steps whose target is not rendered are skipped. Examples
 * use the seed data (Primera División, the live match against Obras Sanitarias).
 */

const MANAGE_DIVISIONS = rolesWith('MANAGE_DIVISIONS');
const MANAGE_PLAYERS = rolesWith('MANAGE_PLAYERS');
const MANAGE_MATCHES = rolesWith('MANAGE_MATCHES');
const MANAGE_LINEUP = rolesWith('MANAGE_LINEUP');
const RECORD_LIVE = rolesWith('RECORD_LIVE');

const WELCOME: TourDefinition = {
  id: 'welcome',
  title: 'Bienvenida a Hoop',
  steps: [
    {
      target: null,
      title: 'Bienvenido a Hoop',
      body: 'El sistema de básquet del Club Atlético Monte Grande. En un minuto te mostramos dónde está cada cosa. Puedes saltar el recorrido cuando quieras.',
    },
    {
      target: 'nav-dashboard',
      placement: 'right',
      title: 'Dashboard',
      body: 'El tablero de la división: partido en juego o próximo partido, récord, líderes y alertas médicas.',
      example: 'Ejemplo: si hay un partido en vivo, desde aquí abres su consola con un toque.',
    },
    {
      target: 'nav-divisions',
      placement: 'right',
      title: 'Divisiones',
      body: 'Cada división del club con su equipo, su plantel y su entrenador.',
    },
    {
      target: 'nav-players',
      placement: 'right',
      title: 'Jugadores',
      body: 'Fichas de todo el club: posición, estado físico, parte médico y convocatoria de juveniles.',
    },
    {
      target: 'nav-matches',
      placement: 'right',
      title: 'Partidos',
      body: 'El calendario: los partidos en juego primero, luego los próximos y al final los finalizados.',
    },
    {
      target: 'nav-live',
      placement: 'right',
      title: 'Modo partido en vivo',
      body: 'Abre directo la consola del partido que se está jugando para cargar cada jugada desde la tablet.',
    },
    {
      target: 'sync-status',
      placement: 'right',
      title: 'Estado de sincronización',
      body: 'Todo se guarda primero en este dispositivo y se envía al servidor cuando hay conexión. Tócalo para sincronizar al instante.',
      example: 'Ejemplo: "Sin conexión (3 pendientes)" significa que esos 3 cambios se enviarán solos al volver internet.',
    },
    {
      target: 'user-menu',
      placement: 'right',
      title: 'Tu sesión',
      body: 'Tu nombre y tu rol definen qué puedes hacer. Desde aquí cambias el tema, repites el tutorial de la pantalla y cierras sesión.',
    },
    {
      target: 'nav-help',
      placement: 'right',
      title: 'Ayuda',
      body: 'El manual completo del sistema, disponible también sin conexión.',
    },
    {
      target: null,
      title: 'Listo para empezar',
      body: 'La primera vez que abras cada pantalla verás un recorrido corto. Para repetir cualquiera, usa "Ver tutorial" en Ayuda o "Ver tutorial de esta pantalla" en tu menú de usuario.',
    },
  ],
};

const DASHBOARD: TourDefinition = {
  id: 'dashboard',
  title: 'Dashboard',
  steps: [
    {
      target: 'dashboard-divisions',
      title: 'Elige la división',
      body: 'Todo el tablero se calcula para la división elegida.',
      example: 'Ejemplo: toca "Sub-19 (U19)" para ver el récord y los líderes de esa división.',
    },
    {
      target: 'dashboard-hero',
      title: 'Partido en juego o próximo partido',
      body: 'Si hay un partido en vivo verás el marcador y el reloj; si no, el próximo partido programado con su convocatoria.',
      example: 'Ejemplo: con el partido contra Obras Sanitarias en juego, "Abrir consola en vivo" te lleva a cargar jugadas.',
    },
    {
      target: 'dashboard-kpis',
      title: 'Resumen de temporada',
      body: 'Récord, puntos a favor y en contra y porcentajes de tiro, calculados con los partidos finalizados.',
    },
    {
      target: 'dashboard-leaders',
      title: 'Líderes del equipo',
      body: 'Promedios por partido en puntos, rebotes, asistencias y valoración.',
    },
    {
      target: 'dashboard-medical',
      title: 'Alertas médicas',
      body: 'Lesionados y suspendidos de todo el club con su parte médico.',
    },
  ],
};

const DIVISIONS: TourDefinition = {
  id: 'divisions',
  title: 'Divisiones',
  steps: [
    {
      target: 'divisions-create',
      roles: MANAGE_DIVISIONS,
      title: 'Nueva división',
      body: 'Crea una división y su equipo para la temporada.',
      example: 'Ejemplo: "Sub-15 (U15)", categoría juveniles.',
    },
    {
      target: 'division-card',
      title: 'Tarjeta de la división',
      body: 'Cantidad de jugadores, temporada y entrenador a cargo.',
    },
    {
      target: 'division-roster',
      title: 'Ver plantel',
      body: 'Lista los jugadores del equipo de la división.',
      example: 'Ejemplo: en Primera División verás a #7 Campagna y el resto del plantel.',
    },
    {
      target: 'division-edit',
      roles: MANAGE_DIVISIONS,
      title: 'Editar o eliminar',
      body: 'Cambia el nombre o asigna el entrenador. Eliminar pide confirmación y conserva los partidos.',
    },
  ],
};

const PLAYERS: TourDefinition = {
  id: 'players',
  title: 'Jugadores',
  steps: [
    {
      target: 'players-create',
      roles: MANAGE_PLAYERS,
      title: 'Nuevo jugador',
      body: 'Carga la ficha: dorsal, posición, altura, mano hábil, estado y parte médico.',
    },
    {
      target: 'players-filters',
      title: 'Buscar y filtrar',
      body: 'Busca por apellido, nombre o dorsal y combina filtros por división, posición y estado.',
      example: 'Ejemplo: escribe "7" para encontrar a Campagna, o filtra Estado: Lesionado.',
    },
    {
      target: 'player-card',
      title: 'Ficha del jugador',
      body: 'Puntos de la temporada, altura, mano hábil y división. Si tu rol lo permite, tócala para editarla.',
    },
    {
      target: 'player-callup',
      roles: MANAGE_PLAYERS,
      title: 'Convocar a Primera',
      body: 'Suma un juvenil al plantel de Primera para poder elegirlo en la convocatoria de sus partidos.',
    },
  ],
};

const MATCHES: TourDefinition = {
  id: 'matches',
  title: 'Partidos',
  steps: [
    {
      target: 'matches-create',
      roles: MANAGE_MATCHES,
      title: 'Nuevo partido',
      body: 'Programa un partido con fecha, hora, rival, condición y torneo.',
      example: 'Ejemplo: Primera División vs Boca Juniors, local, el próximo sábado a las 20 h.',
    },
    {
      target: 'matches-filters',
      title: 'Filtros',
      body: 'Filtra por estado (en vivo, programados, finalizados) y por división.',
    },
    {
      target: 'match-card',
      title: 'Partido',
      body: 'Rival, fecha, estado y marcador. Las acciones cambian según el estado del partido.',
    },
    {
      target: 'match-lineup',
      title: 'Armar quinteto',
      body: 'Antes del salto inicial: elige la convocatoria y los 5 titulares e inicia el partido.',
    },
    {
      target: 'match-live',
      title: 'Consola en vivo',
      body: 'Con el partido en juego, abre la consola para registrar cada jugada.',
    },
    {
      target: 'match-stats',
      title: 'Planilla',
      body: 'Al finalizar, el box score FIBA, los parciales y el mapa de tiros.',
    },
  ],
};

const LINEUP: TourDefinition = {
  id: 'lineup',
  title: 'Quinteto y convocatoria',
  steps: [
    {
      target: 'lineup-status',
      title: 'Estado de la convocatoria',
      body: 'Contadores de convocados y titulares y los avisos que faltan resolver antes de empezar.',
    },
    {
      target: 'lineup-roster',
      title: 'Convocatoria',
      body: 'Toca cada jugador para sumarlo a la lista de buena fe (máximo 12, reglamento FIBA).',
      example: 'Ejemplo: toca #7 Campagna para convocarlo.',
    },
    {
      target: 'lineup-starters',
      title: 'Quinteto inicial',
      body: 'Elige exactamente 5 titulares entre los convocados.',
    },
    {
      target: 'lineup-start',
      roles: MANAGE_LINEUP,
      title: 'Iniciar partido',
      body: 'Con la convocatoria y el quinteto listos, inicia el partido y se abre la consola en vivo. Desde ese momento los titulares quedan bloqueados.',
    },
  ],
};

const LIVE: TourDefinition = {
  id: 'live',
  title: 'Consola en vivo',
  steps: [
    {
      target: null,
      title: 'Consola en vivo',
      body: 'La consola abre en la Planilla táctica: cada entrada se carga con 2 toques, primero el jugador y después el código.',
    },
    {
      target: 'live-scoreboard',
      title: 'Tablero',
      body: 'Marcador, período, faltas de equipo y bonus. Toca un período para cambiarlo.',
    },
    {
      target: 'live-clock',
      roles: RECORD_LIVE,
      title: 'Reloj de juego',
      body: 'Inicia y pausa el reloj; los botones de segundos lo corrigen. Al llegar a 00:00 se ofrece pasar al período siguiente.',
    },
    {
      target: 'live-mode',
      title: 'Planilla o Estadística',
      body: 'Planilla es el modo principal: el porqué de cada jugada. Estadística registra tiros, rebotes y faltas para el box score.',
    },
    {
      target: 'live-chart-pad',
      roles: RECORD_LIVE,
      title: 'Cargar la planilla',
      body: 'Elige la categoría, toca el jugador (o Equipo) y después el código. Azul es una acción buena, rojo un error. En Puntos recibidos elige 1, 2 o 3 puntos.',
      example: 'Ejemplo: Pérdidas, #7 Campagna y "Pase malo".',
    },
    {
      target: 'live-chart-sheet',
      title: 'La planilla armada',
      body: 'La grilla por cuarto se arma sola, con los totales de cada cuarto y de cada mitad, como en el papel.',
    },
    {
      target: 'live-tabs',
      title: 'Secciones en el teléfono',
      body: 'En pantallas chicas la consola se divide en Quinteto, Cancha y Acciones.',
    },
    {
      target: 'live-lineup',
      placement: 'right',
      title: 'Estadística: elige el jugador',
      body: 'En modo Estadística, toca un jugador en cancha para seleccionarlo. Con "Cambio" haces una sustitución desde la banca.',
      example: 'Ejemplo: toca #7 Campagna.',
    },
    {
      target: 'live-court',
      title: '2a. Tiro en la cancha',
      body: 'Toca el lugar del tiro y elige Convertido o Fallado: queda en el mapa de tiros.',
      example: 'Ejemplo: toca #7 Campagna, después un punto detrás de la línea de 3 y "Convertido +3".',
    },
    {
      target: 'live-pad',
      placement: 'left',
      title: '2b. Acción en el pad',
      body: 'Puntos, rebotes, asistencias, robos, tapas, pérdidas y faltas del jugador seleccionado.',
      example: 'Ejemplo: toca #7 Campagna y después +2: se suma un doble convertido.',
    },
    {
      target: 'live-rival',
      title: 'Acciones del rival',
      body: 'Puntos y faltas del rival con un solo toque; las faltas encienden su bonus.',
      example: 'Ejemplo: Obras Sanitarias convierte un triple: toca +3.',
    },
    {
      target: 'live-timeout',
      title: 'Tiempos muertos',
      body: 'TM pide un tiempo muerto para ese equipo: detiene el reloj y descuenta los disponibles del período (FIBA).',
    },
    {
      target: 'live-timeline',
      title: 'Últimas jugadas',
      body: 'Revisa lo registrado. "Deshacer" anula la última jugada si te equivocaste.',
    },
    {
      target: 'sync-status',
      title: 'Sincronización',
      body: 'Cada jugada se guarda al instante en la tablet y se envía al servidor cuando hay conexión.',
    },
    {
      target: 'live-finish',
      roles: RECORD_LIVE,
      title: 'Finalizar',
      body: 'Al terminar, finaliza el partido (pide confirmación) y se abre la planilla.',
    },
  ],
};

const STATS: TourDefinition = {
  id: 'stats',
  title: 'Planilla',
  steps: [
    {
      target: 'stats-score',
      title: 'Resultado',
      body: 'Marcador final o actual y estado del partido.',
    },
    {
      target: 'stats-partials',
      title: 'Parciales por período',
      body: 'Puntos de cada equipo en cada cuarto y suplementario.',
    },
    {
      target: 'stats-boxscore',
      title: 'Box score',
      body: 'Estadísticas FIBA por jugador y del equipo. El +/- se mide desde el quinteto inicial.',
    },
    {
      target: 'stats-filters',
      title: 'Filtros del mapa de tiros',
      body: 'Filtra los tiros por período y por jugador y mira la efectividad en dobles, triples y total.',
      example: 'Ejemplo: elige "7 Campagna" y "Q4" para ver sus tiros del último cuarto.',
    },
    {
      target: 'stats-chart',
      title: 'Mapa de tiros',
      body: 'Cada punto es un tiro de campo: convertidos y fallados en la media cancha.',
    },
  ],
};

const HELP: TourDefinition = {
  id: 'help',
  title: 'Ayuda',
  steps: [
    {
      target: 'help-tour-button',
      title: 'Ver tutorial',
      body: 'Repite la bienvenida o el recorrido de cualquier pantalla, o reinícialos todos.',
      example: 'Ejemplo: elige "Consola en vivo" para repasar cómo registrar jugadas.',
    },
    {
      target: 'help-toc',
      title: 'Índice',
      body: 'Salta a cualquier sección del manual.',
    },
    {
      target: 'help-content',
      title: 'Manual del sistema',
      body: 'Roles, pantallas, reglas FIBA aplicadas y funcionamiento sin conexión.',
    },
  ],
};

export const TOURS: TourDefinition[] = [WELCOME, DASHBOARD, DIVISIONS, PLAYERS, MATCHES, LINEUP, LIVE, STATS, HELP];

const TOURS_BY_ID = new Map(TOURS.map((tour) => [tour.id, tour]));

export const getTour = (id: TourId): TourDefinition => {
  const tour = TOURS_BY_ID.get(id);
  if (!tour) throw new Error(`Unknown tour: ${id}`);
  return tour;
};
