/* A font family: the design drawn again at other weights and upright or italic, each saved as its
   own font file under one family name, so font menus list them together (Thin to Black, each with
   its italic). The design itself is one of them, at the weight its stems read as. The weights step by
   how thick their stems are drawn, so a design whose Verticals already draw them heavy still steps
   evenly to its Thin. */
import { drawnFrom } from './engine';
import { metrics, resolve } from './engine/font';
import { DEFAULTS, slantDeg, type GlyphParams, type Params } from './params';

/** The weights a family can have, lightest first, with the OpenType weight class each installs as, and where each
    sits on the Weight slider when it isn't the design's own (`at`): the design's default weight (DEFAULTS.weight,
    0.4) is Regular, and the step to the next is about as noticeable all the way along. */
export const WEIGHTS = [
  { id: 'thin', name: 'Thin', cls: 100, at: 0.03 },
  { id: 'extralight', name: 'ExtraLight', cls: 200, at: 0.12 },
  { id: 'light', name: 'Light', cls: 300, at: 0.25 },
  { id: 'regular', name: 'Regular', cls: 400, at: 0.4 },
  { id: 'medium', name: 'Medium', cls: 500, at: 0.5 },
  { id: 'semibold', name: 'SemiBold', cls: 600, at: 0.6 },
  { id: 'bold', name: 'Bold', cls: 700, at: 0.72 },
  { id: 'extrabold', name: 'ExtraBold', cls: 800, at: 0.84 },
  { id: 'black', name: 'Black', cls: 900, at: 0.95 }
] as const;
export type WeightId = (typeof WEIGHTS)[number]['id'];
export const isWeightId = (v: unknown): v is WeightId => WEIGHTS.some(w => w.id === v);

/** The lightest and heaviest a family reaches: light enough to read as hairlines, heavy enough to
    fill in, short of the very ends of the slider where counters close. */
const LIGHTEST = WEIGHTS[0].at, HEAVIEST = WEIGHTS[WEIGHTS.length - 1].at;

/** The weight a design of Weight `weight` reads as, its Verticals as drawn: the nearest of the weights' places (`at`). */
export function weightIdOf(weight: number): WeightId {
  let best = 0;
  WEIGHTS.forEach((w, i) => { if (Math.abs(w.at - weight) < Math.abs(WEIGHTS[best].at - weight)) best = i; });
  return WEIGHTS[best].id;
}

/** How thick a design's stems are drawn (Metrics.s, in font units), its Verticals counted: what a family steps by. */
const stemOf = (p: Params) => metrics(resolve(p)).s;
/** How thick Weight `w` draws stems with Verticals as drawn (DEFAULTS'): where the weights' places sit in stems. */
const plainStem = (w: number) => stemOf({ ...DEFAULTS, weight: w });

/** Where between lo and hi the rising f reaches `want` (at lo or hi, where it stays short of it there). */
function solve(f: (v: number) => number, want: number, lo: number, hi: number) {
  if (f(lo) >= want) return lo;
  if (f(hi) <= want) return hi;
  for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (f(mid) < want) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** The weight a design reads as: the nearest of the weights' places to where on the Weight slider its stems sit (the
    Weight that draws stems as thick with Verticals as drawn), which is its Weight setting while Verticals are as
    drawn. A design whose Verticals draw its stems heavier reads heavier: Weight 65 at Verticals 97 draws stems past
    a Black's, and so is the family's Black. */
export const anchorOf = (p: Params): WeightId => weightIdOf(solve(plainStem, stemOf(p), 0, 1));

/** How many times thicker than the design's (`stem` thick) the weight `id` draws its stems, the design being the
    weight `anchor`. The lighter weights are spread evenly, step by step in the same ratio, from the stems of the
    lightest a family reaches up to the design's, and the heavier ones from the design's up to the heaviest's, so the
    design is exactly one of them and no two steps feel far apart. */
export function stemRatio(stem: number, anchor: WeightId, id: WeightId): number {
  const a = WEIGHTS.findIndex(w => w.id === anchor), i = WEIGHTS.findIndex(w => w.id === id);
  if (i === a) return 1;
  const end = plainStem(i < a ? LIGHTEST : HEAVIEST);
  // a design heavier than Black or lighter than Thin: spread from it, not back past it
  const t = i < a ? (a - i) / a : (i - a) / (WEIGHTS.length - 1 - a);
  const r = Math.pow(end / stem, t);
  return i < a ? Math.min(1, r) : Math.max(1, r);
}

/** Design `p` with its stems `stem` thick: its Weight moved, and past either end of the slider its Verticals too (a
    design whose Verticals draw heavy stems reaches a Thin's only with lighter ones), as far as the engine draws
    stems at all. */
