import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeEvent, makeMatch } from '@/core/testing/fixtures';
import { hasAnyPlays, hasOnlyOfficialResult, OFFICIAL_RESULT_LABEL } from './match-display';

const officialResult = {
  home: 58,
  away: 90,
  quarters: [
    { home: 11, away: 19 },
    { home: 23, away: 28 },
    { home: 9, away: 18 },
    { home: 15, away: 25 },
  ],
};

describe('official result display (S3)', () => {
  it('flags a match whose score comes only from the official report', () => {
    assert.strictEqual(hasOnlyOfficialResult(makeMatch({ status: 'FINISHED', officialResult })), true);
  });

  it('still flags it when the match only has plays without points', () => {
    const events = [makeEvent({ type: 'FOUL_PERSONAL' }), makeEvent({ type: 'FG2_MISS' })];
    assert.strictEqual(hasOnlyOfficialResult(makeMatch({ status: 'FINISHED', officialResult, events })), true);
  });

  it('does not flag a match with scoring plays, even with an official result', () => {
    const events = [makeEvent({ type: 'FG3_MADE' })];
    assert.strictEqual(hasOnlyOfficialResult(makeMatch({ status: 'FINISHED', officialResult, events })), false);
  });

  it('does not flag a match without an official result', () => {
    assert.strictEqual(hasOnlyOfficialResult(makeMatch({ status: 'FINISHED' })), false);
  });

  it('labels the badge as the official report result', () => {
    assert.strictEqual(OFFICIAL_RESULT_LABEL, 'Resultado oficial (acta)');
  });
});

describe('season stats availability (S3)', () => {
  it('needs at least one match with recorded plays', () => {
    const official = makeMatch({ id: 'm-official', status: 'FINISHED', officialResult });
    const charted = makeMatch({ id: 'm-charted', status: 'FINISHED', events: [makeEvent({ type: 'DREB' })] });
    assert.strictEqual(hasAnyPlays([]), false);
    assert.strictEqual(hasAnyPlays([official]), false);
    assert.strictEqual(hasAnyPlays([official, charted]), true);
  });
});
