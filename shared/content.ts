/* Starting styles, navigation, and the plain-language description of every control.
   Shared by the client (UI copy) and the server (validating style ids). */
import { DEFAULTS, type Params, type SerifShape, type Terminal } from './params';

export type CategoryId = 'style' | 'structure' | 'shape' | 'proportion' | 'spacing' | 'personality';
export type ControlKey =
  | 'weight' | 'width' | 'height' | 'slant' | 'contrast'
  | 'roundness' | 'curve' | 'terminal' | 'serif' | 'apex'
  | 'xHeight' | 'counter' | 'aperture' | 'crossbar'
  | 'letterSpacing' | 'wordSpacing' | 'sideBearing'
  | 'geoHuman' | 'softSharp' | 'classicFuture' | 'playfulFormal';
export type SerifSubKey = 'serifSize' | 'serifThickness' | 'serifAngle';
/** Anything the control panel can focus: a control or one of the serif sub-sliders. */
export type ActiveKey = ControlKey | SerifSubKey;

export interface ControlDef {
  cat: Exclude<CategoryId, 'style'>;
  /** plain-language label, shown first */
  friendly: string;
  /** the typographer's term */
  tech: string;
  lo?: string;
  hi?: string;
  /** letters drawn in the explainer diagram */
  demo: string;
  explain: string;
  type?: 'options' | 'serif';
  bipolar?: boolean;
  advanced?: boolean;
}
export interface SubControlDef { friendly: string; tech: string; lo: string; hi: string }

export interface StyleDef { id: string; name: string; tags: string; desc: string; params: Params }

const style = (id: string, name: string, tags: string, desc: string, p: Partial<Params>): StyleDef =>
  ({ id, name, tags, desc, params: { ...DEFAULTS, ...p } });

export const STYLES: StyleDef[] = [
  style('geometric', 'Geometric', 'Clean / Structured', 'Built from circles and straight lines. Neutral, even strokes and pointed peaks.',
    { weight: 0.4, contrast: 0.02, curve: 0, geoHuman: 0.3, apex: 0.12, counter: 0.58, xHeight: 0.46, aperture: 0.45 }),
  style('humanist', 'Humanist', 'Warm / Organic', 'Shaped like writing with a pen. Open letterforms, gentle stroke contrast and a human rhythm.',
    { weight: 0.4, contrast: 0.2, curve: 0.65, geoHuman: 0.85, terminal: 'angled', xHeight: 0.52, aperture: 0.75, apex: 0.45, width: 0.46 }),
  style('serif', 'Modern Serif', 'Elegant / Editorial', 'Crisp serifs, clear thick-and-thin strokes and classical proportions made for headlines and long reads.',
    { weight: 0.43, contrast: 0.55, serif: true, serifShape: 'bracketed', serifSize: 0.42, serifThickness: 0.22, serifAngle: 0.15,
      terminal: 'tapered', classicFuture: 0.3, curve: 0.45, xHeight: 0.5, apex: 0.3, letterSpacing: 0.22 }),
  style('display', 'Display', 'Bold / Experimental', 'Loud, compact and a little strange. Heavy strokes, squared curves and tight spacing for big sizes.',
    { weight: 0.86, width: 0.4, contrast: 0.3, xHeight: 0.72, terminal: 'cut', classicFuture: 0.78, letterSpacing: 0.12, aperture: 0.55, apex: 0.6, counter: 0.45 }),
  style('soft', 'Soft', 'Rounded / Friendly', 'Every corner and stroke ending is rounded. Low contrast, generous counters, easy-going.',
    { weight: 0.52, contrast: 0, roundness: 1, terminal: 'round', xHeight: 0.6, counter: 0.6, softSharp: 0.35, playfulFormal: 0.38, geoHuman: 0.4, apex: 0.5 })
];

export const CATEGORIES: { id: CategoryId; label: string; hint: string }[] = [
  { id: 'style', label: 'Style', hint: 'Pick a starting point' },
  { id: 'structure', label: 'Structure', hint: 'Weight, width, height, slant, contrast' },
  { id: 'shape', label: 'Shape', hint: 'Corners, curves, endings, serifs' },
  { id: 'proportion', label: 'Proportion', hint: 'x-height, counters, openings' },
  { id: 'spacing', label: 'Spacing', hint: 'Room between letters and words' },
  { id: 'personality', label: 'Personality', hint: 'Big moves across the whole design' }
];

