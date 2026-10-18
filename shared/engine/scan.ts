/* A free font's letter scanned (see skin.ts for how its outline is moved): its ink read on a grid, how far
   each inked cell lies from the paper, and from that its skeleton, the middle line of its strokes, as a
   graph: the strokes' free ends, the places where strokes meet (joins), and between them the strokes
   themselves, each a run of points along its middle with how thick the stroke is there.

   The skeleton is the ink thinned away from its edges inward, nearest the paper first, a cell going only
   where that leaves the ink in as many pieces round as many holes (distance-ordered homotopic thinning),
   and a cell at the tip of a line kept where it is the middle of a round of ink no other round holds.
   Where a stroke ends square, the middle line forks out into its two corners: such short branches, no
   longer than the round of ink they leave from, are pruned.

   Read by skin.ts (a rigged letter's ink, its skeleton, its joins and its square ends), restyle.ts (the
   ends, serifs, stencil, bowls and corners it redraws) and free-letters.ts (the skeleton of each restyled
   outline, and the Inline down the strokes).
   Positions are in the font's units, y up, while a Grid's rows run down from the top (row 0 is the top),
   `cell` units a cell. A node with one edge is a stroke's free end, one with three or more a join, and a
   ring's lone node lists its edge twice (branches() reads it once each way). An edge's first and last
   points are its nodes. */
import type { Node } from './outline';

type P = { x: number; y: number };

/** A point on the skeleton, and the distance from it to the paper (half its stroke's thickness). */
export interface SkPt { x: number; y: number; r: number }
/** A stroke's free end (one edge), where strokes meet (three or more), or a point on a ring with no other (two, the same edge). */
export interface SkNode extends SkPt { edges: number[] }
/** A stroke between two nodes, its points from a to b. */
export interface SkEdge { a: number; b: number; pts: SkPt[]; len: number }
export interface Skeleton { nodes: SkNode[]; edges: SkEdge[] }

/* ---- the ink */

export interface Grid {
  /** the grid's bottom left corner and its size in cells, `cell` units a side */ x0: number; y0: number; W: number; H: number; cell: number;
  /** inked cells, row 0 at the top */ ink: Uint8Array;
  /** each cell's distance from the paper, in units */ dt: Float64Array;
}

/** The point t of the way along the outline's segment from node a to node b (skin.ts and restyle.ts sample by it too). */
export const bez = (a: Node, b: Node, t: number): P => {
  const p1x = a.ox ?? a.x, p1y = a.oy ?? a.y, p2x = b.ix ?? b.x, p2y = b.iy ?? b.y, u = 1 - t;
  return { x: u * u * u * a.x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * b.y };
};

/** One dimension of the exact distance transform (Felzenszwalb and Huttenlocher), squared distances. */
function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}

/** The contours' ink on a grid of `cell`-unit cells (nonzero, as the font is read), and each cell's distance to the paper. */
export function inkGrid(cs: Node[][], cell = 1): Grid {
  const rings = cs.map(c => { const out: P[] = []; for (let i = 0; i < c.length; i++) for (let k = 0; k < 12; k++) out.push(bez(c[i], c[(i + 1) % c.length], k / 12)); return out; });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  if (!(x0 < x1)) { x0 = x1 = y0 = y1 = 0; }
  x0 = Math.floor(x0) - 4 * cell; y0 = Math.floor(y0) - 4 * cell;
  const W = Math.ceil((x1 - x0) / cell) + 8, H = Math.ceil((y1 - y0) / cell) + 8, ink = new Uint8Array(W * H);
  // the ink, row by row through each row's middle; row 0 is the top
  // (each edge put in the rows it crosses, give or take one, rather than every row trying every edge)
  const rows: { x: number; w: number }[][] = Array.from({ length: H }, () => []);
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const r0 = Math.max(0, Math.floor(H - 0.5 - (Math.max(a.y, b.y) - y0) / cell) - 1), r1 = Math.min(H - 1, Math.ceil(H - 0.5 - (Math.min(a.y, b.y) - y0) / cell) + 1);
    for (let r = r0; r <= r1; r++) {
      const fy = y0 + (H - r - 0.5) * cell;
      if ((a.y <= fy) !== (b.y <= fy)) rows[r].push({ x: a.x + (fy - a.y) / (b.y - a.y) * (b.x - a.x), w: b.y > a.y ? 1 : -1 });
    }
  }
  for (let r = 0; r < H; r++) {
    const xs = rows[r];
    xs.sort((a, b) => a.x - b.x);
    let w = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      w += xs[i].w;
      if (w !== 0) for (let c = Math.max(0, Math.round((xs[i].x - x0) / cell)), e = Math.min(W, Math.round((xs[i + 1].x - x0) / cell)); c < e; c++) ink[r * W + c] = 1;
    }
  }
  const g = new Float64Array(W * H), n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  // down each column first, the squared distance to the column's nearest paper cell: what edt1 gives on a column of
  // paper (0) and ink (1e12), worked out from how many cells away the nearest paper above and below is, row by row so
  // it reads the grid in order (a column with no paper at all is 1e12 all the way, as edt1 has it)
  const FAR = 1 << 30, above = new Int32Array(W * H), below = new Int32Array(W);
  for (let i = 0; i < W * H; i++) above[i] = ink[i] ? (i >= W ? Math.min(FAR, above[i - W] + 1) : FAR) : 0;
  for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) {
    const i = y * W + x, b = ink[i] ? (y < H - 1 ? Math.min(FAR, below[x] + 1) : FAR) : 0, q = Math.min(above[i], b);
    below[x] = b;
    g[i] = q >= FAR ? 1e12 : q * q;
  }
  // then along each row
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = g[y * W + x]; edt1(f, W, d, v, z); for (let x = 0; x < W; x++) g[y * W + x] = Math.sqrt(d[x]) * cell; }
  return { x0, y0, W, H, cell, ink, dt: g };
}

