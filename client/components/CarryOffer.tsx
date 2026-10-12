/* After a letter's points are changed in Points, the offer to make the same change in the other letters shaped the
   same way there (lib/carry). Each such letter shows as a toggle drawn with the change in it; hovering one shows it
   large, as it was (dashed) and as it would be. Close matches (the outline round the change the same too) of the
   edited letter's kind come picked, other close ones and looser ones follow unpicked, and past a dozen the rest wait
   behind "+N". Apply puts the change in the picked letters in one undo step; Not now lets it be. What is offered is
   everything done to the letter since it was opened in Points, or since the last offer was taken up or turned down.
   The search runs after each finished edit, in slices between frames, so it never holds up a drag. */
import { memo, useEffect, useRef, useState } from 'react';
import { ALL_CHARS, cmdsToD, drawnCmds, type Drawn, type Font, type Glyph, type Node } from '../../shared/engine';
import { carryLetter, changesOf, kindOf, type Carried } from '../lib/carry';
import { traceOf } from '../lib/pen';
import { actions, useEditor } from '../state/editor';

/** How long the search runs before letting a frame through, in ms. */
const SLICE = 10;
/** How many letters show before the rest wait behind "+N". */
const MOST = 12;

export function CarryOffer({ ch, g, font }: { ch: string; g: Glyph; font: Font }) {
  // a new undo step: an edit finished, or one undone or redone
  const hi = useEditor(s => s.hi);
  const stored = useEditor(s => s.params.outlines[ch]);
  // the letter as it was before it was edited here (as the font draws it, until the first edit; a letter drawn
  // already, as it was when opened), or when the last offer was answered
  const base = useRef<Node[][] | null>(null);
  if (!stored) base.current = traceOf(g).contours;
  else base.current ??= stored.contours;
  const fontNow = useRef(font);
  fontNow.current = font;
  const [offer, setOffer] = useState<{ now: Drawn; found: Carried[] } | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [all, setAll] = useState(false);
  const [peek, setPeek] = useState<Carried | null>(null);

  useEffect(() => {
    const s = useEditor.getState(), now = s.params.outlines[ch], outs = s.params.outlines, f = fontNow.current;
    const changes = now && base.current ? changesOf(base.current, now.contours) : [];
    if (!now || !changes.length) { setOffer(null); return; }
    const found: Carried[] = [];
    let k = 0, timer = 0;
    const step = () => {
      const t0 = performance.now();
      while (k < ALL_CHARS.length && performance.now() - t0 < SLICE) {
        const o = ALL_CHARS[k++], og = o === ch || outs[o] ? null : f.glyph(o);
        const doc = o === ch ? null : outs[o] ?? (og ? traceOf(og) : null), got = doc?.contours.length ? carryLetter(changes, o, doc) : null;
        if (got) found.push(got);
      }
      if (k < ALL_CHARS.length) { timer = window.setTimeout(step, 0); return; }
      // close matches of the letter's own kind first, then other close ones, then the looser ones of its kind, then the rest
      const rank = (c: Carried) => (c.close ? 0 : 2) + (kindOf(c.ch) === kindOf(ch) ? 0 : 1);
      found.sort((a, b) => rank(a) - rank(b));
      const mine = found.filter(c => rank(c) === 0);
      setPicked(new Set((mine.length ? mine : found.filter(c => c.close)).map(c => c.ch)));
      setAll(false);
      setPeek(null);
      // looser matches alone aren't worth asking about
      setOffer(found.some(c => c.close) ? { now, found } : null);
    };
    timer = window.setTimeout(step, 120);
    return () => clearTimeout(timer);
  }, [hi, ch]);

  // mid-drag, or once the letter has changed again, the offer waits for the search to catch up
  if (!offer || offer.now !== stored) return null;
  const answered = () => { base.current = offer.now.contours; setOffer(null); };
  const take = offer.found.filter(c => picked.has(c.ch));
  const apply = () => {
    if (!take.length) return;
    const s = useEditor.getState();
    actions.setParam('outlines', { ...s.params.outlines, ...Object.fromEntries(take.map(c => [c.ch, c.doc])) });
    actions.commit();
    answered();
    actions.toast(`Changed ${take.map(c => c.ch).join(' ')} too`, { label: 'Undo', run: () => actions.travel(-1) });
  };
  const toggle = (o: string) => setPicked(p => { const n = new Set(p); if (!n.delete(o)) n.add(o); return n; });
  const shown = all ? offer.found : offer.found.slice(0, MOST), hidden = offer.found.length - shown.length;

  return (
    <div className="pen-carry" role="group" aria-label={`Apply the change to ${ch} to other letters`} onPointerLeave={() => setPeek(null)}>
      {peek && <CarryPeek c={peek} font={font} />}
      <div className="pen-carry-head">
        <span className="pen-carry-q">Apply this change to other letters too?</span>
        <button className="btn ghost small" onClick={answered}>Not now</button>
        <button className="btn primary small" disabled={!take.length} onClick={apply}
          title={take.length ? `Change ${take.map(c => c.ch).join(' ')} the same way; they become drawn letters, which the sliders no longer change` : 'Pick the letters to change'}>
          {take.length ? `Apply to ${take.length}` : 'Apply'}
        </button>
      </div>
      <div className="pen-carry-letters">
        {shown.map(c => (
          <CarryChip key={c.ch} c={c} font={font} on={picked.has(c.ch)} onToggle={toggle} onPeek={setPeek} />
        ))}
        {hidden > 0 && <button className="pen-carry-more" title="Show every letter with this shape" onClick={() => setAll(true)}>+{hidden}</button>}
      </div>
    </div>
  );
}

