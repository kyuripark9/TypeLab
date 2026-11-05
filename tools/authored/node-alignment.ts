/* Point for point correspondence between two drawings of one contour that keep their points in different places. Static
   fonts made from one design keep its corners and the extremes of its curves (where a curve runs level or upright) but
   split the curves between them in places of their own, so two weights can hold the same number of points and still
   not match one for one (Poppins's s at 300 and 400). Corners pair with corners and extremes with extremes running the
   same way, in contour order; every other point finds its place along the other drawing by its share of the curve
   between the pairs. The other drawing is then redrawn on this one's points from its own curves: cut exactly where a
   piece lies inside one of its curves, fitted with its own end directions where a piece spans several. */
import { cubicAt, subCubic } from '../../shared/engine/geom';
import { segment, type Node } from '../../shared/engine/outline';

type P = { x: number; y: number };
type Curve = [P, P, P, P];
export interface Location { seg: number; t: number }
export type Kind = 'corner' | 'level+' | 'level-' | 'upright+' | 'upright-' | 'free';
export interface ContourMatch {
  /** for each point of the first drawing, where it lies on the second */
  locations: Location[];
  /** for each point of the first drawing, the second's point it pairs with, or null where it falls between points */
  paired: (number | null)[];
  /** corners and extremes of the first drawing left without a partner */
  unpaired: number[];
  /** the second drawing runs the other way round */
  reversed: boolean;
}

const CORNER_DEG = 12, EXTREME_DEG = 2.5;
const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const same = (a: P, b: P) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

/** The cubic from point `i` to the next, a straight edge as one with controls at its thirds. */
export function curveOf(contour: Node[], i: number): Curve {
  const a = contour[i], b = contour[(i + 1) % contour.length], c = segment(a, b);
  return c ? [c[0], c[1], c[2], c[3]] : [a, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), b];
}
const isLine = (contour: Node[], i: number) => !segment(contour[i], contour[(i + 1) % contour.length]);

/** The direction a cubic leaves its start (`end` false) or arrives at its end, skipping controls on the point. */
function direction(c: Curve, end: boolean): P {
  const [p0, p1, p2, p3] = end ? [c[3], c[2], c[1], c[0]] : c;
  const q = !same(p0, p1) ? p1 : !same(p0, p2) ? p2 : p3, dx = q.x - p0.x, dy = q.y - p0.y, l = Math.hypot(dx, dy) || 1;
  return end ? { x: -dx / l, y: -dy / l } : { x: dx / l, y: dy / l };
}
const degrees = (a: P, b: P) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) * 180 / Math.PI;

interface Feature { kind: Kind; at: P; incoming: P; outgoing: P }
function features(contour: Node[]): Feature[] {
  return contour.map((node, i) => {
    const incoming = direction(curveOf(contour, (i - 1 + contour.length) % contour.length), true);
    const outgoing = direction(curveOf(contour, i), false);
    let kind: Kind = 'free';
    if (degrees(incoming, outgoing) > CORNER_DEG) kind = 'corner';
    else {
      const angle = Math.atan2(incoming.y + outgoing.y, incoming.x + outgoing.x) * 180 / Math.PI;
      const near = (deg: number) => Math.abs(((angle - deg + 540) % 360) - 180) < EXTREME_DEG;
      kind = near(0) ? 'level+' : near(180) ? 'level-' : near(90) ? 'upright+' : near(-90) ? 'upright-' : 'free';
    }
    return { kind, at: { x: node.x, y: node.y }, incoming, outgoing };
  });
}
function signedArea(contour: Node[]): number {
  let area = 0;
  for (let i = 0; i < contour.length; i++) for (let k = 0; k < 8; k++) {
    const a = cubicAt(curveOf(contour, i), k / 8), b = cubicAt(curveOf(contour, i), (k + 1) / 8);
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}
function reverseContour(contour: Node[]): Node[] {
  return contour.slice().reverse().map(n => {
    const out: Node = { x: n.x, y: n.y };
    if (n.ox !== undefined && n.oy !== undefined) { out.ix = n.ox; out.iy = n.oy; }
    if (n.ix !== undefined && n.iy !== undefined) { out.ox = n.ix; out.oy = n.iy; }
    return out;
  });
}

/** What pairing point `a` with point `b` costs, in font units; Infinity where they can't pair. */
function pairCost(a: Feature, b: Feature, reach: number): number {
  if (a.kind !== b.kind) return Infinity;
  const d = Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y);
  if (d > reach) return Infinity;
  if (a.kind === 'corner') return d + .5 * (degrees(a.incoming, b.incoming) + degrees(a.outgoing, b.outgoing));
  if (a.kind === 'free') return degrees(a.outgoing, b.outgoing) > 8 || d > reach / 4 ? Infinity : d;
  return d;
}
const skipCost = (f: Feature) => f.kind === 'free' ? 4 : 120;