/** A cell's middle, in units. */
const at = (g: Grid, i: number): P => ({ x: g.x0 + ((i % g.W) + 0.5) * g.cell, y: g.y0 + (g.H - Math.floor(i / g.W) - 0.5) * g.cell });

/** Whether the cell under a point is inked. */
export const inkAt = (g: Grid, x: number, y: number) => {
  const c = Math.floor((x - g.x0) / g.cell), r = Math.floor((g.y0 - y) / g.cell + g.H);
  return c >= 0 && r >= 0 && c < g.W && r < g.H && g.ink[r * g.W + c] > 0;
};

/* ---- thinning */

// the eight neighbours, counterclockwise from the east, as [column, row] steps (row down)
const NB: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]];

/** Which of cell i's eight neighbours are inked, as bits in NB's order (bit k the k-th). */
const around = (s: Uint8Array, W: number, i: number) =>
  (s[i + 1] ? 1 : 0) | (s[i - W + 1] ? 2 : 0) | (s[i - W] ? 4 : 0) | (s[i - W - 1] ? 8 : 0) | (s[i - 1] ? 16 : 0) | (s[i + W - 1] ? 32 : 0) | (s[i + W] ? 64 : 0) | (s[i + W + 1] ? 128 : 0);
/** For each way the neighbours can be inked (`around`): whether taking the cell away leaves the ink as connected as it was
    round it (Yokoi's number, 8-connected, is 1), and how many of them are inked. Read off a table, as the thinning asks
    it of every cell it tries. */
const SIMPLE = new Uint8Array(256), COUNT = new Uint8Array(256);
for (let m = 0; m < 256; m++) {
  const x = NB.map((_, k) => (m >> k) & 1);
  let n = 0;
  for (let k = 0; k < 8; k += 2) { const a = 1 - x[k], b = 1 - x[k + 1], c = 1 - x[(k + 2) % 8]; n += a - a * b * c; }
  SIMPLE[m] = n === 1 ? 1 : 0;
  COUNT[m] = x.reduce((p, q) => p + q, 0);
}
const neighbours = (s: Uint8Array, W: number, i: number) => COUNT[around(s, W, i)];

/** Ink s (W by H cells) with each pocket of paper it closes round no more than POCKET cells inked. Where a notch narrows
    to a slit running aslant, its cells meet only corner to corner, each a hole to ink read 8-connected, and thinning,
    which keeps holes, ran the skeleton round each, a loop where the letter has no counter: a grotesque 5's notch where
    its bowl leaves its stem, the joins at either end of the loop drawn again as strokes at Thin, heavy, and an italic's
    n's and h's where its arch leaves its stem. */
function fillPockets(s: Uint8Array, W: number, H: number) {
  // (the paper the page's edge reaches, 4-connected)
  const out = new Uint8Array(W * H), stack: number[] = [];
  for (let i = 0; i < W * H; i++) if (!s[i] && (i < W || i >= W * (H - 1) || i % W === 0 || i % W === W - 1)) { out[i] = 1; stack.push(i); }
  while (stack.length) { const i = stack.pop()!; for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < W * H && !s[j] && !out[j]) { out[j] = 1; stack.push(j); } }
  // (and each hole, read whole, inked if small)
  const seen = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (s[i] || out[i] || seen[i]) continue;
    const hole = [i];
    seen[i] = 1;
    for (let k = 0; k < hole.length; k++) for (const j of [hole[k] - 1, hole[k] + 1, hole[k] - W, hole[k] + W]) if (!s[j] && !seen[j]) { seen[j] = 1; hole.push(j); }
    if (hole.length <= POCKET) for (const j of hole) s[j] = 1;
  }
}
/** The most cells a pocket of paper the ink closes round may hold and be inked before thinning (thin): a counter holds
    hundreds. */
