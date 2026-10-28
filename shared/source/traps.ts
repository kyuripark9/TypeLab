/* Ink traps on source ink: a notch carved into the inside corner wherever strokes join, as in n's shoulder, the
   crotches of v, k and y, and where H's bar meets its stems. A source has no record of its joins, so they are found
   on the filled ink: a corner turning away from the ink, its sides running on as strokes. A serif's corner with its
   stem is passed over, its side turning back at the serif's end; a bracket or a softly filled crotch turns too
   gently to count. Each notch runs into the join along the corner's bisector, as deep as a share of the join's own
   depth, tapering to a round tip. Every piece of ink stays joined: a notch that would cut a join through is made
   shallower. */
import { ClipType, FillRule, PolyTree64, Clipper64, type Paths64 } from 'clipper2-ts';
import type { Cmd, Pt } from '../engine/types';
import { clip, commands, failure, flatten, fromGrid, toGrid } from './ink';
import { along, crotches, type Crotch } from './joins';

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
