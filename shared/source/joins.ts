/* Where a source's strokes join, found on its filled ink, for the finishes that work at joins (ink traps, stencil): a
   corner turning away from the ink, its sides running on as strokes, across which circles grown from the corner
   reach different strokes. A serif's corner with its stem is passed over, its side turning back at the serif's end;
   so is a kink in one stroke's edge, its circles all reaching the same far side; a bracket, or a crotch rounded wider
   than the rounded reach, turns too gently to count. */
import type { Pt } from '../engine/types';
import { area, ball, tree } from './ink';

/** What counts as a join's corner. */
export interface JoinFinding {
  /** the least turn, in radians, of a sharp corner and of a rounded crotch */
  turn: readonly [number, number];
  /** how far along the edge a sharp corner's and a rounded crotch's turn is gathered, in font units */
  reach: readonly [number, number];
  /** how far each side must run on before turning back, as a multiple of the join's depth */
  run: number;
  /** how far apart, as a share of the thinner stroke, the circles grown from the corner must reach */
  apart: number;
  /** a corner drawn as a few sharp turns close together (a chamfer, or a crotch rounded in steps) counts as one */
  chamfers?: boolean;
}

/** A join's inside corner: where it is, the way into the ink, how deep the join is there and how thick the thinner
    stroke meeting there, and the edge round it (the corner's first and last points on its contour). */
export interface Crotch {
  at: Pt; into: Pt; depth: number; thin: number; poly: Pt[]; first: number; last: number;
  /** the corner's two sides, back along its contour and on: the way along each from the corner, its edge's normal into
      the ink, the stroke's thickness there, and how far the side runs on before turning back */
  sides: [Side, Side];
  /** how far round the corner turns, in radians */
  turn: number;
}
export interface Side { way: Pt; normal: Pt; thick: number; run: number }

/** The least turn of a corner's points, beyond what flattening a curve gives one. */
const CORNER = 4 * Math.PI / 180;

