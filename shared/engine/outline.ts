/* Letters drawn by hand with the pen: outlines of anchor points and bézier handles, like a vector
   editor's paths, instead of strokes the parameters build. A generated letter becomes one by fitting
   curves to its outline (fitOutline), which the engine draws as dense polylines. A free font's letters
   reshaped by skin.ts and restyle.ts are fitted the same way, a little closer (within 1.2 units).

   shared/params (clean.ts, model.ts) reads cleanDrawn and Drawn from here, so this file imports only
   types: a value import reaching font.ts, which reads the params, would load the two in a cycle.
   cleanDrawn is what a stored drawing passes as it loads: with a width or an anchor point past ±5000
   units, more than 200 contours or more than 4000 points in all, the drawing is left out (a handle past
   ±5000 is dropped alone). */
import type { Cmd } from './types';

type P = { x: number; y: number };

/**
 * One anchor point of a drawn outline, in font units, y up. `ix,iy` is the handle pulling the curve
 * that comes in, `ox,oy` the one pulling the curve that goes out (absolute positions; a side
 * without one is straight at this end). `s` marks a smooth point: its two handles stay in line.
 */
export interface Node { x: number; y: number; ix?: number; iy?: number; ox?: number; oy?: number; s?: 1 }
/** A drawn letter: its advance width and closed contours. Nonzero fill, so a contour running the
    other way round from the one around it cuts a hole. */
export interface Drawn { adv: number; contours: Node[][] }

export const hasIn = (n: Node) => n.ix !== undefined && n.iy !== undefined;
export const hasOut = (n: Node) => n.ox !== undefined && n.oy !== undefined;

/** The segment from a to b as a cubic's four points, or null when it is straight. */
export function segment(a: Node, b: Node): [P, P, P, P] | null {
  if (!hasOut(a) && !hasIn(b)) return null;
  return [a, hasOut(a) ? { x: a.ox!, y: a.oy! } : a, hasIn(b) ? { x: b.ix!, y: b.iy! } : b, b];
}

/** Path commands for drawn contours; every contour is closed. */
export function drawnCmds(contours: Node[][]): Cmd[] {
  const out: Cmd[] = [];
  for (const c of contours) {
    if (!c.length) continue;
    out.push(['M', c[0].x, c[0].y]);
    if (c.length > 1) {
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length], s = segment(a, b);
        if (s) out.push(['C', s[1].x, s[1].y, s[2].x, s[2].y, b.x, b.y]);
        else if (i + 1 < c.length) out.push(['L', b.x, b.y]);
      }
    }
    out.push(['Z']);
  }
  return out;
}

/* ---------------------------------------------------------------- fitting */

const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k });
const dot = (a: P, b: P) => a.x * b.x + a.y * b.y;
const len = (a: P) => Math.hypot(a.x, a.y);
const unit = (a: P): P => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const dist = (a: P, b: P) => len(sub(a, b));

function bez(B: P[], t: number): P {
  const u = 1 - t;
  return {
    x: u * u * u * B[0].x + 3 * u * u * t * B[1].x + 3 * u * t * t * B[2].x + t * t * t * B[3].x,
    y: u * u * u * B[0].y + 3 * u * u * t * B[1].y + 3 * u * t * t * B[2].y + t * t * t * B[3].y
  };
}
const bez1 = (B: P[], t: number): P => {
  const u = 1 - t;
  return add(add(mul(sub(B[1], B[0]), 3 * u * u), mul(sub(B[2], B[1]), 6 * u * t)), mul(sub(B[3], B[2]), 3 * t * t));
};
const bez2 = (B: P[], t: number): P =>
  add(mul(add(sub(B[2], mul(B[1], 2)), B[0]), 6 * (1 - t)), mul(add(sub(B[3], mul(B[2], 2)), B[1]), 6 * t));

