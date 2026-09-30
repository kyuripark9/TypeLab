/* Construction grids, like the grid pages of a type specimen. A letter's grid is what it is drawn on:
   its straight edges carried on across the page, the level and upright lines its curves turn on, and
   the circles and ellipses its corners and bowls are arcs of. Letters built the same way (the same
   set, the same kind of strokes) form a group that shares a grid; what a letter's grid has in common
   with another letter of its group is marked `shared`. */
import { toPolys } from './effects';
import { CHARSET, type Font, type Glyph, type Metrics } from './font';
import { transformCmds } from './geom';
import { fitOutline, hasIn, hasOut, segment, type Node } from './outline';

type P = { x: number; y: number };

/** A straight line of a grid, through (x, y) at angle `a` (radians from level, 0 ≤ a < π): level,
    upright or diagonal. `len` is how much of the outline lies on it. */
export interface GridLine { kind: 'h' | 'v' | 'd'; x: number; y: number; a: number; len: number; shared: boolean }
/** A circle or ellipse of a grid; `len` is the span of the arc the outline takes from it. */
export interface GridRound { cx: number; cy: number; rx: number; ry: number; len: number; shared: boolean }
/** One letter's grid, as the letter stands upright: a slanted letter's grid leans with it, by `slant`
    units across per unit up, about the level line y = `pivot`. */
export interface GlyphGrid { lines: GridLine[]; rounds: GridRound[]; slant: number; pivot: number }

export type GridSet = 'upper' | 'lower' | 'digits' | 'punct';
/** What a letter is built from: straight strokes only, diagonals, stems with curves, or curves alone. */
export type GridKind = 'straight' | 'diagonal' | 'bowl' | 'round';
export interface GridGroup { id: string; name: string; label: string; set: GridSet; kind: GridKind; chars: string[] }

const SETS: [GridSet, string][] = [['upper', 'Capitals'], ['lower', 'Lowercase'], ['digits', 'Figures'], ['punct', 'Punctuation']];
const KINDS: [GridKind, string][] = [['straight', 'straight strokes'], ['diagonal', 'diagonals'], ['bowl', 'stems and curves'], ['round', 'round']];

const DEG = Math.PI / 180;
/** Lines this close (font units), diagonals this close in angle, and rounds this close in size (see sameSize) are one. */
const SAME = 1.5, SAME_ANGLE = 0.6 * DEG, SAME_R = 2.5;
/** The most lines and rounds a grid keeps: those the outline lies on longest. */
const MOST_LINES = 40, MOST_ROUNDS = 28;
/** A curve takes a circle when it turns at least this far. */
const MIN_TURN = 25 * DEG;

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const rho = (l: { x: number; y: number; a: number }) => l.y * Math.cos(l.a) - l.x * Math.sin(l.a);
const angleGap = (a: number, b: number) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };

function sameLine(a: GridLine, b: GridLine, place = true) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'h') return Math.abs(a.y - b.y) <= SAME;
  if (a.kind === 'v') return Math.abs(a.x - b.x) <= SAME;
  return angleGap(a.a, b.a) <= SAME_ANGLE && (!place || Math.abs(rho(a) - rho({ ...b, a: a.a })) <= SAME);
}
/** Rounds of one size: within a few units, or for big ones a twentieth of their radius. */
function sameSize(a: GridRound, b: GridRound) {
  const tol = Math.max(SAME_R, 0.05 * Math.max(a.rx, a.ry));
  return Math.abs(a.rx - b.rx) <= tol && Math.abs(a.ry - b.ry) <= tol;
}

/** A point of a cubic, and a third of its first derivative there. */
function bez(B: P[], t: number): P {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * B[0].x + b * B[1].x + c * B[2].x + d * B[3].x, y: a * B[0].y + b * B[1].y + c * B[2].y + d * B[3].y };
}
function bez1(B: P[], t: number): P {
  const u = 1 - t, a = u * u, b = 2 * u * t, c = t * t;
  return { x: a * (B[1].x - B[0].x) + b * (B[2].x - B[1].x) + c * (B[3].x - B[2].x), y: a * (B[1].y - B[0].y) + b * (B[2].y - B[1].y) + c * (B[3].y - B[2].y) };
}

