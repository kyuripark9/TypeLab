/* Letters for the LinkedIn slides, drawn by TypeLab's own engine (not screenshots): a word in a card's font or the
   engine's letters, as an inline SVG whose baseline and cap height sit the same in every font, so rows and tiles
   line up. Run from the repository root with tools/node.sh (see build.mts). */
import { buildFont, styleParams, withSets } from '../../../tools/lib.ts';
import { DEFAULTS, type Params } from '../../../shared/params/index.ts';
import { STYLE_FONTS } from '../../../shared/free-fonts.ts';

/** A Style-page card's settings as the app starts them: in its own font, spaced as the font spaces itself. */
export async function card(id: string, sets: string[] = [], free = true): Promise<Params> {
  const own = free && !!STYLE_FONTS[id];
  let p = await styleParams(id, own);
  if (own) p = { ...p, letterSpacing: DEFAULTS.letterSpacing, wordSpacing: DEFAULTS.wordSpacing } as Params;
  return sets.length ? withSets(p, sets) : p;
}

export interface WordOpts {
  /** room above the baseline and below it, in cap heights */ top?: number; bot?: number;
  /** crop to the ink left and right (else the advance) */ tight?: boolean;
  cls?: string; style?: string;
  /** extra SVG drawn under the letters, in font units (y down) */ under?: (f: ReturnType<typeof buildFont>, x0: number) => string;
  over?: (f: ReturnType<typeof buildFont>, glyphs: Placed[]) => string;
}
export interface Placed { ch: string; x: number; g: NonNullable<ReturnType<ReturnType<typeof buildFont>['glyph']>> }

const r1 = (n: number) => +n.toFixed(1);

/** `text` set in `p`, `cap` px to the cap height, as an inline <svg> filled with currentColor. */
export function word(p: Params, text: string, cap: number, o: WordOpts = {}) {
  const f = buildFont(p);
  const [line] = f.layout(text, Infinity);
  const placed: Placed[] = [];
  let x0 = Infinity, x1 = -Infinity, body = '';
  for (const it of line?.items ?? []) {
    const lf = f.letter(it.ch), g = lf.glyph(it.ch);
    if (!g) continue;
    placed.push({ ch: it.ch, x: it.x, g });
    body += `<path transform="translate(${r1(it.x)} 0)" d="${g.d}"/>`;
    for (const c of g.cmds) for (let i = 1; i + 1 < c.length; i += 2) {
      const x = (c[i] as number) + it.x;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
    }
  }
  if (!o.tight || !isFinite(x0)) { x0 = 0; x1 = line?.width ?? 0; }
  const C = f.m.cap, top = (o.top ?? 1.2) * C, bot = (o.bot ?? 0.35) * C, s = cap / C;
  const w = (x1 - x0) * s, h = (top + bot) * s;
  const under = o.under ? o.under(f, x0) : '', over = o.over ? o.over(f, placed) : '';
  return {
    w, h,
    svg: `<svg class="w ${o.cls ?? ''}" style="${o.style ?? ''}" width="${r1(w)}" height="${r1(h)}" viewBox="${r1(x0)} ${r1(-top)} ${r1(x1 - x0)} ${r1(top + bot)}" overflow="visible" aria-hidden="true">${under}<g fill="currentColor">${body}</g>${over}</svg>`
  };
}

export { buildFont, withSets };

/** A design saved from the editor (Export: Design file, a .typelab.json), its settings read as the app reads them. */
import { readFileSync as readDesign } from 'node:fs';
import { sanitizeParams, upgradeParams } from '../../../shared/params/index.ts';
import { registerFreeFont } from '../../../shared/engine/free.ts';
import { freeFonts } from '../../../tools/lib.ts';
export async function design(file: string, sets: string[] = []): Promise<Params> {
  const j = JSON.parse(readDesign(file, 'utf8'));
  let p = sanitizeParams(upgradeParams(j.params, typeof j.version === 'number' ? j.version : 1));
  if (p.freeFont) registerFreeFont(await freeFonts().load(p.freeFont));
  return sets.length ? withSets(p, sets) : p;
}
