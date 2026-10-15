/* Script capitals.
   The capitals of a joined-up script are written, not built: a lead-in, one swelling downstroke,
   bowls drawn round in a single movement, loops where the pen turns back on itself. Each one here
   is a few pen strokes through points laid out on a 700-high capital, drawn smooth through them
   (each point's way out is the average of the ways in from the point before and on to the next).
   The stroke expander gives them their thick and thin, the terminals their ends and the slant its
   lean, as for every other letter. The script styles use them, and the small letters below, in place
   of the print ones (Letterforms: Script, the scriptForm setting; scriptForms() in font.ts picks these). */
import type { ControlKey } from '../params';
import { SCRIPT_PAST, altId, defGlyph as def, scriptAcross, scriptId, type Builder, type Metrics } from './font';
import type { Cmd, EndType, StrokeOpts } from './types';

const T = 'term', J = 'join';
/** how thin a free end runs out, as a share of the stroke */
const LIFT = 0.4;

type XY = [number, number];
const unit = (x: number, y: number): XY => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
/** A stroke: runs of points drawn smooth, a corner between each run and the next (the point of a V). */
type Runs = number[][][];

/** A point the pen passes through: x, y, and optionally the way it runs there (degrees, 0 to the right,
    90 up) and how full the curve swells either side of it (1 as usual). */
type CapPt = number[];

/** The smooth curve through `pts`, as cubic commands (without the opening move). Where a point gives
    no way of its own, the curve leaves it the average of the ways in from the point before and on to
    the next (at an end, as it would if it carried on bending as it does next). */
function smooth(pts: CapPt[]): Cmd[] {
  const n = pts.length, d: number[] = [], dir: XY[] = [];
  for (let i = 0; i + 1 < n; i++) d.push(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) || 1e-6);
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

/** Point `p` scaled by sx across and sy up, its way turned to match. */
function scaled(p: CapPt, sx: number, sy: number): CapPt {
  const out = [p[0] * sx, p[1] * sy];
  if (p[2] != null) { const a = p[2] * Math.PI / 180; out.push(Math.atan2(Math.sin(a) * sy, Math.cos(a) * sx) * 180 / Math.PI); }
  if (p[3] != null) { if (out.length < 3) out.push(undefined as unknown as number); out.push(p[3]); }
  return out;
}

/** The way a run of curves leaves its start and arrives at its end, off the first and last curve's handles. */
function runEnds(run: Cmd[]): [XY, XY] {
  const c0 = run[1], cn = run[run.length - 1], q = run[run.length - 2];
  const [x0, y0] = [run[0][1], run[0][2]], [xq, yq] = q[0] === 'M' ? [q[1], q[2]] : [q[5], q[6]];
  const near = (x: number, y: number, x1: number, y1: number) => Math.hypot(x - x1, y - y1) < 1e-6;
  const s = !near(c0[1], c0[2], x0, y0) ? unit(c0[1] - x0, c0[2] - y0) : unit(c0[5] - x0, c0[6] - y0);
  const e = !near(cn[3], cn[4], cn[5], cn[6]) ? unit(cn[5] - cn[3], cn[6] - cn[4]) : unit(cn[5] - xq, cn[6] - yq);
  return [s, e];
}
/** a pen whose hairline is under this share of its shade cuts the shade square where it turns */
const SQUARE_SHADE = 0.55;
const smoothstep = (x: number, w: number) => { const u = Math.max(0, Math.min(1, x / w)); return u * u * (3 - 2 * u); };

/** Draw one stroke, its runs of curves (in font units) each a stroke of its own, with a corner between each run and the next. */
function drawRuns(g: Builder, m: Metrics, runs: Cmd[][], o: StrokeOpts) {
  // a free end lifts off as a pen does, cut square across the stroke (thinning into it, unless the
  // design's ends are round, which its roundness rounds): a roman terminal is cut level or plumb and
  // leaves a spur on an end that curls, and the stroke end curl would wind these ends, already
  // written with their flourish, into a knot
  const round = m.ctx.terminal === 'round';
  const lift = (t: EndType) => (t === T ? { end: 'flat' as EndType, w: round ? 1 : LIFT } : { end: t, w: 1 });
  // where the pen turns sharply (the top of an i, the point of a V) a mitre would run out into a spike:
  // each run is its own stroke, and both end round where they meet, as the pen's nib leaves them, so the
  // two ends lie one over the other however differently thick they come in (cut square across, a hairline's
  // corner stood out of the stem's top as a nub). Under a pen with contrast, the heavier of the two is cut
  // square across instead, as a pointed pen's shade starts and stops, and the hairline ends round inside it
  // (a round blob atop every stem reads as a marker's)
  const ends = runs.map(runEnds), cutsSquare = m.ctx.thin < m.ctx.thick * SQUARE_SHADE;
  const weight = (dy: number) => smoothstep(-dy - 0.1, 0.8);
  const at = (k: number, which: 0 | 1): EndType => {
    if (!cutsSquare) return 'round';
    const [mine, other] = which ? [ends[k][1], ends[k + 1][0]] : [ends[k][0], ends[k - 1][1]];
    // (how hard the pen presses running into the turn and back out of it, as the pointed pen in stroke.ts weighs it)
    const wm = weight(mine[1]), wo = weight(other[1]);
    return wm > wo + 0.2 ? 'flat' : 'round';
  };
  runs.forEach((run, k) => {
    const s = k ? at(k, 0) : o.s ?? T;
    const e = k + 1 < runs.length ? at(k, 1) : o.e ?? T;
    const ls = lift(s), le = lift(e), last = run[run.length - 1];
    g.path(run, { ...o, s: ls.end, e: le.end, ws: ls.w, we: le.w });
    // its free ends are written as they are, like the tips of cursive strokes: the stroke end length
    // and curl of the roman letters leave them be
    if (s === T) g.mark('exit', run[0][1], run[0][2]);
    if (e === T) g.mark('exit', last[5], last[6]);
    // and like them a capital gets room where it reaches past its body (the arm of a T, the curled foot
    // of a K); lower() then gives the small letters only their own width, their joins being the
    // neighbours' to share
    for (const c of run) for (let i = c[0] === 'M' ? 1 : 5; i < c.length; i += 2) { g.reachL = Math.min(g.reachL, c[i]); g.reachR = Math.max(g.reachR, c[i]); }
  });
}

