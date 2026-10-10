/* The constructions the glyph files share (see index.ts): bowls, the s, shoulders, K's arms, the upright
   and arched forms of the diagonal letters, tails and hooks, cursive entry and exit strokes, and the forms
   a capital shares with its lowercase. */
import type { Builder, Metrics } from '../font';
import { clamp, lerp } from '../geom';
import type { Cmd, StrokeOpts } from '../types';
import { bendTurn, ownTurns, roundBends, turnStroke, type Reach, type XY } from './turns';

/* the stroke ends the letters use most: joined to another stroke, a styled terminal, cut level */
export const J = 'join', T = 'term', H = 'h';

/* ---------- shared constructions ---------- */

/* zig-zag of diagonals (A M V W v w ^): apex sharpness comes from m.apex */
export function zig(g: Builder, m: Metrics, xs: number[], yT: number, yB: number, startTop: boolean, o?: StrokeOpts) {
  const a = m.apex, n = xs.length, Hh = yT - yB, ys: number[] = [];
  const top = (i: number) => startTop ? i % 2 === 0 : i % 2 === 1;
  if (roundBends(m) || ownTurns(m, n, g.strokes.length)) {
    const reach = xs.slice(1, -1).map((_, k): Reach => ({ i: k + 1, ax: 1, at: top(k + 1) ? yT : yB, dir: top(k + 1) ? 1 : -1 }));
    const { clipX, ...rest } = o ?? {};
    return turnStroke(g, m, xs.map((x, i): XY => [x, top(i) ? yT : yB]), reach,
      { s: H, e: H, part: 'diagonal', serifS: 'both', serifE: 'both', clip: { ...clipX }, ...rest }).map(q => q[1]);
  }
  for (let i = 0; i < n; i++) {
    let y = top(i) ? yT : yB;
    if (i > 0 && i < n - 1) {
      const dx = (xs[i] - xs[i - 1] + xs[i + 1] - xs[i]) / 2;
      const half = Math.atan2(dx, Hh), t = (m.tDir(dx, Hh) + m.thin) / 2;
      const tip = (t / 2) / Math.sin(half), ext = a > 0.03 ? a * 1.5 * m.s : m.os;
      // steep, heavy strokes would pull the vertex so far in that a w's middle flattens out: it stops
      // a little way in, and the clip squares off the point it leaves beyond the line
      const lift = Math.min(tip - ext, Hh * 0.3 * (1 - 0.6 * m.p.roundness));
      y = top(i) ? yT - lift : yB + lift;
      g.mark(top(i) ? 'apex' : 'vertex', xs[i], top(i) ? yT : yB);
    }
    ys.push(y);
  }
  const cmds: Cmd[] = [['M', xs[0], ys[0]]];
  for (let i = 1; i < n; i++) cmds.push(['L', xs[i], ys[i], ys[i] > ys[i - 1] ? { w: 'thin' } : {}]);
  const e = a > 0.03 ? 0 : m.os;
  g.path(cmds, { s: H, e: H, part: 'diagonal', miter: 18, serifS: 'both', serifE: 'both',
    clip: { y0: yB - e, y1: yT + e, ...o?.clipX }, ...o });
  return ys;
}

/** The width of the round side of a bowl off a stem at x0 out to R, ry from its middle to its top and bottom:
    1.2 ry, wider in square designs, but leaving its flat top and bottom a quarter stroke long at least.
    The bowls of B D P R and the loop of R share it, so they stay alike. */
export const bowlRx = (m: Metrics, x0: number, R: number, ry: number) => Math.max(m.s * 0.3, Math.min(R - x0 - m.s * 0.25, ry * (1.2 + m.sq)));

/* bowl attached to a stem with straight top/bottom (B D P R) */
export function capBowl(g: Builder, m: Metrics, x0: number, yT: number, yB: number, R: number) {
  const ry = (yT - yB) / 2, cy = (yT + yB) / 2;
  const rx = bowlRx(m, x0, R, ry);
  const xa = R - rx;
  g.path([['M', x0, yT], ['L', xa, yT], ['hv', R, cy], ['vh', xa, yB], ['L', x0, yB]], { s: J, e: J, part: 'bowl', counter: true });
}

