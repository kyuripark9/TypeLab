/* Editing a drawn letter's outline (see shared/engine/outline): the pure operations behind the pen
   tools. Each takes contours and returns new ones, leaving the old untouched for undo. Positions are
   font units, y up, rounded to whole units. Besides points: corners rounded where they are (live
   corners), told apart as pointing out of the ink or into it; overlapping shapes merged, cut out of
   each other, or broken apart with a gap where one runs over another; and picked points scaled, turned
   or flipped as one, and shapes made thicker or thinner, their points kept. */
import {
  CIRCLE_K, combine, cornerRoom, cornerTurn, cutOut, drawnCmds, fitOutline, hasIn, hasOut, segment, shape as inkShape, signedArea, unite,
  type Cmd, type CornerKind, type Drawn, type Glyph, type Node
} from '../../shared/engine';

type P = { x: number; y: number };
/** An anchor point by contour and index. */
export interface Ref { c: number; i: number }
export const refKey = (r: Ref) => `${r.c}:${r.i}`;
export const keyRef = (k: string): Ref => { const [c, i] = k.split(':').map(Number); return { c, i }; };

const R = Math.round;
const copy = (cs: Node[][]) => cs.map(c => c.map(n => ({ ...n })));

function bez(B: P[], t: number): P {
  const u = 1 - t;
  return {
    x: u * u * u * B[0].x + 3 * u * u * t * B[1].x + 3 * u * t * t * B[2].x + t * t * t * B[3].x,
    y: u * u * u * B[0].y + 3 * u * u * t * B[1].y + 3 * u * t * t * B[2].y + t * t * t * B[3].y
  };
}

/** Move anchor points, their handles with them, by (dx, dy). */
export function moveAnchors(cs: Node[][], refs: Ref[], dx: number, dy: number): Node[][] {
  const out = copy(cs);
  for (const { c, i } of refs) {
    const n = out[c]?.[i];
    if (!n) continue;
    n.x = R(n.x + dx); n.y = R(n.y + dy);
    if (hasIn(n)) { n.ix = R(n.ix! + dx); n.iy = R(n.iy! + dy); }
    if (hasOut(n)) { n.ox = R(n.ox! + dx); n.oy = R(n.oy! + dy); }
  }
  return out;
}

/** Put one handle of an anchor at `p`. A smooth point turns its other handle to stay in line (keeping
    its length) unless `free`, which makes the point a corner. */
export function setHandle(cs: Node[][], { c, i }: Ref, side: 'i' | 'o', p: P, free = false): Node[][] {
  const out = copy(cs), n = out[c][i];
  if (side === 'i') { n.ix = R(p.x); n.iy = R(p.y); } else { n.ox = R(p.x); n.oy = R(p.y); }
  if (free) delete n.s;
  else if (n.s) {
    const o = side === 'i' ? 'o' : 'i', has = o === 'o' ? hasOut(n) : hasIn(n);
    if (has) {
      const ox = o === 'o' ? n.ox! : n.ix!, oy = o === 'o' ? n.oy! : n.iy!;
      const l = Math.hypot(ox - n.x, oy - n.y), dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const x = R(n.x + dx / d * l), y = R(n.y + dy / d * l);
        if (o === 'o') { n.ox = x; n.oy = y; } else { n.ix = x; n.iy = y; }
      }
    }
  }
  return out;
}

/** Pull symmetric handles out of an anchor: the out handle to `p`, the in handle opposite. */
export function pullHandles(cs: Node[][], { c, i }: Ref, p: P): Node[][] {
  const out = copy(cs), n = out[c][i];
  if (Math.hypot(p.x - n.x, p.y - n.y) < 1) { delete n.ix; delete n.iy; delete n.ox; delete n.oy; delete n.s; return out; }
  n.ox = R(p.x); n.oy = R(p.y); n.ix = R(2 * n.x - p.x); n.iy = R(2 * n.y - p.y); n.s = 1;
  return out;
}

/** A corner point with handles loses them; a point without becomes smooth, its handles along the line
    from the point before to the one after, a third of the way to each. */
export function toggleSmooth(cs: Node[][], { c, i }: Ref): Node[][] {
  const out = copy(cs), con = out[c], n = con[i];
  if (hasIn(n) || hasOut(n)) { delete n.ix; delete n.iy; delete n.ox; delete n.oy; delete n.s; return out; }
  if (con.length < 2) return out;
  const a = con[(i + con.length - 1) % con.length], b = con[(i + 1) % con.length];
  let tx = b.x - a.x, ty = b.y - a.y;
  const l = Math.hypot(tx, ty);
  if (l < 1) return out;
  tx /= l; ty /= l;
  const li = Math.hypot(n.x - a.x, n.y - a.y) / 3, lo = Math.hypot(b.x - n.x, b.y - n.y) / 3;
  n.ix = R(n.x - tx * li); n.iy = R(n.y - ty * li); n.ox = R(n.x + tx * lo); n.oy = R(n.y + ty * lo); n.s = 1;
  return out;
}

/** Make anchors smooth (true) or corners (false), keeping their handles where they are. */
export function setSmooth(cs: Node[][], refs: Ref[], smooth: boolean): Node[][] {
  let out = copy(cs);
  for (const r of refs) {
    const n = out[r.c]?.[r.i];
    if (!n) continue;
    if (!smooth) { delete n.s; continue; }
    if (!hasIn(n) && !hasOut(n)) { out = toggleSmooth(out, r); continue; }
    n.s = 1;
    // line the handles up: each keeps its length, along the average of their directions
    if (hasIn(n) && hasOut(n)) {
      const ux = n.x - n.ix!, uy = n.y - n.iy!, vx = n.ox! - n.x, vy = n.oy! - n.y;
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      let tx = ux / (lu || 1) + vx / (lv || 1), ty = uy / (lu || 1) + vy / (lv || 1);
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      n.ix = R(n.x - tx * lu); n.iy = R(n.y - ty * lu); n.ox = R(n.x + tx * lv); n.oy = R(n.y + ty * lv);
    }
  }
  return out;
}

/** Split the segment from anchor i to the next at t, keeping its shape; the new point is at i + 1. */
export function splitSegment(cs: Node[][], c: number, i: number, t: number): Node[][] {
  const out = copy(cs), con = out[c], j = (i + 1) % con.length, a = con[i], b = con[j], s = segment(a, b);
  let m: Node;
  // a straight segment is measured as the cubic [a, a, b, b] (nearestSegment), so t is along that, not linear
  if (!s) { const q = bez([a, a, b, b], t); m = { x: R(q.x), y: R(q.y) }; }
  else {
    const L = (p: P, q: P): P => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    const p01 = L(s[0], s[1]), p12 = L(s[1], s[2]), p23 = L(s[2], s[3]), p012 = L(p01, p12), p123 = L(p12, p23), mid = L(p012, p123);
    if (hasOut(a)) { a.ox = R(p01.x); a.oy = R(p01.y); }
    if (hasIn(b)) { b.ix = R(p23.x); b.iy = R(p23.y); }
    m = { x: R(mid.x), y: R(mid.y), ix: R(p012.x), iy: R(p012.y), ox: R(p123.x), oy: R(p123.y), s: 1 };
  }
  con.splice(i + 1, 0, m);
  return out;
}

/** The segment nearest `p`: its contour, the anchor it starts at, where along it (t) and how far off. */
export function nearestSegment(cs: Node[][], p: P): { c: number; i: number; t: number; d: number } | null {
  let best: { c: number; i: number; t: number; d: number } | null = null;
  cs.forEach((con, c) => {
    if (con.length < 2) return;
    con.forEach((a, i) => {
      const b = con[(i + 1) % con.length], s = segment(a, b);
      const B = s ?? [a, a, b, b];
      for (let k = 0; k <= 40; k++) {
        const q = bez(B, k / 40), d = Math.hypot(q.x - p.x, q.y - p.y);
        if (!best || d < best.d) best = { c, i, t: k / 40, d };
      }
    });
  });
  if (!best) return null;
  // refine around the best sample
  const b0: { c: number; i: number; t: number; d: number } = best, con = cs[b0.c], a = con[b0.i], b = con[(b0.i + 1) % con.length];
  const B = segment(a, b) ?? [a, a, b, b];
  for (let t = Math.max(0, b0.t - 1 / 40); t <= Math.min(1, b0.t + 1 / 40); t += 1 / 800) {
    const q = bez(B, t), d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < b0.d) { b0.t = t; b0.d = d; }
  }
  return b0;
}

