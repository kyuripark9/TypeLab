/* First-run guide: a spotlight tour over the editor's main areas. Opens once per browser and
   can be replayed from the header. Targets are elements marked with data-guide="…". */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CategoryId } from '../../shared/content';
import { actions, useEditor } from '../state/editor';

type Side = 'top' | 'right' | 'bottom' | 'left';
interface Step { target?: string; side?: Side; category?: CategoryId; title: string; body: string }

const STEPS: Step[] = [
  { title: 'Welcome to TypeLab', body: 'Design your own typeface by shaping letters, not numbers. Here’s a quick tour.' },
  { target: 'nav', side: 'right', title: 'Design categories',
    body: 'Work through your font one area at a time, from Style down to Personality.' },
  { target: 'stage', side: 'right', category: 'style', title: 'Starting styles',
    body: 'Choose a style to begin with. Type in the bar above to see your own words in every style.' },
  { target: 'panel', side: 'left', category: 'structure', title: 'Controls',
    body: 'Drag a slider to reshape every letter at once. The diagram shows the part it changes. Double-click a slider to reset it.' },
  { target: 'stage', side: 'right', category: 'structure', title: 'Live preview',
    body: 'Click any letter to see its anatomy. Change the sample text and size in the bar above.' },
  { target: 'strip', side: 'top', title: 'Every glyph',
    body: 'Letters, figures and punctuation in your current design. Click one to inspect it.' },
  { target: 'actions', side: 'bottom', title: 'Save and export',
    body: 'Undo any change, save to My designs, and export an installable .otf font. Open Guide to see this tour again.' }
];

const SEEN_KEY = 'typelab.guide.seen';
export function guideSeen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: the guide just shows again */ }
}

interface Rect { x: number; y: number; w: number; h: number }
const PAD = 6, GAP = 14, EDGE = 16;

/** The target's box, trimmed to the viewport so long scrollers don't spill off-screen. */
function measure(target: string): Rect | null {
  const el = document.querySelector(`[data-guide="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const x = Math.max(r.left - PAD, 2), y = Math.max(r.top - PAD, 2);
  const w = Math.min(r.right + PAD, innerWidth - 2) - x, h = Math.min(r.bottom + PAD, innerHeight - 2) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/** Card position beside the spotlight on the step's side, kept inside the viewport. */
function place(r: Rect | null, side: Side, cw: number, ch: number) {
  let x = (innerWidth - cw) / 2, y = (innerHeight - ch) / 2;
  if (r) {
    if (side === 'right') { x = r.x + r.w + GAP; y = r.y + 24; }
    else if (side === 'left') { x = r.x - GAP - cw; y = r.y + 24; }
    else if (side === 'bottom') { x = r.x + r.w - cw; y = r.y + r.h + GAP; }
    else { x = r.x + 24; y = r.y - GAP - ch; }
  }
  return {
    left: Math.round(Math.min(Math.max(x, EDGE), innerWidth - cw - EDGE)),
    top: Math.round(Math.min(Math.max(y, EDGE), innerHeight - ch - EDGE))
  };
}

export function Guide({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const card = useRef<HTMLDivElement>(null), next = useRef<HTMLButtonElement>(null);
  const step = STEPS[i], last = i === STEPS.length - 1;

  // remember where the user was, and put them back when the tour ends
  const start = useRef({ category: useEditor.getState().category, focus: document.activeElement as HTMLElement | null });
  const close = () => {
    markSeen();
    actions.setCategory(start.current.category);
    start.current.focus?.focus();
    onClose();
  };

  // show the right category, then measure once it has rendered
  useEffect(() => {
    const s = useEditor.getState();
    if (s.inspect) actions.closeInspector();
    if (s.exportOpen) actions.setExportOpen(false);
    if (step.category && s.category !== step.category) actions.setCategory(step.category);
    const update = () => setRect(step.target ? measure(step.target) : null);
    const raf = requestAnimationFrame(() => requestAnimationFrame(update));
    addEventListener('resize', update);
    next.current?.focus();
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', update); };
  }, [step]);

  useLayoutEffect(() => {
    const c = card.current;
    if (c) setPos(place(rect, step.side ?? 'bottom', c.offsetWidth, c.offsetHeight));
  }, [rect, step]);

  const go = (d: number) => { if (i + d >= 0 && i + d < STEPS.length) setI(i + d); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    // capture, so the editor's own Escape/arrow shortcuts stay quiet during the tour
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  });

  return (
    <div className="guide">
      {rect
        ? <div className="guide-spot" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
        : <div className="guide-dim" />}
      <div ref={card} className="guide-card" role="dialog" aria-modal="true" aria-labelledby="guide-title" aria-describedby="guide-body"
        style={pos ?? { visibility: 'hidden' }}>
        {i > 0 && <div className="guide-step">{i} of {STEPS.length - 1}</div>}
        <h2 id="guide-title">{step.title}</h2>
        <p id="guide-body">{step.body}</p>
        <div className="guide-foot">
          {!last && <button className="btn ghost small" onClick={close}>{i === 0 ? 'Skip' : 'Skip tour'}</button>}
          <span className="guide-grow" />
          {i > 1 && <button className="btn ghost small" onClick={() => go(-1)}>Back</button>}
          <button ref={next} className="btn primary small" onClick={() => (last ? close() : go(1))}>
            {i === 0 ? 'Start tour' : last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