/** Pair the points of `a` with those of `b` in order round both contours, `b` already running the same way. */
function pairing(a: Feature[], b: Feature[], reach: number): { cost: number; pairs: (number | null)[] } | null {
  const n = a.length, m = b.length;
  // start at a corner or extreme, tried against each point of b it could be; another where one finds none
  let best: { cost: number; pairs: (number | null)[] } | null = null;
  for (const start of a.flatMap((f, i) => f.kind === 'free' ? [] : [i])) for (let k = 0; k < m; k++) {
    const first = pairCost(a[start], b[k], reach);
    if (!Number.isFinite(first)) continue;
    // dynamic programme over a[start+1..start+n-1] and b[k+1..k+m-1], the start pair fixed
    const N = n - 1, M = m - 1, cost = new Float64Array((N + 1) * (M + 1)).fill(Infinity), step = new Uint8Array((N + 1) * (M + 1));
    const A = (i: number) => a[(start + 1 + i) % n], B = (j: number) => b[(k + 1 + j) % m];
    cost[0] = first;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
      const at = i * (M + 1) + j, here = cost[at];
      if (!Number.isFinite(here)) continue;
      if (i < N && here + skipCost(A(i)) < cost[at + M + 1]) { cost[at + M + 1] = here + skipCost(A(i)); step[at + M + 1] = 1; }
      if (j < M && here + skipCost(B(j)) < cost[at + 1]) { cost[at + 1] = here + skipCost(B(j)); step[at + 1] = 2; }
      if (i < N && j < M) {
        const c = here + pairCost(A(i), B(j), reach);
        if (c < cost[at + M + 2]) { cost[at + M + 2] = c; step[at + M + 2] = 3; }
      }
    }
    const total = cost[N * (M + 1) + M];
    if (!Number.isFinite(total) || best && total >= best.cost) continue;
    const pairs: (number | null)[] = Array(n).fill(null);
    pairs[start] = k;
    for (let i = N, j = M; i > 0 || j > 0;) {
      const s = step[i * (M + 1) + j];
      if (s === 3) { pairs[(start + i) % n] = (k + j) % m; i--; j--; } else if (s === 1) i--; else j--;
    }
    best = { cost: total, pairs };
  }
  return best;
}

/** Arc length along `contour` from point `from` to each place, sampled finely enough for spacing points. */
function lengths(contour: Node[]) {
  const per = 48, table: { seg: number; t: number; s: number }[] = [];
  let s = 0;
  for (let i = 0; i < contour.length; i++) {
    const c = curveOf(contour, i);
    let previous = cubicAt(c, 0);
    for (let k = 0; k < per; k++) {
      table.push({ seg: i, t: k / per, s });
      const next = cubicAt(c, (k + 1) / per);
      s += Math.hypot(next.x - previous.x, next.y - previous.y); previous = next;
    }
  }
  return { table, total: s, per };
}
function lengthAt(l: ReturnType<typeof lengths>, loc: Location): number {
  const i = loc.seg * l.per + Math.min(l.per - 1, Math.floor(loc.t * l.per)), a = l.table[i];
  const b = l.table[i + 1]?.s ?? l.total, f = loc.t * l.per - Math.floor(loc.t * l.per);
  return a.s + (b - a.s) * f;
}
function locationAt(l: ReturnType<typeof lengths>, s: number): Location {
  s = ((s % l.total) + l.total) % l.total;
  let lo = 0, hi = l.table.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (l.table[mid].s <= s) lo = mid; else hi = mid - 1; }
  const a = l.table[lo], next = l.table[lo + 1]?.s ?? l.total, f = next > a.s ? (s - a.s) / (next - a.s) : 0;
  const t = a.t + f / l.per;
  return t >= 1 ? { seg: (a.seg + 1) % (l.table.length / l.per), t: 0 } : { seg: a.seg, t };
}

/** Where each point of `a` lies on `b`, two drawings of one contour (b in the same coordinates); null where no corner
    or extreme of `a` finds a partner, so the contours can't be told apart from their shapes. `reach` is the furthest a
    point moves between them. */
