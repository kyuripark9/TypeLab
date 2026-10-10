/* Swash letters (Flourishes: Swash; the option list is FLOURISHES in shared/params/options.ts).
   A flourished script letter is the plain one (script.ts) with a flourish written on: the t's bar runs
   in from far to the left and loops back over the letter, the l and d rise into loops over the
   following letters, the r's foot sweeps down into a shaded curl and ends in a heart, the z's tail
   loops away under the letters before it and runs back under the whole word to a hook, and the S
   leads in from a wide loop. The flourishes are fine hairlines with a shade where the pen presses,
   and they reach far past the letter without taking room from its neighbours.

   Each flourish is a run of points in x-heights from a point on the plain letter (the top of its
   ascender, the middle of its bar, the foot of its stem), laid out as they lie on a script leaning
   20°: they are leaned back upright here, and the design's slant leans them again with the letter. */
import { defGlyph as def, glyphDefOf, type Builder, type Metrics } from './font';
import type { Cmd, StrokeOpts } from './types';

/** the lean the flourishes are laid out on: Slant at 100 */
const LEAN = Math.tan(20 * Math.PI / 180);
/** how thin a flourish's free ends run out, as a share of the hairline */
const LIFT = 0.4;

/** A point the pen passes through, in x-heights from the anchor: x, y, and optionally how heavily the pen
    presses on the curve on to the next point (0 or none a hairline, 1 a full shade). */
type Pt = [number, number, number?];

/** The smooth curve through `pts` (in font units), each point left the way the line through its neighbours runs. */
function smooth(pts: Pt[]): Cmd[] {
  const n = pts.length, dir: [number, number][] = [];
  const unit = (x: number, y: number): [number, number] => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    dir.push(unit(b[0] - a[0], b[1] - a[1]));
  }
  const out: Cmd[] = [['M', pts[0][0], pts[0][1]]];
  for (let i = 0; i + 1 < n; i++) {
    const p = pts[i], q = pts[i + 1], h = Math.hypot(q[0] - p[0], q[1] - p[1]) / 3;
    out.push(['C', p[0] + dir[i][0] * h, p[1] + dir[i][1] * h, q[0] - dir[i + 1][0] * h, q[1] - dir[i + 1][1] * h, q[0], q[1]]);
  }
  return out;
}

/** Write flourish `pts` on from the anchor (ax, ay), leaned back upright and scaled to the x-height: a
    hairline, and over it a shade along each run of pressed curves, swelling out of the hairline and
    back into it as one leaf (not curve by curve). A stroke given its own weight `w` (undefined: the
    pointed pen's, pressed on the way down) is drawn so instead. */
function flourish(g: Builder, m: Metrics, ax: number, ay: number, pts: Pt[], o: StrokeOpts = {}) {
  const u = m.xh;
  const at = pts.map(([x, y, w]): Pt => [ax + (x - LEAN * y) * u, ay + y * u, w]);
  const cmds = smooth(at), own = 'w' in o;
  g.path(cmds, { pen: 'pointed', part: 'swash', s: 'flat', e: 'flat', ws: LIFT, we: LIFT, w: 0, ...o });
  if (own) return;
  for (let i = 0; i + 1 < at.length;) {
    if (!at[i][2]) { i++; continue; }
    let j = i, w = 0;
    while (j + 1 < at.length && at[j][2]) w = Math.max(w, at[j++][2]!);
    g.path([['M', at[i][0], at[i][1]], ...cmds.slice(i + 1, j + 1)], { part: 'swash', s: 'flat', e: 'flat', ws: 0.05, we: 0.05, w });
    i = j;
  }
}

/** Every on-curve point of the plain letter's strokes (where each of their commands ends), with the part
    it belongs to. A script letter's strokes are plain moves and cubics (see drawRuns in script.ts), each
    ending on its point. */
function points(g: Builder) {
  const out: { x: number; y: number; part?: string }[] = [];
  for (const st of g.strokes) {
    for (const c of st.cmds ?? []) if (c[0] !== 'Z') out.push({ x: c[c.length - 2], y: c[c.length - 1], part: st.o.part });
  }
  return out;
}

