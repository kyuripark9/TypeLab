/* Every setting in one place: what it defaults to, what values it takes, whether every letter shares it
   (global) or a letter can have its own, whether a free font's letters follow it (free), and where it sits
   in the editor: as a control on a page (control) or a slider nested under one (sub). DEFAULTS, the checks in
   clean.ts, isGlyphKey, FREE_AT_KEYS, ID_KEYS and the editor's CONTROLS and SUBS (shared/content/controls.ts)
   are all read off it.

   Adding a setting: its field in model.ts (the compiler then asks for its entry here), its entry here, and
   the engine code that draws it. A slider also needs its icon (client/components/SliderIcons.tsx; a test
   checks). Entries run in the editor's order: a page shows its controls in the order they are listed, a choice
   of shape before the sliders that tune it, the optional ones after and the advanced ones last; a nested
   slider follows the control it sits under. A page's entries may sit in several runs (Weight and
   Size & slant each have two): in the editor only the order among one page's own entries, and among one
   control's nested sliders, matters. */
import type { Params } from './model';
import { isCornerId, isEndId, isJoinId, isStrokeId, isTurnId } from './scales';
import { A_FORMS, APEX_FORMS, BAR_ENDS, BENDS, BLOCK_FORMS, BOWL_FORMS, BOWL_JOINS, BUILDS, DIAGONALS, DOTS, FILLS, G_FORMS, I_FORMS, J_FORMS, K_FORMS, M_FORMS, MIRRORS, Q_FORMS,
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
  /** the words at the slider's two ends */
  lo?: string;
  hi?: string;
  /** letters drawn in the explainer diagram */
  demo: string;
  /** the explainer's text under the title; settings search reads it too */
  explain: string;
  /** how the panel draws the control (client/components/panel/ControlsPanel.tsx): 'options' the Stroke ends
      picker, 'story' the Letter a picker, 'form' a letter-shape picker (its shapes in FORM_OPTIONS,
      shared/content/controls.ts), 'serif' the Serifs switch with its shapes, 'serifForm' the serifs' Tips,
      Base, Sides or Inside serifs picker, 'fill' the Fill picker; none, a slider */
  type?: 'options' | 'story' | 'form' | 'serif' | 'serifForm' | 'fill';
  /** the diagram closes in on the foot of the letters, where a serif's finer shape shows */
  zoom?: boolean;
  /** 0.5 is the neutral middle, and the slider's track marks it */
  bipolar?: boolean;
  /** a turn: shown in degrees, -180 to 180, rather than 0 to 100 */
  degrees?: boolean;
  /** tagged Advanced on the control; its entry goes last on its page (a test checks) */
  advanced?: boolean;
  /** An optional slider: its value where it changes nothing. It gets an on/off switch, and off hides the slider. */
  off?: number;
}
/** A slider nested under a control: its words, and bipolar, as on ControlDef; `explain` where it needs its own, else
    the explainer shows its control's. */
export interface SubControlDef { label: string; friendly: string; tech: string; lo: string; hi: string; bipolar?: boolean; explain?: string }

