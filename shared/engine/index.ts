/* Public entry point of the font engine. Importing it registers every glyph. */
import './glyphs';
import './script';
import './swash';

export { ALL_CHARS, CHARSET, buildFont, scriptForms, termSpec } from './font';
export type { Font, Glyph, Line, LineItem } from './font';
export { RING_KEYS } from './highlight';
export { freeFontsWanted } from './free-letters';
export { buildSerif, expandStroke, serifCup, serifSides } from './stroke';
export { applyM, clamp, cmdsToD, ringsD, roundContour, signedArea } from './geom';
export type { Cmd, Mark, Pt } from './types';
export { freeFont, onFreeFont, packNode, registerFreeFont } from './free';
export { skinFollows } from './skin';
export type { FreeFontData, PackedNode } from './free';
export { drawnCmds, fitOutline, hasIn, hasOut, segment, tidy } from './outline';
export type { Drawn, Node } from './outline';
export { glyphGrid, gridGroups, gridOf } from './grid';
export type { GlyphGrid, GridGroup } from './grid';
