/* Glyph inspector: one letter, large, on the stage. Its parts are live: pointing at one
   highlights it and the slider that shapes it, dragging it reshapes the design (lib/drag), and
   the side panel groups its sliders by part (letterControls). */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ANATOMY, CONTROLS, PART_CONTROL, SUBS, controlFor, type ActiveKey, type ControlKey } from '../../shared/content';
import { RING_KEYS, cmdsToD, ringsD, type Font, type Glyph } from '../../shared/engine';
import type { NumericParam, Params } from '../../shared/params';
import { dragSpec, handlesFor, pickAxis, solver, towardMore, type Axis, type DragSpec, type Drive, type Handle } from '../lib/drag';
import { n1, unicodeLabel, useSize } from '../lib/hooks';
import { actions, useEditor, useFont } from '../state/editor';

const kindOf = (ch: string) =>
  /[A-Z]/.test(ch) ? 'Uppercase' : /[a-z]/.test(ch) ? 'Lowercase' : /[0-9]/.test(ch) ? 'Figure' : 'Punctuation';

/** Anatomy terms that apply to this glyph, in a sensible reading order. */
function features(g: Glyph, ch: string): string[] {
  const out: string[] = [];
  const add = (id: string | null) => { if (id && !out.includes(id) && ANATOMY[id]) out.push(id); };
  g.marks.forEach(k => add(k.type === 'terminal' ? null : k.type));
  g.strokes.forEach(s => add(s.part));
  if (g.counters.length) add('counter');
  if (g.marks.some(k => k.type === 'terminal')) add('terminal');
  if (g.serifs.length) add('serif');
  if (/[a-z]/.test(ch)) add('xHeight'); else if (/[A-Z0-9]/.test(ch)) add('capHeight');
  if (/[bdfhklt]/.test(ch)) add('ascender');
  if (/[gjpqy]/.test(ch)) add('descender');
  add('baseline');
  return out;
}

/** The four or five properties that matter most for this letter (serif takes a slot when on). */
function glyphParams(g: Glyph, ch: string, serif: boolean): ControlKey[] {
  let p: ControlKey[];
  if (g.meta.params) p = g.meta.params.slice() as ControlKey[];
  else {
    p = [];
    if (g.marks.some(k => k.type === 'apex' || k.type === 'vertex')) p.push('apex');
    if (g.strokes.some(s => s.part === 'crossbar')) p.push('crossbar');
    if (g.marks.some(k => k.type === 'overlap')) p.push('overlap');
    if (g.counters.length) p.push('counter');
    if (g.marks.some(k => k.type === 'terminal')) p.push('terminal');
    if (g.strokes.some(s => s.curved)) p.push('curve');
    p.push(/[a-z]/.test(ch) ? 'xHeight' : 'height', 'weight', 'width');
  }
  if (serif) p.unshift('serif');
  return p.slice(0, 5);
}

/** The sliders for this letter: one per control, labelled with the parts it shapes, followed by
    the letter's other key properties. */
export function letterControls(g: Glyph, ch: string, serif: boolean): { key: ControlKey; parts: string[] }[] {
  const rows: { key: ControlKey; parts: string[] }[] = [];
  const row = (key: ControlKey) => rows.find(r => r.key === key) ?? (rows.push({ key, parts: [] }), rows[rows.length - 1]);
  features(g, ch).forEach(f => { const k = PART_CONTROL[f]; if (k) row(k).parts.push(f); });
  glyphParams(g, ch, serif).forEach(row);
  return rows;
}

/** Point at a part: highlight it and make its slider the active one. */
function pointPart(id: string | null) {
  actions.setPart(id);
  const k = id && PART_CONTROL[id];
  if (k) actions.setActive(k);
}

/** Click a part: scroll the panel so its slider sits at the top of the visible list, just under
    the sticky explainer. */
