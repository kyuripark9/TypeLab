/* The handles on the editor's panel borders: drag one to widen or narrow the category nav or the settings
   panel, or to raise or lower the glyph strip; double-click to put it back. A size set here lasts between
   visits. While dragging, the size is written straight to a CSS variable on the editor, so only the layout
   reflows, not React. */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

type Side = 'nav' | 'panel' | 'strip';

interface SideSpec {
  min: number;
  max: number;
  label: string;
  /** the CSS variable holding the size */
  prop: string;
  /** which way the border moves: x for the columns, y for the strip */
  axis: 'x' | 'y';
  /** +1 when moving the border toward +axis grows the panel (the nav), -1 when it shrinks it */
  dir: 1 | -1;
}
const SIDES: Record<Side, SideSpec> = {
  nav: { min: 160, max: 320, label: 'Resize the category list', prop: '--nav-w', axis: 'x', dir: 1 },
  panel: { min: 300, max: 560, label: 'Resize the settings panel', prop: '--panel-w', axis: 'x', dir: -1 },
  strip: { min: 76, max: 220, label: 'Resize the glyph strip', prop: '--strip-h', axis: 'y', dir: -1 },
};
/** the stage keeps at least this much room between the panels */
const STAGE_MIN = { x: 480, y: 300 };
const STEP = 16;
const key = (side: Side) => `typelab.size.${side}`;

function stored(side: Side): number | null {
  try { const v = Number(localStorage.getItem(key(side))); return v > 0 ? v : null; } catch { return null; }
}
function store(side: Side, v: number | null) {
  try { if (v == null) localStorage.removeItem(key(side)); else localStorage.setItem(key(side), String(v)); } catch { /* private mode: the size lasts this visit */ }
}

export function Resizer({ side }: { side: Side }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() => stored(side));
  const [dragging, setDragging] = useState(false);
  const { min, max, label, prop, axis, dir } = SIDES[side];

  const editor = () => ref.current?.closest<HTMLElement>('.editor') ?? null;
  const rect = (s: string) => editor()?.querySelector<HTMLElement>(`:scope > .${s}`)?.getBoundingClientRect();
  const measure = () => (axis === 'x' ? rect(side)?.width : rect(side)?.height) ?? 0;
  const clampSize = (v: number) => {
    const el = editor();
    // everything else on the same axis: the other column, or the header above the stage
    const others = axis === 'x' ? rect(side === 'nav' ? 'panel' : 'nav')?.width ?? 0 : rect('top')?.height ?? 0;
    const room = (el ? (axis === 'x' ? el.clientWidth : el.clientHeight) : Infinity) - others - STAGE_MIN[axis];
    return Math.round(Math.max(min, Math.min(v, max, room)));
  };
  const apply = (v: number | null) => {
    const el = editor();
    if (!el) return;
    if (v == null) el.style.removeProperty(prop); else el.style.setProperty(prop, `${v}px`);
  };
  const commit = (v: number | null) => { apply(v); setSize(v); store(side, v); };

  useEffect(() => { apply(size); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the stored size, once

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget, at = (ev: { clientX: number; clientY: number }) => (axis === 'x' ? ev.clientX : ev.clientY);
    const p0 = at(e), v0 = measure();
    let v = v0;
    handle.setPointerCapture(e.pointerId);
    setDragging(true);
    document.body.classList.add('resizing', axis);
    const move = (ev: PointerEvent) => { v = clampSize(v0 + dir * (at(ev) - p0)); apply(v); };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing', axis);
      setDragging(false);
      if (v !== v0) commit(v);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    // arrows move the border itself, so → widens the nav but narrows the panel, and ↑ raises the strip
    const toward = e.key === (axis === 'x' ? 'ArrowRight' : 'ArrowDown') ? 1 : e.key === (axis === 'x' ? 'ArrowLeft' : 'ArrowUp') ? -1 : 0;
    if (toward) { e.preventDefault(); commit(clampSize(measure() + toward * dir * STEP)); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); commit(clampSize(e.key === 'Home' ? min : max)); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(null); }
  };

  return (
    <div ref={ref} className={`resizer resize-${side}${dragging ? ' on' : ''}`} role="separator" aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={size ?? undefined} tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown} onDoubleClick={() => commit(null)} onKeyDown={onKeyDown} />
  );
}
