/* Font engine.
   params (what the user edits: sliders 0..1, picked options, a letter's own values) -> resolve()
   -> metrics -> glyph skeletons -> expanded outlines. Pure math with no DOM, so the browser (live
   preview) and the server (font export) run exactly the same code. A full rebuild of every glyph
   takes a few milliseconds, so sliders can drive it directly.

   This file is the hub: the font-level types (Effective, Metrics, Glyph, Font; points, paths and the
   pen are in types.ts), the glyph table the letter files fill (defGlyph), resolve() and metrics(), the
   Builder each letter draws with, and buildFont(), which puts a font together. The stages of building
   one letter live beside it:
     glyph.ts         a letter's skeleton to its placed outline (and blocks, drawn letters)
     stencil.ts       gaps cut where strokes join and at turns (Stencil, crossbar Gap)
     ends.ts          stroke ends drawn on, trimmed, curled and run straight
     corners.ts       turns and square ends rounded and stepped
     joins.ts         the inside corners where strokes meet, filled with fillets
     serif-sides.ts   which way each stem's serifs reach, and cupped serif feet
     free-letters.ts  a free font's letters, moved by the settings
     highlight.ts     the part of a letter a setting shapes, for the explainer
   Most modules this file loads, directly or not, call back into it (glyph.ts and its stages, free-letters.ts,
   skin.ts, restyle.ts): any of them may use what it exports only inside functions, never at module load. The
   letter files (glyphs/, script.ts) fill the glyph table as they load, so index.ts imports them and
   this file never does.

   Beside metrics() stand the pieces of it other files share, so they stay in step with it: serifLen,
   counterScale, roundnessR, innerRoundR, stencilOff, bowlK, bowlOrg, dotRoundOf and cursiveHookR, and the
   constants SERIF_SB, SLANT_PIVOT and CURSIVE_FORMS, read by the glyph files and by the free fonts' letters
   (skin.ts, restyle.ts, free-letters.ts), which move as far as the engine's own. */
import { DEFAULTS, GRID_FILLS, contrastOf, formOf, gridCells, joinGap, rotationDeg, slantDeg, weighed, weightScale, xHeightRatio, type ControlKey, type Params } from '../params';
import { CIRCLE_K, clamp, cubicAt, lerp, quarter } from './geom';
import { freeFont, type FreeFont } from './free';
import type { Drawn } from './outline';
import { autoThickness, organicK, type SerifPlace } from './stroke';
import type { Cmd, Mark, MarkType, Mat, PenCtx, Pt, StrokeOpts, Tangent, TermSpec } from './types';
import { buildBlock, buildGlyph } from './glyph';
import { formChanged, freeFontsWanted, freeGlyph, freeLetters, twinGlyph } from './free-letters';
import { drawnDesign, drawnFrom, drawnLetter } from './family-drawn';
import { highlightD } from './highlight';

export const CHARSET = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789', punct: '.,:;…!¡?¿\'"‘’“”‚„‹›«»()[]{}-–—_/\\|·•',
  symbols: '&@#$¢€£¥%+−×÷=<>±~^*°©®™§¶†‡`'
} as const;
export const ALL_CHARS = CHARSET.upper + CHARSET.lower + CHARSET.digits + CHARSET.punct + CHARSET.symbols;

/** Parameters after the personality macros have been applied, plus derived switches. The macros push
    curve, aperture, contrast, roundness, apex, xHeight, width and letterSpacing, so those differ from the
    Params they came from; and contrast holds the pen's amount of thick against thin (see contrastOf), not
    the place on the Contrast scale, whose lower half turns it round (`reverse`). */
export interface Effective extends Params {
  /** how far the contrast is turned round (see contrastOf) */ reverse: number;
  square: number; classic: number; bounce: number; singleStory: boolean; stressDeg: number;
}

