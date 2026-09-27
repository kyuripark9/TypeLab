/* Right-hand panel: the starting-style filters, or the controls of the open category with a
   live explainer. While a letter is inspected, the sliders are grouped by the parts of that
   letter they shape; pointing at a part name highlights it on the letter. Every control leads with plain language; the typographic term comes second. */
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';
import {
  ANATOMY, CATEGORIES, CONTROLS, FILL_OPTIONS, FILL_SUBS, KIND_SECTIONS, LOOKS, MOODS, PART_CONTROL, SERIF_SHAPE_OPTIONS, SERIF_SUBS, STORY_OPTIONS,
  STYLES, SUBS, TAG_FACE, TERMINAL_OPTIONS, controlFor, styleById, styleMatches,
  type ActiveKey, type CategoryId, type ControlKey, type FillSubKey, type Kind, type Look, type Mood, type SerifSubKey, type StyleFilter
} from '../../shared/content';
import type { NumericParam } from '../../shared/params';
import { n1 } from '../lib/hooks';
import { actions, fontFor, useEditor, useFont } from '../state/editor';
import { Diagram, FillIcon, SerifIcon, StoryIcon, TerminalIcon } from './Diagram';
import { letterControls } from './Inspector';

export function Panel() {
  const category = useEditor(s => s.category);
  return (
    <aside className="panel" aria-label="Controls" data-guide="panel" onPointerLeave={() => { actions.setHot(false); actions.setPart(null); }}>
      {category === 'style' ? <StyleFilters /> : <ControlsPanel category={category} />}
    </aside>
  );
}

/** Style page: filter the starting styles by tag, in the sections of the Google Fonts filters. */
function StyleFilters() {
  const f: StyleFilter = { moods: useEditor(s => s.moods), looks: useEditor(s => s.looks), kinds: useEditor(s => s.kinds) };
  // each tag's count is what picking it would show, given the other facets
  const count = (pick: Partial<StyleFilter>) => STYLES.filter(s => styleMatches(s, { ...f, ...pick })).length;
  const picked = f.moods.length + f.looks.length + f.kinds.length > 0;
  return (
    <div className="panel-pad filters">
      <div className="filters-head">
        <h2 className="panel-title">Filters</h2>
        {picked && <button className="btn ghost small" onClick={actions.clearFilters}>Clear</button>}
      </div>
      <ChipFacet id="feeling" label="Feeling" tags={MOODS} picked={f.moods} count={m => count({ moods: [m] })} toggle={actions.toggleMood} />
      <ChipFacet id="appearance" label="Appearance" tags={LOOKS} picked={f.looks} count={l => count({ looks: [l] })} toggle={actions.toggleLook} />
      {KIND_SECTIONS.map(sec => (
        <ChipFacet key={sec.id} id={sec.id} label={sec.label} tags={sec.tags} picked={f.kinds} count={k => count({ kinds: [k] })} toggle={actions.toggleKind} />
      ))}
    </div>
  );
}

type Tag = Mood | Look | Kind;

/** Chips a long facet shows before "Show more". Picked chips always stay visible. */
const FACET_LIMIT = 8;

