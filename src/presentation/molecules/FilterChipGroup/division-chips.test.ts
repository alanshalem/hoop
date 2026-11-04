import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ALL, NO_DIVISION, buildDivisionChips } from './division-chips';

const DIVISIONS = [
  { id: 'd-primera', name: 'Primera' },
  { id: 'd-u17', name: 'U17' },
];

const COUNTS: Record<string, number> = { [ALL]: 9, 'd-primera': 5, 'd-u17': 3, [NO_DIVISION]: 1 };
const countOf = (value: string) => COUNTS[value] ?? 0;

describe('buildDivisionChips', () => {
  it('starts with "Todas", then one chip per division in order, each with its count', () => {
    assert.deepStrictEqual(buildDivisionChips(DIVISIONS, countOf, null), [
      { value: ALL, label: 'Todas', count: 9 },
      { value: 'd-primera', label: 'Primera', count: 5 },
      { value: 'd-u17', label: 'U17', count: 3 },
    ]);
  });

  it('ends with the orphan chip under the given label when there are orphans', () => {
    const chips = buildDivisionChips(DIVISIONS, countOf, 'División eliminada');
    assert.deepStrictEqual(chips.at(-1), { value: NO_DIVISION, label: 'División eliminada', count: 1 });
    assert.strictEqual(chips.length, 4);
  });

  it('offers only "Todas" when there are no divisions and no orphans', () => {
    assert.deepStrictEqual(buildDivisionChips([], () => 0, null), [{ value: ALL, label: 'Todas', count: 0 }]);
  });
});
