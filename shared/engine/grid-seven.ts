/* Grid letters on seven rows (Grid rows: Seven), after a 5×7 matrix face: the capitals and figures seven cells tall, and
   the small letters with real ascenders and descenders, their x-height, ascenders and descenders each a whole number of
   cells (the nearest the Heights settings ask for: grid-blocks.ts composes them). Rows are written from the top as in
   GRID ('#' filled, '.' empty, rows apart by a space); a mark not drawn here is GRID's five rows stretched to seven.

   A small letter is its rows above the x-height (`asc`), its x-height rows (`x`, five as drawn) and its rows below the
   baseline (`desc`). Taller or shorter, a letter grows or shrinks where only upright strokes run (`x4`, `x6` where that
   would spoil it), an ascender by the row next to the x-height and a descender by the row next to the baseline (`d1`
   where taking that row out would spoil it); the dots over i and j stay as they are (`fixed`), and t's stem rises a row
   less than the ascenders (`short`). */
import type { Cells } from './grid-blocks';

/** A small letter on the seven-row grid. */
export interface Small {
  /** rows above the x-height, from the top: an ascender's, the dot over i and j and the gap under it, t's short stem */ asc?: string;
  /** the rows from the x-height down to the baseline, five as drawn */ x: string;
  /** the rows below the baseline */ desc?: string;
  /** the x-height rows at four cells and at six, where taking a row out or doubling one would spoil the letter */ x4?: string; x6?: string;
  /** the descender at one row, where taking its row next to the baseline out would spoil it */ d1?: string;
  /** the rows over the x-height stay as drawn whatever the ascenders do (the dots over i and j) */ fixed?: boolean;
  /** the stem over the x-height rises this many rows less than the ascenders (t) */ short?: number;
}

/** The capitals, figures and the marks drawn anew on seven rows. As on five rows, a curve turns through an empty corner
    cell (O's top '.###.' over '#...#'), so the necks show; look-alikes stand at least two cells apart (O 0 Q D, 8 B, 5 S,
    6 G, 1 I, 2 Z). */
export const GRID7: Record<string, Cells> = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.#### #.... #.... #.... #.... #.... .####',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.#### #.... #.... #.### #...# #...# .###.',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '### .#. .#. .#. .#. .#. ###',
  J: '....# ....# ....# ....# ....# #...# .###.',
  // the arm and leg meet the stem through a short bar, as on five rows
  K: '#...# #..#. #.#.. ###.. #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #...# #...# #...# #...#',
  N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #..#. #...# #...#',
  S: '.#### #.... #.... ##### ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# ##.## #...#',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',

  // a zero's middle a short bar, so it stands apart from O
  0: '.###. #...# #.#.# #.#.# #.#.# #...# .###.',
  1: '.#. ##. .#. .#. .#. .#. ###',
  2: '.###. #...# ....# ...#. ..#.. .#... #####',
  3: '####. ....# ....# .###. ....# ....# ####.',
  4: '#..#. #..#. #..#. ##### ...#. ...#. ...#.',
  // a five's bowl comes to a point, so it reads apart from S
  5: '##### #.... #.... ####. ....# ...#. ###..',
  6: '..##. .#... #.... ####. #...# #...# .###.',
  7: '##### ....# ...#. ..#.. ..#.. ..#.. ..#..',
  8: '.###. #...# #...# .###. #...# #...# .###.',
  9: '.###. #...# #...# .#### ....# ...#. .##..',

  // marks whose five rows don't stretch well: their bars would double up, their points flatten, their diagonals kink
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '¿': '..#.. ..... ..#.. .#... #.... #...# .###.',
  '/': '...# ...# ..#. ..#. .#.. .#.. #...',
  '\\': '#... #... .#.. .#.. ..#. ..#. ...#',
  '‹': '... ..# .#. #.. .#. ..# ...',
  '›': '... #.. .#. ..# .#. #.. ...',
  '«': '...... ..#..# .#..#. #..#.. .#..#. ..#..# ......',
  '»': '...... #..#.. .#..#. ..#..# .#..#. #..#.. ......',
  '•': '.. .. .. ## ## .. ..',
  '&': '.##.. #..#. #..#. .##.. #.#.# #..#. .##.#',
  '@': '.###. #...# #.### #.#.# #.### #.... .###.',
  '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
  '$': ['..#.. .#### #.#.. #.#.. .###. ..#.# ..#.# ####. ..#..', 1],
  // the cent sign as tall as on five rows, a little over the x-height
  '¢': ['..#.. .#### #.#.. #.#.. #.#.. .#### ..#..', 1],
  '€': '..### .#... ####. .#... ####. .#... ..###',
  '£': '..##. .#..# .#... ###.. .#... .#... #####',
  '¥': '#...# .#.#. ..#.. ##### ..#.. ##### ..#..',
  '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
  '+': '... .#. .#. ### .#. .#. ...',
  '×': '..... #...# .#.#. ..#.. .#.#. #...# .....',
  '=': '... ... ### ... ### ... ...',
  '<': '...# ..#. .#.. #... .#.. ..#. ...#',
  '>': '#... .#.. ..#. ...# ..#. .#.. #...',
  '±': '.#. .#. ### .#. .#. ... ###',
  // the copyright and registered signs a capital tall, their letters inside a ring
  '©': '.#####. #.....# #.###.# #.#...# #.###.# #.....# .#####.',
  '®': '.#####. #.....# #.##..# #.##..# #.#.#.# #.....# .#####.',
  // the trade mark sign hangs from the cap height
  '™': '###.### .#..#.# .#..#.# ....... ....... ....... .......',
  '§': '.### #... .##. #..# .##. ...# ###.',
  '¶': '.#### ###.# ###.# .##.# ..#.# ..#.# ..#.#'
};

