/* Script capitals.
   The capitals of a joined-up script are written, not built: a lead-in, one swelling downstroke,
   bowls drawn round in a single movement, loops where the pen turns back on itself. Each one here
   is a few pen strokes through points laid out on a 700-high capital, drawn smooth through them
   (each point's way out is the average of the ways in from the point before and on to the next).
   The stroke expander gives them their thick and thin, the terminals their ends and the slant its
   lean, as for every other letter. The script styles use them, and the small letters below, in place
   of the print ones (see scriptForm). */
import { defGlyph as def, type Builder, type Metrics } from './font';
import type { Cmd, EndType, StrokeOpts } from './types';

const T = 'term', J = 'join';
/** how thin a free end runs out, as a share of the stroke */
const LIFT = 0.4;

type XY = [number, number];
/** A stroke: runs of points drawn smooth, a corner between each run and the next (the point of a V). */
type Runs = number[][][];

/** A point the pen passes through: x, y, and optionally the way it runs there (degrees, 0 to the right,
    90 up) and how full the curve swells either side of it (1 as usual). */
type Node = number[];

/** The smooth curve through `pts`, as cubic commands (without the opening move). Where a point gives
    no way of its own, the curve leaves it the average of the ways in from the point before and on to
    the next (at an end, as it would if it carried on bending as it does next). */
function smooth(pts: Node[]): Cmd[] {
  const n = pts.length, d: number[] = [], dir: XY[] = [];
  for (let i = 0; i + 1 < n; i++) d.push(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) || 1e-6);
  const unit = (x: number, y: number): XY => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  for (let i = 1; i + 1 < n; i++) {
    const a = unit(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]), b = unit(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    dir[i] = unit(a[0] + b[0], a[1] + b[1]);
  }
  const endDir = (i: number, j: number, k: number): XY => {
    const s = unit(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]), t = dir[k] ?? s;
    return unit(2 * s[0] * (s[0] * t[0] + s[1] * t[1]) - t[0], 2 * s[1] * (s[0] * t[0] + s[1] * t[1]) - t[1]);
  };
  dir[0] = n > 2 ? endDir(0, 1, 1) : unit(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  dir[n - 1] = n > 2 ? endDir(n - 1, n - 2, n - 2) : dir[0];
  // a way given outright wins
  pts.forEach((p, i) => { if (p[2] != null) dir[i] = [Math.cos(p[2] * Math.PI / 180), Math.sin(p[2] * Math.PI / 180)]; });
  const out: Cmd[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const h0 = d[i] / 3 * (pts[i][3] ?? 1), h1 = d[i] / 3 * (pts[i + 1][3] ?? 1);
    out.push(['C', pts[i][0] + dir[i][0] * h0, pts[i][1] + dir[i][1] * h0, pts[i + 1][0] - dir[i + 1][0] * h1, pts[i + 1][1] - dir[i + 1][1] * h1, pts[i + 1][0], pts[i + 1][1]]);
  }
  return out;
}

/** Node `p` scaled by sx across and sy up, its way turned to match. */
function scaled(p: Node, sx: number, sy: number, dx = 0): Node {
  const out = [p[0] * sx + dx, p[1] * sy];
  if (p[2] != null) { const a = p[2] * Math.PI / 180; out.push(Math.atan2(Math.sin(a) * sy, Math.cos(a) * sx) * 180 / Math.PI); }
  if (p[3] != null) { if (out.length < 3) out.push(undefined as unknown as number); out.push(p[3]); }
  return out;
}

