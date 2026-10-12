/* After a letter's points are changed in Points, the offer to make the same change in the other letters shaped the
   same way there (lib/carry). The letters are set out by kind, the edited letter's own first, then as the glyph strip
   has them (capitals, small letters, figures, punctuation, symbols), each kind on a row with a box that picks all of
   it, and All by the buttons for every one. Each letter is a toggle drawn with the change in it; hovering one shows it large, as it
   was (dashed) and as it would be. Close matches (the outline round the change the same too) of the edited letter's
   kind come picked, the rest unpicked. Apply puts the change in the picked letters in one undo step; Not now lets it
   be. Applied, the card folds to a bar naming the letters changed, and Review opens it again: there each click puts
   a letter back as it was or gives it the change at once (an undo step each). What is offered is everything done to
   the letter since it was opened in Points, or since the last offer was taken up or turned down. The search runs after each finished edit, in slices between frames, so it never holds up
   a drag. */
import { memo, useEffect, useRef, useState } from 'react';
import { ALL_CHARS, CHARSET, cmdsToD, drawnCmds, type Drawn, type Font, type Glyph, type Node } from '../../shared/engine';
import { carryLetter, changesOf, kindOf, sameDrawing, type Carried } from '../lib/carry';
import { traceOf } from '../lib/pen';
import { actions, useEditor } from '../state/editor';