/** Runs of points drawn smooth, as runs of curves. */
const curves = (runs: Runs): Cmd[][] => runs.map(pts => [['M', pts[0][0], pts[0][1]], ...smooth(pts)]);

/** Draw a letter Wn wide on a 700-high capital: each stroke's points scaled to the design's width and cap height. */
function scriptCap(Wn: number, strokes: [Runs, StrokeOpts][]) {
  return (g: Builder, m: Metrics) => {
    const W = m.W(Wn, 'r'), sx = W / Wn, sy = m.cap / 700;
    for (const [runs, o] of strokes) drawRuns(g, m, curves(runs.map(run => run.map(p => scaled(p, sx, sy)))), { pen: 'pointed', ...o });
    // (a capital of a joined-up hand, though it joins no letter: as the small letters, it keeps its own width under
    // Monospace and stands still under Bounce, see placeGlyph)
    g.joins = [];
    return W;
  };
}

/** The controls the inspector shows for a script letter, capital or small. */
const SCRIPT_PARAMS: ControlKey[] = ['scriptForm', 'contrast', 'slant', 'width'];

/** A script capital with side bearing `sbL` on the left (as a share of the design's). */
const capDef = (ch: string, sbL: number, Wn: number, strokes: [Runs, StrokeOpts][]) =>
  // (on the right, room for the join the next small letter rises from)
  def(scriptId(ch), [sbL, 1.3], scriptCap(Wn, strokes), { params: SCRIPT_PARAMS, joined: true });

/* the stem most capitals stand on: in from the left at the top, down, and curled back at the foot */
const leadStem = (x: number): XY[] => [[x - 170, 560], [x - 100, 670], [x, 700], [x + 20, 600], [x - 5, 350], [x - 35, 110], [x - 90, 15], [x - 170, 25], [x - 190, 95]];

