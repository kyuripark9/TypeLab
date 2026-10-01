/* The style finder: rather than every card at once, the Style page first asks what kind of letters,
   which genre of them and how they should feel, one question at a time, and then shows the cards
   that fit. Each answer is a filter in the panel, so the panel, the chips and the finder stay in
   step; a question that wouldn't narrow anything is left out. Each option is drawn in the most
   basic style it would keep (the first on the page), so the choice is made by eye; pointing at a
   tile flips through the other styles it keeps and says what the answer means. Once something is
   typed in the bar on top, each tile draws that text instead, under the answer. */
import { useEffect, useRef, useState } from 'react';
import { KIND_SECTIONS, MOODS, PAGE_STYLES, STYLE_GROUPS, type StyleDef, type StyleFilter } from '../../shared/content';
import type { Traits } from '../../shared/traits';
import { n1, useSize } from '../lib/hooks';
import { actions, adjustedParams, fontFor, FINDER_STEPS, passKey, useEditor, useStyleMatch, type FinderStep } from '../state/editor';

/** An answer: what it means, how many styles it keeps and a few of them to draw it in, plainest first. */
interface Option { id: string; label: string; hint?: string; count: number; samples: StyleDef[] }
export interface Question { step: FinderStep; title: string; options: Option[]; count: number }
interface Answer { step: FinderStep; label: string; count: number }
export interface Finder { on: boolean; question: Question | null; answers: Answer[] }

const TITLES: Record<FinderStep, string> = {
  group: 'What kind of letters?',
  kind: 'Which kind of {}?',
  mood: 'How should it feel?'
};
const LEADS: Record<FinderStep, string> = {
  group: 'Pick the closest; you can change it later.',
  kind: 'Each is drawn the way that genre looks.',
  mood: 'The feeling your letters should give off.'
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
    return { step, title: TITLES[step].replace('{}', what), options, count };
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
    if (passed[step] === passKey(f, step)) { answers.push({ step, label: step === 'group' ? 'Any kind' : step === 'kind' ? 'Any genre' : 'Any feeling', count: left(step) }); continue; }
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
        {question && answers.length > 0 && <li aria-current="step"><Chevron /><span className="crumb now">{question.step === 'mood' ? 'Feeling' : 'Genre'}</span></li>}
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

/** The question asked now and a one-line lead, then one tile per answer, its name (or the typed
    text) drawn in a style it would keep, and "No preference". */
export function FinderQuestion({ question: q }: { question: Question }) {
  const traits = useEditor(s => s.traits), typed = useEditor(s => s.custom).trim();
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
        <p>{LEADS[q.step]} <span>{typed ? 'Point at a tile for more of its styles.' : 'Point at a tile for more, or type above to try your words.'}</span></p>
      </div>
      {/* keyed by the question, so each new one's tiles come in afresh */}
      <div className={q.options.some(o => o.hint) ? 'finder-options hints' : 'finder-options'} key={`${q.step}:${q.title}`}>
        {q.options.map((o, i) => <FinderOption key={o.id} step={q.step} option={o} index={i} traits={traits} typed={typed} />)}
        <button className="finder-option any" style={{ animationDelay: `${q.options.length * 30}ms` }} onClick={() => actions.pass(q.step)}>
          <span className="finder-label">No preference</span>
          <span className="finder-sub">Keep every {q.step === 'group' ? 'kind' : q.step === 'kind' ? 'genre' : 'feeling'}</span>
        </button>
      </div>
    </section>
  );
}

/** One answer's tile. Pointed at or focused, it flips through the styles the answer keeps, and
    says what the answer means and how many styles it leaves. */
function FinderOption({ step, option: o, index, traits, typed }: { step: FinderStep; option: Option; index: number; traits: Traits; typed: string }) {
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
      aria-label={`${o.label}${o.hint ? `: ${o.hint}` : ''}, ${count}`} onClick={() => actions.answer(step, o.id)}
      onPointerEnter={() => setLive(true)} onPointerLeave={() => setLive(false)} onFocus={() => setLive(true)} onBlur={() => setLive(false)}>
      {typed ? <>
        <span className="finder-label">{o.label}</span>
        <Typed style={style} traits={traits} text={typed} />
      </> : <Sample style={style} traits={traits} text={o.label} />}
      <span className="finder-more" aria-hidden="true">
        <span className="finder-hint">{o.hint}</span>
        <span className="finder-count">{count}</span>
      </span>
    </button>
  );
}

/** A word set in a style, as large as fits the tile's width and height. */
function Sample({ style, traits, text }: { style: StyleDef; traits: Traits; text: string }) {
  const f = fontFor(adjustedParams(style, traits));
  const [line] = f.layout(text, Infinity);
  const top = Math.max(f.m.asc, f.m.cap), H = top - f.m.desc, W = Math.max(1, line?.width ?? 1);
  return (
    <svg className="finder-sample" viewBox={`0 ${n1(-H * 0.06)} ${n1(W)} ${n1(H * 1.12)}`} preserveAspectRatio="xMinYMid meet" aria-hidden="true">
      {line?.items.map((it, i) => {
        const g = f.glyph(it.ch);
        return g && <path key={i} d={g.d} transform={`translate(${n1(it.x)},${n1(top)})`} />;
      })}
    </svg>
  );
}

/** Typed text set in a style at one size for every tile, wrapped to the tile's width. */
function Typed({ style, traits, text }: { style: StyleDef; traits: Traits; text: string }) {
  const f = fontFor(adjustedParams(style, traits));
  const [ref, box] = useSize<HTMLDivElement>();
  const top = Math.max(f.m.asc, f.m.cap), H = top - f.m.desc, LH = H * 1.2, sc = 34 / H;
  const lines = box.width ? f.layout(text, box.width / sc) : [];
  const h = n1(lines.length * LH * sc);
  return (
    <div ref={ref} className="finder-typed">
      <svg width={n1(box.width)} height={h} viewBox={`0 0 ${n1(box.width)} ${h}`} aria-hidden="true">
        <g transform={`scale(${n1(sc * 1000) / 1000})`}>
          {lines.map((ln, i) => ln.items.map((it, j) => {
            const g = f.glyph(it.ch);
            return g && <path key={`${i}-${j}`} d={g.d} transform={`translate(${n1(it.x)},${n1(top + i * LH)})`} />;
          }))}
        </g>
      </svg>
    </div>
  );
}