/** How far the overlap setting pushes a bowl off its stem: none from half overlap up, and below
    that up to the point where the o's side only just touches the stem. */
export const bowlGap = (m: Metrics) => m.s * 0.9 * clamp(1 - m.p.overlap * 2);

/* bowl beside a stem (b d p q a g). Fully overlapped it branches out of the stem; toward half
   overlap its inner side rounds out into a whole o standing on the stem, and below half that o
   slides off the stem. Callers leave bowlGap(m) of extra room between xStem and xFar.
   With square joins it is a half round on the far side whose flat top and bottom run straight
   into the stem, like a D, and stays on the stem whatever the overlap. */
export function branchBowl(g: Builder, m: Metrics, xStem: number, xFar: number, yT: number, yB: number) {
  const dir = Math.sign(xFar - xStem), cy = (yT + yB) / 2;
  if (m.p.bowlJoin === 'square') {
    // flat, so it sits on the x-height and baseline like the stem instead of overshooting them
    const t = yT - m.os, b = yB + m.os, rx = Math.max(0, Math.min(Math.abs(xFar - xStem) - m.s * 0.25, (t - b) / 2)), xa = xFar - dir * rx;
    g.path([['M', xStem, t], ['L', xa, t], ['hv', xFar, cy], ['vh', xa, b], ['L', xStem, b]], { s: J, e: J, part: 'bowl', counter: true });
    // inside, the counter rounds into the stem as fully as on its far side, so a round bowl's
    // counter can close into a circle; a box bowl's, square on its far side, nearly as fully
    const xi = xStem + dir * m.s / 2, ri = (m.p.bowlForm === 'box' ? 0.9 : 1) * Math.min(rx - m.s / 2, Math.abs(xa - xi));
    fillet(g, m, xi, t - m.hT / 2, dir, -1, ri);
    fillet(g, m, xi, b + m.hT / 2, dir, 1, ri);
    return;
  }
  const xn = xStem + dir * bowlGap(m);
  const f = clamp(m.p.overlap * 2 - 1), cx = (xn + xFar) / 2 + dir * m.s * 0.14 * f;
  g.mark('overlap', xn, cy);
  if (f === 0) {
    g.path([['M', cx, yT], ['hv', xFar, cy], ['vh', cx, yB], ['hv', xn, cy], ['vh', cx, yT], ['Z']], { part: 'bowl' });
    return;
  }
  const jh = (yT - yB) * lerp(0.5, 0.36, f), w = lerp(1, 0.6, f);
  g.path([['M', xStem, yT - jh], ['vh', cx, yT], ['hv', xFar, cy], ['vh', cx, yB], ['hv', xStem, yB + jh]],
    { s: J, e: J, ws: w, we: w, part: 'bowl', counter: true });
}

/* closed round shape (O Q o 0 8, and the rings in g @ % ° © ® §) */
export function oval(g: Builder, xl: number, xr: number, yb: number, yt: number, o?: StrokeOpts) {
  const cx = (xl + xr) / 2, cy = (yb + yt) / 2;
  g.path([['M', cx, yt], ['hv', xr, cy], ['vh', cx, yb], ['hv', xl, cy], ['vh', cx, yt], ['Z']], { part: 'bowl', ...o });
}

/* open round shape (C c, and ¢ € ©): draws from the top terminal round to the bottom one */
export function openBowl(g: Builder, xl: number, xr: number, yb: number, yt: number, u0: number, u1: number, o?: StrokeOpts) {
  const cx = (xl + xr) / 2, cy = (yb + yt) / 2;
  g.path([['M', xr, cy], ['vh', cx, yt, { u0 }], ['hv', xl, cy], ['vh', cx, yb], ['hv', xr, cy, { u1 }]],
    { s: T, e: T, part: 'bowl', ...o });
}

