/* Arc letters (the Arcs card, build 'arcs'): every letter cut from one circle, after the OTHER specimen. A letter is a few cuts,
   each an arc of the circle stretched, turned and moved, mostly a half or three quarters of it; they run past and
   through one another and into the letters beside them. Drawn as centreline strokes through the stroke letters' stages
   (strokesGlyph), so Weight, Contrast, Pinch, Curves, Facets, Stroke ends and the effects reach them as they reach
   those; Width stretches every cut across at once, Squareness squares the circle off, and Crossbar height, Openness,
   Bowl overlap and Tails & hooks move the cuts themselves (`shaped`, the small letters' Reach). O E R are measured off
   the specimen, the other capitals (T and H with their bars kept to a bar, so they read in words), the figures, a
   lowercase of its own (LOWER: rings, halves of a tall ellipse up to the ascender or down to the descender, arches
   and cups) and the punctuation and symbols (MARKS) drawn in its way; every character of the set is in arcs. Each
   letter is spaced from its own ink (`spaced`). Heavier, the letters widen, round loops grow rounder and narrow ones
   (a leg's, a tail's) run less far round, so no counter fills in. */
import { endId } from '../params';
import { CIRCLE_K, cubicAt, subCubic } from './geom';
import { strokesGlyph } from './glyph';
import { dotK } from './glyphs/shared';
import type { Glyph, GlyphDef, Metrics } from './font';
import type { Cmd } from './types';

type P = { x: number; y: number };

/** A cut of the circle: its arc stretched `a` across and `b` up (half-axes), turned `rot` degrees anticlockwise and
    centred at (x, y), run from angle `from` to angle `to` (degrees round the circle before it is stretched; rising runs
    anticlockwise). In units of the O's half-height at the stroke's middle: x from the letter's left edge there, y from
    the middle of the capitals. A cut all the way round is a closed ring. */
interface Cut {
  part: string; x: number; y: number; a: number; b: number; rot: number; from: number; to: number;
  /** the free ends Openness runs on round or cuts back: its start, its end, or both (a C's) */ open?: 's' | 'e' | 'se';
  /** the way a stem steps off its bowl as Bowl overlap parts them, -1 left or 1 right */ apart?: number;
}
/** A letter as drawn: its side-bearing factors, its cuts in drawing order (a letter's own values are saved by stroke
    index, so a new cut goes after the others), and the dots it has (an i's, a full stop's), each where its middle is. */
interface Drawn { sb: [number, number]; cuts: Cut[]; dots?: Dot[] }
/** A dot where its middle is, `k` times a full stop's size (1 if left out). */
interface Dot extends P { k?: number }
/** A letter set: as drawn, its body `w` across (the cuts may reach past it). */
interface ArcLetter extends Drawn { w: number }

const c = (part: string, x: number, y: number, a: number, b: number, from: number, to: number, rot = 0): Cut => ({ part, x, y, a, b, rot, from, to });
/** Cut `k` with the free ends Openness moves (`open`), or the way Bowl overlap steps it off its bowl (`apart`). */
const opens = (k: Cut, open: Cut['open']): Cut => ({ ...k, open });
const parts = (k: Cut, apart: number): Cut => ({ ...k, apart });
// the halves the letters stand on: a right half `)` and a left half `(` of an ellipse centred at (x, y)
const right = (part: string, x: number, a: number, b = 1, y = 0) => c(part, x, y, a, b, 90, -90);
const left = (part: string, x: number, a: number, b = 1, y = 0) => c(part, x, y, a, b, 90, 270);

/** The letters measured off the specimen, each body as set there (the cuts reach past it into the letters beside). */
const SPECIMEN: Record<string, ArcLetter> = {
  O: { w: 0.928, sb: [0.65, 0.65], cuts: [c('bowl', 0.464, 0, 0.464, 1, 90, 450)] },
  // two rounds open to the right, one on the other, the lower the wider
  E: { w: 0.8, sb: [0.25, 0.2], cuts: [c('bowl', 0.562, 0.483, 0.577, 0.504, 63.5, 340.5, -27.5), c('bowl', 0.606, -0.52, 0.6, 0.495, 63.9, 351.9, 7.1)] },
  // three quarters of the tall ellipse from its left side over the top and down, a round bowl three quarters round
  // from inside it, and a narrow leaning loop for the leg
  R: { w: 1.319, sb: [0.2, 0.6], cuts: [c('stem', 0.364, 0, 0.364, 1, 180, -90), c('bowl', 0.801, 0.479, 0.518, 0.551, 180, -90),
    c('leg', 0.941, -0.495, 0.596, 0.211, 180, 450, -55.8)] }
};

/** The rest, drawn in the specimen's way: stems are halves of the tall ellipse, bowls three quarters of a round,
    bars and legs narrow loops or shallow arcs, and diagonals quarters of an ellipse two cap heights tall, crossing
    where they meet. Each body is as wide as its cuts reach (`measured`). */
