import { STYLE_GROUPS, STYLES, styleMatches, type StyleDef } from '../../shared/content';
import { n1, useSize } from '../lib/hooks';
import { sampleText } from '../lib/preview';
import { actions, fontFor, useEditor, type CardView } from '../state/editor';
import { Inspector } from './Inspector';
import { Preview } from './Preview';

/* Like Google Fonts: one "Type something" bar on top sets the sample text and size, both for the
   style cards and for the live preview of the design. */
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
      <div className="type-field">
        <input type="text" spellCheck={false} placeholder="Type something" aria-label="Preview text"
          value={custom} onChange={e => actions.setCustom(e.target.value)} />
        {custom && <button className="type-clear" aria-label="Clear preview text" onClick={() => actions.setCustom('')}>✕</button>}
      </div>
      <label className="size">
        <span>Size</span>
        <input type="range" min={14} max={220} value={size} onChange={e => actions.setSize(Number(e.target.value))} />
        <output>{size}px</output>
      </label>
      {style && <ViewToggle />}
    </div>
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

/** The live preview, laid out to the scroll box's width minus its side padding. */
function SampleText() {
  const [scrollRef, size] = useSize<HTMLDivElement>();
  return (
    <div className="stage-scroll" ref={scrollRef} data-guide="stage">
      <Preview width={Math.max(200, size.width - 96)} />
    </div>
  );
}

/** Cards are grouped by type (Sans Serif > Geometric, …) and narrowed by the panel's filters. */
function StyleCards() {
  const text = sampleText(useEditor(s => s.custom)), size = useEditor(s => s.size);
  const groups = useEditor(s => s.groups), moods = useEditor(s => s.moods), view = useEditor(s => s.view);
  const shown = STYLES.filter(s => styleMatches(s, groups, moods));
  return (
    <div className="style-cards">
      <div className="cards-head">
        <h1>Start with a style</h1>
        {shown.length < STYLES.length && <span>{shown.length} of {STYLES.length} styles</span>}
      </div>
      {shown.length ? (
        <div className="style-groups">
          {STYLE_GROUPS.filter(g => shown.some(s => s.group === g.id)).map(g => (
            <section key={g.id} className="style-group" aria-labelledby={`g-${g.id}`}>
              <h2 className="group-head" id={`g-${g.id}`}>{g.label}<span>{g.hint}</span></h2>
              <div className={view === 'list' ? 'cards list' : 'cards'}>
                {shown.filter(s => s.group === g.id).map(s => <StyleCard key={s.id} style={s} text={text} size={size} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="cards-empty">No styles match these filters. <button className="link" onClick={actions.clearFilters}>Clear filters</button></p>
      )}
    </div>
  );
}

/** Each card shows the sample text set in that style, wrapped to the card's width. */
function StyleCard({ style: s, text, size }: { style: StyleDef; text: string; size: number }) {
  const on = useEditor(st => st.styleId === s.id);
  const [ref, box] = useSize<HTMLButtonElement>();
  const f = fontFor(s.params), sc = size / 1000, width = Math.max(1, box.width - 36);
  const top = Math.max(f.m.asc, f.m.cap) + 30, LH = top - f.m.desc + 40;
  const lines = box.width ? f.layout(text, width / sc) : [];
  const H = n1(lines.length * LH * sc);
  return (
    <button ref={ref} className={on ? 'card on' : 'card'} title={s.desc} onClick={() => actions.loadStyle(s.id)}>
      <span className="card-name">{s.name}</span>
      <svg width={n1(width)} height={H} viewBox={`0 0 ${n1(width)} ${H}`} aria-hidden="true">
        <g transform={`scale(${sc})`}>
          {lines.map((ln, i) => ln.items.map((it, j) => {
            const g = f.glyph(it.ch);
            return g && <path key={`${i}-${j}`} d={g.d} transform={`translate(${n1(it.x)},${n1(top + i * LH)})`} />;
          }))}
        </g>
      </svg>
    </button>
  );
}
