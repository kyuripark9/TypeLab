import { STYLES } from '../../shared/content';
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
      <div className="stage-scroll" ref={scrollRef}>
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
      <span className="bar-hint">Click any letter to inspect it</span>
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

function StyleCards() {
  const current = useEditor(s => s.styleId);
  return (
    <div className="style-cards">
      <div className="cards-head">
        <h1>Start with a style</h1>
        <p>These aren’t finished fonts — they’re starting systems. Pick one, then reshape everything.</p>
      </div>
      <div className="cards">
        {STYLES.map(s => {
          const f = fontFor(s.params), ln = f.layout('Aa', Infinity)[0], pad = (1500 - ln.width) / 2;
          return (
            <button key={s.id} className={s.id === current ? 'card on' : 'card'} onClick={() => actions.loadStyle(s.id)}>
              <svg viewBox={`${-pad} -900 1500 1150`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                {ln.items.map((it, i) => <path key={i} d={f.glyph(it.ch)!.d} transform={`translate(${n1(it.x)},0)`} />)}
              </svg>
              <span className="card-name">{s.name}</span>
              <span className="card-tags">{s.tags}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