/** Drag a curve by the point at t on it: its two handles move so that point follows by (dx, dy),
    the end nearer the grab moving more. A straight segment moves its two anchors instead. */
export function reshapeSegment(cs: Node[][], c: number, i: number, t: number, dx: number, dy: number): Node[][] {
  const con = cs[c], j = (i + 1) % con.length, a = con[i], b = con[j];
  if (!segment(a, b)) return moveAnchors(cs, i === j ? [{ c, i }] : [{ c, i }, { c, i: j }], dx, dy);
  t = Math.min(0.9, Math.max(0.1, t));
  const b1 = 3 * (1 - t) ** 2 * t, b2 = 3 * (1 - t) * t * t, k = 1 / ((1 - t) * b1 + t * b2);
  const s = segment(a, b)!;
  let out = setHandle(cs, { c, i }, 'o', { x: s[1].x + dx * k * (1 - t), y: s[1].y + dy * k * (1 - t) });
  out = setHandle(out, { c, i: j }, 'i', { x: s[2].x + dx * k * t, y: s[2].y + dy * k * t });
  return out;
}

/** Delete anchor points; the curves either side join up. Contours left with fewer than two points go. */
export function deleteAnchors(cs: Node[][], refs: Ref[]): Node[][] {
  const gone = new Set(refs.map(refKey));
  return cs.map((con, c) => con.filter((_, i) => !gone.has(refKey({ c, i })))).filter(con => con.length > 1);
}

/** Run a contour the other way round: inside another, it then cuts a hole (or fills one). */
export function reverseContour(cs: Node[][], c: number): Node[][] {
  const out = copy(cs);
  out[c] = out[c].reverse().map(n => {
    const m: Node = { x: n.x, y: n.y };
    if (hasOut(n)) { m.ix = n.ox; m.iy = n.oy; }
    if (hasIn(n)) { m.ox = n.ix; m.oy = n.iy; }
    if (n.s) m.s = 1;
    if (n.r) { m.r = n.r; if (n.corner) m.corner = n.corner; }
    return m;
  });
  return out;
}

/** A contour's area, positive when it runs anticlockwise (y up), from its anchor points and handles. */
export function contourArea(con: Node[]): number {
  const pts: P[] = [];
  con.forEach((a, i) => {
    const b = con[(i + 1) % con.length], s = segment(a, b);
    pts.push(a);
    if (s) for (let k = 1; k < 8; k++) pts.push(bez(s, k / 8));
  });
  return signedArea(pts);
}

/** Every anchor point inside the box. */
export function anchorsIn(cs: Node[][], x0: number, y0: number, x1: number, y1: number): Ref[] {
  const out: Ref[] = [];
  cs.forEach((con, c) => con.forEach((n, i) => { if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) out.push({ c, i }); }));
  return out;
}

/** `p` moved to lie on the nearest of the lines from `from` across, up, or at 45°. */
export function constrain(from: P, p: P): P {
  const dx = p.x - from.x, dy = p.y - from.y, a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const l = dx * Math.cos(a) + dy * Math.sin(a);
  return { x: from.x + Math.cos(a) * l, y: from.y + Math.sin(a) * l };
}

/** Where on the segment from anchor i (at t) splitSegment puts its new point. */
export function pointOn(cs: Node[][], c: number, i: number, t: number): P {
  const con = cs[c], a = con[i], b = con[(i + 1) % con.length], q = bez(segment(a, b) ?? [a, a, b, b], t);
  return { x: R(q.x), y: R(q.y) };
}

export type Shape = 'stroke' | 'roundstroke' | 'rect' | 'round' | 'ellipse' | 'triangle' | 'polygon' | 'star';
export const SHAPES: Shape[] = ['stroke', 'roundstroke', 'rect', 'round', 'ellipse', 'triangle', 'polygon', 'star'];
/** The shapes drawn along a line from where the drag starts to where it ends, rather than in a box. */
export const isStroke = (kind: Shape) => kind === 'stroke' || kind === 'roundstroke';

/** Corners of a regular shape around the unit circle, one at the top, anticlockwise: `n` of them, or
    with `inner` a star of n points whose inner corners sit at that share of the radius. */
function corners(n: number, inner?: number): P[] {
  const k = inner ? 2 * n : n, us: P[] = [];
  for (let i = 0; i < k; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / k, f = inner && i % 2 ? inner : 1;
    us.push({ x: Math.cos(a) * f, y: Math.sin(a) * f });
  }
  return us;
}
const cornersOf = (kind: Shape) => kind === 'triangle' ? corners(3) : kind === 'polygon' ? corners(6) : corners(5, 0.382);
const bounds = (us: P[]) => ({ x0: Math.min(...us.map(u => u.x)), x1: Math.max(...us.map(u => u.x)), y0: Math.min(...us.map(u => u.y)), y1: Math.max(...us.map(u => u.y)) });

/** Width over height of the shape at its most even (a square, a circle, a regular triangle, hexagon
    or star), which Shift keeps it to. */
export function shapeAspect(kind: Shape): number {
  if (kind !== 'triangle' && kind !== 'polygon' && kind !== 'star') return 1;
  const k = bounds(cornersOf(kind));
  return (k.x1 - k.x0) / (k.y1 - k.y0);
}

/** A new contour filling the box from (x0, y0) to (x1, y1): a rectangle (four corners), a rounded
    rectangle (corners a fifth of the shorter side round), an ellipse (four smooth points with handles
    the usual 0.552 of the radius out), a triangle, a hexagon or a five-pointed star (one point at the
    top). It runs anticlockwise (y up) or, with `ccw` false, clockwise, so it fills in the letter as its
    other filled contours do. */
export function shapeContour(kind: Shape, x0: number, y0: number, x1: number, y1: number, ccw = true): Node[] {
  const l = R(Math.min(x0, x1)), r = R(Math.max(x0, x1)), b = R(Math.min(y0, y1)), t = R(Math.max(y0, y1));
  let con: Node[];
  if (kind === 'rect') con = [{ x: l, y: b }, { x: r, y: b }, { x: r, y: t }, { x: l, y: t }];
  else if (kind === 'round') {
    const q = Math.min(r - l, t - b) / 5, h = q * CIRCLE_K;
    con = [
      { x: l + q, y: b, ix: l + q - h, iy: b, s: 1 }, { x: r - q, y: b, ox: r - q + h, oy: b, s: 1 },
      { x: r, y: b + q, ix: r, iy: b + q - h, s: 1 }, { x: r, y: t - q, ox: r, oy: t - q + h, s: 1 },
      { x: r - q, y: t, ix: r - q + h, iy: t, s: 1 }, { x: l + q, y: t, ox: l + q - h, oy: t, s: 1 },
      { x: l, y: t - q, ix: l, iy: t - q + h, s: 1 }, { x: l, y: b + q, ox: l, oy: b + q - h, s: 1 }
    ];
  } else if (kind === 'ellipse') {
    const cx = (l + r) / 2, cy = (b + t) / 2, kx = (r - l) / 2 * CIRCLE_K, ky = (t - b) / 2 * CIRCLE_K;
    con = [
      { x: r, y: cy, ix: r, iy: cy - ky, ox: r, oy: cy + ky, s: 1 },
      { x: cx, y: t, ix: cx + kx, iy: t, ox: cx - kx, oy: t, s: 1 },
      { x: l, y: cy, ix: l, iy: cy + ky, ox: l, oy: cy - ky, s: 1 },
      { x: cx, y: b, ix: cx - kx, iy: b, ox: cx + kx, oy: b, s: 1 }
    ];
  } else {
    // a regular shape stretched to fill the box
    const us = cornersOf(kind), k = bounds(us);
    con = us.map(u => ({ x: l + (u.x - k.x0) / (k.x1 - k.x0) * (r - l), y: b + (u.y - k.y0) / (k.y1 - k.y0) * (t - b) }));
  }
  con = con.map(n => {
    const m: Node = { ...n, x: R(n.x), y: R(n.y) };
    if (hasIn(n)) { m.ix = R(n.ix!); m.iy = R(n.iy!); }
    if (hasOut(n)) { m.ox = R(n.ox!); m.oy = R(n.oy!); }
    return m;
  });
  return ccw ? con : reverseContour([con], 0)[0];
}