const DRAWN: Record<string, Drawn> = {
  // the specimen's T and H, their bars kept to what a bar is: the T's lying loop a low dome over the top, from the
  // left round to the right, its stem reaching up into it; the H's tilted loop a gentle rising arc
  // from stem to stem (in the specimen they loop on round, through the letters beside: in words they read as other
  // letters)
  T: { sb: [0.3, 0.3], cuts: [left('stem', 0.346, 0.346, 1, -0.018), c('bar', 0.168, 0.75, 0.759, 0.25, 155, 10)] },
  H: { sb: [0.65, 0.4], cuts: [right('stem', 0, 0.37), right('stem', 0.754, 0.37), through('crossbar', 0.3, -0.14, 1.2, 0.2, 0.08)] },
  // two quarters rising from the feet and crossing past each other under the top, and a loop for the bar
  A: { sb: [0.3, 0.3], cuts: [c('stem', 1, -1, 1, 2, 180, 100), c('stem', 0, -1, 1, 2, 0, 80), c('crossbar', 0.5, -0.3, 0.45, 0.14, 180, -90, 10)] },
  B: { sb: [0.65, 0.5], cuts: [parts(left('stem', 0.25, 0.25), -1), c('bowl', 0.6, 0.5, 0.42, 0.5, 165, -90), c('bowl', 0.62, -0.5, 0.5, 0.5, 90, -165)] },
  C: { sb: [0.6, 0.4], cuts: [opens(c('bowl', 0.5, 0, 0.5, 1, 45, 315), 'se')] },
  D: { sb: [0.65, 0.6], cuts: [parts(left('stem', 0.2, 0.2), -1), c('bowl', 0.25, 0, 0.75, 1, 105, -105)] },
  F: { sb: [0.65, 0.2], cuts: [left('stem', 0.3, 0.3, 0.96, -0.04), c('bar', 0.8, 0.78, 0.5, 0.22, 180, -90), c('crossbar', 0.62, -0.02, 0.38, 0.13, 180, -90, 12)] },
  G: { sb: [0.6, 0.5], cuts: [opens(c('bowl', 0.52, 0, 0.52, 1, 45, 360), 's'), c('bar', 0.8, -0.05, 0.26, 0.1, 10, 190)] },
  // (barely bent, so it isn't a parenthesis)
  I: { sb: [0.65, 0.65], cuts: [right('stem', 0, 0.15)] },
  J: { sb: [0.3, 0.65], cuts: [opens(c('stem', 0.15, 0, 0.45, 1, 90, -150), 'e')] },
  // two quarters leaving the stem's middle level, one up and one down
  K: { sb: [0.65, 0.2], cuts: [left('stem', 0.3, 0.3), c('arm', 0.3, 1, 0.75, 1, 250, 360), c('leg', 0.3, -1, 0.75, 1, 110, 0)] },
  // its foot a cup from the stem's foot, curling up at its end
  L: { sb: [0.65, 0.2], cuts: [left('stem', 0.3, 0.3, 0.95, 0.05), c('bar', 0.85, -0.8, 0.55, 0.2, 180, 400)] },
  // two arches side by side, and W two cups
  M: { sb: [0.6, 0.6], cuts: [c('bowl', 0.32, -1, 0.32, 2, 180, 0), c('bowl', 0.96, -1, 0.32, 2, 180, 0)] },
  N: { sb: [0.65, 0.4], cuts: [right('stem', 0, 0.3), c('diagonal', 0, -1, 1, 2, 90, 0), right('stem', 1, 0.3)] },
  Q: { sb: [0.65, 0.4], cuts: [c('bowl', 0.464, 0, 0.464, 1, 90, 450), c('tail', 0.8, -0.85, 0.35, 0.12, 180, 450, -35)] },
  S: { sb: [0.5, 0.5], cuts: [opens(c('bowl', 0.48, 0.5, 0.46, 0.5, 30, 270), 's'), opens(c('bowl', 0.52, -0.5, 0.5, 0.5, 90, -150), 'e')] },
  U: { sb: [0.6, 0.6], cuts: [c('bowl', 0.5, 1, 0.5, 2, 180, 360)] },
  V: { sb: [0.3, 0.3], cuts: [c('stem', 1, 1, 1, 2, 180, 260), c('stem', 0, 1, 1, 2, 0, -80)] },
  W: { sb: [0.6, 0.6], cuts: [c('bowl', 0.32, 1, 0.32, 2, 180, 360), c('bowl', 0.96, 1, 0.32, 2, 180, 360)] },
  // two gentle arcs crossing, bowed away from each other (two quarters both bowed up read as a λ)
  X: { sb: [0.3, 0.3], cuts: [through('diagonal', 0, 1, 1.05, -1, -0.07), through('diagonal', 1.05, 1, 0, -1, 0.07)] },
  Y: { sb: [0.3, 0.3], cuts: [c('arm', 0.5, 1, 0.5, 1, 180, 360), right('stem', 0.5, 0.2, 0.5, -0.5)] },
  Z: { sb: [0.4, 0.4], cuts: [c('bar', 0.5, 0.9, 0.5, 0.1, 180, 0), c('diagonal', 0, 1, 1, 2, 0, -90), c('bar', 0.5, -0.9, 0.5, 0.1, 180, 360)] },
  // P is R without its leg
  P: { sb: [0.2, 0.5], cuts: SPECIMEN.R.cuts.slice(0, 2) },
  0: { sb: [0.6, 0.6], cuts: [c('bowl', 0.38, 0, 0.38, 1, 90, 450)] },
  1: { sb: [0.4, 0.6], cuts: [right('stem', 0.3, 0.25), c('arm', 0, 1, 0.3, 0.5, 0, -90)] },
  2: { sb: [0.5, 0.5], cuts: [opens(c('bowl', 0.45, 0.42, 0.45, 0.58, 155, -40), 's'), c('diagonal', 0, 0.047, 0.795, 1.047, 0, -90), c('bar', 0.47, -0.9, 0.47, 0.1, 180, 360)] },
  3: { sb: [0.5, 0.6], cuts: [opens(c('bowl', 0.42, 0.5, 0.42, 0.5, 150, -90), 's'), opens(c('bowl', 0.45, -0.48, 0.5, 0.52, 90, -150), 'e')] },
  4: { sb: [0.4, 0.5], cuts: [c('diagonal', 0.75, -0.4, 0.75, 1.4, 90, 180), c('bar', 0.52, -0.31, 0.52, 0.09, 180, 360), right('stem', 0.7, 0.18)] },
  5: { sb: [0.5, 0.5], cuts: [c('bar', 0.55, 0.9, 0.38, 0.1, 0, 180), left('stem', 0.17, 0.08, 0.42, 0.48), opens(c('bowl', 0.48, -0.45, 0.5, 0.55, 140, -150), 'e')] },
  6: { sb: [0.6, 0.5], cuts: [c('bowl', 0.5, -0.45, 0.5, 0.55, 90, 450), opens(c('stem', 0.72, -0.45, 0.72, 1.45, 65, 180), 's')] },
  7: { sb: [0.4, 0.4], cuts: [c('bar', 0.5, 0.9, 0.5, 0.1, 180, 0), c('diagonal', 0.3, 1, 0.7, 2, 0, -90)] },
  8: { sb: [0.55, 0.55], cuts: [c('bowl', 0.5, 0.52, 0.42, 0.48, 90, 450), c('bowl', 0.5, -0.48, 0.5, 0.52, 90, 450)] },
  9: { sb: [0.5, 0.6], cuts: [c('bowl', 0.5, 0.45, 0.5, 0.55, 90, 450), opens(c('stem', 0.28, 0.45, 0.72, 1.45, 0, -115), 'e')] },
  '(': { sb: [0.5, 0.3], cuts: [left('stem', 0.35, 0.35, 1.1)] },
  ')': { sb: [0.3, 0.5], cuts: [right('stem', 0, 0.35, 1.1)] },
  '-': { sb: [0.4, 0.4], cuts: [c('bar', 0.3, -0.1, 0.3, 0.08, 180, 0)] }
};

/** Where cut `c` runs across, left and right, as drawn. */
function across(c: Cut): [number, number] {
  const r = c.rot * Math.PI / 180;
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i <= 180; i++) {
    const t = (c.from + (c.to - c.from) * i / 180) * Math.PI / 180, x = c.x + c.a * Math.cos(t) * Math.cos(r) - c.b * Math.sin(t) * Math.sin(r);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
  }
  return [x0, x1];
}

