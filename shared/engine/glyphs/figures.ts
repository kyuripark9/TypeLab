/* The figures, 0 to 9. */
import { defGlyph as def, type Builder, type Metrics } from '../font';
import { lerp } from '../geom';
import { H, J, T, mapCmds, oval } from './shared';

def('0', [0.55, 0.55], (g, m) => { const W = m.W(540, 'r'), hs = m.s / 2, hh = m.hT / 2; oval(g, hs, W - hs, -m.os + hh, m.cap + m.os - hh); return W; });
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
  if (m.p.bowlForm === 'box') {
    // boxed, the stem drops plumb from the arm and turns square into the top of the bowl
    g.line(0, C - hh, W * 0.9, C - hh, { e: T, part: 'arm' });
    g.path([['M', xl, C], ['L', xl, bt], ['L', W / 2, bt], ['hv', xr, (bt + yb) / 2], ['vh', W * 0.48, yb], ['hv', xl, C * 0.26, { u1: lerp(0.78, 0.5, m.ap) }]],
      { s: J, e: T, part: 'bowl' });
    return W;
  }
  const xv = hs + W * 0.1, st = m.qpt(xl, C * 0.44, W / 2, bt, 'vh', 0.4);
  g.line(xv - hs, C - hh, W * 0.9, C - hh, { e: T, part: 'arm' });
  g.line(xv, C, st.x + m.s * 0.1, st.y - hh, { e: J, w: 'thin', part: 'stem' });
  g.path([['M', xl, C * 0.44], ['vh', W / 2, bt, { u0: 0.4 }], ['hv', xr, (bt + yb) / 2], ['vh', W * 0.48, yb], ['hv', xl, C * 0.26, { u1: lerp(0.78, 0.5, m.ap) }]],
    { s: J, e: T, ws: 0.7, part: 'bowl' });
  return W;
});
/* 6 (and 9, the same turned half round) */
function six(g: Builder, m: Metrics, flip: boolean) {
  const W = m.W(535, 'r'), C = m.cap, hs = m.s / 2, hh = m.hT / 2, xl = hs, xr = W - hs, cx = W / 2;
  const yt = C + m.os - hh, yb = -m.os + hh, bTop = C * 0.62 - hh, cyb = (bTop + yb) / 2;
  const f = flip ? (x: number, y: number): [number, number] => [W - x, C - y] : (x: number, y: number): [number, number] => [x, y];
  g.path(mapCmds([['M', xr - W * 0.02, C * 0.7], ['vh', cx + W * 0.03, yt, { u0: lerp(0.35, 0.65, m.ap) }], ['hv', xl, C * 0.5], ['L', xl, cyb],
    ['vh', cx, yb], ['hv', xr, cyb], ['vh', cx, bTop], ['hv', m.p.bowlForm === 'box' ? xl : xl + m.s * 0.2, cyb]], f), { s: T, e: J, we: m.p.bowlForm === 'box' ? 1 : 0.75, part: 'bowl' });
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
  oval(g, hs + W * 0.045, W - hs - W * 0.045, mid, C + m.os - hh);
  oval(g, hs, W - hs, -m.os + hh, mid);
  return W;
});
def('9', [0.55, 0.55], (g, m) => six(g, m, true));
