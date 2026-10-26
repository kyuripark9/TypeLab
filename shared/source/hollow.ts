/* Hollow source ink while retaining its boundary band and the caller's editable drawing. */
import { Clipper64, ClipType, FillRule, type Paths64 } from 'clipper2-ts';
import { ClipperOffset, EndType, JoinType } from '../vendor/clipper2-offset';
import { shape } from '../engine/boolean';
import type { Cmd, Pt } from '../engine/types';
import { SourceEffectError } from './effect-error';

export interface HollowPlan { readonly rim: number; readonly tolerance: number }
export type HollowFailure = 'normalization' | 'tolerance' | 'complexity';
export class HollowError extends SourceEffectError {
  constructor(reason: HollowFailure, message: string) { super('outline', reason, message); this.name = 'HollowError'; }
}
export interface HollowDiagnostics {
  normalization: 'polygon-union';
  sourceEdges: number;
  hollowEdges: number;
  grid: number;
  normalizationBound: number;
  /** One-sided complete-edge bound: returned face boundary to an original source curve. */
  returnedBoundaryToSourceBound: number;
  topologyWitnesses: number;
  flatteningBound: number;
  requestedRim: number;
  requestedTolerance: number;
  /** Complete-edge clearance against the normalized render face, with an additional source approximation allowance. */
  clearance: { minimum: number; maximum: number } | null;
}
export interface HollowResult { cmds: Cmd[]; diagnostics: HollowDiagnostics }
export function compileHollow(input: HollowPlan): HollowPlan {
  if (!Number.isFinite(input.rim) || !Number.isFinite(input.tolerance) || input.tolerance < .01
    || input.tolerance > .25 || input.rim < input.tolerance * 4) throw new RangeError('Invalid hollow rim or tolerance');
  return { rim: input.rim, tolerance: input.tolerance };
}

