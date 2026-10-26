/* Decorative materials clipped to source ink. Each separate ink component carries its own pattern. */
import { Clipper64, ClipType, FillRule, PolyTree64, type Paths64, type PolyPath64 } from 'clipper2-ts';
import { clipPoly } from '../engine/geom';
import type { Cmd, Pt } from '../engine/types';
import type { Params } from '../params';
import { SourceEffectError } from './effect-error';
import { organicPatternContours } from './organic-patterns';

const FILLS = ['pixels', 'hex', 'dots', 'halftone', 'lines', 'blobs', 'liquid'] as const;
export type SourcePatternFill = typeof FILLS[number];
export interface SourcePatternPolicy {
  format: 'source-patterns-v1';
  fills: readonly SourcePatternFill[];
  cell: readonly [number, number];
  gain: readonly [number, number];
  corner: readonly [number, number];
  smallComponentScale: number;
  maxCells: number;
  maxPoints: number;
}
export interface SourcePatternPlan {
  kind: SourcePatternFill;
  cellRatio: number;
  capHeight: number;
  gain: number;
  corner: number;
  tolerance: number;
  smallComponentScale: number;
  maxCells: number;
  maxPoints: number;
}
export const sourcePatternFills = (policy: SourcePatternPolicy): readonly SourcePatternFill[] => policy.fills;
export function sourcePatternControls(policy: SourcePatternPolicy, fill?: Params['fill']): readonly (keyof Params)[] {
  const active = policy.fills.filter(kind => fill === undefined || fill === kind);
  return active.length ? ['module', 'dotGain', ...(active.some(kind => kind === 'pixels' || kind === 'hex') ? ['roundness' as const] : [])] : [];
}
export function sourcePatternsExtend(previous: SourcePatternPolicy, next: SourcePatternPolicy): boolean {
  return previous.format === next.format && previous.fills.every(fill => next.fills.includes(fill))
    && (['cell', 'gain', 'corner'] as const).every(key => previous[key][0] === next[key][0] && previous[key][1] === next[key][1])
    && previous.smallComponentScale === next.smallComponentScale && previous.maxCells === next.maxCells && previous.maxPoints === next.maxPoints;
}
function interval(value: unknown, low: number, high: number): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || value.some(n => typeof n !== 'number' || !Number.isFinite(n))
    || value[0] < low || value[1] > high || value[0] >= value[1]) throw new TypeError('Invalid pattern coordinate interval');
  return [value[0], value[1]];
}
export function parseSourcePatterns(input: unknown): SourcePatternPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source pattern policy');
  const value = Object.fromEntries(Object.entries(input));
  if (Object.keys(value).some(key => !['format', 'fills', 'cell', 'gain', 'corner', 'smallComponentScale', 'maxCells', 'maxPoints'].includes(key))
    || value.format !== 'source-patterns-v1' || !Array.isArray(value.fills) || !value.fills.length
    || new Set(value.fills).size !== value.fills.length) throw new TypeError('Invalid source pattern fields');
  const fills = value.fills.map((input: unknown) => {
    const fill = FILLS.find(fill => fill === input);
    if (!fill) throw new TypeError('Unsupported source pattern');
    return fill;
  });
  const cell = interval(value.cell, .01, .4), gain = interval(value.gain, .05, 1), corner = interval(value.corner, 0, .5);
  const { smallComponentScale, maxCells, maxPoints } = value;
  if (typeof smallComponentScale !== 'number' || !Number.isFinite(smallComponentScale) || smallComponentScale < 1 || smallComponentScale > 8
    || typeof maxCells !== 'number' || !Number.isInteger(maxCells) || maxCells < 1 || maxCells > 16384
    || typeof maxPoints !== 'number' || !Number.isInteger(maxPoints) || maxPoints < 256 || maxPoints > 262144) throw new RangeError('Pattern budgets exceed supported bounds');
  return { format: 'source-patterns-v1', fills, cell, gain, corner, smallComponentScale, maxCells, maxPoints };
}
export function compileSourcePattern(policy: SourcePatternPolicy, request: Pick<Params, 'fill' | 'module' | 'dotGain' | 'roundness'>,
  measures: { capHeight: number; tolerance: number }): SourcePatternPlan {
  const kind = policy.fills.find(fill => fill === request.fill);
  if (!kind || ![request.module, request.dotGain, request.roundness].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
    || !Number.isFinite(measures.capHeight) || measures.capHeight <= 0 || !Number.isFinite(measures.tolerance)
    || measures.tolerance < .001 || measures.tolerance > .25) throw new SourceEffectError('pattern', 'precision', 'Invalid pattern coordinates');
  const at = ([low, high]: readonly [number, number], value: number) => low + (high - low) * value;
  return { kind, cellRatio: at(policy.cell, request.module), capHeight: measures.capHeight, gain: at(policy.gain, request.dotGain),
    corner: at(policy.corner, request.roundness), tolerance: measures.tolerance, smallComponentScale: policy.smallComponentScale,
    maxCells: policy.maxCells, maxPoints: policy.maxPoints };
}

