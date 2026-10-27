/* Every letter of every source style at Contrast's ends against its own at the same weight and width (the default,
   and each end of Weight and Width): its pieces of ink and its holes, filled nonzero on a grid (`--res`, cells across the
   cap height, 160 by default; specks of under three cells left out). Prints the letters that differ, by style.
   node --import tsx tools/authored/review-contrast.ts [style ids] [--res 480] */
import { buildFont } from '../../shared/engine';
import { STYLES } from '../../shared/content/styles';
import type { Cmd } from '../../shared/engine/types';
import type { Params } from '../../shared/params';
import { sourceStyleParams } from '../../shared/source/style';
import { loadDesignSources } from '../../server/sources';
import { polys } from '../lib';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&?!@#$%()[]{}.,;:/';
const args = process.argv.slice(2), res = args.includes('--res') ? Number(args[args.indexOf('--res') + 1]) : 160;
const only = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--res')?.split(',');

/** The ink's pieces and holes (paper closed off from the edge) of an outline filled nonzero. */
function inkOf(cmds: Cmd[], cap: number): { pieces: number; holes: number } {
  const rings = polys(cmds, 8), k = res / cap;
  if (!rings.length) return { pieces: 0, holes: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const W = Math.ceil((x1 - x0) * k) + 4, H = Math.ceil((y1 - y0) * k) + 4, ink = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    const y = y0 + (j - 1.5) / k, hits: { x: number; w: number }[] = [];
    for (const r of rings) r.forEach((a, i) => {
      const b = r[(i + 1) % r.length];
      if ((a.y > y) !== (b.y > y)) hits.push({ x: a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y), w: b.y > a.y ? 1 : -1 });
    });
    hits.sort((a, b) => a.x - b.x);
    let wind = 0;
    for (let h = 0; h < hits.length - 1; h++) {
      wind += hits[h].w;
      if (!wind) continue;
      const from = Math.max(0, Math.round((hits[h].x - x0) * k + 1.5)), to = Math.min(W, Math.round((hits[h + 1].x - x0) * k + 1.5));
      for (let i = from; i < to; i++) ink[j * W + i] = 1;
    }
  }
  const seen = new Uint8Array(W * H);
  const count = (v: number) => {
    let n = 0;
    for (let start = 0; start < W * H; start++) {
      if (ink[start] !== v || seen[start]) continue;
      let size = 0, edge = false;
      const stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const at = stack.pop()!, x = at % W, y = (at - x) / W;
        size++;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          const t = ny * W + nx;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && ink[t] === v && !seen[t]) { seen[t] = 1; stack.push(t); }
        }
      }
      if (size >= 3 && (v === 1 || !edge)) n++;
    }
    return n;
  };
  return { pieces: count(1), holes: count(0) };
}

let total = 0;
for (const style of STYLES) {
  if (only && !only.includes(style.id)) continue;
  const p = sourceStyleParams(style);
  if (!p?.sourceProgram) continue;
  loadDesignSources(p);
  const found: string[] = [];
  for (const at of [{}, { weight: 0 }, { weight: 1 }, { width: 0 }, { width: 1 }]) {
    const own = buildFont({ ...p, ...at } as Params), cap = own.m.cap;
    for (const contrast of [0, 1]) {
      const font = buildFont({ ...p, ...at, contrast } as Params);
      for (const ch of CHARS) {
        const a = own.glyph(ch), b = font.glyph(ch);
        if (!a || !b) continue;
        const was = inkOf(a.cmds, cap), now = inkOf(b.cmds, cap);
        if (was.pieces !== now.pieces || was.holes !== now.holes) {
          found.push(`${ch} at ${contrast} ${JSON.stringify(at)}: pieces ${was.pieces}→${now.pieces}, holes ${was.holes}→${now.holes}`);
        }
      }
    }
  }
  total += found.length;
  console.log(`${style.id.padEnd(12)} ${found.length}${found.length ? '  ' + found.join(' | ') : ''}`);
}
console.log(`${total} letters differ`);
