/* Shape controls on source ink, each about the style's own setting (its `freeAt`), drawn from the letter as it stands:
   - Squareness: each contour drawn out toward the corners of its box (a superellipse) or in toward a diamond.
   - Bowls: a box, each contour drawn out further, its corners rounded as Corners says.
   - Facets: curves cut into flat facets, coarser as it rises.
   - Roundness: sharp outer corners rounded.
   - Joins and Counters: the inside corners of joins and of counters filled round.
   - Steps: a step cut into each sharp outer corner.
   - Peaks: sharp points cut flat, or flat tops sharpened back to a point.
   - Bends: where a stroke turns sharply (M, N, V, W, Z) the turn rounded.
   - Pinch: every stroke drawn in toward its middle round a height.
   - Serifs: on a style drawn without them, a foot set across every flat end of an upright stroke, slab, bracketed,
     unbracketed, wedge or diamond, as long, thick and sloped as Length, Thickness and Angle say.
   - Stroke ends (its own policy, `source-ends-v1`): every flat stroke end flared, scooped, rounded, given a droplet or
     a ball, pointed, clipped, slanted out or in, cut level or notched, tapered or brushed, as its sliders say.
   - Inner space and Openness (their own policy, `source-insides-v1`): every closed counter grown or shrunk about its
     middle; the free ends of curving strokes cut back to open the letter, or run on to close it.
   The contour shapes move every point of the drawing, its handles too, so its curves stay curves; the corner shapes work on the filled ink (ink.ts), each bounded by
   the strokes' own thickness and the straight run of the edges either side, so a stroke never comes apart. */
import { ClipType, Clipper64, FillRule, PolyTree64, type Paths64, type PolyPath64 } from 'clipper2-ts';
import type { Params } from '../params';
import { formOf, type TerminalForm } from '../params/options';
import type { Cmd, Pt } from '../engine/types';
import { area, ball, clip, commands, failure, flatten, fromGrid, toGrid, tree, type Tree } from './ink';
import { crotches } from './joins';

export interface SourceShapesPolicy {
  format: 'source-shapes-v1';
  /** the superellipse exponent a round contour is drawn toward at Squareness 100 (a circle's is 2, where Squareness 0
      draws it; the style's own shape stays at its own Squareness), and at Bowls box with Corners at 0 and 100 */
  square: number;
  box: readonly [number, number];
  /** how far a facet may stray from the curve at Facets 100, as a share of the cap height */
  facet: number;
  /** the radius of a rounded corner at Roundness, Joins and Counters 100, as a share of the cap height */
  round: number;
  /** a step's size at Steps 100, as a share of the stroke's thickness */
  step: number;
  /** how deep Peaks cuts a point flat at Flat, as a share of the stroke's thickness */
  peak: number;
  /** how much of a stroke Pinch takes at the waist at 100, as a share of its thickness, and how far up and down the
      waist reaches, as a share of the cap height */
  pinch: readonly [number, number];
  /** how far a serif reaches past its stroke at Length 100, and how thick it is at Thickness 100, as shares of the
      stroke's width */
  serif: readonly [number, number];
  tolerance: number;
}
type ShapeKeys = 'squareness' | 'chamfer' | 'bowlForm' | 'boxRound' | 'roundness' | 'innerRound' | 'joinRound'
  | 'steps' | 'apex' | 'bends' | 'pinch' | 'pinchPos' | 'serif' | 'serifShape' | 'serifSize' | 'serifThickness' | 'serifAngle' | 'serifBracket';
export const SHAPE_CONTROLS: readonly ShapeKeys[] = ['squareness', 'chamfer', 'bowlForm', 'boxRound', 'roundness', 'innerRound',
  'joinRound', 'steps', 'apex', 'bends', 'pinch', 'pinchPos', 'serif', 'serifShape', 'serifSize', 'serifThickness', 'serifAngle', 'serifBracket'];
export interface ShapesPlan {
  /** how far round contours are drawn from their own shape toward a square (to 1) or a circle (to -1), the exponent
      Squareness 100 draws, and the exponent of a box (none but for Bowls box) */
  square: number; most: number; box: number | null; facet: number; round: number; inner: number; join: number;
  step: number; peak: number; bends: boolean; pinch: number; waist: number; reach: number; tolerance: number; cap: number;
  /** how far toward their points Peaks below the style's own carries flat tops */
  point: number;
  /** the serifs added: their shape, how far past the stroke and how thick as shares of its width, how far their tops
      slope toward the tip, and the bracket's radius as a share of their thickness */
  serif: { shape: Params['serifShape']; reach: number; thick: number; slope: number; bracket: number } | null;
  /** the stroke ends drawn: their form, and its sliders */
  end: EndPlan | null;
  /** how much each closed counter is scaled about its middle, and how far the free ends of curving strokes are cut
      back (more than 0) or run on (less), as a share of their width */
  counter: number; open: number;
}

const finite = (n: unknown, low: number, high: number): number => {
  if (typeof n !== 'number' || !(n >= low && n <= high)) throw new RangeError('Invalid source shape dimension');
  return n;
};
function pair(input: unknown, low: number, high: number): [number, number] {
  if (!Array.isArray(input) || input.length !== 2) throw new RangeError('Invalid source shape interval');
  return [finite(input[0], low, high), finite(input[1], low, high)];
}
const KEYS = ['format', 'square', 'box', 'facet', 'round', 'step', 'peak', 'pinch', 'serif', 'tolerance'];
export function parseSourceShapes(input: unknown): SourceShapesPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source shape policy');
  const value = Object.fromEntries(Object.entries(input));
  if (Object.keys(value).some(key => !KEYS.includes(key))) throw new TypeError('Unknown source shape field');
  if (value.format !== 'source-shapes-v1') throw new TypeError('Unsupported source shape policy');
  const square = finite(value.square, 2.5, 40), box = pair(value.box, 2.5, 60);
  if (!(box[0] > box[1])) throw new RangeError('Invalid source shape interval');
  return { format: 'source-shapes-v1', square, box, facet: finite(value.facet, .001, .2),
    round: finite(value.round, .001, .3), step: finite(value.step, .01, 1), peak: finite(value.peak, .01, 1),
    pinch: pair(value.pinch, .01, 1), serif: pair(value.serif, .05, 2), tolerance: finite(value.tolerance, .01, .5) };
}
export const sourceShapesExtend = (a: SourceShapesPolicy, b: SourceShapesPolicy): boolean =>
  KEYS.every(key => JSON.stringify(a[key as keyof SourceShapesPolicy]) === JSON.stringify(b[key as keyof SourceShapesPolicy]));

