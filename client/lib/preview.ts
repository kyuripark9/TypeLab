import { useMemo } from 'react';
import { TEXTS } from '../../shared/content';
import type { Font, Glyph, Line } from '../../shared/engine';
import { useEditor } from '../state/editor';

export interface Block { text: string; size: number }

/** What to set: the typed text, or the default sentence while the field is empty. */
export const sampleText = (custom: string) => custom.trim() ? custom : TEXTS.sentence;

export function useBlocks() {
  const custom = useEditor(s => s.custom), size = useEditor(s => s.size);
  return useMemo((): Block[] => [{ text: sampleText(custom), size }], [custom, size]);
}

/** Characters on screen right now: these get rebuilt first while a slider moves. */
export function useVisibleChars() {
  const blocks = useBlocks(), inspect = useEditor(s => s.inspect);
  return useMemo(() => {
    const set = new Set(blocks.map(b => b.text).join(''));
    if (inspect) set.add(inspect);
    return set;
  }, [blocks, inspect]);
}

/** The box a glyph's ink fills, in font units (y up), which a swash or a long tail takes well past its advance. */
const inks = new WeakMap<Glyph, { x0: number; x1: number; y0: number; y1: number }>();
export function ink(g: Glyph) {
  let b = inks.get(g);
  if (!b) {
    b = { x0: 0, x1: g.adv, y0: 0, y1: 0 };
    for (const c of g.cmds) for (let i = 1; i + 1 < c.length && typeof c[i] === 'number'; i += 2) {
      b.x0 = Math.min(b.x0, c[i]); b.x1 = Math.max(b.x1, c[i]); b.y0 = Math.min(b.y0, c[i + 1]); b.y1 = Math.max(b.y1, c[i + 1]);
    }
    inks.set(g, b);
  }
  return b;
}

/** How far the ink of `lines` reaches out of their box (font units): left of the start, right of `width`,
    above the first line's `top` and below the last line's `bottom` (both measured from its baseline). */
export function overhang(font: Font, lines: Line[], width: number, top: number, bottom: number) {
  const o = { l: 0, r: 0, t: 0, b: 0 };
  lines.forEach((ln, i) => {
    for (const it of ln.items) {
      const g = font.glyph(it.ch);
      if (!g) continue;
      const b = ink(g);
      o.l = Math.max(o.l, -(it.x + b.x0));
      o.r = Math.max(o.r, it.x + b.x1 - width);
      if (i === 0) o.t = Math.max(o.t, b.y1 - top);
      if (i === lines.length - 1) o.b = Math.max(o.b, -b.y0 - bottom);
    }
  });
  return o;
}
