/* The opening title card, played on the first visit in a browser (not with reduced motion). "TypeLab" comes up in
   TypeLab's own fonts, the ones the Style page's cards start from, to show how many fonts one name can be: a scramble
   of characters grows in from the left, each in a font of its own, and settles into the name letter by letter, the
   letters still in fonts of their own; the whole name then cuts from font to font, some cuts mixing them, slowing
   until it lands on the wordmark, the header's logo, with the tagline under it; then a fade to the app. A key or a
   click skips ahead to the fade. The fonts are the cards' web fonts: the card waits up to WAIT_MS for them, plays with
   those that came, and shows the wordmark alone when too few did. Once seen it's marked in localStorage under
   PREFS.introSeen (lib/prefs.ts), which the browser tools in tools/browser set beforehand to keep it out of the way. */
import { useEffect, useState } from 'react';
import { OWN_FAMILIES, fontId, type FreeFontRef } from '../../shared/free-fonts';
import { fontStyle, webFont } from '../lib/free';
import { PREFS, prefFlag, setPrefFlag } from '../lib/prefs';

const NAME = 'TypeLab';
const FONTS = Object.entries(OWN_FAMILIES).map(([family, o]) => fontId({ family, weight: o.weight, italic: o.italic }));
/** what the scramble shows where a letter hasn't settled yet */
const NOISE = 'ABDEGHKMNQRSUWXZadfghkmnqrsuwz0123456789&?!#%@*';
/** The whole name's cuts, in order: a font's name sets it in that font, a `+` after it sets two of its letters in
    others, and `*` gives every letter a font of its own. Neighbours look far apart, and Mainline, a sans like the
    wordmark's Inter, comes last. A font that didn't come is left out. */
const CUTS = ['Cathedral', '*', 'Gumdrop', 'Serenade', 'Dispatch+', 'Orbital', '*', 'Couture', 'Boardwalk', 'Timber+', 'Jotter', 'Mainline'];
/** how long to wait for the fonts, and the fewest to play with */
const WAIT_MS = 1200, FEWEST = 6;
/** each step of the scramble growing and of it settling; the cuts slow from CUT_MS to CUT_MS + SLOW_MS */
const GROW_MS = 45, SETTLE_MS = 55, CUT_MS = 55, SLOW_MS = 115;
/** how long the wordmark shows, then how long it fades; FADE_MS matches .intro's opacity transition in styles.css */
const HOLD_MS = 1300, FADE_MS = 450;

type Letter = { ch: string; font: FreeFontRef };
/** One step of the card: its letters, each in its font, for `ms`; no letters is the wordmark. */
interface Step { ms: number; letters?: Letter[] }

const any = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** The steps, drawn afresh each time from the fonts that came. */
function plan(fonts: FreeFontRef[]): Step[] {
  const mark: Step = { ms: HOLD_MS };
  if (fonts.length < FEWEST) return [mark];
  // a font other than `not`, so letters side by side, or a word and the letters set apart in it, differ
  const other = (not?: FreeFontRef) => any(fonts.filter(f => f !== not));
  const mixed = (chars: string[]) => chars.reduce<Letter[]>((ls, ch) => [...ls, { ch, font: other(ls.at(-1)?.font) }], []);
  const noise = (n: number) => Array.from({ length: n }, () => any([...NOISE]));
  const steps: Step[] = [];
  for (let n = 1; n <= NAME.length; n++) steps.push({ ms: GROW_MS, letters: mixed(noise(n)) });
  // settling from the left, each letter keeps the font it settled in; the full name, all mixed, stays a moment longer
  const settled: Letter[] = [];
  for (let n = 1; n <= NAME.length; n++) {
    settled.push({ ch: NAME[n - 1], font: other(settled.at(-1)?.font) });
    steps.push({ ms: n === NAME.length ? SETTLE_MS * 3 : SETTLE_MS, letters: [...settled, ...mixed(noise(NAME.length - n))] });
  }
  const named = new Map(fonts.map(f => [f.family, f]));
  const cuts = CUTS.filter(c => c === '*' || named.has(c.replace('+', '')));
  cuts.forEach((c, k) => {
    const ms = CUT_MS + SLOW_MS * (k / Math.max(1, cuts.length - 1)) ** 2;
    if (c === '*') { steps.push({ ms, letters: mixed([...NAME]) }); return; }
    const font = named.get(c.replace('+', ''))!, odd = new Set<number>();
    while (c.endsWith('+') && odd.size < 2) odd.add(Math.floor(Math.random() * NAME.length));
    steps.push({ ms, letters: [...NAME].map((ch, i) => ({ ch, font: odd.has(i) ? other(font) : font })) });
  });
  return [...steps, mark];
}

function shouldPlay() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return !prefFlag(PREFS.introSeen);
}

export function Intro() {
  const [phase, setPhase] = useState<'wait' | 'play' | 'leave' | 'done'>(() => (shouldPlay() ? 'wait' : 'done'));
  const [steps, setSteps] = useState<Step[]>([]);
  const [at, setAt] = useState(0);
  const shown = phase !== 'done';

  // the fonts, as many as come within WAIT_MS
  useEffect(() => {
    if (phase !== 'wait') return;
    setPrefFlag(PREFS.introSeen, true);
    const got: FreeFontRef[] = [];
    let live = true;
    const start = () => { if (!live) return; live = false; setSteps(plan(got)); setPhase('play'); };
    const t = setTimeout(start, WAIT_MS);
    void Promise.all(FONTS.map(id => webFont(id).then(r => { if (r) got.push(r); }))).then(start);
    return () => { live = false; clearTimeout(t); };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'play' && phase !== 'leave') return;
    const t = phase === 'leave' ? setTimeout(() => setPhase('done'), FADE_MS)
      : setTimeout(() => (at < steps.length - 1 ? setAt(at + 1) : setPhase('leave')), steps[at].ms);
    return () => clearTimeout(t);
  }, [phase, at, steps]);

  useEffect(() => {
    if (!shown) return;
    const skip = () => setPhase(p => (p === 'done' ? p : 'leave'));
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [shown]);

  if (!shown) return null;
  // nothing while the fonts come (or when skipped before they did)
  const step = phase === 'wait' ? undefined : steps[at], letters = step?.letters;
  return (
    <div className={phase === 'leave' ? 'intro leave' : 'intro'} onClick={() => setPhase('leave')} aria-hidden="true">
      {letters
        ? <div className="intro-name">{letters.map((l, i) => <span key={i} style={fontStyle(l.font)}>{l.ch}</span>)}</div>
        : <div className={step ? 'intro-name intro-mark' : 'intro-name'}>{step && NAME}</div>}
      <div className="intro-tag">
        {step && !letters && 'Experiment with type.'.split(' ').map((w, i) => <span key={i} style={{ animationDelay: `${250 + i * 120}ms` }}>{w}</span>)}
      </div>
    </div>
  );
}
