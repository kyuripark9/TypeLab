/* The design parameters a user edits. Every number is 0..1; the engine maps them to geometry. */
import { cleanDrawn, type Drawn } from './engine/outline';
import { parseFontId } from './free-fonts';

export const TERMINALS = ['flat', 'round', 'sharp', 'angled', 'cut', 'tapered'] as const;
/** The forms each kind of stroke end comes in; the first is the kind as it always looked. */
export const TERMINAL_FORMS = {
  flat: ['plain', 'flared', 'scooped'], round: ['round', 'droplet', 'ball'], sharp: ['pointed', 'clipped'],
  angled: ['outer', 'inner'], cut: ['level', 'notched'], tapered: ['taper', 'brush']
} as const satisfies Record<(typeof TERMINALS)[number], readonly string[]>;
export type TerminalForm = (typeof TERMINAL_FORMS)[keyof typeof TERMINAL_FORMS][number];
const FORM_IDS: readonly string[] = Object.values(TERMINAL_FORMS).flat();
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
export const G_FORMS = ['hook', 'mirrored'] as const;
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
/** The tail of Q: crossing the bowl at the bottom right, or running from inside the bowl into its bottom right corner. */
export const Q_FORMS = ['crossing', 'inside'] as const;
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

export interface Params {
  /** strokes or blocks (see BUILDS) */ build: Build;
  weight: number; width: number; height: number; slant: number;
  /** each letter turned about its own middle: 0.5 upright, lower anticlockwise and higher clockwise, half a turn at either end (see rotationDeg) */ rotation: number;
  /** thick and thin (see contrastOf): 0.5 as drawn, higher thins the horizontals against the stems,
      lower turns it round, to the mirror of 1 at 0 */ contrast: number;
  /** the vertical strokes alone (stems), and the horizontal ones alone (bars): 0.5 as Weight and
      Contrast make them, lower lighter, higher heavier */ vWeight: number; hWeight: number;
  /** one letter's strokes weighted one by one, by stroke id (see isStrokeId): 0.5 as drawn, lower lighter, higher heavier */ strokeWeights: Record<string, number>;
  xHeight: number; counter: number; aperture: number; crossbar: number;
  /** how far the crossbars stop short of the strokes they meet (e A H E F), 0 touching them (see joinGap), or with
      barEnds 'through', how far the strokes they run through are cut back above and below them (see barCut) */ barGap: number; barEnds: BarEnds;
  roundness: number; curve: number; apex: number; terminal: Terminal;
  /** how far stroke ends reach: 0.5 is the usual length, lower trims them back, higher draws them on */ terminalLength: number;
  /** one letter's ends set one by one, by end id (see isEndId): each overrides terminalLength for that end */ terminalEnds: Record<string, number>;
  /** how stroke ends bend: 0.5 as drawn, lower straightens them and then flares them out, higher
      curls them on round the way they turn */ terminalCurl: number;
  /** one letter's ends bent one by one, by end id: each overrides terminalCurl for that end */ terminalCurls: Record<string, number>;
  /** one letter's corners rounded one by one, by corner id (see isCornerId), from 0 sharp to 1 round;
      for a turn, its outside */ corners: Record<string, number>;
  /** one letter's turns rounded on the inside one by one, by turn id (see isTurnId), from 0 sharp to 1 round */ innerCorners: Record<string, number>;
  /** whether curved stroke ends follow the curve or run straight out (see TERMINAL_RUNS) */ terminalRun: TerminalRun;
  /** the form of the picked kind of stroke end (see TERMINAL_FORMS); one of another kind means its first */ terminalForm: TerminalForm;
  /* The finer shape of each form of stroke end. Each applies only while its form is picked, and
     its default draws the end as before. */
  /** flared: how much the end widens as it finishes */ terminalFlare: number;
  /** rounded: soft corners (0) to a full half circle (1) */ terminalRound: number;
  /** scooped and notched: how deep the end is hollowed */ terminalDepth: number;
  /** droplet and ball: how big the drop is */ terminalSize: number;
  /** sharp: how far the point reaches past the end, 0.5 as usual */ terminalPoint: number;
  /** clipped: how much of the point is cut off */ terminalClip: number;
  /** sharp: where the point sits across the end, 0 on the inner edge, 0.5 in the middle, 1 on the outer */ terminalLean: number;
  /** angled: how steeply the end is cut, 0.5 as usual */ terminalSlope: number;
  /** cut: the cut turned off level or plumb, 0.5 not at all */ terminalTilt: number;
  /** tapered: how fine the tip gets, 0.5 as usual */ terminalTip: number;
  /** tapered: how far back from the tip the taper starts, 0.5 as usual */ terminalTaper: number;
  /** hand-drawn irregularity */ wobble: number;
  /** strokes thin toward a level line, to a point at 1 (see pinchPos) */ pinch: number;
  /** the height of that line: 0 the baseline, 0.5 half the x-height, 1 the cap height */ pinchPos: number;
  /** a square step cut out of each corner of a letter (the turns of its strokes, and corners where two
      strokes end together, as at the foot of an L), from none to nearly the stroke's width */ steps: number;
  /** one letter's corners stepped one by one, by corner id (see isCornerId), each overriding steps */ cornerSteps: Record<string, number>;
  /** how round the inside corners of counters are, where strokes meet or turn, from 0 as the strokes
      draw them to 1, most of a cap height across, whatever the weight: light strokes fill in solid
      where the round leaves a square corner outside */ innerRound: number;
  /** capitals start with a curl: the top of the first stroke (the foot of an A, the left end of a T's
      bar) runs on and curls out into a flourish */ swash: number;
  /** the letter as drawn, or mirrored (see MIRRORS) */ mirror: Mirror;
  /** entry/exit strokes, looped descenders and italic letterforms */ cursive: number;
  /** round curves drawn as squircles */ squareness: number;
  /** curves replaced by straight, cut-off corners (octagonal) */ chamfer: number;
  /** strokes thin out where they join another stroke */ joints: number;
  /** length of ascenders and descenders */ extenders: number;
  /** descenders alone: 0.5 as long as the stem length makes them, lower shorter, higher longer */ descender: number;
  /** double- or single-storey a */ story: Story;
  /** how far a bowl sinks into its stem (b d p q): 1 branches out of it, 0 is a whole o beside it */ overlap: number;
  /** how bowls meet their stems (see BOWL_JOINS) */ bowlJoin: BowlJoin;
  /** the shape of the g (see G_FORMS) */ gForm: GForm;
  /** where the arm and leg of k and K meet (see K_FORMS) */ kForm: KForm;
  /** square or round dots (see DOTS) */ dots: Dots;
  /** how big the dots are: 0.5 as usual */ dotSize: number;
  /** plain I i J l, or with bars (see I_FORMS) */ iForm: IForm;
  /** the spine of s (see S_FORMS) */ sForm: SForm;
  /** the foot of the a (see A_FORMS) */ aForm: AForm;
  /** how round the inside corners are where one stroke meets another (see joinR), from 0 sharp;
      a letter can round each of them on its own (see isCornerId) */ joinRound: number;
  /** oval or box bowls (see BOWL_FORMS) */ bowlForm: BowlForm;
  /** box bowls: how far their corners round on the outside, from 0 sharp through one stroke wide (0.5) to two */ boxRound: number;
  /** symmetric A V W, with one side upright, or arches (see DIAGONALS) */ diagonals: Diagonals;
  /** sharp or round turns in A M N V W Z (see BENDS); Peaks sets how wide a round one is */ bends: Bends;
  /** the shape of the Y (see Y_FORMS) */ yForm: YForm;
  /** the tail of the Q (see Q_FORMS) */ qForm: QForm;
  /** the leg of the R (see R_FORMS) */ rForm: RForm;
  /** print or joined-up script letters (see SCRIPT_FORMS) */ scriptForm: ScriptForm;
  /** script letters plain or flourished (see FLOURISHES) */ flourish: Flourish;
  /** how gradually the pointed pen of the script letters presses into a downstroke and lets up: 0 at once,
      higher swelling from a point and easing off before the turn (see swell in stroke.ts) */ swell: number;
  /** length of tails and hooks (Q y j g t f, the comma, cursive exits): 0.5 is the usual length */ tail: number;
  fill: Fill;
  /** size of the pixels, dots or lines, or the wireframe's line weight */ module: number;
  /** gaps where strokes meet, like a stencil */ stencil: number;
  /** how far out along a stroke from the join its stencil gap is cut, from 0 right at the join */ stencilPos: number;
  /** how round the corners a stencil gap cuts are, from 0 sharp */ stencilRound: number;
  /** one letter's joins and turns opened one by one, by join id (see isJoinId): how far the stroke ending
      there (or the side of the turn running less upright) is pulled back from the one it meets, 0 joined,
      each overriding Stencil at that join (see joinGap) */ joinGaps: Record<string, number>;
  /** a horizontal cut through every letter */ slice: number;
  /** the height of the slice: 0 the baseline, 0.5 half the x-height, 1 the cap height */ slicePos: number;
  /** how round the corners the slice cuts are, from 0 sharp */ sliceRound: number;
  serif: boolean; serifSize: number; serifThickness: number; serifShape: SerifShape; serifAngle: number;
  /** bracketed serifs: how far the curve into the stem runs, 0.5 as usual */ serifBracket: number;
  /** how serifs finish at their tips (see SERIF_TIPS) */ serifTip: SerifTip;
  /** round tips: soft corners (0) to a full half circle (1) */ serifTipRound: number;
  /** angled tips: which way the cut leans and how far, 0.5 not at all: higher runs the foot of the tip further out, lower its top */ serifTipSlant: number;
  /** flat or cupped undersides (see SERIF_BASES) */ serifBase: SerifBase;
  /** cupped serifs: how high the base arches */ serifCup: number;
  /** which sides of a stem its serifs reach to (see SERIF_SIDES) */ serifSides: SerifSide;
  /** the shape of the serifs that reach into the letter (see SERIF_INNERS), and their length and thickness
      against the ones that reach out: 0.5 the same */ serifInner: SerifInner; serifInnerSize: number; serifInnerThickness: number;
  /** the serifs on stems, longer to the left (lower) or to the right (higher): 0.5 the same both ways */ serifBalance: number;
  /** the size of the serifs on top of stems, and of those on the ends of arms (E, F, T): 0.5 as drawn */ serifTops: number; serifArms: number;
  /** the serifs on the ends of arms: how heavy they are against the rest, 0.5 as drawn, and which way they lean,
      0.5 upright, higher splayed out away from the letter, lower in under the arm */ serifArmThickness: number; serifArmLean: number;
  letterSpacing: number; wordSpacing: number; sideBearing: number;
  /** blend toward one fixed advance width for every glyph */ mono: number;
  geoHuman: number; softSharp: number; classicFuture: number; playfulFormal: number;
  /** letters customized on their own: each overrides some of the settings above, by character */ glyphs: Record<string, GlyphParams>;
  /** letters drawn by hand with the pen, by character: drawn as they are, the settings above no longer shape them */ outlines: Record<string, Drawn>;
  /** the free font the letters are written in (a font id, see free-fonts.ts), '' for letters built from the settings:
      drawn as the font has them, and moved by the settings as far as they're moved from those it was picked at (freeAt) */ freeFont: string;
  /** the settings (of FREE_AT_KEYS) the free font's own letters stand for, as its style had them when it was picked:
      moved away from these, the font's letters move with them (bolder, wider, higher, slanted, filled, their ends, serifs,
      corners and joins drawn as the engine draws them) */ freeAt: FreeAt;
}

