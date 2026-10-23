/* A free font's letter given the shapes the engine's own letters take, past what moving its skeleton does
   (skin.ts). Each restyle reads the letter's outline as the font draws it, and, where it needs it, its
   skeleton (scan.ts), and redraws only what its settings reach, so the rest stays the font's own. Each
   compares the settings the font was picked at (`from`, its freeAt) with those asked for (`to`) and hands back
   the very same contours when nothing it follows has moved; Serifs, run only while serifs are asked for that
   the font hasn't got (none, or another shape), hands them back when it finds no stroke end to set one on.

   free-letters.ts (restyled) runs them in this order, each on the outline the one before left: Dots (Dots, or
   Roundness or round ends' Roundness while Dots follows them); Bowls (Squareness, Facets, Curves, Bowls); Ends
   (Stroke ends with its forms and settings; Length, Curl, Tails & hooks, Openness); Serifs; Stencil (Stencil,
   its Position and Rounding; the crossbars' Gap); Peaks; Corners (Roundness, Steps, Counters, Joins), last, so
   it rounds the corners the others leave too. Whatever a restyle reads of the settings must also be in the key
   restyled() keeps its results under, or a dragged slider shows letters drawn for an earlier value. */
import { CURSIVE_FORMS, bowlK, bowlOrg, buildFont, cursiveHookR, dotRoundOf, innerRoundR, roundnessR, stencilOff, termSpec, type Effective, type Font } from './font';
import { DEFAULTS, endReach, onEndScale, type Params } from '../params';
import { drawnCmds, fitOutline, hasIn, hasOut, type Node } from './outline';
import { CIRCLE_K, clamp, lerp, roundContour, signedArea, smoothstep } from './geom';
import { bez, branches, endFace, inkAt, inkGrid, joinsOf, leaving, nearestOn, roundTip, type Branch, type Grid, type Join, type SkPt, type Skeleton } from './scan';
import { STEP_DEPTH, buildSerif, expandStroke, serifCup, serifSides, termCap, termDropBack } from './stroke';
import { DROP_MIN, ROOM_KEEP, ROOM_MAX, reachingOf } from './ends';
import { CROTCH, crotchShare, innerShare, joinR } from './joins';
import { combine, shape } from './boolean';
import type { Cmd, PenCtx, Pt, SerifSides, SerifSpec, TermSpec } from './types';

type P = { x: number; y: number };

/** What a letter's restyling needs to know of it, in the font's units. */
export interface RestyleCtx {
  ch: string; cap: number; xh: number;
  /** its upright strokes' thickness, and its level ones' */ stem: number; bar: number;
  /** in a script whose letters stand apart, the font's stems' thickness (its n's), against which a small letter's exit
      stroke is told as a hairline: a free end, which Length and Curl move (see terminalEnds; FreeFamily.freeExits) */
  exits?: { stem: number };
  /** a font of block letters (FreeFamily.blocks), whose ends stand out short and heavy from the strokes they leave: an
      r's arm, a y's tail (see measureEnd and restyleEnds) */
  stubs?: true;
}

/** The skeleton of the very contours passed with it, scanned only when first asked for (see restyled in
    free-letters.ts); restyleBowls keeps what it reads off it with those contours. */
type SkeletonOf = () => Skeleton;

/** How far a sample must turn (radians) to count as a corner of the outline, not a step along a curve. */
const KINK = 0.35;
/** How closely what a restyle draws is traced with the font's kind of outline again, in font units. */
const FIT_TOL = 1.2;
/** How near a line (the baseline, the x-height, the capitals') an outline must come, as a share of the cap
    height, to stand on it. */
const ON_LINE = 0.035;
/** The most a dot is wide or tall, in its letter's strokes (the thicker of stem and bar). */
const DOT_MAX = 2.6;

/** How much of a setting the font takes on that it hasn't any of (steps, a stencil, a pinch, thinned joints): none
    until the setting is moved past where the font was picked at, then all of it by the end of the scale. skin.ts
    reads it too. */
export const added = (from: number, to: number) => (to > from ? (to - from) / (1 - from || 1) : 0);

/** Polygons back as the font's kind of outline (curves fitted), less any of two points or fewer. */
const refit = (rings: P[][]): Node[][] => rings.filter(r => r.length > 2).flatMap(r => fitOutline([...r.map((q, i): Cmd => [i ? 'L' : 'M', q.x, q.y]), ['Z']], FIT_TOL));

/** The length along a polyline at each of its points (0 at its first). */
function arcOf(pts: P[]): number[] {
  const arc = [0];
  for (let k = 1; k < pts.length; k++) arc.push(arc[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  return arc;
}
/** The first point (by its index) at least `a` along a polyline, given its lengths (arcOf), or its last. */
function indexAt(arc: number[], a: number): number {
  let k = 0;
  while (k < arc.length - 1 && arc[k] < a) k++;
  return k;
}

/* ---- the outline sampled */

interface S extends P {
  /** turn to the next sample, radians, + to the left */ turn: number;
  /** how far to the next */ len: number;
  /** an anchor where the outline's direction breaks */ kink: boolean;
}

/** A contour as points about `step` apart along its curves (a straight side as its two ends). */
function sampled(c: Node[], step = 3): P[] {
  const pts: P[] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    pts.push({ x: a.x, y: a.y });
    for (const s of along(a, b, step)) pts.push(s.p);
  }
  return pts;
}
/** The points sampled takes between nodes a and b, about `step` apart, with how far along the curve each stands (t):
    none along a straight side. */
function along(a: Node, b: Node, step = 3): { t: number; p: P }[] {
  if (a.ox === undefined && b.ix === undefined) return [];
  let len = 0, q = bez(a, b, 0);
  for (let k = 1; k <= 16; k++) { const r = bez(a, b, k / 16); len += Math.hypot(r.x - q.x, r.y - q.y); q = r; }
  const n = Math.max(2, Math.ceil(len / step)), out: { t: number; p: P }[] = [];
  for (let k = 1; k < n; k++) out.push({ t: k / n, p: bez(a, b, k / n) });
  return out;
}

/** How nearly straight back, in radians short of a half turn, the outline must double back at a point for it to be
    the tip of a spur of no width (despike). */
const SPUR_TURN = 0.05;
/** A ring without the spurs of no width an outline can run out along and back (a curve whose handle overshoots along
    its own line: Vellum's A's counter out along its crossbar), which take no ink but read as corners. */
function despike(pts: P[]): P[] {
  const out = pts.slice();
  for (let changed = true; changed && out.length > 3;) {
    changed = false;
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const n = out.length, a = out[(i - 1 + n) % n], p = out[i], b = out[(i + 1) % n];
      const ux = p.x - a.x, uy = p.y - a.y, vx = b.x - p.x, vy = b.y - p.y;
      if (Math.hypot(ux, uy) < 1e-9 || Math.hypot(vx, vy) < 1e-9) continue;
      if (Math.PI - Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) < SPUR_TURN) { out.splice(i, 1); i--; changed = true; }
    }
  }
  return out;
}

/** The sample a side is read out to from sample i, going `dir` (1 on, -1 back): two samples on along a curve, its
    samples a few units apart, but only one where the first step is a straight side of its own or ends at a corner, so
    a side read past a straight edge's far end doesn't run on round the next corner (Vellum's A's counter, its rounded
    foot read out along the crossbar across the counter). */
function sideTo(s: S[], i: number, dir: 1 | -1): S {
  const n = s.length, j1 = (i + dir + n) % n;
  return s[j1].kink || Math.hypot(s[j1].x - s[i].x, s[j1].y - s[i].y) > SIDE_STEP ? s[j1] : s[(i + 2 * dir + 2 * n) % n];
}
/** The longest step between the samples of a curve (sampled's step, and a little over): a longer one is a straight side. */
const SIDE_STEP = 6;
/** The most of a counter the ink rings round (an o's, an 8's) an inside corner's round may fill (restyleCorners). */
const HOLE_FILL = 0.25;

/** A ring of points with the turn at each and the length on to the next (points on top of each other gone). */
function annotate(pts: P[]): S[] {
  const clean = pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(q.x - p.x, q.y - p.y) > 0.05; });
  const n = clean.length;
  return clean.map((p, i) => {
    const a = clean[(i - 1 + n) % n], b = clean[(i + 1) % n];
    const ux = p.x - a.x, uy = p.y - a.y, vx = b.x - p.x, vy = b.y - p.y;
    const turn = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return { x: p.x, y: p.y, turn, len: Math.hypot(vx, vy), kink: Math.abs(turn) > KINK };
  });
}

/** The letter's ink as one set of outlines, anticlockwise round the ink and clockwise round its holes, so
    the ink is on their left: a font drawing a letter as strokes laid over each other (Roboto's H, its bar
    running into its stems) has the corners where they cross, not the ends hidden in the ink. */
function inkRings(cs: Node[][]): P[][] {
  // (kept with the contours, as each restyle of a letter, and each step of a slider dragged, reads the same ones again;
  // the list is the caller's to change, the rings and their points aren't)
  let rings = inkRingsOf.get(cs);
  if (!rings) {
    const sh = shape(cs.map(c => sampled(c)));
    rings = combine([sh], sh.has).filter(r => r.length > 2);
    inkRingsOf.set(cs, rings);
  }
  return rings.slice();
}
const inkRingsOf = new WeakMap<Node[][], P[][]>();

/* ---- corners

   Every corner of the outline, a sharp one or a small round the font already has (read as the two
   straight-ish sides either side of it meeting, and the radius it rounds them by), is drawn again only
   where a setting asks for another radius or a step: a corner the ink wraps round (the corners of a
   stroke's square end, the outside of a turn) by Roundness and Steps, an inside corner by Joins where it is a
   narrow crotch and by Counters where it is square or open (innerShare, crotchShare in joins.ts). */

/** A corner: where its two sides meet (or would, rounded), the samples its round takes, how far it turns,
    the radius the font rounds it by (0 sharp), and whether the ink wraps round it (convex). */
interface Corner { v: P; i0: number; i1: number; turn: number; r: number; convex: boolean }

/** The corners of a sampled contour: sharp turns, and short tight rounds between straighter sides
    (tighter than `rMax`, turning less than two thirds of the way round, so a bowl isn't one). The contour is
    one of inkRings', the ink on its left, so a corner turning left is one the ink wraps round. */
function cornersOf(s: S[], rMax: number): Corner[] {
  const n = s.length, out: Corner[] = [];
  const tight = (i: number) => !s[i].kink && Math.abs(s[i].turn) > 0.004 && (s[i].len + s[(i - 1 + n) % n].len) / 2 / Math.abs(s[i].turn) < rMax;
  const used = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (s[i].kink) { out.push({ v: s[i], i0: i, i1: i, turn: s[i].turn, r: 0, convex: s[i].turn > 0 }); used[i] = 1; }
  }
  for (let i = 0; i < n; i++) {
    if (used[i] || !tight(i)) continue;
    // a run of tight samples turning one way
    const sg = Math.sign(s[i].turn);
    let a = i, b = i;
    while (!used[(a - 1 + n) % n] && tight((a - 1 + n) % n) && Math.sign(s[(a - 1 + n) % n].turn) === sg && (b - a + 1) < n) a--;
    while (!used[(b + 1) % n] && tight((b + 1) % n) && Math.sign(s[(b + 1) % n].turn) === sg && (b - a + 1) < n) b++;
    if (b - a + 1 >= n - 2) return out;
    let turn = 0, len = 0;
    for (let k = a; k <= b; k++) { const j = (k + n) % n; turn += s[j].turn; used[j] = 1; if (k < b) len += s[j].len; }
    if (Math.abs(turn) < 0.5 || Math.abs(turn) > Math.PI * 1.15) continue;
    // the sides it rounds: the outline coming into it and going on out of it, read just past it
    const p0 = s[(a - 1 + n) % n], pin = sideTo(s, (a - 1 + n) % n, -1), p1 = s[(b + 1) % n], pout = sideTo(s, (b + 1) % n, 1);
    const halves: [number, number][] = Math.abs(turn) > 2.1 ? [[a, Math.round((a + b) / 2)], [Math.round((a + b) / 2), b]] : [[a, b]];
    for (const [h0, h1] of halves) {
      let ht = 0, hl = 0;
      for (let k = h0; k <= h1; k++) { ht += s[(k + n) % n].turn; if (k < h1) hl += s[(k + n) % n].len; }
      // the lines in and out of this half: a side, or the tangent at the middle of a split round
      const lin = h0 === a ? [pin, p0] : tangentAt(s, h0), lout = h1 === b ? [p1, pout] : tangentAt(s, h1);
      const v = meet(lin[0], lin[1], lout[0], lout[1]);
      if (!v) continue;
      out.push({ v, i0: (h0 + n) % n, i1: (h1 + n) % n, turn: ht, r: hl / Math.max(0.05, Math.abs(ht)), convex: sg > 0 });
    }
  }
  return out;
}

/** The line along the outline at sample i (as two points on it). */
function tangentAt(s: S[], i: number): [P, P] {
  const n = s.length, w = (k: number) => s[((k % n) + n) % n], a = w(i - 1), b = w(i + 1), p = w(i);
  return [p, { x: p.x + (b.x - a.x), y: p.y + (b.y - a.y) }];
}
/** Where the line through a and b meets the one through c and d. */
function meet(a: P, b: P, c: P, d: P): P | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9 * Math.hypot(rx, ry) * Math.hypot(sx, sy)) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  return { x: a.x + rx * t, y: a.y + ry * t };
}

/** The narrowest a run of inside corners made one may be across: narrower, its sides run on side by side. */
const CROTCH_MIN = 10 * Math.PI / 180;
/** How close, in stems, the corners the ink wraps round follow each other to be one tip to round: a broad pen's
    point cut across by a facet a hair long (a blackletter's heads and feet) is one point, not two corners with no room. */
const TIP_GAP = 0.2;
/** How close to the corners either side of it, as a share of the gap a run is made one across, a corner of the other
    kind is passed over as a notch in the run (crotchesOf). */
const NOTCH_GAP = 0.25;
/** The least share of their turns two corners made one must turn through together (crotchesOf). */
const MERGE_KEEP = 0.6;
/** How far from upright or level, in radians, a corner's two sides may run for it to be a square corner of upright and
    level strokes (an H's, a T's), which Joins and Counters split by its width alone. */
const LEVEL_TOL = 12 * Math.PI / 180;
/** How far, in radians, an inside corner's side may curve on round the way the corner turns and still be room for its
    round (restyleCorners' straight). */
const BEND_ON = 1;
/** How far out from an inside corner, in stems, the paper is read across for a channel (facesCounter): near, and
    further on. */
const CHANNEL_NEAR = 1, CHANNEL_FAR = 4;
/** How much wider the paper may grow from near to far out and still be a channel, a counter's, not a notch opening out. */
const CHANNEL_SPREAD = 1.8;

/** Whether the paper at an inside corner of the letter's outer outline is a counter's: read across the way that halves
    the corner (`dir`, from point p a little in from it), it runs on between ink on both sides and widens little, a
    channel (an n's arch from inside, a u's foot), not a notch opening out to the paper round the letter, as a wedge
    widens (a blackletter's head or foot on its stem, an X's crotches). A corner of a ring round a counter (an o's
    inside) is one anyway. */
function facesCounter(g: Grid, p: P, dir: number, stem: number): boolean {
  const x1 = g.x0 + g.W * g.cell, y1 = g.y0 + g.H * g.cell, dx = Math.cos(dir), dy = Math.sin(dir);
  // (how far across from q the paper runs each way to the ink; none where it runs out of the letter's box)
  const across = (q: P) => {
    let w = 0;
    for (const sg of [1, -1]) {
      let d = g.cell;
      for (; ; d += g.cell) {
        const x = q.x - dy * sg * d, y = q.y + dx * sg * d;
        if (x < g.x0 || y < g.y0 || x > x1 || y > y1) return Infinity;
        if (inkAt(g, x, y)) break;
      }
      w += d;
    }
    return w;
  };
  const near = { x: p.x + dx * stem * CHANNEL_NEAR, y: p.y + dy * stem * CHANNEL_NEAR }, far = { x: p.x + dx * stem * CHANNEL_FAR, y: p.y + dy * stem * CHANNEL_FAR };
  if (inkAt(g, near.x, near.y) || inkAt(g, far.x, far.y)) return true;
  const w0 = across(near), w1 = across(far);
  return w1 < Infinity && w1 <= CHANNEL_SPREAD * Math.max(w0, stem);
}
/** The letter's ink on a grid, for facesCounter: kept with its rings, as a slider dragged reads the same ones again. */
const counterGrids = new WeakMap<Node[][], Grid>();
/** The inside corners of a contour's corners (in any order) that follow each other closer than `gap` along it, with
    no other corner between, made one: a crotch a font draws rounded (cornersOf reads a round turning past 120° as
    its two halves) or cut across in facets (Turnpike's) is one crotch to round. With `convex`, the corners the ink
    wraps round instead (a tip cut across in facets is one tip). In the contour's order. Given `inInk`, inside corners are
    made one only where the point their sides close to is in the ink (not past a hairline across a counter's end, where
    the round would run out through it). Between inside corners, one the
    ink wraps round a hair from both (a hairline's end tucked into a stem, a notch NOTCH_GAP of `gap` across) is passed
    over, and goes in the round made of them. */
function crotchesOf(s: S[], corners: Corner[], gap: number, convex = false, inInk?: (p: P) => boolean): Corner[] {
  const n = s.length, sorted = corners.slice().sort((a, b) => a.i0 - b.i0), sg = convex ? 1 : -1;
  const span = (i: number, j: number) => { let l = 0; for (let k = i; k !== j; k = (k + 1) % n) l += s[k].len; return l; };
  const N = sorted.length, notch = gap * NOTCH_GAP;
  const ks = sorted.filter((k, i) => {
    if (convex || k.convex === convex || N < 3) return true;
    const a = sorted[(i - 1 + N) % N], b = sorted[(i + 1) % N];
    return !(a.convex === convex && b.convex === convex && span(a.i1, k.i0) < notch && span(k.i1, b.i0) < notch);
  });
  const sideIn = (i: number): [P, P] => s[i].kink ? [s[(i - 1 + n) % n], s[i]] : [sideTo(s, (i - 1 + n) % n, -1), s[(i - 1 + n) % n]];
  const sideOut = (i: number): [P, P] => s[i].kink ? [s[i], s[(i + 1) % n]] : [s[(i + 1) % n], sideTo(s, (i + 1) % n, 1)];
  const out: Corner[] = [];
  for (const k of ks) {
    const last = out[out.length - 1];
    if (last && last.convex === convex && k.convex === convex && span(last.i1, k.i0) < gap) {
      const v = meet(...sideIn(last.i0), ...sideOut(k.i1));
      let turn = 0, len = 0;
      for (let j = last.i0; ; j = (j + 1) % n) { turn += s[j].turn; if (j === k.i1) break; len += s[j].len; }
      // (as long as they close into a point near them, not a slot's two square corners, whose sides run on side by side;
      // and turn on as far as most of the two do, not a zigzag through a notch that comes out nearly straight)
      const near = (p: P) => Math.hypot(p.x - v!.x, p.y - v!.y) < gap * 4;
      const most = Math.abs(turn) >= Math.max(KINK, MERGE_KEEP * (Math.abs(last.turn) + Math.abs(k.turn)));
      if (v && most && turn * sg > 0 && Math.PI - turn * sg > CROTCH_MIN && near(s[last.i0]) && near(s[k.i1]) && (!inInk || inInk(v))) { out[out.length - 1] = { v, i0: last.i0, i1: k.i1, turn, r: len / Math.max(0.05, Math.abs(turn)), convex }; continue; }
    }
    out.push(k);
  }
  return out;
}

export interface CornerLooks {
  /** convex corners: their radius past the font's, and the step cut out of the square ones */ round: number; step: number;
  /** inside corners: the radius of the square and open ones (Counters), and of the narrow crotches (Joins), each at the least */ inner: number; join: number;
}
/** The corners a design asks for, for a letter of the font: the engine's own radii (roundnessR, innerRoundR in
    font.ts; joinR in joins.ts) for this letter's strokes. */
export const cornerLooks = (e: Effective, c: RestyleCtx): CornerLooks => ({
  round: roundnessR(e.roundness, c.stem), step: e.steps, inner: innerRoundR(e.innerRound, c.cap), join: joinR(e.joinRound, c.stem)
});
const sameCorners = (a: CornerLooks, b: CornerLooks) => Math.abs(a.round - b.round) < 0.3 && a.step === b.step && Math.abs(a.inner - b.inner) < 0.3 && Math.abs(a.join - b.join) < 0.3;

