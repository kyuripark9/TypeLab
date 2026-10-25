/* Source curves moved through one positive width scale and one increasing height map. Cubics are split where a
   height map changes slope, so the map applies to the whole curve rather than to its handles alone. */
import type { Node } from '../engine/outline';

export type HeightKnot = readonly [from: number, to: number];
export interface OutlineTransform {
  readonly xScale: number;
  readonly y: readonly [HeightKnot, HeightKnot, ...HeightKnot[]];
}
export interface Point { readonly x: number; readonly y: number }
type Contours = readonly (readonly Node[])[];
export type PointOrigin =
  | { readonly kind: 'node'; readonly contour: number; readonly node: number }
  | { readonly kind: 'split'; readonly contour: number; readonly from: number; readonly t: number };
export interface MappedOutline {
  readonly contours: Contours;
  readonly origins: readonly (readonly PointOrigin[])[];
}
export interface MutableMappedOutline extends MappedOutline { readonly contours: Node[][] }
type Cubic = readonly [Point, Point, Point, Point];
const ROOT_EPS = 1e-10;

function validate(transform: OutlineTransform): void {
  if (!Number.isFinite(transform.xScale) || transform.xScale <= 0) throw new RangeError('Width scale must be positive.');
  for (let i = 0; i < transform.y.length; i++) {
    const [from, to] = transform.y[i];
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw new RangeError('Height knots must be finite.');
    if (i > 0 && (from <= transform.y[i - 1][0] || to <= transform.y[i - 1][1])) {
      throw new RangeError('Height knots must increase in both coordinates.');
    }
  }
}

function affineAt(knots: OutlineTransform['y'], y: number): { scale: number; offset: number } {
  let i = 0;
  while (i + 2 < knots.length && y > knots[i + 1][0]) i++;
  const [from, to] = knots[i], [nextFrom, nextTo] = knots[i + 1];
  const scale = (nextTo - to) / (nextFrom - from);
  return { scale, offset: to - from * scale };
}
function pointIn(transform: OutlineTransform, point: Point): Point {
  const { scale, offset } = affineAt(transform.y, point.y);
  return { x: point.x * transform.xScale, y: point.y * scale + offset };
}

/** Move a source-space point. Heights beyond the first and last knots follow the nearest interval. */
export function mapPoint(point: Point, transform: OutlineTransform): Point {
  validate(transform);
  return pointIn(transform, point);
}
/** The reverse map uses the same increasing knots, with their source and target coordinates exchanged. */
export function inverseTransform(transform: OutlineTransform): OutlineTransform {
  validate(transform);
  const inverse = ([from, to]: HeightKnot): HeightKnot => [to, from];
  const [first, second, ...rest] = transform.y;
  return { xScale: 1 / transform.xScale, y: [inverse(first), inverse(second), ...rest.map(inverse)] };
}
/** Read a point in the original drawing's coordinates, for direct editing and saved drawing baselines. */
export function unmapPoint(point: Point, transform: OutlineTransform): Point {
  return pointIn(inverseTransform(transform), point);
}

const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function pointAt(b: Cubic, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * b[0].x + 3 * u * u * t * b[1].x + 3 * u * t * t * b[2].x + t * t * t * b[3].x,
    y: u * u * u * b[0].y + 3 * u * u * t * b[1].y + 3 * u * t * t * b[2].y + t * t * t * b[3].y
  };
}
function split(b: Cubic, t: number): readonly [Cubic, Cubic] {
  const a = mix(b[0], b[1], t), c = mix(b[1], b[2], t), d = mix(b[2], b[3], t);
  const e = mix(a, c, t), f = mix(c, d, t), m = mix(e, f, t);
  return [[b[0], a, e, m], [m, f, d, b[3]]];
}

/** A cubic can cross a height up to three times. Its derivative roots divide it into monotone intervals. */
function crossings(b: Cubic, height: number): number[] {
  const [p0, p1, p2, p3] = b.map(p => p.y);
  const a = -p0 + 3 * p1 - 3 * p2 + p3, q = 3 * p0 - 6 * p1 + 3 * p2, c = -3 * p0 + 3 * p1;
  const critical = [0, 1], discriminant = 4 * q * q - 12 * a * c;
  if (Math.abs(a) < ROOT_EPS) {
    if (Math.abs(q) >= ROOT_EPS) critical.push(-c / (2 * q));
  } else if (discriminant >= 0) {
    const d = Math.sqrt(discriminant);
    critical.push((-2 * q - d) / (6 * a), (-2 * q + d) / (6 * a));
  }
  const cuts = critical.filter(t => t >= 0 && t <= 1).sort((a, b) => a - b);
  const roots = cuts.filter(t => t > ROOT_EPS && t < 1 - ROOT_EPS && Math.abs(pointAt(b, t).y - height) < ROOT_EPS);
  for (let i = 0; i + 1 < cuts.length; i++) {
    let lo = cuts[i], hi = cuts[i + 1], left = pointAt(b, lo).y - height;
    if (left * (pointAt(b, hi).y - height) >= 0) continue;
    for (let step = 0; step < 48; step++) {
      const mid = (lo + hi) / 2, value = pointAt(b, mid).y - height;
      if (left * value <= 0) hi = mid;
      else { lo = mid; left = value; }
    }
    const t = (lo + hi) / 2;
    if (t > ROOT_EPS && t < 1 - ROOT_EPS) roots.push(t);
  }
  return roots;
}

