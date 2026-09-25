/* Right-hand panel: the starting-style summary, or the controls of the open category with a
   live explainer. Every control leads with plain language; the typographic term comes second. */
import { useEffect, useRef, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';
import {
  CONTROLS, SERIF_SHAPE_OPTIONS, SERIF_SUBS, TERMINAL_OPTIONS, controlFor, styleById,
  type ActiveKey, type CategoryId, type ControlKey, type SerifSubKey
} from '../../shared/content';
import type { NumericParam } from '../../shared/params';
import { actions, useEditor, useFont } from '../state/editor';
import { Diagram, SerifIcon, TerminalIcon } from './Diagram';

export function Panel() {
  const category = useEditor(s => s.category);
  return (
    <aside className="panel" aria-label="Controls" onPointerLeave={() => actions.setHot(false)}>
      {category === 'style' ? <StylePanel /> : <ControlsPanel category={category} />}
    </aside>
  );
}

function StylePanel() {
  const style = useEditor(s => styleById(s.styleId));
  if (!style) return null;
  return (
    <div className="panel-pad">
      <div className="eyebrow">Current starting style</div>
      <h2 className="panel-title">{style.name}</h2>
      <p className="panel-tags">{style.tags}</p>
      <p className="panel-text">{style.desc}</p>
      <button className="btn wide" onClick={() => actions.loadStyle(style.id)}>Reset to {style.name} defaults</button>
      <div className="how">
        <div className="eyebrow">How TypeLab works</div>
        <ol>
          <li><b>Pick a style</b> as your starting system.</li>
          <li><b>Open a category</b> on the left — each control shows which part of the letter it changes.</li>
          <li><b>Click any letter</b> to inspect its anatomy.</li>
          <li><b>Save</b> it to your library and <b>export</b> a real font file.</li>
        </ol>
        <p className="motto">Don’t edit numbers. Design letters.</p>
      </div>
    </div>
  );
}

function ControlsPanel({ category }: { category: Exclude<CategoryId, 'style'> }) {
  const keys = (Object.keys(CONTROLS) as ControlKey[]).filter(k => CONTROLS[k].cat === category);
  return (
    <>
      <Explainer />
      <div className="ctl-list">
        {keys.map(k => {
          const c = CONTROLS[k];
          if (c.type === 'options') return <TerminalControl key={k} />;
          if (c.type === 'serif') return <SerifControl key={k} />;
          return <SliderControl key={k} k={k as NumericParam} def={c} />;
        })}
      </div>
      {category === 'personality' && (
        <p className="panel-note">Personality sliders are big gestures: each one nudges several properties at once, on top of your other settings.</p>
      )}
    </>
  );
}

function Explainer() {
  const active = useEditor(s => s.active), font = useFont();
  const c = CONTROLS[controlFor(active)], sub = SERIF_SUBS[active as SerifSubKey];
  return (
    <div className="explainer">
      <div className="diagram-box"><Diagram font={font} k={active} /></div>
      <div className="ex-text">
        <div className="ex-tech">{(sub ?? c).tech}</div>
        <h3>{(sub ?? c).friendly}</h3>
        <p>{c.explain}</p>
      </div>
    </div>
  );
}

/** Pointing at or focusing a control makes it the active one. Nested controls (serif
    sub-sliders) win over their parent. */
function useControlFocus(key: ActiveKey) {
  const own = (e: PointerEvent | FocusEvent) => (e.target as Element).closest('.ctl') === e.currentTarget;
  return {
    onPointerOver: (e: PointerEvent) => { if (own(e)) actions.focusControl(key); },
    onFocus: (e: FocusEvent) => { if (own(e)) actions.focusControl(key); }
  };
}

interface SliderDef { friendly: string; tech: string; lo?: string; hi?: string; bipolar?: boolean; advanced?: boolean }

function SliderControl({ k, def }: { k: NumericParam; def: SliderDef }) {
  const value = useEditor(s => s.params[k]), active = useEditor(s => s.active === k);
  const cls = ['ctl', def.bipolar && 'bipolar', active && 'active'].filter(Boolean).join(' ');
  return (
    <div className={cls} {...useControlFocus(k)}>
      <div className="ctl-head">
        <span className="ctl-friendly">{def.friendly}</span>
        <span className="ctl-tech">{def.tech}{def.advanced && <em>Advanced</em>}</span>
      </div>
      <Range
        value={value}
        label={def.tech}
        onInput={v => {
          // personality sliders snap to their neutral middle
          if (def.bipolar && Math.abs(v - 0.5) < 0.025) v = 0.5;
          actions.focusControl(k);
          actions.setParam(k, v);
        }}
        onCommit={actions.commit}
        onReset={() => actions.resetParam(k)}
      />
      <div className="ctl-ends"><span>{def.lo}</span><span>{def.hi}</span></div>
    </div>
  );
}

/** A 0..1 range input. `onInput` fires while dragging; `onCommit` once on release (one undo step). */
function Range({ value, label, onInput, onCommit, onReset }: { value: number; label: string; onInput: (v: number) => void; onCommit: () => void; onReset: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    const el = ref.current!, h = () => commit.current();
    el.addEventListener('change', h);
    return () => el.removeEventListener('change', h);
  }, []);
  return (
    <input ref={ref} type="range" min={0} max={1000} value={Math.round(value * 1000)} aria-label={label}
      title="Double-click to reset" style={{ '--v': value } as CSSProperties}
      onChange={e => onInput(Number(e.target.value) / 1000)} onDoubleClick={onReset} />
  );
}

function TerminalControl() {
  const terminal = useEditor(s => s.params.terminal), active = useEditor(s => s.active === 'terminal');
  const c = CONTROLS.terminal;
  return (
    <div className={active ? 'ctl active' : 'ctl'} {...useControlFocus('terminal')}>
      <div className="ctl-head"><span className="ctl-friendly">{c.friendly}</span><span className="ctl-tech">{c.tech}</span></div>
      <div className="opts six" role="radiogroup" aria-label={c.tech}>
        {TERMINAL_OPTIONS.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={terminal === id} className={terminal === id ? 'opt on' : 'opt'}
            onClick={() => actions.setOption('terminal', id)}>
            <TerminalIcon kind={id} /><span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SerifControl() {
  const p = useEditor(s => s.params), active = useEditor(s => controlFor(s.active) === 'serif');
  const c = CONTROLS.serif;
  return (
    <div className={active ? 'ctl active' : 'ctl'} {...useControlFocus('serif')}>
      <div className="ctl-row">
        <div className="ctl-head"><span className="ctl-friendly">{c.friendly}</span><span className="ctl-tech">{c.tech}</span></div>
        <button className={p.serif ? 'switch on' : 'switch'} role="switch" aria-checked={p.serif} aria-label="Serifs"
          onClick={() => actions.setOption('serif', !p.serif)}><i /></button>
      </div>
      <div className={p.serif ? 'reveal open' : 'reveal'} inert={!p.serif}>
        <div>
          <div className="sub-label">Serif shape</div>
          <div className="opts four" role="radiogroup" aria-label="Serif shape">
            {SERIF_SHAPE_OPTIONS.map(([id, label]) => (
              <button key={id} role="radio" aria-checked={p.serifShape === id} className={p.serifShape === id ? 'opt on' : 'opt'}
                onClick={() => actions.setOption('serifShape', id)}>
                <SerifIcon shape={id} /><span>{label}</span>
              </button>
            ))}
          </div>
          {(Object.keys(SERIF_SUBS) as SerifSubKey[]).map(k => <SliderControl key={k} k={k} def={SERIF_SUBS[k]} />)}
        </div>
      </div>
    </div>
  );
}
