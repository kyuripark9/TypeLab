/* Contrast drawn from a source's own weights. Higher contrast takes the heights of a lighter weight, so the level
   strokes thin while the uprights stay; reversed, a heavier weight's, so they thicken past the uprights. The letters'
   widths, and so their spacing, stay. Where the weight in use leaves the level strokes too little room, the uprights
   take the rest the other way. Every point keeps its identity, so Points edits ride Contrast as they ride Weight, and
   nothing is drawn past the authored weights, nor (with Verticals and Horizontals) two weights further apart than one
   slider draws them. */
import type { FreeFont } from '../engine/free';
import type { Drawn } from '../engine/outline';

export interface SourceContrastPolicy {
  format: 'source-contrast-v1';
  /** how far apart either end of the slider draws the widths and heights, as a share of the style's weight range: two
      weights further apart don't mix (a heavy bowl's join with a light one's heights opens at its stem) */
  reach: number;
}

export function parseSourceContrast(input: unknown): SourceContrastPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source contrast policy');
  const value = Object.fromEntries(Object.entries(input));
  if (value.format !== 'source-contrast-v1' || Object.keys(value).some(key => key !== 'format' && key !== 'reach')
    || typeof value.reach !== 'number' || !(value.reach > 0 && value.reach <= 1)) throw new TypeError('Invalid source contrast policy');
  return { format: 'source-contrast-v1', reach: value.reach };
}

/** A newer policy reaches as far, or less far: a design taking it up keeps the weights its Contrast drew, as far as the
    newer reach goes (`rescaled`). */
export const sourceContrastExtends = (before: SourceContrastPolicy, after: SourceContrastPolicy): boolean => after.reach <= before.reach;

/** A slider's `value` about the style's own, `pick`, drawn `k` times as far from it, no further than the slider's end:
    a design's settings taken from a policy reaching further to one reaching less far (`k`, the one's reach over the
    other's) draw the weights they drew. */
export function rescaled(value: number, pick: number, k: number): number {
  if (value === pick || k === 1) return value;
  const share = value > pick ? (value - pick) / (1 - pick || 1) : -(pick - value) / (pick || 1), to = Math.max(-1, Math.min(1, share * k));
  return to >= 0 ? pick + to * (1 - pick) : pick + to * pick;
}

/** The weights the letters take their widths (`x`) and heights (`y`) from, drawn at `weight` with Contrast `value`
    about the style's own, `pick`: at either end `reach` of the range apart, the level strokes' weight moving as far as
    the range allows and the uprights' the rest the other way. */
export function contrastWeights(policy: SourceContrastPolicy, weight: number, range: { min: number; max: number },
  value: number, pick: number): { x: number; y: number } {
  if (value === pick) return { x: weight, y: weight };
  const higher = value > pick, share = higher ? (value - pick) / (1 - pick) : (pick - value) / pick;
  const room = higher ? weight - range.min : range.max - weight;
  const want = share * policy.reach * (range.max - range.min), level = Math.min(want, room), rest = want - level;
  return higher ? { x: Math.min(range.max, weight + rest), y: weight - level } : { x: Math.max(range.min, weight - rest), y: weight + level };
}

/** A drawing with the points of `across` and their heights from `up`, point for point: the two must be one drawing at
    two weights. Advances are across's. */
export function mixDrawn(across: Drawn, up: Drawn): Drawn {
  if (across === up) return across;
  return { ...across, contours: across.contours.map((contour, ci) => contour.map((node, ni) => {
    const other = up.contours[ci][ni], out = { ...node, y: other.y };
    if (node.iy !== undefined && other.iy !== undefined) out.iy = other.iy;
    if (node.oy !== undefined && other.oy !== undefined) out.oy = other.oy;
    return out;
  })) };
}

/** `across`'s letters with `up`'s heights, its own heights its cap height and x-height. */
export function mixAxes(across: FreeFont, up: FreeFont): FreeFont {
  if (across === up) return across;
  const glyphs: FreeFont['glyphs'] = {};
  for (const [ch, drawn] of Object.entries(across.glyphs)) glyphs[ch] = up.glyphs[ch] ? mixDrawn(drawn, up.glyphs[ch]) : drawn;
  return { ...across, cap: up.cap, xh: up.xh, glyphs };
}