export interface Metrics {
  /** the settings it is measured from, after the macros */ p: Effective;
  /** stem thickness */ s: number;
  /** cap height and x-height */ cap: number; xh: number;
  /** ascender height and descender depth (desc is negative) */ asc: number; desc: number;
  /** overshoot of round letters */ os: number;
  /** width scale */ ws: number;
  /** thickness of the thin strokes (the bars), after Contrast and Horizontals */ thin: number;
  /** the tension of a quarter turn's handles (CIRCLE_K a circle, fuller with Curves and Squareness), and
      how organic the bowls are (see organicK) */ k: number; org: number;
  /** how square the bowls are (Effective.square) */ sq: number;
  /** cursive amount and hand-drawn irregularity */ cur: number; wob: number;
  /** the shared advance width that monospacing pulls every glyph toward */ monoAdv: number;
  /** grid size of the grid fills (GRID_FILLS; 0 for the others); advances snap to it for all but lines */ cell: number;
  /** stencil gap, and the band the slice removes (both 0 when off) */ gap: number; sliceY: number; sliceH: number;
  /** how far out from a join its stencil gap opens, and how far the stencil and slice round the corners they cut, 1 a half round across the stroke cut */ gapOff: number; gapRound: number; sliceRound: number;
  /** the radius Inside corners rounds the counters' corners by, whatever the weight (0 when off) */ innerR: number;
  /** Crossbar height, Peaks and Openness, 0..1 (Peaks and Openness after the macros) */ bar: number; apex: number; ap: number;
  /** Inner space, -1..1 with 0 at the middle */ cnt: number;
  /** serifs on (their shape is ctx.serif) */ serif: boolean;
  /** the pen, for the stroke expander */ ctx: PenCtx;
  /** thickness of a stroke running in direction (dx, dy) */ tDir: (dx: number, dy: number) => number;
  /** thickness of a horizontal stroke */ hT: number;
  /** body width for a base design width. cls: 'r' round, 'c' classically narrow */ W: (base: number, cls?: 'r' | 'c') => number;
  /** the side bearing a straight stem gets; each glyph's side-bearing factors scale it */ sb: number;
  /** letter spacing added after every advance (in whole cells for pixels and dots), and the word space */ track: number; space: number;
  /** the shear Slant gives: the tangent of up to 20° (see slantDeg), leaning about SLANT_PIVOT of the x-height */ slant: number;
  /** the corner radius Roundness gives */ R: number;
  /** how round the dots are, 0 square to 1 round */ dotRound: number;
  /** how far each letter is turned, in radians clockwise */ rot: number;
  /** the point (and tangent) `u` along a quarter turn ('hv' or 'vh') drawn with the pen's tension */
  qpt: (x0: number, y0: number, x1: number, y1: number, mode: string, u: number) => Tangent;
}

/** The controls that shape a letter, which the letter inspector lists for it. */
interface GlyphMeta {
  params?: ControlKey[];
  /** a joined-up hand's letter (script.ts), whose strokes run over one another where the pen goes back over them (up
      an n's stem, round an o): a font file has them made one ink, as a browser fills a web font's overlaps unevenly */
  joined?: true;
  /** a joined script's small letter whose join leaves it high, level from its top (an o's, a v's): the letter after it
      is written in its 'hi' form (GlyphAlt), its own join coming in level at that height */ exitHigh?: true;
}
/** Another form a letter is written in where the letter before it asks for one: 'hi', a joined script's small letter
    after one whose join leaves it high (GlyphMeta.exitHigh), its join coming in level at that height instead of rising
    from low down (a dip between the two read as one more stroke, an o and a v as ow). Its glyph id is the letter's
    form's with '.hi' after it (altId), and it keeps the letter's advance, so the layout stands as it is. */
export type GlyphAlt = 'hi';
/** The glyph id form `id` is written in as `alt`. */
export const altId = (id: string, alt: GlyphAlt) => id + '.' + alt;
type GlyphFn = (g: Builder, m: Metrics) => number;
/** A glyph table entry (defGlyph): its side-bearing factors, the function drawing it, and what the inspector lists. */
export interface GlyphDef { sb: [number, number]; fn: GlyphFn; meta: GlyphMeta }

/** `id` is the stroke's own (see isStrokeId, and Builder.strokes for where it comes from), for the strokes a
    letter can weight one by one. */
export interface GlyphStroke { part: string; cmds: Cmd[]; curved: boolean; horizontal?: boolean; dot?: boolean; id?: string }

export interface Glyph {
  ch: string;
  strokes: GlyphStroke[];
  serifs: Cmd[][];
  /** where each of the serifs sits, in their order */ serifAt: SerifPlace[];
  counters: Cmd[][];
  marks: Mark[];
  skeleton: Pt[][];
  meta: GlyphMeta;
  bodyW: number;
  lsb: number; rsb: number; adv: number;
  /** the outline a letter drawn as it is was drawn from (with the pen, or a free font's) */ drawn?: Drawn;
  /** the effects (the slice, the fill, rough edges) drew its outline, so `cmds` aren't `drawn` as it stands: Points
      shows the letter as they draw it */ fx?: boolean;
  M: Mat;
  cmds: Cmd[];
  /** SVG path data (y flipped) */
  d: string;
}

/** A character set on a line: where it stands, its advance, and the form the letter before it asks it to be written in. */
export interface LineItem { ch: string; x: number; adv: number; alt?: GlyphAlt }
export interface Line { items: LineItem[]; width: number }

export interface Font {
  params: Params;
  eff: Effective;
  m: Metrics;
  /** the free font the letters are written in, once registered (see free.ts) */ free?: FreeFont;
  /** written in a free font that isn't registered yet: the letters are built meanwhile, or drawn from the font
      picked while the weight or italic the settings ask for is on its way */ freePending: boolean;
  /** the free fonts it draws from that weren't registered when it was built (see freeFontsWanted) */ freeMissing: string[];
  /** Letter `ch`, in the form `alt` where it has one (else as it is: drawn in Points, a free font's own, not a script's). */
  glyph(ch: string, alt?: GlyphAlt): Glyph | null;
  /** The font `ch` is drawn from: one built with its own settings when it has any, else this one. */
  letter(ch: string): Font;
  /** SVG path data of the part of `ch` that parameter `key` affects ('' if none). */
  hl(ch: string, key: ControlKey): string;
  advance(ch: string): number;
  /** Lay out text into lines. maxWidth in font units (Infinity = no wrap). */
  layout(text: string, maxWidth: number): Line[];
}

