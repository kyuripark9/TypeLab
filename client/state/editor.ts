/* Editor state. One store for the open design (with undo history) and the UI around it.
   Actions live outside the store so components can import them without subscribing. */
import { create } from 'zustand';
import { SERIF_SUBS, STYLES, controlFor, firstControl, styleById, type ActiveKey, type CategoryId, type ControlKey, type Kind, type Look, type Mood } from '../../shared/content';
import { ALL_CHARS, buildFont, type Font } from '../../shared/engine';
import { DEFAULT_NAME, type Design, type DesignInput } from '../../shared/design';
import { endCurl, endLength, isGlyphKey, type GlyphParams, type NumericParam, type Params } from '../../shared/params';

export type CardView = 'grid' | 'list';
/** What the controls change while a letter is inspected: every letter in sync, or just that one. */
export type Scope = 'all' | 'letter';

const VIEW_KEY = 'typelab.cardView';
const savedView = (): CardView => {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
};
const FOLD_KEY = 'typelab.folded';
const savedFolded = (): ControlKey[] => {
  try { const v = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const TIPS_KEY = 'typelab.tipsHidden';
const savedTips = (): boolean => {
  try { return localStorage.getItem(TIPS_KEY) !== '1'; } catch { return true; }
};

interface Doc { designId: string | null; name: string; styleId: string; params: Params }

export interface EditorState extends Doc {
  /** document snapshot at the last load/save; differs from the current one when dirty */
  saved: string;
  history: string[];
  hi: number;
  saving: boolean;

  category: CategoryId;
  active: ActiveKey;
  /** true while the pointer is over the controls: highlight affected glyph parts */
  hot: boolean;
  /** the preview text; empty shows the default sentence */
  custom: string;
  size: number;
  /** Style page filters; an empty list means no filter on that facet */
  moods: Mood[];
  looks: Look[];
  kinds: Kind[];
  /** Style page layout: cards in a grid, or one per row */
  view: CardView;
  /** long panel sections folded down to their heading */
  folded: ControlKey[];
  /** the explanation at the top of the panel; closed, it folds to a "Show explanation" row */
  tips: boolean;
  inspect: string | null;
  scope: Scope;
  /** optional sliders switched on while still at their off value, so they stay open */
  switchedOn: NumericParam[];
  part: string | null;
  /** the stroke end (by id) pointed at in the list of a customized letter's ends */
  hotEnd: string | null;
  skeleton: boolean;
  exportOpen: boolean;
  toast: { id: number; msg: string } | null;
}

const histSnap = (p: Params, styleId: string) => JSON.stringify([styleId, p]);
const docSnap = (d: Pick<Doc, 'name' | 'styleId' | 'params'>) => JSON.stringify([d.name, d.styleId, d.params]);

const blankDoc = (): Doc => ({ designId: null, name: DEFAULT_NAME, styleId: STYLES[0].id, params: { ...STYLES[0].params } });

function freshDocState(doc: Doc): Partial<EditorState> {
  return {
    ...doc,
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
  ...blankDoc(),
  saved: docSnap(blankDoc()),
  history: [histSnap(blankDoc().params, blankDoc().styleId)],
  hi: 0,
  saving: false,
  category: 'style',
  active: 'weight',
  hot: false,
  custom: '',
  size: 48,
  moods: [],
  looks: [],
  kinds: [],
  view: savedView(),
  folded: savedFolded(),
  tips: savedTips(),
  inspect: null,
  scope: 'all',
  switchedOn: [],
  part: null,
  hotEnd: null,
  skeleton: false,
  exportOpen: false,
  toast: null
}));

const set = useEditor.setState, get = useEditor.getState;

const toggle = <T,>(list: T[], x: T) => list.includes(x) ? list.filter(y => y !== x) : [...list, x];

export const isDirty = (s: EditorState) => docSnap(s) !== s.saved;

/** The key whose affected parts are highlighted, or null. Serif sub-sliders highlight serifs. */
export const hlKeyOf = (s: EditorState): ControlKey | null =>
  s.hot && s.category !== 'style' ? hlKey(s.active) : null;
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
/** What can be set one by one on a customized letter: each stroke end's length or curl, each
    corner's roundness (a turn's outside) and each turn's inside roundness, or each stroke's weight. */
export type EndKey = 'terminalEnds' | 'terminalCurls' | 'corners' | 'innerCorners' | 'strokeWeights';

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

/* ---------------------------------------------------------------- fonts
   Params objects are replaced on every change, so a WeakMap gives each exactly one build. */
const fonts = new WeakMap<Params, Font>();
export function fontFor(p: Params): Font {
  let f = fonts.get(p);
  if (!f) { f = buildFont(p); fonts.set(p, f); }
  return f;
}
export const useFont = () => fontFor(useEditor(s => s.params));
/** The font the controls act on: the inspected letter's own while edits go to that letter. */
export function useScopedFont() {
  const font = useFont(), ch = useEditor(letterOf);
  return ch ? font.letter(ch) : font;
}

let toastId = 0;

export const actions = {
  /* ---- document */
  newDesign() {
    set({ ...freshDocState(blankDoc()), category: 'style', active: 'weight', hot: false });
  },
  loadDesign(d: Design) {
    const s = get();
    set({ ...freshDocState({ designId: d.id, name: d.name, styleId: d.styleId, params: d.params }),
      category: s.category === 'style' ? 'structure' : s.category, hot: false });
  },
  /** Record a successful save. `sent` is what went to the server, which may differ from the
      current state if the user kept editing while the request was in flight. */
  markSaved(d: Design, sent: DesignInput) {
    const s = get();
    const name = s.name === sent.name || s.name.trim() === d.name ? d.name : s.name;
    set({ designId: d.id, name, saved: docSnap({ name: d.name, styleId: sent.styleId, params: sent.params }) });
  },
  setName(name: string) { set({ name }); },
  setSaving(saving: boolean) { set({ saving }); },

  /** Live change while dragging: no history entry until commit(). While edits go to one letter,
      its settings change and the other letters stay as they are. */
  setParam<K extends keyof Params>(key: K, v: Params[K]) {
    set(s => {
      const ch = letterOf(s);
      return { params: ch && isGlyphKey(key) ? withGlyph(s.params, ch, key, v) : { ...s.params, [key]: v } };
    });
  },
  commit() {
    const s = get(), snap = histSnap(s.params, s.styleId);
    if (s.history[s.hi] === snap) return;
    const history = [...s.history.slice(0, s.hi + 1), snap].slice(-200);
    set({ history, hi: history.length - 1 });
  },
  setOption<K extends keyof Params>(key: K, v: Params[K]) {
    actions.setParam(key, v);
    actions.commit();
  },
  replaceParams(params: Params, styleId?: string) {
    set(s => ({ params, styleId: styleId && styleById(styleId) ? styleId : s.styleId }));
    actions.commit();
  },
  travel(d: number) {
    const s = get(), j = s.hi + d;
    if (j < 0 || j >= s.history.length) return;
    const [styleId, params] = JSON.parse(s.history[j]) as [string, Params];
    set({ hi: j, styleId, params });
  },
  loadStyle(id: string) {
    const st = styleById(id); if (!st) return;
    set({ params: { ...st.params }, styleId: id, switchedOn: [] });
    actions.commit();
    actions.toast(`${st.name} loaded — now make it yours`);
  },
  /** Reset one slider to the starting style's value, or, while edits go to one letter, to the
      value the other letters share. */
  resetParam(key: keyof Params) {
    const s = get(), ch = letterOf(s);
    if (ch && isGlyphKey(key)) {
      if (s.params.glyphs[ch]?.[key] === undefined) return;
      set({ params: withGlyph(s.params, ch, key, undefined) });
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
  /** Live change of one stroke end's length (or curl), or one corner's roundness. Only a letter
      being customized has ends and corners of its own. */
  setEnd(id: string, v: number, key: EndKey = 'terminalEnds') {
    set(s => {
      const ch = letterOf(s);
      return ch ? { params: withGlyph(s.params, ch, key, { ...paramOf(s, key), [id]: v }) } : {};
    });
  },
  /** Let one stroke end follow the letter's Length (or Curl) again, or a corner be drawn as the design draws it. */
  resetEnd(id: string, key: EndKey = 'terminalEnds') {
    const s = get(), ch = letterOf(s), own = ch ? s.params.glyphs[ch]?.[key] : undefined;
    if (!ch || !own || own[id] === undefined) return;
    const rest = { ...own };
    delete rest[id];
    set({ params: withGlyph(s.params, ch, key, Object.keys(rest).length ? rest : undefined) });
    actions.commit();
  },
  /** Put a customized letter back in sync with the rest of the alphabet. */
  syncLetter(ch: string) {
    const s = get();
    if (!s.params.glyphs[ch]) return;
    const glyphs = { ...s.params.glyphs };
    delete glyphs[ch];
    set({ params: { ...s.params, glyphs } });
    actions.commit();
    actions.toast(`${ch} is synced with the other letters again`);
  },

  /* ---- UI */
  setCategory(category: CategoryId, active?: ActiveKey) {
    if (category === 'style') { set({ category, inspect: null, part: null }); return; }
    set({ category, active: active ?? firstControl(category) });
  },
  setActive(active: ActiveKey) { if (get().active !== active) set({ active }); },
  setHot(hot: boolean) { if (get().hot !== hot) set({ hot }); },
  /** Point at a control: make it active and show what it changes. */
  focusControl(key: ActiveKey) { set({ active: key, hot: true }); },
  setCustom(custom: string) { set({ custom }); },
  setSize(size: number) { set({ size }); },
  toggleMood(m: Mood) { set(s => ({ moods: toggle(s.moods, m) })); },
  toggleLook(l: Look) { set(s => ({ looks: toggle(s.looks, l) })); },
  toggleKind(k: Kind) { set(s => ({ kinds: toggle(s.kinds, k) })); },
  clearFilters() { set({ moods: [], looks: [], kinds: [] }); },
  setView(view: CardView) {
    set({ view });
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode: the choice lasts this visit */ }
  },
  /** Fold a long panel section down to its heading, or open it again; `open` forces one way. */
  toggleFold(k: ControlKey, open = get().folded.includes(k)) {
    if (open !== get().folded.includes(k)) return;
    const folded = open ? get().folded.filter(x => x !== k) : [...get().folded, k];
    set({ folded });
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(folded)); } catch { /* private mode: the fold lasts this visit */ }
  },
  setTips(tips: boolean) {
    set({ tips });
    try { if (tips) localStorage.removeItem(TIPS_KEY); else localStorage.setItem(TIPS_KEY, '1'); } catch { /* private mode: lasts this visit */ }
  },
  openInspector(ch: string) {
    if (!fontFor(get().params).glyph(ch)) return;
    const s = get();
    set({ inspect: ch, part: null, ...(s.category === 'style' ? { category: 'structure' as const, active: 'weight' as const } : {}) });
  },
  closeInspector() { set({ inspect: null, part: null }); },
  setScope(scope: Scope) { set({ scope }); },
  stepInspector(d: number) {
    const i = ALL_CHARS.indexOf(get().inspect ?? 'A');
    actions.openInspector(ALL_CHARS[(i + d + ALL_CHARS.length) % ALL_CHARS.length]);
  },
  setPart(part: string | null) { if (get().part !== part) set({ part }); },
  setHotEnd(hotEnd: string | null) { if (get().hotEnd !== hotEnd) set({ hotEnd }); },
  setSkeleton(skeleton: boolean) { set({ skeleton }); },
  setExportOpen(exportOpen: boolean) { set({ exportOpen }); },
  toast(msg: string) { set({ toast: { id: ++toastId, msg } }); }
};

export const isSerifSub = (k: ActiveKey) => k in SERIF_SUBS;
