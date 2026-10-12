/* The styles of a design's family to export, picked in the Export window, one or several: every weight from Thin
   to Black, upright and italic, each drawn in a sample as the font it will be, so the steps between them can be
   judged before downloading. The design itself is one of them, at the weight its Weight setting reads as (the
   nearest of the family's), whose name stands out in the list. Picked styles look as a picked option does in the
   panel, ringed and drawn in the accent; the design's own, picked to start with, is filled. */
import { useMemo } from 'react';
import { FAMILY_STYLES, familyMember, ownStyle, SLANTED, WEIGHTS, type FamilyMember, type WeightId } from '../../shared/family';
import type { Params } from '../../shared/params';
import { useFreeFonts } from '../lib/free';
import { n1 } from '../lib/hooks';
import { fontFor } from '../state/editor';

const SAMPLE = 'Hamburgefonstiv';


interface PickerProps {
  params: Params;
  /** the weight the design reads as (weightIdOf) */ anchor: WeightId;
  /** the styles picked, by the names they install under */ picked: string[]; onPick: (picked: string[]) => void;
}

export function FamilyPicker({ params, anchor, picked, onPick }: PickerProps) {
  const ownOf = ownStyle(params, anchor), own = ownOf.style;
  const drawn = Object.keys(params.outlines), slanted = params.slant >= SLANTED;
  // every weight upright and italic, built once per design and naming, for the samples
  const rows = useMemo(() => WEIGHTS.map(w => ({
    ...w, upright: familyMember(params, anchor, w.id, false), italic: familyMember(params, anchor, w.id, true)
  })), [params, anchor]);
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
              onClick={() => onPick(all ? [own] : FAMILY_STYLES.map(f => f.style))}>All {FAMILY_STYLES.length}</button>
          </div>
          <span aria-hidden="true">Upright</span><span aria-hidden="true">Italic</span>
        </div>
        {rows.map(r => (
          <div key={r.id} className="family-row">
            <div className={r.id === ownOf.weight ? 'family-weight own' : 'family-weight'} title={r.id === ownOf.weight ? 'The weight this design is' : undefined}>
              <b>{r.name}</b>
              <span>{r.cls}</span>
            </div>
            {[r.upright, r.italic].map(m => (
              <button key={m.style} type="button" className={m.style === own ? 'family-cell own' : 'family-cell'} aria-pressed={picked.includes(m.style)}
                title={m.style === own ? `${m.style}: this design` : m.style} onClick={() => toggle(m.style)}>
                <MemberSample member={m} label={m.style} />
              </button>
            ))}
          </div>
        ))}
      </div>

      {(drawn.length > 0 || slanted) && (
        <p className="family-note">
          {slanted && <>The design is slanted, so its italics keep that slant and the uprights stand it up. </>}
          {drawn.length > 0 && <>{drawn.slice(0, 6).join(' ')}{drawn.length > 6 && ' …'} {drawn.length === 1 ? 'is' : 'are'} drawn by hand in Points mode, so {drawn.length === 1 ? 'it looks' : 'they look'} the same in every weight.</>}
        </p>
      )}
    </div>
  );
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
      {ln.items.map((it, i) => { const g = f.glyph(it.ch); return g && <path key={i} d={g.d} transform={`translate(${n1(it.x)},0)`} />; })}
    </svg>
  );
}