/** The contours with their corners rounded and stepped as `to` has them, where they stand as `from` had them. */
export function restyleCorners(cs: Node[][], c: RestyleCtx, from: CornerLooks, to: CornerLooks): Node[][] {
  if (sameCorners(from, to)) return cs;
  const stepAmt = added(from.step, to.step), thin = Math.min(c.stem, c.bar), inside = to.inner > from.inner || to.join > from.join;
  const gridOf = () => {
    let g = counterGrids.get(cs);
    if (!g) { g = inkGrid(cs, Math.max(2, c.stem / 6)); counterGrids.set(cs, g); }
    return g;
  };
  const out: Node[][] = [], all = inkRings(cs).map(r => annotate(despike(r)));
  let ink: ReturnType<typeof shape> | undefined;
  const inkOf = () => (ink ??= shape(all));
  let changed = false;
  /** Whether no outline of the letter runs into triangle `t`, but for the stretch of `own` from i0 to i1 (the outline the
      round drawn in the triangle takes the place of). */
  const clear = (t: [P, P, P], own: S[], i0: number, i1: number) => {
    const [A, B, C] = t, side = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const area = side(A, B, C), sg = Math.sign(area);
    if (Math.abs(area) < 1e-6) return true;
    // (strictly inside, by a hair: the outline the round meets touches its corners)
    const inside = (p: P) => sg * side(A, B, p) > 0.25 && sg * side(B, C, p) > 0.25 && sg * side(C, A, p) > 0.25;
    const cross = (p: P, q: P, u: P, v: P) => side(p, q, u) * side(p, q, v) < 0 && side(u, v, p) * side(u, v, q) < 0;
    for (const ring of all) for (let i = 0; i < ring.length; i++) {
      if (ring === own && ((i - i0 + ring.length) % ring.length) < ((i1 - i0 + ring.length) % ring.length)) continue;
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (inside(a) || cross(a, b, A, B) || cross(a, b, B, C) || cross(a, b, C, A)) return false;
    }
    return true;
  };

  for (const s of all) {
    if (s.length < 3) continue;
    // (a run of inside corners close together as one crotch, while Joins or Counters asks for rounder ones; and of
    // corners the ink wraps round a hair apart as one tip, while Roundness does)
    const found = cornersOf(s, Math.max(6, c.stem * 0.6));
    const crotches = inside ? crotchesOf(s, found, c.stem * 0.6, false, q => inkOf().has(q.x, q.y)) : found;
    const corners = to.round > from.round ? crotchesOf(s, crotches, c.stem * TIP_GAP, true) : crotches;
    // how wide an inside corner is: the angle between its sides read a stem out from it, past any round or cut the
    // font gives it (its other inside corners), short of a corner the ink wraps round (a crossbar's end). A crotch
    // the font draws rounded, read as two halves of a round, or cut across, read as two shallow corners, is then as
    // narrow as the strokes meeting there
    const outside = new Uint8Array(s.length);
    for (const k of corners) if (k.convex) for (let i = k.i0; ; i = (i + 1) % s.length) { outside[i] = 1; if (i === k.i1) break; }
    const out1 = (i: number, dir: 1 | -1) => {
      const n = s.length;
      let j = i, d = 0;
      for (let k = 0; k < n - 1 && d < c.stem; k++) {
        const nj = (j + dir + n) % n;
        if (outside[nj]) break;
        d += s[dir > 0 ? j : nj].len;
        j = nj;
      }
      return s[j];
    };
    // (the ink on its left: a ring running clockwise rings a counter, its paper all inside it)
    const hole = Math.max(0, -signedArea(s));
    const sidesOf = (k: Corner) => {
      const a = out1(k.i0, -1), p = s[k.i0], q = s[k.i1], b = out1(k.i1, 1);
      return [p.x - a.x, p.y - a.y, b.x - q.x, b.y - q.y];
    };
    const wide = (k: Corner) => {
      const [ux, uy, vx, vy] = sidesOf(k);
      if (Math.hypot(ux, uy) < 0.5 || Math.hypot(vx, vy) < 0.5) return Math.PI - Math.abs(k.turn);
      return Math.PI - Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
    };
    // whether a corner's sides run upright and level (an H's, a T's)
    // (a side read no way out, a corner the ink wraps round next to it, by the stretch next to the corner)
    const level = (k: Corner) => {
      const n = s.length, off = (x: number, y: number) => { const a = Math.abs(Math.atan2(y, x)) % (Math.PI / 2); return Math.min(a, Math.PI / 2 - a); };
      let [ux, uy, vx, vy] = sidesOf(k);
      if (Math.hypot(ux, uy) < 0.5) { const a = s[(k.i0 - 1 + n) % n]; ux = s[k.i0].x - a.x; uy = s[k.i0].y - a.y; }
      if (Math.hypot(vx, vy) < 0.5) { const b = s[(k.i1 + 1) % n]; vx = b.x - s[k.i1].x; vy = b.y - s[k.i1].y; }
      return Math.hypot(ux, uy) >= 0.5 && Math.hypot(vx, vy) >= 0.5 && off(ux, uy) < LEVEL_TOL && off(vx, vy) < LEVEL_TOL;
    };
    // whether the paper at a corner is a counter's, read from a little in from its middle along the way that halves it
    const faces = (k: Corner) => {
      const n = s.length, m = s[(k.i0 + (((k.i1 - k.i0 + n) % n) >> 1)) % n], a = s[(k.i0 - 1 + n) % n], b = s[(k.i1 + 1) % n];
      const ia = Math.hypot(s[k.i0].x - a.x, s[k.i0].y - a.y) || 1, ib = Math.hypot(b.x - s[k.i1].x, b.y - s[k.i1].y) || 1;
      let hx = -(s[k.i0].x - a.x) / ia + (b.x - s[k.i1].x) / ib, hy = -(s[k.i0].y - a.y) / ia + (b.y - s[k.i1].y) / ib;
      const hl = Math.hypot(hx, hy);
      // (the paper on the outline's right, the ink on its left)
      if (hl < 1e-6) { hx = (s[k.i0].y - a.y) / ia; hy = -(s[k.i0].x - a.x) / ia; } else { hx /= hl; hy /= hl; }
      const g = gridOf();
      return hole > 0 || facesCounter(g, { x: m.x + hx * c.stem * 0.35, y: m.y + hy * c.stem * 0.35 }, Math.atan2(hy, hx), c.stem);
    };
    // each corner's radius (and step) as asked for
    const plan = corners.map(k => {
      let r = k.r, step = 0;
      if (k.convex) {
        r = Math.max(0, k.r + to.round - from.round);
        // a square corner (between 70° and 110°) steps back, as far as most of the thinner stroke's thickness
        if (stepAmt > 0 && Math.abs(Math.abs(k.turn) - Math.PI / 2) < 0.35) step = stepAmt * STEP_DEPTH * thin;
      } else {
        if (!inside) return { k, r, step, full: r, redo: false };
        // inside corners only round further: a narrow crotch by Joins, a square corner of upright and level strokes by
        // Counters, split by how wide it is as the engine's are (innerShare, crotchShare); any other whole by Counters
        // where it faces a counter (a blackletter's arches, an o's inside) and by Joins where it is a notch in the
        // letter's outline, where strokes meet at a slant (a blackletter's heads and feet on their stems, a bracket)
        const ang = wide(k), [ish, jsh] = ang > CROTCH && !level(k) ? (faces(k) ? [1, 0] : [0, 1]) : [innerShare(ang), crotchShare(ang)];
        const inner = Math.max(0, to.inner - from.inner) * ish;
        const join = Math.max(0, to.join - from.join) * jsh;
        r = Math.max(k.r, k.r + Math.max(inner, join));
        // and as far as the sliders at their top would round it, so a corner with less room than that rounds a share
        // of it (below), as an engine's join does, and keeps rounding all the way to the top
        const full = Math.max(innerRoundR(1, c.cap) - from.inner, 0) * ish, fullJoin = Math.max(joinR(1, c.stem) - from.join, 0) * jsh;
        return { k, r, step, full: k.r + Math.max(full, fullJoin), redo: Math.abs(r - k.r) > 0.5 };
      }
      // (and as far as Roundness at its top would round it, as an inside corner by Joins and Counters)
      return { k, r, step, full: Math.max(r, k.r + roundnessR(1, c.stem) - from.round), redo: Math.abs(r - k.r) > 0.5 || step > 0 };
    });
    // a step takes at most half the side it shares with the next corner, as the engine's do (two steps on a
    // stroke's square end meet in its middle at most)
    const at = (i: number) => { let l = 0; for (let k = 0; k < i; k++) l += s[k].len; return l; };
    const total = at(s.length), pos = plan.map(p => (at(p.k.i0) + at(p.k.i1)) / 2);
    // and only a corner of the letter, where strokes meet square or a stroke turns (the foot of an L, the
    // corners of an E), not one of a stroke's square end, a short side away from the other, as the engine's
    const thick = Math.max(c.stem, c.bar) * 1.6;
    // a round reaches no further along either side than about half way to the next corner, so two never cross
    // (a B's counters, rounded all round by Counters, stay counters)
    // and no further than either side runs on straight: past that it curves away (a B's waist, between its bowls)
    // (an inside corner's side curving on round the way the corner turns, as a pointed arch's into its stem, is room for
    // its round up to BEND_ON from where it starts: the round carries on its curve)
    const straight = (i: number, dir: 1 | -1, bend = 0) => {
      const n = s.length, a = s[i], b = s[(i + dir + n) % n], ux = (b.x - a.x), uy = (b.y - a.y), lu = Math.hypot(ux, uy) || 1;
      let len = 0;
      for (let k = 0; k < n - 1; k++) {
        const p = s[(i + dir * k + n * (k + 1)) % n], q = s[(i + dir * (k + 1) + n * (k + 1)) % n], l = Math.hypot(q.x - p.x, q.y - p.y);
        const cos = l > 0 ? ((q.x - p.x) * ux + (q.y - p.y) * uy) / (l * lu) : 1;
        if (cos < Math.cos(0.4) && (!bend || Math.sign(ux * (q.y - p.y) - uy * (q.x - p.x)) * dir !== Math.sign(bend) || cos < Math.cos(BEND_ON))) break;
        len += l;
      }
      return len;
    };
    // an inside corner's round reaches as far as it can be drawn clear of the letter's other ink (a stroke across the
    // corner's mouth, a counter narrower than it: fits), no further along either side than half way
    // to a corner rounded too, nine tenths of the way to one that isn't, and no further than the side runs on straight
    // or curving round the corner's way (straight): past that it curves away (a B's waist, an 8's)
    const fits = (k: Corner, r: number) => {
      // (the round runs from as far along the outline either side as its radius reaches, roundContour's want, round
      // the corner's point: in the triangle the three make, where no other ink may be)
      const n = s.length, d = r * Math.tan(Math.min(Math.abs(k.turn), 2.6) / 2);
      const walk = (start: number, dir: 1 | -1): { p: P; j: number } | null => {
        let prev: P = k.v, l = 0;
        for (let m = 0, j = start; m < n - 1; m++, j = (j + dir + n) % n) {
          const q = s[j], seg = Math.hypot(q.x - prev.x, q.y - prev.y);
          if (l + seg >= d) { const t = (d - l) / (seg || 1); return { p: { x: prev.x + (q.x - prev.x) * t, y: prev.y + (q.y - prev.y) * t }, j }; }
          l += seg; prev = q;
        }
        return null;
      };
      const a = walk((k.i0 - 1 + n) % n, -1), b = walk((k.i1 + 1) % n, 1);
      if (!a || !b) return false;
      // (in a counter the ink rings round, filling no more than HOLE_FILL of it)
      if (hole > 0 && Math.abs((a.p.x - k.v.x) * (b.p.y - k.v.y) - (a.p.y - k.v.y) * (b.p.x - k.v.x)) / 2 > HOLE_FILL * hole) return false;
      return clear([a.p, k.v, b.p], s, a.j, b.j);
    };

    const rounding = (o: (typeof plan)[number]) => o.k.r > 0.5 || o.full > o.k.r + 0.5;
    plan.forEach((p, j) => {
      // (a ring with one corner, a teardrop counter, rounds it as far as the rest of the ring leaves room)
      if ((plan.length < 2 && p.k.convex) || p.r <= p.k.r) return;
      const J = plan.length, prev = (pos[j] - pos[(j - 1 + J) % J] + total) % total || total, next = (pos[(j + 1) % J] - pos[j] + total) % total || total;
      let most: number;
      if (p.k.convex) {
        const room = Math.min(0.45 * Math.min(prev, next), 0.9 * straight((p.k.i0 - 1 + s.length) % s.length, -1), 0.9 * straight((p.k.i1 + 1) % s.length, 1));
        most = room / Math.tan(Math.min(Math.abs(p.k.turn), 2.6) / 2);
      } else {
        // (each side read from the corner itself, its first stretch counted: a straight side is one stretch, its two ends)
        const share = (o: (typeof plan)[number]) => (rounding(o) ? 0.45 : 0.9), bend = p.k.turn;
        const room = Math.min(share(plan[(j - 1 + J) % J]) * prev, share(plan[(j + 1) % J]) * next,
          0.9 * straight(p.k.i0, -1, bend), 0.9 * straight(p.k.i1, 1, bend));
        most = room / Math.tan(Math.min(Math.abs(p.k.turn), 2.6) / 2);
        if (!fits(p.k, most)) {
          let lo = 0, hi = most;
          for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (fits(p.k, mid)) lo = mid; else hi = mid; }
          most = lo;
        }
      }
      p.r = p.full <= most ? Math.max(p.k.r, Math.min(p.r, most)) : p.k.r + (p.r - p.k.r) * Math.max(0, most - p.k.r) / (p.full - p.k.r);
      p.redo = Math.abs(p.r - p.k.r) > 0.5 || p.step > 0;
    });
    plan.forEach((p, j) => {
      if (!p.step || plan.length < 2) return;
      const J = plan.length, a = plan[(j - 1 + J) % J], b = plan[(j + 1) % J];
      const prev = (pos[j] - pos[(j - 1 + J) % J] + total) % total || total, next = (pos[(j + 1) % J] - pos[j] + total) % total || total;
      if ((a.k.convex && prev < thick) || (b.k.convex && next < thick)) { p.step = 0; p.redo = Math.abs(p.r - p.k.r) > 0.5; return; }
      p.step = Math.min(p.step, 0.45 * Math.min(prev, next));
    });
    if (plan.some(p => p.redo)) changed = true;
    // the outline again, each corner drawn again its own way
    const skip = new Map<number, (typeof plan)[number]>();
    for (const p of plan) if (p.redo) skip.set(p.k.i0, p);
    const pts: Pt[] = [];
    const n = s.length;
    const inRedo = new Uint8Array(n);
    for (const p of plan) if (p.redo) for (let k = p.k.i0; ; k = (k + 1) % n) { inRedo[k] = 1; if (k === p.k.i1) break; }
    for (let i = 0; i < n; i++) {
      const p = skip.get(i);
      if (p) { pts.push({ x: p.k.v.x, y: p.k.v.y, r: p.r, ...(p.step ? { step: p.step } : {}) }); continue; }
      if (inRedo[i]) continue;
      pts.push({ x: s[i].x, y: s[i].y, sharp: s[i].kink || undefined, smooth: !s[i].kink || undefined });
    }
    out.push(...fitOutline(roundContour(pts, 0), FIT_TOL));
  }
  return changed ? out : cs;
}

/* ---- stroke ends */

/** The shape the picked kind of stroke end gives, everything that tells one from another. */
const endLook = (e: Effective) => JSON.stringify({ t: e.terminal, ...termSpec(e) });

/** A stroke's free end, read off the skeleton: the skeleton's points from the tip in, the stroke's
    usual half-thickness back from its end, and how far the ink reaches on past the skeleton's tip; `exit` for a
    script's exit stroke, which Length and Curl move but no kind of stroke end reshapes (as the engine's own exits end
    plain), `run` long from its tip to where it leaves the letter. */
interface End { pts: SkPt[]; body: number; reach: number; exit?: true; run?: number }

/** Where the engine's own letters end their strokes in styled ends (their marks of type 'terminal', not a plain end's),
    each as shares across and up the letter's ink box: as the engine writes them upright, with either storey of an a and a
    g, and (`italic`) with the entry and exit strokes an italic hand gives the n, the i, the l, the a and the rest. A free
    font's letter has its styled ends where the engine's letter of the same character has them (see terminalEnds), on its
    curving strokes: a crossbar's ends (an f's, a 2's foot) run straight, and keep the font's own. */
const SPOT_LOOKS: Record<'upright' | 'italic', Partial<Params>[]> = {
  upright: [{}, { story: 'single' }, { gForm: 'double' }],
  italic: [{}, { story: 'single' }, { gForm: 'double' }, { cursive: 0.45 }]
};
const spotFonts: Font[] = [], spotsOf = new Map<string, P[]>();
function endSpots(ch: string, italic: boolean): P[] {
  const key = (italic ? 'i' : 'u') + ch;
  let spots = spotsOf.get(key);
  if (spots) return spots;
  spots = [];
  SPOT_LOOKS[italic ? 'italic' : 'upright'].forEach((look, i) => {
    const f = (spotFonts[i] ??= buildFont({ ...DEFAULTS, ...look } as Params)), g = f.glyph(ch);
    if (!g) return;
    const xs: number[] = [], ys: number[] = [];
    for (const c of g.cmds) for (let k = 1; k + 1 < c.length; k += 2) { xs.push(c[k] as number); ys.push(c[k + 1] as number); }
    const box = boxOf(xs, ys);
    for (const mk of g.marks) {
      if (mk.type !== 'terminal' || !mk.id || mk.id.startsWith('p')) continue;
      // (a straight stroke's, a crossbar's, keeps its own end on a free font's letter, but for a tail's, which a font may
      // curl where the engine runs it straight, as a y's: see terminalEnds)
      const st = g.strokes.find(t => t.id === String(parseInt(mk.id!)));
      if (st && !st.curved && st.part !== 'tail') continue;
      const q = inBox(box, mk);
      if (!spots!.some(o => Math.hypot(o.x - q.x, o.y - q.y) < 0.05)) spots!.push(q);
    }
  });
  spotsOf.set(key, spots);
  return spots;
}
type Box = { x0: number; y0: number; w: number; h: number };
const boxOf = (xs: number[], ys: number[]): Box => {
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x0, y0, w: Math.max(1, Math.max(...xs) - x0), h: Math.max(1, Math.max(...ys) - y0) };
};
const inBox = (b: Box, q: P): P => ({ x: (q.x - b.x0) / b.w, y: (q.y - b.y0) / b.h });
/** How far apart (in shares of the letter's box) a free end of a font's letter and a styled end of the engine's may lie
    and still be the same end. */
const SPOT_NEAR = 0.3;
/** How far round (degrees) a styled end's stroke turns from the way it heads at its tip within END_TURN_AT of the
    x-height (or a few of its thicknesses, if more), at the least: a crossbar's end (an f's, a t's, a 2's foot) runs
    straight, and keeps its own end. */
const END_TURN = 12, END_TURN_AT = 0.35;

/** The free ends of a letter's strokes that take a styled end (a terminal): those standing where the engine's letter
    `c.ch` has its styled ends (endSpots; on a cursive design's letters, `italic`, its italic ones as well), each the end
    of a stroke that curves (c, e, s, the hook of an a, f, j, r, t, the tail of a J, a y): never a stem's, an arm's or a
    serif's (a stem's foot, the beak of an s, each the prong of a fork in the skeleton), a crossbar's, which runs
    straight, nor a dot. In a script whose letters stand apart (`c.exits`), a small letter's exit stroke too, marked
    `exit`: of the free ends left, the one furthest right of those of a hairline (no thicker than EXIT_THIN of the
    font's stems: not an ascender's top, which leans as far right) standing in the right of the letter (EXIT_X) and
    rising on out of it (EXIT_RISE, leaning back left no more than a little; not a crossbar's end), straight or not.
    `g`, the letter's ink, is read for how far the ink reaches on past each end; without it each end's `reach` is 0
    (enough to tell whether there are any). */
function terminalEnds(sk: Skeleton, c: { ch: string; xh: number; exits?: { stem: number } }, italic: boolean, box: Box, g?: Grid): End[] {
  const spots = endSpots(c.ch, italic), exits = !!c.exits && /[a-z]/.test(c.ch);
  if (!spots.length && !exits) return [];
  const cands: (End & { q: P; tip: P; out: P; curves: boolean; len: number })[] = [];
  sk.nodes.forEach((n, ni) => {
    if (n.edges.length !== 1) return;
    const E = sk.edges[n.edges[0]];
    if (E.a === E.b) return;
    const pts = E.a === ni ? E.pts : E.pts.slice().reverse();
    // its usual half-thickness: the middle of the skeleton's, past the end itself
    const arc = arcOf(pts);
    // (read near the end: a high-contrast stroke is much heavier round its middle than out at its ends; but past the
    // round of its tip, where that is a ball, a Didone's r's, far heavier than the stroke it ends)
    const med = (lo: number, hi: number) => { const rs = pts.filter((_, k) => arc[k] >= lo && arc[k] <= hi).map(p => p.r).sort((a, b) => a - b); return rs.length ? rs[rs.length >> 1] : 0; };
    const b0 = med(n.r * 2, Infinity) || n.r, lo = Math.max(b0 * 1.5, n.r * 1.2), body = med(lo, Math.max(b0 * 4, lo + b0 * 2.5)) || b0;
    if (E.len < body * 2.5) return;
    // (a serif's two tips, or a beak's, are the prongs of a fork the stroke runs into: short, and the node they run into
    // holds another short free end)
    const nb = E.a === ni ? E.b : E.a, other = sk.nodes[nb], PRONG = c.xh * 0.4;
    if (E.len < PRONG && other.edges.length >= 3 && other.edges.some(ei => {
      const F = sk.edges[ei], far = F.a === nb ? F.b : F.a;
      return ei !== n.edges[0] && F.a !== F.b && sk.nodes[far].edges.length === 1 && F.len < PRONG;
    })) return;
    // it curves: how far round it has turned within a stretch of its tip (read past the very tip, which a square end's
    // corners pull aside)
    const at = (a: number) => indexAt(arc, a), u = Math.max(body, c.xh * 0.04), D = Math.max(body * 5, c.xh * END_TURN_AT);
    const d0 = dirAlong(pts, at(Math.min(body * 0.5, u)), at(u * 1.5)), d1 = dirAlong(pts, at(Math.min(D, E.len) - u), at(Math.min(D, E.len)));
    const turned = Math.acos(Math.max(-1, Math.min(1, d0.x * d1.x + d0.y * d1.y))) * 180 / Math.PI;
    const curves = turned >= END_TURN;
    if (!curves && !exits) return;
    const dir = { x: -d0.x, y: -d0.y };
    let reach = 0;
    if (g) while (reach < body * 4 && inkAt(g, n.x + dir.x * (reach + 1), n.y + dir.y * (reach + 1))) reach += 1;
    cands.push({ pts, body, reach, q: inBox(box, n), tip: { x: n.x, y: n.y }, out: dir, curves, len: E.len });
  });
  // each of the engine's styled ends claims the nearest free end (of a stroke that curves), nearest first
  const pairs = spots.flatMap((s, si) => cands.map((e, ei) => ({ si, ei, d: Math.hypot(e.q.x - s.x, e.q.y - s.y) })))
    .filter(p => p.d < SPOT_NEAR && cands[p.ei].curves).sort((a, b) => a.d - b.d);
  const tookS = new Set<number>(), tookE = new Set<number>(), out: End[] = [];
  const end = (i: number): End => { const { pts, body, reach } = cands[i]; return { pts, body, reach }; };
  for (const p of pairs) {
    if (tookS.has(p.si) || tookE.has(p.ei)) continue;
    tookS.add(p.si); tookE.add(p.ei);
    out.push(end(p.ei));
  }
  if (exits) {
    let best = -1;
    cands.forEach((e, i) => {
      if (tookE.has(i) || e.q.x < EXIT_X || e.out.y < EXIT_RISE || e.out.x < -0.15 || e.body * 2 > c.exits!.stem * EXIT_THIN) return;
      if (best < 0 || e.tip.x > cands[best].tip.x) best = i;
    });
    if (best >= 0) out.push({ ...end(best), exit: true, run: cands[best].len });
  }
  return out;
}
/** How far right (a share of the letter's ink box) a script's exit stroke ends, at the least; how steeply it rises
    there (the way out from its tip, its y), at the least; and how thick it is, as a share of the font's stems, at the
    most. */
const EXIT_X = 0.55, EXIT_RISE = 0.3, EXIT_THIN = 0.5;
/** How much of its run an exit stroke is drawn longer or shorter at the ends of Length's slider, from the font's own
    (half the slider each way), and how much of it, from its tip, Curl turns: a hairline runs far longer than a
    terminal, and moved by as much as one it would hardly change. */
const EXIT_LEN = 0.6, EXIT_BACK = 0.6;
/** Whether a letter of a free font (its rig's contours `cs`, skeleton `sk`) has a stroke end that takes a styled end (see
    terminalEnds), written upright or as an italic. */
export const hasTerminals = (cs: Node[][], sk: Skeleton, c: { ch: string; xh: number }) => terminalEnds(sk, c, true, inkBox(cs)).length > 0;
/** The box round a letter's ink. */
const inkBox = (cs: Node[][]): Box => { const r = inkRings(cs).flat(); return boxOf(r.map(q => q.x), r.map(q => q.y)); };

const dirAlong = (pts: SkPt[], i: number, j: number): P => {
  const a = pts[i], b = pts[Math.max(i + 1, j)] ?? pts[pts.length - 1], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
};

/** Where the line through p along n crosses a ring: the nearest crossing on each side of p (u > 0 and u < 0),
    no further than `max`: how far along the line from p (u), the segment it falls on (i) and the point. */
interface Cross { u: number; i: number; x: number; y: number }
function crossings(ring: P[], p: P, n: P, max: number): [Cross, Cross] | null {
  let pos: Cross | null = null, neg: Cross | null = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const da = (a.x - p.x) * -n.y + (a.y - p.y) * n.x, db = (b.x - p.x) * -n.y + (b.y - p.y) * n.x;
    if ((da > 0) === (db > 0) || da === db) continue;
    const t = da / (da - db), x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, u = (x - p.x) * n.x + (y - p.y) * n.y;
    if (Math.abs(u) > max) continue;
    if (u > 0 && (!pos || u < pos.u)) pos = { u, i, x, y };
    if (u < 0 && (!neg || u > neg.u)) neg = { u, i, x, y };
  }
  return pos && neg ? [pos, neg] : null;
}

/** Points along a polyline at the same shares of its length as `us` (0 its start, 1 its end). */
function atShares(line: P[], us: number[]): P[] {
  const arc = arcOf(line);
  const L = arc[arc.length - 1] || 1;
  return us.map(u => {
    const a = u * L;
    let k = 1;
    while (k < line.length - 1 && arc[k] < a) k++;
    const f = (a - arc[k - 1]) / ((arc[k] - arc[k - 1]) || 1);
    return { x: line[k - 1].x + (line[k].x - line[k - 1].x) * f, y: line[k - 1].y + (line[k].y - line[k - 1].y) * f };
  });
}

/** The contours with their strokes' styled ends drawn as the engine draws the kind of end `to` picks, where
    they stand as the font draws them for `from`. The stroke keeps the font's own sides up to where its own end
    begins (a ball, a flare, a cut); from there they run straight on as far as the font's end reached, and the
    engine's end is drawn across them (stroke.ts): rounded, pointed, cut on a slant, a drop or a ball; a taper or
    a flare narrows or widens the sides over as long a stretch as the engine's do, and a drop shortens them. */