/** The box a letter is drawn in (y down, as cmdsToD draws): its advance, widened to any ink outside it, from above
    the ascender to below the descender. */
function boxOf(docs: Drawn[], font: Font) {
  let x0 = 0, x1 = Math.max(...docs.map(d => d.adv));
  for (const d of docs) for (const con of d.contours) for (const n of con) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); }
  const m = font.m, top = Math.max(m.asc, m.cap) + 40, bot = m.desc - 20, pad = 30;
  return { x: x0 - pad, y: -top, w: x1 - x0 + 2 * pad, h: top - bot };
}

/** One letter the change can go to, drawn with it, picked or not. */
const CarryChip = memo(function CarryChip({ c, font, on, onToggle, onPeek }: { c: Carried; font: Font; on: boolean; onToggle: (ch: string) => void; onPeek: (c: Carried) => void }) {
  const b = boxOf([c.doc], font), h = 30;
  const where = c.places > 1 ? ` (in ${c.places} places)` : '';
  return (
    <button className={on ? 'pen-carry-chip on' : 'pen-carry-chip'} aria-pressed={on} aria-label={c.ch} onClick={() => onToggle(c.ch)}
      onPointerEnter={() => onPeek(c)} onFocus={() => onPeek(c)}
      title={`${c.ch}${where}${c.close ? '' : ': the same shape, in other surroundings'} · click to ${on ? 'leave it as it is' : 'change it too'}`}>
      <svg width={Math.max(16, Math.round((b.w / b.h) * h))} height={h} viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} aria-hidden="true">
        <path d={cmdsToD(drawnCmds(c.doc.contours))} />
      </svg>
    </button>
  );
});

/** The letter pointed at, large: as it is now (dashed) and as the change would leave it. */
function CarryPeek({ c, font }: { c: Carried; font: Font }) {
  const b = boxOf([c.was, c.doc], font), h = 132;
  return (
    <div className="pen-carry-peek" aria-hidden="true">
      <svg width={Math.round((b.w / b.h) * h)} height={h} viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}>
        <path className="after" d={cmdsToD(drawnCmds(c.doc.contours))} />
        <path className="before" d={cmdsToD(drawnCmds(c.was.contours))} />
      </svg>
    </div>
  );
}
