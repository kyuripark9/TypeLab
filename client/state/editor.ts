/* Editor state. One store for the open design (with undo history) and the UI around it.
   Actions live outside the store so components can import them without subscribing. The module also
   builds the open design's font (fontFor, one build per params object), matches starting styles against
   the Style page's filters and traits. Importing it subscribes to free fonts arriving, so a design written
   in one draws again once its letters come. */
import { create } from 'zustand';
import { STYLES, controlFor, firstControl, looksOf, styleById, styleMatches, type ActiveKey, type CategoryId, type ControlKey, type Look, type Mood, type StyleDef, type StyleFilter, type StyleGroup } from '../../shared/content';
import { TRAIT_SECTIONS, applyTraits, traitOption, traitsKey, type TraitId, type Traits } from '../../shared/traits';
import { ALL_CHARS, buildFont, freeFont, onFreeFont, type Font } from '../../shared/engine';
import { STYLE_FONTS, parseFontId } from '../../shared/free-fonts';
import { loadFreeFont } from '../lib/free';
import { DEFAULT_NAME, cleanName, type Design, type DesignInput } from '../../shared/design';
import { cleanLog, mergeLogs, ownOf, packLog, recordEdits, sameOwn, withOwn, type LetterEdit, type LetterLog } from '../../shared/letter-log';
import { cleanVersions, keyOf, mergeVersions, packVersions, recordVersion, sameDesign, type FontLog, type FontVersion, type Made, type Snapshot } from '../../shared/font-log';
import { SNAP_KINDS, type SnapKind } from '../lib/pen';
import { PREFS, prefFlag, prefJson, prefOneOf, setPrefFlag, writePref } from '../lib/prefs';
import { DEFAULTS, drawnAtOf, endCurl, endLength, freeAtOf, isGlyphKey, type GlyphParams, type IdKey, type NumericParam, type Params } from '../../shared/params';

export type CardView = 'grid' | 'list';
/** The Style page's panel: filters that narrow the cards, or traits laid over every card. */
export type StyleTab = 'filter' | 'adjust';
/** What the controls change while a letter is inspected: every letter in sync, or just that one. */
export type Scope = 'all' | 'letter';

/** The panel sections left folded last visit. */
const savedFolded = (): ControlKey[] => {
  const v = prefJson(PREFS.folded);
  return Array.isArray(v) ? v : [];
};
/** The pen's snapping: on or off, and what it snaps to (everything, until changed). */
const savedSnap = (): { on: boolean; kinds: SnapKind[] } => {
  const v = prefJson(PREFS.penSnap) as { on?: unknown; kinds?: unknown } | null;
  if (v && typeof v.on === 'boolean' && Array.isArray(v.kinds)) return { on: v.on, kinds: SNAP_KINDS.filter(k => (v.kinds as unknown[]).includes(k)) };
  return { on: true, kinds: [...SNAP_KINDS] };
};

interface Doc { designId: string | null; name: string; styleId: string; params: Params; log: LetterLog; versions: FontLog }

export interface EditorState extends Doc {
  /** document snapshot at the last load/save; differs from the current one when dirty */
  saved: string;
  /** each letter's record of its own edits (shared/letter-log.ts): what a committed change did to the letters'
      own settings and drawings, kept past undo and saved with the design */
  log: LetterLog;
  /** the font's History (shared/font-log.ts): the whole design after each committed change, kept past undo and saved
      with the design */
  versions: FontLog;
  /** undo entries (see histSnap): the style and settings as loaded and after each committed change, oldest first, the last 200 kept */
  history: string[];
  /** the entry in `history` the design is at; undo and redo move it */
  hi: number;
  /** a save is on its way to the server */
  saving: boolean;