export function restyleEnds(cs: Node[][], c: RestyleCtx, from: Effective, to: Effective, sk: SkeletonOf): Node[][] {
  const reshape = endLook(from) !== endLook(to), moves = endMoves(c, from, to);
  // (and moved as far as Length and Curl go the way they are turned, which an end has room for a share of: see carriedEnd)
  const most = (k: 'terminalLength' | 'terminalCurl') => (to[k] === from[k] ? to[k] : to[k] > from[k] ? 1 : 0);
  const movesMost = endMoves(c, from, { ...to, terminalLength: most('terminalLength'), terminalCurl: most('terminalCurl') });
  if (!reshape && !moves) return cs;
  // (an exit stroke, which only Length and Curl move, is left out where they don't: the letter's outline is drawn again
  // only where an end is)
  const g = inkGrid(cs, 2), ends = terminalEnds(sk(), c, to.cursive >= CURSIVE_FORMS || from.cursive >= CURSIVE_FORMS, inkBox(cs), g)
    .filter(e => { const m = e.exit && (moves ? moves(e, 0) : { len: 0, bend: 0 }); return !m || Math.abs(m.len) >= 0.5 || Math.abs(m.bend) >= 0.005; });
  if (!ends.length) return cs;
  const T = termSpec(to), top = termSpec({ ...to, terminalSize: 1, terminalFlare: 1, terminalPoint: 1, terminalSlope: 1 });
  const rings = inkRings(cs);
  // (the middle of the letter's ink)
  const xs = rings.flat().map(q => q.x), ys = rings.flat().map(q => q.y);
  const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  for (const end of ends) {
    // (an exit stroke keeps the font's own end, whatever kind is picked: only Length and Curl move it)
    const restyle = reshape && !end.exit;
    const { pts, body } = end, arc = arcOf(pts);
    // how much longer (or shorter) the end is drawn, and how much further round it bends, by the radius it curves at
    const kEnd = endCurvature(pts, arc, body), mv = moves ? moves(end, kEnd) : { len: 0, bend: 0 };
    const mvMost = movesMost ? movesMost(end, kEnd) : mv;
    if (!restyle && Math.abs(mv.len) < 0.5 && Math.abs(mv.bend) < 0.005) continue;
    const left = (d: P) => ({ x: -d.y, y: d.x });
    /** the end drawn again as `plan` has it, on whichever ring holds the stroke's two sides there ('done', or left as
        the font draws it); 'nearer' (or 'short', one stopping at once) where those sides, walked out from S, don't both run on to its end (one stops at a
        corner where another stroke meets it); 'none' where no ring has the stroke's two sides at S */
    const redraw = (plan: EndPlan): 'done' | 'nearer' | 'short' | 'none' => {
      const { S, outS, E, way, shaped } = plan;
      for (let ri = 0; ri < rings.length; ri++) {
        let ring = rings[ri];
        let cr = crossings(ring, S, left(outS), body * 2.5);
        // (the stroke's own two sides, both on the one ring as it ends free: not a counter's edge)
        if (!cr || cr[0].u < body * 0.4 || cr[0].u > body * 1.8 || -cr[1].u < body * 0.4 || -cr[1].u > body * 1.8) continue;
        // (walked the way side A, from the crossing on the left, heads out)
        const n0 = ring.length, fwd = (ring[(cr[0].i + 1) % n0].x - cr[0].x) * outS.x + (ring[(cr[0].i + 1) % n0].y - cr[0].y) * outS.y > 0;
        // (a ring running the other way is read backwards, and turned back once its end is drawn again, so a hole
        // stays a hole)
        if (!fwd) { ring = ring.slice().reverse(); cr = crossings(ring, S, left(outS), body * 2.5)!; }
        const n = ring.length, [ca, cb] = cr;
        // the font's end: the ring from A's crossing on round the tip to B's
        const endPath: P[] = [];
        for (let k = (ca.i + 1) % n, step = 0; step < n; k = (k + 1) % n, step++) { endPath.push(ring[k]); if (k === cb.i) break; }
        // (no longer than the stroke's two sides out to its end and round it, a ball's whole round included: not the
        // letter's whole outline the other way round)
        if (endPath[endPath.length - 1] !== ring[cb.i] || arcLen(endPath) > 2 * (plan.atS + end.reach) + 6 * body + (plan.shaped ? Math.PI * plan.atE * 1.2 : 0)) continue;
        // each side as the font draws it, from S on to where it stops running along the stroke: a corner of its end,
        // or its turning off round it (a round end); short of a ball or a flare, only to where that begins
        // (up to E the side is the stroke's own, wherever it heads; past E it counts only while it runs on out)
        const pastE = (q: P) => (q.x - E.x) * way.x + (q.y - E.y) * way.y > 0;
        const walk = (path: P[], from: P): P[] => {
          const out = [from];
          for (const q of path) {
            const o = out[out.length - 1], l = Math.hypot(q.x - o.x, q.y - o.y);
            if (l < 0.5) continue;
            if (shaped && pastE(q)) break;
            if (out.length > 1) {
              const pr = out[out.length - 2], ux = o.x - pr.x, uy = o.y - pr.y, lu = Math.hypot(ux, uy) || 1, vx = (q.x - o.x) / l, vy = (q.y - o.y) / l;
              if (Math.abs(Math.atan2(ux / lu * vy - uy / lu * vx, ux / lu * vx + uy / lu * vy)) > 0.4) break;
              // (past E only while it runs on out with the stroke: not on round the font's own round end)
              if (pastE(q) && vx * way.x + vy * way.y < SIDE_ON) break;
            }
            out.push(q);
          }
          return out;
        };
        const A0 = walk(endPath, ca), B0 = walk(endPath.slice().reverse(), cb);
        if (A0.length < 2 || B0.length < 2) continue;
        // (one side stopping far short of the other where the outline turns off away from the stroke: S is back past where
        // another stroke meets this one. An end cut on a slant stops one side short too, but its outline turns there on
        // across the stroke's end, toward the other side; and a ball's neck stops short where the ball hangs over it)
        const la = arcLen(A0), lb = arcLen(B0);
        const offAway = (side: P[], path: P[], other: P) => {
          const q = side[side.length - 1], k = path.indexOf(q as P);
          let next: P | undefined;
          for (let j = k + 1; j >= 1 && j < path.length && !next; j++) if (Math.hypot(path[j].x - q.x, path[j].y - q.y) > body * 0.5) next = path[j];
          return !!next && (next.x - q.x) * (other.x - side[0].x) + (next.y - q.y) * (other.y - side[0].y) < 0;
        };
        const shortA = la < lb, rev = endPath.slice().reverse(), away = () => (shortA ? offAway(A0, endPath, cb) : offAway(B0, rev, ca));
        if (Math.min(la, lb) < Math.max(la, lb) * 0.35 && Math.abs(la - lb) > body * 3 && !shaped && away()) return 'nearer';
        // (one side turning off at once, the other running on out far: S is back past where a short heavy stroke, a block
        // letter's tail (a y's), leaves the rest of the letter, by less than the stroke is thick)
        if (c.stubs && Math.min(la, lb) < body * 0.3 && Math.max(la, lb) > body && !shaped && straightTo(end.pts, plan.atS) && away()) return 'short';
        // (a ball or a drop: the end's round about as wide as the neck it hangs from, or wider, a Didone's or a Baskerville's,
        // and round all the way: not a squared arm's end, an r's, widening out to its cut)
        const w = Math.hypot(ca.x - cb.x, ca.y - cb.y), tipR = end.pts[0].r;
        const past = endPath.map(pastE), k0 = past.indexOf(true), k1 = past.lastIndexOf(true);
        const ball = shaped && tipR > w * BALL_NECK && (k0 < 0 || straightRun(endPath.slice(k0, k1 + 1)) < tipR);
        // (a stroke widening out all the way to its end from a notch where it leaves another stroke, as a squared r's arm
        // does from its stem, has no stretch of its own sides to draw a new end across: both stop short at once, so near
        // that other stroke, and it keeps the font's own end)
        if (shaped && !ball && tipR > w * 0.6 && Math.max(la, lb) < plan.atS * 0.3 && plan.atS > arc[arc.length - 1] * 0.45) return 'done';
        // the rest of the ring, from B's crossing on round to A's
        const rest: P[] = [];
        for (let k = (cb.i + 1) % n, step = 0; step < n; k = (k + 1) % n, step++) { rest.push(ring[k]); if (k === ca.i) break; }
        // the engine's end drawn across the font's sides, as big as the room the font's own end left it, or (only Length,
        // Curl, Tails & hooks or Openness moved) the font's own carried on. A ball of the font's own is no stroke's two
        // sides to draw it across: the stroke runs on into it as thick as at S, along its skeleton, toward its middle
        const [As0, Bs0, at] = restyle && ball ? [...runOn(end.pts, plan.S, ca, cb), { ...plan, shaped: false }] : [A0, B0, plan];
        const near = roomAround(rings, ri, rest, body * 1.6);
        const drawn = restyle ? fittedEnd(at, end, As0, Bs0, to, T, top, c.xh, ball ? end.pts[0].r : 0, mid, endPath, near)
          : carriedEnd(plan, end, endPath, A0, B0, ca, cb, near, mvMost);
        // (an end with no room for even the least of the engine's, as a heavy letter's in a narrow opening, is left as the
        // font draws it)
        if (!drawn) return 'done';
        // the font's end out, the new one in, between the two crossings
        const spliced = [...drawn.slice(1, -1), { x: cb.x, y: cb.y }, ...rest, { x: ca.x, y: ca.y }];
        // (a new end of the engine's that takes away or adds far more ink than an end has, or runs out far past where the
        // font's own end reached and Length draws it on, was drawn on the wrong stretch, as across an end cut on a slant
        // from its very cut: left be)
        const out = (l: P[]) => Math.max(...l.map(q => Math.hypot(q.x - plan.S.x, q.y - plan.S.y)));
        if (restyle && out(drawn) > out(endPath) + Math.max(0, plan.len) + c.xh * REACH_X + body * 0.5) return 'done';
        if (restyle) {
          const was = Math.abs(signedArea(ring)), now = Math.abs(signedArea(spliced));
          // (a ball of the font's own, taken off, is as much ink again as its round, the end's skeleton running in from its
          // middle to its edge)
          if (Math.abs(now - was) > Math.min(4 * body * (plan.atS + body * 3) + (shaped ? Math.PI * plan.atE ** 2 : 0), was * 0.35)) return 'done';
        }
        rings[ri] = fwd ? spliced : spliced.reverse();
        return 'done';
      }
      return 'none';
    };
    // (drawn again from as far back as the end reaches while the stroke runs alone; where no stroke sides are found
    // there, as by a teardrop hanging beside its neck, which reads as another stroke, from as far back as it reaches;
    // and where its sides from there don't both run on out to its end, from nearer its tip)
    // (and where the line across the stroke there runs into the end itself, as across a ball's neck into the ball hanging
    // over it, from a little further back each time)
    for (let tries = 0, cap = Infinity, alone = true, back = 0; tries < 7; tries++) {
      const plan = measureEnd(end, arc, kEnd, mv, to, T, alone ? (p, d) => widthAcross(rings, p, left(d), body * 4) : null, cap, back, !!c.stubs);
      const got = redraw(plan);
      if (got === 'done') break;
      // (an exit stroke drawn again from far back along it, where it runs beside a stem, from nearer its tip)
      if (got === 'none' && end.exit) {
        if (plan.atS < body * 2) break;
        cap = plan.atS * 0.7; back = 0;
      } else if (got === 'none') {
        const on = plan.atS + Math.max(body, c.xh * 0.03);
        if (on <= Math.min(cap, arc[arc.length - 1] * 0.6) && plan.atS >= back - 0.5) back = on;
        else if (alone) { alone = false; back = 0; }
        else break;
      } else if (plan.atS < body * (got === 'short' ? 0.8 : 2)) break;
      else { cap = plan.atS * 0.7; back = 0; }
    }
  }
  // (a new end may run over another stroke, or a drop over its own: the ink is read again as one)
  const ink = shape(rings);
  return refit(combine([ink], ink.has));
}

/** A stroke's end as it is drawn again: where along its skeleton the new end starts (S, `atS` from the tip) and
    where a ball or a flare of the font's begins (E, `atE`), the way the stroke runs at each (dS0, dE0, pointing in
    from the tip) and out of it (outS, way); whether the font's own end is shaped (a ball, a flare); whether the
    engine's is a taper or a flare, and how far back that runs; and how much longer it is drawn (shorter, negative),
    how much further round it bends, and the curvature it turns at toward its end. */
interface EndPlan {
  S: SkPt; atS: number; dS0: P; outS: P;
  E: SkPt; atE: number; dE0: P; way: P;
  shaped: boolean; tapers: boolean; flares: boolean; runBack: number;
  len: number; bend: number; kEnd: number;
}

/** How much wider across than its skeleton says it is thick a stroke may grow before another stroke counts as running
    into it (see measureEnd). */
const ALONE_WIDE = 1.5;
/** Whether a stroke's skeleton (`pts`, from its tip in) runs straight from near its tip to `at` along it: no point
    between further off the line joining them than a twentieth of how far apart they are. */
function straightTo(pts: SkPt[], at: number): boolean {
  const arc = arcOf(pts), k1 = indexAt(arc, at), k0 = indexAt(arc, arc[k1] * 0.2), a = pts[k0], b = pts[k1];
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  if (k1 - k0 < 3 || l < 1) return false;
  for (let k = k0; k <= k1; k++) if (Math.abs((pts[k].x - a.x) * (b.y - a.y) - (pts[k].y - a.y) * (b.x - a.x)) / l > l * 0.05) return false;
  return true;
}
/** How long, at the most, a tail run out of a ring is against the ring, for Stencil to cut the ring down its middle as
    an O's rather than open it where the tail leaves (a Q's tail; a 9's stroke is far longer). */
const TAIL_SHORT = 0.15;
/** How narrow, at the least, a stencil gap on a free font's letter is drawn (a share of Stencil's) where its full width
    would leave a sliver of ink (a heavy letter's short bar). */
const GAP_LEAST = 0.4;
/** How much wider across than it is thick a stub (a stroke running alone for less than its end needs) may grow before
    it counts as leaving the stroke it stands out of: less than ALONE_WIDE, as a stub's join is close and rounded. */
const STUB_WIDE = 1.15;
/** How far round (radians) a stroke may turn between its tip and where its end is drawn again from. */
const ALONE_TURN = 2.1;
/** How wide the ink is across the line through p along n (a unit vector), as far as `max` out either side: from the
    nearest edge on one side to the nearest on the other, of any of the rings. */
function widthAcross(rings: P[][], p: P, n: P, max: number) {
  let pos = max, neg = max;
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const da = (a.x - p.x) * -n.y + (a.y - p.y) * n.x, db = (b.x - p.x) * -n.y + (b.y - p.y) * n.x;
    if ((da > 0) === (db > 0) || da === db) continue;
    const t = da / (da - db), u = (a.x + (b.x - a.x) * t - p.x) * n.x + (a.y + (b.y - a.y) * t - p.y) * n.y;
    if (u > 0) pos = Math.min(pos, u); else neg = Math.min(neg, -u);
  }
  return pos + neg;
}

/** Where a stroke's end (its skeleton's points `arc` along from the tip) is drawn again from, for the end `to`
    picks (T its spec), moved by `mv` (see endMoves) at curvature kEnd (see endCurvature): no further back than `cap`,
    nor, given `across` (how wide the letter's ink is across a point along a way, widthAcross), than the stroke runs
    alone; and no nearer its tip than `back`, where it is drawn from further back. */
function measureEnd(end: End, arc: number[], kEnd: number, mv: { len: number; bend: number }, to: Effective, T: TermSpec, across: ((p: P, d: P) => number) | null, cap = Infinity, back = 0, stubs = false): EndPlan {
  const { pts, body } = end, total = arc[arc.length - 1], t0 = body * 2;
  // the font's own end: as far back as its thickness strays from the stroke's (a ball, a flare, a taper)
  // (only the stretch from its tip on in, while it stays so)
  // (as far as a ball reaches, its tip's round, if that is further)
  let zone = body * 1.1;
  for (let k = 0; k < pts.length && arc[k] < Math.min(total * 0.4, Math.max(body * 5, pts[0].r * 2.2)); k++) {
    if (Math.abs(pts[k].r / body - 1) > 0.25) zone = Math.max(zone, arc[k] + body * 0.3);
    else if (arc[k] > zone) break;
  }
  const shaped = zone > body * 1.4;
  // how far back the engine's end reaches: a taper and a flare run back along the stroke (below)
  const tapers = to.terminal === 'tapered', flares = to.terminal === 'flat' && T.form === 'flared';
  // (never more than most of the way to where the stroke meets another: a G's top running round to its bar; nor back
  // past where it stops running alone, growing much wider across than it is thick where another stroke runs into it or
  // through it (its skeleton may run straight on through, as a heavy f's down its stem past a short bar), or has turned
  // through ALONE_TURN (a heavy 2's hook, drawn back three thicknesses for a flare, would reach round its bowl to its
  // spine); nor further than `cap`)
  const from = zone + body * 0.6;
  let alone = Math.min(cap, total * 0.6), turned = 0, was: P | null = null;
  for (let k = indexAt(arc, zone); across && k < pts.length - 2 && arc[k] < alone; k = indexAt(arc, arc[k] + body * 0.25)) {
    const d = dirAlong(pts, Math.max(0, k - 2), Math.min(pts.length - 1, k + 2));
    if (was) turned += Math.atan2(was.x * d.y - was.y * d.x, was.x * d.x + was.y * d.y);
    was = d;
    if (arc[k] < from) continue;
    if (Math.abs(turned) > ALONE_TURN || across(pts[k], d) > 2 * Math.max(pts[k].r, body * 0.5) * ALONE_WIDE) { alone = Math.max(from, arc[k] - body * 0.4); break; }
  }
  // (a stroke that runs alone for less than that, a block letter's short square arm out of its stem (an r's), is a stub:
  // drawn again from just short of where it leaves the other stroke, never from inside that stroke)
  // (only a straight stroke as thick all the way: a curving end, a c's or an s's, widens across as it bends)
  let stub = 0, d0: P | null = null, w0 = 0;
  if (stubs && across && !shaped && !end.exit) for (let k = indexAt(arc, body * 0.5); k < pts.length - 2 && arc[k] < from; k = indexAt(arc, arc[k] + body * 0.2)) {
    const d = dirAlong(pts, Math.max(0, k - 2), Math.min(pts.length - 1, k + 2)), w = across(pts[k], d);
    if (!d0) { d0 = d; w0 = w; }
    if (w > w0 * STUB_WIDE) { if (w0 < 2 * body * STUB_WIDE) stub = Math.max(body * 0.5, arc[k] - body * 0.4); break; }
    if (Math.abs(w - w0) > w0 * 0.04) break;
  }
  // (a taper runs back as many thicknesses as Taper length asks up to its middle, as the engine's do, and from there on
  // its share of all the way the stroke runs alone, so the slider moves it to its end)
  // (no further than TAPER_MOST of the stroke, so a short heavy stroke's two ends, a c's, don't taper all of it)
  const room = Math.max(1, Math.min(alone, total * TAPER_MOST) - body * 0.3), taperAt = (k: number) => Math.min(total * Math.min(0.85, 0.15 * k), t0 * k, room);
  const runBack = tapers ? Math.max(1, T.taper <= 3 ? taperAt(T.taper) : lerp(taperAt(3), room, (T.taper - 3) / 3)) : flares ? Math.max(1, Math.min(total * 0.45, t0 * 3)) : 0;
  // (an exit stroke is drawn again from EXIT_BACK of its run, as far as it runs alone, so Curl turns most of it)
  const prefer = end.exit ? Math.min(alone, (end.run ?? 0) * EXIT_BACK) : 0;
  const sAt = stub && !back ? Math.min(stub, Math.max(body * 0.5, runBack + body * 0.3, -mv.len + body * 1.2))
    : Math.min(Math.max(alone, back), Math.max(zone + body * 0.6, runBack + body * 0.3, -mv.len + body * 1.2, back, prefer));
  // (a shorter end is cut back no further than the stretch drawn again)
  const len = Math.max(mv.len, -(sAt - body * 0.8));
  const kS = indexAt(arc, sAt), kE = indexAt(arc, Math.min(zone, sAt - 2));
  // the cross-sections where the new end starts (S) and where a ball or a flare of the font's begins (E)
  const S = pts[kS], dS0 = dirAlong(pts, Math.max(0, kS - 2), Math.min(pts.length - 1, kS + 2)), outS = { x: -dS0.x, y: -dS0.y };
  const E = pts[kE], dE0 = dirAlong(pts, Math.max(0, kE - 2), Math.min(pts.length - 1, kE + 2));
  return { S, atS: arc[kS], dS0, outS, E, atE: arc[kE], dE0, way: { x: -dE0.x, y: -dE0.y }, shaped, tapers, flares, runBack, len, bend: mv.bend, kEnd };
}

/** How much of a stroke (from its tip) a taper at the end of Taper length's slider runs back over at the most. */
const TAPER_MOST = 0.35;
/** The shares along a stroke end's two sides at which they are paired, to be drawn again. */
const END_SHARES = Array.from({ length: 41 }, (_, i) => i / 40);

/** How far round (its cosine) a stroke's skeleton may turn from the way it heads at S, run on into a ball (runOn). */
const RUN_ON_TURN = Math.cos(50 * Math.PI / 180);
/** A stroke's two sides run on from where they cross the line across it at S (`a` on the left, looking out, and `b`),
    as far apart as there, along its skeleton (`pts`, from the tip in) toward the skeleton's tip, a ball's middle. */
function runOn(pts: SkPt[], S: SkPt, a: P, b: P): [P[], P[]] {
  const k0 = pts.indexOf(S), h = Math.hypot(a.x - b.x, a.y - b.y) / 2, dx = (a.x + b.x) / 2 - S.x, dy = (a.y + b.y) / 2 - S.y;
  const A: P[] = [a], B: P[] = [b];
  // (and only while it heads on out much as it does at S: inside a ball the skeleton curls round into its middle)
  const at = (k: number) => { const p = pts[Math.min(k0, k + 1)], q = pts[Math.max(0, k - 1)], l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (q.x - p.x) / l, y: (q.y - p.y) / l }; };
  const o0 = at(k0 - 1);
  for (let k = k0 - 1; k >= 0; k--) {
    const o = at(k);
    if (o.x * o0.x + o.y * o0.y < RUN_ON_TURN) break;
    A.push({ x: pts[k].x + dx - o.y * h, y: pts[k].y + dy + o.x * h }); B.push({ x: pts[k].x + dx + o.y * h, y: pts[k].y + dy - o.x * h });
  }
  return [A, B];
}

/** A polyline at even steps `h` along it, smoothed, its two ends kept where they are, and drawn again through those
    points as a smooth curve in steps a fifth as long (points beside a polyline's corners would all stand at the corner:
    see carryEnd). */
function smoothLine(line: P[], h: number): P[] {
  const arc = arcOf(line), L = arc[arc.length - 1], n = Math.max(2, Math.round(L / h));
  let pts = atShares(line, Array.from({ length: n + 1 }, (_, i) => i / n));
  for (let pass = 0; pass < 4; pass++) pts = pts.map((p, i) => (i && i < n ? { x: (pts[i - 1].x + 2 * p.x + pts[i + 1].x) / 4, y: (pts[i - 1].y + 2 * p.y + pts[i + 1].y) / 4 } : p));
  const out: P[] = [], K = 5;
  for (let i = 0; i < n; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    for (let k = 0; k < K; k++) {
      const t = k / K, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(pts[n]);
  return out;
}

/** The font's own end, carried on out (or back) along the stroke and bent round as asked (`plan.len`, `plan.bend`):
    its outline from the crossing at S on the left (`a`) round its tip to the one on the right (`b`), `path` between
    them, each point moved with the skeleton (`end.pts`) from S out, run on straight past its tip (an end cut on a slant
    reaches well past it): the stroke up to where the shorter of its two sides (A0, B0) stops drawn longer or shorter,
    the end past that carried along, and all of it turned further round the further out it lies. */
function carryEnd(plan: EndPlan, end: End, path: P[], A0: P[], B0: P[], a: P, b: P): P[] {
  const poly = [a, ...path, b], k0 = end.pts.indexOf(plan.S);
  if (k0 < 2) return poly;
  // the skeleton from S out to its tip, smoothed (a scanned skeleton steps from cell to cell, which would jog the sides
  // moved with it), its length along it and the way it heads there (unwound)
  const sk = smoothLine(end.pts.slice(0, k0 + 1).reverse(), Math.max(2, end.body / 3)), arc = arcOf(sk), L = arc[arc.length - 1];
  const ang: number[] = [];
  for (let i = 0; i + 1 < sk.length; i++) {
    const v = Math.atan2(sk[i + 1].y - sk[i].y, sk[i + 1].x - sk[i].x);
    ang.push(i ? v + Math.round((ang[i - 1] - v) / (2 * Math.PI)) * 2 * Math.PI : v);
  }
  const segAt = (s: number) => { let i = 0; while (i < ang.length - 1 && arc[i + 1] < s) i++; return i; };
  const theta = (s: number) => ang[segAt(Math.max(0, Math.min(L, s)))];
  // where a point stands: how far along the skeleton (past its tip, on the way it heads there) and how far off it to
  // the left
  const where = (q: P) => {
    let best = { s: 0, n: 0, d: Infinity };
    for (let i = 0; i + 1 < sk.length; i++) {
      const p0 = sk[i], dx = sk[i + 1].x - p0.x, dy = sk[i + 1].y - p0.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
      let t = (q.x - p0.x) * ux + (q.y - p0.y) * uy;
      if (i + 2 < sk.length) t = Math.min(t, l);
      if (i) t = Math.max(0, t);
      const fx = p0.x + ux * t, fy = p0.y + uy * t, d = Math.hypot(q.x - fx, q.y - fy);
      if (d < best.d) best = { s: arc[i] + t, n: (q.x - fx) * -uy + (q.y - fy) * ux, d };
    }
    return best;
  };
  const at = poly.map(where), s1 = Math.max(1, Math.min(where(A0[A0.length - 1]).s, where(B0[B0.length - 1]).s));
  const far = Math.max(s1, ...at.map(w => w.s));
  // up to s1 the stroke drawn as long as asked, its end past that carried on as it is, all of it turning `bend` further
  // round by its far end; each point moved as far as its place beside that skeleton moves from where the same reckoning
  // puts it with nothing moved, so the outline stays the font's where nothing moves, out from S
  // (drawn shorter, the stroke is cut back, not squeezed: squeezed, a curve turns tighter, and its inside, tighter than
  // the stroke is wide, folds over into a flag; the end is carried back along it, turned as the stroke turns there)
  // (drawn longer, the stroke stretches from nothing at S to most halfway to s1 and back to nothing there, so its sides
  // bend on smoothly into the stretch and out of it into the end)
  const frames = (len: number, bend: number) => {
    const s2 = Math.max(s1 * 0.15, s1 + len), back = s2 < s1, ramp = (u: number) => u * u * (3 - 2 * u);
    const moved = (s: number) => (s > s1 ? s - s1 + s2 : back ? Math.min(s, s2) : s + (s2 - s1) * ramp(s / s1)), farN = moved(far);
    // (where along the stroke as drawn a place on it drawn longer was, found by halves)
    const drawnAt = (sn: number) => { let lo = 0, hi = s1; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (moved(m) < sn) lo = m; else hi = m; } return (lo + hi) / 2; };
    const M = 96, Q: P[] = [{ x: sk[0].x, y: sk[0].y }], T: number[] = [ang[0]];
    const headAt = (sn: number) => (back ? (sn <= s2 ? theta(sn) : theta(s2) + theta(sn - s2 + s1) - theta(s1)) : theta(sn <= s2 ? drawnAt(sn) : sn - s2 + s1)) + bend * (sn / farN) ** 2;
    for (let j = 1; j <= M; j++) {
      const th = headAt(farN * (j - 0.5) / M), q = Q[j - 1];
      Q.push({ x: q.x + Math.cos(th) * farN / M, y: q.y + Math.sin(th) * farN / M });
      T.push(headAt(farN * j / M));
    }
    // where a point `n` off the skeleton `sn` along it as now drawn stands (before its start, on the way it starts)
    const pos = (sn: number, n: number): P => {
      if (sn < 0) return { x: Q[0].x + Math.cos(T[0]) * sn - Math.sin(T[0]) * n, y: Q[0].y + Math.sin(T[0]) * sn + Math.cos(T[0]) * n };
      const f = Math.min(M, sn / farN * M), j = Math.min(M - 1, Math.floor(f)), u = f - j;
      const th = T[j] + (T[j + 1] - T[j]) * u;
      return { x: Q[j].x + (Q[j + 1].x - Q[j].x) * u - Math.sin(th) * n, y: Q[j].y + (Q[j + 1].y - Q[j].y) * u + Math.cos(th) * n };
    };
    return { at: (s: number, n: number) => pos(moved(Math.max(0, s)), n), pos };
  };
  const was = frames(0, 0), now = frames(plan.len, plan.bend), s2 = Math.max(s1 * 0.15, s1 + plan.len);
  if (s2 >= s1) {
    return poly.map((q, i) => {
      if (!i || i === poly.length - 1) return q;
      const p0 = was.at(at[i].s, at[i].n), p1 = now.at(at[i].s, at[i].n);
      return { x: q.x + p1.x - p0.x, y: q.y + p1.y - p0.y };
    });
  }
  // cut back, the stroke's two sides (the outline's runs out from a and from b, up to where the shorter side stops)
  // are left out between where the stroke now stops and s1, and the rest, the end, is carried back as a whole, as wide
  // each side as the stroke is where it now meets it (the font's strokes thin and thicken); a ball's outline wraps back
  // in beside the stroke, so the sides are read off those runs, not off where the points lie
  const runFrom = (i0: number, step: number) => {
    const r: number[] = [];
    for (let i = i0; i >= 0 && i < poly.length && at[i].s <= s1 + 1e-6; i += step) r.push(i);
    return r;
  };
  const runA = runFrom(0, 1), runB = runFrom(poly.length - 1, -1), onSide = new Set([...runA, ...runB]);
  const width = (run: number[], s: number) => {
    let best = Infinity, n = 0;
    for (const i of run) if (Math.abs(at[i].s - s) < best) { best = Math.abs(at[i].s - s); n = Math.abs(at[i].n); }
    return n;
  };
  const ratio = (run: number[]) => Math.min(1.5, Math.max(2 / 3, width(run, s2) / (width(run, s1) || 1)));
  const rA = ratio(runA), rB = ratio(runB), shift = s1 - s2, out: P[] = [];
  poly.forEach((q, i) => {
    if (!i || i === poly.length - 1) { out.push(q); return; }
    const { s, n } = at[i];
    if (onSide.has(i)) {
      if (s > s2) return;
      const p0 = was.at(s, n), p1 = now.at(s, n);
      out.push({ x: q.x + p1.x - p0.x, y: q.y + p1.y - p0.y });
      return;
    }
    const p0 = was.pos(s, n), p1 = now.pos(s - shift, n * (n > 0 ? rA : rB));
    out.push({ x: q.x + p1.x - p0.x, y: q.y + p1.y - p0.y });
  });
  return out;
}

/** The engine's end of the kind `to` picks (T its spec), drawn across a stroke's sides as the font draws them (A0
    and B0, walked out from S); one polygon from A's start round to B's. */
function engineEnd(plan: EndPlan, end: End, A0: P[], B0: P[], to: Effective, T: TermSpec, mid: P, ball: number): Pt[] {
  const { body } = end, { E, shaped, tapers, flares, runBack, len, bend, kEnd, dS0, dE0 } = plan;
  // (the way a side runs out at its end, over its last thickness or so)
  const tangent = (side: P[]): P => {
    const q = side[side.length - 1];
    let k = side.length - 2;
    while (k > 0 && Math.hypot(side[k].x - q.x, side[k].y - q.y) < body) k--;
    const p = side[Math.max(0, k)], l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: (q.x - p.x) / l, y: (q.y - p.y) / l };
  };
  // the way the stroke runs out at its end, read off its two sides as the font draws them, but past a ball's neck: its
  // skeleton bends off toward the far corner of an end cut on a slant (a grotesque's c's), which would cut the new end
  // askew
  const way = (() => {
    if (shaped) return plan.way;
    const ta = tangent(A0), tb = tangent(B0), x = ta.x + tb.x, y = ta.y + tb.y, l = Math.hypot(x, y);
    return l > 1e-6 && (x * plan.way.x + y * plan.way.y) / l > 0.5 ? { x: x / l, y: y / l } : plan.way;
  })();
  // the end, square across the stroke where its two sides reach on average (out to its tip, past a ball)
  const proj = (q: P) => (q.x - E.x) * way.x + (q.y - E.y) * way.y;
  const reach = shaped ? Math.min(end.reach, body * 1.05) + plan.atE : Math.max(0, (proj(A0[A0.length - 1]) + proj(B0[B0.length - 1])) / 2);
  const toPlane = (side: P[]): P[] => {
    const out: P[] = [side[0]];
    for (let k = 1; k < side.length; k++) {
      if (proj(side[k]) >= reach && proj(side[k - 1]) < reach) { const a = proj(side[k - 1]), b = proj(side[k]), f = (reach - a) / (b - a || 1); out.push({ x: side[k - 1].x + (side[k].x - side[k - 1].x) * f, y: side[k - 1].y + (side[k].y - side[k - 1].y) * f }); return out; }
      out.push(side[k]);
    }
    // (a side stopping short runs on the way it heads, not bent off toward the stroke's way)
    const last = out[out.length - 1], more = reach - proj(last), d = shaped || side.length < 2 ? way : tangent(side), dw = d.x * way.x + d.y * way.y;
    if (more > 0.5) { const go = dw > 0.5 ? more / dw : more, dd = dw > 0.5 ? d : way; out.push({ x: last.x + dd.x * go, y: last.y + dd.y * go }); }
    return out;
  };
  const A = toPlane(A0), B = toPlane(B0);
  // the two sides paired along their length, for narrowing or widening across the stroke (drawn on, or back, and
  // bent first, as asked)
  let [As, Bs] = reshapeEnd(atShares(A, END_SHARES), atShares(B, END_SHARES), len, bend, kEnd);
  const lenA = (arcLen(As) + arcLen(Bs)) / 2;
  const turn = dS0.x * dE0.y - dS0.y * dE0.x;
  if (tapers || flares) {
    const w = tapers ? Math.min(1, T.tip) : T.flare, L = Math.min(runBack, lenA * 0.95);
    // a brush lifts off the inside of the curve and keeps its outer edge running on
    const brush = tapers && T.form === 'brush' ? (Math.abs(turn) < 0.05 ? 1 : turn > 0 ? -1 : 1) : 0;
    const K = As.length - 1;
    for (let i = 0; i <= K; i++) {
      const f = w + (1 - w) * smoothstep((1 - i / K) * lenA / L);
      if (f === 1) continue;
      const m = { x: (As[i].x + Bs[i].x) / 2, y: (As[i].y + Bs[i].y) / 2 }, ha = { x: As[i].x - m.x, y: As[i].y - m.y };
      const ka = brush > 0 ? 1 : brush < 0 ? 2 * f - 1 : f, kb = brush < 0 ? 1 : brush > 0 ? 2 * f - 1 : f;
      As[i] = { x: m.x + ha.x * ka, y: m.y + ha.y * ka }; Bs[i] = { x: m.x - ha.x * kb, y: m.y - ha.y * kb };
    }
  }
  const tEnd = Math.hypot(As[As.length - 1].x - Bs[Bs.length - 1].x, As[As.length - 1].y - Bs[Bs.length - 1].y);
  // a drop sits on a stroke drawn shorter under it
  if (to.terminal === 'round' && (T.form === 'droplet' || T.form === 'ball')) {
    const back = Math.min(termDropBack(T, tEnd), lenA * 0.6), sh = As.map((_, i) => i / (As.length - 1) * (lenA - back) / lenA);
    As = atShares(As, sh); Bs = atShares(Bs, sh);
  }
  const M = As.length - 1, a = As[M], b = Bs[M], p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, tt = Math.hypot(a.x - b.x, a.y - b.y);
  // (the way out of the end, as drawn on and bent)
  const wa = { x: (a.x + b.x - As[M - 1].x - Bs[M - 1].x) / 2, y: (a.y + b.y - As[M - 1].y - Bs[M - 1].y) / 2 }, wl = Math.hypot(wa.x, wa.y) || 1;
  const out2 = { x: wa.x / wl, y: wa.y / wl };
  // (the outer side of a curve: turning left, the right one; of a stroke running straight, the side away from the
  // letter's middle, so a drop hangs into the letter, as up off a 2's foot)
  const outerIsA = Math.abs(turn) > 0.02 ? turn < 0 : (mid.x - p.x) * -out2.y + (mid.y - p.y) * out2.x < 0;
  // (a drop in place of a ball of the font's own as big as that one, not the hairline it ends: see drop in stroke.ts)
  const pen: PenCtx = { thick: Math.max(tt, ball * DROP_OF_BALL), thin: tt, stress: 0, k: CIRCLE_K, org: 0, terminal: to.terminal, term: T };
  const Ap: Pt[] = As.map(q => ({ ...q, smooth: true })), Bp: Pt[] = Bs.map(q => ({ ...q, smooth: true }));
  Ap[0].smooth = Bp[0].smooth = false;
  const capPts = termCap(Ap, Bp, p, out2, tt, pen, outerIsA);
  return toPolygon(roundContour([...Ap, ...capPts, ...Bp.slice().reverse()], 0));
}

