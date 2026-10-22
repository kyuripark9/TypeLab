/* A lighter weight's outline run smooth at the scale its sides moved in (fairMoved in skin.ts): the waves, kinks, knots
   and nicks the thinning leaves along its edges and at its joins smoothed away; each corner the design draws kept sharp,
   and a crotch drawn again where its two sides meet; no further out into the paper than half a stroke, each ring's ink
   as it was, and no crossing the outline didn't have. */
import { signedArea } from './geom';
import { fitOutline, type Node } from './outline';

type P = { x: number; y: number };

/** How sharply (radians) an outline turns within a few units for a corner: kept where the design has one there, or
    where it runs regular (no wave) on either side for a while; smoothed away anywhere else. */
const CORNER_TURN = 0.6;
/** How much more or less ink a ring may come out with (a share of its own) and be kept so; and how many strokes across
    (squared) a ring left as it is lies within. */
const SAME_INK = 0.3, SMALL = 2;
/** The spacing the outline is read at, in font units, and how close a ring whose curves crossed is traced again. */
const STEP = 1.5, FIT_CLOSE = 0.5;

export interface FairOpts {
  /** how wide (font units along the outline) the smoothing is: a bell this wide; nothing smoothed under half a unit */
  sigma: number;
  /** the design's corners where the move puts them, and how near a corner of the outline must lie to one to be it */
  corners: P[]; near: number;
  /** the stroke's thickness now, for the dots and pinholes left as they are */
  stroke: number;
}

