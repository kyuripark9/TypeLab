/* Slot block letters (the Slot Blocks card: build 'blocks', blockForm 'slots').
   Each letter is a solid block, its corners rounded, with its counters cut in as slots: E is a block
   with two slots running in from the right, O a block with a tall round hole. There is no skeleton;
   every letter is one or more outlines of corners, each with its own radius.

   Shapes are drawn on the design grid they were measured on (a letter 224 wide and 175 high, walls
   25 and slots 28 across, outer corners 50 round), then fitted to the design: X() and Y() stretch
   positions to the letter's width and height, `tv` and `th` are the thin walls (upright and level),
   `g` the slots, and `k` scales the radii. Positions are measured down from the top. The grid's size
   is GRID_W and GRID_H; its walls and slots are the design's at Weight 60 (see blockDims).

   Each corner's radius is of one of four kinds, so the design's controls reach them all:
   'o' outer corners and the rounds of counters (Roundness), 'e' the ends of arms and slots, round
   right off at full Roundness, 'i' the small rounds where one part turns into another (Joins,
   as drawn at 0.5), 's' always sharp. */
import { clamp, lerp, signedArea } from './geom';
import type { BlockPt } from './block-corners';
import { weighed } from '../params';
import type { Metrics } from './font';
import type { Pt } from './types';

type Kind = 'o' | 'e' | 'i' | 's';
/** A corner: x, y (down from the top), its radius as drawn, and the kind of radius. */
type V = [number, number, number, Kind];
interface Shape { outer: V[][]; holes: V[][]; W: number }

interface BlockDims {
  /** the letter's width and height */ W: number; H: number;
  /** thin walls, upright and level, and the width of the slots (`g0` as Weight leaves it, before Inner space: the
      marks' dots and gaps keep it) */ tv: number; th: number; g: number; g0: number;
  /** radii scale: one grid unit */ k: number;
  /** grid positions fitted to the letter */ X: (v: number) => number; Y: (v: number) => number;
  /** where the heavy part of a letter starts, across, as drawn (124 across): `S0`; where the slots running in from
      the right end (the right edge of E's stem), as deep as Openness has them: `S`, and how far that is from `S0`:
      `dS`; and the right edge of a closed counter (O's), as wide as Inner space has it: `Sc` */ S0: number; S: number; dS: number; Sc: number;
  /** a closed counter's edge drawn `v` across, moved with Sc (its left edge, the thin wall, stays) */ cx: (v: number) => number;
  /** an open side drawn at `x` (font units), moved by Openness toward `closed` or toward `open` */ open: (x: number, closed: number, open: number) => number;
  /** how far down (up, below zero) Crossbar height moves a bar that has room `up` above it and `down` below */ bar: (up: number, down: number) => number;
  /** how much wider (narrower, below 1) Inner space makes a closed counter than as drawn */ kc: number;
  /** outer corner radius */ R: number;
  /** the moves it was fitted with, for the small letters of © ® ™ */ moves: Moves;
  /** the letter forms the Letters page picks that slot blocks draw: I, J, M, Q and the dots */ forms: Forms;
}
type Forms = Pick<Metrics['p'], 'iForm' | 'jForm' | 'mForm' | 'qForm' | 'dots' | 'dotSize'>;

/** How Openness, Inner space and Crossbar height move a letter, each from -1 to 1 (0 as drawn). */
interface Moves { open: number; inner: number; bar: number }

/** The design grid the shapes are drawn on: a letter this wide and high. */
const GRID_W = 224, GRID_H = 175;
/** The furthest Crossbar height moves a bar, as a share of the letter's height, however much room it has. */
const BAR_SPAN = 0.22;

/** The dims of a letter W wide and H high, `k` font units to a grid unit, with these walls and slots: grid
    positions fitted to it, its heavy part starting 124 across, its outer corners 50 round, and its slots and
    counters moved as `mv` says, each as a share of the way to the most the letters hold. blockDims and scaled()
    both build theirs here, so the small letters of © ® ™ get every field the full-size ones do. */
function fit(W: number, H: number, k: number, tv: number, th: number, g0: number, mv: Moves, forms: Forms): BlockDims {
  const X = (v: number) => v * W / GRID_W, Y = (v: number) => v * k, S0 = X(124);
  const toward = (v: number, lo: number, hi: number, by: number) => (by === 0 ? v : by > 0 ? v + (hi - v) * by : v - (v - lo) * -by);
  // Openness: the slots from a stub (closed) to running in to a wall's thickness off the left side (open)
  const S = toward(S0, X(160), tv * 1.3, mv.open);
  // Inner space: the counters from a third of their width to a wall off the right side, the slots from 0.4 of their
  // width to as wide as an E's three walls leave them
  const Sc = toward(S0, tv + (S0 - tv) * 0.35, W - tv * 1.15, mv.inner), kc = (Sc - tv) / (S0 - tv);
  const g = toward(g0, g0 * 0.4, Math.max(g0, (H - 3 * th) / 2 * 0.92), mv.inner);
  const bar = (up: number, down: number) => (mv.bar >= 0 ? -Math.min(up, H * BAR_SPAN) * mv.bar : Math.min(down, H * BAR_SPAN) * -mv.bar);
  return { W, H, tv, th, g, g0, k, X, Y, S0, S, dS: S - S0, Sc, cx: v => (kc === 1 ? X(v) : tv + (X(v) - tv) * kc),
    open: (x, closed, open) => toward(x, closed, open, mv.open), bar, kc, R: 50 * k, moves: mv, forms };
}

/** The measurements of a block letter `H` high, from the design's weight, width, contrast, openness, inner space and
    crossbars. */
export function blockDims(H: number, p: Pick<Metrics['p'], 'weight' | 'width' | 'vWeight' | 'hWeight' | 'contrast' | 'reverse' | 'counter' | 'aperture' | 'crossbar'> & Forms): BlockDims {
  const ws = p.width < 0.5 ? lerp(0.6, 1, p.width * 2) : lerp(1, 1.5, (p.width - 0.5) * 2);
  const W = H * (GRID_W / GRID_H) * ws, k = H / GRID_H;
  // heavier, the walls thicken and the slots close up; Contrast thins the level walls (reversed, the upright ones) as
  // far as a third
  const t = H * (0.07 + 0.12 * p.weight), g = H * (0.28 - 0.2 * p.weight), thin = 1 - 0.7 * clamp((p.contrast - 0.05) / 0.95);
  const tv = t * weighed(1, p.vWeight, 0.4, 1.6) * (p.reverse > 0.5 ? thin : 1), th = t * weighed(1, p.hWeight, 0.4, 1.6) * (p.reverse > 0.5 ? 1 : thin);
  return fit(W, H, k, tv, th, g, { open: 2 * p.aperture - 1, inner: 2 * p.counter - 1, bar: 2 * p.crossbar - 1 },
    { iForm: p.iForm, jForm: p.jForm, mForm: p.mForm, qForm: p.qForm, dots: p.dots, dotSize: p.dotSize });
}

