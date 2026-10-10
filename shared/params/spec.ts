/* Every setting in one place: what it defaults to, what values it takes, whether every letter shares it
   (global) or a letter can have its own, whether a free font's letters follow it (free), and where it sits
   in the editor: as a control on a page (control) or a slider nested under one (sub). DEFAULTS, the checks in
   clean.ts, GLOBAL_KEYS, FREE_AT_KEYS and the editor's CONTROLS and SUBS (shared/content) are all read off it.

   Adding a setting: its field in model.ts (the compiler then asks for its entry here), its entry here, and
   the engine code that draws it. A slider also needs its icon (client/components/SliderIcons.tsx; a test
   checks). Entries run in the editor's order: a page shows its controls in the order they are listed, a choice
   of shape before the sliders that tune it, the optional ones after and the advanced ones last; a nested
   slider follows the control it sits under. */
import type { Params } from './model';
import { isCornerId, isEndId, isJoinId, isStrokeId, isTurnId } from './scales';
import { A_FORMS, BAR_ENDS, BENDS, BOWL_FORMS, BOWL_JOINS, BUILDS, DIAGONALS, DOTS, FILLS, FLOURISHES, G_FORMS, I_FORMS, K_FORMS, MIRRORS, Q_FORMS,
  R_FORMS, S_FORMS, SCRIPT_FORMS, SERIF_BASES, SERIF_INNERS, SERIF_SHAPES, SERIF_SIDES, SERIF_TIPS, STORIES, TERMINAL_FORM_IDS, TERMINAL_RUNS,
  TERMINALS, Y_FORMS } from './options';

/** A page of the editor: Style, or one set of controls. */
export type CategoryId = 'style' | 'weight' | 'size' | 'heights' | 'insides' | 'curves' | 'corners' | 'ends' | 'serifs' | 'letters' | 'script'
  | 'spacing' | 'effects';

/** A setting as a control on a page of the editor. */
export interface ControlDef {
  cat: Exclude<CategoryId, 'style'>;
  /** short title shown on the control */
  label: string;
  /** what it does in plain words, shown in the explainer */
  friendly: string;
  /** the typographer's term */
  tech: string;
  lo?: string;
  hi?: string;
  /** letters drawn in the explainer diagram */
  demo: string;
  explain: string;
  type?: 'options' | 'story' | 'form' | 'serif' | 'serifForm' | 'fill';
  /** the diagram closes in on the foot of the letters, where a serif's finer shape shows */
  zoom?: boolean;
  bipolar?: boolean;
  /** a turn: shown in degrees, -180 to 180, rather than 0 to 100 */
  degrees?: boolean;
  advanced?: boolean;
  /** An optional slider: its value where it changes nothing. It gets an on/off switch, and off hides the slider. */
  off?: number;
}
/** A slider nested under a control. */
export interface SubControlDef { label: string; friendly: string; tech: string; lo: string; hi: string; bipolar?: boolean }

interface Extra {
  /** every letter shares it: the heights all letters stand on, spacing and fills that run across a line */
  global?: boolean;
  /** a free font's letters follow it, as far as it is moved from where the font was picked (Params.freeAt) */
  free?: boolean;
  /** shown as a control on a page */
  control?: ControlDef;
  /** shown as a slider nested under control `parent` */
  sub?: SubControlDef & { parent: string };
}
/** One setting's spec. `kind` says how a value is checked: a number (clamped to 0..1), true or false, one of
    `options`, a map of a letter's own values by id (each id passing `ids`), a free font's id, or a value
    clean.ts checks itself. */
export interface Spec<T> extends Extra {
  kind: 'number' | 'boolean' | 'option' | 'ids' | 'font' | 'value';
  default: T;
  options?: readonly T[];
  ids?: (id: string) => boolean;
}

const num = <const O extends Extra = {}>(d: number, o?: O) => ({ kind: 'number' as const, default: d, ...(o as O) });
const bool = <const O extends Extra = {}>(d: boolean, o?: O) => ({ kind: 'boolean' as const, default: d, ...(o as O) });
const option = <const T extends string, const O extends Extra = {}>(options: readonly T[], d: NoInfer<T>, o?: O) =>
  ({ kind: 'option' as const, default: d, options, ...(o as O) });
const ids = <const O extends Extra = {}>(test: (id: string) => boolean, o?: O) =>
  ({ kind: 'ids' as const, default: {} as Record<string, number>, ids: test, ...(o as O) });
const fontId = <const O extends Extra = {}>(o?: O) => ({ kind: 'font' as const, default: '', ...(o as O) });
const value = <T, const O extends Extra = {}>(d: T, o?: O) => ({ kind: 'value' as const, default: d, ...(o as O) });

