/* Glyph skeletons.
   Every glyph is a function of the shared metrics `m` (cap height, x-height, stem,
   curve tension, aperture, crossbar height, apex…). It draws centerline strokes with the
   builder `g` and returns its body width. Because all glyphs read the same metrics, one
   slider reshapes the whole alphabet coherently.

   Path commands: ['M',x,y] ['L',x,y,{w}] ['C',x1,y1,x2,y2,x,y,{w}] ['hv'|'vh',x,y,{u0,u1,w}] ['Z']
   Stroke ends (s = start, e = end): 'flat' | 'term' (styled terminal) | 'h'/'v' (axis cut) | 'join' */
import { defGlyph as def, type Builder, type Metrics } from './font';
import { clamp, lerp } from './geom';
import type { Cmd, StrokeOpts } from './types';

const J = 'join', T = 'term', H = 'h';

/* ---------- shared constructions ---------- */

/* zig-zag of diagonals (A V W M v w): apex sharpness comes from m.apex */
function zig(g: Builder, m: Metrics, xs: number[], yT: number, yB: number, startTop: boolean, o?: StrokeOpts) {
  const a = m.apex, n = xs.length, Hh = yT - yB, ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const top = startTop ? i % 2 === 0 : i % 2 === 1;
    let y = top ? yT : yB;
    if (i > 0 && i < n - 1) {
      const dx = (xs[i] - xs[i - 1] + xs[i + 1] - xs[i]) / 2;
      const half = Math.atan2(dx, Hh), t = (m.tDir(dx, Hh) + m.thin) / 2;
      const tip = (t / 2) / Math.sin(half), ext = a > 0.03 ? a * 1.5 * m.s : m.os;
      y = top ? yT + ext - tip : yB - ext + tip;
      g.mark(top ? 'apex' : 'vertex', xs[i], top ? yT : yB);
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

/* bowl attached to a stem with straight top/bottom (B D P R) */
function capBowl(g: Builder, m: Metrics, x0: number, yT: number, yB: number, R: number) {
  const ry = (yT - yB) / 2, cy = (yT + yB) / 2;
  const rx = Math.max(m.s * 0.3, Math.min(R - x0 - m.s * 0.25, ry * (1.2 + m.sq)));
  const xa = R - rx;
  g.path([['M', x0, yT], ['L', xa, yT], ['hv', R, cy], ['vh', xa, yB], ['L', x0, yB]], { s: J, e: J, part: 'bowl', counter: true });
}

/** How far the overlap setting pushes a bowl off its stem: none from half overlap up, and below
    that up to the point where the o's side only just touches the stem. */
const bowlGap = (m: Metrics) => m.s * 0.9 * clamp(1 - m.p.overlap * 2);

/* bowl beside a stem (b d p q a g). Fully overlapped it branches out of the stem; toward half
   overlap its inner side rounds out into a whole o standing on the stem, and below half that o
   slides off the stem. Callers leave bowlGap(m) of extra room between xStem and xFar.
   With square joins it is a half round on the far side whose flat top and bottom run straight
   into the stem, like a D, and stays on the stem whatever the overlap. */
function branchBowl(g: Builder, m: Metrics, xStem: number, xFar: number, yT: number, yB: number, o?: StrokeOpts) {
  const dir = Math.sign(xFar - xStem), cy = (yT + yB) / 2;
  if (m.p.bowlJoin === 'square') {
    // flat, so it sits on the x-height and baseline like the stem instead of overshooting them
    const t = yT - m.os, b = yB + m.os, rx = Math.max(0, Math.min(Math.abs(xFar - xStem) - m.s * 0.25, (t - b) / 2)), xa = xFar - dir * rx;
    g.path([['M', xStem, t], ['L', xa, t], ['hv', xFar, cy], ['vh', xa, b], ['L', xStem, b]], { s: J, e: J, part: 'bowl', counter: true, ...o });
    // inside, the counter rounds into the stem nearly as fully as on its far side
    const xi = xStem + dir * m.s / 2, ri = 0.9 * Math.min(rx - m.s / 2, Math.abs(xa - xi));
    fillet(g, m, xi, t - m.hT / 2, dir, -1, ri);
    fillet(g, m, xi, b + m.hT / 2, dir, 1, ri);
    return;
  }
  const xn = xStem + dir * bowlGap(m);
  const f = clamp(m.p.overlap * 2 - 1), cx = (xn + xFar) / 2 + dir * m.s * 0.14 * f;
  g.mark('overlap', xn, cy);
  if (f === 0) {
    g.path([['M', cx, yT], ['hv', xFar, cy], ['vh', cx, yB], ['hv', xn, cy], ['vh', cx, yT], ['Z']], { part: 'bowl', ...o });
    return;
  }
  const jh = (yT - yB) * lerp(0.5, 0.36, f), w = lerp(1, 0.6, f);
  g.path([['M', xStem, yT - jh], ['vh', cx, yT], ['hv', xFar, cy], ['vh', cx, yB], ['hv', xStem, yB + jh]],
    { s: J, e: J, ws: w, we: w, part: 'bowl', counter: true, ...o });
}

function oval(g: Builder, _m: Metrics, xl: number, xr: number, yb: number, yt: number, o?: StrokeOpts) {
  const cx = (xl + xr) / 2, cy = (yb + yt) / 2;
  g.path([['M', cx, yt], ['hv', xr, cy], ['vh', cx, yb], ['hv', xl, cy], ['vh', cx, yt], ['Z']], { part: 'bowl', ...o });
}

/* open round shape (C c G e): draws from the top terminal round to the bottom one */
function openBowl(g: Builder, _m: Metrics, xl: number, xr: number, yb: number, yt: number, u0: number, u1: number, o?: StrokeOpts) {
  const cx = (xl + xr) / 2, cy = (yb + yt) / 2;
  g.path([['M', xr, cy], ['vh', cx, yt, { u0 }], ['hv', xl, cy], ['vh', cx, yb], ['hv', xr, cy, { u1 }]],
    { s: T, e: T, part: 'bowl', ...o });
}

/* the flat-spined s: two rounded boxes stacked, the spine running level a little above the middle
   between two tight turns, the ends running level out from the top left and bottom right */
function flatS(g: Builder, m: Metrics, x0: number, W: number, yB: number, yT: number, o?: StrokeOpts) {
  const sc = o?.scale || 1, hs = m.s * sc / 2, hh = m.hT * sc / 2;
  const t = yT - hh - m.os, b = yB + hh + m.os, xl = x0 + hs, xr = x0 + W - hs, ym = lerp(b, t, 0.52);
  // the lower bowl is the bigger, and rounder at its outer corner
  const r1 = Math.min((xr - xl) * 0.32, (t - ym) * 0.6), r3 = Math.min((xr - xl) * 0.36, (ym - b) * 0.6);
  const r2 = Math.min((xr - xl) * 0.3, (t - ym) * 0.4, (ym - b) * 0.4);
  // the more open, the further the ends stop short of the sides
  const off = W * lerp(0.04, 0.3, m.ap);
  g.path([['M', x0 + W - off, t], ['L', xl + r1, t], ['hv', xl, t - r1], ['L', xl, ym + r2], ['vh', xl + r2, ym], ['L', xr - r2, ym],
    ['hv', xr, ym - r2], ['L', xr, b + r3], ['vh', xr - r3, b], ['L', x0 + off * 0.6, b]], { s: T, e: T, part: 'spine', ...o });
  // the counters round into the spine more fully than its turns do outside
  fillet(g, m, xl + hs, ym + hh, 1, 1, m.s * sc * 1.1);
  fillet(g, m, xr - hs, ym - hh, -1, -1, m.s * sc * 0.8);
}

function sShape(g: Builder, m: Metrics, x0: number, W: number, yB: number, yT: number, o?: StrokeOpts) {
  if (m.p.sForm === 'flat') { flatS(g, m, x0, W, yB, yT, o); return; }
  const sc = o?.scale || 1, hs = m.s * sc / 2, hh = m.hT * sc / 2, Hh = yT - yB;
  const t = yT - hh, b = yB + hh, xl = x0 + hs, xr = x0 + W - hs, cx = x0 + W / 2;
  const xlT = xl + W * 0.035, xrT = xr - W * 0.035;
  const y1 = yB + Hh * 0.74, y2 = yB + Hh * 0.27, c = (y1 - y2) * 0.6;
  const u0 = lerp(0.2, 0.55, m.ap);
  // the spine carries the weight, but in black weights it must leave room for both counters
  const thick = m.s * sc, thin = Math.min(m.thin * sc, thick), spineT = Math.min(thick, Hh * 0.25);
  const sw = thick > thin ? Math.max(0, Math.min(1, (spineT - thin) / (thick - thin))) : 1;
  g.path([['M', xrT, y1], ['vh', cx, t, { u0 }], ['hv', xlT, y1],
    ['C', xlT, y1 - c, xr, y2 + c, xr, y2, { w: sw }], ['vh', cx, b], ['hv', xl, y2, { u1: 1 - u0 }]],
    { s: T, e: T, part: 'spine', ...o });
}

/* shoulder of n m h: springs from the stem at x0 and comes down at x1. With square joins it runs
   flat out of the top of the stem and turns down in one round corner. */
function arch(g: Builder, m: Metrics, x0: number, x1: number, yTop: number, yFoot: number, o?: StrokeOpts, exit = false) {
  const X = m.xh, ah = X * 0.4, r = exit ? hookR(m) : 0;
  const cx = (x0 + x1) / 2 + (x1 - x0) * 0.1 * m.org;
  const t = X - m.hT / 2, rc = squareR(m, x1 - x0), square = m.p.bowlJoin === 'square';
  const head: Cmd[] = square ? [['M', x0, t], ['L', x1 - rc, t], ['hv', x1, t - rc]]
    : [['M', x0, X - ah], ['vh', cx, yTop], ['hv', x1, X - ah * 0.95]];
  // a shoulder springing from the side of the stem thins where it leaves it; a square one runs out of its top at full weight,
  // its counter rounding into the stem as it does on the far side
  const ws = square ? 1 : 0.6;
  if (square) fillet(g, m, x0 + m.s / 2, t - m.hT / 2, 1, -1, rc - m.s / 2);
  if (r) {
    g.path([...head, ...exitTail(m, x1, r)], { s: J, e: T, ws, we: 0.75, part: 'shoulder', ...o });
    exitMark(g, m, x1, r);
  }
  else g.path([...head, ['L', x1, yFoot]], { s: J, e: 'flat', ws, part: 'shoulder', serifE: 'both', ...o });
}

/** Radius of the round corner of a square-joined shoulder `span` wide (centerline to centerline). */
const squareR = (m: Metrics, span: number) => Math.max(0, Math.min(span - m.s * 0.25, span * 0.45));
/** Round the inside corner of a square join (see Builder.fillet). A wireframe shows every stroke
    as drawn, so it leaves the corner be. */
function fillet(g: Builder, m: Metrics, x: number, y: number, sx: number, sy: number, r: number) {
  if (m.p.fill !== 'wire') g.fillet(x, y, sx, sy, r);
}


/* arm and leg of K/k, off a stem at x0 up to `top`, the arm reaching r. The leg springs from the
   arm (leaving the stem at ay, the leg from f of the way up it), or both meet at the stem, or at the
   end of a short bar out from it (m.p.kForm). */
function kArms(g: Builder, m: Metrics, x0: number, top: number, r: number, ay: number, f: number, clip: { y1?: number }) {
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

/* ---------- tails and hooks ---------- */

/** How long straight tails and flicks are: 1 at the usual length, 0.6 short, 1.5 long. */
const tailK = (m: Metrics) => (m.p.tail < 0.5 ? lerp(0.6, 1, m.p.tail * 2) : lerp(1, 1.5, m.p.tail * 2 - 1));
/** How far round a hook curls, as the drawn share `u` of its last quarter turn: the usual `u`
    at the middle, a stub when short, the whole turn when long. */
const hookU = (m: Metrics, u: number) => (m.p.tail < 0.5 ? lerp(u * 0.35, u, m.p.tail * 2) : lerp(u, 1, m.p.tail * 2 - 1));
/** Long hooks also swing further out, up to a third wider. */
const hookK = (m: Metrics) => 1 + Math.max(0, m.p.tail * 2 - 1) / 3;

/** Mark the free end of a tail or hook, and note how far past the body it reaches. */
function tailEnd(g: Builder, x: number, y: number, W: number) {
  g.mark('tail', x, y);
  if (x > W) g.reachR = Math.max(g.reachR, x);
  if (x < 0) g.reachL = Math.min(g.reachL, x);
}

/* ---------- cursive: entry and exit strokes ---------- */

/** Radius of the cursive hooks; 0 when the design has no cursive at all. */
const hookR = (m: Metrics) => (m.cur < 0.04 ? 0 : lerp(m.s * 0.55, m.xh * 0.26 + m.s * 0.35, m.cur));

/** Where an exit stroke leaving a stem at `x` ends. */
const exitEnd = (m: Metrics, x: number, r: number) => ({ x: x + r * (1 + 1.3 * tailK(m)), y: -m.os + m.hT / 2 + r * 1.2 * tailK(m) });

/* the tail of a stroke arriving at the baseline: curls round and flicks up to the right */
const exitTail = (m: Metrics, x: number, r: number): Cmd[] => {
  const yb = -m.os + m.hT / 2, k = tailK(m), e = exitEnd(m, x, r);
  return [['L', x, yb + r], ['vh', x + r, yb], ['C', x + r * (1 + 0.55 * k), yb, x + r * (1 + k), yb + r * 0.45 * k, e.x, e.y]];
};

/** Mark an exit stroke's end and make room for it. */
function exitMark(g: Builder, m: Metrics, x: number, r: number) {
  const e = exitEnd(m, x, r);
  g.mark('exit', e.x, e.y);
  g.mark('tail', e.x, e.y);
  g.reachR = Math.max(g.reachR, e.x);
}

/** Stem from `top` to the baseline. In cursive designs its foot becomes an exit stroke. */
function footStem(g: Builder, m: Metrics, x: number, top: number, o: StrokeOpts = {}) {
  const r = hookR(m);
  if (!r) { g.stem(x, 0, top, o); return; }
  g.path([['M', x, top], ...exitTail(m, x, r)], { s: 'flat', e: T, we: 0.75, part: 'stem', serifS: o.serifE });
  exitMark(g, m, x, r);
}

/** Upstroke leading into the top of a stem from the left. Returns false when not drawn. */
function entry(g: Builder, m: Metrics, x: number, top: number) {
  const r = hookR(m) * 0.85;
  if (!r) return false;
  const y = top - m.hT / 2;
  g.path([['M', x - r * 1.25, y - r * 0.95], ['C', x - r * 0.75, y - r * 0.3, x - r * 0.3, y, x + m.s * 0.2, y]],
    { s: T, e: 'flat', ws: 0.7, part: 'entry' });
  g.mark('entry', x - r * 1.25, y - r * 0.95);
  g.reachL = Math.min(g.reachL, x - r * 1.25);
  return true;
}

const mapCmds = (cmds: Cmd[], f: (x: number, y: number) => [number, number]): Cmd[] => cmds.map(c => {
  if (c[0] === 'Z') return c;
  const o = c.slice() as Cmd;
  for (let i = 1; i + 1 < c.length && typeof c[i] === 'number'; i += 2) { const p = f(c[i], c[i + 1]); o[i] = p[0]; o[i + 1] = p[1]; }
  return o;
});

/* ---------- UPPERCASE ---------- */

def('A', [0.25, 0.25], (g, m) => {
  const W = m.W(620), C = m.cap, l = m.s * 0.55, r = W - l, cx = W / 2;
  const ys = zig(g, m, [l, cx, r], C, 0, false, { part: 'stem' });
  const by = C * (0.12 + 0.36 * m.bar), f = by / ys[1];
  const xl = lerp(l, cx, f), xr = lerp(r, cx, f);
  g.line(xl, by, xr, by, { s: J, e: J, part: 'crossbar' });
  g.counter([[cx, ys[1]], [xl, by], [xr, by]]);
  return W;
}, { parts: ['apex', 'stem', 'crossbar', 'counter'], params: ['apex', 'crossbar', 'counter', 'weight'] });

def('B', [1, 0.55], (g, m) => {
  const W = m.W(540, 'c'), C = m.cap, hs = m.s / 2, hh = m.hT / 2, mid = C * (0.45 + 0.14 * m.bar);
  g.stem(hs, 0, C, { serifS: 'a', serifE: 'a' });
  capBowl(g, m, hs, C - hh, mid, W * 0.93 - hs);
  capBowl(g, m, hs, mid, hh, W - hs);
  return W;
}, { params: ['counter', 'crossbar', 'curve', 'weight'] });

def('C', [0.55, 0.4], (g, m) => {
  const W = m.W(640, 'r'), C = m.cap, hs = m.s / 2, hh = m.hT / 2, u = lerp(0.25, 0.6, m.ap);
  openBowl(g, m, hs, W - hs, -m.os + hh, C + m.os - hh, u, 1 - u);
  // the more open the mouth, the further the terminals sit from the right edge
  return W * (0.97 - 0.12 * m.ap);
}, { params: ['aperture', 'terminal', 'curve', 'contrast'] });

def('D', [1, 0.55], (g, m) => {
  const W = m.W(610, 'r'), C = m.cap, hs = m.s / 2, hh = m.hT / 2;
  g.stem(hs, 0, C, { serifS: 'a', serifE: 'a' });
  capBowl(g, m, hs, C - hh, hh, W - hs);
  return W;
});

function armsE(g: Builder, m: Metrics, W: number, bottom: boolean) {
  const C = m.cap, hs = m.s / 2, hh = m.hT / 2, mid = C * (0.43 + 0.14 * m.bar);
  g.stem(hs, 0, C, { serifS: bottom ? 'a' : 'both', serifE: 'a' });
  g.line(0, C - hh, W, C - hh, { e: T, part: 'arm', serifE: 'a', serifScale: 0.75 });
  g.line(hs, mid, W * 0.86, mid, { s: J, e: T, part: 'crossbar' });
  if (bottom) g.line(0, hh, W, hh, { e: T, part: 'arm', serifE: 'b', serifScale: 0.75 });
}
def('E', [1, 0.4], (g, m) => { const W = m.W(470, 'c'); armsE(g, m, W, true); return W; },
  { params: ['crossbar', 'terminal', 'roundness', 'weight'] });
def('F', [1, 0.3], (g, m) => { const W = m.W(450, 'c'); armsE(g, m, W, false); return W; });

def('G', [0.55, 0.7], (g, m) => {
  const W = m.W(670, 'r'), C = m.cap, hs = m.s / 2, hh = m.hT / 2, u = lerp(0.25, 0.6, m.ap);
  const xl = hs, xr = W - hs, yt = C + m.os - hh, yb = -m.os + hh, cx = W / 2, cy = C / 2, gb = C * 0.46;
  g.path([['M', xr, cy], ['vh', cx, yt, { u0: u }], ['hv', xl, cy], ['vh', cx, yb], ['hv', xr, gb + hh]], { s: T, e: 'flat', part: 'bowl' });
  g.line(W * 0.54, gb, W, gb, { s: T, part: 'bar' });
  return W;
}, { params: ['aperture', 'terminal', 'curve', 'contrast'] });

def('H', [1, 1], (g, m) => {
  const W = m.W(570), C = m.cap, hs = m.s / 2, by = C * (0.38 + 0.26 * m.bar);
  g.stem(hs, 0, C, { serifS: 'both', serifE: 'both' });
  g.stem(W - hs, 0, C, { serifS: 'both', serifE: 'both' });
  g.line(hs, by, W - hs, by, { s: J, e: J, part: 'crossbar' });
  return W;
}, { params: ['crossbar', 'height', 'width', 'weight'] });

/* in a monospaced sans the narrow letters get bars, so they fill their cell like the others */
const monoBars = (m: Metrics) => m.p.mono >= 0.5 && !m.serif;
/** Whether i and l get their flag and foot: picked, or left to monospacing. */
const iBars = (m: Metrics) => m.p.iForm === 'bars' || (m.p.iForm === 'auto' && monoBars(m));
def('I', [1, 1], (g, m) => {
  if (monoBars(m)) {
    const W = m.W(340), hh = m.hT / 2;
    g.stem(W / 2, 0, m.cap); g.line(0, m.cap - hh, W, m.cap - hh, { part: 'bar' }); g.line(0, hh, W, hh, { part: 'bar' });
    return W;
  }
  g.stem(m.s / 2, 0, m.cap, { serifS: 'both', serifE: 'both' }); return m.s;
});
/* i and l of a monospaced sans: a flag at the top and a bar at the foot */
function monoStem(g: Builder, m: Metrics, top: number) {
  const W = m.W(360), hh = m.hT / 2, x = W * 0.52;
  g.stem(x, 0, top); g.line(W * 0.12, top - hh, x, top - hh, { s: T, part: 'bar' }); g.line(0, hh, W, hh, { part: 'bar' });
  // with square joins the flag turns out of the stem like an arm, round on the inside
  if (m.p.bowlJoin === 'square') fillet(g, m, x - m.s / 2, top - m.hT, -1, -1, m.s * 0.8);
  return { W, x };
}

def('J', [0.4, 1], (g, m) => {
  const W = m.W(390), C = m.cap, hs = m.s / 2, hh = m.hT / 2, xr = W - hs, xl = hs, yb = -m.os + hh;
  const ry = yb + Math.min((xr - xl) * 0.55, C * 0.4), cx = (xl + xr) / 2;
  g.path([['M', xr, C], ['L', xr, ry], ['vh', cx, yb], ['hv', xl, ry, { u1: hookU(m, 0.6) }]], { e: T, part: 'stem', serifS: 'a' });
  const e = m.qpt(cx, yb, xl, ry, 'hv', hookU(m, 0.6));
  tailEnd(g, e.x, e.y, W);
  return W;
});

def('K', [1, 0.2], (g, m) => {
  const W = m.W(570), C = m.cap, hs = m.s / 2, r = W - m.s * 0.55;
  g.stem(hs, 0, C, { serifS: 'both', serifE: 'both' });
  kArms(g, m, hs, C, r, C * 0.34, 0.36, { y1: C });
  return W;
});

def('L', [1, 0.3], (g, m) => {
  const W = m.W(440, 'c'), hh = m.hT / 2;
  g.stem(m.s / 2, 0, m.cap, { serifS: 'a', serifE: 'both' });
  g.line(0, hh, W, hh, { e: T, part: 'arm', serifE: 'b', serifScale: 0.75 });
  return W;
});

def('M', [1, 1], (g, m) => {
  const W = m.W(740), C = m.cap, hs = m.s / 2;
  g.stem(hs, 0, C, { serifS: 'both', serifE: 'a', w: lerp(1, 0.35, m.p.contrast) });
  g.stem(W - hs, 0, C, { serifS: 'both', serifE: 'b' });
  zig(g, m, [hs, W / 2, W - hs], C, 0, true, { serifS: null, serifE: null, clipX: { x0: 0, x1: W } });
  return W;
}, { params: ['apex', 'weight', 'contrast'] });

def('N', [1, 1], (g, m) => {
  const W = m.W(600), C = m.cap, hs = m.s / 2, thin = lerp(1, 0.3, m.p.contrast);
  g.stem(hs, 0, C, { serifS: 'both', serifE: 'a', w: thin });
  g.stem(W - hs, 0, C, { serifS: 'b', serifE: 'both', w: thin });
  g.line(hs, C, W - hs, 0, { s: H, e: H, part: 'diagonal', w: 'thick', clip: { x0: 0, x1: W } });
  return W;
});

def('O', [0.55, 0.55], (g, m) => {
  const W = m.W(690, 'r'), hs = m.s / 2, hh = m.hT / 2;
  oval(g, m, hs, W - hs, -m.os + hh, m.cap + m.os - hh);
  return W;
}, { parts: ['bowl', 'counter'], params: ['counter', 'curve', 'contrast', 'width'] });

def('P', [1, 0.5], (g, m) => {
  const W = m.W(510, 'c'), C = m.cap, hs = m.s / 2, hh = m.hT / 2;
  g.stem(hs, 0, C, { serifS: 'both', serifE: 'a' });
  capBowl(g, m, hs, C - hh, C * (0.36 + 0.16 * m.bar), W - hs);
  return W;
});

def('Q', [0.55, 0.55], (g, m) => {
  const W = m.W(690, 'r'), C = m.cap, hs = m.s / 2, hh = m.hT / 2;
  oval(g, m, hs, W - hs, -m.os + hh, C + m.os - hh);
  const k = tailK(m), x0 = W * 0.56, y0 = C * 0.2, ex = x0 + W * 0.41 * k, ey = y0 - C * 0.27 * k;
  g.line(x0, y0, ex, ey, { s: J, e: T, part: 'tail' });
  tailEnd(g, ex, ey, W);
  return W;
});

def('R', [1, 0.2], (g, m) => {
  const W = m.W(550, 'c'), C = m.cap, hs = m.s / 2, hh = m.hT / 2, mid = C * (0.4 + 0.14 * m.bar), R1 = W * 0.94 - hs;
  g.stem(hs, 0, C, { serifS: 'both', serifE: 'a' });
  capBowl(g, m, hs, C - hh, mid, R1);
  g.line(lerp(hs, R1, 0.42), mid + hh * 0.5, W - m.s * 0.5, 0, { s: J, e: H, part: 'leg', clip: { y1: mid + hh * 0.9 }, serifE: 'both' });
  return W;
}, { params: ['counter', 'crossbar', 'curve', 'weight'] });

def('S', [0.5, 0.5], (g, m) => { const W = m.W(520, 'c'); sShape(g, m, 0, W, -m.os, m.cap + m.os); return W; },
  { parts: ['spine', 'terminal'], params: ['curve', 'terminal', 'aperture', 'weight'] });

def('T', [0.3, 0.3], (g, m) => {
  const W = m.W(530), hh = m.hT / 2;
  g.stem(W / 2, 0, m.cap, { serifS: 'both' });
  g.line(0, m.cap - hh, W, m.cap - hh, { s: T, e: T, part: 'arm', serifS: 'a', serifE: 'a', serifScale: 0.75 });
  return W;
});

def('U', [1, 1], (g, m) => {
  const W = m.W(570), C = m.cap, hs = m.s / 2, hh = m.hT / 2, xr = W - hs, yb = -m.os + hh;
  const ry = yb + Math.min((xr - hs) * 0.55, C * 0.45);
  g.path([['M', hs, C], ['L', hs, ry], ['vh', W / 2, yb], ['hv', xr, ry], ['L', xr, C]], { part: 'stem', serifS: 'both', serifE: 'both' });
  return W;
});

def('V', [0.2, 0.2], (g, m) => { const W = m.W(590), l = m.s * 0.55; zig(g, m, [l, W / 2, W - l], m.cap, 0, true); return W; },
  { params: ['apex', 'weight', 'contrast'] });

def('W', [0.2, 0.2], (g, m) => {
  const W = m.W(880), l = m.s * 0.55;
  zig(g, m, [l, lerp(l, W - l, 0.27), W / 2, lerp(l, W - l, 0.73), W - l], m.cap, 0, true);
  return W;
});

def('X', [0.25, 0.25], (g, m) => {
  const W = m.W(570), C = m.cap, l = m.s * 0.58;
  g.line(l, 0, W - l, C, { s: H, e: H, w: 'thin', part: 'diagonal', serifS: 'both', serifE: 'both' });
  g.line(l, C, W - l, 0, { s: H, e: H, part: 'diagonal', serifS: 'both', serifE: 'both' });
  return W;
});

def('Y', [0.2, 0.2], (g, m) => {
  const W = m.W(570), C = m.cap, l = m.s * 0.55, ym = C * 0.42;
  g.stem(W / 2, 0, ym + m.s * 0.2, { serifS: 'both' });
  g.line(l, C, W / 2, ym, { s: H, e: J, part: 'diagonal', serifS: 'both', clip: { y0: ym - m.s * 0.3 } });
  g.line(W - l, C, W / 2, ym, { s: H, e: J, w: 'thin', part: 'diagonal', serifS: 'both', clip: { y0: ym - m.s * 0.3 } });
  return W;
});

function zed(g: Builder, m: Metrics, W: number, top: number) {
  const hh = m.hT / 2, o = m.s * 0.62;
  g.line(0, top - hh, W, top - hh, { s: T, part: 'arm', serifS: 'a', serifScale: 0.7 });
  g.line(W - o, top, o, 0, { s: H, e: H, w: 'thick', part: 'diagonal', clip: { x0: 0, x1: W } });
  g.line(0, hh, W, hh, { e: T, part: 'arm', serifE: 'b', serifScale: 0.7 });
}
def('Z', [0.4, 0.4], (g, m) => { const W = m.W(530); zed(g, m, W, m.cap); return W; });

/* ---------- lowercase ---------- */

const lc = (m: Metrics) => ({ X: m.xh, hs: m.s / 2, hh: m.hT / 2, yt: m.xh + m.os - m.hT / 2, yb: -m.os + m.hT / 2 });

def('a', [0.6, 0.9], (g, m) => {
  const { X, hs, yt, yb } = lc(m), W = m.W(450, 'r'), xr = W - hs, xl = hs, ra = X * 0.34;
  const cxa = (xl + xr) / 2 + W * 0.02;
  const r = hookR(m);
  g.path([['M', xr, 0], ['L', xr, X - ra], ['vh', cxa, yt], ['hv', xl + W * 0.05, X - ra, { u1: lerp(0.85, 0.5, m.ap) }]],
    { e: T, part: 'stem', serifS: r ? null : 'b' });
  if (r) footStem(g, m, xr, X * 0.5);
  const bt = X * 0.57, cxb = (xl + xr) / 2 + W * 0.04, bcy = (bt + yb) / 2;
  g.path([['M', xr, bt], ['L', cxb, bt], ['hv', xl, bcy], ['vh', cxb, yb], ['hv', xr, bcy + X * 0.04]], { s: J, e: J, we: 0.7, part: 'bowl', counter: true });
  return W;
}, { params: ['story', 'aperture', 'counter', 'terminal', 'xHeight'] });

def('a.alt', [0.55, 1], (g, m) => {
  const { X, hs, yt, yb } = lc(m), W = m.W(480, 'r') + bowlGap(m);
  footStem(g, m, W - hs, X, { serifS: 'b' });
  branchBowl(g, m, W - hs, hs, yt, yb);
  return W;
}, { params: ['story', 'bowlJoin', 'overlap', 'counter', 'curve', 'xHeight'] });

def('b', [1, 0.55], (g, m) => {
  const { hs, yt, yb } = lc(m), W = m.W(480, 'r') + bowlGap(m);
  g.stem(hs, 0, m.asc, { serifE: 'a' }); branchBowl(g, m, hs, W - hs, yt, yb); return W;
});
def('c', [0.55, 0.35], (g, m) => {
  const { hs, yt, yb } = lc(m), W = m.W(430, 'r'), u = lerp(0.22, 0.58, m.ap);
  openBowl(g, m, hs, W - hs, yb, yt, u, 1 - u); return W * (0.96 - 0.12 * m.ap);
}, { params: ['aperture', 'terminal', 'curve', 'xHeight'] });
def('d', [0.55, 1], (g, m) => {
  const { hs, yt, yb } = lc(m), W = m.W(480, 'r') + bowlGap(m);
  footStem(g, m, W - hs, m.asc, { serifE: 'a', serifS: 'b' }); branchBowl(g, m, W - hs, hs, yt, yb); return W;
});
def('e', [0.55, 0.5], (g, m) => {
  const { X, hs, hh, yt, yb } = lc(m), W = m.W(460, 'r'), xl = hs, xr = W - hs, cx = W / 2, cy = X / 2;
  const by = X * (0.38 + 0.22 * m.bar);
  g.path([['M', xr, by - hh], ['vh', cx, yt], ['hv', xl, cy], ['vh', cx, yb], ['hv', xr, cy * 0.9, { u1: lerp(0.85, 0.5, m.ap) }]], { e: T, part: 'bowl' });
  g.line(xl, by, xr, by, { s: J, e: J, part: 'crossbar' });
  g.counter([[xl, by], [xl + W * 0.06, X * 0.8], [cx, yt], [xr - W * 0.06, X * 0.8], [xr, by]]);
  return W;
}, { params: ['crossbar', 'aperture', 'terminal', 'xHeight'] });
def('f', [0.35, 0.1], (g, m) => {
  const { X, hh } = lc(m), W = m.W(310), xs = W * 0.36, top = m.asc + m.os - hh, r = (W - xs) * 1.05, xh = xs + r * hookK(m);
  g.path([['M', xs, 0], ['L', xs, top - r * 0.9], ['vh', xh, top, { u1: hookU(m, 0.8) }]], { e: T, part: 'stem', serifS: 'both' });
  const e = m.qpt(xs, top - r * 0.9, xh, top, 'vh', hookU(m, 0.8));
  tailEnd(g, e.x, e.y, W);
  g.line(0, X - hh, W * 0.92, X - hh, { s: T, e: T, part: 'crossbar' });
  // a longer hook takes its extra reach with it, so the next letter doesn't run into it
  return W + r * (hookK(m) - 1);
});
/* descender of g (and the script y): a hook, or in script designs a loop that swings back
   up through the stem and out to the right */
function descender(g: Builder, m: Metrics, xr: number, xl: number, W: number, o?: StrokeOpts) {
  const { X, hh } = lc(m), db = m.desc + hh, ry = db + Math.min((xr - xl) * 0.55, -m.desc * 0.7), r = hookR(m);
  const head: Cmd[] = [['M', xr, X], ['L', xr, ry], ['vh', (xr + xl) / 2, db]];
  if (m.cur < 0.35) {
    const u = hookU(m, 0.62), e = m.qpt((xr + xl) / 2, db, xl + W * 0.04, ry, 'hv', u);
    g.path([...head, ['hv', xl + W * 0.04, ry, { u1: u }]], { e: T, part: 'stem', serifS: 'b', ...o });
    tailEnd(g, e.x, e.y, W);
    return;
  }
  const k = tailK(m), lx = xl - W * 0.08, ly = db * 0.45, ex = xr + r * 1.5 * k, ey = r * 0.8 * k;
  g.path([...head, ['hv', lx, ly], ['C', lx, ly * 0.2, xr - W * 0.2, -m.s * 0.4, ex, ey]], { e: T, we: 0.8, part: 'stem', serifS: 'b', ...o });
  g.mark('exit', ex, ey);
  g.mark('tail', ex, ey);
  g.reachR = Math.max(g.reachR, ex);
}
def('f.cur', [0.2, 0.1], (g, m) => {
  const { X, hh } = lc(m), W = m.W(310), xs = W * 0.5, top = m.asc + m.os - hh, r = (W - xs) * 1.05, db = m.desc + hh, rb = r * 0.95;
  const xt = xs + r * hookK(m), xb = xs - rb * hookK(m), u = hookU(m, 0.8);
  g.path([['M', xt, top], ['hv', xs, top - r * 0.9, { u0: 1 - u }], ['L', xs, db + rb * 0.9], ['vh', xb, db, { u1: u }]], { s: T, e: T, part: 'stem' });
  const et = m.qpt(xt, top, xs, top - r * 0.9, 'hv', 1 - u), eb = m.qpt(xs, db + rb * 0.9, xb, db, 'vh', u);
  tailEnd(g, et.x, et.y, W);
  tailEnd(g, eb.x, eb.y, W);
  g.line(W * 0.05, X - hh, W * 0.95, X - hh, { s: T, e: T, part: 'crossbar' });
  return W;
});
/** Fill the crotch below a circle (centre cx, cy, outer radius R) where it meets the right-hand
    edge xS of a stroke running down past it, with a round of radius r tangent to both. */
function crotch(g: Builder, cx: number, cy: number, R: number, xS: number, r: number) {
  const dx0 = xS - cx;
  if (Math.abs(dx0) >= R) return;
  const fx = xS + r, fy = cy - Math.sqrt(Math.max(0, (R + r) ** 2 - (fx - cx) ** 2));
  // where the round touches the circle, and where the circle meets the edge
  const k = R / (R + r), t2 = { x: cx + (fx - cx) * k, y: cy + (fy - cy) * k }, y0 = cy - Math.sqrt(R * R - dx0 * dx0);
  const a0 = Math.atan2(y0 - cy, dx0), a1 = Math.atan2(t2.y - cy, t2.x - cx), b0 = Math.atan2(t2.y - fy, t2.x - fx), e = 2;
  const pts: { x: number; y: number; smooth?: boolean; sharp?: boolean }[] = [{ x: xS - e, y: y0 + e, sharp: true }];
  // a little inside the circle's ink, round to where the round leaves it, then along the round to the edge
  for (let i = 0; i <= 8; i++) { const a = lerp(a0, a1, i / 8); pts.push({ x: cx + (R - e) * Math.cos(a), y: cy + (R - e) * Math.sin(a), smooth: i > 0 && i < 8 }); }
  for (let i = 0; i <= 12; i++) { const a = lerp(b0, Math.PI, i / 12); pts.push({ x: fx + r * Math.cos(a), y: fy + r * Math.sin(a), smooth: i > 0 && i < 12 }); }
  pts.push({ x: xS - e, y: fy, sharp: true });
  g.blob(pts);
}

/* the mirrored g: a round bowl hung from the x-height, as tall as it is wide, whose left side runs
   straight on down past the baseline, turns and runs flat back under the bowl. Its top right is
   square outside and round inside, the top running on a little past it in an ear. Returns the
   width, ear included. */
function mirroredG(g: Builder, m: Metrics, W: number) {
  const { X, hs, hh } = lc(m), xl = hs, xr = W - hs, cx = W / 2, t = X - hh, ear = m.s * 0.65;
  // round, and no taller than the x-height
  const bb = t - Math.min(xr - xl, X - m.hT), cy = (t + bb) / 2, db = m.desc + hh, rt = Math.min((cx - xl) * 0.45, (cy - db) * 0.5);
  const xt = xl + rt + Math.max(m.s * 0.5, (cx - xl - rt) * tailK(m));
  g.path([['M', W + ear, t], ['L', cx, t], ['hv', xl, cy], ['L', xl, db + rt], ['vh', xl + rt, db], ['L', xt, db]], { e: T, part: 'stem' });
  tailEnd(g, xt, db, W + ear);
  g.path([['M', xr, t], ['L', xr, cy], ['vh', cx, bb], ['hv', xl, cy]], { s: J, e: J, part: 'bowl' });
  fillet(g, m, xr - hs, t - m.hT / 2, -1, -1, 0.9 * ((xr - xl) / 2 - hs));
  // and under the bowl, where its outside meets the stroke running on down, the crotch fills in
  if (m.p.fill !== 'wire') crotch(g, cx, cy, (xr - xl) / 2 + m.hT / 2, xl + hs, m.s);
  g.ellipseCounter(cx, cy, (xr - xl) / 2 - hs, (t - bb) / 2 - hh);
  return W + ear;
}
def('g', [0.55, 1], (g, m) => {
  const { hs, yt, yb } = lc(m), W = m.W(480, 'r') + bowlGap(m), xr = W - hs;
  if (m.p.gForm === 'mirrored') return mirroredG(g, m, W);
  descender(g, m, xr, hs, W);
  branchBowl(g, m, xr, hs, yt, yb);
  return W;
});
def('y.cur', [0.9, 0.7], (g, m) => {
  const { X, hs, yb } = lc(m), W = m.W(455), xr = W - hs, ah = X * 0.4;
  const en = entry(g, m, hs, X);
  g.path([['M', hs, X], ['L', hs, ah * 0.95], ['vh', W / 2 - W * 0.1 * m.org, yb], ['hv', xr, ah]], { e: J, we: 0.6, part: 'shoulder', serifS: en ? null : 'a' });
  descender(g, m, xr, hs, W, { serifS: null, serifE: null });
  return W;
});
def('h', [1, 1], (g, m) => {
  const { hs, yt } = lc(m), W = m.W(455);
  g.stem(hs, 0, m.asc, { serifS: 'both', serifE: 'a' }); arch(g, m, hs, W - hs, yt, 0, undefined, true); return W;
});
/* dot of i/j: keeps a clear gap; in very heavy, tall-x-height designs the stem gives way */
/** How much bigger or smaller than usual Dot size makes the dots. */
const dotK = (m: Metrics) => (m.p.dotSize < 0.5 ? lerp(0.7, 1, m.p.dotSize * 2) : lerp(1, 1.5, m.p.dotSize * 2 - 1));
function tittle(m: Metrics) {
  // placed as a dot of the usual size, then grown or shrunk round its centre
  const d0 = m.s * 1.12, d = d0 * dotK(m), gap = Math.max(m.s * 0.3, m.cap * 0.05);
  const cy = Math.min(m.xh + gap + d0 / 2 + (m.asc - m.xh) * 0.12, m.asc + m.cap * 0.07 - d0 / 2);
  return { d, cy, top: Math.min(m.xh, cy - d / 2 - gap) };
}
def('i', [1, 1], (g, m) => {
  if (iBars(m)) { const t = tittle(m), { W, x } = monoStem(g, m, t.top); g.dot(x, t.cy, t.d); return W; }
  const t = tittle(m), en = entry(g, m, m.s / 2, t.top);
  footStem(g, m, m.s / 2, t.top, { serifS: 'both', serifE: en ? null : 'a' }); g.dot(m.s / 2, t.cy, t.d); return m.s;
});
def('j', [0.2, 1], (g, m) => {
  const { hs, hh } = lc(m), t = tittle(m), W = m.W(240), xs = W - hs, db = m.desc + hh, ry = db + Math.min(W * 0.7, -m.desc * 0.6);
  const en = entry(g, m, xs, t.top);
  const xh = xs - (W - hs) * 0.75 * hookK(m), u = hookU(m, 0.85), e = m.qpt(xs, ry, xh, db, 'vh', u);
  g.path([['M', xs, t.top], ['L', xs, ry], ['vh', xh, db, { u1: u }]], { e: T, part: 'stem', serifS: en ? null : 'a' });
  tailEnd(g, e.x, e.y, W);
  g.dot(xs, t.cy, t.d);
  return W;
});
def('k', [1, 0.2], (g, m) => {
  const { X, hs } = lc(m), W = m.W(450), r = W - m.s * 0.55;
  g.stem(hs, 0, m.asc, { serifS: 'both', serifE: 'a' });
  kArms(g, m, hs, X, r, X * 0.3, 0.4, {});
  return W;
});
def('l', [1, 1], (g, m) => {
  if (iBars(m)) return monoStem(g, m, m.asc).W;
  footStem(g, m, m.s / 2, m.asc, { serifS: 'both', serifE: 'a' }); return m.s;
});
def('m', [1, 1], (g, m) => {
  const { X, hs, yt } = lc(m), W = m.W(700);
  const en = entry(g, m, hs, X);
  g.stem(hs, 0, X, { serifS: 'both', serifE: en ? null : 'a' });
  arch(g, m, hs, W / 2, yt, 0); arch(g, m, W / 2, W - hs, yt, 0, undefined, true);
  return W;
});
def('n', [1, 1], (g, m) => {
  const { X, hs, yt } = lc(m), W = m.W(455);
  const en = entry(g, m, hs, X);
  g.stem(hs, 0, X, { serifS: 'both', serifE: en ? null : 'a' }); arch(g, m, hs, W - hs, yt, 0, undefined, true); return W;
}, { params: ['xHeight', 'curve', 'weight', 'width'] });
def('o', [0.55, 0.55], (g, m) => { const { hs, yt, yb } = lc(m), W = m.W(490, 'r'); oval(g, m, hs, W - hs, yb, yt); return W; },
  { params: ['counter', 'curve', 'xHeight', 'contrast'] });
def('p', [1, 0.55], (g, m) => {
  const { X, hs, yt, yb } = lc(m), W = m.W(480, 'r') + bowlGap(m);
  const en = entry(g, m, hs, X);
  g.stem(hs, m.desc, X, { serifS: 'both', serifE: en ? null : 'a' }); branchBowl(g, m, hs, W - hs, yt, yb); return W;
});
def('q', [0.55, 1], (g, m) => {
  const { X, hs, yt, yb } = lc(m), W = m.W(480, 'r') + bowlGap(m);
  g.stem(W - hs, m.desc, X, { serifS: 'both' }); branchBowl(g, m, W - hs, hs, yt, yb); return W;
});
def('r', [1, 0.15], (g, m) => {
  const { X, hs, hh, yt } = lc(m), W = m.W(310), ah = X * 0.4, en = entry(g, m, hs, X), u1 = lerp(0.62, 0.35, m.ap);
  g.stem(hs, 0, X, { serifS: 'both', serifE: en ? null : 'a' });
  if (m.p.bowlJoin === 'square') {
    const rc = squareR(m, W - hs) * 0.8;
    g.path([['M', hs, X - hh], ['L', W - rc, X - hh], ['hv', W, X - hh - rc, { u1 }]], { s: J, e: T, part: 'shoulder' });
    fillet(g, m, m.s, X - m.hT, 1, -1, Math.max(rc - hs, m.s));
  } else g.path([['M', hs, X - ah], ['vh', W * 0.66, yt], ['hv', W, X - ah * 0.8, { u1 }]], { s: J, e: T, ws: 0.6, part: 'shoulder' });
  return W;
});
def('s', [0.5, 0.5], (g, m) => { const W = m.W(395, 'c'); sShape(g, m, 0, W, -m.os, m.xh + m.os); return W; },
  { params: ['curve', 'terminal', 'aperture', 'xHeight'] });
def('t', [0.3, 0.3], (g, m) => {
  const { X, hh } = lc(m), W = m.W(320), xs = W * 0.36, square = m.p.bowlJoin === 'square';
  // with square joins the foot turns in a tighter round, like the other square-joined turns, and runs flat along the baseline
  const yb = square ? hh : lc(m).yb, ry = yb + (W - xs) * (square ? 0.38 : 0.75), hw = (W - xs) * hookK(m), xm = xs + hw * (square ? 0.38 : 0.66);
  const u = hookU(m, 0.5), e = m.qpt(xm, yb, xs + hw, ry, 'hv', u);
  g.path([['M', xs, X + (m.asc - X) * 0.62], ['L', xs, ry], ['vh', xm, yb], ['hv', xs + hw, ry, { u1: u }]], { e: T, part: 'stem' });
  tailEnd(g, e.x, e.y, W);
  g.line(0, X - hh, W * 0.95, X - hh, { s: T, e: T, part: 'crossbar' });
  return W + (W - xs) * (hookK(m) - 1);
});
def('u', [1, 1], (g, m) => {
  const { X, hs, yb } = lc(m), W = m.W(455), xr = W - hs, ah = X * 0.4;
  const en = entry(g, m, hs, X), serifS = en ? null : 'a';
  if (m.p.bowlJoin === 'square') {
    // the bowl turns in one round corner and runs flat along the baseline into the stem
    const rc = squareR(m, xr - hs), b = m.hT / 2;
    g.path([['M', hs, X], ['L', hs, b + rc], ['vh', hs + rc, b], ['L', xr, b]], { e: J, part: 'shoulder', serifS });
    fillet(g, m, xr - hs, m.hT, -1, 1, rc - hs);
  } else g.path([['M', hs, X], ['L', hs, ah * 0.95], ['vh', W / 2 - W * 0.1 * m.org, yb], ['hv', xr, ah]], { e: J, we: 0.6, part: 'shoulder', serifS });
  footStem(g, m, xr, X, { serifS: 'b', serifE: 'a' });
  return W;
});
def('v', [0.2, 0.2], (g, m) => { const W = m.W(450), l = m.s * 0.55; zig(g, m, [l, W / 2, W - l], m.xh, 0, true); return W; });
def('w', [0.2, 0.2], (g, m) => {
  const W = m.W(700), l = m.s * 0.55;
  zig(g, m, [l, lerp(l, W - l, 0.27), W / 2, lerp(l, W - l, 0.73), W - l], m.xh, 0, true); return W;
});
def('x', [0.25, 0.25], (g, m) => {
  const W = m.W(440), X = m.xh, l = m.s * 0.58;
  g.line(l, 0, W - l, X, { s: H, e: H, w: 'thin', part: 'diagonal', serifS: 'both', serifE: 'both' });
  g.line(l, X, W - l, 0, { s: H, e: H, part: 'diagonal', serifS: 'both', serifE: 'both' });
  return W;
});
def('y', [0.2, 0.2], (g, m) => {
  const W = m.W(450), X = m.xh, l = m.s * 0.55, r = W - l, cx = W / 2 + m.s * 0.1;
  const yd = m.desc * 0.92 * tailK(m), xd = cx + (cx - r) * -yd / X;
  g.line(r, X, xd, yd, { s: H, e: T, w: 'thin', part: 'tail', serifS: 'both' });
  tailEnd(g, xd, yd, W);
  g.line(l, X, cx, 0, { s: H, e: J, part: 'diagonal', serifS: 'both', clip: { y0: -m.s * 0.1 } });
  return W;
});
def('z', [0.4, 0.4], (g, m) => { const W = m.W(410); zed(g, m, W, m.xh); return W; });

/* ---------- figures ---------- */

def('0', [0.55, 0.55], (g, m) => { const W = m.W(540, 'r'), hs = m.s / 2, hh = m.hT / 2; oval(g, m, hs, W - hs, -m.os + hh, m.cap + m.os - hh); return W; });
def('1', [0.5, 1], (g, m) => {
  const W = m.W(330), C = m.cap, xs = W - m.s / 2;
  g.stem(xs, 0, C, { serifS: 'both' });
  g.line(xs, C - m.s * 0.1, m.s * 0.3, C * 0.76, { s: J, e: T, w: 'thin', part: 'arm', clip: { x1: W, y1: C } });
  return W;
});
def('2', [0.5, 0.5], (g, m) => {
  const W = m.W(520), C = m.cap, hs = m.s / 2, hh = m.hT / 2, xl = hs, xr = W - hs, yt = C + m.os - hh, y1 = C * 0.71;
  g.path([['M', xl + W * 0.03, y1], ['vh', W / 2, yt, { u0: lerp(0.2, 0.5, m.ap) }], ['hv', xr - W * 0.02, y1],
    ['C', xr - W * 0.02, C * 0.47, xl + W * 0.12, C * 0.25, xl + m.s * 0.15, 0, { w: 'thick' }]], { s: T, e: H, part: 'spine' });
  g.line(0, hh, W, hh, { e: T, part: 'arm' });
  return W;
});
def('3', [0.5, 0.55], (g, m) => {
  const W = m.W(520), C = m.cap, hs = m.s / 2, hh = m.hT / 2, xr = W - hs, yt = C + m.os - hh, yb = -m.os + hh, mid = C * 0.53, xm = W * 0.42;
  const u = lerp(0.2, 0.5, m.ap);
  g.path([['M', hs + W * 0.05, C * 0.73], ['vh', W * 0.48, yt, { u0: u }], ['hv', xr - W * 0.05, (yt + mid) / 2], ['vh', xm, mid]], { s: T, e: J, part: 'bowl' });
  g.path([['M', xm, mid], ['hv', xr, (mid + yb) / 2], ['vh', W * 0.48, yb], ['hv', hs, C * 0.27, { u1: 1 - u }]], { s: J, e: T, part: 'bowl' });
  return W;
});
def('4', [0.3, 0.5], (g, m) => {
  const W = m.W(560), C = m.cap, hs = m.s / 2, hh = m.hT / 2, xs = W * 0.72, by = C * 0.27, l = m.s * 0.5;
  g.stem(xs, 0, C, { serifS: 'both' });
  g.line(xs, C, l, by, { s: H, e: J, w: 'thin', part: 'diagonal', clip: { x1: xs + hs, y1: C, y0: by - hh } });
  g.line(0, by, W, by, { e: T, part: 'crossbar' });
  g.counter([[xs, C], [l, by], [xs, by]]);
  return W;
});
def('5', [0.6, 0.55], (g, m) => {
  const W = m.W(520), C = m.cap, hs = m.s / 2, hh = m.hT / 2, xl = hs, xr = W - hs, yb = -m.os + hh, bt = C * 0.63 - hh;
  const xv = hs + W * 0.1, st = m.qpt(xl, C * 0.44, W / 2, bt, 'vh', 0.4);
  g.line(xv - hs, C - hh, W * 0.9, C - hh, { e: T, part: 'arm' });
  g.line(xv, C, st.x + m.s * 0.1, st.y - hh, { e: J, w: 'thin', part: 'stem' });
  g.path([['M', xl, C * 0.44], ['vh', W / 2, bt, { u0: 0.4 }], ['hv', xr, (bt + yb) / 2], ['vh', W * 0.48, yb], ['hv', xl, C * 0.26, { u1: lerp(0.78, 0.5, m.ap) }]],
    { s: J, e: T, ws: 0.7, part: 'bowl' });
  return W;
});
function six(g: Builder, m: Metrics, flip: boolean) {
  const W = m.W(535, 'r'), C = m.cap, hs = m.s / 2, hh = m.hT / 2, xl = hs, xr = W - hs, cx = W / 2;
  const yt = C + m.os - hh, yb = -m.os + hh, bTop = C * 0.62 - hh, cyb = (bTop + yb) / 2;
  const f = flip ? (x: number, y: number): [number, number] => [W - x, C - y] : (x: number, y: number): [number, number] => [x, y];
  g.path(mapCmds([['M', xr - W * 0.02, C * 0.7], ['vh', cx + W * 0.03, yt, { u0: lerp(0.35, 0.65, m.ap) }], ['hv', xl, C * 0.5], ['L', xl, cyb],
    ['vh', cx, yb], ['hv', xr, cyb], ['vh', cx, bTop], ['hv', xl + m.s * 0.2, cyb]], f), { s: T, e: J, we: 0.75, part: 'bowl' });
  const c = f(cx, cyb); g.ellipseCounter(c[0], c[1], (xr - xl) / 2, (bTop - yb) / 2);
  return W;
}
def('6', [0.55, 0.55], (g, m) => six(g, m, false));
def('7', [0.4, 0.2], (g, m) => {
  const W = m.W(500), C = m.cap, hh = m.hT / 2, o = m.s * 0.6;
  g.line(0, C - hh, W, C - hh, { s: T, part: 'arm' });
  g.line(W - o, C, W * 0.3, 0, { s: H, e: H, part: 'diagonal', clip: { x1: W, y1: C }, serifE: 'both' });
  return W;
});
def('8', [0.55, 0.55], (g, m) => {
  const W = m.W(530, 'r'), C = m.cap, hs = m.s / 2, hh = m.hT / 2, mid = C * 0.535;
  oval(g, m, hs + W * 0.045, W - hs - W * 0.045, mid, C + m.os - hh);
  oval(g, m, hs, W - hs, -m.os + hh, mid);
  return W;
});
def('9', [0.55, 0.55], (g, m) => six(g, m, true));

/* ---------- punctuation ---------- */

const ds = (m: Metrics) => m.s * 1.18 * dotK(m);
function comma(g: Builder, m: Metrics, x: number, y: number) {
  const d = ds(m), k = tailK(m), ex = x + d * (0.22 - 0.52 * k), ey = y - d * (0.1 + 1.15 * k);
  g.dot(x, y, d);
  g.line(x + d * 0.22, y - d * 0.1, ex, ey, { s: J, e: T, we: 0.45, scale: 0.75, part: 'tail' });
  tailEnd(g, ex, ey, d);
}
def('.', [0.8, 0.8], (g, m) => { g.dot(ds(m) / 2, ds(m) / 2, ds(m)); return ds(m); });
def(',', [0.8, 0.8], (g, m) => { comma(g, m, ds(m) / 2, ds(m) / 2); return ds(m); });
def(':', [0.8, 0.8], (g, m) => { const d = ds(m); g.dot(d / 2, d / 2, d); g.dot(d / 2, m.xh - d / 2, d); return d; });
def(';', [0.8, 0.8], (g, m) => { const d = ds(m); comma(g, m, d / 2, d / 2); g.dot(d / 2, m.xh - d / 2, d); return d; });
def('!', [0.9, 0.9], (g, m) => {
  const d = ds(m);
  g.line(d / 2, m.cap, d / 2, d * 1.7 + m.cap * 0.06, { we: 0.6, part: 'stem' }); g.dot(d / 2, d / 2, d); return d;
});
def('?', [0.5, 0.5], (g, m) => {
  const W = m.W(430, 'c'), C = m.cap, hs = m.s / 2, hh = m.hT / 2, d = ds(m), yt = C + m.os - hh, xr = W - hs, cx = W * 0.47;
  g.path([['M', hs, C * 0.72], ['vh', cx, yt, { u0: lerp(0.2, 0.5, m.ap) }], ['hv', xr, C * 0.74],
    ['C', xr, C * 0.55, cx, C * 0.52, cx, d * 1.7 + C * 0.06]], { s: T, e: 'flat', part: 'hook' });
  g.dot(cx, d / 2, d);
  return W;
});
def("'", [0.7, 0.7], (g, m) => { g.line(m.s / 2, m.asc, m.s / 2, m.asc - m.cap * 0.3, { we: 0.55, part: 'stem' }); return m.s; });
def('"', [0.7, 0.7], (g, m) => {
  const gap = m.s * 1.9;
  g.line(m.s / 2, m.asc, m.s / 2, m.asc - m.cap * 0.3, { we: 0.55, part: 'stem' });
  g.line(m.s / 2 + gap, m.asc, m.s / 2 + gap, m.asc - m.cap * 0.3, { we: 0.55, part: 'stem' });
  return m.s + gap;
});
function paren(g: Builder, m: Metrics, flip: boolean) {
  const W = m.W(250), hs = m.s / 2, yT = m.asc, yB = m.desc * 0.7, Hh = yT - yB, xr = W - hs * 0.6, xl = hs - W * 0.12;
  const f = flip ? (x: number, y: number): [number, number] => [W - x, y] : (x: number, y: number): [number, number] => [x, y];
  g.path(mapCmds([['M', xr, yT], ['C', xl, yT - Hh * 0.3, xl, yB + Hh * 0.3, xr, yB]], f), { s: T, e: T, ws: 0.7, we: 0.7, part: 'bowl' });
  return W;
}
def('(', [0.6, 0.3], (g, m) => paren(g, m, false));
def(')', [0.3, 0.6], (g, m) => paren(g, m, true));
def('-', [0.6, 0.6], (g, m) => { const W = m.W(300); g.line(0, m.xh * 0.52, W, m.xh * 0.52, { s: T, e: T, part: 'bar' }); return W; });
def('/', [0.2, 0.2], (g, m) => {
  const W = m.W(330), l = m.s * 0.5;
  g.line(l, m.desc * 0.5, W - l, m.asc, { s: H, e: H, w: 'thin', part: 'diagonal' }); return W;
});
def('+', [0.6, 0.6], (g, m) => {
  const W = m.W(480), cy = m.cap * 0.4, r = W / 2;
  g.line(0, cy, W, cy, { s: T, e: T, part: 'bar' }); g.line(W / 2, cy - r, W / 2, cy + r, { s: T, e: T, w: 'thin', part: 'bar' }); return W;
});
def('&', [0.5, 0.2], (g, m) => {
  const W = m.W(660), C = m.cap, hs = m.s / 2, hh = m.hT / 2, yt = C + m.os - hh, yb = -m.os + hh, xl = hs;
  g.path([['M', W - m.s * 0.5, 0], ['C', W * 0.6, C * 0.34, W * 0.24, C * 0.58, W * 0.24, C * 0.79],
    ['vh', W * 0.41, yt], ['hv', W * 0.58, C * 0.8],
    ['C', W * 0.58, C * 0.6, xl, C * 0.5, xl, C * 0.24], ['vh', W * 0.4, yb],
    ['C', W * 0.62, yb, W * 0.8, C * 0.18, W * 0.84, C * 0.47]], { s: H, e: T, part: 'bowl' });
  return W;
});
def('@', [0.55, 0.55], (g, m) => {
  const sc = 0.7, W = m.W(880, 'r'), C = m.cap, hs = m.s * sc / 2, hh = m.hT * sc / 2;
  const yt = C + m.os - hh, yb = m.desc * 0.55 + hh, xl = hs, xr = W - hs, cx = W / 2, cy = (yt + yb) / 2;
  const rx = W * 0.17, ry = (yt - yb) * 0.2, sx = cx + rx + W * 0.02;
  oval(g, m, cx - rx - W * 0.02, sx, cy - ry, cy + ry, { scale: sc });
  g.path([['M', sx, cy + ry * 1.1], ['L', sx, cy - ry * 0.5], ['vh', (sx + xr) / 2, cy - ry * 1.12], ['hv', xr, cy], ['vh', cx, yt], ['hv', xl, cy], ['vh', cx, yb],
    ['hv', xr, cy, { u1: 0.42 }]], { e: T, scale: sc, part: 'bowl' });
  return W;
});
def('#', [0.4, 0.4], (g, m) => {
  const W = m.W(600), C = m.cap, sc = 0.8, k = W * 0.1;
  g.line(W * 0.27, 0, W * 0.27 + k, C, { s: H, e: H, scale: sc, part: 'stem' });
  g.line(W * 0.63, 0, W * 0.63 + k, C, { s: H, e: H, scale: sc, part: 'stem' });
  g.line(W * 0.04, C * 0.34, W * 0.94, C * 0.34, { scale: sc, part: 'bar' });
  g.line(W * 0.08, C * 0.66, W * 0.98, C * 0.66, { scale: sc, part: 'bar' });
  return W;
});
def('$', [0.5, 0.5], (g, m) => {
  const W = m.W(520, 'c'), C = m.cap;
  sShape(g, m, 0, W, -m.os, C + m.os);
  g.line(W / 2, -C * 0.13, W / 2, C * 1.13, { scale: 0.6, w: 'thin', part: 'stem' });
  return W;
});
def('%', [0.5, 0.5], (g, m) => {
  const W = m.W(800), C = m.cap, sc = 0.68, hs = m.s * sc / 2, hh = m.hT * sc / 2, rw = W * 0.36;
  oval(g, m, hs, rw - hs, C * 0.5 + hh, C + m.os - hh, { scale: sc });
  oval(g, m, W - rw + hs, W - hs, -m.os + hh, C * 0.5 - hh, { scale: sc });
  g.line(W * 0.26, 0, W * 0.74, C, { s: H, e: H, scale: sc, w: 'thin', part: 'diagonal' });
  return W;
});