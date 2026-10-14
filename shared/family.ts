/* A font family: the design drawn again at other weights and upright or italic, each saved as its
   own font file under one family name, so font menus list them together (Thin to Black, each with
   its italic). The design itself is one of them, at the weight its stems read as. The weights step by
   how thick their stems are drawn, so a design whose Verticals already draw them heavy still steps
   evenly to its Thin; a lighter weight of a design with much contrast keeps its hairlines as thick as
   the design's, with less contrast, as a Didone family's do. */
import { buildFont, drawnFrom, freeFont, type Cmd } from './engine';
import { metrics, resolve } from './engine/font';
import { cmdsBox, toPolys } from './engine/geom';
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
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* Hairlines. A family's weights step by their stems, and a design's bars and hairlines stepped with them, so a
   Didone's lighter weights drew hairlines half as thick as its own, or less, and they vanished at text sizes (an H read
   as II). A lighter weight keeps its hairlines as thick as the design's instead, its contrast lowered as far as that
   takes, as a Didone family's lighter weights have less contrast; a design with less contrast keeps less of them, and
   a sans or a book face, whose bars are strokes nearly as heavy as its stems, thins them with its stems as before. */

/** How thick a lighter weight's hairlines may be at most, as a share of its own stems: the lightest weights, whose
    stems are as thin as a heavy design's hairlines, keep a little contrast rather than turning it round. */
const HAIR_MOST = 0.85;
/** The design's hairline, as a share of its stems, up to which a lighter weight keeps it whole (a Didone's, a fat
    face's), and from which it thins it as much as its stems, as a sans or a book face does; between, a little less. */
const HAIR_KEEP: [number, number] = [0.2, 0.45];

/** How thick a design draws its hairline (its bars) and its stems, read off its letters or (`read` false) by its measures. */
interface Look { hair: number; stem: number; read: boolean }

/** The ink's runs down the column at `at` (or, `!down`, across the row), as [start, end] pairs, its overlapping pieces as one. */
function inkRuns(cmds: Cmd[], at: number, down: boolean): [number, number][] {
  const hits: { t: number; d: number }[] = [];
  for (const poly of toPolys(cmds)) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const [pa, pb, qa, qb] = down ? [a.x, b.x, a.y, b.y] : [a.y, b.y, a.x, b.x];
    if ((pa <= at) !== (pb <= at)) hits.push({ t: qa + (qb - qa) * (at - pa) / (pb - pa), d: pb > pa ? 1 : -1 });
  }
  hits.sort((p, q) => p.t - q.t);
  const runs: [number, number][] = [];
  let w = 0, from = 0;
  for (const h of hits) {
    const was = w;
    w += h.d;
    if (!was && w) from = h.t;
    else if (was && !w) runs.push([from, h.t]);
  }
  return runs;
}

/** A design's letters as they are drawn, without its letters' own settings or drawings, and without what cuts or
    outlines them (as where its free font was picked), for reading its hairline and stems off them. */
function plainLetters(p: Params): Params {
  const picked = p.freeAt as Partial<Params>;
  return { ...p, glyphs: {}, outlines: {}, fill: picked.fill ?? DEFAULTS.fill, slice: picked.slice ?? DEFAULTS.slice, stencil: picked.stencil ?? DEFAULTS.stencil,
    barGap: picked.barGap ?? DEFAULTS.barGap, wobble: picked.wobble ?? DEFAULTS.wobble, rotation: picked.rotation ?? DEFAULTS.rotation, rough: DEFAULTS.rough };
}

/** How thick a design's letters draw its hairline: its H's crossbar, down the middle of the letter (the
    one run of ink across the middle of its height there). null where it has none to read. */
function barOf(p: Params): number | null {
  const H = buildFont(plainLetters(p)).glyph('H'), b = H && cmdsBox(H.cmds);
  if (!H || !b) return null;
  const h = b.y1 - b.y0, runs = inkRuns(H.cmds, (b.x0 + b.x1) / 2, true).filter(([lo, hi]) => lo > b.y0 + h * 0.2 && hi < b.y1 - h * 0.2);
  return runs.length === 1 ? runs[0][1] - runs[0][0] : null;
}

