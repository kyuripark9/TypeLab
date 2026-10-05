/* Whether a setting can change what is on screen. Crossbar on an o, the K's shape while the text has
   no K, Stencil on a letter with no joins: clicking them changed nothing, and read as broken. Each
   control is tried at its other values, and if the letters in view stay the same it says so and
   names letters it does change. */
import { ALL_CHARS, buildFont, type Font } from '../../shared/engine';
import { FORM_OPTIONS } from '../../shared/content';
import {
  BAR_ENDS, FILLS, SERIF_BASES, SERIF_INNERS, SERIF_SHAPES, SERIF_SIDES, SERIF_TIPS, TERMINALS, TERMINAL_FORMS, TERMINAL_RUNS,
  isGlyphKey, type Params
} from '../../shared/params';

/** The choices of each setting that is picked rather than slid. */
const CHOICES: Partial<Record<keyof Params, readonly unknown[]>> = {
  terminal: TERMINALS, terminalRun: TERMINAL_RUNS, serifShape: SERIF_SHAPES, serifTip: SERIF_TIPS, serifBase: SERIF_BASES,
  serifSides: SERIF_SIDES, serifInner: SERIF_INNERS, fill: FILLS, barEnds: BAR_ENDS, story: ['double', 'single'],
  ...Object.fromEntries(Object.entries(FORM_OPTIONS).map(([k, o]) => [k, o.options.map(([id]) => id)]))
};
/** Spacing acts on how letters are set side by side, not on the letters, so it always shows. */
const SPACING = new Set<keyof Params>(['letterSpacing', 'wordSpacing']);

/** The other values worth trying for `k`: both ends and the middle of a slider, every other choice, the other side of a switch. */
function altsOf(p: Params, k: keyof Params): unknown[] {
  const v = p[k];
  if (k === 'terminalForm') return TERMINAL_FORMS[p.terminal].filter(f => f !== v);
  if (typeof v === 'number') return [0, 0.5, 1].filter(x => x !== v);
  if (typeof v === 'boolean') return [!v];
  return (CHOICES[k] ?? []).filter(x => x !== v);
}

const sig = (f: Font, ch: string) => { const g = f.glyph(ch); return g ? `${g.d}|${g.adv}|${g.lsb}` : ''; };

export interface Reach {
  /** whether some value of the setting changes one of the letters in view */
  shows: boolean;
  /** when it doesn't: a few other letters it does change, none if it changes nothing at all */
  elsewhere: string[];
}

/** Whether trying `k` at its other values changes any of `chars` in the font `p` makes. While edits go to
    one letter (`letter`), its own settings are what change, as moving the control would do. */
export function reachOf(p: Params, k: keyof Params, chars: string[], letter: string | null = null): Reach {
  if (SPACING.has(k)) return { shows: true, elsewhere: [] };
  const set = (v: unknown): Params => letter && isGlyphKey(k)
    ? { ...p, glyphs: { ...p.glyphs, [letter]: { ...p.glyphs[letter], [k]: v } } }
    : { ...p, [k]: v };
  const base = buildFont(p), alts = altsOf(p, k).map(v => buildFont(set(v)));
  const changes = (ch: string) => { const s = sig(base, ch); return alts.some(f => sig(f, ch) !== s); };
  if (chars.some(changes)) return { shows: true, elsewhere: [] };
  const elsewhere: string[] = [];
  for (const ch of ALL_CHARS) {
    if (elsewhere.length >= 3) break;
    if (!chars.includes(ch) && changes(ch)) elsewhere.push(ch);
  }
  return { shows: false, elsewhere };
}
