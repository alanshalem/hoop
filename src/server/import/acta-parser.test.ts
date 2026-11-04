import { describe, it } from 'node:test';
import assert from 'node:assert';
import { findRivalTeam } from '@/core/domain/rules/rival-teams';
import { RECORD_DATA_SCHEMAS } from '../sync/records';
import {
  ActaImportError,
  buildActaImport,
  formatActaImportSummary,
  parseActaCsv,
  parseActaReportText,
} from './acta-parser';
import {
  buildFixture,
  CSV_ROWS,
  CSV_TEXT,
  HEADER,
  OPTIONS,
  OWN,
  REPORT_M1,
  REPORT_M2,
  REPORT_M3,
  reportText,
  reports,
} from '../testing/acta-fixtures';

function problemsOf(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof ActaImportError, `expected ActaImportError, got ${String(error)}`);
    return error.problems;
  }
  assert.fail('expected the import to fail');
}

describe('parseActaCsv', () => {
  it('reads semicolon rows with a BOM, CRLF and quoted fields', () => {
    const rows = parseActaCsv(CSV_TEXT);
    assert.strictEqual(rows.length, CSV_ROWS.length);
    assert.deepStrictEqual(
      { matchId: rows[0].matchId, team: rows[0].team, license: rows[0].license, player: rows[0].player, number: rows[0].number },
      { matchId: '900001', team: OWN, license: '101', player: 'ALFA, J.', number: '4' }
    );
    const quoted = rows.find((r) => r.matchId === '900002');
    assert.strictEqual(quoted?.venue, 'Gimnasio "El Inventado"');
    assert.strictEqual(quoted?.headCoach, 'EXTRANO, E. (701)');
    assert.strictEqual(rows[0].line, 2, 'line numbers count the header');
  });

  it('fails when a required column is missing', () => {
    const problems = problemsOf(() => parseActaCsv('Partido_ID;Jornada\n1;2\n'));
    assert.match(problems[0], /missing column/i);
    assert.match(problems[0], /Fecha/);
  });

  it('fails on a row with a different number of fields', () => {
    const problems = problemsOf(() => parseActaCsv(`${HEADER}\n${CSV_ROWS[0]};extra\n`));
    assert.match(problems[0], /line 2/);
  });
});

describe('parseActaReportText', () => {
  it('takes the score pairs in reading order as Q1-Q4, then played overtimes, and the final score', () => {
    assert.deepStrictEqual(parseActaReportText(REPORT_M1), {
      matchId: '900001',
      teamA: `CLUB ${OWN}`,
      teamB: 'ASOCIACION ATLETICO FICTICIO',
      finalA: 60,
      finalB: 55,
      players: [
        { license: '101', name: 'ALFA, J.' },
        { license: '203', name: 'NUEVO,Y.' },
      ],
      periods: [
        { a: 20, b: 15 },
        { a: 18, b: 10 },
        { a: 10, b: 12 },
        { a: 12, b: 18 },
      ],
    });
    assert.deepStrictEqual(parseActaReportText(REPORT_M2).periods.at(-1), { a: 12, b: 10 });
    assert.strictEqual(parseActaReportText(REPORT_M2).periods.length, 5);
  });

  it('reads team names that leave a single space before Equipo B (long names)', () => {
    const longNames = REPORT_M1.replace(
      /^Equipo A: .*Equipo B: .*$/m,
      'Equipo A: CLUB DEPORTIVO DE NOMBRE MUY LARGO FICTICIO Equipo B: CLUB LOS ROBLES BC'
    );
    const report = parseActaReportText(longNames);
    assert.strictEqual(report.teamA, 'CLUB DEPORTIVO DE NOMBRE MUY LARGO FICTICIO');
    assert.strictEqual(report.teamB, 'CLUB LOS ROBLES BC');
  });

  it('fails without four played quarters or a final score', () => {
    const missingQuarter = reportText('900009', 'A', 'B', [['1', '1'], ['1', '1'], ['--', '--'], ['1', '1']], [3, 3]);
    assert.match(problemsOf(() => parseActaReportText(missingQuarter))[0], /quarter/i);
    const noFinal = REPORT_M1.replace(/Tanteo final:.*$/m, '');
    assert.match(problemsOf(() => parseActaReportText(noFinal)).join('\n'), /final/i);
  });
});