type Request = Pick<Params, ShapeKeys | EndKeys | 'counter' | 'aperture' | 'freeAt'>;
/** How far a setting has moved from the style's own, as a share of the way to the end it moves toward: -1 to 1. */
function moved(request: Request, key: Exclude<ShapeKeys, 'bowlForm' | 'bends' | 'serif' | 'serifShape'> | 'counter' | 'aperture'): number {
  const value = request[key], own = request.freeAt[key] ?? value;
  if (value === own) return 0;
  return value > own ? (value - own) / (1 - own || 1) : -(own - value) / (own || 1);
}
/** Stroke ends: how far back along a stroke its longest end shape reaches at a slider's 100, and how far across it
    one swells or cuts in, as shares of the stroke's width. */
export interface SourceEndsPolicy { format: 'source-ends-v1'; reach: number; bulge: number }
export function parseSourceEnds(input: unknown): SourceEndsPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source end policy');
  const value = Object.fromEntries(Object.entries(input));
  if (value.format !== 'source-ends-v1' || Object.keys(value).some(key => !['format', 'reach', 'bulge'].includes(key))) throw new TypeError('Invalid source end policy');
  return { format: 'source-ends-v1', reach: finite(value.reach, .1, 5), bulge: finite(value.bulge, .05, 2) };
}
export const sourceEndsExtend = (a: SourceEndsPolicy, b: SourceEndsPolicy): boolean => a.reach === b.reach && a.bulge === b.bulge;
type EndKeys = 'terminal' | 'terminalForm' | 'terminalFlare' | 'terminalDepth' | 'terminalRound' | 'terminalSize' | 'terminalPoint'
  | 'terminalLean' | 'terminalClip' | 'terminalSlope' | 'terminalTilt' | 'terminalTip' | 'terminalTaper';
export const END_CONTROLS: readonly EndKeys[] = ['terminal', 'terminalForm', 'terminalFlare', 'terminalDepth', 'terminalRound', 'terminalSize',
  'terminalPoint', 'terminalLean', 'terminalClip', 'terminalSlope', 'terminalTilt', 'terminalTip', 'terminalTaper'];
interface EndPlan { form: TerminalForm; reach: number; bulge: number; values: Pick<Params, Exclude<EndKeys, 'terminal' | 'terminalForm'>> }
export function compileEnds(policy: SourceEndsPolicy, request: Pick<Params, EndKeys | 'freeAt'>): EndPlan | null {
  const form = formOf(request.terminal, request.terminalForm), own = formOf(request.freeAt.terminal ?? 'flat', request.freeAt.terminalForm ?? 'plain');
  if (form === own || form === 'plain') return null;
  const { terminal: _t, terminalForm: _f, freeAt: _a, ...values } = request;
  return { form, reach: policy.reach, bulge: policy.bulge, values };
}

/** Inner space and Openness: the counters' scale at Inner space 0 and 100, and how far Openness 100 and 0 cut back and
    run on the free ends of curving strokes, as shares of their width. */
export interface SourceInsidesPolicy { format: 'source-insides-v1'; counter: readonly [number, number]; open: number; close: number }
export function parseSourceInsides(input: unknown): SourceInsidesPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source insides policy');
  const value = Object.fromEntries(Object.entries(input));
  if (value.format !== 'source-insides-v1' || Object.keys(value).some(key => !['format', 'counter', 'open', 'close'].includes(key))) throw new TypeError('Invalid source insides policy');
  const counter = pair(value.counter, .3, 2);
  if (!(counter[0] < 1 && counter[1] > 1)) throw new RangeError('Invalid source shape interval');
  return { format: 'source-insides-v1', counter, open: finite(value.open, .05, 3), close: finite(value.close, .05, 3) };
}
export const sourceInsidesExtend = (a: SourceInsidesPolicy, b: SourceInsidesPolicy): boolean =>
  a.counter[0] === b.counter[0] && a.counter[1] === b.counter[1] && a.open === b.open && a.close === b.close;
export const INSIDE_CONTROLS: readonly ('counter' | 'aperture')[] = ['counter', 'aperture'];

