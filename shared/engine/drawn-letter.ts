/* Letters drawn in Points in a design the engine builds (block and arc letters). A drawing keeps the settings it was
   drawn at (Drawn.at) and keeps its shape whatever the settings are now: nothing reads a skeleton off it or guesses
   at its strokes, so Weight, Width and the rest leave it as drawn. It only leans as far as the slant has moved since
   it was drawn (a plain shear, so a family's italics lean it too), and the effects it was drawn without (the slice,
   the fill, rough edges) run on it as on the rest of the font (withEffects). A source style's drawings are the source
   interpreter's (shared/source/). */
import { DEFAULTS, type DrawnAt } from '../params';
import { SLANT_PIVOT, metrics, resolve, type Font, type Glyph } from './font';
import { drawnEffects, drawnGlyph, type DrawnFx } from './glyph';
import type { Drawn, Node } from './outline';

/** Letter `ch`, drawn in Points as `drawn`, in `font`. */
export function drawnLetter(ch: string, drawn: Drawn, font: Font): Glyph {
  return withEffects(ch, drawn, drawnGlyph(ch, leaned(ch, drawn, font)), font);
}

/** The drawing leaned as far as the letter's slant has moved from the one it was drawn at, about the height the
    engine's letters lean about (placeGlyph in glyph.ts). A drawing that keeps no settings stays as it is. */
function leaned(ch: string, drawn: Drawn, font: Font): Drawn {
  if (!drawn.at) return drawn;
  const m = font.letter(ch).m, lean = m.slant - metrics(resolve({ ...DEFAULTS, ...drawn.at, glyphs: {}, outlines: {} })).slant;
  if (Math.abs(lean) < 1e-9) return drawn;
  const f = (x: number, y: number) => x + lean * (y - m.xh * SLANT_PIVOT);
  return { ...drawn, contours: drawn.contours.map(c => c.map(n => {
    const out: Node = { ...n, x: f(n.x, n.y) };
    if (n.ix !== undefined) out.ix = f(n.ix, n.iy!);
    if (n.ox !== undefined) out.ox = f(n.ox, n.oy!);
    return out;
  })) };
}

/** Drawn letter `g` with the effects (the slice, the fill, rough edges) its drawing was drawn without run on it, as
    `font` sets them: one turned on since reaches it as it reaches the other letters. One it was drawn under is in its
    points already (Points shows a letter as its effects draw it, and an edit there keeps them), so it stays as drawn
    whatever that effect is set to now. A drawing that keeps no settings takes none. A drawing has no middle lines, so
    an Inline fill leaves it solid. */
function withEffects(ch: string, drawn: Drawn, g: Glyph, font: Font): Glyph {
  const at = drawn.at;
  if (!at) return g;
  const was = <K extends keyof DrawnAt>(k: K) => (k in at ? at[k] : DEFAULTS[k]);
  const run: DrawnFx = { slice: !(was('slice')! > 0), fill: was('fill') === 'solid', rough: !(was('rough')! > 0) };
  return drawnEffects(g, font.letter(ch).m, run, () => []);
}
