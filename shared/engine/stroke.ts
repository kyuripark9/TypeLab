/* Stroke expander.
   A glyph is a set of skeleton strokes (centerlines). This module turns a centerline
   into an outline polygon whose thickness follows the pen model: thick where the
   stroke runs vertically, thin where it runs horizontally (scaled by Contrast),
   with styled terminals, mitered joins and optional serifs. */
import { clamp, cubicAt, lerp, lerpP, quarter, smoothstep, subCubic } from './geom';
import type { Cmd, EndType, PenCtx, Pt, SerifSides, StrokeEnd, StrokeOpts, StrokeWeight, TermSpec } from './types';

const CURVE_N = 16;

interface Sample {
  x: number; y: number; tx: number; ty: number;
  w: number | null; mask: number; smooth: boolean;
  len: number; t: number;
  /** sideways shift of the outline (toward the left of travel), for one-sided thinning */
  off?: number;
}
type Dir = { x: number; y: number };

const wNum = (w: StrokeWeight) => (w === 'thin' ? 0 : w === 'thick' ? 1 : w);
/** Terminals as drawn when the design gives no finer shape. */
const TERM: TermSpec = { flare: 1, round: 0.5, point: 0.95, lean: 0, slope: 0.6, tilt: 0, tip: 0.42, taper: 3 };

/* Cut corners: the straight-line counterpart of a curve. Its corner is where the two end
   tangents meet, and the cut runs between points a fraction `f` of the way back from the
   corner (0 = square corner, 1 = straight chord). Without a usable corner (parallel
   tangents, as in the spine of an S) the curve becomes its chord. */
function chamferPoly(P: Dir[], f: number): Dir[] {
  const [p0, p1, p2, p3] = P;
  const d0 = { x: p1.x - p0.x, y: p1.y - p0.y }, d1 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const wx = p3.x - p0.x, wy = p3.y - p0.y, cr = d0.x * d1.y - d0.y * d1.x;
  if (Math.abs(cr) > 1e-6 * Math.hypot(d0.x, d0.y) * Math.hypot(d1.x, d1.y)) {
    const s = (wx * d1.y - wy * d1.x) / cr, t = (wx * d0.y - wy * d0.x) / cr;
    if (s > 0 && t < 0) {
      const c = { x: p0.x + s * d0.x, y: p0.y + s * d0.y };
      return [p0, lerpP(c, p0, f), lerpP(c, p3, f), p3];
    }
  }
  return [p0, p3];
}

/* Samples of cubic P over [u0,u1], pulled toward its cut-corner polygon by `mix`. Each straight
   side becomes its own list, so the corners between them stay corners. */
function chamferSamples(P: Dir[], u0: number, u1: number, chamfer: number, w: number | null, minLen: number): Sample[][] {
  // the first 30% of the slider morphs the curve into a regular octagon; the rest shrinks the cuts
  const mix = smoothstep(chamfer / 0.3), f = lerp(0.586, 0.2, clamp((chamfer - 0.3) / 0.7));
  const poly = chamferPoly(P, f), cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
  const total = cum[cum.length - 1] || 1;
  const at = (u: number) => {
    const s = clamp(u) * total;
    let i = 1;
    while (i < poly.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1];
    const q = lerpP(poly[i - 1], poly[i], seg > 0 ? (s - cum[i - 1]) / seg : 0), c = cubicAt(P, u);
    return { x: lerp(c.x, q.x, mix), y: lerp(c.y, q.y, mix) };
  };
  const out: Sample[][] = [], span = u1 - u0 || 1;
  for (let k = 1; k < poly.length; k++) {
    let a = Math.max(u0, cum[k - 1] / total), b = Math.min(u1, cum[k] / total);
    if (b - a < 1e-4) continue;
    // a side cut short by the curve's start or end, shorter than the stroke is thick, would
    // only leave a spike at the corner: let the stroke start or end at the corner instead
    if ((b - a) * total < minLen && k < poly.length - 1 && a > cum[k - 1] / total + 1e-6 && u1 > cum[k] / total + 1e-4) continue;
    if ((b - a) * total < minLen && k > 1 && b < cum[k] / total - 1e-6 && u0 < cum[k - 1] / total - 1e-4) continue;
    const n = mix < 1 ? 8 : 1, seg: Sample[] = [], eps = (b - a) * 1e-3;
    for (let i = 0; i <= n; i++) {
      const u = lerp(a, b, i / n), p = at(u), p0 = at(Math.max(a, u - eps)), p1 = at(Math.min(b, u + eps));
      const dx = p1.x - p0.x, dy = p1.y - p0.y, l = Math.hypot(dx, dy) || 1, lu = (u - u0) / span;
      seg.push({ x: p.x, y: p.y, tx: dx / l, ty: dy / l, w, mask: smoothstep(Math.min(lu, 1 - lu) * 3.2),
        smooth: i > 0 && i < n, len: 0, t: 0 });
    }
    out.push(seg);
  }
  return out;
}

