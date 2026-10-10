/* The opening title card, played on the first visit in a browser (not with reduced motion): the
   wordmark, then the tagline, then a fade to the app; a key or a click skips ahead to the fade.
   Once seen it's marked in localStorage under PREFS.introSeen (lib/prefs.ts), which the browser tools in
   tools/browser set beforehand to keep it out of the way. */
import { useEffect, useState } from 'react';
import { PREFS, prefFlag, setPrefFlag } from '../lib/prefs';

/** how long the card shows, then how long it fades; FADE_MS matches .intro's opacity transition in styles.css */
const HOLD_MS = 1900, FADE_MS = 450;

function shouldPlay() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return !prefFlag(PREFS.introSeen);
}

export function Intro() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'done'>(() => (shouldPlay() ? 'show' : 'done'));

  useEffect(() => {
    if (phase === 'done') return;
    setPrefFlag(PREFS.introSeen, true);
    const t = setTimeout(() => setPhase(phase === 'show' ? 'leave' : 'done'), phase === 'show' ? HOLD_MS : FADE_MS);
    const skip = () => setPhase(p => (p === 'show' ? 'leave' : p));
    window.addEventListener('keydown', skip);
    return () => { clearTimeout(t); window.removeEventListener('keydown', skip); };
  }, [phase]);

  if (phase === 'done') return null;
  return (
    <div className={phase === 'leave' ? 'intro leave' : 'intro'} onClick={() => setPhase('leave')} aria-hidden="true">
      <div className="intro-name">TypeLab</div>
      <div className="intro-tag">
        {'Experiment with type.'.split(' ').map((w, i) => <span key={i} style={{ animationDelay: `${600 + i * 140}ms` }}>{w}</span>)}
      </div>
    </div>
  );
}
