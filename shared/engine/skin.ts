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
  /** the font it is a letter of */ font: RigLetters;
  /** the font's own stem and hairline (its n's stems and its H's bar), in its units: how much contrast the font is drawn with */ ref: () => { stem: number; hair: number };
  /** whether the font stands its stems on serifs (fontSerifed) */ serifed: () => boolean;
  /** whether the font is drawn in heavy strokes ending round, about as thick as each other, and no serifs
      (fontStroked): 1 at every lighter weight, 2 from STROKED_UNDER down, 0 not */ stroked: () => 0 | 1 | 2;
  /** whether the font's slabs are short blocks, a wood type's (fontSlabbed) */ shortSlabs: () => boolean;
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
/** How far past its stroke's edge the point (x, y) reaches on a serif, where a straight stroke (a stem, or a leg
    slanting in to the line, an A's or an x's) ends on line L (0 off a serif); with the stroke's thickness, and how far
    the paper reaches out from its edge on the serif's side, a little way up from the serif (Infinity outside). */
function serifReach(f: Grid, x: number, y: number, nx: number, ny: number, L: number, cap: number): { dx: number; stem: number; room: number; reach: number } {
  // a stroke: straight, as wide at three heights and its edges in line, as a round letter's sides never are
  // (read nearer the line where the strokes meet one another soon after it, as an x's do)
  const dir = L > cap * 0.2 ? -1 : 1, tol = cap * 0.012;
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
    const qx = x + nx * 1.5, qy = y + ny * 1.5, row = runs(f, qy).find(r => r[0] <= qx + 1 && r[1] >= qx - 1);
    if (!row || row[0] > e1(qy) || row[1] < e0(qy)) continue;
    // and it's a thin slab: a little way in from the line it has gone (a hook, as at the foot of a t, hasn't)
    const hi = L + dir * cap * 0.08, ha = L + dir * 2;
    const inner = runs(f, hi).find(r => r[0] <= e1(hi) && r[1] >= e0(hi)), atLine = runs(f, ha).find(r => r[0] <= e1(ha) && r[1] >= e0(ha));
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
    const slabL = deep ? thick(-1) : !inner || e0(hi) - inner[0] < 0.4 * (atLine ? e0(ha) - atLine[0] : 0) + 2 || thick(-1);
    const slabR = deep ? thick(1) : !inner || inner[1] - e1(hi) < 0.4 * (atLine ? atLine[1] - e1(ha) : 0) + 2 || thick(1);
    // (the room beside the stem a little way up, and beside the serif's own tip, whichever is less: two serifs reaching
    // toward each other across a counter's foot keep apart)
    const out = (x0: number, h: number, side: number) => march(f, x0, h, side, 0, cap);
    const room = (side: number) => Math.min(out(side < 0 ? e0(hs[0]) : e1(hs[0]), hs[0], side), out(side < 0 ? row[0] : row[1], qy, side));
    // (a point on the stem's own edge, which reads a hair past it, is no serif's)
    if (x < e0(y) - 2 && e0(y) - row[0] < cap * 0.2 && slabL) return { dx: x - e0(y), stem: w, room: room(-1), reach: e0(y) - row[0] };
    if (x > e1(y) + 2 && row[1] - e1(y) < cap * 0.2 && slabR) return { dx: x - e1(y), stem: w, room: room(1), reach: row[1] - e1(y) };
  }
  }
  return { dx: 0, stem: 0, room: 0, reach: 0 };
}

/** One contour of the letter rigged: each sample read across its stroke, the strokes' thickness without their
    joins', and their ends and dots marked. `alone`: the contour lies inside no other and holds none (read by their
    first points), so it can be a square dot (a blob; a ring round one point is a dot alone or not). */
function rigContour(c: Node[], f: Grid, ctx: Ctx, alone: boolean): Bone[] {
  const lines = [0, ctx.xh, ctx.cap, ctx.asc, ctx.desc];
  const serifLines = ctx.lower ? [0, ctx.xh, ctx.asc, ctx.desc] : [0, ctx.cap];
  const bones = samples(c).map(p => readSample(p, f, ctx, lines, serifLines));
  // (how far the skeleton typically lies from the paper: about half a typical stroke's thickness)
  const typical = bones.map(b => b.best).sort((a, b) => a - b)[bones.length >> 1];
  thicknessWithoutJoins(bones, typical);
  markEnds(bones);
  markDot(bones, ctx, alone, typical);
  return bones;
}

/** A sample read across its stroke: its inward normal, followed to the skeleton; the way the stroke runs there; the
    stroke's thickness; how far it reaches out on a serif; and whether it lies flat on one of the letter's lines. */
function readSample(p: Sample, f: Grid, ctx: Ctx, lines: number[], serifLines: number[]): Bone {
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
  let sr = { dx: 0, stem: 0, room: 0, reach: 0 };
  for (const L of serifLines) if (Math.abs(p.y - L) <= ctx.cap * SERIF_ZONE && !sr.dx) sr = serifReach(f, p.x, p.y, nx, ny, L, ctx.cap);
  const onLine = p.straight && Math.abs(ny) > 0.97 && lines.some(L => Math.abs(p.y - L) < 2.5);
  // (out from the edge, the paper's width to the next ink: a counter's, or the room between two strokes)
  const gap = march(f, p.x, p.y, -nx, -ny, ctx.cap);
  return { ...p, nx, ny, ax, ay, best, dx, dy, w: chord / 2, w0: chord / 2, serifDx: sr.dx, serifStem: sr.stem, serifRoom: sr.room, serifReach: sr.reach, gap, onLine, cap: false, lineCap: false, dot: false };
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

/** A dot: a ring round one point, which grows evenly; or a square one (Oswald's), a small blob about as wide as it
    is tall that fills most of its box, its skeleton the cross of its diagonals. */
function markDot(bones: Bone[], ctx: Ctx, alone: boolean, typical: number) {
  let cx = 0, cy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const b of bones) { cx += b.ax; cy += b.ay; x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x); y0 = Math.min(y0, b.y); y1 = Math.max(y1, b.y); }
  cx /= bones.length; cy /= bones.length;
  const bw = x1 - x0, bh = y1 - y0, area = Math.abs(signedArea(bones));
  const blob = alone && bw > 0 && bh > 0 && bw / bh < 1.6 && bh / bw < 1.6 && Math.max(bw, bh) < ctx.cap * 0.3 && area > bw * bh * 0.6;
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

