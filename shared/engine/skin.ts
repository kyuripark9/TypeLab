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
import { FREE_FAMILIES } from '../free-fonts';
import { HOOK_LETTERS, OPEN_LETTERS, PEAK_LETTERS, added, bowlStem, hasTerminals } from './restyle';
import { alongFrom, bez, branchNode, branches, endFace, inkGrid, joinsOf, leaving, nearestOn, roundTip, skeleton, type Branch, type Grid, type Skeleton } from './scan';

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
  /** the font's own stem and hairline (its n's stems and its H's bar), in its units: how much contrast the font is drawn with */ ref: () => { stem: number; hair: number };
  /** the last ways it was moved (MOVES_KEPT of them), by the measures it was moved from and to (dragging a slider back
      and forth) */ moves: Map<string, Node[][]>;
  /** its skeleton, scanned when a setting first needs it (see scan.ts) */ sk?: Skeleton;
  /** whether a stroke of it ends square across, where the engine's serifs could stand (see restyleSerifs) */ squareEnds?: boolean;
  /** how near each edge's stroke is to where it runs into another, from 1 there to 0 a little way off (see joinsNear) */ near?: number[][];
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
  const n = v.length;
  const lo = v.map((_, i) => { let m = Infinity; for (let k = -r; k <= r; k++) m = Math.min(m, v[(i + k + n) % n]); return m; });
  return lo.map((_, i) => { let m = -Infinity; for (let k = -r; k <= r; k++) m = Math.max(m, lo[(i + k + n) % n]); return m; });
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
interface EndRun { a: number; b: number; ball: number; pin: number }

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
    for (let ext = 0; T(a - 1) > 0.02 && ext <= w; ext += S(a - 1)) a--;
    for (let ext = 0; T(b) > 0.02 && ext <= w; ext += S(b)) b++;
    if (a < 0) { a += n; b += n; }
    return { a, b };
  }).sort((p, q) => p.a - q.a);
  const out: { a: number; b: number }[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && r.a < last.b) last.b = Math.max(last.b, r.b);
    else out.push({ ...r });
  }
  // (one running on round past the first's start into it)
  if (out.length > 1 && out[out.length - 1].b > out[0].a + n) { const l = out.pop()!; out[0] = { a: l.a - n, b: Math.max(out[0].b, l.b - n) }; }
  return out.filter(r => r.b - r.a >= 2 && r.b - r.a < n - 2).map(r => ballEnd(bones, r));
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

const rigs = new WeakMap<FreeFont, { lines: { asc: number; desc: number }; unicase: boolean; letters: Map<string, SkinRig | null>; ref?: { stem: number; hair: number } }>();

/** A font's own stem and hairline, in its units: its n's (or H's) stems and its H's bar (or the n's level strokes),
    read once. A fat face's or a Didone's hairline is a small share of its stem, a sans's most of it. */
function fontRef(font: FreeFont) {
  const kept = rigs.get(font)!;
  if (!kept.ref) {
    const n = skinRig(font, 'n') ?? skinRig(font, 'H'), H = skinRig(font, 'H') ?? n;
    const stem = (n?.stem ?? 0.12) * font.cap;
    kept.ref = { stem, hair: Math.min(stem, (H?.bar ?? n?.bar ?? 0.12) * font.cap) };
  }
  return kept.ref;
}

/** Letter `ch` of a free font, rigged (once, then kept with the font). */
export function skinRig(font: FreeFont, ch: string): SkinRig | null {
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
  const cs = unite(g.contours);
  // (a dot is on its own: a counter as small, a bold e's eye, is inside the letter's outline, and so is no dot, nor an o round its counter)
  const polys = cs.map(c => c.map(n => ({ x: n.x, y: n.y })));
  const bones = cs.map((c, i) => rigContour(c, f, ctx, !polys.some((o, j) => j !== i && o.length > 2 && (inPoly(o, polys[i][0]) || inPoly(polys[i], o[0])))));
  const upright = bones.flat().filter(b => Math.abs(b.nx) > 0.9 && !b.cap).map(b => b.w * 2).sort((a, b) => a - b);
  const level = bones.flat().filter(b => Math.abs(b.ny) > 0.9 && !b.cap && !b.dot).map(b => b.w * 2).sort((a, b) => a - b);
  const stem = (upright[upright.length >> 1] ?? 0) / font.cap;
  r = { contours: cs, bones, ends: bones.map(strokeEnds), ctx, serifs: bones.some(bs => bs.some(b => b.serifDx !== 0)), stem, bar: level.length ? level[level.length >> 1] / font.cap : stem,
    ref: () => fontRef(font), moves: new Map() };
  kept.letters.set(ch, r);
  return r;
}

