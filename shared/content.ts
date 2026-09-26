/* Starting styles, navigation, and the plain-language description of every control.
   Shared by the client (UI copy) and the server (validating style ids). */
import { resolve, type Effective } from './engine/font';
import { DEFAULTS, type Fill, type Params, type SerifShape, type Story, type Terminal } from './params';

export type CategoryId = 'style' | 'structure' | 'shape' | 'proportion' | 'spacing' | 'personality' | 'effects';
export type ControlKey =
  | 'weight' | 'width' | 'height' | 'slant' | 'contrast' | 'reverse'
  | 'roundness' | 'curve' | 'squareness' | 'chamfer' | 'terminal' | 'story' | 'overlap' | 'serif' | 'apex' | 'joints' | 'cursive' | 'wobble'
  | 'xHeight' | 'extenders' | 'counter' | 'aperture' | 'crossbar'
  | 'letterSpacing' | 'wordSpacing' | 'mono' | 'sideBearing'
  | 'geoHuman' | 'softSharp' | 'classicFuture' | 'playfulFormal'
  | 'fill' | 'stencil' | 'slice';
export type SerifSubKey = 'serifSize' | 'serifThickness' | 'serifAngle';
export type FillSubKey = 'module';
/** Anything the control panel can focus: a control or one of its nested sub-sliders. */
export type ActiveKey = ControlKey | SerifSubKey | FillSubKey;

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
  type?: 'options' | 'story' | 'serif' | 'fill';
  bipolar?: boolean;
  advanced?: boolean;
}
export interface SubControlDef { label: string; friendly: string; tech: string; lo: string; hi: string }

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
export type Mood = 'business' | 'calm' | 'sincere' | 'happy' | 'excited' | 'playful' | 'cute' | 'childlike' | 'fancy' | 'sophisticated'
  | 'artistic' | 'innovative' | 'loud' | 'rugged' | 'stiff' | 'vintage' | 'futuristic';
/* Each style's moods follow the Google Fonts Feeling scores of its reference families. */
export const MOODS: [Mood, string][] = [
  ['business', 'Business'], ['calm', 'Calm'], ['sincere', 'Sincere'], ['happy', 'Happy'], ['excited', 'Excited'], ['playful', 'Playful'],
  ['cute', 'Cute'], ['childlike', 'Childlike'], ['fancy', 'Fancy'], ['sophisticated', 'Sophisticated'], ['artistic', 'Artistic'],
  ['innovative', 'Innovative'], ['loud', 'Loud'], ['rugged', 'Rugged'], ['stiff', 'Stiff'], ['vintage', 'Vintage'], ['futuristic', 'Futuristic']
];

/* A third facet, like Google's Appearance tags: what the letters look like. Unlike groups and
   moods these are not hand-picked but read off each style's settings, so they stay true as
   styles are tuned. */
export type Look = 'grid' | 'stencil' | 'outline' | 'squared' | 'faceted' | 'inktrap' | 'rounded' | 'contrast' | 'wide' | 'narrow'
  | 'slanted' | 'wobbly' | 'tapered' | 'bigx' | 'smallx' | 'singlea';
export const LOOKS: { id: Look; label: string; hint: string; test: (e: Effective) => boolean }[] = [
  { id: 'grid', label: 'Pixel & Dot', hint: 'Built from a grid of pixels, dots or lines', test: e => e.fill === 'pixels' || e.fill === 'dots' || e.fill === 'lines' },
  { id: 'stencil', label: 'Stencil & Cut', hint: 'Letters cut apart by gaps', test: e => e.stencil > 0 || e.slice > 0 },
  { id: 'outline', label: 'Outline', hint: 'Drawn as lines, not filled in', test: e => e.fill === 'wire' },
  { id: 'squared', label: 'Squared', hint: 'Round letters drawn as rounded squares', test: e => e.square >= 0.4 && e.chamfer < 0.2 },
  { id: 'faceted', label: 'Faceted', hint: 'Straight lines and cut-off corners instead of curves', test: e => e.chamfer >= 0.2 },
  { id: 'inktrap', label: 'Ink Traps', hint: 'Strokes narrow where they meet', test: e => e.joints >= 0.4 },
  { id: 'rounded', label: 'Rounded', hint: 'Soft corners and stroke endings', test: e => e.roundness >= 0.6 },
  { id: 'contrast', label: 'High Contrast', hint: 'Strong difference between thick and thin', test: e => e.contrast >= 0.5 },
  { id: 'wide', label: 'Wide', hint: 'Stretched out sideways', test: e => e.width >= 0.68 },
  { id: 'narrow', label: 'Narrow', hint: 'Squeezed tall and thin', test: e => e.width <= 0.35 },
  { id: 'slanted', label: 'Slanted', hint: 'Leaning forward, like italics', test: e => e.slant >= 0.2 },
  { id: 'wobbly', label: 'Wobbly', hint: 'Uneven lines, as if drawn by hand', test: e => e.wobble >= 0.3 },
  { id: 'tapered', label: 'Tapered Ends', hint: 'Strokes thin to a point where they end', test: e => e.terminal === 'tapered' },
  { id: 'bigx', label: 'Big Lowercase', hint: 'Lowercase letters nearly as tall as capitals', test: e => e.xHeight >= 0.66 },
  { id: 'smallx', label: 'Small Lowercase', hint: 'Short lowercase under tall capitals', test: e => e.xHeight <= 0.42 },
  { id: 'singlea', label: 'Single-storey a', hint: 'A lowercase a that is just a round bowl', test: e => e.singleStory }
];

