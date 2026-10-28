/* Filled ink as polygons, for the finishes that work on a letter's whole ink rather than its curves (Inline, Wire,
   ink traps): the drawing flattened and united on an integer grid, clipped and offset there, and searched for the edge
   nearest a point and the largest circle inside the ink touching a point of its edge. */
import { Clipper64, ClipType, FillRule, type Paths64 } from 'clipper2-ts';
import { ClipperOffset, EndType, JoinType } from '../vendor/clipper2-offset';
import type { Cmd, Pt } from '../engine/types';
import { SourceEffectError, type SourceEffect } from './effect-error';

export const GRID = 1e-5;
type Cubic = [Pt, Pt, Pt, Pt];
export const failure = (effect: SourceEffect, reason: 'normalization' | 'tolerance' | 'complexity', message: string): never => {
  throw new SourceEffectError(effect, reason, message);
};
const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export function area(poly: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; sum += a.x * b.y - b.x * a.y; }
  return sum / 2;
}
/** The drawing's contours as polygons within `tolerance` of its curves. */
export function flatten(cmds: Cmd[], tolerance: number, effect: SourceEffect): Pt[][] {
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
export const toGrid = (poly: Pt[]) => poly.map(p => ({ x: Math.round(p.x / GRID), y: Math.round(p.y / GRID) }));
export const fromGrid = (poly: Pt[]) => poly.map(p => ({ x: p.x * GRID, y: p.y * GRID }));
export function clip(type: ClipType, subject: Paths64, clips: Paths64, effect: SourceEffect): Paths64 {
  const clipper = new Clipper64(), out: Paths64 = [];
  clipper.addSubject(subject); if (clips.length) clipper.addClip(clips);
  if (!clipper.execute(type, FillRule.NonZero, out)) failure(effect, 'normalization', 'Source line clipping did not complete');
  return out;
}
export function offset(paths: Paths64, distance: number, tolerance: number, end: EndType, effect: SourceEffect): Paths64 {
  const out: Paths64 = [], kernel = new ClipperOffset(2, tolerance / GRID);
  kernel.addPaths(paths, JoinType.Round, end);
  try { kernel.execute(distance / GRID, out); }
  catch (error) { failure(effect, 'normalization', `Source line offset did not complete: ${error instanceof Error ? error.message : String(error)}`); }
  return out;
}
export const commands = (paths: Paths64): Cmd[] => paths.flatMap(path => {
  const poly = fromGrid(path);
  return [...poly.map((p, i): Cmd => [i ? 'L' : 'M', p.x, p.y]), ['Z'] satisfies Cmd];
});

export interface Edge { a: Pt; b: Pt }
interface Box { x0: number; y0: number; x1: number; y1: number }
export type Tree = Box & ({ leaf: Edge[] } | { left: Tree; right: Tree });
export function tree(edges: Edge[]): Tree {
  const box = edges.reduce<Box>((b, e) => ({ x0: Math.min(b.x0, e.a.x, e.b.x), y0: Math.min(b.y0, e.a.y, e.b.y),
    x1: Math.max(b.x1, e.a.x, e.b.x), y1: Math.max(b.y1, e.a.y, e.b.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  if (edges.length <= 8) return { ...box, leaf: edges };
  const axis = box.x1 - box.x0 >= box.y1 - box.y0 ? 'x' : 'y';
  edges.sort((a, b) => a.a[axis] + a.b[axis] - b.a[axis] - b.b[axis]);
  const half = edges.length >> 1;
  return { ...box, left: tree(edges.slice(0, half)), right: tree(edges.slice(half)) };
}
export function closestOn(p: Pt, e: Edge): Pt {
  const x = e.b.x - e.a.x, y = e.b.y - e.a.y, length = x * x + y * y;
  const t = length ? Math.max(0, Math.min(1, ((p.x - e.a.x) * x + (p.y - e.a.y) * y) / length)) : 0;
  return { x: e.a.x + t * x, y: e.a.y + t * y };
}
/** The edge point nearest `p`. */
export function nearest(root: Tree, p: Pt): { point: Pt; distance: number } {
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
    radius, the angle at the centre between that touch and the other, and the other touch. */
export interface Middle { c: Pt; r: number; angle: number; touch?: Pt }
/** The largest circle inside the ink touching the edge at `p`, its centre along the inward normal `n`. */
export function ball(root: Tree, p: Pt, n: Pt, start: number, guess = start): Middle | null {
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
  return { c, r, angle, touch };
}
