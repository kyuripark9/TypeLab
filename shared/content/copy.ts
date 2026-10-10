/* Words the editor shows outside the controls: the parts of a letter, and the sample text. */

/** The parts of a letter, by part id: its name and what it is. The ids are the `part` the engine gives a stroke
    (shared/engine/glyphs.ts) and the marks and guide lines the Inspector names (client/components/Inspector.tsx). A
    part without an entry here (an ear, link, spur, swash or fillet) isn't named there, and its strokes are called
    just Stroke (client/lib/drag.ts). PART_CONTROL (controls.ts) says which control shapes each part. */
export const ANATOMY: Record<string, [string, string]> = {
  stem: ['Stem', 'The main, usually vertical, stroke of a letter.'],
  diagonal: ['Diagonal', 'A slanted main stroke.'],
  bowl: ['Bowl', 'The curved stroke that encloses a counter.'],
  crossbar: ['Crossbar', 'A horizontal stroke connecting or crossing stems.'],
  bar: ['Bar', 'A short horizontal stroke.'],
  arm: ['Arm', 'A stroke that is attached at one end and free at the other.'],
  leg: ['Leg', 'A downward diagonal stroke, as in K and R.'],
  tail: ['Tail', 'A stroke that descends or trails off, as in Q and y.'],
  shoulder: ['Shoulder', 'The arch that springs from a stem, as in n, h and m.'],
  spine: ['Spine', 'The main curved stroke of the S.'],
  hook: ['Hook', 'A curved stroke that bends back on itself.'],
  dot: ['Dot', 'The dot above i and j is called a tittle.'],
  counter: ['Counter', 'The enclosed space inside a letter.'],
  terminal: ['Terminal', 'The free end of a stroke.'],
  corner: ['Corner', 'Where a stroke turns, or a corner of a stroke end.'],
  apex: ['Apex', 'The peak where two diagonals meet at the top.'],
  vertex: ['Vertex', 'The point where two diagonals meet at the bottom.'],
  serif: ['Serif', 'A small finishing stroke at the end of a stem.'],
  entry: ['Entry stroke', 'The upstroke that leads into a letter, as if the pen arrived from the one before.'],
  baseline: ['Baseline', 'The invisible line all letters sit on.'],
  capHeight: ['Cap height', 'The height of capital letters.'],
  xHeight: ['x-height', 'The height of lowercase letters without ascenders.'],
  ascender: ['Ascender', 'The part of a lowercase letter rising above the x-height.'],
  descender: ['Descender', 'The part of a letter dropping below the baseline.']
};

export const TEXTS = {
  sentence: 'If you can design one thing, you can design everything.'
};
