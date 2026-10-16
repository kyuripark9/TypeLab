/* Grid block letters (the Grid Blocks card: build 'blocks', blockForm 'grid').
   Every character is a few cells of a grid five cells high, filled or empty, after a modular display face: an n is a
   bar of three cells over two stems, an o a ring of cells round a three by three counter. The cells of a letter are one
   shape, every corner of it rounded, outside and in, so a stroke ends in a half circle and a counter's ends are
   round. Where two filled cells meet only at a corner they join through a narrow neck between the empty cells beside
   them, whose corners are rounded right round: the letter turns a corner there, and the empty cells read as round
   nodes, as the grid's circles. b d p q stand on a stem a cell taller or deeper than their bowl, so they read apart
   from o and from one another.

   Upper and lower case stand on the same five cells, capitals in their own shapes where they differ. Roundness rounds
   the corners (the necks always round right round, so the nodes stay round), Weight moves every edge out or in from
   the cells, Width makes the cells wider or narrower, and Side margins set the room either side. */
import { clamp, lerp } from './geom';
import type { CellJoin, Dots } from '../params';
import type { Metrics } from './font';
import type { BlockPt } from './block-corners';
import { GRID7, GRID7_FORMS, SMALL7, type Small } from './grid-seven';

/** A character's cells: rows from the top, '#' filled, '.' empty, each row a cell wide per character; and the rows it
    hangs below the baseline. */
export type Cells = string | [rows: string, drop: number];

/** The rows of the grid a letter stands on. */
const ROWS = 5;

const LOWER: Record<string, Cells> = {
  a: '.###. ....# .#### #...# .####',
  b: '#.... ####. #...# #...# ####.',
  c: '.#### #.... #.... #.... .####',
  d: '....# .#### #...# #...# .####',
  e: '.#### #.... ####. #.... .####',
  f: '..## .#.. ###. .#.. .#..',
  g: '.#### #...# .#### ....# ####.',
  h: '#.... #.... ####. #...# #...#',
  i: '# . # # #',
  j: '..# ... ..# ..# ##.',
  k: '#... #..# #.#. ###. #..#',
  l: '#. #. #. #. .#',
  m: '.#.#. #.#.# #.#.# #.#.# #.#.#',
  n: '.###. #...# #...# #...# #...#',
  o: '.###. #...# #...# #...# .###.',
  p: '####. #...# #...# ####. #....',
  q: '.#### #...# #...# .#### ....#',
  r: '.### #... #... #... #...',
  s: '.#### #.... ##### ....# ####.',
  t: '.#.. ###. .#.. .#.. ..##',
  u: '#...# #...# #...# #...# .####',
  v: '#...# #...# #...# .#.#. ..#..',
  w: '#.#.# #.#.# #.#.# #.#.# .#.#.',
  x: '#...# .#.#. ..#.. .#.#. #...#',
  y: '#...# #...# .#### ....# ####.',
  z: '##### ...#. ..#.. .#... #####'
};

const UPPER: Record<string, Cells> = {
  A: '.###. #...# ##### #...# #...#',
  B: '####. #...# ####. #...# ####.',
  C: LOWER.c, D: '####. #...# #...# #...# ####.',
  E: '##### #.... ####. #.... #####',
  F: '##### #.... ####. #.... #....',
  G: '.#### #.... #.### #...# .###.',
  H: '#...# #...# ##### #...# #...#',
  I: '### .#. .#. .#. ###',
  J: '....# ....# ....# #...# .###.',
  K: '#...# #..#. ###.. #..#. #...#',
  L: '#.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #...# #...#',
  N: '#...# ##..# #.#.# #..## #...#',
  O: LOWER.o,
  P: '####. #...# ####. #.... #....',
  Q: '.###. #...# #.#.# #..#. .##.#',
  R: '####. #...# ####. #..#. #...#',
  S: LOWER.s,
  T: '##### ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# .###.',
  V: LOWER.v,
  W: '#...# #...# #.#.# ##.## #...#',
  X: LOWER.x,
  Y: '#...# .#.#. ..#.. ..#.. ..#..',
  Z: LOWER.z
};

const FIGURES: Record<string, Cells> = {
  0: '.###. #...# #.#.# #...# .###.',
  1: '.#. ##. .#. .#. ###',
  2: '.###. ....# .###. #.... #####',
  3: '####. ....# .###. ....# ####.',
  4: '#..#. #..#. ##### ...#. ...#.',
  5: '##### #.... ###.. ...#. ###..',
  6: '..#.. .#... ####. #...# .###.',
  7: '##### ....# ...#. ..#.. ..#..',
  8: '.###. #...# .###. #...# .###.',
  9: '.###. #...# .#### ...#. ..#..'
};

