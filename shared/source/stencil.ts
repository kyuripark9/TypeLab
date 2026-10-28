/* Stencil on source ink: the letters cut apart where their strokes join, as if cut from a sheet, and every counter
   opened so nothing floats loose in the plate. At a join (found on the filled ink, joins.ts) the stroke running into
   another is cut across, the gap parallel to the stroke it runs into, so a gap beside a stem stands upright and one
   beside a bar lies level; Position slides it out along the stroke. Where two strokes come to a point (v, the inside
   of M and A's top) the cut runs down the point instead. A counter still closed after that (O, o, 0, D's) is cut at its
   two thinnest places, as far apart round it as they can be. Rounding rounds the corners the cuts make. */
import { ClipType, Clipper64, FillRule, PolyTree64, type Paths64, type PolyPath64 } from 'clipper2-ts';
import { EndType } from '../vendor/clipper2-offset';
import type { Params } from '../params';
import type { Cmd, Pt } from '../engine/types';
import { area, ball, clip, commands, failure, flatten, fromGrid, offset, toGrid, tree, type Tree } from './ink';
import { crotches, type JoinFinding } from './joins';

export interface SourceStencilPolicy {
  format: 'source-stencil-v1';
  /** the gap's width at Stencil 100, as a share of the cap height */
  gap: number;
  /** how far out along its stroke Position 100 slides a join's gap, as a multiple of the stroke's thickness */
  offset: number;
  /** the least turn, in degrees, of a corner where two strokes come to a point, cut down the point */
  point: number;
  /** how far a cut may run to cross its stroke, as a multiple of the join's depth */
  span: number;
  /** the longest stroke ending where the stroke it joins does that is a serif, left joined, as a share of the cap height */
  serif: number;
  /** what counts as a join (joins.ts): the least turn in degrees and the reach as shares of the cap height, of a sharp
      corner and of a rounded crotch; how far each side runs on, and how far apart the circles reach */
  turn: readonly [number, number];
  reach: readonly [number, number];
  run: number;
  apart: number;
  tolerance: number;
}
export interface StencilPlan {
  gap: number; offset: number; point: number; span: number; round: number; joins: JoinFinding; tolerance: number;
  /** the least ink a cut may leave as a piece of its own */
  speck: number;
  /** the longest stroke ending with the one it joins that counts as a serif, in font units */
  serif: number;
}

const finite = (n: unknown, low: number, high: number): number => {
  if (typeof n !== 'number' || !(n >= low && n <= high)) throw new RangeError('Invalid source stencil dimension');
  return n;
};
function pair(input: unknown, low: number, high: number): [number, number] {
  if (!Array.isArray(input) || input.length !== 2) throw new RangeError('Invalid source stencil interval');
  const a = finite(input[0], low, high), b = finite(input[1], low, high);
  if (!(a <= b)) throw new RangeError('Invalid source stencil interval');
  return [a, b];
}
const KEYS = ['format', 'gap', 'offset', 'point', 'span', 'serif', 'turn', 'reach', 'run', 'apart', 'tolerance'];
export function parseSourceStencil(input: unknown): SourceStencilPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source stencil policy');
  const value = Object.fromEntries(Object.entries(input));
  if (Object.keys(value).some(key => !KEYS.includes(key))) throw new TypeError('Unknown source stencil field');
  if (value.format !== 'source-stencil-v1') throw new TypeError('Unsupported source stencil policy');
  return { format: 'source-stencil-v1', gap: finite(value.gap, .005, .4), offset: finite(value.offset, 0, 5), point: finite(value.point, 60, 179),
    span: finite(value.span, .5, 10), serif: finite(value.serif, 0, .5), turn: pair(value.turn, 10, 170), reach: pair(value.reach, 0, .1), run: finite(value.run, 0, 10),
    apart: finite(value.apart, 0, 4), tolerance: finite(value.tolerance, .01, .5) };
}
export const sourceStencilExtends = (a: SourceStencilPolicy, b: SourceStencilPolicy): boolean =>
  KEYS.every(key => JSON.stringify(a[key as keyof SourceStencilPolicy]) === JSON.stringify(b[key as keyof SourceStencilPolicy]));