function withStem(p: Params, stem: number): Pick<Params, 'weight' | 'vWeight'> {
  const at = (weight: number, vWeight = p.vWeight) => stemOf({ ...p, weight, vWeight });
  if (stem < at(0)) return { weight: 0, vWeight: solve(v => at(0, v), stem, 0, p.vWeight) };
  if (stem > at(1)) return { weight: 1, vWeight: solve(v => at(1, v), stem, p.vWeight, 1) };
  return { weight: solve(w => at(w), stem, 0, 1), vWeight: p.vWeight };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The slant a family's italics take when the design is upright: about 11° (see slantDeg). */
const ITALIC_SLANT = 0.55;
/** A design slanted at least this much (1°) is an italic already, and its uprights stand it up. */
export const SLANTED = 0.05;

export interface FamilyMember {
  weight: WeightId; italic: boolean;
  /** the style name it installs under, "Bold Italic" */ style: string;
  /** the OpenType weight class */ cls: number;
  /** the slant it is drawn at, in degrees, leaning right */ angle: number;
  params: Params;
}

/** A member's style name: '<Weight>', '<Weight> Italic', or 'Italic' for the Regular italic. buildOTF
    (server/export.ts) reads the weight and italic back out of it for the font's names. */
const styleName = (weight: WeightId, italic: boolean) => {
  const w = WEIGHTS.find(x => x.id === weight)!.name;
  return italic ? (w === 'Regular' ? 'Italic' : `${w} Italic`) : w;
};

/** Every style a family can hold, by the name it installs under: the uprights lightest first, then the italics. */
export const FAMILY_STYLES = [false, true].flatMap(italic => WEIGHTS.map(w => ({ weight: w.id, italic, style: styleName(w.id, italic) })));

/** The style a design is by itself: its weight, italic when it leans already. */
export const ownStyle = (params: Params, anchor: WeightId = anchorOf(params)) =>
  FAMILY_STYLES.find(f => f.weight === anchor && f.italic === params.slant >= SLANTED)!;

/** One member of the family: the design at the weight `id` (its stems as stemRatio has them, by its Weight, and past
    either end of it its Verticals) and upright or italic. A letter with its own weight or slant keeps how it differs
    from the rest. Letters drawn by hand in Points mode, which
    no setting shapes, are moved from the design instead: their strokes thickened or thinned and the
    letters leaned as the member's are (family-drawn.ts in the engine, which finds the design by the
    member's params object). A design written in a free font follows the weight and slant to the
    family's heavier or lighter fonts and its italic, as the editor does (see freeLetters in the engine). */
export function familyMember(params: Params, anchor: WeightId, weight: WeightId, italic: boolean): FamilyMember {
  const own = weight === anchor, ratio = own ? 1 : stemRatio(stemOf(params), anchor, weight);
  const weighs = own ? {} : withStem(params, stemOf(params) * ratio);
  // (a letter's own weight, as far as its own stems step: within the slider, its Verticals the member's)
  const reweigh = (g: GlyphParams) => withStem({ ...params, ...weighs, ...g, glyphs: {} }, stemOf({ ...params, ...g, glyphs: {} }) * ratio).weight;
  const ownSlant = params.slant >= SLANTED;
  const slant = italic ? (ownSlant ? params.slant : ITALIC_SLANT) : 0;
  const reslant = (v: number) => clamp01(v + slant - params.slant);
  const glyphs: Record<string, GlyphParams> = {};
  for (const [ch, g] of Object.entries(params.glyphs)) {
    glyphs[ch] = { ...g, ...(g.weight !== undefined && !own && { weight: reweigh(g) }), ...(g.slant !== undefined && { slant: reslant(g.slant) }) };
  }
  const cls = WEIGHTS.find(w => w.id === weight)!.cls;
  return {
    weight, italic, style: styleName(weight, italic), cls,
    angle: slantDeg(slant),
    params: drawnFrom({ ...params, ...weighs, slant, glyphs }, params)
  };
}

/** A style of the family: a weight, upright or italic. */
export interface FamilyStyle { weight: WeightId; italic: boolean }
/** The members of a family to build, any styles picked, with the design named `anchor`. */
export interface FamilyRequest { anchor: WeightId; styles: FamilyStyle[] }
/** One member on its own, as a single font file of the family: the same font it is in the family's .zip. */
export interface MemberRequest extends FamilyStyle { anchor: WeightId }

/** Every member asked for, once each, lightest first, each upright before its italic. */
export function familyMembers(params: Params, req: FamilyRequest): FamilyMember[] {
  const out: FamilyMember[] = [];
  for (const w of WEIGHTS) {
    for (const italic of [false, true]) {
      if (req.styles.some(s => s.weight === w.id && s.italic === italic)) out.push(familyMember(params, req.anchor, w.id, italic));
    }
  }
  return out;
}
