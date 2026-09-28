/* Starting styles, navigation, and the plain-language description of every control.
   Shared by the client (UI copy) and the server (validating style ids). */
import { resolve, type Effective } from './engine/font';
import { DEFAULTS, type BowlJoin, type Dots, type Fill, type GForm, type IForm, type KForm, type SForm, type Params, type SerifShape, type Story, type Terminal, type TerminalForm, type TerminalRun } from './params';

export type CategoryId = 'style' | 'structure' | 'shape' | 'proportion' | 'spacing' | 'personality' | 'effects';
export type ControlKey =
  | 'weight' | 'width' | 'height' | 'slant' | 'contrast' | 'reverse'
  | 'roundness' | 'curve' | 'squareness' | 'chamfer' | 'terminal' | 'story' | 'gForm' | 'kForm' | 'iForm' | 'sForm' | 'bowlJoin' | 'overlap' | 'dots' | 'serif' | 'apex' | 'joints' | 'cursive' | 'wobble'
  | 'xHeight' | 'extenders' | 'descender' | 'tail' | 'counter' | 'aperture' | 'crossbar'
  | 'letterSpacing' | 'wordSpacing' | 'mono' | 'sideBearing'
  | 'geoHuman' | 'softSharp' | 'classicFuture' | 'playfulFormal'
  | 'fill' | 'stencil' | 'slice';
export type SerifSubKey = 'serifSize' | 'serifThickness' | 'serifAngle';
export type FillSubKey = 'module';
export type TerminalSubKey = 'terminalLength' | 'terminalCurl' | 'terminalFlare' | 'terminalDepth' | 'terminalSize' | 'terminalRound' | 'terminalPoint' | 'terminalClip' | 'terminalLean' | 'terminalSlope' | 'terminalTilt' | 'terminalTip' | 'terminalTaper';
/** Anything the control panel can focus: a control or one of its nested sub-sliders. */
export type DotSubKey = 'dotSize';
export type ActiveKey = ControlKey | SerifSubKey | FillSubKey | TerminalSubKey | DotSubKey;

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
  type?: 'options' | 'story' | 'form' | 'serif' | 'fill';
  bipolar?: boolean;
  advanced?: boolean;
  /** An optional slider: its value where it changes nothing. It gets an on/off switch, and off hides the slider. */
  off?: number;
}
export interface SubControlDef { label: string; friendly: string; tech: string; lo: string; hi: string; bipolar?: boolean }

/* Starting styles are browsed like the tag filters on Google Fonts, in five sections: Feeling,
   Appearance, then the classification tags of Calligraphy, Serif and Sans Serif. The group only
   lays out the cards on the stage; the filters use the tags. */
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
/* Each style's moods follow the Google Fonts Feeling scores of its reference families, listed in Google's order. */
export const MOODS: { id: Mood; label: string }[] = ([
  ['business', 'Business'], ['calm', 'Calm'], ['cute', 'Cute'], ['playful', 'Playful'], ['fancy', 'Fancy'], ['stiff', 'Stiff'],
  ['vintage', 'Vintage'], ['happy', 'Happy'], ['futuristic', 'Futuristic'], ['excited', 'Excited'], ['rugged', 'Rugged'],
  ['childlike', 'Childlike'], ['loud', 'Loud'], ['artistic', 'Artistic'], ['sophisticated', 'Sophisticated'], ['innovative', 'Innovative'],
  ['sincere', 'Sincere']
] as [Mood, string][]).map(([id, label]) => ({ id, label }));

/* Appearance, like Google's tags of that name: what the letters look like. Unlike the other
   tags these are not hand-picked but read off each style's settings, so they stay true as
   styles are tuned. */
export type Look = 'mono' | 'pixel' | 'stencil' | 'outline' | 'techno' | 'inktrap' | 'contrast' | 'wide' | 'narrow';
export const LOOKS: { id: Look; label: string; hint: string; test: (e: Effective) => boolean }[] = [
  { id: 'mono', label: 'Monospace', hint: 'Every letter takes the same width', test: e => e.mono >= 0.5 },
  { id: 'pixel', label: 'Pixel', hint: 'Built from a grid of pixels or dots', test: e => e.fill === 'pixels' || e.fill === 'dots' },
  { id: 'stencil', label: 'Stencil', hint: 'Letters cut apart by gaps', test: e => e.stencil > 0 || e.slice > 0 },
  { id: 'outline', label: 'Outline', hint: 'Drawn as lines, not filled in', test: e => e.fill === 'wire' },
  { id: 'techno', label: 'Techno', hint: 'Squared-off bowls or cut corners instead of curves', test: e => e.fill === 'solid' && (e.square >= 0.5 || e.chamfer >= 0.2) },
  { id: 'inktrap', label: 'Ink Traps', hint: 'Strokes narrow where they meet', test: e => e.joints >= 0.4 },
  { id: 'contrast', label: 'High Contrast', hint: 'Strong difference between thick and thin', test: e => e.contrast >= 0.5 },
  { id: 'wide', label: 'Wide', hint: 'Stretched out sideways', test: e => e.width >= 0.68 },
  { id: 'narrow', label: 'Narrow', hint: 'Squeezed tall and thin', test: e => e.width <= 0.35 }
];

/* Classification, like Google's Calligraphy, Serif and Sans Serif tags: the genre a style is
   drawn in. Hand-picked, and a style may carry more than one (a Clarendon is also a Slab).
   Together they are one facet, so picking Didone and Geometric shows both. */
export type Kind = 'handwritten' | 'upright' | 'informal' | 'formal' | 'brush' | 'marker' | 'swash' | 'italic' | 'monoline' | 'signature' | 'blackletter'
  | 'venetian' | 'oldstyle' | 'transitional' | 'didone' | 'fatface' | 'wedge' | 'slab' | 'clarendon'
  | 'geometric' | 'neogrotesque' | 'grotesque' | 'humanist' | 'rounded' | 'superellipse' | 'flared';
type TagDef<T> = { id: T; label: string; hint: string };
export const KIND_SECTIONS: { id: string; label: string; tags: TagDef<Kind>[] }[] = [
  { id: 'calligraphy', label: 'Calligraphy', tags: [
    { id: 'handwritten', label: 'Handwritten', hint: 'Everyday writing with a pen' },
    { id: 'upright', label: 'Upright', hint: 'Handwriting that stands up straight' },
    { id: 'informal', label: 'Informal', hint: 'Loose, lively and slanted' },
    { id: 'formal', label: 'Formal', hint: 'Elegant, joined-up script' },
    { id: 'brush', label: 'Brush', hint: 'Painted with a loaded brush' },
    { id: 'marker', label: 'Marker', hint: 'Thick, even felt-marker lines' },
    { id: 'swash', label: 'Swash', hint: 'Stroke ends curl into flourishes' },
    { id: 'italic', label: 'Italic', hint: 'A slanted broad-nib pen hand, thick and thin' },
    { id: 'monoline', label: 'Monoline', hint: 'An even pen line with no thick and thin' },
    { id: 'signature', label: 'Signature', hint: 'Fast, loose and tall, like signing your name' },
    { id: 'blackletter', label: 'Blackletter', hint: 'Dense, broken Gothic strokes from a broad pen' }
  ] },
  { id: 'serif', label: 'Serif', tags: [
    { id: 'venetian', label: 'Venetian', hint: 'The first roman type: dark, low contrast, sloped serifs' },
    { id: 'oldstyle', label: 'Old Style', hint: 'Renaissance book type with angled stress' },
    { id: 'transitional', label: 'Transitional', hint: 'Crisp serifs and upright stress' },
    { id: 'didone', label: 'Didone', hint: 'Extreme contrast and hairline serifs' },
    { id: 'fatface', label: 'Fat Face', hint: 'A Didone as heavy as it goes' },
    { id: 'wedge', label: 'Wedge', hint: 'Triangular, chisel-cut serifs' },
    { id: 'slab', label: 'Slab', hint: 'Heavy, block-shaped serifs' },
    { id: 'clarendon', label: 'Clarendon', hint: 'A slab with soft, bracketed serifs' }
  ] },
  { id: 'sans', label: 'Sans Serif', tags: [
    { id: 'geometric', label: 'Geometric', hint: 'Built from circles and straight lines' },
    { id: 'neogrotesque', label: 'Neo Grotesque', hint: 'Neutral and even, like Helvetica' },
    { id: 'grotesque', label: 'Grotesque', hint: 'Early sans serifs, dense and gritty' },
    { id: 'humanist', label: 'Humanist', hint: 'Shaped like writing with a pen' },
    { id: 'rounded', label: 'Rounded', hint: 'Soft corners and stroke endings' },
    { id: 'superellipse', label: 'Superellipse', hint: 'Bowls halfway between a circle and a square' },
    { id: 'flared', label: 'Flared', hint: 'Strokes swell toward their ends (Google: Glyphic)' }
  ] }
];

export interface StyleDef {
  id: string; name: string; group: StyleGroup; kinds: Kind[]; moods: Mood[]; desc: string;
  /** Google Fonts families in the same genre, for reference */
  like: string;
  params: Params;
  /** read off the params, see LOOKS */
  looks: Look[];
}

const style = (id: string, group: StyleGroup, kinds: Kind[], name: string, moods: Mood[], like: string, desc: string, p: Partial<Params>): StyleDef => {
  const params = { ...DEFAULTS, ...p }, e = resolve(params);
  return { id, name, group, kinds, moods, desc, like, params, looks: LOOKS.filter(l => l.test(e)).map(l => l.id) };
};

