/* The lowercase, a to z, and the forms buildFont picks by name: a.alt (the single-storey a), f.cur and
   y.cur (the cursive f and y). */
import { defGlyph as def, type Builder, type Metrics } from '../font';
import { lerp } from '../geom';
import type { Cmd, Pt, StrokeOpts } from '../types';
import { H, J, T, arch, arched, bowlGap, branchBowl, cup, cupY, dotK, entry, exitEnd, exitMark, fillet, footStem, hookK, hookR, hookU, iBars, kArms, lc, lcAperture, openBowl, oval, sShape, squareR, tailEnd, tailK, upright, uprightV, uprightW, zed, zig } from './shared';
import type { XY } from './turns';

/** How far the spur of an a (see A_FORMS) reaches out past its stem; 0 when it has none: with
    serifs the stem's foot serif stands in for it, and a cursive a has an exit stroke instead. */
const spurOf = (m: Metrics) => (m.p.aForm === 'spur' && !m.serif && !hookR(m) ? m.s * 0.55 : 0);
/** The spur of an a whose stem stands at x: a short bar out to the right along the baseline. */
function spur(g: Builder, m: Metrics, x: number) {
  const d = spurOf(m);
  if (d) g.line(x, m.hT / 2, x + m.s / 2 + d, m.hT / 2, { s: J, part: 'spur' });
  return d;
}

def('a', [0.6, 0.9], (g, m) => {
  const { X, hs, yt, yb } = lc(m), W = m.W(450, 'r'), xr = W - hs, xl = hs, ra = X * 0.34;
  const cxa = (xl + xr) / 2 + W * 0.02;
  const r = hookR(m);
  g.path([['M', xr, 0], ['L', xr, X - ra], ['vh', cxa, yt], ['hv', xl + W * 0.05, X - ra, { u1: lerp(0.85, 0.5, m.ap) }]],
    { e: T, part: 'stem', serifS: r ? null : 'b' });
  if (r) footStem(g, m, xr, X * 0.5);
  // the bowl's top is the a's waist, and Crossbar moves it like the bar of an e
  const bt = X * (0.57 + (m.bar - 0.5) * 0.3), cxb = (xl + xr) / 2 + W * 0.04, bcy = (bt + yb) / 2;
  // square-joined, the bowl is a D whose flat top and bottom run straight into the stem
  if (m.p.bowlJoin === 'square') branchBowl(g, m, xr, xl, bt + m.os, yb);
  else g.path([['M', xr, bt], ['L', cxb, bt], ['hv', xl, bcy], ['vh', cxb, yb], ['hv', xr, bcy + X * 0.04]], { s: J, e: J, we: 0.7, part: 'bowl', counter: true });
  return W + spur(g, m, xr);
}, { params: ['story', 'bowlJoin', 'crossbar', 'aperture', 'counter', 'terminal', 'xHeight'] });

def('a.alt', [0.55, 1], (g, m) => {
  const { X, hs, yt, yb } = lc(m), W = m.W(480, 'r') + bowlGap(m);
  footStem(g, m, W - hs, X, { serifS: 'b' });
  branchBowl(g, m, W - hs, hs, yt, yb);
  return W + spur(g, m, W - hs);
}, { params: ['story', 'bowlJoin', 'overlap', 'counter', 'curve', 'xHeight'] });