const POCKET = 6;
/** The ink thinned to its skeleton: one cell wide, as connected as the ink, and keeping its holes. */
function thin(g: Grid, pockets = false): Uint8Array {
  const { W, H, dt } = g, s = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) s[i] = g.ink[i];
  // (where asked, a pocket of paper no more than POCKET cells the ink closes round, inked: fillPockets)
  if (pockets) fillPockets(s, W, H);
  // the middle of a round of ink no neighbour's round holds: none of them is as much further from the
  // paper as it is from this cell
  // (each neighbour's step in cells, in NB's order, and how much further from the paper it would have to be)
  const step = NB.map(([dc, dr]) => dr * W + dc), far = NB.map(([dc, dr]) => Math.hypot(dc, dr) * g.cell * 0.9);
  const centre = (i: number) => {
    for (let k = 0; k < 8; k++) if (dt[i + step[k]] - dt[i] >= far[k]) return false;
    return true;
  };
  // a binary heap of cells by their distance to the paper, the nearest first: `heap` the cells, `key` their distances
  // beside them, `size` how many; a cell is in it at most once at a time (`queued`), so it never holds more than the ink
  let inked = 0;
  for (let i = 0; i < W * H; i++) inked += s[i];
  const heap = new Int32Array(inked), key = new Float64Array(inked), queued = new Uint8Array(W * H);
  let size = 0;
  const swap = (a: number, b: number) => { const c = heap[a], d = key[a]; heap[a] = heap[b]; key[a] = key[b]; heap[b] = c; key[b] = d; };
  const push = (i: number) => {
    heap[size] = i; key[size] = dt[i]; queued[i] = 1;
    let k = size++;
    while (k > 0) { const p = (k - 1) >> 1; if (key[p] <= key[k]) break; swap(p, k); k = p; }
  };
  const pop = () => {
    const top = heap[0];
    size--;
    if (size) {
      heap[0] = heap[size]; key[0] = key[size];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < size && key[l] < key[m]) m = l;
        if (r < size && key[r] < key[m]) m = r;
        if (m === k) break;
        swap(m, k); k = m;
      }
    }
    queued[top] = 0;
    return top;
  };
  for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) {
    const i = r * W + c;
    if (s[i] && (!s[i - 1] || !s[i + 1] || !s[i - W] || !s[i + W])) push(i);
  }
  while (size) {
    const i = pop();
    if (!s[i]) continue;
    const m = around(s, W, i);
    if (!SIMPLE[m]) continue;
    if (COUNT[m] === 1 && centre(i)) continue;
    s[i] = 0;
    for (let k = 0; k < 8; k++) { const j = i + step[k]; if (s[j] && !queued[j]) push(j); }
  }
  // a staircase leaves cells with a neighbour each way round a corner (one to the east, one to the north):
  // those that can go, go, so a line is one cell wide on the diagonal too
  for (let pass = 0; pass < 2; pass++) for (let i = W; i < W * (H - 1); i++) {
    if (!s[i]) continue;
    const m = around(s, W, i);
    if (COUNT[m] < 2) continue;
    const e = m & 1, n = m & 4, w = m & 16, so = m & 64;
    if (((e && n) || (n && w) || (w && so) || (so && e)) && SIMPLE[m]) s[i] = 0;
  }
  return s;
}

/* ---- the graph */

/** The skeleton of a letter's outline: its ends, joins and strokes. `cell` is the grid's in units (2 reads a
    letter 1000 units to the em finely enough for its hairlines, and quickly). `through` keeps a short stroke running
    straight on through the join it leaves, and `round` one ending round (prune); `pockets` reads it with the pockets of
    paper its ink closes round no more than POCKET cells inked (fillPockets). */