/** How open Aperture makes the mouth of a C (and G € ©): `u`, the share of each terminal's quarter turn left
    undrawn, and `w`, the share of its bowl's width the letter is set at, as the more open the mouth, the
    further the terminals sit from the right edge. */
export const capAperture = (m: Metrics) => ({ u: lerp(0.25, 0.6, m.ap), w: 0.97 - 0.12 * m.ap });
/** The same for a c (and ¢). */
export const lcAperture = (m: Metrics) => ({ u: lerp(0.22, 0.58, m.ap), w: 0.96 - 0.12 * m.ap });

/* the flat-spined s: two rounded boxes stacked, the spine running level a little above the middle
   between two tight turns, the ends running level out from the top left and bottom right */
function flatS(g: Builder, m: Metrics, W: number, yB: number, yT: number) {
  const hs = m.s / 2, hh = m.hT / 2;
  const t = yT - hh - m.os, b = yB + hh + m.os, xl = hs, xr = W - hs, ym = lerp(b, t, 0.52);
  // the lower bowl is the bigger, and rounder at its outer corner
  const r1 = Math.min((xr - xl) * 0.32, (t - ym) * 0.6), r3 = Math.min((xr - xl) * 0.36, (ym - b) * 0.6);
  const r2 = Math.min((xr - xl) * 0.3, (t - ym) * 0.4, (ym - b) * 0.4);
  // the more open, the further the ends stop short of the sides
  const off = W * lerp(0.04, 0.3, m.ap);
  g.path([['M', W - off, t], ['L', xl + r1, t], ['hv', xl, t - r1], ['L', xl, ym + r2], ['vh', xl + r2, ym], ['L', xr - r2, ym],
    ['hv', xr, ym - r2], ['L', xr, b + r3], ['vh', xr - r3, b], ['L', off * 0.6, b]], { s: T, e: T, part: 'spine' });
  // the counters round into the spine more fully than its turns do outside
  fillet(g, m, xl + hs, ym + hh, 1, 1, m.s * 1.1);
  fillet(g, m, xr - hs, ym - hh, -1, -1, m.s * 0.8);
}

/* the s of S s $, W wide from yB to yT: a flat spine when Letter s says so, two stacked boxes with box
   bowls, else a curved spine */
export function sShape(g: Builder, m: Metrics, W: number, yB: number, yT: number) {
  if (m.p.sForm === 'flat') { flatS(g, m, W, yB, yT); return; }
  const hs = m.s / 2, hh = m.hT / 2, Hh = yT - yB;
  const t = yT - hh, b = yB + hh, xl = hs, xr = W - hs, cx = W / 2;
  const xlT = xl + W * 0.035, xrT = xr - W * 0.035;
  // squared off, the spine's handles lengthen until it runs level through the middle, like a Z bent round
  const y1 = yB + Hh * 0.74, y2 = yB + Hh * 0.27, c = (y1 - y2) * lerp(0.6, 1, m.sq);
  const u0 = lerp(0.2, 0.55, m.ap);
  if (m.p.bowlForm === 'box') {
    // two stacked bowls of quarter turns, which box into a level spine with square corners inside
    const mid = (t + b) / 2;
    g.path([['M', xr, (t + mid) / 2], ['vh', cx, t, { u0 }], ['hv', xl, (t + mid) / 2], ['vh', cx, mid], ['hv', xr, (mid + b) / 2],
      ['vh', cx, b], ['hv', xl, (mid + b) / 2, { u1: 1 - u0 }]], { s: T, e: T, part: 'spine' });
    return;
  }
  // the spine carries the weight, but in black weights it must leave room for both counters
  const thick = m.s, thin = Math.min(m.thin, thick), spineT = Math.min(thick, Hh * 0.25);
  const sw = thick > thin ? Math.max(0, Math.min(1, (spineT - thin) / (thick - thin))) : 1;
  g.path([['M', xrT, y1], ['vh', cx, t, { u0 }], ['hv', xlT, y1],
    ['C', xlT, y1 - c, xr, y2 + c, xr, y2, { w: sw }], ['vh', cx, b], ['hv', xl, y2, { u1: 1 - u0 }]],
    { s: T, e: T, part: 'spine' });
}

