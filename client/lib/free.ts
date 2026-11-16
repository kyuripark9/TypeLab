/* TypeLab's own fonts as web fonts in the browser (which font each style names: shared/free-fonts.ts): the style
   cards set a style's name in its font, a source style's immutable neutral preview or an own font's OpenType file
   from the server (server/free-fonts.ts). A design's letters themselves come with its source (lib/sources.ts). */
import { useEffect, useState } from 'react';
import { fontFileUrl, fontId, parseFontId, type FreeFontRef } from '../../shared/free-fonts';
import { previewFontUrl, type PreviewFontInfo } from '../../shared/source/preview-catalog';
import { afterOpeningFonts } from './opening';

/* ---- web fonts, for showing a style's free font on its card */

const linked = new Map<string, Promise<boolean>>();
export type WebFont = FreeFontRef | PreviewFontInfo;
/** The name a font is set in as a web font, kept apart from any font of that name on the computer. */
const webFamily = (r: WebFont) => 'digest' in r ? `TypeLab Preview ${r.digest}` : `TypeLab ${r.family}`;
/** The CSS font shorthand for a font at `px`. */
const fontSpec = (r: WebFont, px: number) => 'digest' in r ? `400 ${px}px '${webFamily(r)}'` : `${r.italic ? 'italic ' : ''}${r.weight} ${px}px '${webFamily(r)}'`;
/** The inline style that sets text in a font. */
export const fontStyle = (r: WebFont) => ({ fontFamily: `'${webFamily(r)}', Manrope, sans-serif`,
  fontWeight: 'digest' in r ? 400 : r.weight, fontStyle: 'digest' in r || !r.italic ? 'normal' : 'italic',
  ...('digest' in r ? { letterSpacing: 0 } : {}) });
/** Where a font's web font comes from: a source's published preview, else the server's file of an own font. */
const webSource = (r: WebFont) => 'digest' in r ? previewFontUrl(r) : fontFileUrl(fontId(r));

/** Load a font's web font straight from its file, once the opening title card's fonts have come (lib/opening.ts).
    Resolves whether it came (text not
    set in it falls back to Manrope, the interface's face). */
export function loadWebFont(r: WebFont): Promise<boolean> {
  const src = webSource(r);
  let p = linked.get(src);
  if (!p) {
    p = afterOpeningFonts().then(() => new FontFace(webFamily(r), `url(${src})`, 'digest' in r
      ? { weight: '400', style: 'normal', ascentOverride: `${r.ascent / 10}%`, descentOverride: `${r.descent / 10}%`, lineGapOverride: '0%' }
      : { weight: String(r.weight), style: r.italic ? 'italic' : 'normal' }).load()
      .then(face => { document.fonts.add(face); return true; }, () => false));
    linked.set(src, p);
  }
  return p;
}

/** Whether a free font's web font has loaded, loading it. */
export function useWebFont(id: string | undefined, preview?: PreviewFontInfo): WebFont | null {
  const r = preview ?? (id ? parseFontId(id) : null), key = r ? webSource(r) : '';
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
/** Text width at 1px, using the SVG's untracked final advance when fitting a source card. */
export function textWidth(r: WebFont, text: string) {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * 0.5;
  ctx.font = fontSpec(r, 100);
  return ctx.measureText(text).width / 100 + ('digest' in r ? (r.endCorrections[text.at(-1) ?? ''] ?? 0) / 1000 : 0);
}