  /** the page open: the Style page ('style') or a page of controls */
  category: CategoryId;
  /** the control (or nested slider) pointed at or dragged last; while `hot`, the parts it shapes are highlighted */
  active: ActiveKey;
  /** true while the pointer is over the controls: highlight affected glyph parts */
  hot: boolean;
  /** the highlight of what was pointed at last (a control, or a part of the inspected letter) has gone: shown for
      `LIT_MS` and put away at once by a change of a value, so the preview and the inspector read in plain ink while
      the design is looked at and adjusted, till another control or part is pointed at */
  faded: boolean;
  /** the preview text; empty shows the default sentence */
  custom: string;
  /** the preview's text size, in px per em */
  size: number;
  /** Style page filters; an empty list means no filter on that facet */
  groups: StyleGroup[];
  moods: Mood[];
  /** Style page search words */
  query: string;
  /** the Style page asks what kind of letters (the Category) before it shows the cards */
  finder: boolean;
  /** Style page traits, laid over every starting style */
  traits: Traits;
  styleTab: StyleTab;
  /** the params as last picked on the Style page; while the design still matches them, it follows the traits */
  picked: string | null;
  /** Style page layout: cards in a grid, or one per row */
  view: CardView;
  /** long panel sections folded down to their heading */
  folded: ControlKey[];
  /** the explanation at the top of the panel opened past its title */
  tips: boolean;
  /** the letter open in the inspector */
  inspect: string | null;
  /** whether the controls change every letter or only the inspected one (see letterOf) */
  scope: Scope;
  /** optional sliders switched on while still at their off value, so they stay open */
  switchedOn: NumericParam[];
  /** the anatomy part pointed at, in the inspected letter or among a control's parts: it is highlighted in both */
  part: string | null;
  /** the stroke end, corner, join or stroke (by id) pointed at in a customized letter's list of its own values (see OwnKey) */
  hotEnd: string | null;
  /** the inspector draws the letter's construction grid: the lines and circles it is built on, and the letters that share them */
  construction: boolean;
  /** the inspector edits the letter's anchor points with the pen, instead of dragging its parts */
  penMode: boolean;
  /** the pen mirrors an edit across the letter's middle: 'x' left ↔ right, 'y' top ↔ bottom */
  mirror: ('x' | 'y')[];
  /** the pen snaps dragged points and handles (when on) to the kinds of place listed */
  snap: { on: boolean; kinds: SnapKind[] };
  /** the header's export menu is open */
  exportOpen: boolean;
  /** the toast showing, with its button if any; `id` tells a new one from the one before */
  toast: { id: number; msg: string; action?: ToastAction } | null;
  /** the page menu, opened from the header while the window is too narrow to show it alongside */
  navOpen: boolean;
  /** on phones, the Style page's panel open as a sheet over the cards */
  stylePanelOpen: boolean;
}

/** A button on a toast, like Undo after a delete. */
export interface ToastAction { label: string; run: () => void }

/** An undo entry: the style and settings, as JSON (readHist reads it back and must agree on the order). */
const histSnap = (p: Params, styleId: string) => JSON.stringify([styleId, p]);
const readHist = (snap: string): Pick<Doc, 'styleId' | 'params'> => {
  const [styleId, params] = JSON.parse(snap) as [string, Params];
  return { styleId, params };
};
/** The document as `saved` holds it, as JSON so the dirty check compares strings (readDoc reads it back and
    must agree on the order). */
const docSnap = (d: Pick<Doc, 'name' | 'styleId' | 'params'>) => JSON.stringify([d.name, d.styleId, d.params]);
const readDoc = (snap: string): Pick<Doc, 'name' | 'styleId' | 'params'> => {
  const [name, styleId, params] = JSON.parse(snap) as [string, string, Params];
  return { name, styleId, params };
};
/** The name as last loaded or saved. */
export const savedName = (s: EditorState) => readDoc(s.saved).name;
/** What a save sends: the design's name (cleaned), its style, its settings, and its letters' record and its History, packed. */
export const designInput = (s: EditorState): DesignInput => ({ name: cleanName(s.name), styleId: s.styleId, params: s.params, log: packLog(s.log), versions: packVersions(s.versions) });

const blankDoc = (): Doc => ({ designId: null, name: DEFAULT_NAME, styleId: STYLES[0].id, params: { ...STYLES[0].params }, log: {}, versions: [] });

function freshDocState(doc: Doc): Pick<EditorState, keyof Doc | 'picked' | 'saved' | 'history' | 'hi' | 'inspect' | 'switchedOn' | 'part' | 'hotEnd'> {
  return {
    ...doc,
    picked: JSON.stringify(doc.params),
    saved: docSnap(doc),
    history: [histSnap(doc.params, doc.styleId)],
    hi: 0,
    inspect: null,
    switchedOn: [],
    part: null,
    hotEnd: null
  };
}