function pickPart(id: string) {
  const k = PART_CONTROL[id];
  const el = k && document.querySelector<HTMLElement>(`[data-ctl="${k}"]`);
  const panel = el && el.closest<HTMLElement>('.panel');
  if (!el || !panel) return;
  const cover = panel.querySelector<HTMLElement>('.explainer')?.offsetHeight ?? 0;
  const top = panel.scrollTop + el.getBoundingClientRect().top - panel.getBoundingClientRect().top - cover - 8;
  panel.scrollTo({ top, behavior: 'smooth' });
}

/** Parts drawn as guide lines rather than shapes. */
const GUIDE_PARTS = new Set(['baseline', 'xHeight', 'capHeight', 'ascender', 'descender']);
/** Hit-test stacking: counters under strokes, point marks on top. */
const hitOrder = (id: string) => id === 'counter' ? 0 : id === 'apex' || id === 'vertex' || id === 'terminal' ? 2 : 1;

/** Path data for one anatomy part of a glyph. */
function partD(g: Glyph, id: string, font: Font): { d: string; ring?: boolean } {
  if (id === 'counter') return { d: g.counters.map(cmdsToD).join('') };
  if (id === 'serif') return { d: g.serifs.map(cmdsToD).join('') };
  if (id === 'terminal' || id === 'apex' || id === 'vertex') {
    return { ring: true, d: ringsD(g.marks.filter(k => k.type === id), Math.max(34, font.m.s * 0.75)) };
  }
  return { d: g.strokes.filter(s => s.part === id).map(s => cmdsToD(s.cmds)).join('') };
}

export function Inspector() {
  const ch = useEditor(s => s.inspect);
  const font = useFont();
  const g = ch ? font.glyph(ch) : null;
  if (!ch || !g) return null;

  return (
    <section className="inspector" aria-label={`Glyph inspector: ${ch}`}>
      <div className="insp-head">
        <button className="btn ghost round" onClick={() => actions.stepInspector(-1)} aria-label="Previous glyph">←</button>
        <div className="insp-title"><h2>{ch}</h2><span>{kindOf(ch)} · {unicodeLabel(ch)}</span></div>
        <button className="btn ghost round" onClick={() => actions.stepInspector(1)} aria-label="Next glyph">→</button>
        <span className="grow" />
        <SkeletonToggle />
        <button className="btn ghost" onClick={actions.closeInspector}>Close ✕</button>
      </div>
      <div className="insp-body">
        <InspectorCanvas ch={ch} g={g} font={font} />
      </div>
    </section>
  );
}

function SkeletonToggle() {
  const on = useEditor(s => s.skeleton);
  return (
    <label className="check">
      <input type="checkbox" checked={on} onChange={e => actions.setSkeleton(e.target.checked)} /> Show skeleton
    </label>
  );
}

/** Parts that can be clicked but not dragged. */
const FIXED_PARTS = new Set(['baseline', 'terminal']);

const defOf = (k: NumericParam): { label: string; lo?: string; hi?: string } | undefined =>
  k in CONTROLS ? CONTROLS[k as ControlKey] : SUBS[k as keyof typeof SUBS];
const labelOf = (k: NumericParam) => defOf(k)?.label ?? k;
const AXES = ['x', 'y'] as const;

/* The drag tip shows once per browser: grab handles on the letter's stems when it first opens,
   until the first drag. */
const TIP_KEY = 'typelab.dragTip.seen';
const tipSeen = () => { try { return localStorage.getItem(TIP_KEY) === '1'; } catch { return true; } };
const markTipSeen = () => { try { localStorage.setItem(TIP_KEY, '1'); } catch { /* the tip returns next visit */ } };

interface View { sc: number; ox: number; oy: number }
interface Drag { part: string; axis?: Axis; key?: NumericParam; end: () => void }
interface Readout { x: number; y: number; param: NumericParam }
/** The pointer over a draggable part, in canvas px */
interface Hover { id: string; x: number; y: number }
interface TipRow { axis: Axis; label: string; ends: [string, string] }

