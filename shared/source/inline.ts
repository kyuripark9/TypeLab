/* Line finishes for source ink: Inline, a line cut down the middle of every stroke, and Wire, each drawn contour as a
   thin ring, like the construction lines of a letter. A source has no skeleton to run an inline down, so the middle
   of its strokes is found from the filled ink itself: from every point of the edge the largest circle inside the ink
   that touches it there. Where that circle also touches the far side of the stroke, its centre is the middle of the
   stroke and its radius half the stroke's thickness; where it touches the side next to a corner instead, it is the
   corner's, not a stroke's, and is left out. The line is a share of each stroke's own thickness, so hairlines carry a
   finer line and nothing cuts through the edge. */
import { Clipper64, ClipType, FillRule, type Paths64 } from 'clipper2-ts';
import { ClipperOffset, EndType, JoinType } from '../vendor/clipper2-offset';
import type { Cmd, Pt } from '../engine/types';
import { SourceEffectError } from './effect-error';

export interface SourceInlinePolicy {
  format: 'source-inline-v1';
  /** the line's width as a share of the stroke it runs down, at Size 0 and 1 */
  width: readonly [number, number];
  /** the least angles, in degrees, between the two points where a circle touches the edge for its centre to count
      as a stroke's middle: anywhere along a line, and at its ends. A stroke's circles touch at 180°, a join's above
      120°, and a corner's at 180° less its own angle: a right angle's at 90°, a sharp end's (a diagonal cut level)
      at 135°. So the line runs through joins but stops where its stroke does, short of the corners. */
  angle: readonly [number, number];
  /** the least ink kept either side of the line, and the finest line cut, as shares of the cap height */
  rim: number;
  /** how far the flattened edge and the line's curves may stray, in font units */
  tolerance: number;
}
export interface SourceWirePolicy {
  format: 'source-wire-v1';
  /** the ring's width as a share of the cap height, at Size 0 and 1 */
  line: readonly [number, number];
  tolerance: number;
}
export interface InlinePlan { kind: 'inline'; width: number; angle: readonly [number, number]; rim: number; tolerance: number }
export interface WirePlan { kind: 'wire'; line: number; tolerance: number }

function interval(input: unknown, low: number, high: number): [number, number] {
  if (!Array.isArray(input) || input.length !== 2 || !input.every(n => typeof n === 'number' && Number.isFinite(n))
    || !(input[0] > low && input[0] < input[1] && input[1] <= high)) throw new RangeError('Invalid source line interval');
  return [input[0], input[1]];
}
function fields(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source line policy');
  const value = Object.fromEntries(Object.entries(input));
  if (Object.keys(value).some(key => !keys.includes(key))) throw new TypeError('Unknown source line field');
  return value;
}
const finite = (n: unknown, low: number, high: number): number => {
  if (typeof n !== 'number' || !(n >= low && n <= high)) throw new RangeError('Invalid source line dimension');
  return n;
};
export function parseSourceInline(input: unknown): SourceInlinePolicy {
  const value = fields(input, ['format', 'width', 'angle', 'rim', 'tolerance']);
  if (value.format !== 'source-inline-v1') throw new TypeError('Unsupported source inline policy');
  return { format: 'source-inline-v1', width: interval(value.width, 0, .6), angle: interval(value.angle, 90, 180),
    rim: finite(value.rim, 1e-4, .05), tolerance: finite(value.tolerance, .01, .5) };
}
export function parseSourceWire(input: unknown): SourceWirePolicy {
  const value = fields(input, ['format', 'line', 'tolerance']);
  if (value.format !== 'source-wire-v1') throw new TypeError('Unsupported source wire policy');
  return { format: 'source-wire-v1', line: interval(value.line, 0, .1), tolerance: finite(value.tolerance, .01, .5) };
}
export const sourceInlineExtends = (a: SourceInlinePolicy, b: SourceInlinePolicy): boolean => a.width[0] === b.width[0]
  && a.width[1] === b.width[1] && a.angle[0] === b.angle[0] && a.angle[1] === b.angle[1] && a.rim === b.rim && a.tolerance === b.tolerance;
export const sourceWireExtends = (a: SourceWirePolicy, b: SourceWirePolicy): boolean => a.line[0] === b.line[0]
  && a.line[1] === b.line[1] && a.tolerance === b.tolerance;