/* Weight is read off the settings too. Unlike looks, every style has exactly one: the first band it fits. */
export type Weight = 'light' | 'regular' | 'bold' | 'heavy';
export const WEIGHTS: { id: Weight; label: string; hint: string; test: (e: Effective) => boolean }[] = [
  { id: 'light', label: 'Light', hint: 'Thin strokes', test: e => e.weight < 0.4 },
  { id: 'regular', label: 'Regular', hint: 'Everyday reading weight', test: e => e.weight < 0.55 },
  { id: 'bold', label: 'Bold', hint: 'Thick strokes', test: e => e.weight < 0.7 },
  { id: 'heavy', label: 'Heavy', hint: 'As black as it gets', test: () => true }
];

export interface StyleDef {
  id: string; name: string; group: StyleGroup; moods: Mood[]; desc: string;
  /** Google Fonts families in the same genre, for reference */
  like: string;
  params: Params;
  /** read off the params, see LOOKS and WEIGHTS */
  looks: Look[];
  weight: Weight;
}

const style = (id: string, group: StyleGroup, name: string, moods: Mood[], like: string, desc: string, p: Partial<Params>): StyleDef => {
  const params = { ...DEFAULTS, ...p }, e = resolve(params);
  return { id, name, group, moods, desc, like, params, looks: LOOKS.filter(l => l.test(e)).map(l => l.id), weight: WEIGHTS.find(w => w.test(e))!.id };
};

