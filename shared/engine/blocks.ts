/* Block letters (Built from: Blocks).
   Each letter is a solid block, its corners rounded, with its counters cut in as slots: E is a block
   with two slots running in from the right, O a block with a tall round hole. There is no skeleton;
   every letter is one or more outlines of corners, each with its own radius.

   Shapes are drawn on the design grid they were measured on (a letter 224 wide and 175 high, walls
   25 and slots 28 across, outer corners 50 round), then fitted to the design: X() and Y() stretch
   positions to the letter's width and height, `tv` and `th` are the thin walls (upright and level),
   `g` the slots, and `k` scales the radii. Positions are measured down from the top. The grid's size
   is GRID_W and GRID_H; its walls and slots are the design's at Weight 60 (blockDims makes the walls
   0.07 + 0.12 × weight of the height, the slots 0.28 − 0.2 × weight).

   Each corner's radius is of one of four kinds, so the design's controls reach them all:
   'o' outer corners and the rounds of counters (Roundness), 'e' the ends of arms and slots, round
   right off at full Roundness, 'i' the small rounds where one part turns into another (Joins,
   as drawn at 0.5), 's' always sharp. */
import { lerp, signedArea } from './geom';
import { weighed } from '../params';
import type { Pt } from './types';

type Kind = 'o' | 'e' | 'i' | 's';
/** A corner: x, y (down from the top), its radius as drawn, and the kind of radius. */
type V = [number, number, number, Kind];
interface Shape { outer: V[][]; holes: V[][]; W: number }

interface BlockDims {
  /** the letter's width and height */ W: number; H: number;
  /** thin walls, upright and level, and the width of the slots */ tv: number; th: number; g: number;
  /** radii scale: one grid unit */ k: number;
  /** grid positions fitted to the letter */ X: (v: number) => number; Y: (v: number) => number;
  /** where the heavy part of a letter starts, across (the right edge of E's stem, of O's counter) */ S: number;
  /** outer corner radius */ R: number;
}

/** The design grid the shapes are drawn on: a letter this wide and high. */
const GRID_W = 224, GRID_H = 175;

/** The dims of a letter W wide and H high, `k` font units to a grid unit, with these walls and slots: grid
    positions fitted to it, its heavy part starting 124 across, its outer corners 50 round. blockDims and
    scaled() both build theirs here, so the small letters of © ® ™ get every field the full-size ones do. */
function fit(W: number, H: number, k: number, tv: number, th: number, g: number): BlockDims {
  const X = (v: number) => v * W / GRID_W, Y = (v: number) => v * k;
  return { W, H, tv, th, g, k, X, Y, S: X(124), R: 50 * k };
}

/** The measurements of a block letter `H` high, from the design's weight and width. */
export function blockDims(H: number, p: { weight: number; width: number; vWeight: number; hWeight: number }): BlockDims {
  const ws = p.width < 0.5 ? lerp(0.6, 1, p.width * 2) : lerp(1, 1.5, (p.width - 0.5) * 2);
  const W = H * (GRID_W / GRID_H) * ws, k = H / GRID_H;
  // heavier, the walls thicken and the slots close up
  const t = H * (0.07 + 0.12 * p.weight), g = H * (0.28 - 0.2 * p.weight);
  const tv = t * weighed(1, p.vWeight, 0.4, 1.6), th = t * weighed(1, p.hWeight, 0.4, 1.6);
  return fit(W, H, k, tv, th, g);
}

const v = (x: number, y: number, r: number, kind: Kind = 'o'): V => [x, y, r, kind];
/** A slot or bar with fully round ends, x0..x1 across and y0..y1 down. */
const pill = (x0: number, y0: number, x1: number, y1: number): V[] => {
  const r = Math.min(x1 - x0, y1 - y0) / 2;
  return [v(x0, y0, r, 'e'), v(x1, y0, r, 'e'), v(x1, y1, r, 'e'), v(x0, y1, r, 'e')];
};
const box = (x0: number, y0: number, x1: number, y1: number, r: number): V[] => [v(x0, y0, r), v(x1, y0, r), v(x1, y1, r), v(x0, y1, r)];
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

const E: BlockFn = d => {
  const { W, H, th, g, S, R } = d, mid = H - 2 * th - 2 * g;
  return one(d, [v(0, 0, R), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(S, th, g / 2, 'e'), v(S, th + g, g / 2, 'e'), v(W, th + g, mid / 2, 'e'),
    v(W, H - th - g, mid / 2, 'e'), v(S, H - th - g, g / 2, 'e'), v(S, H - th, g / 2, 'e'), v(W, H - th, th / 2, 'e'), v(W, H, th / 2, 'e'), v(0, H, R)]);
};

