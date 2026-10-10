/* Boolean operations on outlines: the Inline, Outline and Shadow fills (effects.ts) cut one shape out of
   another or join them, and a free font's letters are read as one ink and cut or added to (restyle.ts;
   skin.ts, where moved strokes thickened into each other are read back as one ink), so the free fonts'
   outlines depend on it too. Every input is a set of polygons read with the nonzero rule, like the font itself (or, with
   shape's `positive`, only where they wind anticlockwise on balance). The edges of all of them are split
   where they cross, and an edge piece is kept when the region asked for lies on one side of it and not
   the other, turned so the region is on its left (anticlockwise outlines, clockwise holes). The kept
   pieces are then chained into contours. */
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
  const ids = new Map<string, { x: number; y: number; id: string }[]>(), had = new Map<string, string>();
  let n = 0;
  const key = (p: Pt) => {
    const at = p.x + ',' + p.y, was = had.get(at);
    if (was) return was;
    const i = Math.floor(p.x * 100), j = Math.floor(p.y * 100);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const q of ids.get(`${i + a},${j + b}`) ?? []) if (Math.abs(q.x - p.x) <= 0.01 && Math.abs(q.y - p.y) <= 0.01) { had.set(at, q.id); return q.id; }
    }
    const id = `${i},${j}`, c = { x: p.x, y: p.y, id: id + ':' + n++ };
    (ids.get(id) ?? ids.set(id, []).get(id)!).push(c);
    had.set(at, c.id);
    return c.id;
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