/** The glyph table, by glyph id: a character, or a character and the form it draws ('a.alt', 'f.cur', 'S.scr'). */
const GLYPHS: Record<string, GlyphDef> = {};
/* sb: [left, right] side-bearing factors (1 = straight stem, ~.55 round, ~.25 diagonal) */
export const defGlyph = (ch: string, sb: [number, number], fn: GlyphFn, meta?: GlyphMeta) => {
  GLYPHS[ch] = { sb, fn, meta: meta || {} };
};
export const hasGlyph = (ch: string) => ch in GLYPHS;
/** The drawing of glyph `ch`, for building it (glyph.ts) and for a variant that draws it and adds to it. */
export const glyphDefOf = (ch: string): GlyphDef | undefined => GLYPHS[ch];
/** Every id in the glyph table, as registered (tests walk it to check what each glyph declares). */
export const glyphIds = () => Object.keys(GLYPHS);

/** The macros push the x-height by steps measured on the older Lowercase height scale (see xHeightFromOld in shared/params/scales.ts): one such step on the current scale. */
const XH_OLD = 0.36 / 0.56;

/** From this far along Cursive the letters take their cursive forms: the single-storey a (on auto), the cursive f and y
    ('f.cur', 'y.cur'), the looped descender of the g, and entry strokes that start low (glyphs/). */
export const CURSIVE_FORMS = 0.35;

/* Personality sliders are macros: they push several low-level parameters at once. */
export function resolve(p: Partial<Params>): Effective {
  const e = { ...DEFAULTS, ...p } as Effective;
  const gh = (e.geoHuman - 0.5) * 2, ss = (e.softSharp - 0.5) * 2;
  const cf = (e.classicFuture - 0.5) * 2, pf = (e.playfulFormal - 0.5) * 2;
  const human = Math.max(0, gh), classic = Math.max(0, -cf), future = Math.max(0, cf);
  const playful = Math.max(0, -pf), formal = Math.max(0, pf);
  // each pushes a setting up to `by` (down, below 0) at full turn, but where that would run past 0 or 1,
  // only as far as 0 or 1, so the setting keeps moving all the way along the macro rather than stopping
  const push = (v: number, by: number, amt: number) => (amt ? lerp(v, clamp(v + by * Math.sign(amt)), Math.abs(amt)) : v);
  e.curve = push(e.curve, 0.45, gh);
  e.aperture = push(push(e.aperture, 0.3, gh), -0.3, future);
  const c = contrastOf(e.contrast);
  e.reverse = c.reverse;
  e.contrast = push(push(push(push(c.amount, 0.08, human), 0.25, classic), 0.1, formal), -0.05, future);
  e.roundness = push(push(e.roundness, -0.7, ss), 0.15, playful);
  e.apex = push(e.apex, -0.5, ss);
  // (by steps on the older Lowercase height scale, see XH_OLD)
  e.xHeight = push(push(e.xHeight, 0.18 * XH_OLD, cf), 0.12 * XH_OLD, playful);
  e.width = push(push(e.width, 0.1, future), -0.07, formal);
  e.letterSpacing = push(e.letterSpacing, 0.04, formal);
  e.square = clamp(0.85 * future + e.squareness);
  e.classic = classic;
  e.bounce = playful;
  // italic and script hands use the single-storey a (unless one is picked) and hold the pen at a steeper angle
  e.singleStory = e.story === 'auto' ? gh < -0.3 || e.cursive >= CURSIVE_FORMS : e.story === 'single';
  e.stressDeg = e.curve * 10 + human * 9 + classic * 7 + e.cursive * 14;
  return e;
}

/** The finer shape of the picked kind and form of stroke end, for the stroke expander. */
export const termSpec = (e: Params): TermSpec => ({
  form: formOf(e.terminal, e.terminalForm), flare: lerp(1.15, 1.6, e.terminalFlare), depth: lerp(0.08, 0.45, e.terminalDepth),
  size: lerp(0.58, 1.05, e.terminalSize), clip: lerp(0.15, 0.7, e.terminalClip), round: lerp(0.1, 0.5, e.terminalRound),
  point: e.terminalPoint < 0.5 ? lerp(0.35, 0.95, e.terminalPoint * 2) : lerp(0.95, 1.4, e.terminalPoint * 2 - 1), lean: e.terminalLean - 0.5,
  slope: 0.6 * 2 ** ((e.terminalSlope - 0.5) * 2), tilt: (e.terminalTilt - 0.5) * 2 * 35 * Math.PI / 180,
  tip: Math.max(0.03, 0.84 * (1 - e.terminalTip)), taper: e.terminalTaper < 0.5 ? lerp(2.2, 3, e.terminalTaper * 2) : lerp(3, 6, e.terminalTaper * 2 - 1)
});

/** The height of the pinch's line at `pos` on its scale: the baseline, half the x-height at the middle, the cap height. */
const pinchY = (pos: number, xh: number, cap: number) => (pos < 0.5 ? lerp(0, xh / 2, pos * 2) : lerp(xh / 2, cap, pos * 2 - 1));

