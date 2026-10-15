/* A slab serif's slabs read off a letter's outline (slabsOf), and the letter without them: a wood type's, whose slabs are
   short blocks hardly wider than its fat stems. A slab is a stroke's end cut straight across (its face) and run out past
   the stroke's sides either way in a tab, as deep along the stroke as the slab is thick: the outline runs along the face,
   in at its end as deep as the slab, back along it to the stroke's side, and on up that. A slab may have a tab one side
   only (a flag, an n's top), the stroke's side leaving the face's end straight on the other; a beak (an E's arm's end,
   the face upright) is one too.

   Read by skin.ts, which draws such a font's lighter weights as their straight strokes with each slab a stroke along its
   face (lineSkeleton in lines.ts, the strokes' sides read off the letter without its slabs), or, a letter not all
   straight strokes, as the letter without its slabs, made lighter, with each slab laid back over it, thinner, along its
   face. Positions are in the font's units, y up. */
import type { Node } from './outline';

type P = { x: number; y: number };

/** A slab: its face's two ends as the slab is drawn along it (where it has no tab, the middle of the stroke there, or its
    side), the way in from the face, how deep it is, and which ends are a tab's. */
export interface Slab { a: P; b: P; nx: number; ny: number; d: number; ta: boolean; tb: boolean }

/** Two edges run the same way, or square to each other, within SQUARE (the sine or cosine of the angle between them). */
const SQUARE = 0.03;
/** A tab is no longer along its face than TAB times the slab is deep, and the face no shorter than FACE times; tabs
    either side are one slab's where one is no more than DEPTHS deeper than the other (a K's arm's, its slab's underside
    stepping where the arm meets it). */
const TAB = 1.2, FACE = 1.3, DEPTHS = 0.2;
/** A stroke's side leaves the face at no less than LEAVE (the sine of the angle) to it: running along it, it is a
    terminal's end, a C's, not a stroke's. */
const LEAVE = 0.5;
/** An end of a slab's face: whether it has a tab, and how deep; the node where the stroke's side leaves the face or its
    tab, and the way it leaves; whether it leaves curving; and the face's end node. */
interface End { tab: boolean; d: number; side: Node; u: P; curved: boolean; q: number }

/** Letter `cs`'s slabs, and its outline without them (each stroke's sides run straight on to its face); null where it has
    none. `inside` says whether a point is in its ink; `lines` are the letter's heights, `tol` how far off one is on it. */