/** How far (its cosine) a side of a stroke may turn from the way the stroke runs past where the font's own end begins
    and still be the stroke's side, not its end rounding off. */
const SIDE_ON = Math.cos(25 * Math.PI / 180);
/** How wide (its radius, against the width of the neck it hangs from) a font's own end is, at the least, for a ball or a
    drop. */
const BALL_NECK = 0.75;
/** The longest stretch of a polyline that runs straight (within a unit and a half of the line across it): a cut's, on a
    font's own end, as long as the ball's radius at the least, where a ball's round has none. */
function straightRun(line: P[]): number {
  let best = 0;
  for (let i = 0; i < line.length - 1; i++) {
    for (let j = i + 2; j <= line.length; j++) {
      const a = line[i], b = line[j - 1], l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l < 1e-6) continue;
      let ok = true;
      for (let k = i + 1; k < j - 1 && ok; k++) ok = Math.abs((line[k].x - a.x) * (b.y - a.y) - (line[k].y - a.y) * (b.x - a.x)) / l < 1.5;
      if (!ok) break;
      best = Math.max(best, l);
    }
  }
  return best;
}
/** How thick a stroke a drop as big as a ball of `r` (its radius) ends, at Size's middle (dropR in stroke.ts: 0.55 of
    the stroke at a size of 0.815). */
const DROP_OF_BALL = 1 / (0.55 * 0.815);
/** How far past its stroke an end may reach (a drop's bulge, a point, a flare's two sides together, a slant), as a
    share of the x-height: a heavy stroke's end reaches out about as far as a light one's does, not as far again for
    its thickness, so a drop on a bold c stays a drop, not a blob. */
const REACH_X = 0.12;
/** The kinds of end that reach out past their stroke, and the part of TermSpec that sets how far (see reachingOf). */
const REACHING = (to: Effective, T: TermSpec) => reachingOf(to.terminal, T);

/** The end T on a stroke t thick, its reach (see REACHING) taken as the share of its slider's range it is at (`top` the
    end at the top of its slider), of the most this letter gives it: no further than REACH_X of the x-height `xh`, and
    `f` of that (0 not at all: a drop as wide as the stroke, no point, flare or slant). So the slider moves the end all
    the way along, however little room the letter has. */
function reachT(T: TermSpec, top: TermSpec, k: 'size' | 'flare' | 'point' | 'slope', t: number, xh: number, f: number): TermSpec {
  const r = REACH_X * xh / t, lo = k === 'size' ? DROP_MIN : k === 'flare' ? 1 : 0;
  const most = Math.max(lo, Math.min(top[k], k === 'size' ? (1 + r) / 2 : k === 'flare' ? 1 + r : r));
  if (f >= 1 && most >= top[k]) return T;
  const share = top[k] > lo ? Math.min(1, Math.max(0, (T[k] - lo) / (top[k] - lo))) : 0;
  return { ...T, [k]: lerp(lo, most, share * f) };
}

/** The engine's end (engineEnd) as big as the letter has room for: an end that reaches out past its stroke (see
    REACHING) reaches its share of as far as the end at the top of its slider (`top`) can without coming nearer the
    rest of the letter (`near`, see roomAround) than the font's own end (`own`) allows, drawn back along its stroke
    (END_CUTS) where even the least of it would come too near; null where it still would. */
function fittedEnd(plan: EndPlan, end: End, A0: P[], B0: P[], to: Effective, T: TermSpec, top: TermSpec, xh: number, ball: number, mid: P, own: P[], near: (q: P, max: number) => number): Pt[] | null {
  const fits = roomFor(own, near, end.body), k = REACHING(to, T), t = end.body * 2;
  // (drawn `cut` shorter than asked: where even the least of it has no room, the end is drawn back along its stroke till
  // it has, as a heavy c's drop sits further back round its curve than a light one's; and curled round less, where it
  // curls in toward the rest of the letter)
  for (const [cut, curl] of END_CUTS.flatMap(cut => [1, 0.5, 0].map(f => [cut, f])).filter(([, f]) => plan.bend || f === 1)) {
    const at = { ...plan, len: plan.len - cut * t, bend: plan.bend * curl };
    if (!k) { const d = engineEnd(at, end, A0, B0, to, T, mid, ball); if (fits(d)) return d; continue; }
    // how much of its most the end at the top of its slider has room for
    const atTop = (f: number) => engineEnd(at, end, A0, B0, to, reachT({ ...T, [k]: top[k] }, top, k, t, xh, f), mid, ball);
    let room = 1;
    if (!fits(atTop(1))) {
      if (!fits(atTop(0))) continue;
      let lo = 0, hi = 1;
      for (let i = 0; i < 5; i++) { const f = (lo + hi) / 2; if (fits(atTop(f))) lo = f; else hi = f; }
      room = lo;
    }
    const d = engineEnd(at, end, A0, B0, to, reachT(T, top, k, t, xh, room), mid, ball);
    if (fits(d)) return d;
  }
  return null;
}
/** Whether an end drawn again (a polyline) comes no nearer the rest of the letter (`near`, see roomAround) than
    ROOM_KEEP of as near as the font's own end (`own`) comes, though never kept further off than ROOM_MAX of the
    stroke's width (two of `body`). */
function roomFor(own: P[], near: (q: P, max: number) => number, body: number): (line: P[]) => boolean {
  const step = Math.max(1.5, body * 0.1);
  /** the nearest the rest of the letter comes to a polyline, read no further than `max` */
  const gap = (line: P[], max: number) => {
    let best = max;
    for (let i = 0; i < line.length - 1 && best > 0; i++) {
      const a = line[i], b = line[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let k = 0; k < n && best > 0; k++) best = near({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }, best);
    }
    return best;
  };
  const need = Math.min(gap(own, body * 4) * ROOM_KEEP, body * 2 * ROOM_MAX);
  return (line: P[]) => need < 1 || gap(line, need) >= need;
}

/** The font's own end carried on as asked (carryEnd), drawn on and curled round no nearer the rest of the letter than it
    has room for (roomFor): by Length's and Curl's share of as far as the end at the ends of their sliders, moved `most`,
    has room to go, so each slider moves it all the way along without closing a c into an o or an s into an 8. (A move
    that draws an end back or curls it away from the letter has room enough.) */
function carriedEnd(plan: EndPlan, end: End, path: P[], A0: P[], B0: P[], a: P, b: P, near: (q: P, max: number) => number, most: { len: number; bend: number }): P[] {
  const fits = roomFor(path, near, end.body), at = (len: number, bend: number) => carryEnd({ ...plan, len, bend }, end, path, A0, B0, a, b);
  // (as far as the stretch drawn again lets it be drawn back, as measureEnd does)
  const lenMost = Math.max(most.len, -(plan.atS - end.body * 0.8));
  let f = 1;
  if (!fits(at(lenMost, most.bend))) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; if (fits(at(lenMost * m, most.bend * m))) lo = m; else hi = m; }
    f = lo;
  }
  return at(plan.len * f, plan.bend * f);
}

/** How much shorter (in the stroke's thickness) an end is drawn, in turn, till it has room (see fittedEnd). */
const END_CUTS = [0, 0.25, 0.5, 0.75, 1, 1.5];

/** How near the rest of a letter's ink comes to a point, read no further than `max`: every ring but the one a stroke's
    end is drawn again on (`ri`), and the `rest` of that one, from one of the end's crossings round to the other, but
    for `skip` along it from either, where it is still the stroke's own two sides. */
function roomAround(rings: P[][], ri: number, rest: P[], skip: number): (q: P, max: number) => number {
  // (the ink's edges laid out a few units apart in square cells, so a point looks only in the cells round it)
  const CELL = 16, cells = new Map<number, P[]>(), key = (i: number, j: number) => (i + 4096) * 8192 + j + 4096;
  const put = (q: P) => {
    const k = key(Math.floor(q.x / CELL), Math.floor(q.y / CELL));
    let c = cells.get(k);
    if (!c) cells.set(k, c = []);
    c.push(q);
  };
  const lay = (pts: P[], closed: boolean) => {
    for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
      for (let k = 0; k < n; k++) put({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
    }
    if (!closed && pts.length) put(pts[pts.length - 1]);
  };
  rings.forEach((r, j) => { if (j !== ri) lay(r, true); });
  const arc = arcOf(rest), L = arc[arc.length - 1] ?? 0;
  let k0 = 0, k1 = rest.length - 1;
  while (k0 < rest.length && arc[k0] < skip) k0++;
  while (k1 >= 0 && arc[k1] > L - skip) k1--;
  if (k1 > k0) lay(rest.slice(k0, k1 + 1), false);
  return (q, max) => {
    let best = max;
    const r = Math.ceil(max / CELL), ci = Math.floor(q.x / CELL), cj = Math.floor(q.y / CELL);
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const c = cells.get(key(i, j));
      if (c) for (const p of c) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
    }
    return best;
  };
}

/** The letters whose styled ends are the tips of hooks and tails, which Tails & hooks draws on and back (Q j y g t f),
    and those with open bowls (a c e, C G, s S and the figures 2 3 5 6), whose ends Openness moves round: skinFollows
    (skin.ts) shows those two settings reaching only these. */
export const HOOK_LETTERS = 'Qjygtf', OPEN_LETTERS = 'aceCGsS2356';

/** How a stroke's end moves under the settings past where the font was picked at: drawn on or back (Length; Tails
    & hooks for a hook's or a tail's, the Q y j g t f's; Openness, as round as it curves, for an open bowl's, c e s a
    and C G S and their figures), and bent on round the way it turns or out of it (Curl). Null when nothing moves. */
function endMoves(c: RestyleCtx, from: Effective, to: Effective) {
  const hook = HOOK_LETTERS.includes(c.ch), open = OPEN_LETTERS.includes(c.ch);
  const reach = (v: number) => endReach(onEndScale(v));
  const dLen = (reach(to.terminalLength) - reach(from.terminalLength)) * c.xh, dTail = (to.tail - from.tail) * c.xh * 0.6;
  const dAp = to.aperture - from.aperture, dCurl = to.terminalCurl - from.terminalCurl;
  if (Math.abs(dLen) < 0.5 && Math.abs(dTail) < 0.5 && Math.abs(dAp) < 1e-4 && Math.abs(dCurl) < 1e-4) return null;
  return (end: End, k: number) => {
    // (a script's exit stroke is no hook's tail, nor a bowl's end that opens: Length and Curl move it, Curl turning it
    // to the left, rising as it does out of the right of the letter: back over the letter, as it swings up out of it,
    // or, turned down, out flat to the right)
    if (end.exit) return { len: (to.terminalLength - from.terminalLength) * (end.run ?? 0) * EXIT_LEN, bend: dCurl * 2 * (Math.PI / 3) };
    // (opened, a bowl's end goes back round it by as much of a quarter turn as the engine's do, see capAperture and
    // lcAperture in glyphs/shared.ts)
    const R = Math.min(Math.abs(k) > 1e-6 ? 1 / Math.abs(k) : Infinity, end.body * 8);
    const ap = open && !hook && R < Infinity ? -dAp * 0.36 * (Math.PI / 2) * R : 0;
    return { len: (hook ? dTail : dLen) + ap, bend: hook ? 0 : dCurl * 2 * (Math.PI / 3) * Math.sign(k || 1) };
  };
}

/** How sharply a stroke turns toward its end (1/radius, + to the left going out to the tip), read over its last few
    thicknesses. */
function endCurvature(pts: SkPt[], arc: number[], body: number) {
  const at = (a: number) => indexAt(arc, a);
  const k1 = at(body * 4), d0 = dirAlong(pts, 0, at(body)), d1 = dirAlong(pts, at(body * 3), k1);
  // (pts run from the tip in: turned round, the way out)
  const a0 = Math.atan2(-d0.y, -d0.x), a1 = Math.atan2(-d1.y, -d1.x);
  let da = a0 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  return da / Math.max(1, arc[k1] - body * 0.5);
}

/** The end of a stroke between paired sides As and Bs (from where it starts being drawn again out to its end) drawn
    `len` longer (shorter, negative), on round at curvature k past its end, and bent `bend` further round over its
    length. */
function reshapeEnd(As: P[], Bs: P[], len: number, bend: number, k: number): [P[], P[]] {
  const N = As.length - 1, c = As.map((a, i) => ({ x: (a.x + Bs[i].x) / 2, y: (a.y + Bs[i].y) / 2 })), h = As.map((a, i) => ({ x: a.x - c[i].x, y: a.y - c[i].y }));
  const s = [0];
  for (let i = 1; i <= N; i++) s.push(s[i - 1] + Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y));
  const L = s[N] || 1, L2 = Math.max(L * 0.15, L + len), M = Math.max(8, Math.round(N * L2 / L));
  const angle = (i: number) => Math.atan2(c[Math.min(N, i + 1)].y - c[Math.max(0, i - 1)].y, c[Math.min(N, i + 1)].x - c[Math.max(0, i - 1)].x);
  const aEnd = angle(N);
  const rot = (v: P, a: number) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  /** at arc t: the way the middle runs, and the half-width across */
  const at = (t: number): { a: number; hw: P } => {
    if (t <= L) {
      let i = 0; while (i < N - 1 && s[i + 1] < t) i++;
      const f = (t - s[i]) / ((s[i + 1] - s[i]) || 1);
      return { a: Math.atan2(c[i + 1].y - c[i].y, c[i + 1].x - c[i].x), hw: { x: h[i].x + (h[i + 1].x - h[i].x) * f, y: h[i].y + (h[i + 1].y - h[i].y) * f } };
    }
    return { a: aEnd + k * (t - L), hw: rot(h[N], k * (t - L)) };
  };
  const As2: P[] = [], Bs2: P[] = [];
  let pos = { ...c[0] };
  for (let j = 0; j <= M; j++) {
    const t = L2 * j / M, add = bend * (t / L2) ** 2;
    if (j > 0) {
      const tm = L2 * (j - 0.5) / M, { a } = at(tm), am = a + bend * (tm / L2) ** 2, st = L2 / M;
      pos = { x: pos.x + Math.cos(am) * st, y: pos.y + Math.sin(am) * st };
    }
    const { hw } = at(t), w = rot(hw, add);
    As2.push({ x: pos.x + w.x, y: pos.y + w.y }); Bs2.push({ x: pos.x - w.x, y: pos.y - w.y });
  }
  return [As2, Bs2];
}


const arcLen = (l: P[]) => { let a = 0; for (let k = 1; k < l.length; k++) a += Math.hypot(l[k].x - l[k - 1].x, l[k].y - l[k - 1].y); return a; };
/** Path commands as one polygon (curves sampled). */
function toPolygon(cmds: Cmd[]): Pt[] {
  const out: Pt[] = [];
  let at: P = { x: 0, y: 0 };
  for (const c of cmds) {
    if (c[0] === 'M' || c[0] === 'L') { at = { x: c[1], y: c[2] }; out.push(at); }
    else if (c[0] === 'C') {
      for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; out.push({ x: u * u * u * at.x + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5], y: u * u * u * at.y + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6] }); }
      at = { x: c[5], y: c[6] };
    }
  }
  return out;
}

/* ---- serifs */

/** Everything about a serif but its length (which a font's own serifs follow on their skeletons, see skin.ts), and the
    length its heights are drawn for, which Width moves. */
export const serifLook = (sf: SerifSpec | null | undefined) => (sf ? JSON.stringify({ ...sf, len: 0, ref: 0 }) : '');

/** The contours with the engine's serifs (stroke.ts) set on the ends of their stems, legs and arms: a stroke cut
    level across where it stands on a line or reaches up to one (the baseline, the x-height, the capitals', the
    ascenders', the descenders'), and an arm cut plumb at its end, as the engine's letters have them. `sf` is the
    serif in the font's units; a lowercase stem's top takes a flag to the left, an arm's serif reaches into the
    letter (down from a top arm, up from a foot), the rest reach both ways, less the sides the design leaves off. */
export function restyleSerifs(cs: Node[][], c: RestyleCtx & { lower: boolean; lines: number[] }, sf: SerifSpec, sk: SkeletonOf): Node[][] {
  const g = inkGrid(cs, 2), s = sk(), tol = c.cap * ON_LINE;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const cn of cs) for (const n of cn) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const serifs: Pt[][] = [], cuts: Pt[][] = [];
  s.nodes.forEach((n, ni) => {
    if (n.edges.length !== 1 || s.edges[n.edges[0]].a === s.edges[n.edges[0]].b) return;
    const br = branches(s, ni)[0], lv = leaving(s, br, n.r * 2), d = { x: -lv.x, y: -lv.y };
    if (s.edges[br.e].len < n.r * 1.5) return;
    let f = endFace(g, n.x, n.y, n.r, d);
    // (an upright stroke drawn round at its end, a soft sans's stem, standing on a line or reaching up to one: squared
    // off up to where its round begins, and given the serif as a square end is)
    // (a letter's or a figure's: punctuation's round ends stay round)
    if (f.face === 'other' && /[A-Za-z0-9]/.test(c.ch)) {
      const tip = roundTip(g, n.x, n.y, n.r, d), L = tip ? c.lines.find(L => Math.abs(tip.y - L) < tol) : undefined;
      // (a plain round end: nothing of the letter runs on just past the line beside it, as a blackletter's hairline tail
      // runs on under its foot)
      const past = tip && L !== undefined && [-0.9, 0, 0.9].some(u => [0.6, 1.2, 2].some(k => inkAt(g, tip.x + u * n.r, L + Math.sign(d.y) * n.r * k)));
      if (tip && L !== undefined && !past) {
        f = { face: 'level', at: L, mid: tip.x, width: n.r * 2 };
        serifs.push([{ x: tip.x - n.r, y: L }, { x: tip.x + n.r, y: L }, { x: n.x + n.r, y: n.y }, { x: n.x - n.r, y: n.y }]);
        // (and its round's overshoot past the line taken off, under the serif)
        const out = Math.sign(d.y) * n.r * 2;
        cuts.push([{ x: tip.x - n.r - 2, y: L }, { x: tip.x + n.r + 2, y: L }, { x: tip.x + n.r + 2, y: L + out }, { x: tip.x - n.r - 2, y: L + out }]);
      }
    }
    let end: { x: number; y: number; dx: number; dy: number; t: number; type: 'flat' } | null = null, given: SerifSides = 'both', inward: SerifSides = null;
    if (f.face === 'level' && c.lines.some(L => Math.abs(f.at - L) < tol)) {
      end = { x: f.mid, y: f.at, dx: d.x, dy: d.y, t: n.r * 2, type: 'flat' };
      // (a lowercase stem's top, upright: a flag to the left)
      if (d.y > 0 && c.lower && Math.abs(d.x) < 0.3) given = 'a';
      inward = f.mid < cx - 2 ? 'b' : f.mid > cx + 2 ? 'a' : null;
    } else if (f.face === 'plumb' && !crossing(s, br)) {
      end = { x: f.at, y: f.mid, dx: d.x, dy: d.y, t: n.r * 2, type: 'flat' };
      given = f.mid + n.r >= y1 - tol ? 'a' : f.mid - n.r <= y0 + tol ? 'b' : 'both';
      inward = f.mid < cy ? 'b' : 'a';
    }
    if (!end) return;
    const sides = serifSides(given, sf.sides, inward);
    if (!sides) return;
    // (a slanting leg's serif stays flat underneath, or an italic stem's: its stroke can't stop short square across it)
    const cup = Math.abs(f.face === 'level' ? end.dx : end.dy) < 0.12 ? serifCup(sf) : 0, out = { x: Math.sign(end.dx) * (f.face === 'plumb' ? 1 : 0), y: f.face === 'level' ? Math.sign(end.dy) : 0 };
    // a cupped serif arches up under its stroke, which stops short of the line by as much
    if (cup > 0) {
      const w = f.width / 2 + 1, a = { x: end.x - out.x * cup, y: end.y - out.y * cup }, u = { x: Math.abs(out.y), y: Math.abs(out.x) };
      cuts.push([{ x: a.x - u.x * w, y: a.y - u.y * w }, { x: a.x + u.x * w, y: a.y + u.y * w }, { x: end.x + u.x * w + out.x * 2, y: end.y + u.y * w + out.y * 2 }, { x: end.x - u.x * w + out.x * 2, y: end.y - u.y * w + out.y * 2 }]);
      end.x = a.x; end.y = a.y;
    }
    // (no longer than most of half the room beside it, so the serifs reaching into a counter from either side, an n's
    // or an m's, don't meet: a font's counters are narrower against its serifs than the engine's)
    const across = { x: Math.abs(out.y), y: Math.abs(out.x) }, h = { x: end.x - out.x * Math.min(sf.th * 0.5, n.r), y: end.y - out.y * Math.min(sf.th * 0.5, n.r) };
    let room = Infinity;
    for (const sg of [-1, 1]) {
      // (read from past the stroke's own edge: its face can measure a unit or two narrower than the stroke is)
      let from = f.width / 2 + 2;
      while (from < f.width / 2 + n.r * 0.5 && inkAt(g, h.x + across.x * sg * from, h.y + across.y * sg * from)) from += 1;
      for (let q = from; q < from + sf.len * 3; q += 2) if (inkAt(g, h.x + across.x * sg * q, h.y + across.y * sg * q)) { room = Math.min(room, q - from); break; }
    }
    const pen: PenCtx = { thick: n.r * 2, thin: n.r * 2, stress: 0, k: CIRCLE_K, org: 0, terminal: 'flat', serif: room < Infinity ? { ...sf, len: Math.min(sf.len, room * 0.42) } : sf };
    const poly = buildSerif(end, sides, pen, 1, cup, inward);
    if (poly && poly.length > 2) serifs.push(toPolygon(roundContour(poly, 0)));
  });
  if (!serifs.length) return cs;
  const ink = shape(cs.map(cn => sampled(cn))), cut = shape(cuts), add = shape(serifs);
  return refit(combine([ink, cut, add], (x, y) => (ink.has(x, y) && !cut.has(x, y)) || add.has(x, y)));
}

