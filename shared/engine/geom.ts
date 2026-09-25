/* Geometry helpers: béziers, polygon clipping, corner rounding, path output. */
import type { ClipBox, Cmd, Mat, Pt, Tangent } from './types';

type P = { x: number; y: number };

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smoothstep = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const lerpP = (p: P, q: P, t: number): Pt => ({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
export const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);

/* Blossom of a cubic: lets us cut out the [u0,u1] portion of a curve exactly. */
function blossom(P: P[], a: number, b: number, c: number) {
  const a0 = lerpP(P[0], P[1], a), a1 = lerpP(P[1], P[2], a), a2 = lerpP(P[2], P[3], a);
  return lerpP(lerpP(a0, a1, b), lerpP(a1, a2, b), c);
}
export function subCubic(P: P[], u0: number, u1: number): P[] {
  if (u0 <= 0 && u1 >= 1) return P;
  return [blossom(P, u0, u0, u0), blossom(P, u0, u0, u1), blossom(P, u0, u1, u1), blossom(P, u1, u1, u1)];
}
export function cubicAt(P: P[], u: number): Tangent {
  const v = 1 - u;
  const x = v * v * v * P[0].x + 3 * v * v * u * P[1].x + 3 * v * u * u * P[2].x + u * u * u * P[3].x;
  const y = v * v * v * P[0].y + 3 * v * v * u * P[1].y + 3 * v * u * u * P[2].y + u * u * u * P[3].y;
  let dx = 3 * v * v * (P[1].x - P[0].x) + 6 * v * u * (P[2].x - P[1].x) + 3 * u * u * (P[3].x - P[2].x);
  let dy = 3 * v * v * (P[1].y - P[0].y) + 6 * v * u * (P[2].y - P[1].y) + 3 * u * u * (P[3].y - P[2].y);
  if (Math.hypot(dx, dy) < 1e-6) { dx = P[3].x - P[0].x; dy = P[3].y - P[0].y; }
  const l = Math.hypot(dx, dy) || 1;
  return { x, y, tx: dx / l, ty: dy / l };
}

/* Quarter of a (super)ellipse as a cubic. mode 'hv' leaves horizontally and arrives
   vertically; 'vh' the opposite. k is the handle length (0.5523 = true circle). */
export function quarter(x0: number, y0: number, x1: number, y1: number, mode: string, k: number): P[] {
  const p0 = { x: x0, y: y0 }, p1 = { x: x1, y: y1 };
  return mode === 'hv'
    ? [p0, { x: x0 + k * (x1 - x0), y: y0 }, { x: x1, y: y1 - k * (y1 - y0) }, p1]
    : [p0, { x: x0, y: y0 + k * (y1 - y0) }, { x: x1 - k * (x1 - x0), y: y1 }, p1];
}

export function signedArea(pts: P[]) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/* Sutherland–Hodgman against an axis-aligned box; any of x0,x1,y0,y1 may be omitted. */
export function clipPoly(pts: Pt[], box: ClipBox): Pt[] {
  const planes: ['x' | 'y', number, number][] = [];
  if (box.x0 != null) planes.push(['x', box.x0, 1]);
  if (box.x1 != null) planes.push(['x', box.x1, -1]);
  if (box.y0 != null) planes.push(['y', box.y0, 1]);
  if (box.y1 != null) planes.push(['y', box.y1, -1]);
  let out = pts;
  // arbitrary half-planes: {x, y, nx, ny} keeps the side where (p - P)·n <= 0
  for (const pl of box.planes || []) {
    const src = out; out = [];
    const f = (p: Pt) => (p.x - pl.x) * pl.nx + (p.y - pl.y) * pl.ny;
    for (let i = 0, n = src.length; i < n; i++) {
      const a = src[i], b = src[(i + 1) % n], fa = f(a), fb = f(b);
      if (fa <= 0) out.push(a);
      if ((fa <= 0) !== (fb <= 0)) { const t = fa / (fa - fb); out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), sharp: true }); }
    }
    if (out.length < 3) return [];
  }
  for (const [ax, v, sg] of planes) {
    const src = out; out = [];
    const inside = (p: Pt) => (p[ax] - v) * sg >= -1e-9;
    for (let i = 0, n = src.length; i < n; i++) {
      const a = src[i], b = src[(i + 1) % n];
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (v - a[ax]) / (b[ax] - a[ax]);
        out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
      }
    }
    if (out.length < 3) return [];
  }
  return out;
}

interface Corner { i: number; th: number; r: number; d: number }

/* Turn a polygon into path commands, replacing corners with circular-ish fillets.
   Point flags: smooth (sampled curve, never a corner), sharp (never rounded),
   r (forced radius, e.g. round terminals). R is the default corner radius. */
