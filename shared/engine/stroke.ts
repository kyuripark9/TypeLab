/* Stroke expander.
   A glyph is a set of skeleton strokes (centerlines). This module turns a centerline
   into an outline polygon whose thickness follows the pen model: thick where the
   stroke runs vertically, thin where it runs horizontally (scaled by Contrast),
   with styled terminals, mitered joins and optional serifs. */
import { clamp, cubicAt, lerp, lerpP, quarter, smoothstep, subCubic } from './geom';
import type { Cmd, EndType, PenCtx, Pt, SerifSides, SerifSpec, StrokeEnd, StrokeOpts, StrokeWeight, TermSpec, TurnR } from './types';

const CURVE_N = 16;

interface Sample {
  x: number; y: number; tx: number; ty: number;
  w: number | null; mask: number; smooth: boolean;
  len: number; t: number;
  /** sideways shift of the outline (toward the left of travel), for one-sided thinning */
  off?: number;
}
type Dir = { x: number; y: number };
/** A run of samples with a continuous tangent, and the radii of the turn it starts with, if given. */
type Run = Sample[] & { turn?: TurnR };

/** The radius a turn's inside rounds by at least, for its outside to round by `o`: rounding the
    outside further than the inside thins the stroke across the corner, and the inside comes along
    once it would be under half a stroke there. `t` is the stroke's thickness, `cos` the cosine of
    the angle it turns through. */
export function innerFloor(o: number, t: number, cos: number) {
  const s = Math.sqrt(Math.max(1e-6, (1 + cos) / 2)), k = 1 / s - 1;
  return k < 1e-3 ? 0 : Math.max(0, o - (t / s - t / 2) / k);
}

/** The tension of a quarter turn running (dx, dy): organic curves give the diagonal quadrants
    unequal tension, like a hand-drawn bowl, fuller on one diagonal and pinched on the other. */
export const organicK = (k: number, org: number, dx: number, dy: number) =>
  clamp(k * (1 + (dx * dy < 0 ? ORG_FULL : -ORG_PINCH) * org), 0.3, 0.97);
const ORG_FULL = 0.4, ORG_PINCH = 0.22;

const wNum = (w: StrokeWeight) => (w === 'thin' ? 0 : w === 'thick' ? 1 : w);
/** Terminals as drawn when the design gives no finer shape. */
const TERM: TermSpec = { form: '', flare: 1, depth: 0.3, size: 0.8, clip: 0.4, round: 0.5, point: 0.95, lean: 0, slope: 0.6, tilt: 0, tip: 0.42, taper: 3 };

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
  const runs: Run[] = [];
  let run: Run | null = null, cur: Dir = { x: 0, y: 0 }, closed = false;
  const push = (samples: Sample[], turn?: TurnR) => {
    if (!samples.length) return;
    const first = samples[0];
    if (run && run.length) {
      const last = run[run.length - 1];
      if (last.tx * first.tx + last.ty * first.ty > 0.9994) { samples = samples.slice(1); last.smooth = true; }
      else { run = Object.assign([], { turn }); runs.push(run); }
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
      // under a pinch a line is sampled finely, and exactly where it crosses the pinch's line, so its point comes out sharp
      const pc = ctx.pinch, n = pc ? Math.max(8, Math.ceil(l / (pc.reach / 12))) : subdivLines ? 8 : 1, us: number[] = [];
      for (let i = 0; i <= n; i++) us.push(i / n);
      const cross = pc && Math.abs(dy) > 1e-6 ? (pc.y - cur.y) / dy : -1;
      if (cross > 0 && cross < 1) us.push(cross), us.sort((a, b) => a - b);
      const out: Sample[] = us.map((u, i) => ({ x: cur.x + dx * u, y: cur.y + dy * u, tx: dx / l, ty: dy / l,
        w: o.w != null ? wNum(o.w) : null, mask: 1, smooth: i > 0 && i < us.length - 1, len: 0, t: 0 }));
      push(out, o.turn); cur = to; continue;
    }
    let P: Dir[], o;
    if (op === 'C') {
      P = [cur, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }]; o = c[7] || {};
    } else { // 'hv' | 'vh'
      o = c[3] || {};
      const dx = c[1] - cur.x, dy = c[2] - cur.y;
      P = quarter(cur.x, cur.y, c[1], c[2], op, organicK(ctx.k, ctx.org, dx, dy));
    }
    const u0 = o.u0 || 0, u1 = o.u1 == null ? 1 : o.u1;
    if (ctx.chamfer) {
      chamferSamples(P, u0, u1, ctx.chamfer, o.w != null ? wNum(o.w) : null, ctx.thick * 0.9).forEach((r, k) => push(r, k ? undefined : o.turn));
      cur = P[3]; continue;
    }
    P = subCubic(P, u0, u1);
    // a free cubic can turn tightly near its ends (the spine of a squared S): twice the samples
    const out: Sample[] = [], n = op === 'C' ? CURVE_N * 2 : CURVE_N;
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = cubicAt(P, u);
      out.push({ x: p.x, y: p.y, tx: p.tx, ty: p.ty, w: o.w != null ? wNum(o.w) : null,
        mask: o.even ? 1 : smoothstep(Math.min(u, 1 - u) * 3.2), smooth: i > 0 && i < n, len: 0, t: 0 });
    }
    push(out, o.turn); cur = P[3];
  }
  return { runs, closed };
}

