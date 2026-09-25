/* Starting styles, navigation, and the plain-language description of every control.
   Shared by the client (UI copy) and the server (validating style ids). */
import { DEFAULTS, type Params, type SerifShape, type Terminal } from './params';

export type CategoryId = 'style' | 'structure' | 'shape' | 'proportion' | 'spacing' | 'personality';
export type ControlKey =
  | 'weight' | 'width' | 'height' | 'slant' | 'contrast'
  | 'roundness' | 'curve' | 'terminal' | 'serif' | 'apex' | 'cursive' | 'wobble'
  | 'xHeight' | 'counter' | 'aperture' | 'crossbar'
  | 'letterSpacing' | 'wordSpacing' | 'mono' | 'sideBearing'
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

/* Starting styles are browsed like the tag filters on Google Fonts: each style sits in one
   type group (Google's Sans Serif, Serif, Slab, Calligraphy and Appearance tags) and carries a few
   moods (Google's Feeling tags). Group names are plainer than Google's where that helps. */
export type StyleGroup = 'sans' | 'serif' | 'slab' | 'mono' | 'hand' | 'display';
export const STYLE_GROUPS: { id: StyleGroup; label: string; hint: string }[] = [
  { id: 'sans', label: 'Sans Serif', hint: 'Clean letters with no serifs' },
  { id: 'serif', label: 'Serif', hint: 'Small finishing strokes on each letter' },
  { id: 'slab', label: 'Slab Serif', hint: 'Heavy, block-shaped serifs' },
  { id: 'mono', label: 'Monospace', hint: 'Every letter takes the same width' },
  { id: 'hand', label: 'Handwriting', hint: 'Drawn by hand with a pen or brush' },
  { id: 'display', label: 'Display', hint: 'Decorative, made for headlines' }
];
export type Mood = 'business' | 'calm' | 'happy' | 'playful' | 'cute' | 'childlike' | 'fancy' | 'sophisticated' | 'artistic'
  | 'loud' | 'rugged' | 'vintage' | 'futuristic';
/* Each style's moods follow the Google Fonts Feeling scores of its reference families. */
export const MOODS: [Mood, string][] = [
  ['business', 'Business'], ['calm', 'Calm'], ['happy', 'Happy'], ['playful', 'Playful'], ['cute', 'Cute'], ['childlike', 'Childlike'],
  ['fancy', 'Fancy'], ['sophisticated', 'Sophisticated'], ['artistic', 'Artistic'], ['loud', 'Loud'], ['rugged', 'Rugged'],
  ['vintage', 'Vintage'], ['futuristic', 'Futuristic']
];

export interface StyleDef {
  id: string; name: string; group: StyleGroup; moods: Mood[]; desc: string;
  /** Google Fonts families in the same genre, for reference */
  like: string;
  params: Params;
}

const style = (id: string, group: StyleGroup, name: string, moods: Mood[], like: string, desc: string, p: Partial<Params>): StyleDef =>
  ({ id, name, group, moods, desc, like, params: { ...DEFAULTS, ...p } });