export function matchContour(a: Node[], b: Node[], reach: number, scaled = false): ContourMatch | null {
  const reversed = Math.sign(signedArea(a)) !== Math.sign(signedArea(b)), other = reversed ? reverseContour(b) : b;
  const fa = features(a), fb = features(other);
  // `scaled`: places compared within each contour's own bounds, for a drawing stretched from the other (a sheet's
  // shorter brace), at the size of their mean
  if (scaled) {
    const box = (f: Feature[]) => ({ x0: Math.min(...f.map(p => p.at.x)), x1: Math.max(...f.map(p => p.at.x)), y0: Math.min(...f.map(p => p.at.y)), y1: Math.max(...f.map(p => p.at.y)) });
    const ba = box(fa), bb = box(fb), w = ((ba.x1 - ba.x0) + (bb.x1 - bb.x0)) / 2 || 1, h = ((ba.y1 - ba.y0) + (bb.y1 - bb.y0)) / 2 || 1;
    const place = (f: Feature[], b: typeof ba) => f.forEach(p => { p.at = { x: (p.at.x - b.x0) / ((b.x1 - b.x0) || 1) * w, y: (p.at.y - b.y0) / ((b.y1 - b.y0) || 1) * h }; });
    place(fa, ba); place(fb, bb);
  }
  // the same points in the same order where each is the same kind; otherwise paired by shape, further where a
  // corner or extreme finds no partner near (a slash's foot moves a stroke's width)
  const direct = fa.length === fb.length && fa.every((f, i) => f.kind === fb[i].kind && Math.hypot(f.at.x - fb[i].at.x, f.at.y - fb[i].at.y) <= 2 * reach)
    ? { cost: 0, pairs: fa.map((_, i) => i) as (number | null)[] } : null;
  const missing = (p: { pairs: (number | null)[] } | null) => p ? fa.filter((f, i) => f.kind !== 'free' && p.pairs[i] === null).length : Infinity;
  let found = direct ?? pairing(fa, fb, reach);
  if (!direct && missing(found) > 0) {
    const wider = pairing(fa, fb, 2 * reach);
    if (missing(wider) < missing(found)) found = wider;
  }
  if (!found) return null;
  const { pairs } = found, la = lengths(a), lb = lengths(other), m = other.length;
  const anchors = pairs.flatMap((j, i) => j === null ? [] : [i]);
  if (!anchors.length) return null;
  const locations: Location[] = pairs.map((j, i) => {
    if (j !== null) return { seg: j, t: 0 };
    // between the pairs either side, at the same share of the way along
    const before = anchors.findLast(x => x < i) ?? anchors[anchors.length - 1], after = anchors.find(x => x > i) ?? anchors[0];
    const sa0 = lengthAt(la, { seg: before, t: 0 }), sa1 = lengthAt(la, { seg: after, t: 0 }), sa = lengthAt(la, { seg: i, t: 0 });
    const span = ((sa1 - sa0) % la.total + la.total) % la.total || la.total, share = (((sa - sa0) % la.total + la.total) % la.total) / span;
    const sb0 = lengthAt(lb, { seg: pairs[before]!, t: 0 }), sb1 = lengthAt(lb, { seg: pairs[after]!, t: 0 });
    const spanB = ((sb1 - sb0) % lb.total + lb.total) % lb.total || lb.total;
    return locationAt(lb, sb0 + share * spanB);
  });
  const unpaired = fa.flatMap((f, i) => f.kind !== 'free' && pairs[i] === null ? [i] : []);
  // a reversed b is reported in b's own numbering
  return { locations: reversed ? locations.map(l => flip(l, m)) : locations,
    paired: pairs.map(j => j === null ? null : reversed ? m - 1 - j : j), unpaired, reversed };
}
/** A place on a contour of `m` points in the numbering of the same contour run the other way (its own inverse). */
function flip(loc: Location, m: number): Location {
  return loc.t === 0 ? { seg: m - 1 - loc.seg, t: 0 } : { seg: (2 * m - 2 - loc.seg) % m, t: 1 - loc.t };
}

/** The pieces of `contour` from one place to the next going forward. */
function pieces(contour: Node[], from: Location, to: Location): Curve[] {
  const m = contour.length, out: Curve[] = [], part = (seg: number, t0: number, t1: number) => {
    // a whole curve as it is, so letters whose points already match come out exactly as they were
    if (t1 > t0) out.push(t0 === 0 && t1 === 1 ? curveOf(contour, seg) : subCubic(curveOf(contour, seg), t0, t1) as Curve);
  };
  if (from.seg === to.seg && to.t > from.t) { part(from.seg, from.t, to.t); return out; }
  part(from.seg, from.t, 1);
  for (let seg = (from.seg + 1) % m; seg !== to.seg; seg = (seg + 1) % m) part(seg, 0, 1);
  part(to.seg, 0, to.t);
  return out;
}

