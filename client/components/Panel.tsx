/* Right-hand panel: the starting-style filters, or the controls of the open category with a
   live explainer. While a letter is inspected, the sliders are grouped by the parts of that
   letter they shape; pointing at a part name highlights it on the letter. Every control leads with plain language; the typographic term comes second. */
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import {
  ANATOMY, BAR_END_OPTIONS, BLOCK_CONTROLS, BOWL_SUBS, PINCH_SUBS, CROSSBAR_SUBS, SERIF_ARM_SUBS, CATEGORIES, CONTROLS, DOT_SUBS, FILL_OPTIONS, FILL_SUBS, FORM_OPTIONS, MOODS, PAGE_STYLES, PART_CONTROL, SERIF_BASE_OPTIONS, SERIF_BASE_SUBS, SERIF_DETAILS, SERIF_INNER_OPTIONS, SERIF_INNER_SUBS, SERIF_SHAPE_OPTIONS, SERIF_SIDE_OPTIONS, SERIF_SIZES, SERIF_SUBS, SERIF_TIP_DETAILS, SERIF_TIP_OPTIONS, SERIF_TIP_SUBS, STORY_OPTIONS,
  SLICE_SUBS, STENCIL_SUBS, SUBS, TAG_FACE, TERMINAL_DETAILS, TERMINAL_FORM_LABELS, TERMINAL_OPTIONS, TERMINAL_SUBS, ROUND_SUBS, WEIGHT_SUBS, controlFor, styleById,
  type ActiveKey, type CategoryId, type ControlKey, type FillSubKey, type FormKey, type SerifInnerSubKey, type Mood, type StyleFilter
} from '../../shared/content';
import { TERMINAL_FORMS, formOf, isGlyphKey, rotationDeg, type GlyphParams, type NumericParam, type Params } from '../../shared/params';
import { n1 } from '../lib/hooks';
import { sampleText } from '../lib/preview';
import { reachOf, type Reach } from '../lib/reach';
import { cmdsToD, scriptForms, type Glyph } from '../../shared/engine';
import { letterCorners, letterJoins, letterStrokes, strokeEnds, type CornerInfo, type JoinInfo, type StrokeEndInfo, type StrokeInfo } from '../lib/drag';
import { actions, adjustedParams, curlOf, endOf, fontFor, isOn, letterOf, paramOf, useEditor, useFont, useParam, useScopedFont, useStyleMatch, type EndKey, type StyleTab } from '../state/editor';
import { TRAIT_SECTIONS, type TraitDef } from '../../shared/traits';
import { BarEndsIcon, Diagram, FillIcon, FormIcon, SerifIcon, SerifSidesIcon, StoryIcon, TerminalIcon } from './Diagram';
import { ScopeIcon, letterControls } from './Inspector';
import { SliderIcon } from './SliderIcons';

export function Panel() {
  const category = useEditor(s => s.category), customizing = useEditor(s => !!letterOf(s));
  return (
    <aside className={customizing ? 'panel customizing' : 'panel'} aria-label={category === 'style' ? 'Find and adjust styles' : 'Controls'} data-guide="panel"
      onPointerLeave={() => { actions.setHot(false); actions.setPart(null); }}>
      {category === 'style' ? <StylePanel /> : <ControlsPanel category={category} />}
    </aside>
  );
}

/** The Style page's panel opens on its Filter or Adjust tab; the stage's "Skip to filters" and
    clearing the filters move focus to the open tab. */
export const SEARCH_ID = 'style-search';
export const focusFilters = () => document.querySelector<HTMLElement>('.style-tabs [aria-selected=true]')?.focus();
/** Open the Filter tab and put the cursor in its search box (the / key). */
export const focusSearch = () => {
  actions.setStyleTab('filter');
  requestAnimationFrame(() => document.getElementById(SEARCH_ID)?.focus());
};

const STYLE_TABS: [StyleTab, string][] = [['filter', 'Filter'], ['adjust', 'Adjust']];

/** Style page: Filter narrows the starting styles by search and tag; Adjust lays traits over every
    one of them, so each card shows its style with them and any mix can be started from. */
