/* How far each slider may carry TypeLab's own fonts' letters from where their card picks them and leave them whole, by
   font id as STYLE_FONTS names it and by setting: the least and the most of the slider (0..1). Carried further, a
   setting broke the letters on its card: Lowercase height lumped a grotesque's V and W where their diagonals meet the cap
   line, Inner space spurred its D and G, Squareness and Facets cracked a serif's bowls (npm run breaks, 2026-11-09).
   freeReins (engine/free-letters.ts) reins each in to these: the slider's way from the card's own value to its end is
   drawn over the way to the most kept here, each step its share, so the end draws the most that stays whole and every
   step still moves the letters; a twin's letters (a form the font hasn't drawn) are reined by as much. A setting whole
   to both ends isn't listed. Weight, Verticals, Horizontals, Contrast and Slant aren't reined (a family's weights and
   italics are solved on them, shared/family.ts), but on the Block card (Bulwark), where Weight past 80 shut its 6's
   and 9's counters and slit its G, Horizontals past its own pinched its a and e, moved with the other sliders
   (npm run breaks -- --sliders; REINS_BY_MIXES in tools/breaks.ts; and from the pickers and sliders moved together,
   npm run breaks -- --mixed: the Didone's Apex below 50, which cut off its V's and W's points at a light Weight, the
   code card's Weight and Verticals below 20, spurs and notches at its lightest, the Wood Type's Weight below 30 and
   Verticals below 20, its notches cutting through, the Formal Script's Wobble past 30, the serif italic's past 65,
   the Rounded card's past 80, the Didone's past 50 and the Chunky Round's and Blackletter's past 60, the Didone's H
   slit and its 8 shut at a wide Width, the Rounded's d and q wound through at its lightest, the Block card's Crossbar below 33, its e shut, and its Curl past 45, its ends curled in narrow, the Formal Script's Curl past 70, its exits curled shut, the Chunky Round's
   Weight past 90 and Verticals past 70, its A's and &'s
   counters filled in narrow, the serif italic's Joints past 70, its 4 and 8 cut to needles at its lightest, and the
   Geometric's Weight past 90, its b's, p's and q's bowls spurred at the stem with Serifs on),
   nor Width
   (shared/font-widths.ts), nor Bowl overlap (its way to a bowl apart from its stem passes through the bowl just
   leaving it). Measured on each card by tools/breaks.ts, the
   rein off, a side looked at drawn and found whole left free (BY_EYE there), then drawn in where the map, run again
   with the reins, still broke a letter's form: npm run breaks -- --update, npm run breaks, npm run breaks -- --tighten
   rewrite the table. */
import type { NumericParam } from './params';

