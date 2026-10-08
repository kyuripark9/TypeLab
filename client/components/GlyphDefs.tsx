/* Every glyph is defined once here as <path id="g65">, and the preview and glyph strip
   reuse it with <use href="#g65">. A parameter change then only rewrites these paths.
   Glyphs on screen update immediately; the rest follow in a deferred render, one glyph at a time so a new slider
   move can interrupt it, and dragging a slider stays smooth. */
import { memo, useDeferredValue } from 'react';
import { ALL_CHARS, type Font } from '../../shared/engine';
import { hlKeyOf, useEditor, useFont } from '../state/editor';
import { useVisibleChars } from '../lib/preview';

const CHARS = [...ALL_CHARS];

/** One glyph's paths, on its own so the deferred render of those off screen can stop between glyphs for the next
    slider move. */
const GlyphDef = memo(function GlyphDef({ ch, font, hl }: { ch: string; font: Font; hl: string | null }) {
  const c = ch.charCodeAt(0), g = font.glyph(ch);
  return (
    <g>
      <path id={`g${c}`} d={g?.d} />
      {hl && <path id={`h${c}`} d={font.hl(ch, hl)} />}
    </g>
  );
});

export function GlyphDefs() {
  const font = useFont();
  const lazyFont = useDeferredValue(font);
  const hl = useEditor(hlKeyOf);
  const visible = useVisibleChars();
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {CHARS.map(ch => {
          const on = visible.has(ch);
          return <GlyphDef key={ch.charCodeAt(0)} ch={ch} font={on ? font : lazyFont} hl={on ? hl : null} />;
        })}
      </defs>
    </svg>
  );
}