export function compileInline(policy: SourceInlinePolicy, size: number, capHeight: number): InlinePlan {
  return { kind: 'inline', width: policy.width[0] + (policy.width[1] - policy.width[0]) * size, angle: policy.angle,
    rim: policy.rim * capHeight, tolerance: policy.tolerance };
}
export function compileWire(policy: SourceWirePolicy, size: number, capHeight: number): WirePlan {
  return { kind: 'wire', line: capHeight * (policy.line[0] + (policy.line[1] - policy.line[0]) * size), tolerance: policy.tolerance };
}

const GRID = 1e-5;
type Cubic = [Pt, Pt, Pt, Pt];
const failure = (effect: 'inline' | 'wire', reason: 'normalization' | 'tolerance' | 'complexity', message: string): never => {
  throw new SourceEffectError(effect, reason, message);
};
const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function area(poly: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; sum += a.x * b.y - b.x * a.y; }
  return sum / 2;
}
/** The drawing's contours as polygons within `tolerance` of its curves. */
function flatten(cmds: Cmd[], tolerance: number, effect: 'inline' | 'wire'): Pt[][] {
  if (cmds.length > 16384) failure(effect, 'complexity', 'Source exceeds the line command budget');
  const result: Pt[][] = []; let poly: Pt[] = [], at: Pt = { x: 0, y: 0 }, count = 0;
  const add = (point: Pt) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1e6 || Math.abs(point.y) > 1e6) failure(effect, 'normalization', 'Source has an unsupported coordinate');
    if (++count > 65536) failure(effect, 'complexity', 'Source exceeds the line point budget');
    if (!poly.length || poly.at(-1)!.x !== point.x || poly.at(-1)!.y !== point.y) poly.push(point);
    at = point;
  };
  const off = (p: Pt, a: Pt, b: Pt) => {
    const x = b.x - a.x, y = b.y - a.y, length = x * x + y * y;
    const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / length)) : 0;
    return Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y);
  };
  const curve = ([a, b, c, d]: Cubic, depth: number) => {
    if (Math.max(off(b, a, d), off(c, a, d)) <= tolerance && depth >= 1) { add(d); return; }
    if (depth >= 24) failure(effect, 'tolerance', 'A source curve cannot be flattened within the line tolerance');
    const ab = midpoint(a, b), bc = midpoint(b, c), cd = midpoint(c, d), abc = midpoint(ab, bc), bcd = midpoint(bc, cd), m = midpoint(abc, bcd);
    curve([a, ab, abc, m], depth + 1); curve([m, bcd, cd, d], depth + 1);
  };
  const close = () => {
    if (poly.length > 1 && poly[0].x === poly.at(-1)!.x && poly[0].y === poly.at(-1)!.y) poly.pop();
    if (poly.length > 2 && area(poly) !== 0) result.push(poly);
    poly = [];
  };
  for (const cmd of cmds) {
    if (cmd[0] === 'M') { close(); add({ x: cmd[1], y: cmd[2] }); }
    else if (cmd[0] === 'L') add({ x: cmd[1], y: cmd[2] });
    else if (cmd[0] === 'C') curve([at, { x: cmd[1], y: cmd[2] }, { x: cmd[3], y: cmd[4] }, { x: cmd[5], y: cmd[6] }], 0);
    else close();
  }
  close(); return result;
}
const toGrid = (poly: Pt[]) => poly.map(p => ({ x: Math.round(p.x / GRID), y: Math.round(p.y / GRID) }));
const fromGrid = (poly: Pt[]) => poly.map(p => ({ x: p.x * GRID, y: p.y * GRID }));
function clip(type: ClipType, subject: Paths64, clips: Paths64, effect: 'inline' | 'wire'): Paths64 {
  const clipper = new Clipper64(), out: Paths64 = [];
  clipper.addSubject(subject); if (clips.length) clipper.addClip(clips);
  if (!clipper.execute(type, FillRule.NonZero, out)) failure(effect, 'normalization', 'Source line clipping did not complete');
  return out;
}
function offset(paths: Paths64, distance: number, tolerance: number, end: EndType, effect: 'inline' | 'wire'): Paths64 {
  const out: Paths64 = [], kernel = new ClipperOffset(2, tolerance / GRID);
  kernel.addPaths(paths, JoinType.Round, end);
  try { kernel.execute(distance / GRID, out); }
  catch (error) { failure(effect, 'normalization', `Source line offset did not complete: ${error instanceof Error ? error.message : String(error)}`); }
  return out;
}
const commands = (paths: Paths64): Cmd[] => paths.flatMap(path => {
  const poly = fromGrid(path);
  return [...poly.map((p, i): Cmd => [i ? 'L' : 'M', p.x, p.y]), ['Z'] satisfies Cmd];
});

