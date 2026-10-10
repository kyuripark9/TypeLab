/* The capitals, A to Z (see index.ts for how a glyph is drawn and registered). */
import { defGlyph as def, type Builder, type Metrics } from '../font';
import { lerp } from '../geom';
import type { Cmd } from '../types';
import { H, J, T, archUp, arched, bowlRx, capAperture, capBowl, cup, cupY, footIn, hookU, iBars, kArms, openBowl, oval, sShape, tailEnd, tailK, upright, uprightV, uprightW, zed, zig } from './shared';
import { bendTurn, placeTurns, roundBends, turnStroke } from './turns';

def('A', [0.25, 0.25], (g, m) => {
  if (arched(m)) {
    // an arch with a bar across, like an H whose stems bend together at the top
    const W = m.W(590), C = m.cap, hs = m.s / 2, by = C * (0.34 + 0.26 * m.bar);
    archUp(g, m, W, C);
    g.line(hs, by, W - hs, by, { s: J, e: J, part: 'crossbar' });
    return W;
  }
  if (upright(m)) {
    // a diagonal leaning on a stem at the right, meeting it in the apex: no crossbar
    const W = m.W(600), C = m.cap, xr = W - m.s / 2, l = footIn(m, xr, C);
    turnStroke(g, m, [[l, 0], [xr, C], [xr, 0]], [{ i: 1, ax: 1, at: C, dir: 1 }], { s: H, e: H, part: 'diagonal', serifS: 'both', serifE: 'both' });
    return W;
  }
  const W = m.W(620), C = m.cap, l = m.s * 0.55, r = W - l, cx = W / 2;
  const ys = zig(g, m, [l, cx, r], C, 0, false, { part: 'stem' });
  const by = C * (0.12 + 0.36 * m.bar), f = by / ys[1];
  const xl = lerp(l, cx, f), xr = lerp(r, cx, f);
  g.line(xl, by, xr, by, { s: J, e: J, part: 'crossbar' });
  g.counter([[cx, ys[1]], [xl, by], [xr, by]]);
  return W;
}, { parts: ['apex', 'stem', 'crossbar', 'counter'], params: ['diagonals', 'bends', 'apex', 'crossbar', 'weight'] });

def('B', [1, 0.55], (g, m) => {
  const W = m.W(540, 'c'), C = m.cap, hs = m.s / 2, hh = m.hT / 2, mid = C * (0.45 + 0.14 * m.bar);
  g.stem(hs, 0, C, { serifS: 'a', serifE: 'a' });
  capBowl(g, m, hs, C - hh, mid, W * 0.93 - hs);
  capBowl(g, m, hs, mid, hh, W - hs);
  return W;
}, { params: ['counter', 'crossbar', 'curve', 'weight'] });

def('C', [0.55, 0.4], (g, m) => {
  const W = m.W(640, 'r'), C = m.cap, hs = m.s / 2, hh = m.hT / 2, { u, w } = capAperture(m);
  openBowl(g, hs, W - hs, -m.os + hh, C + m.os - hh, u, 1 - u);
  return W * w;
}, { params: ['bowlForm', 'aperture', 'terminal', 'curve', 'contrast'] });

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
  const W = m.W(670, 'r'), C = m.cap, hs = m.s / 2, hh = m.hT / 2, u = capAperture(m).u;
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

def('I', [1, 1], (g, m) => {
  if (iBars(m)) {
    const W = m.W(340), hh = m.hT / 2;
    g.stem(W / 2, 0, m.cap); g.line(0, m.cap - hh, W, m.cap - hh, { part: 'bar' }); g.line(0, hh, W, hh, { part: 'bar' });
    return W;
  }
  g.stem(m.s / 2, 0, m.cap, { serifS: 'both', serifE: 'both' }); return m.s;
});

def('J', [0.4, 1], (g, m) => {
  // barred, a bar runs in across the top and the J is as wide as a U
  const bar = iBars(m), W = m.W(bar ? 540 : 390), C = m.cap, hs = m.s / 2, hh = m.hT / 2, xr = W - hs, xl = hs, yb = -m.os + hh;
  const ry = yb + Math.min((xr - xl) * 0.55, C * 0.4), cx = (xl + xr) / 2;
  const head: Cmd[] = bar ? [['M', 0, C - hh], ['L', xr, C - hh]] : [['M', xr, C]];
  g.path([...head, ['L', xr, ry], ['vh', cx, yb], ['hv', xl, ry, { u1: hookU(m, 0.6) }]], { e: T, part: 'stem', serifS: bar ? null : 'a' });
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
  if (arched(m)) { archUp(g, m, W, C); g.stem(W / 2, 0, C, { s: 'flat', e: J, serifS: 'both' }); return W; }
  if (roundBends(m)) {
    // one stroke, bent round at the top of each stem and at the foot of the V
    turnStroke(g, m, [[hs, 0], [hs, C], [W / 2, 0], [W - hs, C], [W - hs, 0]],
      [{ i: 1, ax: 1, at: C, dir: 1 }, { i: 2, ax: 1, at: 0, dir: -1 }, { i: 3, ax: 1, at: C, dir: 1 }], { s: H, e: H, part: 'stem', serifS: 'both', serifE: 'both' });
    return W;
  }
  g.stem(hs, 0, C, { serifS: 'both', serifE: 'a', w: lerp(1, 0.35, m.p.contrast) });
  g.stem(W - hs, 0, C, { serifS: 'both', serifE: 'b' });
  zig(g, m, [hs, W / 2, W - hs], C, 0, true, { serifS: null, serifE: null, clipX: { x0: 0, x1: W } });
  return W;
}, { params: ['bends', 'apex', 'weight', 'contrast'] });

