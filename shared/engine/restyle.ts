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
import { bowlK, bowlOrg, cursiveHookR, dotRoundOf, innerRoundR, roundnessR, stencilOff, termSpec, type Effective } from './font';
import { endReach, onEndScale } from '../params';
import { fitOutline, type Node } from './outline';
import { CIRCLE_K, lerp, roundContour, signedArea, smoothstep } from './geom';
import { bez, branches, endFace, inkAt, inkGrid, joinsOf, leaving, nearestOn, roundTip, type Branch, type Grid, type Join, type SkPt, type Skeleton } from './scan';
import { STEP_DEPTH, buildSerif, expandStroke, serifCup, serifSides, termCap, termDropBack } from './stroke';
import { crotchShare, innerShare, joinR } from './joins';
import { combine, shape } from './boolean';
import type { Cmd, PenCtx, Pt, SerifSides, SerifSpec, TermSpec } from './types';

type P = { x: number; y: number };

/** What a letter's restyling needs to know of it, in the font's units. */
export interface RestyleCtx {
  ch: string; cap: number; xh: number;
  /** its upright strokes' thickness, and its level ones' */ stem: number; bar: number;
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
    if (a.ox === undefined && b.ix === undefined) continue;
    let len = 0, q = bez(a, b, 0);
    for (let k = 1; k <= 16; k++) { const r = bez(a, b, k / 16); len += Math.hypot(r.x - q.x, r.y - q.y); q = r; }
    const n = Math.max(2, Math.ceil(len / step));
    for (let k = 1; k < n; k++) pts.push(bez(a, b, k / n));
  }
  return pts;
}

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
    const p0 = s[(a - 1 + n) % n], pin = s[(a - 3 + n) % n], p1 = s[(b + 1) % n], pout = s[(b + 3) % n];
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
/** The inside corners of a contour's corners (in any order) that follow each other closer than `gap` along it, with
    no other corner between, made one: a crotch a font draws rounded (cornersOf reads a round turning past 120° as
    its two halves) or cut across in facets (Turnpike's) is one crotch to round. In the contour's order. */
