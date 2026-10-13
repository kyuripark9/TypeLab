/* A change made to one letter's points, carried to the other letters shaped the same way there. The change is
   read by comparing the letter's contours with what they were: the points both keep stay put, and each run of
   points between them that moved, came or went is one changed stretch; a corner rounded, cut or scooped where its
   point stays is a change of its own; and a shape moved, turned or resized whole, or taken away, is a change to
   that whole contour. Every other letter is then searched for a stretch of outline shaped as the changed one was,
   with a little of the outline either side of it, allowing it to be somewhat wider or narrower, taller or shorter
   (the serif of a d against an l's); or, for a whole contour, for a contour shaped as it was (the dot of an i and
   a j's). A match is close when the outline further round it is the same too (a serif and the stem under it), or
   when a whole contour sits as high (the two dots), else it is only the stretch, or the shape, that is the same
   (the top of an n's arch and the top of an o; a dot and a full stop). There, where the other letter has the same
   points as the changed one had, each moves by as much as its own did; otherwise the new stretch or shape is put
   in place of the old one, fitted to that letter. Pure, in font units, y up: tests/carry.test.ts. */
import { ALL_CHARS, hasIn, hasOut, segment, type Drawn, type Node } from '../../shared/engine';

type P = { x: number; y: number };
const R = Math.round;