/** The contours of path commands as point lists (curves sampled), without repeats or points on a straight run. */
function polygons(cmds: Cmd[]): P[][] {
  const out: P[][] = [];
  let cur: P[] = [];
  const flush = () => { if (cur.length > 2) out.push(cur); cur = []; };
  for (const c of cmds) {
    if (c[0] === 'M') { flush(); cur.push({ x: c[1], y: c[2] }); }
    else if (c[0] === 'L') cur.push({ x: c[1], y: c[2] });
    else if (c[0] === 'C') {
      const a = cur[cur.length - 1] ?? { x: c[5], y: c[6] }, B = [a, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }];
      for (let i = 1; i <= 12; i++) cur.push(bez(B, i / 12));
    } else flush();
  }
  flush();
  return out.map(clean).filter(p => p.length > 2);
}

function clean(pts: P[]): P[] {
  let p = pts.filter((q, i) => dist(q, pts[(i + 1) % pts.length]) > 0.05);
  // drop points in the middle of a straight run
  for (let changed = true; changed && p.length > 3;) {
    changed = false;
    for (let i = 0; i < p.length && p.length > 3; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const ab = sub(b, a), bc = sub(c, b);
      if (Math.abs(ab.x * bc.y - ab.y * bc.x) / (len(sub(c, a)) || 1) < 0.02 && dot(ab, bc) > 0) { p.splice(i, 1); i--; changed = true; }
    }
  }
  return p;
}

type Bez = [P, P, P, P];

/** Least-squares cubic through `pts` at parameters `u`, leaving along t1 and arriving along t2 (both handles a third of the chord when the fit runs wild). */
function generate(pts: P[], u: number[], t1: P, t2: P): Bez {
  const p0 = pts[0], p3 = pts[pts.length - 1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i], s = 1 - t, b0 = s * s * s, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t * t * t;
    const a1 = mul(t1, b1), a2 = mul(t2, -b2);
    c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2);
    const tmp = sub(pts[i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += dot(a1, tmp); x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01, seg = dist(p0, p3);
  let al = det ? (x0 * c11 - x1 * c01) / det : 0, ar = det ? (c00 * x1 - c01 * x0) / det : 0;
  if (!(al > seg * 1e-3) || !(ar > seg * 1e-3) || al > seg * 3 || ar > seg * 3) al = ar = seg / 3;
  return [p0, add(p0, mul(t1, al)), sub(p3, mul(t2, ar)), p3];
}

function maxError(pts: P[], B: Bez, u: number[]): { err: number; at: number } {
  let err = 0, at = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dist(bez(B, u[i]), pts[i]);
    if (d > err) { err = d; at = i; }
  }
  // and between them: the curve mustn't bulge off the straight piece joining two points
  for (let i = 0; i < pts.length - 1; i++) {
    const q = bez(B, (u[i] + u[i + 1]) / 2), a = pts[i], ab = sub(pts[i + 1], a), l = dot(ab, ab);
    const t = l ? Math.min(1, Math.max(0, dot(sub(q, a), ab) / l)) : 0, d = dist(q, add(a, mul(ab, t)));
    if (d > err) { err = d; at = i === 0 ? 1 : i; }
  }
  return { err, at };
}

/** Schneider's curve fitting: cubics within `tol` of the points, split where they miss most. */
function fitCubic(pts: P[], t1: P, t2: P, tol: number, depth = 0): Bez[] {
  if (pts.length === 2) {
    const d = dist(pts[0], pts[1]) / 3;
    return [[pts[0], add(pts[0], mul(t1, d)), sub(pts[1], mul(t2, d)), pts[1]]];
  }
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + dist(pts[i], pts[i - 1]));
  let u = L.map(l => l / (L[L.length - 1] || 1));
  let B = generate(pts, u, t1, t2), { err, at } = maxError(pts, B, u);
  if (err < tol) return [B];
  if (err < tol * 6) {
    for (let k = 0; k < 12; k++) {
      // Newton steps move each parameter to the curve's nearest point
      u = u.map((t, i) => {
        const d = sub(bez(B, t), pts[i]), d1 = bez1(B, t), d2 = bez2(B, t);
        const den = dot(d1, d1) + dot(d, d2);
        return den ? Math.min(1, Math.max(0, t - dot(d, d1) / den)) : t;
      });
      B = generate(pts, u, t1, t2);
      ({ err, at } = maxError(pts, B, u));
      if (err < tol) return [B];
    }
  }
  if (depth > 12) return [B];
  at = Math.min(pts.length - 2, Math.max(1, at));
  const tc = unit(sub(pts[at + 1], pts[at - 1]));
  return [...fitCubic(pts.slice(0, at + 1), t1, tc, tol, depth + 1), ...fitCubic(pts.slice(at), tc, t2, tol, depth + 1)];
}

