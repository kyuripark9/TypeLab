/* Letters drawn in Points as the settings move. A drawing keeps the settings it was drawn at (Drawn.at), and stands as
   drawn while they are the design's; moved away from them, the settings move it as they move a free font's letter:
   rigged on its skeleton (skin.ts), its strokes thickened or thinned by the change in the engine's measures (weight,
   contrast, width, the heights, crossbar, serif length, inner space, dots, pinch, ink traps), its straight edges kept
   straight and its rounds round (skinEdges), its side bearings changed as the engine's are, and leaned as far as the
   slant moves. Its shape stays its own: no setting that reshapes a letter (its curves, corners, ends, forms) reaches it.
   The effects it was drawn without (the slice, the fill, rough edges) run on it as on the rest (withEffects).
   A font family's other members (shared/family.ts) move a design's drawings the same way, from the design they were
   drawn in (drawnFrom), or from the settings a drawing was drawn at where those aren't the design's. */
import { DEFAULTS, DRAWN_AT_KEYS, type DrawnAt, type Params } from '../params';
import { SLANT_PIVOT, buildFont, glyphDefOf, type Font, type Glyph } from './font';
import { freeFont } from './free';
import { inkX, inlineSkeleton, mapDrawn } from './free-letters';
import { drawnEffects, drawnGlyph, type DrawnFx } from './glyph';
import { clamp, signedArea, toPolys } from './geom';
import { drawnCmds, fitOutline, type Drawn, type Node } from './outline';
import { sameMeasures, skinEdges, skinMeasures, skinMove, skinRig, type RigLetters, type SkinMeasures, type SkinRig } from './skin';

/** The design each family member's drawn letters were drawn in, by the member's settings (drawnFrom). */
const drawnIn = new WeakMap<Params, Params>();

/** Make settings `params`, a family member's, draw their drawn letters moved from design `at`, the one they were drawn
    in. Hands `params` back: buildFont finds the design by that very object. */
export function drawnFrom(params: Params, at: Params): Params {
  drawnIn.set(params, at);
  return params;
}

/** The design the drawn letters of `params` were drawn in, when `params` are a family member's (drawnFrom). */
export const drawnDesign = (params: Params): Params | undefined => drawnIn.get(params);

/** Letter `ch`, drawn in Points as `drawn`, in `font`: as drawn while the letter's settings are those it was drawn at,
    else moved from them. In a family member, whose design is `design` (drawnFrom), moved from the design as it
    stands there, or, where the drawing was drawn at other settings than the design's, from those. A drawing that keeps
    no settings is drawn as it stands (in a member, moved from the design). */
export function drawnLetter(ch: string, drawn: Drawn, font: Font, design?: Params): Glyph {
  const own = (p: Params) => (drawn.at && !drawnAtNow(drawn.at, p, ch) ? atDesign(ch, drawn) : undefined);
  const from = design ? own(design) ?? design : own(font.params);
  return withEffects(ch, drawn, from ? movedDrawn(ch, drawn, font, from) : drawnGlyph(ch, drawn), font);
}

/** Drawn letter `g` with the effects (the slice, the fill, rough edges) its drawing was drawn without run on it, as
    `font` sets them: one turned on since reaches it as it reaches the other letters. One it was drawn under is in its
    points already (Points shows a letter as its effects draw it, and an edit there keeps them), so it stays as drawn
    whatever that effect is set to now. A drawing that keeps no settings takes none. */
function withEffects(ch: string, drawn: Drawn, g: Glyph, font: Font): Glyph {
  const at = drawn.at;
  if (!at) return g;
  const was = <K extends keyof DrawnAt>(k: K) => (k in at ? at[k] : DEFAULTS[k]);
  const run: DrawnFx = { slice: !(was('slice')! > 0), fill: was('fill') === 'solid', rough: !(was('rough')! > 0) };
  return drawnEffects(g, font.letter(ch).m, run, () => inlineSkeleton(g.drawn!.contours));
}

/** Whether letter `ch` of `p` is drawn at the settings `at` (those it leaves out at their defaults, as a setting
    added since a drawing was made starts at the default that draws as before). */
function drawnAtNow(at: DrawnAt, p: Params, ch: string): boolean {
  const own = p.glyphs?.[ch], lp: Params = own ? { ...p, ...own } : p;
  for (const k of DRAWN_AT_KEYS) {
    const a = k in at ? at[k] : DEFAULTS[k], b = lp[k] ?? DEFAULTS[k];
    if (a !== b && (typeof a !== 'object' || JSON.stringify(a) !== JSON.stringify(b))) return false;
  }
  return true;
}

/** The settings a drawing was drawn at as a design of its own, with the drawing its one drawn letter: made once for
    each drawing, so it is rigged once (lettersOf, skinRig). */
