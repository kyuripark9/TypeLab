/* Every glyph is defined once here as <path id="g65">, and the preview and glyph strip
   reuse it with <use href="#g65">. A parameter change then only rewrites these paths.
   Glyphs on screen update immediately; the rest follow in a deferred (interruptible) render,
   so dragging a slider stays smooth. */
import { useDeferredValue } from 'react';
import { ALL_CHARS } from '../../shared/engine';
import { hlKeyOf, useEditor, useFont } from '../state/editor';
import { useVisibleChars } from '../lib/preview';

const CHARS = [...ALL_CHARS];

export function GlyphDefs() {
  const font = useFont();
  const lazyFont = useDeferredValue(font);
  const hl = useEditor(hlKeyOf);
  const visible = useVisibleChars();
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {CHARS.map(ch => {
          const c = ch.charCodeAt(0), on = visible.has(ch);
          const g = (on ? font : lazyFont).glyph(ch);
          return (
            <g key={c}>
              <path id={`g${c}`} d={g?.d} />
              {on && hl && <path id={`h${c}`} d={font.hl(ch, hl)} />}
            </g>
          );
        })}
      </defs>
    </svg>
  );
}
