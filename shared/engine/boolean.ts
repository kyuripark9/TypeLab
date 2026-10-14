/* Boolean operations on outlines: the Inline, Outline and Shadow fills (effects.ts) cut one shape out of
   another or join them, and a free font's letters are read as one ink and cut or added to (restyle.ts;
   skin.ts, where moved strokes thickened into each other are read back as one ink), so the free fonts'
   outlines depend on it too. Every input is a set of polygons read with the nonzero rule, like the font
   itself (or, with shape's `positive`, only where they wind anticlockwise on balance). The edges of all of
   them are split where they cross, and an edge piece is kept when the region asked for lies on one side of
   it and not the other, turned so the region is on its left (anticlockwise outlines, clockwise holes). The
   kept pieces are then chained into contours. `unite` does the same for a letter's own curves without
   flattening them: a free font drawn in overlapping pieces, made one outline before skin.ts rigs it; and
   `cutOut` takes one outline's ink out of another's that way (the pen's Cut out and Break). */
import type { Node } from './outline';
import type { Pt } from './types';

interface Seg { ax: number; ay: number; bx: number; by: number }
/** how close two points, or a point and an edge, must be to count as touching */
const EPS = 1e-3;
/** A set of polygons, and whether a point is inside it (nonzero). */
export interface Shape { polys: Pt[][]; has: (x: number, y: number) => boolean }

/** A shape, with a quick inside test: its edges are bucketed by height, so a test only looks at
    the edges level with the point. Inside is where the outlines wind round it at all (nonzero), or
    with `positive` only where they wind round it anticlockwise on balance (an offset outline's
    loops, where it doubles back on itself, wind the other way and are left out). */
export function shape(polys: Pt[][], positive = false): Shape {
  const segs: Seg[] = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const p of polys) for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    if (a.y === b.y) continue;
    segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
    y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y);
  }
  const B = Math.max(1, Math.min(256, segs.length >> 2)), h = (y1 - y0) / B || 1;
  const buckets: Seg[][] = Array.from({ length: B }, () => []);
  const at = (y: number) => Math.max(0, Math.min(B - 1, Math.floor((y - y0) / h)));
  for (const s of segs) for (let k = at(Math.min(s.ay, s.by)), e = at(Math.max(s.ay, s.by)); k <= e; k++) buckets[k].push(s);
  return {
    polys,
    has(x, y) {
      if (!(y >= y0 && y <= y1)) return false;
      let w = 0;
      for (const s of buckets[at(y)]) {
        if ((s.ay <= y) !== (s.by <= y) && x < s.ax + (y - s.ay) / (s.by - s.ay) * (s.bx - s.ax)) w += s.by > s.ay ? 1 : -1;
      }
      return positive ? w > 0 : w !== 0;
    }
  };
}