export const useEditor = create<EditorState>()(() => ({
  ...freshDocState(blankDoc()),
  saving: false,
  category: 'style',
  active: 'weight',
  hot: false,
  faded: false,
  custom: '',
  size: 48,
  groups: [],
  moods: [],
  query: '',
  // on unless this browser was left browsing every card
  finder: !prefFlag(PREFS.browseAll),
  traits: {},
  styleTab: 'filter',
  view: prefOneOf(PREFS.cardView, ['grid', 'list'], 'grid'),
  folded: savedFolded(),
  // the explanation starts closed, at its title; opened, it stays open from visit to visit
  tips: prefFlag(PREFS.tipsShown),
  scope: 'all',
  construction: prefFlag(PREFS.construction),
  penMode: false,
  mirror: [],
  snap: savedSnap(),
  exportOpen: false,
  toast: null,
  navOpen: false,
  stylePanelOpen: false
}));

const set = useEditor.setState, get = useEditor.getState;

/** How long what is pointed at (a control's parts, a part of the inspected letter) shows lit before the letters go
    back to plain ink; styles.css's `lit` animation fades it out over its last stretch, as long as this. */
export const LIT_MS = 1000;
let litTimer: ReturnType<typeof setTimeout> | undefined;
/** Light what is pointed at now, for LIT_MS: the state to set with it. */
function lit() {
  clearTimeout(litTimer);
  litTimer = setTimeout(() => { if (!get().faded) set({ faded: true }); }, LIT_MS);
  return { faded: false };
}

/** when the newest undo step was made: the time its letters' edits are recorded at, which amend folds into */
let stepAt = 0;
/** the undo step a letter, or the whole font, was brought back in from a History (restoreLetter, restoreVersion) */
let backStep = '';
/** Whether the design stands at the undo step that brought a letter or the font back from a History: no edit made in
    Points, so nothing to carry on to the letters shaped the same way (CarryOffer). */
export const broughtBack = (s: EditorState) => s.history[s.hi] === backStep;
/** The design as the newest undo step has it: the History's newest version where that is it (its settings the very
    objects the design had, so comparing them is quick), else read back from the step. */
function stepDesign(s: EditorState): Snapshot {
  const key = s.history[s.hi], last = s.versions[s.versions.length - 1];
  return last && keyOf(last) === key ? { styleId: last.styleId, params: last.params, key } : { ...readHist(key), key };
}
/** A new undo step for what changed since the newest one (none where nothing did), recorded in the font's History
    with what `made` it (a style, traits, a file) or the version it brought `back`, and the letters' own settings and
    drawings it changed in their records. A `quiet` step, a style or a file taking the design's settings' place,
    records nothing in the letters': their own are replaced, not edited. */
function step(how: { quiet?: boolean; made?: Made; back?: number } = {}) {
  const s = get(), snap = histSnap(s.params, s.styleId);
  if (s.history[s.hi] === snap) return;
  const history = [...s.history.slice(0, s.hi + 1), snap].slice(-200), before = stepDesign(s);
  stepAt = Date.now();
  set({
    history, hi: history.length - 1,
    versions: recordVersion(s.versions, before, { styleId: s.styleId, params: s.params, key: snap }, { t: stepAt, made: how.made, back: how.back }),
    ...(how.quiet ? {} : { log: recordEdits(s.log, before.params, s.params, { t: stepAt, by: s.inspect, back: how.back }) })
  });
}

const toggle = <T,>(list: T[], x: T) => list.includes(x) ? list.filter(y => y !== x) : [...list, x];

export const isDirty = (s: EditorState) => docSnap(s) !== s.saved;

/** The key whose affected parts are highlighted, or null. Serif sub-sliders highlight serifs. */
export const hlKeyOf = (s: EditorState): ControlKey | null =>
  s.hot && !s.faded && s.category !== 'style' ? hlKey(s.active) : null;
/** The key whose parts `active` highlights: Horizontals the level strokes Contrast thins, else its control's. */
export const hlKey = (active: ActiveKey): ControlKey => (active === 'hWeight' ? 'contrast' : controlFor(active));

/** The letter that edits go to instead of the whole alphabet, or null. */
export const letterOf = (s: EditorState) => (s.scope === 'letter' ? s.inspect : null);

/** The value a control shows: the inspected letter's own one when edits go to that letter. */
export function paramOf<K extends keyof Params>(s: EditorState, key: K): Params[K] {
  const ch = letterOf(s), own = ch && isGlyphKey(key) ? s.params.glyphs[ch]?.[key] : undefined;
  return (own ?? s.params[key]) as Params[K];
}
export const useParam = <K extends keyof Params>(key: K) => useEditor(s => paramOf(s, key));
/** The length of one stroke end of the letter being customized: its own, else the letter's Length
    (or for the tip of a hook, tail or cursive stroke, the usual length its own control draws it at). */
