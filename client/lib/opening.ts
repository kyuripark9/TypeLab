/* What the opening title card (components/Intro.tsx) holds back in the app under it while it plays, where none of it
   shows: the Style page's web fonts until its scramble has settled (fetched alongside its own, they shared the line,
   and on a slower connection the card gave up waiting and showed the wordmark alone; landing as it spun, each had the
   page laid out again under it and its frames came late), and the editor's letters until the card lets go of them
   (GlyphDefs: a design's letters take a second or more to build on a slower computer, and the card's steps stood
   still meanwhile). HOLD_MAX lets go of both should the card never do. */
import { useSyncExternalStore } from 'react';

const HOLD_MAX = 10_000;
let holds = false, fontsIn = () => {};
const fontsCame = new Promise<void>(resolve => { fontsIn = resolve; });
const listeners = new Set<() => void>();

/** The card is to play: hold both back. Called before the app first renders. */
export function holdForOpening() {
  holds = true;
  setTimeout(letGo, HOLD_MAX);
}

/** The card's scramble has settled: the Style page's fonts may come. */
export const openingFontsIn = () => fontsIn();

/** The card is done with the app's time: its letters may be built. */
export function letGo() {
  fontsIn();
  if (!holds) return;
  holds = false;
  listeners.forEach(l => l());
}

/** Resolves once the card lets the Style page's fonts come, at once when it doesn't play. */
export const afterOpeningFonts = () => (holds ? fontsCame : Promise.resolve());

/** Whether the card holds the editor's letters back. */
export const useOpeningHolds = () => useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => holds);