interface Extra {
  /** every letter shares it: the heights all letters stand on, spacing and fills that run across a line.
      A letter can't own it: cleanGlyphs (clean.ts) drops a letter's value for a global setting on reading,
      so making a setting global loses the values letters were saved with. */
  global?: boolean;
  /** a free font's letters follow it, as far as it is moved from where the font was picked (Params.freeAt).
      It joins FREE_AT_KEYS, and sanitizeParams takes an older design's value of it as the one the font's
      letters stand for. The free-font code has to move the letters for it (freeLetters in
      shared/engine/free-letters.ts, skin.ts, restyle.ts), or the setting does nothing on a free font: check
      with npm run golden. */
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

/** A number from 0 to 1, defaulting to `d`. */
const num = <const O extends Extra = {}>(d: number, o?: O) => ({ kind: 'number' as const, default: d, ...(o as O) });
/** On or off, defaulting to `d`. */
const bool = <const O extends Extra = {}>(d: boolean, o?: O) => ({ kind: 'boolean' as const, default: d, ...(o as O) });
/** One of `options` (see options.ts), defaulting to `d`. */
const option = <const T extends string, const O extends Extra = {}>(options: readonly T[], d: NoInfer<T>, o?: O) =>
  ({ kind: 'option' as const, default: d, options, ...(o as O) });
/** A letter's own values by id, each id passing `test` (see scales.ts), none by default. */
const ids = <const O extends Extra = {}>(test: (id: string) => boolean, o?: O) =>
  ({ kind: 'ids' as const, default: {} as Record<string, number>, ids: test, ...(o as O) });
/** A free font's id (see fontId in shared/free-fonts.ts), '' for none. */
const fontSpec = <const O extends Extra = {}>(o?: O) => ({ kind: 'font' as const, default: '', ...(o as O) });
/** A value of type T that clean.ts checks itself, defaulting to `d`. */
const value = <T, const O extends Extra = {}>(d: T, o?: O) => ({ kind: 'value' as const, default: d, ...(o as O) });

export const SPECS = {
  /* ---- Weight */
  weight: num(0.4, { free: true, control: { cat: 'weight', label: 'Weight', friendly: 'Make strokes thicker', tech: 'Weight', lo: 'Thin', hi: 'Bold', demo: 'n',
    explain: 'Letters widen a little so their insides stay open.' } }),
  vWeight: num(0.5, { free: true,
    sub: { parent: 'weight', label: 'Verticals', friendly: 'Thin or thicken the uprights', tech: 'Stem weight', lo: 'Lighter', hi: 'Heavier', bipolar: true } }),
  hWeight: num(0.5, { free: true,
    sub: { parent: 'weight', label: 'Horizontals', friendly: 'Thin or thicken horizontals', tech: 'Bar weight', lo: 'Lighter', hi: 'Heavier', bipolar: true } }),

  /* ---- Size & slant */
  width: num(0.5, { free: true, control: { cat: 'size', label: 'Width', friendly: 'Make letters narrow or wide', tech: 'Width', lo: 'Condensed', hi: 'Expanded', demo: 'H',
    explain: 'Stretches letters sideways; strokes keep their thickness.' } }),
  height: num(0.5, { global: true, control: { cat: 'size', label: 'Height', friendly: 'Make letters taller or shorter', tech: 'Height', lo: 'Short', hi: 'Tall', demo: 'Hx',
    explain: 'Moves the top of the capitals; lowercase follows.' } }),
  slant: num(0, { free: true, control: { cat: 'size', label: 'Slant', friendly: 'Tilt the letters', tech: 'Slant', lo: 'Upright', hi: 'Italic', demo: 'Hn',
    explain: 'Leans each letter to the right, like an oblique italic.' } }),
  rotation: num(0.5, { free: true, control: { cat: 'size', label: 'Rotation', friendly: 'Turn the letters round', tech: 'Rotation', lo: 'Anticlockwise', hi: 'Clockwise', demo: 'Hag', bipolar: true, degrees: true,
    explain: 'Turns each letter about its middle. Customize a letter to give it its own angle.' } }),

  /* ---- Weight */
  contrast: num(0.5, { free: true, control: { cat: 'weight', label: 'Contrast', friendly: 'Vary thick and thin strokes', tech: 'Contrast · Reverse contrast', lo: 'Reversed', hi: 'High', demo: 'HOe', bipolar: true,
    explain: 'Thins the horizontals against heavy stems; reversed, it thins the stems instead.' } }),
  pinch: num(0, { free: true, control: { cat: 'weight', off: 0, label: 'Pinch', friendly: 'Thin the strokes to a point', tech: 'Pinch · Waist', lo: 'Slight', hi: 'To a point', demo: 'aplo',
    explain: 'Strokes narrow toward a level line and swell out again, like an hourglass.' } }),
  pinchPos: num(0.5, { free: true,
    sub: { parent: 'pinch', label: 'Position', friendly: 'Move the pinch up or down', tech: 'Pinch height', lo: 'Baseline', hi: 'Cap height' } }),

  /* ---- Build & curves */
  build: option(BUILDS, 'strokes', { free: true, control: { cat: 'curves', type: 'form', label: 'Built from', friendly: 'Draw with strokes or blocks', tech: 'Stroke or block construction', demo: 'EOS',
    explain: 'Strokes drawn along a skeleton, or solid blocks cut to the design’s measures.' } }),
  blockForm: option(BLOCK_FORMS, 'basic', { control: { cat: 'curves', type: 'form', label: 'Block letters', friendly: 'Plain, slot or grid blocks', tech: 'Block letterforms', demo: 'Rag',
    explain: 'Plain blocks with a real lowercase, blocks with slots cut in, or cells on a grid.' } }),
  bowlForm: option(BOWL_FORMS, 'oval', { free: true, control: { cat: 'curves', type: 'form', label: 'Bowls', friendly: 'Make bowls ovals or boxes', tech: 'Oval or box bowls', demo: 'OCS',
    explain: 'Boxes have straight sides and corners round outside, square inside.' } }),
  boxRound: num(0.5, { free: true, sub: { parent: 'bowlForm', label: 'Corners', friendly: 'Round box bowls’ corners', tech: 'Box corner radius', lo: 'Sharp', hi: 'Wide' } }),
  curve: num(0.2, { free: true, control: { cat: 'curves', label: 'Curves', friendly: 'Geometric or organic curves', tech: 'Curve', lo: 'Geometric', hi: 'Organic', demo: 'Sae',
    explain: 'Compass-drawn circles, or fuller pen-like curves.' } }),
  squareness: num(0, { free: true, control: { cat: 'curves', off: 0, label: 'Squareness', friendly: 'Square off the circles', tech: 'Squareness · Superellipse', lo: 'Circle', hi: 'Square', demo: 'Oo',
    explain: 'Bowls square off while the corners stay smooth.' } }),
  chamfer: num(0, { free: true, control: { cat: 'curves', off: 0, label: 'Facets', friendly: 'Cut curves into flat facets', tech: 'Chamfer · Faceted', lo: 'Curved', hi: 'Cut', demo: 'Oes',
    explain: 'Curves become straight lines with cut-off corners.' } }),
  bowlJoin: option(BOWL_JOINS, 'curved', { free: true, control: { cat: 'curves', type: 'form', label: 'Joins', friendly: 'Curve bowls out of stems', tech: 'Bowl & shoulder joins', demo: 'dnu',
    explain: 'Square joins meet the stem flat, like a D, in b d p q g, n m h r u and a.' } }),
  overlap: num(1, { free: true, control: { cat: 'curves', off: 1, label: 'Bowl overlap', friendly: 'Join or part bowl and stem', tech: 'Bowl overlap', lo: 'Apart', hi: 'Merged', demo: 'bdpq',
    explain: 'Applies to b, d, p, q and the single-storey a.' } }),

  /* ---- Corners */
  roundness: num(0, { free: true, control: { cat: 'corners', label: 'Roundness', friendly: 'Soften or sharpen the letters', tech: 'Roundness', lo: 'Sharp', hi: 'Round', demo: 'Ek',
    explain: 'Rounds corners and stroke ends. Joins and Counters round the corners inside.' } }),
  joinRound: num(0, { free: true,
    sub: { parent: 'roundness', label: 'Joins', friendly: 'Fill in the narrow crotches', tech: 'Fillets · Crotches', lo: 'Sharp', hi: 'Round',
      explain: 'Fills the narrow crotches where strokes meet at a slant, as in n, b, K and v.' } }),
  innerRound: num(0, { free: true,
    sub: { parent: 'roundness', label: 'Counters', friendly: 'Round the inside corners', tech: 'Counter corner radius', lo: 'As drawn', hi: 'Round',
      explain: 'Rounds the square corners inside letters, as in H, E, B and box bowls.' } }),
  bends: option(BENDS, 'sharp', { free: true, control: { cat: 'corners', type: 'form', label: 'Bends', friendly: 'Make bends sharp or round', tech: 'Sharp or round vertices', demo: 'MNZ',
    explain: 'Where a stroke turns, as in M, N and Z: a point, or a round bend like bent wire.' } }),
  apex: num(0.4, { free: true, control: { cat: 'corners', label: 'Peaks', friendly: 'Make peaks pointed or flat', tech: 'Apex', lo: 'Pointed', hi: 'Flat', demo: 'AV',
    explain: 'Where diagonals meet, atop A and under V. With round bends, how wide they turn.' } }),
  steps: num(0, { free: true, control: { cat: 'corners', off: 0, label: 'Steps', friendly: 'Cut steps into the corners', tech: 'Stepped corners · Notches', lo: 'Small', hi: 'Stroke wide', demo: 'LOE',
    explain: 'Cuts a square notch into each square corner, like a letter built on a grid.' } }),
  joints: num(0, { free: true, control: { cat: 'corners', off: 0, label: 'Ink traps', friendly: 'Carve ink traps into joins', tech: 'Ink traps · Joints', lo: 'Solid', hi: 'Trapped', demo: 'nab',
    explain: 'Corners are carved out where strokes join.' } }),

  /* ---- Stroke ends */
  terminal: option(TERMINALS, 'flat', { free: true, control: { cat: 'ends', type: 'options', label: 'Stroke ends', friendly: 'Choose how strokes end', tech: 'Letter endings · Terminals', demo: 'Cas',
    explain: 'The free tips of strokes, as on C, a, s and r: how they end and how far they reach.' } }),
  terminalLength: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Length', friendly: 'Lengthen or shorten ends', tech: 'Terminal length', lo: 'Short', hi: 'Long' } }),
  terminalCurl: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Curl', friendly: 'Curl the stroke ends', tech: 'Terminal curl', lo: 'Flared out', hi: 'Curled in', bipolar: true } }),
  terminalFlare: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Flare', friendly: 'Widen the stroke as it ends', tech: 'Flared terminal', lo: 'Slight', hi: 'Wide' } }),
  terminalDepth: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Depth', friendly: 'Hollow the end out deeper', tech: 'Terminal depth', lo: 'Shallow', hi: 'Deep' } }),
  terminalSize: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Size', friendly: 'Resize the drop on the end', tech: 'Ball size', lo: 'Small', hi: 'Big' } }),
  terminalRound: num(1, { free: true,
    sub: { parent: 'terminal', label: 'Roundness', friendly: 'Round off the end', tech: 'Terminal radius', lo: 'Soft corners', hi: 'Half circle' } }),
  terminalPoint: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Sharpness', friendly: 'Sharpen the point', tech: 'Point length', lo: 'Less sharp', hi: 'Sharper' } }),
  terminalClip: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Cut off', friendly: 'Clip the tip of the point', tech: 'Clipped point', lo: 'A little', hi: 'A lot' } }),
  terminalLean: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Lean', friendly: 'Move the point in or out', tech: 'Point offset', lo: 'Inside', hi: 'Outside', bipolar: true } }),
  terminalSlope: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Slope', friendly: 'Cut the end gently or steeply', tech: 'Terminal angle', lo: 'Gentle', hi: 'Steep' } }),
  terminalTilt: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Tilt', friendly: 'Tilt the level cut', tech: 'Cut angle', lo: 'Falling', hi: 'Rising', bipolar: true } }),
  terminalTip: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Tip', friendly: 'Make the tip blunt or fine', tech: 'Taper tip width', lo: 'Blunt', hi: 'Fine' } }),
  terminalTaper: num(0.5, { free: true,
    sub: { parent: 'terminal', label: 'Taper length', friendly: 'Start the taper near or far', tech: 'Taper length', lo: 'Short', hi: 'Long' } }),

  /* ---- Serifs */
  serif: bool(false, { free: true, control: { cat: 'serifs', type: 'serif', label: 'Serifs', friendly: 'Add small feet to the strokes', tech: 'Serifs', demo: 'In',
    explain: 'Small finishing strokes at the ends of stems: their shape, length, weight and slope.' } }),
  serifSize: num(0.45, { free: true,
    sub: { parent: 'serif', label: 'Length', friendly: 'Make the feet longer', tech: 'Serif size', lo: 'Short', hi: 'Long' } }),
  serifThickness: num(0.35, { free: true,
    sub: { parent: 'serif', label: 'Thickness', friendly: 'Make the feet heavier', tech: 'Serif thickness', lo: 'Hairline', hi: 'Heavy' } }),
  serifAngle: num(0.2, { free: true,
    sub: { parent: 'serif', label: 'Angle', friendly: 'Slope the top of the feet', tech: 'Serif angle', lo: 'Flat', hi: 'Sloped' } }),
  serifBracket: num(0.5, { free: true,
    sub: { parent: 'serif', label: 'Bracket', friendly: 'Curve the feet into the stem', tech: 'Bracket', lo: 'Tight', hi: 'Long', bipolar: true } }),
  serifTip: option(SERIF_TIPS, 'square', { free: true, control: { cat: 'serifs', type: 'serifForm', zoom: true, label: 'Tips', friendly: 'Choose how the serifs finish', tech: 'Serif tips', demo: 'I',
    explain: 'The outer end of each serif: square, rounded, pointed, or cut on a slant.' } }),
  serifTipRound: num(1, { free: true,
    sub: { parent: 'serifTip', label: 'Roundness', friendly: 'Round off the serif tips', tech: 'Tip radius', lo: 'Soft corners', hi: 'Half circle' } }),
  serifTipSlant: num(0.8, { free: true,
    sub: { parent: 'serifTip', label: 'Slant', friendly: 'Slant the cut at the tip', tech: 'Tip angle', lo: 'Undercut', hi: 'Sloped', bipolar: true } }),
  serifBase: option(SERIF_BASES, 'flat', { free: true, control: { cat: 'serifs', type: 'serifForm', zoom: true, label: 'Base', friendly: 'Keep feet flat or arch them', tech: 'Flat or cupped serifs', demo: 'I',
    explain: 'A cupped serif arches up under its stem, so only its tips touch the line.' } }),
  serifCup: num(0.5, { free: true,
    sub: { parent: 'serifBase', label: 'Depth', friendly: 'Arch the base a little or a lot', tech: 'Cup depth', lo: 'Shallow', hi: 'Deep' } }),
  serifSides: option(SERIF_SIDES, 'both', { free: true, control: { cat: 'serifs', type: 'serifForm', label: 'Sides', friendly: 'Choose where serifs reach', tech: 'Serif direction · Half serifs', demo: 'Hn',
    explain: 'Serifs reach both ways from a stem, one way only, or only into or out of the letter.' } }),
  serifInner: option(SERIF_INNERS, 'same', { free: true, control: { cat: 'serifs', type: 'serifForm', zoom: true, label: 'Inside serifs', friendly: 'Shape the inside serifs', tech: 'Inner & outer serifs', demo: 'n',
    explain: 'Serifs reaching into the letter get their own shape, length and thickness.' } }),
  serifInnerSize: num(0.5, { free: true,
    sub: { parent: 'serifInner', label: 'Length', friendly: 'Lengthen the inside serifs', tech: 'Inner serif size', lo: 'Shorter', hi: 'Longer', bipolar: true } }),
  serifInnerThickness: num(0.5, { free: true,
    sub: { parent: 'serifInner', label: 'Thickness', friendly: 'Thin or thicken inside serifs', tech: 'Inner serif thickness', lo: 'Lighter', hi: 'Heavier', bipolar: true } }),
  serifBalance: num(0.5, { free: true, control: { cat: 'serifs', zoom: true, bipolar: true, label: 'Balance', friendly: 'Reach further to one side', tech: 'Serif balance', lo: 'Left', hi: 'Right', demo: 'I',
    explain: 'Serifs on stems reach further to one side; in the middle both sides match.' } }),
  serifTops: num(0.5, { free: true, control: { cat: 'serifs', bipolar: true, label: 'Top serifs', friendly: 'Size the serifs on top', tech: 'Head serifs', lo: 'Small', hi: 'Large', demo: 'Hdn',
    explain: 'The serifs on top of stems, set apart from the feet on the baseline.' } }),
  serifArms: num(0.5, { free: true, control: { cat: 'serifs', bipolar: true, label: 'Arm serifs', friendly: 'Size the serifs on arms', tech: 'Arm serifs · Beaks', lo: 'Small', hi: 'Large', demo: 'ETZ',
    explain: 'The serifs at the ends of arms, as on E, F, L, T and Z: their size, weight and lean.' } }),
  serifArmThickness: num(0.5, { free: true,
    sub: { parent: 'serifArms', label: 'Thickness', friendly: 'Thin or thicken arm serifs', tech: 'Arm serif thickness', lo: 'Lighter', hi: 'Heavier', bipolar: true } }),
  serifArmLean: num(0.5, { free: true,
    sub: { parent: 'serifArms', label: 'Lean', friendly: 'Lean the arm serifs in or out', tech: 'Splayed arm serifs', lo: 'In', hi: 'Out', bipolar: true } }),

  /* ---- Letters */
  story: option(STORIES, 'auto', { free: true, control: { cat: 'letters', type: 'story', label: 'Letter a', friendly: 'Choose the shape of the a', tech: 'Double / single storey a', demo: 'data',
    explain: 'Two storeys like book type, or one bowl like handwriting, with or without a spur.' } }),
  diagonals: option(DIAGONALS, 'symmetric', { free: true, control: { cat: 'letters', type: 'form', label: 'Letters A, V and W', friendly: 'Straighten or arch A, V, W', tech: 'Symmetric, upright or arched diagonals', demo: 'AVW',
    explain: 'Matching diagonals, one leaning on an upright stem, or arches like an upturned U.' } }),
  apexForm: option(APEX_FORMS, 'plain', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter A', friendly: 'Choose the top of the A', tech: 'A apex · Apex serif', demo: 'AH',
    explain: 'A peak, pointed or flat as Peaks sets it, or a serif laid across the top.' } }),
  gForm: option(G_FORMS, 'hook', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter g', friendly: 'Choose the shape of the g', tech: 'Single- or double-storey g', demo: 'gag',
    explain: 'A tail hooked under the bowl or from its left side, or two storeys like book type.' } }),
  iForm: option(I_FORMS, 'auto', { free: true, control: { cat: 'letters', type: 'form', label: 'Letters I, J, i and l', friendly: 'Give I, J, i and l bars', tech: 'Barred I, J, i and l', demo: 'IJil',
    explain: 'A plain stem, or bars and feet as in a typewriter face.' } }),
  jForm: option(J_FORMS, 'hook', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter J', friendly: 'Choose the foot of the J', tech: 'J hook', demo: 'JU',
    explain: 'The foot hooks out to the left, or turns right round into a cup.' } }),
  kForm: option(K_FORMS, 'arm', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter k', friendly: 'Choose the joint of k', tech: 'k and K junction', demo: 'kK',
    explain: 'The leg springs from the arm, both meet at the stem, or at the end of a short bar.' } }),
  mForm: option(M_FORMS, 'full', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter M', friendly: 'Raise or lower M’s middle', tech: 'M vertex', demo: 'MN',
    explain: 'The diagonals of the M meet on the baseline, or a quarter of the way up.' } }),
  qForm: option(Q_FORMS, 'crossing', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter Q', friendly: 'Choose where Q’s tail goes', tech: 'Q tail', demo: 'QO',
    explain: 'The tail crosses the bowl, runs out from inside it, or sweeps out below in a curve.' } }),
  rForm: option(R_FORMS, 'leg', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter R', friendly: 'Choose the leg of R', tech: 'R leg', demo: 'RP',
    explain: 'The leg runs down from the bowl, or the bowl loops back round into the leg.' } }),
  sForm: option(S_FORMS, 'curved', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter s', friendly: 'Choose the shape of the s', tech: 'Spine of s', demo: 'sS$',
    explain: 'A spine curving from corner to corner, or running flat between two tight turns.' } }),
  yForm: option(Y_FORMS, 'forked', { free: true, control: { cat: 'letters', type: 'form', label: 'Letter Y', friendly: 'Choose the shape of the Y', tech: 'Forked or cup Y', demo: 'Yy',
    explain: 'Two arms forking off a stem, or a cup running on down into a diagonal, like a 4.' } }),
  dots: option(DOTS, 'auto', { free: true, control: { cat: 'letters', type: 'form', label: 'Dots', friendly: 'Make dots square or round', tech: 'Tittles & periods', demo: 'ij.!',
    explain: 'The dots on i and j and in the punctuation, whatever the corners do.' } }),
  dotSize: num(0.5, { free: true,
    sub: { parent: 'dots', label: 'Size', friendly: 'Shrink or grow the dots', tech: 'Dot size', lo: 'Small', hi: 'Big' } }),

  /* ---- Size & slant */
  mirror: option(MIRRORS, 'normal', { free: true, control: { cat: 'size', type: 'form', label: 'Mirror', friendly: 'Flip letters left to right', tech: 'Mirrored letters', demo: 'eRs',
    explain: 'Draws letters back to front. Customize a letter to mirror only that one.' } }),

  /* ---- Handwriting */
  cursive: num(0, { free: true, control: { cat: 'script', off: 0, label: 'Cursive', friendly: 'Lead into the next letter', tech: 'Cursive · Entry & exit strokes', lo: 'Print', hi: 'Script', demo: 'nigu',
    explain: 'Strokes flick on toward the next letter, like script.' } }),
  wobble: num(0, { free: true, control: { cat: 'script', off: 0, label: 'Hand-drawn', friendly: 'Make it look drawn by hand', tech: 'Hand-drawn · Irregularity', lo: 'Precise', hi: 'Wobbly', demo: 'Hand',
    explain: 'Strokes drift, swell and sit a little off the line.' } }),
  scriptForm: option(SCRIPT_FORMS, 'auto', { free: true, control: { cat: 'script', type: 'form', label: 'Letterforms', friendly: 'Write joined script or print', tech: 'Print or script letterforms', demo: 'Rain',
    explain: 'Print letters built like type, or script written with a pen and joined on hairlines.' } }),
  swell: num(0, { control: { cat: 'script', off: 0, label: 'Swell', friendly: 'Press into the downstrokes', tech: 'Pointed pen · Pressure', lo: 'At once', hi: 'Gradual', demo: 'nitu',
    explain: 'Each downstroke swells from a fine point and lets up again, as a pointed pen does.' } }),

  /* ---- Heights */
  xHeight: num(0.679, { global: true, free: true, control: { cat: 'heights', label: 'Lowercase height', friendly: 'Make lowercase letters taller', tech: 'x-height', lo: 'Small', hi: 'Large', demo: 'Hxn',
    explain: 'Taller lowercase feels modern and reads well small.' } }),
  extenders: num(0.5, { global: true, free: true, control: { cat: 'heights', label: 'Stem length', friendly: 'Extend stems up and down', tech: 'Ascenders & descenders', lo: 'Short', hi: 'Long', demo: 'hpdy',
    explain: 'The parts of b, d and h above the x-height, and of g, p and y below the baseline.' } }),
  tail: num(0.5, { free: true, control: { cat: 'heights', label: 'Tails & hooks', friendly: 'Lengthen tails and hooks', tech: 'Tail · Hook', lo: 'Short', hi: 'Long', demo: 'Qjty',
    explain: 'The trailing ends of Q, y, g, j, t, f and the comma.' } }),
  crossbar: num(0.5, { free: true, control: { cat: 'heights', label: 'Crossbar height', friendly: 'Move the bars up or down', tech: 'Crossbar', lo: 'Low', hi: 'High', demo: 'AHe',
    explain: 'The bars of A, H, e, f and t, and the waists of B, E and R.' } }),
  barGap: num(0, { free: true,
    sub: { parent: 'crossbar', label: 'Gap', friendly: 'Open gaps at the crossbars', tech: 'Crossbar gap', lo: 'Touching', hi: 'Apart' } }),
  descender: num(0.5, { global: true, free: true, control: { cat: 'heights', advanced: true, label: 'Descender length', friendly: 'Lengthen descenders only', tech: 'Descenders', lo: 'Short', hi: 'Long', demo: 'gpy',
    explain: 'The parts below the baseline, apart from the ascenders above the x-height.' } }),

  /* ---- Inner space */
  counter: num(0.5, { free: true, control: { cat: 'insides', label: 'Inner space', friendly: 'Size the space inside letters', tech: 'Counter', lo: 'Small', hi: 'Large', demo: 'Bo',
    explain: 'The enclosed space inside O, B, a and e.' } }),
  aperture: num(0.5, { free: true, control: { cat: 'insides', label: 'Openness', friendly: 'Open or close the letters', tech: 'Aperture', lo: 'Closed', hi: 'Open', demo: 'ces',
    explain: 'Open mouths on c, e and s stay readable when small.' } }),

  /* ---- Spacing */
  letterSpacing: num(0.2, { global: true, control: { cat: 'spacing', label: 'Letter spacing', friendly: 'Loosen or tighten the letters', tech: 'Letter spacing · Tracking', lo: 'Tight', hi: 'Open', demo: 'type',
    explain: 'The same gap changes between every pair of letters.' } }),
  wordSpacing: num(0.35, { global: true, control: { cat: 'spacing', label: 'Word spacing', friendly: 'Set the gap between words', tech: 'Word spacing', lo: 'Compact', hi: 'Spacious', demo: 'to be',
    explain: 'Too tight and words merge; too loose and lines fall apart.' } }),
  mono: num(0, { global: true, free: true, control: { cat: 'spacing', off: 0, label: 'Monospace', friendly: 'Give every letter one width', tech: 'Monospace', lo: 'Proportional', hi: 'Monospaced', demo: 'milk',
    explain: 'Every character takes the same width, like a typewriter.' } }),
  sideBearing: num(0.5, { free: true, control: { cat: 'spacing', advanced: true, label: 'Side margins', friendly: 'Adjust the margins of letters', tech: 'Side bearing', lo: 'Narrow', hi: 'Wide', demo: 'HO',
    explain: 'The small margins built into each letter.' } }),

  /* ---- Effects */
  fill: option(FILLS, 'solid', { global: true, free: true, control: { cat: 'effects', type: 'fill', label: 'Fill', friendly: 'Change what fills the letters', tech: 'Fill', demo: 'Rg',
    explain: 'What fills the letters: ink, a pattern, an outline, an inline or a shadow.' } }),
  module: num(0.4, { global: true,
    sub: { parent: 'fill', label: 'Size', friendly: 'Size the grid, line or shadow', tech: 'Module size', lo: 'Fine', hi: 'Coarse' } }),
  dotGain: num(0.5, { global: true,
    sub: { parent: 'fill', label: 'Spread', friendly: 'Part the dots or merge them', tech: 'Dot gain', lo: 'Apart', hi: 'Merged' } }),
  stencil: num(0, { free: true, control: { cat: 'effects', off: 0, label: 'Stencil', friendly: 'Cut gaps where strokes join', tech: 'Stencil', lo: 'Solid', hi: 'Wide gaps', demo: 'BOa',
    explain: 'Strokes break where they join, as if cut from a sheet.' },
    sub: { parent: 'stencil', label: 'Thickness', friendly: 'Open the gaps wider', tech: 'Gap width', lo: 'Thin', hi: 'Thick' } }),
  stencilPos: num(0, { free: true,
    sub: { parent: 'stencil', label: 'Position', friendly: 'Slide gaps along the strokes', tech: 'Gap position', lo: 'At the join', hi: 'Further out' } }),
  stencilRound: num(0, { free: true,
    sub: { parent: 'stencil', label: 'Rounding', friendly: 'Round the gaps’ corners', tech: 'Cut corner radius', lo: 'Sharp', hi: 'Round' } }),
  slice: num(0, { free: true, control: { cat: 'effects', off: 0, label: 'Slice', friendly: 'Cut a line through letters', tech: 'Slice', lo: 'None', hi: 'Wide', demo: 'type',
    explain: 'One level cut runs across the whole line.' },
    sub: { parent: 'slice', label: 'Thickness', friendly: 'Make the cut taller', tech: 'Cut height', lo: 'Thin', hi: 'Thick' } }),
  slicePos: num(0.5, { sub: { parent: 'slice', label: 'Position', friendly: 'Move the cut up or down', tech: 'Slice height', lo: 'Low', hi: 'High' } }),
  sliceRound: num(0, { sub: { parent: 'slice', label: 'Rounding', friendly: 'Round the cut’s corners', tech: 'Cut corner radius', lo: 'Sharp', hi: 'Round' } }),
  rough: num(0, { global: true, control: { cat: 'effects', off: 0, label: 'Rough edges', friendly: 'Rough edges like worn print', tech: 'Rough edges', lo: 'Clean', hi: 'Rough', demo: 'Type',
    explain: 'The edges wander a little, as ink spreads into paper or a worn block prints.' } }),

  /* ---- not a control of their own: pickers inside another control (barEnds under Crossbar height,
     terminalRun and terminalForm under Stroke ends, aForm under Letter a, serifShape under Serifs), the
     per-id values a letter sets one by one, the personality macros (see Params.geoHuman), and what the design
     carries (its customized and drawn letters, its free font and the settings that font was picked at) */
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
  freeFont: fontSpec({ global: true }),
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
/** A setting one letter can have its own value of. */
export type GlyphKey = Exclude<keyof Params, GlobalKey>;
export type GlyphParams = Partial<Pick<Params, GlyphKey>>;
export const isGlyphKey = (k: string): k is GlyphKey => k in SPECS && !(SPECS[k as keyof Params] as Extra).global;

