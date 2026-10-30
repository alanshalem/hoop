import type { TourPlacement } from './tour-model';

/**
 * Guided tour geometry (S12): spotlight cutout, tooltip card position and
 * arrow offset, from viewport rects. Pure so it is tested without a DOM.
 */

export interface TourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TourSize {
  width: number;
  height: number;
}

/** Where the card sits relative to the target. */
export type TourCardSide = 'top' | 'bottom' | 'left' | 'right' | 'center';

/** Card edge the arrow sticks out of (it faces the target). */
export type TourArrowEdge = 'top' | 'bottom' | 'left' | 'right';

export interface TourLayoutInput {
  /** Target bounding rect in viewport coordinates, or null for a centered card. */
  target: TourRect | null;
  card: TourSize;
  viewport: TourSize;
  placement?: TourPlacement;
  /** Narrow screens: the card spans the width and docks to the bottom (or top). */
  docked?: boolean;
  spotlightPadding: number;
  /** Distance between the spotlight and the card; the arrow lives in it. */
  gap: number;
  /** Minimum distance between the card and the viewport edges. */
  margin: number;
  /** Minimum distance between the arrow and the card corners. */
  arrowInset: number;
}

export interface TourLayout {
  spotlight: TourRect | null;
  card: { x: number; y: number };
  side: TourCardSide;
  arrow: { edge: TourArrowEdge; offset: number } | null;
}

type Side = Exclude<TourCardSide, 'center'>;

const AUTO_ORDER: Side[] = ['bottom', 'top', 'right', 'left'];

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

const centerX = (rect: TourRect) => rect.x + rect.width / 2;
const centerY = (rect: TourRect) => rect.y + rect.height / 2;

const overlaps = (a: TourRect, b: TourRect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Padded target, cut to the visible viewport. */
const spotlightRect = (target: TourRect, padding: number, viewport: TourSize): TourRect => {
  const left = Math.max(target.x - padding, 0);
  const top = Math.max(target.y - padding, 0);
  const right = Math.min(target.x + target.width + padding, viewport.width);
  const bottom = Math.min(target.y + target.height + padding, viewport.height);
  return { x: left, y: top, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
};

const sideOrder = (placement: TourPlacement | undefined): Side[] => {
  if (!placement || placement === 'auto') return AUTO_ORDER;
  const preferred: Side[] = [placement, OPPOSITE[placement]];
  return [...preferred, ...AUTO_ORDER.filter((side) => !preferred.includes(side))];
};

const centered = (card: TourSize, viewport: TourSize, margin: number) => ({
  x: clamp((viewport.width - card.width) / 2, margin, viewport.width - card.width - margin),
  y: clamp((viewport.height - card.height) / 2, margin, viewport.height - card.height - margin),
});

const fits = (side: Side, spot: TourRect, input: TourLayoutInput): boolean => {
  const { card, viewport, gap, margin } = input;
  switch (side) {
    case 'bottom':
      return viewport.height - (spot.y + spot.height) - gap >= card.height + margin;
    case 'top':
      return spot.y - gap >= card.height + margin;
    case 'right':
      return viewport.width - (spot.x + spot.width) - gap >= card.width + margin;
    case 'left':
      return spot.x - gap >= card.width + margin;
  }
};

const placeBeside = (side: Side, spot: TourRect, input: TourLayoutInput) => {
  const { card, viewport, gap, margin } = input;
  const raw = {
    bottom: { x: centerX(spot) - card.width / 2, y: spot.y + spot.height + gap },
    top: { x: centerX(spot) - card.width / 2, y: spot.y - gap - card.height },
    right: { x: spot.x + spot.width + gap, y: centerY(spot) - card.height / 2 },
    left: { x: spot.x - gap - card.width, y: centerY(spot) - card.height / 2 },
  }[side];
  return {
    x: clamp(raw.x, margin, viewport.width - card.width - margin),
    y: clamp(raw.y, margin, viewport.height - card.height - margin),
  };
};

const arrowFor = (side: Side, spot: TourRect, position: { x: number; y: number }, input: TourLayoutInput) => {
  const { card, arrowInset } = input;
  const cardRect = { ...position, ...card };
  if (overlaps(cardRect, spot)) return null;
  const edge = OPPOSITE[side];
  const offset =
    side === 'top' || side === 'bottom'
      ? clamp(centerX(spot) - position.x, arrowInset, card.width - arrowInset)
      : clamp(centerY(spot) - position.y, arrowInset, card.height - arrowInset);
  return { edge, offset };
};

export function computeTourLayout(input: TourLayoutInput): TourLayout {
  const { target, card, viewport, margin } = input;
  if (!target) {
    return { spotlight: null, card: centered(card, viewport, margin), side: 'center', arrow: null };
  }

  const spotlight = spotlightRect(target, input.spotlightPadding, viewport);

  if (input.docked) {
    // Dock on the half of the screen the target is not in.
    const side: Side = centerY(spotlight) > viewport.height / 2 ? 'top' : 'bottom';
    const position = {
      x: margin,
      y: side === 'bottom' ? viewport.height - card.height - margin : margin,
    };
    return { spotlight, card: position, side, arrow: arrowFor(side, spotlight, position, input) };
  }

  const side = sideOrder(input.placement).find((candidate) => fits(candidate, spotlight, input));
  if (!side) {
    return { spotlight, card: centered(card, viewport, margin), side: 'center', arrow: null };
  }
  const position = placeBeside(side, spotlight, input);
  return { spotlight, card: position, side, arrow: arrowFor(side, spotlight, position, input) };
}
