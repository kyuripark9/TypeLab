/* Basic block letters (Built from: Blocks, Block letters: Basic).
   Plain, even block letters of the ordinary shapes: an O a box with a box cut out of it, an E a stem with three arms,
   a real lowercase with ascenders and descenders. Like the slot blocks (blocks.ts) there is no skeleton: every letter
   is outlines of corners, y up from the baseline, but here each part is measured from the design, so the letters
   keep their shapes from thin to black and narrow to wide: `V` is an upright stroke, `B` a level one, `D` a diagonal
   (square across it), and a counter's width is a share of the cap height times Width.

   Each corner is of a kind, which says which control rounds it:
   'o' an outer corner or a stroke's end (Roundness), 'b' the outside of a bowl (Bowls: oval right round, box as round
   as its Corners), 'k' the inside of a bowl (as round as its outside, less the stroke), 'c' a square corner inside
   a letter (Counters), 'i' a narrow crotch where strokes meet at a slant (Joins), 's' always sharp. Steps notch the
   square outer corners and the bowls'. Crossbar height moves the bars of A B E F G H P R 4, and Openness how far the
   ends of C G J S c e s 2 5 6 9 come in, each from where the letter draws it at the middle of its slider. */
import { clamp, lerp, signedArea } from './geom';
import { weighed } from '../params';
import type { Metrics } from './font';
import type { Pt } from './types';

type Kind = 'o' | 'b' | 'k' | 'c' | 'i' | 's';
/** A corner: x, y up from the baseline, and its kind. */
type P = [number, number, Kind];
/** A letter's outlines and holes, its width, its side-bearing factors (1 a straight side, less round or slanted), and
    how round its bowls may be (half the width of the widest, half the letter's width when not given). */
interface Shape { outer: P[][]; holes: P[][]; W: number; sb: [number, number]; bowl?: number }

export interface BasicDims {
  /** the heights: capitals, x-height, ascenders, descenders (negative) */ cap: number; xh: number; asc: number; desc: number;
  /** upright, level and diagonal strokes, the level strokes of the lowercase (thinner where three would crowd it),
      and the mean stroke */ V: number; B: number; D: number; b: number; T: number;
  /** a level stroke standing alone (a dash, the bars of + = #): as thick as the level strokes, but never under `LONE`
      of the upright ones, so a hyphen stays seen however far Contrast or Horizontals thin the bars inside letters */ L: number;
  /** a counter `f` of the cap height wide, at this Width */ cw: (f: number) => number;
  /** the flat the peaks keep (the top of A, the foot of V), before it is fitted to the strokes */ flat: number;
  /** Crossbar height: the middle of a bar drawn `y` up at the middle of the slider, moved down toward `lo` or up
      toward `hi` (the lowest and highest its middle may go for the counters to stay open), and never more than
      `BAR_SPAN` of the cap height either way, as a share of the way */ barY: (y: number, lo: number, hi: number) => number;
  /** Openness: the share of the room inside that the ends of an open letter come in by, `share` at the middle of the
      slider, closing to `most` (three quarters; less for a figure, so a 6 stays a 6, not an 8) and opening to none */
  open: (share: number, most?: number) => number;
}

/** The least room a crossbar leaves the counter it moves toward, as a share of the letter's height, and the furthest
    it moves from where the letter draws it, as a share of the cap height (an H's bar from about a third to near three
    quarters of the way up). */
const ROOM = 0.06, BAR_SPAN = 0.22, LONE = 0.45;

/** The measurements of the basic block letters for the design. */
export function basicDims(m: Metrics): BasicDims {
  const e = m.p, cap = m.cap;
  // Weight thickens every stroke; Contrast thins the level ones (or, reversed, the upright ones) as far as a third
  const t = cap * (0.045 + 0.235 * e.weight), thin = 1 - 0.7 * clamp((e.contrast - 0.05) / 0.95);
  const V = t * weighed(1, e.vWeight, 0.4, 1.6) * (e.reverse > 0.5 ? thin : 1);
  const B0 = t * weighed(1, e.hWeight, 0.4, 1.6) * (e.reverse > 0.5 ? 1 : thin);
  // three level strokes and two counters share a letter's height, so the counters never close
  const B = Math.min(B0, cap * 0.29), b = Math.min(B0, m.xh * 0.29);
  const ws = e.width < 0.5 ? lerp(0.55, 1, e.width * 2) : lerp(1, 1.7, e.width * 2 - 1);
  // both moved as a share of the way to their ends, so each slider keeps moving them to 100 and leaves them be at 0.5
  const c = e.crossbar, a = e.aperture;
  const barY = (y: number, lo: number, hi: number) => (c <= 0.5 ? y + (Math.min(Math.max(lo, y - cap * BAR_SPAN), y) - y) * (1 - 2 * c)
    : y + (Math.max(Math.min(hi, y + cap * BAR_SPAN), y) - y) * (2 * c - 1));
  const open = (share: number, most = 0.75) => (a <= 0.5 ? share + (most - share) * (1 - 2 * a) : share - share * (2 * a - 1));
  return { cap, xh: m.xh, asc: m.asc, desc: m.desc, V, B, b, D: V * 0.85 + B * 0.15, T: (V + B) / 2, L: Math.max(B, V * LONE), cw: f => f * cap * ws,
    flat: V * (0.2 + 1.6 * e.apex), barY, open };
}

const p = (x: number, y: number, k: Kind = 'o'): P => [x, y, k];
const box = (x0: number, y0: number, x1: number, y1: number, k: Kind = 'o'): P[] => [p(x0, y0, k), p(x1, y0, k), p(x1, y1, k), p(x0, y1, k)];
const one = (W: number, sb: [number, number], outer: P[], ...holes: P[][]): Shape => ({ W, sb, outer: [outer], holes });
const mirror = (s: Shape): Shape => {
  const f = (r: P[]) => r.map(([x, y, k]): P => [s.W - x, y, k]);
  return { W: s.W, sb: [s.sb[1], s.sb[0]], outer: s.outer.map(f), holes: s.holes.map(f) };
};
/** A shape turned half round, about the middle of a letter `H` high. */
const turn = (s: Shape, H: number): Shape => {
  const f = (r: P[]) => r.map(([x, y, k]): P => [s.W - x, H - y, k]);
  return { W: s.W, sb: [s.sb[1], s.sb[0]], outer: s.outer.map(f), holes: s.holes.map(f) };
};
const shift = (s: Shape, dx: number, dy: number, W = s.W + dx): Shape => {
  const f = (r: P[]) => r.map(([x, y, k]): P => [x + dx, y + dy, k]);
  return { W, sb: s.sb, outer: s.outer.map(f), holes: s.holes.map(f) };
};
/** Shapes laid over each other: their outlines together, their holes together. */
const join = (W: number, sb: [number, number], ...ss: Shape[]): Shape => ({ W, sb, outer: ss.flatMap(s => s.outer), holes: ss.flatMap(s => s.holes) });

/* ---- slanted strokes: a line is a point and a direction; a stroke's sides are its line moved across */
interface Ln { x: number; y: number; dx: number; dy: number }
const ln = (x0: number, y0: number, x1: number, y1: number): Ln => ({ x: x0, y: y0, dx: x1 - x0, dy: y1 - y0 });
const xAt = (l: Ln, y: number) => l.x + (y - l.y) * l.dx / l.dy;
const yAt = (l: Ln, x: number) => l.y + (x - l.x) * l.dy / l.dx;
const slide = (l: Ln, d: number): Ln => ({ ...l, x: l.x + d });
const meet = (a: Ln, b: Ln, k: Kind): P => {
  const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / (a.dx * b.dy - a.dy * b.dx);
  return [a.x + a.dx * t, a.y + a.dy * t, k];
};
/** How wide across a stroke D thick runs, slanting dx over dy. */
const across = (D: number, dx: number, dy: number) => D * Math.hypot(dx, dy) / Math.abs(dy);
/** A slanted stroke whose left side (toward −x) runs through (ax, ay) and right side through (bx, by), D thick:
    its sides and how wide across it is. */
