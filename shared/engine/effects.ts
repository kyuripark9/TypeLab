/* Effects on finished outlines: a horizontal slice through every letter, and fills that rebuild
   a letter as a wireframe or from a grid of pixels, dots or lines, cut an inline down its strokes,
   draw it hollow (a line round the inside of its edge) or cast a shadow behind it. They run on the
   glyph's final outline, after slant and spacing (placeGlyph in glyph.ts calls them), so a grid lines
   up from one letter to the next. The outline is read with the nonzero rule, like the font itself:
   overlapping strokes count once. */
import type { Fill } from '../params';
import { combine, shape, type Shape } from './boolean';
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
export function slice(cmds: Cmd[], y0: number, y1: number, round: number, w: number, minH: number): Cmd[] {
  // (wound as the engine winds its outlines, anticlockwise: a free font's may run the other way round)
  let polys = toPolys(cmds), area = polys.map(signedArea);
  if (area.reduce((a, b) => a + b, 0) < 0) { polys = polys.map(p => p.slice().reverse()); area = polys.map(signedArea); }
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

/** Which cells a dot fill lights. Every stroke gets the same whole number of dots across, centred
    on it, wherever it falls on the grid (cells merely covered would make one stem one dot wide and
    the next two): a row's span of ink is a stroke's width when the ink runs on further up and down
    through its middle than across, and a column's when it runs on further across. Where ink runs on
    both ways (a stem meeting a bar), a cell is lit in a column a stem lit and a row a bar lit, so
    the join takes the dots of the strokes meeting in it, and a sliver at a tip takes none. */
function dotGrid(polys: Pt[][], cell: number): Grid {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of polys) for (const q of p) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  if (!(x1 > x0)) return { i0: 0, j0: 0, cols: 0, rows: 0, on: new Uint8Array(0) };
  // (a cell to spare all round, as a stroke's dots are centred on it and may stand out of its ink)
  const i0 = Math.floor(x0 / cell) - 1, j0 = Math.floor(y0 / cell) - 1;
  const cols = Math.ceil(x1 / cell) - i0 + 1, rows = Math.ceil(y1 / cell) - j0 + 1, N = cols * rows;
  // the outline turned on its side, so a column's spans are found as a row's
  const T = polys.map(p => p.map(q => ({ x: q.y, y: q.x })));
  const rowSp = Array.from({ length: rows }, (_, j) => spans(polys, (j0 + j + 0.5) * cell));
  const at = (sp: [number, number][], v: number): [number, number] => sp.find(([a, b]) => v >= a && v <= b) ?? [v, v];
  const median = (v: number[]) => { const s = [...v].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  /* One way across the grid (rows, or columns): which cells the strokes it crosses light, and which
     lie in a span running along one (the number of that run, from 1), with the runs. */
  const pass = (lo: number, lines: number, base: number, spansAt: (j: number) => [number, number][], crossAt: (mid: number, v: number) => [number, number],
    idx: (line: number, k: number) => number, len: number) => {
    const lit = new Uint8Array(N), along = new Int32Array(N), runs: [number, number, number][] = [];
    const cells = (j: number, a: number, b: number, f: (k: number) => void) => {
      for (let q = Math.ceil(a / cell - 0.5) - lo; (lo + q + 0.5) * cell <= b; q++) if (q >= 0 && q < len) f(idx(j, q));
    };
    type Across = { j: number; a: number; b: number; mid: number; cross: [number, number]; prev?: Across; next?: Across };
    const across: Across[][] = [];
    for (let j = 0; j < lines; j++) {
      const v = (base + j + 0.5) * cell, here: Across[] = [];
      for (const [a, b] of spansAt(j)) {
        const mid = (a + b) / 2, cross = crossAt(mid, v), cl = cross[1] - cross[0];
        if (b - a <= cl) {
          // a tip shorter than half a cell both ways is too small for a dot of its own
          if (cl >= cell * 0.5) here.push({ j, a, b, mid, cross });
        } else {
          runs.push([j, a, b]);
          cells(j, a, b, k => { along[k] = runs.length; });
        }
      }
      across.push(here);
    }
    // a stroke's spans from line to line are chained (where one leads on to just one), and each is
    // centred on the line through its neighbours and given their width: where another stroke runs
    // into it, its span takes in that one's ink too, and set on its own middle the dots would step
    // out of line. How far the middle moves from line to line tells how the stroke slants, and so
    // how wide it is square to its run (its span along a line is wider)
    const over = (p: Across, q: Across) => p.a < q.b && q.a < p.b;
    for (let j = 0; j + 1 < lines; j++) for (const p of across[j]) {
      const to = across[j + 1].filter(q => over(p, q));
      if (to.length === 1 && across[j].filter(q => over(q, to[0])).length === 1) { p.next = to[0]; to[0].prev = p; }
    }
    for (const line of across) for (const p of line) {
      if (p.prev) continue;
      const chain: Across[] = [];
      for (let q: Across | undefined = p; q; q = q.next) chain.push(q);
      chain.forEach((q, t) => {
        const win = chain.slice(Math.max(0, t - 3), t + 4);
        // (a step of a hair is an upright stroke's, not a slant to carry on with)
        const drift = win.length > 1 ? median(win.slice(1).map((r, u) => r.mid - win[u].mid)) : 0, step = Math.abs(drift) < cell * 0.05 ? 0 : drift;
        const mid = median(win.map(r => r.mid + step * (q.j - r.j)));
        const k = Math.max(1, Math.round(median(win.map(r => r.b - r.a)) / Math.hypot(1, step / cell) / cell));
        // a blob (the dot of an i), no longer than it is wide, keeps only its middle lines, as many as
        // it has dots across, or crossed one way and the other its dots would make a cross
        if (!step && chain.length <= k + 1) {
          const [c0, c1] = q.cross, k2 = Math.max(1, Math.round((c1 - c0) / cell)), f = Math.floor((c0 + c1) / 2 / cell - k2 / 2 + 0.5 + 1e-3) - base;
          if (q.j < f || q.j >= f + k2) return;
        }
        // (a stroke centred on a line between cells, as a stem often is, always takes the cell after)
        const s = Math.floor(mid / cell - k / 2 + 0.5 + 1e-3) - lo;
        // (but not out past its own span, as where the end of a slant is cut off square, or out of
        // half a cell of its middle, for a hairline)
        const lo2 = Math.min(q.a, q.mid - cell / 2) - 1e-6, hi2 = Math.max(q.b, q.mid + cell / 2) + 1e-6;
        for (let u = s; u < s + k; u++) {
          const c = (lo + u + 0.5) * cell;
          if (u >= 0 && u < len && c >= lo2 && c <= hi2) lit[idx(q.j, u)] = 1;
        }
      });
    }
    return { lit, along, runs };
  };
  const R = pass(i0, rows, j0, j => rowSp[j], (mid, y) => at(spans(T, mid), y), (j, i) => j * cols + i, cols);
  const C = pass(j0, cols, i0, i => spans(T, (i0 + i + 0.5) * cell), (mid, x) => at(spans(polys, mid), x), (i, j) => j * cols + i, rows);
  // whether a run along a row (or column) has a cell the other way lit
  const has = (run: [number, number, number], lit: Uint8Array, idx: (q: number) => number, lo: number, len: number) => {
    for (let q = Math.ceil(run[1] / cell - 0.5) - lo; (lo + q + 0.5) * cell <= run[2]; q++) if (q >= 0 && q < len && lit[idx(q)]) return true;
    return false;
  };
  const rowOk = R.runs.map(r => has(r, C.lit, i => r[0] * cols + i, i0, cols)), colOk = C.runs.map(r => has(r, R.lit, j => j * cols + r[0], j0, rows));
  const on = new Uint8Array(N);
  let any = false;
  for (let k = 0; k < N; k++) {
    on[k] = R.lit[k] || C.lit[k] || (R.along[k] && C.along[k] && rowOk[R.along[k] - 1] && colOk[C.along[k] - 1]) ? 1 : 0;
    if (on[k]) any = true;
  }
  if (!any) return rasterize(polys, cell);
  // a cell of ink is lit too where without it the dots either side would part (as where a slant
  // shoulder comes down into a stem a row below the shoulder's last dot, or two arms of a k meet)
  const lit = (i: number, j: number) => i >= 0 && j >= 0 && i < cols && j < rows && on[j * cols + i] === 1;
  for (let k = 0; k < N; k++) {
    const i = k % cols, j = (k - i) / cols;
    if (on[k] || !inside(rowSp[j], (i0 + i + 0.5) * cell)) continue;
    const ring: [number, number][] = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && lit(i + di, j + dj)) ring.push([di, dj]);
    if (ring.length < 2) continue;
    // (the dots round it fall in two or more groups not touching)
    const seen = new Set([0]), todo = [0];
    while (todo.length) {
      const [a, b] = ring[todo.pop()!];
      ring.forEach(([c, d], u) => { if (!seen.has(u) && Math.abs(a - c) <= 1 && Math.abs(b - d) <= 1) { seen.add(u); todo.push(u); } });
    }
    if (seen.size < ring.length) on[k] = 1;
  }
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

/** A closed polygon pushed d to its left (into the ink, as outlines run anticlockwise and holes
    clockwise), each edge moved out whole and the edges joined round a disc where they part. Where
    they cross instead, and where it is pushed past a curve tighter than d, the outline doubles back
    in a loop that winds the wrong way: read it with shape(…, true). No corner reaches past d, so a
    little notch in the outline doesn't throw a spike across the stroke as a mitre would. */
function inset(p: Pt[], d: number): Pt[] {
  const n = p.length, out: Pt[] = [];
  const nrm = (a: Pt, b: Pt) => { const l = dist(a, b) || 1; return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }; };
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n], n1 = nrm(a, b), n2 = nrm(b, c);
    out.push({ x: b.x + n1.x * d, y: b.y + n1.y * d });
    const turn = Math.atan2(n1.x * n2.y - n1.y * n2.x, n1.x * n2.x + n1.y * n2.y);
    // (turning right, the edges part: round the corner clockwise)
    if (turn < -0.2) for (let k = 1, m = Math.ceil(-turn / 0.35); k < m; k++) {
      const t = Math.atan2(n1.y, n1.x) + turn * k / m;
      out.push({ x: b.x + Math.cos(t) * d, y: b.y + Math.sin(t) * d });
    }
    out.push({ x: b.x + n2.x * d, y: b.y + n2.y * d });
  }
  return out;
}