/* Ids are stored with saved designs, so they never change even when a style is renamed. */
export const STYLES: StyleDef[] = [
  /* ---- Sans Serif */
  style('geometric', 'sans', ['geometric'], 'Geometric', ['calm', 'business'], 'Poppins, Montserrat, Jost',
    'Built from circles and straight lines, after Futura: a light, even stroke, a small lowercase under tall ascenders, pointed peaks and a single-storey a.',
    { weight: 0.24, width: 0.52, contrast: 0, curve: 0, geoHuman: 0.15, apex: 0, counter: 0.7, xHeight: 0.34, extenders: 0.85,
      aperture: 0.45, overlap: 0, story: 'single', letterSpacing: 0.24 }),
  style('grotesque', 'sans', ['neogrotesque'], 'Neo Grotesque', ['calm', 'business', 'stiff'], 'Roboto, Inter, Work Sans',
    'The Swiss workhorse, set bold and tight. A tall lowercase, closed-in openings and level stroke endings make it dense and matter-of-fact.',
    { weight: 0.62, width: 0.46, contrast: 0.06, curve: 0.1, geoHuman: 0.4, aperture: 0.1, xHeight: 0.72, extenders: 0.35, apex: 0.62,
      counter: 0.44, letterSpacing: 0.12 }),
  style('humanist', 'sans', ['humanist'], 'Humanist', ['business', 'calm', 'sincere'], 'Open Sans, Source Sans 3, Fira Sans',
    'Shaped like writing with a pen: wide-open letterforms, angled stroke ends, gentle contrast and a human rhythm.',
    { weight: 0.46, width: 0.44, contrast: 0.28, curve: 0.7, geoHuman: 1, terminal: 'angled', xHeight: 0.5, extenders: 0.62, aperture: 0.95,
      apex: 0.45, story: 'double', letterSpacing: 0.2 }),
  style('condensed', 'sans', ['grotesque'], 'Condensed', ['loud', 'rugged', 'stiff'], 'Oswald, Bebas Neue, Anton',
    'Black, tall and squeezed as narrow as it goes. Fits long headlines into tight columns without losing punch.',
    { weight: 0.7, width: 0.16, height: 0.85, xHeight: 0.72, extenders: 0.3, contrast: 0.08, aperture: 0.2, squareness: 0.25,
      classicFuture: 0.6, apex: 0.75, counter: 0.36, letterSpacing: 0.22 }),
  style('soft', 'sans', ['rounded'], 'Rounded', ['calm', 'happy', 'cute'], 'Nunito, Varela Round, Quicksand',
    'Light and round-ended, with big airy counters and generous spacing. Easy-going and friendly.',
    { weight: 0.3, width: 0.66, contrast: 0, roundness: 1, terminal: 'round', xHeight: 0.62, counter: 0.72, aperture: 0.6, softSharp: 0.3,
      playfulFormal: 0.4, geoHuman: 0.35, apex: 0.6, story: 'single', letterSpacing: 0.26 }),
  style('extended', 'sans', ['superellipse'], 'Squared', ['futuristic'], 'Michroma, Oxanium, Rajdhani',
    'A fine line stretched extra wide, with round letters drawn as squarish ovals and plenty of air between them. Precise and technical.',
    { weight: 0.2, width: 0.95, contrast: 0, curve: 0, squareness: 0.7, classicFuture: 0.8, xHeight: 0.52, apex: 0.8, counter: 0.52,
      letterSpacing: 0.34 }),
  style('tightgeo', 'sans', ['geometric'], 'Tight Geometric', ['loud', 'sophisticated'], 'Outfit, Urbanist, Lexend',
    'A black 70s logotype sans after Herb Lubalin: perfect circles, a single-storey a, towering ascenders and letters packed so close they nearly touch.',
    { weight: 0.78, width: 0.58, contrast: 0.02, curve: 0, geoHuman: 0.1, apex: 0.1, counter: 0.74, xHeight: 0.66, extenders: 1, aperture: 0.35,
      letterSpacing: 0.05 }),
  style('squircle', 'sans', ['superellipse'], 'Superellipse', ['futuristic', 'calm', 'innovative'], 'Unbounded, Syne, Lexend Zetta',
    'Chunky squircle bowls, halfway between a circle and a square, with rounded ends and strokes that pinch in where they meet. Soft but engineered.',
    { weight: 0.68, width: 0.58, contrast: 0.04, squareness: 0.7, joints: 0.55, roundness: 0.5, terminal: 'round', curve: 0, geoHuman: 0.35,
      apex: 0.7, xHeight: 0.62, counter: 0.6, letterSpacing: 0.2 }),
  style('inktrap', 'sans', ['grotesque'], 'Ink Trap', ['loud', 'artistic', 'innovative'], 'Bricolage Grotesque, Syne, Darker Grotesque',
    'A heavy display grotesque with deep ink traps: strokes narrow sharply where they branch, so the black letters stay open.',
    { weight: 0.8, width: 0.58, contrast: 0.4, squareness: 0.45, joints: 1, curve: 0.1, geoHuman: 0.4, apex: 0.6, xHeight: 0.6,
      aperture: 0.3, counter: 0.4, letterSpacing: 0.14 }),
  style('flared', 'sans', ['flared'], 'Flared', ['sophisticated', 'vintage'], 'Marcellus, Julius Sans One, Philosopher',
    'A sans serif carved like stone lettering: fine strokes swell toward their ends, with a small lowercase, high crossbars and airy spacing.',
    { weight: 0.32, width: 0.54, contrast: 0.6, terminal: 'tapered', terminalLength: 0.62, curve: 0.4, geoHuman: 0.65, classicFuture: 0.3,
      xHeight: 0.36, extenders: 0.7, aperture: 0.65, apex: 0.3, crossbar: 0.6, letterSpacing: 0.3 }),
  style('gothic', 'sans', ['grotesque'], 'Grotesk', ['business', 'rugged', 'sincere'], 'Libre Franklin, Archivo, Public Sans',
    'An American gothic after Franklin: sturdy and a little rough, with a two-storey a and g, slight contrast and stroke ends that pinch in.',
    { weight: 0.58, width: 0.44, contrast: 0.2, curve: 0.25, geoHuman: 0.55, joints: 0.2, story: 'double', xHeight: 0.56, extenders: 0.5,
      aperture: 0.35, apex: 0.5, counter: 0.42, letterSpacing: 0.16 }),
  style('wide', 'sans', ['neogrotesque'], 'Extra Wide', ['loud', 'innovative', 'business'], 'Archivo Expanded, Dela Gothic One, Krona One',
    'A black grotesque stretched as wide as it goes and set tight: short, flat and heavy, like a sports or streetwear logo.',
    { weight: 0.86, width: 1, height: 0.38, contrast: 0.08, curve: 0.1, squareness: 0.2, geoHuman: 0.35, xHeight: 0.7, extenders: 0.3,
      aperture: 0.2, apex: 0.7, counter: 0.36, letterSpacing: 0.08 }),
  style('industrial', 'sans', ['superellipse'], 'Industrial', ['business', 'stiff', 'futuristic'], 'Barlow, Saira, Encode Sans',
    'A road-sign sans after DIN: engineered from straight sides and squarish curves, with a big lowercase, level stroke ends and even spacing.',
    { weight: 0.5, width: 0.42, contrast: 0, squareness: 0.45, curve: 0, geoHuman: 0.3, apex: 0.7, xHeight: 0.66, extenders: 0.35,
      aperture: 0.45, counter: 0.5, classicFuture: 0.7, story: 'double', letterSpacing: 0.16 }),
  style('screen', 'sans', ['humanist'], 'Screen Sans', ['business', 'calm', 'sincere'], 'Noto Sans, Hind, Mukta',
    'Drawn for reading on screens, after Verdana: wide, open letters with a very tall lowercase, sturdy strokes and loose spacing.',
    { weight: 0.5, width: 0.6, contrast: 0.08, curve: 0.5, geoHuman: 0.8, xHeight: 0.74, extenders: 0.4, aperture: 0.8, counter: 0.62,
      apex: 0.5, story: 'double', letterSpacing: 0.24 }),
  style('softcond', 'sans', ['rounded'], 'Soft Condensed', ['calm', 'futuristic', 'stiff'], 'Big Shoulders Display, Saira Extra Condensed, Pathway Gothic One',
    'Light, tall and squeezed thin, with softened corners and straight-sided bowls: quiet, clean and made to save space.',
    { weight: 0.3, width: 0.12, height: 0.85, contrast: 0, squareness: 0.55, roundness: 0.5, terminal: 'round', xHeight: 0.7,
      extenders: 0.3, apex: 0.8, counter: 0.4, aperture: 0.3, classicFuture: 0.6, letterSpacing: 0.2 }),
  style('blockgothic', 'sans', ['superellipse'], 'Block Gothic', ['loud', 'rugged', 'excited'], 'Squada One, Teko, Russo One',
    'Heavy, narrow and squared off, like jersey numbers or a gig poster: flat-sided bowls, tiny counters and a big lowercase.',
    { weight: 0.9, width: 0.3, height: 0.75, contrast: 0.05, squareness: 0.8, roundness: 0.3, xHeight: 0.74, extenders: 0.25,
      aperture: 0.15, counter: 0.26, apex: 0.95, classicFuture: 0.8, letterSpacing: 0.1 }),
  style('ultrablack', 'sans', ['geometric'], 'Ultra Black', ['loud', 'playful', 'innovative', 'excited'], 'Rubik Mono One, Climate Crisis, Titan One',
    'As black as a geometric sans can go: wide letters packed close, with pinhole counters and deep ink traps where strokes meet.',
    { weight: 1, width: 0.7, contrast: 0.1, joints: 0.8, squareness: 0.2, curve: 0, geoHuman: 0.2, counter: 0.2, aperture: 0.1,
      xHeight: 0.7, extenders: 0.25, apex: 0.3, letterSpacing: 0.02 }),
  style('thinsans', 'sans', ['geometric'], 'Thin Sans', ['sophisticated', 'calm', 'fancy'], 'Raleway, Josefin Sans, Jost',
    'The thinnest line there is, drawn on round, open letters with long ascenders and airy spacing. Quiet and elegant at large sizes.',
    { weight: 0, width: 0.52, contrast: 0, curve: 0.2, geoHuman: 0.45, xHeight: 0.44, extenders: 0.8, apex: 0.3, counter: 0.62,
      aperture: 0.55, letterSpacing: 0.36 }),
  style('sporty', 'sans', ['neogrotesque'], 'Sport Italic', ['excited', 'loud', 'futuristic'], 'Kanit Italic, Saira Italic, Racing Sans One',
    'A bold, squarish sans leaning hard into the wind, with cut stroke ends and tight spacing, like the lettering on a team jersey.',
    { weight: 0.8, width: 0.62, slant: 0.55, contrast: 0.1, squareness: 0.35, terminal: 'cut', apex: 0.8, xHeight: 0.66, aperture: 0.25,
      counter: 0.4, classicFuture: 0.75, letterSpacing: 0.1 }),
  style('chunkyround', 'sans', ['rounded'], 'Chunky Rounded', ['happy', 'cute', 'childlike', 'playful'], 'Fredoka, Baloo 2, Mochiy Pop One',
    'Bold, round-ended and steady: a big lowercase with a single-storey a and soft, open shapes, like a friendly app icon.',
    { weight: 0.74, width: 0.56, contrast: 0, roundness: 1, terminal: 'round', curve: 0.3, geoHuman: 0.4, xHeight: 0.68, counter: 0.5,
      aperture: 0.55, story: 'single', softSharp: 0.1, playfulFormal: 0.45, letterSpacing: 0.14 }),

  /* ---- Serif */
  style('oldstyle', 'serif', ['oldstyle'], 'Old Style', ['business', 'vintage', 'sophisticated', 'sincere'], 'EB Garamond, Cormorant Garamond, Crimson Pro',
    'Renaissance book type. Angled stress, steeply sloped serifs, a tiny lowercase under long ascenders and open, calligraphic curves.',
    { weight: 0.34, width: 0.46, contrast: 0.42, serif: true, serifShape: 'bracketed', serifSize: 0.45, serifThickness: 0.18, serifAngle: 0.9,
      terminal: 'tapered', curve: 0.75, geoHuman: 0.9, classicFuture: 0.1, xHeight: 0.3, extenders: 0.85, aperture: 0.75, apex: 0.2,
      crossbar: 0.62, letterSpacing: 0.22 }),
  style('serif', 'serif', ['transitional'], 'Transitional', ['business', 'calm', 'sincere'], 'Libre Baskerville, Source Serif 4, Lora',
    'Crisp serifs, clear thick-and-thin strokes, upright stress and ball endings. Made for headlines and long reads alike.',
    { weight: 0.45, contrast: 0.6, serif: true, serifShape: 'bracketed', serifSize: 0.42, serifThickness: 0.22, serifAngle: 0.15,
      terminal: 'round', classicFuture: 0.3, curve: 0.4, xHeight: 0.52, apex: 0.3, letterSpacing: 0.2 }),
  style('didone', 'serif', ['didone'], 'Didone', ['fancy', 'sophisticated', 'vintage'], 'Playfair Display, Bodoni Moda, Prata',
    'Extreme contrast, set tall and narrow: heavy upright stems against hairline serifs and ball-shaped endings. Built for fashion covers.',
    { weight: 0.58, width: 0.4, height: 0.72, contrast: 1, serif: true, serifShape: 'unbracketed', serifSize: 0.26, serifThickness: 0.04, serifAngle: 0,
      terminal: 'round', curve: 0, geoHuman: 0.4, classicFuture: 0.4, aperture: 0.2, xHeight: 0.56, apex: 0.05, letterSpacing: 0.2 }),
  style('fatface', 'serif', ['fatface', 'didone'], 'Fat Face', ['loud', 'vintage', 'rugged'], 'Abril Fatface, Rozha One, Ultra',
    'A Didone pushed to the limit: stems as heavy as they go, hairlines as thin as they go, tiny counters.',
    { weight: 0.96, width: 0.72, contrast: 0.9, serif: true, serifShape: 'unbracketed', serifSize: 0.3, serifThickness: 0.12, serifAngle: 0,
      terminal: 'round', curve: 0.05, xHeight: 0.54, aperture: 0.25, counter: 0.34, letterSpacing: 0.18 }),
  style('wedge', 'serif', ['wedge'], 'Wedge Serif', ['vintage', 'fancy'], 'Cinzel, Forum, Marcellus SC',
    'Big triangular, chisel-cut serifs on wide, widely spaced letters with a small lowercase. Feels engraved, heroic and a little mythic.',
    { weight: 0.4, width: 0.66, contrast: 0.3, serif: true, serifShape: 'wedge', serifSize: 0.46, serifThickness: 0.5, serifAngle: 0.35,
      terminal: 'sharp', softSharp: 0.9, apex: 0, classicFuture: 0.3, xHeight: 0.4, curve: 0.3, letterSpacing: 0.4 }),
  style('news', 'serif', ['transitional'], 'Newspaper', ['business', 'sincere', 'stiff'], 'PT Serif, Newsreader, Merriweather',
    'Built to fit more words on a page: narrow, sturdy and set tight, with a big lowercase, sharp serifs and moderate contrast.',
    { weight: 0.5, width: 0.3, contrast: 0.45, serif: true, serifShape: 'bracketed', serifSize: 0.34, serifThickness: 0.24, serifAngle: 0.2,
      terminal: 'round', curve: 0.35, geoHuman: 0.5, xHeight: 0.66, extenders: 0.4, aperture: 0.35, apex: 0.35, counter: 0.42,
      letterSpacing: 0.1 }),
  style('softserif', 'serif', ['oldstyle'], 'Soft Serif', ['happy', 'vintage', 'playful', 'sincere'], 'Caprasimo, Fraunces, Young Serif',
    'A 70s ad face after Cooper Black: very heavy and wide, with every serif and corner melted round and small, squashed counters.',
    { weight: 0.92, width: 0.68, contrast: 0.3, serif: true, serifShape: 'bracketed', serifSize: 0.36, serifThickness: 0.6, serifAngle: 0.5,
      roundness: 1, terminal: 'round', curve: 0.7, geoHuman: 0.7, softSharp: 0, xHeight: 0.6, aperture: 0.3, counter: 0.3,
      playfulFormal: 0.3, letterSpacing: 0.12 }),
  style('hairserif', 'serif', ['didone'], 'Hairline Serif', ['fancy', 'sophisticated', 'calm'], 'Italiana, Cormorant, Bodoni Moda',
    'A fashion-magazine display serif: fine strokes against hairlines, tiny sharp serifs, tapering ends and letters set close.',
    { weight: 0.3, width: 0.44, height: 0.7, contrast: 1, serif: true, serifShape: 'unbracketed', serifSize: 0.3, serifThickness: 0.1,
      serifAngle: 0, terminal: 'tapered', curve: 0.5, geoHuman: 0.6, xHeight: 0.5, aperture: 0.6, apex: 0.1, crossbar: 0.45, story: 'double',
      letterSpacing: 0.08 }),
  style('condserif', 'serif', ['didone'], 'Condensed Serif', ['sophisticated', 'fancy', 'vintage'], 'Instrument Serif, Antic Didone, Gilda Display',
    'A tall, narrow Didone for headlines: slim stems, hairline serifs and ball endings, stacked up like a poster title.',
    { weight: 0.36, width: 0.12, height: 0.85, contrast: 0.8, serif: true, serifShape: 'unbracketed', serifSize: 0.3, serifThickness: 0.08,
      serifAngle: 0, terminal: 'round', curve: 0.1, xHeight: 0.62, apex: 0.2, counter: 0.4, aperture: 0.3, letterSpacing: 0.18 }),
  style('compressed', 'serif', ['fatface', 'didone'], 'Compressed Serif', ['loud', 'vintage', 'rugged', 'excited'], 'Rozha One, Abril Fatface, DM Serif Display',
    'A fat face squeezed tall and narrow and set tight: black stems, thin hairlines and small bracketed serifs, like a Victorian playbill.',
    { weight: 0.84, width: 0.32, height: 0.8, contrast: 0.85, serif: true, serifShape: 'bracketed', serifSize: 0.24, serifThickness: 0.12,
      serifAngle: 0, terminal: 'round', curve: 0.4, xHeight: 0.66, aperture: 0.2, counter: 0.3, apex: 0.7, letterSpacing: 0.08 }),
  style('headline', 'serif', ['transitional'], 'Headline Serif', ['sophisticated', 'business', 'loud'], 'DM Serif Display, Gloock, Rufina',
    'A bold, sharp serif for magazine headlines: strong contrast, ball endings and spacing tightened up for big sizes.',
    { weight: 0.74, width: 0.48, contrast: 0.85, serif: true, serifShape: 'bracketed', serifSize: 0.36, serifThickness: 0.12, serifAngle: 0.1,
      terminal: 'round', curve: 0.3, geoHuman: 0.5, xHeight: 0.58, aperture: 0.3, counter: 0.4, apex: 0.25, letterSpacing: 0.06 }),
  style('serifitalic', 'serif', ['didone'], 'Serif Italic', ['fancy', 'sophisticated', 'artistic'], 'Playfair Display Italic, Instrument Serif Italic, Bodoni Moda Italic',
    'The true italic of a high-contrast serif: leaning, flowing letters with hairline serifs, ball endings and a cursive a, g and y.',
    { weight: 0.4, width: 0.4, height: 0.62, slant: 0.4, contrast: 0.85, serif: true, serifShape: 'unbracketed', serifSize: 0.26,
      serifThickness: 0.06, serifAngle: 0.3, terminal: 'round', cursive: 0.45, curve: 0.6, geoHuman: 0.7, xHeight: 0.5, extenders: 0.65,
      aperture: 0.5, apex: 0.2, letterSpacing: 0.12 }),
  style('copperplate', 'serif', [], 'Copperplate', ['business', 'vintage', 'stiff'], 'Stint Ultra Expanded, Castoro Titling, Marcellus SC',
    'Wide, light, even letters with tiny spur serifs and airy spacing, like an engraved letterhead or business card.',
    { weight: 0.36, width: 0.82, height: 0.4, contrast: 0.08, serif: true, serifShape: 'unbracketed', serifSize: 0.22, serifThickness: 0.2,
      serifAngle: 0, curve: 0.2, geoHuman: 0.4, xHeight: 0.66, extenders: 0.35, aperture: 0.4, apex: 0.6, counter: 0.5, letterSpacing: 0.36 }),
  style('venetian', 'serif', ['venetian'], 'Venetian', ['vintage', 'sincere', 'sophisticated', 'calm'], 'Alegreya, Sorts Mill Goudy, Cardo',
    'The first roman type, cut in 1470s Venice: dark and even, with little contrast, steeply sloped serifs, a small lowercase and a calligraphic swing.',
    { weight: 0.46, width: 0.5, contrast: 0.22, serif: true, serifShape: 'bracketed', serifSize: 0.4, serifThickness: 0.3, serifAngle: 1,
      terminal: 'angled', curve: 0.8, geoHuman: 1, classicFuture: 0, xHeight: 0.3, extenders: 0.8, aperture: 0.8, apex: 0.15, crossbar: 0.66,
      letterSpacing: 0.18 }),

  /* ---- Slab Serif */
  style('slab', 'slab', ['slab'], 'Geometric Slab', ['calm', 'business', 'stiff'], 'Josefin Slab, Arvo, Rokkitt',
    'Block-shaped serifs on a light, even, geometric skeleton: perfectly round bowls, a single-storey a and open spacing. Crisp and engineered.',
    { weight: 0.28, width: 0.6, contrast: 0, serif: true, serifShape: 'slab', serifSize: 0.38, serifThickness: 0.35, serifAngle: 0,
      curve: 0, geoHuman: 0.25, xHeight: 0.5, apex: 0.3, counter: 0.62, story: 'single', letterSpacing: 0.3 }),
  style('clarendon', 'slab', ['clarendon', 'slab'], 'Clarendon', ['business', 'rugged', 'vintage', 'sincere'], 'Crete Round, Zilla Slab, Besley',
    'A bold, friendly slab: heavy serifs flow into the stems through soft brackets, with some contrast, ball endings and a big lowercase.',
    { weight: 0.72, width: 0.54, contrast: 0.4, serif: true, serifShape: 'bracketed', serifSize: 0.34, serifThickness: 0.7, serifAngle: 0,
      terminal: 'round', roundness: 0.4, curve: 0.5, xHeight: 0.64, aperture: 0.3, counter: 0.44, letterSpacing: 0.2 }),
  style('egyptian', 'slab', ['slab'], 'Heavy Slab', ['loud', 'rugged', 'vintage'], 'Bevan, Patua One, Holtwood One SC',
    'An Egyptian after Rockwell, set black: square-cut slabs as thick as the stems, a monoline stroke and compact, blocky letters.',
    { weight: 0.84, width: 0.56, contrast: 0.06, serif: true, serifShape: 'slab', serifSize: 0.3, serifThickness: 0.95, serifAngle: 0,
      curve: 0.1, geoHuman: 0.3, squareness: 0.15, xHeight: 0.6, aperture: 0.25, counter: 0.36, apex: 0.4, letterSpacing: 0.16 }),
  style('humanslab', 'slab', ['slab'], 'Humanist Slab', ['calm', 'sincere', 'happy'], 'Bree Serif, Aleo, Kotta One',
    'A friendly upright-italic slab: short, rounded slabs, a single-storey a, a gentle lean and ends that flick out like handwriting.',
    { weight: 0.52, width: 0.44, slant: 0.08, contrast: 0.2, serif: true, serifShape: 'slab', serifSize: 0.28, serifThickness: 0.4, serifAngle: 0.3,
      roundness: 0.5, terminal: 'angled', cursive: 0.36, curve: 0.75, geoHuman: 0.9, story: 'single', xHeight: 0.58, aperture: 0.7,
      apex: 0.4, letterSpacing: 0.16 }),
  style('softslab', 'slab', ['slab'], 'Soft Slab', ['sincere', 'calm', 'happy', 'business'], 'Roboto Slab, Kameron, Slabo 27px',
    'A friendly modern slab after Museo Slab: sturdy, even strokes and square slabs with their corners softened, over a big lowercase.',
    { weight: 0.6, width: 0.5, contrast: 0.08, serif: true, serifShape: 'slab', serifSize: 0.3, serifThickness: 0.6, serifAngle: 0,
      roundness: 0.35, curve: 0.2, geoHuman: 0.4, xHeight: 0.62, aperture: 0.4, counter: 0.5, apex: 0.4, story: 'double', letterSpacing: 0.16 }),
  style('wideslab', 'slab', ['slab'], 'Expanded Slab', ['loud', 'vintage', 'rugged'], 'Rammetto One, Bowlby One, Alfa Slab One',
    'A heavy slab stretched as wide and low as it goes, with thick square serifs. Made for circus posters and bold packaging.',
    { weight: 0.74, width: 1, height: 0.4, contrast: 0.12, serif: true, serifShape: 'slab', serifSize: 0.3, serifThickness: 0.8, serifAngle: 0,
      curve: 0.1, xHeight: 0.66, counter: 0.4, aperture: 0.3, apex: 0.6, letterSpacing: 0.14 }),

  /* ---- Monospace */
  style('typewriter', 'mono', ['slab'], 'Typewriter', ['vintage', 'sincere'], 'Courier Prime, Cutive Mono, Special Elite',
    'Every letter the same width, with soft slab serifs and slightly uneven ink, like keys struck through a ribbon.',
    { weight: 0.3, contrast: 0, serif: true, serifShape: 'slab', serifSize: 0.55, serifThickness: 0.3, serifAngle: 0, mono: 1, wobble: 0.15,
      roundness: 0.7, terminal: 'round', curve: 0.3, xHeight: 0.52, letterSpacing: 0.2, wordSpacing: 0.35 }),
  style('squaremono', 'mono', [], 'Square Mono', ['futuristic', 'stiff'], 'Major Mono Display, Syne Mono, Space Mono',
    'A wide monospace with square bowls and square dots. Reads like numbers on a train departure board.',
    { weight: 0.42, width: 0.68, contrast: 0.02, mono: 1, squareness: 1, curve: 0, geoHuman: 0.3, xHeight: 0.62, apex: 0.9,
      aperture: 0.35, letterSpacing: 0.22, terminal: 'cut' }),
  style('code', 'mono', [], 'Code', ['calm', 'futuristic', 'stiff'], 'IBM Plex Mono, Space Mono, Ubuntu Mono',
    'A code-editor face: one narrow width for every character, a tall x-height, squarish bowls and slight ink traps that keep it crisp at small sizes.',
    { weight: 0.48, width: 0.38, contrast: 0.02, mono: 1, squareness: 0.3, joints: 0.3, curve: 0.1, geoHuman: 0.45, xHeight: 0.68, extenders: 0.4,
      aperture: 0.5, apex: 0.6, classicFuture: 0.6, letterSpacing: 0.2 }),
  style('roundmono', 'mono', ['rounded'], 'Rounded Mono', ['calm', 'cute', 'happy'], 'M PLUS 1 Code, Azeret Mono, Red Hat Mono',
    'A soft monospace for friendly terminals: round stroke ends and softened corners on a fixed grid, light and airy.',
    { weight: 0.36, width: 0.5, contrast: 0, mono: 1, roundness: 1, terminal: 'round', curve: 0.2, geoHuman: 0.4, xHeight: 0.6,
      extenders: 0.45, aperture: 0.55, counter: 0.6, apex: 0.6, story: 'single', letterSpacing: 0.2 }),
  style('terminal', 'mono', [], 'Terminal', ['futuristic', 'vintage', 'stiff'], 'VT323, Press Start 2P, Share Tech Mono',
    'Green-screen computer text: tall, narrow monospace letters built from fine square pixels, as on an 80s terminal.',
    { weight: 0.4, width: 0.36, height: 0.7, contrast: 0, mono: 1, squareness: 0.9, fill: 'pixels', module: 0.3, curve: 0, geoHuman: 0.35,
      xHeight: 0.62, apex: 0.9, aperture: 0.35, counter: 0.5, letterSpacing: 0.2 }),
  style('cursivemono', 'mono', [], 'Cursive Mono', ['artistic', 'calm', 'sophisticated'], 'Victor Mono Italic, JetBrains Mono Italic, Courier Prime Italic',
    'A coding italic: every letter the same width, but slanted and joined up in handwritten shapes, with round, looping ends.',
    { weight: 0.3, width: 0.42, slant: 0.35, contrast: 0.1, mono: 1, cursive: 0.75, roundness: 0.6, terminal: 'round', curve: 0.8,
      geoHuman: 0.8, xHeight: 0.56, extenders: 0.55, letterSpacing: 0.2 }),
  style('boldmono', 'mono', [], 'Heavy Mono', ['loud', 'futuristic', 'innovative'], 'Space Mono Bold, Chivo Mono Black, Martian Mono',
    'A black, wide monospace with squarish bowls and ink traps where strokes meet. Blunt and technical, for headlines on a grid.',
    { weight: 0.84, width: 0.62, contrast: 0.04, mono: 1, squareness: 0.3, joints: 0.35, curve: 0.1, geoHuman: 0.4, xHeight: 0.62,
      aperture: 0.3, counter: 0.4, apex: 0.7, letterSpacing: 0.18 }),
  style('serifmono', 'mono', [], 'Serif Mono', ['sophisticated', 'vintage', 'calm'], 'Xanh Mono, Anonymous Pro, IBM Plex Mono',
    'A bookish monospace: fine bracketed serifs and real thick-and-thin strokes squeezed onto one fixed width.',
    { weight: 0.4, width: 0.44, contrast: 0.62, mono: 1, serif: true, serifShape: 'bracketed', serifSize: 0.4, serifThickness: 0.14,
      serifAngle: 0.2, terminal: 'round', curve: 0.4, geoHuman: 0.6, xHeight: 0.5, extenders: 0.6, letterSpacing: 0.2 }),

  /* ---- Handwriting */
  style('casual', 'hand', ['handwritten', 'informal', 'monoline'], 'Casual Handwriting', ['happy', 'playful', 'childlike'], 'Caveat, Indie Flower, Shadows Into Light',
    'Quick everyday handwriting with a felt pen: narrow, a little slanted, letters that half-join and never sit quite still.',
    { weight: 0.28, width: 0.34, height: 0.62, slant: 0.25, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.9, cursive: 0.45,
      xHeight: 0.3, curve: 0.7, geoHuman: 0.8, letterSpacing: 0.12 }),
  style('upright', 'hand', ['handwritten', 'upright'], 'Hand Printed', ['childlike', 'happy', 'cute', 'sincere'], 'Patrick Hand, Gochi Hand, Mansalva',
    'Printed by hand, letter by letter. Upright and friendly, with round pen ends and wobbly lines.',
    { weight: 0.38, width: 0.45, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.75, cursive: 0.12,
      xHeight: 0.55, curve: 0.6, geoHuman: 0.75, playfulFormal: 0.3 }),
  style('informal', 'hand', ['informal'], 'Retro Script', ['vintage', 'playful', 'artistic', 'excited'], 'Pacifico, Lobster, Yellowtail',
    'A bold, joined-up script with a retro sign-painter swing: every letter flows into the next.',
    { weight: 0.62, width: 0.45, slant: 0.45, contrast: 0.3, roundness: 0.8, terminal: 'round', wobble: 0.25, cursive: 1,
      xHeight: 0.45, curve: 0.8, geoHuman: 0.8, letterSpacing: 0.02 }),
  style('chancery', 'hand', ['formal'], 'Formal Script', ['fancy', 'sophisticated'], 'Great Vibes, Tangerine, Pinyon Script',
    'Copperplate elegance: a steep slant, hairline upstrokes, swelling downstrokes and a tiny x-height.',
    { weight: 0.36, width: 0.32, height: 0.75, slant: 1, contrast: 0.8, terminal: 'tapered', cursive: 1,
      xHeight: 0.22, curve: 1, geoHuman: 1, letterSpacing: 0.02 }),
  style('brush', 'hand', ['brush', 'informal'], 'Brush', ['artistic', 'loud', 'excited'], 'Kaushan Script, Oregano, Mr Dafoe',
    'Fast, heavy strokes from a loaded brush. A strong lean, tapering ends and a rough, lively rhythm.',
    { weight: 0.7, width: 0.4, slant: 0.55, contrast: 0.45, terminal: 'tapered', wobble: 0.7, cursive: 0.55,
      xHeight: 0.5, curve: 0.8, geoHuman: 0.9, letterSpacing: 0.08 }),
  style('marker', 'hand', ['handwritten', 'upright', 'marker'], 'Marker', ['loud', 'playful', 'rugged', 'excited'], 'Permanent Marker, Rock Salt, Sedgwick Ave',
    'Thick, even lines from a felt marker: narrow, tall and a bit rough, leaning slightly, with round, blunt stroke ends.',
    { weight: 0.56, width: 0.36, height: 0.7, slant: 0.14, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.8,
      xHeight: 0.74, extenders: 0.3, curve: 0.3, geoHuman: 0.6, counter: 0.38, aperture: 0.4, letterSpacing: 0.14 }),
  style('swash', 'hand', ['formal', 'swash'], 'Swash Script', ['fancy', 'sophisticated', 'artistic'], 'Parisienne, Alex Brush, Italianno',
    'A wedding-invitation script: a steep lean, thick and thin strokes, and every stroke end wound into a curling flourish.',
    { weight: 0.4, width: 0.36, height: 0.7, slant: 0.7, contrast: 0.7, terminal: 'tapered', cursive: 1, terminalCurl: 0.61,
      xHeight: 0.3, extenders: 0.8, curve: 1, geoHuman: 1, letterSpacing: 0.04 }),
  style('italic', 'hand', ['italic', 'formal'], 'Chancery Italic', ['sophisticated', 'vintage', 'calm'], 'Cormorant Italic, Kalam, Satisfy',
    'Written with a broad-nib pen held at an angle: a narrow, springy italic with sharp thick-and-thin, angled cuts and ends that turn up in gentle hooks.',
    { weight: 0.44, width: 0.3, height: 0.65, slant: 0.3, contrast: 0.68, terminal: 'angled', cursive: 0.4, terminalCurl: 0.58,
      xHeight: 0.42, extenders: 0.7, curve: 0.9, geoHuman: 1, aperture: 0.7, letterSpacing: 0.1 }),
  style('monoline', 'hand', ['monoline', 'informal', 'swash'], 'Monoline Script', ['happy', 'calm', 'cute', 'playful'], 'Dancing Script, Sacramento, Cookie',
    'One even pen line looping from letter to letter, with round, curly ends and a relaxed, easy lean.',
    { weight: 0.26, width: 0.46, slant: 0.35, contrast: 0, roundness: 1, terminal: 'round', cursive: 1, terminalCurl: 0.63,
      xHeight: 0.42, extenders: 0.7, curve: 0.9, geoHuman: 0.8, letterSpacing: 0.06 }),
  style('curly', 'hand', ['handwritten', 'upright', 'swash'], 'Curly Hand', ['cute', 'happy', 'childlike', 'playful'], 'Sniglet, Grandstander, Chilanka',
    'Bouncy, upright printing that curls up at every end, like doodled notes in the margin of a sketchbook.',
    { weight: 0.42, width: 0.5, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.45, terminalCurl: 0.61,
      xHeight: 0.6, curve: 0.7, geoHuman: 0.7, playfulFormal: 0.15, counter: 0.6, letterSpacing: 0.22 }),
  style('signature', 'hand', ['signature', 'informal', 'monoline'], 'Signature', ['sophisticated', 'artistic', 'excited'], 'Mrs Saint Delafield, Monsieur La Doulaise, Herr Von Muellerhoff',
    'Signed at speed: a fine, fast line, a very steep lean, a tiny lowercase under towering loops and long tails that whip out past the letters.',
    { weight: 0.14, width: 0.28, height: 0.8, slant: 0.9, contrast: 0.1, terminal: 'tapered', wobble: 0.5, cursive: 1, terminalCurl: 0.64,
      terminalLength: 0.7, tail: 0.85, xHeight: 0.14, extenders: 1, curve: 1, geoHuman: 1, letterSpacing: 0, wordSpacing: 0.6 }),
  style('blackletter', 'hand', ['blackletter'], 'Blackletter', ['vintage', 'rugged', 'fancy'], 'UnifrakturMaguntia, Pirata One, Grenze Gotisch',
    'Gothic textura from a broad pen: tall, narrow and packed close, every curve broken into straight cuts, with diamond-sharp serifs.',
    { weight: 0.6, width: 0.24, height: 0.72, contrast: 0.6, chamfer: 0.8, curve: 0, serif: true, serifShape: 'wedge', serifSize: 0.3,
      serifThickness: 0.6, serifAngle: 1, terminal: 'angled', softSharp: 1, geoHuman: 0.7, xHeight: 0.6, extenders: 0.45, aperture: 0.15,
      apex: 0.1, counter: 0.36, letterSpacing: 0.1 }),
  style('sketch', 'hand', ['handwritten', 'upright'], 'Sketch', ['artistic', 'playful', 'childlike'], 'Cabin Sketch, Londrina Sketch, Rubik Doodle Shadow',
    'Outlined in pencil and never inked in: each stroke drawn as a shaky double line, like letters roughed out in a sketchbook.',
    { weight: 0.62, width: 0.5, contrast: 0, fill: 'wire', module: 0.3, roundness: 0.6, terminal: 'round', wobble: 1, curve: 0.5,
      geoHuman: 0.7, xHeight: 0.58, counter: 0.5, letterSpacing: 0.26 }),
  style('comic', 'hand', ['handwritten', 'upright'], 'Comic', ['childlike', 'happy', 'playful', 'sincere'], 'Comic Neue, Short Stack, Schoolbell',
    'Speech-bubble lettering: an even, round-ended pen line, upright and open, drawn neatly enough to read at any size.',
    { weight: 0.46, width: 0.54, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.12, curve: 0.6, geoHuman: 0.7, playfulFormal: 0.38,
      xHeight: 0.56, counter: 0.56, aperture: 0.62, story: 'single', letterSpacing: 0.18 }),
  style('architect', 'hand', ['handwritten', 'upright'], 'Architect', ['sincere', 'calm', 'artistic'], 'Architects Daughter, Nanum Pen Script, Covered By Your Grace',
    'Neat drafting-table lettering: a fine, tall and narrow pen hand with a lowercase almost as tall as the capitals and a slight shake.',
    { weight: 0.16, width: 0.3, height: 0.72, slant: 0.04, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.45, curve: 0.2,
      geoHuman: 0.55, xHeight: 0.72, extenders: 0.3, aperture: 0.5, letterSpacing: 0.22 }),
  style('upscript', 'hand', ['informal', 'upright'], 'Upright Script', ['cute', 'happy', 'sincere', 'playful'], 'Sofia, Oleo Script, Damion',
    'Joined-up writing that stands straight: every letter flows into the next with no lean at all, soft and round.',
    { weight: 0.46, width: 0.5, contrast: 0.2, roundness: 0.8, terminal: 'round', cursive: 1, curve: 0.9, geoHuman: 0.8, xHeight: 0.5,
      extenders: 0.6, letterSpacing: 0.04 }),

  /* ---- Display */
  style('woodtype', 'display', ['slab'], 'Wood Type', ['rugged', 'vintage', 'loud'], 'Alfa Slab One, Sancreek, Rye',
    'Poster letters cut from wood for Wild West handbills: heavy, compact and squared, with chunky slabs.',
    { weight: 0.82, width: 0.36, height: 0.62, contrast: 0.18, serif: true, serifShape: 'slab', serifSize: 0.22, serifThickness: 0.5, serifAngle: 0,
      classicFuture: 0.72, xHeight: 0.66, aperture: 0.3, counter: 0.4, apex: 0.8, letterSpacing: 0.3 }),
  style('techno', 'display', ['superellipse'], 'Techno', ['futuristic', 'loud'], 'Orbitron, Zen Dots, Audiowide',
    'Rounded rectangles instead of circles, flat peaks and a hard forward lean, like the badge on a racing car.',
    { weight: 0.66, width: 0.88, slant: 0.4, contrast: 0, classicFuture: 1, xHeight: 0.6, apex: 0.95, terminal: 'cut', softSharp: 0.6,
      counter: 0.5, letterSpacing: 0.26 }),
  style('display', 'display', ['rounded'], 'Blobby', ['cute', 'happy', 'playful', 'loud', 'excited'], 'Chewy, Sour Gummy, DynaPuff',
    'As heavy as it goes, soft and puffy, like letters squeezed out of a tube. Every letter bounces to its own beat.',
    { weight: 0.9, width: 0.62, contrast: 0, roundness: 1, terminal: 'round', wobble: 0.4, xHeight: 0.7, counter: 0.3, aperture: 0.3,
      softSharp: 0.1, playfulFormal: 0, geoHuman: 0.45, apex: 0.7, letterSpacing: 0.2 }),
  style('pixel', 'display', [], 'Pixel', ['futuristic', 'playful'], 'Silkscreen, Pixelify Sans, Jersey 10',
    'Rebuilt on a coarse grid of square pixels with softened corners, like an old handheld game screen.',
    { weight: 0.55, width: 0.6, contrast: 0, squareness: 0.8, fill: 'pixels', module: 0.78, roundness: 0.55, apex: 0.9, xHeight: 0.62,
      counter: 0.55, letterSpacing: 0.2, geoHuman: 0.4 }),
  style('dotmatrix', 'display', [], 'Dot Matrix', ['futuristic', 'vintage'], 'Doto, DotGothic16, Codystar',
    'Letters printed from a grid of round dots, like a departure board or an old receipt printer. Faceted corners keep it mechanical.',
    { weight: 0.62, width: 0.62, contrast: 0, chamfer: 0.55, fill: 'dots', module: 0.55, apex: 1, xHeight: 0.6, counter: 0.5,
      letterSpacing: 0.22, geoHuman: 0.35 }),
  style('striped', 'display', [], 'Striped', ['vintage', 'loud', 'artistic', 'excited'], 'Monoton, Tilt Prism, Bungee Inline',
    'A 70s disco face made from horizontal stripes with rounded ends: the letters appear only where the lines are.',
    { weight: 0.82, width: 0.72, contrast: 0, squareness: 0.35, fill: 'lines', module: 0.45, roundness: 1, xHeight: 0.62, counter: 0.5,
      apex: 0.8, letterSpacing: 0.26 }),
  style('octagon', 'display', [], 'Octagonal', ['futuristic', 'rugged', 'stiff'], 'Chakra Petch, Tomorrow, Bai Jamjuree',
    'Modular letters built on a square grid, after Ben Bos and Wim Crouwel: no curves at all, just straight strokes and cut corners.',
    { weight: 0.74, width: 0.56, contrast: 0, chamfer: 0.62, apex: 1, curve: 0, geoHuman: 0.3, xHeight: 0.62, counter: 0.48,
      aperture: 0.3, letterSpacing: 0.22, terminal: 'flat' }),
  style('stencil', 'display', ['geometric'], 'Stencil', ['rugged', 'loud'], 'Stardos Stencil, Allerta Stencil, Big Shoulders Stencil',
    'Heavy, tall letters with wide gaps cut where the strokes meet, so they could be sprayed through a sheet onto a crate. Round letters split in two.',
    { weight: 0.76, width: 0.46, height: 0.66, contrast: 0.02, squareness: 0.2, stencil: 0.55, curve: 0, geoHuman: 0.3, apex: 0.3,
      counter: 0.5, xHeight: 0.6, letterSpacing: 0.24 }),
  style('split', 'display', ['superellipse'], 'Split Line', ['futuristic', 'sophisticated', 'innovative'], 'Syncopate, Michroma, Krona One',
    'Ultra-wide and squared off, with a single hairline cut running through the whole line of text.',
    { weight: 0.72, width: 1, height: 0.4, contrast: 0.02, squareness: 0.85, slice: 0.18, apex: 1, xHeight: 0.66, counter: 0.5,
      aperture: 0.25, letterSpacing: 0.2 }),
  style('construction', 'display', ['geometric'], 'Construction', ['artistic', 'futuristic', 'innovative'], 'Bungee Outline, Train One, Kumar One Outline',
    'Drawn as the outline of every stroke, overlaps and all, like a letter still on the drawing board.',
    { weight: 0.6, contrast: 0.02, fill: 'wire', module: 0.35, curve: 0, geoHuman: 0.25, apex: 0.1, counter: 0.62, xHeight: 0.5,
      letterSpacing: 0.3 }),
  style('reverse', 'display', [], 'Reverse Contrast', ['futuristic', 'loud', 'artistic', 'innovative'], 'Ewert, Sancreek, Rye',
    'Contrast turned on its side: fat horizontals and hairline stems. Wide, strange and made for posters.',
    { weight: 0.55, width: 0.86, contrast: 0.62, reverse: 1, curve: 0, squareness: 0.3, apex: 0.8, xHeight: 0.56, counter: 0.5,
      letterSpacing: 0.26 }),
  style('hairline', 'display', ['geometric'], 'Art Deco', ['vintage', 'sophisticated', 'artistic'], 'Poiret One, Limelight, Federo',
    'Jazz-age glamour: a fine single line, geometric circles, a tiny x-height and crossbars pushed up high.',
    { weight: 0.04, width: 0.6, contrast: 0, curve: 0, geoHuman: 0.25, apex: 0.05, counter: 0.65, xHeight: 0, height: 0.62,
      crossbar: 0.95, letterSpacing: 0.45, wordSpacing: 0.5 }),
  style('neon', 'display', ['monoline', 'informal'], 'Neon Script', ['excited', 'artistic', 'vintage'], 'Neonderthaw, Tilt Neon, Beon',
    'A glowing sign bent from glass tube: a joined-up script drawn as one outlined line with round ends and curling tips.',
    { weight: 0.42, width: 0.5, slant: 0.3, contrast: 0, fill: 'wire', module: 0.3, roundness: 1, terminal: 'round', cursive: 1,
      terminalCurl: 0.6, xHeight: 0.45, extenders: 0.7, curve: 0.9, geoHuman: 0.75, letterSpacing: 0.12 }),
  style('creepy', 'display', [], 'Creepy', ['loud', 'rugged', 'artistic', 'excited'], 'Creepster, Nosifer, Butcherman',
    'Horror-poster lettering: tall, jittery strokes that sharpen to thorn-like points, as if scratched out by candlelight.',
    { weight: 0.72, width: 0.42, height: 0.72, slant: 0.1, contrast: 0.5, terminal: 'tapered', terminalLength: 0.9, softSharp: 1,
      wobble: 1, curve: 0.5, geoHuman: 0.8, xHeight: 0.66, aperture: 0.3, counter: 0.38, letterSpacing: 0.12 }),
  style('speed', 'display', [], 'Speed Lines', ['futuristic', 'excited', 'loud'], 'Faster One, Bungee Shade, Racing Sans One',
    'A heavy, wide, hard-leaning face cut into horizontal streaks, like a logo for a race car moving too fast to see.',
    { weight: 0.86, width: 0.8, slant: 0.7, contrast: 0, squareness: 0.5, fill: 'lines', module: 0.3, apex: 0.9, xHeight: 0.66,
      counter: 0.4, aperture: 0.25, classicFuture: 0.9, letterSpacing: 0.12 }),
  style('comicbook', 'display', [], 'Comic Book', ['loud', 'excited', 'playful'], 'Bangers, Luckiest Guy, Bowlby One',
    'Sound-effect lettering from a comic panel: black, tall and narrow, leaning forward with a little wobble. POW.',
    { weight: 0.84, width: 0.4, height: 0.7, slant: 0.22, contrast: 0.1, wobble: 0.25, curve: 0.2, squareness: 0.2, xHeight: 0.74,
      extenders: 0.25, aperture: 0.3, counter: 0.36, apex: 0.7, letterSpacing: 0.14 }),
  style('nouveau', 'display', ['flared'], 'Art Nouveau', ['vintage', 'artistic', 'fancy'], 'Macondo, Almendra, Federo',
    'Belle Époque poster lettering, after Mucha: flowing curves, strokes that swell and taper, a small lowercase and crossbars dropped low.',
    { weight: 0.4, width: 0.4, height: 0.72, contrast: 0.72, terminal: 'tapered', terminalLength: 0.8, terminalCurl: 0.57, curve: 1,
      geoHuman: 0.9, xHeight: 0.34, extenders: 0.8, crossbar: 0.08, aperture: 0.7, apex: 0.2, letterSpacing: 0.22 }),
  style('psychedelic', 'display', ['swash'], 'Psychedelic', ['excited', 'artistic', 'vintage', 'playful'], 'Shrikhand, Kavoon, Bagel Fat One',
    'A 60s concert poster: heavy, melting letters that lean and bounce, with every stroke end curling up.',
    { weight: 0.8, width: 0.62, slant: 0.25, contrast: 0.35, roundness: 1, terminal: 'round', wobble: 0.45, terminalCurl: 0.56,
      curve: 1, geoHuman: 0.8, xHeight: 0.62, counter: 0.3, aperture: 0.3, letterSpacing: 0.14 }),
  style('bauhaus', 'display', ['geometric'], 'Bauhaus', ['artistic', 'vintage', 'innovative'], 'Righteous, Comfortaa, Baumans',
    'Built with a compass and ruler at the 1920s Bauhaus, after Herbert Bayer: wide circles, a lowercase nearly as tall as the capitals and stubby ascenders.',
    { weight: 0.5, width: 0.8, contrast: 0, roundness: 1, terminal: 'round', curve: 0, geoHuman: 0.1, aperture: 0.8, story: 'single',
      xHeight: 0.84, extenders: 0.18, counter: 0.8, apex: 0.8, letterSpacing: 0.2 })
];