/** Draw one stroke, its runs of points (in font units) drawn smooth and a corner between each run and the next. */
function drawRuns(g: Builder, m: Metrics, runs: Runs, o: StrokeOpts) {
  // a free end lifts off as a pen does, cut square across the stroke (thinning into it, unless the
  // design's ends are round, which its roundness rounds): a roman terminal is cut level or plumb and
  // leaves a spur on an end that curls, and the stroke end curl would wind these ends, already
  // written with their flourish, into a knot
  const round = m.ctx.terminal === 'round';
  const lift = (t: EndType) => (t === T ? { end: 'flat' as EndType, w: round ? 1 : LIFT } : { end: t, w: 1 });
  // where the pen turns sharply back (the apex of an A, the point of a V) a mitre would run out into
  // a spike: each run is its own stroke, cut level across the point (or plumb, where it points
  // sideways, the waist of a B), as the roman A and V are
  const cut = (p: Node, q: Node, r: Node) => {
    const ax = p[0] - q[0], ay = p[1] - q[1], bx = r[0] - q[0], by = r[1] - q[1], la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
    return (Math.abs(ay / la + by / lb) >= Math.abs(ax / la + bx / lb) ? 'h' : 'v') as EndType;
  };
  runs.forEach((pts, k) => {
    const prev = runs[k - 1], next = runs[k + 1];
    const s = prev ? cut(prev.length > 1 ? prev[prev.length - 2] : pts[1], pts[0], pts[1]) : o.s ?? T;
    const e = next ? cut(pts[pts.length - 2], pts[pts.length - 1], next[1] ?? next[0]) : o.e ?? T;
    const ls = lift(s), le = lift(e);
    g.path([['M', pts[0][0], pts[0][1]], ...smooth(pts)], { ...o, s: ls.end, e: le.end, ws: ls.w, we: le.w });
    // its free ends are written as they are, like the tips of cursive strokes: the stroke end length
    // and curl of the roman letters leave them be
    if (s === T) g.mark('exit', pts[0][0], pts[0][1]);
    if (e === T) g.mark('exit', pts[pts.length - 1][0], pts[pts.length - 1][1]);
    // and like them it gets room where it reaches past the body (the bow of a v)
    for (const p of pts) { g.reachL = Math.min(g.reachL, p[0]); g.reachR = Math.max(g.reachR, p[0]); }
  });
}

/** Draw a letter Wn wide on a 700-high capital: each stroke's points scaled to the design's width and cap height. */
function scriptCap(Wn: number, strokes: [Runs, StrokeOpts][]) {
  return (g: Builder, m: Metrics) => {
    const W = m.W(Wn, 'r'), sx = W / Wn, sy = m.cap / 700;
    for (const [runs, o] of strokes) drawRuns(g, m, runs.map(run => run.map(p => scaled(p, sx, sy))), { pen: 'pointed', ...o });
    return W;
  };
}

const capDef = (ch: string, sb: [number, number], Wn: number, strokes: [Runs, StrokeOpts][]) =>
  // (on the right, room for the join the next small letter rises from)
  def(ch + '.scr', [sb[0], Math.max(sb[1], 1.3)], scriptCap(Wn, strokes), { parts: ['stem', 'bowl', 'swash'], params: ['scriptForm', 'contrast', 'slant', 'width'] });

/* the stem most capitals stand on: in from the left at the top, down, and curled back at the foot */
const leadStem = (x: number): XY[] => [[x - 170, 560], [x - 100, 670], [x, 700], [x + 20, 600], [x - 5, 350], [x - 35, 110], [x - 90, 15], [x - 170, 25], [x - 190, 95]];