/** A serif measure at `v` on a scale centred on 0.5, where it is as drawn: `lo` times that at 0, `hi` times at 1. */
const serifScale = (v: number, lo: number, hi: number) => (v < 0.5 ? lerp(lo, 1, v * 2) : lerp(1, hi, v * 2 - 1));
/** A serif's length at `v` on Serif size, in letters `ws` times as wide as usual (Metrics.ws). A free font's serifs
    move by it too (skinMeasures in skin.ts). */
export const serifLen = (v: number, ws: number) => lerp(28, 175, v) * (0.75 + 0.25 * ws);
/** How thick a serif of each shape is at `v` on the Thickness scale. A diamond reads the Thickness back out of it
    (diamondK in stroke.ts undoes the 8 to 95): keep the two in step. */
const serifTh = (v: number, shape: string) => lerp(8, 95, v) * ({ unbracketed: 0.6, slab: 1.5 }[shape] ?? 1);
/** How much of a serif's length the side bearings grow by, so serifed letters keep apart. A free font's letters
    given the engine's serifs grow theirs as much (freeGlyph in free-letters.ts). */
export const SERIF_SB = 0.3;
/** How far the serifs on arms lean from upright at either end of the Lean scale, in radians (35°). */
const ARM_LEAN = 0.61;
/** The stem the glyphs' base widths and the side bearing are drawn for: a heavier one widens the letters and
    narrows the side bearings. */
const REGULAR_STEM = 80;
/** How much wider Inner space (`cnt`, -1..1) draws a letter: one built round a counter (`cls` 'r') 0.22 a unit, any
    other 0.06 (see Metrics.W). A free font's letters widen by it too (skinMeasures in skin.ts). */
export const counterScale = (cls: 'r' | 'c' | undefined, cnt: number) => 1 + (cls === 'r' ? 0.22 : 0.06) * cnt;
/** The tension of a quarter turn's handles (Metrics.k): CIRCLE_K a circle, fuller with Curves and Squareness. A free
    font's bowls are drawn again by it (bowlLook in restyle.ts). */
export const bowlK = (e: Effective) => CIRCLE_K + 0.05 * e.curve + 0.36 * e.square;
/** How organic the bowls are (Metrics.org, see organicK). Organic bowls are fuller on the diagonal a slant leans into a
    sharp corner (top right, bottom left): the two together pinch a bowl into a lumpy parallelogram, so a slant, which
    leans a bowl that way itself, takes the place of as much of it. A free font's bowls follow it too (bowlLook). */
export const bowlOrg = (e: Effective) => e.curve * (1 - clamp(e.slant));
/** The corner radius Roundness gives at `v`, for stems `s` thick (Metrics.R): half a stem at 1. A free font's corners
    round by it too (cornerLooks in restyle.ts). */
export const roundnessR = (v: number, s: number) => v * s * 0.5;
/** The radius Counters (innerRound) rounds the counters' corners by at `v`, in letters `cap` high, whatever the weight
    (Metrics.innerR). A free font's inside corners round by it too (cornerLooks in restyle.ts). */
export const innerRoundR = (v: number, cap: number) => v * cap * 0.4;
/** How far out from a join its stencil gap opens at `pos` on Stencil's Position, for stems `s` thick in letters with
    x-height `xh` (Metrics.gapOff): a gap moved out starts a stub's width out, so it never leaves a hairline on the
    stroke it joins. A free font's gaps move out as far (restyleStencil in restyle.ts). */
export const stencilOff = (pos: number, s: number, xh: number) => (pos > 0 ? lerp(s * 0.55, xh * 0.4, pos) : 0);
/** How round the dots are, 0 square to 1 round (Metrics.dotRound): as Dots picks them, or on auto as round as
    Roundness or as round ends' own Roundness. A free font's dots are drawn again by it (dotLook in restyle.ts). */
export const dotRoundOf = (e: Params) => (e.dots === 'round' ? 1 : e.dots === 'square' ? 0 : Math.max(e.roundness, e.terminal === 'round' ? e.terminalRound : 0));
/** The radius of the cursive hooks, for stems `s` thick and an x-height `xh`, at `cur` on Cursive; 0 in a design with
    no cursive at all. The letters' hooks are drawn by it (hookR in glyphs/shared.ts), and the word space widens by
    most of it. */
export const cursiveHookR = (s: number, xh: number, cur: number) => (cur < 0.04 ? 0 : lerp(s * 0.55, xh * 0.26 + s * 0.35, cur));
/** The height the letters lean about, as a share of the x-height: placeGlyph (glyph.ts) shears them about it, and the
    construction grid (grid.ts) stands them up again about it. */
export const SLANT_PIVOT = 0.4;

