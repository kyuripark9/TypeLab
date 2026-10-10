/* The style finder: rather than every card at once, the Style page first asks what kind of letters,
   which genre of them and how they should feel, one question at a time, and then shows the cards
   that fit. Each answer is one of the Style page's filters in the editor (groups, kinds, moods),
   so the finder, the panel's Feeling chips and the chips over the cards stay in step; a question
   that wouldn't narrow anything is left out. Each option is drawn in the most
   basic style it would keep (the first on the page), so the choice is made by eye; pointing at a
   tile flips through the other styles it keeps, and its tooltip says what the answer means. Once something is
   typed in the bar on top, each tile draws that text instead, under the answer.
   Each step has three names: group, kind and mood in the code; Category (STYLE_GROUPS),
   Classification (KIND_SECTIONS) and Feeling (MOODS) in the design's terms; kind, genre and
   feeling on screen (STEP_WORDS). */
import { useEffect, useRef, useState } from 'react';
import { KIND_SECTIONS, MOODS, PAGE_STYLES, STYLE_GROUPS, type StyleDef, type StyleFilter } from '../../shared/content';
import { STYLE_FONTS } from '../../shared/free-fonts';
import { fontStyle, textWidth, useWebFont } from '../lib/free';
import { useSize } from '../lib/hooks';
import { actions, FINDER_STEPS, passKey, useEditor, useStyleMatch, type FinderStep } from '../state/editor';

/** An answer: what it means, how many styles it keeps and a few of them to draw it in, plainest first. */
interface Option { id: string; label: string; hint?: string; count: number; samples: StyleDef[] }
interface Question { step: FinderStep; title: string; options: Option[]; count: number }
interface Answer { step: FinderStep; label: string; count: number }
interface Finder { on: boolean; question: Question | null; answers: Answer[] }

/** Each step's words on screen: its question ({} is the Category picked), the noun for "Any …" and
    "Keep every …", and its name in the trail while it's asked (never shown for the first step, asked
    before any answer). */
const STEP_WORDS: Record<FinderStep, { title: string; noun: string; crumb: string }> = {
  group: { title: 'What kind of letters?', noun: 'kind', crumb: 'Kind' },
  kind: { title: 'Which kind of {}?', noun: 'genre', crumb: 'Genre' },
  mood: { title: 'How should it feel?', noun: 'feeling', crumb: 'Feeling' }
};
/** how many styles a tile flips through while pointed at */
const FLIP = 8;

/** Where the finder is: the question to ask now (null once the cards show) and the answers so far. */
export function useFinder(): Finder {
  const { f, traits, matches } = useStyleMatch();
  const finder = useEditor(s => s.finder), passed = useEditor(s => s.passed), on = finder && !f.query?.trim();
  const fits = (pick: Partial<StyleFilter>) => PAGE_STYLES.filter(st => matches(st, pick, traits));
  const answers: Answer[] = [];
  if (!on) return { on: false, question: null, answers };

  const ask = (step: FinderStep, tags: { id: string; label: string; hint?: string }[], pick: (id: string) => Partial<StyleFilter>): Question | null => {
    const count = fits({}).length;
    const options = tags.flatMap(t => {
      const hit = fits(pick(t.id));
      return hit.length ? [{ ...t, count: hit.length, samples: hit.slice(0, FLIP) }] : [];
    });
    // a question is only worth asking if some answer leaves out some cards
    if (options.length < 2 || !options.some(o => o.count < count)) return null;
    const what = STYLE_GROUPS.filter(g => f.groups.includes(g.id)).map(g => g.label).join(' or ');
    return { step, title: STEP_WORDS[step].title.replace('{}', what), options, count };
  };

  // each step: already answered (by the finder or the panel), passed with "Any", skipped as pointless, or asked now
  const steps: [FinderStep, string[], () => Question | null][] = [
    ['group', f.groups.map(g => STYLE_GROUPS.find(x => x.id === g)!.label),
      () => ask('group', STYLE_GROUPS, id => ({ groups: [id as never] }))],
    ['kind', f.kinds.map(k => KIND_SECTIONS.flatMap(sec => sec.tags).find(t => t.id === k)!.label),
      () => ask('kind', KIND_SECTIONS.filter(sec => sec.groups.some(g => f.groups.includes(g))).flatMap(sec => sec.tags), id => ({ kinds: [id as never] }))],
    ['mood', f.moods.map(m => MOODS.find(x => x.id === m)!.label),
      () => {
        const q = ask('mood', MOODS, id => ({ moods: [id as never] }));
        // few cards left are quicker to look over than to sort by feeling; the rest, most common feeling first
        return q && q.count > 4 ? { ...q, options: [...q.options].sort((a, b) => b.count - a.count) } : null;
      }]
  ];
  // how many cards an answer leaves, before the answers after it narrow them further
  const left = (step: FinderStep) => fits(step === 'group' ? { kinds: [], moods: [] } : step === 'kind' ? { moods: [] } : {}).length;
  for (const [step, picked, question] of steps) {
    if (picked.length) { answers.push({ step, label: picked.join(', '), count: left(step) }); continue; }
    if (passed[step] === passKey(f, step)) { answers.push({ step, label: `Any ${STEP_WORDS[step].noun}`, count: left(step) }); continue; }
    const q = question();
    if (q) return { on, question: q, answers };
  }
  return { on, question: null, answers };
}