/** How much of its weight a stroke keeps at height y under a pinch (see PenCtx). A hairline at the
    line itself, so the two sides never cross. */
export const pinchAt = (pc: NonNullable<PenCtx['pinch']>, y: number) =>
  Math.max(0.012, 1 - pc.amount * (1 - Math.min(1, Math.abs(y - pc.y) / pc.reach)));

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
  const cs = Math.cos(tilt), sn = Math.sin(tilt);
  cutAt(side, p, d, { x: o.x * cs - o.y * sn, y: o.x * sn + o.y * cs }, t);
}
/* Cut one side of a stroke end off along the line through p square to `out`. */
function cutAt(side: Pt[], p: Dir, d: Dir, out: Dir, t: number) {
  if (side.length < 2) return;
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

/* A round drop on a stroke end: a ball whose back meets the stroke's edges, or a droplet whose
   sides run straight off the edges onto it. The stroke is drawn shorter by dropBack, so the drop
   reaches only a little past where it would have ended. */
const dropR = (T: TermSpec, t: number) => Math.max(T.size * t, t * 0.525);
const dropK = (T: TermSpec, t: number) => { const R = dropR(T, t); return Math.sqrt(R * R - t * t / 4) + (T.form === 'ball' ? 0 : 0.5 * R); };
const dropBack = (T: TermSpec, t: number) => dropK(T, t) + (T.form === 'ball' ? 0.15 : 0.3) * dropR(T, t);
/* The drop's outline on an end at p heading d, from a (A's edge) round to b (B's). */
function drop(a: Pt, b: Pt, p: Dir, d: Dir, t: number, T: TermSpec): Pt[] {
  const R = dropR(T, t), k = dropK(T, t), ball = T.form === 'ball', c = { x: p.x + d.x * k, y: p.y + d.y * k };
  // the angle round the drop (0 straight ahead, positive toward a) where each edge meets it
  const meet = (e: Pt, sg: number) => {
    const al = (e.x - c.x) * d.x + (e.y - c.y) * d.y, lat = (e.x - c.x) * -d.y + (e.y - c.y) * d.x, D = Math.hypot(al, lat);
    return ball || D <= R ? Math.atan2(lat, al) : Math.atan2(lat, al) - sg * Math.acos(R / D);
  };
  const fa = meet(a, 1), fb = meet(b, -1), n = 20, out: Pt[] = [];
  a.sharp = b.sharp = true;
  for (let i = ball ? 1 : 0; i <= (ball ? n - 1 : n); i++) {
    const f = lerp(fa, fb, i / n), cs = Math.cos(f), sn = Math.sin(f);
    out.push({ x: c.x + R * (cs * d.x - sn * d.y), y: c.y + R * (cs * d.y + sn * d.x), smooth: i > 0 && i < n });
  }
  return out;
}

/* Shorten a stroke's runs to end `back` before the end (or start that far in, `atStart`), with a
   sample placed exactly there. A run left empty goes altogether. */
function trimRuns(runs: Sample[][], total: number, back: number, atStart: boolean) {
  const cut = atStart ? back : total - back, past = (s: Sample) => atStart ? s.len < cut : s.len > cut;
  while (runs.length) {
    const r = atStart ? runs[0] : runs[runs.length - 1];
    while (r.length && past(atStart ? r[0] : r[r.length - 1])) {
      const gone = atStart ? r.shift()! : r.pop()!, near = r.length ? (atStart ? r[0] : r[r.length - 1]) : null;
      if (near && !past(near)) {
        const u = (cut - gone.len) / (near.len - gone.len || 1), tx = lerp(gone.tx, near.tx, u), ty = lerp(gone.ty, near.ty, u), l = Math.hypot(tx, ty) || 1;
        const at: Sample = { ...near, x: lerp(gone.x, near.x, u), y: lerp(gone.y, near.y, u), tx: tx / l, ty: ty / l, t: lerp(gone.t, near.t, u),
          off: lerp(gone.off || 0, near.off || 0, u), len: cut, smooth: false };
        if (atStart) r.unshift(at); else r.push(at);
        return;
      }
    }
    if (r.length > 1) return;
    if (atStart) runs.shift(); else runs.pop();
  }
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
    case 'flat': {
      if (T.form !== 'scooped') return [];
      // hollowed: the end curves back into the stroke between its two corners
      const out: Pt[] = [], n = 10;
      for (let i = 1; i < n; i++) {
        const u = i / n, q = lerpP(a, b, u), k = T.depth * t * Math.sin(Math.PI * u);
        out.push({ x: q.x - d.x * k, y: q.y - d.y * k, smooth: true });
      }
      a.sharp = b.sharp = true;
      return out;
    }
    case 'round':
      if (T.form === 'droplet' || T.form === 'ball') return drop(a, b, p, d, t, T);
      a.r = b.r = t * T.round + 0.5; return [];
    case 'sharp': {
      // leaning toward the outer edge: A lies to the left of d
      const lean = T.lean * t * (outerIsA ? 1 : -1);
      const tip = { x: p.x + d.x * t * T.point - d.y * lean, y: p.y + d.y * t * T.point + d.x * lean };
      if (T.form !== 'clipped') return [{ ...tip, sharp: true }];
      // the point with its tip cut off straight across
      return [{ ...lerpP(a, tip, 1 - T.clip), sharp: true }, { ...lerpP(b, tip, 1 - T.clip), sharp: true }];
    }
    case 'angled': {
      // the outer edge runs on past the inner one, or the inner past the outer
      const side = outerIsA !== (T.form === 'inner') ? A : B, q = side[side.length - 1];
      side[side.length - 1] = { x: q.x + d.x * t * T.slope, y: q.y + d.y * t * T.slope };
      return [];
    }
    case 'cut': {
      const axis = Math.abs(d.x) > Math.abs(d.y) ? 'v' : 'h';
      cutSide(A, p, d, axis, t, T.tilt); cutSide(B, p, d, axis, t, T.tilt);
      if (T.form !== 'notched') return [];
      // a V cut back into the middle of the end, like a swallowtail
      const ea = A[A.length - 1], eb = B[B.length - 1], m = lerpP(ea, eb, 0.5), k = T.depth * t * 1.3;
      ea.sharp = eb.sharp = true;
      return [{ x: m.x - d.x * k, y: m.y - d.y * k, sharp: true }];
    }
    default: return [];
  }
}