type Cubic = [Pt, Pt, Pt, Pt];
interface Edge { a: Pt; b: Pt }
const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function pointDistanceSquared(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return (p.x - a.x - dx * t) ** 2 + (p.y - a.y - dy * t) ** 2;
}
function edgeDistanceSquared(a: Edge, b: Edge): number {
  const x = a.b.x - a.a.x, y = a.b.y - a.a.y, u = b.b.x - b.a.x, v = b.b.y - b.a.y, det = x * v - y * u;
  if (det !== 0) {
    const qx = b.a.x - a.a.x, qy = b.a.y - a.a.y, t = (qx * v - qy * u) / det, s = (qx * y - qy * x) / det;
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1) return 0;
  }
  return Math.min(pointDistanceSquared(a.a, b.a, b.b), pointDistanceSquared(a.b, b.a, b.b),
    pointDistanceSquared(b.a, a.a, a.b), pointDistanceSquared(b.b, a.a, a.b));
}
function flattenAtTolerance(cmds: Cmd[], tolerance: number): { polys: Pt[][]; bound: number } {
  const polys: Pt[][] = []; let points: Pt[] = [], at: Pt = { x: 0, y: 0 }, count = 0, bound = 0;
  const add = (p: Pt) => {
    if (++count > 32768) throw new HollowError('complexity', 'Source boundary exceeds the hollow point budget');
    if (!points.length || points.at(-1)!.x !== p.x || points.at(-1)!.y !== p.y) points.push(p);
    at = p;
  };
  const walk = (q: Cubic, depth: number) => {
    const error = Math.sqrt(Math.max(pointDistanceSquared(q[1], q[0], q[3]), pointDistanceSquared(q[2], q[0], q[3])));
    if (error <= tolerance && (depth >= 2 || error === 0)) { bound = Math.max(bound, error); add(q[3]); return; }
    if (depth >= 24) throw new HollowError('tolerance', 'Source curve cannot meet the hollow boundary tolerance');
    const a = midpoint(q[0], q[1]), b = midpoint(q[1], q[2]), c = midpoint(q[2], q[3]);
    const d = midpoint(a, b), e = midpoint(b, c), f = midpoint(d, e);
    walk([q[0], a, d, f], depth + 1); walk([f, e, c, q[3]], depth + 1);
  };
  const close = () => {
    if (points.length > 1 && points[0].x === points.at(-1)!.x && points[0].y === points.at(-1)!.y) points.pop();
    if (points.length > 2) polys.push(points);
    points = [];
  };
  for (const cmd of cmds) {
    if (cmd[0] === 'M') { close(); add({ x: cmd[1], y: cmd[2] }); }
    else if (cmd[0] === 'L') add({ x: cmd[1], y: cmd[2] });
    else if (cmd[0] === 'C') walk([at, { x: cmd[1], y: cmd[2] }, { x: cmd[3], y: cmd[4] }, { x: cmd[5], y: cmd[6] }], 0);
    else close();
  }
  close(); return { polys, bound };
}
function noncollinear(points: Pt[]): boolean {
  const a = points[0], b = points.find(p => p.x !== a.x || p.y !== a.y);
  return !!b && points.some(p => (b.x - a.x) * (p.y - a.y) !== (b.y - a.y) * (p.x - a.x));
}
function flattened(cmds: Cmd[], tolerance: number): { polys: Pt[][]; bound: number } {
  const groups: Cmd[][] = []; let group: Cmd[] = [];
  for (const cmd of cmds) {
    if (cmd[0] === 'M' && group.length) { groups.push(group); group = []; }
    group.push(cmd);
  }
  if (group.length) groups.push(group);
  const polys: Pt[][] = []; let bound = 0, count = 0;
  for (const commands of groups) {
    const controls = commands.flatMap<Pt>(c => c[0] === 'Z' ? [] : c[0] === 'C'
      ? [{ x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }] : [{ x: c[1], y: c[2] }]);
    if (!noncollinear(controls)) continue;
    let limit = tolerance, flat = flattenAtTolerance(commands, limit);
    // A chord bound alone can collapse a thin curved counter to a line.
    for (let attempt = 0; (!flat.polys.length || flat.polys.every(p => !noncollinear(p))) && attempt < 20; attempt++) {
      limit /= 4; flat = flattenAtTolerance(commands, limit);
    }
    if (!flat.polys.length || flat.polys.some(p => !noncollinear(p))) throw new HollowError('tolerance', 'Cannot retain a source boundary at the available precision');
    count += flat.polys.reduce((n, p) => n + p.length, 0);
    if (count > 32768) throw new HollowError('complexity', 'Source boundary exceeds the hollow point budget');
    polys.push(...flat.polys); bound = Math.max(bound, flat.bound);
  }
  return { polys, bound };
}