export const SPECS = {
  /* ---- Weight & contrast */
  weight: num(0.4, { free: true, control: { cat: 'weight', label: 'Weight', friendly: 'Make strokes thicker', tech: 'Weight', lo: 'Thin', hi: 'Bold', demo: 'n',
    explain: 'Letters widen a little so their insides stay open.' } }),
  vWeight: num(0.5, { free: true,
    sub: { parent: 'weight', label: 'Verticals', friendly: 'Thin or thicken the uprights', tech: 'Stem weight', lo: 'Lighter', hi: 'Heavier', bipolar: true } }),
  hWeight: num(0.5, { free: true,
    sub: { parent: 'weight', label: 'Horizontals', friendly: 'Thin or thicken the horizontals', tech: 'Bar weight', lo: 'Lighter', hi: 'Heavier', bipolar: true } }),

  /* ---- Size & slant */
  width: num(0.5, { free: true, control: { cat: 'size', label: 'Width', friendly: 'Make letters narrower or wider', tech: 'Width', lo: 'Condensed', hi: 'Expanded', demo: 'H',
    explain: 'Stretches letters sideways; strokes keep their thickness.' } }),
  height: num(0.5, { global: true, control: { cat: 'size', label: 'Height', friendly: 'Make letters taller or shorter', tech: 'Height', lo: 'Short', hi: 'Tall', demo: 'Hx',
    explain: 'Moves the top of the capitals; lowercase follows.' } }),
  slant: num(0, { free: true, control: { cat: 'size', label: 'Slant', friendly: 'Tilt the letters', tech: 'Slant', lo: 'Upright', hi: 'Italic', demo: 'Hn',
    explain: 'Leans each letter to the right, like an oblique italic.' } }),
  rotation: num(0.5, { free: true, control: { cat: 'size', label: 'Rotation', friendly: 'Turn the letters round', tech: 'Rotation', lo: 'Anticlockwise', hi: 'Clockwise', demo: 'Hag', bipolar: true, degrees: true,
    explain: 'Turns each letter about its own middle, and spaces the letters to fit. Synced, every letter turns the same way; customize a letter to give it its own angle.' } }),

  /* ---- Weight & contrast */
  contrast: num(0.5, { free: true, control: { cat: 'weight', label: 'Contrast', friendly: 'Vary thick and thin strokes', tech: 'Contrast · Reverse contrast', lo: 'Reversed', hi: 'High', demo: 'HOe', bipolar: true,
    explain: 'Above the middle the horizontals thin out while the stems stay heavy; below it the stems thin out under heavy horizontals.' } }),
  pinch: num(0, { free: true, control: { cat: 'weight', off: 0, label: 'Pinch', friendly: 'Thin the strokes to a point', tech: 'Pinch · Waist', lo: 'Slight', hi: 'To a point', demo: 'aplo',
    explain: 'Strokes narrow in straight wedges toward a level line and swell back out above and below it: stems turn into hourglasses and round letters get almond-shaped counters. Position moves the line.' } }),
  pinchPos: num(0.5, { free: true,
    sub: { parent: 'pinch', label: 'Position', friendly: 'Move the pinch up or down', tech: 'Pinch height', lo: 'Baseline', hi: 'Cap height' } }),

  /* ---- Build & curves */
  build: option(BUILDS, 'strokes', { free: true, control: { cat: 'curves', type: 'form', label: 'Built from', friendly: 'Draw with strokes or blocks', tech: 'Stroke or block construction', demo: 'EOS',
    explain: 'Blocks are solid shapes with their insides cut in as narrow slots. Weight closes the slots up, Roundness rounds the corners and slot ends, Joins the small inside curves. Lowercase become small capitals.' } }),
  bowlForm: option(BOWL_FORMS, 'oval', { free: true, control: { cat: 'curves', type: 'form', label: 'Bowls', friendly: 'Draw curves as ovals or as boxes', tech: 'Oval or box bowls', demo: 'OCS',
    explain: 'Boxes have straight sides and corners round outside, square inside.' } }),
  boxRound: num(0.5, { sub: { parent: 'bowlForm', label: 'Corners', friendly: 'Round the corners of box bowls', tech: 'Box corner radius', lo: 'Sharp', hi: 'Wide' } }),
  curve: num(0.2, { free: true, control: { cat: 'curves', label: 'Curves', friendly: 'Make curves geometric or organic', tech: 'Curve', lo: 'Geometric', hi: 'Organic', demo: 'Sae',
    explain: 'Compass-drawn circles, or fuller pen-like curves.' } }),
  squareness: num(0, { free: true, control: { cat: 'curves', off: 0, label: 'Squareness', friendly: 'Turn circles into rounded squares', tech: 'Squareness · Superellipse', lo: 'Circle', hi: 'Square', demo: 'Oo',
    explain: 'Bowls square off while the corners stay smooth.' } }),
  chamfer: num(0, { free: true, control: { cat: 'curves', off: 0, label: 'Facets', friendly: 'Cut curves into flat facets', tech: 'Chamfer · Faceted', lo: 'Curved', hi: 'Cut', demo: 'Oes',
    explain: 'Curves become straight lines with cut-off corners.' } }),
  bowlJoin: option(BOWL_JOINS, 'curved', { free: true, control: { cat: 'curves', type: 'form', label: 'Joins', friendly: 'Curve bowls out of their stems', tech: 'Bowl & shoulder joins', demo: 'dnu',
    explain: 'Square joins meet the stem in a flat top or bottom, like a D. Applies to b d p q g, n m h r u and a.' } }),
  overlap: num(1, { control: { cat: 'curves', off: 1, label: 'Bowl overlap', friendly: 'Join or separate bowl and stem', tech: 'Bowl overlap', lo: 'Apart', hi: 'Merged', demo: 'bdpq',
    explain: 'Applies to b, d, p, q and the single-storey a.' } }),

  /* ---- Corners */
  roundness: num(0, { free: true, control: { cat: 'corners', label: 'Roundness', friendly: 'Make the letters softer or sharper', tech: 'Roundness', lo: 'Sharp', hi: 'Round', demo: 'Ek',
    explain: 'Corners and stroke ends round off; Joins rounds where strokes meet.' } }),
  joinRound: num(0, { free: true,
    sub: { parent: 'roundness', label: 'Joins', friendly: 'Round where strokes meet', tech: 'Fillets', lo: 'Sharp', hi: 'Round' } }),
  innerRound: num(0, { free: true,
    sub: { parent: 'roundness', label: 'Counters', friendly: 'Round the corners of counters', tech: 'Counter corner radius', lo: 'As drawn', hi: 'Round' } }),
  bends: option(BENDS, 'sharp', { free: true, control: { cat: 'corners', type: 'form', label: 'Bends', friendly: 'Make bends sharp or round', tech: 'Sharp or round vertices', demo: 'MNZ',
    explain: 'Where a stroke changes direction, as in A, M, N, V, W and Z: a point, or a round bend like bent wire. Peaks sets how wide.' } }),
  apex: num(0.4, { free: true, control: { cat: 'corners', label: 'Peaks', friendly: 'Make peaks pointed or flat', tech: 'Apex', lo: 'Pointed', hi: 'Flat', demo: 'AV',
    explain: 'Where diagonals meet — the top of A, the bottom of V. With round bends, how wide they turn.' } }),
  steps: num(0, { free: true, control: { cat: 'corners', off: 0, label: 'Steps', friendly: 'Cut steps into the corners', tech: 'Stepped corners · Notches', lo: 'Small', hi: 'Stroke wide', demo: 'LOE',
    explain: 'Each square corner a stroke turns (every corner of box bowls), and each corner where two strokes end together (the foot of an L), gets a square notch, like a letter built on a grid. Customize a letter to step each corner its own way.' } }),
  joints: num(0, { free: true, control: { cat: 'corners', off: 0, label: 'Ink traps', friendly: 'Thin the strokes where they meet', tech: 'Ink traps · Joints', lo: 'Solid', hi: 'Trapped', demo: 'nab',
    explain: 'Corners are carved out where strokes join.' } }),

  /* ---- Stroke ends */
  terminal: option(TERMINALS, 'flat', { free: true, control: { cat: 'ends', type: 'options', label: 'Stroke ends', friendly: 'Choose how strokes end', tech: 'Letter endings · Terminals', demo: 'Cas',
    explain: 'The free tips of strokes, as on C, a, s and r: their shape, which way they run and how far they reach.' } }),
  terminalLength: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Length', friendly: 'Lengthen or shorten the ends', tech: 'Terminal length', lo: 'Short', hi: 'Long' } }),
  terminalCurl: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Curl', friendly: 'Curl the stroke ends', tech: 'Terminal curl', lo: 'Flared out', hi: 'Curled in', bipolar: true } }),
  terminalFlare: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Flare', friendly: 'Widen the stroke as it ends', tech: 'Flared terminal', lo: 'Slight', hi: 'Wide' } }),
  terminalDepth: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Depth', friendly: 'Hollow the end out a little or a lot', tech: 'Terminal depth', lo: 'Shallow', hi: 'Deep' } }),
  terminalSize: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Size', friendly: 'Resize the drop on the end', tech: 'Ball size', lo: 'Small', hi: 'Big' } }),
  terminalRound: num(1, { free: true,
    sub: { parent: 'terminal', label: 'Roundness', friendly: 'Round off the end', tech: 'Terminal radius', lo: 'Soft corners', hi: 'Half circle' } }),
  terminalPoint: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Sharpness', friendly: 'Sharpen the point', tech: 'Point length', lo: 'Less sharp', hi: 'Sharper' } }),
  terminalClip: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Cut off', friendly: 'Clip the tip of the point', tech: 'Clipped point', lo: 'Little', hi: 'Lot' } }),
  terminalLean: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Lean', friendly: 'Move the point in or out', tech: 'Point offset', lo: 'Inside', hi: 'Outside', bipolar: true } }),
  terminalSlope: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Slope', friendly: 'Cut the end gently or steeply', tech: 'Terminal angle', lo: 'Gentle', hi: 'Steep' } }),
  terminalTilt: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Tilt', friendly: 'Tilt the level cut', tech: 'Cut angle', lo: 'Falling', hi: 'Rising', bipolar: true } }),
  terminalTip: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Tip', friendly: 'Make the tapered tip blunt or fine', tech: 'Taper tip width', lo: 'Blunt', hi: 'Fine' } }),
  terminalTaper: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Taper length', friendly: 'Start the taper near or far', tech: 'Taper length', lo: 'Short', hi: 'Long' } }),

  /* ---- Serifs */
  serif: bool(false, { free: true, control: { cat: 'serifs', type: 'serif', label: 'Serifs', friendly: 'Add small feet to the strokes', tech: 'Serifs', demo: 'In',
    explain: 'Small finishing strokes at the ends of stems. Pick their shape, then set how long, how heavy and how sloped they are.' } }),
  serifSize: num(0.45, { free: true,
    sub: { parent: 'serif', label: 'Length', friendly: 'Make the feet longer', tech: 'Serif size', lo: 'Short', hi: 'Long' } }),
  serifThickness: num(0.35, { free: true,
    sub: { parent: 'serif', label: 'Thickness', friendly: 'Make the feet heavier', tech: 'Serif thickness', lo: 'Hairline', hi: 'Heavy' } }),
  serifAngle: num(0.2, { free: true,
    sub: { parent: 'serif', label: 'Angle', friendly: 'Slope the top of the feet', tech: 'Serif angle', lo: 'Flat', hi: 'Sloped' } }),
  serifBracket: num(0.5, { free: true,
    sub: { parent: 'serif', label: 'Bracket', friendly: 'Curve the feet into the stem', tech: 'Bracket', lo: 'Tight', hi: 'Long', bipolar: true } }),
  serifTip: option(SERIF_TIPS, 'square', { free: true, control: { cat: 'serifs', type: 'serifForm', zoom: true, label: 'Tips', friendly: 'Choose how the serifs finish', tech: 'Serif tips', demo: 'I',
    explain: 'The outer end of each serif: cut square, rounded off, drawn out to a point, or cut on a slant.' } }),
  serifTipRound: num(1, { free: true,
    sub: { parent: 'serifTip', label: 'Roundness', friendly: 'Round off the serif tips', tech: 'Tip radius', lo: 'Soft corners', hi: 'Half circle' } }),
  serifTipSlant: num(0.8, { free: true,
    sub: { parent: 'serifTip', label: 'Slant', friendly: 'Slant the cut at the tip', tech: 'Tip angle', lo: 'Undercut', hi: 'Sloped', bipolar: true } }),
  serifBase: option(SERIF_BASES, 'flat', { free: true, control: { cat: 'serifs', type: 'serifForm', zoom: true, label: 'Base', friendly: 'Keep the feet flat or arch them', tech: 'Flat or cupped serifs', demo: 'I',
    explain: 'A cupped serif arches up under its stem, so only its two tips touch the line, as in book faces cut by hand. The serifs across the ends of arms stay flat.' } }),
  serifCup: num(0.5, { free: true,
    sub: { parent: 'serifBase', label: 'Depth', friendly: 'Arch the base a little or a lot', tech: 'Cup depth', lo: 'Shallow', hi: 'Deep' } }),
  serifSides: option(SERIF_SIDES, 'both', { free: true, control: { cat: 'serifs', type: 'serifForm', label: 'Sides', friendly: 'Choose where serifs reach', tech: 'Serif direction · Half serifs', demo: 'Hn',
    explain: 'Serifs reach both ways from a stem, to the left or the right only, or only into the letter or out of it. A side faces into the letter where more of it stands beside the stem on the same line. The serifs across the ends of arms stay as they are.' } }),
  serifInner: option(SERIF_INNERS, 'same', { free: true, control: { cat: 'serifs', type: 'serifForm', zoom: true, label: 'Inside serifs', friendly: 'Shape the inside serifs', tech: 'Inner & outer serifs', demo: 'n',
    explain: 'The serifs that reach into the letter take a shape, length and thickness of their own. The ones that reach out keep the shape picked under Serifs.' } }),
  serifInnerSize: num(0.5, { free: true,
    sub: { parent: 'serifInner', label: 'Length', friendly: 'Shorten or lengthen inside serifs', tech: 'Inner serif size', lo: 'Shorter', hi: 'Longer', bipolar: true } }),
  serifInnerThickness: num(0.5, { free: true,
    sub: { parent: 'serifInner', label: 'Thickness', friendly: 'Thin or thicken inside serifs', tech: 'Inner serif thickness', lo: 'Lighter', hi: 'Heavier', bipolar: true } }),
  serifBalance: num(0.5, { free: true, control: { cat: 'serifs', zoom: true, bipolar: true, label: 'Balance', friendly: 'Reach further to one side', tech: 'Serif balance', lo: 'Left', hi: 'Right', demo: 'I',
    explain: 'The serifs on stems grow longer on one side and shorter on the other. In the middle both sides match.' } }),
  serifTops: num(0.5, { free: true, control: { cat: 'serifs', bipolar: true, label: 'Top serifs', friendly: 'Size the serifs on top', tech: 'Head serifs', lo: 'Small', hi: 'Large', demo: 'Hdn',
    explain: 'The serifs on top of stems, set apart from the feet on the baseline.' } }),
  serifArms: num(0.5, { free: true, control: { cat: 'serifs', bipolar: true, label: 'Arm serifs', friendly: 'Size the serifs on arms', tech: 'Arm serifs · Beaks', lo: 'Small', hi: 'Large', demo: 'ETZ',
    explain: 'The serifs across the ends of arms, as on E, F, L, T and Z: their length, their thickness against the other serifs, and how they lean. Leaning out, they splay away from the letter like the arms of a T bent down at the ends, cut square across at their tips.' } }),
  serifArmThickness: num(0.5, { free: true,
    sub: { parent: 'serifArms', label: 'Thickness', friendly: 'Thin or thicken the arm serifs', tech: 'Arm serif thickness', lo: 'Lighter', hi: 'Heavier', bipolar: true } }),
  serifArmLean: num(0.5, { free: true,
    sub: { parent: 'serifArms', label: 'Lean', friendly: 'Lean the arm serifs in or out', tech: 'Splayed arm serifs', lo: 'In', hi: 'Out', bipolar: true } }),

  /* ---- Letters */
  story: option(STORIES, 'auto', { free: true, control: { cat: 'letters', type: 'story', label: 'Letter a', friendly: 'Choose the shape of the a', tech: 'Double / single storey a', demo: 'data',
    explain: 'Two-storey like book type, or one bowl like handwriting. Its foot can run out in a spur along the baseline.' } }),
  diagonals: option(DIAGONALS, 'symmetric', { free: true, control: { cat: 'letters', type: 'form', label: 'Letters A, V and W', friendly: 'Straighten or arch A, V and W', tech: 'Symmetric, upright or arched diagonals', demo: 'AVW',
    explain: 'Two matching diagonals, or one diagonal leaning on an upright stem at the right (the upright A has no crossbar). Arches have no diagonals at all: A and N bend over like an upturned U, M with a stem down the middle, V is a U and W a U with a stem up the middle. Also v and w.' } }),
  gForm: option(G_FORMS, 'hook', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter g', friendly: 'Choose the shape of the g', tech: 'Single- or double-storey g', demo: 'gag',
    explain: 'The tail hooks back under the bowl, or drops from its left side and hooks out to the right; or two storeys, as in book type: a small bowl with an ear, linked to a loop under the baseline.' } }),
  iForm: option(I_FORMS, 'auto', { free: true, control: { cat: 'letters', type: 'form', label: 'Letters I, J, i and l', friendly: 'Give I, J, i and l bars', tech: 'Barred I, J, i and l', demo: 'IJil',
    explain: 'A plain stem, or bars as in a typewriter face: i and l get a flag and a foot, I a bar at the top and foot, J a bar across the top.' } }),
  kForm: option(K_FORMS, 'arm', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter k', friendly: 'Choose the joint of k', tech: 'k and K junction', demo: 'kK',
    explain: 'The leg springs from the arm, both meet at the stem, or both meet at the end of a short bar.' } }),
  qForm: option(Q_FORMS, 'crossing', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter Q', friendly: 'Choose where the tail of Q goes', tech: 'Q tail', demo: 'QO',
    explain: 'The tail crosses the bowl at the bottom right, runs from inside the bowl into its bottom right corner, or sweeps out from under the bowl to the right in a long curve, as in book type.' } }),
  rForm: option(R_FORMS, 'leg', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter R', friendly: 'Choose the leg of R', tech: 'R leg', demo: 'RP',
    explain: 'The leg runs down from the bowl, or the bowl’s lower bar stops short of the stem and loops back round into the leg.' } }),
  sForm: option(S_FORMS, 'curved', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter s', friendly: 'Choose the shape of the s', tech: 'Spine of s', demo: 'sS$',
    explain: 'A spine curving from corner to corner, or running flat between two tight turns, like two rounded boxes stacked.' } }),
  yForm: option(Y_FORMS, 'forked', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter Y', friendly: 'Choose the shape of the Y', tech: 'Forked or cup Y', demo: 'Yy',
    explain: 'Two arms forking off a stem, or a cup whose right side runs on down into a diagonal, like a 4. Also y.' } }),
  dots: option(DOTS, 'auto', { free: true, control: { cat: 'letters', type: 'form', label: 'Dots', friendly: 'Make the dots square or round', tech: 'Tittles & periods', demo: 'ij.!',
    explain: 'The dots on i and j and in the punctuation, whatever the corners do.' } }),
  dotSize: num(0.5, { free: true,
    sub: { parent: 'dots', label: 'Size', friendly: 'Make the dots smaller or bigger', tech: 'Dot size', lo: 'Small', hi: 'Big' } }),

  /* ---- Size & slant */
  mirror: option(MIRRORS, 'normal', { free: true, control: { cat: 'size', type: 'form', label: 'Mirror', friendly: 'Flip letters left to right', tech: 'Mirrored letters', demo: 'eRs',
    explain: 'Draws letters back to front. Customize one letter to mirror only that one, like the reversed e of a quirky display face.' } }),

  /* ---- Handwriting */
  cursive: num(0, { free: true, control: { cat: 'script', off: 0, label: 'Cursive', friendly: 'Lead into the next letter', tech: 'Cursive · Entry & exit strokes', lo: 'Print', hi: 'Script', demo: 'nigu',
    explain: 'Strokes flick on toward the next letter, like script.' } }),
  wobble: num(0, { free: true, control: { cat: 'script', off: 0, label: 'Hand-drawn', friendly: 'Make it look drawn by hand', tech: 'Hand-drawn · Irregularity', lo: 'Precise', hi: 'Wobbly', demo: 'Hand',
    explain: 'Strokes drift, swell and sit a little off the line.' } }),
  scriptForm: option(SCRIPT_FORMS, 'auto', { free: true, control: { cat: 'script', type: 'form', label: 'Letterforms', friendly: 'Write joined script or print', tech: 'Print or script letterforms', demo: 'Rain',
    explain: 'Print letters are built like type. Script letters are written with a pen: every small letter joins the next on a fine hairline, downstrokes swell and the rest stays fine, and the capitals have lead-ins, loops and curled feet. Left alone, a design more than half cursive is written.' } }),
  flourish: option(FLOURISHES, 'plain', { free: true, control: { cat: 'script', type: 'form', label: 'Flourishes', friendly: 'Write swashes on script letters', tech: 'Swash alternates', demo: 'Stzld',
    explain: 'Swashes as a calligrapher adds them: S leads in from a wide loop, the bar of t runs in from far to the left and loops back over the letter, l and d rise into loops over the letters after them, r sweeps down into a shaded curl that ends in a heart, and the tail of z loops away under the word to a hook. They reach over the neighbouring letters without pushing them apart. Customize one letter to flourish only that one. Script letters only.' } }),
  swell: num(0, { control: { cat: 'script', off: 0, label: 'Swell', friendly: 'Press into the downstrokes', tech: 'Pointed pen · Pressure', lo: 'At once', hi: 'Gradual', demo: 'nitu',
    explain: 'A pointed pen opens as it is pressed: each downstroke starts from a fine point, swells to its full weight and lets up again before it turns, so the shades taper at both ends like a leaf. Script letters only.' } }),
  swash: num(0, { free: true, control: { cat: 'script', off: 0, label: 'Swash capitals', friendly: 'Curl the capitals into flourishes', tech: 'Swash capitals', lo: 'Small', hi: 'Big', demo: 'PRT',
    explain: 'The first stroke of each capital runs on at the top left (the stem of P, the bar of T, or else the foot of A) and curls out, finishing like the other stroke ends: pick Rounded, Ball ends for a ball.' } }),

  /* ---- Heights */
  xHeight: num(0.679, { global: true, free: true, control: { cat: 'heights', label: 'Lowercase height', friendly: 'Make lowercase letters taller', tech: 'x-height', lo: 'Small', hi: 'Large', demo: 'Hxn',
    explain: 'Taller lowercase feels modern and reads well small.' } }),
  extenders: num(0.5, { global: true, free: true, control: { cat: 'heights', label: 'Stem length', friendly: 'Lengthen stems up and down', tech: 'Ascenders & descenders', lo: 'Short', hi: 'Long', demo: 'hpdy',
    explain: 'The parts above (b, d, h) and below (g, p, y) the letters.' } }),
  tail: num(0.5, { free: true, control: { cat: 'heights', label: 'Tails & hooks', friendly: 'Lengthen tails and hooks', tech: 'Tail · Hook', lo: 'Short', hi: 'Long', demo: 'Qjty',
    explain: 'The trailing ends of Q, y, g, j, t, f and the comma.' } }),
  crossbar: num(0.5, { free: true, control: { cat: 'heights', label: 'Crossbar height', friendly: 'Move the bars up or down', tech: 'Crossbar', lo: 'Low', hi: 'High', demo: 'AHe',
    explain: 'The bars in A, H and e, the waist of B, E, R, and the crossbars of f and t, and the top of the a’s bowl.' } }),
  barGap: num(0, { free: true,
    sub: { parent: 'crossbar', label: 'Gap', friendly: 'Open gaps around the crossbars', tech: 'Crossbar gap', lo: 'Touching', hi: 'Apart' } }),
  descender: num(0.5, { global: true, free: true, control: { cat: 'heights', advanced: true, label: 'Descender length', friendly: 'Lengthen only the descenders', tech: 'Descenders', lo: 'Short', hi: 'Long', demo: 'gpy',
    explain: 'The parts below the baseline, apart from the ascenders above the x-height.' } }),

  /* ---- Inner space */
  counter: num(0.5, { free: true, control: { cat: 'insides', label: 'Inner space', friendly: 'Change the space inside letters', tech: 'Counter', lo: 'Small', hi: 'Large', demo: 'Bo',
    explain: 'The enclosed space inside O, B, a and e.' } }),
  aperture: num(0.5, { free: true, control: { cat: 'insides', label: 'Openness', friendly: 'Open or close the letters', tech: 'Aperture', lo: 'Closed', hi: 'Open', demo: 'ces',
    explain: 'Open mouths on c, e and s stay readable when small.' } }),

  /* ---- Spacing */
  letterSpacing: num(0.2, { global: true, control: { cat: 'spacing', label: 'Letter spacing', friendly: 'Loosen or tighten the letters', tech: 'Letter spacing · Tracking', lo: 'Tight', hi: 'Open', demo: 'type',
    explain: 'The same gap changes between every pair of letters.' } }),
  wordSpacing: num(0.35, { global: true, control: { cat: 'spacing', label: 'Word spacing', friendly: 'Change the gap between words', tech: 'Word spacing', lo: 'Compact', hi: 'Spacious', demo: 'to be',
    explain: 'Too tight and words merge; too loose and lines fall apart.' } }),
  mono: num(0, { global: true, free: true, control: { cat: 'spacing', off: 0, label: 'Monospace', friendly: 'Give every letter the same width', tech: 'Monospace', lo: 'Proportional', hi: 'Monospaced', demo: 'milk',
    explain: 'Every character takes the same width, like a typewriter.' } }),
  sideBearing: num(0.5, { free: true, control: { cat: 'spacing', advanced: true, label: 'Side margins', friendly: 'Adjust the margins of letters', tech: 'Side bearing', lo: 'Narrow', hi: 'Wide', demo: 'HO',
    explain: 'The small margins built into each letter.' } }),

  /* ---- Effects */
  fill: option(FILLS, 'solid', { global: true, free: true, control: { cat: 'effects', type: 'fill', label: 'Fill', friendly: 'Change what fills the letters', tech: 'Fill', demo: 'Rg',
    explain: 'Solid ink, outlines, a grid of pixels, dots or lines, a line cut down the middle of each stroke, a hollow outline, or a shadow cast down to the right. Size sets how coarse the grid is, how wide the line, or how far the shadow falls.' } }),
  module: num(0.4, { global: true,
    sub: { parent: 'fill', label: 'Size', friendly: 'Size the grid, line or shadow', tech: 'Module size', lo: 'Fine', hi: 'Coarse' } }),
  stencil: num(0, { free: true, control: { cat: 'effects', off: 0, label: 'Stencil', friendly: 'Cut gaps where the strokes meet', tech: 'Stencil', lo: 'Solid', hi: 'Wide gaps', demo: 'BOa',
    explain: 'Strokes break where they join, as if cut from a sheet. Thickness sets how wide the gaps open; Position moves the gaps out along the strokes; Rounding softens their corners.' },
    sub: { parent: 'stencil', label: 'Thickness', friendly: 'Open the gaps wider', tech: 'Gap width', lo: 'Thin', hi: 'Thick' } }),
  stencilPos: num(0, { free: true,
    sub: { parent: 'stencil', label: 'Position', friendly: 'Move the gaps along the strokes', tech: 'Gap position', lo: 'At the join', hi: 'Further out' } }),
  stencilRound: num(0, { free: true,
    sub: { parent: 'stencil', label: 'Rounding', friendly: 'Round the corners the gaps cut', tech: 'Cut corner radius', lo: 'Sharp', hi: 'Round' } }),
  slice: num(0, { free: true, control: { cat: 'effects', off: 0, label: 'Slice', friendly: 'Cut one line through every letter', tech: 'Slice', lo: 'None', hi: 'Wide', demo: 'type',
    explain: 'One horizontal cut runs across the whole line. Thickness sets how tall the cut is; Position moves it up or down; Rounding softens its corners.' },
    sub: { parent: 'slice', label: 'Thickness', friendly: 'Make the cut taller', tech: 'Cut height', lo: 'Thin', hi: 'Thick' } }),
  slicePos: num(0.5, { sub: { parent: 'slice', label: 'Position', friendly: 'Move the cut up or down', tech: 'Slice height', lo: 'Low', hi: 'High' } }),
  sliceRound: num(0, { sub: { parent: 'slice', label: 'Rounding', friendly: 'Round the corners the cut leaves', tech: 'Cut corner radius', lo: 'Sharp', hi: 'Round' } }),

  /* ---- not on a page of their own: per-id values a letter sets one by one, and what the design carries */
  strokeWeights: ids(isStrokeId),
  barEnds: option(BAR_ENDS, 'short', { free: true }),
  terminalEnds: ids(isEndId),
  terminalCurls: ids(isEndId),
  corners: ids(isCornerId),
  innerCorners: ids(isTurnId),
  terminalRun: option(TERMINAL_RUNS, 'curved', { free: true }),
  terminalForm: option(TERMINAL_FORM_IDS, 'plain', { free: true }),
  cornerSteps: ids(isCornerId),
  aForm: option(A_FORMS, 'plain', { free: true }),
  joinGaps: ids(isJoinId),
  serifShape: option(SERIF_SHAPES, 'bracketed', { free: true }),
  geoHuman: num(0.5, { global: true, free: true }),
  softSharp: num(0.5, { global: true, free: true }),
  classicFuture: num(0.5, { global: true, free: true }),
  playfulFormal: num(0.5, { global: true, free: true }),
  glyphs: value({}, { global: true }),
  outlines: value({}, { global: true }),
  freeFont: fontId({ global: true }),
  freeAt: value({}, { global: true }),
};

