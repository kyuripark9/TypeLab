/* Text set in the letters the engine builds from a style's settings, for a style no font stands behind (one built
   from blocks): its card on the Style page draws it so, where every other style shows its font as a web font. It is sized as that text is: `size` px to the em (the engine's 1000 units), lines LINE em
   apart, each line's letters centred in it as the browser centres a font's. */
import { memo } from 'react';
import type { Params } from '../../shared/params';
import { n1, useSize } from '../lib/hooks';
import { fontFor } from '../state/editor';

/** Line height, in ems: .card-free's in styles.css. */
const LINE = 1.3;

/** `text` in the letters `params` build, wrapped to the box's width (smaller than `size`, to half of it, only where a
    word is wider than the box) and cut after `lines` lines if given (the grid's cards). Hidden from screen readers,
    as a sample. */
export const BuiltText = memo(function BuiltText({ params, text, size, lines: most, className }: {
  params: Params; text: string; size: number; lines?: number; className: string;
}) {
  const [ref, box] = useSize<HTMLSpanElement>(), f = fontFor(params);
  const top = Math.max(f.m.asc, f.m.cap), bottom = -f.m.desc;
  // wrapped, smaller where the longest word would overrun the box (blocks are wide: a long word on a phone), down to
  // half the size, past which the word breaks as the browser breaks a font's
  const longest = Math.max(1, ...text.split(/\s+/).map(w => f.layout(w, Infinity)[0]?.width ?? 0));
  const sc = Math.max(size / 2000, Math.min(size / 1000, box.width * 0.99 / longest));
  let lines = box.width ? f.layout(text, box.width / sc) : [];
  // each line's box, and the baseline in it (font units)
  const LH = LINE * 1000, base = (LH - top - bottom) / 2 + top;
  if (most) lines = lines.slice(0, most);
  const W = box.width, H = n1(lines.length * LH * sc);
  return (
    <span ref={ref} className={`${className} built`} aria-hidden="true">
      {lines.length > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <g transform={`scale(${sc})`}>
            {lines.map((ln, i) => ln.items.map((it, j) => {
              const g = f.glyph(it.ch);
              return g && <path key={`${i}-${j}`} d={g.d} transform={`translate(${n1(it.x)},${n1(i * LH + base)})`} />;
            }))}
          </g>
        </svg>
      )}
    </span>
  );
});