capDef('A', 0.3, 640, [
  [[[[30, 110], [75, 35], [155, 45], [275, 260], [395, 560], [470, 700]], [[470, 700], [452, 430], [440, 170], [452, 55], [520, 8], [590, 35], [640, 105]]], { part: 'stem' }],
  [[[[175, 300], [330, 335], [545, 318]]], { part: 'crossbar' }]
]);
capDef('B', 0.4, 600, [
  [[leadStem(250)], { part: 'stem' }],
  [[[[262, 698, 5], [450, 700], [525, 625], [478, 475], [305, 392]], [[305, 392], [470, 372], [565, 250], [525, 85], [385, 12], [240, 25], [205, 80]]], { part: 'bowl', s: J, e: J }]
]);
capDef('C', 0.5, 600, [
  [[[[430, 555], [500, 620], [480, 690], [360, 702], [205, 620], [95, 420], [110, 175], [235, 25], [400, 12], [545, 105]]], { part: 'bowl' }]
]);
capDef('D', 0.4, 640, [
  [[[[255, 690], [250, 420], [228, 160], [175, 45], [85, 22], [52, 92], [155, 112], [335, 22], [525, 82], [615, 300], [585, 560], [435, 690], [235, 702], [90, 625]]], { part: 'bowl' }]
]);
capDef('E', 0.5, 520, [
  [[[[425, 610], [375, 688], [255, 702], [150, 630], [160, 505], [272, 412], [335, 400]], [[335, 400], [235, 398], [118, 318], [80, 168], [162, 38], [312, 8], [452, 68], [505, 140]]], { part: 'bowl' }]
]);
capDef('F', 0.2, 600, [
  [[[[20, 590], [120, 680], [330, 660], [500, 705], [620, 688]]], { part: 'arm' }],
  [[[[362, 672], [348, 400], [322, 150], [278, 40], [212, 6], [140, 22], [118, 82]]], { part: 'stem', s: J }],
  [[[[200, 362], [325, 385], [470, 362]]], { part: 'crossbar' }]
]);
capDef('G', 0.5, 620, [
  [[[[440, 555], [505, 620], [488, 690], [365, 702], [205, 620], [95, 420], [112, 170], [240, 22], [395, 12], [510, 90], [540, 260], [545, 345]], [[545, 345], [520, 100], [470, -110], [390, -250], [300, -255], [290, -170], [400, -100]]], { part: 'bowl' }]
]);
capDef('H', 0.4, 680, [
  [[leadStem(230)], { part: 'stem' }],
  [[[[565, 700], [545, 400], [525, 150], [545, 42], [615, 8], [685, 70]]], { part: 'stem' }],
  [[[[95, 300], [250, 378], [420, 365], [565, 385]]], { part: 'crossbar' }]
]);
capDef('I', 0.4, 380, [
  [[leadStem(300)], { part: 'stem' }]
]);
capDef('J', 0.4, 460, [
  [[[[130, 560], [200, 670], [350, 700], [372, 600], [332, 300], [272, -50], [192, -228], [92, -250], [58, -168], [152, -70]]], { part: 'stem' }]
]);
capDef('K', 0.4, 640, [
  [[leadStem(250)], { part: 'stem' }],
  [[[[605, 690], [505, 622], [330, 455], [250, 378]], [[250, 378], [405, 385], [455, 255], [475, 82], [560, 10], [650, 72]]], { part: 'arm' }]
]);
capDef('L', 0.4, 580, [
  [[[[300, 560], [375, 650], [340, 702], [262, 640], [235, 450], [205, 170], [130, 45], [45, 38], [58, 102], [180, 92], [345, 22], [482, 18], [575, 90]]], { part: 'stem' }]
]);
capDef('M', 0.3, 820, [
  [[[[30, 85], [110, 28], [175, 150], [250, 500], [300, 700]], [[300, 700], [360, 400], [420, 150], [445, 40]], [[445, 40], [525, 400], [625, 700]], [[625, 700], [612, 400], [600, 150], [630, 32], [722, 10], [805, 80]]], { part: 'stem' }]
]);
capDef('N', 0.3, 680, [
  [[[[30, 85], [110, 28], [175, 150], [250, 500], [305, 700]], [[305, 700], [385, 350], [470, 40]], [[470, 40], [542, 400], [612, 640], [692, 702], [722, 640]]], { part: 'stem' }]
]);
capDef('O', 0.5, 620, [
  [[[[335, 700], [165, 640], [72, 420], [110, 150], [270, 10], [452, 30], [562, 220], [552, 500], [432, 680], [262, 690], [175, 618]]], { part: 'bowl' }]
]);
capDef('P', 0.4, 580, [
  [[leadStem(250)], { part: 'stem' }],
  [[[[262, 698, 5], [460, 700], [540, 610], [500, 452], [332, 372], [232, 385]]], { part: 'bowl', s: J, e: J }]
]);
capDef('Q', 0.5, 640, [
  [[[[335, 700], [165, 640], [72, 420], [110, 150], [270, 10], [452, 30], [562, 220], [552, 500], [432, 680], [262, 690], [175, 618]]], { part: 'bowl' }],
  [[[[230, 75], [370, -5], [500, -35], [640, 15]]], { part: 'tail' }]
]);
capDef('R', 0.4, 620, [
  [[leadStem(250)], { part: 'stem' }],
  [[[[262, 698, 5], [450, 700], [522, 620], [472, 472], [305, 392]], [[305, 392], [432, 362], [462, 222], [482, 80], [562, 10], [640, 70]]], { part: 'bowl', s: J }]
]);
capDef('S', 0.4, 540, [
  [[[[140, 135], [88, 60], [170, 2], [330, 12], [430, 130], [400, 262], [262, 362], [172, 482], [202, 640], [330, 702], [452, 670], [492, 598]]], { part: 'spine' }]
]);
capDef('T', 0.2, 640, [
  [[[[20, 590], [120, 680], [330, 660], [520, 705], [650, 688]]], { part: 'arm' }],
  [[[[372, 672], [358, 400], [332, 150], [288, 40], [222, 6], [150, 22], [128, 82]]], { part: 'stem', s: J }]
]);
capDef('U', 0.4, 660, [
  [[[[40, 560], [110, 680], [205, 700], [205, 560], [172, 300], [172, 92], [262, 10], [400, 30], [520, 200], [562, 480], [580, 700]], [[580, 700], [560, 400], [540, 150], [560, 40], [622, 10], [682, 70]]], { part: 'stem' }]
]);
capDef('V', 0.4, 620, [
  [[[[40, 560], [110, 680], [205, 700], [222, 560], [262, 300], [332, 20]], [[332, 20], [440, 320], [540, 600], [600, 700], [650, 690], [640, 620]]], { part: 'stem' }]
]);
capDef('W', 0.4, 880, [
  [[[[40, 560], [110, 680], [205, 700], [222, 560], [252, 300], [302, 20]], [[302, 20], [382, 300], [452, 560], [482, 620]], [[482, 620], [522, 300], [592, 20]], [[592, 20], [682, 320], [782, 600], [832, 700], [882, 690], [872, 620]]], { part: 'stem' }]
]);
capDef('X', 0.3, 600, [
  [[[[40, 600], [122, 702], [222, 660], [332, 350], [422, 80], [502, 10], [600, 60]]], { part: 'stem' }],
  [[[[560, 640], [420, 450], [222, 200], [100, 40], [30, 60]]], { part: 'arm' }]
]);
capDef('Y', 0.4, 600, [
  [[[[40, 560], [110, 680], [205, 700], [205, 560], [182, 330], [232, 160], [352, 130], [500, 250], [560, 480], [580, 700]], [[580, 700], [542, 350], [482, 0], [392, -220], [282, -260], [232, -180], [332, -100], [482, -20]]], { part: 'stem' }]
]);
capDef('Z', 0.4, 580, [
  [[[[80, 580], [150, 680], [330, 655], [478, 698, 5], [505, 660, -125, 0.7], [300, 360, -132], [100, 45, -128], [96, 12, -40, 0.7], [200, 45, 10], [350, 2], [500, 20], [565, 90]]], { part: 'stem' }]
]);

