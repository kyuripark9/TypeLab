/* The stage: the Type something bar, then on the Style page the finder and the style cards (each
   in its style's free font, under a row of chips for what's picked), or on the other pages the live
   preview with its size slider and box, and the inspector over it while a letter is open. Like
   Google Fonts, the one bar on top sets the sample text, both for the style cards and for the live
   preview of the design. The size only shows with the preview: the cards are for comparing styles,
   so they keep one size. */
import { useDeferredValue, useRef, useState } from 'react';
import { KIND_SECTIONS, MOODS, PAGE_STYLES, STYLE_GROUPS, styleById, type StyleDef } from '../../shared/content';
import { parseFontId, STYLE_FONTS } from '../../shared/free-fonts';
import { fontStyle, useWebFont } from '../lib/free';
import { useSize } from '../lib/hooks';
import { sampleText } from '../lib/preview';
import { actions, traitLabels, useEditor, useStyleMatch, type CardView } from '../state/editor';
import { FinderQuestion, FinderTrail, useFinder } from './Finder';
import { Inspector } from './Inspector';
import { focusFilters } from './Panel';
import { Preview } from './Preview';

export function Stage() {
  const style = useEditor(s => s.category === 'style');
  return (
    <main className="stage">
      <PreviewBar />
      {style ? <div className="stage-scroll" data-guide="stage"><StyleCards /></div> : <SampleText />}
      <Inspector />
    </main>
  );
}

function PreviewBar() {
  const custom = useEditor(s => s.custom), size = useEditor(s => s.size), style = useEditor(s => s.category === 'style');
  return (
    <div className="stage-bar">
      <div className="type-field" data-guide="type">
        <input type="text" spellCheck={false} placeholder="Type something" aria-label="Preview text"
          value={custom} onChange={e => actions.setCustom(e.target.value)} />
        {custom && <button className="type-clear" aria-label="Clear preview text" onClick={() => actions.setCustom('')}>✕</button>}
      </div>
      {style ? <ViewToggle /> : (
        <div className="size">
          <span>Size</span>
          <input type="range" min={14} max={220} value={size} aria-label="Size" onChange={e => actions.setSize(Number(e.target.value))} />
          <SizeValue size={size} />
        </div>
      )}
    </div>
  );
}

/** The preview sizes the size box takes, in px; the slider beside it covers only 14..220. */
const SIZE_MIN = 8, SIZE_MAX = 400;

/** The size as an always-visible box you type into, with "px" inside it. Enter or leaving the box applies it
    (clamped to SIZE_MIN..SIZE_MAX); Escape puts the old value back; the arrow keys step by 1, or 10 with Shift. */
function SizeValue({ size }: { size: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const apply = (text: string) => {
    const n = Math.round(Number(text));
    if (text.trim() !== '' && Number.isFinite(n)) actions.setSize(Math.min(SIZE_MAX, Math.max(SIZE_MIN, n)));
  };
  return (
    <label className="size-field" title="Type a size">
      <input type="text" inputMode="numeric" aria-label="Size in px" value={draft ?? String(size)}
        onFocus={e => { cancelled.current = false; e.target.select(); }}
        onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
        onBlur={e => { if (!cancelled.current && draft !== null) apply(e.target.value); setDraft(null); }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') { e.stopPropagation(); cancelled.current = true; e.currentTarget.blur(); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const n = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number(draft ?? size) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)));
            setDraft(String(n));
            actions.setSize(n);
          }
        }} />
      <span>px</span>
    </label>
  );
}

const VIEWS: [CardView, string, string][] = [
  ['list', 'List', 'M3 5h14M3 10h14M3 15h14'],
  ['grid', 'Grid', 'M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h5v5h-5z']
];

