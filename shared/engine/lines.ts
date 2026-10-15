/* A letter's straight strokes read off its outline (lineSkeleton), the skeleton a letter of them alone is drawn on at
   its lighter weights. The middle of a letter's ink is its strokes' middle only away from where they meet: there it
   bends round to meet the others', the further the heavier the design, and a design whose strokes are thick beside its
   counters has a middle line no light weight of it draws (a heavy w, its counters short notches, reads as one bar
   notched above and below; a heavy N's diagonal meets its stems half way down, where the notches stop). Here each pair
   of straight edges facing each other across the ink about a stroke apart is a stroke, its middle line halfway between
   them, and the strokes meet where their middle lines, run on, cross: a w's four strokes meeting at its three points,
   an N's diagonal running from the top of one stem to the foot of the other, an E's arms from its stem's middle. A stroke
   run level along one of the letter's lines keeps its side on it as it thins (FLUSH), and a slab serif's slabs, given,
   are strokes along their faces kept so too.

   Read by skin.ts (thinSkeleton). Positions are in the font's units, y up; the skeleton is as scan.ts makes one (an
   edge's first and last points its nodes, a node with one edge an end, with three or more a join). */
import type { Node } from './outline';
import { bez, inkGrid, type Grid, type SkEdge, type SkNode, type SkPt, type Skeleton } from './scan';
import type { Slab } from './slabs';

type P = { x: number; y: number };

/** A straight edge of the outline, from (x0, y0) to (x1, y1): the way it runs, the way out of the ink from it, its
    length and its middle. */
interface Edge { x0: number; y0: number; x1: number; y1: number; ux: number; uy: number; nx: number; ny: number; len: number; mx: number; my: number }
/** A straight stroke: its middle line, through (px, py) running (ux, uy); half its thickness; and how far along that line
    its sides reach, from lo to hi. */
interface Stroke { px: number; py: number; ux: number; uy: number; h: number; lo: number; hi: number; core?: [number, number] }

/** An edge is a stroke's side only as long as SIDE of the capitals' height (shorter, a step or a notch's lip). */
const SIDE = 0.04;
/** Two sides are one stroke's where they run within PARALLEL (the sine of the angle between them) of the same way, no
    further apart than APART times the font's stem, the band between them inked over INKED of it, and no further apart
    along their line than ALONG times the stroke is thick (a heavy w's stroke between its notches, its sides each on
    one side of where it meets the next). */
const PARALLEL = 0.1, APART = 1.6, INKED = 0.9, ALONG = 1.5;
/** A letter is read by its straight strokes only where the thickest is no more than EVEN times the thinnest. */
const EVEN = 1.6;
/** The letter's ink the strokes leave out (further than COVER_TOL of a stroke's half thickness outside it): no more
    than COVER of it, or the letter isn't one of straight strokes (a bowl, a curved leg, a dot). */
const COVER = 0.02, COVER_TOL = 0.25;
/** The grid the ink is read on, its cells this many units a side. */
const GRID = 2;

/** A stroke with a side a lighter weight keeps where it is: run level along one of the letter's lines, its side on it (an
    E's arms, an L's foot), or a slab, along its face. A point of that side (fx, fy), the way in from it (nx, ny), the way
    the stroke runs (ux, uy), its half thickness as read, and how far in from the side a point of the skeleton lies. */
export interface Flush { fx: number; fy: number; nx: number; ny: number; ux: number; uy: number; h: number; at: number }
/** Each point of a skeleton lineSkeleton reads that goes in or out as such strokes thin, and with which: a point of one
    all the way, and a point of a stroke ending at one as much less as it lies further from that end (an E's stem, its
    ends going with its arms; a Z's diagonal with both). */
export const FLUSH = new WeakMap<SkPt, [Flush, number][]>();

/** Distance to the paper at a point, read between the cells. */
function dtAt(g: Grid, x: number, y: number) {
  const c = (x - g.x0) / g.cell - 0.5, r = g.H - (y - g.y0) / g.cell - 0.5, c0 = Math.floor(c), r0 = Math.floor(r);
  if (c0 < 0 || r0 < 0 || c0 + 1 >= g.W || r0 + 1 >= g.H) return 0;
  const a = c - c0, b = r - r0, d = g.dt, W = g.W;
  return (d[r0 * W + c0] * (1 - a) + d[r0 * W + c0 + 1] * a) * (1 - b) + (d[(r0 + 1) * W + c0] * (1 - a) + d[(r0 + 1) * W + c0 + 1] * a) * b;
}
/** Whether (x, y) is inside a ring (even-odd). */
function inRing(r: P[], x: number, y: number) {
  let k = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i].y > y) !== (r[j].y > y) && x < r[j].x + (y - r[j].y) / (r[i].y - r[j].y) * (r[i].x - r[j].x)) k = !k;
  return k;
}
const inked = (g: Grid, x: number, y: number) => {
  const c = Math.floor((x - g.x0) / g.cell), r = Math.floor(g.H - (y - g.y0) / g.cell);
  return c >= 0 && r >= 0 && c < g.W && r < g.H && g.ink[r * g.W + c] > 0;
};