/** A drawn letter set with its left edge where its cuts start across, and its body as wide as they reach. */
function measured(L: Drawn): ArcLetter {
  const xs = [...L.cuts.flatMap(across), ...(L.dots ?? []).map(d => d.x)], x0 = Math.min(...xs), x1 = Math.max(...xs);
  return { w: x1 - x0, sb: L.sb, cuts: L.cuts.map(k => ({ ...k, x: k.x - x0 })), ...(L.dots && { dots: L.dots.map(d => ({ ...d, x: d.x - x0 })) }) };
}

/** Where the small letters reach, in units of the o's half-height from the middle of the x-height, at the stroke's
    middle: the ascenders' tops (A) and the descenders' feet (Z). The x-height is 1, the baseline -1. */
interface Reach {
  A: number; Z: number;
  /** how far Crossbar height moves the bars up (down for a negative one), and how far round Tails & hooks runs the
      tails, 0 to 1 (0.5 as drawn) */
  K: number; T: number;
}

/** A half `(` of an ellipse `a` across, its two ends at `x` on heights `top` and `bottom`, bulging left; `)` bulging right. */
const tallL = (part: string, x: number, a: number, top: number, bottom: number) => c(part, x, (top + bottom) / 2, a, (top - bottom) / 2, 90, 270);
const tallR = (part: string, x: number, a: number, top: number, bottom: number) => c(part, x, (top + bottom) / 2, a, (top - bottom) / 2, 90, -90);
/** The small letters' bowl: `o`'s half-width, a ring round the x-height `LA` across each side of its middle. */
const LA = 0.6;
const bowl = (x = LA) => c('bowl', x, 0, LA, 1, 90, 450);
/** A stem down past the baseline to the descender that hooks off to the left at its foot, its top at `x`, its end
    rising `lift` of the way back up the descender, so however long the descender the tail stays under the baseline. */
function hookDown(x: number, z: Reach, a = 0.42, lift = 0.15 + 0.5 * z.T): Cut {
  // (a descender too short for it leaves no hook to read: a g as an o)
  const Z = Math.min(z.Z, HOOK_LEAST), b = 1 - Z, endY = Z + lift * (-1 - Z);
  return c('tail', x - a, 1, a, b, 0, -180 - Math.asin(Math.max(-1, (endY - 1) / b)) * 180 / Math.PI);
}
/** An ascender's top (in units) below ASC_SOFT comes back up ASC_GIVE of the way to it. */
const ASC_SOFT = 1.7, ASC_GIVE = 0.6;
/** The least a hook hangs below the baseline, in units, whatever the descender: deep enough to read as a hook. */
const HOOK_LEAST = -1.5;
/** An arch standing on the baseline, `a` either side of `x`, rising to the x-height: the n's, and the m's two. */
const arch = (x: number, a: number, from = 180, to = 0) => c('arch', x, -1, a, 2, from, to);

/** The small letters, drawn in the capitals' way to the x-height, their stems run up to the ascender or down to the
    descender: bowls rings, stems halves of a tall ellipse, arches and cups halves of one standing on the baseline or
    hanging from the x-height. v w x z are their capitals' cuts. */
const LOWER: Record<string, (z: Reach) => Drawn> = {
  a: () => ({ sb: [0.6, 0.65], cuts: [bowl(), parts(tallL('stem', 2 * LA + 0.14, 0.14, 1, -1), 1)] }),
  b: z => ({ sb: [0.65, 0.6], cuts: [parts(tallL('stem', 0.2, 0.2, z.A, -1), -1), bowl(0.14 + LA)] }),
  c: () => ({ sb: [0.6, 0.45], cuts: [opens(c('bowl', LA, 0, LA, 1, 50, 310), 'se')] }),
  d: z => ({ sb: [0.6, 0.65], cuts: [bowl(), parts(tallL('stem', 2 * LA + 0.14, 0.14, z.A, -1), 1)] }),
  // its bar where Crossbar height puts it, the bowl running round from its end
  e: z => {
    const y = Math.max(-0.6, Math.min(0.6, z.K)), t = Math.asin(y) * 180 / Math.PI;
    return { sb: [0.6, 0.5], cuts: [opens(c('bowl', LA, 0, LA, 1, t, 318), 'e'), c('bar', LA, y, LA * Math.cos(t * Math.PI / 180), 0.1, 0, 180)] };
  },
  f: z => ({ sb: [0.5, 0.3], cuts: [c('stem', 0.3, (z.A - 1) / 2, 0.3, (z.A + 1) / 2, 270, 55), c('crossbar', 0.3, 1, 0.42, 0.08, 180, 0)] }),
  g: z => ({ sb: [0.6, 0.6], cuts: [bowl(), hookDown(2 * LA + 0.04, z, 0.7)] }),
  h: z => ({ sb: [0.65, 0.6], cuts: [tallL('stem', 0.2, 0.2, z.A, -1), arch(0.2 + LA, LA, 150)] }),
  i: () => ({ sb: [0.65, 0.65], cuts: [tallR('stem', 0, 0.12, 1, -1)], dots: [{ x: 0, y: 1.7 }] }),
  j: z => ({ sb: [0.3, 0.65], cuts: [hookDown(0.36, z, 0.3)], dots: [{ x: 0.36, y: 1.7 }] }),
  k: z => ({ sb: [0.65, 0.3], cuts: [tallL('stem', 0.22, 0.22, z.A, -1), c('arm', 0.22, 1, 0.62, 1, 250, 360), c('leg', 0.22, -1, 0.62, 1, 110, 0)] }),
  l: z => ({ sb: [0.65, 0.65], cuts: [tallR('stem', 0, 0.14, z.A, -1)] }),
  m: () => ({ sb: [0.6, 0.6], cuts: [arch(0.45, 0.45), arch(1.35, 0.45)] }),
  n: () => ({ sb: [0.6, 0.6], cuts: [arch(LA, LA)] }),
  o: () => ({ sb: [0.6, 0.6], cuts: [bowl()] }),
  p: z => ({ sb: [0.65, 0.6], cuts: [parts(tallL('stem', 0.2, 0.2, 1, z.Z), -1), bowl(0.14 + LA)] }),
  q: z => ({ sb: [0.6, 0.65], cuts: [bowl(), parts(tallL('stem', 2 * LA + 0.14, 0.14, 1, z.Z), 1)] }),
  r: () => ({ sb: [0.6, 0.2], cuts: [arch(0.5, 0.5, 180, 65)] }),
  s: () => ({ sb: [0.5, 0.5], cuts: DRAWN.S.cuts }),
  t: z => {
    const top = 1 + (z.A - 1) * 0.55;
    return { sb: [0.4, 0.3], cuts: [c('stem', 0.3, (top - 1) / 2, 0.3, (top + 1) / 2, 90, 300), c('crossbar', 0.3, 1, 0.42, 0.08, 180, 0)] };
  },
  u: () => ({ sb: [0.6, 0.6], cuts: [c('bowl', LA, 1, LA, 2, 180, 360)] }),
  v: () => ({ sb: DRAWN.V.sb, cuts: DRAWN.V.cuts }),
  w: () => ({ sb: DRAWN.W.sb, cuts: DRAWN.W.cuts }),
  x: () => ({ sb: DRAWN.X.sb, cuts: DRAWN.X.cuts }),
  y: z => ({ sb: [0.3, 0.3], cuts: [c('stem', 1, 1, 1, 2, 180, 255), c('tail', 0, 1, 1, 1 - Math.min(z.Z, HOOK_LEAST), 0, -75 - 50 * z.T)] }),
  z: () => ({ sb: DRAWN.Z.sb, cuts: DRAWN.Z.cuts }),
  // the i the accents stand on, with no dot of its own
  ı: () => ({ sb: [0.65, 0.65], cuts: [tallR('stem', 0, 0.12, 1, -1)] })
};

