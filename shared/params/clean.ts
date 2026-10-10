/* Reading settings from outside (a saved design, an imported file, a request body). upgradeParams brings settings an
   older PARAMS_VERSION wrote up to this one; callers run it first (server/db.ts on opening the database, the file
   import in client/components/Header.tsx). sanitizeParams then reads the older shapes it recognises on its own (a
   separate `reverse`, the 'outline-inline' fill), drops unknown keys and checks every value against its spec
   (spec.ts), numbers clamped to 0..1; isValidParams says whether input was already valid. */
import { cleanDrawn, type Drawn } from '../engine/outline';
import { parseFontId } from '../free-fonts';
import type { Params } from './model';
import { contrastFromOld, xHeightFromOld } from './scales';
import { DEFAULTS, FREE_AT_KEYS, ID_KEYS, PARAM_KEYS, SPECS, isGlyphKey, type FreeAt, type GlyphParams, type Spec } from './spec';
/** The version of the settings this build writes; settings files and the database record it. Version 1 settings have
    the Lowercase height on its first scale (see xHeightFromOld). Bump it, and add the step to upgradeParams, when
    saved settings need reading differently. */
export const PARAMS_VERSION = 2;
/** Settings written by an older version (see PARAMS_VERSION), as this one reads them. */
export function upgradeParams(src: Record<string, unknown>, version: number): Record<string, unknown> {
  if (version < 2 && typeof src.xHeight === 'number' && Number.isFinite(src.xHeight)) src = { ...src, xHeight: xHeightFromOld(Math.min(1, Math.max(0, src.xHeight))) };
  return src;
}

/** A valid value for setting `k` (as its spec in spec.ts says), or undefined. Numbers are clamped to 0..1. */
function cleanValue(k: keyof Params, v: unknown): unknown {
  const spec: Spec<unknown> = SPECS[k];
  switch (spec.kind) {
    case 'number': return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;
    case 'boolean': return typeof v === 'boolean' ? v : undefined;
    case 'font': return v === '' || parseFontId(v) ? v : undefined;
    case 'option':
      // older designs may carry 'outline-inline' (the Outline fill with an inline cut down its strokes too), read as Outline
      if (k === 'fill' && v === 'outline-inline') return 'outline';
      return spec.options!.includes(v) ? v : undefined;
    case 'ids': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
      const out: Record<string, number> = {};
      for (const [id, x] of Object.entries(v)) if (spec.ids!(id) && typeof x === 'number' && Number.isFinite(x)) out[id] = Math.min(1, Math.max(0, x));
      return out;
    }
    case 'value': {
      if (k !== 'freeAt' || !v || typeof v !== 'object' || Array.isArray(v)) return undefined;
      const out: Record<string, unknown> = {};
      for (const a of FREE_AT_KEYS) { const c = a in v ? cleanValue(a, (v as Record<string, unknown>)[a]) : undefined; if (c !== undefined) out[a] = c; }
      return out;
    }
  }
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
    for (const e of ID_KEYS) if (g[e] && !Object.keys(g[e] as object).length) delete g[e];
    if (Object.keys(g).length) out[ch] = g as GlyphParams;
  }
  return out;
}

/** Drawn letters: one character per key, each a valid outline. */
function cleanOutlines(v: unknown): Record<string, Drawn> {
  const out: Record<string, Drawn> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [ch, d] of Object.entries(v)) {
    const c = [...ch].length === 1 ? cleanDrawn(d) : undefined;
    if (c) out[ch] = c;
  }
  return out;
}

/** Older settings that carry a separate `reverse` (from a Reverse contrast slider of its own), with their
    contrasts, the font's and each letter's own, moved onto the two-way Contrast scale. */
function fromOldContrast(src: Record<string, unknown>): Record<string, unknown> {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const base = num(src.contrast) ?? 0.05, rev = num(src.reverse)!;
  // a letter with only its own reverse takes the font's contrast amount
  const move = (o: Record<string, unknown>) => {
    const c = num(o.contrast), r = num(o.reverse);
    const { reverse: _, ...rest } = o;
    return c === undefined && r === undefined ? rest : { ...rest, contrast: contrastFromOld(c ?? base, r ?? rev) };
  };
  const out = move(src);
  const g = src.glyphs;
  if (g && typeof g === 'object' && !Array.isArray(g))
    out.glyphs = Object.fromEntries(Object.entries(g).map(([ch, ov]) => [ch, ov && typeof ov === 'object' ? move(ov as Record<string, unknown>) : ov]));
  return out;
}

/**
 * Turn untrusted input (an imported file, a request body) into valid Params.
 * Unknown keys are dropped, missing or invalid values fall back to the defaults and
 * numbers are clamped to 0..1, so the engine never sees NaN or an unknown option.
 */
export function sanitizeParams(input: unknown): Params {
  let src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (typeof src.reverse === 'number') src = fromOldContrast(src);
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const k of PARAM_KEYS) {
    const c = k === 'glyphs' ? cleanGlyphs(src[k]) : k === 'outlines' ? cleanOutlines(src[k]) : cleanValue(k, src[k]);
    if (c !== undefined) out[k] = c;
  }
  // a free font's letters stand for the settings it was picked at (freeAt). A free setting freeAt leaves out (an older
  // design's font didn't follow it) is taken at the design's own value, so it doesn't move the font's letters
  if (out.freeFont) {
    const at = { ...(out.freeAt as FreeAt) } as Record<string, unknown>;
    for (const k of FREE_AT_KEYS) if (!(k in at)) at[k] = out[k];
    out.freeAt = at;
  }
  return out as unknown as Params;
}

/** True when `input` is already fully valid (used by the API to reject bad bodies loudly). */
export function isValidParams(input: unknown): input is Params {
  if (!input || typeof input !== 'object') return false;
  const src = input as Record<string, unknown>;
  const clean = sanitizeParams(input) as unknown as Record<string, unknown>;
  // (an older design's freeAt may leave out free settings: sanitizeParams fills them in, so compare only the ones the input names)
  const fill = (k: keyof Params, v: unknown) => k === 'freeAt' && src.freeAt && typeof src.freeAt === 'object'
    ? Object.fromEntries(Object.entries(v as object).filter(([a]) => a in (src.freeAt as object))) : v;
  return PARAM_KEYS.every(k => typeof clean[k] === 'object' ? sorted(src[k]) === sorted(fill(k, clean[k])) : src[k] === clean[k]);
}

/** JSON with every object's keys in order, so the same settings written in another order compare equal. */
const sorted = (v: unknown): string => JSON.stringify(v, (_, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);

