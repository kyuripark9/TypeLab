/* Editing a drawn letter's outline (see shared/engine/outline): the pure operations behind the pen
   tools. Each takes contours and returns new ones, leaving the old untouched for undo. Positions are
   font units, y up, rounded to whole units. */
import { hasIn, hasOut, segment, signedArea, type Node } from '../../shared/engine';

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
  if (!s) m = { x: R(a.x + (b.x - a.x) * t), y: R(a.y + (b.y - a.y) * t) };
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