/* ---------- lowercase ----------
   The small letters of a joined-up hand, written as one: each starts on a hairline rising out of the
   letter before, crossing its left edge at the join height, and finishes rising out of its right edge
   the same way, so with the usual tight spacing of a script they run on into each other. b, o, v and w
   finish at their tops instead, level across their right edge at HY, and the letter after one is written
   in its 'hi' form, its join coming in level there (a dip down to the join height and up again read as one
   more stroke: an o and a v as ow); the layout picks the form (GlyphAlt in font.ts). Downstrokes
   swell under the pen, everything else is a hairline (see the pointed pen in stroke.ts). They are drawn
   with a pen (below) in x-heights (across, scaled by Width), the ascender and descender of the design
   given as A and D: bowls are true ellipses, and wherever the pen goes back over a line it has drawn
   (up an a's stem and down again, over the top of its bowl) it follows exactly the same curve, so the
   two never part into a lump. */

const rad = (a: number) => a * Math.PI / 180, deg = (a: number) => a * 180 / Math.PI;

/** where letters join: the hairline between two crosses their shared edge this high, rising this steeply */
const JY = 0.5, JA = 58;
/** where an o, a b, a v and a w join the next letter: level out of their tops at this height, the next letter (in its
    'hi' form, GlyphAlt in font.ts) taking the join up there */
const HY = 0.84;
/** room every letter keeps on its right for its join to rise out of its last downstroke */
const EX = 0.06;
/** each join runs straight for this far (in x-heights across) either side of the letter's edge, and on
    under the neighbouring letter's own join, so the two overlap along one line and neither's cut end shows */
const PAST = SCRIPT_PAST, RISE = PAST * Math.tan(rad(JA));
/** The letter being written: its stroke weight (in x-heights across), the round of a foot where a downstroke
    turns out along the baseline into the join (across and up), opened up under a heavy stroke so its inside
    never turns tighter than the stroke is wide, and how much wider that makes the letter; the Letter spacing its
    join runs on across, how much wider an x-height is across than up, and whether it is written in its 'hi' form,
    its join coming in high. Set by lower();
    Pen.out, Pen.foot and loopUp read it, so they are called only inside a letter's lower() callback. */
const hand = { t: 0.1, fx: 0.14, fy: 0.28, grow: 0, track: 0, aspect: 1, hi: false };
/** Set the hand for a stroke weight `t` and the Letter spacing the letters are set apart by, `track` (both in x-heights
    across), the x-height's `aspect` and the `hi` form: the join out of a letter runs on across that space, so it meets the next letter's join on its line however
    far apart the two are set (it stops short of turning back into the letter, where the spacing is tightest). */
const setHand = (t: number, track: number, aspect: number, hi: boolean) => {
  hand.t = t; hand.aspect = aspect; hand.hi = hi; hand.fx = Math.max(0.14, 0.02 + t * 1.1); hand.fy = Math.max(0.28, hand.fx * 1.25); hand.grow = hand.fx - 0.14;
  hand.track = Math.max(track, -0.6 * (EX + hand.grow));
};

/** A pen writing a letter's strokes as cubic curves. Each run of curves is smooth; a turn (the top of an i)
    starts the next. */
