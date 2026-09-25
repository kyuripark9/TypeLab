/* Glyph inspector: one letter, large, on the stage. Its parts are live: pointing at one
   highlights it and the slider that shapes it, and the side panel groups its sliders by part
   (letterControls). */
import type { CSSProperties } from 'react';
import { ANATOMY, PART_CONTROL, controlFor, type ControlKey } from '../../shared/content';
import { RING_KEYS, cmdsToD, ringsD, type Font, type Glyph } from '../../shared/engine';
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

/** Click a part: bring its slider into view. */
function pickPart(id: string) {
  const k = PART_CONTROL[id];
  if (k) document.querySelector(`[data-ctl="${k}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

function InspectorCanvas({ ch, g, font }: { ch: string; g: Glyph; font: Font }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const part = useEditor(s => s.part), active = useEditor(s => s.active), skeleton = useEditor(s => s.skeleton);
  const W = Math.max(320, size.width), H = Math.max(300, size.height), m = font.m;
  const top = Math.max(m.asc, m.cap) + 90, bot = m.desc - 60, padL = 96;
  const sc = Math.min((H - 24) / (top - bot), (W - padL - 60) / Math.max(g.adv, 500));
  const ox = padL + (W - padL - 30 - g.adv * sc) / 2, oy = 12 + top * sc;
  const Y = (y: number) => n1(oy - y * sc), X = (x: number) => n1(ox + x * sc);
  const lower = /[a-z]/.test(ch);
  const parts = features(g, ch).filter(f => !GUIDE_PARTS.has(f));
  parts.sort((a, b) => hitOrder(a) - hitOrder(b));
  const guides: [string, number, string][] = [['baseline', 0, 'Baseline'], ['xHeight', m.xh, 'x-height'], ['capHeight', m.cap, 'Cap height'], ['ascender', m.asc, 'Ascender'], ['descender', m.desc, 'Descender']];

  let hl: { d: string; ring?: boolean };
  if (part) hl = partD(g, part, font);
  else { const k = controlFor(active); hl = { d: font.hl(ch, k), ring: !!RING_KEYS[k] }; }

  return (
    <div className="insp-canvas" ref={ref}>
      {size.width > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <rect className="i-adv" x={X(0)} y={Y(top - 40)} width={n1(g.adv * sc)} height={n1((top - 40 - bot - 20) * sc)} />
          {guides.map(([id, y, label]) => {
            if (Math.abs(m.asc - m.cap) < 45 && id === 'ascender' && !lower) return null;
            const hot = part === id || (!part && ((id === 'xHeight' && active === 'xHeight') || (id === 'capHeight' && active === 'height')));
            return (
              <g key={id}>
                <line className={hot ? 'i-guide hot' : 'i-guide'} x1={12} x2={W - 12} y1={Y(y)} y2={Y(y)} />
                <text className={hot ? 'i-label hot' : 'i-label'} x={14} y={Y(y) - 5}>{label}</text>
                <line className="i-hit line" x1={12} x2={W - 12} y1={Y(y)} y2={Y(y)}
                  onPointerEnter={() => pointPart(id)} onPointerLeave={() => pointPart(null)} onClick={() => pickPart(id)} />
              </g>
            );
          })}
          <g transform={`translate(${n1(ox)},${n1(oy)}) scale(${sc.toFixed(5)})`} style={{ '--sw': n1(2 / sc) } as CSSProperties}>
            <path className={skeleton ? 'i-ink dim' : 'i-ink'} d={g.d} />
            <path className={hl.ring ? 'i-ring' : 'i-hl'} d={hl.d} />
            <g aria-hidden="true">
              {parts.map(f => (
                <path key={f} className="i-hit" d={partD(g, f, font).d}
                  onPointerEnter={() => pointPart(f)} onPointerLeave={() => pointPart(null)} onClick={() => pickPart(f)} />
              ))}
            </g>
            {skeleton && (
              <g className="i-skel">
                {g.skeleton.map((r, i) => <polyline key={i} points={r.map(p => `${n1(p.x)},${n1(-p.y)}`).join(' ')} />)}
                {g.skeleton.flatMap((r, i) => [r[0], r[r.length - 1]].map((p, j) => <circle key={`${i}-${j}`} cx={n1(p.x)} cy={n1(-p.y)} r={n1(4 / sc)} />))}
              </g>
            )}
          </g>
        </svg>
      )}
    </div>
  );
}