function stroke(ax: number, ay: number, bx: number, by: number, D: number) {
  let h = D;
  for (let i = 0; i < 8; i++) h = across(D, bx - ax - h, by - ay);
  const L = ln(ax, ay, bx - h, by);
  return { L, R: slide(L, h), h };
}
/** A slanted stroke D thick whose one side is the line `side`, the other `dir` (+1 right, −1 left) of it. */
function beside(side: Ln, D: number, dir: 1 | -1) {
  const o = slide(side, dir * across(D, side.dx, side.dy));
  return dir > 0 ? { L: side, R: o } : { L: o, R: side };
}

/* ---- the shapes several letters share, at any height H with level strokes B */

/** An O: a box with a box cut out. */
const O = (W: number, H: number, V: number, B: number) => one(W, [0.75, 0.75], box(0, 0, W, H, 'b'), box(V, B, W - V, H - B, 'k'));
/** A C: an O open on the right, its ends cut level `ya` in from the top and bottom. */
const C = (W: number, H: number, V: number, B: number, ya: number) => one(W, [0.75, 0.45], [p(0, 0, 'b'), p(W, 0, 'b'), p(W, ya), p(W - V, ya), p(W - V, B, 'k'), p(V, B, 'k'),
  p(V, H - B, 'k'), p(W - V, H - B, 'k'), p(W - V, H - ya), p(W, H - ya), p(W, H, 'b'), p(0, H, 'b')]);
/** An S: a box bowl open on the right above one open on the left, their ends cut level, coming in by `share` of the
    room inside each bowl. */
function S(W: number, H: number, V: number, B: number, share: number) {
  const m = H / 2, ya = B + ((H - 3 * B) / 2) * share;
  return one(W, [0.65, 0.65], [p(0, 0, 'b'), p(W, 0, 'b'), p(W, m + B / 2, 'b'), p(V, m + B / 2, 'k'), p(V, H - B, 'k'), p(W - V, H - B, 'k'), p(W - V, H - ya),
    p(W, H - ya), p(W, H, 'b'), p(0, H, 'b'), p(0, m - B / 2, 'b'), p(W - V, m - B / 2, 'k'), p(W - V, B, 'k'), p(V, B, 'k'), p(V, ya), p(0, ya)]);
}
/** A V: two strokes leaning in to a foot `f` wide. */
function V_(W: number, H: number, D: number, f: number) {
  const c = W / 2, h = across(D, c, H);
  // a foot wider than the two strokes would part them
  f = Math.min(f, h * 1.6);
  const Li = slide(ln(0, H, c - f / 2, 0), h), Ri = slide(ln(W, H, c + f / 2, 0), -h);
  return one(W, [0.3, 0.3], [p(0, H), p(xAt(Li, H), H), meet(Li, Ri, 'i'), p(xAt(Ri, H), H), p(W, H), p(c + f / 2, 0), p(c - f / 2, 0)]);
}
/** A W: two Vs sharing a middle stroke's peak. */
function W_(W: number, H: number, D: number, f: number) {
  const p1 = W * 0.25, p2 = W - p1, c = W / 2, h = across(D, p1, H);
  f = Math.min(f, h * 1.4);
  const s1 = beside(ln(0, H, p1 - f / 2, 0), D, 1), s4 = beside(ln(W, H, p2 + f / 2, 0), D, -1);
  const s2 = stroke(c - f / 2, H, p1 + f / 2, 0, D), s3 = stroke(p2 - f / 2, 0, c + f / 2, H, D);
  return one(W, [0.25, 0.25], [p(0, H), p(xAt(s1.R, H), H), meet(s1.R, s2.L, 'i'), p(c - f / 2, H), p(c + f / 2, H), meet(s3.R, s4.L, 'i'), p(xAt(s4.L, H), H),
    p(W, H), p(p2 + f / 2, 0), p(p2 - f / 2, 0), meet(s3.L, s2.R, 'i'), p(p1 + f / 2, 0), p(p1 - f / 2, 0)]);
}
/** An X: two strokes crossing. */
function X_(W: number, H: number, D: number) {
  const a = stroke(0, H, W, 0, D), b = stroke(0, 0, W, H, D);
  return one(W, [0.25, 0.25], [p(0, H), p(xAt(a.R, H), H), meet(a.R, b.L, 'i'), p(xAt(b.L, H), H), p(W, H), meet(b.R, a.R, 'i'), p(W, 0), p(xAt(a.L, 0), 0),
    meet(a.L, b.R, 'i'), p(xAt(b.R, 0), 0), p(0, 0), meet(b.L, a.L, 'i')]);
}
/** A Z: two level strokes and a slanted one between them. */
function Z_(W: number, H: number, B: number, D: number) {
  const s = stroke(0, B, W, H - B, D);
  return one(W, [0.5, 0.5], [p(0, H), p(W, H), p(W, H - B), p(xAt(s.R, B), B, 'i'), p(W, B), p(W, 0), p(0, 0), p(0, B), p(xAt(s.L, H - B), H - B, 'i'), p(0, H - B)]);
}
/** A K: a stem `top` high, an arm up from it to the height H and a leg down from the arm. */
function K_(W: number, H: number, top: number, V: number, D: number) {
  const yj = H * 0.4;
  // the arm's middle runs from the stem's side at yj to the top right corner, less half its width
  let h = D;
  for (let i = 0; i < 8; i++) h = across(D, W - h / 2 - V, H - yj);
  const arm = ln(V, yj, W - h / 2, H), aL = slide(arm, -h / 2), aR = slide(arm, h / 2);
  const jx = lerp(V, W - h / 2, 0.3), jy = lerp(yj, H, 0.3);
  let g = D;
  for (let i = 0; i < 8; i++) g = across(D, W - g / 2 - jx, jy);
  const leg = ln(jx, jy, W - g / 2, 0), lL = slide(leg, -g / 2), lR = slide(leg, g / 2);
  return one(W, [1, 0.25], [p(0, 0), p(V, 0), p(V, yAt(aR, V), 'i'), meet(aR, lL, 'i'), p(W - g, 0), p(W, 0), meet(lR, aR, 'i'), p(W, H), p(W - h, H),
    p(V, yAt(aL, V), 'i'), p(V, top), p(0, top)]);
}
/** A stem `top` high with a bowl `H` high beside it (b, and turned, p d q). */
function stemBowl(W: number, H: number, top: number, V: number, B: number) {
  return one(W, [1, 0.75], [p(0, 0), p(W, 0, 'b'), p(W, H, 'b'), p(V, H, 'c'), p(V, top), p(0, top)], [p(V, B, 'c'), p(W - V, B, 'k'), p(W - V, H - B, 'k'), p(V, H - B, 'c')]);
}
/** An n: a stem and a shoulder, the stem `top` high. */
function N_(W: number, H: number, top: number, V: number, B: number) {
  return one(W, [1, 1], [p(0, 0), p(V, 0), p(V, H - B, 'c'), p(W - V, H - B, 'k'), p(W - V, 0), p(W, 0), p(W, H, 'b'), p(V, H, 'c'), p(V, top), p(0, top)]);
}
/** A g or a y's descender: from the foot of a stem at the right, along under the bowl to the left. */
function tail(W: number, V: number, b: number, desc: number): P[] {
  return [p(W - V, 0, 'c'), p(W - V, desc + b, 'k'), p(0, desc + b), p(0, desc), p(W, desc, 'b')];
}

type Fn = (d: BasicDims) => Shape;
/** The ends of a C or an S come this far in from the top and bottom: the level stroke and a share of the room inside. */
const reach = (H: number, B: number, share: number) => B + (H / 2 - B) * share;