const atDesigns = new WeakMap<Drawn, { ch: string; p: Params }>();
function atDesign(ch: string, drawn: Drawn): Params {
  let d = atDesigns.get(drawn);
  if (!d || d.ch !== ch) { d = { ch, p: { ...DEFAULTS, ...drawn.at, glyphs: {}, outlines: { [ch]: drawn } } }; atDesigns.set(drawn, d); }
  return d.p;
}

/** Each design as built, and the letters its drawn letters' rigs read (RigLetters, made when first rigged): its drawn
    letters, and those it reads its lines and stems off as it draws them (the h's ascender, the p's descender, the x
    against the H for its case, the n's stems and the H's bar). */
const designs = new WeakMap<Params, { font: Font; letters?: RigLetters }>();
function designOf(at: Params) {
  let d = designs.get(at);
  // (one built before the free font it is written in had come is built again once it has, with its letters)
  if (!d || d.font.freeMissing.some(id => freeFont(id))) { d = { font: buildFont(at) }; designs.set(at, d); }
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

/** A drawn letter moved toward the new measures as a drawing of straight edges and rounds, which it keeps
    (skinEdges): the whole way, or, where its edges moved so far would cross (a bulge run into a hairline, two strokes
    thinned into each other where they part), as much of the way as they don't, in eighths: a little heavier than the
    rest, but the same letter. With how far of the way it went; null where even an eighth crosses. */
const PART_STEPS = 8;
function edgesToward(rig: SkinRig, from: SkinMeasures, to: SkinMeasures): { cs: Node[][]; went: number } | null {
  const toward = (t: number) => Object.fromEntries(Object.entries(from).map(([k, v]) => [k, v + (to[k as keyof SkinMeasures] - v) * t])) as unknown as SkinMeasures;
  for (let i = PART_STEPS; i > 0; i--) {
    const cs = skinEdges(rig, from, i === PART_STEPS ? to : toward(i / PART_STEPS));
    if (cs) return { cs, went: i / PART_STEPS };
  }
  return null;
}

/** The rigged letter moved toward `to` the way that keeps it most as drawn and goes furthest: as a drawing of straight
    edges and rounds (edgesToward: a letter built of bars and corners, Ink Trap Display's, which keeps them clean), or
    as a free font's letter is moved (skinMove: one traced off a font's curves, whose long curves, bent as edges,
    ripple, and which edges take only part of the way). Each is weighed by how much further its outline turns, all
    told, than the drawing's (ripples, and a stroke pinched to a hairline, turn far more), and the edges by SHORT_OF
    of the way they fall short too: in eighths, or in ink, against the ink the free font's way adds or takes away (edges
    held back where a stroke runs into another can leave a letter as heavy as drawn); as a free font's letter where even
    an eighth of the way as edges crosses. */
const SHORT_OF = 0.5;
function keptMove(rig: SkinRig, from: SkinMeasures, to: SkinMeasures): Node[][] {
  const edges = edgesToward(rig, from, to), moved = skinMove(rig, from, to);
  if (!edges) return moved;
  const d = shapeOf(rig.contours), e = shapeOf(edges.cs), m = shapeOf(moved), off = (s: Shape) => Math.abs(s.turn / d.turn - 1);
  const ink = m.ink - d.ink, went = Math.min(edges.went, Math.abs(ink) > d.ink * 0.02 ? Math.max(0, (e.ink - d.ink) / ink) : 1);
  return off(e) + SHORT_OF * (1 - Math.min(1, went)) <= off(m) ? edges.cs : moved;
}
/** How far an outline turns, all told (every turn along it, either way, in radians), and how much ink it holds (kept by
    the outline, as a rig's moves are kept). */
interface Shape { turn: number; ink: number }
const shapes = new WeakMap<Node[][], Shape>();
function shapeOf(cs: Node[][]): Shape {
  let s = shapes.get(cs);
  if (s) return s;
  let turn = 0, ink = 0;
  for (const pl of toPolys(drawnCmds(cs))) {
    ink += signedArea(pl);
    for (let i = 0, n = pl.length; i < n; i++) {
      const a = pl[(i + n - 1) % n], b = pl[i], c = pl[(i + 1) % n];
      let t = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
      while (t > Math.PI) t -= 2 * Math.PI;
      while (t < -Math.PI) t += 2 * Math.PI;
      turn += Math.abs(t);
    }
  }
  s = { turn, ink: Math.abs(ink) };
  shapes.set(cs, s);
  return s;
}

/** The letters whose stems a drawing's strokes follow in a design written in a free font, the first of them neither
    drawn nor with settings of its own, each with the height its stem is read at standing alone (the I's half way up,
    the H's below its bar, the n's and h's below their arches). */
const STEM_LETTERS: [string, (f: Font) => number][] = [
  ['I', f => f.m.cap * 0.5], ['l', f => f.m.xh * 0.5], ['H', f => f.m.cap * 0.25], ['n', f => f.m.xh * 0.3], ['h', f => f.m.xh * 0.3]
];
/** The width of the first stretch of ink across letter `g` at height y, overlapping pieces as one. */
function firstRun(g: Glyph, y: number): number | null {
  const hits: { x: number; d: number }[] = [];
  for (const pl of toPolys(g.cmds)) for (let i = 0; i < pl.length; i++) {
    const a = pl[i], b = pl[(i + 1) % pl.length];
    if ((a.y <= y) !== (b.y <= y)) hits.push({ x: a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y), d: b.y > a.y ? 1 : -1 });
  }
  hits.sort((p, q) => p.x - q.x);
  let w = 0, from = 0;
  for (const h of hits) { const was = w; w += h.d; if (!was && w) from = h.x; else if (was && !w) return h.x - from; }
  return null;
}
/** How a free font's own letters take the change from design `d` (settings `at`) to `font`, for a drawing in it to
    take it as they do: the share of the engine's change in its stroke measures that thickens or thins the drawing's
    stems as many times as the font's (a rig's strokes scale with the measures, skin.ts), and how much each side
    bearing grows or shrinks. The font's letters follow Weight by their own share of their stem (penW in
    free-letters.ts) and its family's heavier and lighter files, far less than the engine's stems move: moved by the
    engine's measures alone, a capital drawn in Points at a light Old Style came out two and three times as heavy as
    its neighbours in the family's Regular and Bold. None where neither is written in a free font, or no letter is
    the font's own to read. */
