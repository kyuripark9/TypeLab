/* Letters drawn in Points from a scan or a trace, tidied where the scan's blur left the trace guessing. A scan holds a
   few font units a pixel, so detail under 2-3 px doesn't show, and a fitter's curves come out uneven there:
     node --import tsx tools/drawn/tidy.ts design.typelab.json [--out tidy.typelab.json]
   reads a design file (Export: Design file, or a saved design's JSON) and writes it back tidied (to
   <name>.tidy.typelab.json beside it by default), logging each change. Four steps, in this order:
   1. Joins: where a notch (an ink trap) turns into a stem or a hairline, its small round didn't show and the trace
      kept a hard corner, often behind a short straight. A corner turning 20-125° where a short straight or a curve
      meets it, the other side running on, becomes a round; a short straight leading on into a curve is taken up whole.
   2. Hairline ends: a free end 2-25 units across came out a lump or a point; it is cut straight across, square to the
      hairline where its tip reached, or flush with the baseline or cap height when it ends there at a slant.
   3. Rounds: a small round (under 100 units of radius) between two straight edges came out flat in the middle (short
      handles: a cut with soft ends) or in pieces that bend against each other. Each run of curves turning one way only
      is redrawn as one cubic along both edges, its handles the share of the way to the corner a circle takes for that
      turn, stretched to an ellipse where the round sits further along one edge. Big rounds (the drawing's own,
      often fuller than a circle), arches past 152°, and runs that bend both ways are left.
   4. Smooth points: a point marked smooth that still bends (a handle missing or askew) has its handles put on one line.
   A corner given a radius in Points (a live corner) is the designer's and is never touched. Made for the Ink Trap
   Display trace (Asset/Ink Trap Display), where it moved each letter by under 1% of its ink. */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { PARAMS_VERSION, sanitizeParams, upgradeParams, type Params } from '../../shared/params';
import { buildFont } from '../../shared/engine';
import type { Node } from '../../shared/engine/outline';

type P = { x: number; y: number };
const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k });
const len = (a: P) => Math.hypot(a.x, a.y);
const unit = (a: P): P => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const dist = (a: P, b: P) => len(sub(a, b));
const cross = (a: P, b: P) => a.x * b.y - a.y * b.x;
const deg = (a: number) => a * 180 / Math.PI;
/** The signed turn from u to v, in radians. */
const angle = (u: P, v: P) => Math.atan2(cross(u, v), u.x * v.x + u.y * v.y);
function bez(B: P[], t: number): P {
  const u = 1 - t;
  return { x: u * u * u * B[0].x + 3 * u * u * t * B[1].x + 3 * u * t * t * B[2].x + t * t * t * B[3].x,
    y: u * u * u * B[0].y + 3 * u * u * t * B[1].y + 3 * u * t * t * B[2].y + t * t * t * B[3].y };
}
const live = (n: Node) => !!n.r;