class Pen {
  runs: Cmd[][] = [];
  x = 0; y = 0;
  /** the way it is heading, in degrees (0 to the right, 90 up) */
  a = 0;
  /** start a run at (x, y), heading a */
  at(x: number, y: number, a: number) { this.runs.push([['M', x, y]]); this.x = x; this.y = y; this.a = a; return this; }
  /** turn sharply where it is to head a, starting a new run */
  turn(a: number) { return this.at(this.x, this.y, a); }
  /** on to (x, y), arriving heading a: the curve leaves along the way it was heading, times f0 and f1 as full
      (fuller over 1, flatter under). Where the way out and the way in cross ahead of both ends, it turns as a
      circle would between them, its handles that share of the way to where they cross, so it never swings out
      past either line and back (a hump overshooting its stem, an S where it should bend once); else its handles
      are a third of the way across. */
  to(x: number, y: number, a: number, f0 = 1, f1 = f0) {
    const d = Math.hypot(x - this.x, y - this.y), u0 = [Math.cos(rad(this.a)), Math.sin(rad(this.a))], u1 = [Math.cos(rad(a)), Math.sin(rad(a))];
    const den = u0[0] * u1[1] - u0[1] * u1[0], dx = x - this.x, dy = y - this.y;
    const s = (dx * u1[1] - dy * u1[0]) / den, r = (u0[0] * dy - u0[1] * dx) / den, th = Math.acos(Math.max(-1, Math.min(1, u0[0] * u1[0] + u0[1] * u1[1])));
    const k = Math.abs(den) > 0.02 && s > 0 && r > 0 && th < rad(165) ? 4 / 3 * Math.tan(th / 4) / Math.tan(th / 2) : 0;
    // (where the two ways nearly agree they cross far off: a handle reaches no further than the curve is long)
    const h0 = (k ? Math.min(s * k, d * 0.75) : d / 3) * f0, h1 = (k ? Math.min(r * k, d * 0.75) : d / 3) * f1;
    this.runs[this.runs.length - 1].push(['C', this.x + Math.cos(rad(this.a)) * h0, this.y + Math.sin(rad(this.a)) * h0,
      x - Math.cos(rad(a)) * h1, y - Math.sin(rad(a)) * h1, x, y]);
    this.x = x; this.y = y; this.a = a;
    return this;
  }
  /** straight on to (x, y) */
  line(x: number, y: number) { if (Math.hypot(x - this.x, y - this.y) < 1e-9) return this; this.a = deg(Math.atan2(y - this.y, x - this.x)); return this.to(x, y, this.a); }
  /** round the ellipse e from its angle t0 (where the pen is) to t1, counterclockwise if t1 is the greater */
  arc(e: Ellipse, t0: number, t1: number) {
    const n = Math.max(1, Math.ceil(Math.abs(t1 - t0) / 90 - 1e-9)), dt = (t1 - t0) / n, k = 4 / 3 * Math.tan(rad(dt) / 4);
    const [cx, cy, rx, ry] = e, at = (t: number) => [cx + rx * Math.cos(rad(t)), cy + ry * Math.sin(rad(t))], d = (t: number) => [-rx * Math.sin(rad(t)), ry * Math.cos(rad(t))];
    for (let i = 0; i < n; i++) {
      const ta = t0 + dt * i, tb = ta + dt, p0 = i ? at(ta) : [this.x, this.y], p1 = at(tb), d0 = d(ta), d1 = d(tb);
      this.runs[this.runs.length - 1].push(['C', p0[0] + d0[0] * k, p0[1] + d0[1] * k, p1[0] - d1[0] * k, p1[1] - d1[1] * k, p1[0], p1[1]]);
    }
    const p = at(t1), d1 = d(t1);
    this.x = p[0]; this.y = p[1]; this.a = deg(Math.atan2(d1[1] * Math.sign(dt), d1[0] * Math.sign(dt)));
    return this;
  }
  /** on to the point at angle t on ellipse e, arriving along it, going round counterclockwise (ccw) or clockwise */
  onto(e: Ellipse, t: number, ccw: boolean, f0 = 1, f1 = f0) { const [x, y] = onE(e, t); return this.to(x, y, headE(e, t, ccw), f0, f1); }
  /** the join out of the right edge of a letter W wide, rising into it from where the pen is */
  out(W: number, f0 = 1, f1 = f0) { const x = W + hand.grow + EX + hand.track; return this.to(x - PAST, JY - RISE, JA, f0, f1).line(x + PAST, JY + RISE); }
  /** down a stem at x, round the foot and out into the join */
  foot(x: number, W: number, tight = 1) {
    // (from no higher than the pen already is: running back up into the foot, the stroke would fold over on itself)
    const fx = hand.fx * tight, fy = Math.min(hand.fy * tight, this.y);
    return this.line(x, fy).arc([x + fx, fy, fx, fy], 180, 270).out(W);
  }
}

/** An ellipse: centre and radii across and up. */
type Ellipse = [number, number, number, number];
const onE = (e: Ellipse, t: number) => [e[0] + e[2] * Math.cos(rad(t)), e[1] + e[3] * Math.sin(rad(t))];
/** the way round ellipse e at angle t, counterclockwise or not */
const headE = (e: Ellipse, t: number, ccw: boolean) => deg(Math.atan2(e[3] * Math.cos(rad(t)) * (ccw ? 1 : -1), -e[2] * Math.sin(rad(t)) * (ccw ? 1 : -1)));

/** a letter's start: the join rising in across its left edge */
const enter = () => hand.hi ? new Pen().at(-PAST, HY, 0).line(PAST, HY) : new Pen().at(-PAST, JY - RISE, JA).line(PAST, JY + RISE);

/** The bowl of a, c, d, g, o and q, x-height tall: the join rises into it at its top left, running on over
    the top (clockwise) to its top right, where the pen turns back to write it counterclockwise, over that
    same curve again, down its left side and round, to angle t1. Returns the pen, there, to write on. */
function bowl(cx: number, rx: number, t1: number, top = 58) {
  const e: Ellipse = [cx, 0.5, rx, 0.5];
  // (coming in high, it meets the bowl further over its top)
  const t0 = hand.hi ? 122 : 148;
  return enter().onto(e, t0, false, 1.3, 1).arc(e, t0, top).turn(headE(e, top, true)).arc(e, top, t1);
}
/** after a bowl ending at its right side: straight up to y, and back down the same line */
const stemUp = (p: Pen, x: number, y: number) => p.line(x, y).turn(-90);

/** A looped ascender: the join rises across the stem at x as high as `cross`, on up the stem's right side, `w`
    wide, and over the top of the loop at A, turning down into the stem. It crosses well under the x-height, as a pen
    writes it (an h's and a k's a little higher, over the arch the stem branches into low down), and lower still where
    the ascender is too short to leave the loop room for its counter to show under the stroke. (Crossing over the
    x-height, a short ascender's loop sat on the h like a hat, or, with no room at all, stood as a spike.) */