/* friendly = what it does in plain words; tech = the typographer's term */
export const CONTROLS: Record<ControlKey, ControlDef> = {
  weight: { cat: 'structure', friendly: 'Make strokes thicker', tech: 'Weight', lo: 'Thin', hi: 'Bold', demo: 'n',
    explain: 'Weight is the thickness of the main strokes. The highlighted stems grow, and letters widen slightly so the inside space never closes up.' },
  width: { cat: 'structure', friendly: 'Make letters narrower or wider', tech: 'Width', lo: 'Condensed', hi: 'Expanded', demo: 'H',
    explain: 'Width stretches the skeleton of each letter sideways while the stroke thickness stays the same — unlike simply squashing text.' },
  height: { cat: 'structure', friendly: 'Make letters taller or shorter', tech: 'Height', lo: 'Short', hi: 'Tall', demo: 'Hx',
    explain: 'Height moves the cap line — the top of capital letters. Lowercase letters, ascenders and descenders follow in proportion.' },
  slant: { cat: 'structure', friendly: 'Tilt the letters', tech: 'Slant', lo: 'Upright', hi: 'Italic', demo: 'Hn',
    explain: 'Slant leans every letter to the right around its middle, like an oblique italic. Vertical stems follow the dashed axis.' },
  contrast: { cat: 'structure', friendly: 'Increase the difference between thick and thin strokes', tech: 'Contrast', lo: 'Low', hi: 'High', demo: 'Oe',
    explain: 'Contrast thins the horizontal parts of a stroke while vertical parts stay heavy — compare the side of the O with its top.' },

  roundness: { cat: 'shape', friendly: 'Make the letters softer or sharper', tech: 'Roundness', lo: 'Sharp', hi: 'Round', demo: 'Ek',
    explain: 'Roundness softens every corner and stroke end. The marked corners turn from crisp angles into smooth arcs.' },
  curve: { cat: 'shape', friendly: 'Make curves more geometric or organic', tech: 'Curve', lo: 'Geometric', hi: 'Organic', demo: 'Sae',
    explain: 'Geometric curves are compass-drawn circles. Organic curves have fuller shoulders and a tilted axis, as if written with a pen.' },
  terminal: { cat: 'shape', type: 'options', friendly: 'Choose how strokes end', tech: 'Letter endings · Terminals', demo: 'Cas',
    explain: 'A terminal is the end of a stroke that doesn’t meet another stroke — the tips of C, a, s, e or r.' },
  serif: { cat: 'shape', type: 'serif', friendly: 'Add small feet to the strokes', tech: 'Serifs', demo: 'In',
    explain: 'Serifs are the small finishing strokes at the ends of stems. They guide the eye along a line of text and set a classical tone.' },
  apex: { cat: 'shape', friendly: 'Make peaks pointed or flat', tech: 'Apex', lo: 'Pointed', hi: 'Flat', demo: 'AV',
    explain: 'The apex is where two diagonals meet — the top of A, the bottom of V and W. It can be a needle point or a flat cut.' },

  xHeight: { cat: 'proportion', friendly: 'Make lowercase letters taller', tech: 'x-height', lo: 'Small', hi: 'Large', demo: 'Hxn',
    explain: 'The x-height is the height of lowercase letters like x, a and n compared with capitals. Taller lowercase feels modern and reads well small.' },
  counter: { cat: 'proportion', friendly: 'Change the space inside letters', tech: 'Counter', lo: 'Small', hi: 'Large', demo: 'Bo',
    explain: 'A counter is the enclosed space inside letters like O, B, a and e. Bigger counters feel open and airy, smaller ones feel compact.' },
  aperture: { cat: 'proportion', friendly: 'Open or close the mouths of letters', tech: 'Aperture', lo: 'Closed', hi: 'Open', demo: 'ces',
    explain: 'Aperture is the opening of partly-enclosed letters such as c, e, a and s. Open apertures stay legible at small sizes.' },
  crossbar: { cat: 'proportion', friendly: 'Move the horizontal bars up or down', tech: 'Crossbar', lo: 'Low', hi: 'High', demo: 'AHe',
    explain: 'The crossbar is the horizontal stroke in A, H, e and the waist of B, E, R. Moving it changes the letters’ center of gravity.' },

  letterSpacing: { cat: 'spacing', friendly: 'Add or remove space between letters', tech: 'Letter spacing · Tracking', lo: 'Tight', hi: 'Open', demo: 'type',
    explain: 'Tracking changes the gap between every pair of letters equally. The shaded bands show the space being adjusted.' },
  wordSpacing: { cat: 'spacing', friendly: 'Change the gap between words', tech: 'Word spacing', lo: 'Compact', hi: 'Spacious', demo: 'to be',
    explain: 'Word spacing sets the width of the space character. Too tight and words merge, too loose and lines fall apart.' },
  sideBearing: { cat: 'spacing', advanced: true, friendly: 'Adjust the built-in margins of each letter', tech: 'Side bearing', lo: 'Narrow', hi: 'Wide', demo: 'HO',
    explain: 'Side bearings are the small margins built into each glyph. Round letters get smaller bearings than straight ones so the rhythm looks even.' },

  geoHuman: { cat: 'personality', bipolar: true, friendly: 'Constructed or hand-made?', tech: 'Geometric ↔ Humanist', lo: 'Geometric', hi: 'Humanist', demo: 'Rag',
    explain: 'Geometric leans on pure circles and a single-storey a. Humanist opens the letters, tilts the stress and adds warmth.' },
  softSharp: { cat: 'personality', bipolar: true, friendly: 'Gentle or edgy?', tech: 'Soft ↔ Sharp', lo: 'Soft', hi: 'Sharp', demo: 'AMk',
    explain: 'Soft rounds corners and flattens peaks. Sharp keeps every corner crisp and draws peaks to a point.' },
  classicFuture: { cat: 'personality', bipolar: true, friendly: 'Timeless or tomorrow?', tech: 'Classic ↔ Futuristic', lo: 'Classic', hi: 'Futuristic', demo: 'Rose',
    explain: 'Classic adds stroke contrast, a smaller x-height and old-style proportions. Futuristic squares the curves, widens and evens everything out.' },
  playfulFormal: { cat: 'personality', bipolar: true, friendly: 'Fun or serious?', tech: 'Playful ↔ Formal', lo: 'Playful', hi: 'Formal', demo: 'jump',
    explain: 'Playful lets letters bounce and tilt with a bigger x-height. Formal straightens up, tightens the width and refines the contrast.' }
};
export const SERIF_SUBS: Record<SerifSubKey, SubControlDef> = {
  serifSize: { friendly: 'Make the feet longer', tech: 'Serif size', lo: 'Short', hi: 'Long' },
  serifThickness: { friendly: 'Make the feet heavier', tech: 'Serif thickness', lo: 'Hairline', hi: 'Heavy' },
  serifAngle: { friendly: 'Slope the top of the feet', tech: 'Serif angle', lo: 'Flat', hi: 'Sloped' }
};
export const TERMINAL_OPTIONS: [Terminal, string][] = [['flat', 'Flat'], ['round', 'Rounded'], ['sharp', 'Sharp'], ['angled', 'Angled'], ['cut', 'Cut'], ['tapered', 'Tapered']];
export const SERIF_SHAPE_OPTIONS: [SerifShape, string][] = [['bracketed', 'Bracketed'], ['unbracketed', 'Unbracketed'], ['slab', 'Slab'], ['wedge', 'Wedge']];

