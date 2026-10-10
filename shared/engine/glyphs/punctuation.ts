/* Punctuation and symbols (CHARSET.punct and CHARSET.symbols in font.ts). */
import { defGlyph as def, type Builder, type Metrics } from '../font';
import { lerp } from '../geom';
import type { Cmd, Pt } from '../types';
import { H, J, T, capAperture, dotK, lc, lcAperture, mapCmds, openBowl, oval, sShape, tailEnd, tailK, zig } from './shared';
import type { XY } from './turns';

/* ---------- punctuation (and the symbols + & @ # $ % among it) ---------- */

/** The size of the punctuation's dots (a full stop's), which Dot size grows and shrinks. */
const ds = (m: Metrics) => m.s * 1.18 * dotK(m);
/** How far a comma's tail hangs below the middle of its dot. */
const commaDrop = (m: Metrics) => ds(m) * (0.1 + 1.15 * tailK(m));
/** A comma whose dot sits at (x, y); turned half round (as in ‘ and “), its tail rises to the right. */
function comma(g: Builder, m: Metrics, x: number, y: number, turned = false) {
  const d = ds(m), k = tailK(m), t = turned ? -1 : 1, ex = x + t * d * (0.22 - 0.52 * k), ey = y - t * commaDrop(m);
  g.dot(x, y, d);
  g.line(x + t * d * 0.22, y - t * d * 0.1, ex, ey, { s: J, e: T, we: 0.45, scale: 0.75, part: 'tail' });
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
/* ? (and ¿, the same turned half round and hung from the x-height) */
function question(g: Builder, m: Metrics, turned: boolean) {
  const W = m.W(430, 'c'), C = m.cap, X = m.xh, hs = m.s / 2, hh = m.hT / 2, d = ds(m), yt = C + m.os - hh, xr = W - hs, cx = W * 0.47;
  const f = turned ? (x: number, y: number): XY => [W - x, X - y] : (x: number, y: number): XY => [x, y];
  g.path(mapCmds([['M', hs, C * 0.72], ['vh', cx, yt, { u0: lerp(0.2, 0.5, m.ap) }], ['hv', xr, C * 0.74],
    ['C', xr, C * 0.55, cx, C * 0.52, cx, d * 1.7 + C * 0.06]], f), { s: T, e: 'flat', part: 'hook' });
  const dot = f(cx, d / 2); g.dot(dot[0], dot[1], d);
  return W;
}
def('?', [0.5, 0.5], (g, m) => question(g, m, false));
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
/** The middle of the arithmetic signs (+ − × ÷ = < >, and ± ~ set about it): the bar of the +. */
const mathY = (m: Metrics) => m.cap * 0.4;
def('+', [0.6, 0.6], (g, m) => {
  const W = m.W(480), cy = mathY(m), r = W / 2;
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
  oval(g, cx - rx - W * 0.02, sx, cy - ry, cy + ry, { scale: sc });
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
  sShape(g, m, W, -m.os, C + m.os);
  g.line(W / 2, -C * 0.13, W / 2, C * 1.13, { scale: 0.6, w: 'thin', part: 'stem' });
  return W;
});
def('%', [0.5, 0.5], (g, m) => {
  const W = m.W(800), C = m.cap, sc = 0.68, hs = m.s * sc / 2, hh = m.hT * sc / 2, rw = W * 0.36;
  oval(g, hs, rw - hs, C * 0.5 + hh, C + m.os - hh, { scale: sc });
  oval(g, W - rw + hs, W - hs, -m.os + hh, C * 0.5 - hh, { scale: sc });
  g.line(W * 0.26, 0, W * 0.74, C, { s: H, e: H, scale: sc, w: 'thin', part: 'diagonal' });
  return W;
});

def('…', [0.8, 0.8], (g, m) => {
  const d = ds(m), step = d + Math.max(d * 0.75, m.s * 0.9);
  for (let i = 0; i < 3; i++) g.dot(d / 2 + i * step, d / 2, d);
  return d + 2 * step;
});
/* ¡ and ¿ are ! and ? turned half round, hanging from the x-height */
def('¡', [0.9, 0.9], (g, m) => {
  const d = ds(m), X = m.xh;
  g.line(d / 2, X - m.cap, d / 2, X - d * 1.7 - m.cap * 0.06, { we: 0.6, part: 'stem' }); g.dot(d / 2, X - d / 2, d); return d;
});
def('¿', [0.5, 0.5], (g, m) => question(g, m, true));
/* curly quotes: ’ is a comma raised to the top of the ascenders, ‘ that comma turned half round */
function quotes(g: Builder, m: Metrics, n: 1 | 2, at: 'open' | 'close' | 'low') {
  const d = ds(m), gap = d * 1.7, y = at === 'low' ? d / 2 : at === 'close' ? m.asc - d / 2 : m.asc - commaDrop(m) - d * 0.15;
  for (let i = 0; i < n; i++) comma(g, m, d / 2 + i * gap, y, at === 'open');
  return d + (n - 1) * gap;
}
def('‘', [0.7, 0.7], (g, m) => quotes(g, m, 1, 'open'));
def('’', [0.7, 0.7], (g, m) => quotes(g, m, 1, 'close'));
def('“', [0.7, 0.7], (g, m) => quotes(g, m, 2, 'open'));
def('”', [0.7, 0.7], (g, m) => quotes(g, m, 2, 'close'));
def('‚', [0.8, 0.8], (g, m) => quotes(g, m, 1, 'low'));
def('„', [0.8, 0.8], (g, m) => quotes(g, m, 2, 'low'));
/* guillemets: chevrons pointing along the line, at the middle of the x-height */
function chevrons(g: Builder, m: Metrics, n: 1 | 2, right: boolean) {
  const h = m.xh * 0.52, w = h * 0.6, cy = m.xh * 0.5, x0 = m.s * 0.6, step = w * 0.55 + m.s * 1.1, W = x0 + w + (n - 1) * step + m.s * 0.45;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * step, f = (px: number, py: number): XY => [right ? W - px : px, py];
    g.path(mapCmds([['M', x + w, cy + h / 2], ['L', x, cy], ['L', x + w, cy - h / 2, { w: 'thin' }]], f), { s: H, e: H, part: 'diagonal', miter: 18 });
  }
  return W;
}
def('‹', [0.3, 0.6], (g, m) => chevrons(g, m, 1, false));
def('›', [0.6, 0.3], (g, m) => chevrons(g, m, 1, true));
def('«', [0.3, 0.6], (g, m) => chevrons(g, m, 2, false));
def('»', [0.6, 0.3], (g, m) => chevrons(g, m, 2, true));
/* square brackets and braces run as tall as the parentheses */
function squareBracket(g: Builder, m: Metrics, flip: boolean) {
  const W = m.W(230), hs = m.s / 2, hh = m.hT / 2, yT = m.asc - hh, yB = m.desc * 0.7 + hh;
  const f = (x: number, y: number): XY => [flip ? W - x : x, y];
  g.path(mapCmds([['M', W, yT], ['L', hs, yT], ['L', hs, yB], ['L', W, yB]], f), { s: T, e: T, part: 'stem' });
  return W;
}
def('[', [0.9, 0.3], (g, m) => squareBracket(g, m, false));
def(']', [0.3, 0.9], (g, m) => squareBracket(g, m, true));
function brace(g: Builder, m: Metrics, flip: boolean) {
  const W = m.W(280), hs = m.s / 2, hh = m.hT / 2, yT = m.asc - hh, yB = m.desc * 0.7 + hh, ym = (yT + yB) / 2;
  const xm = Math.max(W * 0.5, hs * 2.2), xr = W - hs * 0.4, r = Math.min(xr - xm, (yT - yB) * 0.12) || 1, rt = Math.min(xm, (yT - yB) * 0.1);
  const f = (x: number, y: number): XY => [flip ? W - x : x, y];
  // two halves, each running from its end round into the stem and out to the point in the middle
  g.path(mapCmds([['M', xr, yT], ['hv', xm, yT - r], ['L', xm, ym + rt], ['vh', 0, ym]], f), { s: T, e: 'flat', part: 'stem' });
  g.path(mapCmds([['M', 0, ym], ['hv', xm, ym - rt], ['L', xm, yB + r], ['vh', xr, yB]], f), { s: 'flat', e: T, part: 'stem' });
  return W;
}
def('{', [0.5, 0.3], (g, m) => brace(g, m, false));
def('}', [0.3, 0.5], (g, m) => brace(g, m, true));
/* the dashes: an en dash about as wide as an n, an em dash a little wider than an M */
def('–', [0.5, 0.5], (g, m) => { const W = m.W(470); g.line(0, m.xh * 0.52, W, m.xh * 0.52, { s: T, e: T, part: 'bar' }); return W; });
def('—', [0.4, 0.4], (g, m) => { const W = m.W(900); g.line(0, m.xh * 0.52, W, m.xh * 0.52, { s: T, e: T, part: 'bar' }); return W; });
// underscores meet end to end, so a run of them reads as one line
def('_', [0, 0], (g, m) => { const W = m.W(500), y = m.desc * 0.4; g.line(0, y, W, y, { s: 'flat', e: 'flat', part: 'bar' }); return W; });
def('\\', [0.2, 0.2], (g, m) => {
  const W = m.W(330), l = m.s * 0.5;
  g.line(l, m.asc, W - l, m.desc * 0.5, { s: H, e: H, w: 'thin', part: 'diagonal' }); return W;
});
def('|', [1, 1], (g, m) => { g.stem(m.s / 2, m.desc * 0.7, m.asc); return m.s; });
def('·', [0.8, 0.8], (g, m) => { const d = ds(m); g.dot(d / 2, m.xh * 0.52, d); return d; });
def('•', [0.7, 0.7], (g, m) => { const d = ds(m) * 1.6; g.dot(d / 2, m.xh * 0.52, d); return d; });