/** Verticals and Horizontals (`vWeight`, `hWeight`) about the style's own: Verticals moves the weight the widths come
    from, Horizontals the heights', each up to `reach` of the style's weight range either way. Where one runs out of
    authored weights, the other goes the other way by the rest, so the uprights and level strokes keep drawing apart.
    `source-strokes-v2` also holds the two weights no more than `apart` of the range apart, however Contrast,
    Verticals and Horizontals add up: stacked, they had drawn them the whole range apart, where a light weight's heights
    on a heavy one's widths tore bowls open at their stems. */
export type SourceStrokesPolicy = { format: 'source-strokes-v1'; reach: number } | { format: 'source-strokes-v2'; reach: number; apart: number };
export function parseSourceStrokes(input: unknown): SourceStrokesPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source strokes policy');
  const value = Object.fromEntries(Object.entries(input)), share = (v: unknown): v is number => typeof v === 'number' && v > 0 && v <= 1;
  const keys = value.format === 'source-strokes-v1' ? ['format', 'reach'] : value.format === 'source-strokes-v2' ? ['format', 'reach', 'apart'] : null;
  if (!keys || Object.keys(value).some(key => !keys.includes(key)) || !share(value.reach)) throw new TypeError('Invalid source strokes policy');
  if (value.format === 'source-strokes-v1') return { format: 'source-strokes-v1', reach: value.reach };
  if (!share(value.apart)) throw new TypeError('Invalid source strokes policy');
  return { format: 'source-strokes-v2', reach: value.reach, apart: value.apart };
}
/** A newer policy reaches as far, or less far (a design taking it up keeps what its Verticals and Horizontals drew as far
    as it goes, `rescaled`), and holds the weights as close together. */
export const sourceStrokesExtend = (before: SourceStrokesPolicy, after: SourceStrokesPolicy): boolean => after.reach <= before.reach
  && (after.format === 'source-strokes-v2' ? before.format === 'source-strokes-v1' || after.apart <= before.apart : before.format === 'source-strokes-v1');

/** The widths' and heights' weights `at`, moved by Verticals `v` and Horizontals `h` about the style's own (`vPick`,
    `hPick`). */
export function strokeAxes(policy: SourceStrokesPolicy, at: { x: number; y: number }, range: { min: number; max: number },
  v: number, vPick: number, h: number, hPick: number): { x: number; y: number } {
  const span = range.max - range.min;
  const share = (value: number, pick: number) => value === pick ? 0 : value > pick ? (value - pick) / (1 - pick || 1) : -(pick - value) / (pick || 1);
  let { x, y } = at;
  /** `a` moved by `d`, what it can't take moving `b` the other way. */
  const move = (a: number, b: number, d: number): [number, number] => {
    const to = a + d, kept = Math.max(range.min, Math.min(range.max, to)), rest = to - kept;
    return [kept, Math.max(range.min, Math.min(range.max, b - rest))];
  };
  [x, y] = move(x, y, share(v, vPick) * policy.reach * span);
  [y, x] = move(y, x, share(h, hPick) * policy.reach * span);
  return { x, y };
}

/** The widths' and heights' weights `at`, under `source-strokes-v2` held no more than `apart` of the range apart: each
    drawn back toward the weight in use (`weight`) by the same share, so neither turns the other way from the weight the
    Weight slider draws. */
export function heldApart(policy: SourceStrokesPolicy, at: { x: number; y: number }, weight: number,
  range: { min: number; max: number }): { x: number; y: number } {
  const gap = Math.abs(at.x - at.y);
  if (policy.format === 'source-strokes-v1' || gap <= policy.apart * (range.max - range.min)) return at;
  const k = policy.apart * (range.max - range.min) / gap;
  return { x: weight + (at.x - weight) * k, y: weight + (at.y - weight) * k };
}