export const endOf = (s: EditorState, id: string, hook = false) =>
  endLength({ terminalEnds: paramOf(s, 'terminalEnds'), terminalLength: paramOf(s, 'terminalLength') }, id, hook);
/** How one stroke end of the letter being customized bends: its own curl, else the letter's Curl. */
export const curlOf = (s: EditorState, id: string) => endCurl({ terminalCurls: paramOf(s, 'terminalCurls'), terminalCurl: paramOf(s, 'terminalCurl') }, id);
/** What can be set one by one on a customized letter (the settings of ID_KEYS in shared/params/spec.ts): each stroke end's
    length or curl, each corner's roundness (a turn's outside) and step, each turn's inside roundness, each stroke's
    weight, or each join's gap. */
export type OwnKey = IdKey;
/** The control each of a customized letter's own values belongs to: setting one points at that control, so its
    explainer shows. */
export const OWN_CONTROL: Record<OwnKey, ActiveKey> = {
  terminalEnds: 'terminalLength', terminalCurls: 'terminalCurl', corners: 'roundness', innerCorners: 'roundness',
  cornerSteps: 'steps', strokeWeights: 'weight', joinGaps: 'stencil'
};

/** Whether an optional slider is switched on: away from its off value, or switched on by hand. */
export const isOn = (s: EditorState, key: NumericParam, off: number) => paramOf(s, key) !== off || s.switchedOn.includes(key);
/** The value each optional slider had when it was switched off, to come back to. */
const lastOn: Partial<Record<NumericParam, number>> = {};

/** Params with one letter's override of `key` set, or removed when `v` is undefined. Letters
    left with no overrides drop out, so a letter reset to match the others is stored as such. */
function withGlyph(p: Params, ch: string, key: keyof GlyphParams, v: unknown): Params {
  const own: Record<string, unknown> = { ...p.glyphs[ch] };
  if (v === undefined) delete own[key]; else own[key] = v;
  const glyphs = { ...p.glyphs };
  if (Object.keys(own).length) glyphs[ch] = own as GlyphParams; else delete glyphs[ch];
  return { ...p, glyphs };
}

/** Drawn letters `outlines` written into `p`, each drawn just now (one that keeps no settings it was drawn at) keeping
    the settings it is drawn at, so it moves as they move from there. One put back as it was keeps its own. */
function withDrawings(p: Params, outlines: Params['outlines']): Params {
  const out: Params['outlines'] = {};
  for (const [ch, d] of Object.entries(outlines)) out[ch] = d.at ? d : { ...d, at: drawnAtOf(p, ch) };
  return { ...p, outlines: out };
}

/* ---------------------------------------------------------------- fonts
   Params objects are replaced on every change, so a WeakMap gives each exactly one build. */
const fonts = new WeakMap<Params, Font>();
/** the font built last, whose letters the next build reuses where only the drawings changed */
let lastFont: Font | undefined;
export function fontFor(p: Params): Font {
  let f = fonts.get(p);
  // written in a free font that has arrived since: built again with its letters
  if (!f || f.freeMissing.some(id => freeFont(id))) { f = lastFont = buildFont(p, lastFont); fonts.set(p, f); }
  for (const id of f.freeMissing) void loadFreeFont(id);
  return f;
}
// the open design draws again when the free font it's written in arrives (its settings unchanged)
onFreeFont(() => { const s = useEditor.getState(); if (s.params.freeFont) useEditor.setState({ params: { ...s.params } }); });

/** The settings a style's free font stands for as it comes: moved from these, its letters move too. */
/** Letter and word spacing where the engine adds nothing to a free font's own spacing: the settings' defaults,
    which `track` and `space` in shared/engine/font.ts take as their zero (written there as 0.2 and 0.35, so a new
    default has to reach both; Formal nudges letter spacing before `track` reads it). */
const FREE_SPACING = { letterSpacing: DEFAULTS.letterSpacing, wordSpacing: DEFAULTS.wordSpacing };
/** A style's settings to start from, written in its free font (unless a design built from the settings asks
    otherwise). Its free font's letters are spaced as the font spaces them, so letter and word spacing start at FREE_SPACING. Traits laid over the style move the
    font's letters as they move the settings (Bold makes it heavier). */
