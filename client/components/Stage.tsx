/* The stage: the Type something bar, then on the Style page the style cards (each in its style's free
   font, or in the engine's letters for one built from blocks, under a row of chips for what's picked) with
   the way on to Customize at the foot, or on the other pages the live preview with its size
   slider and box, and the inspector over it while a letter is open. Like Google Fonts, the one bar on top sets the
   sample text, both for the style cards and for the live preview of the design. The size only shows with the
   preview: the cards are for comparing styles, so every card in a layout keeps one size. */
import { useDeferredValue, useRef, useState } from 'react';
import { MOODS, PAGE_STYLES, STYLE_GROUPS, styleById, type StyleDef } from '../../shared/content';
import { parseFontId, STYLE_FONTS, type FreeFontRef } from '../../shared/free-fonts';
import { fontStyle, textWidth, useWebFont } from '../lib/free';
import { useSize } from '../lib/hooks';
import { cardText, sampleText } from '../lib/preview';
import { actions, traitLabels, useEditor, useStyleMatch, type CardView } from '../state/editor';
import { BuiltText } from './BuiltText';
import { Inspector } from './Inspector';
import { FeelingName, focusFilters } from './Panel';
import { Preview } from './Preview';

export function Stage() {
  const style = useEditor(s => s.category === 'style');
  return (
    <main className="stage">
      <PreviewBar />
      {style ? <StyleCards /> : <SampleText />}
      <Inspector />
    </main>
  );
}