/* shoulder of n m h: springs from the stem at x0, over the x-height, and comes down at x1 to the baseline,
   where with `exit` a cursive design's exit stroke carries it on. With square joins it runs
   flat out of the top of the stem and turns down in one round corner; `runOn` (the first shoulder
   of an m) turns down square instead, as the next shoulder runs on flat out of the top of x1. */
export function arch(g: Builder, m: Metrics, x0: number, x1: number, exit = false, runOn = false) {
  const X = m.xh, ah = X * 0.4, r = exit ? hookR(m) : 0, yt = X + m.os - m.hT / 2;
  const cx = (x0 + x1) / 2 + (x1 - x0) * 0.1 * m.org;
  const t = X - m.hT / 2, rc = squareR(m, x1 - x0), square = m.p.bowlJoin === 'square';
  const head: Cmd[] = square ? (runOn ? [['M', x0, t], ['L', x1, t]] : [['M', x0, t], ['L', x1 - rc, t], ['hv', x1, t - rc]])
    : [['M', x0, X - ah], ['vh', cx, yt], ['hv', x1, X - ah * 0.95]];
  // a shoulder springing from the side of the stem thins where it leaves it; a square one runs out of its top at full weight,
  // its counter rounding into the stem as it does on the far side
  const ws = square ? 1 : 0.6;
  if (square) fillet(g, m, x0 + m.s / 2, t - m.hT / 2, 1, -1, rc - m.s / 2);
  if (square && runOn) fillet(g, m, x1 - m.s / 2, t - m.hT / 2, -1, -1, rc - m.s / 2);
  if (r) {
    g.path([...head, ...exitTail(m, x1, r)], { s: J, e: T, ws, we: 0.75, part: 'shoulder' });
    exitMark(g, m, x1, r);
  }
  else g.path([...head, ['L', x1, 0]], { s: J, e: 'flat', ws, part: 'shoulder', serifE: 'both' });
}

/** Radius of the round corner of a square-joined shoulder `span` wide (centerline to centerline). */
export const squareR = (m: Metrics, span: number) => Math.max(0, Math.min(span - m.s * 0.25, span * 0.45));
/** Round the inside corner of a square join (see Builder.fillet). A wireframe shows every stroke
    as drawn, so it leaves the corner be. */
export function fillet(g: Builder, m: Metrics, x: number, y: number, sx: number, sy: number, r: number) {
  if (m.p.fill !== 'wire') g.fillet(x, y, sx, sy, r);
}

/* arm and leg of K/k, off a stem at x0 up to `top`, the arm reaching r. The leg springs from the
   arm (leaving the stem at ay, the leg from f of the way up it), or both meet at the stem, or at the
   end of a short bar out from it (m.p.kForm). */
export function kArms(g: Builder, m: Metrics, x0: number, top: number, r: number, ay: number, f: number, clip: { y1?: number }) {
  const ex = r + m.s * 0.05;
  if (m.p.kForm === 'arm') {
    g.line(x0, ay, r, top, { s: J, e: H, w: 'thin', part: 'arm', clip: { x0, ...clip }, serifE: 'both' });
    // the leg starts flush with the upper edge of the arm, so nothing pokes through
    const jx = lerp(x0, r, f), jy = lerp(ay, top, f), dx = r - x0, dy = top - ay, l = Math.hypot(dx, dy);
    const bx = jx - (ex - jx) * 0.25, by = jy + jy * 0.25;
    g.line(bx, by, ex, 0, { s: J, e: H, part: 'leg', serifE: 'both', clip: { planes: [{ x: x0, y: ay, nx: -dy / l, ny: dx / l }] } });
    return;
  }
  // both leave the stem, or the bar, at one point halfway up: the bar runs about a stroke clear of
  // the stem, then the arm and leg share it, so they meet it in mitred corners
  const yj = top * 0.5, head: Cmd[] = m.p.kForm === 'bar' ? [['M', x0, yj], ['L', x0 + m.s * 1.85, yj]] : [['M', x0, yj]];
  g.path([...head, ['L', r, top, { w: 'thin' }]], { s: J, e: H, part: 'arm', miter: 18, clip: { x0, ...clip }, serifE: 'both' });
  g.path([...head, ['L', ex, 0]], { s: J, e: H, part: 'leg', miter: 18, clip: { x0, y0: 0 }, serifE: 'both' });
}