const MARKS: Record<string, Cells> = {
  '.': '. . . . #',
  ',': ['.. .. .. .. .# #.', 1],
  ':': '. . # . #',
  ';': ['.. .. .# .. .# #.', 1],
  '…': '..... ..... ..... ..... #.#.#',
  '!': '# # # . #',
  '¡': '# . # # #',
  '?': '.###. ....# ..##. ..... ..#..',
  '¿': '..#.. ..... .##.. #.... .###.',
  "'": '# # . . .',
  '"': '#.# #.# ... ... ...',
  '‘': '.# #. #. .. ..',
  '’': '.# .# #. .. ..',
  '“': '.#..# #..#. #..#. ..... .....',
  '”': '.#..# .#..# #..#. ..... .....',
  '‚': ['.. .. .. .. .# #.', 1],
  '„': ['..... ..... ..... ..... .#..# #..#.', 1],
  '‹': '.. .# #. .# ..',
  '›': '.. #. .# #. ..',
  '«': '..... .#..# #..#. .#..# .....',
  '»': '..... #..#. .#..# #..#. .....',
  '(': '.# #. #. #. .#',
  ')': '#. .# .# .# #.',
  '[': '## #. #. #. ##',
  ']': '## .# .# .# ##',
  '{': '.## .#. #.. .#. .##',
  '}': '##. .#. ..# .#. ##.',
  '-': '... ... ### ... ...',
  '–': '.... .... #### .... ....',
  '—': '..... ..... ##### ..... .....',
  '_': '..... ..... ..... ..... #####',
  '/': '....# ...#. ..#.. .#... #....',
  '\\': '#.... .#... ..#.. ...#. ....#',
  '|': ['# # # # # #', 1],
  '·': '. . # . .',
  '•': '.. .. ## ## ..'
};

const SYMBOLS: Record<string, Cells> = {
  '&': '.#... #.#.. .#..# #.##. .##.#',
  '@': '.###. #..## #.#.# #..## .##..',
  '#': '.#.#. ##### .#.#. ##### .#.#.',
  '$': ['..#.. .#### #.#.. .###. ..#.# ####. ..#..', 1],
  '¢': ['..#.. .#### #.#.. #.#.. #.#.. .#### ..#..', 1],
  '€': '..### .#... ####. .#... ..###',
  '£': '..##. .#..# ###.. .#... #####',
  '¥': '#...# .#.#. ##### ..#.. ..#..',
  '%': '#...# ...#. ..#.. .#... #...#',
  '+': '... .#. ### .#. ...',
  '−': '... ... ### ... ...',
  '×': '... #.# .#. #.# ...',
  '÷': '.#. ... ### ... .#.',
  '=': '... ### ... ### ...',
  '<': '..# .#. #.. .#. ..#',
  '>': '#.. .#. ..# .#. #..',
  '±': '.#. ### .#. ... ###',
  '~': '.... .#.# #.#. .... ....',
  '^': '.#. #.# ... ... ...',
  '*': '#.# .#. #.# ... ...',
  '°': '.#. #.# .#. ... ...',
  '©': ['.#####. #.....# #.###.# #.#...# #.###.# #.....# .#####.', 1],
  '®': ['.#####. #.....# #.##..# #.##..# #.#.#.# #.....# .#####.', 1],
  '™': '###.### .#..#.# .#..#.# ....... .......',
  '§': '.## #.. .#. ..# ##.',
  '¶': '.### ##.# .#.# .#.# .#.#',
  '†': '.#. ### .#. .#. .#.',
  '‡': ['.#. ### .#. .#. ### .#.', 1],
  '`': '#. .# .. .. ..'
};

/** Every grid character: the capitals, the lowercase, the figures and every mark. */
export const GRID: Record<string, Cells> = { ...UPPER, ...LOWER, ...FIGURES, ...MARKS, ...SYMBOLS };

/** The letter forms the Letters page picks, as other cells for the letters they reach: each `setting=option` with the
    letters it redraws (the option a setting starts at, and 'auto', draw them as GRID has them). */