const v = (x: number, y: number, r: number, kind: Kind = 'o'): V => [x, y, r, kind];
/** A slot or bar with fully round ends, x0..x1 across and y0..y1 down. */
const pill = (x0: number, y0: number, x1: number, y1: number): V[] => {
  const r = Math.min(x1 - x0, y1 - y0) / 2;
  return [v(x0, y0, r, 'e'), v(x1, y0, r, 'e'), v(x1, y1, r, 'e'), v(x0, y1, r, 'e')];
};
const box = (x0: number, y0: number, x1: number, y1: number, r: number): V[] => [v(x0, y0, r), v(x1, y0, r), v(x1, y1, r), v(x0, y1, r)];
/** How round a dot D across is: right round or square as Dots picks, else `f` of it (a rounded square). */
const dotR = (d: BlockDims, D: number, f = 0.3) => (d.forms.dots === 'round' ? D / 2 : d.forms.dots === 'square' ? D * 0.04 : D * f);
/** How much bigger Dots' Size draws a dot than as drawn, from 0.7 to 1.5 times (as the stroke letters' dots). */
const dotK = (d: BlockDims) => { const s = d.forms.dotSize; return s === 0.5 ? 1 : s < 0.5 ? 0.7 + 0.6 * s : 1 + (s - 0.5); };
/** A dot `s` across, its left side at x and its foot at y (down from the top). */
const dot = (d: BlockDims, x: number, y: number, s: number, f?: number) => box(x, y - s, x + s, y, dotR(d, s, f));
/** A shape drawn right to left (x runs back from the right edge). */
const mirror = (s: Shape): Shape => {
  const f = (ring: V[]) => ring.map(([x, y, r, k]): V => [s.W - x, y, r, k]);
  return { W: s.W, outer: s.outer.map(f), holes: s.holes.map(f) };
};
/** A shape turned half round. */
const turn = (s: Shape, H: number): Shape => {
  const f = (ring: V[]) => ring.map(([x, y, r, k]): V => [s.W - x, H - y, r, k]);
  return { W: s.W, outer: s.outer.map(f), holes: s.holes.map(f) };
};

type BlockFn = (d: BlockDims) => Shape;
const one = (d: BlockDims, outer: V[], ...holes: V[][]): Shape => ({ W: d.W, outer: [outer], holes });

/* The slot across the top of A, B, P and R: `off` grid units below the top wall, `h` slots high. */
const topSlot = (d: BlockDims, off: number, h: number) => { const y0 = d.th + off * d.k; return { y0, y1: y0 + d.g * h }; };

/** How far Crossbar height moves the spine of a letter with two slots, one under the other (E, S): the top slot as
    much wider as the bottom one narrows, each keeping at least `SLOT_KEEP` of its width. */
const SLOT_KEEP = 0.35;
const spine = (d: BlockDims) => d.bar(d.g * (1 - SLOT_KEEP), d.g * (1 - SLOT_KEEP));

const E: BlockFn = d => {
  const { W, H, th, g, S, R } = d, dy = spine(d), g1 = g + dy, g2 = g - dy, mid = dy === 0 ? H - 2 * th - 2 * g : H - 2 * th - g1 - g2;
  return one(d, [v(0, 0, R), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(S, th, g1 / 2, 'e'), v(S, th + g1, g1 / 2, 'e'), v(W, th + g1, mid / 2, 'e'),
    v(W, H - th - g2, mid / 2, 'e'), v(S, H - th - g2, g2 / 2, 'e'), v(S, H - th, g2 / 2, 'e'), v(W, H - th, th / 2, 'e'), v(W, H, th / 2, 'e'), v(0, H, R)]);
};

const S_: BlockFn = d => {
  const { W, H, th, g, S, R, k, X } = d, dy = spine(d), g1 = g + dy, g2 = g - dy, xs = X(98) + d.dS;
  return one(d, [v(0, 0, R), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(xs, th, g1 / 2, 'e'), v(xs, th + g1, g1 / 2, 'e'), v(W, th + g1, 50 * k),
    v(W, H, R), v(0, H, th / 2, 'e'), v(0, H - th, th / 2, 'e'), v(S, H - th, g2 / 2, 'e'), v(S, H - th - g2, g2 / 2, 'e'), v(0, H - th - g2, 48 * k)]);
};

const O: BlockFn = d => {
  const { W, H, tv, th, Sc, k } = d, cr = (Sc - tv) / 2;
  return one(d, box(0, 0, W, H, 45 * k), box(tv, th, Sc, H - th, cr));
};

const SIX: BlockFn = d => {
  const { W, H, tv, th, g, S, Sc, R, k, Y } = d, top0 = th + g * 1.6, y0 = Math.max(top0 + th, Y(97));
  // the bowl's top (its crossbar) moves, keeping the slot over it and the hole under it open
  const dy = d.bar(top0 - th - g * 0.6, H - th - g * 0.6 - y0), top = top0 + dy;
  return one(d, [v(0, 0, R), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(S, th, 25 * k), v(S, top, 12 * k, 'i'), v(W, top, 40 * k), v(W, H, R), v(0, H, R)],
    box(tv, y0 + dy, Sc, H - th, 36 * k));
};