/** The outline's straight edges, runs of straight segments going one way, each as long as SIDE of the capitals'. */
/** Strokes, less those lying along inside much thicker ones (BURIED of their middles within strokes THICKER times as
    thick): read off the sides of a stroke's two halves set a little apart where another crosses it (a wood type's x),
    across them, it is those halves'. */
function buried(S: Stroke[]): Stroke[] {
  const near = (B: Stroke, x: number, y: number) => { const t = Math.max(B.lo, Math.min(B.hi, (x - B.px) * B.ux + (y - B.py) * B.uy)); return Math.hypot(x - B.px - B.ux * t, y - B.py - B.uy * t) <= B.h; };
  return S.filter(A => {
    let n = 0, k = 0;
    for (let t = A.lo; t <= A.hi; t += Math.max(2, A.h / 2), n++) { const x = A.px + A.ux * t, y = A.py + A.uy * t; if (S.some(B => B !== A && B.h > THICKER * A.h && near(B, x, y))) k++; }
    return k < BURIED * n;
  });
}
const BURIED = 0.8, THICKER = 1.5;

function straightEdges(cs: Node[][], inside: (x: number, y: number) => boolean, cap: number): Edge[] {
  const out: Edge[] = [];
  for (const c of cs) {
    const n = c.length;
    // (a segment is straight with no handles, or with its handles on the line between its ends)
    const straight = c.map((a, i) => {
      const b = c[(i + 1) % n], l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l < 1e-6) return false;
      const off = (x?: number, y?: number) => (x === undefined || y === undefined ? 0 : Math.abs((x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x)) / l);
      return Math.max(off(a.ox, a.oy), off(b.ix, b.iy)) <= Math.max(0.5, 0.005 * l);
    });
    const start = straight.indexOf(false);
    const order = start < 0 ? c.map((_, i) => i) : c.map((_, i) => (start + 1 + i) % n);
    let run: { a: P; b: P } | null = null;
    const flush = () => {
      if (!run) return;
      const len = Math.hypot(run.b.x - run.a.x, run.b.y - run.a.y);
      if (len >= SIDE * cap) {
        const ux = (run.b.x - run.a.x) / len, uy = (run.b.y - run.a.y) / len, mx = (run.a.x + run.b.x) / 2, my = (run.a.y + run.b.y) / 2;
        const out1 = inside(mx + 2 * uy, my - 2 * ux);
        out.push({ x0: run.a.x, y0: run.a.y, x1: run.b.x, y1: run.b.y, ux, uy, nx: out1 ? -uy : uy, ny: out1 ? ux : -ux, len, mx, my });
      }
      run = null;
    };
    for (const i of order) {
      if (!straight[i]) { flush(); continue; }
      const a = c[i], b = c[(i + 1) % n];
      if (run) {
        const l0 = Math.hypot(run.b.x - run.a.x, run.b.y - run.a.y), l1 = Math.hypot(b.x - a.x, b.y - a.y);
        const cross = ((run.b.x - run.a.x) * (b.y - a.y) - (run.b.y - run.a.y) * (b.x - a.x)) / (l0 * l1);
        const dot = ((run.b.x - run.a.x) * (b.x - a.x) + (run.b.y - run.a.y) * (b.y - a.y)) / (l0 * l1);
        if (Math.abs(cross) < 0.035 && dot > 0) { run = { a: run.a, b }; continue; }
        flush();
      }
      run = { a, b };
    }
    flush();
  }
  return out;
}