const CAPS: Record<string, Fn> = {
  A: d => {
    const { cap: H, B, D } = d, W = d.cw(0.62) + 2 * D, c = W / 2, f = d.flat;
    const h = across(D, c - f / 2, H), ff = Math.min(f, h * 1.6), Li = slide(ln(0, 0, c - ff / 2, H), h), Ri = slide(ln(W, 0, c + ff / 2, H), -h);
    const top = meet(Li, Ri, 'i'), yb = d.barY(H * 0.24 + B / 2, B / 2 + H * ROOM, top[1] - B / 2 - H * ROOM) - B / 2;
    return one(W, [0.25, 0.25], [p(0, 0), p(xAt(Li, 0), 0), p(xAt(Li, yb), yb, 'c'), p(xAt(Ri, yb), yb, 'c'), p(xAt(Ri, 0), 0), p(W, 0), p(c + ff / 2, H), p(c - ff / 2, H)],
      ...(top[1] > yb + B + 4 ? [[p(xAt(Li, yb + B), yb + B, 'c'), p(xAt(Ri, yb + B), yb + B, 'c'), top]] : []));
  },
  B: d => {
    // two bowls stacked on the stem, the upper a little narrower, sharing the bar between them
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.42), m = d.barY(H * 0.53, 1.5 * B + H * ROOM, H - 1.5 * B - H * ROOM), Wu = W - d.cw(0.05);
    return { W, sb: [1, 0.75], outer: [[p(0, 0), p(W, 0, 'b'), p(W, m + B / 2, 'b'), p(0, m + B / 2)], [p(0, m - B / 2), p(Wu, m - B / 2, 'b'), p(Wu, H, 'b'), p(0, H)]],
      holes: [[p(V, B, 'c'), p(W - V, B, 'k'), p(W - V, m - B / 2, 'k'), p(V, m - B / 2, 'c')], [p(V, m + B / 2, 'c'), p(Wu - V, m + B / 2, 'k'), p(Wu - V, H - B, 'k'), p(V, H - B, 'c')]] };
  },
  C: d => C(2 * d.V + d.cw(0.42), d.cap, d.V, d.B, reach(d.cap, d.B, d.open(0.42))),
  D: d => {
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.44);
    return one(W, [1, 0.75], [p(0, 0), p(W, 0, 'b'), p(W, H, 'b'), p(0, H)], [p(V, B, 'c'), p(W - V, B, 'k'), p(W - V, H - B, 'k'), p(V, H - B, 'c')]);
  },
  E: d => {
    const { cap: H, V, B } = d, W = V + d.cw(0.4), m = d.barY(H * 0.51, 1.5 * B + H * ROOM, H - 1.5 * B - H * ROOM), Wm = W - d.cw(0.04);
    return one(W, [1, 0.45], [p(0, 0), p(W, 0), p(W, B), p(V, B, 'c'), p(V, m - B / 2, 'c'), p(Wm, m - B / 2), p(Wm, m + B / 2), p(V, m + B / 2, 'c'), p(V, H - B, 'c'),
      p(W, H - B), p(W, H), p(0, H)]);
  },
  F: d => {
    const { cap: H, V, B } = d, W = V + d.cw(0.38), m = d.barY(H * 0.49, B / 2 + H * ROOM, H - 1.5 * B - H * ROOM), Wm = W - d.cw(0.04);
    return one(W, [1, 0.45], [p(0, 0), p(V, 0), p(V, m - B / 2, 'c'), p(Wm, m - B / 2), p(Wm, m + B / 2), p(V, m + B / 2, 'c'), p(V, H - B, 'c'), p(W, H - B), p(W, H), p(0, H)]);
  },
  G: d => {
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.44), ya = reach(H, B, d.open(0.42, 0.65)), xg = W * 0.52;
    // the bar's top: its middle moves between the foot and the upper end
    const yg = d.barY(Math.max(H * 0.5, 2 * B + 4) - B / 2, 1.5 * B + H * ROOM, H - ya - B / 2 - H * ROOM) + B / 2;
    return one(W, [0.75, 0.75], [p(0, 0, 'b'), p(W, 0, 'b'), p(W, yg), p(xg, yg), p(xg, yg - B), p(W - V, yg - B, 'c'), p(W - V, B, 'k'), p(V, B, 'k'), p(V, H - B, 'k'),
      p(W - V, H - B, 'k'), p(W - V, H - ya), p(W, H - ya), p(W, H, 'b'), p(0, H, 'b')]);
  },
  H: d => {
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.44), m = d.barY(H * 0.51, B / 2 + H * ROOM, H - B / 2 - H * ROOM);
    return one(W, [1, 1], [p(0, 0), p(V, 0), p(V, m - B / 2, 'c'), p(W - V, m - B / 2, 'c'), p(W - V, 0), p(W, 0), p(W, H), p(W - V, H), p(W - V, m + B / 2, 'c'),
      p(V, m + B / 2, 'c'), p(V, H), p(0, H)]);
  },
  I: d => one(d.V, [1, 1], box(0, 0, d.V, d.cap)),
  J: d => {
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.34), yj = reach(H, B, d.open(0.5));
    return one(W, [0.6, 1], [p(0, 0, 'b'), p(W, 0, 'b'), p(W, H), p(W - V, H), p(W - V, B, 'k'), p(V, B, 'k'), p(V, yj), p(0, yj)]);
  },
  K: d => K_(d.V + d.cw(0.5), d.cap, d.cap, d.V, d.D),
  L: d => {
    const { cap: H, V, B } = d, W = V + d.cw(0.36);
    return one(W, [1, 0.45], [p(0, 0), p(W, 0), p(W, B), p(V, B, 'c'), p(V, H), p(0, H)]);
  },
  M: d => {
    const { cap: H, V, D } = d, W = 2 * V + d.cw(0.62), c = W / 2, a = V * 0.3;
    const dl = ln(a, H, c, 0), h = across(D, dl.dx, dl.dy), f = Math.min(d.flat, h * 1.4);
    const l = beside(ln(a, H, c - f / 2, 0), D, 1), r = beside(ln(W - a, H, c + f / 2, 0), D, -1);
    return one(W, [1, 1], [p(0, 0), p(V, 0), p(V, yAt(l.L, V), 'i'), p(c - f / 2, 0), p(c + f / 2, 0), p(W - V, yAt(r.R, W - V), 'i'), p(W - V, 0), p(W, 0), p(W, H),
      p(xAt(r.L, H), H), meet(l.R, r.L, 'i'), p(xAt(l.R, H), H), p(0, H)]);
  },
  N: d => {
    const { cap: H, V, D } = d, W = 2 * V + d.cw(0.44), s = stroke(0, H, W, 0, D);
    return one(W, [1, 1], [p(0, 0), p(V, 0), p(V, yAt(s.L, V), 'i'), p(xAt(s.L, 0), 0), p(W, 0), p(W, H), p(W - V, H), p(W - V, yAt(s.R, W - V), 'i'), p(xAt(s.R, H), H), p(0, H)]);
  },
  O: d => O(2 * d.V + d.cw(0.46), d.cap, d.V, d.B),
  P: d => {
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.4), yp = d.barY(H * 0.4 + B / 2, B / 2 + H * ROOM, H - 1.5 * B - H * ROOM) - B / 2;
    return one(W, [1, 0.75], [p(0, 0), p(V, 0), p(V, yp, 'c'), p(W, yp, 'b'), p(W, H, 'b'), p(0, H)], [p(V, yp + B, 'c'), p(W - V, yp + B, 'k'), p(W - V, H - B, 'k'), p(V, H - B, 'c')]);
  },
  Q: d => {
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.46), tq = d.cw(0.1) + V * 0.3;
    // an O whose foot runs on past its right side in a short tail
    return one(W, [0.75, 0.4], [p(0, 0, 'b'), p(W + tq, 0), p(W + tq, B), p(W, B, 'c'), p(W, H, 'b'), p(0, H, 'b')], box(V, B, W - V, H - B, 'k'));
  },
  R: d => {
    // the bowl's foot moves down less than other bars, so the leg under it keeps a slope at any weight
    const { cap: H, V, B, D } = d, W = 2 * V + d.cw(0.42), yp = d.barY(H * 0.42 + B / 2, H * 0.33 + B / 2, H - 1.5 * B - H * ROOM) - B / 2, xj = V + d.cw(0.12);
    const leg = beside(ln(xj, yp, W - across(D, W - xj, yp) * 0.98, 0), D, 1), xr = xAt(leg.R, yp);
    return one(W, [1, 0.4], [p(0, 0), p(V, 0), p(V, yp, 'c'), p(xj, yp, 'c'), p(xAt(leg.L, 0), 0), p(xAt(leg.R, 0), 0), ...(xr < W - 2 ? [p(xr, yp, 'i'), p(W, yp, 'b')] : []),
      p(W, H, 'b'), p(0, H)], [p(V, yp + B, 'c'), p(W - V, yp + B, 'k'), p(W - V, H - B, 'k'), p(V, H - B, 'c')]);
  },
  S: d => S(2 * d.V + d.cw(0.4), d.cap, d.V, d.B, d.open(0.5)),
  T: d => {
    const { cap: H, V, B } = d, W = V + d.cw(0.52), c = W / 2;
    return one(W, [0.4, 0.4], [p(0, H), p(0, H - B), p(c - V / 2, H - B, 'c'), p(c - V / 2, 0), p(c + V / 2, 0), p(c + V / 2, H - B, 'c'), p(W, H - B), p(W, H)]);
  },
  U: d => {
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.44);
    return one(W, [1, 1], [p(0, H), p(0, 0, 'b'), p(W, 0, 'b'), p(W, H), p(W - V, H), p(W - V, B, 'k'), p(V, B, 'k'), p(V, H)]);
  },
  V: d => V_(d.cw(0.58) + 2 * d.D, d.cap, d.D, d.flat),
  W: d => W_(d.cw(0.86) + 3 * d.D, d.cap, d.D, d.flat),
  X: d => X_(d.cw(0.5) + 2 * d.D, d.cap, d.D),
  Y: d => {
    const { cap: H, V, D } = d, W = d.cw(0.56) + 2 * D, c = W / 2, yj = H * 0.42;
    let h = D;
    for (let i = 0; i < 8; i++) h = across(D, c - h / 2, H - yj);
    const l = ln(h / 2, H, c, yj), r = ln(W - h / 2, H, c, yj), lL = slide(l, -h / 2), lR = slide(l, h / 2), rL = slide(r, -h / 2), rR = slide(r, h / 2);
    return one(W, [0.3, 0.3], [p(0, H), p(xAt(lR, H), H), meet(lR, rL, 'i'), p(xAt(rL, H), H), p(W, H), p(c + V / 2, yAt(rR, c + V / 2), 'c'), p(c + V / 2, 0), p(c - V / 2, 0),
      p(c - V / 2, yAt(lL, c - V / 2), 'c')]);
  },
  Z: d => Z_(d.cw(0.44) + d.D, d.cap, d.B, d.D)
};

