/* The guide lines (baseline, x-height, cap height...) the inspector's and the pen's canvases draw, and where their
   names sit, so two lines close together never have their names overlap. */

/** The guide lines, each as [id, height in font units, name], from the baseline up and then the descender. */
export const guideLines = (m: { xh: number; cap: number; asc: number; desc: number }): [string, number, string][] => [
  ['baseline', 0, 'Baseline'], ['xHeight', m.xh, 'x-height'], ['capHeight', m.cap, 'Cap height'], ['ascender', m.asc, 'Ascender'], ['descender', m.desc, 'Descender']
];

/** Each label sits just above its line; when lines are too close for that (cap height and ascender often
    are), the lower one's label drops below its line so the two never overlap. `lines` are [key, height]
    in font units and `Y` turns a height into canvas px; the result maps each key to its label's canvas y. */
export function stackLabels<K>(lines: readonly (readonly [K, number])[], Y: (y: number) => number): Map<K, number> {
  const out = new Map<K, number>();
  let prevY = -Infinity;
  for (const [key, y] of [...lines].sort((a, b) => b[1] - a[1])) {
    const above = Y(y) - 5, ly = above >= prevY + 11 ? above : Math.max(Y(y) + 13, prevY + 11);
    out.set(key, ly);
    prevY = ly;
  }
  return out;
}