export const GRID_FORMS: Record<string, Record<string, Cells>> = {
  // a single-storey a, its stem running on into a spur
  'story=single': { a: '.###. #...# #...# #..## .##.#' },
  // k's arm and leg both from the stem, or from the end of a short bar; K likewise
  'kForm=stem': { k: '#... #.#. ##.. #.#. #..#', K: '#...# #..#. ##... #..#. #...#' },
  'kForm=bar': { k: '#... #..# ###. #..# #..#', K: '#...# #...# ####. #...# #...#' },
  // I, i and l as plain stems, or with bars top and foot
  'iForm=plain': { I: '# # # # #', l: '# # # # #' },
  'iForm=bars': { i: '.#. ... ##. .#. ###', l: '##. .#. .#. .#. ###' },
  // J's cup rising higher
  'jForm=cup': { J: '....# ....# #...# #...# .###.' },
  // M's middle meeting a row higher
  'mForm=raised': { M: '##.## #.#.# #...# #...# #...#' },
  // Q's tail running from inside the bowl, or sweeping out under it
  'qForm=inside': { Q: '.###. #...# #...# #..## .####' },
  'qForm=sweep': { Q: ['.###. #...# #...# #...# .###. ...##', 1] },
  // R's bowl stopping short of the stem and running back into a straight leg
  'rForm=loop': { R: '####. #...# #.##. #...# #...#' },
  // Y a cup on a stem
  'yForm=cup': { Y: '#...# #...# .###. ..#.. ..#..' },
  // s, S and $'s spine level, its turns square
  'sForm=flat': { s: '##### #.... ##### ....# #####', S: '##### #.... ##### ....# #####' }
};
/** The settings GRID_FORMS reads, in the order a letter is looked for in them. */
export const GRID_FORM_KEYS = ['story', 'kForm', 'iForm', 'jForm', 'mForm', 'qForm', 'rForm', 'yForm', 'sForm'] as const;
type GridForms = Partial<Record<(typeof GRID_FORM_KEYS)[number], string>>;
/** The seven-row grid's heights in cells: the x-height, the ascenders over it and the descenders under the baseline. */
export interface Seven { x: number; asc: number; desc: number }

/** A character's cells read: filled or not by column and row (row 0 the top), its size and the rows it hangs below
    the baseline; in the letter forms `forms` picks, and on seven rows at the heights `seven` gives. */
export function gridCells(ch: string, forms: GridForms = {}, seven?: Seven) {
  let lines: string[], drop: number;
  if (seven) {
    const alt = GRID_FORM_KEYS.map(k => GRID7_FORMS[`${k}=${forms[k]}`]?.[ch]).find(c => c != null), c = alt ?? SMALL7[ch] ?? GRID7[ch];
    if (c != null && typeof c === 'object' && !Array.isArray(c)) ({ lines, drop } = small(c, seven));
    else if (c != null) [lines, drop] = typeof c === 'string' ? [c.split(' '), 0] : [c[0].split(' '), c[1]];
    else {
      // a mark not drawn on seven rows: its five stretched to seven where only upright strokes run, rows hung below the
      // baseline staying as they are
      const five = GRID[ch];
      if (five == null) return null;
      const [rows, d] = typeof five === 'string' ? [five, 0] : five, all = rows.split(' ');
      lines = [...stretch(all.slice(0, all.length - d), ROWS7 - ROWS), ...all.slice(all.length - d)]; drop = d;
    }
  } else {
    const alt = GRID_FORM_KEYS.map(k => GRID_FORMS[`${k}=${forms[k]}`]?.[ch]).find(c => c != null), c = alt ?? GRID[ch];
    if (c == null) return null;
    const [rows, d] = typeof c === 'string' ? [c, 0] : c;
    lines = rows.split(' '); drop = d;
  }
  return { cols: lines[0].length, rows: lines.length, drop,
    ink: (x: number, y: number) => y >= 0 && y < lines.length && lines[y][x] === '#' };
}

/** The rows a seven-row grid stands on. */
const ROWS7 = 7;
/** A row only upright strokes run through (each filled cell with filled cells over and under it), or an empty one. */
const upright = (rows: string[], i: number) => i > 0 && i < rows.length - 1 && [...rows[i]].every((c, x) => c !== '#' || (rows[i - 1][x] === '#' && rows[i + 1][x] === '#'));
/** `rows` made `by` rows taller (shorter, below zero): the row nearest the middle that only upright strokes run through
    doubled (taken out), again for each row; with no such row, the middle row. */