export function skeleton(cs: Node[][], cell = 2, through = false, round = false, pockets = false): Skeleton {
  const g = inkGrid(cs, cell), s = thin(g, pockets), { W } = g;
  const deg = new Int8Array(W * g.H);
  const on: number[] = [];
  for (let i = W; i < W * (g.H - 1); i++) if (s[i]) { deg[i] = neighbours(s, W, i); on.push(i); }
  const nb = (i: number) => NB.map(([dc, dr]) => i + dr * W + dc).filter(j => s[j]);
  // joins: cells with three or more neighbours, those touching taken as one
  const nodeOf = new Int32Array(W * g.H).fill(-1), nodes: SkNode[] = [];
  for (const i of on) {
    if (nodeOf[i] >= 0 || (deg[i] !== 1 && deg[i] < 3)) continue;
    const id = nodes.length, cluster = [i];
    nodeOf[i] = id;
    if (deg[i] >= 3) for (let k = 0; k < cluster.length; k++) for (const j of nb(cluster[k])) if (nodeOf[j] < 0 && deg[j] >= 3) { nodeOf[j] = id; cluster.push(j); }
    let x = 0, y = 0, r = 0;
    for (const j of cluster) { const q = at(g, j); x += q.x; y += q.y; r = Math.max(r, g.dt[j]); }
    nodes.push({ x: x / cluster.length, y: y / cluster.length, r, edges: [] });
  }
  // strokes: from each node, along the cells with two neighbours, to the next node
  const edges: SkEdge[] = [], used = new Uint8Array(W * g.H), pairs = new Set<string>();
  const finish = (a: number, b: number, cells: number[]) => {
    if (a === b && cells.length < 3) return;
    const pts: SkPt[] = [{ x: nodes[a].x, y: nodes[a].y, r: nodes[a].r }, ...cells.map(i => ({ ...at(g, i), r: g.dt[i] })), { x: nodes[b].x, y: nodes[b].y, r: nodes[b].r }];
    const id = edges.length;
    edges.push({ a, b, pts, len: 0 });
    nodes[a].edges.push(id); nodes[b].edges.push(id);
  };
  for (const c of on) {
    if (nodeOf[c] < 0) continue;
    for (const j of nb(c)) {
      if (nodeOf[j] >= 0) {
        // two nodes side by side, with no cells between
        const key = Math.min(nodeOf[c], nodeOf[j]) + ',' + Math.max(nodeOf[c], nodeOf[j]);
        if (nodeOf[j] !== nodeOf[c] && !pairs.has(key)) { pairs.add(key); finish(nodeOf[c], nodeOf[j], []); }
        continue;
      }
      if (used[j]) continue;
      const cells: number[] = [];
      let prev = c, cur = j, to = -1;
      for (;;) {
        if (nodeOf[cur] >= 0) { to = nodeOf[cur]; break; }
        if (used[cur]) break;
        used[cur] = 1; cells.push(cur);
        const next = nb(cur).filter(k => k !== prev && !(nodeOf[k] < 0 && used[k]));
        // (back into the node it left from, a loop: only once it has gone some way)
        const pick = next.find(k => nodeOf[k] >= 0 && (nodeOf[k] !== nodeOf[c] || cells.length > 2)) ?? next.find(k => nodeOf[k] < 0);
        if (pick === undefined) break;
        prev = cur; cur = pick;
      }
      if (to >= 0) finish(nodeOf[c], to, cells);
    }
  }
  // rings with no node (an o's skeleton): a node is put on each
  for (const i of on) if (!used[i] && nodeOf[i] < 0 && deg[i] === 2) {
    const id = nodes.length, q = at(g, i);
    nodes.push({ ...q, r: g.dt[i], edges: [] });
    nodeOf[i] = id;
    used[i] = 1;
    const [j] = nb(i).filter(j => !used[j]);
    if (j === undefined) continue;
    const cells: number[] = [];
    let prev = i, cur = j;
    while (cur !== i && !used[cur]) {
      used[cur] = 1; cells.push(cur);
      const next = nb(cur).filter(k => k !== prev && (!used[k] || k === i));
      if (!next.length) break;
      prev = cur; cur = next.includes(i) && cells.length > 2 ? i : next[0];
    }
    finish(id, id, cells);
  }
  const sk = prune({ nodes, edges }, through, round);
  for (const e of sk.edges) e.pts = smooth(e.pts);
  // a stroke's end that runs on into one of its corners (a square end whose other corner was pruned):
  // where the round of ink shrinks toward the tip as fast as into a corner, it is cut back to where that starts
  sk.nodes.forEach((n, ni) => {
    if (n.edges.length !== 1) return;
    const E = sk.edges[n.edges[0]], fromA = E.a === ni, pts = fromA ? E.pts : E.pts.slice().reverse();
    // (read over a few cells at a time, from the tip in, until it no longer grows that fast)
    let cut = 0;
    for (let k = 0; k + 3 < pts.length - 1; k++) {
      let ds = 0;
      for (let j = k + 1; j <= k + 3; j++) ds += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y);
      // (as a square corner's does, or a sharper one's, slower, down to about 35°)
      if ((pts[k + 3].r - pts[k].r) / (ds || 1) < 0.3) break;
      cut = k + 3;
    }
    if (!cut || cut >= pts.length - 2) return;
    const kept = pts.slice(cut), tip = kept[0];
    E.pts = fromA ? kept : kept.slice().reverse();
    Object.assign(n, { x: tip.x, y: tip.y, r: tip.r });
  });
  for (const e of sk.edges) e.len = lenOf(e.pts);
  return sk;
}

