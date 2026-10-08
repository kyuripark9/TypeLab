/* A free font's letter given the shape settings the engine's own letters follow, past what moving its
   skeleton does (skin.ts): its corners rounded or stepped as Roundness, Steps, Inside corners and Joins
   round the engine's. Each works on the letter's outline as the font draws it, read off the outline and
   its skeleton (scan.ts), and changes only what the setting reaches, so the rest stays the font's own.

   Corners: every corner of the outline, a sharp one or a small round the font already has (read as the
   two straight-ish sides either side of it meeting, and the radius it rounds them by), is drawn again
   only where a setting asks for another radius or a step: a corner the ink wraps round (the corners of a
   stroke's square end, the outside of a turn) by Roundness and Steps, one in a crotch where a stroke runs
   into another by Joins, and every inside corner by Inside corners. */
import { termSpec, type Effective } from './font';
import { onEndScale } from '../params';
import { fitOutline, type Node } from './outline';
import { roundContour, signedArea } from './geom';
import { branches, endFace, inkAt, inkGrid, joinsOf, leaving, nearestOn, type Branch, type Grid, type Join, type SkPt, type Skeleton } from './scan';
import { buildSerif, serifCup, serifSides, termCap, termDropBack } from './stroke';
import { combine, shape } from './boolean';
import type { Cmd, PenCtx, Pt, SerifSides, SerifSpec } from './types';

type P = { x: number; y: number };

/** What a letter's restyling needs to know of it, in the font's units. */
export interface RestyleCtx {
  ch: string; cap: number; xh: number;
  /** its upright strokes' thickness, and its level ones' */ stem: number; bar: number;
}

/** How much of a setting the font takes on that it hasn't any of: none until the setting is moved past
    where the font was picked at, then all of it by the end of the scale. */
const added = (from: number, to: number) => (to > from ? (to - from) / (1 - from || 1) : 0);

/* ---- the outline sampled */

interface S extends P {
  /** turn to the next sample, radians, + to the left */ turn: number;
  /** how far to the next */ len: number;
  /** an anchor where the outline's direction breaks */ kink: boolean;
}

const bez = (a: Node, b: Node, t: number): P => {
  const p1x = a.ox ?? a.x, p1y = a.oy ?? a.y, p2x = b.ix ?? b.x, p2y = b.iy ?? b.y, u = 1 - t;
  return { x: u * u * u * a.x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * b.y };
};

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
    return { x: p.x, y: p.y, turn, len: Math.hypot(vx, vy), kink: Math.abs(turn) > 0.35 };
  });
}

/** The letter's ink as one set of outlines, anticlockwise round the ink and clockwise round its holes, so
    the ink is on their left: a font drawing a letter as strokes laid over each other (Roboto's H, its bar
    running into its stems) has the corners where they cross, not the ends hidden in the ink. */
export function inkRings(cs: Node[][]): P[][] {
  const sh = shape(cs.map(c => sampled(c)));
  return combine([sh], sh.has).filter(r => r.length > 2);
}

/* ---- corners */

/** A corner: where its two sides meet (or would, rounded), the samples its round takes, how far it turns,
    the radius the font rounds it by (0 sharp), and whether the ink wraps round it (convex). */
interface Corner { v: P; i0: number; i1: number; turn: number; r: number; convex: boolean }

/** The corners of a sampled contour: sharp turns, and short tight rounds between straighter sides
    (tighter than `rMax`, turning less than two thirds of the way round, so a bowl isn't one). */