/** The box round some points. */
function boxOf(ps: P[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of ps) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
type Box = ReturnType<typeof boxOf>;

/** One changed stretch of a contour: in `was` (the contour as it was) the points `a` and `b` stay, and the
    ones running between them, from a to b, gave way to `fresh` (none, when points were only taken away). A
    change to a `whole` contour (moved, turned or resized whole, or every point of it changed) has all of it as it
    is now in `fresh`, or none when it was taken away, and `a` and `b` 0. */
export interface Change { c: number; was: Node[]; a: number; b: number; fresh: Node[]; whole?: true }

/** Whether two points stand at the same place with the same handles (their corners perhaps rounded otherwise). */
const sameAt = (p: Node, q: Node) => p.x === q.x && p.y === q.y && p.ix === q.ix && p.iy === q.iy && p.ox === q.ox && p.oy === q.oy && !p.s === !q.s;
const same = (p: Node, q: Node) => sameAt(p, q) && p.r === q.r && p.corner === q.corner;
const sameContour = (p: Node[], q: Node[]) => p === q || (p.length === q.length && p.every((n, i) => same(n, q[i])));

/** Whether two drawings are the same, point for point (one read back from an undo step is a copy). */
export const sameDrawing = (p: Drawn | undefined, q: Drawn | undefined): boolean => p === q || (!!p && !!q && p.adv === q.adv
  && p.contours.length === q.contours.length && p.contours.every((con, c) => sameContour(con, q.contours[c])));

/** The items two lists keep in common, as index pairs in order (the longest such run). */
function kept<T>(O: T[], E: T[], eq: (p: T, q: T) => boolean): [number, number][] {
  const n = O.length, m = E.length, L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = eq(O[i], E[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (eq(O[i], E[j])) { out.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return out;
}

/** The stretches where contour E differs from O (point for point by `eq`), with the points both keep; changes with
    no more than two kept points between them are one. Null where no kept point is left outside them: the contour
    changed all over. */
function stretches(O: Node[], E: Node[], c: number, eq: (p: Node, q: Node) => boolean): { pairs: [number, number][]; changes: Change[] } | null {
  const n = O.length, m = E.length, pairs = kept(O, E, eq), k = pairs.length;
  if (k === n && k === m) return { pairs, changes: [] };
  if (k < 2) return null;
  // the gaps between kept points, round the contour: gap g runs from pairs[g] to pairs[g + 1]
  const gaps: number[] = [];
  for (let g = 0; g < k; g++) {
    const [i0, j0] = pairs[g], [i1, j1] = pairs[(g + 1) % k];
    if ((i1 - i0 - 1 + n) % n || (j1 - j0 - 1 + m) % m) gaps.push(g);
  }
  // merged where close: [first gap, last gap] runs, cyclically
  const runs: [number, number][] = [];
  for (const g of gaps) {
    const last = runs[runs.length - 1];
    if (last && g - last[1] <= 2) last[1] = g; else runs.push([g, g]);
  }
  if (runs.length > 1 && runs[0][0] + k - runs[runs.length - 1][1] <= 2) { const first = runs.shift()!; runs[runs.length - 1][1] = first[1] + k; }
  // (one run round every kept point leaves none outside it)
  if (runs.some(([g0, g1]) => g1 - g0 + 1 >= k)) return null;
  return {
    pairs, changes: runs.map(([g0, g1]) => {
      const [a, ja] = pairs[g0 % k], [b, jb] = pairs[(g1 + 1) % k], fresh: Node[] = [];
      for (let j = (ja + 1) % m; j !== jb; j = (j + 1) % m) fresh.push({ ...E[j] });
      return { c, was: O, a, b, fresh };
    })
  };
}

/** What changed in one contour: the stretches where it moved, and each corner rounded, cut or scooped otherwise
    where its point stayed, on its own (so all of a shape's corners rounded at once are found corner by corner); or,
    where it moved all over, the whole contour. */
function contourChanges(O: Node[], E: Node[], c: number): Change[] {
  const moved = stretches(O, E, c, sameAt), n = O.length;
  if (!moved) return [{ c, was: O, a: 0, b: 0, fresh: E.map(e => ({ ...e })), whole: true }];
  const inside = (i: number) => moved.changes.some(ch => (i - ch.a + n) % n > 0 && (i - ch.a + n) % n < (ch.b - ch.a + n) % n);
  // the corners first: they leave the outline where it was, so the stretches are still found after them
  const corners = n < 3 ? [] : moved.pairs.filter(([i, j]) => !same(O[i], E[j]) && !inside(i))
    .map(([i, j]): Change => ({ c, was: O, a: (i - 1 + n) % n, b: (i + 1) % n, fresh: [{ ...E[j] }] }));
  return [...corners, ...moved.changes];
}

/** Which of `now`'s contours each of `base`'s became (-1 where it was taken away): those left as they were, and
    between them, in order where as many are left on each side, else each to the one it overlaps most. Contours
    added aren't changes that can be carried (there's no telling where they'd go), so none come back for them. */
function contourPairs(base: Node[][], now: Node[][]): [number, number][] {
  const keep = kept(base, now, sameContour), out: [number, number][] = [];
  const overlap = (p: Box, q: Box) => Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0));
  [...keep, [base.length, now.length]].forEach(([i1, j1], k) => {
    const [i0, j0] = k ? keep[k - 1] : [-1, -1], bs: number[] = [], ns: number[] = [];
    for (let i = i0 + 1; i < i1; i++) bs.push(i);
    for (let j = j0 + 1; j < j1; j++) ns.push(j);
    if (bs.length === ns.length) bs.forEach((i, z) => out.push([i, ns[z]]));
    else for (const i of bs) {
      const b = boxOf(base[i]), best = ns.map(j => ({ j, o: overlap(b, boxOf(now[j])) })).filter(q => q.o > 0).sort((p, q) => q.o - p.o)[0];
      if (best) ns.splice(ns.indexOf(best.j), 1);
      out.push([i, best ? best.j : -1]);
    }
    if (k < keep.length) out.push(keep[k]);
  });
  return out;
}

/** Whether every point of `now` is where `base`'s was, moved by as much: the letter moved whole. */
function shifted(base: Node[][], now: Node[][]): boolean {
  const p = base[0]?.[0], q = now[0]?.[0];
  if (!p || !q || base.length !== now.length) return false;
  const dx = q.x - p.x, dy = q.y - p.y, by = (n: Node): Node => ({
    ...n, x: n.x + dx, y: n.y + dy, ...(hasIn(n) ? { ix: n.ix! + dx, iy: n.iy! + dy } : {}), ...(hasOut(n) ? { ox: n.ox! + dx, oy: n.oy! + dy } : {})
  });
  return (dx !== 0 || dy !== 0) && base.every((con, c) => sameContour(con.map(by), now[c]));
}

/** The changes from `base` to `now`, contour by contour (see Change). A letter moved whole has changed its place,
    not its shape: no change comes back for it. */
export function changesOf(base: Node[][], now: Node[][]): Change[] {
  if (shifted(base, now)) return [];
  return contourPairs(base, now).flatMap(([c, j]) => j < 0 ? [{ c, was: base[c], a: 0, b: 0, fresh: [], whole: true as const }]
    : sameContour(base[c], now[j]) ? [] : contourChanges(base[c], now[j], c));
}

/* ---- sampling outlines */

function bez(B: P[], t: number): P {
  const u = 1 - t;
  return {
    x: u * u * u * B[0].x + 3 * u * u * t * B[1].x + 3 * u * t * t * B[2].x + t * t * t * B[3].x,
    y: u * u * u * B[0].y + 3 * u * u * t * B[1].y + 3 * u * t * t * B[2].y + t * t * t * B[3].y
  };
}
const curveOf = (a: Node, b: Node): P[] => segment(a, b) ?? [a, a, b, b];

/** Points along a contour, about `step` units apart, from point `from` for `count` segments: where each is, how far
    along (s), and the segment (i) and place on it (t) it came from; and how far along each segment starts (`at`,
    one more for the end of the last). Each segment's first point is sampled; the end of the last one too. */
interface Samples { p: P[]; s: number[]; i: number[]; t: number[]; at: number[] }
function sample(con: Node[], from: number, count: number, step: number): Samples {
  const n = con.length, out: Samples = { p: [], s: [], i: [], t: [], at: [] };
  let s = 0, prev: P | null = null;
  const put = (q: P, i: number, t: number) => {
    if (prev) s += Math.hypot(q.x - prev.x, q.y - prev.y);
    out.p.push(q); out.s.push(s); out.i.push(i); out.t.push(t); prev = q;
  };
  for (let k = 0; k < count; k++) {
    const i = (from + k) % n, B = curveOf(con[i], con[(i + 1) % n]);
    const L = Math.hypot(B[1].x - B[0].x, B[1].y - B[0].y) + Math.hypot(B[2].x - B[1].x, B[2].y - B[1].y) + Math.hypot(B[3].x - B[2].x, B[3].y - B[2].y);
    const steps = Math.max(1, Math.ceil(L / step));
    for (let q = 0; q < steps; q++) { put(bez(B, q / steps), i, q / steps); if (!q) out.at.push(s); }
    if (k === count - 1) { put(B[3], (i + 1) % n, 0); out.at.push(s); }
  }
  return out;
}

/** Samples kept in a grid, to find the one nearest a point quickly. */
class Near {
  private cells = new Map<number, number[]>();
  constructor(readonly ps: P[], readonly cell: number) {
    ps.forEach((p, k) => { const key = this.key(Math.floor(p.x / cell), Math.floor(p.y / cell)); (this.cells.get(key) ?? this.cells.set(key, []).get(key)!).push(k); });
  }
  private key = (x: number, y: number) => (x + 4096) * 8192 + y + 4096;
  /** The sample nearest `q` within `reach` units, or -1. */
  nearest(q: P, reach: number): number {
    const cx = Math.floor(q.x / this.cell), cy = Math.floor(q.y / this.cell), rings = Math.ceil(reach / this.cell);
    let best = -1, bd = reach;
    for (let r = 0; r <= rings; r++) {
      for (let y = cy - r; y <= cy + r; y++) {
        // the ring's cells: its top and bottom rows whole, the columns either side between them
        const edge = y === cy - r || y === cy + r;
        for (let x = cx - r; x <= cx + r; x += edge || !r ? 1 : 2 * r) {
          const ks = this.cells.get(this.key(x, y));
          if (!ks) continue;
          for (const k of ks) { const d = Math.hypot(this.ps[k].x - q.x, this.ps[k].y - q.y); if (d <= bd) { bd = d; best = k; } }
        }
      }
      // nothing in a further ring can be nearer than (r) cells away
      if (best >= 0 && bd <= r * this.cell) break;
    }
    return best;
  }
}

/** A whole contour's samples and their grid, kept while the contour is (each letter's contours are searched once for
    every change). */
const sampled = new WeakMap<Node[], { T: Samples; near: Near }>();
function samplesOf(con: Node[]) {
  let got = sampled.get(con);
  if (!got) { const T = sample(con, 0, con.length, STEP); got = { T, near: new Near(T.p, 12) }; sampled.set(con, got); }
  return got;
}

/* ---- finding the stretch in another letter */

/** A stretch of another letter's outline shaped as a change's was (or, for a whole contour, a contour shaped as it
    was): its contour; where the change's kept points `a` and `b` fall on it (segment and place along it), when they
    can be told; the map from the changed letter to it; where it runs round the contour (s0 to s1), how far off it is
    at most and could have been; and whether the outline round it is the same too (a whole contour: as high). */
export interface Place {
  c: number; ends: { A: { i: number; t: number }; B: { i: number; t: number } } | null; fit: Fit; s0: number; s1: number; off: number; tol: number; close: boolean
}
/** x' = sx x + tx, y' = sy y + ty: a stretch carried to another letter, a little wider or taller there perhaps. */
interface Fit { sx: number; sy: number; tx: number; ty: number }
const to = (f: Fit, p: P): P => ({ x: f.sx * p.x + f.tx, y: f.sy * p.y + f.ty });

/** How much wider, narrower, taller or shorter the same stretch may be in another letter. */
const SCALE_MIN = 0.72, SCALE_MAX = 1.4;
const STEP = 3; // units between samples

/** How much a piece of outline turns, all told, in radians: little for a straight edge or a gentle curve. */
function turning(p: P[]): number {
  let sum = 0;
  for (let k = 2; k < p.length; k++) {
    const a = Math.atan2(p[k - 1].y - p[k - 2].y, p[k - 1].x - p[k - 2].x), b = Math.atan2(p[k].y - p[k - 1].y, p[k].x - p[k - 1].x);
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    sum += Math.abs(d);
  }
  return sum;
}

/** How much a piece must turn to tell it apart from other outline: a straight edge or a gentle curve alone would be
    found all over (every flat top, every round), so the piece takes in more of the outline either side of it until
    it turns at least this much. */
const TURN = (2 * Math.PI) / 3;

/** How much further either side the outline round a place is compared, to tell a close match (the stretch and
    what it runs into: a serif and the stem under it, an arch and the stems either side) from one where only the
    stretch itself is the same (the top of an arch and the top of an o). */
const AROUND = 100;

/** How far from the points that changed the outline they're looked for by reaches, at most, towards the kept points
    either side: a stem running on from a serif's corner to the letter's foot is no part of the serif. */
const REACH = 80;

/** The outline a change is looked for by: the stretch as it was from `a` to `b` (no further than REACH from the
    points that changed), with some of the outline either side of it, at least 20 units and a quarter as long as
    the stretch, more where the stretch turns too little to be told apart (TURN), up to four points or 300 units
    either side; `around`, AROUND further each way; and how much of the stretch lies `before` and `after` it. */
function pieceOf(ch: Change) {
  const { was, a, b } = ch, n = was.length, span = (b - a + n) % n || n, K = Math.min(4, Math.floor((n - span) / 2));
  const all = sample(was, (a - K + n) % n, span + 2 * K, STEP), sA = all.at[K], sB = all.at[K + span];
  const c0 = span > 1 ? Math.max(sA, all.at[K + 1] - REACH) : sA, c1 = span > 1 ? Math.min(sB, all.at[K + span - 1] + REACH) : sB;
  const trim = (ctx: number) => all.s.map((s, k) => (s >= c0 - ctx && s <= c1 + ctx ? k : -1)).filter(k => k >= 0);
  let ctx = Math.max(20, Math.min(60, 0.25 * (c1 - c0))), keep = trim(ctx);
  while (ctx < 300 && turning(keep.map(k => all.p[k])) < TURN && (c0 - ctx > 0 || c1 + ctx < all.s[all.s.length - 1])) keep = trim((ctx += 20));
  const p = keep.map(k => all.p[k]), first = all.s[keep[0]], last = all.s[keep[keep.length - 1]], box = boxOf(p);
  const size = Math.max(box.w, box.h), around = trim(ctx + AROUND).filter((_, z) => z % 2 === 0).map(k => all.p[k]);
  return { p, size, len: last - first, tol: Math.max(6, 0.07 * size), around, before: Math.max(0, first - sA), after: Math.max(0, sB - last) };
}
type Piece = ReturnType<typeof pieceOf>;

/** The corner a change rounds, cuts or scoops otherwise, where it stays (null for a change that moves the outline). */
function cornerOf(ch: Change): Node | null {
  const i = (ch.a + 1) % ch.was.length, o = ch.was[i];
  return !ch.whole && ch.fresh.length === 1 && (ch.b - ch.a + ch.was.length) % ch.was.length === 2 && !o.s && sameAt(o, ch.fresh[0]) ? o : null;
}

/** Which way the outline comes into point i of a contour and leaves it, in radians: along its handles, or towards
    the points either side. */
function wayAt(con: Node[], i: number): [number, number] {
  const n = con.length, p = con[i], prev = con[(i - 1 + n) % n], next = con[(i + 1) % n];
  const back = hasIn(p) ? { x: p.ix!, y: p.iy! } : hasOut(prev) ? { x: prev.ox!, y: prev.oy! } : prev;
  const on = hasOut(p) ? { x: p.ox!, y: p.oy! } : hasIn(next) ? { x: next.ix!, y: next.iy! } : next;
  return [Math.atan2(p.y - back.y, p.x - back.x), Math.atan2(on.y - p.y, on.x - p.x)];
}
/** Whether two corners turn about alike: the outline coming in and going out each within 40° of the other's. */
const sameTurn = (a: [number, number], b: [number, number]) => a.every((v, k) => Math.abs(Math.atan2(Math.sin(v - b[k]), Math.cos(v - b[k]))) <= (40 * Math.PI) / 180);

/** Evenly spread picks of `k` items out of `n`. */
const spread = (n: number, k: number) => Array.from({ length: Math.min(n, k) }, (_, q) => Math.round((q * (n - 1)) / Math.max(1, Math.min(n, k) - 1)));

/** Where a piece's shape is found along one contour of another letter: each place it fits, best first, none
    overlapping. */
function placesIn(piece: Piece, ch: Change, con: Node[], c: number): Place[] {
  if (con.length < 2) return [];
  const { T, near } = samplesOf(con), per = T.s[T.s.length - 1], tol = piece.tol;
  const probe = spread(piece.p.length, 9), body = spread(piece.p.length, 36);
  // starting guesses: a point of the other letter where the change's kept points, or the points between, were (for
  // a corner rounded otherwise, only a corner of the other letter where that corner was: it is rounded in place)
  const was = ch.was, n = was.length, keys: number[] = [], corner = !!cornerOf(ch);
  for (let i = ch.a; ; i = (i + 1) % n) { keys.push(i); if (i === ch.b) break; }
  const found: Place[] = [], tried: P[] = [], reach = 3 * tol + 20, ps = body.map(j => piece.p[j]);
  for (let qi = 0; qi < con.length; qi++) for (const ki of keys) {
    const q = con[qi], k = was[ki];
    if (corner && !(!q.s && !k.s && sameTurn(wayAt(was, ki), wayAt(con, qi)))) continue;
    let f: Fit = { sx: 1, sy: 1, tx: q.x - k.x, ty: q.y - k.y };
    // a start next to one tried already ends up where that one did
    if (tried.some(t => Math.abs(t.x - f.tx) + Math.abs(t.y - f.ty) < tol / 2)) continue;
    tried.push({ x: f.tx, y: f.ty });
    // the piece's points about where they'd be: the further from the point it starts by, the more room a wider or
    // narrower stretch needs
    if (probe.some(j => near.nearest(to(f, piece.p[j]), tol + (1 - SCALE_MIN) * dist(piece.p[j], k)) < 0)) continue;
    // fitted closer, a few times over: first only moved, then wider or taller too; a start too far off to come
    // close is given up
    let qs: number[] = [], lost = false;
    for (let it = 0; it < 8 && !lost; it++) {
      qs = ps.map(p => near.nearest(to(f, p), reach));
      if (qs.some(j => j < 0)) { lost = true; break; }
      const ts = qs.map(j => T.p[j]), prev = f;
      if (it === 2 && Math.max(...ts.map((t, z) => dist(t, to(prev, ps[z])))) > 3 * tol) lost = true;
      f = it < 3 ? { ...f, tx: f.tx + avg(ts.map((t, z) => t.x - to(f, ps[z]).x)), ty: f.ty + avg(ts.map((t, z) => t.y - to(f, ps[z]).y)) }
        : { ...axisFit(ps.map(p => p.x), ts.map(t => t.x), f.sx, 'x'), ...axisFit(ps.map(p => p.y), ts.map(t => t.y), f.sy, 'y') } as Fit;
      if (it >= 3 && Math.abs(f.tx - prev.tx) + Math.abs(f.ty - prev.ty) < 0.2 && Math.abs(f.sx - prev.sx) + Math.abs(f.sy - prev.sy) < 0.002) break;
    }
    if (lost) continue;
    qs = ps.map(p => near.nearest(to(f, p), reach));
    if (qs.some(j => j < 0)) continue;
    const off = Math.max(...ps.map((p, z) => dist(to(f, p), T.p[qs[z]])));
    if (off > tol) continue;
    // along the other letter's outline the same way round, over about as long a stretch
    const along = unwrap(qs.map(j => T.s[j]), per);
    if (along.some((s, z) => z && s < along[z - 1] - tol)) continue;
    const s0 = along[0], s1 = along[along.length - 1], scale = (f.sx + f.sy) / 2;
    if (s1 - s0 < 0.6 * piece.len * scale || s1 - s0 > 1.6 * piece.len * scale) continue;
    // and the other letter's stretch keeps as close to the piece: nothing there the piece doesn't have
    const mine = piece.p.map(p => to(f, p)), back = new Near(mine, 12);
    let stray = false;
    for (let s = s0; s <= s1 && !stray; s += STEP) { const j = atArc(T, s, per); if (back.nearest(T.p[j], tol) < 0) stray = true; }
    if (stray) continue;
    // where the change's kept points fall, in that order: on the stretch, or on the outline running on from it as far
    // again as they were from the piece (when there's no telling, the change can still move the same points there)
    const A = onStretch(T, to(f, was[ch.a]), s0 - 1.5 * scale * piece.before - 2 * tol, s1, per);
    const B = onStretch(T, to(f, was[ch.b]), s0, s1 + 1.5 * scale * piece.after + 2 * tol, per);
    const ends = A.d <= 1.5 * tol && B.d <= 1.5 * tol && B.s > A.s ? { A: { i: T.i[A.j], t: T.t[A.j] }, B: { i: T.i[B.j], t: T.t[B.j] } } : null;
    // a close match when the outline round it is the same too (a little more loosely)
    const close = piece.around.every(v => near.nearest(to(f, v), 1.5 * tol) >= 0);
    found.push({ c, ends, fit: f, s0, s1, off, tol, close });
  }
  // best first (close matches before the rest), and none on the same stretch as a better one
  found.sort((p, q) => Number(q.close) - Number(p.close) || p.off - q.off);
  const out: Place[] = [];
  for (const p of found) if (!out.some(o => overlaps(o, p, per))) out.push(p);
  return out;
}

const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

/** Least squares for q = s p + t along one axis, s kept to SCALE_MIN..SCALE_MAX; where the piece hardly spans
    the axis, its scale there stays as it was. */
function axisFit(p: number[], q: number[], s0: number, axis: 'x' | 'y'): Partial<Fit> {
  const mp = avg(p), mq = avg(q);
  let vp = 0, cv = 0;
  p.forEach((v, k) => { vp += (v - mp) ** 2; cv += (v - mp) * (q[k] - mq); });
  let s = vp / p.length > 100 ? cv / vp : s0;
  s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, s));
  return axis === 'x' ? { sx: s, tx: mq - s * mp } : { sy: s, ty: mq - s * mp };
}

