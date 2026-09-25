import { useState } from 'react';
import { FEELINGS, STYLE_GROUPS, STYLES, type Feeling, type StyleDef, type StyleGroup } from '../../shared/content';
import { n1, useSize } from '../lib/hooks';
import { actions, fontFor, useEditor, type PreviewMode } from '../state/editor';
import { Inspector } from './Inspector';
import { Preview } from './Preview';

const MODES: [PreviewMode, string][] = [['sentence', 'Sentence'], ['alphabet', 'Alphabet'], ['paragraph', 'Paragraph'], ['custom', 'Custom']];

export function Stage() {
  const category = useEditor(s => s.category), mode = useEditor(s => s.mode);
  const [scrollRef, size] = useSize<HTMLDivElement>();
  return (
    <main className="stage">
      <StageBar />
      <div className="stage-scroll" ref={scrollRef} data-guide="stage">
        {category === 'style' && <StyleCards />}
        {mode === 'custom' && <CustomText />}
        <Preview width={Math.max(200, size.width - 96)} />
      </div>
      <Inspector />
    </main>
  );
}

function StageBar() {
  const mode = useEditor(s => s.mode), size = useEditor(s => s.sizes[s.mode]);
  return (
    <div className="stage-bar">
      <div className="tabs" role="tablist" aria-label="Preview text">
        {MODES.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={id === mode} className={id === mode ? 'tab on' : 'tab'} onClick={() => actions.setMode(id)}>{label}</button>
        ))}
      </div>
      <label className="size">
        <span>Size</span>
        <input type="range" min={14} max={220} value={size} onChange={e => actions.setSize(Number(e.target.value))} />
        <output>{size}px</output>
      </label>
    </div>
  );
}

function CustomText() {
  const custom = useEditor(s => s.custom);
  return (
    <div className="custom-wrap">
      <textarea rows={2} spellCheck={false} placeholder="Type anything…" aria-label="Custom preview text" autoFocus
        value={custom} onChange={e => actions.setCustom(e.target.value)} />
    </div>
  );
}

/* Filters work like the ones on Google Fonts: one classification plus an optional feeling. */
function StyleCards() {
  const current = useEditor(s => s.styleId);
  const [group, setGroup] = useState<StyleGroup | 'all'>('all');
  const [feel, setFeel] = useState<Feeling | null>(null);
  const inGroup = (s: StyleDef, g: StyleGroup | 'all') => g === 'all' || s.group === g;
  const hasFeel = (s: StyleDef, f: Feeling | null) => !f || s.feel.includes(f);
  const shown = STYLES.filter(s => inGroup(s, group) && hasFeel(s, feel));
  return (
    <div className="style-cards">
      <div className="cards-head">
        <h1>Start with a style</h1>
      </div>
      <div className="style-filter">
        <span className="filter-label" id="f-class">Classification</span>
        <div className="chips" role="group" aria-labelledby="f-class">
          {([['all', 'All'], ...STYLE_GROUPS] as [StyleGroup | 'all', string][]).map(([id, label]) => (
            <button key={id} className={id === group ? 'chip on' : 'chip'} aria-pressed={id === group} onClick={() => setGroup(id)}>
              {label}<span className="count">{STYLES.filter(s => inGroup(s, id) && hasFeel(s, feel)).length}</span>
            </button>
          ))}
        </div>
        <span className="filter-label" id="f-feel">Feeling</span>
        <div className="chips" role="group" aria-labelledby="f-feel">
          {FEELINGS.map(([id, label]) => {
            const n = STYLES.filter(s => inGroup(s, group) && hasFeel(s, id)).length;
            return (
              <button key={id} className={id === feel ? 'chip on' : 'chip'} aria-pressed={id === feel} disabled={!n && id !== feel}
                onClick={() => setFeel(id === feel ? null : id)}>{label}</button>
            );
          })}
        </div>
      </div>
      <div className="cards">
        {shown.map(s => {
          const f = fontFor(s.params), ln = f.layout('Aa', Infinity)[0], vw = Math.max(1500, ln.width + 160), pad = (vw - ln.width) / 2;
          return (
            <button key={s.id} className={s.id === current ? 'card on' : 'card'} onClick={() => actions.loadStyle(s.id)}>
              <svg viewBox={`${n1(-pad)} -900 ${n1(vw)} 1150`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                {ln.items.map((it, i) => <path key={i} d={f.glyph(it.ch)!.d} transform={`translate(${n1(it.x)},0)`} />)}
              </svg>
              <span className="card-name">{s.name}</span>
            </button>
          );
        })}
        {!shown.length && (
          <p className="cards-empty">No styles match. <button className="link" onClick={() => { setGroup('all'); setFeel(null); }}>Clear filters</button></p>
        )}
      </div>
    </div>
  );
}