capDef('A', [0.3, 0.5], 640, [
  [[[[30, 110], [75, 35], [155, 45], [275, 260], [395, 560], [470, 700]], [[470, 700], [452, 430], [440, 170], [452, 55], [520, 8], [590, 35], [640, 105]]], { part: 'stem' }],
  [[[[175, 300], [330, 335], [545, 318]]], { part: 'crossbar' }]
]);
capDef('B', [0.4, 0.5], 600, [
  [[leadStem(250)], { part: 'stem' }],
  [[[[262, 698, 5], [450, 700], [525, 625], [478, 475], [305, 392]], [[305, 392], [470, 372], [565, 250], [525, 85], [385, 12], [240, 25], [205, 80]]], { part: 'bowl', s: J, e: J }]
]);
capDef('C', [0.5, 0.4], 600, [
  [[[[430, 555], [500, 620], [480, 690], [360, 702], [205, 620], [95, 420], [110, 175], [235, 25], [400, 12], [545, 105]]], { part: 'bowl' }]
]);
capDef('D', [0.4, 0.5], 640, [
  [[[[255, 690], [250, 420], [228, 160], [175, 45], [85, 22], [52, 92], [155, 112], [335, 22], [525, 82], [615, 300], [585, 560], [435, 690], [235, 702], [90, 625]]], { part: 'bowl' }]
]);
capDef('E', [0.5, 0.4], 520, [
  [[[[425, 610], [375, 688], [255, 702], [150, 630], [160, 505], [272, 412], [335, 400]], [[335, 400], [235, 398], [118, 318], [80, 168], [162, 38], [312, 8], [452, 68], [505, 140]]], { part: 'bowl' }]
]);
capDef('F', [0.2, 0.3], 600, [
  [[[[20, 590], [120, 680], [330, 660], [500, 705], [620, 688]]], { part: 'arm' }],
  [[[[362, 672], [348, 400], [322, 150], [278, 40], [212, 6], [140, 22], [118, 82]]], { part: 'stem', s: J }],
  [[[[200, 362], [325, 385], [470, 362]]], { part: 'crossbar' }]
]);
capDef('G', [0.5, 0.5], 620, [
  [[[[440, 555], [505, 620], [488, 690], [365, 702], [205, 620], [95, 420], [112, 170], [240, 22], [395, 12], [510, 90], [540, 260], [545, 345]], [[545, 345], [520, 100], [470, -110], [390, -250], [300, -255], [290, -170], [400, -100]]], { part: 'bowl' }]
]);
capDef('H', [0.4, 0.5], 680, [
  [[leadStem(230)], { part: 'stem' }],
  [[[[565, 700], [545, 400], [525, 150], [545, 42], [615, 8], [685, 70]]], { part: 'stem' }],
  [[[[95, 300], [250, 378], [420, 365], [565, 385]]], { part: 'crossbar' }]
]);
capDef('I', [0.4, 0.5], 380, [
  [[leadStem(300)], { part: 'stem' }]
]);
capDef('J', [0.4, 0.5], 460, [
  [[[[130, 560], [200, 670], [350, 700], [372, 600], [332, 300], [272, -50], [192, -228], [92, -250], [58, -168], [152, -70]]], { part: 'stem' }]
]);
capDef('K', [0.4, 0.3], 640, [
  [[leadStem(250)], { part: 'stem' }],
  [[[[605, 690], [505, 622], [330, 455], [250, 378]], [[250, 378], [405, 385], [455, 255], [475, 82], [560, 10], [650, 72]]], { part: 'arm' }]
]);
capDef('L', [0.4, 0.4], 580, [
  [[[[300, 560], [375, 650], [340, 702], [262, 640], [235, 450], [205, 170], [130, 45], [45, 38], [58, 102], [180, 92], [345, 22], [482, 18], [575, 90]]], { part: 'stem' }]
]);
capDef('M', [0.3, 0.5], 820, [
  [[[[30, 85], [110, 28], [175, 150], [250, 500], [300, 700]], [[300, 700], [360, 400], [420, 150], [445, 40]], [[445, 40], [525, 400], [625, 700]], [[625, 700], [612, 400], [600, 150], [630, 32], [722, 10], [805, 80]]], { part: 'stem' }]
]);
capDef('N', [0.3, 0.4], 680, [
  [[[[30, 85], [110, 28], [175, 150], [250, 500], [305, 700]], [[305, 700], [385, 350], [470, 40]], [[470, 40], [542, 400], [612, 640], [692, 702], [722, 640]]], { part: 'stem' }]
]);
capDef('O', [0.5, 0.5], 620, [
  [[[[335, 700], [165, 640], [72, 420], [110, 150], [270, 10], [452, 30], [562, 220], [552, 500], [432, 680], [262, 690], [175, 618]]], { part: 'bowl' }]
]);
capDef('P', [0.4, 0.5], 580, [
  [[leadStem(250)], { part: 'stem' }],
  [[[[262, 698, 5], [460, 700], [540, 610], [500, 452], [332, 372], [232, 385]]], { part: 'bowl', s: J, e: J }]
]);
capDef('Q', [0.5, 0.5], 640, [
  [[[[335, 700], [165, 640], [72, 420], [110, 150], [270, 10], [452, 30], [562, 220], [552, 500], [432, 680], [262, 690], [175, 618]]], { part: 'bowl' }],
  [[[[230, 75], [370, -5], [500, -35], [640, 15]]], { part: 'tail' }]
]);
capDef('R', [0.4, 0.3], 620, [
  [[leadStem(250)], { part: 'stem' }],
  [[[[262, 698, 5], [450, 700], [522, 620], [472, 472], [305, 392]], [[305, 392], [432, 362], [462, 222], [482, 80], [562, 10], [640, 70]]], { part: 'bowl', s: J }]
]);
capDef('S', [0.4, 0.4], 540, [
  [[[[140, 135], [88, 60], [170, 2], [330, 12], [430, 130], [400, 262], [262, 362], [172, 482], [202, 640], [330, 702], [452, 670], [492, 598]]], { part: 'spine' }]
]);
capDef('T', [0.2, 0.3], 640, [
  [[[[20, 590], [120, 680], [330, 660], [520, 705], [650, 688]]], { part: 'arm' }],
  [[[[372, 672], [358, 400], [332, 150], [288, 40], [222, 6], [150, 22], [128, 82]]], { part: 'stem', s: J }]
]);
capDef('U', [0.4, 0.4], 660, [
  [[[[40, 560], [110, 680], [205, 700], [205, 560], [172, 300], [172, 92], [262, 10], [400, 30], [520, 200], [562, 480], [580, 700]], [[580, 700], [560, 400], [540, 150], [560, 40], [622, 10], [682, 70]]], { part: 'stem' }]
]);
capDef('V', [0.4, 0.3], 620, [
  [[[[40, 560], [110, 680], [205, 700], [222, 560], [262, 300], [332, 20]], [[332, 20], [440, 320], [540, 600], [600, 700], [650, 690], [640, 620]]], { part: 'stem' }]
]);
capDef('W', [0.4, 0.3], 880, [
  [[[[40, 560], [110, 680], [205, 700], [222, 560], [252, 300], [302, 20]], [[302, 20], [382, 300], [452, 560], [482, 620]], [[482, 620], [522, 300], [592, 20]], [[592, 20], [682, 320], [782, 600], [832, 700], [882, 690], [872, 620]]], { part: 'stem' }]
]);
capDef('X', [0.3, 0.3], 600, [
  [[[[40, 600], [122, 702], [222, 660], [332, 350], [422, 80], [502, 10], [600, 60]]], { part: 'stem' }],
  [[[[560, 640], [420, 450], [222, 200], [100, 40], [30, 60]]], { part: 'arm' }]
]);
capDef('Y', [0.4, 0.4], 600, [
  [[[[40, 560], [110, 680], [205, 700], [205, 560], [182, 330], [232, 160], [352, 130], [500, 250], [560, 480], [580, 700]], [[580, 700], [542, 350], [482, 0], [392, -220], [282, -260], [232, -180], [332, -100], [482, -20]]], { part: 'stem' }]
]);
capDef('Z', [0.4, 0.4], 580, [
  [[[[80, 580], [150, 680], [330, 655], [478, 698, 5], [505, 660, -125, 0.7], [300, 360, -132], [100, 45, -128], [96, 12, -40, 0.7], [200, 45, 10], [350, 2], [500, 20], [565, 90]]], { part: 'stem' }]
]);