/** Whether the stroke a branch belongs to crosses another where it starts (a t's or an f's bar, running through the
    stem: an arm ending in a stem, an E's, or turning out of one, an L's, doesn't): four strokes or more meet there,
    counting those of joins just beside it. */
function crossing(sk: Skeleton, br: Branch) {
  const E = sk.edges[br.e], at = br.end === 'a' ? E.b : E.a, n = sk.nodes[at];
  const near = sk.nodes.map((m, i) => i).filter(i => i === at || (sk.nodes[i].edges.length >= 3 && Math.hypot(sk.nodes[i].x - n.x, sk.nodes[i].y - n.y) < n.r * 1.6));
  const es = new Set<number>();
  for (const i of near) for (const e of sk.nodes[i].edges) { const F = sk.edges[e]; if (!(near.includes(F.a) && near.includes(F.b))) es.add(e); }
  return es.size >= 4;
}

/* ---- stencil */

/** Where a stencil opens the letter and how: its gap as asked for past what the font has, where it is moved out to,
    how round the corners it cuts are, and the crossbars' own gap and ends. */
export interface StencilLook { gap: number; pos: number; round: number; bar: number; through: boolean }
export const stencilLook = (e: Effective): StencilLook => ({ gap: e.stencil, pos: e.stencilPos, round: e.stencilRound, bar: e.barGap, through: e.barEnds === 'through' });

/** The contours opened as Stencil, Gap and its ends open the engine's (see stencilCut in stencil.ts): where a stroke
    runs into another (read off the skeleton, see joinsOf), it is cut back from it, along the other's edge, the gap
    wide (moved out along it by the gap's place); a bar joined at both ends is cut at its left or upper end only, so
    every gap moves the same way; a ring with no join (an o) is cut down its middle. A crossbar's Gap cuts it back
    at both ends, or, run through, cuts the strokes it meets above and below it. In a heavy letter, as the engine's
    stencilPieces does, a gap opens only where every piece stays solid ink and it lands on no other join, narrowed
    first if need be; a stroke running on along its host before it leaves it (an R's leg, a K's) and a bar on a slanted
    host (an A's) are cut square across where they run alone; a ring with a short tail (a Q) is cut as an O is. */
export function restyleStencil(cs: Node[][], c: RestyleCtx, from: StencilLook, to: StencilLook, sk: SkeletonOf): Node[][] {
  const v = added(from.gap, to.gap), bv = added(from.bar, to.bar);
  if (!(v > 0) && !(bv > 0)) return cs;
  // (a gap as wide as the engine's, joinGap in shared/params/scales.ts with its 24 units as many of a cap height of 700,
  // moved out as far, stencilOff in font.ts)
  const s = sk(), stem = c.stem, gapOf = (k: number) => k * (24 * c.cap / 700 + 2 * stem), off = stencilOff(to.pos, stem, c.xh);
  const bands: Pt[][] = [];
  // (a stroke's gaps, by the join each opens, to be kept only where they leave solid ink: see below)
  const opened: { bands: Pt[][]; ji: number }[] = [];
  const joins = joinsOf(s);
  // each join's host: its way along, its half thickness, and the way out of it toward the stroke that ends in it
  const hosts = joins.map(j => {
    const n = s.nodes[j.node], a = leaving(s, j.host[0], n.r * 2.5), b = leaving(s, j.host[1], n.r * 2.5);
    let tx = b.x - a.x, ty = b.y - a.y; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const rs: number[] = [];
    for (const br of j.host) { const pts = br.end === 'a' ? s.edges[br.e].pts : s.edges[br.e].pts.slice().reverse(); let a2 = 0;
      for (let k = 1; k < pts.length; k++) { a2 += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); if (a2 > n.r * 1.5 && a2 < n.r * 3.5) rs.push(pts[k].r); } }
    rs.sort((p, q) => p - q);
    return { n, tx, ty, half: rs.length ? rs[rs.length >> 1] : n.r * 0.8 };
  });
  /** How far along a bar (branch br, `r` half as thick) from join ji it runs on alone: its ink across no more than 1.2
      times as thick as it is, read every two units out from the join; -1 where it never does. */
  const barFree = (ji: number, br: Branch, r: number) => {
    const { n } = hosts[ji], d = leaving(s, br, n.r * 3), px = -d.y, py = d.x, E = s.edges[br.e];
    for (let t = 0; t < E.len; t += 2) {
      const qx = n.x + d.x * t, qy = n.y + d.y * t;
      if (!ink.has(qx, qy)) continue;
      let w = 0;
      for (const o of [1, -1]) { let u = 0; while (u < r * 4 && ink.has(qx + px * o * (u + 1), qy + py * o * (u + 1))) u += 1; w += u; }
      if (w <= 2 * r * 1.2) return t;
    }
    return -1;
  };
  /** A gap cut square across branch br of join ji, from where it runs on alone, as wide as Stencil asks of a stroke as
      thick (its own thickness at Stencil's top: a short heavy stroke, an A's bar or a K's leg, cut as wide as a stem's
      gap would be taken away), or as leaves a solid piece before the stroke at its other end (or its own free end), if
      that is a gap at all. */
  const aloneCut = (ji: number, br: Branch, ends: number[]) => {
    const E = s.edges[br.e], r = E.pts[E.pts.length >> 1].r, t1 = barFree(ji, br, r), others = ends.filter(k => k !== ji);
    if (t1 < 0) return;
    const far = s.nodes[br.end === 'a' ? E.b : E.a], t2 = others.length ? barFree(others[0], E.a === joins[others[0]].node ? { e: br.e, end: 'a' } : { e: br.e, end: 'b' }, r) : far.edges.length === 1 ? -far.r : 0;
    const room = E.len - t1 - Math.max(0, t2) + (t2 < 0 ? -t2 : 0), piece = Math.min(r * 1.2, room / 3), g = Math.min(gapOf(v), 2 * r * v, room - piece);
    if (g >= Math.min(gapOf(v), Math.max(8, r * 0.3))) opened.push({ bands: [square(ji, br, t1, t1 + g)], ji });
  };
  /** Whether edge e is a ring with nothing run out of it but a short tail ending free (a Q's, not a 9's long stroke). */
  const tailed = (e: number) => {
    const E = s.edges[e];
    return E.a === E.b && s.nodes[E.a].edges.length > 2 && s.nodes[E.a].edges.every(k => {
      const K = s.edges[k], far = K.a === E.a ? K.b : K.a;
      return k === e || (s.nodes[far].edges.length === 1 && K.len < E.len * TAIL_SHORT);
    });
  };
  /** A band across branch `br` from join j: from `d1` to `d2` out from the host's middle, along its edge. */
  const across = (ji: number, br: Branch, d1: number, d2: number) => {
    const { n, tx, ty } = hosts[ji], d = leaving(s, br, n.r * 3);
    let nx = -ty, ny = tx;
    if (nx * d.x + ny * d.y < 0) { nx = -nx; ny = -ny; }
    const dn = nx * d.x + ny * d.y;
    if (dn < 0.25) return null;
    const E = s.edges[br.e], rs = E.pts.map(p => p.r).sort((p, q) => p - q), rj = rs[rs.length >> 1];
    const w = rj / dn * 1.3 + 4, at = (dd: number) => ({ x: n.x + d.x * dd / dn, y: n.y + d.y * dd / dn });
    const p1 = at(d1), p2 = at(d2);
    return [{ x: p1.x + tx * w, y: p1.y + ty * w }, { x: p2.x + tx * w, y: p2.y + ty * w }, { x: p2.x - tx * w, y: p2.y - ty * w }, { x: p1.x - tx * w, y: p1.y - ty * w }];
  };
  // a crossing isn't a join: two strokes ending at it head straight on from each other (a t's bar through its stem,
  // the waist of an 8)
  // (or a crossing read as two joins a short way apart, the stroke between them hardly longer than they are wide)
  const crosses = (j: Join) => (j.joiners.length >= 2 && j.joiners.some((p, k) => j.joiners.some((q, l) => l > k && (() => {
    const a = leaving(s, p, s.nodes[j.node].r * 2.5), b = leaving(s, q, s.nodes[j.node].r * 2.5); return a.x * b.x + a.y * b.y < -0.8; })())))
    || j.joiners.some(br => { const E = s.edges[br.e]; return s.nodes[E.a].edges.length >= 3 && s.nodes[E.b].edges.length >= 3 && E.len < (s.nodes[E.a].r + s.nodes[E.b].r) * 1.3; });
  // a bar: a straight, level stroke ending in another (an H's, an A's, an e's, the middle arm of an E or F)
  const joinedAt = new Map<number, number[]>();
  joins.forEach((j, ji) => { if (!crosses(j)) j.joiners.forEach(br => { const l = joinedAt.get(br.e) ?? []; l.push(ji); joinedAt.set(br.e, l); }); });
  const isBar = (e: number) => {
    const E = s.edges[e], a = E.pts[0], b = E.pts[E.pts.length - 1];
    if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x) * 0.35) return false;
    return E.pts.every(p => Math.abs((p.y - a.y) - (b.y - a.y) * ((p.x - a.x) / ((b.x - a.x) || 1))) < Math.max(4, p.r * 0.6));
  };
  /** How far along branch br from join ji both edges of the stroke clear the other stroke's edge (see stencilCut in stencil.ts). */
  const clear = (ji: number, br: Branch) => {
    const { n, tx, ty, half } = hosts[ji], d = leaving(s, br, n.r * 3);
    let nx = -ty, ny = tx;
    if (nx * d.x + ny * d.y < 0) { nx = -nx; ny = -ny; }
    const dn = nx * d.x + ny * d.y, E = s.edges[br.e], r = E.pts[E.pts.length >> 1].r, px = -d.y, py = d.x;
    return { d, r, dn, at: dn < 0.2 ? half : Math.max(...[1, -1].map(o => (half - o * r * (px * nx + py * ny)) / dn)) };
  };
  // the letter's ink as the font draws it, read for where a stroke ends and cut by the bands
  const ink = shape(cs.map(cn => sampled(cn)));
  /** How far along branch br from join ji the stroke it meets ends, read off the ink just past the bar's edges either
      side (the skeleton's join can sit off the middle of a heavy stem, nearer the bar). */
  const edgeAt = (ji: number, br: Branch) => {
    const { n } = hosts[ji], { d, r, at } = clear(ji, br), px = -d.y, py = d.x;
    let far = 0;
    for (const o of [1, -1]) {
      const qx = n.x + px * o * (r + 3), qy = n.y + py * o * (r + 3);
      let t = 0;
      while (t < at * 3 && ink.has(qx + d.x * t, qy + d.y * t)) t += 1;
      far = Math.max(far, t);
    }
    return far > 0 && far < at * 3 ? far : at;
  };
  const square = (ji: number, br: Branch, d1: number, d2: number) => {
    const { n } = hosts[ji], { d, r } = clear(ji, br), w = r * 1.4 + 4, px = -d.y, py = d.x;
    const p1 = { x: n.x + d.x * d1, y: n.y + d.y * d1 }, p2 = { x: n.x + d.x * d2, y: n.y + d.y * d2 };
    return [{ x: p1.x + px * w, y: p1.y + py * w }, { x: p2.x + px * w, y: p2.y + py * w }, { x: p2.x - px * w, y: p2.y - py * w }, { x: p1.x - px * w, y: p1.y - py * w }];
  };
  joins.forEach((j, ji) => {
    if (crosses(j)) return;
    j.joiners.forEach(br => {
      const h = hosts[ji], bar = isBar(br.e), ends = joinedAt.get(br.e) ?? [];
      if (bar && bv > 0) {
        const c0 = clear(ji, br), E = s.edges[br.e];
        if (to.through) {
          // the strokes it meets cut across above and below it, the gap from its edges (as far as the engine's, barCut
          // in shared/params/scales.ts with its 12 units scaled alike)
          const cut = bv * (12 * c.cap / 700 + stem), w = h.n.r * 2 + 6;
          for (const [y0, y1] of [[h.n.y + c0.r, h.n.y + c0.r + cut], [h.n.y - c0.r - cut, h.n.y - c0.r]])
            bands.push([{ x: h.n.x - w, y: y0 }, { x: h.n.x + w, y: y0 }, { x: h.n.x + w, y: y1 }, { x: h.n.x - w, y: y1 }]);
          return;
        }
        // cut square across, where its edges clear the stroke it meets; narrowed to leave a solid piece between, as
        // long as the bar is thick or a third of the room in a narrow letter (Oswald's H), as the engine's
        // (an arm's room runs on out to its free end)
        const far = s.nodes[br.end === 'a' ? E.b : E.a], tip = ends.length === 1 && far.edges.length === 1 ? far.r : 0;
        const room = E.len + tip - ends.reduce((a2, k) => a2 + edgeAt(k, s.edges[br.e].a === joins[k].node ? { e: br.e, end: 'a' } : { e: br.e, end: 'b' }), 0);
        const piece = Math.min(c0.r * 1.2, room / (ends.length > 1 ? 3 : 2)), at = edgeAt(ji, br);
        const g = Math.min(gapOf(bv), Math.max(0, (room - piece) / Math.max(1, ends.length)));
        if (g > 1) bands.push(square(ji, br, at, at + g));
        return;
      }
      if (!(v > 0)) return;
      // (a ring isn't opened where a short tail runs out of it, a Q's: that would leave a C; it is cut down its middle
      // below, as an O is)
      if (tailed(br.e)) return;
      // (a bar joined at both ends opens at the end further left, or up)
      if (bar && ends.some(k => k !== ji && (hosts[k].n.x < h.n.x - 1 || (Math.abs(hosts[k].n.x - h.n.x) <= 1 && hosts[k].n.y > h.n.y)))) return;
      // a bar run into a slanted stroke, an A's: cut square across, from where it runs on alone past that stroke (its
      // ink across no wider than it is thick), as wide as leaves a solid piece before the stroke at its other end
      if (bar && Math.abs(h.ty) < 0.95) { aloneCut(ji, br, ends); return; }
      // (from where the stroke's edges leave the host's ink, read off it: a heavy join's skeleton sits off its middle,
      // nearer the stroke that ends in it, and a gap from its half thickness would bite into the host; moved out along
      // the stroke only where it leaves the host steeply, as the engine's: one leaving at a slant would have its gap run
      // off down its length)
      const { dn } = clear(ji, br), e = edgeAt(ji, br), from = e > 0 ? e * Math.max(dn, 0.25) : h.half, o = dn > 0.8 ? off : 0;
      // (a stroke running on along the host's edge a long way before it leaves it, a heavy K's leg out of its arm or a y's
      // arm meeting its tail at a slant, isn't cut along the host there, which would run down its length: it is cut
      // square across where it runs on alone, as a bar on a slanted host is below)
      if (from > h.half * 2.5 && !bar) { aloneCut(ji, br, ends); return; }
      // (as wide as Stencil asks, or, where that leaves no solid piece, as wide as does, down to GAP_LEAST of it)
      const tries = [1, 0.75, 0.55, GAP_LEAST].map(k => across(ji, br, from + o, from + o + gapOf(v) * k)).filter((b): b is Pt[] => !!b);
      if (tries.length) opened.push({ bands: tries, ji });
    });
  });
  // a gap opens only where it leaves every piece solid ink, no sliver (half a stem across, on the whole, or most of a
  // hairline's in a font of thin bars, as the engine's stencilPieces asks), and lands on no other stroke's join (the
  // leg of a heavy R on the foot of its bowl): a stroke too short for one is left whole, as the engine leaves it
  const least = Math.min(stem * 0.5, c.bar * 0.9);
  const solid = (r: P[]) => {
    const xs = r.map(q => q.x), ys = r.map(q => q.y), area = signedArea(r);
    return area <= 0 || area / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1) >= least;
  };
  const inside = (pl: Pt[], q: P) => { let w = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) if ((pl[i].y > q.y) !== (pl[j].y > q.y) && q.x < (pl[j].x - pl[i].x) * (q.y - pl[i].y) / (pl[j].y - pl[i].y) + pl[i].x) w = !w; return w; };
  for (const { bands: tries, ji } of opened) {
    const band = tries.find(b => !joins.some((j, k) => k !== ji && !crosses(j) && inside(b, s.nodes[j.node])) && (() => {
      const one = shape([b]);
      return combine([ink, one], (x, y) => ink.has(x, y) && !one.has(x, y)).every(solid);
    })());
    if (band) bands.push(band);
  }
  // a ring on its own (an o, a 0), or with only a short tail running free out of it (a Q's), cut down its middle
  if (v > 0) s.edges.forEach((E, e) => {
    if (E.a !== E.b || (s.nodes[E.a].edges.length !== 2 && !tailed(e))) return;
    const xs = E.pts.map(p => p.x), ys = E.pts.map(p => p.y), r = Math.max(...E.pts.map(p => p.r));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, g = Math.min(gapOf(v), (Math.max(...xs) - Math.min(...xs)) * 0.5), y0 = Math.min(...ys) - r * 1.5, y1 = Math.max(...ys) + r * 1.5;
    bands.push([{ x: cx - g / 2, y: y0 }, { x: cx + g / 2, y: y0 }, { x: cx + g / 2, y: y1 }, { x: cx - g / 2, y: y1 }]);
  });
  if (!bands.length) return cs;
  const cut = shape(bands);
  let rings = combine([ink, cut], (x, y) => ink.has(x, y) && !cut.has(x, y));
  // the corners the cuts leave, rounded as far as asked, up to half round across the stroke cut
  if (to.round > 0) {
    const onCut = (p: P) => bands.some(b => b.some((q, i) => { const r = b[(i + 1) % b.length], l = Math.hypot(r.x - q.x, r.y - q.y) || 1; return Math.abs((p.x - q.x) * (r.y - q.y) - (p.y - q.y) * (r.x - q.x)) / l < 1.5; }));
    rings = rings.map(r => {
      const a = annotate(r), pts: Pt[] = a.map(p => ({ x: p.x, y: p.y, smooth: !p.kink || undefined }));
      pts.forEach((p, i) => {
        if (!a[i].kink || !onCut(p)) return;
        const pr = pts[(i - 1 + pts.length) % pts.length], nx = pts[(i + 1) % pts.length];
        const L = Math.min(Math.hypot(p.x - pr.x, p.y - pr.y), Math.hypot(p.x - nx.x, p.y - nx.y));
        const th = Math.min(Math.abs(a[i].turn), 2.6), half = to.round * L / 2;
        p.r = th > 0.07 ? half / Math.tan(th / 2) : half;
      });
      return toPolygon(roundContour(pts, 0));
    });
  }
  return refit(rings);
}

/* ---- bowls */

/** How round the bowls are: the tension of a quarter turn's handles the engine draws them with (bowlK in font.ts),
    the share of each cut off straight (Facets), how much fuller the organic diagonal is (bowlOrg), and whether Bowls
    draws them as boxes, with how round their corners are (the Bowls' Corners slider, boxRound; 0.5 where they're not). */
export interface BowlLook { k: number; chamfer: number; org: number; box: boolean; round: number }
export const bowlLook = (e: Effective): BowlLook => ({ k: bowlK(e), chamfer: e.chamfer, org: bowlOrg(e), box: e.bowlForm === 'box', round: e.bowlForm === 'box' ? e.boxRound : 0.5 });
const sameBowls = (a: BowlLook, b: BowlLook) => Math.abs(a.k - b.k) < 1e-4 && Math.abs(a.chamfer - b.chamfer) < 1e-4 && Math.abs(a.org - b.org) < 1e-4 && a.box === b.box
  && Math.abs(a.round - b.round) < 1e-4;

/* A font of block letters (Bulwark) turns its bowls in corners: straight sides, and each quarter one round between
   them, as basic-blocks.ts draws them. There a bowl's look is its corners': their radius, the outside's Corners (twice
   the stroke at most) or, oval, as round as the sides between let it be, and the inside's the outside's less the
   stroke; Facets cuts them straight, Curves and Squareness draw them fuller. The stems' corners are square, with no
   round to change. */

/** How far a run of the contour from point `i` heads on straight the way it heads (no handles, turning less than 3°),
    back toward `step` -1 or on toward +1, and the point where it stops. */
function straightOn(con: Node[], i: number, step: 1 | -1): { len: number; at: number } {
  const n = con.length;
  let len = 0, j = i, dir: P | null = null;
  for (let k = 0; k < n; k++) {
    const a = con[j], b = con[(j + step + n) % n], seg = step > 0 ? [a, b] : [b, a];
    if (hasOut(seg[0]) || hasIn(seg[1])) break;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1e-6) { j = (j + step + n) % n; continue; }
    const d = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    if (dir && dir.x * d.x + dir.y * d.y < Math.cos(3 * Math.PI / 180)) break;
    dir ??= d; len += l; j = (j + step + n) % n;
  }
  return { len, at: j };
}

/** The contours of a block letter with its bowls' corners drawn again as `to` asks, where they stand as `from` had
    them: each curve between two straights is a corner, rounded on the ink's outside (a bowl's outside) or its inside
    (a counter's); its new round stays within half of each straight it runs into, apex to apex, so an oval's ends
    meet in the middle of its sides. `T` is the stroke. */
export function restyleBlockBowls(cs: Node[][], from: BowlLook, to: BowlLook, T: number): Node[][] {
  // (the bowls' diagonal fullness, bowlOrg, moved by Slant and the hand, is no corner's)
  if (sameBowls(from, { ...to, org: from.org })) return cs;
  const outer = (b: BowlLook) => (b.box ? b.round * 2 * T : Infinity);
  const want = (b: BowlLook, convex: boolean) => (convex ? outer(b) : Math.max(0, outer(b) - T));
  // (a quarter turn's handles: a circle's, fuller as Curves and Squareness ask, cut straight by Facets)
  const fuller = to.k / Math.max(1e-3, from.k), cut = Math.max(0, Math.min(1, to.chamfer - from.chamfer));
  const ink = shape(cs.map(c => sampled(c)));
  return cs.map(con0 => {
    const n = con0.length;
    if (n < 3) return con0;
    // (read from a point a straight runs into, so no corner runs round the contour's start)
    const isCurve = (i: number) => hasOut(con0[i]) || hasIn(con0[(i + 1) % n]);
    const r = con0.findIndex((_, i) => !isCurve((i - 1 + n) % n));
    if (r < 0) return con0;
    const con = [...con0.slice(r), ...con0.slice(0, r)];
    // the corners: each run of curves with a straight either side, and how far each reaches along them now
    const curved = (i: number) => hasOut(con[i]) || hasIn(con[(i + 1) % n]);
    type Corner = { i0: number; i1: number; V: P; din: P; dout: P; th: number; convex: boolean; t: number; tB: number; back: number; on: number };
    const corners: Corner[] = [];
    for (let i = 0; i < n; i++) {
      if (!curved(i) || curved((i - 1 + n) % n)) continue;
      let j = i;
      while (curved((j + 1) % n) && (j + 1) % n !== i) j = (j + 1) % n;
      const A = con[i], B = con[(j + 1) % n], P0 = con[(i - 1 + n) % n], Q = con[(j + 2) % n];
      if (curved((j + 1) % n) || B === P0) continue;
      const lin = Math.hypot(A.x - P0.x, A.y - P0.y), lout = Math.hypot(Q.x - B.x, Q.y - B.y);
      if (lin < 1e-6 || lout < 1e-6) continue;
      const din = { x: (A.x - P0.x) / lin, y: (A.y - P0.y) / lin }, dout = { x: (Q.x - B.x) / lout, y: (Q.y - B.y) / lout };
      const cr = din.x * dout.y - din.y * dout.x, th = Math.acos(Math.max(-1, Math.min(1, din.x * dout.x + din.y * dout.y)));
      if (th < 0.35 || th > 2.8 || Math.abs(cr) < 1e-6) continue;
      // (a round turning one way all along, as a corner's does: not an S, two rounds turning either way, as at an 8's waist)
      let oneWay = true;
      for (let k = i; oneWay; k = (k + 1) % n) {
        const p = con[k], q = con[(k + 1) % n], a = hasOut(p) ? { x: p.ox!, y: p.oy! } : q, b = hasIn(q) ? { x: q.ix!, y: q.iy! } : p;
        const u = { x: a.x - p.x, y: a.y - p.y }, v = { x: q.x - b.x, y: q.y - b.y }, w = { x: b.x - a.x, y: b.y - a.y };
        if ((u.x * w.y - u.y * w.x) * cr < -1e-6 || (w.x * v.y - w.y * v.x) * cr < -1e-6) oneWay = false;
        if (k === j) break;
      }
      if (!oneWay) continue;
      // the apex: where the two straights would meet
      const s = ((B.x - A.x) * dout.y - (B.y - A.y) * dout.x) / cr, V = { x: A.x + din.x * s, y: A.y + din.y * s };
      // (a bowl's outside rounds its ink off, leaving the apex bare; a counter's corner, rounded, is ink there)
      const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, convex = !ink.has(V.x + (V.x - mid.x) * 0.15, V.y + (V.y - mid.y) * 0.15);
      const tA = Math.hypot(V.x - A.x, V.y - A.y);
      corners.push({ i0: i, i1: j, V, din, dout, th, convex, t: tA, tB: Math.hypot(V.x - B.x, V.y - B.y), back: 0, on: 0 });
    }
    if (!corners.length) return con;
    // (each straight from apex to apex: on to the next corner's apex where it runs into one, else to where it turns)
    const byA = new Map(corners.map(c => [c.i0, c])), byB = new Map(corners.map(c => [(c.i1 + 1) % n, c]));
    for (const c of corners) {
      const b = straightOn(con, c.i0, -1), o = straightOn(con, (c.i1 + 1) % n, 1);
      c.back = c.t + b.len + (byB.get(b.at)?.tB ?? 0);
      c.on = c.tB + o.len + (byA.get(o.at)?.t ?? 0);
    }
    // each one's new reach along its straights: its own round grown or shrunk as the asked one is against the font's
    // (as round as the sides let it be, oval), within half of each straight, apex to apex
    const reach = corners.map(c => {
      const w0 = want(from, c.convex), w1 = want(to, c.convex);
      const t = !Number.isFinite(w1) ? Infinity : Number.isFinite(w0) && w0 > 0 ? c.t * w1 / w0 : w1 * Math.tan(c.th / 2);
      return Math.max(0, Math.min(t, c.back / 2, c.on / 2));
    });
    const at = new Map(corners.map((c, k) => [c.i0, k]));
    const out: Node[] = [];
    for (let i = 0; i < n;) {
      const k = at.get(i);
      if (k === undefined) { out.push(con[i]); i++; continue; }
      const c = corners[k], t = reach[k];
      if (t < 0.5) out.push({ x: Math.round(c.V.x), y: Math.round(c.V.y) });
      else {
        const h = t * (4 / 3) * Math.tan(c.th / 4) / Math.tan(c.th / 2) * fuller * (1 - cut);
        const a = { x: c.V.x - c.din.x * t, y: c.V.y - c.din.y * t }, b = { x: c.V.x + c.dout.x * t, y: c.V.y + c.dout.y * t };
        out.push({ x: Math.round(a.x), y: Math.round(a.y), ...(h > 0.5 ? { ox: Math.round(a.x + c.din.x * h), oy: Math.round(a.y + c.din.y * h) } : {}) });
        out.push({ x: Math.round(b.x), y: Math.round(b.y), ...(h > 0.5 ? { ix: Math.round(b.x - c.dout.x * h), iy: Math.round(b.y - c.dout.y * h) } : {}) });
      }
      // (on past the corner's own points, its curves' ends)
      i = c.i1 + 2;
    }
    // (two rounds meeting halfway along a side, an oval's, meet in one smooth point)
    for (let k = out.length - 1; k >= 0 && out.length > 2; k--) {
      const a = out[k], b = out[(k + 1) % out.length];
      if (a === b || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5) continue;
      const m: Node = { x: a.x, y: a.y, ...(hasIn(a) ? { ix: a.ix, iy: a.iy } : {}), ...(hasOut(b) ? { ox: b.ox, oy: b.oy } : {}) };
      if (hasIn(m) && hasOut(m)) m.s = 1;
      out.splice(k, 1, m);
      out.splice((k + 1) % (out.length), 1);
    }
    return out;
  });
}

