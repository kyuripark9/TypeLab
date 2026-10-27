/* Round and square dots drawn in place of a source's own. Each bound dot keeps its point count, so a Points edit rides
   a change of shape the way it rides a change of weight; its centre, proportions and ink area stay the dot's own, and a
   dot standing on the baseline keeps its foot there. */
import type { FreeFont } from '../engine/free';
import type { Node } from '../engine/outline';
import type { Pt } from '../engine/types';
import { componentInkBounds, type SourceComponents } from './components';

export const DOT_SHAPES = ['round', 'square'] as const;
export type DotShape = typeof DOT_SHAPES[number];
export interface SourceDotPolicy {
  format: 'source-dots-v1';
  /** the shapes offered besides the style's own dots, which already are any shape left out */
  shapes: [DotShape, ...DotShape[]];
  /** a square dot's corner radius as a share of half its shorter side: 0 sharp */
  corner: number;
  /** how far a round dot standing on the baseline dips below it, as a share of its height, where its own dot stands flat */
  overshoot: number;
  /** how far the style's letters lean, in degrees to the right: a dot is shaped upright and leaned with them */
  slant: number;
  /** the dots that stand on the baseline, as `glyph:binding` */
  baseline: string[];
  /** the accented letters whose mark is all dots (a diaeresis, a dot above), which take the shape too */
  marks: string;
}

export function parseSourceDots(input: unknown): SourceDotPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source dot policy');
  const value = Object.fromEntries(Object.entries(input)), fields = ['format', 'shapes', 'corner', 'overshoot', 'slant', 'baseline', 'marks'];
  if (value.format !== 'source-dots-v1' || Object.keys(value).some(key => !fields.includes(key))) throw new TypeError('Invalid source dot policy');
  const shapes = Array.isArray(value.shapes) ? value.shapes : [], baseline = Array.isArray(value.baseline) ? value.baseline : [];
  const picked = DOT_SHAPES.filter(shape => shapes.includes(shape)), [first, ...rest] = picked;
  if (!first || picked.length !== shapes.length) throw new TypeError('A source dot policy offers round, square or both');
  if (typeof value.corner !== 'number' || !(value.corner >= 0 && value.corner <= 0.9)
    || typeof value.overshoot !== 'number' || !(value.overshoot >= 0 && value.overshoot <= 0.2)
    || typeof value.slant !== 'number' || !(value.slant >= -45 && value.slant <= 45)) throw new TypeError('Invalid source dot dimensions');
  if (baseline.length > 64 || baseline.some(key => typeof key !== 'string' || !/^.:[a-z][a-z0-9-]{0,47}$/u.test(key))
    || new Set(baseline).size !== baseline.length) throw new TypeError('Invalid source dot baseline list');
  const marks = typeof value.marks === 'string' ? [...value.marks] : null;
  if (!marks || marks.length > 64 || new Set(marks).size !== marks.length) throw new TypeError('Invalid source dot mark list');
  return { format: 'source-dots-v1', shapes: [first, ...rest], corner: value.corner, overshoot: value.overshoot, slant: value.slant, baseline: [...baseline] as string[], marks: marks.join('') };
}

/** The shape dots drawn under `policy` take for the Dots value `dots`: one the policy offers, or null for the style's own. */
export const sourceDotShape = (policy: SourceDotPolicy | undefined, dots: string): DotShape | null =>
  policy && (dots === 'round' || dots === 'square') && policy.shapes.includes(dots) ? dots : null;

/** A newer policy keeps every shape the older one offered. */
export const sourceDotsExtend = (before: SourceDotPolicy, after: SourceDotPolicy): boolean =>
  before.shapes.every(shape => after.shapes.includes(shape));

