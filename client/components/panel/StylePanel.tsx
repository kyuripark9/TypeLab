/* The Style page's panel: Filter narrows the starting styles by search and tags, Adjust lays traits over every one of them.
   On phones it is a sheet over the cards, opened from the bar on top (Stage.tsx), with a foot that closes it. */
import { type KeyboardEvent } from 'react';
import { FEELINGS, PAGE_STYLES, styleById, type Mood } from '../../../shared/content';
import { cmdsBox } from '../../../shared/engine';
import { STYLE_FONTS } from '../../../shared/free-fonts';
import type { Params } from '../../../shared/params';
import { fontStyle, useWebFont } from '../../lib/free';
import { n1, PHONE_QUERY } from '../../lib/hooks';
import { actions, adjustedParams, fontFor, useEditor, useStyleMatch, type StyleTab } from '../../state/editor';
import { TRAIT_SECTIONS, type TraitDef } from '../../../shared/traits';

/** The Filter tab's search box. */
const STYLE_SEARCH_ID = 'style-search';
/** On phones the panel is a sheet that has to be opened before anything in it takes the focus. */
const openSheet = () => { if (matchMedia(PHONE_QUERY).matches) actions.setStylePanelOpen(true); };
/** Focus the open Filter or Adjust tab: the stage's "Skip to filters" and Filter, and both Clear buttons, send focus here. */
export const focusFilters = () => {
  openSheet();
  requestAnimationFrame(() => document.querySelector<HTMLElement>('.style-tabs [aria-selected=true]')?.focus());
};
/** Open the Filter tab and put the cursor in its search box (the / key). */
export const focusStyleSearch = () => {
  actions.setStyleTab('filter');
  openSheet();
  requestAnimationFrame(() => document.getElementById(STYLE_SEARCH_ID)?.focus());
};
/** Close the phone's sheet, the focus going back to Filter, which opened it. */
export const closeStyleSheet = () => {
  actions.setStylePanelOpen(false);
  requestAnimationFrame(() => document.querySelector<HTMLElement>('.sheet-btn')?.focus());
};

const STYLE_TABS: [StyleTab, string][] = [['filter', 'Filter'], ['adjust', 'Adjust']];

/** Style page: Filter narrows the starting styles by search and tag; Adjust lays traits over every
    one of them, so each card shows its style with them and any mix can be started from. */