export function crotches(polys: Pt[][], plan: JoinFinding): Crotch[] {
  const edges = polys.flatMap(p => p.map((a, i) => ({ a, b: p[(i + 1) % p.length] })));
  const root = tree(edges), start = Math.hypot(root.x1 - root.x0, root.y1 - root.y0);
  // the ink lies to the left of each contour when the outer ones run anticlockwise and the holes clockwise
  const sign = area(polys.reduce((big, p) => Math.abs(area(p)) > Math.abs(area(big)) ? p : big)) > 0 ? 1 : -1;
  const out: Crotch[] = [];
  for (const poly of polys) {
    const n = poly.length;
    const normal = (i: number): Pt => {
      const a = poly[i], b = poly[(i + 1) % n], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: -(b.y - a.y) / l * sign, y: (b.x - a.x) / l * sign };
    };
    // each corner's turn, away from the ink negative
    const turns = poly.map((_, i) => {
      const m = normal((i + n - 1) % n), k = normal(i);
      return Math.atan2(m.x * k.y - m.y * k.x, m.x * k.x + m.y * k.y) * sign;
    });
    const length = (i: number) => { const a = poly[i], b = poly[(i + 1) % n]; return Math.hypot(b.x - a.x, b.y - a.y); };
    // how far the edge runs on from corner `i` in direction `step` before turning back toward the ink
    const runOn = (i: number, step: 1 | -1, limit: number): number => {
      let along = 0, turned = 0;
      for (let k = 0, j = i; k < n && along < limit; k++) {
        along += length(step > 0 ? j : (j + n - 1) % n);
        j = (j + step + n) % n;
        turned = turns[j] > 0 ? turned + turns[j] : 0;
        if (turned > Math.PI / 3) return along;
      }
      return along;
    };
    const used = new Uint8Array(n);
    const join = (first: number, last: number, total: number): boolean => {
      // the corner's place, half way round its turn, and the way into the join, between the two sides' normals
      let half = -total / 2, at = poly[first];
      for (let j = first; ; j = (j + 1) % n) {
        half += turns[j];
        if (half >= 0) { at = poly[j]; break; }
        if (j === last) break;
      }
      const m = normal((first + n - 1) % n), k = normal(last), x = m.x + k.x, y = m.y + k.y, l = Math.hypot(x, y);
      if (!l) return false;
      // the join's depth: the largest circle touching the corner, its centre anywhere between the two sides' normals
      const into = { x: x / l, y: y / l }, fan = [0, 1 / 6, 2 / 6, .5, 4 / 6, 5 / 6, 1].map(t => {
        const fx = m.x + (k.x - m.x) * t, fy = m.y + (k.y - m.y) * t, fl = Math.hypot(fx, fy) || 1;
        return ball(root, at, { x: fx / fl, y: fy / fl }, start);
      });
      const depth = 2 * Math.max(0, ...fan.map(b => b?.r ?? 0));
      if (!depth) return false;
      // a serif's side turns back within its own length
      if (runOn(last, 1, depth * plan.run) < depth * plan.run || runOn(first, -1, depth * plan.run) < depth * plan.run) return false;
      // each stroke's thickness a little way along its side from the corner
      const side = (p: { at: Pt; edge: number }, i: number, step: 1 | -1): Side => {
        const dx = p.at.x - at.x, dy = p.at.y - at.y, l = Math.hypot(dx, dy) || 1;
        return { way: { x: dx / l, y: dy / l }, normal: normal(p.edge), thick: 2 * (ball(root, p.at, normal(p.edge), start)?.r ?? 0),
          run: runOn(i, step, depth * 4) };
      };
      const sides: [Side, Side] = [side(along(poly, first, -1, depth / 4), first, -1), side(along(poly, last, 1, depth / 4), last, 1)];
      const thin = Math.min(sides[0].thick, sides[1].thick);
      // two strokes meet where the circles grown from the corner reach across different strokes, far apart; a kink in
      // one stroke's edge, its waist drawn in, has them all reach the same far side
      const touches = fan.flatMap(b => b?.touch ? [b.touch] : []);
      const spread = Math.max(0, ...touches.flatMap(a => touches.map(b => Math.hypot(a.x - b.x, a.y - b.y))));
      if (!(thin > 0 && spread >= thin * plan.apart)) return false;
      out.push({ at, into, depth, thin, poly, first, last, sides, turn: -total });
      return true;
    };
    // a corner starts at a point turning away from the ink by more than a curve's flattening does, its turn gathered
    // along a short stretch, so a tiny rounding counts as one corner, or along a longer one if it turns further, as a
    // rounded crotch does. Runs start where one ends, so none straddles the contour's start
    const corner = (i: number) => turns[i] <= -CORNER;
    const from = turns.findIndex(t => t > -CORNER);
    if (from < 0) continue;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      if (used[i] || !corner(i)) continue;
      const gather = (reach: number) => {
        let last = i, total = turns[i], span = 0;
        while (true) {
          const next = (last + 1) % n;
          if (next === i || used[next] || turns[next] >= -1e-3 || span + length(last) > reach) break;
          span += length(last); last = next; total += turns[next];
        }
        return { last, total };
      };
      const sharp = gather(plan.reach[0]), round = gather(plan.reach[1]);
      let steps = 0;
      for (let j = i; ; j = (j + 1) % n) { if (corner(j)) steps++; if (j === round.last) break; }
      const chamfer = plan.chamfers && steps > 1 && -round.total >= plan.turn[1] && join(i, round.last, round.total) ? round : null;
      const kept = chamfer ?? (-sharp.total >= plan.turn[0] && join(i, sharp.last, sharp.total) ? sharp
        : -round.total >= plan.turn[1] && join(i, round.last, round.total) ? round : null);
      if (kept) for (let j = i; ; j = (j + 1) % n) { used[j] = 1; if (j === kept.last) break; }
    }
  }
  return out;
}

/** The point `distance` along the contour from point `i`, forward or back, and the edge it lies on (its first point). */
export function along(poly: Pt[], i: number, step: 1 | -1, distance: number): { at: Pt; edge: number } {
  const n = poly.length;
  let at = poly[i], left = distance;
  for (let k = 0, j = i; k < n; k++) {
    const next = (j + step + n) % n, to = poly[next], l = Math.hypot(to.x - at.x, to.y - at.y);
    if (l >= left) return { at: { x: at.x + (to.x - at.x) * left / l, y: at.y + (to.y - at.y) * left / l }, edge: step > 0 ? j : next };
    left -= l; at = to; j = next;
  }
  return { at, edge: i };
}