/** A segment from a node to the next: its four control points, whether it is a curve, and its length. */
interface Seg { B: P[]; curve: boolean; length: number }
function segOf(a: Node, b: Node): Seg {
  const curve = a.ox !== undefined || b.ix !== undefined;
  const B = [{ x: a.x, y: a.y }, { x: a.ox ?? a.x, y: a.oy ?? a.y }, { x: b.ix ?? b.x, y: b.iy ?? b.y }, { x: b.x, y: b.y }];
  let length = 0;
  if (curve) { let q = B[0]; for (let k = 1; k <= 64; k++) { const r = bez(B, k / 64); length += dist(q, r); q = r; } } else length = dist(B[0], B[3]);
  return { B, curve, length };
}
/** The way a segment leaves its start and arrives at its end, a handle on its own point skipped. */
const startDir = (s: Seg) => unit(len(sub(s.B[1], s.B[0])) > 1e-6 ? sub(s.B[1], s.B[0]) : len(sub(s.B[2], s.B[0])) > 1e-6 ? sub(s.B[2], s.B[0]) : sub(s.B[3], s.B[0]));
const endDir = (s: Seg) => unit(len(sub(s.B[3], s.B[2])) > 1e-6 ? sub(s.B[3], s.B[2]) : len(sub(s.B[3], s.B[1])) > 1e-6 ? sub(s.B[3], s.B[1]) : sub(s.B[3], s.B[0]));
/** The parameter at which a curve has run `s` from its start (or, `fromEnd`, from its end). */
function tAt(B: P[], s: number, fromEnd: boolean) {
  let acc = 0, q = bez(B, fromEnd ? 1 : 0);
  for (let k = 1; k <= 200; k++) { const t = fromEnd ? 1 - k / 200 : k / 200, r = bez(B, t); acc += dist(q, r); q = r; if (acc >= s) return t; }
  return fromEnd ? 0 : 1;
}
/** The part of a cubic between t0 and t1. */
function part(B: P[], t0: number, t1: number): P[] {
  const split = (C: P[], t: number) => {
    const ab = add(C[0], mul(sub(C[1], C[0]), t)), bc = add(C[1], mul(sub(C[2], C[1]), t)), cd = add(C[2], mul(sub(C[3], C[2]), t));
    const abc = add(ab, mul(sub(bc, ab), t)), bcd = add(bc, mul(sub(cd, bc), t)), m = add(abc, mul(sub(bcd, abc), t));
    return [[C[0], ab, abc, m], [m, bcd, cd, C[3]]];
  };
  return split(split(B, t0)[1], (t1 - t0) / (1 - t0 || 1))[0];
}
/** A node at p with the handles given (dropped when on the point). */
function nodeAt(p: P, inH: P | null, outH: P | null, smooth: boolean): Node {
  const n: Node = { x: p.x, y: p.y };
  if (inH && dist(inH, p) > 0.5) { n.ix = inH.x; n.iy = inH.y; }
  if (outH && dist(outH, p) > 0.5) { n.ox = outH.x; n.oy = outH.y; }
  if (smooth) n.s = 1;
  return n;
}
/** Points closer than three quarters of a unit made one: the first's way in, the second's way out. */
function merged(nodes: Node[]): Node[] {
  const out: Node[] = [];
  const join = (a: Node, b: Node): Node => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, s: 1, ...(a.ix !== undefined ? { ix: a.ix, iy: a.iy } : {}), ...(b.ox !== undefined ? { ox: b.ox, oy: b.oy } : {}) });
  for (const n of nodes) { const last = out[out.length - 1]; if (last && dist(last, n) < 0.75) out[out.length - 1] = join(last, n); else out.push(n); }
  if (out.length > 1 && dist(out[0], out[out.length - 1]) < 0.75) out[0] = join(out.pop()!, out[0]);
  return out;
}
/** To whole units, as a trace is kept; a live corner keeps its radius and kind. */
const rounded = (n: Node): Node => {
  const r: Node = { x: Math.round(n.x), y: Math.round(n.y) };
  if (n.ix !== undefined) { r.ix = Math.round(n.ix); r.iy = Math.round(n.iy!); }
  if (n.ox !== undefined) { r.ox = Math.round(n.ox); r.oy = Math.round(n.oy!); }
  if (n.s) r.s = 1;
  if (n.r) { r.r = n.r; if (n.corner) r.corner = n.corner; }
  return r;
};

/* ---- 1. joins */
const SHORT = 45, LONG = 20, JOIN_MIN = 20, JOIN_MAX = 125, ROUND = 24, K = 0.5523;
export function roundJoins(c: Node[], log: string[], tag: string): Node[] {
  const N = c.length;
  if (N < 3) return c;
  const segs = c.map((a, j) => segOf(a, c[(j + 1) % N]));
  const eligible = c.map((q, i) => {
    if (q.s || live(q)) return false;
    const si = segs[(i + N - 1) % N], so = segs[i], t = Math.abs(deg(angle(endDir(si), startDir(so))));
    if (t < JOIN_MIN || t > JOIN_MAX) return false;
    const shortOrCurve = (s: Seg) => s.curve || s.length < SHORT;
    return (shortOrCurve(si) || shortOrCurve(so)) && Math.max(si.length, so.length) >= LONG;
  });
  if (!eligible.some(Boolean)) return c;
  // how far each round reaches back along its way in (dA) and on along its way out (dB)
  const reach = (s: Seg, far: number) => {
    if (s.curve) return Math.min(s.length * 0.45, ROUND);
    if (s.length >= SHORT) return NaN;                       // a long straight: matched to the other side
    if (c[far].s) return s.length;                           // it leads on into a curve: taken up whole
    return eligible[far] ? s.length / 2 : s.length * 0.6;
  };
  const dA: number[] = [], dB: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!eligible[i]) continue;
    const si = segs[(i + N - 1) % N], so = segs[i];
    let a = reach(si, (i + N - 1) % N), b = reach(so, (i + 1) % N);
    if (isNaN(a)) a = Math.min(si.length * 0.4, Math.max(12, Math.min(b, 28)));
    if (isNaN(b)) b = Math.min(so.length * 0.4, Math.max(12, Math.min(a, 28)));
    dA[i] = a; dB[i] = b;
    log.push(`${tag} n${i} (${c[i].x},${c[i].y}): join rounded`);
  }
  const trimmed = segs.map((s, j) => {
    const s0 = eligible[j] ? dB[j] : 0, s1 = eligible[(j + 1) % N] ? dA[(j + 1) % N] : 0;
    if (!s.curve) { const u = unit(sub(s.B[3], s.B[0])), a = add(s.B[0], mul(u, s0)), b = sub(s.B[3], mul(u, s1)); return { ...s, B: [a, a, b, b] }; }
    const t0 = s0 ? tAt(s.B, s0, false) : 0, t1 = s1 ? tAt(s.B, s1, true) : 1;
    return { ...s, B: part(s.B, t0, Math.max(t1, t0 + 1e-6)) };
  });
  const out: Node[] = [];
  for (let i = 0; i < N; i++) {
    const prev = trimmed[(i + N - 1) % N], next = trimmed[i];
    const inH = prev.curve ? prev.B[2] : null, outH = next.curve ? next.B[1] : null;
    if (!eligible[i]) { const n = nodeAt(c[i], inH, outH, !!c[i].s); if (c[i].r) { n.r = c[i].r; n.corner = c[i].corner; } out.push(n); continue; }
    const A = prev.B[3], B = next.B[0];
    out.push(nodeAt(A, inH, add(A, mul(endDir(prev), dA[i] * K)), true));
    out.push(nodeAt(B, sub(B, mul(startDir(next), dB[i] * K)), outH, true));
  }
  return merged(out);
}