export function compileShapes(policy: SourceShapesPolicy, request: Request, capHeight: number, patternCorners: boolean,
  ends?: SourceEndsPolicy, insides?: SourceInsidesPolicy): ShapesPlan | undefined {
  if (!Number.isFinite(capHeight) || capHeight <= 0) throw new RangeError('Invalid source shape coordinates');
  const square = moved(request, 'squareness'), boxed = request.bowlForm === 'box' && (request.freeAt.bowlForm ?? 'oval') !== 'box';
  const plan: ShapesPlan = {
    square, most: policy.square, box: boxed ? policy.box[0] + (policy.box[1] - policy.box[0]) * request.boxRound : null,
    facet: Math.max(0, moved(request, 'chamfer')) * policy.facet * capHeight,
    round: patternCorners ? 0 : Math.max(0, moved(request, 'roundness')) * policy.round * capHeight,
    point: Math.max(0, -moved(request, 'apex')),
    inner: Math.max(0, moved(request, 'innerRound')) * policy.round * capHeight,
    join: Math.max(0, moved(request, 'joinRound')) * policy.round * capHeight,
    step: Math.max(0, moved(request, 'steps')) * policy.step,
    peak: Math.max(0, moved(request, 'apex')) * policy.peak,
    bends: request.bends === 'round' && (request.freeAt.bends ?? 'sharp') !== 'round',
    pinch: Math.max(0, moved(request, 'pinch')) * policy.pinch[0],
    waist: request.pinchPos * capHeight, reach: policy.pinch[1] * capHeight,
    tolerance: policy.tolerance, cap: capHeight,
    serif: request.serif && !(request.freeAt.serif ?? false) ? { shape: request.serifShape, reach: policy.serif[0] * (.1 + .9 * request.serifSize),
      thick: policy.serif[1] * (.15 + .85 * request.serifThickness), slope: request.serifAngle * .8, bracket: request.serifBracket } : null,
    end: ends ? compileEnds(ends, request) : null,
    counter: 1, open: 0,
  };
  if (insides) {
    const c = moved(request, 'counter'), o = moved(request, 'aperture');
    plan.counter = c >= 0 ? 1 + (insides.counter[1] - 1) * c : 1 + (insides.counter[0] - 1) * -c;
    plan.open = o >= 0 ? insides.open * o : insides.close * o;
  }
  const idle = !plan.square && plan.box === null && !plan.facet && !plan.round && !plan.inner && !plan.join
    && !plan.step && !plan.peak && !plan.bends && !plan.pinch && !plan.point && !plan.serif && !plan.end && plan.counter === 1 && !plan.open;
  return idle ? undefined : plan;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const len = (v: Pt) => Math.hypot(v.x, v.y);
const unit = (v: Pt): Pt => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; };
/** Where two lines meet: through `a` along `u` and through `b` along `v`; null when they run parallel. */
function meet(a: Pt, u: Pt, b: Pt, v: Pt): { at: Pt; s: number; t: number } | null {
  const det = u.x * v.y - u.y * v.x;
  if (Math.abs(det) < 1e-9) return null;
  const d = sub(b, a), s = (d.x * v.y - d.y * v.x) / det, t = (d.x * u.y - d.y * u.x) / det;
  return { at: add(a, u, s), s, t };
}

/** How much of its box a round bowl or counter (O, o, 0, Q, 8, and their counters) fills, almost all curve as it is;
    null for any other contour, which isn't squared: a stem, a B's straight side or an S has no box to fill. */
function round(group: Cmd[], box: number): number | null {
  let at: Pt = { x: 0, y: 0 }, curved = 0, straight = 0, area2 = 0;
  for (const c of group) {
    if (c[0] === 'M') { at = { x: c[1], y: c[2] }; continue; }
    if (c[0] === 'Z') continue;
    const to = { x: c[c.length - 2] as number, y: c[c.length - 1] as number }, l = len(sub(to, at));
    const flat = c[0] === 'L' || Math.hypot((c[1] as number) - at.x - (to.x - at.x) / 3, (c[2] as number) - at.y - (to.y - at.y) / 3) < l * .02
      && Math.hypot((c[3] as number) - at.x - (to.x - at.x) * 2 / 3, (c[4] as number) - at.y - (to.y - at.y) * 2 / 3) < l * .02;
    if (flat) straight += l; else curved += l;
    area2 += at.x * to.y - to.x * at.y;
    at = to;
  }
  const fill = Math.abs(area2) / 2 / box;
  // and near enough convex: an e's or an a's outer contour curls in round its opening, and isn't one bowl
  const points: Pt[] = [];
  for (const c of group) for (let i = 1; i + 1 < c.length; i += 2) points.push({ x: c[i] as number, y: c[i + 1] as number });
  return straight < (straight + curved) * .15 && fill > .6 && fill < .97 && Math.abs(area2) / 2 > hull(points) * .9 ? fill : null;
}

/** The area of the smallest convex outline round `points`. */
function hull(points: Pt[]): number {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y), cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const q of p) { while (lower.length > 1 && cross(lower.at(-2)!, lower.at(-1)!, q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length > 1 && cross(upper.at(-2)!, upper.at(-1)!, q) <= 0) upper.pop(); upper.push(q); }
  const ring = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return Math.abs(ring.reduce((sum, a, i) => { const b = ring[(i + 1) % ring.length]; return sum + a.x * b.y - b.x * a.y; }, 0)) / 2;
}

