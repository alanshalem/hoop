import 'server-only';
import { buildActaImport, parseActaCsv, parseActaReportText, type ActaReport } from '../import/acta-parser';

/**
 * Match report fixtures shared by the import tests: three matches of a
 * fictional own team against two fictional rivals. Fictional only: no name,
 * license or venue here comes from a real match report (L6).
 */

export const HEADER =
  'Partido_ID;Jornada;Fecha;Hora;Local;Pts_Local;Visitante;Pts_Visitante;Estadio;Competencia;Categoria;Fase;Grupo;Equipo;Es_rival;Lic;Jugador;Numero;Capitan;Jugo;Entrenador;Ayudante;Delegado;Delegado_de_campo';

export const OWN = 'LOS ROBLES BC';
const COMPETITION = 'LIGA DE PRUEBA 2030 (Fixture)';
const CATEGORY = 'TORNEO FICTICIO MASCULINO (Primera)';
const OWN_STAFF = 'DOCENTE, A.B. (501);AUXILIAR, C. (502)';

export interface Fixture {
  id: string;
  round: number;
  date: string;
  time: string;
  home: string;
  homePoints: number;
  away: string;
  awayPoints: number;
  venue: string;
}

const M1: Fixture = {
  id: '900001',
  round: 1,
  date: '05/03/2030',
  time: '20:45',
  home: OWN,
  homePoints: 60,
  away: 'Atlético Ficticio',
  awayPoints: 55,
  venue: 'Estadio Ficticio',
};
const M2: Fixture = {
  id: '900002',
  round: 2,
  date: '12/03/2030',
  time: '21:00',
  home: 'Club Prueba',
  homePoints: 70,
  away: OWN,
  awayPoints: 68,
  venue: '"Gimnasio ""El Inventado"""',
};
const M3: Fixture = {
  id: '900003',
  round: 3,
  date: '19/03/2030',
  time: '19:30',
  home: OWN,
  homePoints: 50,
  away: 'Atlético Ficticio',
  awayPoints: 52,
  venue: 'Estadio Ficticio',
};

export function row(m: Fixture, team: string, rival: boolean, lic: string, name: string, dorsal: number, staff = OWN_STAFF) {
  const head = `${m.id};${m.round};${m.date};${m.time};${m.home};${m.homePoints};${m.away};${m.awayPoints};${m.venue};${COMPETITION};${CATEGORY};FASE UNO;GRUPO X`;
  return `${head};${team};${rival ? 'Si' : 'No'};${lic};${name};${dorsal};;Si;${staff};;SUPERVISOR, Z. (999)`;
}

const RIVAL_A_STAFF = 'AJENO, D. (601);';
const RIVAL_B_STAFF = 'EXTRANO, E. (701);OTRO, F. (702)';

export const CSV_ROWS = [
  // Match 1: own team at home.
  row(M1, OWN, false, '101', 'ALFA, J.', 4),
  row(M1, OWN, false, '102', 'BETA, L.M.', 5),
  row(M1, OWN, false, '103', 'GAMMA, P.', 7),
  row(M1, 'Atlético Ficticio', true, '201', 'RIVAL, U.', 10, RIVAL_A_STAFF),
  row(M1, 'Atlético Ficticio', true, '202', 'CONTRA, V.', 11, RIVAL_A_STAFF),
  // Match 2: own team away; 101 changes number once, 104 debuts with a tie (4 / 7).
  row(M2, 'Club Prueba', true, '301', 'LEJANO, W.', 8, RIVAL_B_STAFF),
  row(M2, 'Club Prueba', true, '302', 'CERCANO, X.', 9, RIVAL_B_STAFF),
  row(M2, OWN, false, '101', 'ALFA, J.', 2),
  row(M2, OWN, false, '102', 'BETA, L.M.', 5),
  row(M2, OWN, false, '104', 'DELTA, R.', 4),
  // Match 3: rival 203 wears #10 (held by 201 in two reports) and 202 switches to #12.
  row(M3, OWN, false, '101', 'ALFA, J.', 4),
  row(M3, OWN, false, '103', 'GAMMA, P.', 7),
  row(M3, OWN, false, '104', 'DELTA, R.', 7),
  row(M3, 'Atlético Ficticio', true, '201', 'RIVAL, U.', 10, RIVAL_A_STAFF),
  row(M3, 'Atlético Ficticio', true, '202', 'CONTRA, V.', 12, RIVAL_A_STAFF),
  // The CSV lost the initials; the report lists them ("203 NUEVO,Y.").
  row(M3, 'Atlético Ficticio', true, '203', 'NUEVO,', 10, RIVAL_A_STAFF),
];