/** The settings a free font's letters follow, as far as they're moved from the ones it was picked at (Params.freeAt). */
export const FREE_AT_KEYS = ['weight', 'width', 'slant', 'rotation', 'mirror', 'sideBearing', 'mono', 'wobble', 'fill', 'slice',
  'geoHuman', 'softSharp', 'classicFuture', 'playfulFormal', 'contrast', 'vWeight', 'hWeight', 'xHeight', 'crossbar', 'serifSize',
  'extenders', 'descender', 'counter', 'dotSize', 'pinch', 'pinchPos', 'joints', 'roundness', 'steps', 'innerRound', 'joinRound',
  'terminal', 'terminalForm', 'terminalFlare', 'terminalDepth', 'terminalSize', 'terminalRound', 'terminalPoint', 'terminalClip', 'terminalLean', 'terminalSlope', 'terminalTilt', 'terminalTip', 'terminalTaper',
  'serif', 'serifThickness', 'serifShape', 'serifAngle', 'serifBracket', 'serifTip', 'serifTipRound', 'serifTipSlant', 'serifBase', 'serifCup',
  'serifSides', 'serifInner', 'serifInnerSize', 'serifInnerThickness', 'serifBalance', 'serifTops', 'serifArms', 'serifArmThickness', 'serifArmLean',
  'stencil', 'stencilPos', 'stencilRound', 'barGap', 'barEnds', 'terminalLength', 'terminalCurl', 'tail', 'aperture'] as const;