/** How much of its box a superellipse of exponent `n` fills. */
function filled(n: number): number {
  // Γ(1 + 1/n)² / Γ(1 + 2/n), by Lanczos
  const gamma = (z: number): number => {
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < .5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1; let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + .5;
    return Math.sqrt(2 * Math.PI) * t ** (z + .5) * Math.exp(-t) * x;
  };
  return gamma(1 + 1 / n) ** 2 / gamma(1 + 2 / n);
}
/** The exponent of the superellipse that fills `fill` of its box. */
function exponentOf(fill: number): number {
  let lo = 1, hi = 60;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (filled(mid) < fill) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const reach = (n: number, c: number, s: number) => 1 / (c ** n + s ** n) ** (1 / n);

/** Each round contour drawn from the superellipse it is nearest toward another in its own box: Squareness toward a
    square or a circle, Bowls box toward a box. A point's distance from the box's middle is scaled as the one
    superellipse's would be to reach the other, never past the box; its handles move with it. */
function warped(cmds: Cmd[], plan: ShapesPlan): Cmd[] {
  const groups: Cmd[][] = [];
  for (const cmd of cmds) { if (cmd[0] === 'M' || !groups.length) groups.push([]); groups.at(-1)!.push(cmd); }
  return groups.flatMap(group => {
    const xs: number[] = [], ys: number[] = [];
    for (const c of group) for (let i = 1; i + 1 < c.length; i += 2) { xs.push(c[i] as number); ys.push(c[i + 1] as number); }
    if (!xs.length) return group;
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    const fill = hw > 1e-6 && hh > 1e-6 ? round(group, hw * hh * 4) : null;
    if (fill === null) return group;
    const own = exponentOf(fill);
    let to = plan.square >= 0 ? own + (Math.max(own, plan.most) - own) * plan.square : own + (Math.min(own, 2) - own) * -plan.square;
    if (plan.box !== null) to = Math.max(to, plan.box);
    if (Math.abs(to - own) < 1e-6) return group;
    const move = (x: number, y: number): [number, number] => {
      const u = (x - cx) / hw, v = (y - cy) / hh, r = Math.hypot(u, v);
      if (r < 1e-9) return [x, y];
      const c = Math.abs(u) / r, s = Math.abs(v) / r, f = reach(to, c, s) / reach(own, c, s);
      const k = Math.min(f, Math.max(1, Math.abs(u)) / (Math.abs(u) || 1e-9), Math.max(1, Math.abs(v)) / (Math.abs(v) || 1e-9));
      return [cx + u * k * hw, cy + v * k * hh];
    };
    return group.map(c => {
      if (c[0] === 'Z') return c;
      const out = [...c] as Cmd;
      for (let i = 1; i + 1 < c.length; i += 2) { const [x, y] = move(c[i] as number, c[i + 1] as number); out[i] = x; out[i + 1] = y; }
      return out;
    });
  });
}

/** Every curve cut into the fewest straight pieces within `tolerance`. */
function faceted(cmds: Cmd[], tolerance: number): Cmd[] {
  const out: Cmd[] = [];
  let at: Pt = { x: 0, y: 0 }, start: Pt = at;
  for (const cmd of cmds) {
    if (cmd[0] !== 'C') { if (cmd[0] === 'M') at = start = { x: cmd[1], y: cmd[2] }; else if (cmd[0] === 'L') at = { x: cmd[1], y: cmd[2] }; else at = start; out.push(cmd); continue; }
    const q: [Pt, Pt, Pt, Pt] = [at, { x: cmd[1], y: cmd[2] }, { x: cmd[3], y: cmd[4] }, { x: cmd[5], y: cmd[6] }];
    at = q[3];
    const walk = (c: [Pt, Pt, Pt, Pt], depth: number) => {
      const off = (p: Pt) => { const d = sub(c[3], c[0]), l = len(d); return l ? Math.abs((p.x - c[0].x) * d.y - (p.y - c[0].y) * d.x) / l : len(sub(p, c[0])); };
      if (depth >= 12 || Math.max(off(c[1]), off(c[2])) <= tolerance) { out.push(['L', c[3].x, c[3].y]); return; }
      const m = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const ab = m(c[0], c[1]), bc = m(c[1], c[2]), cd = m(c[2], c[3]), abc = m(ab, bc), bcd = m(bc, cd), mid = m(abc, bcd);
      walk([c[0], ab, abc, mid], depth + 1); walk([mid, bcd, cd, c[3]], depth + 1);
    };
    walk(q, 0);
  }
  return out;
}

/** A corner of the filled ink: where it is, the ways back and on along its edges, how far it turns (outward, toward the
    ink, positive), and how far its edges run straight either side. */
export interface Corner { at: Pt; back: Pt; on: Pt; turn: number; runBack: number; runOn: number; poly: Pt[]; i: number }
const STRAIGHT = 20 * Math.PI / 180;
function cornersOf(polys: Pt[][]): Corner[] {
  const sign = area(polys.reduce((big, p) => Math.abs(area(p)) > Math.abs(area(big)) ? p : big)) > 0 ? 1 : -1;
  const out: Corner[] = [];
  for (const poly of polys) {
    const n = poly.length, dir = (i: number) => unit(sub(poly[(i + 1) % n], poly[i]));
    const turns = poly.map((_, i) => { const a = dir((i + n - 1) % n), b = dir(i); return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y) * sign; });
    const run = (i: number, step: 1 | -1) => {
      let along = 0, bent = 0;
      for (let k = 0, j = i; k < n; k++) {
        const next = (j + step + n) % n;
        along += len(sub(poly[next], poly[j])); j = next;
        bent += Math.abs(turns[j]);
        if (bent > STRAIGHT) break;
      }
      return along;
    };
    turns.forEach((turn, i) => {
      if (Math.abs(turn) < 25 * Math.PI / 180) return;
      out.push({ at: poly[i], back: unit(sub(poly[(i + n - 1) % n], poly[i])), on: dir(i), turn, runBack: run(i, -1), runOn: run(i, 1), poly, i });
    });
  }
  return out;
}
/** The piece between a corner and the round of `radius` tangent to both its edges, limited to `room` along each. */
export function fillet(c: Corner, radius: number, room: number, tolerance: number): Pt[] | null {
  const angle = Math.acos(Math.max(-1, Math.min(1, c.back.x * c.on.x + c.back.y * c.on.y)));
  if (angle < .05 || angle > Math.PI - .05) return null;
  let r = radius, d = r / Math.tan(angle / 2);
  if (d > room) { d = room; r = d * Math.tan(angle / 2); }
  if (r < tolerance * 2) return null;
  const t1 = add(c.at, c.back, d), t2 = add(c.at, c.on, d), mid = unit(add(c.back, c.on)), centre = add(c.at, mid, r / Math.sin(angle / 2));
  const a1 = Math.atan2(t1.y - centre.y, t1.x - centre.x);
  let a2 = Math.atan2(t2.y - centre.y, t2.x - centre.x), sweep = a2 - a1;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  a2 = a1 + sweep;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (2 * Math.acos(Math.max(-1, 1 - tolerance / r)))));
  const arc = Array.from({ length: steps + 1 }, (_, k) => { const t = a1 + (a2 - a1) * k / steps; return { x: centre.x + r * Math.cos(t), y: centre.y + r * Math.sin(t) }; });
  // the piece reaches a little past the corner, into the ink for a filled one, so it joins the ink along more than a point
  return [add(c.at, mid, -tolerance * 4), ...arc];
}
/** How thick the ink is a little way along a corner's edges: the thinner of its two strokes there. */
function thickness(c: Corner, root: Tree, start: number, sign: number): number {
  // each edge's normal into the ink, which lies to the left of the way round when outer contours run anticlockwise
  const side = (way: Pt, run: number, travel: Pt) => {
    const p = add(c.at, way, Math.min(run, 1e9) * .3), n = { x: -travel.y * sign, y: travel.x * sign };
    return 2 * (ball(root, p, n, start)?.r ?? 0);
  };
  return Math.min(side(c.back, c.runBack, { x: -c.back.x, y: -c.back.y }), side(c.on, c.runOn, c.on));
}

