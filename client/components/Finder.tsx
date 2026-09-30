/* The style finder: rather than every card at once, the Style page first asks what kind of letters,
   which genre of them and how they should feel, one question at a time, and then shows the cards
   that fit. Each answer is a filter in the panel, so the panel, the chips and the finder stay in
   step; a question that wouldn't narrow anything is left out. Each option is drawn in the most
   basic style it would keep (the first on the page), so the choice is made by eye. */
import { useEffect, useRef } from 'react';
import { KIND_SECTIONS, MOODS, PAGE_STYLES, STYLE_GROUPS, type StyleDef, type StyleFilter } from '../../shared/content';
import type { Traits } from '../../shared/traits';
import { n1 } from '../lib/hooks';
import { actions, adjustedParams, fontFor, passKey, useEditor, useStyleMatch, type FinderStep } from '../state/editor';

interface Option { id: string; label: string; hint?: string; count: number; sample: StyleDef }
export interface Question { step: FinderStep; title: string; note: string; options: Option[]; count: number }
interface Answer { step: FinderStep; label: string }
export interface Finder { on: boolean; question: Question | null; answers: Answer[] }

const TITLES: Record<FinderStep, string> = {
  group: 'What kind of letters?',
  kind: 'Which kind of {}?',
  mood: 'How should it feel?'
};

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
      return hit.length ? [{ ...t, count: hit.length, sample: hit[0] }] : [];
    });
    // a question is only worth asking if some answer leaves out some cards
    if (options.length < 2 || !options.some(o => o.count < count)) return null;
    const what = STYLE_GROUPS.filter(g => f.groups.includes(g.id)).map(g => g.label).join(' or ');
    return { step, title: TITLES[step].replace('{}', what), note: `${count} ${count === 1 ? 'style' : 'styles'} left`, options, count };
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
  for (const [step, picked, question] of steps) {
    if (picked.length) { answers.push({ step, label: picked.join(', ') }); continue; }
    if (passed[step] === passKey(f, step)) { answers.push({ step, label: step === 'group' ? 'Any kind' : step === 'kind' ? 'Any genre' : 'Any feeling' }); continue; }
    const q = question();
    if (q) return { on, question: q, answers };
  }
  return { on, question: null, answers };
}

/** The answers so far as a trail, each one a way back to its question, with a way out to every card. */
export function FinderTrail({ finder }: { finder: Finder }) {
  const { question, answers } = finder;
  return (
    <nav className="finder-trail" aria-label="Your answers">
      <ol>
        <li><button className="crumb" disabled={!answers.length} onClick={() => actions.backTo('group')}>All styles</button></li>
        {answers.map(a => (
          <li key={a.step}>
            <Chevron />
            <button className="crumb" title="Change this answer" onClick={() => actions.backTo(a.step)}>{a.label}</button>
          </li>
        ))}
        {question && answers.length > 0 && <li aria-current="step"><Chevron /><span className="crumb now">{question.step === 'mood' ? 'Feeling' : 'Genre'}</span></li>}
      </ol>
      <button className="link small" onClick={() => actions.setFinder(false)}>Browse all styles</button>
    </nav>
  );
}

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" /></svg>
);

/** The question asked now: one tile per answer, each drawn in a style it would keep, and "Any". */
export function FinderQuestion({ question: q, text }: { question: Question; text: string }) {
  const traits = useEditor(s => s.traits);
  const head = useRef<HTMLHeadingElement>(null), first = useRef(true);
  // after an answer, the next question takes the focus; the first one leaves it where it is
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    head.current?.focus();
  }, [q.step, q.title]);
  // the typed text if any, else each tile's style names itself
  const word = text.trim().split(/\s+/).slice(0, 2).join(' ').slice(0, 14);
  return (
    <section className="finder" aria-labelledby="finder-q">
      <div className="finder-head">
        <h2 id="finder-q" ref={head} tabIndex={-1}>{q.title}</h2>
        <span>{q.note}</span>
      </div>
      <div className="finder-options">
        {q.options.map(o => (
          <button key={o.id} className="finder-option" onClick={() => actions.answer(q.step, o.id)}>
            <Sample style={o.sample} traits={traits} text={word || o.sample.name} />
            <span className="finder-label">{o.label}<span>{o.count}</span></span>
            {o.hint && <span className="finder-hint">{o.hint}</span>}
          </button>
        ))}
        <button className="finder-option any" onClick={() => actions.pass(q.step)}>
          <span className="finder-label">Any<span>{q.count}</span></span>
          <span className="finder-hint">{q.step === 'mood' ? 'Show every style left' : 'Skip this question'}</span>
        </button>
      </div>
    </section>
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
