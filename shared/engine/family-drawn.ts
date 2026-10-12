/* Letters drawn in Points in the other members of a font family (shared/family.ts). The settings never shape a drawn
   letter, so a family's heavier, lighter and italic members would draw it just as the design does. Instead each is
   moved from the design it was drawn in: rigged on its skeleton as a free font's letter is (skin.ts), its strokes
   thickened or thinned by the change in the engine's measures between the design and the member, its straight edges
   kept straight and its rounds round (skinEdges), its side bearings changed as the engine's are at that weight, and
   leaned as far as the member leans past the design. A member that weighs and leans as the design does draws them
   exactly as drawn. */
import type { Params } from '../params';
import { SLANT_PIVOT, buildFont, glyphDefOf, type Font, type Glyph } from './font';
import { inkX, mapDrawn } from './free-letters';
import { drawnGlyph } from './glyph';
import { fitOutline, type Drawn, type Node } from './outline';
import { sameMeasures, skinEdges, skinMeasures, skinMove, skinRig, type RigLetters, type SkinMeasures, type SkinRig } from './skin';

/** The design each family member's drawn letters were drawn in, by the member's settings (drawnFrom). */
const drawnIn = new WeakMap<Params, Params>();

/** Make settings `params`, a family member's, draw their drawn letters moved from design `at`, the one they were drawn
    in. Hands `params` back: buildFont finds the design by that very object, so a copy of it draws them unmoved. */
export function drawnFrom(params: Params, at: Params): Params {
  drawnIn.set(params, at);
  return params;
}

/** The design the drawn letters of `params` were drawn in, when `params` are a family member's (drawnFrom). */
export const drawnDesign = (params: Params): Params | undefined => drawnIn.get(params);

/** Each design as built, and the letters its drawn letters' rigs read (RigLetters, made when first rigged): its drawn
    letters, and those it reads its lines and stems off as it draws them (the h's ascender, the p's descender, the x
    against the H for its case, the n's stems and the H's bar). */
const designs = new WeakMap<Params, { font: Font; letters?: RigLetters }>();
function designOf(at: Params) {
  let d = designs.get(at);
  if (!d) { d = { font: buildFont(at) }; designs.set(at, d); }
  return d;
}
function lettersOf(at: Params): RigLetters {
  const d = designOf(at);
  if (!d.letters) {
    const glyphs: Record<string, Drawn> = {};
    for (const ch of 'hpxnH') {
      const g = d.font.glyph(ch);
      if (g) glyphs[ch] = g.drawn ?? { adv: g.adv, contours: fitOutline(g.cmds) };
    }
    d.letters = { cap: d.font.m.cap, xh: d.font.m.xh, glyphs: { ...glyphs, ...at.outlines } };
  }
  return d.letters;
}

/** A drawn letter moved toward the member's measures as a drawing of straight edges and rounds, which it keeps
    (skinEdges): the whole way, or, where its edges moved so far would cross (a bulge run into a hairline, two strokes
    thinned into each other where they part), as much of the way as they don't, in eighths: a little heavier than the
    rest, but the same letter. Null where even an eighth crosses. */
const PART_STEPS = 8;
function edgesToward(rig: SkinRig, from: SkinMeasures, to: SkinMeasures): Node[][] | null {
  const toward = (t: number) => Object.fromEntries(Object.entries(from).map(([k, v]) => [k, v + (to[k as keyof SkinMeasures] - v) * t])) as unknown as SkinMeasures;
  for (let i = PART_STEPS; i > 0; i--) {
    const r = skinEdges(rig, from, i === PART_STEPS ? to : toward(i / PART_STEPS));
    if (r) return r;
  }
  return null;
}

/** Letter `ch`, drawn as `drawn` in design `at`, in `font`, a member of its family. */
export function movedDrawn(ch: string, drawn: Drawn, font: Font, at: Params): Glyph {
  const m0 = designOf(at).font.letter(ch).m, m1 = font.letter(ch).m, from = skinMeasures(m0), to = skinMeasures(m1);
  // (as a drawing of straight edges and rounds, or, where even an eighth of the way crosses, as a free font's letter)
  const rig = sameMeasures(from, to) ? null : skinRig(lettersOf(at), ch), moved = rig && (edgesToward(rig, from, to) ?? skinMove(rig, from, to));
  const lean = m1.slant - m0.slant;
  let out: Drawn = drawn;
  if (rig && moved && moved !== rig.contours) {
    // spaced as the engine spaces its letters at this weight: each side bearing as drawn, wider or narrower as far as a
    // stem's is (Metrics.sb) by the letter's own share of it (its glyph's side-bearing factors), round the moved ink
    const [a0, a1] = inkX(drawn), [x0, x1] = inkX({ adv: 0, contours: moved }), f = glyphDefOf(ch)?.sb ?? [1, 1], d = m1.sb - m0.sb;
    const lsb = a0 + d * f[0], rsb = drawn.adv - a1 + d * f[1];
    out = mapDrawn({ adv: 0, contours: moved }, lsb + x1 - x0 + rsb, (x, y) => [x + lsb - x0, y]);
  }
  // (leaned about the height the engine's letters lean about, as placeGlyph in glyph.ts leans them)
  if (lean) out = mapDrawn(out, out.adv, (x, y) => [x + lean * (y - m1.xh * SLANT_PIVOT), y]);
  return drawnGlyph(ch, out);
}
