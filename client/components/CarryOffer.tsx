/* After a letter's points are changed in Points, the offer to make the same change in the other letters shaped the
   same way there, and at the letter's own other places shaped so (an n's other foot) (lib/carry), kept out of the
   letter's way: a pill in the canvas's bottom right corner asks "Apply to b h k l?" with Apply and ×, and opens,
   when clicked, a card over it with every such letter. There the letters are set out by kind, the edited letter's
   own first, then as the glyph strip has them (capitals, small letters, figures, punctuation, symbols), each kind on
   a row with a box that picks all of it, and above them All, for every one; Not now and Apply wait at the foot,
   under the letters they act on. Each letter is a toggle drawn with the change in it; hovering one shows it large
   beside the card, as it was (dashed) and as it would be. Close matches (the outline round the change the same too)
   of the edited letter's kind come picked, the rest unpicked. Apply puts the change in the picked letters in one
   undo step; Not now lets it be. The last change applied stays in the corner on every letter, for as long as the
   page is open ("d's change: b h k l"), until another is applied: clicked, the card opens to review it, where each
   click puts a letter back as it was or gives it the change at once (an undo step each). What is offered is
   everything done to the letter since it was first opened in Points, or since its last offer was taken up or turned
   down, also when it is opened again later. The search runs after each finished edit, in slices between frames, so
   it never holds up a drag. A click elsewhere, or Escape, folds the card back to its pill. */