/** The outline of the region `keep` picks out, built from the edges of `shapes`. */
export function combine(shapes: Shape[], keep: (x: number, y: number) => boolean): Pt[][] {
  // every edge, with the points along it where another edge crosses it
  type E = { a: Pt; b: Pt; cuts: { t: number; p: Pt }[]; x0: number; x1: number; y0: number; y1: number };
  const edges: E[] = [];
  for (const s of shapes) for (const p of s.polys) for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    if (a.x === b.x && a.y === b.y) continue;
    edges.push({ a, b, cuts: [], x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) });
  }
  edges.sort((e, f) => e.x0 - f.x0);
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    // (edges an EPS apart are still tried: two along the same line are often a hair off it)
    for (let j = i + 1; j < edges.length && edges[j].x0 <= e.x1 + EPS; j++) {
      const f = edges[j];
      if (f.y0 > e.y1 + EPS || f.y1 < e.y0 - EPS) continue;
      const rx = e.b.x - e.a.x, ry = e.b.y - e.a.y, sx = f.b.x - f.a.x, sy = f.b.y - f.a.y;
      // an end of one lying on the other (also where the two run along the same line): the other is
      // cut there, so they meet at the same point. Told by distance, as edges nearly parallel would
      // put a crossing worked out from their lines a little off. The cut is made at the point
      // straight across on the edge, not at the end itself: that may lie off the edge by more than
      // the sides of a piece are tested at, and would tip the piece over to the wrong side.
      const touch = (g: E, p: Pt) => {
        const gx = g.b.x - g.a.x, gy = g.b.y - g.a.y, l2 = gx * gx + gy * gy, t = ((p.x - g.a.x) * gx + (p.y - g.a.y) * gy) / l2;
        if (t <= 0 || t >= 1) return false;
        const on = { x: g.a.x + gx * t, y: g.a.y + gy * t };
        if (Math.hypot(on.x - p.x, on.y - p.y) > EPS) return false;
        if (Math.hypot(p.x - g.a.x, p.y - g.a.y) > EPS && Math.hypot(p.x - g.b.x, p.y - g.b.y) > EPS) g.cuts.push({ t, p: on });
        return true;
      };
      const ends = +touch(e, f.a) + +touch(e, f.b) + +touch(f, e.a) + +touch(f, e.b);
      const shared = [e.a, e.b].some(p => [f.a, f.b].some(q => Math.hypot(p.x - q.x, p.y - q.y) <= EPS));
      if (ends || shared) continue;
      const d = rx * sy - ry * sx;
      if (Math.abs(d) < 1e-12) continue;
      const qx = f.a.x - e.a.x, qy = f.a.y - e.a.y, t = (qx * sy - qy * sx) / d, u = (qx * ry - qy * rx) / d;
      if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
      // one point shared by both pieces, so the chains close exactly
      const p = { x: e.a.x + rx * t, y: e.a.y + ry * t };
      e.cuts.push({ t, p }); f.cuts.push({ t: u, p });
    }
  }
  // points closer than a hundredth of a unit are one (three edges crossing at a point give it
  // three slightly different ways), found through a grid of cells that size. A point keeps the
  // one it was first given, as a point found later nearby could otherwise win it the next time
  // and a chain would lose its way there
  // (a point is asked for again and again, as the end of two edges and where cuts are shared: the same point, by
  // identity, gets the id it got before; a place given an id before, by its two numbers, gets that one (as their text
  // would find it: -0 is 0); and a cell is found by a number, its id kept as the text "i,j:n", which orders the pairs below)
  const ids = new Map<number | string, { x: number; y: number; id: string }[]>(), had = new Map<number, Map<number, string>>(), seen = new Map<Pt, string>();
  const cell = (i: number, j: number) => (Math.abs(i) < 2 ** 24 && Math.abs(j) < 2 ** 24 ? (i + 2 ** 24) * 2 ** 25 + (j + 2 ** 24) : `${i},${j}`);
  const remember = (p: Pt, id: string) => { (had.get(p.x) ?? had.set(p.x, new Map()).get(p.x)!).set(p.y, id); return id; };
  let n = 0;
  const key = (p: Pt) => {
    const known = seen.get(p);
    if (known) return known;
    const id = keyAt(p);
    seen.set(p, id);
    return id;
  };
  const keyAt = (p: Pt) => {
    const was = had.get(p.x)?.get(p.y);
    if (was) return was;
    const i = Math.floor(p.x * 100), j = Math.floor(p.y * 100);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const q of ids.get(cell(i + a, j + b)) ?? []) if (Math.abs(q.x - p.x) <= 0.01 && Math.abs(q.y - p.y) <= 0.01) return remember(p, q.id);
    }
    const k = cell(i, j), c = { x: p.x, y: p.y, id: `${i},${j}:${n++}` };
    (ids.get(k) ?? ids.set(k, []).get(k)!).push(c);
    return remember(p, c.id);
  };
  // the pieces that bound the region, turned to keep it on their left;
  // an edge two shapes share (a stroke's side running along another's) is kept once, and one
  // going back the way another came cancels it (a spike no wider than a hair, which would otherwise
  // leave a chain with no way on): each pair of points keeps one edge, the way more of them go
  const pairs = new Map<string, { a: Pt; b: Pt; ka: string; kb: string; n: number }>();
  for (const e of edges) {
    const pts = [e.a, ...e.cuts.sort((p, q) => p.t - q.t).map(c => c.p), e.b];
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, o = Math.min(1e-4, l * 0.25), nx = -dy / l * o, ny = dx / l * o;
      const L = keep(mx + nx, my + ny), R = keep(mx - nx, my - ny);
      if (L === R) continue;
      const [p, q] = L ? [a, b] : [b, a], kp = key(p), kq = key(q);
      if (kp === kq) continue;
      const id = kp < kq ? kp + '>' + kq : kq + '>' + kp, pair = pairs.get(id);
      if (!pair) pairs.set(id, { a: p, b: q, ka: kp, kb: kq, n: 1 });
      else pair.n += pair.ka === kp ? 1 : -1;
    }
  }
  const from = new Map<string, { a: Pt; b: Pt; used: boolean }[]>();
  for (const { a, b, ka, kb, n } of pairs.values()) {
    if (!n) continue;
    const [p, q, k0] = n > 0 ? [a, b, ka] : [b, a, kb];
    (from.get(k0) ?? from.set(k0, []).get(k0)!).push({ a: p, b: q, used: false });
  }
  const out: Pt[][] = [];
  for (const list of from.values()) for (const start of list) {
    if (start.used) continue;
    const poly: Pt[] = [];
    let e = start;
    for (let guard = 0; guard < 100000; guard++) {
      e.used = true;
      poly.push({ x: e.a.x, y: e.a.y, smooth: true });
      const next = (from.get(key(e.b)) ?? []).filter(f => !f.used);
      if (!next.length) break;
      // where several go on, take the sharpest turn to the left, so shapes that only touch stay apart
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const turn = (f: { a: Pt; b: Pt }) => Math.atan2(dx * (f.b.y - f.a.y) - dy * (f.b.x - f.a.x), dx * (f.b.x - f.a.x) + dy * (f.b.y - f.a.y));
      e = next.reduce((m, f) => (turn(f) > turn(m) ? f : m));
    }
    if (poly.length > 2) out.push(poly);
  }
  return out;
}

