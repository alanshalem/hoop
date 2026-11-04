import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { useClubStore } from './useClubStore';
import { makeClubData, makeCoach, makeRivalTeam, makeTeam } from '@/core/testing/fixtures';

const store = () => useClubStore.getState();

describe('club store collection actions', () => {
  beforeEach(() => {
    useClubStore.setState(
      makeClubData({
        teams: [makeTeam({ headCoachId: 'coach-test' })],
        coaches: [makeCoach()],
        rivalTeams: [makeRivalTeam()],
      })
    );
  });

  it('stores the collection a successful use-case returns', () => {
    assert.deepStrictEqual(store().renameRivalTeam('rival-test', 'Obras'), { ok: true });
    assert.strictEqual(store().rivalTeams[0].name, 'Obras');
  });

  it('stores every collection a use-case changes', () => {
    assert.deepStrictEqual(store().deleteCoach('coach-test'), { ok: true });
    assert.deepStrictEqual(store().coaches, []);
    assert.strictEqual(store().teams[0].headCoachId, undefined);
  });

  it('returns the refusal and leaves the state untouched', () => {
    const before = store();
    assert.deepStrictEqual(store().renameRivalTeam('missing', 'Obras'), { ok: false, reason: 'RIVAL_TEAM_NOT_FOUND' });
    assert.deepStrictEqual(store().assignHeadCoach('team-own', 'missing'), { ok: false, reason: 'COACH_NOT_FOUND' });
    assert.strictEqual(store().rivalTeams, before.rivalTeams);
    assert.strictEqual(store().teams, before.teams);
  });
});
