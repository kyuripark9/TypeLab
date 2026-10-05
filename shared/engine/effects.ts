/* Effects on finished outlines: a horizontal slice through every letter, and fills that rebuild
   a letter as a wireframe or from a grid of pixels, dots or lines, cut an inline down its strokes
   or cast a shadow behind it. They run on the glyph's final
   outline (after slant and spacing), so a grid lines up from one letter to the next. The outline
   is read with the nonzero rule, like the font itself: overlapping strokes count once. */
import { combine, shape } from './boolean';
import { cubicAt, dist, roundContour, roundCuts, signedArea, splitPoly } from './geom';
import type { Cmd, Pt } from './types';

/** Outline commands to polygons, curves sampled. Every point is `smooth`, so re-rounding
    only touches the new corners an effect cuts. */
export function toPolys(cmds: Cmd[]): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [], x = 0, y = 0;
  const add = (px: number, py: number) => {
    const q = cur[cur.length - 1];
    if (!q || Math.hypot(q.x - px, q.y - py) > 0.05) cur.push({ x: px, y: py, smooth: true });
    x = px; y = py;
  };
  const close = () => {
    while (cur.length > 1 && dist(cur[0], cur[cur.length - 1]) <= 0.05) cur.pop();
    if (cur.length > 2) out.push(cur);
    cur = [];
  };
  for (const c of cmds) {
    if (c[0] === 'M') { close(); add(c[1], c[2]); }
    else if (c[0] === 'L') add(c[1], c[2]);
    else if (c[0] === 'C') {
      const P = [{ x, y }, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }];
      for (let i = 1; i <= 6; i++) { const p = cubicAt(P, i / 6); add(p.x, p.y); }
    } else close();
  }
  close();
  return out;
}

const polysToCmds = (polys: Pt[][], R: number) => polys.flatMap(p => roundContour(p, R));

/** Whether p is inside the polygon (even-odd). */
function within(poly: Pt[], p: Pt) {
  let on = false;
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + (p.y - a.y) / (b.y - a.y) * (b.x - a.x)) on = !on;
  }
  return on;
}

/** Remove the band [y0, y1] from every contour, rounding the corners it cuts `round` of the way to
    a half round across each stroke it cuts (as if `w` wide where that can't be told). Each outline
    is cut together with the holes inside it (the counter of an o), so the corners rounded are
    the ink's. Ink the band leaves thinner than `minH` (where it grazes a bar) goes with it, unless
    that is all the letter keeps (a hyphen the band runs through), and a letter the band would take
    whole (a hyphen inside a wide one) stays as it is. */
export function slice(cmds: Cmd[], y0: number, y1: number, round: number, w: number, minH = 0): Cmd[] {
  const polys = toPolys(cmds), area = polys.map(signedArea);
  // a hole is wound against the outlines: it goes with the smallest outline around it
  const groups = new Map<number, Pt[][]>();
  polys.forEach((p, i) => {
    let home = i;
    if (area[i] < 0) {
      for (let j = 0; j < polys.length; j++) {
        if (area[j] > 0 && Math.abs(area[j]) > Math.abs(area[i]) && within(polys[j], p[0]) && (home === i || area[j] < area[home])) home = j;
      }
    }
    (groups.get(home) ?? groups.set(home, []).get(home)!).push(p);
  });
  let out: Pt[][] = [];
  for (const g of groups.values()) {
    for (const pl of [{ x: 0, y: y0, nx: 0, ny: 1 }, { x: 0, y: y1, nx: 0, ny: -1 }]) out.push(...splitPoly(g, pl));
  }
  if (!out.some(p => signedArea(p) > 0)) return cmds;
  const solid = out.filter(p => signedArea(p) < 0 || height(p) >= minH);
  if (solid.some(p => signedArea(p) > 0)) out = solid;
  // the corners the band cuts are the only ones not on the outline before
  return polysToCmds(out.map(p => roundCuts(p, q => !!q.sharp, round, w)), 0);
}

const height = (p: Pt[]) => Math.max(...p.map(q => q.y)) - Math.min(...p.map(q => q.y));

