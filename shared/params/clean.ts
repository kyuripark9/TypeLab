/* Reading settings from outside (a saved design, an imported file, a request body). upgradeParams brings settings an
   older PARAMS_VERSION wrote up to this one; callers run it first (server/db.ts on opening the database, the file
   import in client/components/Header.tsx). sanitizeParams then reads the older shapes it recognises on its own (a
   separate `reverse`, the 'outline-inline' fill, a free font TypeLab's own fonts replaced), drops unknown keys and checks every value against its spec
   (spec.ts), numbers clamped to 0..1; isValidParams says whether input was already valid. */
import { cleanDrawn, type Drawn } from '../engine/outline';
import { ownFontOf, parseFontId } from '../free-fonts';
import type { Params } from './model';
import { GRID_FILLS } from './options';
import { contrastFromOld, dotGainFromOld, moduleFromOld, moduleFromV5, xHeightFromOld } from './scales';
import { DEFAULTS, DRAWN_AT_KEYS, FREE_AT_KEYS, ID_KEYS, PARAM_KEYS, SPECS, drawnAtOf, isGlyphKey, type DrawnAt, type FreeAt, type GlyphParams, type Spec } from './spec';
/** The version of the settings this build writes; settings files and the database record it. Version 1 settings have
    the Lowercase height on its first scale (see xHeightFromOld); version 2 settings built from blocks were built from
    slot blocks, the only ones there were; version 3 letters drawn in Points stood as drawn whatever the settings, and
    keep no settings they were drawn at (Drawn.at); version 4 grid fills had their Size on an even scale of 30 cells in
    the cap height to 7 (moduleFromOld), and dots their Spread from 0.3 of their size to 1.75 (dotGainFromOld); version 5
    grid fills had their Size from 40 cells to 5 (moduleFromV5); version 6 slot and grid blocks drew alike whatever
    Contrast, Inner space, Openness, the crossbars, the corners, Stencil and the letter forms said (BLOCK_LOOKS). Bump
    it, and add the step to upgradeParams, when saved settings need reading differently. */
export const PARAMS_VERSION = 7;
/** Settings written by an older version (see PARAMS_VERSION), as this one reads them. */
export function upgradeParams(src: Record<string, unknown>, version: number): Record<string, unknown> {
  if (version < 2 && typeof src.xHeight === 'number' && Number.isFinite(src.xHeight)) src = { ...src, xHeight: xHeightFromOld(Math.min(1, Math.max(0, src.xHeight))) };
  // a design (or one of its letters) built from blocks before there were basic ones keeps its slot blocks
  if (version < 3 && src.blockForm === undefined && usesBlocks(src)) src = { ...src, blockForm: 'slots' };
  // a letter drawn in Points is taken as drawn at the settings its design has, at which it stands as it did, and moves
  // from there as they move
  if (version < 4) src = drawnAtDesign(src);
  // a grid fill keeps its cells, and the dot fill its dots, as big as they were drawn (a drawing's settings too)
  if (version < 6) src = gridScales(src, version);
  // slot and grid blocks keep the shapes they had, the settings they now follow read at their defaults
  if (version < 7) src = blockLooks(src);
  return src;
}
/** The settings slot and grid blocks follow since version 7, which they drew alike whatever they said before. */
const BLOCK_LOOKS: Record<'slots' | 'grid', readonly string[]> = {
  slots: ['contrast', 'counter', 'aperture', 'crossbar', 'innerRound', 'chamfer', 'steps', 'joints', 'stencil', 'stencilPos', 'stencilRound',
    'iForm', 'jForm', 'mForm', 'qForm', 'dots', 'dotSize'],
  grid: ['contrast', 'vWeight', 'hWeight', 'joinRound', 'innerRound', 'chamfer', 'steps', 'joints', 'stencil', 'stencilPos', 'stencilRound',
    'story', 'kForm', 'iForm', 'jForm', 'mForm', 'qForm', 'rForm', 'yForm', 'sForm', 'dots', 'dotSize']
};
/** Settings `src` with BLOCK_LOOKS taken out wherever slot or grid blocks draw: the design's (and its drawn letters'
    settings) when it is built from them, and any letter's own values where that letter is. A character those letters
    have no shape for is drawn in strokes, and follows the defaults from then on. */
function blockLooks(src: Record<string, unknown>): Record<string, unknown> {
  const plain = (d: unknown): d is Record<string, unknown> => !!d && typeof d === 'object' && !Array.isArray(d);
  const formOf = (p: Record<string, unknown>, from?: Record<string, unknown>) => {
    const build = p.build ?? from?.build, form = p.blockForm ?? from?.blockForm;
    return build === 'blocks' && (form === 'slots' || form === 'grid') ? form : null;
  };
  const without = (p: Record<string, unknown>, form: 'slots' | 'grid' | null) =>
    form ? Object.fromEntries(Object.entries(p).filter(([k]) => !BLOCK_LOOKS[form].includes(k))) : p;
  const form = formOf(src), out = without(src, form);
  if (plain(src.glyphs)) out.glyphs = Object.fromEntries(Object.entries(src.glyphs).map(([ch, g]) => [ch, plain(g) ? without(g, formOf(g, src)) : g]));
  if (plain(src.outlines)) out.outlines = Object.fromEntries(Object.entries(src.outlines).map(([ch, d]) =>
    [ch, plain(d) && plain(d.at) ? { ...d, at: without(d.at, formOf(d.at, src)) } : d]));
  return out;
}
/** Settings `src`, written at `version`, with a grid fill's Size and the dot fill's Spread on today's scales; each drawn
    letter's settings (Drawn.at) likewise. */