/* ---------- lowercase ----------
   The small letters of a joined-up hand, written as one: each starts on a hairline rising out of the
   letter before, crossing its left edge at the join height, and finishes rising out of its right edge
   the same way, so with the usual tight spacing of a script they run on into each other. Downstrokes
   swell under the pen, everything else is a hairline (see the pointed pen in stroke.ts). Points are
   in x-heights (across, scaled by Width), the ascender and descender of the design given as A and D. */

/** where letters join: the hairline between two crosses their shared edge this high, rising this steeply */
const JY = 0.38, JA = 58;
/** room every letter keeps on its right for its join to rise out of its last downstroke */
const EX = 0.1;
/** each join runs straight for this far (in x-heights across) either side of the letter's edge, and on
    under the neighbouring letter's own join, so the two overlap along one line and neither's cut end shows */
const PAST = 0.07, RISE = PAST * Math.tan(JA * Math.PI / 180);
const IN: Node[] = [[-PAST, JY - RISE, JA], [0, JY, JA], [PAST, JY + RISE, JA]];
const out = (W: number): Node[] => [[W + EX - PAST, JY - RISE, JA], [W + EX, JY, JA], [W + EX + PAST, JY + RISE, JA]];
/** a join out of the top of a letter (o, b, v, w): on from (x, y) over to the right and down onto the
    join line, where the next letter's join rises from */