interface Box { x0: number; y0: number; x1: number; y1: number }
type Tree = Box & ({ kind: 'leaf'; edges: Edge[] } | { kind: 'branch'; left: Tree; right: Tree });
function edgeBox(edge: Edge): Box {
  return { x0: Math.min(edge.a.x, edge.b.x), x1: Math.max(edge.a.x, edge.b.x),
    y0: Math.min(edge.a.y, edge.b.y), y1: Math.max(edge.a.y, edge.b.y) };
}
function boxDistance(a: Box, b: Box): number {
  return Math.max(a.x0 - b.x1, b.x0 - a.x1, 0) ** 2 + Math.max(a.y0 - b.y1, b.y0 - a.y1, 0) ** 2;
}
function distanceTree(polys: Pt[][]): Tree {
  const build = (edges: Edge[]): Tree => {
    const box = edges.reduce<Box>((b, e) => ({ x0: Math.min(b.x0, e.a.x, e.b.x), y0: Math.min(b.y0, e.a.y, e.b.y),
      x1: Math.max(b.x1, e.a.x, e.b.x), y1: Math.max(b.y1, e.a.y, e.b.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    if (edges.length <= 8) return { ...box, kind: 'leaf', edges };
    const axis = box.x1 - box.x0 >= box.y1 - box.y0 ? 'x' : 'y';
    edges.sort((a, b) => a.a[axis] + a.b[axis] - b.a[axis] - b.b[axis]);
    const half = edges.length >> 1;
    return { ...box, kind: 'branch', left: build(edges.slice(0, half)), right: build(edges.slice(half)) };
  };
  return build(polys.flatMap(p => p.map((a, i) => ({ a, b: p[(i + 1) % p.length] }))));
}
function nearest(tree: Tree, edge: Edge, skip?: (candidate: Edge, distance: number) => boolean): { distance: number; edge: Edge } {
  const box = edgeBox(edge); let best = Infinity, closest: Edge | undefined;
  const visit = (node: Tree) => {
    if (boxDistance(box, node) > best) return;
    if (node.kind === 'leaf') {
      for (const candidate of node.edges) {
        const d = edgeDistanceSquared(edge, candidate);
        if (skip?.(candidate, d)) continue;
        if (d < best) { best = d; closest = candidate; }
      }
    } else {
      if (boxDistance(box, node.left) <= boxDistance(box, node.right)) { visit(node.left); visit(node.right); }
      else { visit(node.right); visit(node.left); }
    }
  };
  visit(tree);
  if (!closest) throw new HollowError('normalization', 'Hollow source has no boundary');
  return { distance: Math.sqrt(best), edge: closest };
}

function guardUnionComplexity(polys: Pt[][]): void {
  const boxes = polys.flatMap(p => p.map((a, i) => edgeBox({ a, b: p[(i + 1) % p.length] }))).sort((a, b) => a.x0 - b.x0);
  let candidates = 0, pairs = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length && boxes[j].x0 <= boxes[i].x1; j++) {
    if (++pairs > 1000000) throw new HollowError('complexity', 'Source boundary search exceeds its interval budget');
    if (boxes[j].y0 <= boxes[i].y1 && boxes[j].y1 >= boxes[i].y0 && ++candidates > 250000) {
      throw new HollowError('complexity', 'Source has too many overlapping boundary intervals');
    }
  }
}

function normalizationBound(polys: Pt[][], tree: Tree, tolerance: number): number {
  let maximum = 0, count = 0;
  const visit = (edge: Edge, depth: number) => {
    if (++count > 131072) throw new HollowError('complexity', 'Source normalization exceeds its certificate budget');
    const mid = midpoint(edge.a, edge.b), closest = nearest(tree, { a: mid, b: mid }).edge;
    // Distance to a fixed segment is convex. This tests the complete edge, not only its sampled midpoint.
    const bound = Math.sqrt(Math.max(pointDistanceSquared(edge.a, closest.a, closest.b), pointDistanceSquared(edge.b, closest.a, closest.b)));
    if (bound <= tolerance) { maximum = Math.max(maximum, bound); return; }
    if (depth >= 24) throw new HollowError('tolerance', `Normalized boundary exceeds its tolerance: ${bound} > ${tolerance}`);
    visit({ a: edge.a, b: mid }, depth + 1); visit({ a: mid, b: edge.b }, depth + 1);
  };
  for (const p of polys) for (let i = 0; i < p.length; i++) visit({ a: p[i], b: p[(i + 1) % p.length] }, 0);
  return maximum;
}

function checkNormalizationWitnesses(original: Pt[][], normalized: Pt[][], tree: Tree, tolerance: number): number {
  const before = shape(original), after = shape(normalized); let count = 0;
  for (const p of original) for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], length = Math.hypot(b.x - a.x, b.y - a.y);
    for (const fraction of [.37, .73]) {
      const mid = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
      const test = (distance: number): boolean => {
        const dx = -(b.y - a.y) / length * distance, dy = (b.x - a.x) / length * distance;
        const left = { x: mid.x + dx, y: mid.y + dy }, right = { x: mid.x - dx, y: mid.y - dy };
        const leftInk = before.has(left.x, left.y), rightInk = before.has(right.x, right.y);
        // Coincident/internal source edges do not delimit the filled region.
        if (leftInk === rightInk) return false;
        for (const [point, ink] of [[left, leftInk], [right, rightInk]] as const) {
          // A witness exactly on another crossing edge has no stable inside classification.
          if (nearest(tree, { a: point, b: point }).distance < 1e-11) continue;
          count++;
          if (after.has(point.x, point.y) !== ink) throw new HollowError('tolerance', 'Source normalization changes a narrow component, counter, or tail');
        }
        return true;
      };
      const limit = Math.min(length / 4, tolerance / 2);
      if (test(limit)) continue;
      // The other side of a narrow lens or a long thin tail sets a smaller useful witness distance.
      const gap = nearest(tree, { a: mid, b: mid }, (edge, distance) =>
        edge.a === a && edge.b === b || distance < 1e-24).distance;
      if (gap / 4 < limit) test(gap / 4);
    }
  }
  return count;
}

const GRID = 1e-5;
const polygonCommands = (points: Pt[]): Cmd[] => [
  ['M', points[0].x, points[0].y], ...points.slice(1).map(p => ['L', p.x, p.y] satisfies Cmd), ['Z'],
];

function certify(polys: Pt[][], source: Pt[][], tree: Tree, bound: number, plan: HollowPlan): HollowDiagnostics['clearance'] {
  if (!polys.length) return null;
  const cut = shape(polys);
  // Edge clearance prevents crossings; one point on each source loop then excludes swallowed counters/components.
  if (source.some(poly => cut.has(poly[0].x, poly[0].y))) throw new HollowError('tolerance', 'Hollow covers an original boundary');
  let minimum = Infinity, maximum = 0, count = 0;
  const upper = (edge: Edge, depth: number) => {
    if (++count > 131072) throw new HollowError('complexity', 'Hollow clearance exceeds the certificate budget');
    const mid = midpoint(edge.a, edge.b), closest = nearest(tree, { a: mid, b: mid }).edge;
    // Distance to a fixed segment is convex, so its endpoint maximum bounds this entire edge.
    const limit = Math.sqrt(Math.max(pointDistanceSquared(edge.a, closest.a, closest.b), pointDistanceSquared(edge.b, closest.a, closest.b))) + bound;
    if (limit <= plan.rim + plan.tolerance) { maximum = Math.max(maximum, limit); return; }
    if (depth >= 16) throw new HollowError('tolerance', `Hollow rim exceeds its tolerance: ${limit} > ${plan.rim + plan.tolerance}`);
    upper({ a: edge.a, b: mid }, depth + 1); upper({ a: mid, b: edge.b }, depth + 1);
  };
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const edge = { a: p[i], b: p[(i + 1) % p.length] }, clearance = nearest(tree, edge).distance - bound;
    if (clearance < plan.rim - 1e-9) throw new HollowError('tolerance', `Hollow invades its protected rim: ${clearance} < ${plan.rim}`);
    minimum = Math.min(minimum, clearance); upper(edge, 0);
  }
  return { minimum, maximum };
}