export function metrics(e: Effective): Metrics {
  // Verticals weigh the stems on their own, and Horizontals the bars: each scales its side of the
  // pen, so a heavier stem leaves the bars as they were
  const s0 = 18 + 200 * Math.pow(e.weight, 1.25), s = weighed(s0, e.vWeight, 0, Math.max(s0, 300));
  const cap = lerp(560, 840, e.height);
  const xh = cap * xHeightRatio(e.xHeight);
  const ws = e.width < 0.5 ? lerp(0.6, 1, e.width * 2) : lerp(1, 1.5, (e.width - 0.5) * 2);
  // the bars thin with contrast, from no heavier than a fifth of the x-height to no lighter than 8; past
  // its gentle start, contrast runs the whole way between the two, so neither limit stops it part way
  const thinAt = (c: number) => Math.max(8, Math.min(s0 * (1 - 0.08 - 0.84 * c), xh * 0.2));
  const thin = weighed(e.contrast <= 0.05 ? thinAt(e.contrast) : lerp(thinAt(0.05), thinAt(1), (e.contrast - 0.05) / 0.95), e.hWeight, 4, xh * 0.32);
  const stress = e.stressDeg * Math.PI / 180;
  const k = bowlK(e), org = bowlOrg(e);
  const ctx: PenCtx = {
    thick: s, thin, stress, k, org, terminal: e.terminal, chamfer: e.chamfer, joints: e.joints, reverse: e.reverse, swell: e.swell,
    term: termSpec(e), dropLow: e.serif ? xh * 0.5 : undefined,
    pinch: e.pinch > 0 ? { y: pinchY(e.pinchPos, xh, cap), amount: e.pinch, reach: xh / 2 } : undefined,
    serif: e.serif ? {
      len: serifLen(e.serifSize, ws), ref: serifLen(DEFAULTS.serifSize, ws),
      th: serifTh(e.serifThickness, e.serifShape),
      shape: e.serifShape, angle: e.serifAngle,
      bracket: 0.85 * serifScale(e.serifBracket, 0.25, 1.8), tip: e.serifTip, tipRound: lerp(0.1, 0.5, e.serifTipRound), tipSlant: (e.serifTipSlant - 0.5) * 2,
      cup: e.serifBase === 'cupped' ? lerp(0.15, 1, e.serifCup) : 0,
      balance: (e.serifBalance - 0.5) * 2, tops: serifScale(e.serifTops, 0.4, 1.8), arms: serifScale(e.serifArms, 0.4, 1.8),
      armTh: serifScale(e.serifArmThickness, 0.3, 2.2), armLean: (e.serifArmLean - 0.5) * 2 * ARM_LEAN,
      sides: e.serifSides,
      inner: e.serifInner !== 'same' || e.serifInnerSize !== 0.5 || e.serifInnerThickness !== 0.5 ? {
        shape: e.serifInner === 'same' ? e.serifShape : e.serifInner, len: serifScale(e.serifInnerSize, 0.3, 1.8),
        th: serifTh(e.serifThickness, e.serifInner === 'same' ? e.serifShape : e.serifInner) * serifScale(e.serifInnerThickness, 0.3, 2.2)
      } : null
    } : null
  };
  const tDir = (dx: number, dy: number) => { const l = Math.hypot(dx, dy) || 1; return autoThickness(dx / l, dy / l, ctx, s, thin); };
  const cnt = (e.counter - 0.5) * 2;
  const sb = Math.max(14, 64 * (0.65 + 0.35 * ws) - (s - REGULAR_STEM) * 0.12 + (e.sideBearing - 0.5) * 130 + (ctx.serif ? ctx.serif.len * SERIF_SB : 0));
  /* body width: base is drawn for a regular weight at normal width.
     cls: 'r' letters built around a counter, 'c' classically narrow caps, left out for the rest */
  const W = (base: number, cls?: 'r' | 'c') => {
    let w = base * ws;
    w *= counterScale(cls, cnt);
    if (cls === 'c') w *= 1 - 0.13 * e.classic;
    if (cls === 'r') w *= 1 + 0.05 * e.classic;
    return w + (s - REGULAR_STEM) * 0.62;
  };
  const monoAdv = W(500) + sb * 1.5;
  // the grid fills sit on one grid across the line, so spacing moves in whole cells
  const cell = GRID_FILLS.includes(e.fill) ? cap / gridCells(e.module) : 0;
  const snap = (v: number) => (cell && e.fill !== 'lines' ? Math.round(v / cell) * cell : v);
  // at 100 the slice takes the middle half of the x-height, short of a thin stroke's width at the top and bottom
  const sliceH = e.slice > 0 ? lerp(4, Math.max(xh * 0.14, Math.min(xh * 0.5, xh - 2 * thin)), e.slice) : 0;
  return {
    p: e, s, cap, xh,
    // (skinMeasures, skin.ts, moves a free font's ascenders by the Stem length term, as a share of the cap height)
    asc: Math.max(xh * 1.12, Math.max(cap * 1.05, xh * 1.18) + (e.extenders - 0.5) * cap * 0.5),
    desc: -cap * 0.3 * lerp(0.55, 1.45, e.extenders) * (e.descender < 0.5 ? lerp(0.45, 1, e.descender * 2) : lerp(1, 1.6, e.descender * 2 - 1)),
    os: cap * 0.014,
    ws, thin, k, org, sq: e.square, cur: e.cursive, wob: e.wobble, monoAdv,
    cell, gap: e.stencil > 0 ? joinGap(e.stencil, s) : 0, gapOff: stencilOff(e.stencilPos, s, xh), gapRound: e.stencilRound,
    // the slice keeps a stroke's width of ink below it and above it, so at either end it still cuts through the letters
    sliceY: e.slicePos < 0.5 ? lerp(Math.min(xh * 0.5, s + sliceH / 2), xh * 0.5, e.slicePos * 2) : lerp(xh * 0.5, Math.max(xh * 0.5, cap - s - sliceH / 2), e.slicePos * 2 - 1),
    sliceH, sliceRound: e.sliceRound, innerR: innerRoundR(e.innerRound, cap),
    bar: e.crossbar, apex: e.apex, ap: e.aperture, cnt,
    serif: !!e.serif,
    ctx, tDir, hT: tDir(1, 0), W,
    sb,
    track: snap((e.letterSpacing - 0.2) * 260),
    // joined-up letters leave no gap of their own, and their entry and exit strokes swing out into
    // the space, so a cursive design gets a wider one (about its hooks' size) to keep words apart
    space: Math.max(snap(lerp(W(210) + (e.wordSpacing - 0.35) * 520 + cursiveHookR(s, xh, e.cursive) * 0.8,
      monoAdv, e.mono)), cell),
    slant: Math.tan(slantDeg(e.slant) * Math.PI / 180),
    rot: rotationDeg(e.rotation) * Math.PI / 180,
    R: roundnessR(e.roundness, s),
    dotRound: dotRoundOf(e),
    qpt: (x0, y0, x1, y1, mode, u) => {
      return cubicAt(quarter(x0, y0, x1, y1, mode, organicK(k, org, x1 - x0, y1 - y0)), u);
    }
  };
}