type Cubic = [Pt, Pt, Pt, Pt];
const KAPPA = 0.5522847498307936;
/** A dot's shapes are no longer across than this for their height, nor taller for their width: a longer one reads as a dash. */
const MOST_OBLONG = 1.25;
/** A dot filling less of its box than this is round enough that its own dip below the baseline is a round dot's. */
export const ROUNDISH = 0.85;
const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const line = (a: Pt, b: Pt): Cubic => [a, mix(a, b, 1 / 3), mix(a, b, 2 / 3), b];
function split(c: Cubic, t: number): [Cubic, Cubic] {
  const a = mix(c[0], c[1], t), b = mix(c[1], c[2], t), d = mix(c[2], c[3], t), e = mix(a, b, t), f = mix(b, d, t), p = mix(e, f, t);
  return [[c[0], a, e, p], [p, f, d, c[3]]];
}
function cubics(contour: readonly Node[]): Cubic[] {
  return contour.map((a, i) => {
    const b = contour[(i + 1) % contour.length];
    return [a, a.ox !== undefined && a.oy !== undefined ? { x: a.ox, y: a.oy } : mix(a, b, 1 / 3),
      b.ix !== undefined && b.iy !== undefined ? { x: b.ix, y: b.iy } : mix(a, b, 2 / 3), b];
  });
}
/** The contour's signed area, exact for cubics (three-point Gauss–Legendre integrates the degree-five integrand exactly). */
function signedArea(curves: readonly Cubic[]): number {
  const gauss = [[0.5 - Math.sqrt(15) / 10, 5 / 18], [0.5, 8 / 18], [0.5 + Math.sqrt(15) / 10, 5 / 18]];
  let area = 0;
  for (const [p, q, r, s] of curves) for (const [t, weight] of gauss) {
    const u = 1 - t;
    const x = u * u * u * p.x + 3 * u * u * t * q.x + 3 * u * t * t * r.x + t * t * t * s.x;
    const y = u * u * u * p.y + 3 * u * u * t * q.y + 3 * u * t * t * r.y + t * t * t * s.y;
    const dx = 3 * (u * u * (q.x - p.x) + 2 * u * t * (r.x - q.x) + t * t * (s.x - r.x));
    const dy = 3 * (u * u * (q.y - p.y) + 2 * u * t * (r.y - q.y) + t * t * (s.y - r.y));
    area += weight * (x * dy - y * dx) / 2;
  }
  return area;
}

/** A quarter of the ellipse about `c` with half sizes `a` and `b`, from angle `from` on, its handles `k` of the tangent
    long: the round quarter at KAPPA, a superellipse's beyond it. */
function quarter(c: Pt, a: number, b: number, from: number, k: number): Cubic {
  const to = from + Math.PI / 2, cos = (t: number) => Math.round(Math.cos(t)), sin = (t: number) => Math.round(Math.sin(t));
  const p = { x: c.x + a * cos(from), y: c.y + b * sin(from) }, q = { x: c.x + a * cos(to), y: c.y + b * sin(to) };
  return [p, { x: p.x - k * a * sin(from), y: p.y + k * b * cos(from) }, { x: q.x + k * a * sin(to), y: q.y - k * b * cos(to) }, q];
}

/** The shape's outline as cubics running anticlockwise from its right, about `c`, with half sizes `a` across and `b` up. */
function outline(shape: DotShape, corner: number, nodes: number, c: Pt, a: number, b: number): Cubic[] {
  const turns = [0, 1, 2, 3].map(q => q * Math.PI / 2);
  if (shape === 'round') return turns.map(t => quarter(c, a, b, t, KAPPA));
  const r = corner * Math.min(a, b);
  if (r === 0) {
    const ends = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([x, y]) => ({ x: c.x + x * a, y: c.y + y * b }));
    return ends.map((p, i) => line(p, ends[(i + 1) % 4]));
  }
  // too few points for a corner's two ends: a superellipse through the sides' middles, as round at 45° as the corner
  if (nodes < 8) return turns.map(t => quarter(c, a, b, t, Math.min(1, 4 / 3 - 0.78105 * corner)));
  const out: Cubic[] = [];
  for (const [q, t] of turns.entries()) {
    const sx = q === 0 || q === 3 ? 1 : -1, sy = q < 2 ? 1 : -1;
    const arc = quarter({ x: c.x + sx * (a - r), y: c.y + sy * (b - r) }, r, r, t, KAPPA);
    out.push(line(out.length ? out[out.length - 1][3] : { x: c.x + a, y: c.y - (b - r) }, arc[0]), arc);
  }
  return out;
}

const angle = (p: Pt, c: Pt, a: number, b: number) => Math.atan2((p.y - c.y) / b, (p.x - c.x) / a);
const gap = (u: number, v: number) => { const d = Math.abs(u - v) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };

/** Dot `contour` drawn as `shape` with as many points, each near where the dot had its own, turning the same way.
    `baseline`: the dot stands on the baseline, so a square's foot sits on it and a round one dips below it as far as the
    dot did for its size, or by `overshoot` of its height where the dot was square enough to stand flat. */
export function dotShapeContour(contour: readonly Node[], shape: DotShape, policy: Pick<SourceDotPolicy, 'corner' | 'overshoot' | 'slant'>,
  baseline = false): Node[] {
  if (!policy.slant) return upright(contour, shape, policy, baseline);
  // shaped where the letters stand upright, then leaned back with them: a square leans as a parallelogram
  const lean = Math.tan(policy.slant * Math.PI / 180);
  return lean ? leaned(upright(leaned(contour, -lean), shape, policy, baseline), lean) : [...contour];
}

