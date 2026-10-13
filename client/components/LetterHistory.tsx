/* A letter's record of its own edits (shared/letter-log.ts), opened from the inspector's History: how the letter
   stood after each edit, newest first, each drawn small as it would stand in the design now, the one it stands as
   marked Now, and at the foot the font's own letter. Picking one brings the letter back to it in one undo step. */
import { memo, useMemo, useRef, useState } from 'react';
import { buildFont, type Font, type Glyph } from '../../shared/engine';
import { ownOf, sameOwn, withOwn, type LetterEdit, type Own } from '../../shared/letter-log';
import { settingName, someOf, useDrawnRows, useInWindow, when } from '../lib/history';
import { n1, useDismiss } from '../lib/hooks';
import { actions, useEditor, useFont } from '../state/editor';

/** The History button (a clock turning back, to keep the inspector's head on one line), while the letter has a
    record, and its menu. Till then it holds its place unseen (styles.css), so the letter's first edit doesn't push
    the head onto another line and shrink the canvas under the pointer. */
export function LetterHistory({ ch }: { ch: string }) {
  const list = useEditor(s => s.log[ch]);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, setOpen, wrap, true);
  const none = !list?.length;
  return (
    <div className="history" ref={wrap}>
      <button className="btn ghost icon" aria-label={`History of ${ch}`} aria-haspopup="menu" aria-expanded={open} disabled={none} onClick={() => setOpen(o => !o)}
        title={`History of ${ch}: every version your edits made, kept with the font, to bring back`}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 8a5.4 5.4 0 1 0 1.6-3.8M2.5 2.5v2.2h2.2M8 5v3.2l2.1 1.4" /></svg>
      </button>
      {open && !none && <HistoryMenu ch={ch} list={list} close={() => setOpen(false)} />}
    </div>
  );
}

/** The font's own letter: nothing of its own. */
const NONE: Own = {};

function HistoryMenu({ ch, list, close }: { ch: string; list: LetterEdit[]; close: () => void }) {
  const font = useFont();
  const own = useEditor(s => s.params.glyphs[ch]), drawn = useEditor(s => s.params.outlines[ch]);
  // newest first, each with whether the letter stands as it now; the newest of those is Now
  const rows = useMemo(() => list.map((e, i) => ({ e, i, same: sameOwn(e, { own, drawn }) })).reverse(), [list, own, drawn]);
  const plain = !own && !drawn, now = rows.find(r => r.same)?.i ?? (plain ? -1 : -2);
  // (on phones the button sits at the left)
  const menu = useRef<HTMLDivElement>(null);
  useInWindow(menu);
  const shown = useDrawnRows(rows.length);
  const bring = (e: LetterEdit) => {
    if (actions.restoreLetter(ch, e)) actions.toast(`${ch} is back as it was at ${when(e.t)} · ⌘Z undoes it`);
    close();
  };
  return (
    <div className="popover history-menu" ref={menu} role="menu" aria-label={`History of ${ch}`}>
      <div className="list-head">History of <span className="ch">{ch}</span></div>
      <div className="history-list">
        {rows.map(({ e, i, same }, k) => (
          <Row key={i} ch={ch} o={e} font={font} draw={k < shown} now={i === now} off={same} what={whatOf(e)} time={when(e.t)} onPick={() => bring(e)} />
        ))}
        <Row ch={ch} o={NONE} font={font} draw={rows.length < shown} now={now === -1} off={plain} what={`The font’s ${ch}`}
          onPick={() => { actions.syncLetter(ch); close(); }} />
      </div>
    </div>
  );
}

/** One version of the letter: drawn small, what made it, and when; pressed, the letter is brought back to it. */
const Row = memo(function Row({ ch, o, font, draw, now, off, what, time, onPick }: {
  ch: string; o: Own; font: Font; draw: boolean; now: boolean; off: boolean; what: string; time?: string; onPick: () => void;
}) {
  const g = draw ? versionOf(font, ch, o) : null, m = font.m, top = Math.max(m.asc, m.cap) + 80, size = top - m.desc + 80;
  return (
    <button role="menuitem" className={now ? 'history-row now' : 'history-row'} disabled={off} onClick={onPick}
      title={off ? `${ch} stands so now` : `Bring ${ch} back to this`}>
      <svg viewBox={`${g ? n1((g.adv - size) / 2) : 0} ${n1(-top)} ${n1(size)} ${n1(size)}`} aria-hidden="true">{g && <path d={g.d} />}</svg>
      <span className="history-what">{what}</span>
      {now ? <span className="history-now">Now</span> : time && <span className="history-when">{time}</span>}
    </button>
  );
});

/** Letter `ch` as it stands with `o` its own in the design `font` draws, built once per version and design. */
const versions = new WeakMap<Font, WeakMap<Own, Glyph | null>>();
function versionOf(font: Font, ch: string, o: Own): Glyph | null {
  let byOwn = versions.get(font);
  if (!byOwn) { byOwn = new WeakMap(); versions.set(font, byOwn); }
  let g = byOwn.get(o);
  if (g === undefined) {
    const p = withOwn(font.params, ch, o);
    // only the letter's drawing differs, mostly: the design's font lends the rest of its letters
    g = (sameOwn(o, ownOf(font.params, ch)) ? font : buildFont(p, font)).glyph(ch);
    byOwn.set(o, g);
  }
  return g;
}

/** What made a version: the settings it changed by their labels (a few, then how many more), its points, carried
    from another letter, brought back (its picture says which), or Reset; "As it was" where the record notes how the
    letter stood before an edit. */
function whatOf(e: LetterEdit): string {
  if (e.back !== undefined) return 'Brought back';
  if (!e.own && !e.drawn) return 'Reset';
  if (!e.keys.length) return 'As it was';
  const what = someOf(e.keys.map(k => (k === 'points' ? 'Points' : settingName(k) ?? k)));
  return e.by ? `${what} · carried from ${e.by}` : what;
}