def('N', [1, 1], (g, m) => {
  const W = m.W(600), C = m.cap, hs = m.s / 2;
  if (arched(m)) { archUp(g, m, W, C); return W; }
  if (roundBends(m)) {
    turnStroke(g, m, [[hs, 0], [hs, C], [W - hs, 0], [W - hs, C]],
      [{ i: 1, ax: 1, at: C, dir: 1 }, { i: 2, ax: 1, at: 0, dir: -1 }], { s: H, e: H, part: 'stem', serifS: 'both', serifE: 'both' });
    return W;
  }
  const thin = lerp(1, 0.3, m.p.contrast);
  g.stem(hs, 0, C, { serifS: 'both', serifE: 'a', w: thin });
  g.stem(W - hs, 0, C, { serifS: 'b', serifE: 'both', w: thin });
  g.line(hs, C, W - hs, 0, { s: H, e: H, part: 'diagonal', w: 'thick', clip: { x0: 0, x1: W } });
  return W;
});

def('O', [0.55, 0.55], (g, m) => {
  const W = m.W(690, 'r'), hs = m.s / 2, hh = m.hT / 2;
  oval(g, hs, W - hs, -m.os + hh, m.cap + m.os - hh);
  return W;
}, { parts: ['bowl', 'counter'], params: ['bowlForm', 'counter', 'curve', 'contrast', 'width'] });

def('P', [1, 0.5], (g, m) => {
  const W = m.W(510, 'c'), C = m.cap, hs = m.s / 2, hh = m.hT / 2;
  g.stem(hs, 0, C, { serifS: 'both', serifE: 'a' });
  capBowl(g, m, hs, C - hh, C * (0.36 + 0.16 * m.bar), W - hs);
  return W;
});

def('Q', [0.55, 0.55], (g, m) => {
  const W = m.W(690, 'r'), C = m.cap, hs = m.s / 2, hh = m.hT / 2;
  if (m.p.qForm === 'inside') {
    // the bowl runs round from the middle of its foot and down the right side, which turns in its
    // bottom right corner and runs back up into the bowl as the tail
    const xl = hs, xr = W - hs, yb = -m.os + hh, yt = C + m.os - hh, cx = W / 2, cy = C / 2, k = tailK(m);
    // a sharp corner comes to a point just under the baseline, like the bowl beside it
    const bend = roundBends(m) ? bendTurn(m) : null, corner = placeTurns(m, [[xr, cy], [xr, 0], [cx, C * 0.3]], [{ i: 1, ax: 1, at: 0, dir: -1 }], [bend], m.os);
    const dx = cx - corner[1][0], dy = C * 0.3 - corner[1][1], ex = corner[1][0] + dx * k, ey = corner[1][1] + dy * k;
    const turn: Cmd[] = [['L', ...corner[1]], ['L', ex, ey, bend ? { turn: bend } : {}]];
    g.path([['M', lerp(cx, xr, 0.06), yb], ['L', cx, yb], ['hv', xl, cy], ['vh', cx, yt], ['hv', xr, cy], ...turn], { s: T, e: T, part: 'bowl', miter: 18 });
    g.counter([[xl, cy], [cx, yt], [xr, cy], [xr, C * 0.25], [cx, yb]]);
    tailEnd(g, ex, ey, W);
    return W;
  }
  if (m.p.qForm === 'sweep') {
    // the tail of book type: out of the bottom of the bowl, a little left of its middle, down under the baseline
    // and on out to the right in a long shallow S, thickest where it runs down
    oval(g, hs, W - hs, -m.os + hh, C + m.os - hh);
    const k = tailK(m), x0 = W * 0.4, y0 = hh, ex = W * (0.6 + 0.5 * k), ey = -C * (0.06 + 0.05 * k);
    g.path([['M', x0, y0], ['C', x0 - W * 0.05, -C * 0.15, lerp(x0, ex, 0.45), -C * 0.25, ex, ey, { w: 'thick' }]], { s: J, e: T, ws: 0.35, we: 0.25, part: 'tail' });
    tailEnd(g, ex, ey, W);
    return W;
  }
  oval(g, hs, W - hs, -m.os + hh, C + m.os - hh);
  const k = tailK(m), x0 = W * 0.56, y0 = C * 0.2, ex = x0 + W * 0.41 * k, ey = y0 - C * 0.27 * k;
  g.line(x0, y0, ex, ey, { s: J, e: T, part: 'tail' });
  tailEnd(g, ex, ey, W);
  return W;
}, { params: ['qForm', 'tail', 'counter', 'curve', 'weight'] });