def('b', [1, 0.55], (g, m) => {
  const { hs, yt, yb } = lc(m), W = m.W(480, 'r') + bowlGap(m);
  g.stem(hs, 0, m.asc, { serifE: 'a' }); branchBowl(g, m, hs, W - hs, yt, yb); return W;
});
def('c', [0.55, 0.35], (g, m) => {
  const { hs, yt, yb } = lc(m), W = m.W(430, 'r'), { u, w } = lcAperture(m);
  openBowl(g, hs, W - hs, yb, yt, u, 1 - u); return W * w;
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
/** How far Crossbar moves the crossbars of f and t off the x-height: not at all at the middle. */
const fBar = (m: Metrics) => (m.bar - 0.5) * m.xh * 0.5;
def('f', [0.35, 0.1], (g, m) => {
  const { X, hh } = lc(m), W = m.W(310), xs = W * 0.36, r = (W - xs) * 1.05, xh = xs + r * hookK(m);
  // with short ascenders and heavy strokes the hook would sit right on the crossbar and the f read
  // as an r: it keeps nearly two strokes between them, half by rising, half by lowering the bar
  let top = m.asc + m.os - hh, by = X - hh + fBar(m);
  const short = Math.max(0, 1.8 * m.s - (top - by));
  top += short / 2; by -= short / 2;
  // the hook turns at least half way over, however short Tails & hooks has it, and runs on until it reaches out
  // past the stem by a stroke and a half (further under a ball or a droplet, which the stroke is drawn shorter
  // under): stopped over the stem by a closed aperture or a squared turn, a narrow blackletter f would read as
  // a t, and a stub of a hook under a ball as a t with a knob on
  const drop = m.p.terminal === 'round' && (m.p.terminalForm === 'ball' || m.p.terminalForm === 'droplet') ? m.s * 0.8 : 0;
  let u = Math.max(0.5, hookU(m, 0.8));
  while (u < 1 && m.qpt(xs, top - r * 0.9, xh, top, 'vh', u).x < xs + m.s * 1.5 + drop) u = Math.min(1, u + 0.04);
  g.path([['M', xs, 0], ['L', xs, top - r * 0.9], ['vh', xh, top, { u1: u }]], { e: T, part: 'stem', serifS: 'both' });
  const e = m.qpt(xs, top - r * 0.9, xh, top, 'vh', u);
  tailEnd(g, e.x, e.y, W);
  g.line(0, by, W * 0.92, by, { s: T, e: T, part: 'crossbar' });
  // a longer hook takes its extra reach with it, so the next letter doesn't run into it
  return W + r * (hookK(m) - 1);
});
/* descender of g (and the cursive y, y.cur): a hook, or from 35 on the Cursive scale a loop that swings back
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
  // the loop is a narrow teardrop hanging under the bowl: it turns at the foot, rises steeply up
  // its left side and swings back through the stem into the same exit stroke as the other letters
  const e = exitEnd(m, xr, r), lx = lerp(xl, (xr + xl) / 2, 0.25), ly = db * 0.5, ex = e.x, ey = e.y;
  const tail: Cmd[] = [['hv', lx, ly], ['C', lx, lerp(ly, ey, 0.6), ex - r * 1.1, ey - r * 0.95, ex, ey]];
  g.path([...head, ...tail], { e: T, we: 0.8, part: 'stem', serifS: 'b', ...o });
  exitMark(g, m, xr, r);
}
def('f.cur', [0.2, 0.1], (g, m) => {
  const { X, hh } = lc(m), W = m.W(310), xs = W * 0.5, top = m.asc + m.os - hh, r = (W - xs) * 1.05, db = m.desc + hh, rb = r * 0.95;
  const xt = xs + r * hookK(m), xb = xs - rb * hookK(m), u = hookU(m, 0.8);
  g.path([['M', xt, top], ['hv', xs, top - r * 0.9, { u0: 1 - u }], ['L', xs, db + rb * 0.9], ['vh', xb, db, { u1: u }]], { s: T, e: T, part: 'stem' });
  const et = m.qpt(xt, top, xs, top - r * 0.9, 'hv', 1 - u), eb = m.qpt(xs, db + rb * 0.9, xb, db, 'vh', u);
  tailEnd(g, et.x, et.y, W);
  tailEnd(g, eb.x, eb.y, W);
  g.line(W * 0.05, X - hh + fBar(m), W * 0.95, X - hh + fBar(m), { s: T, e: T, part: 'crossbar' });
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
/* the two-storey g of book type: a small round bowl standing on the x-height with an ear out of its top right,
   a link swinging down from its bottom left, and a wide loop hung under the baseline, which the link runs into
   along its top. Returns the width, ear included. */
function doubleG(g: Builder, m: Metrics) {
  // round on both sides, as an o is: only the loop and the ear's tip reach the right
  g.sb = [0.55, 0.35];
  const { X, hs, hh } = lc(m), W = m.W(490, 'r'), xl = hs, xr = W - hs;
  // the loop, under the baseline, keeps an open counter however short the descender: it rises further over
  // the baseline, and the bowl gives way above it
  const lb = m.desc + hh, lt = Math.max(X * 0.04 + hh, lb + 2 * hh + X * 0.2);
  // the bowl: three fifths of the width (wider with heavy strokes), from the x-height down to under a third of
  // it, its counter kept open however heavy the strokes
  const ut = X + m.os - hh, ub = Math.min(Math.max(Math.min(X * 0.3 + hh, ut - 2 * hh - X * 0.38), lt + 2 * hh + X * 0.08), ut - 2 * hh - X * 0.24);
  const ul = xl + W * 0.06, ur = Math.min(xr, Math.max(lerp(ul, xr, 0.6), ul + m.s + X * 0.24));
  const ux = (ul + ur) / 2, uy = (ut + ub) / 2, rx = (ur - ul) / 2, ry = (ut - ub) / 2;
  oval(g, ul, ur, ub, ut, { counter: true });
  // the ear: a short flag up and out of the bowl's shoulder, to the letter's right side
  const ea = Math.PI * 0.2, ex = ux + rx * Math.cos(ea), ey = uy + ry * Math.sin(ea), ear = Math.max(0, W - m.s * 0.2 - ex);
  g.path([['M', ex - m.s * 0.15, ey - m.s * 0.1], ['C', ex + ear * 0.35, ut, ex + ear * 0.6, ut + m.os, ex + ear, ut + m.os]], { s: J, e: T, w: 'thin', part: 'ear' });
  // the loop: as wide as the letter, from just over the baseline to the descender
  oval(g, xl, xr, lb, lt, { counter: true });
  // the link leaves the bowl low on its left and runs down into the loop's top
  const a = Math.PI * 1.32, p0x = ux + rx * Math.cos(a), p0y = uy + ry * Math.sin(a);
  g.path([['M', p0x, p0y], ['C', p0x - W * 0.08, lerp(p0y, lt, 0.55), xl + W * 0.1, lt, xl + W * 0.36, lt]], { s: J, e: J, part: 'link' });
  return W;
}
def('g', [0.55, 1], (g, m) => {
  const { hs, yt, yb } = lc(m), W = m.W(480, 'r') + bowlGap(m), xr = W - hs;
  if (m.p.gForm === 'mirrored') return mirroredG(g, m, W);
  if (m.p.gForm === 'double') return doubleG(g, m);
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
  const { hs } = lc(m), W = m.W(455);
  g.stem(hs, 0, m.asc, { serifS: 'both', serifE: 'a' }); arch(g, m, hs, W - hs, true); return W;
});
/* dot of i/j: keeps a clear gap; in very heavy, tall-x-height designs the stem gives way */
function tittle(m: Metrics) {
  // placed as a dot of the usual size, then grown or shrunk round its centre
  const d0 = m.s * 1.12, d = d0 * dotK(m), gap = Math.max(m.s * 0.3, m.cap * 0.05);
  const cy = Math.min(m.xh + gap + d0 / 2 + (m.asc - m.xh) * 0.12, m.asc + m.cap * 0.07 - d0 / 2);
  return { d, cy, top: Math.min(m.xh, cy - d / 2 - gap) };
}
/* barred i and l (Letters I, J, i and l on Bars, or a monospaced sans on auto): a flag at the top and a bar at the foot */
function barredStem(g: Builder, m: Metrics, top: number) {
  const W = m.W(360), hh = m.hT / 2, x = W * 0.52;
  g.stem(x, 0, top); g.line(W * 0.12, top - hh, x, top - hh, { s: T, part: 'bar' }); g.line(0, hh, W, hh, { part: 'bar' });
  // with square joins the flag turns out of the stem like an arm, round on the inside
  if (m.p.bowlJoin === 'square') fillet(g, m, x - m.s / 2, top - m.hT, -1, -1, m.s * 0.8);
  return { W, x };
}
def('i', [1, 1], (g, m) => {
  if (iBars(m)) { const t = tittle(m), { W, x } = barredStem(g, m, t.top); g.dot(x, t.cy, t.d); return W; }
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
  if (iBars(m)) return barredStem(g, m, m.asc).W;
  footStem(g, m, m.s / 2, m.asc, { serifS: 'both', serifE: 'a' }); return m.s;
});
def('m', [1, 1], (g, m) => {
  const { X, hs } = lc(m), W = m.W(700);
  const en = entry(g, m, hs, X);
  g.stem(hs, 0, X, { serifS: 'both', serifE: en ? null : 'a' });
  arch(g, m, hs, W / 2, false, true); arch(g, m, W / 2, W - hs, true);
  return W;
});
def('n', [1, 1], (g, m) => {
  const { X, hs } = lc(m), W = m.W(455);
  const en = entry(g, m, hs, X);
  g.stem(hs, 0, X, { serifS: 'both', serifE: en ? null : 'a' }); arch(g, m, hs, W - hs, true); return W;
}, { params: ['xHeight', 'curve', 'weight', 'width'] });
def('o', [0.55, 0.55], (g, m) => { const { hs, yt, yb } = lc(m), W = m.W(490, 'r'); oval(g, hs, W - hs, yb, yt); return W; },
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
def('s', [0.5, 0.5], (g, m) => { const W = m.W(395, 'c'); sShape(g, m, W, -m.os, m.xh + m.os); return W; },
  { params: ['curve', 'terminal', 'aperture', 'xHeight'] });
def('t', [0.3, 0.3], (g, m) => {
  const { X, hh } = lc(m), W = m.W(320), xs = W * 0.36, square = m.p.bowlJoin === 'square';
  // with square joins the foot turns in a tighter round, like the other square-joined turns, and runs flat along the baseline
  const yb = square ? hh : lc(m).yb, ry = yb + (W - xs) * (square ? 0.38 : 0.75), hw = (W - xs) * hookK(m), xm = xs + hw * (square ? 0.38 : 0.66);
  const u = hookU(m, 0.5), e = m.qpt(xm, yb, xs + hw, ry, 'hv', u);
  g.path([['M', xs, X + (m.asc - X) * 0.62], ['L', xs, ry], ['vh', xm, yb], ['hv', xs + hw, ry, { u1: u }]], { e: T, part: 'stem' });
  tailEnd(g, e.x, e.y, W);
  g.line(0, X - hh + fBar(m), W * 0.95, X - hh + fBar(m), { s: T, e: T, part: 'crossbar' });
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
def('v', [0.2, 0.2], (g, m) => {
  const W = m.W(450), l = m.s * 0.55;
  if (arched(m)) cup(g, m, W, m.xh);
  else if (upright(m)) uprightV(g, m, W, m.xh); else zig(g, m, [l, W / 2, W - l], m.xh, 0, true);
  return W;
});
def('w', [0.2, 0.2], (g, m) => {
  if (arched(m)) { const W = m.W(620); cup(g, m, W, m.xh); g.stem(W / 2, 0, m.xh, { s: J, serifE: 'both' }); return W; }
  if (upright(m)) { const W = m.W(540); uprightW(g, m, W, m.xh); return W; }
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
  if (m.p.yForm === 'cup') {
    // a u whose right side runs on down through the baseline into a diagonal descender
    const W = m.W(455), X = m.xh, hh = m.hT / 2, xr = W - m.s / 2, yd = m.desc * 0.92 * tailK(m);
    const foot: XY = [xr - (xr - W * 0.2) * yd / (m.desc * 0.92), yd];
    cupY(g, m, W, X, hh, foot, { e: T });
    tailEnd(g, foot[0], foot[1], W);
    return W;
  }
  const W = m.W(450), X = m.xh, l = m.s * 0.55, r = W - l, cx = W / 2 + m.s * 0.1;
  const yd = m.desc * 0.92 * tailK(m), xd = cx + (cx - r) * -yd / X;
  g.line(r, X, xd, yd, { s: H, e: T, w: 'thin', part: 'tail', serifS: 'both' });
  tailEnd(g, xd, yd, W);
  // the arm stops inside the tail, so where it outweighs the tail it never pokes out the far side
  // (a wireframe shows every stroke as drawn)
  const lt = Math.hypot(xd - r, yd - X), tx = (xd - r) / lt, ty = (yd - X) / lt, ht = m.thin / 2, wire = m.p.fill === 'wire';
  g.line(l, X, cx, 0, { s: H, e: J, part: 'diagonal', serifS: 'both', clip: wire ? { y0: -m.s * 0.1 } : { planes: [{ x: r, y: X, nx: -ty, ny: tx }] } });
  // and below its end, its outer edge runs on down into the tail's (a little way into both, so no seam shows)
  const ov = Math.min(2, ht), edge = { x: r + ty * (ht - ov), y: X - tx * (ht - ov), nx: -ty, ny: tx };
  const la = Math.hypot(cx - l, X), ax = (cx - l) / la, ay = -X / la;
  // (thin joints narrow the arm as it arrives, and it arrives running straight again)
  const ha = m.tDir(ax, ay) / 2 * lerp(1, 0.45, m.p.joints);
  const q = { x: cx + ay * ha - ax * ov, y: -ax * ha - ay * ov }, side = (p: Pt) => (p.x - edge.x) * edge.nx + (p.y - edge.y) * edge.ny;
  const meet = (d: Pt) => { const k = -side(q) / (d.x * edge.nx + d.y * edge.ny); return { x: q.x + d.x * k, y: q.y + d.y * k }; };
  if (!wire && side(q) < -ov) g.blob([q, meet({ x: ax, y: ay }), meet({ x: -ay, y: ax })]);
  return W;
});
def('z', [0.4, 0.4], (g, m) => { const W = m.W(410); zed(g, m, W, m.xh); return W; });
