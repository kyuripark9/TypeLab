/* The named choices a setting can take (stroke ends, serif shapes, fills, letter forms...), and their types. */
export const TERMINALS = ['flat', 'round', 'sharp', 'angled', 'cut', 'tapered'] as const;
/** The forms each kind of stroke end comes in; the first is the kind as it always looked. */
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
    line cut down its strokes (inline), the letter's hollow outline (outline), or ink casting a shadow down to the right. */
export const FILLS = ['solid', 'wire', 'pixels', 'dots', 'lines', 'inline', 'outline', 'shadow'] as const;
/** The lowercase a: two storeys (bowl under a hook) or one (just a bowl). 'auto' lets the personality and cursive settings pick. */
export const STORIES = ['auto', 'double', 'single'] as const;
/** How a bowl meets its stem (b d p q g, the single-storey a): curving out of it, or square, its flat top and bottom running straight into it. */
export const BOWL_JOINS = ['curved', 'square'] as const;
/** The g: its descender hooks back under the bowl from a stem on the right, or drops from the left of the bowl and hooks out to the right. */
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
/** The letters: built as print type, or written as a joined-up script's (see script.ts); auto writes them in a
    design that is more than half cursive. */
export const SCRIPT_FORMS = ['auto', 'print', 'script'] as const;
/** Flourishes on the script letters: none, or swashes (see script.ts): the capitals lead in from a wide loop, t's bar
    runs out and loops back over, l and d rise into flourishes, and the tails of r and z sweep away under the letters. */
export const FLOURISHES = ['plain', 'swash'] as const;
/** The spine of s, S and $: a curve running corner to corner, or level between two tight turns, like two rounded boxes stacked. */
export const S_FORMS = ['curved', 'flat'] as const;
/** The foot of the a: a plain stem, or a spur running out to the right along the baseline. */
export const A_FORMS = ['plain', 'spur'] as const;
/** What the letters are built from: strokes drawn along a skeleton, or solid blocks with their counters cut in as slots
    (see blocks.ts). Blocks draw the capitals, figures and punctuation; the lowercase are small capitals. */
export const BUILDS = ['strokes', 'blocks'] as const;
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
export type TerminalRun = (typeof TERMINAL_RUNS)[number];
export type BarEnds = (typeof BAR_ENDS)[number];
export type Build = (typeof BUILDS)[number];
export type Mirror = (typeof MIRRORS)[number];
export type BowlForm = (typeof BOWL_FORMS)[number];
export type Diagonals = (typeof DIAGONALS)[number];
export type Bends = (typeof BENDS)[number];
export type YForm = (typeof Y_FORMS)[number];
export type QForm = (typeof Q_FORMS)[number];
export type RForm = (typeof R_FORMS)[number];
export type ScriptForm = (typeof SCRIPT_FORMS)[number];
export type Flourish = (typeof FLOURISHES)[number];