/** A straight stroke `w` thick from a to b, its middle line running from one to the other: four corners, or with
    `round` ends four corners rounded half its thickness, so each end is a half circle (live corners, which can be
    made otherwise later). It runs anticlockwise, or clockwise with `ccw` false. */
export function strokeContour(a: P, b: P, w: number, round: boolean, ccw = true): Node[] {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / l * w / 2, ny = (b.x - a.x) / l * w / 2;
  const con: Node[] = [{ x: R(a.x - nx), y: R(a.y - ny) }, { x: R(b.x - nx), y: R(b.y - ny) }, { x: R(b.x + nx), y: R(b.y + ny) }, { x: R(a.x + nx), y: R(a.y + ny) }];
  if (round) for (const n of con) n.r = R(w / 2);
  return ccw ? con : reverseContour([con], 0)[0];
}

/** How thick the letter's strokes are: the middle run of ink across it, along level lines at a few heights. */
export function strokeWidth(cs: Node[][], fallback: number): number {
  const ink = inkOf(cs), ys = cs.flatMap(c => c.map(n => n.y)), xs = cs.flatMap(c => c.map(n => n.x));
  if (!ys.length) return fallback;
  const y0 = Math.min(...ys), y1 = Math.max(...ys), x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, runs: number[] = [];
  for (const f of [0.3, 0.42, 0.58, 0.7]) {
    const y = y0 + (y1 - y0) * f;
    let from: number | null = null;
    for (let x = x0; x <= x1; x += 1) {
      const on = ink(x, y);
      if (on && from === null) from = x;
      else if (!on && from !== null) { if (x - from > 3) runs.push(x - from); from = null; }
    }
  }
  if (!runs.length) return fallback;
  runs.sort((a, b) => a - b);
  return R(runs[Math.floor(runs.length / 2)]);
}

/* ---- Live corners: a corner point keeps its place and carries a radius (outline.ts draws it rounded) */

/** Contours as their outline's polygons, curves sampled and corners drawn as they are. */
function polysOf(cs: Node[][], sharp = false): P[][] {
  const out: P[][] = [];
  let cur: P[] = [], at: P = { x: 0, y: 0 };
  for (const c of drawnCmds(cs, sharp) as Cmd[]) {
    if (c[0] === 'M') { if (cur.length > 2) out.push(cur); cur = [at = { x: c[1], y: c[2] }]; }
    else if (c[0] === 'L') cur.push(at = { x: c[1], y: c[2] });
    else if (c[0] === 'C') { const B = [at, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }]; for (let k = 1; k <= 16; k++) cur.push(bez(B, k / 16)); at = B[3]; }
  }
  if (cur.length > 2) out.push(cur);
  return out;
}
/** The ink of contours, as the font fills them (nonzero): whether a point is in it. With `sharp`, corners are taken
    as their points are, before any radius rounds them. */
export function inkOf(cs: Node[][], sharp = false): (x: number, y: number) => boolean {
  const s = inkShape(polysOf(cs, sharp));
  return (x, y) => s.has(x, y);
}

/** The least turn a point needs for the corner tools to take it as a corner (a gentle kink isn't one). */
const CORNER_TURN = 0.17;
/** A corner of the outline the corner tools reach: an outside one points out of the ink (a stroke's end, a letter's
    outer corner), an inside one into it (where strokes meet, a counter's corner). `most` is the most radius it has
    room for, `turn` how far it turns. */
export interface CornerAt { ref: Ref; inside: boolean; most: number; turn: number }

/** The corners of `cs` (of `refs` alone, when given), each told outside or inside by the ink within its turn. A corner
    with ink on both sides, buried in another shape, is left out: rounding it would show nothing. */
export function cornersAt(cs: Node[][], refs?: Ref[]): CornerAt[] {
  const ink = inkOf(cs, true), out: CornerAt[] = [];
  const take = refs ?? cs.flatMap((con, c) => con.map((_, i) => ({ c, i })));
  for (const ref of take) {
    const con = cs[ref.c];
    if (!con || con.length < 3 || !con[ref.i] || con[ref.i].s) continue;
    const t = cornerTurn(con, ref.i);
    if (t.turn < CORNER_TURN) continue;
    // a little way into the turn (between the two sides) and out of it
    const n = con[ref.i], wx = t.dout.x - t.din.x, wy = t.dout.y - t.din.y, wl = Math.hypot(wx, wy) || 1, e = 1.5;
    const into = ink(n.x + wx / wl * e, n.y + wy / wl * e), out_ = ink(n.x - wx / wl * e, n.y - wy / wl * e);
    if (into === out_) continue;
    out.push({ ref, inside: !into, most: cornerRoom(con, ref.i).most, turn: t.turn });
  }
  return out;
}

/** Give corners a radius (0 takes it off), and with `kind` draw them as that (a round, a cut or a scoop). */
export function setCorners(cs: Node[][], refs: Ref[], r: number | null, kind?: CornerKind): Node[][] {
  const out = copy(cs);
  for (const { c, i } of refs) {
    const n = out[c]?.[i];
    if (!n) continue;
    if (r !== null) { if (r > 0) n.r = R(r); else { delete n.r; delete n.corner; } }
    if (kind && n.r) { if (kind === 'round') delete n.corner; else n.corner = kind; }
  }
  return out;
}

/** Where a corner's handle sits, as the pen shows it: from the corner point into its turn, by `at` units
    (and how far it is per unit of radius, so a drag along it sets the radius). */
export function cornerHandle(cs: Node[][], { c, i }: Ref): { ux: number; uy: number; perR: number; at: number } | null {
  const con = cs[c], n = con?.[i];
  if (!n || con.length < 3) return null;
  const t = cornerTurn(con, i), room = cornerRoom(con, i);
  if (t.turn < CORNER_TURN) return null;
  const wx = t.dout.x - t.din.x, wy = t.dout.y - t.din.y, wl = Math.hypot(wx, wy) || 1, th = Math.min(t.turn, 2.6);
  // the middle of a round is tan(turn / 4) of its setback from the corner point
  const perR = Math.max(0.2, Math.tan(th / 2) * Math.tan(th / 4));
  return { ux: wx / wl, uy: wy / wl, perR, at: room.setback(n.r ?? 0) * Math.tan(th / 4) };
}

/* ---- Overlapping shapes: merged, cut out, broken apart */

/** The contours as shapes: each contour filled the letter's way with the holes inside it (the contours running
    the other way whose ink it holds), in the order of the shapes' outer contours. */
export function shapesOf(cs: Node[][]): number[][] {
  const areas = cs.map(contourArea), big = areas.reduce((m, a, c) => (Math.abs(a) > Math.abs(areas[m] ?? 0) ? c : m), 0), way = Math.sign(areas[big] || 1);
  const outer = cs.map((_, c) => Math.sign(areas[c]) === way || areas[c] === 0);
  const inks = cs.map((con, c) => (outer[c] ? inkOf([con]) : null));
  const groups = new Map<number, number[]>();
  cs.forEach((_, c) => { if (outer[c]) groups.set(c, [c]); });
  cs.forEach((con, c) => {
    if (outer[c] || !con.length) return;
    // the smallest outer contour round its first point (one running the other way inside none is a shape of its own,
    // but no home for another)
    let home = -1;
    for (const [o] of groups) if (inks[o]?.(con[0].x, con[0].y) && (home < 0 || Math.abs(areas[o]) < Math.abs(areas[home]))) home = o;
    if (home >= 0) groups.get(home)!.push(c); else groups.set(c, [c]);
  });
  return [...groups.keys()].sort((a, b) => a - b).map(k => groups.get(k)!);
}

/** A contour's box: [x0, y0, x1, y1], its anchor points and handles. */
const boxOf = (cs: Node[][]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const con of cs) for (const n of con) for (const [x, y] of [[n.x, n.y], [n.ix, n.iy], [n.ox, n.oy]]) {
    if (x === undefined || y === undefined) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
};
const boxesMeet = (a: number[], b: number[], d = 0) => a[0] <= b[2] + d && b[0] <= a[2] + d && a[1] <= b[3] + d && b[1] <= a[3] + d;

/** Whether two shapes overlap: made one, their outline would change (shapes apart, or one in another's counter,
    come back from unite as they were). */
