/* The design parameters a user edits. Every number is 0..1; the engine maps them to geometry. */

export const TERMINALS = ['flat', 'round', 'sharp', 'angled', 'cut', 'tapered'] as const;
export const SERIF_SHAPES = ['bracketed', 'unbracketed', 'slab', 'wedge'] as const;
export type Terminal = (typeof TERMINALS)[number];
export type SerifShape = (typeof SERIF_SHAPES)[number];

export interface Params {
  weight: number; width: number; height: number; slant: number; contrast: number;
  xHeight: number; counter: number; aperture: number; crossbar: number;
  roundness: number; curve: number; apex: number; terminal: Terminal;
  /** hand-drawn irregularity */ wobble: number;
  /** entry/exit strokes, looped descenders and italic letterforms */ cursive: number;
  serif: boolean; serifSize: number; serifThickness: number; serifShape: SerifShape; serifAngle: number;
  letterSpacing: number; wordSpacing: number; sideBearing: number;
  /** blend toward one fixed advance width for every glyph */ mono: number;
  geoHuman: number; softSharp: number; classicFuture: number; playfulFormal: number;
}

export type NumericParam = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params];

export const DEFAULTS: Readonly<Params> = Object.freeze({
  weight: 0.4, width: 0.5, height: 0.5, slant: 0, contrast: 0.05,
  xHeight: 0.5, counter: 0.5, aperture: 0.5, crossbar: 0.5,
  roundness: 0, curve: 0.2, apex: 0.4, terminal: 'flat', wobble: 0, cursive: 0,
  serif: false, serifSize: 0.45, serifThickness: 0.35, serifShape: 'bracketed', serifAngle: 0.2,
  letterSpacing: 0.2, wordSpacing: 0.35, sideBearing: 0.5, mono: 0,
  geoHuman: 0.5, softSharp: 0.5, classicFuture: 0.5, playfulFormal: 0.5
});

const PARAM_KEYS = Object.keys(DEFAULTS) as (keyof Params)[];

/**
 * Turn untrusted input (an imported file, a request body) into valid Params.
 * Unknown keys are dropped, missing or invalid values fall back to the defaults and
 * numbers are clamped to 0..1, so the engine never sees NaN or an unknown option.
 */
export function sanitizeParams(input: unknown): Params {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const k of PARAM_KEYS) {
    const v = src[k], d = DEFAULTS[k];
    if (typeof d === 'number') { if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(1, Math.max(0, v)); }
    else if (typeof d === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
    else if (k === 'terminal') { if ((TERMINALS as readonly unknown[]).includes(v)) out[k] = v; }
    else if (k === 'serifShape') { if ((SERIF_SHAPES as readonly unknown[]).includes(v)) out[k] = v; }
  }
  return out as unknown as Params;
}

/** True when `input` is already fully valid (used by the API to reject bad bodies loudly). */
export function isValidParams(input: unknown): input is Params {
  if (!input || typeof input !== 'object') return false;
  const src = input as Record<string, unknown>;
  const clean = sanitizeParams(input) as unknown as Record<string, unknown>;
  return PARAM_KEYS.every(k => src[k] === clean[k]);
}