const rigs = new WeakMap<RigLetters, { lines: { asc: number; desc: number }; unicase: boolean; letters: Map<string, SkinRig | null>; ref?: { stem: number; hair: number }; serifed?: boolean; stroked?: 0 | 1 | 2; slabs?: boolean }>();

/** A font's own stem and hairline, in its units: its n's (or H's) stems and its H's bar (or the n's level strokes),
    read once. A fat face's or a Didone's hairline is a small share of its stem, a sans's most of it. */
function fontRef(font: RigLetters) {
  const kept = rigs.get(font)!;
  if (!kept.ref) {
    const n = skinRig(font, 'n') ?? skinRig(font, 'H'), H = skinRig(font, 'H') ?? n;
    const stem = (n?.stem ?? 0.12) * font.cap;
    kept.ref = { stem, hair: Math.min(stem, (H?.bar ?? n?.bar ?? 0.12) * font.cap) };
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
function rigOf(font: RigLetters, cs: Node[][], f: Grid, ctx: Ctx): SkinRig {
  // (a dot is on its own: a counter as small, a bold e's eye, is inside the letter's outline, and so is no dot, nor an o round its counter)
  const polys = cs.map(c => c.map(n => ({ x: n.x, y: n.y })));
  const bones = cs.map((c, i) => rigContour(c, f, ctx, !polys.some((o, j) => j !== i && o.length > 2 && (inPoly(o, polys[i][0]) || inPoly(polys[i], o[0])))));
  const upright = bones.flat().filter(b => Math.abs(b.nx) > 0.9 && !b.cap).map(b => b.w * 2).sort((a, b) => a - b);
  const level = bones.flat().filter(b => Math.abs(b.ny) > 0.9 && !b.cap && !b.dot).map(b => b.w * 2).sort((a, b) => a - b);
  const stem = (upright[upright.length >> 1] ?? 0) / font.cap;
  return { contours: cs, bones, ends: bones.map(strokeEnds), ctx, serifs: bones.some(bs => bs.some(b => b.serifDx !== 0)), stem, bar: level.length ? level[level.length >> 1] / font.cap : stem,
    font, ref: () => fontRef(font), serifed: () => fontSerifed(font), stroked: () => fontStroked(font), shortSlabs: () => fontSlabbed(font), moves: new Map() };
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
      const A = sp[a], vx = sp[b].x - A.x, vy = sp[b].y - A.y;
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
      if (!ways.every(u => u.y * dir > 0.3 && Math.abs(u.x) > 0.2) || Math.sign(ways[0].x) === Math.sign(ways[1].x)) continue;
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
      if (feetOn && !(J.r > VERTEX_HAIR * r0) && Math.abs(J.y - L) <= VERTEX_NEAR * J.r) continue;
      // (and only where they meet within the vertex's own end, its round: a w's middle peak, short of the x-height,
      // isn't drawn up to it)
      const T = nodes[far(tipBr[0])];
      // (or in its ink, no further across from its end than the join's round: a Didone's W's, cut flat on its line, its
      // end's round well up from it, its M's, a point, the strokes' middles meeting 80 units up it)
      const within = Math.hypot(J1.x - T.x, J1.y - T.y) <= T.r + tol;
      if (!within && !(Math.abs(M.x - T.x) <= Math.max(T.r, J.r) && inside(M.x, M.y))) continue;
      if (!(within && plain(tipBr[0])) && !(J.r > VERTEX_HAIR * r0)) continue;
      for (const R of runs) { const lead = run(J1, R.A, () => R.A.r).slice(0, -1); for (const q of lead) VRUN.add(q); put(R.br, [...lead, ...R.sp.slice(R.a)]); }
      const tip = { x: J1.x, y: L + dir * r0 * 0.5, r: r0 * 0.5 };
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
  s: m.s, hT: m.hT, v: m.tDir(0, 1), ws: m.ws, xr: m.xh / m.cap, bar: m.bar, serif: serifLen(m.p.serifSize, m.ws),
  asc: (m.p.extenders - 0.5) * 0.5, desc: m.desc / m.cap, cntR: counterScale('r', m.cnt), cntN: counterScale(undefined, m.cnt),
  dot: m.p.dotSize < 0.5 ? 0.7 + 0.6 * m.p.dotSize : 1 + (m.p.dotSize - 0.5), pinch: m.p.pinch, pinchPos: m.p.pinchPos, joints: m.p.joints
});
/** How near two of each measure count as the same (a stem's, a bar's and a serif's length in the engine's units, the
    rest shares and settings). Every SkinMeasures field is here, as the type asks: sameMeasures and skinMove's kept
    moves read only these. */
const SAME_WITHIN: Record<keyof SkinMeasures, number> = {
  s: 0.05, hT: 0.05, v: 0.05, ws: 1e-4, xr: 1e-4, bar: 1e-4, serif: 0.05, asc: 1e-4, desc: 1e-4, cntR: 1e-4, cntN: 1e-4, dot: 1e-4, pinch: 1e-4, pinchPos: 1e-4, joints: 1e-4
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
    moved far can fold in a dozen places, and each fold left winds the other way, a slit in the ink). */
function untangle(p: P[], reach = 60) {
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
  /** a lighter weight: the stems themselves drawn thinner (Weight or Verticals), not only their pen turned or pinched */ lighter: boolean;
  /** how much each edge's stroke thickens (thins, under 1) by Weight and Contrast, before Pinch and Joints */ weighs: (b: Bone) => number;
  keeps: (b: Bone, r: number, i: number) => number;
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
  if (t >= 1) return out;
  const e = (1 - t) ** 2 * PICK_GROW * rig.ref().stem;
  if (e <= 0.5) return out;
  const k = 1 - PICK_THIN * t, moved = movedOnce(rig, m0, { ...m1, s: m1.s * k, hT: m1.hT * k, v: m1.v * k }, 'moved', true).out;
  // (the moved letter within the design's ink: a wood type's arm, moved without its slab, runs out past where the slab
  // ended)
  // (and within as far of the strokes as it lies nearer the pick than PICK_BLEND (squared), out to PICK_GROW of the
  // font's stem at the pick: the strokes drawn again so much thicker, read every third point, where the letter moved,
  // rougher, pokes out past them, and as it thins, out past where its strokes end, a K's leg's foot)
  const mv = moveMap(lined, m0, m1);
  const near = shape(thinStrokes(lined, mv, R => R + e, undefined, drawnMode(lined)).map(r => r.filter((_, i) => i % 3 === 0 || r.length < 9).map(p => ({ x: mv.gx(p.x), y: mv.gy(p.y) }))).map(r => (signedArea(r) < 0 ? r.slice().reverse() : r)), true);
  const A = shape(out.map(ringOf)), B = shape(moved.map(ringOf)), ink = letterInk(rig, moveMap(rig, m0, m1));
  return tidyRings(combine([A, B, ink, near], (x, y) => A.has(x, y) || (B.has(x, y) && ink.has(x, y) && near.has(x, y))), rig.ctx.cap);
}
/** How far below the font's own stems, as a share of them, a letter drawn as its strokes starts in from the design
    (fromPick), how much thinner than the strokes the moved letter it is united with is there, and how far out from
    the strokes, as a share of the font's stem, that letter may stand at the pick. */
const PICK_BLEND = 0.15, PICK_THIN = 0.5, PICK_GROW = 0.5;

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
  return movedPlain(rig, m0, m1, undefined, grows);
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
    const { s, was, by } = grows ? mendFrom(rig, m0, m1, [...first.out, ...(first.dropped ?? [])]) : { s: 1, was: [], by: 0 };
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
  return { s: strokes === Infinity ? best / MEND_BLEND : Math.min(1, best / (best + Math.abs(strokes * G - kv))), was, by };
}
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
  const [p0, n0] = count(rig.contours), [p1, n1] = count(out);
  return (p0 === p1 && n0 === n1) || (p0 === n1 && n0 === p1);
}

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
  const lift = keepHeights(rig, rings, mv.gy);
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
    let j0 = 0;
    for (const E of thinSkeleton(rig).edges) {
      const run: (P & { s: number; y0: number })[] = [];
      for (let i = 0; i < E.pts.length; i += 3) {
        if (rig.thin.vrun[j0 + i]) continue;
        const q = thinMiddle(rig, mv, j0 + i, hugs || (how !== 'strokes' ? 'moved' : false)), y = how === 'strokes' ? mv.gy(q.y) : lift(mv.gy(q.y));
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
  const across = snapFlatEdges(rig, rings, mv.gy);
  // (and the middles of a stroke along a line, which its edge put back on the line brought back with it)
  if (across.length && how !== 'strokes') for (const run of middles) for (const m of run) {
    const a = across.find(a => Math.abs(m.x - a.x) <= STEP / 2 && m.y >= Math.min(a.y0, a.y1) && m.y <= Math.max(a.y0, a.y1));
    if (a) { m.y += a.dy; m.y0 += a.dy; }
  }
  // (a lighter weight's end that stays, its corners gone in past its points along it, doubles back on itself there; and
  // a dot, made as much smaller as the stems are thinner, is never taken for a speck)
  if (mv.lighter) rings = rings.map((ring, r) => doubledBack(ring, rig.bones[r]));
  // (how far its outline so moved reaches either side, before a tip whose sides crossed is cut off as a fold: see skinSpan;
  // not a letter drawn as its strokes, which stop short of its tips as drawn)
  const span = mv.lighter && how !== 'strokes' ? xSpan(rings) : null;
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
    const more = thinStrokes(mr, mm, grow < 1 ? R => Math.max(0.05, mendBy(R) * grow) : mendBy, to, 0, true).map(r => r.map(p => on({ x: mm.gx(p.x), y: lift(mm.gy(p.y)) }, 0)));
    // (wound as the letter's outside is, so they add to its ink)
    const outer = rings.reduce((a, r) => (Math.abs(signedArea(r)) > Math.abs(signedArea(a)) ? r : a), rings[0]), sign = Math.sign(signedArea(outer));
    const wound = more.map(r => (Math.sign(signedArea(r)) === sign ? r : r.slice().reverse()));
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
  const out = tidyRings(rings, rig.ctx.cap, dots);
  // (and a crumb a lighter weight leaves where strokes meet, a sliver or a pinhole, goes, as small as a crumb is as far in
  // from the design (PICK_BLEND); its dots stay)
  if (!mv.lighter) return { out, middles, eased };
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
  return { gy, gyDot, gx, top, top1, sx, kv, kh, ks, kd, lighter: m1.s < m0.s * 0.999 && kv < 1, weighs: weighsOf(rig, kv, kh), keeps };
}

/** How far out from a join, in the join's own distance to the paper, the strokes leaving it read thicker for meeting there. */
const JOIN_ZONE = 1.25;
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
    all past ARCH_REACH[1]. And where stretchRounds reads a corner of two lines, they cross at more than ARCH_TURN (sine). */
const ARCH_RUN = 6, ARCH_FROM = 2, ARCH_UPRIGHT = 0.9, ARCH_NEAR = 0.2, ARCH_PAIR = 0.02, ARCH_SLANT = [Math.cos(75 * Math.PI / 180), Math.cos(20 * Math.PI / 180)];
const ARCH_STEEP = Math.cos(40 * Math.PI / 180), ARCH_NECK = 0.45, ARCH_REACH = [4, 6], ARCH_TURN = 0.3, ARCH_TIGHT = 8 * Math.PI / 180, ARCH_ROUND = 0.04, ARCH_V = [Math.cos(150 * Math.PI / 180), Math.cos(30 * Math.PI / 180)];
/** A lighter weight's round inside a join, carried whole (moveRing's carryFillets): its samples each turning away from
    the ink by at least FILLET_TURN (radians, half the turn from the sample before to the one after), FILLET_MIN in all. */
const FILLET_TURN = 0.02, FILLET_MIN = 25 * Math.PI / 180;
/** The most a round on the outside of a corner, carried whole, turns (carryFillets): more is a stroke's round end. */
const ROUND_MOST = 135 * Math.PI / 180;
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
  // read: a K's arms meeting just off its stem)
  sk.edges.forEach((E, e) => {
    if (!isJoin(E.a) || !isJoin(E.b) || cum[e][cum[e].length - 1] > JOIN_ZONE * Math.min(sk.nodes[E.a].r, sk.nodes[E.b].r)) return;
    let most = Infinity;
    for (const n of [E.a, E.b]) for (const k of sk.nodes[n].edges) {
      if (k === e) continue;
      const K = sk.edges[k], c = cum[k], L = c[c.length - 1], Z = Math.min(JOIN_ZONE * sk.nodes[n].r, L / 2);
      const i = K.a === n ? Math.max(0, c.findIndex(v => v >= Z)) : c.length - 1 - Math.max(0, [...c].reverse().findIndex(v => L - v >= Z));
      most = Math.min(most, own[k][i]);
    }
    if (most < Infinity) own[e] = own[e].map(v => Math.min(v, most));
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
  const out: ThinReads = { x: new Float64Array(n), y: new Float64Array(n), r: new Float64Array(n), s: new Float64Array(n), tx: new Float64Array(n), ty: new Float64Array(n), foot: new Float64Array(n).fill(NaN), footDir: new Int8Array(n), footStem: new Int8Array(n), footId: new Int32Array(n).fill(-1), vertices: VERTICES.get(sk) ?? [], vrun: new Uint8Array(n), flush: [], feet: [], zone: [], legs, near, across, joins: new Map(joins.map(k => [k, sk.nodes[k]])) };
  let j = 0;
  const idx = new Map<SkPt, number>(), footIds = new Map<Foot, number>();
  sk.edges.forEach((E, e) => E.pts.forEach((p, i) => {
    const a = E.pts[Math.max(0, i - 2)], b = E.pts[Math.min(E.pts.length - 1, i + 2)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
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
function straightThrough(T: ThinReads, N: SkPt, ls: Leg[]): { sx: number; sy: number; joins: Leg[] } | null {
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
  const hairKept = h0 * mv.weighs({ tx: 1, ty: 0, w: h0 / 2, serifDx: 0, dot: false } as Bone);
  const floor = hairFloor(rig, mv);
  for (let j = 0; j < n; j++) { R[j] = Math.max(0, mv.weighs({ tx: T.tx[j], ty: T.ty[j], w: T.s[j], serifDx: 0, dot: false } as Bone) * T.s[j], Math.min(T.s[j], floor)); Rmost = Math.max(Rmost, R[j]); }
  const grid = T.grid ??= pointGrid(T);
  const crotches = new Map<number, Crotch>(), pins = new Map<number, P>();
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
      const k = mv.weighs({ ...b, w: b.best }) * kp, d = Math.max((k - 1) * b.best, Math.min(0, floor * kp - b.best));
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
      const k = mv.weighs({ ...b, w: b.best }) * kp, d = Math.max((k - 1) * b.best, atTip[i] ? Math.min(0, hairKept / 2 - b.best) : hairKept / 2 - b.best);
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
    const end = facing && flatEnd && !is.some(i => inRun[i]) && len < 3.6 * Math.max(...is.map(i => bs[i].best)) && is.filter(i => !T.across[r][i]).length * 2 > is.length && !crotch(is[0] - 1) && !crotch(is[is.length - 1] + 1);
    // (a side moves by the samples whose rounds span its stroke, where it has any: those by its end read the stroke the
    // end runs into)
    const sides = is.filter(i => T.across[r][i]), m = end ? 0 : mid((sides.length ? sides : is).map(i => delta[i]));
    for (const i of is) delta[i] = m;
  }
  // a font drawn with much contrast keeps its hairline as the weight keeps it (family.ts) all round: no side spanning its
  // stroke goes in past where the stroke would be thinner, however it read its move (an o's top, read off its curve);
  // but a serif drawn level on its line (withFeet), already no thicker than its hairline (footRound), which this read
  // off the serif's middle as it was, before it was drawn level: an A's leaning leg's inner serif kept 28 units thick at
  // Thin, a dark wedge under the leg
  if (byThick > 0) bs.forEach((b, i) => { if (!b.corner && !b.dot && !b.serifDx && T.across[r][i] && !crossEnd(b) && (footed[i] !== 1 || T.footStem[T.near[r][i]] !== 0)) delta[i] += (Math.max(delta[i], Math.min(0, hairKept / 2 - b.best)) - delta[i]) * byThick; });
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
  return { k0, delta, crotches, pins, footed, hug, hugY };
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
  const joins = near.map(n => ({ ...atN(n), r: n.r * JOIN_REACH * t(n) }));
  if (!joins.length || joinsAs === 'none') return { rings, dots, eased };
  const round = (c: { x: number; y: number; r: number }): P[] => Array.from({ length: 32 }, (_, k) => ({ x: c.x + Math.cos(k * Math.PI / 16) * c.r, y: c.y + Math.sin(k * Math.PI / 16) * c.r }));
  // (each stroke's end from a little short of its skeleton's end on out, the way the stroke runs: no further back, where
  // a short stroke's end would take in the join it leaves)
  const ends = sk.nodes.flatMap((n, ni) => {
    if (n.edges.length !== 1) return [];
    const E = sk.edges[n.edges[0]], pts = E.a === ni ? E.pts.slice().reverse() : E.pts, q = pts[Math.max(0, pts.length - 5)];
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
  // a round on a stroke drawn again to a corner of the letter would stand out past it, below a b's foot)
  const was = letterInk(rig, mv);
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
  const atJoin = new Map<number, number>();
  if (drawn) {
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
  let j0 = 0;
  for (const E of sk.edges) {
    const n0 = E.pts.length, raw = E.pts.map((_, i) => { const q = thinMiddle(rig, mv, j0 + i, drawn === 1 || (moved ? 'moved' : false)); return { ...q, R: by(q.R), s: rig.thin!.s[j0 + i], ox: rig.thin!.x[j0 + i], oy: rig.thin!.y[j0 + i] }; });
    j0 += n0;
    if (!n0 || stub(E) || runOn(E)) continue;
    // (where `drawn` on the skeleton the ink's middle reads, that middle and its thickness evened out along it (evenRun):
    // read a cell at a time off a heavy stroke, it wanders, and a stroke drawn along it is lumpy)
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
    const taper = (ps: typeof mid, free: boolean) => {
      if (drawn !== 1 || !free || ps.length < 6) return ps;
      // (one the design cuts, not one ending round, which tapers into its round)
      { const p = ps[ps.length - 1], q = ps[ps.length - 6], l = Math.hypot(p.x - q.x, p.y - q.y) || 1, ux = (p.x - q.x) / l, uy = (p.y - q.y) / l, o = { x: p.ox, y: p.oy };
        if (!capAhead(o, ux, uy, ahead(o, ux, uy), p.s)) return ps; }
      const Rs = ps.map(q => q.R).sort((a, b) => a - b), Rm = Rs[Rs.length >> 1];
      let k = ps.length;
      while (k > 3 && ps[k - 1].R < TAPER * Rm) k--;
      // (and where it turns off its way into that corner: the way it runs a round or two in from its end, and each step on
      // from there no more than TAPER_TURN off it)
      {
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
      if (ml < 1e-3 || Math.abs(ax * by2 - ay * bx) < 1e-3) { out.push(round(p, R)); continue; }
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
  return (1 - t) * h0 * mv.weighs({ tx: 1, ty: 0, w: h0 / 2, serifDx: 0, dot: false } as Bone) / 2;
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

/** Point j of a lighter weight's skeleton (thinReads), and the stroke's half thickness there now, as the strokes drawn
    again have it (moved with the letter's heights after, which carry a stroke along a line back to it). */
function thinMiddle(rig: SkinRig, mv: MoveMap, j: number, hug: boolean | 'moved' = false): P & { R: number } {
  const T = rig.thin!, s = T.s[j], R = Math.max(1, mv.weighs({ tx: T.tx[j], ty: T.ty[j], w: s, serifDx: 0, dot: false } as Bone) * s, Math.min(s, hairFloor(rig, mv)));
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
      const R = Math.max(1, mv.weighs({ tx: T.tx[j], ty: T.ty[j], w: s, serifDx: 0, dot: false } as Bone) * s, Math.min(s, hairFloor(rig, mv)));
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
      const R = Math.max(1, mv.weighs({ tx: T.tx[j], ty: T.ty[j], w: s, serifDx: 0, dot: false } as Bone) * s, Math.min(s, hairFloor(rig, mv)));
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
    Rs, its serifs' Rf, read at a point j of each; tol the line's give), up to reach; or, never reaching it so, as far as
    it lies off it (0 where it is on it already), or NaN by a foot reaching across its stem. */
function intoFoot(F: ThinReads['feet'][number], b: Bone, Rs: (j: number) => number, Rf: (j: number) => number, tol: number, reach: number) {
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
  for (let t = 2; t <= reach; t += 2) if (off(b.x + b.nx * t, b.y + b.ny * t) <= 0) return off(b.x + b.nx * (t - 1), b.y + b.ny * (t - 1)) <= 0 ? 1 - t : -t;
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
    less than its stem the further out along it, and thins as its stem does. */
function weighsOf(rig: SkinRig, kv: number, kh: number) {
  const { stem, hair } = rig.ref(), tf = hair / Math.max(1, stem);
  // (its hairlines thicken as the engine's bars do, so its own contrast is kept as a share: a Didone with less contrast
  // is still a Didone, not a monoline face at its stems' weight)
  const kHair = kh, contrasty = Math.min(1, Math.max(0, (0.8 - tf) / 0.4));
  return (b: Bone) => {
    if (b.dot) return kv;
    const k = byWeight(b);
    // (a serif thickens less than the stroke it stands on, the further out along it: by the square root of as much at
    // its tip, as a bold's serifs thicken less than its stems; it thins as they do)
    return b.serifDx && k > 1 ? Math.pow(k, 1 - 0.5 * Math.min(1, Math.abs(b.serifDx) / Math.max(1, stem * 0.6))) : k;
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
    const { k0, delta, crotches, pins, footed, hug, hugY } = thinMoves(rig, bs, r, mv);
    // (a level foot's samples as they reach it: eased, a leaning leg's bracket's, its rays running 40 to 100 units in
    // within a few samples, stopped short of it, a wedge under the leg, Almanac's K's)
    const moved = bs.map((b, i) => b.corner || footed[i] ? delta[i] : ease(delta, bs, i, j => !bs[j].corner && end(bs[j]) === end(b)));
    return { dotRoom: bs[0]?.dot ? Math.min(...bs.map(b => b.gap)) * OPEN : Infinity, k0, moved, crotches, pins, hug, hugY };
  }
  // how far each edge moves out (in, lighter): its stroke's change of thickness on this side, a stem's by
  // Weight, a bar's by Contrast too; a stroke's end, which runs across it, stays. An edge across a counter from another
  // grows into it no more than OPEN of its width, so a heavier letter's counters stay open, as the engine's do, being
  // drawn wider as they get heavier; a dot grows evenly all round, as little as its nearest neighbour leaves room for
  const dotRoom = bs[0]?.dot ? Math.min(...bs.map(b => b.gap)) * OPEN : Infinity;
  // a heavier letter's serif goes out with the edge of the stem it stands on, which moves out as far as its stroke
  // thickened (no further into a counter than OPEN of it), so the serif reaches as far past the stem as before and isn't
  // swallowed by it; and it thickens away from its line, as far as its edge runs level. Both are read along the
  // edge's own normal, so a bracket's edge goes as the stem's beside it does. (A lighter one's thins round its stem as
  // its stem does.)
  const serifOut = (b: Bone) => Math.sign(b.serifDx) * Math.min((mv.kv - 1) * b.serifStem / 2, b.serifRoom * OPEN);
  // (how much each edge's stroke thickens, eased along the outline a stroke's width or so, as where a curve turns from
  // upright to level the edge's own heading wavers, more so where it runs into a join)
  const k0 = bs.map((b, i) => weighs(b) * keeps(b, r, i)), ks1 = bs.map((b, i) => b.corner || end(b) ? k0[i] : ease(k0, bs, i, j => !bs[j].corner && !end(bs[j]), 6));
  const delta = bs.map((b, i) => {
    if (end(b)) return 0;
    const k = ks1[i];
    const d = b.serifDx && mv.kv > 1 ? -b.nx * serifOut(b) + (b.onLine ? 0 : (k - 1) * b.w * b.ny * b.ny) : (k - 1) * b.w;
    return d > 0 ? Math.min(d, b.dot ? dotRoom : b.gap * OPEN) : d;
  });
  const moved = bs.map((b, i) => b.corner ? delta[i] : ease(delta, bs, i, j => !bs[j].corner && end(bs[j]) === end(b)));
  return { dotRoom, k0, moved, crotches: undefined as Map<number, Crotch> | undefined, pins: undefined as Map<number, P> | undefined, hug: null as Float64Array | null, hugY: null as Float64Array | null };
}

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

/** One contour of the rig moved (contour r, its samples bs): each edge out or in by its stroke's change of thickness,
    carried where the heights and the width put it, each corner where its two edges meet again, and each stroke's end
    with the sides it joins. */
function moveRing(rig: SkinRig, bs: Bone[], r: number, mv: MoveMap): P[] {
  const { gy, gyDot, gx, top, top1, sx, kd, ks } = mv;
  const n = bs.length, { dotRoom, k0, moved, crotches, pins, hug, hugY } = edgeMoves(bs, r, mv, rig);
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
  const ends = endsOf(rig, r, mv), inEnd = new Uint8Array(n), md = (i: number) => ((i % n) + n) % n;
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
    if (!G.shallow) return { M, w: 1 };
    // (a crotch the curve comes into at a slant shallower than ARCH_STEEP, met again further from where its own edges put
    // it than ARCH_REACH of the curve's stroke as thick as it is now, less and less there: a geometric q's bowl, met again
    // far down the stem at Thin, its thin arm, the round inside it as it was, pinched off)
    const k = md(cEnd + C * ARCH_RUN), j = rig.thin?.near[r][k] ?? -1, R = j >= 0 ? Math.max(1, rig.thin!.s[j] * k0[k]) : 1;
    const own = plainAt(cEnd), reach = Math.hypot(M.x - own.x, M.y - own.y) / R;
    return { M, w: Math.min(1, Math.max(0, (ARCH_REACH[1] - reach) / (ARCH_REACH[1] - ARCH_REACH[0]))) };
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
    if (!b.corner) return { x: x - b.nx * moved[i], y: y - b.ny * moved[i] };
    // a corner sits where its two edges, each moved its own way, meet again (not much further out than they moved); a
    // lighter weight's crotch where strokes join, along the ways the strokes' middles run (thinMoves)
    const away = (tx: number, ty: number) => { const o = { x: ty, y: -tx }; return o.x * b.nx + o.y * b.ny > 0 ? { x: -o.x, y: -o.y } : o; };
    const ways = crotches?.get(i) ?? { inx: b.inx!, iny: b.iny!, outx: b.outx!, outy: b.outy! };
    // (its edges' moves less how far a round kept on its line took them, which carries the corner whole, `up`)
    const i0 = (i - 1 + n) % n, i1 = (i + 1) % n, up = hugY?.[i] ?? 0;
    const o1 = away(ways.inx, ways.iny), o2 = away(ways.outx, ways.outy), d1 = moved[i0] - (hug?.[i0] ?? 0), d2 = moved[i1] - (hug?.[i1] ?? 0);
    const det = o1.x * o2.y - o1.y * o2.x;
    let mx = (o1.x * d1 + o2.x * d2) / 2, my = (o1.y * d1 + o2.y * d2) / 2;
    if (Math.abs(det) >= 0.25) { mx = (d1 * o2.y - d2 * o1.y) / det; my = (o1.x * d2 - o2.x * d1) / det; }
    const lim = 1.6 * Math.max(Math.abs(d1), Math.abs(d2), 0.01), l = Math.hypot(mx, my);
    // (a lighter weight's crotch where its strokes' edges, as thin as they are now, cross, carried as the corner is)
    const at = crotches?.get(i)?.at;
    if (groups.length) { const m = archMeet(i); if (m && m.w >= 1) { meets.set(i, m.M); arched(i); return m.M; } if (m) blend.push(i); }
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
    if (l > lim) { mx *= lim / l; my *= lim / l; }
    return { x: x + mx, y: y + my + up };
  });
  // (a shallow crotch met again part of the way, archMeet's w)
  for (const i of blend) { const m = archMeet(i)!; out[i] = { x: out[i].x + (m.M.x - out[i].x) * m.w, y: out[i].y + (m.M.y - out[i].y) * m.w }; meets.set(i, out[i]); arched(i); }
  if (mv.lighter) { carryFillets(); pinPoints(); stretchRounds(); hairRoots(); holdBrackets(); }
  // (how far this outline's heavy strokes thicken or thin as asked, each side by its own reading of its stroke: a
  // heavy face's sides, read with their joins taken out, often read thinner than they are and move less)
  const heavy = ends.some(e => e.ball) ? heavyShare() : 1;
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
    for (let i = a + 1; i < b; i++) {
      const p = bs[md(i)], dx = p.x - A.x, dy = p.y - A.y, s = (dx * ux + dy * uy) / l2, t = (dy * ux - dx * uy) / l2;
      const qx = A1.x + s * vx - t * vy, qy = A1.y + s * vy + t * vx;
      out[md(i)] = ball ? { x: qx + (hx1 + (p.x - hx) * k - qx) * ball, y: qy + (hy1 + (p.y - hy) * k - qy) * ball } : { x: qx, y: qy };
    }
  }
  return out;

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
    for (const inside of [true, false]) {
    const turn = turns(inside);
    for (let s = 0; s < n; s++) {
      // (each run of samples turning the one way, from its first)
      if (turn[s] < FILLET_TURN || turn[md(s - 1)] >= FILLET_TURN) continue;
      let e = s, total = 0, arc = 0;
      while (e - s < n - 1 && turn[md(e)] >= FILLET_TURN) { total += turn[md(e)]; if (e > s) arc += Math.hypot(bs[md(e)].x - bs[md(e - 1)].x, bs[md(e)].y - bs[md(e - 1)].y); e++; }
      const a = md(s - 1), z = md(e), d1 = moved[a], d2 = moved[z];
      if (bs[a].w0 < 1 || bs[z].w0 < 1) continue;
      // (no longer than its edges move, give or take, or a round on the outside of a corner, one of whose edges lies on a
      // line and stays, an L's foot: point by point, it would lift off the line its edge stays on)
      if (total < FILLET_MIN || (arc > 4 * Math.max(Math.abs(d1), Math.abs(d2)) + 10 && (inside || !(flatOn(rig, bs[a]) || flatOn(rig, bs[z]))))) continue;
      // (nor, outside, in a font without serifs, one running into a sharp corner, a stroke's cut end, which no round
      // stands for: a grotesque s's shoulder into its cut end, 130 units round, was carried whole 77 units at Weight 0.15,
      // its turn pinched to a hook, and not at 0.155, its edges' moves a little shorter, a step of 11% of its ink)
      if (!inside && !rig.serifed() && (bs[a].corner || bs[z].corner)) continue;
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
      for (let k = s; k < e; k++) { const j = md(k); out[j] = { x: base[j].x + mx, y: base[j].y + my }; }
    }
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
      scaled onto it. Only in a join whose outside crotch archCrotches meets again. */
  function stretchRounds() {
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
        // (only in a join an arch's or a bowl's outside crotch is met again in (archCrotches): elsewhere, an ink trap's,
        // its round run into the stem on a thin neck, kept as it was)
        if (!run0.some(inArchJoin)) continue;
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
        const mid = bs[run[run.length >> 1]], cx = (D0.x + D1.x) / 2, cy = (D0.y + D1.y) / 2, vx = Xd.x - cx, vy = Xd.y - cy, vl = vx * vx + vy * vy;
        const f = Math.min(1, Math.max(0.3, vl > 1 ? (4 / 3) * ((mid.x - cx) * vx + (mid.y - cy) * vy) / vl : 0.55));
        // (the round from the stem's side to the curve, turned in the corner they make now, as full as the design's; each
        // of its samples as far along it as it was along the design's, by length)
        const C0 = { x: Q0.x + u0x * X.t * f, y: Q0.y + u0y * X.t * f }, C1 = { x: P1.x + u1x * X.w * f, y: P1.y + u1y * X.w * f };
        const cum = [Math.hypot(bs[run[0]].x - D0.x, bs[run[0]].y - D0.y)];
        for (let k = 1; k < run.length; k++) cum.push(cum[k - 1] + Math.hypot(bs[run[k]].x - bs[run[k - 1]].x, bs[run[k]].y - bs[run[k - 1]].y));
        const total = cum[cum.length - 1] + Math.hypot(D1.x - bs[run[run.length - 1]].x, D1.y - bs[run[run.length - 1]].y);
        run.forEach((j, k) => { const t = cum[k] / total, m = 1 - t; out[j] = { x: m * m * m * Q0.x + 3 * m * m * t * C0.x + 3 * m * t * t * C1.x + t * t * t * P1.x, y: m * m * m * Q0.y + 3 * m * m * t * C0.y + 3 * m * t * t * C1.y + t * t * t * P1.y }; arched(j); });
        // (and the stem's side by the round back on its line)
        for (let k = 0; k <= ARCH_RUN - 3; k++) { const j = md(a - on * k); out[j] = onStem(out[j]); }
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
    let got = 0, asked = 0;
    bs.forEach((p, i) => {
      if (p.corner || p.cap || p.dot || p.serifDx || inEnd[i] || 2 * p.w0 < 0.8 * stem) return;
      got += moved[i] / p.w0; asked += k0[i] - 1;
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
function keepHeights(rig: SkinRig, rings: P[][], gy: (y: number) => number) {
  const c = rig.ctx;
  const back: [number, number][] = [], band = c.cap * 0.06;
  for (const [L, up] of [...(c.lower ? [c.xh, c.asc] : [c.cap]).map(L => [L, true] as const), ...(c.lower ? [0, c.desc] : [0]).map(L => [L, false] as const)]) {
    let was = up ? -Infinity : Infinity, now = was, any = false;
    rig.bones.forEach((bs, r) => bs.forEach((b, i) => {
      if (b.dot || (up ? -b.ny : b.ny) < 0.5 || Math.abs(b.y - L) > band) return;
      any = true;
      was = up ? Math.max(was, b.y) : Math.min(was, b.y); now = up ? Math.max(now, rings[r][i].y) : Math.min(now, rings[r][i].y);
    }));
    if (any) back.push([now, gy(L) + was - L]);
  }
  back.sort((a, b) => a[0] - b[0]);
  const knots2 = back.filter((k, i) => i === 0 || (k[0] > back[i - 1][0] + 1 && k[1] > back[i - 1][1]));
  if (!knots2.length) return (y: number) => y;
  const to = knots2.length === 1 ? (y: number) => y + knots2[0][1] - knots2[0][0] : piecewise(knots2);
  rings.forEach((r, i) => { if (!rig.bones[i][0]?.dot) for (const p of r) p.y = to(p.y); });
  return to;
}

/** A flat edge on a line stays on it exactly (a serif's foot beside a heavier stroke's, which moved
    further and so set where the rest went), its neighbours eased onto it; and the side of a stroke along the line comes
    back with the stroke behind it, the edge across it as far, so the stroke keeps the thickness the move gave it. The
    heights (keepHeights) lift the whole top of a letter by as much as a round beside the edge sank: the edge put back on
    its line alone, the stroke under it was squashed against the line, a typewriter g's ear to a unit's thickness at
    Thin, where it parted from its stem and was lost (the letter 137 units narrower at once). Hands back, for each edge
    across so brought back, where it was and how far (movedOnce brings the strokes' middles there back with it). */
function snapFlatEdges(rig: SkinRig, rings: P[][], gy: (y: number) => number): { x: number; y0: number; y1: number; dy: number }[] {
  const c = rig.ctx;
  const lines = [0, c.cap, ...(c.lower ? [c.xh, c.asc, c.desc] : [])];
  const fixes = rig.bones.map((bs, r) => bs.map((b, i) => {
    if (!b.onLine || b.dot) return 0;
    const L = lines.find(L => Math.abs(b.y - L) < 2.5);
    return L === undefined ? 0 : gy(L) + b.y - L - rings[r][i].y;
  }));
  if (!fixes.some(f => f.some(Boolean))) return [];
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
    // faces off across the line)
    const o = rig.bones[q]?.[k], back = o ? -(b.nx * o.nx + b.ny * o.ny) : 0;
    const facing = Math.min(1, Math.max(0, (back - ALONG[0]) / (ALONG[1] - ALONG[0])));
    const g = f * along * facing * Math.min(1, (most - best) / (most * ACROSS_FADE));
    if (!g) return;
    spans.push({ x: p.x, y0: p.y, y1: p.y + b.ny * best, dy: g });
    for (const j of [k, k1]) if (!fixes[q][j] && Math.abs(g) > Math.abs(carried[q][j])) carried[q][j] = g;
  }));
  rings.forEach((ring, r) => {
    const n = ring.length, fix = fixes[r], across = carried[r], moved = ring.map((_, i) => fix[i] || across[i]);
    if (!moved.some(Boolean)) return;
    ring.forEach((p, i) => {
      if (moved[i]) { p.y += moved[i]; return; }
      // (the nearest such edge within a few samples, less the further it is)
      for (let k = 1; k <= 4; k++) for (const j of [(i - k + n) % n, (i + k) % n]) if (moved[j]) { p.y += moved[j] * (1 - k / 5); return; }
    });
  });
  return spans;
}
/** How far in from a flat edge on a line, as many times the stroke is thick, the edge across it may lie and come back
    with it (snapFlatEdges), the last ACROSS_FADE of that fading out. */
const ACROSS_MOST = 2.5, ACROSS_FADE = 0.4;
/** How nearly along a flat edge's line its stroke runs, and how nearly the edge across faces back at it, for that edge
    to come back with it (snapFlatEdges), as the cosine of the angle: none from 40° off, wholly within 20°. */
const ALONG = [Math.cos(40 * Math.PI / 180), Math.cos(20 * Math.PI / 180)];

/** Folds cut out; where moved edges still cross (strokes thickened into each other), the letter is its
    ink read as the font reads it, without the folds (which wind the other way); then traced back into curves. A speck
    left over, a sliver of ink or of a counter pinched off where two strokes thickened into each other, goes. */
function tidyRings(rings: P[][], cap: number, dots?: boolean[]): Node[][] {
  let tidy = rings.map(r => untangle(r)), kept = dots;
  if (crosses(tidy)) {
    // (the rest made one ink, a dot kept apart and kept: made smaller with the stems, it may be smaller than a speck)
    const own = tidy.filter((_, i) => kept?.[i]), rest = tidy.filter((_, i) => !kept?.[i]);
    const ccw = rest.reduce((a, r) => a + signedArea(r), 0) > 0, sh = shape(ccw ? rest : rest.map(r => r.slice().reverse()), true);
    const one = combine([sh], sh.has);
    tidy = [...one, ...own.map(r => (signedArea(r) < 0 ? r.slice().reverse() : r))];
    kept = own.length ? [...one.map(() => false), ...own.map(() => true)] : undefined;
  }
  const speck = (cap * SPECK) ** 2;
  if (tidy.some(r => Math.abs(signedArea(r)) < speck)) tidy = tidy.filter((r, i) => kept?.[i] || Math.abs(signedArea(r)) >= speck);
  const cmds: [string, ...number[]][] = [];
  for (const r of tidy) { r.forEach((p, i) => cmds.push([i ? 'L' : 'M', p.x, p.y])); cmds.push(['Z']); }
  return fitOutline(cmds, 1.2);
}
