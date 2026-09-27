/* The design parameters a user edits. Every number is 0..1; the engine maps them to geometry. */

export const TERMINALS = ['flat', 'round', 'sharp', 'angled', 'cut', 'tapered'] as const;
export const SERIF_SHAPES = ['bracketed', 'unbracketed', 'slab', 'wedge'] as const;
/** What the letters are built from: solid ink, a wireframe of every stroke, or a grid of pixels, dots or lines. */
export const FILLS = ['solid', 'wire', 'pixels', 'dots', 'lines'] as const;
/** The lowercase a: two storeys (bowl under a hook) or one (just a bowl). 'auto' lets the personality and cursive settings pick. */
export const STORIES = ['auto', 'double', 'single'] as const;
export type Terminal = (typeof TERMINALS)[number];
export type SerifShape = (typeof SERIF_SHAPES)[number];
export type Fill = (typeof FILLS)[number];
export type Story = (typeof STORIES)[number];

export interface Params {
  weight: number; width: number; height: number; slant: number; contrast: number;
  xHeight: number; counter: number; aperture: number; crossbar: number;
  roundness: number; curve: number; apex: number; terminal: Terminal;
  /** how far stroke ends reach: 0.5 is the usual length, lower trims them back, higher draws them on */ terminalLength: number;
  /** one letter's ends set one by one, by end id (see isEndId): each overrides terminalLength for that end */ terminalEnds: Record<string, number>;
  /** how one letter's ends bend, by end id: 0.5 as drawn, lower straightens them and then flares
      them out, higher curls them on round the way they turn */ terminalCurls: Record<string, number>;
  /** hand-drawn irregularity */ wobble: number;
  /** entry/exit strokes, looped descenders and italic letterforms */ cursive: number;
  /** round curves drawn as squircles */ squareness: number;
  /** curves replaced by straight, cut-off corners (octagonal) */ chamfer: number;
  /** strokes thin out where they join another stroke */ joints: number;
  /** thick horizontals and thin verticals */ reverse: number;
  /** length of ascenders and descenders */ extenders: number;
  /** double- or single-storey a */ story: Story;
  /** how far a bowl sinks into its stem (b d p q): 1 branches out of it, 0 is a whole o beside it */ overlap: number;
  /** length of tails and hooks (Q y j g t f, the comma, cursive exits): 0.5 is the usual length */ tail: number;
  fill: Fill;
  /** size of the pixels, dots or lines, or the wireframe's line weight */ module: number;
  /** gaps where strokes meet, like a stencil */ stencil: number;
  /** a horizontal cut through every letter */ slice: number;
  serif: boolean; serifSize: number; serifThickness: number; serifShape: SerifShape; serifAngle: number;
  letterSpacing: number; wordSpacing: number; sideBearing: number;
  /** blend toward one fixed advance width for every glyph */ mono: number;
  geoHuman: number; softSharp: number; classicFuture: number; playfulFormal: number;
  /** letters customized on their own: each overrides some of the settings above, by character */ glyphs: Record<string, GlyphParams>;
}

/** Settings every letter shares. The heights are the lines all letters stand on, spacing and the
    fills and slice run across a whole line, and the personality macros push the heights too. */
export const GLOBAL_KEYS = ['height', 'xHeight', 'extenders', 'letterSpacing', 'wordSpacing', 'mono', 'fill', 'module', 'slice',
  'geoHuman', 'softSharp', 'classicFuture', 'playfulFormal', 'glyphs'] as const;
/** A setting one letter can have its own value of. */
export type GlyphKey = Exclude<keyof Params, (typeof GLOBAL_KEYS)[number]>;
export type GlyphParams = Partial<Pick<Params, GlyphKey>>;
export const isGlyphKey = (k: string): k is GlyphKey => k in DEFAULTS && !(GLOBAL_KEYS as readonly string[]).includes(k);

export type NumericParam = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params];

export const DEFAULTS: Readonly<Params> = Object.freeze({
  weight: 0.4, width: 0.5, height: 0.5, slant: 0, contrast: 0.05,
  xHeight: 0.5, counter: 0.5, aperture: 0.5, crossbar: 0.5,
  roundness: 0, curve: 0.2, apex: 0.4, terminal: 'flat', terminalLength: 0.5, terminalEnds: Object.freeze({}), terminalCurls: Object.freeze({}), wobble: 0, cursive: 0,
  squareness: 0, chamfer: 0, joints: 0, reverse: 0, extenders: 0.5, story: 'auto', overlap: 1, tail: 0.5,
  fill: 'solid', module: 0.4, stencil: 0, slice: 0,
  serif: false, serifSize: 0.45, serifThickness: 0.35, serifShape: 'bracketed', serifAngle: 0.2,
  letterSpacing: 0.2, wordSpacing: 0.35, sideBearing: 0.5, mono: 0,
  geoHuman: 0.5, softSharp: 0.5, classicFuture: 0.5, playfulFormal: 0.5, glyphs: Object.freeze({})
});