export type FreeAt = Partial<Pick<Params, (typeof FREE_AT_KEYS)[number]>>;

/** Settings every letter shares. The heights are the lines all letters stand on, spacing and the
    fills run across a whole line, and the personality macros push the heights too. */
export const GLOBAL_KEYS = ['height', 'xHeight', 'extenders', 'descender', 'letterSpacing', 'wordSpacing', 'mono', 'fill', 'module',
  'geoHuman', 'softSharp', 'classicFuture', 'playfulFormal', 'glyphs', 'outlines', 'freeFont', 'freeAt'] as const;
/** A setting one letter can have its own value of. */
export type GlyphKey = Exclude<keyof Params, (typeof GLOBAL_KEYS)[number]>;
export type GlyphParams = Partial<Pick<Params, GlyphKey>>;
export const isGlyphKey = (k: string): k is GlyphKey => k in DEFAULTS && !(GLOBAL_KEYS as readonly string[]).includes(k);

export type NumericParam = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params];

export const DEFAULTS: Readonly<Params> = Object.freeze({
  build: 'strokes',
  weight: 0.4, width: 0.5, height: 0.5, slant: 0, rotation: 0.5, contrast: 0.5, vWeight: 0.5, hWeight: 0.5, strokeWeights: Object.freeze({}),
  xHeight: 0.679, counter: 0.5, aperture: 0.5, crossbar: 0.5, barGap: 0, barEnds: 'short',
  roundness: 0, curve: 0.2, apex: 0.4, terminal: 'flat', terminalLength: 0.5, terminalEnds: Object.freeze({}), terminalCurl: 0.5, terminalCurls: Object.freeze({}), corners: Object.freeze({}), innerCorners: Object.freeze({}), terminalRun: 'curved',
  terminalForm: 'plain', terminalFlare: 0.5, terminalDepth: 0.5, terminalSize: 0.5, terminalRound: 1, terminalPoint: 0.5, terminalClip: 0.5, terminalLean: 0.5, terminalSlope: 0.5, terminalTilt: 0.5, terminalTip: 0.5, terminalTaper: 0.5, wobble: 0, pinch: 0, pinchPos: 0.5, steps: 0, cornerSteps: Object.freeze({}), innerRound: 0, swash: 0, mirror: 'normal', cursive: 0,
  squareness: 0, chamfer: 0, joints: 0, extenders: 0.5, descender: 0.5, story: 'auto', overlap: 1, bowlJoin: 'curved', gForm: 'hook', kForm: 'arm', dots: 'auto', dotSize: 0.5, iForm: 'auto', sForm: 'curved', aForm: 'plain', joinRound: 0,
  bowlForm: 'oval', boxRound: 0.5, diagonals: 'symmetric', bends: 'sharp', yForm: 'forked', qForm: 'crossing', rForm: 'leg', scriptForm: 'auto', flourish: 'plain', swell: 0, tail: 0.5,
  fill: 'solid', module: 0.4, stencil: 0, stencilPos: 0, stencilRound: 0, joinGaps: Object.freeze({}), slice: 0, slicePos: 0.5, sliceRound: 0,
  serif: false, serifSize: 0.45, serifThickness: 0.35, serifShape: 'bracketed', serifAngle: 0.2,
  serifBracket: 0.5, serifTip: 'square', serifTipRound: 1, serifTipSlant: 0.8, serifBase: 'flat', serifCup: 0.5,
  serifSides: 'both', serifInner: 'same', serifInnerSize: 0.5, serifInnerThickness: 0.5, serifBalance: 0.5, serifTops: 0.5, serifArms: 0.5, serifArmThickness: 0.5, serifArmLean: 0.5,
  letterSpacing: 0.2, wordSpacing: 0.35, sideBearing: 0.5, mono: 0,
  geoHuman: 0.5, softSharp: 0.5, classicFuture: 0.5, playfulFormal: 0.5, glyphs: Object.freeze({}), outlines: Object.freeze({}), freeFont: '', freeAt: Object.freeze({})
});

