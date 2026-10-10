/* Small browser helpers: n1 rounds a coordinate to one decimal, which keeps SVG attributes short,
   useSize tracks an element's size, and isTyping tells keyboard shortcuts to stand aside in text fields. */
import { useCallback, useRef, useState } from 'react';

export const n1 = (v: number) => Math.round(v * 10) / 10;

/** Tracks an element's client size. Attach the returned callback ref. */
export function useSize<T extends HTMLElement>(): [(el: T | null) => void, { width: number; height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect();
    if (!el) return;
    const measure = () => setSize(s => (s.width === el.clientWidth && s.height === el.clientHeight ? s : { width: el.clientWidth, height: el.clientHeight }));
    ro.current = new ResizeObserver(measure);
    ro.current.observe(el);
    measure();
  }, []);
  return [ref, size];
}

/** True when a keyboard event is aimed at a text field (so shortcuts should stand aside). */
export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button'].includes(t.type));