def('R', [1, 0.2], (g, m) => {
  const W = m.W(550, 'c'), C = m.cap, hs = m.s / 2, hh = m.hT / 2, mid = C * (0.4 + 0.14 * m.bar), R1 = W * 0.94 - hs;
  g.stem(hs, 0, C, { serifS: 'both', serifE: 'a' });
  if (m.p.rForm === 'loop') {
    // the bowl comes back along its lower bar, stops a stroke clear of the stem and turns back
    // round into the leg, which runs out low to the baseline
    const ry = (C - hh - mid) / 2, rx = bowlRx(m, hs, R1, ry), xa = R1 - rx, cy = mid + ry;
    // one stroke, so the bar runs on into the turn without a seam; sharp, the turn comes to a point at the edge
    const edge = hs + m.s * 1.5, xe = W - footIn(m, W - edge, mid), bend = roundBends(m) ? bendTurn(m) : null;
    const [, turn] = placeTurns(m, [[R1, mid], [edge + m.s, mid], [xe, 0]], [{ i: 1, ax: 0, at: edge, dir: -1 }], [bend], 0);
    g.path([['M', hs, C - hh], ['L', xa, C - hh], ['hv', R1, cy], ['vh', xa, mid], ['L', turn[0], turn[1]], ['L', xe, 0, bend ? { turn: bend } : {}]],
      { s: J, e: H, part: 'bowl', miter: 18, serifE: 'both' });
    g.counter([[hs, C - hh], [xa, C - hh], [R1, cy], [xa, mid], [hs, mid]]);
    return W;
  }
  capBowl(g, m, hs, C - hh, mid, R1);
  g.line(lerp(hs, R1, 0.42), mid + hh * 0.5, W - m.s * 0.5, 0, { s: J, e: H, part: 'leg', clip: { y1: mid + hh * 0.9 }, serifE: 'both' });
  return W;
}, { params: ['rForm', 'counter', 'crossbar', 'curve', 'weight'] });

def('S', [0.5, 0.5], (g, m) => { const W = m.W(520, 'c'); sShape(g, m, W, -m.os, m.cap + m.os); return W; },
  { parts: ['spine', 'terminal'], params: ['bowlForm', 'curve', 'terminal', 'aperture', 'weight'] });

def('T', [0.3, 0.3], (g, m) => {
  const W = m.W(530), hh = m.hT / 2;
  // the stem joins the bar, so a stencil opens a gap under it and thin joints thin it there
  g.stem(W / 2, 0, m.cap - hh, { serifS: 'both', e: J });
  g.line(0, m.cap - hh, W, m.cap - hh, { s: T, e: T, part: 'arm', serifS: 'a', serifE: 'a', serifScale: 0.75 });
  return W;
});

def('U', [1, 1], (g, m) => { const W = m.W(570); cup(g, m, W, m.cap); return W; });

def('V', [0.2, 0.2], (g, m) => {
  const W = m.W(590), l = m.s * 0.55;
  if (arched(m)) cup(g, m, W, m.cap);
  else if (upright(m)) uprightV(g, m, W, m.cap); else zig(g, m, [l, W / 2, W - l], m.cap, 0, true);
  return W;
}, { params: ['diagonals', 'bends', 'apex', 'weight', 'contrast'] });

def('W', [0.2, 0.2], (g, m) => {
  if (arched(m)) { const W = m.W(740); cup(g, m, W, m.cap); g.stem(W / 2, 0, m.cap, { s: J, serifE: 'both' }); return W; }
  if (upright(m)) { const W = m.W(680); uprightW(g, m, W, m.cap); return W; }
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
  if (m.p.yForm === 'cup') {
    const W = m.W(560), C = m.cap;
    cupY(g, m, W, C, C * (0.3 + 0.3 * m.bar), [footIn(m, W * 0.6, C * 0.45) + W * 0.3, 0], { e: H, serifE: 'both' });
    return W;
  }
  const W = m.W(570), C = m.cap, l = m.s * 0.55, ym = C * 0.42;
  g.stem(W / 2, 0, ym + m.s * 0.2, { serifS: 'both' });
  g.line(l, C, W / 2, ym, { s: H, e: J, part: 'diagonal', serifS: 'both', clip: { y0: ym - m.s * 0.3 } });
  g.line(W - l, C, W / 2, ym, { s: H, e: J, w: 'thin', part: 'diagonal', serifS: 'both', clip: { y0: ym - m.s * 0.3 } });
  return W;
}, { params: ['yForm', 'bends', 'crossbar', 'weight', 'width'] });

def('Z', [0.4, 0.4], (g, m) => { const W = m.W(530); zed(g, m, W, m.cap); return W; });
