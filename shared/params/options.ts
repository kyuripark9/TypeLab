/* The named choices a setting can take (stroke ends, serif shapes, fills, letter forms...), and their types.
   The values are stored in saved designs: renaming or dropping one needs a mapping in cleanValue (clean.ts, as for
   'outline-inline'), or those designs fall back to the default. Order matters where a list is read by position:
   the first of each TERMINAL_FORMS kind is its fallback (formOf) and the form the Stroke ends trait picks
   (traits.ts). */
export const TERMINALS = ['flat', 'round', 'sharp', 'angled', 'cut', 'tapered'] as const;
/** The forms each kind of stroke end comes in; the first is the kind's plain form, which a form of another kind falls back to (see formOf). */
export const TERMINAL_FORMS = {
  flat: ['plain', 'flared', 'scooped'], round: ['round', 'droplet', 'ball'], sharp: ['pointed', 'clipped'],
  angled: ['outer', 'inner'], cut: ['level', 'notched'], tapered: ['taper', 'brush']
} as const satisfies Record<(typeof TERMINALS)[number], readonly string[]>;
export type TerminalForm = (typeof TERMINAL_FORMS)[keyof typeof TERMINAL_FORMS][number];
/** Every form of stroke end, of whatever kind. */
export const TERMINAL_FORM_IDS = Object.values(TERMINAL_FORMS).flat() as readonly TerminalForm[];
/** The form stroke ends of kind `t` take: `form` when it is one of that kind's, else the kind's first. */
export const formOf = (t: Terminal, form: string): TerminalForm =>
  ((TERMINAL_FORMS[t] as readonly string[]).includes(form) ? form : TERMINAL_FORMS[t][0]) as TerminalForm;
/** The shape of the serifs. A diamond is the lozenge a broad pen leaves at the foot and head of a blackletter stem: the
    stem's end cut off on a slant, and a square stood on its corner there, reaching right at the foot and left at the head. */
export const SERIF_SHAPES = ['bracketed', 'unbracketed', 'slab', 'wedge', 'diamond'] as const;
/** How a serif finishes at its tips: cut square, rounded off, drawn out to a point, or cut on a slant. */
export const SERIF_TIPS = ['square', 'round', 'pointed', 'angled'] as const;
/** The underside of a serif: flat on its line, or cupped, arching up under the stroke so only its tips touch the line. */
export const SERIF_BASES = ['flat', 'cupped'] as const;
/** Which way the serifs on stems reach: both ways, to one hand only, or only into the letter or out of it. */
export const SERIF_SIDES = ['both', 'left', 'right', 'inside', 'outside'] as const;
/** The shape of the serifs that reach into the letter: the same as the rest, or one of their own. */
export const SERIF_INNERS = ['same', ...SERIF_SHAPES] as const;
/** What the letters are built from: solid ink, a wireframe of every stroke, a grid of pixels, dots or lines, ink with a
    line cut down its strokes (inline), the letter's hollow outline (outline), ink casting a shadow down to the right, a
    grid of hexagons (hex), dots that run together where they sit side by side (blobs), a printer's screen of dots
    as big as the ink round them (halftone), or drops of many sizes running together like a liquid (liquid). */
export const FILLS = ['solid', 'wire', 'pixels', 'dots', 'lines', 'inline', 'outline', 'shadow', 'hex', 'blobs', 'halftone', 'liquid'] as const;
/** The fills drawn on a grid (Metrics.cell): their Size sets the grid's, and Spread (dotGain) how far their cells spread. */
export const GRID_FILLS: readonly Fill[] = ['pixels', 'hex', 'dots', 'blobs', 'liquid', 'halftone', 'lines'];
/** The lowercase a: two storeys (bowl under a hook) or one (just a bowl). 'auto' lets the personality and cursive settings pick. */
export const STORIES = ['auto', 'double', 'single'] as const;
/** How a bowl meets its stem (b d p q g, the single-storey a): curving out of it, or square, its flat top and bottom running straight into it. */
export const BOWL_JOINS = ['curved', 'square'] as const;
/** The g: its descender hooks back under the bowl from a stem on the right (hook), drops from the left of the bowl and hooks out to the
    right (mirrored), or two storeys: a small bowl with an ear, linked to a loop under the baseline (double). */
export const G_FORMS = ['hook', 'mirrored', 'double'] as const;
/** Where the arm and leg of k and K meet: the leg springs from the arm, both meet at the stem, or both meet at the end of a short bar out from it. */
export const K_FORMS = ['arm', 'stem', 'bar'] as const;
/** The dots of i, j and the punctuation. 'auto' squares them unless Roundness or round stroke ends round them off. */
export const DOTS = ['auto', 'square', 'round'] as const;
/** I i J l: a plain stem, or bars: a flag at the top and a bar at the foot (I gets a bar at the top and foot, J one
    across the top). 'auto' gives a monospaced sans the bars. */
export const I_FORMS = ['auto', 'plain', 'bars'] as const;
/** Bowls and curves: oval (a circle, or a rounded square with Squareness), or box: straight sides
    meeting in corners that round on the outside and stay square on the inside. */