/** A curved piece of an outline: its cubic, the ways it leaves and arrives, and how much of it shows. */
interface Piece { B: [P, P, P, P]; t0: P; t1: P; len: number }

/** A test of whether a point is in the ink of these outlines (nonzero, like the font: overlapping strokes count once). */
function inkTest(polys: P[][]) {
  const boxes = polys.map(poly => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of poly) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    return { x0, y0, x1, y1 };
  });
  return (x: number, y: number) => {
    let w = 0;
    polys.forEach((poly, k) => {
      const bx = boxes[k];
      if (x < bx.x0 || x > bx.x1 || y < bx.y0 || y > bx.y1) return;
      for (let i = 0, n = poly.length; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n], side = (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y);
        if (a.y <= y) { if (b.y > y && side > 0) w++; } else if (b.y <= y && side < 0) w--;
      }
    });
    return w !== 0;
  };
}

/** The glyph's grid. */
export function glyphGrid(g: Glyph, m: Metrics): GlyphGrid {
  // a letter drawn by hand is stored as it stands; the others are set upright first
  const slant = g.strokes[0]?.part === 'drawn' ? 0 : m.slant, pivot = m.xh * 0.4;
  let cmds = [...g.strokes.flatMap(s => s.cmds), ...g.serifs.flat()];
  if (slant) cmds = transformCmds(cmds, [1, 0, -slant, 1, slant * pivot, 0]);
  const lines: GridLine[] = [], rounds: GridRound[] = [];
  const minEdge = Math.max(14, m.s * 0.2), minDiagonal = Math.max(40, m.s * 0.5), most = m.cap * 0.75;

  const line = (kind: GridLine['kind'], x: number, y: number, a: number, len: number) => {
    const l: GridLine = { kind, x, y, a, len, shared: false }, was = lines.find(o => sameLine(o, l));
    if (was) was.len += len; else lines.push(l);
  };
  const round = (cx: number, cy: number, rx: number, ry: number, len: number) => {
    if (!(rx >= 2 && ry >= 2 && rx <= most && ry <= most)) return false;
    const r: GridRound = { cx, cy, rx, ry, len, shared: false };
    const near = Math.max(SAME_R, 0.05 * Math.max(rx, ry));
    const was = rounds.find(o => sameSize(o, r) && Math.abs(o.cx - cx) <= near && Math.abs(o.cy - cy) <= near);
    if (was) was.len += len; else rounds.push(r);
    return true;
  };

  // strokes overlap: only the edges that show, with ink on one side and none on the other, draw the letter
  const inked = inkTest(toPolys(cmds));
  const shows = (at: (t: number) => P, tangent: (t: number) => P, ts: number[]) => ts.filter(t => {
    const q = at(t), d = tangent(t), l = Math.hypot(d.x, d.y) || 1, nx = -d.y / l * 1.2, ny = d.x / l * 1.2;
    return inked(q.x + nx, q.y + ny) !== inked(q.x - nx, q.y - ny);
  }).length / ts.length;

  const level = (t: P) => Math.abs(t.y) <= 0.035 * Math.hypot(t.x, t.y), upright = (t: P) => Math.abs(t.x) <= 0.035 * Math.hypot(t.x, t.y);
  const turnOf = (u: P, v: P) => Math.abs(Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y));
  /** where a curve runs level or upright at an end, it turns on that line */
  const axis = (q: P, t: P, len: number) => {
    if (len < minEdge) return;
    if (level(t)) line('h', q.x, q.y, 0, len / 2); else if (upright(t)) line('v', q.x, q.y, Math.PI / 2, len / 2);
  };

  /* One stretch of curve, from a corner, a straight edge or a level or upright point to the next: a
     quarter of an ellipse when it runs from upright to level and keeps to one, else for each way it
     bends the circle that fits it where it bends tightest. */
  const run = (pieces: Piece[]) => {
    const first = pieces[0], last = pieces[pieces.length - 1], len = pieces.reduce((a, q) => a + q.len, 0);
    axis(first.B[0], first.t0, len);
    axis(last.B[3], last.t1, len);
    const a = first.B[0], b = last.B[3];
    const centre = upright(first.t0) && level(last.t1) ? { x: b.x, y: a.y } : level(first.t0) && upright(last.t1) ? { x: a.x, y: b.y } : null;
    const rx = Math.abs(b.x - a.x), ry = Math.abs(b.y - a.y);
    if (centre && rx >= 2 && ry >= 2 && pieces.every(q => [0.25, 0.5, 0.75].every(t => {
      const at = bez(q.B, t);
      return Math.abs(((at.x - centre.x) / rx) ** 2 + ((at.y - centre.y) / ry) ** 2 - 1) <= 0.1;
    })) && round(centre.x, centre.y, rx, ry, len)) return;
    // the curve at a few points of each piece: where it is, which way it runs, how tightly it bends (signed)
    const at = pieces.flatMap(q => [0.04, 0.27, 0.5, 0.73, 0.96].map(t => {
      const d1 = bez1(q.B, t), v = Math.hypot(d1.x, d1.y);
      // a sixth of the second derivative, to go with the third of the first
      const d2 = { x: (1 - t) * (q.B[2].x - 2 * q.B[1].x + q.B[0].x) + t * (q.B[3].x - 2 * q.B[2].x + q.B[1].x), y: (1 - t) * (q.B[2].y - 2 * q.B[1].y + q.B[0].y) + t * (q.B[3].y - 2 * q.B[2].y + q.B[1].y) };
      return { p: bez(q.B, t), d: d1, v, k: v ? (d1.x * d2.y - d1.y * d2.x) * 2 / (3 * v ** 3) : 0 };
    }));
    for (let i = 0; i < at.length;) {
      let j = i, turn = 0;
      while (j + 1 < at.length && at[j + 1].k * at[i].k > 0) { turn += turnOf(at[j].d, at[j + 1].d); j++; }
      const bend = at.slice(i, j + 1), tightest = Math.max(...bend.map(q => Math.abs(q.k)));
      if (turn >= MIN_TURN && tightest > 0) {
        // of the points about as tight as the tightest, the one nearest the middle: an even arc takes its circle there
        const mid = (bend.length - 1) / 2, tight = bend.map((q, n) => ({ q, n })).filter(o => Math.abs(o.q.k) >= tightest * 0.88)
          .reduce((best, o) => (Math.abs(o.n - mid) < Math.abs(best.n - mid) ? o : best)).q;
        const r = 1 / Math.abs(tight.k), s = Math.sign(tight.k);
        round(tight.p.x - s * tight.d.y / tight.v * r, tight.p.y + s * tight.d.x / tight.v * r, r, r, len * bend.length / at.length);
      }
      i = j + 1;
    }
  };

  for (const c of fitOutline(cmds)) {
    const n = c.length;
    const edge = (i: number) => { const a = c[i], b = c[(i + 1) % n]; return segment(a, b) ? null : { x: b.x - a.x, y: b.y - a.y }; };
    // a wide, gentle curve can come traced as a run of short straight edges, each turning a little: those are no edges of the letter
    const facet = (d: P, o: P | null) => {
      if (!o) return false;
      const turn = turnOf(d, o);
      return turn > 1.5 * DEG && turn < 22 * DEG && Math.hypot(d.x, d.y) < 2 * Math.hypot(o.x, o.y);
    };
    // nor is a short one that curves run into and out of without a corner: the flat of a bend
    const flat = (i: number, d: P) => {
      const before = c[i], after = c[(i + 1) % n];
      return Math.hypot(d.x, d.y) < m.cap * 0.25 && hasIn(before) && hasOut(after)
        && turnOf({ x: before.x - before.ix!, y: before.y - before.iy! }, d) < 8 * DEG && turnOf(d, { x: after.ox! - after.x, y: after.oy! - after.y }) < 8 * DEG;
    };
    const pieces: (Piece | null)[] = c.map((a: Node, i) => {
      const b = c[(i + 1) % n], B = segment(a, b);
      if (!B) {
        // a straight edge, carried on; one within a hair of level or upright is taken as that
        const dx = b.x - a.x, dy = b.y - a.y, full = dist(a, b), near = Math.max(0.6, full * 0.012);
        const len = full * shows(t => ({ x: a.x + dx * t, y: a.y + dy * t }), () => ({ x: dx, y: dy }), [0.1, 0.3, 0.5, 0.7, 0.9]);
        if (Math.abs(dy) <= near) { if (len >= minEdge) line('h', a.x, (a.y + b.y) / 2, 0, len); }
        else if (Math.abs(dx) <= near) { if (len >= minEdge) line('v', (a.x + b.x) / 2, a.y, Math.PI / 2, len); }
        else if (len >= minDiagonal && !facet({ x: dx, y: dy }, edge((i + n - 1) % n)) && !facet({ x: dx, y: dy }, edge((i + 1) % n)) && !flat(i, { x: dx, y: dy })) {
          line('d', a.x, a.y, (Math.atan2(dy, dx) + Math.PI) % Math.PI, len);
        }
        return null;
      }
      // a curve: the way it leaves and the way it arrives
      const t0 = dist(B[1], B[0]) > 0.01 ? { x: B[1].x - B[0].x, y: B[1].y - B[0].y } : { x: B[2].x - B[0].x, y: B[2].y - B[0].y };
      const t1 = dist(B[3], B[2]) > 0.01 ? { x: B[3].x - B[2].x, y: B[3].y - B[2].y } : { x: B[3].x - B[1].x, y: B[3].y - B[1].y };
      const len = dist(a, b) * shows(t => bez(B, t), t => bez1(B, t), [0.2, 0.5, 0.8]);
      return len >= 3 ? { B, t0, t1, len } : null;
    });
    // curves run on from one to the next through a smooth point, until it is a level or upright one
    const joins = (i: number) => {
      const q = pieces[i], next = pieces[(i + 1) % n];
      return !!q && !!next && n > 1 && turnOf(q.t1, next.t0) < 8 * DEG && !level(q.t1) && !upright(q.t1);
    };
    let start = pieces.findIndex((_, i) => !joins((i + n - 1) % n));
    if (start < 0) start = 0;
    for (let k = 0; k < n;) {
      const list: Piece[] = [];
      let i = (start + k) % n;
      if (!pieces[i]) { k++; continue; }
      for (;;) {
        list.push(pieces[i]!);
        k++;
        if (k >= n || !joins(i)) break;
        i = (start + k) % n;
      }
      run(list);
    }
  }
  const keep = <T extends { len: number }>(list: T[], n: number) => (list.length > n ? list.slice().sort((a, b) => b.len - a.len).slice(0, n) : list);
  return { lines: keep(lines, MOST_LINES), rounds: keep(rounds, MOST_ROUNDS), slant, pivot };
}

