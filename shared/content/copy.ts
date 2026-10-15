/* Words the editor shows outside the controls: the parts of a letter, and the sample text. */

/** The parts of a letter, by part id: its name and what it is. The ids are the `part` the engine gives a stroke
    (shared/engine/glyphs/) and the marks and guide lines the Inspector names
    (client/components/Inspector.tsx). A part without an entry here (an ear, link, spur, fillet or drawn) isn't
    named there, and its strokes are called just Stroke (client/lib/drag.ts). PART_CONTROL (controls.ts) says which
    control shapes each part. */
export const ANATOMY: Record<string, [string, string]> = {
  stem: ['Stem', 'The main, usually vertical, stroke of a letter.'],
  diagonal: ['Diagonal', 'A slanted main stroke.'],
  bowl: ['Bowl', 'The curved stroke that encloses a counter.'],
  crossbar: ['Crossbar', 'A bar across or between stems.'],
  bar: ['Bar', 'A short horizontal stroke.'],
  arm: ['Arm', 'A stroke free at one end, as in E and K.'],
  leg: ['Leg', 'A downward diagonal stroke, as in K and R.'],
  tail: ['Tail', 'A trailing stroke, as in Q and y.'],
  shoulder: ['Shoulder', 'The arch from a stem, as in n, h and m.'],
  spine: ['Spine', 'The main curved stroke of the S.'],
  hook: ['Hook', 'A curved stroke that bends back on itself.'],
  dot: ['Dot', 'The dot above i and j, also called a tittle.'],
  counter: ['Counter', 'The enclosed space inside a letter.'],
  terminal: ['Terminal', 'The free end of a stroke.'],
  corner: ['Corner', 'A turn in a stroke, or a corner of its end.'],
  apex: ['Apex', 'Where two diagonals meet at the top.'],
  vertex: ['Vertex', 'Where two diagonals meet at the bottom.'],
  serif: ['Serif', 'A small finishing stroke at the end of a stem.'],
  entry: ['Entry stroke', 'The upstroke leading into a letter.'],
  baseline: ['Baseline', 'The invisible line all letters sit on.'],
  capHeight: ['Cap height', 'The height of capital letters.'],
  xHeight: ['x-height', 'The height of a lowercase x.'],
  ascender: ['Ascender', 'The part of b, d or h above the x-height.'],
  descender: ['Descender', 'The part of a letter below the baseline.']
};

export const TEXTS = {
  sentence: 'If you can design one thing, you can design everything.',
  /** The style cards' sample in the grid while nothing is typed: two words, each set small enough to fit a line, so
      it never runs past a card's two lines (the sentence was cut off at "If you can design one…"). Its h, t, g and y
      still show the ascenders and descenders. */
  card: 'Design everything'
};