/** The settings a free font's letters follow, as far as they're moved from the ones it was picked at (Params.freeAt). */
export type FreeKey = KeysWhere<{ free: true }>;
export const FREE_AT_KEYS = PARAM_KEYS.filter(k => (SPECS[k] as Extra).free) as FreeKey[];
export type FreeAt = Partial<Pick<Params, FreeKey>>;
/** The settings `p` has that a free font's letters follow: what a style's free font stands for, written in it. */
export const freeAtOf = (p: Params): FreeAt => Object.fromEntries(FREE_AT_KEYS.map(k => [k, p[k]]));

/** The settings a letter drawn in Points was drawn at (Drawn.at, in shared/engine/outline.ts): every one but the
    letters' own maps, its own values laid in. Moved away from these, the drawing moves with them (family-drawn.ts). */
export type DrawnKey = Exclude<keyof Params, 'glyphs' | 'outlines'>;
export const DRAWN_AT_KEYS = PARAM_KEYS.filter(k => k !== 'glyphs' && k !== 'outlines') as DrawnKey[];
export type DrawnAt = Partial<Pick<Params, DrawnKey>>;
/** The settings letter `ch` of `p` is drawn at now: what a drawing of it made now records. */
export function drawnAtOf(p: Params, ch: string): DrawnAt {
  const lp: Params = p.glyphs?.[ch] ? { ...p, ...p.glyphs[ch] } : p;
  return Object.fromEntries(DRAWN_AT_KEYS.map(k => [k, lp[k]]));
}

/** The settings kept as a letter's own values by id (its stroke ends, corners, joins, strokes). */
export type IdKey = KeysWhere<{ kind: 'ids' }>;
export const ID_KEYS = PARAM_KEYS.filter(k => SPECS[k].kind === 'ids') as IdKey[];

export type NumericParam = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params];

/** The settings shown as controls, and the sliders nested under each control `P`. */
export type ControlKey = KeysWhere<{ control: object }>;
export type SubKeyOf<P extends ControlKey> = KeysWhere<{ sub: { parent: P } }>;
export type SubKey = KeysWhere<{ sub: object }>;
