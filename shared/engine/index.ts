/* Public entry point of the font engine. Importing it registers every glyph. */
import './glyphs';
import './script';
import './swash';

export { ALL_CHARS, CHARSET, RING_KEYS, buildFont, freeFontsWanted, hasGlyph, resolve, scriptForms, termSpec } from './font';
export type { Effective, Font, Glyph, GlyphStroke, Line, LineItem, Metrics } from './font';
export { buildSerif, expandStroke, serifCup, serifSides } from './stroke';
export { applyM, clamp, cmdsToD, ringsD, roundContour, signedArea } from './geom';
export type { Cmd, Mark, Pt } from './types';
export { freeFont, onFreeFont, packNode, registerFreeFont } from './free';
export type { FreeFont, FreeFontData, PackedNode } from './free';
export { drawnCmds, fitOutline, hasIn, hasOut, segment, tidy } from './outline';
export type { Drawn, Node } from './outline';
export { glyphGrid, gridGroups, gridOf } from './grid';
export type { GlyphGrid, GridGroup, GridKind, GridLine, GridRound, GridSet } from './grid';
