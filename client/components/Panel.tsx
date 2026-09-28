/* Right-hand panel: the starting-style filters, or the controls of the open category with a
   live explainer. While a letter is inspected, the sliders are grouped by the parts of that
   letter they shape; pointing at a part name highlights it on the letter. Every control leads with plain language; the typographic term comes second. */
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import {
  ANATOMY, CATEGORIES, CONTROLS, DOT_SUBS, FILL_OPTIONS, FILL_SUBS, FORM_OPTIONS, KIND_SECTIONS, MOODS, PAGE_LOOKS, PAGE_STYLES, PART_CONTROL, SERIF_SHAPE_OPTIONS, SERIF_SUBS, STORY_OPTIONS,
  SUBS, TAG_FACE, TERMINAL_DETAILS, TERMINAL_FORM_LABELS, TERMINAL_OPTIONS, TERMINAL_SUBS, controlFor, styleById, styleMatches,
  type ActiveKey, type CategoryId, type ControlKey, type DotSubKey, type FillSubKey, type FormKey, type Kind, type Look, type Mood, type SerifSubKey, type StyleFilter, type TerminalSubKey
} from '../../shared/content';
import { TERMINAL_FORMS, formOf, isGlyphKey, type NumericParam, type Params } from '../../shared/params';
import { n1 } from '../lib/hooks';
import type { Glyph } from '../../shared/engine';
import { letterCorners, strokeEnds, type CornerInfo, type StrokeEndInfo } from '../lib/drag';
import { actions, curlOf, endOf, fontFor, isOn, letterOf, useEditor, useFont, useParam, useScopedFont, type EndKey } from '../state/editor';
import { Diagram, FillIcon, FormIcon, SerifIcon, StoryIcon, TerminalIcon } from './Diagram';
import { ScopeIcon, letterControls } from './Inspector';

export function Panel() {
  const category = useEditor(s => s.category), customizing = useEditor(s => !!letterOf(s));
  return (
    <aside className={customizing ? 'panel customizing' : 'panel'} aria-label="Controls" data-guide="panel" onPointerLeave={() => { actions.setHot(false); actions.setPart(null); }}>
      {category === 'style' ? <StyleFilters /> : <ControlsPanel category={category} />}
    </aside>
  );
}