/** The upright oval through weighted points, fitted by least squares (A x² + C y² + D x + E y = 1): its middle and half
    widths, or null where they don't make one. */
function ovalFit(pts: P[], w: number[]) {
  let mx = 0, my = 0, sw = 0;
  pts.forEach((p, i) => { mx += p.x * w[i]; my += p.y * w[i]; sw += w[i]; });
  if (sw < 3) return null;
  mx /= sw; my /= sw;
  // (about their mean, scaled, so the sums stay well sized)
  const sc = 1 / 300, M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], v = [0, 0, 0, 0];
  pts.forEach((p, i) => {
    const x = (p.x - mx) * sc, y = (p.y - my) * sc, r = [x * x, y * y, x, y];
    for (let a = 0; a < 4; a++) { v[a] += w[i] * r[a]; for (let b = 0; b < 4; b++) M[a][b] += w[i] * r[a] * r[b]; }
  });
  // (Gaussian elimination)
  for (let c = 0; c < 4; c++) {
    let piv = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]]; [v[c], v[piv]] = [v[piv], v[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; v[r] -= f * v[c]; }
  }
  const [A, C, D, E] = v.map((x, i) => x / M[i][i]);
  if (!(A > 0 && C > 0)) return null;
  const cx = -D / (2 * A), cy = -E / (2 * C), F = 1 + A * cx * cx + C * cy * cy;
  if (!(F > 0)) return null;
  return { cx: mx + cx / sc, cy: my + cy / sc, ax: Math.sqrt(F / A) / sc, ay: Math.sqrt(F / C) / sc };
}

/** How far the Bowls' Corners slider moves a box bowl's superellipse exponent either way from its middle's 12: to 32,
    all but square, at 0 and to 4.5, a squircle, at 1. */
const BOX_SPREAD = 2.67;
/** The superellipse exponent whose quarter a cubic with handles `k` of the way along draws (they meet at 45°). */
const exponentOf = (k: number) => -Math.LN2 / Math.log((3 * Math.min(0.97, Math.max(0.3, k)) + 4) / 8);
/** How far out a bowl reaches at angle a round it, against a circle's 1: a superellipse (round to square), cut toward
    an octagon by Facets, fuller on one diagonal and pinched on the other, as an organic quarter turn is. */
function reachAt(b: BowlLook, a: number) {
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), full = Math.sin(2 * a) > 0;
  // (a box's corners from all but square at Corners 0, through the engine's stroke-wide round at its middle, to as round
  // as a squircle's at 1)
  const k = b.box ? 0.97 : b.k * (1 + (full ? 0.4 : -0.22) * b.org), n = b.box ? 12 * Math.pow(BOX_SPREAD, 1 - 2 * b.round) : exponentOf(k);
  const se = Math.pow(Math.pow(c, n) + Math.pow(s, n), -1 / n), oct = Math.min(1 / Math.max(c, 1e-6), 1 / Math.max(s, 1e-6), Math.SQRT2 / (c + s));
  return se + (oct - se) * Math.min(1, b.chamfer);
}

/** The contours with their bowls drawn as round, square or cut as `to` asks, where they stand as `from` had them:
    every stretch of the skeleton that turns round a good way one way (an o's ring, a c's, each half of an S, a b's
    bowl) is read as part of an oval round the middle of its run, and the outline beside it is pushed out or drawn in
    along the line from that middle by as much as the new shape reaches past the old one there, easing off where the
    bowl meets a stem, so the stems stay where they stand. Box squares them off as squircles instead (boxBowls),
    leaning as far as the font's stems do (`lean`, run across per unit up), `unit` the font's units to one of the
    letters' as drawn (how finely its outline is read for bends). */
export function restyleBowls(cs: Node[][], from: BowlLook, to: BowlLook, sk: SkeletonOf, lean = 0, unit = 1): Node[][] {
  if (sameBowls(from, to)) return cs;
  // (what is read off the letter is kept with it, as dragging Squareness asks again of the same outline; Box reads its
  // shoulders and hooks as bowls too, an n's, a u's, an f's, every quarter turn the engine's boxes square)
  if (to.box) {
    let k = boxScans.get(cs);
    if (!k) { k = scanBowls(cs, sk(), BOX_ARC); boxScans.set(cs, k); }
    if (!k.arcs.length) return cs;
    let memo = boxLimits.get(k);
    if (!memo) boxLimits.set(k, (memo = new Map()));
    return boxBowls(cs, k, to, unit, wiggles(cs, unit), memo, lean) ?? cs;
  }
  let b = bowlScans.get(cs);
  if (!b) { b = scanBowls(cs, sk()); bowlScans.set(cs, b); }
  const { arcs, rings, how } = b;
  if (!arcs.length) return cs;
  // each point of the outline pushed out from its oval by as far as the new shape reaches past the old there
  // (then eased along the outline, as the skeleton it is read off steps from cell to cell)
  const moved = rings.map((r, ri) => {
    const hs = how[ri], fs = hs.map(h => h && 1 + h.w * (reachAt(to, h.a) / reachAt(from, h.a) - 1));
    const n = r.length, f = hs.map((_, i) => {
      let t = 0, c = 0;
      for (let j = -10; j <= 10; j++) { const k = (i + j + n) % n, h = hs[k]; if (h && hs[i] && h.arc === hs[i]!.arc) { t += fs[k]!; c++; } }
      return c ? t / c : 1;
    });
    return r.map((p, i) => { const h = hs[i]; return h ? { x: h.arc.cx + (p.x - h.arc.cx) * f[i], y: h.arc.cy + (p.y - h.arc.cy) * f[i] } : p; });
  });
  const ink = shape(moved);
  return refit(combine([ink], ink.has));
}

/* Box bowls on a free font's letters: its bowls, shoulders and hooks (an o's, an n's, an f's) squared off toward
   squircles: flatter sides, their corners still round, never a hard box (drawn as one, every place a bowl met a stem,
   a bar or an end came out notched). Squared a bowl at a time, round a frame of its own, a side came out uneven
   wherever the letter's bowl wasn't the frame's oval (an e's left side waved, its counter's dome bumped, its terminal
   jogged) and the outline traced again came out kinked; so the outline is squared a quarter at a time (boxQuarters):
   each stretch of it between where it runs level or upright, turns a corner, or turns from bending one way to the
   other, pushed toward the corner of the box its ends' headings span, from the squircle it lies along a share of the
   rest of the way to a square, never rounder, its ends left where they stand heading as they did, so quarters, stems,
   bars and ends meet as the font draws them. A quarter is squared as far as it lies beside a bowl where the skeleton
   bends round (not a stem's corners), eased toward a join; the font's own curves are moved (movedCurves), not traced
   again, so no node turns up where it had none and none it draws smooth breaks; and a letter is squared only as far as
   adds no bend the other way round any of its contours, or not at all. */

/** How much of the rest of the way to a square a bowl's corners are squared at the Bowls' Corners slider's ends: the
    most at Sharp (0), hardly any at Wide (1). */
const BOX_SHARP = 0.75, BOX_WIDE = 0.1;
/** How far round the oval (radians) a bowl's squaring eases in from a join: at least, where the join stands at an
    extreme, and at most, half way between two. */
const BOX_EASE_LEAST = 15 * Math.PI / 180, BOX_EASE_MOST = 80 * Math.PI / 180;
/** An angle turned to within a half turn either way. */
const wrapTurn = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
/** How far round a stretch of the skeleton must turn (radians) for Box to square it: a shoulder's or a hook's quarter
    turn and more. */
const BOX_ARC = 100 * Math.PI / 180;
/** How far off heading on (radians) a bowl may turn at a join and still be read as running on through it into another,
    not eased in from it (an e's eye into its lower curve, round its left side: a 3's halves and a B's bowls meet at
    their waist square). */
const BOX_THROUGH = 70 * Math.PI / 180;
/** How far an arc may turn back in toward its middle (radians round the oval) before what runs on is cut off it. */
const BOX_TURN_BACK = 10 * Math.PI / 180;
/** How little (radians) the skeleton may turn along a run for it to be read as running on straight. */
const BOX_STRAIGHT = 5 * Math.PI / 180;
/** How many times a letter that can't be squared all the way cleanly is tried again, halving the share it is tried at,
    before it is left as the font draws it. */
const BOX_TRIES = 4;
/** How far apart along an outline its bends are read, in font units, and how little a step turns (radians) to count as
    running straight. */
const BOX_STEP = 6, BOX_FLAT = 6 / 400;
/** A kink, read along an outline every third of a step: a turn of more than this (radians) within two of those, a
    corner (a round of a dozen units or tighter, read on the letters as drawn). Read only of an outline traced again
    (the font's curves moved keep every node it draws smooth so: a corner there is a squared one, Corners' Sharp). */
const BOX_KINK = 0.35;

/** How far a superellipse of exponent n reaches at angle t round it (1 along its axes). */
const se = (t: number, n: number) => Math.pow(Math.pow(Math.abs(Math.cos(t)), n) + Math.pow(Math.abs(Math.sin(t)), n), -1 / n);
/** The exponent of the superellipse whose corner, half way between its axes, reaches c (1 for a circle, √2 a square). */
const ofCorner = (c: number) => 1 / (0.5 - Math.log2(clamp(c, 1 + 1e-6, Math.SQRT2 - 1e-6)));
/** How sharply (radians) the outline turns between two of its points for Box to read a corner there, and how far its
    turn over seven of them (some twenty units) must run the other way to read it as bending the other way. */
const BOX_CORNER = 0.35, BOX_BENT = 0.03;
/** How nearly level or upright (radians) a stretch of outline runs to be read as running so. */
const BOX_LEVEL = Math.PI / 180;
/** How far round (radians) a quarter must turn to be squared at all, and over as far again how it comes to be squared
    fully. */
const BOX_TURN_LEAST = 20 * Math.PI / 180;

/** A ring's quarters, as Box squares them: each stretch of it between where it runs level or upright, turns a corner,
    or turns from bending one way to bending the other (so it turns one way, a quarter turn at most), in the box its
    ends' headings span (a rectangle between where it runs level and upright; between a corner's slant and the level,
    the slant's way: square at the corner its headings meet at, C, across from its inner corner, O, the quarter's ends
    at the other two). Each with its points between its ends in the box (u along the end's heading out of it, v along
    the other: 0 at O, 1 at the far sides), the superellipse the stretch lies along best there (as how far that reaches at
    each point's angle round it, and at its corner), and how fully it reads as a round to be squared: none for a stretch
    turning hardly at all, or running all but straight across its box. */
type Quarter = { idx: number[]; eu: P; ev: P; u: number[]; v: number[]; at: number[]; corner: number; full: number };
function boxQuarters(r: P[]): Quarter[] {
  const n = r.length, out: Quarter[] = [];
  if (n < 8) return out;
  const d = r.map((p, i) => ({ x: r[(i + 1) % n].x - p.x, y: r[(i + 1) % n].y - p.y }));
  // (a side all but level or upright, within BOX_LEVEL, read as running level or upright: a stem leaning a hair is no
  // quarter, nor are the rounds at its ends one with it)
  const way = d.map(v => { const l = Math.hypot(v.x, v.y) * Math.sin(BOX_LEVEL); return [Math.abs(v.x) <= l ? 0 : Math.sign(v.x), Math.abs(v.y) <= l ? 0 : Math.sign(v.y)]; });
  const turn = d.map((b, i) => { const a = d[(i - 1 + n) % n]; return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y); });
  const bend = turn.map((_, i) => { let t = 0; for (let j = -3; j <= 3; j++) t += turn[(i + j + n) % n]; return t; });
  // (the way it last bent, read round from the end)
  let bent = 0;
  for (let i = n - 1; i >= 0 && !bent; i--) if (Math.abs(bend[i]) > BOX_BENT) bent = Math.sign(bend[i]);
  const cuts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = way[(i - 1 + n) % n], b = way[i];
    let cut = a[0] !== b[0] || a[1] !== b[1] || Math.abs(turn[i]) > BOX_CORNER;
    if (Math.abs(bend[i]) > BOX_BENT) { if (bent && Math.sign(bend[i]) !== bent) cut = true; bent = Math.sign(bend[i]); }
    if (cut) cuts.push(i);
  }
  const at = (i: number) => r[((i % n) + n) % n];
  // (the way it heads out of an end, read off the next two points: as a curve through the three)
  const heads = (i: number, dir: 1 | -1) => {
    const a = at(i), b = at(i + dir), c = at(i + 2 * dir);
    const v = { x: dir * (-3 * a.x + 4 * b.x - c.x), y: dir * (-3 * a.y + 4 * b.y - c.y) }, l = Math.hypot(v.x, v.y);
    return l > 1e-9 ? { x: v.x / l, y: v.y / l } : null;
  };
  for (let k = 0; k < cuts.length; k++) {
    const i0 = cuts[k], i1 = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + n;
    if (i1 - i0 < 4) continue;
    const P0 = at(i0), P1 = at(i1), t0 = heads(i0, 1), t1 = heads(i1, -1);
    if (!t0 || !t1) continue;
    // (t1 the way it comes into its far end, X where the two headings meet: ahead of the first end, behind the far one)
    const det = t0.x * t1.y - t0.y * t1.x, turned = Math.acos(clamp(t0.x * t1.x + t0.y * t1.y, -1, 1));
    if (Math.abs(det) < 1e-6 || turned < BOX_TURN_LEAST) continue;
    const dx = P1.x - P0.x, dy = P1.y - P0.y, a = (dx * t1.y - dy * t1.x) / det, b = (t0.x * dy - t0.y * dx) / det;
    if (!(a > 0 && b > 0)) continue;
    const X = { x: P0.x + t0.x * a, y: P0.y + t0.y * a }, O = { x: P0.x + P1.x - X.x, y: P0.y + P1.y - X.y };
    const eu = { x: X.x - P0.x, y: X.y - P0.y }, ev = { x: X.x - P1.x, y: X.y - P1.y }, de = eu.x * ev.y - eu.y * ev.x;
    if (Math.min(Math.hypot(eu.x, eu.y), Math.hypot(ev.x, ev.y)) < 1.5 || Math.abs(de) < 1e-9) continue;
    const idx: number[] = [], u: number[] = [], v: number[] = [];
    let off = 0;
    for (let i = i0 + 1; i < i1; i++) {
      const q = at(i), px = q.x - O.x, py = q.y - O.y, uu = (px * ev.y - py * ev.x) / de, vv = (eu.x * py - eu.y * px) / de;
      if (uu < -0.05 || vv < -0.05 || uu > 1.05 || vv > 1.05) off++;
      idx.push(i % n); u.push(clamp(uu, 0, 1)); v.push(clamp(vv, 0, 1));
    }
    // (a stretch that runs out past its box, bending back the other way, is no quarter)
    if (off > 0.1 * idx.length) continue;
    let best = { n: 2, e: Infinity };
    for (let m = 1; m <= 16; m += 0.25) {
      let e = 0;
      for (let j = 0; j < u.length; j++) { const g = Math.pow(Math.pow(u[j], m) + Math.pow(v[j], m), 1 / m) - 1; e += g * g; }
      if (e < best.e) best = { n: m, e };
    }
    out.push({
      idx, eu, ev, u, v, at: u.map((x, j) => se(Math.atan2(v[j], x), best.n)), corner: se(Math.PI / 4, best.n),
      full: smoothstep((best.n - 1.3) / 0.5) * smoothstep((turned - BOX_TURN_LEAST) / BOX_TURN_LEAST)
    });
  }
  return out;
}

/** A letter's bowls as read off it, stood upright: its lean (how far across its stems run for each unit up) taken out
    of the outline and the skeleton, each arc's oval fitted again and its angles round it read again. */
function upright(b: BowlScan, lean: number): BowlScan {
  const map = new Map<Arc, Arc>();
  for (const A of b.arcs) {
    const pts = A.pts.map(q => ({ ...q, x: q.x - q.y * lean })), run = pts.slice(A.i0, A.i1 + 1);
    const fit = ovalFit(run, A.bend.slice(A.i0, A.i1 + 1)) ?? { cx: A.cx - A.cy * lean, cy: A.cy, ax: A.ax, ay: A.ay };
    const th: number[] = [];
    run.forEach((q, k) => {
      let t = Math.atan2((q.y - fit.cy) / fit.ay, (q.x - fit.cx) / fit.ax);
      if (k) { const l = th[k - 1]; while (t - l > Math.PI) t -= 2 * Math.PI; while (t - l < -Math.PI) t += 2 * Math.PI; }
      th.push(t);
    });
    map.set(A, { ...A, ...fit, pts, th });
  }
  return {
    arcs: b.arcs.map(A => map.get(A)!), rings: b.rings.map(r => r.map(p => ({ x: p.x - p.y * lean, y: p.y }))),
    how: b.how.map(r => r.map(h => h && { ...h, arc: map.get(h.arc)! })), near: b.near
  };
}

/** A letter's bowls as read off it, each arc cut short where it stops running on round its oval and turns back in
    toward the middle (a G's bar, run on from its bowl as one stroke, the way the bowl turned), and where it runs on
    straight for more than a stroke and a half (a stem: an h's and an n's down to the foot, a u's up from its bowl): what
    runs back in or on straight is no bowl, and stays the font's; an arc cut so has its oval fitted again. */
function roundOnly(b: BowlScan): BowlScan {
  const map = new Map<Arc, Arc>();
  for (const A of b.arcs) {
    const th = A.th, last = th.length - 1, dir = Math.sign(th[last] - th[0]) || 1;
    let k0 = 0, k1 = 0;
    for (let k = 1; k <= last; k++) { if (dir * th[k] > dir * th[k1]) k1 = k; if (dir * th[k] < dir * th[k0]) k0 = k; }
    if (dir * (th[k1] - th[last]) <= BOX_TURN_BACK) k1 = last;
    if (dir * (th[0] - th[k0]) <= BOX_TURN_BACK) k0 = 0;
    if (!A.ring) {
      // (read from a few points in, as a skeleton jogs at the very end of a stroke, into a foot's corners; straight while
      // the way from there to each point on heads within BOX_STRAIGHT of the way it set out, its cell-by-cell steps aside)
      const runs = (from: number, step: number, stop: number) => {
        const s0 = from + 5 * step, s1 = s0 + 8 * step;
        if ((s1 - stop) * step >= 0) return from;
        const p0 = A.pts[A.i0 + s0], p1 = A.pts[A.i0 + s1], h0 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        let k = s1;
        while (k !== stop) {
          const q = A.pts[A.i0 + k + step];
          if (Math.abs(wrapTurn(Math.atan2(q.y - p0.y, q.x - p0.x) - h0)) > BOX_STRAIGHT) break;
          k += step;
        }
        return k;
      };
      const e1 = runs(k1, -1, k0), e0 = runs(k0, 1, k1);
      if (A.along[k1] - A.along[e1] > A.ease * 0.75) k1 = e1;
      if (A.along[e0] - A.along[k0] > A.ease * 0.75) k0 = e0;
    }
    if (k0 === 0 && k1 === last) { map.set(A, A); continue; }
    if (k1 - k0 < 5) { map.set(A, { ...A, i0: A.i0, i1: A.i0 - 1, th: [], along: [] }); continue; }
    const run = A.pts.slice(A.i0 + k0, A.i0 + k1 + 1), fit = ovalFit(run, run.map(() => 1)) ?? { cx: A.cx, cy: A.cy, ax: A.ax, ay: A.ay };
    const ts: number[] = [];
    run.forEach((q, k) => {
      let t = Math.atan2((q.y - fit.cy) / fit.ay, (q.x - fit.cx) / fit.ax);
      if (k) { const l = ts[k - 1]; while (t - l > Math.PI) t -= 2 * Math.PI; while (t - l < -Math.PI) t += 2 * Math.PI; }
      ts.push(t);
    });
    map.set(A, {
      ...A, ...fit, i0: A.i0 + k0, i1: A.i0 + k1, th: ts, along: A.along.slice(k0, k1 + 1).map(d => d - A.along[k0]),
      free: [k0 === 0 && A.free[0], k1 === last && A.free[1]], spurs: [k0 === 0 ? A.spurs[0] : [], k1 === last ? A.spurs[1] : []], ring: false,
      nodes: [k0 === 0 ? A.nodes[0] : -1, k1 === last ? A.nodes[1] : -1]
    });
  }
  const kept = b.arcs.map(A => map.get(A)!).filter(A => A.i1 >= A.i0);
  return { ...b, arcs: kept, how: b.how.map(r => r.map(h => {
    if (!h) return h;
    const A = map.get(h.arc)!;
    return h.qi < A.i0 || h.qi > A.i1 ? null : { ...h, arc: A };
  })) };
}

