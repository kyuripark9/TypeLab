/* The styles of a design's family to export, picked in the Export window, one or several: every weight from Thin
   to Black, upright and italic, each drawn in a sample as the font it will be, so the steps between them can be
   judged before downloading. The design itself is one of them, at the weight its stems read as (anchorOf in
   shared/family.ts), whose name stands out in the list. Picked styles look as a picked option does in the
   panel, ringed and drawn in the accent; the design's own, picked to start with, is filled. Only the weights'
   names show: the samples say the rest. */
import { useDeferredValue, useEffect, useMemo } from 'react';
import { buildFont, type Font } from '../../shared/engine';
import { anchorOf, FAMILY_STYLES, familyMember, ownStyle, WEIGHTS, type FamilyMember, type WeightId } from '../../shared/family';
import type { Params } from '../../shared/params';
import { useEditor } from '../state/editor';
import { useFreeFonts } from '../lib/free';
import { n1 } from '../lib/hooks';
import { fontFor } from '../state/editor';

const SAMPLE = 'Hamburgefonstiv';


interface PickerProps {
  params: Params;
  /** the weight the design reads as (anchorOf) */ anchor: WeightId;
  /** the styles picked, by the names they install under */ picked: string[]; onPick: (picked: string[]) => void;
}

export function FamilyPicker({ params, anchor, picked, onPick }: PickerProps) {
  const ownOf = ownStyle(params, anchor), own = ownOf.style;
  // every weight upright and italic, built once per design and naming, for the samples
  const rows = useMemo(() => WEIGHTS.map(w => ({
    ...w, upright: familyMember(params, anchor, w.id, false), italic: familyMember(params, anchor, w.id, true)
  })), [params, anchor]);
  // (a design with letters drawn in Points draws its samples once the window is open, in case they weren't drawn ahead
  // (useFamilySamplesAhead): moving those letters to the other weights takes a moment the first time)
  const shown = useDeferredValue(rows, Object.keys(params.outlines).length ? null : rows);
  const toggle = (style: string) => onPick(picked.includes(style) ? picked.filter(s => s !== style) : [...picked, style]);
  // All picks every style; pressed again, it goes back to the design alone, as the window opened
  const all = FAMILY_STYLES.every(f => picked.includes(f.style));

  return (
    <div className="family">
      <div className="family-grid" role="group" aria-label="Styles">
        <div className="family-row family-head">
          <div>
            <button type="button" className={all ? 'chip on' : 'chip'} aria-pressed={all}
              title={all ? 'Back to this design alone' : 'Every weight from Thin to Black, upright and italic'}
              onClick={() => onPick(all ? [own] : FAMILY_STYLES.map(f => f.style))}>Select all</button>
          </div>
          <span aria-hidden="true">Upright</span><span aria-hidden="true">Italic</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.id} className="family-row">
            <div className={r.id === ownOf.weight ? 'family-weight own' : 'family-weight'} title={r.id === ownOf.weight ? 'The weight this design is' : undefined}>
              <b>{r.name}</b>
            </div>
            {[r.upright, r.italic].map((m, k) => (
              <button key={m.style} type="button" className={m.style === own ? 'family-cell own' : 'family-cell'} aria-pressed={picked.includes(m.style)}
                title={m.style === own ? `${m.style}: this design` : m.style} onClick={() => toggle(m.style)}>
                {shown && <MemberSample member={k ? shown[i].italic : shown[i].upright} label={m.style} />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The samples' letters drawn in Points, moved to every style of the family ahead of the Export window, a letter of a
    style at a time while the editor is idle (a second after the settings last changed), so the window opens with its
    samples drawn: moving them takes a moment the first time (family-drawn.ts in the engine keeps what it moved). */
export function useFamilySamplesAhead() {
  const params = useEditor(s => s.params);
  useEffect(() => {
    const chars = [...new Set(SAMPLE)].filter(ch => params.outlines[ch]);
    if (!chars.length) return;
    const anchor = anchorOf(params), steps = FAMILY_STYLES.flatMap(f => chars.map(ch => ({ f, ch }))), fonts = new Map<string, Font>();
    let next = 0, handle = 0;
    const idle = typeof requestIdleCallback === 'function';
    const work = (deadline?: IdleDeadline) => {
      do {
        const { f, ch } = steps[next++];
        let font = fonts.get(f.style);
        if (!font) { font = buildFont(familyMember(params, anchor, f.weight, f.italic).params); fonts.set(f.style, font); }
        font.glyph(ch);
      } while (next < steps.length && deadline && deadline.timeRemaining() > 4);
      if (next < steps.length) handle = idle ? requestIdleCallback(work) : window.setTimeout(work, 30);
    };
    const start = window.setTimeout(() => { handle = idle ? requestIdleCallback(work) : window.setTimeout(work, 30); }, 1000);
    return () => { clearTimeout(start); if (idle) cancelIdleCallback(handle); else clearTimeout(handle); };
  }, [params]);
}

/** One member's sample, drawn by the font it exports as. */
function MemberSample({ member, label }: { member: FamilyMember; label: string }) {
  useFreeFonts();
  const f = fontFor(member.params), ln = f.layout(SAMPLE, Infinity)[0];
  // room on the right for an italic's lean
  const w = Math.max(4000, ln.width + 300);
  return (
    <svg className="family-sample" viewBox={`-60 -900 ${w} 1150`} preserveAspectRatio="xMinYMid meet" role="img" aria-label={label}>
      <title>{label}</title>
      {ln.items.map((it, i) => { const g = f.glyph(it.ch, it.alt); return g && <path key={i} d={g.d} transform={`translate(${n1(it.x)},0)`} />; })}
    </svg>
  );
}
