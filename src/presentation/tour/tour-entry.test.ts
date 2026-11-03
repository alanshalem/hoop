import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeMatch } from '@/core/testing/fixtures';
import { tourEntry } from './tour-entry';

const scheduledLater = makeMatch({ id: 'm-later', status: 'SCHEDULED', date: '2026-11-20T20:00:00.000Z' });
const scheduledSoon = makeMatch({ id: 'm-soon', status: 'SCHEDULED', date: '2026-11-05T20:00:00.000Z' });
const live = makeMatch({ id: 'm-live', status: 'LIVE' });
const halftime = makeMatch({ id: 'm-half', status: 'HALFTIME' });
const finishedOld = makeMatch({ id: 'm-old', status: 'FINISHED', date: '2026-09-01T20:00:00.000Z' });
const finishedRecent = makeMatch({ id: 'm-recent', status: 'FINISHED', date: '2026-10-20T20:00:00.000Z' });

describe('tourEntry', () => {
  it('maps the fixed screens to their routes', () => {
    assert.deepStrictEqual(tourEntry('welcome', []), { href: '/' });
    assert.deepStrictEqual(tourEntry('dashboard', []), { href: '/' });
    assert.deepStrictEqual(tourEntry('divisions', []), { href: '/divisions' });
    assert.deepStrictEqual(tourEntry('players', []), { href: '/players' });
    assert.deepStrictEqual(tourEntry('matches', []), { href: '/matches' });
    assert.deepStrictEqual(tourEntry('planilla', []), { href: '/planilla' });
    assert.deepStrictEqual(tourEntry('help', []), { href: '/ayuda' });
  });

  it('opens the lineup of the next scheduled match, else of a match in play', () => {
    assert.deepStrictEqual(tourEntry('lineup', [scheduledLater, live, scheduledSoon]), { href: '/matches/m-soon/lineup' });
    assert.deepStrictEqual(tourEntry('lineup', [finishedOld, live]), { href: '/matches/m-live/lineup' });
  });

  it('opens the live console of the match in play, halftime included', () => {
    assert.deepStrictEqual(tourEntry('live', [scheduledSoon, halftime]), { href: '/matches/m-half/live' });
  });

  it('opens the sheet of the most recent finished match, else of a match in play', () => {
    assert.deepStrictEqual(tourEntry('stats', [finishedOld, finishedRecent, live]), { href: '/matches/m-recent/stats' });
    assert.deepStrictEqual(tourEntry('stats', [scheduledSoon, live]), { href: '/matches/m-live/stats' });
  });

  it('explains why a match screen tour cannot open', () => {
    assert.deepStrictEqual(tourEntry('lineup', [finishedOld]), {
      unavailable: 'Necesita un partido programado o en juego.',
    });
    assert.deepStrictEqual(tourEntry('live', [scheduledSoon, finishedOld]), {
      unavailable: 'Necesita un partido en juego.',
    });
    assert.deepStrictEqual(tourEntry('stats', [scheduledSoon]), {
      unavailable: 'Necesita un partido en juego o finalizado.',
    });
  });
});