/** How long the search runs before letting a frame through, in ms. */
const SLICE = 10;
/** The kinds of letter, named and ordered as the glyph strip has them. */
const KINDS: [string, string][] = [['Uppercase', CHARSET.upper], ['Lowercase', CHARSET.lower], ['Figures', CHARSET.digits], ['Punctuation', CHARSET.punct], ['Symbols', CHARSET.symbols]];

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
  // what is offered; once applied, each offered letter's outline as it was before (none for one the settings drew)
  const [offer, setOffer] = useState<{ now: Drawn; found: Carried[]; prev?: Record<string, Drawn | undefined> } | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [peek, setPeek] = useState<Carried | null>(null);
  // applied: the card open to review, or folded to a bar
  const [open, setOpen] = useState(false);
  const outlines = useEditor(s => s.params.outlines);

  useEffect(() => {
    const s = useEditor.getState(), now = s.params.outlines[ch], outs = s.params.outlines, f = fontNow.current;
    const changes = now && base.current ? changesOf(base.current, now.contours) : [];
    // nothing more done to the letter: an offer taken up stays, to be reviewed
    if (!now || !changes.length) { setOffer(o => (o?.prev && sameDrawing(o.now, now) ? o : null)); return; }
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
      setPeek(null);
      setOpen(false);
      // looser matches alone aren't worth asking about
      setOffer(found.some(c => c.close) ? { now, found } : null);
    };
    timer = window.setTimeout(step, 120);
    return () => clearTimeout(timer);
  }, [hi, ch]);

  // mid-drag, or once the letter has changed again, the offer waits for the search to catch up
  if (!offer || !sameDrawing(offer.now, stored)) return null;
  const answered = () => { base.current = offer.now.contours; setOffer(null); };
  const take = offer.found.filter(c => picked.has(c.ch));
  const apply = () => {
    if (!take.length) return;
    const s = useEditor.getState(), prev = Object.fromEntries(offer.found.map(c => [c.ch, s.params.outlines[c.ch]]));
    actions.setParam('outlines', { ...s.params.outlines, ...Object.fromEntries(take.map(c => [c.ch, c.doc])) });
    actions.commit();
    base.current = offer.now.contours;
    setOffer({ ...offer, prev });
    setOpen(false);
  };
  const toggle = (o: string) => setPicked(p => { const n = new Set(p); if (!n.delete(o)) n.add(o); return n; });
  const pickMany = (chs: string[], on: boolean) => setPicked(p => { const n = new Set(p); for (const c of chs) if (on) n.add(c); else n.delete(c); return n; });
  // once applied: the letters that have the change now, and each click gives it or puts the letter back, at once
  const prev = offer.prev, has = prev ? offer.found.filter(c => sameDrawing(outlines[c.ch], c.doc)) : [];
  const putMany = (chs: string[], on: boolean) => {
    if (!prev) return;
    const outs = { ...useEditor.getState().params.outlines };
    for (const o of chs) {
      const c = offer.found.find(f => f.ch === o), was = prev[o];
      if (!c) continue;
      if (on) outs[o] = c.doc; else if (was) outs[o] = was; else delete outs[o];
    }
    actions.setParam('outlines', outs);
    actions.commit();
  };
  if (prev && !open) {
    // folded: the letters changed, and the way back in (gone once the change is undone everywhere)
    if (!has.length) return null;
    const names = has.map(c => c.ch).join(' ');
    return (
      <div className="pen-carry done" role="status">
        <span className="pen-carry-q">Changed {has.length <= 10 ? <b>{names}</b> : `${has.length} letters`} too</span>
        <button className="btn ghost small" onClick={() => setOpen(true)} title={`Look at ${names} again, and put any back as it was`}>Review</button>
        <button className="pen-icon-btn" aria-label="Close" title="Close" onClick={() => setOffer(null)}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
        </button>
      </div>
    );
  }
  const on = prev ? new Set(has.map(c => c.ch)) : picked, flip = prev ? (o: string) => putMany([o], !on.has(o)) : toggle, setMany = prev ? putMany : pickMany;
  // the letters by kind, the edited letter's own kind first, each kind in the strip's order
  const own = KINDS.findIndex(([, cs]) => cs.includes(ch));
  const kinds = [...KINDS.slice(own, own + 1), ...KINDS.filter((_, k) => k !== own)]
    .map(([name, cs]) => ({ name, letters: offer.found.filter(c => cs.includes(c.ch)).sort((a, b) => cs.indexOf(a.ch) - cs.indexOf(b.ch)) }))
    .filter(k => k.letters.length);

  return (
    <div className="pen-carry" role="group" aria-label={`Apply the change to ${ch} to other letters`} onPointerLeave={() => setPeek(null)}>
      {peek && <CarryPeek c={peek} font={font} />}
      {prev ? (
        <div className="pen-carry-head">
          <span className="pen-carry-q">Changed in {has.length} {has.length === 1 ? 'letter' : 'letters'}</span>
          {kinds.length > 1 && <PickBox label="All" letters={offer.found} picked={on} onSet={setMany} />}
          <button className="btn ghost small" onClick={() => setOpen(false)}>Done</button>
        </div>
      ) : (
        <div className="pen-carry-head">
          <span className="pen-carry-q">Apply this change to other letters too?</span>
          {kinds.length > 1 && <PickBox label="All" letters={offer.found} picked={picked} onSet={pickMany} />}
          <button className="btn ghost small" onClick={answered}>Not now</button>
          <button className="btn primary small" disabled={!take.length} onClick={apply}
            title={take.length ? `Change ${take.map(c => c.ch).join(' ')} the same way; they become drawn letters, which the sliders no longer change` : 'Pick the letters to change'}>
            {take.length ? `Apply to ${take.length}` : 'Apply'}
          </button>
        </div>
      )}
      <div className="pen-carry-kinds">
        {kinds.map(k => (
          <div key={k.name} className="pen-carry-kind">
            <PickBox label={k.name} letters={k.letters} picked={on} onSet={setMany} />
            <div className="pen-carry-letters">
              {k.letters.map(c => <CarryChip key={c.ch} c={c} font={font} on={on.has(c.ch)} applied={!!prev} onToggle={flip} onPeek={setPeek} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A box that picks every one of `letters` or none, half checked while only some are picked. */
function PickBox({ label, letters, picked, onSet }: { label: string; letters: Carried[]; picked: ReadonlySet<string>; onSet: (chs: string[], on: boolean) => void }) {
  const n = letters.filter(c => picked.has(c.ch)).length, every = n === letters.length;
  return (
    <label className="check pen-carry-pick" title={every ? `Pick none of these ${letters.length}` : `Pick all ${letters.length}`}>
      <input type="checkbox" checked={every} ref={el => { if (el) el.indeterminate = n > 0 && !every; }} onChange={e => onSet(letters.map(c => c.ch), e.target.checked)} />
      {label}
    </label>
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

/** One letter the change can go to, drawn with it (fitted to its cell, wide letters a little smaller), picked or not. */
const CarryChip = memo(function CarryChip({ c, font, on, applied, onToggle, onPeek }: {
  c: Carried; font: Font; on: boolean; applied: boolean; onToggle: (ch: string) => void; onPeek: (c: Carried) => void
}) {
  const b = boxOf([c.doc], font);
  const where = c.places > 1 ? ` (in ${c.places} places)` : '';
  return (
    <button className={on ? 'pen-carry-chip on' : 'pen-carry-chip'} aria-pressed={on} aria-label={c.ch} onClick={() => onToggle(c.ch)}
      onPointerEnter={() => onPeek(c)} onFocus={() => onPeek(c)}
      title={`${c.ch}${where}${c.close ? '' : ': the same shape, in other surroundings'} · click to ${applied ? (on ? 'put it back as it was' : 'give it the change') : on ? 'leave it as it is' : 'change it too'}`}>
      <svg width={24} height={28} viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} aria-hidden="true">
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
