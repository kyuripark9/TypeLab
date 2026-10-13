/* What the two Histories share (the font's, FontHistory.tsx; a letter's, LetterHistory.tsx): when a change was made,
   the names of the settings it changed, how many rows draw their picture as a menu opens, and a menu kept inside the
   window. */
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { CONTROLS, SUBS, type ControlKey } from '../../shared/content';

/** When a change was made: the time today, the day and time before. */
export function when(t: number): string {
  const d = new Date(t), time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

/** The names of what a customized letter sets one by one (ID_KEYS), as the panel's lists of them name them. */
const EACH: Record<string, string> = {
  terminalEnds: 'Each end', terminalCurls: 'Each end’s curl', corners: 'Each corner', innerCorners: 'Each corner’s inside',
  cornerSteps: 'Each corner’s step', strokeWeights: 'Each stroke', joinGaps: 'Each join'
};
/** A setting's name as the panel shows it, or null for one no control shows (the free font and where it was picked,
    the personality macros). */
export const settingName = (k: string): string | null =>
  EACH[k] ?? CONTROLS[k as ControlKey]?.label ?? SUBS[k as keyof typeof SUBS]?.label ?? null;

/** Names, a few of them, then how many more. */
export const someOf = (names: string[]) => (names.length > 3 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', '));

/** How many of `count` rows draw their picture: a few as the menu opens, then a few more each frame, so it opens at once. */
export function useDrawnRows(count: number, first = 6, more = 3) {
  const [shown, setShown] = useState(first);
  useEffect(() => {
    if (shown > count) return;
    const id = requestAnimationFrame(() => setShown(n => n + more));
    return () => cancelAnimationFrame(id);
  }, [shown, count, more]);
  return shown;
}

/** A menu hung from the right of its button, kept inside the window: where its left side would run out (on phones),
    it moves right. */
export function useInWindow(menu: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = menu.current, out = el ? 8 - el.getBoundingClientRect().left : 0;
    if (el && out > 0) el.style.right = `${parseFloat(getComputedStyle(el).right) - out}px`;
  }, [menu]);
}
