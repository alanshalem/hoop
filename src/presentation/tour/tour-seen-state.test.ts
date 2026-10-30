import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  EMPTY_TOUR_SEEN_STATE,
  markTourSeen,
  pickTourToStart,
  resetUserTours,
  tourStatus,
  type TourSeenState,
} from './tour-seen-state';

describe('tour seen state (per user)', () => {
  it('starts pending for every user and tour', () => {
    assert.strictEqual(tourStatus(EMPTY_TOUR_SEEN_STATE, 'user-1', 'welcome'), 'pending');
  });

  it('records completed and skipped tours per user without touching other users', () => {
    let state: TourSeenState = markTourSeen(EMPTY_TOUR_SEEN_STATE, 'user-1', 'welcome', 'completed');
    state = markTourSeen(state, 'user-1', 'dashboard', 'skipped');
    assert.strictEqual(tourStatus(state, 'user-1', 'welcome'), 'completed');
    assert.strictEqual(tourStatus(state, 'user-1', 'dashboard'), 'skipped');
    assert.strictEqual(tourStatus(state, 'user-2', 'welcome'), 'pending');
  });

  it('keeps one entry per tour: the latest outcome wins', () => {
    let state = markTourSeen(EMPTY_TOUR_SEEN_STATE, 'user-1', 'live', 'skipped');
    state = markTourSeen(state, 'user-1', 'live', 'completed');
    state = markTourSeen(state, 'user-1', 'live', 'completed');
    assert.deepStrictEqual(state['user-1'], { completed: ['live'], skipped: [] });
  });

  it('does not mutate the previous state', () => {
    const before = markTourSeen(EMPTY_TOUR_SEEN_STATE, 'user-1', 'welcome', 'completed');
    const snapshot = structuredClone(before);
    markTourSeen(before, 'user-1', 'players', 'skipped');
    assert.deepStrictEqual(before, snapshot);
    assert.deepStrictEqual(EMPTY_TOUR_SEEN_STATE, {});
  });

  it('resets only the given user', () => {
    let state = markTourSeen(EMPTY_TOUR_SEEN_STATE, 'user-1', 'welcome', 'completed');
    state = markTourSeen(state, 'user-2', 'welcome', 'skipped');
    state = resetUserTours(state, 'user-1');
    assert.strictEqual(tourStatus(state, 'user-1', 'welcome'), 'pending');
    assert.strictEqual(tourStatus(state, 'user-2', 'welcome'), 'skipped');
  });
});

describe('pickTourToStart', () => {
  const seenNothing = () => false;
  const screen = (tourId: string, blocked = false) => ({ tourId, blocked });

  it('starts the welcome tour first on any registered screen', () => {
    assert.deepStrictEqual(
      pickTourToStart({ activeTourId: null, pendingTourId: null, screen: screen('players'), isSeen: seenNothing }),
      { tourId: 'welcome', explicit: false }
    );
  });

  it('starts the screen tour once the welcome tour was seen', () => {
    assert.deepStrictEqual(
      pickTourToStart({
        activeTourId: null,
        pendingTourId: null,
        screen: screen('players'),
        isSeen: (id) => id === 'welcome',
      }),
      { tourId: 'players', explicit: false }
    );
  });

  it('starts nothing when both were seen, without a screen or while another tour runs', () => {
    assert.strictEqual(
      pickTourToStart({ activeTourId: null, pendingTourId: null, screen: screen('players'), isSeen: () => true }),
      null
    );
    assert.strictEqual(
      pickTourToStart({ activeTourId: null, pendingTourId: null, screen: null, isSeen: seenNothing }),
      null
    );
    assert.strictEqual(
      pickTourToStart({ activeTourId: 'welcome', pendingTourId: 'players', screen: screen('players'), isSeen: seenNothing }),
      null
    );
  });

  it('never auto-starts on a blocked screen (live console with the clock running)', () => {
    assert.strictEqual(
      pickTourToStart({ activeTourId: null, pendingTourId: null, screen: screen('live', true), isSeen: seenNothing }),
      null
    );
  });

  it('starts an explicit replay of the current screen even if seen or blocked', () => {
    assert.deepStrictEqual(
      pickTourToStart({ activeTourId: null, pendingTourId: 'live', screen: screen('live', true), isSeen: () => true }),
      { tourId: 'live', explicit: true }
    );
    assert.deepStrictEqual(
      pickTourToStart({ activeTourId: null, pendingTourId: 'welcome', screen: screen('help'), isSeen: () => true }),
      { tourId: 'welcome', explicit: true }
    );
  });

  it('waits for the requested screen before replaying its tour', () => {
    assert.strictEqual(
      pickTourToStart({ activeTourId: null, pendingTourId: 'stats', screen: screen('help'), isSeen: () => true }),
      null
    );
  });
});