export function hollowSource(cmds: Cmd[], requested: HollowPlan): HollowResult {
  const plan = compileHollow(requested);
  if (cmds.length > 16384) throw new HollowError('complexity', 'Source exceeds the hollow command budget');
  for (const cmd of cmds) for (let i = 1; i < cmd.length; i++) {
    const value = cmd[i];
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6) throw new HollowError('normalization', 'Source coordinates exceed the supported finite range');
  }
  const flat = flattened(cmds, plan.tolerance / 5);
  const diagnostics: HollowDiagnostics = { normalization: 'polygon-union', sourceEdges: 0, hollowEdges: 0,
    grid: GRID, normalizationBound: 0, returnedBoundaryToSourceBound: flat.bound, topologyWitnesses: 0,
    flatteningBound: flat.bound, requestedRim: plan.rim, requestedTolerance: plan.tolerance, clearance: null };
  if (!flat.polys.length) return { cmds, diagnostics };
  const integers = flat.polys.map(p => p.map(v => ({ x: Math.round(v.x / GRID), y: Math.round(v.y / GRID) })));
  if (integers.some(p => !noncollinear(p))) throw new HollowError('tolerance', 'A source loop collapses on the normalization grid');
  const fromGrid = (polys: Pt[][]) => polys.map(p => p.map(v => ({ x: v.x * GRID, y: v.y * GRID })));
  guardUnionComplexity(integers);
  const clipper = new Clipper64(), normalized: Paths64 = [];
  clipper.addSubject(integers);
  if (!clipper.execute(ClipType.Union, FillRule.NonZero, normalized)) throw new HollowError('normalization', 'Source polygon union did not complete');
  const source = fromGrid(normalized), originalTree = distanceTree(flat.polys);
  diagnostics.normalizationBound = normalizationBound(source, originalTree, plan.tolerance / 400);
  diagnostics.returnedBoundaryToSourceBound += diagnostics.normalizationBound;
  diagnostics.topologyWitnesses = checkNormalizationWitnesses(flat.polys, source, originalTree, plan.tolerance);
  diagnostics.sourceEdges = source.reduce((n, p) => n + p.length, 0);
  if (diagnostics.sourceEdges > 32768) throw new HollowError('complexity', 'Normalized source exceeds the hollow point budget');
  if (!source.length) return { cmds, diagnostics };
  const tree = distanceTree(source);
  if (plan.rim >= Math.min(tree.x1 - tree.x0, tree.y1 - tree.y0) / 2) return { cmds, diagnostics };
  const distance = plan.rim + plan.tolerance / 2;
  // The whole source remains ink when erosion is empty. Guard huge finite radii before the integer kernel.
  const arcTolerance = plan.tolerance / 10;
  const arcSteps = Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - arcTolerance / distance)));
  if (!Number.isFinite(arcSteps) || arcSteps > 32768) throw new HollowError('complexity', 'Hollow offset exceeds its arc budget');
  const maximumAngle = 2 * Math.acos(Math.max(-1, 1 - arcTolerance / distance));
  let offsetBudget = source.reduce((n, p) => n + p.length * 3, 0);
  for (const p of source) for (let i = 0; i < p.length; i++) {
    const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
    const turn = Math.abs(Math.atan2((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x),
      (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)));
    offsetBudget += Math.ceil(turn / maximumAngle);
    if (offsetBudget > 65536) throw new HollowError('complexity', 'Hollow offset exceeds its point budget');
  }
  const offset = new ClipperOffset(2, arcTolerance / GRID), eroded: Paths64 = [];
  offset.addPaths(normalized, JoinType.Round, EndType.Polygon);
  try { offset.execute(-distance / GRID, eroded); }
  catch (error) { throw new HollowError('normalization', `Hollow polygon offset did not complete: ${error instanceof Error ? error.message : String(error)}`); }
  const holes = fromGrid(eroded);
  diagnostics.hollowEdges = holes.reduce((n, p) => n + p.length, 0);
  if (diagnostics.hollowEdges + holes.length + diagnostics.sourceEdges + source.length > 24000) throw new HollowError('complexity', 'Hollow exceeds the output command budget');
  diagnostics.clearance = certify(holes, source, tree, diagnostics.returnedBoundaryToSourceBound, plan);
  if (!holes.length) return { cmds, diagnostics };
  return { cmds: [...source.flatMap(polygonCommands), ...holes.flatMap(p => polygonCommands([...p].reverse()))], diagnostics };
}