/** A swash form of script letter `ch`: the plain letter, then `add` writing its flourish on. */
function swash(ch: string, add: (g: Builder, m: Metrics, W: number) => void, from = ch + '.scr') {
  const base = () => glyphDefOf(from)!;
  def(ch + '.sw', glyphDefOf(from)?.sb ?? [0, 0], (g, m) => {
    const W = base().fn(g, m);
    // the flourish reaches over the neighbours: the room the letter keeps is the plain letter's
    const l = g.reachL, r = g.reachR;
    add(g, m, W);
    g.reachL = l; g.reachR = r;
    return W;
  }, { parts: [...(glyphDefOf(from)?.meta.parts ?? []), 'swash'], params: [...(glyphDefOf(from)?.meta.params ?? []), 'flourish'] });
}

const top = (g: Builder) => points(g).reduce((a, b) => (b.y > a.y ? b : a));
const bottom = (g: Builder) => points(g).reduce((a, b) => (b.y < a.y ? b : a));

// t: the bar comes in from far to the left, crosses the stem and loops back up over the letter (it
// takes the place of the plain bar)
swash('t', (g, m) => {
  const bars = points(g).filter(e => e.part === 'crossbar');
  const ax = bars.length ? bars.reduce((s, e) => s + e.x, 0) / bars.length : 0, ay = bars.length ? bars[0].y : m.xh * 1.3;
  g.strokes = g.strokes.filter(st => st.o.part !== 'crossbar');
  flourish(g, m, ax, ay, [[-4.62, -0.15], [-2.74, -0.11], [-1.04, -0.02], [0, 0], [0.47, 0.02], [1.08, 0.3], [1.26, 0.75], [0.79, 1.28], [0.28, 1.34], [-0.09, 1.19], [-0.32, 0.75]]);
});

// l: over the top of the loop to the right, round in a small loop and away down to the left
swash('l', (g, m) => {
  const t = top(g);
  flourish(g, m, t.x, t.y, [[0, 0], [0.55, 0.08], [0.85, -0.26], [0.77, -0.72], [0.55, -0.75], [0.47, -0.49], [0.26, -0.45], [-0.4, -0.74], [-1.34, -1.06], [-2.19, -1.28], [-2.47, -1.47], [-2.51, -1.77]]);
});

// d: its stem stops short, and a shade sweeps level over the top of it, round down the right into a
// loop, and a hairline back up and over to the left
swash('d', (g, m) => {
  const t = top(g);
  const pts: Pt[] = [[-1.51, 0.17, 0.6], [-0.72, 0.28, 1], [0.42, 0.25, 0.8], [1.17, 0.11, 0.55], [1.57, -0.34, 0.5], [1.45, -1.11, 0.3], [1.09, -1.57], [0.6, -1.53], [0.26, -1.21],
    [0.38, -0.74], [0.81, 0.02], [0.75, 0.77], [0.23, 1.19], [-0.34, 1.3], [-1.09, 1.15], [-1.58, 0.83], [-1.79, 0.34]];
  // (the points as measured, pulled in round the right: a point more than 0.2 x-heights right of the
  // stem's top moves left by 0.3 of the distance past that, at most 0.3, closing the loop a little tighter)
  flourish(g, m, t.x, t.y, pts.map(([x, y, w]): Pt => [x - 0.3 * Math.min(1, Math.max(0, x - 0.2)), y, w]));
}, 'd.short');

