/* Every glyph is defined once here as <path id="g65"> (its char code), with the active control's highlight as
   <path id="h65"> for the characters on screen while the pointer is on the controls, for a moment (`faded`: the
   design then reads in plain ink, as it does at once when a value is changed). The preview, the glyph strip
   and the construction grid's bar reuse the glyph paths with <use href="#g65">, and the preview alone reuses the
   highlights (#h65), so a parameter change only rewrites these paths.
   Glyphs on screen update immediately; the rest follow in a deferred render, one glyph at a time so a new slider
   move can interrupt it, and dragging a slider stays smooth. While the opening title card is up none is built
   (lib/opening.ts): it covers them all, and building them stalled its steps. */
import { memo, useDeferredValue } from 'react';
import type { ControlKey } from '../../shared/content';
import { ALL_CHARS, type Font } from '../../shared/engine';
import { hlKeyOf, useEditor, useFont } from '../state/editor';
import { useOpeningHolds } from '../lib/opening';
import { useVisibleChars } from '../lib/preview';

const CHARS = [...ALL_CHARS];

/** One glyph's paths, on its own so the deferred render of those off screen can stop between glyphs for the next
    slider move. Without a `font` (while the opening card is up) it stays as it was drawn last, blank at first. */
const GlyphDef = memo(function GlyphDef({ ch, font, hl }: { ch: string; font: Font | null; hl: ControlKey | null }) {
  const c = ch.charCodeAt(0), g = font?.glyph(ch);
  return (
    <g>
      <path id={`g${c}`} d={g?.d} />
      {font && hl && <path id={`h${c}`} d={font.hl(ch, hl)} />}
    </g>
  );
}, (a, b) => a.ch === b.ch && (b.font === null || (a.font === b.font && a.hl === b.hl)));

export function GlyphDefs() {
  const font = useFont(), holds = useOpeningHolds();
  // (once the card lets go, those on screen are built at once and the rest follow in the deferred render)
  const lazyFont = useDeferredValue(holds ? null : font);
  const hl = useEditor(hlKeyOf);
  const visible = useVisibleChars();
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {CHARS.map(ch => {
          const on = visible.has(ch);
          return <GlyphDef key={ch.charCodeAt(0)} ch={ch} font={holds ? null : on ? font : lazyFont} hl={on ? hl : null} />;
        })}
      </defs>
    </svg>
  );
}