/** The answers so far as a trail, each one a way back to its question, and on the same row which
    question this is and a way back to the one before. */
export function FinderTrail({ finder }: { finder: Finder }) {
  const { question, answers } = finder;
  const at = question ? FINDER_STEPS.indexOf(question.step) : -1, back = answers.at(-1)?.step;
  return (
    <nav className="finder-trail" aria-label="Your answers">
      <ol>
        <li><button className="crumb" disabled={!answers.length} onClick={() => actions.backTo('group')}>All styles<span className="crumb-count">{PAGE_STYLES.length}</span></button></li>
        {answers.map(a => (
          <li key={a.step}>
            <Chevron />
            <button className="crumb" title="Change this answer" onClick={() => actions.backTo(a.step)}>{a.label}<span className="crumb-count">{a.count}</span></button>
          </li>
        ))}
        {question && answers.length > 0 && <li aria-current="step"><Chevron /><span className="crumb now">{STEP_WORDS[question.step].crumb}</span></li>}
      </ol>
      {question && <div className="finder-step">
        <span className="finder-steps" aria-hidden="true">
          {FINDER_STEPS.map((st, i) => <span key={st} className={i <= at ? 'on' : undefined} />)}
        </span>
        <span aria-label={`Question ${at + 1} of ${FINDER_STEPS.length}`}>{at + 1} of {FINDER_STEPS.length}</span>
        {back && <button className="link small" onClick={() => actions.backTo(back)}>Back</button>}
      </div>}
    </nav>
  );
}

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" /></svg>
);

/** The question asked now, then one tile per answer, its name (or the typed text) drawn in a
    style it would keep, and "No preference". */
export function FinderQuestion({ question: q }: { question: Question }) {
  const typed = useEditor(s => s.custom).trim();
  const head = useRef<HTMLHeadingElement>(null), first = useRef(true);
  // after an answer, the next question takes the focus; the first one leaves it where it is
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    head.current?.focus();
  }, [q.step, q.title]);
  return (
    <section className="finder" aria-labelledby="finder-q">
      <div className="finder-head">
        <h2 id="finder-q" ref={head} tabIndex={-1}>{q.title}</h2>
      </div>
      {/* keyed by the question, so each new one's tiles come in afresh */}
      <div className="finder-options" key={`${q.step}:${q.title}`}>
        {q.options.map((o, i) => <FinderOption key={o.id} step={q.step} option={o} index={i} typed={typed} />)}
        <button className="finder-option any" style={{ animationDelay: `${q.options.length * 30}ms` }} onClick={() => actions.pass(q.step)}>
          <span className="finder-label">No preference</span>
          <span className="finder-sub">Keep every {STEP_WORDS[q.step].noun}</span>
        </button>
      </div>
    </section>
  );
}

/** One answer's tile. Pointed at or focused, it flips through the styles the answer keeps; what
    the answer means and how many styles it leaves are in its tooltip and label, not on the tile. */
function FinderOption({ step, option: o, index, typed }: { step: FinderStep; option: Option; index: number; typed: string }) {
  const [live, setLive] = useState(false), [n, setN] = useState(0);
  useEffect(() => {
    if (!live || o.samples.length < 2) { setN(0); return; }
    const t = setInterval(() => setN(i => (i + 1) % o.samples.length), 700);
    return () => clearInterval(t);
  }, [live, o.samples.length]);
  const style = o.samples[n] ?? o.samples[0];
  const count = `${o.count} ${o.count === 1 ? 'style' : 'styles'}`;
  return (
    <button className="finder-option" style={{ animationDelay: `${index * 30}ms` }}
      aria-label={`${o.label}${o.hint ? `: ${o.hint}` : ''}, ${count}`} title={`${o.hint ? `${o.hint} · ` : ''}${count}`} onClick={() => actions.answer(step, o.id)}
      onPointerEnter={() => setLive(true)} onPointerLeave={() => setLive(false)} onFocus={() => setLive(true)} onBlur={() => setLive(false)}>
      {typed ? <>
        <span className="finder-label">{o.label}</span>
        <FreeTyped id={STYLE_FONTS[style.id]} text={typed} />
      </> : <FreeSample id={STYLE_FONTS[style.id]} text={o.label} />}
    </button>
  );
}

/** A word in a free font, as large as fits the tile (up to its height). */
function FreeSample({ id, text }: { id: string; text: string }) {
  const font = useWebFont(id), [ref, box] = useSize<HTMLSpanElement>();
  const size = font && box.width ? Math.min(44, box.width / Math.max(0.01, textWidth(font, text)) * 0.97) : 44;
  return <span ref={ref} className={font ? 'finder-free' : 'finder-free loading'} style={{ ...(font && fontStyle(font)), fontSize: size }} aria-hidden="true">{text}</span>;
}

/** Typed text set in a style at one size for every tile, wrapped to the tile's width. */
function FreeTyped({ id, text }: { id: string; text: string }) {
  const font = useWebFont(id);
  return <div className="finder-typed free" style={{ ...(font && fontStyle(font)), visibility: font ? undefined : 'hidden' }} aria-hidden="true">{text}</div>;
}