/** Distances round a closed outline, made to run on from the first without jumping back at its start. */
function unwrap(s: number[], per: number): number[] {
  const out = [s[0]];
  for (let k = 1; k < s.length; k++) {
    let v = s[k];
    while (v < out[k - 1] - per / 2) v += per;
    while (v > out[k - 1] + per / 2) v -= per;
    out.push(v);
  }
  return out;
}
/** The sample at distance `s` round the outline. */
function atArc(T: Samples, s: number, per: number): number {
  const v = ((s % per) + per) % per;
  let lo = 0, hi = T.s.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (T.s[mid] < v) lo = mid + 1; else hi = mid; }
  return lo;
}
/** The sample of the outline from s0 to s1 round it nearest `q`: which, how far along, and how far from `q`. */
function onStretch(T: Samples, q: P, s0: number, s1: number, per: number): { j: number; s: number; d: number } {
  let best = { j: atArc(T, s0, per), s: s0, d: Infinity };
  for (let s = s0; s <= s1 + 1e-6; s += STEP / 2) {
    const j = atArc(T, s, per), d = dist(T.p[j], q);
    if (d < best.d) best = { j, s, d };
  }
  return best;
}
const overlaps = (p: Place, q: Place, per: number) => {
  if (p.c !== q.c) return false;
  const [a0, a1] = [p.s0, p.s1], shift = Math.round((q.s0 - a0) / per) * per, b0 = q.s0 - shift, b1 = q.s1 - shift;
  return a0 < b1 && b0 < a1;
};