/** Whether an end of this type is drawn square across, with two corners of its own to round. */
function squareEnd(type: EndType, ctx: PenCtx) {
  if (type === 'flat' || type === 'h' || type === 'v') return true;
  if (type !== 'term') return false;
  const form = (ctx.term ?? TERM).form;
  return (ctx.terminal === 'flat' && form !== 'scooped') || ctx.terminal === 'angled' || (ctx.terminal === 'cut' && form !== 'notched');
}

export interface Expanded {
  contours: Pt[][];
  loop: boolean;
  ends: StrokeEnd[];
  /** the two corners of each end drawn square across (flat or cut, not rounded, pointed or tapered):
      the outline's own points, 'l' left of the way out of the stroke and 'r' right of it */
  endCorners: { which: 's' | 'e'; side: 'l' | 'r'; pt: Pt }[];
  skeleton: Pt[][];
  curved: boolean;
  thickness: number[];
}

/* ---- 3. expand one stroke */
export function expandStroke(cmds: Cmd[], o: StrokeOpts, ctx: PenCtx): Expanded | null {
  const sc = o.scale || 1;
  // Horizontals can outweigh Verticals, so the thin stroke may be the heavier one
  const thick = ctx.thick * sc, thin = ctx.thin * sc;
  let ws = o.ws == null ? 1 : o.ws, we = o.we == null ? 1 : o.we;
  const T = ctx.term ?? TERM, tapers = ctx.terminal === 'tapered';
  if (tapers) {
    if (o.s === 'term') ws = Math.min(ws, T.tip);
    if (o.e === 'term') we = Math.min(we, T.tip);
  } else if (ctx.terminal === 'flat' && T.form === 'flared') {
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
  // the side a brush taper keeps: the outside of a curve, the upper side of a straight stroke
  const turnOf = () => {
    let turn = 0;
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1], b = all[i];
      turn += Math.atan2(a.tx * b.ty - a.ty * b.tx, a.tx * b.tx + a.ty * b.ty);
    }
    return turn;
  };
  const brush = tapers && T.form === 'brush' ? (tn => Math.abs(tn) < 0.5 ? Math.sign(all[0].tx) || 1 : tn < 0 ? 1 : -1)(turnOf()) : 0;
  // explicit weights name the thick or thin stroke of a pair, so reverse contrast swaps them
  const rev = (w: number) => ctx.reverse ? lerp(w, 1 - w, ctx.reverse) : w;
  const pathW = o.w == null ? null : rev(wNum(o.w));
  for (const s of all) {
    let t = autoThickness(s.tx, s.ty, ctx, thick, thin);
    if (pathW != null) t = lerp(thin, thick, pathW);
    if (s.w != null) t = lerp(t, lerp(thin, thick, rev(s.w)), s.mask);
    let f = 1;
    if (ws !== 1) f *= lerp(ws, 1, smoothstep(s.len / lenS));
    if (we !== 1) f *= lerp(we, 1, smoothstep((total - s.len) / lenE));
    // a brush lifts off the inside of its stroke and keeps the outer edge running on
    if (brush && f < 1) s.off = brush * t * (1 - f) / 2;
    t *= f;
    // a pinch draws every stroke in toward its line, straight-sided like two wedges tip to tip
    if (ctx.pinch) t *= pinchAt(ctx.pinch, s.y);
    // a hand-held pen never presses evenly
    if (ctx.wobble) t *= 1 + ctx.wobble * 0.22 * Math.sin(s.len / (thick * 1.8 + 60) + (ctx.seed || 0));
    s.t = t;
  }
  if (js !== 1 || je !== 1) {
    // a curved stroke keeps its outer edge and thins only on the side of the counter it
    // wraps, like an ink trap; a straight one thins evenly on both sides
    const turn = turnOf(), keep = Math.abs(turn) < 0.5 ? 0 : turn < 0 ? 1 : -1;
    for (const s of all) {
      let f = 1;
      if (js !== 1) f *= lerp(js, 1, smoothstep(s.len / taperLen));
      if (je !== 1) f *= lerp(je, 1, smoothstep((total - s.len) / taperLen));
      s.off = (s.off || 0) + keep * s.t * (1 - f) / 2;
      s.t *= f;
    }
  }

  // the skeleton is the whole stroke, even where a drop covers its end
  const skeleton = runs.map(r => r.map(s => ({ x: s.x, y: s.y })));
  // a drop sits on the end it finishes: draw the stroke that much shorter under it
  if (ctx.terminal === 'round' && (T.form === 'droplet' || T.form === 'ball')) {
    const s0 = all[0], s1 = all[all.length - 1];
    if (o.e === 'term') trimRuns(runs, total, Math.min(dropBack(T, s1.t), total * 0.4), false);
    if (o.s === 'term' && runs.length) trimRuns(runs, total, Math.min(dropBack(T, s0.t), total * 0.4), true);
    if (!runs.length) return null;
  }

  const sideOf = (s: Sample, sg: number): Pt => {
    const d = sg * s.t / 2 + (s.off || 0);
    return { x: s.x - s.ty * d, y: s.y + s.tx * d, smooth: s.smooth };
  };
  const Lr: (Pt | null)[][] = runs.map(r => r.map(s => sideOf(s, 1)));
  const Rr: (Pt | null)[][] = runs.map(r => r.map(s => sideOf(s, -1)));
  const curved = cmds.some(c => c[0] === 'C' || c[0] === 'hv' || c[0] === 'vh');

  // joins between runs. A turn given radii always mitres, and rounds its outside and inside by them
  const limit = o.miter || 5;
  // a closed path is a ring: two contours, no ends
  const isLoop = closed && Math.hypot(all[0].x - all[all.length - 1].x, all[0].y - all[all.length - 1].y) < 0.5;
  const runLen = (r: Sample[]) => r[r.length - 1].len - r[0].len;
  /** The length of run k and the runs carrying straight on from it, back (-1) or forward (+1),
      round a ring, and how much of it the turn at its far end takes up on its centerline: where the
      side ends the stroke, a stroke's width, so the round doesn't reach into the stroke it starts from. */
  const straight = (k: number, dir: -1 | 1) => {
    const N = runs.length;
    let n = runLen(runs[k]), a = k;
    for (let step = 1; step < N; step++) {
      const b = isLoop ? (a + dir + N) % N : a + dir;
      if (b < 0 || b >= N) return { n, far: o.endRoom != null ? n * (0.95 - o.endRoom) : runs[a][dir > 0 ? runs[a].length - 1 : 0].t };
      const [x, y] = dir > 0 ? [a, b] : [b, a], p = runs[x][runs[x].length - 1], q = runs[y][0], cos = p.tx * q.tx + p.ty * q.ty, far = (runs[y] as Run).turn;
      if (far) return { n, far: Math.max(0, far.o - (p.t + q.t) / 4) * Math.sqrt(Math.max(0, (1 - cos) / (1 + cos))) };
      if (cos < 0.999) break;
      n += runLen(runs[b]);
      a = b;
    }
    return { n, far: 0 };
  };
  /** How far along a side of length n a turn may round, with `far` taken by the turn at its other
      end: whatever that one leaves, or half the side when both want more. */
  const room = ({ n, far }: { n: number; far: number }) => Math.max(n / 2, n * 0.95 - far);
  const join = (i: number, j: number) => {
    const ra = runs[i], rb = runs[j], sa = ra[ra.length - 1], sb = rb[0], turn = (rb as Run).turn;
    const cross = sa.tx * sb.ty - sa.ty * sb.tx;
    if (Math.abs(cross) < 1e-3) return;
    const lenA = ra[ra.length - 1].len - ra[0].len, lenB = rb[rb.length - 1].len - rb[0].len;
    // a turn rounds on its centerline as far along its sides as the turns at their other ends leave
    // it: rounded further, its outside and inside ease off together, keeping the stroke across the
    // corner as thick
    let ro = 0, ri = 0;
    if (turn) {
      const cos = sa.tx * sb.tx + sa.ty * sb.ty, t = (sa.t + sb.t) / 2, tanH = Math.sqrt(Math.max(0, (1 - cos) / (1 + cos)));
      ro = Math.min(turn.o, Math.min(room(straight(i, -1)), room(straight(j, 1))) / Math.max(tanH, 1e-3) + t / 2);
      ri = Math.max(turn.i - (turn.o - ro), innerFloor(ro, t, cos));
    }
    for (const sides of [Lr, Rr]) {
      const A = sides[i][sides[i].length - 1] as Pt, B = sides[j][0] as Pt;
      const s = ((B.x - A.x) * sb.ty - (B.y - A.y) * sb.tx) / cross;
      const P: Pt = { x: A.x + s * sa.tx, y: A.y + s * sa.ty };
      const u = (P.x - B.x) * sb.tx + (P.y - B.y) * sb.ty;
      const outer = s > 0;
      if (outer) {
        if (!turn && Math.hypot(P.x - sa.x, P.y - sa.y) > limit * Math.max(sa.t, sb.t) / 2) continue;
      } else if (-s > lenA * 0.95 || u > lenB * 0.95) continue;
      // a stepped turn has a square step cut out of its outside, and its notch rounds like any corner
      // (no deeper than 0.85 of the thinner side, so the two sides stay joined across the step)
      if (turn && outer && turn.step) P.step = Math.min(turn.step, 0.85 * Math.min(sa.t, sb.t));
      else if (turn) { const r = outer ? ro : ri; if (r > 0) P.r = r; else P.sharp = true; }
      sides[i][sides[i].length - 1] = P;
      sides[j][0] = null;
    }
  };
  for (let i = 0; i + 1 < runs.length; i++) join(i, i + 1);

  // a ring's cut corners split it into several runs, so the last run is mitered into the first
  // like any other join
  if (isLoop) {
    if (runs.length > 1) join(runs.length - 1, 0);
    const ring = (sides: (Pt | null)[][]) => {
      const pts = sides.flat().filter((p): p is Pt => !!p), a = pts[0], b = pts[pts.length - 1];
      if (pts.length > 1 && Math.hypot(a.x - b.x, a.y - b.y) < 0.5) pts.pop();
      if (runs.length === 1) pts.forEach(p => p.smooth = true);
      return pts;
    };
    return { contours: [ring(Lr), ring(Rr)], loop: true, ends: [], endCorners: [], skeleton, curved, thickness: all.map(s => s.t) };
  }

  const L = Lr.flat().filter((p): p is Pt => !!p), R = Rr.flat().filter((p): p is Pt => !!p);

  const lastRun = runs[runs.length - 1], firstRun = runs[0];
  // the stroke's own ends, and where its outline ends (short of them under a drop)
  const s0 = all[0], s1 = all[all.length - 1], first = firstRun[0], last = lastRun[lastRun.length - 1];
  const turn = (a: Sample, b: Sample) => a.tx * b.ty - a.ty * b.tx;
  const endTurn = turn(lastRun[Math.max(0, lastRun.length - 5)], last);
  const startTurn = turn(first, firstRun[Math.min(firstRun.length - 1, 4)]);
  const pickA = (tn: number, aIsLeft: boolean, A: Pt[], B: Pt[]) => {
    if (Math.abs(tn) > 1e-3) return (tn > 0) !== aIsLeft; // turning left => outer is right side
    const a = A[A.length - 1], b = B[B.length - 1];
    return a.y >= b.y;
  };
  const de = { x: last.tx, y: last.ty }, ds = { x: -first.tx, y: -first.ty }, endCorners: Expanded['endCorners'] = [];
  const endX = cap(L, R, last, de, last.t, o.e || 'flat', ctx, pickA(endTurn, true, L, R));
  if (squareEnd(o.e || 'flat', ctx)) endCorners.push({ which: 'e', side: 'l', pt: L[L.length - 1] }, { which: 'e', side: 'r', pt: R[R.length - 1] });
  L.reverse(); R.reverse();
  const startX = cap(R, L, first, ds, first.t, o.s || 'flat', ctx, pickA(startTurn, false, R, L));
  if (squareEnd(o.s || 'flat', ctx)) endCorners.push({ which: 's', side: 'l', pt: R[R.length - 1] }, { which: 's', side: 'r', pt: L[L.length - 1] });
  L.reverse(); R.reverse();
  const contour = [...L, ...endX, ...R.slice().reverse(), ...startX];

  const ends: StrokeEnd[] = [
    { x: s0.x, y: s0.y, dx: -s0.tx, dy: -s0.ty, t: s0.t, type: o.s || 'flat', which: 's' },
    { x: s1.x, y: s1.y, dx: s1.tx, dy: s1.ty, t: s1.t, type: o.e || 'flat', which: 'e' }
  ];
  return { contours: [contour], loop: false, ends, endCorners, skeleton, curved, thickness: all.map(s => s.t) };
}

