/* The font grid behind a letter in the inspector: square cells in font units, anchored at the
   letter's origin on the baseline, finer as the letter is zoomed in. */
import { n1 } from '../lib/hooks';

const STEPS = [5, 10, 25, 50, 100, 250];

/** The grid step in font units at scale `sc`: the finest whose cells are still 10 px or more. */
export const gridStep = (sc: number) => STEPS.find(s => s * sc >= 10) ?? 500;

/** Grid lines over a W×H canvas whose font origin sits at (ox, oy), `sc` px per unit. Every line
    at a multiple of 100 units (or of 5 cells, once cells are that big) is drawn stronger. */
export function FontGrid({ W, H, sc, ox, oy }: { W: number; H: number; sc: number; ox: number; oy: number }) {
  const step = gridStep(sc), major = step < 100 ? 100 : step * 5;
  const lines: { d: string; major: boolean }[] = [];
  const x0 = Math.ceil(-ox / sc / step), x1 = Math.floor((W - ox) / sc / step);
  for (let i = x0; i <= x1; i++) { const x = n1(ox + i * step * sc); lines.push({ d: `M${x} 0V${H}`, major: (i * step) % major === 0 }); }
  const y0 = Math.ceil((oy - H) / sc / step), y1 = Math.floor(oy / sc / step);
  for (let j = y0; j <= y1; j++) { const y = n1(oy - j * step * sc); lines.push({ d: `M0 ${y}H${W}`, major: (j * step) % major === 0 }); }
  return (
    <g className="i-grid" aria-hidden="true" pointerEvents="none">
      <path d={lines.filter(l => !l.major).map(l => l.d).join('')} />
      <path className="major" d={lines.filter(l => l.major).map(l => l.d).join('')} />
    </g>
  );
}