/** How thick a design's letters draw its stems: the thinnest of the H's two, under its bar, and the n's
    first, across the middle of its height. null where they can't be read. */
function stemOfLetters(p: Params): number | null {
  const f = buildFont(plainLetters(p)), widths: number[] = [];
  for (const [ch, at] of [['H', 0.3], ['n', 0.5]] as const) {
    const g = f.glyph(ch), b = g && cmdsBox(g.cmds);
    const runs = g && b ? inkRuns(g.cmds, b.y0 + (b.y1 - b.y0) * at, false) : [];
    if (runs.length) widths.push(...(ch === 'H' ? [runs[0], runs[runs.length - 1]] : [runs[0]]).map(([lo, hi]) => hi - lo));
  }
  return widths.length ? Math.min(...widths) : null;
}

/** How thick a design draws its hairline and its stems. The engine's letters built from strokes draw them as its
    measures say (Metrics.hT, and the upright pen's); a free font's letters as the font has them, moved by those
    measures (the skin in the engine keeps a font's own contrast, its strokes between hairline and stem drawn as far
    between the new ones), and block letters as their corners do, so those are read off the letters (barOf,
    stemOfLetters). Where they can't be read, the measures stand in. */
function lookOf(p: Params, read = !!p.freeFont || p.build === 'blocks'): Look {
  const m = metrics(resolve(p)), measured = { hair: m.hT, stem: m.tDir(0, 1), read: false };
  if (!read) return measured;
  const hair = barOf(p), stem = stemOfLetters(p);
  return hair && stem ? { hair, stem, read: true } : measured;
}

/** The settings that draw member `q`, a lighter weight of design `p` (which draws `look`), with its hairline as thick
    as the design's, and never thicker than HAIR_MOST of its own stems: its Contrast lowered as far as that takes, to
    50 (none) at the most, and then its Horizontals raised. A design with less contrast keeps less of its hairline: it
    thins by a power of how much thinner the stems are, 0 (kept whole) while the hairline is HAIR_KEEP[0] of the stems
    or less, rising to 1 (thinned as much as the stems) at HAIR_KEEP[1]. None where the member draws its hairline so
    already, or its contrast is reversed (its thin strokes are its stems). */
function keepHairline(p: Params, look: Look, q: Params): Pick<Params, 'contrast' | 'hWeight'> | null {
  if (q.contrast < 0.5) return null;
  let now = lookOf(q, look.read);
  // (read off the letters for both or for neither: a font whose H has no bar to read is measured as the engine draws)
  if (now.read !== look.read) { look = lookOf(p, false); now = lookOf(q, false); }
  const share = clamp01((look.hair / look.stem - HAIR_KEEP[0]) / (HAIR_KEEP[1] - HAIR_KEEP[0]));
  const want = Math.min(look.hair * Math.pow(now.stem / look.stem, share), HAIR_MOST * now.stem);
  if (now.hair >= want) return null;
  // (the way from as it is, 0, to Contrast at 50, 1, and on to Horizontals at 100, 2: the hairline thickens all along)
  const at = (u: number): Params => (u <= 1 ? { ...q, contrast: lerp(q.contrast, 0.5, u) } : { ...q, contrast: 0.5, hWeight: lerp(q.hWeight, 1, u - 1) });
  const hT = (u: number) => metrics(resolve(at(u))).hT;
  let u = 0;
  if (!now.read) u = solve(hT, want, 0, 2);
  else {
    // a free font's hairline, or a block letter's bar, is drawn about in step with the measure that moves it
    // (Metrics.hT): the measure it wants is found on the line through the two tries nearest it on either side (till
    // one is past it, the last two below it, the first through nothing) and tried, till one draws it, or a little
    // thicker (a font's points stand on whole units)
    type Try = { u: number; h: number; b: number };
    let prev: Try = { u: 0, h: 0, b: 0 }, lo: Try = { u: 0, h: hT(0), b: now.hair }, hi: Try | null = null;
    for (let k = 0; k < 5; k++) {
      const [a, c] = hi ? [lo, hi] : [prev, lo];
      const next = solve(hT, a.h + (want - a.b) * (c.h - a.h) / (c.b - a.b), lo.u, hi ? hi.u : 2), b = barOf(at(next));
      if (b === null) break;
      const t = { u: next, h: hT(next), b };
      // (a font whose hairline doesn't follow the measure, a pixel font's, stays as it is)
      if (b < want) { if (b <= lo.b) break; prev = lo; lo = t; } else { hi = t; if (b <= want * 1.03 + 1) break; }
    }
    u = hi ? hi.u : lo.u;
    if (!u) return null;
  }
  const to = at(u);
  return { contrast: to.contrast, hWeight: to.hWeight };
}