interface FillOpts {
  /** the fill, one of FILLS (options.ts) */ fill: Fill;
  /** the grid's size for pixels, dots and lines (Metrics.cell; 0 for the other fills) */ cell: number;
  /** how wide the wire fill's ring is (glyph.ts sets it by the fill's Size) */ line: number;
  /** how round pixels' corners and the ends of the lines' bars are, 0 to 1 (Roundness) */ roundness: number;
  /** the size the fill is set at, 0 to 1 (the Fill's Size slider, params.module) */ size: number;
  /** stem thickness, and the thickness of a stroke running in direction (dx, dy) */ stem: number; thick: (dx: number, dy: number) => number;
  /** the letter's centerlines, placed like its outline (the inline runs down them) */ skeleton: Pt[][];
  /** whether a stroke ending at p runs on into the next letter (the entry and exit of a joined-up hand) */ joins: (p: Pt) => boolean;
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

/** How far the ink reaches from p each way along (nx, ny) and back, up to `max`: the first place
    it runs out, past the sides of strokes overlapping inside it. Null where p isn't in the ink. */
function across(ink: Shape, p: Pt, nx: number, ny: number, max: number): [number, number] | null {
  if (!ink.has(p.x, p.y)) return null;
  const hits: number[] = [];
  for (const poly of ink.polys) for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], ex = b.x - a.x, ey = b.y - a.y, d = nx * ey - ny * ex;
    if (Math.abs(d) < 1e-12) continue;
    const qx = a.x - p.x, qy = a.y - p.y, s = (qx * ey - qy * ex) / d, u = (qx * ny - qy * nx) / d;
    if (u >= 0 && u < 1 && Math.abs(s) < max) hits.push(s);
  }
  const reach = (sign: number) => {
    for (const s of hits.filter(s => s * sign > 0).sort((a, b) => (a - b) * sign)) {
      const t = s + sign * 0.01;
      if (!ink.has(p.x + nx * t, p.y + ny * t)) return Math.abs(s);
    }
    return max;
  };
  return [reach(1), reach(-1)];
}