/* ---- 2. hairline ends */
interface Tip { i: number; j: number; pieces: number }
function tipsOf(c: Node[]): Tip[] {
  const N = c.length, res: Tip[] = [];
  const isLine = (k: number) => c[k].ox === undefined && c[(k + 1) % N].ix === undefined;
  const vec = (k: number) => sub(c[(k + 1) % N], c[k]);
  for (let i = 0; i < N; i++) {
    if (!isLine(i) || len(vec(i)) < 30) continue;
    for (let m = 2; m <= 5; m++) {
      const j = (i + m) % N;
      if (!isLine(j) || len(vec(j)) < 30) continue;
      const u = vec(i), v = vec(j);
      if ((u.x * v.x + u.y * v.y) / len(u) / len(v) > -0.97) continue;
      let run = 0, hasLive = false;
      for (let k = 1; k < m; k++) { run += len(vec((i + k) % N)); hasLive ||= live(c[(i + k) % N]); }
      if (run > 60 || hasLive || live(c[j])) continue;
      const gap = Math.abs(cross(sub(c[j], c[(i + 1) % N]), u)) / len(u);
      if (gap > 25 || gap < 2) continue;
      res.push({ i, j, pieces: m - 1 });
      break;
    }
  }
  return res;
}
export function cutTips(c: Node[], log: string[], tag: string, cap: number): Node[] {
  for (let pass = 0; pass < 8; pass++) {
    const N = c.length;
    // an end already one straight piece square to the hairline, or level on the line it stands on, is clean
    const clean = (t: Tip) => {
      if (t.pieces !== 1) return false;
      const e = sub(c[t.j], c[(t.i + 1) % N]), d = unit(sub(c[(t.i + 1) % N], c[t.i]));
      return Math.abs(e.x * d.x + e.y * d.y) <= 0.75 || (Math.abs(e.y) <= 0.5 && (Math.abs(c[t.j].y) <= 0.5 || Math.abs(c[t.j].y - cap) <= 0.5));
    };
    const t = tipsOf(c).find(t => !clean(t));
    if (!t) return c;
    const a0 = c[t.i], a1 = c[(t.i + 1) % N], b0 = c[t.j], b1 = c[(t.j + 1) % N];
    const d = unit(sub(a1, a0)), m = (t.j - t.i + N) % N;
    const tip = Array.from({ length: m }, (_, k) => c[(t.i + 1 + k) % N]);
    const lowY = Math.min(...tip.map(n => n.y)), highY = Math.max(...tip.map(n => n.y));
    const flushY = Math.abs(d.y) > 0.3 ? (Math.abs(lowY) <= 6 && d.y < 0 ? 0 : Math.abs(highY - cap) <= 6 && d.y > 0 ? cap : null) : null;
    const reachTo = Math.max(...tip.map(n => (n.x - a1.x) * d.x + (n.y - a1.y) * d.y));
    const meet = (p: P, dir: P): P => {
      if (flushY !== null) return { x: p.x + dir.x * (flushY - p.y) / dir.y, y: flushY };
      const s = ((a1.x + d.x * reachTo - p.x) * d.x + (a1.y + d.y * reachTo - p.y) * d.y) / (dir.x * d.x + dir.y * d.y);
      return add(p, mul(dir, s));
    };
    const p1 = meet(a0, d), p2 = meet(b1, unit(sub(b0, b1)));
    log.push(`${tag} (${a1.x},${a1.y}): hairline end cut ${flushY !== null ? `flush at ${flushY}` : 'square'}`);
    // from b1 round to a0, then the cut: the sides now run a0 to p1 and p2 to b1
    const rest = Array.from({ length: N - m }, (_, k) => c[(t.j + 1 + k) % N]);
    c = [...rest, { x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
  }
  return c;
}

/* ---- 3. rounds, 4. smooth points */
const EDGE = 40, ROUND_MIN = 12, ROUND_MAX = 152, CORNER = 30, SMALL = 100, STEP = 9;
/** The share of the way to the corner a round's handles reach, for a circle turning `t` radians. */
const share = (t: number) => (4 / 3) * Math.tan(t / 4) / Math.tan(t / 2);
export function fairRounds(c: Node[], log: string[], tag: string): Node[] {
  const N = c.length;
  if (N < 4) return alignSmooth(c, log, tag);
  const segs = c.map((a, j) => segOf(a, c[(j + 1) % N]));
  const edge = (j: number) => !segs[j].curve && segs[j].length >= EDGE;
  const replace = new Map<number, { p1: P; p2: P; b: number }>();
  for (let j = 0; j < N; j++) {
    if (!edge(j)) continue;
    const ins: number[] = [];
    let k = (j + 1) % N;
    while (!edge(k) && ins.length < N) { ins.push(k); k = (k + 1) % N; }
    // a round: curves, or straights too short to be edges where the trace faceted one (two at least: one is a bevel)
    if (!ins.length || (!ins.some(q => segs[q].curve) && ins.length < 2)) continue;
    const a = (j + 1) % N, b = k;
    if ([a, ...ins.map(q => (q + 1) % N)].some(q => live(c[q]))) continue;
    const u1 = unit(sub(segs[j].B[3], segs[j].B[0])), u2 = unit(sub(segs[b].B[3], segs[b].B[0]));
    const turn = angle(u1, u2), T = Math.abs(deg(turn));
    if (T < ROUND_MIN || T > ROUND_MAX) continue;
    // it turns one way only, its way read every STEP units so a wiggle of a few units (noise) doesn't count
    const pts: P[] = [sub(c[a], mul(u1, STEP))];
    for (const q of ins) for (let s = 0; s < 40; s++) pts.push(bez(segs[q].B, s / 40));
    pts.push(c[b], add(c[b], mul(u2, STEP)));
    const even: P[] = [pts[0]];
    let acc = 0;
    for (let s = 1; s < pts.length; s++) { acc += dist(pts[s - 1], pts[s]); if (acc >= STEP) { even.push(pts[s]); acc = 0; } }
    even.push(pts[pts.length - 1]);
    let prev = u1, oneWay = true, jump = 0;
    for (let s = 1; s < even.length; s++) {
      const d = unit(sub(even[s], even[s - 1]));
      if (len(d) === 0) continue;
      const da = angle(prev, d);
      if (Math.sign(da) === -Math.sign(turn) && Math.abs(deg(da)) > 6) { oneWay = false; break; }
      jump = Math.max(jump, Math.abs(deg(da)));
      prev = d;
    }
    if (!oneWay) continue;
    // where the edges meet: ahead of the round's start along the first, behind its end along the second
    const A = c[a], B = c[b], den = cross(u1, u2);
    if (Math.abs(den) < 1e-6) continue;
    const s1 = cross(sub(B, A), u2) / den, s2 = cross(sub(B, A), u1) / den, X = add(A, mul(u1, s1));
    if (s1 <= 0 || s2 >= 0) continue;
    const k1 = share(Math.abs(turn)), radius = (dist(A, X) + dist(B, X)) / 2 / Math.tan(Math.abs(turn) / 2);
    if (radius > SMALL || dist(A, B) < 20) continue;
    // a single curve already as full as a circle, with no bend in it, is fine as it is
    if (ins.length === 1 && segs[ins[0]].curve && jump <= CORNER) {
      const S = segs[ins[0]].B;
      if (Math.min(dist(S[1], A) / dist(X, A), dist(S[2], B) / dist(X, B)) >= k1 - 0.04) continue;
    }
    replace.set(a, { p1: add(A, mul(sub(X, A), k1)), p2: add(B, mul(sub(X, B), k1)), b });
    log.push(`${tag} n${a}-n${b} (${A.x},${A.y}): round redrawn (turn ${T.toFixed(0)}°)`);
  }
  if (!replace.size) return alignSmooth(c, log, tag);
  const skip = new Set<number>();
  for (const [a, { b }] of replace) for (let k = (a + 1) % N; k !== b; k = (k + 1) % N) skip.add(k);
  const out: Node[] = [];
  for (let i = 0; i < N; i++) {
    if (skip.has(i)) continue;
    let n: Node = { ...c[i] };
    const start = replace.get(i);
    if (start) { delete n.ix; delete n.iy; n = { ...n, ox: start.p1.x, oy: start.p1.y, s: 1 }; }
    for (const r of replace.values()) if (r.b === i) { delete n.ox; delete n.oy; n = { ...n, ix: r.p2.x, iy: r.p2.y, s: 1 }; }
    out.push(n);
  }
  return alignSmooth(out, log, tag);
}
/** Every point marked smooth made smooth: its handles turned onto one line (a straight side's way where one side is
    straight, the mean way otherwise), each keeping its length; a missing handle drawn along it a third of the way. */
function alignSmooth(c: Node[], log: string[], tag: string): Node[] {
  const N = c.length, out = c.map(n => ({ ...n }));
  for (let i = 0; i < N; i++) {
    const n = out[i];
    if (!n.s || live(n)) continue;
    const p = out[(i + N - 1) % N], q = out[(i + 1) % N];
    const inCurve = p.ox !== undefined || n.ix !== undefined, outCurve = n.ox !== undefined || q.ix !== undefined;
    if (!inCurve && !outCurve) continue;
    const tin = n.ix !== undefined ? sub(n, { x: n.ix, y: n.iy! }) : sub(n, inCurve ? { x: p.ox ?? p.x, y: p.oy ?? p.y } : p);
    const tout = n.ox !== undefined ? sub({ x: n.ox, y: n.oy! }, n) : sub(outCurve ? { x: q.ix ?? q.x, y: q.iy ?? q.y } : q, n);
    if (len(tin) < 1e-6 || len(tout) < 1e-6) continue;
    const bend = Math.abs(deg(angle(tin, tout)));
    if (bend < 0.5 || bend > CORNER) continue;
    const d = !inCurve ? unit(tin) : !outCurve ? unit(tout) : unit(add(unit(tin), unit(tout)));
    if (inCurve) { const l = n.ix !== undefined ? len(tin) : dist(n, p) / 3; n.ix = n.x - d.x * l; n.iy = n.y - d.y * l; }
    if (outCurve) { const l = n.ox !== undefined ? len(tout) : dist(n, q) / 3; n.ox = n.x + d.x * l; n.oy = n.y + d.y * l; }
    log.push(`${tag} n${i} (${Math.round(n.x)},${Math.round(n.y)}): smooth point straightened (${bend.toFixed(1)}° bend)`);
  }
  return out;
}

/** A design's drawn letters tidied, every step in order; the log lists each change. */
export function tidy(p: Params, log: string[] = []): Params {
  const cap = buildFont(p).m.cap, outlines: Params['outlines'] = {};
  for (const [ch, d] of Object.entries(p.outlines)) {
    outlines[ch] = { ...d, contours: d.contours.map((c, ci) => {
      const tag = `${ch} c${ci}`;
      return fairRounds(cutTips(roundJoins(c, log, tag).map(rounded), log, tag, cap).map(rounded), log, tag).map(rounded);
    }) };
  }
  return sanitizeParams({ ...p, outlines });
}

if (process.argv[1]?.endsWith('tidy.ts')) {
  const { values: a, positionals } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: true });
  const file = positionals[0];
  if (!file) { console.error('usage: tidy.ts design.typelab.json [--out file]'); process.exit(1); }
  const j = JSON.parse(readFileSync(file, 'utf8'));
  const p = j.params ? sanitizeParams(upgradeParams(j.params, typeof j.version === 'number' ? j.version : 1)) : sanitizeParams(j);
  const log: string[] = [], out = tidy(p, log);
  const dest = a.out ?? file.replace(/(\.typelab)?\.json$/, '') + '.tidy.typelab.json';
  writeFileSync(dest, JSON.stringify({ app: 'TypeLab', version: PARAMS_VERSION, name: j.name ?? 'Untitled', styleId: j.styleId ?? 'geometric', params: out }, null, 2));
  console.log(log.join('\n'));
  console.log(`${log.length} changes; written to ${dest}`);
}