function stretch(rows: string[], by: number): string[] {
  let out = rows;
  for (let n = 0; n < Math.abs(by); n++) {
    const mid = (out.length - 1) / 2, can = out.map((_, i) => i).filter(i => upright(out, i)).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    const at = can[0] ?? Math.round(mid);
    out = by > 0 ? [...out.slice(0, at + 1), ...out.slice(at)] : [...out.slice(0, at), ...out.slice(at + 1)];
  }
  return out;
}
/** A small letter's rows at the heights `h`: its x-height rows grown or shrunk to h.x (or drawn so, x4 x6), its ascender to
    h.asc by the row next to the x-height (t's a row shorter, the dots as drawn), its descender to h.desc by the row next
    to the baseline (or drawn so at one, d1). */
function small(s: Small, h: Seven): { lines: string[]; drop: number } {
  const rows = (t?: string) => (t ? t.split(' ') : []), x = rows(s.x);
  const mid = h.x === 4 && s.x4 ? rows(s.x4) : h.x === 6 && s.x6 ? rows(s.x6) : stretch(x, h.x - x.length);
  let asc = rows(s.asc), desc = rows(s.desc);
  if (asc.length && !s.fixed) {
    const want = Math.max(1, h.asc - (s.short ?? 0));
    while (asc.length < want) asc = [...asc, asc[asc.length - 1]];
    while (asc.length > want) asc = asc.slice(0, -1);
  }
  if (desc.length) {
    if (h.desc === 1 && s.d1) desc = rows(s.d1);
    else {
      while (desc.length < h.desc) desc = [desc[0], ...desc];
      while (desc.length > h.desc) desc = desc.slice(1);
    }
  }
  return { lines: [...asc, ...mid, ...desc], drop: desc.length };
}

export interface GridDims {
  /** a cell's width and height */ cw: number; ch: number;
  /** the corners' radius, and the necks' (half a cell, so the empty cells beside them are round) */ r: number; rn: number;
  /** the corners inside a letter that aren't necks: as round as `r`, or rounder by Counters */ ri: number;
  /** how far Weight moves every edge out (in, below zero) from the cells: the upright edges (`gx`, so the upright strokes,
      by Verticals) and the level ones (`gy`, the level strokes, by Horizontals) */ gx: number; gy: number;
  /** how cells meeting only at a corner join (Cell joins), and how far each such corner is cut across, in cells along the
      edges either side of it (Joins): with nodes none at first, the empty cells round; with a diagonal far enough
      that the band between the cells is as thick as the strokes, or thicker */ join: CellJoin; neck: number;
  /** Stencil: every cell a tile of its own, this far from the next (none, 0: the cells one shape), the corners the
      gaps make this round */ tile: number; tileRound: number;
  /** the letter forms picked (GRID_FORMS), and Dots: a cell standing alone (a dot) right round or square, and how
      much bigger than a cell (Size) */ forms: GridForms; dots: Dots; dot: number;
  /** on seven rows, the heights in cells (else five rows, both cases as tall) */ seven?: Seven;
}

/** The furthest Weight moves an edge from the cells, as a share of a cell: as light, a neck keeps about a quarter of
    its width; as bold, a one-cell counter keeps two thirds of its room. */
const GROW = 0.16;
/** The furthest Verticals and Horizontals move the edges of their strokes, as a share of a cell: from strokes a
    quarter of a cell thick to a one-cell counter a quarter of a cell across. */
const AXIS = 0.375;

