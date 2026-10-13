/* Grid block letters (Built from: Blocks, Block letters: Grid).
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
import type { Metrics } from './font';
import type { Pt } from './types';

/** A character's cells: rows from the top, '#' filled, '.' empty, each row a cell wide per character; and the rows it
    hangs below the baseline. */
type Cells = string | [rows: string, drop: number];

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

/** A character's cells read: filled or not by column and row (row 0 the top), its size and the rows it hangs below
    the baseline. */
export function gridCells(ch: string) {
  const c = GRID[ch];
  if (c == null) return null;
  const [rows, drop] = typeof c === 'string' ? [c, 0] : c;
  const lines = rows.split(' ');
  return { cols: lines[0].length, rows: lines.length, drop,
    ink: (x: number, y: number) => y >= 0 && y < lines.length && lines[y][x] === '#' };
}

export interface GridDims {
  /** a cell's width and height */ cw: number; ch: number;
  /** the corners' radius, and the necks' (half a cell, so the empty cells beside them are round) */ r: number; rn: number;
  /** how far Weight moves every edge out (in, below zero) from the cells */ grow: number;
}

/** The furthest Weight moves an edge from the cells, as a share of a cell: as light, a neck keeps about a quarter of
    its width; as bold, a one-cell counter keeps two thirds of its room. */
const GROW = 0.16;

/** The measurements of the grid letters for the design. */
export function gridDims(m: Metrics): GridDims {
  const e = m.p, ch = m.cap / ROWS;
  // Width from three fifths of a square cell to half again as wide, square at its middle
  const cw = ch * (e.width < 0.5 ? lerp(0.6, 1, e.width * 2) : lerp(1, 1.5, e.width * 2 - 1));
  const half = Math.min(cw, ch) / 2;
  // the cells as they are at the default Weight, lighter or bolder from there as a share of the way to either end
  const w = e.weight, grow = half * 2 * GROW * (w < 0.4 ? -(0.4 - w) / 0.4 : (w - 0.4) / 0.6);
  return { cw, ch, r: half * clamp(e.roundness), rn: half, grow };
}

/** The grid letter `ch` as outlines, y up with the baseline at 0: rings of corner points carrying their radii (for
    roundContour), outlines wound positive and holes negative (the holes last), and its width. Null when there is no
    grid shape for it.
    The cells' edges are followed with the filled cells on the left, so a run of edges round a shape winds positive and
    one round a counter negative. Where two filled cells meet only at a corner, the way on turns toward the empty cells,
    joining the two through the neck. Each corner is then moved out by Weight and its radius grows by as much round the
    outside of a turn and shrinks inside. */
export function gridRings(ch: string, d: GridDims): { rings: Pt[][]; holes: number; W: number } | null {
  const g = gridCells(ch);
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
  const rings: Pt[][] = [];
  for (const list of from.values()) for (const first of list) {
    if (first.used) continue;
    const ring: Pt[] = [];
    let e = first;
    do {
      e.used = true;
      const x = e.x + e.dx, y = e.y + e.dy, outs = from.get(key(x, y))!.filter(o => !o.used || o === first);
      // at a neck, turn right (toward the empty cells), joining the two cells
      const next = outs.length > 1 ? outs.find(o => e.dx * o.dy - e.dy * o.dx < 0)! : outs[0];
      if (next.dx !== e.dx || next.dy !== e.dy) {
        const out = e.dx * next.dy - e.dy * next.dx > 0, R = saddle(x, y) ? d.rn : d.r;
        // the corner moved out along both edges' outward sides (right of the way along)
        ring.push({ x: (x + d.grow / d.cw * (e.dy + next.dy)) * d.cw, y: (y - g.drop) * d.ch - d.grow * (e.dx + next.dx),
          r: Math.max(0, out ? R + d.grow : R - d.grow) });
      }
      e = next;
    } while (e !== first);
    rings.push(ring);
  }
  const area = (r: Pt[]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p.x * q.y - q.x * p.y; }, 0);
  const outer = rings.filter(r => area(r) > 0), holes = rings.filter(r => area(r) <= 0);
  return { rings: [...outer, ...holes], holes: holes.length, W: cols * d.cw };
}
