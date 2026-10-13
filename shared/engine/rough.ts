/* Rough edges (params.rough): the finished outline's edges wander in and out, as ink spreads into paper or a worn
   block prints. It runs last, on the placed and filled outline (placeGlyph in glyph.ts), so it roughs up every fill.
   The letter's ink is made one first (overlapping strokes would each wander on their own, and the edges hidden inside
   the ink would show), its outline walked in short steps, and each step pushed out or in by a smooth noise field of
   where it lies, never further than a share of the ink behind it or the space before it, so a hairline doesn't break
   and a narrow counter doesn't close; then it is drawn as a smooth curve through the steps, which softens its corners
   a little, as ink does. */
import { combine, shape } from './boolean';
import { smoothLoop } from './effects';
import { dist, roundContour, signedArea, toPolys } from './geom';
import type { Cmd, Pt } from './types';

/** A number from -1 to 1 for each corner of a unit grid, the same every time. */
function corner(i: number, j: number, seed: number) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth noise at (x, y), -1 to 1, rising and falling about once a unit. */
function noise(x: number, y: number, seed: number) {
  const i = Math.floor(x), j = Math.floor(y), u = fade(x - i), v = fade(y - j);
  const a = corner(i, j, seed), b = corner(i + 1, j, seed), c = corner(i, j + 1, seed), d = corner(i + 1, j + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** How far the edges wander at Rough edges 1, and how long their swells (big) and ripples (small) are, as shares of
    the cap height. */
const REACH = 0.022, BIG = 0.13, SMALL = 0.04;
/** The share of the ink behind an edge (or the space before it) the edge may move into. */
const ROOM = 0.3;
/** How sharply the outline turns at a point (radians) for it to stay a corner as the outline is walked. */
const CORNER = 0.6;

/** How sharply the closed polygon p turns at its point i, in radians. */
function turnAt(p: Pt[], i: number) {
  const n = p.length, a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
  return Math.abs(Math.atan2((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)));
}

/** A closed polygon walked in steps of about `step`, its corners kept. */
function walk(p: Pt[], step: number): Pt[] {
  const n = p.length, corners = p.map((_, i) => i).filter(i => turnAt(p, i) > CORNER);
  // (a contour with no corner, a round, is walked from its first point all the way round)
  const stops = corners.length ? corners : [0], out: Pt[] = [];
  for (let s = 0; s < stops.length; s++) {
    const i0 = stops[s], i1 = s + 1 < stops.length ? stops[s + 1] : stops[0] + n, run: Pt[] = [];
    for (let i = i0; i <= i1; i++) run.push(p[i % n]);
    const S = [0];
    for (let k = 1; k < run.length; k++) S.push(S[k - 1] + dist(run[k - 1], run[k]));
    const L = S[S.length - 1], m = Math.max(1, Math.round(L / step));
    for (let k = 0, at = 0; k < m; k++) {
      const s0 = L * k / m;
      while (at + 1 < S.length - 1 && S[at + 1] < s0) at++;
      const a = run[at], b = run[at + 1], f = S[at + 1] > S[at] ? (s0 - S[at]) / (S[at + 1] - S[at]) : 0;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    }
  }
  return out;
}

/** The contours' ink as one, outlines anticlockwise and holes clockwise. Only contours whose boxes overlap are joined
    (combine): a dot or a pixel standing alone, as a grid fill draws hundreds, is only turned the right way round. */
function oneInk(polys: Pt[][]): Pt[][] {
  const box = polys.map(p => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of p) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    return { x0, x1, y0, y1 };
  });
  // the contours in groups of overlapping boxes (found left to right, each joined to the groups it meets)
  const group = polys.map((_, i) => i), top = (i: number): number => group[i] === i ? i : (group[i] = top(group[i]));
  const order = polys.map((_, i) => i).sort((a, b) => box[a].x0 - box[b].x0);
  for (let s = 0; s < order.length; s++) for (let t = s + 1; t < order.length && box[order[t]].x0 <= box[order[s]].x1; t++) {
    const a = box[order[s]], b = box[order[t]];
    if (a.y0 <= b.y1 && b.y0 <= a.y1) group[top(order[t])] = top(order[s]);
  }
  const groups = new Map<number, Pt[][]>();
  polys.forEach((p, i) => { const g = top(i); (groups.get(g) ?? groups.set(g, []).get(g)!).push(p); });
  return [...groups.values()].flatMap(g => {
    if (g.length === 1) return [signedArea(g[0]) < 0 ? [...g[0]].reverse() : g[0]];
    const ink = shape(g);
    return combine([ink], ink.has);
  });
}