const PARAM_KEYS = Object.keys(DEFAULTS) as (keyof Params)[];

/** A stroke end's id: the index of its stroke in the glyph, then 's' for its start or 'e' for its end.
    A 'p' in front marks a plain end, one that isn't a styled terminal (the foot of a stem, the tip
    of a leg): it keeps the length and curl it is drawn with unless given its own, so the stroke end
    length and curl leave it alone. */
export const isEndId = (id: string) => /^p?\d{1,2}[se]$/.test(id);
/** A join's id: the index of the stroke that ends in another one, then 's' or 'e' for the end that
    joins; or a turn's (see isCornerId), where a stroke can come apart like two strokes joined. */
export const isJoinId = (id: string) => /^\d{1,2}([se]|t\d{1,2})$/.test(id);
/** How far a stroke ending in another is pulled back from it, in font units, at `v` on a join's own
    Gap scale, for stems `s` wide: up to two stems and a bit at 1. */
export const joinGap = (v: number, s: number) => v * (24 + s * 2);
/** How far the strokes a crossbar runs through are cut back above and below it, at `v` on its Gap scale (s: the stem). */
export const barCut = (v: number, s: number) => v * (12 + s);
/** A corner's id: the index of its stroke in the glyph, then 't' and the number of the turn along the
    stroke's centerline (from 0), or the end ('s' start, 'e' end) and its side ('l' or 'r', looking
    out of the stroke), or 'j' and the number of an inside corner where it meets a later stroke of
    the glyph (a join, from 0). */