export const BOWL_FORMS = ['oval', 'box'] as const;
/** A V W and v w: symmetric, or with the right-hand side upright, the diagonal leaning on it (the A then has no crossbar),
    or arches with no diagonals at all: A and N an upturned U (A with a bar), M one with a stem down its middle, V a U,
    W a U with a stem up its middle. */
export const DIAGONALS = ['symmetric', 'upright', 'arch'] as const;
/** Where the strokes of A M N V W Z (and v w z) turn: in a sharp point, or in a round bend like bent wire. */
export const BENDS = ['sharp', 'round'] as const;
/** The Y and y: two arms forking off a stem, or a cup whose right side runs on down into a diagonal. */
export const Y_FORMS = ['forked', 'cup'] as const;
/** The tail of Q: crossing the bowl at the bottom right, running from inside the bowl into its bottom right corner, or
    sweeping out from under the bowl to the right, as in book type. */
export const Q_FORMS = ['crossing', 'inside', 'sweep'] as const;
/** The R: a leg from the bowl, or a loop: the bowl's lower bar stops short of the stem and turns back into the leg. */
export const R_FORMS = ['leg', 'loop'] as const;
/** The spine of s, S and $: a curve running corner to corner, or level between two tight turns, like two rounded boxes stacked. */
export const S_FORMS = ['curved', 'flat'] as const;
/** The foot of the a: a plain stem, or a spur running out to the right along the baseline. */
export const A_FORMS = ['plain', 'spur'] as const;
/** The top of the A: its diagonals meeting in a peak, or under a serif laid across it, as in Clarendons and Latin
    display types (drawn while the serifs are on). */
export const APEX_FORMS = ['plain', 'serif'] as const;
/** The middle of the M: its diagonals meeting on the baseline, or raised, meeting a quarter of the way up. */
export const M_FORMS = ['full', 'raised'] as const;
/** The J: its foot hooking out to the left, or a cup whose left side rises half the cap height, its end serifed inward
    while the serifs are on. */
export const J_FORMS = ['hook', 'cup'] as const;
/** What the letters are built from: strokes drawn along a skeleton, solid blocks (see BLOCK_FORMS), or arcs cut from
    one circle (arcs.ts). */
export const BUILDS = ['strokes', 'blocks', 'arcs'] as const;
/** Which block letters Blocks builds: plain block letters with a real lowercase (basic-blocks.ts), solid blocks with
    their counters cut in as slots, after a 70s poster face, the lowercase as small capitals (blocks.ts), or letters of
    cells on a grid five high, every corner round and the empty cells round nodes (grid-blocks.ts). */
export const BLOCK_FORMS = ['basic', 'slots', 'grid'] as const;
/** A letter as drawn, or mirrored left to right (a reversed e). */
export const MIRRORS = ['normal', 'mirrored'] as const;
/** Curved stroke ends: stop part way round the curve, or turn onto the nearest level or plumb line and run straight out. */
export const TERMINAL_RUNS = ['curved', 'straight'] as const;
/** Where a crossbar's Gap opens: at its ends, the bar stopping short of the strokes it meets, or above and below it, the bar
    running on through those strokes to their outside edges and the strokes cut across a gap from it (a stencil A). */
export const BAR_ENDS = ['short', 'through'] as const;
export type Terminal = (typeof TERMINALS)[number];
export type SerifShape = (typeof SERIF_SHAPES)[number];
export type SerifTip = (typeof SERIF_TIPS)[number];
export type SerifBase = (typeof SERIF_BASES)[number];
export type SerifSide = (typeof SERIF_SIDES)[number];
export type SerifInner = (typeof SERIF_INNERS)[number];
export type Fill = (typeof FILLS)[number];
export type Story = (typeof STORIES)[number];
export type BowlJoin = (typeof BOWL_JOINS)[number];
export type GForm = (typeof G_FORMS)[number];
export type KForm = (typeof K_FORMS)[number];
export type Dots = (typeof DOTS)[number];
export type IForm = (typeof I_FORMS)[number];
export type SForm = (typeof S_FORMS)[number];
export type AForm = (typeof A_FORMS)[number];
export type ApexForm = (typeof APEX_FORMS)[number];
export type MForm = (typeof M_FORMS)[number];
export type JForm = (typeof J_FORMS)[number];
export type TerminalRun = (typeof TERMINAL_RUNS)[number];
export type BarEnds = (typeof BAR_ENDS)[number];
export type Build = (typeof BUILDS)[number];
export type BlockForm = (typeof BLOCK_FORMS)[number];
export type Mirror = (typeof MIRRORS)[number];
export type BowlForm = (typeof BOWL_FORMS)[number];
export type Diagonals = (typeof DIAGONALS)[number];
export type Bends = (typeof BENDS)[number];
export type YForm = (typeof Y_FORMS)[number];
export type QForm = (typeof Q_FORMS)[number];
export type RForm = (typeof R_FORMS)[number];