const CORNER = 28 * Math.PI / 180, KINK = 8 * Math.PI / 180;
const turn = (a: P, b: P, c: P) => {
  const u = sub(b, a), v = sub(c, b);
  return Math.abs(Math.atan2(u.x * v.y - u.y * v.x, dot(u, v)));
};

/** One contour of points as anchor points and handles. */
function fitContour(p: P[], tol: number): Node[] {
  const n = p.length, at = (i: number) => p[((i % n) + n) % n];
  const seg = (i: number) => dist(at(i), at(i + 1));
  // breaks: corners, both ends of a long straight segment, and where a curve turns level or upright
  const corner = p.map((_, i) => turn(at(i - 1), at(i), at(i + 1)) > CORNER);
  // a long segment, or one much longer than a neighbour: the engine's straight edge, drawn as a line
  const straight = p.map((_, i) => seg(i) > 60 || (seg(i) > 24 && seg(i) > 2.5 * Math.min(seg(i - 1), seg(i + 1))));
  const brk = new Map<number, P | null>(); // index -> tangent through it (null: a corner)
  p.forEach((_, i) => {
    // where a line meets a curve, the curve carries on in the line's direction, unless it turns there
    const kink = turn(at(i - 1), at(i), at(i + 1)) > KINK;
    if (corner[i] || ((straight[i] || straight[(i + n - 1) % n]) && kink)) brk.set(i, null);
    else if (straight[i]) brk.set(i, unit(sub(at(i + 1), at(i))));
    else if (straight[(i + n - 1) % n]) brk.set(i, unit(sub(at(i), at(i - 1))));
  });
  for (let i = 0; i < n; i++) {
    if (brk.has(i) || straight[i] || straight[(i + n - 1) % n]) continue;
    const t0 = sub(at(i), at(i - 1)), t1 = sub(at(i + 1), at(i));
    const flatX = t0.x * t1.x < 0 || (t1.x === 0 && t0.x !== 0), flatY = t0.y * t1.y < 0 || (t1.y === 0 && t0.y !== 0);
    if (!flatX && !flatY) continue;
    // an extreme: the curve runs upright (x turns) or level (y turns) here
    let near = false;
    for (let d = -2; d <= 2; d++) if (d && brk.has((i + d + n) % n)) near = true;
    if (near) continue;
    const t = unit(sub(at(i + 1), at(i - 1)));
    brk.set(i, flatX && !flatY ? { x: 0, y: Math.sign(t.y) || 1 } : !flatX && flatY ? { x: Math.sign(t.x) || 1, y: 0 } : t);
  }
  if (!brk.size) brk.set(0, unit(sub(at(1), at(-1))));
  const idx = [...brk.keys()].sort((a, b) => a - b);

  const nodes: Node[] = idx.map(i => ({ x: p[i].x, y: p[i].y }));
  const beziers: (Bez[] | null)[] = [];
  idx.forEach((i, k) => {
    const j = k + 1 < idx.length ? idx[k + 1] : idx[0] + n;
    const run: P[] = [];
    for (let q = i; q <= j; q++) run.push(at(q));
    if (run.length === 2 && (straight[i % n] || brk.get(i) === null || brk.get(j % n) === null)) { beziers.push(null); return; }
    const ta = brk.get(i) ?? unit(sub(run[1], run[0]));
    const tb = brk.get(j % n) ?? unit(sub(run[run.length - 1], run[run.length - 2]));
    beziers.push(fitCubic(run, ta, tb, tol));
  });

  // stitch the runs back together: every split inside a run is a smooth anchor point
  const out: Node[] = [];
  nodes.forEach((node, k) => {
    const bs = beziers[k], prev = beziers[(k + nodes.length - 1) % nodes.length];
    const last = prev?.[prev.length - 1];
    const first: Node = { ...node };
    if (last) { first.ix = last[2].x; first.iy = last[2].y; }
    if (bs) { first.ox = bs[0][1].x; first.oy = bs[0][1].y; }
    out.push(first);
    bs?.slice(1).forEach((b, m) => out.push({ x: b[0].x, y: b[0].y, ix: bs[m][2].x, iy: bs[m][2].y, ox: b[1].x, oy: b[1].y }));
  });
  return tidy(out);
}