export function compileStencil(policy: SourceStencilPolicy, request: Pick<Params, 'stencil' | 'stencilPos' | 'stencilRound'>,
  capHeight: number): StencilPlan | undefined {
  if (!(request.stencil > 0)) return undefined;
  if (![request.stencil, request.stencilPos, request.stencilRound].every(n => Number.isFinite(n) && n >= 0 && n <= 1)
    || !Number.isFinite(capHeight) || capHeight <= 0) throw new RangeError('Invalid source stencil coordinates');
  const rad = Math.PI / 180;
  return { gap: policy.gap * capHeight * request.stencil, offset: policy.offset * request.stencilPos, point: policy.point * rad,
    span: policy.span, round: request.stencilRound, tolerance: policy.tolerance, speck: (capHeight * .03) ** 2, serif: policy.serif * capHeight,
    joins: { turn: [policy.turn[0] * rad, policy.turn[1] * rad], reach: [policy.reach[0] * capHeight, policy.reach[1] * capHeight],
      run: policy.run, apart: policy.apart, chamfers: true } };
}

/** How far a ray from `p` along `dir` runs before it leaves the ink, `limit` at most: past the ink it starts in, or
    the first ink it enters when it starts outside. */
function exit(polys: Pt[][], p: Pt, dir: Pt, limit: number): number {
  const hits: number[] = [];
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b.x - a.x, ey = b.y - a.y, det = dir.x * -ey + dir.y * ex;
    if (Math.abs(det) < 1e-12) continue;
    const qx = a.x - p.x, qy = a.y - p.y, t = (qx * -ey + qy * ex) / det, u = (dir.x * qy - dir.y * qx) / det;
    if (t > 1e-9 && u >= 0 && u < 1) hits.push(t);
  }
  hits.sort((a, b) => a - b);
  // united ink doesn't overlap itself, so a ray from inside it crosses its edge an odd number of times
  const inside = hits.length % 2 === 1, out = hits[inside ? 0 : 1];
  return out !== undefined && out < limit ? out : limit;
}
/** A band `width` wide along `dir` from `from` to `to` (distances along it from `p`), centred on the line through `p`. */
function band(p: Pt, dir: Pt, from: number, to: number, width: number): Pt[] {
  const side = { x: -dir.y * width / 2, y: dir.x * width / 2 };
  const a = { x: p.x + dir.x * from, y: p.y + dir.y * from }, b = { x: p.x + dir.x * to, y: p.y + dir.y * to };
  return [{ x: a.x - side.x, y: a.y - side.y }, { x: b.x - side.x, y: b.y - side.y }, { x: b.x + side.x, y: b.y + side.y }, { x: a.x + side.x, y: a.y + side.y }];
}

/** Whether a point lies in the ink: united ink doesn't overlap itself, so a ray from inside crosses its edge oddly often. */
function inside(polys: Pt[][], p: Pt): boolean {
  let odd = false;
  for (const poly of polys) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) odd = !odd;
  }
  return odd;
}