const LOWER: Record<string, Fn> = {
  a: d => {
    const { xh: H, V, b } = d, W = 2 * V + d.cw(0.32), hb = 2 * b + (H - 3 * b) * 0.55;
    return one(W, [0.7, 1], [p(0, H), p(W, H, 'b'), p(W, 0), p(0, 0, 'b'), p(0, hb, 'b'), p(W - V, hb, 'c'), p(W - V, H - b, 'k'), p(0, H - b)],
      [p(V, b, 'k'), p(W - V, b, 'c'), p(W - V, hb - b, 'c'), p(V, hb - b, 'k')]);
  },
  b: d => stemBowl(2 * d.V + d.cw(0.34), d.xh, d.asc, d.V, d.b),
  c: d => C(2 * d.V + d.cw(0.32), d.xh, d.V, d.b, reach(d.xh, d.b, d.open(0.42))),
  d: d => mirror(stemBowl(2 * d.V + d.cw(0.34), d.xh, d.asc, d.V, d.b)),
  e: d => {
    const { xh: H, V, b } = d, W = 2 * V + d.cw(0.34), lo = (H - 3 * b) * 0.48, ye = b + lo, ya = b + lo * d.open(0.42);
    return one(W, [0.75, 0.6], [p(0, 0, 'b'), p(W, 0, 'b'), p(W, ya), p(W - V, ya), p(W - V, b, 'k'), p(V, b, 'k'), p(V, ye, 'c'), p(W, ye), p(W, H, 'b'), p(0, H, 'b')],
      [p(V, ye + b, 'c'), p(W - V, ye + b, 'c'), p(W - V, H - b, 'k'), p(V, H - b, 'k')]);
  },
  f: d => {
    const { xh: H, asc: A, V, b } = d, xf = V * 0.6, Wb = xf + V + d.cw(0.12), W = xf + V + d.cw(0.18);
    return one(W, [0.5, 0.3], [p(xf, 0), p(xf + V, 0), p(xf + V, H - b, 'c'), p(Wb, H - b), p(Wb, H), p(xf + V, H, 'c'), p(xf + V, A - b, 'k'), p(W, A - b), p(W, A),
      p(xf, A, 'b'), p(xf, H, 'c'), p(0, H), p(0, H - b), p(xf, H - b, 'c')]);
  },
  g: d => {
    const { xh: H, desc, V, b } = d, W = 2 * V + d.cw(0.34);
    return one(W, [0.75, 1], [p(0, 0, 'b'), ...tail(W, V, b, desc), p(W, H), p(0, H, 'b')], [p(V, b, 'k'), p(W - V, b, 'c'), p(W - V, H - b, 'c'), p(V, H - b, 'k')]);
  },
  h: d => N_(2 * d.V + d.cw(0.32), d.xh, d.asc, d.V, d.b),
  i: d => ({ W: d.V, sb: [1, 1], outer: [box(0, 0, d.V, d.xh), dot(d, 0)], holes: [] }),
  j: d => {
    const { xh: H, desc, V, b } = d, W = V + d.cw(0.16);
    return { W, sb: [0.3, 1], outer: [[p(W - V, H), p(W, H), p(W, desc, 'b'), p(0, desc), p(0, desc + b), p(W - V, desc + b, 'k')], dot(d, W - V)], holes: [] };
  },
  k: d => K_(d.V + d.cw(0.36), d.xh, d.asc, d.V, d.D),
  l: d => one(d.V, [1, 1], box(0, 0, d.V, d.asc)),
  m: d => {
    const { xh: H, V, b } = d, c = d.cw(0.24), x2 = V + c, W = 3 * V + 2 * c;
    return { ...one(W, [1, 1], [p(0, 0), p(V, 0), p(V, H - b, 'c'), p(x2, H - b, 'k'), p(x2, 0), p(x2 + V, 0), p(x2 + V, H - b, 'c'), p(W - V, H - b, 'k'), p(W - V, 0), p(W, 0),
      p(W, H, 'b'), p(0, H)]), bowl: (c + 2 * V) / 2 };
  },
  n: d => N_(2 * d.V + d.cw(0.32), d.xh, d.xh, d.V, d.b),
  o: d => O(2 * d.V + d.cw(0.34), d.xh, d.V, d.b),
  p: d => turnDown(stemBowl(2 * d.V + d.cw(0.34), d.xh, d.xh - d.desc, d.V, d.b), d.xh),
  q: d => mirror(turnDown(stemBowl(2 * d.V + d.cw(0.34), d.xh, d.xh - d.desc, d.V, d.b), d.xh)),
  r: d => {
    const { xh: H, V, b } = d, W = V + d.cw(0.22);
    return one(W, [1, 0.3], [p(0, 0), p(V, 0), p(V, H - b, 'c'), p(W, H - b), p(W, H, 'b'), p(0, H)]);
  },
  s: d => S(2 * d.V + d.cw(0.3), d.xh, d.V, d.b, d.open(0.5)),
  t: d => {
    const { xh: H, asc: A, V, b } = d, xt = V * 0.6, W = xt + V + d.cw(0.16), top = H + (A - H) * 0.5;
    return one(W, [0.5, 0.4], [p(xt, top), p(xt + V, top), p(xt + V, H, 'c'), p(W, H), p(W, H - b), p(xt + V, H - b, 'c'), p(xt + V, b, 'k'), p(W, b), p(W, 0),
      p(xt, 0, 'b'), p(xt, H - b, 'c'), p(0, H - b), p(0, H), p(xt, H, 'c')]);
  },
  u: d => {
    const { xh: H, V, b } = d, W = 2 * V + d.cw(0.32);
    return one(W, [1, 1], [p(0, H), p(0, 0, 'b'), p(W, 0), p(W, H), p(W - V, H), p(W - V, b, 'c'), p(V, b, 'k'), p(V, H)]);
  },
  v: d => V_(d.cw(0.44) + 2 * d.D, d.xh, d.D, d.flat),
  w: d => W_(d.cw(0.66) + 3 * d.D, d.xh, d.D, d.flat),
  x: d => X_(d.cw(0.4) + 2 * d.D, d.xh, d.D),
  y: d => {
    const { xh: H, desc, D } = d, W = d.cw(0.44) + 2 * D;
    // the right stroke runs on down into the descender, the left one stops on it
    const r = stroke(W * 0.18, desc, W, H, D), cx = xAt(r.L, 0) + r.h / 2;
    let h = D;
    for (let i = 0; i < 8; i++) h = across(D, cx - h / 2, H);
    const l = ln(h / 2, H, cx, 0), lL = slide(l, -h / 2), lR = slide(l, h / 2);
    return one(W, [0.3, 0.3], [p(0, H), p(xAt(lR, H), H), meet(lR, r.L, 'i'), p(xAt(r.L, H), H), p(W, H), p(xAt(r.R, desc), desc), p(xAt(r.L, desc), desc), meet(r.L, lL, 'c')]);
  },
  z: d => Z_(d.cw(0.34) + d.D, d.xh, d.b, d.D)
};