function gridScales(src: Record<string, unknown>, version: number): Record<string, unknown> {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v), in01 = (v: number) => Math.min(1, Math.max(0, v));
  const one = (p: Record<string, unknown>) => {
    if (!(GRID_FILLS as readonly unknown[]).includes(p.fill)) return p;
    const out = { ...p };
    if (num(p.module)) out.module = (version < 5 ? moduleFromOld : moduleFromV5)(in01(p.module));
    if (version < 5 && p.fill === 'dots' && num(p.dotGain)) out.dotGain = dotGainFromOld(in01(p.dotGain));
    return out;
  };
  const o = src.outlines, plain = (d: unknown): d is Record<string, unknown> => !!d && typeof d === 'object' && !Array.isArray(d);
  const outlines = plain(o) ? Object.fromEntries(Object.entries(o).map(([ch, d]) => [ch, plain(d) && plain(d.at) ? { ...d, at: one(d.at) } : d])) : o;
  return { ...one(src), ...(plain(o) ? { outlines } : {}) };
}
const usesBlocks = (src: Record<string, unknown>) => src.build === 'blocks' || (!!src.glyphs && typeof src.glyphs === 'object'
  && Object.values(src.glyphs as Record<string, unknown>).some(g => !!g && typeof g === 'object' && (g as { build?: unknown }).build === 'blocks'));
/** Each drawn letter that keeps no settings it was drawn at, with the settings its design draws it at (read as
    sanitizeParams reads them, an older contrast and all). */
function drawnAtDesign(src: Record<string, unknown>): Record<string, unknown> {
  const o = src.outlines;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return src;
  const p = sanitizeParams(src), plain = (d: unknown) => !!d && typeof d === 'object' && !Array.isArray(d);
  const outlines = Object.fromEntries(Object.entries(o).map(([ch, d]) => [ch, plain(d) && !('at' in (d as object)) ? { ...(d as object), at: drawnAtOf(p, ch) } : d]));
  return { ...src, outlines };
}

/** A valid value for setting `k` (as its spec in spec.ts says), or undefined. Numbers are clamped to 0..1. */
function cleanValue(k: keyof Params, v: unknown): unknown {
  const spec: Spec<unknown> = SPECS[k];
  switch (spec.kind) {
    case 'number': return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;
    case 'boolean': return typeof v === 'boolean' ? v : undefined;
    // a design written in one of the Google fonts TypeLab's own took the place of is read as written in its own
    case 'font': return v === '' || parseFontId(v) ? v : typeof v === 'string' ? ownFontOf(v) ?? undefined : undefined;
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

/** Drawn letters: one character per key, each a valid outline, with the settings it was drawn at where it keeps them. */
function cleanOutlines(v: unknown): Record<string, Drawn> {
  const out: Record<string, Drawn> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [ch, d] of Object.entries(v)) {
    const c = [...ch].length === 1 ? cleanDrawn(d) : undefined;
    if (!c) continue;
    const at = cleanAt((d as { at?: unknown }).at);
    out[ch] = at ? { ...c, at } : c;
  }
  return out;
}

/** The settings a drawing was drawn at: each a valid value of its setting; one left out stands at its default. */
function cleanAt(v: unknown): DrawnAt | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of DRAWN_AT_KEYS) {
    const c = k in v ? cleanValue(k, (v as Record<string, unknown>)[k]) : undefined;
    if (c !== undefined) out[k] = c;
  }
  return out as DrawnAt;
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

/** Settings taken out of TypeLab that older designs still carry, at the top, in freeAt and in a letter's own: sanitizeParams
    drops them (it reads only PARAM_KEYS), and isValidParams reads a design without them rather than refusing it (a page
    opened before they went saves them still). Letterforms (scriptForm) and Swell (swell), 2026-10-15: every design is
    written in its font's own letters, script or print, and the engine writes no script of its own. */
const RETIRED = ['scriptForm', 'swell'];
const withoutRetired = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).filter(([k]) => !RETIRED.includes(k))) : v);

/** True when `input` is already fully valid (used by the API to reject bad bodies loudly). */
export function isValidParams(input: unknown): input is Params {
  if (!input || typeof input !== 'object') return false;
  const given = input as Record<string, unknown>, glyphs = given.glyphs;
  const src: Record<string, unknown> = { ...given, freeAt: withoutRetired(given.freeAt),
    glyphs: glyphs && typeof glyphs === 'object' && !Array.isArray(glyphs) ? Object.fromEntries(Object.entries(glyphs).map(([ch, g]) => [ch, withoutRetired(g)])) : glyphs };
  if (!('freeAt' in given)) delete src.freeAt;
  if (!('glyphs' in given)) delete src.glyphs;
  const clean = sanitizeParams(input) as unknown as Record<string, unknown>;
  // (an older design's freeAt may leave out free settings: sanitizeParams fills them in, so compare only the ones the input names)
  const fill = (k: keyof Params, v: unknown) => k === 'freeAt' && src.freeAt && typeof src.freeAt === 'object'
    ? Object.fromEntries(Object.entries(v as object).filter(([a]) => a in (src.freeAt as object))) : v;
  return PARAM_KEYS.every(k => typeof clean[k] === 'object' ? sorted(src[k]) === sorted(fill(k, clean[k])) : src[k] === clean[k]);
}

/** JSON with every object's keys in order, so the same settings written in another order compare equal. */
const sorted = (v: unknown): string => JSON.stringify(v, (_, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);