/** The cuts at the joins. */
function joinCuts(polys: Pt[][], plan: StencilPlan): Pt[][] {
  const out: Pt[][] = [], back = plan.tolerance * 4, found = crotches(polys, plan.joins);
  /** A cut from `from` along `dir`, upright or level where that crosses the ink as soon as the way itself does. */
  const cut = (from: Pt, dir: Pt, limit: number, behind: number) => {
    const ways = [Math.abs(dir.x) >= Math.abs(dir.y) ? { x: Math.sign(dir.x), y: 0 } : { x: 0, y: Math.sign(dir.y) }, dir];
    for (const way of ways) {
      const length = exit(polys, { x: from.x + way.x * back, y: from.y + way.y * back }, way, limit);
      if (length < limit) { out.push(band(from, way, -behind, length + back + plan.gap / 2, plan.gap)); return; }
    }
  };
  for (const c of found) {
    const [a, b] = c.sides, limit = plan.span * c.depth;
    // two strokes coming to a point, neither the other's host: down the point
    if (c.turn >= plan.point && Math.max(a.thick, b.thick) < Math.min(a.thick, b.thick) * 1.3) { cut(c.at, c.into, limit, plan.gap); continue; }
    // a stroke running into another: its host is the thicker, or, as thick, the more upright (a stem, beside which a
    // gap stands upright)
    const upright = (s: typeof a) => Math.abs(s.way.y);
    const host = a.thick > b.thick * 1.15 ? a : b.thick > a.thick * 1.15 ? b : upright(a) >= upright(b) ? a : b;
    const joining = host === a ? b : a, away = { x: -host.normal.x, y: -host.normal.y }, across = { x: -host.way.x, y: -host.way.y };
    // a stub too short to cut from, a beak at a bar's end or a spur
    if (away.x * joining.way.x + away.y * joining.way.y <= .1 || Math.min(a.run, b.run) < plan.serif * .6) continue;
    // a serif: its stroke ends where the host does, and is short or stands out on both sides of the host (an E's top
    // arm runs on, on one side)
    const through = exit(polys, { x: c.at.x + away.x * plan.gap / 2 + across.x * back, y: c.at.y + away.y * plan.gap / 2 + across.y * back }, across, limit);
    const beyond = { x: c.at.x + across.x * (through + plan.gap) + host.normal.x * host.thick / 2,
      y: c.at.y + across.y * (through + plan.gap) + host.normal.y * host.thick / 2 };
    const facing = found.some(o => o !== c && Math.hypot(o.at.x - (c.at.x + host.normal.x * host.thick), o.at.y - (c.at.y + host.normal.y * host.thick)) < host.thick * .35);
    if (through < limit && !inside(polys, beyond) && (joining.run < plan.serif || facing)) continue;
    // cut across it parallel to the host's edge, out from the host by Position
    const shift = plan.offset * joining.thick + plan.gap / 2;
    cut({ x: c.at.x + away.x * shift, y: c.at.y + away.y * shift }, across, limit, back + plan.gap);
  }
  return out;
}

/** Every hole in the ink, as a polygon, with its tree of edges for growing circles. */
function holes(paths: Paths64): Pt[][] {
  const clipper = new Clipper64(), solution = new PolyTree64();
  clipper.addSubject(paths);
  if (!clipper.execute(ClipType.Union, FillRule.NonZero, solution)) failure('stencil', 'normalization', 'Stencil union did not complete');
  const out: Pt[][] = [];
  const visit = (node: PolyTree64 | PolyPath64) => {
    for (let i = 0; i < node.count; i++) {
      const child = node.child(i);
      if (child.isHole && child.polygon) out.push(fromGrid(child.polygon));
      visit(child);
    }
  };
  visit(solution);
  return out;
}