/** The strokes the edges could pair into, by where the edges lie alone. */
function pairsOf(edges: Edge[], stem: number, parallel = PARALLEL): Stroke[] {
  const out: Stroke[] = [];
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const A = edges[i], B = edges[j];
    if (Math.abs(A.ux * B.uy - A.uy * B.ux) > parallel || A.nx * B.nx + A.ny * B.ny > -Math.sqrt(1 - parallel * parallel)) continue;
    // (each lying inward of the other: ink between them, not a counter)
    const dA = -((B.mx - A.mx) * A.nx + (B.my - A.my) * A.ny), dB = -((A.mx - B.mx) * B.nx + (A.my - B.my) * B.ny);
    if (dA <= 0 || dB <= 0) continue;
    const d = (dA + dB) / 2;
    if (d > APART * stem) continue;
    const ul = Math.hypot(A.ux - B.ux, A.uy - B.uy), ux = (A.ux - B.ux) / ul, uy = (A.uy - B.uy) / ul, px = (A.mx + B.mx) / 2, py = (A.my + B.my) / 2;
    const along = (x: number, y: number) => (x - px) * ux + (y - py) * uy;
    const ta = [along(A.x0, A.y0), along(A.x1, A.y1)].sort((a, b) => a - b), tb = [along(B.x0, B.y0), along(B.x1, B.y1)].sort((a, b) => a - b);
    if (Math.max(ta[0], tb[0]) - Math.min(ta[1], tb[1]) > ALONG * d) continue;
    out.push({ px, py, ux, uy, h: d / 2, lo: Math.min(ta[0], tb[0]), hi: Math.max(ta[1], tb[1]), core: [Math.max(ta[0], tb[0]), Math.min(ta[1], tb[1])] });
  }
  return out;
}

/** The strokes the pairs make, the band between each pair's edges inked, those on one line made one. */
function strokesOf(pairs: Stroke[], g: Grid): Stroke[] {
  const out: Stroke[] = [];
  for (const { px, py, ux, uy, h, lo, hi, core } of pairs) {
    const d = 2 * h;
    let n = 0, k = 0;
    // (along where both its sides run: past one's end, a stroke meeting a line aslant (a K's leg, its foot cut level), the
    // band runs out of the ink)
    const [c0, c1] = core && core[1] > core[0] ? core : [lo, hi];
    for (let t = c0; t <= c1; t += Math.max(2, d / 8)) for (const f of [-0.4, -0.2, 0, 0.2, 0.4]) { n++; if (inked(g, px + ux * t - uy * f * d, py + uy * t + ux * f * d)) k++; }
    if (k >= INKED * n) out.push({ px, py, ux, uy, h, lo, hi });
  }
  // (a side in pieces, an E's stem's between its arms, pairs once a piece: the strokes on one line, inked between, are one)
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) for (let j = i + 1; j < out.length && !merged; j++) {
      const A = out[i], B = out[j];
      if (Math.abs(A.ux * B.uy - A.uy * B.ux) > PARALLEL / 2 || Math.abs((B.px - A.px) * -A.uy + (B.py - A.py) * A.ux) > 0.3 * Math.min(A.h, B.h) || Math.abs(A.h - B.h) > 0.3 * Math.max(A.h, B.h)) continue;
      const s = A.ux * B.ux + A.uy * B.uy > 0 ? 1 : -1, b0 = (B.px - A.px) * A.ux + (B.py - A.py) * A.uy;
      const blo = Math.min(b0 + s * B.lo, b0 + s * B.hi), bhi = Math.max(b0 + s * B.lo, b0 + s * B.hi);
      // (inked along the middle between them)
      let gapInk = true;
      for (let t = Math.min(A.hi, bhi); t < Math.max(A.lo, blo); t += 2) if (!inked(g, A.px + A.ux * t, A.py + A.uy * t)) { gapInk = false; break; }
      if (!gapInk) continue;
      const wa = A.hi - A.lo, wb = bhi - blo;
      out[i] = { ...A, h: (A.h * wa + B.h * wb) / (wa + wb), lo: Math.min(A.lo, blo), hi: Math.max(A.hi, bhi) };
      out.splice(j, 1);
      merged = true;
    }
  }
  return out;
}

/** The letter's skeleton drawn along its straight strokes, or null where it isn't all straight strokes about as thick
    as each other (they leave more than COVER of its ink out, or one is more than EVEN times another), or where they
    don't ring its counters. `stem` is how thick the font's stems are, `cell` how far apart the points along each
    stroke are; `even` and `parallel` stand for EVEN and PARALLEL, `lines` are the letter's heights. A slab serif's
    letter is read with its `slabs` (slabsOf) strokes along their faces, its strokes' sides read off its outline without
    them (`sides`). */