function startParams(st: StyleDef, traits: Traits, free = true): Params {
  const p = { ...applyTraits(st.params, traits) }, id = STYLE_FONTS[st.id];
  return free && id ? { ...p, freeFont: id, freeAt: freeAtOf(st.params), ...FREE_SPACING } : p;
}
export const useFont = () => fontFor(useEditor(s => s.params));
/** The font the controls act on: the inspected letter's own while edits go to that letter. */
export function useScopedFont() {
  const font = useFont(), ch = useEditor(letterOf);
  return ch ? font.letter(ch) : font;
}

/** Save as the header's Save does (the editor page says how), for a Save button elsewhere. */
let saveRequest = () => {};
export function onSaveRequest(fn: () => void) {
  saveRequest = fn;
  return () => { if (saveRequest === fn) saveRequest = () => {}; };
}

let toastId = 0;
/** the toast after a style is picked, which goes once a page of controls opens */
let styleToast = -1;

/** A starting style with the traits laid over it: one params object per style and set of traits, so fonts build once. */
const adjustedCache = new Map<string, Params>();
export function adjustedParams(s: StyleDef, traits: Traits): Params {
  const key = `${s.id}|${traitsKey(traits)}`;
  let p = adjustedCache.get(key);
  if (!p) {
    if (adjustedCache.size > 3000) adjustedCache.clear();
    p = Object.keys(traits).length ? applyTraits(s.params, traits) : s.params;
    adjustedCache.set(key, p);
  }
  return p;
}
const looksCache = new WeakMap<Params, Look[]>();
/** The Appearance a starting style shows with the traits laid over it. */
function adjustedLooks(s: StyleDef, traits: Traits): Look[] {
  const p = adjustedParams(s, traits);
  let l = looksCache.get(p);
  if (!l) { l = p === s.params ? s.looks : looksOf(p); looksCache.set(p, l); }
  return l;
}
/** The Style page's filters, and a test of whether a starting style (as the traits show it) passes them, or would with `pick` in place of its facet. */
export function useStyleMatch() {
  const groups = useEditor(s => s.groups), moods = useEditor(s => s.moods);
  const query = useEditor(s => s.query), traits = useEditor(s => s.traits);
  const f: StyleFilter = { groups, moods, query };
  return { f, traits, matches: (s: StyleDef, pick: Partial<StyleFilter> = {}, t = traits) => styleMatches(s, { ...f, ...pick }, adjustedLooks(s, t)) };
}
/** The picked steps as "Weight: Bold", in the order of the Adjust tab. */
export const traitLabels = (traits: Traits) =>
  TRAIT_SECTIONS.flatMap(sec => sec.traits).filter(t => traits[t.id]).map(t => ({ id: t.id, label: `${t.label}: ${traitOption(t.id, traits[t.id])!.label}` }));

/** New traits. A design still as it was picked on the Style page follows them. */
function setTraits(traits: Traits) {
  const s = get(), st = styleById(s.styleId);
  if (st && s.picked !== null && s.picked === JSON.stringify(s.params)) {
    const params = startParams(st, traits, !!s.params.freeFont);
    set({ traits, params, picked: JSON.stringify(params) });
    step({ quiet: true, made: 'traits' });
  } else set({ traits });
}

