/* Each letter's record of its own edits: after every change to what a letter has of its own (its settings while it
   is customized, its drawing in Points, a Reset), how the letter then stood, so any of those can be brought back
   later, a reset letter's too. The record is kept with the design beside its settings, never in them, as the font is
   built from the settings alone. Saved and in design files it is packed: a drawing leaves out the settings it was
   drawn at where its letter's drawing before it had the same ones (packLog); cleanLog reads a record back, checking
   each letter's settings and drawing as sanitizeParams checks them. */
import type { Drawn } from './engine/outline';
import { PARAM_KEYS, sanitizeParams, upgradeParams, type GlyphParams, type Params } from './params';

/** How a letter stood after one edit, and what the edit was. */
export interface LetterEdit {
  /** when, in ms since 1970 */ t: number;
  /** the settings of its own the edit changed, in the editor's order, and 'points' for its drawing; none where the
      record notes how the letter stood before an edit (see recordEdits) */ keys: string[];
  /** its own settings after the edit; none where it follows the other letters */ own?: GlyphParams;
  /** its drawing after the edit; none where the settings draw it */ drawn?: Drawn;
  /** the edit brought back how the letter stood at this time (an earlier edit's `t`) */ back?: number;
  /** the edit was made on this letter and carried on to this one (Points, letters shaped the same way) */ by?: string;
}
/** Each letter's edits, oldest first, by character. */
export type LetterLog = Record<string, LetterEdit[]>;
/** What a letter has of its own: its settings and its drawing, either or both left out where it has none. */
export type Own = Pick<LetterEdit, 'own' | 'drawn'>;

/** The most edits kept for one letter; its oldest go first. */
export const LOG_KEEP = 50;
/** The most a design's record may take as JSON, unpacked; the oldest edits of any letter go first. Well under the
    4 MB the API takes a design in, its settings beside it. */
export const LOG_BYTES = 1_500_000;

/** What letter `ch` of `p` has of its own. */
export const ownOf = (p: Params, ch: string): Own => ({ own: p.glyphs[ch], drawn: p.outlines[ch] });
/** Whether two of a letter's states are the same: its own settings and its drawing alike, whatever their keys' order. */
export const sameOwn = (a: Own, b: Own) => sorted(a.own) === sorted(b.own) && sorted(a.drawn) === sorted(b.drawn);
/** `p` with letter `ch` standing as `o` has it: its own settings and drawing, or none. A part `o` leaves as it is
    keeps its object, so a font built from the result lends the design's letters where only the drawing differs. */
export function withOwn(p: Params, ch: string, o: Own): Params {
  const glyphs = p.glyphs[ch] === o.own ? p.glyphs : { ...p.glyphs }, outlines = p.outlines[ch] === o.drawn ? p.outlines : { ...p.outlines };
  if (o.own) glyphs[ch] = o.own; else delete glyphs[ch];
  if (o.drawn) outlines[ch] = o.drawn; else delete outlines[ch];
  return glyphs === p.glyphs && outlines === p.outlines ? p : { ...p, glyphs, outlines };
}

/** `log` with an edit for each letter whose own settings or drawing differ from `before` to `after` (the same `log`
    where none do). A letter whose record doesn't end as it stood before (none yet while it had something of its own,
    or an edit undone since) first notes how it stood then, so that can be brought back too; the font's own letter
    always can (Reset). With `fold`, the time of the newest undo step taking more in (the editor's amend), a letter's
    edit made in that step takes this change in, rather than another edit following it. */
export function recordEdits(log: LetterLog, before: Params, after: Params, how: { t: number; by?: string | null; back?: number; fold?: number }): LetterLog {
  let out = log;
  const chars = new Set([...Object.keys(before.glyphs), ...Object.keys(after.glyphs), ...Object.keys(before.outlines), ...Object.keys(after.outlines)]);
  for (const ch of chars) {
    const a = ownOf(before, ch), b = ownOf(after, ch);
    if (a.own === b.own && a.drawn === b.drawn) continue;
    const keys = changedKeys(a, b);
    if (!keys.length) continue;
    const list = out[ch] ?? [], last = list[list.length - 1] as LetterEdit | undefined;
    if (last && last.t === how.fold && last.keys.length) {
      const { own: _o, drawn: _d, ...rest } = last;
      out = { ...out, [ch]: [...list.slice(0, -1), { ...rest, keys: orderKeys([...last.keys, ...keys]), ...present(b) }] };
      continue;
    }
    const was: LetterEdit[] = (a.own || a.drawn) && !(last && sameOwn(last, a)) ? [{ t: how.t, keys: [], ...present(a) }] : [];
    const edit: LetterEdit = { t: how.t, keys, ...present(b), ...(how.back !== undefined ? { back: how.back } : {}), ...(how.by && how.by !== ch ? { by: how.by } : {}) };
    out = { ...out, [ch]: [...list, ...was, edit].slice(-LOG_KEEP) };
  }
  return out === log ? log : trimLog(out);
}

/** The settings of its own a letter's change touched, then 'points' where its drawing changed. */
function changedKeys(a: Own, b: Own): string[] {
  const x = (a.own ?? {}) as Record<string, unknown>, y = (b.own ?? {}) as Record<string, unknown>;
  const keys: string[] = PARAM_KEYS.filter(k => (k in x || k in y) && sorted(x[k]) !== sorted(y[k]));
  if (sorted(a.drawn) !== sorted(b.drawn)) keys.push('points');
  return keys;
}
/** Setting keys and 'points' once each, the settings in the editor's order and 'points' last; anything else dropped. */
const orderKeys = (keys: unknown[]): string[] =>
  [...PARAM_KEYS.filter(k => keys.includes(k)), ...(keys.includes('points') ? ['points'] : [])];