const S_: BlockFn = d => {
  const { W, H, th, g, S, R, k, X } = d;
  return one(d, [v(0, 0, R), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(X(98), th, g / 2, 'e'), v(X(98), th + g, g / 2, 'e'), v(W, th + g, 50 * k),
    v(W, H, R), v(0, H, th / 2, 'e'), v(0, H - th, th / 2, 'e'), v(S, H - th, g / 2, 'e'), v(S, H - th - g, g / 2, 'e'), v(0, H - th - g, 48 * k)]);
};

const O: BlockFn = d => {
  const { W, H, tv, th, S, k } = d, cr = (S - tv) / 2;
  return one(d, box(0, 0, W, H, 45 * k), box(tv, th, S, H - th, cr));
};

const SIX: BlockFn = d => {
  const { W, H, tv, th, g, S, R, k, Y } = d, top = th + g * 1.6;
  return one(d, [v(0, 0, R), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(S, th, 25 * k), v(S, top, 12 * k, 'i'), v(W, top, 40 * k), v(W, H, R), v(0, H, R)],
    box(tv, Math.max(top + th, Y(97)), S, H - th, 36 * k));
};

const BLOCKS: Record<string, BlockFn> = {
  A: d => {
    const { W, H, tv, th, X, k, R } = d, { y0, y1 } = topSlot(d, -1, 1.07), ct = y1 + th, xa = X(99), xf = xa + X(0.27 * (H - ct) / k);
    return one(d, [v(0, 0, R), v(W, 0, R), v(W, H, 45 * k), v(xf, H, 40 * k), v(xa, ct, 40 * k), v(tv, ct, 40 * k), v(tv, H, tv / 2, 'e'), v(0, H, tv / 2, 'e')],
      pill(tv, y0, X(99), y1));
  },
  B: d => {
    const { W, H, tv, th, g, S, k, R } = d, { y0, y1 } = topSlot(d, -3, 1.25), yB = y1 + g * 0.85;
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
    // straight sides running in to a blunt point on the right, round a counter like a play sign
    return one(d, [v(0, 0, R), v(X(123), 0, 34 * k), v(W, Y(55.5), 40 * k), v(W, H - Y(55.5), 40 * k), v(X(123), H, 34 * k), v(0, H, R)],
      [v(tv, Y(21), 38 * k), v(X(144.5), H / 2, 19 * k), v(tv, H - Y(21), 38 * k)]);
  },
  E,
  F: d => {
    const { W, H, g, S, Y, k, R } = d, a1 = Y(52), a2 = Math.max(g * 0.6, Y(130) - a1 - g);
    return one(d, [v(0, 0, R), v(W, 0, a1 / 2, 'e'), v(W, a1, a1 / 2, 'e'), v(S, a1, g / 2, 'e'), v(S, a1 + g, g / 2, 'e'), v(W, a1 + g, a2 / 2, 'e'),
      v(W, a1 + g + a2, a2 / 2, 'e'), v(S, a1 + g + a2, 20 * k, 'i'), v(S, H, 35 * k), v(0, H, R)]);
  },
  G: d => {
    const { W, H, tv, th, g, S, X, Y, k, R } = d, yt = Math.max(Y(53), th + g * 0.9), xt = X(163), xw = W - tv * 0.88;
    // a C whose lower arm turns up the right side and in again, in a tongue under the top arm
    return one(d, [v(0, 0, R), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(S, th, 50 * k), v(S, H - th, 50 * k), v(xw, H - th, 30 * k), v(xw, yt + g, 22 * k),
      v(xt, yt + g, g / 2, 'e'), v(xt, yt, g / 2, 'e'), v(W, yt, 30 * k), v(W, H, R), v(0, H, R)]);
  },
  H: d => {
    const { W, H, tv, S, X, Y, k, R } = d, ct = Y(82);
    return one(d, [v(0, 0, R), v(X(108), 0, 34 * k), v(X(108), ct, 25 * k, 'i'), v(W, ct, 45 * k), v(W, H, 45 * k), v(S, H, 22 * k), v(S, Y(115), 20 * k),
      v(tv, Y(152.5), 10 * k, 'i'), v(tv, H, tv / 2, 'e'), v(0, H, tv / 2, 'e')]);
  },
  I: d => {
    const { W, H, th, g, R } = d;
    return { W, outer: [pill(0, 0, W, th * 0.9), box(0, th + g, W, H, R)], holes: [] };
  },
  J: d => {
    const { W, H, tv, th, g, X, Y, k, R } = d, js = th + g * 0.8, tb = th * 0.9;
    // the top runs out to the left over a slot that turns down beside a thin stem
    return one(d, [v(0, 0, tb / 2, 'e'), v(W, 0, R), v(W, H, R), v(0, H, R), v(0, js, tv / 2, 'e'), v(tv, js, tv / 2, 'e'), v(tv, H - th, 30 * k),
      v(X(79.5), H - th, 25 * k), v(X(104), Y(80), 30 * k), v(X(105), tb, 45 * k), v(0, tb, tb / 2, 'e')]);
  },
  K: d => {
    const { H, th, X, Y, k } = d, tv = d.tv * 1.12, kn = th * 0.9;
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, kn, 10 * k, 'i'), v(X(137), kn, 10 * k, 'i'), v(X(137), 0, 12 * k), v(X(218), 0, 45 * k),
      v(X(218), Y(50), 22 * k), v(X(206), Y(78), 22 * k, 'i'), v(X(221), Y(112), 30 * k), v(X(221), H, 45 * k), v(X(138.5), H, 30 * k), v(X(89.5), Y(77), 25 * k),
      v(tv, Y(77), 30 * k), v(tv, H, tv / 2, 'e'), v(0, H, tv / 2, 'e')]);
  },
  L: d => {
    const { W, H, S, Y, k, R } = d;
    return one(d, [v(0, 0, R), v(S, 0, 40 * k), v(S, Y(84), 30 * k, 'i'), v(W, Y(76), 45 * k), v(W, H, R), v(0, H, R)]);
  },
  M: d => {
    const { W, H, tv, th, S, Y, k } = d, mn = th * 1.08, st = Y(77);
    // narrowed, the slots give way before the middle leg does
    const g = Math.min(d.g, (S - tv * 1.8) / 2), xa = tv + g, xb = S - g, leg = xb - xa;
    // a thin stem, a middle leg and a heavy right side hung from a bar with a notch over it
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, mn, 12 * k, 'i'), v(S, mn, 12 * k, 'i'), v(S, 0, 13 * k), v(W, 0, 50 * k), v(W, H, 45 * k),
      v(S, H, 40 * k), v(S, st, g / 2, 'e'), v(xb, st, g / 2, 'e'), v(xb, H, leg / 2, 'e'), v(xa, H, leg / 2, 'e'), v(xa, st, g / 2, 'e'), v(tv, st, g / 2, 'e'),
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
    const { W, H, tv, S, Y, k, R } = d, { y0, y1 } = topSlot(d, -4, 1.18);
    return one(d, [v(0, 0, R), v(W, 0, 45 * k), v(W, Y(105), 57 * k), v(S, Y(105), 25 * k, 'i'), v(S, H, 40 * k), v(0, H, R)], pill(tv, y0, S, y1));
  },
  Q: d => {
    const { W, H, tv, th, g, S, X, k, R } = d, xq = X(199);
    // an O a little narrower, its foot running on to the right in a short spur
    return one(d, [v(0, 0, 50 * k), v(xq, 0, 50 * k), v(xq, H - g, 8 * k, 'i'), v(W, H - g, g / 2, 'e'), v(W, H, g / 2, 'e'), v(0, H, R)],
      box(tv, th, S, H - th, (S - tv) / 2));
  },
  R: d => {
    const { W, H, tv, S, X, Y, k, R } = d, { y0, y1 } = topSlot(d, 2, 1);
    return one(d, [v(0, 0, R), v(W, 0, 40 * k), v(W, Y(76), 18 * k), v(X(187), Y(76), 12 * k, 'i'), v(X(216), H, 34 * k), v(X(126), H, 30 * k),
      v(X(90), Y(103), 40 * k), v(tv, Y(103), 40 * k), v(tv, H, tv / 2, 'e'), v(0, H, tv / 2, 'e')], pill(tv, y0, S, y1));
  },
  S: S_,
  T: d => {
    const { W, H, tv, th, k, R } = d;
    return one(d, [v(0, 0, th / 2, 'e'), v(W, 0, th / 2, 'e'), v(W, th, th / 2, 'e'), v(W - tv * 1.1, th, 10 * k, 'i'), v(W - tv * 1.1, H, R), v(tv, H, R), v(tv, th, 10 * k, 'i'), v(0, th, th / 2, 'e')]);
  },
  U: d => {
    const { W, H, tv, th, X, k, R } = d;
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, H - th, 40 * k), v(X(86), H - th, 40 * k), v(X(125), 0, 45 * k), v(W, 0, 50 * k), v(W, H, R), v(0, H, R)]);
  },
  V: d => {
    const { W, H, tv, th, X, k, R } = d;
    // a thin left stem and a heavy right side leaning in on it, meeting at the foot
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, H - th, 30 * k), v(X(83), H - th, 20 * k), v(X(125), 0, 45 * k), v(W, 0, 50 * k), v(W, H, R), v(0, H, R)]);
  },
  W: d => {
    const { W, H, tv, th, X, k, R } = d, g = Math.min(d.g, (W * 0.5 - 2 * tv) / 2), xa = tv + g, xb = xa + tv, xc = xb + g, xd = xc + X(0.125 * (H - th) / k);
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
    const { W, H, tv, th, X, Y, k } = d, yb = Y(92), yn = Math.max(yb + th, Y(120)), xl = X(84), xr = W - tv;
    // a thin left arm and a heavy right one round a slot, standing on a foot a little right of the middle
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, yb, 40 * k), v(X(110), yb, 40 * k), v(X(110), 0, 30 * k), v(W, 0, 50 * k),
      v(W, yn, 22 * k), v(xr, yn, 10 * k, 'i'), v(xr, H, 30 * k), v(xl, H, 30 * k), v(xl, yn, 20 * k, 'i'), v(0, yn, 40 * k)]);
  },
  Z: d => {
    const { W, H, th, g, S, X, k, R } = d, slope = 0.294 * (H / GRID_H) / (W / GRID_W), yl = H - th - g, xl = X(99), yr = yl - slope * (W - xl);
    // a slot in from the left under the top, one in from the right over the foot, and a band slanting down between them
    return one(d, [v(0, 0, th / 2, 'e'), v(W, 0, R * 1.1), v(W, yr, 30 * k), v(xl, yl, 14 * k, 'e'), v(xl, H - th, 14 * k, 'e'), v(W, H - th, th / 2, 'e'), v(W, H, th / 2, 'e'),
      v(0, H, R), v(0, th + g + slope * S, 40 * k), v(S, th + g, 14 * k, 'e'), v(S, th, 14 * k, 'e'), v(0, th, th / 2, 'e')]);
  },

  '0': d => {
    const { W, H, th, X, k } = d, x0 = X(78), x1 = X(146);
    return one(d, box(0, 0, W, H, 45 * k), box(x0, th, x1, H - th, (x1 - x0) / 2));
  },
  '1': d => {
    const { W, H, th, X, k, R } = d;
    return one(d, [v(0, 0, th / 2, 'e'), v(W, 0, R), v(W, H, R), v(X(100), H, 40 * k), v(X(100), th, 15 * k, 'i'), v(0, th, th / 2, 'e')]);
  },
  '2': d => mirror(S_(d)),
  '3': d => mirror(E(d)),
  '4': d => {
    const { W, H, tv, th, S, Y, k, R } = d, yb = Y(100), yn = Math.max(yb + th, Y(128));
    return one(d, [v(0, 0, tv / 2, 'e'), v(tv, 0, tv / 2, 'e'), v(tv, yb, 30 * k), v(S, yb, 30 * k), v(S, 0, 13 * k), v(W, 0, 45 * k), v(W, H, R),
      v(S, H, 30 * k), v(S, yn, 20 * k, 'i'), v(0, yn, 25 * k)]);
  },
  '5': d => {
    const { W, H, th, g, S, X, k } = d;
    return one(d, [v(0, 0, 8 * k), v(W, 0, 4 * k), v(W, th, 4 * k), v(X(98), th, g / 2, 'e'), v(X(98), th + g, g / 2, 'e'), v(W, th + g, 45 * k),
      v(W, H, 50 * k), v(0, H, th / 2, 'e'), v(0, H - th, th / 2, 'e'), v(S, H - th, g / 2, 'e'), v(S, H - th - g, g / 2, 'e'), v(0, H - th - g, 20 * k)]);
  },
  '6': SIX,
  '7': d => {
    const { W, H, th, X, k, R } = d;
    return one(d, [v(0, 0, th / 2, 'e'), v(W, 0, R), v(W, H, R), v(X(112), H, 25 * k), v(X(70), th, 15 * k, 'i'), v(0, th, th / 2, 'e')]);
  },
  '8': d => {
    const { W, H, tv, th, g, S, k, R } = d, y1 = th + g * 1.7, y2 = y1 + th;
    return { W, outer: [box(0, 0, W, H, R)], holes: [box(tv, th, S, y1, (y1 - th) / 2), box(tv, y2, S, H - th, 36 * k)] };
  },
  '9': d => turn(SIX(d), d.H),

  '.': d => { const D = d.tv + d.g; return { W: D, outer: [box(0, d.H - D, D, d.H, D * 0.3)], holes: [] }; },
  ',': d => { const D = d.tv + d.g; return { W: D, outer: [comma(d.H, D)], holes: [] }; },
  ':': d => { const D = d.tv + d.g; return { W: D, outer: [box(0, d.H - D, D, d.H, D * 0.3), box(0, d.H * 0.35 - D / 2, D, d.H * 0.35 + D / 2, D * 0.3)], holes: [] }; },
  ';': d => { const D = d.tv + d.g; return { W: D, outer: [comma(d.H, D), box(0, d.H * 0.35 - D / 2, D, d.H * 0.35 + D / 2, D * 0.3)], holes: [] }; },
  '!': d => {
    const D = d.tv + d.g;
    return { W: D, outer: [[v(0, 0, D * 0.3), v(D, 0, D * 0.3), v(D, d.H - D - d.g, D / 2, 'e'), v(0, d.H - D - d.g, D / 2, 'e')], box(0, d.H - D, D, d.H, D * 0.3)], holes: [] };
  },
  '-': d => dash(d, d.X(120)),
  '?': d => {
    const { th, g, X, Y, H, k } = d, W = X(170), D = d.tv + g, xs = W * 0.4, yh = Y(96);
    // a head with a slot in from the left, a short stem under its middle and a dot
    return { W, outer: [[v(0, 0, 40 * k), v(W, 0, 40 * k), v(W, yh, 30 * k), v(xs + D, yh, 10 * k, 'i'), v(xs + D, H - D - g, D / 2, 'e'), v(xs, H - D - g, D / 2, 'e'),
      v(xs, yh, 10 * k, 'i'), v(0, yh, 25 * k), v(0, th + g, th / 2, 'e'), v(X(92), th + g, g / 2, 'e'), v(X(92), th, g / 2, 'e'), v(0, th, th / 2, 'e')],
    box(xs, H - D, xs + D, H, D * 0.3)], holes: [] };
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

  '…': d => { const D = d.tv + d.g, st = D + d.g * 0.8; return { W: D + 2 * st, outer: [0, 1, 2].map(i => box(i * st, d.H - D, i * st + D, d.H, D * 0.3)), holes: [] }; },
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
  '·': d => { const D = d.tv + d.g, c = d.H * 0.55; return { W: D, outer: [box(0, c - D / 2, D, c + D / 2, D * 0.3)], holes: [] }; },
  '•': d => { const D = (d.tv + d.g) * 1.5, c = d.H * 0.55; return { W: D, outer: [box(0, c - D / 2, D, c + D / 2, D * 0.4)], holes: [] }; },

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
  return fit(d.W * f, d.H * f, d.k * f, d.tv * w, d.th * w, d.g * w);
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

/** How much each kind of corner rounds, as a share of its radius as drawn. */
interface BlockRound { o: number; e: number; i: number }

/** The block letter `ch` as outlines, y-up with the baseline at 0: every ring as corner points
    carrying their radii (for roundContour), outlines wound positive and holes negative (the holes
    last), and its width. A lowercase letter takes its capital's shape. Null when there's no block
    shape for it. */
export function blockRings(ch: string, d: BlockDims, round: BlockRound): { rings: Pt[][]; holes: number; W: number } | null {
  const fn = BLOCKS[ch] ?? BLOCKS[ch.toUpperCase()];
  if (!fn) return null;
  const s = fn(d), f = { o: round.o, e: round.e, i: round.i, s: 0 };
  const ring = (vs: V[], sign: number) => {
    const pts: Pt[] = vs.map(([x, y, r, k]) => ({ x, y: d.H - y, r: r * f[k] }));
    return (signedArea(pts) < 0) !== (sign < 0) ? pts.reverse() : pts;
  };
  return { rings: [...s.outer.map(r => ring(r, 1)), ...s.holes.map(r => ring(r, -1))], holes: s.holes.length, W: s.W };
}