/** A fillet's inside corner at (x, y), filling toward (sx, sy) up to a quarter circle r across. */
interface Fillet { x: number; y: number; sx: number; sy: number; r: number }
interface RawStroke { cmds?: Cmd[]; poly?: Pt[]; o: StrokeOpts; fillet?: Fillet }

export function filletPts({ x, y, sx, sy, r }: Fillet): Pt[] {
  // it reaches a little into both strokes, so no hairline shows between them
  const e = 2, cx = x + sx * r, cy = y + sy * r, pts: Pt[] = [{ x: x - sx * e, y: y - sy * e, sharp: true }, { x: cx, y: y - sy * e, sharp: true }];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI / 2;
    pts.push({ x: cx - sx * r * Math.sin(a), y: cy - sy * r * Math.cos(a), smooth: i > 0 && i < 12 });
  }
  pts.push({ x: x - sx * e, y: cy, sharp: true });
  return pts;
}

/** Glyph builder handed to each glyph function. */
export class Builder {
  /** The strokes in the order the glyph function draws them. A stroke's index here is its id, and its ends
      ('0s', 'p0e'), turns ('0t1'), corners ('0sl', '0j0') and joins are named from it; saved designs keep a
      letter's own values under those ids (Params.glyphs[ch].strokeWeights, terminalEnds, terminalCurls,
      corners, cornerSteps, joinGaps), so a changed glyph function keeps its strokes in their order and adds
      a new one after them: one drawn before or between them moves every saved value after it onto another
      stroke. Dots, fillets and blobs take an index too. */
  strokes: RawStroke[] = [];
  counters: Pt[][] = [];
  marks: Mark[] = [];
  /** how far cursive strokes reach past the body on the left (as a negative x) and right */
  reachL = 0; reachR = 0;
  /** side-bearing factors for a form of the letter with other sides than its usual one (an arched V's stems) */
  sb?: [number, number];
  /** where a joined-up letter meets its neighbours (see script.ts): the hand's irregularity leaves these be (a script
      capital's is empty: it meets none, but is placed as the hand's small letters are, see placeGlyph) */
  joins?: [number, number][];
  constructor(public m: Metrics) {}
  path(cmds: Cmd[], o?: StrokeOpts) { this.strokes.push({ cmds, o: o || {} }); return this; }
  line(x0: number, y0: number, x1: number, y1: number, o?: StrokeOpts) { return this.path([['M', x0, y0], ['L', x1, y1]], o); }
  stem(x: number, y0: number, y1: number, o?: StrokeOpts) { return this.line(x, y0, x, y1, { part: 'stem', ...o }); }
  dot(cx: number, cy: number, size: number) {
    const h = size / 2, r = h * this.m.dotRound;
    this.strokes.push({ poly: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]].map(p => ({ x: p[0], y: p[1], r })), o: { part: 'dot' } });
    return this;
  }
  /** A round in the inside corner at (x, y) where two strokes meet square, `r` across, filling the
      corner toward (sx, sy) (each ±1) up to a quarter circle. The outside of the join stays square. */
  fillet(x: number, y: number, sx: number, sy: number, r: number) {
    if (r < 1) return this;
    const fillet = { x, y, sx, sy, r };
    this.strokes.push({ poly: filletPts(fillet), o: { part: 'fillet' }, fillet });
    return this;
  }
  /** A filled shape, like a fillet, for a corner no stroke draws. */
  blob(pts: Pt[], part = 'fillet') { if (pts.length > 2) this.strokes.push({ poly: pts, o: { part } }); return this; }
  counter(pts: number[][]) { this.counters.push(pts.map(p => ({ x: p[0], y: p[1] }))); return this; }
  ellipseCounter(cx: number, cy: number, rx: number, ry: number) {
    const pts: number[][] = [];
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return this.counter(pts);
  }
  mark(type: MarkType, x: number, y: number) { this.marks.push({ type, x, y }); return this; }
}