export function lineSkeleton(cs: Node[][], cap: number, stem: number, cell: number, { even = EVEN, parallel = PARALLEL, lines = [] as number[], slabs = [] as Slab[], sides = cs } = {}): Skeleton | null {
  // (read first by the outline alone, which a letter with no two straight edges a stroke apart needs no more of)
  const rings = cs.map(c => c.flatMap((n, i) => Array.from({ length: 8 }, (_, k) => bez(n, c[(i + 1) % c.length], k / 8))));
  const ringsOf = sides === cs ? rings : sides.map(c => c.flatMap((n, i) => Array.from({ length: 8 }, (_, k) => bez(n, c[(i + 1) % c.length], k / 8))));
  const inside = (x: number, y: number) => ringsOf.reduce((k, r) => k !== inRing(r, x, y), false);
  const edges = straightEdges(sides, inside, cap);
  if (edges.length < 2) return null;
  const pairs = pairsOf(edges, stem, parallel);
  if (!pairs.length) return null;
  const g = inkGrid(cs, GRID), S0 = buried(strokesOf(pairs, g));
  if (!S0.length) return null;
  // (its strokes all about as thick: one drawn with contrast, or slabs thin beside its stems (a wood type's), is more
  // than its strokes)
  if (Math.max(...S0.map(s => s.h)) > even * Math.min(...S0.map(s => s.h))) return null;
  // (and each slab a stroke along its face, half as deep in, from end to end)
  const slabbed = new Map<Stroke, Slab>(), S = [...S0, ...slabs.map(sl => {
    const l = Math.hypot(sl.b.x - sl.a.x, sl.b.y - sl.a.y) || 1, A: Stroke = { px: sl.a.x + sl.nx * sl.d / 2, py: sl.a.y + sl.ny * sl.d / 2, ux: (sl.b.x - sl.a.x) / l, uy: (sl.b.y - sl.a.y) / l, h: sl.d / 2, lo: 0, hi: l };
    slabbed.set(A, sl);
    return A;
  })];
  const at = (s: Stroke, t: number): P => ({ x: s.px + s.ux * t, y: s.py + s.uy * t });
  // where two strokes' middle lines cross, near enough both to be where they meet
  type Meet = { x: number; y: number; a: number; b: number; ta: number; tb: number };
  const meets: Meet[] = [];
  for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) {
    const A = S[a], B = S[b], det = A.ux * B.uy - A.uy * B.ux;
    if (Math.abs(det) < 0.25) continue;
    const ta = ((B.px - A.px) * B.uy - (B.py - A.py) * B.ux) / det, tb = ((B.px - A.px) * A.uy - (B.py - A.py) * A.ux) / det;
    const ext = (A.h + B.h) / Math.abs(det) + Math.max(A.h, B.h);
    if (ta < A.lo - ext || ta > A.hi + ext || tb < B.lo - ext || tb > B.hi + ext) continue;
    // (in the ink; or a little past it, where a square design's corner cuts off the point two strokes meet at, a squared
    // N's, a pointed V's, brought in between them till the ink is half as deep as the thinner of them)
    const p = at(A, ta), r = Math.max(A.h, B.h);
    if (inked(g, p.x, p.y)) { meets.push({ ...p, a, b, ta, tb }); continue; }
    // (and each stroke run on no further past its sides than a corner of the two reaches: not two strokes apart, a K's arm
    // run on down past its stem's foot)
    const past = (S0: Stroke, t: number, O: Stroke) => Math.max(0, S0.lo - t, t - S0.hi) <= 1.2 * (O.h / Math.abs(det) + S0.h);
    if (!past(A, ta, B) || !past(B, tb, A)) continue;
    let near: P | null = null;
    // (ink within as far as such a corner reaches: a ring of looks every third of a stroke out to it)
    const reach = 1.2 * (r / Math.abs(det) + r);
    for (let k = 0; k < 16 * Math.ceil(3 * reach / r) && !near; k++) { const a = k * Math.PI / 8, d = r * (1 + (k >> 4)) / 3, q = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d }; if (inked(g, q.x, q.y)) near = q; }
    if (!near) continue;
    // (in along the way between the two strokes, back toward each one's middle)
    const sa = Math.sign((A.lo + A.hi) / 2 - ta), sb = Math.sign((B.lo + B.hi) / 2 - tb), wx = sa * A.ux + sb * B.ux, wy = sa * A.uy + sb * B.uy;
    const vl = Math.hypot(wx, wy) || 1, vx = wx / vl, vy = wy / vl, deep = 0.5 * Math.min(A.h, B.h);
    let q = p;
    for (let d = 0; d < 4 * r && dtAt(g, q.x, q.y) < deep; d += 2) q = { x: p.x + vx * d, y: p.y + vy * d };
    if (dtAt(g, q.x, q.y) < deep) continue;
    // (and brought in to within a stroke of each one's sides, not out along one away from the other)
    const nearSpan = (S0: Stroke) => { const t = Math.max(S0.lo, Math.min(S0.hi, (q.x - S0.px) * S0.ux + (q.y - S0.py) * S0.uy)), c = at(S0, t); return Math.hypot(q.x - c.x, q.y - c.y) <= 1.5 * S0.h; };
    if (!nearSpan(A) || !nearSpan(B)) continue;
    // (where along each stroke still read where their lines cross)
    meets.push({ ...q, a, b, ta, tb });
  }
  // each stroke's end: the meet nearest inside it of those at or past that end, else a free end, where its ink no
  // longer holds a round as thick as the stroke
  const tOf = (m: Meet, s: number) => (m.a === s ? m.ta : m.tb), other = (m: Meet, s: number) => (m.a === s ? m.b : m.a);
  const ends = S.map((A, s) => ([-1, 1] as const).map(dir => {
    const end = dir < 0 ? A.lo : A.hi, len = A.hi - A.lo, sl = slabbed.get(A);
    let best: Meet | null = null;
    // (a slab's end at a tab is its own, past the stroke it stands under)
    if (!sl || !(dir < 0 ? sl.ta : sl.tb)) for (const m of meets) {
      if (m.a !== s && m.b !== s) continue;
      const t = tOf(m, s), into = (end - t) * dir, o = S[other(m, s)];
      // (no further in than the point the two make reaches past where their middles cross: a narrow V's, far)
      const sinT = Math.abs(A.ux * o.uy - A.uy * o.ux);
      if (into > Math.min(1.25 * (o.h / sinT + A.h), len / 2)) continue;
      // (and, short of its end, only where the other reaches: not where its line, run on, crosses this one far off, a wood
      // type's k's leg's its stem high up)
      const to = tOf(m, other(m, s));
      if (into > 0 && Math.max(0, o.lo - to, to - o.hi) > 1.2 * (A.h / sinT + o.h)) continue;
      // (not where its sides run on out past the other stroke's far side, inked: it crosses there, a #'s bars)
      const tq = t + dir * (o.h / sinT + 0.5 * A.h), q = at(A, tq);
      if ((end - tq) * dir >= 0 && dtAt(g, q.x, q.y) >= 0.5 * A.h) continue;
      // (a slab's end without a tab at the furthest out: the stroke whose side leaves the face there, an N's diagonal
      // beside its stem)
      if (!best || (sl ? into < (end - tOf(best, s)) * dir : into > (end - tOf(best, s)) * dir)) best = m;
    }
    if (best) return { meet: best, t: tOf(best, s) };
    let t = end - dir * A.h;
    for (const lim = end + dir * 2 * A.h; (lim - t) * dir > 0; t += dir * 2) { const p = at(A, t + dir * 2); if (dtAt(g, p.x, p.y) < 0.9 * A.h) break; }
    return { meet: null, t };
  }));
  // the joins: the meets a stroke ends at, and those two strokes cross at, inside both; those close together one
  const chosen = new Set<Meet>();
  ends.forEach(e => e.forEach(x => x.meet && chosen.add(x.meet)));
  for (const m of meets) {
    const A = S[m.a], B = S[m.b];
    if (m.ta > ends[m.a][0].t + A.h && m.ta < ends[m.a][1].t - A.h && m.tb > ends[m.b][0].t + B.h && m.tb < ends[m.b][1].t - B.h) chosen.add(m);
  }
  type J = { x: number; y: number; on: Map<number, number> };
  const joins: J[] = [];
  for (const m of chosen) {
    const near = joins.find(j => Math.hypot(j.x - m.x, j.y - m.y) < 0.6 * Math.min(S[m.a].h, S[m.b].h));
    if (near) {
      const k = near.on.size;
      near.x = (near.x * k + m.x) / (k + 1); near.y = (near.y * k + m.y) / (k + 1);
      for (const [s, t] of [[m.a, m.ta], [m.b, m.tb]] as const) if (!near.on.has(s)) near.on.set(s, t);
    } else joins.push({ x: m.x, y: m.y, on: new Map([[m.a, m.ta], [m.b, m.tb]]) });
  }
  // (and a slab meeting a stroke where a join already stands, both reaching it, joins there: two slabs on one line, the
  // stroke's end taken for the one beside its own, run on)
  for (const m of meets) if (!chosen.has(m) && (slabbed.has(S[m.a]) || slabbed.has(S[m.b]))) {
    const j = joins.find(j => Math.hypot(j.x - m.x, j.y - m.y) < 0.6 * Math.min(S[m.a].h, S[m.b].h)), reach = (s: number, t: number) => t >= S[s].lo - S[s].h && t <= S[s].hi + S[s].h;
    if (j && reach(m.a, m.ta) && reach(m.b, m.tb)) for (const [s, t] of [[m.a, m.ta], [m.b, m.tb]] as const) if (!j.on.has(s)) j.on.set(s, t);
  }
  // each stroke from end to end, through the joins along it; a join past where the stroke ends is not on it
  const nodes: SkNode[] = [], sk: Skeleton = { nodes, edges: [] };
  const jNode = joins.map(j => { nodes.push({ x: j.x, y: j.y, r: dtAt(g, j.x, j.y), edges: [] }); return nodes.length - 1; });
  const runs: { s: number; stops: { t: number; n: number }[] }[] = S.map((A, s) => {
    const [e0, e1] = ends[s], stops: { t: number; n: number }[] = [];
    joins.forEach((j, k) => { const t = j.on.get(s); if (t !== undefined && t >= e0.t - 0.6 * A.h - 1 && t <= e1.t + 0.6 * A.h + 1) stops.push({ t, n: jNode[k] }); });
    for (const e of [e0, e1]) if (!e.meet) { nodes.push({ ...at(A, e.t), r: A.h, edges: [] }); stops.push({ t: e.t, n: nodes.length - 1 }); }
    stops.sort((a, b) => a.t - b.t);
    return { s, stops };
  });
  const segs: { a: P; b: P; h: number }[] = [], owner: (Stroke | null)[] = [];
  // (along stroke `on`'s own line, from where it passes the one node to where it passes the other, but for its first and
  // last points, the nodes: a join where three strokes' lines meet near, not at, one point (a Y's), stands a little off
  // each, and a stroke run straight to it would lean)
  const edge = (a: number, b: number, h: number, on?: { s: Stroke; ta: number; tb: number }) => {
    if (a === b) return;
    const A = nodes[a], B = nodes[b], len = Math.hypot(B.x - A.x, B.y - A.y), n = Math.max(1, Math.round(len / cell)), pts: SkPt[] = [];
    // (but straight to a node well off the stroke's line, a squared corner's brought in)
    const off = (N: SkNode) => (on ? Math.abs((N.x - on.s.px) * -on.s.uy + (N.y - on.s.py) * on.s.ux) : 0), along = on && off(A) < 0.25 * on.s.h && off(B) < 0.25 * on.s.h;
    const proj = (N: SkNode) => at(on!.s, (N.x - on!.s.px) * on!.s.ux + (N.y - on!.s.py) * on!.s.uy);
    const P0 = along ? proj(A) : A, P1 = along ? proj(B) : B;
    // (as thick as the stroke all along, out to its ends and into its joins: where the ink is thinner, a heavy W's points
    // cut off short of where its strokes' middles meet, or thicker, where strokes meet, it is still the stroke's)
    for (let k = 0; k <= n; k++) pts.push(k === 0 ? { x: A.x, y: A.y, r: A.r } : k === n ? { x: B.x, y: B.y, r: B.r } : { x: P0.x + (P1.x - P0.x) * k / n, y: P0.y + (P1.y - P0.y) * k / n, r: h });
    sk.edges.push({ a, b, pts, len }); owner.push(on?.s ?? null);
    A.edges.push(sk.edges.length - 1); B.edges.push(sk.edges.length - 1);
    // (the ink it stands for read along its line)
    segs.push(on ? { a: at(on.s, on.ta), b: at(on.s, on.tb), h } : { a: A, b: B, h });
  };
  for (const { s, stops } of runs) for (let k = 1; k < stops.length; k++) edge(stops[k - 1].n, stops[k].n, S[s].h, { s: S[s], ta: stops[k - 1].t, tb: stops[k].t });
  // a join standing off a stroke it touches, in the ink across from it (a heavy K's arm and leg meeting just off its
  // stem), runs to it, the strokes not otherwise joined
  const comp = (): number[] => {
    const c = nodes.map((_, i) => i), find = (i: number): number => (c[i] === i ? i : (c[i] = find(c[i])));
    for (const E of sk.edges) c[find(E.a)] = find(E.b);
    return nodes.map((_, i) => find(i));
  };
  for (let linked = true; linked;) {
    linked = false;
    const cc = comp();
    let best: { j: number; s: number; t: number; d: number } | null = null;
    joins.forEach((j, k) => runs.forEach(({ s, stops }) => {
      if (!stops.length || cc[stops[0].n] === cc[jNode[k]]) return;
      const A = S[s], t = (j.x - A.px) * A.ux + (j.y - A.py) * A.uy, d = Math.abs((j.x - A.px) * -A.uy + (j.y - A.py) * A.ux);
      const hj = Math.max(...[...j.on.keys()].map(o => S[o].h));
      if (t <= stops[0].t + 1 || t >= stops[stops.length - 1].t - 1 || d > A.h + 0.9 * hj) return;
      if (!best || d < best.d) best = { j: k, s, t, d };
    }));
    if (!best) break;
    const { j, s, t } = best as { j: number; s: number; t: number; d: number }, run = runs[s], A = S[s], p = at(A, t);
    let ok = true;
    for (let k = 0; k <= 10; k++) if (!inked(g, joins[j].x + (p.x - joins[j].x) * k / 10, joins[j].y + (p.y - joins[j].y) * k / 10)) ok = false;
    if (!ok) break;
    // (the stroke's edge across the foot cut in two there)
    const k = run.stops.findIndex(q => q.t > t), a = run.stops[k - 1].n, b = run.stops[k].n;
    const ei = sk.edges.findIndex(E => (E.a === a && E.b === b) || (E.a === b && E.b === a));
    if (ei < 0) break;
    nodes.push({ ...p, r: dtAt(g, p.x, p.y), edges: [] });
    const f = nodes.length - 1;
    run.stops.splice(k, 0, { t, n: f });
    const E = sk.edges[ei];
    nodes[E.a].edges.splice(nodes[E.a].edges.indexOf(ei), 1); nodes[E.b].edges.splice(nodes[E.b].edges.indexOf(ei), 1);
    sk.edges[ei] = { a: E.a, b: E.a, pts: [], len: 0 };
    segs.splice(ei, 1, { a: nodes[E.a], b: nodes[E.a], h: 0 });
    const ta = run.stops[k - 1].t, tb = run.stops[k + 1].t;
    edge(E.a, f, A.h, { s: A, ta, tb: t }); edge(f, E.b, A.h, { s: A, ta: t, tb }); edge(jNode[j], f, Math.min(A.h, ...[...joins[j].on.keys()].map(o => S[o].h)));
    linked = true;
  }
  // (one piece, every stroke joined)
  const cc = comp(), used = nodes.map(n => n.edges.length > 0);
  if (new Set(cc.filter((_, i) => used[i])).size !== 1) return null;
  // the ink they leave out: no more than COVER of it
  let all = 0, out = 0;
  const live = segs.filter(q => q.h > 0);
  for (let r = 0; r < g.H; r += 2) for (let c = 0; c < g.W; c += 2) {
    if (!g.ink[r * g.W + c]) continue;
    all++;
    const x = g.x0 + (c + 0.5) * g.cell, y = g.y0 + (g.H - r - 0.5) * g.cell;
    let covered = false;
    for (const q of live) {
      const dx = q.b.x - q.a.x, dy = q.b.y - q.a.y, l2 = dx * dx + dy * dy, u = l2 ? Math.max(0, Math.min(1, ((x - q.a.x) * dx + (y - q.a.y) * dy) / l2)) : 0;
      if (Math.hypot(x - q.a.x - dx * u, y - q.a.y - dy * u) <= q.h * (1 + COVER_TOL)) { covered = true; break; }
    }
    if (!covered) out++;
  }
  if (!all || out > COVER * all) return null;
  // (and as many rings as the letter has counters: an A whose legs, run on, meet above its flat top, never there, has
  // its counter open to the paper)
  const area = (r: P[]) => r.reduce((a, q, i) => { const n = r[(i + 1) % r.length]; return a + q.x * n.y - n.x * q.y; }, 0) / 2;
  const areas = rings.map(area), outer = areas.reduce((a, v) => (Math.abs(v) > Math.abs(a) ? v : a), 0);
  const counters = areas.filter(v => Math.sign(v) !== Math.sign(outer)).length;
  // (each stroke run level along one of the letter's lines, its side on it, kept there, and every stroke's end where it
  // meets one, going along its own way)
  const tol = Math.max(6, 0.02 * cap), level = new Map<Stroke, Omit<Flush, 'at'>>();
  for (const A of S) {
    const sl = slabbed.get(A);
    if (sl) { level.set(A, { fx: sl.a.x, fy: sl.a.y, nx: sl.nx, ny: sl.ny, ux: A.ux, uy: A.uy, h: A.h }); continue; }
    if (Math.abs(A.uy) >= 0.02) continue;
    const y = at(A, (A.lo + A.hi) / 2).y, L = lines.find(L => Math.abs(y + A.h - L) < tol || Math.abs(y - A.h - L) < tol);
    if (L !== undefined) level.set(A, { fx: 0, fy: L, nx: 0, ny: Math.abs(y + A.h - L) < tol ? -1 : 1, ux: A.ux, uy: A.uy, h: A.h });
  }
  if (level.size) {
    // (a node such strokes meet at keeps each one's side, one of those whose sides run one way: a beak's corner with its
    // arm, its face upright and the arm's on the line)
    const on = new Map<number, Omit<Flush, 'at'>[]>(), held = (F: Omit<Flush, 'at'>, p: P): Flush => ({ ...F, at: (p.x - F.fx) * F.nx + (p.y - F.fy) * F.ny });
    sk.edges.forEach((E, i) => {
      const F = owner[i] && level.get(owner[i]!);
      if (F && E.pts.length) for (const n of [E.a, E.b]) { const l = on.get(n) ?? []; if (!l.some(G => G.nx * F.nx + G.ny * F.ny > 0.9)) on.set(n, [...l, F]); }
    });
    sk.edges.forEach((E, i) => {
      const n = E.pts.length, F = owner[i] && level.get(owner[i]!), at = (m: number) => (on.get(m) ?? []).map(G => held(G, nodes[m]));
      const Fa = at(E.a), Fb = at(E.b);
      E.pts.forEach((p, k) => {
        const t = n > 1 ? k / (n - 1) : 0;
        const by: [Flush, number][] = k === 0 && Fa.length ? Fa.map(G => [G, 1]) : k === n - 1 && Fb.length ? Fb.map(G => [G, 1]) : F ? [[held(F, p), 1]] : [...Fa.map(G => [G, 1 - t] as [Flush, number]), ...Fb.map(G => [G, t] as [Flush, number])];
        if (by.length) FLUSH.set(p, by);
      });
    });
  }
  const done = tidy(sk);
  return done.edges.length - done.nodes.length + 1 === counters ? done : null;
}