/** What kind of strokes the glyph is built from, measured along its centerlines (or, for a letter
    with none, a block or a drawing, along its grid): `H` is the height of its set. */
function kindOf(g: Glyph, grid: GlyphGrid, H: number): GridKind {
  let upright = 0, diagonal = 0, curved = 0;
  if (g.skeleton.length) {
    const x = (p: P) => p.x - grid.slant * (p.y - grid.pivot);
    for (const row of g.skeleton) {
      for (let i = 0; i + 1 < row.length; i++) {
        const dx = x(row[i + 1]) - x(row[i]), dy = row[i + 1].y - row[i].y, l = Math.hypot(dx, dy);
        // curves are sampled in short steps; a long step is a straight stroke
        if (l < H * 0.2) curved += l;
        else if (Math.abs(dx) <= l * 0.14) upright += l;
        else if (Math.abs(dy) > l * 0.14) diagonal += l;
      }
    }
  } else {
    // both sides of a stroke lie on the grid
    for (const l of grid.lines) { if (l.kind === 'v') upright += l.len / 2; else if (l.kind === 'd' && l.len >= H * 0.3) diagonal += l.len / 2; }
    for (const r of grid.rounds) if (Math.max(r.rx, r.ry) >= H * 0.2) curved += r.len / 2;
  }
  if (diagonal >= H * 0.25 && diagonal >= curved) return 'diagonal';
  if (curved >= H * 0.3) return upright >= H * 0.45 ? 'bowl' : 'round';
  return 'straight';
}

