/* Ink traps on source ink: a notch carved into the inside corner wherever strokes join, as in n's shoulder, the
   crotches of v, k and y, and where H's bar meets its stems. A source has no record of its joins, so they are found
   on the filled ink: a corner turning away from the ink, its sides running on as strokes. A serif's corner with its
   stem is passed over, its side turning back at the serif's end; a bracket or a softly filled crotch turns too
   gently to count. Each notch runs into the join along the corner's bisector, as deep as a share of the join's own
   depth, tapering to a round tip. Every piece of ink stays joined: a notch that would cut a join through is made
   shallower. */
import { ClipType, FillRule, PolyTree64, Clipper64, type Paths64 } from 'clipper2-ts';
import type { Cmd, Pt } from '../engine/types';
import { area, ball, clip, commands, failure, flatten, fromGrid, toGrid, tree } from './ink';

export interface SourceTrapPolicy {
  format: 'source-traps-v1';
  /** how far a notch runs into its join at Ink traps 100, as a share of the thinner stroke meeting there */
  depth: number;
  /** how far along each side the notch's mouth reaches, as a share of its depth */
  mouth: number;
  /** the least turn, in degrees, of a corner that joins two strokes, gathered along as much of the edge as `reach`
      says: a sharp corner's (a right angle turns 90°, n's shoulder in a grotesque less than 30°), and a rounded
      crotch's, which must turn further for a curved counter not to count */
  turn: readonly [number, number];
  /** how far along the edge, as shares of the cap height, a sharp corner's and a rounded crotch's turn is gathered */
  reach: readonly [number, number];
  /** how far each side of a corner must run on before turning back, as a multiple of the join's depth: a stroke's
      side does, a serif's doesn't */
  run: number;
  /** how far apart, as a share of the thinner stroke, circles grown from a corner toward its two sides must reach:
      across two strokes at a join, across one where a stroke's edge only kinks */
  apart: number;
  tolerance: number;
}
export interface TrapPlan { depth: number; mouth: number; turn: readonly [number, number]; reach: readonly [number, number]; run: number; apart: number; tolerance: number }

const finite = (n: unknown, low: number, high: number): number => {
  if (typeof n !== 'number' || !(n >= low && n <= high)) throw new RangeError('Invalid source ink trap dimension');
  return n;
};
function pair(input: unknown, low: number, high: number): [number, number] {
  if (!Array.isArray(input) || input.length !== 2) throw new RangeError('Invalid source ink trap interval');
  const a = finite(input[0], low, high), b = finite(input[1], low, high);
  if (!(a <= b)) throw new RangeError('Invalid source ink trap interval');
  return [a, b];
}
export function parseSourceTraps(input: unknown): SourceTrapPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source ink trap policy');
  const value = Object.fromEntries(Object.entries(input));
  if (Object.keys(value).some(key => !['format', 'depth', 'mouth', 'turn', 'reach', 'run', 'apart', 'tolerance'].includes(key))) throw new TypeError('Unknown source ink trap field');
  if (value.format !== 'source-traps-v1') throw new TypeError('Unsupported source ink trap policy');
  return { format: 'source-traps-v1', depth: finite(value.depth, .05, .9), mouth: finite(value.mouth, .05, 2), turn: pair(value.turn, 10, 170),
    reach: pair(value.reach, 0, .1), run: finite(value.run, 0, 10), apart: finite(value.apart, 0, 4), tolerance: finite(value.tolerance, .01, .5) };
}
export const sourceTrapsExtend = (a: SourceTrapPolicy, b: SourceTrapPolicy): boolean => a.depth === b.depth && a.mouth === b.mouth
  && a.turn[0] === b.turn[0] && a.turn[1] === b.turn[1] && a.reach[0] === b.reach[0] && a.reach[1] === b.reach[1]
  && a.run === b.run && a.apart === b.apart && a.tolerance === b.tolerance;
export function compileTraps(policy: SourceTrapPolicy, amount: number, capHeight: number): TrapPlan | undefined {
  if (!(amount > 0)) return undefined;
  if (!(amount <= 1) || !Number.isFinite(capHeight) || capHeight <= 0) throw new RangeError('Invalid source ink trap coordinates');
  return { depth: policy.depth * amount, mouth: policy.mouth, turn: [policy.turn[0] * Math.PI / 180, policy.turn[1] * Math.PI / 180],
    reach: [policy.reach[0] * capHeight, policy.reach[1] * capHeight], run: policy.run, apart: policy.apart, tolerance: policy.tolerance };
}

