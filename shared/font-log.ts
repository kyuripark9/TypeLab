/* The font's History: the whole design (its style and its settings, every letter's own settings and drawings with
   them) after each change, whatever made it (a setting for every letter, a letter on its own, a style picked, a
   design file opened), so any version can be brought back later. Each letter keeps a record of its own too
   (letter-log.ts); this one is the design's. It is kept with the design beside its settings, never in them. Saved and
   in design files it is packed: each version holds only what changed from the one before it (packVersions), and
   cleanVersions plays them back, checking each as sanitizeParams checks settings. */
import { STYLES, styleById } from './content';
import type { Drawn } from './engine/outline';
import { DRAWN_AT_KEYS, PARAM_KEYS, sanitizeParams, upgradeParams, type GlyphParams, type Params } from './params';

/** The design after one change, and what the change was. */
export interface FontVersion {
  /** when, in ms since 1970 */ t: number;
  /** the settings for every letter it changed, in the editor's order; none where the History notes how the design
      stood before a change (see recordVersion) */ keys: string[];
  /** the letters whose own settings or drawing it changed */ letters: string[];
  /** what made it, where not the settings themselves: a style picked, traits laid over it, a design file opened */ made?: Made;
  /** it brought back the version (or a letter's edit, see letter-log.ts) made at this time */ back?: number;
  /** the style the design was then based on */ styleId: string;
  /** the design's settings then, every letter's own and drawn ones in them */ params: Params;
}
export type Made = 'style' | 'traits' | 'file';
const MADE: Made[] = ['style', 'traits', 'file'];
/** The font's versions, oldest first. */
export type FontLog = FontVersion[];

/** The most versions kept; the oldest go first. */
export const VERSIONS_KEEP = 200;
/** The most the versions may take as JSON, packed, give or take; the oldest go first. */
export const VERSIONS_BYTES = 1_500_000;

/** A version as the editor's undo history writes a design (`[styleId, params]` as JSON), to tell two versions apart:
    worked out once, or handed over by the editor, which has it already. */
const keys = new WeakMap<FontVersion, string>();
export const keyOf = (v: FontVersion) => {
  let k = keys.get(v);
  if (k === undefined) { k = JSON.stringify([v.styleId, v.params]); keys.set(v, k); }
  return k;
};
/** A design as the editor's undo history has it: its style, its settings and their JSON. */
export interface Snapshot { styleId: string; params: Params; key: string }
const version = (v: FontVersion, key: string) => { keys.set(v, key); return v; };
/** Whether version `v` is the design `d`: written alike, or the same settings written in another order (a version read
    back from a save against the design read back beside it). */
export function sameDesign(v: FontVersion, d: Snapshot): boolean {
  if (keyOf(v) === d.key) return true;
  if (v.styleId !== d.styleId) return false;
  const a = v.params, b = d.params;
  if (DRAWN_AT_KEYS.some(k => a[k] !== b[k] && sorted(a[k]) !== sorted(b[k]))) return false;
  const chars = new Set([...Object.keys(a.glyphs), ...Object.keys(b.glyphs), ...Object.keys(a.outlines), ...Object.keys(b.outlines)]);
  return ![...chars].some(ch => differs(a.glyphs[ch], b.glyphs[ch]) || differs(a.outlines[ch], b.outlines[ch]));
}

/** The settings for every letter, and the letters, that differ from `a` to `b`. */
export function changesOf(a: Params, b: Params): { keys: string[]; letters: string[] } {
  const changed: string[] = DRAWN_AT_KEYS.filter(k => a[k] !== b[k] && sorted(a[k]) !== sorted(b[k]));
  const chars = new Set([...Object.keys(a.glyphs), ...Object.keys(b.glyphs), ...Object.keys(a.outlines), ...Object.keys(b.outlines)]);
  const letters = [...chars].filter(ch => differs(a.glyphs[ch], b.glyphs[ch]) || differs(a.outlines[ch], b.outlines[ch])).sort();
  return { keys: changed, letters };
}
function differs(x: unknown, y: unknown) { return x !== y && sorted(x) !== sorted(y); }

/** `log` with the design as it stands `after` a change from `before` (the same `log` where nothing changed). Where
    the History doesn't end as the design stood before (none yet, or a change undone since), it first notes how it
    stood then, so that can be brought back too. With `fold`, the time of the newest undo step taking more in (the
    editor's amend), that step's version takes this change in, rather than another following it. */
