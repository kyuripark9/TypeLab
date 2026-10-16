/* The corner shapes the slot blocks (blocks.ts) and the grid letters (grid-blocks.ts) share, cut into their rings of
   corners before they are rounded (roundContour, whose `cut` draws Facets): Steps notch each square corner outside a
   letter, and Ink traps carve a narrow round-bottomed slot into each corner inside it where two strokes meet. Each
   kind of block says which of its corners are which (`outer`, `join`); the rings come wound as they will be drawn, the
   ink left of the way round.

   A cut bites into the corner as roundContour would round it, so it starts where the round is and grows from nothing:
   the round is laid out as points along it (the same curve, Facets and all), the cut's outline taken in where it
   crosses them, and a corner the cut doesn't reach is left as it was. Stencil is here too: the slot blocks' counters
   cut open (stencilCounters); the grid letters' tiles are drawn in grid-blocks.ts. */
import { combine, shape } from './boolean';
import { MIN_ROUND, cubicAt, roundContour, roundCuts, signedArea, toPolys } from './geom';
import type { Cmd, Pt } from './types';

/** A corner of a block letter: one Steps may notch (a square corner outside the letter), or one Ink traps may carve
    (a corner inside it, where two strokes meet). */
export interface BlockPt extends Pt { outer?: boolean; join?: boolean }

/** How the corners are cut: `steps` (Steps, 0..1), how far a step reaches in past the corner's round as a share of
    `stepMax` (font units) or of the room the corner's sides leave it, if less; `trap`, how far a trap reaches into the
    ink past it, and `trapW`, how wide its mouth is (font units). `cut` is Facets, as roundContour takes it. None at 0. */
export interface CornerCuts { steps: number; stepMax: number; trap: number; trapW: number; cut: number }

/** Points sampled along a corner's round, each way. */
const ARC_STEPS = 12;