/** Twice the area a closed run of points goes round, positive anticlockwise: which way a contour is wound. */
const woundOf = (ps: P[]) => ps.reduce((sum, p, k) => { const q = ps[(k + 1) % ps.length]; return sum + p.x * q.y - q.x * p.y; }, 0);
/** How far, at most, any of `ps` is from the nearest of the samples `near` holds (Infinity past `reach`). */
function furthest(ps: P[], near: Near, reach: number): number {
  let worst = 0;
  for (const p of ps) { const k = near.nearest(p, reach); if (k < 0) return Infinity; worst = Math.max(worst, dist(p, near.ps[k])); }
  return worst;
}

/** The contours of `doc` shaped as a whole contour that changed was, wound the same way (a counter is found among
    counters), a little wider or narrower, taller or shorter perhaps: fitted by their boxes, then closer, then
    every part of each within a few units of the other's outline. Close where it sits about as high, its top and
    bottom each within half its height (80 units at most) of where the changed one's were: two dots drawn by hand,
    not a dot and a full stop. */
function wholesIn(ch: Change, doc: Drawn): Place[] {
  const A = sample(ch.was, 0, ch.was.length, STEP), a = boxOf(A.p), size = Math.max(a.w, a.h), tol = Math.max(6, 0.07 * size);
  const ps = spread(A.p.length, 48).map(k => A.p[k]), wound = Math.sign(woundOf(A.p));
  const out: Place[] = [];
  doc.contours.forEach((con, c) => {
    if (con.length < 2) return;
    const { T, near } = samplesOf(con), t = boxOf(T.p);
    if (Math.sign(woundOf(T.p)) !== wound) return;
    // a box hardly any wide (or tall) can't tell how much wider it is: as much as it is taller (or wider), then
    const kx = a.w > 20 ? t.w / a.w : NaN, ky = a.h > 20 ? t.h / a.h : NaN, sx = Number.isNaN(kx) ? ky : kx, sy = Number.isNaN(ky) ? kx : ky;
    if (!(sx >= SCALE_MIN && sx <= SCALE_MAX && sy >= SCALE_MIN && sy <= SCALE_MAX)) return;
    let f: Fit = { sx, sy, tx: t.x0 - sx * a.x0, ty: t.y0 - sy * a.y0 };
    for (let it = 0; it < 3; it++) {
      const qs = ps.map(p => near.nearest(to(f, p), 3 * tol));
      if (qs.some(j => j < 0)) break;
      const ts = qs.map(j => T.p[j]);
      f = { ...axisFit(ps.map(p => p.x), ts.map(q => q.x), f.sx, 'x'), ...axisFit(ps.map(p => p.y), ts.map(q => q.y), f.sy, 'y') } as Fit;
    }
    const mine = A.p.map(p => to(f, p)), off = Math.max(furthest(mine, near, tol + STEP), furthest(T.p, new Near(mine, 12), tol + STEP));
    if (off > tol + STEP / 2) return;
    const per = T.s[T.s.length - 1], high = Math.max(1.5 * tol, Math.min(a.h / 2, 80)), close = Math.abs(t.y0 - a.y0) <= high && Math.abs(t.y1 - a.y1) <= high;
    out.push({ c, ends: null, fit: f, s0: 0, s1: per, off, tol, close });
  });
  return out;
}

