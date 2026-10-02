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
  /** a square step this wide cut out of the corner instead of rounding it (see roundContour) */
  step?: number;
}

/** Point plus unit tangent. */
export interface Tangent extends Pt { tx: number; ty: number }

/** The outline's corner radii where a centerline turns: outside and inside the turn (0 = sharp). A
    path command carries it as its `turn` option, for the turn at its start. */
export interface TurnR { o: number; i: number;
  /** a square step cut out of the outside instead, this share of as deep as it can be */ step?: number }

/**
 * Path command. Skeletons use ['M',x,y] ['L',x,y,opts?] ['C',x1,y1,x2,y2,x,y,opts?]
 * ['hv'|'vh',x,y,opts?] ['Z']; outlines use only M, L, C and Z. A command's weight `w` eases in from
 * its ends, unless it is `even` (the pieces of a curl, each carrying on the weight of the one before).
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
  /** how far along a side that runs on to the stroke's end its turn may round, as a share of it:
      by default nearly all of it, short of a stroke's width */
  endRoom?: number;
  clip?: ClipBox;
  clipX?: ClipBox;
  counter?: boolean;
  serifS?: SerifSides;
  serifE?: SerifSides;
  serifScale?: number;
}

/** A serif's finer shape is optional: left out, it is bracketed as usual, square at its tips, flat underneath,
    the same both ways and the same length everywhere. */
export interface SerifSpec {
  len: number; th: number; shape: string; angle: number;
  /** bracketed: how far up the stroke the curve runs, in serif lengths */ bracket?: number;
  /** how the tips finish (see SERIF_TIPS in params) */ tip?: string;
  /** round tips: the corner radius, as a share of the tip's thickness (0.5 a half circle) */ tipRound?: number;
  /** angled tips: how far the cut leans, in tip thicknesses: + runs the foot of the tip further out, - its top */ tipSlant?: number;
  /** cupped: how high the base arches, as a share of the most it can (see serifCup) */ cup?: number;
  /** serifs on stems: -1 to 1, longer toward -x or toward +x */ balance?: number;
  /** serifs on stems: the sides they reach to (see SERIF_SIDES in params) */ sides?: string;
  /** serifs on stems, where the ones that reach into the letter differ from the rest: their shape and thickness,
      and their length against the others */ inner?: { shape: string; th: number; len: number } | null;
  /** the length of serifs on top of stems, and on the ends of arms, against the ones at the foot */ tops?: number; arms?: number;
  /** serifs on the ends of arms: their thickness against the others, and how far they lean out from upright, in
      radians (- in under the arm); a leaning one is cut square across at its tip */ armTh?: number; armLean?: number;
}

/** The finer shape of each kind of terminal, in stroke widths unless noted. */
export interface TermSpec {
  /** which form of the picked kind (see TERMINAL_FORMS in params) */ form: string;
  /** flared: thickness at the very end, 1 = none */ flare: number;
  /** scooped and notched: how far the end is hollowed back */ depth: number;
  /** droplet and ball: radius of the drop */ size: number;
  /** clipped: the share of the point cut off */ clip: number;
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
  /** strokes thin toward the level line at y, by `amount` there (1 to a point), back to their full
      weight `reach` above and below it */
  pinch?: { y: number; amount: number; reach: number };
  /** hand-drawn irregularity (0..1) and a per-glyph phase for it */
  wobble?: number;
  seed?: number;
}

export interface StrokeEnd { x: number; y: number; dx: number; dy: number; t: number; type: EndType; which: 's' | 'e' }

/** A point of interest on a glyph. Terminals, and plain ends (type 'end': free stroke ends that
    aren't styled terminals), carry their end's id (see isEndId in params), and
    `hook` when the end is the tip of a hook, tail or cursive stroke, which the stroke end length leaves alone,
    and `home`, where the end sits before its own length and curl move it. */
export interface Mark { type: string; x: number; y: number; r?: number; id?: string; hook?: boolean; home?: { x: number; y: number };
  /** a corner's roundness as drawn, on the scale of its own control (see params): a turn's outside */ v?: number;
  /** a turn's inside roundness as drawn */ vi?: number;
  /** a corner's step as drawn, on the scale of Steps (0 when none; missing where a corner can't have one, a join) */ st?: number;
  /** a join (type 'join'): the way its gap opens, away from the stroke it meets; `v` is its gap as drawn, on its own Gap scale */ dx?: number; dy?: number }