export function recordVersion(log: FontLog, before: Snapshot, after: Snapshot, how: { t: number; made?: Made; back?: number; fold?: number }): FontLog {
  const { keys: changed, letters } = changesOf(before.params, after.params);
  if (!changed.length && !letters.length && before.styleId === after.styleId) return log;
  const last = log[log.length - 1] as FontVersion | undefined;
  if (last && last.t === how.fold) {
    const v: FontVersion = { ...last, keys: PARAM_KEYS.filter(k => last.keys.includes(k) || changed.includes(k)), letters: [...new Set([...last.letters, ...letters])].sort(), styleId: after.styleId, params: after.params };
    return trimVersions([...log.slice(0, -1), version(v, after.key)]);
  }
  const was = last && sameDesign(last, before) ? [] : [version({ t: how.t, keys: [], letters: [], styleId: before.styleId, params: before.params }, before.key)];
  const v: FontVersion = { t: how.t, keys: changed, letters, ...(how.made ? { made: how.made } : {}), ...(how.back !== undefined ? { back: how.back } : {}), styleId: after.styleId, params: after.params };
  return trimVersions([...log, ...was, version(v, after.key)]);
}

/** A version packed: what changed from the one before it (a letter's own settings or drawing null where it has none
    any more), or with `base`, the whole design. */
export interface Packed {
  t: number; keys: string[]; letters: string[]; made?: Made; back?: number; base?: true;
  styleId?: string; set?: Record<string, unknown>; glyphs?: Record<string, GlyphParams | null>; outlines?: Record<string, Drawn | null>;
}
const top = (p: Params) => Object.fromEntries(DRAWN_AT_KEYS.map(k => [k, p[k]]));
/** Version `v` packed against `prev`, the version before it, or whole without one. */
function packOne(v: FontVersion, prev?: FontVersion): Packed {
  const head = { t: v.t, keys: v.keys, letters: v.letters, ...(v.made ? { made: v.made } : {}), ...(v.back !== undefined ? { back: v.back } : {}) };
  if (!prev) return { ...head, base: true, styleId: v.styleId, set: top(v.params), glyphs: v.params.glyphs, outlines: v.params.outlines };
  const a = prev.params, b = v.params, { keys: changed } = changesOf(a, b);
  const of = <T,>(x: Record<string, T>, y: Record<string, T>) => {
    const out: Record<string, T | null> = {};
    for (const ch of new Set([...Object.keys(x), ...Object.keys(y)])) if (differs(x[ch], y[ch])) out[ch] = y[ch] ?? null;
    return out;
  };
  const glyphs = of(a.glyphs, b.glyphs), outlines = of(a.outlines, b.outlines);
  return {
    ...head, ...(prev.styleId !== v.styleId ? { styleId: v.styleId } : {}),
    ...(changed.length ? { set: Object.fromEntries(changed.map(k => [k, b[k as keyof Params]])) } : {}),
    ...(Object.keys(glyphs).length ? { glyphs } : {}), ...(Object.keys(outlines).length ? { outlines } : {})
  };
}
/** `log` as it is saved: the first version whole, each after it only what changed from the one before. */
export const packVersions = (log: FontLog): Packed[] => log.map((v, i) => packOne(v, log[i - 1]));