/** The capitals, the figures and ( ) -, set: the small letters (LOWER) and the punctuation and symbols (MARKS) are
    drawn for the metrics, their stems reaching the ascender and the descender. */
export const ARC_LETTERS: Record<string, ArcLetter> = {
  ...SPECIMEN, ...Object.fromEntries(Object.entries(DRAWN).map(([ch, L]) => [ch, measured(L)]))
};

/** Where the punctuation stands, in the capitals' units (their middle 0, the capitals' top 1, the baseline about -1):
    the baseline itself (B), the x-height (X), the ascender (A) and the descender (Z), the middle the dashes and the
    maths stand on (M, halfway up the x-height), and a dot's radius (r), so a dot sits on the baseline at B + r. */
interface Zones extends Reach { B: number; X: number; M: number; r: number }

/** Cuts and dots turned `deg` anticlockwise about (px, py), each cut's ellipse turned with it. */
function turned(L: Drawn, deg: number, px = 0, py = 0): Drawn {
  const r = deg * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r);
  const at = (p: P) => ({ x: px + (p.x - px) * cr - (p.y - py) * sr, y: py + (p.x - px) * sr + (p.y - py) * cr });
  return { sb: L.sb, cuts: L.cuts.map(k => ({ ...k, ...at(k), rot: k.rot + deg })), ...(L.dots && { dots: L.dots.map(d => ({ ...d, ...at(d) })) }) };
}
/** Cuts scaled `s` about the origin and moved by (dx, dy). */
const scaled = (cuts: Cut[], s: number, dx = 0, dy = 0) => cuts.map(k => ({ ...k, x: k.x * s + dx, y: k.y * s + dy, a: k.a * s, b: k.b * s }));
/** A bar from x0 to x1 at height y, its middle bowed `bend` up (down for a negative one), as the dash's. */
const bar = (x0: number, x1: number, y: number, bend = 0.06, part = 'bar') =>
  bend >= 0 ? c(part, (x0 + x1) / 2, y - bend / 2, (x1 - x0) / 2, bend, 180, 0) : c(part, (x0 + x1) / 2, y - bend / 2, (x1 - x0) / 2, -bend, 180, 360);
/** A gentle arc of a circle from (x0, y0) to (x1, y1), its middle bowed `bow` of its length to the left of the way it
    runs (to the right for a negative one): a diagonal, a slash. */
function through(part: string, x0: number, y0: number, x1: number, y1: number, bow = 0.05): Cut {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), s = Math.max(1e-3, Math.abs(bow)) * L, R = (L * L / 4 + s * s) / (2 * s);
  const side = bow < 0 ? -1 : 1, nx = -dy / L * side, ny = dx / L * side;
  const cx = (x0 + x1) / 2 - nx * (R - s), cy = (y0 + y1) / 2 - ny * (R - s);
  const a0 = Math.atan2(y0 - cy, x0 - cx) * 180 / Math.PI;
  let d = Math.atan2(y1 - cy, x1 - cx) * 180 / Math.PI - a0;
  d = ((d % 360) + 540) % 360 - 180;
  return c(part, cx, cy, R, R, a0, a0 + d);
}
/** A V `w` across and `h` tall, its two arms (bowed out, as the capital's are) meeting in a point at the bottom of its
    middle, its top at height 0. */
const vee = (w: number, h: number) => [c('stem', w, 0, w, h / 0.866, 180, 240), c('stem', 0, 0, w, h / 0.866, 0, -60)];
/** A comma's tail hanging from (x, y), curling off to the left. */
const tail = (x: number, y: number, T: number) => c('tail', x - 0.12, y, 0.12, 0.3 * (0.6 + 0.8 * T), 0, -110);
/** A comma whose dot sits at (x, y), and the same turned half round about its dot (the quote ‘). */
const comma = (x: number, y: number, T: number): Drawn => ({ sb: [0.8, 0.8], cuts: [tail(x, y, T)], dots: [{ x, y }] });
const turnedComma = (x: number, y: number, T: number) => turned(comma(x, y, T), 180, x, y);
/** Two of a mark side by side, `gap` apart. */
function pair(L: Drawn, gap: number): Drawn {
  return { sb: L.sb, cuts: [...L.cuts, ...scaled(L.cuts, 1, gap)], dots: [...(L.dots ?? []), ...(L.dots ?? []).map(d => ({ ...d, x: d.x + gap }))] };
}
/** An upright mark in the capitals' way: a stem barely bent, from `top` to `bottom`. */
const upright = (x: number, top: number, bottom: number, a = 0.06) => tallR('stem', x, a, top, bottom);
/** A chevron pointing left (‹, <), `w` across and `h` tall about the middle `M`, as a V lying on its side. */
const chevron = (w: number, h: number, M: number, x = 0): Cut[] =>
  turned({ sb: [0, 0], cuts: vee(h, w) }, -90).cuts.map(k => ({ ...k, x: k.x + x, y: k.y + M + h / 2 }));
/** Chevrons turned to point right (›, >). */
const rightward = (cuts: Cut[], M: number) => turned({ sb: [0, 0], cuts }, 180, 0, M).cuts;
/** A ring `rx` across and `ry` up about (x, y). */
const ring = (x: number, y: number, rx: number, ry = rx, part = 'bowl') => c(part, x, y, rx, ry, 90, 450);
/** The marks with no dots of their own. */
const plain = (sb: [number, number], cuts: Cut[]): Drawn => ({ sb, cuts });

/** Punctuation and symbols, in the capitals' units: dots as big as a full stop, bars bowed as the dash is, diagonals
    and chevrons quarters of an ellipse, as the capitals' diagonals are, rings and halves of the circle. */