describe('buildActaImport', () => {
  it('creates the division from the CSV category and the own team of the club', () => {
    const data = buildFixture();
    assert.deepStrictEqual(data.division, {
      id: 'acta-div-primera',
      name: 'Primera',
      category: 'PRIMERA',
      gender: 'MALE',
      clubId: 'club-test',
      description: 'TORNEO FICTICIO MASCULINO',
    });
    assert.strictEqual(data.team.name, OWN);
    assert.strictEqual(data.team.divisionId, data.division.id);
    assert.strictEqual(data.team.season, '2030');
    assert.strictEqual(data.team.clubId, 'club-test');
    assert.deepStrictEqual(data.team.playerIds, data.players.map((p) => p.id));
  });

  it('dedupes own players by license with the report name, license and most frequent number', () => {
    const data = buildFixture();
    const byLicense = new Map(data.players.map((p) => [p.license, p]));
    assert.deepStrictEqual([...byLicense.keys()].sort(), ['101', '102', '103', '104']);
    const alfa = byLicense.get('101');
    assert.deepStrictEqual(
      alfa && { firstName: alfa.firstName, lastName: alfa.lastName, dorsal: alfa.dorsal, teamId: alfa.teamId },
      { firstName: 'J.', lastName: 'ALFA', dorsal: 4, teamId: data.team.id }
    );
    assert.strictEqual(alfa?.heightCm, undefined);
    assert.strictEqual(alfa?.position, undefined);
    assert.strictEqual(byLicense.get('104')?.dorsal, 4, 'a tie between numbers keeps the lowest');
  });

  it('reports own players that share a dorsal and keeps their numbers', () => {
    const { report } = buildFixture();
    assert.deepStrictEqual(report.sharedDorsals, [{ teamName: OWN, dorsal: 4, players: ['101 ALFA, J.', '104 DELTA, R.'] }]);
    assert.deepStrictEqual(
      report.numberVariants.filter((v) => v.teamName === OWN),
      [
        { teamName: OWN, player: '101 ALFA, J.', numbers: [4, 2] },
        { teamName: OWN, player: '104 DELTA, R.', numbers: [4, 7] },
      ]
    );
  });

  it('assigns the own coaches from the reports to the team', () => {
    const data = buildFixture();
    assert.deepStrictEqual(
      data.coaches.map(({ name, license, role, clubId }) => ({ name, license, role, clubId })),
      [
        { name: 'DOCENTE, A.B.', license: '501', role: 'HEAD', clubId: 'club-test' },
        { name: 'AUXILIAR, C.', license: '502', role: 'ASSISTANT', clubId: 'club-test' },
      ]
    );
    assert.strictEqual(data.team.headCoachId, data.coaches[0].id);
    assert.deepStrictEqual(data.team.assistantCoachIds, [data.coaches[1].id]);
  });

  it('creates one rival team per opponent with unique dorsals, resolving collisions deterministically', () => {
    const data = buildFixture();
    assert.deepStrictEqual(data.rivalTeams.map((t) => t.name), ['Atlético Ficticio', 'Club Prueba']);
    const ficticio = data.rivalTeams[0];
    assert.strictEqual(ficticio.divisionId, data.division.id);
    assert.deepStrictEqual(
      ficticio.players.map(({ dorsal, firstName, lastName }) => [dorsal, lastName, firstName]),
      [
        [10, 'RIVAL', 'U.'],
        [11, 'CONTRA', 'V.'],
        [0, 'NUEVO', 'Y.'],
      ]
    );
    assert.deepStrictEqual(data.report.reassignedDorsals, [
      { teamName: 'Atlético Ficticio', player: '203 NUEVO, Y.', wanted: 10, assigned: 0, heldBy: '201 RIVAL, U.' },
    ]);
    assert.ok(
      data.report.numberVariants.some((v) => v.teamName === 'Atlético Ficticio' && v.player === '202 CONTRA, V.'),
      'a rival who changed number is listed'
    );
    // Same input, same ids and numbers.
    assert.deepStrictEqual(buildFixture().rivalTeams, data.rivalTeams);
  });

  it('creates finished matches with the report data, roster and official result, without events', () => {
    const data = buildFixture();
    assert.deepStrictEqual(data.matches.map((m) => m.id), ['acta-match-900001', 'acta-match-900002', 'acta-match-900003']);
    const [home, away] = data.matches;
    assert.deepStrictEqual(
      {
        date: home.date,
        condition: home.condition,
        venue: home.venue,
        tournament: home.tournament,
        rivalTeamName: home.rivalTeamName,
        ownTeamName: home.ownTeamName,
        ownTeamId: home.ownTeamId,
        divisionId: home.divisionId,
        status: home.status,
        events: home.events,
        homeScore: home.homeScore,
        awayScore: home.awayScore,
      },
      {
        date: '2030-03-05T23:45:00.000Z',
        condition: 'HOME',
        venue: 'Estadio Ficticio',
        tournament: 'Liga De Prueba 2030 (Fixture) - Fecha 1',
        rivalTeamName: 'Atlético Ficticio',
        ownTeamName: OWN,
        ownTeamId: data.team.id,
        divisionId: data.division.id,
        status: 'FINISHED',
        events: [],
        homeScore: 60,
        awayScore: 55,
      }
    );
    assert.deepStrictEqual(home.officialResult, {
      home: 60,
      away: 55,
      quarters: [
        { home: 20, away: 15 },
        { home: 18, away: 10 },
        { home: 10, away: 12 },
        { home: 12, away: 18 },
      ],
    });
    const playerId = (license: string) => data.players.find((p) => p.license === license)?.id;
    assert.deepStrictEqual(home.rosterOwnPlayerIds, [playerId('101'), playerId('102'), playerId('103')]);

    // Away match: Equipo A (the home side) is the rival; the overtime is the fifth period.
    assert.strictEqual(away.condition, 'AWAY');
    assert.strictEqual(away.venue, 'Gimnasio "El Inventado"');
    assert.strictEqual(away.date, '2030-03-13T00:00:00.000Z');
    assert.strictEqual(away.currentQuarter, 'OT1');
    assert.deepStrictEqual(away.officialResult, {
      home: 70,
      away: 68,
      quarters: [
        { home: 15, away: 15 },
        { home: 20, away: 18 },
        { home: 13, away: 12 },
        { home: 10, away: 13 },
        { home: 12, away: 10 },
      ],
    });
    assert.deepStrictEqual(away.rosterOwnPlayerIds, [playerId('101'), playerId('102'), playerId('104')]);
  });

  it('produces records valid for their sync schemas, whose matches resolve their rival roster', () => {
    const data = buildFixture();
    const check = (kind: keyof typeof RECORD_DATA_SCHEMAS, entity: unknown) =>
      assert.ok(RECORD_DATA_SCHEMAS[kind].safeParse(entity).success, `${kind} is valid`);
    check('division', data.division);
    check('team', data.team);
    data.players.forEach((p) => check('player', p));
    data.coaches.forEach((c) => check('coach', c));
    data.rivalTeams.forEach((t) => check('rivalTeam', t));
    data.matches.forEach((m) => check('match', m));
    for (const match of data.matches) {
      assert.ok(findRivalTeam(data.rivalTeams, match.divisionId, match.rivalTeamName), match.id);
    }
  });

  it('completes initials missing in the CSV from the player list of the same report', () => {
    const data = buildFixture();
    const nuevo = data.rivalTeams[0].players.find((p) => p.lastName === 'NUEVO');
    assert.deepStrictEqual(nuevo && [nuevo.lastName, nuevo.firstName], ['NUEVO', 'Y.']);
    assert.deepStrictEqual(data.report.completedNames, [
      { teamName: 'Atlético Ficticio', matchId: '900003', player: '203 NUEVO,', completed: 'NUEVO, Y.' },
    ]);
  });

  it('fails on a name without initials that the report does not list either', () => {
    const withoutList = reportText('900003', `CLUB ${OWN}`, 'ASOCIACION ATLETICO FICTICIO', [['10', '12'], ['15', '15'], ['10', '10'], ['15', '15']], [50, 52], ['101 ALFA, J.         4']);
    const problems = problemsOf(() =>
      buildActaImport(parseActaCsv(CSV_TEXT), [REPORT_M1, REPORT_M2, withoutList].map(parseActaReportText), OPTIONS)
    );
    assert.deepStrictEqual(problems, ['CSV line 17: player "NUEVO," is not "SURNAME, INITIALS"']);
  });

  it('fails loudly when the quarters do not add up to the final score', () => {
    const wrong = reportText('900003', `CLUB ${OWN}`, 'ASOCIACION ATLETICO FICTICIO', [['10', '12'], ['15', '15'], ['10', '10'], ['14', '15']], [50, 52]);
    const problems = problemsOf(() =>
      buildActaImport(parseActaCsv(CSV_TEXT), [REPORT_M1, REPORT_M2, wrong].map(parseActaReportText), OPTIONS)
    );
    assert.deepStrictEqual(problems, ['Match 900003: quarters of Equipo A add up to 49, the final score is 50']);
  });

  it('fails when a report final does not match the CSV score or a match has no report', () => {
    const swapped = reportText('900001', `CLUB ${OWN}`, 'ASOCIACION ATLETICO FICTICIO', [['20', '15'], ['18', '10'], ['10', '12'], ['12', '19']], [60, 56]);
    const problems = problemsOf(() =>
      buildActaImport(parseActaCsv(CSV_TEXT), [swapped, REPORT_M2].map(parseActaReportText), OPTIONS)
    );
    assert.deepStrictEqual(problems, [
      'Match 900001: the report final (60-56) does not match the CSV score (60-55)',
      'CSV line 17: player "NUEVO," is not "SURNAME, INITIALS"',
      'Match 900003: no match report',
    ]);
  });

  it('fails when a report does not name the own team on either side', () => {
    const stranger = reportText('900001', 'CLUB DESCONOCIDO', 'ASOCIACION ATLETICO FICTICIO', [['20', '15'], ['18', '10'], ['10', '12'], ['12', '18']], [60, 55]);
    const problems = problemsOf(() =>
      buildActaImport(parseActaCsv(CSV_TEXT), [stranger, REPORT_M2, REPORT_M3].map(parseActaReportText), OPTIONS)
    );
    assert.deepStrictEqual(problems, [`Match 900001: the report names "${OWN}" on neither Equipo A nor Equipo B`]);
  });

  it('fails on a report without a CSV match', () => {
    const extra = reportText('900099', `CLUB ${OWN}`, 'X', [['1', '0'], ['0', '0'], ['0', '0'], ['0', '0']], [1, 0]);
    const problems = problemsOf(() =>
      buildActaImport(parseActaCsv(CSV_TEXT), [...reports(), parseActaReportText(extra)], OPTIONS)
    );
    assert.deepStrictEqual(problems, ['Match 900099: report without CSV rows']);
  });
});