/* ---------- the upright and arched forms of the diagonal letters (Letters A, V and W) ---------- */

/** How far in from the edge a diagonal cut level at its foot stands, so the cut starts at the edge. */
export const footIn = (m: Metrics, dx: number, dy: number) => (m.tDir(dx, dy) / 2) / Math.max(0.2, Math.abs(dy) / Math.hypot(dx, dy));

/** Whether A V W (v w) take their upright form. */
export const upright = (m: Metrics) => m.p.diagonals === 'upright';
/** Whether A M N V W (v w) are drawn as arches, with no diagonals. */
export const arched = (m: Metrics) => m.p.diagonals === 'arch';

/** An arch `top` high and W wide (A M N): a U upturned, its sides running down to the baseline. */
export function archUp(g: Builder, m: Metrics, W: number, top: number) {
  g.sb = [1, 1];
  const hs = m.s / 2, hh = m.hT / 2, xr = W - hs, yt = top + m.os - hh, ry = yt - Math.min((xr - hs) * 0.55, top * 0.45);
  g.path([['M', hs, 0], ['L', hs, ry], ['vh', W / 2, yt], ['hv', xr, ry], ['L', xr, 0]], { part: 'stem', serifS: 'both', serifE: 'both' });
}
/** A cup `top` high and W wide, a U: the U itself, and the arched V W v w. */
export function cup(g: Builder, m: Metrics, W: number, top: number) {
  g.sb = [1, 1];
  const hs = m.s / 2, hh = m.hT / 2, xr = W - hs, yb = -m.os + hh, ry = yb + Math.min((xr - hs) * 0.55, top * 0.45);
  g.path([['M', hs, top], ['L', hs, ry], ['vh', W / 2, yb], ['hv', xr, ry], ['L', xr, top]], { part: 'stem', serifS: 'both', serifE: 'both' });
}

/** V and v with the right side upright: a diagonal down from the top left into a stem on the right. */
export function uprightV(g: Builder, m: Metrics, W: number, top: number) {
  const xr = W - m.s / 2, l = footIn(m, xr, top);
  turnStroke(g, m, [[l, top], [xr, 0], [xr, top]], [{ i: 1, ax: 1, at: 0, dir: -1 }],
    { s: H, e: H, part: 'diagonal', serifS: 'both', serifE: 'both' });
}
/** W and w with the right side upright: down, up to a lower middle peak, down, and up the stem. */
export function uprightW(g: Builder, m: Metrics, W: number, top: number) {
  const xr = W - m.s / 2, l = footIn(m, W * 0.36, top);
  turnStroke(g, m, [[l, top], [lerp(l, xr, 0.36), 0], [lerp(l, xr, 0.64), top * 0.76], [xr, 0], [xr, top]],
    [{ i: 1, ax: 1, at: 0, dir: -1 }, { i: 2, ax: 1, at: top * 0.76, dir: 1, inner: true }, { i: 3, ax: 1, at: 0, dir: -1 }],
    { s: H, e: H, part: 'diagonal', serifS: 'both', serifE: 'both' });
}

/* ---------- tails and hooks ---------- */

/** How long straight tails and flicks are: 1 at the usual length, 0.6 short, 1.5 long. */
export const tailK = (m: Metrics) => (m.p.tail < 0.5 ? lerp(0.6, 1, m.p.tail * 2) : lerp(1, 1.5, m.p.tail * 2 - 1));
/** How far round a hook curls, as the drawn share `u` of its last quarter turn: the usual `u`
    at the middle, short but still a hook when short (an f or a j with less would read as a t or an i),
    the whole turn when long. */