export const isCornerId = (id: string) => /^\d{1,2}(t\d{1,2}|j\d{1,2}|[se][lr])$/.test(id);
/** A turn's id (see isCornerId): only a turn has an inside to round. */
export const isTurnId = (id: string) => /^\d{1,2}t\d{1,2}$/.test(id);
/** A stroke's id: its index in the glyph. */
export const isStrokeId = (id: string) => /^\d{1,2}$/.test(id);
/** The turn, in degrees clockwise, at `v` on the Rotation scale. */
export const rotationDeg = (v: number) => (v - 0.5) * 360;
/** How much heavier a stroke is drawn at `v` on a weight scale centred on 0.5: a quarter as heavy at 0, two and a half times at 1. */
export const weightScale = (v: number) => (v < 0.5 ? 0.25 + 1.5 * v : 1 + 3 * (v - 0.5));
/** `base` weighed by `v` on that scale but kept between `lo` and `hi`, reaching either only at the end of
    the scale, so the scale eases toward the limit all the way along rather than stopping at it part way. */
export function weighed(base: number, v: number, lo: number, hi: number) {
  const b = Math.min(hi, Math.max(lo, base));
  return v < 0.5 ? b + (Math.max(lo, Math.min(b, base * 0.25)) - b) * (1 - v * 2) : b + (Math.min(hi, Math.max(b, base * 2.5)) - b) * (v * 2 - 1);
}
/** The pen's contrast at `v` on the Contrast scale: `amount` of thick against thin (0.05 at 0.5, as
    the letters are drawn, to 1 at either end) and how far it is `reverse`d, horizontals heavy and
    stems thin. Turning round, the gentle contrast as drawn evens out first (by 0.45) and is all the
    way round by 0.4, then the contrast grows to the mirror of 1 at 0, so no stroke thins on the way. */
export function contrastOf(v: number) {
  if (v >= 0.5) return { amount: 0.05 + 0.95 * (v - 0.5) * 2, reverse: 0 };
  const t = (0.5 - v) * 2;
  return { amount: 0.05 + 0.95 * Math.max(0, (t - 0.1) / 0.9), reverse: Math.min(1, t / 0.2) };
}
/** A contrast saved before it ran both ways, as an amount with a separate reverse, on today's scale. */
export function contrastFromOld(amount: number, reverse: number) {
  const u = Math.min(1, Math.max(0, (amount - 0.05) / 0.95));
  return reverse >= 0.5 ? 0.5 - (0.1 + 0.9 * u) / 2 : 0.5 + u / 2;
}
/** How far past its usual length an end reaches, in x-heights (negative trims), at `v` on an end's
    own length scale. The letter's Length spans the lower three quarters of it, an eighth of an
    x-height either way; the last quarter draws one end on as far as a whole x-height. */
export function endReach(v: number) {
  const t = (v - 0.5) * 2;
  return t <= 0 ? 0.12 * t : 0.12 * t + 0.88 * t ** 4;
}
/** The stroke end length on an end's own scale: the value there that reaches as far. */
export function onEndScale(len: number) {
  const want = (len - 0.5) * 0.24;
  if (want <= 0) return len;
  let lo = 0.5, hi = 1;
  for (let i = 0; i < 30; i++) { const v = (lo + hi) / 2; if (endReach(v) < want) lo = v; else hi = v; }
  return (lo + hi) / 2;
}
/** How far one stroke end reaches, on its own scale (see endReach): its own length, else the
    stroke end length, except that the tip of a hook, tail or cursive stroke follows its own
    control instead and sits at the usual length (0.5). */