/** Player lines of the report as printed: license, then "SURNAME,INITIALS" (captain marked). */
export const DEFAULT_REPORT_PLAYERS = [
  '101 ALFA, J.                         14 27              6 15 79',
  '203 NUEVO,Y. (CAP)                   10 X 2',
];

export const CSV_TEXT = `\uFEFF${HEADER}\r\n${CSV_ROWS.join('\r\n')}\r\n`;

/** `pdftotext -layout` shape: the period labels drift away from their A/B pairs. */
export function reportText(
  id: string,
  teamA: string,
  teamB: string,
  pairs: [string, string][],
  final: [number, number],
  players: readonly string[] = DEFAULT_REPORT_PLAYERS
): string {
  const [p1, p2, p3, p4, p5 = ['--', '--']] = pairs;
  return [
    'CONFEDERACION FICTICIA DE BASQUETBOL',
    '',
    `Equipo A: ${teamA}                                                   Equipo B: ${teamB}`,
    '',
    `Partido n\u00ba: ${id} Localidad: Estadio Ficticio`,
    '',
    `Equipo A: ${teamA}                                       TANTEO ARRASTRADO`,
    '',
    'Lic.               Jugadores                    No. Ent. 1 2 3 4 5',
    ...players,
    '                                                7 X 12',
    `Anotador: ----------------                         Tanteos: Cuarto 1                 A: ${p1[0]}                 B: ${p1[1]}`,
    `Ayudante Anotador: ----------------                                         A: ${p2[0]}                 B: ${p2[1]}`,
    `Cronometrador: ----------------                          Cuarto 2           A: ${p3[0]}                  B: ${p3[1]}`,
    `Operador 24": ----------------                           Cuarto 3           A: ${p4[0]}                 B: ${p4[1]}`,
    `                                                         Cuarto 4           A: ${p5[0]}                 B: ${p5[1]}`,
    '                                                         Pr\u00f3rroga',
    '',
    `Arb. auxiliar 1:                 Arb. auxiliar 2: -------          Tanteo final:                   Equipo A: ${final[0]}                  Equipo B: ${final[1]}`,
    '',
    `Equipo vencedor: ${final[0] > final[1] ? teamA : teamB}`,
  ].join('\n');
}

export const REPORT_M1 = reportText('900001', `CLUB ${OWN}`, 'ASOCIACION ATLETICO FICTICIO', [['20', '15'], ['18', '10'], ['10', '12'], ['12', '18']], [60, 55]);
// Own team is Equipo B (away); the match goes to overtime.
export const REPORT_M2 = reportText(
  '900002',
  'CLUB SOCIAL PRUEBA',
  `CLUB ${OWN}`,
  [['15', '15'], ['20', '18'], ['13', '12'], ['10', '13'], ['12', '10']],
  [70, 68]
);
export const REPORT_M3 = reportText('900003', `CLUB ${OWN}`, 'ASOCIACION ATLETICO FICTICIO', [['10', '12'], ['15', '15'], ['10', '10'], ['15', '15']], [50, 52]);

export const reports = (): ActaReport[] => [REPORT_M1, REPORT_M2, REPORT_M3].map(parseActaReportText);
export const OPTIONS = { clubId: 'club-test', season: '2030' };

/** The import of the three fixture matches. */
export function buildFixture() {
  return buildActaImport(parseActaCsv(CSV_TEXT), reports(), OPTIONS);
}
