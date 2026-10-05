/* Free fonts in the browser (see shared/free-fonts.ts). A design written in one needs the font's letters
   before the engine can draw them: they come from the server, which fetches them from Google Fonts,
   and are registered with the engine. Until then the design's own letters stand in. The style cards
   and the finder show a style's free font as a web font instead, which is quicker to fetch. */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { freeFont, onFreeFont, registerFreeFont, type FreeFontData } from '../../shared/engine';
import { fontCss, parseFontId, type FreeFontRef } from '../../shared/free-fonts';

const loading = new Map<string, Promise<boolean>>();

/** Fetch and register a free font's letters. Resolves false when they couldn't be had (tried again
    after a minute). */
export function loadFreeFont(id: string): Promise<boolean> {
  if (freeFont(id)) return Promise.resolve(true);
  let p = loading.get(id);
  if (!p) {
    p = fetch(`/api/free-fonts/${encodeURIComponent(id)}`)
      .then(r => (r.ok ? r.json() as Promise<FreeFontData> : Promise.reject(new Error(String(r.status)))))
      .then(data => { registerFreeFont(data); return true; })
      .catch(() => { setTimeout(() => loading.delete(id), 60_000); return false; });
    loading.set(id, p);
  }
  return p;
}

let version = 0;
onFreeFont(() => { version++; });
/** Draw again once a free font's letters arrive (a component drawing designs other than the open one). */
export const useFreeFonts = () => useSyncExternalStore(onFreeFont, () => version);

/* ---- web fonts, for showing a style's free font on its card */

const linked = new Map<string, Promise<void>>();
/** The CSS font shorthand for a font at `px`. */
export const fontSpec = (r: FreeFontRef, px: number) => `${r.italic ? 'italic ' : ''}${r.weight} ${px}px '${r.family}'`;
/** The inline style that sets text in a font. */
export const fontStyle = (r: FreeFontRef) => ({ fontFamily: `'${r.family}', Inter, sans-serif`, fontWeight: r.weight, fontStyle: r.italic ? 'italic' : 'normal' });

/** Load a font's web font (its stylesheet from Google Fonts, then the font itself). */
export function loadWebFont(r: FreeFontRef): Promise<void> {
  const css = fontCss(r);
  let p = linked.get(css);
  if (!p) {
    p = new Promise<void>(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = css;
      link.onload = link.onerror = () => resolve();
      document.head.appendChild(link);
    }).then(() => document.fonts.load(fontSpec(r, 40)).then(() => undefined, () => undefined));
    linked.set(css, p);
  }
  return p;
}

/** Whether a free font's web font has loaded, loading it. */
export function useWebFont(id: string | undefined): FreeFontRef | null {
  const r = id ? parseFontId(id) : null, key = r ? fontCss(r) : '';
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    if (!r) return;
    let live = true;
    loadWebFont(r).then(() => { if (live) setReady(key); });
    return () => { live = false; };
    // the font is named by `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return r && ready === key ? r : null;
}

let ctx: CanvasRenderingContext2D | null = null;
/** How wide `text` is in a loaded web font, at 1px. */
export function textWidth(r: FreeFontRef, text: string) {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * 0.5;
  ctx.font = fontSpec(r, 100);
  return ctx.measureText(text).width / 100;
}