/** The ink drawn in toward each stroke's middle round the waist. */
function pinched(polys: Pt[][], plan: ShapesPlan, root: Tree, start: number): Pt[][] {
  const sign = area(polys.reduce((big, p) => Math.abs(area(p)) > Math.abs(area(big)) ? p : big)) > 0 ? 1 : -1;
  const step = plan.reach / 10;
  return polys.map(poly => {
    // edges cut short enough to bend with the waist
    const dense: Pt[] = [];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length], l = len(sub(b, a)), k = Math.max(1, Math.ceil(l / step));
      for (let j = 0; j < k; j++) dense.push(add(a, sub(b, a), j / k));
    });
    const n = dense.length;
    return dense.map((p, i) => {
      const fall = Math.abs(p.y - plan.waist) / plan.reach;
      if (fall >= 1) return p;
      const a = dense[(i + n - 1) % n], b = dense[(i + 1) % n], t = unit(sub(b, a)), inward = { x: -t.y * sign, y: t.x * sign };
      const r = ball(root, p, inward, start)?.r ?? 0, depth = r * plan.pinch * (1 + Math.cos(Math.PI * fall)) / 2;
      return add(p, inward, depth);
    });
  });
}

/** The ink reshaped. */
export function shapeSourceInk(cmds: Cmd[], plan: ShapesPlan): Cmd[] {
  if (!cmds.length) return cmds;
  let squared = cmds;
  if (plan.square || plan.box !== null) {
    // a counter drawn out past a hairline would cut its bowl apart: the squaring halves till the letter stays whole
    const whole = pieces(cmds, plan.tolerance);
    for (let share = 1; share > .1; share /= 2) {
      const tried = warped(cmds, { ...plan, square: plan.square * share, box: plan.box === null ? null : 2 + (plan.box - 2) * share });
      if (pieces(tried, plan.tolerance) <= whole) { squared = tried; break; }
    }
  }
  const curved = plan.facet ? faceted(squared, plan.facet) : squared;
  if (!plan.round && !plan.inner && !plan.join && !plan.step && !plan.peak && !plan.bends && !plan.pinch && !plan.point && !plan.serif
    && !plan.end && plan.counter === 1 && !plan.open) return curved;
  let ink: Paths64 = clip(ClipType.Union, flatten(curved, plan.tolerance / 4, 'shapes').map(toGrid), [], 'shapes');
  if (!ink.length) return curved;
  let polys = ink.map(fromGrid);
  const edges = () => polys.flatMap(p => p.map((a, i) => ({ a, b: p[(i + 1) % p.length] })));
  let root = tree(edges()), start = Math.hypot(root.x1 - root.x0, root.y1 - root.y0);
  const sign = area(polys.reduce((big, p) => Math.abs(area(p)) > Math.abs(area(big)) ? p : big)) > 0 ? 1 : -1;
  if (plan.pinch) {
    ink = clip(ClipType.Union, pinched(polys, plan, root, start).map(toGrid), [], 'shapes');
    polys = ink.map(fromGrid); root = tree(edges()); start = Math.hypot(root.x1 - root.x0, root.y1 - root.y0);
  }
  let countered = false;
  if (plan.counter !== 1) {
    // each closed counter scaled about its middle; grown too far it would cut its strokes through: it halves back
    const whole = count(ink);
    for (let share = 1; share > .1; share /= 2) {
      const k = 1 + (plan.counter - 1) * share, tried = scaledCounters(ink, k);
      if (tried && count(tried) <= whole) { ink = tried; countered = true; break; }
    }
    polys = ink.map(fromGrid); root = tree(edges()); start = Math.hypot(root.x1 - root.x0, root.y1 - root.y0);
  }
  const corners = cornersOf(polys), joins = plan.join ? crotches(polys, { turn: [20 * Math.PI / 180, Math.PI / 3],
    reach: [plan.cap * .01, plan.cap * .04], run: 1.5, apart: .9 }) : [];
  const isJoin = (c: Corner) => joins.some(j => len(sub(j.at, c.at)) < plan.tolerance * 4);
  // a bend: a sharp inside corner where a stroke turns, and the outer corner across the stroke from it (which may be
  // blunt, as at the turns of a heavy Z)
  const sharp = (c: Corner) => Math.acos(Math.max(-1, Math.min(1, c.back.x * c.on.x + c.back.y * c.on.y))) < Math.PI * .45;
  const bend = (c: Corner, thick: number) => plan.bends && corners.some(o => o !== c && Math.sign(o.turn) !== Math.sign(c.turn)
    && (c.turn < 0 ? sharp(c) : sharp(o)) && len(sub(o.at, c.at)) < thick * 2);
  const cut: Pt[][] = [], fill: Pt[][] = [];
  for (const c of corners) {
    const room = Math.min(c.runBack, c.runOn) * .45, thick = thickness(c, root, start, sign);
    const angle = Math.acos(Math.max(-1, Math.min(1, c.back.x * c.on.x + c.back.y * c.on.y)));
    if (c.turn > 0) {
      // an outer corner: rounded, stepped, cut flat at a point, or rounded at a bend
      const radius = Math.min(plan.round + (bend(c, thick) ? thick * .6 : 0), thick * .45);
      if (radius > 0) { const f = fillet(c, radius, room, plan.tolerance); if (f) cut.push(f); }
      if (plan.step > 0 && thick > 0) {
        const s = Math.min(plan.step * thick, room);
        if (s > plan.tolerance * 2) cut.push([c.at, add(c.at, c.back, s), add(add(c.at, c.back, s), c.on, s), add(c.at, c.on, s)]);
      }
      if (plan.peak > 0 && angle < Math.PI * 80 / 180 && thick > 0) {
        const depth = plan.peak * thick, l = Math.min(depth / Math.cos(angle / 2), room);
        if (l > plan.tolerance * 2) cut.push([c.at, add(c.at, c.back, l), add(c.at, c.on, l)]);
      }
    } else {
      // an inside corner: filled round, a join's by Joins and a counter's by Counters, or rounded at a bend
      const radius = (isJoin(c) ? plan.join : plan.inner) + (bend(c, thick) ? thick * .3 : 0);
      if (radius > 0) { const f = fillet(c, radius, room, plan.tolerance); if (f) fill.push(f); }
    }
  }
  // Peaks below the style's own carries its flat tops back toward a point
  if (plan.point) fill.push(...sharpened(polys, plan));
  const ends = plan.serif || plan.end || plan.open ? flatEnds(corners, root, start, sign, plan.tolerance) : [];
  // Openness: a curving stroke's free end (c, e, s, a) cut back along its sides, or run on past its end
  if (plan.open) for (const { a, b, width, depth } of ends) {
    if (Math.min(a.runBack, b.runOn) > width * 1.5) continue;
    if (plan.open > 0) {
      const l = Math.min(plan.open * width, a.runBack * .9, b.runOn * .9, depth * .9);
      if (l > plan.tolerance * 2) cut.push([add(a.at, add(a.back, b.on), .001), a.at, add(a.at, a.back, l), add(b.at, b.on, l), b.at]);
    } else {
      const l = -plan.open * width;
      fill.push([a.at, b.at, add(b.at, b.on, -l), add(a.at, a.back, -l)]);
    }
  }
  if (plan.serif) fill.push(...serifs(ends, plan.serif, plan.tolerance));
  if (plan.end) { const shaped = endShapes(ends, plan.end, polys, plan.tolerance); fill.push(...shaped.fill); cut.push(...shaped.cut); }
  // a letter with nothing to round, step or point keeps its curves
  if (!fill.length && !cut.length && !plan.pinch && !countered) return curved;
  // every piece turned one way round, so overlapping pieces add rather than cancel
  const orient = (poly: Pt[]) => area(poly) < 0 ? [...poly].reverse() : poly;
  if (fill.length) ink = attached(clip(ClipType.Union, ink, fill.map(orient).map(toGrid), 'shapes'), ink);
  if (cut.length) {
    // corners cut close together could cut a stroke through: the cuts shrink toward their corners till it stays whole
    const whole = count(ink);
    for (let share = 1; share > .1; share /= 2) {
      const tried = clip(ClipType.Difference, ink, cut.map(poly => orient(poly.map(p => add(poly[0], sub(p, poly[0]), share)))).map(toGrid), 'shapes');
      if (count(tried) <= whole) { ink = tried; break; }
    }
  }
  return ink.length ? commands(ink) : curved;
}