interface SetGrids { groups: GridGroup[]; of: Map<string, { grid: GlyphGrid; group: GridGroup }> }
const cache = new WeakMap<Font, (SetGrids | undefined)[]>();

/** Mark what a grid has in common with any of the others: a level line at the same height, an upright
    at the same place, a diagonal at the same angle, a circle or ellipse of the same size. */
function markShared(grid: GlyphGrid, others: GlyphGrid[]) {
  for (const l of grid.lines) l.shared = others.some(o => o.lines.some(k => sameLine(l, k, false)));
  for (const r of grid.rounds) r.shared = others.some(o => o.rounds.some(k => sameSize(r, k)));
}

/** The grids of one set of glyphs and the groups they fall into. Groups keep their names whatever
    the design: Grid A to D are the capitals (straight, diagonal, stems and curves, round), E to H
    the lowercase, I to L the figures, M to P the punctuation. */
function setGrids(font: Font, si: number): SetGrids {
  let sets = cache.get(font);
  if (!sets) { sets = []; cache.set(font, sets); }
  const done = sets[si];
  if (done) return done;
  const [set, setLabel] = SETS[si], out: SetGrids = { groups: [], of: new Map() };
  const byKind = new Map<GridKind, GridGroup>();
  for (const ch of CHARSET[set]) {
    const g = font.glyph(ch);
    if (!g) continue;
    const m = font.letter(ch).m, grid = glyphGrid(g, m);
    const kind = kindOf(g, grid, set === 'upper' || set === 'digits' ? m.cap : m.xh), ki = KINDS.findIndex(k => k[0] === kind);
    let group = byKind.get(kind);
    if (!group) {
      group = { id: `${set}-${kind}`, name: `Grid ${String.fromCharCode(65 + si * KINDS.length + ki)}`, label: `${setLabel} · ${KINDS[ki][1]}`, set, kind, chars: [] };
      byKind.set(kind, group);
    }
    group.chars.push(ch);
    out.of.set(ch, { grid, group });
  }
  for (const [kind] of KINDS) {
    const group = byKind.get(kind);
    if (!group) continue;
    out.groups.push(group);
    const all = group.chars.map(ch => out.of.get(ch)!.grid);
    all.forEach((grid, i) => markShared(grid, all.filter((_, j) => j !== i)));
  }
  sets[si] = out;
  return out;
}