const loopUp = (x: number, A: number, w: number, cross = 0.68) => {
  // (a join coming in high crosses the stem no lower than it comes in)
  const y0 = hand.hi ? HY : JY + RISE, c = Math.max(Math.min(cross, A - 0.25 - hand.t), hand.hi ? HY + 0.02 : 0);
  const f = c + (A - c) * 0.42, a = (deg(Math.atan2(c - y0, x - PAST)) + deg(Math.atan2(f - c, w * 0.9))) / 2;
  // (two strokes, as the loop's turned-back spike was, so a letter's own values stay on their strokes: parted where
  // the join crosses the stem, in the stem's ink, as two round ends running on along one line leave a notch between)
  return enter().to(x, c, a, 1.1, 1).turn(a).to(x + w * 0.9, f, 88, 1, 1).to(x + w * 0.4, A, 180, 1).to(x, f, -90, 1).line(x, Math.min(0.6, c));
};

/** How tall half a loop `w` wide below the baseline is: 0.3 of the x-height, taller where its sides would otherwise
    turn tighter than half the stroke is wide (a heavy, narrow design), whose inside would fold over into a spike. */
const loopRy = (w: number) => Math.max(0.3, hand.aspect * Math.sqrt(0.8 * hand.t * w / 2));

/** A looped descender down from the stem at x to D: round to the left `w` wide and back up across the
    stem into the join. */
const loopDown = (p: Pen, x: number, D: number, w: number, W: number) => {
  // (from no higher than the pen already is, as a foot: a z's stroke comes down into it from the baseline)
  const ry = loopRy(w), cy = Math.min(D + ry, p.y);
  return p.line(x, cy).arc([x - w / 2, cy, w / 2, ry], 0, -180).out(W, 1.6, 1.1);
};

/** A loop below the baseline on the right of the stem at x (f, q), closing on the stem at the baseline, then
    out into the join. */
const loopRight = (p: Pen, x: number, D: number, w: number, W: number) => {
  const ry = loopRy(w), cy = Math.min(D + ry, p.y);
  return p.line(x, cy).arc([x + w / 2, cy, w / 2, ry], 180, 360).to(x + 0.03, 0.08, 150, 1.2, 1.1).turn(-30).out(W, 1.1);
};

/** The tie of an o or a b: closed at its top, the pen turns sharply back to the right and on into its high join.
    (Looped back on itself as a fine pen ties it, a loop as small as the letter has room for fills in under any but the
    finest stroke, a knot.) */
const tie = (p: Pen, W: number) => bridge(p.turn(-4), W);
/** A high join out of the right edge of a letter W wide: on along and down a little to HY, and level across the edge,
    where the next letter's 'hi' form takes it up (or, at the end of a word, it stops). */
const bridge = (p: Pen, W: number) => { const x = W + hand.grow + EX + hand.track; return p.to(x - PAST, HY, 0, 1, 1.2).line(x + PAST, HY); };

/** The start of an n, an m, an r or an x: the join rises on over a small turn at the x-height into the stem at xr (a
    full first arch, narrower than the next, read as a hook). */
const arch0 = (p: Pen, xr: number) => p.to(xr - 0.07, 0.9, 72, 1.1, 1).to(xr - 0.02, 1.01, 20, 1).to(xr, 0.86, -90, 1);
/** A middle arch of an m, up out of the stem at x and down to the baseline at xr, turning back up there. */
const archMid = (p: Pen, x: number, xr: number) => over(p, x, xr, 0.42).line(xr, 0).turn(90);

/** An arch up out of the stem at x, branching off it at `from`, over to its right side at xr, and down into a foot. */
const arch = (p: Pen, x: number, xr: number, W: number, from = 0.42) => over(p, x, xr, from).foot(xr, W);
/** Back up the stem at x and off it at `from`, round over the top and down to the right side at xr: the way off the
    stem leaves it soon, so the arch turns round over its top rather than standing square on the stem. */
const over = (p: Pen, x: number, xr: number, from: number) =>
  p.line(x, from).to(x + (xr - x) * 0.5, 1, 0, 0.55, 1.3).to(xr, 0.55, -90, 1.15, 1);

type Lower = (A: number, D: number, t: number) => [Pen, StrokeOpts][];

/** A small letter `Wn` wide (in x-heights across, before the room its join takes) and its strokes, with the dot over
    an i or a j and the ball a stroke ends in (an r's shoulder), each where it sits; `high` where its join leaves it high
    (GlyphMeta.exitHigh). Each is registered twice: as it is, its join coming in from low down, and in its 'hi' form,
    the join coming in level at HY, for after a letter whose join leaves it high. */