export const ANATOMY: Record<string, [string, string]> = {
  stem: ['Stem', 'The main, usually vertical, stroke of a letter.'],
  diagonal: ['Diagonal', 'A slanted main stroke.'],
  bowl: ['Bowl', 'The curved stroke that encloses a counter.'],
  crossbar: ['Crossbar', 'A horizontal stroke connecting or crossing stems.'],
  bar: ['Bar', 'A short horizontal stroke.'],
  arm: ['Arm', 'A stroke that is attached at one end and free at the other.'],
  leg: ['Leg', 'A downward diagonal stroke, as in K and R.'],
  tail: ['Tail', 'A stroke that descends or trails off, as in Q and y.'],
  shoulder: ['Shoulder', 'The arch that springs from a stem, as in n, h and m.'],
  spine: ['Spine', 'The main curved stroke of the S.'],
  hook: ['Hook', 'A curved stroke that bends back on itself.'],
  dot: ['Dot', 'The dot above i and j is called a tittle.'],
  counter: ['Counter', 'The enclosed space inside a letter.'],
  terminal: ['Terminal', 'The free end of a stroke.'],
  apex: ['Apex', 'The peak where two diagonals meet at the top.'],
  vertex: ['Vertex', 'The point where two diagonals meet at the bottom.'],
  serif: ['Serif', 'A small finishing stroke at the end of a stem.'],
  baseline: ['Baseline', 'The invisible line all letters sit on.'],
  capHeight: ['Cap height', 'The height of capital letters.'],
  xHeight: ['x-height', 'The height of lowercase letters without ascenders.'],
  ascender: ['Ascender', 'The part of a lowercase letter rising above the x-height.'],
  descender: ['Descender', 'The part of a letter dropping below the baseline.']
};

export const TEXTS = {
  sentence: 'The quick brown fox jumps over the lazy dog.',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789',
  punct: '.,!?;:\'"()-/&@#$%+',
  paragraph: 'Type is the voice of written words. Every letter is a small drawing, and a typeface is hundreds of drawings that agree with each other: the same stroke, the same curve, the same rhythm repeated until a texture appears. Change one decision (how heavy, how round, how open) and the whole voice changes with it.\n\nSphinx of black quartz, judge my vow! Pack my box with five dozen liquor jugs & 1,234 more @ $5.67 (+89%).'
};

export const styleById = (id: string | null | undefined) => STYLES.find(s => s.id === id);

/** First control of each category, opened when the category is picked. */
export const firstControl = (cat: CategoryId) =>
  (Object.keys(CONTROLS) as ControlKey[]).find(k => CONTROLS[k].cat === cat) ?? 'weight';

/** The control a key belongs to: serif sub-sliders fold into 'serif'. */
export const controlFor = (key: ActiveKey): ControlKey =>
  key in SERIF_SUBS ? 'serif' : key as ControlKey;