/** How long a run of skeleton points is. */
const lenOf = (pts: SkPt[]) => { let l = 0; for (let k = 1; k < pts.length; k++) l += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return l; };

/** Branches that are only a stroke's square end forking into its corners, or a bump on its edge, pruned:
    a branch to a free end that reaches no further out than the round of ink it leaves from, give or take. With
    `through`, one running on from another stroke through the join it leaves (within 40°: a square end forks into its
    corners at 45°), out past the join's round and as thick as two fifths of it at its end (not a fork into a corner,
    which ends in a sliver) stays: a d's stem below its bowl, an n's above its arch, short in a heavy letter, a stroke in
    a light one. With `round`, one ending round, at least half as thick as the join it leaves, and out past the join's
    round stays too: a heavy w's feet and its middle peak, short beside their joins' rounds. */
function prune(sk: Skeleton, through = false, round = false): Skeleton {
  let { nodes, edges } = sk;
  const alive = edges.map(() => true);
  // (the way an edge leaves node n, read as far out along it as the node's round reaches)
  const way = (e: SkEdge, n: number) => {
    const pts = e.a === n ? e.pts : e.pts.slice().reverse(), N = nodes[n];
    const q = pts.find(p => Math.hypot(p.x - N.x, p.y - N.y) >= N.r) ?? pts[pts.length - 1], l = Math.hypot(q.x - N.x, q.y - N.y) || 1;
    return { x: (q.x - N.x) / l, y: (q.y - N.y) / l };
  };
  const runsOn = (i: number, root: number, tip: number) => {
    const e = edges[i], u = way(e, root);
    if (lenOf(e.pts) + nodes[tip].r < nodes[root].r || nodes[tip].r < 0.4 * nodes[root].r) return false;
    return nodes[root].edges.some(k => k !== i && alive[k] && (() => { const v = way(edges[k], root); return u.x * v.x + u.y * v.y < -0.766; })());
  };
  const roundEnd = (i: number, root: number, tip: number) => round && nodes[tip].r >= 0.5 * nodes[root].r && lenOf(edges[i].pts) + nodes[tip].r >= 1.25 * nodes[root].r;
  for (let pass = 0; pass < 6; pass++) {
    let cut = false;
    // every branch that is only a fork is cut at once, so a square end's two corners both go, leaving the
    // stroke ending where they forked (though never every stroke from a node: the longest stays)
    const live = (n: number) => nodes[n].edges.filter(k => alive[k]).length;
    const spurs = new Map<number, number[]>();
    edges.forEach((e, i) => {
      if (!alive[i] || e.a === e.b) return;
      const ends = [e.a, e.b].filter(n => live(n) === 1);
      if (ends.length !== 1) return;
      const tip = ends[0], root = tip === e.a ? e.b : e.a;
      if (live(root) < 3) return;
      if (lenOf(e.pts) + nodes[tip].r < nodes[root].r * 2 + 2 && !((through && runsOn(i, root, tip)) || roundEnd(i, root, tip))) { const l = spurs.get(root) ?? []; l.push(i); spurs.set(root, l); }
    });
    for (const [root, l] of spurs) {
      const keep = live(root) - l.length >= 1 ? -1 : l.reduce((a, b) => (lenOf(edges[a].pts) >= lenOf(edges[b].pts) ? a : b));
      for (const i of l) if (i !== keep) { alive[i] = false; cut = true; }
    }
    // a node left with two strokes joins them into one
    for (let n = 0; n < nodes.length; n++) {
      const es = nodes[n].edges.filter(k => alive[k]);
      if (es.length !== 2 || es[0] === es[1]) continue;
      const [p, q] = es.map(k => edges[k]);
      const pPts = p.b === n ? p.pts : p.pts.slice().reverse(), pFrom = p.b === n ? p.a : p.b;
      const qPts = q.a === n ? q.pts : q.pts.slice().reverse(), qTo = q.a === n ? q.b : q.a;
      if (pFrom === n || qTo === n) continue;
      const id = edges.length;
      edges.push({ a: pFrom, b: qTo, pts: [...pPts, ...qPts.slice(1)], len: 0 });
      alive.push(true); alive[es[0]] = alive[es[1]] = false;
      nodes[pFrom].edges.push(id); nodes[qTo].edges.push(id);
      cut = true;
    }
    if (!cut) break;
  }
  // renumbered, without what was pruned
  const keepE = edges.map((_, i) => i).filter(i => alive[i]), eId = new Map(keepE.map((k, j) => [k, j]));
  const usedN = new Set(keepE.flatMap(i => [edges[i].a, edges[i].b]));
  const keepN = nodes.map((_, i) => i).filter(i => usedN.has(i) || nodes[i].edges.length === 0), nId = new Map(keepN.map((k, j) => [k, j]));
  return {
    nodes: keepN.map(i => ({ ...nodes[i], edges: nodes[i].edges.filter(k => alive[k]).map(k => eId.get(k)!) })),
    edges: keepE.map(i => ({ ...edges[i], a: nId.get(edges[i].a)!, b: nId.get(edges[i].b)! }))
  };
}