function lower(ch: string, Wn: number, strokes: Lower, more: { dot?: XY; ball?: XY; high?: true } = {}) {
  const draw = (hi: boolean) => (g: Builder, m: Metrics) => {
    // across, an x-height a unit (as Width sets it), widened as the strokes get heavier so the counters stay open
    const sx = scriptAcross(m), sy = m.xh, A = m.asc / m.xh, D = m.desc / m.xh;
    setHand(m.s / sx, m.track / sx, sx / sy, hi);
    const W = (Wn + hand.grow + EX) * sx;
    const sc = (c: Cmd): Cmd => c[0] === 'M' ? ['M', c[1] * sx, c[2] * sy] : ['C', c[1] * sx, c[2] * sy, c[3] * sx, c[4] * sy, c[5] * sx, c[6] * sy];
    for (const [p, o] of strokes(A, D, m.s / sx)) drawRuns(g, m, p.runs.map(r => r.map(sc)), { pen: 'pointed', s: 'flat', e: 'flat', ...o });
    const { dot, ball } = more;
    if (dot) g.dot(dot[0] * sx, dot[1] * sy, m.s * 1.1);
    // (round whatever shape the dots are, a drop the pen leaves where it lifts off: a little heavier than the stroke)
    if (ball) { const h = Math.max(m.s * 0.58, m.ctx.thin * 0.9), x = ball[0] * sx, y = ball[1] * sy;
      g.strokes.push({ poly: [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]].map(([px, py]) => ({ x: px, y: py, r: h })), o: { part: 'dot' } }); }
    // the joins reaching past the edges are the neighbours' to share, not room to make
    g.reachL = 0; g.reachR = W;
    g.joins = [[0, (hi ? HY : JY) * sy], [W + hand.track * sx, (more.high ? HY : JY) * sy]];
    return W;
  };
  const meta = { params: SCRIPT_PARAMS, joined: true as const, ...(more.high && { exitHigh: true as const }) };
  def(scriptId(ch), [0, 0], draw(false), meta);
  def(altId(scriptId(ch), 'hi'), [0, 0], draw(true), meta);
}

/** how wide a loop is: open enough for its counter to show under a heavy stroke */
const loopW = (t: number) => Math.max(0.2, 0.06 + t * 1.5);

const O_CX = 0.4, O_RX = 0.26, O_X = O_CX + O_RX;

lower('a', 0.95, () => { const pen = bowl(O_CX, O_RX, 360); return [[stemUp(pen, O_X, 1).foot(O_X, 0.95), { part: 'bowl' }]]; });
// (its bowl closed round to the top, tied there as an o's: up its right side and hooked over, a v's way, it stood open
// and read as an l and a v)
lower('b', 0.86, (A, D, t) => { const e: Ellipse = [0.42, 0.5, 0.2, 0.5];
  return [[tie(loopUp(0.22, A, loopW(t)).line(0.22, 0.5).arc(e, 180, 450), 0.86), { part: 'stem' }]]; }, { high: true });
lower('c', 0.68, () => [[bowl(0.38, 0.24, 300, 50).out(0.68, 1.2), { part: 'bowl' }]]);
lower('d', 0.95, A => { const pen = bowl(O_CX, O_RX, 360); return [[stemUp(pen, O_X, A).foot(O_X, 0.95), { part: 'bowl' }]]; });
// (its eye opened up, crossing lower and reaching further, under a heavy stroke)
lower('e', 0.66, (A, D, t) => { const k = Math.max(0, t - 0.1);
  return [[enter().to(0.4 + k * 0.3, 0.66 - k * 0.8, 38, 1.2, 1).to(0.48 + k * 0.5, 0.88 - k * 0.3, 105).to(0.32, 1, 180, 1).to(0.1, 0.52, -90, 1.1).to(0.34, 0, 0, 1.1).out(0.66, 1.1), { part: 'bowl' }]]; });
lower('f', 0.62, (A, D, t) => [[loopRight(loopUp(0.22, A, loopW(t)), 0.22, D, loopW(t), 0.62), { part: 'stem' }]]);
lower('g', 0.95, (A, D, t) => { const pen = bowl(O_CX, O_RX, 360); return [[loopDown(stemUp(pen, O_X, 1), O_X, D, loopW(t), 0.95), { part: 'bowl' }]]; });
lower('h', 0.92, (A, D, t) => [[arch(loopUp(0.22, A, loopW(t), 0.8).line(0.22, 0).turn(90), 0.22, 0.62, 0.92, 0.3), { part: 'stem' }]]);
lower('i', 0.53, () => [[enter().to(0.24, 1, 78, 1.2, 1).turn(-90).foot(0.24, 0.53), { part: 'stem' }]], { dot: [0.3, 1.42] });
lower('j', 0.5, (A, D, t) => [[loopDown(enter().to(0.28, 1, 78, 1.2, 1).turn(-90), 0.28, D, loopW(t), 0.5), { part: 'stem' }]], { dot: [0.34, 1.42] });
lower('k', 0.86, (A, D, t) => [[loopUp(0.22, A, loopW(t), 0.84).line(0.22, 0).turn(90).line(0.22, 0.32).to(0.44, 0.86, 10, 1.1).to(0.58, 0.7, -110, 1)
  .to(0.36, 0.46, 200, 1.1).turn(-12).to(0.56, 0.3, -90, 1.25).foot(0.56, 0.86), { part: 'stem' }]]);