/** The measurements of the grid letters for the design. */
export function gridDims(m: Metrics): GridDims {
  const e = m.p, rows = e.gridRows === 'seven' ? ROWS7 : ROWS, ch = m.cap / rows;
  // on seven rows the small letters stand as tall, and run up and down as far, as the nearest whole cells to the
  // heights the Heights settings give the stroke letters
  const cells = (v: number) => Math.round(v / ch);
  const x = Math.min(6, Math.max(4, cells(m.xh))), top = Math.min(9, Math.max(x + 1, cells(m.asc)));
  const seven = rows === ROWS7 ? { x, asc: top - x, desc: Math.min(3, Math.max(1, cells(-m.desc))) } : undefined;
  // Width from three fifths of a square cell to half again as wide, square at its middle
  const cw = ch * (e.width < 0.5 ? lerp(0.6, 1, e.width * 2) : lerp(1, 1.5, e.width * 2 - 1));
  const half = Math.min(cw, ch) / 2;
  // the cells as they are at the default Weight, lighter or bolder from there as a share of the way to either end
  const w = e.weight, grow = half * 2 * GROW * (w < 0.4 ? -(0.4 - w) / 0.4 : (w - 0.4) / 0.6);
  // Verticals and Horizontals move each kind of edge on from there, as a share of the way to either end
  const axis = (v: number, c: number) => grow + ((v < 0.5 ? -AXIS : AXIS) * c - grow) * Math.abs(2 * v - 1);
  let gx = axis(e.vWeight, cw), gy = axis(e.hWeight, ch);
  // Contrast thins the level strokes toward their thinnest (reversed, the upright ones)
  const t = clamp((e.contrast - 0.05) / 0.95);
  if (t > 0) { if (e.reverse > 0.5) gx += (-AXIS * cw - gx) * t; else gy += (-AXIS * ch - gy) * t; }
  const g = (gx + gy) / 2, r = half * clamp(e.roundness);
  // a band cut across a neck is as thick as the strokes where its sides run through the two necks' corners, each moved
  // out by the edges' growth `gc` (in cells), that far along the edges: Joins fills a node's neck up to it, and a
  // diagonal runs from there on toward the far corners of the empty cells
  const gc = g / (2 * half), even = Math.max(0, (1 + 2 * gc) / Math.SQRT2 - 2 * gc), join = e.cellJoin;
  const neck = join === 'diagonal' ? even + (1 - even) * DIAG_MORE * e.joinRound : join === 'pixel' ? 0 : e.joinRound * even;
  return { cw, ch, r, rn: half, ri: r + (half - r) * e.innerRound, gx, gy, join, neck,
    tile: e.stencil > 0 ? half * 2 * (TILE[0] + (TILE[1] - TILE[0]) * e.stencil) : 0, tileRound: e.stencilRound,
    forms: Object.fromEntries(GRID_FORM_KEYS.map(k => [k, e[k]])), dots: e.dots,
    dot: e.dotSize === 0.5 ? 1 : e.dotSize < 0.5 ? 0.7 + 0.6 * e.dotSize : 1 + (e.dotSize - 0.5), seven };
}
/** The gap between tiles from Stencil's least to its most, as a share of a cell. */
const TILE = [0.06, 0.5];
/** How much further than as thick as the strokes Joins draws a diagonal, as a share of the way to the empty cells'
    far corners. */
const DIAG_MORE = 0.75;

/** The grid letter `ch` as outlines, y up with the baseline at 0: rings of corner points carrying their radii (for
    roundContour), outlines wound positive and holes negative (the holes last), and its width. Null when there is no
    grid shape for it.
    The cells' edges are followed with the filled cells on the left, so a run of edges round a shape winds positive and
    one round a counter negative. Where two filled cells meet only at a corner, the way on turns toward the empty cells,
    joining the two through the neck. Each corner is then moved out by Weight and its radius grows by as much round the
    outside of a turn and shrinks inside. */
