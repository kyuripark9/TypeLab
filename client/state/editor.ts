/* Editor state. One store for the open design (with undo history) and the UI around it.
   Actions live outside the store so components can import them without subscribing. */
import { create } from 'zustand';
import { SERIF_SUBS, STYLES, controlFor, firstControl, looksOf, styleById, styleMatches, type ActiveKey, type CategoryId, type ControlKey, type Kind, type Look, type Mood, type StyleDef, type StyleFilter, type StyleGroup } from '../../shared/content';
import { TRAIT_SECTIONS, applyTraits, traitOption, traitsKey, type TraitId, type Traits } from '../../shared/traits';
import { ALL_CHARS, buildFont, type Font } from '../../shared/engine';
import { DEFAULT_NAME, type Design, type DesignInput } from '../../shared/design';
import { endCurl, endLength, isGlyphKey, type GlyphParams, type NumericParam, type Params } from '../../shared/params';

export type CardView = 'grid' | 'list';
/** The Style page's panel: filters that narrow the cards, or traits laid over every card. */
export type StyleTab = 'filter' | 'adjust';
/** What the controls change while a letter is inspected: every letter in sync, or just that one. */
export type Scope = 'all' | 'letter';

const VIEW_KEY = 'typelab.cardView';
const savedView = (): CardView => {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
};
const CARDS_KEY = 'typelab.cardsHidden';
const savedCards = (): boolean => {
  try { return localStorage.getItem(CARDS_KEY) !== '1'; } catch { return true; }
};
const FONT_GRID_KEY = 'typelab.fontGridHidden';
const savedFontGrid = (): boolean => {
  try { return localStorage.getItem(FONT_GRID_KEY) !== '1'; } catch { return true; }
};
const CONSTRUCTION_KEY = 'typelab.construction';
const savedConstruction = (): boolean => {
  try { return localStorage.getItem(CONSTRUCTION_KEY) === '1'; } catch { return false; }
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
  groups: StyleGroup[];
  moods: Mood[];
  looks: Look[];
  kinds: Kind[];
  /** Style page search words */
  query: string;
  /** Style page traits, laid over every starting style */
  traits: Traits;
  styleTab: StyleTab;
  /** the params as last picked on the Style page; while the design still matches them, it follows the traits */
  picked: string | null;
  /** Style page layout: cards in a grid, or one per row */
  view: CardView;
  /** the Style page shows the grid of style cards; off, it shows the design's own preview */
  cards: boolean;
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
  /** the inspector shows the letter among the design's other letters, in a grid of words */
  fontGrid: boolean;
  /** the inspector draws the letter's construction grid: the lines and circles it is built on, and the letters that share them */
  construction: boolean;
  /** the inspector edits the letter's anchor points with the pen, instead of dragging its parts */
  penMode: boolean;
  exportOpen: boolean;
  toast: { id: number; msg: string } | null;
}

const histSnap = (p: Params, styleId: string) => JSON.stringify([styleId, p]);
const docSnap = (d: Pick<Doc, 'name' | 'styleId' | 'params'>) => JSON.stringify([d.name, d.styleId, d.params]);

const blankDoc = (): Doc => ({ designId: null, name: DEFAULT_NAME, styleId: STYLES[0].id, params: { ...STYLES[0].params } });