function PreviewBar() {
  const custom = useEditor(s => s.custom), size = useEditor(s => s.size), style = useEditor(s => s.category === 'style');
  return (
    <div className={style ? 'stage-bar cards-bar' : 'stage-bar'}>
      <div className="type-field" data-guide="type">
        <input type="text" spellCheck={false} placeholder="Type something" aria-label="Preview text"
          value={custom} onChange={e => actions.setCustom(e.target.value)} />
        {custom && <button className="type-clear" aria-label="Clear preview text" onClick={() => actions.setCustom('')}>✕</button>}
      </div>
      {style ? <><ViewToggle /><SheetButton /></> : (
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

/** List or grid layout for the style cards. */
function ViewToggle() {
  const view = useEditor(s => s.view);
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

/** On phones, where the panel would come after every card, the way to it: Filter opens it as a sheet over the cards
    (shown only there, styles.css), counting the categories, feelings, search and traits that are on, as its tabs do. */
function SheetButton() {
  const open = useEditor(s => s.stylePanelOpen);
  const n = useEditor(s => s.groups.length + s.moods.length + (s.query.trim() ? 1 : 0) + Object.keys(s.traits).length);
  return (
    <button className="btn outline sheet-btn" aria-expanded={open} onClick={focusFilters}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5h7M12 5h2M2 11h2M7 11h7" /><circle cx="10.5" cy="5" r="1.5" /><circle cx="5.5" cy="11" r="1.5" /></svg>
      Filter{n > 0 && <span className="facet-picked" aria-label={`, ${n} on`}>{n}</span>}
    </button>
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

/** The size the style cards are set at in each layout, in px: one size for every card, large in the list and
    smaller in the grid, where each card keeps to GRID_LINES lines so the cards line up in rows. */
const CARD_SIZE: Record<CardView, number> = { list: 48, grid: 32 };
const GRID_LINES = 2;

/** Cards are grouped by Category and narrowed by all the filters, which see each style as the
    Adjust tab's traits make it. Each card sets the text in its style's free font, or in the engine's
    letters where no font stands behind the style. */
function StyleCards() {
  const custom = useEditor(s => s.custom);
  const view = useEditor(s => s.view), text = view === 'grid' ? cardText(custom) : sampleText(custom);
  // typed text in the grid is cut after GRID_LINES lines; the short sample never runs past them, so it goes uncut and
  // a script's tails under its last line show whole
  const clamp = view === 'grid' && !!custom.trim();
  const head = useRef<HTMLHeadingElement>(null);
  const { traits: now, matches } = useStyleMatch();
  // new traits re-filter the cards a moment after the panel answers; the cards dim until they catch up
  const traits = useDeferredValue(now);
  const shown = PAGE_STYLES.filter(s => matches(s, {}, traits));
  const current = useEditor(s => styleById(s.styleId));
  const refocus = () => head.current?.focus();
  return (
    <>
      <div className="stage-scroll" data-guide="stage">
        <div className="style-cards">
          <div className="cards-head">
            <div className="cards-title">
              <h1 ref={head} tabIndex={-1}>Start with a style</h1>
              <p className="letters-note">{LETTERS_NOTE}</p>
            </div>
            {/* the filters sit after every card in tab order; this jumps there, and shows only when focused */}
            <button className="skip" onClick={focusFilters}>Skip to filters</button>
          </div>
          <ActiveBar onClear={refocus} />
          {shown.length ? (
            <div className={traits === now ? 'style-groups' : 'style-groups stale'}>
              {STYLE_GROUPS.filter(g => shown.some(s => s.group === g.id)).map(g => (
                <section key={g.id} className="style-group" aria-labelledby={`g-${g.id}`}>
                  <h2 className="group-head" id={`g-${g.id}`}>{g.label}<span>{g.hint}</span></h2>
                  <div className={view === 'list' ? 'cards list' : 'cards'}>
                    {shown.filter(s => s.group === g.id).map(s => <StyleCard key={s.id} style={s} text={text} view={view} clamp={clamp} />)}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="cards-empty">No styles match these filters. <button className="link" onClick={() => { actions.clearFilters(); refocus(); }}>Clear filters</button></p>
          )}
        </div>
      </div>
      {/* the way on, once the style that's loaded is among the cards: shape it */}
      {current && shown.includes(current) && <CardsFoot style={current} />}
    </>
  );
}

/** The foot of the Style page, kept in sight under the cards as the page steps are under a page of controls: the
    style the design starts from, in its font, and Customize, on to the first page of controls. */
function CardsFoot({ style: s }: { style: StyleDef }) {
  const family = parseFontId(useEditor(st => st.params.freeFont))?.family;
  return (
    <div className="cards-foot">
      <span className="cards-foot-pick">
        <span className="cards-foot-label">Starting from</span> {s.name}{family && <span className="card-like">{family}</span>}
      </span>
      <button className="btn primary small" onClick={() => actions.setCategory('weight')}>
        Customize
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
      </button>
    </div>
  );
}

/** Everything picked, search, categories, feelings and traits, as one row of chips, each removed with a click; the
    trait chips are tinted apart from the filters, and a feeling is named in its font as on its chip. */
function ActiveBar({ onClear }: { onClear: () => void }) {
  const { f, traits } = useStyleMatch();
  const tag = <T extends string>(list: { id: T; label: string }[], id: T) => list.find(x => x.id === id)!.label;
  const items: { key: string; label: string; card?: string; trait?: boolean; remove: () => void }[] = [
    ...(f.query?.trim() ? [{ key: 'q', label: `“${f.query.trim()}”`, remove: () => actions.setQuery('') }] : []),
    ...f.groups.map(g => ({ key: `g-${g}`, label: tag(STYLE_GROUPS, g), remove: () => actions.toggleGroup(g) })),
    ...f.moods.map(m => MOODS.find(x => x.id === m)!).map(({ id, label, card }) => ({ key: `m-${id}`, label, card, remove: () => actions.toggleMood(id) })),
    ...traitLabels(traits).map(t => ({ key: `t-${t.id}`, label: t.label, trait: true, remove: () => actions.setTrait(t.id, null) }))
  ];
  if (!items.length) return null;
  return (
    <div className="active-bar" role="group" aria-label="Active filters and traits">
      {items.map(it => (
        <button key={it.key} className={it.trait ? 'active-chip trait' : 'active-chip'} onClick={it.remove} aria-label={`Remove ${it.label}`}>
          {it.card ? <FeelingName label={it.label} card={it.card} /> : it.label}
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
        </button>
      ))}
      {items.length > 1 && <button className="link small" onClick={() => { actions.clearFilters(); actions.clearTraits(); onClear(); }}>Clear all</button>}
    </div>
  );
}

/** What the cards are: each style in one of TypeLab's own fonts, which every setting reshapes. */
const LETTERS_NOTE = 'TypeLab’s own fonts, yours to change and use as you like. Every setting reshapes their letters, and Points redraws any of them.';

/** The size text is set at in a free font in a box `width` px wide: `size`, or, where its longest word would overrun
    the box, smaller, down to half of it, past which the word breaks (as BuiltText sizes the engine's letters). */
function wordFit(font: FreeFontRef | null, text: string, width: number, size: number) {
  if (!font || !width) return size;
  const longest = Math.max(0.01, ...text.split(/\s+/).map(w => textWidth(font, w)));
  return Math.max(size / 2, Math.min(size, width * 0.99 / longest));
}

/** A style's card: the sample text set in its free font, as the browser draws the font, or, for a style no font
    stands behind (built from blocks), in the engine's letters; typed text in the grid (`clamp`) cut to GRID_LINES lines. */
function StyleCard({ style: s, text, view, clamp }: { style: StyleDef; text: string; view: CardView; clamp: boolean }) {
  const id = STYLE_FONTS[s.id];
  const on = useEditor(st => st.styleId === s.id && (!id || !!st.params.freeFont));
  const font = useWebFont(id), [ref, box] = useSize<HTMLSpanElement>();
  return (
    <button className={on ? 'card on' : 'card'} title={s.desc} aria-current={on || undefined} onClick={() => actions.loadStyle(s.id)}>
      <span className="card-name">{s.name}<span className="card-like">{id ? parseFontId(id)?.family : 'Built from blocks'}</span></span>
      {id
        ? <span ref={ref} className={`card-free${font ? '' : ' loading'}${clamp ? ' clamp' : ''}`} style={{ ...(font && fontStyle(font)), fontSize: wordFit(font, text, box.width, CARD_SIZE[view]) }}>{text}</span>
        : <BuiltText className="card-free" params={s.params} text={text} size={CARD_SIZE[view]} lines={view === 'grid' ? GRID_LINES : undefined} />}
    </button>
  );
}