/** A run of skeleton points eased, its ends kept. */
function smooth(pts: SkPt[]): SkPt[] {
  if (pts.length < 5) return pts;
  let cur = pts;
  for (let pass = 0; pass < 2; pass++) cur = cur.map((p, i) => {
    if (i === 0 || i === cur.length - 1) return p;
    const a = cur[i - 1], b = cur[i + 1];
    return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4, r: (a.r + 2 * p.r + b.r) / 4 };
  });
  return cur;
}

/* ---- reading the graph */

/** One end of an edge: the stroke leaving a node that way (a ring through the node leaves it both ways). */
export interface Branch { e: number; end: 'a' | 'b' }
/** The edge's points from the branch's end. */
const fromEnd = (sk: Skeleton, br: Branch) => (br.end === 'a' ? sk.edges[br.e].pts : sk.edges[br.e].pts.slice().reverse());
/** The node a branch leaves. */
export const branchNode = (sk: Skeleton, br: Branch) => (br.end === 'a' ? sk.edges[br.e].a : sk.edges[br.e].b);
/** The strokes leaving node n. */
export function branches(sk: Skeleton, n: number): Branch[] {
  const out: Branch[] = [];
  for (const e of new Set(sk.nodes[n].edges)) { if (sk.edges[e].a === n) out.push({ e, end: 'a' }); if (sk.edges[e].b === n) out.push({ e, end: 'b' }); }
  return out;
}

/** The way a branch leaves its node, read over `reach` units of it. */
export function leaving(sk: Skeleton, br: Branch, reach: number): P {
  const pts = fromEnd(sk, br), o = pts[0];
  let q = pts[pts.length - 1], l = 0;
  for (let k = 1; k < pts.length; k++) { l += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); if (l >= reach) { q = pts[k]; break; } }
  const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

/** Where strokes meet: at each node of three or more, the two strokes that run on through it (the most
    nearly in one line: an H's stem past its bar, an e's bowl past its bar) and the ones that end in them (the bar). */
export interface Join { node: number; host: [Branch, Branch]; joiners: Branch[] }
export function joinsOf(sk: Skeleton): Join[] {
  const out: Join[] = [];
  sk.nodes.forEach((n, i) => {
    const bs = branches(sk, i);
    if (bs.length < 3) return;
    const dirs = bs.map(br => leaving(sk, br, n.r * 2.5));
    let best = Infinity, host: [number, number] = [0, 1];
    for (let a = 0; a < bs.length; a++) for (let b = a + 1; b < bs.length; b++) {
      const c = dirs[a].x * dirs[b].x + dirs[a].y * dirs[b].y;
      if (c < best) { best = c; host = [a, b]; }
    }
    // a stem's foot spreading into its serifs isn't a join: the two that run on are short and end free
    // (short against the stroke that ends in them, too: a heavy H's stems are short against their bar's join)
    const others = bs.filter((_, k) => k !== host[0] && k !== host[1]), longest = Math.max(...others.map(br => sk.edges[br.e].len));
    const short = (br: Branch) => { const E = sk.edges[br.e], far = br.end === 'a' ? E.b : E.a; return far !== i && sk.nodes[far].edges.length === 1 && E.len < n.r * 6 && E.len < longest * 0.5; };
    if (short(bs[host[0]]) && short(bs[host[1]])) return;
    out.push({ node: i, host: [bs[host[0]], bs[host[1]]], joiners: bs.filter((_, k) => k !== host[0] && k !== host[1]) });
  });
  return out;
}