function freshDocState(doc: Doc): Partial<EditorState> {
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
  groups: [],
  moods: [],
  looks: [],
  kinds: [],
  query: '',
  traits: {},
  styleTab: 'filter',
  picked: JSON.stringify(blankDoc().params),
  view: savedView(),
  cards: savedCards(),
  folded: savedFolded(),
  tips: savedTips(),
  inspect: null,
  scope: 'all',
  switchedOn: [],
  part: null,
  hotEnd: null,
  skeleton: false,
  fontGrid: savedFontGrid(),
  construction: savedConstruction(),
  penMode: false,
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
export type EndKey = 'terminalEnds' | 'terminalCurls' | 'corners' | 'innerCorners' | 'cornerSteps' | 'strokeWeights';

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
export function adjustedLooks(s: StyleDef, traits: Traits): Look[] {
  const p = adjustedParams(s, traits);
  let l = looksCache.get(p);
  if (!l) { l = p === s.params ? s.looks : looksOf(p); looksCache.set(p, l); }
  return l;
}
/** The Style page's filters, and a test of whether a starting style (as the traits show it) passes them, or would with `pick` in place of its facet. */
export function useStyleMatch() {
  const groups = useEditor(s => s.groups), kinds = useEditor(s => s.kinds), looks = useEditor(s => s.looks), moods = useEditor(s => s.moods);
  const query = useEditor(s => s.query), traits = useEditor(s => s.traits);
  const f: StyleFilter = { groups, kinds, looks, moods, query };
  return { f, traits, matches: (s: StyleDef, pick: Partial<StyleFilter> = {}, t = traits) => styleMatches(s, { ...f, ...pick }, adjustedLooks(s, t)) };
}
/** The picked steps as "Weight: Bold", in the order of the Adjust tab. */
export const traitLabels = (traits: Traits) =>
  TRAIT_SECTIONS.flatMap(sec => sec.traits).filter(t => traits[t.id]).map(t => ({ id: t.id, label: `${t.label}: ${traitOption(t.id, traits[t.id])!.label}` }));

/** New traits. A design still as it was picked on the Style page follows them. */
function setTraits(traits: Traits) {
  const s = get(), st = styleById(s.styleId);
  if (st && s.picked !== null && s.picked === JSON.stringify(s.params)) {
    const params = { ...applyTraits(st.params, traits) };
    set({ traits, params, picked: JSON.stringify(params) });
    actions.commit();
  } else set({ traits });
}

export const actions = {
  /* ---- document */
  newDesign() {
    set({ ...freshDocState(blankDoc()), category: 'style', active: 'weight', hot: false });
  },
  loadDesign(d: Design) {
    const s = get();
    set({ ...freshDocState({ designId: d.id, name: d.name, styleId: d.styleId, params: d.params }),
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
  /** Start from a style, with the Style page's traits laid over it. */
  loadStyle(id: string) {
    const st = styleById(id); if (!st) return;
    const traits = get().traits, params = { ...applyTraits(st.params, traits) }, n = Object.keys(traits).length;
    set({ params, styleId: id, switchedOn: [], picked: JSON.stringify(params) });
    actions.commit();
    actions.toast(`${st.name} loaded${n ? ` with ${n} ${n === 1 ? 'trait' : 'traits'}` : ''} — now make it yours`);
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
  toggleGroup(g: StyleGroup) { set(s => ({ groups: toggle(s.groups, g) })); },
  toggleMood(m: Mood) { set(s => ({ moods: toggle(s.moods, m) })); },
  toggleLook(l: Look) { set(s => ({ looks: toggle(s.looks, l) })); },
  toggleKind(k: Kind) { set(s => ({ kinds: toggle(s.kinds, k) })); },
  clearFilters() { set({ groups: [], moods: [], looks: [], kinds: [], query: '' }); },
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
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode: the choice lasts this visit */ }
  },
  setCards(cards: boolean) {
    set({ cards });
    try { if (cards) localStorage.removeItem(CARDS_KEY); else localStorage.setItem(CARDS_KEY, '1'); } catch { /* private mode: lasts this visit */ }
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
    set({ inspect: ch, part: null, ...(s.category === 'style' ? { category: 'weight' as const, active: 'weight' as const } : {}) });
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
  setFontGrid(fontGrid: boolean) {
    set({ fontGrid });
    try { if (fontGrid) localStorage.removeItem(FONT_GRID_KEY); else localStorage.setItem(FONT_GRID_KEY, '1'); } catch { /* private mode: lasts this visit */ }
  },
  setConstruction(construction: boolean) {
    set({ construction });
    try { if (construction) localStorage.setItem(CONSTRUCTION_KEY, '1'); else localStorage.removeItem(CONSTRUCTION_KEY); } catch { /* private mode: lasts this visit */ }
  },
  setPenMode(penMode: boolean) { set({ penMode }); },
  /** Give a letter drawn by hand back to the settings, which shape it again. */
  undrawLetter(ch: string) {
    const s = get();
    if (!s.params.outlines[ch]) return;
    const outlines = { ...s.params.outlines };
    delete outlines[ch];
    set({ params: { ...s.params, outlines } });
    actions.commit();
    actions.toast(`${ch} follows the settings again · ⌘Z brings the drawing back`);
  },
  setExportOpen(exportOpen: boolean) { set({ exportOpen }); },
  toast(msg: string) { set({ toast: { id: ++toastId, msg } }); }
};

export const isSerifSub = (k: ActiveKey) => k in SERIF_SUBS;
