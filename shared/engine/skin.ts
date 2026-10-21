/* A free font's letters moved by the settings as the engine's own letters are (see freeLetters in
   free-letters.ts): each letter's outline is hung on its skeleton, the middle line of its strokes, and the
   settings move the skeleton and thicken or thin the strokes round it by the engine's own measures
   (Metrics), so Weight 70 is as much heavier on a free font as on a built one. Unmoved, a letter is
   the font's exactly (its overlapping pieces made one, the same ink).

   The rig: the outline, its overlapping pieces united, is sampled every few units; each sample's inward
   normal is followed to the ridge of the distance to the paper (the skeleton), and the stroke's thickness
   there is read across it; where the outline turns back across a stroke, that is the stroke's end. Moving:
   the strokes' middles go where the heights, the width and the crossbar put them, each edge moves out (or
   in) by its stroke's change of thickness, corners sit where their two edges meet again, each end goes
   with the two sides it joins, the letter is put back to its heights (bolder letters keep their x-height
   and capitals, as the engine's do), and the samples are traced back into curves. */
import type { Params } from '../params';
import { counterScale, serifLen, type Metrics } from './font';
import type { FreeFont } from './free';
import { fitOutline, type Node } from './outline';
import { signedArea } from './geom';
import { combine, shape, unite } from './boolean';
import { contours } from './effects';
import { FREE_FAMILIES } from '../free-fonts';
import { HOOK_LETTERS, OPEN_LETTERS, PEAK_LETTERS, added, bowlStem, hasPeaks, hasTerminals } from './restyle';
import { FLUSH, lineSkeleton, type Flush } from './lines';
import { slabsOf, type Slab } from './slabs';
import { alongFrom, bez, branchNode, branches, endFace, inkAt, inkGrid, joinsOf, leaving, nearestOn, roundTip, skeleton, type Branch, type Grid, type Skeleton, type SkNode, type SkPt } from './scan';

type P = { x: number; y: number };

/* ---- the letter's ink on a grid of one unit a cell (inkGrid(cs, 1), scan.ts), read: these take a cell to
   be one unit, and find a point's cell in their own order of sums, which the rig is fitted to (scan.ts's
   inkAt, summing the other way, can put a point right on a cell's edge in the next cell) */

/** The distance to the paper at a point, read between the cells. */
function dist(f: Grid, x: number, y: number) {
  const c = x - f.x0 - 0.5, r = f.y0 + f.H - y - 0.5, c0 = Math.floor(c), r0 = Math.floor(r);
  if (c0 < 0 || r0 < 0 || c0 + 1 >= f.W || r0 + 1 >= f.H) return 0;
  const a = c - c0, b = r - r0, g = f.dt, W = f.W;
  return (g[r0 * W + c0] * (1 - a) + g[r0 * W + c0 + 1] * a) * (1 - b) + (g[(r0 + 1) * W + c0] * (1 - a) + g[(r0 + 1) * W + c0 + 1] * a) * b;
}
/** Whether the cell under a point is inked. */
const inked = (f: Grid, x: number, y: number) => {
  const c = Math.floor(x - f.x0), r = Math.floor(f.y0 + f.H - y);
  return c >= 0 && r >= 0 && c < f.W && r < f.H && f.ink[r * f.W + c] > 0;
};
/** How far from (x, y) the way (dx, dy) runs across the paper to ink again, read every 2 units from 2 out (Infinity
    where it meets none within `max`, or leaves the letter's grid). */
function march(f: Grid, x: number, y: number, dx: number, dy: number, max: number) {
  for (let t = 2; t < max; t += 2) {
    const c = Math.floor(x + dx * t - f.x0), r = Math.floor(f.y0 + f.H - (y + dy * t));
    if (c < 0 || r < 0 || c >= f.W || r >= f.H) return Infinity;
    if (f.ink[r * f.W + c] > 0) return t;
  }
  return Infinity;
}
const rowsRead = new WeakMap<Grid, Map<number, [number, number][]>>();
/** The ink along a row at height y: [left, right] pairs (read once a row, and kept with the grid: the serifs' tests ask
    the same rows over and over). Never changed by a caller. */
function runs(f: Grid, y: number): [number, number][] {
  const r = Math.floor(f.y0 + f.H - y);
  let kept = rowsRead.get(f);
  if (!kept) { kept = new Map(); rowsRead.set(f, kept); }
  const had = kept.get(r);
  if (had) return had;
  const out: [number, number][] = [];
  kept.set(r, out);
  if (r < 0 || r >= f.H) return out;
  let s = -1;
  for (let c = 0; c <= f.W; c++) {
    const v = c < f.W && f.ink[r * f.W + c] > 0;
    if (v && s < 0) s = c;
    if (!v && s >= 0) { out.push([s + f.x0, c + f.x0]); s = -1; }
  }
  return out;
}
/** The ink down a column at x: [bottom, top] pairs. */
function columnRuns(f: Grid, x: number): [number, number][] {
  const c = Math.floor(x - f.x0), out: [number, number][] = [];
  if (c < 0 || c >= f.W) return out;
  let s: number | null = null;
  for (let r = f.H - 1; r >= -1; r--) {
    const v = r >= 0 && f.ink[r * f.W + c] > 0, y = f.y0 + f.H - r - 1;
    if (v && s === null) s = y;
    if (!v && s !== null) { out.push([s, y]); s = null; }
  }
  return out;
}

/* ---- the rig */

/** Whether point p is inside polygon o (even-odd): geom.ts's inPoly with its sums taken in another order, so the two
    can disagree about a point right on an edge. */
function inPoly(o: P[], p: P) {
  let k = false;
  for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
    const a = o[i], b = o[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + (p.y - a.y) / (b.y - a.y) * (b.x - a.x)) k = !k;
  }
  return k;
}

interface Bone {
  x: number; y: number;
  /** the inward normal, and the edge's direction */ nx: number; ny: number; tx: number; ty: number;
  /** a corner, and its edges' directions in and out */ corner: boolean; inx?: number; iny?: number; outx?: number; outy?: number;
  /** the skeleton point the normal reaches, and its distance to the paper there (about half the stroke's thickness) */ ax: number; ay: number; best: number;
  /** the way the stroke runs at the skeleton point */ dx: number; dy: number;
  /** half the thickness of the stroke this edge belongs to, and as read across from it, joins and all (see
      thicknessWithoutJoins) */ w: number; w0: number;
  /** how far past its stem's edge a serif's point reaches (0 off a serif); and on a serif, how thick its stem is and
      how far the paper reaches out from the stem's edge on that side (Infinity outside the letter), and how far the serif
      reaches past the stem along this point's row */ serifDx: number; serifStem: number; serifRoom: number; serifReach: number;
  /** how far past its stem's edge a head serif drawn as a flag reaches, its stroke's ink at its line no wider than the
      stem and widening out beside it below (an old style's l's, n's and i's wedge; 0 off one, and on a serif serifDx
      takes): read for a heavier weight's serifs only, which slide out with their stem (edgeMoves) */ flagDx: number;
  /** on a stem's end at a line, facing off it, how far across the stem from its left edge to its right (0 to 1; -1 off
      one): a heavier weight's head drawn across its stem again as it widens (edgeMoves) */ overStem: number;
  /** how far the paper reaches out from the edge to ink again (across a counter or between two strokes), Infinity on
      the outside of the letter */ gap: number;
  /** which segment of the outline it's on, and whether that is straight */ seg: number; straight: boolean;
  /** on a straight level edge on one of the lines */ onLine: boolean;
  /** on a stroke's end, cut across it; and of that, an end on a line (a stem's foot) */ cap: boolean; lineCap: boolean;
  /** on a dot (of i, j, a full stop) */ dot: boolean;
}

/** The letter's heights, its bar's height if it has one that Crossbar moves, and its case. */
interface Ctx { cap: number; xh: number; asc: number; desc: number; barY: number | null; lower: boolean; ch: string }
/** A free font's letter rigged (skinRig). Its contours are the font's own outline, its overlapping pieces made one
    (unite in boolean.ts: the same ink and curves, without the edges inside it), and never change: skinMove hands
    back that same array when no setting moves the letter, and free-letters.ts reads the sameness (reusing the rig's
    skeleton for it, and keeping its restyled outlines by the array). sk, squareEnds and near are filled in when first
    asked for and describe those contours only; the outlines kept in moves are handed out too, so nothing changes them
    in place either. */
export interface SkinRig {
  contours: Node[][];
  /** each sample of the outline read across its stroke, contour by contour */ bones: Bone[][]; ctx: Ctx;
  /** each contour's stroke ends (strokeEnds) */ ends: EndRun[][];
  /** whether it has serifs that Serif size moves */ serifs: boolean;
  /** how thick its upright strokes are, and its level ones, as a share of the capitals' height */ stem: number; bar: number;
  /** its level ones as read straight across, before the bumps where strokes join are taken out (thicknessWithoutJoins),
      which in a heavy sans takes out most of a bar: the corners either end wear it down to half (Mainline's H's bar, 117
      units, read 61) */ bar0: number;
  /** the font it is a letter of */ font: RigLetters;
  /** the font's own stem and hairline (its n's stems and its H's bar), in its units: how much contrast the font is drawn with;
      and the hairline read straight across (bar0), which a heavier weight takes it by */ ref: () => { stem: number; hair: number; hair0: number };
  /** whether the font stands its stems on serifs (fontSerifed) */ serifed: () => boolean;
  /** whether the font is drawn in heavy strokes ending round, about as thick as each other, and no serifs
      (fontStroked): 1 at every lighter weight, 2 from STROKED_UNDER down, 0 not */ stroked: () => 0 | 1 | 2;
  /** whether the font's slabs are short blocks, a wood type's (fontSlabbed) */ shortSlabs: () => boolean;
  /** whether the font's upright strokes lean, without serifs: a script's (fontLeans) */ leans: () => boolean;
  /** the last ways it was moved (MOVES_KEPT of them), by the measures it was moved from and to (dragging a slider back
      and forth) */ moves: Map<string, Node[][]>;
  /** its skeleton, scanned when a setting first needs it (see scan.ts) */ sk?: Skeleton;
  /** its skeleton as a lighter weight draws it again, with its short strokes run on through their joins (thinSkeleton) */ thinSk?: Skeleton;
  /** whether a stroke of it ends square across, where the engine's serifs could stand (see restyleSerifs) */ squareEnds?: boolean;
  /** whether it has a peak Peaks reshapes (rigPeaks) */ peaks?: boolean;
  /** how near each edge's stroke is to where it runs into another, from 1 there to 0 a little way off (see joinsNear) */ near?: number[][];
  /** each sample's stroke read off the skeleton, for a lighter weight (see thinReads) */ thin?: ThinReads;
  /** itself with its strokes ending round kept in its lighter weight's skeleton, for a letter that breaks without them
      (see moveRig), or null where they make no difference */ round?: SkinRig | null;
  /** itself with its serifs' feet drawn level in its lighter weight's skeleton (withFeet), its thin serifs' and its
      slabs', for the lighter weights (see moveRig), or null where it has none; and which it is */ footed?: SkinRig | null; slabbed?: SkinRig | null; feet?: number;
  /** its lighter weight's skeleton before any feet are drawn level (plainSkeleton) */ plainSk?: Skeleton;
  /** itself on a skeleton read along its straight strokes, a letter of them in a font without serifs, for its lighter
      weights (see moveRig), or null where it isn't one */ lined?: SkinRig | null;
  /** itself without its slabs, rigged, and the slabs (slabRig), or null where it has none; and whether it is that */
  unslabbed?: { rig: SkinRig; slabs: Slab[] } | null;
  /** where it is that, the slabs taken off, which its lighter weights lay back over it (movedOnce) */ slabless?: Slab[];
  /** itself with its nubs taken out, rigged (nublessRig), for its heavier weights, or null where it has none */ nubless?: SkinRig | null;
  /** itself with its serifs read off the ink nearest its lines (serifLinedRig), for its heavier weights, or null where that
      reads no more of them */ serifLined?: SkinRig | null;
  /** whether it is that */ cupped?: boolean;
}

/** how far apart the outline is sampled, in the font's units (1000 to the em) */
const STEP = 5;
/** How far from a line a serif's points are looked for, as a share of the capitals' height: as tall as a wood type's
    slab. */
const SERIF_ZONE = 0.2;
/** The side of the smallest ink or counter a moved letter keeps, as a share of its capitals' height: anything smaller is
    a speck pinched off, not drawn (a full stop is about a tenth). */
const SPECK = 0.03;
/** The most of a counter's width (or the room between two strokes) an edge grows into as a letter gets heavier: with
    both its sides grown, a counter keeps two fifths of its width. */
const OPEN = 0.3;
/** And a heavier weight's (edgeMoves, moveRing), into paper OPEN_WIDE times as wide as its stroke or more: its counters
    keep three fifths of their width, as a Black's do, its stems taking less of their weight beside them; into paper as
    wide as its stroke or less, OPEN, and between the two between, so a crack between two strokes, a w's between its
    middle strokes, still grows shut (held to OPEN_HEAVY too, a pocket of paper shut in under the w's middle top). Held
    to OPEN, a comic's n's, o's and e's counters at Weight 100 were slits between stems three times as thick, an old
    style's B's and R's all but shut at Weight and Verticals 100. */
const OPEN_HEAVY = 0.2, OPEN_WIDE = 2;
/** How far a heavier weight's edge grows into `gap` of paper before it, its stroke `w` half as thick (OPEN_HEAVY). */
const openOf = (gap: number, w: number) => { const t = w > 0 ? Math.min(1, Math.max(0, (gap / (2 * w) - 1) / (OPEN_WIDE - 1))) : 1; return gap * (OPEN + (OPEN_HEAVY - OPEN) * t); };
/** A straight edge shorter than this share of the capitals' height (a step a join or a trace leaves) is moved as part of
    the curves either side of it, not as an edge of its own (skinEdges). */
const SHORT_EDGE = 0.04;
/** How much further than its own stroke thins or thickens a point on a round may go with the edges either side of it
    (skinEdges), as a share of its stroke's half-thickness. */
const HOLD = 0.3;
/** The most of the ink before it, the way it moves, a corner goes into as the edges either side of it move (skinEdges):
    a little under half, as the outline across from it may come as far. */
const CORNER_IN = 0.49;
/** The least share of its size a round on the outside of a corner keeps as the edges either side move in (skinEdges). */
const ROUND_KEPT = 0.1;
/** How long a curve skinEdges moves in one piece, as a share of the capitals' height: a longer one is cut in pieces, so
    a point along it can be held back where its ink is thin. */
const LONG_CURVE = 0.08;
/** At how many places along a slanted edge skinEdges tries bending or stepping the line it moves along. */
const BEND_TRIES = 24;
/** how many of the latest ways a rig was moved it keeps (SkinRig.moves) */
const MOVES_KEPT = 6;
/** an anchor whose way in and way out part by more than 30° is a corner */
const CORNER = Math.cos(30 * Math.PI / 180);

/** A point of the outline as sampled, before it is read across its stroke (readSample). */
type Sample = Pick<Bone, 'x' | 'y' | 'tx' | 'ty' | 'corner' | 'inx' | 'iny' | 'outx' | 'outy' | 'seg' | 'straight'>;

/** The outline's samples, evenly along its length (a curve's parameter bunches its points where its handles are short). */
function samples(c: Node[]) {
  const out: Sample[] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], z = c[(i - 1 + c.length) % c.length];
    const ts = [0], ls = [0]; let q = bez(a, b, 0);
    for (let k = 1; k <= 64; k++) { const r = bez(a, b, k / 64); ls.push(ls[k - 1] + Math.hypot(r.x - q.x, r.y - q.y)); ts.push(k / 64); q = r; }
    const len = ls[64], n = Math.max(2, Math.ceil(len / STEP)), straight = a.ox === undefined && b.ix === undefined;
    const tAt = (d: number) => { let j = 1; while (j < 64 && ls[j] < d) j++; return ts[j - 1] + (ts[j] - ts[j - 1]) * (d - ls[j - 1]) / ((ls[j] - ls[j - 1]) || 1); };
    for (let k = 0; k < n; k++) {
      const t = tAt(len * k / n), p = bez(a, b, t);
      if (k === 0) {
        // the anchor: between the way in and the way out, a corner where they part
        const pi = bez(z, a, 0.995), po = bez(a, b, 0.005);
        const ux = a.x - pi.x, uy = a.y - pi.y, vx = po.x - a.x, vy = po.y - a.y, lu = Math.hypot(ux, uy) || 1, lv = Math.hypot(vx, vy) || 1;
        let tx = ux / lu + vx / lv, ty = uy / lu + vy / lv;
        if (Math.hypot(tx, ty) < 1e-6) { tx = vx; ty = vy; }
        const l = Math.hypot(tx, ty) || 1;
        out.push({ x: p.x, y: p.y, tx: tx / l, ty: ty / l, corner: (ux * vx + uy * vy) / (lu * lv) < CORNER, inx: ux / lu, iny: uy / lu, outx: vx / lv, outy: vy / lv, seg: i, straight });
        continue;
      }
      const q0 = bez(a, b, t - 0.002), q1 = bez(a, b, t + 0.002), l = Math.hypot(q1.x - q0.x, q1.y - q0.y) || 1;
      out.push({ x: p.x, y: p.y, tx: (q1.x - q0.x) / l, ty: (q1.y - q0.y) / l, corner: false, seg: i, straight });
    }
  }
  return out;
}

/** Bumps narrower than r samples taken out: the least nearby, then the most of those. */
function opening(v: number[], r: number) {
  // (round the contour however far r reaches: a speck a font left in a letter has fewer samples than r)
  const n = v.length, at = (i: number) => ((i % n) + n) % n;
  const lo = v.map((_, i) => { let m = Infinity; for (let k = -r; k <= r; k++) m = Math.min(m, v[at(i + k)]); return m; });
  return lo.map((_, i) => { let m = -Infinity; for (let k = -r; k <= r; k++) m = Math.max(m, lo[at(i + k)]); return m; });
}

/** Whether a stem's side stands on a thick slab, kept with the letter's grid (see serifReach). */
const slabs = new WeakMap<Grid, Map<string, boolean>>();
/** How far down from its line, as a share of the capitals' height, a head serif drawn as a flag is looked for its top
    over its stem (serifReach). */
const FLAG_TOP = 0.05;
/** How far past its stroke's edge the point (x, y) reaches on a serif, where a straight stroke (a stem, or a leg
    slanting in to the line, an A's or an x's) ends on line L (0 off a serif); with the stroke's thickness, and how far
    the paper reaches out from its edge on the serif's side, a little way up from the serif (Infinity outside). */
function serifReach(f: Grid, x: number, y: number, nx: number, ny: number, L: number, cap: number, near = 0): { dx: number; stem: number; room: number; reach: number; flag?: boolean; over?: number } {
  // a stroke: straight, as wide at three heights and its edges in line, as a round letter's sides never are
  // (read nearer the line where the strokes meet one another soon after it, as an x's do)
  const dir = L > cap * 0.2 ? -1 : 1, tol = cap * 0.012;
  let end: { dx: number; stem: number; room: number; reach: number; over: number } | undefined;
  // (or further up, over a slab as tall as a wood type's)
  for (const ks of [[0.14, 0.22, 0.3], [0.1, 0.14, 0.18], [0.22, 0.3, 0.38]]) {
  const hs = ks.map(k => L + dir * cap * k), [r1, r2, r3] = hs.map(h => runs(f, h));
  for (const a of r1) for (const b of r2) for (const c of r3) {
    const w = a[1] - a[0];
    if (w > cap * 0.35 || Math.abs(b[1] - b[0] - w) > tol || Math.abs(c[1] - c[0] - w) > tol) continue;
    const s1 = (b[0] - a[0]) / (hs[1] - hs[0]), s2 = (c[0] - b[0]) / (hs[2] - hs[1]);
    if (Math.abs(s1 - s2) > 0.12 || Math.abs(s1) > 2.5) continue;
    // its edges, carried on down (or up) to the line
    const e0 = (h: number) => a[0] + s1 * (h - hs[0]), e1 = (h: number) => a[1] + s1 * (h - hs[0]);
    // ending at the line: one running on past it (t and f through their bars) has no serif there
    const past = L - dir * cap * 0.06;
    if (runs(f, past).some(r => r[0] < e1(past) - 2 && r[1] > e0(past) + 2)) continue;
    // the ink the point is on, along its row, is the stroke's own and ends within a serif's reach of it
    const qx = x + nx * 1.5, qy = y + ny * 1.5;
    let row = runs(f, qy).find(r => r[0] <= qx + 1 && r[1] >= qx - 1);
    // (or, read `near` the line, along the first row further in where it reaches the stroke: under a cupped serif, standing
    // on its line at its tips, the ink there reaches none)
    let rowY = qy;
    for (let h = Math.ceil(Math.abs(qy - L)) + 1; near && (!row || row[0] > e1(qy) || row[1] < e0(qy)) && h <= near; h++) {
      const yy = L + dir * h, on = runs(f, yy).find(r => r[0] <= qx + 1 && r[1] >= qx - 1);
      if (on && on[0] <= e1(yy) && on[1] >= e0(yy)) { row = on; rowY = yy; }
    }
    // (and run on over gaps narrower than CUP_GAP: a cupped serif's tip, curling up past its top, read as ink beside it, the
    // room beside it 2 units)
    if (near && row) {
      const rr = runs(f, rowY);
      let i = rr.indexOf(row), j = i, lo = row[0], hi = row[1];
      while (i > 0 && lo - rr[i - 1][1] <= CUP_GAP) lo = rr[--i][0];
      while (j >= 0 && j < rr.length - 1 && rr[j + 1][0] - hi <= CUP_GAP) hi = rr[++j][1];
      row = [lo, hi];
    }
    if (!row || row[0] > e1(qy) || row[1] < e0(qy)) continue;
    // and it's a thin slab: a little way in from the line it has gone (a hook, as at the foot of a t, hasn't)
    const hi = L + dir * cap * 0.08, ha = L + dir * 2;
    const inner = runs(f, hi).find(r => r[0] <= e1(hi) && r[1] >= e0(hi));
    // (read `near` the line, as far in as the ink first reaches the stroke: a Didone's serifs, cupped, touch their lines in a
    // hairline, its capitals' tops 10 units under the line)
    let atLine = runs(f, ha).find(r => r[0] <= e1(ha) && r[1] >= e0(ha));
    for (let h = 3; !atLine && h <= near; h++) atLine = runs(f, L + dir * h).find(r => r[0] <= e0(L + dir * h) + 2 && r[1] >= e1(L + dir * h) - 2);
    // (and read `near`, each side's own piece of the foot where it touches the line in two, the side's own tip: a Didone's
    // K's leg's foot, cupped, touching the baseline at either tip, its inner serif read off the outer tip, and so none,
    // went under the leg grown over it at Verticals 100, a hook)
    const rowAt = runs(f, ha), atL = near ? rowAt.find(r => r[0] <= e1(ha) && r[1] >= row![0]) ?? atLine : atLine, atR = near ? [...rowAt].reverse().find(r => r[1] >= e0(ha) && r[0] <= row![1]) ?? atLine : atLine;
    // (or a thick one, a slab serif's: gone by a fifth of the capitals' height, and as far out at the line as most of
    // the way up to where it has gone, its top and its foot both level, where a hook's round foot touches the line
    // over a short way and curls in above it)
    const over = (h: number, side: number) => {
      const yy = L + dir * h, r = runs(f, yy).find(q => q[0] <= e1(yy) && q[1] >= e0(yy));
      return r ? (side < 0 ? e0(yy) - r[0] : r[1] - e1(yy)) : 0;
    };
    const thick = (side: number) => {
      // (once a stem's side: every point along its serif asks the same)
      const id = `${Math.round(a[0])},${Math.round(a[1])},${Math.round(L)},${side},${ks[0]}`, known = slabs.get(f)?.get(id);
      if (known !== undefined) return known;
      let hg = 0;
      for (let h = 3; h <= cap * 0.22 && !hg; h += 2) if (over(h, side) < 3) hg = h;
      // (and its top square: it reaches most of its way out within a little of where it has gone, where the inside of an
      // n's arch, running into the stem below the x-height, widens out gradually)
      const r0 = over(2, side), rm = over(hg * 0.6, side), top = over(Math.max(2, hg - cap * 0.04), side);
      const is = hg > 0 && r0 > cap * 0.02 && Math.abs(rm - r0) <= 0.25 * Math.max(r0, rm) && top >= 0.6 * r0;
      if (!slabs.has(f)) slabs.set(f, new Map());
      slabs.get(f)!.set(id, is);
      return is;
    };
    // (a stroke found only further up stands on nothing but a tall slab: the thin test there would take the inside of an
    // n's arch, which the stem runs up into, for one)
    const deep = ks[0] > 0.2;
    const slabL = deep ? thick(-1) : !inner || e0(hi) - inner[0] < 0.4 * (atL ? e0(ha) - atL[0] : 0) + 2 || thick(-1);
    const slabR = deep ? thick(1) : !inner || inner[1] - e1(hi) < 0.4 * (atR ? atR[1] - e1(ha) : 0) + 2 || thick(1);
    // (the room beside the stem a little way up, and beside the serif's own tip, whichever is less: two serifs reaching
    // toward each other across a counter's foot keep apart)
    const out = (x0: number, h: number, side: number) => march(f, x0, h, side, 0, cap);
    const room = (side: number) => Math.min(out(side < 0 ? e0(hs[0]) : e1(hs[0]), hs[0], side), out(side < 0 ? row![0] : row![1], rowY, side));
    // (a point on the stem's own edge, which reads a hair past it, is no serif's)
    if (x < e0(y) - 2 && e0(y) - row[0] < cap * 0.2 && slabL) return { dx: x - e0(y), stem: w, room: room(-1), reach: e0(y) - row[0] };
    // (or a head serif drawn as a flag on a stem's left, at a line over it: the stroke's ink where it reaches up to the
    // line no further left than the stem's edge, a little way down reaching out past it; not a shoulder leaving the stem,
    // an a's, wide at the line)
    if (dir < 0 && x < e0(y) - 2 && e0(y) - row[0] < cap * 0.2 && inner && inner[0] < e0(hi) - 2) {
      let top: [number, number] | undefined;
      for (let h = 2; h <= cap * FLAG_TOP && !top; h += 2) top = runs(f, L + dir * h).find(r => r[0] <= e1(L + dir * h) && r[1] >= e0(L + dir * h));
      if (top && top[0] >= e0(L) - 2) return { dx: x - e0(y), stem: w, room: room(-1), reach: e0(y) - row[0], flag: true };
    }
    // (or the stem's end itself, facing off the line, over the stem, unless a serif of another stroke is found)
    if (end === undefined && x >= e0(y) - 2 && x <= e1(y) + 2 && ny * dir > 0.5) end = { dx: 0, stem: w, room: 0, reach: 0, over: (x - e0(y)) / Math.max(1, e1(y) - e0(y)) };
    if (x > e1(y) + 2 && row[1] - e1(y) < cap * 0.2 && slabR) return { dx: x - e1(y), stem: w, room: room(1), reach: row[1] - e1(y) };
  }
  }
  return end ?? { dx: 0, stem: 0, room: 0, reach: 0 };
}

/** One contour of the letter rigged: each sample read across its stroke, the strokes' thickness without their
    joins', and their ends and dots marked. `alone`: the contour lies inside no other and holds none (read by their
    first points), so it can be a square dot (a blob; a ring round one point is a dot alone or not). */
function rigContour(c: Node[], f: Grid, ctx: Ctx, alone: boolean, near = 0, steep = false): Bone[] {
  const lines = [0, ctx.xh, ctx.cap, ctx.asc, ctx.desc];
  const serifLines = ctx.lower ? [0, ctx.xh, ctx.asc, ctx.desc] : [0, ctx.cap];
  const bones = samples(c).map(p => readSample(p, f, ctx, lines, serifLines, near));
  // (`steep`: no serif read on a hairline's straight side running as steep as SERIF_STEEP and SERIF_STEEP_LONG of the
  // capitals' height tall, thinner than SERIF_STEEP_THIN of it, a stroke's side by a heavier one, not a serif's)
  if (steep) {
    const span = new Map<number, { lo: number; hi: number; ny: number; ws: number[] }>();
    for (const b of bones) if (b.straight) { const v = span.get(b.seg) ?? { lo: Infinity, hi: -Infinity, ny: 0, ws: [] }; v.lo = Math.min(v.lo, b.y); v.hi = Math.max(v.hi, b.y); v.ny += Math.abs(b.ny); v.ws.push(2 * b.w); span.set(b.seg, v); }
    const side = new Set([...span].filter(([, v]) => v.hi - v.lo >= SERIF_STEEP_LONG * ctx.cap && v.ny / v.ws.length < SERIF_STEEP && v.ws.sort((p, q) => p - q)[v.ws.length >> 1] < SERIF_STEEP_THIN * ctx.cap).map(([k]) => k));
    for (const b of bones) if (b.straight && side.has(b.seg)) { b.serifDx = 0; b.flagDx = 0; b.serifStem = 0; b.serifRoom = 0; b.serifReach = 0; }
  }
  // (how far the skeleton typically lies from the paper: about half a typical stroke's thickness)
  const typical = bones.map(b => b.best).sort((a, b) => a - b)[bones.length >> 1];
  thicknessWithoutJoins(bones, typical);
  markEnds(bones);
  markDot(bones, ctx, alone, typical);
  return bones;
}

/** A sample read across its stroke: its inward normal, followed to the skeleton; the way the stroke runs there; the
    stroke's thickness; how far it reaches out on a serif; and whether it lies flat on one of the letter's lines. */
function readSample(p: Sample, f: Grid, ctx: Ctx, lines: number[], serifLines: number[], near = 0): Bone {
  let nx = -p.ty, ny = p.tx;
  const into = (sx: number, sy: number) => dist(f, p.x + sx * 3, p.y + sy * 3) + (inked(f, p.x + sx * 3, p.y + sy * 3) ? 100 : 0);
  if (into(-nx, -ny) > into(nx, ny)) { nx = -nx; ny = -ny; }
  // inward to the ridge, where the distance to the paper stops growing (a new high only counts when it
  // climbs, so the ray doesn't run on down a stroke's level middle)
  let best = 0, bt = 0;
  for (let t = 0.5; t < 600; t += 0.5) {
    const d = dist(f, p.x + nx * t, p.y + ny * t);
    if (d > best + 0.2) { best = d; bt = t; } else if (d < best - 1.5 || t - bt > Math.max(3, best * 0.5)) break;
  }
  // the way the stroke runs there: the line through the skeleton point that keeps furthest from the paper
  const ax = p.x + nx * bt, ay = p.y + ny * bt, rr = Math.max(2, best * 0.6);
  let bd = -1, dx = 0, dy = 1;
  for (let k = 0; k < 24; k++) {
    const th = k * Math.PI / 24, cx = Math.cos(th), cy = Math.sin(th);
    const u = dist(f, ax + cx * rr, ay + cy * rr), v = dist(f, ax - cx * rr, ay - cy * rr), s = Math.max(u, v) + 0.25 * Math.min(u, v);
    if (s > bd) { bd = s; dx = cx; dy = cy; }
  }
  // the stroke's thickness: the ink the normal runs through to the far side. Rays fanned round it count
  // too where they leave through the far side (an edge facing away from this one), as by the corner of
  // an L the straight one runs on down the other stroke; one leaving through the stroke's end doesn't
  // (a fanned ray is given up once it has run as far across as the shortest so far, as it can only come out longer)
  const across = (deg: number, lim = Infinity) => {
    const th = deg * Math.PI / 180, co = Math.cos(th), sn = Math.sin(th), rx = nx * co - ny * sn, ry = nx * sn + ny * co;
    let inInk = false;
    for (let t = 0.5; t < 900; t += 0.5) {
      if (t * co >= lim) return Infinity;
      if (inked(f, p.x + rx * t, p.y + ry * t)) { inInk = true; continue; }
      if (!inInk) continue;
      if (deg === 0) return t;
      const qx = p.x + rx * (t - 2), qy = p.y + ry * (t - 2);
      const gx = dist(f, qx - 1.5, qy) - dist(f, qx + 1.5, qy), gy = dist(f, qx, qy - 1.5) - dist(f, qx, qy + 1.5), gl = Math.hypot(gx, gy) || 1;
      return (gx * nx + gy * ny) / gl > 0.7 ? t * co : Infinity;
    }
    return Infinity;
  };
  const head = across(0);
  let chord = isFinite(head) ? head : 0;
  if (chord > 0) for (const deg of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) chord = Math.min(chord, across(deg, chord));
  let sr: ReturnType<typeof serifReach> = { dx: 0, stem: 0, room: 0, reach: 0 };
  // (a flag or a stem's end, the first line's, only where no line's serif is found)
  for (const L of serifLines) {
    if (Math.abs(p.y - L) > ctx.cap * SERIF_ZONE || (sr.dx && !sr.flag)) continue;
    // (read `near` the baseline and the capitals' line alone: a lowercase head serif, a flag, read so tore off)
    const got = serifReach(f, p.x, p.y, nx, ny, L, ctx.cap, L === 0 || (!ctx.lower && L === ctx.cap) ? near : 0);
    if ((got.dx && !got.flag) || (!sr.flag && sr.over === undefined)) sr = got;
  }
  const onLine = p.straight && Math.abs(ny) > 0.97 && lines.some(L => Math.abs(p.y - L) < 2.5);
  // (out from the edge, the paper's width to the next ink: a counter's, or the room between two strokes)
  const gap = march(f, p.x, p.y, -nx, -ny, ctx.cap);
  return { ...p, nx, ny, ax, ay, best, dx, dy, w: chord / 2, w0: chord / 2, serifDx: sr.flag ? 0 : sr.dx, flagDx: sr.flag ? sr.dx : 0, overStem: sr.over ?? -1, serifStem: sr.stem, serifRoom: sr.room, serifReach: sr.reach, gap, onLine, cap: false, lineCap: false, dot: false };
}

/** Where strokes join (a bowl and its stem, a bar and an arm) an edge reads thicker than either for a
    short stretch: its stroke's own thickness is what's left with that bump taken out. */
function thicknessWithoutJoins(bones: Bone[], typical: number) {
  // (a bump is taken out over as long a stretch as the outline's heavier strokes are thick, as a join with
  // one of them is about that long: a fat face's hairline meets its stems over their whole width)
  const heavy = bones.map(b => b.w).sort((a, b) => a - b)[Math.floor(bones.length * 0.75)];
  const w = opening(bones.map(b => b.w), Math.min(30, Math.max(2, Math.round(Math.max(typical, heavy) * 2 / STEP))));
  bones.forEach((b, i) => { b.w = w[i]; });
}

/** A stroke's end: a straight edge between two corners, about as long as the stroke is thick, that the
    skeleton runs into head on. */
function markEnds(bones: Bone[]) {
  const segs = new Map<number, Bone[]>();
  for (const b of bones) { if (!segs.has(b.seg)) segs.set(b.seg, []); segs.get(b.seg)!.push(b); }
  for (const sb of segs.values()) {
    if (!sb[0].straight || sb.length < 2) continue;
    const mid = sb[sb.length >> 1], len = Math.hypot(sb[sb.length - 1].x - sb[0].x, sb[sb.length - 1].y - sb[0].y) + STEP;
    if (Math.abs(mid.nx * mid.dx + mid.ny * mid.dy) > 0.75 && len < 3.6 * mid.w) for (const b of sb) if (!b.corner) { b.cap = true; b.lineCap = mid.onLine; }
  }
}

/** The area of the convex hull of points (monotone chain). */
function hullArea(pts: P[]): number {
  const p = pts.map(q => [q.x, q.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: number[][] = [], up: number[][] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  const h = [...lo.slice(0, -1), ...up.slice(0, -1)];
  let a = 0;
  h.forEach((q, i) => { const w = h[(i + 1) % h.length]; a += q[0] * w[1] - w[0] * q[1]; });
  return Math.abs(a) / 2;
}
/** A dot's least share of its box (a diamond's is half), and of its hull, where it fills less than a round one. */
const DIAMOND_FILL = 0.45, DIAMOND_HULL = 0.85;
/** A dot: a ring round one point, which grows evenly; or a square one (Oswald's), a small blob about as wide as it
    is tall that fills most of its box, its skeleton the cross of its diagonals; or a diamond, most of its hull. */
function markDot(bones: Bone[], ctx: Ctx, alone: boolean, typical: number) {
  let cx = 0, cy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const b of bones) { cx += b.ax; cy += b.ay; x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x); y0 = Math.min(y0, b.y); y1 = Math.max(y1, b.y); }
  cx /= bones.length; cy /= bones.length;
  const bw = x1 - x0, bh = y1 - y0, area = Math.abs(signedArea(bones));
  // (or a diamond, Cathedral's, half its box, its sides a little hollow: most of its hull)
  const box = alone && bw > 0 && bh > 0 && bw / bh < 1.6 && bh / bw < 1.6 && Math.max(bw, bh) < ctx.cap * 0.3;
  const blob = box && (area > bw * bh * 0.6 || (area > bw * bh * DIAMOND_FILL && area > DIAMOND_HULL * hullArea(bones)));
  if (blob || Math.max(...bones.map(b => Math.hypot(b.ax - cx, b.ay - cy))) < 0.35 * typical) for (const b of bones) { b.dot = true; b.corner = false; b.cap = false; }
}

/** A stroke's end on a contour: samples a+1 to b-1 (counted on past the contour's last sample), between the last of
    one side of the stroke (a) and the first of the other (b); how much of a ball it is, 0 to 1, and where along from a to
    b it is made smaller or larger round, 0 to 1 (ballEnd). */
interface EndRun {
  a: number; b: number; ball: number; pin: number;
  /** the turn itself, the run before it was carried on round where the outline still turns toward the ink (a lighter
      weight carries only that, its sides going in as sides: a j's tail, which curves on round into its end) */ ca?: number; cb?: number;
}

/** how far the outline turns back toward its ink at a stroke's end (a little short of a half turn, so a stroke that
    narrows to its end counts too) */
const END_TURN = 150 * Math.PI / 180;
/** How much thicker than its neck an end is where it starts being a ball, and where it is one wholly. A round end
    reads at most a little thicker than its stroke (a monoline's are 0.8 to 1.1 of it). */
const BALL_FROM = 1.15, BALL_AT = 1.6;

/** A contour's stroke ends: where the outline turns back on itself across a stroke, toward its ink all the way, in a
    stretch about as long as the stroke is thick and with its two sides about that far apart (a cap cut across it, a
    round end, a terminal's cut, a serif's end), with the whole of the turn taken in. */
function strokeEnds(bones: Bone[]): EndRun[] {
  const n = bones.length;
  if (n < 8) return [];
  const at = (i: number) => bones[((i % n) + n) % n];
  // each sample's turn on to the next: toward the ink (+), away from it (-); and how far on the next is
  const turn = bones.map((b, i) => {
    const c = at(i + 1), a = Math.abs(Math.atan2(b.tx * c.ty - b.ty * c.tx, b.tx * c.tx + b.ty * c.ty));
    return (c.tx - b.tx) * b.nx + (c.ty - b.ty) * b.ny >= 0 ? a : -a;
  });
  const T = (i: number) => turn[((i % n) + n) % n];
  const S = (i: number) => { const p = at(i), q = at(i + 1); return Math.hypot(q.x - p.x, q.y - p.y); };
  // the shortest stretch from each sample that turns back far enough
  const tight = new Map<number, { a: number; b: number }>();
  for (let i = 0; i < n; i++) {
    const A = bones[i];
    if (A.dot) continue;
    let sum = 0, arc = 0;
    for (let k = i; k < i + n - 1; k++) {
      if (T(k) < -0.06) break;
      sum += T(k); arc += S(k);
      if (arc > 4.5 * A.w + 2 * STEP) break;
      if (sum < END_TURN) continue;
      const B = at(k + 1), w = Math.max(A.w, B.w);
      // (the shortest to each far side wins)
      if (!B.dot && Math.hypot(B.x - A.x, B.y - A.y) <= 3 * w + STEP && A.tx * B.tx + A.ty * B.ty < -0.8) tight.set((k + 1) % n, { a: i, b: k + 1 });
      break;
    }
  }
  // the whole of each turn: on out either way while the outline still turns toward the ink (a round end's last
  // stretch), then those that overlap taken together
  const runs = [...tight.values()].map(({ a, b }) => {
    const w = Math.max(at(a).w, at(b).w);
    let ca = a, cb = b;
    for (let ext = 0; T(a - 1) > 0.02 && ext <= w; ext += S(a - 1)) a--;
    for (let ext = 0; T(b) > 0.02 && ext <= w; ext += S(b)) b++;
    if (a < 0) { a += n; b += n; ca += n; cb += n; }
    return { a, b, ca, cb };
  }).sort((p, q) => p.a - q.a);
  const out: { a: number; b: number; ca: number; cb: number }[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && r.a < last.b) { last.b = Math.max(last.b, r.b); last.ca = Math.min(last.ca, r.ca); last.cb = Math.max(last.cb, r.cb); }
    else out.push({ ...r });
  }
  // (one running on round past the first's start into it)
  if (out.length > 1 && out[out.length - 1].b > out[0].a + n) {
    const l = out.pop()!, f = out[0];
    out[0] = { a: l.a - n, b: Math.max(f.b, l.b - n), ca: Math.min(l.ca - n, f.ca), cb: Math.max(f.cb, l.cb - n) };
  }
  return out.filter(r => r.b - r.a >= 2 && r.b - r.a < n - 2).map(r => ({ ...ballEnd(bones, r), ca: r.ca, cb: r.cb }));
}

/** A stroke's end, with how much of a ball it is, 0 to 1: a ball (a Didone's a, c, r and y, its comma's and its
    quotes') is thicker than the neck it hangs from and wraps round, where a cap or a round end is as wide as its stroke
    and turns back across it in about as long. A ball thins and thickens as heavy a stroke does, not as its neck
    (moveRing). */
function ballEnd(bones: Bone[], { a, b }: { a: number; b: number }): EndRun {
  const n = bones.length, at = (i: number) => bones[((i % n) + n) % n];
  const ws: number[] = [];
  let arc = 0;
  for (let i = a + 1; i < b; i++) { ws.push(at(i).w); arc += Math.hypot(at(i + 1).x - at(i).x, at(i + 1).y - at(i).y); }
  ws.sort((p, q) => p - q);
  const span = Math.hypot(at(b).x - at(a).x, at(b).y - at(a).y), w = ws[ws.length >> 1];
  // (a pointed end, its sides meeting, has no neck to measure by)
  if (span < 2 * STEP || arc < 3 * span) return { a, b, ball: 0, pin: 0.5 };
  // (a teardrop, a serif face's quotes, is some of a ball; a Didone's, twice as thick as its neck, all one)
  const ball = Math.min(1, Math.max(0, (2 * w / span - BALL_FROM) / (BALL_AT - BALL_FROM)));
  if (ball) {
    // (and runs from its neck's last sample to the neck's first again: on past a corner where the round meets the
    // neck, which reads as thick as the ball and is no side of the neck, or back from the neck's sides the end ran on
    // along)
    const thin = (i: number) => at(i).w < 0.5 * w;
    for (let k = 0; k < 4 && !thin(a); k++) a--;
    while (b - a > 8 && thin(a + 1)) a++;
    for (let k = 0; k < 4 && !thin(b); k++) b++;
    while (b - a > 8 && thin(b - 1)) b--;
    // (it's made smaller or larger round where it runs on smoothly from its neck, on the side where the other meets
    // the neck at a corner, so the curve it runs on with keeps its way into it: a Didone's a, c, r, y and comma; round
    // its neck's middle where both sides do the same)
    const cornered = (i: number, dir: number) => [0, 1, 2].some(k => at(i + dir * k).corner);
    const ca = cornered(a, 1), cb = cornered(b, -1);
    return { a, b, ball, pin: ca === cb ? 0.5 : ca ? 1 : 0 };
  }
  return { a, b, ball, pin: 0.5 };
}

/** Where to look for each letter's bar that Crossbar moves: the column (a share of the ink's width), the
    band (shares of its height) and the height it's likeliest at; and how far the engine's letters move it
    from Crossbar 0 to 1, as a share of the capitals' or the x-height (the m.bar terms of glyphs/upper.ts and
    glyphs/lower.ts, which note it: the A's is the arched A's, as the symmetric A moves its bar 0.36). */
const BARS: Record<string, { at: [number, number, number, number]; move: number }> = {
  A: { at: [0.5, 0.12, 0.55, 0.33], move: 0.26 }, H: { at: [0.5, 0.25, 0.75, 0.5], move: 0.26 }, B: { at: [0.45, 0.3, 0.7, 0.5], move: 0.14 },
  E: { at: [0.4, 0.3, 0.7, 0.5], move: 0.14 }, F: { at: [0.4, 0.3, 0.7, 0.5], move: 0.14 }, P: { at: [0.45, 0.25, 0.68, 0.45], move: 0.16 },
  R: { at: [0.45, 0.3, 0.68, 0.48], move: 0.14 }, e: { at: [0.5, 0.3, 0.7, 0.5], move: 0.22 }, a: { at: [0.5, 0.35, 0.78, 0.57], move: 0.3 }
};

/** What a rig reads of the font its letter comes from: its letters and its heights. A free font, or the letters a
    design draws in Points with those it reads its lines and its stems off (family-drawn.ts). */
export type RigLetters = Pick<FreeFont, 'cap' | 'xh' | 'glyphs'>;

const rigs = new WeakMap<RigLetters, { lines: { asc: number; desc: number }; unicase: boolean; letters: Map<string, SkinRig | null>; ref?: { stem: number; hair: number; hair0: number }; serifed?: boolean; stroked?: 0 | 1 | 2; slabs?: boolean; leans?: boolean; plumb?: boolean; pen?: boolean }>();

/** A font's own stem and hairline, in its units: its n's (or H's) stems and its H's bar (or the n's level strokes),
    read once. A fat face's or a Didone's hairline is a small share of its stem, a sans's most of it. */
function fontRef(font: RigLetters) {
  const kept = rigs.get(font)!;
  if (!kept.ref) {
    const n = skinRig(font, 'n') ?? skinRig(font, 'H'), H = skinRig(font, 'H') ?? n;
    const stem = (n?.stem ?? 0.12) * font.cap;
    kept.ref = { stem, hair: Math.min(stem, (H?.bar ?? n?.bar ?? 0.12) * font.cap), hair0: Math.min(stem, (H?.bar0 ?? n?.bar0 ?? 0.12) * font.cap) };
  }
  return kept.ref;
}

/** Whether a font stands its stems on serifs: its n's or its H's first stem half as wide again just over the baseline
    as a third of the way up, read once (not its I's: an I alone has serifs in many a sans, a typewriter's, a comic's;
    an italic's n may have none where its capitals do). */
function fontSerifed(font: RigLetters) {
  const kept = rigs.get(font)!;
  if (kept.serifed === undefined) {
    // (the first run of ink across height y of letter ch, read off its outline's samples)
    const first = (ch: string, y: number) => {
      const xs: number[] = [];
      for (const bs of skinRig(font, ch)?.bones ?? []) for (let i = 0; i < bs.length; i++) {
        const a = bs[i], b = bs[(i + 1) % bs.length];
        if ((a.y - y) * (b.y - y) < 0) xs.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
      }
      xs.sort((p, q) => p - q);
      return xs.length >= 2 ? xs[1] - xs[0] : 0;
    };
    const on = (ch: string, up: number) => { const foot = first(ch, 0.04 * up), waist = first(ch, 0.3 * up); return waist > 0 && foot > 1.5 * waist; };
    kept.serifed = on('n', font.xh) || on('H', font.cap);
  }
  return kept.serifed;
}

/** Whether a font's capitals stand on straight upright stems: PLUMB of its H's outline straight and upright or more, read
    once (a sans drawn with a rule, not a comic's or a script's hand, whose strokes waver or lean). */
const PLUMB = 0.61;
function fontPlumb(font: RigLetters) {
  const kept = rigs.get(font)!;
  if (kept.plumb === undefined) {
    const bs = skinRig(font, 'H')?.bones.flat() ?? [];
    kept.plumb = bs.length > 0 && bs.filter(b => b.straight && Math.abs(b.nx) > 0.99).length >= PLUMB * bs.length;
  }
  return kept.plumb;
}

/** Whether a font is a sans of little contrast drawn with a rule (fontPlumb, its hairline LINES_EVEN of its stem or more,
    no serifs) whose arches leave their stems on no ink trap's thin neck (archCrotches' trap, read off its n): its
    Contrast turned round thins its edges by their strokes read whole (as a round pen's, fontPen) and draws a flat crotch's cut to where its edges
    meet (edgeMoves, moveRing's flatCrotches). A monospace's n's and d's arch and bowl, run into their stems on thin necks,
    so drawn, came off their hairline stems at Contrast 0, and its a's, b's, p's and q's counters opened. */
function plainSans(rig: SkinRig) {
  const { stem, hair0 } = rig.ref();
  return hair0 >= LINES_EVEN * stem && fontPlumb(rig.font) && untrapped(rig);
}
/** Whether a font has no serifs and its n's arch leaves its stem on no ink trap (archCrotches' trap): its Contrast turned
    round thins each edge by its stroke read whole (edgeMoves). */
function untrapped(rig: SkinRig) {
  let got = UNTRAPPED.get(rig.font);
  if (got === undefined) {
    const n = skinRig(rig.font, 'n');
    UNTRAPPED.set(rig.font, got = !rig.serifed() && !(n && [...archCrotches(n).values()].flat().some(G => G.trap)));
  }
  return got;
}
const UNTRAPPED = new WeakMap<RigLetters, boolean>();

/** Whether a font is drawn in heavy strokes about as thick as each other, with no serifs: its hairline STROKED_EVEN of its
    stem or more, and, its lowercase's outline cut square across a stroke's end nowhere (ROUND_CUT of it, read every few
    units), its stem ROUND_HEAVY of its capitals' height or more (Gumdrop: 1), or else STROKED_HEAVY (Orbital: 2). Its
    lighter weights are drawn as their strokes (moveRig): its outline, moved, keeps the heavy design's notches and swells
    where its strokes meet and end. A font cutting its strokes' ends square is so drawn only from a weight whose stems are
    STROKED_UNDER of the design's down: a little lighter, the strokes drawn again round off the corners the design keeps. */
const ROUND_CUT = 0.005, STROKED_EVEN = 0.7, ROUND_HEAVY = 0.14, STROKED_HEAVY = 0.2, STROKED_UNDER = 0.6;
function fontStroked(font: RigLetters) {
  const kept = rigs.get(font)!;
  if (kept.stroked === undefined) {
    let n = 0, cut = 0;
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') for (const bs of skinRig(font, ch)?.bones ?? []) for (const b of bs) { n++; if (b.cap) cut++; }
    const { stem, hair } = fontRef(font);
    const even = n > 0 && hair >= STROKED_EVEN * stem && !fontSerifed(font);
    kept.stroked = !even ? 0 : cut <= ROUND_CUT * n && stem >= ROUND_HEAVY * font.cap ? 1 : stem >= STROKED_HEAVY * font.cap ? 2 : 0;
  }
  return kept.stroked;
}

/** Whether a font is drawn with a round pen: its strokes near even (evenFont) and their ends round, hardly any of its
    lowercase's samples on an end cut across (ROUND_CUT of them) and few on a corner (PEN_CORNERS: where strokes meet), a
    comic's, a Gumdrop's, not a broad pen's script, pointed at every turn. Read once a font. */
function fontPen(font: RigLetters) {
  const kept = rigs.get(font)!;
  if (kept.pen === undefined) {
    let n = 0, cut = 0, corners = 0;
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') for (const bs of skinRig(font, ch)?.bones ?? []) for (const b of bs) { n++; if (b.cap) cut++; if (b.corner) corners++; }
    const { stem, hair0 } = fontRef(font);
    kept.pen = n > 0 && !fontSerifed(font) && hair0 >= EVEN_HAIR * stem && cut <= ROUND_CUT * n && corners <= PEN_CORNERS * n;
  }
  return kept.pen;
}

/** Whether a font is a slab serif whose slabs are short blocks hardly wider than its stems (Timber, a wood type), no
    serifs as fontSerifed reads them: its n's and its H's feet slabs with a tab either side (slabsOf). Moved lighter, its
    tabs stayed as heavy as the design's under thin stems, and where a stroke met one aslant its corner filled in. So its
    lighter weights are drawn as their straight strokes and slabs (linedRig), or, a letter not all straight strokes,
    without its slabs, each laid back over it thinner (slabRig, movedOnce): drawn as its strokes from a weight whose stems
    are STROKED_UNDER of the design's down (moved, its heavy arches and terminals came out wavy and blotted), moved
    above. */
function fontSlabbed(font: RigLetters) {
  const kept = rigs.get(font)!;
  if (kept.slabs === undefined) {
    const feet = (ch: string) => { const r = skinRig(font, ch); return (r ? slabRig(r)?.slabs ?? [] : []).filter(S => S.ta && S.tb && Math.abs(S.a.y) < 0.02 * font.cap && Math.abs(S.b.y) < 0.02 * font.cap).length >= 2; };
    kept.slabs = !fontSerifed(font) && feet('n') && feet('H');
  }
  return kept.slabs;
}

/** Whether a font's upright strokes lean, without serifs, a script's: the sides of its n's, H's and l's strokes, as thick as
    LEAN_STEM of its stem or more, facing across within LEAN_SIDE, lean LEAN_DEG degrees or more, as most of them do (an
    italic with serifs is a serif font's, moved as its serifs need). */
function fontLeans(font: RigLetters) {
  const kept = rigs.get(font)!;
  if (kept.leans === undefined) {
    const stem = fontRef(font).stem, a: number[] = [];
    for (const ch of 'nHl') for (const bs of skinRig(font, ch)?.bones ?? []) for (const b of bs) if (Math.abs(b.nx) > LEAN_SIDE && !b.corner && 2 * b.w >= LEAN_STEM * stem) a.push(Math.atan2(b.tx * Math.sign(b.ty || 1), Math.abs(b.ty)) * 180 / Math.PI);
    a.sort((p, q) => p - q);
    kept.leans = !fontSerifed(font) && a.length > 0 && Math.abs(a[a.length >> 1]) >= LEAN_DEG;
  }
  return kept.leans;
}
const LEAN_SIDE = 0.9, LEAN_STEM = 0.6, LEAN_DEG = 4;

/** The ink of pieces `cs`, united, without a slit: where a piece drawn the other way round overlaps another by a few
    units (Gumdrop's H's left stem under its bar), the nonzero rule leaves the overlap paper, a hairline gap the
    skeleton forks round; such a piece is turned, where turning it fills no more than a slit's worth (SLIT of the
    capitals' height, squared), not a loop's counter a script draws so (Serenade's L). */
function uniteRig(cs: Node[][], cap: number): Node[][] {
  const united = unite(cs);
  if (cs.length < 2) return united;
  const polys = cs.map(c => c.flatMap((n, i) => Array.from({ length: 4 }, (_, k) => bez(n, c[(i + 1) % c.length], k / 4))));
  const areas = polys.map(signedArea), inside = (i: number, j: number) => i !== j && polys[i].every(q => inPoly(polys[j], q));
  const meets = (i: number, j: number) => polys[i].some(q => inPoly(polys[j], q)) || polys[j].some(q => inPoly(polys[i], q));
  const roots = cs.map((_, i) => i).filter(i => !cs.some((_, j) => inside(i, j)));
  const ink = (us: Node[][]) => Math.abs(us.reduce((a, c) => a + signedArea(c.flatMap((n, k) => Array.from({ length: 4 }, (_, t) => bez(n, c[(k + 1) % c.length], t / 4)))), 0));
  let best = united, base = ink(united);
  for (const i of roots) {
    if (!roots.some(j => j !== i && Math.sign(areas[j]) !== Math.sign(areas[i]) && meets(i, j))) continue;
    const turned = new Set([i, ...cs.map((_, j) => j).filter(j => inside(j, i))]);
    const us = unite(cs.map((c, k) => (turned.has(k) ? c.slice().reverse().map(n => ({ ...n, ix: n.ox, iy: n.oy, ox: n.ix, oy: n.iy })) : c)));
    const gain = ink(us) - base;
    if (gain > 0 && gain < (SLIT * cap) ** 2 && us.length < best.length) { best = us; break; }
  }
  return best;
}
/** How much ink, as a share of the capitals' height, squared, a slit uniteRig fills is at most. */
const SLIT = 0.05;

/** A contour with each zig-zag its outline makes within a few units taken out: two anchors under ZIG apart, the way
    between them running back against the way into the first and out of the second (by more than ZIG_BACK, a cosine),
    made one anchor midway between them. A slip in the drawing, a 2-unit notch in an italic's n's stem where its arch
    leaves it: its two corners, each moved the way its own edges go, all but opposite, met again 35 units out at Thin,
    a needle. */
function unzig(c: Node[]): Node[] {
  let q = c;
  for (let pass = 0; pass < 4; pass++) {
    const n = q.length;
    if (n < 4) return q;
    let hit = -1;
    for (let i = 0; i < n && hit < 0; i++) {
      const a = q[i], b = q[(i + 1) % n], z = q[(i - 1 + n) % n], d = q[(i + 2) % n], mx = b.x - a.x, my = b.y - a.y, ml = Math.hypot(mx, my);
      if (!(ml > 0 && ml < ZIG)) continue;
      const inx = a.x - (a.ix ?? z.ox ?? z.x), iny = a.y - (a.iy ?? z.oy ?? z.y), outx = (b.ox ?? d.ix ?? d.x) - b.x, outy = (b.oy ?? d.iy ?? d.y) - b.y;
      const li = Math.hypot(inx, iny), lo = Math.hypot(outx, outy);
      if (li && lo && (inx * mx + iny * my) / (li * ml) < -ZIG_BACK && (outx * mx + outy * my) / (lo * ml) < -ZIG_BACK) hit = i;
    }
    if (hit < 0) return q;
    const a = q[hit], b = q[(hit + 1) % n], m: Node = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (a.ix !== undefined) { m.ix = a.ix; m.iy = a.iy; }
    if (b.ox !== undefined) { m.ox = b.ox; m.oy = b.oy; }
    q = hit + 1 < n ? [...q.slice(0, hit), m, ...q.slice(hit + 2)] : [m, ...q.slice(1, n - 1)];
  }
  return q;
}
const ZIG = 4, ZIG_BACK = 0.3;

/** A contour with each nub its outline makes taken out: two anchors under NUB apart made one midway between them, the way
    in to the first and out of the second kept. A slip in the drawing, a hand-drawn letter's two points a unit apart, the
    stretch between them at a slant to the edge it lies in (a comic's A's leg's edge, its V's foot), is read across as a
    stroke of its own way: its samples' normals 20 degrees off and their strokes a third thinner, a corner at either
    end where the edge runs on smooth. Moved three times their stroke out, they stood off the edge as jogs and spikes. */
function unnub(c: Node[]): Node[] {
  // (and a handle under NUB_HANDLE long dropped, its curve's end run straight: a handle a unit long, rounded to the unit,
  // turns its curve's end by as much as 45 degrees, a corner where the outline runs on round, a comic's V's foot's round's
  // points three units apart, each a corner, moved out a hundred units each its own way, a saw's teeth)
  const short = (n: Node, x?: number, y?: number) => x !== undefined && Math.hypot(x - n.x, y! - n.y) < NUB_HANDLE;
  let q = c.map(n => { const m = { ...n }; if (short(m, m.ix, m.iy)) { delete m.ix; delete m.iy; } if (short(m, m.ox, m.oy)) { delete m.ox; delete m.oy; } return m; });
  // (only where the outline runs on alike either side of the nub, within NUB_TURN: not a blackletter's facet a couple of
  // units across at a corner, its edges either side square to one another, made a point a needle at Weight 100)
  const alike = (q: Node[], i: number) => {
    const n = q.length, a = q[i], b = q[(i + 1) % n], z = q[(i - 1 + n) % n], d = q[(i + 2) % n];
    const ix = a.x - (a.ix ?? z.ox ?? z.x), iy = a.y - (a.iy ?? z.oy ?? z.y), ox = (b.ox ?? d.ix ?? d.x) - b.x, oy = (b.oy ?? d.iy ?? d.y) - b.y;
    const li = Math.hypot(ix, iy), lo = Math.hypot(ox, oy);
    return li > 0 && lo > 0 && (ix * ox + iy * oy) / (li * lo) > Math.cos(NUB_TURN);
  };
  for (let pass = 0; pass < c.length && q.length > 3; pass++) {
    const n = q.length, hit = q.findIndex((a, i) => { const b = q[(i + 1) % n]; return Math.hypot(b.x - a.x, b.y - a.y) < NUB && alike(q, i); });
    if (hit < 0) return q;
    const a = q[hit], b = q[(hit + 1) % n], m: Node = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (a.ix !== undefined) { m.ix = a.ix; m.iy = a.iy; }
    if (b.ox !== undefined) { m.ox = b.ox; m.oy = b.oy; }
    q = hit + 1 < n ? [...q.slice(0, hit), m, ...q.slice(hit + 2)] : [m, ...q.slice(1, n - 1)];
  }
  return q;
}
const NUB = 2.5, NUB_HANDLE = 1.5, NUB_TURN = 45 * Math.PI / 180;

/** The rig with its contours' nubs taken out (unnub), rigged as the font's letter, for a heavier weight's moves: a lighter
    one's are too short for a nub's misreading to show. Null where it has none. */
function nublessRig(rig: SkinRig): SkinRig | null {
  if (rig.nubless !== undefined) return rig.nubless;
  const cs = rig.contours.map(unnub);
  if (cs.every((c, i) => c.length === rig.contours[i].length && c.every((n, k) => n.ix === rig.contours[i][k].ix && n.ox === rig.contours[i][k].ox))) return (rig.nubless = null);
  const N = rigOf(rig.font, cs, inkGrid(cs, 1), rig.ctx);
  N.nubless = null;
  return (rig.nubless = N);
}
/** The rig with its serifs read where the ink nearest each line, within SERIF_LINE_NEAR of the capitals' height of it,
    first reaches across the stroke the serif stands on, for a heavier weight's moves: a Didone's cupped serifs, touching
    their lines in a hairline, and its capitals' tops, 10 units under theirs, were read as no serifs, and its stems
    thickened past them, their brackets in a waist, their serifs shorter. Null where it reads no more serifs. */
function serifLinedRig(rig: SkinRig): SkinRig | null {
  if (rig.serifLined !== undefined) return rig.serifLined;
  // (either way no long steep straight side read as a serif's: a Didone's w's middle hairline's side, by the thick
  // stroke's top, read as a serif reaching out from it and slid as one, a nose there at Weight 100)
  const f = inkGrid(rig.contours, 1), N = rigOf(rig.font, rig.contours, f, rig.ctx, Math.round(SERIF_LINE_NEAR * rig.ctx.cap), true);
  const count = (R: SkinRig) => R.bones.reduce((a, bs) => a + bs.filter(b => b.serifDx || b.flagDx).length, 0);
  N.serifLined = null; N.nubless = rig.nubless; N.cupped = true;
  if (count(N) > count(rig)) return (rig.serifLined = N);
  const P = rigOf(rig.font, rig.contours, f, rig.ctx, 0, true);
  P.serifLined = null; P.nubless = rig.nubless;
  return (rig.serifLined = count(P) < count(rig) ? P : null);
}
/** How far the paper reaches ahead of a serif's tip (the run of serifRuns from s0 to e reaching out `sg`), from its
    sample furthest that way of those at its end, along it: Infinity outside the letter. Read once a rig. */
function tipAhead(rig: SkinRig, bs: Bone[], s0: number, e: number, sg: number, atEnd: Uint8Array): number {
  let got = TIPS_AHEAD.get(bs);
  if (!got) TIPS_AHEAD.set(bs, got = new Map());
  const key = 2 * s0 + (sg > 0 ? 1 : 0), had = got.get(key);
  if (had !== undefined) return had;
  const n = bs.length;
  let lead = -1;
  for (let k = 0, j = s0; k < n && j !== e; k++, j = (j + 1) % n) if (atEnd[j] && (lead < 0 || sg * bs[j].x > sg * bs[lead].x)) lead = j;
  const t = lead < 0 ? Infinity : paperAlong(rig, bs[lead], sg, 0);
  got.set(key, t);
  return t;
}
const TIPS_AHEAD = new WeakMap<Bone[], Map<number, number>>();
/** How steep (its normals' level share, at most), how tall and how thin at most, as shares of the capitals' height, a
    straight segment runs for no serif to be read on it (serifLinedRig). */
const SERIF_STEEP = 0.6, SERIF_STEEP_LONG = 0.15, SERIF_STEEP_THIN = 0.06;
const SERIF_LINE_NEAR = 0.02, CUP_GAP = 3, CUP_TIP = 16, CUP_TIP_THIN = 32, CUP_RAMP = 0.15;
/** A contrasty font's hairline tips (hairTips): its cupped serifs' (serifLinedRig), each run of samples serifRuns reads as
    one's tip (2); and any run of samples read no thickness across (as thin as a unit) round a convex corner, no longer
    than CUP_TIP_THIN either way (1). Read once a rig. */
function hairTipMarks(rig: SkinRig, r: number): Uint8Array {
  const bs = rig.bones[r];
  let mark = HAIR_TIPS.get(bs);
  if (mark) return mark;
  const n = bs.length, md = (i: number) => ((i % n) + n) % n, cup = rig.cupped ? serifRuns(rig, r).cup : null;
  mark = new Uint8Array(n);
  if (cup) for (let i = 0; i < n; i++) if (cup[i]) mark[i] = 2;
  for (let c = 0; c < n; c++) {
    if (mark[c] || !bs[c].corner || concaveAt(bs[c])) continue;
    let a = c, e = c;
    while (c - a < CUP_TIP_THIN && !bs[md(a - 1)].corner && bs[md(a - 1)].w < 1) a--;
    while (e - c < CUP_TIP_THIN && !bs[md(e + 1)].corner && bs[md(e + 1)].w < 1) e++;
    if (a < c && e > c) for (let k = a; k <= e; k++) mark[md(k)] ||= 1;
  }
  HAIR_TIPS.set(bs, mark);
  return mark;
}
const HAIR_TIPS = new WeakMap<Bone[], Uint8Array>();
/** A contrasty font's hairline tips (moveRing, hairTipMarks), put where `base` put them and moved whole, not each along
    its own normal: from as far as the sample before the tip moved to as far as the one after it did, along it. */
function hairTips(rig: SkinRig, r: number, bs: Bone[], base: P[], out: P[]) {
  const n = bs.length, md = (i: number) => ((i % n) + n) % n, mark = hairTipMarks(rig, r);
  // (from a sample not in a tip, so each run is read whole)
  let s0 = 0;
  while (s0 < n && mark[s0]) s0++;
  if (s0 === n) return;
  for (let k = 0; k < n; k++) {
    const a = md(s0 + k);
    if (!mark[a] || mark[md(a - 1)]) continue;
    let e = a;
    while (mark[md(e + 1)]) e = md(e + 1);
    const run: number[] = [];
    for (let i = a; ; i = md(i + 1)) { run.push(i); if (i === e) break; }
    // (moved as the samples either side of it went, from the one's move to the other's along it: moved as one, as its corner
    // went or as the two did on average, its edges stood off theirs a step each side, a fold where the tip's normals turn,
    // slivers off a Didone's T's foot and U's and u's head serifs at Weight midway)
    const go = (i: number) => ({ x: out[i].x - base[i].x, y: out[i].y - base[i].y }), P = go(md(a - 1)), Q = go(md(e + 1));
    run.forEach((i, k) => { const t = (k + 1) / (run.length + 1); out[i] = { x: base[i].x + P.x + (Q.x - P.x) * t, y: base[i].y + P.y + (Q.y - P.y) * t }; });
  }
}

/** Letter `ch` of a free font (or of a design's drawn letters), rigged (once, then kept with the font). */
export function skinRig(font: RigLetters, ch: string): SkinRig | null {
  let kept = rigs.get(font);
  if (!kept) {
    const ext = (c: string, pick: (a: number, b: number) => number, or: number) => {
      const g = font.glyphs[c]; if (!g) return or;
      let v = 0; for (const cn of g.contours) for (const n of cn) v = pick(v, n.y);
      return v || or;
    };
    // (a font whose lowercase stands as tall as its capitals, Bungee's or Ewert's, has capitals there too,
    // which the x-height leaves be)
    kept = {
      lines: { asc: Math.max(ext('h', Math.max, font.cap * 1.05), font.cap * 1.02), desc: ext('p', Math.min, -font.cap * 0.3) },
      unicase: ext('x', Math.max, 0) >= 0.95 * ext('H', Math.max, font.cap), letters: new Map()
    };
    rigs.set(font, kept);
  }
  let r = kept.letters.get(ch);
  if (r !== undefined) return r;
  const g = font.glyphs[ch];
  if (!g || !g.contours.length) { kept.letters.set(ch, null); return null; }
  const f = inkGrid(g.contours, 1), lower = ch !== ch.toUpperCase() && !kept.unicase;
  let x0 = Infinity, x1 = -Infinity;
  for (const c of g.contours) for (const n of c) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); }
  const top = lower ? font.xh : font.cap, bar = BARS[ch];
  const barY = bar ? (columnRuns(f, x0 + (x1 - x0) * bar.at[0]).map(([a, b]) => (a + b) / 2)
    .filter(y => y > top * bar.at[1] && y < top * bar.at[2]).sort((a, b) => Math.abs(a - top * bar.at[3]) - Math.abs(b - top * bar.at[3]))[0] ?? null) : null;
  const ctx: Ctx = { cap: font.cap, xh: font.xh, ...kept.lines, barY, lower, ch };
  // the outline rigged is the ink's own: a letter drawn in overlapping pieces (a stem whole and a bowl run into it, as a
  // variable font's are and pieces drawn on a sheet and never united) has edges inside its ink, which, moved as the
  // sides of strokes, come out of the strokes round them as notches and spurs
  r = rigOf(font, uniteRig(g.contours, font.cap).map(unzig), f, ctx);
  kept.letters.set(ch, r);
  return r;
}

/** Outline cs of a letter of `font` rigged, its ink f, its heights ctx (skinRig). */
function rigOf(font: RigLetters, cs: Node[][], f: Grid, ctx: Ctx, near = 0, steep = false): SkinRig {
  // (a dot is on its own: a counter as small, a bold e's eye, is inside the letter's outline, and so is no dot, nor an o round its counter)
  const polys = cs.map(c => c.map(n => ({ x: n.x, y: n.y })));
  const bones = cs.map((c, i) => rigContour(c, f, ctx, !polys.some((o, j) => j !== i && o.length > 2 && (inPoly(o, polys[i][0]) || inPoly(polys[i], o[0]))), near, steep));
  const upright = bones.flat().filter(b => Math.abs(b.nx) > 0.9 && !b.cap).map(b => b.w * 2).sort((a, b) => a - b);
  const level = bones.flat().filter(b => Math.abs(b.ny) > 0.9 && !b.cap && !b.dot).map(b => b.w * 2).sort((a, b) => a - b);
  const level0 = bones.flat().filter(b => Math.abs(b.ny) > 0.9 && !b.cap && !b.dot).map(b => b.w0 * 2).sort((a, b) => a - b);
  const stem = (upright[upright.length >> 1] ?? 0) / font.cap;
  return { contours: cs, bones, ends: bones.map(strokeEnds), ctx, serifs: bones.some(bs => bs.some(b => b.serifDx !== 0)), stem, bar: level.length ? level[level.length >> 1] / font.cap : stem,
    bar0: level0.length ? level0[level0.length >> 1] / font.cap : stem,
    font, ref: () => fontRef(font), serifed: () => fontSerifed(font), stroked: () => fontStroked(font), shortSlabs: () => fontSlabbed(font), leans: () => fontLeans(font), moves: new Map() };
}

/** The rig without its slabs (slabsOf), rigged as the font's letter, and the slabs; null where it has none (or is that
    already). */
function slabRig(rig: SkinRig): { rig: SkinRig; slabs: Slab[] } | null {
  if (rig.unslabbed !== undefined) return rig.unslabbed;
  const g = inkGrid(rig.contours, 1), inside = (x: number, y: number) => inkAt(g, x, y);
  const c = rig.ctx, res = rig.slabless ? null : slabsOf(rig.contours, inside, c.lower ? [0, c.xh, c.asc, c.desc] : [0, c.cap], Math.max(6, 0.02 * c.cap));
  if (!res) return (rig.unslabbed = null);
  const U = rigOf(rig.font, res.cs, inkGrid(res.cs, 1), rig.ctx);
  U.slabless = res.slabs; U.unslabbed = null;
  return (rig.unslabbed = { rig: U, slabs: res.slabs });
}

/** The letters each letter-form setting draws in another form. A free font's letter asked for in a form other than
    its own comes from the font's twin (formChanged and twinGlyph in free-letters.ts), and skinFollows says the setting
    reaches it (see FORM_FOLLOWS). */
export const FORM_LETTERS = {
  aForm: 'a', gForm: 'g', kForm: 'kK', iForm: 'IiJl', sForm: 'sS$', diagonals: 'AVWvw', yForm: 'Yy', qForm: 'Q', rForm: 'R', apexForm: 'A', mForm: 'M', jForm: 'J',
  bowlJoin: 'abdgpqhmnru', bends: 'AMNVWYZvwyz', terminalRun: 'acefjrstyCGJS235690?'
} satisfies Partial<Record<keyof Params, string>>;
/** The letters each setting that draws letters in another form reaches, for skinFollows: FORM_LETTERS's, the a's
    storeys, and the settings that draw whole sets of letters anew. Curved or straight stroke ends (terminalRun) are
    left out: not a SKIN_KEYS setting, it reaches every letter as skinFollows answers it. */
const FORM_FOLLOWS: Record<string, RegExp> = {
  story: /a/, ...Object.fromEntries(Object.entries(FORM_LETTERS).filter(([k]) => k !== 'terminalRun').map(([k, set]) => [k, new RegExp(`[${set}]`)])),
  build: /./, cursive: /[adhijlmnpru]/
};

/** The settings a free font's letter follows only when it is rigged (moved on its skeleton by skinMove, or redrawn
    by restyle.ts): never a pixel font's. Each is a FREE_AT_KEYS setting (spec.ts `free: true`), the only ones
    reach.ts asks skinFollows about (tests/free-fonts.test.ts checks). */
export const SKIN_KEYS = new Set(['contrast', 'vWeight', 'hWeight', 'xHeight', 'crossbar', 'serifSize', 'extenders', 'descender', 'counter', 'dotSize', 'pinch', 'pinchPos', 'joints',
  'roundness', 'steps', 'innerRound', 'joinRound', 'terminal', 'terminalForm', 'terminalFlare', 'terminalDepth', 'terminalSize', 'terminalRound', 'terminalPoint',
  'terminalClip', 'terminalLean', 'terminalSlope', 'terminalTilt', 'terminalTip', 'terminalTaper',
  'serif', 'serifThickness', 'serifShape', 'serifAngle', 'serifBracket', 'serifTip', 'serifTipRound', 'serifTipSlant', 'serifBase', 'serifCup',
  'serifSides', 'serifInner', 'serifInnerSize', 'serifInnerThickness', 'serifBalance', 'serifTops', 'serifArms', 'serifArmThickness', 'serifArmLean',
  'stencil', 'stencilPos', 'stencilRound', 'barGap', 'barEnds', 'tail', 'aperture', 'dots', 'squareness', 'chamfer', 'curve', 'bowlForm', 'boxRound', 'apex', 'overlap', ...Object.keys(FORM_FOLLOWS)]);

/** Whether a rigged letter has a peak Peaks reshapes, two straight diagonals meeting on a line (hasPeaks in
    restyle.ts), as the font draws it. */
function rigPeaks(rig: SkinRig) {
  const c = rig.ctx;
  return (rig.peaks ??= hasPeaks(rig.contours, { ch: c.ch, cap: c.cap, xh: c.xh, stem: rig.stem * c.cap, bar: rig.bar * c.cap, lines: [0, c.cap, c.xh, c.asc, c.desc] }));
}
const vertexed = new WeakMap<FreeFont, boolean>();
/** Whether a font turns its strokes in points where straight diagonals meet (its V's foot or its v's, rigPeaks), as
    the engine's letters do: only then are its letters Bends reaches drawn as the engine's (its twin's) when the bends
    are rounded. A blackletter's or a script's letters turn otherwise, and are kept as the font draws them. */
export function fontVertexed(font: FreeFont) {
  let v = vertexed.get(font);
  if (v === undefined) {
    v = ['V', 'v'].some(ch => { const r = skinRig(font, ch); return !!r && rigPeaks(r); });
    vertexed.set(font, v);
  }
  return v;
}

/** Whether setting `key` moves letter `ch` of a free font on its skeleton: Crossbar only a letter with a
    bar it moves, x-height only the lowercase, the serifs' size only a letter with serifs, Stem length a
    lowercase letter reaching up or down past the x-height and the baseline, the dots' size a letter with a
    dot, Joints a letter whose strokes run into one another. */
export function skinFollows(font: FreeFont, ch: string, key: string) {
  // (a pixel font's letters only stretch, and change weight where the family has another)
  if (FREE_FAMILIES[font.family]?.grid) return !SKIN_KEYS.has(key);
  if (key === 'crossbar') return ch in BARS;
  // (curved or straight stroke ends draw a letter in the engine's other form, which a font keeping its own takes not)
  if (key === 'terminalRun' && FREE_FAMILIES[font.family]?.ownForms) return false;
  if (!SKIN_KEYS.has(key)) return true;
  // (a font keeping its own forms, a blackletter or a joined script, takes no other form: only another build and Cursive's
  // flicks reach it)
  if (FORM_FOLLOWS[key]) return FORM_FOLLOWS[key].test(ch) && (key === 'build' || key === 'cursive' || !FREE_FAMILIES[font.family]?.ownForms) && (key !== 'bends' || fontVertexed(font));
  const rig = skinRig(font, ch);
  if (!rig) return false;
  const ys = rig.contours.flat().map(n => n.y);
  switch (key) {
    case 'xHeight': return rig.ctx.lower;
    case 'extenders': return rig.ctx.lower && Math.max(...ys) > rig.ctx.xh + rig.ctx.cap * 0.12;
    case 'descender': return rig.ctx.lower && Math.min(...ys) < -rig.ctx.cap * 0.1;
    case 'dotSize': case 'dots': return rig.bones.some(bs => bs[0]?.dot);
    case 'apex': return PEAK_LETTERS.includes(ch) && rigPeaks(rig);
    case 'overlap': return !!bowlStem(rig.contours, { ch, cap: rig.ctx.cap, xh: rig.ctx.xh, stem: rig.stem * rig.ctx.cap, bar: rig.bar * rig.ctx.cap });
    // (a letter with a bowl or a curve, which these reshape)
    case 'squareness': case 'chamfer': case 'curve': case 'bowlForm': case 'boxRound': return /[a-gj-mo-zA-DGJ-SU0-9&@$?]/.test(ch) && !/[lvwxzAKMNVWXZ17]/.test(ch);
    case 'joints': return joinsNear(rig).some(n => n.some(Boolean));
    default:
      if (key.startsWith('serif')) return rig.serifs || squareEnds(rig);
      // (Stencil a letter where strokes join or one rings round on its own, a crossbar's gap one where they join)
      if (key.startsWith('stencil') || key === 'barGap' || key === 'barEnds') {
        const sk = rigSkeleton(rig);
        return sk.nodes.some(n => n.edges.length >= 3) || (key.startsWith('stencil') && sk.edges.some(e => e.a === e.b));
      }
      // (Tails & hooks the Q y j g t f with a styled end, Openness the open bowls' c e s a C G S and figures)
      if (key === 'tail' && !HOOK_LETTERS.includes(ch)) return false;
      if (key === 'aperture' && !OPEN_LETTERS.includes(ch)) return false;
      return (!key.startsWith('terminal') && key !== 'tail' && key !== 'aperture') || hasTerminals(rig.contours, rigSkeleton(rig), rig.ctx);
  }
}

/** Whether a letter has a stroke cut square across at its end (a stem's foot, an arm's end), as serifs stand on. */
function squareEnds(rig: SkinRig) {
  if (rig.squareEnds === undefined) {
    const sk = rigSkeleton(rig), g = inkGrid(rig.contours, 3);
    rig.squareEnds = sk.nodes.some((n, i) => {
      if (n.edges.length !== 1) return false;
      const lv = leaving(sk, branches(sk, i)[0], n.r * 2), d = { x: -lv.x, y: -lv.y }, f = endFace(g, n.x, n.y, n.r, d);
      // (or an upright one drawn round there, on a line: restyleSerifs squares it off)
      const tip = f.face === 'other' && roundTip(g, n.x, n.y, n.r, d), c = rig.ctx;
      return f.face !== 'other' || (!!tip && [0, c.xh, c.cap, c.asc, c.desc].some(L => Math.abs(tip.y - L) < c.cap * 0.035));
    });
  }
  return rig.squareEnds;
}

/** A rigged letter's skeleton, scanned once. */
export function rigSkeleton(rig: SkinRig): Skeleton {
  return rig.sk ??= skeleton(rig.contours);
}

/** A rigged letter's skeleton as a lighter weight draws it again (thinReads), scanned once: a short stroke running
    straight on through the join it leaves stays (a d's stem below its bowl, a nub in a heavy letter, is a stroke when
    the bowl thins). Read on a grid THIN_CELL units a side, coarser than the other's: it is read the first time a letter
    is drawn lighter, as a Weight drag goes, and draws strokes no finer for it. */
const THIN_CELL = 3;
export function thinSkeleton(rig: SkinRig): Skeleton {
  return rig.thinSk ??= plainSkeleton(rig);
}

/** The lighter weight's skeleton without its serifs' feet drawn level (thinSkeleton draws them, footRig its slabs). */
function plainSkeleton(rig: SkinRig): Skeleton {
  if (rig.plainSk) return rig.plainSk;
  const sk = withStubs(rig, skeleton(rig.contours, THIN_CELL, true, false, true));
  const tipped = withTips(rig, sk);
  return (rig.plainSk = rig.shortSlabs() || rig.stroked() ? withBars(rig, tipped) : tipped);
}

/** A stroke whose middle the skeleton stops short of another stroke it runs into, tapering to nothing inside that one's
    ink (an italic X's hairline into its heavy stroke): its middle run on straight the way it goes to the other's, met
    there in a join, so the two stay one as the heavy one thins (its end left free, the hairline stood apart from the heavy
    stroke's side as that went in, the X drawn only partway lighter, heavier at Light than at Regular's next step down).
    Only an end whose ink runs on past its round all the way to the other's middle, within TIP_REACH, and no thicker there
    than TIP_FINE of that one. */
function withTips(rig: SkinRig, sk: Skeleton): Skeleton {
  const polys = outlineOf(rig), inside = (x: number, y: number) => polys.reduce((k, ring) => k !== inPoly(ring, { x, y }), false);
  const lenOf = (pts: SkPt[]) => pts.reduce((a, q, k) => (k ? a + Math.hypot(q.x - pts[k - 1].x, q.y - pts[k - 1].y) : 0), 0);
  // (the skeleton as it is where no end runs on; otherwise a copy, each edge's points the same array but where it changes,
  // which keeps a stub its mark, STUBBED)
  const nodes = sk.nodes.map(n => ({ ...n, edges: [...n.edges] })), edges = sk.edges.map(e => ({ ...e }));
  const repts = (E: { pts: SkPt[]; len: number }, pts: SkPt[]) => { if (STUBBED.has(E.pts)) STUBBED.add(pts); E.pts = pts; E.len = lenOf(pts); };
  let changed = false;
  const count = nodes.length;
  for (let t = 0; t < count; t++) {
    const T = nodes[t];
    if (T.edges.length !== 1) continue;
    const e = T.edges[0], E = edges[e], from = E.a === t ? E.pts : E.pts.slice().reverse();
    const back = from.find(q => Math.hypot(q.x - T.x, q.y - T.y) >= TIP_BACK) ?? from[from.length - 1];
    let ux = T.x - back.x, uy = T.y - back.y;
    const ul = Math.hypot(ux, uy);
    if (ul < 1) continue;
    ux /= ul; uy /= ul;
    // (the nearest other stroke's middle ahead, within reach)
    let best: { f: number; k: number; w: number; s: number } | null = null;
    edges.forEach((F, f) => {
      if (f === e) return;
      for (let k = 0; k + 1 < F.pts.length; k++) {
        const p = F.pts[k], q = F.pts[k + 1], vx = q.x - p.x, vy = q.y - p.y, den = ux * vy - uy * vx;
        if (Math.abs(den) < 1e-9) continue;
        const sAt = ((p.x - T.x) * vy - (p.y - T.y) * vx) / den, w = ((p.x - T.x) * uy - (p.y - T.y) * ux) / den;
        if (sAt > 0 && sAt <= TIP_REACH && w >= 0 && w <= 1 && (!best || sAt < best.s)) best = { f, k, w, s: sAt };
      }
    });
    if (!best) continue;
    const B = best as { f: number; k: number; w: number; s: number };
    // (the ink running on past its round all the way there: not a stroke's own end)
    if (B.s <= T.r + 2) continue;
    // (give or take the neck it tapers to, as wide as its end's round, where the ray may slip out a little)
    let outside = 0;
    for (let d = 1; d < B.s; d += 1.5) if (!inside(T.x + ux * d, T.y + uy * d)) outside += 1.5;
    if (outside > Math.max(3, 2 * T.r)) continue;
    const F = edges[B.f], p = F.pts[B.k], q = F.pts[B.k + 1], X: SkPt = { x: p.x + (q.x - p.x) * B.w, y: p.y + (q.y - p.y) * B.w, r: p.r + (q.r - p.r) * B.w };
    // (tapering to much finer than the stroke it runs into: not a stem's end run into its slab)
    if (!(T.r <= TIP_FINE * X.r)) continue;
    // (the end run on to X, as thick as it is at its end; the other stroke parted at X, the end's node now the join there)
    const n = Math.max(1, Math.round(B.s / THIN_CELL)), lead: SkPt[] = [];
    for (let k = 1; k <= n; k++) lead.push({ x: T.x + (X.x - T.x) * k / n, y: T.y + (X.y - T.y) * k / n, r: T.r });
    const run = [...from.slice().reverse(), ...lead];
    repts(E, E.a === t ? run.slice().reverse() : run);
    const f2 = edges.length, F2 = { a: t, b: F.b, pts: [X, ...F.pts.slice(B.k + 1)], len: 0 };
    F2.len = lenOf(F2.pts);
    if (STUBBED.has(F.pts)) STUBBED.add(F2.pts);
    repts(F, [...F.pts.slice(0, B.k + 1), X]);
    changed = true;
    const Fb = nodes[F.b];
    Fb.edges = Fb.edges.map(x => (x === B.f && F.b !== F.a ? f2 : x));
    if (F.b === F.a) { const i = Fb.edges.lastIndexOf(B.f); if (i >= 0) Fb.edges[i] = f2; }
    F.b = t;
    edges.push(F2);
    T.x = X.x; T.y = X.y; T.r = X.r; T.edges = [e, B.f, f2];
  }
  return changed ? { nodes, edges } : sk;
}
/** How far back from a free end the way it runs is read, and how far on past it it may be run to another stroke's
    middle (withTips). */
const TIP_BACK = 30, TIP_REACH = 60, TIP_FINE = 0.35;

/** The rig as a letter of straight strokes in a font without serifs is drawn lighter: on its skeleton read along those
    strokes (lineSkeleton), or null where it isn't one. */
function linedRig(rig: SkinRig): SkinRig | null {
  if (rig.lined !== undefined) return rig.lined;
  // (a wood type's read with its slabs strokes along their faces, its strokes' sides off its outline without them)
  const U = rig.shortSlabs() ? slabRig(rig) : null, lines = rig.ctx.lower ? [0, rig.ctx.xh, rig.ctx.asc, rig.ctx.desc] : [0, rig.ctx.cap];
  // (its dots strokes apart: drawn on their own, they meet no other, an i's stem's line run on up its square dot's)
  const apart = (U?.rig ?? rig).bones.map(bs => !!bs[0]?.dot);
  const sk = !rig.serifed() ? lineSkeleton(rig.contours, rig.ctx.cap, rig.ref().stem, THIN_CELL, { lines, apart, ...(rig.slabless || U ? SLABLESS : {}), ...(U ? { slabs: U.slabs, sides: U.rig.contours } : {}) }) : null;
  if (sk) LINED.add(sk);
  return (rig.lined = sk ? { ...rig, thinSk: sk, plainSk: sk, thin: undefined, round: null, footed: null, slabbed: null, lined: null } : null);
}
/** A wood type's letter without its slabs (slabRig) is read along its straight strokes where the thickest is no more
    than EVEN_SLABLESS times the thinnest (its stems are fat beside its bars: an E's arms half as thick). */
const SLABLESS = { even: 2, parallel: 0.21 };
/** The skeletons linedRig reads, drawn as their strokes (thinStrokes). */
const LINED = new WeakSet<Skeleton>();

/** Skeleton sk with each serif's foot drawn level: where a join stands near one of the lines serifs stand on, a stroke
    leaving it away from the line (the stem) and one or two running out to tips whose rounds touch the line (the serif
    either side), the skeleton forks from the stem's middle out to the tips, round a bracket; a lighter weight drawn on
    that keeps the bracket whole or thins it to two legs. Those are drawn instead along the serif, level, as thick as
    it reads near its tip, from where the stem's middle, run on down, meets it, the join there. */
/** A serif's foot drawn level (withFeet): the line it stands on and which way from it the ink lies, its stem's middle
    run down to the line (from the line up), a point of that run, and each serif along the line, from the stem out to its
    tip, with a point of it, whose rounds read how thick each is. */
interface Foot { line: number; dir: number; stem: [SkPt, SkPt]; stemPt: SkPt; serifs: { x0: number; x1: number; pt: SkPt; edge: number }[]; side?: number }
/** Each point of a foot drawn level, and on its serif, the letter's edge along the line under it, as drawn. */
const FEET = new WeakMap<SkPt, { foot: Foot; stem: boolean; edge: number }>();
/** Each vertex withFeet draws standing on a line, by the skeleton it is drawn on (a fat face's v's point): where its
    join is drawn, on which line, and how far the join reached as read. */
const VERTICES = new WeakMap<Skeleton, { x: number; line: number; y: number; r: number; ox: number; oy: number }[]>();
/** The points of the strokes' middles withFeet runs in to a vertex, which their ink, moved, need not keep to. */
const VRUN = new WeakSet<SkPt>();
/** Whether skeleton edge E is a vertex's tip withFeet drew on its join, no longer than a point, a free end there. */
const vertexTip = (sk: Skeleton, E: Skeleton['edges'][number]) => E.pts.length >= 2 && E.pts.every(q => Math.hypot(q.x - E.pts[0].x, q.y - E.pts[0].y) <= 1)
  && (sk.nodes[E.a].edges.length === 1 || sk.nodes[E.b].edges.length === 1) && (VERTICES.get(sk) ?? []).some(v => Math.hypot(v.x - E.pts[0].x, v.y - E.pts[0].y) < 1);
/** A serif withFeet draws level is no thicker, half, than FOOT_THIN of the round where its stem meets it, from a
    weight whose stems are FOOT_UNDER[0] of the design's, or FOOT_SLAB, a slab serif as thick as its stem, from
    FOOT_UNDER[1] (a little lighter, as a Bold's to a Regular, its brackets thin with it as moved); and it reaches no
    further out from the stem than FOOT_REACH of that round (a typewriter's long slabs, its K's 5.2, not an E's arm). */
const FOOT_THIN = 0.6, FOOT_SLAB = 1.2, FOOT_REACH = 5.5;
const FOOT_UNDER: [number, number] = [0.6, 0.4];
/** A corner where an arm runs on along the line from a stem (an E's, an L's) is a foot only by a hairline serif, no
    thicker, half, than FOOT_HAIR of the round where they meet (a Didone's); a bracketed serif's corner keeps its curve. */
const FOOT_HAIR = 0.2;
/** A vertex is drawn again where its strokes meet only where its join's round is more than VERTEX_HAIR times its
    hairline's, or, in a font with serifs, its join reads further than VERTEX_NEAR of its round from its line (a slab's
    W's apex cut flat a hundred units across); and only a join no further than VERTEX_FAR of its round from its line,
    its stub out to the line no longer than VERTEX_TIP of it (a Didone's M's point, 2.4), that stub's end's own round
    no further off the line than VERTEX_GAP of it (a Didone's W's, cut flat on the line, its round 65 units up) (withFeet). */
const VERTEX_HAIR = 4, VERTEX_FAR = 3, VERTEX_TIP = 2.5, VERTEX_NEAR = 1.5, VERTEX_GAP = 1.1;
/** A vertex in a font with serifs, cut flat on its line (a slab's V's, W's or N's, cut a hundred units across) or round
    (a typewriter's N's), is drawn again however near its line its join reads, its tip as thick as its strokes; and a cut
    one, its strokes' middles meeting in one turn above the cut with no join there (a slab's V's, v's), at that turn,
    made a join: where the letter's edge lies flat along the line across
    VERTEX_CUT of the join's round about it, the turn's two ways no further apart than VERTEX_TURN (the cosine of the angle
    between them) and its strokes' rounds within half of each other (not a Didone's v, a hairline into a heavy stroke)
    (withFeet). */
const VERTEX_CUT = 0.7, VERTEX_TURN = 0.2;
/** A stem's foot read on through a join its middle meets near it, along the stroke running on from that join within
    STEM_ON (the cosine of the angle) of the way the stem goes (withFeet). */
const STEM_ON = 0.85;
/** A concave corner by a foot, below the join it lies near, one of its edges no steeper than ROOT_LEVEL (its sine) off
    level, is the foot's root, not that join's crotch (thinMoves). */
const ROOT_LEVEL = 0.5;
/** An ink trap's side (thinMoves): a straight side from a crotch running on, within TRAP_NEAR samples, into a side at
    least TRAP_LONG times as long, bent off it by no more than TRAP_BEND (the cosine of the angle), the crotch narrow, the
    side across it facing back at this one within TRAP_FACING (the cosine, negated). */
const TRAP_NEAR = 3, TRAP_LONG = 2, TRAP_BEND = Math.cos(25 * Math.PI / 180), TRAP_FACING = 0.7;
/** How nearly a side faces straight up or down off a line for a stroke's end from it to keep to the line (moveRing),
    and how far apart along the line its sides' points lie, and how far the move turns it, for it to. */
const END_ON_LINE = 0.9, END_SPREAD = 0.4, END_TURNED = 10 * Math.PI / 180;
/** How far round a vertex's join cut on its line its strokes are drawn again (rebuildJoins), as many times its round. */
const VERTEX_REACH = 2.5;
/** A corner whose serif the skeleton leaves out (withFeet) is a foot only by a serif no thicker, half, than CORNER_HAIR
    of its stem's round. */
const CORNER_HAIR = 0.25;
/** A stroke's end touching a line is a foot only where its round is no more than BALL_FOOT times the stroke's a round in
    from it (withFeet): wider, it is a ball. */
const BALL_FOOT = 1.6;
function withFeet(rig: SkinRig, sk: Skeleton, most = FOOT_THIN): Skeleton {
  const feetOn = rig.serifed();
  const { ctx } = rig, lines = ctx.lower ? [0, ctx.xh, ctx.asc, ctx.desc] : [0, ctx.cap], polys = outlineOf(rig);
  const inside = (x: number, y: number) => polys.reduce((k, ring) => k !== inPoly(ring, { x, y }), false);
  const nodes = sk.nodes.map(n => ({ ...n, edges: [...n.edges] })), edges = sk.edges.map(e => ({ ...e, pts: e.pts.slice() }));
  const G: Skeleton = { nodes, edges };
  const from = (br: Branch) => (br.end === 'a' ? edges[br.e].pts : edges[br.e].pts.slice().reverse());
  const put = (br: Branch, pts: SkPt[]) => { const E = edges[br.e]; E.pts = br.end === 'a' ? pts : pts.slice().reverse(); E.len = pts.reduce((a, q, k) => (k ? a + Math.hypot(q.x - pts[k - 1].x, q.y - pts[k - 1].y) : 0), 0); };
  const far = (br: Branch) => (br.end === 'a' ? edges[br.e].b : edges[br.e].a);
  const run = (a: SkPt, b: SkPt, r: (t: number) => number) => {
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / THIN_CELL)), out: SkPt[] = [];
    for (let k = 0; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n, r: r(k / n) });
    return out;
  };
  const tolOf = () => Math.max(6, 0.02 * ctx.cap);
  // (a stem whose middle meets another stroke's within a round of where it is read (a k's, its leg's join pulling its
  // middle aside there): read on through that join along the stroke running on from it most nearly as the stem goes,
  // STEM_ON, out to twice the join's round past it)
  const stemOn = (br: Branch, A: SkPt, end: SkPt | null): SkPt | null => {
    if (!end) return null;
    const f = far(br), F = nodes[f];
    if (F.edges.length < 3) return null;
    const ux = end.x - A.x, uy = end.y - A.y, ul = Math.hypot(ux, uy);
    if (!(ul >= 1)) return null;
    let best: SkPt | null = null, most = STEM_ON;
    for (const o of branches(G, f)) {
      if (o.e === br.e) continue;
      const v = leaving(G, o, 2 * F.r), c = (v.x * ux + v.y * uy) / ul;
      if (c <= most) continue;
      const op = from(o), k = op.findIndex(q => Math.hypot(q.x - F.x, q.y - F.y) >= 2 * F.r);
      most = c; best = op[k < 0 ? op.length - 1 : k];
    }
    return best;
  };
  // (how much of the way from x0 to x1 the letter's edge lies flat along the line, facing it: a serif's foot does, all
  // along; an a's tail, curling up off the line, touches it only near its tip)
  const flatAlong = (L: number, dir: number, x0: number, x1: number) => {
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1), tol = tolOf();
    const xs = rig.bones.flat().filter(q => !q.corner && q.ny * dir > 0.7 && Math.abs(q.y - L) < tol && q.x >= lo - 4 && q.x <= hi + 4).map(q => q.x);
    let on = 0, all = 0;
    for (let x = lo; x <= hi; x += 4, all++) if (xs.some(v => Math.abs(v - x) < 6)) on++;
    return all ? on / all : 0;
  };
  // (where the letter's edge lies along the line from x0 to x1, facing it, as drawn: the middle of its heights there, a
  // serif's flat edge a little off the line, a Didone's under the capitals' height)
  const edgeOf = (L: number, dir: number, x0: number, x1: number) => {
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1), tol = tolOf();
    const ys = rig.bones.flat().filter(q => !q.corner && q.ny * dir > 0.7 && Math.abs(q.y - L) < 2 * tol && q.x >= lo && q.x <= hi).map(q => q.y).sort((a, b) => a - b);
    return ys.length ? ys[ys.length >> 1] : L;
  };
  // (half how thick the ink is at x, read in from the line, no deeper than deep: a serif's there)
  const thickAt = (x: number, L: number, dir: number, deep: number) => {
    const tol = tolOf();
    let y0 = NaN;
    for (let d = -tol; d <= 4 * tol && Number.isNaN(y0); d += 1) if (inside(x, L + dir * d)) y0 = L + dir * d;
    if (Number.isNaN(y0)) return Infinity;
    let d = 0;
    while (d < deep && inside(x, y0 + dir * (d + 1))) d++;
    return (d + 1 + Math.abs(y0 - L)) / 2;
  };
  // (a font with no serifs has only its vertices drawn again, below)
  const vertices: { x: number; line: number; y: number; r: number; ox: number; oy: number }[] = [];
  if (!feetOn) { vertexPass(); if (vertices.length) VERTICES.set(G, vertices); return G; }
  // a serif standing out to one side of its stem only: the skeleton turns from the stem into it, with no join there, so
  // one is made at the turn, where it has run level from its tip
  const turns = new Set<number>(), flags: { e: number; end: 'a' | 'b'; L: number; dir: number }[] = [];
  for (let e = 0, count = edges.length; e < count; e++) {
    const E = edges[e];
    if (E.a === E.b) continue;
    for (const end of ['a', 'b'] as const) {
      const t = end === 'a' ? E.a : E.b, T = nodes[t];
      if (T.edges.length !== 1) continue;
      const L = lines.find(l => Math.abs((T.y - l) * (Math.sign(T.y - l) || 1) - T.r) < tolOf());
      if (L === undefined) continue;
      const dir = Math.sign(T.y - L) || 1, pts = end === 'a' ? E.pts : E.pts.slice().reverse();
      // (the first point from the tip whose way on, a round's length, climbs away from the line)
      let k = -1;
      for (let i = 1; i < pts.length - 1; i++) {
        const q = pts[i], m = Math.max(2, Math.round(q.r / THIN_CELL)), o = pts[Math.min(pts.length - 1, i + m)];
        const dx = o.x - q.x, dy = o.y - q.y, l = Math.hypot(dx, dy);
        if (l > 1 && dy * dir > 0.7 * l) { k = i; break; }
      }
      if (k < 0) continue;
      const K = pts[k], dx = Math.abs(K.x - T.x);
      // (out past the turn's round to the serif's end, the tip's round past the tip: a stem's own end turns at once)
      if (!(Math.abs(K.y - L) < 1.5 * K.r && dx + T.r > 1.2 * K.r && dx < FOOT_REACH * K.r && Math.abs(K.y - T.y) < 0.67 * Math.max(dx, 1))) continue;
      if (flatAlong(L, dir, T.x, K.x) < 0.7) continue;
      // (a turn into a join near it is that join's foot's, which the join reads; or, the join further off the line than
      // its round reaches, a flag's, read below)
      const far = nodes[end === 'a' ? E.b : E.a];
      if (far.edges.length >= 3 && Math.hypot(far.x - K.x, far.y - K.y) < 1.5 * Math.max(K.r, far.r)) {
        if (Math.abs(far.y - L) > 1.5 * far.r) flags.push({ e, end, L, dir });
        continue;
      }
      // (the edge parted there: from the tip to the turn, and on from it)
      const J = nodes.length, other = end === 'a' ? E.b : E.a, e2 = edges.length, at = end === 'a' ? k : E.pts.length - 1 - k;
      nodes.push({ x: K.x, y: K.y, r: K.r, edges: [e, e2] });
      if (end === 'a') { edges[e] = { a: E.a, b: J, pts: E.pts.slice(0, at + 1), len: 0 }; edges.push({ a: J, b: other, pts: E.pts.slice(at), len: 0 }); }
      else { edges[e] = { a: J, b: E.b, pts: E.pts.slice(at), len: 0 }; edges.push({ a: other, b: J, pts: E.pts.slice(0, at + 1), len: 0 }); }
      const ol = nodes[other].edges, oi = ol.indexOf(e);
      if (oi >= 0) ol[oi] = e2;
      turns.add(J);
      break;
    }
  }
  // a flag: a serif standing out one way atop a stem whose join with its arch or bowl lies further down than the join's
  // round reaches the line (an n's, an r's, a p's): the stem's middle run on up to the line, a stub to the join, the
  // flag level from it out to its tip, as thick as it reads there
  for (const { e, end, L, dir } of flags) {
    const E = edges[e], t = end === 'a' ? E.a : E.b, f = end === 'a' ? E.b : E.a, T = nodes[t], F = nodes[f], tol = tolOf();
    const stems = branches(G, f).filter(br => br.e !== e && leaving(G, br, F.r).y * dir > 0.7);
    if (stems.length !== 1) continue;
    const sp = from(stems[0]), a = sp.findIndex(q => Math.hypot(q.x - F.x, q.y - F.y) >= F.r);
    if (a < 0) continue;
    let b = sp.findIndex((q, k) => k > a && Math.hypot(q.x - sp[a].x, q.y - sp[a].y) >= F.r);
    if (b < 0) b = sp.length - 1;
    const A = sp[a], vx = sp[b].x - A.x, vy = sp[b].y - A.y, l = Math.hypot(vx, vy);
    if (!(l >= 1 && vy * dir >= 0.7 * l)) continue;
    const J1 = { x: A.x + vx * (L - A.y) / vy, y: L, r: A.r };
    if (!(Math.hypot(J1.x - F.x, J1.y - F.y) < 3 * F.r) || Math.abs(T.x - J1.x) >= FOOT_REACH * A.r || (T.x - J1.x) * (T.x - F.x) <= 0) continue;
    const h = thickAt(J1.x + 0.7 * (T.x - J1.x), L, dir, 2 * F.r);
    if (!(h < most * A.r)) continue;
    const foot: Foot = { line: L, dir, stem: [J1, A], stemPt: sp[b], serifs: [], side: A.r };
    const tip = { x: T.x, y: L, r: h }, flag = run(J1, tip, () => h), stub = run(J1, F, k => A.r + (F.r - A.r) * k);
    const base = rig.bones.flat().filter(q => !q.corner && q.ny * dir > 0.7 && Math.abs(q.y - L) < 2 * tol);
    const edgeAt = (x: number) => { let best: Bone | null = null; for (const q of base) if (!best || Math.abs(q.x - x) < Math.abs(best.x - x)) best = q; return best && Math.abs(best.x - x) < 4 * THIN_CELL ? best.y : L; };
    FEET.set(flag[0], { foot, stem: true, edge: L });
    for (const q of flag.slice(1)) FEET.set(q, { foot, stem: false, edge: edgeAt(q.x) });
    for (const q of stub.slice(0, -1)) FEET.set(q, { foot, stem: true, edge: L });
    const way = Math.sign(T.x - J1.x) || 1, yi = L + dir * Math.min(tol, h);
    let x = J1.x;
    while (Math.abs(x - J1.x) < FOOT_REACH * A.r && inside(x + way * 2, yi)) x += way * 2;
    const x1 = way * x > way * (T.x + way * T.r) ? x : T.x + way * T.r;
    foot.serifs.push({ x0: J1.x, x1, pt: flag[Math.floor(flag.length * 0.7)], edge: edgeOf(L, dir, J1.x, x1) });
    // (the flag's edge from its tip to the new node on the line, a stub on from there to the join)
    const n1 = nodes.length, e2 = edges.length, len = (pts: SkPt[]) => pts.reduce((s, q, k) => (k ? s + Math.hypot(q.x - pts[k - 1].x, q.y - pts[k - 1].y) : 0), 0);
    nodes.push({ x: J1.x, y: J1.y, r: J1.r, edges: [e, e2] });
    edges[e] = { a: n1, b: t, pts: flag, len: len(flag) };
    edges.push({ a: n1, b: f, pts: stub, len: len(stub) });
    F.edges[F.edges.indexOf(e)] = e2;
    T.x = tip.x; T.y = tip.y; T.r = h;
  }
  nodes.forEach((J, j) => {
    if (J.edges.length < 3 && !turns.has(j)) return;
    for (const L of lines) {
      if (Math.abs(J.y - L) > 1.5 * J.r) continue;
      const dir = Math.sign(J.y - L) || 1, tol = Math.max(6, 0.02 * ctx.cap);
      const tips: Branch[] = [], others: Branch[] = [];
      let stem: Branch | null = null;
      for (const br of branches(G, j)) {
        const T = nodes[far(br)], u = leaving(G, br, J.r);
        if (T.edges.length === 1 && Math.abs((T.y - L) * dir - T.r) < tol && Math.abs(T.x - J.x) > 1.5 * Math.abs(T.y - J.y) && Math.abs(T.x - J.x) < FOOT_REACH * J.r) tips.push(br);
        else if (!stem && (u.y * dir > 0.7 || (turns.has(j) && leaving(G, br, 2 * J.r).y * dir > 0.5))) stem = br;
        else others.push(br);
      }
      if (!stem || !tips.length || tips.length > 2) continue;
      // (nor a stroke running on through the line (a t's or an f's bar against the x-height, its stem on above it), or
      // along it (an E's arm, an L's bar), but by a hairline serif on an upright stem (FOOT_HAIR), its corner a foot)
      const off = (br: Branch) => { const u = leaving(G, br, J.r); return u.y * dir < -0.5 || Math.abs(u.y) < 0.5; };
      const along = new Set(others.filter(br => off(br) && !from(br).some(q => (q.y - L) * dir < -0.5 * J.r)));
      if (others.some(br => off(br) && !along.has(br))) continue;
      const sides = tips.map(br => Math.sign(nodes[far(br)].x - J.x));
      if (tips.length === 2 && sides[0] === sides[1]) continue;
      // (the serif's thickness most of the way out to its tip, read up from the line)
      const half = tips.map(br => {
        const x = J.x + 0.7 * (nodes[far(br)].x - J.x);
        let y0 = NaN;
        for (let d = -tol; d <= 4 * tol && Number.isNaN(y0); d += 1) if (inside(x, L + dir * d)) y0 = L + dir * d;
        if (Number.isNaN(y0)) return Infinity;
        let d = 0;
        while (d < J.r * 2 && inside(x, y0 + dir * (d + 1))) d++;
        return (d + 1 + Math.abs(y0 - L)) / 2;
      });
      const h = Math.max(...half);
      if (!(h < most * J.r)) continue;
      if (along.size && !(h < FOOT_HAIR * J.r && leaving(G, stem, J.r).y * dir > 0.95)) continue;
      // (the stem's middle past the join's round, run on down to the line, the serifs along it)
      const sp = from(stem);
      let a = sp.findIndex(q => Math.hypot(q.x - J.x, q.y - J.y) >= J.r);
      if (a < 0) continue;
      let b = sp.findIndex((q, k) => k > a && Math.hypot(q.x - sp[a].x, q.y - sp[a].y) >= J.r);
      if (b < 0) b = sp.length - 1;
      const A = sp[a], B = stemOn(stem, A, b === sp.length - 1 ? sp[b] : null) ?? sp[b], vx = B.x - A.x, vy = B.y - A.y;
      if (!(Math.hypot(vx, vy) >= 1 && Math.abs(vy) >= 0.5 * Math.hypot(vx, vy))) continue;
      const Ly = L, J1 = { x: A.x + vx * (Ly - A.y) / vy, y: Ly, r: A.r };
      if (!(Math.hypot(J1.x - A.x, J1.y - A.y) < 3 * J.r)) continue;
      const down = run(J1, A, () => A.r).slice(0, -1);
      if (down.length < 2) continue;
      // (the stem's thickness read a round past the join's, where it is the stem's own)
      const foot: Foot = { line: L, dir, stem: [J1, A], stemPt: sp[b], serifs: [] };
      for (const q of down) FEET.set(q, { foot, stem: true, edge: L });
      put(stem, [...down, ...sp.slice(a)]);
      // (each point standing on the serif's edge along the line below it, as drawn: a foot dipping a little under the
      // baseline at its tips, a top serif a little under the capitals' height)
      const base = rig.bones.flat().filter(q => !q.corner && q.ny * dir > 0.7 && Math.abs(q.y - L) < 2 * tol);
      const edgeAt = (x: number) => { let best: Bone | null = null; for (const q of base) if (!best || Math.abs(q.x - x) < Math.abs(best.x - x)) best = q; return best && Math.abs(best.x - x) < 4 * THIN_CELL ? best.y : L; };
      for (const br of tips) {
        const T = nodes[far(br)], end = { x: T.x, y: Ly, r: h }, pts = run(J1, end, () => h);
        FEET.set(pts[0], { foot, stem: true, edge: L });
        for (const q of pts.slice(1)) FEET.set(q, { foot, stem: false, edge: edgeAt(q.x) });
        // (out to the serif's end: as far as the ink runs along the line that way, at least its tip's round past the tip)
        const way = Math.sign(T.x - J1.x) || 1, yi = L + dir * Math.min(tol, h);
        let x = J1.x;
        while (Math.abs(x - J1.x) < FOOT_REACH * J.r && inside(x + way * 2, yi)) x += way * 2;
        const x1 = way * x > way * (T.x + way * T.r) ? x : T.x + way * T.r;
        foot.serifs.push({ x0: J1.x, x1, pt: pts[Math.floor(pts.length * 0.7)], edge: edgeOf(L, dir, J1.x, x1) });
        put(br, pts);
        T.x = end.x; T.y = end.y; T.r = h;
      }
      // (a foot whose skeleton runs out one way only, its slab reaching a little past the stem the other way too, as a
      // slab serif's often does: a short serif that way, out as far as the ink along the line)
      if (tips.length === 1 && foot.serifs.length && !along.size) {
        const out = -Math.sign(foot.serifs[0].x1 - J1.x), y = L + dir * Math.min(tol, h);
        let x = J1.x;
        while (Math.abs(x - J1.x) < FOOT_REACH * J.r && inside(x + out * 2, y)) x += out * 2;
        // (a turn's past its stem's side by a quarter of its round at least: a fat face's i's stem flaring a little to
        // its top is no serif; a leaning stem's side read where it is at that height, as wide across as it leans: an R's
        // leg's own foot, cut aslant, is no serif)
        const lean = { c: J1.x + vx * (y - L) / vy, half: A.r * Math.hypot(vx, vy) / Math.abs(vy) };
        if ((x - lean.c) * out > lean.half + (turns.has(j) ? Math.max(tol, 0.25 * A.r) : tol)) foot.serifs.push({ x0: J1.x, x1: x, pt: foot.serifs[0].pt, edge: edgeOf(L, dir, J1.x, x) });
        // (or none, a turn's serif standing out from its stem one way only, ending as a serif does (not a 5's bar), the
        // stem's own top beside it: the foot reaches across the stem, as a flag's does)
        else if (turns.has(j) && Math.abs(foot.serifs[0].x1 - J1.x) < FOOT_REACH * J.r - 2) foot.side = A.r;
      }
      for (const br of others) {
        const op = from(br);
        // (a stroke running on along the line (an E's arm), from where its middle first runs level a round off the line,
        // its run in to the corner along the line too, as its edge there is, not down round the join and up again)
        const k = along.has(br) ? op.findIndex((q, i) => i > 0 && Math.abs((q.y - L) * dir - q.r) < tol && Math.abs(q.y - op[Math.min(op.length - 1, i + 3)].y) < 0.25 * Math.max(1, Math.abs(q.x - op[Math.min(op.length - 1, i + 3)].x))) : -1;
        if (k > 0 && Math.abs(op[k].x - J1.x) < FOOT_REACH * J.r) {
          const lv = run({ x: J1.x, y: op[k].y, r: op[k].r }, op[k], () => op[k].r).slice(0, -1), lead = [{ x: J1.x, y: J1.y, r: J1.r }, ...lv];
          FEET.set(lead[0], { foot, stem: true, edge: L });
          put(br, [...lead, ...op.slice(k)]);
          continue;
        }
        const lead = run(J1, op[0], t => J1.r + (op[0].r - J1.r) * t).slice(0, -1);
        for (const q of along.has(br) ? lead : lead.slice(0, 1)) FEET.set(q, { foot, stem: true, edge: L });
        put(br, [...lead, ...op]);
      }
      J.x = J1.x; J.y = J1.y; J.r = J1.r;
      break;
    }
  });
  // a corner where a stem turns into an arm running along a line, a hairline serif standing out past the stem the
  // other way that the skeleton leaves out (a fat face's E's, L's, B's): a foot, the stem's middle run on to the line,
  // the serif level out from it to its end, the arm run level in to it
  const cornerCount = edges.length;
  for (let e = 0; e < Math.min(edges.length, cornerCount + 8); e++) for (const flip of [false, true]) {
    const E = edges[e], pts = flip ? E.pts.slice().reverse() : E.pts, n = pts.length, tol = tolOf();
    if (n < 8) continue;
    let done = false;
    for (const L of lines) {
      if (done) break;
      // (where the middle, coming upright toward the line a round, runs level along it two rounds on)
      let s0 = -1;
      for (let i = 2; i < n - 2 && s0 < 0; i++) {
        const q = pts[i], m = Math.max(2, Math.round(q.r / THIN_CELL)), dir = Math.sign(q.y - L) || 1;
        if (i - m < 0 || i + 2 * m >= n || Math.abs(q.y - L) > 2.5 * q.r) continue;
        const b = pts[i - m], f = pts[i + 2 * m], ib = Math.hypot(q.x - b.x, q.y - b.y), if_ = Math.hypot(f.x - q.x, f.y - q.y);
        if (ib < 1 || if_ < 1) continue;
        if ((q.y - b.y) * dir < -0.95 * ib && Math.abs(f.y - q.y) < 0.35 * if_) s0 = i;
      }
      if (s0 < 0) continue;
      const S0 = pts[s0], dir = Math.sign(S0.y - L) || 1, m = Math.max(2, Math.round(S0.r / THIN_CELL)), A = pts[s0 - m];
      // (the arm from where its middle runs level, a round or so off the line)
      let a0 = -1;
      for (let i = s0 + 1; i + m < n && a0 < 0; i++) { const q = pts[i], f = pts[i + m], l = Math.hypot(f.x - q.x, f.y - q.y); if (l > 1 && Math.abs(f.y - q.y) < 0.2 * l) a0 = i; }
      if (a0 < 0) continue;
      const way = Math.sign(pts[a0 + m].x - pts[a0].x) || 1, vx = S0.x - A.x, vy = S0.y - A.y;
      if (Math.abs(vy) < 1) continue;
      const J1 = { x: A.x + vx * (L - A.y) / vy, y: L, r: A.r }, out = -way, yi = L + dir * Math.min(tol, 0.25 * A.r);
      // (the serif: ink along the line out past the stem the other way from the arm, standing on it, a hairline)
      let x = J1.x;
      while (Math.abs(x - J1.x) < FOOT_REACH * A.r && inside(x + out * 2, yi)) x += out * 2;
      const reach = Math.abs(x - J1.x);
      if (!(reach > A.r + Math.max(tol, 0.25 * A.r)) || flatAlong(L, dir, J1.x, x) < 0.7) continue;
      const h = thickAt(J1.x + out * (A.r + 0.7 * (reach - A.r)), L, dir, 2 * A.r);
      if (!(h < CORNER_HAIR * A.r)) continue;
      // (the edge parted: the stem down to the foot, the arm in from it, the serif out)
      const foot: Foot = { line: L, dir, stem: [J1, A], stemPt: pts[Math.max(0, s0 - 2 * m)], serifs: [] };
      const down = run(J1, A, () => A.r).slice(0, -1).reverse(), stemPts = [...pts.slice(0, s0 - m + 1), ...down];
      const armY = pts[a0].y, lv = run({ x: J1.x, y: armY, r: pts[a0].r }, pts[a0], () => pts[a0].r).slice(0, -1), armPts = [{ x: J1.x, y: J1.y, r: J1.r }, ...lv, ...pts.slice(a0)];
      const tip = { x: x - out * h, y: L, r: h }, serif = run(J1, tip, () => h);
      const base = rig.bones.flat().filter(q => !q.corner && q.ny * dir > 0.7 && Math.abs(q.y - L) < 2 * tol);
      const edgeAt = (x: number) => { let best: Bone | null = null; for (const q of base) if (!best || Math.abs(q.x - x) < Math.abs(best.x - x)) best = q; return best && Math.abs(best.x - x) < 4 * THIN_CELL ? best.y : L; };
      for (const q of down) FEET.set(q, { foot, stem: true, edge: L });
      FEET.set(armPts[0], { foot, stem: true, edge: L });
      FEET.set(serif[0], { foot, stem: true, edge: L });
      for (const q of serif.slice(1)) FEET.set(q, { foot, stem: false, edge: edgeAt(q.x) });
      foot.serifs.push({ x0: J1.x, x1: x, pt: serif[Math.floor(serif.length * 0.7)], edge: edgeOf(L, dir, J1.x, x) });
      const len = (ps: SkPt[]) => ps.reduce((acc, q, k) => (k ? acc + Math.hypot(q.x - ps[k - 1].x, q.y - ps[k - 1].y) : 0), 0);
      const first = flip ? E.b : E.a, last = flip ? E.a : E.b, nj = nodes.length, nt = nj + 1, ea = edges.length, es = ea + 1;
      nodes.push({ x: J1.x, y: J1.y, r: J1.r, edges: [e, ea, es] }, { ...tip, edges: [es] });
      edges[e] = { a: first, b: nj, pts: stemPts, len: len(stemPts) };
      edges.push({ a: nj, b: last, pts: armPts, len: len(armPts) }, { a: nj, b: nt, pts: serif, len: len(serif) });
      const ll = nodes[last].edges, li = ll.indexOf(e);
      if (li >= 0) ll[li] = ea;
      done = true;
    }
    if (done) break;
  }
  // (or such a corner where the skeleton has a node, two of its strokes leaving it: a D's ring met at its corner)
  nodes.forEach((N, nn) => {
    if (N.edges.length !== 2 || turns.has(nn)) return;
    const tol = tolOf();
    for (const L of lines) {
      if (Math.abs(N.y - L) > 2.5 * N.r) continue;
      const dir = Math.sign(N.y - L) || 1, bs = branches(G, nn);
      if (bs.length !== 2) return;
      const ups = bs.filter(br => leaving(G, br, N.r).y * dir > 0.9), levels = bs.filter(br => br !== ups[0]);
      if (ups.length !== 1 || levels.length !== 1) continue;
      const stemFrom = from(ups[0]), armFrom = from(levels[0]);
      // (the stem's middle a round up from the node, straight)
      const iA = stemFrom.findIndex(q => Math.hypot(q.x - N.x, q.y - N.y) >= N.r), iB = iA < 0 ? -1 : stemFrom.findIndex((q, k) => k > iA && Math.hypot(q.x - stemFrom[iA].x, q.y - stemFrom[iA].y) >= N.r);
      if (iA < 0 || iB < 0) continue;
      const A = stemFrom[iA], B = stemFrom[iB], vx = B.x - A.x, vy = B.y - A.y;
      if (!(Math.abs(vy) > 0.95 * Math.hypot(vx, vy))) continue;
      const m = Math.max(2, Math.round(N.r / THIN_CELL));
      let a0 = -1;
      for (let i = 1; i + m < armFrom.length && a0 < 0; i++) { const q = armFrom[i], f = armFrom[i + m], l = Math.hypot(f.x - q.x, f.y - q.y); if (l > 1 && Math.abs(f.y - q.y) < 0.2 * l && Math.abs(q.y - L) < 1.5 * q.r) a0 = i; }
      if (a0 < 0) continue;
      const way = Math.sign(armFrom[a0 + m].x - armFrom[a0].x) || 1, out = -way;
      const J1 = { x: A.x + vx * (L - A.y) / vy, y: L, r: A.r }, yi = L + dir * Math.min(tol, 0.25 * A.r);
      let x = J1.x;
      while (Math.abs(x - J1.x) < FOOT_REACH * A.r && inside(x + out * 2, yi)) x += out * 2;
      const reach = Math.abs(x - J1.x);
      if (!(reach > A.r + Math.max(tol, 0.25 * A.r)) || flatAlong(L, dir, J1.x, x) < 0.7) continue;
      const h = thickAt(J1.x + out * (A.r + 0.7 * (reach - A.r)), L, dir, 2 * A.r);
      if (!(h < CORNER_HAIR * A.r)) continue;
      const foot: Foot = { line: L, dir, stem: [J1, A], stemPt: B, serifs: [] };
      const down = run(J1, A, () => A.r).slice(0, -1), lv = run({ x: J1.x, y: armFrom[a0].y, r: armFrom[a0].r }, armFrom[a0], () => armFrom[a0].r).slice(0, -1);
      const tip = { x: x - out * h, y: L, r: h }, serif = run(J1, tip, () => h);
      const base = rig.bones.flat().filter(q => !q.corner && q.ny * dir > 0.7 && Math.abs(q.y - L) < 2 * tol);
      const edgeAt = (x: number) => { let best: Bone | null = null; for (const q of base) if (!best || Math.abs(q.x - x) < Math.abs(best.x - x)) best = q; return best && Math.abs(best.x - x) < 4 * THIN_CELL ? best.y : L; };
      for (const q of down) FEET.set(q, { foot, stem: true, edge: L });
      const armLead = [{ x: J1.x, y: J1.y, r: J1.r }, ...lv];
      FEET.set(armLead[0], { foot, stem: true, edge: L });
      FEET.set(serif[0], { foot, stem: true, edge: L });
      for (const q of serif.slice(1)) FEET.set(q, { foot, stem: false, edge: edgeAt(q.x) });
      foot.serifs.push({ x0: J1.x, x1: x, pt: serif[Math.floor(serif.length * 0.7)], edge: edgeOf(L, dir, J1.x, x) });
      put(levels[0], [...armLead, ...armFrom.slice(a0)]);
      const stemNow = from(ups[0]);
      put(ups[0], [...down, ...stemNow.slice(iA)]);
      const nt = nodes.length, es = edges.length;
      nodes.push({ ...tip, edges: [es] });
      edges.push({ a: nn, b: nt, pts: serif, len: serif.reduce((acc, q, k) => (k ? acc + Math.hypot(q.x - serif[k - 1].x, q.y - serif[k - 1].y) : 0), 0) });
      N.edges.push(es);
      N.x = J1.x; N.y = J1.y; N.r = J1.r;
      break;
    }
  });
  // a vertex standing on a line, its two strokes meeting a way up from it (a fat face's v, its heavy stroke's middle
  // reaching its hairline's well up the vertex's ink): the strokes' middles run on straight to where they meet, the
  // vertex's own short end there, on its line
  vertexPass();
  function vertexPass() {
  // (a vertex cut flat on its line whose strokes' middles meet in one turn above it, with no join there, a slab's V: the
  // turn made a join, the skeleton's point nearest the line, a tip run down from it to the line, so the strokes meet
  // there as below; left so, the vertex was drawn off the turn's round, as wide as the design's cut at Thin, a nail's
  // head under two thin strokes)
  if (feetOn) for (let e = 0, count = edges.length; e < count; e++) {
    const E = edges[e], ps = E.pts;
    if (E.a === E.b || ps.length < 9) continue;
    for (const L of lines) {
      let k = -1, best = Infinity;
      ps.forEach((q, i) => { const h = Math.abs(q.y - L); if (h < best) { best = h; k = i; } });
      if (k <= 0 || k >= ps.length - 1) continue;
      const J = ps[k], dir = Math.sign(J.y - L) || 1;
      if (Math.abs(J.y - L) > VERTEX_FAR * J.r) continue;
      const away = (sg: number) => { let l = 0, i = k; while (i + sg >= 0 && i + sg < ps.length && l < 2 * J.r) { l += Math.hypot(ps[i + sg].x - ps[i].x, ps[i + sg].y - ps[i].y); i += sg; } return l >= 2 * J.r ? { x: ps[i].x - J.x, y: ps[i].y - J.y, r: ps[i].r } : null; };
      const u = away(-1), w = away(1);
      // (in a fat face, a hairline into a heavy stroke too: its V's thick leg, thinned about its middle, reached the line
      // past the hairline's, the two crossing above it round a speck of paper)
      if (!u || !w || (Math.min(u.r, w.r) < 0.5 * Math.max(u.r, w.r) && !fatFace(rig))) continue;
      const lu = Math.hypot(u.x, u.y) || 1, lw = Math.hypot(w.x, w.y) || 1;
      if (!(u.y * dir / lu > 0.3 && w.y * dir / lw > 0.3 && Math.sign(u.x) !== Math.sign(w.x) && Math.abs(u.x / lu) > 0.2 && Math.abs(w.x / lw) > 0.2 && (u.x * w.x + u.y * w.y) / (lu * lw) > VERTEX_TURN)) continue;
      if (!inside(J.x, L + dir * Math.min(tolOf(), 0.25 * Math.abs(J.y - L)))) continue;
      if (flatAlong(L, dir, J.x - 0.5 * J.r, J.x + 0.5 * J.r) < VERTEX_CUT) continue;
      const nj = nodes.length, nt = nj + 1, e2 = edges.length, e3 = e2 + 1, h = Math.abs(J.y - L) / 2, T = { x: J.x, y: L + dir * h, r: h };
      const lenOf = (q: SkPt[]) => q.reduce((a, v, i) => (i ? a + Math.hypot(v.x - q[i - 1].x, v.y - q[i - 1].y) : 0), 0);
      nodes.push({ x: J.x, y: J.y, r: J.r, edges: [e, e2, e3] }, { ...T, edges: [e3] });
      const back = ps.slice(k), tip = run(J, T, () => h);
      edges.push({ a: nj, b: E.b, pts: back, len: lenOf(back) }, { a: nj, b: nt, pts: tip, len: lenOf(tip) });
      nodes[E.b].edges = nodes[E.b].edges.map(x => (x === e ? e2 : x));
      E.pts = ps.slice(0, k + 1); E.b = nj; E.len = lenOf(E.pts);
      break;
    }
  }
  nodes.forEach((J, j) => {
    if (J.edges.length !== 3) return;
    const tol = tolOf();
    for (const L of lines) {
      if (Math.abs(J.y - L) > VERTEX_FAR * J.r) continue;
      const dir = Math.sign(J.y - L) || 1, bs = branches(G, j);
      // (a stub further off its line or longer than the plain reach (0.5 of its own round, 2 of the join's), or strokes
      // meeting past its round, only where a hairline meets a heavy stroke, VERTEX_HAIR: a Didone's W, M, w; a book face's
      // 4 or a script's s came out with a dark wedge at their tops so)
      const plain = (br: Branch) => { const T = nodes[far(br)]; return (T.y - L) * dir - T.r < Math.max(tol, 0.5 * T.r) && edges[br.e].len < 2 * J.r; };
      const tipBr = bs.filter(br => { const T = nodes[far(br)], gap = (T.y - L) * dir - T.r; return T.edges.length === 1 && gap > -tol && gap < Math.max(tol, VERTEX_GAP * T.r) && edges[br.e].len < VERTEX_TIP * J.r; });
      if (tipBr.length !== 1) continue;
      const legs = bs.filter(br => br !== tipBr[0] && br.e !== tipBr[0].e);
      if (legs.length !== 2) continue;
      const ways = legs.map(br => leaving(G, br, 3 * J.r));
      // (each leaning out its own way: not an N's stem standing up from its diagonal)
      // (in a font with serifs a vertex, cut flat on its line or round, is drawn again whichever of these: by an upright
      // stroke, an N's foot, and its join however near its line; its tip as thick as its strokes. Left, a slab's N's and
      // W's points kept the design's cut, as wide as a stem, under strokes thinned to a fifth: a dark arrowhead at Thin;
      // a typewriter's N's round foot, its join 90 units up, a hook there)
      const cut = feetOn;
      if (!(cut && dir > 0 && ways.every(u => u.y * dir > 0.3) && ways.some(u => Math.abs(u.x) > 0.2)) && (!ways.every(u => u.y * dir > 0.3 && Math.abs(u.x) > 0.2) || Math.sign(ways[0].x) === Math.sign(ways[1].x))) continue;
      // (each leg's middle from two rounds out from the join on, straight: nearer, a hairline's bends round into the join)
      const runs = legs.map(br => {
        const sp = from(br), a = sp.findIndex(q => Math.hypot(q.x - J.x, q.y - J.y) >= 2 * J.r);
        let b = a < 0 ? -1 : sp.findIndex((q, k) => k > a && Math.hypot(q.x - sp[a].x, q.y - sp[a].y) >= J.r);
        if (b < 0) b = sp.length - 1;
        return { br, sp, a, A: sp[Math.max(0, a)], B: sp[b] };
      });
      if (runs.some(R => R.a < 0 || Math.hypot(R.B.x - R.A.x, R.B.y - R.A.y) < 1)) continue;
      // (where those lines meet, no further than the line)
      const [P, Q] = runs, d1x = P.B.x - P.A.x, d1y = P.B.y - P.A.y, d2x = Q.B.x - Q.A.x, d2y = Q.B.y - Q.A.y, det = d1x * d2y - d1y * d2x;
      if (Math.abs(det) < 1e-6) continue;
      const t = ((Q.A.x - P.A.x) * d2y - (Q.A.y - P.A.y) * d2x) / det, M = { x: P.A.x + d1x * t, y: P.A.y + d1y * t };
      if (!((M.y - L) * dir < (J.y - L) * dir)) continue;
      // (in a font standing on serifs, only where a hairline meets a heavy stroke, the join's round many times the
      // hairline's: a Didone's, a fat face's; a book face's or a slab's vertex, its counter's foot cut flat, reads its
      // join near enough the line)
      const r0 = Math.min(P.A.r, Q.A.r), J1 = { x: M.x, y: (M.y - L) * dir < r0 ? L + dir * r0 : M.y, r: r0 };
      if (!cut && feetOn && !(J.r > VERTEX_HAIR * r0) && Math.abs(J.y - L) <= VERTEX_NEAR * J.r) continue;
      // (and only where they meet within the vertex's own end, its round: a w's middle peak, short of the x-height,
      // isn't drawn up to it)
      const T = nodes[far(tipBr[0])];
      // (or in its ink, no further across from its end than the join's round: a Didone's W's, cut flat on its line, its
      // end's round well up from it, its M's, a point, the strokes' middles meeting 80 units up it)
      const within = Math.hypot(J1.x - T.x, J1.y - T.y) <= T.r + tol;
      if (!within && !(Math.abs(M.x - T.x) <= Math.max(T.r, J.r) && inside(M.x, M.y))) continue;
      if (!(within && plain(tipBr[0])) && !(J.r > VERTEX_HAIR * r0)) continue;
      for (const R of runs) { const lead = run(J1, R.A, () => R.A.r).slice(0, -1); for (const q of lead) VRUN.add(q); put(R.br, [...lead, ...R.sp.slice(R.a)]); }
      const tk = cut && !(J.r > VERTEX_HAIR * r0) ? 1 : 0.5, tip = { x: J1.x, y: L + dir * r0 * tk, r: r0 * tk };
      put(tipBr[0], [{ x: J1.x, y: J1.y, r: J1.r }, tip]);
      T.x = tip.x; T.y = tip.y; T.r = tip.r;
      vertices.push({ x: J1.x, line: L, y: J1.y, r: J.r, ox: J.x, oy: J.y });
      J.x = J1.x; J.y = J1.y; J.r = J1.r;
      break;
    }
  });
  }
  // a stroke's end standing on a slab its skeleton stops short of, running up into the slab's middle (a v's arms, the
  // slab hardly wider than the stroke is thick): a foot with no skeleton out along it, its serifs read off the ink along
  // the line either way past the stroke's sides
  nodes.forEach((T, t) => {
    if (T.edges.length !== 1) return;
    const L = lines.find(l => Math.abs((T.y - l) * (Math.sign(T.y - l) || 1) - T.r) < tolOf());
    if (L === undefined) return;
    const dir = Math.sign(T.y - L) || 1, tol = tolOf(), br = branches(G, t)[0];
    if (!br) return;
    // (or, the end a stub short of a join, an upright stem running on past the join a while (a u's right stem below its
    // bowl; not a Z's diagonal into its corner, nor the short stroke down an A's apex to where its legs part), read off
    // the stem there)
    const f = br.end === 'a' ? edges[br.e].b : edges[br.e].a, F = nodes[f], own = from(br);
    let sp = own, a = sp.findIndex(q => Math.hypot(q.x - T.x, q.y - T.y) >= T.r), stub = false;
    if (a < 0 && F.edges.length >= 3) {
      const long = (o: Branch) => { const ps = edges[o.e].pts; let l = 0; for (let k = 1; k < ps.length && l <= 3 * F.r; k++) l += Math.hypot(ps[k].x - ps[k - 1].x, ps[k].y - ps[k - 1].y); return l > 3 * F.r; };
      const st = branches(G, f).filter(o => o.e !== br.e && leaving(G, o, F.r).y * dir > 0.95 && long(o));
      if (st.length !== 1) return;
      sp = from(st[0]); a = sp.findIndex(q => Math.hypot(q.x - F.x, q.y - F.y) >= F.r); stub = true;
    }
    if (a < 0) return;
    let b = sp.findIndex((q, k) => k > a && Math.hypot(q.x - sp[a].x, q.y - sp[a].y) >= T.r);
    if (b < 0) b = sp.length - 1;
    const A = sp[a], vx = sp[b].x - A.x, vy = sp[b].y - A.y, l = Math.hypot(vx, vy);
    if (!(l >= 0.5 * T.r && vy * dir >= 0.5 * l)) return;
    // (not a ball the stroke swells into, its round far wider than the stroke's, touching the line: an r's)
    if (!stub && T.r > BALL_FOOT * A.r) return;
    const J1 = { x: A.x + vx * (L - A.y) / vy, y: L, r: A.r }, y = L + dir * Math.min(tol, 0.5 * T.r);
    if (!(Math.hypot(J1.x - A.x, J1.y - A.y) < 3 * T.r)) return;
    const reach = (out: number) => { let x = J1.x; while (Math.abs(x - J1.x) < FOOT_REACH * T.r && inside(x + out * 2, y)) x += out * 2; return x; };
    // (out past the stem's side on the line, or a round up from it, where a leaning stem (an A's leg) stands further over
    // its slab one way)
    const xc = J1.x + vx * dir * A.r / vy, half = A.r * l / Math.abs(vy);
    const ends = [-1, 1].map(out => ({ out, x: reach(out) })).filter(({ out, x }) => Math.abs(x - J1.x) > A.r + tol || (x - xc - out * half) * out > tol).map(e => e.x);
    if (!ends.length || flatAlong(L, dir, Math.min(J1.x, ...ends), Math.max(J1.x, ...ends)) < 0.7) return;
    // (as thick as the slab reads halfway out along its longer overhang)
    const far = ends.reduce((p, q) => (Math.abs(q - J1.x) > Math.abs(p - J1.x) ? q : p)), xm = (J1.x + Math.sign(far - J1.x) * A.r + far) / 2;
    let d = 0;
    while (d < 2 * T.r && inside(xm, L + dir * (d + 1))) d++;
    const h = (d + 1) / 2;
    if (!(h < most * T.r)) return;
    // (and, out one way only, reaching out past the stroke's side further than it is thick: not a V's point cut flat, nor
    // a beak a stroke's end turns down into (a typewriter C's), the stroke as thick over the line as the slab it would be)
    if (ends.length === 1 && Math.abs(far - J1.x) - A.r < h) return;
    const down = run(J1, stub ? own[own.length - 1] : A, () => A.r).slice(0, -1);
    if (down.length < 2) return;
    const foot: Foot = { line: L, dir, stem: [J1, A], stemPt: sp[b], serifs: ends.map(x1 => ({ x0: J1.x, x1, pt: sp[b], edge: edgeOf(L, dir, J1.x, x1) })), side: stub ? A.r : undefined };
    for (const q of down) FEET.set(q, { foot, stem: true, edge: L });
    put(br, stub ? [...down, own[own.length - 1]] : [...down, ...sp.slice(a)]);
    T.x = J1.x; T.y = J1.y; T.r = J1.r;
  });
  if (vertices.length) VERTICES.set(G, vertices);
  return G;
}

/** Skeleton sk with a stroke's stub where it ran on past a turn: where its middle, straight a while, turns away (a stem
    turning into an n's arch, a p's stem into its bowl's top, an a's into its bowl's foot) and the letter's ink runs on
    straight past the turn further than the stroke's round reaches (the stem's end above the arch, its foot below the
    bowl), the skeleton, which went round the corner from the round's middle, has the stem run on to there: the turn
    is a join. */
function withStubs(rig: SkinRig, sk: Skeleton): Skeleton {
  const nodes = sk.nodes.map(n => ({ ...n, edges: [...n.edges] })), edges = sk.edges.map(e => ({ ...e }));
  const { ctx } = rig, lines = ctx.lower ? [0, ctx.xh, ctx.asc, ctx.desc] : [0, ctx.cap];
  const work = edges.map((_, i) => i);
  while (work.length) {
    const ei = work.pop()!, E = edges[ei], pts = E.pts, n = pts.length, cum = [0];
    for (let k = 1; k < n; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const L = cum[n - 1], at = (d: number) => { let k = 0; while (k < n - 1 && cum[k] < d) k++; return pts[k]; };
    const way = (p: SkPt, q: SkPt) => { const l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (q.x - p.x) / l, y: (q.y - p.y) / l }; };
    let found: { k: number; ux: number; uy: number; reach: number; half: number } | null = null;
    for (let k = 1; k < n - 1 && !found; k++) for (const dir of [1, -1]) {
      const p = pts[k], A = Math.max(p.r, 20), here = cum[k], ahead = here + dir * A;
      // (straight a while back from it, two rounds, and clear of the edge's own far end, a join or an end already, by
      // the round there)
      if (dir > 0 ? here < 2 * A || ahead > L - p.r : here > L - 2 * A || ahead < p.r) continue;
      const b1 = at(here - dir * A), b3 = at(here - dir * 2 * A), o = at(ahead);
      const u = way(b1, p), u0 = way(b3, b1), v = way(p, o);
      // (straight coming in, within 12°, and turning off by more than 35°)
      if (u.x * u0.x + u.y * u0.y < STUB_STRAIGHT || u.x * v.x + u.y * v.y > STUB_TURN) continue;
      const reach = inkAhead(rig, p, u.x, u.y);
      if (!(reach > p.r * STUB_PAST + 4 && reach < 4 * p.r + 40)) continue;
      // (and the ink there a stroke as wide as the one running in, either side of its middle: not the outside of a turn,
      // the ink beyond a curve's middle, nor across a stem the turn runs into)
      const mx = p.x + u.x * (p.r + reach) / 2, my = p.y + u.y * (p.r + reach) / 2;
      const s1 = inkAhead(rig, { x: mx, y: my }, -u.y, u.x), s2 = inkAhead(rig, { x: mx, y: my }, u.y, -u.x);
      // (or wider one way only, an upright stem run up into a line under a flag, a serif standing out from its top one
      // way: a p's whose bowl leaves it at the x-height; not an A's leg leaning into its apex)
      const flag = Math.min(s1, s2) <= 1.6 * p.r && Math.abs(u.y) > 0.98 && lines.some(Ly => Math.abs(p.y + u.y * reach - Ly) < Math.max(6, 0.02 * rig.ctx.cap)) && rig.serifed();
      if (Math.min(s1, s2) < 0.5 * p.r || (Math.max(s1, s2) > 1.6 * p.r && !flag)) continue;
      found = { k, ux: u.x, uy: u.y, reach, half: (s1 + s2) / 2 };
      break;
    }
    if (!found) continue;
    // (the turn a join: the edge parted there, and the stub run out from it to a round's length short of the ink's end,
    // as thick as it reads across, the turn's round, in the join, reading it thicker)
    const { k, ux, uy, reach, half } = found, p = pts[k], J = nodes.length, T = J + 1, stub: SkPt[] = [{ ...p }];
    for (let d = THIN_CELL; d <= reach - half; d += THIN_CELL) stub.push({ x: p.x + ux * d, y: p.y + uy * d, r: half });
    if (stub.length < 3) continue;
    nodes.push({ x: p.x, y: p.y, r: p.r, edges: [] }, { ...stub[stub.length - 1], edges: [] });
    const e1 = ei, e2 = edges.length, e3 = e2 + 1, a = E.a, b = E.b;
    edges[e1] = { a, b: J, pts: pts.slice(0, k + 1), len: cum[k] };
    edges.push({ a: J, b, pts: pts.slice(k), len: L - cum[k] }, { a: J, b: T, pts: stub, len: reach - half });
    STUBBED.add(stub);
    // (the far end's own place in its node's list now the second part's: a ring's one edge is listed there twice)
    const far = nodes[b].edges, i2 = a === b ? far.lastIndexOf(ei) : far.indexOf(ei);
    if (i2 >= 0) far[i2] = e2;
    nodes[J].edges.push(e1, e2, e3); nodes[T].edges.push(e3);
    work.push(e1, e2);
  }
  return { nodes, edges };
}
/** Skeleton sk with a bar's stub where a stroke's ink runs out to one side of it, square across a straight stretch, past
    its round: a heavy t's or f's bar no longer than it is thick, which the skeleton reads as no stroke. The stroke is
    parted at the bar's middle, a join, and the stub run out from it, as thick as the bar, to a round's length short of the
    bar's end. */
function withBars(rig: SkinRig, sk: Skeleton): Skeleton {
  const nodes = sk.nodes.map(n => ({ ...n, edges: [...n.edges] })), edges = sk.edges.map(e => ({ ...e }));
  const { ctx } = rig, lines = ctx.lower ? [0, ctx.xh, ctx.asc, ctx.desc] : [0, ctx.cap], tol = Math.max(6, 0.02 * ctx.cap);
  const work = edges.map((_, i) => i);
  while (work.length) {
    const ei = work.pop()!, E = edges[ei], pts = E.pts, n = pts.length, cum = [0];
    for (let k = 1; k < n; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const L = cum[n - 1], at = (d: number) => { let k = 0; while (k < n - 1 && cum[k] < d) k++; return pts[k]; };
    const way = (p: SkPt, q: SkPt) => { const l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (q.x - p.x) / l, y: (q.y - p.y) / l }; };
    // (each point's reach out either side, where the stroke runs straight a round either way and clear of its ends)
    const clear = (end: number) => (nodes[end].edges.length >= 3 ? BAR_CLEAR * nodes[end].r : nodes[end].r);
    const reach: [number, number][] = pts.map((p, k) => {
      const A = Math.max(p.r, 20), here = cum[k];
      if (here < Math.max(A, clear(E.a)) || here > L - Math.max(A, clear(E.b))) return [0, 0];
      const u = way(at(here - A), p), v = way(p, at(here + A));
      if (u.x * v.x + u.y * v.y < STUB_STRAIGHT) return [0, 0];
      const t = way(at(here - A), at(here + A));
      return [inkAhead(rig, p, -t.y, t.x), inkAhead(rig, p, t.y, -t.x)].map(d => (d > p.r * BAR_PAST + 4 && d < 4 * p.r + 40 ? d : 0)) as [number, number];
    });
    // (each side's bars: a run of points reaching out, cut to where its end stands square, as far as its furthest near
    // enough)
    const bars = [0, 1].map(side => {
      const out: { a: number; b: number }[] = [];
      for (let k0 = 0; k0 < n; k0++) {
        if (!reach[k0][side] || (k0 && reach[k0 - 1][side])) continue;
        let k1 = k0; while (k1 + 1 < n && reach[k1 + 1][side]) k1++;
        const most = Math.max(...reach.slice(k0, k1 + 1).map(r => r[side])), r0 = pts[(k0 + k1) >> 1].r;
        let a = k0, b = k1;
        while (a < b && reach[a][side] < most - BAR_EVEN * (most - r0)) a++;
        while (b > a && reach[b][side] < most - BAR_EVEN * (most - r0)) b--;
        if ((cum[b] - cum[a]) / 2 >= BAR_THIN * pts[(a + b) >> 1].r) out.push({ a, b });
      }
      return out;
    });
    const first = bars[0][0] ?? bars[1][0];
    if (!first) continue;
    // (a bar out either side of the stroke at once, one bar across it, parted from it at one point)
    const other = bars[bars[0][0] ? 1 : 0].find(B => B.a <= first.b && B.b >= first.a);
    const a = Math.min(first.a, other?.a ?? Infinity), b = Math.max(first.b, other?.b ?? -Infinity), k0 = (a + b) >> 1, p0 = pts[k0];
    // (as thick as it reads across, halfway out past the stroke's round, and parted from the stroke at its middle)
    const t = way(at(cum[k0] - p0.r), at(cum[k0] + p0.r)), s0 = bars[0][0] ? 0 : 1, ox = s0 ? t.y : -t.y, oy = s0 ? -t.x : t.x;
    const d0 = Math.max(...reach.slice(first.a, first.b + 1).map(r => r[s0])), m = { x: p0.x + ox * (p0.r + d0) / 2, y: p0.y + oy * (p0.r + d0) / 2 };
    const fw = inkAhead(rig, m, t.x, t.y), bw = inkAhead(rig, m, -t.x, -t.y), half = (fw + bw) / 2;
    if (half < BAR_THIN * p0.r || half > p0.r * BAR_PAST) continue;
    let k = k0;
    while (k + 1 < n && cum[k + 1] <= cum[k0] + (fw - bw) / 2) k++;
    while (k > 0 && cum[k - 1] >= cum[k0] + (fw - bw) / 2) k--;
    const p = pts[k], J = nodes.length;
    nodes.push({ x: p.x, y: p.y, r: p.r, edges: [] });
    const e1 = ei, e2 = edges.length, A = E.a, B = E.b;
    edges[e1] = { a: A, b: J, pts: pts.slice(0, k + 1), len: cum[k] };
    edges.push({ a: J, b: B, pts: pts.slice(k), len: L - cum[k] });
    const far = nodes[B].edges, i2 = A === B ? far.lastIndexOf(ei) : far.indexOf(ei);
    if (i2 >= 0) far[i2] = e2;
    nodes[J].edges.push(e1, e2);
    // (each stub run out to a round's length short of the bar's end, as thick as the bar; a bar run level with a side on
    // one of the letter's lines keeps it there as it thins, as a level stroke read along its edges does)
    const sides = [bars[0][0] ? 0 : 1, ...(other ? [bars[0][0] ? 1 : 0] : [])];
    for (const side of sides) {
      const ux = side ? t.y : -t.y, uy = side ? -t.x : t.x, d = Math.max(...reach.slice(a, b + 1).map(r => r[side]));
      const stub: SkPt[] = [{ ...p }];
      for (let s = THIN_CELL; s <= d - half; s += THIN_CELL) stub.push({ x: p.x + ux * s, y: p.y + uy * s, r: half });
      if (stub.length < 3) continue;
      // (its edge on a line: the bar's side, read across it halfway out past the stroke's round, standing on one)
      if (Math.abs(t.y) > 0.97) for (const sgn of [-1, 1]) {
        const mm = { x: p.x + ux * (p.r + d) / 2, y: p.y + uy * (p.r + d) / 2 }, ey = mm.y + sgn * inkAhead(rig, mm, 0, sgn), L0 = lines.find(Ly => Math.abs(ey - Ly) < tol);
        if (L0 === undefined) continue;
        const F: Flush = { fx: p.x, fy: L0, nx: 0, ny: -sgn, ux, uy, h: half, at: Math.abs(p.y - L0) };
        for (const q of stub) FLUSH.set(q, [[F, 1]]);
        break;
      }
      const T = nodes.length, e3 = edges.length;
      nodes.push({ ...stub[stub.length - 1], edges: [e3] });
      edges.push({ a: J, b: T, pts: stub, len: d - half });
      nodes[J].edges.push(e3);
    }
    work.push(e1, e2);
  }
  return { nodes, edges };
}
/** A bar's stub (withBars): the ink out past the stroke's round BAR_PAST times as far (and 4 units), the bar's end within
    BAR_EVEN of the way back from its furthest to the stroke's round, the bar no thinner, half, than BAR_THIN of the
    stroke's round, and BAR_CLEAR rounds from a join. */
const BAR_PAST = 1.1, BAR_EVEN = 0.25, BAR_THIN = 0.3, BAR_CLEAR = 1.5;

/** The stubs withStubs runs on past a turn, by their points. */
const STUBBED = new WeakSet<SkPt[]>();
/** How straight a stroke's middle runs into a turn for it to have a stub past it (withStubs), how far it turns there
    (cosines of 12° and 35°), and how far past the turn, as many times its round, the ink must run. */
const STUB_STRAIGHT = Math.cos(12 * Math.PI / 180), STUB_TURN = Math.cos(35 * Math.PI / 180), STUB_PAST = 1.3;

/** How near each edge of the letter lies to a join on the stroke it belongs to, where that stroke runs into
    another (an H's bar into its stems, not the stems, which run on past it): 1 at the join, easing to 0
    as far out along it as the engine thins a stroke there (three stems, or under half the stroke). */
function joinsNear(rig: SkinRig): number[][] {
  if (rig.near) return rig.near;
  const sk = rigSkeleton(rig), joins = joinsOf(sk);
  const ends = new Map<number, Branch[]>();
  for (const j of joins) for (const br of j.joiners) { const l = ends.get(br.e) ?? []; l.push(br); ends.set(br.e, l); }
  rig.near = rig.bones.map(bs => bs.map(b => {
    if (b.dot || !ends.size) return 0;
    const q = nearestOn(sk, b.ax, b.ay);
    const at = q && ends.get(q.e);
    if (!q || !at) return 0;
    const E = sk.edges[q.e], rs = E.pts.map(p => p.r).sort((a, c) => a - c), L = Math.max(1, Math.min(E.len * 0.45, 6 * rs[rs.length >> 1]));
    let v = 0;
    // (only an edge of the stroke itself, running along it, not the side of the one it runs into, whose
    // edges' middle the join's skeleton point also is)
    for (const br of at) {
      const u = Math.min(1, alongFrom(sk, q.e, q.i, br.end) / L), d = leaving(sk, br, sk.nodes[branchNode(sk, br)].r * 2.5);
      const a = Math.min(1, Math.max(0, (Math.abs(b.tx * d.x + b.ty * d.y) - 0.5) / 0.3));
      v = Math.max(v, (1 - u * u * (3 - 2 * u)) * a * a * (3 - 2 * a));
    }
    return v;
  }));
  return rig.near;
}

/* ---- moving */

/** The engine's measures of the settings a skinned letter follows. */
export interface SkinMeasures {
  /** a stem's thickness and a bar's, and an upright stroke's as the pen draws it (thin, reversed) */ s: number; hT: number; v: number;
  /** a stem's thickness as Weight alone draws it, before Verticals */ sw: number;
  /** how much wider */ ws: number;
  /** the x-height as a share of the capitals' */ xr: number;
  /** Crossbar */ bar: number;
  /** a serif's length */ serif: number;
  /** how far Stem length draws the ascenders up past where they are, as a share of the capitals' height (the
      Stem length term of metrics().asc in font.ts, over the cap height), and how deep the descenders go, as a share
      of it */ asc: number; desc: number;
  /** Inner space: how much wider a letter built round a counter is drawn (o, b, C), and any other */ cntR: number; cntN: number;
  /** the dots' size (dotK in glyphs/shared.ts, the same line with its sums in another order) */ dot: number;
  /** Pinch: how much, and the place of its line on its scale */ pinch: number; pinchPos: number;
  /** Joints: how much strokes thin where they run into another */ joints: number;
}
export const skinMeasures = (m: Metrics): SkinMeasures => ({
  s: m.s, hT: m.hT, v: m.tDir(0, 1), sw: m.s0, ws: m.ws, xr: m.xh / m.cap, bar: m.bar, serif: serifLen(m.p.serifSize, m.ws),
  asc: (m.p.extenders - 0.5) * 0.5, desc: m.desc / m.cap, cntR: counterScale('r', m.cnt), cntN: counterScale(undefined, m.cnt),
  dot: m.p.dotSize < 0.5 ? 0.7 + 0.6 * m.p.dotSize : 1 + (m.p.dotSize - 0.5), pinch: m.p.pinch, pinchPos: m.p.pinchPos, joints: m.p.joints
});
/** How near two of each measure count as the same (a stem's, a bar's and a serif's length in the engine's units, the
    rest shares and settings). Every SkinMeasures field is here, as the type asks: sameMeasures and skinMove's kept
    moves read only these. */
const SAME_WITHIN: Record<keyof SkinMeasures, number> = {
  s: 0.05, hT: 0.05, v: 0.05, sw: 0.05, ws: 1e-4, xr: 1e-4, bar: 1e-4, serif: 0.05, asc: 1e-4, desc: 1e-4, cntR: 1e-4, cntN: 1e-4, dot: 1e-4, pinch: 1e-4, pinchPos: 1e-4, joints: 1e-4
};
const MEASURES = Object.keys(SAME_WITHIN) as (keyof SkinMeasures)[];
export const sameMeasures = (a: SkinMeasures, b: SkinMeasures) => MEASURES.every(k => Math.abs(a[k] - b[k]) < SAME_WITHIN[k]);

/** The letters built round a counter, which Inner space widens by cntR rather than cntN (see counterScale in font.ts:
    the engine widens the glyph files' m.W(…, 'r') letters so). The two lists differ a little: the engine also draws
    6, ¢, €, © and ® round, and not 5. */
const ROUND = new Set('CDGOQabcdegopq0589@');

/** How much of its depth a descender keeps, drawn `k` times as deep: a shorter one keeps more than the engine's, which
    are drawn for it (a tail or a bowl squeezed into a quarter of its depth comes apart). The lines a free font's
    serifs and peaks stand on move by it too (restyled in free-letters.ts). */
export const descK = (k: number) => (k < 1 ? Math.sqrt(k) : k);

/** A piecewise-linear map with knots [from, to], carried on beyond them unscaled. */
const piecewise = (knots: [number, number][]) => (y: number) => {
  if (y <= knots[0][0]) return y + knots[0][1] - knots[0][0];
  for (let i = 1; i < knots.length; i++) if (y <= knots[i][0]) { const [a, A] = knots[i - 1], [b, B] = knots[i]; return A + (y - a) * (B - A) / (b - a); }
  const [l, L] = knots[knots.length - 1];
  return y + L - l;
};

/** An outline's small loops cut out, where an edge moved out overruns its neighbour (inside a corner the
    strokes thicken into): where it crosses itself within a short stretch, the stretch goes, one loop a pass (a letter
    moved far can fold in a dozen places, and each fold left winds the other way, a slit in the ink). `least`: of the two
    loops either side of a crossing, however short the outline, the one wound against the whole goes, or, both wound
    with it, the smaller (a reweighed letter's small counter, a Chancery's J's flourish's loop, 38 points crossing itself
    near one end, was cut to the 4 past the crossing, a sliver wound the other way, and dropped). */
function untangle(p: P[], reach = 60, least = false) {
  let pts = p.slice();
  for (let pass = 0; pass < 32; pass++) {
    let cut = false; const n = pts.length;
    for (let i = 0; i < n && !cut; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      for (let k = 2; k <= Math.min(reach, n - 2); k++) {
        const j = (i + k) % n, c = pts[j], d = pts[(j + 1) % n];
        const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
        if (!(t > 0 && t < 1 && u > 0 && u < 1)) continue;
        const x = { x: a.x + rx * t, y: a.y + ry * t };
        if (least) {
          // (the loop between the two edges, and the rest: the rest goes instead where it is the one to)
          const loop = [x, ...Array.from({ length: k }, (_, m) => pts[(i + 1 + m) % n])], all = signedArea(pts), la = signedArea(loop), ra = all - la;
          if (Math.sign(la) === Math.sign(all) && (Math.sign(ra) !== Math.sign(all) || Math.abs(la) > Math.abs(ra))) { pts = loop; cut = true; break; }
        }
        // the samples between the two crossing edges go, the crossing takes their place
        const keep: P[] = [];
        for (let m = 0; m < n; m++) if ((m - i - 1 + n) % n >= k) keep.push(pts[m]);
        keep.splice(keep.indexOf(pts[(j + 1) % n]), 0, { x: a.x + rx * t, y: a.y + ry * t });
        pts = keep; cut = true; break;
      }
    }
    if (!cut) break;
  }
  return pts;
}

/** A heavier weight's outline `p` (each point bs's sample, moved) with every point it reaches running back against the way
    the design runs into that sample taken out, from the point kept before it: a round moved less far out than the
    straight side it runs into folds back over itself where they meet, a hook into the paper that crosses nothing, so
    untangle leaves it. Only where it runs back plainly (UNFOLD_BACK), and in a round, away from corners (UNFOLD_CORNER
    samples): a corner moves out further than the samples beside it, which so read as a little behind it, and taken out
    left a nick at each slab serif's root. Never a stroke's end or a dot, carried whole: an i's stem's top, turned as its
    sides thinned, taken out ran the stem up into its dot. The points kept, by their samples (null, all). */
function unfolded(p: P[], bs: Bone[]): number[] | null {
  const n = p.length;
  if (n !== bs.length || n < 4) return null;
  const nearCorner = bs.map((_, j) => { for (let k = -UNFOLD_CORNER; k <= UNFOLD_CORNER; k++) if (bs[(j + k + n) % n].corner) return true; return false; });
  const keep: number[] = [0];
  for (let j = 1; j < n; j++) {
    const k = keep[keep.length - 1], a = bs[j - 1], b = bs[j], dx = b.x - a.x, dy = b.y - a.y, mx = p[j].x - p[k].x, my = p[j].y - p[k].y;
    if (nearCorner[j] || b.cap || b.dot || mx * dx + my * dy > -UNFOLD_BACK * Math.hypot(mx, my) * Math.hypot(dx, dy)) keep.push(j);
  }
  return keep.length === n || keep.length < 3 ? null : keep;
}
/** How plainly a heavier weight's moved outline must run back against the design's way to be taken out (unfolded: the
    cosine of the angle between, below its negative), and how many samples either side of a corner it never is. */
const UNFOLD_BACK = 0.3, UNFOLD_CORNER = 2;

/** An outline's points where it turns right back along itself taken out, until it turns back nowhere: a run of points
    left beyond where the outline goes on, back along the same line. */
function doubledBack(p: P[], design?: P[]) {
  // (how sharply the outline turns at point j of ring q: the cosine of its turn, -1 doubling back)
  const turn = (q: P[], k: number[], j: number) => {
    const n = k.length, a = q[k[(j - 1 + n) % n]], b = q[k[j]], c = q[k[(j + 1) % n]], ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    return lu < 1e-6 || lv < 1e-6 ? 1 : (ux * vx + uy * vy) / (lu * lv);
  };
  // (but not where the design turns back as sharply: a Didone's hairline serif's point)
  const all = p.map((_, i) => i), sharp = design && design.length === p.length ? all.map(i => turn(design, all, i) <= -0.97) : null;
  let idx = all;
  for (let pass = 0; pass < 64 && idx.length > 3; pass++) {
    const keep = idx.filter((k, j) => sharp?.[k] || turn(p, idx, j) > -0.97);
    if (keep.length === idx.length) break;
    idx = keep;
  }
  return idx.length === p.length ? p : idx.map(k => p[k]);
}

/** Whether the outlines cross themselves or each other anywhere (edges bucketed on a grid, so only near ones are tried). */
function crosses(rings: P[][]) {
  const CELL = 24, grid = new Map<number, number[]>(), segs: [P, P, number, number][] = [];
  rings.forEach((r, ri) => r.forEach((a, i) => segs.push([a, r[(i + 1) % r.length], ri, i])));
  segs.forEach(([a, b], k) => {
    for (let cx = Math.floor(Math.min(a.x, b.x) / CELL); cx <= Math.floor(Math.max(a.x, b.x) / CELL); cx++)
      for (let cy = Math.floor(Math.min(a.y, b.y) / CELL); cy <= Math.floor(Math.max(a.y, b.y) / CELL); cy++) {
        const key = cx * 100003 + cy, l = grid.get(key);
        if (l) l.push(k); else grid.set(key, [k]);
      }
  });
  for (const l of grid.values()) for (let u = 0; u < l.length; u++) for (let v = u + 1; v < l.length; v++) {
    const [a, b, ra, ia] = segs[l[u]], [c, d, rc, ic] = segs[l[v]];
    // (an edge and the next along the same outline meet at their shared point, which is no crossing)
    if (ra === rc) { const n = rings[ra].length, gap = Math.abs(ia - ic); if (gap <= 1 || gap === n - 1) continue; }
    const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, w = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
    if (t > 0 && t < 1 && w > 0 && w < 1) return true;
  }
  return false;
}

const ease = (v: number[], bs: Bone[], i: number, keep: (j: number) => boolean, reach = 3) => {
  let s = 0, ws = 0;
  for (const dir of [-1, 1]) for (let k = dir < 0 ? 0 : 1; k <= reach; k++) {
    const j = ((i + dir * k) % bs.length + bs.length) % bs.length;
    if (!keep(j)) break;
    const w = Math.exp(-(k * k) * 3 / (2 * reach * reach)); s += v[j] * w; ws += w;
  }
  return ws ? s / ws : v[i];
};

/** The measures `to` asks of the rigged letter drawn at m0, only those that reach it taken. */
function reaching(rig: SkinRig, m0: SkinMeasures, to: SkinMeasures): SkinMeasures {
  const c = rig.ctx;
  // only what moves this letter counts (Crossbar a letter with a bar, the x-height the lowercase, the
  // serifs' size one with serifs), so a letter another setting doesn't reach is the one already drawn
  // (Stem length the lowercase, whose ascenders and descenders it draws out, the dots' size a letter with a dot,
  // Inner space only as far as it widens this letter, Joints a letter where strokes meet)
  const round = ROUND.has(c.ch), dots = rig.bones.some(bs => bs[0]?.dot);
  return {
    ...to, bar: c.barY != null ? to.bar : m0.bar, xr: c.lower ? to.xr : m0.xr, serif: rig.serifs ? to.serif : m0.serif,
    asc: c.lower ? to.asc : m0.asc, desc: c.lower ? to.desc : m0.desc, cntR: round ? to.cntR : m0.cntR, cntN: round ? m0.cntN : to.cntN,
    dot: dots ? to.dot : m0.dot, pinchPos: to.pinch || m0.pinch ? to.pinchPos : m0.pinchPos, joints: to.joints !== m0.joints && joinsNear(rig).some(n => n.some(Boolean)) ? to.joints : m0.joints
  };
}

/** How far a lighter weight's letter as skinMove gave it reached either side as moved, before its outline was tidied
    (movedOnce): a tip whose sides crossed as they thinned (a blackletter's spurs and flags) is cut off as a fold all at
    once, the letter's room with it, where its outline as moved goes in as the weight does. Undefined where it wasn't
    read so (a letter drawn as its strokes near the pick, or between two drawings). */
export const skinSpan = (out: Node[][]) => SPANS.get(out);
const SPANS = new WeakMap<Node[][], [number, number]>();

/** How much further out a heavier letter's side bearings go, left and right, in the font's units (freeGlyph). A letter's
    room is read off its ink's furthest reach, which a serif's tip or a bar's end keeps as the strokes thicken, while the
    stroke under it grows out toward it: a typewriter m's stems out under its slabs, a Didone b's under its head serif,
    and two letters side by side came nearer there, to touching (Typewriter's m and w ran 24 units into each other at
    Verticals 100, Couture's f's flag 19 into a b). At ROOM_ROWS heights, each side of the letter as moved stands no
    nearer the edge of its room than the design's does about that height (within half as far as its strokes grew
    thicker, the height a bar thickened over taking its end's room; a script's within ROOM_LEANS of it, its capitals' at
    it), or than ROOM_REACH of the font's stem, the less: its stems keep the room they had, and a T's, far in under its
    bar, may come nearer as it grows. `sb` is the design's side bearings as the settings draw them, in the font's units.
    Only where the upright strokes thicken, which grow out sideways (a bar thickened grows up and down, and the x-height
    and Cursive leave the stems as they are), from nothing as they begin to. */
export function skinRoom(rig: SkinRig, m0: SkinMeasures, to: SkinMeasures, out: Node[][], sb: [number, number]): [number, number] {
  const m1 = reaching(rig, m0, to);
  if (out === rig.contours) return [0, 0];
  const mv = moveMap(rig, m0, m1), { kv, kh, sx } = mv;
  if (mv.lighter || kv <= 1 + ROOM_FROM) return [0, 0];
  let w = drawnSides.get(rig);
  if (!w) {
    // (the design's read finely once, and the least of each run of its heights kept by powers of two, so the heights
    // about any can be read off it at once)
    const polys = polysOf(rig.contours, 4);
    let lo = Infinity, hi = -Infinity;
    for (const r of polys) for (const q of r) { lo = Math.min(lo, q.y); hi = Math.max(hi, q.y); }
    const { l, r } = sidesAt(polys, curvesReach(rig.contours), Array.from({ length: ROOM_FINE }, (_, j) => lo + (hi - lo) * j / (ROOM_FINE - 1)), roomSlope(rig));
    const runs = (d: number[]) => { const t = [d]; for (let k = 1; 1 << k <= d.length; k++) { const u = t[k - 1], h = 1 << (k - 1); t.push(u.slice(0, d.length - (1 << k) + 1).map((v, i) => Math.min(v, u[i + h]))); } return t; };
    w = { lo, hi, l: runs(l), r: runs(r) };
    drawnSides.set(rig, w);
  }
  const ref = rig.ref(), grew = Math.max(0, (kv - 1) * ref.stem, (kh - 1) * ref.hair) / 2 * (rig.leans() ? (rig.ctx.lower ? ROOM_LEANS : ROOM_LEANS_CAPS) : 1), most = ROOM_REACH * ref.stem, { lo, hi } = w;
  // (the design's least within `grew` of a height, read between its fine heights at the ends)
  const step = (hi - lo) / (ROOM_FINE - 1);
  const at = (d: number[], i: number) => { const j = Math.min(ROOM_FINE - 2, Math.floor(i)); return d[j] + (d[j + 1] - d[j]) * (i - j); };
  const about = (t: number[][], y: number) => {
    const i0 = Math.min(ROOM_FINE - 1, Math.max(0, (y - grew - lo) / step)), i1 = Math.max(0, Math.min(ROOM_FINE - 1, (y + grew - lo) / step));
    let v = Math.min(at(t[0], i0), at(t[0], i1));
    const a = Math.ceil(i0), b = Math.floor(i1);
    if (b >= a) { const k = 31 - Math.clz32(b - a + 1); v = Math.min(v, t[k][a], t[k][b - (1 << k) + 1]); }
    return v;
  };
  // (how much further out the side must go for ink `c` in from its edge at the design's height y; none is read where even
  // ROOM_REACH of the stem in wouldn't ask more than already found)
  const more = (t: number[][], y: number, s: number, c: number, add: number) => (most - (s + c) <= add ? add : Math.max(add, Math.min(s + about(t, y) * sx, most) - (s + c)));
  // the letter as moved read where the move takes each of the design's heights, its lines moved with the x-height
  const polys = polysOf(out, 4), [x0, x1] = curvesReach(out);
  const ys = Array.from({ length: ROOM_ROWS }, (_, k) => lo + (hi - lo) * (k + 0.5) / ROOM_ROWS), now = sidesAt(polys, [x0, x1], ys.map(mv.gy), roomSlope(rig));
  let l = 0, r = 0;
  ys.forEach((y, k) => { l = more(w.l, y, sb[0], now.l[k], l); r = more(w.r, y, sb[1], now.r[k], r); });
  // and at each point of it, at the design's height the move takes there: a corner standing out from its side, the
  // bracket's at an R's leg's foot, read where it is, not as the heights it passes between read it (the heights the
  // move takes the design's to read back, where its lines moved)
  const G = [lo, (lo + hi) / 2, hi].every(y => Math.abs(mv.gy(y) - y) < 1e-6) ? null : Array.from({ length: ROOM_ROWS + 1 }, (_, j) => mv.gy(lo + (hi - lo) * j / ROOM_ROWS));
  const back = (y: number) => {
    if (!G) return y;
    if (y <= G[0]) return lo;
    if (y >= G[ROOM_ROWS]) return hi;
    let a = 0, b = ROOM_ROWS;
    while (b - a > 1) { const c = (a + b) >> 1; if (G[c] <= y) a = c; else b = c; }
    return lo + (hi - lo) * (a + (y - G[a]) / Math.max(1e-9, G[b] - G[a])) / ROOM_ROWS;
  };
  // (a script's every ROOM_STEP units along its outline, read off what it was traced from where it was: ROOM_CURVES)
  for (const ring of rig.leans() ? alongEvery(out.map(c => TRACED.get(c) ?? polysOf([c], ROOM_CURVES)[0]), ROOM_STEP) : polys) for (const q of ring) {
    const cl = q.x - x0, cr = x1 - q.x;
    if (most - (sb[0] + cl) <= l && most - (sb[1] + cr) <= r) continue;
    const y = back(q.y);
    l = more(w.l, y, sb[0], cl, l); r = more(w.r, y, sb[1], cr, r);
  }
  // (no more than the stems grew thicker: a letter moved at all is drawn a little otherwise than as the font has it,
  // Jotter's G's jaw 12 units further out at the first nudge of Weight, which its room isn't to take at once)
  const grown = (kv - 1) * ref.stem;
  return [Math.min(l, grown), Math.min(r, grown)];
}
/** How much further in ink off a height reads, for each unit off it, beside a letter (skinRoom): a script's capital's
    ROOM_SLOPE_LEANS. */
const roomSlope = (rig: SkinRig) => (rig.leans() && !rig.ctx.lower ? ROOM_SLOPE_LEANS : ROOM_SLOPE);
/** Rings with points put in along each edge longer than `step`, evenly. */
const alongEvery = (rings: P[][], step: number): P[][] => rings.map(ring => ring.flatMap((p, i) => {
  const q = ring[(i + 1) % ring.length], n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / step));
  return Array.from({ length: n }, (_, k) => ({ x: p.x + (q.x - p.x) * k / n, y: p.y + (q.y - p.y) * k / n }));
}));
/** How far from a point on a rig's outline as drawn the way (dx, dy), a unit, runs across its paper to ink again
    (Infinity where it meets none): its outline read as polygons, kept. */
function paperAlong(rig: SkinRig, p: P, dx: number, dy: number): number {
  let ps = drawnPolys.get(rig);
  if (!ps) drawnPolys.set(rig, ps = polysOf(rig.contours, 4));
  let t = Infinity;
  for (const ring of ps) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const s = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den, u = ((a.x - p.x) * dy - (a.y - p.y) * dx) / den;
    if (s > 1 && s < t && u >= 0 && u <= 1) t = s;
  }
  return t;
}
const drawnPolys = new WeakMap<SkinRig, P[][]>();
/** Each rig's sides as drawn, read at ROOM_FINE heights from its lowest to its highest (sidesAt), each with the least of
    its runs of 2, 4, 8 and so on heights from each, kept for skinRoom. */
const drawnSides = new WeakMap<SkinRig, { lo: number; hi: number; l: number[][]; r: number[][] }>();
/** An outline as polygons, `n` points along each curve. */
const polysOf = (cs: Node[][], n: number): P[][] => cs.map(cn => cn.flatMap((a, i) => {
  const b = cn[(i + 1) % cn.length];
  return a.ox === undefined && b.ix === undefined ? [{ x: a.x, y: a.y }] : Array.from({ length: n }, (_, k) => bez(a, b, k / n));
}));
/** How far left and right an outline's curves reach (as inkSpan in free-letters.ts reads a letter's room: its points
    and where a curve turns back across, not its handles). */
function curvesReach(cs: Node[][]): [number, number] {
  let x0 = Infinity, x1 = -Infinity;
  for (const c of cs) for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x);
    if (a.ox === undefined && b.ix === undefined) continue;
    const p0 = a.x, p1 = a.ox ?? a.x, p2 = b.ix ?? b.x, p3 = b.x, A = -p0 + 3 * p1 - 3 * p2 + p3, B = 2 * (p0 - 2 * p1 + p2), C = p1 - p0;
    const ts = Math.abs(A) < 1e-12 ? (Math.abs(B) < 1e-12 ? [] : [-C / B]) : B * B - 4 * A * C < 0 ? [] : [1, -1].map(sg => (-B + sg * Math.sqrt(B * B - 4 * A * C)) / (2 * A));
    for (const t of ts) if (t > 0 && t < 1) { const u = 1 - t, x = u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  }
  return [x0, x1];
}
/** How far in from the furthest it reaches either side, [x0, x1], a letter's ink (as polygons) lies at each height of
    `ys`, ink off a height read as ROOM_SLOPE times as far in again as it is off it: so it changes only as far as the
    ink moves, with no step where a stroke's end comes to a height or leaves it (along each edge least at an end or
    where it crosses the height, each of which is tried). */
function sidesAt(polys: P[][], [x0, x1]: [number, number], ys: number[], slope: number) {
  const l: number[] = [], r: number[] = [];
  for (const y of ys) {
    let a = Infinity, z = Infinity;
    for (const ring of polys) for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      if ((p.y > y) !== (q.y > y)) { const x = p.x + (q.x - p.x) * (y - p.y) / (q.y - p.y); if (x - x0 < a) a = x - x0; if (x1 - x < z) z = x1 - x; }
      const off = slope * Math.abs(p.y - y);
      if (off >= a && off >= z) continue;
      if (p.x - x0 + off < a) a = p.x - x0 + off;
      if (x1 - p.x + off < z) z = x1 - p.x + off;
    }
    l.push(a); r.push(z);
  }
  return { l, r };
}
/** How far rings reach, left and right. */
function xSpan(rings: P[][]): [number, number] {
  let x0 = Infinity, x1 = -Infinity;
  for (const r of rings) for (const q of r) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; }
  return [x0, x1];
}

/** The rigged letter moved from the measures it was drawn at (m0) toward `to`, only the measures that reach this
    letter taken (m1); its outline traced back into curves. */
export function skinMove(rig: SkinRig, m0: SkinMeasures, to: SkinMeasures): Node[][] {
  const m1 = reaching(rig, m0, to);
  if (sameMeasures(m0, m1)) return rig.contours;
  const key = [m0, m1].map(m => MEASURES.map(k => m[k].toFixed(4)).join()).join('|');
  const kept = rig.moves.get(key);
  if (kept) return kept;
  const out = moveRig(rig, m0, m1);
  if (rig.moves.size >= MOVES_KEPT) rig.moves.delete(rig.moves.keys().next().value!);
  rig.moves.set(key, out);
  return out;
}

/** The rigged letter thickened or thinned from m0 toward `to` as a drawing of straight edges and rounds is (a letter
    drawn in Points, see family-drawn.ts), its heights and width kept. Each straight edge moves out or in by its stroke's
    change of thickness: an upright or level one whole, a slanted one along a line that may bend where its stroke
    narrows; one lying on one of the letter's lines, or ending a stroke, stays. Each corner between two straight edges
    goes where they meet again, and each run of curves between two is carried whole with the corner the two make, so a
    round keeps its shape (one on the outside of the corner made smaller or larger as the edges move in or out), unless
    that takes a point of it into or out of its ink further than its own stroke thins or thickens: then its ends go
    with their edges and the rest is stretched between them. No corner, round or handle goes further into the ink
    before it than the outline across from it leaves room for (a counter's corner under a hairline stays under it), and
    upright and level edges stay so. A contour with no straight edge moves each point as its own sample does
    (edgeMoves). Long curves are cut in pieces first, so a point along one can be held back. Every point and handle is
    the outline's own, moved. Null where the outline so moved crosses itself (edges moved past the ones across from
    them), for family-drawn.ts to move it less far. */
export function skinEdges(rig: SkinRig, m0: SkinMeasures, to: SkinMeasures): Node[][] | null {
  const m1 = reaching(rig, m0, to);
  if (sameMeasures(m0, m1)) return rig.contours;
  // (kept by the measures, as a family's styles ask again for the ones they were drawn at)
  let kept = edgeMovesKept.get(rig);
  if (!kept) { kept = new Map(); edgeMovesKept.set(rig, kept); }
  const key = [m0, m1].map(m => MEASURES.map(k => m[k].toFixed(4)).join()).join('|');
  if (kept.has(key)) return kept.get(key)!;
  const moved = edgesMoved(rig, m0, m1);
  if (kept.size >= EDGE_MOVES_KEPT) kept.delete(kept.keys().next().value!);
  kept.set(key, moved);
  return moved;
}

/** The ways skinEdges moved each rig, by the measures it moved it from and to (as many as a family has styles, and some). */
const edgeMovesKept = new WeakMap<SkinRig, Map<string, Node[][] | null>>();
const EDGE_MOVES_KEPT = 40;

/** skinEdges, the rig moved from m0 to m1 (the measures that reach it). */
function edgesMoved(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures): Node[][] | null {
  const mv = moveMap(rig, m0, m1), c = rig.ctx, lines = [0, c.cap, ...(c.lower ? [c.xh, c.asc, c.desc] : [])];
  // how far the ink reaches from point p, the way (ux, uy) goes, to the outline (read as polygons, a few points along
  // each curve; its contours don't overlap, so inside is inside an odd number of them); no limit the way out of it
  let polys = outlines.get(rig);
  if (!polys) {
    polys = rig.contours.map(cn => cn.flatMap((a, i) => {
      const b = cn[(i + 1) % cn.length];
      return a.ox === undefined && b.ix === undefined ? [{ x: a.x, y: a.y }] : Array.from({ length: 8 }, (_, k) => bez(a, b, k / 8));
    }));
    outlines.set(rig, polys);
  }
  const inkAhead = (p: P, ux: number, uy: number, fixed?: { on: boolean }) => {
    let best = Infinity, flat = false;
    for (const ring of polys!) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], sx = b.x - a.x, sy = b.y - a.y, den = ux * sy - uy * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den, w = ((a.x - p.x) * uy - (a.y - p.y) * ux) / den;
      if (t > 0.5 && w >= 0 && w <= 1 && t < best) { best = t; flat = Math.abs(sy) < 1e-6 && lines.some(L => Math.abs(a.y - L) < 2.5); }
    }
    if (fixed) fixed.on = flat;
    const q = { x: p.x + ux * 0.5, y: p.y + uy * 0.5 };
    return polys!.reduce((k, ring) => k !== inPoly(ring, q), false) ? best : Infinity;
  };
  // how far a corner (or a round) at p may go the way (ux, uy): CORNER_IN of the ink before it, as the outline across
  // from it may come as far toward it; nearly all of it where that lies on one of the letter's lines, which stays
  const reach = (p: P, ux: number, uy: number) => { const f = { on: false }, d = inkAhead(p, ux, uy, f); return d * (f.on ? 0.95 : CORNER_IN); };
  const out = rig.contours.map((c0, r) => {
    const bs = rig.bones[r], { moved } = edgeMoves(bs, r, mv);
    const bySeg: number[][] = c0.map(() => []);
    bs.forEach((b, i) => bySeg[b.seg].push(i));
    // (a long curve cut in pieces, the same curve, so a point along it can be held back where its ink is thin; each point
    // read by its own sample, the nearest, and each piece by the segment it is cut from)
    const { cn, own, seg } = cutCurves(c0, bs, bySeg, c.cap * LONG_CURVE), n = cn.length;
    // each straight edge: its ends, its inward normal (as its samples read it), and how far each end (and each bend)
    // moves out. Each sample goes as far as its stroke thickens or thins, its half-thickness read straight across from it
    // (w0) or as the paper's distance from the stroke's middle (`best`), the less (straight across from a flare's side,
    // above the round of a counter beside it, runs on through the stem it flares from); what lies within that of either
    // end of the edge (half of it, of an upright or level edge, which may be a short stub's side) is left out, as a join
    // there reads the stroke thicker and a hairline run into it thinner. An upright or level edge stays so, moved whole
    // no further than all but a fifth of it goes; a slanted one follows its samples' moves along it, in one straight
    // line, or bent once or stepped (a wedge run into a hairline thins all along; an edge that is a flare's side for a
    // stretch and a hairline's after bends where the two meet), drawn back as far as it went past any of them, and
    // carried on to its ends no further than they went. One lying on one of the letter's lines, or cut across a stroke's
    // end, stays
    const middle = (v: number[]) => v.slice().sort((p, q) => p - q)[v.length >> 1];
    const edges = cn.map((a, i): EdgeMove | null => {
      const b = cn[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy), on = bySeg[seg[i]].filter(j => !bs[j].corner);
      if (a.ox !== undefined || b.ix !== undefined || l < c.cap * SHORT_EDGE || !on.length) return null;
      let nx = -dy / l, ny = dx / l;
      const s0 = bs[on[on.length >> 1]];
      if (s0.nx * nx + s0.ny * ny < 0) { nx = -nx; ny = -ny; }
      const onLine = Math.abs(ny) > 0.97 && lines.some(L => Math.abs(a.y - L) < 2.5 && Math.abs(b.y - L) < 2.5);
      if (onLine || on.filter(j => crossEnd(bs[j])).length * 2 > on.length) return { a, b, nx, ny, da: 0, db: 0 };
      // (nor where it ends a stroke the rig took for one running across it: where the ink a little way in from it is
      // about as wide as it is, and reaches in from it at least as far; and where it reaches in only about as far as it
      // is wide there (a block about as tall as it is wide, a stub hanging from a bar, reads either way), where, upright
      // or level, it runs across the way the design's heavy strokes run (a level edge where the verticals are the
      // heavier, an upright one where the horizontals are))
      const w2 = 2 * middle(on.map(j => bs[j].w0)), depth = 0.25 * Math.min(w2, l), mx = (a.x + b.x) / 2 + nx * depth, my = (a.y + b.y) / 2 + ny * depth;
      const across = inkAhead({ x: mx, y: my }, dx / l, dy / l) + inkAhead({ x: mx, y: my }, -dx / l, -dy / l);
      const crosswise = Math.abs(ny) > 0.98 ? m0.v >= m0.hT : Math.abs(nx) > 0.98 ? m0.hT >= m0.v : true;
      if (w2 >= 0.8 * l && across <= 1.6 * l && (w2 >= 1.5 * across || crosswise)) return { a, b, nx, ny, da: 0, db: 0 };
      // (an upright or level edge, a stroke's side all along, reads its stroke as thick as it reads anywhere along it
      // (`best` shrinks toward a short stub's free end, which lies nearer than its sides))
      const level = Math.abs(nx) > 0.98 || Math.abs(ny) > 0.98, widest = Math.max(...on.map(j => bs[j].best));
      const pts = on.map(j => {
        const p = bs[j], h = Math.min(p.w0, level ? widest : p.best), d = (mv.weighs({ ...p, w: h }) * mv.keeps(p, r, j) - 1) * h;
        return { t: ((p.x - a.x) * dx + (p.y - a.y) * dy) / (l * l), h, v: d > 0 ? Math.min(d, p.gap * OPEN) : d };
      });
      const skip = level ? 0.5 : 1, inner = pts.filter(q => q.t * l > q.h * skip && (1 - q.t) * l > q.h * skip), use = inner.length >= 3 ? inner : pts;
      // (each sample read as the middle of it and its neighbours: a sample reads its stroke a little off now and then)
      const v = use.map((_, k) => middle(use.slice(Math.max(0, k - 2), k + 3).map(q => q.v))), t = use.map(q => q.t);
      const inward = middle(v) < 0, lo = Math.min(...v), hi = Math.max(...v);
      // (a level stroke lying on one of the letter's lines, a bar along the capitals' height or the baseline, thickens
      // or thins wholly from this side, as its far side stays on the line)
      const far = Math.abs(ny) > 0.98 && lines.some(L => Math.abs(a.y + ny * w2 - L) < 3);
      // (as far as all but a fifth of it goes, the least of them: an edge whose stroke narrows along it, a flare's side,
      // goes no further than its narrower stretch lets it)
      if (level) { const d = v.slice().sort((p, q) => (inward ? q - p : p - q))[Math.floor((v.length - 1) * 0.2)] * (far ? 2 : 1); return { a, b, nx, ny, da: d, db: d }; }
      const fit = bentLine(t, v, Math.max(2, 0.08 * Math.max(-lo, hi)), l);
      const back = Math.max(0, ...t.map((u, k) => (inward ? v[k] - fit.at(u) : fit.at(u) - v[k])));
      const at = (u: number) => Math.min(hi, Math.max(lo, fit.at(u) + (inward ? back : -back)));
      return { a, b, nx, ny, da: at(0), db: at(1), bends: fit.bends.map(u => ({ t: u, d: at(u) })) };
    });
    type Edge = EdgeMove;
    // where two lines meet (each through a point, running one way), unless they run alike
    const cross = (p: P, u: P, q: P, w: P): P | null => {
      const det = u.x * w.y - u.y * w.x;
      if (Math.abs(det) < 0.25 * Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y)) return null;
      const s = ((q.x - p.x) * w.y - (q.y - p.y) * w.x) / det;
      return { x: p.x + u.x * s, y: p.y + u.y * s };
    };
    // how far an edge's start and end move, straight out from it; where a place along it (0 to 1) moves to, out `d`;
    // and its first and last stretch, moved (the whole of it, but where it bends)
    const shiftA = (e: Edge): P => ({ x: -e.nx * e.da, y: -e.ny * e.da }), shiftB = (e: Edge): P => ({ x: -e.nx * e.db, y: -e.ny * e.db });
    const way = (p: P, q: P): P => ({ x: q.x - p.x, y: q.y - p.y });
    const movedAt = (e: Edge, u: number, d: number): P => ({ x: e.a.x + (e.b.x - e.a.x) * u - e.nx * d, y: e.a.y + (e.b.y - e.a.y) * u - e.ny * d });
    const bendsAt = (e: Edge) => (e.bends ?? []).map(q => movedAt(e, q.t, q.d)), ends = (e: Edge) => [movedAt(e, 0, e.da), ...bendsAt(e), movedAt(e, 1, e.db)];
    const first = (e: Edge) => ends(e).slice(0, 2), last = (e: Edge) => ends(e).slice(-2);
    // the corner two edges make (e1 coming in, e2 going out), and how far it moves as they meet again: not much further
    // than they moved (a sharp corner's would run far out); null where they run alike
    const meet = (e1: Edge, e2: Edge): { C: P; T: P } | null => {
      const [p1, q1] = last(e1), [p2, q2] = first(e2);
      const C = cross(e1.a, way(e1.a, e1.b), e2.a, way(e2.a, e2.b)), C1 = cross(p1, way(p1, q1), p2, way(p2, q2));
      if (!C || !C1) return null;
      let x = C1.x - C.x, y = C1.y - C.y;
      const lim = 1.6 * Math.max(Math.abs(e1.db), Math.abs(e2.da)), l = Math.hypot(x, y);
      if (l > lim) { x *= lim / l; y *= lim / l; }
      return { C, T: { x, y } };
    };
    // how far each point moves, and for one on a round made smaller or larger, by how much and about which point
    const K: ({ f: number; c: P } | null)[] = cn.map(() => null), stretched = cn.map(() => false);
    const D: P[] = cn.map((_, i) => {
      const j = own[i];
      return { x: -bs[j].nx * moved[j], y: -bs[j].ny * moved[j] };
    });
    if (edges.some(Boolean)) for (let i = 0; i < n; i++) {
      const e1 = edges[(i - 1 + n) % n], e2 = edges[i];
      if (e1 && e2) {
        const s1 = shiftB(e1), s2 = shiftA(e2), T = meet(e1, e2)?.T ?? { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 };
        // (a corner goes no further into the ink before it, the way it goes, than reach allows, as the outline across
        // from it comes toward it too: one pointing into a hairline, a counter's corner under a thin bar, stays under it,
        // and the corners of a foot drawn narrower don't pass each other; nor, straight ahead of it, further than nine
        // tenths of what lies across from it there (w0). Held back, it goes as far the same way)
        const l = Math.hypot(T.x, T.y), most = l > 1e-6 ? reach(cn[i], T.x / l, T.y / l) : Infinity;
        const U = l > most ? { x: T.x * most / l, y: T.y * most / l } : T, p = bs[own[i]], into = U.x * p.nx + U.y * p.ny, half = 0.9 * p.w0;
        D[i] = into > half ? { x: U.x * half / into, y: U.y * half / into } : U;
        continue;
      }
      if (!e1 || e2) continue;
      // a run of curves from here to the next straight edge
      const run = [i];
      for (let k = i; !edges[k]; ) { k = (k + 1) % n; run.push(k); }
      const last = run[run.length - 1], e3 = edges[last]!, met = meet(e1, e3);
      const a = cn[i], b = cn[last], s1 = shiftB(e1), s3 = shiftA(e3), ux = b.x - a.x, uy = b.y - a.y, l2 = ux * ux + uy * uy || 1;
      // how far a point of it may go out of its ink (in, negative): no further than its own stroke thickens or thins,
      // and a little more (in, a share of what is left of its half of the stroke)
      const room = (k: number, d: P) => {
        const j = own[k], p = bs[j], m = moved[j], out = d.x * -p.nx + d.y * -p.ny;
        return { p, out, o1: Math.min(Math.max(0, m) + HOLD * p.w, Math.max(Math.min(0, m) - HOLD * Math.max(0, p.w + Math.min(0, m)), out)) };
      };
      // carried whole with the corner its edges make, where none of it goes so further than it may; and a round on the
      // outside of that corner (the corner out in the paper) made as much smaller or larger about it as the edges move
      // in or out, as the outline of a thinner or thicker stroke rounds its corners (one inside, an ink trap or a
      // counter's, keeps its size)
      if (met) {
        // (the corner carried no further into the ink before the round than reach allows, as a corner)
        const { C } = met, ss = bySeg[seg[run[(run.length - 1) >> 1]]], mid = bs[ss[ss.length >> 1]];
        const tl = Math.hypot(met.T.x, met.T.y), most = tl > 1e-6 ? reach(cn[run[run.length >> 1]], met.T.x / tl, met.T.y / tl) : Infinity;
        const T = tl > most ? { x: met.T.x * most / tl, y: met.T.y * most / tl } : met.T;
        const L = (Math.hypot(a.x - C.x, a.y - C.y) + Math.hypot(b.x - C.x, b.y - C.y)) / 2, dm = Math.abs(e1.db) > Math.abs(e3.da) ? e1.db : e3.da;
        const f = (C.x - mid.x) * mid.nx + (C.y - mid.y) * mid.ny < 0 && L > 1 ? Math.max(ROUND_KEPT, 1 + dm / L) : 1;
        const at = (k: number): P => ({ x: T.x + (cn[k].x - C.x) * (f - 1), y: T.y + (cn[k].y - C.y) * (f - 1) });
        if (run.every((k, r) => r === 0 || r === run.length - 1 || Math.abs(room(k, at(k)).o1 - room(k, at(k)).out) < 1)) {
          for (const k of run) { D[k] = T; if (f !== 1) K[k] = { f, c: C }; }
          continue;
        }
      }
      // else each end with its own edge, straight out from it, and the rest stretched between them, each point going no
      // further than it may (a round under a hairline stays under it, as the corner its edges make runs up through it)
      run.forEach((k, r) => {
        const t = Math.min(1, Math.max(0, ((cn[k].x - a.x) * ux + (cn[k].y - a.y) * uy) / l2));
        const d = { x: s1.x + (s3.x - s1.x) * t, y: s1.y + (s3.y - s1.y) * t };
        stretched[k] = true;
        if (r === 0 || r === run.length - 1) { D[k] = r ? s3 : s1; return; }
        const { p, out, o1 } = room(k, d);
        D[k] = { x: d.x - p.nx * (o1 - out), y: d.y - p.ny * (o1 - out) };
      });
    }
    // (and no handle of a curve, nor point of a round stretched between its edges, goes further into the ink before it
    // than it may (reach): a round's ends, carried out with their edges, stop short of a hairline, and the handles of a
    // round carried up under one, and the curve, which keeps within its handles, with them; a round made smaller or
    // larger goes with its corner)
    const held = (p: P, d: P, ok: boolean): P => {
      const l = Math.hypot(d.x, d.y), most = l > 1e-6 && ok ? reach(p, d.x / l, d.y / l) : Infinity;
      return l > most ? { x: d.x * most / l, y: d.y * most / l } : d;
    };
    D.forEach((d, i) => { D[i] = held(cn[i], d, stretched[i]); });
    // (an upright or level edge stays so: where its ends were held back unequally, both go as far out as the nearer)
    edges.forEach((e, i) => {
      const j = (i + 1) % n;
      if (!e || e.bends?.length || K[i] || K[j] || !(Math.abs(e.nx) > 0.98 || Math.abs(e.ny) > 0.98)) return;
      const na = D[i].x * e.nx + D[i].y * e.ny, nb = D[j].x * e.nx + D[j].y * e.ny, c = Math.abs(na) < Math.abs(nb) ? na : nb;
      D[i] = { x: D[i].x + e.nx * (c - na), y: D[i].y + e.ny * (c - na) };
      D[j] = { x: D[j].x + e.nx * (c - nb), y: D[j].y + e.ny * (c - nb) };
    });
    const DI = D.map((d, i) => (cn[i].ix === undefined ? d : held({ x: cn[i].ix!, y: cn[i].iy! }, d, !K[i])));
    const DO = D.map((d, i) => (cn[i].ox === undefined ? d : held({ x: cn[i].ox!, y: cn[i].oy! }, d, !K[i])));
    // (an edge that bends gets a point at each bend)
    return cn.flatMap((p, i): Node[] => {
      const k = K[i], to = (u: number, v: number, { x, y }: P) => (k ? [u + x + (u - k.c.x) * (k.f - 1), v + y + (v - k.c.y) * (k.f - 1)] : [u + x, v + y]);
      const q: Node = { ...p }, e = edges[i];
      [q.x, q.y] = to(p.x, p.y, D[i]);
      if (p.ix !== undefined) [q.ix, q.iy] = to(p.ix, p.iy!, DI[i]);
      if (p.ox !== undefined) [q.ox, q.oy] = to(p.ox, p.oy!, DO[i]);
      return [q, ...(e ? bendsAt(e) : [])];
    });
  });
  // (read as polygons, a few points along each curve, for the crossing test)
  const rings = out.map(cn => cn.flatMap((a, i) => Array.from({ length: 8 }, (_, k) => bez(a, cn[(i + 1) % cn.length], k / 8))));
  return crosses(rings) ? null : out;
}

/** Where the settings put a rigged letter's points: its heights (gy, and gyDot for a dot), its width (gx, sx as much
    wider), how much its strokes thicken (kv upright, kh level), its serifs reach (ks) and its dots grow (kd), and
    how much of its thickness each stroke keeps (Pinch and Joints). top and top1 are the height the letter stands to
    (the x-height or the capitals') before and after. */
interface MoveMap {
  gy: (y: number) => number; gyDot: (y: number) => number; gx: (x: number) => number;
  top: number; top1: number; sx: number; kv: number; kh: number; ks: number; kd: number;
  /** how much thinner Verticals (or Contrast turned round) draw the uprights than Weight alone does (1, no thinner): what
      a lighter weight's hairline floor takes from its weight, family.ts's, these thin past (thinMoves, hairFloor) */ past: number;
  /** how far apart from the bars they so thin, eased: 0 none, 1 from PAST_EASE past Weight on (strokeRs, carryCuts) */ apart: number;
  /** a lighter weight: the stems themselves drawn thinner (Weight or Verticals), not only their pen turned or pinched */ lighter: boolean;
  /** not that, and its stems or its bars drawn thicker or thinner (by REWEIGHED or more): Weight, Verticals, Horizontals
      or Contrast moved, whose moves are tidied after (see movedOnce) */ reweighed: boolean;
  /** how much each edge's stroke thickens (thins, under 1) by Weight and Contrast, before Pinch and Joints */ weighs: (b: Bone) => number;
  keeps: (b: Bone, r: number, i: number) => number;
  /** half the thickness of the stroke each edge is weighed as (Bone.w, or, Contrast turned round, as read whole, sideHalf) */ half: (b: Bone) => number;
  /** the design's bars CONTRASTY of its stems or thinner: a fat face's, a Didone's */ contrasty: boolean;
}

/** How a lighter weight draws a rig's strokes alone (thinStrokes' `drawn`): 2 read along its straight strokes (linedRig),
    1 on the skeleton its ink's middle reads (a font of heavy even strokes, a wood type), else 0. */
function drawnMode(rig: SkinRig): 0 | 1 | 2 {
  return LINED.has(thinSkeleton(rig)) ? 2 : rig.stroked() || rig.shortSlabs() ? 1 : 0;
}

/** A letter drawn as its strokes (not moved), a little lighter than the font as picked, in from the design: within
    PICK_BLEND of the design's stems, the strokes united with the letter moved as a heavier weight is (its moves go on
    from the design), its stems thinning faster than the strokes do, from the design's own at the pick to PICK_THIN
    thinner than the strokes' at PICK_BLEND. Drawn as strokes alone from the first hair lighter, a letter was other
    than the design at once (a tapering arm made even, a notch where a bowl meets a stem filled), and its room jumped:
    an A 35 units narrower. */
function fromPick(rig: SkinRig, lined: SkinRig, m0: SkinMeasures, m1: SkinMeasures, out: Node[][]): Node[][] {
  const t = (1 - m1.v / m0.v) / PICK_BLEND;
  if (t >= 1) return reachOn(rig, m0, m1, t, out, out.slice());
  const e = (1 - t) ** 2 * PICK_GROW * rig.ref().stem;
  if (e <= 0.5) return reachOn(rig, m0, m1, t, out, out.slice());
  const k = 1 - PICK_THIN * t, moved = movedOnce(rig, m0, { ...m1, s: m1.s * k, hT: m1.hT * k, v: m1.v * k }, 'moved', true).out;
  // (the moved letter within the design's ink: a wood type's arm, moved without its slab, runs out past where the slab
  // ended)
  // (and within as far of the strokes as it lies nearer the pick than PICK_BLEND (squared), out to PICK_GROW of the
  // font's stem at the pick: the strokes drawn again so much thicker, read every third point, where the letter moved,
  // rougher, pokes out past them, and as it thins, out past where its strokes end, a K's leg's foot)
  const mv = moveMap(lined, m0, m1);
  const near = shape(thinStrokes(lined, mv, R => R + e, undefined, drawnMode(lined)).map(r => r.filter((_, i) => i % 3 === 0 || r.length < 9).map(p => ({ x: mv.gx(p.x), y: mv.gy(p.y) }))).map(r => (signedArea(r) < 0 ? r.slice().reverse() : r)), true);
  const A = shape(out.map(ringOf)), B = shape(moved.map(ringOf)), ink = letterInk(rig, moveMap(rig, m0, m1));
  return reachOn(rig, m0, m1, t, out, tidyRings(combine([A, B, ink, near], (x, y) => A.has(x, y) || (B.has(x, y) && ink.has(x, y) && near.has(x, y))), rig.ctx.cap));
}

/** A letter drawn as its strokes near the pick (fromPick), `got` (`out` its strokes alone): its reach (skinSpan) f of the
    way from the strokes' to the design's where the move puts it, f going from 1 at the pick to none PICK_ROOM times as
    far below it as PICK_BLEND. Its ink goes from the design's to the strokes' within PICK_BLEND, the strokes' square
    ends drawn in from the design's sharp corners at once under the pick: a geometric K's and k's feet's corners, past
    their strokes' ends, went with 15 units of room within a few hundredths of Weight, a step in the sweep. */
function reachOn(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures, t: number, out: Node[][], got: Node[][]): Node[][] {
  const f = 1 - t / PICK_ROOM;
  if (f <= 0) return got;
  let d = PICK_REACH.get(rig);
  if (!d) PICK_REACH.set(rig, d = xSpan(rig.contours.map(ringOf)));
  const { gx } = moveMap(rig, m0, m1), z = xSpan(out.map(ringOf)), a = gx(d[0]), b = gx(d[1]);
  SPANS.set(got, [z[0] + (a - z[0]) * f, z[1] + (b - z[1]) * f]);
  return got;
}
const PICK_REACH = new WeakMap<SkinRig, [number, number]>();
/** How far below the font's own stems, as a share of them, a letter drawn as its strokes starts in from the design
    (fromPick), how much thinner than the strokes the moved letter it is united with is there, and how far out from
    the strokes, as a share of the font's stem, that letter may stand at the pick; and how many times as far below the
    pick it keeps some of the design's reach past its strokes (reachOn). */
const PICK_BLEND = 0.15, PICK_THIN = 0.5, PICK_GROW = 0.5, PICK_ROOM = 2;

/** The rig moved from m0 to m1: where the settings put its points (moveMap), each contour moved (moveRing), the
    letter put back to its heights and its flat edges onto their lines, and its outline tidied and traced. */
function moveRig(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures): Node[][] {
  // (a letter of straight strokes in a font without serifs drawn as those strokes, read along them: its outline, moved,
  // keeps the design's joins, a crotch's round as wide as the stroke it was, and the middle of a heavy one's ink, a w's
  // one bar notched, isn't its strokes'; and any letter of a font of heavy even strokes, Gumdrop's, Orbital's, drawn as its
  // strokes too, its notches and swells where strokes meet and end its heavy design's, and a wood type's without its slabs
  // (or with none) so; failing that, as any letter is)
  const lighter = m1.s < m0.s * 0.999 && m1.v < m0.v;
  const st = rig.stroked(), slabStroked = rig.shortSlabs() && !slabRig(rig), lr = lighter ? linedRig(rig) : null;
  if (lr) { const d = strokesAt(rig, lr, m0, m1); if (d) return d; }
  else if (lighter && (st === 1 || st === 2 || slabStroked)) {
    // (Gumdrop's at every lighter weight; Orbital's, Bulwark's and a wood type's from STROKED_UNDER of its stems down,
    // in from the letter as moved over SWITCH_BLEND)
    const kv = m1.v / m0.v, under = st === 1 ? 1 : STROKED_UNDER;
    const d = kv <= under ? strokesAt(rig, rig, m0, m1) : null;
    if (d) {
      const s = (under - kv) / SWITCH_BLEND;
      return st === 1 || s >= 1 ? d : crossfade(rig, s, movedAt(rig, m0, m1), d);
    }
  }
  // (a letter drawn as its strokes where they come out whole moved so where they don't: a mend grown in from the letter
  // moved, which isn't drawn either side, would draw the letter other than those weights do)
  return movedAt(rig, m0, m1, !(lighter && (lr || st === 1 || ((st === 2 || slabStroked) && m1.v / m0.v <= STROKED_UNDER))));
}

/** The rig drawn as its strokes alone (rig `lined`, its skeleton: the letter's, or one read along its straight strokes),
    in from the design near the pick (fromPick); null where that isn't whole. */
function strokesAt(rig: SkinRig, lined: SkinRig, m0: SkinMeasures, m1: SkinMeasures): Node[][] | null {
  const drawn = movedOnce(lined, m0, m1, 'strokes');
  return whole(lined, drawn) ? fromPick(rig, lined, m0, m1, drawn.out) : null;
}

/** The rig moved as any letter is (moveRig): a wood type's without its slabs, each laid back over it, thinner; a serif
    font's lighter weights with their serifs' feet drawn level (footRig) from FOOT_UNDER[0] of its stems, the lightest
    its slabs' too from FOOT_UNDER[1], each point going over SWITCH_BLEND from where the moves before put it to where
    these do. */
function movedAt(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures, grows = true): Node[][] {
  const lighter = m1.s < m0.s * 0.999 && m1.v < m0.v;
  // (a wood type's letter not so drawn moved without its slabs, each laid back over it, thinner)
  const U = lighter && rig.shortSlabs() ? slabRig(rig) : null;
  if (U) return moveRig(U.rig, m0, m1);
  const kv = m1.v / m0.v;
  if (m1.s < m0.s * 0.999 && kv <= FOOT_UNDER[0]) {
    const thin = footRig(rig, FOOT_THIN) ?? rig, slab = footRig(rig, FOOT_SLAB) ?? rig;
    const [X, Y, under] = kv <= FOOT_UNDER[1] ? [thin, slab, FOOT_UNDER[1]] : [rig, thin, FOOT_UNDER[0]], s = (under - kv) / SWITCH_BLEND;
    return X === Y || s >= 1 ? movedPlain(Y, m0, m1, undefined, grows) : movedPlain(X, m0, m1, { rig: Y, s }, grows);
  }
  // (a heavier weight's off the letter with its nubs taken out, as it moves its stems out by more than REWEIGHED, in a font
  // of near even strokes: a blackletter's few nubs lie along its pen's facets, its X's and G's notched where they went)
  const N = m1.s >= m0.s * 0.999 && kv > 1 + REWEIGHED && evenFont(rig) ? nublessRig(rig) : null;
  // (and, in a contrasty font with serifs, off the letter with its serifs read nearer its lines, serifLinedRig)
  const S = m1.s >= m0.s * 0.999 && kv > 1 + REWEIGHED && m0.hT < CONTRASTY * m0.v && rig.serifed() ? serifLinedRig(N ?? rig) : null;
  return movedPlain(S ?? N ?? rig, m0, m1, undefined, grows);
}

/** Two ways of drawing a letter, `X` a little heavier than a weight where the drawing turns to `Y`, `s` of the way from
    one to the other (0 to 1): each read on a grid FADE_CELL units a side as how far in from its outline (out, less than
    0) each point lies, the two taken s of the way from X's to Y's, and the outline traced where that is 0 (marching
    squares), so the letter goes from X's drawing to Y's as the weight does, not at a jump where the drawing turns. */
function crossfade(rig: SkinRig, s: number, x: Node[][], y: Node[][]): Node[][] {
  const A = x.map(ringOf), B = y.map(ringOf), h = FADE_CELL;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of [...A, ...B]) for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  if (!(x1 > x0)) return s < 0.5 ? x : y;
  x0 -= 4 * h; y0 -= 4 * h; x1 += 4 * h; y1 += 4 * h;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1;
  const fa = signedField(A, nx, ny, x0, y0, h), fb = signedField(B, nx, ny, x0, y0, h), f = new Float64Array(nx * ny);
  for (let k = 0; k < f.length; k++) f[k] = fa[k] + (fb[k] - fa[k]) * s;
  const C = contours(f, nx, ny, x0, y0, h, 0), out = tidyRings(C, rig.ctx.cap, C.map(r => dotOf(rig, r as Node[])));
  // (and its reach as moved, skinSpan, s of the way from x's to y's, either's ink where it has none)
  const sx = SPANS.get(x), sy = SPANS.get(y);
  if (sx || sy) { const a = sx ?? xSpan(A), b = sy ?? xSpan(B); SPANS.set(out, [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]); }
  return out;
}

/** How far in from rings' outline (read nonzero) each point of a grid nx × ny from (x0, y0) h apart lies, out less than
    0: whether each point is inside read along its row, then the distance to the nearest point the other side (Felzenszwalb
    and Huttenlocher's distance transform), less half a step, so the outline lies between the points either side. */
function signedField(rings: P[][], nx: number, ny: number, x0: number, y0: number, h: number): Float64Array {
  const inside = new Uint8Array(nx * ny);
  const byRow: [P, P][][] = Array.from({ length: ny }, () => []);
  for (const p of rings) p.forEach((a, i) => { const b = p[(i + 1) % p.length], lo = Math.max(0, Math.ceil((Math.min(a.y, b.y) - y0) / h)), hi = Math.min(ny - 1, Math.floor((Math.max(a.y, b.y) - y0) / h)); for (let j = lo; j <= hi; j++) byRow[j].push([a, b]); });
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * h, xs: [number, number][] = [];
    for (const [a, b] of byRow[j]) if ((a.y <= y) !== (b.y <= y)) xs.push([a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y), b.y > a.y ? 1 : -1]);
    xs.sort((p, q) => p[0] - q[0]);
    let w = 0, k = 0;
    for (let i = 0; i < nx; i++) { const x = x0 + i * h; while (k < xs.length && xs[k][0] <= x) w += xs[k++][1]; if (w !== 0) inside[j * nx + i] = 1; }
  }
  // (the squared distance, in steps, to the nearest point of the other kind, columns then rows)
  const dist = (other: (k: number) => boolean) => {
    const INF = 1e20, d = new Float64Array(nx * ny);
    for (let k = 0; k < d.length; k++) d[k] = other(k) ? 0 : INF;
    const n = Math.max(nx, ny), fbuf = new Float64Array(n), out = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    const pass = (len: number, get: (i: number) => number, put: (i: number, x: number) => void) => {
      for (let q = 0; q < len; q++) fbuf[q] = get(q);
      let kk = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < len; q++) {
        let sx = ((fbuf[q] + q * q) - (fbuf[v[kk]] + v[kk] * v[kk])) / (2 * q - 2 * v[kk]);
        while (sx <= z[kk]) { kk--; sx = ((fbuf[q] + q * q) - (fbuf[v[kk]] + v[kk] * v[kk])) / (2 * q - 2 * v[kk]); }
        kk++; v[kk] = q; z[kk] = sx; z[kk + 1] = INF;
      }
      kk = 0;
      for (let q = 0; q < len; q++) { while (z[kk + 1] < q) kk++; out[q] = (q - v[kk]) * (q - v[kk]) + fbuf[v[kk]]; }
      for (let q = 0; q < len; q++) put(q, out[q]);
    };
    for (let i = 0; i < nx; i++) pass(ny, j => d[j * nx + i], (j, x) => { d[j * nx + i] = x; });
    for (let j = 0; j < ny; j++) pass(nx, i => d[j * nx + i], (i, x) => { d[j * nx + i] = x; });
    return d;
  };
  const toOut = dist(k => !inside[k]), toIn = dist(k => !!inside[k]), f = new Float64Array(nx * ny);
  for (let k = 0; k < f.length; k++) f[k] = inside[k] ? (Math.sqrt(toOut[k]) - 0.5) * h : -(Math.sqrt(toIn[k]) - 0.5) * h;
  // (and by the outline, a point a step from one the other side, the distance to the outline itself, so the outline
  // traced lies where it was, not a part of a step off)
  const B = 4 * h, cells = new Map<number, [P, P][]>(), key = (i: number, j: number) => i * 100003 + j;
  for (const p of rings) p.forEach((a, i) => {
    const b = p[(i + 1) % p.length];
    for (let ci = Math.floor((Math.min(a.x, b.x) - x0) / B); ci <= Math.floor((Math.max(a.x, b.x) - x0) / B); ci++) for (let cj = Math.floor((Math.min(a.y, b.y) - y0) / B); cj <= Math.floor((Math.max(a.y, b.y) - y0) / B); cj++) { const l = cells.get(key(ci, cj)); if (l) l.push([a, b]); else cells.set(key(ci, cj), [[a, b]]); }
  });
  for (let j = 1; j + 1 < ny; j++) for (let i = 1; i + 1 < nx; i++) {
    const k = j * nx + i, me = inside[k];
    if (inside[k - 1] === me && inside[k + 1] === me && inside[k - nx] === me && inside[k + nx] === me) continue;
    const x = x0 + i * h, y = y0 + j * h, ci = Math.floor((x - x0) / B), cj = Math.floor((y - y0) / B);
    let best = Infinity;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const [a, b] of cells.get(key(ci + di, cj + dj)) ?? []) {
      const sx = b.x - a.x, sy = b.y - a.y, l2 = sx * sx + sy * sy, t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * sx + (y - a.y) * sy) / l2)) : 0;
      best = Math.min(best, Math.hypot(x - a.x - sx * t, y - a.y - sy * t));
    }
    if (best < Infinity) f[k] = me ? best : -best;
  }
  return f;
}
/** The grid crossfade reads two drawings on, in units. */
const FADE_CELL = 3;

/** How far below a weight where a lighter weight's drawing turns, as a share of the design's stems, it is in from the
    drawing before (crossfade). */
const SWITCH_BLEND = 0.1;
/** An outline's points, its curves read six points along each. */
const ringOf = (c: Node[]) => c.flatMap((n, i) => { const m = c[(i + 1) % c.length], line = n.ox === undefined && m.ix === undefined; return line ? [{ x: n.x, y: n.y }] : Array.from({ length: 6 }, (_, q) => bez(n, m, q / 6)); });

/** The rig moved as any letter is, on the skeleton it has (movedAt), or `toward` another's of the same outline (its feet
    drawn level) s of the way; and, a lighter weight that breaks it, mended. */
function movedPlain(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures, toward?: { rig: SkinRig; s: number }, grows = true): Node[][] {
  if (!toward) return movedWay(rig, m0, m1, grows).out;
  // (part moved toward another skeleton: moved the way the nearer of the two is at this weight, whole, mended or drawn
  // as its strokes, read off that one alone: the letter between, read so itself, came out mended or not part way, at a
  // jump, a stroke's middle on one lying off the other's ink)
  const way = movedWay(toward.s < 0.5 ? rig : toward.rig, m0, m1, grows, false);
  return way.how === 'strokes' || way.how === 'round' ? way.out : movedOnce(rig, m0, way.m1, way.how, false, toward, way.joinsAs, way.grow?.s, way.grow && [way.grow.was, way.grow.full], way.grow?.by).out;
}

/** A lighter weight's way of drawing a letter (movedWay): as it is, its joins drawn again eased in, whole or not at all,
    mended, drawn as its strokes, on its round-ended skeleton, or toward a heavier weight (m1); and, mended near a weight
    where it comes out whole without, how far its mending strokes have grown in (mendFrom, 0 to 1), the letter as it is
    there, and as wholly mended. */
interface Way { out: Node[][]; how: 'moved' | 'mended' | 'strokes' | 'round'; m1: SkinMeasures; joinsAs?: 'full' | 'none'; grow?: { s: number; was: Node[][]; full: Node[][]; by: number } }

/** The rig moved (movedPlain), with the way it was (Way); `grows`, a mend grown in near a weight it is whole unmended;
    `draws`, so drawn (else, mended, as wholly mended, the way to draw it handed back for movedPlain to draw it so). */
function movedWay(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures, grows = true, draws = true): Way {
  const first = movedOnce(rig, m0, m1), as = (out: Node[][], how: Way['how'] = 'moved', joinsAs?: 'full' | 'none', m = m1): Way => ({ out, how, m1: m, joinsAs });
  if (!(m1.s < m0.s * 0.999 && m1.v < m0.v) || whole(rig, first, true)) return as(first.out);
  // (a letter its crotches met again break, an arch's or a bowl's (archCrotches), moved without them where it comes out
  // whole so, its rounds kept on their lines still: a humanist's b's foot, its bowl's end met again up its stem at Thin,
  // its counter opened)
  if ([...archCrotches(rig).values()].flat().some(G => !G.trap)) {
    ARCH_OFF = true;
    let plain;
    try { plain = movedOnce(rig, m0, m1); } finally { ARCH_OFF = false; }
    if (whole(rig, plain, true)) return as(plain.out);
  }
  // (a join drawn again only part of the way round may part a letter whole without it: drawn again whole there, or,
  // that breaking it too, not at all)
  // (whichever holds ink nearer the letter as it is, and not much further off it than EASED_INK, else mended: a Cathedral's
  // s, its joins not drawn again, held 30% more ink for a step of Weight between two drawn the eased way)
  if (first.eased) {
    const none = movedOnce(rig, m0, m1, 'moved', false, undefined, 'none');
    if (whole(rig, none, true)) {
      const full = movedOnce(rig, m0, m1, 'moved', false, undefined, 'full'), e = reachOf(first.out).ink, off = (w: { out: Node[][] }) => Math.abs(reachOf(w.out).ink - e);
      const [w, j] = whole(rig, full) && off(full) <= off(none) ? [full, 'full' as const] : [none, 'none' as const];
      if (off(w) <= EASED_INK * e || !whole(rig, movedOnce(rig, m0, m1, 'mended'))) return as(w.out, 'moved', j);
    }
  }
  // a lighter weight that breaks the letter (a stroke parted from the one it joins, or lost, a counter run out into the
  // paper, where the strokes meet in a way the skeleton reads amiss) is mended with the strokes drawn again along its
  // skeleton (thinStrokes), which run on through every join; failing that, it is drawn as those strokes alone, within its
  // ink (a design's details lost, but as light as the rest); failing that, moved again on a skeleton keeping its strokes
  // that end round (roundRig); failing that, thinned as far toward the weight as keeps it whole, in eighths: a letter a
  // little heavier than the rest rather than one in pieces
  // (its mending strokes growing in from nothing near a weight where it comes out whole without them (mendFrom): mended
  // all at once, a letter grew the strokes laid over it at a jump, a Jotter's M 17 units wider, a Chancery's n 26)
  const mended = movedOnce(rig, m0, m1, 'mended');
  if (whole(rig, mended)) {
    // (a fat face's not grown in from TRIM_FROM of its stems down, where its joins are trimmed to its strokes (fatTrim),
    // and only part of the way on to TRIM_TO: grown part of the way, its mend's strokes stopped short in ragged pieces, a
    // d's bowl's foot a saw's teeth at Light, a Q's tail apart in three at Thin)
    const g = fatFace(rig) ? Math.min(1, Math.max(0, (m1.v / m0.v - TRIM_FROM) / (TRIM_TO - TRIM_FROM))) : 1;
    const grown = grows && g > 0 ? mendFrom(rig, m0, m1, [...first.out, ...(first.dropped ?? [])]) : { s: 1, was: [], by: 0 }, { was, by } = grown, s = 1 - (1 - grown.s) * g;
    const way = s < 1 ? { ...as(draws ? movedOnce(rig, m0, m1, 'mended', false, undefined, 'eased', s, [was, mended.out], by).out : mended.out, 'mended'), grow: { s, was, full: mended.out, by } } : as(mended.out, 'mended');
    // (and within STROKES_BLEND of a lighter weight it is drawn as its strokes at (strokesNear), its room in toward that
    // drawing's (skinSpan): mended a step heavier, Oldstyle's R came out 26 units narrower at once. Its room alone: drawn
    // between the two (crossfade), a letter as thin as the lightest weights, read on its grid, lost an eighth of its ink)
    const near = grows && draws ? strokesNear(rig, m0, m1) : null;
    if (near) {
      const a = SPANS.get(way.out) ?? xSpan(way.out.map(ringOf)), b = near.span, f = near.f, out = [...way.out];
      SPANS.set(out, [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      return { ...way, out };
    }
    return way;
  }
  const drawn = movedOnce(rig, m0, m1, 'strokes');
  if (whole(rig, drawn)) return as(drawn.out, 'strokes');
  // (or its skeleton read again, its strokes ending round kept: a heavy w, whose feet and middle peak are short beside
  // the rounds where its strokes meet, which the skeleton otherwise takes for a square end's corners and leaves out)
  const R = roundRig(rig);
  if (R) {
    const again = movedOnce(R, m0, m1);
    if (whole(R, again)) return as(again.out, 'round');
  }
  const at = (f: number) => Object.fromEntries(MEASURES.map(k => [k, m0[k] + (m1[k] - m0[k]) * f])) as unknown as SkinMeasures;
  let lo = 0, best: Way | null = null;
  for (let hi = 1, step = 0; step < 3; step++) {
    const f = (lo + hi) / 2, tried = movedOnce(rig, m0, at(f));
    if (whole(rig, tried)) { lo = f; best = as(tried.out, 'moved', undefined, at(f)); } else hi = f;
  }
  return best ?? as(first.out);
}

/** How far a letter mended at m1 has grown its mending strokes in (movedWay), 0 to 1: from the nearest weight within
    MEND_BLEND of the design's stems of m1's, heavier or lighter, where it comes out whole unmended (unmended), as far as
    m1 is from there over MEND_BLEND; or, a weight it is drawn as its strokes lying the other way (mendedWhole), over
    the distance between the two, so it is wholly mended there as before; 1 with none; and the letter as it is at the
    weight it comes out whole unmended (`was`). Weights are read on a grid
    MEND_BLEND / MEND_STEPS apart, so a drag asks the same ones again (kept on the rig). Not from a weight where the
    letter unmended breaks all at once (the grid's weight next to the whole one, or m1's if that is next, its room more
    than SUDDEN units or its ink more than SUDDEN_INK, and as much as its stems thinned, off the whole one's): there,
    growing its mending strokes in would bare the break. */
function mendFrom(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures, out: Node[][]): { s: number; was: Node[][]; by: number } {
  const { kv, G, top, at, keyOf } = mendGrid(m0, m1), now = reachOf(out);
  const inked = (p: { ink: number }, q: { ink: number }, by: number) => Math.abs(p.ink - q.ink) <= (SUDDEN_INK + by / kv) * Math.max(p.ink, q.ink);
  let best = Infinity, side = 0, was: Node[][] = [];
  for (const dir of [1, -1]) {
    const far = Math.max(1, Math.min(top, Math.round((kv + dir * MEND_BLEND) / G))), near = dir > 0 ? Math.floor(kv / G) + 1 : Math.ceil(kv / G) - 1;
    // (the grid's weight nearest m1 where it is whole, read one by one out from m1, and the one before it, not; none
    // where it isn't whole at the stretch's end, a letter deep in a stretch it is mended over read at once)
    let hi = NaN;
    if ((far - near) * dir >= 0 && unmended(rig, m0, at(far), keyOf(far)).whole)
      for (let i = near; (far - i) * dir >= 0 && i >= 1 && i <= top; i += dir) if (unmended(rig, m0, at(i), keyOf(i)).whole) { hi = i; break; }
    if (Number.isNaN(hi)) continue;
    const lo = hi - dir;
    const b = unmended(rig, m0, at(hi), keyOf(hi)), off = Math.abs(hi * G - kv);
    const a = lo === near - dir ? now : unmended(rig, m0, at(lo), keyOf(lo));
    if (Math.abs(a.x0 - b.x0) > SUDDEN || Math.abs(a.x1 - b.x1) > SUDDEN || !inked(a, b, G)) continue;
    if (off < best) { best = off; side = dir; was = b.out; }
  }
  // (how far off the letter there a piece of it here may lie and be its: as much as its stems thinned or thickened between)
  const by = WAS_BY + (best * m0.s) / 2;
  if (best >= MEND_BLEND) return { s: 1, was, by };
  // (and where, the other way, it stops coming out whole mended, to be drawn as its strokes: the grid's next few weights,
  // and the stretch's end and between)
  const first = side > 0 ? Math.ceil(kv / G) - 1 : Math.floor(kv / G) + 1, far = Math.max(1, Math.min(top, Math.round((kv - side * (MEND_BLEND - best)) / G)));
  let strokes = Infinity;
  for (let i = first, n = 0; n < MEND_NEAR && i >= 1 && i <= top && (i - far) * -side <= 0; i -= side, n++) if (!mendedWhole(rig, m0, at(i), keyOf(i))) { strokes = i; break; }
  if (strokes === Infinity && (far * G - kv) * -side > 0 && !mendedWhole(rig, m0, at(far), keyOf(far))) {
    let lo = first - side * (MEND_NEAR - 1), hi = far;
    while (Math.abs(hi - lo) > 1) { const mid = Math.round((lo + hi) / 2); if (mendedWhole(rig, m0, at(mid), keyOf(mid))) lo = mid; else hi = mid; }
    strokes = hi;
  }
  const s = strokes === Infinity ? best / MEND_BLEND : Math.min(1, best / (best + Math.abs(strokes * G - kv)));
  // (and grown wholly by the end of Verticals, where the uprights thin apart from the bars no further (VERTICALS_END of
  // Weight's own): grown part of the way there, half, a blackletter's joins came out in ragged pieces, its a's, b's, d's and
  // g's counters open, at Verticals 0)
  const kw = m0.sw > 0 ? m1.sw / m0.sw : 1, rest = Math.max(0, kv - (m1.sw * VERTICALS_END) / m0.v);
  return { s: side > 0 && kv / kw < 0.999 && rest < MEND_BLEND - best ? Math.max(s, best / Math.max(1e-6, best + rest)) : s, was, by };
}
/** How far Verticals thins the uprights at its end, a share of Weight's own (weighed in shared/params/scales.ts). */
const VERTICALS_END = 0.25;
/** The grid of weights a lighter weight's mend is read on (mendFrom, strokesNear), MEND_BLEND / MEND_STEPS of the design's
    stems apart: m1's share of the design's stems, the step, the last step under them, the measures at step i and their
    key, kept by. (The measures at stems i·G of the design's: on the way from m0 through m1, which a Weight's measures
    keep to, a bar as thick as near enough a straight line of the stem gives, so a drag of Weight reads the same ones
    again, kept by them, the bar's to a quarter unit: read off the way through each m1, it came out a hair off each time.) */
function mendGrid(m0: SkinMeasures, m1: SkinMeasures) {
  const kv = m1.v / m0.v, G = MEND_BLEND / MEND_STEPS, top = Math.floor(0.999 / G);
  const at = (i: number): SkinMeasures => { const f = (1 - i * G) / (1 - kv), m = Object.fromEntries(MEASURES.map(k => [k, m0[k] + (m1[k] - m0[k]) * f])) as unknown as SkinMeasures; m.hT = Math.round(m.hT * 4) / 4; return m; };
  const base = MEASURES.map(k => m0[k].toFixed(3)).join(), keyOf = (i: number) => base + '|' + MEASURES.map(k => at(i)[k].toFixed(3)).join();
  return { kv, G, top, at, keyOf };
}

/** How far a lighter weight's letter mended at m1 has come in toward its strokes drawn alone (movedWay), 0 to 1: as far as
    it is within STROKES_BLEND of the design's stems of the nearest lighter weight on the grid (mendGrid) where it no
    longer comes out whole mended and does as its strokes, over STROKES_BLEND; and how far that drawing reaches either
    side there. Null with none. */
function strokesNear(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures): { f: number; span: [number, number] } | null {
  const { kv, G, at, keyOf } = mendGrid(m0, m1);
  for (let i = Math.ceil(kv / G - 1e-9) - 1; i >= 1 && kv - i * G <= STROKES_BLEND; i--) {
    if (mendedWhole(rig, m0, at(i), keyOf(i))) continue;
    const span = kept(rig, 's' + keyOf(i), () => { const d = movedOnce(rig, m0, at(i), 'strokes'); return whole(rig, d) ? xSpan(d.out.map(ringOf)) : null; });
    if (!span) return null;
    // (where between that weight and the next it stops coming out whole mended, a few halvings closer: from the grid's
    // weight, it came in a share of the grid's step short and still stepped there)
    let lo = i, hi = i + 1;
    for (let k = 0; k < 3; k++) { const mid = (lo + hi) / 2; if (mid * G >= kv) break; if (mendedWhole(rig, m0, at(mid), keyOf(mid))) hi = mid; else lo = mid; }
    const f = Math.min(1, 1 - (kv - hi * G) / STROKES_BLEND);
    return f > 0 ? { f, span } : null;
  }
  return null;
}
/** How far above a weight where a lighter weight's letter is drawn as its strokes, in the design's stems, its mend comes
    in toward that drawing (strokesNear). */
const STROKES_BLEND = 0.08;

/** How far from a weight where a lighter weight's letter comes out whole unmended, in the design's stems, its mending
    strokes grow in (mendFrom), and how many of the grid's weights it reads them on lie in that; how far apart its room
    unmended, in units, may lie either side of the weight it turns whole at for them to, and its ink, as a share (more,
    it breaks all at once). */
const MEND_BLEND = 0.1, MEND_STEPS = 8, SUDDEN = 4, SUDDEN_INK = 0.08;
/** How much more or less ink than the letter moved as it is, its joins drawn again part of the way round, a lighter weight
    whole with them drawn again not at all, or wholly, may hold, as a share, to be drawn so rather than mended (movedWay). */
const EASED_INK = 0.08;
/** How many of the grid's weights next to m1 mendFrom reads one by one for where the letter is drawn as its strokes. */
const MEND_NEAR = 3;

/** How far a letter's outlines reach either side, and how much ink they hold. */
function reachOf(out: Node[][]) {
  let x0 = Infinity, x1 = -Infinity, a = 0;
  for (const c of out) { for (const n of c) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); } a += area(c); }
  return { x0, x1, ink: Math.abs(a) };
}

/** A lighter weight's letter at m1 unmended (mendFrom): whether it comes out whole moved as it is or its joins drawn
    again not at all, and how far its outline reaches and how much ink it holds; kept on the rig by `key`. */
function unmended(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures, key: string): { whole: boolean; x0: number; x1: number; ink: number; out: Node[][] } {
  return kept(rig, 'u' + key, () => {
    const first = movedOnce(rig, m0, m1), none = !whole(rig, first, true) && first.eased ? movedOnce(rig, m0, m1, 'moved', false, undefined, 'none') : null;
    const e = reachOf(first.out).ink, ok = whole(rig, first, true) ? first : none && whole(rig, none, true) && Math.abs(reachOf(none.out).ink - e) <= EASED_INK * e ? none : null;
    // (its pieces dropped as crumbs read with it: a mend grown in part of the way keeps those more than a speck)
    const u = ok ?? first;
    return { whole: !!ok, ...reachOf([...u.out, ...(u.dropped ?? [])]), out: u.out };
  });
}
/** Whether a lighter weight's letter at m1 comes out whole mended (mendFrom); kept on the rig by `key`. */
const mendedWhole = (rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures, key: string) => kept(rig, 'm' + key, () => whole(rig, movedOnce(rig, m0, m1, 'mended')));
/** A value worked out for a rig, kept by key, the last MEND_KEPT of them. */
function kept<T>(rig: SkinRig, key: string, make: () => T): T {
  let map = MENDS.get(rig) as Map<string, T> | undefined;
  if (!map) MENDS.set(rig, (map = new Map()));
  if (map.has(key)) return map.get(key)!;
  const v = make();
  if (map.size >= MEND_KEPT) map.delete(map.keys().next().value!);
  map.set(key, v);
  return v;
}
const MENDS = new WeakMap<SkinRig, Map<string, unknown>>(), MEND_KEPT = 400;

/** Whether a font is a fat face: serifed, its stems FAT_STEM of its capitals' height or more. */
const fatFace = (rig: SkinRig) => rig.serifed() && rig.ref().stem >= FAT_STEM * rig.ctx.cap;
/** A fat face's lighter weight's joins trimmed to its strokes (movedOnce): where three strokes meet, each longer than
    the join's round and none a foot (level, by a line within TRIM_FOOT of the round), within TRIM_ZONE times the
    join's round as drawn, and on the inside of each turn of a stroke sharper than TRIM_TURN, its ink kept only within
    its strokes drawn along the skeleton TRIM_ROUND times as thick as they are now and TRIM_ADD units more, up to
    TRIM_FROM of the design's stems, and thicker on to TRIM_TO, where it is not trimmed. A fat face's
    strokes meet in a mass of ink far heavier than any stroke, which the skeleton reads cut across along its middle: the
    sides there moved by the strokes the samples read, as thin as the stroke they read is now, its b's, d's and q's bowl
    met its stem in a wedge at Thin, its e's bar its bowl, its k's arm its leg, its w's middle strokes each other, a
    blot as heavy as at Regular. Its serifs and feet, its stems' ends, are left: the skeleton leaves them out. */
function fatTrim(rig: SkinRig, mv: MoveMap, lift: (y: number) => number, rings: P[][], dots: boolean[] | undefined): { rings: P[][]; dots: boolean[] | undefined } {
  const SK = thinSkeleton(rig), put = (q: P) => ({ x: mv.gx(q.x), y: lift(mv.gy(q.y)) });
  // (eased out from TRIM_FROM of the design's stems to TRIM_TO, the strokes it keeps thickening without end there)
  const f = Math.max(0, (mv.kv - TRIM_FROM) / (TRIM_TO - TRIM_FROM));
  if (f >= 1) return { rings, dots };
  const k = TRIM_ROUND + f / (1 - f);
  const lines = [0, rig.ctx.cap, ...(rig.ctx.lower ? [rig.ctx.xh, rig.ctx.asc, rig.ctx.desc] : [])];
  const foot = (e: number, q: SkPt) => { const P = SK.edges[e].pts, a = P[0], z = P[P.length - 1]; return Math.abs(z.y - a.y) < TRIM_LEVEL * Math.abs(z.x - a.x) && lines.some(L => P.every(p => Math.abs(p.y - L) < TRIM_FOOT * q.r)); };
  const disc = (c: P, r: number, a0 = 0, half = false): P[] => half
    ? [c, ...Array.from({ length: 13 }, (_, k) => { const t = a0 - Math.PI / 2 + (k * Math.PI) / 12; return { x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r }; })]
    : Array.from({ length: 24 }, (_, k) => ({ x: c.x + Math.cos((k * Math.PI) / 12) * r, y: c.y + Math.sin((k * Math.PI) / 12) * r }));
  const zones = SK.nodes.filter(q => q.edges.length >= 3 && q.edges.every(e => SK.edges[e].len > q.r && !foot(e, q))).map(q => disc(put(q), TRIM_ZONE * q.r));
  // (the inside of a turn, read over TRIM_SPAN points either side: half a disc, so a point the turn makes outside stays)
  for (const E of SK.edges) {
    const P = E.pts, n = P.length, w = TRIM_SPAN, cos = Math.cos(TRIM_TURN);
    const turn = (i: number) => { const ax = P[i].x - P[i - w].x, ay = P[i].y - P[i - w].y, bx = P[i + w].x - P[i].x, by = P[i + w].y - P[i].y; return (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1); };
    for (let i = w + 1; i < n - w - 1; i++) {
      const c = turn(i);
      if (c > cos || c > turn(i - 1) || c > turn(i + 1)) continue;
      const ax = P[i].x - P[i - w].x, ay = P[i].y - P[i - w].y, bx = P[i + w].x - P[i].x, by = P[i + w].y - P[i].y, al = Math.hypot(ax, ay) || 1, bl = Math.hypot(bx, by) || 1;
      zones.push(disc(put(P[i]), TRIM_ZONE * P[i].r, Math.atan2(by / bl - ay / al, bx / bl - ax / al), true));
    }
  }
  if (!zones.length) return { rings, dots };
  // (its strokes as fatReads runs them on, eased back to the skeleton's own as the trim eases out)
  const F = fatReadsAt(rig, f), fr = { ...rig, thin: F };
  const strokes = thinStrokes(fr, mv, R => R * k + TRIM_ADD).map(r => r.map(put));
  const wind = (r: P[]) => (signedArea(r) < 0 ? r.slice().reverse() : r);
  const S = shape(strokes.map(wind), true), Z = shape(zones.map(wind), true), body = rings.filter((_, i) => !dots?.[i]), M = shape(body);
  // (a run of the skeleton's points drawn as a stroke as thick as it is now (`by` times, `more` units more): a ribbon
  // along it, round at its ends, but one ending on a stroke it runs into a way off that one's join, a K's leg into its
  // arm, cut along that stroke's far side)
  const ends = FAT_ENDS.get(F);
  const ribbon = (run: number[], more = 0, by = 1): P[][] => {
    const qs = run.map(j => { const q = thinMiddle(fr, mv, j); return { ...put(q), R: q.R * by + more, j }; });
    if (qs.length < 2) return qs.map(q => disc(q, q.R));
    const nrm = (i: number) => { const a = qs[Math.max(0, i - 1)], b = qs[Math.min(qs.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: -dy / l, y: dx / l }; };
    const L = qs.map((q, i) => { const n = nrm(i); return { x: q.x + n.x * q.R, y: q.y + n.y * q.R }; }), Rt = qs.map((q, i) => { const n = nrm(i); return { x: q.x - n.x * q.R, y: q.y - n.y * q.R }; });
    const out: P[][] = [];
    for (const i of [0, qs.length - 1]) {
      const c = ends?.get(qs[i].j), q = qs[i], o = qs[i === 0 ? 1 : i - 1];
      if (c) {
        const Ra = thinMiddle(fr, mv, c.j).R * by + more, dl = Math.hypot(q.x - o.x, q.y - o.y) || 1, d = { x: (q.x - o.x) / dl, y: (q.y - o.y) / dl };
        let na = { x: -c.uy, y: c.ux };
        if (na.x * d.x + na.y * d.y < 0) na = { x: -na.x, y: -na.y };
        const dn = d.x * na.x + d.y * na.y;
        if (dn > 0.2) {
          const to = (S: P) => { const t = (Ra - ((S.x - q.x) * na.x + (S.y - q.y) * na.y)) / dn; return { x: S.x + d.x * t, y: S.y + d.y * t }; };
          L[i] = to(L[i]); Rt[i] = to(Rt[i]);
          continue;
        }
      }
      out.push(disc(q, q.R));
    }
    out.push([...L, ...Rt.reverse()]);
    return out;
  };
  // (each stroke run on straight drawn there, thinner as the trim eases out, to nothing at TRIM_TO)
  const runsInk = fatRuns(rig, F).flatMap(r => ribbon(r, 0, 1 - f));
  const D = runsInk.length ? shape(runsInk.map(wind), true) : null;
  // (and about a join a stroke was run on straight into, its strokes as thick as they are now, and the letter's ink only
  // as far out as that and a unit more, more and more out as the trim eases out)
  const at = FAT_AT.get(F) ?? [];
  const Zh = at.length ? shape(at.map(k => wind(disc(put(SK.nodes[k]), TRIM_ZONE * SK.nodes[k].r))), true) : null;
  let Dh: ReturnType<typeof shape> | null = null, Sh: ReturnType<typeof shape> | null = null;
  if (Zh) {
    // (the strokes there: each stroke's points within the zones, and a few either side)
    const runs: number[][] = [];
    let j0 = 0;
    for (const E of SK.edges) {
      const j1 = j0 + E.pts.length, inZ = (j: number) => { const q = put(thinMiddle(fr, mv, j)); return Zh.has(q.x, q.y); };
      let cur: number[] = [];
      for (let j = j0; j <= j1; j++) {
        if (j < j1 && inZ(j)) cur.push(j);
        else if (cur.length) { const a = Math.max(j0, cur[0] - 3), b = Math.min(j1 - 1, cur[cur.length - 1] + 3); runs.push(Array.from({ length: b - a + 1 }, (_, m) => a + m)); cur = []; }
      }
      j0 = j1;
    }
    Dh = shape(runs.flatMap(r => ribbon(r, 0, 1 - f)).map(wind), true);
    Sh = shape(runs.flatMap(r => ribbon(r, 1, 1 + f / (1 - f))).map(wind), true);
  }
  const kept = combine([M, S, Z, ...(D ? [D] : []), ...(Zh ? [Zh, Dh!, Sh!] : [])], (x, y) => Zh?.has(x, y) ? (M.has(x, y) && Sh!.has(x, y)) || Dh!.has(x, y) || !!D?.has(x, y) : (M.has(x, y) && (S.has(x, y) || !Z.has(x, y))) || (!!D && Z.has(x, y) && D.has(x, y)));
  if (!kept.length) return { rings, dots };
  const outer = kept.reduce((a, r) => (Math.abs(signedArea(r)) > Math.abs(signedArea(a)) ? r : a), kept[0]), sign = Math.sign(signedArea(outer)) || 1;
  const dotRings = rings.filter((_, i) => dots?.[i]).map(r => (Math.sign(signedArea(r)) === sign ? r : r.slice().reverse()));
  return { rings: [...kept, ...dotRings], dots: [...kept.map(() => false), ...dotRings.map(() => true)] };
}
/** A fat face's lighter weight's skeleton as fatTrim draws its strokes, and reads its middles by (movedOnce): each straight
    hairline into a stem running on through its join (straightThrough) run on straight to the stem's middle; and a K's
    arm and leg, meeting a way off its stem, a short stroke between, the arm run on straight along that stroke to the
    stem's middle and the leg straight on to the arm. Where it bent round into the join, as the skeleton of so heavy a
    letter reads it, a thin stroke drawn along it bent there: a W's hairline into its middle stroke a shelf, a K's arm a
    bar across to its stem. */
const FAT_READS = new WeakMap<ThinReads, ThinReads>();
/** How far fatTrim eases out at a weight: 0 up to TRIM_FROM of the design's stems, 1 from TRIM_TO. */
const fatEase = (mv: MoveMap) => Math.max(0, (mv.kv - TRIM_FROM) / (TRIM_TO - TRIM_FROM));
/** fatReads' skeleton `f` of the way back to the letter's own (fatEase). */
function fatReadsAt(rig: SkinRig, f: number): ThinReads {
  const F = fatReads(rig), T = rig.thin!;
  if (f <= 0) return F;
  const B: ThinReads = { ...F, x: F.x.map((v, j) => v + (T.x[j] - v) * f), y: F.y.map((v, j) => v + (T.y[j] - v) * f), grid: undefined };
  FAT_AT.set(B, FAT_AT.get(F)!); FAT_ENDS.set(B, FAT_ENDS.get(F)!);
  return B;
}
function fatReads(rig: SkinRig): ThinReads {
  const T = rig.thin ??= thinReads(rig), kept = FAT_READS.get(T);
  if (kept) return kept;
  const F: ThinReads = { ...T, x: T.x.slice(), y: T.y.slice(), tx: T.tx.slice(), ty: T.ty.slice(), grid: undefined };
  const sk = thinSkeleton(rig);
  const at: number[] = [], ends = new Map<number, { j: number; ux: number; uy: number }>();
  if (!LINED.has(sk)) for (const [k, ls] of T.legs) {
    const x0 = F.x.slice(), y0 = F.y.slice(), tx0 = F.tx.slice(), ty0 = F.ty.slice();
    straightThrough(F, sk.nodes[k], ls, true);
    // (only one bent round far into the join, not an E's arm, straight into its stem already, whose stem's sides about
    // the join, drawn so, leaned)
    const went = Math.max(0, ...ls.flatMap(l => l.pts.map(j => Math.hypot(F.x[j] - x0[j], F.y[j] - y0[j]))));
    if (went >= HAIR_WENT * sk.nodes[k].r) at.push(k);
    else for (const l of ls) for (const j of l.pts) { F.x[j] = x0[j]; F.y[j] = y0[j]; F.tx[j] = tx0[j]; F.ty[j] = ty0[j]; }
  }
  // (a K's arm and leg meeting a way off its stem, joined to it by a short stroke the skeleton reads through the ink
  // where they meet: the arm run on straight to the stem's middle, along that stroke, and the leg straight to the arm)
  if (!LINED.has(sk)) for (const [k, ls] of T.legs) {
    if (ls.length !== 3) continue;
    const N = sk.nodes[k];
    for (const bar of ls) {
      const s0 = bar.to, sl = T.legs.get(s0);
      if (!sl || s0 === k) continue;
      const others = sl.filter(o => o.to !== k);
      if (others.length !== 2) continue;
      const [s1, s2] = others.map(o => legLine(F, sk.nodes[s0], o));
      if (!s1 || !s2 || s1.ux * s2.ux + s1.uy * s2.uy > STRAIGHT_THROUGH) continue;
      const vl = Math.hypot(s2.A.x - s1.A.x, s2.A.y - s1.A.y) || 1, v = { x: (s2.A.x - s1.A.x) / vl, y: (s2.A.y - s1.A.y) / vl };
      // (P within the stem, a round in from its ends)
      const endOf = (L: NonNullable<typeof s1>) => { const j = L.pts[L.pts.length - 1]; return (F.x[j] - s1.A.x) * v.x + (F.y[j] - s1.A.y) * v.y; };
      const lo = Math.min(endOf(s1), endOf(s2)) + sk.nodes[s0].r, hi = Math.max(endOf(s1), endOf(s2)) - sk.nodes[s0].r;
      // (a hairline arm and a leg heavier than it by HAIR_INTO, each straight)
      const pair = ls.filter(o => o !== bar).sort((a, b) => a.s - b.s);
      if (pair[0].s >= HAIR_INTO * pair[1].s) continue;
      const two = pair.map(o => legLine(F, N, o));
      if (two.some(L => !L || legOff(F, L, N.r) > HAIR_STRAIGHT * N.r)) continue;
      const meet = (a: P, ax: number, ay: number, b: P, bx: number, by: number) => { const det = ax * by - ay * bx; if (Math.abs(det) < 0.2) return null; const t = ((b.x - a.x) * by - (b.y - a.y) * bx) / det, u = ((b.x - a.x) * ay - (b.y - a.y) * ax) / det; return { t, u, x: a.x + ax * t, y: a.y + ay * t }; };
      let done = false;
      for (const [X, Y] of [[two[0]!, two[1]!]]) {
        // P: back along the arm past its join to the stem's middle, within the stem; Q: back along the leg to the arm,
        // between P and the arm's straight part
        const Pm = meet(X.A, -X.ux, -X.uy, s1.A, v.x, v.y), Qm = Pm && meet(Y.A, -Y.ux, -Y.uy, X.A, -X.ux, -X.uy);
        if (!Pm || !Qm || Pm.t <= 0 || Pm.u < lo || Pm.u > hi || Qm.t <= 0 || Qm.u <= 0 || Qm.u >= Pm.t) continue;
        const along = (L: { pts: number[]; arc: number[] }, n: number, a: P, b: P) => { for (let m = 0; m < n; m++) { const f = L.arc[m] / (L.arc[n] || 1), j = L.pts[m], dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1, sg = Math.sign(F.tx[j] * dx + F.ty[j] * dy) || 1; F.x[j] = a.x + dx * f; F.y[j] = a.y + dy * f; F.tx[j] = sg * dx / dl; F.ty[j] = sg * dy / dl; } };
        along(X, X.e, Qm, X.A); along(Y, Y.e, Qm, Y.A);
        ends.set(Y.pts[0], { j: X.pts[0], ux: X.ux, uy: X.uy });
        const B = legLine(F, N, bar, true)!;
        along(B, B.pts.length - 1, Qm, Pm);
        { const j = B.pts[B.pts.length - 1]; F.x[j] = Pm.x; F.y[j] = Pm.y; }
        at.push(k, s0);
        done = true;
        break;
      }
      if (done) break;
    }
  }
  FAT_READS.set(T, F);
  FAT_AT.set(F, at);
  FAT_ENDS.set(F, ends);
  return F;
}
/** A stroke leaving join N as straightThrough reads it: its point where it leaves the bulge and the way out along it
    (`all`: just its points and their way along it, however short). */
function legLine(T: ThinReads, N: SkPt, l: Leg, all = false) {
  const pts = l.pts, L = pts.length, arc = [0];
  for (let m = 1; m < L; m++) arc.push(arc[m - 1] + Math.hypot(T.x[pts[m]] - T.x[pts[m - 1]], T.y[pts[m]] - T.y[pts[m - 1]]));
  if (all) return { pts, e: L - 1, arc, A: { x: T.x[pts[0]], y: T.y[pts[0]] }, ux: 0, uy: 0 };
  const from = (d: number) => { const i = arc.findIndex(v => v >= d); return i < 0 ? L - 1 : i; };
  const at0 = Math.min(STRAIGHT_FROM * N.r, 0.4 * arc[L - 1]), e = from(at0), f = from(at0 + Math.min(N.r, 0.3 * arc[L - 1]));
  if (e < 1 || f - e < 6) return null;
  const mean = (i: number) => { let x = 0, y = 0, c = 0; for (let m = Math.max(0, i - 3); m <= Math.min(L - 1, i + 3); m++) { x += T.x[pts[m]]; y += T.y[pts[m]]; c++; } return { x: x / c, y: y / c }; };
  const A = mean(e), B = mean(f), l2 = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  return { pts, e, arc, A, ux: (B.x - A.x) / l2, uy: (B.y - A.y) / l2 };
}
/** How far a stroke strays off the line legLine reads it along, over twice the join's round on from where it leaves the
    bulge (Infinity, shorter). */
function legOff(T: ThinReads, L: NonNullable<ReturnType<typeof legLine>>, r: number) {
  const end = L.arc[L.arc.length - 1], span = Math.min(2 * r, 0.85 * (end - L.arc[L.e]));
  if (span < 0.5 * r) return Infinity;
  const d = L.arc[L.e] + span, far = L.arc.findIndex(v => v >= d);
  if (far < 0) return Infinity;
  let off = 0;
  for (let m = L.e; m <= far; m++) off = Math.max(off, Math.abs((T.x[L.pts[m]] - L.A.x) * L.uy - (T.y[L.pts[m]] - L.A.y) * L.ux));
  return off;
}
/** The joins fatReads ran a hairline on straight into. */
const FAT_AT = new WeakMap<ThinReads, number[]>();
/** A K's leg's end fatReads ran on to its arm: its point, and the arm's point there and its way. */
const FAT_ENDS = new WeakMap<ThinReads, Map<number, { j: number; ux: number; uy: number }>>();
/** The points of a fat face's skeleton fatReads runs on straight, in runs along their strokes. */
function fatRuns(rig: SkinRig, F: ThinReads): number[][] {
  const T = rig.thin!, runs: number[][] = [];
  let j0 = 0;
  // (each run with the point either side of it on its stroke)
  for (const E of thinSkeleton(rig).edges) {
    const j1 = j0 + E.pts.length;
    let cur: number[] = [];
    for (let j = j0; j <= j1; j++) {
      if (j < j1 && (F.x[j] !== T.x[j] || F.y[j] !== T.y[j])) { if (!cur.length && j > j0) cur.push(j - 1); cur.push(j); }
      else if (cur.length) { if (j < j1) cur.push(j); runs.push(cur); cur = []; }
    }
    j0 = j1;
  }
  return runs;
}
/** How heavy a serifed font's stems are, of its capitals' height, for it to be a fat face (fatTrim); and fatTrim's
    measures (see there): its strokes' thickness and more, its zones' size in a join's round, the turn, in radians, and
    the points either side it is read over, and a foot's slope and reach off its line. */
const FAT_STEM = 0.19, TRIM_ROUND = 1.3, TRIM_FROM = 0.45, TRIM_TO = 0.6, TRIM_ADD = 4, TRIM_ZONE = 2, TRIM_TURN = Math.PI / 4, TRIM_SPAN = 6, TRIM_LEVEL = 0.35, TRIM_FOOT = 1.2;

/** Whether a moved letter is whole: the outlines its rig has, as many inked and as many counters (its dots and any crumb
    aside, crumbs), and ink along the middles of its strokes (the skeleton where the move put it), but for stretches no
    longer than a few times the stroke is thick (where the skeleton cuts the corner of an L or bends into a join, round
    what the stroke thinned away; a stroke lost is longer). And `unmended`, moved as it is, it has dropped no piece of ink
    more than a speck as a crumb: a blackletter H's spurs parted from its stems and lost, read whole, the letter went
    unmended for a hair of the Weight between mended ones, 72 units narrower. */
function whole(rig: SkinRig, { out, middles, lost }: { out: Node[][]; middles: (P & { s: number; y0: number })[][]; lost?: number }, unmended = false) {
  if (unmended && (lost ?? 0) > (rig.ctx.cap * SPECK) ** 2) return false;
  if (middles.length) {
    const polys = out.map(c => c.flatMap((n, i) => Array.from({ length: 6 }, (_, k) => bez(n, c[(i + 1) % c.length], k / 6))));
    const sh = shape(polys);
    for (const run of middles) {
      let gone = 0, most = 0;
      for (let k = 0; k < run.length; k++) {
        if (sh.has(run[k].x, run[k].y) || sh.has(run[k].x, run[k].y0)) { gone = 0; most = 0; continue; }
        if (k) gone += Math.hypot(run[k].x - run[k - 1].x, run[k].y - run[k - 1].y);
        most = Math.max(most, run[k].s);
        if (gone > 3 * most + 0.05 * rig.ctx.cap) return false;
      }
    }
  }
  // (a pinhole the letter has where its strokes cross, a crumb, opens as they thin, a script g's where its bowl's stroke
  // crosses its tail: an outline of the moved letter round one is that, not a counter more)
  const holes = rig.contours.filter(c => crumb(rig, c) && !dotOf(rig, c)).map(c => ({ x: c.reduce((a, n) => a + n.x, 0) / c.length, y: c.reduce((a, n) => a + n.y, 0) / c.length }));
  const opened = (c: Node[]) => Math.abs(area(c)) < (rig.ctx.cap * 3 * CRUMB) ** 2 && holes.some(h => inPoly(c, h));
  const count = (cs: Node[][]) => {
    let pos = 0, neg = 0;
    for (const c of cs) {
      if (crumb(rig, c) || (cs === out && opened(c))) continue;
      if (area(c) > 0) pos++; else neg++;
    }
    return [pos, neg];
  };
  const [p0, n0] = count(rig.contours), [p1, n1] = count(out), as = (p: number, n: number) => (p === p1 && n === n1) || (p === n1 && n === p1);
  // (or as many with those of its outlines touching another of theirs taken as one (touching): a script p's entry
  // stroke, its tip on its stem's side, apart only as the stem thins away from it, and joined to it again by the strokes
  // drawn again that mend the letter, which run over the hair between: mended, the p was read broken down to Thin, and
  // was drawn thinned only partway, as heavy at Thin as at Weight 0.18)
  const [pt, nt] = touching(rig);
  return as(p0, n0) || ((pt > 0 || nt > 0) && as(p0 - pt, n0 - nt));
}

/** How many fewer the letter's outlines are, inked and counters, those touching another of theirs (within TOUCH_GAP)
    taken as one: kept on the rig. */
function touching(rig: SkinRig): [number, number] {
  const kept = TOUCHES.get(rig);
  if (kept) return kept;
  const cs = rig.contours.filter(c => !crumb(rig, c)), rs = cs.map(ringOf), up = cs.map((_, i) => i), top = (i: number): number => (up[i] === i ? i : (up[i] = top(up[i])));
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (Math.sign(area(cs[i])) === Math.sign(area(cs[j])) && gapOf(rs[i], rs[j]) < TOUCH_GAP) up[top(i)] = top(j);
  const out: [number, number] = [0, 0];
  cs.forEach((c, i) => { if (top(i) !== i) out[area(c) > 0 ? 0 : 1]++; });
  TOUCHES.set(rig, out);
  return out;
}
const TOUCHES = new WeakMap<SkinRig, [number, number]>(), TOUCH_GAP = 1;

/** How small a pinhole a lighter weight opens, as a share of a crumb's square, goes (movedOnce): from a crumb's down to it,
    made smaller as it is. */
const HOLE_FADE = 0.5;
/** How far, as a share of a crumb's side, a pinhole a counter pinched off goes from it as it closes (movedOnce). */
const HOLE_GAP = 0.25;
/** The narrowest gap between two rings of points: from either's points to the other's edges. */
const gapOf = (a: P[], b: P[]) => {
  const to = (q: P, r: P[]) => r.reduce((m, u, i) => { const v = r[(i + 1) % r.length], dx = v.x - u.x, dy = v.y - u.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((q.x - u.x) * dx + (q.y - u.y) * dy) / l)) : 0; return Math.min(m, Math.hypot(q.x - u.x - t * dx, q.y - u.y - t * dy)); }, Infinity);
  return Math.min(a.reduce((m, q) => Math.min(m, to(q, b)), Infinity), b.reduce((m, q) => Math.min(m, to(q, a)), Infinity));
};
/** An outline's area, signed (its curves read a few points along each). */
const area = (c: Node[]) => signedArea(c.flatMap((n, i) => Array.from({ length: 4 }, (_, k) => bez(n, c[(i + 1) % c.length], k / 4))));
/** Whether an outline of a moved letter is a dot of the letter's (lying in one of its dots' boxes, which a lighter weight
    makes smaller with its stems, past a speck's size), or a crumb: smaller than CRUMB's square, a sliver of ink or a
    pinhole a lighter weight leaves where strokes meet. */
function crumb(rig: SkinRig, c: Node[], k = 1) {
  return dotOf(rig, c) || Math.abs(area(c)) < (rig.ctx.cap * CRUMB * k) ** 2;
}
/** Whether an outline lies wholly within one of the rig's dots' boxes (a dot, grown or shrunk where it was). */
const dotOf = (rig: SkinRig, c: Node[]) => rig.bones.some(bs => {
  if (!bs[0]?.dot) return false;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const b of bs) { x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x); y0 = Math.min(y0, b.y); y1 = Math.max(y1, b.y); }
  return c.every(n => n.x >= x0 - 2 && n.x <= x1 + 2 && n.y >= y0 - 2 && n.y <= y1 + 2);
});

/** The rig moved from m0 to m1 once (moveRig); `mend`, a lighter weight's, with the strokes drawn again along its
    skeleton laid over it; `heavy`, moved as a heavier weight is, whichever way. */
function movedOnce(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures, how: 'moved' | 'mended' | 'strokes' = 'moved', heavy = false, toward?: { rig: SkinRig; s: number }, joinsAs: 'eased' | 'full' | 'none' = 'eased', grow = 1, ends?: [Node[][], Node[][]], wasBy = WAS_BY): { out: Node[][]; middles: (P & { s: number; y0: number })[][]; eased?: boolean; lost?: number; dropped?: Node[][] } {
  const mv = moveMap(rig, m0, m1), mvTo = toward ? moveMap(toward.rig, m0, m1) : null;
  // (a mend grown in part of the way: whether a piece lies where the letter had ink at the weight it was whole unmended
  // and has it wholly mended (`ends`), most of its points within each or by its edge (wasBy off the letter whole, which
  // is lighter or heavier): a hairline's piece runs along the hairline's edge; one the whole letter had but its mend
  // drops, a Cathedral k's foot's tip, kept, stood off from it)
  const inkOf = (cs: Node[][]) => { const polys = cs.map(c => c.flatMap((n, i) => Array.from({ length: 4 }, (_, k) => bez(n, c[(i + 1) % c.length], k / 4)))); return { polys, sh: shape(polys) }; };
  const inks = grow < 1 && ends?.[0].length && ends[1].length ? ends.map(inkOf) : null;
  const by = (polys: P[][], q: P, d: number) => polys.some(r => r.some((a, i) => { const b = r[(i + 1) % r.length], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0; return Math.hypot(q.x - a.x - dx * t, q.y - a.y - dy * t) < d; }));
  const wasIn = (r: P[]) => !!inks && inks.every(({ polys, sh }, e) => r.filter(q => sh.has(q.x, q.y) || by(polys, q, e ? WAS_BY : wasBy)).length * 2 >= r.length);
  if (heavy) mv.lighter = false;
  let rings = rig.bones.map((bs, r) => moveRing(rig, bs, r, mv));
  // (or each point s of the way to where another skeleton of the same outline puts it: one with its serifs' feet drawn
  // level, from a weight where the lighter weights take it on)
  if (toward) {
    const to = toward.rig.bones.map((bs, r) => moveRing(toward.rig, bs, r, mvTo!));
    rings = rings.map((ring, r) => (to[r]?.length !== ring.length ? ring : ring.map((p, i) => ({ x: p.x + (to[r][i].x - p.x) * toward.s, y: p.y + (to[r][i].y - p.y) * toward.s }))));
  }
  // (a little lighter than the font as picked, in from the design: within PICK_BLEND of its stems, each point as far from
  // where a heavier weight's moves put it, which go on from the design, to where the lighter's put it as the stems are
  // thinner: their crotches met again on their strokes' edges and their finest strokes drawn as thick as the hairline
  // were other than the design from the first hair lighter)
  const lam = mv.lighter ? Math.min(1, (1 - mv.kv) / PICK_BLEND) : 1;
  if (lam < 1) {
    const heavier = { ...mv, lighter: false };
    rings = rings.map((ring, r) => { const h = moveRing(rig, rig.bones[r], r, heavier); return h.length !== ring.length ? ring : ring.map((p, i) => ({ x: h[i].x + (p.x - h[i].x) * lam, y: h[i].y + (p.y - h[i].y) * lam })); });
  }
  // (a heavier weight's outline as moved, before the heights, for its serifs to be put back as moved, snapFlatEdges)
  const unlifted = mv.reweighed && mv.kv > 1 ? rings.map(r => r.map(p => p.y)) : null;
  const lift = keepHeights(rig, rings, mv.gy, mv.reweighed);
  if (mv.reweighed && mv.kv >= 1 && (mv.kv > 1 + REWEIGHED || mv.kh > 1 + REWEIGHED)) footHeights(rig, rings, mv.gy);
  if (mv.reweighed) clearDots(rig, rings);
  // (a lighter weight's skeleton where the move puts it (lifted to the letter's heights with its outline; its strokes drawn
  // alone are not), every few points along each stroke, with the stroke's half
  // thickness: the middles of its strokes, for whole)
  const middles: (P & { s: number; y0: number })[][] = [];
  // (each foot drawn level over its reach along its line, where the move puts it: nothing lifted with the letter's
  // heights goes past it there, as the lift that keeps a round's overshoot below the baseline would take a stem's foot
  // below it, its edge on the line staying)
  const feetOf = (r: SkinRig) => (!mv.lighter || !r.thin ? [] : r.thin.feet.map(F => { const xs = [F.stem[0] - F.side, F.stem[0] + F.side, ...F.serifs.flatMap(S => [S.x0, S.x1])]; const es = [F.line, ...F.serifs.map(S => S.edge)]; return { lo: mv.gx(Math.min(...xs)), hi: mv.gx(Math.max(...xs)), y: mv.gy(F.dir > 0 ? Math.max(...es) : Math.min(...es)), dir: F.dir }; }));
  const feet = feetOf(rig), clamp = (fs: ReturnType<typeof feetOf>) => <Q extends P>(q: Q, inset: number): Q => { for (const F of fs) if (q.x >= F.lo && q.x <= F.hi && (q.y - F.y) * F.dir < inset) q.y = F.y + F.dir * inset; return q; }, onFeet = clamp(feet);
  // (drawn as its strokes on the skeleton the ink's middle reads, those kept on its lines as thinStrokes draws them)
  const hugs = how === 'strokes' && !!rig.thin && drawnMode(rig) === 1;
  // (and each where the move puts it too, below a foot's line where the design takes its ink there: Couture's R's foot;
  // none for a letter part moved toward another skeleton, which movedPlain reads off the nearer of the two)
  if (mv.lighter && rig.thin && !toward) {
    // (a fat face's trimmed, along its strokes as fatTrim draws them)
    const fatMid = how !== 'strokes' && fatFace(rig) && fatEase(mv) < 1 ? { ...rig, thin: fatReadsAt(rig, fatEase(mv)) } : rig;
    let j0 = 0;
    for (const E of thinSkeleton(rig).edges) {
      const run: (P & { s: number; y0: number })[] = [];
      for (let i = 0; i < E.pts.length; i += 3) {
        if (rig.thin.vrun[j0 + i]) continue;
        const q = thinMiddle(fatMid, mv, j0 + i, hugs || (how !== 'strokes' ? 'moved' : false)), y = how === 'strokes' ? mv.gy(q.y) : lift(mv.gy(q.y));
        run.push({ ...onFeet({ x: mv.gx(q.x), y, s: rig.thin.s[j0 + i] }, 1), y0: y });
      }
      middles.push(run);
      j0 += E.pts.length;
    }
  }
  // (and those by a hairline's root carried with its stem's side, carried as its edges are, hairRoots)
  const roots = HAIR_ROOTS.get(mv);
  if (roots) for (const run of middles) for (const m of run) for (const R of roots) {
    const d = (m.x - R.x) * R.ox + (m.y - R.y) * R.oy, along = (m.x - R.x) * R.oy - (m.y - R.y) * R.ox;
    // (and the hairline's middle on in through where the stem's side was, which it now leaves bare, into the stem)
    const V = Math.hypot(R.vx, R.vy);
    if (d < -V || d >= R.reach || Math.abs(along) > 2 * R.reach) continue;
    const u = (m.x - R.x) * R.tx + (m.y - R.y) * R.ty, zu = u > 0 && u < R.ua ? u * (1 - R.sk) : 0;
    const go = d < 0 ? -(V + 0.5 * R.wn) - d : -V * (1 - d / R.reach);
    m.x += R.ox * go - R.tx * zu; m.y += R.oy * go - R.ty * zu; m.y0 += R.oy * go - R.ty * zu;
  }
  const held = mv.reweighed ? rings.map(r => r.map(p => ({ x: p.x, y: p.y }))) : null;
  const across = snapFlatEdges(rig, rings, mv.gy, mv.lighter, mv.reweighed, unlifted);
  if (held) endsWithSides(rig, held, rings);
  if (mv.reweighed && mv.kv > 1 + REWEIGHED && fairFont(rig)) levelFeet(rig, rings, mv.gy);
  // (and Contrast turned round on a contrasty design (reversed), its moves between its straight edges run smooth along the
  // outline by REV_SMOOTH of how far its strokes thicken and thin, its straight edges, laid on their lines (straightRuns),
  // held: each moved by its own reading of its stroke, a hairline thickened sixfold and a stem thinned to a sixth, a fat
  // face's bowls and counters, its E's beaks and its stems' sides came out ragged at Contrast 0 to 40)
  // (and a contrasty design's hairlines thickened, its stems no heavier (Contrast down from the design's, and turned
  // round), laid again after the heights and the edges put back on their lines, each straight edge on one line, its
  // serifs' too: the heights lifted the letter's top by as much as its serifs thickened past the line, and its edge put
  // back on it brought back the serif's end and underside part of the way, some points more than others, a wave along a
  // fat face's L's top serif's underside, a nick at its end and at each bracket, from Contrast 80 down)
  const hairs = hairsIn(mv);
  if (hairs > 0) rings = rings.map((ring, r) => (rig.bones[r][0]?.dot ? ring : relaid(rig.bones[r], ring, hairs)));
  if (reversed(mv)) {
    const { hair, stem } = rig.ref(), sg = REV_SMOOTH * revIn(mv) * ((mv.kh - 1) * hair + (1 - mv.kv) * stem) / 2;
    rings = rings.map((ring, r) => (rig.bones[r][0]?.dot || ring.length !== rig.bones[r].length ? ring : evenedMoves(ring, rig.bones[r], rig.bones[r].map(b => ({ x: mv.gx(b.x), y: lift(mv.gy(b.y)) })), sg, i => rig.bones[r][i].straight)));
  }
  // (and a contrasty design's heavier weight, its moves run smooth along the outline by CON_SMOOTH of how far its stems
  // thickened, its straight edges (laid, straightRuns), its serifs and its hairline tips held: each moved by its own
  // reading of its stroke, read across a join, into a bracket or along a bowl as it thins, a Didone's d's and a's bowls,
  // its stems' sides by their bowls and its feet came out wavy at Verticals 100)
  if (mv.reweighed && mv.kv > 1 + REWEIGHED && mv.contrasty && !reversed(mv)) {
    const sg = CON_SMOOTH * (mv.kv - 1 - REWEIGHED) * rig.ref().stem / 2;
    rings = rings.map((ring, r) => { const bs = rig.bones[r], tips = hairTipMarks(rig, r); return bs[0]?.dot || ring.length !== bs.length ? ring : evenedMoves(ring, bs, bs.map(b => ({ x: mv.gx(b.x), y: lift(mv.gy(b.y)) })), sg, i => bs[i].straight || !!bs[i].serifDx || !!tips[i]); });
  }
  // (and a round pen's (fontPen), as far as its strokes thickened, each point's move run smooth along the outline: moved
  // out two and three times as far as its strokes are thick, each sample along its own normal, its stroke thickening by
  // as much more or less round a curve as the stems' and bars' do apart, held back here and there, the outline came out
  // in lumps and knobs, a comic's b's and o's counters and its I's bars' ends at Weight 100. The moves, not the outline:
  // run smooth, a stroke's end turning toward the stroke across a narrow opening ran into it. Its dots kept clear again:
  // a question mark's hook's foot, run smooth, came down onto its dot)
  if (mv.reweighed && mv.kv > 1 + REWEIGHED && fontPen(rig.font)) { const sg = EVEN_SMOOTH * (mv.kv - 1 - REWEIGHED) * rig.ref().stem / 2; rings = rings.map((ring, r) => (rig.bones[r][0]?.dot || ring.length !== rig.bones[r].length ? ring : evenedMoves(ring, rig.bones[r], rig.bones[r].map(b => ({ x: mv.gx(b.x), y: lift(mv.gy(b.y)) })), sg))); clearDots(rig, rings); }
  // (and the middles of a stroke along a line, which its edge put back on the line brought back with it)
  if (across.length && how !== 'strokes') for (const run of middles) for (const m of run) {
    const a = across.find(a => Math.abs(m.x - a.x) <= STEP / 2 && m.y >= Math.min(a.y0, a.y1) && m.y <= Math.max(a.y0, a.y1));
    if (a) { m.y += a.dy; m.y0 += a.dy; }
  }
  // (a heavier weight's outline where, moved, it runs back against the way the design's runs there: a round into a stem
  // moved less far than the stem's side, a hook where they meet, Mainline's n's arch into its stem)
  // (each ring's samples as its points now stand, for doubledBack to read the design's sharp points by: a point fewer, a
  // Didone's w's hairline serif's tip went for a fold, its room 11 units less from Weight 0.88 on)
  const samples = rig.bones.map(bs => bs as P[]);
  if (mv.reweighed && mv.kv > 1 + REWEIGHED) rings = rings.map((ring, r) => { const k = unfolded(ring, rig.bones[r]); if (!k) return ring; samples[r] = k.map(j => rig.bones[r][j]); return k.map(j => ring[j]); });
  // (a lighter weight's end that stays, its corners gone in past its points along it, doubles back on itself there; and
  // a dot, made as much smaller as the stems are thinner, is never taken for a speck; and a reweighed one's edge, its
  // samples slid along it past the corner its stem's side now meets it at: a slab serif's sloping underside moved out
  // with its stem, a slit at each serif's root)
  if (mv.lighter || mv.reweighed) rings = rings.map((ring, r) => doubledBack(ring, samples[r]));
  // (how far its outline so moved reaches either side, before a tip whose sides crossed is cut off as a fold: see skinSpan;
  // not a letter drawn as its strokes, which stop short of its tips as drawn)
  // (and a reweighed one's, before its spikes are cut off and its notches bridged, at some weights and not others: its room
  // jumped where they were, a Didone's K's, 11 units in a step of Weight)
  const span = (mv.lighter || mv.reweighed) && how !== 'strokes' ? xSpan(rings) : null;
  let dots = mv.lighter ? rig.bones.map(bs => !!bs[0]?.dot) : undefined, eased = false;
  if (mv.lighter && how === 'strokes') {
    // (the letter drawn as its strokes alone, as thick as they are now, within its ink as drawn; its dots as moved)
    // (a dot's own skeleton left out: its dot is as moved)
    const inDot = (r: P[]) => rig.bones.some(bs => bs[0]?.dot && inPoly(bs, { x: r.reduce((a, q) => a + q.x, 0) / r.length, y: r.reduce((a, q) => a + q.y, 0) / r.length }));
    const was = letterInk(rig, mv), S = shape(thinStrokes(rig, mv, R => R, undefined, drawnMode(rig)).filter(r => !inDot(r)).map(r => r.map(p => ({ x: mv.gx(p.x), y: mv.gy(p.y) }))).map(r => (signedArea(r) < 0 ? r.slice().reverse() : r)), true);
    // (and, its strokes kept on its lines (hugMap), within its ink as that moves them too: an arch's join with its stem)
    const hugged = hugs ? letterInk(rig, mv, HUGS.get(mv)) : null;
    const drawn: P[][] = combine(hugged ? [S, was, hugged] : [S, was], (x, y) => S.has(x, y) && (was.has(x, y) || !!hugged?.has(x, y)));
    const outer = drawn.reduce((a, r) => (Math.abs(signedArea(r)) > Math.abs(signedArea(a)) ? r : a), drawn[0] ?? []), sign = Math.sign(signedArea(outer)) || 1;
    const dotRings = rings.filter((_, i) => dots![i]).map(r => (Math.sign(signedArea(r)) === sign ? r : r.slice().reverse()));
    rings = [...drawn, ...dotRings];
    dots = [...drawn.map(() => false), ...dotRings.map(() => true)];
  } else if (mv.lighter) {
    // (part moved toward another skeleton, its joins read off the nearer of the two, as movedPlain reads it whole)
    const near = toward && toward.s >= 0.5;
    ({ rings, dots, eased } = rebuildJoins(near ? toward.rig : rig, near ? mvTo! : mv, lift, rings, dots!, joinsAs));
  }
  if (how === 'mended' && mv.lighter) {
    // (each run on at its free end as far as the moved letter's ink, the piece it is to join: the ink as drawn, lifted with
    // the moved letter's heights, would take it out past its line)
    const moved = rings, to = (p: P, ux: number, uy: number) => Math.min(inkAhead(rig, p, ux, uy), rayOut(moved, { x: mv.gx(p.x), y: lift(mv.gy(p.y)) }, ux, uy));
    // (and none past a foot's line, above; part moved toward another skeleton, along that one's, its feet level: along
    // this one's, a stroke running down a serif's bracket, which the other's outline hasn't, closed a crumb there, filled)
    const [mr, mm] = toward ? [toward.rig, mvTo!] : [rig, mv], on = mr === rig ? onFeet : clamp(feetOf(mr));
    // (grown in (movedWay's grow), as much thinner, and only within as far of the letter's ink as they have grown)
    let more = thinStrokes(mr, mm, grow < 1 ? R => Math.max(0.05, mendBy(R) * grow) : mendBy, to, 0, true).map(r => r.map(p => on({ x: mm.gx(p.x), y: lift(mm.gy(p.y)) }, 0)));
    // (a fat face's none on its balls' ink as drawn, where the move puts it: a ball made smaller as Weight goes (ballEnd),
    // the stroke along the skeleton through the design's, mended wholly, hung from it, a 6's and an a's 100 units down)
    let cut = false;
    if (fatFace(rig)) {
      const E = shape(mr.ends.flatMap((es, r) => es.filter(e => e.ball > 0).map(e => { const bs = mr.bones[r], n = bs.length; return Array.from({ length: e.b - e.a + 1 }, (_, k) => { const q = bs[(((e.a + k) % n) + n) % n]; return { x: mm.gx(q.x), y: lift(mm.gy(q.y)) }; }); })).filter(r => r.length > 2).map(r => (signedArea(r) < 0 ? r.slice().reverse() : r)), true);
      if (E.polys.length) { const M1 = shape(more.map(r => (signedArea(r) < 0 ? r.slice().reverse() : r)), true); more = combine([M1, E], (x, y) => M1.has(x, y) && !E.has(x, y)); cut = true; }
    }
    // (wound as the letter's outside is, so they add to its ink)
    const outer = rings.reduce((a, r) => (Math.abs(signedArea(r)) > Math.abs(signedArea(a)) ? r : a), rings[0]), sign = Math.sign(signedArea(outer));
    // (those cut off a ball as one ink, their holes the other way: combine winds its ink anticlockwise)
    const wound = cut ? (sign > 0 ? more : more.map(r => r.slice().reverse())) : more.map(r => (Math.sign(signedArea(r)) === sign ? r : r.slice().reverse()));
    rings = grow < 1 ? grownIn(rings, wound, sign, grow, (rig.ctx.cap * SPECK) ** 2, wasIn) : [...rings, ...wound];
    // (a piece of it no more than a speck, apart where the letter whole had ink, kept as a dot is till the strokes reach it)
    dots = grow < 1 ? rings.map(r => Math.sign(signedArea(r)) === sign && Math.abs(signedArea(r)) < (rig.ctx.cap * SPECK) ** 2 && wasIn(r)) : undefined;
  }
  // (a wood type's letter drawn without its slabs (slabRig) has each laid back over it along its face, out to its tab's
  // ends, as thick as a stroke of the slab's thickness running along the face is now)
  if (mv.lighter && rig.slabless) {
    const outer = rings.reduce((a, r) => (Math.abs(signedArea(r)) > Math.abs(signedArea(a)) ? r : a), rings[0] ?? []), sign = Math.sign(signedArea(outer)) || 1;
    // (its face where the move puts the line it is on, as the letter, lifted, keeps its heights)
    const put = (q: P) => ({ x: mv.gx(q.x), y: mv.gy(q.y) });
    const rects = rig.slabless.map(S => {
      const fx = S.b.x - S.a.x, fy = S.b.y - S.a.y, fl = Math.hypot(fx, fy) || 1;
      const t = 2 * Math.max(1, mv.weighs({ tx: fx / fl, ty: fy / fl, w: S.d / 2, serifDx: 0, dot: false } as Bone) * S.d / 2);
      const r = [S.a, S.b, { x: S.b.x + S.nx * t, y: S.b.y + S.ny * t }, { x: S.a.x + S.nx * t, y: S.a.y + S.ny * t }].map(put);
      return Math.sign(signedArea(r)) === sign ? r : r.reverse();
    });
    rings = [...rings, ...rects];
    if (dots) dots = [...dots, ...rects.map(() => false)];
  }
  // (a fat face's joins trimmed to its strokes as thick as they are now (fatTrim))
  if (mv.lighter && rig.thin && how !== 'strokes' && fatFace(rig)) ({ rings, dots } = fatTrim(rig, mv, lift, rings, dots));
  // (a heavier weight's notches bridged, where the move puts the design's own)
  // (how far a design's crotch may have moved: as far as the strokes either side thickened, its sides out)
  if (mv.reweighed) {
    const { stem, hair } = rig.ref(), grew = Math.max(0, (mv.kv - 1) * stem, (mv.kh - 1) * hair);
    rings = bridgeDents(rings, rig.bones.map(bs => !!bs[0]?.dot), rig.ctx.cap, designDents(rig).map(q => ({ x: mv.gx(q.x), y: lift(mv.gy(q.y)), turn: q.turn, tip: q.tip })), grew);
  }
  // (and a round pen's points where its outline, so run smooth, turns straight back on itself within a few units taken out:
  // a comic's k's crotch, its corner a unit or two past the sides run smooth up to it, traced as a loop)
  if (mv.reweighed && mv.kv > 1 + REWEIGHED && fontPen(rig.font)) rings = rings.map(r => unspiked(r));
  // (and a reweighed letter's points flung out alone, off the line through the points either side: unflung)
  if (mv.reweighed) {
    const { stem, hair } = rig.ref(), near = Math.max(0, (mv.kv - 1) * stem, (mv.kh - 1) * hair) + SPIKE_FAR;
    const tips = designDents(rig).filter(q => q.tip).map(q => ({ x: mv.gx(q.x), y: lift(mv.gy(q.y)) }));
    // (the ink on the left of each ring as the letter's outside winds: its counters wound the other way)
    const inkLeft = Math.sign(signedArea(rings.reduce((a, c) => (Math.abs(signedArea(c)) > Math.abs(signedArea(a)) ? c : a), rings[0] ?? []))) || 1;
    rings = rings.map(r => unflung(r, inkLeft, tips, near));
  }
  // (a reweighed letter's counters the design draws kept however small they get: a Chancery's capitals' flourishes'
  // loops, 1,600 square units drawn, filled as specks from Weight halfway up, SPECK of them kept)
  let out = tidyRings(rings, rig.ctx.cap, dots, mv.reweighed ? designHoles(rig).map(h => h.map(q => ({ x: mv.gx(q.x), y: lift(mv.gy(q.y)) }))) : undefined);
  // (and a heavier weight's small hole that the design hasn't, a pocket of paper strokes thickened into each other round
  // a crotch shut in, filled: an old style's W's and w's, a hole where its strokes meet)
  if (mv.reweighed) {
    const sign = Math.sign(area(out.reduce((a, c) => (Math.abs(area(c)) > Math.abs(area(a)) ? c : a), out[0] ?? []))), held = designHoles(rig).map(h => h.map(q => ({ x: mv.gx(q.x), y: lift(mv.gy(q.y)) })));
    // (a hole: wound against the letter's outside and lying in its ink, not a dot wound so)
    const rs = out.map(ringOf), shut = (i: number) => { const q = inPaper(rs[i]); return rs.some((o, j) => j !== i && Math.sign(area(out[j])) === sign && inPoly(o, q)); };
    // (made as much smaller about its middle as it is short of that, to nothing at NEW_HOLE_FADE of it: filled once below
    // it, a Chancery's s's loop's pocket, 0.1 of its capitals' height square, went at once at Weight 0.88, its ink 8.5% in
    // a step)
    const a0 = (NEW_HOLE * rig.ctx.cap) ** 2;
    out = out.flatMap((c, i) => {
      const a = Math.abs(area(c));
      if (Math.sign(area(c)) === sign || a >= a0 || !shut(i) || held.some(h => inPoly(h, inPaper(rs[i])))) return [c];
      const k = (a / a0 - NEW_HOLE_FADE) / (1 - NEW_HOLE_FADE);
      if (k <= 0) return [];
      const f = Math.sqrt(k), mx = c.reduce((t, q) => t + q.x, 0) / c.length, my = c.reduce((t, q) => t + q.y, 0) / c.length, at = (v: number, m: number) => m + (v - m) * f;
      return [c.map(q => ({ ...q, x: at(q.x, mx), y: at(q.y, my), ...(q.ix !== undefined ? { ix: at(q.ix, mx), iy: at(q.iy!, my) } : {}), ...(q.ox !== undefined ? { ox: at(q.ox, mx), oy: at(q.oy!, my) } : {}) }))];
    });
  }
  // (and a crumb a lighter weight leaves where strokes meet, a sliver or a pinhole, goes, as small as a crumb is as far in
  // from the design (PICK_BLEND); its dots stay)
  if (!mv.lighter) { if (span) SPANS.set(out, span); return { out, middles, eased }; }
  // (and the most ink a piece of the letter so dropped held, for whole; a mend grown in part of the way keeping a piece
  // of ink apart no bigger than a crumb, or a little more (CRUMB_NEAR), only where the letter has ink at either end of
  // the stretch (wasIn): kept by its size alone, a piece a crumb's size, one way or the other of it as the mend grew,
  // came and went, a Cathedral k's foot's tip 64 units off it)
  const outer = out.reduce((a, c) => (Math.abs(area(c)) > Math.abs(area(a)) ? c : a), out[0] ?? []), sign = Math.sign(area(outer));
  const kept = out.filter(c => dotOf(rig, c) || (grow < 1 && Math.sign(area(c)) === sign ? Math.abs(area(c)) >= CRUMB_NEAR * (rig.ctx.cap * CRUMB * lam) ** 2 || wasIn(c.map(n => ({ x: n.x, y: n.y }))) : !crumb(rig, c, lam)));
  // (but a pinhole smaller than a crumb made as much smaller about its middle as it is short of one, to nothing at HOLE_FADE
  // of one: dropped at a crumb's size, it filled at once, a Chancery's s's loop's 3,000 square units of ink; and one a
  // counter pinched off kept as it is where it parts from it, made smaller as it moves away, to nothing HOLE_GAP of a
  // crumb's side off it: a Cathedral's s's counters each pinch off a corner of 1,800 square units where its spine meets
  // its bowl, and dropped as soon as it parted it filled at once)
  const c2 = (rig.ctx.cap * CRUMB * lam) ** 2, counters = out.filter(c => Math.sign(area(c)) !== sign && Math.abs(area(c)) >= c2).map(ringOf);
  for (const c of out) {
    const a = Math.abs(area(c));
    if (kept.includes(c) || Math.sign(area(c)) === sign || dotOf(rig, c) || a >= c2) continue;
    const r = ringOf(c), gap = Math.min(Infinity, ...counters.map(o => gapOf(r, o))), k = Math.max((a / c2 - HOLE_FADE) / (1 - HOLE_FADE), 1 - gap / (HOLE_GAP * Math.sqrt(c2)));
    if (k <= 0) continue;
    const f = Math.sqrt(k), mx = c.reduce((t, q) => t + q.x, 0) / c.length, my = c.reduce((t, q) => t + q.y, 0) / c.length, at = (v: number, m: number) => m + (v - m) * f;
    kept.push(c.map(q => ({ ...q, x: at(q.x, mx), y: at(q.y, my), ...(q.ix !== undefined ? { ix: at(q.ix, mx), iy: at(q.iy!, my) } : {}), ...(q.ox !== undefined ? { ox: at(q.ox, mx), oy: at(q.oy!, my) } : {}) })));
  }
  const dropped = out.filter(c => !kept.includes(c) && Math.sign(area(c)) === sign), lost = dropped.reduce((m, c) => Math.max(m, Math.abs(area(c))), 0);
  if (span) SPANS.set(kept, span);
  return { out: kept, middles, eased, lost, dropped };
}

/** A lighter weight's letter mended (movedOnce), its mending strokes `more` grown `grow` of the way (0 to 1) out along
    themselves from where they lie in its outline as moved: each point kept where it lies along them from the letter's
    ink no further than that share of the way to the farthest point beyond it, so every stroke grows out from the
    letter at once, its tip reaching out as the weight goes, and the letter goes from unmended to mended, its room and
    all, as the weight does. Read on a grid GROW_CELL units a side, the way along the strokes (Dijkstra's), traced where
    it stops (marching squares) and spread a cell or two past their sides, so the strokes keep their own edges but where
    they grow. Each ring wound `sign`'s way as the letter's outside is. (Kept within a distance of the letter as the
    crow flies, a stroke lying a way off along it came in all at once; within one share of the farthest any reaches,
    a stroke's tip reaching out past the letter came in at the end of the stretch: a Chancery's n's 24 units of room.) */
function grownIn(moved: P[][], more: P[][], sign: number, grow: number, crumbs: number, was: (r: P[]) => boolean): P[][] {
  // (the letter's folds cut out first, as tidyRings cuts them, and read as it reads them: a fold, or a piece wound the
  // other way, read as wound one way, is a hole; and a piece of its ink no more than a speck (`crumbs`), dropped as the
  // letter unmended is, not lying where it had ink as it was whole (`was`), grown in as its strokes are: a Chancery's
  // n's hairline exit, parted from it, came back all at once where a stroke reached it, 24 units of room; one the letter
  // whole had, a Couture's R's leg's tip, or a larger piece, whose dropping breaks it (whole), it keeps, apart, till the
  // strokes reach it)
  const fix = (r: P[]) => { const u = untangle(r); return sign < 0 ? u.reverse() : u; }, all = moved.map(fix);
  const crumb = (r: P[]) => signedArea(r) > 0 && signedArea(r) < crumbs && !was(r), Ar = all.filter(r => !crumb(r)), Br = [...more.map(fix), ...all.filter(crumb)];
  const A = shape(Ar), B = shape(Br, true), h = GROW_CELL;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of Br) for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  if (!(x1 > x0)) return moved;
  x0 -= 3 * h; y0 -= 3 * h;
  const nx = Math.ceil((x1 - x0) / h) + 4, ny = Math.ceil((y1 - y0) / h) + 4, inB = insideOf(Br, nx, ny, x0, y0, h, true), inA = insideOf(Ar, nx, ny, x0, y0, h, false);
  // (how far along the strokes each point of them lies from the letter's ink)
  const D = new Float64Array(nx * ny).fill(Infinity), from = new Int32Array(nx * ny).fill(-1), heap: number[] = [], done: number[] = [];
  const push = (k: number) => { heap.push(k); let i = heap.length - 1; while (i) { const up = (i - 1) >> 1; if (D[heap[up]] <= D[heap[i]]) break; [heap[up], heap[i]] = [heap[i], heap[up]]; i = up; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && D[heap[l]] < D[heap[m]]) m = l; if (r < heap.length && D[heap[r]] < D[heap[m]]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (let k = 0; k < D.length; k++) if (inB[k] && inA[k]) { D[k] = 0; push(k); }
  const steps: [number, number, number][] = [[1, 0, h], [-1, 0, h], [0, 1, h], [0, -1, h], [1, 1, h * Math.SQRT2], [1, -1, h * Math.SQRT2], [-1, 1, h * Math.SQRT2], [-1, -1, h * Math.SQRT2]];
  while (heap.length) {
    const k = pop(), i = k % nx, j = (k - i) / nx;
    if (k === done[done.length - 1]) continue;
    done.push(k);
    for (const [di, dj, w] of steps) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const q = jj * nx + ii;
      if (inB[q] && D[k] + w < D[q]) { D[q] = D[k] + w; from[q] = k; push(q); }
    }
  }
  // (and the farthest point beyond each, the way it was reached: back from the last reached)
  const far = D.slice();
  for (let q = done.length - 1; q >= 0; q--) { const k = done[q]; if (from[k] >= 0) far[from[k]] = Math.max(far[from[k]], far[k]); }
  if (!done.length || grow * (D[done[done.length - 1]] + h) < 0.5) return moved;
  // (kept where that is no further than grow of the way; a piece of them the letter's ink doesn't reach along them, at
  // the end; and the edge spread out past their sides)
  let g = new Float64Array(nx * ny);
  for (let k = 0; k < g.length; k++) g[k] = !inB[k] ? -h : D[k] < Infinity ? grow * (far[k] + h) - D[k] : (grow - 1) * h;
  for (let pass = 0; pass < 2; pass++) {
    const was = g; g = was.slice();
    for (let j = 1; j + 1 < ny; j++) for (let i = 1; i + 1 < nx; i++) {
      const k = j * nx + i;
      if (inB[k]) continue;
      let m = was[k];
      for (const [di, dj] of steps) m = Math.max(m, was[k + dj * nx + di]);
      g[k] = m;
    }
  }
  // (its outline's points along a straight run left out: they only slow combine)
  const G = shape(contours(g, nx, ny, x0, y0, h, 0).map(r => r.filter((q, i) => { const a = r[(i + r.length - 1) % r.length], b = r[(i + 1) % r.length]; return Math.abs((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)) > 0.25 * Math.hypot(b.x - a.x, b.y - a.y); })).filter(r => r.length > 2));
  return combine([A, B, G], (x, y) => A.has(x, y) || (B.has(x, y) && G.has(x, y))).map(r => (sign < 0 ? r.slice().reverse() : r));
}
/** The grid grownIn reads a mend's strokes on, in units; and how near the letter's edge as it was whole, in units, a
    piece of it lying there counts as its (movedOnce's wasIn). */
const GROW_CELL = 2.5, WAS_BY = 3;

/** Which points of a grid nx × ny from (x0, y0) h apart lie inside rings (`positive`, wound anticlockwise more than
    clockwise; else nonzero): each row's crossings, left to right; and the points nearest the rings' edges too, so a
    stroke thinner than the grid stays in one piece. */
function insideOf(rings: P[][], nx: number, ny: number, x0: number, y0: number, h: number, positive: boolean): Uint8Array {
  const inside = new Uint8Array(nx * ny), byRow: [P, P][][] = Array.from({ length: ny }, () => []);
  for (const p of rings) p.forEach((a, i) => { const b = p[(i + 1) % p.length], lo = Math.max(0, Math.ceil((Math.min(a.y, b.y) - y0) / h)), hi = Math.min(ny - 1, Math.floor((Math.max(a.y, b.y) - y0) / h)); for (let j = lo; j <= hi; j++) byRow[j].push([a, b]); });
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * h, xs: [number, number][] = [];
    for (const [a, b] of byRow[j]) if ((a.y <= y) !== (b.y <= y)) xs.push([a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y), b.y > a.y ? 1 : -1]);
    xs.sort((p, q) => p[0] - q[0]);
    let w = 0, k = 0;
    for (let i = 0; i < nx; i++) { const x = x0 + i * h; while (k < xs.length && xs[k][0] <= x) w += xs[k++][1]; if (positive ? w > 0 : w !== 0) inside[j * nx + i] = 1; }
  }
  for (const p of rings) p.forEach((a, i) => {
    const b = p[(i + 1) % p.length], m = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (h / 2)) || 1;
    for (let t = 0; t <= m; t++) {
      const ii = Math.round((a.x + (b.x - a.x) * t / m - x0) / h), jj = Math.round((a.y + (b.y - a.y) * t / m - y0) / h);
      if (ii >= 0 && jj >= 0 && ii < nx && jj < ny) inside[jj * nx + ii] = 1;
    }
  });
  return inside;
}

/** How much thinner than Weight alone draws them the uprights must be drawn (MoveMap.past, by Verticals or Contrast turned
    round) for the ways of reading a letter whose uprights thin apart from its bars to be taken wholly (MoveMap.apart): in
    from Weight's own, so a letter goes from the one to the other as Verticals goes. */
const PAST_EASE = 0.25;
function moveMap(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures): MoveMap {
  const c = rig.ctx;
  let x0 = Infinity, x1 = -Infinity;
  for (const cn of rig.contours) for (const n of cn) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); }
  const cnt = ROUND.has(c.ch) ? m1.cntR / m0.cntR : m1.cntN / m0.cntN;
  const mid = (x0 + x1) / 2, sx = m1.ws / m0.ws * cnt, kv = m1.v / m0.v, kh = m1.hT / m0.hT, ks = m0.serif > 0 ? m1.serif / m0.serif : 1, kd = m1.dot / m0.dot;
  // heights: the x-height moves the lowercase between the baseline and the ascenders, Crossbar the bar (restyled, in
  // free-letters.ts, moves the lines it sets a free font's serifs and peaks on alike: keep the two in step)
  const xh1 = c.xh * m1.xr / m0.xr, top = c.lower ? c.xh : c.cap, top1 = c.lower ? xh1 : c.cap;
  const knots: [number, number][] = [[0, 0]], bar = BARS[c.ch];
  if (c.barY != null && bar) {
    const by = c.barY * top1 / top + bar.move * top1 * (m1.bar - m0.bar);
    knots.push([c.barY, Math.min(top1 * 0.9, Math.max(top1 * 0.1, by))]);
  }
  knots.push([top, top1]);
  // Stem length draws the ascenders up and the descenders down, from a little way past the x-height and the
  // baseline (so an overshoot there stays as it is)
  const pad = c.cap * 0.04;
  if (c.lower) knots.push([c.asc, Math.max(top1 + pad * 2, c.asc + (m1.asc - m0.asc) * c.cap)]);
  const kDesc = descK(m1.desc / m0.desc);
  if (c.lower && Math.abs(m1.desc - m0.desc) > 1e-4 && c.desc < -pad * 2) knots.unshift([c.desc, Math.min(-pad * 2, c.desc * kDesc)]);
  const gy = piecewise(knots), gx = (x: number) => mid + (x - mid) * sx;
  // a dot sits over the x-height, where the x-height puts it, whatever the ascenders do
  const gyDot = piecewise(knots.filter(([y]) => y >= 0 && y <= top));
  // how much a stroke keeps of its thickness: thinned toward the pinch's line, and where it runs into another
  const pinch = added(m0.pinch, m1.pinch), joints = added(m0.joints, m1.joints), near = joints ? joinsNear(rig) : null;
  const pinchY = m1.pinchPos < 0.5 ? xh1 * m1.pinchPos : xh1 / 2 + (c.cap - xh1 / 2) * (m1.pinchPos * 2 - 1);
  const keeps = (b: Bone, r: number, i: number) => (pinch ? Math.max(0.012, 1 - pinch * (1 - Math.min(1, Math.abs(gy(b.ay) - pinchY) / (xh1 / 2)))) : 1)
    * (near ? 1 - 0.55 * joints * near[r][i] : 1);
  const kw = m0.sw > 0 ? m1.sw / m0.sw : 1, past = kw > 0 && kv / kw < 0.999 ? kv / kw : 1, apart = Math.min(1, (1 - past) / PAST_EASE);
  const lighter = m1.s < m0.s * 0.999 && kv < 1, reweighed = !lighter && (Math.abs(kv - 1) > REWEIGHED || Math.abs(kh - 1) > REWEIGHED);
  // (the uprights thinned with the stems kept, Contrast turned round: each edge weighed as thick as its stroke reads whole,
  // so read more and more over HALF_RAMP of the uprights' thinning: so read at once, from REWEIGHED thinner, a fat face's O
  // took a quarter more ink in a step of Contrast)
  const hr = reweighed && kv < 1 ? Math.min(1, (1 - kv) / HALF_RAMP) : 0, whole = hr > 0 ? sideHalf(rig) : null;
  const half = !whole ? (b: Bone) => b.w : hr >= 1 ? whole : (b: Bone) => b.w + (whole(b) - b.w) * hr;
  return { gy, gyDot, gx, top, top1, sx, kv, kh, ks, kd, past, apart, lighter, reweighed, weighs: weighsOf(rig, kv, kh, past < 1 ? m1.s / m0.s : kv, !(reweighed && kv > 1 + REWEIGHED)), keeps, half, contrasty: m0.hT < CONTRASTY * m0.v };
}

/** Contrast turned round on a contrasty design (a fat face's, a Didone's): its hairlines thickened and its stems thinned,
    each by REWEIGHED or more. */
const reversed = (mv: MoveMap) => mv.reweighed && mv.contrasty && mv.kv < 1 - REWEIGHED && mv.kh > 1 + REWEIGHED;
/** How far Contrast turned round on a contrasty design has come in (0 to 1): wholly REV_RAMP of its stems thinner on. */
const revIn = (mv: MoveMap) => (reversed(mv) ? Math.min(1, (1 - REWEIGHED - mv.kv) / REV_RAMP) : 0);
const REV_RAMP = 0.15;
/** How far a contrasty design's hairlines thickening, its stems no heavier, have come in (0 to 1), for movedOnce to lay its
    straight edges again (relaid): wholly HAIRS_RAMP of a hairline thicker on, and out again as the stems thicken past
    REWEIGHED, wholly by twice that; and wholly as Contrast turned round comes in (revIn). */
const hairsIn = (mv: MoveMap) => (!mv.reweighed || !mv.contrasty ? 0 : Math.max(revIn(mv), Math.min(1, Math.max(0, (mv.kh - 1 - REWEIGHED) / HAIRS_RAMP), Math.max(0, (1 + 2 * REWEIGHED - mv.kv) / REWEIGHED))));
const HAIRS_RAMP = 0.5;
/** How much thinner than the stems the uprights draw, as a share of them, for a reweighed move to weigh its edges wholly
    as their strokes read whole (MoveMap.half). */
const HALF_RAMP = 0.3;
/** How thin, at most, as a share of its stems, a design's bars are for it to be read as contrasty (MoveMap.contrasty). */
const CONTRASTY = 0.25;
/** How far out from a join, in the join's own distance to the paper, the strokes leaving it read thicker for meeting there. */
const JOIN_ZONE = 1.25;
/** How nearly in line a stroke leaving a join runs on from a short stroke between two joins to count as running on through
    it (the cosine; thinReads). */
const LINK_ON = Math.cos(30 * Math.PI / 180);
/** How square across one another, as the sine of their angle, the strokes either side of a lighter weight's crotch run
    for it to go where their edges meet again (an H's bar, a t's, a Didone's bowl into its stem, 60° and more); at a
    slant, it goes to the nearest ink of the strokes drawn again (moveRing). */
const CROTCH_SQUARE = Math.sin(60 * Math.PI / 180);
/** How far, as the cosine of the turn, a slanted crotch's edge may curve away from it and still be met again along a
    straight line: 15°. */
const CROTCH_BEND = Math.cos(15 * Math.PI / 180);
/** archCrotches': a crotch's stem side and curve read ARCH_RUN samples out from it, their ways from ARCH_FROM on; the
    stem's side upright within ARCH_UPRIGHT (the cosine of its normal off level); a line within ARCH_NEAR of the capitals'
    height the way they run; two corners ARCH_PAIR of it apart one notch; the curve leaving the stem at a slant between
    ARCH_SLANT (cosines), and below ARCH_STEEP a shallow one; the ink across from the corner at least ARCH_NECK of the
    curve's stroke. A shallow crotch is met again wholly within ARCH_REACH[0] of the curve's stroke now (its half), not at
    all past ARCH_REACH[1]; any, within ARCH_REACH_STEEP of the thinner of its two strokes, so. And where stretchRounds reads a corner of two lines, they cross at more than ARCH_TURN (sine). */
const ARCH_RUN = 6, ARCH_FROM = 2, ARCH_UPRIGHT = 0.9, ARCH_NEAR = 0.2, ARCH_PAIR = 0.02, ARCH_SLANT = [Math.cos(75 * Math.PI / 180), Math.cos(20 * Math.PI / 180)];
const ARCH_STEEP = Math.cos(40 * Math.PI / 180), ARCH_NECK = 0.45, ARCH_REACH = [4, 6], ARCH_REACH_STEEP = [8, 12], ARCH_TURN = 0.3, ARCH_TIGHT = 8 * Math.PI / 180, ARCH_ROUND = 0.04, ARCH_V = [Math.cos(150 * Math.PI / 180), Math.cos(30 * Math.PI / 180)];
/** How far along the outline, as a share of the design's stems, a lighter weight's moves are run smooth as its uprights thin
    apart from its bars (edgeMoves). */
const APART_EASE = 0.35;
/** How much further out than the design's a stem's side and a curve may meet along both, the round between them met
    again by no crotch (stretchRounds), for the round to be drawn again: wholly up to the first, less and less to none at
    the second; and how much thinner than the stem the curve must be. */
const ROUND_GROW = [1.5, 2], STRETCH_HAIR = 0.3;
/** A lighter weight's round inside a join, carried whole (moveRing's carryFillets): its samples each turning away from
    the ink by at least FILLET_TURN (radians, half the turn from the sample before to the one after), FILLET_MIN in all. */
/** A lighter weight's straight edge moved by the line through its samples' moves (thinMoves): how far off their middle
    (units) they must lie, and how much nearer the line (a share of that). */
const STRAIGHT_TAPER = 3, STRAIGHT_FIT = 0.5;
/** And how many of its samples it takes, and how long, as a share of how thick it reads, the edge must be: a short one, a
    stub's or a bar's end, its few moves read off the strokes round it, ran off at a slant. */
const STRAIGHT_FEW = 5, STRAIGHT_LONG = 2;
/** How near a line an edge lies on it, for a lighter weight not to move it out past it (thinMoves). */
const ON_LINE = 2.5;
/** A straight edge cut across its stroke stays as the stroke's end (thinMoves) only by where the stroke's middle ends, within
    END_NEAR times that end's round, or level (within END_LEVEL, the normal's share upright) by a line, within END_BAND of the
    capitals' height, or where it is short, under END_SHORT of that height. */
const END_NEAR = 2, END_LEVEL = 0.9, END_BAND = 0.05, END_SHORT = 0.055;
/** A foot reaching out past its stroke's middle's end by more than CAP_PAST of the end's round, its samples within CAP_TIP of
    the round of the end, made smaller about the end where more than CAP_FOLD of its moved steps turn back (each counted
    wholly from CAP_TURN of a step back on itself, and as much less as it is shorter, as moved, than CAP_SHORT of itself
    as drawn), wholly from CAP_EASE more (thinMoves). */
const CAP_PAST = 1.4, CAP_TIP = 0.15, CAP_FOLD = 0.095, CAP_EASE = 0.05, CAP_TURN = 0.2, CAP_SHORT = 0.05;
/** An edge facing the way the stroke it reads runs moves as a stroke's side it lies in line with past a join (thinMoves):
    their normals within INLINE_COS of one way, it no further off the side's line than INLINE_NEAR units or INLINE_SHARE
    of the capitals' height, and the side moving in by INLINE_MORE units more. */
const INLINE_NEAR = 8, INLINE_SHARE = 0.025, INLINE_COS = 0.97, INLINE_MORE = 20;
/** A serif's bracket drawn again (carryFillets): its level edge's slope (sine) and nearness to a line (a share of the
    capitals' height), its stem's side's lean (sine), the least share of the stem kept, and the longest it may be (times
    the stem's half thickness: longer, a hook's round); drawn so from BRACKET_KEEP of its stem kept, wholly at BRACKET_BLEND
    more. */
const BRACKET_LEVEL = 0.45, BRACKET_NEAR = 0.12, BRACKET_UPRIGHT = 0.35, BRACKET_KEEP = 0.45, BRACKET_BLEND = 0.15, BRACKET_ARC = 3;
/** A serif's bracket at least BRACKET_LONG times its stem's half thickness round, the stem leaning less than
    BRACKET_PLUMB (sine), is drawn again (carryFillets) carried whole or not, from BRACKET_KEEP_LONG of its stem kept,
    wholly at BRACKET_BLEND_LONG more. */
const BRACKET_LONG = 1.5, BRACKET_PLUMB = 0.1, BRACKET_KEEP_LONG = 0.3, BRACKET_BLEND_LONG = 0.08;
const FILLET_TURN = 0.02, FILLET_MIN = 25 * Math.PI / 180;
/** A heavier weight's serif's bracket carried whole (moveRing's carryRounds): turning ROUND_INSIDE (radians) or more in
    all, and no longer than ROUND_CARRY times as far as the edges either side move, nor ROUND_SHORT of the capitals'
    height. */
const ROUND_INSIDE = 25 * Math.PI / 180, ROUND_CARRY = 4, ROUND_SHORT = 0.15;
/** A round on a letter's outside ending within this many samples of a crotch runs on into it, and is not carried as a
    corner's (carryFillets). */
const FILLET_CROTCH = 4;
/** A round on a letter's outside in a font without serifs carried whole no longer than four times as far as its edges
    move, give or take (carryFillets), and carried less and less as it is longer, to not at all FILLET_EASE of that
    longer. */
const FILLET_EASE = 0.06;
/** The most a round on the outside of a corner, carried whole, turns (carryFillets): more is a stroke's round end. */
const ROUND_MOST = 135 * Math.PI / 180;
/** A slit's tip (carryFillets): within how far of the strokes drawn again ahead of it, and how far past them it goes. */
const SLIT_NEAR = 4, SLIT_PAST = 2;
/** The fewest samples a flat edge along a line runs (flatOn): 40 units. */
const FLAT_RUN = 8;
/** How long, as many times the stroke it closes is thick, a flat edge along a line may run and be that stroke's end
    (thinMoves): a stem's foot on the baseline, not a slab serif's. */
const FLAT_END = 1.25;
/** How far round a lighter weight's join, as many times the join's own distance to the paper, it is its strokes drawn
    again (rebuildJoins), and how much its stems must thin for it to be: to under 2/5 of themselves (less, the moves
    keep it well, its brackets and all). */
const JOIN_REACH = 1.5, REBUILD_BELOW = 0.4;
/** How long, in its join's rounds, a stroke from a join out to an end standing on a line may be for the join not to be
    drawn again (rebuildJoins): a serif's corner read as a stroke of its own; not the run on of a stroke through the
    join (within 15°); and only where the join's round is more than REBUILD_HAIR times its thinnest stroke's (a fat
    face's Z's foot, 3.7). */
const REBUILD_TIP = 3, REBUILD_THROUGH = Math.cos(Math.PI / 12), REBUILD_HAIR = 3;
/** How far, as a share of a stroke's half thickness (and a unit), a lighter weight's moved outline may stand off its
    strokes drawn again within a join and stay (rebuildJoins). */
const JOIN_GIVE = 0.2;
/** How far out from a join, in the join's own distance to the paper, a lighter weight's strokes run on through it as
    they leave it (thinReads): the skeleton bends round toward the others nearer it. */
const STRAIGHT_FROM = 1.6;
/** A fat face's hairline into a stem running on through its join is run on straight to its middle (fatReads) where it
    is no thicker than HAIR_INTO of the stem as it leaves the join, keeps within HAIR_STRAIGHT of the join's round of a
    line over twice that round on, and meets the stem's middle within HAIR_RUN of that round back along it, so run on
    HAIR_WENT of that round or more off where the skeleton put it (bent round into the join); and its
    K's arm and leg so too, its arm no thicker than HAIR_INTO of its leg. A fat face's stroke's side a foot drawn as
    thick as its stem takes in goes in as its stroke's side where it faces off the line by less than FAT_SIDE_UP (the
    sine of its slope) and its stroke's half thickness is FAT_SIDE_HEAVY of the font's stems or more (thinMoves). */
const HAIR_INTO = 0.5, HAIR_STRAIGHT = 0.15, HAIR_RUN = 4, HAIR_WENT = 0.25, FAT_SIDE_UP = 0.7, FAT_SIDE_HEAVY = 0.25;
/** How nearly opposite ways two strokes leave a join to be one stem run on through it (straightThrough): within 30°, as
    the cosine of the angle between them. */
const STRAIGHT_THROUGH = Math.cos(150 * Math.PI / 180);
/** A sample's round spans its stroke where it touches the outline again at least 140° round from the sample (the
    cosine of that angle, thinReads). */
const ACROSS = Math.cos(140 * Math.PI / 180);
/** The side, as a share of the capitals' height, of the largest crumb (an outline a lighter weight leaves where strokes
    meet, a sliver of ink or a pinhole) dropped from it (crumb). */
const CRUMB = 0.075;
/** How many times a crumb's ink a piece apart holds, at most, for a mend grown in part of the way to keep it only where
    the letter has ink at either end of the stretch (movedOnce). */
const CRUMB_NEAR = 1.2;
/** How much narrower than the strokes drawn again, in units (or a fifth, the more), the strokes that mend a lighter
    weight's broken letter are (thinStrokes). */
const MEND_IN = 2.5;
/** How thick, as the half thickness R a lighter weight's stroke is now, the strokes that mend its broken letter are. */
const mendBy = (R: number) => Math.max(1, Math.min(R - MEND_IN, R * 0.8));
/** A lighter weight's letter rebuilt from its skeleton (thinReads): each point along the middles of its strokes, with
    the distance to the paper there (`r`, half the stroke's thickness, more where strokes meet), the stroke's own half
    thickness (`s`: within JOIN_ZONE of a join, no more than it reads that far out, the bulge where they meet taken out),
    the way the stroke runs (`tx`, `ty`), and the joins whose bulge it lies in (`zone`); and each join's strokes leaving
    it, by their own half thickness and way just past the bulge (`legs`). */
interface ThinReads {
  x: Float64Array; y: Float64Array; r: Float64Array; s: Float64Array; tx: Float64Array; ty: Float64Array; zone: number[][]; legs: Map<number, Leg[]>;
  /** the way each point's stroke runs read as far either way as it is half thick (DIR_REACH), for a letter whose uprights
      thin apart from its bars (strokeRs) */ wx: Float64Array; wy: Float64Array;
  /** on a serif's foot drawn level (withFeet), the letter's edge along its line and which way from it the ink lies (NaN
      and 0 off one); and on the stem run down to one, which way from its line the ink lies; and which of feet either is
      (-1) */ foot: Float64Array; footDir: Int8Array; footStem: Int8Array; footId: Int32Array;
  /** on a skeleton read along straight strokes, the strokes run level along a line each point goes up or down with
      (lineSkeleton's FLUSH) */ flush: ([Flush, number][] | undefined)[];
  /** the vertices standing on a line (withFeet), where they are drawn and how far their join reached as read, and 1 on
      the strokes' middles run in to them */ vertices: { x: number; line: number; y: number; r: number; ox: number; oy: number }[]; vrun: Uint8Array;
  /** the letter's feet drawn level: the line, which way the ink lies, the stem's middle from the line up, a point of it,
      and each serif's reach along the line and a point of it */
  feet: { line: number; dir: number; stem: number[]; stemJ: number; serifs: { x0: number; x1: number; j: number; edge: number }[]; side: number }[];
  /** each sample's nearest point of them to its stroke's middle, contour by contour (-1 with no skeleton) */ near: number[][];
  /** whether each sample's round, the widest touching it, touches the outline again across from it (a side, its round
      spanning its stroke), not only round to one side of it (by a corner, a stroke's end) */ across: boolean[][];
  /** the joins, where they are and their distance to the paper */ joins: Map<number, SkPt>;
  /** its points by where they lie (pointGrid), made when first asked for */ grid?: PointGrid;
}
/** A stroke leaving a join: its own half thickness just past the join's bulge, the way it leaves, its points (of
    ThinReads') from the join out, and the skeleton node it runs to. */
interface Leg { s: number; x: number; y: number; pts: number[]; to: number }

/** How far either way along a lighter weight's skeleton the way each point's stroke runs is read (thinReads), as a share of
    the stroke's half thickness there: read two points either way, on the coarse grid, it turned a step at each point. */
const DIR_REACH = 1;
function thinReads(rig: SkinRig): ThinReads {
  const sk = thinSkeleton(rig), isJoin = (n: number) => sk.nodes[n].edges.length >= 3;
  const cum = sk.edges.map(E => { const c = [0]; for (let k = 1; k < E.pts.length; k++) c.push(c[k - 1] + Math.hypot(E.pts[k].x - E.pts[k - 1].x, E.pts[k].y - E.pts[k - 1].y)); return c; });
  // along each stroke, its distance to the paper, but within JOIN_ZONE of a join no more than it reads that far out (or,
  // a stroke shorter than that, than it reads at its thinnest)
  const own = sk.edges.map((E, e) => {
    const c = cum[e], L = c[c.length - 1], rs = E.pts.map(p => p.r), out = rs.slice();
    for (const end of ['a', 'b'] as const) {
      const node = end === 'a' ? E.a : E.b;
      if (!isJoin(node)) continue;
      const Z = JOIN_ZONE * sk.nodes[node].r, from = (i: number) => (end === 'a' ? c[i] : L - c[i]);
      let at = Math.min(...rs);
      if (L > Z) { const i = end === 'a' ? c.findIndex(v => v >= Z) : c.length - 1 - [...c].reverse().findIndex(v => L - v >= Z); at = rs[i]; }
      for (let i = 0; i < rs.length; i++) if (from(i) < Z) out[i] = Math.min(out[i], at);
    }
    return out;
  });
  // (a short stroke from one join to another, inside the ink where they meet, no thicker than the strokes leaving them
  // read: a K's arms meeting just off its stem; or, where strokes leave them running on straight through it, within
  // LINK_ON, than those: two strokes crossing, read as two joins a short stroke apart along the heavier, which, as thin as
  // the hairline crossing it, the heavy stroke's sides by the crossing read as theirs, and they stayed: a fat face's &'s
  // middle a blob at Regular, and an x's, an 8's waist a lump)
  sk.edges.forEach((E, e) => {
    if (!isJoin(E.a) || !isJoin(E.b) || cum[e][cum[e].length - 1] > JOIN_ZONE * Math.min(sk.nodes[E.a].r, sk.nodes[E.b].r)) return;
    let most = Infinity, on = Infinity;
    for (const n of [E.a, E.b]) {
      const way = leaving(sk, { e, end: E.a === n ? 'a' : 'b' }, cum[e][cum[e].length - 1]);
      for (const k of sk.nodes[n].edges) {
        if (k === e) continue;
        const K = sk.edges[k], c = cum[k], L = c[c.length - 1], Z = Math.min(JOIN_ZONE * sk.nodes[n].r, L / 2);
        const i = K.a === n ? Math.max(0, c.findIndex(v => v >= Z)) : c.length - 1 - Math.max(0, [...c].reverse().findIndex(v => L - v >= Z));
        most = Math.min(most, own[k][i]);
        const d = leaving(sk, { e: k, end: K.a === n ? 'a' : 'b' }, Math.max(Z, 2));
        if (d.x * way.x + d.y * way.y < -LINK_ON) on = Math.min(on, own[k][i]);
      }
    }
    const cap = on < Infinity ? on : most;
    if (cap < Infinity) own[e] = own[e].map(v => Math.min(v, cap));
  });
  const first = cum.map((_, e) => sk.edges.slice(0, e).reduce((a, E) => a + E.pts.length, 0));
  const legs = new Map<number, Leg[]>();
  sk.nodes.forEach((N, n) => {
    if (!isJoin(n)) return;
    legs.set(n, branches(sk, n).map(br => {
      const c = cum[br.e], L = c[c.length - 1], Z = Math.min(JOIN_ZONE * N.r, L / 2);
      const i = br.end === 'a' ? Math.max(0, c.findIndex(v => v >= Z)) : c.length - 1 - Math.max(0, [...c].reverse().findIndex(v => L - v >= Z));
      const d = leaving(sk, br, Math.max(Z, 2)), all = sk.edges[br.e].pts.map((_, k) => first[br.e] + k);
      const E = sk.edges[br.e];
      return { s: own[br.e][i], x: d.x, y: d.y, pts: br.end === 'a' ? all : all.reverse(), to: br.end === 'a' ? E.b : E.a };
    }));
  });
  const joins = [...legs.keys()], n = sk.edges.reduce((a, E) => a + E.pts.length, 0);
  const near = rig.bones.map(bs => bs.map(b => { const q = nearestOn(sk, b.ax, b.ay); return q ? first[q.e] + q.i : -1; }));
  // (where the round about the sample's middle touches the outline again, away from the sample: the nearest sample of
  // any outline there, bucketed)
  const all = rig.bones.flat(), CELL = 16, cells = new Map<number, Bone[]>(), key = (cx: number, cy: number) => cx * 100003 + cy;
  for (const q of all) { const k = key(Math.floor(q.x / CELL), Math.floor(q.y / CELL)); const l = cells.get(k); if (l) l.push(q); else cells.set(k, [q]); }
  const across = rig.bones.map(bs => bs.map(b => {
    const ux = b.x - b.ax, uy = b.y - b.ay, ul = Math.hypot(ux, uy);
    if (ul < 1) return true;
    const reach = ul * 1.15 + 3, c0 = Math.floor((b.ax - reach) / CELL), c1 = Math.floor((b.ax + reach) / CELL), r0 = Math.floor((b.ay - reach) / CELL), r1 = Math.floor((b.ay + reach) / CELL);
    let best: Bone | null = null, bd = Infinity;
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) for (const q of cells.get(key(cx, cy)) ?? []) {
      if (Math.hypot(q.x - b.x, q.y - b.y) < 0.75 * ul) continue;
      const d = Math.hypot(q.x - b.ax, q.y - b.ay);
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) return true;
    return ((best.x - b.ax) * ux + (best.y - b.ay) * uy) / ((Math.hypot(best.x - b.ax, best.y - b.ay) || 1) * ul) < ACROSS;
  }));
  const out: ThinReads = { x: new Float64Array(n), y: new Float64Array(n), r: new Float64Array(n), s: new Float64Array(n), tx: new Float64Array(n), ty: new Float64Array(n), wx: new Float64Array(n), wy: new Float64Array(n), foot: new Float64Array(n).fill(NaN), footDir: new Int8Array(n), footStem: new Int8Array(n), footId: new Int32Array(n).fill(-1), vertices: VERTICES.get(sk) ?? [], vrun: new Uint8Array(n), flush: [], feet: [], zone: [], legs, near, across, joins: new Map(joins.map(k => [k, sk.nodes[k]])) };
  let j = 0;
  const idx = new Map<SkPt, number>(), footIds = new Map<Foot, number>();
  sk.edges.forEach((E, e) => E.pts.forEach((p, i) => {
    const a = E.pts[Math.max(0, i - 2)], b = E.pts[Math.min(E.pts.length - 1, i + 2)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // (and read as far either way as its stroke is half thick, or two points, the more: read two points either way, the
    // way turned a step at each point of the grid, and where the uprights thin apart from the bars (Verticals) a round's
    // sides went in and out with it, an o's top saw-toothed)
    const reach = own[e][i] * DIR_REACH, c = cum[e];
    let i0 = Math.max(0, i - 2), i1 = Math.min(E.pts.length - 1, i + 2);
    while (i0 > 0 && c[i] - c[i0] < reach) i0--;
    while (i1 < E.pts.length - 1 && c[i1] - c[i] < reach) i1++;
    const wa = E.pts[i0], wb = E.pts[i1], wl = Math.hypot(wb.x - wa.x, wb.y - wa.y) || 1;
    out.wx[j] = (wb.x - wa.x) / wl; out.wy[j] = (wb.y - wa.y) / wl;
    out.x[j] = p.x; out.y[j] = p.y; out.r[j] = p.r; out.s[j] = own[e][i]; out.tx[j] = (b.x - a.x) / l; out.ty[j] = (b.y - a.y) / l; out.flush[j] = FLUSH.get(p);
    const ft = FEET.get(p);
    if (VRUN.has(p)) out.vrun[j] = 1;
    idx.set(p, j);
    if (ft) {
      out.foot[j] = ft.edge;
      if (ft.stem) out.footStem[j] = ft.foot.dir; else out.footDir[j] = ft.foot.dir;
      if (!footIds.has(ft.foot)) footIds.set(ft.foot, footIds.size);
      out.footId[j] = footIds.get(ft.foot)!;
    }
    out.zone.push(joins.filter(k => Math.hypot(p.x - sk.nodes[k].x, p.y - sk.nodes[k].y) < JOIN_ZONE * sk.nodes[k].r));
    j++;
  }));
  out.feet = [...footIds.keys()].map(F => ({ line: F.line, dir: F.dir, stem: [F.stem[0].x, F.stem[0].y, F.stem[1].x, F.stem[1].y], stemJ: idx.get(F.stemPt) ?? -1, serifs: F.serifs.map(S => ({ x0: S.x0, x1: S.x1, j: idx.get(S.pt) ?? -1, edge: S.edge })), side: F.side ?? 0 }));
  // within a join's bulge each stroke's middle bends round to meet the others' (the skeleton of a heavy letter): drawn
  // again thinner along it, a stem a bowl or an arm joins would bend toward it there. A stem running on through the join
  // (two of its strokes leaving it opposite ways) runs straight through instead, as a thin face draws it, and the other
  // strokes come into it as they curved in, their ends carried onto it
  // (not one read along its straight strokes, which run straight into their joins as they are)
  if (!LINED.has(sk)) for (const [k, ls] of legs) {
    // (a join a short stroke away, too short to read, goes with the join it leaves, its own strokes carried with it out
    // to its bulge's edge: a K's arms, meeting just off its stem, meet the stem run straight)
    const went = straightThrough(out, sk.nodes[k], ls);
    if (went) for (const l of went.joins) {
      const N = sk.nodes[l.to];
      for (const o of legs.get(l.to) ?? []) {
        if (o.to === k) continue;
        const D = STRAIGHT_FROM * N.r;
        for (let m = 0, arc = 0; m < o.pts.length && arc < D; m++) {
          if (m) arc += Math.hypot(out.x[o.pts[m]] - out.x[o.pts[m - 1]], out.y[o.pts[m]] - out.y[o.pts[m - 1]]);
          const w = Math.max(0, 1 - arc / D);
          out.x[o.pts[m]] += went.sx * w; out.y[o.pts[m]] += went.sy * w;
        }
      }
    }
  }
  return out;
}

/** A join's stem run straight through it (thinReads): of the strokes leaving join N, the two leaving it most nearly
    opposite ways (within STRAIGHT_THROUGH), each read as a line out past the join's bulge (STRAIGHT_FROM), have their
    points within the bulge set on the line through them, and every other stroke's points there go as far as the join's
    own point goes onto it, less and less out to the bulge's edge (a stroke too short to read, less and less out to its
    end, or, running to another join, all the way, that join going too). How far the join went, and the strokes to the
    joins that go with it. */
function straightThrough(T: ThinReads, N: SkPt, ls: Leg[], hairs = false): { sx: number; sy: number; joins: Leg[] } | null {
  const X = T.x.slice(), Y = T.y.slice();
  // (each stroke where it leaves the bulge, its point there and the way out along it: the line from there through its
  // middle a little further out, read as the mean of a few points each, the skeleton being a little uneven)
  const out = ls.map(l => {
    const pts = l.pts, L = pts.length, arc = [0];
    for (let m = 1; m < L; m++) arc.push(arc[m - 1] + Math.hypot(X[pts[m]] - X[pts[m - 1]], Y[pts[m]] - Y[pts[m - 1]]));
    const from = (d: number) => { const i = arc.findIndex(v => v >= d); return i < 0 ? L - 1 : i; };
    // (no further out than 2/5 of the way along it, read over no more than 3/10 of it: a short stroke's other end bends too)
    const at0 = Math.min(STRAIGHT_FROM * N.r, 0.4 * arc[L - 1]), e = from(at0), f = from(at0 + Math.min(N.r, 0.3 * arc[L - 1]));
    if (e < 1 || f - e < 6) return null;
    const mean = (i: number) => {
      let x = 0, y = 0, c = 0;
      for (let m = Math.max(0, i - 3); m <= Math.min(L - 1, i + 3); m++) { x += X[pts[m]]; y += Y[pts[m]]; c++; }
      return { x: x / c, y: y / c };
    };
    const A = mean(e), B = mean(f), l2 = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    return { pts, e, arc, A, ux: (B.x - A.x) / l2, uy: (B.y - A.y) / l2 };
  });
  let best: [number, number] | null = null, most = -STRAIGHT_THROUGH;
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const a = out[i], b = out[j];
    if (!a || !b) continue;
    const dot = a.ux * b.ux + a.uy * b.uy;
    if (dot < most) { most = dot; best = [i, j]; }
  }
  if (!best) return null;
  const a = out[best[0]]!, b = out[best[1]]!, lx = b.A.x - a.A.x, ly = b.A.y - a.A.y, ll = Math.hypot(lx, ly) || 1, vx = lx / ll, vy = ly / ll;
  const onto = (x: number, y: number) => { const t = (x - a.A.x) * vx + (y - a.A.y) * vy; return { x: a.A.x + vx * t, y: a.A.y + vy * t }; };
  // (the join's own point onto the line: a stem bending far off it isn't one stroke run on)
  const J = onto(N.x, N.y), sx = J.x - N.x, sy = J.y - N.y;
  if (Math.hypot(sx, sy) > 0.5 * N.r) return null;
  const joins: Leg[] = [];
  out.forEach((o, i) => {
    if (!o && hairs) return;
    if (!o) {
      const l = ls[i], pts = l.pts, isJoin = T.joins.has(l.to);
      if (isJoin) joins.push(l);
      let L = 0;
      for (let m = 1; m < pts.length; m++) L += Math.hypot(X[pts[m]] - X[pts[m - 1]], Y[pts[m]] - Y[pts[m - 1]]);
      for (let m = 0, arc = 0; m < pts.length; m++) {
        if (m) arc += Math.hypot(X[pts[m]] - X[pts[m - 1]], Y[pts[m]] - Y[pts[m - 1]]);
        const w = isJoin ? 1 : 1 - arc / (L || 1);
        T.x[pts[m]] = X[pts[m]] + sx * w; T.y[pts[m]] = Y[pts[m]] + sy * w;
      }
      return;
    }
    const through = i === best![0] || i === best![1];
    if (hairs && through) return;
    // (a fat face's hairline, straight, run on straight into the stem to its middle)
    if (hairs && ls[i].s < HAIR_INTO * Math.min(ls[best![0]].s, ls[best![1]].s)) {
      const far = (() => { const d = o.arc[o.e] + 2 * N.r, k = o.arc.findIndex(v => v >= d); return k < 0 ? -1 : k; })();
      const det = o.ux * vy - o.uy * vx;
      if (far > 0 && Math.abs(det) > 0.3) {
        let off = 0;
        for (let m = o.e; m <= far; m++) off = Math.max(off, Math.abs((X[o.pts[m]] - o.A.x) * o.uy - (Y[o.pts[m]] - o.A.y) * o.ux));
        // where the hairline's line, back from A, meets the stem's: A - u t = a.A + v s
        const t = ((a.A.x - o.A.x) * vy - (a.A.y - o.A.y) * vx) / -det, I = { x: o.A.x - o.ux * t, y: o.A.y - o.uy * t };
        if (off < HAIR_STRAIGHT * N.r && t > 0 && t < HAIR_RUN * N.r) {
          for (let m = 0; m < o.e; m++) { const f = o.arc[m] / (o.arc[o.e] || 1), p = o.pts[m]; const sg = Math.sign(T.tx[p] * o.ux + T.ty[p] * o.uy) || 1; T.x[p] = I.x + (o.A.x - I.x) * f; T.y[p] = I.y + (o.A.y - I.y) * f; T.tx[p] = sg * o.ux; T.ty[p] = sg * o.uy; }
          return;
        }
      }
    }
    if (hairs) return;
    for (let m = 0; m < o.e; m++) {
      const p = o.pts[m];
      if (through) {
        const q = onto(X[p], Y[p]), s = Math.sign(T.tx[p] * vx + T.ty[p] * vy) || 1;
        T.x[p] = q.x; T.y[p] = q.y; T.tx[p] = s * vx; T.ty[p] = s * vy;
      } else {
        const w = 1 - o.arc[m] / (o.arc[o.e] || 1);
        T.x[p] = X[p] + sx * w; T.y[p] = Y[p] + sy * w;
      }
    }
  });
  return { sx, sy, joins };
}

/** A lighter weight's skeleton points (thinReads) by where they lie: a grid GRID_CELL units a side from (x0, y0), W
    cells across and H up, each cell's points (`idx` from start[cell] to start[cell + 1]). */
interface PointGrid { x0: number; y0: number; W: number; H: number; start: Int32Array; idx: Int32Array }
const GRID_CELL = 16;
function pointGrid(T: ThinReads): PointGrid {
  const n = T.x.length;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let j = 0; j < n; j++) { x0 = Math.min(x0, T.x[j]); y0 = Math.min(y0, T.y[j]); x1 = Math.max(x1, T.x[j]); y1 = Math.max(y1, T.y[j]); }
  if (!n) { x0 = y0 = 0; x1 = y1 = 1; }
  const W = Math.floor((x1 - x0) / GRID_CELL) + 1, H = Math.floor((y1 - y0) / GRID_CELL) + 1, at = new Int32Array(n), start = new Int32Array(W * H + 1);
  for (let j = 0; j < n; j++) { at[j] = Math.floor((T.y[j] - y0) / GRID_CELL) * W + Math.floor((T.x[j] - x0) / GRID_CELL); start[at[j] + 1]++; }
  for (let c = 0; c < W * H; c++) start[c + 1] += start[c];
  const fill = start.slice(0, W * H), idx = new Int32Array(n);
  for (let j = 0; j < n; j++) idx[fill[at[j]]++] = j;
  return { x0, y0, W, H, start, idx };
}
/** Every point of grid g lying within `band` of the line through (x, y) the way (dx, dy) (a unit), as far as `reach`
    along it each way, and more: the cells, row by row, the band crosses. */
function inBand(g: PointGrid, x: number, y: number, dx: number, dy: number, reach: number, band: number, see: (j: number) => void) {
  const ax = x - dx * (reach + band), ay = y - dy * (reach + band), bx = x + dx * (reach + band), by = y + dy * (reach + band), pad = band + 1;
  const r0 = Math.max(0, Math.floor((Math.min(ay, by) - pad - g.y0) / GRID_CELL)), r1 = Math.min(g.H - 1, Math.floor((Math.max(ay, by) + pad - g.y0) / GRID_CELL));
  for (let r = r0; r <= r1; r++) {
    // (the line's stretch within the band's reach of the row, and as far again either side)
    const lo = g.y0 + r * GRID_CELL - pad, hi = lo + GRID_CELL + 2 * pad;
    let t0 = 0, t1 = 1;
    if (Math.abs(by - ay) > 1e-9) {
      const u = (lo - ay) / (by - ay), v = (hi - ay) / (by - ay);
      t0 = Math.max(0, Math.min(u, v)); t1 = Math.min(1, Math.max(u, v));
      if (t0 > t1) continue;
    } else if (ay < lo || ay > hi) continue;
    const xa = ax + (bx - ax) * t0, xb = ax + (bx - ax) * t1;
    const c0 = Math.max(0, Math.floor((Math.min(xa, xb) - pad - g.x0) / GRID_CELL)), c1 = Math.min(g.W - 1, Math.floor((Math.max(xa, xb) + pad - g.x0) / GRID_CELL));
    for (let c = r * g.W + c0, e = r * g.W + c1; c <= e; c++) for (let k = g.start[c]; k < g.start[c + 1]; k++) see(g.idx[k]);
  }
}

/** Whether a sample lies on a flat edge along one of the letter's lines: a run of samples facing straight up or down off
    the line, at least FLAT_RUN of them (drawn as a line or, as a sheet may draw it, a curve as flat; the top of an O, which
    only touches its line, turns off it within a few): a lighter weight leaves it there. Read once a rig. */
function flatOn(rig: SkinRig, b: Bone) {
  let set = flatEdges.get(rig);
  if (!set) {
    set = new Set();
    flatEdges.set(rig, set);
    const c = rig.ctx, lines = [0, c.cap, ...(c.lower ? [c.xh, c.asc, c.desc] : [])];
    for (const bs of rig.bones) {
      const n = bs.length, on = bs.map(q => !q.dot && Math.abs(q.ny) > 0.999 && lines.some(L => Math.abs(q.y - L) < 2.5));
      if (on.every(Boolean)) continue;
      // (each run, from a sample after one that isn't)
      for (let s = 0; s < n; s++) {
        if (!on[s] || on[(s - 1 + n) % n]) continue;
        let e = s;
        while (on[e % n] && e - s < n) e++;
        if (e - s >= FLAT_RUN) for (let k = s; k < e; k++) set.add(bs[k % n]);
      }
    }
  }
  return set.has(b);
}
const flatEdges = new WeakMap<SkinRig, Set<Bone>>();

/** The samples of a letter's flat cuts across where strokes meet, not the sides of a level stroke: a run facing
    straight up or down, corner to corner, whose ink, read straight across it, ends at an edge that doesn't face back at
    it (within 40°, ALONG[0]) as a bar's other side does but runs off at a slant, a crotch's: a V's or an M's flat foot
    under its legs' crotch, an A's flat top over its counter's apex. Moved as a bar's side by Horizontals, a V's foot
    went up as its legs stood, its corners out past them and, the letter put back to its line, its legs down under it,
    a spike at Horizontals 0. A whole run, CUT_SHARE of its samples so (a serif's top reads so only over the leg it
    stands on), no further across than CUT_ACROSS times its stroke's thickness, and CUT_RUN samples long or more. Read
    once a rig. */
function flatCuts(rig: SkinRig) {
  let set = FLAT_CUTS.get(rig);
  if (set) return set;
  set = new Set();
  FLAT_CUTS.set(rig, set);
  for (const bs of rig.bones) {
    const n = bs.length, level = bs.map(b => !b.corner && !b.dot && !b.cap && Math.abs(b.ny) >= CUT_LEVEL);
    if (level.every(Boolean)) continue;
    const slanted = (b: Bone) => {
      let best = Infinity, hit: Bone | null = null;
      for (const os of rig.bones) for (let k = 0; k < os.length; k++) {
        const o = os[k], e = os[(k + 1) % os.length];
        if (o === b || e === b) continue;
        const sx = e.x - o.x, sy = e.y - o.y, den = b.nx * sy - b.ny * sx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((o.x - b.x) * sy - (o.y - b.y) * sx) / den, w = ((o.x - b.x) * b.ny - (o.y - b.y) * b.nx) / den;
        if (t > 0.5 && w >= 0 && w <= 1 && t < best) { best = t; hit = o; }
      }
      return !!hit && best < CUT_ACROSS * 2 * b.w && -(b.nx * hit.nx + b.ny * hit.ny) < ALONG[0];
    };
    // (each run of level samples, from one after one that isn't)
    for (let s = 0; s < n; s++) {
      if (!level[s] || level[(s - 1 + n) % n]) continue;
      let e = s;
      while (level[e % n] && e - s < n) e++;
      // (between two corners turning toward the ink, a cut's: not a stem's top rounded into its sides, a script i's)
      const A = bs[(s - 1 + n) % n], B = bs[e % n];
      if (e - s < CUT_RUN || !A.corner || !B.corner || concaveAt(A) || concaveAt(B)) continue;
      let k = 0;
      for (let i = s; i < e; i++) if (slanted(bs[i % n])) k++;
      if (k >= CUT_SHARE * (e - s)) for (let i = s; i < e; i++) set.add(bs[i % n]);
    }
  }
  return set;
}
const FLAT_CUTS = new WeakMap<SkinRig, Set<Bone>>();
/** Contour r's flat cuts (flatCuts) as the stroke ends a heavier weight's moves carry (moveRing, endsWithSides): each
    run of them from the sample before it to the one after, its corners, so it goes with the strokes' sides that meet it,
    as long as they now leave it (held where it was, a thinner stroke's sides met it in from its ends, and its samples
    out past them folded into a speck, an Industrial K's arm's top at Contrast 100). */
function cutEnds(rig: SkinRig, r: number): EndRun[] {
  let all = CUT_ENDS.get(rig);
  if (!all) {
    const cuts = flatCuts(rig);
    all = rig.bones.map(bs => {
      const n = bs.length, out: EndRun[] = [];
      for (let s = 0; s < n; s++) {
        if (!cuts.has(bs[s]) || cuts.has(bs[(s - 1 + n) % n])) continue;
        let e = s;
        while (cuts.has(bs[e % n]) && e - s < n) e++;
        if (e - s < n) out.push({ a: s - 1, b: e, ball: 0, pin: 0.5 });
      }
      return out;
    });
    CUT_ENDS.set(rig, all);
  }
  return all[r] ?? [];
}
const CUT_ENDS = new WeakMap<SkinRig, EndRun[][]>();
/** How nearly straight up or down a sample of a flat cut faces (the normal's share upright), how far across it, as the
    stroke it reads is thick, the ink may end, how much of a run must read so, and the fewest samples in it (flatCuts). */
const CUT_LEVEL = 0.97, CUT_ACROSS = 4, CUT_SHARE = 0.8, CUT_RUN = 3;

/** Whether a corner turns away from the ink (inside a join, a crotch), not toward it. */
const concaveAt = (b: Bone) => (b.outx! - b.inx!) * b.nx + (b.outy! - b.iny!) * b.ny < 0;

/** A lighter weight's crotch where two strokes join (thinMoves): the ways the strokes' middles leave the join, in and
    out, for moveRing to meet its edges again along, and where the strokes' edges, as thin as the strokes are now, cross
    (null where they don't, near it). */
interface Crotch { inx: number; iny: number; outx: number; outy: number; at: P | null }

/** Where the edges of two strokes leaving join N (their skeleton points pa and pb, of T's, from the join out), each
    as far from its middle as R says (the side corner b lies), cross: the crossing nearest the join (an e's bowl, round its
    counter, crosses its bar's edge again at the bar's far end),
    within a few times the join's distance to the paper. A d's bowl, thinned, runs into its stem there, further down than
    its corner was, where the bowl's edge curves on to meet it. */
function crossing(T: ThinReads, R: Float64Array, N: SkPt, pa: number[], pb: number[], b: Bone, H: Float64Array | null = null): P | null {
  const reach = 4 * N.r + 20;
  const edge = (pts: number[]) => {
    // (the side the corner lies, read where the stroke has left the join's bulge)
    const k = pts.find(j => Math.hypot(T.x[j] - N.x, T.y[j] - N.y) >= N.r) ?? pts[pts.length - 1];
    const side = Math.sign((b.x - T.x[k]) * -T.ty[k] + (b.y - T.y[k]) * T.tx[k]) || 1, out: P[] = [];
    for (const j of pts) {
      if (Math.hypot(T.x[j] - N.x, T.y[j] - N.y) > reach) break;
      out.push({ x: T.x[j] - side * T.ty[j] * R[j], y: T.y[j] + side * T.tx[j] * R[j] + (H ? H[j] : 0) });
    }
    // (carried on past the join as far again as the join is from the paper, the way it runs in: two strokes' edges that
    // run straight on through it, as thinReads draws them, meet a little past where their points end)
    if (out.length > 1) {
      const a = out[0], b = out[Math.min(out.length - 1, 3)], l = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      out.unshift({ x: a.x + (a.x - b.x) / l * N.r, y: a.y + (a.y - b.y) / l * N.r });
    }
    return out;
  };
  const ea = edge(pa), eb = edge(pb);
  let best: P | null = null, near = Infinity;
  for (let i = 0; i + 1 < ea.length; i++) for (let j = 0; j + 1 < eb.length; j++) {
    const p = ea[i], p1 = ea[i + 1], q = eb[j], q1 = eb[j + 1], ux = p1.x - p.x, uy = p1.y - p.y, vx = q1.x - q.x, vy = q1.y - q.y;
    const den = ux * vy - uy * vx;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((q.x - p.x) * vy - (q.y - p.y) * vx) / den, s = ((q.x - p.x) * uy - (q.y - p.y) * ux) / den;
    if (t < 0 || t > 1 || s < 0 || s > 1) continue;
    const x = p.x + ux * t, y = p.y + uy * t, d = Math.hypot(x - N.x, y - N.y);
    if (d < near) { near = d; best = { x, y }; }
  }
  return best;
}

/** How far each sample of contour r moves out (in, negative) as a lighter weight thins its strokes: the letter is drawn
    again from its skeleton, each point along a stroke's middle the middle of a round as wide as the stroke is now (as
    weighsOf thins it; where strokes meet, the round there thinned as much as the heaviest of them, but no thinner than
    the stroke it lies on is now), and each sample goes in along its normal, the line from its stroke's middle out
    through it, to where those rounds' ink ends: a side as far in as its stroke thins, and where a thin stroke runs into
    a stem, on to the stem's side, so the join stays whole. And how much each sample's stroke thins (k0). */
function thinMoves(rig: SkinRig, bs: Bone[], r: number, mv: MoveMap) {
  const T = rig.thin ??= thinReads(rig), n = T.x.length, H = movedHug(rig, mv);
  // a crotch's edges, where its two strokes join: each the way its stroke's middle runs as it comes out of the join (as
  // far from it as the join is from the paper; nearer, the skeleton bends round to meet the other strokes' middles),
  // for moveRing to meet them again along: a thin stroke flaring into a heavy one (an 8's waist, an A's bar) runs on
  // into it at its own thickness, where its flaring edges, met again, would close it to a point
  // (each skeleton point's round as thick as its stroke is now, and the widest; and the points by where they lie, for
  // the rays below)
  const R = new Float64Array(n);
  let Rmost = 0;
  // (how far the font thins its strokes by how thick each is: drawn with much contrast, weighsOf)
  const { hair: h0 } = rig.ref(), byThick = thickShare(rig, mv);
  // (as the weight keeps it, and as much thinner again as Verticals thin the uprights past it: kept as the bars are,
  // Verticals at 0 left a low-contrast sans's stems no thinner than its bars, which they don't thin, its e's bowl's side
  // 8 units in of the 30 asked, its counter's side the whole way, and the bowl parted at its bar)
  const hairKept = h0 * mv.weighs({ tx: 1, ty: 0, w: h0 / 2, serifDx: 0, dot: false } as Bone) * mv.past;
  const floor = hairFloor(rig, mv), fat = fatFace(rig), sideBest = (b: Bone, j: number) => (fat && T.vrun[j] ? Math.max(b.best, T.s[j]) : b.best);
  const W = strokeRs(rig, mv);
  for (let j = 0; j < n; j++) { R[j] = Math.max(0, W[j], Math.min(T.s[j], floor)); Rmost = Math.max(Rmost, R[j]); }
  const grid = T.grid ??= pointGrid(T);
  const crotches = new Map<number, Crotch>(), pins = new Map<number, P>(), feet = new Map<number, [number, number]>();
  bs.forEach((b, i) => {
    if (!b.corner || !concaveAt(b)) return;
    let N: SkPt | null = null, n0 = -1;
    // (a vertex's join, run down to where its strokes meet, reaching its corners as far as it did as read)
    for (const [k, q] of T.joins) {
      const V = T.vertices.find(v => v.x === q.x && v.y === q.y), zr = V?.r ?? q.r;
      const d = Math.hypot(b.x - q.x, b.y - q.y), dz = V ? Math.min(d, Math.hypot(b.x - V.ox, b.y - V.oy)) : d;
      if (dz < 1.5 * JOIN_ZONE * zr && (!N || d < Math.hypot(b.x - N.x, b.y - N.y))) { N = q; n0 = k; }
    }
    if (!N) return;
    // (nor a corner of a foot drawn level, nearer its line than the join: an A's leg into its slab, the slab's own
    // corner, under the crossbar's join)
    const near = Math.hypot(b.x - N.x, b.y - N.y);
    if (T.feet.some(F => Math.abs(b.y - F.line) < near && byFoot(F, b, Math.max(6, 0.02 * rig.ctx.cap), rig.ctx.cap))) return;
    // (nor a slab's root, a serif's top running near level from it, below the join's middle: a k's stem's foot under its
    // leg's join, a slab's deep wedge reaching nearer the join than the line)
    if (T.feet.some(F => (b.y - F.line) * F.dir < (N!.y - F.line) * F.dir && byFoot(F, b, Math.max(6, 0.02 * rig.ctx.cap), rig.ctx.cap) && (Math.abs(b.iny!) < ROOT_LEVEL || Math.abs(b.outy!) < ROOT_LEVEL))) return;
    const legs = T.legs.get(n0)!.map(l => {
      let k = 0;
      while (k + 1 < l.pts.length / 2 && Math.hypot(T.x[l.pts[k]] - N!.x, T.y[l.pts[k]] - N!.y) < 1.05 * N!.r) k++;
      const a = l.pts[Math.max(0, k - 2)], c = l.pts[Math.min(l.pts.length - 1, k + 2)], tx = T.x[c] - T.x[a], ty = T.y[c] - T.y[a], tl = Math.hypot(tx, ty) || 1;
      return { p: { x: T.x[l.pts[k]], y: T.y[l.pts[k]] }, t: { x: tx / tl, y: ty / tl }, pts: l.pts };
    });
    // (the strokes either side: the one each of its edges runs along, out from it)
    const along = (dx: number, dy: number, not?: (typeof legs)[number]) => {
      let best: (typeof legs)[number] | null = null, top = -Infinity;
      for (const g of legs) {
        if (g === not) continue;
        const ux = g.p.x - b.x, uy = g.p.y - b.y, ul = Math.hypot(ux, uy) || 1, sc = Math.abs(dx * g.t.x + dy * g.t.y) + 0.5 * (dx * ux + dy * uy) / ul;
        if (sc > top) { top = sc; best = g; }
      }
      return best;
    };
    const A = along(-b.inx!, -b.iny!), B = A && along(b.outx!, b.outy!, A);
    if (!A || !B) return;
    const sa = Math.sign(A.t.x * b.inx! + A.t.y * b.iny!) || 1, sb = Math.sign(B.t.x * b.outx! + B.t.y * b.outy!) || 1;
    crotches.set(i, { inx: A.t.x * sa, iny: A.t.y * sa, outx: B.t.x * sb, outy: B.t.y * sb, at: crossing(T, R, N, A.pts, B.pts, b, H) });
  });
  const iv: [number, number][] = [];
  const dotMid = bs[0]?.dot ? { x: bs.reduce((a, b) => a + b.x, 0) / bs.length, y: bs.reduce((a, b) => a + b.y, 0) / bs.length } : { x: 0, y: 0 };
  // (a dot made smaller about its middle, each point pinned there: moved in only along its way across, a dot with corners,
  // or a round one a little squared, its sides running on askew to the way to its middle, crossed itself at its corners,
  // and its ring came out a sliver or a pinwheel)
  const squareDot = !!bs[0]?.dot;
  const k0: number[] = [];
  // (whether a sample's inward normal runs the other way from the ink its ring's winding puts on that side: read where its
  // stroke is thinner than the probe, a serif's tip drawn to nothing, either way)
  const wind = Math.sign(signedArea(bs)) || 1, flipped = (b: Bone) => (-b.ty * b.nx + b.tx * b.ny) * wind < 0;
  // (and the samples, so read or reading nothing across, running out to a point the outline turns straight back at, a
  // serif's tip: pushed out to the hairline, one side crossed the other and the tip was cut off as a fold)
  const atTip = new Uint8Array(bs.length), nb = bs.length;
  bs.forEach((b, i) => {
    if (!b.corner || b.inx === undefined || b.inx * b.outx! + b.iny! * b.outy! > -TIP_TURN) return;
    atTip[i] = 1;
    for (const way of [-1, 1]) for (let k = 1; k < nb; k++) { const j = (((i + way * k) % nb) + nb) % nb, q = bs[j]; if (q.corner || !(flipped(q) || q.best < TIP_HAIR)) break; atTip[j] = 1; }
  });
  const plain = (b: Bone, i: number): number => {
    const kp = mv.keeps(b, r, i);
    // (a dot is made as much smaller about its middle as the stems are thinner, keeping its shape)
    if (b.dot) {
      const k = mv.weighs(b) * kp;
      k0.push(k);
      if (squareDot) pins.set(i, { x: dotMid.x + (b.x - dotMid.x) * k, y: dotMid.y + (b.y - dotMid.y) * k });
      return (k - 1) * Math.max(0, (dotMid.x - b.x) * b.nx + (dotMid.y - b.y) * b.ny);
    }
    if (crossEnd(b)) { k0.push(1); return 0; }
    // (a serif's edge, which the skeleton leaves out, by its own thickness, as its stroke would thin: as its round reads it
    // where that spans the serif, or as read across it where the round is cut short, by a slab's tip)
    if (b.serifDx) {
      const w = T.across[r][i] ? Math.min(b.best, b.w0) : b.w0, k = mv.weighs({ ...b, w }) * kp, d = (k - 1) * w;
      k0.push(k);
      return d > 0 ? Math.min(d, b.gap * OPEN) : d;
    }
    const jn = T.near[r][i];
    if (jn < 0) { const k = mv.weighs(b) * kp; k0.push(k); return (k - 1) * b.w; }
    // (a side, its round spanning its stroke, away from a join: in as far as a stroke as thick as its round thins, which
    // reads a stroke the skeleton leaves out (an f's or a t's bar, a stub too short for it) or runs by (where a b's stem
    // turns into the hairline at its foot, the skeleton cuts the corner along the hairline's middle) as well as any)
    const crotch = b.corner && concaveAt(b), joined = T.zone[jn].length > 0 || crotch;
    if (!b.corner && T.across[r][i] && !joined && (Math.hypot(b.ax - T.x[jn], b.ay - T.y[jn]) > Math.max(4, 0.5 * b.best) || b.best > 2 * T.s[jn] + 4)) {
      // (a fat face's side by a vertex, run in to it, as its stroke reads: its round, touching the line the vertex is cut
      // flat on, reads it thinner the nearer the line, a foot out off a W's leg at its point)
      const best = sideBest(b, jn);
      const k = mv.weighs({ ...b, w: best }) * kp, d = Math.max((k - 1) * best, Math.min(0, floor * kp - best));
      k0.push(k);
      return d > 0 ? Math.min(d, b.gap * OPEN) : d;
    }
    // (along the ray from the stroke's middle out through the sample: where the rounds round its middle, run together,
    // end; the ink nearest the sample on its way in: the end of the run of rounds the sample stands in, where a stroke
    // thickens, or else the last that ends short of it, not the run round the stroke's middle, which, where the sample's
    // middle lies far in, in a heavy join past a thin stroke, would leave the thin stroke on the wrong side of it; and on
    // past the stroke's middle where need be, as a sample by a stroke's square end reads its middle out in the corner)
    const t0 = Math.hypot(b.x - b.ax, b.y - b.ay);
    // (whether the strokes drawn again could stop a side going in by d short of it, ray's way below: only a round
    // reaching out along the ray past where the side would go, but starting short of where it stands, can; read near the
    // sample alone, as the whole ray, read only then, would read its stroke's middle and on past it too)
    const stops = (d: number) => {
      const dx = -b.nx, dy = -b.ny, past = (t0 + d + 4) / kp - 1, from = past - Rmost, to = t0 + 1 + Rmost, mid = (from + to) / 2;
      let any = false;
      inBand(grid, b.ax + dx * mid, b.ay + dy * mid, dx, dy, (to - from) / 2, Rmost, j => {
        if (any) return;
        const vx = T.x[j] - b.ax, vy = T.y[j] - b.ay, rr = R[j], along = vx * dx + vy * dy, off = vx * vx + vy * vy - along * along;
        if (off >= rr * rr) return;
        const h = Math.sqrt(rr * rr - off);
        if (along - h <= t0 + 1 && along + h > past) any = true;
      });
      return any;
    };
    const ray = () => {
      const dx = -b.nx, dy = -b.ny, reach = 2 * t0 + 2 * b.w0 + 40;
      iv.length = 0;
      // (the points no further off the line than the widest round, read cell by cell along it)
      inBand(grid, b.ax, b.ay, dx, dy, reach + Rmost, Rmost, j => {
        const vx = T.x[j] - b.ax, vy = T.y[j] - b.ay, rr = R[j];
        if (Math.abs(vx) > reach + rr || Math.abs(vy) > reach + rr) return;
        const along = vx * dx + vy * dy, off = vx * vx + vy * vy - along * along;
        if (off < rr * rr) { const h = Math.sqrt(rr * rr - off); iv.push([along - h, along + h]); }
      });
      iv.sort((p, q) => p[0] - q[0]);
      let e = -Infinity;
      for (let a = 0; a < iv.length;) {
        const lo = iv[a][0];
        let hi = iv[a][1], c = a + 1;
        for (; c < iv.length && iv[c][0] <= hi + 1; c++) hi = Math.max(hi, iv[c][1]);
        a = c;
        if (lo > t0) break;
        e = hi;
        if (hi >= t0) break;
      }
      // (no further in than across its own stroke: past that, the ray has missed the strokes drawn again)
      return t0 - e > 2 * T.s[jn] + 4 ? -Infinity : e;
    };
    const byRay = (e: number) => {
      e *= kp;
      k0.push(t0 > 0.5 ? e / t0 : 1);
      // (a crotch, the strokes thinning round it, never goes out into the paper: the rounds read a unit or two over it)
      return e > t0 ? (b.corner ? 0 : Math.min(e - t0, b.gap * OPEN)) : e - t0;
    };
    // (a sample whose round is stopped short by a corner or an end, or a corner, in as far as the stroke nearest its
    // middle thins: a side's sample by a square end goes in with the side, and an end's stays; but no further in than
    // the ink drawn again ahead of it, where that is much nearer: a sample by a bowl's thin top whose middle lies down in
    // the heavy side reads the heavy side's thinning)
    if (!joined || (!T.across[r][i] && !crotch)) {
      // (a font drawn with much contrast thins a stroke by how thick it is, a stroke a little thicker than its hairline
      // to its hairline: a side spanning its stroke reads that across itself, which the skeleton nearby, off along a
      // curve, reads thicker, an o's top a little off its thinnest)
      // (and none thinner than its hairline as the weight keeps it (family.ts), a finer one drawn as thick: an o's top,
      // where a lean would read it thinner still across its shoulder)
      // (but a serif's tip's not pushed out, atTip; and as far as the font reads as thinning its strokes so, thickShare,
      // this reading and the plain one mixed: read so all at once where its hairlines and stems first thinned apart, a
      // letter's every hairline's side moved at once)
      const side = () => {
        let d = R[jn] * kp - T.s[jn];
        if (d < -4 && stops(d)) { const e = ray(); if (e > -Infinity && t0 - e * kp < -d - 4) return byRay(e); }
        // (a wood type's curve, its sample out in a bulge past its stroke's round (a heavy arch's round shoulder), in as much
        // further as it stands out: the bulge made as much smaller as the stroke is thinner)
        if (rig.slabless && d < 0 && !b.corner && !b.straight && T.s[jn] > 0.5 && t0 > BULGE * T.s[jn]) d = (R[jn] * kp / T.s[jn] - 1) * t0;
        k0.push(T.s[jn] > 0.5 ? R[jn] * kp / T.s[jn] : 1);
        return d > 0 ? Math.min(d, b.gap * OPEN) : d;
      };
      if (!(byThick > 0 && T.across[r][i])) return side();
      const best = sideBest(b, jn);
      const k = mv.weighs({ ...b, w: best }) * kp, d = Math.max((k - 1) * best, atTip[i] ? Math.min(0, hairKept / 2 - best) : hairKept / 2 - best);
      const dT = d > 0 ? Math.min(d, b.gap * OPEN) : d;
      if (byThick >= 1) { k0.push(k); return dT; }
      const dS = side(), kS = k0.pop()!;
      k0.push(kS + (k - kS) * byThick);
      return dS + (dT - dS) * byThick;
    }
    const e = ray();
    if (e === -Infinity) { const d = R[jn] * kp - T.s[jn]; k0.push(T.s[jn] > 0.5 ? R[jn] * kp / T.s[jn] : 1); return d > 0 ? Math.min(d, b.gap * OPEN) : d; }
    return byRay(e);
  };
  // (a serif's foot drawn level: the stem as thick as it is now run down to the line, and each serif standing on the line
  // as thick as it is now (a contrasty font's no thicker than its hairline); the foot's edge in as far along it as to
  // them, or, never reaching them so, by as far as it lies off them; never out: its bracket with it, its edge on the line
  // staying there)
  const footed = new Uint8Array(bs.length);
  const delta = bs.map((b, i) => {
    // (a flag's stem side, past the stem's middle from the flag, the side of the slab it stood under, cut off there)
    const jf = T.near[r][i], ff = jf >= 0 && !b.dot ? T.footId[jf] : -1, F = ff >= 0 ? T.feet[ff] : null;
    const fid = F && (!crossEnd(b) || (F.side > 0 && (b.x - F.stem[0]) * (F.serifs[0].x1 - F.stem[0]) < 0)) ? ff : -1;
    // (a flag's edge along its line, out past its stem's side the other way from the flag, the top of the stem it stood
    // over: in to that side's corner, read off the join below it or not)
    const tol = Math.max(6, 0.02 * rig.ctx.cap);
    if (!b.dot && !crossEnd(b)) for (const G of T.feet) {
      if (!(G.side > 0) || Math.abs(b.y - G.line) > tol || b.ny * G.dir <= 0.7) continue;
      const way = -Math.sign(G.serifs[0].x1 - G.stem[0]), rs = G.stemJ >= 0 ? R[G.stemJ] * mv.keeps(b, r, i) : 0, x = G.stem[0] + way * rs;
      if ((b.x - x) * way > 0 && (b.x - G.stem[0]) * way <= G.side + tol) { pins.set(i, { x, y: b.y }); k0.push(1); return 0; }
    }
    // (or a serif's own straight edge out past its stem's side, whose middle reads nearer the stem's run above the foot
    // than the foot's (a slab's under an A's leg leaning out over it): its edge on the line, or the edge facing away from
    // it, in to it; not another stroke's side by it, which runs across the line, nor a ball's round)
    let G = fid >= 0 && byFoot(T.feet[fid], b, tol, rig.ctx.cap) ? T.feet[fid] : null;
    if (!G && b.straight && !b.dot && !crossEnd(b) && Math.abs(b.ny) > 0.7) G = T.feet.find(F => {
      const h = (b.y - F.line) * F.dir, rs = F.stemJ >= 0 ? R[F.stemJ] * mv.keeps(b, r, i) : 0;
      return (b.ny * F.dir > 0.7 ? Math.abs(h) <= tol : b.ny * F.dir < -0.7 && h > tol) && Math.abs(b.x - F.stem[0]) > rs + tol
        && F.serifs.some(S => (b.x - S.x0) * (b.x - S.x1) < 0) && byFoot(F, b, tol, rig.ctx.cap);
    }) ?? null;
    if (!G) return plain(b, i);
    const kp = mv.keeps(b, r, i), d = intoFoot(G, b, j => R[j] * kp, j => footRound(rig, mv, R[j]) * kp, Math.max(6, 0.02 * rig.ctx.cap), 0.3 * rig.ctx.cap);
    if (Number.isNaN(d)) return plain(b, i);
    // (but in a fat face a heavy stroke's side, not a serif's edge, facing off its line, that the foot, drawn as thick
    // as its stem, takes in, goes in as its stroke's side: its foot's serif is far thinner, and a K's leg's side above
    // its own little serif, left, stood out as a flag over the foot with a slit under it; not a hairline's, which a V's
    // point, drawn again, holds)
    // (still the foot's, out of its side's straight run: read into that run, an E's stem's side leaned with them)
    if (d === 0 && fat && !b.serifDx && Math.abs(b.ny) < FAT_SIDE_UP && T.s[jf] >= FAT_SIDE_HEAVY * rig.ref().stem) { const dp = plain(b, i); footed[i] = fid >= 0 ? 1 : 2; return dp; }
    feet.set(i, [d, intoFoot(G, b, j => R[j] * kp, j => footRound(rig, mv, R[j]) * kp, Math.max(6, 0.02 * rig.ctx.cap), 0.3 * rig.ctx.cap, true)]);
    k0.push(1);
    // (1 by its nearest of the skeleton, a foot's; 2 by a serif's own straight edge)
    footed[i] = fid >= 0 ? 1 : 2;
    return d;
  });
  // a straight edge is one stroke's side all along, and moves whole, by the most of its samples' moves (where a V's
  // hairline runs on into its foot, its edge there reads the heavy stroke beside it, which the hairline's side is not);
  // or it is a stroke's end, cut across it (most of it facing the way the stroke runs, and no longer than the stroke is
  // thick, give or take: a Z's heavy stroke cut off along the capitals' height under its top bar), which stays, so the
  // stroke stops at its line, and is carried with its corners as they meet the sides again (see moveRing)
  const bySeg = new Map<number, number[]>(), inRun = new Uint8Array(bs.length);
  // (the straight edges that stay as their stroke's ends, cut across them, for moveRing to carry with their corners)
  const cuts: number[][] = [];
  // (a serif's root cut square: a concave corner between a serif's straight edge and its stem's straight side)
  const squareRoot = (k: number) => {
    const q = bs[k], nb = bs.length, at = (d: number) => bs[(((k + d) % nb) + nb) % nb];
    if (!q.corner || !concaveAt(q)) return false;
    const straight = (sg: number) => { for (let d = 1; d <= 3; d++) if (at(sg * d).corner || !at(sg * d).straight) return false; return true; };
    const serif = (sg: number) => { for (let d = 1; d <= 3; d++) if (!at(sg * d).serifDx) return false; return true; };
    return straight(-1) && straight(1) && serif(-1) !== serif(1) && Math.abs(at(serif(-1) ? 2 : -2).nx) > 0.9;
  };
  const skEnds = thinSkeleton(rig).nodes.filter(q => q.edges.length === 1);
  const endLines = [0, rig.ctx.cap, ...(rig.ctx.lower ? [rig.ctx.xh, rig.ctx.asc, rig.ctx.desc] : [])];
  for (const { a, b } of rig.ends[r]) for (let i = a; i <= b; i++) inRun[((i % bs.length) + bs.length) % bs.length] = 1;
  // (but a serif's foot drawn level, standing on its line, moves as thinMoves read it point by point)
  const onFoot = (i: number) => { const j = T.near[r][i]; return footed[i] || (j >= 0 && (T.footDir[j] !== 0 || T.footStem[j] !== 0)); };
  bs.forEach((b, i) => { if (!b.corner && !crossEnd(b) && !b.dot && !b.serifDx && T.near[r][i] >= 0 && !onFoot(i)) { const l = bySeg.get(b.seg) ?? []; l.push(i); bySeg.set(b.seg, l); } });
  const mid = (v: number[]) => v.sort((p, q) => p - q)[v.length >> 1];
  const slabSegs = new Set(bs.filter(b => b.serifDx).map(b => b.seg));
  // (an edge a foot drawn level stands on, along its line, running on past the foot: an E's arm's top along the capitals'
  // height out past its corner's foot, which stays on its line with it)
  const footLine = new Map<number, number>();
  bs.forEach((b, i) => { if (footed[i] && b.straight && Math.abs(b.ny) > 0.9 && T.feet.some(F => Math.abs(b.y - F.line) < Math.max(6, 0.02 * rig.ctx.cap) && b.ny * F.dir > 0.9)) footLine.set(b.seg, b.y); });
  // (each straight side's line and move as read, for an edge in line with it past a join, below)
  const lineRuns: { A: Bone; B: Bone; len: number; nx: number; ny: number; m: number }[] = [];
  for (const is of bySeg.values()) {
    if (is.length < 3) continue;
    const A = bs[is[0]], B = bs[is[is.length - 1]], len = Math.hypot(B.x - A.x, B.y - A.y) + STEP;
    if (!A.straight && is.some(i => Math.abs((bs[i].x - A.x) * (B.y - A.y) - (bs[i].y - A.y) * (B.x - A.x)) / len > 1 + 0.005 * len)) continue;
    const sd = is.filter(i => T.across[r][i]);
    const fc = is.reduce((a, i) => { const j = T.near[r][i]; return a + Math.abs(bs[i].nx * T.tx[j] + bs[i].ny * T.ty[j]); }, 0) / is.length;
    if (sd.length < 3 || fc > 0.3) continue;
    lineRuns.push({ A, B, len, nx: A.nx, ny: A.ny, m: mid(sd.map(i => delta[i])) });
  }
  for (const is of bySeg.values()) {
    // (straight as drawn, or a curve that keeps within a unit or so of a line, as a sheet's straight edges may be drawn)
    const A = bs[is[0]], B = bs[is[is.length - 1]], len = Math.hypot(B.x - A.x, B.y - A.y) + STEP;
    if (is.length < 3 || (!A.straight && is.some(i => Math.abs((bs[i].x - A.x) * (B.y - A.y) - (bs[i].y - A.y) * (B.x - A.x)) / len > 1 + 0.005 * len))) continue;
    // (a vertex's cut on its line stays there, its corners going in with the strokes' sides: a fat face's w's point,
    // as wide as its heavy stroke)
    if (is.some(i => flatOn(rig, bs[i]))) {
      const xs = is.map(i => bs[i].x), lo = Math.min(...xs), hi = Math.max(...xs);
      if (T.vertices.some(V => Math.abs(A.y - V.line) < Math.max(6, 0.02 * rig.ctx.cap) && V.x > lo && V.x < hi)) { for (const i of is) delta[i] = 0; continue; }
    }
    const fl = footLine.get(A.seg);
    if (fl !== undefined && is.every(i => Math.abs(bs[i].y - fl) < 2.5)) { for (const i of is) delta[i] = 0; continue; }
    // (an end's samples read the ink running on in from them further than their rounds reach, the stroke running on away
    // from them; it is no longer than the stroke is thick, give or take, and turns into no crotch at either end: a side's
    // round reaches across its stroke, a stub's too, an f's bar's, and a stem's side above the arch it runs into, cut off
    // by its top, ends in the crotch)
    // (nor is it a stroke end the rig carries whole (rig.ends), whose sides' last samples must go in with their sides for
    // it: a rounded end's sides run straight a little way into it)
    const crotch = (i: number) => { const q = bs[(i + bs.length) % bs.length]; return q.corner && concaveAt(q); };
    // (one lying flat on a line no longer than the stroke it closes is thick, give or take: a stem's foot, cut square
    // on the baseline, where a slab serif's foot (its edge running on out under the serif) is a side of the slab)
    const flatEnd = !is.some(i => flatOn(rig, bs[i])) || (!slabSegs.has(bs[is[0]].seg) && len < 2 * FLAT_END * mid(is.map(i => T.s[T.near[r][i]])));
    // (and facing the way its stroke runs, within 60°: not a side by a stroke's end, which its rounds, stopped by the end,
    // read short of across too, a j's tail's inside)
    const facing = is.reduce((a, i) => { const j = T.near[r][i]; return a + Math.abs(bs[i].nx * T.tx[j] + bs[i].ny * T.ty[j]); }, 0) / is.length >= 0.5;
    // (and lies on a line, or level by one (within END_LEVEL, END_BAND of the capitals' height off it: a stem's top cut
    // under a Didone's flag), or by where the stroke's middle ends, within END_NEAR of its round, or is short, under
    // END_SHORT of that height (a blackletter's hairline's facet where it meets its stem, which, let go, cut it off):
    // a blackletter's diamond foot's facet, facing along the hairline it turns into, held as drawn, kept the foot as heavy
    // as the design's at Thin, a blot under each stem; a grotesque e's bar's cut past its bowl, a spur at Thin; that round
    // the end's own, not the stroke's where the edge reads it: a blackletter's c's chin, the heavy stroke turning into its
    // tail's hairline, reached the tail's tip by the heavy stroke's round, and was held, a blot under the c at Thin)
    const end = facing && flatEnd && !is.some(i => inRun[i]) && len < 3.6 * Math.max(...is.map(i => bs[i].best)) && is.filter(i => !T.across[r][i]).length * 2 > is.length && !crotch(is[0] - 1) && !crotch(is[is.length - 1] + 1) && (len < END_SHORT * rig.ctx.cap || is.some(i => flatOn(rig, bs[i])) || is.every(i => Math.abs(bs[i].ny) > END_LEVEL && endLines.some(L => Math.abs(bs[i].y - L) < END_BAND * rig.ctx.cap)) || is.some(i => { const j = T.near[r][i]; return j >= 0 && skEnds.some(q => Math.hypot(q.x - T.x[j], q.y - T.y[j]) <= END_NEAR * q.r + 10); }));
    // (a side moves by the samples whose rounds span its stroke, where it has any: those by its end read the stroke the
    // end runs into; but not one by a crotch, which stands in the rounds of the stroke across it, where another spans its
    // own: a Didone's d's stem's side under its bowl, its only other such sample reading the stem, stayed as drawn, the
    // stem's foot 58 units wider than the stem at Thin)
    const sides0 = is.filter(i => T.across[r][i]), byCrotch = (i: number) => crotch(i - 1) || crotch(i + 1);
    const sides = sides0.some(i => !byCrotch(i)) ? sides0.filter(i => !byCrotch(i)) : sides0;
    let m = end ? 0 : mid((sides.length ? sides : is).map(i => delta[i]));
    if (end) cuts.push(is);
    // (or, facing the way the stroke it reads runs, in line with a stroke's side past a join, as that side moves: a fat
    // face's b's stem's side under its bowl, down to its foot, read across the foot and moved as the foot thinned, a
    // tenth of the stem, kept the foot running on past the stem to where the bowl leaves it, a blot at Thin)
    if (!end && facing) {
      const off = (L: (typeof lineRuns)[number], q: Bone) => Math.abs((q.x - L.A.x) * L.nx + (q.y - L.A.y) * L.ny);
      const tol = Math.max(INLINE_NEAR, INLINE_SHARE * rig.ctx.cap);
      for (const L of lineRuns) if (L.A !== A && L.nx * A.nx + L.ny * A.ny > INLINE_COS && L.nx * B.nx + L.ny * B.ny > INLINE_COS && off(L, A) < tol && off(L, B) < tol && L.m < m - INLINE_MORE && L.len > len) m = L.m;
    }
    // (an edge flat on its line under a slab foot whose serifs leave their stem square, unbracketed, moves as the serifs'
    // part of it does, all of it, so the foot's foot stays flat: the part under the stem, moved as the stem's end, rose
    // over the line by more, a slab's H's by 9 units at Light, and put back on the line it pulled the serifs' tops
    // in over it down with it, each wedge serif's top bent into a wave)
    if (!end && slabSegs.has(A.seg) && is.some(i => flatOn(rig, bs[i])) && (() => { const xs = bs.filter(q => q.seg === A.seg).map(q => q.x), lo = Math.min(...xs), hi = Math.max(...xs); return bs.some((q, k) => squareRoot(k) && Math.abs(q.y - A.y) < SERIF_ZONE * rig.ctx.cap && q.x > lo && q.x < hi); })()) {
      const own = bs.flatMap((q, k) => (q.seg === A.seg && q.serifDx && !q.corner && flatOn(rig, q) ? [delta[k]] : []));
      if (own.length >= 3) { const v = mid(own); for (const i of is) delta[i] = v; continue; }
    }
    // (or, where its samples' moves run along it as a line, by that line, the edge kept straight: a wedge's side, a beak's
    // or a bar's tapering to its end, which moved by the middle of its moves stayed as thick at its root as its middle
    // thinned, a fat face's L's beak a dark wedge at Thin; the line read robustly, the middle of the slopes between
    // every two of its samples, kept within the moves they read, and taken only where its samples' moves lie well off
    // their middle, by more than STRAIGHT_TAPER, and within STRAIGHT_FIT of that off the line)
    const use = sides.length >= 3 ? sides : is;
    if (!end && use.length >= STRAIGHT_FEW && len >= STRAIGHT_LONG * mid(is.map(i => bs[i].best))) {
      const ux = (B.x - A.x) / len, uy = (B.y - A.y) / len, t = (i: number) => (bs[i].x - A.x) * ux + (bs[i].y - A.y) * uy;
      const slopes: number[] = [];
      for (let p = 0; p < use.length; p++) for (let q = p + 1; q < use.length; q++) { const dt = t(use[q]) - t(use[p]); if (Math.abs(dt) > 1) slopes.push((delta[use[q]] - delta[use[p]]) / dt); }
      const k = slopes.length ? mid(slopes) : 0, c = mid(use.map(i => delta[i] - k * t(i))), m0 = mid(use.map(i => delta[i]));
      const off0 = mid(use.map(i => Math.abs(delta[i] - m0))), off1 = mid(use.map(i => Math.abs(delta[i] - c - k * t(i))));
      if (off0 > STRAIGHT_TAPER && off1 < STRAIGHT_FIT * off0) {
        const lo = Math.min(...use.map(i => delta[i])), hi = Math.max(...use.map(i => delta[i]));
        for (const i of is) delta[i] = Math.max(lo, Math.min(hi, c + k * t(i)));
        continue;
      }
    }
    for (const i of is) delta[i] = m;
  }
  // (a short straight side running from a crotch into a longer one bent a little off it, an ink trap's (a slab's V's
  // inside steepening down into its crotch, an A's counter's slot up into its apex), onto the longer one's line as
  // moved: moved its own way, as far as it read its stroke there, thinner, it stood off that line into the counter, a
  // jog up each of a V's insides at Thin, ledges either side of an A's apex)
  {
    const crotchAt = (i: number) => { const q = bs[((i % bs.length) + bs.length) % bs.length]; return q.corner && concaveAt(q); };
    const runOf = new Map<Bone, (typeof lineRuns)[number]>();
    for (const L of lineRuns) { runOf.set(L.A, L); runOf.set(L.B, L); }
    for (const is of bySeg.values()) {
      if (is.length < 3) continue;
      const A = bs[is[0]], B = bs[is[is.length - 1]], len = Math.hypot(B.x - A.x, B.y - A.y) + STEP;
      // (from a crotch at one end, on into the longer side at the other within TRAP_NEAR samples, no corner between)
      for (const [c, o, way] of [[is[0] - 1, is[is.length - 1], 1], [is[is.length - 1] + 1, is[0], -1]] as const) {
        if (!crotchAt(c) && !crotchAt(c - way)) continue;
        // (a narrow crotch, the side across it facing back at this one, TRAP_FACING: not a bar's underside into its stem)
        // (past its corners, a crotch's cut a few samples across among them)
        const at = (i: number) => bs[((i % bs.length) + bs.length) % bs.length];
        let last = 0;
        for (let t = 0; t <= TRAP_NEAR + 1; t++) if (at(c - way * t).corner) last = t;
        const q = at(c - way * (last + 1));
        if (q.corner || q.nx * A.nx + q.ny * A.ny > -TRAP_FACING) continue;
        let L: (typeof lineRuns)[number] | undefined;
        for (let k = 1; k <= TRAP_NEAR && !L; k++) { const q = bs[((o + way * k) % bs.length + bs.length) % bs.length]; if (q.corner) break; const R = runOf.get(q); if (R && R.A !== A && R.B !== B) L = R; }
        if (!L || L.len < TRAP_LONG * len) continue;
        // (its line as drawn end to end, its normal facing as its samples do)
        const lx = (L.B.x - L.A.x) / L.len, ly = (L.B.y - L.A.y) / L.len, sg = Math.sign(-ly * L.nx + lx * L.ny) || 1, nx = -ly * sg, ny = lx * sg;
        const cos = nx * A.nx + ny * A.ny;
        if (!(cos > TRAP_BEND)) continue;
        const to = is.map(i => { const q = bs[i], dn = q.nx * nx + q.ny * ny; return ((q.x - L!.A.x) * nx + (q.y - L!.A.y) * ny + L!.m) / dn; });
        // (only in, and no further than its stroke reads thick)
        if (to.some((t, k) => !(t < 0.5) || -t > 2 * bs[is[k]].best)) continue;
        is.forEach((i, k) => { delta[i] = to[k]; });
        break;
      }
    }
  }
  // (a cut across a stroke, which stays, in line with a straight side past a crotch it ends in, moves as that side does:
  // a slab's n's head cut off over its stem's side, the stem's side above the arch leaving it, stayed where the stem
  // stood, and the crotch between the two, met again, ran in a spike into the thinner stem at Light)
  {
    const caps = new Map<number, number[]>();
    bs.forEach((b, i) => { if (!b.corner && crossEnd(b) && !b.dot && !footed[i] && !pins.has(i)) { const l = caps.get(b.seg) ?? []; l.push(i); caps.set(b.seg, l); } });
    const crotchAt = (i: number) => { const q = bs[(i + bs.length) % bs.length]; return q.corner && concaveAt(q); };
    const off = (L: (typeof lineRuns)[number], q: Bone) => Math.abs((q.x - L.A.x) * L.nx + (q.y - L.A.y) * L.ny);
    const tol = Math.max(INLINE_NEAR, INLINE_SHARE * rig.ctx.cap);
    for (const is of caps.values()) {
      if (is.length < 3 || !(crotchAt(is[0] - 1) || crotchAt(is[is.length - 1] + 1))) continue;
      const A = bs[is[0]], B = bs[is[is.length - 1]], len = Math.hypot(B.x - A.x, B.y - A.y) + STEP;
      let best: (typeof lineRuns)[number] | null = null;
      for (const L of lineRuns) if (L.nx * A.nx + L.ny * A.ny > INLINE_COS && L.nx * B.nx + L.ny * B.ny > INLINE_COS && off(L, A) < tol && off(L, B) < tol && L.len > len && L.m < 0 && (!best || L.len > best.len)) best = L;
      if (best) for (const i of is) delta[i] = best.m;
    }
  }
  // a font drawn with much contrast keeps its hairline as the weight keeps it (family.ts) all round: no side spanning its
  // stroke goes in past where the stroke would be thinner, however it read its move (an o's top, read off its curve);
  // but a serif drawn level on its line (withFeet), already no thicker than its hairline (footRound), which this read
  // off the serif's middle as it was, before it was drawn level: an A's leaning leg's inner serif kept 28 units thick at
  // Thin, a dark wedge under the leg
  if (byThick > 0) bs.forEach((b, i) => { if (!b.corner && !b.dot && !b.serifDx && T.across[r][i] && !crossEnd(b) && (footed[i] !== 1 || T.footStem[T.near[r][i]] !== 0)) delta[i] += (Math.max(delta[i], Math.min(0, hairKept / 2 - sideBest(b, T.near[r][i]))) - delta[i]) * byThick; });
  // (an edge lying on a line goes no further out past it: a stem's middle run on to the line under a serif's head or
  // foot (withFeet), its round there as thick as the stem is now, read the edge over the stem out past it, a fat face's
  // D's top over its stem 15 units over the capitals' height, which the heights then took for the letter's top and
  // lowered the whole letter by, its serifs put back on the line alone; a Didone's heads and feet a bump over each stem)
  // a stroke's end reaching out past its middle's end further than its round (by more than CAP_PAST of it: a
  // blackletter's foot, its stem cut off aslant and flicked out past where its middle ends) whose samples, moved as they
  // read, fold over each other, is made as much smaller about that end as its stroke is thinner, out past it: its
  // samples all read the end's round, and moved in by as much along their own ways across, those of a flick thinner than
  // the round crossed each other and the foot drew a blot, as heavy at Thin as the design's, Cathedral's a's; the end's
  // samples (those reading its round, within CAP_TIP of it) and, along its outline from them, those reading the stroke
  // within its round of the end, out past it along its middle; only in a font without serifs, an end going down to its
  // line, and folding: of its samples' moved steps, more than CAP_FOLD turned back on the way they ran, each counted as
  // far as it turns back, wholly from CAP_TURN of the step back on itself, and as much less as it is shorter than
  // CAP_SHORT of itself as drawn (by its way alone, a step shrinking to nothing turned back all at once, Cathedral's n's
  // foot came and went at a step at Weight 0.155 and 0.285, 6 and 7 units of room), and wholly made smaller from CAP_EASE
  // more
  // (every such end made smaller, a sans' 9's and Q's tails and a V's point in a font with serifs moved too; and made
  // smaller at once at its share, Cathedral's n's foot came and went at a step, its room 22 units)
  if (!rig.serifed()) for (const q of skEnds) {
    if (q.y - q.r > END_BAND * rig.ctx.cap) continue;
    const within = (f: number) => new Set(bs.flatMap((b, i) => { const j = T.near[r][i]; return j >= 0 && !b.dot && Math.hypot(T.x[j] - q.x, T.y[j] - q.y) <= Math.max(4, f * q.r) ? [i] : []; }));
    const tip = [...within(CAP_TIP)];
    if (tip.length < 3) continue;
    const j = T.near[r][tip[0]];
    if (Math.max(...tip.map(i => Math.hypot(bs[i].x - q.x, bs[i].y - q.y))) <= CAP_PAST * T.s[j]) continue;
    const near = within(1), cap = new Set(tip);
    for (const t of tip) for (const way of [-1, 1]) for (let k = 1; k < nb; k++) { const i = (((t + way * k) % nb) + nb) % nb; if (!near.has(i) || cap.has(i)) break; cap.add(i); }
    const cx = tip.reduce((a, i) => a + bs[i].x - q.x, 0), cy = tip.reduce((a, i) => a + bs[i].y - q.y, 0), sg = Math.sign(cx * T.tx[j] + cy * T.ty[j]) || 1;
    if (cy >= 0 || [...cap].some(i => { const jj = T.near[r][i]; return bs[i].serifDx || footed[i] || T.footDir[jj] !== 0 || T.footStem[jj] !== 0; })) continue;
    // (folding: of each two samples next to each other in it, the step between them as moved running back on the step
    // as drawn)
    const at = (i: number) => ({ x: bs[i].x - bs[i].nx * delta[i], y: bs[i].y - bs[i].ny * delta[i] });
    let all = 0, back = 0;
    for (const i of cap) { const k = (i + 1) % nb; if (!cap.has(k)) continue; const a0 = at(i), a1 = at(k), dx = bs[k].x - bs[i].x, dy = bs[k].y - bs[i].y, mx = a1.x - a0.x, my = a1.y - a0.y, ld = Math.hypot(dx, dy), lm = Math.hypot(mx, my); all++; if (ld && lm) back += Math.max(0, Math.min(1, -(mx * dx + my * dy) / (ld * lm) / CAP_TURN)) * Math.min(1, lm / (CAP_SHORT * ld)); }
    const fold = all ? back / all : 0, w = Math.max(0, Math.min(1, (fold - CAP_FOLD) / CAP_EASE));
    if (w <= 0) continue;
    for (const i of cap) {
      const b = bs[i], jj = T.near[r][i], k = R[jj] / Math.max(1, T.s[jj]);
      if ((b.x - q.x) * T.tx[j] * sg + (b.y - q.y) * T.ty[j] * sg > 0) { const m = at(i); pins.set(i, { x: m.x + (q.x + (b.x - q.x) * k - m.x) * w, y: m.y + (q.y + (b.y - q.y) * k - m.y) * w }); }
    }
  }
  const onLines = [0, rig.ctx.cap, ...(rig.ctx.lower ? [rig.ctx.xh, rig.ctx.asc, rig.ctx.desc] : [])];
  bs.forEach((b, i) => { if (delta[i] > 0 && !b.dot && onLines.some(L => Math.abs(b.y - L) < ON_LINE && (L === 0 || L === rig.ctx.desc ? b.ny > 0.9 : b.ny < -0.9))) delta[i] = 0; });
  // and each side goes up or down with its stroke's middle as a round is kept on its line (movedHug): across its edge,
  // as far as the edge faces that way (a stem's side not at all); not an edge level on its line, which stays there
  // (and how far each so goes, across its edge and up or down, for moveRing to meet a corner's edges again without it and
  // carry the corner up or down as far: two edges meeting at a point, nearly alike, met again as their average, left a
  // point lifted less than its edges, a speed line's tip hooked)
  const hug = H ? new Float64Array(bs.length) : null, hugY = H ? new Float64Array(bs.length) : null;
  // (nor any by an edge level on its line, a stem's foot's round corners, which stay with it: carried down, a spur)
  const onLineAt = (k: number) => bs[((k % nb) + nb) % nb].onLine, byLine = (i: number) => { for (let k = -HUG_BY; k <= HUG_BY; k++) if (onLineAt(i + k)) return true; return false; };
  if (H) bs.forEach((b, i) => {
    const j = T.near[r][i];
    if (j < 0 || b.dot || b.onLine || footed[i] || pins.has(i) || byLine(i)) return;
    hugY![i] = H[j];
    if (!b.corner) { hug![i] = -H[j] * b.ny; delta[i] += hug![i]; }
  });
  // (and each foot's sample's move as read to a hair, not by the unit: a serif's bracket drawn again as far as its stem
  // thinned (carryFillets), read by the unit, came in in steps)
  const fine = delta.map((d, i) => { const f = feet.get(i); return f && f[0] === d ? f[1] : d; });
  return { k0, delta, crotches, pins, footed, hug, hugY, fine, cuts };
}

/** The rig as moveRig tries it a last time: its lighter weight's skeleton keeping its strokes that end round (prune's
    `round`), or null where that keeps none more. */
function roundRig(rig: SkinRig): SkinRig | null {
  if (rig.round !== undefined) return rig.round;
  const base = withStubs(rig, skeleton(rig.contours, THIN_CELL, true, true, true)), sk = rig.feet ? withFeet(rig, base, rig.feet) : base;
  return (rig.round = sameNodes(sk, thinSkeleton(rig)) ? null : { ...rig, thinSk: sk, thin: undefined, round: null, footed: null });
}

/** The rig as the lighter weights move it: its lighter weight's skeleton with its serifs' feet drawn level (withFeet),
    those no thicker than `most` of their stems' rounds, or null where that draws none. */
function footRig(rig: SkinRig, most: number): SkinRig | null {
  const kept = most === FOOT_SLAB ? rig.slabbed : rig.footed;
  if (kept !== undefined) return kept;
  const sk = withFeet(rig, plainSkeleton(rig), most), made = sameNodes(sk, plainSkeleton(rig)) ? null : { ...rig, thinSk: sk, thin: undefined, round: undefined, footed: null, slabbed: null, feet: most };
  if (most === FOOT_SLAB) rig.slabbed = made; else rig.footed = made;
  return made;
}

/** Whether two skeletons have their nodes in the same places. */
const sameNodes = (a: Skeleton, b: Skeleton) => { const at = (k: Skeleton) => k.nodes.map(n => `${Math.round(n.x)} ${Math.round(n.y)}`).sort().join(); return at(a) === at(b); };

/** A lighter weight's joins drawn again from its skeleton: within JOIN_REACH of each join's distance to the paper (but
    round a stroke's end near it, an r's ear, a serif, which stands as moved), the letter's ink is its strokes drawn
    again there (thinStrokes, its stems run straight through), not its outline moved, whose corners there, met again as
    the strokes thin, go astray (a crotch run up a stem, a ledge where a bowl's edge meets it, a blob in a K's crotch).
    Its rings where the move puts them, with which of them are its dots, which stay as they are; `joinsAs`, each join
    eased in (below), drawn again whole, or none drawn again; and whether any was being eased in. */
function rebuildJoins(rig: SkinRig, mv: MoveMap, lift: (y: number) => number, rings: P[][], dots: boolean[], joinsAs: 'eased' | 'full' | 'none' = 'eased'): { rings: P[][]; dots: boolean[]; eased: boolean } {
  // (each node where the move puts it, a round kept on its line with it, movedHug)
  const sk = thinSkeleton(rig), H = movedHug(rig, mv), firsts = sk.edges.map((_, e) => sk.edges.slice(0, e).reduce((a, E) => a + E.pts.length, 0));
  const hugOf = (n: SkNode) => { if (!H) return 0; const ni = sk.nodes.indexOf(n), e = n.edges[0], E = sk.edges[e]; return ni >= 0 && E?.pts.length ? H[firsts[e] + (E.a === ni ? 0 : E.pts.length - 1)] : 0; };
  const at = (p: P) => ({ x: mv.gx(p.x), y: lift(mv.gy(p.y)) }), atN = (n: SkNode) => ({ x: mv.gx(n.x), y: lift(mv.gy(n.y + hugOf(n))) });
  // (only joins whose strokes thin to under REBUILD_BELOW of themselves, which the moves leave astray; and none a serif
  // stands on, whose brackets the strokes drawn again would lose)
  const serifs = rig.bones.flat().filter(b => b.serifDx);
  // (each drawn again over a round growing from nothing as its strokes thin from REBUILD_BELOW, to its full reach
  // SWITCH_BLEND further on: while it lies within the ink it changes nothing, then the strokes drawn again take more of its
  // outline as they thin: drawn again all at once, a join came out other than it was, at a jump)
  const weigh = (n: SkPt) => mv.weighs({ tx: 0, ty: 1, w: n.r, serifDx: 0, dot: false } as Bone);
  // (nor, in a font standing on serifs, where a hairline meets a heavy stroke, one a short stroke runs from out to an end standing on a line, or near it, its
  // ink running on to it: a serif's corner the skeleton reads as a stroke of its own, a fat face's Z's foot, whose strokes
  // drawn again ran out into the corner, off the bar, a notch cut in it; a vertex cut flat on its line, a Didone's W's, its
  // ink below the end's round cut off by the round drawn again; not one running along the line, a t's bar's end, nor a
  // sans font's stem's end over its arch, an n's, drawn again as before)
  const c = rig.ctx, lines = [0, c.cap, ...(c.lower ? [c.xh, c.asc, c.desc] : [])], tol = Math.max(6, 0.02 * c.cap);
  const serifed = rig.serifed(), onLine = (n: SkNode) => {
    const bs = branches(sk, sk.nodes.indexOf(n));
    // (and only where a hairline meets a heavy stroke, REBUILD_HAIR: a book face's 4's apex, 2.5, is drawn again well)
    const hair = Math.min(...bs.map(br => { const E = sk.edges[br.e], pts = br.end === 'a' ? E.pts : E.pts.slice().reverse(); return (pts.find(q => Math.hypot(q.x - n.x, q.y - n.y) >= 2 * n.r) ?? pts[pts.length - 1]).r; }));
    return serifed && n.r > REBUILD_HAIR * hair && bs.some(br => {
      const E = sk.edges[br.e], T = sk.nodes[br.end === 'a' ? E.b : E.a];
      if (!(T.edges.length === 1 && E.len < REBUILD_TIP * n.r && Math.abs(T.y - n.y) > 0.4 * Math.hypot(T.x - n.x, T.y - n.y))) return false;
      if (!lines.some(L => Math.abs(T.y - L) - T.r > -tol && Math.abs(T.y - L) - T.r < Math.max(tol, T.r))) return false;
      // (not a stroke's own end, run on straight through the join from the other side: a t's stem over its bar)
      const u = leaving(sk, br, n.r);
      return !bs.some(o => { if (o === br) return false; const v = leaving(sk, o, 2 * n.r); return -(u.x * v.x + u.y * v.y) > REBUILD_THROUGH; });
    });
  };
  // (nor one whose crotches moveRing drew again along its stem, an arch's or a bowl's, ARCHED: drawn again, the skeleton's
  // middles, bending round in the join, cut the arch off its stem)
  const arched = ARCHED.get(mv);
  const near = sk.nodes.filter((n, ni) => n.edges.length >= 3 && weigh(n) < REBUILD_BELOW && !serifs.some(b => Math.hypot(b.x - n.x, b.y - n.y) < n.r * JOIN_REACH) && !onLine(n) && !arched?.has(ni));
  const t = (n: SkPt) => (joinsAs === 'full' ? 1 : Math.min(1, (REBUILD_BELOW - weigh(n)) / SWITCH_BLEND)), eased = near.some(n => t(n) < 1);
  // (a vertex cut on its line, its tip drawn on its join, further, VERTEX_REACH: its strokes, run in to a point by its cut
  // (thinStrokes), bend in from two rounds out, and its sides there, moved as drawn, stood out past them in a notch
  // either side, a slab's M's middle, its w's)
  const reach = (n: SkNode) => (sk.edges.some(E => vertexTip(sk, E) && Math.hypot(E.pts[0].x - n.x, E.pts[0].y - n.y) < 1) ? VERTEX_REACH : JOIN_REACH);
  const joins = near.map(n => ({ ...atN(n), r: n.r * reach(n) * t(n) }));
  if (!joins.length || joinsAs === 'none') return { rings, dots, eased };
  const round = (c: { x: number; y: number; r: number }): P[] => Array.from({ length: 32 }, (_, k) => ({ x: c.x + Math.cos(k * Math.PI / 16) * c.r, y: c.y + Math.sin(k * Math.PI / 16) * c.r }));
  // (each stroke's end from a little short of its skeleton's end on out, the way the stroke runs: no further back, where
  // a short stroke's end would take in the join it leaves)
  const ends = sk.nodes.flatMap((n, ni) => {
    if (n.edges.length !== 1) return [];
    const E = sk.edges[n.edges[0]], pts = E.a === ni ? E.pts.slice().reverse() : E.pts, q = pts[Math.max(0, pts.length - 5)];
    // (but a vertex's tip drawn on its join (withFeet), which its strokes run in to a point by its line (thinStrokes))
    if (vertexTip(sk, E)) return [];
    const l = Math.hypot(n.x - q.x, n.y - q.y) || 1, ux = (n.x - q.x) / l, uy = (n.y - q.y) / l, R = n.r * 1.25 + 2, c = atN(n);
    // (the round's arc as far round as the line across a third of the round back, and that line)
    const half = Math.acos(Math.max(-1, -n.r * 0.3 / R)), a0 = Math.atan2(uy, ux);
    return [Array.from({ length: 25 }, (_, k) => { const a = a0 - half + (2 * half * k) / 24; return { x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R }; })];
  });
  // (each wound anticlockwise, so they add; only those reaching a join)
  const ccw = (r: P[]) => (signedArea(r) < 0 ? r.slice().reverse() : r);
  const strokes = (by: (R: number) => number) => shape(thinStrokes(rig, mv, by, undefined, 0, true).map(r => ccw(r.map(at))).filter(r => r.some(p => joins.some(j => Math.hypot(p.x - j.x, p.y - j.y) < j.r + 5))), true);
  const ink = rings.filter((_, i) => !dots[i]), wound = ink.reduce((a, r) => a + signedArea(r), 0) > 0 ? ink : ink.map(r => r.slice().reverse());
  // (and only where the letter had ink, carried where the move puts it: a lighter weight's strokes keep within it, where
  // a round on a stroke drawn again to a corner of the letter would stand out past it, below a b's foot; and across paper
  // narrower than its skeleton reads (narrowPaper), which runs the strokes on over it: a script p's bowl's hairline, up
  // beside its stem a hair off it, the strokes drawn again from the stem cut off it there, its counter open to the paper)
  const was = shape([...letterInk(rig, mv).polys, ...narrowPaper(rig).map(r => r.map(q => ({ x: mv.gx(q.x), y: mv.gy(q.y) })))]);
  // (the moved outline stands where it keeps within JOIN_GIVE of the strokes drawn again, so a join that came out well
  // runs on into the strokes beside it unbroken; past that, the strokes' own edges)
  const M = shape(wound, true), C0 = strokes(R => Math.max(1, R * (1 - JOIN_GIVE) - 1)), C1 = strokes(R => R * (1 + JOIN_GIVE) + 1);
  const D = shape(joins.map(round), true), E = shape(ends.map(r => (signedArea(r) < 0 ? r.slice().reverse() : r)), true);
  const kept: P[][] = combine([M, C0, C1, D, E, was], (x, y) => (D.has(x, y) && !E.has(x, y) ? (C0.has(x, y) || (M.has(x, y) && C1.has(x, y))) && was.has(x, y) : M.has(x, y)));
  const dotRings = rings.filter((_, i) => dots[i]);
  return { rings: [...kept, ...dotRings], dots: [...kept.map(() => false), ...dotRings.map(() => true)], eased };
}

/** How far from p the way (ux, uy) the outline rings first cross (Infinity where they don't). */
function rayOut(rings: P[][], p: P, ux: number, uy: number) {
  let best = Infinity;
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], sx = b.x - a.x, sy = b.y - a.y, den = ux * sy - uy * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den, w = ((a.x - p.x) * uy - (a.y - p.y) * ux) / den;
    if (t > 0.5 && w >= 0 && w <= 1 && t < best) best = t;
  }
  return best;
}

/** The letter's ink as drawn, where a move puts it (its width and heights, mv), not lifted back to its lines as its
    outline moved is (keepHeights): what a lighter weight's strokes drawn again keep within. */
function letterInk(rig: SkinRig, mv: MoveMap, hy = (y: number) => y) {
  return shape(rig.contours.map(c => c.flatMap((n, i) => Array.from({ length: 6 }, (_, k) => { const q = bez(n, c[(i + 1) % c.length], k / 6); return { x: mv.gx(q.x), y: mv.gy(hy(q.y)) }; }))));
}

/** The letter's paper narrower than its skeleton reads (THIN_CELL) between two edges of one outline facing each other
    across it, all the way round from one to the other (a notch, a slit, a narrow crotch, to its tip; not a gap between
    two strokes all but meeting, a script H's bar's end and its stem, the paper beyond it a counter drawn closed), as
    strips across it wound as its ink, each side half a unit into the ink (edges on the outline's own confuse combine);
    kept on the rig. */
function narrowPaper(rig: SkinRig): P[][] {
  const kept = NARROWS.get(rig);
  if (kept) return kept;
  const fine = rig.contours.map(c => c.flatMap((n, i) => Array.from({ length: 16 }, (_, k) => bez(n, c[(i + 1) % c.length], k / 16))));
  const S = shape(fine), sign = Math.sign(fine.reduce((a, r) => (Math.abs(signedArea(r)) > Math.abs(a) ? signedArea(r) : a), 0));
  // (each outline every unit along it, with how far along it each point lies, and its edges by where they are)
  const rings = fine.map(r => r.flatMap((a, i) => { const b = r[(i + 1) % r.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y))); return Array.from({ length: n }, (_, k) => ({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n })); }));
  const along = rings.map(r => r.reduce((s, q, i) => (s.push(i ? s[i - 1] + Math.hypot(q.x - r[i - 1].x, q.y - r[i - 1].y) : 0), s), [] as number[]));
  const round = rings.map((r, k) => (r.length ? along[k][r.length - 1] + Math.hypot(r[0].x - r[r.length - 1].x, r[0].y - r[r.length - 1].y) : 0));
  const cell = 4 * THIN_CELL, at = (x: number, y: number) => `${Math.floor(x / cell)} ${Math.floor(y / cell)}`, near = new Map<string, [number, number][]>();
  rings.forEach((r, k) => r.forEach((q, j) => { const c = `${k} ${at(q.x, q.y)}`; if (!near.has(c)) near.set(c, []); near.get(c)!.push([k, j]); }));
  const out: P[][] = [];
  rings.forEach((r, k) => {
    // (each point's nearest across paper on its outline, within THIN_CELL, further round it than the two are apart: not
    // its neighbours round a turn)
    const facing = r.map((a, i) => {
      let best: { b: P; j: number } | null = null, bd = THIN_CELL;
      const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) for (const [, j] of near.get(`${k} ${gx} ${gy}`) ?? []) {
        const u = r[j], v = r[(j + 1) % r.length], dx = v.x - u.x, dy = v.y - u.y, l = dx * dx + dy * dy, f = l ? Math.max(0, Math.min(1, ((a.x - u.x) * dx + (a.y - u.y) * dy) / l)) : 0;
        const b = { x: u.x + dx * f, y: u.y + dy * f }, d = Math.hypot(b.x - a.x, b.y - a.y);
        if (!(d < bd && d > 0.05)) continue;
        const s = Math.abs(along[k][i] - along[k][j] - f * Math.sqrt(l));
        if (Math.min(s, round[k] - s) < 2 * d + 1) continue;
        if ([0.25, 0.5, 0.75].some(t => S.has(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t))) continue;
        bd = d; best = { b, j };
      }
      return best;
    });
    // (and the outline narrow so all the way round between the two, the shorter way, but for a few points at a tip)
    const none = facing.reduce((s, q, i) => (s.push((i ? s[i - 1] : 0) + (q ? 0 : 1)), s), [] as number[]), n = r.length;
    const gaps = (i: number, j: number) => (i <= j ? none[j] - (i ? none[i - 1] : 0) : none[n - 1] - none[i - 1] + none[j]);
    const across = facing.map((q, i) => { if (!q) return null; const [lo, hi] = (q.j - i + n) % n <= n / 2 ? [i, q.j] : [q.j, i]; return gaps(lo, hi) <= NARROW_TIP ? q.b : null; });
    // (a strip along each run of points with paper so across)
    const start = across.findIndex((b, i) => b && !across[(i - 1 + r.length) % r.length]);
    if (start < 0) return;
    const into = (a: P, b: P) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: a.x - (b.x - a.x) / l * 0.5, y: a.y - (b.y - a.y) / l * 0.5 }; };
    for (let s = 0, i = start; s < r.length; ) {
      const run: number[] = [];
      while (across[i] && s < r.length) { run.push(i); i = (i + 1) % r.length; s++; }
      if (!run.length) { i = (i + 1) % r.length; s++; continue; }
      if (run.length < 2) continue;
      const q = [...run.map(j => into(r[j], across[j]!)), ...run.slice().reverse().map(j => into(across[j]!, r[j]))];
      out.push(Math.sign(signedArea(q)) === sign ? q : q.reverse());
    }
  });
  NARROWS.set(rig, out);
  return out;
}
const NARROWS = new WeakMap<SkinRig, P[][]>(), NARROW_TIP = 3;

/** A lighter weight's letter drawn again from its skeleton (thinReads, its stems run straight through its joins): each
    stroke along its middle, as thick as `by` makes it of what it is now (as thinMoves draws it again), and a round at
    each of its ends, as outlines, before the move puts them where it does. By default a little narrower, for moveRig to
    mend a letter the moves broke, filling the break but leaving its edges, which the skeleton's unevenness would roughen,
    where the moves put them, in a font with serifs no stub into a corner. `drawn`, the letter drawn as its strokes
    alone: its joins' rounds no thicker than the thinnest stroke there (but a stroke running on through); and 2, a
    letter read along its straight strokes (linedRig), its ends cut as the design's are and its corners as the design's
    too. */
function thinStrokes(rig: SkinRig, mv: MoveMap, by = mendBy, ahead = (p: P, ux: number, uy: number) => inkAhead(rig, p, ux, uy), drawn: 0 | 1 | 2 = 0, moved = false): P[][] {
  rig.thin ??= thinReads(rig);
  const sk = thinSkeleton(rig), out: P[][] = [];
  const lined = drawn === 2, hugged = moved && !!movedHug(rig, mv);
  // (where `drawn`, finer, and round the circle rather than in it: a stroke's end, as wide as the circle, would stand out
  // of the chords between its points as a hair)
  const round = (c: P, r: number): P[] => (drawn ? Array.from({ length: 32 }, (_, k) => ({ x: c.x + Math.cos(k * Math.PI / 16) * r / Math.cos(Math.PI / 32), y: c.y + Math.sin(k * Math.PI / 16) * r / Math.cos(Math.PI / 32) })) : Array.from({ length: 16 }, (_, k) => ({ x: c.x + Math.cos(k * Math.PI / 8) * r, y: c.y + Math.sin(k * Math.PI / 8) * r })));
  // (where `drawn`, the round where strokes join no thicker than the thinnest of them, a bar's, thicker than the stem it
  // meets, would stand out either side of the stem; but as thick as a stroke running on through the join, the thinner
  // of its two sides, which, ending square there, would leave a notch either side)
  // (and so, moved, where the uprights thin apart from the bars (Verticals 0, MoveMap.apart): a typewriter's h's arch, as
  // thick as before, its round drawn again where it joins the hairline stem, stood out past the stem's other side, a
  // bead at every join of a bowl or an arch with its stem)
  const atJoin = new Map<number, number>();
  if (drawn || (moved && mv.apart > 0)) {
    const legs = new Map<number, { R: number; x: number; y: number }[]>();
    let j = 0;
    for (const E of sk.edges) {
      const n = E.pts.length;
      if (n) for (const [node, k, d] of [[E.a, j, 1], [E.b, j + n - 1, -1]] as const) if (sk.nodes[node].edges.length > 1) {
        const q = E.pts[d > 0 ? Math.min(n - 1, 4) : Math.max(0, n - 5)], o = sk.nodes[node], l = Math.hypot(q.x - o.x, q.y - o.y) || 1;
        legs.set(node, [...(legs.get(node) ?? []), { R: by(thinMiddle(rig, mv, k).R), x: (q.x - o.x) / l, y: (q.y - o.y) / l }]);
      }
      j += n;
    }
    for (const [node, ls] of legs) {
      let r = Math.min(...ls.map(l => l.R));
      for (const a of ls) for (const b of ls) if (a !== b && a.x * b.x + a.y * b.y < -Math.cos(Math.PI / 6)) r = Math.max(r, Math.min(a.R, b.R));
      atJoin.set(node, r);
    }
  }
  // (and, drawn on the ink's middle, or on the letter's skeleton in a font with serifs, no stub running from a join into
  // the corner its other strokes turn round, shorter than the join's round and running on none of them: the corner's
  // ink, drawn as a stroke, a round as wide as the corner, or, its free end run on to the ink, a spur out into the
  // corner, a typewriter's z's and 7's tops, its W's middle peak, the joins drawn again over them at Thin. A skeleton
  // read along straight strokes has none: a short stroke there is one, a squat Y's stem)
  const stub = (E: (typeof sk.edges)[number]) => {
    if (drawn === 2) return false;
    const [t, j] = sk.nodes[E.a].edges.length === 1 ? [E.a, E.b] : [E.b, E.a], J = sk.nodes[j];
    if (sk.nodes[t].edges.length !== 1 || J.edges.length < 3 || E.len > 0.9 * J.r) return false;
    const T = sk.nodes[t], ux = T.x - J.x, uy = T.y - J.y, ul = Math.hypot(ux, uy) || 1;
    // (drawn on the letter's skeleton, only in a font with serifs, and only into the outside of the turn two longer
    // strokes make, its way out from between them: a casual M's top's tip, a stub too, left off, came apart)
    if (drawn === 0) {
      if (!rig.serifed()) return false;
      const os = branches(sk, j).filter(br => sk.edges[br.e] !== E && sk.edges[br.e].len > 2 * J.r).map(br => leaving(sk, br, J.r));
      if (os.length !== 2) return false;
      const bx = -(os[0].x + os[1].x), by = -(os[0].y + os[1].y), bl = Math.hypot(bx, by);
      if (!(bl > 0.2 && (bx * ux + by * uy) / (bl * ul) > STUB_CORNER)) return false;
    }
    if (branches(sk, j).some(br => { if (sk.edges[br.e] === E) return false; const w = leaving(sk, br, J.r); return -(w.x * ux + w.y * uy) / ul > Math.cos(Math.PI / 6); })) return false;
    // (but not a stroke running on, which its skeleton, a heavy design's, cuts short (an &'s tail, Bulwark's): its way
    // out meets the ink's edge aslant, where a stub into a corner meets the corner, or an edge square across it)
    const vx = ux / ul, vy = uy / ul, d = ahead(T, vx, vy), hx = T.x + vx * d, hy = T.y + vy * d;
    let best: Bone | null = null, bd = Infinity;
    for (const bs of rig.bones) for (const q of bs) { const e = Math.hypot(q.x - hx, q.y - hy); if (e < bd) { bd = e; best = q; } }
    return !best || best.corner || Math.abs(best.nx * vx + best.ny * vy) >= STUB_SQUARE;
  };
  // (nor, in a font cutting its strokes' ends, a stub withStubs ran on past a turn whose end isn't cut: the outside of
  // the turn, round past it, not a stroke's end, a heavy u's bottom corner, an n's shoulder)
  const runOn = (E: (typeof sk.edges)[number]) => {
    if (drawn !== 1 || rig.stroked() === 1 || !STUBBED.has(E.pts) || E.pts.length < 3) return false;
    const p = E.pts[E.pts.length - 1], q = E.pts[0], l = Math.hypot(p.x - q.x, p.y - q.y) || 1, ux = (p.x - q.x) / l, uy = (p.y - q.y) / l;
    return !capAhead(p, ux, uy, ahead(p, ux, uy), p.r);
  };
  // (whether the outline ahead of a stroke's middle o, the way (ux, uy), `mid` on, is a stroke's end cut across it, straight)
  const capAhead = (o: P, ux: number, uy: number, mid: number, s: number) => {
    const hx = o.x + ux * mid, hy = o.y + uy * mid;
    let best: Bone | null = null, bd = Infinity;
    for (const bs of rig.bones) for (const q of bs) { const e = Math.hypot(q.x - hx, q.y - hy); if (e < bd) { bd = e; best = q; } }
    return !!best && (best.cap || (best.straight && Math.abs(best.tx * ux + best.ty * uy) < 0.85)) && bd < 0.25 * s;
  };
  // (a vertex cut on its line, its tip drawn on its join (withFeet), its strokes run in to a point a round off its cut,
  // their middles from where they run straight (withFeet's run in to the join) bent in to it: run in to the join, as far
  // off the line as the design's strokes' round, and the tip drawn from there as thick as they are now, the vertex stood
  // a stub under two thin strokes, or, moved as drawn, a wedge as wide as its cut, at Thin)
  const pointed = (E: (typeof sk.edges)[number], raw: (P & { R: number; ox: number; oy: number })[], j: number) => {
    const T = rig.thin!;
    for (const [node, from] of [[E.a, 1], [E.b, -1]] as const) {
      const N = sk.nodes[node], V = (VERTICES.get(sk) ?? []).find(v => Math.hypot(v.x - N.x, v.y - N.y) < 1);
      if (!V || N.edges.length < 3 || !N.edges.some(e => vertexTip(sk, sk.edges[e]))) continue;
      const k0 = from > 0 ? 0 : raw.length - 1;
      let a = k0;
      while (a + from >= 0 && a + from < raw.length && T.vrun[j + a + from]) a += from;
      a += from;
      if (a < 0 || a >= raw.length) continue;
      // (as far toward the line as its ink runs, the vertex's cut, which may stand a little off it: a slab's M's middle)
      const J = raw[k0], A = raw[a], up = Math.sign(V.y - V.line) || 1, R = A.R, cut = Math.min(Math.abs(V.y - V.line), ahead({ x: J.ox, y: J.oy }, 0, -up));
      const Py = J.y - up * Math.max(0, cut - R), dA = Math.hypot(A.x - J.x, A.y - J.y) || 1;
      for (let i = k0; i !== a; i += from) { const t = Math.hypot(raw[i].x - J.x, raw[i].y - J.y) / dA; raw[i] = { ...raw[i], x: J.x + (A.x - J.x) * t, y: Py + (A.y - Py) * t, R }; }
    }
  };
  let j0 = 0;
  for (const E of sk.edges) {
    const n0 = E.pts.length, raw = E.pts.map((_, i) => { const q = thinMiddle(rig, mv, j0 + i, drawn === 1 || (moved ? 'moved' : false)); return { ...q, R: by(q.R), s: rig.thin!.s[j0 + i], ox: rig.thin!.x[j0 + i], oy: rig.thin!.y[j0 + i] }; });
    j0 += n0;
    if (!n0 || stub(E) || runOn(E)) continue;
    // (where `drawn` on the skeleton the ink's middle reads, that middle and its thickness evened out along it (evenRun):
    // read a cell at a time off a heavy stroke, it wanders, and a stroke drawn along it is lumpy)
    // (a vertex's strokes run in to a point a round off its line (below), and its tip, drawn on its join, none)
    if (vertexTip(sk, E)) continue;
    pointed(E, raw, j0 - n0);
    const mid = drawn !== 1 ? raw : evenRun(raw);
    // (a stroke's free end run on its way to where the ink ends, less its round: the skeleton stops a round of the stroke
    // as drawn short of its end, which a thinner stroke's round, stopping there, would leave apart, a V's tip, a K's arm's)
    // (and, where `lined`, an end the design cuts straight across, as far as the ink there across the stroke as it was ends
    // in a line, out to it: the stroke cut as the design is)
    const cuts0: boolean[] = [], slants0: (number[] | null)[] = [];
    const on = (ps: (P & { R: number; s: number; ox: number; oy: number })[], free: boolean) => {
      if (!free || ps.length < 3) { cuts0.push(false); slants0.push(null); return ps; }
      // (its way as the design's skeleton runs, where drawn on it or moved: kept on its lines (hugMap, movedHug), a short
      // stroke ending at one may run hardly any way at all, or the other way, an n's stem's top over its join lifted with
      // the arch, run on down into the counter)
      const p = ps[ps.length - 1], q = ps[Math.max(0, ps.length - 6)], [dx, dy] = drawn === 1 || hugged ? [p.ox - q.ox, p.oy - q.oy] : [p.x - q.x, p.y - q.y], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
      const more: (P & { R: number; s: number; ox: number; oy: number })[] = [], far = ahead(p, ux, uy), w = 0.8 * p.s;
      // (cut straight across, square or aslant, an A's foot along the line: the ink ahead either side of the middle as much
      // further one way as nearer the other; read about the middle as the design has it, a stroke kept on a line or a
      // slab's face (lineSkeleton's FLUSH) having gone off it)
      const o = { x: p.ox, y: p.oy }, mid = ahead(o, ux, uy), side = [-1, 1].map(k => ahead({ x: o.x - uy * w * k, y: o.y + ux * w * k }, ux, uy) - mid);
      // (and, drawn on the skeleton the ink's middle reads, where the outline ahead is a stroke's end cut across it, straight:
      // that skeleton's end, read off its corners, bends, and the ink ahead either side of it reads round)
      const cut = lined ? Math.abs(side[0] + side[1]) < 0.12 * p.s && Math.abs(side[0]) < 1.5 * w : drawn === 1 && capAhead(o, ux, uy, mid, p.s);
      cuts0.push(cut);
      // (and a straight cut, square or aslant, drawn as the design cuts it: each side run on to it, its end on the cut's line)
      slants0.push(cut && Math.abs(side[0] + side[1]) < 0.12 * p.s && Math.abs(side[0]) < 1.5 * w ? side.map(v => v / w) : null);
      // (out to it exactly, not the step short of it a point every few units stops)
      const to = Math.min(far, rig.ctx.cap) - (cut ? 0 : p.R), step = (d: number) => more.push({ x: p.x + ux * d, y: p.y + uy * d, R: p.R, s: p.s, ox: p.ox + ux * d, oy: p.oy + uy * d });
      let d = THIN_CELL;
      for (; d <= to; d += THIN_CELL) step(d);
      if (to > 0 && to - (d - THIN_CELL) > 0.05) step(to);
      return [...ps, ...more];
    };
    // (a foot's stem run down to its line ends there: no free end)
    const T = rig.thin!, foot = (j: number) => T.footStem[j] !== 0 || T.footDir[j] !== 0;
    // (where `drawn` on the skeleton the ink's middle reads, a free end's tail tapering into a corner its round reads into, an
    // arm's end cut aslant forking into its sharp corner, left off: the stroke run on from where it is as thick as it is,
    // on its way, to the end as the design cuts it)
    // (whether a run's last stretch, its way as the design's skeleton runs over its last few points, meets the ink's edge
    // square across it, within TAPER_SQUARE, and not at a corner: no tail into a corner)
    const runsSquare = (ps: typeof mid) => {
      const p = ps[ps.length - 1], q = ps[ps.length - 6], dx = p.ox - q.ox, dy = p.oy - q.oy, l = Math.hypot(dx, dy);
      if (!(l > 1e-6)) return false;
      const ux = dx / l, uy = dy / l, d = ahead({ x: p.ox, y: p.oy }, ux, uy), hx = p.ox + ux * d, hy = p.oy + uy * d;
      let best: Bone | null = null, bd = Infinity;
      for (const bs of rig.bones) for (const o of bs) { const e = Math.hypot(o.x - hx, o.y - hy); if (e < bd) { bd = e; best = o; } }
      return !!best && !best.corner && bd < 0.25 * p.s && Math.abs(best.nx * ux + best.ny * uy) > TAPER_SQUARE;
    };
    const taper = (ps: typeof mid, free: boolean) => {
      if (drawn !== 1 || !free || ps.length < 6) return ps;
      // (one the design cuts, not one ending round, which tapers into its round)
      { const p = ps[ps.length - 1], q = ps[ps.length - 6], l = Math.hypot(p.x - q.x, p.y - q.y) || 1, ux = (p.x - q.x) / l, uy = (p.y - q.y) / l, o = { x: p.ox, y: p.oy };
        if (!capAhead(o, ux, uy, ahead(o, ux, uy), p.s)) return ps; }
      const Rs = ps.map(q => q.R).sort((a, b) => a - b), Rm = Rs[Rs.length >> 1];
      let k = ps.length;
      while (k > 3 && ps[k - 1].R < TAPER * Rm) k--;
      // (and where it turns off its way into that corner: the way it runs a round or two in from its end, and each step on
      // from there no more than TAPER_TURN off it; not where it runs square into an end cut across it (runsSquare), its
      // last stretch straight off a round: Bulwark's 2's top's tail, which runs round and straight down into its foot
      // cut level, was left off where it came off the round, as much further back as the stroke was thicker, and run on
      // from there its way there, at a slant past the foot's middle, a point more, and 5 degrees, from one step of Weight
      // to the next: its room 13 units at a step)
      if (!runsSquare(ps)) {
        const arc = (i: number, j: number) => { let l = 0; for (let q = i; q < j; q++) l += Math.hypot(ps[q + 1].x - ps[q].x, ps[q + 1].y - ps[q].y); return l; };
        let b = k - 1;
        while (b > 0 && arc(b, k - 1) < 1.5 * Rm) b--;
        let a = b;
        while (a > 0 && arc(a, b) < 1.5 * Rm) a--;
        if (a < b) {
          const ux = ps[b].x - ps[a].x, uy = ps[b].y - ps[a].y, ul = Math.hypot(ux, uy) || 1;
          for (let q = b + 1; q < k; q++) {
            const vx = ps[q].x - ps[b].x, vy = ps[q].y - ps[b].y, vl = Math.hypot(vx, vy);
            if (vl > 2 && (ux * vx + uy * vy) / (ul * vl) < Math.cos(TAPER_TURN)) { k = q; break; }
          }
        }
      }
      return k < ps.length ? ps.slice(0, Math.max(3, k)) : ps;
    };
    const fb = sk.nodes[E.b].edges.length === 1 && !foot(j0 - 1), fa = sk.nodes[E.a].edges.length === 1 && !foot(j0 - n0);
    const at = on(on(taper(taper(mid, fb).reverse(), fa).reverse(), fb).reverse(), fa).reverse(), n = at.length;
    // (a round at each end, but an end cut as the design cuts it, where the ink cuts the round off)
    const [cutB, cutA] = n < 2 ? [false, false] : cuts0, [slantB, slantA] = n < 2 ? [null, null] : slants0;
    if (!cutA) out.push(round(at[0], atJoin.get(E.a) ?? at[0].R));
    if (!cutB) out.push(round(at[n - 1], atJoin.get(E.b) ?? at[n - 1].R));
    if (n < 2) continue;
    // (where `lined`, a stroke turning sharply, a W's point, an N's corner, is drawn as two, meeting at a corner: its sides,
    // drawn out along the turn's normals, would cross inside it and fan out round it; each as thick up to the turn as a
    // little way off it, where its way, read either side, is its own)
    const cuts = [0];
    if (lined) for (let i = 1; i < n - 1; i++) {
      const a = at[i - 1], p = at[i], b = at[i + 1], ax = p.x - a.x, ay = p.y - a.y, bx = b.x - p.x, by2 = b.y - p.y;
      if (ax * bx + ay * by2 < Math.cos(Math.PI / 9) * Math.hypot(ax, ay) * Math.hypot(bx, by2)) cuts.push(i);
    }
    // (and where `drawn` on the skeleton the ink's middle reads, a bend tighter than the stroke is thick, its inside, drawn
    // out along the bend's normals, folding over itself, and the fold left a hole in the join it bends into: parted there,
    // a round where the parts meet)
    if (drawn === 1) {
      for (let i = 2; i < n - 2; i++) {
        const a = at[i - 2], p = at[i], b = at[i + 2], ax = p.x - a.x, ay = p.y - a.y, bx = b.x - p.x, by2 = b.y - p.y, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by2);
        if (la < 1e-6 || lb < 1e-6) continue;
        const turn = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by2) / (la * lb))));
        if (turn > 1e-3 && (la + lb) / turn < 1.1 * p.R && i - cuts[cuts.length - 1] > 1) { cuts.push(i); out.push(round(p, p.R)); }
      }
    }
    cuts.push(n - 1);
    const turnR = new Map<number, [number, number]>();
    for (let c = 1; c < cuts.length - 1; c++) {
      const i = cuts[c], Ra = at[Math.max(cuts[c - 1], i - 3)].R, Rb = at[Math.min(cuts[c + 1], i + 3)].R;
      for (let k = Math.max(cuts[c - 1] + 1, i - 2); k < i; k++) at[k] = { ...at[k], R: Ra };
      for (let k = i + 1; k <= Math.min(cuts[c + 1] - 1, i + 2); k++) at[k] = { ...at[k], R: Rb };
      turnR.set(i, [Ra, Rb]);
      // (its outside as the design's corner there is, drawn to the stroke's thickness now: mitred where that is square or
      // a point, the ink cutting it as the design does (an E's, a 7's); round where it is round, as round for the stroke's
      // thickness as the design's for its (a Gumdrop's corners round right across, a squared D's only at the very corner))
      const p = at[i], a = at[i - 1], b = at[i + 1], la = Math.hypot(p.x - a.x, p.y - a.y) || 1, lb = Math.hypot(b.x - p.x, b.y - p.y) || 1;
      const ax = (p.x - a.x) / la, ay = (p.y - a.y) / la, bx = (b.x - p.x) / lb, by2 = (b.y - p.y) / lb, k = ax * by2 - ay * bx > 0 ? 1 : -1;
      const nax = ay * k, nay = -ax * k, nbx = by2 * k, nby = -bx * k, ml = Math.hypot(nax + nbx, nay + nby), R = Math.max(Ra, Rb);
      // (a turn too slight to cross its sides at a point, a bend parted along a stroke all but straight, a round)
      if (ml < 1e-3 || Math.abs(ax * by2 - ay * bx) < TURN_ROUND) { out.push(round(p, R)); continue; }
      const ux = (nax + nbx) / ml, uy = (nay + nby) / ml, half = Math.sin(Math.acos(Math.max(-1, Math.min(1, -(ax * bx + ay * by2)))) / 2);
      // (the design's corner's round: how far short of the point its sides would make the outline crosses the way out)
      const rho = Math.min(Ra, Rb, roundAt(rig, p, ux, uy, ahead) ? Math.max(0, Math.min(p.s, (p.s / half - ahead(p, ux, uy)) / (1 / half - 1))) * R / p.s : 0);
      const pa = { x: p.x + nax * Ra, y: p.y + nay * Ra }, pb = { x: p.x + nbx * Rb, y: p.y + nby * Rb }, det = ax * by2 - ay * bx;
      const t = ((pb.x - pa.x) * by2 - (pb.y - pa.y) * bx) / det, X = { x: pa.x + ax * t, y: pa.y + ay * t };
      // (a turn whose sides meet further off than MITRE_MOST of its round, a stroke all but doubling back on itself or,
      // a little unlike in thickness either side, all but straight, a round: a wood type's q's stem doubling back at its
      // top had its sides meet 7,000 units out, and the mitre, clipped to the ink, stood in the stem as a wedge)
      if (Math.hypot(X.x - p.x, X.y - p.y) > MITRE_MOST * R) { out.push(round(p, R)); continue; }
      // (its inside point a little in from the turn's, so the piece overlaps both strokes, not along their sides, a hair
      // apart where each reads its own round: united, a slit between them, a grotesque w's flat vertex split 27 units up)
      const inner = { x: p.x - ux * TURN_IN * R, y: p.y - uy * TURN_IN * R };
      if (rho <= 0.05 * R) { out.push([inner, pa, X, pb]); continue; }
      // (the round's middle as far in from either side, the strokes either side as thick as they are)
      const qa = { x: pa.x - nax * rho, y: pa.y - nay * rho }, qb = { x: pb.x - nbx * rho, y: pb.y - nby * rho }, tq = ((qb.x - qa.x) * by2 - (qb.y - qa.y) * bx) / det;
      const C = { x: qa.x + ax * tq, y: qa.y + ay * tq }, tA = { x: C.x + nax * rho, y: C.y + nay * rho }, tB = { x: C.x + nbx * rho, y: C.y + nby * rho };
      const a0 = Math.atan2(tA.y - C.y, tA.x - C.x), a1 = Math.atan2(tB.y - C.y, tB.x - C.x);
      let da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      out.push([inner, pa, ...Array.from({ length: 9 }, (_, q) => ({ x: C.x + Math.cos(a0 + da * q / 8) * rho, y: C.y + Math.sin(a0 + da * q / 8) * rho })), pb]);
    }
    // (each side out along the middle's normal, read a few points either way, the skeleton being a little uneven)
    for (let c = 1; c < cuts.length; c++) {
      const run = at.slice(cuts[c - 1], cuts[c] + 1), m = run.length, left: P[] = [], right: P[] = [];
      if (m < 2) continue;
      // (each as thick as itself up to its turns)
      const r0 = turnR.get(cuts[c - 1]), r1 = turnR.get(cuts[c]);
      if (r0) run[0] = { ...run[0], R: r0[1] };
      if (r1) run[m - 1] = { ...run[m - 1], R: r1[0] };
      run.forEach((p, i) => {
        const a = run[Math.max(0, i - 2)], b = run[Math.min(m - 1, i + 2)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
        left.push({ x: p.x + nx * p.R, y: p.y + ny * p.R });
        right.push({ x: p.x - nx * p.R, y: p.y - ny * p.R });
      });
      // (an end cut aslant, each side run on to the cut's line: as far again as the ink ahead reads, across the stroke as it
      // was, that far out from its middle)
      const slant = (i: number, back: number, ks: number[]) => {
        const q = run[i], o = run[i + back], l = Math.hypot(q.x - o.x, q.y - o.y) || 1, tx = (q.x - o.x) / l, ty = (q.y - o.y) / l;
        left[i] = { x: left[i].x + tx * ks[1] * q.R, y: left[i].y + ty * ks[1] * q.R }; right[i] = { x: right[i].x + tx * ks[0] * q.R, y: right[i].y + ty * ks[0] * q.R };
      };
      if (c === cuts.length - 1 && slantB && m > 2) slant(m - 1, -2, slantB);
      if (c === 1 && slantA && m > 2) slant(0, 2, [slantA[1], slantA[0]]);
      // (where `lined`, each side's points running on in a line one point: a straight stroke's sides are two lines)
      out.push(lined ? [...straightened(left), ...straightened(right).reverse()] : [...left, ...right.reverse()]);
    }
  }
  return out;
}

/** Points ps, less those lying on the line between the points either side kept (within a twentieth of a unit). */
function straightened(ps: P[]) {
  if (ps.length < 3) return ps;
  const out = [ps[0]];
  for (let i = 1; i < ps.length - 1; i++) {
    const a = out[out.length - 1], b = ps[i + 1], p = ps[i], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (!l || Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / l > 0.05) out.push(p);
  }
  out.push(ps[ps.length - 1]);
  return out;
}

/** A wood type's curve's sample standing out past its stroke's round further than BULGE of it is in a bulge (thinMoves). */
const BULGE = 1.2;
/** How thin, half, no stroke of a wood type's lighter weight is drawn (its letter without its slabs, slabRig), but where
    the design's is thinner still: its hairline as the weight keeps it. Its arches taper hard into their stems, and thinned
    in step they came out hairlines beside its stems. 0 at a weight no lighter, or in a font drawn with much contrast,
    whose hairlines are kept so already (weighsOf), less as far as it reads so (thickShare). */
function hairFloor(rig: SkinRig, mv: MoveMap) {
  if (!mv.lighter || !rig.slabless) return 0;
  const { hair: h0 } = rig.ref(), t = thickShare(rig, mv);
  return (1 - t) * h0 * mv.weighs({ tx: 1, ty: 0, w: h0 / 2, serifDx: 0, dot: false } as Bone) * mv.past / 2;
}

/** How far a lighter weight reads the font as thinning its strokes by how thick each is (weighsOf: drawn with much
    contrast), 0 to 1: as its hairlines and its stems thin apart, across `band` of their difference (THICK_APART;
    FEET_APART for its feet's serifs, footRound). Read so all at once where they first thinned 0.02 apart, a letter's
    every hairline moved at once there: Couture's serifs' tips cut off at 0.735 of its stems, Ballyhoo's slab serifs
    turned to hairlines (a fifth of its H's ink) within 0.005 of Weight. */
function thickShare(rig: SkinRig, mv: MoveMap, band = THICK_APART) {
  const { stem: s0, hair: h0 } = rig.ref(), w = (b: number) => mv.weighs({ tx: 0, ty: 1, w: b / 2, serifDx: 0, dot: false } as Bone);
  return Math.min(1, Math.max(0, (Math.abs(w(h0) - w(s0)) - band[0]) / (band[1] - band[0])));
}
/** A point the outline turns back at by more than this (its two ways' cosine under minus it) is a tip (thinMoves); a sample
    by one reading its stroke under TIP_HAIR across runs out to it. */
const TIP_TURN = 0.9, TIP_HAIR = 0.5;
const THICK_APART = [0.015, 0.025], FEET_APART = [0.01, 0.05];

/** Whether the outline the way (ux, uy) from p runs out to is round there: on a curve, no corner near (the design's
    corner a stroke turns at, drawn round, not square or to a point). */
function roundAt(rig: SkinRig, p: P, ux: number, uy: number, ahead: (p: P, ux: number, uy: number) => number) {
  const d = ahead(p, ux, uy), hx = p.x + ux * d, hy = p.y + uy * d;
  let best: { r: number; i: number } | null = null, bd = Infinity;
  rig.bones.forEach((bs, r) => bs.forEach((b, i) => { const e = Math.hypot(b.x - hx, b.y - hy); if (e < bd) { bd = e; best = { r, i }; } }));
  if (!best) return true;
  const { r, i } = best as { r: number; i: number }, bs = rig.bones[r];
  for (let k = -2; k <= 2; k++) { const b = bs[(i + k + bs.length) % bs.length]; if (b.corner || b.straight) return false; }
  return true;
}

/** A stroke drawn on the skeleton the ink's middle reads ends where its round falls under TAPER of its middle's, at a free
    end (thinStrokes). */
const TAPER = 0.75, TAPER_TURN = 20 * Math.PI / 180;
/** How nearly square across its way the ink's edge a free end runs into lies, as the cosine, for its tail to be kept (thinStrokes). */
const TAPER_SQUARE = Math.cos(15 * Math.PI / 180);
/** A stub into a corner meets the ink's edge ahead of it no further off square across its way than this (thinStrokes). */
const STUB_SQUARE = 0.75;
/** Drawn on the letter's skeleton, a stub runs into a turn's corner where it runs out from the join no further off the
    way out from between the two strokes turning there than this (thinStrokes). */
const STUB_CORNER = 0.9;
/** How many points either way a stroke drawn on the skeleton the ink's middle reads is evened out over (thinStrokes). */
/** A run of a skeleton's points (a stroke's middle read off a heavy letter, drawn on) and their thickness, evened out
    along it: each a mean of those within EVEN_SPAN of the stroke's half-thickness as the design has it either way along
    the run (EVEN_CELLS cells at least), each weighing less the further along it is, its ends and its sharp turns, turning
    EVEN_TURN or more over half that thickness either way, staying where they are, and the reach either side no further
    than the nearer of them. A heavy round's middle, read off its outline a cell at a time, runs flat a while and kinks
    where the outline it is read off goes from one curve to the next, a few cells apart or a stroke's thickness:
    Gumdrop's c's and s's rounds, drawn along it evened out a few points either way only, came out lumpy at every lighter
    weight. (Each point weighs alike over its reach, two points next to each other, their reaches over the same points
    where they are unevenly apart, came out one: a stroke's side read across it there went off along no way at all, a
    Gumdrop's 2 at Weight 0.41 drawn in a chord across its counter.) */
function evenRun<Q extends P & { R: number; s: number }>(raw: Q[]): Q[] {
  const n = raw.length, cum = [0];
  if (n < 3) return raw;
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y));
  const at = (d: number) => { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < d) lo = m + 1; else hi = m; } return lo; };
  const turn = raw.map((p, i) => {
    const L = Math.max(2 * THIN_CELL, 0.5 * p.s);
    if (cum[i] < L || cum[n - 1] - cum[i] < L) return 0;
    const a = raw[at(cum[i] - L)], b = raw[at(cum[i] + L)], ax = p.x - a.x, ay = p.y - a.y, bx = b.x - p.x, by = b.y - p.y, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    return la && lb ? Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) : 0;
  });
  const fixed = [0];
  for (let i = 1; i < n - 1; i++) if (turn[i] > EVEN_TURN && turn[i] >= turn[i - 1] && turn[i] > turn[i + 1]) fixed.push(i);
  fixed.push(n - 1);
  let f = 0;
  return raw.map((p, i) => {
    while (fixed[f + 1] < i) f++;
    const lo = fixed[f], hi = fixed[f + 1];
    const h = Math.min(Math.max(EVEN_CELLS * THIN_CELL, EVEN_SPAN * p.s), cum[i] - cum[lo], cum[hi] - cum[i]);
    if (!(h > 0)) return p;
    let x = 0, y = 0, R = 0, w = 0;
    for (let j = at(cum[i] - h); j < n && cum[j] <= cum[i] + h; j++) { const k = 1 - Math.abs(cum[j] - cum[i]) / h; x += raw[j].x * k; y += raw[j].y * k; R += raw[j].R * k; w += k; }
    return w > 0 ? { ...p, x: x / w, y: y / w, R: R / w } : p;
  });
}
const EVEN_SPAN = 1.1, EVEN_CELLS = 6, EVEN_TURN = 50 * Math.PI / 180;
/** How far off a turn drawn as strokes its sides may meet, as many times its round as, and be mitred there (thinStrokes):
    further, the turn is all but a stroke doubling back, or all but straight. A mitre MITRE_MOST rounds long is a point
    of 14 degrees. */
const MITRE_MOST = 8;
/** How far in from a turn drawn as strokes, as a share of its round, the piece drawing its outside reaches (thinStrokes). */
const TURN_IN = 0.5;
/** The least turn (its sine) of a stroke drawn as strokes whose outside is mitred (thinStrokes): slighter, a round, its sides,
    a little unlike in thickness, all but parallel and crossing far off. */
const TURN_ROUND = Math.sin(15 * Math.PI / 180);

/** Each point of a lighter weight's skeleton (thinReads) and its stroke's half thickness now, as weighsOf thins it by the
    way it runs, before any floor a caller keeps under it. Where the uprights thin apart from the bars past Weight
    (MoveMap.apart, Verticals), the way read over the stroke's half thickness (ThinReads.wx), and a stroke leaving a join
    a stem runs on straight through (straightThrough's pair, within STRAIGHT_THROUGH) no thicker there than the stem is
    now and as much more as it lies off the stem's middle (its way out from the join, across the stem's, as far out
    along it as it is): read as the grid steps, an o's top went in and out, saw-toothed; and a b's bowl's level ends,
    heavier than its stem, were drawn again as rounds on the stem's middle, a knob standing out past the stem's far side,
    an e's bar's at its bowl's. Kept with the move. */
function strokeRs(rig: SkinRig, mv: MoveMap): Float64Array {
  let byRig = STROKE_RS.get(mv);
  if (!byRig) STROKE_RS.set(mv, byRig = new Map());
  const had = byRig.get(rig);
  if (had) return had;
  const T = rig.thin!, n = T.x.length, W = new Float64Array(n), f = mv.apart, at = (tx: number, ty: number, w: number) => mv.weighs({ tx, ty, w, serifDx: 0, dot: false } as Bone) * w;
  for (let j = 0; j < n; j++) {
    if (!f) { W[j] = at(T.tx[j], T.ty[j], T.s[j]); continue; }
    const ux = T.tx[j] + (T.wx[j] - T.tx[j]) * f, uy = T.ty[j] + (T.wy[j] - T.ty[j]) * f, l = Math.hypot(ux, uy) || 1;
    W[j] = at(ux / l, uy / l, T.s[j]);
  }
  if (f) for (const [k, ls] of T.legs) {
    const N = T.joins.get(k);
    if (!N || ls.length < 3) continue;
    let a = -1, b = -1, most = STRAIGHT_THROUGH;
    for (let p = 0; p < ls.length; p++) for (let q = p + 1; q < ls.length; q++) { const c = ls[p].x * ls[q].x + ls[p].y * ls[q].y; if (c < most) { most = c; a = p; b = q; } }
    if (a < 0) continue;
    const stem = Math.min(at(ls[a].x, ls[a].y, ls[a].s), at(ls[b].x, ls[b].y, ls[b].s)), ux = ls[a].x, uy = ls[a].y;
    ls.forEach((l, q) => {
      if (q === a || q === b) return;
      const off = Math.abs(l.x * uy - l.y * ux);
      for (const j of l.pts) W[j] += (Math.min(W[j], stem + off * Math.hypot(T.x[j] - N.x, T.y[j] - N.y)) - W[j]) * f;
    });
  }
  byRig.set(rig, W);
  return W;
}
const STROKE_RS = new WeakMap<MoveMap, Map<SkinRig, Float64Array>>();

/** Point j of a lighter weight's skeleton (thinReads), and the stroke's half thickness there now, as the strokes drawn
    again have it (moved with the letter's heights after, which carry a stroke along a line back to it). */
function thinMiddle(rig: SkinRig, mv: MoveMap, j: number, hug: boolean | 'moved' = false): P & { R: number } {
  const T = rig.thin!, s = T.s[j], R = Math.max(1, strokeRs(rig, mv)[j], Math.min(s, hairFloor(rig, mv)));
  // (a serif's foot drawn level stands on its line, as thick as it is now: thinMoves)
  if (T.footDir[j]) { const Rf = footRound(rig, mv, R); return { x: T.x[j], y: T.foot[j] + T.footDir[j] * Rf, R: Rf }; }
  // (and the stem run down to one no further than its round reaches the line)
  if (T.footStem[j]) { const d = T.footStem[j], y = d > 0 ? Math.max(T.y[j], T.foot[j] + R) : Math.min(T.y[j], T.foot[j] - R); return { x: T.x[j], y, R }; }
  // (a stroke run level along a line, its side kept on it as it thins, or a slab along its face, and a stroke ending at
  // one going with it, less and less away from that end: an E's arms, its stem's ends)
  const by = T.flush[j];
  if (by) {
    let dx = 0, dy = 0;
    for (const [F, w] of by) {
      // (a vertex's point no further off its line than its corner now reaches: nearer, its point cut flat by the line)
      const R0 = Math.max(1, mv.weighs({ tx: F.ux, ty: F.uy, w: F.h, serifDx: 0, dot: false } as Bone) * F.h), to = F.k ? Math.min(F.at, R0 * F.k) : R0, d = w * (to - F.at);
      dx += F.nx * d; dy += F.ny * d;
    }
    return { x: T.x[j] + dx, y: T.y[j] + dy, R };
  }
  if (hug === 'moved') { const H = movedHug(rig, mv); return { x: T.x[j], y: T.y[j] + (H ? H[j] : 0), R }; }
  if (!hug) return { x: T.x[j], y: T.y[j], R };
  const to = HUGS.get(mv) ?? HUGS.set(mv, hugMap(rig, mv)).get(mv)!, fade = FADES.get(T) ?? FADES.set(T, hugFade(rig)).get(T)!;
  return { x: T.x[j], y: T.y[j] + (to(T.y[j]) - T.y[j]) * fade[j], R };
}

/** Where a lighter weight drawn as its strokes alone puts a point of its skeleton at height y, to keep its strokes' sides
    on the letter's lines (thinMiddle): a stroke drawn along the heavy letter's middle as thin as it is now stops short of
    its lines by as much as it is thinner, an o's round and an n's arch under the x-height, a 2's foot over the baseline.
    At each line the letter reaches, the stroke running level whose side lies furthest out within HUG of it goes out by as
    much as it is thinner (its middle where its side was, less its round now), and the rest of the letter in step between
    such lines, its strokes as thick as they are: its counters and its upright strokes taller (their ends run on to the ink
    as they are), not its level strokes thicker. */
function hugMap(rig: SkinRig, mv: MoveMap): (y: number) => number {
  const T = rig.thin!, c = rig.ctx, band = HUG * c.cap, n = T.x.length;
  const lines = [...(c.lower ? [c.xh, c.asc] : [c.cap]).map(L => [L, 1] as const), ...(c.lower ? [0, c.desc] : [0]).map(L => [L, -1] as const)];
  const knots: [number, number][] = [];
  for (const [L, up] of lines) {
    // (the letter reaching it: its outline facing it there)
    if (!rig.bones.some(bs => bs.some(b => !b.dot && (up > 0 ? -b.ny : b.ny) >= 0.5 && Math.abs(b.y - L) <= band))) continue;
    let best: [number, number] | null = null, out = -Infinity;
    for (let j = 0; j < n; j++) {
      const tx = Math.abs(T.tx[j]), s = T.s[j];
      if (tx < HUG_LEVEL) continue;
      const edge = T.y[j] + up * tx * s;
      if (Math.abs(edge - L) > band || up * edge <= out) continue;
      const R = Math.max(1, strokeRs(rig, mv)[j], Math.min(s, hairFloor(rig, mv)));
      out = up * edge; best = [T.y[j], T.y[j] + up * Math.max(0, s - R) * tx];
    }
    knots.push(best ?? [L, L]);
  }
  knots.sort((a, b) => a[0] - b[0]);
  const kept = knots.filter((k, i) => i === 0 || (k[0] > knots[i - 1][0] + 1 && k[1] > knots[i - 1][1] + 1));
  return kept.length ? piecewise(kept) : (y: number) => y;
}
/** How near, as a share of the capitals' height, a stroke's side lies to a line for hugMap to keep it on it, and how
    level (the cosine of its slope) it runs. */
const HUG = 0.06, HUG_LEVEL = 0.7, HUG_FADE = 2;
/** How far a lighter weight moved (not drawn as its strokes) puts each point of its skeleton (thinReads) up or down, to keep
    its rounds on the line an arch's or a bowl's crotch runs to (archCrotches): an n's arch, thinning about its middle,
    sank under the x-height its stem's top, cut level on it, stays on (37 units at Thin, Mainline's), which keepHeights,
    lifting the letter's top as far as its highest edge there is under it, left so, the stem's top already on the line; a
    u's bowl rose off the baseline its stem's foot stands on; and an h's arch, which keepHeights lifts after the crotch
    has been met again under it, came apart from its stem. At such a line, as hugMap does at every line for a letter
    drawn as its strokes, the stroke running level whose side lies furthest out within HUG of it, its round past the
    line and past any edge cut level on it, goes out by as much as it is thinner, and the strokes joined to the crotch in
    step with it from the crotch's height, none a stroke's thickness short of that; less and less along a stroke running
    steeply into a line to end there (hugFade), and none on a foot drawn level or a stroke run along a line (thinMiddle's
    own). null where none so moves. */
function movedHug(rig: SkinRig, mv: MoveMap): Float64Array | null {
  const got = MOVED_HUGS.get(mv);
  if (got !== undefined) return got;
  // (not past an ink trap's crotch, a monospace's, whose thin neck the round lifted off parted, mended at a jump)
  const crotches = [...archCrotches(rig).values()].flat().filter(G => !G.trap);
  if (!crotches.length) { MOVED_HUGS.set(mv, null); return null; }
  const T = rig.thin!, c = rig.ctx, band = HUG * c.cap, n = T.x.length, tol = Math.max(6, 0.02 * c.cap);
  const lines = [...(c.lower ? [c.xh, c.asc] : [c.cap]).map(L => [L, 1] as const), ...(c.lower ? [0, c.desc] : [0]).map(L => [L, -1] as const)];
  const H = new Float64Array(n), fade = FADES.get(T) ?? FADES.set(T, hugFade(rig)).get(T)!;
  // (and only on the strokes the crotches' joins run on to, not a piece apart from them: Faster One's &'s speed lines,
  // beside its bowl's foot, were carried down with it, their tips left)
  const sk = thinSkeleton(rig), on = new Uint8Array(n), seen = new Set<number>(), todo = crotches.flatMap(G => G.joins);
  while (todo.length) { const k = todo.pop()!; if (seen.has(k)) continue; seen.add(k); for (const e of sk.nodes[k].edges) { const E = sk.edges[e]; todo.push(E.a, E.b); } }
  for (let e = 0, j0 = 0; e < sk.edges.length; j0 += sk.edges[e].pts.length, e++) if (seen.has(sk.edges[e].a)) on.fill(1, j0, j0 + sk.edges[e].pts.length);
  let any = false;
  for (const [L, up] of lines) {
    // (only toward a line an arch's or a bowl's crotch runs to, archCrotches: from a stroke's thickness short of the crotch
    // nearest it, in step out to the line, so the rest of the letter, an &'s speed lines, stays)
    const toL = crotches.filter(G => G.line === L);
    if (!toL.length) continue;
    const facing = (b: Bone) => !b.dot && (up > 0 ? -b.ny : b.ny) >= 0.5;
    // (an edge cut level on it, or within a unit or two, a stem's end; and a round past it, its overshoot, further out
    // than any such edge: not a serif's bracket, which stays inside its line)
    let flatAt = -Infinity, roundAt = -Infinity, uncut = false;
    for (const bs of rig.bones) for (const b of bs) {
      if (!facing(b) || b.corner || Math.abs(b.y - L) > band) continue;
      if (b.straight && Math.abs(b.y - L) < tol) { flatAt = Math.max(flatAt, (b.y - L) * up); if (!b.cap) uncut = true; }
      else if (!b.straight) roundAt = Math.max(roundAt, (b.y - L) * up);
    }
    // (nor where an edge level on the line is no stroke's end cut across it, an industrial's stem's foot or top running
    // round its corners, which keepHeights brings back with the letter: put back alone, it folded on its round corner,
    // a sliver out past the stem, at a jump)
    if (!(roundAt > HUG_PAST && roundAt > flatAt + HUG_PAST) || (uncut)) continue;
    let best: [number, number] | null = null, out = -Infinity;
    for (let j = 0; j < n; j++) {
      const tx = Math.abs(T.tx[j]), s = T.s[j];
      if (tx < HUG_LEVEL || T.footDir[j] || T.footStem[j] || T.flush[j]) continue;
      const edge = T.y[j] + up * tx * s;
      if (Math.abs(edge - L) > band || up * edge <= out) continue;
      const R = Math.max(1, strokeRs(rig, mv)[j], Math.min(s, hairFloor(rig, mv)));
      out = up * edge; best = [T.y[j], up * Math.max(0, s - R) * tx];
    }
    if (!best || Math.abs(best[1]) <= 0.5) continue;
    any = true;
    const near = toL.reduce((a, G) => ((G.y - L) * up < (a.y - L) * up ? a : G)), full = Math.min(near.y, best[0]) * up > 0 ? near.y : near.y;
    const from = full - up * Math.max(1, near.stroke);
    for (let j = 0; j < n; j++) {
      if (!on[j] || T.footDir[j] || T.footStem[j] || T.flush[j]) continue;
      const k = Math.min(1, Math.max(0, (T.y[j] - from) * up / ((full - from) * up)));
      H[j] += best[1] * k * fade[j];
    }
  }
  MOVED_HUGS.set(mv, any ? H : null);
  return any ? H : null;
}
const MOVED_HUGS = new WeakMap<MoveMap, Float64Array | null>();
/** How far past its line, and past the edges cut level on it, a round reaches for movedHug to keep it there. */
const HUG_PAST = 2.5, HUG_BY = 3;
/** Each move's joins whose crotches moveRing drew again along a stem (archMeet, stretchRounds), by node. */
/** A lighter weight's hairline's root is carried with its stem's side (moveRing's hairRoots) where that side goes in
    more than HAIR_ROOT times as far as the hairline's own, out to HAIR_REACH of the side's move from it, the round under
    it as much shorter as the stem is thinner, to HAIR_ROUND of it at the least. */
const HAIR_ROOT = 4, HAIR_REACH = 2.5, HAIR_ROUND = 0.2;
/** How much further in than its edges a round inside a join off a stem's side, held there, goes (holdBrackets). */
const HOLD_SLACK = 4;

/** A lighter weight's hairlines' roots carried with their stems' sides (moveRing's hairRoots), by the moves that put them
    there: each crotch as moved before, how far it went, the way out from the stem and how far out it carries. */
const HAIR_ROOTS = new WeakMap<MoveMap, { x: number; y: number; vx: number; vy: number; ox: number; oy: number; reach: number; tx: number; ty: number; ua: number; sk: number; wn: number }[]>();
const ARCHED = new WeakMap<MoveMap, Set<number>>();
/** Each move's hugMap, made when first asked for. */
const HUGS = new WeakMap<MoveMap, (y: number) => number>();
/** How much of hugMap's move each point of a lighter weight's skeleton takes: all of it, but along a stroke running
    steeply into a line to end there (a stem's top on the x-height, an n's spur), less and less out to none at its end,
    HUG_FADE times its round in from it, which stays where the design ends it, the stroke run on to the ink as it is. */
function hugFade(rig: SkinRig): Float64Array {
  const T = rig.thin!, sk = thinSkeleton(rig), c = rig.ctx, band = HUG * c.cap, lines = c.lower ? [0, c.xh, c.asc, c.desc] : [0, c.cap];
  const fade = new Float64Array(T.x.length).fill(1);
  let j0 = 0;
  for (const E of sk.edges) {
    const n = E.pts.length, cum = [0];
    for (let k = 1; k < n; k++) cum.push(cum[k - 1] + Math.hypot(E.pts[k].x - E.pts[k - 1].x, E.pts[k].y - E.pts[k - 1].y));
    const L = cum[n - 1] || 1;
    for (const [node, k, toEnd] of [[E.a, 0, (i: number) => cum[i]], [E.b, n - 1, (i: number) => L - cum[i]]] as const) {
      if (!n || sk.nodes[node].edges.length !== 1) continue;
      const p = E.pts[k], steep = Math.abs(T.tx[j0 + k]) < HUG_LEVEL, edge = (up: number) => p.y + up * p.r;
      if (!steep || !lines.some(Ly => Math.abs(edge(1) - Ly) < band || Math.abs(edge(-1) - Ly) < band)) continue;
      for (let i = 0; i < n; i++) fade[j0 + i] = Math.min(fade[j0 + i], toEnd(i) / Math.min(L, HUG_FADE * p.r));
    }
    j0 += n;
  }
  return fade;
}
const FADES = new WeakMap<ThinReads, Float64Array>();

/** Whether sample b is of foot F: over its reach along the line, and no further off it than its stem's run (where the
    skeleton nearest a sample's middle is a foot's, the sample may be another stroke's beside it, a y's other arm's). */
function byFoot(F: ThinReads['feet'][number], b: Bone, tol: number, cap: number) {
  // (as deep as its stem's run, or a wedge serif's, deepest by its stem, up to a quarter of the capitals' height)
  const xs = [F.stem[0] - F.side, F.stem[0] + F.side, ...F.serifs.flatMap(S => [S.x0, S.x1])], h = (b.y - F.line) * F.dir, top = Math.max((F.stem[3] - F.line) * F.dir, 0.25 * cap);
  return b.x >= Math.min(...xs) - tol && b.x <= Math.max(...xs) + tol && h >= -tol && h <= top + tol;
}

/** How far in along its inward normal sample b goes to reach foot F drawn as thin as the move makes it (its stem's round
    Rs, its serifs' Rf, read at a point j of each; tol the line's give), up to reach, by the unit (`fine`, to a hair, halved
    FOOT_FINE times); or, never reaching it so, as far as it lies off it (0 where it is on it already), or NaN by a foot
    reaching across its stem. */
const FOOT_FINE = 12;
function intoFoot(F: ThinReads['feet'][number], b: Bone, Rs: (j: number) => number, Rf: (j: number) => number, tol: number, reach: number, fine = false) {
  const [ax, ay, bx, by] = F.stem, vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1, rs = F.stemJ >= 0 ? Rs(F.stemJ) : 0;
  const rf = F.serifs.map(S => (S.j >= 0 ? Rf(S.j) : 0));
  // (how far point (x, y) lies off the foot, 0 on it)
  const off = (x: number, y: number) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
    let d = Math.max(0, Math.hypot(x - (ax + vx * t), y - (ay + vy * t)) - rs);
    F.serifs.forEach((S, k) => {
      const lo = Math.min(S.x0, S.x1), hi = Math.max(S.x0, S.x1), h = (y - S.edge) * F.dir;
      const dx = Math.max(lo - x, 0, x - hi), dy = Math.max(-tol - h, 0, h - 2 * rf[k]);
      d = Math.min(d, Math.hypot(dx, dy));
    });
    return d;
  };
  if (off(b.x, b.y) <= 0) return 0;
  // (a serif's end, cut across it at its tip, stays, its corners meeting its edges again as they go: it comes down with
  // them)
  for (const S of F.serifs) { const out = Math.sign(S.x1 - S.x0); if ((b.x - S.x1) * out > -2 * tol && -b.nx * out > 0.7) return 0; }
  // (two units at a time, then the last step's first unit)
  for (let t = 2; t <= reach; t += 2) if (off(b.x + b.nx * t, b.y + b.ny * t) <= 0) {
    if (!fine) return off(b.x + b.nx * (t - 1), b.y + b.ny * (t - 1)) <= 0 ? 1 - t : -t;
    let lo = t - 2, hi = t;
    for (let k = 0; k < FOOT_FINE; k++) { const m = (lo + hi) / 2; if (off(b.x + b.nx * m, b.y + b.ny * m) <= 0) hi = m; else lo = m; }
    return -(lo + hi) / 2;
  }
  // (a foot reaching across its stem, a flag's or a stub's, may have another stroke's side by it, a u's bowl's, which,
  // never reaching it, moves as its own stroke's: NaN)
  return F.side > 0 ? NaN : -off(b.x, b.y);
}

/** A serif's foot drawn level (withFeet), its round R as thick as it is now: a font drawn with much contrast keeps its
    serifs no thicker than its hairline as the weight keeps it (family.ts), as far as it reads so (thickShare). */
function footRound(rig: SkinRig, mv: MoveMap, R: number) {
  const { hair: h0 } = rig.ref(), t = thickShare(rig, mv, FEET_APART);
  return R + (Math.min(R, h0 * mv.weighs({ tx: 1, ty: 0, w: h0 / 2, serifDx: 0, dot: false } as Bone) / 2) - R) * t;
}

/** How much an edge's stroke thickens (thins, under 1): an upright stroke by the engine's upright weight (kv), a level
    one by its bars' (kh), as far as the edge runs either way. A font drawn with much contrast (a Didone, a fat face,
    a blackletter) is read by how thick each stroke is instead, as a stroke between its hairline and its stem, since
    its ball ends and its heavy curves run level as often as its hairlines do: its hairlines by kh, its stems and
    anything as heavy by kv, and a stroke between the two drawn as far between their new thicknesses. A serif thickens
    less than its stem the further out along it, and thins as its stem does. A dot by the stems' weight (kdot), as the
    engine's dots are drawn (lower.ts, punctuation.ts): not by the uprights' pen, which Contrast turned round thins to a
    tenth, the dots with it, an i's gone. */
function weighsOf(rig: SkinRig, kv: number, kh: number, kdot = kv, lighter = true) {
  // (a heavier weight's contrast by the font's hairline read straight across: by the one its corners wear down, a heavy
  // sans read as a font with contrast, and its strokes thickened by how thick each was read, a bar's halves either side
  // of its stem apart, Mainline's f's and t's crossbars at two heights)
  const { stem, hair, hair0 } = rig.ref(), tf = (lighter ? hair : hair0) / Math.max(1, stem);
  // (its hairlines thicken as the engine's bars do, so its own contrast is kept as a share: a Didone with less contrast
  // is still a Didone, not a monoline face at its stems' weight)
  const kHair = kh, contrasty = Math.min(1, Math.max(0, (0.8 - tf) / 0.4));
  const slab = kv >= 1 && evenSlab(rig);
  return (b: Bone) => {
    if (b.dot) return kdot;
    const k = byWeight(b);
    // (a serif thickens less than the stroke it stands on, the further out along it: by the square root of as much at
    // its tip, as a bold's serifs thicken less than its stems; it thins as they do. Not, heavier, in a font without
    // serifs, where what reads as one is a side: see edgeMoves)
    if (!(b.serifDx && k > 1 && (lighter || rig.serifed()))) return k;
    const e = 1 - 0.5 * Math.min(1, Math.abs(b.serifDx) / Math.max(1, stem * 0.6));
    // (a heavier even slab's (evenSlab), less by the stems' share alone: a level slab is
    // a bar, as thick as the bars, and its edges read past a stem as a serif's, beside its edges read as a bar's past
    // none, thickened by the bars' share less, a typewriter's Y's head serifs a step thinner inside its arms than
    // outside at Horizontals 100)
    return slab ? b.ty * b.ty * Math.pow(kv, e) + b.tx * b.tx * kh : Math.pow(k, e);
  };
  function byWeight(b: Bone) {
    const byWay = b.ty * b.ty * kv + b.tx * b.tx * kh;
    if (!contrasty) return byWay;
    // (a stroke between the two as much between them after: its thickness drawn on the line from the hairline's to
    // the stem's, so a heavy curve's swell, a ball, thickens as the stems do)
    const T = 2 * b.w, byThick = T <= hair ? kHair : T >= stem ? kv : (hair * kHair + (stem * kv - hair * kHair) * (T - hair) / (stem - hair)) / T;
    return byWay + (byThick - byWay) * contrasty;
  }
}

/** Half the thickness of the stroke each edge of the rig belongs to, as Contrast turned round weighs it (MoveMap.half,
    edgeMoves): a stem's straight upright side as read across it, a curve's as far in as its stroke's middle (Bone.best),
    the bumps where it runs into a stroke across it, end on, taken out over half the stems' thickness, either at least as
    thick as Bone.w and no thicker than a stem; an end, a corner or a dot, Bone.w. Read with the joins' bumps taken out
    over the heavier strokes' thickness (thicknessWithoutJoins), a side shorter than that between two hairlines read as
    thin as they and was thickened as one: a fat face's H's and E's stems' insides between the serifs' brackets and the
    bar or arms went out into the counter where the stems' other sides thinned in, the stem carried over whole, and its
    bowls' sides and its counters, read hairlines all round, came out lumpy. (It weighs the edge only: moved by its own
    Bone.w, a stem's side thinned as far as it reads across, an arch's root left off it, its join parted, a wood type's n.) */
function sideHalf(rig: SkinRig) {
  let kept = SIDE_HALVES.get(rig);
  if (!kept) {
    const stem = rig.ref().stem, most = stem / 2, r = Math.max(1, Math.round(most / STEP)), m = new Map<Bone, number>();
    for (const bs of rig.bones) {
      const along = opening(bs.map(b => b.best), r);
      bs.forEach((b, i) => { if (!b.dot && !b.cap && !b.corner) m.set(b, Math.max(b.w, Math.min(b.straight && Math.abs(b.nx) >= STEM_SIDE ? Math.max(b.w0, along[i]) : along[i], most))); });
    }
    SIDE_HALVES.set(rig, kept = m);
  }
  return (b: Bone) => kept!.get(b) ?? b.w;
}
const SIDE_HALVES = new WeakMap<SkinRig, Map<Bone, number>>();
/** How many samples long, at most, a crotch's flat cut is to be drawn to where its edges meet, those edges' ways read
    over FLAT_LINE samples (moveRing's flatCrotches). */
const FLAT_CROTCH = 4, FLAT_LINE = 4;
/** How near upright, its inward normal's share across, a straight edge reads as a stem's side (sideHalf). */
const STEM_SIDE = 0.98;

/** Contour `c` with each curve longer than `most` cut in pieces as long, the same curve (by de Casteljau), for skinEdges:
    its points, each one's own sample (`own`: a point's first, a cut's nearest of its curve's) and the segment of `c` each
    piece is cut from (`seg`). */
function cutCurves(c: Node[], bs: Bone[], bySeg: number[][], most: number) {
  const cn: Node[] = [], own: number[] = [], seg: number[] = [], nodes = c.map(n => ({ ...n }));
  const lerp = (p: P, q: P, t: number): P => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  c.forEach((a, i) => {
    const b = c[(i + 1) % c.length];
    cn.push(nodes[i]); own.push(bySeg[i][0]); seg.push(i);
    if (a.ox === undefined && b.ix === undefined) return;
    let p0: P = a, p1: P = { x: a.ox ?? a.x, y: a.oy ?? a.y }, p2: P = { x: b.ix ?? b.x, y: b.iy ?? b.y };
    const p3: P = b, len = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y) + Math.hypot(p3.x - p2.x, p3.y - p2.y);
    const k = Math.ceil(len / most);
    if (k < 2) return;
    // (each piece cut off the rest of the curve in turn, at its share of what is left)
    for (let m = 1; m < k; m++) {
      const t = 1 / (k - m + 1), q0 = lerp(p0, p1, t), q1 = lerp(p1, p2, t), q2 = lerp(p2, p3, t), r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t), s = lerp(r0, r1, t);
      if (m === 1) { nodes[i].ox = q0.x; nodes[i].oy = q0.y; } else { cn[cn.length - 1].ox = q0.x; cn[cn.length - 1].oy = q0.y; }
      const j = bySeg[i].reduce((best, j) => (Math.hypot(bs[j].x - s.x, bs[j].y - s.y) < Math.hypot(bs[best].x - s.x, bs[best].y - s.y) ? j : best), bySeg[i][0]);
      cn.push({ x: s.x, y: s.y, ix: r0.x, iy: r0.y, s: 1 }); own.push(j); seg.push(i);
      p0 = s; p1 = r1; p2 = q2;
    }
    cn[cn.length - 1].ox = p1.x; cn[cn.length - 1].oy = p1.y;
    const nb = nodes[(i + 1) % c.length];
    nb.ix = p2.x; nb.iy = p2.y;
  });
  return { cn, own, seg };
}

/** Each rig's outline as polygons (a few points along each curve), kept for skinEdges's reading of the ink ahead. */
const outlines = new WeakMap<SkinRig, P[][]>();
/** The rig's outline as polygons (outlines, kept). */
function outlineOf(rig: SkinRig) {
  let polys = outlines.get(rig);
  if (!polys) {
    polys = rig.contours.map(cn => cn.flatMap((a, i) => {
      const b = cn[(i + 1) % cn.length];
      return a.ox === undefined && b.ix === undefined ? [{ x: a.x, y: a.y }] : Array.from({ length: 8 }, (_, k) => bez(a, b, k / 8));
    }));
    outlines.set(rig, polys);
  }
  return polys;
}
/** How far the ink reaches from point p of the outline the way (ux, uy) goes (0 where that way leaves it). */
function inkAhead(rig: SkinRig, p: P, ux: number, uy: number) {
  const polys = outlineOf(rig), q = { x: p.x + ux * 0.5, y: p.y + uy * 0.5 };
  if (!polys.reduce((k, ring) => k !== inPoly(ring, q), false)) return 0;
  let best = Infinity;
  for (const ring of polys) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], sx = b.x - a.x, sy = b.y - a.y, den = ux * sy - uy * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den, w = ((a.x - p.x) * uy - (a.y - p.y) * ux) / den;
    if (t > 0.5 && w >= 0 && w <= 1 && t < best) best = t;
  }
  return best;
}

/** How far from p along (ux, uy) the strokes a lighter weight draws again begin (thinMoves' rounds, each as thick as its
    stroke is now). */
function thinAhead(rig: SkinRig, mv: MoveMap, p: P, ux: number, uy: number) {
  const T = rig.thin!, floor = hairFloor(rig, mv), W = strokeRs(rig, mv);
  let best = Infinity;
  for (let j = 0; j < T.x.length; j++) {
    const R = Math.max(0, W[j], Math.min(T.s[j], floor));
    const vx = T.x[j] - p.x, vy = T.y[j] - p.y, along = vx * ux + vy * uy, off = vx * vx + vy * vy - along * along;
    if (off >= R * R) continue;
    const h = Math.sqrt(R * R - off);
    if (along + h > 0) best = Math.min(best, Math.max(0, along - h));
  }
  return best;
}

/** A straight edge of a letter drawn in Points as skinEdges moves it: its ends, its inward normal, how far its start
    and end move out (in, negative), and, where it bends, the places along it (0 to 1) and how far each moves out. */
interface EdgeMove { a: P; b: P; nx: number; ny: number; da: number; db: number; bends?: { t: number; d: number }[] }

/** The straight line nearest values `v` at places `t` (0 to 1) along an edge `len` long, by least squares; or, where it
    stays further than `tol` from some of them, two bent once, or a step (two levels joined by a stretch as steep as it
    is high: a hairline's side running on into a wedge's), whichever comes a quarter nearer than the others. */
function bentLine(t: number[], v: number[], tol: number, len: number): { at: (u: number) => number; bends: number[] } {
  const worst = (at: (u: number) => number) => Math.max(...t.map((u, k) => Math.abs(at(u) - v[k])));
  const fit = (tb?: number) => {
    // (the normal equations for p + q·u, and + r·(u − tb) past tb)
    const f = (u: number) => (tb === undefined ? [1, u] : [1, u, Math.max(0, u - tb)]), m = tb === undefined ? 2 : 3;
    const A = Array.from({ length: m }, () => new Array<number>(m).fill(0)), y = new Array<number>(m).fill(0);
    t.forEach((u, k) => { const r = f(u); for (let i = 0; i < m; i++) { y[i] += r[i] * v[k]; for (let j = 0; j < m; j++) A[i][j] += r[i] * r[j]; } });
    // (by elimination, pivoting on the largest)
    for (let i = 0; i < m; i++) {
      let p = i;
      for (let j = i + 1; j < m; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
      if (Math.abs(A[p][i]) < 1e-9) return null;
      [A[i], A[p]] = [A[p], A[i]]; [y[i], y[p]] = [y[p], y[i]];
      for (let j = i + 1; j < m; j++) { const k = A[j][i] / A[i][i]; for (let c = i; c < m; c++) A[j][c] -= k * A[i][c]; y[j] -= k * y[i]; }
    }
    const co = new Array<number>(m).fill(0);
    for (let i = m - 1; i >= 0; i--) { let sum = y[i]; for (let c = i + 1; c < m; c++) sum -= A[i][c] * co[c]; co[i] = sum / A[i][i]; }
    const at = (u: number) => f(u).reduce((sum, r, i) => sum + r * co[i], 0);
    return { at, bends: tb === undefined ? [] : [tb], worst: worst(at) };
  };
  const one = fit();
  if (!one) { const d = v.slice().sort((p, q) => p - q)[v.length >> 1]; return { at: () => d, bends: [] }; }
  if (one.worst <= tol || t.length < 6) return one;
  let best: { at: (u: number) => number; bends: number[]; worst: number } = one;
  const nearer = (c: typeof best | null) => { if (c && c.worst <= best.worst * 0.75) best = c; };
  // (where it bends or steps tried at no more than BEND_TRIES places along it)
  const tries = Array.from(new Set(Array.from({ length: BEND_TRIES }, (_, i) => 2 + Math.round(i * (t.length - 5) / (BEND_TRIES - 1))))).filter(k => k >= 2 && k < t.length - 2);
  let hinge: typeof best | null = null;
  for (const k of tries) { const h = fit(t[k]); if (h && (!hinge || h.worst < hinge.worst)) hinge = h; }
  nearer(hinge);
  const mid = (w: number[]) => w.slice().sort((p, q) => p - q)[w.length >> 1];
  let step: typeof best | null = null;
  for (const k of tries) {
    const lo = mid(v.slice(0, k)), hi = mid(v.slice(k)), w = Math.min(0.3, Math.abs(hi - lo) / Math.max(1, len)) / 2, tk = (t[k - 1] + t[k]) / 2;
    if (tk - w <= 0 || tk + w >= 1) continue;
    const at = (u: number) => (u <= tk - w ? lo : u >= tk + w ? hi : lo + (hi - lo) * (u - tk + w) / (2 * w)), s = { at, bends: [tk - w, tk + w], worst: worst(at) };
    if (!step || s.worst < step.worst) step = s;
  }
  nearer(step);
  return best;
}

/** A stroke's end, cut across it (not a stem's foot on a line): it stays where it is as the sides either side move. */
const crossEnd = (b: Bone) => b.cap && !b.lineCap;

/** Contour r's stroke ends as move mv carries them: a lighter weight's, but a ball's, only the turn itself (EndRun.ca, cb),
    the outline curving on round into it going in as sides do, which carried whole would go as the end does, out of
    true with the thinner stroke. */
const endsOf = (rig: SkinRig, r: number, mv: MoveMap) => (mv.lighter ? rig.ends[r].map(e => (e.ball || e.ca === undefined ? e : { ...e, a: e.ca, b: e.cb! })) : rig.ends[r]);

/** How far each sample of one contour of the rig (contour r, its samples bs) moves out (in, lighter, negative) as its
    stroke thickens or thins (`moved`), how much its stroke thickens (k0, before easing), and the room a dot has to
    grow. */
function edgeMoves(bs: Bone[], r: number, mv: MoveMap, rig?: SkinRig) {
  const { weighs, keeps } = mv, end = crossEnd;
  if (rig && mv.lighter) {
    const { k0, delta, crotches, pins, footed, hug, hugY, fine, cuts } = thinMoves(rig, bs, r, mv);
    // (as its uprights thin apart from the bars (Verticals 0, MoveMap.apart), an edge lying level on a line across an upright
    // stroke's end, its middle running upright there, LINE_UPRIGHT (the sine) or more, stays on it, as the heights would put
    // it back: a soft slab's h's ascender's top, read on past its head serif as its stem's side, went down with the stem's
    // thinning and its corner with it, and the heights, lifting it back, stood a spike over the stem and an ear past it.
    // Not one along a stroke lying on the line, a fat face's 2's foot, which thins as its thickness says)
    if (mv.apart > 0) bs.forEach((b, i) => { const j = rig.thin?.near[r][i] ?? -1; if (b.onLine && !b.corner && Math.abs(b.ny) > 0.97 && j >= 0 && Math.abs(rig.thin!.ty[j]) > LINE_UPRIGHT) delta[i] = 0; });
    // (a level foot's samples as they reach it: eased, a leaning leg's bracket's, its rays running 40 to 100 units in
    // within a few samples, stopped short of it, a wedge under the leg, Almanac's K's)
    // (and, its uprights thinned apart from the bars, over APART_EASE of its stems as far as they so thin: read stroke by
    // stroke, a sample by a join took its stem's thinning and the next its arch's, a knee under a typewriter's h's, n's and
    // r's arches at Verticals 0, and a blackletter's W, G and R left crumbs of ink apart; eased further, its K's, W's and o's
    // joins parted, mended, a third slower)
    const wide = mv.apart > 0 && !mv.contrasty ? Math.max(3, Math.round(APART_EASE * rig.ref().stem * mv.apart / STEP)) : 3;
    const moved = bs.map((b, i) => b.corner || footed[i] ? delta[i] : ease(delta, bs, i, j => !bs[j].corner && end(bs[j]) === end(b), wide));
    return { dotRoom: bs[0]?.dot ? Math.min(...bs.map(b => b.gap)) * OPEN : Infinity, k0, moved, rooms: null as number[] | null, slide: null as P[] | null, slid: null as number[] | null, crotches, pins, hug, hugY, fine, cuts, orphans: [] as EndRun[] };
  }
  // how far each edge moves out (in, lighter): its stroke's change of thickness on this side, a stem's by
  // Weight, a bar's by Contrast too; a stroke's end, which runs across it, stays. An edge across a counter from another
  // grows into it no more than OPEN_HEAVY of its width, so a heavier letter's counters stay open, as the engine's do, being
  // drawn wider as they get heavier; a dot grows evenly all round, as little as its nearest neighbour leaves room for
  const dotRoom = bs[0]?.dot ? Math.min(...bs.map(b => b.gap)) * OPEN : Infinity;
  // a heavier letter's serif goes out with the edge of the stem it stands on, which moves out as far as its stroke
  // thickened (no further into a counter than OPEN_HEAVY of it), so the serif reaches as far past the stem as before and isn't
  // swallowed by it; and it thickens away from its line, as far as its edge runs level. Both are read along the
  // edge's own normal, so a bracket's edge goes as the stem's beside it does. (A lighter one's thins round its stem as
  // its stem does.)
  // (a reweighed letter's head serifs drawn as flags too, which slide as serifs do, below; and in a font without serifs, a
  // heavier weight's edge read as a serif's, a script's stroke curving in along the baseline, a round's foot running on past
  // its stem, is moved as a side: moved as a serif, out with a stem's side and level off its line, its edges stood off
  // their neighbours' by steps, a ragged hole in a Chancery's A's counter at Weight 100)
  const flags = !!rig && weighed(mv) && mv.kv > 1 && !bs[0]?.dot, unserifed = flags && !rig!.serifed(), dxOf = (b: Bone) => (unserifed ? 0 : b.serifDx || (flags ? b.flagDx : 0));
  // (its serifs read cupped (serifLinedRig) slid in by CUP_RAMP of the stems' growth from where it is first so rigged: at
  // once, a Didone's H took 7 units more room in a hundredth of Weight)
  const cupIn = rig?.cupped ? Math.min(1, Math.max(0, (mv.kv - 1 - REWEIGHED) / CUP_RAMP)) : 1;
  const serifOut = (b: Bone) => Math.sign(dxOf(b)) * Math.min((mv.kv - 1) * b.serifStem / 2, openOf(b.serifRoom, b.serifStem / 2)) * cupIn;
  // (how much each edge's stroke thickens, eased along the outline a stroke's width or so, as where a curve turns from
  // upright to level the edge's own heading wavers, more so where it runs into a join)
  // (no stroke thinner than the font's hairline as the bars now are, HAIR_FLOOR of it, unless drawn thinner: a serif's
  // tip, thinner than the hairline, thinned as the bars do, came to a point, and Contrast 100 drew an old style's
  // bracketed serifs as wedges, a fat face's beaks as needles, a Didone's arms' serifs apart from them; not Pinch's
  // thinning, which keeps leave as they are. The hairline as a level stroke as thick is weighed: a contrasty font's
  // bars thin less than Horizontals' share, by their thickness. Only as the bars thin and the stems don't: reversed,
  // Contrast's thin strokes are its stems)
  const hair = rig && weighed(mv) && mv.kh < 1 && mv.kv >= 1 ? rig.ref().hair : 0;
  const hairNow = hair > 0 ? HAIR_FLOOR * hair * weighs({ tx: 1, ty: 0, w: hair / 2, serifDx: 0, dot: false } as Bone) : 0;
  // (a heavier weight's side by a stroke's end its stroke's thickness as read past it, where read straight across it
  // leaves through the end, and a straight side's as read along it all: sideWs)
  const ws = rig && linesMove(rig, mv) ? sideWs(rig, r) : null, wg = ws ? SIDE_GROWN.get(bs) : null, W = (b: Bone, i: number) => (!ws || (wg?.[i] && weighs(b) < 1) ? b.w : ws[i]);
  // (and in a font without serifs no serif: a sans's K's arm's side by its end, read as reaching past its stroke on the
  // capitals' line, went out with a serif's move, a hook under the arm's top)
  const serif = (b: Bone) => (rig && mv.reweighed && !rig.serifed() ? 0 : b.serifDx);
  // (Contrast turned round, its strokes weighed as read whole: MoveMap.half)
  const k0 = bs.map((b, i) => {
    const h = mv.half(b), w = h === b.w ? W(b, i) : h, kw = h === b.w ? w : b.w, k = weighs(w === b.w && serif(b) === b.serifDx ? b : { ...b, w, serifDx: serif(b) });
    return (k < 1 && hairNow > 0 && kw > 0 ? Math.max(k, Math.min(1, hairNow / (2 * kw))) : k) * keeps(b, r, i);
  });
  // (a few samples read as on a stroke's end, ORPHAN_SHORT or fewer in a row, in none of the ends the outline's were found
  // for, two at the round foot of a comic's v, move as a side does: kept still as an end, and carried with none, they hung
  // a needle under the v as its strokes thinned. A longer run stays, as an end: a slab's p's stem's top standing past its
  // arch, its side moved out, opened a slit down into the crotch)
  const n = bs.length, inRun = new Uint8Array(n);
  for (const { a, b } of rig?.ends[r] ?? []) for (let q = a; q <= b; q++) inRun[((q % n) + n) % n] = 1;
  const orphans: EndRun[] = [];
  if (rig) for (let q = 0; q < n; q++) {
    if (inRun[q] || !end(bs[q]) || end(bs[(q - 1 + n) % n]) && !inRun[(q - 1 + n) % n]) continue;
    let e = q;
    while (e - q < n && end(bs[e % n]) && !inRun[e % n]) e++;
    if (e - q > ORPHAN_SHORT) { for (let k = q; k < e; k++) inRun[k % n] = 2; orphans.push({ a: q - 1, b: e, ball: 0, pin: 0.5 }); }
  }
  const endAt = (q: number) => end(bs[q]) && (!rig || !weighed(mv) || inRun[q] > 0);
  // (Contrast turned round: nor along an edge read no thickness across, a stem's foot cut square, its round corners read to
  // nothing, unmoved as an end is: eased into it, the stem's sides thinned less and less down to it, a trumpet's bell under
  // a hairline stem)
  const bare = (j: number) => mv.reweighed && mv.kv < 1 - REWEIGHED && bs[j].w < 1;
  const ks1 = bs.map((b, i) => b.corner || endAt(i) ? k0[i] : ease(k0, bs, i, j => !bs[j].corner && !endAt(j) && (!bare(j) || bare(i)), 6));
  // (a flat cut across where strokes meet stays, as a stroke's end does, its corners where the strokes' sides meet it
  // again: not a bar's side, Horizontals doesn't move it)
  const cuts = rig && weighed(mv) ? flatCuts(rig) : null;
  // (but an edge across from another it meets at a crotch, the two running together to it, grows into the paper between as
  // far as its stroke thickens: the crotch goes out along between them, as strokes thickened into each other meet, and
  // the overlap past where their edges now cross is cut off (untangle). Held to OPEN of the paper there, a heavy stem's
  // side over an arch leaving it at a slant stood a hair off the arch's top, a crack up the shoulder of Mainline's h)
  const vee = rig && veesGrow(rig, mv) ? veeOf(rig, r) : null;
  // (a reweighed letter's serif slid out across the page with its stem's side: read along each edge's own normal alone, a
  // level underside went down rather than out, and the serif's end, carried with its sides, out by as little as they
  // went, so a stem thickened threefold swallowed its serifs, an old style's E's head serif a stub past its stem, its
  // underside run together into a point. Each serif, its samples in a row reaching out the one way and the end between
  // them, slides at its root as its stem's side goes and at its tip as far as the least room beside any of them, or ahead
  // of its end, lets it, made shorter between by how far each reaches out; its root no further than SERIF_SHORTER of its
  // reach past where its tip goes, the stem's side going on over it. Each as its own room let it, an inside serif's root,
  // the counter wide beside it, went out past its tip, the room beside it a third as wide, and two facing across an H's
  // counter ran into a knot; slid as one by that least room, its bracket stood back off its stem a notch; and by the room
  // beside its edges alone, a typewriter's H's feet's round ends, a few units apart across the counter's foot, ran into
  // one another. The share of the slide along each edge is `slide`, the rest goes along its normal as before; along it
  // only as far as the sample reaches out past its stem, wholly from SERIF_RAMP of the stem's thickness on, so a bracket
  // goes from moving as the stem's side does to sliding as its serif does without a step: wholly from the first sample
  // read as the serif's, its bracket's point beside it lifting along its normal and the serif's own not, a notch at each
  // foot's bracket)
  const slid = flags && bs.some(b => dxOf(b));
  const out = bs.map(b => (dxOf(b) ? serifOut(b) : 0)), rootNear = new Float64Array(n), sharp = new Uint8Array(n), head = new Uint8Array(n), bridge = new Uint8Array(n);
  if (slid) {
    const { side, atEnd, runs } = serifRuns(rig, r), halves: [number, number, number][] = [];
    // (in a font of bracketed serifs and some contrast (fairFont), its root no further out than its stem's own side
    // moves, read on the upright straight side either side of the serif: its stem read across the serif's bracket, a
    // little way up, reads thicker, and the serif and the stem's side beside it, slid out further than the stem's side
    // above it went, stood out a step at each bracket of a transitional's H at Weight 100)
    const fair = fairFont(rig!), sideMove = (s0: number, e: number) => {
      let m: number | null = null;
      for (const [from, dir] of [[s0, -1], [e - 1, 1]] as const) for (let k = SERIF_NEAR + 1; k <= SERIF_NEAR + SIDE_LOOK; k++) {
        const j = (((from + dir * k) % n) + n) % n, q = bs[j];
        if (side[j] || dxOf(q) || q.corner || endAt(j)) break;
        if (q.straight && Math.abs(q.nx) >= STEM_SIDE) { const d = (ks1[j] - 1) * W(q, j); m = m === null ? d : Math.max(m, d); break; }
      }
      return m !== null && m > 0 ? m : null;
    };
    for (let j = 0; j < n; j++) if (side[j] && !dxOf(bs[j])) bridge[j] = 1;
    for (const { s0, e, sg } of runs) {
      // (read on a stroke far thicker than the one its root runs on from, SERIF_OTHER of it or less, out no further than that
      // side moves: a Didone's N's top left serif, read past its thick diagonal carried up to the line, slid out with it as
      // far as it thickened, 53 units, its hairline stem's side beside it 5, a lump torn off the stem's top)
      let rootAt = s0, rd = Infinity;
      for (let k = 0, j = s0; k < n && j !== e; k++, j = (j + 1) % n) { const d = Math.abs(dxOf(bs[j])); if (d && d < rd) { rd = d; rootAt = j; } }
      // (that stroke read as thick as the sides read at most within SERIF_NEAR samples on from either end of the run: a
      // bracket reads as thin as its serif, and a head serif's run, its top and its foot, has a root at each end)
      const by = rootAt === s0 ? (s0 - 1 + n) % n : e, stem = bs[rootAt].serifStem;
      let sw = 0;
      for (let k = 0; k < SERIF_NEAR; k++) sw = Math.max(sw, bs[(s0 - 1 - k + 2 * n) % n].w, bs[(e + k) % n].w);
      if (mv.contrasty && !dxOf(bs[by]) && !bs[by].corner && sw > 0 && 2 * sw <= SERIF_OTHER * stem) {
        const most = Math.max(0, (ks1[by] - 1) * sw);
        for (let k = 0, j = s0; k < n && j !== e; k++, j = (j + 1) % n) if (Math.abs(out[j]) > most) out[j] = Math.sign(out[j]) * most;
      }
      // (its tip where its end begins, which goes with the sides it joins there)
      let least = Infinity, reach = 0, tipAt = Infinity, root = 0, nearest = Infinity, far = s0;
      for (let k = 0, e = s0; k < n && side[e] === sg; k++, e = (e + 1) % n) {
        const b = bs[e], d = Math.abs(dxOf(b));
        if (!d) { if (-b.nx * sg > 0.5) least = Math.min(least, openOf(b.gap, b.w)); continue; }
        least = Math.min(least, Math.abs(out[e]));
        if (d > reach) { reach = d; far = e; }
        if (atEnd[e]) tipAt = Math.min(tipAt, d);
        if (d < nearest) { nearest = d; root = Math.abs(out[e]); }
      }
      if (!reach) continue;
      // (in a contrasty font, its tip no further into the paper ahead of it, along the way it reaches, than OPEN of it: its
      // tip's samples face up and down off it, not ahead, and a Didone's m's and n's feet's tips, 28 units apart across
      // the counter's foot, slid into one another at Verticals 100, the counter shut)
      if (mv.contrasty) least = Math.min(least, OPEN * tipAhead(rig!, bs, s0, e, sg, atEnd));
      if (fair) { const sm = sideMove(s0, e); if (sm !== null) root = Math.min(root, sm); }
      least = Math.min(least, root);
      const at = Math.min(root, least + SERIF_SHORTER * reach), tip = Math.min(reach, tipAt);
      for (let j = s0; j !== e; j = (j + 1) % n) out[j] = sg * (at + (least - at) * (dxOf(bs[j]) ? Math.min(1, Math.abs(dxOf(bs[j])) / Math.max(1, tip)) : 1));
      // (its edges from a root cut with a corner slide wholly: the corner goes as the stem's side and the serif's edge,
      // each moved its own way, meet)
      const cut = (i: number, j: number) => bs[i].corner || bs[j].corner;
      if (cut((s0 - 1 + n) % n, s0)) for (let j = s0; j !== far; j = (j + 1) % n) sharp[j] = 1;
      if (cut(e, (e - 1 + n) % n)) for (let j = far; j !== e; j = (j + 1) % n) sharp[j] = 1;
      halves.push([s0, far, e]);
      // (and the stem's side either side of it, where it runs into the serif's bracket, out at least as far as the root
      // goes: read across the bracket, its stroke reads thinner there and moved less, a dent where the bracket begins)
      // (in a contrasty font, only beside the run's end at its root, not past one ending at the serif's tip: a Didone's n's
      // foot serif's run along its top, ended at its tip, pushed the tip's own points out by the root's slide, across the
      // counter's foot)
      const atRoot = (j: number) => !mv.contrasty || Math.abs(dxOf(bs[j])) < SERIF_TIPWARD * reach;
      for (let k = 1; k <= SERIF_NEAR; k++) for (const [j, by] of [[(s0 - k + n) % n, s0], [(e - 1 + k) % n, (e - 1 + n) % n]]) if (!side[j] && atRoot(by) && Math.abs(rootNear[j]) < root) rootNear[j] = sg * root;
    }
    // (a stem's end at a line, across it from a serif, a flag or its side to another, drawn across the stem again as it
    // widens: each point slid across as far between how far the two either side went as it lies across the stem, and not
    // thickened, as an end isn't: moved along its normal, an old style's h's slanting head, wider, rose off the ascender
    // at its stem's right, and slid at its flag and not across its stem, a notch in its top where the two met)
    const sideways = (j: number) => { const q = bs[j]; if (dxOf(q)) return out[j]; const d = (ks1[j] - 1) * q.w; return -q.nx * (d > 0 ? Math.min(d, openOf(q.gap, q.w)) : d); };
    const beside = (j: number, dir: number): number | null => { for (let k = 0; k < 2; k++, j = (j + dir + n) % n) { const q = bs[j]; if (dxOf(q) || (!q.corner && Math.abs(q.nx) > HEAD_SIDE)) return sideways(j); if (!q.corner) return null; } return null; };
    for (let s0 = 0; s0 < n; s0++) {
      if (bs[s0].overStem < 0 || bs[(s0 - 1 + n) % n].overStem >= 0) continue;
      let e = s0, lo = Infinity, hi = -Infinity;
      for (let k = 0; k < n && bs[e].overStem >= 0; k++, e = (e + 1) % n) { lo = Math.min(lo, bs[e].overStem); hi = Math.max(hi, bs[e].overStem); }
      if (lo > HEAD_SPAN || hi < 1 - HEAD_SPAN) continue;
      const before = beside((s0 - 1 + n) % n, -1), after = beside(e, 1);
      if (before === null || after === null) continue;
      const [hl, hr] = bs[s0].overStem < 0.5 ? [before, after] : [after, before];
      for (let j = s0; j !== e; j = (j + 1) % n) { out[j] = hl + (hr - hl) * Math.min(1, Math.max(0, bs[j].overStem)); head[j] = 1; rootNear[j] = 0; }
    }
    // (and a serif's edge running on from such an end slides wholly, as the end does)
    for (const [s0, far, e] of halves) {
      if (head[(s0 - 1 + n) % n]) for (let j = s0; j !== far; j = (j + 1) % n) sharp[j] = 1;
      if (head[e]) for (let j = far; j !== e; j = (j + 1) % n) sharp[j] = 1;
    }
  }
  // (and, moved as lines, a heavier weight's in a font without serifs, an edge along a line stays on it: moved out as its
  // stroke thickened, an Industrial v's arm's top, an end its outline's turns read none for, went up past the x-height, and
  // the letter, its heights kept, came down with it, its corners off the line)
  const lined = !!rig && linesMove(rig, mv), onLine = (b: Bone) => lined && b.onLine;
  // (and, moved as lines, an edge inside a counter by a corner its gap runs across to the edge beyond, as far as the edge
  // further from the corner may: counterVees)
  const cv = rig && linesMove(rig, mv) ? counterVees(rig, r) : null;
  // (a near even font's straight edges' thickness eased along them, where not read along them as lines: evenWs)
  const ews = rig && !ws && mv.reweighed && mv.kv > 1 + REWEIGHED && evenFont(rig) ? evenWs(bs, ks1, j => bs[j].straight && !bs[j].corner && !endAt(j)) : null;
  const glides = slid && mv.contrasty, glide = new Uint8Array(n);
  // (a fair font's serif's level top or underside thickens as the serif does, read no thicker than SERIF_TOP of its
  // hairline: read down through the thick stroke under it, an italic N's serif's top over its diagonal stood a bump ten
  // units high at Weight midway)
  // (and any level edge so, a stroke's end cut level read down through it: an italic M's thick diagonal's top, moved up as
  // far as the diagonal thickened, stood a spike over its cap line at Weight 100)
  // (only as it reads thicker than SERIF_THICK[0] of its hairline, all of it by SERIF_THICK[1], and as it faces level
  // within SERIF_LEVEL, coming in over SERIF_LEVEL_RAMP: read so at an old style's n's, m's and h's arches' tops, read in
  // part as serifs and their own strokes no more than a hairline thick, each sample thickened as it read or as the cap
  // let it, the tops came out in steps at Weight 100)
  const hair0 = rig ? rig.ref().hair0 : 0, topCap = rig && fairFont(rig) ? SERIF_TOP * hair0 : Infinity;
  const level = (b: Bone, w: number) => {
    if (w <= topCap) return w;
    const t = Math.min(1, Math.max(0, (w - SERIF_THICK[0] * hair0) / ((SERIF_THICK[1] - SERIF_THICK[0]) * hair0))) * Math.min(1, Math.max(0, (Math.abs(b.ny) - SERIF_LEVEL) / SERIF_LEVEL_RAMP + 1));
    return w + (topCap - w) * t;
  };
  // (and a contrasty font's level edge by a line it faces out across, running across its stroke more than along it, CUT_WAY
  // or more: the stroke's end cut along the line, which stays as a stroke's end does. Read across it, a Didone's N's top,
  // over its thick stroke, read 90 units thick and went up 40, and the heights, lowering the whole top by as much, pulled
  // its top left serif down off the capitals' line)
  const cutOn = rig && mv.reweighed && mv.kv > 1 + REWEIGHED && mv.contrasty ? lineCuts(rig, r) : null;
  // (Contrast turned round, in a font without serifs, each edge thinned by its stroke as read whole (MoveMap.half), by as
  // much more than its own Bone.w eased along the outline over half a stem, no more than its own: by Bone.w alone, read
  // with the joins' bumps taken out round a counter joins shut all round, a two-storey a's bowl's and stem's insides
  // thinned half as far as their outsides, the a left as heavy again as the n beside it; eased on past its own, a 9's
  // bowl's side, a hairline, thinned through where it meets the tail and opened the counter)
  const more = rig && mv.reweighed && mv.kv < 1 - REWEIGHED && (plainSans(rig) || (untrapped(rig) && fontPen(rig.font))) ? bs.map((b, i) => (b.corner ? 0 : Math.max(0, mv.half(b) - W(b, i)))) : null;
  const lift = more?.some(v => v > 0) ? (() => { const R = Math.max(3, Math.round(rig!.ref().stem / 2 / STEP)); return bs.map((b, i) => (b.corner ? more[i] : Math.min(more[i], ease(more, bs, i, j => !bs[j].corner, R)))); })() : null;
  // (a heavier sans's curves, in a font of little contrast drawn with a rule (fontPlumb), each moved by its stroke's
  // thickness eased along them over half a stem: read sample by sample, a d's bowl's top reading half the stem's
  // thickness and its side by the stem the stem's, its counter's round moved by half as much as the stem's side it runs
  // into, it stood past that side into the stem, a notch inside where the bowl meets the stem at Weight 100, a q's, a b's)
  const plumb = rig && mv.reweighed && mv.kv > 1 + REWEIGHED && !rig.serifed() && rig.ref().hair0 >= LINES_EVEN * rig.ref().stem && fontPlumb(rig.font);
  const wv = plumb ? bs.map((b, i) => W(b, i)) : null, R = plumb ? Math.max(3, Math.round(rig!.ref().stem / 2 / STEP)) : 0;
  const we = wv ? bs.map((b, i) => (b.corner || b.straight || endAt(i) ? wv[i] : ease(wv, bs, i, j => !bs[j].corner && !bs[j].straight && !endAt(j), R))) : null;
  const raw = bs.map((b, i) => {
    if (endAt(i) || cuts?.has(b) || onLine(b) || cutOn?.[i]) return 0;
    const k = ks1[i], w = (ews ? ews[i] : we ? we[i] : W(b, i)) + (lift ? lift[i] : 0);
    if (glides && rootNear[i] && !b.corner && !dxOf(b) && !head[i] && !bridge[i] && -b.nx * rootNear[i] > (k - 1) * w) { glide[i] = 1; return -b.nx * rootNear[i]; }
    // (a contrasty font's serif, a level hairline, thickening as the bars do: by its root, read across into its stem and
    // weighed as the stem, a Didone's serif's bracket went out 9 units further than its stem's side, a bump on each foot)
    const ks = (dxOf(b) || bridge[i]) && mv.contrasty ? Math.min(k, mv.kh) : k;
    return head[i] ? -b.nx * out[i] : (dxOf(b) || bridge[i]) && mv.kv > 1 ? -b.nx * out[i] + (b.onLine ? 0 : (ks - 1) * level(b, w) * b.ny * b.ny) : rootNear[i] && !b.corner ? Math.max((k - 1) * (mv.kv > 1 ? level(b, w) : w), -b.nx * rootNear[i]) : (k - 1) * (mv.kv > 1 ? level(b, w) : w);
  });
  // (and a round running on from such an edge, facing out across its line as the edge does, out no further than the line:
  // a D's bowl's top, moved out as its stroke thickened while the bar's edge it leaves stayed, stood a bump over the line
  // there, and the heights, lowering the whole top by as much, left the bar's inside a step under the bowl's)
  if (lined) {
    const c = rig!.ctx;
    for (const L of [0, c.cap, ...(c.lower ? [c.xh, c.asc, c.desc] : [])]) {
      const top = L > 0, faces = (b: Bone) => (top ? -b.ny : b.ny) > 0.5 && Math.abs(b.y - L) < ROUND_ON_LINE * c.cap;
      const seed = bs.map(b => b.onLine && Math.abs(b.y - L) < 2.5 && faces(b));
      if (!seed.some(Boolean)) continue;
      const near = new Uint8Array(n);
      for (let i = 0; i < n; i++) if (seed[i]) for (const d of [-1, 1]) for (let j = (i + d + n) % n; !seed[j] && !near[j] && !bs[j].corner && faces(bs[j]); j = (j + d + n) % n) near[j] = 1;
      for (let i = 0; i < n; i++) if (near[i] && raw[i] > 0) raw[i] = Math.min(raw[i], Math.max(0, (top ? L - bs[i].y : bs[i].y - L) / Math.abs(bs[i].ny)));
    }
  }
  // (a contrasty font's growing into a V of paper no further than the stroke across's other side: a Didone's M's thick
  // stroke, steep, grown past its hairline stem at Verticals 100, stood out beside its serif a flag; held so only where it
  // gets there, the rest as free as before, or an N's and a V's sides, held short of a hairline that grows too, bent)
  const vr = vee && mv.contrasty ? veeRooms(rig!, r) : null, capped = vr ? raw.map((d, i) => !!vee![i] && d > vr[i]) : null;
  const room = (b: Bone, i: number) => (b.dot ? dotRoom : vee?.[i] ? (capped?.[i] ? vr![i] : Infinity) : (cv && cv[i] >= 0 ? openOf(bs[cv[i]].gap, bs[cv[i]].w) : openOf(b.gap, b.w)));
  // (and a heavier weight's edge goes out no further than SLOPE_HELD more than the edge beside it, by the unit along the
  // outline: each moved by its own stroke as read there and held to its own room, a hairline read thinner each sample to its
  // tip, a side across from ink reading its room to it and the next past it none, went out by steps, its outline ragged: a
  // script's ascenders' tapered tops torn and its crossing strokes notched where their rooms change, an italic's stem
  // stepped where it passes its hook's tip. Held where its own stroke thins, then where its room does, among edges facing
  // ink; and where an edge facing a stroke's end (endFacing) runs on into those facing none, those as far as SLOPE_PAST
  // (held on from any edge facing ink, a geometric b's stem stood off its bowl in a wedge). Not round a corner, a stroke's
  // end or a dot, nor through a crotch's round, turning away from the ink SLOPE_CROTCH degrees a sample or more, nor
  // within SLOPE_SERIF samples of a serif, moved as their own)
  const held = rig && mv.reweighed && mv.kv > 1 + REWEIGHED ? heldOwn(rig, r, endAt) : null;
  // (a serif slid with its stem, a flag, a stem's head drawn across it again and a bracket's edge are moved as their own too;
  // and a round pen's stroke's end, which moveRing carries whole with its sides: held by its round's own moves, less and
  // less out toward its tip, a comic's H's stems' sides went out less and less down to their feet, a step at the bar)
  const pen = !!rig && fontPen(rig.font), own = held ? held.own.map((o, i) => o || (pen && inRun[i] === 1) || (slid && (!!head[i] || !!bridge[i] || !!dxOf(bs[i])))) : undefined;
  if (held) heldBySlope(raw, held.step, own!, SLOPE_HELD);
  const delta = raw.map((d, i) => (d > 0 ? Math.min(d, room(bs[i], i)) : d));
  if (held) {
    const faces = bs.map((b, i) => !vee?.[i] && isFinite(room(b, i))), ends = endFacing(rig!, r), past = own!.map((o, i) => o || (faces[i] && !ends[i]));
    // (and, in a contrasty font, the edge growing into a V of paper (veeRooms) held as one facing ink, so it comes out of the
    // edge beside it held to OPEN of the paper by degrees: a Didone's K's stem's side, its bracket so held 25 units short of
    // it, a notch by its foot at Verticals 100)
    heldBySlope(delta, held.step, own!, SLOPE_HELD, faces.map((f, i) => !f && !capped?.[i]));
    heldBySlope(delta, held.step, past, SLOPE_PAST, faces);
  }
  // (nor with a contrasty font's hairline tip, carried whole (hairTips): its samples' normals, read across to each other's
  // sides, move them in, and eased with them the Didone's W's top serif's underside went up into its top, a crack)
  const tips = rig && mv.reweighed && mv.contrasty ? hairTipMarks(rig, r) : null;
  const keepAt = (b: Bone, i: number) => (j: number) => !bs[j].corner && endAt(j) === endAt(i) && bare(j) === bare(i) && onLine(bs[j]) === onLine(b) && (!tips || !tips[j] === !tips[i]);
  // (a heavier sans's curves, in a font of little contrast drawn with a rule (fontPlumb), eased over as far along them as
  // they move out, a sample for every STEP: each read across its own stroke, a geometric b's counter's side, its bowl
  // reading 20 units thick where it leaves the stem and 30 where it runs into it, went in by two steps, a bump on the
  // stem's side inside the bowl at Weight 100; a humanist d's two; and as far as they move in, Contrast turned round: a
  // humanist n's arch's inside, its stroke read 22 units thick where it leaves the stem and 38 where it runs into it, a
  // knot where it meets its hairline stem at Contrast 0)
  const along = rig && mv.reweighed && (mv.kv > 1 + REWEIGHED ? !rig.serifed() && rig.ref().hair0 >= LINES_EVEN * rig.ref().stem && fontPlumb(rig.font) : mv.kv < 1 - REWEIGHED && plainSans(rig));
  let moved = bs.map((b, i) => {
    if (b.corner) return delta[i];
    const keep = keepAt(b, i);
    return along && !b.straight ? ease(delta, bs, i, j => keep(j) && !bs[j].straight, Math.max(3, Math.min(n >> 3, Math.round(Math.abs(delta[i]) / STEP)))) : ease(delta, bs, i, keep);
  });
  // (and a heavier weight's in a font of bracketed serifs and some contrast (fairFont), eased again over as far along the
  // outline as FAIR_REACH times each moves, by no more than FAIR_SHARE of its own move either way (eased further, a
  // thin stroke between two thick ones, the neck of an old style's g, thinned to a crack, or thickened, an italic's q's
  // bowl into its stem) and no further into a counter than before: eased over a few samples, a
  // stroke read thicker or thinner sample by sample as it curves into a join went out by as much more or less, and an old
  // style's bowls and counters came out wavy at Weight 100, its stems three times as thick, a d's counter's side and an
  // n's shoulder an S. Not by or onto a sample moved as its own (heldOwn), nor a serif slid with its stem: eased into
  // them, its stems bowed out between their serifs)
  if (rig && held && fairFont(rig)) {
    // (each sample's kind, the samples eased together alike: -1 not eased)
    const kind = bs.map((b, j) => (b.corner || own![j] || dxOf(b) || head[j] || bridge[j] || rootNear[j] ? -1 : (endAt(j) ? 1 : 0) | (bare(j) ? 2 : 0) | (onLine(b) ? 4 : 0))), m0 = moved;
    moved = bs.map((b, i) => {
      if (kind[i] < 0) return m0[i];
      const reach = Math.max(3, Math.round(FAIR_REACH * Math.abs(m0[i]) / STEP)), w = bell(reach);
      let sum = m0[i], ws = 1, edge = Infinity;
      for (const dir of [-1, 1]) for (let k = 1; k <= reach; k++) { const j = (((i + dir * k) % n) + n) % n; if (kind[j] !== kind[i]) { edge = Math.min(edge, k); break; } sum += m0[j] * w[k]; ws += w[k]; }
      // (by no more and no more within FAIR_FADE samples of where the samples eased together end, eased by none beside
      // it: eased right up to it, beside samples not eased, an old style's arches' tops, read part as serifs, stepped)
      const e = Math.min(1, (edge - 1) / FAIR_FADE), c0 = Math.min(m0[i] + FAIR_SHARE * Math.abs(m0[i]), Math.max(m0[i] - FAIR_SHARE * Math.abs(m0[i]), sum / ws)), c = m0[i] + (c0 - m0[i]) * e;
      return c > 0 ? Math.min(c, Math.max(m0[i], room(b, i))) : c;
    });
  }
  const slide = slid ? bs.map((b, i) => { if (glide[i]) return { x: rootNear[i] * b.ny * b.ny, y: -rootNear[i] * b.nx * b.ny }; const f = head[i] || sharp[i] || bridge[i] || (glides && dxOf(b)) ? 1 : !dxOf(b) ? 0 : Math.min(1, Math.abs(dxOf(b)) / Math.max(1, SERIF_RAMP * b.serifStem)); return { x: f * out[i] * b.ny * b.ny, y: -f * out[i] * b.nx * b.ny }; }) : null;
  return { dotRoom, k0, moved, rooms: bs.map((b, i) => (raw[i] > 0 ? room(b, i) : Infinity)), slide, slid: slid ? out : null, crotches: undefined as Map<number, Crotch> | undefined, pins: undefined as Map<number, P> | undefined, hug: null as Float64Array | null, hugY: null as Float64Array | null, fine: undefined as number[] | undefined, cuts: undefined as number[][] | undefined, orphans: mergedEnds(orphans, bs) };
}

/** Contour r's serifs, flags too (edgeMoves, snapFlatEdges): each run of samples reaching out past their stem the one way, from
    `s0` up to but not `e`, `sg` the way (-1 left, 1 right), the samples of an end between two of its own taken in;
    `side` each sample's way, 0 off any, and `atEnd` whether it lies in such an end. Read once a rig. */
function serifRuns(rig: SkinRig, r: number) {
  const bs = rig.bones[r];
  let got = SERIF_RUNS.get(bs);
  if (got) return got;
  const n = bs.length, side = Int8Array.from(bs, b => Math.sign(b.serifDx || b.flagDx)), atEnd = new Uint8Array(n), runs: { s0: number; e: number; sg: number }[] = [];
  // (an end's sides read as the serif's within END_GAP samples of it: the samples by a long serif's tip, the ink along their
  // row reaching a little further out than a serif's reach, were read as none, and the serif slid out past its own tip)
  const md = (i: number) => ((i % n) + n) % n;
  for (const { a, b } of rig.ends[r]) {
    let p = a, q = b;
    while (!side[md(p)] && a - p < END_GAP) p--;
    while (!side[md(q)] && q - b < END_GAP) q++;
    const sa = side[md(p)], sb = side[md(q)];
    if (sa && sa === sb) for (let k = p; k <= q; k++) { const j = md(k); if (k >= a && k <= b) atEnd[j] = 1; if (!side[j]) side[j] = sa; }
  }
  // (and, its serifs read as cupped (serifLinedRig), a few samples between two of a serif's own, CUP_TIP or fewer, as its
  // tip: a Didone's serifs, coming to a hairline point, have no end found there, and the serif's top and foot slid out past
  // the tip between them, a fold cutting it off)
  const cup = new Uint8Array(n);
  const hair = rig.cupped ? rig.ref().hair0 : 0;
  if (rig.cupped) for (let i = 0; i < n; i++) {
    const sg = side[i];
    if (!sg || side[md(i + 1)] || !bs[i].serifDx) continue;
    // (or up to CUP_TIP_THIN of them all thinner than the hairline: a Didone's w's head serif's tip, its top read as its
    // serif's only near its root, slid none while its underside slid out past it, a fold over the tip)
    let k = 1, thin = true;
    while (k <= CUP_TIP_THIN && !side[md(i + k)]) { thin &&= 2 * bs[md(i + k)].w < hair; k++; }
    if ((k <= CUP_TIP || (thin && k <= CUP_TIP_THIN)) && side[md(i + k)] === sg && bs[md(i + k)].serifDx) for (let q = 1; q < k; q++) { side[md(i + q)] = sg; atEnd[md(i + q)] = 1; cup[md(i + q)] = 1; }
  }
  const from = side.findIndex((d, i) => !d || d !== side[(i - 1 + n) % n]);
  for (let q = 0; from >= 0 && q < n; q++) {
    const s0 = (from + q) % n, sg = side[s0];
    if (!sg || side[(s0 - 1 + n) % n] === sg) continue;
    let e = s0;
    for (let k = 0; k < n && side[e] === sg; k++) e = (e + 1) % n;
    runs.push({ s0, e, sg });
  }
  SERIF_RUNS.set(bs, got = { side, atEnd, runs, cup });
  return got;
}
const SERIF_RUNS = new WeakMap<Bone[], { side: Int8Array; atEnd: Uint8Array; runs: { s0: number; e: number; sg: number }[]; cup: Uint8Array }>(), END_GAP = 4;

/** How much further, at most, a heavier weight's edge moves out than the edge beside it, a unit along the outline: among
    edges facing ink or none, and on from an edge facing a stroke's end into those facing none (SLOPE_PAST); not through
    a crotch's round turning away from the ink SLOPE_CROTCH degrees or more a sample, nor within SLOPE_SERIF samples of a
    serif (edgeMoves). */
const SLOPE_HELD = 0.4, SLOPE_PAST = 1, SLOPE_CROTCH = 4, SLOPE_SERIF = 3;

/** Moves d along an outline's samples (each as far out as it moves) brought in where they go out further than `most`
    more than the sample before or after them, a unit along the outline (step[i], from sample i to the next), the lowest
    carried on round both ways: not by or onto a sample `own` holds to its own move, nor onto one `kept` keeps (which
    carries on its own). In place. */
function heldBySlope(d: number[], step: ArrayLike<number>, own: ArrayLike<boolean | number>, most: number, kept?: ArrayLike<boolean | number>) {
  const n = d.length;
  for (const dir of [1, -1]) for (let k = 0, i = dir > 0 ? 0 : n - 1; k < 2 * n; k++, i = (i + dir + n) % n) {
    const j = (i - dir + n) % n;
    if (own[i] || own[j] || kept?.[i] || !(d[i] > 0)) continue;
    const to = Math.max(0, d[j]) + most * step[dir > 0 ? j : i];
    if (d[i] > to) d[i] = to;
  }
}

/** Which samples of contour r of a rig move as their own, held by no other (heldBySlope): a corner, a stroke's end
    (`endAt`, as edgeMoves reads them), a dot, a crotch's round, and in a font with serifs any within SLOPE_SERIF samples
    of a serif. Read once a rig and contour. */
function heldOwn(rig: SkinRig, r: number, endAt: (i: number) => boolean): { own: boolean[]; step: Float64Array } {
  const bs = rig.bones[r], n = bs.length;
  let got = HELD_OWN.get(bs);
  if (got) return got;
  const serifed = rig.serifed(), bySerif = (i: number) => { for (let k = 1 - SLOPE_SERIF; k < SLOPE_SERIF; k++) if (bs[(i + k + n) % n].serifDx) return true; return false; };
  const own = bs.map((b, i) => {
    const p = bs[(i - 1 + n) % n], q = bs[(i + 1) % n];
    const crotch = (q.tx - p.tx) * b.nx + (q.ty - p.ty) * b.ny < 0 && Math.abs(Math.atan2(p.tx * q.ty - p.ty * q.tx, p.tx * q.tx + p.ty * q.ty)) * 90 / Math.PI > SLOPE_CROTCH;
    return b.corner || endAt(i) || b.dot || crotch || (serifed && bySerif(i));
  });
  got = { own, step: Float64Array.from(bs, (b, i) => Math.hypot(bs[(i + 1) % n].x - b.x, bs[(i + 1) % n].y - b.y)) };
  HELD_OWN.set(bs, got);
  return got;
}
const HELD_OWN = new WeakMap<Bone[], { own: boolean[]; step: Float64Array }>();

/** Which samples of contour r of a rig face a stroke's end across their room: the outline their room's ray (gap) runs
    to, within VEE_HIT, lies within ENDS_NEAR samples of one of the rig's stroke ends (an italic n's stem's side under
    the tip of its hook). Read once a rig, the samples kept in cells VEE_HIT a side. */
function endFacing(rig: SkinRig, r: number): Uint8Array {
  const bs = rig.bones[r];
  let got = END_FACING.get(bs);
  if (got) return got;
  got = new Uint8Array(bs.length);
  END_FACING.set(bs, got);
  const cells = new Map<string, { x: number; y: number; end: boolean }[]>(), key = (x: number, y: number) => `${Math.floor(x / VEE_HIT)},${Math.floor(y / VEE_HIT)}`;
  rig.bones.forEach((q, k) => {
    const end = new Uint8Array(q.length);
    for (const { a, b } of rig.ends[k] ?? []) for (let i = a - ENDS_NEAR; i <= b + ENDS_NEAR; i++) end[((i % q.length) + q.length) % q.length] = 1;
    q.forEach((p, j) => { const c = key(p.x, p.y), l = cells.get(c); const e = { x: p.x, y: p.y, end: !!end[j] }; if (l) l.push(e); else cells.set(c, [e]); });
  });
  bs.forEach((b, i) => {
    if (!isFinite(b.gap) || b.corner || b.dot) return;
    const hx = b.x - b.nx * b.gap, hy = b.y - b.ny * b.gap, cx = Math.floor(hx / VEE_HIT), cy = Math.floor(hy / VEE_HIT);
    let best = VEE_HIT * VEE_HIT;
    for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) for (const p of cells.get(`${cx + u},${cy + v}`) ?? []) {
      const d = (p.x - hx) ** 2 + (p.y - hy) ** 2;
      if (d < best) { best = d; got![i] = p.end ? 1 : 0; }
    }
  });
  return got;
}
const END_FACING = new WeakMap<Bone[], Uint8Array>(), ENDS_NEAR = 4;

/** Each sample of contour r of the rig read as half as thick as its stroke (Bone.w), but a side's by a stroke's end cut
    across it at a slant (not a ball's): read straight across, its stroke leaves through the end, thinner the nearer the
    corner, to nothing at it, so, moved as far as its stroke thickened, the side went out less and less into the corner
    and the end carried with it stood in, a hook at each of an A's feet's outer corners and a W's tops' (edgeMoves). Read
    instead as far across as the end's other side's line, along that side by the end, no further than the side is read
    where its stroke runs on past the end (the first sample read across to that side), no further from the end than
    END_SIDE samples. Read once a rig. */
function endSides(rig: SkinRig, r: number): Float64Array {
  const bs = rig.bones[r];
  let got = END_SIDES.get(bs);
  if (got) return got;
  got = Float64Array.from(bs, b => b.w);
  END_SIDES.set(bs, got);
  const n = bs.length, md = (i: number) => ((i % n) + n) % n;
  for (const e of sideEnds(rig, r)) {
    const A = bs[md(e.a)], B = bs[md(e.b)];
    if (e.ball || A.dot) continue;
    for (const [from, other, dir] of [[e.b, e.a, 1], [e.a, e.b, -1]]) {
      // (the other side's line, along it off its corner)
      let o = md(other);
      for (let k = 0; k < 3 && bs[o].corner; k++) o = md(o - dir);
      const O = bs[o], ex = B.x - A.x, ey = B.y - A.y, read: [number, number][] = [];
      let past = Infinity;
      for (let k = 0; k < END_SIDE; k++) {
        const i = md(from + dir * k), q = bs[i];
        if (q.corner) { if (k > 0) break; continue; }
        // (how far along its ray across, into its ink, q meets the other side's line, and the end's chord between its sides)
        const dO = q.nx * O.ty - q.ny * O.tx, dE = q.nx * ey - q.ny * ex;
        if (Math.abs(dO) < 1e-6) break;
        const tO = ((O.x - q.x) * O.ty - (O.y - q.y) * O.tx) / dO;
        const tE = Math.abs(dE) < 1e-6 ? Infinity : ((A.x - q.x) * ey - (A.y - q.y) * ex) / dE, u = Math.abs(dE) < 1e-6 ? -1 : ((A.x - q.x) * q.ny - (A.y - q.y) * q.nx) / dE;
        if (!(tO > 0)) break;
        if (!(tE < tO && tE > -STEP && u > -0.1 && u < 1.1)) { past = q.w; break; }
        read.push([i, tO / 2]);
      }
      if (!isFinite(past)) continue;
      for (const [i, w] of read) got[i] = Math.max(bs[i].w, Math.min(w, past));
    }
  }
  return got;
}
const END_SIDES = new WeakMap<Bone[], Float64Array>();

/** Each sample of contour r of the rig read as half as thick as its stroke for a heavier weight (edgeMoves): by a stroke's
    end as endSides reads it, and along a straight edge (a segment of the outline, no corner on it, at least STRAIGHT_RUN
    samples) on the line through the middling reading of each half of it (their medians), so the edge stays straight as
    it moves: read sample by sample, its stroke reads thinner where it runs into a join or an end, the ray across it
    leaving through the other stroke or the end, and moved as far as that, a Y's arm's outer side went out less and less
    into its stem, a step where the two met, and an X's sides bent. Not a serif's, an end's or a dot's. Read once a rig. */
function sideWs(rig: SkinRig, r: number): Float64Array {
  const bs = rig.bones[r];
  let got = SIDE_WS.get(bs);
  if (got) return got;
  const ends = endSides(rig, r), grown = new Uint8Array(bs.length);
  got = ends.slice();
  SIDE_WS.set(bs, got);
  SIDE_GROWN.set(bs, grown);
  const n = bs.length, md = (i: number) => ((i % n) + n) % n;
  const serifed = rig.serifed(), plain = (b: Bone) => b.straight && !b.corner && !b.dot && !b.cap && !(serifed && b.serifDx);
  const same = (i: number, j: number) => plain(bs[md(i)]) && plain(bs[md(j)]) && bs[md(i)].seg === bs[md(j)].seg;
  const median = (v: number[]) => { const u = v.slice().sort((a, b) => a - b); return u.length % 2 ? u[u.length >> 1] : (u[u.length / 2 - 1] + u[u.length / 2]) / 2; };
  const runs: [number, number][] = [];
  for (let s = 0; s < n; s++) {
    if (!plain(bs[s]) || same(s - 1, s)) continue;
    let e = s;
    while (e - s < n && same(e, s)) e++;
    if (e - s >= STRAIGHT_RUN && e - s < n) runs.push([s, e]);
  }
  // (in a font of near even strokes, straight edges on one line, a nub of a few samples between them, read as one, on its
  // middling reading all along: a comic's H's stem drawn a little thicker over its bar than under it, its outer side,
  // moved by each run's own, stepped out at the bar)
  const one = new Int32Array(runs.length).map((_, k) => k);
  if (evenFont(rig)) for (let k = 1; k < runs.length; k++) {
    const [s0, e0] = runs[k - 1], [s1, e1] = runs[k], P = bs[s0], Q = bs[s1];
    const on = (q: Bone) => Math.abs((q.x - P.x) * P.nx + (q.y - P.y) * P.ny) <= ONE_LINE;
    let near = s1 - e0 <= LINE_GAP && P.nx * Q.nx + P.ny * Q.ny >= END_SIDE_ON && on(Q) && on(bs[md(e1 - 1)]);
    for (let i = e0; near && i < s1; i++) near = !bs[md(i)].corner && !bs[md(i)].cap && on(bs[md(i)]);
    if (near) one[k] = one[k - 1];
  }
  for (let k = 0; k < runs.length; k++) {
    const [s, e] = runs[k], L = e - s;
    if (one.some((g, j) => g === one[k] && j !== k)) {
      const of = runs.filter((_, j) => one[j] === one[k]), from = of[0][0], to = of[of.length - 1][1];
      if (k === one[k]) { const m = median(of.flatMap(([a, b]) => Array.from({ length: b - a }, (_, q) => ends[md(a + q)]))); for (let i = from; i < to; i++) got[md(i)] = m; }
    } else {
      const h = L >> 1, m1 = median(Array.from({ length: h }, (_, k) => ends[md(s + k)])), m2 = median(Array.from({ length: L - h }, (_, k) => ends[md(s + h + k)]));
      const s1 = (h - 1) / 2, s2 = h + (L - h - 1) / 2;
      for (let k = 0; k < L; k++) got[md(s + k)] = Math.max(0, m1 + (m2 - m1) * (k - s1) / (s2 - s1));
    }
  }
  for (const [s, e] of runs) {
    // (and the curve it runs on into smoothly, either end, read as thick as it while it runs on within W_TURN of its way,
    // and no thinner than that by more than W_SLOPE a unit along after, where it reads as thick as W_NEAR of it or more:
    // an n's arch's inside, read thinner than its stem where it leaves the stem's side, moved out less, a dent where they
    // meet, its counter wider at the top; not a hairline leaving a stem, a blackletter's, its own thickness. Only as the
    // strokes thicken (grown): thinned as far as the stem, an arch thinned past its hairline and parted)
    const W0 = got[md(e - 1)], W1 = got[s];
    for (const [from, dir, F0] of [[md(e - 1), 1, W0], [s, -1, W1]] as const) {
      const F = bs[from];
      let w = F0, j = from, on = true;
      for (let k = 1; k < n / 2; k++) {
        const i = md(from + dir * k), q = bs[i];
        if (q.corner || q.cap || q.dot || q.straight || ends[i] < W_NEAR * F0) break;
        on &&= q.tx * F.tx + q.ty * F.ty >= W_TURN;
        if (!on) w -= W_SLOPE * Math.hypot(q.x - bs[j].x, q.y - bs[j].y);
        if (w <= got[i]) { if (on) { j = i; continue; } break; }
        got[i] = w; grown[i] = 1; j = i;
      }
    }
  }
  return got;
}
const SIDE_WS = new WeakMap<Bone[], Float64Array>(), SIDE_GROWN = new WeakMap<Bone[], Uint8Array>();
/** A ring's points (each its sample's, bs, moved) each moved instead as the mean of the moves of those either side of it,
    by a bell `sigma` units along the outline as drawn wide, out to three times that: not a corner's, which stays, nor
    past one, and near one less so; nor, so, a point `held` (a straight edge laid on its line). Each move is read from
    `was`, the sample where the heights and the width alone put it. */
function evenedMoves(r: P[], bs: Bone[], was: P[], sigma: number, held?: (i: number) => boolean): P[] {
  const n = r.length, reach = Math.min(n >> 1, Math.ceil(3 * sigma / STEP));
  if (n < 8 || sigma < 0.5 || reach < 1) return r;
  // (the samples lie STEP apart along the outline as drawn: the bell read by the sample)
  const g = Float64Array.from({ length: reach + 1 }, (_, k) => Math.exp(-((k * STEP) ** 2) / (2 * sigma * sigma)));
  const dx = r.map((p, i) => p.x - was[i].x), dy = r.map((p, i) => p.y - was[i].y);
  // (how many samples along each lies from the nearest corner: within the bell's middle of one, its own move kept as much
  // more as it lies nearer, so the corner's sides, run smooth up to it and not past, don't cross over it)
  const dc = new Int32Array(n).fill(n), near = sigma / STEP, fixed = (i: number) => bs[i].corner || !!held?.(i), f0 = bs.findIndex((_, i) => fixed(i));
  if (f0 >= 0) for (const dir of [1, -1]) for (let k = 0, i = f0, d = n; k < 2 * n; k++, i = (i + dir + n) % n) {
    d = fixed(i) ? 0 : d + 1;
    if (d < dc[i]) dc[i] = d;
  }
  return r.map((p, i) => {
    if (fixed(i)) return p;
    let sx = dx[i], sy = dy[i], sw = 1;
    for (const dir of [-1, 1]) for (let k = 1; k <= reach; k++) {
      const j = ((i + dir * k) % n + n) % n;
      if (fixed(j)) break;
      sx += dx[j] * g[k]; sy += dy[j] * g[k]; sw += g[k];
    }
    const f = Math.min(1, dc[i] / near);
    return { x: p.x + (was[i].x + sx / sw - p.x) * f, y: p.y + (was[i].y + sy / sw - p.y) * f };
  });
}
/** A ring (bs its samples as drawn) with each straight edge laid on one line again, lay of the way: along the way it runs
    as drawn, as far out as its points mostly lie; the round between two such edges, no longer than ROUND_RUN samples,
    going out from one's to the other's as they went, and a corner between two met where their lines meet, no further
    off than RELAY_MEET times as far as either went (a fat face's serif's underside and its end, Contrast turned round). */
function relaid(bs: Bone[], ring: P[], lay: number): P[] {
  const n = bs.length;
  if (n < 8 || ring.length !== n || !(lay > 0)) return ring;
  const md = (i: number) => ((i % n) + n) % n, plain = (i: number) => bs[i].straight && !bs[i].corner && !bs[i].dot;
  const onOne = (a: number, b: number) => bs[a].seg === bs[b].seg || (bs[a].tx * bs[b].tx + bs[a].ty * bs[b].ty > STRAIGHT_ON && Math.abs((bs[b].x - bs[a].x) * bs[a].ty - (bs[b].y - bs[a].y) * bs[a].tx) < 1);
  const runs: { s: number; L: number; px: number; py: number; ux: number; uy: number; c0: P; c1: P }[] = [];
  const go = ring.map(() => ({ x: 0, y: 0 })), inRun = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (!plain(s) || (plain(md(s - 1)) && onOne(md(s - 1), s))) continue;
    let L = 0;
    while (L < n && plain(md(s + L)) && (L === 0 || onOne(md(s + L - 1), md(s + L)))) L++;
    if (L < RELAY_RUN || L >= n) continue;
    const A = bs[s], Z = bs[md(s + L - 1)];
    let ux = Z.x - A.x, uy = Z.y - A.y;
    const ul = Math.hypot(ux, uy);
    if (ul < 1e-6) { ux = A.tx; uy = A.ty; } else { ux /= ul; uy /= ul; }
    const ox = uy, oy = -ux, offs = Array.from({ length: L }, (_, k) => ring[md(s + k)].x * ox + ring[md(s + k)].y * oy).sort((p, q) => p - q), o = offs[L >> 1];
    for (let k = 0; k < L; k++) { const i = md(s + k), d = o - (ring[i].x * ox + ring[i].y * oy); go[i] = { x: ox * d, y: oy * d }; inRun[i] = 1; }
    runs.push({ s, L, px: ring[s].x + go[s].x, py: ring[s].y + go[s].y, ux, uy, c0: go[s], c1: go[md(s + L - 1)] });
  }
  if (!runs.length) return ring;
  runs.sort((a, b) => a.s - b.s);
  // (a bracket's two edges, near square, the round between them inside the corner: the one before it and the one after)
  const nr = runs.length, bracket = (k: number) => {
    const R = runs[k], S = runs[(k + 1) % nr], e = md(R.s + R.L - 1), gap = md(S.s - e) - 1, det = R.ux * S.uy - R.uy * S.ux;
    return R !== S && gap >= 1 && gap <= RELAY_ROUND && Math.abs(det) >= RELAY_SQUARE && S.ux * bs[e].nx + S.uy * bs[e].ny < 0 ? { R, S, e, gap, det } : null;
  };
  const meetOf = (R: (typeof runs)[0], S: (typeof runs)[0], det: number) => (ax: number, ay: number, bx: number, by: number) => { const t = ((bx - ax) * S.uy - (by - ay) * S.ux) / det; return { x: ax + R.ux * t, y: ay + R.uy * t }; };
  // (a serif past a stem that thickened as far as it reached, or nearly, slid out with the stem's side, its end and all,
  // as far as it reached past the stem as drawn, no further than the stem's side went: a fat face's N's hairline stems,
  // thickened sixfold at Contrast 0, swallowed their serifs, a tick where each serif's end stood in from the stem's side)
  const slideBy = (T: (typeof runs)[0], E: (typeof runs)[0], vx: number, vy: number) => {
    for (const U of [T, E]) { for (let j = 0; j < U.L; j++) { const i = md(U.s + j); go[i] = { x: go[i].x + vx, y: go[i].y + vy }; } U.px += vx; U.py += vy; U.c0 = { x: U.c0.x + vx, y: U.c0.y + vy }; U.c1 = { x: U.c1.x + vx, y: U.c1.y + vy }; }
  };
  // (a serif: a level edge read as a serif's, its end square to it at a corner)
  const serif = (T: (typeof runs)[0]) => Math.abs(T.uy) < RELAY_END && Array.from({ length: T.L }, (_, j) => bs[md(T.s + j)]).some(b => b.serifDx);
  const square = (A: (typeof runs)[0], B: (typeof runs)[0], c: number) => bs[c].corner && Math.abs(A.ux * B.ux + A.uy * B.uy) < RELAY_END;
  for (let k = 0; k < nr; k++) {
    const B = bracket(k);
    if (!B) continue;
    const { R, S, e, det } = B, meet = meetOf(R, S, det), Xd = meet(bs[e].x, bs[e].y, bs[S.s].x, bs[S.s].y), Xm = meet(R.px, R.py, S.px, S.py);
    const at = (i: number) => ({ x: ring[i].x + go[i].x, y: ring[i].y + go[i].y });
    // (the serif along R, its end the edge before it, met at a corner)
    const P = runs[(k - 1 + nr) % nr];
    if (P !== R && P !== S && serif(R) && md(R.s - P.s - P.L) === 1 && square(P, R, md(P.s + P.L))) {
      const Ld = (Xd.x - bs[R.s].x) * R.ux + (Xd.y - bs[R.s].y) * R.uy, r0 = at(R.s), Lm = (Xm.x - r0.x) * R.ux + (Xm.y - r0.y) * R.uy;
      const sl = Math.min(Math.max(0, Ld - Lm), Math.max(0, -((Xm.x - Xd.x) * R.ux + (Xm.y - Xd.y) * R.uy)));
      if (sl > 0) slideBy(P, R, -R.ux * sl, -R.uy * sl);
    }
    // (or along S, its end the edge after it)
    const Q = runs[(k + 2) % nr], sl1 = md(S.s + S.L - 1);
    if (Q !== R && Q !== S && serif(S) && md(Q.s - S.s - S.L) === 1 && square(S, Q, md(S.s + S.L))) {
      const Ld = (bs[sl1].x - Xd.x) * S.ux + (bs[sl1].y - Xd.y) * S.uy, s1 = at(sl1), Lm = (s1.x - Xm.x) * S.ux + (s1.y - Xm.y) * S.uy;
      const sl = Math.min(Math.max(0, Ld - Lm), Math.max(0, (Xm.x - Xd.x) * S.ux + (Xm.y - Xd.y) * S.uy));
      if (sl > 0) slideBy(S, Q, S.ux * sl, S.uy * sl);
    }
  }
  for (let k = 0; k < runs.length; k++) {
    const R = runs[k], S = runs[(k + 1) % runs.length], e = md(R.s + R.L - 1), gap = md(S.s - e) - 1;
    if (gap < 1 || gap > ROUND_RUN || (R === S && gap >= n - R.L)) continue;
    // (a corner alone between them where the two lines, as laid, meet)
    if (gap === 1 && bs[md(e + 1)].corner && Math.abs(R.ux * S.uy - R.uy * S.ux) >= MEET_PARALLEL) {
      const det = R.ux * S.uy - R.uy * S.ux, t = ((S.px - R.px) * S.uy - (S.py - R.py) * S.ux) / det, c = md(e + 1), X = { x: R.px + R.ux * t, y: R.py + R.uy * t };
      const far = RELAY_MEET * Math.max(1, Math.hypot(R.c1.x, R.c1.y), Math.hypot(S.c0.x, S.c0.y));
      if (Math.hypot(X.x - ring[c].x, X.y - ring[c].y) <= far) { go[c] = { x: X.x - ring[c].x, y: X.y - ring[c].y }; continue; }
    }
    // (a round inside a corner, a bracket, no longer than RELAY_ROUND samples, its edges near square (RELAY_SQUARE): as
    // drawn, where its two lines now meet; and the points of either edge it now covers on it, at its end. Each point moved
    // its own way, as much the serif's as the stem's by the way it faced, a fat face's h's feet's brackets curled in
    // under the serifs' tops at Contrast 0, a nick of paper at each. Made smaller about that corner to stay within either
    // edge as laid: a fat face's A's hairline leg, thickened, meets its foot's top near the serif's end, and the bracket
    // stood out past it, a tip)
    const det = R.ux * S.uy - R.uy * S.ux, nR = bs[e];
    if (gap <= RELAY_ROUND && Math.abs(det) >= RELAY_SQUARE && S.ux * nR.nx + S.uy * nR.ny < 0) {
      const meet = (ax: number, ay: number, bx: number, by: number) => { const t = ((bx - ax) * S.uy - (by - ay) * S.ux) / det; return { x: ax + R.ux * t, y: ay + R.uy * t }; };
      const Xd = meet(bs[e].x, bs[e].y, bs[S.s].x, bs[S.s].y), Xm = meet(R.px, R.py, S.px, S.py);
      const laid = (i: number) => ({ x: ring[i].x + go[i].x, y: ring[i].y + go[i].y }), r0 = laid(R.s), s1 = laid(md(S.s + S.L - 1));
      const a0 = (bs[md(e + 1)].x - Xd.x) * R.ux + (bs[md(e + 1)].y - Xd.y) * R.uy, b0 = (bs[md(S.s - 1)].x - Xd.x) * S.ux + (bs[md(S.s - 1)].y - Xd.y) * S.uy;
      const aMin = (r0.x - Xm.x) * R.ux + (r0.y - Xm.y) * R.uy, bMax = (s1.x - Xm.x) * S.ux + (s1.y - Xm.y) * S.uy;
      const k = Math.max(0, Math.min(1, a0 < aMin ? aMin / a0 : 1, b0 > bMax ? bMax / b0 : 1)), at = (i: number) => ({ x: Xm.x + (bs[i].x - Xd.x) * k, y: Xm.y + (bs[i].y - Xd.y) * k });
      for (let j = 1; j <= gap; j++) { const i = md(e + j), q = at(i); go[i] = { x: q.x - ring[i].x, y: q.y - ring[i].y }; }
      const A = at(md(e + 1)), Z = at(md(S.s - 1));
      for (let k = 0; k < R.L; k++) { const i = md(e - k), p = { x: ring[i].x + go[i].x, y: ring[i].y + go[i].y }; if ((p.x - A.x) * R.ux + (p.y - A.y) * R.uy <= 0) break; go[i] = { x: A.x - ring[i].x, y: A.y - ring[i].y }; }
      for (let k = 0; k < S.L; k++) { const i = md(S.s + k), p = { x: ring[i].x + go[i].x, y: ring[i].y + go[i].y }; if ((p.x - Z.x) * S.ux + (p.y - Z.y) * S.uy >= 0) break; go[i] = { x: Z.x - ring[i].x, y: Z.y - ring[i].y }; }
      continue;
    }
    for (let j = 1; j <= gap; j++) { const t = j / (gap + 1), i = md(e + j); go[i] = { x: R.c1.x * (1 - t) + S.c0.x * t, y: R.c1.y * (1 - t) + S.c0.y * t }; }
  }
  return ring.map((p, i) => ({ x: p.x + go[i].x * lay, y: p.y + go[i].y * lay }));
}
/** How many samples a straight edge runs for relaid to lay it again, and how far off, as many times as either edge beside
    it went, a corner between two may be met where their lines meet. */
const RELAY_RUN = 3, RELAY_MEET = 3;
/** How many samples long a round inside a corner relaid carries whole to where its edges now meet, and how near square
    those edges must be (the sine of the angle between them). */
const RELAY_ROUND = 16, RELAY_SQUARE = 0.5;
/** How near square a serif's end must stand to it (the cosine between them) for relaid to slide the serif out with its
    stem. */
const RELAY_END = 0.3;
/** A ring without its points that turn back on the way to them by more than SPIKE_TURN where either way out of them runs
    SPIKE_SHORT units or less: a spike's tip a few units long, which a curve traced through draws as a loop. */
function unspiked(r: P[]): P[] {
  let out = r;
  for (let pass = 0; pass < 4; pass++) {
    const n = out.length;
    if (n < 8) return out;
    const keep = out.map((p, i) => {
      const a = out[(i - 1 + n) % n], b = out[(i + 1) % n], ux = p.x - a.x, uy = p.y - a.y, vx = b.x - p.x, vy = b.y - p.y;
      if (Math.min(Math.hypot(ux, uy), Math.hypot(vx, vy)) > SPIKE_SHORT) return true;
      return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) < SPIKE_TURN;
    });
    if (keep.every(Boolean)) return out;
    out = out.filter((_, i) => keep[i] || !keep[(i - 1 + n) % n]);
  }
  return out;
}
const SPIKE_TURN = 150 * Math.PI / 180, SPIKE_SHORT = 3;
/** A ring without its points flung out alone: each SPIKE_FAR units or more off the line through the points either side of
    it, and further off it than SPIKE_OUT of how far apart they lie, which no sample of an outline read every STEP lies but
    where it moved on its own and the samples beside it didn't: a comic's e's bar's end's corner, where it meets the bowl,
    moved 25 units out along its own way at Weight 100, the samples either side 20 units apart, and traced as a knot. */
function unflung(r: P[], inkLeft: number, tips: P[], near: number): P[] {
  let out = r;
  for (let pass = 0; pass < 4; pass++) {
    const n = out.length;
    if (n < 8) return out;
    const keep = out.map((p, i) => {
      const a = out[(i - 1 + n) % n], b = out[(i + 1) % n], ab = Math.hypot(b.x - a.x, b.y - a.y);
      const off = ab > 1e-6 ? Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / ab : Math.hypot(p.x - a.x, p.y - a.y);
      if (off < SPIKE_FAR || off <= SPIKE_OUT * ab) return true;
      // (only out into the paper, not a crotch's point in toward the ink, nor near a tip the design draws: where the outline
      // runs straight, its points far apart, a fat face's A's counter's top and a V's foot are as far off the line)
      return ((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) * inkLeft < 0 || tips.some(q => Math.hypot(q.x - p.x, q.y - p.y) < near);
    });
    if (keep.every(Boolean)) return out;
    out = out.filter((_, i) => keep[i] || !keep[(i - 1 + n) % n]);
  }
  return out;
}
const SPIKE_FAR = 3 * STEP, SPIKE_OUT = 0.8;

/** How wide, as a share of how far its sides moved out, a round pen's heavier moves are run smooth (movedOnce,
    evenedMoves). */
const EVEN_SMOOTH = 0.3;
/** How wide, as a share of how far its strokes thicken and thin, a contrasty design's moves with Contrast turned round are
    run smooth (movedOnce, evenedMoves). */
const REV_SMOOTH = 0.4;
/** How far a contrasty design's heavier weight's moves are run smooth along its outline, as a share of how far its stems
    thickened (movedOnce). */
/** How far along the outline, at most, past a contrasty design's heavier weight's straight edge laid on its line, its
    points gone into its ink are put back where the outline crosses that line (straightRuns' 'thick'), in samples. */
/** How near a line a contrasty design's heavier weight's laid straight edge ends for its points by it, as near, to be
    kept off past it (straightRuns' 'thick'), as a share of the capitals' height. */
const THICK_LINE = 0.06;
const FOLD_BACK = 24;
const CON_SMOOTH = 0.3;
/** The most of a round pen's lowercase's samples that may lie on corners (fontPen). */
const PEN_CORNERS = 0.008;
/** How far off one another's line, in units, a near even font's straight edges may lie to be read as one (sideWs). */
const ONE_LINE = 1.5;
/** The fewest samples a straight edge must run to be read along it all (sideWs) and laid on one line as moved
    (moveRing's straightRuns); how far off its way (the cosine) a curve running on from it reads as thick as it, and how
    much thinner, a unit along it, past that, if it reads W_NEAR of it or more (sideWs); how long a round between two such edges, and how far along a curve
    running on from one, goes out with them as laid, and how many samples off an edge along a line one may meet it round a
    little round, or a round inside a corner between two edges be filled as they meet (straightRuns); how nearly in line
    (the cosine) two straight segments one after another run to be one such edge; how far, as many times as they moved, two such edges turning away from the ink where they
    meet may meet again; and how nearly in line (the sine of the angle between them) two may run and not be met again. */
/** How many samples past a fair font's laid edge's end a corner inside a join is looked for, and how far from where the
    design's corner moved, as a share of the edge's move, the two are met (straightRuns). */
const LAID_CORNER = 12, LAID_REACH = 1.6;
const ROUND_RUN = 24, ROUND_FADE = 8, LINE_GAP = 6, MEET_ROUND = 6, STRAIGHT_RUN = 6, STRAIGHT_ON = Math.cos(2 * Math.PI / 180), W_TURN = Math.cos(20 * Math.PI / 180), W_SLOPE = 0.05, W_NEAR = 0.6, MEET_REACH = 4, MEET_PARALLEL = Math.sin(4 * Math.PI / 180);
/** How far out a heavier weight's straight edge is laid: as far as this share of its points go (moveRing's straightRuns). */
const STRAIGHT_OUT = 0.9;
/** How near a line, in units, a heavier weight's stroke end must lie all along to be kept on it, and how steeply (the
    sine of the angle) its sides must leave it (moveRing's flatEnd). */
const LINE_END = 1.5, LINE_SIDE = 0.3;
/** How near one of the letter's lines, as a share of its capitals' height, a heavier weight's stroke end cut level must
    lie to be kept on it (moveRing's flatEnd). */
const LINE_NEAR = 0.03;

/** Contour r's stroke ends as a heavier weight carries them (moveRing, endsWithSides): each but a ball's begun and ended at
    the samples beside its corners, where the outline it was read to run from (strokeEnds) begins further out along a
    side, straight on its line (its normal within END_SIDE_ON of the side's there): those samples, carried with the end,
    went as it did, not as their side, and stood off it as the side grew, a bump on an A's right foot's outer side, the
    foot's corner lifted off the baseline. Read once a rig. */
function sideEnds(rig: SkinRig, r: number): EndRun[] {
  const bs = rig.bones[r];
  if (rig.serifed()) return rig.ends[r];
  let got = SIDE_ENDS.get(bs);
  if (got) return got;
  const n = bs.length, md = (i: number) => ((i % n) + n) % n;
  got = rig.ends[r].map(e => {
    if (e.ball) return e;
    const cs: number[] = [];
    for (let i = e.a + 1; i < e.b; i++) if (bs[md(i)].corner) cs.push(i);
    if (!cs.length) return e;
    // (how far in from `from` its side runs on, the way dir, straight along its line, to the corner `to`)
    const onSide = (from: number, to: number, dir: number) => {
      const S = bs[md(from)];
      for (let i = from + dir; i !== to; i += dir) { const q = bs[md(i)]; if (!q.straight || q.nx * S.nx + q.ny * S.ny < END_SIDE_ON) return false; }
      return true;
    };
    const a = cs[0] - 1 > e.a && onSide(e.a, cs[0], 1) ? cs[0] - 1 : e.a, b = cs[cs.length - 1] + 1 < e.b && onSide(e.b, cs[cs.length - 1], -1) ? cs[cs.length - 1] + 1 : e.b;
    return a === e.a && b === e.b ? e : { ...e, a, b };
  });
  SIDE_ENDS.set(bs, got);
  return got;
}
const SIDE_ENDS = new WeakMap<Bone[], EndRun[]>();
/** How nearly a sample of an end's run must face as the side it begins on to be taken for that side (sideEnds: the
    cosine between their normals). */
const END_SIDE_ON = Math.cos(10 * Math.PI / 180);
/** endSides' reach: how many samples off a stroke's end a side is read as far as the end's other side. */
const END_SIDE = 40;

/** A heavier weight's strokes' thicknesses along one contour (samples bs, each thickening ks times) eased over as far along
    the outline as each edge moves out, a sample for every STEP, along straight edges only, past no corner nor into an
    end (`keep`), and only among samples within EVEN_NEAR of as thick (so a hairline running into a stem keeps its own): a
    hand-drawn stroke's thickness wavers by a few units along it, and moved out two and three times as far as it is
    thick the waver went with it as far again, a comic's A's legs and V's arms lumpy at Weight 100; a true offset that
    far runs smooth over its edge's wavers. (Not a curve's: a brush script's f's crossbar, eased into its stem's
    thickness along the curve into it, notched its top where they meet.) */
function evenWs(bs: Bone[], ks: number[], keep: (j: number) => boolean): number[] {
  const n = bs.length, kept = bs.map((_, j) => keep(j)), bells = new Map<number, Float64Array>();
  // (each reach's weights, a bell over it, read once)
  const bell = (reach: number) => { let g = bells.get(reach); if (!g) { g = Float64Array.from({ length: reach + 1 }, (_, k) => Math.exp(-(k * k) * 3 / (2 * reach * reach))); bells.set(reach, g); } return g; };
  return bs.map((b, i) => {
    const reach = Math.min(n >> 2, Math.round(Math.max(0, ks[i] - 1) * b.w / STEP));
    if (!kept[i] || reach <= 3) return b.w;
    const g = bell(reach), near = EVEN_NEAR * b.w;
    let s = 0, wt = 0;
    for (const dir of [-1, 1]) for (let k = dir < 0 ? 0 : 1; k <= reach; k++) {
      const j = ((i + dir * k) % n + n) % n;
      if (!kept[j]) break;
      const w = bs[j].w;
      if (Math.abs(w - b.w) > near) continue;
      s += w * g[k]; wt += g[k];
    }
    return wt ? s / wt : b.w;
  });
}
const EVEN_NEAR = 0.3;
/** Whether a font's strokes are near even (no serifs, its hairline EVEN_HAIR of its stems or more), whose strokes'
    thickness heavier weights ease (evenWs): a serif's bracket's or a contrasty curve's thickness changes along it on
    purpose, a sample or two at a time. */
const evenFont = (rig: SkinRig) => { const { stem, hair0 } = rig.ref(); return !rig.serifed() && hair0 >= EVEN_HAIR * stem; };
const EVEN_HAIR = 0.75;
/** A font of bracketed serifs and some contrast, its hairline FAIR_HAIR of its stems (an old style, a transitional, an
    italic; not a Didone, a fat face or a slab), whose heavier weight's moves are eased over FAIR_REACH times as far
    along its outline as each moves, by no more than FAIR_SHARE of each (edgeMoves). */
const fairFont = (rig: SkinRig) => { const { stem, hair0 } = rig.ref(); return rig.serifed() && !fatFace(rig) && hair0 >= FAIR_HAIR[0] * stem && hair0 < FAIR_HAIR[1] * stem; };
/** ease's weights reaching `r` samples either way, kept by r. */
const bell = (r: number) => { let w = BELLS.get(r); if (!w) BELLS.set(r, w = Float64Array.from({ length: r + 1 }, (_, k) => Math.exp(-(k * k) * 3 / (2 * r * r)))); return w; };
const BELLS = new Map<number, Float64Array>();
const FAIR_HAIR = [0.2, 0.6], FAIR_REACH = 2, FAIR_SHARE = 0.2, FAIR_FADE = 4;
/** How much of the ink ahead of a crotch, and of how far its thinning edge moved, a fair font's Contrast turned round
    may carry it into the join (moveRing). */
const JOIN_KEEP = 0.5, JOIN_MOVE = 0.6;
/** How far apart, as a share of how far apart they stood, two crotches either side of a join a thinned stem stands short
    of are set on its side, and how far apart, in the strokes' half thicknesses, they may stand to be read as one (joinNecks). */
const NECK = 0.3, NECK_FAR = 1.5;
/** How thick, as a share of its hairline, a fair font's serif's level edge is read at most, and how level (the normal's
    upright share) such an edge faces (edgeMoves). */
const SERIF_TOP = 0.5, SERIF_LEVEL = 0.9, SERIF_LEVEL_RAMP = 0.05, SERIF_THICK = [1, 1.5];
/** How many samples past a serif's run (and SERIF_NEAR) its stem's upright straight side is looked for (edgeMoves' sideMove). */
const SIDE_LOOK = 12;

/** Runs of a stroke's end (EndRun's, its sides either side) with no more than ORPHAN_GAP samples between one and the next
    made one, their sides the first's and the last's: a V's foot, cut across in two runs a corner on the line apart. */
function mergedEnds(runs: EndRun[], bs: Bone[]): EndRun[] {
  const n = bs.length, out: EndRun[] = [];
  for (const e of runs) {
    const last = out[out.length - 1];
    if (last && e.a - last.b < ORPHAN_GAP) last.b = e.b; else out.push({ ...e });
  }
  if (out.length > 1 && out[0].a + n - out[out.length - 1].b < ORPHAN_GAP) { out[0].a = out[out.length - 1].a - n; out.pop(); }
  return out;
}
const ORPHAN_GAP = 3;

/** How thin a stroke may get, as a share of the font's hairline as the bars now are, and the most samples in a row read as
    a stroke's end, in no end found, that move as a side (edgeMoves). */
const HAIR_FLOOR = 1, ORPHAN_SHORT = 3;
/** How much further than its tip, at most, as a share of how far it reached past its stem, a reweighed letter's serif's
    root slides out, where the room beside its tip holds the tip back (edgeMoves): more, its root would pass its tip. */
const SERIF_SHORTER = 0.6;
/** How far past its stem, as a share of the stem's thickness, a reweighed letter's serif's samples slide wholly along their
    edges as the serif does (edgeMoves). */
const SERIF_RAMP = 0.25;
/** How many samples of a stem's side either side of a reweighed letter's serif go out at least as far as the serif's root
    (edgeMoves). */
const SERIF_NEAR = 8;
/** How thick, at most, as a share of the stroke a reweighed letter's serif is read on, the stroke its root runs on from may
    be for the serif to slide no further than that stroke's side moves (edgeMoves). */
const SERIF_OTHER = 0.4;
/** A contrasty font's stroke end carried unturned (moveRing): its sides nearer than TIP_SHORT of the capitals' height,
    turned by more than TIP_TURN (radians). */
const TIP_SHORT = 0.02, TIP_SWING = 40 * Math.PI / 180;
/** How far out along its serif, as a share of its reach, a contrasty font's serif's run may end for the stem's side past
    it to go out with the serif's root (edgeMoves). */
const SERIF_TIPWARD = 0.5;
/** How nearly upright a stem's side beside its end at a line must run (the cosine of its normal off level), and how near
    its edges, as a share of the stem, that end must reach across it, to be drawn across the stem again (edgeMoves). */
const HEAD_SIDE = 0.9, HEAD_SPAN = 0.15;
/** How near a line, as a share of the capitals' height, a reweighed letter's level edge facing off it is put back where
    it lies off it, as one on it is put back on it (snapFlatEdges). */
const NEAR_LINE = 0.02;
/** How far off a line, of the capitals' height, a round running on from an edge on it is held to it (edgeMoves). */
const ROUND_ON_LINE = 0.1;
/** How many samples along a straight side from a level end's corner on a line are kept from moving past the line (moveRing). */
const SIDE_PAST = 40;

/** The tabs off a stem's straight side on contour r of the rig (moveRing): the outline leaving the side's line at one corner
    (c0) and coming back onto it at another (c1), the way dir round the outline, everything between out on the paper's
    side of the line, no further out than TAB_DEEP times the stem is thick nor further along it than TAB_SPAN of the
    capitals' height (an f's and a t's crossbar's ends either side of its stem; not an E's arms, an H's bar or a plus's).
    The side runs on along its line TAB_SIDE samples either side, straight. Read once a rig. */
function tabsOf(rig: SkinRig, r: number): { c0: number; c1: number; dir: number }[] {
  const bs = rig.bones[r];
  let got = TABS.get(bs);
  if (got) return got;
  got = [];
  TABS.set(bs, got);
  const n = bs.length, md = (i: number) => ((i % n) + n) % n, cap = rig.ctx.cap;
  // (whether TAB_SIDE samples from i the way dir lie along one line with normal (nx, ny), none a corner)
  const along = (i: number, dir: number, nx: number, ny: number) => {
    for (let k = 1; k <= TAB_SIDE; k++) { const q = bs[md(i + dir * k)]; if (q.corner || q.cap || q.nx * nx + q.ny * ny < TAB_STRAIGHT) return false; }
    return true;
  };
  for (let c0 = 0; c0 < n; c0++) {
    const b = bs[c0];
    if (!b.corner || !concaveAt(b)) continue;
    for (const dir of [1, -1]) {
      // (the side before it, the way back from it)
      const s0 = bs[md(c0 - dir)], nx = s0.nx, ny = s0.ny;
      if (!along(c0, -dir, nx, ny)) continue;
      const deep = TAB_DEEP * 2 * s0.w, far = TAB_SPAN * cap;
      let ok = false, k = md(c0 + dir), steps = 0;
      for (; steps < n / 2; steps++, k = md(k + dir)) {
        const q = bs[k], off = (q.x - b.x) * nx + (q.y - b.y) * ny, run = Math.abs((q.x - b.x) * ny - (q.y - b.y) * nx);
        if (run > far || -off > deep) break;
        if (q.corner && concaveAt(q) && Math.abs(off) < TAB_ON && steps > 2 && along(k, dir, nx, ny)) { ok = true; break; }
        if (off > TAB_ON) break;
      }
      if (ok) got.push({ c0, c1: k, dir });
    }
  }
  return got;
}
const TABS = new WeakMap<Bone[], { c0: number; c1: number; dir: number }[]>();
/** tabsOf's reading: how many samples of the stem's side either side of a tab lie along its line, how nearly (the cosine
    of their normals), how near the line (units) the tab's corners lie, how far out it may reach (as many times as the stem
    is thick) and how far along (a share of the capitals' height). */
const TAB_SIDE = 4, TAB_STRAIGHT = Math.cos(10 * Math.PI / 180), TAB_ON = 4, TAB_DEEP = 1.5, TAB_SPAN = 0.3;

/** Which samples of contour r of the rig face across the paper an edge they run together with to a crotch (edgeMoves): the
    edge their gap reaches (the sample of the same contour nearest where it ends, within VEE_HIT) no further round the
    outline than VEE_PATH times the gap, through a corner, and not facing straight back at them (their normals within
    VEE_FACING of opposite): a V of paper between two strokes leaving one join at a point, however the far one curves away
    (a b's bowl leaving its stem), not a counter between strokes facing each other (an n's stems). Only on the letter's outside: a counter
    all round (an A's, an e's eye), its corners such crotches, closes. Read once a rig. */
function veeOf(rig: SkinRig, r: number): Uint8Array {
  const bs = rig.bones[r];
  let got = VEES.get(bs);
  if (got) return got;
  got = new Uint8Array(bs.length);
  VEES.set(bs, got);
  const wound = (q: Bone[]) => Math.sign(q.reduce((t, p, i) => { const w = q[(i + 1) % q.length]; return t + p.x * w.y - w.x * p.y; }, 0));
  if (wound(bs) !== wound(rig.bones.reduce((m, q) => (q.length > m.length ? q : m), rig.bones[0]))) return got;
  const n = bs.length, { stem, hair0 } = rig.ref(), plumb = !rig.serifed() && hair0 >= LINES_EVEN * stem && fontPlumb(rig.font);
  const side = (q: Bone) => Math.abs(q.nx) >= STEM_SIDE;
  bs.forEach((b, i) => {
    if (!isFinite(b.gap) || b.corner || b.dot) return;
    const hx = b.x - b.nx * b.gap, hy = b.y - b.ny * b.gap;
    let j = -1, best = VEE_HIT * VEE_HIT;
    bs.forEach((q, k) => { const d = (q.x - hx) ** 2 + (q.y - hy) ** 2; if (d < best) { best = d; j = k; } });
    if (j < 0) return;
    const q = bs[j], fore = (j - i + n) % n, round = Math.min(fore, n - fore) * STEP, dir = fore <= n - fore ? 1 : -1;
    // (or the outline straight all the way round to it but at one corner, its crotch, turning away from the ink: two
    // straight strokes meeting at a slant sharper than VEE_PATH reads, an N's, a W's, whose sides far from their crotch
    // are far further round from each other than across, and face each other near enough as their strokes meet sharply;
    // only its samples by the crotch read as one, they grew past the rest beside them, a hook at an N's crotches)
    let corners = 0, plain = true;
    for (let k = 1; k < Math.min(fore, n - fore) && plain; k++) { const c = bs[(i + dir * k + n) % n]; if (c.corner) { corners++; plain = concaveAt(c); } else plain = !!c.straight; }
    if (b.straight && q.straight && plain && corners === 1) { got![i] = 1; return; }
    // (or, in a sans of little contrast drawn with a rule (fontPlumb), a stem's upright side and a round across
    // the paper from it, past the crotch, one corner or a cut flat between two, they run into, as far round as VEE_SIDE
    // times across: a d's bowl's top and its stem, the paper between them a narrow V facing near head on, each held to
    // OPEN of it, the stem's side stood off the bowl over it, a hook of paper at its top at Weight 100, a q's, a b's and
    // a p's at their feet)
    if (plumb && side(b) !== side(q) && round <= VEE_SIDE * b.gap + 2 * STEP) {
      let cs = 0, ok = true;
      for (let k = 1; k < Math.min(fore, n - fore) && ok; k++) { const c = bs[(i + dir * k + n) % n]; if (c.corner) { cs++; ok = concaveAt(c); } }
      if (ok && cs >= 1 && cs <= 2) { got![i] = 1; return; }
    }
    if (round > VEE_PATH * b.gap + 2 * STEP || b.nx * q.nx + b.ny * q.ny <= -VEE_FACING) return;
    // (and a corner between them, the crotch's point: a round crotch, a rounded face's, comes out of the edges as moved
    // grown into each other a sharp one)
    for (let k = 1; k < Math.min(fore, n - fore); k++) if (bs[(i + dir * k + n) % n].corner) { got![i] = 1; return; }
  });
  return got;
}
const VEES = new WeakMap<Bone[], Uint8Array>();
/** How far each of veeOf's samples may grow: across its gap and the stroke there to its other side (the stroke the
    sample nearest where its gap ends, within VEE_HIT, belongs to, read as thick as it is and slantwise along the way this
    one goes out), Infinity where none is or the two face across no more than VEE_ACROSS. Read once a rig. */
function veeRooms(rig: SkinRig, r: number): Float64Array {
  const bs = rig.bones[r];
  let got = VEE_ROOMS.get(bs);
  if (got) return got;
  const v = veeOf(rig, r);
  got = new Float64Array(bs.length).fill(Infinity);
  VEE_ROOMS.set(bs, got);
  bs.forEach((b, i) => {
    if (!v[i] || !isFinite(b.gap)) return;
    const hx = b.x - b.nx * b.gap, hy = b.y - b.ny * b.gap;
    let j = -1, best = VEE_HIT * VEE_HIT;
    bs.forEach((q, k) => { const d = (q.x - hx) ** 2 + (q.y - hy) ** 2; if (d < best) { best = d; j = k; } });
    // (the far stroke's other side, along the way this edge goes out: across it slantwise as far further as it lies aslant)
    const q = j >= 0 ? bs[j] : null, across = q ? -(b.nx * q.nx + b.ny * q.ny) : 0;
    if (q && across > VEE_ACROSS) got![i] = b.gap + (2 * q.w) / across;
  });
  return got;
}
const VEE_ROOMS = new WeakMap<Bone[], Float64Array>();
const VEE_ACROSS = 0.2;
/** Which samples of contour r of the rig lie on a stroke's end cut along a line (edgeMoves): level, within
    SERIF_LINE_NEAR of the capitals' height of the line and facing out across it, the stroke each is read across
    running CUT_WAY or more along its normal, and those so level by the line within CUT_SPREAD samples of one (a Didone's
    W's foot's samples by its corner, read across their stroke the other way, went down 27 units while the rest of the
    foot stayed, and the heights, lifting the whole foot by as much, left the rest of it over the line). Read once a rig. */
function lineCuts(rig: SkinRig, r: number): Uint8Array {
  const bs = rig.bones[r];
  let got = LINE_CUTS.get(bs);
  if (got) return got;
  const c = rig.ctx, near = SERIF_LINE_NEAR * c.cap, n = bs.length, md = (i: number) => ((i % n) + n) % n;
  const lines: [number, number][] = [[c.cap, 1], [0, -1], ...(c.lower ? [[c.xh, 1], [c.asc, 1], [c.desc, -1]] as [number, number][] : [])];
  const level = bs.map(b => !b.corner && Math.abs(b.ny) > 0.97 && lines.some(([L, up]) => Math.abs(b.y - L) <= near && -b.ny * up > 0));
  got = Uint8Array.from(bs, (b, i) => (level[i] && Math.abs(b.nx * b.dx + b.ny * b.dy) >= CUT_WAY ? 1 : 0));
  const seed = got.slice();
  for (let i = 0; i < n; i++) if (seed[i]) for (const d of [-1, 1]) for (let k = 1, j = md(i + d); k <= CUT_SPREAD && level[j]; k++, j = md(j + d)) got[j] = 1;
  LINE_CUTS.set(bs, got);
  return got;
}
const LINE_CUTS = new WeakMap<Bone[], Uint8Array>(), CUT_WAY = 0.6, CUT_SPREAD = 4;

/** Which samples of contour r of the rig, a counter (wound against the letter's outside), face across it an edge beyond
    a corner they run to, the edge their gap reaches (the sample nearest where it ends, within VEE_HIT) lying round the
    outline past that one corner and no other, the corner turning away from the ink: as veeOf's on the outside, but the
    counter closes all round, so each grows no further than the widest gap of its own edge further from the corner lets
    it, as far as their gaps run past the same corner, and the first past none (its index, or -1). Each moved as far as its own gap lets it, an edge into a counter's
    corner went in less and less, flared, and the corner, met again where its edges meet, stood off them, a spur of paper
    at each foot of a heavy sans's e's eye. Read once a rig. */
function counterVees(rig: SkinRig, r: number): Int32Array {
  const bs = rig.bones[r];
  let got = COUNTER_VEES.get(bs);
  if (got) return got;
  got = new Int32Array(bs.length).fill(-1);
  COUNTER_VEES.set(bs, got);
  const wound = (q: Bone[]) => Math.sign(q.reduce((t, p, i) => { const w = q[(i + 1) % q.length]; return t + p.x * w.y - w.x * p.y; }, 0));
  if (wound(bs) === wound(rig.bones.reduce((m, q) => (q.length > m.length ? q : m), rig.bones[0])) || bs[0]?.dot) return got;
  const n = bs.length, md = (i: number) => ((i % n) + n) % n;
  // (the corner the sample's gap runs past, and which way round, or none)
  const past = (i: number): [number, number] | null => {
    const b = bs[i];
    if (!isFinite(b.gap) || b.corner) return null;
    const hx = b.x - b.nx * b.gap, hy = b.y - b.ny * b.gap;
    let j = -1, best = VEE_HIT * VEE_HIT;
    bs.forEach((q, k) => { const d = (q.x - hx) ** 2 + (q.y - hy) ** 2; if (d < best) { best = d; j = k; } });
    if (j < 0) return null;
    const fore = md(j - i), dir = fore <= n - fore ? 1 : -1, len = Math.min(fore, n - fore);
    let c = -1;
    for (let k = 1; k < len; k++) if (bs[md(i + dir * k)].corner) { if (c >= 0) return null; c = md(i + dir * k); }
    return c >= 0 && concaveAt(bs[c]) ? [c, dir] : null;
  };
  const reads = bs.map((_, i) => past(i));
  for (let i = 0; i < n; i++) {
    const at = reads[i];
    if (!at) continue;
    // (the widest gap back along its edge, away from the corner, as far as its gaps run past that corner, and the first
    // past none)
    let best = bs[i].gap;
    for (let k = 1; k < n / 4; k++) {
      const j = md(i - at[1] * k);
      if (bs[j].corner || (reads[j] && reads[j]![0] !== at[0])) break;
      if (bs[j].gap > best && isFinite(bs[j].gap)) { best = bs[j].gap; got[i] = j; }
      if (!reads[j]) break;
    }
  }
  return got;
}
const COUNTER_VEES = new WeakMap<Bone[], Int32Array>();
/** veeOf's reading: how near a sample the gap must end, how far round the outline, as many times the gap, the two may lie,
    and how nearly they may face each other (the cosine between their normals, its negative: 32° off straight back). */
const VEE_HIT = 6, VEE_PATH = 2.5, VEE_FACING = 0.85, VEE_SIDE = 6;
/** How much further than either edge moved, at most, a heavier weight's crotch at such a V goes to where its edges' lines
    meet (moveRing): a square corner's lie within √2 of it. */
const VEE_CORNER = 1.5;
/** How nearly an edge runs on the way it leaves a corner, the cosine, for its points left past the corner to be brought
    back to it (moveRing's cornersPast). */
const PAST_TURN = Math.cos(30 * Math.PI / 180);
/** A fair font's stem's side laid on one line (moveRing's straightRuns(true)): how upright (the normal's level share) and how
    thick, of a stem. */
const FAIR_UPRIGHT = 0.9, FAIR_THICK = 0.7;

/** A lighter weight's crotch where a stem's straight side meets an edge leaving it at a slant and curving away, an arch
    or a bowl leaving its stem (moveRing's archMeet): a concave corner, or two cut a few units apart (ARCH_PAIR), the
    stem's side running straight on from it ARCH_RUN samples, upright, the other edge leaving the same way, up or down,
    not straight all along, to a line within ARCH_NEAR of the corner (an n's arch over its stem's top, a p's bowl's
    foot beside its stem), at a slant (ARCH_SLANT); and no ink trap, the ink across from the corner as far as ARCH_NECK
    of the curve's stroke (a monospace's d, its bowl run into its stem on a thin neck, kept so). By contour, with which
    way the stem's side runs from it (1, on along the contour) and the joins whose bulge it lies in. */
interface ArchCrotch { first: number; last: number; stem: number; joins: number[]; shallow: boolean; line: number; y: number; stroke: number; trap: boolean }
function archCrotches(rig: SkinRig): Map<number, ArchCrotch[]> {
  const got = ARCH_CROTCHES.get(rig);
  if (got) return got;
  // (none in a font with serifs, one drawn as its strokes, or one keeping its own forms, a blackletter's or a joined
  // script's, whose strokes meet otherwise)
  const family = (rig.font as Partial<FreeFont>).family;
  if (rig.serifed() || drawnMode(rig) || (family && FREE_FAMILIES[family]?.ownForms)) { const none = new Map<number, ArchCrotch[]>(); ARCH_CROTCHES.set(rig, none); return none; }
  const T = rig.thin ??= thinReads(rig), c = rig.ctx, lines = [0, c.cap, ...(c.lower ? [c.xh, c.asc, c.desc] : [])], near = ARCH_NEAR * c.cap;
  const all = rig.bones.flatMap((bs, r) => bs.map((b, i) => ({ b, r, i })));
  const out = new Map<number, ArchCrotch[]>();
  rig.bones.forEach((bs, r) => {
    const n = bs.length, md = (i: number) => ((i % n) + n) % n, found: ArchCrotch[] = [];
    // (each notch: a concave corner, with a second cut a few units on, or a tight round cut off a stem's straight side,
    // turning away from the ink, ARCH_TIGHT a sample and as much as a corner in all within ARCH_ROUND, a stencil-ish
    // industrial's n's shoulder)
    const cands: [number, number][] = [], turnAt = (k: number) => {
      const p = bs[md(k - 1)], q = bs[md(k + 1)], b = bs[md(k)];
      if (b.corner || b.straight || b.dot || (q.tx - p.tx) * b.nx + (q.ty - p.ty) * b.ny >= 0) return 0;
      return Math.acos(Math.max(-1, Math.min(1, p.tx * q.tx + p.ty * q.ty))) / 2;
    };
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (b.dot) continue;
      if (b.corner && concaveAt(b)) {
        let last = i;
        for (let k = 1; k <= 3; k++) { const q = bs[md(i + k)]; if (Math.hypot(q.x - b.x, q.y - b.y) > ARCH_PAIR * c.cap) break; if (q.corner) { if (concaveAt(q)) last = md(i + k); break; } }
        if (!cands.some(([, l]) => l === i)) cands.push([i, last]);
        continue;
      }
      // (a round off a straight side's end, the way dir)
      if (!b.straight || b.corner || Math.abs(b.nx) <= ARCH_UPRIGHT) continue;
      for (const dir of [1, -1]) {
        if (bs[md(i + dir)].straight || bs[md(i + dir)].corner) continue;
        let k = i + dir, turn = 0, arc = 0;
        // (and on over a corner within it, the round turning back a little into a hook, an industrial's u's foot)
        while (Math.abs(k - i) < n && (turnAt(k) > ARCH_TIGHT || bs[md(k)].corner) && arc < ARCH_ROUND * c.cap) { turn += turnAt(k) * 2; arc += Math.hypot(bs[md(k)].x - bs[md(k - dir)].x, bs[md(k)].y - bs[md(k - dir)].y); k += dir; }
        if (turn < Math.PI / 4 || k === i + dir) continue;
        const a = md(i + dir), z = md(k - dir);
        cands.push(dir > 0 ? [a, z] : [z, a]);
      }
    }
    for (const [i0, last0] of cands) {
      const side = (from: number, dir: number) => Array.from({ length: ARCH_RUN }, (_, k) => bs[md(from + dir * (k + 1))]);
      const stemOk = (qs: Bone[]) => qs.every(q => !q.corner && q.straight && q.seg === qs[0].seg && Math.abs(q.nx) > ARCH_UPRIGHT);
      const curveOk = (qs: Bone[]) => qs.every(q => !q.corner && !q.dot) && !qs.every(q => q.straight);
      // (the stem's side read past a little round between it and the corner, ARCH_ROUND at the most: an industrial's
      // n's notch, its corner a few units off the stem's straight side)
      const past = (from: number, dir: number) => {
        let k = from, arc = 0;
        while (arc < ARCH_ROUND * c.cap && !bs[md(k + dir)].straight && !bs[md(k + dir)].corner) { arc += Math.hypot(bs[md(k + dir)].x - bs[md(k)].x, bs[md(k + dir)].y - bs[md(k)].y); k += dir; }
        return md(k);
      };
      let i = i0, last = last0, stem = 0;
      if (curveOk(side(last0, 1))) { const k = stemOk(side(i0, -1)) ? i0 : past(i0, -1); if (stemOk(side(k, -1))) { stem = -1; i = k; } }
      if (!stem && curveOk(side(i0, -1))) { const k = stemOk(side(last0, 1)) ? last0 : past(last0, 1); if (stemOk(side(k, 1))) { stem = 1; last = k; } }
      // (or a notch between two curves both leaving it toward a line near by, an m's between its arches: met again where
      // the two edges as moved meet, as a shallow crotch is)
      if (!stem && bs[i0].corner && curveOk(side(i0, -1)) && curveOk(side(last0, 1))) {
        const P = side(i0, -1), Q = side(last0, 1), p0 = P[P.length - 1], q0 = Q[Q.length - 1], b = bs[i0];
        const way = Math.sign(p0.y - b.y), line = lines.find(L => (L - b.y) * way > 0 && (L - b.y) * way < near);
        const ux = p0.x - P[ARCH_FROM - 1].x, uy = p0.y - P[ARCH_FROM - 1].y, vx = q0.x - Q[ARCH_FROM - 1].x, vy = q0.y - Q[ARCH_FROM - 1].y;
        const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
        if (way && Math.sign(q0.y - bs[last0].y) === way && line !== undefined && cos > ARCH_V[0] && cos < ARCH_V[1]) {
          const joins = new Set<number>();
          for (let k = i0; ; k = md(k + 1)) { const j = T.near[r][k]; if (j >= 0) for (const z of T.zone[j]) joins.add(z); if (k === last0) break; }
          // (and no ink trap: the ink across from it, the curves' other sides, as far as ARCH_NECK of their strokes, a
          // monospace's m's between its arches run in on a thin neck)
          let neck = Infinity, stroke = 0;
          for (const o of all) {
            if (o.r === r) { const d = Math.min(md(o.i - i0), md(i0 - o.i), md(o.i - last0), md(last0 - o.i)); if (d <= 2 * ARCH_RUN) continue; }
            if (o.b.nx * Q[ARCH_FROM].nx + o.b.ny * Q[ARCH_FROM].ny > -0.5 && o.b.nx * P[ARCH_FROM].nx + o.b.ny * P[ARCH_FROM].ny > -0.5) continue;
            neck = Math.min(neck, Math.hypot(o.b.x - b.x, o.b.y - b.y));
          }
          for (let k = ARCH_RUN; k < 6 * ARCH_RUN; k++) for (const j of [T.near[r][md(last0 + k)], T.near[r][md(i0 - k)]]) if (j >= 0) stroke = Math.max(stroke, 2 * T.s[j]);
          found.push({ first: i0, last: last0, stem: 0, joins: [...joins], shallow: true, line, y: b.y, stroke, trap: !(neck >= ARCH_NECK * stroke) });
        }
      }
      if (!stem) continue;
      const b = bs[md(i + (md(last - i) >> 1))], back = side(i, -1), on = side(last, 1);
      const S = stem > 0 ? on : back, C = stem > 0 ? back : on, at = stem > 0 ? bs[last] : b, from = stem > 0 ? b : bs[last];
      const way = Math.sign(S[S.length - 1].y - at.y), cEnd = C[C.length - 1];
      const line = lines.find(L => (L - b.y) * way > 0 && (L - b.y) * way < near);
      if (!way || Math.sign(cEnd.y - from.y) !== way || line === undefined) continue;
      const ux = S[S.length - 1].x - S[ARCH_FROM - 1].x, uy = S[S.length - 1].y - S[ARCH_FROM - 1].y, vx = cEnd.x - C[ARCH_FROM - 1].x, vy = cEnd.y - C[ARCH_FROM - 1].y;
      const cos = Math.abs(ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
      if (cos > ARCH_SLANT[1] || cos < ARCH_SLANT[0]) continue;
      // (the ink across from the corner: the nearest of the outline's samples facing back at the curve's edge, the
      // stroke's other side, off the crotch's own edges; against the curve's stroke at its thickest a way on past the join)
      const cn = C[ARCH_FROM], cdir = stem > 0 ? -1 : 1;
      let neck = Infinity;
      for (const o of all) {
        if (o.r === r) { const d = Math.min(md(o.i - i), md(i - o.i), md(o.i - last), md(last - o.i)); if (d <= 2 * ARCH_RUN) continue; }
        if (o.b.nx * cn.nx + o.b.ny * cn.ny > -0.5) continue;
        neck = Math.min(neck, Math.hypot(o.b.x - b.x, o.b.y - b.y));
      }
      let stroke = 0;
      for (let k = ARCH_RUN; k < 6 * ARCH_RUN; k++) {
        const j = T.near[r][md((cdir > 0 ? last : i) + cdir * k)];
        if (j < 0) continue;
        stroke = Math.max(stroke, 2 * T.s[j]);
      }
      const trap = !(neck >= ARCH_NECK * stroke);
      const joins = new Set<number>();
      for (let k = i; ; k = md(k + 1)) { const j = T.near[r][k]; if (j >= 0) for (const z of T.zone[j]) joins.add(z); if (k === last) break; }
      found.push({ first: i, last, stem, joins: [...joins], shallow: cos > ARCH_STEEP, line, y: b.y, stroke, trap });
    }
    if (found.length) out.set(r, found);
  });
  ARCH_CROTCHES.set(rig, out);
  return out;
}
const ARCH_CROTCHES = new WeakMap<SkinRig, Map<number, ArchCrotch[]>>();
/** Set while movedWay moves a letter again without its crotches met again (archMeet, stretchRounds). */
let ARCH_OFF = false;

/** Whether either edge of ring `out` at point c (from the point before it, to the one after it) crosses an edge of the
    ring not next to it. */
function ringCrossesAt(out: P[], c: number) {
  const n = out.length, md = (i: number) => ((i % n) + n) % n;
  const hit = (a: P, b: P, p: P, q: P) => {
    const d = (b.x - a.x) * (q.y - p.y) - (b.y - a.y) * (q.x - p.x);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((p.x - a.x) * (q.y - p.y) - (p.y - a.y) * (q.x - p.x)) / d, u = ((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / d;
    return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
  };
  for (const k of [md(c - 1), c]) for (let j = 0; j < n; j++) {
    if (md(j - k + 1) <= 2) continue;
    if (hit(out[k], out[md(k + 1)], out[j], out[md(j + 1)])) return true;
  }
  return false;
}

/** One contour of the rig moved (contour r, its samples bs): each edge out or in by its stroke's change of thickness,
    carried where the heights and the width put it, each corner where its two edges meet again, and each stroke's end
    with the sides it joins. */
function moveRing(rig: SkinRig, bs: Bone[], r: number, mv: MoveMap): P[] {
  const { gy, gyDot, gx, top, top1, sx, kd, ks } = mv;
  const n = bs.length, { dotRoom, k0, moved, rooms, slide, slid, crotches, pins, hug, hugY, fine, cuts, orphans } = edgeMoves(bs, r, mv, rig), vees = veesGrow(rig, mv) ? veeOf(rig, r) : null;
  // where the heights and the width put it: the skeleton point moved, and the edge kept as far across the
  // stroke from it as it was, the stroke turned as they turn it (a diagonal leans further as the letter
  // widens), so every stroke keeps its thickness; narrower, upright strokes thin a little, as a condensed
  // face's do, and lower, level ones, or a heavy letter's counters would close. A stroke's end goes with the sides it
  // joins (below; a cap the stroke ends found none for follows its own point, as there is no thickness across it to
  // keep), a dot is carried whole, keeping its round, and a corner goes as the edges either side of it go
  let cx = 0, cy = 0;
  for (const b of bs) { cx += b.ax; cy += b.ay; }
  cx /= n; cy /= n;
  // (the heavier the letter, the more, or its counters would close: a heavy display face's stems take up
  // most of its width)
  // (lower is the lowercase made lower by the x-height, not the bands a moved crossbar squeezes)
  const thin = 0.35 + 0.5 * Math.min(1, Math.max(0, (rig.stem - 0.12) / 0.15)), condense = Math.pow(Math.min(1, sx), thin);
  const lower = Math.pow(Math.min(1, top1 / top), thin);
  // (a dot grows by Dots' Size no further than its counter guard lets it, so it doesn't run into the stem under it)
  const kdot = kd > 1 && bs[0]?.dot ? 1 + Math.min(kd - 1, dotRoom / Math.max(1, ...bs.map(b => Math.hypot(b.x - cx, b.y - cy)))) : kd;
  const geo = [0, 1].map(axis => bs.map(b => {
    if (b.dot) return axis ? gyDot(cy) - cy + (b.y - cy) * (kdot - 1) : gx(cx) - cx + (b.x - cx) * (kdot - 1);
    if (b.cap) return axis ? gy(b.y) - b.y : gx(b.x) - b.x;
    // (the stroke runs as its edge does, read more surely there than off the skeleton; and its middle is half its
    // thickness in from the edge: the skeleton forks out to a square end's corners, and runs on into a join)
    const ax = b.x + b.nx * b.w, ay = b.y + b.ny * b.w;
    const sy = gy(ay + 0.5) - gy(ay - 0.5), ox = b.x - ax, oy = b.y - ay;
    const along = ox * b.tx + oy * b.ty, across = oy * b.tx - ox * b.ty;
    let ex = b.tx * sx, ey = b.ty * sy;
    const l = Math.hypot(ex, ey) || 1; ex /= l; ey /= l;
    const thick = across * (1 + (condense - 1) * ey * ey + (lower - 1) * ex * ex);
    // (as far as the edge faces this way; along it, where the skeleton is read less surely, by its own point)
    const h = axis ? b.ny * b.ny : b.nx * b.nx;
    return axis ? h * (gy(ay) + along * b.ty * sy + ex * thick) + (1 - h) * gy(b.y) - b.y
      : h * (gx(ax) + along * b.tx * sx - ey * thick) + (1 - h) * gx(b.x) - b.x;
  }));
  for (const g of geo) bs.forEach((b, i) => { if (b.corner) g[i] = (g[(i - 1 + n) % n] + g[(i + 1) % n]) / 2; });
  // (a side keeps clear of the end it runs into, which is carried with the sides below)
  // (and a heavier weight's runs read as on a stroke's end, in none of the ends found (edgeMoves' orphans), carried as ends
  // too: kept still, a comic's V's foot, two runs cut across either side of its point, stood where it was drawn as its
  // strokes thickened out round it, a notch between two spikes)
  const ends = !weighed(mv) ? endsOf(rig, r, mv) : [...sideEnds(rig, r), ...cutEnds(rig, r), ...(mv.kv > 1 + REWEIGHED ? orphans : [])], inEnd = new Uint8Array(n), md = (i: number) => ((i % n) + n) % n;
  // (the line a side lies along, facing straight off it, by a foot drawn level on it (withFeet), if any)
  const lineOf = (q: Bone) => { const c = rig.ctx, tol = Math.max(6, 0.02 * c.cap); return q.corner || Math.abs(q.ny) <= END_ON_LINE ? undefined : [0, c.cap, ...(c.lower ? [c.xh, c.asc, c.desc] : [])].find(L => Math.abs(q.y - L) < tol && !!rig.thin?.feet.some(F => Math.abs(F.line - L) < 1 && byFoot(F, q, tol, c.cap))); };
  for (const { a, b } of ends) for (let i = a + 1; i < b; i++) inEnd[md(i)] = 1;
  const shift = (axis: number, i: number) => bs[i].corner ? geo[axis][i] : ease(geo[axis], bs, i, j => !bs[j].corner && !inEnd[j]);
  // (whether sample i's middle lies in a join's bulge, thinReads)
  const atJoin = (i: number) => { const j = rig.thin?.near[r][i] ?? -1; return j >= 0 && rig.thin!.zone[j].length > 0; };
  const onFoot = (i: number) => { const j = rig.thin?.near[r][i] ?? -1; return j >= 0 && rig.thin!.footDir[j] !== 0; };
  // (whether the outline from corner i, the way dir, curves away by more than CROTCH_BEND within `len` of it)
  const bends = (i: number, dir: number, len: number) => {
    const a = bs[md(i + dir)];
    let gone = 0;
    for (let k = 2; k < n && gone < len; k++) {
      const q = bs[md(i + dir * k)];
      if (q.corner) break;
      gone += Math.hypot(q.x - bs[md(i + dir * (k - 1))].x, q.y - bs[md(i + dir * (k - 1))].y);
      if (a.tx * q.tx + a.ty * q.ty < CROTCH_BEND) return true;
    }
    return false;
  };
  // (a lighter weight's crotch where a stem's straight side meets an edge leaving it at a slant and curving away, an arch
  // or a bowl leaving its stem (archCrotches): where the two edges, as moved, meet again, each read off its own samples
  // past the crotch; and its corners, two cut a few units apart, and what lies between them, all there)
  const plainAt = (j: number) => { const q = bs[md(j)]; return { x: q.x + shift(0, md(j)) - q.nx * moved[md(j)], y: q.y + shift(1, md(j)) - q.ny * moved[md(j)] }; };
  const groups = mv.lighter && !ARCH_OFF ? (archCrotches(rig).get(r) ?? []).filter(G => !G.trap) : [];
  const groupOf = (i: number) => groups.find(G => md(i - G.first) <= md(G.last - G.first));
  const meetOf = (G: ArchCrotch): { M: P; w: number } | null => {
    // (a notch between two curves read off both, the one before as the stem's side is)
    const S = G.stem || -1, C = -S, sEnd = S > 0 ? G.last : G.first, cEnd = S > 0 ? G.first : G.last;
    const sa = plainAt(sEnd + S * ARCH_FROM), sc = plainAt(sEnd + S * ARCH_RUN), ca = plainAt(cEnd + C * ARCH_FROM), cc = plainAt(cEnd + C * ARCH_RUN);
    const ux = sc.x - sa.x, uy = sc.y - sa.y, vx = cc.x - ca.x, vy = cc.y - ca.y, den = ux * vy - uy * vx;
    if (Math.abs(den) < 0.1 * Math.hypot(ux, uy) * Math.hypot(vx, vy)) return null;
    const t = ((ca.x - sa.x) * vy - (ca.y - sa.y) * vx) / den, M = { x: sa.x + ux * t, y: sa.y + uy * t };
    // (a crotch the curve comes into at a slant shallower than ARCH_STEEP, met again further from where its own edges put
    // it than ARCH_REACH of the curve's stroke as thick as it is now, less and less there: a geometric q's bowl, met again
    // far down the stem at Thin, its thin arm, the round inside it as it was, pinched off; and any, further than
    // ARCH_REACH_STEEP of the thinner of its two strokes, the stem's or the curve's, as far as the uprights thin apart from
    // the bars past Weight (MoveMap.apart, Verticals): the curve's edge, a heavy stroke now, run on straight met the
    // hairline stem 80 units down from the bowl, a b's bowl's end a tail down its stem)
    const thick = (i: number) => { const k = md(i), j = rig.thin?.near[r][k] ?? -1; return j >= 0 ? Math.max(1, rig.thin!.s[j] * k0[k]) : 1; };
    const own = plainAt(cEnd), far = Math.hypot(M.x - own.x, M.y - own.y), Rc = thick(cEnd + C * ARCH_RUN), Rs = Math.min(Rc, thick(sEnd + S * ARCH_RUN));
    const ease = (reach: number, [a, b]: number[]) => Math.min(1, Math.max(0, (b - reach) / (b - a)));
    return { M, w: Math.min(G.shallow ? ease(far / Rc, ARCH_REACH) : 1, 1 - mv.apart * (1 - ease(far / Rs, ARCH_REACH_STEEP))) };
  };
  const groupMeets = new Map<ArchCrotch, { M: P; w: number } | null>();
  const archMeet = (i: number): { M: P; w: number } | null => {
    const G = groupOf(i);
    if (!G) return null;
    if (!groupMeets.has(G)) { const m = meetOf(G); groupMeets.set(G, m && m.w > 0 ? m : null); }
    return groupMeets.get(G)!;
  };
  const blend: number[] = [];
  const meets = new Map<number, P>();
  // (the joins whose crotches these draw again, which rebuildJoins then leaves as they are)
  const arched = (i: number) => { const j = rig.thin?.near[r][i] ?? -1; if (j < 0) return; let set = ARCHED.get(mv); if (!set) ARCHED.set(mv, set = new Set()); for (const k of rig.thin!.zone[j]) set.add(k); };
  // (whether sample i lies in the bulge of a join an arch's or a bowl's outside crotch is met again in, archCrotches)
  const archJoins = new Set(mv.lighter && !ARCH_OFF ? [...archCrotches(rig).values()].flat().filter(G => !G.trap).flatMap(G => G.joins) : []);
  const inArchJoin = (i: number) => { const j = rig.thin?.near[r][i] ?? -1; return j >= 0 && rig.thin!.zone[j].some(z => archJoins.has(z)); };
  // (whether sample i and ARCH_RUN on from it the way dir lie along a stem's straight upright side)
  const stemSide = (i: number, dir: number) => { for (let k = 0; k < ARCH_RUN; k++) { const q = bs[md(i + dir * k)]; if (q.corner || !q.straight || Math.abs(q.nx) <= ARCH_UPRIGHT || q.seg !== bs[i].seg) return false; } return true; };
  // (where each point would be with its stroke as thick as it was)
  const base: P[] = [];
  // (Contrast turned round, in a font not contrasty: how far from (x, y) along (mx, my) the ring's edges as moved lie, short
  // of a stroke's new thickness, the samples within FLAT_LINE of corner i left out)
  const thinAcross = mv.reweighed && mv.kv < 1 - REWEIGHED && !mv.contrasty && !mv.lighter ? (() => {
    const ps = bs.map((b, j) => ({ x: b.x + shift(0, j) - b.nx * moved[j], y: b.y + shift(1, j) - b.ny * moved[j] })), keep = Math.max(2, rig.ref().stem * mv.kv);
    return (i: number, x: number, y: number, mx: number, my: number) => {
      const l = Math.hypot(mx, my) || 1, ux = mx / l, uy = my / l;
      let hit = Infinity;
      for (let k = 0; k < n; k++) {
        const k1 = md(k + 1);
        if (Math.min(md(k - i), md(i - k)) <= FLAT_LINE || Math.min(md(k1 - i), md(i - k1)) <= FLAT_LINE) continue;
        const P0 = ps[k], P1 = ps[k1], sx = P1.x - P0.x, sy = P1.y - P0.y, den = ux * sy - uy * sx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((P0.x - x) * sy - (P0.y - y) * sx) / den, w = ((P0.x - x) * uy - (P0.y - y) * ux) / den;
        if (t > 0 && w >= 0 && w <= 1 && t < hit) hit = t;
      }
      return hit - keep;
    };
  })() : null;
  const out = bs.map((b, i) => {
    // (a longer serif reaches no further than two fifths of the room beside its tip, so two reaching toward each other
    // across a counter's foot keep apart)
    const kS = ks > 1 && b.serifDx ? 1 + Math.min(ks - 1, 0.4 * b.serifRoom / Math.max(1, b.serifReach * sx)) : ks;
    const x = b.x + shift(0, i) + b.serifDx * (kS - 1) * sx, y = b.y + shift(1, i);
    base[i] = { x, y };
    // (where thinMoves pins it: a flag's top past its stem's side at that side's corner, a dot with corners made smaller
    // about its middle)
    const pin = pins?.get(i);
    if (pin) return { x: pin.x + x - b.x, y: pin.y + y - b.y };
    if (!b.corner && groups.length) { const m = archMeet(i); if (m && m.w >= 1) { meets.set(i, m.M); arched(i); return m.M; } if (m) blend.push(i); }
    if (!b.corner) return { x: x - b.nx * moved[i] + (slide?.[i].x ?? 0), y: y - b.ny * moved[i] + (slide?.[i].y ?? 0) };
    // a corner sits where its two edges, each moved its own way, meet again (not much further out than they moved); a
    // lighter weight's crotch where strokes join, along the ways the strokes' middles run (thinMoves)
    const away = (tx: number, ty: number) => { const o = { x: ty, y: -tx }; return o.x * b.nx + o.y * b.ny > 0 ? { x: -o.x, y: -o.y } : o; };
    const ways = crotches?.get(i) ?? { inx: b.inx!, iny: b.iny!, outx: b.outx!, outy: b.outy! };
    // (its edges' moves less how far a round kept on its line took them, which carries the corner whole, `up`)
    const i0 = (i - 1 + n) % n, i1 = (i + 1) % n, up = hugY?.[i] ?? 0;
    const o1 = away(ways.inx, ways.iny), o2 = away(ways.outx, ways.outy), d1 = moved[i0] - (hug?.[i0] ?? 0), d2 = moved[i1] - (hug?.[i1] ?? 0);
    const det = o1.x * o2.y - o1.y * o2.x;
    // (a serif's edges slid along themselves too, edgeMoves, which where they meet at a slant moves no line they lie on, but
    // where they run on alike carries the corner with them)
    // (a cupped serif's corner, its tip's (serifLinedRig), as the points either side of it go: its edges, a hairline apart and
    // near alike, meet again where they moved along themselves no more than across, and it stayed as its serif slid, cut off)
    if (rig.cupped && slide && serifRuns(rig, r).cup[i]) { const go = (j: number) => ({ x: -bs[j].nx * moved[j] + slide[j].x, y: -bs[j].ny * moved[j] + slide[j].y }), g0 = go(i0), g1 = go(i1); return { x: x + (g0.x + g1.x) / 2, y: y + (g0.y + g1.y) / 2 + up }; }
    let mx = (o1.x * d1 + o2.x * d2) / 2 + (slide ? (slide[i0].x + slide[i1].x) / 2 : 0), my = (o1.y * d1 + o2.y * d2) / 2 + (slide ? (slide[i0].y + slide[i1].y) / 2 : 0);
    if (Math.abs(det) >= 0.25) { mx = (d1 * o2.y - d2 * o1.y) / det; my = (o1.x * d2 - o2.x * d1) / det; }
    const lim = 1.6 * Math.max(Math.abs(d1), Math.abs(d2), 0.01), l = Math.hypot(mx, my);
    // (a lighter weight's crotch where its strokes' edges, as thin as they are now, cross, carried as the corner is)
    const at = crotches?.get(i)?.at;
    if (groups.length) { const m = archMeet(i); if (m && m.w >= 1) { meets.set(i, m.M); arched(i); return m.M; } if (m) blend.push(i); }
    // (but a serif's root cut square, its straight edge meeting its stem's straight upright side, where those two, each
    // moved as a line, meet: the strokes' middles' ways, a wedge serif's level where its top slopes, set it under the
    // serif's top, a notch there at Light)
    const straightRun = (dir: number) => { for (let k = 1; k <= 3; k++) { const q = bs[md(i + dir * k)]; if (q.corner || !q.straight) return false; } return true; };
    const serifSide = (dir: number) => { for (let k = 1; k <= 3; k++) if (!bs[md(i + dir * k)].serifDx) return false; return true; };
    if (mv.lighter && at && concaveAt(b) && straightRun(-1) && straightRun(1) && (serifSide(-1) !== serifSide(1)) && Math.abs(bs[md(i + (serifSide(-1) ? 2 : -2))].nx) > 0.9) {
      const e1 = away(b.inx!, b.iny!), e2 = away(b.outx!, b.outy!), de = e1.x * e2.y - e1.y * e2.x;
      if (Math.abs(de) >= CROTCH_SQUARE * 0.5) {
        const ex = (d1 * e2.y - d2 * e1.y) / de, ey = (e1.x * d2 - e2.x * d1) / de;
        if (Math.hypot(ex, ey) <= lim) return { x: x + ex, y: y + ey + up };
      }
    }
    if (mv.lighter && at) return { x: at.x + x - b.x, y: at.y + y - b.y };
    if (mv.lighter && concaveAt(b)) {
      // (a lighter weight's corner inside a join, where the outline turns away from the ink: between strokes that meet at a
      // slant, where they meet again along straight edges (a V's crotch runs down between its strokes toward its foot as
      // they thin), no further than the ink ahead; where an edge curves away from it, or they run alike, in along
      // its own normal to the nearest ink of the strokes drawn again (thinMoves): a b's arch, leaving its stem at a slant
      // and curving up, meets the thinner stem where the arch's middle runs on into it, where its edge, carried on
      // straight, would meet the stem far down)
      // (slanted where its own edges meet at a slant, or the strokes' middles do: a 6's hairline leaves its bowl at a slant
      // though the middles meet square across)
      const own = away(b.inx!, b.iny!), own2 = away(b.outx!, b.outy!), slant = Math.abs(det) < CROTCH_SQUARE || Math.abs(own.x * own2.y - own.y * own2.x) < CROTCH_SQUARE;
      if (Math.abs(det) < 0.25 || (slant && (bends(i, -1, 1.5 * lim) || bends(i, 1, 1.5 * lim)))) return { x: x - b.nx * moved[i], y: y - b.ny * moved[i] + up };
      const far = Math.min(slant ? Infinity : lim, 0.95 * inkAhead(rig, b, mx / (l || 1), my / (l || 1)));
      if (l > far) { mx *= far / l; my *= far / l; }
      return { x: x + mx, y: y + my + up };
    }
    // (Contrast turned round, a crotch met again against the way both its edges went goes as they went, between them: read
    // off the ways a design's ink trap's short curves leave its corner at, other than its edges run, an industrial h's
    // crotch over its arch went fifty units on into the arch, cutting it off its hairline stem)
    if (mv.reweighed && mv.kv < 1 - REWEIGHED) {
      const g = (j: number) => ({ x: -bs[j].nx * moved[j] + (slide?.[j].x ?? 0), y: -bs[j].ny * moved[j] + (slide?.[j].y ?? 0) }), g0 = g(i0), g1 = g(i1);
      if (mx * (g0.x + g1.x) + my * (g0.y + g1.y) < 0) return { x: x + (g0.x + g1.x) / 2, y: y + (g0.y + g1.y) / 2 + up };
    }
    // (a fair font's crotch where Contrast turned round thins one of its strokes, its edges near alike: met again no
    // further into the join than JOIN_KEEP of the ink ahead nor JOIN_MOVE of the way its thinning edge moved, so the
    // strokes stay joined; met where they meet, a C0
    // italic's M's thick diagonal, thinned, parted from its stem under the serif, the corner carried up past the serif's
    // top, and its N's so, and its x's hairline arm, the crotch under it carried up past its top)
    if (mv.reweighed && mv.kv < 1 - REWEIGHED && fairFont(rig) && concaveAt(b) && Math.min(d1, d2) < 0) {
      const far = Math.min(lim, JOIN_MOVE * -Math.min(d1, d2), JOIN_KEEP * inkAhead(rig, b, mx / (l || 1), my / (l || 1)));
      if (l > far) { mx *= far / l; my *= far / l; }
      return { x: x + mx, y: y + my + up };
    }
    // (a heavier weight's crotch at a V its edges grow into freely (veeOf), where their lines meet further off than
    // VEE_CORNER times the further either moved: off along a round leaving it, a spike over Mainline's n's arch; moved out
    // along its own normal no further than the nearer edge went, the edges as moved cross past it and the overlap is cut
    // off there, where they meet (untangle). Not a serif's root, square, met again where its edges meet: so moved, a slit
    // there)
    if (vees && (vees[i0] || vees[i1]) && concaveAt(b) && l > VEE_CORNER * Math.max(Math.abs(d1), Math.abs(d2))) { const d = Math.min(Math.abs(d1), Math.abs(d2)); return { x: x - b.nx * d, y: y - b.ny * d + up }; }
    // (moved as lines, a corner inside a join, its edges both thickening, where they meet again as far as MEET_REACH times
    // they moved, as straightRuns meets them: held to 1.6 times, a corner sharper than about 77 degrees stood short of
    // where its edges meet, a spur of paper at each corner of a heavy sans's e's eye)
    if (linesMove(rig, mv) && concaveAt(b) && d1 > 0 && d2 > 0 && l <= MEET_REACH * Math.max(d1, d2)) return { x: x + mx, y: y + my + up };
    if (l > lim) { mx *= lim / l; my *= lim / l; }
    // (Contrast turned round, a corner inside a join no further on than a stroke's new thickness short of the outline across,
    // as its edges are moved: met where its edges meet, an industrial 9's and g's crotch under the bowl, its ink trap's
    // short curve thinned as the stem's side, went on out past the stem's thinned far side and cut the stem off the bowl)
    if (thinAcross && concaveAt(b)) {
      const far = thinAcross(i, x, y, mx, my);
      if (far < Math.hypot(mx, my)) { const t = Math.max(0, far) / (Math.hypot(mx, my) || 1); mx *= t; my *= t; }
    }
    return { x: x + mx, y: y + my + up };
  });
  // (a shallow crotch met again part of the way, archMeet's w)
  for (const i of blend) { const m = archMeet(i)!; out[i] = { x: out[i].x + (m.M.x - out[i].x) * m.w, y: out[i].y + (m.M.y - out[i].y) * m.w }; meets.set(i, out[i]); arched(i); }
  // (and a contrasty font's side running into a stroke's end cut along a line (lineCuts), which stays: its points by the
  // corner, moved out, went past the line, a Didone's W's feet's outer corners hanging 24 units under the baseline at
  // Verticals 100)
  if (mv.reweighed && mv.kv > 1 + REWEIGHED && mv.contrasty) {
    // (not a hairline tip's corner, carried whole after (hairTips): the side's points brought to where it was clipped stayed
    // there as the tip went on, a sliver off a Didone's u's top serif at Weight midway)
    const cutAt = lineCuts(rig, r), tipAt = hairTipMarks(rig, r);
    bs.forEach((b, i) => {
      if (!b.corner || concaveAt(b) || tipAt[i]) return;
      for (const d of [-1, 1]) {
        const e = bs[md(i - d)];
        // (a straight side only: read off a C's curved beak, its top's corner went out past the bar's round beside it, a hole
        // where they crossed at Weight 100)
        let straight = true;
        for (let k = 1; k <= 6 && straight; k++) straight = !!bs[md(i + k * d)].straight && !bs[md(i + k * d)].corner;
        if (!cutAt[md(i - d)] || !straight) continue;
        const up = e.ny < 0 ? 1 : -1, yc = out[md(i - d)].y, P = out[md(i + 2 * d)], Q = out[md(i + 6 * d)];
        // (the corner itself, met again past the line, back on it where the side as moved crosses it: a fat face's M's
        // and N's thick strokes' tops stood a spike over the capitals' line)
        if ((out[i].y - yc) * up > 0 && Math.abs(Q.y - P.y) > 1e-6) out[i] = { x: P.x + (yc - P.y) * (Q.x - P.x) / (Q.y - P.y), y: yc };
        for (let k = 1, j = md(i + d); k <= SIDE_PAST && !bs[j].corner && !inEnd[j]; k++, j = md(j + d)) if ((out[j].y - out[i].y) * up > 0) out[j] = { x: out[i].x, y: out[i].y };
      }
    });
  }
  // (a contrasty font's hairline tips carried whole (hairTips): each point moved along its own normal, the tip's edges a
  // hairline apart and their normals read across to each other's, its edges came together and the tip pinched off, a
  // speck past the Didone's W's top serifs, and dropped, its room 11 units less at once at Weight 75; a speck past its N's
  // left foot)
  if (mv.reweighed && mv.contrasty) hairTips(rig, r, bs, base, out);
  if (mv.lighter) { carryFillets(); pinPoints(); stretchRounds(); hairRoots(); holdBrackets(); if (mv.apart) carryCuts(); }
  else if (mv.reweighed) { carryRounds(); if (linesMove(rig, mv)) straightRuns(); else if (mv.kv > 1 + REWEIGHED && fairFont(rig)) straightRuns(true); else if (reversed(mv)) straightRuns('rev'); else if (mv.kv > 1 + REWEIGHED && mv.contrasty) straightRuns('thick'); }
  if (mv.reweighed && mv.kv < 1 - REWEIGHED && plainSans(rig)) flatCrotches();
  if (mv.reweighed && mv.kv < 1 - REWEIGHED) joinNecks();
  if (mv.reweighed && (mv.kv > 1 + REWEIGHED || mv.kh > 1 + REWEIGHED)) cornersPast(mv.kv > 1 + REWEIGHED && fairFont(rig));
  // (a heavier weight's tab off a stem's side, a crossbar's end past an f's or a t's stem, goes out with that side as far
  // as it moved, keeping its own moves along the stem, so it reaches as far past the stem as before and isn't swallowed by
  // it, as a serif goes out with its stem's edge: each moved alone, the stem's side went out past the bar's end, which
  // thickens only up and down, and Mainline's f's bar stood on the stem's left a twelfth of what it had)
  // (as far as the side now stands, where its straight edge was laid on one line as moved, straightRuns, further out than
  // its own move: Parlance's f's and t's bars' left ends went under their stems at Weight 100)
  if (mv.reweighed && mv.kv > 1 + REWEIGHED) for (const T of tabsOf(rig, r)) {
    const ox = -bs[md(T.c0 - T.dir)].nx, oy = -bs[md(T.c0 - T.dir)].ny, at = (j: number) => (out[j].x - base[j].x) * ox + (out[j].y - base[j].y) * oy;
    const own = Math.min(moved[md(T.c0 - T.dir)], moved[md(T.c1 + T.dir)]), g = linesMove(rig, mv) ? Math.max(own, Math.min(at(md(T.c0 - T.dir)), at(md(T.c1 + T.dir)))) : own;
    if (!(g > 0)) continue;
    for (let k = md(T.c0 + T.dir); k !== T.c1; k = md(k + T.dir)) {
      const cur = (out[k].x - base[k].x) * ox + (out[k].y - base[k].y) * oy, more = Math.min(g - cur, isFinite(bs[k].gap) ? openOf(bs[k].gap, bs[k].w) : Infinity);
      if (more > 0) out[k] = { x: out[k].x + ox * more, y: out[k].y + oy * more };
    }
  }
  // (how far this outline's heavy strokes thicken or thin as asked, each side by its own reading of its stroke: a
  // heavy face's sides, read with their joins taken out, often read thinner than they are and move less)
  const heavy = ends.some(e => e.ball) ? heavyShare() : 1, shut = mv.reweighed && mv.kv > 1 + REWEIGHED && rig.leans();
  // a stroke's end goes with the two sides it joins, as they now stand: turned, moved and made as much larger or
  // smaller as the stroke is now thicker or thinner across them, so a cap stays as wide as its stroke and a round
  // end round (the end's own points, read off the skeleton where it forks out to its corners, would part). A ball,
  // thicker than the neck it hangs from, goes as far as it is one with the point it hangs from (`pin` of the way from
  // one side to the other) and is made as much smaller or larger round it as a stroke as thick as it (ballK), so it
  // stays round and the curve it runs on with keeps its way into it; not turned, as two sides close together, much
  // nearer than the ball is wide, give no sure turn
  for (const { a, b, ball, pin } of ends) {
    const A = bs[md(a)], B = bs[md(b)], A1 = out[md(a)], B1 = out[md(b)];
    const ux = B.x - A.x, uy = B.y - A.y, vx = B1.x - A1.x, vy = B1.y - A1.y, l2 = ux * ux + uy * uy;
    if (l2 < 1e-6 || vx * vx + vy * vy < 1e-6) continue;
    const hx = A.x + ux * pin, hy = A.y + uy * pin, hx1 = A1.x + vx * pin, hy1 = A1.y + vy * pin, k = ball ? ballK(a, b, hx, hy) : 1;
    // (a lighter weight's end in a font with serifs running from a side lying along a line, a slab's y's tail's beak,
    // standing on the descender's line and cut off straight up: made as much smaller along the line and off it as its
    // two sides now stand, not turned: turned with its top, thinned, it ran its foot down under the line, a wedge under the
    // tail at Thin)
    const L = !ball && mv.lighter && rig.serifed() ? lineOf(A) ?? lineOf(B) : undefined;
    const kx = L !== undefined && Math.abs(B.x - A.x) > 1 ? (B1.x - A1.x) / (B.x - A.x) : NaN, ky = L !== undefined ? ((L === lineOf(A) ? B1.y : A1.y) - L) / ((L === lineOf(A) ? B.y : A.y) - L) : NaN;
    // (only an end cut off across the line's way at a slant, its sides' points as far apart along the line as END_SPREAD
    // of the way between them, and turned by the move by more than END_TURNED: a slab's foot's end, cut square off its
    // line, its sides one over the other, is made smaller as it is)
    // (and only one cut, a corner in it: a ball's or a teardrop's, round, on its line, an old style's y's, is carried whole)
    let cornered = false;
    for (let i = a + 1; i < b && !cornered; i++) cornered = bs[md(i)].corner;
    const level = cornered && kx > 0 && ky > 0 && kx < 1.5 && ky < 1.5 && Math.abs(B.x - A.x) > END_SPREAD * Math.sqrt(l2) && Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) > END_TURNED;
    // (a heavier weight's end, made larger as its sides part, reaching on along its stroke into the paper ahead of its tip
    // no further than OPEN_HEAVY of that room, as a side grows into a counter: drawn larger whole, two ends facing each other
    // across a gap ran into one another, a typewriter's A's feet's serifs, its E's arms' serifs on the right)
    let deep = 1;
    if (mv.reweighed && !ball && !bs[0]?.dot) {
      let D = 0, tip = -1;
      for (let i = a + 1; i < b; i++) { const p = bs[md(i)], t = Math.abs((p.y - A.y) * ux - (p.x - A.x) * uy) / Math.sqrt(l2); if (t > D) { D = t; tip = md(i); } }
      // (less as far as a serif's end slid out toward that paper with its serif, edgeMoves)
      const kc = Math.sqrt((vx * vx + vy * vy) / l2), room = tip >= 0 ? Math.max(0, openOf(bs[tip].gap, bs[tip].w) - Math.abs(slid?.[tip] ?? 0)) : Infinity;
      if (D > 0 && D * (kc - 1) > room) deep = (1 + room / D) / kc;
    }
    // (a reweighed letter's end cut across a level stroke, one of its sides lying on a line and the other off it, a slab
    // serif's tip: made as much taller from the side on the line as its two sides now stand apart, and moved along as
    // they are, not turned nor made deeper: turned, its side off the line going out further, the round of its corner on
    // the line stood up past it, a bump over a typewriter's Y's arms that the heights then lowered the whole top by)
    const lineAt = (q: Bone) => Math.abs(q.ny) > 0.97 && [0, rig.ctx.cap, ...(rig.ctx.lower ? [rig.ctx.xh, rig.ctx.asc, rig.ctx.desc] : [])].some(L => Math.abs(q.y - L) < 2.5);
    const onA = mv.reweighed && !ball && !level && lineAt(A), onB = mv.reweighed && !ball && !level && lineAt(B);
    // (only made taller: made shorter as its stroke thins, it is made as much smaller every way, or its tip, as deep as
    // before on a far thinner stroke, came to a needle)
    const [On, Off, On1, Off1] = onA ? [A, B, A1, B1] : [B, A, B1, A1], kf = Math.abs(Off.y - On.y) > 1 ? (Off1.y - On1.y) / (Off.y - On.y) : 1;
    // (a heavier weight's end cut straight across kept on its line as the heights and the width move it: its corners where
    // its sides, as moved, meet the line, and its points between laid as far between them as between the design's. Turned
    // with its sides, an M's stem's top, its side into the diagonal moving up as it moved out, ran its corner up past the
    // capitals' line, and the letter, its heights kept, came down with it, its other corner 18 units under the line)
    const cut = linesMove(rig, mv) && !ball && !bs[0]?.dot ? flatEnd(a, b) : null;
    const flat = !cut && onA !== onB && Math.abs(uy) > Math.abs(ux) && Math.abs(B.y - A.y) > 1 && kf >= 1;
    // (a contrasty font's hairline tip, its sides nearer than TIP_SHORT of the capitals' height, turned by its move more
    // than TIP_SWING: carried with its sides, unturned, each point as far along as between them. Turned, a Didone's n's
    // foot serif's tip, 5 units across, its top lifting as the serif thickened and its foot on the line, swung 40 units
    // out across the counter's foot into the other serif's)
    const tip = mv.contrasty && mv.reweighed && !ball && !level && l2 < (TIP_SHORT * rig.ctx.cap) ** 2 && Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) > TIP_SWING;
    for (let i = a + 1; i < b; i++) {
      const p = bs[md(i)], dx = p.x - A.x, dy = p.y - A.y, s = (dx * ux + dy * uy) / l2, t = (dy * ux - dx * uy) / l2;
      if (tip) { const f = Math.min(1, Math.max(0, s)); out[md(i)] = { x: p.x + (A1.x - A.x) * (1 - f) + (B1.x - B.x) * f, y: p.y + (A1.y - A.y) * (1 - f) + (B1.y - B.y) * f }; continue; }
      if (cut) { out[md(i)] = cut(p); continue; }
      if (flat) { const f = Math.min(1, Math.max(0, (p.y - On.y) / (Off.y - On.y))); out[md(i)] = { x: p.x + On1.x - On.x + (Off1.x - Off.x - On1.x + On.x) * f, y: On1.y + (p.y - On.y) * kf }; continue; }
      const qx = level ? A1.x + dx * kx : A1.x + s * vx - deep * t * vy, qy = level ? L! + (p.y - L!) * ky : A1.y + s * vy + deep * t * vx;
      out[md(i)] = ball ? { x: qx + (hx1 + (p.x - hx) * k - qx) * ball, y: qy + (hy1 + (p.y - hy) * k - qy) * ball } : { x: qx, y: qy };
      // (a script's end, made larger, out into the paper it faces no further than OPEN_HEAVY of it, as a side grows into a
      // counter: a hook's ball, Serenade's a's, ran into the stem's top it curls toward, its bowl shut)
      if (shut && isFinite(p.gap)) { const k = md(i), o = -((out[k].x - base[k].x) * p.nx + (out[k].y - base[k].y) * p.ny) - openOf(p.gap, p.w); if (o > 0) out[k] = { x: out[k].x + p.nx * o, y: out[k].y + p.ny * o }; }
      // (and no further than OPEN of the paper the way it goes, read across the design: slid along its side as the end
      // grew, Serenade's a's hook's tip ran down into the stem's top below it, the narrow way into its bowl, shut)
      if (shut && isFinite(p.gap)) {
        const k = md(i), dx = out[k].x - base[k].x, dy = out[k].y - base[k].y, d = Math.hypot(dx, dy);
        // (held fully from twice as square out on, not at all slid along its edge, so it eases in as the end turns out)
        const w = d > 1 ? Math.min(1, Math.max(0, (-(dx * p.nx + dy * p.ny) / d - SHUT_INTO) / SHUT_INTO)) : 0;
        if (w > 0) { const f = 1 - w * (1 - Math.min(1, OPEN * paperAlong(rig, p, dx / d, dy / d) / d)); out[k] = { x: base[k].x + dx * f, y: base[k].y + dy * f }; }
      }
    }
    // (and a round pen's (fontPen) each of its points no further out into the paper before it than OPEN_HEAVY of that
    // room, as a side's: made larger whole, a round end swells every way, and a comic's s's and G's ends, as its strokes
    // thickened past twice, ran into the strokes they turn toward and shut their openings; and a contrasty design's as its
    // hairlines thicken (hairsIn): a fat face's e's terminal, thickened sixfold at Contrast 0, met its bar and shut the e)
    if (((mv.reweighed && mv.kv > 1 + REWEIGHED && fontPen(rig.font)) || hairsIn(mv) > 0) && !ball) for (let i = a + 1; i < b; i++) {
      const p = bs[md(i)], o = out[md(i)], g = openOf(p.gap, p.w), d = -(o.x - gx(p.x)) * p.nx - (o.y - gy(p.y)) * p.ny;
      if (isFinite(g) && d > g) out[md(i)] = { x: o.x + (d - g) * p.nx, y: o.y + (d - g) * p.ny };
    }
    // (a lighter weight's corner inside a join next to where the end meets its side, a ball's neck, goes with that side,
    // as far off it as it was, made as much smaller as the end is, where it would cross the outline: where its two
    // edges, the end's and its stroke's, meet again lies far off where they run near alike, past the stroke's other side,
    // and the outline, crossing itself, parted the end off; a script r's ball, a speck dropped from Weight 0 to 0.03. Not
    // an end turned over, its sides changing places)
    if (mv.lighter && ux * vx + uy * vy > 0) for (const [c, sd] of [[md(b + 1), md(b)], [md(a - 1), md(a)]]) {
      const q = bs[c];
      if (!q.corner || !concaveAt(q) || crotches?.get(c)?.at) continue;
      if (!ringCrossesAt(out, c)) continue;
      const f = Math.min(1, Math.sqrt((vx * vx + vy * vy) / l2));
      out[c] = { x: out[sd].x + (q.x - bs[sd].x) * f, y: out[sd].y + (q.y - bs[sd].y) * f };
    }
  }
  // (a heavier sans's straight side running into a level end on a line, moved out along its normal, goes no further up
  // or down than the corner where it now meets the line: its points by the corner, moved past the line, stood a spike over
  // the end, a geometric k's arm's top at Weight 100, and the heights, lowering the letter by as much, cut its end aslant;
  // and an even slab's (evenSlab): a soft slab's N's diagonal, thickened out under the baseline by its foot, and the heights,
  // lifting the letter by as much, hung its stem's foot's corner 20 units under the line at Verticals 100)
  if (linesMove(rig, mv) || (mv.reweighed && mv.kv > 1 + REWEIGHED && evenSlab(rig))) {
    const c = rig.ctx, lines = [0, c.cap, ...(c.lower ? [c.xh, c.asc, c.desc] : [])];
    bs.forEach((b, i) => {
      if (!b.corner || concaveAt(b)) return;
      for (const d of [-1, 1]) {
        const e = bs[md(i - d)], L = lines.find(L => Math.abs(b.y - L) < 2.5 && Math.abs(e.y - L) < 2.5);
        if (L === undefined || !e.onLine) continue;
        const up = L > 0 ? 1 : -1;
        for (let k = 1, j = md(i + d); k <= SIDE_PAST && !bs[j].corner && bs[j].straight && !inEnd[j]; k++, j = md(j + d)) if ((out[j].y - out[i].y) * up > 0) out[j] = { x: out[i].x, y: out[i].y };
      }
    });
  }
  if (mv.reweighed && mv.kv > 1 + REWEIGHED && !fontPen(rig.font)) endsPast();
  return out;

  /** Whether the end between sides a and b is cut straight across, all its points within LINE_END units of the line
      between the first and the last, that line level on one of the letter's lines (within LINE_NEAR of its capitals'
      height: a crossbar's end past an f's stem, upright, goes out with the bar), and its sides leave that line at a slant
      steeper than LINE_SIDE (the sine): where its sides, each on its line as moved, meet that line as the heights and the
      width move it, at points X0 and X1, and the design's corners there, C0 and C1. */
  function flatEnd(a: number, b: number) {
    const A = bs[md(a)], B = bs[md(b)], P = bs[md(a + 1)], Q = bs[md(b - 1)], ex = Q.x - P.x, ey = Q.y - P.y, el = Math.hypot(ex, ey);
    if (b - a < 3 || el < 1) return null;
    const cx = ex / el, cy = ey / el, c = rig.ctx, lines = [0, c.cap, ...(c.lower ? [c.xh, c.asc, c.desc] : [])];
    if (Math.abs(cy) > LINE_SIDE || !lines.some(L => Math.abs((P.y + Q.y) / 2 - L) < LINE_NEAR * c.cap)) return null;
    for (let i = a + 1; i < b; i++) if (Math.abs((bs[md(i)].x - P.x) * cy - (bs[md(i)].y - P.y) * cx) > LINE_END) return null;
    if (Math.abs(A.tx * cy - A.ty * cx) < LINE_SIDE || Math.abs(B.tx * cy - B.ty * cx) < LINE_SIDE) return null;
    // (where the line through (px, py) the way (ux, uy) meets the line through (qx, qy) the way (vx, vy))
    const meet = (px: number, py: number, ux: number, uy: number, qx: number, qy: number, vx: number, vy: number) => { const t = ((qx - px) * vy - (qy - py) * vx) / (ux * vy - uy * vx); return { x: px + ux * t, y: py + uy * t }; };
    const P1 = { x: gx(P.x), y: gy(P.y) }, Q1 = { x: gx(Q.x), y: gy(Q.y) }, fx = Q1.x - P1.x, fy = Q1.y - P1.y;
    const C0 = meet(A.x, A.y, A.tx, A.ty, P.x, P.y, cx, cy), C1 = meet(B.x, B.y, B.tx, B.ty, P.x, P.y, cx, cy);
    const X0 = meet(out[md(a)].x, out[md(a)].y, A.tx, A.ty, P1.x, P1.y, fx, fy), X1 = meet(out[md(b)].x, out[md(b)].y, B.tx, B.ty, P1.x, P1.y, fx, fy);
    const l0 = (C1.x - C0.x) * cx + (C1.y - C0.y) * cy, l1 = (X1.x - X0.x) * fx + (X1.y - X0.y) * fy;
    if (!(Math.abs(l0) > 1 && l0 * l1 > 0) || ![X0, X1].every(X => Number.isFinite(X.x) && Number.isFinite(X.y))) return null;
    // (each point as far along from C0 toward C1 as drawn, as far off the line)
    return (p: P): P => { const u = ((p.x - C0.x) * cx + (p.y - C0.y) * cy) / l0, off = (p.x - P.x) * cy - (p.y - P.y) * cx, fl = Math.hypot(fx, fy) || 1; return { x: X0.x + (X1.x - X0.x) * u + off * fy / fl, y: X0.y + (X1.y - X0.y) * u - off * fx / fl }; };
  }

  /** Contrast turned round, the uprights thinned: two strokes leaving a stem's side together, a K's arm and leg, came off it
      as a V of ink whose tip lay inside the stem; where the stem, thinned, stands short of that tip as the strokes now are,
      the two crotches either side, each met again where its stroke's edge carried on meets the stem's side, past one
      another, are set on the stem's side either side of where the strokes' edges now meet, NECK of the way they stood
      apart: met again past one another, a geometric K's and k's arm and leg parted from its hairline stem at Contrast 0. */
  function joinNecks() {
    const cs: { i: number; s: number; a: number }[] = [];
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (!b.corner || !concaveAt(b)) continue;
      // (the side thinned the more is the stem's, the other the stroke's leaving it)
      const p = md(i - 1), q = md(i + 1), s = moved[p] < moved[q] ? p : q, a = s === p ? q : p;
      if (bs[s].straight && bs[a].straight && !bs[s].corner && !bs[a].corner && moved[s] < moved[a]) cs.push({ i, s, a });
    }
    const meet = (P: P, tx: number, ty: number, Q: P, ux: number, uy: number): P | null => {
      const det = tx * uy - ty * ux;
      if (Math.abs(det) < 0.2) return null;
      const t = ((Q.x - P.x) * uy - (Q.y - P.y) * ux) / det;
      return { x: P.x + tx * t, y: P.y + ty * t };
    };
    for (let u = 0; u < cs.length; u++) for (let v = u + 1; v < cs.length; v++) {
      const A = cs[u], B = cs[v], sA = bs[A.s], sB = bs[B.s];
      // (on one stem's side: alike, in line, near, their sides running away from one another with the strokes between)
      if (sA.nx * sB.nx + sA.ny * sB.ny < 0.99 || Math.abs((bs[B.i].x - bs[A.i].x) * sA.nx + (bs[B.i].y - bs[A.i].y) * sA.ny) > 2) continue;
      const dx = bs[B.i].x - bs[A.i].x, dy = bs[B.i].y - bs[A.i].y, d = Math.hypot(dx, dy);
      if (d < 1 || d > NECK_FAR * (sA.w + sB.w)) continue;
      const ux = dx / d, uy = dy / d;
      if ((sA.x - bs[A.i].x) * ux + (sA.y - bs[A.i].y) * uy >= 0 || (sB.x - bs[B.i].x) * ux + (sB.y - bs[B.i].y) * uy <= 0) continue;
      // (the strokes' edges' tip, in the design inside the stem, as moved outside its moved side)
      const aA = bs[A.a], aB = bs[B.a], T0 = meet(aA, aA.tx, aA.ty, aB, aB.tx, aB.ty), T = meet(out[A.a], aA.tx, aA.ty, out[B.a], aB.tx, aB.ty);
      if (!T0 || !T || (T0.x - sA.x) * sA.nx + (T0.y - sA.y) * sA.ny <= 0 || (T.x - out[A.s].x) * sA.nx + (T.y - out[A.s].y) * sA.ny > 0) continue;
      const o = out[A.s], at = (T.x - o.x) * ux + (T.y - o.y) * uy, h = NECK * d / 2;
      out[A.i] = { x: o.x + ux * (at - h), y: o.y + uy * (at - h) };
      out[B.i] = { x: o.x + ux * (at + h), y: o.y + uy * (at + h) };
    }
  }
  /** Contrast turned round, in a font without serifs, a crotch cut flat on the letter's outside (a short edge, FLAT_CROTCH
      samples or fewer, between two corners turning away from the ink) drawn to where the edges either side of it now
      meet: a stem thinned to a
      hairline beside an arch thickened, the corner on the stem's side went in with it and the arch's out with the arch,
      the cut between them drawn out into a ledge, a humanist n's, m's, h's and r's at Contrast 0. */
  function flatCrotches() {
    // (on the letter's outside only: a counter's corners drawn so, a 4's foot's, went out past the outside as its strokes
    // thinned and opened it)
    const wound = (q: Bone[]) => Math.sign(q.reduce((t, p, k) => { const w = q[(k + 1) % q.length]; return t + p.x * w.y - w.x * p.y; }, 0));
    if (wound(bs) !== wound(rig.bones.reduce((m, q) => (q.length > m.length ? q : m), rig.bones[0]))) return;
    // (each edge's way as moved over FLAT_LINE samples toward the cut: read at its last sample alone, a stem's side curving
    // a little into the crotch met the arch's edge on the far side of the hairline stem, a jog down an h's stem)
    const way = (q: number, d: number) => { const f = md(q - d * FLAT_LINE), dx = out[q].x - out[f].x, dy = out[q].y - out[f].y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
    for (let i = 0; i < n; i++) {
      if (!bs[i].corner || !concaveAt(bs[i])) continue;
      let j = -1;
      for (let k = 1; k <= FLAT_CROTCH; k++) { const q = bs[md(i + k)]; if (q.corner) { if (concaveAt(q)) j = md(i + k); break; } }
      if (j < 0) continue;
      const a = md(i - 1), c = md(j + 1);
      let plain = true;
      for (let k = 0; k <= FLAT_LINE && plain; k++) plain = !bs[md(a - k)].corner && !bs[md(c + k)].corner;
      if (!plain) continue;
      const A = out[a], C = out[c], ua = way(a, 1), uc = way(c, -1), det = ua.x * uc.y - ua.y * uc.x;
      if (Math.abs(det) < 0.2) continue;
      const dx = C.x - A.x, dy = C.y - A.y;
      let s = (dx * uc.y - dy * uc.x) / det;
      const u = (ua.x * dy - ua.y * dx) / -det;
      if (!(s > 0 && u > 0)) continue;
      // (no further along than a stem's thickness as now short of the outline ahead, this ring's as moved and the design's
      // ink: on through, the crotch came out past the stem's far side)
      const far = new Set<number>();
      for (let k = 0, m = md(c - a) + 2 * FLAT_LINE; k <= m; k++) far.add(md(a - FLAT_LINE + k));
      let hit = Infinity;
      for (let k = 0; k < n; k++) {
        if (far.has(k) && far.has(md(k + 1))) continue;
        const P0 = out[k], P1 = out[md(k + 1)], sx = P1.x - P0.x, sy = P1.y - P0.y, den = ua.x * sy - ua.y * sx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((P0.x - A.x) * sy - (P0.y - A.y) * sx) / den, w = ((P0.x - A.x) * ua.y - (P0.y - A.y) * ua.x) / den;
        if (t > 0.5 && w >= 0 && w <= 1 && t < hit) hit = t;
      }
      const ink = inkAhead(rig, bs[a], ua.x, ua.y), most = Math.min(hit, ink > 0 ? ink : Infinity) - Math.max(2, rig.ref().stem * mv.kv);
      if (most <= 0) continue;
      s = Math.min(s, most);
      const M = { x: A.x + s * ua.x, y: A.y + s * ua.y };
      for (let k = i; k !== c; k = md(k + 1)) out[k] = { ...M };
    }
  }

  /** A heavier weight's serifs' brackets (rounds inside a corner, the outline turning away from the ink ROUND_INSIDE or
      more in all, between an edge running level near a line, or an arm's (see `arms`), and a stem's upright side, as carryFillets reads them) no
      longer than ROUND_CARRY times as far as those edges move carried whole, as far as where the edges, each moved its own
      way, meet again moves: each point moved its own way, a round its stroke's side thickened past turned inside out, an
      old style's brackets bites out of its stems' tops and feet. */
  function carryRounds() {
    const lineYs = rig.ctx.lower ? [0, rig.ctx.xh, rig.ctx.asc, rig.ctx.desc] : [0, rig.ctx.cap];
    // (and in a font of bracketed serifs and some contrast, a straight level edge anywhere, an arm's or a bar's: moved its
    // own way, the round under an old style's E's and F's middle arms, its stem thickened past it, turned inside out, a
    // notch under each arm's root)
    const arms = fairFont(rig);
    const level = (q: Bone) => Math.abs(q.ty) < BRACKET_LEVEL && (lineYs.some(L => Math.abs(q.y - L) < BRACKET_NEAR * rig.ctx.cap) || (arms && !!q.straight)), upright = (q: Bone) => Math.abs(q.tx) < BRACKET_UPRIGHT;
    const away = bs.map((b, i) => {
      const p = bs[md(i - 1)], q = bs[md(i + 1)];
      if (b.corner || b.dot || inEnd[i] || crossEnd(b)) return false;
      return (q.tx - p.tx) * b.nx + (q.ty - p.ty) * b.ny < 0 && Math.abs(Math.atan2(p.tx * q.ty - p.ty * q.tx, p.tx * q.tx + p.ty * q.ty)) / 2 >= FILLET_TURN;
    });
    for (let s = 0; s < n; s++) {
      if (!away[s] || away[md(s - 1)]) continue;
      let e = s, arc = 0;
      while (e - s < n - 1 && away[md(e)]) { if (e > s) arc += Math.hypot(bs[md(e)].x - bs[md(e - 1)].x, bs[md(e)].y - bs[md(e - 1)].y); e++; }
      const a = md(s - 1), z = md(e), A = bs[a], Z = bs[z];
      const turn = Math.abs(Math.atan2(A.tx * Z.ty - A.ty * Z.tx, A.tx * Z.tx + A.ty * Z.ty));
      // (a serif's bracket, short, between an edge running level near a line and a stem's upright side: not a hook's or a
      // bowl's long round inside, carried whole the tail of a t, nor a crotch between strokes, a k's, which parted)
      // (in a fair font whose bars thin, its stems as they were (Contrast raised), as long as a short round goes: held to
      // ROUND_CARRY times its serif's thinning, a transitional's brackets at Contrast 100 stayed while the serifs' undersides
      // rose, each bracket pressed into its stem's side, a step at each)
      const thins = arms && mv.kh < 1 - REWEIGHED && Math.abs(mv.kv - 1) <= REWEIGHED && Math.min(moved[a], moved[z]) < 0;
      if (turn < ROUND_INSIDE || arc > (thins ? ROUND_SHORT * rig.ctx.cap : Math.min(ROUND_CARRY * Math.max(Math.abs(moved[a]), Math.abs(moved[z])), ROUND_SHORT * rig.ctx.cap))) continue;
      if (!((level(A) && upright(Z)) || (level(Z) && upright(A)))) continue;
      // (where the edges either side meet, as drawn and as moved)
      const meet = (P: P, Q: P) => { const den = A.tx * Z.ty - A.ty * Z.tx; if (Math.abs(den) < 1e-6) return null; const t = ((Q.x - P.x) * Z.ty - (Q.y - P.y) * Z.tx) / den; return { x: P.x + A.tx * t, y: P.y + A.ty * t }; };
      const C0 = meet(base[a], base[z]), C1 = meet(out[a], out[z]);
      if (!C0 || !C1) continue;
      const dx = C1.x - C0.x, dy = C1.y - C0.y;
      if (Math.hypot(dx, dy) > 3 * Math.max(Math.abs(moved[a]), Math.abs(moved[z]), 1)) continue;
      // (and only where it still meets each edge short of the corner at that edge's far end, as moved: carried past it, a
      // serif shorter than its stem thickens, an old style's b's head serif, was swallowed to a sliver)
      // (an end's corner by its side, carried only later with its end: the side it joins there)
      // (with Contrast turned round on a contrasty design (reversed), none where no corner comes within a quarter of the
      // outline: read off where the search stopped, round an n's counter, a fat face's foot serifs' brackets stayed, a hook
      // over each foot)
      const far = (from: number, dir: 1 | -1) => { let j = from, k = 0; for (; k < n / 4 && !bs[j].corner && !inEnd[j]; k++) j = md(j + dir); return k >= n / 4 && reversed(mv) ? -1 : inEnd[j] && j !== from ? md(j - dir) : j; };
      const fa = far(a, -1), fz = far(z, 1);
      if (fa >= 0 && (base[md(s)].x + dx - out[fa].x) * A.tx + (base[md(s)].y + dy - out[fa].y) * A.ty <= 0) continue;
      if (fz >= 0 && (out[fz].x - base[md(e - 1)].x - dx) * Z.tx + (out[fz].y - base[md(e - 1)].y - dy) * Z.ty <= 0) continue;
      for (let i = s; i < e; i++) { const k = md(i); out[k] = { x: base[k].x + dx, y: base[k].y + dy }; }
      // (and an edge's points either side that now lie past where the round meets it, on into the stroke the round was
      // carried out of, brought back to that point: left there, a slab's underside ran on into its stem past its bracket)
      const JA = out[md(s)], JZ = out[md(e - 1)];
      for (let k = 1; k < n / 4; k++) { const j = md(s - k); if (bs[j].corner || (out[j].x - JA.x) * A.tx + (out[j].y - JA.y) * A.ty <= 0) break; out[j] = { ...JA }; }
      for (let k = 0; k < n / 4; k++) { const j = md(e + k); if (bs[j].corner || (out[j].x - JZ.x) * Z.tx + (out[j].y - JZ.y) * Z.ty >= 0) break; out[j] = { ...JZ }; }
    }
  }

  /** A heavier weight's edges' points either side of a corner inside a join that now lie past it, along the edge the
      way it leaves the corner as drawn, brought back to it: an arm's or a bar's edge, moved off its line alone, stays
      where it was along it, and the stem's side going out past where it began, its first points were left inside the
      stem, a fold that read as a notch under an old style's F's middle arm's root at Weight 66, and, the heights moving
      the two runs apart, a sliver of paper inside a typewriter's L's foot and under its E's arms' serifs at Verticals 100.
      In a font drawn fair (`fair`), every such point as far as the edge runs on the way it leaves the corner, within
      PAST_TURN (on round a curl, an italic's r's ball's underside, all of it lying behind the corner that way, went into
      it, the ball and the paper under it one blot); else only along a straight edge, not an end's side (brought to
      the corner, a G's bar's round end, turned with it, stood up off the bar, a knob), and only by a corner gone with its
      other edge, lying nearer that edge's next point as moved than half its own move (one put far off both, where a
      crotch's edges meet further out, an old style's g's link at Weight and Verticals 100, took a long stretch of edge
      with it, and a counter's side with it). */
  function cornersPast(fair: boolean) {
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (!b.corner || !concaveAt(b) || inEnd[i]) continue;
      for (const dir of [-1, 1]) {
        if (!fair && Math.hypot(out[i].x - out[md(i - dir)].x, out[i].y - out[md(i - dir)].y) > Math.max(2 * STEP, 0.5 * Math.hypot(out[i].x - base[i].x, out[i].y - base[i].y))) continue;
        const q = bs[md(i + dir)], ex = q.x - b.x, ey = q.y - b.y, el = Math.hypot(ex, ey) || 1;
        for (let k = 1; k < n / 4; k++) {
          const j = md(i + dir * k);
          if (bs[j].corner || inEnd[j] || (!fair && (bs[j].dot || !bs[j].straight || inEnd[md(j + dir)])) || (out[j].x - out[i].x) * ex + (out[j].y - out[i].y) * ey > 0) break;
          if (fair && (bs[j].tx * ex + bs[j].ty * ey) * dir < PAST_TURN * el) break;
          out[j] = { ...out[i] };
        }
      }
    }
  }

  /** A heavier weight's end a stem's side has grown out past: the end's side, along the edge from a corner inside the
      join between them, now on the stem's ink side of that side's line as moved (a typewriter's G's bar's round end
      over its spur, the spur thickened under it at Verticals 100, the bar not). The end's points in the stem, and the
      edge's between, cut to where the end's outline crosses the stem's side, the corner put there: left, the round ran
      on into the stem and back out along its side, a notch under the bar's end; brought out to the corner and turned
      with it, it stood up off the bar, a knob. Not a round pen's (fontPen), whose ends are run smooth with its sides:
      cut, a comic's w's crotch between its middle stroke's top and its right one went in deeper on one side. */
  function endsPast() {
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (!b.corner || !concaveAt(b) || inEnd[i]) continue;
      for (const dir of [-1, 1]) {
        const S = bs[md(i - dir)];
        if (S.corner || !S.straight) continue;
        const C = out[i], inside = (q: P) => (q.x - C.x) * S.nx + (q.y - C.y) * S.ny, grew = Math.hypot(C.x - base[i].x, C.y - base[i].y);
        // (the end's side: the last point along the edge before the end's own, the edge straight to it, and no further from
        // the corner than END_PAST times the corner moved: read on round a counter, the side of an m's middle stem, put
        // inside its first stem's side's line, far across, took the counter's whole outline to one point)
        let j = md(i + dir), straight = true;
        for (let k = 0; k < n / 4 && !inEnd[md(j + dir)] && !bs[j].corner && straight; k++) { straight = !!bs[j].straight; j = md(j + dir); }
        if (!straight || !inEnd[md(j + dir)] || bs[j].corner || !(inside(out[j]) > 1) || Math.hypot(bs[j].x - b.x, bs[j].y - b.y) > END_PAST * grew) continue;
        let m = md(j + dir);
        while (inEnd[m] && inside(out[m]) > 0) m = md(m + dir);
        if (!inEnd[m]) continue;
        const p = out[md(m - dir)], dp = inside(p), dm = inside(out[m]), t = dp / (dp - dm), X = { x: p.x + (out[m].x - p.x) * t, y: p.y + (out[m].y - p.y) * t };
        if (Math.hypot(X.x - C.x, X.y - C.y) > END_PAST * grew) continue;
        for (let k = i; k !== m; k = md(k + dir)) out[k] = { ...X };
      }
    }
  }

  /** A heavier weight's straight edges (a segment of the outline, no corner on it, STRAIGHT_RUN samples or more, not a
      serif's nor an end's) each laid on the line its middle half's points take as moved, and where two meet, at a corner
      or not, met again where those lines meet: turning away from the ink there, its points that went on past it brought
      back to it, as far as MEET_REACH times the edges moved; turning toward it, the corner (or the edge's last point) put
      on it, as far as a corner goes (1.6 times). Each point moved its own way, eased along the outline from one edge's move
      to the other's, an edge running into another it moves less or more far than bent toward it, a step where a Y's arm
      meets its stem, a spike at each of an A's counter's feet. In a font of bracketed serifs and some contrast (`fair`), its
      edges only laid on their lines, not its serifs', flags' or stems' heads', and not met again: each point moved by its
      own stroke as it read thicker or thinner along a straight side, an italic's stems and an old style's W's strokes came
      out bowed at Weight 100; met again, the side of an italic's n's stem and its exit's hairline, both straight, shut the
      paper between into a hole, and an old style's h's head and its stem's side into a spike. With Contrast turned round
      on a contrasty design (`'rev'`), every such edge but a serif's laid so, on the line its points mostly take, as
      far as the turn has come in (revIn), and not met again: a fat face's H's and N's stems' sides came out ragged. */
  function straightRuns(fair: boolean | 'rev' | 'thick' = false) {
    // (in a fair font only a stem's side: upright within FAIR_UPRIGHT, as thick as FAIR_THICK of a stem, facing paper at
    // least a stem wide, not a serif's, a flag's nor a stem's head: laid so, a hairline running beside a heavy stroke, an
    // italic's V's, N's or A's, stood off it a crack, and an A's counter shut)
    const { stem } = rig.ref(), fairSide = (b: Bone) => !b.flagDx && b.overStem < 0 && 2 * b.w >= FAIR_THICK * stem && Math.abs(b.nx) >= FAIR_UPRIGHT && b.gap >= stem;
    // (in a contrasty design's heavier weight (`'thick'`), every straight segment of a stroke as thick as FAIR_THICK of a
    // stem, read by its samples' middle: read sample by sample, a W's stroke's side, reading thinner by its foot, was laid
    // in part, and the rest, pushed out after it, stood off it in a kink)
    const segW = new Map<number, number[]>();
    if (fair === 'thick') bs.forEach(b => { if (b.straight && !b.corner) (segW.get(b.seg) ?? segW.set(b.seg, []).get(b.seg)!).push(2 * b.w); });
    const segThick = new Set([...segW].filter(([, ws]) => ws.sort((p, q) => p - q)[ws.length >> 1] >= FAIR_THICK * stem).map(([k]) => k));
    const thickSide = (b: Bone) => !b.flagDx && b.overStem < 0 && segThick.has(b.seg);
    const thickLines = fair === 'thick' ? [0, rig.ctx.cap, ...(rig.ctx.lower ? [rig.ctx.xh, rig.ctx.asc, rig.ctx.desc] : [])] : [];
    // (not one along a line, which the heights put back on it, snapFlatEdges)
    const serifed = rig.serifed(), plain = (i: number) => { const b = bs[i]; return b.straight && !b.corner && !b.dot && !b.cap && !b.onLine && !(serifed && b.serifDx) && !(fair === true && !fairSide(b)) && !(fair === 'thick' && !thickSide(b)) && !inEnd[i] && !pins?.has(i); };
    // (two straight segments running on along one line, the design's point between them, as one edge: each laid on its own
    // line, the one by a crotch, its points held to the narrow paper there, stood in from the one beyond, a step, and a code
    // face's V's edges, laid past each other above its crotch, pinched a speck of paper off under it at Verticals 100)
    const onOne = (a: number, b: number) => bs[a].seg === bs[b].seg || (bs[a].tx * bs[b].tx + bs[a].ty * bs[b].ty > STRAIGHT_ON && Math.abs((bs[b].x - bs[a].x) * bs[a].ty - (bs[b].y - bs[a].y) * bs[a].tx) < 1);
    const runs: { s: number; L: number; px: number; py: number; ux: number; uy: number; nx: number; ny: number; d: number; o: number; d0: number; d1: number }[] = [];
    for (let s = 0; s < n; s++) {
      if (!plain(s) || (plain(md(s - 1)) && onOne(md(s - 1), s))) continue;
      let L = 0;
      while (L < n && plain(md(s + L)) && (L === 0 || onOne(md(s + L - 1), md(s + L)))) L++;
      if (L < STRAIGHT_RUN || L >= n) continue;
      // (along the way the heights and the width put the edge, as far out as its points go but the last tenth (STRAIGHT_OUT):
      // by a crotch it runs into its points move no further than the narrow paper there lets them, and laid through them
      // all, an a's stem's side above its bowl leaned in to the bowl, a sliver of paper between; thinner, as far in as its
      // points' middling move)
      const A = bs[s], Z = bs[md(s + L - 1)], B0 = base[s], B1 = base[md(s + L - 1)];
      let ux = B1.x - B0.x, uy = B1.y - B0.y;
      const ul = Math.hypot(ux, uy);
      if (ul < 1e-6) { ux = A.tx; uy = A.ty; } else { ux /= ul; uy /= ul; }
      if (ux * (Z.x - A.x) + uy * (Z.y - A.y) < 0) { ux = -ux; uy = -uy; }
      // (its normal, out of the ink, as its points mostly face: one by a sharp tip may read facing the other way)
      let ox = uy, oy = -ux, face = 0;
      for (let k = 0; k < L; k++) face += ox * bs[md(s + k)].nx + oy * bs[md(s + k)].ny;
      if (face > 0) { ox = -ox; oy = -oy; }
      const offs = Array.from({ length: L }, (_, k) => { const i = md(s + k); return (out[i].x - base[i].x) * ox + (out[i].y - base[i].y) * oy; }).sort((p, q) => p - q);
      const mid = offs[L >> 1], o = mid < 0 || fair ? mid : offs[Math.min(L - 1, Math.floor(STRAIGHT_OUT * L))];
      const px = B0.x + ox * o, py = B0.y + oy * o;
      // (how much further out its first and last points go laid so)
      // (Contrast turned round, laid so as it comes in, revIn)
      const lay = fair === 'rev' ? revIn(mv) : 1, at = (i: number) => (out[i].x - base[i].x) * ox + (out[i].y - base[i].y) * oy, d0 = (o - at(s)) * lay, d1 = (o - at(md(s + L - 1))) * lay;
      for (let k = 0; k < L; k++) { const i = md(s + k), t = (out[i].x - px) * ux + (out[i].y - py) * uy; out[i] = { x: out[i].x + (px + ux * t - out[i].x) * lay, y: out[i].y + (py + uy * t - out[i].y) * lay }; }
      // (a contrasty design's heavier weight's, each point laid so no further out than its own room let it, nor past a line
      // its stroke ends on: laid as its segment's middle, a Didone's M's thick stroke's top, held back from its hairline
      // stem (veeRooms), stood past it a flag again, and its foot, by the vertex, went down under the baseline)
      if (fair === 'thick') for (let k = 0; k < L; k++) {
        const i = md(s + k), over = at(i) - (rooms?.[i] ?? Infinity);
        if (over > 0) out[i] = { x: out[i].x - ox * over, y: out[i].y - oy * over };
        for (const Ln of thickLines) {
          // (only a stroke ending on the line, its points by it: not a y's tail's stroke on through the baseline)
          const near = THICK_LINE * rig.ctx.cap, ends = Math.min(Math.abs(A.y - Ln), Math.abs(Z.y - Ln)) < near;
          if (!ends || Math.abs(bs[i].y - Ln) > near || Math.abs(uy) < 1e-3) continue;
          const y = gy(Ln), side = Math.sign((A.y + Z.y) / 2 - Ln);
          if ((out[i].y - y) * side < 0) { const t = (y - out[i].y) / uy; out[i] = { x: out[i].x + ux * t, y }; }
        }
      }
      runs.push({ s, L, px, py, ux, uy, nx: -ox, ny: -oy, d: Math.abs(o), o, d0, d1 });
    }
    // (in a fair font, an edge laid so whose end runs within LAID_CORNER samples into a corner inside a join, met where the
    // outline beyond the corner, as moved, comes out across the laid line, the points between brought there: the corner,
    // set where its edges' moves meet, the stem's side's thinning into the crotch, stood inside the stem as laid, and the
    // arch's edge, brought back to it (cornersPast), cut a notch of paper down into the stem's side where an old style's
    // h's, n's and m's arches leave their stems at Weight 100)
    if (fair === true) for (const R of runs) for (const dir of [1, -1]) {
      const e = dir > 0 ? md(R.s + R.L - 1) : R.s, side = (q: P) => (q.x - R.px) * R.nx + (q.y - R.py) * R.ny;
      let c = -1;
      for (let k = 1; k <= LAID_CORNER; k++) { const j = md(e + dir * k); if (inEnd[j] || bs[j].dot) break; if (bs[j].corner) { if (concaveAt(bs[j])) c = j; break; } }
      if (c < 0 || side(out[c]) <= 1) continue;
      let last = -1, X: P | null = null;
      for (let k = 1; k <= n >> 3; k++) {
        const a = md(c + dir * (k - 1)), b = md(c + dir * k);
        if (inEnd[b] || bs[b].dot) break;
        const sa = side(out[a]), sb = side(out[b]);
        if (sb <= 0) { const t = sa / (sa - sb); X = { x: out[a].x + (out[b].x - out[a].x) * t, y: out[a].y + (out[b].y - out[a].y) * t }; last = a; break; }
      }
      if (!X || Math.hypot(X.x - base[c].x, X.y - base[c].y) > LAID_REACH * Math.max(R.d, 1)) continue;
      for (let k = 1; k < n; k++) { const i = md(e + dir * k); out[i] = { ...X }; if (i === last) break; }
      // (and its own points gone on past there)
      for (let k = 0; k < R.L; k++) { const i = md(e - dir * k); if (((out[i].x - X.x) * R.ux + (out[i].y - X.y) * R.uy) * dir <= 0) break; out[i] = { ...X }; }
    }
    // (the outline between two such edges, a round no longer than ROUND_RUN samples, or running on from one into a curve,
    // ROUND_FADE samples, going out as much further as the edge beside it went, from one edge's to the other's, or less and
    // less: each point moved its own way, an Industrial n's foot's rounded corners stood off its stem's side and its foot as
    // laid, a spike at each)
    const runAt = new Int32Array(n).fill(-1);
    runs.forEach((R, k) => { for (let j = 0; j < R.L; j++) runAt[md(R.s + j)] = k; });
    // (two meeting next along the outline, at a corner, or round a little round no longer than MEET_ROUND samples, or
    // neither, met again where their lines meet)
    const met = new Uint8Array(n);
    for (let r1 = 0; r1 < (fair ? 0 : runs.length); r1++) {
      const R = runs[r1], S = runs[(r1 + 1) % runs.length];
      if (R === S) continue;
      const e = md(R.s + R.L - 1), between = md(S.s - e) - 1;
      if (between > MEET_ROUND || (between === 0 && bs[e].seg === bs[S.s].seg)) continue;
      let clear = true;
      for (let k = 1; k <= between; k++) { const q = bs[md(e + k)]; if (inEnd[md(e + k)] || q.dot || q.onLine || q.cap) clear = false; }
      if (!clear) continue;
      const det = R.ux * S.uy - R.uy * S.ux;
      if (Math.abs(det) < MEET_PARALLEL) continue;
      const t = ((S.px - R.px) * S.uy - (S.py - R.py) * S.ux) / det, X = { x: R.px + R.ux * t, y: R.py + R.uy * t };
      // (turning away from the ink and both thickening, as far as MEET_REACH, a round inside the corner filled; else as far
      // as a corner goes, at a corner or none, a round on the outside of one left to go out with them, below)
      const away = S.ux * R.nx + S.uy * R.ny < 0, fill = away && R.o > 0 && S.o > 0, reach = (fill ? MEET_REACH : 1.6) * Math.max(R.d, S.d, 1);
      if (!fill && between > 1 || (!fill && between === 1 && !bs[md(e + 1)].corner)) continue;
      if (Math.hypot(X.x - out[e].x, X.y - out[e].y) > reach || Math.hypot(X.x - out[S.s].x, X.y - out[S.s].y) > reach) continue;
      for (let k = 1; k <= between; k++) { out[md(e + k)] = { ...X }; met[md(e + k)] = 1; }
      if (away) {
        for (let k = 0; k < R.L; k++) { const i = md(e - k); if ((out[i].x - X.x) * R.ux + (out[i].y - X.y) * R.uy <= 0) break; out[i] = { ...X }; }
        for (let k = 0; k < S.L; k++) { const i = md(S.s + k); if ((out[i].x - X.x) * S.ux + (out[i].y - X.y) * S.uy >= 0) break; out[i] = { ...X }; }
      } else if (between === 0) out[e] = { ...X };
    }
    // (and one meeting an edge along a line within LINE_GAP samples, round a corner drawn as a little round, met again on the
    // line: each point moved its own way, a round foot's, an Industrial n's, went down under the baseline, and the letter,
    // its heights kept, up with it, its stems' sides off their feet)
    // (the edges along lines met so, by where along its line, as drawn, each was met (c) and is met now (x))
    const lined = new Map<number, { lo?: { c: number; x: number }; hi?: { c: number; x: number }; to: number; y: number }>();
    for (const R of fair ? [] : runs) for (const dir of [1, -1]) {
      const from = dir > 0 ? md(R.s + R.L - 1) : R.s;
      let g = 1;
      while (g <= LINE_GAP && !bs[md(from + dir * g)].onLine && runAt[md(from + dir * g)] < 0 && !inEnd[md(from + dir * g)] && !bs[md(from + dir * g)].dot) g++;
      const F = bs[md(from + dir * g)];
      // (only as the edge thickens: thinned, a soft sans's stem's round foot met on the baseline left a needle)
      if (g > LINE_GAP || g < 2 || !F.onLine || Math.abs(R.uy) < LINE_SIDE || R.o <= 0) continue;
      const y = gy(F.y), X = { x: R.px + R.ux * (y - R.py) / R.uy, y };
      // (as far from where the design's corner would be as a corner goes, 1.6 times the edge moved; a sharper one, its
      // corner a round on the outside, keeps its points but those gone on past the line, put back on it)
      const A = bs[R.s], Z = bs[md(R.s + R.L - 1)], cx = A.x + (Z.x - A.x) * (F.y - A.y) / (Z.y - A.y);
      if (Math.abs(Z.y - A.y) < 1e-6 || Math.hypot(X.x - gx(cx), 0) > 1.6 * Math.max(R.d, 1)) {
        for (let k = -R.L + 1; k < g; k++) { const i = md(from + dir * k); if ((out[i].y - y) * (bs[i].y - F.y) < 0) out[i] = { x: out[i].x, y }; }
        continue;
      }
      for (let k = 1; k < g; k++) { out[md(from + dir * k)] = { ...X }; met[md(from + dir * k)] = 1; }
      // (and its own points gone on past the line brought back to it)
      for (let k = 0; k < R.L; k++) { const i = md(from - dir * k); if ((out[i].y - y) * (bs[i].y - F.y) > 0) break; out[i] = { ...X }; }
      let lo = md(from + dir * g), hi = lo;
      while (bs[md(lo - 1)].onLine && md(lo - 1) !== hi) lo = md(lo - 1);
      while (bs[md(hi + 1)].onLine && md(hi + 1) !== lo) hi = md(hi + 1);
      const E = lined.get(lo) ?? { to: hi, y };
      E[dir > 0 ? 'lo' : 'hi'] = { c: cx, x: X.x };
      lined.set(lo, E);
    }
    // (an edge along a line met so at both ends, a stem's foot, an arm's top: its points laid as far between where it is met
    // now as they lay between where it was met, along the line; each as the width moves it, it stood off the edges' corners
    // put on the line, a ledge by each, Industrial's x's arms' tops)
    for (const [lo, E] of lined) {
      if (!E.lo || !E.hi || Math.abs(E.hi.c - E.lo.c) < 1) continue;
      for (let i = lo, k = 0; k < n; i = md(i + 1), k++) { const u = (bs[i].x - E.lo.c) / (E.hi.c - E.lo.c); out[i] = { x: E.lo.x + (E.hi.x - E.lo.x) * u, y: E.y + bs[i].y - bs[lo].y }; if (i === E.to) break; }
    }
    // (not into an end, a corner, a dot or an edge along a line, which go their own ways)
    const own = (i: number) => inEnd[i] || bs[i].corner || bs[i].dot || bs[i].onLine || bs[i].cap || met[i] === 1;
    const push = (i: number, d: number) => { out[i] = { x: out[i].x - bs[i].nx * d, y: out[i].y - bs[i].ny * d }; };
    for (const R of runs) {
      const e = md(R.s + R.L - 1);
      let g = 0;
      while (g < ROUND_RUN && runAt[md(e + 1 + g)] < 0 && !own(md(e + 1 + g))) g++;
      const S = runAt[md(e + 1 + g)] >= 0 ? runs[runAt[md(e + 1 + g)]] : null;
      if (S && S !== R && S.s === md(e + 1 + g) && g > 1) { for (let k = 0; k < g; k++) push(md(e + 1 + k), R.d1 + (S.d0 - R.d1) * (k + 1) / (g + 1)); continue; }
      for (let k = 0; k < ROUND_FADE; k++) { const i = md(e + 1 + k); if (runAt[i] >= 0 || own(i)) break; push(i, R.d1 * (1 - (k + 1) / (ROUND_FADE + 1))); }
    }
    for (const R of runs) {
      let g = 0;
      while (g < ROUND_RUN && runAt[md(R.s - 1 - g)] < 0 && !own(md(R.s - 1 - g))) g++;
      const S = runAt[md(R.s - 1 - g)] >= 0 ? runs[runAt[md(R.s - 1 - g)]] : null;
      if (S && S !== R && md(S.s + S.L - 1) === md(R.s - 1 - g) && g > 1) continue;
      for (let k = 0; k < ROUND_FADE; k++) { const i = md(R.s - 1 - k); if (runAt[i] >= 0 || own(i)) break; push(i, R.d0 * (1 - (k + 1) / (ROUND_FADE + 1))); }
    }
    // (a contrasty design's heavier weight's points either side of such an edge gone into its ink, round a round its side
    // grew past, put where the outline crosses its line, and its own points gone on past there brought back to it: moved
    // each its own way, the round folded back over itself, a hook that crosses nothing, a Didone's K's leg's foot at
    // Verticals 100, its side grown over its serif's round, an M's and a W's strokes' feet)
    if (fair === 'thick') for (const R of runs) for (const dir of [-1, 1] as const) {
      const e0 = dir < 0 ? R.s : md(R.s + R.L - 1), inside = (p: P) => (p.x - R.px) * R.nx + (p.y - R.py) * R.ny;
      let j = md(e0 + dir), k = 0;
      while (k < FOLD_BACK && inside(out[j]) > 0.5 && !inEnd[j] && !bs[j].dot && !bs[j].corner) { j = md(j + dir); k++; }
      if (k === 0 || k >= FOLD_BACK || inEnd[j] || bs[j].dot || bs[j].corner) continue;
      const P0 = out[j], P1 = out[md(j - dir)], d0 = inside(P0), d1 = inside(P1), f = d0 / (d0 - d1);
      const X = { x: P0.x + (P1.x - P0.x) * f, y: P0.y + (P1.y - P0.y) * f };
      for (let q = 1; q <= k; q++) out[md(j - dir * q)] = { ...X };
      for (let q = 0; q < R.L; q++) { const i = md(e0 - dir * q); if (((out[i].x - X.x) * R.ux + (out[i].y - X.y) * R.uy) * -dir >= 0) break; out[i] = { ...X }; }
    }
  }

  /** Where the uprights thin apart from the bars past Weight (MoveMap.apart, Verticals), a lighter weight's stroke ends cut
      straight across their stroke (thinMoves' cuts, which stay) carried with the samples either side of them, their
      corners, as they meet the sides again: each laid as far between the two as it lay between them as drawn. Left where
      they were, they ran on out past their corners, which went in with the far thinner stroke, a tab off each of a
      sans's stems' ends, a fleck off its p's and q's tops at Verticals 0. */
  function carryCuts() {
    for (const is of cuts ?? []) {
      const a = md(is[0] - 1), b = md(is[is.length - 1] + 1), A = bs[a], B = bs[b], ux = B.x - A.x, uy = B.y - A.y, l2 = ux * ux + uy * uy;
      if (a === b || l2 < 1) continue;
      for (const i of is) {
        const t = Math.min(1, Math.max(0, ((bs[i].x - A.x) * ux + (bs[i].y - A.y) * uy) / l2)), x = out[a].x + (out[b].x - out[a].x) * t, y = out[a].y + (out[b].y - out[a].y) * t;
        out[i] = { x: out[i].x + (x - out[i].x) * mv.apart, y: out[i].y + (y - out[i].y) * mv.apart };
      }
    }
  }

  /** A lighter weight's rounds inside a join (the outline turning away from the ink round a curve, between two strokes'
      edges, not much longer than the edges move: the inside of a b's foot, where its bowl's hairline curves into the stem)
      carried whole, as a crotch where those edges meet goes (see the corner above): each point moved its own way, along
      its own normal, a round's points fold over one another. A wider round, a counter's or a bowl's inside, moves point
      by point. */
  function carryFillets() {
    // (each sample's turn from the one before to the one after: away from the ink (a round inside a join), or toward it
    // (a round on the outside of a corner))
    const turns = (inside: boolean) => bs.map((b, i) => {
      const p = bs[md(i - 1)], q = bs[md(i + 1)];
      if (b.corner || b.dot || inEnd[i] || crossEnd(b) || b.w0 < 1) return 0;
      const a = Math.abs(Math.atan2(p.tx * q.ty - p.ty * q.tx, p.tx * q.tx + p.ty * q.ty)) / 2;
      return ((q.tx - p.tx) * b.nx + (q.ty - p.ty) * b.ny < 0) === inside ? a : 0;
    });
    // (a serif's bracket: a round inside a join on the letter's outside, between an edge running level near a line, the
    // serif's, and a stem's upright side)
    const lineYs = rig.ctx.lower ? [0, rig.ctx.xh, rig.ctx.asc, rig.ctx.desc] : [0, rig.ctx.cap];
    const level = (q: Bone) => Math.abs(q.ty) < BRACKET_LEVEL && lineYs.some(L => Math.abs(q.y - L) < BRACKET_NEAR * rig.ctx.cap), upright = (q: Bone) => Math.abs(q.tx) < BRACKET_UPRIGHT;
    const wound = (q: Bone[]) => Math.sign(q.reduce((t, p, i) => { const w = q[(i + 1) % q.length]; return t + p.x * w.y - w.x * p.y; }, 0));
    const outside = wound(bs) === wound(rig.bones.reduce((m, q) => (q.length > m.length ? q : m), rig.bones[0]));
    const later: { j: number; x: number; y: number; t: number }[] = [];
    for (const inside of [true, false]) {
    const turn = turns(inside);
    for (let s = 0; s < n; s++) {
      // (each run of samples turning the one way, from its first)
      if (turn[s] < FILLET_TURN || turn[md(s - 1)] >= FILLET_TURN) continue;
      let e = s, total = 0, arc = 0;
      while (e - s < n - 1 && turn[md(e)] >= FILLET_TURN) { total += turn[md(e)]; if (e > s) arc += Math.hypot(bs[md(e)].x - bs[md(e - 1)].x, bs[md(e)].y - bs[md(e - 1)].y); e++; }
      const a = md(s - 1), z = md(e), d1 = moved[a], d2 = moved[z];
      if (bs[a].w0 < 1 || bs[z].w0 < 1) continue;
      const wholeTo = 4 * Math.max(Math.abs(d1), Math.abs(d2)) + 10, carry = inside || rig.serifed() ? (arc > wholeTo ? 0 : 1) : Math.max(0, Math.min(1, 1 - (arc - wholeTo) / (FILLET_EASE * wholeTo)));
      // (a serif's bracket drawn again as the design's, made smaller about the corner its edges make as far as the stem
      // thinned, eased in from point by point as the stem thins less: point by point, a Didone's at Regular came out an S,
      // its foot's stem side moved further in than the serif's top. Not one carried whole, no longer than four times as
      // its edges move, unless it is long beside its stem (BRACKET_LONG) and the stem stands plumb (BRACKET_PLUMB), and
      // that so from a lighter weight on: a Didone's, carried whole at Light, its round kept as drawn on a stem a third as
      // thick, came out an S there too, or its foot drawn again square with a notch; not a fat face's, short beside its
      // stem, drawn again so at Regular, its head serif's tip drawn in to the stem, nor a script's on its slanting stem, a
      // p's foot's, which grew the p's ink by an eighth in a step of Weight. Drawn so over the round as it is carried, once
      // carried, not over its points each moved its own way: a long one drawn again part of the way, its round, carried
      // whole a step lighter, came in point by point at a jump, an Oldstyle's H's head's bracket 20 units at Weight 0.04;
      // and read off its stem's side moved to a hair, not by the unit as its foot moves it, so drawn again by as much more
      // each step, not by a sixth of the way at a time, a Didone's H's ink 6% at a step at Weight 0.18)
      if (inside && rig.serifed() && outside && total >= FILLET_MIN && ((level(bs[a]) && upright(bs[z])) || (level(bs[z]) && upright(bs[a])))) {
        const st = upright(bs[a]) ? a : z, sv = st === a ? z : a, S0 = base[st], V0 = base[sv], stem = stemSide(st, st === a ? -1 : 1);
        const cross = (P: P, u: P, Q: P, v: P) => { const den = u.x * v.y - u.y * v.x; if (Math.abs(den) < 1e-6) return null; const t = ((Q.x - P.x) * v.y - (Q.y - P.y) * v.x) / den; return { x: P.x + u.x * t, y: P.y + u.y * t }; };
        const us = { x: bs[st].tx, y: bs[st].ty }, uv = { x: bs[sv].tx, y: bs[sv].ty }, C0 = cross(S0, us, V0, uv), C1 = cross(out[st], us, out[sv], uv);
        const w = bs[st].w0, f = Math.min(1, (w + (fine?.[st] ?? moved[st])) / (w || 1));
        const long = arc >= BRACKET_LONG * w && Math.abs(bs[st].tx) < BRACKET_PLUMB, t0 = Math.max(0, Math.min(1, long ? (f - BRACKET_KEEP_LONG) / BRACKET_BLEND_LONG : (f - BRACKET_KEEP) / BRACKET_BLEND)), t = long ? t0 : t0 * (1 - carry);
        if (C0 && C1 && t > 0 && stem && arc <= BRACKET_ARC * w && Math.hypot(C0.x - S0.x, C0.y - S0.y) < 3 * Math.hypot(S0.x - V0.x, S0.y - V0.y)) {
          const at = Array.from({ length: e - s }, (_, k) => { const j = md(s + k); return { j, x: C1.x + (base[j].x - C0.x) * f, y: C1.y + (base[j].y - C0.y) * f, t }; });
          later.push(...at);
        }
      }
      // (no longer than its edges move, give or take, or a round on the outside of a corner, one of whose edges lies on a
      // line and stays, an L's foot: point by point, it would lift off the line its edge stays on; in a font without
      // serifs, an outside round a little longer carried part of the way, less as it is longer (FILLET_EASE): carried
      // whole or not at all, a blackletter n's foot's flick came off it at a step, its letter lifted 5 units, Cathedral's
      // n's ink 6% at Weight 0.185)
      const share = inside || !(flatOn(rig, bs[a]) || flatOn(rig, bs[z])) ? carry : 1;
      if (total < FILLET_MIN || share <= 0) continue;
      // (nor, outside, in a font without serifs, one running into a sharp corner, a stroke's cut end, which no round
      // stands for: a grotesque s's shoulder into its cut end, 130 units round, was carried whole 77 units at Weight 0.15,
      // its turn pinched to a hook, and not at 0.155, its edges' moves a little shorter, a step of 11% of its ink)
      if (!inside && !rig.serifed() && (bs[a].corner || bs[z].corner)) continue;
      // (nor, outside, one running on into a crotch within FILLET_CROTCH samples of either end: a stroke's curve on into
      // where it joins another, not a corner's round; carried whole, the samples by the crotch left as they moved, it
      // stood off them in a hook, a fat face's R's bowl and leg either side of their crotch at Regular, and a script's
      // arches into their stems in needles at Thin)
      if (!inside && [a, z].some((i, k) => { for (let j = 0; j <= FILLET_CROTCH; j++) { const q = bs[md(i + (k ? j : -j))]; if (q.corner && concaveAt(q)) return true; } return false; })) continue;
      // (a round inside a join only: a counter's tight round, its bowl's thin top above it, is no join's; and a round on
      // the outside of a corner, an L's, turning no further than most of a half turn, which a round end does)
      if (inside ? !atJoin(md(s + ((e - s) >> 1))) : total > ROUND_MOST) continue;
      // (nor the side running on from a stroke's end, the curve of an r's arm under its ear: carried, it lifts off its
      // stroke into the ear; nor, outside, one running into a ball, which, made smaller, moves further than any edge, so
      // the round's other end, carried with it, crosses its stroke: a fat face's r's arm into its ball)
      if (rig.ends[r].some(E => (inside || E.ball > 0) && [a, z].some(i => { for (let k = -2; k <= 2; k++) { const j = md(i + k); if (md(j - E.a) <= E.b - E.a) return true; } return false; }))) continue;
      // (nor a serif's bracket on a foot drawn level, which goes in point by point with the serif, to it)
      if (inside && onFoot(md(s + ((e - s) >> 1)))) continue;
      // (nor one running off a stem's straight side, which stretchRounds draws again as the design's round stretched to
      // meet the stem and the curve as they are now: carried with the stem's side, a long round, a monospace n's under its
      // thin shoulder, went past the shoulder's other edge, cutting the shoulder off)
      if (inside && (stemSide(a, -1) || stemSide(z, 1)) && inArchJoin(md(s + ((e - s) >> 1)))) continue;
      // (its edges, the ways in and out at its ends, met again)
      const A = bs[a], Z = bs[z], away = (tx: number, ty: number, ref: Bone) => { const o = { x: ty, y: -tx }; return o.x * ref.nx + o.y * ref.ny > 0 ? { x: -o.x, y: -o.y } : o; };
      const o1 = away(A.tx, A.ty, A), o2 = away(Z.tx, Z.ty, Z), det = o1.x * o2.y - o1.y * o2.x;
      if (Math.abs(det) < 0.25) continue;
      let mx = (d1 * o2.y - d2 * o1.y) / det, my = (o1.x * d2 - o2.x * d1) / det;
      const l = Math.hypot(mx, my), lim = 1.6 * Math.max(Math.abs(d1), Math.abs(d2), 0.01), slant = Math.abs(det) < CROTCH_SQUARE;
      if (slant && (bends(a, -1, 1.5 * lim) || bends(z, 1, 1.5 * lim))) continue;
      // (the corner its edges make, which the round stands for: where the ways in and out cross)
      const den = A.tx * Z.ty - A.ty * Z.tx, u = ((Z.x - A.x) * Z.ty - (Z.y - A.y) * Z.tx) / (den || 1e-9), C = { x: A.x + A.tx * u, y: A.y + A.ty * u };
      const far = Math.min(slant ? Infinity : lim, 0.7 * inkAhead(rig, C, mx / (l || 1), my / (l || 1)) || lim);
      if (l > far) { mx *= far / l; my *= far / l; }
      // (and a round turning most of a half turn, a slit's tip between two strokes, whose middle lies within SLIT_NEAR of
      // the strokes drawn again ahead of it, a third stroke closing the slit: no further than SLIT_PAST past them, where,
      // carried on to where its edges meet again, it cut into that stroke: a fat face's g's slit between its bowl and its
      // loop, its edges near parallel, carried 64 units along them into its link at Regular, broke the letter)
      if (inside && total > ROUND_MOST && rig.thin) {
        const L = Math.hypot(mx, my), m = md(s + ((e - s) >> 1)), ahead = thinAhead(rig, mv, base[m], mx / (L || 1), my / (L || 1));
        if (ahead < SLIT_NEAR && L > ahead + SLIT_PAST) { mx *= (ahead + SLIT_PAST) / L; my *= (ahead + SLIT_PAST) / L; }
      }
      for (let k = s; k < e; k++) { const j = md(k); out[j] = { x: out[j].x + (base[j].x + mx - out[j].x) * share, y: out[j].y + (base[j].y + my - out[j].y) * share }; }
    }
    for (const q of later) out[q.j] = { x: out[q.j].x + (q.x - out[q.j].x) * q.t, y: out[q.j].y + (q.y - out[q.j].y) * q.t };
    later.length = 0;
    }
  }

  /** A lighter weight's sharp points the rig left uncornered (a sample reading no thickness, where its normal is no
      surer than which way the point faces: a square foot's corner) where the edges either side of each, as they moved,
      meet when carried on straight; or, where they don't, near enough, midway between its neighbours. */
  function pinPoints() {
    bs.forEach((b, i) => {
      if (b.corner || b.dot || inEnd[i] || b.w0 >= 1) return;
      const [p0, p1, q1, q0] = [i - 2, i - 1, i + 1, i + 2].map(j => out[md(j)]), ux = p1.x - p0.x, uy = p1.y - p0.y, vx = q1.x - q0.x, vy = q1.y - q0.y;
      const den = ux * vy - uy * vx, mid = { x: (p1.x + q1.x) / 2, y: (p1.y + q1.y) / 2 };
      out[i] = mid;
      if (Math.abs(den) < 0.05 * Math.hypot(ux, uy) * Math.hypot(vx, vy)) return;
      const t = ((q1.x - p1.x) * vy - (q1.y - p1.y) * vx) / den, s = ((q1.x - p1.x) * uy - (q1.y - p1.y) * ux) / den;
      const P = { x: p1.x + ux * t, y: p1.y + uy * t };
      // (and no further out than a corner a sample or two from it: a Didone's h's foot serif's tip, its hairline's sides
      // meeting at a slant of a few degrees, carried 13 units out past its corner at Weight 0.52 and not at 0.515)
      const past = [-2, -1, 1, 2].some(d => { if (!bs[md(i + d)].corner) return false; const C = out[md(i + d)]; return (P.x - C.x) * (C.x - mid.x) + (P.y - C.y) * (C.y - mid.y) > 0; });
      if (!past && t >= 0 && s >= 0 && Math.hypot(P.x - mid.x, P.y - mid.y) < Math.hypot(p1.x - q1.x, p1.y - q1.y) + 5) out[i] = P;
    });
  }

  /** A lighter weight's round inside a join, between a stem's straight side and a curve leaving it (an n's counter's
      corner under its arch, a b's bowl's into its stem), or between a crotch met again along its edges (archMeet) and
      the curve: its samples, moved by the join's rounds, ran level out from the stem and turned up into the curve, a
      ledge. Drawn again from the stem's side as moved round to the curve where it runs on plain, in the corner the two
      make now, as full as the design's round is in its own; from a crotch met again, the design's piece turned and
      scaled onto it. Only in a join whose outside crotch archCrotches meets again, or in a font with serifs. */
  function stretchRounds() {
    // (whether this outline is a counter's, wound the other way from the letter's outside, its largest)
    const area = (q: Bone[]) => q.reduce((t, p, i) => { const w = q[(i + 1) % q.length]; return t + p.x * w.y - w.x * p.y; }, 0);
    const outer = rig.bones.reduce((m, q) => (Math.abs(area(q)) > Math.abs(area(m)) ? q : m), rig.bones[0]), counter = Math.sign(area(bs)) !== Math.sign(area(outer));
    // (and its middle's height: a round under a bowl's top, over it, not one at its foot)
    const midY = (Math.min(...bs.map(b => b.y)) + Math.max(...bs.map(b => b.y))) / 2;
    const inRun = (i: number) => { const b = bs[i]; return !b.corner && !b.straight && !b.dot && !inEnd[i] && atJoin(i); };
    const plain = (i: number, dir: number) => { for (let k = 0; k < 3; k++) { const j = md(i + dir * k), q = bs[j]; if (q.corner || q.straight || q.dot || inEnd[j] || atJoin(j)) return false; } return true; };
    for (let s = 0; s < n; s++) {
      if (!inRun(s) || inRun(md(s - 1))) continue;
      let e = s;
      while (e - s < n - 1 && inRun(md(e + 1))) e++;
      // (from the stem's side or the crotch, a, along the run, the way `on`, to where the curve runs on plain, z)
      const run0: number[] = [];
      for (let k = s; k <= e; k++) run0.push(md(k));
      // (a curve run on through the join, plain at both ends, past an arch's or a bowl's crotch met again, a geometric
      // q's counter by its stem: as its ends move, eased along it by length, not as the join's rounds put each, which took
      // its middle in further than its ends and left a bump at the end of that)
      if (plain(md(s - 1), -1) && plain(md(e + 1), 1) && run0.some(inArchJoin)) {
        const a = md(s - 1), z = md(e + 1), cum = [0];
        for (let k = 0; k <= run0.length; k++) { const p0 = bs[k ? run0[k - 1] : a], p1 = bs[k < run0.length ? run0[k] : z]; cum.push(cum[cum.length - 1] + Math.hypot(p1.x - p0.x, p1.y - p0.y)); }
        const total = cum[cum.length - 1] || 1;
        run0.forEach((j, k) => { const t = cum[k + 1] / total, m = moved[a] + (moved[z] - moved[a]) * t, b = bs[j]; out[j] = { x: base[j].x - b.nx * m, y: base[j].y - b.ny * m }; arched(j); });
        continue;
      }
      for (const [a, z0, on] of [[md(s - 1), md(e + 1), 1], [md(e + 1), md(s - 1), -1]] as const) {
        if (!plain(z0, on)) continue;
        const D0 = bs[a], P0 = out[a];
        if (meets.has(a)) {
          // (from a crotch met again: the design's piece turned and scaled onto it)
          const D1 = bs[z0], P1 = out[z0], dx = D1.x - D0.x, dy = D1.y - D0.y, px = P1.x - P0.x, py = P1.y - P0.y, l2 = dx * dx + dy * dy;
          if (l2 < 1) continue;
          const c = (dx * px + dy * py) / l2, sn = (dx * py - dy * px) / l2;
          for (let k = s; k <= e; k++) { const j = md(k), vx = bs[j].x - D0.x, vy = bs[j].y - D0.y; out[j] = { x: P0.x + c * vx - sn * vy, y: P0.y + sn * vx + c * vy }; arched(j); }
          break;
        }
        if (!stemSide(a, -on)) continue;
        // (only in a join an arch's or a bowl's outside crotch is met again in (archCrotches), or in a font with serifs where
        // a curve under STRETCH_HAIR of the stem's thickness leaves it, a fat face's counter's round under its bowl's top,
        // which, moved point by point, came out an S, a lump at Regular: elsewhere, an ink trap's, its round run into the
        // stem on a thin neck, kept as it was, and a typewriter's G's, its curve as thick as its stem, as it was)
        const thick = (i: number) => { const j = rig.thin?.near[r][i] ?? -1; return j >= 0 ? rig.thin!.s[j] : 0; };
        const serifRound = rig.serifed() && counter && thick(md(z0 + on * 2)) < STRETCH_HAIR * thick(md(a - on * 2));
        if (!run0.some(inArchJoin) && !serifRound) continue;
        const z = z0, D1 = bs[z], P1 = out[z], run: number[] = [];
        for (let k = 1; k < n; k++) { const j = md(a + on * k); if (j === z) break; run.push(j); }
        // (the stem's side as moved, read past the samples by the round, which the join's rounds may pull in off it, set
        // back on it; the curve's way where it runs on plain; and where the two lines cross, the corner the round turns)
        const q1 = out[md(a - on * (ARCH_RUN - 1))], q2 = out[md(a - on * (ARCH_RUN - 3))], c2 = out[md(z + on * 2)];
        let u0x = q2.x - q1.x, u0y = q2.y - q1.y, u1x = P1.x - c2.x, u1y = P1.y - c2.y;
        const l0 = Math.hypot(u0x, u0y), l1 = Math.hypot(u1x, u1y);
        if (l0 < 1 || l1 < 1) continue;
        u0x /= l0; u0y /= l0; u1x /= l1; u1y /= l1;
        const onStem = (q: P) => { const t = (q.x - q2.x) * u0x + (q.y - q2.y) * u0y; return { x: q2.x + u0x * t, y: q2.y + u0y * t }; };
        const corner = (A: P, ax: number, ay: number, B: P, bx: number, by: number) => {
          const den = ax * by - ay * bx;
          if (Math.abs(den) < ARCH_TURN) return null;
          const t = ((B.x - A.x) * by - (B.y - A.y) * bx) / den, w = ((B.x - A.x) * ay - (B.y - A.y) * ax) / den;
          return t > 0 && w > 0 ? { x: A.x + ax * t, y: A.y + ay * t, t, w } : null;
        };
        // (the design's own round: how far toward its corner it reaches, its middle against the corner's)
        const b2 = bs[md(a - on * 2)], c2d = bs[md(z + on * 2)], d0x = D0.x - b2.x, d0y = D0.y - b2.y, d1x = D1.x - c2d.x, d1y = D1.y - c2d.y;
        const dl0 = Math.hypot(d0x, d0y), dl1 = Math.hypot(d1x, d1y);
        if (dl0 < 1 || dl1 < 1 || !run.length) continue;
        const Xd = corner(D0, d0x / dl0, d0y / dl0, D1, d1x / dl1, d1y / dl1), Q0 = onStem(P0), X = corner(Q0, u0x, u0y, P1, u1x, u1y);
        if (!Xd || !X) continue;
        if (!run0.some(inArchJoin) && Xd.y < midY) continue;
        // (but, met again by no crotch, less and less where the two lines meet further out along both than the design's did,
        // from ROUND_GROW's first to none at its second, its stem and its curve leaving each other later: a round as full
        // would fill the corner, a fat face's a's counter's foot where its bowl's hairline runs into its stem, a wedge at
        // Thin; all at once, the a's ink stepped 11% at a Weight)
        const grow = Math.min(X.t / Xd.t, X.w / Xd.w), keep = run0.some(inArchJoin) ? 1 : Math.min(1, Math.max(0, (ROUND_GROW[1] - grow) / (ROUND_GROW[1] - ROUND_GROW[0])));
        if (keep <= 0) continue;
        const mid = bs[run[run.length >> 1]], cx = (D0.x + D1.x) / 2, cy = (D0.y + D1.y) / 2, vx = Xd.x - cx, vy = Xd.y - cy, vl = vx * vx + vy * vy;
        const f = Math.min(1, Math.max(0.3, vl > 1 ? (4 / 3) * ((mid.x - cx) * vx + (mid.y - cy) * vy) / vl : 0.55));
        // (the round from the stem's side to the curve, turned in the corner they make now, as full as the design's; each
        // of its samples as far along it as it was along the design's, by length)
        const C0 = { x: Q0.x + u0x * X.t * f, y: Q0.y + u0y * X.t * f }, C1 = { x: P1.x + u1x * X.w * f, y: P1.y + u1y * X.w * f };
        const cum = [Math.hypot(bs[run[0]].x - D0.x, bs[run[0]].y - D0.y)];
        for (let k = 1; k < run.length; k++) cum.push(cum[k - 1] + Math.hypot(bs[run[k]].x - bs[run[k - 1]].x, bs[run[k]].y - bs[run[k - 1]].y));
        const total = cum[cum.length - 1] + Math.hypot(D1.x - bs[run[run.length - 1]].x, D1.y - bs[run[run.length - 1]].y);
        const put = (j: number, q: P) => { out[j] = { x: out[j].x + (q.x - out[j].x) * keep, y: out[j].y + (q.y - out[j].y) * keep }; };
        run.forEach((j, k) => { const t = cum[k] / total, m = 1 - t; put(j, { x: m * m * m * Q0.x + 3 * m * m * t * C0.x + 3 * m * t * t * C1.x + t * t * t * P1.x, y: m * m * m * Q0.y + 3 * m * m * t * C0.y + 3 * m * t * t * C1.y + t * t * t * P1.y }); arched(j); });
        // (and the stem's side by the round back on its line)
        for (let k = 0; k <= ARCH_RUN - 3; k++) { const j = md(a - on * k); put(j, onStem(out[j])); }
        break;
      }
    }
  }

  /** A lighter weight's round inside a join running off a stem's straight side (the bracket under a hairline stem's
      serif): no sample of it in past the stem's other side as thin as the stem is now, where it reads a heavy stroke
      behind the stem and would go far in: held where its edges go, give or take HOLD_SLACK (a Didone's N's bracket under
      its top serif, the diagonal beside its hairline stem thinning, went 40 units in across the stem and cut it off). */
  function holdBrackets() {
    const inside = (i: number) => { const b = bs[md(i)], p = bs[md(i - 1)], q = bs[md(i + 1)]; if (b.corner || b.dot || inEnd[md(i)] || b.straight) return false; return (q.tx - p.tx) * b.nx + (q.ty - p.ty) * b.ny < 0 && Math.abs(Math.atan2(p.tx * q.ty - p.ty * q.tx, p.tx * q.tx + p.ty * q.ty)) / 2 >= FILLET_TURN; };
    for (let s = 0; s < n; s++) {
      if (!inside(s) || inside(s - 1)) continue;
      let e = s;
      while (e - s < n - 1 && inside(e + 1)) e++;
      const a = md(s - 1), z = md(e + 1);
      for (const E of [a, z]) {
        const B = bs[E];
        if (B.corner || !B.straight || !stemSide(E, E === a ? -1 : 1)) continue;
        // (the stem's other side as it is now, the way into the stem from this one)
        const P = out[E], th = Math.max(1, 2 * (B.w + moved[E])), lim = Math.max(Math.abs(moved[a]), Math.abs(moved[z])) + HOLD_SLACK;
        for (let k = s; k <= e; k++) {
          const j = md(k), b = bs[j];
          if (meets.has(j) || (out[j].x - P.x) * B.nx + (out[j].y - P.y) * B.ny < th - 1 || moved[j] >= -lim) continue;
          out[j] = { x: base[j].x + b.nx * lim, y: base[j].y + b.ny * lim };
        }
      }
    }
  }

  /** A lighter weight's hairline leaving a heavy stem's straight side, its own sides going in far less than the stem's
      (HAIR_ROOT): its root, the crotch over it, its sides and the round under it, carried with the stem's side as that
      goes in, less and less out along the hairline to HAIR_REACH of that move from the side as drawn. A Didone's m's
      arch, its crotch met again on the skeleton's middles bending level into the stem and the round under it run in
      along its normals, rose past its top edge and parted it from its stem. */
  function hairRoots() {
    for (let c = 0; c < n; c++) {
      const b = bs[c];
      if (!b.corner || !concaveAt(b) || meets.has(c) || pins?.has(c)) continue;
      for (const S of [1, -1]) {
        const C = -S;
        if (!stemSide(md(c + S), S) || bs[md(c + C)].straight || bs[md(c + C)].corner) continue;
        const s0 = md(c + S * 2), ms = moved[s0], mc = moved[md(c + C * 3)];
        if (!(ms < 0 && -ms > HAIR_ROOT * Math.max(2, Math.abs(mc)))) continue;
        const q = bs[s0], vx = q.nx * -ms, vy = q.ny * -ms, ox = -q.nx, oy = -q.ny, reach = HAIR_REACH * -ms;
        const dist = (p: P) => (p.x - b.x) * ox + (p.y - b.y) * oy, fade = (p: P) => Math.min(1, Math.max(0, 1 - dist(p) / reach));
        // (the round under it: where the stem's side, run on the other way past the hairline, turns off its line into a curve)
        const up = bs[md(c + S * ARCH_RUN)], ux = up.x - b.x, uy = up.y - b.y;
        let a = -1, best = 1.5 * reach;
        for (let k = 0; k < n; k++) {
          const p = bs[k];
          if (p.corner || !p.straight || Math.abs(dist(p)) > 2 || p.nx * q.nx + p.ny * q.ny < 0.99) continue;
          for (const on of [1, -1]) {
            const r1 = bs[md(k + on)];
            if (r1.corner || r1.straight || !stemSide(k, -on)) continue;
            const d = Math.hypot(p.x - b.x, p.y - b.y);
            if (d < best && md(k - c) !== 0 && (p.x - b.x) * ux + (p.y - b.y) * uy < 0) { best = d; a = k * 2 + (on > 0 ? 1 : 0); }
          }
        }
        // (only with the round under it on this outline: a b's bowl's, round its counter, an outline of its own, isn't)
        if (a < 0) break;
        // (the round under it made as much shorter along the stem as the stem is thinner, HAIR_ROUND at least: carried
        // whole, a Didone's n's at Thin ran a third of the x-height down its stem, a dark wedge)
        const A = bs[a >> 1], tl = Math.hypot(A.x - b.x, A.y - b.y) || 1, tx = (A.x - b.x) / tl, ty = (A.y - b.y) / tl;
        const ua = (A.x - b.x) * tx + (A.y - b.y) * ty, sk = Math.min(1, Math.max(HAIR_ROUND, 1 + ms / Math.max(1, q.w)));
        // (both its sides run out past the carry, the hairline's edge and the round's, before any corner, and the round's
        // without turning back down along the stem past where it leaves it: a fat face's n, its counter narrower than
        // the carry, would carry the far stem's side with it)
        const outer: number[] = [], inner: number[] = [], k0 = a >> 1, on = a & 1 ? 1 : -1;
        let ok = false;
        for (let k = 1; k < n; k++) { const j = md(c + C * k), p = bs[j]; if (p.corner) break; if (dist(p) >= reach) { ok = true; break; } outer.push(j); }
        let end = -1;
        if (ok) {
          ok = false;
          for (let k = 1; k < n; k++) {
            const j = md(k0 + on * k), p = bs[j];
            if (p.corner || (p.x - b.x) * tx + (p.y - b.y) * ty > ua + 2) break;
            if (dist(p) >= reach) { ok = true; end = j; break; }
            inner.push(j);
          }
        }
        if (!ok) break;
        let roots = HAIR_ROOTS.get(mv);
        if (!roots) HAIR_ROOTS.set(mv, roots = []);
        roots.push({ x: base[c].x, y: base[c].y, vx, vy, ox, oy, reach, tx, ty, ua, sk, wn: Math.max(0, q.w + ms) });
        out[c] = { x: base[c].x + vx, y: base[c].y + vy };
        arched(c);
        for (const j of outer) {
          const p = bs[j], f = fade(p);
          out[j] = { x: base[j].x - p.nx * moved[j] + vx * f, y: base[j].y - p.ny * moved[j] + vy * f };
          arched(j);
        }
        const mi = moved[end];
        for (const j of inner) {
          const p = bs[j], f = fade(p), u = (p.x - b.x) * tx + (p.y - b.y) * ty, zu = u > 0 ? u * (1 - sk) : 0;
          out[j] = { x: base[j].x - p.nx * mi * (1 - f) + vx * f - tx * zu, y: base[j].y - p.ny * mi * (1 - f) + vy * f - ty * zu };
          arched(j);
        }
        break;
      }
    }
  }

  /** How much of the change asked of its strokes this outline's heavy sides make (0 to 1): those as thick as a stem,
      off its ends, its corners and its serifs, each by its move across the thickness it reads, joins and all; 1 for an
      outline with none, or when hardly any change is asked. */
  function heavyShare() {
    const stem = rig.ref().stem;
    const use = (p: Bone, i: number) => !(p.corner || p.cap || p.dot || p.serifDx || inEnd[i] || 2 * p.w0 < 0.8 * stem);
    // (a reweighed move's, where some are asked to thicken and some to thin, each by the way it was asked to go: a stem thinned and a serif
    // thickened sixfold, Contrast turned round, summed as they were, came to nothing at about Contrast 15 and the share
    // went from all to none at once, a fat face's r's ball 52 units wider in a step)
    const both = mv.reweighed && bs.some((p, i) => use(p, i) && k0[i] > 1) && bs.some((p, i) => use(p, i) && k0[i] < 1);
    let got = 0, asked = 0;
    bs.forEach((p, i) => {
      if (!use(p, i)) return;
      const s = both && k0[i] < 1 ? -1 : 1;
      got += s * moved[i] / p.w0; asked += s * (k0[i] - 1);
    });
    return Math.abs(asked) < 1e-3 * bs.length ? 1 : Math.min(1, Math.max(0, got / asked));
  }

  /** How much a ball (samples a+1 to b-1, hanging from hx, hy) thickens or thins: as its own edges' strokes are asked
      to (k0, where they read about as thick as it), as far as this outline's heavy strokes do (`heavy`), thinner as the
      letter is drawn narrower or lower, as its strokes are (condense, lower), so it keeps to the room it had, and growing
      no further than OPEN of the room round it (but the room in its own crotch, beside its neck, which the neck fills). */
  function ballK(a: number, b: number, hx: number, hy: number) {
    const js: number[] = [];
    for (let i = a + 1; i < b; i++) js.push(md(i));
    const w = js.map(j => bs[j].w).sort((p, q) => p - q)[js.length >> 1], body = js.filter(j => bs[j].w >= 0.8 * w);
    let k = (1 + (body.reduce((sum, j) => sum + k0[j], 0) / Math.max(1, body.length) - 1) * heavy) * Math.min(condense, lower);
    if (k > 1) for (const j of body) {
      const p = bs[j], away = -(p.x - hx) * p.nx - (p.y - hy) * p.ny;
      if (p.gap >= w && away > 1) k = Math.min(k, 1 + p.gap * OPEN / away);
    }
    return k;
  }
}

/** The letter keeps its heights, as the engine's do when they get bolder or lighter: whatever faces up at
    a line it reaches (the x-height, the capitals', the ascenders') or down at one it stands on (the
    baseline, the descenders') goes back to where the heights put it, an overshoot as far past it, and
    what's between follows. A dot keeps its round and the place the heights gave it. */
function keepHeights(rig: SkinRig, rings: P[][], gy: (y: number) => number, dotted = false) {
  const c = rig.ctx;
  const back: [number, number][] = [], band = c.cap * 0.06;
  let foot = false;
  for (const [L, up] of [...(c.lower ? [c.xh, c.asc] : [c.cap]).map(L => [L, true] as const), ...(c.lower ? [0, c.desc] : [0]).map(L => [L, false] as const)]) {
    let was = up ? -Infinity : Infinity, now = was, any = false;
    rig.bones.forEach((bs, r) => bs.forEach((b, i) => {
      if (b.dot || (up ? -b.ny : b.ny) < 0.5 || Math.abs(b.y - L) > band) return;
      any = true;
      was = up ? Math.max(was, b.y) : Math.min(was, b.y); now = up ? Math.max(now, rings[r][i].y) : Math.min(now, rings[r][i].y);
    }));
    if (any) { back.push([now, gy(L) + was - L]); foot ||= !up; }
  }
  // (a heavier weight's letter standing on nothing but its dot, a question mark's, held at the dot's top as well, which
  // stays: lifted down whole by as much as its top thickened up past the capitals' height, its hook ran into the dot)
  if (dotted && !foot) rig.bones.forEach((bs, r) => { if (bs[0]?.dot && rings[r]?.length) { const t = Math.max(...rings[r].map(q => q.y)); if (back.every(([now]) => now > t)) back.push([t, t]); } });
  back.sort((a, b) => a[0] - b[0]);
  const knots2 = back.filter((k, i) => i === 0 || (k[0] > back[i - 1][0] + 1 && k[1] > back[i - 1][1]));
  if (!knots2.length) return (y: number) => y;
  const to = knots2.length === 1 ? (y: number) => y + knots2[0][1] - knots2[0][0] : piecewise(knots2);
  rings.forEach((r, i) => { if (!rig.bones[i][0]?.dot) for (const p of r) p.y = to(p.y); });
  return to;
}

/** A heavier weight's letter's parts that stand on a line it keeps (keepHeights) each kept at its own height by it, where
    the heights left it short of the line or past it by more than FOOT_OFF of the capitals' height: each part facing the
    line within its band, drawn within FOOT_ON of the line, goes to as far off where the heights put the line as it was
    drawn, and what lies over it (within its reach across, and FOOT_ZONE of the capitals' height up from it) with it,
    fading out FOOT_ACROSS further across and FOOT_FADE further up. The heights lift the whole of a letter's foot by as
    much as the part of it that sank furthest past the line: a comic's N's join of its diagonal and right stem, round
    underneath, thickened down past the baseline as Horizontals goes, and its left stem's round foot, which doesn't,
    stood 12 to 17 units over the line at Horizontals 100, its right stem's top as far under the capitals'. (Not a part
    drawn reaching past the line, a blackletter B's bowl's top: lifted with what lies under it, its crotch with the
    letter's left half beside it pinched shut, a pinhole.) */
/** A heavier weight's edges facing out across a line in a font of bracketed serifs and some contrast (fairFont): each run of
    FEET_RUN samples or more facing within FEET_LEVEL of straight out across the line, lying as drawn within FEET_NEAR of
    the cap of it on the ink's side and never past it (not a round's overshoot), not drawn flat on it (snapFlatEdges'), laid on the line as the heights put it,
    keeping FEET_KEEP of how far off it the design drew each, faded in over FEET_FADE samples from either end: each sample
    moved by its own stroke's thickening, an italic's foot serifs' undersides and its B's bottom came out in waves at
    Weight 100. */
function levelFeet(rig: SkinRig, rings: P[][], gy: (y: number) => number) {
  // (the lines letters stand on, their ink above, and those they reach up to, their ink below)
  const c = rig.ctx, lines = c.lower ? [0, c.desc, c.xh, c.asc] : [0, c.cap], foot = c.lower ? 2 : 1, near = FEET_NEAR * c.cap;
  rings.forEach((ring, r) => {
    const bs = rig.bones[r], n = bs.length;
    if (ring.length !== n || n < 2 * FEET_RUN) return;
    // (each sample's line, as an index into lines and the side its ink lies (1 above), -1 none)
    const key = bs.map(b => {
      if (b.dot || b.onLine || Math.abs(b.ny) < FEET_LEVEL) return -1;
      const k = lines.findIndex((L, j) => (j < foot) === b.ny > 0 && Math.abs(b.y - L) <= near);
      return k < 0 ? -1 : 2 * k + (b.ny > 0 ? 1 : 0);
    });
    for (let s = 0; s < n; s++) {
      if (key[s] < 0 || key[(s - 1 + n) % n] === key[s]) continue;
      let len = 0;
      while (len < n && key[(s + len) % n] === key[s]) len++;
      if (len < FEET_RUN || len >= n) continue;
      // (none of it past the line: a round's overshoot, its sides levelled either side of its top, stood a step each)
      const L = lines[key[s] >> 1], to = gy(L), up = key[s] & 1;
      let past = false;
      for (let k = 0; k < len && !past; k++) { const q = bs[(s + k) % n]; past = (up ? q.y - L : L - q.y) < -FEET_PAST; }
      if (past) continue;
      for (let k = 0; k < len; k++) {
        const i = (s + k) % n, f = Math.min(1, (Math.min(k, len - 1 - k) + 1) / FEET_FADE), y = to + FEET_KEEP * (bs[i].y - L);
        ring[i] = { x: ring[i].x, y: ring[i].y + (y - ring[i].y) * f };
      }
    }
  });
}
const FEET_LEVEL = 0.94, FEET_NEAR = 0.03, FEET_PAST = 1, FEET_RUN = 6, FEET_FADE = 8, FEET_KEEP = 0.5;

function footHeights(rig: SkinRig, rings: P[][], gy: (y: number) => number) {
  const c = rig.ctx, band = c.cap * 0.06, off = FOOT_OFF * c.cap, zone = FOOT_ZONE * c.cap, fade = FOOT_FADE * c.cap;
  const fixes: { L: number; up: boolean; x0: number; x1: number; at: number; d: number }[] = [];
  for (const [L, up] of [...(c.lower ? [c.xh, c.asc] : [c.cap]).map(L => [L, true] as const), ...(c.lower ? [0, c.desc] : [0]).map(L => [L, false] as const)]) {
    // (the samples facing it within its band, as the move put them, in parts no nearer each other across than FOOT_GAP of
    // the capitals' height: a run of a few samples off a part's top, below its round's, lifted with it, read as a part of
    // its own and pulled back down to its own height, a notch in an M's apex)
    // (not a part with a flat edge on the line, which snapFlatEdges puts back on it, its stroke with it)
    const at: { x: number; was: number; now: number; flat: boolean }[] = [];
    rig.bones.forEach((bs, r) => bs.forEach((b, i) => {
      const q = rings[r][i];
      if (q && !b.dot && (up ? -b.ny : b.ny) >= 0.5 && Math.abs(b.y - L) <= band) at.push({ x: q.x, was: b.y, now: q.y, flat: b.onLine });
    }));
    at.sort((a, b) => a.x - b.x);
    for (let k = 0; k < at.length;) {
      let j = k, was = up ? -Infinity : Infinity, now = was, flat = false;
      for (; j < at.length && (j === k || at[j].x - at[j - 1].x <= FOOT_GAP * c.cap); j++) { was = up ? Math.max(was, at[j].was) : Math.min(was, at[j].was); now = up ? Math.max(now, at[j].now) : Math.min(now, at[j].now); flat ||= at[j].flat; }
      const d = gy(L) + was - L - now;
      if (!flat && Math.abs(was - L) <= FOOT_ON * c.cap && Math.abs(d) > off) fixes.push({ L: gy(L), up, x0: at[k].x, x1: at[j - 1].x, at: now, d });
      k = j;
    }
  }
  if (!fixes.length) return;
  for (const ring of rings) for (const p of ring) {
    let dy = 0;
    for (const F of fixes) {
      const ax = p.x < F.x0 ? F.x0 - p.x : p.x > F.x1 ? p.x - F.x1 : 0, ay = Math.max(0, (F.up ? F.at - p.y : p.y - F.at) - zone);
      const w = Math.max(0, 1 - ax / (FOOT_ACROSS * c.cap)) * Math.max(0, 1 - ay / fade);
      if (Math.abs(F.d * w) > Math.abs(dy)) dy = F.d * w;
    }
    p.y += dy;
  }
}
const FOOT_OFF = 0.01, FOOT_ON = 0.025, FOOT_GAP = 0.04, FOOT_ZONE = 0.06, FOOT_FADE = 0.2, FOOT_ACROSS = 0.08;

/** A heavier weight's dots kept clear of the rest of the letter: each point of its other outlines (as moved, its heights
    kept) that comes nearer a dot than DOT_KEEP of the paper the design leaves round it, read about the dot's middle as
    far out as its farthest point, put back out to there, away from the dot's middle. A question mark's hook, its end
    thickened down and out, ran into its dot, and an i's stem's top up into its dot, one piece where the design has two
    (a comic's ? from Weight 0.65, a script's i at Verticals 100); the dot, kept as small as the paper round it leaves
    room for (moveRing's kdot), can't give way. Not a dot the design has touching. */
function clearDots(rig: SkinRig, rings: P[][]) {
  const dots = rig.bones.map((bs, r) => (bs[0]?.dot && rings[r]?.length ? r : -1)).filter(r => r >= 0);
  if (!dots.length || dots.length === rings.length) return;
  for (const d of dots) {
    // (the dot's room as drawn: about its middle, out past its farthest point, to the nearest of the letter's other points)
    const mid = (ps: P[]) => ({ x: ps.reduce((a, q) => a + q.x, 0) / ps.length, y: ps.reduce((a, q) => a + q.y, 0) / ps.length });
    const far = (ps: P[], c: P) => Math.max(...ps.map(q => Math.hypot(q.x - c.x, q.y - c.y)));
    const c0 = mid(rig.bones[d]), r0 = far(rig.bones[d], c0);
    let room = Infinity;
    rig.bones.forEach((bs, r) => { if (!dots.includes(r)) for (const b of bs) room = Math.min(room, Math.hypot(b.x - c0.x, b.y - c0.y) - r0); });
    if (!(room > 1) || !isFinite(room)) continue;
    const c = mid(rings[d]), R = far(rings[d], c) + room * DOT_KEEP;
    rings.forEach((ring, r) => {
      if (dots.includes(r)) return;
      for (const p of ring) {
        const dx = p.x - c.x, dy = p.y - c.y, l = Math.hypot(dx, dy);
        if (l >= R || l < 1e-6) continue;
        p.x = c.x + dx * R / l; p.y = c.y + dy * R / l;
      }
    });
  }
}
const DOT_KEEP = 0.5;

/** A flat edge on a line stays on it exactly (a serif's foot beside a heavier stroke's, which moved
    further and so set where the rest went), its neighbours eased onto it; and the side of a stroke along the line comes
    back with the stroke behind it, the edge across it as far, so the stroke keeps the thickness the move gave it. The
    heights (keepHeights) lift the whole top of a letter by as much as a round beside the edge sank: the edge put back on
    its line alone, the stroke under it was squashed against the line, a typewriter g's ear to a unit's thickness at
    Thin, where it parted from its stem and was lost (the letter 137 units narrower at once). Hands back, for each edge
    across so brought back, where it was and how far (movedOnce brings the strokes' middles there back with it). */
function snapFlatEdges(rig: SkinRig, rings: P[][], gy: (y: number) => number, lighter = false, ramp = false, unlifted: number[][] | null = null): { x: number; y0: number; y1: number; dy: number }[] {
  const c = rig.ctx;
  const lines = [0, c.cap, ...(c.lower ? [c.xh, c.asc, c.desc] : [])];
  // (and a heavier weight's level edge a little off a line, facing off it, the round of a cupped foot: left where the
  // heights put it, its serif, put back whole as moved, below, sank under the baseline with its edge, or, the stroke beside
  // it thickened off the line and the whole foot lifted back by as much, stood a step above it)
  const near = (b: Bone) => !!unlifted && Math.abs(b.ny) > 0.97 && lines.some(L => Math.abs(b.y - L) < NEAR_LINE * c.cap && (b.y - L) * b.ny <= 0 && (L > 0 ? b.ny < 0 : b.ny > 0));
  const lineAt = rig.bones.map(bs => new Float64Array(bs.length).fill(NaN));
  const fixes = rig.bones.map((bs, r) => bs.map((b, i) => {
    if (!(b.onLine || near(b)) || b.dot) return 0;
    const L = lines.find(L => Math.abs(b.y - L) < (b.onLine ? 2.5 : NEAR_LINE * c.cap));
    if (L !== undefined) lineAt[r][i] = L;
    return L === undefined ? 0 : gy(L) + b.y - L - rings[r][i].y;
  }));
  if (!fixes.some(f => f.some(Boolean))) return [];
  // (a heavier sans's corner turning out from such an edge down an upright side, lying on its line, put on it as the edge
  // is and carried no further: carried with the edge as its neighbour, a sans B's stem's foot, which footHeights had kept on the line, went
  // 13 units under it at Weight 100)
  const sans = ramp && !rig.serifed(), onCorner = rig.bones.map((bs, r) => bs.map((b, i) => {
    const nb = bs.length;
    const a0 = bs[(i - 1 + nb) % nb], a1 = bs[(i + 1) % nb];
    if (!sans || !b.corner || concaveAt(b) || b.dot || !(a0.onLine ? Math.abs(a1.nx) > 0.9 : a1.onLine && Math.abs(a0.nx) > 0.9)) return NaN;
    const L = lines.find(L => Math.abs(b.y - L) < 2.5);
    return L === undefined ? NaN : gy(L) + b.y - L - rings[r][i].y;
  }));
  // (the edge across: where a ray in from the edge first meets the outline, no further than ACROSS_MOST times the
  // stroke is thick, fading out over the last of that, and facing back at it)
  const carried = rings.map(r => new Float64Array(r.length)), spans: { x: number; y0: number; y1: number; dy: number }[] = [];
  rig.bones.forEach((bs, r) => bs.forEach((b, i) => {
    // (from the side of a stroke running along the line only, inside a flat run, fading out as the stroke turns off
    // it: not a stem's end cut across, a slanted leg's foot or a corner, whose rays run along the stroke or off it)
    const f = fixes[r][i], p = rings[r][i], most = ACROSS_MOST * 2 * b.w, nb = bs.length;
    const along = Math.min(1, Math.max(0, (Math.abs(b.dx) / (Math.hypot(b.dx, b.dy) || 1) - ALONG[0]) / (ALONG[1] - ALONG[0])));
    if (!f || !along || b.cap || b.corner || !bs[(i + 1) % nb].onLine || !bs[(i - 1 + nb) % nb].onLine || !(most > 0)) return;
    let best = Infinity, q = -1, k = -1, k1 = -1;
    for (let rq = 0; rq < rings.length; rq++) for (let rk = 0, ring = rings[rq]; rk < ring.length; rk++) {
      const rk1 = (rk + 1) % ring.length;
      if (rq === r && (rk === i || rk1 === i)) continue;
      const a = ring[rk], e = ring[rk1], sx = e.x - a.x, sy = e.y - a.y, den = b.nx * sy - b.ny * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den, w = ((a.x - p.x) * b.ny - (a.y - p.y) * b.nx) / den;
      if (t > 0.5 && w >= 0 && w <= 1 && t < best) { best = t; q = rq; k = rk; k1 = rk1; }
    }
    if (q < 0 || best >= most) return;
    // (and the edge it meets facing back at it, the stroke's other side: a slanted stroke's edge the ray runs up into
    // faces off across the line; as drawn or as moved: a serif's bracket, slanted as drawn, moves in level with the
    // serif's foot, and left where the heights put it, the serif's root was squashed flat against the line, Oldstyle's
    // R's foot's, which folded, the R drawn as its strokes a step lighter than Weight 0.105, 10% lighter)
    const o = rig.bones[q]?.[k], a = rings[q][k], e = rings[q][k1], el = Math.hypot(e.x - a.x, e.y - a.y) || 1;
    const back = Math.max(o ? -(b.nx * o.nx + b.ny * o.ny) : 0, lighter && !o?.corner ? Math.abs(b.nx * (e.y - a.y) - b.ny * (e.x - a.x)) / el : 0);
    const facing = Math.min(1, Math.max(0, (back - ALONG[0]) / (ALONG[1] - ALONG[0])));
    const g = f * along * facing * Math.min(1, (most - best) / (most * ACROSS_FADE));
    if (!g) return;
    spans.push({ x: p.x, y0: p.y, y1: p.y + b.ny * best, dy: g });
    for (const j of [k, k1]) if (!fixes[q][j] && Math.abs(g) > Math.abs(carried[q][j])) carried[q][j] = g;
  }));
  rings.forEach((ring, r) => {
    const n = ring.length, fix = fixes[r], across = carried[r], moved = ring.map((_, i) => fix[i] || across[i]);
    // (a heavier weight's serif standing on its line, put back on it, put back whole as moved, before the heights, its
    // underside and its end with its edge on the line and the corner at a root cut square with them: the ray in from its
    // edge on the line, read as along it only where the serif's stroke runs level, brought back part of its underside, a
    // notch where that part ended, and a serif's end below its line, a step off the round its edge comes back to; and none
    // carried on past a corner, along a stem's side, whose points would pass one another)
    const whole = new Uint8Array(n);
    if (unlifted && ramp) for (const { s0, e } of serifRuns(rig, r).runs) {
      let on = false;
      for (let j = s0; j !== e && !on; j = (j + 1) % n) on = !!fix[j];
      if (!on) continue;
      const take = (j: number) => { if (!fix[j]) { moved[j] = unlifted[r][j] - ring[j].y; whole[j] = 1; } };
      for (let j = s0; j !== e; j = (j + 1) % n) take(j);
      for (const j of [(s0 - 1 + n) % n, e]) if (rig.bones[r][j].corner) take(j);
    }
    if (!moved.some(Boolean)) return;
    // (a heavier weight's out along the outline over CARRY_RAMP times as far as it moved: the heights lift a heavy letter's
    // whole top by as much as its bars thickened up past the line, and a serif's underside brought back with its top, the
    // crotch it runs into and the stem's side below over four samples, stood a step over them, a notch at each slab
    // serif's root and under a Y's arm's serif)
    const reach = (d: number) => (ramp ? Math.max(4, Math.ceil(CARRY_RAMP * Math.abs(d) / STEP)) : 4);
    const most = ramp ? Math.max(4, ...moved.map(reach)) : 4;
    const bs = rig.bones[r], past = (i: number, j: number, k: number, d: number, outer = false) => { for (let q = 1; q <= k; q++) { const c = bs[(i + d * q + n) % n]; if (c.corner && (!outer || !concaveAt(c))) return true; } return false; };
    ring.forEach((p, i) => {
      if (!isNaN(onCorner[r][i])) { p.y += onCorner[r][i]; return; }
      if (moved[i] || whole[i]) { p.y += moved[i]; return; }
      // (the nearest such edge within a few samples, less the further it is; a heavier sans's not round a corner its edge
      // turns out at, onto the side of a stem: a sans B's top-left corner, its stem's top kept on the line by footHeights,
      // carried up again with the edge put back, stood 13 units over the line at Weight 100, a spike)
      // (nor out past the line that edge lies on, further than the design lay off it, where it faces out across it as the
      // edge does: a round running on from the edge, a D's bowl's top, which the heights had already put on the line,
      // carried up with the edge put back, stood a bump over the line where it leaves the bar at Weight 100)
      const b = bs[i], fit = (dy: number, L: number) => {
        if (!sans || isNaN(L) || Math.abs(b.y - L) > NEAR_LINE * c.cap || (L > 0 ? b.ny > -0.5 : b.ny < 0.5)) return dy;
        const lim = gy(L) + b.y - L - p.y;
        return dy > 0 ? Math.min(dy, Math.max(0, lim)) : Math.max(dy, Math.min(0, lim));
      };
      for (let k = 1; k <= most; k++) for (const [j, d] of [[(i - k + n) % n, -1], [(i + k) % n, 1]]) if (moved[j] || whole[j]) { const K = reach(moved[j]); if (k <= K && !(whole[j] && past(i, j, k, d)) && !(sans && past(i, j, k, d, true))) p.y += fit(moved[j] * (1 - k / (K + 1)), lineAt[r][j]); return; }
    });
  });
  return spans;
}
/** A heavier weight's stroke ends carried again with the two sides they join, as snapFlatEdges left those (`was`, the
    outline before it; `rings` moved in place): its flat sides put back on their line, a serif's round end stayed where
    the heights put it, which lifted the whole top of the letter as far as its bars had thickened up past the line, a
    hook under each of a typewriter E's serifs. Turned, moved and made as much larger or smaller as its sides now stand,
    so it stays round (as moveRing carries it); only where its sides stand within END_RECARRY times as far apart as
    before. */
const END_RECARRY = 1.25;
function endsWithSides(rig: SkinRig, was: P[][], rings: P[][]) {
  rig.ends.forEach((es, r) => {
    const W = was[r], R = rings[r], n = R?.length ?? 0;
    if (!W || W.length !== n) return;
    const md = (i: number) => ((i % n) + n) % n;
    for (const { a, b } of [...sideEnds(rig, r), ...cutEnds(rig, r)]) {
      const A = W[md(a)], B = W[md(b)], A1 = R[md(a)], B1 = R[md(b)];
      if (Math.abs(A1.x - A.x) + Math.abs(A1.y - A.y) + Math.abs(B1.x - B.x) + Math.abs(B1.y - B.y) < 1e-6) continue;
      const ux = B.x - A.x, uy = B.y - A.y, vx = B1.x - A1.x, vy = B1.y - A1.y, l2 = ux * ux + uy * uy;
      // (not a dot, nor an end whose sides came out much nearer or further apart: a dieresis's dot, read as a stroke's two
      // ends a few units apart, put back on its height a few units aside, was drawn three times its size)
      if (l2 < 1e-6 || vx * vx + vy * vy < 1e-6 || rig.bones[r][0]?.dot) continue;
      const k2 = (vx * vx + vy * vy) / l2;
      if (k2 > END_RECARRY ** 2 || k2 < END_RECARRY ** -2) continue;
      // (made larger across only, no deeper, where it faces paper short of the far edge of the letter: deeper, two round
      // ends facing each other across a few units, a typewriter's H's feet's, ran into one another)
      let D = 0, tip = -1;
      for (let i = a + 1; i < b; i++) { const p = W[md(i)], t = Math.abs((p.y - A.y) * ux - (p.x - A.x) * uy); if (t > D) { D = t; tip = md(i); } }
      const deep = k2 > 1 && tip >= 0 && isFinite(rig.bones[r][tip]?.gap ?? Infinity) ? 1 / Math.sqrt(k2) : 1;
      for (let i = a + 1; i < b; i++) {
        const p = W[md(i)], dx = p.x - A.x, dy = p.y - A.y, s = (dx * ux + dy * uy) / l2, t = deep * (dy * ux - dx * uy) / l2;
        R[md(i)] = { x: A1.x + s * vx - t * vy, y: A1.y + s * vy + t * vx };
      }
    }
  });
}

/** How far in from a flat edge on a line, as many times the stroke is thick, the edge across it may lie and come back
    with it (snapFlatEdges), the last ACROSS_FADE of that fading out. */
const ACROSS_MOST = 2.5, ACROSS_FADE = 0.4;
/** How far along the outline, as many times as it moved, a heavier weight's flat edge put back on its line and the edge
    across it brought back with it carry the outline beyond them (snapFlatEdges), less and less. */
const CARRY_RAMP = 3;
/** How much thicker or thinner than before, as a share, a stroke must be drawn for its moves to be tidied (moveMap): not
    the little Cursive or Width weigh them by. */
const REWEIGHED = 0.05;
/** How many heights a heavier letter's sides are read at for the room it keeps beside its neighbours (and its design's,
    finely), how far in from its room's edge, as a share of the font's stem, its ink may come no nearer than the
    design's, and how much further in ink off a height reads, for each unit off it (skinRoom, sidesAt). */
const ROOM_ROWS = 24, ROOM_FINE = 240, ROOM_REACH = 0.75, ROOM_SLOPE = 2;
/** How far up and down from a height, as a share of half as far as its strokes grew thicker, a script's lowercase's room
    is read off its design's ink (skinRoom): a quarter (read at the height alone, Jotter's s's stepped 6 units at Weight
    0.85). Its capitals' at the height alone, and ink off it read ROOM_SLOPE_LEANS times as far in again for each unit off
    it: their flicks and arms pass their neighbours' one just above the other, Boardwalk's K's leg's top 3 units under the
    Y's arm's foot, and thickening, one grows into the height the other's ink stands at (Boardwalk's N's exit 87 units into
    a Y's arm at Weight 100; read within a quarter, its K 60 into a Y at Verticals 100, so 16 apart). A capital takes a little
    more room so, Boardwalk's 50 units more at Weight 100. */
const ROOM_LEANS = 0.25, ROOM_LEANS_CAPS = 0, ROOM_SLOPE_LEANS = 6;
/** How many points along each curve, and how far apart along its edges at the most, a script's outline as moved is read
    at for its room (skinRoom), off the ring it was traced from where tidyRings kept it: read at its curves' 4 points, where
    they fell as it was drawn again, Serenade's 2's top, the point most asked of came and went, its room 8 units more at
    once at Weight 0.96; and at its points drawn to whole units, a capital's room, read steeply off a height, stepped as a
    point came a unit up or down, 7 units at once. */
const ROOM_CURVES = 8, ROOM_STEP = 2;
/** How square to its edge (a cosine) a script's end's point must go out into the paper for that way's room to begin to hold
    it, fully from twice as square (moveRing): slid along its edge, it meets no paper ahead. */
const SHUT_INTO = 0.2;
/** How much thicker, as a share, a letter's upright strokes must be drawn for its room to be read again (skinRoom): a
    thousandth, not the rounding of a move that leaves them. */
const ROOM_FROM = 0.001;
/** Whether a move weighs the strokes (MoveMap.reweighed): only these hold a flat cut across where strokes meet (flatCuts)
    and move a stray end's samples as sides (edgeMoves), so a move of the width, the x-height or Cursive alone draws as
    before. */
const weighed = (mv: MoveMap) => mv.reweighed;
/** Whether a move lays a letter's straight edges and ends on lines as they move (sideWs, sideEnds, moveRing's
    straightRuns and flatEnd): a reweighed one, its stems no thinner and it or its bars thicker by REWEIGHED, in a font
    without serifs whose hairline is LINES_EVEN of its stem or more. (Its stems thinned as its bars thicken, Contrast
    turned round, a soft sans's stems' feet stood out past their sides on the lines, needles; its bars alone thinned,
    Horizontals 0 or Contrast 100, an industrial 4's bar knotted where it crosses its stem, a notch in its 7's top.)
    (A serif's edges, bracketed and tapering, read as lines, came out with needles at their tips as the bars thinned; a
    blackletter's hairlines, read on from its stems, a W's strokes thickened into each other round a hole.) (Nor a script's,
    its strokes leaning, fontLeans: their curves' straight stretches, each laid on its own line, stood off one another a step
    where two meet, a notch down the inside of Boardwalk's N's second stem.) */
const linesMove = (rig: SkinRig, mv: MoveMap) => mv.reweighed && mv.kv >= 1 && Math.max(mv.kv, mv.kh) > 1 + REWEIGHED && !rig.serifed() && !rig.leans() && rig.ref().hair0 >= LINES_EVEN * rig.ref().stem;
const LINES_EVEN = 0.6;
const LINE_UPRIGHT = 0.95;
const END_PAST = 2;
/** Whether a heavier weight's crotches at a V of paper grow freely (veeOf): its stems thickened, or in an even slab
    (evenSlab) its bars, the serifs with them: held to the room between, a
    typewriter's Y's head serifs' undersides thickened less and less toward its arms at Horizontals 100, a hook under each
    serif where it meets its arm. */
const veesGrow = (rig: SkinRig, mv: MoveMap) => mv.reweighed && (mv.kv > 1 + REWEIGHED || (mv.kv >= 1 && mv.kh > 1 + REWEIGHED && evenSlab(rig)));
/** Whether a font is drawn with slab serifs and little contrast, its hairline LINES_EVEN of its stem or more (a typewriter's,
    a soft slab's). */
const evenSlab = (rig: SkinRig) => rig.serifed() && rig.ref().hair0 >= LINES_EVEN * rig.ref().stem;
/** How nearly along a flat edge's line its stroke runs, and how nearly the edge across faces back at it, for that edge
    to come back with it (snapFlatEdges), as the cosine of the angle: none from 40° off, wholly within 20°. */
const ALONG = [Math.cos(40 * Math.PI / 180), Math.cos(20 * Math.PI / 180)];

/** Whether (x, y) lies in rings' ink, read nonzero. */
function inkAtPoint(rings: P[][], x: number, y: number) {
  let w = 0;
  for (const o of rings) for (let i = 0, m = o.length; i < m; i++) {
    const u = o[i], v = o[(i + 1) % m];
    if (u.y <= y) { if (v.y > y && (v.x - u.x) * (y - u.y) - (x - u.x) * (v.y - u.y) > 0) w++; }
    else if (v.y <= y && (v.x - u.x) * (y - u.y) - (x - u.x) * (v.y - u.y) < 0) w--;
  }
  return w !== 0;
}

/** Which side of ring ri the ink lies on as it runs, read by the outlines' winding (nonzero) just beside its longest edge:
    1 on its left, -1 on its right (a dot wound against the letter's outside has its ink on its right). */
function inkSide(rings: P[][], ri: number): number {
  const r = rings[ri], n = r.length;
  let k = 0, best = -1;
  for (let i = 0; i < n; i++) { const l = Math.hypot(r[(i + 1) % n].x - r[i].x, r[(i + 1) % n].y - r[i].y); if (l > best) { best = l; k = i; } }
  const a = r[k], b = r[(k + 1) % n], l = best || 1, q = { x: (a.x + b.x) / 2 - (b.y - a.y) / l * 0.5, y: (a.y + b.y) / 2 + (b.x - a.x) / l * 0.5 };
  let w = 0;
  for (const o of rings) for (let i = 0, m = o.length; i < m; i++) {
    const u = o[i], v = o[(i + 1) % m];
    if (u.y <= q.y) { if (v.y > q.y && (v.x - u.x) * (q.y - u.y) - (q.x - u.x) * (v.y - u.y) > 0) w++; }
    else if (v.y <= q.y && (v.x - u.x) * (q.y - u.y) - (q.x - u.x) * (v.y - u.y) < 0) w--;
  }
  return w !== 0 ? 1 : -1;
}

/** The sharp notches into an outline's ink (where it turns back on itself by DENT_TURN or more over DENT_REACH of the
    capitals' height either way, toward the ink), as [ring, point, turn in degrees], the sharpest point of each run of
    them; none on a ring `skip` leaves out (a dot). */
function notches(rings: P[][], cap: number, turn = DENT_TURN, skip?: boolean[]): [number, number, number, boolean][] {
  const out: [number, number, number, boolean][] = [], reach = DENT_REACH * cap;
  rings.forEach((r, ri) => {
    const n = r.length;
    if (n < 5 || skip?.[ri]) return;
    const inkLeft = inkSide(rings, ri);
    const len = r.map((a, i) => Math.hypot(r[(i + 1) % n].x - a.x, r[(i + 1) % n].y - a.y));
    const along = (i: number, dir: 1 | -1) => { let j = i, d = 0; for (let k = 0; k < n && d < reach; k++) { d += dir > 0 ? len[j] : len[(j - 1 + n) % n]; j = (j + dir + n) % n; } return r[j]; };
    const tip: boolean[] = [];
    const at = r.map((p, i) => {
      const a = along(i, -1), b = along(i, 1), ux = p.x - a.x, uy = p.y - a.y, vx = b.x - p.x, vy = b.y - p.y, lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (!lu || !lv) return 0;
      const deg = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))) * 180 / Math.PI;
      if (deg < turn) return 0;
      // (a tip out of the ink: paper on past the point, away from the two either side of it, and ink between those two;
      // or else, turning toward the ink, a notch: by the turn's sign alone a hairline serif's tip, a unit or two thick,
      // turning all but straight back, read as a notch now and then, and was bridged off, a Didone's y's serifs)
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ox = p.x - mx, oy = p.y - my, ol = Math.hypot(ox, oy) || 1;
      tip[i] = !inkAtPoint(rings, p.x + ox / ol * DENT_PAST, p.y + oy / ol * DENT_PAST) && inkAtPoint(rings, mx, my);
      return tip[i] || (ux * vy - uy * vx) * inkLeft < 0 ? deg : 0;
    });
    const start = at.findIndex(d => !d);
    if (start < 0) return;
    let best = -1;
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (at[i] && (best < 0 || at[i] > at[best])) best = i;
      if (!at[i] && best >= 0) { out.push([ri, best, at[best], !!tip[best]]); best = -1; }
    }
  });
  return out;
}

/** A heavier weight's notches bridged: moved out sample by sample, a heavy letter's edges come out notched where a
    serif's root, its bracket, a crotch or a join runs into a stroke thickened past it. Each notch sharper by DENT_SHARPER
    than the design is near where the move puts it (`design`, its notches with how sharp, a crotch as sharp as drawn
    kept; near, DENT_NEAR of the capitals' height and as far again as the strokes thickened, `grew`, which moves a
    crotch out with its sides: a Didone's y's hairline serif's, read as new, was bridged off) is bridged straight across, from as far out either side as keeps every point between on the ink's side of the
    bridge and the bridge no longer than DENT_WIDE of the capitals' height (a dent, not a counter's or a bowl's round),
    nor running through the outline. */
function bridgeDents(rings: P[][], dot: boolean[], cap: number, design: { x: number; y: number; turn: number; tip: boolean }[], grew = 0): P[][] {
  const found = notches(rings, cap, DENT_TURN, dot);
  if (!found.length) return rings;
  const near = DENT_NEAR * cap + grew, wide = DENT_WIDE * cap, cut = rings.map(() => new Set<number>()), out = rings.map(r => r.slice());
  const crosses = (a: P, b: P, ri: number, i0: number, i1: number) => rings.some((r, rj) => r.some((c, k) => {
    const n = r.length, d = r[(k + 1) % n];
    if (rj === ri && ((k - i0 + n) % n) <= ((i1 - i0 + n) % n)) return false;
    const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return false;
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
    return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
  }));
  for (const [ri, t, deg, tip] of found) {
    const r = rings[ri], n = r.length, p = r[t], inkLeft = inkSide(rings, ri);
    // (a notch as sharp as the design's near, or a tip as sharp as a tip of the design's near, a hairline serif's, stays)
    const had = design.reduce((m, q) => (q.tip === tip && Math.hypot(q.x - p.x, q.y - p.y) < near ? Math.max(m, q.turn) : m), 0);
    if (tip ? had > 0 && deg <= had + DENT_SHARPER : deg < had + DENT_SHARPER) continue;
    // (widened a sample a side at a time while every point between stays on the ink's side of the bridge, a notch's,
    // or on the paper's, a spike's cut off across its root, no wider than SPIKE_WIDE)
    const side = tip ? -1 : 1, most = tip ? SPIKE_WIDE * cap : wide;
    const inside = (a: number, b: number) => {
      const A = r[(t - a + n) % n], B = r[(t + b) % n], bx = B.x - A.x, by = B.y - A.y;
      if (Math.hypot(bx, by) > most) return false;
      for (let k = -a + 1; k < b; k++) { const q = r[(t + k + n) % n]; if ((bx * (q.y - A.y) - by * (q.x - A.x)) * inkLeft * side < -0.25) return false; }
      return true;
    };
    let a = 1, b = 1;
    if (!inside(a, b)) continue;
    for (let grew = true; grew && a + b < n / 2;) {
      grew = false;
      if (inside(a + 1, b)) { a++; grew = true; }
      if (inside(a, b + 1)) { b++; grew = true; }
    }
    const i0 = (t - a + n) % n, i1 = (t + b) % n;
    // (and not where the bridge meets the outline either side at a point, turning on from it by more than DENT_END)
    const bend = (u: P, v: P, w: P) => { const ux = v.x - u.x, uy = v.y - u.y, wx = w.x - v.x, wy = w.y - v.y, l = Math.hypot(ux, uy) * Math.hypot(wx, wy); return l ? Math.acos(Math.max(-1, Math.min(1, (ux * wx + uy * wy) / l))) * 180 / Math.PI : 0; };
    if (bend(r[(i0 - 1 + n) % n], r[i0], r[i1]) > DENT_END || bend(r[i0], r[i1], r[(i1 + 1) % n]) > DENT_END) continue;
    if (crosses(r[i0], r[i1], ri, i0, i1)) continue;
    // (and a spike no longer off its root than SPIKE_LONG: past that, it is a stroke as thin as one, a hairline turned
    // round from a heavy stroke by Contrast, a w's last stroke at Contrast 0, cut off whole)
    if (tip) {
      const A = r[i0], B = r[i1], bx = B.x - A.x, by = B.y - A.y, l = Math.hypot(bx, by) || 1;
      let far = 0;
      for (let k = -a + 1; k < b; k++) { const q = r[(t + k + n) % n]; far = Math.max(far, Math.abs(bx * (q.y - A.y) - by * (q.x - A.x)) / l); }
      if (far > SPIKE_LONG * cap) continue;
    }
    for (let k = -a + 1; k < b; k++) cut[ri].add((t + k + n) % n);
  }
  return out.map((r, ri) => (cut[ri].size ? r.filter((_, i) => !cut[ri].has(i)) : r));
}

/** The design's notches and crotches (turning back DESIGN_DENT or more), where they lie and how sharp, for bridgeDents;
    and its counters, its contours wound the other way from its outside: both read once a letter. */
function designDents(rig: SkinRig): { x: number; y: number; turn: number; tip: boolean }[] {
  let got = DENTS.get(rig);
  if (!got) {
    const rs = rig.contours.map(ringOf);
    got = notches(rs, rig.ctx.cap, DESIGN_DENT).map(([ri, i, turn, tip]) => ({ ...rs[ri][i], turn, tip }));
    DENTS.set(rig, got);
  }
  return got;
}
function designHoles(rig: SkinRig): P[][] {
  let got = HOLES.get(rig);
  if (!got) {
    const rs = rig.contours.map(ringOf), lead = rs.reduce((a, r) => (Math.abs(signedArea(r)) > Math.abs(signedArea(a)) ? r : a), rs[0] ?? []), sign = Math.sign(signedArea(lead));
    got = rs.filter(r => Math.sign(signedArea(r)) !== sign);
    HOLES.set(rig, got);
  }
  return got;
}
const DENTS = new WeakMap<SkinRig, { x: number; y: number; turn: number; tip: boolean }[]>(), HOLES = new WeakMap<SkinRig, P[][]>();

/** A point inside a hole: its middle, or, where that lies off it (a crescent), the middle of the widest run across it at
    that height. */
function inPaper(p: P[]): P {
  let mx = 0, my = 0;
  for (const q of p) { mx += q.x; my += q.y; }
  mx /= p.length; my /= p.length;
  const xs: number[] = [];
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; if ((a.y <= my) !== (b.y <= my)) xs.push(a.x + (my - a.y) * (b.x - a.x) / (b.y - a.y)); }
  xs.sort((u, v) => u - v);
  let best = -1, at = mx;
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > best) { best = xs[i + 1] - xs[i]; at = (xs[i] + xs[i + 1]) / 2; }
  return { x: at, y: my };
}

/** bridgeDents: a notch turns back DENT_TURN degrees or more over DENT_REACH of the capitals' height either way, not a
    tip (paper DENT_PAST units on past its point and ink between its sides: a tip the design hasn't near, a spike, is cut
    off across its root no wider than SPIKE_WIDE of the capitals' height, nor reaching further off it than SPIKE_LONG), and is
    bridged where it is DENT_SHARPER degrees sharper than the design's sharpest within DENT_NEAR of it (the design's read
    from DESIGN_DENT), the bridge no longer than DENT_WIDE nor turning on from the outline either side by more than
    DENT_END degrees (a point there); and a hole the design hasn't, smaller than NEW_HOLE of the capitals' height
    squared, is filled, made smaller about its middle as it is from that to NEW_HOLE_FADE of it. */
/** The least share of a speck's size a hole the design draws keeps, as a counter (tidyRings). */
const HOLE_LEAST = 0.1;
const DENT_PAST = 2, SPIKE_WIDE = 0.03, SPIKE_LONG = 0.1, DENT_TURN = 150, DENT_REACH = 0.012, DENT_SHARPER = 20, DENT_NEAR = 0.06, DENT_WIDE = 0.05, DENT_END = 100, DESIGN_DENT = 90, NEW_HOLE = 0.1, NEW_HOLE_FADE = 0.5;

/** Folds cut out; where moved edges still cross (strokes thickened into each other), the letter is its
    ink read as the font reads it, without the folds (which wind the other way); then traced back into curves. A speck
    left over, a sliver of ink or of a counter pinched off where two strokes thickened into each other, goes. */
function tidyRings(rings: P[][], cap: number, dots?: boolean[], held?: P[][]): Node[][] {
  let tidy = rings.map(r => untangle(r, 60, !!held)), kept = dots;
  if (crosses(tidy)) {
    // (the rest made one ink, a dot kept apart and kept: made smaller with the stems, it may be smaller than a speck)
    const own = tidy.filter((_, i) => kept?.[i]), rest = tidy.filter((_, i) => !kept?.[i]);
    const ccw = rest.reduce((a, r) => a + signedArea(r), 0) > 0, sh = shape(ccw ? rest : rest.map(r => r.slice().reverse()), true);
    const one = combine([sh], sh.has);
    tidy = [...one, ...own.map(r => (signedArea(r) < 0 ? r.slice().reverse() : r))];
    kept = own.length ? [...one.map(() => false), ...own.map(() => true)] : undefined;
  }
  const speck = (cap * SPECK) ** 2;
  // (the largest hole lying in each of `held`, the design's counters as moved, kept down to HOLE_LEAST of a speck: not
  // a piece of one parted off, a Chancery's H's loop's two)
  const lead = Math.sign(signedArea(tidy.reduce((a, r) => (Math.abs(signedArea(r)) > Math.abs(signedArea(a)) ? r : a), tidy[0] ?? []))), least = HOLE_LEAST * speck;
  const counters = new Set<P[]>();
  if (held?.length && tidy.some(r => Math.abs(signedArea(r)) < speck)) for (const h of held) {
    let best: P[] | null = null;
    for (const r of tidy) if (Math.sign(signedArea(r)) !== lead && inPoly(h, inPaper(r)) && (!best || Math.abs(signedArea(r)) > Math.abs(signedArea(best)))) best = r;
    if (best && Math.abs(signedArea(best)) >= least) counters.add(best);
  }
  if (tidy.some(r => Math.abs(signedArea(r)) < speck)) tidy = tidy.filter((r, i) => kept?.[i] || Math.abs(signedArea(r)) >= speck || counters.has(r));
  // (each traced on its own, and kept with what it was traced from, its points not yet drawn to whole units: skinRoom)
  return tidy.flatMap(r => { const cs = fitOutline([...r.map((p, i): [string, ...number[]] => [i ? 'L' : 'M', p.x, p.y]), ['Z']], 1.2); for (const c of cs) TRACED.set(c, r); return cs; });
}
/** The ring each contour tidyRings traced was traced from. */
const TRACED = new WeakMap<Node[], P[]>();
