/* First-run guide: a hands-on tour over the editor's main areas. Each step spotlights one area and
   gives a small task to try there; the spotlight stays live while the rest of the editor is held
   still, and the task ticks off once the editor sees it done. Opens once per browser and can be
   replayed from the header. Targets are elements marked with data-guide="…". */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CategoryId } from '../../shared/content';
import { isTyping } from '../lib/hooks';
import { actions, useEditor, type EditorState } from '../state/editor';

type Side = 'top' | 'right' | 'bottom' | 'left';
interface Step {
  target?: string; side?: Side;
  /** the page to show: Style always, another page only if the Style page is open (a page picked earlier stays) */
  category?: CategoryId;
  /** 'open' shows a letter in the inspector, 'keep' leaves it as it is; otherwise it closes */
  inspector?: 'open' | 'keep';
  /** the area, named small above the task */
  label?: string;
  /** the thing to try, as the card's heading; done once `done` holds against the editor as it was when the step began */
  task: string;
  /** one short line, only where the task alone doesn't say enough */
  note?: string;
  done?: (now: EditorState, then: EditorState) => boolean;
  /** whether the task can be tried at all; if not, `idle` is the heading */
  can?: (s: EditorState) => boolean;
  idle?: string;
}

const STEPS: Step[] = [
  { task: 'Welcome to TypeLab', note: 'Try the basics, one click each.' },
  { target: 'stage', side: 'right', category: 'style', label: 'Styles',
    task: 'Click a style to start from', done: (s, t) => s.styleId !== t.styleId },
  { target: 'type', side: 'bottom', category: 'style', label: 'Sample text',
    task: 'Type a word', done: (s, t) => !!s.custom.trim() && s.custom !== t.custom },
  { target: 'panel', side: 'left', category: 'style', label: 'Traits',
    task: 'Pick a trait, like Bold', note: 'Every style takes it on.', done: (s, t) => s.traits !== t.traits },
  { target: 'nav', side: 'right', label: 'Pages',
    task: 'Open another page', done: (s, t) => s.category !== t.category },
  { target: 'panel', side: 'left', category: 'weight', label: 'Controls',
    task: 'Drag a slider', done: (s, t) => s.params !== t.params },
  { target: 'stage', side: 'right', category: 'weight', label: 'Preview',
    task: 'Click a letter', done: s => !!s.inspect },
  { target: 'inspector', side: 'right', category: 'weight', inspector: 'open', label: 'Letter',
    task: 'Drag a part of the letter', done: (s, t) => s.params !== t.params },
  { target: 'scope', side: 'bottom', category: 'weight', inspector: 'open', label: 'Customize',
    task: 'Switch to Customize', note: 'Changes then reshape this letter alone.', done: s => s.scope === 'letter' },
  { target: 'inspector', side: 'right', category: 'weight', inspector: 'open', label: 'Customize',
    task: 'Drag a part again', note: 'Only this letter changes; Sync all puts it back in step.',
    done: (s, t) => s.scope === 'letter' && s.params.glyphs !== t.params.glyphs },
  { target: 'strip', side: 'top', category: 'weight', inspector: 'keep', label: 'Glyphs',
    task: 'Click another glyph', done: (s, t) => !!s.inspect && s.inspect !== t.inspect },
  { target: 'actions', side: 'bottom', inspector: 'keep', label: 'Undo, save, export',
    task: 'Undo your last change', note: 'Save and Export are up here too.', done: (s, t) => s.hi < t.hi, can: s => s.hi > 0, idle: 'Save and export up here' }
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
  return w > 0 && h > 0 ? { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) } : null;
}
const same = (a: Rect | null, b: Rect | null) => a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

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
  const [done, setDone] = useState<Set<number>>(() => new Set());
  const [can, setCan] = useState(true);
  const card = useRef<HTMLDivElement>(null), next = useRef<HTMLButtonElement>(null);
  const step = STEPS[i], last = i === STEPS.length - 1;

  // remember where the user was, and put them back when the tour ends
  const start = useRef((() => {
    const s = useEditor.getState();
    return { category: s.category, cards: s.cards, styleTab: s.styleTab, scope: s.scope, focus: document.activeElement as HTMLElement | null };
  })());
  const close = () => {
    markSeen();
    const s = start.current;
    if (useEditor.getState().inspect) actions.closeInspector();
    actions.setCategory(s.category);
    if (useEditor.getState().cards !== s.cards) actions.setCards(s.cards);
    actions.setStyleTab(s.styleTab);
    actions.setScope(s.scope);
    s.focus?.focus();
    onClose();
  };

  // the tour starts with every letter in sync, so customizing is a step of its own
  useEffect(() => { actions.setScope('all'); }, []);

  // set the stage for the step, then watch the editor for its task
  useEffect(() => {
    let s = useEditor.getState();
    if (s.exportOpen) actions.setExportOpen(false);
    if (step.inspector === 'open') { if (!s.inspect) actions.openInspector('R'); }
    else if (step.inspector !== 'keep' && s.inspect) actions.closeInspector();
    if (step.category === 'style' || (step.category && s.category === 'style')) actions.setCategory(step.category);
    if (step.category === 'style' && !s.cards) actions.setCards(true);
    if (step.target === 'panel' && step.category === 'style') actions.setStyleTab('adjust');
    s = useEditor.getState();
    setCan(!step.can || step.can(s));
    const then = s;
    const unsub = step.done && useEditor.subscribe(now => {
      if (step.done!(now, then)) setDone(d => (d.has(i) ? d : new Set(d).add(i)));
    });
    next.current?.focus();
    return () => { unsub?.(); };
  }, [step, i]);

  // follow the target as the editor moves around it (panels open, the inspector comes and goes)
  useEffect(() => {
    let raf = 0, cur: Rect | null = null;
    const tick = () => {
      const r = step.target ? measure(step.target) : null;
      if (!same(r, cur)) { cur = r; setRect(r); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  useLayoutEffect(() => {
    const c = card.current;
    if (c) setPos(place(rect, step.side ?? 'bottom', c.offsetWidth, c.offsetHeight));
  }, [rect, step, done, can]);

  const go = (d: number) => { if (i + d >= 0 && i + d < STEPS.length) setI(i + d); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      // arrows step the tour, unless they're moving a caret or a slider in the spotlight
      else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !isTyping(e.target) && (e.target as HTMLInputElement).type !== 'range') go(e.key === 'ArrowRight' ? 1 : -1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    // capture, so the editor's own Escape/arrow shortcuts stay quiet during the tour
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  });

  const ok = done.has(i), task = !!step.done && can;
  return (
    <div className="guide">
      {rect
        ? <>
            <div className="guide-spot" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
            {/* the spotlight is live; these hold the rest of the editor still */}
            <div className="guide-block" style={{ left: 0, top: 0, right: 0, height: rect.y }} />
            <div className="guide-block" style={{ left: 0, top: rect.y + rect.h, right: 0, bottom: 0 }} />
            <div className="guide-block" style={{ left: 0, top: rect.y, width: rect.x, height: rect.h }} />
            <div className="guide-block" style={{ left: rect.x + rect.w, top: rect.y, right: 0, height: rect.h }} />
          </>
        : <div className="guide-dim" />}
      <div ref={card} className="guide-card" role="dialog" aria-modal="false" aria-labelledby="guide-title"
        style={pos ?? { visibility: 'hidden' }}>
        {i > 0 && <div className="guide-step">{i}/{STEPS.length - 1}<span>{step.label}</span></div>}
        {/* the task is the heading; its circle fills in once it's done */}
        <h2 id="guide-title" className={task ? (ok ? 'guide-task done' : 'guide-task') : undefined} aria-live="polite">
          {task && (
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="7" />
              {ok && <path d="M4.8 8.2l2.2 2.2 4.2-4.6" />}
            </svg>
          )}
          <span>{can ? step.task : step.idle}{ok && <span className="sr"> — done</span>}</span>
        </h2>
        {step.note && can && <p>{step.note}</p>}
        <div className="guide-foot">
          {!last && <button className="btn ghost small" onClick={close}>Skip</button>}
          <span className="guide-grow" />
          {i > 1 && <button className="btn ghost small" onClick={() => go(-1)}>Back</button>}
          <button ref={next} className={task && !ok ? 'btn wait small' : 'btn primary small'} onClick={() => (last ? close() : go(1))}>
            {i === 0 ? 'Start' : last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