/** Style page: filter the starting styles by tag, in the sections of the Google Fonts filters. */
function StyleFilters() {
  const f: StyleFilter = { moods: useEditor(s => s.moods), looks: useEditor(s => s.looks), kinds: useEditor(s => s.kinds) };
  // each tag's count is what picking it would show, given the other facets
  const count = (pick: Partial<StyleFilter>) => PAGE_STYLES.filter(s => styleMatches(s, { ...f, ...pick })).length;
  const picked = f.moods.length + f.looks.length + f.kinds.length > 0;
  return (
    <div className="panel-pad filters">
      <div className="filters-head">
        <h2 className="panel-title">Filters</h2>
        {picked && <button className="btn ghost small" onClick={actions.clearFilters}>Clear</button>}
      </div>
      <ChipFacet id="feeling" label="Feeling" tags={MOODS} picked={f.moods} count={m => count({ moods: [m] })} toggle={actions.toggleMood} />
      <ChipFacet id="appearance" label="Appearance" tags={PAGE_LOOKS} picked={f.looks} count={l => count({ looks: [l] })} toggle={actions.toggleLook} />
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
      <div className={closed ? 'reveal' : 'reveal open'} id={`c-${id}`} inert={closed}>
        <div>
          <div className="facet-body">
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
        </div>
      </div>
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
  const ch = useEditor(s => s.inspect)!, font = useFont(), customizing = useEditor(s => !!letterOf(s));
  const g = font.glyph(ch);
  const rows = g ? letterControls(g, ch, font.letter(ch).params.serif) : [];
  const rest = keys.filter(k => !rows.some(r => r.key === k));
  return (
    <div className="ctl-list">
      {customizing && <div className="scope-note"><ScopeIcon id="letter" /><span>Only {ch} changes. Settings tagged <em>Whole font</em> still change every letter.</span></div>}
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
  if (c.type === 'form') return <FormControl k={k as LetterFormKey} parts={parts} />;
  if (k === 'roundness') return <SliderControl k={k} def={c} parts={parts}><EachCorner /></SliderControl>;
  if (c.type === 'serif') return <SerifControl parts={parts} />;
  if (c.type === 'fill') return <FillControl />;
  return <SliderControl k={k as NumericParam} def={c} parts={parts} />;
}

/** A control's short title. While a letter is inspected, the parts it shapes follow in grey and each one can be pointed at. */
function CtlHead({ k, label, parts, advanced }: { k: keyof Params; label: string; parts?: string[]; advanced?: boolean }) {
  const part = useEditor(s => s.part);
  const inspect = useEditor(s => s.inspect), letter = useEditor(letterOf);
  const own = useEditor(s => !!s.inspect && isGlyphKey(k) && s.params.glyphs[s.inspect]?.[k] !== undefined);
  const tag = scopeTag(inspect, letter, own, k);
  return (
    <div className="ctl-head">
      <span className="ctl-label">{label}{advanced && <em>Advanced</em>}{tag && <em className={tag.own ? 'own' : undefined} title={tag.title}>{tag.text}</em>}</span>
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
/** While a letter is inspected: whether it has its own value of `k`, and while edits go to that
    letter, which controls still change every letter. */
function scopeTag(inspect: string | null, letter: string | null, own: boolean, k: keyof Params) {
  if (!inspect) return null;
  if (own) {
    return { own: true, text: 'Custom', title: letter ? `Only ${inspect} has this value. Double-click the slider to sync it with the other letters.` : `${inspect} keeps its own value when this changes` };
  }
  return letter && !isGlyphKey(k) ? { own: false, text: 'Whole font', title: `Every letter shares this setting, so it changes all of them even while customizing ${letter}` } : null;
}

/** The long controls, whose settings fold away under their heading. */
type FoldKey = 'terminal' | 'serif' | 'fill';

/** A long control's heading: its title, then a chevron that folds the rest of it away. Folded, it
    names the current choice. `tools` sit before the chevron (the serif switch); while `shut` (serifs
    switched off) there is nothing to fold, so the chevron hides. */
function FoldHead({ k, label, parts, summary, tools, shut }: { k: FoldKey; label: string; parts?: string[]; summary: string; tools?: ReactNode; shut?: boolean }) {
  const folded = useEditor(s => s.folded.includes(k));
  return (
    <div className="ctl-top fold-head">
      <CtlHead k={k} label={label} parts={parts} />
      <div className="ctl-tools">
        {folded && !shut && <span className="fold-sum">{summary}</span>}
        {tools}
        <button className="fold-btn" disabled={shut} aria-expanded={!folded && !shut} aria-controls={`fold-${k}`}
          aria-label={`${folded ? 'Show' : 'Hide'} ${label.toLowerCase()} settings`} title={folded ? 'Show settings' : 'Hide settings'}
          onClick={() => actions.toggleFold(k)}>
          <svg className="facet-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5" /></svg>
        </button>
      </div>
    </div>
  );
}

/** The body under a FoldHead, open unless folded or `shut`. */
function Fold({ k, shut, children }: { k: FoldKey; shut?: boolean; children: ReactNode }) {
  const open = !useEditor(s => s.folded.includes(k)) && !shut;
  return (
    <div className={open ? 'reveal fold open' : 'reveal fold'} id={`fold-${k}`} inert={!open}>
      <div><div className="fold-body">{children}</div></div>
    </div>
  );
}

function Explainer() {
  const active = useEditor(s => s.active), inspecting = useEditor(s => !!s.inspect), font = useFont();
  const part = useEditor(s => s.inspect ? s.part : null), tips = useEditor(s => s.tips);
  const c = CONTROLS[controlFor(active)], sub = SUBS[active as SerifSubKey | FillSubKey | TerminalSubKey | DotSubKey];
  const shapedBy = part && PART_CONTROL[part];
  const close = (
    <button className="btn ghost icon small ex-close" onClick={() => actions.setTips(false)} aria-label="Hide explanation" title="Hide explanation">
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
    </button>
  );
  // while inspecting, the large letter on the stage already shows the part, so drop the diagram
  return (
    <div className={inspecting ? 'explainer compact' : 'explainer'}>
      {!inspecting && <div className="diagram-box"><Diagram font={font} k={active} /></div>}
      {!tips ? (
        <button className="ex-open" onClick={() => actions.setTips(true)} aria-expanded={false}>
          Show explanation
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg>
        </button>
      ) : part ? (
        <div className="ex-text">
          {close}
          <div className="ex-tech">Anatomy{shapedBy && ` · shaped by ${CONTROLS[shapedBy].tech.split(' · ')[0]}`}</div>
          <h3>{ANATOMY[part][0]}</h3>
          <p>{ANATOMY[part][1]}</p>
        </div>
      ) : (
        <div className="ex-text">
          {close}
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
/** Also marks a control that, while a letter is customized, reshapes only that letter. */
function useControlFocus(key: ActiveKey) {
  const own = (e: PointerEvent | FocusEvent) => (e.target as Element).closest('.ctl') === e.currentTarget;
  const letterOnly = useEditor(s => !!letterOf(s) && isGlyphKey(key));
  return {
    'data-letter': letterOnly || undefined,
    onPointerOver: (e: PointerEvent) => { if (own(e)) actions.focusControl(key); },
    onFocus: (e: FocusEvent) => { if (own(e)) actions.focusControl(key); }
  };
}

interface SliderDef { label: string; friendly: string; tech: string; lo?: string; hi?: string; bipolar?: boolean; advanced?: boolean; off?: number }

/** A slider. An optional one (with an `off` value) has a switch; switched off, its slider folds away. */
/** `children` follow the slider inside its control, like the corners under Roundness. */
function SliderControl({ k, def, parts, children }: { k: NumericParam; def: SliderDef; parts?: string[]; children?: ReactNode }) {
  const value = useParam(k), active = useEditor(s => s.active === k);
  const optional = def.off !== undefined, on = useEditor(s => !optional || isOn(s, k, def.off!));
  // using the slider keeps it open, even dragged all the way to its off value
  const keep = () => { if (optional) actions.keepOn(k); };
  const cls = ['ctl', def.bipolar && 'bipolar', active && 'active', !on && 'off'].filter(Boolean).join(' ');
  return (
    <div className={cls} data-ctl={k} {...useControlFocus(k)}>
      <div className="ctl-top">
        <CtlHead k={k} label={def.label} parts={parts} advanced={def.advanced} />
        <div className="ctl-tools">
          {on && <NumberField value={value} label={def.tech} onChange={v => { keep(); actions.focusControl(k); actions.setParam(k, v); actions.commit(); }} />}
          {optional && (
            <button className={on ? 'switch on' : 'switch'} role="switch" aria-checked={on} aria-label={def.label}
              onClick={() => { actions.focusControl(k); actions.switchControl(k, !on, def.off!); }}><i /></button>
          )}
        </div>
      </div>
      <div className={on ? 'reveal open' : 'reveal'} inert={!on}>
        <div>
          <Range
            value={value}
            label={def.tech}
            onInput={v => {
              // the middle is sticky: near 50 snaps onto the dot
              if (Math.abs(v - 0.5) <= 0.03) v = 0.5;
              keep();
              actions.focusControl(k);
              actions.setParam(k, v);
            }}
            onCommit={actions.commit}
            onReset={() => { keep(); actions.resetParam(k); }}
          />
          <div className="ctl-ends"><span>{def.lo}</span><span>{def.hi}</span></div>
        </div>
      </div>
      {children}
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
  const terminal = useParam('terminal'), form = formOf(terminal, useParam('terminalForm')), run = useParam('terminalRun'), active = useEditor(s => controlFor(s.active) === 'terminal');
  const c = CONTROLS.terminal, forms = TERMINAL_FORMS[terminal], kindLabel = TERMINAL_OPTIONS.find(([id]) => id === terminal)![1];
  return (
    <div className={active ? 'ctl active' : 'ctl'} data-ctl="terminal" {...useControlFocus('terminal')}>
      <FoldHead k="terminal" label={c.label} parts={parts} summary={`${kindLabel} · ${TERMINAL_FORM_LABELS[form]}${run === 'straight' ? ' · Straight' : ''}`} />
      <Fold k="terminal">
        <div className="opts six" role="radiogroup" aria-label={c.tech}>
          {TERMINAL_OPTIONS.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={terminal === id} className={terminal === id ? 'opt on' : 'opt'}
              onClick={() => actions.setOption('terminal', id)}>
              <TerminalIcon kind={id} /><span>{label}</span>
            </button>
          ))}
        </div>
        <div className="sub-label">{kindLabel} shape</div>
        <div className={forms.length === 3 ? 'opts three' : 'opts two'} role="radiogroup" aria-label={`${kindLabel} shape`}>
          {forms.map(id => (
            <button key={id} role="radio" aria-checked={form === id} className={form === id ? 'opt on' : 'opt'}
              onClick={() => actions.setOption('terminalForm', id)}>
              <TerminalIcon kind={terminal} form={id} /><span>{TERMINAL_FORM_LABELS[id]}</span>
            </button>
          ))}
        </div>
        {TERMINAL_DETAILS[form].map(k => <SliderControl key={k} k={k} def={TERMINAL_SUBS[k]} />)}
        <div className="sub-label">Direction</div>
        <FormOptions k="terminalRun" label="Direction of curved stroke ends" />
        <SliderControl k="terminalLength" def={TERMINAL_SUBS.terminalLength} />
        <SliderControl k="terminalCurl" def={TERMINAL_SUBS.terminalCurl} />
        <EachEnd />
      </Fold>
    </div>
  );
}

/** While a letter is customized, a length and curl for each of its stroke ends, each shown as a small
    picture of the letter with that end marked; while every letter is in sync, a way into customizing,
    since ends are set one by one only on a single letter. */
function EachEnd() {
  const ch = useEditor(s => s.inspect), letter = useEditor(letterOf), font = useScopedFont();
  const g = ch ? font.glyph(ch) : null, ends = g ? strokeEnds(g) : [];
  if (!ch || !g || !ends.length) return null;
  if (!letter) {
    return (
      <div className="each-end locked">
        <EndThumb g={g} ends={ends} />
        <div className="sub-label">Each end</div>
        <button className="btn wide small" onClick={() => actions.setScope('letter')}>Customize {ch}</button>
      </div>
    );
  }
  return (
    <div className="each-end">
      <div className="sub-label">Each end</div>
      {ends.map(e => <EndSlider key={e.id} g={g} ends={ends} end={e} />)}
    </div>
  );
}

/** While a letter is customized, a roundness for each of its corners (where a stroke turns, and the
    corners of its square ends), each beside a picture of the letter with that corner marked; while
    every letter is in sync, a way into customizing, since corners are rounded one by one only on a
    single letter. */
function EachCorner() {
  const ch = useEditor(s => s.inspect), letter = useEditor(letterOf), font = useScopedFont();
  const g = ch ? font.glyph(ch) : null, corners = g ? letterCorners(g) : [];
  if (!ch || !g || !corners.length) return null;
  if (!letter) {
    return (
      <div className="each-end locked">
        <EndThumb g={g} ends={corners} />
        <div className="sub-label">Each corner</div>
        <button className="btn wide small" onClick={() => actions.setScope('letter')}>Customize {ch}</button>
      </div>
    );
  }
  return (
    <div className="each-end">
      <div className="sub-label">Each corner</div>
      {corners.map(c => <CornerSlider key={c.id} g={g} corners={corners} corner={c} />)}
    </div>
  );
}

/** One corner's roundness beside a picture of the letter with that corner marked. */
function CornerSlider({ g, corners, corner: { id, label, v } }: { g: Glyph; corners: CornerInfo[]; corner: CornerInfo }) {
  const hot = useEditor(s => s.hotEnd === id);
  return (
    <div className={hot ? 'ctl end hot' : 'ctl end'} data-end={id} title={label}
      onPointerEnter={() => actions.setHotEnd(id)} onPointerLeave={() => actions.setHotEnd(null)}>
      <EndThumb g={g} ends={corners} on={id} />
      <EndRow id={id} k="corners" name="Round" label={label} value={v}
        tip="Left makes the corner sharp; the middle rounds only its outside, keeping the inside square; right rounds both" reset="Draw it as the design does" />
    </div>
  );
}

/** The letter in miniature with its stroke ends (or corners) dotted, or only the one `on`. */
function EndThumb({ g, ends, on }: { g: Glyph; ends: { id: string; x: number; y: number }[]; on?: string }) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of g.cmds) {
    for (let i = 1; i + 1 < c.length && typeof c[i] === 'number'; i += 2) {
      x0 = Math.min(x0, c[i]); x1 = Math.max(x1, c[i]); y0 = Math.min(y0, -c[i + 1]); y1 = Math.max(y1, -c[i + 1]);
    }
  }
  if (!(x0 <= x1)) return null;
  const pad = Math.max(x1 - x0, y1 - y0) * 0.16, r = pad * (on ? 0.95 : 0.7);
  return (
    <svg className="end-thumb" viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`} aria-hidden="true">
      <path d={g.d} />
      {ends.filter(e => !on || e.id === on).map(e => <circle key={e.id} cx={e.x} cy={-e.y} r={r} />)}
    </svg>
  );
}

/** One end's length and curl beside a picture of the letter with that end marked. */
function EndSlider({ g, ends, end: { id, label, hook } }: { g: Glyph; ends: StrokeEndInfo[]; end: StrokeEndInfo }) {
  const length = useEditor(s => endOf(s, id, hook)), curl = useEditor(s => curlOf(s, id)), hot = useEditor(s => s.hotEnd === id);
  const plain = id.startsWith('p');
  return (
    <div className={hot ? 'ctl end hot' : 'ctl end'} data-end={id} title={label}
      onPointerEnter={() => actions.setHotEnd(id)} onPointerLeave={() => actions.setHotEnd(null)}>
      <EndThumb g={g} ends={ends} on={id} />
      <EndRow id={id} k="terminalEnds" name="Length" label={label} value={length}
        tip="Trim the end back, or draw it on, much further than Length goes" reset={hook ? 'Reset its length' : 'Follow Length again'} />
      <EndRow id={id} k="terminalCurls" name="Curl" label={label} value={curl}
        tip="Left straightens the end, then swirls it outward; right curls it on round, into a spiral like a swash" reset={plain ? 'Reset its curl' : 'Follow Curl again'} />
    </div>
  );
}

function EndRow({ id, k, name, label, value, tip, reset }: { id: string; k: EndKey; name: string; label: string; value: number; tip: string; reset: string }) {
  const own = useEditor(s => { const ch = letterOf(s); return !!ch && s.params.glyphs[ch]?.[k]?.[id] !== undefined; });
  const aria = `${label} ${name.toLowerCase()}`, set = (v: number) => { actions.focusControl(k === 'corners' ? 'roundness' : k === 'terminalCurls' ? 'terminalCurl' : 'terminalLength'); actions.setEnd(id, v, k); };
  return (
    <>
      <span className="end-name" title={tip}>{name}</span>
      <Range value={value} label={aria} onInput={set} onCommit={actions.commit} onReset={() => actions.resetEnd(id, k)} />
      <NumberField value={value} label={aria} onChange={v => { set(v); actions.commit(); }} />
      <button className="end-reset" disabled={!own} aria-label={`Reset ${aria}`} title={reset} onClick={() => actions.resetEnd(id, k)}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7a4.5 4.5 0 1 0 1.3-3.2M2.5 1.8v2.4h2.4" /></svg>
      </button>
    </>
  );
}

/** Double or single storey. Left on auto, the form the other settings picked shows as chosen. */
function StoryControl({ parts }: { parts?: string[] }) {
  const single = useScopedFont().eff.singleStory, active = useEditor(s => s.active === 'story');
  const c = CONTROLS.story, current = single ? 'single' : 'double';
  return (
    <div className={active ? 'ctl active' : 'ctl'} data-ctl="story" {...useControlFocus('story')}>
      <CtlHead k="story" label={c.label} parts={parts} />
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

type LetterFormKey = Exclude<FormKey, 'terminalRun'>;

/** A pick between named shapes of a letter or part, each drawn by the engine. Left on auto, the
    shape the other settings give shows as chosen. */
function FormControl({ k, parts }: { k: LetterFormKey; parts?: string[] }) {
  const active = useEditor(s => controlFor(s.active) === k), c = CONTROLS[k];
  return (
    <div className={active ? 'ctl active' : 'ctl'} data-ctl={k} {...useControlFocus(k)}>
      <CtlHead k={k} label={c.label} parts={parts} />
      <FormOptions k={k} label={c.tech} />
      {k === 'dots' && <SliderControl k="dotSize" def={DOT_SUBS.dotSize} />}
    </div>
  );
}

/** The named shapes of `k` as a row of pictured options. */
function FormOptions({ k, label }: { k: FormKey; label: string }) {
  const value = useParam(k), font = useScopedFont(), { options } = FORM_OPTIONS[k];
  const current = value !== 'auto' ? value : k === 'dots' ? (font.m.dotRound >= 0.5 ? 'round' : 'square') : font.eff.mono >= 0.5 && !font.eff.serif ? 'bars' : 'plain';
  return (
    <div className={options.length === 3 ? 'opts three' : 'opts two'} role="radiogroup" aria-label={label}>
      {options.map(([id, name]) => (
        <button key={id} role="radio" aria-checked={current === id} className={current === id ? 'opt on' : 'opt'}
          onClick={() => actions.setOption(k, id as never)}>
          <FormIcon k={k} id={id} /><span>{name}</span>
        </button>
      ))}
    </div>
  );
}

function SerifControl({ parts }: { parts?: string[] }) {
  const p = { serif: useParam('serif'), serifShape: useParam('serifShape') }, active = useEditor(s => controlFor(s.active) === 'serif');
  const c = CONTROLS.serif;
  return (
    <div className={active ? 'ctl active' : 'ctl'} data-ctl="serif" {...useControlFocus('serif')}>
      <FoldHead k="serif" label={c.label} parts={parts} shut={!p.serif} summary={SERIF_SHAPE_OPTIONS.find(([id]) => id === p.serifShape)?.[1] ?? ''}
        tools={<button className={p.serif ? 'switch on' : 'switch'} role="switch" aria-checked={p.serif} aria-label="Serifs"
          onClick={() => actions.setOption('serif', !p.serif)}><i /></button>} />
      <Fold k="serif" shut={!p.serif}>
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
      </Fold>
    </div>
  );
}

function FillControl() {
  const fill = useEditor(s => s.params.fill), active = useEditor(s => controlFor(s.active) === 'fill');
  const c = CONTROLS.fill, solid = fill === 'solid';
  return (
    <div className={active ? 'ctl active' : 'ctl'} data-ctl="fill" {...useControlFocus('fill')}>
      <FoldHead k="fill" label={c.label} summary={FILL_OPTIONS.find(([id]) => id === fill)![1]} />
      <Fold k="fill">
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
      </Fold>
    </div>
  );
}