/** Flat tops carried back toward the point their sides meet at. */
function sharpened(polys: Pt[][], plan: ShapesPlan): Pt[][] {
  const out: Pt[][] = [], sign = area(polys.reduce((big, p) => Math.abs(area(p)) > Math.abs(area(big)) ? p : big)) > 0 ? 1 : -1;
  for (const poly of polys) {
    const n = poly.length, dir = (i: number) => unit(sub(poly[(i + 1) % n], poly[i]));
    const turn = (i: number) => { const a = dir((i + n - 1) % n), b = dir(i); return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y) * sign; };
    for (let i = 0; i < n; i++) {
      // a run of outward turns over a short stretch: a rounded corner, or a flat top between two corners
      if (turn(i) <= 1e-3 || turn((i + n - 1) % n) > 1e-3) continue;
      let j = i, total = 0, span = 0;
      while (turn(j) > 1e-3 && span < plan.cap * .1 && j !== (i + n - 1) % n) { total += turn(j); span += len(sub(poly[(j + 1) % n], poly[j])); j = (j + 1) % n; }
      const last = (j + n - 1) % n;
      if (total < Math.PI / 4 || total > Math.PI * .95 || last === i) continue;
      const share = total > Math.PI / 2 ? plan.point : 0;
      if (!share) continue;
      const before = dir((i + n - 1) % n), after = dir(last), m = meet(poly[i], before, poly[last], { x: -after.x, y: -after.y });
      if (!m || m.s <= 0 || m.t <= 0 || m.s > span * 2 || m.t > span * 2) continue;
      const between: Pt[] = [];
      for (let k = i; ; k = (k + 1) % n) { between.push(poly[k]); if (k === last) break; }
      const middle = between[between.length >> 1], tip = add(middle, sub(m.at, middle), Math.min(1, share));
      out.push([poly[i], tip, poly[last], ...between.slice(1, -1).reverse()]);
    }
  }
  return out;
}

/** Serifs across the flat ends of upright strokes: an end is a straight edge between two outer corners near square,
    as wide as the stroke behind it, lying level. */
/** A stroke's flat end: the straight edge from `a` to `b` between two outer corners near square, `along` it, `inward`
    into the stroke, as wide as the stroke behind it (not the flat top of a bowl or a bar's end), `depth` being how far
    the stroke runs on behind it. */