/** Each block letter by character: every capital, figure and punctuation mark (tests/engine.test.ts checks the set). */
export const BLOCKS: Record<string, BlockFn> = {
  A: d => {
    const { W, H, tv, th, g, X, k, R } = d, s = topSlot(d, -1, 1.07), y0 = s.y0;
    // the bar under the slot moves, the slot keeping some of its height and the legs some room under the bar
    const y1 = s.y1 + d.bar(s.y1 - y0 - g * SLOT_KEEP, H - th * 1.5 - s.y1 - th), ct = y1 + th, xa = d.cx(99), xf = xa + X(0.27 * (H - ct) / k);
    return one(d, [v(0, 0, R), v(W, 0, R), v(W, H, 45 * k), v(xf, H, 40 * k), v(xa, ct, 40 * k), v(tv, ct, 40 * k), v(tv, H, tv / 2, 'e'), v(0, H, tv / 2, 'e')],
      pill(tv, y0, xa, y1));
  },
  B: d => {
    const { W, H, tv, th, g, Sc: S, k, R } = d, s = topSlot(d, -3, 1.25), y0 = s.y0;
    // the waist moves, both counters keeping some of their height
    const dy = d.bar(s.y1 - y0 - g * SLOT_KEEP, H - th - (s.y1 + g * 0.85) - g * SLOT_KEEP), y1 = s.y1 + dy, yB = y1 + g * 0.85;
    // the top counter and the mouth under it touch at one corner, like squares of a chessboard
    return one(d, [v(0, 0, R), v(W, 0, 28 * k), v(W, y1, 28 * k), v(S, y1, 0, 's'), v(S, yB, 0, 's'), v(W, yB, 40 * k), v(W, H, 45 * k), v(0, H, R)],
      [v(tv, y0, 15 * k, 'e'), v(S, y0, 25 * k), v(S, y1, 0, 's'), v(tv, y1, 15 * k, 'e')],
      [v(tv, yB, 30 * k), v(S, yB, 0, 's'), v(S, H - th, 45 * k), v(tv, H - th, 30 * k)]);
  },
  C: d => {
    const { W, H, th, S, k, R } = d;
    return one(d, [v(0, 0, R), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(S, th, 50 * k), v(S, H - th, 50 * k), v(W, H - th, th / 2, 'e'), v(W, H, th / 2, 'e'), v(0, H, R)]);
  },
  D: d => {
    const { W, H, tv, X, Y, k, R } = d;
    // straight sides running in to a blunt point on the right, round a counter like a play sign (its point no nearer the
    // right side than a wall)
    return one(d, [v(0, 0, R), v(X(123), 0, 34 * k), v(W, Y(55.5), 40 * k), v(W, H - Y(55.5), 40 * k), v(X(123), H, 34 * k), v(0, H, R)],
      [v(tv, Y(21), 38 * k), v(Math.min(d.cx(144.5), Math.max(X(144.5), W - tv * 1.6)), H / 2, 19 * k), v(tv, H - Y(21), 38 * k)]);
  },
  E,
  F: d => {
    const { W, H, th, g, S, Y, k, R } = d, a2 = Math.max(g * 0.6, Y(130) - Y(52) - g);
    // the middle arm moves, the top arm keeping most of a wall and the stem some length under the arm
    const a1 = Y(52) + d.bar(Y(52) - th * 0.8, H - th * 2 - (Y(52) + g + a2));
    return one(d, [v(0, 0, R), v(W, 0, a1 / 2, 'e'), v(W, a1, a1 / 2, 'e'), v(S, a1, g / 2, 'e'), v(S, a1 + g, g / 2, 'e'), v(W, a1 + g, a2 / 2, 'e'),
      v(W, a1 + g + a2, a2 / 2, 'e'), v(S, a1 + g + a2, 20 * k, 'i'), v(S, H, 35 * k), v(0, H, R)]);
  },
  G: d => {
    const { W, H, tv, th, g, S, X, Y, k, R } = d, y = Math.max(Y(53), th + g * 0.9), xt = X(163) + d.dS, xw = W - tv * 0.88;
    const yt = y + d.bar(y - th - g * 0.5, H - th - g * 0.5 - (y + g));
    // a C whose lower arm turns up the right side and in again, in a tongue under the top arm
    return one(d, [v(0, 0, R), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(S, th, 50 * k), v(S, H - th, 50 * k), v(xw, H - th, 30 * k), v(xw, yt + g, 22 * k),
      v(xt, yt + g, g / 2, 'e'), v(xt, yt, g / 2, 'e'), v(W, yt, 30 * k), v(W, H, R), v(0, H, R)]);
  },
  H: d => {
    const { W, H, tv, th, X, Y, k, R } = d, dy = d.bar(Y(82) - th * 1.5, H - Y(152.5) - th * 0.6), ct = Y(82) + dy;
    // Openness narrows the block over the bar and the leg under it
    const S = d.open(d.S0, (d.S0 + X(108)) / 2, Math.max(d.S0, W - tv * 1.3)), xt = d.open(X(108), (X(108) + W) / 2, Math.min(X(108), tv * 1.4));
    return one(d, [v(0, 0, R), v(xt, 0, 34 * k), v(xt, ct, 25 * k, 'i'), v(W, ct, 45 * k), v(W, H, 45 * k), v(S, H, 22 * k), v(S, Y(115) + dy, 20 * k),
      v(tv, Y(152.5) + dy, 10 * k, 'i'), v(tv, H, tv / 2, 'e'), v(0, H, tv / 2, 'e')]);
  },
  I: d => {
    const { W, H, th, g, k, R } = d;
    // as drawn (plain), a bar over a block; with bars, a block notched either side between them
    if (d.forms.iForm === 'bars') {
      const a = W * 0.28, b = W - a;
      return one(d, [v(0, 0, R), v(W, 0, R), v(W, th, th / 2, 'e'), v(b, th, 10 * k, 'i'), v(b, H - th, 10 * k, 'i'), v(W, H - th, th / 2, 'e'), v(W, H, R), v(0, H, R),
        v(0, H - th, th / 2, 'e'), v(a, H - th, 10 * k, 'i'), v(a, th, 10 * k, 'i'), v(0, th, th / 2, 'e')]);
    }
    return { W, outer: [pill(0, 0, W, th * 0.9), box(0, th + g, W, H, R)], holes: [] };
  },
  J: d => {
    const { W, H, tv, th, g, X, Y, k, R } = d, js = th + g * 0.8, tb = th * 0.9;
    // a cup: a heavy right side and a thin left one rising half the height round a slot
    if (d.forms.jForm === 'cup') {
      const xr = X(150), ys = H * 0.45;
      return one(d, [v(0, ys, tv / 2, 'e'), v(tv, ys, tv / 2, 'e'), v(tv, H - th, 30 * k), v(xr, H - th, 25 * k), v(xr, 0, 30 * k), v(W, 0, R), v(W, H, R), v(0, H, R)]);
    }
    // the top runs out to the left over a slot that turns down beside a thin stem
    return one(d, [v(0, 0, tb / 2, 'e'), v(W, 0, R), v(W, H, R), v(0, H, R), v(0, js, tv / 2, 'e'), v(tv, js, tv / 2, 'e'), v(tv, H - th, 30 * k),
      v(X(79.5), H - th, 25 * k), v(X(104), Y(80), 30 * k), v(X(105), tb, 45 * k), v(0, tb, tb / 2, 'e')]);
  },
  K: d => {
    const { H, th, X, Y, k } = d, tv = d.tv * 1.12, kn = th * 0.9;
    // the arm and leg meet higher or lower, the notch over them and the stem's foot keeping their room
    const dy = d.bar(Y(50) - kn - th * 0.5, H - th * 1.2 - Y(112)), y = (v: number) => Y(v) + dy;
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, kn, 10 * k, 'i'), v(X(137), kn, 10 * k, 'i'), v(X(137), 0, 12 * k), v(X(218), 0, 45 * k),
      v(X(218), y(50), 22 * k), v(X(206), y(78), 22 * k, 'i'), v(X(221), y(112), 30 * k), v(X(221), H, 45 * k), v(X(138.5), H, 30 * k), v(X(89.5), y(77), 25 * k),
      v(tv, y(77), 30 * k), v(tv, H, tv / 2, 'e'), v(0, H, tv / 2, 'e')]);
  },
  L: d => {
    const { W, H, S, Y, k, R } = d;
    return one(d, [v(0, 0, R), v(S, 0, 40 * k), v(S, Y(84), 30 * k, 'i'), v(W, Y(76), 45 * k), v(W, H, R), v(0, H, R)]);
  },
  M: d => {
    const { W, H, tv, th, S0: S, Y, k } = d, mn = th * 1.08, st = Y(77);
    // narrowed, the slots give way before the middle leg does
    const g = Math.min(d.g, (S - tv * 1.8) / 2), xa = tv + g, xb = S - g, leg = xb - xa;
    // a thin stem, a middle leg and a heavy right side hung from a bar with a notch over it; raised, the middle leg
    // stops well short of the baseline
    const foot = d.forms.mForm === 'raised' ? Math.max(st + g, H - Y(55)) : H;
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, mn, 12 * k, 'i'), v(S, mn, 12 * k, 'i'), v(S, 0, 13 * k), v(W, 0, 50 * k), v(W, H, 45 * k),
      v(S, H, 40 * k), v(S, st, g / 2, 'e'), v(xb, st, g / 2, 'e'), v(xb, foot, leg / 2, 'e'), v(xa, foot, leg / 2, 'e'), v(xa, st, g / 2, 'e'), v(tv, st, g / 2, 'e'),
      v(tv, H, tv / 2, 'e'), v(0, H, tv / 2, 'e')]);
  },
  N: d => {
    const { W, H, tv, X, Y, k, R } = d;
    // a heavy diagonal from the top left to the foot of a thin right stem, the slot between them coming to a round point
    return one(d, [v(0, 0, R), v(X(125), 0, 34 * k), v(W - tv, Y(145), 16.7 * k), v(W - tv, 0, tv / 2, 'e'), v(W, 0, tv / 2, 'e'), v(W, H, 45 * k),
      v(X(131), H, 10 * k), v(X(62), Y(119), 25 * k), v(tv, Y(119), 40 * k), v(tv, H, tv / 2, 'e'), v(0, H, tv / 2, 'e')]);
  },
  O,
  P: d => {
    const { W, H, tv, th, g, S, Sc, Y, k, R } = d, s = topSlot(d, -4, 1.18), y0 = s.y0;
    // the bowl's foot moves, its counter keeping some height and the stem some length under it
    const dy = d.bar(s.y1 - y0 - g * SLOT_KEEP, H - th * 1.5 - Y(105)), y1 = s.y1 + dy, yb = Y(105) + dy;
    return one(d, [v(0, 0, R), v(W, 0, 45 * k), v(W, yb, 57 * k), v(S, yb, 25 * k, 'i'), v(S, H, 40 * k), v(0, H, R)], pill(tv, y0, Sc, y1));
  },
  Q: d => {
    const { W, H, tv, th, g, Sc: S, X, k, R } = d, xq = X(199);
    // an O with a tail: a block in the bottom of its counter, running into its foot, or a bar sweeping out under it
    if (d.forms.qForm === 'inside') {
      const s = O(d), t = g * 0.9;
      return { ...s, outer: [...s.outer, box(Math.max(tv, S - t * 1.4), H - th - t, S + tv * 0.5, H - th * 0.5, t * 0.3)] };
    }
    if (d.forms.qForm === 'sweep') {
      const s = O(d), t = th * 0.9, x0 = W * 0.55, x1 = W + X(36);
      return { ...s, W: x1, outer: [...s.outer, pill(x0, H - t * 0.4, x1, H + t * 0.6)] };
    }
    // an O a little narrower, its foot running on to the right in a short spur
    return one(d, [v(0, 0, 50 * k), v(xq, 0, 50 * k), v(xq, H - g, 8 * k, 'i'), v(W, H - g, g / 2, 'e'), v(W, H, g / 2, 'e'), v(0, H, R)],
      box(tv, th, S, H - th, (S - tv) / 2));
  },
  R: d => {
    const { W, H, tv, th, g, Sc, X, Y, k, R } = d, s = topSlot(d, 2, 1), y0 = s.y0;
    // the bowl's foot and the leg's top move, the counter keeping some height and the leg some length
    const dy = d.bar(s.y1 - y0 - g * SLOT_KEEP, H - th * 1.2 - Y(103)), y1 = s.y1 + dy, y = (v: number) => Y(v) + dy;
    return one(d, [v(0, 0, R), v(W, 0, 40 * k), v(W, y(76), 18 * k), v(X(187), y(76), 12 * k, 'i'), v(X(216), H, 34 * k), v(X(126), H, 30 * k),
      v(X(90), y(103), 40 * k), v(tv, y(103), 40 * k), v(tv, H, tv / 2, 'e'), v(0, H, tv / 2, 'e')], pill(tv, y0, Math.min(Sc, X(187)), y1));
  },
  S: S_,
  T: d => {
    const { W, H, tv, th, k, R } = d;
    return one(d, [v(0, 0, th / 2, 'e'), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(W - tv * 1.1, th, 10 * k, 'i'), v(W - tv * 1.1, H, R), v(tv, H, R), v(tv, th, 10 * k, 'i'), v(0, th, th / 2, 'e')]);
  },
  U: d => {
    const { W, H, tv, th, X, k, R } = d, xt = d.open(X(125), X(100), W - tv * 1.3), xb = X(86) + (xt - X(125));
    // Openness narrows the heavy right side, the counter's slanted edge moving with it
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, H - th, 40 * k), v(xb, H - th, 40 * k), v(xt, 0, 45 * k), v(W, 0, 50 * k), v(W, H, R), v(0, H, R)]);
  },
  V: d => {
    const { W, H, tv, th, X, k, R } = d, xt = d.open(X(125), X(100), W - tv * 1.3), xb = X(83) + (xt - X(125));
    // a thin left stem and a heavy right side leaning in on it, meeting at the foot
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, H - th, 30 * k), v(xb, H - th, 20 * k), v(xt, 0, 45 * k), v(W, 0, 50 * k), v(W, H, R), v(0, H, R)]);
  },
  W: d => {
    const { W, H, tv, th, X, k, R } = d, g = Math.min(d.g, (W * 0.5 - 2 * tv) / 2), xa = tv + g, xb = xa + tv, xc = xb + g, x = xc + X(0.125 * (H - th) / k);
    const xd = d.open(x, xc + (x - xc) * 0.4, Math.max(x, W - tv * 1.3));
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, H - th, g / 2, 'e'), v(xa, H - th, g / 2, 'e'), v(xa, 0, tv / 2, 'e'), v(xb, 0, tv / 2, 'e'),
      v(xb, H - th, g / 2, 'e'), v(xc, H - th, g / 2, 'e'), v(xd, 0, 45 * k), v(W, 0, 50 * k), v(W, H, R), v(0, H, R)]);
  },
  X: d => {
    const { W, H, tv, X, Y, k } = d, ex = X(36), en = Y(26), ey = Y(50), o = 16 * k, t = 14 * k, s = 15 * k, i = 10 * k;
    // a block with a notch in each side, leaving four ears at the corners, like a bone
    return one(d, [v(0, 0, o), v(ex, 0, t), v(ex, en, i, 'i'), v(W - ex, en, i, 'i'), v(W - ex, 0, t), v(W, 0, o), v(W, ey, s), v(W - tv * 1.1, ey, i, 'i'),
      v(W - tv * 1.1, H - ey, i, 'i'), v(W, H - ey, s), v(W, H, o), v(W - ex, H, t), v(W - ex, H - en, i, 'i'), v(ex, H - en, i, 'i'), v(ex, H, t), v(0, H, o),
      v(0, H - ey, s), v(tv, H - ey, i, 'i'), v(tv, ey, i, 'i'), v(0, ey, s)]);
  },
  Y: d => {
    const { W, H, tv, th, X, Y, k } = d, yb0 = Y(92), yn0 = Math.max(yb0 + th, Y(120)), dy = d.bar(yb0 - th, H - th - yn0);
    const yb = yb0 + dy, yn = yn0 + dy, xl = X(84), xr = W - tv, xa = d.open(X(110), X(90), Math.max(X(110), W - tv * 1.3));
    // a thin left arm and a heavy right one round a slot, standing on a foot a little right of the middle
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, yb, 40 * k), v(xa, yb, 40 * k), v(xa, 0, 30 * k), v(W, 0, 50 * k),
      v(W, yn, 22 * k), v(xr, yn, 10 * k, 'i'), v(xr, H, 30 * k), v(xl, H, 30 * k), v(xl, yn, 20 * k, 'i'), v(0, yn, 40 * k)]);
  },
  Z: d => {
    const { W, H, th, g, X, k, R } = d, S = d.S0 - d.dS, slope = 0.294 * (H / GRID_H) / (W / GRID_W), yl = H - th - g, xl = X(99) + d.dS, yr = yl - slope * (W - xl);
    // a slot in from the left under the top, one in from the right over the foot, and a band slanting down between them
    return one(d, [v(0, 0, th / 2, 'e'), v(W, 0, R * 1.1), v(W, yr, 30 * k), v(xl, yl, 14 * k, 'e'), v(xl, H - th, 14 * k, 'e'), v(W, H - th, th / 2, 'e'), v(W, H, th / 2, 'e'),
      v(0, H, R), v(0, th + g + slope * S, 40 * k), v(S, th + g, 14 * k, 'e'), v(S, th, 14 * k, 'e'), v(0, th, th / 2, 'e')]);
  },

  '0': d => {
    const { W, H, tv, th, X, k } = d, c = (X(78) + X(146)) / 2, h = d.kc === 1 ? (X(146) - X(78)) / 2 : Math.min(c - tv, (X(146) - X(78)) / 2 * d.kc);
    const x0 = d.kc === 1 ? X(78) : c - h, x1 = d.kc === 1 ? X(146) : c + h;
    return one(d, box(0, 0, W, H, 45 * k), box(x0, th, x1, H - th, (x1 - x0) / 2));
  },
  '1': d => {
    const { W, H, th, X, k, R } = d;
    return one(d, [v(0, 0, th / 2, 'e'), v(W, 0, R), v(W, H, R), v(X(100), H, 40 * k), v(X(100), th, 15 * k, 'i'), v(0, th, th / 2, 'e')]);
  },
  '2': d => mirror(S_(d)),
  '3': d => mirror(E(d)),
  '4': d => {
    const { W, H, tv, th, Y, k, R } = d, yb0 = Y(100), yn0 = Math.max(yb0 + th, Y(128)), dy = d.bar(yb0 - th * 1.5, H - th - yn0);
    // Openness narrows the right side, its mouth from the top opening wider
    const S = d.open(d.S0, (d.S0 + tv) / 2, Math.max(d.S0, W - tv * 1.3));
    const yb = yb0 + dy, yn = yn0 + dy;
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, yb, 30 * k), v(S, yb, 30 * k), v(S, 0, 13 * k), v(W, 0, 45 * k), v(W, H, R),
      v(S, H, 30 * k), v(S, yn, 20 * k, 'i'), v(0, yn, 25 * k)]);
  },
  '5': d => {
    const { W, H, th, g, S, X, k } = d, dy = spine(d), g1 = g + dy, g2 = g - dy, xs = X(98) + d.dS;
    return one(d, [v(0, 0, 8 * k), v(W, 0, 4 * k), v(W, th, 4 * k), v(xs, th, g1 / 2, 'e'), v(xs, th + g1, g1 / 2, 'e'), v(W, th + g1, 45 * k),
      v(W, H, 50 * k), v(0, H, th / 2, 'e'), v(0, H - th, th / 2, 'e'), v(S, H - th, g2 / 2, 'e'), v(S, H - th - g2, g2 / 2, 'e'), v(0, H - th - g2, 20 * k)]);
  },
  '6': SIX,
  '7': d => {
    const { W, H, th, X, k, R } = d;
    return one(d, [v(0, 0, th / 2, 'e'), v(W, 0, R), v(W, H, R), v(X(112), H, 25 * k), v(X(70), th, 15 * k, 'i'), v(0, th, th / 2, 'e')]);
  },
  '8': d => {
    const { W, H, tv, th, g, Sc: S, k, R } = d, w = th + g * 1.7, y1 = w + d.bar(w - th - g * 0.6, H - th - g * 0.6 - (w + th)), y2 = y1 + th;
    return { W, outer: [box(0, 0, W, H, R)], holes: [box(tv, th, S, y1, (y1 - th) / 2), box(tv, y2, S, H - th, 36 * k)] };
  },
  '9': d => turn(SIX(d), d.H),

  '.': d => { const D = (d.tv + d.g) * dotK(d); return { W: D, outer: [dot(d, 0, d.H, D)], holes: [] }; },
  ',': d => { const D = d.tv + d.g; return { W: D, outer: [comma(d.H, D)], holes: [] }; },
  ':': d => { const D = (d.tv + d.g) * dotK(d); return { W: D, outer: [dot(d, 0, d.H, D), dot(d, 0, d.H * 0.35 + D / 2, D)], holes: [] }; },
  ';': d => {
    // (as wide as the comma, however big Size draws the dot: the dot stands over it)
    const D = d.tv + d.g, s = D * dotK(d);
    return { W: D, outer: [comma(d.H, D), dot(d, (D - s) / 2, d.H * 0.35 + s / 2, s)], holes: [] };
  },
  '!': d => {
    // (as wide as the stem, however big Size draws the dot: the dot stands under it)
    const D = d.tv + d.g, s = D * dotK(d);
    return { W: D, outer: [[v(0, 0, D * 0.3), v(D, 0, D * 0.3), v(D, d.H - D - d.g, D / 2, 'e'), v(0, d.H - D - d.g, D / 2, 'e')], dot(d, (D - s) / 2, d.H, s)], holes: [] };
  },
  '-': d => dash(d, d.X(120)),
  '?': d => {
    const { th, g, X, Y, H, k } = d, W = X(170), D = d.tv + g, xs = W * 0.4, yh = Y(96), xm = Math.max(X(40), X(92) - d.dS);
    // a head with a slot in from the left, a short stem under its middle and a dot
    return { W, outer: [[v(0, 0, 40 * k), v(W, 0, 40 * k), v(W, yh, 30 * k), v(xs + D, yh, 10 * k, 'i'), v(xs + D, H - D - g, D / 2, 'e'), v(xs, H - D - g, D / 2, 'e'),
      v(xs, yh, 10 * k, 'i'), v(0, yh, 25 * k), v(0, th + g, th / 2, 'e'), v(xm, th + g, g / 2, 'e'), v(xm, th, g / 2, 'e'), v(0, th, th / 2, 'e')],
    dot(d, xs + D / 2 - D * dotK(d) / 2, H, D * dotK(d))], holes: [] };
  },
  '(': d => ({ W: d.X(112), outer: [bracket(d, d.X(112))], holes: [] }),
  ')': d => mirror({ W: d.X(112), outer: [bracket(d, d.X(112))], holes: [] }),
  '/': d => {
    const { H, X, k } = d, W = X(130), t = X(62);
    return { W, outer: [[v(W - t, 0, 12 * k), v(W, 0, 12 * k), v(t, H, 12 * k), v(0, H, 12 * k)]], holes: [] };
  },
  '+': d => {
    const W = d.X(150), t = d.th * 1.5, cy = d.H * 0.55;
    return { W, outer: [pill(0, cy - t / 2, W, cy + t / 2), pill(W / 2 - t / 2, cy - W / 2, W / 2 + t / 2, cy + W / 2)], holes: [] };
  },
  '#': d => {
    const { W, H, tv, th, g, k } = d, c = W / 2, m = H / 2, n = g / 2;
    // a block with a notch in the middle of each side and a square hole in the middle
    return one(d, [v(0, 0, 30 * k), v(c - n, 0, 8 * k), v(c - n, th, n, 'e'), v(c + n, th, n, 'e'), v(c + n, 0, 8 * k), v(W, 0, 30 * k), v(W, m - n, 8 * k),
      v(W - tv, m - n, n, 'e'), v(W - tv, m + n, n, 'e'), v(W, m + n, 8 * k), v(W, H, 30 * k), v(c + n, H, 8 * k), v(c + n, H - th, n, 'e'), v(c - n, H - th, n, 'e'),
      v(c - n, H, 8 * k), v(0, H, 30 * k), v(0, m + n, 8 * k), v(tv, m + n, n, 'e'), v(tv, m - n, n, 'e'), v(0, m - n, 8 * k)],
      box(c - W * 0.2, m - H * 0.17, c + W * 0.2, m + H * 0.17, 12 * k));
  },
  '$': d => {
    const s = S_(d), t = d.tv, c = d.W * 0.55, e = d.Y(22);
    return { ...s, outer: [...s.outer, pill(c - t / 2, -e, c + t / 2, d.th), pill(c - t / 2, d.H - d.th, c + t / 2, d.H + e)] };
  },
  '%': d => {
    const { H, X, k } = d, W = X(230), D = d.tv + d.g, t = X(58);
    return { W, outer: [box(0, 0, D * 1.3, D * 1.3, D * 0.35), box(W - D * 1.3, H - D * 1.3, W, H, D * 0.35),
      [v(W - D * 1.3 - t, 0, 12 * k), v(W - D * 1.3, 0, 12 * k), v(D * 1.3 + t, H, 12 * k), v(D * 1.3, H, 12 * k)]], holes: [] };
  },
  '&': d => mirror(BLOCKS.B(d)),
  '@': d => {
    const { W, H, tv, th, g, X, Y, k, R } = d;
    // an O holding a small bar that runs in from its right side
    return { W, outer: [box(0, 0, W, H, R), [v(X(70), Y(62), 22 * k), v(W - tv, Y(62), 0, 's'), v(W - tv, Y(62) + g * 1.9, 0, 's'), v(X(70), Y(62) + g * 1.9, 22 * k)]],
      holes: [box(tv, th, W - tv, H - th, 40 * k)] };
  },
  "'": d => { const D = d.tv + d.g; return { W: D, outer: [quote(D, d.Y(62))], holes: [] }; },
  '"': d => { const D = d.tv + d.g, q = quote(D, d.Y(62)); return { W: D * 2 + d.g, outer: [q, q.map(([x, y, r, k]): V => [x + D + d.g, y, r, k])], holes: [] }; },

  '…': d => { const D = (d.tv + d.g) * dotK(d), st = D + d.g * 0.8; return { W: D + 2 * st, outer: [0, 1, 2].map(i => dot(d, i * st, d.H, D)), holes: [] }; },
  '¡': d => turn(BLOCKS['!'](d), d.H),
  '¿': d => turn(BLOCKS['?'](d), d.H),
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
  '[': d => {
    const { H, th, X, k } = d, W = X(90), t = d.tv * 1.2;
    return { W, outer: [[v(0, 0, 12 * k), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(t, th, 8 * k, 'i'), v(t, H - th, 8 * k, 'i'), v(W, H - th, th / 2, 'e'),
      v(W, H, th / 2, 'e'), v(0, H, 12 * k)]], holes: [] };
  },
  ']': d => mirror(BLOCKS['['](d)),
  '{': d => {
    const { H, th, X, k } = d, W = X(110), x1 = X(30), t = d.tv * 1.1, n = th * 0.55, m = H / 2;
    // a [ with its upright standing in from the left and a nub out to the left at the middle
    return { W, outer: [[v(x1, 0, 30 * k), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(x1 + t, th, 15 * k, 'i'), v(x1 + t, H - th, 15 * k, 'i'),
      v(W, H - th, th / 2, 'e'), v(W, H, th / 2, 'e'), v(x1, H, 30 * k), v(x1, m + n, 8 * k, 'i'), v(0, m + n, n, 'e'), v(0, m - n, n, 'e'), v(x1, m - n, 8 * k, 'i')]], holes: [] };
  },
  '}': d => mirror(BLOCKS['{'](d)),
  '–': d => dash(d, d.X(180)),
  '—': d => dash(d, d.X(330)),
  '_': d => { const t = d.th * 1.4, W = d.X(170), y = d.H + d.g * 0.4; return { W, outer: [pill(0, y, W, y + t)], holes: [] }; },
  '\\': d => mirror(BLOCKS['/'](d)),
  '|': d => { const W = d.tv * 1.15; return { W, outer: [pill(0, -d.Y(12), W, d.H + d.Y(25))], holes: [] }; },
  '·': d => { const D = (d.tv + d.g) * dotK(d), c = d.H * 0.55; return { W: D, outer: [dot(d, 0, c + D / 2, D)], holes: [] }; },
  '•': d => { const D = (d.tv + d.g) * 1.5 * dotK(d), c = d.H * 0.55; return { W: D, outer: [dot(d, 0, c + D / 2, D, 0.4)], holes: [] }; },

  '`': d => { const D = d.tv + d.g; return { W: D * 1.7, outer: [[v(0, 0, D * 0.3), v(D, 0, D * 0.3), v(D * 1.7, D * 1.2, D * 0.4, 'e'), v(D * 0.7, D * 1.2, D * 0.4, 'e')]], holes: [] }; },
  '¢': d => {
    const s = BLOCKS.C(d), t = d.tv, c = d.W * 0.55, e = d.Y(22);
    return { ...s, outer: [...s.outer, pill(c - t / 2, -e, c + t / 2, d.th), pill(c - t / 2, d.H - d.th, c + t / 2, d.H + e)] };
  },
  '€': d => {
    const x = d.X(34), s = shift(BLOCKS.C(d), x, 0), t = d.th * 0.9;
    return { ...s, outer: [...s.outer, ...[0.36, 0.62].map(f => pill(0, d.H * f - t / 2, x + d.X(60), d.H * f + t / 2))] };
  },
  '£': d => {
    const { H, th, X, k, R } = d, W = X(175), x0 = X(36), t = d.tv * 1.3, xs = x0 + t, y = d.Y(80), b = th * 0.9;
    // a stem with an arm out to the right at the top, a foot running both ways and a bar across
    return { W, outer: [[v(x0, 0, R * 0.8), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(xs, th, 10 * k, 'i'), v(xs, H - th, 10 * k, 'i'), v(W, H - th, th / 2, 'e'),
      v(W, H, th / 2, 'e'), v(0, H, th / 2, 'e'), v(0, H - th, th / 2, 'e'), v(x0, H - th, 10 * k, 'i')], pill(0, y, xs + X(40), y + b)], holes: [] };
  },
  '¥': d => {
    const { H, th, X, Y, k, R } = d, W = X(190), c = W / 2, f = d.tv * 0.9, xl = X(62), yv = Y(62), yf = Y(98), b = th * 0.85, y = Y(124);
    // two arms round a notch, on a foot with a bar across it
    return { W, outer: [[v(0, 0, xl * 0.3, 'e'), v(xl, 0, xl * 0.2, 'e'), v(c, yv, d.g / 2, 'i'), v(W - xl, 0, xl * 0.2, 'e'), v(W, 0, xl * 0.3, 'e'), v(W, yf, R),
      v(c + f, yf, 10 * k, 'i'), v(c + f, H, f / 2, 'e'), v(c - f, H, f / 2, 'e'), v(c - f, yf, 10 * k, 'i'), v(0, yf, R)], pill(X(40), y, W - X(40), y + b)], holes: [] };
  },
  '−': d => { const W = d.X(150), t = d.th * 1.5, cy = d.H * 0.55; return { W, outer: [pill(0, cy - t / 2, W, cy + t / 2)], holes: [] }; },
  '×': d => {
    const W = d.X(130), t = d.th * 1.5, cy = d.H * 0.55, r = W / 2 - t / 2;
    return { W, outer: [bar(W / 2 - r, cy - r, W / 2 + r, cy + r, t), bar(W / 2 - r, cy + r, W / 2 + r, cy - r, t)], holes: [] };
  },
  '÷': d => {
    const W = d.X(150), t = d.th * 1.5, cy = d.H * 0.55, D = d.tv + d.g * 0.5, o = t / 2 + d.g * 0.45;
    return { W, outer: [pill(0, cy - t / 2, W, cy + t / 2), box(W / 2 - D / 2, cy - o - D, W / 2 + D / 2, cy - o, D * 0.3), box(W / 2 - D / 2, cy + o, W / 2 + D / 2, cy + o + D, D * 0.3)], holes: [] };
  },
  '=': d => {
    const W = d.X(150), t = d.th * 1.4, cy = d.H * 0.55, o = t / 2 + d.g * 0.3;
    return { W, outer: [pill(0, cy - o - t / 2, W, cy - o + t / 2), pill(0, cy + o - t / 2, W, cy + o + t / 2)], holes: [] };
  },
  '<': d => { const W = d.X(130); return { W, outer: [chevron(d, 0, d.H * 0.55, W, W * 1.3, d.tv * 1.3)], holes: [] }; },
  '>': d => mirror(BLOCKS['<'](d)),
  '±': d => {
    const W = d.X(150), t = d.th * 1.4, cy = d.H * 0.45, r = W * 0.42, yb = cy + r + t * 0.5 + d.g * 0.4;
    return { W, outer: [pill(0, cy - t / 2, W, cy + t / 2), pill(W / 2 - t / 2, cy - r, W / 2 + t / 2, cy + r), pill(0, yb, W, yb + t)], holes: [] };
  },
  '~': d => {
    const W = d.X(160), t = d.th * 1.5, cy = d.H * 0.55, a = d.Y(14), n = 24, top: V[] = [], bot: V[] = [];
    // a band along a sine, end to end
    for (let i = 0; i <= n; i++) {
      const x = t / 2 + (W - t) * i / n, y = cy - a * Math.sin(Math.PI * 2 * i / n), sl = -a * Math.PI * 2 / (W - t) * Math.cos(Math.PI * 2 * i / n), l = Math.hypot(1, sl);
      top.push(v(x + sl * t / 2 / l, y - t / 2 / l, 0, 's'));
      bot.unshift(v(x - sl * t / 2 / l, y + t / 2 / l, 0, 's'));
    }
    top[0][2] = top[n][2] = bot[0][2] = bot[n][2] = t / 2;
    top[0][3] = top[n][3] = bot[0][3] = bot[n][3] = 'e';
    return { W, outer: [[...top, ...bot]], holes: [] };
  },
  '^': d => {
    const W = d.X(130), h = W * 0.62, c = chevron(d, 0, W / 2, h, W, d.tv * 1.2);
    return { W, outer: [c.map(([x, y, r, k]): V => [y, x, r, k])], holes: [] };
  },
  '*': d => {
    const W = d.X(120), t = d.th * 1.3, cy = d.Y(52), r = W / 2 - t / 2;
    return { W, outer: [90, 30, 150].map(a => { const dx = r * Math.cos(a * Math.PI / 180), dy = r * Math.sin(a * Math.PI / 180); return bar(W / 2 - dx, cy - dy, W / 2 + dx, cy + dy, t); }), holes: [] };
  },
  '°': d => { const D = d.H * 0.42, t = d.tv * 0.9; return { W: D, outer: [box(0, 0, D, D, D * 0.45)], holes: [box(t, t, D - t, D - t, (D - 2 * t) * 0.45)] }; },
  '©': d => ringed(d, BLOCKS.C),
  '®': d => ringed(d, BLOCKS.R),
  '™': d => {
    const s = scaled(d, 0.42), T = BLOCKS.T(s), M = shift(BLOCKS.M(s), T.W + d.g * 0.5, 0);
    return { W: M.W, outer: [...T.outer, ...M.outer], holes: [...T.holes, ...M.holes] };
  },
  '§': d => {
    // an S run on below the baseline, with a hole in the middle where its slots stop short of each other
    const tall = { ...d, H: d.H * 1.25 }, s = S_(tall), { tv, th, g, k } = d, y0 = th + g + th, y1 = tall.H - y0;
    return { ...s, holes: y1 - y0 > g * 0.5 ? [box(tv, y0, d.W - tv, y1, Math.min(30 * k, (y1 - y0) / 2))] : [] };
  },
  '¶': d => {
    const { H, tv, th, g, X, Y, k, R } = d, W = X(150), xb = W - tv, xa = xb - g;
    // a solid bowl on the left of two stems with a slot between them
    return { W, outer: [[v(0, 0, R), v(W, 0, 15 * k), v(W, H, tv / 2, 'e'), v(xb, H, tv / 2, 'e'), v(xb, th, 8 * k, 'i'), v(xa, th, 8 * k, 'i'),
      v(xa, H, tv / 2, 'e'), v(xa - tv, H, tv / 2, 'e'), v(xa - tv, Y(100), 10 * k, 'i'), v(0, Y(100), R * 0.8)]], holes: [] };
  },
  '†': d => {
    const W = d.X(130), t = d.th * 1.4, c = W / 2, tv = d.tv * 1.1, y = d.Y(50);
    return { W, outer: [pill(c - tv / 2, -d.Y(12), c + tv / 2, d.H + d.Y(25)), pill(0, y, W, y + t)], holes: [] };
  },
  '‡': d => {
    const W = d.X(130), t = d.th * 1.3, c = W / 2, tv = d.tv * 1.1;
    return { W, outer: [pill(c - tv / 2, -d.Y(12), c + tv / 2, d.H + d.Y(25)), pill(0, d.Y(42), W, d.Y(42) + t), pill(0, d.Y(140) - t, W, d.Y(140))], holes: [] };
  }
};