import { memo, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { ALL_CHARS, CHARSET, cmdsToD, drawnCmds, drawnLetter, type Drawn, type Font, type Glyph } from '../../shared/engine';
import { drawnAtOf } from '../../shared/params';
import { carryLetter, changesOf, kindOf, sameDrawing, type Carried } from '../lib/carry';
import { traceOf } from '../lib/pen';
import { actions, useEditor } from '../state/editor';

/** How long the search runs before letting a frame through, in ms. */
const SLICE = 10;
/** The kinds of letter, named and ordered as the glyph strip has them. */
const KINDS: [string, string][] = [['Uppercase', CHARSET.upper], ['Lowercase', CHARSET.lower], ['Figures', CHARSET.digits], ['Punctuation', CHARSET.punct], ['Symbols', CHARSET.symbols]];
/** How many letters the pill names before it counts the rest. */
const NAMED = 8;

/** The design open now, told apart from another one, or another style started (a first save keeps it the same). */
interface Of { style: string; design: string | null }
const ofNow = (): Of => { const s = useEditor.getState(); return { style: s.styleId, design: s.designId }; };
const sameDesign = (a: Of, b: Of) => a.style === b.style && (a.design === null || a.design === b.design);

/** The last change applied to other letters: the letter it was made in, the letters offered (each as it was before,
    none for one the settings drew), and the design, kept while the page is open so it can be looked at again from
    any letter. */
interface Applied { from: string; found: Carried[]; prev: Record<string, Drawn | undefined>; of: Of }
const useApplied = create<{ last: Applied | null }>(() => ({ last: null }));

/** Each letter as it was before the edits not yet offered or answered, with the settings it stood at then (so it can
    be drawn at the settings the edit was made at, should they have moved), by letter, for the design open now
    (another design, or another style started, begins afresh). */
const bases = new Map<string, Drawn>();
let basesOf: Of = { style: '', design: null };
function forDesign() {
  const now = ofNow();
  if (!sameDesign(basesOf, now)) bases.clear();
  basesOf = now;
}

/** Letters by name, the first few, then how many more. */
const names = (cs: Carried[]) => cs.slice(0, NAMED).map(c => c.ch).join(' ') + (cs.length > NAMED ? ` +${cs.length - NAMED}` : '');

export function CarryOffer({ ch, g, font }: { ch: string; g: Glyph; font: Font }) {
  // a new undo step: an edit finished, or one undone or redone
  const hi = useEditor(s => s.hi);
  const stored = useEditor(s => s.params.outlines[ch]);
  const outlines = useEditor(s => s.params.outlines);
  const applied = useApplied(s => s.last), last = applied && sameDesign(applied.of, ofNow()) ? applied : null;
  // the letter as it was before it was edited (as the font draws it, until the first edit; a letter drawn already,
  // as it was when first opened here), or when its last offer was answered
  forDesign();
  if (!stored) bases.set(ch, { ...traceOf(g), at: drawnAtOf(useEditor.getState().params, ch) });
  else if (!bases.has(ch)) bases.set(ch, stored);
  const fontNow = useRef(font);
  fontNow.current = font;
  const [offer, setOffer] = useState<{ now: Drawn; found: Carried[] } | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [peek, setPeek] = useState<Carried | null>(null);
  // the card open under the pill
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  // a press anywhere else, or Escape, folds the card (caught on the way down: the canvas keeps its presses to itself)
  useEffect(() => {
    if (!open) return;
    const fold = () => { setOpen(false); setPeek(null); };
    const press = (e: PointerEvent) => { if (!(e.target instanceof window.Node && wrap.current?.contains(e.target))) fold(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') fold(); };
    document.addEventListener('pointerdown', press, true);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', press, true); window.removeEventListener('keydown', key, true); };
  }, [open]);

  useEffect(() => {
    // the letter as the settings draw it now, and as it was before, drawn at the same settings (each letter, drawn or
    // not, read as it stands)
    const f = fontNow.current, base = bases.get(ch), now = useEditor.getState().params.outlines[ch] && f.glyph(ch)?.drawn;
    const was = now && base ? drawnLetter(ch, base, f).drawn : undefined;
    const changes = now && was ? changesOf(was.contours, now.contours) : [];
    if (!now || !changes.length) { setOffer(null); return; }
    const found: Carried[] = [];
    let k = 0, timer = 0;
    const step = () => {
      const t0 = performance.now();
      while (k < ALL_CHARS.length && performance.now() - t0 < SLICE) {
        // (the letter itself as it is now, for its other places shaped the same: an n's other foot)
        const o = ALL_CHARS[k++], og = o === ch ? null : f.glyph(o);
        const doc = o === ch ? now : og ? traceOf(og) : null, got = doc?.contours.length ? carryLetter(changes, o, doc, o === ch) : null;
        if (got) found.push(got);
      }
      if (k < ALL_CHARS.length) { timer = window.setTimeout(step, 0); return; }
      // close matches of the letter's own kind first (the letter itself before them), then other close ones, then the
      // looser ones of its kind, then the rest
      const rank = (c: Carried) => (c.close ? 0 : 2) + (kindOf(c.ch) === kindOf(ch) ? 0 : 1);
      found.sort((a, b) => rank(a) - rank(b) || Number(b.ch === ch) - Number(a.ch === ch));
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

  // mid-drag, or once the letter has changed again, an offer waits for the search to catch up
  if (offer && !sameDrawing(offer.now, stored && traceOf(g))) return null;
  // the letters the last change applied is in now (none once it is undone everywhere)
  const has = last ? last.found.filter(c => sameDrawing(outlines[c.ch], c.doc)) : [];
  const review = !offer && last && (has.length || open) ? last : null;
  if (!offer && !review) return null;
  const found = offer ? offer.found : review!.found;

  const take = offer ? found.filter(c => picked.has(c.ch)) : [];
  const answered = () => { const st = useEditor.getState().params.outlines[ch]; if (offer && st) bases.set(ch, st); setOffer(null); setOpen(false); setPeek(null); };
  const apply = () => {
    if (!offer || !take.length) return;
    const s = useEditor.getState(), prev = Object.fromEntries(found.map(c => [c.ch, s.params.outlines[c.ch]]));
    actions.setParam('outlines', { ...s.params.outlines, ...Object.fromEntries(take.map(c => [c.ch, c.doc])) });
    actions.commit();
    useApplied.setState({ last: { from: ch, found, prev, of: ofNow() } });
    answered();
  };
  const toggle = (o: string) => setPicked(p => { const n = new Set(p); if (!n.delete(o)) n.add(o); return n; });
  const pickMany = (chs: string[], on: boolean) => setPicked(p => { const n = new Set(p); for (const c of chs) if (on) n.add(c); else n.delete(c); return n; });
  // reviewing, each click gives a letter the change or puts it back as it was, at once
  const putMany = (chs: string[], on: boolean) => {
    if (!review) return;
    const outs = { ...useEditor.getState().params.outlines };
    for (const o of chs) {
      const c = found.find(f => f.ch === o), was = review.prev[o];
      if (!c) continue;
      if (on) outs[o] = c.doc; else if (was) outs[o] = was; else delete outs[o];
    }
    actions.setParam('outlines', outs);
    actions.commit();
  };
  const on = review ? new Set(has.map(c => c.ch)) : picked, flip = review ? (o: string) => putMany([o], !on.has(o)) : toggle, setMany = review ? putMany : pickMany;
  // the letters by kind, the edited letter's own kind first, each kind in the strip's order (the edited letter first)
  const from = review ? review.from : ch, own = KINDS.findIndex(([, cs]) => cs.includes(from));
  // the change can go to the letter's own other places too, so not only to other letters
  const elsewhere = found.some(c => c.ch === from);
  const kinds = [...KINDS.slice(own, own + 1), ...KINDS.filter((_, k) => k !== own)]
    .map(([name, cs]) => ({ name, letters: found.filter(c => cs.includes(c.ch)).sort((a, b) => Number(b.ch === from) - Number(a.ch === from) || cs.indexOf(a.ch) - cs.indexOf(b.ch)) }))
    .filter(k => k.letters.length);
  const chevron = <svg className="pen-carry-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" /></svg>;

  return (
    <div className="pen-carry-dock" ref={wrap}>
      {offer ? (
        <div className="pen-carry-pill ask" role="status">
          <button className="pen-carry-sum" aria-expanded={open} onClick={() => setOpen(o => !o)} title="Pick the letters to change">
            <span>{take.length ? <>Apply to <b>{names(take)}</b>?</> : elsewhere ? 'Apply this change elsewhere?' : 'Apply this change to other letters?'}</span>{chevron}
          </button>
          <button className="btn primary small" disabled={!take.length} onClick={apply}
            title={take.length ? `Change ${take.map(c => c.ch).join(' ')} the same way; they become drawn letters, which the sliders no longer change` : 'Pick the letters to change'}>Apply</button>
          <button className="pen-icon-btn" aria-label="Not now" title="Not now" onClick={answered}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
          </button>
        </div>
      ) : (
        <div className="pen-carry-pill" role="status">
          <button className="pen-carry-sum" aria-expanded={open} onClick={() => setOpen(o => !o)} title={`Look at the letters ${review!.from}'s change went to, and put any back as it was`}>
            <span><b>{review!.from}</b>’s change: {has.length ? <b>{names(has)}</b> : 'no letters'}</span>{chevron}
          </button>
        </div>
      )}
      {open && (
        <div className="pen-carry" role="group" aria-label={offer ? `Apply the change to ${ch} to other letters` : `The letters ${from}'s change went to`} onPointerLeave={() => setPeek(null)}>
          {peek && <CarryPeek c={peek} font={font} />}
          <div className="pen-carry-head">
            <span className="pen-carry-q">{review ? `${from}’s change, in ${has.length} ${has.length === 1 ? 'letter' : 'letters'}` : elsewhere ? 'Apply this change elsewhere too?' : 'Apply this change to other letters too?'}</span>
          </div>
          <div className="pen-carry-kinds">
            {/* All heads the column of boxes, and stays in view while the kinds scroll */}
            {kinds.length > 1 && <PickBox label="All" letters={found} picked={on} onSet={setMany} className="pen-carry-all" />}
            {kinds.map(k => (
              <div key={k.name} className="pen-carry-kind">
                <PickBox label={k.name} letters={k.letters} picked={on} onSet={setMany} />
                <div className="pen-carry-letters">
                  {k.letters.map(c => <CarryChip key={c.ch} c={c} own={c.ch === from} font={font} on={on.has(c.ch)} applied={!!review} onToggle={flip} onPeek={setPeek} />)}
                </div>
              </div>
            ))}
          </div>
          <div className="pen-carry-foot">
            {review ? <button className="btn ghost small" onClick={() => { setOpen(false); setPeek(null); }}>Done</button> : (
              <>
                <button className="btn ghost small" onClick={answered}>Not now</button>
                <button className="btn primary small" disabled={!take.length} onClick={apply}
                  title={take.length ? `Change ${take.map(c => c.ch).join(' ')} the same way; they become drawn letters, which the sliders no longer change` : 'Pick the letters to change'}>
                  {take.length ? `Apply to ${take.length}` : 'Apply'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A box that picks every one of `letters` or none, half checked while only some are picked. */
function PickBox({ label, letters, picked, onSet, className }: {
  label: string; letters: Carried[]; picked: ReadonlySet<string>; onSet: (chs: string[], on: boolean) => void; className?: string
}) {
  const n = letters.filter(c => picked.has(c.ch)).length, every = n === letters.length;
  return (
    <label className={className ? `check pen-carry-pick ${className}` : 'check pen-carry-pick'} title={every ? `Pick none of these ${letters.length}` : `Pick all ${letters.length}`}>
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

/** One letter the change can go to, drawn with it (fitted to its cell, wide letters a little smaller), picked or not;
    `own` for the changed letter itself, at its other places. */
const CarryChip = memo(function CarryChip({ c, own, font, on, applied, onToggle, onPeek }: {
  c: Carried; own: boolean; font: Font; on: boolean; applied: boolean; onToggle: (ch: string) => void; onPeek: (c: Carried) => void
}) {
  const b = boxOf([c.doc], font);
  const where = own ? `’s ${c.places > 1 ? `${c.places} other places` : 'other place'} shaped the same` : c.places > 1 ? ` (in ${c.places} places)` : '';
  return (
    <button className={on ? 'pen-carry-chip on' : 'pen-carry-chip'} aria-pressed={on} aria-label={c.ch} onClick={() => onToggle(c.ch)}
      onPointerEnter={() => onPeek(c)} onFocus={() => onPeek(c)}
      title={`${c.ch}${where}${c.close ? '' : `${own ? ',' : ':'} the same shape, in other surroundings`} · click to ${applied ? (on ? 'put it back as it was' : 'give it the change') : on ? 'leave it as it is' : 'change it too'}`}>
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