/** The tension of a quarter-turn command drawn from `cur`, as stroke.ts draws it. */
export const quarterK = (cur: Pt, c: Cmd, m: Metrics) => organicK(m.k, m.org, c[1] - cur.x, c[2] - cur.y);

/** How much heavier stroke `si` is drawn than the design draws it: by its own weight, if its letter gives it one. */
export function strokeWt(m: Metrics, si: number) {
  const v = m.p.strokeWeights?.[si];
  return v == null ? 1 : weightScale(v);
}

/** Whether end `which` ('s' or 'e') of a stroke drawn with options `o` carries a serif: serifs are on, the end asks for
    one, and the stroke isn't drawn at a scale of its own. buildGlyph (glyph.ts), stretchTerminals (ends.ts) and the
    serif sides and cups (serif-sides.ts) all go by it. */
export const hasSerif = (m: Metrics, o: StrokeOpts, which: 's' | 'e') => m.serif && !o.scale && !!(which === 's' ? o.serifS : o.serifE);

/** Whether the engine writes the letters as a joined-up script's (script.ts): in a design more than half cursive. (A free
    font's letters are its own, script or print: see formChanged in free-letters.ts.) */
export const scriptForms = (e: Pick<Params, 'cursive'>) => e.cursive >= 0.5;

/** The glyph id letter `ch`'s script form ('S.scr', see script.ts) is registered and picked under. */
export const scriptId = (ch: string) => ch + '.scr';
/** How far a script's join runs straight on past the edge of a small letter, out of it and into the next (in x-heights
    across, see script.ts): out past the last letter of a word and in before the first of the next, into the space. */
export const SCRIPT_PAST = 0.07;
/** The least room between a script's words, from the end of one's join to the start of the next one's, in x-heights
    across (see buildFont). */
export const SCRIPT_GAP = 0.45;
/** An x-height across, as the script's small letters are drawn in it (script.ts): narrower than it is tall, as a hand
    writes, as Width sets it, and widened as the strokes get heavier, the more so past a stroke an eighth of it wide, so
    a heavy hand's counters, between stems as between the sides of its loops, stay open. */
export const scriptAcross = (m: Pick<Metrics, 'xh' | 's' | 'W'>) => {
  const base = (m.xh * 0.86 + m.s * 1.5) * m.W(1000) / 1000;
  return base * (1 + 2.5 * Math.max(0, m.s / base - 0.12));
};

/** The glyph id letter `ch` is drawn from in design `e`: a script's own letter first, as it is written whole,
    single-storey a and all; else the single-storey a, the cursive form, or the letter itself. */
export function variantOf(ch: string, e: Effective): string {
  const script = scriptForms(e) && hasGlyph(scriptId(ch));
  if (script) return scriptId(ch);
  if (ch === 'a' && e.singleStory) return 'a.alt';
  return e.cursive >= CURSIVE_FORMS && hasGlyph(ch + '.cur') ? ch + '.cur' : ch;
}

/** Each font's letters as its settings (or its free font) draw them, leaving out the drawn ones. A font
    that differs from another only in its drawings shares the other's, so dragging a point in Points,
    which builds the font again on every move, doesn't build every other letter again with it. */
const settingsGlyphs = new WeakMap<Font, Map<string, Glyph | null>>();
/** Whether two designs differ in nothing but their drawn letters. */
function sameSettings(a: Params, b: Params): boolean {
  for (const k in a) if (k !== 'outlines' && a[k as keyof Params] !== b[k as keyof Params]) return false;
  for (const k in b) if (k !== 'outlines' && !(k in a)) return false;
  return true;
}