/** A b turned upside down about the middle of the x-height, its stem now hanging into the descender (p, q). */
function turnDown(s: Shape, xh: number): Shape {
  const f = (r: P[]) => r.map(([x, y, k]): P => [x, xh - y, k]);
  return { ...s, outer: s.outer.map(f), holes: s.holes.map(f) };
}
/** The dot of an i or j, over a stem standing at x. */
function dot(d: BasicDims, x: number): P[] {
  const room = d.asc - d.xh, s = Math.min(d.V * 1.05, room * 0.6), y = d.xh + Math.max(s * 0.55, (room - s) * 0.5);
  return box(x + (d.V - s) / 2, y, x + (d.V + s) / 2, y + s);
}

const FIGURES: Record<string, Fn> = {
  '0': d => O(2 * d.V + d.cw(0.32), d.cap, d.V, d.B),
  '1': d => {
    const { cap: H, V, B } = d, x0 = d.cw(0.14), W = x0 + V;
    return one(W, [0.5, 1], [p(x0, 0), p(W, 0), p(W, H), p(0, H), p(0, H - B), p(x0, H - B, 'c')]);
  },
  '2': d => {
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.34), m = H * 0.5, ya = reach(H, B, d.open(0.45, 0.6));
    return one(W, [0.75, 0.75], [p(0, 0), p(W, 0), p(W, B), p(V, B, 'c'), p(V, m - B / 2, 'k'), p(W, m - B / 2, 'b'), p(W, H, 'b'), p(0, H, 'b'), p(0, H - ya), p(V, H - ya),
      p(V, H - B, 'k'), p(W - V, H - B, 'k'), p(W - V, m + B / 2, 'k'), p(0, m + B / 2, 'b')]);
  },
  '3': d => {
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.34), m = H * 0.5, xm = W * 0.3;
    return one(W, [0.6, 0.75], [p(0, 0), p(W, 0, 'b'), p(W, H, 'b'), p(0, H), p(0, H - B), p(W - V, H - B, 'k'), p(W - V, m + B / 2, 'c'), p(xm, m + B / 2), p(xm, m - B / 2),
      p(W - V, m - B / 2, 'c'), p(W - V, B, 'k'), p(0, B)]);
  },
  '4': d => {
    const { cap: H, V, B, D } = d, W = V + d.cw(0.48), xs = W - V, yb = d.barY(H * 0.28 + B / 2, B / 2 + H * ROOM, H * 0.45) - B / 2;
    const s = beside(ln(0, yb + B, xs, H), D, 1), y = yAt(s.R, xs);
    return one(W, [0.3, 1], [p(xs, H), p(W, H), p(W, 0), p(xs, 0), p(xs, yb, 'c'), p(0, yb), p(0, yb + B)],
      ...(y > yb + B + 4 ? [[p(xAt(s.R, yb + B), yb + B, 'i'), p(xs, yb + B, 'c'), p(xs, y, 'i')]] : []));
  },
  '5': d => {
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.34), m = H * 0.52, ya = reach(H, B, d.open(0.45, 0.6));
    return one(W, [0.75, 0.75], [p(0, 0, 'b'), p(W, 0, 'b'), p(W, m + B / 2, 'b'), p(V, m + B / 2, 'c'), p(V, H - B, 'c'), p(W, H - B), p(W, H), p(0, H), p(0, m - B / 2),
      p(W - V, m - B / 2, 'k'), p(W - V, B, 'k'), p(V, B, 'k'), p(V, ya), p(0, ya)]);
  },
  '6': d => six(d),
  '7': d => {
    const { cap: H, B, D } = d, W = d.cw(0.42) + D, s = stroke(W * 0.16, 0, W, H - B, D);
    return one(W, [0.5, 0.4], [p(0, H), p(W, H), p(W, H - B), p(xAt(s.R, 0), 0), p(xAt(s.L, 0), 0), p(xAt(s.L, H - B), H - B, 'i'), p(0, H - B)]);
  },
  '8': d => {
    // two bowls stacked, the upper a little narrower, sharing the bar between them
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.36), m = H * 0.52, du = d.cw(0.025);
    return { W, sb: [0.75, 0.75], outer: [box(0, 0, W, m + B / 2, 'b'), box(du, m - B / 2, W - du, H, 'b')],
      holes: [box(V, B, W - V, m - B / 2, 'k'), box(V + du, m + B / 2, W - V - du, H - B, 'k')] };
  },
  '9': d => turn(six(d), d.cap)
};
function six(d: BasicDims): Shape {
  const { cap: H, V, B } = d, W = 2 * V + d.cw(0.34), m = H * 0.52, ya = reach(H, B, d.open(0.45, 0.6));
  return one(W, [0.75, 0.75], [p(0, 0, 'b'), p(W, 0, 'b'), p(W, m + B / 2, 'b'), p(V, m + B / 2, 'c'), p(V, H - B, 'k'), p(W - V, H - B, 'k'), p(W - V, H - ya), p(W, H - ya),
    p(W, H, 'b'), p(0, H, 'b')], [p(V, B, 'k'), p(W - V, B, 'k'), p(W - V, m - B / 2, 'k'), p(V, m - B / 2, 'c')]);
}

/* ---- punctuation and symbols */