/** Every place a change's old shape is found in `doc`, best first. */
export function placesOf(ch: Change, doc: Drawn): Place[] {
  if (ch.whole) return wholesIn(ch, doc).sort((p, q) => Number(q.close) - Number(p.close) || p.off - q.off);
  const piece = pieceOf(ch);
  if (piece.p.length < 4) return [];
  return doc.contours.flatMap((con, c) => placesIn(piece, ch, con, c)).sort((p, q) => Number(q.close) - Number(p.close) || p.off - q.off);
}

/* ---- putting the new stretch in */

/** Split the curve from point i at t, as the curve was; the new point comes after i, and is returned. */
function cutAt(con: Node[], i: number, t: number): Node {
  const a = con[i], b = con[(i + 1) % con.length], s = segment(a, b);
  let m: Node;
  if (!s) m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  else {
    const L = (p: P, q: P): P => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    const p01 = L(s[0], s[1]), p12 = L(s[1], s[2]), p23 = L(s[2], s[3]), p012 = L(p01, p12), p123 = L(p12, p23), mid = L(p012, p123);
    if (hasOut(a)) { a.ox = p01.x; a.oy = p01.y; }
    if (hasIn(b)) { b.ix = p23.x; b.iy = p23.y; }
    m = { x: mid.x, y: mid.y, ix: p012.x, iy: p012.y, ox: p123.x, oy: p123.y, s: 1 };
  }
  con.splice(i + 1, 0, m);
  return m;
}