/** A letter's state with nothing written for what it hasn't got. */
const present = (o: Own): Own => ({ ...(o.own ? { own: o.own } : {}), ...(o.drawn ? { drawn: o.drawn } : {}) });
/** JSON with every object's keys in order, so the same values written in another order compare equal. */
const sorted = (v: unknown): string => JSON.stringify(v ?? null, (_, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);

/** Each edit's size as JSON, worked out once. */
const sizes = new WeakMap<LetterEdit, number>();
const sizeOf = (e: LetterEdit) => {
  let n = sizes.get(e);
  if (n === undefined) { n = JSON.stringify(e).length; sizes.set(e, n); }
  return n;
};
/** `log` within LOG_BYTES, the oldest edits of any letter dropped till it fits. */
function trimLog(log: LetterLog): LetterLog {
  const all = Object.values(log).flat();
  let total = all.reduce((n, e) => n + sizeOf(e), 0);
  if (total <= LOG_BYTES) return log;
  const drop = new Set<LetterEdit>();
  for (const e of all.sort((p, q) => p.t - q.t)) {
    if (total <= LOG_BYTES) break;
    drop.add(e);
    total -= sizeOf(e);
  }
  const out: LetterLog = {};
  for (const [ch, list] of Object.entries(log)) {
    const kept = list.filter(e => !drop.has(e));
    if (kept.length) out[ch] = kept;
  }
  return out;
}

/** `log` as it is saved: each drawing leaves out the settings it was drawn at where the drawing before it in its
    letter's record has the same (cleanLog fills them in again). */
export function packLog(log: LetterLog): LetterLog {
  const out: LetterLog = {};
  for (const [ch, list] of Object.entries(log)) {
    let at = '';
    out[ch] = list.map(e => {
      if (!e.drawn) return e;
      const now = sorted(e.drawn.at);
      if (now !== at) { at = now; return e; }
      const { at: _, ...drawn } = e.drawn;
      return { ...e, drawn };
    });
  }
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** A letter's edits as written, each drawing that leaves out its settings given those of the drawing before it. */
function unpacked(list: unknown[]): unknown[] {
  let at: unknown;
  return list.map(e => {
    if (!isObj(e) || !isObj(e.drawn)) return e;
    if ('at' in e.drawn) { at = e.drawn.at; return e; }
    return at === undefined ? e : { ...e, drawn: { ...e.drawn, at } };
  });
}

/** A record read from outside (a saved design, a design file, a request body): letters one character each, each edit
    with its time, its letter's settings and drawing checked as sanitizeParams checks a letter's own (a packed
    drawing given the settings of the one before it), and what doesn't read dropped; then kept within LOG_KEEP and
    LOG_BYTES. */
export function cleanLog(input: unknown): LetterLog {
  const out: LetterLog = {};
  if (!isObj(input)) return out;
  for (const [ch, list] of Object.entries(input)) {
    if ([...ch].length !== 1 || !Array.isArray(list)) continue;
    const kept: LetterEdit[] = [];
    for (const e of unpacked(list)) {
      if (!isObj(e) || typeof e.t !== 'number' || !Number.isFinite(e.t)) continue;
      const p = sanitizeParams({ glyphs: { [ch]: e.own }, outlines: { [ch]: e.drawn } });
      kept.push({
        t: e.t, keys: Array.isArray(e.keys) ? orderKeys(e.keys) : [], ...present(ownOf(p, ch)),
        ...(typeof e.back === 'number' && Number.isFinite(e.back) ? { back: e.back } : {}),
        ...(typeof e.by === 'string' && [...e.by].length === 1 ? { by: e.by } : {})
      });
    }
    if (kept.length) out[ch] = kept.slice(-LOG_KEEP);
  }
  return trimLog(out);
}

/** A record written by an older PARAMS_VERSION, each letter's settings and drawing brought up to this one as
    upgradeParams brings them up in the design's settings `params` (as written with the record). */
export function upgradeLog(input: unknown, params: unknown, version: number): unknown {
  if (!isObj(input)) return input;
  const base = isObj(params) ? params : {};
  return Object.fromEntries(Object.entries(input).map(([ch, list]) => [ch, Array.isArray(list) ? unpacked(list).map(e => {
    if (!isObj(e)) return e;
    const up = upgradeParams({ ...base, glyphs: e.own === undefined ? {} : { [ch]: e.own }, outlines: e.drawn === undefined ? {} : { [ch]: e.drawn } }, version);
    const own = (up.glyphs as Record<string, unknown> | undefined)?.[ch], drawn = (up.outlines as Record<string, unknown> | undefined)?.[ch];
    const { own: _o, drawn: _d, ...rest } = e;
    return { ...rest, ...(own === undefined ? {} : { own }), ...(drawn === undefined ? {} : { drawn }) };
  }) : list]));
}

/** Two records as one (a design file's laid into the open design's): each letter's edits by time, any in both once. */
export function mergeLogs(a: LetterLog, b: LetterLog): LetterLog {
  const out: LetterLog = { ...a };
  for (const [ch, list] of Object.entries(b)) {
    const seen = new Set((out[ch] ?? []).map(e => sorted(e)));
    const more = list.filter(e => !seen.has(sorted(e)));
    if (more.length) out[ch] = [...(out[ch] ?? []), ...more].sort((p, q) => p.t - q.t).slice(-LOG_KEEP);
  }
  return trimLog(out);
}
