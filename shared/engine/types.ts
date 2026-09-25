/* Shared types for the TypeLab font engine. Coordinates are font units, y-up, baseline at y = 0. */

/** A point on an outline. Flags steer corner rounding in roundContour(). */
export interface Pt {
  x: number;
  y: number;
  /** sampled curve point: never treated as a corner */
  smooth?: boolean;
  /** never rounded */
  sharp?: boolean;
  /** forced corner radius (round terminals) */
  r?: number;
}

/** Point plus unit tangent. */
export interface Tangent extends Pt { tx: number; ty: number }

/**
 * Path command. Skeletons use ['M',x,y] ['L',x,y,opts?] ['C',x1,y1,x2,y2,x,y,opts?]
 * ['hv'|'vh',x,y,opts?] ['Z']; outlines use only M, L, C and Z.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Cmd = [string, ...any[]];

/** Affine transform [a,b,c,d,e,f]: x' = a x + c y + e, y' = b x + d y + f */
export type Mat = [number, number, number, number, number, number];

export interface HalfPlane { x: number; y: number; nx: number; ny: number }
export interface ClipBox { x0?: number; x1?: number; y0?: number; y1?: number; planes?: HalfPlane[] }

/** How a stroke ends: styled terminal, flat, cut along an axis, or joined to another stroke. */
export type EndType = 'flat' | 'term' | 'h' | 'v' | 'join';
/** Which side of a stroke end gets a serif ('a' = toward -x or -y). */
export type SerifSides = 'both' | 'a' | 'b' | null;
/** Stroke weight override: 0 = thin, 1 = thick. */
export type StrokeWeight = number | 'thin' | 'thick';

export interface StrokeOpts {
  s?: EndType;
  e?: EndType;
  part?: string;
  w?: StrokeWeight;
  /** taper factor at the start / end (1 = none) */
  ws?: number;
  we?: number;
  scale?: number;
  miter?: number;
  clip?: ClipBox;
  clipX?: ClipBox;
  counter?: boolean;
  serifS?: SerifSides;
  serifE?: SerifSides;
  serifScale?: number;
}

export interface SerifSpec { len: number; th: number; shape: string; angle: number }

/** What the stroke expander needs to know about the design. */
export interface PenCtx {
  thick: number;
  thin: number;
  stress: number;
  k: number;
  org: number;
  terminal: string;
  serif?: SerifSpec | null;
  /** hand-drawn irregularity (0..1) and a per-glyph phase for it */
  wobble?: number;
  seed?: number;
}

export interface StrokeEnd { x: number; y: number; dx: number; dy: number; t: number; type: EndType; which: 's' | 'e' }

export interface Mark { type: string; x: number; y: number; r?: number }
