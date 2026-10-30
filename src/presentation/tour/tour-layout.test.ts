import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computeTourLayout, type TourLayoutInput } from './tour-layout';

const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };
const CARD = { width: 320, height: 180 };
const SPACING = { spotlightPadding: 8, gap: 16, margin: 12, arrowInset: 24 };

const layout = (input: Omit<TourLayoutInput, keyof typeof SPACING>) => computeTourLayout({ ...SPACING, ...input });

describe('computeTourLayout: centered cards', () => {
  it('centers the card without spotlight or arrow when the step has no target', () => {
    assert.deepStrictEqual(layout({ target: null, card: CARD, viewport: TABLET }), {
      spotlight: null,
      card: { x: 352, y: 294 },
      side: 'center',
      arrow: null,
    });
  });

  it('centers the card vertically on narrow screens too', () => {
    const result = layout({ target: null, card: { width: 366, height: 200 }, viewport: PHONE, docked: true });
    assert.deepStrictEqual(result.card, { x: 12, y: 322 });
    assert.strictEqual(result.side, 'center');
  });
});

describe('computeTourLayout: placement next to the target', () => {
  it('pads the spotlight and places the card below by default, arrow pointing up at the target center', () => {
    assert.deepStrictEqual(layout({ target: { x: 100, y: 100, width: 200, height: 40 }, card: CARD, viewport: TABLET }), {
      spotlight: { x: 92, y: 92, width: 216, height: 56 },
      card: { x: 40, y: 164 },
      side: 'bottom',
      arrow: { edge: 'top', offset: 160 },
    });
  });

  it('flips above the target when there is no room below', () => {
    const result = layout({ target: { x: 400, y: 650, width: 100, height: 40 }, card: CARD, viewport: TABLET });
    assert.strictEqual(result.side, 'top');
    assert.deepStrictEqual(result.card, { x: 290, y: 446 });
    assert.deepStrictEqual(result.arrow, { edge: 'bottom', offset: 160 });
  });

  it('honors a preferred side that has room', () => {
    const result = layout({
      target: { x: 100, y: 300, width: 200, height: 100 },
      card: CARD,
      viewport: TABLET,
      placement: 'right',
    });
    assert.strictEqual(result.side, 'right');
    assert.deepStrictEqual(result.card, { x: 324, y: 260 });
    assert.deepStrictEqual(result.arrow, { edge: 'left', offset: 90 });
  });

  it('falls back to the opposite side when the preferred one has no room', () => {
    const result = layout({
      target: { x: 100, y: 300, width: 200, height: 100 },
      card: CARD,
      viewport: TABLET,
      placement: 'left',
    });
    assert.strictEqual(result.side, 'right');
  });

  it('clamps the card and the spotlight inside the viewport and keeps the arrow off the corners', () => {
    const result = layout({ target: { x: 0, y: 100, width: 40, height: 40 }, card: CARD, viewport: TABLET });
    assert.deepStrictEqual(result.spotlight, { x: 0, y: 92, width: 48, height: 56 });
    assert.deepStrictEqual(result.card, { x: 12, y: 164 });
    assert.deepStrictEqual(result.arrow, { edge: 'top', offset: 24 });
  });

  it('centers the card without arrow when no side has room', () => {
    const result = layout({ target: { x: 0, y: 0, width: 1024, height: 768 }, card: CARD, viewport: TABLET });
    assert.deepStrictEqual(result.spotlight, { x: 0, y: 0, width: 1024, height: 768 });
    assert.deepStrictEqual(result.card, { x: 352, y: 294 });
    assert.strictEqual(result.side, 'center');
    assert.strictEqual(result.arrow, null);
  });
});

describe('computeTourLayout: docked card on narrow screens', () => {
  const DOCKED_CARD = { width: 366, height: 200 };

  it('docks to the bottom when the target is in the upper half', () => {
    assert.deepStrictEqual(
      layout({ target: { x: 20, y: 100, width: 100, height: 48 }, card: DOCKED_CARD, viewport: PHONE, docked: true }),
      {
        spotlight: { x: 12, y: 92, width: 116, height: 64 },
        card: { x: 12, y: 632 },
        side: 'bottom',
        arrow: { edge: 'top', offset: 58 },
      }
    );
  });

  it('docks to the top when the target is in the lower half (bottom bar)', () => {
    const result = layout({ target: { x: 150, y: 780, width: 90, height: 56 }, card: DOCKED_CARD, viewport: PHONE, docked: true });
    assert.deepStrictEqual(result.spotlight, { x: 142, y: 772, width: 106, height: 72 });
    assert.deepStrictEqual(result.card, { x: 12, y: 12 });
    assert.strictEqual(result.side, 'top');
    assert.deepStrictEqual(result.arrow, { edge: 'bottom', offset: 183 });
  });

  it('hides the arrow when the docked card covers the spotlight', () => {
    const result = layout({ target: { x: 0, y: 0, width: 390, height: 800 }, card: DOCKED_CARD, viewport: PHONE, docked: true });
    assert.strictEqual(result.arrow, null);
  });
});