/* ---- 1. flatten path commands into runs of samples (a run has a continuous tangent) */
function flatten(cmds: Cmd[], ctx: PenCtx, subdivLines: boolean) {
  const runs: Sample[][] = [];
  let run: Sample[] | null = null, cur: Dir = { x: 0, y: 0 }, closed = false;
  const push = (samples: Sample[]) => {
    if (!samples.length) return;
    const first = samples[0];
    if (run && run.length) {
      const last = run[run.length - 1];
      if (last.tx * first.tx + last.ty * first.ty > 0.9994) { samples = samples.slice(1); last.smooth = true; }
      else { run = []; runs.push(run); }
    } else { run = []; runs.push(run); }
    for (const s of samples) run.push(s);
  };
  for (const c of cmds) {
    const op = c[0];
    if (op === 'M') { cur = { x: c[1], y: c[2] }; run = null; continue; }
    if (op === 'Z') { closed = true; continue; }
    if (op === 'L') {
      const o = c[3] || {}, to = { x: c[1], y: c[2] };
      const dx = to.x - cur.x, dy = to.y - cur.y, l = Math.hypot(dx, dy);
      if (l < 0.01) continue;
      const n = subdivLines ? 8 : 1, out: Sample[] = [];
      for (let i = 0; i <= n; i++) {
        out.push({ x: cur.x + dx * i / n, y: cur.y + dy * i / n, tx: dx / l, ty: dy / l,
          w: o.w != null ? wNum(o.w) : null, mask: 1, smooth: i > 0 && i < n, len: 0, t: 0 });
      }
      push(out); cur = to; continue;
    }
    let P: Dir[], o;
    if (op === 'C') {
      P = [cur, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }]; o = c[7] || {};
    } else { // 'hv' | 'vh'
      o = c[3] || {};
      const dx = c[1] - cur.x, dy = c[2] - cur.y;
      // organic curves: diagonal quadrants get unequal tension, like a hand-drawn bowl
      const k = clamp(ctx.k * (1 + (dx * dy < 0 ? 0.13 : -0.09) * ctx.org), 0.3, 0.97);
      P = quarter(cur.x, cur.y, c[1], c[2], op, k);
    }
    const u0 = o.u0 || 0, u1 = o.u1 == null ? 1 : o.u1;
    if (ctx.chamfer) {
      chamferSamples(P, u0, u1, ctx.chamfer, o.w != null ? wNum(o.w) : null, ctx.thick * 0.9).forEach(push);
      cur = P[3]; continue;
    }
    P = subCubic(P, u0, u1);
    const out: Sample[] = [];
    for (let i = 0; i <= CURVE_N; i++) {
      const u = i / CURVE_N, p = cubicAt(P, u);
      out.push({ x: p.x, y: p.y, tx: p.tx, ty: p.ty, w: o.w != null ? wNum(o.w) : null,
        mask: smoothstep(Math.min(u, 1 - u) * 3.2), smooth: i > 0 && i < CURVE_N, len: 0, t: 0 });
    }
    push(out); cur = P[3];
  }
  return { runs, closed };
}