function meets(a: Node[][], b: Node[][]): boolean {
  if (!boxesMeet(boxOf(a), boxOf(b))) return false;
  const both = [...a, ...b];
  return unite(both) !== both;
}
/** Whether any two shapes overlap. */
export function overlapping(cs: Node[][]): boolean {
  const groups = shapesOf(cs).map(g => g.map(c => cs[c]));
  for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) if (meets(groups[a], groups[b])) return true;
  return false;
}
/** The little shapes that only join others: a fillet filling the inside corner where two strokes meet, much smaller
    than the letter's biggest shape and running into two or more. Broken apart, they would bridge the gap. */
function fillers(shapes: Node[][][]): boolean[] {
  const areas = shapes.map(g => Math.abs(g.reduce((a, c) => a + contourArea(c), 0))), big = Math.max(...areas);
  return shapes.map((g, k) => areas[k] < big * 0.05 && shapes.filter((h, j) => j !== k && meets(g, h)).length >= 2);
}

/** Corner radii and kinds carried over to an outline made from `from`, onto its points that sit where one of
    `from`'s did. */
function keepCorners(from: Node[][], to: Node[][]): Node[][] {
  const had = new Map<string, Node>();
  for (const con of from) for (const n of con) if (n.r) had.set(`${n.x},${n.y}`, n);
  if (!had.size) return to;
  return to.map(con => con.map(n => {
    const o = had.get(`${n.x},${n.y}`);
    return o && !n.s ? { ...n, r: o.r, ...(o.corner ? { corner: o.corner } : {}) } : n;
  }));
}
/** Whole font units, as the pen keeps points (the cuts fall between them). */
const whole = (cs: Node[][]): Node[][] => cs.map(con => con.map(n => {
  const m: Node = { ...n, x: R(n.x), y: R(n.y) };
  if (hasIn(n)) { m.ix = R(n.ix!); m.iy = R(n.iy!); }
  if (hasOut(n)) { m.ox = R(n.ox!); m.oy = R(n.oy!); }
  return m;
})).filter(con => con.length > 1);

/** The shapes holding any of the contours `picked`, as contour numbers. */
const shapesHolding = (groups: number[][], picked: number[]) => groups.filter(g => g.some(c => picked.includes(c)));

/** Overlapping shapes made one outline: the picked contours' shapes, or every shape. Comes back with the contours
    the merged outline is (to pick them), or null when nothing overlapped. */
export function mergeShapes(cs: Node[][], picked: number[] = []): { cs: Node[][]; made: number[] } | null {
  const use = picked.length ? shapesHolding(shapesOf(cs), picked).flat() : cs.map((_, c) => c);
  const these = use.map(c => cs[c]), merged = unite(these);
  if (merged === these) return null;
  const rest = cs.filter((_, c) => !use.includes(c)), made = whole(keepCorners(these, merged));
  return { cs: [...rest, ...made], made: made.map((_, k) => rest.length + k) };
}

/** The picked contours' shapes cut out of the shapes they overlap, and gone themselves. Null when they overlap nothing. */
export function cutShapes(cs: Node[][], picked: number[]): Node[][] | null {
  const groups = shapesOf(cs), front = shapesHolding(groups, picked);
  if (!front.length) return null;
  const cutter = front.flat().map(c => cs[c]);
  let changed = false;
  const out: Node[][] = [];
  for (const g of groups) {
    if (front.includes(g)) continue;
    const these = g.map(c => cs[c]), cut = cutOut(these, cutter);
    if (cut !== these) changed = true;
    out.push(...(cut === these ? these : whole(keepCorners(these, cut))));
  }
  return changed ? out : null;
}

/** The outline of contours grown by `d` all round (a gap's width), fitted with points and handles: each edge
    moved out whole, the edges joined round where they part. */
export function grown(cs: Node[][], d: number): Node[][] {
  const ink = inkOf(cs), polys: P[][] = [];
  for (let p of polysOf(cs)) {
    // the ink to the left of the way the polygon runs, so the right is out of it
    const k = p.findIndex((q, i) => Math.hypot(p[(i + 1) % p.length].x - q.x, p[(i + 1) % p.length].y - q.y) > 0.5);
    if (k < 0) continue;
    const a = p[k], b = p[(k + 1) % p.length], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (!ink((a.x + b.x) / 2 - (b.y - a.y) / l * 0.5, (a.y + b.y) / 2 + (b.x - a.x) / l * 0.5)) p = p.slice().reverse();
    if (d <= 0) { polys.push(p); continue; }
    const n = p.length, o: P[] = [];
    const right = (a: P, b: P) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }; };
    for (let i = 0; i < n; i++) {
      const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n], n1 = right(a, b), n2 = right(b, c);
      o.push({ x: b.x + n1.x * d, y: b.y + n1.y * d });
      const turn = Math.atan2(n1.x * n2.y - n1.y * n2.x, n1.x * n2.x + n1.y * n2.y);
      // (turning left, the grown edges part: round the corner)
      if (turn > 0.15) for (let j = 1, m = Math.ceil(turn / 0.2); j < m; j++) {
        const t = Math.atan2(n1.y, n1.x) + turn * j / m;
        o.push({ x: b.x + Math.cos(t) * d, y: b.y + Math.sin(t) * d });
      }
      o.push({ x: b.x + n2.x * d, y: b.y + n2.y * d });
    }
    polys.push(o);
  }
  // where the grown edges cross (inside a turn tighter than d) they loop back the wrong way: those loops are left out
  const s = inkShape(polys, true), clean = combine([s], (x, y) => s.has(x, y));
  const cmds: Cmd[] = clean.flatMap(q => [['M', q[0].x, q[0].y] as Cmd, ...q.slice(1).map(v => ['L', v.x, v.y] as Cmd), ['Z'] as Cmd]);
  return fitOutline(cmds, 0.6);
}

/** Break overlaps: where a shape runs over another, the one under it is cut `gap` short of it on every side, so the
    two no longer touch. The picked contours' shapes are in front of the rest; with none picked, each shape is in front
    of the ones drawn before it. Fillets joining strokes go (fillers). Comes back with the contours the front shapes are
    now (to pick them), or null when nothing overlapped. */
export function breakShapes(cs: Node[][], picked: number[], gap: number): { cs: Node[][]; front: number[] } | null {
  const all = shapesOf(cs);
  if (all.length < 2) return null;
  const fill = fillers(all.map(g => g.map(c => cs[c]))), groups = all.filter((_, k) => !fill[k]);
  let shapes = groups.map(g => g.map(c => cs[c])), changed = false;
  const cutBy = (front: Node[][], under: Node[][][]) => {
    const cutter = grown(front, gap), fb = boxOf(front);
    return under.map(u => {
      if (!u.length || !boxesMeet(fb, boxOf(u), gap)) return u;
      const cut = cutOut(u, cutter);
      if (cut === u) return u;
      changed = true;
      return whole(keepCorners(u, cut));
    });
  };
  if (picked.length) {
    const front = shapesHolding(groups, picked), fs = front.map(g => g.map(c => cs[c])).flat();
    const under = cutBy(fs, groups.filter(g => !front.includes(g)).map(g => g.map(c => cs[c])));
    if (!changed) return null;
    const rest = under.flat();
    return { cs: [...rest, ...fs], front: fs.map((_, k) => rest.length + k) };
  }
  for (let k = 1; k < shapes.length; k++) shapes = [...cutBy(shapes[k], shapes.slice(0, k)), ...shapes.slice(k)];
  return changed ? { cs: shapes.flat(), front: [] } : null;
}

/* ---- Picked points as one: scaled, turned or flipped together; shapes made thicker or thinner */

/** The contours of the shapes holding any of `contours` (each shape with the holes in it), in order. */
export function wholeShapes(cs: Node[][], contours: number[]): number[] {
  return shapesHolding(shapesOf(cs), contours).flat().sort((a, b) => a - b);
}