/** For points `want` (in order), the run of a contour's points in a row each within `tol` of its own, or null. */
function sameRow(con: Node[], want: P[], tol: number): number[] | null {
  if (!want.length || want.length > con.length) return null;
  const n = con.length;
  let best: number[] | null = null, bd = Infinity;
  for (let i = 0; i < n; i++) {
    let worst = 0;
    for (let z = 0; z < want.length && worst <= tol; z++) worst = Math.max(worst, dist(con[(i + z) % n], want[z]));
    if (worst <= tol && worst < bd) { bd = worst; best = want.map((_, z) => (i + z) % n); }
  }
  return best;
}

/** Point `n` (in place, in another letter) moved as the changed letter's `o` became `e`, by as much, scaled by the
    fit: its handles too, where both have them, else as `e`'s are; and rounded, smooth or not as `e` is. */
function moveLike(n: Node, o: Node, e: Node, f: Fit) {
  const by = (v: number, w0: number, w1: number, k: number) => R(v + k * (w1 - w0));
  n.x = by(n.x, o.x, e.x, f.sx); n.y = by(n.y, o.y, e.y, f.sy);
  for (const [h, hx, hy] of [['i', 'ix', 'iy'], ['o', 'ox', 'oy']] as const) {
    const had = h === 'i' ? hasIn(o) : hasOut(o), has = h === 'i' ? hasIn(e) : hasOut(e), mine = h === 'i' ? hasIn(n) : hasOut(n);
    if (had && has && mine) { n[hx] = by(n[hx]!, o[hx]!, e[hx]!, f.sx); n[hy] = by(n[hy]!, o[hy]!, e[hy]!, f.sy); }
    else if (has) { n[hx] = R(n.x + f.sx * (e[hx]! - e.x)); n[hy] = R(n.y + f.sy * (e[hy]! - e.y)); }
    else { delete n[hx]; delete n[hy]; }
  }
  if (e.s) n.s = 1; else delete n.s;
  if (e.r) n.r = e.r; else delete n.r;
  if (e.corner) n.corner = e.corner; else delete n.corner;
}

