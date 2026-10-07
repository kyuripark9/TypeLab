/* A free font's letters moved by the settings as the engine's own letters are (see freeLetters in
   font.ts): each letter's outline is hung on its skeleton, the middle line of its strokes, and the
   settings move the skeleton and thicken or thin the strokes round it by the engine's own measures
   (Metrics), so Weight 70 is as much heavier on a free font as on a built one. Unmoved, a letter is
   the font's exactly.

   The rig: the outline is sampled every few units; each sample's inward normal is followed to the
   ridge of the distance to the paper (the skeleton), and the stroke's thickness there is read across
   it. Moving: the skeleton points go where the heights, the width and the crossbar put them, each
   edge moves out (or in) by its stroke's change of thickness, corners sit where their two edges meet
   again, the letter is put back to its heights (bolder letters keep their x-height and capitals, as
   the engine's do), and the samples are traced back into curves. */
import type { Metrics } from './font';
import type { FreeFont } from './free';
import { fitOutline, type Node } from './outline';
import { signedArea } from './geom';
import { combine, shape } from './boolean';
import { FREE_FAMILIES } from '../free-fonts';

type P = { x: number; y: number };

/* ---- the letter's ink on a grid of one unit a cell, and how far each inked cell is from the paper */

interface Field { x0: number; y0: number; W: number; H: number; ink: Uint8Array; dt: Float64Array }

const bez = (a: Node, b: Node, t: number): P => {
  const p1x = a.ox ?? a.x, p1y = a.oy ?? a.y, p2x = b.ix ?? b.x, p2y = b.iy ?? b.y, u = 1 - t;
  return { x: u * u * u * a.x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * b.y };
};

/** One dimension of the exact distance transform (Felzenszwalb and Huttenlocher), squared distances in and out. */
function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}

function field(cs: Node[][]): Field {
  const rings = cs.map(c => { const out: P[] = []; for (let i = 0; i < c.length; i++) for (let k = 0; k < 12; k++) out.push(bez(c[i], c[(i + 1) % c.length], k / 12)); return out; });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  x0 = Math.floor(x0) - 4; y0 = Math.floor(y0) - 4;
  const W = Math.ceil(x1 - x0) + 8, H = Math.ceil(y1 - y0) + 8, ink = new Uint8Array(W * H);
  // the ink, row by row (nonzero, as the font is read); row 0 is the top
  for (let r = 0; r < H; r++) {
    const fy = y0 + H - r - 0.5, xs: { x: number; w: number }[] = [];
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((a.y <= fy) !== (b.y <= fy)) xs.push({ x: a.x + (fy - a.y) / (b.y - a.y) * (b.x - a.x), w: b.y > a.y ? 1 : -1 });
    }
    xs.sort((a, b) => a.x - b.x);
    let w = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      w += xs[i].w;
      if (w !== 0) for (let c = Math.max(0, Math.round(xs[i].x - x0)), e = Math.min(W, Math.round(xs[i + 1].x - x0)); c < e; c++) ink[r * W + c] = 1;
    }
  }
  const g = new Float64Array(W * H), n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < W * H; i++) g[i] = ink[i] ? 1e12 : 0;
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = g[y * W + x]; edt1(f, H, d, v, z); for (let y = 0; y < H; y++) g[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = g[y * W + x]; edt1(f, W, d, v, z); for (let x = 0; x < W; x++) g[y * W + x] = Math.sqrt(d[x]); }
  return { x0, y0, W, H, ink, dt: g };
}