export const FONT_REINS: Record<string, Partial<Record<NumericParam, [number, number]>>> = {
  'Mainline:600': { squareness: [0, 0.873], terminalTip: [0, 0.953], serifInnerSize: [0, 0.652], wobble: [0, 0.718], xHeight: [0.421, 1], crossbar: [0, 0.933], counter: [0, 0.649] },
  'Parlance:500': { squareness: [0, 0.893], serifTipRound: [0.625, 1], serifTipSlant: [0.769, 1], serifInnerSize: [0, 0.685], wobble: [0, 0.8], xHeight: [0.314, 1], slice: [0, 0.636], aperture: [0.4, 1] },
  'Compass:300': { curve: [0, 0.839], squareness: [0, 0.666], serifTipRound: [0.684, 1], serifCup: [0.143, 1], serifInnerSize: [0, 0.871], xHeight: [0.563, 1], counter: [0.024, 1], slice: [0, 0.652], weight: [0, 0.9] },
  'Cotton:300': { squareness: [0, 0.599], chamfer: [0, 0.917], steps: [0, 0.66], serifCup: [0, 0.81], serifInnerSize: [0, 0.943], slice: [0, 0.832], wobble: [0, 0.8] },
  'Turnpike:500': { curve: [0, 0.183], squareness: [0, 0.964], joinRound: [0, 0.027], terminalCurl: [0, 0.83], serifCup: [0.229, 0.554], serifInnerSize: [0.084, 0.759], cursive: [0, 0.816], wobble: [0, 0.917], xHeight: [0.456, 0.983], counter: [0, 0.783], weight: [0, 0.8] },
  'Orbital:600': { serifTipSlant: [0, 0.905], serifInnerSize: [0.049, 0.63], wobble: [0, 0.929], xHeight: [0.537, 1], crossbar: [0.239, 0.822], counter: [0, 0.862] },
  'Gumdrop:700': { squareness: [0, 0.855], terminalTip: [0, 0.945], serifInnerSize: [0, 0.63], xHeight: [0.369, 1], wobble: [0, 0.6], weight: [0, 0.9], vWeight: [0, 0.7], aperture: [0, 0.64] },
  'Almanac:500': { curve: [0, 0.767], squareness: [0, 0.359], chamfer: [0, 0.898], steps: [0, 0.46], serifTipRound: [0.911, 1], serifTipSlant: [0.561, 1], serifCup: [0.313, 0.587], serifInnerSize: [0, 0.802], serifInnerThickness: [0.272, 1], xHeight: [0.429, 0.942], counter: [0.113, 1] },
  'Vellum:400': { squareness: [0, 0.757], roundness: [0, 0.514], terminalLength: [0.045, 1], serifTipRound: [0.165, 1], serifCup: [0.411, 0.552], serifInnerSize: [0, 0.658], xHeight: [0.168, 1] },
  'Couture:600': { curve: [0, 0.962], squareness: [0, 0.478], roundness: [0, 0.757], joints: [0, 0.781], terminalCurl: [0, 0.678], serifCup: [0, 0.857], xHeight: [0.389, 1], counter: [0.156, 1], apex: [0.5, 1], wobble: [0, 0.5], weight: [0, 0.85] },
  'Sonnet:400i': { curve: [0.274, 1], squareness: [0.03, 0.704], chamfer: [0, 0.453], steps: [0, 0.554], joints: [0, 0.7], serifTipSlant: [0, 0.926], serifCup: [0, 0.664], serifInnerThickness: [0, 0.732], cursive: [0, 0.851], wobble: [0, 0.65], xHeight: [0.479, 0.929], tail: [0, 0.16], counter: [0, 0.961], mono: [0, 0.687], slice: [0, 0.464] },
  'Ballyhoo:400': { curve: [0, 0.736], squareness: [0, 0.43], chamfer: [0, 0.539], steps: [0, 0.464], joints: [0, 0.699], terminalCurl: [0, 0.462], terminalTip: [0, 0.783], serifTipRound: [0.719, 1], serifCup: [0.268, 0.593], serifInnerSize: [0, 0.666], xHeight: [0.513, 0.932], extenders: [0, 0.811], tail: [0, 0.861], counter: [0, 0.828], slice: [0, 0.933], weight: [0, 0.92], vWeight: [0, 0.75] },
  'Hearth:600': { serifTipRound: [0.833, 1], serifTipSlant: [0.026, 1], serifInnerSize: [0, 0.914], serifInnerThickness: [0.081, 1], wobble: [0, 0.761], xHeight: [0.449, 0.961], extenders: [0, 0.858], crossbar: [0.221, 0.88], counter: [0, 0.97] },
  'Timber:400': { terminalTilt: [0.051, 1], serifTipRound: [0.816, 1], serifTipSlant: [0.769, 1], serifCup: [0, 0.765], serifInnerSize: [0, 0.634], serifInnerThickness: [0.403, 0.792], xHeight: [0.391, 0.881], crossbar: [0.022, 1], counter: [0, 0.704], mono: [0, 0.914], weight: [0.3, 1], vWeight: [0.2, 1], terminalLength: [0, 0.6] },
  'Kernel:500': { squareness: [0, 0.73], terminalTip: [0, 0.738], serifTipRound: [0.723, 1], serifTipSlant: [0.597, 0.832], serifCup: [0.155, 1], serifInnerSize: [0, 0.664], wobble: [0, 0.929], xHeight: [0.474, 1], crossbar: [0.018, 1], counter: [0.209, 1], slice: [0, 0.687], weight: [0.2, 1], vWeight: [0.2, 1] },
  'Dispatch:400': { terminalTip: [0, 0.878], xHeight: [0.608, 1], crossbar: [0, 0.664], counter: [0.464, 1] },
  'Funnies:400': { squareness: [0, 0.667], chamfer: [0, 0.871], serifInnerSize: [0, 0.656], xHeight: [0.35, 1] },
  'Jotter:400': { curve: [0.168, 1], squareness: [0, 0.936], chamfer: [0, 0.558], cursive: [0, 0.3], xHeight: [0.071, 0.751] },
  'Boardwalk:400': { curve: [0.174, 1], squareness: [0, 0.269], chamfer: [0, 0.8], apex: [0, 0.536], joints: [0, 0.816], terminalLean: [0, 0.982], terminalTip: [0, 0.789], xHeight: [0, 0.859], counter: [0.043, 1] },
  'Serenade:400': { squareness: [0, 0.226], chamfer: [0, 0.394], terminalLength: [0, 0.672], terminalCurl: [0.141, 0.7], xHeight: [0.191, 1], wobble: [0, 0.3] },
  'Cathedral:400': { chamfer: [0.743, 1], steps: [0, 0.878], joints: [0, 0.421], terminalLength: [0, 0.839], xHeight: [0.489, 1], counter: [0, 0.856], wobble: [0, 0.6] },
  'Bulwark:700': { terminalLength: [0.032, 1], terminalCurl: [0, 0.45], serifTipRound: [0.18, 1], serifTipSlant: [0.625, 1], serifCup: [0.204, 1], serifInnerSize: [0, 0.656], wobble: [0, 0.644], xHeight: [0.528, 0.887], crossbar: [0.33, 0.887], counter: [0, 0.966], weight: [0, 0.8], hWeight: [0, 0.98] }
};