const MARKS: Record<string, (z: Zones) => Drawn> = {
  '.': z => ({ sb: [0.8, 0.8], cuts: [], dots: [{ x: 0, y: z.B + z.r }] }),
  ',': z => comma(0, z.B + z.r, z.T),
  ':': z => ({ sb: [0.8, 0.8], cuts: [], dots: [{ x: 0, y: z.B + z.r }, { x: 0, y: z.X - z.r }] }),
  ';': z => ({ ...comma(0, z.B + z.r, z.T), dots: [{ x: 0, y: z.B + z.r }, { x: 0, y: z.X - z.r }] }),
  '…': z => ({ sb: [0.8, 0.8], cuts: [], dots: [0, 1, 2].map(i => ({ x: i * (0.3 + 2 * z.r), y: z.B + z.r })) }),
  '!': z => ({ sb: [0.9, 0.9], cuts: [upright(0, 1, z.B + 2 * z.r + 0.25)], dots: [{ x: 0, y: z.B + z.r }] }),
  '¡': z => turned(MARKS['!'](z), 180, 0, (z.X + z.B) / 2),
  '?': z => ({ sb: [0.5, 0.6], cuts: [c('bowl', 0.42, 0.42, 0.42, 0.58, 160, -90), upright(0.42, -0.16, z.B + 2 * z.r + 0.25, 0.04)], dots: [{ x: 0.42, y: z.B + z.r }] }),
  '¿': z => ({ ...turned(MARKS['?'](z), 180, 0.42, (z.X + z.B) / 2), sb: [0.6, 0.5] }),
  "'": () => plain([0.8, 0.8], [upright(0, 1, 0.5, 0.04)]),
  '"': z => pair(MARKS["'"](z), 0.32),
  '’': z => comma(0, 1 - z.r, z.T),
  '‘': z => turnedComma(0, 1 - z.r - 0.3, z.T),
  '‚': z => comma(0, z.B + z.r, z.T),
  '”': z => pair(comma(0, 1 - z.r, z.T), 0.3 + 2 * z.r),
  '“': z => pair(turnedComma(0, 1 - z.r - 0.3, z.T), 0.3 + 2 * z.r),
  '„': z => pair(comma(0, z.B + z.r, z.T), 0.3 + 2 * z.r),
  '‹': z => plain([0.4, 0.4], chevron(0.45, 0.7, z.M)),
  '›': z => plain([0.4, 0.4], rightward(chevron(0.45, 0.7, z.M), z.M)),
  '«': z => plain([0.4, 0.4], [...chevron(0.45, 0.7, z.M), ...chevron(0.45, 0.7, z.M, 0.38)]),
  '»': z => plain([0.4, 0.4], rightward(MARKS['«'](z).cuts, z.M)),
  '[': () => plain([0.6, 0.3], [tallL('stem', 0.06, 0.06, 1.1, -1.1), bar(0.06, 0.4, 1.1), bar(0.06, 0.4, -1.1, -0.06)]),
  ']': z => plain([0.3, 0.6], turned(MARKS['['](z), 180, 0.2, 0).cuts),
  '{': () => plain([0.6, 0.3], [c('stem', 0.4, 0.55, 0.2, 0.55, 90, 180), c('stem', 0, 0.55, 0.2, 0.55, 0, -90),
    c('stem', 0, -0.55, 0.2, 0.55, 90, 0), c('stem', 0.4, -0.55, 0.2, 0.55, 180, 270)]),
  '}': z => plain([0.3, 0.6], turned(MARKS['{'](z), 180, 0.2, 0).cuts),
  '–': z => plain([0.3, 0.3], [bar(0, 1, z.M)]),
  '—': z => plain([0.2, 0.2], [bar(0, 2, z.M)]),
  '_': z => plain([0.1, 0.1], [bar(0, 1, z.B - 0.25, -0.06)]),
  '/': z => plain([0.2, 0.2], [through('diagonal', 0, z.Z * 0.6, 0.85, 1.1)]),
  '\\': z => plain([0.2, 0.2], [through('diagonal', 0, 1.1, 0.85, z.Z * 0.6)]),
  '|': z => plain([0.8, 0.8], [upright(0, z.A, z.Z)]),
  '·': z => ({ sb: [0.8, 0.8], cuts: [], dots: [{ x: 0, y: z.M }] }),
  '•': z => ({ sb: [0.6, 0.6], cuts: [], dots: [{ x: 0, y: z.M, k: 2 }] }),
  '&': () => plain([0.5, 0.3], [ring(0.42, 0.55, 0.26, 0.4), c('bowl', 0.5, -0.45, 0.5, 0.55, 118, 375), through('leg', 0.3, 0.2, 1.15, -1, -0.06)]),
  '@': z => plain([0.5, 0.5], [c('bowl', 0.85, z.M, 0.85, 0.95, -20, 300), ring(0.8, z.M - 0.05, 0.3, 0.38), tallL('stem', 1.2, 0.1, z.M + 0.33, z.M - 0.43)]),
  '#': () => plain([0.4, 0.4], [through('diagonal', 0.15, -0.9, 0.45, 0.9), through('diagonal', 0.6, -0.9, 0.9, 0.9), bar(0, 1.05, 0.3), bar(0, 1.05, -0.3)]),
  $: () => plain([0.5, 0.5], [...ARC_LETTERS.S.cuts, upright(0.5, 1.25, -1.25, 0.04)]),
  '¢': z => { const s = (z.X + 1) / 2; return plain([0.6, 0.4], [...scaled(ARC_LETTERS.C.cuts, s, 0, -1 + s), upright(0.55 * s, z.X + 0.25, -1.25, 0.03)]); },
  '€': () => plain([0.4, 0.4], [...scaled(ARC_LETTERS.C.cuts, 1, 0.2), bar(0, 0.75, 0.18), bar(0, 0.7, -0.2)]),
  '£': () => plain([0.4, 0.4], [c('stem', 0.45, 0, 0.3, 1, 270, 55), bar(0, 0.75, -0.05), bar(0.1, 1, -1, -0.06)]),
  '¥': () => plain([0.3, 0.3], [...ARC_LETTERS.Y.cuts, bar(0.1, 0.9, -0.25), bar(0.1, 0.9, -0.55)]),
  '%': () => plain([0.4, 0.4], [ring(0.22, 0.55, 0.2, 0.32), ring(0.98, -0.55, 0.2, 0.32), through('diagonal', 0.05, -1, 1.15, 1)]),
  '+': z => plain([0.5, 0.5], [bar(0, 0.9, z.M), upright(0.45, z.M + 0.45, z.M - 0.45, 0.04)]),
  '−': z => plain([0.5, 0.5], [bar(0, 0.9, z.M)]),
  '×': z => plain([0.5, 0.5], turned(MARKS['+'](z), 45, 0.45, z.M).cuts),
  '÷': z => ({ sb: [0.5, 0.5], cuts: [bar(0, 0.9, z.M)], dots: [{ x: 0.45, y: z.M + 0.35 }, { x: 0.45, y: z.M - 0.35 }] }),
  '=': z => plain([0.5, 0.5], [bar(0, 0.9, z.M + 0.2), bar(0, 0.9, z.M - 0.2)]),
  '<': z => plain([0.5, 0.5], chevron(0.75, 0.9, z.M)),
  '>': z => plain([0.5, 0.5], rightward(chevron(0.75, 0.9, z.M), z.M)),
  '±': z => plain([0.5, 0.5], [bar(0, 0.9, z.M + 0.15), upright(0.45, z.M + 0.6, z.M - 0.3, 0.04), bar(0, 0.9, z.M - 0.6)]),
  '~': z => plain([0.5, 0.5], [bar(0, 0.5, z.M, 0.12), bar(0.5, 1, z.M, -0.12)]),
  '^': () => plain([0.4, 0.4], turned({ sb: [0, 0], cuts: vee(0.7, 0.55) }, 180).cuts.map(k => ({ ...k, y: k.y + 0.45 }))),
  '*': () => plain([0.5, 0.5], [0, 60, 120].flatMap(d => turned({ sb: [0, 0], cuts: [upright(0, 0.28, -0.28, 0.04)] }, d).cuts)
    .map(k => ({ ...k, x: k.x + 0.3, y: k.y + 0.65 }))),
  '°': () => plain([0.5, 0.5], [ring(0.2, 0.75, 0.2, 0.24)]),
  '©': () => plain([0.5, 0.5], [ring(0.95, 0, 0.95, 1), ...scaled(ARC_LETTERS.C.cuts, 0.5, 0.7, 0)]),
  '®': () => plain([0.5, 0.5], [ring(0.95, 0, 0.95, 1), ...scaled(ARC_LETTERS.R.cuts, 0.45, 0.95 - ARC_LETTERS.R.w * 0.45 / 2, 0)]),
  '™': () => plain([0.4, 0.4], [...scaled(ARC_LETTERS.T.cuts, 0.4, 0.2, 0.6), ...scaled(ARC_LETTERS.M.cuts, 0.4, 0.55, 0.6)]),
  '§': () => plain([0.5, 0.5], [...scaled(ARC_LETTERS.S.cuts, 0.6, 0, 0.45), ...scaled(ARC_LETTERS.S.cuts, 0.6, 0, -0.45)]),
  '¶': () => plain([0.5, 0.5], [c('bowl', 0.4, 0.45, 0.4, 0.55, 90, 270), upright(0.4, 1, -1.1, 0.03), upright(0.75, 1, -1.1, 0.03)]),
  '†': () => plain([0.5, 0.5], [upright(0.35, 1, -1.1, 0.04), bar(0, 0.7, 0.45)]),
  '‡': () => plain([0.5, 0.5], [upright(0.35, 1, -1.1, 0.04), bar(0, 0.7, 0.45), bar(0, 0.7, -0.45)]),
  '`': () => plain([0.5, 0.5], [through('tail', 0, 1.05, 0.26, 0.72, -0.1)])
};