/** Where the scanline at height y is inside the outline (nonzero winding), as [x0, x1] spans. */
function spans(polys: Pt[][], y: number): [number, number][] {
  const xs: [number, number][] = [];
  for (const p of polys) {
    for (let i = 0, n = p.length; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n];
      if ((a.y <= y) !== (b.y <= y)) xs.push([a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x), b.y > a.y ? 1 : -1]);
    }
  }
  xs.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let w = 0, start = 0;
  for (const [x, d] of xs) {
    const was = w; w += d;
    if (!was && w) start = x;
    else if (was && !w && x > start) out.push([start, x]);
  }
  return out;
}
const inside = (sp: [number, number][], x: number) => sp.some(([a, b]) => x >= a && x < b);

interface Grid { i0: number; j0: number; cols: number; rows: number; on: Uint8Array }

/** Which cells of a grid anchored at the origin the outline covers: a cell is on when at least
    4 of its 3 × 3 sample points are inside, so strokes a third of a cell wide still show. */
function rasterize(polys: Pt[][], cell: number): Grid {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of polys) for (const q of p) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  if (!(x1 > x0)) return { i0: 0, j0: 0, cols: 0, rows: 0, on: new Uint8Array(0) };
  const i0 = Math.floor(x0 / cell), j0 = Math.floor(y0 / cell);
  const cols = Math.ceil(x1 / cell) - i0, rows = Math.ceil(y1 / cell) - j0;
  const on = new Uint8Array(cols * rows), S = [1 / 6, 1 / 2, 5 / 6];
  let any = false, best = 0, bestAt = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
  for (let j = 0; j < rows; j++) {
    const sub = S.map(f => spans(polys, (j0 + j + f) * cell));
    for (let i = 0; i < cols; i++) {
      let n = 0;
      for (const sp of sub) for (const f of S) if (inside(sp, (i0 + i + f) * cell)) n++;
      if (n >= 4) { on[j * cols + i] = 1; any = true; }
      if (n > best) { best = n; bestAt = j * cols + i; }
    }
  }
  // a mark thinner than half a cell (a light quote, a hairline bar) keeps the cell it covers most,
  // or the middle one, rather than vanishing
  if (!any && cols * rows) on[bestAt] = 1;
  return { i0, j0, cols, rows, on };
}

/* Outline of a set of grid cells: each on cell contributes the sides it shares with an off
   cell, anticlockwise, and the sides are chained into contours (outer ones anticlockwise,
   holes clockwise). Where two cells touch only at a corner the chain turns left, so they stay
   separate shapes instead of pinching together. */
function traceCells(G: Grid, cell: number): Pt[][] {
  const { i0, j0, cols, rows, on } = G;
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < cols && j < rows && on[j * cols + i] === 1;
  const key = (x: number, y: number) => x * 100003 + y;
  const edges = new Map<number, [number, number, number, number][]>();
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay); (edges.get(k) ?? edges.set(k, []).get(k)!).push([ax, ay, bx, by]);
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (!at(i, j)) continue;
    if (!at(i, j - 1)) add(i, j, i + 1, j);
    if (!at(i + 1, j)) add(i + 1, j, i + 1, j + 1);
    if (!at(i, j + 1)) add(i + 1, j + 1, i, j + 1);
    if (!at(i - 1, j)) add(i, j + 1, i, j);
  }
  const out: Pt[][] = [];
  for (const list of edges.values()) {
    while (list.length) {
      let e = list.pop()!;
      const pts: [number, number][] = [];
      for (;;) {
        pts.push([e[0], e[1]]);
        const next = edges.get(key(e[2], e[3]));
        if (!next || !next.length) break;
        const dx = e[2] - e[0], dy = e[3] - e[1];
        // prefer a left turn, then straight on, then right
        const rank = (f: [number, number, number, number]) => {
          const fx = f[2] - f[0], fy = f[3] - f[1], cr = dx * fy - dy * fx;
          return cr > 0 ? 0 : cr === 0 ? 1 : 2;
        };
        let bi = 0;
        for (let k = 1; k < next.length; k++) if (rank(next[k]) < rank(next[bi])) bi = k;
        e = next.splice(bi, 1)[0];
      }
      // drop points in the middle of straight runs
      const n = pts.length, poly: Pt[] = [];
      for (let k = 0; k < n; k++) {
        const a = pts[(k + n - 1) % n], b = pts[k], c = pts[(k + 1) % n];
        if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) poly.push({ x: (b[0] + i0) * cell, y: (b[1] + j0) * cell });
      }
      if (poly.length > 2) out.push(poly);
    }
  }
  return out;
}