export const endLength = (p: Pick<Params, 'terminalLength'> & { terminalEnds?: Record<string, number> }, id: string, hook = false) =>
  p.terminalEnds?.[id] ?? (hook ? 0.5 : onEndScale(p.terminalLength));
/** How one stroke end bends (see terminalCurl): its own curl, else the stroke end curl, except
    that a plain end (see isEndId) stays as drawn (0.5). */
export const endCurl = (p: { terminalCurl?: number; terminalCurls?: Record<string, number> }, id: string) =>
  p.terminalCurls?.[id] ?? (id.startsWith('p') ? 0.5 : p.terminalCurl ?? 0.5);

/** The x-height as a share of the cap height, at `v` on the Lowercase height scale: from under a third
    (a copperplate's) to nearly as tall as the capitals. */
export const xHeightRatio = (v: number) => 0.3 + 0.56 * v;
/** An x-height saved on the first scale, which started at half the cap height, on today's (see xHeightRatio). */
export const xHeightFromOld = (v: number) => Math.round((0.2 + 0.36 * v) / 0.56 * 1000) / 1000;
/** The version of the settings this build writes. 2 moved the Lowercase height onto a scale reaching lower. */
export const PARAMS_VERSION = 2;
/** Settings written by an older version (see PARAMS_VERSION), as this one reads them. */
export function upgradeParams(src: Record<string, unknown>, version: number): Record<string, unknown> {
  if (version < 2 && typeof src.xHeight === 'number' && Number.isFinite(src.xHeight)) src = { ...src, xHeight: xHeightFromOld(Math.min(1, Math.max(0, src.xHeight))) };
  return src;
}

/** A valid value for setting `k`, or undefined. Numbers are clamped to 0..1. */
function cleanValue(k: keyof Params, v: unknown): unknown {
  const d = DEFAULTS[k];
  if (k === 'freeFont') return v === '' || parseFontId(v) ? v : undefined;
  if (k === 'freeAt') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    const out: Record<string, unknown> = {};
    for (const a of FREE_AT_KEYS) { const c = a in v ? cleanValue(a, (v as Record<string, unknown>)[a]) : undefined; if (c !== undefined) out[a] = c; }
    return out;
  }
  if (k === 'terminalEnds' || k === 'terminalCurls' || k === 'corners' || k === 'innerCorners' || k === 'cornerSteps' || k === 'strokeWeights' || k === 'joinGaps') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    const out: Record<string, number> = {}, ok = k === 'corners' || k === 'cornerSteps' ? isCornerId : k === 'innerCorners' ? isTurnId : k === 'strokeWeights' ? isStrokeId : k === 'joinGaps' ? isJoinId : isEndId;
    for (const [id, x] of Object.entries(v)) if (ok(id) && typeof x === 'number' && Number.isFinite(x)) out[id] = Math.min(1, Math.max(0, x));
    return out;
  }
  if (typeof d === 'number') return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;
  if (typeof d === 'boolean') return typeof v === 'boolean' ? v : undefined;
  const opts: Partial<Record<keyof Params, readonly unknown[]>> = { terminal: TERMINALS, terminalForm: FORM_IDS, serifShape: SERIF_SHAPES, serifTip: SERIF_TIPS, serifBase: SERIF_BASES, serifSides: SERIF_SIDES, serifInner: SERIF_INNERS, fill: FILLS, story: STORIES,
    bowlJoin: BOWL_JOINS, gForm: G_FORMS, kForm: K_FORMS, dots: DOTS, iForm: I_FORMS, sForm: S_FORMS, aForm: A_FORMS, terminalRun: TERMINAL_RUNS, barEnds: BAR_ENDS,
    bowlForm: BOWL_FORMS, build: BUILDS, mirror: MIRRORS, diagonals: DIAGONALS, bends: BENDS, yForm: Y_FORMS, qForm: Q_FORMS, rForm: R_FORMS, scriptForm: SCRIPT_FORMS, flourish: FLOURISHES };
  // (the Outline fill was an Inline outline, with a line down its strokes too, until 2026-10-06)
  if (k === 'fill' && v === 'outline-inline') return 'outline';
  return opts[k]?.includes(v) ? v : undefined;
}