/* Ids are stored with saved designs, so they never change even when a style is renamed. */
export const STYLES: StyleDef[] = [
  /* ---- Sans Serif */
  style('geometric', 'sans', 'Geometric', ['calm', 'business'], 'Poppins, Montserrat, Jost',
    'Built from circles and straight lines. Neutral, even strokes and pointed peaks.',
    { weight: 0.4, contrast: 0.02, curve: 0, geoHuman: 0.3, apex: 0.12, counter: 0.58, xHeight: 0.46, aperture: 0.45 }),
  style('grotesque', 'sans', 'Neo Grotesque', ['calm', 'business'], 'Roboto, Inter, Work Sans',
    'The Swiss workhorse. Tall lowercase, tight openings and level stroke endings make it calm, dense and matter-of-fact.',
    { weight: 0.5, contrast: 0.04, curve: 0.12, geoHuman: 0.42, aperture: 0.22, xHeight: 0.62, apex: 0.62, counter: 0.5, letterSpacing: 0.17 }),
  style('humanist', 'sans', 'Humanist', ['business', 'calm'], 'Open Sans, Source Sans 3, Fira Sans',
    'Shaped like writing with a pen. Open letterforms, gentle stroke contrast and a human rhythm.',
    { weight: 0.4, contrast: 0.2, curve: 0.65, geoHuman: 0.85, terminal: 'angled', xHeight: 0.52, aperture: 0.75, apex: 0.45, width: 0.46 }),
  style('condensed', 'sans', 'Condensed', ['loud', 'rugged'], 'Oswald, Bebas Neue, Anton',
    'Tall, narrow and squared-off. Fits long headlines into tight columns without losing punch.',
    { weight: 0.54, width: 0.18, height: 0.7, xHeight: 0.64, contrast: 0.06, aperture: 0.3, classicFuture: 0.6, apex: 0.7, counter: 0.45, letterSpacing: 0.24 }),
  style('soft', 'sans', 'Rounded', ['calm', 'happy', 'cute'], 'Nunito, Varela Round, Quicksand',
    'Every corner and stroke ending is rounded. Low contrast, generous counters, easy-going.',
    { weight: 0.52, contrast: 0, roundness: 1, terminal: 'round', xHeight: 0.6, counter: 0.6, softSharp: 0.35, playfulFormal: 0.38, geoHuman: 0.4, apex: 0.5 }),
  style('extended', 'sans', 'Squared', ['futuristic'], 'Michroma, Oxanium, Rajdhani',
    'Round letters drawn as squarish ovals, somewhere between a circle and a rectangle. Wide, stable and technical.',
    { weight: 0.46, width: 0.72, contrast: 0.02, classicFuture: 0.82, xHeight: 0.5, apex: 0.75, counter: 0.52, letterSpacing: 0.26 }),
  style('flared', 'sans', 'Flared', ['sophisticated', 'vintage'], 'Marcellus, Julius Sans One, Philosopher',
    'A sans serif carved like stone lettering: strokes swell toward their ends and thin in the middle, with no serifs.',
    { weight: 0.38, contrast: 0.42, terminal: 'tapered', curve: 0.4, geoHuman: 0.65, classicFuture: 0.38, xHeight: 0.46, aperture: 0.6, apex: 0.3, width: 0.48 }),

  /* ---- Serif */
  style('oldstyle', 'serif', 'Old Style', ['business', 'vintage', 'sophisticated'], 'EB Garamond, Cormorant Garamond, Crimson Pro',
    'Renaissance book type. Angled stress, sloped serifs, a small x-height and open, calligraphic curves.',
    { weight: 0.36, width: 0.46, contrast: 0.42, serif: true, serifShape: 'bracketed', serifSize: 0.4, serifThickness: 0.2, serifAngle: 0.75,
      terminal: 'tapered', curve: 0.7, geoHuman: 0.8, classicFuture: 0.15, xHeight: 0.45, aperture: 0.7, apex: 0.2 }),
  style('serif', 'serif', 'Transitional', ['business', 'calm'], 'Libre Baskerville, Source Serif 4, Lora',
    'Crisp serifs, clear thick-and-thin strokes and upright stress. Made for headlines and long reads alike.',
    { weight: 0.43, contrast: 0.55, serif: true, serifShape: 'bracketed', serifSize: 0.42, serifThickness: 0.22, serifAngle: 0.15,
      terminal: 'tapered', classicFuture: 0.3, curve: 0.45, xHeight: 0.5, apex: 0.3, letterSpacing: 0.22 }),
  style('didone', 'serif', 'Didone', ['fancy', 'sophisticated', 'vintage'], 'Playfair Display, Bodoni Moda, Prata',
    'Extreme contrast: heavy upright stems against hairline serifs and ball-shaped endings. Built for magazine covers.',
    { weight: 0.5, contrast: 0.88, serif: true, serifShape: 'unbracketed', serifSize: 0.45, serifThickness: 0.12, serifAngle: 0,
      terminal: 'round', curve: 0, geoHuman: 0.4, classicFuture: 0.4, aperture: 0.3, xHeight: 0.5, apex: 0.1 }),
  style('fatface', 'serif', 'Fat Face', ['loud', 'vintage', 'rugged'], 'Abril Fatface, Rozha One, Ultra',
    'A Didone pushed to the limit: stems as heavy as they go, hairlines as thin as they go, tiny counters.',
    { weight: 0.78, width: 0.62, contrast: 0.82, serif: true, serifShape: 'unbracketed', serifSize: 0.3, serifThickness: 0.2, serifAngle: 0,
      terminal: 'round', curve: 0.05, xHeight: 0.5, aperture: 0.28, counter: 0.42, letterSpacing: 0.2 }),
  style('wedge', 'serif', 'Wedge Serif', ['vintage', 'fancy'], 'Cinzel, Forum, Marcellus SC',
    'Triangular, chisel-cut serifs and pointed peaks. Feels engraved, heroic and a little mythic.',
    { weight: 0.46, contrast: 0.35, serif: true, serifShape: 'wedge', serifSize: 0.5, serifThickness: 0.45, serifAngle: 0.3,
      terminal: 'sharp', softSharp: 0.8, apex: 0.05, classicFuture: 0.35, xHeight: 0.5, curve: 0.35 }),

  /* ---- Slab Serif */
  style('slab', 'slab', 'Geometric Slab', ['rugged', 'loud'], 'Roboto Slab, Arvo, Rokkitt',
    'Block-shaped serifs as thick as the stems, even strokes and round, geometric bowls. Confident and hard-wearing.',
    { weight: 0.46, contrast: 0.03, serif: true, serifShape: 'slab', serifSize: 0.3, serifThickness: 0.45, serifAngle: 0,
      curve: 0.05, geoHuman: 0.4, xHeight: 0.55, apex: 0.5, counter: 0.55, letterSpacing: 0.26 }),
  style('clarendon', 'slab', 'Clarendon', ['business', 'rugged', 'vintage'], 'Crete Round, Zilla Slab, Besley',
    'A friendlier slab: the serifs flow into the stems through soft brackets, with some contrast and ball-like endings.',
    { weight: 0.55, contrast: 0.32, serif: true, serifShape: 'bracketed', serifSize: 0.32, serifThickness: 0.62, serifAngle: 0,
      terminal: 'round', roundness: 0.35, curve: 0.45, xHeight: 0.58, aperture: 0.4, counter: 0.5, letterSpacing: 0.24 }),

  /* ---- Monospace */
  style('typewriter', 'mono', 'Typewriter', ['vintage'], 'Courier Prime, Cutive Mono, Special Elite',
    'Every letter the same width, with soft slab serifs and slightly uneven ink, like keys struck through a ribbon.',
    { weight: 0.3, contrast: 0, serif: true, serifShape: 'slab', serifSize: 0.55, serifThickness: 0.3, serifAngle: 0, mono: 1, wobble: 0.15,
      roundness: 0.7, terminal: 'round', curve: 0.3, xHeight: 0.52, letterSpacing: 0.2, wordSpacing: 0.35 }),
  style('code', 'mono', 'Code', ['calm', 'futuristic'], 'IBM Plex Mono, Space Mono, Ubuntu Mono',
    'A code-editor face: one width for every character, a tall x-height and plain, open shapes that keep 0, O, l and 1 apart.',
    { weight: 0.42, contrast: 0.02, mono: 1, curve: 0.15, geoHuman: 0.45, xHeight: 0.6, aperture: 0.5, apex: 0.6, classicFuture: 0.6, letterSpacing: 0.2 }),

  /* ---- Handwriting */
  style('casual', 'hand', 'Casual Handwriting', ['happy', 'playful', 'childlike'], 'Caveat, Indie Flower, Shadows Into Light',
    'Quick everyday handwriting with a felt pen: narrow, a little slanted, letters that half-join and never sit quite still.',
    { weight: 0.28, width: 0.34, height: 0.62, slant: 0.25, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.9, cursive: 0.45,
      xHeight: 0.3, curve: 0.7, geoHuman: 0.8, letterSpacing: 0.12 }),
  style('upright', 'hand', 'Hand Printed', ['childlike', 'happy', 'cute'], 'Patrick Hand, Gochi Hand, Mansalva',
    'Printed by hand, letter by letter. Upright and friendly, with round pen ends and wobbly lines.',
    { weight: 0.38, width: 0.45, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.75, cursive: 0.12,
      xHeight: 0.55, curve: 0.6, geoHuman: 0.75, playfulFormal: 0.3 }),
  style('informal', 'hand', 'Retro Script', ['vintage', 'playful', 'artistic'], 'Pacifico, Lobster, Yellowtail',
    'A bold, joined-up script with a retro sign-painter swing: every letter flows into the next.',
    { weight: 0.62, width: 0.45, slant: 0.45, contrast: 0.3, roundness: 0.8, terminal: 'round', wobble: 0.25, cursive: 1,
      xHeight: 0.45, curve: 0.8, geoHuman: 0.8, letterSpacing: 0.02 }),
  style('chancery', 'hand', 'Formal Script', ['fancy', 'sophisticated'], 'Great Vibes, Tangerine, Pinyon Script',
    'Copperplate elegance: a steep slant, hairline upstrokes, swelling downstrokes and a tiny x-height.',
    { weight: 0.36, width: 0.32, height: 0.75, slant: 1, contrast: 0.8, terminal: 'tapered', cursive: 1,
      xHeight: 0.22, curve: 1, geoHuman: 1, letterSpacing: 0.02 }),
  style('brush', 'hand', 'Brush', ['artistic', 'loud'], 'Kaushan Script, Oregano, Mr Dafoe',
    'Fast, heavy strokes from a loaded brush. A strong lean, tapering ends and a rough, lively rhythm.',
    { weight: 0.7, width: 0.4, slant: 0.55, contrast: 0.45, terminal: 'tapered', wobble: 0.7, cursive: 0.55,
      xHeight: 0.5, curve: 0.8, geoHuman: 0.9, letterSpacing: 0.08 }),
  style('marker', 'hand', 'Marker', ['loud', 'playful', 'rugged'], 'Permanent Marker, Rock Salt, Sedgwick Ave',
    'Thick, even lines from a felt marker: upright, big and a bit rough, with round, blunt stroke ends.',
    { weight: 0.62, width: 0.5, slant: 0.08, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.55,
      xHeight: 0.68, curve: 0.45, geoHuman: 0.7, counter: 0.45, aperture: 0.45, letterSpacing: 0.16 }),

  /* ---- Display */
  style('woodtype', 'display', 'Wood Type', ['rugged', 'vintage', 'loud'], 'Alfa Slab One, Sancreek, Rye',
    'Poster letters cut from wood for Wild West handbills: heavy, compact and squared, with chunky slabs.',
    { weight: 0.82, width: 0.36, height: 0.62, contrast: 0.18, serif: true, serifShape: 'slab', serifSize: 0.22, serifThickness: 0.5, serifAngle: 0,
      classicFuture: 0.72, xHeight: 0.66, aperture: 0.3, counter: 0.4, apex: 0.8, letterSpacing: 0.3 }),
  style('techno', 'display', 'Techno', ['futuristic', 'loud'], 'Orbitron, Zen Dots, Audiowide',
    'Rounded rectangles instead of circles, flat peaks and a huge x-height. Straight out of a control panel.',
    { weight: 0.62, width: 0.85, contrast: 0, classicFuture: 1, xHeight: 0.6, apex: 0.95, terminal: 'cut', softSharp: 0.6, counter: 0.55, letterSpacing: 0.3 }),
  style('display', 'display', 'Blobby', ['cute', 'happy', 'playful', 'loud'], 'Chewy, Sour Gummy, DynaPuff',
    'Soft, puffy and heavy, like letters squeezed out of a tube. Every letter bounces to its own beat.',
    { weight: 0.74, width: 0.55, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.35, xHeight: 0.66, counter: 0.4,
      aperture: 0.35, softSharp: 0.2, playfulFormal: 0.1, geoHuman: 0.45, apex: 0.7, letterSpacing: 0.24 }),
  style('hairline', 'display', 'Art Deco', ['vintage', 'sophisticated', 'artistic'], 'Poiret One, Limelight, Federo',
    'Jazz-age glamour: a fine single line, geometric circles, a tiny x-height and crossbars pushed up high.',
    { weight: 0.04, width: 0.6, contrast: 0, curve: 0, geoHuman: 0.25, apex: 0.05, counter: 0.65, xHeight: 0, height: 0.62,
      crossbar: 0.95, letterSpacing: 0.45, wordSpacing: 0.5 })
];

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'style', label: 'Style' },
  { id: 'structure', label: 'Structure' },
  { id: 'shape', label: 'Shape' },
  { id: 'proportion', label: 'Proportion' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'personality', label: 'Personality' }
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
  cursive: { cat: 'shape', friendly: 'Add strokes that lead into the next letter', tech: 'Cursive · Entry & exit strokes', lo: 'Print', hi: 'Script', demo: 'nigu',
    explain: 'Script hands flick every stroke on toward the next letter. Stems curl out at the baseline, upstrokes lead in, and past halfway the a, f, g and y switch to their italic forms.' },
  wobble: { cat: 'shape', friendly: 'Make it look drawn by hand', tech: 'Hand-drawn · Irregularity', lo: 'Precise', hi: 'Wobbly', demo: 'Hand',
    explain: 'A real hand never draws the same line twice. Strokes drift, pressure swells and fades, and each letter sits a little off the baseline.' },

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
  mono: { cat: 'spacing', friendly: 'Give every letter the same width', tech: 'Monospace', lo: 'Proportional', hi: 'Monospaced', demo: 'milk',
    explain: 'In a monospaced font every character takes up the same width, like a typewriter or a code editor. Narrow letters get extra room, wide ones are squeezed in.' },
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
  entry: ['Entry stroke', 'The upstroke that leads into a letter, as if the pen arrived from the one before.'],
  baseline: ['Baseline', 'The invisible line all letters sit on.'],
  capHeight: ['Cap height', 'The height of capital letters.'],
  xHeight: ['x-height', 'The height of lowercase letters without ascenders.'],
  ascender: ['Ascender', 'The part of a lowercase letter rising above the x-height.'],
  descender: ['Descender', 'The part of a letter dropping below the baseline.']
};