/** One section of tag chips. Its heading opens and closes it; a long one also folds down to its first few until expanded. */
function ChipFacet<T extends Tag>({ id, label, tags, picked, count, toggle }: {
  id: string; label: string; tags: { id: T; label: string; hint?: string }[]; picked: T[];
  count: (tag: T) => number; toggle: (tag: T) => void;
}) {
  const [closed, setClosed] = useState(false);
  const [open, setOpen] = useState(false);
  // folding away just one or two chips saves no room, so only long sections fold
  const folds = tags.length > FACET_LIMIT + 2;
  const shown = open || !folds ? tags : tags.filter((t, i) => i < FACET_LIMIT || picked.includes(t.id));
  const more = tags.length - shown.length;
  return (
    <div className="facet" role="group" aria-labelledby={`f-${id}`}>
      <button className="facet-head" aria-expanded={!closed} aria-controls={`c-${id}`} onClick={() => setClosed(!closed)}>
        <span className="facet-label" id={`f-${id}`}>{label}</span>
        {/* a closed section still says how many of its tags are picked */}
        {closed && picked.some(t => tags.some(x => x.id === t)) && (
          <span className="facet-picked">{tags.filter(x => picked.includes(x.id)).length}</span>
        )}
        <svg className="facet-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5" /></svg>
      </button>
      {!closed && (
        <div className="facet-body" id={`c-${id}`}>
          <div className="chips">
            {shown.map(({ id: tag, label, hint }) => {
              const on = picked.includes(tag), n = count(tag);
              return (
                <button key={tag} className={on ? 'chip on' : 'chip'} title={hint} aria-pressed={on} disabled={!n && !on} onClick={() => toggle(tag)}>
                  <TagText tag={tag} label={label} /><span className="count">{n}</span>
                </button>
              );
            })}
          </div>
          {(open || more > 0) && (
            <button className="facet-more" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? 'Show less' : `Show ${more} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Cap height of a tag label in px, so every face reads at about the size of the UI text. */
const TAG_CAP = 9.5;

/** A filter tag's name, drawn in a starting style that belongs to it. */
function TagText({ tag, label }: { tag: Tag; label: string }) {
  const f = fontFor(styleById(TAG_FACE[tag])!.params);
  const sc = TAG_CAP / f.m.cap, top = Math.max(f.m.asc, f.m.cap), line = f.layout(label, Infinity)[0];
  const W = n1(line.width * sc), H = n1((top - f.m.desc) * sc);
  return (
    <span className="tag-face">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
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
  if (c.type === 'story') return <StoryControl parts={parts} />;
  if (c.type === 'serif') return <SerifControl parts={parts} />;
  if (c.type === 'fill') return <FillControl />;
  return <SliderControl k={k as NumericParam} def={c} parts={parts} />;
}

/** A control's short title. While a letter is inspected, the parts it shapes follow in grey and each one can be pointed at. */
function CtlHead({ label, parts, advanced }: { label: string; parts?: string[]; advanced?: boolean }) {
  const part = useEditor(s => s.part);
  return (
    <div className="ctl-head">
      <span className="ctl-label">{label}{advanced && <em>Advanced</em>}</span>
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
function Explainer() {
  const active = useEditor(s => s.active), inspecting = useEditor(s => !!s.inspect), font = useFont();
  const part = useEditor(s => s.inspect ? s.part : null);
  const c = CONTROLS[controlFor(active)], sub = SUBS[active as SerifSubKey | FillSubKey];
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

interface SliderDef { label: string; friendly: string; tech: string; lo?: string; hi?: string; bipolar?: boolean; advanced?: boolean }

function SliderControl({ k, def, parts }: { k: NumericParam; def: SliderDef; parts?: string[] }) {
  const value = useEditor(s => s.params[k]), active = useEditor(s => s.active === k);
  const cls = ['ctl', def.bipolar && 'bipolar', active && 'active'].filter(Boolean).join(' ');
  return (
    <div className={cls} data-ctl={k} {...useControlFocus(k)}>
      <div className="ctl-top">
        <CtlHead label={def.label} parts={parts} advanced={def.advanced} />
        <NumberField value={value} label={def.tech} onChange={v => { actions.focusControl(k); actions.setParam(k, v); actions.commit(); }} />
      </div>
      <Range
        value={value}
        label={def.tech}
        onInput={v => {
          // the middle is sticky: near 50 snaps onto the dot
          if (Math.abs(v - 0.5) <= 0.03) v = 0.5;
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

/** The slider's value as a whole number from 0 to 100, typed over directly. Enter or leaving the box applies it
    (clamped to 0..100); Escape puts the old value back; the arrow keys step by 1, or 10 with Shift. */
function NumberField({ value, label, onChange }: { value: number; label: string; onChange: (v: number) => void }) {
  const shown = String(Math.round(value * 100));
  const [draft, setDraft] = useState<string | null>(null);
  const apply = (text: string) => {
    setDraft(null);
    const n = Math.round(Number(text));
    if (text.trim() !== '' && Number.isFinite(n) && String(Math.min(100, Math.max(0, n))) !== shown) onChange(Math.min(100, Math.max(0, n)) / 100);
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

/** A 0..1 range input shown as whole steps from 0 to 100. `onInput` fires while dragging; `onCommit` once on release (one undo step). */
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
    <input ref={ref} type="range" min={0} max={100} step={1} value={Math.round(value * 100)} aria-label={label}
      title="Double-click to reset" style={{ '--v': value } as CSSProperties}
      onChange={e => onInput(Number(e.target.value) / 100)} onDoubleClick={onReset} />
  );
}

function TerminalControl({ parts }: { parts?: string[] }) {
  const terminal = useEditor(s => s.params.terminal), active = useEditor(s => s.active === 'terminal');
  const c = CONTROLS.terminal;
  return (
    <div className={active ? 'ctl active' : 'ctl'} data-ctl="terminal" {...useControlFocus('terminal')}>
      <CtlHead label={c.label} parts={parts} />
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

/** Double or single storey. Left on auto, the form the other settings picked shows as chosen. */
function StoryControl({ parts }: { parts?: string[] }) {
  const single = useFont().eff.singleStory, active = useEditor(s => s.active === 'story');
  const c = CONTROLS.story, current = single ? 'single' : 'double';
  return (
    <div className={active ? 'ctl active' : 'ctl'} data-ctl="story" {...useControlFocus('story')}>
      <CtlHead label={c.label} parts={parts} />
      <div className="opts two" role="radiogroup" aria-label={c.tech}>
        {STORY_OPTIONS.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={current === id} className={current === id ? 'opt on' : 'opt'}
            onClick={() => actions.setOption('story', id)}>
            <StoryIcon story={id} /><span>{label}</span>
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
        <CtlHead label={c.label} parts={parts} />
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

function FillControl() {
  const fill = useEditor(s => s.params.fill), active = useEditor(s => controlFor(s.active) === 'fill');
  const c = CONTROLS.fill, solid = fill === 'solid';
  return (
    <div className={active ? 'ctl active' : 'ctl'} data-ctl="fill" {...useControlFocus('fill')}>
      <CtlHead label={c.label} />
      <div className="opts five" role="radiogroup" aria-label={c.tech}>
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
    </div>
  );
}