/** The skeleton point nearest (x, y): its edge, its index along it, and how far it is; of two as near, the one first
    along the edges in order. A restyle asks it of every point of a letter's outline, so the points are looked up in
    square buckets round (x, y), nearest buckets first (`nearIndex`), which finds the very point a walk past every point
    would. */
export function nearestOn(sk: Skeleton, x: number, y: number): { e: number; i: number; d: number } | null {
  const ix = nearIndex(sk);
  if (!ix || !Number.isFinite(x) || !Number.isFinite(y)) return nearestAll(sk, x, y);
  const { x0, y0, W, H, start, at } = ix;
  const cx = Math.floor((x - x0) / NEAR_CELL), cy = Math.floor((y - y0) / NEAR_CELL);
  // (from the first ring of buckets that reaches the grid, out until a bucket further out can hold nothing nearer)
  const reach = Math.max(cx - (W - 1), -cx, cy - (H - 1), -cy, 0), last = Math.max(cx, W - 1 - cx, cy, H - 1 - cy);
  let bd = Infinity, bo = -1;
  const look = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= W || r >= H) return;
    const k = r * W + c;
    for (let j = start[k]; j < start[k + 1]; j++) {
      const o = at[j], p = ix.pts[o], d = Math.hypot(p.x - x, p.y - y);
      if (d < bd || (d === bd && o < bo)) { bd = d; bo = o; }
    }
  };
  for (let ring = reach; ring <= last; ring++) {
    // (a point in a bucket this ring or further out lies more than ring - 1 buckets' sides away, as (x, y) may sit at
    // the far side of its own)
    if (bo >= 0 && bd < (ring - 1) * NEAR_CELL - 1e-6) break;
    if (ring === 0) { look(cx, cy); continue; }
    // (only the ring's buckets on the grid: a point far off it has a long way to come)
    for (let c = Math.max(0, cx - ring), e = Math.min(W - 1, cx + ring); c <= e; c++) { look(c, cy - ring); look(c, cy + ring); }
    for (let r = Math.max(0, cy - ring + 1), e = Math.min(H - 1, cy + ring - 1); r <= e; r++) { look(cx - ring, r); look(cx + ring, r); }
  }
  return bo < 0 ? null : { e: ix.edge[bo], i: ix.index[bo], d: bd };
}

/** nearestOn the long way, every point tried in turn. */
function nearestAll(sk: Skeleton, x: number, y: number): { e: number; i: number; d: number } | null {
  let best: { e: number; i: number; d: number } | null = null;
  sk.edges.forEach((E, e) => E.pts.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (!best || d < best.d) best = { e, i, d };
  }));
  return best;
}

/** The side of nearestOn's buckets, in units. */
const NEAR_CELL = 16;
/** A skeleton's points in buckets: each point's place in the order the edges run (`pts`, with its edge and index), and
    for each bucket, row by row up from (x0, y0), the places of the points in it (`at`, from start[k] to start[k + 1]).
    Kept with the skeleton, and made again should its edges have been given other points. */
interface NearIndex { x0: number; y0: number; W: number; H: number; start: Int32Array; at: Int32Array; pts: SkPt[]; edge: Int32Array; index: Int32Array; of: SkPt[][]; lens: number[] }
const nearIndexes = new WeakMap<Skeleton, NearIndex | null>();
function nearIndex(sk: Skeleton): NearIndex | null {
  const had = nearIndexes.get(sk);
  if (had !== undefined && (had === null ? !sk.edges.some(E => E.pts.length)
    : had.of.length === sk.edges.length && had.of.every((p, e) => p === sk.edges[e].pts && p.length === had.lens[e]))) return had;
  const pts: SkPt[] = [], edge: number[] = [], index: number[] = [];
  sk.edges.forEach((E, e) => E.pts.forEach((p, i) => { pts.push(p); edge.push(e); index.push(i); }));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  if (!pts.length || !Number.isFinite(x0 + y0 + x1 + y1)) { nearIndexes.set(sk, null); return null; }
  const W = Math.floor((x1 - x0) / NEAR_CELL) + 1, H = Math.floor((y1 - y0) / NEAR_CELL) + 1;
  const cellOf = pts.map(p => Math.min(H - 1, Math.floor((p.y - y0) / NEAR_CELL)) * W + Math.min(W - 1, Math.floor((p.x - x0) / NEAR_CELL)));
  const start = new Int32Array(W * H + 1), at = new Int32Array(pts.length);
  for (const k of cellOf) start[k + 1]++;
  for (let k = 0; k < W * H; k++) start[k + 1] += start[k];
  const fill = start.slice(0, W * H);
  cellOf.forEach((k, o) => { at[fill[k]++] = o; });
  const ix: NearIndex = { x0, y0, W, H, start, at, pts, edge: Int32Array.from(edge), index: Int32Array.from(index), of: sk.edges.map(E => E.pts), lens: sk.edges.map(E => E.pts.length) };
  nearIndexes.set(sk, ix);
  return ix;
}