function StylePanel() {
  const tab = useEditor(s => s.styleTab);
  const nFilters = useEditor(s => s.groups.length + s.kinds.length + s.moods.length + (s.query.trim() ? 1 : 0));
  const nTraits = useEditor(s => Object.keys(s.traits).length);
  const counts = { filter: nFilters, adjust: nTraits };
  const move = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = tab === 'filter' ? 'adjust' : 'filter';
    actions.setStyleTab(next);
    requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
  };
  return (
    <div className="panel-pad filters">
      <div className="style-tabs" role="tablist" aria-label="Style panel">
        {STYLE_TABS.map(([id, label]) => (
          <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`tp-${id}`} tabIndex={tab === id ? 0 : -1}
            className={tab === id ? 'on' : undefined} onClick={() => actions.setStyleTab(id)} onKeyDown={move}>
            {label}{counts[id] > 0 && <span className="facet-picked" aria-label={`, ${counts[id]} on`}>{counts[id]}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`tp-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'filter' ? <StyleFilters /> : <StyleTraits />}
      </div>
    </div>
  );
}

/** Search, then the feelings. The kind of letters and their genre are what the style finder asks
    on the stage, so they aren't asked again here. */
function StyleFilters() {
  const { f, matches } = useStyleMatch();
  // each tag's count is what picking it would show, given the other filters
  const count = (pick: Partial<StyleFilter>) => PAGE_STYLES.filter(s => matches(s, pick)).length;
  const picked = f.groups.length + f.kinds.length + f.moods.length > 0 || !!f.query?.trim();
  return (
    <>
      <div className="search-row">
        <div className="search-field">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" /><path d="m10.4 10.4 3.6 3.6" /></svg>
          <input id={SEARCH_ID} type="search" spellCheck={false} autoComplete="off" placeholder="Search styles, fonts, feelings"
            aria-label="Search styles" aria-keyshortcuts="/" value={f.query}
            onChange={e => actions.setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape' && f.query) { e.stopPropagation(); actions.setQuery(''); } }} />
          <kbd aria-hidden="true">/</kbd>
        </div>
        {/* the button leaves once pressed, so focus goes back to the tab rather than the page */}
        {picked && <button className="btn ghost small" aria-label="Clear filters" onClick={() => { actions.clearFilters(); focusFilters(); }}>Clear</button>}
      </div>
      <ChipFacet id="feeling" label="Feeling" tags={MOODS} picked={f.moods} count={m => count({ moods: [m] })} toggle={actions.toggleMood} />
    </>
  );
}

/** The Adjust tab: every trait as a row of named steps, each drawn as the current style would look
    with it. A step applies to every card at once; picking it again (or Any) hands the trait back
    to each style. */
function StyleTraits() {
  const n = useEditor(s => Object.keys(s.traits).length);
  return (
    <>
      <div className="traits-head">
        <p>Every style takes on the traits you set here. Mix them to make any face.</p>
        <div className="traits-tools">
          <button className="btn ghost small" onClick={actions.shuffleTraits} title="Pick a random mix of traits">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5h2.5c3.5 0 3.5 7 7 7H14M2 11.5h2.5c1.4 0 2.2-1.1 2.9-2.4M9.6 6.9c.7-1.3 1.5-2.4 2.9-2.4H14M12 2.5l2 2-2 2M12 9.5l2 2-2 2" /></svg>
            Shuffle
          </button>
          {n > 0 && <button className="btn ghost small" onClick={() => { actions.clearTraits(); focusFilters(); }}>Clear</button>}
        </div>
      </div>
      {TRAIT_SECTIONS.map(sec => (
        <div key={sec.id} className="facet trait-set" role="group" aria-labelledby={`t-${sec.id}`}>
          <h3 className="facet-label" id={`t-${sec.id}`}>{sec.label}</h3>
          {sec.traits.map(t => <TraitRow key={t.id} def={t} />)}
        </div>
      ))}
    </>
  );
}

/** Height of the drawing on a trait step, in px. */
const TRAIT_H = 24;

/** Where the longer step names may break, with a hyphen, when a narrow panel leaves them no room:
    a soft hyphen shows only at a break, so "Condensed" stays whole wherever it fits. */
const SOFT: Record<string, string> = {
  Condensed: 'Con\u00addensed', Extended: 'Ex\u00adtended', Bracketed: 'Brack\u00adeted',
  Hairline: 'Hair\u00adline', Moderate: 'Mod\u00aderate', Squarish: 'Squar\u00adish'
};

function TraitRow({ def }: { def: TraitDef }) {
  const picked = useEditor(s => s.traits[def.id]), traits = useEditor(s => s.traits);
  const base = useEditor(s => styleById(s.styleId)) ?? PAGE_STYLES[0];
  return (
    <div className="trait" role="group" aria-labelledby={`tr-${def.id}`}>
      <div className="trait-head">
        <span className="trait-label" id={`tr-${def.id}`} title={def.hint}>{def.label}</span>
        {picked
          ? <button className="trait-any" onClick={() => actions.setTrait(def.id, null)} title="Let each style keep its own">Any</button>
          : <span className="trait-hint">{def.hint}</span>}
      </div>
      <div className="trait-opts" style={{ gridTemplateColumns: `repeat(${def.options.length}, minmax(0, 1fr))` }}>
        {def.options.map(o => (
          <button key={o.id} className={picked === o.id ? 'opt on' : 'opt'} aria-pressed={picked === o.id}
            onClick={() => actions.setTrait(def.id, o.id)}>
            <Specimen params={adjustedParams(base, { ...traits, [def.id]: o.id })} text={def.sample} h={TRAIT_H} />
            <span>{SOFT[o.label] ?? o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** `text` drawn in a font made from `params`, its ink fitted into `h` px high and `maxW` px wide, so
    each step of a trait fills its button. Hidden from screen readers. */
function Specimen({ params, text, h, maxW = 44 }: { params: Params; text: string; h: number; maxW?: number }) {
  const f = fontFor(params), items = f.layout(text, Infinity)[0].items.filter(it => f.glyph(it.ch));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) {
    for (const c of f.glyph(it.ch)!.cmds) {
      for (let i = 1; i + 1 < c.length && typeof c[i] === 'number'; i += 2) {
        x0 = Math.min(x0, it.x + c[i]); x1 = Math.max(x1, it.x + c[i]); y0 = Math.min(y0, -c[i + 1]); y1 = Math.max(y1, -c[i + 1]);
      }
    }
  }
  if (!(x0 < x1)) return null;
  const sc = Math.min(h / (y1 - y0), maxW / (x1 - x0)), W = n1((x1 - x0) * sc);
  return (
    <svg className="specimen" width={W} height={h} viewBox={`0 0 ${W} ${h}`} aria-hidden="true">
      <g transform={`translate(0 ${n1((h - (y1 - y0) * sc) / 2)}) scale(${sc}) translate(${n1(-x0)} ${n1(-y0)})`}>
        {items.map((it, j) => <path key={j} d={f.glyph(it.ch)!.d} transform={`translate(${n1(it.x)},0)`} />)}
      </g>
    </svg>
  );
}

/** Chips a long facet shows before "Show more". Picked chips always stay visible. */
const FACET_LIMIT = 8;

/** One section of tag chips. Its heading opens and closes it; a long one also folds down to its first few until expanded. */
function ChipFacet<T extends Mood>({ id, label, tags, picked, count, toggle }: {
  id: string; label: string; tags: { id: T; label: string; hint?: string }[]; picked: T[];
  count: (tag: T) => number; toggle: (tag: T) => void;
}) {
  const [closed, setClosed] = useState(false);
  const [open, setOpen] = useState(false);
  // folding away just one or two chips saves no room, so only long sections fold
  const folds = tags.length > FACET_LIMIT + 2;
  const shown = open || !folds ? tags : tags.filter((t, i) => i < FACET_LIMIT || picked.includes(t.id));
  const more = tags.length - shown.length;
  const nPicked = tags.filter(x => picked.includes(x.id)).length;
  return (
    <div className="facet" role="group" aria-labelledby={`f-${id}`}>
      <h3 className="facet-h">
        <button className="facet-head" aria-expanded={!closed} aria-controls={`c-${id}`} onClick={() => setClosed(!closed)}
          aria-label={closed && nPicked > 0 ? `${label}, ${nPicked} selected` : undefined}>
          <span className="facet-label" id={`f-${id}`}>{label}</span>
          {/* a closed section still says how many of its tags are picked */}
          {closed && nPicked > 0 && <span className="facet-picked">{nPicked}</span>}
          <svg className="facet-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5" /></svg>
        </button>
      </h3>
      <div className={closed ? 'reveal' : 'reveal open'} id={`c-${id}`} inert={closed}>
        <div>
          <div className="facet-body">
            <div className="chips" id={`chips-${id}`}>
              {shown.map(({ id: tag, label, hint }) => {
                const on = picked.includes(tag), n = count(tag), none = !n && !on;
                // a tag with no matches stays focusable, so it can still be found, but does nothing
                return (
                  <button key={tag} className={on ? 'chip on' : 'chip'} title={hint} aria-pressed={on} aria-disabled={none || undefined}
                    aria-label={`${label}, ${n} ${n === 1 ? 'style' : 'styles'}`} onClick={() => { if (!none) toggle(tag); }}>
                    <TagText tag={tag} label={label} /><span className="count" aria-hidden="true">{n}</span>
                  </button>
                );
              })}
            </div>
            {(open || more > 0) && (
              <button className="facet-more" aria-expanded={open} aria-controls={`chips-${id}`} onClick={() => setOpen(!open)}>
                {open ? 'Show less' : `Show ${more} more`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Cap height of a tag label in px, so every face reads at about the size of the UI text. */
const TAG_CAP = 9.5;

/** A face drawn as small as a chip label keeps its character but not its hairlines: contrast is
    eased toward even and the lightest weights are raised, so "Fancy" doesn't lose the arm of its F. */
const legible = (p: Params): Params => ({
  ...p,
  weight: Math.max(p.weight, 0.36),
  contrast: Math.min(Math.max(p.contrast, 0.35), 0.66),
  vWeight: Math.max(p.vWeight, 0.45),
  hWeight: Math.max(p.hWeight, 0.45)
});

/** A filter tag's name, drawn in a starting style that belongs to it. The chip carries the
    name for screen readers, so the drawing is hidden from them. */
function TagText({ tag, label }: { tag: Mood; label: string }) {
  const f = fontFor(legible(styleById(TAG_FACE[tag])!.params));
  const sc = TAG_CAP / f.m.cap, top = Math.max(f.m.asc, f.m.cap), line = f.layout(label, Infinity)[0];
  const W = n1(line.width * sc), H = n1((top - f.m.desc) * sc);
  return (
    <span className="tag-face">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <g transform={`scale(${sc})`}>
          {line.items.map((it, j) => {
            const g = f.glyph(it.ch);
            return g && <path key={j} d={g.d} transform={`translate(${n1(it.x)},${n1(top)})`} />;
          })}
        </g>
      </svg>
    </span>
  );
}

function ControlsPanel({ category }: { category: Exclude<CategoryId, 'style'> }) {
  const serifs = useParam('serif'), shape = useParam('serifShape'), wedge = shape === 'wedge' || shape === 'diamond', outside = useParam('serifSides') === 'outside';
  const blocks = useParam('build') === 'blocks';
  // the Serifs page has nothing to shape while serifs are off, a wedge or a diamond, already a point, has no tip to finish,
  // and serifs that only reach out of the letter leave none inside it; letters built from blocks have no
  // strokes, so only the controls that shape blocks show
  const all = (Object.keys(CONTROLS) as ControlKey[]).filter(k => CONTROLS[k].cat === category);
  const keys = all.filter(k => (!blocks || BLOCK_CONTROLS.includes(k)) &&
    (category !== 'serifs' || k === 'serif' || (serifs && !(wedge && k === 'serifTip') && !(outside && k === 'serifInner'))));
  const inspecting = useEditor(s => !!s.inspect);
  const note = blocks && keys.length < all.length
    ? <p className="page-note">{keys.length ? 'Letters built from blocks use only these settings here.' : 'Letters built from blocks have nothing to shape here.'} Switch Built from back to Strokes for the rest.</p>
    : category === 'serifs' && !serifs && <p className="page-note">Switch serifs on to shape their tips, their base and where they reach.</p>;
  return (
    <>
      <Explainer />
      {inspecting ? <LetterControls keys={keys} category={category} /> : <div className="ctl-list">{keys.map(k => <Control key={k} k={k} />)}{note}</div>}
    </>
  );
}

/** The inspected letter's sliders, named by the parts they shape, then the rest of the category. */
function LetterControls({ keys, category }: { keys: ControlKey[]; category: Exclude<CategoryId, 'style'> }) {
  const ch = useEditor(s => s.inspect)!, font = useFont(), customizing = useEditor(s => !!letterOf(s));
  const drawn = useEditor(s => !!s.params.outlines[ch]);
  const g = font.glyph(ch);
  const rows = g ? letterControls(g, ch, font.letter(ch).params.serif) : [];
  const rest = keys.filter(k => !rows.some(r => r.key === k));
  return (
    <div className="ctl-list">
      {customizing && <div className="scope-note"><ScopeIcon id="letter" /><span>Only {ch} changes. Settings tagged <em>Whole font</em> still change every letter.</span></div>}
      {drawn && (
        <div className="reach-banner">
          <span>{ch} is drawn by hand, so these settings don’t change it.</span>
          <button className="link small" onClick={() => actions.undrawLetter(ch)}>Back to settings</button>
        </div>
      )}
      <div className="list-head">Parts of {ch}</div>
      {rows.map(r => <Control key={r.key} k={r.key} parts={r.parts} />)}
      {rest.length > 0 && <div className="list-head">More {CATEGORIES.find(c => c.id === category)?.label.toLowerCase()}</div>}
      {rest.map(k => <Control key={k} k={k} />)}
    </div>
  );
}

function Control({ k, parts }: { k: ControlKey; parts?: string[] }) {
  const c = CONTROLS[k];
  if (c.type === 'options') return <TerminalControl parts={parts} />;
  if (c.type === 'story') return <StoryControl parts={parts} />;
  if (c.type === 'form') return <FormControl k={k as LetterFormKey} parts={parts} />;
  if (k === 'roundness') {
    return (
      <SliderControl k={k} def={c} parts={parts}>
        <SliderControl k="joinRound" def={ROUND_SUBS.joinRound} />
        <SliderControl k="innerRound" def={ROUND_SUBS.innerRound} />
        <EachCorner />
      </SliderControl>
    );
  }
  if (k === 'weight') {
    return (
      <SliderControl k={k} def={c} parts={parts}>
        <SliderControl k="vWeight" def={WEIGHT_SUBS.vWeight} />
        <SliderControl k="hWeight" def={WEIGHT_SUBS.hWeight} />
        <EachStroke />
      </SliderControl>
    );
  }
  if (k === 'pinch') {
    return (
      <SliderControl k={k} def={c} parts={parts}>
        <SliderControl k="pinchPos" def={PINCH_SUBS.pinchPos} />
      </SliderControl>
    );
  }
  if (k === 'serifArms') {
    return (
      <SliderControl k={k} def={c} parts={parts}>
        <SliderControl k="serifArmThickness" def={SERIF_ARM_SUBS.serifArmThickness} />
        <SliderControl k="serifArmLean" def={SERIF_ARM_SUBS.serifArmLean} />
      </SliderControl>
    );
  }
  if (k === 'crossbar') {
    return (
      <SliderControl k={k} def={c} parts={parts}>
        <BarEndsControl />
      </SliderControl>
    );
  }
  if (k === 'stencil' || k === 'slice') return <CutControl k={k} parts={parts} />;
  if (c.type === 'serif') return <SerifControl parts={parts} />;
  if (c.type === 'serifForm') return <SerifFormControl k={k as SerifFormKey} />;
  if (c.type === 'fill') return <FillControl />;
  return <SliderControl k={k as NumericParam & ControlKey} def={c} parts={parts} />;
}

/** A control's short title. While a letter is inspected, the parts it shapes follow in grey and each one can be pointed at. */
function CtlHead({ k, label, parts, advanced, icon }: { k: keyof Params; label: string; parts?: string[]; advanced?: boolean; icon?: string }) {
  const part = useEditor(s => s.part);
  const inspect = useEditor(s => s.inspect), letter = useEditor(letterOf);
  const own = useEditor(s => !!s.inspect && isGlyphKey(k) && s.params.glyphs[s.inspect]?.[k] !== undefined);
  const tag = scopeTag(inspect, letter, own, k);
  return (
    <div className="ctl-head">
      <span className="ctl-label">{icon && <SliderIcon k={icon} />}{label}{advanced && <em>Advanced</em>}{tag && <em className={tag.own ? 'own' : undefined} title={tag.title}>{tag.text}</em>}</span>
      {!!parts?.length && (
        <span className="ctl-parts">
          {parts.map(p => (
            <span key={p} className={p === part ? 'part on' : 'part'}
              onPointerEnter={() => actions.setPart(p)} onPointerLeave={() => actions.setPart(null)}>{ANATOMY[p][0]}</span>
          ))}
        </span>
      )}
    </div>
  );
}
/** While a letter is inspected: whether it has its own value of `k`, and while edits go to that
    letter, which controls still change every letter. */
function scopeTag(inspect: string | null, letter: string | null, own: boolean, k: keyof Params) {
  if (!inspect) return null;
  if (own) {
    return { own: true, text: 'Custom', title: letter ? `Only ${inspect} has this value. Double-click the slider to sync it with the other letters.` : `${inspect} keeps its own value when this changes` };
  }
  return letter && !isGlyphKey(k) ? { own: false, text: 'Whole font', title: `Every letter shares this setting, so it changes all of them even while customizing ${letter}` } : null;
}

/** The long controls, whose settings fold away under their heading. */
type FoldKey = 'terminal' | 'serif' | 'fill';

/** A long control's heading: its title, then a chevron that folds the rest of it away. Folded, it
    names the current choice. `tools` sit before the chevron (the serif switch); while `shut` (serifs
    switched off) there is nothing to fold, so the chevron hides. */
function FoldHead({ k, label, parts, summary, tools, shut }: { k: FoldKey; label: string; parts?: string[]; summary: string; tools?: ReactNode; shut?: boolean }) {
  const folded = useEditor(s => s.folded.includes(k));
  return (
    <div className="ctl-top fold-head">
      <CtlHead k={k} label={label} parts={parts} />
      <div className="ctl-tools">
        {folded && !shut && <span className="fold-sum">{summary}</span>}
        {tools}
        <button className="fold-btn" disabled={shut} aria-expanded={!folded && !shut} aria-controls={`fold-${k}`}
          aria-label={`${folded ? 'Show' : 'Hide'} ${label.toLowerCase()} settings`} title={folded ? 'Show settings' : 'Hide settings'}
          onClick={() => actions.toggleFold(k)}>
          <svg className="facet-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5" /></svg>
        </button>
      </div>
    </div>
  );
}

/** The body under a FoldHead, open unless folded or `shut`; `quiet` while its control changes nothing in view. */
function Fold({ k, shut, quiet = false, children }: { k: FoldKey; shut?: boolean; quiet?: boolean; children: ReactNode }) {
  const open = !useEditor(s => s.folded.includes(k)) && !shut;
  return (
    <div className={open ? 'reveal fold open' : 'reveal fold'} id={`fold-${k}`} inert={!open}>
      <div><div className="fold-body"><Quiet.Provider value={quiet}>{children}</Quiet.Provider></div></div>
    </div>
  );
}

function Explainer() {
  const active = useEditor(s => s.active), inspecting = useEditor(s => !!s.inspect), font = useFont();
  const part = useEditor(s => s.inspect ? s.part : null), tips = useEditor(s => s.tips);
  const c = CONTROLS[controlFor(active)], sub = SUBS[active as keyof typeof SUBS];
  const shapedBy = part && PART_CONTROL[part];
  const close = (
    <button className="btn ghost icon small ex-close" onClick={() => actions.setTips(false)} aria-label="Hide explanation" title="Hide explanation">
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
    </button>
  );
  // while inspecting, the large letter on the stage already shows the part, so drop the diagram
  return (
    <div className={inspecting ? 'explainer compact' : 'explainer'}>
      {!inspecting && <div className="diagram-box"><Diagram font={font} k={active} /></div>}
      {!tips ? (
        <button className="ex-open" onClick={() => actions.setTips(true)} aria-expanded={false}>
          Show explanation
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg>
        </button>
      ) : part ? (
        <div className="ex-text">
          {close}
          <div className="ex-tech">Anatomy{shapedBy && ` · shaped by ${CONTROLS[shapedBy].tech.split(' · ')[0]}`}</div>
          <h3>{ANATOMY[part][0]}</h3>
          <p>{ANATOMY[part][1]}</p>
        </div>
      ) : (
        <div className="ex-text">
          {close}
          <div className="ex-tech">{(sub ?? c).tech}</div>
          <h3>{(sub ?? c).friendly}</h3>
          <p>{c.explain}</p>
        </div>
      )}
    </div>
  );
}

/** Pointing at or focusing a control makes it the active one. Nested controls (serif
    sub-sliders) win over their parent. */
/** Also marks a control that, while a letter is customized, reshapes only that letter. */
function useControlFocus(key: ActiveKey) {
  const own = (e: PointerEvent | FocusEvent) => (e.target as Element).closest('.ctl') === e.currentTarget;
  const letterOnly = useEditor(s => !!letterOf(s) && isGlyphKey(key));
  return {
    'data-letter': letterOnly || undefined,
    onPointerOver: (e: PointerEvent) => { if (own(e)) actions.focusControl(key); },
    onFocus: (e: FocusEvent) => { if (own(e)) actions.focusControl(key); }
  };
}

/** Set inside a control that already says it changes nothing in view, so the settings nested in it don't say so again. */
const Quiet = createContext(false);
/** What a letter drawn by hand answers: no setting reaches it, and the panel says why once, at the top. */
const DRAWN: Reach = { shows: false, elsewhere: [] };
const reaches = new WeakMap<Params, Map<string, Reach>>();

/** Whether `k` changes what is in view: the inspected letter, or else the letters of the preview. Worked out
    a moment after the settings stop changing, so dragging stays smooth; null until then. */
function useReach(k: keyof Params, skip: boolean): Reach | null {
  const inspect = useEditor(s => s.inspect), letter = useEditor(letterOf);
  const text = useEditor(s => (s.inspect ? '' : sampleText(s.custom)));
  const view = `${k}|${inspect ?? ''}|${letter ?? ''}|${text}`;
  const cached = (p: Params) => reaches.get(p)?.get(view);
  const [r, setR] = useState<{ view: string; reach: Reach } | null>(null);
  useEffect(() => {
    if (skip) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const show = (reach: Reach) => setR(o => o?.view === view && o.reach.shows === reach.shows && o.reach.elsewhere.join() === reach.elsewhere.join() ? o : { view, reach });
    const work = () => {
      const p = useEditor.getState().params;
      if (inspect && p.outlines[inspect]) return show(DRAWN);
      let reach = cached(p);
      if (!reach) {
        const f = fontFor(p), chars = inspect ? [inspect] : [...new Set(text)].filter(c => f.glyph(c));
        reach = reachOf(p, k, chars, letter);
        if (!reaches.has(p)) reaches.set(p, new Map());
        reaches.get(p)!.set(view, reach);
      }
      show(reach);
    };
    const later = () => { clearTimeout(t); t = setTimeout(work, 150); };
    if (cached(useEditor.getState().params)) work(); else later();
    const stop = useEditor.subscribe((s, o) => { if (s.params !== o.params) later(); });
    return () => { clearTimeout(t); stop(); };
    // `view` holds k, the letter and the text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, skip]);
  return skip || r?.view !== view ? null : r.reach;
}

/** A control's answer to "does this do anything here?": `idle` dims it, `note` says why and where it does show,
    and `quiet` goes to the settings nested in it. */
function useReachNote(k: keyof Params) {
  const quiet = useContext(Quiet), reach = useReach(k, quiet), idle = !!reach && !reach.shows;
  return { idle, quiet: quiet || idle, note: idle && <ReachNote k={k} reach={reach} /> };
}

/** Under a control that changes nothing in view: what it doesn't change, and up to three letters it does, each opening that letter. */
function ReachNote({ k, reach }: { k: keyof Params; reach: Reach }) {
  const ch = useEditor(s => s.inspect), letter = useEditor(letterOf);
  const own = useEditor(s => !!s.inspect && !letterOf(s) && isGlyphKey(k) && s.params.glyphs[s.inspect]?.[k] !== undefined);
  if (reach === DRAWN) return null;
  if (own && ch) {
    return (
      <p className="reach-note">
        <span>{ch} has its own value here, so this changes only the other letters.</span>
        <button className="link small" onClick={() => actions.shareParam(ch, k as keyof GlyphParams)}>Match the others</button>
      </p>
    );
  }
  const what = !reach.elsewhere.length && !(letter && isGlyphKey(k)) ? 'Changes nothing in this design as it’s set now.'
    : ch ? `Doesn’t change ${ch}.` : 'Doesn’t change the letters shown.';
  return (
    <p className="reach-note">
      <span>{what}{reach.elsewhere.length > 0 && ' Try it on'}</span>
      {reach.elsewhere.map(c => (
        <button key={c} className="reach-ch" title={`Open ${c}`} aria-label={`Open ${c}`} onClick={() => actions.openInspector(c)}>{c}</button>
      ))}
    </p>
  );
}

interface SliderDef { label: string; friendly: string; tech: string; lo?: string; hi?: string; bipolar?: boolean; degrees?: boolean; advanced?: boolean; off?: number }

/** A slider. An optional one (with an `off` value) has a switch; switched off, its slider folds away. */
/** `children` follow the slider inside its control, like the corners under Roundness. `holdsOn`
    marks the amount of a control switched on above it (a stencil's thickness): using it keeps that open.
    `icon` names its drawing when that isn't `k`'s own (Stencil's Thickness shares the key `stencil`). */
function SliderControl({ k, def, parts, children, holdsOn, icon = k }: { k: NumericParam & ActiveKey; def: SliderDef; parts?: string[]; children?: ReactNode; holdsOn?: boolean; icon?: string }) {
  const value = useParam(k), active = useEditor(s => s.active === k);
  const optional = def.off !== undefined, on = useEditor(s => !optional || isOn(s, k, def.off!));
  // using the slider keeps it open, even dragged all the way to its off value
  const keep = () => { if (optional || holdsOn) actions.keepOn(k); };
  const reach = useReachNote(k);
  const cls = ['ctl', def.bipolar && 'bipolar', active && 'active', !on && 'off', reach.idle && 'idle'].filter(Boolean).join(' ');
  const nested = children && <Quiet.Provider value={reach.quiet}>{children}</Quiet.Provider>;
  return (
    <div className={cls} data-ctl={k} {...useControlFocus(k)}>
      <div className="ctl-top">
        <CtlHead k={k} label={def.label} parts={parts} advanced={def.advanced} icon={icon} />
        <div className="ctl-tools">
          {on && <NumberField value={value} label={def.tech} degrees={def.degrees} onChange={v => { keep(); actions.focusControl(k); actions.setParam(k, v); actions.commit(); }} />}
          {optional && (
            <button className={on ? 'switch on' : 'switch'} role="switch" aria-checked={on} aria-label={def.label}
              onClick={() => { actions.focusControl(k); actions.switchControl(k, !on, def.off!); }}><i /></button>
          )}
        </div>
      </div>
      {reach.note}
      <div className={on ? 'reveal open' : 'reveal'} inert={!on}>
        <div>
          <Range
            value={value}
            label={def.tech}
            steps={def.degrees ? 360 : 100}
            onInput={v => {
              // the middle is sticky: near 50 snaps onto the dot; a turn snaps onto the quarter turns
              const q = Math.round(v * 4) / 4;
              if (def.degrees ? Math.abs(v - q) * 360 <= 3 : Math.abs(v - 0.5) <= 0.03) v = def.degrees ? q : 0.5;
              keep();
              actions.focusControl(k);
              actions.setParam(k, v);
            }}
            onCommit={actions.commit}
            onReset={() => { keep(); actions.resetParam(k); }}
          />
          <div className="ctl-ends"><span>{def.lo}</span><span>{def.hi}</span></div>
          {optional && nested}
        </div>
      </div>
      {!optional && nested}
    </div>
  );
}

/** The crossbars' Gap and where it opens: at the bar's ends, or above and below it with the bar run
    through the strokes it meets. Picking a way while the bars are joined opens a gap to show it. */
function BarEndsControl() {
  const ends = useParam('barEnds'), gap = useParam('barGap');
  return (
    <>
      <div className="sub-label">Ends</div>
      <div className="opts two" role="radiogroup" aria-label="Crossbar gap">
        {BAR_END_OPTIONS.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={ends === id} className={ends === id ? 'opt on' : 'opt'}
            onClick={() => { actions.focusControl('barGap'); actions.setParam('barEnds', id); if (!gap) actions.setParam('barGap', 0.4); actions.commit(); }}>
            <BarEndsIcon ends={id} /><span>{label}</span>
          </button>
        ))}
      </div>
      <SliderControl k="barGap" def={CROSSBAR_SUBS.barGap} />
    </>
  );
}

/** Stencil and Slice: a switch, then how thick the cut is, where it runs and how round its corners are. */
function CutControl({ k, parts }: { k: 'stencil' | 'slice'; parts?: string[] }) {
  const c = CONTROLS[k], subs = k === 'stencil' ? STENCIL_SUBS : SLICE_SUBS;
  const on = useEditor(s => isOn(s, k, c.off!)), active = useEditor(s => controlFor(s.active) === k), reach = useReachNote(k);
  const cls = ['ctl', active && 'active', !on && 'off', reach.idle && 'idle'].filter(Boolean).join(' ');
  return (
    <div className={cls} data-ctl={k} {...useControlFocus(k)}>
      <div className="ctl-top">
        <CtlHead k={k} label={c.label} parts={parts} icon={k} />
        <div className="ctl-tools">
          <button className={on ? 'switch on' : 'switch'} role="switch" aria-checked={on} aria-label={c.label}
            onClick={() => { actions.focusControl(k); actions.switchControl(k, !on, c.off!); }}><i /></button>
        </div>
      </div>
      {reach.note}
      <div className={on ? 'reveal open' : 'reveal'} inert={!on}>
        <div>
          <Quiet.Provider value={reach.quiet}>
            {(Object.keys(subs) as (keyof typeof subs)[]).map(s => <SliderControl key={s} k={s} def={subs[s]} holdsOn={s === k} icon={s === k ? `${k}Gap` : s} />)}
          </Quiet.Provider>
        </div>
      </div>
      {k === 'stencil' && <EachJoin />}
    </div>
  );
}

/** While a letter is customized, a gap for each of its joins (where a stroke ends in another, or
    turns), each beside a picture of the letter with that join marked: the stroke pulled back from
    the one it meets, on or off the Stencil; while every letter is in sync, a way into customizing. */
function EachJoin() {
  const ch = useEditor(s => s.inspect), letter = useEditor(letterOf), font = useScopedFont();
  const g = ch ? font.glyph(ch) : null, joins = g ? letterJoins(g) : [];
  if (!ch || !g || !joins.length) return null;
  if (!letter) {
    return (
      <div className="each-end locked">
        <JoinThumb g={g} joins={joins} />
        <div className="sub-label">Each join</div>
        {/* setting them one by one customizes the letter, so the button says what it's for */}
        <button className="btn wide small" title={`Customizes ${ch}: only ${ch} changes`} onClick={() => actions.setScope('letter')}>Set each join of {ch}</button>
      </div>
    );
  }
  return (
    <div className="each-end">
      <div className="sub-label">Each join</div>
      {joins.map(j => <JoinSlider key={j.id} g={g} joins={joins} join={j} />)}
    </div>
  );
}

/** The letter in miniature with its joins dotted, or only the join `on` and the stroke it pulls back picked out,
    so two joins in one place (an F's arm off its stem, or the stem off the arm) tell apart. */
function JoinThumb({ g, joins, on }: { g: Glyph; joins: JoinInfo[]; on?: string }) {
  const box = thumbBox(g), j = on ? joins.find(k => k.id === on) : undefined;
  if (!box) return null;
  const r = Math.max(box[2], box[3]) / 1.32 * 0.16 * (on ? 0.95 : 0.7);
  return (
    <svg className="end-thumb" viewBox={box.join(' ')} aria-hidden="true">
      <path d={g.d} />
      {j && <path className="on" d={g.strokes.filter(s => s.id === j.stroke).map(s => cmdsToD(s.cmds)).join('')} />}
      {joins.filter(k => !on || k.id === on).map(k => <circle key={k.id} cx={k.x} cy={-k.y} r={r} />)}
    </svg>
  );
}

/** One join's gap beside a picture of the letter with that join marked. */
function JoinSlider({ g, joins, join: { id, label, v: drawn } }: { g: Glyph; joins: JoinInfo[]; join: JoinInfo }) {
  const hot = useEditor(s => s.hotEnd === id), v = useEditor(s => paramOf(s, 'joinGaps')[id]) ?? drawn;
  return (
    <div className={hot ? 'ctl end hot' : 'ctl end'} data-end={id} title={label}
      onPointerEnter={() => actions.setHotEnd(id)} onPointerLeave={() => actions.setHotEnd(null)}>
      <JoinThumb g={g} joins={joins} on={id} />
      <EndRow id={id} k="joinGaps" name="Gap" label={label} value={v}
        tip="Left keeps the strokes joined; right pulls this stroke back from the one it meets, opening a gap up to two stems wide" reset="Follow Stencil again" />
    </div>
  );
}

/** The slider's value as a whole number from 0 to 100 (or a turn, in degrees from -180 to 180), typed over
    directly. Enter or leaving the box applies it (clamped to that range); Escape puts the old value back; the
    arrow keys step by 1, or 10 with Shift. */
function NumberField({ value, label, onChange, degrees }: { value: number; label: string; onChange: (v: number) => void; degrees?: boolean }) {
  const [lo, hi] = degrees ? [-180, 180] : [0, 100];
  const shown = String(Math.round(degrees ? rotationDeg(value) : value * 100));
  const [draft, setDraft] = useState<string | null>(null);
  const apply = (text: string) => {
    setDraft(null);
    const n = Math.min(hi, Math.max(lo, Math.round(Number(text))));
    if (text.trim() !== '' && Number.isFinite(n) && String(n) !== shown) onChange(degrees ? n / 360 + 0.5 : n / 100);
  };
  return (
    <input className="ctl-num" type="text" inputMode="numeric" aria-label={`${label} value`} value={draft ?? shown}
      onFocus={e => e.target.select()}
      onChange={e => setDraft(e.target.value.replace(/[^0-9-]/g, '').slice(0, 4))}
      onBlur={e => apply(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') { setDraft(null); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const step = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
          apply(String(Number(draft ?? shown) + step));
        }
      }} />
  );
}

/** A 0..1 range input shown as whole steps from 0 to 100 (or `steps`). `onInput` fires while dragging; `onCommit` once on release (one undo step). */
function Range({ value, label, onInput, onCommit, onReset, steps = 100 }: { value: number; label: string; onInput: (v: number) => void; onCommit: () => void; onReset: () => void; steps?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    const el = ref.current!, h = () => commit.current();
    el.addEventListener('change', h);
    return () => el.removeEventListener('change', h);
  }, []);
  return (
    <input ref={ref} type="range" min={0} max={steps} step={1} value={Math.round(value * steps)} aria-label={label}
      title="Double-click to reset" style={{ '--v': value } as CSSProperties}
      onChange={e => onInput(Number(e.target.value) / steps)} onDoubleClick={onReset} />
  );
}

function TerminalControl({ parts }: { parts?: string[] }) {
  const terminal = useParam('terminal'), form = formOf(terminal, useParam('terminalForm')), run = useParam('terminalRun'), active = useEditor(s => controlFor(s.active) === 'terminal');
  const c = CONTROLS.terminal, forms = TERMINAL_FORMS[terminal], kindLabel = TERMINAL_OPTIONS.find(([id]) => id === terminal)![1];
  const reach = useReachNote('terminal');
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl="terminal" {...useControlFocus('terminal')}>
      <FoldHead k="terminal" label={c.label} parts={parts} summary={`${kindLabel} · ${TERMINAL_FORM_LABELS[form]}${run === 'straight' ? ' · Straight' : ''}`} />
      {reach.note}
      <Fold k="terminal" quiet={reach.quiet}>
        <div className="opts six" role="radiogroup" aria-label={c.tech}>
          {TERMINAL_OPTIONS.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={terminal === id} className={terminal === id ? 'opt on' : 'opt'}
              onClick={() => actions.setOption('terminal', id)}>
              <TerminalIcon kind={id} /><span>{label}</span>
            </button>
          ))}
        </div>
        <div className="sub-label">{kindLabel} shape</div>
        <div className={forms.length === 3 ? 'opts three' : 'opts two'} role="radiogroup" aria-label={`${kindLabel} shape`}>
          {forms.map(id => (
            <button key={id} role="radio" aria-checked={form === id} className={form === id ? 'opt on' : 'opt'}
              onClick={() => actions.setOption('terminalForm', id)}>
              <TerminalIcon kind={terminal} form={id} /><span>{TERMINAL_FORM_LABELS[id]}</span>
            </button>
          ))}
        </div>
        {TERMINAL_DETAILS[form].map(k => <SliderControl key={k} k={k} def={TERMINAL_SUBS[k]} />)}
        <div className="sub-label">Direction</div>
        <FormOptions k="terminalRun" label="Direction of curved stroke ends" />
        <SliderControl k="terminalLength" def={TERMINAL_SUBS.terminalLength} />
        <SliderControl k="terminalCurl" def={TERMINAL_SUBS.terminalCurl} />
        <EachEnd />
      </Fold>
    </div>
  );
}

/** While a letter is customized, a length and curl for each of its stroke ends, each shown as a small
    picture of the letter with that end marked; while every letter is in sync, a way into customizing,
    since ends are set one by one only on a single letter. */
function EachEnd() {
  const ch = useEditor(s => s.inspect), letter = useEditor(letterOf), font = useScopedFont();
  const g = ch ? font.glyph(ch) : null, ends = g ? strokeEnds(g) : [];
  if (!ch || !g || !ends.length) return null;
  if (!letter) {
    return (
      <div className="each-end locked">
        <EndThumb g={g} ends={ends} />
        <div className="sub-label">Each end</div>
        {/* setting them one by one customizes the letter, so the button says what it's for */}
        <button className="btn wide small" title={`Customizes ${ch}: only ${ch} changes`} onClick={() => actions.setScope('letter')}>Set each end of {ch}</button>
      </div>
    );
  }
  return (
    <div className="each-end">
      <div className="sub-label">Each end</div>
      {ends.map(e => <EndSlider key={e.id} g={g} ends={ends} end={e} />)}
    </div>
  );
}

/** While a letter is customized, a roundness for each of its corners (where a stroke turns, and the
    corners of its square ends), each beside a picture of the letter with that corner marked; while
    every letter is in sync, a way into customizing, since corners are rounded one by one only on a
    single letter. */
function EachCorner() {
  const ch = useEditor(s => s.inspect), letter = useEditor(letterOf), font = useScopedFont();
  const g = ch ? font.glyph(ch) : null, corners = g ? letterCorners(g) : [];
  if (!ch || !g || !corners.length) return null;
  if (!letter) {
    return (
      <div className="each-end locked">
        <EndThumb g={g} ends={corners} />
        <div className="sub-label">Each corner</div>
        {/* setting them one by one customizes the letter, so the button says what it's for */}
        <button className="btn wide small" title={`Customizes ${ch}: only ${ch} changes`} onClick={() => actions.setScope('letter')}>Set each corner of {ch}</button>
      </div>
    );
  }
  return (
    <div className="each-end">
      <div className="sub-label">Each corner</div>
      {corners.map(c => <CornerSlider key={c.id} g={g} corners={corners} corner={c} />)}
    </div>
  );
}

/** While a letter is customized, a weight for each of its strokes, each beside a picture of the letter
    with that stroke picked out; while every letter is in sync, a way into customizing, since strokes
    are weighted one by one only on a single letter. */
function EachStroke() {
  const ch = useEditor(s => s.inspect), letter = useEditor(letterOf), font = useScopedFont();
  const g = ch ? font.glyph(ch) : null, strokes = g ? letterStrokes(g) : [];
  if (!ch || !g || !strokes.length) return null;
  if (!letter) {
    return (
      <div className="each-end locked">
        <StrokeThumb g={g} />
        <div className="sub-label">Each stroke</div>
        {/* setting them one by one customizes the letter, so the button says what it's for */}
        <button className="btn wide small" title={`Customizes ${ch}: only ${ch} changes`} onClick={() => actions.setScope('letter')}>Set each stroke of {ch}</button>
      </div>
    );
  }
  return (
    <div className="each-end">
      <div className="sub-label">Each stroke</div>
      {strokes.map(t => <StrokeSlider key={t.id} g={g} stroke={t} />)}
    </div>
  );
}

/** One stroke's weight beside a picture of the letter with that stroke picked out. */
function StrokeSlider({ g, stroke: { id, label } }: { g: Glyph; stroke: StrokeInfo }) {
  const hot = useEditor(s => s.hotEnd === id), v = useEditor(s => paramOf(s, 'strokeWeights')[id] ?? 0.5);
  return (
    <div className={hot ? 'ctl end hot' : 'ctl end'} data-end={id} title={label}
      onPointerEnter={() => actions.setHotEnd(id)} onPointerLeave={() => actions.setHotEnd(null)}>
      <StrokeThumb g={g} on={id} />
      <EndRow id={id} k="strokeWeights" name="Weight" label={label} value={v}
        tip="Left makes this stroke lighter, right heavier; the middle draws it as the design does" reset="Draw it as the design does" />
    </div>
  );
}

/** The letter in miniature with every stroke picked out, or only the stroke `on`. */
function StrokeThumb({ g, on }: { g: Glyph; on?: string }) {
  const box = thumbBox(g);
  if (!box) return null;
  return (
    <svg className="end-thumb stroke-thumb" viewBox={box.join(' ')} aria-hidden="true">
      <path d={g.d} />
      <path className="on" d={g.strokes.filter(s => s.id && !s.dot && (!on || s.id === on)).map(s => cmdsToD(s.cmds)).join('')} />
    </svg>
  );
}

/** A letter's miniature view box, [x, y, width, height] (y down), with room round it for dots on its ends. */
function thumbBox(g: Glyph) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of g.cmds) {
    for (let i = 1; i + 1 < c.length && typeof c[i] === 'number'; i += 2) {
      x0 = Math.min(x0, c[i]); x1 = Math.max(x1, c[i]); y0 = Math.min(y0, -c[i + 1]); y1 = Math.max(y1, -c[i + 1]);
    }
  }
  if (!(x0 <= x1)) return null;
  const pad = Math.max(x1 - x0, y1 - y0) * 0.16;
  return [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2];
}

/** One corner's roundness beside a picture of the letter with that corner marked: where a stroke
    turns, its outside and inside one by one. */
function CornerSlider({ g, corners, corner: { id, label, v, vi: drawn, st } }: { g: Glyph; corners: CornerInfo[]; corner: CornerInfo }) {
  // an inside set sharper than a wide outside lets it is drawn rounder, but the slider stays where it was put
  const hot = useEditor(s => s.hotEnd === id), own = useEditor(s => paramOf(s, 'innerCorners')[id]), vi = drawn == null ? drawn : own ?? drawn;
  // a corner can be stepped while Steps is on, or once it has a step of its own
  const stepped = useEditor(s => st != null && (paramOf(s, 'steps') > 0 || paramOf(s, 'cornerSteps')[id] != null));
  return (
    <div className={['ctl end', hot && 'hot', stepped && vi != null && 'rows3'].filter(Boolean).join(' ')} data-end={id} title={label}
      onPointerEnter={() => actions.setHotEnd(id)} onPointerLeave={() => actions.setHotEnd(null)}>
      <EndThumb g={g} ends={corners} on={id} />
      {vi == null
        ? <EndRow id={id} k="corners" name="Round" label={label} value={v}
            tip="Left makes the corner sharp; right rounds the end right off" reset="Draw it as the design does" />
        : <>
            <EndRow id={id} k="corners" name="Outside" label={label} value={v}
              tip="Left makes the outside of the turn sharp; right rounds it as far as its sides let it. The inside follows, keeping the stroke even, until it has its own" reset="Draw it as the design does" />
            <EndRow id={id} k="innerCorners" name="Inside" label={label} value={vi}
              tip="Left makes the inside of the turn square; right rounds it wide, thickening the corner. Well under the outside, the stroke thins across the corner, though never to less than half" reset="Follow the outside again" />
          </>}
      {stepped && <EndRow id={id} k="cornerSteps" name="Step" label={label} value={st!}
        tip="Left leaves the corner whole; right cuts a square step out of it, up to nearly the stroke's width" reset="Follow Steps again" />}
    </div>
  );
}

/** The letter in miniature with its stroke ends (or corners) dotted, or only the one `on`. */
function EndThumb({ g, ends, on }: { g: Glyph; ends: { id: string; x: number; y: number }[]; on?: string }) {
  const box = thumbBox(g);
  if (!box) return null;
  const r = Math.max(box[2], box[3]) / 1.32 * 0.16 * (on ? 0.95 : 0.7);
  return (
    <svg className="end-thumb" viewBox={box.join(' ')} aria-hidden="true">
      <path d={g.d} />
      {ends.filter(e => !on || e.id === on).map(e => <circle key={e.id} cx={e.x} cy={-e.y} r={r} />)}
    </svg>
  );
}

/** One end's length and curl beside a picture of the letter with that end marked. */
function EndSlider({ g, ends, end: { id, label, hook } }: { g: Glyph; ends: StrokeEndInfo[]; end: StrokeEndInfo }) {
  const length = useEditor(s => endOf(s, id, hook)), curl = useEditor(s => curlOf(s, id)), hot = useEditor(s => s.hotEnd === id);
  const plain = id.startsWith('p');
  return (
    <div className={hot ? 'ctl end hot' : 'ctl end'} data-end={id} title={label}
      onPointerEnter={() => actions.setHotEnd(id)} onPointerLeave={() => actions.setHotEnd(null)}>
      <EndThumb g={g} ends={ends} on={id} />
      <EndRow id={id} k="terminalEnds" name="Length" label={label} value={length}
        tip="Trim the end back, or draw it on, much further than Length goes" reset={hook ? 'Reset its length' : 'Follow Length again'} />
      <EndRow id={id} k="terminalCurls" name="Curl" label={label} value={curl}
        tip="Left straightens the end, then swirls it outward; right curls it on round, into a spiral like a swash" reset={plain ? 'Reset its curl' : 'Follow Curl again'} />
    </div>
  );
}

function EndRow({ id, k, name, label, value, tip, reset }: { id: string; k: EndKey; name: string; label: string; value: number; tip: string; reset: string }) {
  const own = useEditor(s => { const ch = letterOf(s); return !!ch && s.params.glyphs[ch]?.[k]?.[id] !== undefined; });
  const aria = `${label} ${name.toLowerCase()}`, set = (v: number) => { actions.focusControl(k === 'corners' || k === 'innerCorners' ? 'roundness' : k === 'cornerSteps' ? 'steps' : k === 'strokeWeights' ? 'weight' : k === 'joinGaps' ? 'stencil' : k === 'terminalCurls' ? 'terminalCurl' : 'terminalLength'); actions.setEnd(id, v, k); };
  return (
    <>
      <span className="end-name" title={tip}>{name}</span>
      <Range value={value} label={aria} onInput={set} onCommit={actions.commit} onReset={() => actions.resetEnd(id, k)} />
      <NumberField value={value} label={aria} onChange={v => { set(v); actions.commit(); }} />
      <button className="end-reset" disabled={!own} aria-label={`Reset ${aria}`} title={reset} onClick={() => actions.resetEnd(id, k)}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7a4.5 4.5 0 1 0 1.3-3.2M2.5 1.8v2.4h2.4" /></svg>
      </button>
    </>
  );
}

/** Double or single storey. Left on auto, the form the other settings picked shows as chosen. */
function StoryControl({ parts }: { parts?: string[] }) {
  const single = useScopedFont().eff.singleStory, active = useEditor(s => s.active === 'story');
  const c = CONTROLS.story, current = single ? 'single' : 'double', reach = useReachNote('story');
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl="story" {...useControlFocus('story')}>
      <CtlHead k="story" label={c.label} parts={parts} />
      {reach.note}
      <div className="opts two" role="radiogroup" aria-label={c.tech}>
        {STORY_OPTIONS.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={current === id} className={current === id ? 'opt on' : 'opt'}
            onClick={() => actions.setOption('story', id)}>
            <StoryIcon story={id} /><span>{label}</span>
          </button>
        ))}
      </div>
      <div className="sub-label">Foot</div>
      <FormOptions k="aForm" label="Foot of the a" />
    </div>
  );
}

type LetterFormKey = Exclude<FormKey, 'terminalRun' | 'aForm'>;

/** A pick between named shapes of a letter or part, each drawn by the engine. Left on auto, the
    shape the other settings give shows as chosen. */
function FormControl({ k, parts }: { k: LetterFormKey; parts?: string[] }) {
  const active = useEditor(s => controlFor(s.active) === k), c = CONTROLS[k], box = useParam('bowlForm') === 'box', reach = useReachNote(k);
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl={k} {...useControlFocus(k)}>
      <CtlHead k={k} label={c.label} parts={parts} />
      {reach.note}
      <FormOptions k={k} label={c.tech} />
      <Quiet.Provider value={reach.quiet}>
        {k === 'dots' && <SliderControl k="dotSize" def={DOT_SUBS.dotSize} />}
        {k === 'bowlForm' && box && <SliderControl k="boxRound" def={BOWL_SUBS.boxRound} />}
      </Quiet.Provider>
    </div>
  );
}

/** The named shapes of `k` as a row of pictured options. */
function FormOptions({ k, label }: { k: FormKey; label: string }) {
  const value = useParam(k), font = useScopedFont(), { options } = FORM_OPTIONS[k];
  const current = value !== 'auto' ? value : k === 'dots' ? (font.m.dotRound >= 0.5 ? 'round' : 'square') : k === 'scriptForm' ? (scriptForms(font.eff) ? 'script' : 'print')
    : font.eff.mono >= 0.5 && !font.eff.serif ? 'bars' : 'plain';
  return (
    <div className={options.length === 3 ? 'opts three' : 'opts two'} role="radiogroup" aria-label={label}>
      {options.map(([id, name]) => (
        <button key={id} role="radio" aria-checked={current === id} className={current === id ? 'opt on' : 'opt'}
          onClick={() => actions.setOption(k, id as never)}>
          <FormIcon k={k} id={id} /><span>{name}</span>
        </button>
      ))}
    </div>
  );
}

function SerifControl({ parts }: { parts?: string[] }) {
  const p = { serif: useParam('serif'), serifShape: useParam('serifShape') }, active = useEditor(s => controlFor(s.active) === 'serif');
  const c = CONTROLS.serif, reach = useReachNote('serif');
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl="serif" {...useControlFocus('serif')}>
      <FoldHead k="serif" label={c.label} parts={parts} shut={!p.serif} summary={SERIF_SHAPE_OPTIONS.find(([id]) => id === p.serifShape)?.[1] ?? ''}
        tools={<button className={p.serif ? 'switch on' : 'switch'} role="switch" aria-checked={p.serif} aria-label="Serifs"
          onClick={() => actions.setOption('serif', !p.serif)}><i /></button>} />
      {reach.note}
      <Fold k="serif" shut={!p.serif} quiet={reach.quiet}>
        <div className="sub-label">Serif shape</div>
        <div className="opts four" role="radiogroup" aria-label="Serif shape">
          {SERIF_SHAPE_OPTIONS.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={p.serifShape === id} className={p.serifShape === id ? 'opt on' : 'opt'}
              onClick={() => actions.setOption('serifShape', id)}>
              <SerifIcon shape={id} /><span>{label}</span>
            </button>
          ))}
        </div>
        {[...SERIF_SIZES, ...SERIF_DETAILS[p.serifShape]].map(k => <SliderControl key={k} k={k} def={SERIF_SUBS[k]} />)}
      </Fold>
    </div>
  );
}

type SerifFormKey = 'serifTip' | 'serifBase' | 'serifSides' | 'serifInner';
/** A finer choice on the Serifs page, the tips, the base, the sides the serifs reach to or the shape of the ones
    inside the letter: each option drawn on a serif of the design's own shape, then the sliders of the picked one. */
function SerifFormControl({ k }: { k: SerifFormKey }) {
  const shape = useParam('serifShape'), tip = useParam('serifTip'), base = useParam('serifBase'), sides = useParam('serifSides'), inner = useParam('serifInner');
  const active = useEditor(s => controlFor(s.active) === k), c = CONTROLS[k], reach = useReachNote(k);
  return (
    <div className={['ctl', active && 'active', reach.idle && 'idle'].filter(Boolean).join(' ')} data-ctl={k} {...useControlFocus(k)}>
      <CtlHead k={k} label={c.label} />
      {reach.note}
      <Quiet.Provider value={reach.quiet}>
        {k === 'serifTip' ? (
          <>
            <div className="opts four" role="radiogroup" aria-label={c.tech}>
              {SERIF_TIP_OPTIONS.map(([id, label]) => (
                <button key={id} role="radio" aria-checked={tip === id} className={tip === id ? 'opt on' : 'opt'} onClick={() => actions.setOption('serifTip', id)}>
                  <SerifIcon shape={shape} tip={id} view="tip" /><span>{label}</span>
                </button>
              ))}
            </div>
            {SERIF_TIP_DETAILS[tip].map(s => <SliderControl key={s} k={s} def={SERIF_TIP_SUBS[s]} />)}
          </>
        ) : k === 'serifSides' ? (
          <div className="opts five" role="radiogroup" aria-label={c.tech}>
            {SERIF_SIDE_OPTIONS.map(([id, label]) => (
              <button key={id} role="radio" aria-checked={sides === id} className={sides === id ? 'opt on' : 'opt'} onClick={() => actions.setOption('serifSides', id)}>
                <SerifSidesIcon shape={shape} sides={id} /><span>{label}</span>
              </button>
            ))}
          </div>
        ) : k === 'serifInner' ? (
          <>
            <div className="opts three" role="radiogroup" aria-label={c.tech}>
              {SERIF_INNER_OPTIONS.map(([id, label]) => (
                <button key={id} role="radio" aria-checked={inner === id} className={inner === id ? 'opt on' : 'opt'} onClick={() => actions.setOption('serifInner', id)}>
                  <SerifSidesIcon shape={shape} sides={sides === 'outside' ? 'both' : sides} inner={id} large /><span>{label}</span>
                </button>
              ))}
            </div>
            {(Object.keys(SERIF_INNER_SUBS) as SerifInnerSubKey[]).map(s => <SliderControl key={s} k={s} def={SERIF_INNER_SUBS[s]} />)}
          </>
        ) : (
          <>
            <div className="opts two" role="radiogroup" aria-label={c.tech}>
              {SERIF_BASE_OPTIONS.map(([id, label]) => (
                <button key={id} role="radio" aria-checked={base === id} className={base === id ? 'opt on' : 'opt'} onClick={() => actions.setOption('serifBase', id)}>
                  <SerifIcon shape={shape} tip={tip} cupped={id === 'cupped'} view="base" /><span>{label}</span>
                </button>
              ))}
            </div>
            {base === 'cupped' && <SliderControl k="serifCup" def={SERIF_BASE_SUBS.serifCup} />}
          </>
        )}
      </Quiet.Provider>
    </div>
  );
}

function FillControl() {
  const fill = useEditor(s => s.params.fill), active = useEditor(s => controlFor(s.active) === 'fill');
  const c = CONTROLS.fill, solid = fill === 'solid';
  return (
    <div className={active ? 'ctl active' : 'ctl'} data-ctl="fill" {...useControlFocus('fill')}>
      <FoldHead k="fill" label={c.label} summary={FILL_OPTIONS.find(([id]) => id === fill)![1]} />
      <Fold k="fill">
        <div className="opts four" role="radiogroup" aria-label={c.tech}>
          {FILL_OPTIONS.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={fill === id} className={fill === id ? 'opt on' : 'opt'}
              onClick={() => actions.setOption('fill', id)}>
              <FillIcon fill={id} /><span>{label}</span>
            </button>
          ))}
        </div>
        <div className={solid ? 'reveal' : 'reveal open'} inert={solid}>
          <div>
            {(Object.keys(FILL_SUBS) as FillSubKey[]).map(k => <SliderControl key={k} k={k} def={FILL_SUBS[k]} />)}
          </div>
        </div>
      </Fold>
    </div>
  );
}