/** A dot's side: as wide as the heavier stroke. */
const dotSize = (d: BasicDims) => Math.max(d.V, d.B) * 1.05;
const solid = (W: number, sb: [number, number], ...outer: P[][]): Shape => ({ W, sb, outer, holes: [] });
/** A comma standing on y: a dot with its foot run down to the left. */
const comma = (S: number, y = 0): P[] => [p(0, y + S), p(S, y + S), p(S, y - S * 0.6), p(S * 0.3, y - S * 0.6), p(0, y)];
/** A shape with x and y swapped: a V on its side is a <. */
const sideways = (s: Shape): Shape => {
  const f = (r: P[]) => r.map(([x, y, k]): P => [y, x, k]);
  return { ...s, outer: s.outer.map(f), holes: s.holes.map(f) };
};
/** A chevron pointing left, `w` across and `h` high, its point at the height cy. */
const chevron = (d: BasicDims, w: number, h: number, cy: number) => shift(sideways(V_(h, w, d.D * 0.9, d.flat * 0.6)), 0, cy - h / 2, w);
const chevrons = (d: BasicDims, n: 1 | 2, right: boolean) => {
  const w = d.xh * 0.42, h = d.xh * 0.6, st = w * 0.62 + d.V * 0.4, c = chevron(d, w, h, d.xh * 0.5);
  const s = join(w + (n - 1) * st, [0.6, 0.6], ...Array.from({ length: n }, (_, i) => shift(c, i * st, 0, 0)));
  return right ? mirror(s) : s;
};
/** Commas as quotes: raised to the cap height (’), turned half round there (‘), or on the baseline (‚). */
const quotes = (d: BasicDims, n: 1 | 2, at: 'open' | 'close' | 'low') => {
  const S = dotSize(d), top = d.cap - S;
  const c = at === 'low' ? comma(S) : at === 'close' ? comma(S, top) : comma(S, top).map(([x, y, k]): P => [S - x, 2 * top + S * 0.4 - y, k]);
  return solid(S + (n - 1) * (S + d.V * 0.6), [0.6, 0.6], ...Array.from({ length: n }, (_, i) => c.map(([x, y, k]): P => [x + i * (S + d.V * 0.6), y, k])));
};
/** A bar across the middle of the x-height, `W` long. */
const dash = (d: BasicDims, W: number) => solid(W, [0.6, 0.6], box(0, d.xh * 0.5 - d.L / 2, W, d.xh * 0.5 + d.L / 2));
/** The letters inside © ® ™: the design at `f` of its size, its strokes thinning less, so the letter stays open. */
function scaled(d: BasicDims, f: number): BasicDims {
  const w = f ** 0.6, cap = d.cap * f;
  return { ...d, cap, xh: d.xh * f, asc: d.asc * f, desc: d.desc * f, V: d.V * w, B: Math.min(d.B * w, cap * 0.29), b: Math.min(d.b * w, cap * 0.29), D: d.D * w, T: d.T * w, L: d.L * w,
    cw: g => d.cw(g) * f, flat: d.flat * w };
}
/** A letter in a round-cornered frame: © and ®. */
function framed(d: BasicDims, ch: string): Shape {
  // the frame stands alone round the letter, so it thins with the level strokes only as far as a lone one does
  const s = scaled(d, 0.5), L = CAPS[ch](s), H = d.cap, t = Math.min(d.V, d.L) * 0.8, W = Math.max(H, L.W + 2 * t + d.cw(0.16));
  const inner = shift(L, (W - L.W) / 2, (H - s.cap) / 2, W);
  return { W, sb: [0.75, 0.75], bowl: W / 2, outer: [box(0, 0, W, H, 'b'), ...inner.outer], holes: [box(t, t, W - t, H - t, 'k'), ...inner.holes] };
}
/** A bar t thick from (x0, y0) to (x1, y1), at any angle. */
function bar(x0: number, y0: number, x1: number, y1: number, t: number): P[] {
  const l = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / l * t / 2, ny = (x1 - x0) / l * t / 2;
  return [p(x0 + nx, y0 + ny), p(x1 + nx, y1 + ny), p(x1 - nx, y1 - ny), p(x0 - nx, y0 - ny)];
}
/** The upright bars through $ and ¢, above and below a shape `H` high. */
function struck(s: Shape, d: BasicDims, H: number): Shape {
  const w = d.V * 0.55, c = s.W / 2, e = d.cap * 0.12;
  return { ...s, outer: [...s.outer, box(c - w / 2, H - d.B, c + w / 2, H + e), box(c - w / 2, -e, c + w / 2, d.B)] };
}