/** A shape moved dx across and dy down, made wider by dx. */
function shift(s: Shape, dx: number, dy: number): Shape {
  const f = (ring: V[]) => ring.map(([x, y, r, k]): V => [x + dx, y + dy, r, k]);
  return { W: s.W + dx, outer: s.outer.map(f), holes: s.holes.map(f) };
}
/** A bar t thick with fully round ends, from (x0, y0) to (x1, y1) at any angle. */
function bar(x0: number, y0: number, x1: number, y1: number, t: number): V[] {
  const l = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / l * t / 2, ny = (x1 - x0) / l * t / 2;
  return [v(x0 + nx, y0 + ny, t / 2, 'e'), v(x1 + nx, y1 + ny, t / 2, 'e'), v(x1 - nx, y1 - ny, t / 2, 'e'), v(x0 - nx, y0 - ny, t / 2, 'e')];
}
/** The dims of a letter f times as high: its walls and slots thin less, so a small letter stays open and solid. */
function scaled(d: BlockDims, f: number): BlockDims {
  const w = f ** 0.6;
  return fit(d.W * f, d.H * f, d.k * f, d.tv * w, d.th * w, d.g0 * w, d.moves, d.forms);
}
/** A letter, a little under half the height, in a hole in a round-cornered block: © and ®. */
function ringed(d: BlockDims, letter: BlockFn): Shape {
  const s = scaled(d, 0.46), L = letter(s), W = Math.max(d.H * 1.2, s.W + 2 * (d.tv + d.g)), x = (W - s.W) / 2, y = (d.H - s.H) / 2;
  const inner = shift(L, x, y);
  return { W, outer: [box(0, 0, W, d.H, d.H * 0.45), ...inner.outer], holes: [box(d.tv, d.th, W - d.tv, d.H - d.th, (d.H - 2 * d.th) * 0.45), ...inner.holes] };
}
/** A chevron pointing left, its point at (x, cy), w across and h high, its arms t across. */
function chevron(d: BlockDims, x: number, cy: number, w: number, h: number, t: number): V[] {
  const y0 = cy - h / 2, y1 = cy + h / 2, k = d.k;
  return [v(x, cy, 8 * k), v(x + w - t, y0, t * 0.3, 'e'), v(x + w, y0, t * 0.3, 'e'), v(x + t, cy, 6 * k, 'i'), v(x + w, y1, t * 0.3, 'e'), v(x + w - t, y1, t * 0.3, 'e')];
}
function chevrons(d: BlockDims, n: 1 | 2, right: boolean): Shape {
  const h = d.H * 0.5, w = h * 0.62, t = d.tv * 1.1, st = w * 0.55 + d.g * 0.6, W = w + (n - 1) * st;
  const s = { W, outer: Array.from({ length: n }, (_, i) => chevron(d, i * st, d.H * 0.6, w, h, t)), holes: [] };
  return right ? mirror(s) : s;
}
/** Curly quotes as commas: raised to the top (’), turned half round there (‘), or on the baseline (‚). */
function quotes(d: BlockDims, n: 1 | 2, at: 'open' | 'close' | 'low'): Shape {
  const D = d.tv + d.g, H = d.H, c = comma(H, D), hgt = D * 1.6;
  const one = at === 'low' ? c : at === 'close' ? c.map(([x, y, r, k]): V => [x, y - (H - D), r, k]) : c.map(([x, y, r, k]): V => [D - x, hgt - (y - (H - D)), r, k]);
  return { W: D + (n - 1) * (D + d.g), outer: Array.from({ length: n }, (_, i) => one.map(([x, y, r, k]): V => [x + i * (D + d.g), y, r, k])), holes: [] };
}
function dash(d: BlockDims, W: number): Shape { const t = d.th * 1.6; return { W, outer: [pill(0, d.H * 0.55 - t / 2, W, d.H * 0.55 + t / 2)], holes: [] }; }