function crotchesOf(s: S[], corners: Corner[], gap: number): Corner[] {
  const n = s.length, ks = corners.slice().sort((a, b) => a.i0 - b.i0);
  const span = (i: number, j: number) => { let l = 0; for (let k = i; k !== j; k = (k + 1) % n) l += s[k].len; return l; };
  const sideIn = (i: number): [P, P] => s[i].kink ? [s[(i - 1 + n) % n], s[i]] : [s[(i - 3 + n) % n], s[(i - 1 + n) % n]];
  const sideOut = (i: number): [P, P] => s[i].kink ? [s[i], s[(i + 1) % n]] : [s[(i + 1) % n], s[(i + 3) % n]];
  const out: Corner[] = [];
  for (const k of ks) {
    const last = out[out.length - 1];
    if (last && !last.convex && !k.convex && span(last.i1, k.i0) < gap) {
      const v = meet(...sideIn(last.i0), ...sideOut(k.i1));
      let turn = 0, len = 0;
      for (let j = last.i0; ; j = (j + 1) % n) { turn += s[j].turn; if (j === k.i1) break; len += s[j].len; }
      // (as long as they close into a point near them, not a slot's two square corners, whose sides run on side by side)
      const near = (p: P) => Math.hypot(p.x - v!.x, p.y - v!.y) < gap * 4;
      if (v && turn < 0 && Math.PI + turn > CROTCH_MIN && near(s[last.i0]) && near(s[k.i1])) { out[out.length - 1] = { v, i0: last.i0, i1: k.i1, turn, r: len / Math.max(0.05, -turn), convex: false }; continue; }
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
  const stepAmt = added(from.step, to.step), thin = Math.min(c.stem, c.bar);
  const out: Node[][] = [];
  let changed = false;
  for (const ring of inkRings(cs)) {
    const s = annotate(ring);
    if (s.length < 3) continue;
    // (a run of inside corners close together as one crotch, while Joins or Counters asks for rounder ones)
    const found = cornersOf(s, Math.max(6, c.stem * 0.6));
    const corners = to.inner > from.inner || to.join > from.join ? crotchesOf(s, found, c.stem * 0.6) : found;
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
    const wide = (k: Corner) => {
      const a = out1(k.i0, -1), p = s[k.i0], q = s[k.i1], b = out1(k.i1, 1);
      const ux = p.x - a.x, uy = p.y - a.y, vx = b.x - q.x, vy = b.y - q.y;
      if (Math.hypot(ux, uy) < 0.5 || Math.hypot(vx, vy) < 0.5) return Math.PI - Math.abs(k.turn);
      return Math.PI - Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
    };
    // each corner's radius (and step) as asked for
    const plan = corners.map(k => {
      let r = k.r, step = 0;
      if (k.convex) {
        r = Math.max(0, k.r + to.round - from.round);
        // a square corner (between 70° and 110°) steps back, as far as most of the thinner stroke's thickness
        if (stepAmt > 0 && Math.abs(Math.abs(k.turn) - Math.PI / 2) < 0.35) step = stepAmt * STEP_DEPTH * thin;
      } else {
        // inside corners only round further: a square or open one by Counters, a narrow crotch by Joins, split by
        // how wide it is as the engine's are (innerShare, crotchShare)
        const ang = wide(k), inner = Math.max(0, to.inner - from.inner) * innerShare(ang);
        const join = Math.max(0, to.join - from.join) * crotchShare(ang);
        r = Math.max(k.r, k.r + Math.max(inner, join));
        // and as far as the sliders at their top would round it, so a corner with less room than that rounds a share
        // of it (below), as an engine's join does, and keeps rounding all the way to the top
        const full = Math.max(innerRoundR(1, c.cap) - from.inner, 0) * innerShare(ang), fullJoin = Math.max(joinR(1, c.stem) - from.join, 0) * crotchShare(ang);
        return { k, r, step, full: k.r + Math.max(full, fullJoin), redo: Math.abs(r - k.r) > 0.5 };
      }
      return { k, r, step, full: r, redo: Math.abs(r - k.r) > 0.5 || step > 0 };
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
    const straight = (i: number, dir: 1 | -1) => {
      const n = s.length, a = s[i], b = s[(i + dir + n) % n], ux = (b.x - a.x), uy = (b.y - a.y), lu = Math.hypot(ux, uy) || 1;
      let len = 0;
      for (let k = 0; k < n - 1; k++) {
        const p = s[(i + dir * k + n * (k + 1)) % n], q = s[(i + dir * (k + 1) + n * (k + 1)) % n], l = Math.hypot(q.x - p.x, q.y - p.y);
        if (l > 0 && ((q.x - p.x) * ux + (q.y - p.y) * uy) / (l * lu) < Math.cos(0.4)) break;
        len += l;
      }
      return len;
    };
    plan.forEach((p, j) => {
      if (plan.length < 2 || p.r <= p.k.r) return;
      const J = plan.length, prev = (pos[j] - pos[(j - 1 + J) % J] + total) % total || total, next = (pos[(j + 1) % J] - pos[j] + total) % total || total;
      const room = Math.min(0.45 * Math.min(prev, next), 0.9 * straight((p.k.i0 - 1 + s.length) % s.length, -1), 0.9 * straight((p.k.i1 + 1) % s.length, 1));
      const most = room / Math.tan(Math.min(Math.abs(p.k.turn), 2.6) / 2);
      p.r = p.k.convex || p.full <= most ? Math.max(p.k.r, Math.min(p.r, most)) : p.k.r + (p.r - p.k.r) * Math.max(0, most - p.k.r) / (p.full - p.k.r);
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
    usual half-thickness back from its end, and how far the ink reaches on past the skeleton's tip. */
interface End { pts: SkPt[]; body: number; reach: number }

/** The free ends of a letter's strokes that the engine's letters give a styled end (a terminal): the ends
    of strokes that curve (c, e, s, the hook of an a, f, j, r, t, the tail of a J), not a stem's, an arm's,
    a diagonal's or a serif's straight end, nor a dot. `g`, the letter's ink, is read for how far the ink reaches
    on past each end; without it each end's `reach` is 0 (enough to tell whether there are any). */
function terminalEnds(sk: Skeleton, g?: Grid): End[] {
  const out: End[] = [];
  sk.nodes.forEach((n, ni) => {
    if (n.edges.length !== 1) return;
    const E = sk.edges[n.edges[0]];
    if (E.a === E.b) return;
    const pts = E.a === ni ? E.pts : E.pts.slice().reverse();
    // its usual half-thickness: the middle of the skeleton's, past the end itself
    const arc = arcOf(pts);
    // (read near the end: a high-contrast stroke is much heavier round its middle than out at its ends)
    const med = (lo: number, hi: number) => { const rs = pts.filter((_, k) => arc[k] >= lo && arc[k] <= hi).map(p => p.r).sort((a, b) => a - b); return rs.length ? rs[rs.length >> 1] : 0; };
    const b0 = med(n.r * 2, Infinity) || n.r, body = med(b0 * 1.5, b0 * 4) || b0;
    if (E.len < body * 2.5) return;
    // it curves, right on out to its end: the way it heads at its tip, a little way back and further back all
    // differ (not a straight bar turning a corner into another stroke, as G's)
    const at = (a: number) => indexAt(arc, a);
    const d0 = dirAlong(pts, 0, at(body * 1.5)), dm = dirAlong(pts, at(body * 1.5), at(body * 3)), d1 = dirAlong(pts, at(body * 3), at(body * 5));
    // (and further back too: a straight stem or arm only seems to curve at its end, where its skeleton runs off into
    // the sharper corner of an end cut on a slant, an italic stem's)
    if (d0.x * d1.x + d0.y * d1.y > Math.cos(15 * Math.PI / 180) || d0.x * dm.x + d0.y * dm.y > Math.cos(4 * Math.PI / 180)
      || dm.x * d1.x + dm.y * d1.y > Math.cos(4 * Math.PI / 180)) return;
    // (and curves from its tip on: a heavy stem's foot or top, drawn round, runs dead straight for its first two
    // thicknesses before the look further on reaches the arch it rises into; and a bar or a spur that runs straight
    // for a thickness and then turns a corner, a G's, is no curving end either)
    const way = Array.from({ length: 6 }, (_, k) => dirAlong(pts, at(body * k / 2), at(body * (k + 1) / 2)));
    const turn = (a: P, b: P) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) * 180 / Math.PI;
    if (turn(way[0], way[1]) <= 5 && (turn(way[0], way[3]) < 8 || way.slice(1, 5).some((w, k) => turn(w, way[k + 2]) > 25))) return;
    const dir = { x: -d0.x, y: -d0.y };
    let reach = 0;
    if (g) while (reach < body * 4 && inkAt(g, n.x + dir.x * (reach + 1), n.y + dir.y * (reach + 1))) reach += 1;
    out.push({ pts, body, reach });
  });
  return out;
}
/** Whether a letter has a stroke end the engine's letters give a styled end (see terminalEnds). */
export const hasTerminals = (sk: Skeleton) => terminalEnds(sk).length > 0;

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
  const restyle = endLook(from) !== endLook(to), moves = endMoves(c, from, to);
  if (!restyle && !moves) return cs;
  const g = inkGrid(cs, 2), ends = terminalEnds(sk(), g);
  if (!ends.length) return cs;
  const T = termSpec(to), top = termSpec({ ...to, terminalSize: 1, terminalFlare: 1, terminalPoint: 1, terminalSlope: 1 });
  const rings = inkRings(cs);
  // (the middle of the letter's ink)
  const xs = rings.flat().map(q => q.x), ys = rings.flat().map(q => q.y);
  const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  for (const end of ends) {
    const { pts, body } = end, arc = arcOf(pts);
    // how much longer (or shorter) the end is drawn, and how much further round it bends, by the radius it curves at
    const kEnd = endCurvature(pts, arc, body), mv = moves ? moves(end, kEnd) : { len: 0, bend: 0 };
    if (!restyle && Math.abs(mv.len) < 0.5 && Math.abs(mv.bend) < 0.005) continue;
    const left = (d: P) => ({ x: -d.y, y: d.x });
    /** the end drawn again as `plan` has it, on whichever ring holds the stroke's two sides there ('done', or left as
        the font draws it); 'nearer' where those sides, walked out from S, don't both run on to its end (one stops at a
        corner where another stroke meets it); 'none' where no ring has the stroke's two sides at S */
    const redraw = (plan: EndPlan): 'done' | 'nearer' | 'none' => {
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
        if (endPath[endPath.length - 1] !== ring[cb.i] || arcLen(endPath) > 2 * (plan.atS + end.reach) + 6 * body) continue;
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
              if (pastE(q) && vx * way.x + vy * way.y < 0.5) break;
            }
            out.push(q);
          }
          return out;
        };
        const A0 = walk(endPath, ca), B0 = walk(endPath.slice().reverse(), cb);
        if (A0.length < 2 || B0.length < 2) continue;
        // (one side stopping far short of the other: S is back past where another stroke meets this one)
        const la = arcLen(A0), lb = arcLen(B0);
        if (Math.min(la, lb) < Math.max(la, lb) * 0.35 && Math.abs(la - lb) > body * 3) return 'nearer';
        // the rest of the ring, from B's crossing on round to A's
        const rest: P[] = [];
        for (let k = (cb.i + 1) % n, step = 0; step < n; k = (k + 1) % n, step++) { rest.push(ring[k]); if (k === ca.i) break; }
        // the engine's end drawn across the font's sides, as big as the room the font's own end left it, or (only Length,
        // Curl, Tails & hooks or Openness moved) the font's own carried on
        const drawn = restyle ? fittedEnd(plan, end, A0, B0, to, T, top, c.xh, mid, endPath, roomAround(rings, ri, rest, body * 1.6)) : carryEnd(plan, endPath, A0, B0);
        // (an end with no room for even the least of the engine's, as a heavy letter's in a narrow opening, is left as the
        // font draws it)
        if (!drawn) return 'done';
        // the font's end out, the new one in, between the two crossings
        const spliced = [...drawn.slice(1, -1), { x: cb.x, y: cb.y }, ...rest, { x: ca.x, y: ca.y }];
        // (a new end of the engine's that takes away or adds far more ink than an end has was drawn on the wrong
        // stretch: left be)
        if (restyle) {
          const was = Math.abs(signedArea(ring)), now = Math.abs(signedArea(spliced));
          if (Math.abs(now - was) > Math.min(4 * body * (plan.atS + body * 3), was * 0.35)) return 'done';
        }
        rings[ri] = fwd ? spliced : spliced.reverse();
        return 'done';
      }
      return 'none';
    };
    // (drawn again from as far back as the end reaches while the stroke runs alone; where no stroke sides are found
    // there, as by a teardrop hanging beside its neck, which reads as another stroke, from as far back as it reaches;
    // and where its sides from there don't both run on out to its end, from nearer its tip)
    for (let tries = 0, cap = Infinity, alone = true; tries < 4; tries++) {
      const plan = measureEnd(end, arc, kEnd, mv, to, T, alone ? (p, d) => widthAcross(rings, p, left(d), body * 4) : null, cap);
      const got = redraw(plan);
      if (got === 'done' || (got === 'none' && !alone)) break;
      if (got === 'none') alone = false;
      else if (plan.atS < body * 2) break;
      else cap = plan.atS * 0.7;
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
    alone. */
function measureEnd(end: End, arc: number[], kEnd: number, mv: { len: number; bend: number }, to: Effective, T: TermSpec, across: ((p: P, d: P) => number) | null, cap = Infinity): EndPlan {
  const { pts, body } = end, total = arc[arc.length - 1], t0 = body * 2;
  // the font's own end: as far back as its thickness strays from the stroke's (a ball, a flare, a taper)
  // (only the stretch from its tip on in, while it stays so)
  let zone = body * 1.1;
  for (let k = 0; k < pts.length && arc[k] < Math.min(total * 0.4, body * 5); k++) {
    if (Math.abs(pts[k].r / body - 1) > 0.25) zone = Math.max(zone, arc[k] + body * 0.3);
    else if (arc[k] > zone) break;
  }
  const shaped = zone > body * 1.4;
  // how far back the engine's end reaches: a taper and a flare run back along the stroke
  const tapers = to.terminal === 'tapered', flares = to.terminal === 'flat' && T.form === 'flared';
  const runBack = tapers ? Math.max(1, Math.min(total * Math.min(0.85, 0.15 * T.taper), t0 * T.taper)) : flares ? Math.max(1, Math.min(total * 0.45, t0 * 3)) : 0;
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
  const sAt = Math.min(alone, Math.max(zone + body * 0.6, runBack + body * 0.3, -mv.len + body * 1.2));
  // (a shorter end is cut back no further than the stretch drawn again)
  const len = Math.max(mv.len, -(sAt - body * 0.8));
  const kS = indexAt(arc, sAt), kE = indexAt(arc, Math.min(zone, sAt - 2));
  // the cross-sections where the new end starts (S) and where a ball or a flare of the font's begins (E)
  const S = pts[kS], dS0 = dirAlong(pts, Math.max(0, kS - 2), Math.min(pts.length - 1, kS + 2)), outS = { x: -dS0.x, y: -dS0.y };
  const E = pts[kE], dE0 = dirAlong(pts, Math.max(0, kE - 2), Math.min(pts.length - 1, kE + 2));
  return { S, atS: arc[kS], dS0, outS, E, atE: arc[kE], dE0, way: { x: -dE0.x, y: -dE0.y }, shaped, tapers, flares, runBack, len, bend: mv.bend, kEnd };
}

/** The shares along a stroke end's two sides at which they are paired, to be drawn again. */
const END_SHARES = Array.from({ length: 41 }, (_, i) => i / 40);

/** The font's own end, carried on out (or back) along the stroke and bent round as asked: its sides as drawn (A0
    and B0, walked out from S), drawn on, and the cap across them (round, cut, a ball) as the font draws it, moved
    with them; one polygon from A's start round to B's. */
function carryEnd(plan: EndPlan, endPath: P[], A0: P[], B0: P[]): P[] {
  const ia = A0.length - 1, ib = B0.length - 1;
  const capPath = endPath.slice(Math.max(0, ia - 1), endPath.length - Math.max(0, ib - 1));
  const As0 = atShares(A0, END_SHARES), Bs0 = atShares(B0, END_SHARES), [As, Bs, frame] = reshapeEnd(As0, Bs0, plan.len, plan.bend, plan.kEnd);
  const cap = capPath.filter(q => !(onSegs(q, A0) || onSegs(q, B0))).map(frame);
  return [...As, ...cap, ...Bs.slice().reverse()];
}

/** The engine's end of the kind `to` picks (T its spec), drawn across a stroke's sides as the font draws them (A0
    and B0, walked out from S); one polygon from A's start round to B's. */
function engineEnd(plan: EndPlan, end: End, A0: P[], B0: P[], to: Effective, T: TermSpec, mid: P): Pt[] {
  const { body } = end, { E, way, shaped, tapers, flares, runBack, len, bend, kEnd, dS0, dE0 } = plan;
  // the end, square across the stroke where its two sides reach on average (out to its tip, past a ball)
  const proj = (q: P) => (q.x - E.x) * way.x + (q.y - E.y) * way.y;
  const reach = shaped ? Math.min(end.reach, body * 1.05) + plan.atE : Math.max(0, (proj(A0[A0.length - 1]) + proj(B0[B0.length - 1])) / 2);
  const toPlane = (side: P[]): P[] => {
    const out: P[] = [side[0]];
    for (let k = 1; k < side.length; k++) {
      if (proj(side[k]) >= reach && proj(side[k - 1]) < reach) { const a = proj(side[k - 1]), b = proj(side[k]), f = (reach - a) / (b - a || 1); out.push({ x: side[k - 1].x + (side[k].x - side[k - 1].x) * f, y: side[k - 1].y + (side[k].y - side[k - 1].y) * f }); return out; }
      out.push(side[k]);
    }
    const last = out[out.length - 1], more = reach - proj(last);
    if (more > 0.5) out.push({ x: last.x + way.x * more, y: last.y + way.y * more });
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
  const pen: PenCtx = { thick: tt, thin: tt, stress: 0, k: CIRCLE_K, org: 0, terminal: to.terminal, term: T };
  const Ap: Pt[] = As.map(q => ({ ...q, smooth: true })), Bp: Pt[] = Bs.map(q => ({ ...q, smooth: true }));
  Ap[0].smooth = Bp[0].smooth = false;
  const capPts = termCap(Ap, Bp, p, out2, tt, pen, outerIsA);
  return toPolygon(roundContour([...Ap, ...capPts, ...Bp.slice().reverse()], 0));
}

/** How near the engine's end may come to the rest of the letter: ROOM_KEEP of as near as the font's own end came,
    though never kept further off than ROOM_MAX of a stroke's width (two of `body`); a drop or a point that came nearer
    would close a heavy letter's opening (a C into an O, an s into an 8) or run into its bowl. */
const ROOM_KEEP = 0.75, ROOM_MAX = 0.6;
/** The smallest drop the engine draws, in the stroke's thickness (dropR in stroke.ts). */
const DROP_MIN = 0.525;
/** How far past its stroke an end may reach (a drop's bulge, a point, a flare's two sides together, a slant), as a
    share of the x-height: a heavy stroke's end reaches out about as far as a light one's does, not as far again for
    its thickness, so a drop on a bold c stays a drop, not a blob. */
const REACH_X = 0.12;
/** The kinds of end that reach out past their stroke, and the part of TermSpec that sets how far. */
const REACHING = (to: Effective, T: TermSpec): 'size' | 'flare' | 'point' | 'slope' | null =>
  to.terminal === 'round' ? (T.form === 'droplet' || T.form === 'ball' ? 'size' : null) : to.terminal === 'flat' ? (T.form === 'flared' ? 'flare' : null)
    : to.terminal === 'sharp' ? 'point' : to.terminal === 'angled' ? 'slope' : null;

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
    rest of the letter (`near`, see roomAround) than the font's own end (`own`) allows; null where even the least of it
    comes too near. */
function fittedEnd(plan: EndPlan, end: End, A0: P[], B0: P[], to: Effective, T: TermSpec, top: TermSpec, xh: number, mid: P, own: P[], near: (q: P, max: number) => number): Pt[] | null {
  const step = Math.max(1.5, end.body * 0.1);
  /** the nearest the rest of the letter comes to a polyline, read no further than `max` */
  const gap = (line: P[], max: number) => {
    let best = max;
    for (let i = 0; i < line.length - 1 && best > 0; i++) {
      const a = line[i], b = line[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let k = 0; k < n && best > 0; k++) best = near({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }, best);
    }
    return best;
  };
  const need = Math.min(gap(own, end.body * 4) * ROOM_KEEP, end.body * 2 * ROOM_MAX), fits = (l: P[]) => need < 1 || gap(l, need) >= need;
  const k = REACHING(to, T);
  if (!k) { const d = engineEnd(plan, end, A0, B0, to, T, mid); return fits(d) ? d : null; }
  // how much of its most the end at the top of its slider has room for
  const t = end.body * 2, atTop = (f: number) => engineEnd(plan, end, A0, B0, to, reachT({ ...T, [k]: top[k] }, top, k, t, xh, f), mid);
  let room = 1;
  if (!fits(atTop(1))) {
    if (!fits(atTop(0))) return null;
    let lo = 0, hi = 1;
    for (let i = 0; i < 5; i++) { const f = (lo + hi) / 2; if (fits(atTop(f))) lo = f; else hi = f; }
    room = lo;
  }
  const d = engineEnd(plan, end, A0, B0, to, reachT(T, top, k, t, xh, room), mid);
  return fits(d) ? d : null;
}

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
    length; and the move that carries what stood at its end (its cap) to where its end now is. */
function reshapeEnd(As: P[], Bs: P[], len: number, bend: number, k: number): [P[], P[], (q: P) => P] {
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
  let pos = { ...c[0] }, endA = aEnd;
  for (let j = 0; j <= M; j++) {
    const t = L2 * j / M, add = bend * (t / L2) ** 2;
    if (j > 0) {
      const tm = L2 * (j - 0.5) / M, { a } = at(tm), am = a + bend * (tm / L2) ** 2, st = L2 / M;
      pos = { x: pos.x + Math.cos(am) * st, y: pos.y + Math.sin(am) * st };
    }
    const { a, hw } = at(t), w = rot(hw, add);
    As2.push({ x: pos.x + w.x, y: pos.y + w.y }); Bs2.push({ x: pos.x - w.x, y: pos.y - w.y });
    if (j === M) endA = a + add;
  }
  const end = pos, turn = endA - aEnd, from = c[N];
  return [As2, Bs2, (q: P) => { const v = rot({ x: q.x - from.x, y: q.y - from.y }, turn); return { x: end.x + v.x, y: end.y + v.y }; }];
}

/** Whether q lies on the polyline (within half a unit). */
const onSegs = (q: P, line: P[]) => line.some((a, i) => {
  const b = line[i + 1]; if (!b) return Math.hypot(q.x - a.x, q.y - a.y) < 0.5;
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(q.x - a.x - dx * t, q.y - a.y - dy * t) < 0.5;
});

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

/** Everything about a serif but its length (which a font's own serifs follow on their skeletons, see skin.ts). */
export const serifLook = (sf: SerifSpec | null | undefined) => (sf ? JSON.stringify({ ...sf, len: 0 }) : '');

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
      const from = f.width / 2 + 2;
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
    at both ends, or, run through, cuts the strokes it meets above and below it. */
export function restyleStencil(cs: Node[][], c: RestyleCtx, from: StencilLook, to: StencilLook, sk: SkeletonOf): Node[][] {
  const v = added(from.gap, to.gap), bv = added(from.bar, to.bar);
  if (!(v > 0) && !(bv > 0)) return cs;
  // (a gap as wide as the engine's, joinGap in shared/params/scales.ts with its 24 units as many of a cap height of 700,
  // moved out as far, stencilOff in font.ts)
  const s = sk(), stem = c.stem, gapOf = (k: number) => k * (24 * c.cap / 700 + 2 * stem), off = stencilOff(to.pos, stem, c.xh);
  const bands: Pt[][] = [];
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
    return { d, r, at: dn < 0.2 ? half : Math.max(...[1, -1].map(o => (half - o * r * (px * nx + py * ny)) / dn)) };
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
      // (a bar joined at both ends opens at the end further left, or up)
      if (bar && ends.some(k => k !== ji && (hosts[k].n.x < h.n.x - 1 || (Math.abs(hosts[k].n.x - h.n.x) <= 1 && hosts[k].n.y > h.n.y)))) return;
      const b2 = across(ji, br, h.half + off, h.half + off + gapOf(v));
      if (b2) bands.push(b2);
    });
  });
  // a ring on its own (an o, a 0), cut down its middle
  if (v > 0) s.edges.forEach(E => {
    if (E.a !== E.b || s.nodes[E.a].edges.length !== 2) return;
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
    bowl meets a stem, so the stems stay where they stand. */
export function restyleBowls(cs: Node[][], from: BowlLook, to: BowlLook, sk: SkeletonOf): Node[][] {
  if (sameBowls(from, to)) return cs;
  // (what is read off the letter is kept with it, as dragging Squareness asks again of the same outline)
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

/** A run of the skeleton that turns one way through more than 150°, with the middle and the half widths of its oval. */
interface Arc { e: number; i0: number; i1: number; cx: number; cy: number; ax: number; ay: number; ease: number; bend: number[] }
/** A letter's bowls as read off it: the arcs on its skeleton, its outline, and for each point of the outline the
    arc it is pushed out from, how much (from 0 where the bowl meets a stem to 1) and at what angle round the oval. */
interface BowlScan { arcs: Arc[]; rings: P[][]; how: ({ arc: Arc; w: number; a: number } | null)[][] }
const bowlScans = new WeakMap<Node[][], BowlScan>();

function scanBowls(cs: Node[][], s: Skeleton): BowlScan {
  const arcs: Arc[] = [];
  s.edges.forEach((E, e) => {
    const pts = E.pts, n = pts.length;
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
    const at = (k: number, d: number) => { let j = k, l = 0; while (j > 0 && j < n - 1 && l < Math.abs(d)) { const q = j + Math.sign(d); l += Math.hypot(pts[q].x - pts[j].x, pts[q].y - pts[j].y); j = q; } return j; };
    // (nor round a corner, which turns as far in a short way: a D's stem into its bowl)
    const bend = pts.map((p, k) => {
      const a = at(k, -p.r * 2.5), b = at(k, p.r * 2.5), c = at(k, -p.r * 0.8), d = at(k, p.r * 0.8);
      // (turning on both sides of it: a straight running into a corner turns on one side only)
      return smoothstep((Math.min(Math.abs(H[k] - H[a]), Math.abs(H[b] - H[k])) - 0.08) / 0.1) * (1 - smoothstep((Math.abs(H[d] - H[c]) - 0.5) / 0.3));
    });
    const close = (i0: number, i1: number) => {
      if (Math.abs(H[i1] - H[i0]) < 150 * Math.PI / 180 || i1 - i0 < 5) return;
      // (its oval fitted to the stretches of it that bend)
      const fit = ovalFit(pts.slice(i0, i1 + 1), bend.slice(i0, i1 + 1));
      if (!fit) return;
      const rs = pts.slice(i0, i1 + 1).map(p => p.r).sort((p, q) => p - q);
      arcs.push({ e, i0, i1, ...fit, ease: rs[rs.length >> 1] * 4, bend });
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
  if (!arcs.length) return { arcs, rings: [], how: [] };
  const rings = inkRings(cs), eased = new Map<Arc, Map<number, number>>();
  const how = rings.map(r => r.map(p => {
    const q = nearestOn(s, p.x, p.y);
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
        for (let k = arc.i0 + 1; k <= q.i; k++) d0 += Math.hypot(E.pts[k].x - E.pts[k - 1].x, E.pts[k].y - E.pts[k - 1].y);
        for (let k = q.i + 1; k <= arc.i1; k++) d1 += Math.hypot(E.pts[k].x - E.pts[k - 1].x, E.pts[k].y - E.pts[k - 1].y);
        eased.get(arc)!.set(q.i, ew = smoothstep(Math.min(d0, d1) / arc.ease));
      }
      w = ew;
    }
    w *= arc.bend[q.i];
    const ux = (p.x - arc.cx) / arc.ax, uy = (p.y - arc.cy) / arc.ay;
    return { arc, w, a: Math.atan2(uy, ux) };
  }));
  return { arcs, rings, how };
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

/* ---- swash capitals */

/** The capitals Swash capitals curls out of the top of their first stroke (a stem, or a V's or a Y's first arm), out
    of the left end of their top bar, and out of their left foot (an A, whose first stroke tops out in its peak); the
    rest (C G J O Q S) have no free end at the left, as the engine's haven't. */
export const SWASH_STEM = 'BDEFHIKLMNPRUVWXY', SWASH_BAR = 'TZ', SWASH_FOOT = 'A';

/** The contours with the swash Swash capitals curls out of a capital (see swashEnd in ends.ts), as far as `to` asks
    past `from`: out of its first stroke's end at the top left, turned out to the left and curled round,
    counterclockwise, out and down (the top of a stem, a P's or an H's, or the left end of a bar, a T's or a Z's,
    hanging free); or, where it has none there, out of the foot at the bottom left (an A's), run out long and low to the
    left and turned up at its tip. As swash capitals are drawn, it thins from the stroke (no heavier than a regular
    stem, out of a heavy one's outer side) to a hairline and ends in a ball: a short beak at the start of the slider, a
    whole curl at its end, as far round as it goes without running into the letter. A serif in its way, on the end's
    outer side, goes. A letter with no such end (C O S, a script capital whose first stroke is a lead-in loop) takes
    none. */
export function restyleSwash(cs: Node[][], c: RestyleCtx, from: number, to: number): Node[][] {
  const kind = SWASH_STEM.includes(c.ch) ? 'stem' : SWASH_BAR.includes(c.ch) ? 'bar' : SWASH_FOOT.includes(c.ch) ? 'foot' : null;
  if (to <= from + 1e-4 || !kind) return cs;
  const rings = inkRings(cs), ink = shape(rings), cap = c.cap;
  // (the ink's first run, from the left, across a height)
  const first = (y: number) => {
    const xs: number[] = [];
    for (const q of rings) for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      if ((a.y <= y) !== (b.y <= y)) xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
    }
    xs.sort((a, b) => a - b);
    return xs.length >= 2 ? [xs[0], xs[1]] as const : null;
  };
  const k = to - from, mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2;
  // the end: where it stands, the way out of it, which way it curls, how thick its stroke is, and the serif in its way
  let end: { x: number; y: number; ox: number; oy: number; turn: 1 | -1; w: number; cut: Pt[] } | null = null;
  if (kind === 'stem' || kind === 'foot') {
    // the first stroke up to the capitals' line (or down to the baseline), read across it at the ends of the stretch
    // nearest the line where it is no wider than a stroke (clear of its serif, of a low crossbar, of a heavy E's or P's
    // bars; a heavy A's legs part only low down), run on to the line the way it runs, and on to where its ink ends
    // (short of the line on a round-topped stem, or out on a serif's top)
    const yl = kind === 'stem' ? cap : 0, ok: number[] = [];
    for (let f = 0.04; f <= 0.9; f += 0.02) {
      const r = first(cap * f);
      if (r && r[1] - r[0] <= c.stem * 1.8 && (kind === 'stem' ? f >= 0.2 : f <= 0.5)) ok.push(f);
    }
    // (stretches of heights a step apart, the one nearest the line first, read a little in from its ends, out of a
    // bracket, no nearer the line than a fifth of the capitals where it can, over as much as a sixth of them)
    const runs: number[][] = [];
    for (const f of ok) { const r = runs[runs.length - 1]; if (r && f - r[r.length - 1] < 0.03) r.push(f); else runs.push([f]); }
    const read = (r: number[]) => {
      const lo = r[0] + 0.01, hi = r[r.length - 1] - 0.01;
      if (kind === 'stem') { const fb = Math.min(hi, Math.max(0.8, lo + 0.04)); return [Math.max(lo, fb - 0.18), fb]; }
      const fb = Math.max(lo, Math.min(0.2, hi - 0.04));
      return [Math.min(hi, fb + 0.18), fb];
    };
    const pick = (kind === 'stem' ? runs.reverse() : runs).map(read).find(([fa, fb]) => Math.abs(fb - fa) >= 0.04 - 1e-9);
    if (pick) {
      const [fa, fb] = pick, ya = cap * fa, yb = cap * fb, a = first(ya)!, b = first(yb)!;
      const lx = (mid(b) - mid(a)) / (yb - ya), l = Math.hypot(lx, 1), w = Math.min((b[1] - b[0]) / l, c.stem * 1.3);
      const up = kind === 'stem' ? 1 : -1, ox = lx / l * up, oy = up / l, x0 = mid(b) + lx * (yl - yb), band = kind === 'stem' ? [cap * 0.86, cap * 2] : [-cap, cap * 0.14];
      // (a stroke that never comes near the line, a script capital's lead-in loop, has no end there to curl out of)
      let t = -cap * 0.12;
      while (t < cap * 0.06 && ink.has(x0 + ox * (t + 2), yl + oy * (t + 2))) t += 2;
      // (the serif on its outer side: the ink to the left of the stroke's own edge, near the line)
      const edge = b[0] + lx * (band[0] - yb);
      if (ink.has(x0 + ox * -cap * 0.12, yl + oy * -cap * 0.12)) end = { x: x0 + ox * t, y: yl + oy * t, ox, oy, turn: up as 1 | -1, w, cut: [{ x: edge - cap, y: band[0] }, { x: edge, y: band[0] }, { x: edge + lx * (band[1] - band[0]), y: band[1] }, { x: edge - cap, y: band[1] }] };
    }
  } else {
    // a bar's left end, out to the left, at the middle of the bar
    const t = first(cap - Math.max(4, Math.min(c.bar, c.stem) * 0.5));
    if (t) end = { x: t[0], y: cap - Math.min(c.bar, c.stem) * 0.5, ox: -1, oy: 0, turn: 1, w: Math.min(c.bar || c.stem, c.stem), cut: [] };
  }
  if (!end) return cs;
  // (out of a heavy stroke's outer side, no heavier than a regular stem, its hairline no heavier than a regular one's,
  // so a fat face's or a heavy rounded font's curl doesn't swell into a knob on top of the letter)
  const e = end, w = Math.min(e.w, cap * 0.12), hair = Math.min(w, Math.max(w * 0.22, Math.min(c.bar || w, w * 0.45, cap * 0.06)));
  const sx = -e.oy * e.turn * (e.w - w) / 2, sy = e.ox * e.turn * (e.w - w) / 2;
  // the curl at a size: run on a little, then sweep round, tighter as it goes, thinning from the stroke's own weight
  // to a hairline, into a ball; a short beak at the start of the slider, the whole sweep at its end. A foot runs out
  // long and low along the line and turns up only at its tip, so it reads as the leg run on, not a c beside it
  const foot = kind === 'foot';
  const curl = (s: number) => {
    const R0 = w * 0.4 + cap * (foot ? 0.14 + 0.3 * k : 0.08 + 0.14 * k) * s, sweep = Math.PI * (foot ? 0.2 + 0.4 * k : 0.35 + 0.75 * k), lead = w * 0.15;
    // (out of a stem's end half turned toward the side it curls to, out of a bar's end as it runs, a little raised, and
    // out of a foot along the line)
    let a = foot ? Math.PI + 0.25 : Math.atan2(e.oy, e.ox) + e.turn * (e.oy === 0 ? -0.2 : Math.PI / 4);
    const x = e.x + sx, y = e.y + sy;
    const mid: P[] = [{ x: x - e.ox * e.w, y: y - e.oy * e.w }, { x, y }, { x: x + Math.cos(a) * lead, y: y + Math.sin(a) * lead }];
    const N = 40;
    for (let i = 1; i <= N; i++) {
      const r = R0 * (1 - 0.5 * i / N), da = e.turn * sweep / N;
      a += da;
      const q = mid[mid.length - 1];
      mid.push({ x: q.x + Math.cos(a - da / 2) * r * sweep / N, y: q.y + Math.sin(a - da / 2) * r * sweep / N });
    }
    // (down to a hairline within a couple of stems, or half the way where it is short)
    const arc = arcOf(mid), L0 = arc[2], L = arc[arc.length - 1], fade = Math.max(w * 2, (L - L0) * 0.45);
    const th = arc.map(s => s <= L0 ? w : w + (hair - w) * smoothstep((s - L0) / fade));
    // (each side by the normal between the two segments either side of a point)
    const side = (sg: number) => mid.map((p, i) => {
      const a0 = mid[Math.max(0, i - 1)], a1 = mid[Math.min(mid.length - 1, i + 1)], dx = a1.x - a0.x, dy = a1.y - a0.y, l = Math.hypot(dx, dy) || 1;
      return { x: p.x - dy / l * sg * th[i] / 2, y: p.y + dx / l * sg * th[i] / 2 };
    });
    const body = [...side(1), ...side(-1).reverse()];
    // the ball, on the inside of the curl, its outer edge running on from the stroke's
    const tip = mid[mid.length - 1], prev = mid[mid.length - 2], tl = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
    const nx = -(tip.y - prev.y) / tl * e.turn, ny = (tip.x - prev.x) / tl * e.turn, rb = Math.max(hair * 0.75, w * (0.28 + 0.14 * k));
    const bc = { x: tip.x + nx * (rb - hair / 2), y: tip.y + ny * (rb - hair / 2) };
    const ball = Array.from({ length: 28 }, (_, i) => ({ x: bc.x + Math.cos(i / 28 * 2 * Math.PI) * rb, y: bc.y + Math.sin(i / 28 * 2 * Math.PI) * rb }));
    return { body, ball, mid, th, rb, bc, free: L0 + w * 1.2, arc };
  };
  // as big as it can sweep without running into the letter (a T's into its stem, an A's into its other leg)
  const cut = shape(e.cut.length ? [e.cut] : []), clear = (x: number, y: number) => !ink.has(x, y) || cut.has(x, y);
  let made = curl(1);
  for (const s of [0.85, 0.7, 0.55, 0.4]) {
    const m = made, gap = cap * 0.02;
    const hits = m.mid.some((p, i) => {
      if (m.arc[i] < m.free) return false;
      const a0 = m.mid[i - 1], dx = p.x - a0.x, dy = p.y - a0.y, l = Math.hypot(dx, dy) || 1, h = m.th[i] / 2 + gap;
      return !clear(p.x - dy / l * h, p.y + dx / l * h) || !clear(p.x + dy / l * h, p.y - dx / l * h);
    }) || [0, 1, 2, 3, 4, 5, 6, 7].some(j => !clear(m.bc.x + Math.cos(j * Math.PI / 4) * (m.rb + gap), m.bc.y + Math.sin(j * Math.PI / 4) * (m.rb + gap)));
    if (!hits) break;
    made = curl(s);
  }
  const body = shape([made.body]), ball = shape([made.ball]);
  return refit(combine([ink, cut, body, ball], (x, y) => (ink.has(x, y) && !cut.has(x, y)) || body.has(x, y) || ball.has(x, y)));
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

/** The contours with the peaks of their diagonals (the top of an A, the foot of a V, a W's and an M's points) as
    pointed or flat as `to` (Peaks, 0 pointed to 1 flat) asks, where they stand as the font draws them for `from`, as the
    engine draws them (see zig in glyphs/shared.ts): the outer edges of the two strokes are carried on to where they
    meet, the peak is moved out past the line (or back in) so they cross it as far apart as the flat top is to be wide,
    and it is cut off at the line where the font's own stood. The move eases off along the strokes, evenly, so they
    stay straight. */
export function restylePeaks(cs: Node[][], c: RestyleCtx & { lines: number[] }, from: number, to: number): Node[][] {
  if (Math.abs(from - to) < 1e-4 || !PEAK_LETTERS.includes(c.ch)) return cs;
  const rings = inkRings(cs), band = c.cap * ON_LINE, reach = c.stem * 2.2, inkShape = shape(rings);
  let y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const peaks: { x: number; out: number; top: number; s: number; tip: P[]; w0: number; tanHalf: number }[] = [];
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