/* How much of the way FONT_REINS keeps the sliders that reshape a font's letters on their skeleton carry them, each
   side of the card's own value: half. Carried the whole way kept whole, the letters stay in one piece but no longer
   look drawn: an ascender's or a terminal's end stepped where it meets the moved stroke, Inner space and Lowercase
   height kinking the a's, c's, e's and s's ends (looked at in the app at 81 px on the Neo Grotesque, 2026-11-10; the
   checker reads pieces and counters, not these). Drawn halfway they read as the font redrawn. Weight, Width, Slant and
   the effects (slice, stencil) carry their whole way, as do the corners' sliders (Roundness, Joins, Counters, Facets,
   Steps, the box bowls' Corners), which round or cut each corner a share of the room it has; Bowl overlap and Tails & hooks, still broken halfway, are off the
   panel there (FONT_SLIDERS_OFF, shared/content/controls.ts). freeReins (engine/free-letters.ts) draws the slider's way
   over the share; tools/breaks.ts measures with it off (reinsOff empties FONT_REINS, and freeReins reads neither). */
export const FONT_REACH: Partial<Record<NumericParam, number>> = Object.fromEntries((['curve', 'squareness', 'apex',
  'joints', 'xHeight', 'extenders', 'descender', 'crossbar', 'barGap', 'counter', 'aperture', 'dotSize', 'cursive',
  'wobble', 'terminalLength',
  'terminalCurl', 'terminalFlare', 'terminalDepth', 'terminalSize', 'terminalRound', 'terminalPoint', 'terminalClip',
  'terminalLean', 'terminalSlope', 'terminalTilt', 'terminalTip', 'terminalTaper', 'serifCup'] as NumericParam[]).map(k => [k, 0.5]));

/* How far each slider may carry the letters the engine builds, the slot and grid blocks' and the arcs' (as lettersOf
   names them), from where their card on the Style page sets it and leave them whole: the least and the most of the
   slider and the card's own value (0..1). Carried further, the arcs' b and p bowls came off their stems at the lightest
   weight (with Width or Wobble moved too, below 16) and at Wobble past 35 wider and their P's and R's counters shut at the heaviest (and from 60 with most stroke ends but the card's own:
   Weight stops there, BUILT_BY_MIXES in tools/breaks.ts), the D's and L's strokes parted at a short Length, the
   stroke ends' sizes and points shut the B's and R's counters (npm run breaks -- --sliders, 2026-11-09), and a Length
   shorter than 45 parted the K's arms and the L's foot at a wide Width and one longer than 58 shut the R and crossed
   the F's arms at a heavy one (--mixed: the pickers and sliders moved
   together, as the slot blocks' Inner space below 15 shut their a's, p's and r's slots at Weight 90 and up, their
   Facets past 60 cut the counters through the sides at the lightest and narrowest, and their Crossbar past 80 pinched
   the a's and r's slots at the heaviest, and the grid blocks' Weight below 15 let Wobble shake their cells apart).
   builtReins
   (engine/free-letters.ts) reins each in as freeReins does a font's, Weight with them (a family is solved on the
   slider; drawn, a weight past the rein draws the most kept). The blocks' other sliders each keep them whole alone; what broke
   them, Verticals and Horizontals thinned apart, is off the panel there (BUILT_SUBS_OFF, shared/content/controls.ts).
   Measured by tools/breaks.ts, a value broken where a piece or counter changes on two letters or more (inForm, the
   blocks' bends and a slice's needles left out): npm run breaks -- --update-built rewrites the table. */
export const BUILT_REINS: Record<string, Partial<Record<NumericParam, [number, number, number]>>> = {
  'arcs': { weight: [0.16, 0.6, 0.2], terminalLength: [0.45, 0.58, 0.5], terminalDepth: [0, 0.837, 0.5], terminalSize: [0.141, 1, 0.5], terminalPoint: [0.043, 1, 0.5], terminalLean: [0.043, 1, 0.5], terminalTip: [0, 0.755, 0.5], wobble: [0, 0.35, 0] },
  'blocks:slots': { counter: [0.15, 1, 0.5], chamfer: [0, 0.6, 0], crossbar: [0, 0.8, 0.5] },
  'blocks:grid': { weight: [0.15, 1, 0.4] }
};