/** The letters each letter-form setting draws in another form. A free font's letter asked for in a form other than
    its own comes from the font's twin (formChanged and twinGlyph in free-letters.ts), and skinFollows says the setting
    reaches it (see FORM_FOLLOWS). */
export const FORM_LETTERS = {
  aForm: 'a', gForm: 'g', kForm: 'kK', iForm: 'IiJl', sForm: 'sS$', diagonals: 'AVWvw', yForm: 'Yy', qForm: 'Q', rForm: 'R',
  bowlJoin: 'abdgpqhmnru', bends: 'AMNVWYZvwyz', terminalRun: 'acefjrstyCGJS235690?'
} satisfies Partial<Record<keyof Params, string>>;
/** The letters each setting that draws letters in another form reaches, for skinFollows: FORM_LETTERS's, the a's
    storeys, and the settings that draw whole sets of letters anew. Curved or straight stroke ends (terminalRun) are
    left out: not a SKIN_KEYS setting, it reaches every letter as skinFollows answers it. */
const FORM_FOLLOWS: Record<string, RegExp> = {
  story: /a/, ...Object.fromEntries(Object.entries(FORM_LETTERS).filter(([k]) => k !== 'terminalRun').map(([k, set]) => [k, new RegExp(`[${set}]`)])),
  build: /./, scriptForm: /[A-Za-z]/, flourish: /[Stldrz]/, cursive: /[adhijlmnpru]/
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

/** Whether setting `key` moves letter `ch` of a free font on its skeleton: Crossbar only a letter with a
    bar it moves, x-height only the lowercase, the serifs' size only a letter with serifs, Stem length a
    lowercase letter reaching up or down past the x-height and the baseline, the dots' size a letter with a
    dot, Joints a letter whose strokes run into one another. */
export function skinFollows(font: FreeFont, ch: string, key: string) {
  // (a pixel font's letters only stretch, and change weight where the family has another)
  if (FREE_FAMILIES[font.family]?.grid) return !SKIN_KEYS.has(key);
  if (key === 'crossbar') return ch in BARS;
  if (!SKIN_KEYS.has(key)) return true;
  if (FORM_FOLLOWS[key]) return FORM_FOLLOWS[key].test(ch);
  const rig = skinRig(font, ch);
  if (!rig) return false;
  const ys = rig.contours.flat().map(n => n.y);
  switch (key) {
    case 'xHeight': return rig.ctx.lower;
    case 'extenders': return rig.ctx.lower && Math.max(...ys) > rig.ctx.xh + rig.ctx.cap * 0.12;
    case 'descender': return rig.ctx.lower && Math.min(...ys) < -rig.ctx.cap * 0.1;
    case 'dotSize': case 'dots': return rig.bones.some(bs => bs[0]?.dot);
    case 'apex': return PEAK_LETTERS.includes(ch);
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
      return (!key.startsWith('terminal') && key !== 'tail' && key !== 'aperture') || hasTerminals(rigSkeleton(rig));
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
const sameMeasures = (a: SkinMeasures, b: SkinMeasures) => MEASURES.every(k => Math.abs(a[k] - b[k]) < SAME_WITHIN[k]);

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

/** The rigged letter moved from the measures it was drawn at (m0) toward `to`, only the measures that reach this
    letter taken (m1); its outline traced back into curves. */
export function skinMove(rig: SkinRig, m0: SkinMeasures, to: SkinMeasures): Node[][] {
  const c = rig.ctx;
  // only what moves this letter counts (Crossbar a letter with a bar, the x-height the lowercase, the
  // serifs' size one with serifs), so a letter another setting doesn't reach is the one already drawn
  // (Stem length the lowercase, whose ascenders and descenders it draws out, the dots' size a letter with a dot,
  // Inner space only as far as it widens this letter, Joints a letter where strokes meet)
  const round = ROUND.has(c.ch), dots = rig.bones.some(bs => bs[0]?.dot);
  const m1: SkinMeasures = {
    ...to, bar: c.barY != null ? to.bar : m0.bar, xr: c.lower ? to.xr : m0.xr, serif: rig.serifs ? to.serif : m0.serif,
    asc: c.lower ? to.asc : m0.asc, desc: c.lower ? to.desc : m0.desc, cntR: round ? to.cntR : m0.cntR, cntN: round ? m0.cntN : to.cntN,
    dot: dots ? to.dot : m0.dot, pinchPos: to.pinch || m0.pinch ? to.pinchPos : m0.pinchPos, joints: to.joints !== m0.joints && joinsNear(rig).some(n => n.some(Boolean)) ? to.joints : m0.joints
  };
  if (sameMeasures(m0, m1)) return rig.contours;
  const key = [m0, m1].map(m => MEASURES.map(k => m[k].toFixed(4)).join()).join('|');
  const kept = rig.moves.get(key);
  if (kept) return kept;
  const out = moveRig(rig, m0, m1);
  if (rig.moves.size >= MOVES_KEPT) rig.moves.delete(rig.moves.keys().next().value!);
  rig.moves.set(key, out);
  return out;
}

/** Where the settings put a rigged letter's points: its heights (gy, and gyDot for a dot), its width (gx, sx as much
    wider), how much its strokes thicken (kv upright, kh level), its serifs reach (ks) and its dots grow (kd), and
    how much of its thickness each stroke keeps (Pinch and Joints). top and top1 are the height the letter stands to
    (the x-height or the capitals') before and after. */
interface MoveMap {
  gy: (y: number) => number; gyDot: (y: number) => number; gx: (x: number) => number;
  top: number; top1: number; sx: number; kv: number; kh: number; ks: number; kd: number;
  /** how much each edge's stroke thickens (thins, under 1) by Weight and Contrast, before Pinch and Joints */ weighs: (b: Bone) => number;
  keeps: (b: Bone, r: number, i: number) => number;
}

/** The rig moved from m0 to m1: where the settings put its points (moveMap), each contour moved (moveRing), the
    letter put back to its heights and its flat edges onto their lines, and its outline tidied and traced. */
function moveRig(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures): Node[][] {
  const mv = moveMap(rig, m0, m1);
  const rings = rig.bones.map((bs, r) => moveRing(rig, bs, r, mv));
  keepHeights(rig, rings, mv.gy);
  snapFlatEdges(rig, rings, mv.gy);
  return tidyRings(rings, rig.ctx.cap);
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
  return { gy, gyDot, gx, top, top1, sx, kv, kh, ks, kd, weighs: weighsOf(rig, kv, kh), keeps };
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

/** One contour of the rig moved (contour r, its samples bs): each edge out or in by its stroke's change of thickness,
    carried where the heights and the width put it, each corner where its two edges meet again, and each stroke's end
    with the sides it joins. */
function moveRing(rig: SkinRig, bs: Bone[], r: number, mv: MoveMap): P[] {
  const { gy, gyDot, gx, top, top1, sx, kd, ks, weighs, keeps } = mv;
  const n = bs.length, end = (b: Bone) => b.cap && !b.lineCap;
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
  const ends = rig.ends[r], inEnd = new Uint8Array(n), md = (i: number) => ((i % n) + n) % n;
  for (const { a, b } of ends) for (let i = a + 1; i < b; i++) inEnd[md(i)] = 1;
  const shift = (axis: number, i: number) => bs[i].corner ? geo[axis][i] : ease(geo[axis], bs, i, j => !bs[j].corner && !inEnd[j]);
  const out = bs.map((b, i) => {
    // (a longer serif reaches no further than two fifths of the room beside its tip, so two reaching toward each other
    // across a counter's foot keep apart)
    const kS = ks > 1 && b.serifDx ? 1 + Math.min(ks - 1, 0.4 * b.serifRoom / Math.max(1, b.serifReach * sx)) : ks;
    const x = b.x + shift(0, i) + b.serifDx * (kS - 1) * sx, y = b.y + shift(1, i);
    if (!b.corner) return { x: x - b.nx * moved[i], y: y - b.ny * moved[i] };
    // a corner sits where its two edges, each moved its own way, meet again (not much further out than they moved)
    const away = (tx: number, ty: number) => { const o = { x: ty, y: -tx }; return o.x * b.nx + o.y * b.ny > 0 ? { x: -o.x, y: -o.y } : o; };
    const o1 = away(b.inx!, b.iny!), o2 = away(b.outx!, b.outy!), d1 = moved[(i - 1 + n) % n], d2 = moved[(i + 1) % n];
    const det = o1.x * o2.y - o1.y * o2.x;
    let mx = (o1.x * d1 + o2.x * d2) / 2, my = (o1.y * d1 + o2.y * d2) / 2;
    if (Math.abs(det) >= 0.25) { mx = (d1 * o2.y - d2 * o1.y) / det; my = (o1.x * d2 - o2.x * d1) / det; }
    const lim = 1.6 * Math.max(Math.abs(d1), Math.abs(d2), 0.01), l = Math.hypot(mx, my);
    if (l > lim) { mx *= lim / l; my *= lim / l; }
    return { x: x + mx, y: y + my };
  });
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
  if (knots2.length) {
    const to = knots2.length === 1 ? (y: number) => y + knots2[0][1] - knots2[0][0] : piecewise(knots2);
    rings.forEach((r, i) => { if (!rig.bones[i][0]?.dot) for (const p of r) p.y = to(p.y); });
  }
}

/** A flat edge on a line stays on it exactly (a serif's foot beside a heavier stroke's, which moved
    further and so set where the rest went), its neighbours eased onto it. */
function snapFlatEdges(rig: SkinRig, rings: P[][], gy: (y: number) => number) {
  const c = rig.ctx;
  const lines = [0, c.cap, ...(c.lower ? [c.xh, c.asc, c.desc] : [])];
  rig.bones.forEach((bs, r) => {
    const n = bs.length, fix = bs.map((b, i) => {
      if (!b.onLine || b.dot) return 0;
      const L = lines.find(L => Math.abs(b.y - L) < 2.5);
      return L === undefined ? 0 : gy(L) + b.y - L - rings[r][i].y;
    });
    if (!fix.some(Boolean)) return;
    rings[r].forEach((p, i) => {
      if (fix[i]) { p.y += fix[i]; return; }
      // (the nearest such edge within a few samples, less the further it is)
      for (let k = 1; k <= 4; k++) for (const j of [(i - k + n) % n, (i + k) % n]) if (fix[j]) { p.y += fix[j] * (1 - k / 5); return; }
    });
  });
}

/** Folds cut out; where moved edges still cross (strokes thickened into each other), the letter is its
    ink read as the font reads it, without the folds (which wind the other way); then traced back into curves. A speck
    left over, a sliver of ink or of a counter pinched off where two strokes thickened into each other, goes. */
function tidyRings(rings: P[][], cap: number): Node[][] {
  let tidy = rings.map(r => untangle(r));
  if (crosses(tidy)) {
    const ccw = tidy.reduce((a, r) => a + signedArea(r), 0) > 0, sh = shape(ccw ? tidy : tidy.map(r => r.slice().reverse()), true);
    tidy = combine([sh], sh.has);
  }
  const speck = (cap * SPECK) ** 2;
  if (tidy.some(r => Math.abs(signedArea(r)) < speck)) tidy = tidy.filter(r => Math.abs(signedArea(r)) >= speck);
  const cmds: [string, ...number[]][] = [];
  for (const r of tidy) { r.forEach((p, i) => cmds.push([i ? 'L' : 'M', p.x, p.y])); cmds.push(['Z']); }
  return fitOutline(cmds, 1.2);
}