/** How far along edge `e` its point i lies from the branch's end. */
export function alongFrom(sk: Skeleton, e: number, i: number, end: 'a' | 'b') {
  const E = sk.edges[e];
  let l = 0;
  if (end === 'a') for (let k = 1; k <= i; k++) l += Math.hypot(E.pts[k].x - E.pts[k - 1].x, E.pts[k].y - E.pts[k - 1].y);
  else for (let k = E.pts.length - 1; k > i; k--) l += Math.hypot(E.pts[k].x - E.pts[k - 1].x, E.pts[k].y - E.pts[k - 1].y);
  return l;
}

/** The ink's run through (x, y) along its row (or, `column`, down its column): its two ends, or null off the ink. */
function runThrough(g: Grid, x: number, y: number, column = false): [number, number] | null {
  if (!inkAt(g, x, y)) return null;
  const step = g.cell;
  let a = 0, b = 0;
  if (column) { while (inkAt(g, x, y - a - step) && a < 4000) a += step; while (inkAt(g, x, y + b + step) && b < 4000) b += step; return [y - a, y + b]; }
  while (inkAt(g, x - a - step, y) && a < 4000) a += step; while (inkAt(g, x + b + step, y) && b < 4000) b += step;
  return [x - a, x + b];
}

/** How a stroke ends that runs out of (x, y), r thick each side, heading d: cut level across (a stem's foot or top,
    square or slanting), cut plumb (an arm's end), or otherwise (round, pointed, cut on a slant, a ball): where its
    ink stops, read along the way it heads, and whether the ink across it keeps its width right up to there. */
/** Where an upright stroke's round end (a soft sans's stem, drawn with a round pen) stops: the tip of its round, read
    out along the stroke from the skeleton's end at (x, y), radius r, heading d; null for a stroke that isn't upright,
    or whose end comes to a point (a blackletter's lozenge foot), narrower a little way back from its tip than a round
    is. */
export function roundTip(g: Grid, x: number, y: number, r: number, d: { x: number; y: number }) {
  if (Math.abs(d.y) < 0.85) return null;
  let q = 0;
  while (q < r * 4 && inkAt(g, x + d.x * (q + 1), y + d.y * (q + 1))) q += 1;
  const tip = { x: x + d.x * q, y: y + d.y * q }, yb = tip.y - d.y * r * 0.3;
  // (a round is 1.4 radii across, a third of a radius back from its tip; a right-angled point 0.6)
  const across = (s: number) => { let k = 0; while (k < r * 2 && inkAt(g, tip.x + s * (k + 1), yb)) k += 1; return k; };
  return across(1) + across(-1) < r * 1.1 ? null : tip;
}

export function endFace(g: Grid, x: number, y: number, r: number, d: { x: number; y: number }): { face: 'level' | 'plumb' | 'other'; at: number; mid: number; width: number } {
  for (const column of [false, true]) {
    // (level: read row by row up or down to where the ink stops; plumb: column by column across)
    const k = column ? d.x : d.y;
    if (Math.abs(k) < (column ? 0.7 : 0.5)) continue;
    const sg = Math.sign(k), along = (q: number) => (column ? { x: x + sg * q, y } : { x, y: y + sg * q });
    let q = 0;
    while (q < r * 4 && inkAt(g, along(q + 1).x, along(q + 1).y)) q += 1;
    const at = column ? x + sg * q : y + sg * q;
    // the ink across the stroke a little way in from where it stops, and further in
    // (a slanting stroke's middle moves across as it goes)
    const cx = (h: number) => (column ? y + (d.y / d.x) * (h - x) : x + (d.x / d.y) * (h - y));
    const hn = at - sg * 3, hf = at - sg * r * 0.8;
    const near = column ? runThrough(g, hn, cx(hn), true) : runThrough(g, cx(hn), hn);
    const far = column ? runThrough(g, hf, cx(hf), true) : runThrough(g, cx(hf), hf);
    if (!near || !far) continue;
    const wn = near[1] - near[0], wf = far[1] - far[0];
    if (wf > 0 && wn >= 0.75 * wf && wn <= 1.3 * wf) return { face: column ? 'plumb' : 'level', at, mid: (near[0] + near[1]) / 2, width: wn };
  }
  return { face: 'other', at: 0, mid: 0, width: 0 };
}