const PARAM_KEYS = Object.keys(DEFAULTS) as (keyof Params)[];

/** A stroke end's id: the index of its stroke in the glyph, then 's' for its start or 'e' for its end. */
export const isEndId = (id: string) => /^\d{1,2}[se]$/.test(id);
/** How far past its usual length an end reaches, in x-heights (negative trims), at `v` on an end's
    own length scale. The letter's Length spans the lower three quarters of it, an eighth of an
    x-height either way; the last quarter draws one end on as far as a whole x-height. */
export function endReach(v: number) {
  const t = (v - 0.5) * 2;
  return t <= 0 ? 0.12 * t : 0.12 * t + 0.88 * t ** 4;
}
/** The stroke end length on an end's own scale: the value there that reaches as far. */
export function onEndScale(len: number) {
  const want = (len - 0.5) * 0.24;
  if (want <= 0) return len;
  let lo = 0.5, hi = 1;
  for (let i = 0; i < 30; i++) { const v = (lo + hi) / 2; if (endReach(v) < want) lo = v; else hi = v; }
  return (lo + hi) / 2;
}
/** How far one stroke end reaches, on its own scale (see endReach): its own length, else the
    stroke end length, except that the tip of a hook, tail or cursive stroke follows its own
    control instead and sits at the usual length (0.5). */
export const endLength = (p: Pick<Params, 'terminalLength'> & { terminalEnds?: Record<string, number> }, id: string, hook = false) =>
  p.terminalEnds?.[id] ?? (hook ? 0.5 : onEndScale(p.terminalLength));
/** How one stroke end bends (see terminalCurls): 0.5, as drawn, unless it has a curl of its own. */
export const endCurl = (p: { terminalCurls?: Record<string, number> }, id: string) => p.terminalCurls?.[id] ?? 0.5;

/** A valid value for setting `k`, or undefined. Numbers are clamped to 0..1. */
function cleanValue(k: keyof Params, v: unknown): unknown {
  const d = DEFAULTS[k];
  if (k === 'terminalEnds' || k === 'terminalCurls') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    const out: Record<string, number> = {};
    for (const [id, x] of Object.entries(v)) if (isEndId(id) && typeof x === 'number' && Number.isFinite(x)) out[id] = Math.min(1, Math.max(0, x));
    return out;
  }
  if (typeof d === 'number') return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;
  if (typeof d === 'boolean') return typeof v === 'boolean' ? v : undefined;
  const opts: Partial<Record<keyof Params, readonly unknown[]>> = { terminal: TERMINALS, serifShape: SERIF_SHAPES, fill: FILLS, story: STORIES };
  return opts[k]?.includes(v) ? v : undefined;
}

/** Per-letter overrides: one character per key, only settings a letter can own, no empty entries. */
function cleanGlyphs(v: unknown): Record<string, GlyphParams> {
  const out: Record<string, GlyphParams> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [ch, ov] of Object.entries(v)) {
    if ([...ch].length !== 1 || !ov || typeof ov !== 'object') continue;
    const g: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(ov)) {
      const c = isGlyphKey(k) ? cleanValue(k, x) : undefined;
      if (c !== undefined) g[k] = c;
    }
    for (const e of ['terminalEnds', 'terminalCurls']) if (g[e] && !Object.keys(g[e] as object).length) delete g[e];
    if (Object.keys(g).length) out[ch] = g as GlyphParams;
  }
  return out;
}

/**
 * Turn untrusted input (an imported file, a request body) into valid Params.
 * Unknown keys are dropped, missing or invalid values fall back to the defaults and
 * numbers are clamped to 0..1, so the engine never sees NaN or an unknown option.
 */
export function sanitizeParams(input: unknown): Params {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const k of PARAM_KEYS) {
    const c = k === 'glyphs' ? cleanGlyphs(src[k]) : cleanValue(k, src[k]);
    if (c !== undefined) out[k] = c;
  }
  return out as unknown as Params;
}

/** True when `input` is already fully valid (used by the API to reject bad bodies loudly). */
export function isValidParams(input: unknown): input is Params {
  if (!input || typeof input !== 'object') return false;
  const src = input as Record<string, unknown>;
  const clean = sanitizeParams(input) as unknown as Record<string, unknown>;
  return PARAM_KEYS.every(k => typeof clean[k] === 'object' ? JSON.stringify(src[k]) === JSON.stringify(clean[k]) : src[k] === clean[k]);
}