function comma(H: number, D: number): V[] {
  return [v(0, H - D, D * 0.3), v(D, H - D, D * 0.3), v(D, H + D * 0.6, D * 0.2), v(D * 0.3, H + D * 0.6, D * 0.2), v(0, H, D * 0.2)];
}
/** A tall block with a deep mouth on the right, like a narrow C: the ( */
function bracket(d: BlockDims, W: number): V[] {
  const { H, th, X, k } = d, x = X(58);
  return [v(0, 0, 40 * k), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(x, th, 30 * k), v(x, H - th, 30 * k), v(W, H - th, th / 2, 'e'), v(W, H, th / 2, 'e'), v(0, H, 40 * k)];
}
function quote(D: number, h: number): V[] {
  return [v(0, 0, D * 0.3), v(D, 0, D * 0.3), v(D, h, D / 2, 'e'), v(0, h, D / 2, 'e')];
}

/** How much each kind of corner rounds, as a share of its radius as drawn; and `c` (Counters), how far the corners
    inside the letter, round its counters and at the ends of its slots, go on from there to as round as they have room
    for. */
interface BlockRound { o: number; e: number; i: number; c: number }

/** The block letter `ch` as outlines, y-up with the baseline at 0: every ring as corner points
    carrying their radii (for roundContour), outlines wound positive and holes negative (the holes
    last), and its width. A lowercase letter takes its capital's shape. Null when there's no block
    shape for it. */