export function StylePanel() {
  const tab = useEditor(s => s.styleTab);
  // the Filter tab counts what it holds: the finder's answer (groups) is on the stage, with its own way back
  const nFilters = useEditor(s => s.moods.length + (s.query.trim() ? 1 : 0));
  const nTraits = useEditor(s => Object.keys(s.traits).length);
  const counts = { filter: nFilters, adjust: nTraits };
  const move = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // STYLE_TABS has two tabs, so either arrow switches to the other
    const next = tab === 'filter' ? 'adjust' : 'filter';
    actions.setStyleTab(next);
    requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
  };
  return (
    <div className="panel-pad">
      <div className="style-tabs" role="tablist" aria-label="Style panel">
        {STYLE_TABS.map(([id, label]) => (
          <button key={id} id={`tab-${id}`} role="tab" title={id === 'adjust' ? 'Every style takes on the traits you set here' : undefined} aria-selected={tab === id} aria-controls={`tp-${id}`} tabIndex={tab === id ? 0 : -1}
            className={tab === id ? 'on' : undefined} onClick={() => actions.setStyleTab(id)} onKeyDown={move}>
            {label}{counts[id] > 0 && <span className="facet-picked" aria-label={`, ${counts[id]} on`}>{counts[id]}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`tp-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'filter' ? <StyleFilters /> : <StyleTraits />}
      </div>
      <SheetFoot />
    </div>
  );
}

/** The foot of the phone's sheet: back to the cards, saying how many the filters leave. Hidden elsewhere (styles.css). */
function SheetFoot() {
  const open = useEditor(s => s.stylePanelOpen), { matches } = useStyleMatch();
  if (!open) return null;
  const n = PAGE_STYLES.filter(s => matches(s)).length;
  return (
    <div className="sheet-foot">
      <button className="btn primary" onClick={closeStyleSheet}>Show {n} {n === 1 ? 'style' : 'styles'}</button>
    </div>
  );
}

/** Search, then the feelings. The kind of letters is what the style finder asks on the stage (and
    how the cards are grouped), so it isn't asked again here; a genre is found by searching its name. */
function StyleFilters() {
  const { f } = useStyleMatch();
  const picked = f.moods.length > 0 || !!f.query?.trim();
  return (
    <>
      <div className="search-row">
        <div className="search-field">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" /><path d="m10.4 10.4 3.6 3.6" /></svg>
          <input id={STYLE_SEARCH_ID} type="search" spellCheck={false} autoComplete="off" placeholder="Search styles, fonts, feelings"
            aria-label="Search styles" aria-keyshortcuts="/" value={f.query}
            onChange={e => actions.setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape' && f.query) { e.stopPropagation(); actions.setQuery(''); } }} />
          <kbd aria-hidden="true">/</kbd>
        </div>
        {/* the button leaves once pressed, so focus goes back to the tab rather than the page */}
        {picked && <button className="btn ghost small" aria-label="Clear filters" onClick={() => { actions.setQuery(''); f.moods.forEach(actions.toggleMood); focusFilters(); }}>Clear</button>}
      </div>
      <Feelings />
    </>
  );
}

/** The Adjust tab: every trait as a row of named steps, each drawn as the current style would look
    with it. A step applies to every card at once; picking it again (or Any) hands the trait back
    to each style. Shuffle and Clear sit on the first section's heading line. */
function StyleTraits() {
  const n = useEditor(s => Object.keys(s.traits).length);
  const tools = (
    <div className="traits-tools">
      <button className="btn ghost small" onClick={actions.shuffleTraits} title="Pick a random mix of traits">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5h2.5c3.5 0 3.5 7 7 7H14M2 11.5h2.5c1.4 0 2.2-1.1 2.9-2.4M9.6 6.9c.7-1.3 1.5-2.4 2.9-2.4H14M12 2.5l2 2-2 2M12 9.5l2 2-2 2" /></svg>
        Shuffle
      </button>
      {n > 0 && <button className="btn ghost small" onClick={() => { actions.clearTraits(); focusFilters(); }}>Clear</button>}
    </div>
  );
  return (
    <>
      {TRAIT_SECTIONS.map((sec, i) => (
        <div key={sec.id} className="trait-set" role="group" aria-labelledby={`t-${sec.id}`}>
          <div className="trait-set-head">
            <h3 className="facet-label" id={`t-${sec.id}`}>{sec.label}</h3>
            {i === 0 && tools}
          </div>
          {sec.traits.map(t => <TraitRow key={t.id} def={t} />)}
        </div>
      ))}
    </>
  );
}

/** Height of the drawing on a trait step, in px. */
const TRAIT_H = 24;
/** Widest a trait step's drawing gets, in px. */
const TRAIT_W = 44;

/** Where the longer step names may break, with a hyphen, when a narrow panel leaves them no room:
    a soft hyphen shows only at a break, so "Condensed" stays whole wherever it fits. The keys are option
    labels in shared/traits.ts, so a renamed label loses its break without any error. */
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
        {picked && <button className="trait-any" onClick={() => actions.setTrait(def.id, null)} title="Let each style keep its own">Any</button>}
      </div>
      <div className="trait-opts" style={{ gridTemplateColumns: `repeat(${def.options.length}, minmax(0, 1fr))` }}>
        {def.options.map(o => (
          <button key={o.id} className={picked === o.id ? 'opt on' : 'opt'} aria-pressed={picked === o.id}
            onClick={() => actions.setTrait(def.id, o.id)}>
            <Specimen params={adjustedParams(base, { ...traits, [def.id]: o.id })} text={def.sample} />
            <span>{SOFT[o.label] ?? o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** `text` drawn in a font made from `params`, its ink fitted into TRAIT_H px high and TRAIT_W px wide, so
    each step of a trait fills its button. Hidden from screen readers. */
function Specimen({ params, text }: { params: Params; text: string }) {
  const f = fontFor(params), items = f.layout(text, Infinity)[0].items.filter(it => f.glyph(it.ch));
  // the ink's box across the line, y down
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) {
    const b = cmdsBox(f.glyph(it.ch)!.cmds);
    if (b) { x0 = Math.min(x0, it.x + b.x0); x1 = Math.max(x1, it.x + b.x1); y0 = Math.min(y0, -b.y1); y1 = Math.max(y1, -b.y0); }
  }
  if (!(x0 < x1)) return null;
  const sc = Math.min(TRAIT_H / (y1 - y0), TRAIT_W / (x1 - x0)), W = n1((x1 - x0) * sc);
  return (
    <svg className="specimen" width={W} height={TRAIT_H} viewBox={`0 0 ${W} ${TRAIT_H}`} aria-hidden="true">
      <g transform={`translate(0 ${n1((TRAIT_H - (y1 - y0) * sc) / 2)}) scale(${sc}) translate(${n1(-x0)} ${n1(-y0)})`}>
        {items.map((it, j) => <path key={j} d={f.glyph(it.ch)!.d} transform={`translate(${n1(it.x)},0)`} />)}
      </g>
    </svg>
  );
}

/** A feeling's name in the own font of the card that says it best (MOODS), the UI's face standing in until it comes:
    on its chip, and on the stage's bar of what is picked. */
export function FeelingName({ label, card }: { label: string; card: string }) {
  const font = useWebFont(STYLE_FONTS[card]);
  return <span className="feel" style={font ? fontStyle(font) : undefined}>{label}</span>;
}

/** The Feeling chips, every one that enough cards carry (FEELINGS), all in view, each named in a font that has that
    feeling. Each feeling picked narrows the cards, so a chip's count is what picking it would leave (a picked one's,
    what is showing), and one that would leave none does nothing. */
function Feelings() {
  const { f, matches } = useStyleMatch();
  const count = (m: Mood) => {
    const moods = f.moods.includes(m) ? f.moods : [...f.moods, m];
    return PAGE_STYLES.filter(s => matches(s, { moods })).length;
  };
  return (
    <div className="facet" role="group" aria-labelledby="f-feeling">
      <h3 className="facet-label" id="f-feeling">Feeling</h3>
      <div className="chips">
        {FEELINGS.map(({ id: tag, label, card }) => {
          const on = f.moods.includes(tag), n = count(tag), none = !n && !on;
          // a tag with no matches stays focusable, so it can still be found, but does nothing
          return (
            <button key={tag} className={on ? 'chip on' : 'chip'} aria-pressed={on} aria-disabled={none || undefined}
              aria-label={`${label}, ${n} ${n === 1 ? 'style' : 'styles'}`} onClick={() => { if (!none) actions.toggleMood(tag); }}>
              <FeelingName label={label} card={card} /><span className="count" aria-hidden="true">{n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