/** The distance to the paper at a point, read between the cells. */
function dist(f: Field, x: number, y: number) {
  const c = x - f.x0 - 0.5, r = f.y0 + f.H - y - 0.5, c0 = Math.floor(c), r0 = Math.floor(r);
  if (c0 < 0 || r0 < 0 || c0 + 1 >= f.W || r0 + 1 >= f.H) return 0;
  const a = c - c0, b = r - r0, g = f.dt, W = f.W;
  return (g[r0 * W + c0] * (1 - a) + g[r0 * W + c0 + 1] * a) * (1 - b) + (g[(r0 + 1) * W + c0] * (1 - a) + g[(r0 + 1) * W + c0 + 1] * a) * b;
}
const inked = (f: Field, x: number, y: number) => {
  const c = Math.floor(x - f.x0), r = Math.floor(f.y0 + f.H - y);
  return c >= 0 && r >= 0 && c < f.W && r < f.H && f.ink[r * f.W + c] > 0;
};
/** The ink along a row at height y: [left, right] pairs. */
function runs(f: Field, y: number): [number, number][] {
  const r = Math.floor(f.y0 + f.H - y), out: [number, number][] = [];
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
function columnRuns(f: Field, x: number): [number, number][] {
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

interface Bone {
  x: number; y: number;
  /** the inward normal, and the edge's direction */ nx: number; ny: number; tx: number; ty: number;
  /** a corner, and its edges' directions in and out */ corner: boolean; inx?: number; iny?: number; outx?: number; outy?: number;
  /** the skeleton point the normal reaches, and how far along the normal it is */ ax: number; ay: number; t: number; best: number;
  /** the way the stroke runs at the skeleton point */ dx: number; dy: number;
  /** half the thickness of the stroke this edge belongs to */ w: number;
  /** how far past its stem's edge a serif's point reaches (0 off a serif) */ serifDx: number;
  /** which segment of the outline it's on, and whether that is straight */ seg: number; straight: boolean;
  /** on a straight level edge on one of the lines */ onLine: boolean;
  /** on a stroke's end, cut across it; and of that, an end on a line (a stem's foot) */ cap: boolean; lineCap: boolean;
  /** on a dot (of i, j, a full stop) */ dot: boolean;
}

/** The letter's heights, its bar's height if it has one that Crossbar moves, and its case. */
interface Ctx { cap: number; xh: number; asc: number; desc: number; barY: number | null; lower: boolean; ch: string }
export interface SkinRig {
  contours: Node[][]; bones: Bone[][]; ctx: Ctx;
  /** whether it has serifs that Serif size moves */ serifs: boolean;
  /** how thick its upright strokes are, as a share of the capitals' height */ stem: number;
  /** the last few ways it was moved, by the measures it was moved to (dragging a slider back and forth) */ moves: Map<string, Node[][]>;
}

const STEP = 5;
const CORNER = Math.cos(30 * Math.PI / 180);

/** The outline's samples, evenly along its length (a curve's parameter bunches its points where its handles are short). */
function samples(c: Node[]) {
  const out: (Pick<Bone, 'x' | 'y' | 'tx' | 'ty' | 'corner' | 'inx' | 'iny' | 'outx' | 'outy' | 'seg' | 'straight'>)[] = [];
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

/** How far past its stem's edge the point (x, y) reaches on a serif, where a straight stem ends on line L (0 off a serif). */
function serifReach(f: Field, x: number, y: number, nx: number, ny: number, L: number, cap: number) {
  // a stem: straight, its edges in the same place at three heights, as a round letter's sides never are
  const dir = L > cap * 0.2 ? -1 : 1;
  const r1 = runs(f, L + dir * cap * 0.14), r2 = runs(f, L + dir * cap * 0.22), r3 = runs(f, L + dir * cap * 0.3);
  const same = (a: [number, number], b: [number, number]) => Math.abs(b[0] - a[0]) < cap * 0.008 && Math.abs(b[1] - a[1]) < cap * 0.008;
  for (const a of r1) {
    if (!r2.some(b => same(a, b)) || !r3.some(b => same(a, b)) || a[1] - a[0] > cap * 0.35) continue;
    // ending at the line: one running on past it (t and f through their bars) has no serif there
    if (runs(f, L - dir * cap * 0.06).some(r => r[0] < a[1] - 2 && r[1] > a[0] + 2)) continue;
    // the ink the point is on, along its row, is the stem's own and ends within a serif's reach of it
    const qx = x + nx * 1.5, row = runs(f, y + ny * 1.5).find(r => r[0] <= qx + 1 && r[1] >= qx - 1);
    if (!row || row[0] > a[1] || row[1] < a[0]) continue;
    // and it's a thin slab: a little way in from the line it has gone (a hook, as at the foot of a t, hasn't)
    const inner = runs(f, L + dir * cap * 0.08).find(r => r[0] <= a[1] && r[1] >= a[0]);
    const atLine = runs(f, L + dir * 2).find(r => r[0] <= a[1] && r[1] >= a[0]);
    const slabL = !inner || a[0] - inner[0] < 0.4 * (atLine ? a[0] - atLine[0] : 0) + 2;
    const slabR = !inner || inner[1] - a[1] < 0.4 * (atLine ? atLine[1] - a[1] : 0) + 2;
    if (x < a[0] && a[0] - row[0] < cap * 0.2 && slabL) return x - a[0];
    if (x > a[1] && row[1] - a[1] < cap * 0.2 && slabR) return x - a[1];
  }
  return 0;
}

function rigContour(c: Node[], f: Field, ctx: Ctx): Bone[] {
  const lines = [0, ctx.xh, ctx.cap, ctx.asc, ctx.desc];
  const serifLines = ctx.lower ? [0, ctx.xh, ctx.asc, ctx.desc] : [0, ctx.cap];
  const bones: Bone[] = samples(c).map(p => {
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
    const across = (deg: number) => {
      const th = deg * Math.PI / 180, co = Math.cos(th), sn = Math.sin(th), rx = nx * co - ny * sn, ry = nx * sn + ny * co;
      let inInk = false;
      for (let t = 0.5; t < 900; t += 0.5) {
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
    for (const deg of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) chord = Math.min(chord, across(deg));
    let serifDx = 0;
    for (const L of serifLines) if (Math.abs(p.y - L) <= ctx.cap * 0.09 && !serifDx) serifDx = serifReach(f, p.x, p.y, nx, ny, L, ctx.cap);
    const onLine = p.straight && Math.abs(ny) > 0.97 && lines.some(L => Math.abs(p.y - L) < 2.5);
    return { ...p, nx, ny, ax, ay, t: bt, best, dx, dy, w: chord / 2, serifDx, onLine, cap: false, lineCap: false, dot: false };
  });
  // where strokes join (a bowl and its stem, a bar and an arm) an edge reads thicker than either for a
  // short stretch: its stroke's own thickness is what's left with that bump taken out
  // (a bump is taken out over as long a stretch as the outline's heavier strokes are thick, as a join with
  // one of them is about that long: a fat face's hairline meets its stems over their whole width)
  const typical = bones.map(b => b.best).sort((a, b) => a - b)[bones.length >> 1];
  const heavy = bones.map(b => b.w).sort((a, b) => a - b)[Math.floor(bones.length * 0.75)];
  const w = opening(bones.map(b => b.w), Math.min(30, Math.max(2, Math.round(Math.max(typical, heavy) * 2 / STEP))));
  bones.forEach((b, i) => { b.w = w[i]; });
  // a stroke's end: a straight edge between two corners, about as long as the stroke is thick, that the
  // skeleton runs into head on
  const segs = new Map<number, Bone[]>();
  for (const b of bones) { if (!segs.has(b.seg)) segs.set(b.seg, []); segs.get(b.seg)!.push(b); }
  for (const sb of segs.values()) {
    if (!sb[0].straight || sb.length < 2) continue;
    const mid = sb[sb.length >> 1], len = Math.hypot(sb[sb.length - 1].x - sb[0].x, sb[sb.length - 1].y - sb[0].y) + STEP;
    if (Math.abs(mid.nx * mid.dx + mid.ny * mid.dy) > 0.75 && len < 3.6 * mid.w) for (const b of sb) if (!b.corner) { b.cap = true; b.lineCap = mid.onLine; }
  }
  // a dot: a ring round one point, which grows evenly
  let cx = 0, cy = 0;
  for (const b of bones) { cx += b.ax; cy += b.ay; }
  cx /= bones.length; cy /= bones.length;
  if (Math.max(...bones.map(b => Math.hypot(b.ax - cx, b.ay - cy))) < 0.35 * typical) for (const b of bones) { b.dot = true; b.corner = false; b.cap = false; }
  return bones;
}

/** Where to look for each letter's bar that Crossbar moves: the column (a share of the ink's width), the
    band (shares of its height) and the height it's likeliest at; and how far the engine's letters move it
    from Crossbar 0 to 1, as a share of the capitals' or the x-height (glyphs.ts). */
const BARS: Record<string, { at: [number, number, number, number]; move: number }> = {
  A: { at: [0.5, 0.12, 0.55, 0.33], move: 0.26 }, H: { at: [0.5, 0.25, 0.75, 0.5], move: 0.26 }, B: { at: [0.45, 0.3, 0.7, 0.5], move: 0.14 },
  E: { at: [0.4, 0.3, 0.7, 0.5], move: 0.14 }, F: { at: [0.4, 0.3, 0.7, 0.5], move: 0.14 }, P: { at: [0.45, 0.25, 0.68, 0.45], move: 0.16 },
  R: { at: [0.45, 0.3, 0.68, 0.48], move: 0.14 }, e: { at: [0.5, 0.3, 0.7, 0.5], move: 0.22 }, a: { at: [0.5, 0.35, 0.78, 0.57], move: 0.3 }
};

const rigs = new WeakMap<FreeFont, { lines: { asc: number; desc: number }; unicase: boolean; letters: Map<string, SkinRig | null> }>();

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
  const f = field(g.contours), lower = ch !== ch.toUpperCase() && !kept.unicase;
  let x0 = Infinity, x1 = -Infinity;
  for (const c of g.contours) for (const n of c) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); }
  const top = lower ? font.xh : font.cap, bar = BARS[ch];
  const barY = bar ? (columnRuns(f, x0 + (x1 - x0) * bar.at[0]).map(([a, b]) => (a + b) / 2)
    .filter(y => y > top * bar.at[1] && y < top * bar.at[2]).sort((a, b) => Math.abs(a - top * bar.at[3]) - Math.abs(b - top * bar.at[3]))[0] ?? null) : null;
  const ctx: Ctx = { cap: font.cap, xh: font.xh, ...kept.lines, barY, lower, ch };
  const bones = g.contours.map(c => rigContour(c, f, ctx));
  const upright = bones.flat().filter(b => Math.abs(b.nx) > 0.9 && !b.cap).map(b => b.w * 2).sort((a, b) => a - b);
  r = { contours: g.contours, bones, ctx, serifs: bones.some(bs => bs.some(b => b.serifDx !== 0)), stem: (upright[upright.length >> 1] ?? 0) / font.cap, moves: new Map() };
  kept.letters.set(ch, r);
  return r;
}

/** Whether setting `key` moves letter `ch` of a free font on its skeleton: Crossbar only a letter with a
    bar it moves, x-height only the lowercase, the serifs' size only a letter with serifs. */
export function skinFollows(font: FreeFont, ch: string, key: string) {
  // (a pixel font's letters only stretch, and change weight where the family has another)
  if (FREE_FAMILIES[font.family]?.grid) return key !== 'contrast' && key !== 'vWeight' && key !== 'hWeight' && key !== 'xHeight' && key !== 'crossbar' && key !== 'serifSize';
  if (key === 'crossbar') return ch in BARS;
  if (key === 'xHeight') return !!skinRig(font, ch)?.ctx.lower;
  if (key === 'serifSize') return !!skinRig(font, ch)?.serifs;
  return true;
}

/* ---- moving */

/** The engine's measures of the settings a skinned letter follows. */
export interface SkinMeasures {
  /** a stem's thickness and a bar's */ s: number; hT: number;
  /** how much wider */ ws: number;
  /** the x-height as a share of the capitals' */ xr: number;
  /** Crossbar */ bar: number;
  /** a serif's length */ serif: number;
}
export const skinMeasures = (m: Metrics): SkinMeasures => ({
  s: m.s, hT: m.hT, ws: m.ws, xr: m.xh / m.cap, bar: m.bar, serif: (28 + 147 * m.p.serifSize) * (0.75 + 0.25 * m.ws)
});
export const sameMeasures = (a: SkinMeasures, b: SkinMeasures) =>
  Math.abs(a.s - b.s) < 0.05 && Math.abs(a.hT - b.hT) < 0.05 && Math.abs(a.ws - b.ws) < 1e-4 && Math.abs(a.xr - b.xr) < 1e-4 && Math.abs(a.bar - b.bar) < 1e-4 && Math.abs(a.serif - b.serif) < 0.05;

/** A piecewise-linear map with knots [from, to], carried on beyond them unscaled. */
const piecewise = (knots: [number, number][]) => (y: number) => {
  if (y <= knots[0][0]) return y + knots[0][1] - knots[0][0];
  for (let i = 1; i < knots.length; i++) if (y <= knots[i][0]) { const [a, A] = knots[i - 1], [b, B] = knots[i]; return A + (y - a) * (B - A) / (b - a); }
  const [l, L] = knots[knots.length - 1];
  return y + L - l;
};

/** An outline's small loops cut out, where an edge moved out overruns its neighbour (inside a corner the
    strokes thicken into): where it crosses itself within a short stretch, the stretch goes. */
function untangle(p: P[], reach = 60) {
  let pts = p.slice();
  for (let pass = 0; pass < 4; pass++) {
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

const ease = (v: number[], bs: Bone[], i: number, keep: (j: number) => boolean) => {
  let s = 0, ws = 0;
  for (const dir of [-1, 1]) for (let k = dir < 0 ? 0 : 1; k <= 3; k++) {
    const j = (i + dir * k + bs.length) % bs.length;
    if (!keep(j)) break;
    const w = Math.exp(-(k * k) / 6); s += v[j] * w; ws += w;
  }
  return ws ? s / ws : v[i];
};

/** The rigged letter moved from the measures it was drawn at (m0) to m1, its outline traced back into curves. */
export function skinMove(rig: SkinRig, m0: SkinMeasures, to: SkinMeasures): Node[][] {
  const c = rig.ctx;
  // only what moves this letter counts (Crossbar a letter with a bar, the x-height the lowercase, the
  // serifs' size one with serifs), so a letter another setting doesn't reach is the one already drawn
  const m1: SkinMeasures = { ...to, bar: c.barY != null && BARS[c.ch] ? to.bar : m0.bar, xr: c.lower ? to.xr : m0.xr, serif: rig.serifs ? to.serif : m0.serif };
  if (sameMeasures(m0, m1)) return rig.contours;
  const key = [m0, m1].map(m => [m.s, m.hT, m.ws, m.xr, m.bar, m.serif].map(v => v.toFixed(4)).join()).join('|');
  const kept = rig.moves.get(key);
  if (kept) return kept;
  const out = moveRig(rig, m0, m1);
  if (rig.moves.size >= 6) rig.moves.delete(rig.moves.keys().next().value!);
  rig.moves.set(key, out);
  return out;
}

function moveRig(rig: SkinRig, m0: SkinMeasures, m1: SkinMeasures): Node[][] {
  const c = rig.ctx;
  let x0 = Infinity, x1 = -Infinity;
  for (const cn of rig.contours) for (const n of cn) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); }
  const mid = (x0 + x1) / 2, sx = m1.ws / m0.ws, kv = m1.s / m0.s, kh = m1.hT / m0.hT, ks = m1.serif / m0.serif;
  // heights: the x-height moves the lowercase between the baseline and the ascenders, Crossbar the bar
  const xh1 = c.xh * m1.xr / m0.xr, top = c.lower ? c.xh : c.cap, top1 = c.lower ? xh1 : c.cap;
  const knots: [number, number][] = [[0, 0]], bar = BARS[c.ch];
  if (c.barY != null && bar) {
    const by = c.barY * top1 / top + bar.move * top1 * (m1.bar - m0.bar);
    knots.push([c.barY, Math.min(top1 * 0.9, Math.max(top1 * 0.1, by))]);
  }
  knots.push([top, top1]);
  if (c.lower) knots.push([c.asc, c.asc]);
  const gy = piecewise(knots), gx = (x: number) => mid + (x - mid) * sx;

  const rings: P[][] = [];
  for (const bs of rig.bones) {
    const n = bs.length, end = (b: Bone) => b.cap && !b.lineCap;
    // how far each edge moves out (in, lighter): its stroke's change of thickness on this side, a stem's by
    // Weight, a bar's by Contrast too; a stroke's end, which runs across it, stays
    const delta = bs.map(b => end(b) ? 0 : ((b.dot ? kv : b.ty * b.ty * kv + b.tx * b.tx * kh) - 1) * b.w);
    const moved = bs.map((b, i) => b.corner ? delta[i] : ease(delta, bs, i, j => !bs[j].corner && end(bs[j]) === end(b)));
    // where the heights and the width put it: the skeleton point moved, and the edge kept as far across the
    // stroke from it as it was, the stroke turned as they turn it (a diagonal leans further as the letter
    // widens), so every stroke keeps its thickness; narrower, upright strokes thin a little, as a condensed
    // face's do, and lower, level ones, or a heavy letter's counters would close. A stroke's end follows its own point, as there is
    // no thickness across it to keep, a dot is carried whole, keeping its round, and a corner goes as the
    // edges either side of it go
    let cx = 0, cy = 0;
    for (const b of bs) { cx += b.ax; cy += b.ay; }
    cx /= n; cy /= n;
    // (the heavier the letter, the more, or its counters would close: a heavy display face's stems take up
    // most of its width)
    // (lower is the lowercase made lower by the x-height, not the bands a moved crossbar squeezes)
    const thin = 0.35 + 0.5 * Math.min(1, Math.max(0, (rig.stem - 0.12) / 0.15)), condense = Math.pow(Math.min(1, sx), thin);
    const lower = Math.pow(Math.min(1, top1 / top), thin);
    const geo = [0, 1].map(axis => bs.map(b => {
      if (b.dot) return axis ? gy(cy) - cy : gx(cx) - cx;
      if (b.cap) return axis ? gy(b.y) - b.y : gx(b.x) - b.x;
      // (the stroke runs as its edge does, read more surely there than off the skeleton)
      const sy = gy(b.ay + 0.5) - gy(b.ay - 0.5), ox = b.x - b.ax, oy = b.y - b.ay;
      const along = ox * b.tx + oy * b.ty, across = oy * b.tx - ox * b.ty;
      let ex = b.tx * sx, ey = b.ty * sy;
      const l = Math.hypot(ex, ey) || 1; ex /= l; ey /= l;
      const thick = across * (1 + (condense - 1) * ey * ey + (lower - 1) * ex * ex);
      // (as far as the edge faces this way; along it, where the skeleton is read less surely, by its own point)
      const h = axis ? b.ny * b.ny : b.nx * b.nx;
      return axis ? h * (gy(b.ay) + along * b.ty * sy + ex * thick) + (1 - h) * gy(b.y) - b.y
        : h * (gx(b.ax) + along * b.tx * sx - ey * thick) + (1 - h) * gx(b.x) - b.x;
    }));
    for (const g of geo) bs.forEach((b, i) => { if (b.corner) g[i] = (g[(i - 1 + n) % n] + g[(i + 1) % n]) / 2; });
    const shift = (axis: number, i: number) => bs[i].corner ? geo[axis][i] : ease(geo[axis], bs, i, j => !bs[j].corner);
    rings.push(bs.map((b, i) => {
      const x = b.x + shift(0, i) + b.serifDx * (ks - 1) * sx, y = b.y + shift(1, i);
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
    }));
  }
  // the letter keeps its heights, as the engine's do when they get bolder or lighter: whatever faces up at
  // a line it reaches (the x-height, the capitals', the ascenders') or down at one it stands on (the
  // baseline, the descenders') goes back to where the heights put it, an overshoot as far past it, and
  // what's between follows. A dot keeps its round and the place the heights gave it.
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
  // and a flat edge on a line stays on it exactly (a serif's foot beside a heavier stroke's, which moved
  // further and so set where the rest went), its neighbours eased onto it
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
  // folds cut out; where moved edges still cross (strokes thickened into each other), the letter is its
  // ink read as the font reads it, without the folds (which wind the other way)
  let tidy = rings.map(r => untangle(r));
  if (crosses(tidy)) {
    const ccw = tidy.reduce((a, r) => a + signedArea(r), 0) > 0, sh = shape(ccw ? tidy : tidy.map(r => r.slice().reverse()), true);
    tidy = combine([sh], sh.has);
  }
  const cmds: [string, ...number[]][] = [];
  for (const r of tidy) { r.forEach((p, i) => cmds.push([i ? 'L' : 'M', p.x, p.y])); cmds.push(['Z']); }
  return fitOutline(cmds, 1.2);
}