type Specs = typeof SPECS;
// (checked here rather than on SPECS itself, whose type Params.glyphs leans on: a spec for every setting, of its
// type, and none for a setting that isn't one)
SPECS satisfies { [K in keyof Params]: Spec<Params[K]> };
({}) as { [K in Exclude<keyof Specs, keyof Params>]: K } satisfies Record<string, never>;
type KeysWhere<C> = { [K in keyof Specs]: Specs[K] extends C ? K : never }[keyof Specs];
export const PARAM_KEYS = Object.keys(SPECS) as (keyof Params)[];

/** Every setting at its default: a new design, and what a value missing from a saved one falls back to. */
export const DEFAULTS: Readonly<Params> = Object.freeze(Object.fromEntries(PARAM_KEYS.map(k => {
  const d = SPECS[k].default;
  return [k, d && typeof d === 'object' ? Object.freeze({ ...d }) : d];
})) as unknown as Params);

/** Settings every letter shares. The heights are the lines all letters stand on, spacing and the
    fills run across a whole line, and the personality macros push the heights too. */
export type GlobalKey = KeysWhere<{ global: true }>;
export const GLOBAL_KEYS = PARAM_KEYS.filter(k => (SPECS[k] as Extra).global) as GlobalKey[];
/** A setting one letter can have its own value of. */
export type GlyphKey = Exclude<keyof Params, GlobalKey>;
export type GlyphParams = Partial<Pick<Params, GlyphKey>>;
export const isGlyphKey = (k: string): k is GlyphKey => k in SPECS && !(SPECS[k as keyof Params] as Extra).global;

/** The settings a free font's letters follow, as far as they're moved from the ones it was picked at (Params.freeAt). */
export type FreeKey = KeysWhere<{ free: true }>;
export const FREE_AT_KEYS = PARAM_KEYS.filter(k => (SPECS[k] as Extra).free) as FreeKey[];
export type FreeAt = Partial<Pick<Params, FreeKey>>;

/** The settings kept as a letter's own values by id (its stroke ends, corners, joins, strokes). */
export const ID_KEYS = PARAM_KEYS.filter(k => SPECS[k].kind === 'ids');

export type NumericParam = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params];

/** The settings shown as controls, and the sliders nested under each control `P`. */
export type ControlKey = KeysWhere<{ control: object }>;
export type SubKeyOf<P extends ControlKey> = KeysWhere<{ sub: { parent: P } }>;
export type SubKey = KeysWhere<{ sub: object }>;