const GRID = 1e-5;
type Cubic = [Pt, Pt, Pt, Pt];
const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const failure = (reason: 'normalization' | 'tolerance' | 'complexity' | 'precision', message: string): never => { throw new SourceEffectError('pattern', reason, message); };
class Budget {
  points = 0;
  cells = 0;
  work = 0;
  constructor(readonly plan: SourcePatternPlan) {}
  addPoints(count: number) { if ((this.points += count) > this.plan.maxPoints) failure('complexity', 'Pattern exceeds its point budget'); }
  addCells(count: number) { if (!Number.isFinite(count) || (this.cells += count) > this.plan.maxCells) failure('complexity', 'Pattern exceeds its cell budget'); }
  visit(count: number) { if ((this.work += count) > 8000000) failure('complexity', 'Pattern exceeds its boundary work budget'); }
}
function area(poly: Pt[]): number {
  if (!poly.length) return 0;
  const origin = poly[0]; let sum = 0;
  for (let i = 1; i + 1 < poly.length; i++) sum += (poly[i].x - origin.x) * (poly[i + 1].y - origin.y) - (poly[i + 1].x - origin.x) * (poly[i].y - origin.y);
  return sum / 2;
}
function noncollinear(poly: Pt[]): boolean {
  const a = poly[0], b = poly.find(point => point.x !== a?.x || point.y !== a?.y);
  return !!a && !!b && poly.some(p => (p.x - a.x) * (b.y - a.y) !== (p.y - a.y) * (b.x - a.x));
}
function flatten(cmds: Cmd[], budget: Budget): Pt[][] {
  if (cmds.length > 16384) failure('complexity', 'Source exceeds the pattern command budget');
  for (const cmd of cmds) for (let i = 1; i < cmd.length; i++) {
    const value = cmd[i];
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6) failure('normalization', 'Source has an unsupported pattern coordinate');
  }
  const result: Pt[][] = []; let poly: Pt[] = [], at: Pt = { x: 0, y: 0 };
  const add = (point: Pt) => {
    if (!poly.length || poly.at(-1)?.x !== point.x || poly.at(-1)?.y !== point.y) { budget.addPoints(1); poly.push(point); }
    at = point;
  };
  const distance = (p: Pt, a: Pt, b: Pt) => {
    const x = b.x - a.x, y = b.y - a.y, length = x * x + y * y;
    const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / length)) : 0;
    return Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y);
  };
  const curve = ([a, b, c, d]: Cubic, depth: number) => {
    if (Math.max(distance(b, a, d), distance(c, a, d)) <= budget.plan.tolerance / 4) { add(d); return; }
    if (depth >= 24) failure('tolerance', 'Pattern cannot flatten the source within its tolerance');
    const ab = midpoint(a, b), bc = midpoint(b, c), cd = midpoint(c, d), abc = midpoint(ab, bc), bcd = midpoint(bc, cd), center = midpoint(abc, bcd);
    curve([a, ab, abc, center], depth + 1); curve([center, bcd, cd, d], depth + 1);
  };
  const close = () => {
    if (!poly.length) return;
    if (poly[0].x === poly.at(-1)?.x && poly[0].y === poly.at(-1)?.y) poly.pop();
    if (!noncollinear(poly)) failure('precision', 'A source contour is too small for this pattern');
    result.push(poly); poly = [];
  };
  for (const cmd of cmds) {
    if (cmd[0] === 'M') { close(); add({ x: cmd[1], y: cmd[2] }); }
    else if (cmd[0] === 'L') add({ x: cmd[1], y: cmd[2] });
    else if (cmd[0] === 'C') curve([at, { x: cmd[1], y: cmd[2] }, { x: cmd[3], y: cmd[4] }, { x: cmd[5], y: cmd[6] }], 0);
    else close();
  }
  close(); return result;
}
const toGrid = (poly: Pt[]) => poly.map(point => ({ x: Math.round(point.x / GRID), y: Math.round(point.y / GRID) }));
const fromGrid = (poly: Pt[]) => poly.map(point => ({ x: point.x * GRID, y: point.y * GRID }));
function guardIntersections(polys: Pt[][], budget: Budget) {
  const boxes = polys.flatMap(poly => poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
  })).sort((a, b) => a.x0 - b.x0);
  let candidates = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length && boxes[j].x0 <= boxes[i].x1; j++) {
    budget.visit(1);
    if (boxes[j].y0 <= boxes[i].y1 && boxes[j].y1 >= boxes[i].y0 && ++candidates > 250000) failure('complexity', 'Pattern has too many intersecting boundary intervals');
  }
}
function components(polys: Pt[][], budget: Budget): Pt[][][] {
  const paths = polys.map(toGrid);
  if (paths.some(path => !noncollinear(path))) failure('precision', 'A source contour collapses on the pattern grid');
  guardIntersections(paths, budget);
  const clipper = new Clipper64(), tree = new PolyTree64(); clipper.addSubject(paths);
  if (!clipper.execute(ClipType.Union, FillRule.NonZero, tree)) failure('normalization', 'Pattern source union did not complete');
  const out: Pt[][][] = [];
  const visit = (node: PolyPath64) => {
    if (node.polygon && !node.isHole) {
      const group = [fromGrid(node.polygon)];
      for (let i = 0; i < node.count; i++) { const hole = node.child(i); if (hole.polygon) group.push(fromGrid(hole.polygon)); }
      out.push(group);
    }
    for (let i = 0; i < node.count; i++) visit(node.child(i));
  };
  visit(tree);
  if (polys.length && !out.length) failure('normalization', 'Pattern source has no filled ink');
  return out;
}
function spans(polys: Pt[][], y: number, budget: Budget): [number, number][] {
  const crossings: [number, number][] = [];
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    budget.visit(1); const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a.y <= y) !== (b.y <= y)) crossings.push([a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x), b.y > a.y ? 1 : -1]);
  }
  crossings.sort((a, b) => a[0] - b[0]);
  const result: [number, number][] = []; let winding = 0, start = 0;
  for (const [x, step] of crossings) {
    const before = winding; winding += step;
    if (!before && winding) start = x;
    else if (before && !winding && x > start) result.push([start, x]);
  }
  return result;
}
function anchor(polys: Pt[][], budget: Budget): Pt {
  const ys = [...new Set(polys.flatMap(poly => poly.map(point => point.y)))].sort((a, b) => a - b);
  const bands = ys.slice(1).map((y, i) => ({ y: (y + ys[i]) / 2, height: y - ys[i] })).sort((a, b) => b.height - a.height).slice(0, 64);
  let best: { point: Pt; width: number } | undefined;
  for (const band of bands) for (const [a, b] of spans(polys, band.y, budget)) {
    if (!best || b - a > best.width) best = { point: { x: (a + b) / 2, y: band.y }, width: b - a };
  }
  if (!best || best.width < GRID * 8) return failure('precision', 'Pattern cannot place a cell inside a thin ink component');
  return best.point;
}
function arc(center: Pt, radius: number, start: number, sweep: number, budget: Budget): Pt[] {
  const step = radius > budget.plan.tolerance / 4 ? 2 * Math.acos(1 - budget.plan.tolerance / (4 * radius)) : Math.PI / 4;
  const count = Math.max(1, Math.ceil(sweep / Math.min(Math.PI / 4, step)));
  budget.addPoints(count + 1);
  return Array.from({ length: count + 1 }, (_, i) => ({ x: center.x + radius * Math.cos(start + sweep * i / count), y: center.y + radius * Math.sin(start + sweep * i / count) }));
}
function regular(center: Pt, radius: number, sides: number, rotation: number, rounding: number, budget: Budget): Pt[] {
  const points = Array.from({ length: sides }, (_, i) => ({ x: center.x + radius * Math.cos(rotation + 2 * Math.PI * i / sides),
    y: center.y + radius * Math.sin(rotation + 2 * Math.PI * i / sides) }));
  if (rounding === 0) { budget.addPoints(points.length); return points; }
  const half = Math.PI / 2 - Math.PI / sides, tangent = rounding / Math.tan(half), inset = rounding / Math.sin(half);
  return points.flatMap((point, i) => {
    const previous = points[(i + sides - 1) % sides], length = Math.hypot(previous.x - point.x, previous.y - point.y);
    const inner = { x: point.x + (center.x - point.x) / radius * inset, y: point.y + (center.y - point.y) / radius * inset };
    const first = { x: point.x + (previous.x - point.x) / length * tangent, y: point.y + (previous.y - point.y) / length * tangent };
    return arc(inner, rounding, Math.atan2(first.y - inner.y, first.x - inner.x), 2 * Math.PI / sides, budget);
  });
}
function bounds(polys: Pt[][]) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const poly of polys) for (const point of poly) { x0 = Math.min(x0, point.x); x1 = Math.max(x1, point.x); y0 = Math.min(y0, point.y); y1 = Math.max(y1, point.y); }
  return { x0, x1, y0, y1 };
}
function masks(polys: Pt[][], budget: Budget): Pt[][] {
  const plan = budget.plan, box = bounds(polys), origin = anchor(polys, budget);
  const cell = Math.min(plan.capHeight, Math.min(box.x1 - box.x0, box.y1 - box.y0) * plan.smallComponentScale) * plan.cellRatio;
  if (!Number.isFinite(cell) || cell < GRID * 32) return failure('precision', 'Pattern cells are too small for this ink component');
  if (plan.kind === 'blobs' || plan.kind === 'liquid') {
    return organicPatternContours(plan.kind, { bounds: box, origin, cell, gain: plan.gain }, budget).flatMap(loop => flatten(loop, budget));
  }
  const hex = plan.kind === 'hex' || plan.kind === 'halftone', row = hex ? cell * Math.sqrt(3) / 2 : cell;
  const i0 = Math.floor((box.x0 - origin.x) / cell) - 1, i1 = Math.ceil((box.x1 - origin.x) / cell) + 1;
  const j0 = Math.floor((box.y0 - origin.y) / row) - 1, j1 = Math.ceil((box.y1 - origin.y) / row) + 1;
  budget.addCells((plan.kind === 'lines' ? 1 : i1 - i0 + 1) * (j1 - j0 + 1));
  const out: Pt[][] = [];
  for (let j = j0; j <= j1; j++) {
    const y = origin.y + j * row;
    if (plan.kind === 'lines') {
      budget.addPoints(4); const half = cell * plan.gain / 2;
      out.push([{ x: box.x0 - cell, y: y - half }, { x: box.x1 + cell, y: y - half }, { x: box.x1 + cell, y: y + half }, { x: box.x0 - cell, y: y + half }]);
      continue;
    }
    let band: Pt[][] = [];
    if (plan.kind === 'halftone') {
      budget.visit(polys.reduce((count, poly) => count + poly.length, 0));
      band = polys.map(poly => clipPoly(poly, { y0: y - row / 2, y1: y + row / 2 }));
    }
    for (let i = i0; i <= i1; i++) {
      const center = { x: origin.x + (i + (hex && Math.abs(j % 2) ? .5 : 0)) * cell, y };
      if (plan.kind === 'pixels') out.push(regular(center, cell * plan.gain / Math.SQRT2, 4, Math.PI / 4, cell * plan.gain * plan.corner, budget));
      else if (plan.kind === 'hex') out.push(regular(center, cell * plan.gain / Math.sqrt(3), 6, Math.PI / 6, cell * plan.gain * plan.corner, budget));
      else {
        let coverage = 1;
        if (plan.kind === 'halftone') {
          budget.visit(band.reduce((count, poly) => count + poly.length, 0));
          coverage = Math.max(0, Math.min(1, band.reduce((sum, poly) => sum + area(clipPoly(poly, { x0: center.x - cell / 2, x1: center.x + cell / 2 })), 0) / (cell * row)));
        }
        if (coverage > 0) out.push(arc(center, cell * plan.gain / Math.SQRT2 * Math.sqrt(coverage), 0, Math.PI * 2, budget));
      }
    }
  }
  return out;
}

export function patternSourceInk(cmds: Cmd[], plan: SourcePatternPlan): Cmd[] {
  if (!cmds.length) return cmds;
  const budget = new Budget(plan), groups = components(flatten(cmds, budget), budget), result: Cmd[] = [];
  for (const group of groups) {
    const material = masks(group, budget).map(toGrid).filter(noncollinear), source = group.map(toGrid);
    guardIntersections([...source, ...material], budget);
    const clipper = new Clipper64(), filled: Paths64 = [];
    clipper.addSubject(source); clipper.addClip(material);
    if (!clipper.execute(ClipType.Intersection, FillRule.NonZero, filled)) failure('normalization', 'Pattern clipping did not complete');
    if (!filled.length) failure('precision', 'Pattern cannot retain this ink component at the available precision');
    for (const integer of filled) {
      const poly = fromGrid(integer); budget.addPoints(poly.length + 1);
      poly.forEach((point, i) => result.push([i ? 'L' : 'M', point.x, point.y])); result.push(['Z']);
    }
  }
  return result;
}
