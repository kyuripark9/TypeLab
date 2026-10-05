/* A font family: the design drawn again at other weights and upright or italic, each saved as its
   own font file under one family name, so font menus list them together (Thin to Black, each with
   its italic). The design itself is one of them, at the weight it is named as. */
import { weightScale, type GlyphParams, type Params } from './params';

/** The weights a family can have, lightest first, with the OpenType weight class each installs as. */
export const WEIGHTS = [
  { id: 'thin', name: 'Thin', cls: 100 },
  { id: 'extralight', name: 'ExtraLight', cls: 200 },
  { id: 'light', name: 'Light', cls: 300 },
  { id: 'regular', name: 'Regular', cls: 400 },
  { id: 'medium', name: 'Medium', cls: 500 },
  { id: 'semibold', name: 'SemiBold', cls: 600 },
  { id: 'bold', name: 'Bold', cls: 700 },
  { id: 'extrabold', name: 'ExtraBold', cls: 800 },
  { id: 'black', name: 'Black', cls: 900 }
] as const;
export type WeightId = (typeof WEIGHTS)[number]['id'];
export const isWeightId = (v: unknown): v is WeightId => WEIGHTS.some(w => w.id === v);

/** Where each weight sits on the Weight slider when it isn't the design's own: the design's default
    weight is Regular, and the step to the next is about as noticeable all the way along. */
const TYPICAL = [0.03, 0.12, 0.25, 0.4, 0.5, 0.6, 0.72, 0.84, 0.95];
/** The lightest and heaviest a family reaches: light enough to read as hairlines, heavy enough to
    fill in, short of the very ends of the slider where counters close. */
const LIGHTEST = TYPICAL[0], HEAVIEST = TYPICAL[TYPICAL.length - 1];

/** The weight a design reads as, by its Weight setting: the nearest of the typical ones. */
export function weightIdOf(weight: number): WeightId {
  let best = 0;
  TYPICAL.forEach((t, i) => { if (Math.abs(t - weight) < Math.abs(TYPICAL[best] - weight)) best = i; });
  return WEIGHTS[best].id;
}

/** The Weight setting that draws strokes `s` times as heavy as at 0.5 (weightScale undone). */
const unscale = (s: number) => (s < 1 ? (s - 0.25) / 1.5 : 0.5 + (s - 1) / 3);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** How many times heavier than the design the weight `id` draws its strokes, when the design is
    named `anchor`. The lighter weights are spread evenly, step by step in the same ratio, from the
    lightest a family reaches up to the design, and the heavier ones from the design up to the
    heaviest, so the design is exactly one of them and no two steps feel far apart. */
export function weightRatio(designWeight: number, anchor: WeightId, id: WeightId): number {
  const a = WEIGHTS.findIndex(w => w.id === anchor), i = WEIGHTS.findIndex(w => w.id === id);
  const s0 = weightScale(designWeight);
  if (i === a) return 1;
  const end = weightScale(i < a ? LIGHTEST : HEAVIEST);
  // a design heavier than Black or lighter than Thin: spread from it, not back past it
  const t = i < a ? (a - i) / a : (i - a) / (WEIGHTS.length - 1 - a);
  const s = s0 * Math.pow(end / s0, t);
  return i < a ? Math.min(1, s / s0) : Math.max(1, s / s0);
}

/** The slant a family's italics take when the design is upright: about 11°. */
export const ITALIC_SLANT = 0.55;
/** A design slanted at least this much is an italic already, and its uprights stand it up. */
export const SLANTED = 0.05;

export interface FamilyMember {
  weight: WeightId; italic: boolean;
  /** the style name it installs under, "Bold Italic" */ style: string;
  /** the OpenType weight class */ cls: number;
  /** the slant it is drawn at, in degrees, leaning right */ angle: number;
  params: Params;
}

export const styleName = (weight: WeightId, italic: boolean) => {
  const w = WEIGHTS.find(x => x.id === weight)!.name;
  return italic ? (w === 'Regular' ? 'Italic' : `${w} Italic`) : w;
};

/** One member of the family: the design at the weight `id` and upright or italic. A letter with its
    own weight or slant keeps how it differs from the rest. Letters drawn by hand in Points mode
    keep their outlines in every member, as they keep them whatever the settings. */
export function familyMember(params: Params, anchor: WeightId, weight: WeightId, italic: boolean): FamilyMember {
  const ratio = weightRatio(params.weight, anchor, weight);
  const reweigh = (v: number) => clamp01(unscale(weightScale(v) * ratio));
  const ownSlant = params.slant >= SLANTED;
  const slant = italic ? (ownSlant ? params.slant : ITALIC_SLANT) : 0;
  const reslant = (v: number) => clamp01(v + slant - params.slant);
  const glyphs: Record<string, GlyphParams> = {};
  for (const [ch, g] of Object.entries(params.glyphs)) {
    glyphs[ch] = { ...g, ...(g.weight !== undefined && { weight: reweigh(g.weight) }), ...(g.slant !== undefined && { slant: reslant(g.slant) }) };
  }
  return {
    weight, italic, style: styleName(weight, italic),
    cls: WEIGHTS.find(w => w.id === weight)!.cls,
    angle: slant * 20,
    params: { ...params, weight: reweigh(params.weight), slant, glyphs }
  };
}

export interface FamilyRequest { anchor: WeightId; weights: WeightId[]; upright: boolean; italic: boolean }

/** Every member asked for, lightest first, each upright before its italic. */
export function familyMembers(params: Params, req: FamilyRequest): FamilyMember[] {
  const out: FamilyMember[] = [];
  for (const w of WEIGHTS) {
    if (!req.weights.includes(w.id)) continue;
    if (req.upright) out.push(familyMember(params, req.anchor, w.id, false));
    if (req.italic) out.push(familyMember(params, req.anchor, w.id, true));
  }
  return out;
}

/** The most members a family may have: every weight, upright and italic. */
export const FAMILY_MAX = WEIGHTS.length * 2;