lower('l', 0.51, (A, D, t) => [[loopUp(0.22, A, loopW(t)).foot(0.22, 0.51), { part: 'stem' }]]);
lower('m', 1.22, () => [[arch(archMid(arch0(enter(), 0.26).line(0.26, 0).turn(90), 0.26, 0.6), 0.6, 0.94, 1.22), { part: 'stem' }]]);
lower('n', 0.92, () => [[arch(arch0(enter(), 0.26).line(0.26, 0).turn(90), 0.26, 0.64, 0.92), { part: 'stem' }]]);
lower('o', 0.86, () => [[tie(bowl(0.36, 0.26, 450), 0.86), { part: 'bowl' }]], { high: true });
lower('p', 0.76, (A, D) => { const e: Ellipse = [0.43, 0.5, 0.21, 0.5];
  return [[enter().to(0.22, 1.08, 78, 1.2, 1).turn(-90).line(0.22, D).turn(90).line(0.22, 0.5).arc(e, 180, -150).turn(headE(e, -150, true)).arc(e, -150, -40).out(0.76, 1.1), { part: 'stem' }]]; });
lower('q', 0.95, (A, D, t) => { const pen = bowl(O_CX, O_RX, 360); return [[loopRight(stemUp(pen, O_X, 1), O_X, D, loopW(t), 0.95), { part: 'bowl' }]]; });
// (over into its stem as an n starts, straight down it and out of its foot into the join, its shoulder a stroke of its
// own out of the stem, over and down a little to a lifted end: the school hand's flat top, its corners round under the
// pen, read as a ɼ, a copperplate r's notch at the top as a v, a shoulder running on into the join, after a high exit
// (an o's), as a v too, and a foot curling into the join under the shoulder as a c)
lower('r', 0.74, () => [[arch0(enter(), 0.26).line(0.26, 0), { part: 'stem' }], [new Pen().at(0.26, 0, 34).out(0.74, 1.2, 1), { part: 'stem' }],
  [new Pen().at(0.26, 0.66, 66).to(0.42, 0.98, 4, 1, 1).to(0.52, 0.9, -50, 1), { part: 'stem', e: T }]], { ball: [0.53, 0.9] });
// (its foot curls up on the left and lifts off, and the join runs out of the bottom of the curve on a
// hairline of its own: turning straight back out of the curl would leave a spur at its tip; coming in high, the join
// dips first and rises to its point as from low down, the rise its back: level on into the point, it read as a ɔ)
lower('s', 0.64, () => [[(hand.hi ? enter().to(0.12, 0.6, -70, 1, 0.8).to(0.3, 1.05, 74, 0.8, 1) : enter().to(0.3, 1.05, 74, 1.2, 1)).turn(-50).to(0.5, 0.42, -90, 1.1).to(0.32, 0, 180, 1.1).to(0.12, 0.2, 110, 1), { part: 'stem', e: T }],
  [new Pen().at(0.3, 0, 0).out(0.64), { part: 'stem' }]]);
lower('t', 0.56, () => [[enter().to(0.26, 1.45, 80, 1.2, 1).turn(-90).foot(0.26, 0.56), { part: 'stem' }], [new Pen().at(0.06, 0.95, 4).to(0.52, 0.98, 4), { part: 'crossbar', s: T, e: T }]]);
lower('u', 0.92, () => { const e: Ellipse = [0.43, 0.5, 0.19, 0.5];
  return [[enter().to(0.24, 1, 78, 1.2, 1).turn(-90).line(0.24, 0.5).arc(e, 180, 360).line(0.62, 1).turn(-90).foot(0.62, 0.92), { part: 'stem' }]]; });
// (each down to a point at the baseline, round under the pen, and up again: round as a u's, a v read as a u, and a w
// as uu)
const vee = (p: Pen, xb: number, xr: number) => p.turn(-76).to(xb, 0, 0, 1, 0.45).to(xr, 0.96, 78, 0.45, 1);
/** The end of a v's or a w's arm, up at its top: hooked over to the right and on along into the join, in one
    movement (turned back sharply, as an o's tie is, a knot at its top read as an r's shoulder) */
const hook = (p: Pen, W: number) => bridge(p.to(p.x + 0.07, 1.01, 8, 1, 1), W);
lower('v', 0.84, () => [[hook(vee(enter().to(0.2, 1, 78, 1.2, 1), 0.39, 0.6), 0.84), { part: 'stem' }]], { high: true });
lower('w', 1.14, () => [[hook(vee(vee(enter().to(0.2, 1, 78, 1.2, 1), 0.36, 0.53), 0.71, 0.9), 1.14), { part: 'stem' }]], { high: true });
lower('x', 0.84, () => [[arch0(enter(), 0.4).to(0.46, 0.24, -80, 1).to(0.6, 0, 0, 1).out(0.84), { part: 'stem' }], [new Pen().at(0.16, 0.04, 50).line(0.74, 0.96), { part: 'arm', s: T, e: T }]]);
lower('y', 0.92, (A, D, t) => { const e: Ellipse = [0.43, 0.5, 0.19, 0.5];
  return [[loopDown(enter().to(0.24, 1, 78, 1.2, 1).turn(-90).line(0.24, 0.5).arc(e, 180, 360).line(0.62, 1).turn(-90), 0.62, D, loopW(t), 0.92), { part: 'stem' }]]; });
lower('z', 0.8, (A, D, t) => [[loopDown(enter().to(0.16, 0.84, 74, 1.2, 1).to(0.34, 1, 0, 1).to(0.52, 0.84, -70, 1).to(0.36, 0.54, 200, 1).turn(-25).to(0.54, 0.3, -88, 1.1).to(0.46, 0, -100, 1), 0.46, D, loopW(t), 0.8), { part: 'stem' }]]);