/* ---- a letter's contours made one ink, their curves kept: a font drawn in overlapping pieces (a stem drawn whole and
   a bowl run into it, as a variable font's are, and as pieces drawn on a sheet and never united come) has edges inside
   its ink, which anything reading the outline's edges as the ink's own takes for the sides of strokes (skin.ts) */

/** A cubic by its four control points; a line's handles sit on its ends, and it is read evenly along. */
interface Curve { p0: Pt; p1: Pt; p2: Pt; p3: Pt; line: boolean }
/** Part of segment `s` of the outline, from t0 to t1 along it, run backwards when `rev`; `c` is that part's curve. */
interface Part { s: number; t0: number; t1: number; rev: boolean; c: Curve }

/** The point t of the way along a curve, and the way it runs there. */
const curveAt = (c: Curve, t: number): Pt => {
  if (c.line) return { x: c.p0.x + (c.p3.x - c.p0.x) * t, y: c.p0.y + (c.p3.y - c.p0.y) * t };
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
  return { x: a * c.p0.x + b * c.p1.x + d * c.p2.x + e * c.p3.x, y: a * c.p0.y + b * c.p1.y + d * c.p2.y + e * c.p3.y };
};
const curveD = (c: Curve, t: number): Pt => {
  if (c.line) return { x: c.p3.x - c.p0.x, y: c.p3.y - c.p0.y };
  const u = 1 - t, a = 3 * u * u, b = 6 * u * t, d = 3 * t * t;
  return { x: a * (c.p1.x - c.p0.x) + b * (c.p2.x - c.p1.x) + d * (c.p3.x - c.p2.x), y: a * (c.p1.y - c.p0.y) + b * (c.p2.y - c.p1.y) + d * (c.p3.y - c.p2.y) };
};
/** The curve from t0 to t1 along it, the very same curve (de Casteljau). */
function subCurve(c: Curve, t0: number, t1: number): Curve {
  if (t0 === 0 && t1 === 1) return c;
  if (c.line) { const a = curveAt(c, t0), b = curveAt(c, t1); return { p0: a, p1: a, p2: b, p3: b, line: true }; }
  const split = (q: Curve, t: number): [Curve, Curve] => {
    const l = (a: Pt, b: Pt) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const a = l(q.p0, q.p1), b = l(q.p1, q.p2), d = l(q.p2, q.p3), ab = l(a, b), bd = l(b, d), m = l(ab, bd);
    return [{ p0: q.p0, p1: a, p2: ab, p3: m, line: false }, { p0: m, p1: bd, p2: d, p3: q.p3, line: false }];
  };
  let q = t1 < 1 ? split(c, t1)[0] : c;
  if (t0 > 0) q = split(q, t0 / t1)[1];
  return q;
}
/** Where a curve turns back across or up and down (its tangent level or upright): between them it runs one way in x
    and one way in y, so a part of it never crosses itself, and its ends are its corners. */
