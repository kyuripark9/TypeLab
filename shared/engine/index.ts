/* Public entry point of the font engine. Importing it registers every glyph. */
import './glyphs';

export { ALL_CHARS, CHARSET, RING_KEYS, buildFont, hasGlyph, resolve } from './font';
export type { Effective, Font, Glyph, GlyphStroke, Line, LineItem, Metrics } from './font';
export { buildSerif, expandStroke } from './stroke';
export { applyM, clamp, cmdsToD, ringsD, roundContour, signedArea } from './geom';
export type { Cmd, Mark, Pt } from './types';