/** A contour with a change put in at each of `places` (on this contour, none overlapping). */
function spliced(con0: Node[], ch: Change, places: Place[]): Node[] {
  const con = con0.map(n => ({ ...n })), corner = cornerOf(ch);
  // a corner rounded otherwise: the other letter's corner there (the nearest, a little further off allowed) is rounded
  // as it was, and nothing else of it changes
  if (corner) {
    const e = ch.fresh[0];
    for (const p of places) {
      const v = to(p.fit, corner);
      let best: Node | null = null, bd = 2 * p.tol;
      for (const n of con) if (!n.s && dist(n, v) <= bd) { best = n; bd = dist(n, v); }
      if (!best) continue;
      if (e.r) best.r = e.r; else delete best.r;
      if (e.corner) best.corner = e.corner; else delete best.corner;
    }
    return con;
  }
  const { was, a, b, fresh } = ch, A0 = was[a], B0 = was[b], olds: Node[] = [];
  for (let i = (a + 1) % was.length; i !== b; i = (i + 1) % was.length) olds.push(was[i]);
  // where the letter has the same points as the changed one had, in a row, each where it was: each moves by as much
  // as its own did, keeping the letter's own small differences
  const rest: Place[] = [];
  for (const p of places) {
    const f = p.fit, row = olds.length === fresh.length ? sameRow(con, olds.map(o => to(f, o)), p.tol) : null;
    if (!row) { if (p.ends) rest.push(p); continue; }
    row.forEach((at, z) => moveLike(con[at], olds[z], fresh[z], f));
  }
  // elsewhere the stretch between the kept points' places gives way to the new one: first those places become points,
  // a point already there (or nearly: within a third of how closely the shapes had to match), or the curve cut there
  type Cut = { i: number; t: number; near: number; node?: Node };
  const cuts: Cut[] = rest.flatMap(p => [{ ...p.ends!.A, near: Math.max(2, p.tol / 3) }, { ...p.ends!.B, near: Math.max(2, p.tol / 3) }]);
  const orig = con.slice();
  for (const c of cuts) {
    const p = orig[c.i], q = orig[(c.i + 1) % orig.length], at = bez(curveOf(p, q), c.t), dp = dist(at, p), dq = dist(at, q);
    if (Math.min(dp, dq) <= c.near) c.node = dp <= dq ? p : q;
  }
  // (cutting the curves from the furthest place along each back, so earlier places stay where they were)
  const bySeg = new Map<number, Cut[]>();
  for (const c of cuts) if (!c.node) (bySeg.get(c.i) ?? bySeg.set(c.i, []).get(c.i)!).push(c);
  for (const [i, cs] of [...bySeg].sort((p, q) => q[0] - p[0])) {
    cs.sort((p, q) => q.t - p.t);
    let end = 1;
    for (const c of cs) {
      const at = con.indexOf(orig[i]);
      if (c.t >= end - 1e-6) { c.node = con[(at + 1) % con.length]; continue; }
      c.node = cutAt(con, at, c.t / end);
      end = c.t;
    }
  }
  rest.forEach((p, k) => {
    const An = cuts[2 * k].node!, Bn = cuts[2 * k + 1].node!, f = p.fit, iA = con.indexOf(An), iB = con.indexOf(Bn);
    if (iA < 0 || iB < 0 || iA === iB) return;
    // the new points, fitted between the two places
    const eA = { x: An.x - to(f, A0).x, y: An.y - to(f, A0).y }, eB = { x: Bn.x - to(f, B0).x, y: Bn.y - to(f, B0).y };
    const map = (q: P, w: number) => { const v = to(f, q); return { x: R(v.x + eA.x + (eB.x - eA.x) * w), y: R(v.y + eA.y + (eB.y - eA.y) * w) }; };
    const put = fresh.map((n, z) => {
      const w = (z + 1) / (fresh.length + 1), o: Node = { ...n, ...map(n, w) };
      if (hasIn(n)) { const h = map({ x: n.ix!, y: n.iy! }, w); o.ix = h.x; o.iy = h.y; }
      if (hasOut(n)) { const h = map({ x: n.ox!, y: n.oy! }, w); o.ox = h.x; o.oy = h.y; }
      return o;
    });
    // the kept points' handles into the stretch, as the changed letter has them
    if (hasOut(A0)) { const h = to(f, { x: A0.ox!, y: A0.oy! }); An.ox = R(h.x + eA.x); An.oy = R(h.y + eA.y); } else { delete An.ox; delete An.oy; }
    if (hasIn(B0)) { const h = to(f, { x: B0.ix!, y: B0.iy! }); Bn.ix = R(h.x + eB.x); Bn.iy = R(h.y + eB.y); } else { delete Bn.ix; delete Bn.iy; }
    if (!A0.s) delete An.s;
    if (!B0.s) delete Bn.s;
    if (iA < iB) con.splice(iA + 1, iB - iA - 1, ...put);
    else { con.splice(iA + 1, con.length - iA - 1, ...put); con.splice(0, iB); }
  });
  return con;
}

/** A contour shaped as a whole one that changed was, as that one is now (null where it was taken away): each point
    moved by as much as its own, where it has the same points, else the new contour, fitted to it. */