/** The rings with their corners cut as `c` says. */
export function cutCorners(rings: BlockPt[][], c: CornerCuts): Pt[][] {
  if (!c.steps && !c.trap) return rings;
  return rings.map(ring => {
    const n = ring.length, out: Pt[] = [];
    const turn = (i: number) => {
      const p = ring[i], a = ring[(i + n - 1) % n], b = ring[(i + 1) % n];
      const ux = p.x - a.x, uy = p.y - a.y, wx = b.x - p.x, wy = b.y - p.y, lu = Math.hypot(ux, uy), lw = Math.hypot(wx, wy);
      return { p, lu, lw, ax: ux / lu, ay: uy / lu, bx: wx / lw, by: wy / lw, th: Math.abs(Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy)) };
    };
    // how far along each side a corner's round runs, as roundContour gives it room (a corner given its own radius may
    // take nearly all of a side the corner at its other end leaves it)
    const want = (i: number) => { const t = turn(i); return t.th < 0.07 ? 0 : (ring[i].r ?? 0) * Math.tan(Math.min(t.th, 2.6) / 2); };
    const reach = (i: number) => {
      const t = turn(i), w = want(i), room = (len: number, o: number) => ring[i].r != null ? Math.max(len / 2, len * 0.95 - want(o)) : len / 2;
      const d = Math.min(w, room(t.lu, (i + n - 1) % n), room(t.lw, (i + 1) % n));
      return d < MIN_ROUND ? 0 : d;
    };
    ring.forEach((p, i) => {
      const t = turn(i);
      if (!t.lu || !t.lw || t.th < 0.07) { out.push(p); return; }
      const d = reach(i), f = d ? (4 / 3) * Math.tan(t.th / 4) / Math.tan(t.th / 2) * (1 - c.cut) : 0;
      // how far along each side the corner's own stretch runs: to where the corner before stops rounding, and the next starts
      const ea = Math.max(d, t.lu - Math.min(want((i + n - 1) % n), t.lu / 2)), eb = Math.max(d, t.lw - Math.min(want((i + 1) % n), t.lw / 2));
      // the corner's round as roundContour draws it, and the sides either way as far as the corners beside it leave them
      const T1 = { x: p.x - t.ax * d, y: p.y - t.ay * d }, T2 = { x: p.x + t.bx * d, y: p.y + t.by * d };
      const arc = [T1, { x: T1.x + (p.x - T1.x) * f, y: T1.y + (p.y - T1.y) * f }, { x: T2.x + (p.x - T2.x) * f, y: T2.y + (p.y - T2.y) * f }, T2];
      const mid = cubicAt(arc, 0.5);
      let cutter: Pt[] | null = null;
      if (c.steps && p.outer && Math.abs(t.ax * t.bx + t.ay * t.by) < 0.35) {
        // a square notch, its inner corner on the line from the corner through the round's middle, past the round by a
        // share of a stroke or of the corner's own stretch of its sides, whichever is less, so it grows all the way
        const k0 = Math.hypot(mid.x - p.x, mid.y - p.y) / Math.hypot(t.bx - t.ax, t.by - t.ay);
        const k = k0 + c.steps * Math.min(c.stepMax, Math.max(0, Math.min(ea, eb) * 0.97 - k0)), e = k * 0.5;
        cutter = [{ x: p.x + t.ax * e - t.bx * e, y: p.y + t.ay * e - t.by * e }, { x: p.x - t.ax * k - t.bx * e, y: p.y - t.ay * k - t.by * e },
          { x: p.x - t.ax * k + t.bx * k, y: p.y - t.ay * k + t.by * k, sharp: true }, { x: p.x + t.ax * e + t.bx * k, y: p.y + t.ay * e + t.by * k }];
      } else if (c.trap && p.join) {
        // a wedge along the corner's middle, into the ink (left of both sides): `trapW` across where it meets the round,
        // narrowing to a round bottom a third as wide, `trap` past the round
        let nx = -t.ay - t.by, ny = t.ax + t.bx;
        const nl = Math.hypot(nx, ny);
        if (nl > 1e-6) {
          nx /= nl; ny /= nl;
          // (its mouth no wider than the corner's own stretch of its sides leaves room for)
          const w = Math.min(c.trapW, Math.min(ea, eb) * 0.9), m = (mid.x - p.x) * nx + (mid.y - p.y) * ny, D = m + c.trap, o = m - Math.max(d, w) - w;
          const hb = w / 6, half = (at: number) => hb + (D - at) / c.trap * (w / 2 - hb), ho = half(o), ex = ny, ey = -nx;
          cutter = [{ x: p.x + nx * o + ex * ho, y: p.y + ny * o + ey * ho }, { x: p.x + nx * D + ex * hb, y: p.y + ny * D + ey * hb, r: hb },
            { x: p.x + nx * D - ex * hb, y: p.y + ny * D - ey * hb, r: hb }, { x: p.x + nx * o - ex * ho, y: p.y + ny * o - ey * ho }];
        }
      }
      const carved = cutter && carve(p, t, d, arc, ea, eb, cutter);
      if (carved) out.push(...carved); else out.push(p);
    });
    return out;
  });

  /** The corner `p` with `cutter` taken out of it: its sides `ea` back and `eb` on, its round sampled along `arc`;
      null if the cutter doesn't reach it. */
  function carve(p: BlockPt, t: { ax: number; ay: number; bx: number; by: number }, d: number, arc: Pt[], ea: number, eb: number, cutter: Pt[]): Pt[] | null {
    // the chain: from where the corner before stops rounding, along the side, round the corner, and on to where the next starts
    const chain: Pt[] = [{ x: p.x - t.ax * ea, y: p.y - t.ay * ea }];
    if (d) for (let s = 0; s <= ARC_STEPS; s++) { const q = cubicAt(arc, s / ARC_STEPS); chain.push({ x: q.x, y: q.y }); }
    else chain.push({ x: p.x, y: p.y });
    chain.push({ x: p.x + t.bx * eb, y: p.y + t.by * eb });
    const q = signedArea(cutter) < 0 ? [...cutter].reverse() : cutter, m = q.length;
    // where the chain crosses the cutter's sides, in order along the chain
    const hits: { j: number; s: number; k: number; u: number; x: number; y: number }[] = [];
    for (let j = 0; j + 1 < chain.length; j++) {
      const A = chain[j], B = chain[j + 1];
      for (let k = 0; k < m; k++) {
        const C = q[k], E = q[(k + 1) % m], rx = B.x - A.x, ry = B.y - A.y, sx = E.x - C.x, sy = E.y - C.y, den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-9) continue;
        const s = ((C.x - A.x) * sy - (C.y - A.y) * sx) / den, u = ((C.x - A.x) * ry - (C.y - A.y) * rx) / den;
        if (s >= 0 && s < 1 && u >= 0 && u < 1) hits.push({ j, s, k, u, x: A.x + rx * s, y: A.y + ry * s });
      }
    }
    if (hits.length < 2) return null;
    hits.sort((a, b) => a.j - b.j || a.s - b.s);
    const inn = hits[0], outt = hits[hits.length - 1];
    // in at the first crossing, round the cutter the way that keeps it on the right (its corners between), out at the last
    const way: Pt[] = [];
    if (inn.k !== outt.k || outt.u >= inn.u) for (let k = inn.k; ; k = (k + m - 1) % m) {
      way.push(q[k]);
      if (k === (outt.k + 1) % m) break;
      if (way.length > m) return null;
    }
    const smooth = (r: Pt) => ({ x: r.x, y: r.y, smooth: true });
    return [chain[0], ...chain.slice(1, inn.j + 1).map(smooth), { x: inn.x, y: inn.y, r: 0 }, ...way,
      { x: outt.x, y: outt.y, r: 0 }, ...chain.slice(outt.j + 1, chain.length - 1).map(smooth), chain[chain.length - 1]];
  }
}

