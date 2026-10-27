/* Contrast drawn from a source's own weights. Higher contrast takes the heights of a lighter weight, so the level
   strokes thin while the uprights stay; reversed, a heavier weight's, so they thicken past the uprights. The letters'
   widths, and so their spacing, stay. Where the weight in use leaves the level strokes too little room, the uprights
   take the rest the other way. Every point keeps its identity, so Points edits ride Contrast as they ride Weight, and
   nothing is drawn past the authored weights. */
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

/** A newer policy reaches as far. */
export const sourceContrastExtends = (before: SourceContrastPolicy, after: SourceContrastPolicy): boolean => after.reach === before.reach;

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
