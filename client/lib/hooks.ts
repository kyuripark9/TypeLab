/* Small browser helpers: n1 rounds a coordinate to one decimal, which keeps SVG attributes short,
   useSize tracks an element's size, isTyping tells keyboard shortcuts to stand aside in text fields,
   useEscape and useDismiss close dialogs and popovers, and DRAWER_QUERY is the width where the page menu
   becomes a drawer. */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

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

/** A dialog's Escape: it calls `onClose`, caught in the capture phase and stopped there, so the editor's own
    Escape (closing the inspector) stays quiet. The element in `first` takes the focus when the dialog opens,
    and the focus goes back where it was when it closes. */
export function useEscape(onClose: () => void, first?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const was = document.activeElement as HTMLElement | null;
    first?.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    addEventListener('keydown', onKey, true);
    return () => { removeEventListener('keydown', onKey, true); was?.focus?.(); };
  }, [onClose, first]);
}

/** A popover's dismissal: while `open`, a press anywhere outside `wrap` closes it, and so does Escape. With
    `claimEscape`, Escape is caught on the window in the capture phase and goes no further, so the editor's own
    Escape (closing the inspector) stays quiet; without, it closes the popover as it reaches the document and
    goes on to the rest. */
export function useDismiss(open: boolean, setOpen: (open: boolean) => void, wrap: RefObject<HTMLElement | null>, claimEscape = false) {
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (claimEscape) e.stopImmediatePropagation();
      setOpen(false);
    };
    const keys: Window | Document = claimEscape ? window : document;
    document.addEventListener('pointerdown', close);
    keys.addEventListener('keydown', esc as EventListener, claimEscape);
    return () => { document.removeEventListener('pointerdown', close); keys.removeEventListener('keydown', esc as EventListener, claimEscape); };
  }, [open, setOpen, wrap, claimEscape]);
}

/** The window width where the page menu turns into a drawer opened from the header: the same width as the
    `@media (max-width: 1180px)` block in styles.css, which lays the drawer out. */
export const DRAWER_QUERY = '(max-width: 1180px)';
