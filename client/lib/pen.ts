/* Editing a drawn letter's outline (see shared/engine/outline): the pure operations behind the pen
   tools. Each takes contours and returns new ones, leaving the old untouched for undo. Positions are
   font units, y up, rounded to whole units. */
import { ALL_CHARS, fitOutline, hasIn, hasOut, segment, signedArea, type Drawn, type Glyph, type Node } from '../../shared/engine';

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

export type Shape = 'rect' | 'ellipse';
/** A new contour: a rectangle (four corners) or an ellipse (four smooth points with handles the
    usual 0.552 of the radius out) filling the box from (x0, y0) to (x1, y1), run anticlockwise (y up)
    or, with `ccw` false, clockwise, so it fills in the letter as its other filled contours do. */
export function shapeContour(kind: Shape, x0: number, y0: number, x1: number, y1: number, ccw = true): Node[] {
  const l = R(Math.min(x0, x1)), r = R(Math.max(x0, x1)), b = R(Math.min(y0, y1)), t = R(Math.max(y0, y1));
  let con: Node[];
  if (kind === 'rect') con = [{ x: l, y: b }, { x: r, y: b }, { x: r, y: t }, { x: l, y: t }];
  else {
    const cx = (l + r) / 2, cy = (b + t) / 2, kx = (r - l) / 2 * 0.5523, ky = (t - b) / 2 * 0.5523;
    con = [
      { x: r, y: cy, ix: r, iy: cy - ky, ox: r, oy: cy + ky, s: 1 },
      { x: cx, y: t, ix: cx + kx, iy: t, ox: cx - kx, oy: t, s: 1 },
      { x: l, y: cy, ix: l, iy: cy + ky, ox: l, oy: cy - ky, s: 1 },
      { x: cx, y: b, ix: cx - kx, iy: b, ox: cx + kx, oy: b, s: 1 }
    ].map(n => ({ ...n, x: R(n.x), y: R(n.y), ix: R(n.ix), iy: R(n.iy), ox: R(n.ox), oy: R(n.oy) } as Node));
  }
  return ccw ? con : reverseContour([con], 0)[0];
}

/* ---- Sync all: a point moved in one letter moves in the others that have it too */

const traces = new WeakMap<Glyph, Drawn>();
/** A letter as the settings draw it, traced into points (once per build of it); a free font's letter
    has its points already, as the font has them. */
export function traceOf(g: Glyph): Drawn {
  let d = traces.get(g);
  if (!d) { d = g.drawn ?? { adv: Math.round(g.adv), contours: fitOutline(g.cmds) }; traces.set(g, d); }
  return d;
}

/** Small letters, capitals, figures, or the rest: the letters a synced point edit reaches. */
const kindOf = (ch: string) => (/[a-z]/.test(ch) ? 'a' : /[A-Z]/.test(ch) ? 'A' : /[0-9]/.test(ch) ? '0' : '.');

/** Where a point sits in its letter, to find the same point in another: its height, and how far it is
    from the letter's nearer side, or from its middle. */
function place(n: P, adv: number) {
  const f = adv > 0 ? n.x / adv : 0.5, side = f < 1 / 3 ? -1 : f > 2 / 3 ? 1 : 0;
  return { side, d: side < 0 ? n.x : side > 0 ? adv - n.x : n.x - adv / 2, y: n.y };
}

/** For each of `refs` in `from`, the point of `to` in the same place (within `tol` units), or null. */
export function samePoints(from: Drawn, refs: Ref[], to: Drawn, tol = 2): (Ref | null)[] {
  const taken = new Set<string>();
  const spots = to.contours.flatMap((con, c) => con.map((m, i) => ({ c, i, k: refKey({ c, i }), ...place(m, to.adv) })));
  return refs.map(r => {
    const n = from.contours[r.c]?.[r.i];
    if (!n) return null;
    const a = place(n, from.adv);
    let best: (typeof spots)[number] | null = null, bd = Infinity;
    for (const b of spots) {
      if (b.side !== a.side || Math.abs(b.y - a.y) > tol) continue;
      const d = Math.max(Math.abs(b.d - a.d), Math.abs(b.y - a.y));
      if (d <= tol && d < bd && !taken.has(b.k)) { best = b; bd = d; }
    }
    if (!best) return null;
    taken.add(best.k);
    return { c: best.c, i: best.i };
  });
}

/** Another letter a synced edit reaches: its outline, and its point for each of the edited ones (null where it has none). */
export interface Peer { ch: string; doc: Drawn; refs: (Ref | null)[] }

/** The other letters of `ch`'s kind with any of `refs` in the same place, each outline read by `outlineOf`. */
export function peersOf(ch: string, from: Drawn, refs: Ref[], outlineOf: (ch: string) => Drawn | null): Peer[] {
  if (!refs.length) return [];
  const kind = kindOf(ch), out: Peer[] = [];
  for (const o of ALL_CHARS) {
    if (o === ch || kindOf(o) !== kind) continue;
    const doc = outlineOf(o);
    if (!doc) continue;
    const pr = samePoints(from, refs, doc);
    if (pr.some(Boolean)) out.push({ ch: o, doc, refs: pr });
  }
  return out;
}

/** The peers' outlines with their points moved by (dx, dy), keyed by letter. */
export function movePeers(peers: Peer[], dx: number, dy: number): Record<string, Drawn> {
  return Object.fromEntries(peers.map(p => [p.ch, { adv: p.doc.adv, contours: moveAnchors(p.doc.contours, p.refs.filter((r): r is Ref => !!r), dx, dy) }]));
}

/** The peers' outlines with the `side` handle of their point for `refs[0]` moved by (dx, dy), where they have that handle. */
export function handlePeers(peers: Peer[], side: 'i' | 'o', dx: number, dy: number, free: boolean): Record<string, Drawn> {
  const out: Record<string, Drawn> = {};
  for (const p of peers) {
    const r = p.refs[0], n = r && p.doc.contours[r.c][r.i];
    if (!r || !n || !(side === 'i' ? hasIn(n) : hasOut(n))) continue;
    const h = side === 'i' ? { x: n.ix! + dx, y: n.iy! + dy } : { x: n.ox! + dx, y: n.oy! + dy };
    out[p.ch] = { adv: p.doc.adv, contours: setHandle(p.doc.contours, r, side, h, free) };
  }
  return out;
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

const sameNode = (a: Node, b: Node) => a.x === b.x && a.y === b.y && a.ix === b.ix && a.iy === b.iy && a.ox === b.ox && a.oy === b.oy && !a.s === !b.s;
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

  if (on.has('points')) for (const n of anchors) { spots.push({ x: n.x, y: n.y, label: 'anchor' }); xs.push({ v: n.x, label: 'point' }); ys.push({ v: n.y, label: 'point' }); }
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
  const near = (v: number, ls: Level[]) => ls.reduce<Level | undefined>((b, l) => (Math.abs(l.v - v) <= tol && (!b || Math.abs(l.v - v) < Math.abs(b.v - v) - 0.01 || (Math.abs(l.v - b.v) < 0.5 && b.label === 'point')) ? l : b), undefined);
  const sx = near(p.x, scene.xs), sy = near(p.y, scene.ys);
  return { x: sx?.v ?? R(p.x), y: sy?.v ?? R(p.y), gx: sx, gy: sy };
}