/** The skeleton with its dropped edges gone and each node two strokes simply turn at (a w's points, an N's corners)
    made a bend in one edge, as scan.ts reads a stroke turning round. */
function tidy(sk: Skeleton): Skeleton {
  let edges = sk.edges.filter(E => E.pts.length);
  for (;;) {
    const deg = new Map<number, number[]>();
    edges.forEach((E, i) => { for (const n of [E.a, E.b]) deg.set(n, [...(deg.get(n) ?? []), i]); });
    const turn = [...deg].find(([n, es]) => es.length === 2 && es[0] !== es[1]);
    if (!turn) break;
    const [n, [i, j]] = turn, A = edges[i], B = edges[j];
    const ap = A.b === n ? A.pts : A.pts.slice().reverse(), from = A.b === n ? A.a : A.b;
    const bp = B.a === n ? B.pts : B.pts.slice().reverse(), to = B.a === n ? B.b : B.a;
    if (from === n || to === n) break;
    // (the turn as thick as the strokes either side, the thinner: its ink, a heavy N's corner, a W's point cut off short
    // of where its strokes' middles meet, is the ends of both)
    const turnAt = { ...ap[ap.length - 1], r: Math.min(ap[Math.max(0, ap.length - 2)].r, bp[Math.min(1, bp.length - 1)].r) };
    const fl = FLUSH.get(ap[ap.length - 1]) ?? FLUSH.get(bp[0]);
    if (fl) FLUSH.set(turnAt, fl);
    const joined: SkEdge = { a: from, b: to, pts: [...ap.slice(0, -1), turnAt, ...bp.slice(1)], len: A.len + B.len };
    edges = edges.filter((_, k) => k !== i && k !== j);
    // (strokes turning round back to where they left, a 4's, are a ring there, its edge listed twice at its node)
    edges.push(joined);
  }
  // (a ring of strokes and nothing else, a squared O's, its node set half way along its longest side, not at a corner,
  // which, the ring's two ends, would be drawn as two ends meeting)
  edges = edges.map(E => {
    if (E.a !== E.b || edges.some(F => F !== E && (F.a === E.a || F.b === E.a))) return E;
    const q = E.pts.slice(0, -1), n = q.length, turn = (i: number) => {
      const a = q[(i + n - 1) % n], p = q[i], b = q[(i + 1) % n], ax = p.x - a.x, ay = p.y - a.y, bx = b.x - p.x, by = b.y - p.y;
      return ax * bx + ay * by < Math.cos(Math.PI / 9) * Math.hypot(ax, ay) * Math.hypot(bx, by);
    };
    const turns = q.map((_, i) => i).filter(turn);
    if (turns.length < 2) return E;
    let at = 0, most = -1;
    turns.forEach((t, k) => { const u = turns[(k + 1) % turns.length], gap = (u - t + n) % n || n; if (gap > most) { most = gap; at = (t + Math.floor(gap / 2)) % n; } });
    const pts = [...q.slice(at), ...q.slice(0, at), q[at]];
    sk.nodes[E.a] = { ...sk.nodes[E.a], x: q[at].x, y: q[at].y, r: q[at].r };
    return { ...E, pts };
  });
  const used = [...new Set(edges.flatMap(E => [E.a, E.b]))], idx = new Map(used.map((n, i) => [n, i]));
  const nodes: SkNode[] = used.map(n => ({ x: sk.nodes[n].x, y: sk.nodes[n].y, r: sk.nodes[n].r, edges: [] }));
  const out: SkEdge[] = edges.map((E, i) => {
    const a = idx.get(E.a)!, b = idx.get(E.b)!;
    nodes[a].edges.push(i); nodes[b].edges.push(i);
    return { a, b, pts: E.pts, len: E.len };
  });
  return { nodes, edges: out };
}