/** One of the inline's centerlines (line `li` of `lines`), in steps no longer than the line is wide, with
    its ends settled against the ink and the other lines: a free end stops short of the end of its stroke
    (trim), an end that runs into another stroke stops on that stroke's line (meet), and a closed bowl
    against a stem opens there. `tips` are the last of the line at each end, laid whatever else lies
    there; `edge` is the least ink either side the line needs where it runs on into a stem's line. */
function inlineCenterline(line: Pt[], li: number, lines: Pt[][], w: number, o: FillOpts, ink: Shape, edge: number): { pts: Pt[]; tips: [Pt[], Pt[]] } {
  // (whether p lies near another stroke's line, so an end there runs into that stroke)
  const near = (p: Pt, self: number) => lines.some((l, i) => i !== self && l.some((q, k) => k + 1 < l.length && toSeg(p, q, l[k + 1]) < o.stem * 0.6));
  const closed = dist(line[0], line[line.length - 1]) < 1;
  // in steps no longer than the line is wide, so a straight stroke is looked at all along
  let pts: Pt[] = [line[0]];
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1], b = line[k], n = Math.ceil(dist(a, b) / w);
    for (let i = 1; i <= n; i++) pts.push({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n });
  }
  // a free end stops as far short of the end of the ink as the ink beside it is thick, so the
  // stroke is rimmed alike all round its end (a fixed share of the stroke would leave a solid block
  // there, much darker than the sides once the line is wide). The rim is measured a stroke in
  // from the end, and the ink ahead at both of the line's edges, so where the end is cut on a
  // slant the nearer corner keeps its rim too. Where a serif or a ball widens the end, the line
  // stops where the stroke begins to widen, as it runs into the serif
  const trim = (from: number) => {
    const s0 = pts[from], s1 = pts[from ? from - 1 : 1], th = o.thick(s1.x - s0.x, s1.y - s0.y);
    let cut = th * 0.5 + w;
    const l = dist(s0, s1);
    if (l > 1e-9) {
      const ux = (s0.x - s1.x) / l, uy = (s0.y - s1.y) / l, back = (t: number) => ({ x: s0.x - ux * t, y: s0.y - uy * t });
      const wide = (t: number) => { const r = across(ink, back(t), -uy, ux, o.stem * 4); return r && Math.min(r[0], r[1]); };
      const t = th * 0.25, p = back(t), side = Math.min(wide(th) ?? th / 2, th * 0.55);
      const ahead = [1, -1].map(sg => across(ink, { x: p.x - uy * sg * w / 2, y: p.y + ux * sg * w / 2 }, ux, uy, o.stem * 4));
      if (ahead[0] && ahead[1]) {
        // (walked in past a pointed or rounded tip, narrower than the stroke, to the widening)
        let flare = 0, seen = false;
        for (let f = 1; f < th * 2; f += w / 2) {
          const r = wide(f);
          if (r === null) continue;
          if (r > side * 1.2 + 1) { flare = f; seen = true; } else if (seen || r > side * 0.8) break;
        }
        cut = Math.max(0, side - w / 2 - (Math.min(ahead[0][0], ahead[1][0]) - t), flare);
      }
    }
    while (pts.length > 1 && cut > 0) {
      const a = from ? pts[pts.length - 1] : pts[0], b = from ? pts[pts.length - 2] : pts[1], l = dist(a, b);
      if (l > cut) {
        const q = { x: a.x + (b.x - a.x) * cut / l, y: a.y + (b.y - a.y) * cut / l };
        if (from) pts[pts.length - 1] = q; else pts[0] = q;
        cut = 0;
      } else { if (from) pts.pop(); else pts.shift(); cut -= l; }
    }
  };
  // an end that runs into another stroke stops where it meets that stroke's line, as the stem of
  // an I does at its slab's: its centerline goes on to the edge of the ink, and cut that far it
  // would run past the slab's line and split the slab in two. The last of it, from where it
  // comes alongside that line, is its tip, laid whatever else lies there: as the bowl of a u
  // curls into the stem, the two lines merge rather than one cutting the other into dashes
  const tips: [Pt[], Pt[]] = [[], []];
  const meet = (from: number) => {
    const end = from ? [...pts].reverse() : pts, d = (p: Pt) => Math.min(...lines.map((l, i) => i === li ? Infinity
      : Math.min(...l.slice(1).map((q, k) => toSeg(p, l[k], q)))));
    // (walked in from the end while it comes closer, in steps an eighth of the line's)
    let best = end[0], bd = d(best), seg = 0;
    walk: for (let k = 0; k + 1 < end.length; k++) for (let s = 1; s <= 8; s++) {
      const q = { x: end[k].x + (end[k + 1].x - end[k].x) * s / 8, y: end[k].y + (end[k + 1].y - end[k].y) * s / 8 }, dq = d(q);
      if (dq >= bd) break walk;
      best = q; bd = dq; seg = k;
    }
    let j = best === end[0] ? 1 : seg + 1;
    while (j < end.length && d(end[j]) < w * 0.6) j++;
    if (j >= end.length - 1) return;
    const tip = [...end.slice(best === end[0] ? 1 : seg + 1, j).reverse(), best].filter(p => dist(p, end[j]) > 1e-9);
    // and where it meets that line square and all that is left of the ink past it is its rim
    // (the corner of an L, the stem and top of an R), it runs on half its width, so the two lines
    // overlap at the corner rather than leave a square of ink between their ends. (Not where its
    // stroke goes on past the meeting, as the stem of an n does above its arch, nor where it
    // meets on a slant, as the leg of an R does: either would leave a stub poking out)
    const prev = tip.length > 1 ? tip[tip.length - 2] : end[j], l = dist(prev, best);
    if (tip.length && l > 1e-9) {
      const ux = (best.x - prev.x) / l, uy = (best.y - prev.y) / l, r = across(ink, best, ux, uy, o.stem * 4);
      let closest = Infinity, cos = 1;
      lines.forEach((ln, i) => { if (i !== li) for (let k = 1; k < ln.length; k++) {
        const dd = toSeg(best, ln[k - 1], ln[k]), sl = dist(ln[k - 1], ln[k]);
        if (dd < closest && sl > 1e-9) { closest = dd; cos = Math.abs((ln[k].x - ln[k - 1].x) * ux + (ln[k].y - ln[k - 1].y) * uy) / sl; }
      } });
      if (r && r[0] < o.thick(ux, uy) * 0.6 && cos < 0.2) tip.push({ x: best.x + ux * w / 2, y: best.y + uy * w / 2 });
    }
    tips[from ? 1 : 0] = tip;
    const rest = end.slice(j);
    pts = from ? rest.reverse() : rest;
  };
  // a closed bowl whose stroke runs into another's (the bowl of a single-storey a, of d, g, p or
  // b against its stem) opens where they run together, and each end carries on into the stem's
  // line. Kept closed, the bowl's ring would run down beside the stem's line with a sliver of ink
  // between, and the a would read as ci, the d as cl
  if (closed && lines.length > 1) {
    const ring = pts.slice(0, -1), m = ring.length, at = (i: number) => ring[((i % m) + m) % m];
    const foot = (p: Pt) => {
      let best = { d: Infinity, q: p };
      lines.forEach((l, i) => { if (i !== li) for (let k = 1; k < l.length; k++) {
        const a = l[k - 1], b = l[k], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0, q = { x: a.x + dx * t, y: a.y + dy * t };
        if (dist(p, q) < best.d) best = { d: dist(p, q), q };
      } });
      return best;
    };
    // whether the ink runs unbroken from p across to the other line
    const joined = (p: Pt) => {
      const { d, q } = foot(p);
      return d > 1e-9 && (across(ink, p, (q.x - p.x) / d, (q.y - p.y) / d, d + 1)?.[0] ?? 0) >= d - 1;
    };
    // where a line from p the way (ux, uy) meets the other line, if it gets there inside the ink
    // with room for the line either side all the way
    const reach = (p: Pt, ux: number, uy: number): Pt | null => {
      let hit = Infinity;
      lines.forEach((l, i) => { if (i !== li) for (let k = 1; k < l.length; k++) {
        const a = l[k - 1], ex = l[k].x - a.x, ey = l[k].y - a.y, den = ux * ey - uy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const qx = a.x - p.x, qy = a.y - p.y, s = (qx * ey - qy * ex) / den, u = (qx * uy - qy * ux) / den;
        if (s > 0 && u >= 0 && u <= 1) hit = Math.min(hit, s);
      } });
      if (hit > o.stem * 1.5) return null;
      for (let s = 0; s <= hit; s += w / 2) {
        const r = across(ink, { x: p.x + ux * s, y: p.y + uy * s }, -uy, ux, o.stem * 4);
        if (!r || Math.min(r[0], r[1]) < edge) return null;
      }
      return { x: p.x + ux * hit, y: p.y + uy * hit };
    };
    let k0 = 0;
    for (let k = 1; k < m; k++) if (foot(ring[k]).d < foot(ring[k0]).d) k0 = k;
    const d0 = foot(ring[k0]).d;
    // (not where the lines already touch or cross, as the bar of an e does its bowl)
    if (d0 > w * 0.6 && d0 < o.stem * 1.5 && joined(ring[k0])) {
      // each way from where they run closest, it opens as far round as the strokes stay joined
      // (any less leaves a sliver of ink cut off between the lines), and from there runs on the
      // way it was going, or where that runs alongside the stem's line and never meets it,
      // turned toward it as little as gets it there
      const end = (sg: number) => {
        for (const turn of [0, 0.25, 0.5, 1, 2]) {
          let found: { i: number; c: Pt } | null = null;
          for (let i = 1; i < m / 2 && joined(at(k0 + sg * i)); i++) {
            const p = at(k0 + sg * i), q = at(k0 + sg * (i - 1)), l = dist(p, q), f = foot(p);
            if (l < 1e-9) continue;
            const ux = (q.x - p.x) / l + (f.q.x - p.x) / f.d * turn, uy = (q.y - p.y) / l + (f.q.y - p.y) / f.d * turn, ul = Math.hypot(ux, uy);
            const c = reach(p, ux / ul, uy / ul);
            if (c) found = { i, c };
          }
          if (found) return found;
        }
        return null;
      };
      const a = end(1), b = end(-1);
      if (a && b) {
        const run: Pt[] = [];
        for (let i = k0 + a.i; i <= k0 + m - b.i; i++) run.push(at(i));
        // (cut square on the stem's line, an end lies inside that line, so it stops there)
        tips[0] = [a.c]; tips[1] = [b.c];
        pts = run;
      }
    }
  }
  // (an end where the letter joins the next runs right out, so the line carries on into it)
  if (!closed) {
    if (o.joins(pts[0])) { /* runs on */ } else if (near(pts[0], li)) meet(0); else trim(0);
    const e = pts.length - 1;
    if (pts.length < 2 || o.joins(pts[e])) { /* runs on */ } else if (near(pts[e], li)) meet(e); else trim(e);
  }
  return { pts, tips };
}