/**
 * The grid of `ch` in this font and the group it shares it with, or null when there is no such glyph.
 * `groupFont` is the font the group and its other letters are read from: while a design is being
 * dragged that can be the font of a moment ago, so only the one letter is measured on every change.
 */
export function gridOf(font: Font, ch: string, groupFont: Font = font): { grid: GlyphGrid; group: GridGroup } | null {
  const si = SETS.findIndex(([set]) => CHARSET[set].includes(ch));
  if (si < 0) return null;
  const sg = setGrids(groupFont, si), info = sg.of.get(ch), g = font.glyph(ch);
  if (!info || !g || font === groupFont) return info ?? null;
  const grid = glyphGrid(g, font.letter(ch).m), was = info.grid;
  // a grid still made of the same lines keeps what it shared, though the others lag behind it
  if (grid.lines.length === was.lines.length && grid.rounds.length === was.rounds.length && grid.lines.every((l, i) => l.kind === was.lines[i].kind)) {
    grid.lines.forEach((l, i) => { l.shared = was.lines[i].shared; });
    grid.rounds.forEach((r, i) => { r.shared = was.rounds[i].shared; });
  } else markShared(grid, info.group.chars.filter(c => c !== ch).map(c => sg.of.get(c)!.grid));
  return { grid, group: info.group };
}

/** The font's grid groups, in order. */
export const gridGroups = (font: Font): GridGroup[] => SETS.flatMap((_, si) => setGrids(font, si).groups);