function cornersOf(s: S[], inkLeft: boolean, rMax: number): Corner[] {
  const n = s.length, out: Corner[] = [];
  const tight = (i: number) => !s[i].kink && Math.abs(s[i].turn) > 0.004 && (s[i].len + s[(i - 1 + n) % n].len) / 2 / Math.abs(s[i].turn) < rMax;
  const used = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (s[i].kink) { out.push({ v: s[i], i0: i, i1: i, turn: s[i].turn, r: 0, convex: (s[i].turn > 0) === inkLeft }); used[i] = 1; }
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
      out.push({ v, i0: (h0 + n) % n, i1: (h1 + n) % n, turn: ht, r: hl / Math.max(0.05, Math.abs(ht)), convex: (sg > 0) === inkLeft });
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

export interface CornerLooks {
  /** convex corners: their radius past the font's, and the step cut out of the square ones */ round: number; step: number;
  /** inside corners: their radius at the least, and that of crotches where a stroke runs into another */ inner: number; join: number;
}
export const cornerLooks = (e: Effective, c: RestyleCtx): CornerLooks => ({
  round: e.roundness * c.stem * 0.5, step: e.steps, inner: e.innerRound * c.cap * 0.4, join: 2 * c.stem * e.joinRound
});
const sameCorners = (a: CornerLooks, b: CornerLooks) => Math.abs(a.round - b.round) < 0.3 && a.step === b.step && Math.abs(a.inner - b.inner) < 0.3 && Math.abs(a.join - b.join) < 0.3;

/** The contours with their corners rounded and stepped as `to` has them, where they stand as `from` had them. */
export function restyleCorners(cs: Node[][], c: RestyleCtx, from: CornerLooks, to: CornerLooks, sk: () => Skeleton): Node[][] {
  if (sameCorners(from, to)) return cs;
  // crotches: where strokes join (a node of the skeleton the stroke ends in), within its round of ink
  const joins = to.join !== from.join ? (() => { const s = sk(); return joinsOf(s).map(j => s.nodes[j.node]); })() : [];
  const atJoin = (p: P) => joins.some(n => Math.hypot(p.x - n.x, p.y - n.y) < n.r * 2.2 + 4);
  const stepAmt = added(from.step, to.step), thin = Math.min(c.stem, c.bar);
  const out: Node[][] = [];
  let changed = false;
  for (const ring of inkRings(cs)) {
    const s = annotate(ring);
    if (s.length < 3) continue;
    const corners = cornersOf(s, true, Math.max(6, c.stem * 0.6));
    // each corner's radius (and step) as asked for
    const plan = corners.map(k => {
      const ang = Math.PI - Math.abs(k.turn);
      let r = k.r, step = 0;
      if (k.convex) {
        r = Math.max(0, k.r + to.round - from.round);
        // a square corner (between 70° and 110°) steps back, as far as most of the thinner stroke's thickness
        if (stepAmt > 0 && Math.abs(Math.abs(k.turn) - Math.PI / 2) < 0.35) step = stepAmt * 0.85 * thin;
      } else {
        // inside corners only round further; a crotch by Joins, any by Inside corners (less, the wider it opens)
        const inner = Math.max(0, to.inner - from.inner) * Math.min(1, ang / (Math.PI / 2)) ** 2;
        const join = atJoin(k.v) ? Math.max(0, to.join - from.join) : 0;
        r = Math.max(k.r, k.r + Math.max(inner, join));
      }
      return { k, r, step, redo: Math.abs(r - k.r) > 0.5 || step > 0 };
    });
    // a step takes at most half the side it shares with the next corner, as the engine's do (two steps on a
    // stroke's square end meet in its middle at most)
    const at = (i: number) => { let l = 0; for (let k = 0; k < i; k++) l += s[k].len; return l; };
    const total = at(s.length), pos = plan.map(p => (at(p.k.i0) + at(p.k.i1)) / 2);
    // and only a corner of the letter, where strokes meet square or a stroke turns (the foot of an L, the
    // corners of an E), not one of a stroke's square end, a short side away from the other, as the engine's
    const thick = Math.max(c.stem, c.bar) * 1.6;
    // a round reaches no further along either side than about half way to the next corner, so two never cross
    // (a B's counters, rounded all round by Joins, stay counters)
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
      p.r = Math.max(p.k.r, Math.min(p.r, most));
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
    out.push(...fitOutline(roundContour(pts, 0), 1.2));
  }
  return changed ? out : cs;
}

/* ---- stroke ends */

/** The shape the picked kind of stroke end gives, everything that tells one from another. */
const endLook = (e: Effective) => JSON.stringify({ t: e.terminal, ...termSpec(e) });

/** A stroke's free end, read off the skeleton: the skeleton's points from the tip in, the stroke's
    usual half-thickness back from its end, and how far the ink reaches on past the skeleton's tip. */
interface End { pts: SkPt[]; body: number; reach: number; dir: P }

/** The free ends of a letter's strokes that the engine's letters give a styled end (a terminal): the ends
    of strokes that curve (c, e, s, the hook of an a, f, j, r, t, the tail of a J), not a stem's, an arm's,
    a diagonal's or a serif's straight end, nor a dot. */
function terminalEnds(sk: Skeleton, g: Grid): End[] {
  const out: End[] = [];
  sk.nodes.forEach((n, ni) => {
    if (n.edges.length !== 1) return;
    const E = sk.edges[n.edges[0]];
    if (E.a === E.b) return;
    const pts = E.a === ni ? E.pts : E.pts.slice().reverse();
    // its usual half-thickness: the middle of the skeleton's, past the end itself
    const arc = [0];
    for (let k = 1; k < pts.length; k++) arc.push(arc[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    // (read near the end: a high-contrast stroke is much heavier round its middle than out at its ends)
    const med = (lo: number, hi: number) => { const rs = pts.filter((_, k) => arc[k] >= lo && arc[k] <= hi).map(p => p.r).sort((a, b) => a - b); return rs.length ? rs[rs.length >> 1] : 0; };
    const b0 = med(n.r * 2, Infinity) || n.r, body = med(b0 * 1.5, b0 * 4) || b0;
    if (E.len < body * 2.5) return;
    // it curves, right on out to its end: the way it heads at its tip, a little way back and further back all
    // differ (not a straight bar turning a corner into another stroke, as G's)
    const at = (a: number) => { let k = 0; while (k < pts.length - 1 && arc[k] < a) k++; return k; };
    const d0 = dirAlong(pts, 0, at(body * 1.5)), dm = dirAlong(pts, at(body * 1.5), at(body * 3)), d1 = dirAlong(pts, at(body * 3), at(body * 5));
    // (and further back too: a straight stem or arm only seems to curve at its end, where its skeleton runs off into
    // the sharper corner of an end cut on a slant, an italic stem's)
    if (d0.x * d1.x + d0.y * d1.y > Math.cos(15 * Math.PI / 180) || d0.x * dm.x + d0.y * dm.y > Math.cos(4 * Math.PI / 180)
      || dm.x * d1.x + dm.y * d1.y > Math.cos(4 * Math.PI / 180)) return;
    const dir = { x: -d0.x, y: -d0.y };
    let reach = 0;
    while (reach < body * 4 && inkAt(g, n.x + dir.x * (reach + 1), n.y + dir.y * (reach + 1))) reach += 1;
    out.push({ pts, body, reach, dir });
  });
  return out;
}
/** Whether a letter has a stroke end the engine's letters give a styled end (see terminalEnds). */
export const hasTerminals = (cs: Node[][], sk: Skeleton) => terminalEnds(sk, inkGrid(cs, 4)).length > 0;

const dirAlong = (pts: SkPt[], i: number, j: number): P => {
  const a = pts[i], b = pts[Math.max(i + 1, j)] ?? pts[pts.length - 1], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
};

/** Where the line through p along n crosses a ring: the nearest crossing on each side of p (u > 0 and u < 0),
    no further than `max`, as the segment it falls on and how far along it. */
interface Cross { u: number; i: number; t: number; x: number; y: number }
function crossings(ring: P[], p: P, n: P, max: number): [Cross, Cross] | null {
  let pos: Cross | null = null, neg: Cross | null = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const da = (a.x - p.x) * -n.y + (a.y - p.y) * n.x, db = (b.x - p.x) * -n.y + (b.y - p.y) * n.x;
    if ((da > 0) === (db > 0) || da === db) continue;
    const t = da / (da - db), x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, u = (x - p.x) * n.x + (y - p.y) * n.y;
    if (Math.abs(u) > max) continue;
    if (u > 0 && (!pos || u < pos.u)) pos = { u, i, t, x, y };
    if (u < 0 && (!neg || u > neg.u)) neg = { u, i, t, x, y };
  }
  return pos && neg ? [pos, neg] : null;
}

/** Points along a polyline at the same shares of its length as `us` (0 its start, 1 its end). */
function atShares(line: P[], us: number[]): P[] {
  const arc = [0];
  for (let k = 1; k < line.length; k++) arc.push(arc[k - 1] + Math.hypot(line[k].x - line[k - 1].x, line[k].y - line[k - 1].y));
  const L = arc[arc.length - 1] || 1;
  return us.map(u => {
    const a = u * L;
    let k = 1;
    while (k < line.length - 1 && arc[k] < a) k++;
    const f = (a - arc[k - 1]) / ((arc[k] - arc[k - 1]) || 1);
    return { x: line[k - 1].x + (line[k].x - line[k - 1].x) * f, y: line[k - 1].y + (line[k].y - line[k - 1].y) * f };
  });
}

/** (for looking at how ends are drawn again) */
export let endDebug: Record<string, unknown>[] | null = null;
export const debugEnds = (on: boolean) => { endDebug = on ? [] : null; return () => endDebug; };

/** The contours with their strokes' styled ends drawn as the engine draws the kind of end `to` picks, where
    they stand as the font draws them for `from`. The stroke keeps the font's own sides up to where its own end
    begins (a ball, a flare, a cut); from there they run straight on as far as the font's end reached, and the
    engine's end is drawn across them (stroke.ts): rounded, pointed, cut on a slant, a drop or a ball; a taper or
    a flare narrows or widens the sides over as long a stretch as the engine's do, and a drop shortens them. */
export function restyleEnds(cs: Node[][], c: RestyleCtx, from: Effective, to: Effective, sk: () => Skeleton): Node[][] {
  const restyle = endLook(from) !== endLook(to), moves = endMoves(c, from, to);
  if (!restyle && !moves) return cs;
  const g = inkGrid(cs, 2), ends = terminalEnds(sk(), g);
  if (!ends.length) return cs;
  const T = termSpec(to);
  let rings = inkRings(cs);
  for (const end of ends) {
    const { pts, body } = end, arc = [0];
    for (let k = 1; k < pts.length; k++) arc.push(arc[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    const total = arc[arc.length - 1], t0 = body * 2;
    // how much longer (or shorter) the end is drawn, and how much further round it bends, by the radius it curves at
    const kEnd = endCurvature(pts, arc, body), mv = moves ? moves(end, kEnd) : { len: 0, bend: 0 };
    if (!restyle && Math.abs(mv.len) < 0.5 && Math.abs(mv.bend) < 0.005) continue;
    const idx = (a: number) => { let k = 0; while (k < pts.length - 1 && arc[k] < a) k++; return k; };
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
    // (never more than most of the way to where the stroke meets another: a G's top running round to its bar)
    const sAt = Math.min(total * 0.6, Math.max(zone + body * 0.6, runBack + body * 0.3, -mv.len + body * 1.2));
    // (a shorter end is cut back no further than the stretch drawn again)
    const len = Math.max(mv.len, -(sAt - body * 0.8));
    const kS = idx(sAt), kE = idx(Math.min(zone, sAt - 2));
    // the cross-sections where the new end starts (S) and where a ball or a flare of the font's begins (E)
    const S = pts[kS], dS0 = dirAlong(pts, Math.max(0, kS - 2), Math.min(pts.length - 1, kS + 2)), outS = { x: -dS0.x, y: -dS0.y };
    const E = pts[kE], dE0 = dirAlong(pts, Math.max(0, kE - 2), Math.min(pts.length - 1, kE + 2));
    const left = (d: P) => ({ x: -d.y, y: d.x });
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
      if (endPath[endPath.length - 1] !== ring[cb.i] || arcLen(endPath) > 2 * (arc[kS] + end.reach) + 6 * body) continue;
      // each side as the font draws it, from S on to where it stops running along the stroke: a corner of its end,
      // or its turning off round it (a round end); short of a ball or a flare, only to where that begins
      const way = { x: -dE0.x, y: -dE0.y };
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
      const N = 40, us = Array.from({ length: N + 1 }, (_, i) => i / N);
      if (!restyle) {
        // the font's own end, carried on out (or back) along the stroke and bent round as asked: its sides as
        // drawn, drawn on, and the cap across them (round, cut, a ball) as the font draws it, moved with them
        const ia = A0.length - 1, ib = B0.length - 1;
        const capPath = endPath.slice(Math.max(0, ia - 1), endPath.length - Math.max(0, ib - 1));
        const As0 = atShares(A0, us), Bs0 = atShares(B0, us), [As, Bs, frame] = reshapeEnd(As0, Bs0, len, mv.bend, kEnd);
        const cap = capPath.filter(q => !(onSegs(q, A0) || onSegs(q, B0))).map(frame);
        const drawn = [...As, ...cap, ...Bs.slice().reverse()];
        endDebug?.push({ A: A0, B: B0, As, Bs, S, E, poly: drawn });
        const rest: P[] = [];
        for (let k = (cb.i + 1) % n, step = 0; step < n; k = (k + 1) % n, step++) { rest.push(ring[k]); if (k === ca.i) break; }
        const spliced = [...drawn.slice(1, -1), { x: cb.x, y: cb.y }, ...rest, { x: ca.x, y: ca.y }];
        rings = rings.slice();
        rings[ri] = fwd ? spliced : spliced.reverse();
        break;
      }
      // the end, square across the stroke where its two sides reach on average (out to its tip, past a ball)
      const proj = (q: P) => (q.x - E.x) * way.x + (q.y - E.y) * way.y;
      const reach = shaped ? Math.min(end.reach, body * 1.05) + arc[kE] : Math.max(0, (proj(A0[A0.length - 1]) + proj(B0[B0.length - 1])) / 2);
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
      let [As, Bs] = reshapeEnd(atShares(A, us), atShares(B, us), len, mv.bend, kEnd);
      const lenA = (arcLen(As) + arcLen(Bs)) / 2;
      if (tapers || flares) {
        const w = tapers ? Math.min(1, T.tip) : T.flare, L = Math.min(runBack, lenA * 0.95);
        // a brush lifts off the inside of the curve and keeps its outer edge running on
        const turn = dS0.x * dE0.y - dS0.y * dE0.x, brush = tapers && T.form === 'brush' ? (Math.abs(turn) < 0.05 ? 1 : turn > 0 ? -1 : 1) : 0;
        const K = As.length - 1;
        for (let i = 0; i <= K; i++) {
          const f = w + (1 - w) * smooth01((1 - i / K) * lenA / L);
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
      const turn = dS0.x * dE0.y - dS0.y * dE0.x;
      // (the outer side of a curve: turning left, the right one)
      const outerIsA = Math.abs(turn) > 0.02 ? turn < 0 : a.y >= b.y;
      const pen: PenCtx = { thick: tt, thin: tt, stress: 0, k: 0.5523, org: 0, terminal: to.terminal, term: T };
      const Ap: Pt[] = As.map(q => ({ ...q, smooth: true })), Bp: Pt[] = Bs.map(q => ({ ...q, smooth: true }));
      Ap[0].smooth = Bp[0].smooth = false;
      const capPts = termCap(Ap, Bp, p, out2, tt, pen, outerIsA);
      const drawn = toPolygon(roundContour([...Ap, ...capPts, ...Bp.slice().reverse()], 0));
      endDebug?.push({ A, B, As, Bs, S, E, poly: drawn });
      // the font's end out, the new one in, between the two crossings
      const rest: P[] = [];
      for (let k = (cb.i + 1) % n, step = 0; step < n; k = (k + 1) % n, step++) { rest.push(ring[k]); if (k === ca.i) break; }
      rings = rings.slice();
      const spliced = [...drawn.slice(1, -1), { x: cb.x, y: cb.y }, ...rest, { x: ca.x, y: ca.y }];
      // (a new end that takes away or adds far more ink than an end has was drawn on the wrong stretch: left be)
      const was = Math.abs(signedArea(ring)), now = Math.abs(signedArea(spliced));
      if (Math.abs(now - was) > Math.min(4 * body * (arc[kS] + body * 3), was * 0.35)) break;
      rings[ri] = fwd ? spliced : spliced.reverse();
      break;
    }
  }
  // (a new end may run over another stroke, or a drop over its own: the ink is read again as one)
  const ink = shape(rings), out = combine([ink], ink.has);
  const res: Node[][] = [];
  for (const r of out) if (r.length > 2) res.push(...fitOutline([...r.map((q, i): Cmd => [i ? 'L' : 'M', q.x, q.y]), ['Z']], 1.2));
  return res;
}

/** How a stroke's end moves under the settings past where the font was picked at: drawn on or back (Length; Tails
    & hooks for a hook's or a tail's, the Q y j g t f's; Openness, as round as it curves, for an open bowl's, c e s a
    and C G S and their figures), and bent on round the way it turns or out of it (Curl). Null when nothing moves. */
function endMoves(c: RestyleCtx, from: Effective, to: Effective) {
  const hook = 'Qjygtf'.includes(c.ch), open = 'aceCGsS2356'.includes(c.ch);
  const reach = (v: number) => { const t = (onEndScale(v) - 0.5) * 2; return t <= 0 ? 0.12 * t : 0.12 * t + 0.88 * t ** 4; };
  const dLen = (reach(to.terminalLength) - reach(from.terminalLength)) * c.xh, dTail = (to.tail - from.tail) * c.xh * 0.6;
  const dAp = to.aperture - from.aperture, dCurl = to.terminalCurl - from.terminalCurl;
  if (Math.abs(dLen) < 0.5 && Math.abs(dTail) < 0.5 && Math.abs(dAp) < 1e-4 && Math.abs(dCurl) < 1e-4) return null;
  return (end: End, k: number) => {
    // (opened, a bowl's end goes back round it by as much of a quarter turn as the engine's do, see glyphs.ts)
    const R = Math.min(Math.abs(k) > 1e-6 ? 1 / Math.abs(k) : Infinity, end.body * 8);
    const ap = open && !hook && R < Infinity ? -dAp * 0.36 * (Math.PI / 2) * R : 0;
    return { len: (hook ? dTail : dLen) + ap, bend: hook ? 0 : dCurl * 2 * (Math.PI / 3) * Math.sign(k || 1) };
  };
}

/** How sharply a stroke turns toward its end (1/radius, + to the left going out to the tip), read over its last few
    thicknesses. */
function endCurvature(pts: SkPt[], arc: number[], body: number) {
  const at = (a: number) => { let k = 0; while (k < pts.length - 1 && arc[k] < a) k++; return k; };
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

const smooth01 = (u: number) => { const v = Math.min(1, Math.max(0, u)); return v * v * (3 - 2 * v); };
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
export function restyleSerifs(cs: Node[][], c: RestyleCtx & { lower: boolean; lines: number[] }, sf: SerifSpec, sk: () => Skeleton): Node[][] {
  const g = inkGrid(cs, 2), s = sk(), tol = c.cap * 0.035;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const cn of cs) for (const n of cn) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const serifs: Pt[][] = [], cuts: Pt[][] = [];
  s.nodes.forEach((n, ni) => {
    if (n.edges.length !== 1 || s.edges[n.edges[0]].a === s.edges[n.edges[0]].b) return;
    const br = branches(s, ni)[0], lv = leaving(s, br, n.r * 2), d = { x: -lv.x, y: -lv.y };
    if (s.edges[br.e].len < n.r * 1.5) return;
    const f = endFace(g, n.x, n.y, n.r, d);
    let end: { x: number; y: number; dx: number; dy: number; t: number; type: 'flat' } | null = null, given: SerifSides = 'both', inward: SerifSides = null;
    if (f.face === 'level' && Math.abs(d.y) >= 0.5 && c.lines.some(L => Math.abs(f.at - L) < tol)) {
      end = { x: f.mid, y: f.at, dx: d.x, dy: d.y, t: n.r * 2, type: 'flat' };
      // (a lowercase stem's top, upright: a flag to the left)
      if (d.y > 0 && c.lower && Math.abs(d.x) < 0.3) given = 'a';
      inward = f.mid < cx - 2 ? 'b' : f.mid > cx + 2 ? 'a' : null;
    } else if (f.face === 'plumb' && Math.abs(d.x) >= 0.7 && !crossing(s, br)) {
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
    const pen: PenCtx = { thick: n.r * 2, thin: n.r * 2, stress: 0, k: 0.5523, org: 0, terminal: 'flat', serif: room < Infinity ? { ...sf, len: Math.min(sf.len, room * 0.42) } : sf };
    const poly = buildSerif(end, sides, pen, 1, cup, inward);
    if (poly && poly.length > 2) serifs.push(toPolygon(roundContour(poly, 0)));
  });
  if (!serifs.length) return cs;
  const ink = shape(cs.map(cn => sampled(cn))), cut = shape(cuts), add = shape(serifs);
  const out = combine([ink, cut, add], (x, y) => (ink.has(x, y) && !cut.has(x, y)) || add.has(x, y));
  const res: Node[][] = [];
  for (const r of out) if (r.length > 2) res.push(...fitOutline([...r.map((q, i): Cmd => [i ? 'L' : 'M', q.x, q.y]), ['Z']], 1.2));
  return res;
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

/** The contours opened as Stencil, Gap and its ends open the engine's (see stencilCut in font.ts): where a stroke
    runs into another (read off the skeleton, see joinsOf), it is cut back from it, along the other's edge, the gap
    wide (moved out along it by the gap's place); a bar joined at both ends is cut at its left or upper end only, so
    every gap moves the same way; a ring with no join (an o) is cut down its middle. A crossbar's Gap cuts it back
    at both ends, or, run through, cuts the strokes it meets above and below it. */
export function restyleStencil(cs: Node[][], c: RestyleCtx, from: StencilLook, to: StencilLook, sk: () => Skeleton): Node[][] {
  const v = added(from.gap, to.gap), bv = to.bar > from.bar ? added(from.bar, to.bar) : 0;
  if (!(v > 0) && !(bv > 0)) return cs;
  const s = sk(), stem = c.stem, gapOf = (k: number) => k * (24 * c.cap / 700 + 2 * stem), off = to.pos > 0 ? stem * 0.55 + (c.xh * 0.4 - stem * 0.55) * to.pos : 0;
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
  /** How far along branch br from join ji both edges of the stroke clear the other stroke's edge (see stencilCut). */
  const clear = (ji: number, br: Branch) => {
    const { n, tx, ty, half } = hosts[ji], d = leaving(s, br, n.r * 3);
    let nx = -ty, ny = tx;
    if (nx * d.x + ny * d.y < 0) { nx = -nx; ny = -ny; }
    const dn = nx * d.x + ny * d.y, E = s.edges[br.e], r = E.pts[E.pts.length >> 1].r, px = -d.y, py = d.x;
    return { d, r, at: dn < 0.2 ? half : Math.max(...[1, -1].map(o => (half - o * r * (px * nx + py * ny)) / dn)) };
  };
  /** How far along branch br from join ji the stroke it meets ends, read off the ink just past the bar's edges either
      side (the skeleton's join can sit off the middle of a heavy stem, nearer the bar). */
  const inkAt = shape(cs.map(cn => sampled(cn)));
  const edgeAt = (ji: number, br: Branch) => {
    const { n } = hosts[ji], { d, r, at } = clear(ji, br), px = -d.y, py = d.x;
    let far = 0;
    for (const o of [1, -1]) {
      const qx = n.x + px * o * (r + 3), qy = n.y + py * o * (r + 3);
      let t = 0;
      while (t < at * 3 && inkAt.has(qx + d.x * t, qy + d.y * t)) t += 1;
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
          // the strokes it meets cut across above and below it, the gap from its edges
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
  const ink = shape(cs.map(cn => sampled(cn))), cut = shape(bands);
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
  const res: Node[][] = [];
  for (const r of rings) if (r.length > 2) res.push(...fitOutline([...r.map((q, i): Cmd => [i ? 'L' : 'M', q.x, q.y]), ['Z']], 1.2));
  return res;
}

/* ---- bowls */

/** (for looking at the bowls read off a letter) */
export let bowlDebug: Record<string, unknown>[] | null = null;
export const debugBowls = (on: boolean) => { bowlDebug = on ? [] : null; return () => bowlDebug; };

/** How round the bowls are: the tension of a quarter turn's handles the engine draws them with (see metrics in
    font.ts), and the share of each cut off straight (Chamfer), and how much fuller the organic diagonal is. */
export interface BowlLook { k: number; chamfer: number; org: number; box: boolean }
export const bowlLook = (e: Effective): BowlLook => ({ k: 0.5523 + 0.05 * e.curve + 0.36 * e.square, chamfer: e.chamfer, org: e.curve * (1 - Math.min(1, Math.max(0, e.slant))), box: e.bowlForm === 'box' });
const sameBowls = (a: BowlLook, b: BowlLook) => Math.abs(a.k - b.k) < 1e-4 && Math.abs(a.chamfer - b.chamfer) < 1e-4 && Math.abs(a.org - b.org) < 1e-4 && a.box === b.box;

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

/** The superellipse exponent whose quarter a cubic with handles `k` of the way along draws (they meet at 45°). */
const exponentOf = (k: number) => -Math.LN2 / Math.log((3 * Math.min(0.97, Math.max(0.3, k)) + 4) / 8);
/** How far out a bowl reaches at angle a round it, against a circle's 1: a superellipse (round to square), cut toward
    an octagon by Chamfer, fuller on one diagonal and pinched on the other, as an organic quarter turn is. */
function reachAt(b: BowlLook, a: number) {
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), full = Math.sin(2 * a) > 0;
  const k = b.box ? 0.97 : b.k * (1 + (full ? 0.4 : -0.22) * b.org), n = b.box ? 12 : exponentOf(k);
  const se = Math.pow(Math.pow(c, n) + Math.pow(s, n), -1 / n), oct = Math.min(1 / Math.max(c, 1e-6), 1 / Math.max(s, 1e-6), Math.SQRT2 / (c + s));
  return se + (oct - se) * Math.min(1, b.chamfer);
}

/** The contours with their bowls drawn as round, square or cut as `to` asks, where they stand as `from` had them:
    every stretch of the skeleton that turns round a good way one way (an o's ring, a c's, each half of an S, a b's
    bowl) is read as part of an oval round the middle of its run, and the outline beside it is pushed out or drawn in
    along the line from that middle by as much as the new shape reaches past the old one there, easing off where the
    bowl meets a stem, so the stems stay where they stand. */
export function restyleBowls(cs: Node[][], from: BowlLook, to: BowlLook, sk: () => Skeleton): Node[][] {
  if (sameBowls(from, to)) return cs;
  const s = sk();
  // the runs that turn one way through more than 150°, each with the middle and the half widths of its oval
  interface Arc { e: number; i0: number; i1: number; cx: number; cy: number; ax: number; ay: number; ease: number; bend: number[] }
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
      return smooth01((Math.min(Math.abs(H[k] - H[a]), Math.abs(H[b] - H[k])) - 0.08) / 0.1) * (1 - smooth01((Math.abs(H[d] - H[c]) - 0.5) / 0.3));
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
  bowlDebug?.push(...arcs.map(a => ({ ...a, bend: a.bend.map((b, k) => b > 0.5 ? [Math.round(s.edges[a.e].pts[k].x), Math.round(s.edges[a.e].pts[k].y)] : null).filter((x, k) => x && k % 20 === 0) })));
  if (!arcs.length) return cs;
  const rings = inkRings(cs);
  // each point of the outline: the oval it is pushed out from, and how far (then eased along the outline, as the
  // skeleton it is read off steps from cell to cell)
  const moved = rings.map(r => {
    const how = r.map(p => howFar(p));
    const n = r.length, f = how.map((_, i) => {
      let t = 0, c = 0;
      for (let j = -10; j <= 10; j++) { const h = how[(i + j + n) % n]; if (h && how[i] && h.arc === how[i]!.arc) { t += h.f; c++; } }
      return c ? t / c : 1;
    });
    return r.map((p, i) => { const h = how[i]; return h ? { x: h.arc.cx + (p.x - h.arc.cx) * f[i], y: h.arc.cy + (p.y - h.arc.cy) * f[i] } : p; });
  });
  function howFar(p: P): { arc: Arc; f: number } | null {
    const q = nearestOn(s, p.x, p.y);
    if (!q) return null;
    const arc = arcs.find(a => a.e === q.e && q.i >= a.i0 && q.i <= a.i1);
    if (!arc) return null;
    // (easing off over two strokes' widths toward where the run starts and ends: a ring has no ends)
    const E = s.edges[arc.e], ring = E.a === E.b && arc.i0 === 0 && arc.i1 === E.pts.length - 1;
    let w = 1;
    if (!ring) {
      let d0 = 0, d1 = 0;
      for (let k = arc.i0 + 1; k <= q.i; k++) d0 += Math.hypot(E.pts[k].x - E.pts[k - 1].x, E.pts[k].y - E.pts[k - 1].y);
      for (let k = q.i + 1; k <= arc.i1; k++) d1 += Math.hypot(E.pts[k].x - E.pts[k - 1].x, E.pts[k].y - E.pts[k - 1].y);
      w = smooth01(Math.min(d0, d1) / arc.ease);
    }
    w *= arc.bend[q.i];
    const ux = (p.x - arc.cx) / arc.ax, uy = (p.y - arc.cy) / arc.ay, a = Math.atan2(uy, ux);
    return { arc, f: 1 + w * (reachAt(to, a) / reachAt(from, a) - 1) };
  }
  const ink = shape(moved), out = combine([ink], ink.has), res: Node[][] = [];
  for (const r of out) if (r.length > 2) res.push(...fitOutline([...r.map((q, i): Cmd => [i ? 'L' : 'M', q.x, q.y]), ['Z']], 1.2));
  return res;
}

/* ---- dots */

/** How round the dots are, from 0 square to 1 round, as the engine draws them (see dotRound in font.ts). */
export const dotLook = (e: Effective) => (e.dots === 'round' ? 1 : e.dots === 'square' ? 0 : Math.max(e.roundness, e.terminal === 'round' ? e.terminalRound : 0));

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
    // (on its own: no other outline round it or in it; small, and filling much of its box, as a dot does, unlike a comma)
    const alone = !rings.some(o => o !== r && o.some(p => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1));
    if (!alone || signedArea(r) < 0 || w > Math.max(c.stem, c.bar) * 2.6 || h > Math.max(c.stem, c.bar) * 2.6 || w / h > 1.6 || h / w > 1.6 || a < w * h * 0.6) return r;
    changed = true;
    const side = (w + h) / 2, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hs = side / 2, rr = hs * round;
    return toPolygon(roundContour([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: cx + u * hs, y: cy + v * hs, r: rr })), 0));
  });
  if (!changed) return cs;
  const res: Node[][] = [];
  for (const r of out) if (r.length > 2) res.push(...fitOutline([...r.map((q, i): Cmd => [i ? 'L' : 'M', q.x, q.y]), ['Z']], 1.2));
  return res;
}

/* ---- peaks */

/** The contours with the peaks of their diagonals (the top of an A, the foot of a V, a W's and an M's points) as
    pointed or flat as `to` (Peaks, 0 pointed to 1 flat) asks, where they stand as the font draws them for `from`, as the
    engine draws them (see zig in glyphs.ts): the outer edges of the two strokes are carried on to where they meet, the
    peak is moved out past the line (or back in) so they cross it as far apart as the flat top is to be wide, and it is
    cut off at the line where the font's own stood. The move eases off along the strokes, evenly, so they stay straight. */
export function restylePeaks(cs: Node[][], c: RestyleCtx & { lines: number[] }, from: number, to: number): Node[][] {
  if (Math.abs(from - to) < 1e-4) return cs;
  const rings = inkRings(cs), band = c.cap * 0.035, reach = c.stem * 2.2, inkShape = shape(rings);
  let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
  for (const r of rings) for (const p of r) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); }
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
  const filled = combine([shape([...rings, ...peaks.map(p => p.tip)])], shape([...rings, ...peaks.map(p => p.tip)]).has);
  const Rx = Math.max(c.stem * 3, (x1 - x0) * 0.6);
  const moved = filled.map(r => r.map(p => {
    let dy = 0;
    for (const k of peaks) {
      // (only the two strokes that make the peak: inside the wedge their outer edges make, widening away from it)
      const span = k.out > 0 ? k.top - y0 : y1 - k.top, back = Math.abs(p.y - k.top), fy = Math.max(0, 1 - back / Math.max(1, span));
      const half = k.w0 / 2 + back * k.tanHalf + c.stem * 0.4, fx = 1 - smooth01((Math.abs(p.x - k.x) - half) / (c.stem * 0.4));
      dy += k.out * k.s * fy * fx;
    }
    return { x: p.x, y: p.y + dy };
  }));
  // and cut off where the font's own peak stood
  const cuts = peaks.map(k => { const a2 = k.top, b2 = k.top + k.out * c.cap; return [{ x: k.x - Rx, y: a2 }, { x: k.x + Rx, y: a2 }, { x: k.x + Rx, y: b2 }, { x: k.x - Rx, y: b2 }]; });
  const ink = shape(moved), cut = shape(cuts), out = combine([ink, cut], (x, y) => ink.has(x, y) && !cut.has(x, y)), res: Node[][] = [];
  for (const r of out) if (r.length > 2) res.push(...fitOutline([...r.map((q, i): Cmd => [i ? 'L' : 'M', q.x, q.y]), ['Z']], 1.2));
  return res;
}