/* The style page shows solid letters only: styles built on an effect (a fill other than solid ink,
   stencil gaps or a slice) stay defined, so designs saved from them still open, but get no card. */
const isSolid = (p: Params) => p.fill === 'solid' && !p.stencil && !p.slice;
export const PAGE_STYLES = STYLES.filter(s => isSolid(s.params));
/** Appearance tags that some card on the style page carries. */
export const PAGE_LOOKS = LOOKS.filter(l => PAGE_STYLES.some(s => s.looks.includes(l.id)));

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
  reverse: { cat: 'structure', off: 0, label: 'Reverse contrast', friendly: 'Make the horizontal strokes the heavy ones', tech: 'Reverse contrast', lo: 'Normal', hi: 'Reversed', demo: 'HOe',
    explain: 'Bars go heavy and stems go thin. Stronger with more Contrast.' },

  roundness: { cat: 'shape', label: 'Roundness', friendly: 'Make the letters softer or sharper', tech: 'Roundness', lo: 'Sharp', hi: 'Round', demo: 'Ek',
    explain: 'Corners and stroke ends round off.' },
  curve: { cat: 'shape', label: 'Curves', friendly: 'Make curves more geometric or organic', tech: 'Curve', lo: 'Geometric', hi: 'Organic', demo: 'Sae',
    explain: 'Compass-drawn circles, or fuller pen-like curves.' },
  squareness: { cat: 'shape', off: 0, label: 'Squareness', friendly: 'Turn circles into rounded squares', tech: 'Squareness · Superellipse', lo: 'Circle', hi: 'Square', demo: 'Oo',
    explain: 'Bowls square off while the corners stay smooth.' },
  chamfer: { cat: 'shape', off: 0, label: 'Facets', friendly: 'Cut curves into straight lines and corners', tech: 'Chamfer · Faceted', lo: 'Curved', hi: 'Cut', demo: 'Oes',
    explain: 'Curves become straight lines with cut-off corners.' },
  terminal: { cat: 'shape', type: 'options', label: 'Stroke ends', friendly: 'Choose how strokes end', tech: 'Letter endings · Terminals', demo: 'Cas',
    explain: 'The free tips of strokes, as on C, a, s and r: their shape, which way they run and how far they reach.' },
  story: { cat: 'shape', type: 'story', label: 'Letter a', friendly: 'Choose the shape of the a', tech: 'Double / single storey a', demo: 'data',
    explain: 'Two-storey like book type, or one bowl like handwriting.' },
  gForm: { cat: 'shape', type: 'form', label: 'Letter g', friendly: 'Choose the shape of the g', tech: 'Single-storey g', demo: 'gag',
    explain: 'The tail hooks back under the bowl, or drops from its left side and hooks out to the right.' },
  kForm: { cat: 'shape', type: 'form', label: 'Letter k', friendly: 'Choose where the arm and leg of k meet', tech: 'k and K junction', demo: 'kK',
    explain: 'The leg springs from the arm, both meet at the stem, or both meet at the end of a short bar.' },
  iForm: { cat: 'shape', type: 'form', label: 'Letters i and l', friendly: 'Give i and l a flag and a foot', tech: 'Barred i and l', demo: 'ilil',
    explain: 'A plain stem, or a flag at the top and a bar along the foot, as in a typewriter face.' },
  sForm: { cat: 'shape', type: 'form', label: 'Letter s', friendly: 'Choose the shape of the s', tech: 'Spine of s', demo: 'sS$',
    explain: 'A spine curving from corner to corner, or running flat between two tight turns, like two rounded boxes stacked.' },
  bowlJoin: { cat: 'shape', type: 'form', label: 'Joins', friendly: 'Curve bowls and arches out of their stems or run them in flat', tech: 'Bowl & shoulder joins', demo: 'dnu',
    explain: 'Square joins meet the stem in a flat top or bottom, like a D. Applies to b d p q g, n m h r u and the single-storey a.' },
  overlap: { cat: 'shape', off: 1, label: 'Bowl overlap', friendly: 'Join or separate bowl and stem', tech: 'Bowl overlap', lo: 'Apart', hi: 'Merged', demo: 'bdpq',
    explain: 'Applies to b, d, p, q and the single-storey a.' },
  dots: { cat: 'shape', type: 'form', label: 'Dots', friendly: 'Make the dots square or round', tech: 'Tittles & periods', demo: 'ij.!',
    explain: 'The dots on i and j and in the punctuation, whatever the corners do.' },
  serif: { cat: 'shape', type: 'serif', label: 'Serifs', friendly: 'Add small feet to the strokes', tech: 'Serifs', demo: 'In',
    explain: 'Small finishing strokes at the ends of stems.' },
  apex: { cat: 'shape', label: 'Peaks', friendly: 'Make peaks pointed or flat', tech: 'Apex', lo: 'Pointed', hi: 'Flat', demo: 'AV',
    explain: 'Where diagonals meet — the top of A, the bottom of V.' },
  joints: { cat: 'shape', off: 0, label: 'Ink traps', friendly: 'Thin the strokes where they meet', tech: 'Ink traps · Joints', lo: 'Solid', hi: 'Trapped', demo: 'nab',
    explain: 'Corners are carved out where strokes join.' },
  cursive: { cat: 'shape', off: 0, label: 'Cursive', friendly: 'Add strokes that lead into the next letter', tech: 'Cursive · Entry & exit strokes', lo: 'Print', hi: 'Script', demo: 'nigu',
    explain: 'Strokes flick on toward the next letter, like script.' },
  wobble: { cat: 'shape', off: 0, label: 'Hand-drawn', friendly: 'Make it look drawn by hand', tech: 'Hand-drawn · Irregularity', lo: 'Precise', hi: 'Wobbly', demo: 'Hand',
    explain: 'Strokes drift, swell and sit a little off the line.' },

  xHeight: { cat: 'proportion', label: 'Lowercase height', friendly: 'Make lowercase letters taller', tech: 'x-height', lo: 'Small', hi: 'Large', demo: 'Hxn',
    explain: 'Taller lowercase feels modern and reads well small.' },
  extenders: { cat: 'proportion', label: 'Stem length', friendly: 'Make ascenders and descenders longer', tech: 'Ascenders & descenders', lo: 'Short', hi: 'Long', demo: 'hpdy',
    explain: 'The parts above (b, d, h) and below (g, p, y) the letters.' },
  descender: { cat: 'proportion', advanced: true, label: 'Descender length', friendly: 'Make only the descenders longer or shorter', tech: 'Descenders', lo: 'Short', hi: 'Long', demo: 'gpy',
    explain: 'The parts below the baseline, apart from the ascenders above the x-height.' },
  tail: { cat: 'proportion', label: 'Tails & hooks', friendly: 'Make tails and hooks longer or shorter', tech: 'Tail · Hook', lo: 'Short', hi: 'Long', demo: 'Qjty',
    explain: 'The trailing ends of Q, y, g, j, t, f and the comma.' },
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
  mono: { cat: 'spacing', off: 0, label: 'Monospace', friendly: 'Give every letter the same width', tech: 'Monospace', lo: 'Proportional', hi: 'Monospaced', demo: 'milk',
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
  stencil: { cat: 'effects', off: 0, label: 'Stencil', friendly: 'Cut gaps where the strokes meet', tech: 'Stencil', lo: 'Solid', hi: 'Wide gaps', demo: 'BOa',
    explain: 'Strokes break where they join, as if cut from a sheet.' },
  slice: { cat: 'effects', off: 0, label: 'Slice', friendly: 'Cut one line through every letter', tech: 'Slice', lo: 'None', hi: 'Wide', demo: 'type',
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
export const TERMINAL_SUBS: Record<TerminalSubKey, SubControlDef> = {
  terminalLength: { label: 'Length', friendly: 'Make the stroke ends longer or shorter', tech: 'Terminal length', lo: 'Short', hi: 'Long' },
  terminalCurl: { label: 'Curl', friendly: 'Straighten the stroke ends or curl them round', tech: 'Terminal curl', lo: 'Flared out', hi: 'Curled in', bipolar: true },
  terminalFlare: { label: 'Flare', friendly: 'Widen the stroke as it ends', tech: 'Flared terminal', lo: 'Slight', hi: 'Wide' },
  terminalDepth: { label: 'Depth', friendly: 'Hollow the end out a little or a lot', tech: 'Terminal depth', lo: 'Shallow', hi: 'Deep' },
  terminalSize: { label: 'Size', friendly: 'Make the drop on the end smaller or bigger', tech: 'Ball size', lo: 'Small', hi: 'Big' },
  terminalRound: { label: 'Roundness', friendly: 'Round the end from soft corners to a half circle', tech: 'Terminal radius', lo: 'Soft corners', hi: 'Half circle' },
  terminalPoint: { label: 'Sharpness', friendly: 'Make the point less sharp or sharper', tech: 'Point length', lo: 'Less sharp', hi: 'Sharper' },
  terminalClip: { label: 'Cut off', friendly: 'Cut a little or a lot off the tip of the point', tech: 'Clipped point', lo: 'Little', hi: 'Lot' },
  terminalLean: { label: 'Lean', friendly: 'Move the point toward the inside or outside edge', tech: 'Point offset', lo: 'Inside', hi: 'Outside', bipolar: true },
  terminalSlope: { label: 'Slope', friendly: 'Cut the end at a gentle or steep angle', tech: 'Terminal angle', lo: 'Gentle', hi: 'Steep' },
  terminalTilt: { label: 'Tilt', friendly: 'Turn the level cut one way or the other', tech: 'Cut angle', lo: 'Falling', hi: 'Rising', bipolar: true },
  terminalTip: { label: 'Tip', friendly: 'Make the tapered tip blunt or fine', tech: 'Taper tip width', lo: 'Blunt', hi: 'Fine' },
  terminalTaper: { label: 'Taper length', friendly: 'Start the taper close to the tip or far back', tech: 'Taper length', lo: 'Short', hi: 'Long' }
};
/** The forms of each kind of stroke end, picked under its kind. */
export const TERMINAL_FORM_LABELS: Record<TerminalForm, string> = {
  plain: 'Plain', flared: 'Flared', scooped: 'Scooped', round: 'Round', droplet: 'Droplet', ball: 'Ball', pointed: 'Pointed', clipped: 'Clipped',
  outer: 'Outward', inner: 'Inward', level: 'Straight', notched: 'Notched', taper: 'Even', brush: 'Brush'
};
/** The finer shape sliders of each form of stroke end, shown while that form is picked. */
export const TERMINAL_DETAILS: Record<TerminalForm, TerminalSubKey[]> = {
  plain: [], flared: ['terminalFlare'], scooped: ['terminalDepth'],
  round: ['terminalRound'], droplet: ['terminalSize'], ball: ['terminalSize'],
  pointed: ['terminalPoint', 'terminalLean'], clipped: ['terminalPoint', 'terminalClip'],
  outer: ['terminalSlope'], inner: ['terminalSlope'], level: ['terminalTilt'], notched: ['terminalDepth', 'terminalTilt'],
  taper: ['terminalTip', 'terminalTaper'], brush: ['terminalTip', 'terminalTaper']
};
/** Every nested sub-slider, whichever control it belongs to. */
export const DOT_SUBS: Record<DotSubKey, SubControlDef> = {
  dotSize: { label: 'Size', friendly: 'Make the dots smaller or bigger', tech: 'Dot size', lo: 'Small', hi: 'Big' }
};
export const SUBS: Record<SerifSubKey | FillSubKey | TerminalSubKey | DotSubKey, SubControlDef> = { ...SERIF_SUBS, ...FILL_SUBS, ...TERMINAL_SUBS, ...DOT_SUBS };
export const STORY_OPTIONS: [Exclude<Story, 'auto'>, string][] = [['double', 'Double'], ['single', 'Single']];
/** The letter-shape pickers: each option is drawn as the letter `ch` in that shape. */
export type FormKey = 'gForm' | 'kForm' | 'iForm' | 'sForm' | 'bowlJoin' | 'dots' | 'terminalRun';
export const FORM_OPTIONS: { [K in FormKey]: { ch: string; options: [Exclude<Params[K], 'auto'>, string][] } } = {
  gForm: { ch: 'g', options: [['hook', 'Hook'], ['mirrored', 'Mirrored']] as [GForm, string][] },
  kForm: { ch: 'k', options: [['arm', 'From arm'], ['stem', 'From stem'], ['bar', 'On a bar']] as [KForm, string][] },
  iForm: { ch: 'i', options: [['plain', 'Plain'], ['bars', 'Flag and foot']] as [Exclude<IForm, 'auto'>, string][] },
  sForm: { ch: 's', options: [['curved', 'Curved'], ['flat', 'Flat spine']] as [SForm, string][] },
  terminalRun: { ch: 'c', options: [['curved', 'Curved'], ['straight', 'Straight']] as [TerminalRun, string][] },
  bowlJoin: { ch: 'd', options: [['curved', 'Curved'], ['square', 'Square']] as [BowlJoin, string][] },
  dots: { ch: 'i', options: [['square', 'Square'], ['round', 'Round']] as [Exclude<Dots, 'auto'>, string][] }
};
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
  stem: 'weight', diagonal: 'weight', bowl: 'weight', arm: 'weight', leg: 'weight', tail: 'tail',
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
export interface StyleFilter { moods: Mood[]; looks: Look[]; kinds: Kind[] }
/** Faceted like Google Fonts: any of the picked tags within a facet, every facet at once. */
export const styleMatches = (s: StyleDef, f: StyleFilter) =>
  (!f.moods.length || s.moods.some(m => f.moods.includes(m))) && (!f.looks.length || s.looks.some(l => f.looks.includes(l))) &&
  (!f.kinds.length || s.kinds.some(k => f.kinds.includes(k)));

/** The starting style each filter tag is set in: one that carries the tag. */
export const TAG_FACE: Record<Mood | Look | Kind, string> = {
  business: 'grotesque', calm: 'humanist', happy: 'soft', playful: 'display', cute: 'upright', childlike: 'casual',
  fancy: 'didone', sophisticated: 'chancery', artistic: 'brush', loud: 'fatface', rugged: 'marker', vintage: 'typewriter',
  futuristic: 'techno', sincere: 'clarendon', excited: 'marker', innovative: 'squircle', stiff: 'code',
  mono: 'code', pixel: 'pixel', stencil: 'stencil', outline: 'construction', techno: 'techno', inktrap: 'inktrap',
  contrast: 'didone', wide: 'split', narrow: 'condensed',
  handwritten: 'casual', upright: 'upright', informal: 'informal', formal: 'chancery', brush: 'brush', marker: 'marker',
  swash: 'swash', italic: 'italic', monoline: 'monoline', signature: 'signature', blackletter: 'blackletter',
  venetian: 'venetian', oldstyle: 'oldstyle', transitional: 'serif', didone: 'didone', fatface: 'fatface', wedge: 'wedge', slab: 'slab', clarendon: 'clarendon',
  geometric: 'geometric', neogrotesque: 'grotesque', grotesque: 'condensed', humanist: 'humanist', rounded: 'soft',
  superellipse: 'squircle', flared: 'flared'
};

/** First control of each category, opened when the category is picked. */
export const firstControl = (cat: CategoryId) =>
  (Object.keys(CONTROLS) as ControlKey[]).find(k => CONTROLS[k].cat === cat) ?? 'weight';

/** The control a key belongs to: serif sub-sliders fold into 'serif', the module size into 'fill',
    the stroke end length into 'terminal'. */
export const controlFor = (key: ActiveKey): ControlKey =>
  key in SERIF_SUBS ? 'serif' : key in FILL_SUBS ? 'fill' : key in TERMINAL_SUBS ? 'terminal' : key in DOT_SUBS ? 'dots' : key as ControlKey;