/** Stencil on slot blocks: each closed counter cut open to the outside through the wall above it, the one below it, or
    both (a counter across the middle of the letter, as in O), by a gap `w` wide; `pos` slides the gap from the middle
    of the counter toward its left side, and `round` rounds the corners the cut leaves, as the stroke stencil's
    Rounding does. The letter comes back flattened to points, as the slice leaves it. */
export function stencilCounters(cmds: Cmd[], holes: Pt[][], w: number, pos: number, round: number): Cmd[] {
  if (!holes.length || !(w > 0)) return cmds;
  const polys = toPolys(cmds), ys = polys.flat().map(p => p.y), top = Math.max(...ys), foot = Math.min(...ys), h = top - foot;
  const cuts: Pt[][] = [];
  for (const hole of holes) {
    const xs = hole.map(p => p.x), hy = hole.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), mid = (Math.min(...hy) + Math.max(...hy)) / 2;
    const gw = Math.min(w, (x1 - x0) * 0.9), c = (x0 + x1) / 2 - (x1 - x0 - gw) * 0.45 * pos, l = c - gw / 2, r = c + gw / 2;
    const rect = (a: number, b: number): Pt[] => [{ x: l, y: a }, { x: r, y: a }, { x: r, y: b }, { x: l, y: b }];
    if (mid > foot + h * 0.4) cuts.push(rect(mid, top + h));
    if (mid < foot + h * 0.6) cuts.push(rect(foot - h, mid));
  }
  const ink = shape(polys), cut = shape(cuts);
  const out = combine([ink, cut], (x, y) => ink.has(x, y) && !cut.has(x, y));
  // the corners the cut makes are the points on its sides (combine gives back every point as a sample along a curve)
  const onCut = (q: Pt) => cuts.some(c => (Math.abs(q.x - c[0].x) < 0.01 || Math.abs(q.x - c[1].x) < 0.01) && q.y >= Math.min(c[0].y, c[2].y) - 0.01 && q.y <= Math.max(c[0].y, c[2].y) + 0.01);
  return out.flatMap(p => roundContour(roundCuts(p.map(q => (onCut(q) ? { x: q.x, y: q.y } : q)), q => !q.smooth, round, w), 0));
}