/* ---- 2. pen model */
export function autoThickness(tx: number, ty: number, ctx: PenCtx, thick: number, thin: number) {
  const th = Math.atan2(ty, tx);
  let v = clamp(Math.abs(Math.sin(th - ctx.stress)) / Math.cos(ctx.stress));
  // reversed, the weight follows cos²: flat at the heavy horizontals and, unlike a plain cosine,
  // without a sharp dip where tight curves turn vertical
  if (ctx.reverse) v = lerp(v, Math.cos(th - ctx.stress) ** 2, ctx.reverse);
  return thin + (thick - thin) * Math.pow(v, 1.15);
}

/* Cut one side of a stroke end off along a line through p, level ('h') or plumb ('v'), turned
   counterclockwise by `tilt` radians. */
function cutSide(side: Pt[], p: Dir, d: Dir, axis: 'h' | 'v', t: number, tilt = 0) {
  if (side.length < 2) return;
  const o = axis === 'h' ? { x: 0, y: Math.sign(d.y) || 1 } : { x: Math.sign(d.x) || 1, y: 0 };
  // a cut turned nearly along the stroke would draw it out into a spike: keep within 55° of square to it
  if (tilt) {
    const lim = 55 * Math.PI / 180, toD = Math.atan2(o.x * d.y - o.y * d.x, o.x * d.x + o.y * d.y);
    tilt = clamp(tilt, toD - lim, toD + lim);
  }
  const cs = Math.cos(tilt), sn = Math.sin(tilt), out = { x: o.x * cs - o.y * sn, y: o.x * sn + o.y * cs };
  const off = (q: Dir) => (q.x - p.x) * out.x + (q.y - p.y) * out.y;
  while (side.length > 2 && off(side[side.length - 2]) > 1e-6 && Math.hypot(side[side.length - 2].x - p.x, side[side.length - 2].y - p.y) < t * 1.6) side.pop();
  const q = side[side.length - 1], prev = side[side.length - 2];
  let dx = q.x - prev.x, dy = q.y - prev.y; const l = Math.hypot(dx, dy);
  if (l < 1e-6) { dx = d.x; dy = d.y; } else { dx /= l; dy /= l; }
  const den = dx * out.x + dy * out.y;
  if (Math.abs(den) < 0.12) return;
  const s = clamp(-off(q) / den, -Math.max(l * 0.9, t), 4 * t);
  side[side.length - 1] = { x: q.x + dx * s, y: q.y + dy * s };
}

/* A is the side to the left of the outward direction d, B to the right. Returns points
   inserted between the two tails. */
function cap(A: Pt[], B: Pt[], p: Dir, d: Dir, t: number, type: EndType, ctx: PenCtx, outerIsA: boolean): Pt[] {
  const a = A[A.length - 1], b = B[B.length - 1];
  if (type === 'join') { a.sharp = b.sharp = true; a.smooth = b.smooth = false; return []; }
  if (type === 'h' || type === 'v') { cutSide(A, p, d, type, t); cutSide(B, p, d, type, t); return []; }
  if (type !== 'term') { a.smooth = b.smooth = false; return []; }
  a.smooth = b.smooth = false;
  const T = ctx.term ?? TERM;
  switch (ctx.terminal) {
    case 'round': a.r = b.r = t * T.round + 0.5; return [];
    case 'sharp': {
      // leaning toward the outer edge: A lies to the left of d
      const lean = T.lean * t * (outerIsA ? 1 : -1);
      return [{ x: p.x + d.x * t * T.point - d.y * lean, y: p.y + d.y * t * T.point + d.x * lean, sharp: true }];
    }
    case 'angled': {
      const side = outerIsA ? A : B, q = side[side.length - 1];
      side[side.length - 1] = { x: q.x + d.x * t * T.slope, y: q.y + d.y * t * T.slope };
      return [];
    }
    case 'cut': {
      const axis = Math.abs(d.x) > Math.abs(d.y) ? 'v' : 'h';
      cutSide(A, p, d, axis, t, T.tilt); cutSide(B, p, d, axis, t, T.tilt); return [];
    }
    default: return [];
  }
}