/** A lighter weight's hairline settings (keepHairline), worked out once a design, its anchor and the weight, `q` the
    design at that weight's stems: its upright and its italic share them. */
const hairlines = new WeakMap<Params, { look: Look; kept: Map<string, Pick<Params, 'contrast' | 'hWeight'> | null> }>();
function hairlineOf(params: Params, anchor: WeightId, weight: WeightId, q: Params) {
  // (a free font not here yet has no letters to read: measured as the engine draws, and not kept)
  if (params.freeFont && !freeFont(params.freeFont)) return keepHairline(params, lookOf(params, false), q);
  let h = hairlines.get(params);
  if (!h) { h = { look: lookOf(params), kept: new Map() }; hairlines.set(params, h); }
  const key = `${anchor} ${weight}`;
  if (!h.kept.has(key)) h.kept.set(key, keepHairline(params, h.look, q));
  return h.kept.get(key)!;
}

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
    from the rest. A lighter weight keeps its hairlines as thick as the design's, with less contrast (keepHairline),
    and a letter with its own contrast or Horizontals has them lowered or raised as much. Letters drawn by hand in
    Points mode, which no setting shapes, are moved from the design instead: their strokes thickened or thinned and the
    letters leaned as the member's are (family-drawn.ts in the engine, which finds the design by the
    member's params object). A design written in a free font follows the weight and slant to the
    family's heavier or lighter fonts and its italic, as the editor does (see freeLetters in the engine). */
export function familyMember(params: Params, anchor: WeightId, weight: WeightId, italic: boolean): FamilyMember {
  const own = weight === anchor, ratio = own ? 1 : stemRatio(stemOf(params), anchor, weight);
  const weighs = own ? {} : withStem(params, stemOf(params) * ratio);
  const lighter = WEIGHTS.findIndex(w => w.id === weight) < WEIGHTS.findIndex(w => w.id === anchor);
  const hair: Partial<Pick<Params, 'contrast' | 'hWeight'>> = (lighter && hairlineOf(params, anchor, weight, { ...params, ...weighs })) || {};
  // (a letter's own weight, as far as its own stems step: within the slider, its Verticals the member's)
  const reweigh = (g: GlyphParams) => withStem({ ...params, ...weighs, ...g, glyphs: {} }, stemOf({ ...params, ...g, glyphs: {} }) * ratio).weight;
  const ownSlant = params.slant >= SLANTED;
  const slant = italic ? (ownSlant ? params.slant : ITALIC_SLANT) : 0;
  const reslant = (v: number) => clamp01(v + slant - params.slant);
  // (a letter's own contrast as much less, not past none, and its own Horizontals as much heavier)
  const rehair = (g: GlyphParams): GlyphParams => ({
    ...(hair.contrast !== undefined && g.contrast !== undefined && g.contrast >= 0.5 && { contrast: Math.max(0.5, g.contrast + hair.contrast - params.contrast) }),
    ...(hair.hWeight !== undefined && g.hWeight !== undefined && { hWeight: clamp01(g.hWeight + hair.hWeight - params.hWeight) })
  });
  const glyphs: Record<string, GlyphParams> = {};
  for (const [ch, g] of Object.entries(params.glyphs)) {
    glyphs[ch] = { ...g, ...(g.weight !== undefined && !own && { weight: reweigh(g) }), ...(g.slant !== undefined && { slant: reslant(g.slant) }), ...rehair(g) };
  }
  const cls = WEIGHTS.find(w => w.id === weight)!.cls;
  return {
    weight, italic, style: styleName(weight, italic), cls,
    angle: slantDeg(slant),
    params: drawnFrom({ ...params, ...weighs, ...hair, slant, glyphs }, params)
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
