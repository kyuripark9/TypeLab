/* The guide lines (baseline, x-height, cap height...) the inspector's and the pen's canvases draw, and where their
   names sit, so two lines close together never have their names overlap, nor a line run through a name. */

/** The guide lines, each as [id, height in font units, name], from the baseline up and then the descender. */
export const guideLines = (m: { xh: number; cap: number; asc: number; desc: number }): [string, number, string][] => [
  ['baseline', 0, 'Baseline'], ['xHeight', m.xh, 'x-height'], ['capHeight', m.cap, 'Cap height'], ['ascender', m.asc, 'Ascender'], ['descender', m.desc, 'Descender']
];

/** A label's ink above and below its baseline in px (the caps and the p and g of a `--t-xs` name), and the room
    kept clear between it and a line or another label. */
const RISE = 9, DROP = 3, CLEAR = 2;

/** Each label sits just above its line; where the line above is too close to leave room for it there (cap height
    and ascender often are), it drops below its own line, and below any line that would run through it there, so
    no two labels overlap and no line crosses one. `lines` are [key, height] in font units and `Y` turns a height
    into canvas px; the result maps each key to its label's canvas y (its baseline). */
export function stackLabels<K>(lines: readonly (readonly [K, number])[], Y: (y: number) => number): Map<K, number> {
  const out = new Map<K, number>(), at = lines.map(([, y]) => Y(y));
  // the line that would run through a label with its baseline at ly, if any (the lowest such)
  const through = (ly: number) => at.reduce<number | null>((hit, y) => (y > ly - RISE - CLEAR && y < ly + DROP + CLEAR && (hit === null || y > hit) ? y : hit), null);
  let floor = -Infinity; // the label above's foot, with room kept under it
  for (const [key, y] of [...lines].sort((a, b) => b[1] - a[1])) {
    const above = Y(y) - 5;
    let ly = above - RISE >= floor && through(above) === null ? above : Math.max(Y(y) + 13, floor + RISE);
    for (let hit = through(ly); hit !== null; hit = through(ly)) ly = hit + 13;
    out.set(key, ly);
    floor = ly + DROP + CLEAR;
  }
  return out;
}
