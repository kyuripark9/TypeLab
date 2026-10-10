/* The ids a letter's own values are kept under (stroke ends, joins, corners, strokes), and the scales that turn
   a setting's 0..1 into a length, a weight or an angle, shared by the engine and the editor. */
import type { Params } from './model';

/** A stroke end's id: the index of its stroke in the glyph, then 's' for its start or 'e' for its end.
    A 'p' in front marks a plain end, one that isn't a styled terminal (the foot of a stem, the tip
    of a leg): it keeps the length and curl it is drawn with unless given its own, so the stroke end
    length and curl leave it alone. */
export const isEndId = (id: string) => /^p?\d{1,2}[se]$/.test(id);
/** A join's id: the index of the stroke that ends in another one, then 's' or 'e' for the end that
    joins; or a turn's (see isCornerId), where a stroke can come apart like two strokes joined. */
export const isJoinId = (id: string) => /^\d{1,2}([se]|t\d{1,2})$/.test(id);
/** How far a stroke ending in another is pulled back from it, in font units, at `v` on a join's own
    Gap scale, for stems `s` wide: up to two stems and a bit at 1. */
export const joinGap = (v: number, s: number) => v * (24 + s * 2);
/** How far the strokes a crossbar runs through are cut back above and below it, at `v` on its Gap scale (s: the stem). */
export const barCut = (v: number, s: number) => v * (12 + s);
/** A corner's id: the index of its stroke in the glyph, then 't' and the number of the turn along the
    stroke's centerline (from 0), or the end ('s' start, 'e' end) and its side ('l' or 'r', looking
    out of the stroke), or 'j' and the number of an inside corner where it meets a later stroke of
    the glyph (a join, from 0). */
export const isCornerId = (id: string) => /^\d{1,2}(t\d{1,2}|j\d{1,2}|[se][lr])$/.test(id);
/** A turn's id (see isCornerId): only a turn has an inside to round. */
export const isTurnId = (id: string) => /^\d{1,2}t\d{1,2}$/.test(id);
/** A stroke's id: its index in the glyph. */
export const isStrokeId = (id: string) => /^\d{1,2}$/.test(id);
/** The turn, in degrees clockwise, at `v` on the Rotation scale. */
export const rotationDeg = (v: number) => (v - 0.5) * 360;
/** How much heavier a stroke is drawn at `v` on a weight scale centred on 0.5: a quarter as heavy at 0, two and a half times at 1. */
export const weightScale = (v: number) => (v < 0.5 ? 0.25 + 1.5 * v : 1 + 3 * (v - 0.5));
/** `base` weighed by `v` on that scale but kept between `lo` and `hi`, reaching either only at the end of
    the scale, so the scale eases toward the limit all the way along rather than stopping at it part way. */
export function weighed(base: number, v: number, lo: number, hi: number) {
  const b = Math.min(hi, Math.max(lo, base));
  return v < 0.5 ? b + (Math.max(lo, Math.min(b, base * 0.25)) - b) * (1 - v * 2) : b + (Math.min(hi, Math.max(b, base * 2.5)) - b) * (v * 2 - 1);
}
/** The pen's contrast at `v` on the Contrast scale: `amount` of thick against thin (0.05 at 0.5, as
    the letters are drawn, to 1 at either end) and how far it is `reverse`d, horizontals heavy and
    stems thin. Turning round, the gentle contrast as drawn evens out first (by 0.45) and is all the
    way round by 0.4, then the contrast grows to the mirror of 1 at 0, so no stroke thins on the way. */
export function contrastOf(v: number) {
  if (v >= 0.5) return { amount: 0.05 + 0.95 * (v - 0.5) * 2, reverse: 0 };
  const t = (0.5 - v) * 2;
  return { amount: 0.05 + 0.95 * Math.max(0, (t - 0.1) / 0.9), reverse: Math.min(1, t / 0.2) };
}
/** An older saved contrast, an amount with a separate reverse (see fromOldContrast in clean.ts), as a value on the two-way Contrast scale. */
export function contrastFromOld(amount: number, reverse: number) {
  const u = Math.min(1, Math.max(0, (amount - 0.05) / 0.95));
  return reverse >= 0.5 ? 0.5 - (0.1 + 0.9 * u) / 2 : 0.5 + u / 2;
}
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
    stroke end length; or, for an end the stroke end length doesn't reach (`hook`), the usual length
    (0.5). Those are a plain end (see isEndId), an end with a serif, and the tip of a hook, tail or
    cursive stroke, which follows its own control. Unlike endCurl it doesn't read the 'p' of a plain
    end's id: callers pass `hook` for it (see stretchTerminals in shared/engine/ends.ts). */
export const endLength = (p: Pick<Params, 'terminalLength'> & { terminalEnds?: Record<string, number> }, id: string, hook = false) =>
  p.terminalEnds?.[id] ?? (hook ? 0.5 : onEndScale(p.terminalLength));
/** How one stroke end bends (see terminalCurl): its own curl, else the stroke end curl, except
    that a plain end (see isEndId) stays as drawn (0.5). */
export const endCurl = (p: { terminalCurl?: number; terminalCurls?: Record<string, number> }, id: string) =>
  p.terminalCurls?.[id] ?? (id.startsWith('p') ? 0.5 : p.terminalCurl ?? 0.5);

/** The x-height as a share of the cap height, at `v` on the Lowercase height scale: from under a third
    (a copperplate's) to nearly as tall as the capitals. */
export const xHeightRatio = (v: number) => 0.3 + 0.56 * v;
/** An x-height saved on the version 1 scale, which starts at half the cap height, as a value on the scale xHeightRatio reads. */
export const xHeightFromOld = (v: number) => Math.round((0.2 + 0.36 * v) / 0.56 * 1000) / 1000;