/** An affine map, x' = a x + c y + e and y' = b x + d y + f, as [a, b, c, d, e, f]. */
export type Affine = [number, number, number, number, number, number];
/** Turning by `deg` degrees anticlockwise about `o`. */
export function turnAbout(o: P, deg: number): Affine {
  const t = (deg * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  return [cos, sin, -sin, cos, o.x - cos * o.x + sin * o.y, o.y - sin * o.x - cos * o.y];
}
/** Scaling by `sx` across and `sy` up about `o`, which stays put; a negative scale flips. */
export const scaleAbout = (o: P, sx: number, sy: number): Affine => [sx, 0, 0, sy, o.x - sx * o.x, o.y - sy * o.y];

/** Picked points, their handles with them, taken through the map `m`. A map that flips would run a whole contour the
    other way round, turning ink into a hole, so each contour picked whole is run back again. */
export function transformAnchors(cs: Node[][], refs: Ref[], m: Affine): Node[][] {
  let out = copy(cs);
  const at = (x: number, y: number) => ({ x: R(m[0] * x + m[2] * y + m[4]), y: R(m[1] * x + m[3] * y + m[5]) });
  const keys = new Set(refs.map(refKey));
  for (const k of keys) {
    const { c, i } = keyRef(k), n = out[c]?.[i];
    if (!n) continue;
    const p = at(n.x, n.y);
    if (hasIn(n)) { const h = at(n.ix!, n.iy!); n.ix = h.x; n.iy = h.y; }
    if (hasOut(n)) { const h = at(n.ox!, n.oy!); n.ox = h.x; n.oy = h.y; }
    n.x = p.x; n.y = p.y;
  }
  if (m[0] * m[3] - m[1] * m[2] < 0)
    for (let c = 0; c < cs.length; c++) if (cs[c].length && cs[c].every((_, i) => keys.has(refKey({ c, i })))) out = reverseContour(out, c);
  return out;
}

/** Scaling by `sx` and `sy` along axes turned `deg` anticlockwise, about `o`; with `deg` 0, scaleAbout. */
export function scaleAlong(o: P, deg: number, sx: number, sy: number): Affine {
  if (!deg) return scaleAbout(o, sx, sy);
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const a = sx * c * c + sy * s * s, b = (sx - sy) * s * c, d = sx * s * s + sy * c * c;
  return [a, b, b, d, o.x - a * o.x - b * o.y, o.y - b * o.x - d * o.y];
}

/** Where picked points reach: their anchors, and points along the curves running from one of them to the next. */
export function pickedPoints(cs: Node[][], refs: Ref[]): P[] {
  const keys = new Set(refs.map(refKey)), out: P[] = [];
  for (const k of keys) {
    const { c, i } = keyRef(k), con = cs[c], n = con?.[i];
    if (!n) continue;
    out.push(n);
    const j = (i + 1) % con.length, s = j !== i ? segment(n, con[j]) : null;
    if (s && keys.has(refKey({ c, i: j }))) for (let t = 1; t < 16; t++) out.push(bez(s, t / 16));
  }
  return out;
}
/** A box round points, along axes turned `deg` anticlockwise: x0 to x1 along the turned x axis and y0 to y1 along its y
    axis (with `deg` 0, the plain box). Null with no points. */
export function boxAlong(pts: P[], deg = 0): { x0: number; y0: number; x1: number; y1: number } | null {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    const u = deg ? p.x * c + p.y * s : p.x, v = deg ? -p.x * s + p.y * c : p.y;
    x0 = Math.min(x0, u); y0 = Math.min(y0, v); x1 = Math.max(x1, u); y1 = Math.max(y1, v);
  }
  return x0 <= x1 ? { x0, y0, x1, y1 } : null;
}
/** The box round picked points. */
export const pickedBox = (cs: Node[][], refs: Ref[]) => boxAlong(pickedPoints(cs, refs));

/** How far picked shapes stand turned, in degrees (-45 to 45): the way their longest straight side runs, when every other
    straight side of a fair length runs that way too or square to it (a box, a stroke, a block letter turned); else 0,
    as for a letter whose sides run several ways, or shapes of curves alone. */
export function turnOf(cs: Node[][], refs: Ref[]): number {
  const keys = new Set(refs.map(refKey)), sides: { a: number; l: number }[] = [];
  for (const k of keys) {
    const { c, i } = keyRef(k), con = cs[c], n = con?.[i];
    if (!n || con.length < 2) continue;
    const j = (i + 1) % con.length, m = con[j], l = Math.hypot(m.x - n.x, m.y - n.y);
    if (keys.has(refKey({ c, i: j })) && !segment(n, m) && l > 0) sides.push({ a: Math.atan2(m.y - n.y, m.x - n.x), l });
  }
  if (!sides.length) return 0;
  const long = sides.reduce((b, k) => (k.l > b.l ? k : b)), quarter = Math.PI / 2;
  // how far a way is from the longest side's, or from square to it
  const off = (a: number) => { const d = (((a - long.a) % quarter) + quarter) % quarter; return Math.min(d, quarter - d); };
  if (long.l < 10 || sides.some(k => k.l >= long.l * 0.2 && off(k.a) > (1 * Math.PI) / 180)) return 0;
  const deg = ((((long.a * 180) / Math.PI + 45) % 90) + 90) % 90 - 45;
  return Math.abs(deg) < 0.5 ? 0 : Math.round(deg * 100) / 100;
}

/** How thick the ink of contours is: from all along their outline, straight across the ink to its other side, the
    middle of those widths, each counting for the length of outline it starts from. A bar's width rather than its
    length, a ring's or a letter's strokes. 0 when there is no ink. */
export function thicknessOf(cs: Node[][]): number {
  const polys = polysOf(cs), ink = inkShape(polys);
  const edges = polys.flatMap(p => p.map((a, k) => [a, p[(k + 1) % p.length]] as [P, P]));
  const total = edges.reduce((s, [a, b]) => s + Math.hypot(b.x - a.x, b.y - a.y), 0);
  const step = Math.max(2, total / 400), ws: { w: number; k: number }[] = [];
  edges.forEach(([a, b], e) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1e-6) return;
    const tx = (b.x - a.x) / l, ty = (b.y - a.y) / l, n = Math.max(1, Math.round(l / step));
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n, q = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      // into the ink, on whichever side of the outline it is
      let ux = -ty, uy = tx;
      if (!ink.has(q.x + ux * 0.5, q.y + uy * 0.5)) { ux = -ux; uy = -uy; if (!ink.has(q.x + ux * 0.5, q.y + uy * 0.5)) continue; }
      let best = Infinity;
      edges.forEach(([c, d], o) => {
        if (o === e) return;
        const sx = d.x - c.x, sy = d.y - c.y, den = ux * sy - uy * sx;
        if (Math.abs(den) < 1e-9) return;
        const t = ((c.x - q.x) * sy - (c.y - q.y) * sx) / den, s = ((c.x - q.x) * uy - (c.y - q.y) * ux) / den;
        if (t > 0.01 && s >= 0 && s <= 1 && t < best) best = t;
      });
      if (best < Infinity) ws.push({ w: best, k: l / n });
    }
  });
  if (!ws.length) return 0;
  ws.sort((a, b) => a.w - b.w);
  let left = ws.reduce((s, v) => s + v.k, 0) / 2;
  for (const v of ws) if ((left -= v.k) <= 0) return R(v.w);
  return R(ws[ws.length - 1].w);
}

/** Whether a contour's ink (by `ink`, its shape's) lies to the left of the way it runs: the side most of its outline
    has ink on. */
function inkLeftOf(con: Node[], ink: (x: number, y: number) => boolean): boolean {
  let vote = 0;
  for (const p of polysOf([con])) for (let k = 0; k < p.length; k++) {
    const a = p[k], b = p[(k + 1) % p.length], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 2) continue;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
    const lft = ink(mx + nx * 0.75, my + ny * 0.75), rgt = ink(mx - nx * 0.75, my - ny * 0.75);
    if (lft !== rgt) vote += lft ? l : -l;
  }
  return vote !== 0 ? vote > 0 : contourArea(con) >= 0;
}

/** Four straight sides, two and two in line, whose long sides are nearer each other than its ends are: a bar (a
    stroke, a box longer than it is wide). Its long sides (0 and 2, or 1 and 3) and how far apart they are, or null. */