/** The control that shapes each anatomy part. Parts missing here (the baseline) have none. */
export const PART_CONTROL: Partial<Record<string, ControlKey>> = {
  stem: 'weight', diagonal: 'weight', bowl: 'weight', arm: 'weight', leg: 'weight', tail: 'weight',
  shoulder: 'weight', spine: 'weight', hook: 'weight', dot: 'weight',
  crossbar: 'crossbar', bar: 'crossbar', counter: 'counter', terminal: 'terminal',
  apex: 'apex', vertex: 'apex', serif: 'serif', entry: 'cursive',
  xHeight: 'xHeight', capHeight: 'height', ascender: 'height', descender: 'height'
};

export const TEXTS = {
  sentence: 'The quick brown fox jumps over the lazy dog.',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789',
  punct: '.,!?;:\'"()-/&@#$%+',
  paragraph: 'Type is the voice of written words. Every letter is a small drawing, and a typeface is hundreds of drawings that agree with each other: the same stroke, the same curve, the same rhythm repeated until a texture appears. Change one decision (how heavy, how round, how open) and the whole voice changes with it.\n\nSphinx of black quartz, judge my vow! Pack my box with five dozen liquor jugs & 1,234 more @ $5.67 (+89%).'
};

export const styleById = (id: string | null | undefined) => STYLES.find(s => s.id === id);
export const groupLabel = (g: StyleGroup) => STYLE_GROUPS.find(x => x.id === g)!.label;
export const moodLabels = (moods: Mood[]) => moods.map(m => MOODS.find(x => x[0] === m)![1]).join(', ');

/** First control of each category, opened when the category is picked. */
export const firstControl = (cat: CategoryId) =>
  (Object.keys(CONTROLS) as ControlKey[]).find(k => CONTROLS[k].cat === cat) ?? 'weight';

/** The control a key belongs to: serif sub-sliders fold into 'serif'. */
export const controlFor = (key: ActiveKey): ControlKey =>
  key in SERIF_SUBS ? 'serif' : key as ControlKey;