function affineNode(node: Node, transform: OutlineTransform): Node {
  const out: Node = { ...node, ...pointIn(transform, node) };
  if (node.ix !== undefined && node.iy !== undefined) {
    const p = pointIn(transform, { x: node.ix, y: node.iy }); out.ix = p.x; out.iy = p.y;
  }
  if (node.ox !== undefined && node.oy !== undefined) {
    const p = pointIn(transform, { x: node.ox, y: node.oy }); out.ox = p.x; out.oy = p.y;
  }
  return out;
}
function affineEverywhere(transform: OutlineTransform): boolean {
  const first = affineAt(transform.y, transform.y[0][0]);
  return transform.y.slice(1).every(([from, to]) => from * first.scale + first.offset === to);
}
function smooth(node: Node, tolerance: number): boolean {
  if (node.ix === undefined || node.iy === undefined || node.ox === undefined || node.oy === undefined) return false;
  const ax = node.x - node.ix, ay = node.y - node.iy, bx = node.ox - node.x, by = node.oy - node.y;
  const length = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return length > 0 && (ax * bx + ay * by) / length > 1 - tolerance;
}

/** Exact source identity at neutral; otherwise source nodes retain their origins and new curve cuts name the
    original segment and parameter. The returned arrays never mutate the input. Live corner radii are not expanded. */
export function mapOutline(contours: Node[][], transform: OutlineTransform): MutableMappedOutline;
export function mapOutline(contours: Contours, transform: OutlineTransform): MappedOutline;
export function mapOutline(contours: Contours, transform: OutlineTransform): MappedOutline {
  validate(transform);
  const origins = contours.map((contour, ci) => contour.map((_node, ni): PointOrigin => ({ kind: 'node', contour: ci, node: ni })));
  if (transform.xScale === 1 && transform.y.every(([from, to]) => from === to)) return { contours, origins };
  if (affineEverywhere(transform)) return { contours: contours.map(c => c.map(n => affineNode(n, transform))), origins };
  const moved: Node[][] = [], mappedOrigins: PointOrigin[][] = [];
  contours.forEach((contour, ci) => {
    if (!contour.length) { moved.push([]); mappedOrigins.push([]); return; }
    const out: Node[] = [{ ...pointIn(transform, contour[0]) }];
    const refs: PointOrigin[] = [{ kind: 'node', contour: ci, node: 0 }];
    for (let ni = 0; ni < contour.length; ni++) {
      const next = (ni + 1) % contour.length, a = contour[ni], b = contour[next];
      const curved = a.ox !== undefined || b.ix !== undefined;
      let curve: Cubic = curved
        ? [a, { x: a.ox ?? a.x, y: a.oy ?? a.y }, { x: b.ix ?? b.x, y: b.iy ?? b.y }, b]
        : [a, mix(a, b, 1 / 3), mix(a, b, 2 / 3), b];
      const roots = transform.y.slice(1, -1).flatMap(([height]) => crossings(curve, height)).sort((a, b) => a - b);
      const cuts = roots.filter((t, i) => i === 0 || t - roots[i - 1] > ROOT_EPS);
      let before = 0;
      for (const t of [...cuts, 1]) {
        const [piece, rest] = split(curve, (t - before) / (1 - before));
        curve = rest; before = t;
        const { scale, offset } = affineAt(transform.y, pointAt(piece, 0.5).y);
        const apply = (p: Point): Point => ({ x: p.x * transform.xScale, y: p.y * scale + offset });
        const p1 = apply(piece[1]), p2 = apply(piece[2]);
        const last = out[out.length - 1];
        if (curved) { last.ox = p1.x; last.oy = p1.y; }
        const closes = t === 1 && next === 0;
        const endpoint: Node = closes ? out[0] : { ...pointIn(transform, piece[3]) };
        if (curved) { endpoint.ix = p2.x; endpoint.iy = p2.y; }
        if (!closes) {
          out.push(endpoint);
          refs.push(t === 1 ? { kind: 'node', contour: ci, node: next } : { kind: 'split', contour: ci, from: ni, t });
        }
      }
    }
    out.forEach((node, i) => {
      const origin = refs[i];
      if (origin.kind === 'node' && !contour[origin.node].s) return;
      const atKnot = origin.kind === 'split' || transform.y.slice(1, -1).some(([height]) => Math.abs(contour[origin.node].y - height) < ROOT_EPS);
      // Source rounding permits the decoder's smooth tolerance inside one affine interval. At a changed slope,
      // only collinear tangents remain smooth; an intentional bend must remain editable as two handles.
      if (smooth(node, atKnot ? 1e-10 : 0.005)) node.s = 1;
    });
    moved.push(out); mappedOrigins.push(refs);
  });
  return { contours: moved, origins: mappedOrigins };
}