function barOf(con: Node[]): { sides: number; w: number } | null {
  if (con.length !== 4 || con.some(n => hasIn(n) || hasOut(n))) return null;
  const side = (i: number) => { const a = con[i % 4], b = con[(i + 1) % 4], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
  const level = (i: number) => { const a = side(i), b = side(i + 2); return Math.abs(a.x * b.y - a.y * b.x) < 0.02; };
  if (!level(0) || !level(1)) return null;
  const apart = (i: number) => { const u = side(i), a = con[i], q = con[(i + 2) % 4]; return Math.abs(u.x * (q.y - a.y) - u.y * (q.x - a.x)); };
  const h0 = apart(0), h1 = apart(1);
  return Math.abs(h0 - h1) > 1 ? { sides: h0 < h1 ? 0 : 1, w: Math.min(h0, h1) } : null;
}

/** A contour moved `d` out of its ink (into it when negative), its ink to the left of the way it runs or not. Each
    side moves its own distance (`dist`, by side), each point to where its two sides now meet (a sharp point at most
    four times the distance out), curves keep their handles' ways, longer or shorter as their curve grows or shrinks,
    and a corner's radius grows by as much outside and shrinks inside (`bar`: a bar's round ends stay half its width). */
function offsetContour(con: Node[], inkLeft: boolean, dist: number[], bar: { w: number; d: number } | null): Node[] {
  const n = con.length, unitv = (v: P) => { const l = Math.hypot(v.x, v.y); return l > 1e-9 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 }; };
  const off = (t: P): P => (inkLeft ? { x: t.y, y: -t.x } : { x: -t.y, y: t.x });
  const curves = con.map((a, i) => { const b = con[(i + 1) % n]; return segment(a, b) ?? [a, a, b, b]; });
  const far = (p: P, q: P) => Math.hypot(q.x - p.x, q.y - p.y) > 1e-6;
  const tail = (B: P[]) => unitv(far(B[2], B[3]) ? { x: B[3].x - B[2].x, y: B[3].y - B[2].y } : far(B[1], B[3]) ? { x: B[3].x - B[1].x, y: B[3].y - B[1].y } : { x: B[3].x - B[0].x, y: B[3].y - B[0].y });
  const head = (B: P[]) => unitv(far(B[0], B[1]) ? { x: B[1].x - B[0].x, y: B[1].y - B[0].y } : far(B[0], B[2]) ? { x: B[2].x - B[0].x, y: B[2].y - B[0].y } : { x: B[3].x - B[0].x, y: B[3].y - B[0].y });
  const moved = con.map((p, i) => {
    const ip = (i + n - 1) % n, tin = tail(curves[ip]), tout = head(curves[i]), n1 = off(tin), n2 = off(tout), d1 = dist[ip], d2 = dist[i];
    const det = n1.x * n2.y - n1.y * n2.x;
    let v: P;
    if (Math.abs(det) > 0.02) v = { x: (d1 * n2.y - n1.y * d2) / det, y: (n1.x * d2 - d1 * n2.x) / det };
    else if (n1.x * n2.x + n1.y * n2.y > 0) { const m = unitv({ x: n1.x + n2.x, y: n1.y + n2.y }); v = { x: m.x * (d1 + d2) / 2, y: m.y * (d1 + d2) / 2 }; }
    else v = { x: tin.x * 2 * (d1 + d2), y: tin.y * 2 * (d1 + d2) };
    const lim = 4 * Math.max(Math.abs(d1), Math.abs(d2)), vl = Math.hypot(v.x, v.y);
    if (vl > lim) v = { x: v.x * lim / vl, y: v.y * lim / vl };
    return { x: p.x + v.x, y: p.y + v.y, outside: (tin.x * tout.y - tin.y * tout.x) * (inkLeft ? 1 : -1) > 0, d: (d1 + d2) / 2 };
  });
  // a curve as much longer or shorter as the line between its ends
  const grows = (j: number) => {
    const a = con[j], b = con[(j + 1) % n], l = Math.hypot(b.x - a.x, b.y - a.y), ma = moved[j], mb = moved[(j + 1) % n];
    return l > 1e-6 ? Math.hypot(mb.x - ma.x, mb.y - ma.y) / l : 1;
  };
  return con.map((p, i) => {
    const m = moved[i], q: Node = { ...p, x: R(m.x), y: R(m.y) };
    if (hasIn(p)) { const k = grows((i + n - 1) % n); q.ix = R(m.x + (p.ix! - p.x) * k); q.iy = R(m.y + (p.iy! - p.y) * k); }
    if (hasOut(p)) { const k = grows(i); q.ox = R(m.x + (p.ox! - p.x) * k); q.oy = R(m.y + (p.oy! - p.y) * k); }
    if (p.r) {
      const r = bar ? (p.r >= bar.w / 2 - 1 ? bar.w / 2 + bar.d : p.r) : p.r + (m.outside ? m.d : -m.d);
      if (r >= 0.5) q.r = R(r); else { delete q.r; delete q.corner; }
    }
    return q;
  });
}

/** The shapes holding contours `picked` made `d` units thicker on every side (thinner when `d` is negative), keeping
    their points: each contour moves out of its ink, holes into theirs. A bar standing alone grows only across: its
    long sides move, and its ends stay where they are. */
export function thicken(cs: Node[][], picked: number[], d: number): Node[][] {
  const out = copy(cs);
  if (!d) return out;
  for (const g of shapesHolding(shapesOf(cs), picked)) {
    const ink = inkOf(g.map(c => cs[c]));
    for (const c of g) {
      const con = cs[c], bar = g.length === 1 ? barOf(con) : null;
      const dist = con.map((_, i) => (bar ? ((i - bar.sides) % 2 === 0 ? d : 0) : d));
      out[c] = offsetContour(con, inkLeftOf(con, ink), dist, bar && { w: bar.w, d });
    }
  }
  return out;
}

/** The shapes holding contours `picked` made `w` thick (as thicknessOf reads them), their sides moving about half the
    difference each: a curved letter's widths don't all grow by as much as its sides move, so it is tried again from
    the start, a few times, by as much more or less as it fell short or went past. */
export function setWeight(cs: Node[][], picked: number[], w: number): Node[][] {
  const g = wholeShapes(cs, picked), of = (o: Node[][]) => thicknessOf(g.map(c => o[c])), now = of(cs);
  if (!(now > 0)) return copy(cs);
  let d = (w - now) / 2, out = thicken(cs, g, d), got = of(out), best = { out, off: Math.abs(got - w) };
  for (let k = 0; k < 3 && best.off > 1; k++) {
    const by = (w - now) / (got - now);
    if (!(by > 0) || !Number.isFinite(by)) break;
    d *= by; out = thicken(cs, g, d); got = of(out);
    if (Math.abs(got - w) < best.off) best = { out, off: Math.abs(got - w) };
  }
  return best.out;
}

/* ---- Tracing: a letter the settings draw, as points to edit */

const traces = new WeakMap<Glyph, Drawn>();
/** A letter as the settings draw it, traced into points (once per build of it); a free font's letter, or one
    drawn in Points, has its points already, as the font has them. With effects on it (Glyph.fx: rough edges,
    hexagons, a shadow), the outline they draw is traced, so it is that the pen edits, and an edit keeps it. */
export function traceOf(g: Glyph): Drawn {
  let d = traces.get(g);
  if (!d) { d = (!g.fx && g.drawn) || { adv: Math.round(g.adv), contours: fitOutline(g.cmds) }; traces.set(g, d); }
  return d;
}

/* ---- Mirror: a point moved on one side of a letter moves the same way, flipped, on the other */

/** Which way a mirrored edit flips: 'x' left ↔ right across an upright line, 'y' top ↔ bottom across a level one. */
export type Axis = 'x' | 'y';

const along = (n: P, axis: Axis) => (axis === 'x' ? n.x : n.y);