/** The outline (each contour with the ring it was traced from, where known) run smooth; its rings beside it. */
export function fairLighter(out: Node[][], rings: (P[] | undefined)[], o: FairOpts): { out: Node[][]; rings: P[][] } | null {
  if (o.sigma < 0.5) return null;
  const read = out.map((c, i) => even(rings[i] ?? flat(c), STEP));
  // (each corner of the outline, its sharpest turn within a few units, and which of them stay)
  const reach = Math.max(2, Math.round(Math.min(o.sigma, 6) / STEP));
  const turns = read.map(r => (r.length < 8 ? new Float64Array(r.length) : turnsAt(r, reach)));
  // (a point turning sharply on its own, a serif's tip's two corners a unit or two apart, each; or one turning further
  // than those near it, as the outline turns there over a few points)
  const cands = read.map((r, ri) => {
    if (r.length < 8) return [];
    const own = r.map((_, i) => i).filter(i => Math.abs(turnsAt1(r, i)) >= CORNER_TURN);
    return [...own, ...peaks(turns[ri], reach).filter(i => Math.abs(turns[ri][i]) >= CORNER_TURN && !own.some(j => Math.abs(j - i) <= reach || Math.abs(j - i) >= r.length - reach))];
  });
  const kept = read.map(() => new Set<number>());
  // (the design's: each paired with the nearest corner within `near` no nearer one of the design's took, the nearest
  // pairs first: each taking its nearest, a serif's tip's two corners took one, and the other ran smooth to a needle)
  const pairs: { d: number; D: number; ri: number; i: number }[] = [];
  o.corners.forEach((D, di) => {
    for (let ri = 0; ri < read.length; ri++) for (const i of cands[ri]) {
      const d = Math.hypot(read[ri][i].x - D.x, read[ri][i].y - D.y);
      if (d <= o.near) pairs.push({ d, D: di, ri, i });
    }
  });
  pairs.sort((a, b) => a.d - b.d);
  const tookD = new Set<number>();
  for (const q of pairs) if (!tookD.has(q.D) && !kept[q.ri].has(q.i)) { tookD.add(q.D); kept[q.ri].add(q.i); }
  // (and one the outline runs into and out of regular, no wave either side for twice the smoothing: where two strokes
  // thinned meet in a crotch the design rounds)
  const run = Math.max(reach * 2, Math.round((2 * o.sigma) / STEP));
  for (let ri = 0; ri < read.length; ri++) for (const i of cands[ri]) if (regular(turns[ri], i, -1, run, reach) && regular(turns[ri], i, 1, run, reach)) kept[ri].add(i);
  // (each ring run smooth, a corner the outline turns into the paper at (a crotch) drawn again where its sides meet; one
  // less than SMALL strokes square, a dot or a pinhole, as it is, which tidyRings has closed or kept as it shrinks: run
  // smooth to nothing at once, a Cathedral's s's corner pinched off its counter took a tenth of its ink in a step of Weight)
  const s = o.sigma / STEP, lead = Math.sign(signedArea(read.reduce((a, r) => (Math.abs(signedArea(r)) > Math.abs(signedArea(a)) ? r : a), read[0] ?? [])));
  const maps = read.map((r, ri) => (r.length < 8 || Math.abs(signedArea(r)) < (SMALL * o.stroke) ** 2 ? null : smoothMap(r, [...kept[ri]].sort((a, b) => a - b), s, c => turns[ri][c] * lead < 0)));
  // (where run smooth it goes out into the paper further than OUT_MOST of a stroke, drawn back toward the outline as it
  // was, by as much, and evenly along it: a crotch, or a stem's side running into a hairline serif, not kept as a corner,
  // filled to the bell's width, a bracket on a Didone's r's foot, a web between two thin strokes; each point held to it
  // alone, the outline there ran on as it was, ragged, only further out)
  const phi = read.map((r, ri) => outHeld(r, maps[ri], OUT_MOST * o.stroke, lead > 0, s));
  // (and each ring's ink as it was, its outline moved out or in along it evenly by as much as that takes: run smooth, a
  // hairline thinned a little and a crotch filled a little, as the outline ran there, and a Didone's r 4% lighter a hair
  // below Weight 0.1 and 1% heavier at it, its step there twice as tall)
  const inked = (ri: number) => { const a = assemble(read[ri], maps[ri], phi[ri]); return maps[ri] ? { pts: sameInk(a.pts, signedArea(read[ri]), INK_MOST * o.stroke), idx: a.idx } : a; };
  let rings2 = read.map((_, ri) => inked(ri));
  // (and where the outline so run crosses itself or another, its sides drawn nearer as they were about the crossing,
  // and failing that left as it was: a hairline's sides each run smooth crossed, a Didone's q's bowl parted from its
  // stem, its counter one with the paper; not where the outline crossed before)
  const was = crossings(read.map(r => ({ pts: r })));
  const old = (c: { x: number; y: number }) => was.some(w => Math.hypot(w.x - c.x, w.y - c.y) < 2 * o.sigma);
  for (let pass = 0; pass <= UNCROSS_PASSES; pass++) {
    const xs = crossings(rings2).filter(c => !old(c));
    if (!xs.length) break;
    const hit = new Set<number>();
    for (const c of xs) for (const [ri, k] of [[c.a, c.k], [c.b, c.l]]) {
      hit.add(ri);
      const n = read[ri].length, at = rings2[ri].idx[k], w = Math.max(2, Math.ceil(2 * s));
      for (let d = -w; d <= w; d++) { const j = (at + d + n) % n; phi[ri][j] = pass === UNCROSS_PASSES ? 0 : Math.min(phi[ri][j], (Math.abs(d) / w) ** 2); }
    }
    if (pass === UNCROSS_PASSES) for (const ri of hit) phi[ri].fill(0);
    for (const ri of hit) rings2[ri] = inked(ri);
  }
  // (a ring that comes out other than it was, turned inside out or a third more or less ink, left as it was)
  const smooth = rings2.map(({ pts: q }, ri) => {
    if (!maps[ri]) return null;
    const a0 = signedArea(read[ri]), a1 = signedArea(q);
    return Math.sign(a0) === Math.sign(a1) && Math.abs(a1 - a0) <= SAME_INK * Math.abs(a0) ? q : null;
  });
  // (each ring run smooth traced into curves again; a ring whose curves cross where the outline's didn't traced again
  // closer, FIT_CLOSE, and failing that left as it was: between points STEP apart a curve bows out a unit or two, across
  // a fat face's hairline to its other side)
  const fit = (r: P[], tol: number) => fitOutline([...r.map((p, i): [string, ...number[]] => [i ? 'L' : 'M', p.x, p.y]), ['Z']], tol);
  const traced = smooth.map(r => (r ? fit(r, 1.2) : null));
  const crossed = () => {
    const all = out.flatMap((c, ri) => (traced[ri] ?? [c]).map(cn => ({ ri, pts: flat(cn) })));
    return new Set(crossings(all).filter(c => !old(c)).flatMap(c => [all[c.a].ri, all[c.b].ri]));
  };
  const again = crossed();
  if (again.size) {
    for (const ri of again) if (smooth[ri]) traced[ri] = fit(smooth[ri]!, FIT_CLOSE);
    for (const ri of crossed()) traced[ri] = null;
  }
  const cs: Node[][] = [], rs: P[][] = [];
  out.forEach((c, ri) => {
    if (!traced[ri]) { cs.push(c); rs.push(rings[ri] ?? flat(c)); return; }
    for (const cn of traced[ri]!) { cs.push(cn); rs.push(smooth[ri]!); }
  });
  return { out: cs, rings: rs };
}