/** Each version's packed size against the version before it, worked out once. */
const sizes = new WeakMap<FontVersion, [FontVersion | undefined, number]>();
function sizeOf(v: FontVersion, prev?: FontVersion) {
  const got = sizes.get(v);
  if (got && got[0] === prev) return got[1];
  const n = JSON.stringify(packOne(v, prev)).length;
  sizes.set(v, [prev, n]);
  return n;
}
/** `log` within VERSIONS_KEEP and VERSIONS_BYTES, the oldest versions dropped till it fits. */
function trimVersions(log: FontLog): FontLog {
  let out = log.length > VERSIONS_KEEP ? log.slice(-VERSIONS_KEEP) : log;
  const total = () => out.reduce((n, v, i) => n + sizeOf(v, out[i - 1]), 0);
  while (out.length > 1 && total() > VERSIONS_BYTES) out = out.slice(1);
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Packed versions played back as they were written, each a whole design, nothing checked yet. */
function unpacked(input: unknown[]): { e: Record<string, unknown>; styleId: unknown; raw: Record<string, unknown>; glyphs: Record<string, unknown>; outlines: Record<string, unknown> }[] {
  let raw: Record<string, unknown> = {}, glyphs: Record<string, unknown> = {}, outlines: Record<string, unknown> = {}, styleId: unknown;
  const out = [];
  for (const e of input) {
    if (!isObj(e)) continue;
    const whole = e.base === true;
    raw = { ...(whole ? {} : raw), ...(isObj(e.set) ? e.set : {}) };
    const lay = (now: Record<string, unknown>, d: unknown) => {
      const next = whole ? {} : { ...now };
      if (isObj(d)) for (const [ch, x] of Object.entries(d)) { if (x === null) delete next[ch]; else next[ch] = x; }
      return next;
    };
    glyphs = lay(glyphs, e.glyphs);
    outlines = lay(outlines, e.outlines);
    if (e.styleId !== undefined) styleId = e.styleId;
    out.push({ e, styleId, raw, glyphs, outlines });
  }
  return out;
}

/** Versions read from outside (a saved design, a design file, a request body), packed: played back, each design's
    settings checked as sanitizeParams checks them (a letter's own settings and drawing once, where they change, so
    the versions after share them), a style no longer known taken as the one before it; what doesn't read is dropped,
    and the History kept within VERSIONS_KEEP and VERSIONS_BYTES. */
export function cleanVersions(input: unknown): FontLog {
  if (!Array.isArray(input)) return [];
  const out: FontLog = [];
  const letters = { glyphs: new Map<unknown, GlyphParams | undefined>(), outlines: new Map<unknown, Drawn | undefined>() };
  /** a letter's own settings or drawing as written, checked once */
  const clean = <K extends 'glyphs' | 'outlines'>(k: K, ch: string, x: unknown): Params[K][string] | undefined => {
    const seen = letters[k] as Map<unknown, Params[K][string] | undefined>;
    if (!seen.has(x)) seen.set(x, sanitizeParams({ [k]: { [ch]: x } })[k][ch] as Params[K][string] | undefined);
    return seen.get(x);
  };
  let style = '';
  for (const { e, styleId, raw, glyphs, outlines } of unpacked(input)) {
    style = typeof styleId === 'string' && styleById(styleId) ? styleId : style || STYLES[0].id;
    if (typeof e.t !== 'number' || !Number.isFinite(e.t)) continue;
    const p = sanitizeParams({ ...raw, glyphs: {}, outlines: {} });
    const own = <K extends 'glyphs' | 'outlines'>(k: K, m: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(m).flatMap(([ch, x]) => { const c = [...ch].length === 1 ? clean(k, ch, x) : undefined; return c ? [[ch, c]] : []; }));
    out.push({
      t: e.t,
      keys: Array.isArray(e.keys) ? PARAM_KEYS.filter(k => k !== 'glyphs' && k !== 'outlines' && (e.keys as unknown[]).includes(k)) : [],
      letters: Array.isArray(e.letters) ? [...new Set(e.letters.filter((ch): ch is string => typeof ch === 'string' && [...ch].length === 1))].sort() : [],
      ...(MADE.includes(e.made as Made) ? { made: e.made as Made } : {}),
      ...(typeof e.back === 'number' && Number.isFinite(e.back) ? { back: e.back } : {}),
      styleId: style, params: { ...p, glyphs: own('glyphs', glyphs), outlines: own('outlines', outlines) }
    });
  }
  return trimVersions(out);
}

/** Versions written by an older PARAMS_VERSION, each design brought up to this one as upgradeParams brings a design
    up; given back whole (each `base`), for cleanVersions to read. */
export function upgradeVersions(input: unknown, version: number): unknown {
  if (!Array.isArray(input)) return input;
  return unpacked(input).map(({ e, styleId, raw, glyphs, outlines }) => {
    const up = upgradeParams({ ...raw, glyphs, outlines }, version);
    const { glyphs: g, outlines: o, ...set } = up;
    return { ...e, base: true, styleId, set, glyphs: g, outlines: o };
  });
}

/** Two Histories as one (a design file's laid into the open design's): the versions by time, any in both once. */
export function mergeVersions(a: FontLog, b: FontLog): FontLog {
  const seen = new Set(a.map(v => `${v.t} ${keyOf(v)}`));
  const more = b.filter(v => !seen.has(`${v.t} ${keyOf(v)}`));
  return more.length ? trimVersions([...a, ...more].sort((p, q) => p.t - q.t)) : a;
}

/** JSON with every object's keys in order, so the same values written in another order compare equal. */
const sorted = (v: unknown): string => JSON.stringify(v ?? null, (_, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