function turnsOf(c: Curve): number[] {
  if (c.line) return [];
  const out: number[] = [];
  for (const k of ['x', 'y'] as const) {
    const d0 = c.p1[k] - c.p0[k], d1 = c.p2[k] - c.p1[k], d2 = c.p3[k] - c.p2[k], A = d0 - 2 * d1 + d2, B = 2 * (d1 - d0), C = d0;
    const roots = Math.abs(A) < 1e-12 ? (Math.abs(B) < 1e-12 ? [] : [-C / B]) : (() => {
      const disc = B * B - 4 * A * C;
      if (disc < 0) return [];
      const r = Math.sqrt(disc);
      return [(-B - r) / (2 * A), (-B + r) / (2 * A)];
    })();
    for (const t of roots) if (t > 1e-7 && t < 1 - 1e-7) out.push(t);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}
/** Where along a part running one way (turnsOf) it reaches level y, or upright line x (`k`), found by halving. */
function reach(c: Curve, k: 'x' | 'y', v: number): number {
  let lo = 0, hi = 1;
  const up = c.p3[k] > c.p0[k];
  for (let i = 0; i < 52; i++) { const m = (lo + hi) / 2; if ((curveAt(c, m)[k] < v) === up) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** How many times parts running one way wind round point q (each crosses the level line through it once at most;
    half open, so parts meeting on the line count once). */
function windsRound(parts: Part[], q: Pt): number {
  let w = 0;
  for (const { c } of parts) {
    if ((c.p0.y <= q.y) === (c.p3.y <= q.y) || Math.max(c.p0.x, c.p3.x) < q.x) continue;
    if (Math.min(c.p0.x, c.p3.x) > q.x || curveAt(c, reach(c, 'y', q.y)).x > q.x) w += c.p3.y > c.p0.y ? 1 : -1;
  }
  return w;
}

/** Where two parts running one way cross, as places along each: their boxes (their ends') halved until they meet in a
    point, then settled on the curves themselves. Parts along the same line meet everywhere: past a few thousand boxes
    they are left to their ends, which lie on each other (unite cuts there). */
function partsCross(a: Curve, b: Curve): [number, number][] {
  const found: [number, number][] = [];
  let budget = 3000;
  const go = (a0: number, a1: number, b0: number, b1: number) => {
    if (--budget < 0) return;
    const A0 = curveAt(a, a0), A1 = curveAt(a, a1), B0 = curveAt(b, b0), B1 = curveAt(b, b1), e = 1e-7;
    if (Math.max(A0.x, A1.x) < Math.min(B0.x, B1.x) - e || Math.max(B0.x, B1.x) < Math.min(A0.x, A1.x) - e
      || Math.max(A0.y, A1.y) < Math.min(B0.y, B1.y) - e || Math.max(B0.y, B1.y) < Math.min(A0.y, A1.y) - e) return;
    const sa = Math.max(Math.abs(A1.x - A0.x), Math.abs(A1.y - A0.y)), sb = Math.max(Math.abs(B1.x - B0.x), Math.abs(B1.y - B0.y));
    if (sa > 1e-3 || sb > 1e-3) {
      if (sa >= sb) { const m = (a0 + a1) / 2; go(a0, m, b0, b1); go(m, a1, b0, b1); } else { const m = (b0 + b1) / 2; go(a0, a1, b0, m); go(a0, a1, m, b1); }
      return;
    }
    let t = (a0 + a1) / 2, u = (b0 + b1) / 2;
    for (let k = 0; k < 8; k++) {
      const P = curveAt(a, t), Q = curveAt(b, u), da = curveD(a, t), db = curveD(b, u), ex = P.x - Q.x, ey = P.y - Q.y, det = db.x * da.y - da.x * db.y;
      if (Math.abs(det) < 1e-12) break;
      const nt = t - (-db.y * ex + db.x * ey) / det, nu = u - (-da.y * ex + da.x * ey) / det;
      if (!(nt >= a0 - 0.01 && nt <= a1 + 0.01 && nu >= b0 - 0.01 && nu <= b1 + 0.01)) break;
      t = nt; u = nu;
    }
    t = Math.min(1, Math.max(0, t)); u = Math.min(1, Math.max(0, u));
    const P = curveAt(a, t), Q = curveAt(b, u);
    if (Math.hypot(P.x - Q.x, P.y - Q.y) < 1e-3 && !found.some(([t0, u0]) => Math.hypot(curveAt(a, t0).x - P.x, curveAt(a, t0).y - P.y) < 1e-4 && Math.abs(u0 - u) < 1e-3)) found.push([t, u]);
  };
  go(0, 1, 0, 1);
  return budget < 0 ? [] : found;
}

/** A letter's contours (read nonzero, as the font is) as one ink: where they overlap, or one runs over itself, the
    edges inside the ink go and the rest are cut where they cross and joined up again, every curve kept as it was
    drawn (a part of one is the same curve), cut points being corners. Contours that neither cross nor lie in one
    another's ink come back as the very same array, and so does a letter this can't make out (its edges don't join up
    again). The outline winds as the font's largest contour does: the ink on the right where that runs clockwise
    (TrueType's way). */
export function unite(cs: Node[][]): Node[][] {
  return inkOf(cs, []);
}

/** `cs` with the ink of `cutter` taken out of it, the same way: the curves of both kept as they were drawn where
    they bound what is left, cut points being corners, winding as `cs`'s largest contour does. A cutter clear of
    the ink hands `cs` back as the very same array, and so does a cut this can't make out. */
export function cutOut(cs: Node[][], cutter: Node[][]): Node[][] {
  return cutter.length ? inkOf(cs, cutter) : cs;
}

/** The ink of `cs` (less the ink of `cutter`, when there is one) as one outline: unite and cutOut. */
function inkOf(cs: Node[][], cutter: Node[][]): Node[][] {
  const segs: Curve[] = [];
  for (const c of cutter.length ? [...cs, ...cutter] : cs) for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], line = a.ox === undefined && b.ix === undefined;
    const p0 = { x: a.x, y: a.y }, p3 = { x: b.x, y: b.y };
    segs.push(line ? { p0, p1: p0, p2: p3, p3, line } : { p0, p1: { x: a.ox ?? a.x, y: a.oy ?? a.y }, p2: { x: b.ix ?? b.x, y: b.iy ?? b.y }, p3, line });
  }
  // each segment in parts running one way, then cut too where another's end lies on it or another crosses it
  const partsAt = (cuts: number[][]) => segs.flatMap((c, s) => {
    const ts = [0, ...cuts[s], 1], out: Part[] = [];
    for (let k = 0; k + 1 < ts.length; k++) if (ts[k + 1] > ts[k]) out.push({ s, t0: ts[k], t1: ts[k + 1], rev: false, c: subCurve(c, ts[k], ts[k + 1]) });
    return out;
  });
  const turns = segs.map(turnsOf), mono = partsAt(turns), cuts: number[][] = segs.map(() => []);
  const on = (p: Part, t: number) => p.t0 + (p.t1 - p.t0) * t;
  const box = mono.map(({ c }) => ({ x0: Math.min(c.p0.x, c.p3.x) - 1e-3, x1: Math.max(c.p0.x, c.p3.x) + 1e-3, y0: Math.min(c.p0.y, c.p3.y) - 1e-3, y1: Math.max(c.p0.y, c.p3.y) + 1e-3 }));
  // (a cut within a few thousandths of a unit of a part's end is that end)
  const inside = (t: number, p: Part) => {
    const q = curveAt(p.c, t);
    return t > 0 && t < 1 && Math.hypot(q.x - p.c.p0.x, q.y - p.c.p0.y) > 3e-3 && Math.hypot(q.x - p.c.p3.x, q.y - p.c.p3.y) > 3e-3;
  };
  for (let i = 0; i < mono.length; i++) for (let j = i + 1; j < mono.length; j++) {
    const a = mono[i], b = mono[j], A = box[i], B = box[j];
    if (A.x0 > B.x1 || B.x0 > A.x1 || A.y0 > B.y1 || B.y0 > A.y1) continue;
    // one's end on the other (touching, or two running along the same line)
    for (const [x, y] of [[a, b], [b, a]]) for (const q of [x.c.p0, x.c.p3]) {
      const k = Math.abs(y.c.p3.y - y.c.p0.y) >= Math.abs(y.c.p3.x - y.c.p0.x) ? 'y' : 'x', lo = Math.min(y.c.p0[k], y.c.p3[k]), hi = Math.max(y.c.p0[k], y.c.p3[k]);
      if (q[k] <= lo || q[k] >= hi) continue;
      const t = y.c.line ? (q[k] - y.c.p0[k]) / (y.c.p3[k] - y.c.p0[k]) : reach(y.c, k, q[k]), r = curveAt(y.c, t);
      if (Math.hypot(r.x - q.x, r.y - q.y) < 1e-3 && inside(t, y)) cuts[y.s].push(on(y, t));
    }
    // (parts that meet end to end, running on smoothly, touch along a stretch there that is no crossing)
    const ends = [a.c.p0, a.c.p3].filter(p => [b.c.p0, b.c.p3].some(q => Math.hypot(p.x - q.x, p.y - q.y) < 1e-3));
    for (const [t, u] of partsCross(a.c, b.c)) {
      const at = curveAt(a.c, t);
      if (ends.some(p => Math.hypot(p.x - at.x, p.y - at.y) < 1e-2)) continue;
      if (inside(t, a)) cuts[a.s].push(on(a, t));
      if (inside(u, b)) cuts[b.s].push(on(b, u));
    }
  }
  const hard = cuts.some(l => l.length);
  const parts = hard ? partsAt(segs.map((_, s) => [...new Set([...turns[s], ...cuts[s]])].sort((a, b) => a - b))) : mono;
  // (the cutter's segments come after the letter's: the ink is where the letter's parts wind round and the cutter's don't)
  const own = cs.reduce((a, c) => a + c.length, 0), mine = cutter.length ? parts.filter(p => p.s < own) : parts, theirs = parts.filter(p => p.s >= own);
  const inked = (q: Pt) => windsRound(mine, q) !== 0 && !(theirs.length && windsRound(theirs, q) !== 0);
  // each part kept where the ink lies on one side of it and not the other, turned to have it on the font's side
  const area = (c: Node[]) => c.reduce((a, p, i) => { const q = c[(i + 1) % c.length]; return a + p.x * q.y - q.x * p.y; }, 0);
  const left = area(cs.reduce((a, c) => (Math.abs(area(c)) > Math.abs(area(a)) ? c : a), cs[0] ?? [])) > 0;
  const kept: Part[] = [];
  for (const p of parts) {
    const m = curveAt(p.c, 0.5);
    let d = curveD(p.c, 0.5);
    if (Math.hypot(d.x, d.y) < 1e-9) d = { x: p.c.p3.x - p.c.p0.x, y: p.c.p3.y - p.c.p0.y };
    const l = Math.hypot(d.x, d.y);
    if (l < 1e-9) continue;
    const e = 0.004 / l, L = inked({ x: m.x - d.y * e, y: m.y + d.x * e }), R = inked({ x: m.x + d.y * e, y: m.y - d.x * e });
    if (L !== R) kept.push(L === left ? p : { ...p, rev: true, c: { p0: p.c.p3, p1: p.c.p2, p2: p.c.p1, p3: p.c.p0, line: p.c.line } });
  }
  if (!hard && kept.length === mine.length && kept.every(p => !p.rev && p.s < own)) return cs;
  // chained into contours. Points a thousandth of a unit apart are one, the font's own anchors standing for theirs; a
  // part the same as one kept already (two contours' edges along the same line) is kept once; where several go on
  // from a point, the one turning most toward the ink, so shapes that only touch stay apart
  const ids: Pt[] = [];
  const key = (q: Pt) => { let k = ids.findIndex(o => Math.abs(o.x - q.x) < 1e-3 && Math.abs(o.y - q.y) < 1e-3); if (k < 0) { k = ids.length; ids.push(q); } return k; };
  for (const c of segs) key(c.p0);
  const from = new Map<number, { p: Part; to: number; used: boolean }[]>();
  for (const p of kept) {
    const a = key(p.c.p0), b = key(p.c.p3), list = from.get(a) ?? [], m = curveAt(p.c, 0.5);
    if (a === b && p.c.line) continue;
    if (list.some(o => o.to === b && Math.hypot(curveAt(o.p.c, 0.5).x - m.x, curveAt(o.p.c, 0.5).y - m.y) < 1e-3)) continue;
    list.push({ p, to: b, used: false }); from.set(a, list);
  }
  const way = (q: Pt, r: Pt, s: Pt) => (Math.hypot(r.x - q.x, r.y - q.y) > 1e-9 ? { x: r.x - q.x, y: r.y - q.y } : { x: s.x - q.x, y: s.y - q.y });
  const chains: Part[][] = [];
  for (const [k0, list] of from) for (const start of list) {
    if (start.used) continue;
    const chain: Part[] = [];
    let e = start;
    for (let guard = 0; guard < 100000; guard++) {
      e.used = true; chain.push(e.p);
      const next = (from.get(e.to) ?? []).filter(f => !f.used);
      if (!next.length) break;
      const din = way(e.p.c.p3, e.p.c.p2, e.p.c.p0);
      const turn = (f: { p: Part }) => { const d = way(f.p.c.p0, f.p.c.p1, f.p.c.p3); return Math.atan2(-din.x * d.y + din.y * d.x, -din.x * d.x - din.y * d.y); };
      e = next.reduce((m, f) => ((left ? turn(f) > turn(m) : turn(f) < turn(m)) ? f : m));
    }
    // (a chain that doesn't come back round: the letter is left as the font has it)
    if (e.to !== k0) return cs;
    chains.push(chain);
  }
  // the parts of one segment that follow on along it are that segment's curve again, and lines running on in one line
  // one line; then back into anchors and handles (a handle on its own anchor is none)
  const out: Node[][] = [];
  for (const chain of chains) {
    const joins = (a: Part, b: Part) => a.s === b.s && a.rev === b.rev && (a.rev ? a.t0 === b.t1 : a.t1 === b.t0);
    const k = chain.findIndex((p, i) => !joins(chain[(i - 1 + chain.length) % chain.length], p));
    const run = k > 0 ? [...chain.slice(k), ...chain.slice(0, k)] : chain, merged: Curve[] = [];
    for (let i = 0; i < run.length;) {
      let j = i;
      while (j + 1 < run.length && joins(run[j], run[j + 1])) j++;
      const t0 = Math.min(run[i].t0, run[j].t0), t1 = Math.max(run[i].t1, run[j].t1), c = subCurve(segs[run[i].s], t0, t1);
      merged.push(run[i].rev ? { p0: c.p3, p1: c.p2, p2: c.p1, p3: c.p0, line: c.line } : c);
      i = j + 1;
    }
    const curves: Curve[] = [];
    for (const c of merged) {
      const p = curves[curves.length - 1];
      if (p?.line && c.line) {
        const ax = p.p3.x - p.p0.x, ay = p.p3.y - p.p0.y, bx = c.p3.x - c.p0.x, by = c.p3.y - c.p0.y;
        if (Math.abs(ax * by - ay * bx) <= 1e-9 * Math.hypot(ax, ay) * Math.hypot(bx, by) && ax * bx + ay * by > 0) { curves[curves.length - 1] = { ...p, p2: c.p3, p3: c.p3 }; continue; }
      }
      curves.push(c);
    }
    const nodes = curves.map((c, i): Node => {
      const prev = curves[(i - 1 + curves.length) % curves.length], q = ids[key(c.p0)], n: Node = { x: q.x, y: q.y };
      if (!prev.line && Math.hypot(prev.p2.x - c.p0.x, prev.p2.y - c.p0.y) > 1e-9) { n.ix = prev.p2.x; n.iy = prev.p2.y; }
      if (!c.line && Math.hypot(c.p1.x - c.p0.x, c.p1.y - c.p0.y) > 1e-9) { n.ox = c.p1.x; n.oy = c.p1.y; }
      if (n.ix !== undefined && n.ox !== undefined) {
        const ax = n.x - n.ix, ay = n.y - n.iy!, bx = n.ox - n.x, by = n.oy! - n.y;
        if ((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)) > 0.995) n.s = 1;
      }
      return n;
    });
    // (a speck smaller than a unit square, as a corner's curl drawn round past itself leaves, is no ink anyone sees)
    let a = 0;
    for (const c of curves) for (let k = 0; k < 8; k++) { const p = curveAt(c, k / 8), q = curveAt(c, (k + 1) / 8); a += p.x * q.y - q.x * p.y; }
    if (Math.abs(a) / 2 >= 1) out.push(nodes);
  }
  return out;
}