const outHigh = (x: number, y: number, W: number): Node[] => [[x, y, -8], [W + EX - PAST * 0.5, JY + 0.08, -42], [W + EX + PAST * 0.6, JY - 0.02, -48]];
/** a downstroke from (x, top) to the baseline, turning out along it into the join */
const foot = (x: number, top: number, W: number): Node[] => [[x, top, -94], [x - 0.03, 0.22, -92], [x + 0.11, 0, 0], ...out(W)];
/** a stem looped at the top: up from the join to the ascender, over and straight down */
const loopUp = (x: number, A: number): Node[] => [...IN, [x - 0.02, 0.75, 72], [x + 0.13, A - 0.25, 84], [x + 0.03, A, 180], [x - 0.07, A - 0.3, -86], [x - 0.04, 0.6, -90]];
/** an oval anticlockwise from its top right, round and back up its right side to (xr, 1) */
const oval = (xl: number, xr: number): Node[] => [[xr - 0.05, 0.9, 140], [xl + (xr - xl) * 0.45, 1, 180, 1.15], [xl, 0.5, -90, 1.15], [xl + (xr - xl) * 0.42, 0, 0, 1.15], [xr - 0.02, 0.4, 80], [xr, 1, 86]];
/** an arch up out of the foot of a stem at x, over to its right side at xr, and down into the join */
const arch = (x: number, xr: number, W: number): Node[] => [[x - 0.01, 0.4, 84], [x + 0.03, 0.62, 74], [x + (xr - x) * 0.55, 0.98, 6], [xr, 0.72, -88], ...foot(xr, 0.5, W).slice(1)];
/** a descender looped back up to the left: down from (x, 0) to D and round into the join */
const loopDown = (x: number, D: number, W: number): Node[] => [[x, 0.2, -92], [x - 0.02, D * 0.6, -94], [x - 0.12, D, 180], [x - 0.24, D * 0.7, 95], [x - 0.08, -0.04, 45], ...out(W)];

type Lower = (A: number, D: number) => [Runs, StrokeOpts][];
const LOWER_PARAMS = ['scriptForm', 'contrast', 'slant', 'width'];

function lower(ch: string, Wn: number, strokes: Lower, dot?: [number, number]) {
  def(ch + '.scr', [0, 0], (g, m) => {
    // across, an x-height a unit (as Width sets it), widened as the strokes get heavier so the counters stay open
    const sx = (m.xh * 1.05 + m.s * 1.1) * m.W(1000) / 1000, sy = m.xh, A = m.asc / m.xh, D = m.desc / m.xh;
    for (const [runs, o] of strokes(A, D)) drawRuns(g, m, runs.map(r => r.map(p => scaled(p, sx, sy))), { pen: 'pointed', s: 'flat', e: 'flat', ...o });
    if (dot) g.dot(dot[0] * sx, dot[1] * sy, m.s * 1.1);
    // the joins reaching past the edges are the neighbours' to share, not room to make
    g.reachL = 0; g.reachR = (Wn + EX) * sx;
    return (Wn + EX) * sx;
  }, { parts: ['stem', 'bowl'], params: LOWER_PARAMS });
}