/** The letter's middle across `axis`: halfway between its outermost points, to the half unit. */
export function mirrorLine(cs: Node[][], axis: Axis): number {
  let lo = Infinity, hi = -Infinity;
  for (const con of cs) for (const n of con) { const v = along(n, axis); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return lo <= hi ? Math.round(lo + hi) / 2 : 0;
}

/** Each anchor's partner across the line, by key: the anchor where its reflection falls (within `tol`
    units, each the other's nearest), or itself where it sits on the line. Anchors without one are left out. */
export function mirrorPairs(cs: Node[][], axis: Axis, line: number, tol = 4): Map<string, Ref> {
  const all: Ref[] = cs.flatMap((con, c) => con.map((_, i) => ({ c, i })));
  const near = new Map<string, Ref>();
  for (const r of all) {
    const n = cs[r.c][r.i];
    if (Math.abs(along(n, axis) - line) <= tol / 2) { near.set(refKey(r), r); continue; }
    const fx = axis === 'x' ? 2 * line - n.x : n.x, fy = axis === 'y' ? 2 * line - n.y : n.y;
    let best: Ref | null = null, bd = tol;
    for (const o of all) {
      const m = cs[o.c][o.i], d = Math.max(Math.abs(m.x - fx), Math.abs(m.y - fy));
      if (d <= bd && !(o.c === r.c && o.i === r.i)) { best = o; bd = d; }
    }
    if (best) near.set(refKey(r), best);
  }
  const out = new Map<string, Ref>();
  for (const [k, p] of near) if (refKey(p) === k || refKey(near.get(refKey(p)) ?? { c: -1, i: -1 }) === k) out.set(k, p);
  return out;
}

const sameNode = (a: Node, b: Node) => a.x === b.x && a.y === b.y && a.ix === b.ix && a.iy === b.iy && a.ox === b.ox && a.oy === b.oy && !a.s === !b.s && a.r === b.r && a.corner === b.corner;
const prevRef = (cs: Node[][], { c, i }: Ref): Ref => ({ c, i: (i + cs[c].length - 1) % cs[c].length });

/** Make an edit symmetric: `edited` is `base` with some points or handles changed, and each changed point
    whose partner across an axis didn't change moves its partner the same way, flipped (handles too). A
    point on the line stays on it, its handles mirroring each other. An edit that moved both points of a
    pair (a whole letter, say) is left as it is. Axes apply in turn, so with both a corner reaches all four.
    Adding or removing points isn't mirrored: the edit comes back as it is. `held` is the handle being
    dragged, if any: on a smooth point on the line both handles turn, and the held one leads. */
export function mirrorEdit(base: Node[][], edited: Node[][], axes: Axis[], held?: { r: Ref; side: 'i' | 'o' }): Node[][] {
  if (!axes.length || base.length !== edited.length || base.some((con, c) => con.length !== edited[c].length)) return edited;
  const out = copy(edited);
  const all: Ref[] = base.flatMap((con, c) => con.map((_, i) => ({ c, i })));
  const lines = axes.map(axis => ({ axis, line: mirrorLine(base, axis) })), pairs = lines.map(({ axis, line }) => mirrorPairs(base, axis, line));
  const moved = (r: Ref) => !sameNode(base[r.c][r.i], out[r.c][r.i]);

  // points on a line keep to it, unless the edit moved pairs together
  lines.forEach(({ axis, line }, k) => {
    const changed = all.filter(moved);
    if (changed.some(r => { const p = pairs[k].get(refKey(r)); return p && refKey(p) !== refKey(r) && moved(p); })) return;
    for (const r of changed) {
      const p = pairs[k].get(refKey(r));
      if (!p || refKey(p) !== refKey(r)) continue;
      const b = base[r.c][r.i], n = out[r.c][r.i], d = line - along(n, axis);
      const shift = (v: number | undefined) => (v === undefined ? v : R(v + d));
      if (axis === 'x') { n.x = line; n.ix = shift(n.ix); n.ox = shift(n.ox); } else { n.y = line; n.iy = shift(n.iy); n.oy = shift(n.oy); }
      // one handle pulled on its own: the other mirrors it
      let iMoved = n.ix !== b.ix || n.iy !== b.iy, oMoved = n.ox !== b.ox || n.oy !== b.oy;
      if (iMoved && oMoved && held && refKey(held.r) === refKey(r)) { iMoved = held.side === 'i'; oMoved = !iMoved; }
      if (b.x === n.x && b.y === n.y && iMoved !== oMoved && hasIn(n) && hasOut(n)) {
        const [fx, fy] = iMoved ? [n.ix!, n.iy!] : [n.ox!, n.oy!];
        const mx = axis === 'x' ? R(2 * n.x - fx) : fx, my = axis === 'y' ? R(2 * n.y - fy) : fy;
        if (iMoved) { n.ox = mx; n.oy = my; } else { n.ix = mx; n.iy = my; }
        // still smooth only if the two handles are in line
        const cross = (n.ix! - n.x) * (n.oy! - n.y) - (n.iy! - n.y) * (n.ox! - n.x);
        if (n.s && Math.abs(cross) > 0.02 * Math.hypot(n.ix! - n.x, n.iy! - n.y) * Math.hypot(n.ox! - n.x, n.oy! - n.y)) delete n.s;
      }
    }
  });

  // then each changed point's partner follows, flipped
  lines.forEach(({ axis }, k) => {
    const changed = all.filter(moved), done = new Set(changed.map(refKey));
    const flipX = axis === 'x' ? -1 : 1, flipY = axis === 'y' ? -1 : 1;
    for (const r of changed) {
      const p = pairs[k].get(refKey(r));
      if (!p || refKey(p) === refKey(r) || done.has(refKey(p))) continue;
      done.add(refKey(p));
      const ba = base[r.c][r.i], e = out[r.c][r.i], bp = base[p.c][p.i], q = out[p.c][p.i];
      q.x = R(bp.x + flipX * (e.x - ba.x)); q.y = R(bp.y + flipY * (e.y - ba.y));
      // a flip runs the outline the other way, so in handles usually answer out handles: read it off the neighbours
      const pp = pairs[k].get(refKey(prevRef(base, r)));
      const swap = pp ? refKey(pp) !== refKey(prevRef(base, p)) : true;
      for (const side of ['i', 'o'] as const) {
        const to = swap ? (side === 'i' ? 'o' : 'i') : side;
        const has = side === 'i' ? hasIn(e) : hasOut(e), hadA = side === 'i' ? hasIn(ba) : hasOut(ba), hadP = to === 'i' ? hasIn(bp) : hasOut(bp);
        const ex = side === 'i' ? e.ix : e.ox, ey = side === 'i' ? e.iy : e.oy;
        let hx: number | undefined, hy: number | undefined;
        if (has && hadA && hadP) {
          // moved by as much as this one's, flipped, so the partner keeps its own small differences
          hx = R((to === 'i' ? bp.ix! : bp.ox!) + flipX * (ex! - (side === 'i' ? ba.ix! : ba.ox!)));
          hy = R((to === 'i' ? bp.iy! : bp.oy!) + flipY * (ey! - (side === 'i' ? ba.iy! : ba.oy!)));
        } else if (has) { hx = R(q.x + flipX * (ex! - e.x)); hy = R(q.y + flipY * (ey! - e.y)); }
        else if (!hadA) continue;
        if (to === 'i') { q.ix = hx; q.iy = hy; if (hx === undefined) { delete q.ix; delete q.iy; } }
        else { q.ox = hx; q.oy = hy; if (hx === undefined) { delete q.ox; delete q.oy; } }
      }
      if (e.s) q.s = 1; else delete q.s;
      // a corner's radius and kind, as they are
      if (e.r) q.r = e.r; else delete q.r;
      if (e.corner) q.corner = e.corner; else delete q.corner;
    }
  });
  return out;
}

/* ---- Snapping: a dragged point or handle catches on places in the letter near the pointer */

/** What a point can snap to; each can be turned on or off. */
export type SnapKind = 'points' | 'guides' | 'centers' | 'midpoints' | 'outline' | 'crossings' | 'tangents';
export const SNAP_KINDS: SnapKind[] = ['points', 'guides', 'centers', 'midpoints', 'outline', 'crossings', 'tangents'];

/** A place a point snaps onto, and what it is. */
export interface Spot { x: number; y: number; label: string }
/** A line a point lines up with, across one axis. */
export interface Level { v: number; label: string }
/** The label of a line through an anchor point. It is also what snapIn and the pen's catch mark go by: a guide or
    center wins over such a line at the same place, and the mark leaves it unnamed. */
export const POINT_LINE = 'point';
/** Everything near which a point snaps, gathered once per drag. */
export interface SnapScene { spots: Spot[]; xs: Level[]; ys: Level[]; pieces: [P, P][] }

/** The letter's guide heights. */
export interface Heights { xh: number; cap: number; asc: number; desc: number }

const STEPS = 16; // pieces a curve is cut into for crossing and contact tests

/**
 * The places a point snaps to in the outline `cs` of width `adv`, for the kinds on. `skip` are the
 * points being dragged (not snapped to), `live` the points whose curves change as they're dragged
 * (their curves aren't snapped to either). `from` are points a tangent is drawn from: where a straight
 * line from one of them would just touch a curve.
 */
export function snapScene(cs: Node[][], adv: number, h: Heights, kinds: SnapKind[], skip: Set<string>, live: Set<string> = skip, from: P[] = []): SnapScene {
  const on = new Set(kinds), spots: Spot[] = [], xs: Level[] = [], ys: Level[] = [];
  // the curves and lines that stay put, each as its four bézier points
  const segs: { c: number; i: number; B: P[]; curve: boolean; pts: P[] }[] = [];
  cs.forEach((con, c) => {
    if (con.length < 2) return;
    con.forEach((a, i) => {
      const j = (i + 1) % con.length;
      if (live.has(refKey({ c, i })) || live.has(refKey({ c, i: j }))) return;
      const b = con[j], s = segment(a, b), B = s ?? [a, a, b, b];
      segs.push({ c, i, B, curve: !!s, pts: Array.from({ length: STEPS + 1 }, (_, k) => s ? bez(B, k / STEPS) : { x: a.x + (b.x - a.x) * k / STEPS, y: a.y + (b.y - a.y) * k / STEPS }) });
    });
  });
  const pieces: [P, P][] = segs.flatMap(s => s.pts.slice(1).map((q, k) => [s.pts[k], q] as [P, P]));
  const anchors: P[] = [];
  cs.forEach((con, c) => con.forEach((n, i) => { if (!skip.has(refKey({ c, i }))) anchors.push(n); }));

  if (on.has('points')) for (const n of anchors) { spots.push({ x: n.x, y: n.y, label: 'anchor' }); xs.push({ v: n.x, label: POINT_LINE }); ys.push({ v: n.y, label: POINT_LINE }); }
  if (on.has('guides')) {
    ys.push({ v: 0, label: 'baseline' }, { v: h.xh, label: 'x-height' }, { v: h.cap, label: 'cap height' }, { v: h.asc, label: 'ascender' }, { v: h.desc, label: 'descender' });
    xs.push({ v: 0, label: 'left side' }, { v: adv, label: 'right side' });
  }
  if (on.has('centers')) {
    xs.push({ v: R(adv / 2), label: 'center' });
    ys.push({ v: R(h.xh / 2), label: 'x-height middle' }, { v: R(h.cap / 2), label: 'cap height middle' });
    // the middle of each shape that stays put
    cs.forEach((con, c) => {
      if (con.length < 2 || con.some((_, i) => live.has(refKey({ c, i })))) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of segs) if (s.c === c) for (const q of s.pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      if (x0 <= x1) spots.push({ x: R((x0 + x1) / 2), y: R((y0 + y1) / 2), label: 'center' });
    });
  }
  if (on.has('midpoints')) for (const s of segs) { const q = bez(s.B, 0.5); spots.push({ x: R(q.x), y: R(q.y), label: 'midpoint' }); }
  if (on.has('crossings')) {
    const nearAnchor = (q: P) => anchors.some(n => Math.abs(n.x - q.x) < 1.5 && Math.abs(n.y - q.y) < 1.5);
    const add = (q: P) => { if (!nearAnchor(q)) spots.push({ x: R(q.x), y: R(q.y), label: 'intersect' }); };
    const box = (pts: P[]) => pts.reduce((b, q) => [Math.min(b[0], q.x), Math.min(b[1], q.y), Math.max(b[2], q.x), Math.max(b[3], q.y)], [Infinity, Infinity, -Infinity, -Infinity]);
    const boxes = segs.map(s => box(s.pts));
    // where two curves cross (curves that meet end to end don't count)
    for (let a = 0; a < segs.length; a++) for (let b = a + 1; b < segs.length; b++) {
      const A = boxes[a], B = boxes[b];
      if (A[0] > B[2] || B[0] > A[2] || A[1] > B[3] || B[1] > A[3]) continue;
      const sa = segs[a], sb = segs[b], n = cs[sa.c].length;
      if (sa.c === sb.c && (sb.i === (sa.i + 1) % n || sa.i === (sb.i + 1) % n)) continue;
      for (let k = 0; k < STEPS; k++) for (let l = 0; l < STEPS; l++) {
        const q = crossing(sa.pts[k], sa.pts[k + 1], sb.pts[l], sb.pts[l + 1]);
        if (q) add(q);
      }
    }
    // where a curve crosses a guide line, or the middle of the width
    for (const y of [0, h.xh, h.cap, h.asc, h.desc]) for (const [p, q] of pieces) if ((p.y - y) * (q.y - y) < 0) add({ x: p.x + (q.x - p.x) * (y - p.y) / (q.y - p.y), y });
    for (const [p, q] of pieces) if ((p.x - adv / 2) * (q.x - adv / 2) < 0) add({ x: adv / 2, y: p.y + (q.y - p.y) * (adv / 2 - p.x) / (q.x - p.x) });
  }
  if (on.has('tangents')) for (const f of from) for (const s of segs) if (s.curve) for (const t of tangentsFrom(s.B, f)) { const q = bez(s.B, t); spots.push({ x: R(q.x), y: R(q.y), label: 'tangent' }); }
  return { spots, xs, ys, pieces: on.has('outline') ? pieces : [] };
}

/** Where the line pieces a–b and c–d cross, if they do. */
function crossing(a: P, b: P, c: P, d: P): P | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? { x: a.x + rx * t, y: a.y + ry * t } : null;
}