export function roundContour(src: Pt[], R: number, cornersOut?: Pt[]): Cmd[] {
  const pts: Pt[] = [];
  for (const p of src) {
    const q = pts[pts.length - 1];
    if (!q || dist(p, q) > 0.05) pts.push(p);
  }
  while (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) <= 0.05) pts.pop();
  const n = pts.length;
  if (n < 3) return [];

  const S: number[] = new Array(2 * n + 1); S[0] = 0;
  for (let i = 0; i < 2 * n; i++) S[i + 1] = S[i] + dist(pts[i % n], pts[(i + 1) % n]);
  const total = S[n];
  const at = (s: number) => {
    s = ((s % total) + total) % total;
    let i = 0;
    while (i < n - 1 && S[i + 1] <= s) i++;
    const seg = S[i + 1] - S[i];
    return lerpP(pts[i], pts[(i + 1) % n], seg > 0 ? (s - S[i]) / seg : 0);
  };

  const corners: Corner[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (p.smooth) continue;
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const ux = p.x - a.x, uy = p.y - a.y, vx = b.x - p.x, vy = b.y - p.y;
    const th = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
    if (th < 0.07) continue;
    corners.push({ i, th, r: p.sharp ? 0 : (p.r != null ? p.r : R), d: 0 });
  }

  const cmds: Cmd[] = [];
  if (!corners.length) {
    pts.forEach((p, i) => cmds.push([i ? 'L' : 'M', p.x, p.y]));
    cmds.push(['Z']);
    return cmds;
  }
  const m = corners.length;
  for (let j = 0; j < m; j++) {
    const c = corners[j], prev = corners[(j + m - 1) % m], next = corners[(j + 1) % m];
    const lenPrev = ((S[c.i] - S[prev.i]) + total) % total || total;
    const lenNext = ((S[next.i] - S[c.i]) + total) % total || total;
    const want = c.r > 0 ? c.r * Math.tan(Math.min(c.th, 2.6) / 2) : 0;
    c.d = Math.min(want, lenPrev * 0.5, lenNext * 0.5);
    if (c.d < 0.6) c.d = 0;
    if (cornersOut && !pts[c.i].sharp) cornersOut.push({ x: pts[c.i].x, y: pts[c.i].y });
  }
  const first = corners[0];
  const start = first.d ? at(S[first.i] + first.d) : pts[first.i];
  cmds.push(['M', start.x, start.y]);
  for (let j = 0; j < m; j++) {
    const a = corners[j], b = corners[(j + 1) % m];
    const ia = a.i, ib = j === m - 1 ? b.i + n : b.i;
    const sA = S[ia] + a.d, sB = S[ib] - b.d;
    for (let i = ia + 1; i < ib; i++) {
      if (S[i] > sA + 0.05 && S[i] < sB - 0.05) cmds.push(['L', pts[i % n].x, pts[i % n].y]);
    }
    const v = pts[b.i];
    if (b.d) {
      const p1 = at(sB), p2 = at(S[ib] + b.d);
      const f = (4 / 3) * Math.tan(b.th / 4) / Math.tan(b.th / 2);
      cmds.push(['L', p1.x, p1.y]);
      cmds.push(['C', lerp(p1.x, v.x, f), lerp(p1.y, v.y, f), lerp(p2.x, v.x, f), lerp(p2.y, v.y, f), p2.x, p2.y]);
    } else {
      cmds.push(['L', v.x, v.y]);
    }
  }
  cmds.push(['Z']);
  return cmds;
}

export function applyM(M: Mat, x: number, y: number): [number, number] {
  return [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
}
/** A after B */
export function mulM(A: Mat, B: Mat): Mat {
  return [
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]
  ];
}
export function transformCmds(cmds: Cmd[], M: Mat): Cmd[] {
  return cmds.map(c => {
    if (c.length === 1) return c;
    const o: Cmd = [c[0]];
    for (let i = 1; i < c.length; i += 2) { const p = applyM(M, c[i], c[i + 1]); o.push(p[0], p[1]); }
    return o;
  });
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();
/* SVG path data; flips y so glyphs can be drawn directly in SVG space. */
export function cmdsToD(cmds: Cmd[]): string {
  let d = '';
  for (const c of cmds) {
    if (c[0] === 'Z') { d += 'Z'; continue; }
    d += c[0];
    for (let i = 1; i < c.length; i += 2) d += (i > 1 ? ' ' : '') + f1(c[i]) + ' ' + f1(-c[i + 1]);
  }
  return d;
}

/** Circle outlines around points, as SVG path data (for ring highlights). */
export function ringsD(pts: P[], R: number): string {
  return pts.map(p => `M${(p.x - R).toFixed(1)} ${(-p.y).toFixed(1)}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0Z`).join('');
}
