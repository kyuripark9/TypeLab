/* Right-hand panel: the starting-style filters, or the controls of the open category with a
   live explainer. While a letter is inspected, the sliders are grouped by the parts of that
   letter they shape; pointing at a part name highlights it on the letter. Every control leads with plain language; the typographic term comes second. */
import { useEffect, useRef, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';
import {
  ANATOMY, CATEGORIES, CONTROLS, MOODS, PART_CONTROL, SERIF_SHAPE_OPTIONS, SERIF_SUBS, STYLE_GROUPS, STYLES, TERMINAL_OPTIONS, controlFor, styleMatches,
  type ActiveKey, type CategoryId, type ControlKey, type Mood, type SerifSubKey, type StyleGroup
} from '../../shared/content';
import type { NumericParam } from '../../shared/params';
import { actions, useEditor, useFont } from '../state/editor';
import { Diagram, SerifIcon, TerminalIcon } from './Diagram';
import { letterControls } from './Inspector';

export function Panel() {
  const category = useEditor(s => s.category);
  return (
    <aside className="panel" aria-label="Controls" data-guide="panel" onPointerLeave={() => { actions.setHot(false); actions.setPart(null); }}>
      {category === 'style' ? <StyleFilters /> : <ControlsPanel category={category} />}
    </aside>
  );
}

/** Style page: filter the starting styles by type and mood, like the Google Fonts filters. */
function StyleFilters() {
  const groups = useEditor(s => s.groups), moods = useEditor(s => s.moods);
  // each option's count is what picking it would show, given the other facet
  const count = (g: StyleGroup[], m: Mood[]) => STYLES.filter(s => styleMatches(s, g, m)).length;
  return (
    <div className="panel-pad filters">
      <div className="filters-head">
        <h2 className="panel-title">Filters</h2>
        {(groups.length > 0 || moods.length > 0) && <button className="btn ghost small" onClick={actions.clearFilters}>Clear</button>}
      </div>
      <div className="facet" role="group" aria-labelledby="f-type">
        <div className="facet-label" id="f-type">Type</div>
        {STYLE_GROUPS.map(g => (
          <label key={g.id} className="facet-row" title={g.hint}>
            <input type="checkbox" checked={groups.includes(g.id)} onChange={() => actions.toggleGroup(g.id)} />
            <span>{g.label}</span>
            <span className="count">{count([g.id], moods)}</span>
          </label>
        ))}
      </div>
      <div className="facet" role="group" aria-labelledby="f-mood">
        <div className="facet-label" id="f-mood">Mood</div>
        <div className="chips">
          {MOODS.map(([id, label]) => {
            const on = moods.includes(id), n = count(groups, [id]);
            return (
              <button key={id} className={on ? 'chip on' : 'chip'} aria-pressed={on} disabled={!n && !on} onClick={() => actions.toggleMood(id)}>
                {label}<span className="count">{n}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ControlsPanel({ category }: { category: Exclude<CategoryId, 'style'> }) {
  const keys = (Object.keys(CONTROLS) as ControlKey[]).filter(k => CONTROLS[k].cat === category);
  const inspecting = useEditor(s => !!s.inspect);
  return (
    <>
      <Explainer />
      {inspecting ? <LetterControls keys={keys} category={category} /> : <div className="ctl-list">{keys.map(k => <Control key={k} k={k} />)}</div>}
    </>
  );
}

/** The inspected letter's sliders, named by the parts they shape, then the rest of the category. */
function LetterControls({ keys, category }: { keys: ControlKey[]; category: Exclude<CategoryId, 'style'> }) {
  const ch = useEditor(s => s.inspect)!, serif = useEditor(s => s.params.serif), font = useFont();
  const g = font.glyph(ch);
  const rows = g ? letterControls(g, ch, serif) : [];
  const rest = keys.filter(k => !rows.some(r => r.key === k));
  return (
    <div className="ctl-list">
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
  if (c.type === 'serif') return <SerifControl parts={parts} />;
  return <SliderControl k={k as NumericParam} def={c} parts={parts} />;
}

/** A control's title. Named by letter parts, the parts lead and each one can be pointed at. */
function CtlHead({ friendly, tech, parts, advanced }: { friendly: string; tech: string; parts?: string[]; advanced?: boolean }) {
  const part = useEditor(s => s.part);
  if (!parts?.length) {
    return (
      <div className="ctl-head">
        <span className="ctl-friendly">{friendly}</span>
        <span className="ctl-tech">{tech}{advanced && <em>Advanced</em>}</span>
      </div>
    );
  }
  return (
    <div className="ctl-head">
      <span className="ctl-parts">
        {parts.map(p => (
          <span key={p} className={p === part ? 'part on' : 'part'}
            onPointerEnter={() => actions.setPart(p)} onPointerLeave={() => actions.setPart(null)}>{ANATOMY[p][0]}</span>
        ))}
      </span>
      <span className="ctl-tech">{friendly}</span>
    </div>
  );
}
function Explainer() {
  const active = useEditor(s => s.active), inspecting = useEditor(s => !!s.inspect), font = useFont();
  const part = useEditor(s => s.inspect ? s.part : null);
  const c = CONTROLS[controlFor(active)], sub = SERIF_SUBS[active as SerifSubKey];
  const shapedBy = part && PART_CONTROL[part];
  // while inspecting, the large letter on the stage already shows the part, so drop the diagram
  return (
    <div className={inspecting ? 'explainer compact' : 'explainer'}>
      {!inspecting && <div className="diagram-box"><Diagram font={font} k={active} /></div>}
      {part ? (
        <div className="ex-text">
          <div className="ex-tech">Anatomy{shapedBy && ` · shaped by ${CONTROLS[shapedBy].tech.split(' · ')[0]}`}</div>
          <h3>{ANATOMY[part][0]}</h3>
          <p>{ANATOMY[part][1]}</p>
        </div>
      ) : (
        <div className="ex-text">
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
function useControlFocus(key: ActiveKey) {
  const own = (e: PointerEvent | FocusEvent) => (e.target as Element).closest('.ctl') === e.currentTarget;
  return {
    onPointerOver: (e: PointerEvent) => { if (own(e)) actions.focusControl(key); },
    onFocus: (e: FocusEvent) => { if (own(e)) actions.focusControl(key); }
  };
}

interface SliderDef { friendly: string; tech: string; lo?: string; hi?: string; bipolar?: boolean; advanced?: boolean }

function SliderControl({ k, def, parts }: { k: NumericParam; def: SliderDef; parts?: string[] }) {
  const value = useEditor(s => s.params[k]), active = useEditor(s => s.active === k);
  const cls = ['ctl', def.bipolar && 'bipolar', active && 'active'].filter(Boolean).join(' ');
  return (
    <div className={cls} data-ctl={k} {...useControlFocus(k)}>
      <CtlHead friendly={def.friendly} tech={def.tech} parts={parts} advanced={def.advanced} />
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

function TerminalControl({ parts }: { parts?: string[] }) {
  const terminal = useEditor(s => s.params.terminal), active = useEditor(s => s.active === 'terminal');
  const c = CONTROLS.terminal;
  return (
    <div className={active ? 'ctl active' : 'ctl'} data-ctl="terminal" {...useControlFocus('terminal')}>
      <CtlHead friendly={c.friendly} tech={c.tech} parts={parts} />
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

function SerifControl({ parts }: { parts?: string[] }) {
  const p = useEditor(s => s.params), active = useEditor(s => controlFor(s.active) === 'serif');
  const c = CONTROLS.serif;
  return (
    <div className={active ? 'ctl active' : 'ctl'} data-ctl="serif" {...useControlFocus('serif')}>
      <div className="ctl-row">
        <CtlHead friendly={c.friendly} tech={c.tech} parts={parts} />
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