function boxBowls(cs: Node[][], scan: BowlScan, to: BowlLook, unit: number, was: Wiggles, memo: Map<string, number>, lean = 0): Node[][] | null {
  // (an italic's bowls squared upright and leaned again, leaning as its stems do)
  if (Math.abs(lean) < 1e-3) lean = 0;
  const sh = (x: number | undefined, y: number | undefined) => (x === undefined ? undefined : x + y! * lean);
  const leaned = (out: Node[][]) => lean ? out.map(c => c.map(n => {
    const m: Node = { ...n, x: n.x + n.y * lean };
    if (n.ix !== undefined) m.ix = sh(n.ix, n.iy);
    if (n.ox !== undefined) m.ox = sh(n.ox, n.oy);
    return m;
  })) : out;
  const { arcs, rings, how } = roundOnly(lean ? upright(scan, lean) : scan);
  // (each point of the font's outline found again among the outline as read, stood upright as upright stands it)
  const plan = curvePlan(cs, rings, lean ? q => `${q.x - q.y * lean},${q.y}` : q => `${q.x},${q.y}`);
  // (an end that runs out free, or into a serif and no further)
  const loose = (A: Arc, end: number) => A.free[end] || A.spurs[end].length > 0;
  // how far each arc's skeleton point is squared, from none to all of it: none at a join (not a free end), rising
  // again round the oval no faster than over a stretch the longer the further the join stands from the oval's extremes
  // (a squircle's corner reaches out most half way between them: an a's bowl running into its stem there eases in over
  // most of a quarter, an e's into its bar, level with its middle, hardly); then evened out along the arc
  // (a join one bowl runs on through into another, heading on the way it came, an e's eye into its lower curve down its
  // left side: no join to ease off into, the two squared as one there)
  // (read between one and three strokes' widths out from the join, past where its skeleton bends off toward the third
  // stroke there)
  const heading = (A: Arc, end: number) => {
    const last = A.th.length - 1, L = A.along[last], d = (x: number) => indexAt(A.along, end ? L - x : x);
    const a = A.pts[A.i0 + d(Math.min(L, A.ease * 0.75))], b = A.pts[A.i0 + d(Math.min(L, A.ease * 0.25))], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  const through = new Set<string>();
  arcs.forEach((A, ai) => arcs.forEach((B, bi) => [0, 1].forEach(ea => [0, 1].forEach(eb => {
    if (ai === bi || A.nodes[ea] < 0 || A.nodes[ea] !== B.nodes[eb]) return;
    // (A's way into the join, and B's way out of it: B's into it turned round)
    const a = heading(A, ea), b = heading(B, eb);
    if (-(a.x * b.x + a.y * b.y) > Math.cos(BOX_THROUGH)) { through.add(`${ai}:${ea}`); through.add(`${bi}:${eb}`); }
  }))));
  const weights = new Map<Arc, number[]>(arcs.map((A, ai) => {
    // (held at a join only: not where it ends part way along its stroke, run on straight into a stem, an h's, or into
    // the other half of an S, the outline running on there)
    const last = A.th.length - 1, open = [0, 1].map(e => A.nodes[e] < 0 || loose(A, e) || through.has(`${ai}:${e}`));
    const held = A.th.map((_, k): number => ((!A.ring || A.knot) && ((k === 0 && !open[0]) || (k === last && !open[1])) ? 0 : 1));
    const span = A.th.map(t => Math.max(BOX_EASE_LEAST, BOX_EASE_MOST * Math.sin(2 * Math.abs(t - Math.round(t / (Math.PI / 2)) * Math.PI / 2))));
    // (a ring is held only where a stroke leaves it, an e's eye at its bar, and its ends there aren't neighbours round
    // it: its outside runs on from its other end into the stroke the bar leaves, an e's lower curve)
    const raw = held.slice(), m = raw.length;
    for (const dir of [1, -1]) for (let s = 1; s < m; s++) {
      const k = dir > 0 ? s : m - 1 - s, j = k - dir;
      raw[k] = Math.min(raw[k], raw[j] + Math.abs(A.th[k] - A.th[j]) / span[k]);
    }
    for (let k = 0; k < m; k++) raw[k] = smoothstep(raw[k]);
    return [A, raw.map((_, k) => {
      let x = 0, c = 0;
      for (let j = -6; j <= 6; j++) { const wt = 7 - Math.abs(j); x += raw[clamp(k + j, 0, last)] * wt; c += wt; }
      return x / c;
    })];
  }));
  // each point of the outline beside an arc: which side of the stroke it is (1 outside, -1 inside, told by which way the
  // paper lies from it; across an end's cut, how far out it stands from its skeleton point), or none where it faces the
  // paper across the skeleton (another stroke's, nearer this one's middle line across a narrow gap)
  const sideOf = rings.map((r, ri) => r.map((p, i) => {
    const h = how[ri][i];
    if (!h) return null;
    const A = h.arc, q = A.pts[h.qi], pr = r[(i - 1 + r.length) % r.length], nx = r[(i + 1) % r.length];
    const cap = (loose(A, 0) && h.qi <= A.i0 + 1) || (loose(A, 1) && h.qi >= A.i1 - 1);
    if (cap) return clamp((Math.hypot(p.x - A.cx, p.y - A.cy) - Math.hypot(q.x - A.cx, q.y - A.cy)) / Math.max(q.r, 1), -1, 1);
    const s = (nx.y - pr.y) * (p.x - A.cx) - (nx.x - pr.x) * (p.y - A.cy) < 0 ? -1 : 1;
    return s * ((p.x - q.x) * (q.x - A.cx) + (p.y - q.y) * (q.y - A.cy)) < 0 ? null : s;
  }));
  // how far each point of the outline is squared: as far as its arc's skeleton point beside it, where the skeleton
  // bends round (not where it runs straight, nor round a corner: a B's stem's, its bowls run on down into it), or none
  // off the bowls (nor where it faces the paper across the skeleton)
  // (beside where a ring is joined, its two ends stand at the same place: the outline there runs on from the one let go)
  const wAt = rings.map((r, ri) => r.map((_, i) => {
    const h = how[ri][i];
    if (!h || sideOf[ri][i] === null) return null;
    const ws = weights.get(h.arc)!, k = h.qi - h.arc.i0;
    return (h.arc.knot && (k <= 1 || k >= ws.length - 2) ? Math.max(ws[0], ws[ws.length - 1]) : ws[k]) * h.arc.bend[h.qi];
  }));
  // each quarter squared alike all along (its ends stay where they are, so quarters squared unlike meet cleanly): as far
  // as its points beside a bowl are, on the whole, a quarter only part of which is beside one less (the foot of an h's
  // shoulder, run on toward its stem, as the rest), one hardly beside one not at all (a serif's bracket)
  // (read along it: a long straight side is one point at each end, a round many)
  const quarters = rings.map((r, ri) => boxQuarters(r).map(q => {
    let all = 0, on = 0, w = 0;
    for (const i of q.idx) {
      const n = r.length, l = (Math.hypot(r[(i + 1) % n].x - r[i].x, r[(i + 1) % n].y - r[i].y) + Math.hypot(r[i].x - r[(i - 1 + n) % n].x, r[i].y - r[(i - 1 + n) % n].y)) / 2, wi = wAt[ri][i];
      all += l;
      if (wi !== null) { on += l; w += wi * l; }
    }
    return { ...q, full: q.full * (on ? w / on : 0) * smoothstep((on / Math.max(all, 1e-9) - 0.2) / 0.3) };
  }));
  // how far each point moves: each quarter of the outline squared in its own box, its two ends where they are, each
  // point out from the box's inner corner by as far as the squircle `share` of the rest of the way to a square reaches
  // past the one the quarter lies along, Facets cutting it toward an octagon, kept inside the box
  const moves = (share: number, cut: number) => rings.map((r, ri) => {
    const d = r.map(() => ({ x: 0, y: 0 }));
    for (const q of quarters[ri]) {
      const to = ofCorner(q.corner + (Math.SQRT2 - q.corner) * share);
      q.idx.forEach((i, k) => {
        const u = q.u[k], v = q.v[k], t = Math.atan2(v, u), c = Math.cos(t), sn = Math.sin(t);
        const oct = Math.min(1 / Math.max(c, 1e-6), 1 / Math.max(sn, 1e-6), Math.SQRT2 / (c + sn)), want = se(t, to);
        // (how far short of the box's sides it stands, read smoothly round its corner, scaled as far as the squircle
        // stands short of them against the one the quarter lies along: so that one lands on the squircle, a point on a
        // side stays on it, and none goes past one)
        const box = (x: number, y: number) => Math.pow(Math.pow(x, 40) + Math.pow(y, 40), 1 / 40), b0 = box(u, v), bc = box(c, sn);
        const bf = q.at[k] * bc, bt = (want + (oct - want) * Math.min(1, cut)) * bc;
        const now = 1 - (1 - b0) * clamp((1 - bt) / Math.max(1 - bf, 1e-9), 0, 2);
        const f = (b0 > 1e-9 ? now / b0 - 1 : 0) * q.full;
        d[i] = { x: (u * q.eu.x + v * q.ev.x) * f, y: (u * q.eu.y + v * q.ev.y) * f };
      });
    }
    return d;
  });
  // the letter moved `of` the way those moves go (1 all of it): the font's own curves moved (movedCurves), none should
  // they cross where they move; or should the font's outline not be found as read, its outline as read moved and traced
  // again
  const drawn = (ds: P[][], of: number): Node[][] | null => {
    if (plan) {
      const out = movedCurves(plan, ([ri, i]) => ({ x: (ds[ri][i].x + ds[ri][i].y * lean) * of, y: ds[ri][i].y * of }));
      return crossed(out) ? null : tame(out);
    }
    const moved = rings.map((r, ri) => {
      const out = r.map((p, i) => ({ x: p.x + ds[ri][i].x * of, y: p.y + ds[ri][i].y * of }));
      // (a ring the squircle would fold over on itself or squeeze flat stays the font's)
      const was = signedArea(r), now = signedArea(out);
      return now * was <= 0 || Math.abs(now) < 0.6 * Math.abs(was) || Math.abs(now) > 1.8 * Math.abs(was) ? r : out;
    });
    const ink = shape(moved);
    return leaned(tame(refit(combine([ink], ink.has))));
  };
  // (squared only as far as keeps the letter's outline as clean as the font draws it, `was` as read off it as it came: no
  // bend the other way along it the font's hasn't got, no kink, a dent or a wave where the squaring meets what it leaves
  // as it was; else the font's own. How much of its moves it can take and stay so is found once, at Corners' squarest,
  // uncut and cut all the way by Facets (between the two for Facets between), to within a sixteenth, and every setting
  // takes as much of its own: each point moves the further the squarer Corners asks, so a letter squares on smoothly as
  // either slider is dragged, not by fits and starts)
  // (a kink as well, should its outline be traced again: the font's curves moved keep every node that runs smooth so,
  // so none comes but a squared corner)
  const clean = (out: Node[][] | null): out is Node[][] => {
    if (!out) return false;
    const w = wiggles(out, unit);
    return !newWiggles({ bends: w.bends, kinks: plan ? [] : w.kinks }, was, unit);
  };
  const most = (ds: P[][], hi: number) => {
    if (clean(drawn(ds, hi))) return hi;
    let lo = 0;
    for (let k = 0; k < BOX_TRIES; k++) { const mid = (lo + hi) / 2; if (clean(drawn(ds, mid))) lo = mid; else hi = mid; }
    return lo;
  };
  const at = (cut: number) => {
    let v = memo.get(`${cut}`);
    if (v === undefined) memo.set(`${cut}`, (v = most(moves(BOX_SHARP, cut), 1)));
    return v;
  };
  const cut = clamp(to.chamfer), limit = cut > 0 ? lerp(at(0), at(1), cut) : at(0);
  if (!limit) return null;
  const ds = moves(BOX_WIDE + (BOX_SHARP - BOX_WIDE) * Math.pow(1 - clamp(to.round), 1.5), cut), out = drawn(ds, limit);
  if (clean(out)) return out;
  // (and should a gentler squaring come out less clean than the squarest, gentler still)
  const less = most(ds, limit);
  return less ? drawn(ds, less) : null;
}

/** How far (font units) a curve drawn again along a moved stretch of outline may stand off it before it is split in
    two. */
const BOX_FIT = 0.3;
/** How nearly (radians) the way an outline comes into a node and the way it leaves must agree for the node to be
    read as smooth, the outline running on through it. */
const SMOOTH_NODE = 3 * Math.PI / 180;

/** Each segment of each contour, its ends and the points sampled takes along it (how far along each stands, where it
    stands, and which point of the outline as read it is): null should one not be found there (contours overlapping,
    their outline as read cut where they cross). */
type CurvePlan = { a: Node; b: Node; line: boolean; ts: number[]; os: P[]; at: [number, number][] }[][];
function curvePlan(cs: Node[][], rings: P[][], key: (p: P) => string): CurvePlan | null {
  const index = new Map<string, [number, number]>();
  rings.forEach((r, ri) => r.forEach((q, i) => index.set(`${q.x},${q.y}`, [ri, i])));
  const plan: CurvePlan = [];
  for (const c of cs) {
    const segs: CurvePlan[number] = [];
    for (let j = 0; j < c.length; j++) {
      const a = c[j], b = c[(j + 1) % c.length], line = a.ox === undefined && b.ix === undefined;
      const ts = [0], os: P[] = [a], at: [number, number][] = [];
      for (const s of along(a, b)) { ts.push(s.t); os.push(s.p); }
      ts.push(1); os.push(b);
      for (const q of os) { const f = index.get(key(q)); if (!f) return null; at.push(f); }
      segs.push({ a, b, line, ts, os, at });
    }
    plan.push(segs);
  }
  return plan;
}

/** v at length 1 (along x should it have none). */
const unitOr = (v: P): P => { const l = Math.hypot(v.x, v.y); return l > 1e-12 ? { x: v.x / l, y: v.y / l } : { x: 1, y: 0 }; };

/** Cubics from the first of points ps to the last, through the rest (at ts along, 0 to 1), heading `ua` out of the first
    and `ub` into the last: the handles as long as follow them best (least squares, the points' places along it read
    again twice), split at the point it misses most should one miss any by more than BOX_FIT (a smooth node there,
    heading the way the points run through it). */
function fitMoved(ps: P[], ts: number[], ua: P, ub: P, depth: number): P[][] {
  const m = ps.length - 1, A = ps[0], B = ps[m], L = Math.hypot(B.x - A.x, B.y - A.y);
  const at = (C: P[], t: number) => { const u = 1 - t; return { x: u * u * u * C[0].x + 3 * u * u * t * C[1].x + 3 * u * t * t * C[2].x + t * t * t * C[3].x, y: u * u * u * C[0].y + 3 * u * u * t * C[1].y + 3 * u * t * t * C[2].y + t * t * t * C[3].y }; };
  const d1 = (C: P[], t: number) => { const u = 1 - t; return { x: 3 * u * u * (C[1].x - C[0].x) + 6 * u * t * (C[2].x - C[1].x) + 3 * t * t * (C[3].x - C[2].x), y: 3 * u * u * (C[1].y - C[0].y) + 6 * u * t * (C[2].y - C[1].y) + 3 * t * t * (C[3].y - C[2].y) }; };
  const d2 = (C: P[], t: number) => ({ x: 6 * (1 - t) * (C[2].x - 2 * C[1].x + C[0].x) + 6 * t * (C[3].x - 2 * C[2].x + C[1].x), y: 6 * (1 - t) * (C[2].y - 2 * C[1].y + C[0].y) + 6 * t * (C[3].y - 2 * C[2].y + C[1].y) });
  const solve = (us: number[]): P[] => {
    let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
    for (let k = 1; k < m; k++) {
      const t = us[k], u = 1 - t, b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
      const a1 = { x: ua.x * b1, y: ua.y * b1 }, a2 = { x: -ub.x * b2, y: -ub.y * b2 };
      const rx = ps[k].x - (A.x * (b0 + b1) + B.x * (b2 + b3)), ry = ps[k].y - (A.y * (b0 + b1) + B.y * (b2 + b3));
      c00 += a1.x * a1.x + a1.y * a1.y; c01 += a1.x * a2.x + a1.y * a2.y; c11 += a2.x * a2.x + a2.y * a2.y;
      x0 += a1.x * rx + a1.y * ry; x1 += a2.x * rx + a2.y * ry;
    }
    const det = c00 * c11 - c01 * c01;
    let al = Math.abs(det) > 1e-12 ? (x0 * c11 - x1 * c01) / det : NaN, be = Math.abs(det) > 1e-12 ? (c00 * x1 - c01 * x0) / det : NaN;
    if (!(al > L * 1e-3) || !(be > L * 1e-3)) al = be = L / 3;
    return [A, { x: A.x + ua.x * al, y: A.y + ua.y * al }, { x: B.x - ub.x * be, y: B.y - ub.y * be }, B];
  };
  let us = ts.slice(), C = solve(us);
  for (let pass = 0; pass < 2; pass++) {
    us = us.map((t, k) => {
      if (k === 0 || k === m) return t;
      const q = at(C, t), v = d1(C, t), w = d2(C, t), dx = q.x - ps[k].x, dy = q.y - ps[k].y;
      const den = v.x * v.x + v.y * v.y + dx * w.x + dy * w.y;
      return Math.abs(den) > 1e-12 ? clamp(t - (dx * v.x + dy * v.y) / den, 0, 1) : t;
    });
    C = solve(us);
  }
  let worst = 0, wk = 0;
  for (let k = 1; k < m; k++) { const q = at(C, us[k]), e = Math.hypot(q.x - ps[k].x, q.y - ps[k].y); if (e > worst) { worst = e; wk = k; } }
  if (worst <= BOX_FIT || m < 6 || depth >= 3) return [C];
  const k = clamp(wk, 2, m - 2), mid = unitOr({ x: ps[k + 1].x - ps[k - 1].x, y: ps[k + 1].y - ps[k - 1].y });
  const left = ts.slice(0, k + 1).map(t => t / ts[k]), right = ts.slice(k).map(t => (t - ts[k]) / (1 - ts[k]));
  return [...fitMoved(ps.slice(0, k + 1), left, ua, mid, depth + 1), ...fitMoved(ps.slice(k), right, mid, ub, depth + 1)];
}

/** The contours of a plan (curvePlan) with their outline moved, `move` giving how far each of its points goes: each
    node moved, each curve drawn again between them heading out of and into them as the moved outline does there (on
    through a node the font draws smooth, no corner where it had none), its handles as long as follow the moved points
    best, and split where one curve can't follow them within BOX_FIT. The font's own nodes, none where it had none, and
    a curve nothing moves as it was; a contour moved till it folds over or squeezes flat stays the font's. */
function movedCurves(plan: CurvePlan, move: (at: [number, number]) => P): Node[][] {
  return plan.map(segs => {
    const n = segs.length, font = segs.map(sg => sg.a);
    const moved = segs.map(sg => sg.os.map((q, k) => { const d = move(sg.at[k]); return { x: q.x + d.x, y: q.y + d.y }; }));
    const still = moved.map((ms, j) => ms.every((m, k) => Math.abs(m.x - segs[j].os[k].x) + Math.abs(m.y - segs[j].os[k].y) < 1e-9));
    if (still.every(Boolean)) return font;
    const was = signedArea(segs.flatMap(sg => sg.os.slice(0, -1))), now = signedArea(moved.flatMap(ms => ms.slice(0, -1)));
    if (now * was <= 0 || Math.abs(now) < 0.6 * Math.abs(was) || Math.abs(now) > 1.8 * Math.abs(was)) return font;
    // the way the font's outline and the moved one head at each segment's start (end 0) and its end (1), the way it
    // runs: the font's from its handle, the moved one's that turned as its moves turn it (read off the moves at its
    // first points); along a straight side, from end to end; off a handle that sits on its node, toward the next point
    const heads = (j: number, end: 0 | 1, of: 'font' | 'moved'): P => {
      const sg = segs[j], ps = of === 'font' ? sg.os : moved[j], m = ps.length - 1;
      if (sg.line) return unitOr({ x: ps[m].x - ps[0].x, y: ps[m].y - ps[0].y });
      const a = sg.a, b = sg.b, L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const h0 = end ? { x: 3 * (b.x - (b.ix ?? b.x)), y: 3 * (b.y - (b.iy ?? b.y)) } : { x: 3 * ((a.ox ?? a.x) - a.x), y: 3 * ((a.oy ?? a.y) - a.y) };
      if (Math.hypot(h0.x, h0.y) < 1e-3 * L) return unitOr(end ? { x: ps[m].x - ps[m - 1].x, y: ps[m].y - ps[m - 1].y } : { x: ps[1].x - ps[0].x, y: ps[1].y - ps[0].y });
      if (of === 'font') return unitOr(h0);
      // (how fast the move changes per t there, from that end in: three points, or two on a short curve)
      const h = sg.ts[1], k = end ? [m, m - 1, m - 2] : [0, 1, 2];
      const D = k.map(i => { const c = Math.max(0, Math.min(m, i)); return { x: moved[j][c].x - sg.os[c].x, y: moved[j][c].y - sg.os[c].y }; });
      const dD = m >= 3 ? { x: (-3 * D[0].x + 4 * D[1].x - D[2].x) / (2 * h), y: (-3 * D[0].y + 4 * D[1].y - D[2].y) / (2 * h) } : { x: (D[1].x - D[0].x) / h, y: (D[1].y - D[0].y) / h };
      // (read from the end inward, so at the end turned round to head the way the outline runs)
      return unitOr(end ? { x: h0.x - dD.x, y: h0.y - dD.y } : { x: h0.x + dD.x, y: h0.y + dD.y });
    };
    // at each node the way the moved outline leaves it and comes into it: one way where the font runs on smooth through
    // it (a straight side's, or a curve's left still, where one meets it)
    const outOf: P[] = [], into: P[] = [];
    for (let j = 0; j < n; j++) {
      const pj = (j - 1 + n) % n, o = heads(j, 0, 'moved'), i = heads(pj, 1, 'moved');
      const fo = heads(j, 0, 'font'), fi = heads(pj, 1, 'font');
      if (Math.acos(clamp(fo.x * fi.x + fo.y * fi.y, -1, 1)) >= SMOOTH_NODE) { outOf.push(o); into.push(i); continue; }
      const one = segs[j].line || still[j] ? o : segs[pj].line || still[pj] ? i : unitOr({ x: o.x + i.x, y: o.y + i.y });
      outOf.push(one); into.push(one);
    }
    // each segment drawn again: its nodes, any it is split at, and the handles between
    const out: Node[] = [], starts: number[] = [], tails: (P | undefined)[] = [];
    segs.forEach((sg, j) => {
      const ms = moved[j], node: Node = { ...sg.a, x: ms[0].x, y: ms[0].y };
      delete node.ix; delete node.iy; delete node.ox; delete node.oy;
      starts.push(out.length);
      out.push(node);
      if (sg.line) { tails.push(undefined); return; }
      if (still[j]) {
        if (sg.a.ox !== undefined) { node.ox = sg.a.ox; node.oy = sg.a.oy; }
        tails.push(sg.b.ix === undefined ? undefined : { x: sg.b.ix, y: sg.b.iy! });
        return;
      }
      const cubics = fitMoved(ms, sg.ts, outOf[j], into[(j + 1) % n], 0);
      node.ox = cubics[0][1].x; node.oy = cubics[0][1].y;
      for (let q = 1; q < cubics.length; q++) {
        out.push({ x: cubics[q][0].x, y: cubics[q][0].y, ix: cubics[q - 1][2].x, iy: cubics[q - 1][2].y, ox: cubics[q][1].x, oy: cubics[q][1].y, s: 1 });
      }
      tails.push(cubics[cubics.length - 1][2]);
    });
    // (each segment's last handle on the node it comes into)
    tails.forEach((t, j) => { if (t) { const nd = out[starts[(j + 1) % n]]; nd.ix = t.x; nd.iy = t.y; } });
    return out;
  });
}

/** Whether contours cross themselves or one another anywhere, read along them as sampled reads them. */
function crossed(cs: Node[][]): boolean {
  const cell = 24, grid = new Map<number, { a: P; b: P; r: number; i: number; n: number }[]>();
  const cross = (o: P, p: P, q: P) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const polys = cs.map(c => sampled(c));
  for (let r = 0; r < polys.length; r++) {
    const ps = polys[r], n = ps.length;
    for (let i = 0; i < n; i++) {
      const e = { a: ps[i], b: ps[(i + 1) % n], r, i, n };
      const x0 = Math.floor(Math.min(e.a.x, e.b.x) / cell), x1 = Math.floor(Math.max(e.a.x, e.b.x) / cell);
      const y0 = Math.floor(Math.min(e.a.y, e.b.y) / cell), y1 = Math.floor(Math.max(e.a.y, e.b.y) / cell);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const key = gx * 100003 + gy, here = grid.get(key);
        if (here) for (const f of here) {
          // (neighbours along the same contour meet at their shared point)
          if (f.r === r && (Math.abs(f.i - i) <= 1 || Math.abs(f.i - i) === n - 1)) continue;
          if (cross(e.a, e.b, f.a) * cross(e.a, e.b, f.b) < 0 && cross(f.a, f.b, e.a) * cross(f.a, f.b, e.b) < 0) return true;
        }
        if (here) here.push(e); else grid.set(key, [e]);
      }
    }
  }
  return false;
}

/** Contours whose curves' handles reach no further along them, together, than the curve runs: traced through points
    in a line (a squared bowl's flattened top), a curve's handles can come out longer than it, and the curve doubles back
    on itself in a tiny S. */
function tame(cs: Node[][]): Node[][] {
  return cs.map(c => {
    const out = c.map(n => ({ ...n }));
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      if (a.ox === undefined || b.ix === undefined) continue;
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
      if (L < 1e-6) continue;
      const pa = ((a.ox - a.x) * dx + (a.oy! - a.y) * dy) / L, pb = ((b.x - b.ix) * dx + (b.y - b.iy!) * dy) / L;
      if (pa + pb <= L * 0.95) continue;
      const k = (L * 0.95) / Math.max(pa + pb, 1e-6);
      a.ox = a.x + (a.ox - a.x) * k; a.oy = a.y + (a.oy! - a.y) * k;
      b.ix = b.x + (b.ix - b.x) * k; b.iy = b.y + (b.iy! - b.y) * k;
    }
    return out;
  });
}

/** Where a letter's outline turns from bending one way to bending the other (a dent, a wave, an S's spine), read along
    it every BOX_STEP units (of the letters as drawn: `unit` the font's to one) over a few steps at a time, a bend gentler
    than BOX_FLAT a step (a circle 400 units round) not read as one either way; and where it kinks (BOX_KINK: a corner, a
    notch). */
type Wiggles = { bends: P[][]; kinks: P[] };
function wiggles(cs: Node[][], unit = 1): Wiggles {
  const step = BOX_STEP * unit, bends: P[][] = [], kinks: P[] = [];
  // (its curves read finely, a few points to a step: a long curve cut in a few straight pieces reads as kinked)
  const rings: P[][] = [];
  let ring: P[] = [], x = 0, y = 0;
  for (const c of drawnCmds(cs)) {
    if (c[0] === 'M') { if (ring.length > 2) rings.push(ring); ring = [{ x: c[1], y: c[2] }]; x = c[1]; y = c[2]; }
    else if (c[0] === 'L') { ring.push({ x: c[1], y: c[2] }); x = c[1]; y = c[2]; }
    else if (c[0] === 'C') {
      const P = [{ x, y }, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }];
      const l = Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y) + Math.hypot(P[2].x - P[1].x, P[2].y - P[1].y) + Math.hypot(P[3].x - P[2].x, P[3].y - P[2].y);
      const n = Math.max(6, Math.ceil(l / (step / 4)));
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; ring.push({ x: u * u * u * P[0].x + 3 * u * u * t * P[1].x + 3 * u * t * t * P[2].x + t * t * t * P[3].x, y: u * u * u * P[0].y + 3 * u * u * t * P[1].y + 3 * u * t * t * P[2].y + t * t * t * P[3].y }); }
      x = c[5]; y = c[6];
    }
  }
  if (ring.length > 2) rings.push(ring);
  // (evenly spaced along it, so a long straight side counts as straight: its points, and its turn from each to the next)
  const turns = (r: P[], at: number) => {
    const even: P[] = [];
    let left = 0;
    r.forEach((a, i) => {
      const b = r[(i + 1) % r.length], l = Math.hypot(b.x - a.x, b.y - a.y);
      for (; left < l; left += at) even.push({ x: a.x + (b.x - a.x) * left / l, y: a.y + (b.y - a.y) * left / l });
      left -= l;
    });
    const m = even.length, head = even.map((p, i) => Math.atan2(even[(i + 1) % m].y - p.y, even[(i + 1) % m].x - p.x));
    return { even, turn: head.map((h, i) => { const t = head[(i + 1) % m] - h; return t - 2 * Math.PI * Math.round(t / (2 * Math.PI)); }) };
  };
  for (const r of rings) {
    const { even: fe, turn: fine } = turns(r, step / 3), fm = fine.length;
    const kinked = (i: number) => Math.abs(fine[(i + fm) % fm] + fine[(i + 1 + fm) % fm]) > BOX_KINK;
    for (let i = 0; i < fm; i++) if (kinked(i) && !kinked(i - 1)) kinks.push(fe[(i + 1) % fm]);
    const { even, turn } = turns(r, step), m = turn.length, here: P[] = [];
    bends.push(here);
    if (m < 8) continue;
    const bend = turn.map((_, i) => (turn[(i - 2 + m) % m] + turn[(i - 1 + m) % m] + turn[i] + turn[(i + 1) % m]) / 4);
    // (round twice, so the way it bent before its first point is known: each turn the other way read once)
    let last = 0;
    for (let j = 0; j < 2 * m; j++) {
      const b = bend[j % m];
      if (Math.abs(b) < BOX_FLAT) continue;
      if (j >= m && last && Math.sign(b) !== last) here.push(even[j % m]);
      last = Math.sign(b);
    }
  }
  return { bends, kinks };
}
/** How many more bends than `was` (wiggles, of the font's own outline) `now` has round each contour (a bend that only
    moves along it, an S's spine run straight, isn't another: a dent or a wave is two), or all told should the contours
    not be the same ones; and its kinks `was` has none of near (within three steps). None, and the outline is as clean
    as the font's. */