type ProfilePt = [number, number, ('smooth' | 'sharp' | number)?];
type SerifEnd = Pick<StrokeEnd, 'x' | 'y' | 'dx' | 'dy' | 't' | 'type'>;

/** Whether a stroke end runs level, so that its serif stands upright across it. */
const levelEnd = (end: Pick<StrokeEnd, 'dx' | 'dy' | 'type'>) => (end.type === 'h' ? false : end.type === 'v' ? true : Math.abs(end.dx) > Math.abs(end.dy));
/** Where a serif sits: on the end of an arm (a level stroke), on top of a stroke, or at its foot. */
export type SerifPlace = 'arm' | 'top' | 'foot';
export const serifPlace = (end: Pick<StrokeEnd, 'dx' | 'dy' | 'type'>): SerifPlace => (levelEnd(end) ? 'arm' : end.dy > 0 ? 'top' : 'foot');
/** How high the base of a cupped serif arches: up to three quarters of its thickness, and a third of its length. */
export const serifCup = (sf: SerifSpec) => (sf.cup ?? 0) * Math.min(sf.th * 0.75, sf.len * 0.3);

/** The sides of a stem's end its serif is drawn on: the ones the letter gives it, less those the design leaves
    off (`keep`, see SERIF_SIDES in params). `inward` are the sides that face into the letter. */
