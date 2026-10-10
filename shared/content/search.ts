/* Finding a setting by name: a control or nested slider, by its own words, words people use for it, or a
   shape it offers. */
import { FORM_OPTIONS, CONTROLS, SUBS, BAR_END_OPTIONS, FILL_OPTIONS, SERIF_BASE_OPTIONS, SERIF_INNER_OPTIONS, SERIF_SHAPE_OPTIONS, SERIF_SIDE_OPTIONS,
  SERIF_TIP_OPTIONS, STORY_OPTIONS, TERMINAL_FORM_LABELS, TERMINAL_OPTIONS, controlFor, type ActiveKey, type ControlKey, type FormKey } from './controls';
import { CATEGORIES } from './pages';
import type { CategoryId } from '../params';

/* ---------- finding a setting by name */

/** Words people reach for that a control's own copy doesn't use. */
const ALSO: Partial<Record<ActiveKey, string>> = {
  weight: 'bold heavy light thick thin black', slant: 'italic oblique lean', width: 'condensed expanded narrow wide', height: 'cap height size tall',
  rotation: 'rotate turn angle', mirror: 'flip reverse backwards', contrast: 'thick thin stress', letterSpacing: 'kerning tracking',
  mono: 'typewriter code fixed width', wobble: 'rough sketchy organic jitter', cursive: 'script connected joined', flourish: 'swash flourish stylistic alternate ornament heart loop', swell: 'pressure shade pointed pen nib copperplate taper', fill: 'outline texture pattern halftone',
  terminal: 'tip ending finish', serif: 'feet slab', roundness: 'soft rounded radius', xHeight: 'lowercase', counter: 'bowl inside',
  aperture: 'opening mouth', extenders: 'ascender descender', build: 'blocks stroke construction', stencil: 'gap cut break', slice: 'cut line split',
  squareness: 'squircle', chamfer: 'octagon angular', joints: 'traps notch', swash: 'flourish', dots: 'tittle period i j'
};

export interface SettingHit {
  key: ActiveKey;
  /** the page it is on */
  page: Exclude<CategoryId, 'style'>;
  label: string;
  /** the control a nested slider sits under */
  parent?: string;
  /** the named shape the search found it by, as Slab under Serifs */
  option?: string;
}

type Entry = SettingHit & { fields: [string, number][]; shapes: string[] };
const terms = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** Whether every word of `q` starts a word of `text` (both already lowercase, split by spaces). */
const covers = (text: string, q: string[]) => q.every(w => ` ${text}`.includes(` ${w}`));
const opt = (list: readonly (readonly [string, string])[]) => list.map(o => o[1]);

let INDEX: Entry[] | null = null;
function settingIndex(): Entry[] {
  if (INDEX) return INDEX;
  // the named shapes each control lets you pick
  const shapes: Partial<Record<ControlKey, string[]>> = {
    terminal: [...opt(TERMINAL_OPTIONS), ...Object.values(TERMINAL_FORM_LABELS), ...opt(FORM_OPTIONS.terminalRun.options)],
    serif: opt(SERIF_SHAPE_OPTIONS), serifTip: opt(SERIF_TIP_OPTIONS), serifBase: opt(SERIF_BASE_OPTIONS), serifSides: opt(SERIF_SIDE_OPTIONS),
    serifInner: opt(SERIF_INNER_OPTIONS), story: [...opt(STORY_OPTIONS), ...opt(FORM_OPTIONS.aForm.options)], fill: opt(FILL_OPTIONS), crossbar: opt(BAR_END_OPTIONS)
  };
  for (const k of Object.keys(FORM_OPTIONS) as FormKey[]) if (k in CONTROLS) shapes[k as ControlKey] = opt(FORM_OPTIONS[k].options);
  const pageName = (c: ControlKey) => CATEGORIES.find(x => x.id === CONTROLS[c].cat)!.label;
  const entries: Entry[] = (Object.keys(CONTROLS) as ControlKey[]).map(k => {
    const c = CONTROLS[k], named = [...new Set(shapes[k] ?? [])];
    return { key: k, page: c.cat, label: c.label, shapes: named, fields: [[c.label, 100], [ALSO[k] ?? '', 85], [c.tech, 60], [c.friendly, 50],
      [`${c.lo ?? ''} ${c.hi ?? ''}`, 40], [named.join(' '), 65], [pageName(k), 20], [c.explain, 10]] };
  });
  for (const k of Object.keys(SUBS) as (keyof typeof SUBS)[]) {
    const d = SUBS[k], parent = controlFor(k), c = CONTROLS[parent];
    // a stencil's and a slice's thickness is their own value: the control itself already stands for it
    if (parent === k) continue;
    entries.push({ key: k, page: c.cat, label: d.label, parent: c.label, shapes: [], fields: [[`${c.label} ${d.label}`, 80], [ALSO[k] ?? '', 85], [d.tech, 60],
      [d.friendly, 50], [`${d.lo} ${d.hi}`, 30], [pageName(parent), 15]] });
  }
  return (INDEX = entries.map(e => ({ ...e, fields: e.fields.map(([t, w]) => [terms(t).join(' '), w] as [string, number]) })));
}

/** The settings whose words start with every word of `query`, best first: a match in a setting's
    name beats one in its description, and an earlier page breaks ties. A named shape the setting
    was found by, rather than its name, comes back as `option` (Slab, under Serifs). */
export function findSettings(query: string, limit = 12): SettingHit[] {
  const q = terms(query);
  if (!q.length) return [];
  const order = (h: SettingHit) => CATEGORIES.findIndex(c => c.id === h.page);
  const hits: (SettingHit & { score: number })[] = [];
  for (const e of settingIndex()) {
    let score = 0;
    for (const w of q) {
      const best = Math.max(0, ...e.fields.filter(([text]) => covers(text, [w])).map(([, weight]) => weight));
      if (!best) { score = 0; break; }
      score += best;
    }
    if (!score) continue;
    const label = e.fields[0][0];
    if (label.startsWith(q.join(' '))) score += 30;
    const option = covers(label, q) ? undefined : e.shapes.find(n => covers(terms(n).join(' '), q));
    hits.push({ key: e.key, page: e.page, label: e.label, parent: e.parent, option, score });
  }
  return hits.sort((a, b) => b.score - a.score || order(a) - order(b)).slice(0, limit).map(({ score: _, ...h }) => h);
}
