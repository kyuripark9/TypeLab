/* The Style page's panel: Filter narrows the starting styles by search and tags, Adjust lays traits over every one of them. */
import { useState, type KeyboardEvent } from 'react';
import { MOODS, PAGE_STYLES, TAG_FACE, styleById, type Mood, type StyleFilter } from '../../../shared/content';
import type { Params } from '../../../shared/params';
import { n1 } from '../../lib/hooks';
import { actions, adjustedParams, fontFor, useEditor, useStyleMatch, type StyleTab } from '../../state/editor';
import { TRAIT_SECTIONS, type TraitDef } from '../../../shared/traits';

/** The Filter tab's search box. */
const STYLE_SEARCH_ID = 'style-search';
/** Focus the open Filter or Adjust tab: the stage's "Skip to filters" and both Clear buttons send focus here. */
export const focusFilters = () => document.querySelector<HTMLElement>('.style-tabs [aria-selected=true]')?.focus();
/** Open the Filter tab and put the cursor in its search box (the / key). */
export const focusSearch = () => {
  actions.setStyleTab('filter');
  requestAnimationFrame(() => document.getElementById(STYLE_SEARCH_ID)?.focus());
};

const STYLE_TABS: [StyleTab, string][] = [['filter', 'Filter'], ['adjust', 'Adjust']];

/** Style page: Filter narrows the starting styles by search and tag; Adjust lays traits over every
    one of them, so each card shows its style with them and any mix can be started from. */
export function StylePanel() {
  const tab = useEditor(s => s.styleTab);
  const nFilters = useEditor(s => s.groups.length + s.kinds.length + s.moods.length + (s.query.trim() ? 1 : 0));
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
          <input id={STYLE_SEARCH_ID} type="search" spellCheck={false} autoComplete="off" placeholder="Search styles, fonts, feelings"
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
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) {
    for (const c of f.glyph(it.ch)!.cmds) {
      for (let i = 1; i + 1 < c.length && typeof c[i] === 'number'; i += 2) {
        x0 = Math.min(x0, it.x + c[i]); x1 = Math.max(x1, it.x + c[i]); y0 = Math.min(y0, -c[i + 1]); y1 = Math.max(y1, -c[i + 1]);
      }
    }
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

/** Chips a long facet shows before "Show more". Picked chips always stay visible. */
const FACET_LIMIT = 8;

/** One section of tag chips. Its heading opens and closes it; a long one also folds down to its first few until expanded. */
function ChipFacet({ id, label, tags, picked, count, toggle }: {
  id: string; label: string; tags: { id: Mood; label: string }[]; picked: Mood[];
  count: (tag: Mood) => number; toggle: (tag: Mood) => void;
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
              {shown.map(({ id: tag, label }) => {
                const on = picked.includes(tag), n = count(tag), none = !n && !on;
                // a tag with no matches stays focusable, so it can still be found, but does nothing
                return (
                  <button key={tag} className={on ? 'chip on' : 'chip'} aria-pressed={on} aria-disabled={none || undefined}
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
/** Each tag's legible params, made once so fontFor (which builds once per params object) builds each tag's font once. */
const LEGIBLE = new Map<Mood, Params>();
const legibleOf = (tag: Mood) => {
  let p = LEGIBLE.get(tag);
  if (!p) LEGIBLE.set(tag, p = legible(styleById(TAG_FACE[tag])!.params));
  return p;
};

/** A filter tag's name, drawn in a starting style that belongs to it. The chip carries the
    name for screen readers, so the drawing is hidden from them. */
function TagText({ tag, label }: { tag: Mood; label: string }) {
  const f = fontFor(legibleOf(tag));
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