const circle = (cx: number, cy: number, r: number): Cmd[] => {
  const k = r * 0.5523;
  return [['M', cx + r, cy], ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r], ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r], ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy], ['Z']];
};

/** Offset a closed polygon sideways by d (mitered, with a limit so sharp spikes stay short). */
function offset(p: Pt[], d: number): Pt[] {
  const n = p.length, out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y) || 1, l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1;
    const n1x = -(b.y - a.y) / l1, n1y = (b.x - a.x) / l1, n2x = -(c.y - b.y) / l2, n2y = (c.x - b.x) / l2;
    let mx = n1x + n2x, my = n1y + n2y;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) { mx = n1x; my = n1y; } else { mx /= ml; my /= ml; }
    const s = d / Math.max(0.4, mx * n1x + my * n1y);
    out.push({ x: b.x + mx * s, y: b.y + my * s, smooth: true });
  }
  return out;
}

export interface FillOpts {
  fill: string; cell: number; line: number; roundness: number;
  /** the size the fill is set at, 0 to 1 (Module) */ size: number;
  /** stem thickness, and the thickness of a stroke running in direction (dx, dy) */ stem: number; thick: (dx: number, dy: number) => number;
  /** the letter's centerlines, placed like its outline (the inline runs down them) */ skeleton: Pt[][];
}

/** How far down and to the right a shadow falls, for a stem `stem` thick at size `size`. */
export const shadowShift = (stem: number, size: number) => {
  const d = stem * (0.25 + 1.35 * size) + 12;
  return { dx: d * 0.75, dy: -d * 0.75 };
};

/** Distance from p to the segment ab. */
function toSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/** A line `w` wide down each centerline, where the stroke is thick enough to leave ink either side
    of it: it fades out in hairlines and stops short of the free ends of strokes (not where a stroke
    runs into another, so the lines of an H meet), and each run of it is a band polygon. */
function inlineBands(sk: Pt[][], w: number, o: FillOpts): Pt[][] {
  const lines = sk.filter(l => l.length > 1);
  const near = (p: Pt, self: number) => lines.some((l, i) => i !== self && l.some((q, k) => k + 1 < l.length && toSeg(p, q, l[k + 1]) < o.stem * 0.6));
  const out: Pt[][] = [];
  lines.forEach((line, li) => {
    const closed = dist(line[0], line[line.length - 1]) < 1;
    let pts = line.slice();
    // a free end loses as much as the stroke is thick there, plus the line's width
    const trim = (from: number) => {
      const s0 = pts[from], s1 = pts[from ? from - 1 : 1];
      let cut = o.thick(s1.x - s0.x, s1.y - s0.y) * 0.5 + w;
      while (pts.length > 1 && cut > 0) {
        const a = from ? pts[pts.length - 1] : pts[0], b = from ? pts[pts.length - 2] : pts[1], l = dist(a, b);
        if (l > cut) {
          const q = { x: a.x + (b.x - a.x) * cut / l, y: a.y + (b.y - a.y) * cut / l };
          if (from) pts[pts.length - 1] = q; else pts[0] = q;
          cut = 0;
        } else { if (from) pts.pop(); else pts.shift(); cut -= l; }
      }
    };
    if (!closed) {
      if (!near(pts[0], li)) trim(0);
      if (pts.length > 1 && !near(pts[pts.length - 1], li)) trim(pts.length - 1);
    }
    // runs of the centerline where the stroke is at least 2.4 lines thick
    let run: Pt[] = [];
    const flush = () => { if (run.length > 1) out.push(band(run, w)); run = []; };
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      if (o.thick(b.x - a.x, b.y - a.y) >= w * 2.4) { if (!run.length) run.push(a); run.push(b); }
      else flush();
    }
    flush();
  });
  return out;
}

