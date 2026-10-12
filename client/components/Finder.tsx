/* The style finder: rather than every card at once, the Style page first asks what kind of letters
   (the Category the cards are grouped by) and then shows the cards of that kind, few enough to look
   over side by side. The answer is the Style page's Category filter, and over the cards it leaves sits
   the way back to the question; while every card left is one kind, the question is left out. Every card
   at once is the other side of the Style page's Help me choose / Browse all switch (Stage.tsx). Genres
   are mostly the cards' own names and feelings are the panel's filter, so neither is asked. Each option
   is drawn in the most basic style it would keep (the first on the page), so the choice is made by eye;
   pointing at a tile flips through the other styles it keeps, and its tooltip says what the answer
   means. Once something is typed in the bar on top, each tile draws that text instead, under the answer. */
import { useEffect, useState } from 'react';
import { PAGE_STYLES, STYLE_GROUPS, type StyleDef, type StyleGroup } from '../../shared/content';
import { STYLE_FONTS } from '../../shared/free-fonts';
import { fontStyle, textWidth, useWebFont } from '../lib/free';
import { useSize } from '../lib/hooks';
import { actions, useEditor, useStyleMatch } from '../state/editor';
import { BuiltText } from './BuiltText';

/** An answer: what it means, how many styles it keeps and a few of them to draw it in, plainest first. */
interface Option { id: StyleGroup; label: string; hint: string; count: number; samples: StyleDef[] }
interface Finder { on: boolean; question: Option[] | null }

/** how many styles a tile flips through while pointed at */
const FLIP = 8;

/** Whether the finder is on, and the answers to offer while its question is open (null once the cards show). */
export function useFinder(): Finder {
  const { f, traits, matches } = useStyleMatch();
  const on = useEditor(s => s.finder) && !f.query?.trim();
  if (!on || f.groups.length) return { on, question: null };
  const options = STYLE_GROUPS.flatMap(g => {
    const hit = PAGE_STYLES.filter(st => matches(st, { groups: [g.id] }, traits));
    return hit.length ? [{ ...g, count: hit.length, samples: hit.slice(0, FLIP) }] : [];
  });
  // each style is one kind, so with two kinds or more left every answer leaves some cards out
  return { on, question: options.length > 1 ? options : null };
}

/** The question, one tile per kind of letters, its name (or the typed text) drawn in a style it would
    keep. `onAnswer` runs once the cards replace the tiles. */
export function FinderQuestion({ options, onAnswer }: { options: Option[]; onAnswer: () => void }) {
  const typed = useEditor(s => s.custom).trim();
  return (
    <section className="finder" aria-labelledby="finder-q">
      <h2 className="finder-head" id="finder-q">What kind of letters?</h2>
      <div className="finder-options">
        {options.map((o, i) => <FinderOption key={o.id} option={o} index={i} typed={typed} onAnswer={onAnswer} />)}
      </div>
    </section>
  );
}

/** Over the cards an answer leaves, in the question's place: the way back to it, taking the answer off. The
    button goes with the cards, so `onBack` takes the focus somewhere that stays. */
export function FinderBack({ groups, onBack }: { groups: StyleGroup[]; onBack: () => void }) {
  return (
    <div className="finder-back-row">
      <button className="btn ghost small finder-back" onClick={() => { groups.forEach(actions.toggleGroup); onBack(); }}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
        Other kinds of letters
      </button>
    </div>
  );
}

/** One answer's tile. Pointed at or focused, it flips through the styles the answer keeps; what
    the answer means and how many styles it leaves are in its tooltip and label, not on the tile. */
function FinderOption({ option: o, index, typed, onAnswer }: { option: Option; index: number; typed: string; onAnswer: () => void }) {
  const [live, setLive] = useState(false), [n, setN] = useState(0);
  useEffect(() => {
    if (!live || o.samples.length < 2) { setN(0); return; }
    const t = setInterval(() => setN(i => (i + 1) % o.samples.length), 700);
    return () => clearInterval(t);
  }, [live, o.samples.length]);
  // (a style built from blocks has no font: its letters are the engine's)
  const style = o.samples[n] ?? o.samples[0], font = STYLE_FONTS[style.id];
  const count = `${o.count} ${o.count === 1 ? 'style' : 'styles'}`;
  return (
    <button className="finder-option" style={{ animationDelay: `${index * 30}ms` }}
      aria-label={`${o.label}: ${o.hint}, ${count}`} title={`${o.hint} · ${count}`} onClick={() => { actions.toggleGroup(o.id); onAnswer(); }}
      onPointerEnter={() => setLive(true)} onPointerLeave={() => setLive(false)} onFocus={() => setLive(true)} onBlur={() => setLive(false)}>
      {typed ? <>
        <span className="finder-label">{o.label}</span>
        {font
          ? <FreeTyped id={font} text={typed} />
          : <BuiltText className="finder-typed" params={style.params} text={typed} size={TYPED_SIZE} fit />}
      </> : font
        ? <FreeSample id={font} text={o.label} />
        : <BuiltText className="finder-free" params={style.params} text={o.label} size={SAMPLE_SIZE} fit />}
    </button>
  );
}

/** The largest a tile's word is set, and the largest and smallest typed text in a tile is set, in px. */
const SAMPLE_SIZE = 44, TYPED_SIZE = 30, TYPED_MIN = 18;

/** A word in a free font, as large as fits the tile (up to its height). */
function FreeSample({ id, text }: { id: string; text: string }) {
  const font = useWebFont(id), [ref, box] = useSize<HTMLSpanElement>();
  const size = font && box.width ? Math.min(SAMPLE_SIZE, box.width / Math.max(0.01, textWidth(font, text)) * 0.97) : SAMPLE_SIZE;
  return <span ref={ref} className={font ? 'finder-free' : 'finder-free loading'} style={{ ...(font && fontStyle(font)), fontSize: size }} aria-hidden="true">{text}</span>;
}

/** Typed text in a style on one line, as large as fits the tile (TYPED_SIZE at most), so a word is never broken;
    below TYPED_MIN it stops shrinking and runs out under an ellipsis. */
function FreeTyped({ id, text }: { id: string; text: string }) {
  const font = useWebFont(id), [ref, box] = useSize<HTMLDivElement>();
  const size = font && box.width ? Math.max(TYPED_MIN, Math.min(TYPED_SIZE, box.width / Math.max(0.01, textWidth(font, text)) * 0.97)) : TYPED_SIZE;
  return <div ref={ref} className="finder-typed free" style={{ ...(font && fontStyle(font)), fontSize: size, visibility: font ? undefined : 'hidden' }} aria-hidden="true">{text}</div>;
}