lower('a', 0.92, () => [[[[...IN, [0.58, 0.88, 30]], oval(0.1, 0.64), foot(0.64, 1, 0.92)], { part: 'bowl' }]]);
lower('b', 0.8, A => [[[[...loopUp(0.24, A), [0.21, 0.15, -88], [0.34, 0, 0, 1.1], [0.58, 0.42, 88, 1.1], [0.46, 0.8, 175], [0.38, 0.71, -75], [0.47, 0.66, 10], ...outHigh(0.54, 0.7, 0.8).slice(1)]], { part: 'stem' }]]);
lower('c', 0.7, () => [[[[...IN, [0.14, 0.76, 66], [0.34, 1, 5], [0.52, 0.93, -45], [0.5, 0.82, -130]]], { part: 'bowl', e: 'term' }], [[[[0.36, 1, 180, 1.1], [0.08, 0.5, -90, 1.15], [0.3, 0, 0, 1.1], ...out(0.7)]], { part: 'bowl', s: 'join' }]]);
lower('d', 0.92, A => [[[[...IN, [0.58, 0.88, 30]], [...oval(0.1, 0.64).slice(0, -1), [0.66, 1, 86], [0.7, A, 86]], foot(0.7, A, 0.92)], { part: 'bowl' }]]);
lower('e', 0.7, () => [[[[...IN, [0.38, 0.62, 35], [0.5, 0.86, 95], [0.38, 1, 180], [0.13, 0.6, -105, 1.1], [0.2, 0.12, -60], [0.38, 0, 0], ...out(0.7)]], { part: 'bowl' }]]);
lower('f', 0.62, (A, D) => [[[[...loopUp(0.28, A), [0.24, 0, -90], [0.22, D * 0.6, -92], [0.14, D, 180], [0.06, D * 0.65, 90], [0.3, 0.06, 40], ...out(0.62)]], { part: 'stem' }]]);
lower('g', 0.92, (A, D) => [[[[...IN, [0.58, 0.88, 30]], oval(0.1, 0.64), [[0.64, 1, -94], ...loopDown(0.64, D, 0.92)]], { part: 'bowl' }]]);
lower('h', 1.0, A => [[[[...loopUp(0.22, A), [0.2, 0, -90]], arch(0.2, 0.68, 1.0)], { part: 'stem' }]]);
lower('i', 0.5, () => [[[[...IN, [0.26, 1, 74]], foot(0.26, 1, 0.5)], { part: 'stem' }]], [0.33, 1.42]);
lower('j', 0.5, (A, D) => [[[[...IN, [0.28, 1, 74]], [[0.28, 1, -94], ...loopDown(0.28, D, 0.5)]], { part: 'stem' }]], [0.35, 1.42]);
lower('k', 0.86, A => [[[[...loopUp(0.22, A), [0.2, 0, -90]], [[0.2, 0.02, 86], [0.24, 0.5, 76], [0.46, 0.96, 15], [0.62, 0.8, -95], [0.4, 0.5, 200, 0.8]], [[0.4, 0.5, -10], [0.56, 0.36, -70], ...foot(0.6, 0.3, 0.86).slice(1)]], { part: 'stem' }]]);
lower('l', 0.5, A => [[[[...loopUp(0.22, A), ...foot(0.2, 0.4, 0.5).slice(1)]], { part: 'stem' }]]);
lower('m', 1.36, () => [[[[...IN, [0.12, 0.72, 68], [0.28, 0.98, 8], [0.4, 0.78, -86], [0.4, 0, -90]], [[0.4, 0.02, 86], [0.43, 0.5, 78], [0.6, 0.98, 8], [0.74, 0.78, -86], [0.74, 0, -90]], arch(0.74, 1.08, 1.36)], { part: 'stem' }]]);
lower('n', 1.0, () => [[[[...IN, [0.12, 0.72, 68], [0.28, 0.98, 8], [0.4, 0.78, -86], [0.4, 0, -90]], arch(0.4, 0.74, 1.0)], { part: 'stem' }]]);
lower('o', 0.76, () => [[[[...IN, [0.5, 0.9, 40]], [[0.5, 0.9, 120], [0.34, 1, 180, 1.15], [0.08, 0.5, -90, 1.15], [0.3, 0, 0, 1.15], [0.56, 0.5, 90, 1.1], [0.42, 0.98, 175], [0.38, 0.88, -60], [0.48, 0.8, 5], ...outHigh(0.56, 0.8, 0.76).slice(1)]], { part: 'bowl' }]]);
lower('p', 0.94, (A, D) => [[[[...IN, [0.24, 1, 74]], [[0.24, 1, -94], [0.2, D, -92]]], { part: 'stem' }], [[[[0.215, 0.45, 84], [0.27, 0.78, 66], [0.46, 0.99, 4], [0.66, 0.74, -86, 1.1], [0.6, 0.18, -112], [0.42, 0, 180], [0.25, 0.1, 140, 0.8]], [[0.25, 0.1, -25], [0.46, 0, 0], [0.72, 0.08, 25], ...out(0.94)]], { part: 'bowl', s: 'join' }]]);
lower('q', 0.92, (A, D) => [[[[...IN, [0.58, 0.88, 30]], oval(0.1, 0.64), [[0.64, 1, -94], [0.62, 0.2, -92], [0.6, D * 0.75, -94], [0.67, D, 0], [0.75, D * 0.7, 100], [0.68, 0.02, 70], ...out(0.92).slice(0)]], { part: 'bowl' }]]);
lower('r', 0.84, () => [[[[...IN, [0.26, 1, 72]], [[0.26, 1, -40], [0.4, 0.9, 0], [0.54, 0.98, 60]], foot(0.56, 1, 0.84)], { part: 'stem' }]]);
lower('s', 0.62, () => [[[[...IN, [0.34, 1.02, 76]], [[0.34, 1.02, -60], [0.5, 0.42, -85, 1.1], [0.36, 0, 190], [0.14, 0.12, 120]], [[0.14, 0.12, -20], [0.3, 0.03, 0], ...out(0.62)]], { part: 'stem' }]]);
lower('t', 0.6, () => [[[[...IN, [0.28, 1.45, 76]], foot(0.28, 1.45, 0.6)], { part: 'stem' }], [[[[0.06, 0.96, 5], [0.52, 1.0, 5]]], { part: 'crossbar' }]]);
lower('u', 0.94, () => [[[[...IN, [0.24, 1, 74]], [[0.24, 1, -94], [0.21, 0.2, -92], [0.36, 0, 0, 1.1], [0.6, 0.36, 66], [0.66, 1, 86]], foot(0.66, 1, 0.94)], { part: 'stem' }]]);
lower('v', 0.84, () => [[[[...IN, [0.24, 1, 74]], [[0.24, 1, -94], [0.22, 0.35, -92], [0.38, 0, 0, 1.15], [0.6, 0.45, 82], [0.62, 0.96, 95], [0.53, 0.86, -70], [0.62, 0.76, 0], ...outHigh(0.68, 0.77, 0.84).slice(1)]], { part: 'stem' }]]);
lower('w', 1.16, () => [[[[...IN, [0.24, 1, 74]], [[0.24, 1, -94], [0.22, 0.3, -92], [0.38, 0, 0, 1.1], [0.56, 0.4, 80], [0.6, 0.98, 88]], [[0.6, 0.98, -94], [0.6, 0.3, -90], [0.74, 0, 0, 1.1], [0.92, 0.45, 82], [0.94, 0.96, 95], [0.85, 0.86, -70], [0.94, 0.76, 0], ...outHigh(1.0, 0.77, 1.16).slice(1)]], { part: 'stem' }]]);
lower('x', 0.86, () => [[[[...IN, [0.15, 0.8, 70], [0.32, 0.98, 12], [0.44, 0.7, -72], [0.5, 0.22, -80], [0.62, 0, 0], ...out(0.86)]], { part: 'stem' }], [[[[0.18, 0.04, 48], [0.78, 0.96, 52]]], { part: 'arm' }]]);
lower('y', 0.94, (A, D) => [[[[...IN, [0.24, 1, 74]], [[0.24, 1, -94], [0.21, 0.2, -92], [0.36, 0, 0, 1.1], [0.6, 0.36, 66], [0.66, 1, 86]], [[0.66, 1, -94], ...loopDown(0.66, D, 0.94)]], { part: 'stem' }]]);
lower('z', 0.84, (A, D) => [[[[...IN, [0.2, 0.86, 60], [0.4, 1, 5], [0.56, 0.86, -70], [0.42, 0.56, -160, 0.8]], [[0.42, 0.56, -30], [0.6, 0.36, -80], [0.56, 0.04, -100], [0.5, D * 0.55, -100], [0.38, D, 180], [0.26, D * 0.75, 95], [0.42, -0.02, 45], ...out(0.84)]], { part: 'stem' }]]);