/** A join's inside corner: where it is, the way into the ink, how deep the join is there and how thick the thinner
    stroke meeting there, and the edge round it (the corner's first and last points on its contour). */
interface Crotch { at: Pt; into: Pt; depth: number; thin: number; poly: Pt[]; first: number; last: number }

/** The least turn of a corner's points, beyond what flattening a curve gives one. */
const CORNER = 4 * Math.PI / 180;

function crotches(polys: Pt[][], plan: TrapPlan): Crotch[] {
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
      const side = (p: { at: Pt; edge: number }) => 2 * (ball(root, p.at, normal(p.edge), start)?.r ?? 0);
      const thin = Math.min(side(along(poly, first, -1, depth / 4)), side(along(poly, last, 1, depth / 4)));
      // two strokes meet where the circles grown from the corner reach across different strokes, far apart; a kink in
      // one stroke's edge, its waist drawn in, has them all reach the same far side
      const touches = fan.flatMap(b => b?.touch ? [b.touch] : []);
      const spread = Math.max(0, ...touches.flatMap(a => touches.map(b => Math.hypot(a.x - b.x, a.y - b.y))));
      if (!(thin > 0 && spread >= thin * plan.apart)) return false;
      out.push({ at, into, depth, thin, poly, first, last });
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
      const kept = -sharp.total >= plan.turn[0] && join(i, sharp.last, sharp.total) ? sharp
        : -round.total >= plan.turn[1] && join(i, round.last, round.total) ? round : null;
      if (kept) for (let j = i; ; j = (j + 1) % n) { used[j] = 1; if (j === kept.last) break; }
    }
  }
  return out;
}

/** The point `distance` along the contour from point `i`, forward or back, and the edge it lies on (its first point). */
function along(poly: Pt[], i: number, step: 1 | -1, distance: number): { at: Pt; edge: number } {
  const n = poly.length;
  let at = poly[i], left = distance;
  for (let k = 0, j = i; k < n; k++) {
    const next = (j + step + n) % n, to = poly[next], l = Math.hypot(to.x - at.x, to.y - at.y);
    if (l >= left) return { at: { x: at.x + (to.x - at.x) * left / l, y: at.y + (to.y - at.y) * left / l }, edge: step > 0 ? j : next };
    left -= l; at = to; j = next;
  }
  return { at, edge: i };
}

/** A notch into a corner: a wedge from a point on each side, `mouth` from the corner along the edge, to its tip
    `depth` into the join along the bisector. */
function notch(c: Crotch, depth: number, mouth: number, tolerance: number): Pt[] {
  const back = tolerance * 2;
  return [along(c.poly, c.first, -1, mouth).at, { x: c.at.x + c.into.x * depth, y: c.at.y + c.into.y * depth },
    along(c.poly, c.last, 1, mouth).at, { x: c.at.x - c.into.x * back, y: c.at.y - c.into.y * back }];
}

/** How many separate pieces the ink is in. */
function pieces(paths: Paths64): number {
  const clipper = new Clipper64(), solution = new PolyTree64();
  clipper.addSubject(paths);
  if (!clipper.execute(ClipType.Union, FillRule.NonZero, solution)) failure('traps', 'normalization', 'Ink trap union did not complete');
  let count = 0;
  const visit = (node: PolyTree64 | ReturnType<PolyTree64['child']>) => {
    for (let i = 0; i < node.count; i++) { const child = node.child(i); if (!child.isHole) count++; visit(child); }
  };
  visit(solution);
  return count;
}

/** The ink with a notch carved into every join's inside corner. */
export function trapSourceInk(cmds: Cmd[], plan: TrapPlan): Cmd[] {
  if (!cmds.length) return cmds;
  const ink = clip(ClipType.Union, flatten(cmds, plan.tolerance / 4, 'traps').map(toGrid), [], 'traps');
  if (!ink.length) return cmds;
  const found = crotches(ink.map(fromGrid), plan);
  if (!found.length) return cmds;
  if (found.length > 512) failure('traps', 'complexity', 'Ink traps find too many joins in this drawing');
  const whole = pieces(ink);
  // a notch that would cut a join through is made shallower, down to none
  for (let share = 1; share > .1; share /= 2) {
    const cut = found.map(c => { const deep = Math.min(c.thin * plan.depth * share, c.depth * .8); return notch(c, deep, deep * plan.mouth, plan.tolerance); }).map(toGrid);
    const trapped = clip(ClipType.Difference, ink, cut, 'traps');
    if (pieces(trapped) === whole) return commands(trapped);
  }
  return cmds;
}