export const hookU = (m: Metrics, u: number) => (m.p.tail < 0.5 ? lerp(u * 0.6, u, m.p.tail * 2) : lerp(u, 1, m.p.tail * 2 - 1));
/** Long hooks also swing further out, up to a third wider. */
export const hookK = (m: Metrics) => 1 + Math.max(0, m.p.tail * 2 - 1) / 3;

/** Mark the free end of a tail or hook, and note how far past the body it reaches. */
export function tailEnd(g: Builder, x: number, y: number, W: number) {
  g.mark('tail', x, y);
  if (x > W) g.reachR = Math.max(g.reachR, x);
  if (x < 0) g.reachL = Math.min(g.reachL, x);
}

/* ---------- cursive: entry and exit strokes ---------- */

/** Radius of the cursive hooks; 0 when the design has no cursive at all. */
export const hookR = (m: Metrics) => (m.cur < 0.04 ? 0 : lerp(m.s * 0.55, m.xh * 0.26 + m.s * 0.35, m.cur));

/** Where an exit stroke leaving a stem at `x` ends. */
export const exitEnd = (m: Metrics, x: number, r: number) => ({ x: x + r * (1 + 1.3 * tailK(m)), y: -m.os + m.hT / 2 + r * 1.2 * tailK(m) });

/* the tail of a stroke arriving at the baseline: curls round and flicks up to the right */
const exitTail = (m: Metrics, x: number, r: number): Cmd[] => {
  const yb = -m.os + m.hT / 2, k = tailK(m), e = exitEnd(m, x, r);
  return [['L', x, yb + r], ['vh', x + r, yb], ['C', x + r * (1 + 0.55 * k), yb, x + r * (1 + k), yb + r * 0.45 * k, e.x, e.y]];
};

/** Mark an exit stroke's end and make room for it. */
export function exitMark(g: Builder, m: Metrics, x: number, r: number) {
  const e = exitEnd(m, x, r);
  g.mark('exit', e.x, e.y);
  g.mark('tail', e.x, e.y);
  g.reachR = Math.max(g.reachR, e.x);
}

/** Stem from `top` to the baseline. In cursive designs its foot becomes an exit stroke. */
export function footStem(g: Builder, m: Metrics, x: number, top: number, o: StrokeOpts = {}) {
  const r = hookR(m);
  if (!r) { g.stem(x, 0, top, o); return; }
  // drawn from the top down, so the serif a stem drawn up would have at its end (serifE) goes on this one's start
  g.path([['M', x, top], ...exitTail(m, x, r)], { s: 'flat', e: T, we: 0.75, part: 'stem', serifS: o.serifE });
  exitMark(g, m, x, r);
}

/** Upstroke leading into the top of a stem from the left. Returns false when not drawn. */
export function entry(g: Builder, m: Metrics, x: number, top: number) {
  const r = hookR(m) * 0.85;
  if (!r) return false;
  const y = top - m.hT / 2;
  // a short flick into the top in a hand that is only a little cursive; in a joined-up hand it starts
  // low, near the baseline where the letter before lets go, so it rises under that letter's bowl
  // (an o, b or p, fullest halfway up) instead of running into it
  const k = clamp((m.cur - 0.35) / 0.65), xs = x - r * lerp(1.25, 1.4, k), ys = lerp(y - r * 0.95, Math.min(y - r * 0.95, m.xh * 0.22), k);
  g.path([['M', xs, ys], ['C', lerp(x - r * 0.75, xs + (x - xs) * 0.45, k), lerp(y - r * 0.3, ys + (y - ys) * 0.7, k), x - r * 0.3, y, x + m.s * 0.2, y]],
    { s: T, e: 'flat', ws: 0.7, part: 'entry' });
  g.mark('entry', xs, ys);
  g.reachL = Math.min(g.reachL, xs);
  return true;
}