interface Edge { a: Pt; b: Pt }
interface Box { x0: number; y0: number; x1: number; y1: number }
type Tree = Box & ({ leaf: Edge[] } | { left: Tree; right: Tree });
function tree(edges: Edge[]): Tree {
  const box = edges.reduce<Box>((b, e) => ({ x0: Math.min(b.x0, e.a.x, e.b.x), y0: Math.min(b.y0, e.a.y, e.b.y),
    x1: Math.max(b.x1, e.a.x, e.b.x), y1: Math.max(b.y1, e.a.y, e.b.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  if (edges.length <= 8) return { ...box, leaf: edges };
  const axis = box.x1 - box.x0 >= box.y1 - box.y0 ? 'x' : 'y';
  edges.sort((a, b) => a.a[axis] + a.b[axis] - b.a[axis] - b.b[axis]);
  const half = edges.length >> 1;
  return { ...box, left: tree(edges.slice(0, half)), right: tree(edges.slice(half)) };
}
function closestOn(p: Pt, e: Edge): Pt {
  const x = e.b.x - e.a.x, y = e.b.y - e.a.y, length = x * x + y * y;
  const t = length ? Math.max(0, Math.min(1, ((p.x - e.a.x) * x + (p.y - e.a.y) * y) / length)) : 0;
  return { x: e.a.x + t * x, y: e.a.y + t * y };
}
/** The edge point nearest `p`. */
function nearest(root: Tree, p: Pt): { point: Pt; distance: number } {
  let best = Infinity, bx = p.x, by = p.y;
  const gap = (n: Tree) => Math.max(n.x0 - p.x, p.x - n.x1, 0) ** 2 + Math.max(n.y0 - p.y, p.y - n.y1, 0) ** 2;
  // nearer boxes first, each skipped once it lies further than the nearest edge found
  const stack: Tree[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (gap(node) >= best) continue;
    if ('leaf' in node) {
      for (const e of node.leaf) {
        const x = e.b.x - e.a.x, y = e.b.y - e.a.y, length = x * x + y * y;
        const t = length ? Math.max(0, Math.min(1, ((p.x - e.a.x) * x + (p.y - e.a.y) * y) / length)) : 0;
        const qx = e.a.x + t * x, qy = e.a.y + t * y, d = (qx - p.x) ** 2 + (qy - p.y) ** 2;
        if (d < best) { best = d; bx = qx; by = qy; }
      }
    } else if (gap(node.left) <= gap(node.right)) stack.push(node.right, node.left);
    else stack.push(node.left, node.right);
  }
  return { point: { x: bx, y: by }, distance: Math.sqrt(best) };
}

/** A point of the stroke's middle: the centre of the largest circle in the ink touching the edge at a sample, its
    radius, and the angle at the centre between that touch and the other. */
interface Middle { c: Pt; r: number; angle: number }
/** The largest circle inside the ink touching the edge at `p`, its centre along the inward normal `n`. */
function ball(root: Tree, p: Pt, n: Pt, start: number, guess = start): Middle | null {
  // a guess near the last circle's size saves shrinking from the whole letter; one that touches nothing was too small
  if (guess < start) { const near = ball(root, p, n, guess); if (near) return near; }
  let r = start, touch: Pt | null = null;
  for (let step = 0; step < 48; step++) {
    const c = { x: p.x + n.x * r, y: p.y + n.y * r }, { point, distance } = nearest(root, c);
    if (distance >= r * (1 - 1e-9) - 1e-9) break;
    const dx = point.x - p.x, dy = point.y - p.y, across = 2 * (n.x * dx + n.y * dy);
    if (across <= 1e-12) break;
    const next = (dx * dx + dy * dy) / across;
    if (!(next < r)) break;
    r = next; touch = point;
  }
  if (!touch || r <= 0) return null;
  const c = { x: p.x + n.x * r, y: p.y + n.y * r };
  const u = { x: p.x - c.x, y: p.y - c.y }, v = { x: touch.x - c.x, y: touch.y - c.y };
  const angle = Math.atan2(Math.abs(u.x * v.y - u.y * v.x), u.x * v.x + u.y * v.y) * 180 / Math.PI;
  return { c, r, angle };
}

/** The middles of the ink's strokes, as runs of neighbouring centres along each edge. */
function middles(polys: Pt[][], plan: InlinePlan): Middle[][] {
  const { rim } = plan;
  const edges = polys.flatMap(p => p.map((a, i) => ({ a, b: p[(i + 1) % p.length] })));
  const root = tree(edges), start = Math.hypot(root.x1 - root.x0, root.y1 - root.y0);
  // the ink lies to the left of each contour when the outer ones run anticlockwise and the holes clockwise
  const sign = area(polys.reduce((big, p) => Math.abs(area(p)) > Math.abs(area(big)) ? p : big)) > 0 ? 1 : -1;
  const spacing = Math.max(plan.tolerance * 4, rim), runs: Middle[][] = [];
  let work = 0;
  for (const poly of polys) {
    const samples: Middle[] = [];
    const take = (p: Pt, n: Pt, join = false) => {
      if (++work > 60000) failure('inline', 'complexity', 'Inline exceeds its sampling budget');
      const last = samples.at(-1), m = ball(root, p, n, start, last?.r ? last.r * 1.5 + spacing : start);
      samples.push(m && (join || m.angle >= plan.angle[0]) && m.r * plan.width >= rim / 2 && m.r * (1 - plan.width) >= rim ? m : { c: p, r: 0, angle: 0 });
    };
    for (let i = 0; i < poly.length; i++) {
      const prev = poly[(i + poly.length - 1) % poly.length], a = poly[i], b = poly[(i + 1) % poly.length];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (!length) continue;
      const n = { x: -(b.y - a.y) / length * sign, y: (b.x - a.x) / length * sign };
      // at a corner turning away from the ink (the inside of a join), the edge's normal sweeps round the corner:
      // those circles run the middle of one stroke into the next. Only a corner turning into the ink ends a stroke,
      // so these count whatever their angle: a thin bar's circles, running on into a thick stem, touch only the bar's
      // two inside corners
      const before = Math.hypot(a.x - prev.x, a.y - prev.y);
      if (before) {
        const m = { x: -(a.y - prev.y) / before * sign, y: (a.x - prev.x) / before * sign };
        const turn = Math.atan2(m.x * n.y - m.y * n.x, m.x * n.x + m.y * n.y) * sign;
        if (turn < 0) {
          const steps = Math.floor(-turn / (Math.PI / 18));
          for (let k = 1; k <= steps; k++) {
            const t = k / (steps + 1), x = m.x + (n.x - m.x) * t, y = m.y + (n.y - m.y) * t, l = Math.hypot(x, y);
            if (l) take(a, { x: x / l, y: y / l }, true);
          }
        }
      }
      const count = Math.max(1, Math.round(length / spacing));
      for (let k = 0; k < count; k++) {
        const t = (k + .5) / count;
        take({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, n);
      }
    }
    // neighbouring centres run on together unless one jumps across to another stroke; a line passing the contour's
    // start runs on round it
    const near = (a: Middle, b: Middle) => Math.hypot(b.c.x - a.c.x, b.c.y - a.c.y) <= Math.min(a.r, b.r) * .6 + spacing;
    const own: Middle[][] = [];
    let run: Middle[] = [];
    const end = () => { if (run.length) own.push(run); run = []; };
    for (const s of samples) {
      if (!s.r) { end(); continue; }
      const last = run.at(-1);
      if (last && !near(last, s)) end();
      run.push(s);
    }
    end();
    if (own.length > 1 && samples[0].r && samples.at(-1)!.r && near(samples.at(-1)!, samples[0])) own[0] = [...own.pop()!, ...own[0]];
    runs.push(...own);
  }
  // a line's ends stop where its circles leave the stroke for a corner, shrinking as they go into it; where they run
  // on into a join they stay. Through a join, where the circles swell, the line keeps the width of the strokes either
  // side
  const strong = (m: Middle) => m.angle >= plan.angle[1];
  return runs.map(run => {
    let i = 0, j = run.length;
    while (i + 1 < j && !strong(run[i]) && run[i].r <= run[i + 1].r) i++;
    while (j - 1 > i && !strong(run[j - 1]) && run[j - 1].r <= run[j - 2].r) j--;
    const kept = run.slice(i, j);
    if (!kept.some(strong)) return [];
    for (let k = 0, before = -1; k < kept.length; k++) {
      if (strong(kept[k])) { before = k; continue; }
      let after = k + 1;
      while (after < kept.length && !strong(kept[after])) after++;
      const from = before >= 0 ? kept[before].r : kept[after].r, to = after < kept.length ? kept[after].r : from;
      const t = before >= 0 && after < kept.length ? (k - before) / (after - before) : 0;
      kept[k] = { ...kept[k], r: Math.min(kept[k].r, from + (to - from) * t) };
    }
    return kept;
  }).filter(run => run.length);
}

/** A run with only the centres it needs: those whose place or circle a straight run between its neighbours would miss
    by more than `tolerance`. */
function simplified(run: Middle[], tolerance: number): Middle[] {
  if (run.length < 3) return run;
  const keep = new Uint8Array(run.length); keep[0] = keep[run.length - 1] = 1;
  const stack: [number, number][] = [[0, run.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!, a = run[i], b = run[j];
    let worst = tolerance, at = -1;
    for (let k = i + 1; k < j; k++) {
      const m = run[k], q = closestOn(m.c, { a: a.c, b: b.c }), along = Math.hypot(b.c.x - a.c.x, b.c.y - a.c.y);
      const t = along ? Math.hypot(q.x - a.c.x, q.y - a.c.y) / along : 0;
      const off = Math.max(Math.hypot(m.c.x - q.x, m.c.y - q.y), Math.abs(m.r - (a.r + (b.r - a.r) * t)));
      if (off > worst) { worst = off; at = k; }
    }
    if (at >= 0) { keep[at] = 1; stack.push([i, at], [at, j]); }
  }
  return run.filter((_, k) => keep[k]);
}

/** The outline of a line as wide as a share of each circle along a run, round at its ends. */
function band(run: Middle[], share: number, tolerance: number): Pt[][] {
  const out: Pt[][] = [];
  const circle = (c: Pt, r: number, from: number, to: number): Pt[] => {
    const step = 2 * Math.acos(Math.max(-1, 1 - tolerance / Math.max(r, tolerance))), count = Math.max(2, Math.ceil((to - from) / step));
    return Array.from({ length: count + 1 }, (_, k) => { const t = from + (to - from) * k / count; return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) }; });
  };
  if (run.length === 1) return [circle(run[0].c, run[0].r * share, 0, 2 * Math.PI).slice(0, -1)];
  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1], b = run[i], ra = a.r * share, rb = b.r * share, d = Math.hypot(b.c.x - a.c.x, b.c.y - a.c.y);
    if (d <= Math.abs(ra - rb)) { const big = ra >= rb ? a : b; out.push(circle(big.c, Math.max(ra, rb), 0, 2 * Math.PI).slice(0, -1)); continue; }
    const toward = Math.atan2(b.c.y - a.c.y, b.c.x - a.c.x), spread = Math.acos((ra - rb) / d);
    out.push([...circle(a.c, ra, toward + spread, toward + 2 * Math.PI - spread), ...circle(b.c, rb, toward - spread, toward + spread)]);
  }
  return out;
}

/** The ink with a line cut down the middle of its strokes. */
export function inlineSourceInk(cmds: Cmd[], plan: InlinePlan): Cmd[] {
  if (!cmds.length) return cmds;
  const ink = clip(ClipType.Union, flatten(cmds, plan.tolerance / 4, 'inline').map(toGrid), [], 'inline');
  if (!ink.length) return cmds;
  const polys = ink.map(fromGrid), lines = middles(polys, plan)
    .filter(run => run.length > 1 && run.slice(1).reduce((n, m, i) => n + Math.hypot(m.c.x - run[i].c.x, m.c.y - run[i].c.y), 0) >= run[0].r * plan.width * 2)
    .flatMap(run => band(simplified(run, plan.tolerance), plan.width, plan.tolerance));
  if (lines.reduce((n, p) => n + p.length, 0) > 200000) failure('inline', 'complexity', 'Inline exceeds its line point budget');
  // the line never comes nearer the edge than the rim, wherever two centres run on round a tight turn
  const cut = lines.length ? clip(ClipType.Intersection, clip(ClipType.Union, lines.map(toGrid), [], 'inline'),
    offset(ink, -plan.rim, plan.tolerance, EndType.Polygon, 'inline'), 'inline') : [];
  // a letter with no stroke thick enough for a line, a dot or a hairline, keeps its drawn curves
  return cut.length ? commands(clip(ClipType.Difference, ink, cut, 'inline')) : cmds;
}

/** Every drawn contour as a thin ring, where it crosses another as well. */
export function wireSourceInk(cmds: Cmd[], plan: WirePlan): Cmd[] {
  if (!cmds.length) return cmds;
  const contours = flatten(cmds, plan.tolerance / 4, 'wire').map(toGrid);
  if (!contours.length) return cmds;
  return commands(clip(ClipType.Union, offset(contours, plan.line / 2, plan.tolerance, EndType.Joined, 'wire'), [], 'wire'));
}
