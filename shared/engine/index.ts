/* Public entry point of the font engine. Importing it registers every glyph: the letter files of the glyphs/ folder
   fill the glyph table (font.ts) as they load. buildFont finds no letters
   unless this file was imported, so code outside the engine imports shared/engine, not font.ts. */
import './glyphs';

export { ALL_CHARS, CHARSET, SLANT_PIVOT, buildFont, termSpec } from './font';
export { ACCENTED, accentGlyph } from './accents';
export type { AccentGlyph } from './accents';
export type { Font, Glyph, Line, LineItem } from './font';
export { autoIBars } from './glyphs/shared';
export { RING_KEYS } from './highlight';
export { freeFontsWanted } from './free-letters';
export { drawnFrom, drawnLetter } from './family-drawn';
export { buildSerif, expandStroke, serifCup, serifSides } from './stroke';
export { CIRCLE_K, applyM, clamp, cmdsBox, cmdsToD, ringsD, roundContour, signedArea } from './geom';
export type { Cmd, Mark, Pt } from './types';
export { forgetFreeFont, freeFont, onFreeFont, packNode, registerFreeFont } from './free';
export { skinFollows } from './skin';
export type { FreeFontData, PackedNode } from './free';
export { CORNER_KINDS, CORNER_MIN, cmdsContours, cornerRoom, cornerTurn, drawnCmds, fitOutline, hasIn, hasOut, segment } from './outline';
export type { CornerKind, Drawn, Node } from './outline';
export { combine, cutOut, shape, unite } from './boolean';
export { glyphGrid, gridGroups, gridOf, sameLine, sameRound } from './grid';
export type { GlyphGrid, GridArc, GridGroup, GridLine, GridRound } from './grid';