/** Per-letter overrides: one character per key, only settings a letter can own, no empty entries. */
function cleanGlyphs(v: unknown): Record<string, GlyphParams> {
  const out: Record<string, GlyphParams> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [ch, ov] of Object.entries(v)) {
    if ([...ch].length !== 1 || !ov || typeof ov !== 'object') continue;
    const g: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(ov)) {
      const c = isGlyphKey(k) ? cleanValue(k, x) : undefined;
      if (c !== undefined) g[k] = c;
    }
    for (const e of ['terminalEnds', 'terminalCurls', 'corners', 'innerCorners', 'cornerSteps', 'strokeWeights', 'joinGaps']) if (g[e] && !Object.keys(g[e] as object).length) delete g[e];
    if (Object.keys(g).length) out[ch] = g as GlyphParams;
  }
  return out;
}

/** Drawn letters: one character per key, each a valid outline. */
function cleanOutlines(v: unknown): Record<string, Drawn> {
  const out: Record<string, Drawn> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [ch, d] of Object.entries(v)) {
    const c = [...ch].length === 1 ? cleanDrawn(d) : undefined;
    if (c) out[ch] = c;
  }
  return out;
}

/** Settings saved while Reverse contrast was its own slider (they carry a `reverse`), with their
    contrasts, the font's and each letter's own, moved onto the two-way Contrast scale. */
function fromOldContrast(src: Record<string, unknown>): Record<string, unknown> {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const base = num(src.contrast) ?? 0.05, rev = num(src.reverse)!;
  // a letter with only its own reverse takes the font's contrast amount
  const move = (o: Record<string, unknown>) => {
    const c = num(o.contrast), r = num(o.reverse);
    const { reverse: _, ...rest } = o;
    return c === undefined && r === undefined ? rest : { ...rest, contrast: contrastFromOld(c ?? base, r ?? rev) };
  };
  const out = move(src);
  const g = src.glyphs;
  if (g && typeof g === 'object' && !Array.isArray(g))
    out.glyphs = Object.fromEntries(Object.entries(g).map(([ch, ov]) => [ch, ov && typeof ov === 'object' ? move(ov as Record<string, unknown>) : ov]));
  return out;
}

/**
 * Turn untrusted input (an imported file, a request body) into valid Params.
 * Unknown keys are dropped, missing or invalid values fall back to the defaults and
 * numbers are clamped to 0..1, so the engine never sees NaN or an unknown option.
 */
export function sanitizeParams(input: unknown): Params {
  let src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (typeof src.reverse === 'number') src = fromOldContrast(src);
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const k of PARAM_KEYS) {
    const c = k === 'glyphs' ? cleanGlyphs(src[k]) : k === 'outlines' ? cleanOutlines(src[k]) : cleanValue(k, src[k]);
    if (c !== undefined) out[k] = c;
  }
  // a free font's letters stand for the settings it was picked at; one those didn't name yet (a design saved
  // before its letters followed that setting) they stand for as it is, as that is how they were drawn
  if (out.freeFont) {
    const at = { ...(out.freeAt as FreeAt) } as Record<string, unknown>;
    for (const k of FREE_AT_KEYS) if (!(k in at)) at[k] = out[k];
    out.freeAt = at;
  }
  return out as unknown as Params;
}

/** True when `input` is already fully valid (used by the API to reject bad bodies loudly). */
export function isValidParams(input: unknown): input is Params {
  if (!input || typeof input !== 'object') return false;
  const src = input as Record<string, unknown>;
  const clean = sanitizeParams(input) as unknown as Record<string, unknown>;
  // (a free font's settings it stands for may leave out ones it was picked before following: they're filled in)
  const fill = (k: keyof Params, v: unknown) => k === 'freeAt' && src.freeAt && typeof src.freeAt === 'object'
    ? Object.fromEntries(Object.entries(v as object).filter(([a]) => a in (src.freeAt as object))) : v;
  return PARAM_KEYS.every(k => typeof clean[k] === 'object' ? sorted(src[k]) === sorted(fill(k, clean[k])) : src[k] === clean[k]);
}

/** JSON with every object's keys in order, so the same settings written in another order compare equal. */
const sorted = (v: unknown): string => JSON.stringify(v, (_, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