function replaced(con: Node[], ch: Change, p: Place): Node[] | null {
  const { was, fresh } = ch, f = p.fit;
  if (!fresh.length) return null;
  const row = fresh.length === was.length && con.length === was.length ? sameRow(con, was.map(o => to(f, o)), p.tol) : null;
  if (row) { const out = con.map(n => ({ ...n })); row.forEach((at, z) => moveLike(out[at], was[z], fresh[z], f)); return out; }
  return fresh.map(n => {
    const o: Node = { ...n, ...map(n) };
    if (hasIn(n)) { const h = map({ x: n.ix!, y: n.iy! }); o.ix = h.x; o.iy = h.y; }
    if (hasOut(n)) { const h = map({ x: n.ox!, y: n.oy! }); o.ox = h.x; o.oy = h.y; }
    return o;
  });
  function map(q: P) { const v = to(f, q); return { x: R(v.x), y: R(v.y) }; }
}

/** `doc` with the change put in at each of `places`. */
export function carryInto(ch: Change, doc: Drawn, places: Place[]): Drawn {
  if (ch.whole) return { adv: doc.adv, contours: doc.contours.flatMap((con, c) => { const p = places.find(q => q.c === c), r = p ? replaced(con, ch, p) : con; return r ? [r] : []; }) };
  return { adv: doc.adv, contours: doc.contours.map((con, c) => { const here = places.filter(p => p.c === c); return here.length ? spliced(con, ch, here) : con; }) };
}

/** Small letters, capitals, figures, or the rest. */
export const kindOf = (ch: string) => (/[a-z]/.test(ch) ? 'a' : /[A-Z]/.test(ch) ? 'A' : /[0-9]/.test(ch) ? '0' : '.');

/** The corners drawn round, cut or scooped in an outline, where and how much. */
const roundsOf = (cs: Node[][]) => cs.flat().filter(n => n.r).map(n => `${R(n.x)},${R(n.y)},${R(n.r!)},${n.corner ?? ''}`).sort().join(' ');

/** Whether two outlines draw the same within `tol` units: each contour's samples that near the other's outline, and
    the same corners rounded. */
function looksSame(p: Node[][], q: Node[][], tol = 1): boolean {
  if (p.length !== q.length || roundsOf(p) !== roundsOf(q)) return false;
  const within = (a: Samples, b: Samples, nb: Near) => a.p.every(v => {
    const k = nb.nearest(v, tol + STEP);
    return k >= 0 && [k - 1, k].some(j => j >= 0 && j + 1 < b.p.length && toSeg(v, b.p[j], b.p[j + 1]) <= tol);
  });
  return p.every((con, c) => {
    if (con === q[c]) return true;
    if (con.length < 2 || q[c].length < 2) return con.length === q[c].length;
    const a = sample(con, 0, con.length, STEP), b = sample(q[c], 0, q[c].length, STEP);
    return within(a, b, new Near(b.p, 12)) && within(b, a, new Near(a.p, 12));
  });
}
/** How far `v` is from the straight piece from `a` to `b`. */
function toSeg(v: P, a: P, b: P): number {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((v.x - a.x) * dx + (v.y - a.y) * dy) / l)) : 0;
  return Math.hypot(v.x - a.x - t * dx, v.y - a.y - t * dy);
}

/** Another letter a change can be carried to: its outline as it was and with the change in, in how many places, and
    whether the outline round any of them is the same as round the change too (a close match). */
export interface Carried { ch: string; was: Drawn; doc: Drawn; places: number; close: boolean }

/** Whether a place found in the changed letter itself is where the change was made: the contour it became, or
    outline running into the stretch between the change's kept points (found again, perhaps fitted wider). */
function madeAt(ch: Change, p: Place, doc: Drawn): boolean {
  const con = doc.contours[p.c];
  if (ch.whole) return sameContour(con, ch.fresh);
  const A = con.findIndex(n => sameAt(n, ch.was[ch.a])), B = con.findIndex(n => sameAt(n, ch.was[ch.b]));
  if (A < 0 || B < 0) return false;
  const { T } = samplesOf(con), per = T.s[T.s.length - 1], s0 = T.at[A], s1 = T.at[B] > s0 ? T.at[B] : T.at[B] + per;
  return overlaps(p, { ...p, s0, s1 }, per);
}

/** Letter `ch`'s outline `doc` with `changes` carried to every place shaped as they were, or null where there's none
    (or where it already looks as the change would leave it). With `own`, `doc` is the changed letter itself as it
    is now, and the change goes to its other places shaped the same (an n's other foot, a colon's other dot), not
    again where it was made. */
export function carryLetter(changes: Change[], ch: string, doc: Drawn, own = false): Carried | null {
  let out = doc, n = 0, close = false;
  // each change in turn, found again in the letter as the ones before left it
  for (const c of changes) {
    const places = placesOf(c, out).filter(p => !own || !madeAt(c, p, out));
    if (!places.length) continue;
    out = carryInto(c, out, places);
    n += places.length;
    close ||= places.some(p => p.close);
  }
  return n && !looksSame(doc.contours, out.contours) ? { ch, was: doc, doc: out, places: n, close } : null;
}

/** The letters with the shape `base` had where it differs from `now`, each with the change carried to it: `ch`
    itself (as it is now, at its other places) and the others; outlines are read by `outlineOf` (null for a letter
    there isn't). */
export function carryChange(ch: string, base: Node[][], now: Node[][], outlineOf: (ch: string) => Drawn | null): Carried[] {
  const changes = changesOf(base, now);
  if (!changes.length) return [];
  const out: Carried[] = [];
  for (const o of ALL_CHARS) {
    const own = o === ch, was = outlineOf(o), doc = own && was ? { adv: was.adv, contours: now } : was;
    const got = doc && doc.contours.length ? carryLetter(changes, o, doc, own) : null;
    if (got) out.push(got);
  }
  return out;
}