describe('formatActaImportSummary', () => {
  it('lists counts per kind, each match with its final and quarters, and the dorsal reports', () => {
    const text = formatActaImportSummary(buildFixture());
    assert.match(text, /divisions: 1/);
    assert.match(text, /teams: 1/);
    assert.match(text, /players: 4/);
    assert.match(text, /coaches: 2/);
    assert.match(text, /rival teams: 2 \(rival players: 5\)/);
    assert.match(text, /matches: 3/);
    assert.match(text, /900001 Fecha 1 2030-03-05 20:45 LOS ROBLES BC 60 - 55 Atlético Ficticio \| 20-15 18-10 10-12 12-18 \| quarters OK/);
    assert.match(text, /900002 Fecha 2 .* 15-15 20-18 13-12 10-13 OT 12-10 \| quarters OK/);
    assert.match(text, /Shared own dorsals \(kept\):\n {2}LOS ROBLES BC #4: 101 ALFA, J\., 104 DELTA, R\./);
    assert.match(text, /Reassigned rival dorsals:\n {2}Atlético Ficticio: 203 NUEVO, Y\. wanted #10 \(held by 201 RIVAL, U\.\), got #0/);
    assert.match(text, /Names completed from the reports:\n {2}Atlético Ficticio: 203 NUEVO, -> NUEVO, Y\. \(match 900003\)/);
  });
});

describe('parseActaReportText label offset (S2, S3)', () => {
  it('reads quarter pairs in reading order when pdftotext offsets the Cuarto labels', () => {
    const text = [
      'Equipo A: CLUB ALFA                Equipo B: CLUB ATLETICO MONTE GRANDE LM',
      'Partido nº: 900001 Localidad: Estadio Ficticio',
      'Anotador: X          Tanteos: Cuarto 1      A: 22     B: 12',
      'Ayudante Anotador: Y                        A: 14     B: 15',
      'Cronometrador: Z     Cuarto 2               A: 7      B: 31',
      'Operador 24": W      Cuarto 3               A: 19     B: 13',
      '                     Cuarto 4               A: --     B: --',
      'Arb. auxiliar 1:   Tanteo final:   Equipo A: 62     Equipo B: 71',
    ].join('\n');
    const report = parseActaReportText(text);
    assert.deepStrictEqual(report.periods, [{ a: 22, b: 12 }, { a: 14, b: 15 }, { a: 7, b: 31 }, { a: 19, b: 13 }]);
    assert.deepStrictEqual([report.finalA, report.finalB], [62, 71]);
  });
});