function freeMove(d: Font, at: Params, font: Font, from: SkinMeasures, to: SkinMeasures): { k: number; sb: number } | null {
  if (!d.free && !font.free) return null;
  const ds = to.s - from.s;
  if (Math.abs(ds) < 0.05) return null;
  const own = (f: Font, ch: string) => !f.params.outlines?.[ch] && !f.params.glyphs?.[ch];
  for (const [ch, y] of STEM_LETTERS) {
    if (!own(d, ch) || !own(font, ch) || at.outlines?.[ch]) continue;
    const g0 = d.glyph(ch), g1 = font.glyph(ch);
    const s0 = g0 && firstRun(g0, y(d)), s1 = g1 && firstRun(g1, y(font));
    if (g0 && g1 && s0 && s1) return { k: clamp((s1 / s0 - 1) * from.s / ds, 0, 2), sb: (g1.lsb - g0.lsb + g1.rsb - g0.rsb) / 2 };
  }
  return null;
}

/** Letter `ch`, drawn as `drawn` in design `at`, in `font`, whose settings are moved from the design's. */
function movedDrawn(ch: string, drawn: Drawn, font: Font, at: Params): Glyph {
  const d0 = designOf(at).font, m0 = d0.letter(ch).m, m1 = font.letter(ch).m, from = skinMeasures(m0), to = skinMeasures(m1);
  // (its strokes as many times thicker or thinner as the font's own letters', in a design written in a free font)
  const fm = freeMove(d0, at, font, from, to);
  if (fm) for (const key of ['s', 'sw', 'v', 'hT'] as const) to[key] = from[key] + (to[key] - from[key]) * fm.k;
  const rig = sameMeasures(from, to) ? null : skinRig(lettersOf(at), ch), moved = rig && keptMove(rig, from, to);
  const lean = m1.slant - m0.slant;
  let out: Drawn = drawn;
  if (rig && moved && moved !== rig.contours) {
    // spaced as the engine spaces its letters at this weight: each side bearing as drawn, wider or narrower as far as a
    // stem's is (Metrics.sb) by the letter's own share of it (its glyph's side-bearing factors), round the moved ink;
    // in a free font, as far as the font's own letters' (freeMove)
    const [a0, a1] = inkX(drawn), [x0, x1] = inkX({ adv: 0, contours: moved }), f = glyphDefOf(ch)?.sb ?? [1, 1], d = fm ? fm.sb : m1.sb - m0.sb;
    const lsb = a0 + d * f[0], rsb = drawn.adv - a1 + d * f[1];
    out = mapDrawn({ adv: 0, contours: moved }, lsb + x1 - x0 + rsb, (x, y) => [x + lsb - x0, y]);
  }
  // (leaned about the height the engine's letters lean about, as placeGlyph in glyph.ts leans them)
  if (lean) out = mapDrawn(out, out.adv, (x, y) => [x + lean * (y - m1.xh * SLANT_PIVOT), y]);
  return drawnGlyph(ch, out);
}
