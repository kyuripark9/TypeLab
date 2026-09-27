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

/** The finer shape of each kind of terminal, in stroke widths unless noted. */
export interface TermSpec {
  /** flat: thickness at the very end, 1 = none */ flare: number;
  /** rounded: corner radius */ round: number;
  /** sharp: how far the point reaches past the end, and how far across it sits (+ toward the outer edge) */ point: number; lean: number;
  /** angled: how far the outer edge runs on past the inner */ slope: number;
  /** cut: turn of the cut off the axis, in radians (+ counterclockwise) */ tilt: number;
  /** tapered: thickness at the tip, and taper length in stroke widths */ tip: number; taper: number;
}

/** What the stroke expander needs to know about the design. */
export interface PenCtx {
  thick: number;
  thin: number;
  stress: number;
  k: number;
  org: number;
  terminal: string;
  /** the finer shape of the picked terminal (see TermSpec); missing draws them as usual */
  term?: TermSpec;
  serif?: SerifSpec | null;
  /** curves become straight segments with cut corners (0..1) */
  chamfer?: number;
  /** strokes thin out where they join another (0..1) */
  joints?: number;
  /** reverse contrast: horizontals thick, verticals thin (0..1) */
  reverse?: number;
  /** hand-drawn irregularity (0..1) and a per-glyph phase for it */
  wobble?: number;
  seed?: number;
}

export interface StrokeEnd { x: number; y: number; dx: number; dy: number; t: number; type: EndType; which: 's' | 'e' }

/** A point of interest on a glyph. Terminals carry their end's id (see isEndId in params), and
    `hook` when the end is the tip of a hook, tail or cursive stroke, which the stroke end length leaves alone,
    and `home`, where the end sits before its own length and curl move it. */
export interface Mark { type: string; x: number; y: number; r?: number; id?: string; hook?: boolean; home?: { x: number; y: number } }