export function serifSides(given: SerifSides, keep: string | undefined, inward: SerifSides): SerifSides {
  const on = (s: 'a' | 'b') => (given === 'both' || given === s) && (keep === 'left' ? s === 'a' : keep === 'right' ? s === 'b'
    : keep === 'inside' || keep === 'outside' ? (keep === 'inside') === (inward === 'both' || inward === s) : true);
  const a = on('a'), b = on('b');
  return a && b ? 'both' : a ? 'a' : b ? 'b' : null;
}

/* ---- 4. serifs. sides: 'both' | 'a' | 'b' (a = toward -x or -y). `cup` is how far short of its line the
   end was drawn for a cupped serif (see serifCup): the serif's tips reach on to the line, and between them
   its base arches up to the end. `inward` are the sides of a stem's end that face into the letter, which
   take the inner serifs' shape where the design gives them one. */
export function buildSerif(end: SerifEnd, sides: SerifSides, ctx: PenCtx, scale?: number, cup = 0, inward: SerifSides = null): Pt[] | null {
  const sf = ctx.serif; if (!sf) return null;
  const horiz = levelEnd(end);
  const out = horiz ? { x: Math.sign(end.dx), y: 0 } : { x: 0, y: Math.sign(end.dy) || -1 };
  const u = horiz ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const along = Math.abs(end.dx * out.x + end.dy * out.y);
  const hw = (end.t / 2) / Math.max(0.35, along);
  const Ln = sf.len * (scale || 1) * (horiz ? sf.arms ?? 1 : out.y > 0 ? sf.tops ?? 1 : 1);
  const th = sf.th * (horiz ? 0.9 : 1);
  const ang = sf.angle, tip = sf.tip ?? 'square';
  // one side, L long, as [across, depth] from the tip inwards to the stem
  const side = (L: number, shape: string, th: number): ProfilePt[] => {
    const wedge = shape === 'wedge';
    // the tip: its foot on the line, then its top. A pointed one has no top, and stays sharp
    const tt = wedge ? Math.max(4, th * 0.2) : th * (1 - 0.65 * ang);
    const foot: ProfilePt = [hw + L, 0], top: ProfilePt = wedge ? [hw + L, -tt, 'sharp'] : [hw + L, -tt];
    if (tip === 'round') foot[2] = top[2] = tt * (sf.tipRound ?? 0.5);
    else if (tip === 'pointed') { foot[2] = 'sharp'; top[1] = 0; }
    else if (tip === 'angled') {
      const lean = clamp(sf.tipSlant ?? 0, -1, 1) * Math.min(Math.max(tt * 1.5, L * 0.2), L * 0.7);
      if (lean > 0) top[0] -= lean; else foot[0] += lean;
    }
    const tipPts = tip === 'pointed' ? [foot] : [foot, top];
    if (wedge) return [...tipPts, [hw, -(th * 0.6 + L * (0.75 + ang * 0.5))]];
    const thTip = -top[1], thStem = th + L * ang * 0.35;
    if (shape !== 'bracketed') return [...tipPts, [hw, -thStem, 'sharp']];
    const br = L * (sf.bracket ?? 0.85);
    const P = [{ x: top[0], y: -thTip }, { x: hw + L * 0.3, y: -thTip - (thStem - thTip) * 0.6 },
      { x: hw, y: -thStem - br * 0.25 }, { x: hw, y: -(thStem + br) }];
    const prof = tipPts.slice();
    for (let i = 1; i <= 8; i++) { const c = cubicAt(P, i / 8); prof.push([c.x, c.y, i < 8 ? 'smooth' : 'sharp']); }
    return prof;
  };
  // serifs on stems can reach further one way than the other
  const bal = horiz ? 0 : 0.6 * clamp(sf.balance ?? 0, -1, 1);
  const wantB = sides !== 'a', wantA = sides !== 'b';
  const inner = horiz ? null : sf.inner;
  const half = (s: 'a' | 'b', L: number) => (inner && (inward === 'both' || inward === s) ? side(L * inner.len, inner.shape, inner.th) : side(L, sf.shape, th));
  const profB = half('b', Ln * (1 + bal)), profA = half('a', Ln * (1 - bal));
  const depth = (prof: ProfilePt[]) => -prof[prof.length - 1][1];
  const pts: Pt[] = [];
  // diagonal strokes: shear the serif so its inner edges follow the stroke
  const dOut = end.dx * out.x + end.dy * out.y, shear = Math.abs(dOut) > 0.3 ? (end.dx * u.x + end.dy * u.y) / dOut : 0;
  const put = (a: number, d: number, flag?: ProfilePt[2]) => {
    a += shear * (cup + d * Math.min(1, -d / (th * 1.2 + 1)));
    const p: Pt = { x: end.x + u.x * a + out.x * (d + cup), y: end.y + u.y * a + out.y * (d + cup) };
    if (flag === 'smooth') p.smooth = true;
    else if (flag === 'sharp') p.sharp = true;
    else if (flag != null) p.r = flag;
    pts.push(p);
  };
  if (wantB) profB.forEach(q => put(q[0], q[1], q[2])); else { put(hw, 0, 'sharp'); put(hw, -depth(profA), 'sharp'); }
  if (wantA) profA.slice().reverse().forEach(q => put(-q[0], q[1], q[2])); else { put(-hw, -depth(profB), 'sharp'); put(-hw, 0, 'sharp'); }
  if (cup > 0) {
    // the base arches from one foot to the other, never through more than most of the serif above it
    const a0 = wantA ? -profA[0][0] : -hw, a1 = wantB ? profB[0][0] : hw;
    const above = (prof: ProfilePt[], a: number) => {
      for (let i = 0; i + 1 < prof.length; i++) {
        const [xa, da] = prof[i], [xb, db] = prof[i + 1];
        if (a <= Math.max(xa, xb) && a >= Math.min(xa, xb) && xa !== xb) return -lerp(da, db, (a - xa) / (xb - xa));
      }
      return Infinity;
    };
    const N = 14;
    for (let i = 1; i < N; i++) {
      const t = i / N, a = lerp(a0, a1, t), room = a > hw ? (wantB ? above(profB, a) : 0) : a < -hw ? (wantA ? above(profA, -a) : 0) : Infinity;
      put(a, -Math.min(cup * 4 * t * (1 - t), room * 0.7), 'smooth');
    }
  }
  return pts;
}