export function slabsOf(cs: Node[][], inside: (x: number, y: number) => boolean, lines: number[] = [], tol = 0): { cs: Node[][]; slabs: Slab[] } | null {
  const slabs: Slab[] = [], out: Node[][] = [];
  for (const c of cs) {
    const n = c.length, at = (i: number) => c[((i % n) + n) % n];
    const straight = (i: number) => at(i).ox === undefined && at(i + 1).ix === undefined;
    const dir = (i: number, j: number) => { const p = at(i), q = at(j), l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (q.x - p.x) / l, y: (q.y - p.y) / l, l }; };
    // (where each node goes: dropped, or put where a stroke's side run on meets its face)
    const drop = new Set<number>(), put = new Map<number, P>(), before = new Map<number, P>(), after = new Map<number, P>();
    for (let i = 0; i < n; i++) {
      if (!straight(i)) continue;
      const F = dir(i, i + 1);
      if (F.l < 2) continue;
      let nx = -F.y, ny = F.x;
      const mx = (at(i).x + at(i + 1).x) / 2, my = (at(i).y + at(i + 1).y) / 2;
      if (!inside(mx + nx * 2, my + ny * 2)) { nx = -nx; ny = -ny; if (!inside(mx + nx * 2, my + ny * 2)) continue; }
      // each end of the face: a tab (in as deep as the slab, back along the face, then the stroke's side leaving it), or
      // the stroke's side leaving the face's end straight
      // (k: the step from the face's end out round the tab, +1 from its far end, -1 from its near one; back: the way
      // along the face toward its middle)
      const end = (q: number, k: 1 | -1) => {
        const seg = (m: number) => (k > 0 ? q + m - 1 : q - m), node = (m: number) => q + k * m;
        const ok = (m: number) => straight(seg(m));
        const back = { x: -F.x * k, y: -F.y * k };
        const s1 = dir(node(0), node(1)), s2 = dir(node(1), node(2));
        const tab = ok(1) && ok(2) && Math.abs(s1.x * F.x + s1.y * F.y) < SQUARE && s1.x * nx + s1.y * ny > 0 &&
          Math.abs(s2.x * nx + s2.y * ny) < SQUARE && s2.x * back.x + s2.y * back.y > 0 && s2.l <= TAB * s1.l;
        // (the stroke's side leaving it: along its tangent there where it is a curve)
        const lv = (m: number) => {
          const p = at(node(m)), h = k > 0 ? { x: p.ox ?? at(node(m + 1)).ix ?? at(node(m + 1)).x, y: p.oy ?? at(node(m + 1)).iy ?? at(node(m + 1)).y } : { x: p.ix ?? at(node(m + 1)).ox ?? at(node(m + 1)).x, y: p.iy ?? at(node(m + 1)).oy ?? at(node(m + 1)).y };
          const l = Math.hypot(h.x - p.x, h.y - p.y) || 1;
          return { x: (h.x - p.x) / l, y: (h.y - p.y) / l };
        };
        const u = lv(2), u0 = lv(0);
        // (or none: the outline leaving the face's end not back out of the ink, a stroke's side or a bowl's round running
        // on from a stem's foot along the line)
        const none: End | null = u0.x * nx + u0.y * ny >= -SQUARE ? { tab: false, d: 0, side: at(node(0)), u: u0, curved: false, q } : null;
        return { tab: tab && u.x * nx + u.y * ny >= LEAVE ? { tab: true, d: s1.l, side: at(node(2)), u, curved: !ok(3), q } as End : null, none };
      };
      const ea = end(i, -1), eb = end(i + 1, 1);
      // (a tab either end as deep as each other; or one, the other end none, or a tab as deep as it is not)
      let A = ea.tab, B = eb.tab;
      if (A && B && Math.abs(A.d - B.d) > DEPTHS * Math.min(A.d, B.d)) { if (eb.none && (!ea.none || A.d <= B.d)) B = null; else A = null; }
      A ??= ea.none; B ??= eb.none;
      if (!A || !B || (!A.tab && !B.tab)) continue;
      const d = A.tab && B.tab ? (A.d + B.d) / 2 : A.tab ? A.d : B.d;
      if (F.l < FACE * d) continue;
      // (where the stroke's side, run on, meets the face)
      const face = (e: End): P => {
        if (!e.tab) return { x: e.side.x, y: e.side.y };
        const s = -((e.side.x - at(i).x) * nx + (e.side.y - at(i).y) * ny) / (e.u.x * nx + e.u.y * ny);
        return { x: e.side.x + e.u.x * s, y: e.side.y + e.u.y * s };
      };
      const fa = face(A), fb = face(B);
      // (a side without a tab: the slab drawn out to the middle of the stroke there, or, where the stroke runs level along
      // one of the letter's lines (an E's arm, whose beak this is), to its side there, which stays on the line)
      const mid = { x: (fa.x + fb.x) / 2, y: (fa.y + fb.y) / 2 }, onLine = (e: End) => Math.abs(e.u.y) < SQUARE && lines.some(L => Math.abs(e.side.y - L) < tol);
      slabs.push({ a: A.tab ? { x: at(i).x, y: at(i).y } : onLine(A) ? fa : mid, b: B.tab ? { x: at(i + 1).x, y: at(i + 1).y } : onLine(B) ? fb : mid, nx, ny, d, ta: A.tab, tb: B.tab });
      for (const [e, k, f] of [[A, -1, fa], [B, 1, fb]] as const) {
        if (!e.tab) continue;
        const node = (m: number) => (((e.q + k * m) % n) + n) % n;
        drop.add(node(0)); drop.add(node(1));
        if (e.curved) (k > 0 ? before : after).set(node(2), f); else put.set(node(2), f);
      }
    }
    if (!drop.size) { out.push(c); continue; }
    const next: Node[] = [];
    c.forEach((p, k) => {
      if (drop.has(k)) return;
      const b = before.get(k), a = after.get(k), q = put.get(k);
      if (b) next.push({ x: b.x, y: b.y });
      next.push(q ? { x: q.x, y: q.y } : p);
      if (a) next.push({ x: a.x, y: a.y });
    });
    out.push(next);
  }
  return slabs.length ? { cs: out, slabs } : null;
}
