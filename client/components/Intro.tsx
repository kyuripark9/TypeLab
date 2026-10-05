import { useEffect, useState } from 'react';

const SEEN_KEY = 'typelab.intro.seen';
const HOLD_MS = 1900, FADE_MS = 450;

function shouldPlay() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try { return localStorage.getItem(SEEN_KEY) !== '1'; } catch { return true; }
}

/** Opening title card, played on the first visit in a browser: the wordmark, then the tagline, then a fade to the app. */
export function Intro() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'done'>(() => (shouldPlay() ? 'show' : 'done'));

  useEffect(() => {
    if (phase === 'done') return;
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: play again next time */ }
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
