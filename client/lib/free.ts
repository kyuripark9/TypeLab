/* Free fonts in the browser (which font each style names: shared/free-fonts.ts). A design written in one
   needs the font's letters before the engine can draw them: they come from the server (server/free-fonts.ts),
   which keeps TypeLab's own and fetches the rest from Google Fonts, and are registered with the engine
   (registerFreeFont in shared/engine/free.ts, which tells onFreeFont's listeners). Until then the design's own
   letters stand in. The style cards and the finder show a style's free font as a web font instead, which is
   quicker to fetch: an own font as the OpenType file the server builds from it, any other from Google Fonts. */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { freeFont, onFreeFont, registerFreeFont } from '../../shared/engine';
import { fontCss, fontFileUrl, fontId, isOwnFont, parseFontId, type FreeFontRef } from '../../shared/free-fonts';
import { api } from './api';

const loading = new Map<string, Promise<boolean>>();

/** Fetch and register a free font's letters. Resolves false when they couldn't be had (tried again
    after a minute). */
export function loadFreeFont(id: string): Promise<boolean> {
  if (freeFont(id)) return Promise.resolve(true);
  let p = loading.get(id);
  if (!p) {
    p = api.freeFont(id)
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

const linked = new Map<string, Promise<boolean>>();
/** The name a font is set in as a web font: an own font's is kept apart from any font of that name on the computer. */
const webFamily = (r: FreeFontRef) => (isOwnFont(r.family) ? `TypeLab ${r.family}` : r.family);
/** The CSS font shorthand for a font at `px`. */
const fontSpec = (r: FreeFontRef, px: number) => `${r.italic ? 'italic ' : ''}${r.weight} ${px}px '${webFamily(r)}'`;
/** The inline style that sets text in a font. */
export const fontStyle = (r: FreeFontRef) => ({ fontFamily: `'${webFamily(r)}', Inter, sans-serif`, fontWeight: r.weight, fontStyle: r.italic ? 'italic' : 'normal' });
/** Where a font's web font comes from: the server's file of an own font, else its stylesheet on Google Fonts. */
const webSource = (r: FreeFontRef) => (isOwnFont(r.family) ? fontFileUrl(fontId(r)) : fontCss(r));

/** Load a font's web font: an own font straight from its file, any other by its stylesheet from Google Fonts and then
    the font itself. Resolves whether it came (text not set in it falls back to Inter). */
function loadWebFont(r: FreeFontRef): Promise<boolean> {
  const src = webSource(r);
  let p = linked.get(src);
  if (!p) {
    p = isOwnFont(r.family)
      ? new FontFace(webFamily(r), `url(${src})`, { weight: String(r.weight), style: r.italic ? 'italic' : 'normal' }).load()
        .then(face => { document.fonts.add(face); return true; }, () => false)
      : new Promise<void>(resolve => {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = src;
        link.onload = link.onerror = () => resolve();
        document.head.appendChild(link);
      }).then(() => document.fonts.load(fontSpec(r, 40)).then(faces => faces.length > 0, () => false));
    linked.set(src, p);
  }
  return p;
}

/** A font's web font, loaded: the font once text can be set in it, or null when it couldn't be had (the opening
    title card's fonts, which the Style page's cards then find loaded). */
export function webFont(id: string): Promise<FreeFontRef | null> {
  const r = parseFontId(id);
  return r ? loadWebFont(r).then(ok => (ok ? r : null)) : Promise.resolve(null);
}

/** Whether a free font's web font has loaded, loading it. */
export function useWebFont(id: string | undefined): FreeFontRef | null {
  const r = id ? parseFontId(id) : null, key = r ? webSource(r) : '';
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    if (!r) return;
    let live = true;
    loadWebFont(r).then(() => { if (live) setReady(key); });
    return () => { live = false; };
    // keyed by `key`, the font's name: `r` is parsed anew each render
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