function InspectorCanvas({ ch, g, font }: { ch: string; g: Glyph; font: Font }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const part = useEditor(s => s.part), active = useEditor(s => s.active), skeleton = useEditor(s => s.skeleton);
  const drag = useRef<Drag | null>(null);
  // while a drag runs the view holds still, so the part grows under the pointer instead of the letter re-centring
  const [held, setHeld] = useState<View | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [edge, setEdge] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [intro, setIntro] = useState(() => !tipSeen());
  // the control the pointer is on in the side panel: its handles show on the letter
  const hotKey = useEditor(s => (s.hot ? s.active : null));
  const more = useRef<{ p: Params | null; m: Map<string, 1 | -1> }>({ p: null, m: new Map() });
  useEffect(() => () => drag.current?.end(), []);

  const W = Math.max(320, size.width), H = Math.max(300, size.height), m = font.m;
  const top = Math.max(m.asc, m.cap) + 90, bot = m.desc - 60, padL = 96;
  const fitSc = Math.min((H - 24) / (top - bot), (W - padL - 60) / Math.max(g.adv, 500));
  const { sc, ox, oy } = held ?? { sc: fitSc, ox: padL + (W - padL - 30 - g.adv * fitSc) / 2, oy: 12 + top * fitSc };
  const Y = (y: number) => n1(oy - y * sc), X = (x: number) => n1(ox + x * sc);
  const lower = /[a-z]/.test(ch);
  const parts = features(g, ch).filter(f => !GUIDE_PARTS.has(f));
  parts.sort((a, b) => hitOrder(a) - hitOrder(b));
  const guides = ([['baseline', 0, 'Baseline'], ['xHeight', m.xh, 'x-height'], ['capHeight', m.cap, 'Cap height'], ['ascender', m.asc, 'Ascender'], ['descender', m.desc, 'Descender']] as [string, number, string][])
    .filter(([id]) => !(Math.abs(m.asc - m.cap) < 45 && id === 'ascender' && !lower));
  const dragging = held !== null;

  /* Guidance. Pointing at a part shows grab handles where it moves and a tip naming what each
     direction does; pointing at a slider (or opening the inspector the first time) shows handles
     wherever the letter can be dragged to make the same change. */
  const towardMoreOf = (id: string, axis: Axis, d: Drive) => {
    const c = more.current;
    if (c.p !== font.params) { c.p = font.params; c.m.clear(); }
    const k = `${id}:${axis}:${d.sign}`;
    let v = c.m.get(k);
    if (v === undefined) { v = towardMore(d, font.params); c.m.set(k, v); }
    return v;
  };
  const hoverSpec = hover && !dragging && !FIXED_PARTS.has(hover.id) ? dragSpec(hover.id, font, ch, { x: (hover.x - ox) / sc, y: (oy - hover.y) / sc }) : null;
  const hoverAxes = AXES.filter(a => hoverSpec?.[a]);
  const tip: TipRow[] = hoverAxes.map(a => {
    const d = hoverSpec![a]!, def = defOf(d.key), up = towardMoreOf(hover!.id, a, d) > 0;
    const hi = def?.hi ?? 'More', lo = def?.lo ?? 'Less', plus = up ? hi : lo, minus = up ? lo : hi;
    return { axis: a, label: labelOf(d.key), ends: a === 'x' ? [`← ${minus}`, `${plus} →`] : [`↑ ${plus}`, `↓ ${minus}`] };
  });
  const guideKey = hotKey === 'serif' ? 'serifSize' : hotKey;
  const showKey = hover || dragging ? null : guideKey && typeof font.params[guideKey as keyof Params] === 'number' ? guideKey as NumericParam : intro ? 'weight' : null;
  const handles: Handle[] = showKey ? handlesFor(showKey, font, ch, [...parts, ...guides.map(([id]) => id), 'advance']) : [];

  let hl: { d: string; ring?: boolean };
  if (part) hl = partD(g, part, font);
  else { const k = controlFor(active); hl = { d: font.hl(ch, k), ring: !!RING_KEYS[k] }; }

  // hovering never changes the highlight mid-drag, since the parts reshape under the pointer
  const point = (id: string | null) => { if (!drag.current) pointPart(id); };
  const track = (id: string) => (e: ReactPointerEvent) => {
    if (drag.current || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    setHover({ id, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const leave = () => { point(null); setHover(null); };

  /* Press a part: a click (no movement) scrolls to its slider; a drag reshapes it. The drag locks
     to the axis it first moves along and maps the travel to a value with lib/drag's solver. */
  const press = (id: string) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || drag.current || !svgRef.current) return;
    e.preventDefault();
    setHover(null);
    const r = svgRef.current.getBoundingClientRect(), view = { sc, ox, oy }, x0 = e.clientX, y0 = e.clientY;
    const spec: DragSpec = (!FIXED_PARTS.has(id) && dragSpec(id, font, ch, { x: (x0 - r.left - ox) / sc, y: (oy - (y0 - r.top)) / sc })) || {};
    let solve: ((t: number) => number) | null = null;
    const move = (ev: PointerEvent) => {
      const d = drag.current!, dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!d.axis) {
        if (Math.hypot(dx, dy) < 4) return;
        const axis = pickAxis(spec, dx, dy);
        if (!axis) return;
        const drive = spec[axis]!;
        d.axis = axis; d.key = drive.key;
        solve = solver(drive, useEditor.getState().params);
        actions.setActive(drive.key as ActiveKey);
        setHeld(view);
        if (intro) { setIntro(false); markTipSeen(); }
      }
      actions.setParam(d.key!, solve!(d.axis === 'x' ? dx / view.sc : -dy / view.sc));
      setReadout({ x: ev.clientX - r.left, y: ev.clientY - r.top, param: d.key! });
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', end);
      const d = drag.current;
      drag.current = null;
      if (d?.axis) { actions.commit(); setHeld(null); setReadout(null); }
      return d;
    };
    const up = () => { const d = end(); if (d && !d.axis) pickPart(id); };
    drag.current = { part: id, end };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', end);
  };
  const cursor = (id: string) => (FIXED_PARTS.has(id) ? ' fixed' : '');

  return (
    <div className={dragging ? 'insp-canvas dragging' : 'insp-canvas'} ref={ref}>
      {size.width > 0 && (
        <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <rect className="i-adv" x={X(0)} y={Y(top - 40)} width={n1(g.adv * sc)} height={n1((top - 40 - bot - 20) * sc)} />
          {guides.map(([id, y, label]) => {
            const hot = part === id || (!part && ((id === 'xHeight' && active === 'xHeight') || (id === 'capHeight' && active === 'height')));
            return (
              <g key={id}>
                <line className={hot ? 'i-guide hot' : 'i-guide'} x1={12} x2={W - 12} y1={Y(y)} y2={Y(y)} />
                <text className={hot ? 'i-label hot' : 'i-label'} x={14} y={Y(y) - 5}>{label}</text>
                <line className={'i-hit line' + cursor(id)} x1={12} x2={W - 12} y1={Y(y)} y2={Y(y)}
                  onPointerEnter={() => point(id)} onPointerMove={track(id)} onPointerLeave={leave} onPointerDown={press(id)} />
              </g>
            );
          })}
          <g transform={`translate(${n1(ox)},${n1(oy)}) scale(${sc.toFixed(5)})`} style={{ '--sw': n1(2 / sc) } as CSSProperties}>
            <path className={skeleton ? 'i-ink dim' : 'i-ink'} d={g.d} />
            <path className={hl.ring ? 'i-ring' : 'i-hl'} d={hl.d} />
            <g aria-hidden="true">
              {parts.map(f => (
                <path key={f} className={'i-hit' + cursor(f)} d={partD(g, f, font).d}
                  onPointerEnter={() => point(f)} onPointerMove={track(f)} onPointerLeave={leave} onPointerDown={press(f)} />
              ))}
            </g>
            {skeleton && (
              <g className="i-skel">
                {g.skeleton.map((r, i) => <polyline key={i} points={r.map(p => `${n1(p.x)},${n1(-p.y)}`).join(' ')} />)}
                {g.skeleton.flatMap((r, i) => [r[0], r[r.length - 1]].map((p, j) => <circle key={`${i}-${j}`} cx={n1(p.x)} cy={n1(-p.y)} r={n1(4 / sc)} />))}
              </g>
            )}
          </g>
          {/* the right edge of the advance box sets the width */}
          <g className={edge || (dragging && drag.current?.part === 'advance') ? 'i-edge hot' : 'i-edge'}>
            <line x1={X(g.adv)} x2={X(g.adv)} y1={Y(top - 40)} y2={Y(bot + 20)} />
            <line className="i-hit edge" x1={X(g.adv)} x2={X(g.adv)} y1={Y(top - 40)} y2={Y(bot + 20)}
              onPointerEnter={() => { if (!drag.current) { setEdge(true); actions.setActive('width'); } }} onPointerLeave={() => { setEdge(false); setHover(null); }}
              onPointerMove={track('advance')} onPointerDown={press('advance')} />
          </g>
          {hoverAxes.map(a => <Knob key={a} axis={a} x={X(hoverSpec![a]!.at.x)} y={Y(hoverSpec![a]!.at.y)} />)}
          {handles.map((h, i) => <Knob key={i} axis={h.axis} x={X(h.x)} y={Y(h.y)} pulse onPointerDown={press(h.part)} />)}
        </svg>
      )}
      {readout && <DragReadout {...readout} />}
      {hover && tip.length > 0 && <DragTip key={hover.id} x={hover.x} y={hover.y} W={W} H={H} rows={tip} />}
      {size.width > 0 && !dragging && (
        handles.length > 0
          ? <p className="i-hint on">{hotKey ? `Or drag the handles on the letter to change ${labelOf(showKey!).toLowerCase()}` : 'Drag the handles, or any part of the letter, to reshape it'}</p>
          : <p className="i-hint">Drag a part to reshape it · click to find its slider</p>
      )}
    </div>
  );
}

/** A grab handle: a round knob with a two-way arrow along the axis it drags. Pulsing ones invite a
    first drag and can be grabbed; the one following the pointer lets clicks through. */
function Knob({ axis, x, y, pulse, onPointerDown }: { axis: Axis; x: number; y: number; pulse?: boolean; onPointerDown?: (e: ReactPointerEvent) => void }) {
  return (
    <g className={pulse ? 'i-knob pulse' : 'i-knob'} transform={`translate(${x},${y})${axis === 'y' ? ' rotate(90)' : ''}`} onPointerDown={onPointerDown}>
      {pulse && <circle className="halo" r={11} />}
      <circle r={11} />
      <path d="M-6 0H6M-3 -3.5L-6.5 0L-3 3.5M3 -3.5L6.5 0L3 3.5" />
    </g>
  );
}

/** Beside the pointer on a part: what dragging it changes, and which way does what. */
function DragTip({ x, y, W, H, rows }: { x: number; y: number; W: number; H: number; rows: TipRow[] }) {
  const style: CSSProperties = x > W - 240 ? { right: W - x + 18 } : { left: x + 18 };
  if (y > H - 60 - rows.length * 44) style.bottom = H - y + 16; else style.top = y + 20;
  return (
    <div className="i-tip" style={style}>
      {rows.map(r => (
        <div key={r.axis} className="i-tip-row">
          <span className="i-tip-head">Drag to change <b>{r.label.toLowerCase()}</b></span>
          <span className="i-tip-ends"><span>{r.ends[0]}</span><span>{r.ends[1]}</span></span>
        </div>
      ))}
    </div>
  );
}

/** The value being dragged, beside the pointer. */
function DragReadout({ x, y, param }: Readout) {
  const v = useEditor(s => s.params[param]);
  return <div className="i-readout" style={{ left: x + 14, top: y + 16 }}>{labelOf(param)} <b>{Math.round(v * 100)}</b></div>;
}