/** The quarter of the circle from angle q·90° to (q + 1)·90°, as a cubic whose handles are `k` of the radius. */
function quarterOf(q: number, k: number): P[] {
  const a = q * Math.PI / 2, b = a + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  return [{ x: ca, y: sa }, { x: ca - sa * k, y: sa + ca * k }, { x: cb + sb * k, y: sb - cb * k }, { x: cb, y: sb }];
}

/** Where along quarter `P` (starting at angle `a0`) its curve is at angle `deg`, as the cubic's own parameter. */
function uAt(P: P[], a0: number, deg: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const u = (lo + hi) / 2, p = cubicAt(P, u);
    let d = Math.atan2(p.y, p.x) * 180 / Math.PI - a0;
    d = ((d % 360) + 360 + 45) % 360 - 45;
    if (d < deg - a0) lo = u; else hi = u;
  }
  return (lo + hi) / 2;
}

/** A cut's centreline as path commands in letter units: its arc of the circle, a quarter at a time, each quarter's
    handles `k` of the radius (the circle's own at Squareness 0), stretched, turned and placed by `map`. */
function cutPath(c: Cut, k: number, map: (x: number, y: number) => [number, number]): Cmd[] {
  const lo = Math.min(c.from, c.to), hi = Math.max(c.from, c.to), ring = hi - lo >= 360 - 1e-6;
  const r = c.rot * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r);
  const place = (p: P) => { const x = p.x * c.a, y = p.y * c.b; return map(c.x + x * cr - y * sr, c.y + x * sr + y * cr); };
  const segs: P[][] = [];
  for (let q = Math.floor(lo / 90); q * 90 < hi - 1e-6; q++) {
    const a0 = q * 90, P = quarterOf(q, k), s = Math.max(lo, a0), e = Math.min(hi, a0 + 90);
    if (e - s < 1e-6) continue;
    segs.push(subCubic(P, s > a0 ? uAt(P, a0, s) : 0, e < a0 + 90 ? uAt(P, a0, e) : 1));
  }
  // a cut run clockwise is drawn from its own start
  if (c.to < c.from) { segs.reverse(); segs.forEach(s => s.reverse()); }
  const pts = segs.map(s => s.map(place));
  // a ring closes exactly where it started
  if (ring) pts[pts.length - 1][3] = pts[0][0];
  const cmds: Cmd[] = [['M', ...pts[0][0]]];
  for (const [, c1, c2, e] of pts) cmds.push(['C', ...c1, ...c2, ...e]);
  if (ring) cmds.push(['Z']);
  return cmds;
}

/** How far Stroke ends' Length moves an end of a cut round its circle at either end of the slider: run on RUN_MOST
    degrees, no further along it than RUN_LEN units nor than leaves a gap of RING_GAP between its two ends; cut back
    CUT_MOST of the arc, no further along it than CUT_LEN units. */
const RUN_MOST = 45, RUN_LEN = 0.5, RING_GAP = 15, CUT_MOST = 0.15, CUT_LEN = 0.3;

/** Cut `c` with its ends run on round its circle or cut back, by Length at `vs` and `ve` (0.5 as drawn). An end standing
    on the baseline or the cap height, the stroke running out through it there (an A's foot, a U's top), stays on it. */
function lengthened(c: Cut, vs: number, ve: number): Cut {
  const span = Math.abs(c.to - c.from), dir = Math.sign(c.to - c.from), room = Math.max(0, (360 - RING_GAP - span) / 2);
  const r = c.rot * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r);
  /** How far end `at` (degrees) moves round at `v`, `out` the way it runs on (1 round, -1 back). */
  const by = (v: number, at: number, out: number) => {
    const t = at * Math.PI / 180, y = c.y + c.a * Math.cos(t) * sr + c.b * Math.sin(t) * cr;
    const dx = out * (-c.a * Math.sin(t) * cr - c.b * Math.cos(t) * sr), dy = out * (-c.a * Math.sin(t) * sr + c.b * Math.cos(t) * cr), speed = Math.hypot(dx, dy);
    if (Math.abs(y) > 0.9 && Math.sign(y) * dy > 0.5 * speed) return 0;
    const deg = (len: number) => len / speed * 180 / Math.PI;
    return v < 0.5 ? -(0.5 - v) * 2 * Math.min(CUT_MOST * span, deg(CUT_LEN)) : (v - 0.5) * 2 * Math.min(RUN_MOST, room, deg(RUN_LEN));
  };
  return { ...c, from: c.from - dir * by(vs, c.from, -dir), to: c.to + dir * by(ve, c.to, dir) };
}