export interface End { a: Corner; b: Corner; along: Pt; inward: Pt; width: number; depth: number; mid: Pt }
export function flatEnds(corners: Corner[], root: Tree, start: number, sign: number, tolerance: number): End[] {
  const out: End[] = [];
  const square = (c: Corner) => { const a = Math.acos(Math.max(-1, Math.min(1, c.back.x * c.on.x + c.back.y * c.on.y))); return c.turn > 0 && a > Math.PI * .3 && a < Math.PI * .72; };
  for (const a of corners) {
    if (!square(a)) continue;
    // the next corner on along the contour, the edge to it straight
    const n = a.poly.length, gap = (c: Corner) => (c.i - a.i + n) % n;
    const b = corners.filter(c => c.poly === a.poly && c !== a).sort((x, y) => gap(x) - gap(y))[0];
    if (!b || !square(b) || a.runOn < len(sub(b.at, a.at)) * .98) continue;
    const edge = sub(b.at, a.at), width = len(edge), along = unit(edge), inward = { x: -along.y * sign, y: along.x * sign };
    // the edge leaving the one corner is the edge reaching the other: not two stems' feet across a counter
    if (along.x * a.on.x + along.y * a.on.y < .999 || -(along.x * b.back.x + along.y * b.back.y) < .999) continue;
    if (width < tolerance * 10) continue;
    const mid = add(a.at, edge, .5), depth = 2 * (ball(root, mid, inward, start)?.r ?? 0);
    if (depth < width * .7) continue;
    out.push({ a, b, along, inward, width, depth, mid });
  }
  return out;
}

function serifs(ends: End[], serif: NonNullable<ShapesPlan['serif']>, tolerance: number): Pt[][] {
  const out: Pt[][] = [];
  for (const { a, b, along, inward, width, depth } of ends) {
    // only across an upright stroke: its end lies level
    if (Math.abs(inward.y) < .9) continue;
    const reach = serif.reach * width, thick = Math.min(serif.thick * width, depth * .45), low = thick * (1 - serif.slope);
    // each side of the stroke, up from its corner as far as the serif is thick
    const up = (c: Corner, way: Pt) => { const d = way.x * inward.x + way.y * inward.y; return d > .2 ? add(c.at, way, thick / d) : null; };
    const left = up(a, a.back), right = up(b, b.on);
    if (!left || !right) continue;
    const outL = add(a.at, along, -reach), outR = add(b.at, along, reach);
    const half = add(outL, inward, low / 2), halfR = add(outR, inward, low / 2);
    // each shape one piece across the stroke's end, over its ink, so it joins along more than an edge
    if (serif.shape === 'wedge') out.push([outL, outR, right, left]);
    else if (serif.shape === 'diamond') out.push([half, a.at, b.at, halfR, add(b.at, inward, thick), add(a.at, inward, thick)]);
    else {
      const t = serif.shape === 'slab' ? 1 : .7, l = add(a.at, sub(left, a.at), t), r = add(b.at, sub(right, b.at), t);
      out.push([outL, outR, add(outR, inward, low * t), r, l, add(outL, inward, low * t)]);
      // a bracket curves the foot's top into the stroke
      if (serif.shape === 'bracketed' && serif.bracket > 0) for (const [at, foot, side] of [[l, unit(sub(add(outL, inward, low * t), l)), a.back],
        [r, unit(sub(add(outR, inward, low * t), r)), b.on]] as const) {
        const f = fillet({ at, back: foot, on: side, turn: -1, runBack: reach, runOn: Infinity, poly: a.poly, i: a.i }, thick * t * 2 * serif.bracket, reach * .9, tolerance);
        if (f) out.push(f);
      }
    }
  }
  return out;
}

/** The pieces of `filled` that hold some of `ink`, with their counters: a fill that came loose from the letter goes. */
function attached(filled: Paths64, ink: Paths64): Paths64 {
  const clipper = new Clipper64(), solution = new PolyTree64();
  clipper.addSubject(filled);
  if (!clipper.execute(ClipType.Union, FillRule.NonZero, solution)) failure('shapes', 'normalization', 'Shape union did not complete');
  const out: Paths64 = [];
  const visit = (node: PolyTree64 | PolyPath64) => {
    for (let i = 0; i < node.count; i++) {
      const piece = node.child(i);
      if (!piece.polygon) continue;
      if (clip(ClipType.Intersection, [piece.polygon], ink, 'shapes').length) {
        out.push(piece.polygon);
        for (let j = 0; j < piece.count; j++) { const hole = piece.child(j); if (hole.polygon) out.push(hole.polygon); visit(hole); }
      }
    }
  };
  visit(solution);
  return out;
}

/** How many separate pieces a drawing's ink is in. */
const pieces = (cmds: Cmd[], tolerance: number): number => count(flatten(cmds, tolerance, 'shapes').map(toGrid));
function count(paths: Paths64): number {
  const clipper = new Clipper64(), solution = new PolyTree64();
  clipper.addSubject(paths);
  if (!clipper.execute(ClipType.Union, FillRule.NonZero, solution)) failure('shapes', 'normalization', 'Shape union did not complete');
  let count = 0;
  const visit = (node: PolyTree64 | PolyPath64) => { for (let i = 0; i < node.count; i++) { const c = node.child(i); if (!c.isHole) count++; visit(c); } };
  visit(solution);
  return count;
}

/** Each flat stroke end drawn in the form picked. Every cut starts at the corner it reaches back from, so cutting less
    shrinks it toward that corner. */