export interface Expanded {
  contours: Pt[][];
  loop: boolean;
  ends: StrokeEnd[];
  skeleton: Pt[][];
  curved: boolean;
  thickness: number[];
}

/* ---- 3. expand one stroke */
export function expandStroke(cmds: Cmd[], o: StrokeOpts, ctx: PenCtx): Expanded | null {
  const sc = o.scale || 1;
  const thick = ctx.thick * sc, thin = Math.min(ctx.thin * sc, thick);
  let ws = o.ws == null ? 1 : o.ws, we = o.we == null ? 1 : o.we;
  const T = ctx.term ?? TERM, tapers = ctx.terminal === 'tapered';
  if (tapers) {
    if (o.s === 'term') ws = Math.min(ws, T.tip);
    if (o.e === 'term') we = Math.min(we, T.tip);
  } else if (ctx.terminal === 'flat') {
    if (o.s === 'term') ws *= T.flare;
    if (o.e === 'term') we *= T.flare;
  }
  // thin joints: a stroke narrows where it runs into another, opening up the crotch
  let js = 1, je = 1;
  if (ctx.joints) {
    // never past half: where two strokes overlap (the waist of B) each keeps its shared half
    const f = lerp(1, 0.45, ctx.joints);
    if (o.s === 'join') js = f;
    if (o.e === 'join') je = f;
  }
  const tapered = ws !== 1 || we !== 1 || js !== 1 || je !== 1;
  const { runs, closed } = flatten(cmds, ctx, tapered);
  if (!runs.length) return null;

  // arclength for tapers
  let total = 0; const all: Sample[] = [];
  runs.forEach(r => r.forEach(s => {
    const prev = all[all.length - 1];
    if (prev) total += Math.hypot(s.x - prev.x, s.y - prev.y);
    s.len = total; all.push(s);
  }));
  const taperLen = Math.max(1, Math.min(total * 0.45, thick * 3));
  // a tapered terminal thins over its own length, and a long one may run most of the way along
  const termLen = tapers ? Math.max(1, Math.min(total * Math.min(0.85, 0.15 * T.taper), thick * T.taper)) : taperLen;
  const lenS = o.s === 'term' ? termLen : taperLen, lenE = o.e === 'term' ? termLen : taperLen;
  // explicit weights name the thick or thin stroke of a pair, so reverse contrast swaps them
  const rev = (w: number) => ctx.reverse ? lerp(w, 1 - w, ctx.reverse) : w;
  const pathW = o.w == null ? null : rev(wNum(o.w));
  for (const s of all) {
    let t = autoThickness(s.tx, s.ty, ctx, thick, thin);
    if (pathW != null) t = lerp(thin, thick, pathW);
    if (s.w != null) t = lerp(t, lerp(thin, thick, rev(s.w)), s.mask);
    if (ws !== 1) t *= lerp(ws, 1, smoothstep(s.len / lenS));
    if (we !== 1) t *= lerp(we, 1, smoothstep((total - s.len) / lenE));
    // a hand-held pen never presses evenly
    if (ctx.wobble) t *= 1 + ctx.wobble * 0.22 * Math.sin(s.len / (thick * 1.8 + 60) + (ctx.seed || 0));
    s.t = t;
  }
  if (js !== 1 || je !== 1) {
    // a curved stroke keeps its outer edge and thins only on the side of the counter it
    // wraps, like an ink trap; a straight one thins evenly on both sides
    let turn = 0;
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1], b = all[i];
      turn += Math.atan2(a.tx * b.ty - a.ty * b.tx, a.tx * b.tx + a.ty * b.ty);
    }
    const keep = Math.abs(turn) < 0.5 ? 0 : turn < 0 ? 1 : -1;
    for (const s of all) {
      let f = 1;
      if (js !== 1) f *= lerp(js, 1, smoothstep(s.len / taperLen));
      if (je !== 1) f *= lerp(je, 1, smoothstep((total - s.len) / taperLen));
      s.off = keep * s.t * (1 - f) / 2;
      s.t *= f;
    }
  }

  const sideOf = (s: Sample, sg: number): Pt => {
    const d = sg * s.t / 2 + (s.off || 0);
    return { x: s.x - s.ty * d, y: s.y + s.tx * d, smooth: s.smooth };
  };
  const Lr: (Pt | null)[][] = runs.map(r => r.map(s => sideOf(s, 1)));
  const Rr: (Pt | null)[][] = runs.map(r => r.map(s => sideOf(s, -1)));
  const curved = cmds.some(c => c[0] === 'C' || c[0] === 'hv' || c[0] === 'vh');
  const skeleton = runs.map(r => r.map(s => ({ x: s.x, y: s.y })));

  // joins between runs
  const limit = o.miter || 5;
  const join = (i: number, j: number) => {
    const ra = runs[i], rb = runs[j], sa = ra[ra.length - 1], sb = rb[0];
    const cross = sa.tx * sb.ty - sa.ty * sb.tx;
    if (Math.abs(cross) < 1e-3) return;
    const lenA = ra[ra.length - 1].len - ra[0].len, lenB = rb[rb.length - 1].len - rb[0].len;
    for (const sides of [Lr, Rr]) {
      const A = sides[i][sides[i].length - 1] as Pt, B = sides[j][0] as Pt;
      const s = ((B.x - A.x) * sb.ty - (B.y - A.y) * sb.tx) / cross;
      const P = { x: A.x + s * sa.tx, y: A.y + s * sa.ty };
      const u = (P.x - B.x) * sb.tx + (P.y - B.y) * sb.ty;
      const outer = s > 0;
      if (outer) {
        if (Math.hypot(P.x - sa.x, P.y - sa.y) > limit * Math.max(sa.t, sb.t) / 2) continue;
      } else if (-s > lenA * 0.95 || u > lenB * 0.95) continue;
      sides[i][sides[i].length - 1] = P;
      sides[j][0] = null;
    }
  };
  for (let i = 0; i + 1 < runs.length; i++) join(i, i + 1);

  // a closed path is a ring: two contours, no ends. Cut corners split it into several runs,
  // so the last run is mitered into the first like any other join.
  const isLoop = closed && Math.hypot(all[0].x - all[all.length - 1].x, all[0].y - all[all.length - 1].y) < 0.5;
  if (isLoop) {
    if (runs.length > 1) join(runs.length - 1, 0);
    const ring = (sides: (Pt | null)[][]) => {
      const pts = sides.flat().filter((p): p is Pt => !!p), a = pts[0], b = pts[pts.length - 1];
      if (pts.length > 1 && Math.hypot(a.x - b.x, a.y - b.y) < 0.5) pts.pop();
      if (runs.length === 1) pts.forEach(p => p.smooth = true);
      return pts;
    };
    return { contours: [ring(Lr), ring(Rr)], loop: true, ends: [], skeleton, curved, thickness: all.map(s => s.t) };
  }

  const L = Lr.flat().filter((p): p is Pt => !!p), R = Rr.flat().filter((p): p is Pt => !!p);

  const first = all[0], last = all[all.length - 1];
  const turn = (a: Sample, b: Sample) => a.tx * b.ty - a.ty * b.tx;
  const lastRun = runs[runs.length - 1], firstRun = runs[0];
  const endTurn = turn(lastRun[Math.max(0, lastRun.length - 5)], last);
  const startTurn = turn(first, firstRun[Math.min(firstRun.length - 1, 4)]);
  const pickA = (tn: number, aIsLeft: boolean, A: Pt[], B: Pt[]) => {
    if (Math.abs(tn) > 1e-3) return (tn > 0) !== aIsLeft; // turning left => outer is right side
    const a = A[A.length - 1], b = B[B.length - 1];
    return a.y >= b.y;
  };
  const de = { x: last.tx, y: last.ty }, ds = { x: -first.tx, y: -first.ty };
  const endX = cap(L, R, last, de, last.t, o.e || 'flat', ctx, pickA(endTurn, true, L, R));
  L.reverse(); R.reverse();
  const startX = cap(R, L, first, ds, first.t, o.s || 'flat', ctx, pickA(startTurn, false, R, L));
  L.reverse(); R.reverse();
  const contour = [...L, ...endX, ...R.slice().reverse(), ...startX];

  const ends: StrokeEnd[] = [
    { x: first.x, y: first.y, dx: ds.x, dy: ds.y, t: first.t, type: o.s || 'flat', which: 's' },
    { x: last.x, y: last.y, dx: de.x, dy: de.y, t: last.t, type: o.e || 'flat', which: 'e' }
  ];
  return { contours: [contour], loop: false, ends, skeleton, curved, thickness: all.map(s => s.t) };
}