/** Two cuts across the ring round a closed counter, at its thinnest, as far apart round it as can be. */
function counterCuts(hole: Pt[], polys: Pt[][], root: Tree, start: number, plan: StencilPlan): Pt[][] {
  const centre = hole.reduce((c, p) => ({ x: c.x + p.x / hole.length, y: c.y + p.y / hole.length }), { x: 0, y: 0 });
  const size = Math.max(...hole.map(p => Math.hypot(p.x - centre.x, p.y - centre.y)), plan.tolerance);
  // the ink lies outside the counter: to the left of its edge where the counter runs clockwise
  const sign = area(hole) < 0 ? 1 : -1, spacing = Math.max(plan.tolerance * 10, plan.gap / 2);
  const found: { p: Pt; n: Pt; r: number; score: number; angle: number }[] = [];
  for (let i = 0; i < hole.length; i++) {
    const a = hole[i], b = hole[(i + 1) % hole.length], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (!l) continue;
    // out of the counter into the ink
    const n = { x: -(b.y - a.y) / l * sign, y: (b.x - a.x) / l * sign };
    // a counter's cut runs upright or level, whichever is nearer the way across the ring
    const d = Math.abs(n.x) >= Math.abs(n.y) ? { x: Math.sign(n.x), y: 0 } : { x: 0, y: Math.sign(n.y) };
    for (let k = 0, count = Math.max(1, Math.round(l / spacing)); k < count; k++) {
      const t = (k + .5) / count, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, m = ball(root, p, n, start);
      if (!m) continue;
      // the shortest cut across the ring, a level one (across the top or foot of a ring) liked a little better, and
      // one across the middle of a flat side
      const length = exit(polys, { x: p.x + d.x * plan.tolerance * 4, y: p.y + d.y * plan.tolerance * 4 }, d, m.r * 2 * plan.span + plan.gap);
      if (length >= m.r * 2 * plan.span) continue;
      const aside = Math.abs(d.y ? p.x - centre.x : p.y - centre.y) / size;
      found.push({ p, n: d, r: length, score: length * (1 + .15 * Math.abs(d.x)) * (1 + .1 * aside), angle: Math.atan2(p.y - centre.y, p.x - centre.x) });
    }
  }
  if (!found.length) return [];
  found.sort((a, b) => a.score - b.score);
  const first = found[0], opposite = (q: typeof first) => Math.abs(Math.atan2(Math.sin(q.angle - first.angle), Math.cos(q.angle - first.angle)));
  const second = found.filter(q => opposite(q) >= Math.PI * 2 / 3).sort((a, b) => a.score - b.score)[0];
  return [first, ...(second ? [second] : [])].map(q => band(q.p, q.n, -plan.gap, q.r + plan.gap, plan.gap));
}

/** The ink cut as a stencil. */
export function stencilSourceInk(cmds: Cmd[], plan: StencilPlan): Cmd[] {
  if (!cmds.length) return cmds;
  const ink = clip(ClipType.Union, flatten(cmds, plan.tolerance / 4, 'stencil').map(toGrid), [], 'stencil');
  if (!ink.length) return cmds;
  const polys = ink.map(fromGrid), cuts = joinCuts(polys, plan);
  let cut = cuts.length ? clip(ClipType.Difference, ink, cuts.map(toGrid), 'stencil') : ink;
  // open every counter the joins' cuts left closed
  for (let pass = 0; pass < 3; pass++) {
    const closed = holes(cut);
    if (!closed.length) break;
    const now = cut.map(fromGrid), edges = now.flatMap(p => p.map((a, i) => ({ a, b: p[(i + 1) % p.length] })));
    const root = tree(edges), start = Math.hypot(root.x1 - root.x0, root.y1 - root.y0);
    const more = closed.flatMap(hole => counterCuts(hole, now, root, start, plan));
    if (!more.length) break;
    cuts.push(...more);
    cut = clip(ClipType.Difference, cut, more.map(toGrid), 'stencil');
  }
  if (!cuts.length) return cmds;
  // a speck of ink left between two cuts goes (a piece turns the way the biggest does; a counter the other)
  const areas = cut.map(path => area(fromGrid(path))), big = areas.reduce((m, a) => Math.abs(a) > Math.abs(m) ? a : m, 0);
  cut = cut.filter((_, i) => Math.sign(areas[i]) !== Math.sign(big) || Math.abs(areas[i]) >= plan.speck);
  if (plan.round > 0) {
    // round the corners the cuts made: the ink opened (shrunk and grown back) near the cuts, as it was elsewhere
    const radius = plan.round * plan.gap / 2;
    const near = offset(cuts.map(toGrid), radius * 3, plan.tolerance, EndType.Polygon, 'stencil');
    const opened = offset(offset(cut, -radius, plan.tolerance, EndType.Polygon, 'stencil'), radius, plan.tolerance, EndType.Polygon, 'stencil');
    cut = clip(ClipType.Union, clip(ClipType.Intersection, opened, near, 'stencil'), clip(ClipType.Difference, cut, near, 'stencil'), 'stencil');
  }
  return commands(cut);
}