/* Ids are stored with saved designs, so they never change even when a style is renamed. */
export const STYLES: StyleDef[] = [
  /* ---- Sans Serif */
  style('geometric', 'sans', 'Geometric', ['calm', 'business'], 'Poppins, Montserrat, Jost',
    'Built from circles and straight lines. Neutral, even strokes and pointed peaks.',
    { weight: 0.4, contrast: 0.02, curve: 0, geoHuman: 0.3, apex: 0.12, counter: 0.58, xHeight: 0.46, aperture: 0.45 }),
  style('grotesque', 'sans', 'Neo Grotesque', ['calm', 'business', 'stiff'], 'Roboto, Inter, Work Sans',
    'The Swiss workhorse. Tall lowercase, tight openings and level stroke endings make it calm, dense and matter-of-fact.',
    { weight: 0.5, contrast: 0.04, curve: 0.12, geoHuman: 0.42, aperture: 0.22, xHeight: 0.62, apex: 0.62, counter: 0.5, letterSpacing: 0.17 }),
  style('humanist', 'sans', 'Humanist', ['business', 'calm', 'sincere'], 'Open Sans, Source Sans 3, Fira Sans',
    'Shaped like writing with a pen. Open letterforms, gentle stroke contrast and a human rhythm.',
    { weight: 0.4, contrast: 0.2, curve: 0.65, geoHuman: 0.85, terminal: 'angled', xHeight: 0.52, aperture: 0.75, apex: 0.45, width: 0.46 }),
  style('condensed', 'sans', 'Condensed', ['loud', 'rugged', 'stiff'], 'Oswald, Bebas Neue, Anton',
    'Tall, narrow and squared-off. Fits long headlines into tight columns without losing punch.',
    { weight: 0.54, width: 0.18, height: 0.7, xHeight: 0.64, contrast: 0.06, aperture: 0.3, classicFuture: 0.6, apex: 0.7, counter: 0.45, letterSpacing: 0.24 }),
  style('soft', 'sans', 'Rounded', ['calm', 'happy', 'cute'], 'Nunito, Varela Round, Quicksand',
    'Every corner and stroke ending is rounded. Low contrast, generous counters, easy-going.',
    { weight: 0.52, contrast: 0, roundness: 1, terminal: 'round', xHeight: 0.6, counter: 0.6, softSharp: 0.35, playfulFormal: 0.38, geoHuman: 0.4, apex: 0.5 }),
  style('extended', 'sans', 'Squared', ['futuristic'], 'Michroma, Oxanium, Rajdhani',
    'Round letters drawn as squarish ovals, somewhere between a circle and a rectangle. Wide, stable and technical.',
    { weight: 0.46, width: 0.72, contrast: 0.02, classicFuture: 0.82, xHeight: 0.5, apex: 0.75, counter: 0.52, letterSpacing: 0.26 }),
  style('tightgeo', 'sans', 'Tight Geometric', ['loud', 'sophisticated'], 'Outfit, Urbanist, Lexend',
    'A 70s logotype sans after Herb Lubalin: perfect circles, a single-storey a, towering ascenders and letters packed so close they nearly touch.',
    { weight: 0.66, contrast: 0.02, curve: 0, geoHuman: 0.1, apex: 0.1, counter: 0.72, xHeight: 0.64, extenders: 1, aperture: 0.35,
      letterSpacing: 0.04, width: 0.55 }),
  style('squircle', 'sans', 'Superellipse', ['futuristic', 'calm', 'innovative'], 'Unbounded, Syne, Lexend Zetta',
    'Every bowl is a squircle, halfway between a circle and a square, and the strokes pinch in where they meet. Soft but engineered.',
    { weight: 0.5, width: 0.64, contrast: 0.04, squareness: 0.62, joints: 0.55, curve: 0, geoHuman: 0.35, apex: 0.7, xHeight: 0.56,
      counter: 0.56, letterSpacing: 0.22 }),
  style('inktrap', 'sans', 'Ink Trap', ['loud', 'artistic', 'innovative'], 'Bricolage Grotesque, Syne, Darker Grotesque',
    'A heavy display grotesque with deep ink traps: strokes narrow sharply where they branch, so the black letters stay open.',
    { weight: 0.72, width: 0.58, contrast: 0.35, squareness: 0.45, joints: 1, curve: 0.1, geoHuman: 0.4, apex: 0.6, xHeight: 0.6,
      aperture: 0.3, counter: 0.44, letterSpacing: 0.16 }),
  style('flared', 'sans', 'Flared', ['sophisticated', 'vintage'], 'Marcellus, Julius Sans One, Philosopher',
    'A sans serif carved like stone lettering: strokes swell toward their ends and thin in the middle, with no serifs.',
    { weight: 0.38, contrast: 0.42, terminal: 'tapered', curve: 0.4, geoHuman: 0.65, classicFuture: 0.38, xHeight: 0.46, aperture: 0.6, apex: 0.3, width: 0.48 }),

  /* ---- Serif */
  style('oldstyle', 'serif', 'Old Style', ['business', 'vintage', 'sophisticated', 'sincere'], 'EB Garamond, Cormorant Garamond, Crimson Pro',
    'Renaissance book type. Angled stress, sloped serifs, a small x-height and open, calligraphic curves.',
    { weight: 0.36, width: 0.46, contrast: 0.42, serif: true, serifShape: 'bracketed', serifSize: 0.4, serifThickness: 0.2, serifAngle: 0.75,
      terminal: 'tapered', curve: 0.7, geoHuman: 0.8, classicFuture: 0.15, xHeight: 0.45, aperture: 0.7, apex: 0.2 }),
  style('serif', 'serif', 'Transitional', ['business', 'calm', 'sincere'], 'Libre Baskerville, Source Serif 4, Lora',
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
  style('clarendon', 'slab', 'Clarendon', ['business', 'rugged', 'vintage', 'sincere'], 'Crete Round, Zilla Slab, Besley',
    'A friendlier slab: the serifs flow into the stems through soft brackets, with some contrast and ball-like endings.',
    { weight: 0.55, contrast: 0.32, serif: true, serifShape: 'bracketed', serifSize: 0.32, serifThickness: 0.62, serifAngle: 0,
      terminal: 'round', roundness: 0.35, curve: 0.45, xHeight: 0.58, aperture: 0.4, counter: 0.5, letterSpacing: 0.24 }),

  /* ---- Monospace */
  style('typewriter', 'mono', 'Typewriter', ['vintage', 'sincere'], 'Courier Prime, Cutive Mono, Special Elite',
    'Every letter the same width, with soft slab serifs and slightly uneven ink, like keys struck through a ribbon.',
    { weight: 0.3, contrast: 0, serif: true, serifShape: 'slab', serifSize: 0.55, serifThickness: 0.3, serifAngle: 0, mono: 1, wobble: 0.15,
      roundness: 0.7, terminal: 'round', curve: 0.3, xHeight: 0.52, letterSpacing: 0.2, wordSpacing: 0.35 }),
  style('squaremono', 'mono', 'Square Mono', ['futuristic', 'stiff'], 'Major Mono Display, Syne Mono, Space Mono',
    'A wide monospace with square bowls and square dots. Reads like numbers on a train departure board.',
    { weight: 0.42, width: 0.68, contrast: 0.02, mono: 1, squareness: 1, curve: 0, geoHuman: 0.3, xHeight: 0.62, apex: 0.9,
      aperture: 0.35, letterSpacing: 0.22, terminal: 'cut' }),
  style('code', 'mono', 'Code', ['calm', 'futuristic', 'stiff'], 'IBM Plex Mono, Space Mono, Ubuntu Mono',
    'A code-editor face: one width for every character, a tall x-height and plain, open shapes that keep 0, O, l and 1 apart.',
    { weight: 0.42, contrast: 0.02, mono: 1, curve: 0.15, geoHuman: 0.45, xHeight: 0.6, aperture: 0.5, apex: 0.6, classicFuture: 0.6, letterSpacing: 0.2 }),

  /* ---- Handwriting */
  style('casual', 'hand', 'Casual Handwriting', ['happy', 'playful', 'childlike'], 'Caveat, Indie Flower, Shadows Into Light',
    'Quick everyday handwriting with a felt pen: narrow, a little slanted, letters that half-join and never sit quite still.',
    { weight: 0.28, width: 0.34, height: 0.62, slant: 0.25, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.9, cursive: 0.45,
      xHeight: 0.3, curve: 0.7, geoHuman: 0.8, letterSpacing: 0.12 }),
  style('upright', 'hand', 'Hand Printed', ['childlike', 'happy', 'cute', 'sincere'], 'Patrick Hand, Gochi Hand, Mansalva',
    'Printed by hand, letter by letter. Upright and friendly, with round pen ends and wobbly lines.',
    { weight: 0.38, width: 0.45, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.75, cursive: 0.12,
      xHeight: 0.55, curve: 0.6, geoHuman: 0.75, playfulFormal: 0.3 }),
  style('informal', 'hand', 'Retro Script', ['vintage', 'playful', 'artistic', 'excited'], 'Pacifico, Lobster, Yellowtail',
    'A bold, joined-up script with a retro sign-painter swing: every letter flows into the next.',
    { weight: 0.62, width: 0.45, slant: 0.45, contrast: 0.3, roundness: 0.8, terminal: 'round', wobble: 0.25, cursive: 1,
      xHeight: 0.45, curve: 0.8, geoHuman: 0.8, letterSpacing: 0.02 }),
  style('chancery', 'hand', 'Formal Script', ['fancy', 'sophisticated'], 'Great Vibes, Tangerine, Pinyon Script',
    'Copperplate elegance: a steep slant, hairline upstrokes, swelling downstrokes and a tiny x-height.',
    { weight: 0.36, width: 0.32, height: 0.75, slant: 1, contrast: 0.8, terminal: 'tapered', cursive: 1,
      xHeight: 0.22, curve: 1, geoHuman: 1, letterSpacing: 0.02 }),
  style('brush', 'hand', 'Brush', ['artistic', 'loud', 'excited'], 'Kaushan Script, Oregano, Mr Dafoe',
    'Fast, heavy strokes from a loaded brush. A strong lean, tapering ends and a rough, lively rhythm.',
    { weight: 0.7, width: 0.4, slant: 0.55, contrast: 0.45, terminal: 'tapered', wobble: 0.7, cursive: 0.55,
      xHeight: 0.5, curve: 0.8, geoHuman: 0.9, letterSpacing: 0.08 }),
  style('marker', 'hand', 'Marker', ['loud', 'playful', 'rugged', 'excited'], 'Permanent Marker, Rock Salt, Sedgwick Ave',
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
  style('display', 'display', 'Blobby', ['cute', 'happy', 'playful', 'loud', 'excited'], 'Chewy, Sour Gummy, DynaPuff',
    'Soft, puffy and heavy, like letters squeezed out of a tube. Every letter bounces to its own beat.',
    { weight: 0.74, width: 0.55, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.35, xHeight: 0.66, counter: 0.4,
      aperture: 0.35, softSharp: 0.2, playfulFormal: 0.1, geoHuman: 0.45, apex: 0.7, letterSpacing: 0.24 }),
  style('pixel', 'display', 'Pixel', ['futuristic', 'playful'], 'Silkscreen, Pixelify Sans, Jersey 10',
    'Rebuilt on a coarse grid of square pixels with softened corners, like an old handheld game screen.',
    { weight: 0.55, width: 0.6, contrast: 0, squareness: 0.8, fill: 'pixels', module: 0.78, roundness: 0.55, apex: 0.9, xHeight: 0.62,
      counter: 0.55, letterSpacing: 0.2, geoHuman: 0.4 }),
  style('dotmatrix', 'display', 'Dot Matrix', ['futuristic', 'vintage'], 'Doto, DotGothic16, Codystar',
    'Letters printed from a grid of round dots, like a departure board or an old receipt printer. Faceted corners keep it mechanical.',
    { weight: 0.62, width: 0.62, contrast: 0, chamfer: 0.55, fill: 'dots', module: 0.55, apex: 1, xHeight: 0.6, counter: 0.5,
      letterSpacing: 0.22, geoHuman: 0.35 }),
  style('striped', 'display', 'Striped', ['vintage', 'loud', 'artistic', 'excited'], 'Monoton, Tilt Prism, Bungee Inline',
    'A 70s disco face made from horizontal stripes with rounded ends: the letters appear only where the lines are.',
    { weight: 0.82, width: 0.72, contrast: 0, squareness: 0.35, fill: 'lines', module: 0.45, roundness: 1, xHeight: 0.62, counter: 0.5,
      apex: 0.8, letterSpacing: 0.26 }),
  style('octagon', 'display', 'Octagonal', ['futuristic', 'rugged', 'stiff'], 'Chakra Petch, Tomorrow, Bai Jamjuree',
    'Modular letters built on a square grid, after Ben Bos and Wim Crouwel: no curves at all, just straight strokes and cut corners.',
    { weight: 0.74, width: 0.56, contrast: 0, chamfer: 0.62, apex: 1, curve: 0, geoHuman: 0.3, xHeight: 0.62, counter: 0.48,
      aperture: 0.3, letterSpacing: 0.22, terminal: 'flat' }),
  style('stencil', 'display', 'Stencil', ['rugged', 'loud'], 'Stardos Stencil, Allerta Stencil, Big Shoulders Stencil',
    'Geometric letters with gaps cut where the strokes meet, so they could be sprayed through a sheet. Round letters split in two.',
    { weight: 0.62, contrast: 0.02, stencil: 0.45, curve: 0, geoHuman: 0.3, apex: 0.3, counter: 0.58, xHeight: 0.52, letterSpacing: 0.24 }),
  style('split', 'display', 'Split Line', ['futuristic', 'sophisticated', 'innovative'], 'Syncopate, Michroma, Krona One',
    'Ultra-wide and squared off, with a single hairline cut running through the whole line of text.',
    { weight: 0.72, width: 1, height: 0.4, contrast: 0.02, squareness: 0.85, slice: 0.18, apex: 1, xHeight: 0.66, counter: 0.5,
      aperture: 0.25, letterSpacing: 0.2 }),
  style('construction', 'display', 'Construction', ['artistic', 'futuristic', 'innovative'], 'Bungee Outline, Train One, Kumar One Outline',
    'Drawn as the outline of every stroke, overlaps and all, like a letter still on the drawing board.',
    { weight: 0.6, contrast: 0.02, fill: 'wire', module: 0.35, curve: 0, geoHuman: 0.25, apex: 0.1, counter: 0.62, xHeight: 0.5,
      letterSpacing: 0.3 }),
  style('reverse', 'display', 'Reverse Contrast', ['futuristic', 'loud', 'artistic', 'innovative'], 'Ewert, Sancreek, Rye',
    'Contrast turned on its side: fat horizontals and hairline stems. Wide, strange and made for posters.',
    { weight: 0.55, width: 0.86, contrast: 0.62, reverse: 1, curve: 0, squareness: 0.3, apex: 0.8, xHeight: 0.56, counter: 0.5,
      letterSpacing: 0.26 }),
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
  { id: 'personality', label: 'Personality' },
  { id: 'effects', label: 'Effects' }
];

/* label = the control's short title; friendly = what it does in plain words; tech = the typographer's term */
export const CONTROLS: Record<ControlKey, ControlDef> = {
  weight: { cat: 'structure', label: 'Weight', friendly: 'Make strokes thicker', tech: 'Weight', lo: 'Thin', hi: 'Bold', demo: 'n',
    explain: 'Letters widen a little so their insides stay open.' },
  width: { cat: 'structure', label: 'Width', friendly: 'Make letters narrower or wider', tech: 'Width', lo: 'Condensed', hi: 'Expanded', demo: 'H',
    explain: 'Stretches letters sideways; strokes keep their thickness.' },
  height: { cat: 'structure', label: 'Height', friendly: 'Make letters taller or shorter', tech: 'Height', lo: 'Short', hi: 'Tall', demo: 'Hx',
    explain: 'Moves the top of the capitals; lowercase follows.' },
  slant: { cat: 'structure', label: 'Slant', friendly: 'Tilt the letters', tech: 'Slant', lo: 'Upright', hi: 'Italic', demo: 'Hn',
    explain: 'Leans each letter to the right, like an oblique italic.' },
  contrast: { cat: 'structure', label: 'Contrast', friendly: 'Vary thick and thin strokes', tech: 'Contrast', lo: 'Low', hi: 'High', demo: 'Oe',
    explain: 'Horizontal strokes thin out while verticals stay heavy.' },
  reverse: { cat: 'structure', label: 'Reverse contrast', friendly: 'Make the horizontal strokes the heavy ones', tech: 'Reverse contrast', lo: 'Normal', hi: 'Reversed', demo: 'HOe',
    explain: 'Bars go heavy and stems go thin. Stronger with more Contrast.' },

  roundness: { cat: 'shape', label: 'Roundness', friendly: 'Make the letters softer or sharper', tech: 'Roundness', lo: 'Sharp', hi: 'Round', demo: 'Ek',
    explain: 'Crisp corners and stroke ends become smooth arcs.' },
  curve: { cat: 'shape', label: 'Curves', friendly: 'Make curves more geometric or organic', tech: 'Curve', lo: 'Geometric', hi: 'Organic', demo: 'Sae',
    explain: 'Compass-drawn circles, or fuller pen-like curves.' },
  squareness: { cat: 'shape', label: 'Squareness', friendly: 'Turn circles into rounded squares', tech: 'Squareness · Superellipse', lo: 'Circle', hi: 'Square', demo: 'Oo',
    explain: 'Bowls square off while the corners stay smooth.' },
  chamfer: { cat: 'shape', label: 'Facets', friendly: 'Cut curves into straight lines and corners', tech: 'Chamfer · Faceted', lo: 'Curved', hi: 'Cut', demo: 'Oes',
    explain: 'Curves become straight lines with cut-off corners.' },
  terminal: { cat: 'shape', type: 'options', label: 'Stroke ends', friendly: 'Choose how strokes end', tech: 'Letter endings · Terminals', demo: 'Cas',
    explain: 'The free tips of strokes, as on C, a, s and r.' },
  story: { cat: 'shape', type: 'story', label: 'Letter a', friendly: 'Choose the shape of the a', tech: 'Double / single storey a', demo: 'data',
    explain: 'Two-storey like book type, or one bowl like handwriting.' },
  overlap: { cat: 'shape', label: 'Bowl overlap', friendly: 'Join or separate bowl and stem', tech: 'Bowl overlap', lo: 'Apart', hi: 'Merged', demo: 'bdpq',
    explain: 'Applies to b, d, p, q and the single-storey a.' },
  serif: { cat: 'shape', type: 'serif', label: 'Serifs', friendly: 'Add small feet to the strokes', tech: 'Serifs', demo: 'In',
    explain: 'Small finishing strokes at the ends of stems.' },
  apex: { cat: 'shape', label: 'Peaks', friendly: 'Make peaks pointed or flat', tech: 'Apex', lo: 'Pointed', hi: 'Flat', demo: 'AV',
    explain: 'Where diagonals meet — the top of A, the bottom of V.' },
  joints: { cat: 'shape', label: 'Ink traps', friendly: 'Thin the strokes where they meet', tech: 'Ink traps · Joints', lo: 'Solid', hi: 'Trapped', demo: 'nab',
    explain: 'Corners are carved out where strokes join.' },
  cursive: { cat: 'shape', label: 'Cursive', friendly: 'Add strokes that lead into the next letter', tech: 'Cursive · Entry & exit strokes', lo: 'Print', hi: 'Script', demo: 'nigu',
    explain: 'Strokes flick on toward the next letter, like script.' },
  wobble: { cat: 'shape', label: 'Hand-drawn', friendly: 'Make it look drawn by hand', tech: 'Hand-drawn · Irregularity', lo: 'Precise', hi: 'Wobbly', demo: 'Hand',
    explain: 'Strokes drift, swell and sit a little off the line.' },

  xHeight: { cat: 'proportion', label: 'Lowercase height', friendly: 'Make lowercase letters taller', tech: 'x-height', lo: 'Small', hi: 'Large', demo: 'Hxn',
    explain: 'Taller lowercase feels modern and reads well small.' },
  extenders: { cat: 'proportion', label: 'Stem length', friendly: 'Make ascenders and descenders longer', tech: 'Ascenders & descenders', lo: 'Short', hi: 'Long', demo: 'hpdy',
    explain: 'The parts above (b, d, h) and below (g, p, y) the letters.' },
  counter: { cat: 'proportion', label: 'Inner space', friendly: 'Change the space inside letters', tech: 'Counter', lo: 'Small', hi: 'Large', demo: 'Bo',
    explain: 'The enclosed space inside O, B, a and e.' },
  aperture: { cat: 'proportion', label: 'Openness', friendly: 'Open or close the mouths of letters', tech: 'Aperture', lo: 'Closed', hi: 'Open', demo: 'ces',
    explain: 'Open mouths on c, e and s stay readable when small.' },
  crossbar: { cat: 'proportion', label: 'Crossbar height', friendly: 'Move the horizontal bars up or down', tech: 'Crossbar', lo: 'Low', hi: 'High', demo: 'AHe',
    explain: 'The bars in A, H and e, and the waist of B, E, R.' },

  letterSpacing: { cat: 'spacing', label: 'Letter spacing', friendly: 'Add or remove space between letters', tech: 'Letter spacing · Tracking', lo: 'Tight', hi: 'Open', demo: 'type',
    explain: 'The same gap changes between every pair of letters.' },
  wordSpacing: { cat: 'spacing', label: 'Word spacing', friendly: 'Change the gap between words', tech: 'Word spacing', lo: 'Compact', hi: 'Spacious', demo: 'to be',
    explain: 'Too tight and words merge; too loose and lines fall apart.' },
  mono: { cat: 'spacing', label: 'Monospace', friendly: 'Give every letter the same width', tech: 'Monospace', lo: 'Proportional', hi: 'Monospaced', demo: 'milk',
    explain: 'Every character takes the same width, like a typewriter.' },
  sideBearing: { cat: 'spacing', advanced: true, label: 'Side margins', friendly: 'Adjust the space around each letter', tech: 'Side bearing', lo: 'Narrow', hi: 'Wide', demo: 'HO',
    explain: 'The small margins built into each letter.' },

  geoHuman: { cat: 'personality', bipolar: true, label: 'Construction', friendly: 'Constructed or hand-made?', tech: 'Geometric ↔ Humanist', lo: 'Geometric', hi: 'Humanist', demo: 'Rag',
    explain: 'Pure circles, or open, warm, pen-like letters.' },
  softSharp: { cat: 'personality', bipolar: true, label: 'Edges', friendly: 'Gentle or edgy?', tech: 'Soft ↔ Sharp', lo: 'Soft', hi: 'Sharp', demo: 'AMk',
    explain: 'Rounded corners and flat peaks, or crisp corners and points.' },
  classicFuture: { cat: 'personality', bipolar: true, label: 'Era', friendly: 'Timeless or tomorrow?', tech: 'Classic ↔ Futuristic', lo: 'Classic', hi: 'Futuristic', demo: 'Rose',
    explain: 'Old-style contrast, or squared and even shapes.' },
  playfulFormal: { cat: 'personality', bipolar: true, label: 'Tone', friendly: 'Fun or serious?', tech: 'Playful ↔ Formal', lo: 'Playful', hi: 'Formal', demo: 'jump',
    explain: 'Bouncy and tilted, or upright and refined.' },

  fill: { cat: 'effects', type: 'fill', label: 'Fill', friendly: 'Build the letters from something else', tech: 'Fill', demo: 'Rg',
    explain: 'Solid ink, outlines, or a grid of pixels, dots or lines.' },
  stencil: { cat: 'effects', label: 'Stencil', friendly: 'Cut gaps where the strokes meet', tech: 'Stencil', lo: 'Solid', hi: 'Wide gaps', demo: 'BOa',
    explain: 'Strokes break where they join, as if cut from a sheet.' },
  slice: { cat: 'effects', label: 'Slice', friendly: 'Cut one line through every letter', tech: 'Slice', lo: 'None', hi: 'Wide', demo: 'type',
    explain: 'One horizontal cut runs across the whole line.' }
};
export const SERIF_SUBS: Record<SerifSubKey, SubControlDef> = {
  serifSize: { label: 'Length', friendly: 'Make the feet longer', tech: 'Serif size', lo: 'Short', hi: 'Long' },
  serifThickness: { label: 'Thickness', friendly: 'Make the feet heavier', tech: 'Serif thickness', lo: 'Hairline', hi: 'Heavy' },
  serifAngle: { label: 'Angle', friendly: 'Slope the top of the feet', tech: 'Serif angle', lo: 'Flat', hi: 'Sloped' }
};
export const FILL_SUBS: Record<FillSubKey, SubControlDef> = {
  module: { label: 'Grid size', friendly: 'Change the size of the grid or line', tech: 'Module size', lo: 'Fine', hi: 'Coarse' }
};
/** Every nested sub-slider, whichever control it belongs to. */
export const SUBS: Record<SerifSubKey | FillSubKey, SubControlDef> = { ...SERIF_SUBS, ...FILL_SUBS };
export const STORY_OPTIONS: [Exclude<Story, 'auto'>, string][] = [['double', 'Double'], ['single', 'Single']];
export const FILL_OPTIONS: [Fill, string][] = [['solid', 'Solid'], ['wire', 'Wireframe'], ['pixels', 'Pixels'], ['dots', 'Dots'], ['lines', 'Lines']];
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
  xHeight: 'xHeight', capHeight: 'height', ascender: 'extenders', descender: 'extenders'
};

export const TEXTS = {
  sentence: 'If you can design one thing, you can design everything.',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789',
  punct: '.,!?;:\'"()-/&@#$%+',
  paragraph: 'Type is the voice of written words. Every letter is a small drawing, and a typeface is hundreds of drawings that agree with each other: the same stroke, the same curve, the same rhythm repeated until a texture appears. Change one decision (how heavy, how round, how open) and the whole voice changes with it.\n\nSphinx of black quartz, judge my vow! Pack my box with five dozen liquor jugs & 1,234 more @ $5.67 (+89%).'
};

export const styleById = (id: string | null | undefined) => STYLES.find(s => s.id === id);
/** The picked tags of each facet; an empty list means no filter on that facet. */
export interface StyleFilter { groups: StyleGroup[]; moods: Mood[]; looks: Look[]; weights: Weight[] }
/** Faceted like Google Fonts: any of the picked tags within a facet, every facet at once. */
export const styleMatches = (s: StyleDef, f: StyleFilter) =>
  (!f.groups.length || f.groups.includes(s.group)) && (!f.moods.length || s.moods.some(m => f.moods.includes(m))) &&
  (!f.looks.length || s.looks.some(l => f.looks.includes(l))) && (!f.weights.length || f.weights.includes(s.weight));

/** The starting style each filter tag is set in: one that belongs to the group or carries the mood. */
export const TAG_FACE: Record<StyleGroup | Mood | Look | Weight, string> = {
  grid: 'pixel', stencil: 'stencil', outline: 'construction', squared: 'squaremono', faceted: 'octagon', inktrap: 'inktrap',
  rounded: 'soft', contrast: 'didone', wide: 'split', narrow: 'condensed', slanted: 'informal', wobbly: 'upright',
  tapered: 'flared', bigx: 'techno', smallx: 'oldstyle', singlea: 'geometric',
  light: 'oldstyle', regular: 'grotesque', bold: 'tightgeo', heavy: 'inktrap',
  sans: 'grotesque', serif: 'serif', slab: 'slab', mono: 'code', hand: 'casual', display: 'woodtype',
  business: 'grotesque', calm: 'humanist', happy: 'soft', playful: 'display', cute: 'upright', childlike: 'casual',
  fancy: 'didone', sophisticated: 'chancery', artistic: 'brush', loud: 'fatface', rugged: 'marker', vintage: 'typewriter',
  futuristic: 'techno', sincere: 'clarendon', excited: 'marker', innovative: 'squircle', stiff: 'code'
};

/** First control of each category, opened when the category is picked. */
export const firstControl = (cat: CategoryId) =>
  (Object.keys(CONTROLS) as ControlKey[]).find(k => CONTROLS[k].cat === cat) ?? 'weight';

/** The control a key belongs to: serif sub-sliders fold into 'serif', the module size into 'fill'. */
export const controlFor = (key: ActiveKey): ControlKey =>
  key in SERIF_SUBS ? 'serif' : key in FILL_SUBS ? 'fill' : key as ControlKey;