/** How far each cut reaches across its narrowest way, as a share of the unit, stretched `ws` across: the smaller of the
    half-axes of the ellipse it draws once stretched. */
function narrowest(c: Cut, ws: number): number {
  const r = c.rot * Math.PI / 180, p = ws * Math.cos(r) * c.a, q = -ws * Math.sin(r) * c.b, u = Math.sin(r) * c.a, v = Math.cos(r) * c.b;
  const f = p * p + q * q + u * u + v * v, det = p * v - q * u;
  return Math.sqrt(Math.max(0, (f - Math.sqrt(Math.max(0, f * f - 4 * det * det))) / 2));
}

/** A dot is DOT strokes across (a full stop's, an i's), as the stroke letters' are. */
const DOT = 1.18;

/** A cut running at least LOOP_SPAN round holds a counter inside it, kept open by OPEN of a stroke however heavy: a
    round one (a bowl, its narrower axis NARROW of its wider or more) grows rounder (`plumped`), a narrow one (a leg's,
    a tail's or a bar's loop, which runs through the letter's other strokes) runs less far round instead (`unlooped`). */
const LOOP_SPAN = 250, OPEN = 0.4, NARROW = 0.5;
/** How much wider the letters are drawn, in font units for each unit their stroke is heavier than S_LIGHT: a heavy M's
    arches and H's halves keep room between them, as the stroke letters widen with Weight. */
const GROW = 1.3, S_LIGHT = 50;

/** How far up and down from its centre cut `c`'s ellipse reaches. */
const tall = (c: Cut) => { const r = c.rot * Math.PI / 180; return Math.hypot(c.a * Math.sin(r), c.b * Math.cos(r)); };

/** Cut `c` plumped so a stroke `t` thick (in units) leaves its counter open, stretched `ws` across: a loop narrower than
    that has its narrower axis drawn out by as little as does, a loop off the middle growing in toward it so its edge
    at the cap height or the baseline stays; other cuts as they are. Heavier letters' bars and legs come out rounder. */
function plumped(c: Cut, t: number, ws: number): Cut {
  const need = (1 + OPEN) * t / 2;
  if (Math.abs(c.to - c.from) < LOOP_SPAN || narrowLoop(c) || narrowest(c, ws) >= need) return c;
  // the narrower axis drawn out as far as the wider one; a loop still too narrow, round now, grows all over
  const key = c.a < c.b ? 'a' : 'b', most = Math.max(c.a, c.b) / c[key], grown = (f: number): Cut => ({ ...c, [key]: c[key] * f });
  let out = grown(most);
  if (narrowest(out, ws) < need) { const g = need / narrowest(out, ws); out = { ...out, a: out.a * g, b: out.b * g }; }
  else {
    let lo = 1, hi = most;
    for (let i = 0; i < 30; i++) { const f = (lo + hi) / 2; if (narrowest(grown(f), ws) < need) lo = f; else hi = f; }
    out = grown(hi);
  }
  return Math.abs(c.y) < 0.2 ? out : { ...out, y: c.y - Math.sign(c.y) * (tall(out) - tall(c)) };
}

/** Whether cut `c` is a narrow loop, run at least LOOP_SPAN round but not all the way: a leg's, a tail's, a bar's. */
const narrowLoop = (c: Cut) => { const span = Math.abs(c.to - c.from); return span >= LOOP_SPAN && span < 360 - 1e-6 && Math.min(c.a, c.b) < NARROW * Math.max(c.a, c.b); };

/** Narrow loop `c` run less far round, from its end, as a stroke `t` thick (in units) would close it, stretched `ws`
    across: as far round as drawn while its narrower way keeps (1 + OPEN) of a half stroke, half round (a hook) once
    it keeps only half that. Other cuts as they are. */
function unlooped(c: Cut, t: number, ws: number): Cut {
  if (!narrowLoop(c)) return c;
  const f = narrowest(c, ws) / ((1 + OPEN) * t / 2);
  if (f >= 1) return c;
  const span = Math.abs(c.to - c.from), dir = Math.sign(c.to - c.from), u = Math.min(1, (1 - f) * 2);
  return { ...c, to: c.from + dir * (span - (span - 180) * u) };
}

/** How far Crossbar height moves a bar, in units, from one end of the slider to the other; how far round Openness
    cuts a free end back at Open, and runs it on at Closed (less far: a C closed further reads as an O), in degrees;
    and how far Bowl overlap steps a stem off its bowl, in units, at Apart. */
const CROSS_RUN = 0.6, OPEN_RUN = 35, CLOSE_RUN = 18, APART = 0.14;

/** Cut `c` as the settings shape it before the stroke does: a capital's crossbar moved up or down by Crossbar height
    (`caps`; the small letters' bars stand on the x-height but the e's, which it draws where Crossbar height puts it),
    its free ends run round or cut back by Openness, a stem stepped off its bowl by Bowl overlap. */
function shaped(c: Cut, m: Metrics, caps: boolean): Cut {
  let out = c;
  if (caps && c.part === 'crossbar') out = { ...out, y: out.y + (m.bar - 0.5) * CROSS_RUN };
  if (c.open) {
    const by = (m.ap - 0.5) * 2 * (m.ap > 0.5 ? OPEN_RUN : CLOSE_RUN) * Math.sign(c.to - c.from);
    out = { ...out, ...(c.open.includes('s') && { from: out.from + by }), ...(c.open.includes('e') && { to: out.to - by }) };
  }
  if (c.apart) out = { ...out, x: out.x + c.apart * APART * (1 - m.p.overlap) };
  return out;
}

/** How far cuts `cs` run across, left and right (a full stop's none, from its dot's middle). */
function reach(cs: Cut[]): [number, number] {
  const xs = cs.length ? cs.flatMap(across) : [0];
  return [Math.min(...xs), Math.max(...xs)];
}

/** Letter `ch` as drawn for metrics `m`, and the height its unit is half of (at the stroke's middle, from the
    overshoot below the baseline to the one above): a small letter's the x-height, its stems reaching the ascender
    and the descender, every other character's the capitals'. Null for a character not drawn in arcs. */
