/* The two inputs every slider row uses: the 0..1 range and the number box typed over it. */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { rotationDeg } from '../../../shared/params';

/** The slider's value as a whole number from 0 to 100 (or a turn, in degrees from -180 to 180), typed over
    directly. Enter or leaving the box applies it (clamped to that range); Escape puts the old value back; the
    arrow keys step by 1, or 10 with Shift. */
export function NumberField({ value, label, onChange, degrees }: { value: number; label: string; onChange: (v: number) => void; degrees?: boolean }) {
  const [lo, hi] = degrees ? [-180, 180] : [0, 100];
  const shown = String(Math.round(degrees ? rotationDeg(value) : value * 100));
  const [draft, setDraft] = useState<string | null>(null);
  const apply = (text: string) => {
    setDraft(null);
    const n = Math.min(hi, Math.max(lo, Math.round(Number(text))));
    if (text.trim() !== '' && Number.isFinite(n) && String(n) !== shown) onChange(degrees ? n / 360 + 0.5 : n / 100);
  };
  return (
    <input className="ctl-num" type="text" inputMode="numeric" aria-label={`${label} value`} value={draft ?? shown}
      onFocus={e => e.target.select()}
      onChange={e => setDraft(e.target.value.replace(/[^0-9-]/g, '').slice(0, 4))}
      onBlur={e => apply(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') { setDraft(null); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const step = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
          apply(String(Number(draft ?? shown) + step));
        }
      }} />
  );
}

/** A 0..1 range input shown as whole steps from 0 to 100 (or `steps`). `onInput` fires while dragging; `onCommit` once on release (one undo step). */
export function Range({ value, label, onInput, onCommit, onReset, steps = 100 }: { value: number; label: string; onInput: (v: number) => void; onCommit: () => void; onReset: () => void; steps?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    const el = ref.current!, h = () => commit.current();
    el.addEventListener('change', h);
    return () => el.removeEventListener('change', h);
  }, []);
  return (
    <input ref={ref} type="range" min={0} max={steps} step={1} value={Math.round(value * steps)} aria-label={label}
      title="Double-click to reset" style={{ '--v': value } as CSSProperties}
      onChange={e => onInput(Number(e.target.value) / steps)} onDoubleClick={onReset} />
  );
}
