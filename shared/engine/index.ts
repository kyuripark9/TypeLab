/* Public entry point of the font engine. Importing it registers every glyph. */
import './glyphs';

export { ALL_CHARS, CHARSET, RING_KEYS, buildFont, hasGlyph, resolve, termSpec } from './font';
export type { Effective, Font, Glyph, GlyphStroke, Line, LineItem, Metrics } from './font';
export { buildSerif, expandStroke } from './stroke';
export { applyM, clamp, cmdsToD, ringsD, roundContour, signedArea } from './geom';
export type { Cmd, Mark, Pt } from './types';
export { drawnCmds, fitOutline, hasIn, hasOut, segment, tidy } from './outline';
export type { Drawn, Node } from './outline';
export { glyphGrid, gridGroups, gridOf } from './grid';
export type { GlyphGrid, GridGroup, GridKind, GridLine, GridRound, GridSet } from './grid';