/** The commands with every point moved by f, to turn or mirror a drawing; their options stay as they are. */
export const mapCmds = (cmds: Cmd[], f: (x: number, y: number) => [number, number]): Cmd[] => cmds.map(c => {
  if (c[0] === 'Z') return c;
  const o = c.slice() as Cmd;
  for (let i = 1; i + 1 < c.length && typeof c[i] === 'number'; i += 2) { const p = f(c[i], c[i + 1]); o[i] = p[0]; o[i + 1] = p[1]; }
  return o;
});

/* ---------- forms a capital shares with its lowercase (I J i l, Y y, Z z) ---------- */

/* in a monospaced sans the narrow letters get bars, so they fill their cell like the others */
const monoBars = (m: Metrics) => m.p.mono >= 0.5 && !m.serif;
/** Whether I, J, i and l get their bars (on i and l a flag and a foot): picked, or left to monospacing. */
export const iBars = (m: Metrics) => m.p.iForm === 'bars' || (m.p.iForm === 'auto' && monoBars(m));

/* Y and y as a cup: the left side comes down and runs across into the right, which runs on
   down into a diagonal to the baseline (Y) or the descender (y) */
export function cupY(g: Builder, m: Metrics, W: number, top: number, yb: number, foot: XY, o: StrokeOpts) {
  const hs = m.s / 2, xr = W - hs;
  g.path([['M', hs, top], ['L', hs, yb], ['L', xr, yb, roundBends(m) ? { turn: bendTurn(m) } : {}]],
    { e: J, part: 'stem', serifS: 'both' });
  turnStroke(g, m, [[xr, top], [xr, yb], foot], [], { s: H, part: 'diagonal', serifS: 'both', ...o });
}

/* Z and z: a bar along the top and one along the foot with a diagonal between them, or with round bends
   one stroke through all three */
export function zed(g: Builder, m: Metrics, W: number, top: number) {
  const hh = m.hT / 2;
  if (roundBends(m)) {
    // one stroke, bent round where the diagonal leaves the top bar and meets the bottom one
    turnStroke(g, m, [[0, top - hh], [W, top - hh], [0, hh], [W, hh]],
      [{ i: 1, ax: 0, at: W, dir: 1 }, { i: 2, ax: 0, at: 0, dir: -1 }], { s: T, e: T, part: 'arm', serifS: 'a', serifE: 'b', serifScale: 0.7 });
    return;
  }
  // the diagonal's outer edges run into the bars' inside corners, so neither bar steps out past it:
  // its centerline turns about the middle until it is half a stroke from the corner (W, top - bar)
  const qx = W / 2, qy = top / 2 - m.hT, rho = Math.hypot(qx, qy);
  const phi = Math.atan2(qy, qx) + Math.asin(Math.min(0.99, m.s / 2 / rho));
  const o = clamp(W / 2 - top / 2 / Math.tan(phi), 0, W / 2);
  g.line(0, top - hh, W, top - hh, { s: T, part: 'arm', serifS: 'a', serifScale: 0.7 });
  g.line(W - o, top, o, 0, { s: H, e: H, w: 'thick', part: 'diagonal', clip: { x0: 0, x1: W } });
  g.line(0, hh, W, hh, { e: T, part: 'arm', serifE: 'b', serifScale: 0.7 });
}

/* ---------- measures the letter files share ---------- */

/** The lowercase's measures: the x-height X, half a stem hs and half a bar hh, and the centerlines of a round
    letter's top yt and bottom yb, which overshoot the x-height and the baseline. */
export const lc = (m: Metrics) => ({ X: m.xh, hs: m.s / 2, hh: m.hT / 2, yt: m.xh + m.os - m.hT / 2, yb: -m.os + m.hT / 2 });
/** How much bigger or smaller than usual Dot size makes the dots. */
export const dotK = (m: Metrics) => (m.p.dotSize < 0.5 ? lerp(0.7, 1, m.p.dotSize * 2) : lerp(1, 1.5, m.p.dotSize * 2 - 1));