type ProfilePt = [number, number, ('smooth' | 'sharp')?];

/* ---- 4. serifs. sides: 'both' | 'a' | 'b' (a = toward -x or -y) */
export function buildSerif(end: Pick<StrokeEnd, 'x' | 'y' | 'dx' | 'dy' | 't' | 'type'>, sides: SerifSides, ctx: PenCtx, scale?: number): Pt[] | null {
  const sf = ctx.serif; if (!sf) return null;
  const horiz = end.type === 'h' ? false : end.type === 'v' ? true : Math.abs(end.dx) > Math.abs(end.dy);
  const out = horiz ? { x: Math.sign(end.dx), y: 0 } : { x: 0, y: Math.sign(end.dy) || -1 };
  const u = horiz ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const along = Math.abs(end.dx * out.x + end.dy * out.y);
  const hw = (end.t / 2) / Math.max(0.35, along);
  const k = scale || 1;
  const Ln = sf.len * k;
  const th = sf.th * (horiz ? 0.9 : 1);
  const ang = sf.angle;
  let prof: ProfilePt[]; // one side, [across, depth] from the tip inwards to the stem
  if (sf.shape === 'wedge') {
    prof = [[hw + Ln, 0], [hw + Ln, -Math.max(4, th * 0.2), 'sharp'], [hw, -(th * 0.6 + Ln * (0.75 + ang * 0.5))]];
  } else {
    const thTip = th * (1 - 0.65 * ang), thStem = th + Ln * ang * 0.35;
    if (sf.shape === 'bracketed') {
      const br = Ln * 0.85;
      const P = [{ x: hw + Ln, y: -thTip }, { x: hw + Ln * 0.3, y: -thTip - (thStem - thTip) * 0.6 },
        { x: hw, y: -thStem - br * 0.25 }, { x: hw, y: -(thStem + br) }];
      prof = [[hw + Ln, 0], [hw + Ln, -thTip]];
      for (let i = 1; i <= 8; i++) { const s = cubicAt(P, i / 8); prof.push([s.x, s.y, i < 8 ? 'smooth' : 'sharp']); }
    } else {
      prof = [[hw + Ln, 0], [hw + Ln, -thTip], [hw, -thStem, 'sharp']];
    }
  }
  const depth = -prof[prof.length - 1][1];
  const pts: Pt[] = [];
  // diagonal strokes: shear the serif so its inner edges follow the stroke
  const dOut = end.dx * out.x + end.dy * out.y, shear = Math.abs(dOut) > 0.3 ? (end.dx * u.x + end.dy * u.y) / dOut : 0;
  const put = (a: number, d: number, flag?: 'smooth' | 'sharp') => {
    a += shear * d * Math.min(1, -d / (th * 1.2 + 1));
    const p: Pt = { x: end.x + u.x * a + out.x * d, y: end.y + u.y * a + out.y * d };
    if (flag === 'smooth') p.smooth = true;
    if (flag === 'sharp') p.sharp = true;
    pts.push(p);
  };
  const wantB = sides !== 'a', wantA = sides !== 'b';
  if (wantB) prof.forEach(q => put(q[0], q[1], q[2])); else { put(hw, 0, 'sharp'); put(hw, -depth, 'sharp'); }
  if (wantA) prof.slice().reverse().forEach(q => put(-q[0], q[1], q[2])); else { put(-hw, -depth, 'sharp'); put(-hw, 0, 'sharp'); }
  return pts;
}