/** Where along the curve B a straight line from `f` just touches it, away from its ends. */
export function tangentsFrom(B: P[], f: P): number[] {
  const d = (t: number): P => {
    const u = 1 - t;
    return { x: 3 * u * u * (B[1].x - B[0].x) + 6 * u * t * (B[2].x - B[1].x) + 3 * t * t * (B[3].x - B[2].x), y: 3 * u * u * (B[1].y - B[0].y) + 6 * u * t * (B[2].y - B[1].y) + 3 * t * t * (B[3].y - B[2].y) };
  };
  const g = (t: number) => { const q = bez(B, t), v = d(t); return (q.x - f.x) * v.y - (q.y - f.y) * v.x; };
  const out: number[] = [], N = 48;
  for (let k = 0; k < N; k++) {
    let a = k / N, b = (k + 1) / N, ga = g(a);
    if (ga * g(b) > 0) continue;
    for (let it = 0; it < 30; it++) { const m = (a + b) / 2, gm = g(m); if (ga * gm <= 0) b = m; else { a = m; ga = gm; } }
    const t = (a + b) / 2, q = bez(B, t);
    // not at an end, and not a curve running straight through f
    if (t > 0.02 && t < 0.98 && Math.hypot(q.x - f.x, q.y - f.y) > 2 && !out.some(o => Math.abs(o - t) < 0.01)) out.push(t);
  }
  return out;
}

/** What snapping `p` came to: where it lands, the place it caught on (if any) and the lines it lines up with. */
export interface Snapped { x: number; y: number; at?: Spot; gx?: Level; gy?: Level }

/** Snap `p` within `tol` units: onto a place first, then onto the outline, then lining up across and up. */
export function snapIn(scene: SnapScene, p: P, tol: number): Snapped {
  let best: Spot | null = null, bd = tol * 1.25;
  for (const s of scene.spots) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d <= bd) { best = s; bd = d; } }
  const on1 = (v: number, ls: Level[]) => ls.find(l => Math.abs(l.v - v) < 0.5);
  if (best) return { x: best.x, y: best.y, at: best, gx: on1(best.x, scene.xs), gy: on1(best.y, scene.ys) };
  let on: P | null = null, od = tol;
  for (const [a, b] of scene.pieces) {
    const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2)) : 0;
    const q = { x: a.x + vx * t, y: a.y + vy * t }, d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < od) { on = q; od = d; }
  }
  if (on) { const q = { x: R(on.x), y: R(on.y) }; return { ...q, at: { ...q, label: 'on outline' } }; }
  // the nearest line each way; a guide or center wins over a point at the same place, as it names more
  const near = (v: number, ls: Level[]) => ls.reduce<Level | undefined>((b, l) => (Math.abs(l.v - v) <= tol && (!b || Math.abs(l.v - v) < Math.abs(b.v - v) - 0.01 || (Math.abs(l.v - b.v) < 0.5 && b.label === POINT_LINE)) ? l : b), undefined);
  const sx = near(p.x, scene.xs), sy = near(p.y, scene.ys);
  return { x: sx?.v ?? R(p.x), y: sy?.v ?? R(p.y), gx: sx, gy: sy };
}