/** `contour` leaned by `lean` across for each unit up, about the baseline. */
function leaned(contour: readonly Node[], lean: number): Node[] {
  return contour.map(node => {
    const out: Node = { ...node, x: node.x + lean * node.y };
    if (node.ix !== undefined && node.iy !== undefined) out.ix = node.ix + lean * node.iy;
    if (node.ox !== undefined && node.oy !== undefined) out.ox = node.ox + lean * node.oy;
    return out;
  });
}

function upright(contour: readonly Node[], shape: DotShape, policy: Pick<SourceDotPolicy, 'corner' | 'overshoot'>, baseline: boolean): Node[] {
  const n = contour.length, box = componentInkBounds([contour]), w = box.x1 - box.x0, h = box.y1 - box.y0;
  const own = cubics(contour), area = signedArea(own);
  if (n < 4 || !(w > 0 && h > 0) || !(Math.abs(area) > 0)) return [...contour];
  const corner = shape === 'square' ? policy.corner : 0;
  // the same ink: an ellipse or a rounded rectangle of the dot's own proportions, as far as a dot's go, and area
  const across = Math.min(MOST_OBLONG, Math.max(1 / MOST_OBLONG, w / h)), short = Math.min(across, 1);
  const b = shape === 'round' ? Math.sqrt(Math.abs(area) / (Math.PI * across))
    : Math.sqrt(Math.abs(area) / (4 * across - (4 - Math.PI) * corner * corner * short * short));
  const a = across * b, centre = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  const dip = Math.abs(area) / (w * h) < ROUNDISH && box.y0 < 0 ? -box.y0 / h : policy.overshoot;
  if (baseline) centre.y = (shape === 'round' ? -dip * 2 * b : 0) + b;
  const base = outline(shape, corner, n, centre, a, b), own0 = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  // each side of the shape takes as many points as the dot had in that direction, at least one
  const ends = base.map(curve => angle(curve[0], centre, a, b)), counts = base.map(() => 0);
  const directions = contour.map(node => angle(node, own0, w / 2, h / 2));
  for (const d of directions) {
    let best = 0;
    for (let j = 0; j < base.length; j++) {
      const from = ends[j], to = ends[(j + 1) % base.length], span = (to - from + 4 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
      const into = (d - from + 4 * Math.PI) % (2 * Math.PI);
      if (into < span) { best = j; break; }
    }
    counts[best]++;
  }
  for (let j = 0; j < counts.length; j++) while (counts[j] < 1) { const most = counts.indexOf(Math.max(...counts)); counts[most]--; counts[j]++; }
  const pieces: Cubic[] = [];
  base.forEach((curve, j) => {
    let rest = curve;
    for (let m = counts[j]; m > 1; m--) { const [head, tail] = split(rest, 1 / m); pieces.push(head); rest = tail; }
    pieces.push(rest);
  });
  // the dot's own winding: reverse the anticlockwise outline for a clockwise dot
  const turned = area > 0 ? pieces : pieces.map(([p, q, r, s]) => [s, r, q, p] as Cubic).reverse();
  let shift = 0, least = Infinity;
  for (let s = 0; s < n; s++) {
    let cost = 0;
    for (let i = 0; i < n; i++) cost += gap(angle(turned[(i + s) % n][0], centre, a, b), directions[i]);
    if (cost < least - 1e-9) { least = cost; shift = s; }
  }
  return Array.from({ length: n }, (_, i) => {
    const curve = turned[(i + shift) % n], previous = turned[(i + shift + n - 1) % n], p = curve[0];
    const node: Node = { x: p.x, y: p.y, ix: previous[2].x, iy: previous[2].y, ox: curve[1].x, oy: curve[1].y };
    const ax = p.x - previous[2].x, ay = p.y - previous[2].y, bx = curve[1].x - p.x, by = curve[1].y - p.y, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la > 0 && lb > 0 && (ax * bx + ay * by) / (la * lb) > 0.995) node.s = 1;
    return node;
  });
}

/** `font` with every bound dot drawn as `shape`. Glyphs without a binding are the font's own objects. */
export function shapeSourceDots(font: FreeFont, components: SourceComponents, policy: SourceDotPolicy, shape: DotShape): FreeFont {
  const glyphs = { ...font.glyphs };
  for (const binding of components.data.glyphs) {
    const drawn = glyphs[binding.glyph];
    if (!drawn) continue;
    const onBaseline = policy.baseline.includes(`${binding.glyph}:${binding.id}`);
    glyphs[binding.glyph] = { ...drawn, contours: drawn.contours.map((contour, ci) =>
      binding.contours.includes(ci) ? dotShapeContour(contour, shape, policy, onBaseline) : contour) };
  }
  return { ...font, glyphs };
}