/** The outline `cmds` with its edges roughed up `amount` (0 to 1), for letters `cap` tall; `seed` (the character)
    gives each letter its own wander. `apart`: the fill drew its ink as shapes that don't overlap, outlines anticlockwise
    and holes clockwise (every fill but solid ink and the wireframe), so they are taken as they are. */
export function roughen(cmds: Cmd[], amount: number, cap: number, seed: number, apart = false): Cmd[] {
  const polys = toPolys(cmds);
  if (!(amount > 0) || !polys.length) return cmds;
  const A = amount * cap * REACH, big = cap * BIG, small = cap * SMALL, far = A / ROOM;
  // (its corners rounded first, as ink fills a corner in and wears the point off one; a curve's points, a few degrees'
  // turn apart, stay as they are)
  const solid = toPolys((apart ? polys : oneInk(polys)).flatMap(p => roundContour(p.map((q, i) => ({ x: q.x, y: q.y, smooth: turnAt(p, i) < CORNER })), A * 0.7)));
  // the edges laid out in square cells `far` a side, so a ray looks only along the cells it passes
  const G = Math.max(far, 1), cells = new Map<number, [Pt, Pt][]>(), key = (i: number, j: number) => (i + 32768) * 65536 + j + 32768;
  for (const p of solid) for (let k = 0; k < p.length; k++) {
    const a = p[k], b = p[(k + 1) % p.length];
    for (let i = Math.floor(Math.min(a.x, b.x) / G); i <= Math.floor(Math.max(a.x, b.x) / G); i++) {
      for (let j = Math.floor(Math.min(a.y, b.y) / G); j <= Math.floor(Math.max(a.y, b.y) / G); j++) {
        const c = cells.get(key(i, j));
        if (c) c.push([a, b]); else cells.set(key(i, j), [[a, b]]);
      }
    }
  }
  // how far from q the ray (ux, uy) runs before it meets an edge, up to `far` (from just off q, past its own edge)
  const ray = (q: Pt, ux: number, uy: number) => {
    let best = far;
    const ci = Math.floor(q.x / G), cj = Math.floor(q.y / G);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const [a, b] of cells.get(key(i, j)) ?? []) {
      const ex = b.x - a.x, ey = b.y - a.y, d = ux * ey - uy * ex;
      if (Math.abs(d) < 1e-12) continue;
      const qx = a.x - q.x, qy = a.y - q.y, t = (qx * ey - qy * ex) / d, s = (qx * uy - qy * ux) / d;
      if (s >= 0 && s <= 1 && t > 0.5 && t < best) best = t;
    }
    return best;
  };
  const ox = (seed % 97) * 7.31, oy = (seed % 89) * 3.17, out: Cmd[] = [];
  for (const p of solid) {
    let L = 0;
    for (let k = 0; k < p.length; k++) L += dist(p[k], p[(k + 1) % p.length]);
    // (steps about a third of a ripple, and never fewer than eight round a dot)
    const pts = walk(p, Math.min(small / 3, L / 8)), n = pts.length;
    if (n < 4) continue;
    out.push(...smoothLoop(pts.map((q, k) => {
      const a = pts[(k + n - 1) % n], b = pts[(k + 1) % n], l = dist(a, b) || 1;
      // outward: to the right, as outlines run anticlockwise and holes clockwise
      const nx = (b.y - a.y) / l, ny = -(b.x - a.x) / l;
      // (the ripples grow faster than the swells, so a little roughness is ink, and a lot a worn block)
      let d = A * (0.7 * noise(q.x / big + ox, q.y / big + oy, seed) + (0.15 + 0.3 * amount) * noise(q.x / small - oy, q.y / small + ox, seed + 7));
      d = Math.sign(d) * Math.min(Math.abs(d), ray(q, Math.sign(d) * nx, Math.sign(d) * ny) * ROOM);
      return { x: q.x + nx * d, y: q.y + ny * d };
    })));
  }
  return out;
}
