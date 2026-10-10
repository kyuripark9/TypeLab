/* Reading letters' outlines in the engine tests. A glyph's `d` is SVG path data, y flipped (down); its `cmds`,
   strokes, serifs, counters, skeleton and marks are font units, y up. */
import type { Cmd } from '../shared/engine';

/** In SVG path data: how many contours, how many curves, every x, and every y (y down). */
export const contours = (d: string) => d.split('M').length - 1;
export const curves = (d: string) => d.split('C').length - 1;
export const xsOf = (d: string) => [...d.matchAll(/[MLC]([^MLCZ]*)/g)].flatMap(m => m[1].trim().split(/\s+/).map(Number).filter((_, i) => i % 2 === 0));
export const ysOf = (d: string) => [...d.matchAll(/[MLC]([^MLCZ]*)/g)].flatMap(m => m[1].trim().split(/\s+/).map(Number).filter((_, i) => i % 2 === 1));
/** Every point SVG path data passes through (the ends of its lines and curves), back in font units (y up). */
export const pathPts = (d: string) => [...d.matchAll(/[MLC]([^MLCZ]*)/g)].flatMap(m => {
  const n = m[1].trim().split(/\s+/).map(Number), out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: -n[i + 1] });
  return out.slice(-1);
});
/** Every x and every y of outline commands (font units, y up), control points included. */
export const coords = (cmds: Cmd[]) => ({ xs: cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 0)) as number[], ys: cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 1)) as number[] });