/** List or grid layout for the style cards; hidden while the finder asks a question, which has no cards to lay out. */
function ViewToggle() {
  const view = useEditor(s => s.view);
  if (useFinder().question) return null;
  return (
    <div className="view-toggle" role="radiogroup" aria-label="Layout">
      {VIEWS.map(([id, label, d]) => (
        <button key={id} role="radio" aria-checked={view === id} aria-label={label} title={label}
          className={view === id ? 'on' : undefined} onClick={() => actions.setView(id)}>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  );
}

/** The live preview, laid out to the scroll box's width less 96px: room for its side padding (.stage-scroll in
    styles.css, 40px a side, less in narrow windows) and a little to spare. */
function SampleText() {
  const [scrollRef, size] = useSize<HTMLDivElement>();
  return (
    <div className="stage-scroll" ref={scrollRef} data-guide="stage">
      <Preview width={Math.max(200, size.width - 96)} />
    </div>
  );
}

/** The size every style card is set at, in px. */
const CARD_SIZE = 48;

/** Cards are grouped by Category, the finder's first question, and narrowed by all the filters,
    which see each style as the Adjust tab's traits make it. Each card sets the text in its style's
    free font. The finder asks its questions first, and the cards come once they're answered. */
function StyleCards() {
  const custom = useEditor(s => s.custom), text = sampleText(custom);
  const finder = useFinder();
  const view = useEditor(s => s.view);
  const head = useRef<HTMLHeadingElement>(null);
  const { traits: now, matches } = useStyleMatch();
  // new traits re-filter the cards a moment after the panel answers; the cards dim until they catch up
  const traits = useDeferredValue(now);
  const shown = PAGE_STYLES.filter(s => matches(s, {}, traits));
  const current = useEditor(s => styleById(s.styleId));
  return (
    <div className="style-cards">
      <div className="cards-head">
        <h1 ref={head} tabIndex={-1}>Start with a style</h1>
        {/* one spot for both ways in: the questions, or every card at once */}
        <button className="link small" onClick={() => actions.setFinder(!finder.on)}>{finder.on ? 'Browse all styles' : 'Help me choose'}</button>
        {/* the filters sit after every card in tab order; this jumps there, and shows only when focused */}
        <button className="skip" onClick={focusFilters}>Skip to filters</button>
        {/* the way on, once the style that's loaded is among the cards: shape it */}
        {!finder.question && current && shown.includes(current) && (
          <button className="btn primary small cards-next" onClick={() => actions.setCategory('weight')}>
            Customize {current.name}
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
          </button>
        )}
      </div>
      <p className="letters-note">{LETTERS_NOTE}</p>
      {finder.on && <FinderTrail finder={finder} />}
      <ActiveBar onClear={() => head.current?.focus()} finder={finder.on} />
      {finder.question ? <FinderQuestion question={finder.question} /> : shown.length ? (
        <div className={traits === now ? 'style-groups' : 'style-groups stale'}>
          {STYLE_GROUPS.filter(g => shown.some(s => s.group === g.id)).map(g => (
            <section key={g.id} className="style-group" aria-labelledby={`g-${g.id}`}>
              <h2 className="group-head" id={`g-${g.id}`}>{g.label}<span>{g.hint}</span></h2>
              <div className={view === 'list' ? 'cards list' : 'cards'}>
                {shown.filter(s => s.group === g.id).map(s => <FreeCard key={s.id} style={s} text={text} size={CARD_SIZE} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="cards-empty">No styles match these filters. <button className="link" onClick={() => { actions.clearFilters(); head.current?.focus(); }}>Clear filters</button></p>
      )}
    </div>
  );
}

/** Everything picked in the panel, search, filters and traits, as one row of chips, each removed
    with a click; the trait chips are tinted apart from the filters. While the finder is on, its trail
    shows the Category, Classification and Feeling instead. */
function ActiveBar({ onClear, finder }: { onClear: () => void; finder: boolean }) {
  const { f, traits } = useStyleMatch();
  const tag = <T extends string>(list: { id: T; label: string }[], id: T) => list.find(x => x.id === id)!.label;
  const kinds = KIND_SECTIONS.flatMap(sec => sec.tags);
  const items: { key: string; label: string; trait?: boolean; remove: () => void }[] = [
    ...(f.query?.trim() ? [{ key: 'q', label: `“${f.query.trim()}”`, remove: () => actions.setQuery('') }] : []),
    ...(finder ? [] : f.groups.map(g => ({ key: `g-${g}`, label: tag(STYLE_GROUPS, g), remove: () => actions.toggleGroup(g) }))),
    ...(finder ? [] : f.kinds.map(k => ({ key: `k-${k}`, label: tag(kinds, k), remove: () => actions.toggleKind(k) }))),
    ...(finder ? [] : f.moods.map(m => ({ key: `m-${m}`, label: tag(MOODS, m), remove: () => actions.toggleMood(m) }))),
    ...traitLabels(traits).map(t => ({ key: `t-${t.id}`, label: t.label, trait: true, remove: () => actions.setTrait(t.id, null) }))
  ];
  if (!items.length) return null;
  return (
    <div className="active-bar" role="group" aria-label="Active filters and traits">
      {items.map(it => (
        <button key={it.key} className={it.trait ? 'active-chip trait' : 'active-chip'} onClick={it.remove} aria-label={`Remove ${it.label}`}>
          {it.label}
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
        </button>
      ))}
      {items.length > 1 && <button className="link small" onClick={() => { actions.clearFilters(); actions.clearTraits(); onClear(); }}>Clear all</button>}
    </div>
  );
}

/** What the cards are: each style in a free font, which every setting reshapes. */
const LETTERS_NOTE = 'Free fonts by type designers, yours to change and use. Every setting reshapes their letters, and Points redraws any of them.';

/** A style's card in its free font: the sample text set in the font itself, as the browser draws it. */
function FreeCard({ style: s, text, size }: { style: StyleDef; text: string; size: number }) {
  const on = useEditor(st => st.styleId === s.id && !!st.params.freeFont);
  const font = useWebFont(STYLE_FONTS[s.id]);
  return (
    <button className={on ? 'card on' : 'card'} title={s.desc} aria-current={on || undefined} onClick={() => actions.loadStyle(s.id)}>
      <span className="card-name">{s.name}<span className="card-like font">{parseFontId(STYLE_FONTS[s.id])?.family}</span></span>
      <span className={font ? 'card-free' : 'card-free loading'} style={{ ...(font && fontStyle(font)), fontSize: size }}>{text}</span>
    </button>
  );
}
