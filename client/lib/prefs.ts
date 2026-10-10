/* What this browser remembers between visits, in localStorage: every key in PREFS, and helpers to read and write
   them. Browsers keep these, so a key and the form of its value never change: a renamed key, or a value written
   another way, quietly forgets what every user had picked. Where the browser keeps nothing (storage blocked), a
   read gives its fallback and a write lasts only this visit. */

/** Every key, with what it holds. tools/browser/cdp.mjs sets introSeen and guideSeen by these names before a page
    loads, to keep the title card and the guide out of the way. */
export const PREFS = {
  /** the opening title card has played: '1' */
  introSeen: 'typelab.intro.seen',
  /** the first-run guide has been seen: '1' */
  guideSeen: 'typelab.guide.seen',
  /** the inspector's drag tip has been seen: '1' */
  dragTipSeen: 'typelab.dragTip.seen',
  /** the Style page's cards: 'grid' or 'list' */
  cardView: 'typelab.cardView',
  /** '1' while the style finder is off and every card shows (the key names the browsing, not the finder) */
  browseAll: 'typelab.browseAll',
  /** the inspector draws the construction grid: '1' */
  construction: 'typelab.construction',
  /** the panel sections folded to their heading: a JSON list of control keys */
  folded: 'typelab.folded',
  /** the explanation at the top of the panel is open: '1' */
  tipsShown: 'typelab.tipsShown',
  /** the pen's snapping: JSON { on, kinds } */
  penSnap: 'typelab.pen.snap',
  /** the shape the pen's Shape tool draws: a Shape id */
  penShape: 'typelab.pen.shape',
  /** My designs' layout: 'grid' or 'list' */
  designsView: 'typelab.designs.view',
  /** My designs' order: 'recent' or 'name' */
  designsSort: 'typelab.designs.sort',
  /** the email last signed in with */
  email: 'typelab.email',
  /** a panel's width or the glyph strip's height in px, set by dragging its border: one key per side */
  sizeNav: 'typelab.size.nav',
  sizePanel: 'typelab.size.panel',
  sizeStrip: 'typelab.size.strip'
} as const;
export type PrefKey = (typeof PREFS)[keyof typeof PREFS];

/** The text kept under `key`, or null when there is none or the browser keeps nothing. */
export function readPref(key: PrefKey): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Keep `v` under `key`, or with null forget it. */
export function writePref(key: PrefKey, v: string | null) {
  try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, v); } catch { /* storage off: lasts this visit */ }
}

/** Whether the flag under `key` is set ('1'); `unreadable` when the browser keeps nothing. */
export function prefFlag(key: PrefKey, unreadable = false): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return unreadable; }
}

/** Set the flag under `key` ('1'), or clear it (the key goes). */
export const setPrefFlag = (key: PrefKey, on: boolean) => writePref(key, on ? '1' : null);

/** The value kept under `key` if it is one of `values`, else `fallback`. */
export function prefOneOf<T extends string>(key: PrefKey, values: readonly T[], fallback: T): T {
  const v = readPref(key);
  return values.includes(v as T) ? v as T : fallback;
}

/** The JSON kept under `key`, parsed, or null when there is none or it doesn't parse; the caller checks its shape. */
export function prefJson(key: PrefKey): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}