/** The small letters on seven rows. Their x-heights are five rows as drawn: b d p q share their bowls and stand apart by
    their stems, g and y hang their tails from a bowl a row short of the baseline, as a 5×7 face does, so a one-row
    descender is just the tail. */
export const SMALL7: Record<string, Small> = {
  // a two-storey a; at four rows there is no room for its two counters, so it closes up into a single storey with a spur
  a: { x: '.###. ....# .#### #...# .####', x6: '.###. ....# ....# .#### #...# .####', x4: '.###. #...# #..## .##.#' },
  b: { asc: '#.... #....', x: '####. #...# #...# #...# ####.' },
  c: { x: '.#### #.... #.... #.... .####' },
  d: { asc: '....# ....#', x: '.#### #...# #...# #...# .####' },
  // the eye closes up at four rows, where three bars and two counters don't fit
  e: { x: '.###. #...# ##### #.... .####', x6: '.###. #...# #...# ##### #.... .####', x4: '.###. ##### #.... .####' },
  f: { asc: '..## .#..', x: '###. .#.. .#.. .#.. .#..' },
  g: { x: '.#### #...# #...# .#### ....#', desc: '....# ####.' },
  h: { asc: '#.... #....', x: '####. #...# #...# #...# #...#' },
  i: { asc: '# .', x: '# # # # #', fixed: true },
  j: { asc: '..# ...', x: '..# ..# ..# ..# ..#', desc: '..# ##.', fixed: true },
  // the leg springs from the end of a short bar the arm comes down to, as on five rows
  k: { asc: '#... #...', x: '#..# #.#. ###. #..# #..#', x6: '#..# #.#. ###. #..# #..# #..#', x4: '#..# #.#. ###. #..#' },
  l: { asc: '#. #.', x: '#. #. #. #. .#' },
  m: { x: '.#.#. #.#.# #.#.# #.#.# #.#.#' },
  n: { x: '.###. #...# #...# #...# #...#' },
  o: { x: '.###. #...# #...# #...# .###.' },
  p: { x: '####. #...# #...# #...# ####.', desc: '#.... #....' },
  q: { x: '.#### #...# #...# #...# .####', desc: '....# ....#' },
  r: { x: '.### #... #... #... #...' },
  // the spine a level bar, as on five rows; at four rows the bars step past each other
  s: { x: '.#### #.... ##### ....# ####.', x6: '.#### #.... ##### ....# ....# ####.', x4: '.#### ###.. ..### ####.' },
  t: { asc: '.#..', x: '###. .#.. .#.. .#.. ..##', short: 1 },
  u: { x: '#...# #...# #...# #...# .####' },
  v: { x: '#...# #...# #...# .#.#. ..#..' },
  w: { x: '#.#.# #.#.# #.#.# #.#.# .#.#.' },
  x: { x: '#...# .#.#. ..#.. .#.#. #...#', x4: '#..# .##. .##. #..#' },
  y: { x: '#...# #...# #...# .#### ....#', desc: '....# ####.' },
  z: { x: '##### ...#. ..#.. .#... #####', x6: '##### ....# ...#. ..#.. .#... #####', x4: '#### ..#. .#.. ####' }
};

/** The letter forms on seven rows, as GRID_FORMS has them on five: each `setting=option` with the letters it redraws. */
export const GRID7_FORMS: Record<string, Record<string, Cells | Small>> = {
  // a single-storey a, its stem running on into a spur; at four rows a plain one, so it stands apart from the two-storey a
  'story=single': { a: { x: '.###. #...# #...# #..## .##.#', x6: '.###. #...# #...# #...# #..## .##.#', x4: '.#### #...# #...# .####' } },
  // k's arm and leg both from the stem, or from the end of a short bar; K likewise
  'kForm=stem': {
    k: { asc: '#... #...', x: '#..# #.#. ##.. #.#. #..#', x6: '#..# #.#. ##.. #.#. #..# #..#', x4: '#.#. ##.. #.#. #..#' },
    K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#'
  },
  'kForm=bar': {
    k: { asc: '#... #...', x: '#..# #..# ###. #..# #..#', x6: '#..# #..# ###. #..# #..# #..#', x4: '#..# ###. #..# #..#' },
    K: '#...# #...# #...# ####. #...# #...# #...#'
  },
  // I, i and l as plain stems, or with bars top and foot
  'iForm=plain': { I: '# # # # # # #', l: { asc: '# #', x: '# # # # #' } },
  'iForm=bars': { i: { asc: '.#. ...', x: '##. .#. .#. .#. ###', fixed: true }, l: { asc: '##. .#.', x: '.#. .#. .#. .#. ###' } },
  // J's cup rising higher
  'jForm=cup': { J: '....# ....# ....# #...# #...# #...# .###.' },
  // M's middle meeting a row higher
  'mForm=raised': { M: '##.## #.#.# #...# #...# #...# #...# #...#' },
  // Q's tail running from inside the bowl, or sweeping out under it
  'qForm=inside': { Q: '.###. #...# #...# #...# #...# #..## .####' },
  'qForm=sweep': { Q: ['.###. #...# #...# #...# #...# #...# .###. ...##', 1] },
  // R's bowl stopping short of the stem and running back into a straight leg
  'rForm=loop': { R: '####. #...# #...# #.##. #...# #...# #...#' },
  // Y a cup on a stem
  'yForm=cup': { Y: '#...# #...# #...# .###. ..#.. ..#.. ..#..' },
  // s and S's spine level, their turns square
  'sForm=flat': {
    s: { x: '##### #.... ##### ....# #####', x6: '##### #.... ##### ....# ....# #####', x4: '##### ###.. ..### #####' },
    S: '##### #.... #.... ##### ....# ....# #####'
  }
};