export function gridRings(ch: string, d: GridDims): { rings: BlockPt[][]; holes: number; W: number } | null {
  const g = gridCells(ch, d.forms, d.seven);
  if (!g) return null;
  const { cols, rows, ink } = g;
  // grid corners (x across, y up from the bottom row's foot); a cell is filled by its column and row from the top
  const at = (x: number, y: number) => ink(x, rows - 1 - y);
  type Edge = { x: number; y: number; dx: number; dy: number; used?: boolean };
  const from = new Map<string, Edge[]>(), key = (x: number, y: number) => `${x},${y}`;
  const add = (x: number, y: number, dx: number, dy: number) => {
    const k = key(x, y);
    (from.get(k) ?? from.set(k, []).get(k)!).push({ x, y, dx, dy });
  };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!at(x, y)) continue;
    if (!at(x, y - 1)) add(x, y, 1, 0);
    if (!at(x + 1, y)) add(x + 1, y, 0, 1);
    if (!at(x, y + 1)) add(x + 1, y + 1, -1, 0);
    if (!at(x - 1, y)) add(x, y + 1, 0, -1);
  }
  // a corner where two filled cells meet only diagonally: a neck
  const saddle = (x: number, y: number) => at(x - 1, y) === at(x, y - 1) && at(x - 1, y - 1) === at(x, y) && at(x, y) !== at(x - 1, y);
  // a corner's radius grows round the outside of a turn by as much as its edges move out, and shrinks inside
  const grow = (d.gx + d.gy) / 2, pixel = d.join === 'pixel';
  if (d.tile > 0) {
    // Stencil: every cell its own tile, all alike: moved out by Weight as the letter's edges are and drawn back by half
    // the gap all round (heavy enough, tiles still run together); a corner of the letter's outline as round as ever,
    // those the gaps make as round as Rounding asks
    const tiles: BlockPt[][] = [], gap = d.tile / 2;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!at(x, y)) continue;
      const l = !at(x - 1, y), r = !at(x + 1, y), b = !at(x, y - 1), t = !at(x, y + 1), sx = d.gx - gap, sy = d.gy - gap;
      const x0 = x * d.cw - sx, x1 = (x + 1) * d.cw + sx, y0 = (y - g.drop) * d.ch - sy, y1 = (y + 1 - g.drop) * d.ch + sy;
      if (x1 <= x0 || y1 <= y0) continue;
      const cut = d.tileRound * Math.min(x1 - x0, y1 - y0) / 2, corner = (s1: boolean, s2: boolean): BlockPt => (s1 && s2 ? { x: 0, y: 0, r: d.r + grow, outer: true } : { x: 0, y: 0, r: cut });
      tiles.push([{ ...corner(l, b), x: x0, y: y0 }, { ...corner(r, b), x: x1, y: y0 }, { ...corner(r, t), x: x1, y: y1 }, { ...corner(l, t), x: x0, y: y1 }]);
    }
    return { rings: tiles, holes: 0, W: cols * d.cw };
  }
  type Turn = { x: number; y: number; e: Edge; next: Edge; out: boolean; neck: boolean };
  const rings: BlockPt[][] = [];
  for (const list of from.values()) for (const first of list) {
    if (first.used) continue;
    const turns: Turn[] = [];
    let e = first;
    do {
      e.used = true;
      const x = e.x + e.dx, y = e.y + e.dy, outs = from.get(key(x, y))!.filter(o => !o.used || o === first);
      // at a neck, turn right (toward the empty cells), joining the two cells; pixels turn left, keeping them apart
      const next = outs.length > 1 ? outs.find(o => (e.dx * o.dy - e.dy * o.dx < 0) !== pixel)! : outs[0];
      if (next.dx !== e.dx || next.dy !== e.dy) turns.push({ x, y, e, next, out: e.dx * next.dy - e.dy * next.dx > 0, neck: !pixel && saddle(x, y) });
      e = next;
    } while (e !== first);
    const ring: BlockPt[] = [], n = turns.length;
    // a cell standing alone is a dot: grown about its middle by Size, right round or square as Dots picks, else as
    // round as any corner
    const xs = turns.map(t => t.x), ys = turns.map(t => t.y);
    const dot = (d.dots !== 'auto' || d.dot !== 1) && n === 4 && Math.max(...xs) - Math.min(...xs) === 1 && Math.max(...ys) - Math.min(...ys) === 1;
    const gx = dot ? d.gx + (d.dot - 1) * d.cw / 2 : d.gx, gy = dot ? d.gy + (d.dot - 1) * d.ch / 2 : d.gy;
    turns.forEach(({ x, y, e, next, out, neck }, i) => {
      const R = dot ? (d.dots === 'round' ? d.rn * d.dot : d.dots === 'square' ? -grow : d.r) : neck ? (d.join === 'diagonal' ? d.r : d.rn) : out ? d.r : d.ri;
      // the corner moved out along both edges' outward sides (right of the way along)
      const px = (x + gx / d.cw * (e.dy + next.dy)) * d.cw, py = (y - g.drop) * d.ch - gy * (e.dx + next.dx);
      const r = Math.max(0, out ? R + grow : R - grow);
      // cut across from a way back along each edge: a neck filled in, or with diagonals, an outside corner a cell from
      // a neck, so the band's sides run straight on past it
      const a = turns[(i + n - 1) % n], b = turns[(i + 1) % n];
      const cut = neck ? d.neck : d.join === 'diagonal' && out && ((a.neck && Math.abs(a.x - x) + Math.abs(a.y - y) === 1) ||
        (b.neck && Math.abs(b.x - x) + Math.abs(b.y - y) === 1)) ? 1 - d.neck : 0;
      if (cut > 0) {
        ring.push({ x: px - e.dx * cut * d.cw, y: py - e.dy * cut * d.ch, r }, { x: px + next.dx * cut * d.cw, y: py + next.dy * cut * d.ch, r });
      } else ring.push({ x: px, y: py, r, ...(neck || (pixel && saddle(x, y)) ? {} : out ? { outer: true } : { join: true }) });
    });
    rings.push(ring);
  }
  const area = (r: BlockPt[]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p.x * q.y - q.x * p.y; }, 0);
  const outer = rings.filter(r => area(r) > 0), holes = rings.filter(r => area(r) <= 0);
  return { rings: [...outer, ...holes], holes: holes.length, W: cols * d.cw };
}