/** A contour as a polygon, its curves cut in 12. */
function flat(c: Node[]): P[] {
  return c.flatMap((a, i) => {
    const b = c[(i + 1) % c.length];
    if (a.ox === undefined && b.ix === undefined) return [{ x: a.x, y: a.y }];
    const p1 = { x: a.ox ?? a.x, y: a.oy ?? a.y }, p2 = { x: b.ix ?? b.x, y: b.iy ?? b.y };
    return Array.from({ length: 12 }, (_, k) => {
      const t = k / 12, u = 1 - t;
      return { x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y };
    });
  });
}

/** A closed polygon read again about every `h` units along it, each of its points that turns by SHARP_POINT or more
    kept as it is (read evenly through, a serif's tip at Thin, three units across, lost its corners, a needle). */
function even(r: P[], h: number): P[] {
  const n0 = r.length, q = r.filter((p, i) => Math.hypot(r[(i + 1) % n0].x - p.x, r[(i + 1) % n0].y - p.y) > 1e-6), n = q.length;
  if (n < 3) return q;
  const sharp: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = q[(i - 1 + n) % n], b = q[i], c = q[(i + 1) % n], ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    if (Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) >= SHARP_POINT) sharp.push(i);
  }
  // (each run from one sharp point to the next, or the whole ring from its first point, cut evenly)
  const starts = sharp.length ? sharp : [0], out: P[] = [];
  for (let s = 0; s < starts.length; s++) {
    const i0 = starts[s], i1 = sharp.length ? starts[(s + 1) % starts.length] : i0, pts: P[] = [q[i0]];
    for (let i = (i0 + 1) % n; i !== i1; i = (i + 1) % n) pts.push(q[i]);
    pts.push(q[i1]);
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = L[L.length - 1], m = Math.max(1, Math.round(total / h));
    for (let k = 0, j = 0; k < m; k++) {
      const d = (k * total) / m;
      while (j < L.length - 2 && L[j + 1] < d) j++;
      const a = pts[j], b = pts[j + 1], t = (d - L[j]) / (L[j + 1] - L[j] || 1);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
/** How sharply (radians) a point of the outline as traced turns to be kept as it is when it is read again. */
const SHARP_POINT = 0.35;

/** How far the outline turns at each point between the way in from `k` points back and the way out to `k` on
    (signed, radians). */
function turnsAt(r: P[], k: number): Float64Array {
  const n = r.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = r[(i - k + n) % n], b = r[i], c = r[(i + k) % n];
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    out[i] = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  }
  return out;
}

/** How far the outline turns at point i, from the way in to the way out (signed, radians). */
function turnsAt1(r: P[], i: number): number {
  const n = r.length, a = r[(i - 1 + n) % n], b = r[i], c = r[(i + 1) % n];
  const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

/** The points turning further than any within `k` either side. */
function peaks(t: Float64Array, k: number): number[] {
  const n = t.length, out: number[] = [];
  for (let i = 0; i < n; i++) {
    let top = true;
    for (let d = 1; d <= k && top; d++) if (Math.abs(t[(i + d) % n]) > Math.abs(t[i]) || Math.abs(t[(i - d + n) % n]) >= Math.abs(t[i])) top = false;
    if (top) out.push(i);
  }
  return out;
}

/** Whether the outline runs regular from point i `run` points one way, or on to the next corner if it comes after
    twice the corner's own turn: past the corner's own turn (`skip` points), no sharp turn, and no turning back and
    forth (a stroke's square end, short between its two corners, regular; a knot's turns, nearer, not). */
function regular(t: Float64Array, i: number, dir: number, run: number, skip: number): boolean {
  const n = t.length;
  let sum = 0, abs = 0;
  for (let d = skip + 1; d <= run; d++) {
    const v = t[(i + dir * d + 2 * n) % n] / skip;
    if (Math.abs(v) * skip > CORNER_TURN * 0.5) {
      if (d < 3 * skip) return false;
      break;
    }
    sum += v; abs += Math.abs(v);
  }
  return abs <= 1.3 * Math.abs(sum) + 0.15;
}

/** A run of points smoothed with a bell `s` points wide, as 2G − G·G of it (a round keeps its size): closed, or open
    with its ends free (the bell cut short at them). The bell is three boxes run one after another, each read off running
    sums, so as quick however wide. */
function bell(q: P[], s: number, closed: boolean): P[] {
  const n = q.length, h = Math.min(closed ? (n - 1) >> 1 : n - 1, Math.round((Math.sqrt(4 * s * s + 1) - 1) / 2));
  if (s < 0.3 || h < 1) return q;
  const xs = Float64Array.from(q, p => p.x), ys = Float64Array.from(q, p => p.y);
  const G = (vx: Float64Array, vy: Float64Array) => {
    let ax = vx, ay = vy;
    for (let pass = 0; pass < 3; pass++) { ax = box(ax, h, closed); ay = box(ay, h, closed); }
    return [ax, ay];
  };
  const [ax, ay] = G(xs, ys), [bx, by] = G(ax, ay);
  // (by an open run's ends G alone: 2G − G·G there runs its ends on past where they were, a stroke's end drawn longer)
  const w = (i: number) => (closed ? 1 : Math.min(1, Math.min(i, n - 1 - i) / (2 * s)));
  return q.map((_, i) => ({ x: ax[i] + (ax[i] - bx[i]) * w(i), y: ay[i] + (ay[i] - by[i]) * w(i) }));
}
/** Each value the mean of those within `h` either side: round a closed run, or cut short at an open run's ends. */
function box(v: Float64Array, h: number, closed: boolean): Float64Array {
  const n = v.length, out = new Float64Array(n), S = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) S[i + 1] = S[i] + v[i];
  const sum = (a: number, b: number) => S[b + 1] - S[a];
  for (let i = 0; i < n; i++) {
    if (closed) {
      const a = i - h, b = i + h;
      let t = 0;
      if (a < 0) t += sum(n + a, n - 1) + sum(0, b);
      else if (b >= n) t += sum(a, n - 1) + sum(0, b - n);
      else t += sum(a, b);
      out[i] = t / (2 * h + 1);
    } else {
      const a = Math.max(0, i - h), b = Math.min(n - 1, i + h);
      out[i] = sum(a, b) / (b - a + 1);
    }
  }
  return out;
}

/** A ring run smooth, point by point: where each point goes (`to`), or whether it is dropped, run past a corner drawn
    again (`drop`), and each corner drawn again (`meet`). */
interface SmoothMap { to: P[]; drop: Uint8Array; meet: (P | null)[] }

/** A closed polygon run smooth with a bell `s` points wide between the corners kept: each side smoothed to its end, and
    a corner the outline turns into the paper at (`crotch`) drawn again where its two sides, run on straight, meet (a
    knot at a crotch undone); any other corner, or one whose sides don't meet near it, stays, its sides coming back to it
    over the bell's width (a stroke's end's corner drawn again ran the stroke on, a needle, its room a step wider). */
function smoothMap(r: P[], keep: number[], s: number, crotch: (c: number) => boolean): SmoothMap {
  const n = r.length, drop = new Uint8Array(n), meet: (P | null)[] = r.map(() => null);
  if (s < 0.3) return { to: r, drop, meet };
  if (!keep.length) return { to: bell(r, s, true), drop, meet };
  const m = keep.length, to = r.slice();
  const sides = keep.map((c, k) => {
    const e = keep[(k + 1) % m], pts: P[] = [];
    for (let i = (c + 1) % n; i !== e; i = (i + 1) % n) pts.push(r[i]);
    return bell(pts, Math.min(s, pts.length / 3), false);
  });
  const ends = keep.map((c, k) => {
    const A = sides[(k - 1 + m) % m], B = sides[k], no = { a: A.length, b: 0, met: false };
    if (!crotch(c) || A.length < 3 || B.length < 3) return no;
    const q = Math.max(2, Math.min(Math.round(s / 2), A.length - 1, B.length - 1));
    const pa = A[A.length - 1], da = { x: pa.x - A[A.length - 1 - q].x, y: pa.y - A[A.length - 1 - q].y };
    const pb = B[0], db = { x: B[q].x - pb.x, y: B[q].y - pb.y };
    const cr = da.x * db.y - da.y * db.x, la = Math.hypot(da.x, da.y), lb = Math.hypot(db.x, db.y);
    if (!la || !lb || Math.abs(cr) < 0.26 * la * lb) return no;
    const t = ((pb.x - pa.x) * db.y - (pb.y - pa.y) * db.x) / cr, M = { x: pa.x + da.x * t, y: pa.y + da.y * t };
    if (Math.hypot(M.x - r[c].x, M.y - r[c].y) > Math.max(4, s * STEP * MEET_FAR)) return no;
    // (the sides' points run past the meet dropped: no more than the bell's width of either, the meet ahead of both)
    const u = ((pb.x - pa.x) * da.y - (pb.y - pa.y) * da.x) / cr, most = Math.ceil(2 * s);
    if (t < -0.5 || u > 0.5) return no;
    let a = A.length, b = 0;
    while (a > 1 && (A[a - 1].x - M.x) * da.x + (A[a - 1].y - M.y) * da.y >= 0) a--;
    while (b < B.length - 1 && (B[b].x - M.x) * db.x + (B[b].y - M.y) * db.y <= 0) b++;
    if (A.length - a > most || b > most) return no;
    meet[c] = M;
    return { a, b, met: true };
  });
  for (let k = 0; k < m; k++) {
    const E = ends[k], F = ends[(k + 1) % m], side = sides[k];
    for (let i = 0; i < side.length; i++) {
      const j = (keep[k] + 1 + i) % n;
      if (i < E.b || (F.met && i >= F.a)) drop[j] = 1;
      // (back to a corner kept where it was over the bell's width)
      const d = Math.min(E.met ? Infinity : i + 1, F.met ? Infinity : side.length - i), f = Math.min(1, d / s);
      to[j] = { x: r[j].x + (side[i].x - r[j].x) * f, y: r[j].y + (side[i].y - r[j].y) * f };
    }
  }
  return { to, drop, meet };
}

/** A ring moved out or in along it evenly (each point along its normal) by as much as takes its ink to `a0` (signed),
    no more than `most`. */
function sameInk(q: P[], a0: number, most: number): P[] {
  const n = q.length, a1 = signedArea(q);
  let per = 0;
  for (let i = 0; i < n; i++) per += Math.hypot(q[(i + 1) % n].x - q[i].x, q[(i + 1) % n].y - q[i].y);
  if (!per) return q;
  // (out of the ring's own inside: right of the way it runs when it runs anticlockwise, its area positive)
  const d = Math.max(-most, Math.min(most, (Math.abs(a0) - Math.abs(a1)) / per)), sg = Math.sign(a1);
  return q.map((p, i) => {
    const a = q[(i - 1 + n) % n], b = q[(i + 1) % n], l = Math.hypot(b.x - a.x, b.y - a.y);
    return l ? { x: p.x + (sg * (b.y - a.y) / l) * d, y: p.y + (sg * (a.x - b.x) / l) * d } : p;
  });
}
/** How far (a share of the stroke's thickness now) a ring is moved out or in to keep its ink. */
const INK_MOST = 0.25;

/** A ring as run smooth by its map, each point `phi` of the way from where it was (none, the ring as it was), with the
    index of the point each of its points was. */
function assemble(r: P[], m: SmoothMap | null, phi: Float64Array): { pts: P[]; idx: number[] } {
  if (!m) return { pts: r, idx: r.map((_, i) => i) };
  const pts: P[] = [], idx: number[] = [];
  for (let j = 0; j < r.length; j++) {
    if (m.drop[j] && phi[j] > 0.999) continue;
    const t = m.meet[j] ?? m.to[j], f = phi[j];
    pts.push({ x: r[j].x + (t.x - r[j].x) * f, y: r[j].y + (t.y - r[j].y) * f });
    idx.push(j);
  }
  return { pts, idx };
}

/** How far each point of a ring goes of the way its map takes it: no further out into the paper than `most` (the ink on
    the outline's left or right), the least of those within half the bell's width (`s` points) taken, and that run even
    along the outline over as far. */
function outHeld(r: P[], m: SmoothMap | null, most: number, left: boolean, s: number): Float64Array {
  const n = r.length, f = new Float64Array(n).fill(1);
  if (!m || most <= 0) return f;
  for (let j = 0; j < n; j++) {
    const t = m.meet[j] ?? m.to[j], a = r[(j - 1 + n) % n], b = r[(j + 1) % n], tl = Math.hypot(b.x - a.x, b.y - a.y);
    if (!tl) continue;
    // (the way out of the ink: right of the way the outline runs when the ink is on its left)
    const e = ((t.x - r[j].x) * (left ? b.y - a.y : a.y - b.y) + (t.y - r[j].y) * (left ? a.x - b.x : b.x - a.x)) / tl;
    if (e > most) f[j] = most / e;
  }
  const w = Math.max(1, Math.ceil(s / 2));
  if (f.every(v => v === 1)) return f;
  const low = Float64Array.from(f, (_, j) => { let v = 1; for (let d = -w; d <= w; d++) v = Math.min(v, f[(j + d + n) % n]); return v; });
  return box(low, Math.min(w, (n - 1) >> 1), true);
}
/** How far (a share of the stroke's thickness now) a point run smooth may go out into the paper. */
const OUT_MOST = 0.5;

/** Where rings cross themselves or each other: each crossing's two edges (ring a's from point k, ring b's from l) and
    where they cross, read on a grid of CROSS_CELL units. */
function crossings(rings: { pts: P[] }[]): { a: number; k: number; b: number; l: number; x: number; y: number }[] {
  const cells = new Map<number, [number, number][]>(), out: { a: number; k: number; b: number; l: number; x: number; y: number }[] = [];
  const key = (x: number, y: number) => (x + 4096) * 8192 + (y + 4096);
  rings.forEach(({ pts }, a) => {
    const n = pts.length;
    for (let k = 0; k < n; k++) {
      const p = pts[k], q = pts[(k + 1) % n];
      const x0 = Math.floor(Math.min(p.x, q.x) / CROSS_CELL), x1 = Math.floor(Math.max(p.x, q.x) / CROSS_CELL);
      const y0 = Math.floor(Math.min(p.y, q.y) / CROSS_CELL), y1 = Math.floor(Math.max(p.y, q.y) / CROSS_CELL);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const c = key(x, y), list = cells.get(c);
        if (list) list.push([a, k]); else cells.set(c, [[a, k]]);
      }
    }
  });
  // (a pair of edges in more than one cell read in each: a crossing found twice marks the same rings)
  for (const list of cells.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [a, k] = list[i], [b, l] = list[j], na = rings[a].pts.length;
    if (a === b && (Math.abs(k - l) <= 1 || Math.abs(k - l) === na - 1)) continue;
    const P0 = rings[a].pts[k], P1 = rings[a].pts[(k + 1) % na], Q0 = rings[b].pts[l], Q1 = rings[b].pts[(l + 1) % rings[b].pts.length];
    if (Math.max(P0.x, P1.x) < Math.min(Q0.x, Q1.x) || Math.max(Q0.x, Q1.x) < Math.min(P0.x, P1.x) || Math.max(P0.y, P1.y) < Math.min(Q0.y, Q1.y) || Math.max(Q0.y, Q1.y) < Math.min(P0.y, P1.y)) continue;
    const rx = P1.x - P0.x, ry = P1.y - P0.y, sx = Q1.x - Q0.x, sy = Q1.y - Q0.y, d = rx * sy - ry * sx;
    if (!d) continue;
    const t = ((Q0.x - P0.x) * sy - (Q0.y - P0.y) * sx) / d, u = ((Q0.x - P0.x) * ry - (Q0.y - P0.y) * rx) / d;
    if (t > 0 && t < 1 && u > 0 && u < 1) out.push({ a, k, b, l, x: P0.x + rx * t, y: P0.y + ry * t });
  }
  return out;
}
/** The grid crossings are read on, in font units; how many times a crossing's sides are drawn nearer as they were
    before the rings crossing are left as they were. */
const CROSS_CELL = 8, UNCROSS_PASSES = 3;
/** How far a corner drawn again may stand from where it was, as many times the bell's width. */
const MEET_FAR = 0.5;