/** The outline of a band `w` wide along the polyline, mitred where it turns. */
function band(run: Pt[], w: number): Pt[] {
  const n = run.length, L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = run[Math.max(0, i - 1)], b = run[i], c = run[Math.min(n - 1, i + 1)];
    let tx = c.x - a.x, ty = c.y - a.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    // the miter grows where the line turns, up to twice as wide
    const ux = b.x - a.x, uy = b.y - a.y, ul = Math.hypot(ux, uy);
    const cos = ul && i > 0 && i < n - 1 ? Math.max(0.5, (ux * tx + uy * ty) / ul) : 1, h = w / 2 / cos;
    L.push({ x: b.x - ty * h, y: b.y + tx * h }); R.push({ x: b.x + ty * h, y: b.y - tx * h });
  }
  return [...R, ...L.reverse()];
}

/** Rebuild an outline with a fill other than solid ink. */
export function fillOutline(cmds: Cmd[], o: FillOpts): Cmd[] {
  const polys = toPolys(cmds);
  if (!polys.length) return cmds;
  const { cell } = o;
  switch (o.fill) {
    case 'wire': {
      // every contour drawn as a thin ring, like the construction lines of a letter
      const out: Cmd[] = [];
      for (const p of polys) {
        const A = offset(p, o.line / 2), B = offset(p, -o.line / 2);
        const [outer, inner] = Math.abs(signedArea(A)) >= Math.abs(signedArea(B)) ? [A, B] : [B, A];
        if (signedArea(outer) < 0) outer.reverse();
        if (signedArea(inner) > 0) inner.reverse();
        out.push(...roundContour(outer, 0), ...roundContour(inner, 0));
      }
      return out;
    }
    case 'pixels': return polysToCmds(traceCells(rasterize(polys, cell), cell), cell * 0.5 * o.roundness);
    case 'dots': {
      const G = rasterize(polys, cell), out: Cmd[] = [];
      for (let j = 0; j < G.rows; j++) for (let i = 0; i < G.cols; i++) {
        if (G.on[j * G.cols + i]) out.push(...circle((G.i0 + i + 0.5) * cell, (G.j0 + j + 0.5) * cell, cell * 0.43));
      }
      return out;
    }
    case 'lines': {
      // one horizontal bar per grid row, as long as the letter is wide at that height
      let y0 = Infinity, y1 = -Infinity;
      for (const p of polys) for (const q of p) { y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      const h = cell * 0.52, out: Cmd[] = [];
      for (let j = Math.floor(y0 / cell); j * cell < y1; j++) {
        const yc = (j + 0.5) * cell;
        for (const [a, b] of spans(polys, yc)) {
          if (b - a < h * 0.3) continue;
          out.push(...roundContour([{ x: a, y: yc - h / 2 }, { x: b, y: yc - h / 2 }, { x: b, y: yc + h / 2 }, { x: a, y: yc + h / 2 }], h / 2 * o.roundness));
        }
      }
      return out;
    }
    case 'inline': {
      // the ink with a line cut down the middle of its strokes
      const w = o.stem * (0.08 + 0.3 * o.size), bands = inlineBands(o.skeleton, w, o);
      if (!bands.length) return cmds;
      const ink = shape(polys), cut = shape(bands);
      return polysToCmds(combine([ink, cut], (x, y) => ink.has(x, y) && !cut.has(x, y)), 0);
    }
    case 'shadow': {
      // a copy of the letter falls behind it down to the right, kept apart from it by a gap
      const ink = shape(polys), { dx, dy } = shadowShift(o.stem, o.size), gap = Math.max(10, o.stem * 0.16);
      // the letter grown by the gap: its joined outline pushed out, to the right of each contour, as
      // outlines come out of combine anticlockwise and holes clockwise
      const grown = shape(combine([ink], ink.has).map(p => offset(p, -gap))), back = shape(polys.map(p => p.map(q => ({ ...q, x: q.x + dx, y: q.y + dy }))));
      return polysToCmds(combine([ink, grown, back], (x, y) => ink.has(x, y) || (back.has(x, y) && !grown.has(x, y))), 0);
    }
    default: return cmds;
  }
}
