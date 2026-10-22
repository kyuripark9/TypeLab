/* Weight, Verticals, Horizontals and Contrast on a free font's letters, its drawing kept: the outline pushed out
   (heavier) or in (lighter) evenly all round, as a pen run along it a little wider or narrower would draw it, sideways
   by one distance (its upright strokes) and up and down by another (its level ones), and the letter set back on its
   lines. Every stroke, join, round and corner of the font's own drawing moves alike, so nothing the drawing hasn't comes
   out of it; and each setting reaches only so far as it can that way (PEN: shares of the font's stem at either end of
   its slider), never further in than HAIR_KEEP of its thinnest strokes, so no hairline wears away. A letter whose
   counter or opening would close all the same, or a stroke part, or two pieces run into one, is moved only as far as it
   can be without (found in halves).

   Read stroke by stroke and drawn again from its skeleton (skin.ts, before 2026-10-22), a letter reached every weight
   but broke on the way: joins notched, edges waved, hairlines thinned away, rounds came out heavier than its stems,
   bowls beaded and blotted at Verticals or Horizontals 0 and 100.

   The outline is read as polygons (curves cut every STEP units, straight edges every EDGE_STEP), each pushed sideways
   with its corners mitred (cut across past MITRE times the push, so a sharp tip doesn't throw a spike; an edge moved
   by the sideways push as far as it faces sideways, by the other as far as it faces up or down), and the pieces
   that fold back where they cross left out by reading it only where it winds anticlockwise on balance (shape(…, true) in
   boolean.ts). It grows (or shrinks) past its lines as it does sideways, so its heights are drawn back: a top onto the
   x-height, capitals' or ascenders' line, a foot onto the baseline or descenders' line, the heights between in step.
   Then it is traced back into curves (fitOutline), its straight runs straight. */
import { fitOutline, type Node } from './outline';
import { signedArea } from './geom';
import { combine, shape } from './boolean';

interface P { x: number; y: number; line?: boolean }

/** How far each setting pushes a letter out, either side, as a share of the font's stem, at the end of its slider
    past where the font was picked (`out`), and in at the other end (`in`): Weight sideways and up and down, Verticals
    sideways, Horizontals up and down, Contrast up and down (higher, in); and no further in, all told, than HAIR_KEEP of
    the font's thinnest strokes. */
export const PEN = {
  weight: { out: 0.15, in: 0.1 }, verticals: { out: 0.12, in: 0.08 }, horizontals: { out: 0.12, in: 0.08 }, contrast: { out: 0.08, in: 0.08 }
}, HAIR_KEEP = 0.25;
/** How far apart a curve is cut, and a straight edge, in the font's units; how many times the push a corner may reach
    out before it is cut across; how close the traced curves keep to the polygon. */
const STEP = 3, EDGE_STEP = 6, MITRE = 3, FIT_TOL = 0.8;
/** A piece of ink or paper smaller across than this share of the capitals' height, left over, goes. */
const SPECK = 0.012;
/** How many halvings find how far a letter whose counter would close is moved. */
const CLOSE_STEPS = 5;

/** The lines a letter stands on: tops (x-height, capitals', ascenders'), and feet (baseline, descenders'). */
export interface EvenLines { tops: number[]; feet: number[] }

/** `cs` pushed out `dx` font units sideways and `dy` up and down (in where negative), set back on `lines`; `cap` the
    capitals' height. */
export function evenWeight(cs: Node[][], dx: number, dy: number, lines: EvenLines, cap: number): Node[][] {
  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return cs;
  let rings = cs.map(polygon).filter(r => r.length > 2);
  // (as the engine reads ink: anticlockwise round it, clockwise round a hole; a font drawn the other way round turned)
  const lead = rings.reduce((a, r) => (Math.abs(signedArea(r)) > Math.abs(signedArea(a)) ? r : a), rings[0] ?? []);
  if (signedArea(lead) < 0) rings = rings.map(r => r.slice().reverse());
  // (as many pieces and holes as it had: none closed, parted or run together)
  const holes = (rs: P[][]) => rs.filter(r => signedArea(r) < 0).length, pieces = (rs: P[][]) => rs.length - holes(rs);
  const same = (rs: P[][]) => holes(rs) === holes(rings) && pieces(rs) === pieces(rings);
  let out = pushedOut(rings, dx, dy, lines, cap);
  if (!same(out)) {
    let lo = 0, hi = 1;
    out = rings;
    for (let k = 0; k < CLOSE_STEPS; k++) {
      const t = (lo + hi) / 2, o = pushedOut(rings, dx * t, dy * t, lines, cap);
      if (same(o)) { lo = t; out = o; } else hi = t;
    }
  }
  // (traced, a sliver may run flat: it goes too; and one whose curves cross themselves round a sharp tip is traced
  // again closer, or else drawn as the polygon it was)
  const speck = (SPECK * cap) ** 2;
  return out.flatMap(r => {
    const cmds: [string, ...number[]][] = [...straightened(r, p => !!p.line).map((p, i): [string, ...number[]] => [i ? 'L' : 'M', p.x, p.y]), ['Z']];
    for (const tol of [FIT_TOL, FIT_TOL / 4]) { const cs = fitOutline(cmds, tol); if (!cs.some(c => crosses(polygon(c)))) return cs; }
    return [r.map((p): Node => ({ x: p.x, y: p.y }))];
  }).filter(c => Math.abs(signedArea(polygon(c))) > speck);
}