/** A line `w` wide down each centerline, where the stroke is thick enough to leave ink either side
    of it: it fades out in hairlines and stops short of the free ends of strokes (not where a stroke
    runs into another, so the lines of an H meet), and each run of it is a band polygon. It goes on
    strokes at least 2.4 lines thick, with 0.85 of a line of ink either side of its middle (or 0.6 for
    a short stretch between two that have it). */
function inlineBands(sk: Pt[][], w: number, o: FillOpts, ink: Shape): Pt[][] {
  const fit = { thick: w * 2.4, room: w * 0.85, edge: w * 0.6 };
  const lines = sk.filter(l => l.length > 1);
  const ways = lines.map((line, li) => {
    const { pts, tips } = inlineCenterline(line, li, lines, w, o, ink, fit.edge);
    // how far along the line, and how much it has turned, up to each point
    const S = [0], T = [0];
    for (let k = 1; k < pts.length; k++) {
      S.push(S[k - 1] + dist(pts[k - 1], pts[k]));
      const a = pts[k - 2], b = pts[k - 1], c = pts[k];
      T.push(T[k - 1] + (a ? Math.abs(Math.atan2((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y))) : 0));
    }
    // how far the ink reaches either side of each point, straight across the line (a hairline the
    // direction alone calls thick enough, as in a pointed pen's script, would be cut right through)
    const room = pts.map((p, k) => {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], l = dist(a, b) || 1;
      const r = across(ink, p, -(b.y - a.y) / l, (b.x - a.x) / l, o.stem * 4);
      return r ? Math.min(r[0], r[1]) : 0;
    });
    // where the stroke is at least 2.4 lines thick, and the ink beside the line no thinner than a
    // share of it. Where a wobbling hand thins the stroke for a moment and the line still fits, it
    // carries on through rather than breaking into dashes
    const ok = pts.slice(1).map((b, k) => {
      const a = pts[k], r = Math.min(room[k], room[k + 1]);
      return o.thick(b.x - a.x, b.y - a.y) < fit.thick ? 0 : r >= fit.room ? 2 : r >= fit.edge ? 1 : 0;
    });
    for (let k = 0; k < ok.length; k++) {
      if (ok[k] !== 1) continue;
      let e = k;
      while (e < ok.length && ok[e] === 1) e++;
      const fill = k > 0 && e < ok.length && ok[k - 1] === 2 && ok[e] === 2 && S[e] - S[k] < o.stem;
      for (let i = k; i < e; i++) ok[i] = fill ? 2 : 0;
      k = e - 1;
    }
    return { pts, S, T, room, ok, tips, keep: ok.map(() => false) };
  });
  // where the pen goes back over a line it has drawn (as a script does, up a stem and down again),
  // the line is laid down once: two bands on top of each other would cross at a hair's angle all
  // along and break the cut into dashes. The pieces with the most ink either side go first, so of
  // a hairline and the shaded stroke beside it, the line keeps to the middle of the shade. A piece
  // goes over another when it runs alongside it (on its own line, when that one is well along
  // from it or the line turned back between them). Laid pieces are found by where they are.
  const gap = Math.max(w * 4, o.stem), cell = w * 2, grid = new Map<string, [number, number][]>();
  const at = (p: Pt) => [Math.floor(p.x / cell), Math.floor(p.y / cell)];
  const mid = (li: number, k: number) => { const { pts } = ways[li]; return { x: (pts[k].x + pts[k + 1].x) / 2, y: (pts[k].y + pts[k + 1].y) / 2 }; };
  const over = (li: number, k: number) => {
    const W = ways[li], a = W.pts[k], b = W.pts[k + 1], l = dist(a, b) || 1, m = mid(li, k), [i0, j0] = at(m);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const [lj, kj] of grid.get(i + ',' + j) ?? []) {
      const V = ways[lj];
      if (lj === li && Math.abs(W.S[k] - V.S[kj]) < gap && Math.abs(W.T[k] - V.T[kj]) < 2) continue;
      const c = V.pts[kj], d = V.pts[kj + 1], sl = dist(c, d) || 1;
      if (Math.abs((b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y)) / l / sl > 0.9 && toSeg(m, c, d) < w * 0.6) return true;
    }
    return false;
  };
  const order: [number, number, number][] = [];
  ways.forEach((W, li) => W.ok.forEach((v, k) => { if (v === 2) order.push([li, k, Math.round(Math.min(W.room[k], W.room[k + 1]) / (w * 0.25))]); }));
  order.sort((p, q) => q[2] - p[2] || p[0] - q[0] || p[1] - q[1]);
  for (const [li, k] of order) {
    if (over(li, k)) continue;
    ways[li].keep[k] = true;
    const key = at(mid(li, k)).join(',');
    (grid.get(key) ?? grid.set(key, []).get(key)!).push([li, k]);
  }
  // each run of kept pieces is a band. Where one stops only because another takes over, it runs on
  // a step, so the two overlap rather than leave a sliver of ink between them (their points don't
  // line up)
  const out: Pt[][] = [];
  for (const { pts, keep, ok, tips } of ways) {
    let run: Pt[] = [];
    const on = (p: Pt, q: Pt): Pt => ({ x: p.x + (p.x - q.x) / (dist(p, q) || 1) * w, y: p.y + (p.y - q.y) / (dist(p, q) || 1) * w });
    const flush = (k: number) => {
      if (run.length > 1) {
        const k0 = k - run.length, from = k0 >= 0 && ok[k0] === 2, to = k < ok.length && ok[k] === 2;
        // (a scrap of line on its own, no longer than it is wide, is a speck, as where a thin neck
        // leaves a little of it in a ball or a wedge at the end of a stroke)
        const alone = !from && !to && !(k0 === -1 && tips[0].length) && !(k === ok.length && tips[1].length);
        if (alone && run.slice(1).reduce((s, p, i) => s + dist(run[i], p), 0) < w * 1.5) { run = []; return; }
        if (from) run.unshift(on(run[0], run[1]));
        if (to) run.push(on(run[run.length - 1], run[run.length - 2]));
        // (and a run out to an end that meets another stroke carries on over its tip)
        if (k0 === -1) run.unshift(...[...tips[0]].reverse());
        if (k === ok.length) run.push(...tips[1]);
        out.push(band(run, w));
      }
      run = [];
    };
    keep.forEach((kept, k) => { if (kept) { if (!run.length) run.push(pts[k]); run.push(pts[k + 1]); } else flush(k); });
    flush(keep.length);
  }
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
      const G = dotGrid(polys, cell), out: Cmd[] = [];
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
      const w = o.stem * (0.08 + 0.3 * o.size), ink = shape(polys), bands = inlineBands(o.skeleton, w, o, ink);
      if (!bands.length) return cmds;
      const cut = shape(bands);
      return polysToCmds(combine([ink, cut], (x, y) => ink.has(x, y) && !cut.has(x, y)), 0);
    }
    case 'outline': {
      // the letter drawn hollow, a line round the inside of its edge. The line is sized between the
      // stem and the thinner bars and bowls, so it reads alike round both
      const mean = (o.stem + Math.min(o.thick(1, 0), o.thick(0, 1))) / 2;
      const lw = Math.max(4, mean * (0.06 + 0.14 * o.size)), ink = shape(polys);
      // the rim: the joined letter, less its hollow turned round. The hollow is each contour pushed
      // into the ink, kept to the ink (pushed in past the sharp corner at the slanting end of an s,
      // it pokes out the far side). Where a stroke is too thin to hollow, the pushed outline turns
      // inside out and the stroke stays solid. Specks of hollow, in a tight corner, are left as ink
      const solid = combine([ink], ink.has), inner = shape(solid.map(p => inset(p, lw)), true);
      const hollow = combine([ink, inner], (x, y) => ink.has(x, y) && inner.has(x, y)).filter(p => signedArea(p) < 0 || signedArea(p) > lw * lw);
      return [...polysToCmds(solid, 0), ...polysToCmds(hollow.map(p => [...p].reverse()), 0)];
    }
    case 'shadow': {
      // the letter casts a solid shadow down to the right, kept apart from it by a gap. The shadow is
      // the letter swept along the way it falls, not a copy of it set off: a copy would fall clear of a
      // light stroke and read as a second letter, and the gap round one stroke would cut stripes across
      // the copy of another
      const ink = shape(polys), { dx, dy } = shadowShift(o.stem, o.size), gap = Math.max(10, o.stem * 0.16);
      const solid = combine([ink], ink.has);
      // the letter grown by the gap: its joined outline pushed out, to the right of each contour, as
      // outlines come out of combine anticlockwise and holes clockwise
      const grown = shape(solid.map(p => offset(p, -gap)));
      // the sweep: the letter where the shadow ends, and the band each run of edges facing the way it
      // falls passes over on the way (the edges facing away pass only over ink or the shadow's end),
      // every band turned anticlockwise so they add up under the nonzero rule
      const move = (q: Pt) => ({ x: q.x + dx, y: q.y + dy }), sweep = solid.map(p => p.map(move));
      for (const p of solid) {
        const n = p.length, faces = (i: number) => { const a = p[i % n], b = p[(i + 1) % n]; return (b.x - a.x) * dy - (b.y - a.y) * dx < -1e-6; };
        let i0 = 0;
        while (i0 < n && faces(i0 + n - 1)) i0++;
        for (let i = i0; i < i0 + n; i++) {
          if (!faces(i)) continue;
          const run = [p[i % n]];
          while (i < i0 + n && faces(i)) run.push(p[++i % n]);
          const swath = [...run, ...[...run].reverse().map(move)];
          sweep.push(signedArea(swath) < 0 ? swath.reverse() : swath);
        }
      }
      const back = shape(sweep), fleck = gap * gap * 2;
      // what the gap leaves of the shadow, less the specks it nearly cuts away (under the end of a
      // crossbar, beside the top of an arch), which read as dirt rather than as shadow
      const fall = combine([grown, back], (x, y) => back.has(x, y) && !grown.has(x, y));
      return polysToCmds([...solid, ...fall.filter(p => Math.abs(signedArea(p)) >= fleck)], 0);
    }
    case 'solid': return cmds;
    default:
      // (every fill has its case: one added to FILLS without one fails to compile here)
      o.fill satisfies never;
      return cmds;
  }
}