function newWiggles(now: Wiggles, was: Wiggles, unit = 1): number {
  const near = (p: P, qs: P[]) => qs.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 3 * BOX_STEP * unit);
  const more = now.bends.length === was.bends.length ? now.bends.reduce((a, b, r) => a + Math.max(0, b.length - was.bends[r].length), 0)
    : Math.max(0, now.bends.flat().length - was.bends.flat().length);
  return more + now.kinks.filter(p => !near(p, was.kinks)).length;
}

/** A run of the skeleton that turns one way through more than 150°, with the middle and the half widths of its oval;
    for box bowls (boxBowls), also its edge's points, the angle round the oval each of its own stands at (unwound from
    i0), how far along it each lies from i0, which of its ends are a stroke's free end (a C's), not a join, and whether
    it is a whole ring (an O's). */
interface Arc {
  e: number; i0: number; i1: number; cx: number; cy: number; ax: number; ay: number; ease: number; bend: number[];
  pts: SkPt[]; th: number[]; along: number[]; free: [boolean, boolean]; ring: boolean;
  /** at each end, the short strokes that leave its join and end free (a Didone C's beak): none at a free end */ spurs: [number[], number[]];
  /** the join or free end each end runs into (-1 where it ends part way along its edge, an S's halves) */ nodes: [number, number];
  /** a ring run through a join where another stroke leaves it (an e's eye, its tail leaving at the left) */ knot: boolean;
}
/** A letter's bowls as read off it: the arcs on its skeleton, its outline, and for each point of the outline the
    arc it is pushed out from, how much (from 0 where the bowl meets a stem to 1) and at what angle round the oval,
    and the point of the arc's edge nearest it (qi); and the edge of the skeleton nearest every point (near). */
interface BowlScan { arcs: Arc[]; rings: P[][]; how: ({ arc: Arc; w: number; a: number; qi: number } | null)[][]; near: number[][] }
const bowlScans = new WeakMap<Node[][], BowlScan>(), boxScans = new WeakMap<Node[][], BowlScan>();
/** For each letter as Box reads it, how much of its squaring's moves it takes and stays clean, at Corners' squarest,
    uncut and cut all the way by Facets. */
const boxLimits = new WeakMap<BowlScan, Map<string, number>>();

function scanBowls(cs: Node[][], s: Skeleton, least = 150 * Math.PI / 180): BowlScan {
  const arcs: Arc[] = [];
  // (how far each edge's point k is from the next, read once: the walks below add them up step by step)
  const step = s.edges.map(E => E.pts.slice(1).map((q, k) => Math.hypot(q.x - E.pts[k].x, q.y - E.pts[k].y)));
  s.edges.forEach((E, e) => {
    const pts = E.pts, n = pts.length, len = step[e];
    if (n < 6) return;
    // the way it heads at each point, read across a few cells either side and unwound, then split where it turns
    // back the other way by more than a little (a cell-by-cell skeleton turns in steps)
    const w = 5, H: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = pts[Math.max(0, k - w)], b = pts[Math.min(n - 1, k + w)];
      let h = Math.atan2(b.y - a.y, b.x - a.x);
      if (k) { while (h - H[k - 1] > Math.PI) h -= 2 * Math.PI; while (h - H[k - 1] < -Math.PI) h += 2 * Math.PI; }
      H.push(h);
    }
    // how much each point's stretch bends: none along a straight (a D's stem, an e's bar), which stays where it is
    const at = (k: number, d: number) => { let j = k, l = 0; while (j > 0 && j < n - 1 && l < Math.abs(d)) { const q = j + Math.sign(d); l += len[Math.min(j, q)]; j = q; } return j; };
    // (nor round a corner, which turns as far in a short way: a D's stem into its bowl)
    const bend = pts.map((p, k) => {
      const a = at(k, -p.r * 2.5), b = at(k, p.r * 2.5), c = at(k, -p.r * 0.8), d = at(k, p.r * 0.8);
      // (turning on both sides of it: a straight running into a corner turns on one side only)
      return smoothstep((Math.min(Math.abs(H[k] - H[a]), Math.abs(H[b] - H[k])) - 0.08) / 0.1) * (1 - smoothstep((Math.abs(H[d] - H[c]) - 0.5) / 0.3));
    });
    const close = (i0: number, i1: number) => {
      if (Math.abs(H[i1] - H[i0]) < least || i1 - i0 < 5) return;
      // (its oval fitted to the stretches of it that bend)
      const fit = ovalFit(pts.slice(i0, i1 + 1), bend.slice(i0, i1 + 1));
      if (!fit) return;
      const rs = pts.slice(i0, i1 + 1).map(p => p.r).sort((p, q) => p - q);
      const th: number[] = [], along = [0];
      for (let k = i0; k <= i1; k++) {
        let t = Math.atan2((pts[k].y - fit.cy) / fit.ay, (pts[k].x - fit.cx) / fit.ax);
        if (k > i0) {
          const l = th[th.length - 1];
          while (t - l > Math.PI) t -= 2 * Math.PI;
          while (t - l < -Math.PI) t += 2 * Math.PI;
          along.push(along[along.length - 1] + len[k - 1]);
        }
        th.push(t);
      }
      const ring = E.a === E.b && i0 === 0 && i1 === n - 1;
      const free: [boolean, boolean] = [i0 === 0 && s.nodes[E.a].edges.length === 1, i1 === n - 1 && s.nodes[E.b].edges.length === 1];
      // (the strokes off the join an end runs into, where all of them are short, under half the bowl across, and end
      // free: a serif, a beak)
      const spursAt = (at: boolean, v: number) => {
        const xs = at ? s.nodes[v].edges.filter(x => x !== e) : [];
        return xs.length && xs.every(x => { const F = s.edges[x]; return s.nodes[F.a === v ? F.b : F.a].edges.length === 1 && F.len < Math.min(fit.ax, fit.ay); }) ? xs : [];
      };
      const spurs: [number[], number[]] = [spursAt(i0 === 0 && !free[0], E.a), spursAt(i1 === n - 1 && !free[1], E.b)];
      arcs.push({ e, i0, i1, ...fit, ease: rs[rs.length >> 1] * 4, bend, pts, th, along, free, ring, spurs, nodes: [i0 === 0 ? E.a : -1, i1 === n - 1 ? E.b : -1],
        knot: ring && s.nodes[E.a].edges.length > 2 });
    };
    let start = 0, ext = 0, dir = 0;
    for (let k = 1; k < n; k++) {
      const d = H[k] - H[ext];
      if (!dir) { if (Math.abs(H[k] - H[start]) > 0.35) { dir = Math.sign(H[k] - H[start]); ext = k; } continue; }
      if (d * dir > 0) ext = k;
      else if (-d * dir > 0.35) { close(start, ext); start = ext; dir = -dir; ext = k; }
    }
    close(start, n - 1);
  });
  if (!arcs.length) return { arcs, rings: [], how: [], near: [] };
  const rings = inkRings(cs), eased = new Map<Arc, Map<number, number>>(), near = rings.map(() => [] as number[]);
  const how = rings.map((r, ri) => r.map(p => {
    const q = nearestOn(s, p.x, p.y);
    near[ri].push(q ? q.e : -1);
    if (!q) return null;
    const arc = arcs.find(a => a.e === q.e && q.i >= a.i0 && q.i <= a.i1);
    if (!arc) return null;
    // (easing off over two strokes' widths toward where the run starts and ends: a ring has no ends)
    const E = s.edges[arc.e], ring = E.a === E.b && arc.i0 === 0 && arc.i1 === E.pts.length - 1;
    let w = 1;
    if (!ring) {
      // (kept for each skeleton point, as many points of the outline come to the same one)
      if (!eased.has(arc)) eased.set(arc, new Map());
      let ew = eased.get(arc)!.get(q.i);
      if (ew === undefined) {
        let d0 = 0, d1 = 0;
        const len = step[arc.e];
        for (let k = arc.i0 + 1; k <= q.i; k++) d0 += len[k - 1];
        for (let k = q.i + 1; k <= arc.i1; k++) d1 += len[k - 1];
        eased.get(arc)!.set(q.i, ew = smoothstep(Math.min(d0, d1) / arc.ease));
      }
      w = ew;
    }
    w *= arc.bend[q.i];
    const ux = (p.x - arc.cx) / arc.ax, uy = (p.y - arc.cy) / arc.ay;
    return { arc, w, a: Math.atan2(uy, ux), qi: q.i };
  }));
  return { arcs, rings, how, near };
}

/* ---- dots */

/** How round the dots are, from 0 square to 1 round, as the engine draws them (dotRoundOf in font.ts). */
export const dotLook = (e: Effective) => dotRoundOf(e);

/** The contours with their dots (an i's and a j's, the full stops and the rest: a small blob of ink on its own, about
    as wide as it is tall) drawn again as the engine draws a dot as round as `to` asks, where the font's stand for `from`:
    a square as wide as the dot, its corners rounded by as much of half its side. */
export function restyleDots(cs: Node[][], c: RestyleCtx, from: Effective, to: Effective): Node[][] {
  // (the dots as picked are the font's, whatever their shape; picked otherwise, they take the shape asked for)
  if (from.dots === to.dots && Math.abs(dotLook(from) - dotLook(to)) < 1e-4) return cs;
  const round = dotLook(to);
  const rings = inkRings(cs);
  let changed = false;
  const out = rings.map(r => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of r) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const w = x1 - x0, h = y1 - y0, a = Math.abs(signedArea(r));
    // (on its own: no other outline round it or in it; small, and filling much of its box, as a dot does, unlike a comma;
    // and well under the x-height, as a fat face's i's stem, as heavy as it is tall, is not)
    const alone = !rings.some(o => o !== r && o.some(p => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1));
    if (!alone || signedArea(r) < 0 || w > Math.max(c.stem, c.bar) * DOT_MAX || h > Math.max(c.stem, c.bar) * DOT_MAX || Math.max(w, h) > c.xh * 0.5
      || w / h > 1.6 || h / w > 1.6 || a < w * h * 0.6) return r;
    changed = true;
    const side = (w + h) / 2, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hs = side / 2, rr = hs * round;
    return toPolygon(roundContour([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: cx + u * hs, y: cy + v * hs, r: rr })), 0));
  });
  if (!changed) return cs;
  return refit(out);
}

/* ---- cursive flicks */

/** The lowercase Cursive draws a stroke out of, from the foot of the last stem (the engine's footStem in
    glyphs/shared.ts), and those it draws one into, at the top of the first (its entry). */
export const EXIT_LETTERS = 'adhilmnu', ENTRY_LETTERS = 'ijmnpru';

/** The contours with the flicks Cursive draws on the engine's lowercase, as far as `to` asks past `from` (the font's own
    Cursive, nothing for a print face), the engine's own shapes on the font's strokes (glyphs/shared.ts): out of the foot
    of the last stem, an exit stroke that turns along the baseline and flicks up to the right toward the next letter (the
    foot's right half, and its serif there, taken off first), and into the top of the first, an entry stroke rising from
    lower left. They are drawn with the font's stem and hairline, the way the engine's pen draws them. */
export function restyleCursive(cs: Node[][], c: RestyleCtx, from: number, to: number): Node[][] {
  const exit = EXIT_LETTERS.includes(c.ch), into = ENTRY_LETTERS.includes(c.ch);
  if (to <= from + 1e-4 || !(exit || into)) return cs;
  // (the hook's radius as the engine's, from where the font stands; and how joined-up the hand is, past the cursive forms)
  const r = cursiveHookR(c.stem, c.xh, to) - cursiveHookR(c.stem, c.xh, from), k = Math.min(1, Math.max(0, (to - 0.35) / 0.65));
  if (r < 1) return cs;
  const rings = inkRings(cs), ink = shape(rings);
  // the stems: the last run of ink across the x-height a little up from the baseline, the first a little down from its top
  const run = (y: number, last: boolean) => {
    const xs: number[] = [];
    for (const q of rings) for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      if ((a.y <= y) !== (b.y <= y)) xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
    }
    xs.sort((a, b) => a - b);
    return xs.length < 2 ? null : last ? [xs[xs.length - 2], xs[xs.length - 1]] : [xs[0], xs[1]];
  };
  const os = c.cap * 0.014, thin = Math.min(c.bar, c.stem), adds: Pt[][] = [], cuts: Pt[][] = [];
  const pen = (w: number): PenCtx => ({ thick: w, thin: Math.min(w, thin), stress: 0, k: CIRCLE_K, org: 0, terminal: 'flat' });
  const stroke = (cmds: Cmd[], w: number, o: { ws?: number; we?: number }) => {
    const ex = expandStroke(cmds, { s: 'flat', e: 'flat', ...o }, pen(w));
    if (ex) adds.push(...ex.contours);
  };
  if (exit) {
    const st = run(c.xh * 0.3, true), foot = st && run(4, true);
    // (a stem standing on the baseline, its foot under it)
    if (st && foot && foot[0] < (st[0] + st[1]) / 2 && foot[1] > (st[0] + st[1]) / 2) {
      const x = (st[0] + st[1]) / 2, w = st[1] - st[0], yb = -os + thin / 2, e = { x: x + r * 2.3, y: yb + r * 1.2 };
      cuts.push([{ x, y: -c.cap }, { x: x + w / 2 + c.xh * 0.3, y: -c.cap }, { x: x + w / 2 + c.xh * 0.3, y: r + w / 2 }, { x, y: r + w / 2 }]);
      stroke([['M', x, r + w], ['L', x, yb + r], ['vh', x + r, yb], ['C', x + r * 1.55, yb, x + r * 2, yb + r * 0.45, e.x, e.y]], w, { we: 0.75 });
    }
  }
  if (into) {
    const st = run(c.xh * 0.7, false), top = st && run(c.xh - 4, false);
    if (st && top && top[0] < (st[0] + st[1]) / 2 && top[1] > (st[0] + st[1]) / 2) {
      const x = (st[0] + st[1]) / 2, w = st[1] - st[0], re = r * 0.85, y = c.xh - thin / 2;
      const xs = x - re * (1.25 + 0.15 * k), ys = y - re * 0.95 + (Math.min(y - re * 0.95, c.xh * 0.22) - (y - re * 0.95)) * k;
      stroke([['M', xs, ys], ['C', x - re * 0.75 + (xs + (x - xs) * 0.45 - (x - re * 0.75)) * k, y - re * 0.3 + (ys + (y - ys) * 0.7 - (y - re * 0.3)) * k,
        x - re * 0.3, y, x + w * 0.2, y]], w, { ws: 0.7 });
    }
  }
  if (!adds.length) return cs;
  const cut = shape(cuts), add = shape(adds);
  return refit(combine([ink, cut, add], (x, y) => (ink.has(x, y) && !cut.has(x, y)) || add.has(x, y)));
}

/* ---- bowls off their stems */

/** The letters whose bowl Bowl overlap parts from its stem (the engine's b d p q; its single-storey a too, which a free
    font's a can't be told to be). */
export const OVERLAP_LETTERS = 'bdpq';

/** The stem a b d p or q's bowl stands on, where it can be parted from it: its edges (s0, s1) across the middle of the
    x-height, on the left (b p) or the right (d q), and how far its inner edge leans (x along per unit up); null where the
    letter has no straight stem running on past the x-height (a blackletter's round-backed d) or one leaning far over (a
    script's). */
export function bowlStem(cs: Node[][], c: RestyleCtx) {
  if (!OVERLAP_LETTERS.includes(c.ch)) return null;
  const rings = inkRings(cs), left = c.ch === 'b' || c.ch === 'p';
  // (the ink's first run (b p) or last (d q) across a height)
  const run = (y: number, min = 4) => {
    const xs: number[] = [];
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if ((a.y <= y) !== (b.y <= y)) xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
    }
    xs.sort((a, b) => a - b);
    return xs.length < min ? null : left ? [xs[0], xs[1]] : [xs[xs.length - 2], xs[xs.length - 1]];
  };
  const m = run(c.xh * 0.5), a = run(c.xh * 0.4), b = run(c.xh * 0.6), w = m ? m[1] - m[0] : 0;
  if (!m || !a || !b || !(w > 0) || w > c.cap * 0.4) return null;
  // (as wide a little way up and down, and leaning no more than an italic's)
  const inner = left ? 1 : 0, lean = (b[inner] - a[inner]) / (c.xh * 0.2);
  if (Math.abs(a[1] - a[0] - w) > w * 0.3 || Math.abs(b[1] - b[0] - w) > w * 0.3 || Math.abs(lean) > 0.3) return null;
  // (running on up past the x-height (b d) or down past the baseline (p q), as straight)
  const yo = c.ch === 'b' || c.ch === 'd' ? c.xh + c.cap * 0.1 : -c.cap * 0.1, o = run(yo, 2);
  if (!o || Math.abs(o[inner] - (m[inner] + lean * (yo - c.xh * 0.5))) > w * 0.35) return null;
  return { left, s0: m[0], s1: m[1], lean };
}

/** The contours with their bowl drawn apart from its stem as Bowl overlap (`to`) asks, below where the font was picked
    (`from`), as the engine draws it (see bowlGap in glyphs/shared.ts): the stem as the font draws it, cut off at its
    inner edge across the x-height (its ascender or descender and their serifs kept whole), and beside it the font's own
    o (`o`, moved as the letter is), its outer side on the stem's own just below where the font was picked, a whole o
    standing on the stem, and moved off it as the slider goes down, to clear of it by most of a stem at 0. */
export function restyleOverlap(cs: Node[][], c: RestyleCtx, from: number, to: number, o: Node[][] | null): Node[][] {
  if (!o || to >= from - 1e-4) return cs;
  const st = bowlStem(cs, c);
  if (!st) return cs;
  const rings = inkRings(cs), ink = shape(rings), { left, s0, s1, lean } = st, w = s1 - s0, ym = c.xh * 0.5;
  // the bowl's band, from under the baseline's overshoot to over the x-height's, cut away on the bowl's side of the stem
  const lo = -c.cap * 0.05, hi = c.xh + c.cap * 0.05, far = c.cap * 3;
  // (along the stem's inner edge, as it leans)
  const at = (x: number, y: number) => x + lean * (y - ym);
  const band = shape([left ? [{ x: at(s1, lo), y: lo }, { x: far, y: lo }, { x: far, y: hi }, { x: at(s1, hi), y: hi }]
    : [{ x: -far, y: lo }, { x: at(s0, lo), y: lo }, { x: at(s0, hi), y: hi }, { x: -far, y: hi }]]);
  // the o: its outer side from the stem's outer side (standing on it) to most of a stem clear of its inner side
  const oRings = inkRings(o);
  let o0 = Infinity, o1 = -Infinity;
  for (const r of oRings) for (const p of r) { o0 = Math.min(o0, p.x); o1 = Math.max(o1, p.x); }
  const u = Math.max(0, to / Math.max(1e-4, from)), dx = left ? s0 + (s1 + 0.9 * w - s0) * (1 - u) - o0 : s1 - (s1 - (s0 - 0.9 * w)) * (1 - u) - o1;
  const oShape = shape(oRings.map(r => r.map(p => ({ x: p.x + dx, y: p.y }))));
  return refit(combine([ink, band, oShape], (x, y) => (ink.has(x, y) && !band.has(x, y)) || oShape.has(x, y)));
}

/* ---- peaks */

/** The letters whose diagonals can meet in a peak on a line (the top of an A, the foot of a V), which Peaks reshapes:
    skinFollows (skin.ts) shows Peaks reaching only these, and restylePeaks leaves any other letter be (a b's slanted
    ascender, a y's looped tail or a Q's tail stand on a line between slanting sides too). */
export const PEAK_LETTERS = 'AMNVWXYvwxyz47';

/** A peak Peaks reshapes: where it stands across (x), which way it faces out of its line (out) and the line's height
    (top), how far it moves out (s), the tip the strokes' outer edges make past it, its flat's width and the slant of
    its sides. */
interface Peak { x: number; out: number; top: number; s: number; tip: P[]; w0: number; tanHalf: number }
/** The peaks of a letter's ink (inkRings) that Peaks moved from `from` to `to` reshapes, with the ink's lowest and
    highest points. */
function peaksOf(rings: P[][], c: RestyleCtx & { lines: number[] }, from: number, to: number): { peaks: Peak[]; y0: number; y1: number } {
  const band = c.cap * ON_LINE, reach = c.stem * 2.2, inkShape = shape(rings);
  let y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const peaks: Peak[] = [];
  for (const r of rings) {
    const n = r.length;
    for (const L of c.lines) for (const out of [1, -1]) {
      // the stretches of the outline at the line, facing out of it
      const near = r.map(p => (out > 0 ? p.y > L - band : p.y < L + band));
      for (let i = 0; i < n; i++) {
        if (!near[i] || near[(i - 1 + n) % n]) continue;
        let j = i; while (near[(j + 1) % n] && j - i < n) j++;
        const a = r[i], b = r[j % n];
        // its sides: the outline either way from it, a little way on, straight and slanting away from each other
        const away = (k: number, dir: number) => { let l = 0, q = k; while (l < reach) { const nq = (q + dir + n) % n; l += Math.hypot(r[nq].x - r[q].x, r[nq].y - r[q].y); q = nq; if (q === k) break; } return r[q]; };
        const pa = away(i, -1), pb = away(j % n, 1);
        const da = { x: pa.x - a.x, y: pa.y - a.y }, db = { x: pb.x - b.x, y: pb.y - b.y };
        if (da.y * out >= 0 || db.y * out >= 0) continue;
        // (each side a straight stroke's edge all that way: not a curve, as a script v's round foot is)
        const straight = (k: number, dir: number, to: P) => {
          const l = Math.hypot(to.x - r[k].x, to.y - r[k].y) || 1;
          for (let q = k; r[q] !== to; q = (q + dir + n) % n) {
            if (Math.abs((r[q].x - r[k].x) * (to.y - r[k].y) - (r[q].y - r[k].y) * (to.x - r[k].x)) / l > Math.max(2, l * 0.04)) return false;
            if (q === (k - dir + n) % n) break;
          }
          return true;
        };
        if (!straight(i, -1, pa) || !straight(j % n, 1, pb)) continue;
        const sa = Math.abs(da.x / da.y), sb = Math.abs(db.x / db.y);
        if (sa < 0.12 || sb < 0.12 || sa > 3 || sb > 3 || Math.sign(da.x) === Math.sign(db.x)) continue;
        const w0 = Math.abs(b.x - a.x);
        if (w0 > c.stem * 2.5) continue;
        // where the outer edges meet, past the font's own top; and how far the peak moves out for its flat to be as wide
        const P = meet(pa, a, pb, b);
        if (!P || (P.y - L) * out < -band) continue;
        let top = out > 0 ? -Infinity : Infinity, xs = 0, cnt = 0;
        for (let k = i; k <= j; k++) { const p = r[k % n]; top = out > 0 ? Math.max(top, p.y) : Math.min(top, p.y); xs += p.x; cnt++; }
        // (standing on the line itself, ink under it: not a crotch somewhere under it, nor a counter's top)
        if (Math.abs(top - L) > band || !inkShape.has(xs / cnt, top - out * 3)) continue;
        // (the flat top as wide as the engine's: its point reaches peakPast, 1.5 stems a unit of Peaks, past the line and
        // is cut off there, glyphs/turns.ts)
        const tanHalf = (sa + sb) / 2, w1 = Math.max(0, w0 + 3 * (to - from) * c.stem * tanHalf);
        const span = out > 0 ? top - y0 : y1 - top;
        // (no further than most of a stroke's width, so the crotch under a heavy peak stays in the letter)
        const most = Math.min(span * 0.3, c.stem * 0.8), sh = Math.max(-most, Math.min(most, (w1 - w0) / (2 * Math.max(0.1, tanHalf))));
        const x = xs / cnt;
        if (Math.abs(sh) > 0.5 && !peaks.some(k => k.out === out && Math.abs(k.x - x) < c.stem && Math.abs(k.top - top) < band)) peaks.push({ x, out, top, s: sh, tip: [a, P, b], w0, tanHalf });
      }
    }
  }
  return { peaks, y0, y1 };
}

/** Whether letter `c.ch` drawn as `cs` has a peak Peaks reshapes: a point where two straight diagonals meet on a line.
    A blackletter's or a script's letters, their strokes broken or curving into one another, have none. */
export const hasPeaks = (cs: Node[][], c: RestyleCtx & { lines: number[] }) => PEAK_LETTERS.includes(c.ch) && peaksOf(inkRings(cs), c, 0, 1).peaks.length > 0;

/** The contours with the peaks of their diagonals (the top of an A, the foot of a V, a W's and an M's points) as
    pointed or flat as `to` (Peaks, 0 pointed to 1 flat) asks, where they stand as the font draws them for `from`, as the
    engine draws them (see zig in glyphs/shared.ts): the outer edges of the two strokes are carried on to where they
    meet, the peak is moved out past the line (or back in) so they cross it as far apart as the flat top is to be wide,
    and it is cut off at the line where the font's own stood. The move eases off along the strokes, evenly, so they
    stay straight. */
export function restylePeaks(cs: Node[][], c: RestyleCtx & { lines: number[] }, from: number, to: number): Node[][] {
  if (Math.abs(from - to) < 1e-4 || !PEAK_LETTERS.includes(c.ch)) return cs;
  const rings = inkRings(cs), { peaks, y0, y1 } = peaksOf(rings, c, from, to);
  if (!peaks.length) return cs;
  // the tips filled in, then everything moved out by as much as it stands near the peak, less further down the letter
  const tipped = shape([...rings, ...peaks.map(p => p.tip)]), filled = combine([tipped], tipped.has);
  const moved = filled.map(r => r.map(p => {
    let dy = 0;
    for (const k of peaks) {
      // (only the two strokes that make the peak: inside the wedge their outer edges make, widening away from it;
      // the tip filled in past the line moves on as they do, further, so its edges carry on theirs straight)
      const span = k.out > 0 ? k.top - y0 : y1 - k.top, back = (k.top - p.y) * k.out, fy = Math.max(0, 1 - back / Math.max(1, span));
      const half = k.w0 / 2 + Math.max(0, back) * k.tanHalf + c.stem * 0.4, fx = 1 - smoothstep((Math.abs(p.x - k.x) - half) / (c.stem * 0.4));
      dy += k.out * k.s * fy * fx;
    }
    return { x: p.x, y: p.y + dy };
  }));
  // and cut off where the font's own peak stood, across the peak alone (as wide as the moved wedge reaches past the line)
  const cuts = peaks.map(k => {
    const a2 = k.top, b2 = k.top + k.out * c.cap, Rx = k.w0 / 2 + Math.abs(k.s) * k.tanHalf + c.stem * 1.2;
    return [{ x: k.x - Rx, y: a2 }, { x: k.x + Rx, y: a2 }, { x: k.x + Rx, y: b2 }, { x: k.x - Rx, y: b2 }];
  });
  const ink = shape(moved), cut = shape(cuts);
  return refit(combine([ink, cut], (x, y) => ink.has(x, y) && !cut.has(x, y)));
}