function endShapes(ends: End[], plan: EndPlan, polys: Pt[][], tolerance: number): { fill: Pt[][]; cut: Pt[][] } {
  const fill: Pt[][] = [], cut: Pt[][] = [], v = plan.values;
  // the middle of the letter, which tells a stroke's outer side from its inner
  const all = polys.flat(), middle = { x: (Math.min(...all.map(p => p.x)) + Math.max(...all.map(p => p.x))) / 2,
    y: (Math.min(...all.map(p => p.y)) + Math.max(...all.map(p => p.y))) / 2 };
  const circle = (c: Pt, r: number): Pt[] => {
    const n = Math.max(12, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tolerance / r))));
    return Array.from({ length: n }, (_, k) => ({ x: c.x + r * Math.cos(2 * Math.PI * k / n), y: c.y + r * Math.sin(2 * Math.PI * k / n) }));
  };
  for (const end of ends) {
    const { a, b, along, inward, width: w, depth, mid } = end, A = a.at, B = b.at, sideA = a.back, sideB = b.on;
    // how far back along the stroke a shape may reach, short of where the stroke turns or ends
    const room = Math.min(a.runBack, b.runOn, depth) * .9, reach = (share: number) => Math.min(plan.reach * w * share, room);
    const slant = (corner: 'a' | 'b', length: number): Pt[] => corner === 'a' ? [A, add(A, sideA, length), B] : [B, A, add(B, sideB, length)];
    switch (plan.form) {
      case 'flared': {
        const f = plan.bulge * w * (.2 + .8 * v.terminalFlare), l = reach(.6);
        fill.push([A, add(A, along, -f), add(A, sideA, l)], [B, add(B, sideB, l), add(B, along, f)]);
        break;
      }
      case 'scooped': case 'notched': {
        const d = Math.min(plan.bulge * w * (.2 + .8 * v.terminalDepth), depth * .45);
        if (plan.form === 'scooped') {
          const arc = Array.from({ length: 17 }, (_, k) => { const t = k / 16, bend = 4 * t * (1 - t); return add(add(A, along, w * t), inward, d * bend); });
          cut.push([mid, ...arc]);
        } else cut.push([mid, add(A, along, w * .3), add(mid, inward, d), add(A, along, w * .7)]);
        if (plan.form === 'notched') { const t = (v.terminalTilt - .5) * 2; if (Math.abs(t) > .02) cut.push(slant(t > 0 ? 'a' : 'b', reach(Math.abs(t) * .4))); }
        break;
      }
      case 'round': {
        const r = w / 2 * (.3 + .7 * v.terminalRound);
        for (const c of [a, b]) { const f = fillet(c, r, Math.min(w / 2, room), tolerance); if (f) cut.push(f); }
        break;
      }
      case 'droplet': case 'ball': {
        // a ball belongs to a curving stroke's end (c, a, r, f, y), not a stem's foot
        if (Math.min(a.runBack, b.runOn) > w * 1.5) break;
        const r = w * (.5 + plan.bulge * .6 * (.2 + .8 * v.terminalSize)) / (plan.form === 'droplet' ? 1.15 : 1);
        const centre = add(add(mid, inward, Math.min(r * .7, depth * .5)), along, plan.form === 'droplet' ? r * .35 : 0);
        fill.push(circle(centre, r));
        break;
      }
      case 'pointed': case 'clipped': {
        const tip = add(A, along, w * (.5 + (v.terminalLean - .5) * .8)), l = reach(.2 + .8 * v.terminalPoint);
        const flat = plan.form === 'clipped' ? w * (.1 + .35 * v.terminalClip) / 2 : 0;
        cut.push([A, add(A, sideA, l), add(tip, along, -flat)], [B, add(tip, along, flat), add(B, sideB, l)]);
        break;
      }
      case 'outer': case 'inner': {
        // slanted out: the end runs back on the inner side, toward the letter's middle; slanted in, on the outer
        const aInner = len(sub(A, middle)) < len(sub(B, middle)), cutA = plan.form === 'outer' ? aInner : !aInner;
        cut.push(slant(cutA ? 'a' : 'b', reach(.1 + .9 * v.terminalSlope)));
        break;
      }
      case 'level': {
        const t = (v.terminalTilt - .5) * 2;
        if (Math.abs(t) > .02) cut.push(slant(t > 0 ? 'a' : 'b', reach(Math.abs(t) * .6)));
        break;
      }
      case 'taper': case 'brush': {
        const l = reach(.4 + .6 * v.terminalTaper), t = w * .4 * (1 - v.terminalTip);
        cut.push([A, add(A, sideA, l), add(A, along, plan.form === 'brush' ? t * 2 : t)]);
        if (plan.form === 'taper') cut.push([B, add(B, along, -t), add(B, sideB, l)]);
        break;
      }
    }
  }
  return { fill, cut };
}

/** The ink with every counter (a hole in it) scaled by `k` about its own middle; null if it has none. Each piece loses
    only its own counters, so a piece standing in another's counter (the a in @) stays. */
function scaledCounters(ink: Paths64, k: number): Paths64 | null {
  const clipper = new Clipper64(), solution = new PolyTree64();
  clipper.addSubject(ink);
  if (!clipper.execute(ClipType.Union, FillRule.NonZero, solution)) failure('shapes', 'normalization', 'Shape union did not complete');
  const pieces: Paths64 = [];
  let any = false;
  const scaled = (path: Paths64[number]) => {
    const poly = fromGrid(path), c = poly.reduce((m, p) => ({ x: m.x + p.x / poly.length, y: m.y + p.y / poly.length }), { x: 0, y: 0 });
    const out = poly.map(p => add(c, sub(p, c), k));
    return toGrid(area(out) < 0 ? out.reverse() : out);
  };
  const visit = (node: PolyTree64 | PolyPath64) => {
    for (let i = 0; i < node.count; i++) {
      const piece = node.child(i);
      if (!piece.polygon || piece.isHole) continue;
      const holes: Paths64 = [];
      for (let j = 0; j < piece.count; j++) { const hole = piece.child(j); if (hole.polygon) { holes.push(scaled(hole.polygon)); any = true; } visit(hole); }
      const outer = area(fromGrid(piece.polygon)) < 0 ? [...piece.polygon].reverse() : piece.polygon;
      pieces.push(...(holes.length ? clip(ClipType.Difference, [outer], holes, 'shapes') : [outer]));
    }
  };
  visit(solution);
  return any ? clip(ClipType.Union, pieces, [], 'shapes') : null;
}