function letterOf(ch: string, m: Metrics): { L: ArcLetter; h: number; mark: boolean } | null {
  const low = LOWER[ch] as ((z: Reach) => Drawn) | undefined, mark = MARKS[ch] as ((z: Zones) => Drawn) | undefined;
  if (!low && !mark) return ARC_LETTERS[ch] ? { L: ARC_LETTERS[ch], h: m.cap, mark: false } : null;
  const h = low ? m.xh : m.cap, D = (h + 2 * m.os - m.hT) / 2, mid = h / 2, at = (y: number) => (y - mid) / D;
  // (an ascender shorter than ASC_SOFT is drawn only partly shorter, so an h never comes down to an n)
  const A = at(m.asc - m.hT / 2), reach = { A: A + ASC_GIVE * Math.max(0, ASC_SOFT - A), Z: at(m.desc + m.hT / 2), K: (m.bar - 0.5) * CROSS_RUN, T: m.p.tail };
  if (low) return { L: measured(low(reach)), h, mark: false };
  const X = at(m.xh), B = at(0);
  return { L: measured(mark!({ ...reach, B, X, M: (B + X) / 2, r: m.s * DOT * dotK(m) / 2 / D })), h, mark: true };
}

/** How the letters are spaced from their own ink, as an even-spacing tool spaces type: each side gets the room a
    straight stem gets (Metrics.sb) less SPACE_WHITE of the white its ink leaves inside the band the letters stand in
    (the baseline to the x-height for a small letter, to the capitals for a capital or a figure), the white counted no
    deeper in than SPACE_DEEP of the band. A round side stands closer, an open one (a c's mouth, a T's or an L's)
    closer still, though never nearer its ink in the band than SPACE_LEAST of a stem's room; what reaches out past the
    band (an f's hook, a j's tail) hangs over its side bearing as it does in type. */
const SPACE_WHITE = 0.6, SPACE_DEEP = 0.25, SPACE_LEAST = 0.15;

/** The side bearings, left and right, of a letter whose ink is `paths` (centrelines drawn `s` thick, from 0 to `W`
    across) and `dots` (discs), in a band `h` tall over the baseline, a straight stem's room being `room`. */
function spaced(paths: Cmd[][], dots: { x: number; y: number; r: number }[], s: number, W: number, h: number, room: number): [number, number] {
  // the ink as discs along each centreline
  const ink = [...dots];
  for (const cmds of paths) {
    let cur: P = { x: 0, y: 0 };
    for (const c of cmds) {
      if (c[0] === 'M') cur = { x: c[1], y: c[2] };
      else if (c[0] === 'C') {
        const Q = [cur, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }];
        for (let i = 0; i <= 16; i++) ink.push({ ...cubicAt(Q, i / 16), r: s / 2 });
        cur = Q[3];
      }
    }
  }
  const N = 40, deep = SPACE_DEEP * h, lefts: number[] = [], rights: number[] = [];
  for (let i = 0; i <= N; i++) {
    const y = h * i / N;
    let l = Infinity, r = -Infinity;
    for (const p of ink) {
      const dy = Math.abs(p.y - y);
      if (dy >= p.r) continue;
      const dx = Math.sqrt(p.r * p.r - dy * dy);
      l = Math.min(l, p.x - dx); r = Math.max(r, p.x + dx);
    }
    lefts.push(l); rights.push(r);
  }
  const l0 = Math.min(...lefts), r1 = Math.max(...rights);
  if (!Number.isFinite(l0)) return [room, room];
  const white = (xs: number[], edge: number, dir: number) => xs.reduce((a, x) => a + Math.min(deep, Number.isFinite(x) ? (x - edge) * dir : deep), 0) / xs.length;
  const side = (w: number) => Math.max(SPACE_LEAST * room, room - SPACE_WHITE * w);
  return [side(white(lefts, l0, 1)) - l0, side(white(rights, r1, -1)) - (W - r1)];
}

/** Letter `ch` drawn in arcs with metrics `m`, or null for a character not drawn in arcs (buildFont draws it in
    strokes). */
export function buildArc(ch: string, m: Metrics): Glyph | null {
  const at0 = letterOf(ch, m);
  if (!at0) return null;
  const { L, h, mark } = at0;
  // Length runs an end on round the cut's own circle, its own length (an end's, in the inspector) or the letters' all
  // together, so the stages after it are asked for none: they would run it on straight
  const len = (id: string) => m.p.terminalEnds?.[id] ?? m.p.terminalLength;
  const def: GlyphDef = {
    sb: L.sb,
    meta: { params: ['width', 'weight', 'terminal', 'squareness'] },
    fn: (g, at) => {
      // the O's half-height at the stroke's middle is the unit: it runs from the overshoot below the baseline to the
      // one above the capitals (a small capital's above the x-height), as the stroke letters' O does; Width stretches
      // it, and heavier than a light stroke, GROW of every unit the stroke is heavier than that, so the room between
      // strokes keeps up with them
      const D = (h + 2 * at.os - at.hT) / 2, hs = at.s / 2, mid = h / 2, sx = D * at.ws + GROW * Math.max(0, at.s - S_LIGHT);
      const k = CIRCLE_K + 0.36 * at.sq, paths: Cmd[][] = [], dots: { x: number; y: number; r: number }[] = [];
      // the loops plumped for the stroke, and the body widened by as far as they now reach past the letter's cuts
      // (a cut drawn reaching past the body still does; one the settings moved further out widens it)
      const cuts = L.cuts.map(c => plumped(unlooped(shaped(c, at, h === at.cap), at.s / D, sx / D), at.s / D, sx / D)), [x0, x1] = reach(L.cuts), [y0, y1] = reach(cuts);
      const shift = Math.max(0, x0 - y0), w = L.w + shift + Math.max(0, y1 - x1);
      cuts.forEach((c, si) => {
        const open = Math.abs(c.to - c.from) < 360 - 1e-6, cut = open ? lengthened(c, len(endId(si, 's', false)), len(endId(si, 'e', false))) : c;
        const cmds = cutPath(cut, k, (x, y) => [hs + (x + shift) * sx, mid + y * D]);
        g.path(cmds, open ? { s: 'term', e: 'term', part: c.part } : { part: c.part });
        paths.push(cmds);
      });
      // a dot as big as the stroke letters' full stop, Dot size growing or shrinking it
      for (const d of L.dots ?? []) {
        const x = hs + (d.x + shift) * sx, y = mid + d.y * D, size = at.s * DOT * dotK(at) * (d.k ?? 1);
        g.dot(x, y, size);
        dots.push({ x, y, r: size / 2 });
      }
      const W = w * sx + at.s;
      // a letter spaced from its ink; a mark keeps the room it is drawn with
      if (!mark) { const [l, r] = spaced(paths, dots, at.s, W, h, at.sb); g.sb = [l / at.sb, r / at.sb]; }
      return W;
    }
  };
  return strokesGlyph(def, ch.charCodeAt(0), { ...m, p: { ...m.p, terminalLength: 0.5, terminalEnds: {} } }, ch);
}