const MARKS: Record<string, Fn> = {
  '.': d => { const S = dotSize(d); return solid(S, [0.8, 0.8], box(0, 0, S, S)); },
  ',': d => { const S = dotSize(d); return solid(S, [0.8, 0.8], comma(S)); },
  ':': d => { const S = dotSize(d); return solid(S, [0.8, 0.8], box(0, 0, S, S), box(0, d.xh - S, S, d.xh)); },
  ';': d => { const S = dotSize(d); return solid(S, [0.8, 0.8], comma(S), box(0, d.xh - S, S, d.xh)); },
  '…': d => { const S = dotSize(d), st = S + d.V * 0.8; return solid(S + 2 * st, [0.8, 0.8], ...[0, 1, 2].map(i => box(i * st, 0, i * st + S, S))); },
  '!': d => { const S = dotSize(d), g = Math.max(S * 0.6, d.B * 0.7); return solid(S, [1, 1], box(0, S + g, S, d.cap), box(0, 0, S, S)); },
  '¡': d => turn(MARKS['!'](d), d.xh),
  '?': d => {
    const { cap: H, V, B } = d, W = 2 * V + d.cw(0.3), S = dotSize(d), g = Math.max(S * 0.6, B * 0.7), c = W / 2, yq = Math.max(S + g + B, H * 0.36);
    const ya = H - reach(H, B, 0.5), s = Math.min(V, S);
    // the top of a 2 whose middle bar turns down into a short stem over the dot
    const top = [p(0, ya), p(0, H, 'b'), p(W, H, 'b'), p(W, yq, 'b'), p(c + s / 2, yq, 'c'), p(c + s / 2, S + g), p(c - s / 2, S + g), p(c - s / 2, yq + B),
      p(W - V, yq + B, 'k'), p(W - V, H - B, 'k'), p(V, H - B, 'k'), p(V, ya)];
    return solid(W, [0.75, 0.75], top, box(c - S / 2, 0, c + S / 2, S));
  },
  '¿': d => turn(MARKS['?'](d), d.xh),
  "'": d => solid(d.V, [0.8, 0.8], box(0, d.cap - d.cap * 0.32, d.V, d.cap)),
  '"': d => solid(d.V * 2 + d.V * 0.7, [0.8, 0.8], box(0, d.cap * 0.68, d.V, d.cap), box(d.V * 1.7, d.cap * 0.68, d.V * 2.7, d.cap)),
  '‘': d => quotes(d, 1, 'open'),
  '’': d => quotes(d, 1, 'close'),
  '“': d => quotes(d, 2, 'open'),
  '”': d => quotes(d, 2, 'close'),
  '‚': d => quotes(d, 1, 'low'),
  '„': d => quotes(d, 2, 'low'),
  '‹': d => chevrons(d, 1, false),
  '›': d => chevrons(d, 1, true),
  '«': d => chevrons(d, 2, false),
  '»': d => chevrons(d, 2, true),
  '(': d => {
    const { V, B } = d, lo = -d.cap * 0.16, hi = d.cap * 1.06, W = V + d.cw(0.14);
    return one(W, [0.8, 0.4], [p(0, lo, 'b'), p(W, lo), p(W, lo + B), p(V, lo + B, 'k'), p(V, hi - B, 'k'), p(W, hi - B), p(W, hi), p(0, hi, 'b')]);
  },
  ')': d => mirror(MARKS['('](d)),
  '[': d => {
    const { V, B } = d, lo = -d.cap * 0.16, hi = d.cap * 1.06, W = V + d.cw(0.12);
    return one(W, [1, 0.4], [p(0, lo), p(W, lo), p(W, lo + B), p(V, lo + B, 'c'), p(V, hi - B, 'c'), p(W, hi - B), p(W, hi), p(0, hi)]);
  },
  ']': d => mirror(MARKS['['](d)),
  '{': d => {
    const { V, B } = d, lo = -d.cap * 0.16, hi = d.cap * 1.06, x1 = V * 0.7, W = x1 + V + d.cw(0.1), m = d.cap * 0.45;
    // a [ standing in from the left, with a nub out to the left at the middle
    return one(W, [0.6, 0.4], [p(x1, lo, 'b'), p(W, lo), p(W, lo + B), p(x1 + V, lo + B, 'k'), p(x1 + V, hi - B, 'k'), p(W, hi - B), p(W, hi), p(x1, hi, 'b'),
      p(x1, m + B / 2, 'c'), p(0, m + B / 2), p(0, m - B / 2), p(x1, m - B / 2, 'c')]);
  },
  '}': d => mirror(MARKS['{'](d)),
  '-': d => dash(d, d.V + d.cw(0.26)),
  '–': d => dash(d, d.cw(0.6)),
  '—': d => dash(d, d.cw(1.05)),
  '_': d => solid(d.cw(0.62), [0.2, 0.2], box(0, -d.cap * 0.16 - d.L, d.cw(0.62), -d.cap * 0.16)),
  '/': d => {
    const lo = -d.cap * 0.1, hi = d.cap * 1.04, W = d.cw(0.36) + d.D, s = stroke(0, lo, W, hi, d.D);
    return solid(W, [0.2, 0.2], [p(0, lo), p(s.h, lo), p(W, hi), p(W - s.h, hi)]);
  },
  '\\': d => mirror(MARKS['/'](d)),
  '|': d => solid(d.V, [1, 1], box(0, -d.cap * 0.16, d.V, d.cap * 1.06)),
  '·': d => { const S = dotSize(d), c = d.xh * 0.5; return solid(S, [0.8, 0.8], box(0, c - S / 2, S, c + S / 2)); },
  '•': d => { const S = dotSize(d) * 1.6, c = d.xh * 0.5; return { ...solid(S, [0.8, 0.8], box(0, c - S / 2, S, c + S / 2, 'b')), bowl: S / 2 }; },

  '&': d => {
    // a small closed bowl over a larger one open on the right, and a slanted leg from under the small bowl out to the
    // foot at the right
    const { cap: H, V, B, D } = d, Wl = 2 * V + d.cw(0.36), W = Wl + d.cw(0.1), m = H * 0.56, xu = d.cw(0.03), Wu = Wl - d.cw(0.1), ya = reach(m + B / 2, B, 0.42);
    const leg = stroke(xu + V * 0.4, m + B / 2, W, 0, D);
    return { W, sb: [0.75, 0.3], bowl: Wu / 2, outer: [C(Wl, m + B / 2, V, B, ya).outer[0], box(xu, m - B / 2, xu + Wu, H, 'b'),
      [p(xAt(leg.L, m + B / 2), m + B / 2), p(xAt(leg.L, 0), 0), p(W, 0), p(xAt(leg.R, m + B / 2), m + B / 2)]],
      holes: [box(xu + V, m + B / 2, xu + Wu - V, H - B, 'k')] };
  },
  '@': d => {
    // a squared spiral: a frame running round from its foot, in at the right to a small bowl in its middle, the gaps
    // between them about a stroke (none left at the heaviest)
    const { cap: H, V, B } = d, lo = -d.cap * 0.18, ic = d.cw(0.2), gx = Math.max(V * 0.8, d.cw(0.08)), W = 3 * V + gx + ic, xi = V + gx;
    const room = H - lo - 2 * B, gy = Math.max(0, Math.min(d.L * 0.8, (room - 2 * B - H * 0.1) / 2)), y0 = lo + B + gy, y1 = H - B - gy, xe = W - V - gx * 0.5;
    return { W, sb: [0.75, 0.75], outer: [[p(0, lo, 'b'), p(xe, lo), p(xe, lo + B), p(V, lo + B, 'k'), p(V, H - B, 'k'), p(W - V, H - B, 'k'), p(W - V, y1, 'c'), p(xi, y1, 'b'),
      p(xi, y0, 'b'), p(W, y0, 'b'), p(W, H, 'b'), p(0, H, 'b')]], holes: [[p(xi + V, y0 + B, 'k'), p(W - V, y0 + B, 'c'), p(W - V, y1 - B, 'c'), p(xi + V, y1 - B, 'k')]] };
  },
  '#': d => {
    const { V, L: B } = d, H = d.cap * 0.9, W = 2 * V + d.cw(0.52), a = d.cw(0.12), y1 = H * 0.3, y2 = H * 0.7;
    return solid(W, [0.4, 0.4], box(a, 0, a + V, H), box(W - a - V, 0, W - a, H), box(0, y1 - B / 2, W, y1 + B / 2), box(0, y2 - B / 2, W, y2 + B / 2));
  },
  '$': d => struck(CAPS.S(d), d, d.cap),
  '%': d => {
    const { cap: H, V, B } = d, ws = 2 * V + d.cw(0.14), hs = 2 * B + d.cw(0.18), W = ws * 2 + d.cw(0.24), s = stroke(ws * 0.7, 0, W - ws * 0.7, H, d.D * 0.9);
    return { W, sb: [0.6, 0.6], outer: [box(0, H - hs, ws, H, 'b'), box(W - ws, 0, W, hs, 'b'), [p(xAt(s.L, 0), 0), p(xAt(s.R, 0), 0), p(xAt(s.R, H), H), p(xAt(s.L, H), H)]],
      bowl: ws / 2, holes: [box(V, H - hs + B, ws - V, H - B, 'k'), box(W - ws + V, B, W - V, hs - B, 'k')] };
  },
  '¢': d => struck(LOWER.c(d), d, d.xh),
  '€': d => {
    const C_ = CAPS.C(d), x = d.cw(0.12), s = shift(C_, x, 0), t = d.B * 0.8, H = d.cap;
    return { ...s, sb: [0.4, 0.45], outer: [...s.outer, ...[0.38, 0.6].map(f => box(0, H * f - t / 2, x + d.V + d.cw(0.1), H * f + t / 2))] };
  },
  '£': d => {
    const { cap: H, V, B } = d, x0 = d.cw(0.1), W = x0 + V + d.cw(0.36), yb = H * 0.42, xb = x0 + V + d.cw(0.16);
    return one(W, [0.6, 0.45], [p(0, 0), p(W, 0), p(W, B), p(x0 + V, B, 'c'), p(x0 + V, yb, 'c'), p(xb, yb), p(xb, yb + B), p(x0 + V, yb + B, 'c'), p(x0 + V, H - B, 'k'),
      p(W, H - B), p(W, H), p(x0, H, 'b'), p(x0, yb + B, 'c'), p(0, yb + B), p(0, yb), p(x0, yb, 'c'), p(x0, B, 'c'), p(0, B)]);
  },
  '¥': d => {
    const y = CAPS.Y(d), c = y.W / 2, w = d.cw(0.2) + d.V / 2, t = d.B * 0.75, H = d.cap;
    return { ...y, outer: [...y.outer, box(c - w, H * 0.16, c + w, H * 0.16 + t), box(c - w, H * 0.34, c + w, H * 0.34 + t)] };
  },
  '+': d => {
    const a = d.cw(0.2) + d.V / 2, cy = d.xh * 0.5, W = 2 * a;
    return solid(W, [0.6, 0.6], box(0, cy - d.L / 2, W, cy + d.L / 2), box(a - d.V / 2, cy - a, a + d.V / 2, cy + a));
  },
  '−': d => { const W = 2 * (d.cw(0.2) + d.V / 2); return solid(W, [0.6, 0.6], box(0, d.xh * 0.5 - d.L / 2, W, d.xh * 0.5 + d.L / 2)); },
  '×': d => { const w = 2 * (d.cw(0.15) + d.V / 2); return shift(X_(w, w, d.D), 0, d.xh * 0.5 - w / 2); },
  '÷': d => {
    const W = 2 * (d.cw(0.2) + d.V / 2), cy = d.xh * 0.5, S = dotSize(d) * 0.9, o = d.L / 2 + S * 0.45;
    return solid(W, [0.6, 0.6], box(0, cy - d.L / 2, W, cy + d.L / 2), box(W / 2 - S / 2, cy + o, W / 2 + S / 2, cy + o + S), box(W / 2 - S / 2, cy - o - S, W / 2 + S / 2, cy - o));
  },
  '=': d => {
    const W = 2 * (d.cw(0.2) + d.V / 2), cy = d.xh * 0.5, o = d.L / 2 + Math.max(d.L * 0.35, d.cap * 0.045);
    return solid(W, [0.6, 0.6], box(0, cy + o - d.L / 2, W, cy + o + d.L / 2), box(0, cy - o - d.L / 2, W, cy - o + d.L / 2));
  },
  '<': d => { const w = d.xh * 0.62; return { ...chevron(d, w, w * 1.3, d.xh * 0.5), sb: [0.6, 0.6] }; },
  '>': d => mirror(MARKS['<'](d)),
  '±': d => {
    const a = d.cw(0.2) + d.V / 2, cy = d.xh * 0.62, W = 2 * a, yb = cy - a - d.L * 0.6 - d.L;
    return solid(W, [0.6, 0.6], box(0, cy - d.L / 2, W, cy + d.L / 2), box(a - d.V / 2, cy - a, a + d.V / 2, cy + a), box(0, yb, W, yb + d.L));
  },
  '~': d => {
    const W = d.cw(0.5) + d.V, t = d.L, cy = d.xh * 0.5, a = d.cap * 0.07, n = 24, top: P[] = [], bot: P[] = [];
    // a band along a sine, end to end, its points left sharp so the curve is the band's own
    for (let i = 0; i <= n; i++) {
      const x = W * i / n, y = cy + a * Math.sin(Math.PI * 2 * i / n), sl = a * Math.PI * 2 / W * Math.cos(Math.PI * 2 * i / n), l = Math.hypot(1, sl);
      top.push(p(x - sl * t / 2 / l, y + t / 2 / l, i === 0 || i === n ? 'o' : 's'));
      bot.unshift(p(x + sl * t / 2 / l, y - t / 2 / l, i === 0 || i === n ? 'o' : 's'));
    }
    return solid(W, [0.5, 0.5], [...top, ...bot]);
  },
  '^': d => { const w = d.cw(0.36) + d.D, h = d.cap * 0.42; return shift(turn(V_(w, h, d.D * 0.9, d.flat), h), 0, d.cap - h); },
  '*': d => {
    const W = d.cw(0.44) + d.V, t = Math.min(d.L, W * 0.2), r = W / 2 - t / 2, cy = d.cap - W / 2;
    return solid(W, [0.5, 0.5], ...[90, 30, 150].map(a => { const dx = r * Math.cos(a * Math.PI / 180), dy = r * Math.sin(a * Math.PI / 180); return bar(W / 2 - dx, cy - dy, W / 2 + dx, cy + dy, t); }));
  },
  '°': d => {
    const t = Math.min(d.V, d.L) * 0.8, S = Math.max(d.cap * 0.36, 2 * t + d.cap * 0.14);
    return { W: S, sb: [0.6, 0.6], bowl: S / 2, outer: [box(0, d.cap - S, S, d.cap, 'b')], holes: [box(t, d.cap - S + t, S - t, d.cap - t, 'k')] };
  },
  '©': d => framed(d, 'C'),
  '®': d => framed(d, 'R'),
  '™': d => {
    const s = scaled(d, 0.42), T = CAPS.T(s), M = shift(CAPS.M(s), T.W + s.V * 0.6, 0), y = d.cap - s.cap;
    return shift(join(M.W, [0.5, 0.5], T, M), 0, y);
  },
  '§': d => {
    // two short S's, one over the other, sharing a level stroke
    const H = d.cap * 0.62, W = 2 * d.V + d.cw(0.3), up = shift(S(W, H, d.V, d.B, d.open(0.5)), 0, d.cap - H), dn = shift(S(W, H, d.V, d.B, d.open(0.5)), 0, d.cap - 2 * H + d.B);
    return join(W, [0.65, 0.65], up, dn);
  },
  '¶': d => {
    const { cap: H, V, B } = d, xa = d.cw(0.22), W = xa + 3 * V + d.cw(0.08), yb = H * 0.42;
    // a solid bowl on the left of two stems, the bar over them running on into it
    return { ...one(W, [0.75, 1], [p(xa, 0), p(xa + V, 0), p(xa + V, H - B, 'c'), p(W - V, H - B, 'c'), p(W - V, 0), p(W, 0), p(W, H), p(0, H, 'b'), p(0, yb, 'b'), p(xa, yb, 'c')]),
      bowl: (xa + V) / 2 };
  },
  '†': d => {
    const W = d.cw(0.26) + d.V, c = W / 2, y = d.cap * 0.62;
    return solid(W, [0.5, 0.5], box(c - d.V / 2, -d.cap * 0.12, c + d.V / 2, d.cap), box(0, y, W, y + d.L));
  },
  '‡': d => {
    const W = d.cw(0.26) + d.V, c = W / 2;
    return solid(W, [0.5, 0.5], box(c - d.V / 2, -d.cap * 0.12, c + d.V / 2, d.cap), box(0, d.cap * 0.66, W, d.cap * 0.66 + d.L), box(0, d.cap * 0.18, W, d.cap * 0.18 + d.L));
  },
  '`': d => { const S = dotSize(d) * 0.9, W = S * 1.6; return solid(W, [0.6, 0.6], bar(S * 0.45, d.cap - S * 0.45, W - S * 0.45, d.xh + S * 0.2, S * 0.9)); }
};