/** One cubic through `parts` (a run of joined cubics), its ends and their directions kept, its handles fitted. */
function fitCurve(parts: Curve[]): Curve {
  if (parts.length === 1) return parts[0];
  const p0 = parts[0][0], p3 = parts[parts.length - 1][3], d0 = direction(parts[0], false), d3 = direction(parts[parts.length - 1], true);
  const points: P[] = [];
  for (const c of parts) for (let k = 0; k < 16; k++) points.push(cubicAt(c, k / 16));
  points.push(p3);
  const chord = [0];
  for (let i = 1; i < points.length; i++) chord.push(chord[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = chord[chord.length - 1] || 1;
  // least squares for the two handle lengths along the end directions (d3 points back from the end)
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  points.forEach((p, i) => {
    const u = chord[i] / total, b0 = (1 - u) ** 3, b1 = 3 * u * (1 - u) ** 2, b2 = 3 * u * u * (1 - u), b3 = u ** 3;
    const a1 = { x: d0.x * b1, y: d0.y * b1 }, a2 = { x: -d3.x * b2, y: -d3.y * b2 };
    const r = { x: p.x - (b0 + b1) * p0.x - (b2 + b3) * p3.x, y: p.y - (b0 + b1) * p0.y - (b2 + b3) * p3.y };
    c00 += a1.x * a1.x + a1.y * a1.y; c01 += a1.x * a2.x + a1.y * a2.y; c11 += a2.x * a2.x + a2.y * a2.y;
    x0 += a1.x * r.x + a1.y * r.y; x1 += a2.x * r.x + a2.y * r.y;
  });
  const det = c00 * c11 - c01 * c01, chordLength = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  let alpha = det ? (x0 * c11 - x1 * c01) / det : chordLength / 3, beta = det ? (c00 * x1 - c01 * x0) / det : chordLength / 3;
  if (!(alpha > 0) || !(beta > 0)) alpha = beta = chordLength / 3;
  return [p0, { x: p0.x + d0.x * alpha, y: p0.y + d0.y * alpha }, { x: p3.x - d3.x * beta, y: p3.y - d3.y * beta }, p3];
}

export interface Redrawn { contour: Node[]; fitError: number }
/** `b` redrawn on the points of `a`, from where `match` puts them: each of a's points at its place on b, each of a's
    curves b's curve between those places; a's straight edges stay straight. */
export function redrawOn(a: Node[], b: Node[], match: ContourMatch): Redrawn {
  const n = a.length, curves: Curve[] = [];
  let fitError = 0;
  const forward = match.reversed ? reverseContour(b) : b, m = b.length;
  const loc = (i: number): Location => match.reversed ? flip(match.locations[i], m) : match.locations[i];
  for (let i = 0; i < n; i++) {
    const from = loc(i), to = loc((i + 1) % n);
    const parts = pieces(forward, from, to), start = cubicAt(curveOf(forward, from.seg), from.t), end = cubicAt(curveOf(forward, to.seg), to.t);
    if (isLine(a, i)) { curves.push([start, lerp(start, end, 1 / 3), lerp(start, end, 2 / 3), end]); continue; }
    const made = parts.length ? fitCurve(parts) : [start, start, end, end] as Curve;
    if (parts.length > 1) for (const part of parts) for (const t of [.25, .5, .75]) {
      const p = cubicAt(part, t);
      let nearest = Infinity;
      for (let k = 0; k <= 256; k++) { const q = cubicAt(made, k / 256); nearest = Math.min(nearest, Math.hypot(p.x - q.x, p.y - q.y)); }
      fitError = Math.max(fitError, nearest);
    }
    curves.push(made);
  }
  const contour = a.map((node, i) => {
    const c = curves[i], previous = curves[(i - 1 + n) % n], out: Node = { x: c[0].x, y: c[0].y };
    if (node.ix !== undefined && node.iy !== undefined) { out.ix = previous[2].x; out.iy = previous[2].y; }
    if (node.ox !== undefined && node.oy !== undefined) { out.ox = c[1].x; out.oy = c[1].y; }
    return out;
  });
  return { contour, fitError };
}