// r: the foot runs on down under the line in a shaded curl, and out along the bottom into a heart
swash('r', (g, m, W) => {
  const feet = points(g).filter(e => e.x > W * 0.4 && e.y < m.xh * 0.3), f = feet.length ? feet.reduce((a, b) => (b.y < a.y ? b : a)) : { x: W * 0.6, y: 0 };
  flourish(g, m, f.x, f.y, [[0, 0, 0.3], [-0.28, -0.19, 0.6], [-0.62, -0.49, 0.75], [-1.04, -1.04, 0.75], [-1.13, -1.66, 0.4], [-0.85, -2.28, 0], [-0.09, -2.55], [0.3, -2.6], [0.52, -2.47]], { e: 'h', we: 1 });
  // the heart: up its left side and over the left lobe into the cleft, then over the right lobe, pressed
  // as it comes down, to the point
  flourish(g, m, f.x, f.y, [[0.52, -2.47], [0.61, -2.08], [0.74, -1.72], [0.91, -1.6], [1.08, -1.75], [1.07, -2.17]], { s: 'h', ws: 1, e: 'h', we: 1 });
  flourish(g, m, f.x, f.y, [[1.07, -2.17], [1.25, -1.96], [1.5, -1.92], [1.78, -2.13, 0.5], [1.63, -2.51, 0.5], [1.16, -2.85, 0.2], [0.63, -3.13]], { s: 'h', ws: 1 });
});

// z: the tail sweeps on down to the left, loops back under the letters before it and runs out under
// the word, round a loop and on to a shaded hook (laid out from the baseline, below the foot of the z)
swash('z', (g, m) => {
  const b = bottom(g), DROP = -1.4;
  const tail: Pt[] = [[-0.57, -0.6], [-1.51, -0.98], [-2.64, -0.75], [-2.98, -0.09], [-2.64, 0.75], [-1.7, 1.17], [-0.75, 1.09], [0.38, 0.81], [1.13, 0.53], [2.08, 0.32], [3.02, 0.25], [3.77, 0.47],
    [4.21, 0.94], [4.21, 1.38], [3.64, 1.66], [2.7, 1.74], [2.21, 1.57], [2.32, 1.25], [3.02, 1.21], [4.28, 1.42], [5.53, 1.6], [6.17, 1.57, 0.4], [6.55, 1.26, 0.8], [6.6, 0.81, 0.8], [6.42, 0.43, 0.3], [6.08, 0.25]];
  // (the tail as measured, lowered by DROP, 1.4 x-heights; past 1 x-height right of the z's foot it is
  // also drawn in, by up to 0.4, and down, by up to 0.35, growing to the full amounts at 4, so the run out
  // to the right and the loop and hook at its end sit a little lower and come in a little)
  flourish(g, m, b.x, 0, [[0, b.y / m.xh], ...tail.map(([x, y, w]): Pt => [x - 0.4 * Math.min(1, Math.max(0, (x - 1) / 3)), y + DROP - 0.35 * Math.min(1, Math.max(0, (x - 1) / 3)), w])]);
}, 'z.open');

/* S: written whole. A wide hairline loop leads in from the left, sweeps up to the head of the letter,
   and the spine comes down in one shade, under the line, round the foot and up into a curl. In
   x-heights from where the curl reaches out on the left of the foot. */
def('S.sw', [0.2, 0.3], (g, m) => {
  flourish(g, m, 0, 0, [[1.25, -1.9], [0.4, -1.95], [-0.55, -1.2], [-0.81, -0.19], [-0.3, 1.2], [0.83, 1.77], [1.65, 1.35], [1.75, 0.6], [1.0, -0.5], [-0.25, -1.08]]);
  flourish(g, m, 0, 0, [[-0.25, -1.08], [1.4, 0.6], [3.0, 2.3], [3.92, 3.2]], { e: 'h', we: 1 });
  // the spine: pressed as the pen comes down, as a pointed pen does
  flourish(g, m, 0, 0, [[3.92, 3.2], [3.75, 2.95], [3.43, 2.64], [2.5, 1.3], [1.62, -0.77], [1.1, -1.2], [0.49, -1.26], [0.02, -0.75], [0, 0.34], [0.3, 0.1], [0.38, -0.4]], { w: undefined, s: 'h', ws: 1, e: 'term' });
  return m.xh * 2.4;
}, { parts: ['spine', 'swash'], params: ['scriptForm', 'flourish', 'contrast', 'slant'] });