/* ---------- symbols ---------- */

def('`', [0.6, 0.6], (g, m) => {
  const W = m.W(170), hs = m.s / 2;
  g.line(hs * 0.6, m.asc, W - hs * 0.6, m.asc - m.cap * 0.2, { we: 0.6, part: 'stem' }); return W;
});
def('¢', [0.55, 0.35], (g, m) => {
  const { hs, yt, yb } = lc(m), W = m.W(430, 'r'), { u, w } = lcAperture(m), cx = W / 2;
  openBowl(g, hs, W - hs, yb, yt, u, 1 - u);
  g.line(cx, -m.xh * 0.2, cx, m.xh * 1.2, { scale: 0.6, w: 'thin', part: 'stem' });
  return W * w;
});
def('€', [0.3, 0.4], (g, m) => {
  const C = m.cap, Wc = m.W(600, 'r'), x0 = Wc * 0.14, hs = m.s / 2, hh = m.hT / 2, { u, w } = capAperture(m);
  openBowl(g, x0 + hs, x0 + Wc - hs, -m.os + hh, C + m.os - hh, u, 1 - u);
  for (const y of [C * 0.39, C * 0.6]) g.line(0, y, x0 + Wc * 0.58, y, { s: T, e: T, scale: 0.8, part: 'bar' });
  return x0 + Wc * w;
});
def('£', [0.5, 0.4], (g, m) => {
  const W = m.W(520), C = m.cap, hs = m.s / 2, hh = m.hT / 2, yt = C + m.os - hh, xs = W * 0.32, xe = W - hs;
  g.path([['M', xe, C * 0.78], ['vh', (xs + xe) / 2, yt, { u0: lerp(0.2, 0.5, m.ap) }], ['hv', xs, C * 0.66], ['L', xs, hh]], { s: T, e: J, part: 'stem' });
  g.line(0, hh, W, hh, { s: T, e: T, part: 'bar' });
  g.line(W * 0.06, C * 0.46, W * 0.62, C * 0.46, { s: T, e: T, part: 'bar' });
  return W;
});
def('¥', [0.2, 0.2], (g, m) => {
  const W = m.W(570), C = m.cap, l = m.s * 0.55, ym = C * 0.46;
  g.stem(W / 2, 0, ym + m.s * 0.2);
  g.line(l, C, W / 2, ym, { s: H, e: J, part: 'diagonal', clip: { y0: ym - m.s * 0.3 } });
  g.line(W - l, C, W / 2, ym, { s: H, e: J, w: 'thin', part: 'diagonal', clip: { y0: ym - m.s * 0.3 } });
  for (const y of [C * 0.34, C * 0.16]) g.line(W * 0.14, y, W * 0.86, y, { s: T, e: T, scale: 0.8, part: 'bar' });
  return W;
});
/* the arithmetic signs, centred on the bar of the + (mathY) */
def('−', [0.6, 0.6], (g, m) => { const W = m.W(480), cy = mathY(m); g.line(0, cy, W, cy, { s: T, e: T, part: 'bar' }); return W; });
def('×', [0.4, 0.4], (g, m) => {
  const W = m.W(420), cy = mathY(m), r = W / 2;
  g.line(0, cy - r, W, cy + r, { s: T, e: T, part: 'diagonal' }); g.line(0, cy + r, W, cy - r, { s: T, e: T, w: 'thin', part: 'diagonal' }); return W;
});
def('÷', [0.6, 0.6], (g, m) => {
  const W = m.W(480), cy = mathY(m), d = ds(m), off = Math.max(W * 0.32, m.hT / 2 + d * 0.9);
  g.line(0, cy, W, cy, { s: T, e: T, part: 'bar' }); g.dot(W / 2, cy + off, d); g.dot(W / 2, cy - off, d); return W;
});
def('=', [0.6, 0.6], (g, m) => {
  const W = m.W(480), cy = mathY(m), off = Math.max(W * 0.17, m.hT * 0.95);
  g.line(0, cy + off, W, cy + off, { s: T, e: T, part: 'bar' }); g.line(0, cy - off, W, cy - off, { s: T, e: T, part: 'bar' }); return W;
});
function angle(g: Builder, m: Metrics, right: boolean) {
  const W = m.W(440), cy = mathY(m), r = W * 0.46, x0 = m.s * 0.6;
  const f = (x: number, y: number): XY => [right ? W - x : x, y];
  g.path(mapCmds([['M', W, cy + r], ['L', x0, cy], ['L', W, cy - r, { w: 'thin' }]], f), { s: T, e: T, part: 'diagonal', miter: 18 });
  return W;
}
def('<', [0.3, 0.6], (g, m) => angle(g, m, false));
def('>', [0.6, 0.3], (g, m) => angle(g, m, true));
def('±', [0.6, 0.6], (g, m) => {
  const W = m.W(480), cy = mathY(m), r = W / 2, py = cy + r * 0.3, pr = r * 0.85;
  g.line(0, py, W, py, { s: T, e: T, part: 'bar' }); g.line(W / 2, py - pr, W / 2, py + pr, { s: T, e: T, w: 'thin', part: 'bar' });
  const by = Math.min(py - pr - m.hT * 1.2, cy - r * 0.75);
  g.line(0, by, W, by, { s: T, e: T, part: 'bar' });
  return W;
});
def('~', [0.6, 0.6], (g, m) => {
  const W = m.W(480), cy = mathY(m) + m.cap * 0.04, a = W * 0.1, hs = m.s / 2;
  g.path([['M', hs * 0.5, cy - a], ['C', W * 0.3, cy + a * 2.6, W * 0.7, cy - a * 2.6, W - hs * 0.5, cy + a]], { s: T, e: T, part: 'bowl' });
  return W;
});
def('^', [0.3, 0.3], (g, m) => {
  const W = m.W(420), l = m.s * 0.55;
  zig(g, m, [l, W / 2, W - l], m.cap, m.cap * 0.52, false, { serifS: undefined, serifE: undefined });
  return W;
});
def('*', [0.5, 0.5], (g, m) => {
  const W = m.W(400), r = W / 2, cy = m.cap - r * 0.95;
  for (const a of [90, 30, 150]) {
    const dx = r * Math.cos(a * Math.PI / 180), dy = r * Math.sin(a * Math.PI / 180);
    g.line(W / 2 - dx, cy - dy, W / 2 + dx, cy + dy, { s: T, e: T, scale: 0.8, part: 'bar', w: a === 90 ? undefined : 'thin' });
  }
  return W;
});
def('°', [0.6, 0.6], (g, m) => {
  const sc = 0.7, D = Math.max(m.cap * 0.3, m.s * sc * 2.6), hs = m.s * sc / 2, hh = m.hT * sc / 2;
  oval(g, hs, D - hs, m.cap - D + hh, m.cap + m.os - hh, { scale: sc });
  return D;
});
/* © and ®: a letter in a ring, drawn with a lighter pen */
function ringed(g: Builder, m: Metrics, inner: (cx: number, cy: number, r: number, sc: number) => void) {
  const sc = 0.62, C = m.cap, W = m.W(C * 1.02 + 60, 'r'), hs = m.s * sc / 2, hh = m.hT * sc / 2;
  oval(g, hs, W - hs, -m.os + hh, C + m.os - hh, { scale: sc });
  inner(W / 2, C / 2, Math.min(W, C) / 2 - Math.max(hs, hh) * 2, sc);
  return W;
}
def('©', [0.55, 0.55], (g, m) => ringed(g, m, (cx, cy, r, sc) => {
  const rx = r * 0.5, ry = r * 0.55, { u } = capAperture(m);
  openBowl(g, cx - rx, cx + rx, cy - ry, cy + ry, u, 1 - u, { scale: sc });
}));
def('®', [0.55, 0.55], (g, m) => ringed(g, m, (cx, cy, r, sc) => {
  const x0 = cx - r * 0.38, xr = cx + r * 0.38, yt = cy + r * 0.55, yb = cy - r * 0.55, ym = cy + r * 0.02, ry = (yt - ym) / 2, xa = xr - ry;
  g.line(x0, yb, x0, yt, { s: 'flat', e: J, scale: sc, part: 'stem' });
  g.path([['M', x0, yt], ['L', xa, yt], ['hv', xr, ym + ry], ['vh', xa, ym], ['L', x0, ym]], { s: J, e: J, scale: sc, part: 'bowl' });
  g.line(lerp(x0, xr, 0.45), ym, xr, yb, { s: J, e: H, scale: sc, part: 'leg' });
}));
def('™', [0.4, 0.4], (g, m) => {
  const sc = 0.55, C = m.cap, h = C * 0.4, yb = C - h, hs = m.s * sc / 2, hh = m.hT * sc / 2, tw = h * 0.85, gap = m.s * sc * 1.4 + h * 0.1, x = tw + gap, mw = h * 1.05;
  g.line(0, C - hh, tw, C - hh, { s: T, e: T, scale: sc, part: 'arm' });
  g.line(tw / 2, yb, tw / 2, C - hh, { e: J, scale: sc, part: 'stem' });
  // the M's stems on their own, and a V between their tops, so no corner spikes up past the T
  for (const sx of [x + hs, x + mw - hs]) g.line(sx, yb, sx, C, { scale: sc, part: 'stem' });
  g.path([['M', x + hs, C], ['L', x + mw / 2, yb + h * 0.3], ['L', x + mw - hs, C]], { s: H, e: H, scale: sc, part: 'diagonal' });
  return x + mw;
});
/* § is a ring with a hook over it and one under it, each running round into the ring like the halves of an s */
def('§', [0.5, 0.5], (g, m) => {
  const sc = 0.85, W = m.W(420, 'c'), hs = m.s * sc / 2, hh = m.hT * sc / 2, xl = hs, xr = W - hs, cx = W / 2;
  const top = m.cap + m.os - hh, bot = m.desc * 0.3 + hh, cy = (top + bot) / 2, ry = (top - bot) * 0.2, r = (top - bot) * 0.15;
  const u0 = lerp(0.2, 0.55, m.ap), f = (x: number, y: number): XY => [W - x, 2 * cy - y];
  const hook: Cmd[] = [['M', xr, top - r], ['vh', cx, top, { u0 }], ['hv', xl, top - r], ['vh', cx, cy + ry]];
  oval(g, xl, xr, cy - ry, cy + ry, { scale: sc });
  g.path(hook, { s: T, e: J, scale: sc, part: 'spine' });
  g.path(mapCmds(hook, f), { s: T, e: J, scale: sc, part: 'spine' });
  return W;
});
def('¶', [0.4, 1], (g, m) => {
  // the stems stand far enough apart that heavy weights leave a slot between them
  const C = m.cap, hs = m.s / 2, hh = m.hT / 2, sep = Math.max(m.W(460) * 0.4, m.s * 1.8), W = Math.max(m.W(460), sep / 0.42);
  const x2 = W - hs, x1 = x2 - sep, yb = m.desc * 0.6, ym = C * 0.42;
  g.stem(x1, yb, C - hh, { e: J }); g.stem(x2, yb, C - hh, { e: J });
  g.line(x1, C - hh, W, C - hh, { s: J, e: 'flat', part: 'bar' });
  // the bowl is solid: a half round out to the left of the first stem
  const ry = (C - ym) / 2, rx = x1 - hs * 0.2, cy = ym + ry, pts: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI / 2 + (i / 24) * Math.PI;
    pts.push({ x: x1 + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, smooth: i > 0 && i < 24 });
  }
  g.blob(pts, 'bowl');
  return W;
});
def('†', [0.5, 0.5], (g, m) => {
  const W = m.W(400), y = m.cap * 0.68;
  g.stem(W / 2, m.desc * 0.6, m.asc); g.line(0, y, W, y, { s: T, e: T, part: 'bar' }); return W;
});
def('‡', [0.5, 0.5], (g, m) => {
  const W = m.W(400);
  g.stem(W / 2, m.desc * 0.6, m.asc);
  for (const y of [m.cap * 0.74, m.cap * 0.14]) g.line(0, y, W, y, { s: T, e: T, part: 'bar' });
  return W;
});