/** The font `params` describe; `from`, an earlier build, lends its letters where only the drawings differ. */
export function buildFont(params: Params, from?: Font): Font {
  const e = resolve(params), m0 = metrics(e);
  // a free font's letters stand as tall as the design's capitals, and its space is the font's own, wider or
  // narrower by Word spacing
  const fl = e.freeFont ? freeLetters(params, e, m0) : null, free = fl?.font;
  const m1 = free ? { ...m0, space: Math.max(20, free.space * fl.k * fl.sx + (e.wordSpacing - 0.35) * 520) } : m0;
  // a script's joins run out past the end of a word and in before the next, into the space, and its small letters
  // stand on no side bearings: the space is wider by both joins and by a side bearing (in whole cells on a grid fill),
  // so the words stand about as far apart as their letters' ink would in print, and never nearer, the ends of the two
  // joins, than SCRIPT_GAP of an x-height across, however tight the design's words are set (a join's hairline end
  // stands out less than a letter's side). (A free font's letters are its own, and it spaces its own words.)
  const joined = !free && scriptForms(e);
  const across = scriptAcross(m1), sp = Math.max(m1.space + 2 * SCRIPT_PAST * across + m1.sb, (SCRIPT_GAP + 2 * SCRIPT_PAST) * across - m1.track);
  const m = joined ? { ...m1, space: m1.cell && e.fill !== 'lines' ? Math.max(m1.cell, Math.round(sp / m1.cell) * m1.cell) : sp } : m1;
  // a family member's drawn letters are moved from the design they were drawn in (family-drawn.ts)
  const at = drawnDesign(params);
  const cache = new Map<string, Glyph | null>(), hlCache = new Map<string, string>(), letters = new Map<string, Font>();
  const built = (from && from.free === free && sameSettings(from.params, params) && settingsGlyphs.get(from)) || new Map<string, Glyph | null>();
  /** Letter `ch` as the settings draw it: its own letter's font's, a free font's (in a form the font hasn't got, its
      twin's), a block letter, or the glyph table's form of it (variantOf). */
  const fromSettings = (ch: string, alt?: GlyphAlt): Glyph | null => {
    const lf = font.letter(ch);
    if (lf !== font) return lf.glyph(ch, alt);
    if (free?.glyphs[ch]) return (fl!.skin && formChanged(ch, fl!.now, fl!.pick) && twinGlyph(ch, fl!, alt)) || (alt ? font.glyph(ch) : freeGlyph(ch, free.glyphs[ch], fl!));
    if (e.build === 'blocks') { const b = buildBlock(ch, m); if (b) return alt ? font.glyph(ch) : b; }
    const id = variantOf(ch, e);
    if (alt && !hasGlyph(altId(id, alt))) return font.glyph(ch);
    return buildGlyph(alt ? altId(id, alt) : id, m, ch);
  };
  /** Letter `ch` (in form `alt`): as drawn, if it is (moved as far as the settings move from those it was drawn at, or,
      in a family member, from its design; a drawn letter has no other form); else as built before with the same
      settings, or built now and kept. */
  const pickGlyph = (ch: string, alt?: GlyphAlt): Glyph | null => {
    const drawn = params.outlines?.[ch];
    if (drawn) return alt ? font.glyph(ch) : drawnLetter(ch, drawn, font, at);
    const key = alt ? ch + '\u0001' + alt : ch, before = built.get(key);
    if (before !== undefined) return before;
    const g = fromSettings(ch, alt);
    built.set(key, g);
    return g;
  };
  const font: Font = {
    params, eff: e, m, free, freePending: !!fl && free?.id !== fl.want, freeMissing: freeFontsWanted(params).filter(id => !freeFont(id)),
    letter(ch) {
      const own = params.glyphs?.[ch];
      if (!own) return font;
      let f = letters.get(ch);
      if (!f) { const lp: Params = { ...params, ...own, glyphs: {} }; f = buildFont(at ? drawnFrom(lp, at) : lp); letters.set(ch, f); }
      return f;
    },
    glyph(ch, alt) {
      const key = alt ? ch + '\u0001' + alt : ch;
      let g = cache.get(key);
      if (g === undefined) { g = pickGlyph(ch, alt); cache.set(key, g); }
      return g;
    },
    hl(ch, key) {
      const id = ch + '\u0000' + key;
      let d = hlCache.get(id);
      if (d === undefined) {
        const g = font.glyph(ch);
        d = g ? highlightD(g, key, font.letter(ch).m) : '';
        hlCache.set(id, d);
      }
      return d;
    },
    advance(ch) {
      if (ch === ' ' || ch === '\u00a0') return m.space;
      const g = font.glyph(ch); return g ? g.adv : m.space * 1.4;
    },
    layout(text, maxWidth) {
      const lines: Line[] = [];
      for (const para of text.split('\n')) {
        let line: LineItem[] = [], x = 0, lastBreak = -1;
        const flush = (upto?: number) => {
          const items = upto == null ? line : line.slice(0, upto);
          while (items.length && items[items.length - 1].ch === ' ') items.pop();
          // a letter after one whose join leaves it high takes it up at that height, where it has a form for it
          items.forEach((it, i) => {
            const prev = items[i - 1], hi = !!prev && !!font.glyph(prev.ch)?.meta.exitHigh && font.glyph(it.ch, 'hi') !== font.glyph(it.ch);
            if (hi) it.alt = 'hi'; else delete it.alt;
          });
          const last = items[items.length - 1];
          lines.push({ items, width: last ? last.x + last.adv : 0 });
          const rest = upto == null ? [] : line.slice(upto + 1);
          const shift = rest.length ? rest[0].x : 0;
          rest.forEach(it => it.x -= shift);
          line = rest; x = rest.length ? rest[rest.length - 1].x + rest[rest.length - 1].adv + m.track : 0;
          lastBreak = -1;
        };
        for (const ch of para) {
          const adv = font.advance(ch);
          if (ch === ' ') lastBreak = line.length;
          line.push({ ch, x, adv });
          x += adv + m.track;
          if (ch !== ' ' && x - m.track > maxWidth && line.length > 1) {
            if (lastBreak >= 0) flush(lastBreak);
            else { const it = line.pop()!; flush(); it.x = 0; line = [it]; x = it.adv + m.track; }
          }
        }
        flush();
      }
      return lines;
    }
  };
  settingsGlyphs.set(font, built);
  return font;
}