export function blockRings(ch: string, d: BlockDims, round: BlockRound): { rings: Pt[][]; holes: number; W: number } | null {
  const fn = BLOCKS[ch] ?? BLOCKS[ch.toUpperCase()];
  if (!fn) return null;
  // Inner space widens the slots of letters and figures; the marks keep their dots and gaps
  const s = fn(/[\p{L}\p{N}]/u.test(ch) ? d : { ...d, g: d.g0 }), f = { o: round.o, e: round.e, i: round.i, s: 0 }, most = new Map<BlockPt, number>();
  const ring = (vs: V[], sign: number) => {
    const pts: BlockPt[] = vs.map(([x, y, r, k]) => ({ x, y: d.H - y, r: r * f[k] }));
    const turned = (signedArea(pts) < 0) !== (sign < 0), n = pts.length;
    pts.forEach((p, i) => {
      // ink lies left of the way round once the ring is wound as it will be, so a turn to the right is inside the letter
      const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], k = vs[i][3], ux = p.x - a.x, uy = p.y - a.y, wx = b.x - p.x, wy = b.y - p.y;
      const turn = ux * wy - uy * wx, inside = turn !== 0 && (turn > 0) === turned;
      if (!inside && turn !== 0 && k === 'o') p.outer = true;
      if (inside && k === 'i') p.join = true;
      if (round.c > 0 && inside && (k === 'o' || k === 'e')) {
        // Counters: as round as half of the shorter side either way leaves room for, at this turn
        const th = Math.abs(Math.atan2(turn, ux * wx + uy * wy));
        most.set(p, Math.max(p.r!, Math.min(Math.hypot(ux, uy), Math.hypot(wx, wy)) / 2 / Math.tan(Math.min(th, 2.6) / 2)));
      }
    });
    for (const [p, r] of most) p.r = p.r! + (r - p.r!) * round.c;
    most.clear();
    return turned ? pts.reverse() : pts;
  };
  return { rings: [...s.outer.map(r => ring(r, 1)), ...s.holes.map(r => ring(r, -1))], holes: s.holes.length, W: s.W };
}
