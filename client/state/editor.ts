/* Editor state. One store for the open design (with undo history) and the UI around it.
   Actions live outside the store so components can import them without subscribing. */
import { create } from 'zustand';
import { SERIF_SUBS, STYLES, controlFor, firstControl, styleById, type ActiveKey, type CategoryId, type ControlKey, type Mood, type StyleGroup } from '../../shared/content';
import { ALL_CHARS, buildFont, type Font } from '../../shared/engine';
import { DEFAULT_NAME, type Design, type DesignInput } from '../../shared/design';
import type { Params } from '../../shared/params';

export type CardView = 'grid' | 'list';

const VIEW_KEY = 'typelab.cardView';
const savedView = (): CardView => {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
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
  /** Style page layout: cards in a grid, or one per row */
  view: CardView;
  inspect: string | null;
  part: string | null;
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
    part: null
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
  view: savedView(),
  inspect: null,
  part: null,
  skeleton: false,
  exportOpen: false,
  toast: null
}));

const set = useEditor.setState, get = useEditor.getState;

const toggle = <T,>(list: T[], x: T) => list.includes(x) ? list.filter(y => y !== x) : [...list, x];

export const isDirty = (s: EditorState) => docSnap(s) !== s.saved;

/** The key whose affected parts are highlighted, or null. Serif sub-sliders highlight serifs. */
export const hlKeyOf = (s: EditorState): ControlKey | null =>
  s.hot && s.category !== 'style' ? controlFor(s.active) : null;

/* ---------------------------------------------------------------- fonts
   Params objects are replaced on every change, so a WeakMap gives each exactly one build. */
const fonts = new WeakMap<Params, Font>();
export function fontFor(p: Params): Font {
  let f = fonts.get(p);
  if (!f) { f = buildFont(p); fonts.set(p, f); }
  return f;
}
export const useFont = () => fontFor(useEditor(s => s.params));

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

  /** Live change while dragging: no history entry until commit(). */
  setParam<K extends keyof Params>(key: K, v: Params[K]) {
    set(s => ({ params: { ...s.params, [key]: v } }));
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
    set({ params: { ...st.params }, styleId: id });
    actions.commit();
    actions.toast(`${st.name} loaded — now make it yours`);
  },
  /** Reset one slider to the starting style's value. */
  resetParam(key: keyof Params) {
    const st = styleById(get().styleId) ?? STYLES[0];
    actions.setOption(key, st.params[key]);
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
  clearFilters() { set({ groups: [], moods: [] }); },
  setView(view: CardView) {
    set({ view });
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode: the choice lasts this visit */ }
  },
  openInspector(ch: string) {
    if (!fontFor(get().params).glyph(ch)) return;
    const s = get();
    set({ inspect: ch, part: null, ...(s.category === 'style' ? { category: 'structure' as const, active: 'weight' as const } : {}) });
  },
  closeInspector() { set({ inspect: null, part: null }); },
  stepInspector(d: number) {
    const i = ALL_CHARS.indexOf(get().inspect ?? 'A');
    actions.openInspector(ALL_CHARS[(i + d + ALL_CHARS.length) % ALL_CHARS.length]);
  },
  setPart(part: string | null) { if (get().part !== part) set({ part }); },
  setSkeleton(skeleton: boolean) { set({ skeleton }); },
  setExportOpen(exportOpen: boolean) { set({ exportOpen }); },
  toast(msg: string) { set({ toast: { id: ++toastId, msg } }); }
};

export const isSerifSub = (k: ActiveKey) => k in SERIF_SUBS;