/** Every basic block character: the capitals, the lowercase, the figures and every mark. */
export const BASIC: Record<string, Fn> = { ...CAPS, ...LOWER, ...FIGURES, ...MARKS };

/** How round each kind of corner is, in font units (bowls as round as `b` but no rounder than their own width
    allows), and how deep the steps cut. */
export interface BasicRound { o: number; b: number; c: number; i: number; step: number }

/** The radii the design's corners take. */
export function basicRound(m: Metrics, d: BasicDims): BasicRound {
  const e = m.p, T = d.T, o = e.roundness * T;
  // oval bowls are as round as each letter allows; box bowls as round as their Corners, up to twice the stroke
  const b = Math.max(o, e.bowlForm === 'box' ? e.boxRound * 2 * T : 2 * d.cap);
  return { o, b, c: e.innerRound * T, i: e.joinRound * 0.8 * T, step: e.steps * 0.5 * T };
}

/** Whether the corner at b, coming from a and going on to c, is near square (a step is cut only there). */
function square(a: P, b: P, c: P) {
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
  return Math.abs(ux * vx + uy * vy) < 0.35 * Math.hypot(ux, uy) * Math.hypot(vx, vy);
}

/** The basic block letter `ch` as outlines, y up with the baseline at 0: every ring as corner points carrying their
    radii and steps (for roundContour), outlines wound positive and holes negative (the holes last), its width and
    its side-bearing factors. Null when there is no basic block for it. */
export function basicRings(ch: string, d: BasicDims, round: BasicRound): { rings: Pt[][]; holes: number; W: number; sb: [number, number] } | null {
  const fn = BASIC[ch];
  if (!fn) return null;
  const s = fn(d), b = Math.min(round.b, s.bowl ?? s.W / 2);
  // the inside of a bowl as round as its outside, less the stroke
  const r: Record<Kind, number> = { o: round.o, b, k: Math.max(round.c, b - d.T), c: round.c, i: round.i, s: 0 };
  const ring = (vs: P[], sign: number) => {
    const pts: Pt[] = vs.map(([x, y, k], i) => ({ x, y, r: r[k],
      ...(round.step > 0 && (k === 'o' || k === 'b') && square(vs[(i + vs.length - 1) % vs.length], vs[i], vs[(i + 1) % vs.length]) ? { step: round.step } : {}) }));
    return (signedArea(pts) < 0) !== (sign < 0) ? pts.reverse() : pts;
  };
  return { rings: [...s.outer.map(q => ring(q, 1)), ...s.holes.map(q => ring(q, -1))], holes: s.holes.length, W: s.W, sb: s.sb };
}