const r1 = (v: number) => Math.round(v);

/** Whole font units; handles that sit on their anchor or on a straight segment dropped; smooth
    points marked where the curve runs straight through. */
export function tidy(c: Node[]): Node[] {
  const out = c.map(n => {
    const m: Node = { x: r1(n.x), y: r1(n.y) };
    if (hasIn(n) && Math.hypot(n.ix! - n.x, n.iy! - n.y) >= 0.5) { m.ix = r1(n.ix!); m.iy = r1(n.iy!); }
    if (hasOut(n) && Math.hypot(n.ox! - n.x, n.oy! - n.y) >= 0.5) { m.ox = r1(n.ox!); m.oy = r1(n.oy!); }
    return m;
  });
  out.forEach((a, i) => {
    const b = out[(i + 1) % out.length], ch = sub(b, a), l = len(ch);
    if (!l || (!hasOut(a) && !hasIn(b))) return;
    const off = (q: P) => Math.abs(ch.x * (q.y - a.y) - ch.y * (q.x - a.x)) / l;
    const along = (q: P) => dot(sub(q, a), ch) / (l * l);
    const hs = [hasOut(a) ? { x: a.ox!, y: a.oy! } : a, hasIn(b) ? { x: b.ix!, y: b.iy! } : b];
    if (hs.every(q => off(q) < 0.75 && along(q) >= -0.01 && along(q) <= 1.01)) { delete a.ox; delete a.oy; delete b.ix; delete b.iy; }
  });
  for (const m of out) {
    if (!hasIn(m) || !hasOut(m)) continue;
    const u = { x: m.x - m.ix!, y: m.y - m.iy! }, v = { x: m.ox! - m.x, y: m.oy! - m.y };
    if (turn({ x: 0, y: 0 }, u, add(u, v)) < 6 * Math.PI / 180) m.s = 1;
  }
  return out;
}

/** Anchor points and handles tracing an outline of path commands, within `tol` font units. */
export function fitOutline(cmds: Cmd[], tol = 1.6): Node[][] {
  return polygons(cmds).map(p => fitContour(p, tol)).filter(c => c.length > 1);
}

/* ---------------------------------------------------------------- stored form */

const LIMIT = 5000;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= LIMIT;

/** A drawn letter as stored, or undefined when it isn't a valid one. */
export function cleanDrawn(v: unknown): Drawn | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const d = v as Record<string, unknown>;
  if (!num(d.adv) || !Array.isArray(d.contours) || d.contours.length > 200) return undefined;
  const contours: Node[][] = [];
  let total = 0;
  for (const c of d.contours) {
    if (!Array.isArray(c) || !c.length) return undefined;
    total += c.length;
    if (total > 4000) return undefined;
    const nodes: Node[] = [];
    for (const n of c) {
      if (!n || typeof n !== 'object') return undefined;
      const q = n as Record<string, unknown>;
      if (!num(q.x) || !num(q.y)) return undefined;
      const m: Node = { x: q.x as number, y: q.y as number };
      if (num(q.ix) && num(q.iy)) { m.ix = q.ix as number; m.iy = q.iy as number; }
      if (num(q.ox) && num(q.oy)) { m.ox = q.ox as number; m.oy = q.oy as number; }
      if (q.s === 1) m.s = 1;
      nodes.push(m);
    }
    contours.push(nodes);
  }
  return { adv: Math.max(0, d.adv as number), contours };
}