/** Whether a ring crosses itself (two of its edges, not neighbours, cross). */
function crosses(r: P[]): boolean {
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n], x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = r[j], d = r[(j + 1) % n];
      if (Math.max(c.x, d.x) < x0 || Math.min(c.x, d.x) > x1 || Math.max(c.y, d.y) < y0 || Math.min(c.y, d.y) > y1) continue;
      const side = (p: P, q: P, s: P) => (q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x);
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true;
    }
  }
  return false;
}

/** Rings (anticlockwise round their ink) pushed out `dx` sideways and `dy` up and down, set back on `lines`, as
    polygons: their pieces and holes thinner than a speck gone, each point cut along a straight edge marked so. */
function pushedOut(rings: P[][], dx: number, dy: number, lines: EvenLines, cap: number): P[][] {
  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return rings;
  const pushed = rings.map(r => { const e = r.map((a, i) => unit(a, r[(i + 1) % r.length])); return push(r, e, dx, dy); });
  const back = linesBack(dy, lines), sh = shape(pushed, true), speck = SPECK * cap;
  // (a point cut along a straight edge, pushed, still marked so: straightened traces its run straight)
  const cut = new Set(pushed.flatMap(r => r.filter(p => p.line).map(p => `${p.x},${p.y}`)));
  // (a piece of ink or paper thinner across than a speck, its area over half its length round, goes)
  return combine([sh], sh.has).map(despiked).filter(r => Math.abs(signedArea(r)) > speck * speck && 2 * Math.abs(signedArea(r)) / round(r) > speck)
    .map(r => r.map(p => ({ x: p.x, y: back(p.y), line: cut.has(`${p.x},${p.y}`) })));
}

/** A ring without its needles: a point the outline runs out to and straight back from (a mitre's leftover where edges
    met nearly head on round a sharp tip), traced, came out a loop of no width. */
function despiked(r: P[]): P[] {
  let pts = r;
  for (let pass = 0; pass < 8 && pts.length > 3; pass++) {
    const n = pts.length, keep = pts.map((b, i) => {
      const a = pts[(i + n - 1) % n], c = pts[(i + 1) % n], u = unit(a, b), v = unit(b, c);
      return u.x * v.x + u.y * v.y > -0.98 && Math.hypot(b.x - a.x, b.y - a.y) > 1e-3;
    });
    if (keep.every(Boolean)) break;
    pts = pts.filter((_, i) => keep[i]);
  }
  return pts;
}

/** How far round a ring is. */
const round = (r: P[]) => r.reduce((s, p, i) => s + Math.hypot(r[(i + 1) % r.length].x - p.x, r[(i + 1) % r.length].y - p.y), 0);
const unit = (a: P, b: P) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };

/** A contour as a polygon: its curves cut every STEP units or so, its straight edges every EDGE_STEP. */
function polygon(c: Node[]): P[] {
  const out: P[] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    out.push({ x: a.x, y: a.y });
    const curve = a.ox !== undefined || b.ix !== undefined;
    const p1 = { x: a.ox ?? a.x, y: a.oy ?? a.y }, p2 = { x: b.ix ?? b.x, y: b.iy ?? b.y };
    const len = curve ? Math.hypot(p1.x - a.x, p1.y - a.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y) + Math.hypot(b.x - p2.x, b.y - p2.y) : Math.hypot(b.x - a.x, b.y - a.y);
    const m = curve ? Math.max(4, Math.ceil(len / STEP)) : Math.ceil(len / EDGE_STEP);
    for (let k = 1; k < m; k++) {
      const t = k / m, u = 1 - t;
      out.push(curve ? { x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y } : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, line: true });
    }
  }
  // (a point on top of the one before it would have no direction)
  return out.filter((p, i) => { const q = out[(i + out.length - 1) % out.length]; return Math.hypot(p.x - q.x, p.y - q.y) > 1e-6; });
}