export const actions = {
  /* ---- document */
  newDesign() {
    set({ ...freshDocState(blankDoc()), category: 'style', active: 'weight', hot: false });
  },
  loadDesign(d: Design) {
    const s = get();
    set({ ...freshDocState({ designId: d.id, name: d.name, styleId: d.styleId, params: d.params, log: cleanLog(d.log), versions: cleanVersions(d.versions) }),
      category: s.category === 'style' ? 'weight' : s.category, hot: false, picked: null });
  },
  /** Record a successful save. `sent` is what went to the server, which may differ from the
      current state if the user kept editing while the request was in flight. */
  markSaved(d: Design, sent: DesignInput) {
    const s = get();
    const name = s.name === sent.name || s.name.trim() === d.name ? d.name : s.name;
    set({ designId: d.id, name, saved: docSnap({ name: d.name, styleId: sent.styleId, params: sent.params }) });
  },
  setName(name: string) { set({ name }); },
  /** A saved design was renamed on the server: the name counts as saved, while other unsaved edits stay unsaved.
      Returns the saved snapshot it replaced, for unrename. */
  markRenamed(name: string) {
    const before = get().saved, { styleId, params } = readDoc(before);
    set({ name, saved: docSnap({ name, styleId, params }) });
    return before;
  },
  /** The server refused a rename markRenamed counted as saved: `before` (what markRenamed returned) is the saved state again. */
  unrename(before: string) { set({ saved: before }); },
  setSaving(saving: boolean) { set({ saving }); },

  /** Live change while dragging: no history entry until commit(). While edits go to one letter,
      its settings change and the other letters stay as they are. The control's highlight is put away (`faded`). */
  setParam<K extends keyof Params>(key: K, v: Params[K]) {
    set(s => {
      const ch = letterOf(s);
      if (key === 'outlines') return { params: withDrawings(s.params, v as Params['outlines']), faded: true };
      return { params: ch && isGlyphKey(key) ? withGlyph(s.params, ch, key, v) : { ...s.params, [key]: v }, faded: true };
    });
  },
  commit() { step(); },
  /** Fold what changed since the last undo step into that step, so one undo takes both back (an edit in Points and
      the letters shaped the same way it then went on to). Only the newest step can take more, and the letters' record
      takes it in as part of that step's edits, and the font's History as part of its version. */
  amend() {
    const s = get(), snap = histSnap(s.params, s.styleId);
    if (s.history[s.hi] === snap || s.hi !== s.history.length - 1) return;
    const before = stepDesign(s);
    const log = recordEdits(s.log, before.params, s.params, { t: stepAt, by: s.inspect, fold: stepAt });
    const versions = recordVersion(s.versions, before, { styleId: s.styleId, params: s.params, key: snap }, { t: stepAt, fold: stepAt });
    set({ history: [...s.history.slice(0, s.hi), snap], log, versions });
  },
  setOption<K extends keyof Params>(key: K, v: Params[K]) {
    actions.setParam(key, v);
    actions.commit();
  },
  /** Settings in place of the design's (a design file's), with the letters' record and the History that came with
      them laid into the design's own. */
  replaceParams(params: Params, styleId?: string, log: LetterLog = {}, versions: FontLog = []) {
    set(s => ({ params, styleId: styleId && styleById(styleId) ? styleId : s.styleId, log: mergeLogs(s.log, log), versions: mergeVersions(s.versions, versions) }));
    step({ quiet: true, made: 'file' });
  },
  travel(d: number) {
    const s = get(), j = s.hi + d;
    if (j < 0 || j >= s.history.length) return;
    const { styleId, params } = readHist(s.history[j]);
    set({ hi: j, styleId, params });
  },
  /** Start from a style, with the Style page's traits laid over it. */
  loadStyle(id: string) {
    const st = styleById(id); if (!st) return;
    const s = get(), traits = s.traits, params = startParams(st, traits), n = Object.keys(traits).length;
    // a design shaped since its style was picked loses that work to the new style: say so, with a way back
    const shaped = s.hi > 0 && s.picked !== JSON.stringify(s.params);
    set({ params, styleId: id, switchedOn: [], picked: JSON.stringify(params) });
    step({ quiet: true, made: 'style' });
    if (shaped) { actions.toast(`${st.name} loaded in place of your changes`, { label: 'Undo', run: () => actions.travel(-1) }); return; }
    // the way on from here, Customize, stays in sight at the Style page's foot (Stage.tsx), so the toast just says what came in
    const font = parseFontId(params.freeFont);
    actions.toast(`${st.name} loaded${font ? ` in ${font.family}` : ''}${n ? ` with ${n} ${n === 1 ? 'trait' : 'traits'}` : ''}`);
    styleToast = toastId;
  },
  /** Reset one slider to the starting style's value, or, while edits go to one letter, to the
      value the other letters share. */
  resetParam(key: keyof Params) {
    const s = get(), ch = letterOf(s);
    if (ch && isGlyphKey(key)) {
      if (s.params.glyphs[ch]?.[key] === undefined) return;
      set({ params: withGlyph(s.params, ch, key, undefined), faded: true });
      actions.commit();
      return;
    }
    const st = styleById(s.styleId) ?? STYLES[0];
    actions.setOption(key, st.params[key]);
  },
  /** Switch an optional slider on, back to the value it had (or halfway), or off, to `off` where it changes nothing. */
  switchControl(key: NumericParam, on: boolean, off: number) {
    const v = paramOf(get(), key);
    if (on) {
      actions.keepOn(key);
      actions.setOption(key, lastOn[key] ?? 0.5);
    } else {
      if (v !== off) lastOn[key] = v;
      set(s => ({ switchedOn: s.switchedOn.filter(k => k !== key) }));
      actions.setOption(key, off);
    }
  },
  /** Keep an optional slider open while it's being used, even when dragged to its off value. */
  keepOn(key: NumericParam) {
    if (!get().switchedOn.includes(key)) set(s => ({ switchedOn: [...s.switchedOn, key] }));
  },
  /** Live change of one of a customized letter's own values by id (see OwnKey): a stroke end's length or curl, a corner's
      roundness or step, a turn's inside, a stroke's weight or a join's gap. Without `key` it sets the end's length; only a
      letter being customized has values of its own. */
  setEnd(id: string, v: number, key: OwnKey = 'terminalEnds') {
    set(s => {
      const ch = letterOf(s);
      return ch ? { params: withGlyph(s.params, ch, key, { ...paramOf(s, key), [id]: v }), faded: true } : {};
    });
  },
  /** Drop one of a customized letter's own values by id (see OwnKey), so that stroke end, corner, turn, stroke or join follows the letter's setting again. */
  resetEnd(id: string, key: OwnKey = 'terminalEnds') {
    const s = get(), ch = letterOf(s), own = ch ? s.params.glyphs[ch]?.[key] : undefined;
    if (!ch || !own || own[id] === undefined) return;
    const rest = { ...own };
    delete rest[id];
    set({ params: withGlyph(s.params, ch, key, Object.keys(rest).length ? rest : undefined), faded: true });
    actions.commit();
  },
  /** Put a letter back in step with the rest of the alphabet: its own settings dropped, and its edits in Points. */
  syncLetter(ch: string) {
    const s = get(), own = !!s.params.glyphs[ch], drawn = !!s.params.outlines[ch];
    if (!own && !drawn) return;
    const glyphs = { ...s.params.glyphs }, outlines = { ...s.params.outlines };
    delete glyphs[ch];
    delete outlines[ch];
    set({ params: { ...s.params, glyphs, outlines } });
    actions.commit();
    actions.toast(drawn ? `${ch} is the font's again · its History keeps your edits` : `${ch} is synced with the other letters again`);
  },
  /** Bring letter `ch` back to how it stood after edit `e` of its record: its own settings and drawing as they were
      then, in one undo step, recorded as brought back. Returns false where it already stands so. */
  restoreLetter(ch: string, e: LetterEdit) {
    const s = get();
    if (sameOwn(ownOf(s.params, ch), e)) return false;
    const p = withOwn(s.params, ch, e);
    set({ params: withDrawings(p, p.outlines) });
    step({ back: e.t });
    backStep = get().history[get().hi];
    return true;
  },
  /** Bring the whole font back to version `v` of its History: its style and settings, every letter's own and drawn
      ones, in one undo step, recorded as brought back. Returns false where it stands so already. */
  restoreVersion(v: FontVersion) {
    const s = get();
    if (sameDesign(v, { styleId: s.styleId, params: s.params, key: histSnap(s.params, s.styleId) })) return false;
    set({ styleId: v.styleId, params: v.params });
    step({ back: v.t });
    backStep = get().history[get().hi];
    return true;
  },

  /* ---- UI */
  setCategory(category: CategoryId, active?: ActiveKey) {
    if (category === 'style') { set({ category, inspect: null, part: null }); return; }
    // the "Customize" offered on picking a style has done its job once a page of controls is open
    set(s => ({ category, active: active ?? firstControl(category), stylePanelOpen: false, ...(s.toast?.id === styleToast ? { toast: null } : {}) }));
  },
  setActive(active: ActiveKey) { if (get().active !== active) set({ active }); },
  setHot(hot: boolean) { if (get().hot !== hot) set({ hot }); },
  /** Point at a control: make it active and show what it changes for a moment (`lit`); the same control pointed at
      again, as the pointer or a drag runs over its parts, leaves the highlight as it is. */
  focusControl(key: ActiveKey) {
    const s = get();
    set({ active: key, hot: true, ...(s.hot && s.active === key ? {} : lit()) });
  },
  setCustom(custom: string) { set({ custom }); },
  setSize(size: number) { set({ size }); },
  toggleGroup(g: StyleGroup) { set(s => ({ groups: toggle(s.groups, g) })); },
  toggleMood(m: Mood) { set(s => ({ moods: toggle(s.moods, m) })); },
  clearFilters() { set({ groups: [], moods: [], query: '' }); },
  /** Ask the finder's question again, or leave it and browse every card; either way no filter is left on. */
  setFinder(finder: boolean) {
    actions.clearFilters();
    set({ finder });
    setPrefFlag(PREFS.browseAll, !finder);
  },
  setQuery(query: string) { set({ query }); },
  setStyleTab(styleTab: StyleTab) { set({ styleTab }); },
  /** Pick a step of a trait, or with null (or the step already picked) let each style keep its own. */
  setTrait(id: TraitId, option: string | null) {
    const traits = { ...get().traits };
    if (option === null || traits[id] === option) delete traits[id]; else traits[id] = option;
    setTraits(traits);
  },
  clearTraits() { setTraits({}); },
  /** A random mix: most of the shape traits, now and then a finish. */
  shuffleTraits() {
    const traits: Traits = {};
    for (const sec of TRAIT_SECTIONS) {
      for (const t of sec.traits) {
        if (Math.random() < (sec.id === 'finish' ? 0.12 : 0.55)) traits[t.id] = t.options[Math.floor(Math.random() * t.options.length)].id;
      }
    }
    setTraits(traits);
  },
  setView(view: CardView) {
    set({ view });
    writePref(PREFS.cardView, view);
  },
  /** Fold a long panel section down to its heading, or open it again; `open` forces one way. */
  toggleFold(k: ControlKey, open = get().folded.includes(k)) {
    if (open !== get().folded.includes(k)) return;
    const folded = open ? get().folded.filter(x => x !== k) : [...get().folded, k];
    set({ folded });
    writePref(PREFS.folded, JSON.stringify(folded));
  },
  setTips(tips: boolean) {
    set({ tips });
    setPrefFlag(PREFS.tipsShown, tips);
  },
  /** Open a letter large; what the control in hand shapes in it shows for a moment (`lit`). */
  openInspector(ch: string) {
    if (!fontFor(get().params).glyph(ch)) return;
    const s = get();
    set({ inspect: ch, part: null, ...lit(), ...(s.category === 'style' ? { category: 'weight' as const, active: 'weight' as const } : {}) });
  },
  closeInspector() { set({ inspect: null, part: null }); },
  setScope(scope: Scope) { set({ scope }); },
  stepInspector(d: number) {
    const i = ALL_CHARS.indexOf(get().inspect ?? 'A');
    actions.openInspector(ALL_CHARS[(i + d + ALL_CHARS.length) % ALL_CHARS.length]);
  },
  /** Point at a part (null: at none): it shows for a moment (`lit`). */
  setPart(part: string | null) { if (get().part !== part) set(part ? { part, ...lit() } : { part }); },
  setHotEnd(hotEnd: string | null) { if (get().hotEnd !== hotEnd) set(hotEnd ? { hotEnd, ...lit() } : { hotEnd }); },
  setConstruction(construction: boolean) {
    set({ construction });
    setPrefFlag(PREFS.construction, construction);
  },
  setPenMode(penMode: boolean) { set({ penMode }); },
  setMirror(mirror: ('x' | 'y')[]) { set({ mirror }); },
  setSnap(snap: { on: boolean; kinds: SnapKind[] }) {
    set({ snap });
    writePref(PREFS.penSnap, JSON.stringify(snap));
  },
  /** Drop a letter's own value of one setting, so it follows the other letters again. */
  shareParam(ch: string, key: keyof GlyphParams) {
    const s = get();
    if (s.params.glyphs[ch]?.[key] === undefined) return;
    set({ params: withGlyph(s.params, ch, key, undefined), faded: true });
    actions.commit();
  },
  setExportOpen(exportOpen: boolean) { set({ exportOpen }); },
  requestSave() { saveRequest(); },
  toast(msg: string, action?: ToastAction) { set({ toast: { id: ++toastId, msg, action } }); },
  setNavOpen(navOpen: boolean) { set({ navOpen }); },
  setStylePanelOpen(stylePanelOpen: boolean) { if (get().stylePanelOpen !== stylePanelOpen) set({ stylePanelOpen }); }
};