/** A ring's edges each moved out (in where negative) `gx` as far as it faces sideways and `gy` as far as it faces up
    or down, its points where its edges, moved, meet again. Where they part round a corner they meet at a mitre, cut
    across past MITRE times the push; where they close in, they meet where they cross, or, round a tip sharper than
    that, each carried to its end, the loop they make winding the other way for shape(…, true) to leave out. */
function push(r: P[], e: P[], gx: number, gy: number): P[] {
  const n = r.length, out: P[] = [], most = MITRE * Math.max(Math.abs(gx), Math.abs(gy));
  for (let i = 0; i < n; i++) {
    const b = r[i], e1 = e[(i + n - 1) % n], e2 = e[i];
    const v1 = { x: e1.y * gx, y: -e1.x * gy }, v2 = { x: e2.y * gx, y: -e2.x * gy };
    // (how far out the corner goes, as its edges do across themselves: which way they part or close in)
    const g = (e1.y * v1.x - e1.x * v1.y + e2.y * v2.x - e2.x * v2.y) / 2;
    const cross = e1.x * e2.y - e1.y * e2.x;
    if (Math.abs(cross) < 0.02) { out.push({ x: b.x + (v1.x + v2.x) / 2, y: b.y + (v1.y + v2.y) / 2, line: b.line }); continue; }
    // where the two edges, moved, cross
    const ax = b.x + v1.x, ay = b.y + v1.y, cx = b.x + v2.x, cy = b.y + v2.y, s = ((cx - ax) * e2.y - (cy - ay) * e2.x) / cross;
    const m = { x: ax + e1.x * s, y: ay + e1.y * s }, reach = Math.hypot(m.x - b.x, m.y - b.y);
    if (reach <= most) { out.push(m); continue; }
    const parts = g > 0 ? cross > 0 : cross < 0;
    if (!parts) { out.push({ x: ax, y: ay }, { x: cx, y: cy }); continue; }
    // cut square across the mitre where it reaches MITRE times the push
    const ux = (m.x - b.x) / reach, uy = (m.y - b.y) / reach, d1 = e1.x * ux + e1.y * uy, d2 = -(e2.x * ux + e2.y * uy);
    const L1 = most - ((ax - b.x) * ux + (ay - b.y) * uy), L2 = most - ((cx - b.x) * ux + (cy - b.y) * uy);
    if (d1 < 1e-6 || d2 < 1e-6) { out.push({ x: ax, y: ay }, { x: cx, y: cy }); continue; }
    out.push({ x: ax + e1.x * L1 / d1, y: ay + e1.y * L1 / d1 }, { x: cx - e2.x * L2 / d2, y: cy - e2.y * L2 / d2 });
  }
  return out;
}

/** A ring with the points cut along its straight edges (`cut`) taken out where they still lie on a straight run (within
    a quarter unit of the line between their neighbours), so fitOutline traces them as straight edges. */
function straightened(r: P[], cut: (p: P) => boolean): P[] {
  let pts = r;
  for (let pass = 0; pass < 4; pass++) {
    const keep = pts.map(() => true);
    for (let i = 0; i < pts.length; i++) {
      if (!keep[(i + pts.length - 1) % pts.length] || !cut(pts[i])) continue;
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const l = Math.hypot(c.x - a.x, c.y - a.y);
      if (l > 1e-9 && Math.abs((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / l < 0.25 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0) keep[i] = false;
    }
    const next = pts.filter((_, i) => keep[i]);
    if (next.length === pts.length || next.length < 3) break;
    pts = next;
  }
  return pts;
}

/** Heights drawn back onto the lines the outline grew past (or shrank inside): a top `d` over its line onto it, a foot
    `d` under its line, and every height between moved in step, beyond the outermost carried on as they are. */
function linesBack(d: number, lines: EvenLines): (y: number) => number {
  const knots = [...lines.tops.map(y => [y + d, y]), ...lines.feet.map(y => [y - d, y])].sort((p, q) => p[0] - q[0]);
  // (lines nearer each other than they grew, a capital's and an ascender's, read as one)
  const ks = knots.filter((k, i) => i === 0 || k[0] - knots[i - 1][0] > 1);
  return (y: number) => {
    if (y <= ks[0][0]) return y + ks[0][1] - ks[0][0];
    const L = ks[ks.length - 1];
    if (y >= L[0]) return y + L[1] - L[0];
    let i = 1;
    while (ks[i][0] < y) i++;
    const [a, b] = [ks[i - 1], ks[i]], t = (y - a[0]) / (b[0] - a[0]);
    return a[1] + (b[1] - a[1]) * t;
  };
}
