/* Starting styles, navigation, and the plain-language description of every control.
   Shared by the client (UI copy) and the server (validating style ids). */
import { resolve, type Effective } from './engine/font';
import { DEFAULTS, PARAM_KEYS, SPECS, type CategoryId, type ControlDef, type ControlKey, type SubControlDef, type SubKey, type SubKeyOf, type AForm, type BarEnds, type Mirror, type Bends, type Build, type Flourish, type ScriptForm, type BowlForm, type BowlJoin, type Diagonals, type Dots, type Fill, type GForm, type IForm, type KForm, type SForm, type Params, type QForm, type RForm, type SerifBase, type SerifInner, type SerifShape, type SerifSide, type SerifTip, type Story, type Terminal, type TerminalForm, type TerminalRun, type YForm } from './params';

export type { CategoryId, ControlDef, ControlKey, SubControlDef } from './params';
/** An area of the design with several pages, listed under it in the navigation. */
export type GroupId = 'proportion' | 'shape' | 'details';
/* The sliders nested under each control (see `sub` in shared/params/spec.ts). */
export type SerifSubKey = SubKeyOf<'serif'>;
export type SerifTipSubKey = SubKeyOf<'serifTip'>;
export type SerifBaseSubKey = SubKeyOf<'serifBase'>;
export type SerifInnerSubKey = SubKeyOf<'serifInner'>;
export type SerifArmSubKey = SubKeyOf<'serifArms'>;
export type FillSubKey = SubKeyOf<'fill'>;
export type TerminalSubKey = SubKeyOf<'terminal'>;
export type DotSubKey = SubKeyOf<'dots'>;
export type BowlSubKey = SubKeyOf<'bowlForm'>;
export type WeightSubKey = SubKeyOf<'weight'>;
export type RoundSubKey = SubKeyOf<'roundness'>;
export type PinchSubKey = SubKeyOf<'pinch'>;
export type CrossbarSubKey = SubKeyOf<'crossbar'>;
/** A stencil's and a slice's own value is their thickness, so it sits among their sub-sliders. */
export type StencilSubKey = SubKeyOf<'stencil'>;
export type SliceSubKey = SubKeyOf<'slice'>;
/** Anything the control panel can focus: a control or one of its nested sub-sliders. */
export type ActiveKey = ControlKey | SubKey;

/* Starting styles are tagged like the fonts on Google Fonts. The group is a style's Category: it
   sorts the cards on the stage and is the style finder's first question. Then come the finer
   Classification tags (Sans Serif, Serif and Calligraphy, in the order of the card groups), the
   finder's second question, Appearance, which search reads, and Feeling, the panel's filter. */
export type StyleGroup = 'sans' | 'serif' | 'slab' | 'mono' | 'hand' | 'display';
export const STYLE_GROUPS: { id: StyleGroup; label: string; hint: string }[] = [
  { id: 'sans', label: 'Sans Serif', hint: 'Clean letters with no serifs' },
  { id: 'serif', label: 'Serif', hint: 'Small finishing strokes on each letter' },
  { id: 'slab', label: 'Slab Serif', hint: 'Heavy, block-shaped serifs' },
  { id: 'mono', label: 'Monospace', hint: 'Every letter takes the same width' },
  { id: 'hand', label: 'Calligraphy', hint: 'Drawn by hand with a pen or brush' },
  { id: 'display', label: 'Display', hint: 'Decorative, made for headlines' }
];
export type Mood = 'business' | 'calm' | 'sincere' | 'happy' | 'excited' | 'playful' | 'cute' | 'childlike' | 'fancy' | 'sophisticated'
  | 'artistic' | 'innovative' | 'loud' | 'rugged' | 'stiff' | 'vintage' | 'futuristic';
/* Each style's moods follow the Google Fonts Feeling scores of its reference families. Listed A to Z,
   so a mood is quick to find among the seventeen. */
export const MOODS: { id: Mood; label: string }[] = ([
  ['artistic', 'Artistic'], ['business', 'Business'], ['calm', 'Calm'], ['childlike', 'Childlike'], ['cute', 'Cute'], ['excited', 'Excited'],
  ['fancy', 'Fancy'], ['futuristic', 'Futuristic'], ['happy', 'Happy'], ['innovative', 'Innovative'], ['loud', 'Loud'], ['playful', 'Playful'],
  ['rugged', 'Rugged'], ['sincere', 'Sincere'], ['sophisticated', 'Sophisticated'], ['stiff', 'Stiff'], ['vintage', 'Vintage']
] as [Mood, string][]).map(([id, label]) => ({ id, label }));

/* Appearance, like Google's tags of that name: what the letters look like, for search to find.
   Unlike the other tags these are not hand-picked but read off each style's settings, so they
   stay true as styles are tuned. */
export type Look = 'mono' | 'pixel' | 'stencil' | 'outline' | 'inline' | 'shadow' | 'techno' | 'inktrap' | 'contrast' | 'wide' | 'narrow';
export const LOOKS: { id: Look; label: string; hint: string; test: (e: Effective) => boolean }[] = [
  { id: 'mono', label: 'Monospace', hint: 'Every letter takes the same width', test: e => e.mono >= 0.5 },
  { id: 'pixel', label: 'Pixel', hint: 'Built from a grid of pixels or dots', test: e => e.fill === 'pixels' || e.fill === 'dots' },
  { id: 'stencil', label: 'Stencil', hint: 'Letters cut apart by gaps', test: e => e.stencil > 0 || e.slice > 0 },
  { id: 'outline', label: 'Outline', hint: 'Drawn as lines, not filled in', test: e => e.fill === 'wire' || e.fill === 'outline' },
  { id: 'inline', label: 'Inline', hint: 'A line cut down the middle of the strokes', test: e => e.fill === 'inline' },
  { id: 'shadow', label: 'Shadow', hint: 'Letters cast a shadow behind them', test: e => e.fill === 'shadow' },
  { id: 'techno', label: 'Techno', hint: 'Squared-off bowls or cut corners instead of curves', test: e => e.fill === 'solid' && (e.square >= 0.5 || e.chamfer >= 0.2) },
  { id: 'inktrap', label: 'Ink Traps', hint: 'Strokes narrow where they meet', test: e => e.joints >= 0.4 },
  { id: 'contrast', label: 'High Contrast', hint: 'Strong difference between thick and thin', test: e => e.contrast >= 0.5 },
  { id: 'wide', label: 'Wide', hint: 'Stretched out sideways', test: e => e.width >= 0.68 },
  { id: 'narrow', label: 'Narrow', hint: 'Squeezed tall and thin', test: e => e.width <= 0.35 }
];

/* Classification, like Google's Sans Serif, Serif and Calligraphy tags: the genre a style is
   drawn in, finer than its Category. Hand-picked, and a style may carry more than one (a
   Clarendon is also a Slab). Together they are one facet, so picking Didone and Geometric shows both. */
export type Kind = 'handwritten' | 'upright' | 'informal' | 'formal' | 'brush' | 'marker' | 'swash' | 'italic' | 'monoline' | 'signature' | 'blackletter'
  | 'venetian' | 'oldstyle' | 'transitional' | 'didone' | 'fatface' | 'wedge' | 'slab' | 'clarendon'
  | 'geometric' | 'neogrotesque' | 'grotesque' | 'humanist' | 'rounded' | 'superellipse' | 'flared';
type TagDef<T> = { id: T; label: string; hint: string };
/** Each section also names the Categories whose finer genres it holds. */
export const KIND_SECTIONS: { id: string; label: string; groups: StyleGroup[]; tags: TagDef<Kind>[] }[] = [
  { id: 'sans', label: 'Sans Serif', groups: ['sans'], tags: [
    { id: 'geometric', label: 'Geometric', hint: 'Built from circles and straight lines' },
    { id: 'neogrotesque', label: 'Neo Grotesque', hint: 'Neutral and even, like Helvetica' },
    { id: 'grotesque', label: 'Grotesque', hint: 'Early sans serifs, dense and gritty' },
    { id: 'humanist', label: 'Humanist', hint: 'Shaped like writing with a pen' },
    { id: 'rounded', label: 'Rounded', hint: 'Soft corners and stroke endings' },
    { id: 'superellipse', label: 'Superellipse', hint: 'Bowls halfway between a circle and a square' },
    { id: 'flared', label: 'Flared', hint: 'Strokes swell toward their ends (Google: Glyphic)' }
  ] },
  { id: 'serif', label: 'Serif', groups: ['serif', 'slab'], tags: [
    { id: 'venetian', label: 'Venetian', hint: 'The first roman type: dark, low contrast, sloped serifs' },
    { id: 'oldstyle', label: 'Old Style', hint: 'Renaissance book type with angled stress' },
    { id: 'transitional', label: 'Transitional', hint: 'Crisp serifs and upright stress' },
    { id: 'didone', label: 'Didone', hint: 'Extreme contrast and hairline serifs' },
    { id: 'fatface', label: 'Fat Face', hint: 'A Didone as heavy as it goes' },
    { id: 'wedge', label: 'Wedge', hint: 'Triangular, chisel-cut serifs' },
    { id: 'slab', label: 'Slab', hint: 'Heavy, block-shaped serifs' },
    { id: 'clarendon', label: 'Clarendon', hint: 'A slab with soft, bracketed serifs' }
  ] },
  { id: 'calligraphy', label: 'Calligraphy', groups: ['hand'], tags: [
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
  const params = { ...DEFAULTS, ...p };
  return { id, name, group, kinds, moods, desc, like, params, looks: looksOf(params) };
};

/* Ids are stored with saved designs, so they never change even when a style is renamed. */
export const STYLES: StyleDef[] = [
  /* ---- Sans Serif */
  style('geometric', 'sans', ['geometric'], 'Geometric', ['calm', 'business'], 'Poppins, Montserrat, Jost',
    'Built from circles and straight lines, after Futura: a light, even stroke, a small lowercase under tall ascenders, pointed peaks and a single-storey a.',
    { width: 0.36, contrast: 0.54, curve: 0, geoHuman: 0, apex: 0.86, counter: 0.96, xHeight: 0.886, extenders: 0.57, aperture: 0.29,
      overlap: 0.29, story: 'single', letterSpacing: 0.24, vWeight: 0.42, hWeight: 0.48, roundness: 0.48, terminalLength: 0.52, squareness: 0.16,
      descender: 0.65, joinRound: 0.01, tail: 0.46, wordSpacing: 0.508, sideBearing: 0.675, classicFuture: 0.34 }),
  style('grotesque', 'sans', ['neogrotesque'], 'Neo Grotesque', ['calm', 'business', 'stiff'], 'Roboto, Inter, Work Sans',
    'The Swiss workhorse, set bold and tight. A tall lowercase, closed-in openings and level stroke endings make it dense and matter-of-fact.',
    { weight: 0.62, width: 0.46, contrast: 0.51, curve: 0.04, geoHuman: 0.44, aperture: 0.08, xHeight: 0.82, extenders: 0.52, apex: 0.98,
      counter: 0.28, letterSpacing: 0.12, hWeight: 0.58, roundness: 0.2, terminalLength: 0.58, squareness: 0.36, descender: 0.45, overlap: 0.9,
      joinRound: 0.12, tail: 0.14, wordSpacing: 0.384, sideBearing: 0.55, softSharp: 0.54, classicFuture: 0.38 }),
  style('humanist', 'sans', ['humanist'], 'Humanist', ['business', 'calm', 'sincere'], 'Open Sans, Source Sans 3, Fira Sans',
    'Shaped like writing with a pen: wide-open letterforms, angled stroke ends, gentle contrast and a human rhythm.',
    { weight: 0.5, width: 0.44, contrast: 0.48, curve: 0.02, geoHuman: 0.52, terminal: 'angled', xHeight: 0.839, extenders: 0.56, aperture: 0.78,
      apex: 1, story: 'double', hWeight: 0.4, roundness: 0.08, terminalLength: 0.38, squareness: 0.2, descender: 0.58, overlap: 0.49,
      gForm: 'double', wordSpacing: 0.429, sideBearing: 0.675, softSharp: 0.56, classicFuture: 0.42 }),
  style('condensed', 'sans', ['grotesque'], 'Condensed', ['loud', 'rugged', 'stiff'], 'Oswald, Bebas Neue, Anton',
    'Black, tall and squeezed as narrow as it goes. Fits long headlines into tight columns without losing punch.',
    { weight: 0.74, width: 0.21, height: 0.85, xHeight: 0.82, extenders: 0.38, contrast: 0.52, aperture: 0, squareness: 0.61, classicFuture: 0.16,
      apex: 0.98, counter: 0.4, letterSpacing: 0.22, vWeight: 0.49, hWeight: 0.7, crossbar: 0.54, roundness: 0.21, curve: 0.05,
      terminalLength: 0.82, descender: 0.43, overlap: 0.98, gForm: 'double', joinRound: 0.24, tail: 0.34, wordSpacing: 0.442, sideBearing: 0.538 }),
  style('soft', 'sans', ['rounded'], 'Rounded', ['calm', 'happy', 'cute'], 'Nunito, Varela Round, Quicksand',
    'Light and round-ended, with big airy counters and generous spacing. Easy-going and friendly.',
    { weight: 0.3, width: 0.38, contrast: 0.46, roundness: 0.5, terminal: 'round', xHeight: 0.676, counter: 0.6, aperture: 0.52, softSharp: 0.42,
      playfulFormal: 0.48, geoHuman: 0.43, apex: 1, story: 'double', letterSpacing: 0.26, hWeight: 0.44, curve: 0.02, terminalLength: 0.66,
      extenders: 0.43, descender: 0.46, overlap: 0.56, joinRound: 0.04, tail: 0.63, wordSpacing: 0.477, sideBearing: 0.619, classicFuture: 0.58 }),
  style('extended', 'sans', ['superellipse'], 'Squared', ['futuristic'], 'Michroma, Oxanium, Rajdhani',
    'A fine line stretched extra wide, with round letters drawn as squarish ovals and plenty of air between them. Precise and technical.',
    { weight: 0.36, width: 0.79, curve: 0, squareness: 0.7, classicFuture: 1, xHeight: 0.691, apex: 1, counter: 0.36, letterSpacing: 0.34,
      hWeight: 0.58, aperture: 0, crossbar: 0.46, roundness: 0.06, terminalLength: 0.66, descender: 0.45, overlap: 0.46, tail: 0.92,
      wordSpacing: 0.315, sideBearing: 0.6, geoHuman: 0.84, softSharp: 0.42 }),
  style('tightgeo', 'sans', ['geometric'], 'Tight Geometric', ['loud', 'sophisticated'], 'Outfit, Urbanist, Lexend',
    'A black 70s logotype sans after Herb Lubalin: perfect circles, a single-storey a, towering ascenders and letters packed so close they nearly touch.',
    { weight: 0.74, width: 0.42, contrast: 0.54, curve: 0, geoHuman: 0.34, apex: 0.92, counter: 0.62, xHeight: 0.661, extenders: 0.48,
      aperture: 0.69, letterSpacing: 0.05, hWeight: 0.9, crossbar: 0.51, roundness: 0.04, terminalLength: 0.66, descender: 0.54, overlap: 0.64,
      tail: 0.18, wordSpacing: 0.242, softSharp: 0.34, classicFuture: 0.62, playfulFormal: 0.74 }),
  style('squircle', 'sans', ['superellipse'], 'Superellipse', ['futuristic', 'calm', 'innovative'], 'Unbounded, Syne, Lexend Zetta',
    'Chunky squircle bowls, halfway between a circle and a square, with rounded ends and strokes that pinch in where they meet. Soft but engineered.',
    { weight: 1, width: 0.74, contrast: 0.56, squareness: 0.1, joints: 0.55, roundness: 0.36, terminal: 'sharp', curve: 0.02, geoHuman: 0.29,
      apex: 0.98, xHeight: 0.796, counter: 0.52, vWeight: 0.34, hWeight: 0.82, aperture: 0.01, terminalLength: 0.33, terminalForm: 'pointed',
      extenders: 0.48, descender: 0.3, overlap: 0.74, joinRound: 0.59, tail: 0.07, wordSpacing: 0.194, sideBearing: 0.475, softSharp: 0.64,
      classicFuture: 0.66, playfulFormal: 0.66 }),
  style('inktrap', 'sans', ['grotesque'], 'Ink Trap', ['loud', 'artistic', 'innovative'], 'Bricolage Grotesque, Syne, Darker Grotesque',
    'A heavy display grotesque with deep ink traps: strokes narrow sharply where they branch, so the black letters stay open.',
    { weight: 0.72, width: 0.58, contrast: 0.54, squareness: 0.41, joints: 1, curve: 0.02, geoHuman: 0.4, apex: 0.99, xHeight: 0.903, aperture: 0,
      counter: 0.42, letterSpacing: 0.14, hWeight: 0.66, crossbar: 0.48, roundness: 0.32, terminalLength: 0.66, extenders: 0.54, descender: 0.43,
      overlap: 0.78, gForm: 'double', qForm: 'sweep', tail: 0.34, wordSpacing: 0.303, sideBearing: 0.606, softSharp: 0.34, classicFuture: 0.48 }),
  style('flared', 'sans', ['flared'], 'Flared', ['sophisticated', 'vintage'], 'Marcellus, Julius Sans One, Philosopher',
    'A sans serif carved like stone lettering: fine strokes swell toward their ends, with a small lowercase, high crossbars and airy spacing.',
    { weight: 0.48, width: 0.54, contrast: 0.79, terminal: 'tapered', terminalLength: 0.54, curve: 0.08, geoHuman: 0.42, classicFuture: 0.38,
      xHeight: 0.749, extenders: 0.46, aperture: 0.31, apex: 0.54, crossbar: 0.56, letterSpacing: 0.3, vWeight: 0.42, hWeight: 0.58, counter: 0.34,
      terminalCurl: 0.42, squareness: 0.22, descender: 0.74, joinRound: 0.17, qForm: 'sweep', tail: 0.59, wordSpacing: 0.507, sideBearing: 0.488 }),
  style('gothic', 'sans', ['grotesque'], 'Grotesk', ['business', 'rugged', 'sincere'], 'Libre Franklin, Archivo, Public Sans',
    'An American gothic after Franklin: sturdy and a little rough, with a two-storey a and g, slight contrast and stroke ends that pinch in.',
    { weight: 0.58, width: 0.44, contrast: 0.64, curve: 0.19, geoHuman: 0.51, joints: 0.2, story: 'double', xHeight: 0.737, extenders: 0.39,
      aperture: 0.26, apex: 1, counter: 0.47, letterSpacing: 0.16, hWeight: 0.66, crossbar: 0.55, roundness: 0.2, terminalLength: 0.66,
      squareness: 0.32, descender: 0.42, gForm: 'double', joinRound: 0.16, tail: 0.23, wordSpacing: 0.303, sideBearing: 0.606, playfulFormal: 0.58 }),
  style('wide', 'sans', ['neogrotesque'], 'Extra Wide', ['loud', 'innovative', 'business'], 'Archivo Expanded, Dela Gothic One, Krona One',
    'A black grotesque stretched as wide as it goes and set tight: short, flat and heavy, like a sports or streetwear logo.',
    { weight: 0.96, width: 0.68, height: 0.38, contrast: 0.68, curve: 0.12, squareness: 0.32, geoHuman: 0.51, xHeight: 0.807, extenders: 0.56,
      aperture: 0.25, apex: 1, counter: 0.34, letterSpacing: 0.08, hWeight: 1, crossbar: 0.49, roundness: 0.22, terminal: 'round',
      terminalLength: 0.98, terminalForm: 'droplet', terminalSize: 0, descender: 0.56, overlap: 0.84, tail: 0.45, wordSpacing: 0.083,
      sideBearing: 0.481 }),
  style('industrial', 'sans', ['superellipse'], 'Industrial', ['business', 'stiff', 'futuristic'], 'Barlow, Saira, Encode Sans',
    'A road-sign sans after DIN: engineered from straight sides and squarish curves, with a big lowercase, level stroke ends and even spacing.',
    { weight: 0.5, width: 0.29, contrast: 0.52, curve: 0, geoHuman: 0, apex: 1, xHeight: 0.701, extenders: 0.4, aperture: 0.66, counter: 0.48,
      classicFuture: 0.72, story: 'double', letterSpacing: 0.16, hWeight: 0.47, crossbar: 0.52, roundness: 0.25, terminalLength: 0.81,
      descender: 0.53, overlap: 0.61, tail: 0.3, wordSpacing: 0.359, sideBearing: 0.65, playfulFormal: 0.48 }),
  style('screen', 'sans', ['humanist'], 'Screen Sans', ['business', 'calm', 'sincere'], 'Noto Sans, Hind, Mukta',
    'Drawn for reading on screens, after Verdana: wide, open letters with a very tall lowercase, sturdy strokes and loose spacing.',
    { weight: 0.5, width: 0.44, contrast: 0.55, curve: 0, geoHuman: 0.8, xHeight: 0.833, extenders: 0.57, aperture: 0.56, counter: 0.61, apex: 1,
      story: 'double', letterSpacing: 0.24, hWeight: 0.58, crossbar: 0.54, terminalLength: 0.58, squareness: 0.01, descender: 0.57, overlap: 0.96,
      joinRound: 0.03, tail: 0.51, wordSpacing: 0.424, sideBearing: 0.656, classicFuture: 0.43 }),
  style('softcond', 'sans', ['rounded'], 'Soft Condensed', ['calm', 'futuristic', 'stiff'], 'Big Shoulders Display, Saira Extra Condensed, Pathway Gothic One',
    'Light, tall and squeezed thin, with softened corners and straight-sided bowls: quiet, clean and made to save space.',
    { weight: 0.3, width: 0.12, height: 0.85, squareness: 0.63, roundness: 0.33, terminal: 'round', xHeight: 0.727, extenders: 0.54, apex: 1,
      counter: 0.48, aperture: 0.86, classicFuture: 0.68, crossbar: 0.54, curve: 0.3, descender: 0.42, overlap: 0.6, joinRound: 0.18, tail: 0.3,
      wordSpacing: 0.445, sideBearing: 0.538, geoHuman: 0.62, softSharp: 0.42 }),
  style('blockgothic', 'sans', ['superellipse'], 'Block Gothic', ['loud', 'rugged', 'excited'], 'Squada One, Teko, Russo One',
    'Heavy, narrow and squared off, like jersey numbers or a gig poster: flat-sided bowls, tiny counters and a big lowercase.',
    { weight: 0.78, width: 0.3, height: 0.75, squareness: 1, roundness: 0.38, xHeight: 0.833, extenders: 0.38, aperture: 0, counter: 0.3, apex: 1,
      classicFuture: 0.48, letterSpacing: 0.1, hWeight: 0.66, crossbar: 0.51, curve: 0.34, terminalLength: 0.48, overlap: 0.92, tail: 0.29,
      wordSpacing: 0.38, sideBearing: 0.55, geoHuman: 0.18, softSharp: 0.52 }),
  style('ultrablack', 'sans', ['geometric'], 'Ultra Black', ['loud', 'playful', 'innovative', 'excited'], 'Rubik Mono One, Climate Crisis, Titan One',
    'As black as a geometric sans can go: wide letters packed close, with pinhole counters and deep ink traps where strokes meet.',
    { weight: 1, width: 0.7, contrast: 0.69, joints: 0.8, squareness: 0.81, curve: 0.61, geoHuman: 0.12, counter: 0.19, aperture: 0.39,
      xHeight: 0.807, extenders: 0.25, apex: 1, letterSpacing: 0.02, vWeight: 1, hWeight: 1, crossbar: 0.69, terminal: 'sharp',
      terminalLength: 0.35, terminalForm: 'pointed', overlap: 0.38, tail: 0, wordSpacing: 1, sideBearing: 0.9, softSharp: 0.49 }),
  style('thinsans', 'sans', ['geometric'], 'Thin Sans', ['sophisticated', 'calm', 'fancy'], 'Raleway, Josefin Sans, Jost',
    'The thinnest line there is, drawn on round, open letters with long ascenders and airy spacing. Quiet and elegant at large sizes.',
    { weight: 0, width: 0.52, contrast: 0.42, curve: 0.12, geoHuman: 0.37, xHeight: 0.8, extenders: 0.56, apex: 0.72, counter: 0.46,
      aperture: 0.03, letterSpacing: 0.36, vWeight: 0.58, hWeight: 0.58, terminal: 'sharp', terminalLength: 0.18, terminalForm: 'pointed',
      squareness: 0.09, overlap: 0.91, joinRound: 0.21, wordSpacing: 0.504, sideBearing: 0.656, softSharp: 0.48, classicFuture: 0.35 }),
  style('sporty', 'sans', ['neogrotesque'], 'Sport Italic', ['excited', 'loud', 'futuristic'], 'Kanit Italic, Saira Italic, Racing Sans One',
    'A bold, squarish sans leaning hard into the wind, with cut stroke ends and tight spacing, like the lettering on a team jersey.',
    { weight: 0.9, width: 0.46, slant: 0.55, contrast: 0.71, terminal: 'round', apex: 1, xHeight: 0.701, aperture: 0.16, counter: 0.56,
      classicFuture: 0.83, letterSpacing: 0.1, vWeight: 0.54, hWeight: 0.96, roundness: 0.04, terminalLength: 0.34, terminalForm: 'droplet',
      terminalSize: 0, extenders: 0.49, descender: 0.54, story: 'single', overlap: 0.72, tail: 0.34, wordSpacing: 0.22, sideBearing: 0.538,
      geoHuman: 0.56, playfulFormal: 0.58 }),
  style('chunkyround', 'sans', ['rounded'], 'Chunky Rounded', ['happy', 'cute', 'childlike', 'playful'], 'Fredoka, Baloo 2, Mochiy Pop One',
    'Bold, round-ended and steady: a big lowercase with a single-storey a and soft, open shapes, like a friendly app icon.',
    { weight: 0.86, width: 0.4, contrast: 0.68, roundness: 0.2, terminal: 'angled', curve: 0.3, geoHuman: 0.08, xHeight: 0.754, aperture: 0.51,
      story: 'single', softSharp: 0.26, playfulFormal: 0.51, letterSpacing: 0.14, hWeight: 1, crossbar: 0.43, apex: 0, terminalLength: 0.58,
      terminalForm: 'inner', extenders: 0.46, descender: 0.56, overlap: 0.52, joinRound: 0.08, tail: 0.48, wordSpacing: 0.307, sideBearing: 0.369,
      classicFuture: 0.42 }),
  style('radial', 'sans', ['geometric'], 'Radial', ['innovative', 'artistic', 'calm'], 'Space Grotesk, Lexend, Syne',
    'A lowercase as tall as the capitals, with perfectly round bowls running square into their stems, barred i and l, round dots and a spur on the a.',
    { weight: 0.42, width: 0.36, contrast: 0.53, xHeight: 0.73, counter: 0.92, curve: 0.17, terminalRun: 'straight', extenders: 0.4,
      descender: 0.59, story: 'double', bowlJoin: 'square', dots: 'round', dotSize: 0.7, iForm: 'bars', aForm: 'spur', aperture: 0, crossbar: 0.49,
      roundness: 0.07, apex: 1, terminalLength: 0.55, squareness: 0.2, joinRound: 0.05, tail: 0.34, wordSpacing: 0.461, sideBearing: 0.706,
      geoHuman: 0.42, softSharp: 0.42,
      glyphs: { a: { width: 0.15, aperture: 1, crossbar: 0.6, terminalEnds: { '0e': 0.15 } }, u: { width: 0.27 }, r: { width: 0.7 }, t: { width: 0.72, terminalEnds: { p0s: 0.7 }, corners: { '0j1': 0.33 } }, f: { width: 0.68, crossbar: 0.22, corners: { '0j2': 0.33 } }, i: { width: 0.6 }, l: { width: 0.6 }, s: { aperture: 0.2 }, y: { corners: { '0j0': 0.33 }, terminal: 'cut', terminalForm: 'level' } } }),
  style('mirrorsans', 'sans', ['geometric'], 'Mirror Sans', ['playful', 'artistic', 'innovative'], 'Space Grotesk, Syne, Unbounded',
    'A quirky geometric sans after Gebuk: an even line, round open bowls, a big lowercase and an e drawn back to front.',
    { weight: 0.42, width: 0.44, contrast: 0.54, curve: 0, geoHuman: 0.18, xHeight: 0.687, extenders: 0.4, counter: 0.6, aperture: 0.08,
      story: 'double', kForm: 'stem', letterSpacing: 0.12, roundness: 0.51, apex: 1, terminalLength: 0.82, descender: 0.56, overlap: 0.92,
      joinRound: 0.16, tail: 0.54, wordSpacing: 0.438, sideBearing: 0.625, classicFuture: 0.66,
      glyphs: { e: { mirror: 'mirrored' } } }),

  /* ---- Serif */
  style('oldstyle', 'serif', ['oldstyle'], 'Old Style', ['business', 'vintage', 'sophisticated', 'sincere'], 'EB Garamond, Cormorant Garamond, Crimson Pro',
    'Renaissance book type. Angled stress, steeply sloped serifs, a tiny lowercase under long ascenders and open, calligraphic curves.',
    { weight: 0.34, width: 0.3, contrast: 0.53, serif: true, serifThickness: 0.3, serifAngle: 0.92, terminal: 'cut', curve: 0.08, geoHuman: 0.42,
      classicFuture: 0, xHeight: 0.67, extenders: 0.53, aperture: 0.8, apex: 1, crossbar: 0.49, letterSpacing: 0.22, hWeight: 0.46, counter: 0.66,
      roundness: 0.04, terminalLength: 0.82, terminalCurl: 0.43, terminalForm: 'level', squareness: 0.12, descender: 0.86, overlap: 0.89,
      gForm: 'double', joinRound: 0.38, qForm: 'sweep', tail: 0.77, serifBracket: 0.58, serifTops: 0.26, serifArms: 0.7, serifArmThickness: 0.18,
      wordSpacing: 0.43, sideBearing: 0.531, softSharp: 0.25 }),
  style('serif', 'serif', ['transitional'], 'Transitional', ['business', 'calm', 'sincere'], 'Libre Baskerville, Source Serif 4, Lora',
    'Crisp serifs, clear thick-and-thin strokes, upright stress and ball endings. Made for headlines and long reads alike.',
    { weight: 0.53, contrast: 0.71, serif: true, serifSize: 0.34, serifThickness: 0.38, serifAngle: 0.06, terminal: 'round', classicFuture: 0.46,
      curve: 0.06, xHeight: 0.691, apex: 0.45, hWeight: 0.46, counter: 0.42, aperture: 0.21, roundness: 0.98, terminalLength: 0.58,
      squareness: 0.2, descender: 0.58, overlap: 0.72, gForm: 'double', joinRound: 0.02, qForm: 'sweep', tail: 0.43, serifBracket: 0.46,
      serifTops: 0.44, serifArms: 0.96, serifArmThickness: 0.74, wordSpacing: 0.404, sideBearing: 0.625, geoHuman: 0.55, playfulFormal: 0.58 }),
  style('didone', 'serif', ['didone'], 'Didone', ['fancy', 'sophisticated', 'vintage'], 'Playfair Display, Bodoni Moda, Prata',
    'Extreme contrast, set tall and narrow: heavy upright stems against hairline serifs and ball-shaped endings. Built for fashion covers.',
    { weight: 0.64, width: 0.4, height: 0.72, contrast: 1, serif: true, serifShape: 'wedge', serifSize: 0.28, serifThickness: 0.34, serifAngle: 0,
      terminal: 'round', curve: 0.26, geoHuman: 0.36, classicFuture: 0.6, aperture: 0.26, xHeight: 0.717, apex: 0.86, hWeight: 0.82, counter: 0.56,
      crossbar: 0.52, roundness: 0.97, terminalLength: 0.76, terminalCurl: 0.52, squareness: 0.02, extenders: 0.6, descender: 0.34, overlap: 0.98,
      qForm: 'sweep', tail: 0.48, serifTops: 0.56, serifArms: 1, serifArmThickness: 0.9, wordSpacing: 0.401, sideBearing: 0.625, softSharp: 0.68,
      playfulFormal: 0.46 }),
  style('fatface', 'serif', ['fatface', 'didone'], 'Fat Face', ['loud', 'vintage', 'rugged'], 'Abril Fatface, Rozha One, Ultra',
    'A Didone pushed to the limit: stems as heavy as they go, hairlines as thin as they go, tiny counters.',
    { weight: 0.88, width: 0.4, contrast: 1, serif: true, serifShape: 'unbracketed', serifSize: 0.14, serifThickness: 0.36, serifAngle: 0.12,
      terminal: 'tapered', curve: 0, xHeight: 0.704, aperture: 0, counter: 0.42, letterSpacing: 0.18, hWeight: 0.8, crossbar: 0.64,
      roundness: 0.19, apex: 0.64, terminalLength: 1, terminalCurl: 0.46, terminalForm: 'taper', squareness: 0.12, extenders: 0.54,
      descender: 0.66, serifTops: 0.48, serifArms: 1, serifArmThickness: 1, wordSpacing: 0.199, sideBearing: 0.481, geoHuman: 0.74,
      classicFuture: 0.38 }),
  style('wedge', 'serif', ['wedge'], 'Wedge Serif', ['vintage', 'fancy'], 'Cinzel, Forum, Marcellus SC',
    'Big triangular, chisel-cut serifs on wide, widely spaced letters with a small lowercase. Feels engraved, heroic and a little mythic.',
    { weight: 0.24, contrast: 0.67, serif: true, serifShape: 'unbracketed', serifSize: 0.3, serifThickness: 0, serifAngle: 0.85, terminal: 'sharp',
      softSharp: 0.82, apex: 0.44, classicFuture: 0.34, xHeight: 0.614, curve: 0.06, letterSpacing: 0.4, vWeight: 0.64, hWeight: 0.36,
      aperture: 0.86, crossbar: 0.62, roundness: 0.1, terminalLength: 0.58, terminalCurl: 0.44, squareness: 0.26, joinRound: 0.22, tail: 0,
      serifTops: 0.64, serifArms: 0.32, wordSpacing: 0.437, sideBearing: 0.8, geoHuman: 0.6, playfulFormal: 0.54 }),
  style('news', 'serif', ['transitional'], 'Newspaper', ['business', 'sincere', 'stiff'], 'PT Serif, Newsreader, Merriweather',
    'Built to fit more words on a page: narrow, sturdy and set tight, with a big lowercase, sharp serifs and moderate contrast.',
    { weight: 0.5, width: 0.46, contrast: 0.71, serif: true, serifSize: 0.28, serifThickness: 0.34, serifAngle: 0.09, terminal: 'round',
      curve: 0.19, xHeight: 0.791, extenders: 0.53, aperture: 0.46, apex: 0.45, counter: 0.28, letterSpacing: 0.1, vWeight: 0.46, hWeight: 0.59,
      crossbar: 0.58, roundness: 0.91, terminalLength: 0.81, terminalCurl: 0.54, squareness: 0.31, overlap: 0.97, gForm: 'double', joinRound: 0.04,
      qForm: 'sweep', tail: 0.55, serifBracket: 0.21, serifTops: 0.44, serifArms: 1, serifArmThickness: 0.92, wordSpacing: 0.432,
      sideBearing: 0.562, softSharp: 0.46, classicFuture: 0.18, playfulFormal: 0.82 }),
  style('softserif', 'serif', ['oldstyle'], 'Soft Serif', ['happy', 'vintage', 'playful', 'sincere'], 'Caprasimo, Fraunces, Young Serif',
    'A 70s ad face after Cooper Black: very heavy and wide, with every serif and corner melted round and small, squashed counters.',
    { weight: 1, width: 0.52, contrast: 0.71, serif: true, serifSize: 0.2, serifThickness: 1, serifAngle: 0.08, roundness: 1, terminal: 'sharp',
      curve: 0.01, geoHuman: 0.78, softSharp: 0, xHeight: 0.743, aperture: 0.04, counter: 0.3, playfulFormal: 0.62, letterSpacing: 0.12,
      hWeight: 0.67, crossbar: 0.53, apex: 0.5, terminalLength: 0.58, terminalForm: 'pointed', squareness: 0.01, extenders: 0.41, descender: 0.53,
      overlap: 0.6, gForm: 'double', joinRound: 0.76, tail: 0.25, serifBracket: 0.92, serifTops: 0.58, serifArms: 1, serifArmThickness: 0.92,
      wordSpacing: 0.271, sideBearing: 0.587 }),
  style('hairserif', 'serif', ['didone'], 'Hairline Serif', ['fancy', 'sophisticated', 'calm'], 'Italiana, Cormorant, Bodoni Moda',
    'A fashion-magazine display serif: fine strokes against hairlines, tiny sharp serifs, tapering ends and letters set close.',
    { weight: 0.32, width: 0.44, height: 0.7, contrast: 1, serif: true, serifShape: 'unbracketed', serifSize: 0, serifThickness: 1,
      serifAngle: 0.08, terminal: 'tapered', curve: 0.15, geoHuman: 0.6, xHeight: 0.739, aperture: 0.57, apex: 0.6, crossbar: 0.67,
      story: 'double', letterSpacing: 0.08, hWeight: 0.69, counter: 0.66, terminalLength: 0.84, terminalCurl: 0.38, squareness: 0.03,
      extenders: 0.54, descender: 0.64, joinRound: 0.29, qForm: 'sweep', tail: 0.17, serifTops: 0.21, serifArms: 0.48, serifArmThickness: 0.18,
      wordSpacing: 0.61, sideBearing: 0.562, softSharp: 0.66, classicFuture: 0.49, playfulFormal: 0.82 }),
  style('condserif', 'serif', ['didone'], 'Condensed Serif', ['sophisticated', 'fancy', 'vintage'], 'Instrument Serif, Antic Didone, Gilda Display',
    'A tall, narrow Didone for headlines: slim stems, hairline serifs and ball endings, stacked up like a poster title.',
    { weight: 0.36, width: 0.28, height: 0.85, contrast: 0.69, serif: true, serifSize: 0.26, serifThickness: 0.26, serifAngle: 0.1,
      terminal: 'round', curve: 0.18, xHeight: 0.756, apex: 0.14, counter: 0.24, aperture: 0, letterSpacing: 0.18, hWeight: 0.46, crossbar: 0.52,
      roundness: 0.3, terminalLength: 0.76, terminalCurl: 0.54, squareness: 0.16, extenders: 0.42, descender: 0.58, overlap: 0.98, gForm: 'double',
      joinRound: 0.18, tail: 0.78, serifBracket: 0.48, serifTops: 0.37, serifArms: 1, serifArmThickness: 0.98, wordSpacing: 0.399,
      sideBearing: 0.513, geoHuman: 0.82, softSharp: 0.83, classicFuture: 0.3, playfulFormal: 0.54 }),
  style('compressed', 'serif', ['fatface', 'didone'], 'Compressed Serif', ['loud', 'vintage', 'rugged', 'excited'], 'Rozha One, Abril Fatface, DM Serif Display',
    'A fat face squeezed tall and narrow and set tight: black stems, thin hairlines and small bracketed serifs, like a Victorian playbill.',
    { weight: 0.96, width: 0.8, height: 0.8, contrast: 0.96, serif: true, serifSize: 0.25, serifThickness: 0.17, serifAngle: 0, curve: 0.03,
      xHeight: 0.981, aperture: 0.35, counter: 0.26, apex: 0, letterSpacing: 0.08, hWeight: 0.7, crossbar: 0.52, roundness: 0.41,
      terminalLength: 0.89, terminalForm: 'flared', terminalFlare: 0, squareness: 0.05, extenders: 0.79, descender: 0.52, gForm: 'double',
      joinRound: 0.16, qForm: 'sweep', tail: 0.32, serifBracket: 0.35, serifTops: 0.48, serifArms: 1, serifArmThickness: 1, wordSpacing: 0.275,
      sideBearing: 0.725, geoHuman: 0.62, softSharp: 0.34, classicFuture: 0.26, playfulFormal: 0.66 }),
  style('headline', 'serif', ['transitional'], 'Headline Serif', ['sophisticated', 'business', 'loud'], 'DM Serif Display, Gloock, Rufina',
    'A bold, sharp serif for magazine headlines: strong contrast, ball endings and spacing tightened up for big sizes.',
    { weight: 0.74, width: 0.48, contrast: 1, serif: true, serifSize: 0.19, serifThickness: 0.12, serifAngle: 0.34, terminal: 'round', curve: 0.09,
      geoHuman: 0.75, xHeight: 0.74, aperture: 0.33, counter: 0.43, apex: 0.29, letterSpacing: 0.06, hWeight: 0.44, crossbar: 0.59,
      roundness: 0.85, terminalLength: 0.82, squareness: 0.11, extenders: 0.46, descender: 0.64, overlap: 0.94, gForm: 'double', qForm: 'sweep',
      tail: 0.21, serifBracket: 0.53, serifTops: 0.48, serifArms: 1, serifArmThickness: 0.98, wordSpacing: 0.325, softSharp: 0.35,
      playfulFormal: 0.82 }),
  style('serifitalic', 'serif', ['didone'], 'Serif Italic', ['fancy', 'sophisticated', 'artistic'], 'Playfair Display Italic, Instrument Serif Italic, Bodoni Moda Italic',
    'The true italic of a high-contrast serif: leaning, flowing letters with hairline serifs, ball endings and a cursive a, g and y.',
    { width: 0.24, height: 0.62, slant: 0.4, contrast: 0.92, serif: true, serifShape: 'unbracketed', serifSize: 0.42, serifThickness: 0.92,
      serifAngle: 1, terminal: 'round', cursive: 0.45, curve: 1, geoHuman: 0.66, xHeight: 0.759, extenders: 0.57, aperture: 0.2, apex: 0.97,
      letterSpacing: 0.12, counter: 0.58, crossbar: 0.59, roundness: 0.27, terminalLength: 0.94, terminalCurl: 0.54, squareness: 0.28,
      descender: 0.34, overlap: 0.44, joinRound: 0.04, qForm: 'sweep', tail: 0, serifTops: 0.34, serifArms: 1, serifArmThickness: 0.66,
      wordSpacing: 0.377, sideBearing: 0.756, classicFuture: 0.42 }),
  style('copperplate', 'serif', [], 'Copperplate', ['business', 'vintage', 'stiff'], 'Stint Ultra Expanded, Castoro Titling, Marcellus SC',
    'Wide, light, even letters with tiny spur serifs and airy spacing, like an engraved letterhead or business card.',
    { weight: 0.36, width: 0.7, height: 0.4, contrast: 0.48, serif: true, serifSize: 0.55, serifThickness: 0.53, serifAngle: 0, curve: 0.14,
      geoHuman: 0.38, xHeight: 0.781, extenders: 0.4, aperture: 0.07, apex: 0.98, counter: 0.44, letterSpacing: 0.36, vWeight: 0.42, hWeight: 0.46,
      crossbar: 0.53, roundness: 0.34, terminalLength: 0.65, squareness: 0.4, descender: 0.53, overlap: 0.73, joinRound: 0.03, qForm: 'inside',
      tail: 1, serifBracket: 0, serifArms: 0.98, serifArmThickness: 0.1, wordSpacing: 0.611, sideBearing: 0.794, softSharp: 0.09,
      classicFuture: 0.2 }),
  style('venetian', 'serif', ['venetian'], 'Venetian', ['vintage', 'sincere', 'sophisticated', 'calm'], 'Alegreya, Sorts Mill Goudy, Cardo',
    'The first roman type, cut in 1470s Venice: dark and even, with little contrast, steeply sloped serifs, a small lowercase and a calligraphic swing.',
    { weight: 0.62, width: 0.34, contrast: 0.63, serif: true, serifSize: 0.4, serifThickness: 0.57, serifAngle: 0.02, terminal: 'angled',
      curve: 0.38, geoHuman: 0.52, classicFuture: 0, xHeight: 0.86, extenders: 0.68, aperture: 0.78, apex: 0.99, crossbar: 0.47,
      letterSpacing: 0.18, vWeight: 0.42, hWeight: 0.58, counter: 0.58, roundness: 0.82, terminalLength: 0.64, descender: 0.55, overlap: 0.9,
      gForm: 'double', joinRound: 0.08, qForm: 'sweep', tail: 0.66, serifBracket: 0.05, serifTops: 0.25, serifArms: 1, serifArmThickness: 0.64,
      wordSpacing: 0.354, sideBearing: 0.606, playfulFormal: 0.58 }),
  style('swashitalic', 'serif', ['oldstyle', 'swash'], 'Swash Italic', ['fancy', 'sophisticated', 'vintage', 'artistic'], 'Libre Caslon Text Italic, EB Garamond Italic, Cormorant Italic',
    'An old-style italic after Caslon: a steady lean, bracketed serifs, ball ends, and swash capitals whose first stroke curls out into a flourish.',
    { weight: 0.42, width: 0.34, height: 0.7, slant: 0.5, contrast: 0.7, serif: true, serifSize: 0.62, serifThickness: 0.16, serifAngle: 0.55,
      terminal: 'round', terminalForm: 'ball', terminalSize: 0.03, cursive: 0.45, curve: 1, geoHuman: 0.48, xHeight: 0.71, extenders: 0.6,
      aperture: 0.08, apex: 0.6, swash: 0.75, letterSpacing: 0.06, counter: 0.66, crossbar: 0.74, roundness: 0.98, terminalLength: 0.6,
      terminalCurl: 0.48, squareness: 0.19, descender: 0.49, overlap: 0.45, gForm: 'double', joinRound: 0.02, qForm: 'sweep', tail: 0,
      serifBracket: 0.66, serifTops: 0.27, serifArmThickness: 0.62, wordSpacing: 0.389, sideBearing: 0.413, softSharp: 0.09, classicFuture: 0.34,
      playfulFormal: 1 }),

  /* ---- Slab Serif */
  style('slab', 'slab', ['slab'], 'Geometric Slab', ['calm', 'business', 'stiff'], 'Josefin Slab, Arvo, Rokkitt',
    'Block-shaped serifs on a light, even, geometric skeleton: perfectly round bowls, a single-storey a and open spacing. Crisp and engineered.',
    { weight: 0, width: 0.28, contrast: 0.42, serif: true, serifShape: 'slab', serifSize: 0.38, serifThickness: 0.11, serifAngle: 0, curve: 0.13,
      geoHuman: 0.37, xHeight: 0.439, apex: 0.54, counter: 0.78, story: 'single', letterSpacing: 0.3, vWeight: 0.66, hWeight: 0.86, aperture: 0.64,
      roundness: 0.08, terminalLength: 0.58, extenders: 0.54, descender: 0.62, overlap: 0.52, tail: 0.62, serifArms: 1, serifArmThickness: 0.34,
      wordSpacing: 0.669, sideBearing: 0.606, classicFuture: 0.42, playfulFormal: 0.98 }),
  style('clarendon', 'slab', ['clarendon', 'slab'], 'Clarendon', ['business', 'rugged', 'vintage', 'sincere'], 'Crete Round, Zilla Slab, Besley',
    'A bold, friendly slab: heavy serifs flow into the stems through soft brackets, with some contrast, ball endings and a big lowercase.',
    { weight: 0.56, width: 0.38, contrast: 0.51, serif: true, serifSize: 0.34, serifThickness: 0.81, serifAngle: 0.01, terminal: 'round',
      roundness: 0.59, curve: 0.08, xHeight: 0.769, aperture: 0.01, counter: 0.58, hWeight: 0.42, apex: 0.97, terminalLength: 0.66,
      squareness: 0.1, extenders: 0.61, descender: 0.56, overlap: 0.9, joinRound: 0.02, tail: 0.6, serifBracket: 0, serifTops: 0.47,
      serifArms: 0.74, serifArmThickness: 0.67, wordSpacing: 0.336, sideBearing: 0.575, geoHuman: 0.66, softSharp: 0.44, classicFuture: 0.49 }),
  style('egyptian', 'slab', ['slab'], 'Heavy Slab', ['loud', 'rugged', 'vintage'], 'Bevan, Patua One, Holtwood One SC',
    'An Egyptian after Rockwell, set black: square-cut slabs as thick as the stems, a monoline stroke and compact, blocky letters.',
    { weight: 1, width: 0.4, contrast: 0.57, serif: true, serifShape: 'slab', serifSize: 0.3, serifThickness: 1, serifAngle: 0.14, curve: 0,
      geoHuman: 0.51, xHeight: 0.603, aperture: 0, counter: 0.6, apex: 0.24, letterSpacing: 0.16, hWeight: 1, crossbar: 0.56, roundness: 0.81,
      terminalLength: 0.72, extenders: 0.32, descender: 0.55, overlap: 0.88, tail: 0.38, serifArms: 1, serifArmThickness: 0.56, wordSpacing: 0.161,
      sideBearing: 0.625, softSharp: 0.42, classicFuture: 0.74, playfulFormal: 0.74 }),
  style('humanslab', 'slab', ['slab'], 'Humanist Slab', ['calm', 'sincere', 'happy'], 'Bree Serif, Aleo, Kotta One',
    'A friendly upright-italic slab: short, rounded slabs, a single-storey a, a gentle lean and ends that flick out like handwriting.',
    { weight: 0.57, width: 0.44, slant: 0.08, serif: true, serifShape: 'slab', serifSize: 0.37, serifThickness: 0.6, serifAngle: 0.01,
      roundness: 0.98, terminal: 'round', cursive: 0.36, curve: 0.91, geoHuman: 1, story: 'single', xHeight: 0.89, aperture: 0.17, apex: 0.86,
      letterSpacing: 0.16, hWeight: 0.58, counter: 0.32, crossbar: 0.52, terminalLength: 0.8, terminalForm: 'droplet', terminalSize: 0.39,
      squareness: 0.03, extenders: 0.61, overlap: 0.96, gForm: 'double', joinRound: 0.16, qForm: 'sweep', tail: 0, serifTops: 0.42,
      serifArms: 0.76, serifArmThickness: 0.72, wordSpacing: 0.179, sideBearing: 0.594, softSharp: 0.22, classicFuture: 0.3, playfulFormal: 0.7 }),
  style('softslab', 'slab', ['slab'], 'Soft Slab', ['sincere', 'calm', 'happy', 'business'], 'Roboto Slab, Kameron, Slabo 27px',
    'A friendly modern slab after Museo Slab: sturdy, even strokes and square slabs with their corners softened, over a big lowercase.',
    { weight: 0.62, width: 0.34, contrast: 0.51, serif: true, serifShape: 'slab', serifSize: 0.28, serifThickness: 0.6, serifAngle: 0.08,
      roundness: 0.67, curve: 0.1, geoHuman: 0.42, xHeight: 0.756, aperture: 0.03, apex: 0.98, story: 'double', letterSpacing: 0.16,
      crossbar: 0.54, terminalLength: 0.68, squareness: 0.06, extenders: 0.57, descender: 0.45, overlap: 0.76, joinRound: 0.03, tail: 0.42,
      serifTops: 0.61, serifArms: 0.88, serifArmThickness: 0.62, wordSpacing: 0.397, sideBearing: 0.669, softSharp: 0.46, classicFuture: 0.65 }),
  style('wideslab', 'slab', ['slab'], 'Expanded Slab', ['loud', 'vintage', 'rugged'], 'Rammetto One, Bowlby One, Alfa Slab One',
    'A heavy slab stretched as wide and low as it goes, with thick square serifs. Made for circus posters and bold packaging.',
    { weight: 0.66, width: 0.55, height: 0.4, contrast: 0.68, serif: true, serifShape: 'slab', serifSize: 0, serifThickness: 0.36,
      serifAngle: 0.16, curve: 0.55, xHeight: 0.861, counter: 0.3, aperture: 0.7, apex: 0.83, letterSpacing: 0.14, vWeight: 0.82, hWeight: 1,
      crossbar: 0.52, roundness: 0.68, terminalLength: 0.74, extenders: 0.48, descender: 0.54, overlap: 0.38, joinRound: 0.44, tail: 0.24,
      serifTops: 0, serifArms: 0.02, serifArmThickness: 0.42, wordSpacing: 0.152, sideBearing: 0.581, geoHuman: 0.32, classicFuture: 0.42,
      playfulFormal: 0.51 }),

  /* ---- Monospace */
  style('typewriter', 'mono', ['slab'], 'Typewriter', ['vintage', 'sincere'], 'Courier Prime, Cutive Mono, Special Elite',
    'Every letter the same width, with soft slab serifs and slightly uneven ink, like keys struck through a ribbon.',
    { weight: 0.62, contrast: 0.56, serif: true, serifShape: 'slab', serifThickness: 0.53, serifAngle: 0, mono: 1, wobble: 0.15, roundness: 1,
      terminal: 'round', curve: 0, xHeight: 0.851, wordSpacing: 0, width: 0.64, vWeight: 0.34, counter: 0.64, aperture: 0, crossbar: 0.37,
      apex: 0.8, terminalLength: 0.89, squareness: 0.44, extenders: 0.62, descender: 0.48, overlap: 0.4, joinRound: 0.11, qForm: 'inside', tail: 1,
      serifTops: 0.55, serifArms: 1, serifArmThickness: 0.61, sideBearing: 0.662, geoHuman: 0.46, softSharp: 0, playfulFormal: 1 }),
  style('squaremono', 'mono', [], 'Square Mono', ['futuristic', 'stiff'], 'Major Mono Display, Syne Mono, Space Mono',
    'A wide monospace with square bowls and square dots. Reads like numbers on a train departure board.',
    { weight: 0.26, width: 0.68, contrast: 0.64, mono: 1, squareness: 0.3, curve: 0.02, geoHuman: 0.37, xHeight: 0.756, apex: 0.38, aperture: 0.19,
      letterSpacing: 0.22, terminal: 'cut', vWeight: 0.39, hWeight: 0.48, counter: 0.77, crossbar: 0.81, roundness: 0.12, terminalLength: 1,
      tail: 0.48, wordSpacing: 1, sideBearing: 0.744, softSharp: 0.42 }),
  style('code', 'mono', [], 'Code', ['calm', 'futuristic', 'stiff'], 'IBM Plex Mono, Space Mono, Ubuntu Mono',
    'A code-editor face: one narrow width for every character, a tall x-height, squarish bowls and slight ink traps that keep it crisp at small sizes.',
    { weight: 0.62, width: 0.38, mono: 1, squareness: 0.01, joints: 0.3, curve: 0.02, geoHuman: 0.6, xHeight: 0.754, extenders: 0.53,
      aperture: 0.71, apex: 0.99, classicFuture: 0.6, hWeight: 0.44, counter: 0.86, crossbar: 0.54, roundness: 0.05, terminalLength: 0.96,
      gForm: 'double', joinRound: 0.07, tail: 0.54, wordSpacing: 1, sideBearing: 0.538 }),
  style('roundmono', 'mono', ['rounded'], 'Rounded Mono', ['calm', 'cute', 'happy'], 'M PLUS 1 Code, Azeret Mono, Red Hat Mono',
    'A soft monospace for friendly terminals: round stroke ends and softened corners on a fixed grid, light and airy.',
    { weight: 0.44, width: 0.18, contrast: 0.58, mono: 1, roundness: 0.28, terminal: 'round', curve: 0.21, geoHuman: 0.4, xHeight: 0.743,
      extenders: 0.53, aperture: 0.72, counter: 1, apex: 1, story: 'double', crossbar: 0.49, terminalLength: 0.82, squareness: 0.24,
      descender: 0.43, overlap: 0.99, joinRound: 0.12, tail: 0.65, wordSpacing: 0, sideBearing: 0.469 }),
  style('terminal', 'mono', [], 'Terminal', ['futuristic', 'vintage', 'stiff'], 'VT323, Press Start 2P, Share Tech Mono',
    'Green-screen computer text: tall, narrow monospace letters built from fine square pixels, as on an 80s terminal.',
    { weight: 0.56, width: 0.36, height: 0.7, mono: 1, fill: 'pixels', module: 0.3, curve: 0, geoHuman: 0.47, xHeight: 0.756, apex: 1,
      aperture: 0.22, counter: 0.34, vWeight: 0.46, hWeight: 0.54, crossbar: 0.53, roundness: 0.16, terminalLength: 0.98, extenders: 0.43,
      descender: 0.46, joinRound: 0.21, qForm: 'inside', tail: 0.64, wordSpacing: 0 }),
  style('cursivemono', 'mono', [], 'Cursive Mono', ['artistic', 'calm', 'sophisticated'], 'Victor Mono Italic, JetBrains Mono Italic, Courier Prime Italic',
    'A coding italic: every letter the same width, but slanted and joined up in handwritten shapes, with round, looping ends.',
    { weight: 0.3, width: 0.58, slant: 0.35, contrast: 0.37, mono: 1, cursive: 0.75, roundness: 0.28, terminal: 'round', curve: 0.8,
      geoHuman: 0.81, xHeight: 0.717, extenders: 0.39, counter: 0.26, descender: 0.42, joinRound: 0.04, wordSpacing: 1, sideBearing: 0,
      classicFuture: 0.66, playfulFormal: 0.34 }),
  style('boldmono', 'mono', [], 'Heavy Mono', ['loud', 'futuristic', 'innovative'], 'Space Mono Bold, Chivo Mono Black, Martian Mono',
    'A black, wide monospace with squarish bowls and ink traps where strokes meet. Blunt and technical, for headlines on a grid.',
    { weight: 0.68, width: 0.46, contrast: 0.66, mono: 1, squareness: 0.42, joints: 0.35, curve: 0.22, geoHuman: 0.2, xHeight: 0.756,
      aperture: 0.32, counter: 0.64, apex: 1, letterSpacing: 0.18, hWeight: 0.82, crossbar: 0.52, roundness: 0.38, terminalLength: 0.98,
      extenders: 0.4, descender: 0.57, overlap: 0.65, joinRound: 0.36, wordSpacing: 1, sideBearing: 0.488, classicFuture: 0.34 }),
  style('serifmono', 'mono', [], 'Serif Mono', ['sophisticated', 'vintage', 'calm'], 'Xanh Mono, Anonymous Pro, IBM Plex Mono',
    'A bookish monospace: fine bracketed serifs and real thick-and-thin strokes squeezed onto one fixed width.',
    { width: 0.12, contrast: 0.95, mono: 1, serif: true, serifSize: 0.36, serifThickness: 0.28, serifAngle: 0, terminal: 'round', geoHuman: 0.6,
      xHeight: 0.839, extenders: 0.36, vWeight: 0.46, hWeight: 1, counter: 0.86, aperture: 0, roundness: 0.13, apex: 0.5, terminalLength: 0.7,
      squareness: 0.12, descender: 0.47, overlap: 0.86, joinRound: 0.11, qForm: 'inside', tail: 1, serifBracket: 0, serifTops: 0.58, serifArms: 1,
      serifArmThickness: 0.84, wordSpacing: 1, sideBearing: 0.456, softSharp: 0.34, classicFuture: 0.18 }),
  style('boxmono', 'mono', [], 'Box Mono', ['futuristic', 'stiff', 'innovative'], 'Martian Mono, Space Mono, Major Mono Display',
    'A monospace built from boxes: straight-sided bowls whose corners round wide on the outside and stay square inside, running flat into the stems.',
    { weight: 0.54, width: 0.44, contrast: 0.48, mono: 1, bowlForm: 'box', boxRound: 0.85, bowlJoin: 'square', squareness: 1, curve: 0,
      terminalRun: 'straight', apex: 0.99, geoHuman: 0.46, xHeight: 0.756, letterSpacing: 0.12, hWeight: 0.53, counter: 0.55, crossbar: 0.52,
      roundness: 0.34, terminalLength: 0.99, descender: 0.37, tail: 0.88, serifSize: 0, serifThickness: 0, serifAngle: 1, serifBracket: 0.24,
      serifTops: 0, wordSpacing: 0, sideBearing: 0.662, classicFuture: 0.66, playfulFormal: 0.82 }),
  style('scoreboard', 'mono', ['superellipse'], 'Scoreboard Mono', ['excited', 'futuristic', 'stiff'], 'Share Tech Mono, Azeret Mono, Chakra Petch',
    'Tall, narrow numbers for a stadium scoreboard: rounded-rectangle bowls, straight-cut ends, barred I and every character on the same width.',
    { weight: 0.58, width: 0.36, height: 0.75, contrast: 0.46, mono: 1, squareness: 0.73, curve: 0.06, terminalRun: 'straight', apex: 0.99,
      iForm: 'bars', xHeight: 0.777, letterSpacing: 0.14, vWeight: 0.34, counter: 0.34, aperture: 0.18, crossbar: 0.54, extenders: 0.39,
      descender: 0.48, joinRound: 0.12, wordSpacing: 0, sideBearing: 0.819, softSharp: 0.34, classicFuture: 0.33 }),

  /* ---- Handwriting */
  style('casual', 'hand', ['handwritten', 'informal', 'monoline'], 'Casual Handwriting', ['happy', 'playful', 'childlike'], 'Caveat, Indie Flower, Shadows Into Light',
    'Quick everyday handwriting with a felt pen: narrow, a little slanted, with small flicks at the stroke ends and letters that never sit quite still.',
    { weight: 0.44, width: 0.18, height: 0.62, slant: 0.25, roundness: 0.98, terminal: 'round', wobble: 0.5, cursive: 0.3, xHeight: 0.39,
      curve: 0.7, geoHuman: 1, letterSpacing: 0.3, counter: 0.26, aperture: 0.4, crossbar: 0.88, apex: 0.96, terminalLength: 1, extenders: 0.4,
      descender: 0.46, story: 'single', joinRound: 0.04, qForm: 'sweep', tail: 0, wordSpacing: 0.483, sideBearing: 0.888, classicFuture: 0.66,
      playfulFormal: 0.54 }),
  style('upright', 'hand', ['handwritten', 'upright'], 'Hand Printed', ['childlike', 'happy', 'cute', 'sincere'], 'Patrick Hand, Gochi Hand, Mansalva',
    'Printed by hand, letter by letter. Upright and friendly, with round pen ends and wobbly lines.',
    { weight: 0.38, width: 0.29, contrast: 0.52, roundness: 1, terminal: 'round', wobble: 0.75, cursive: 0.12, xHeight: 0.711, curve: 0.79,
      geoHuman: 0.17, playfulFormal: 0.62, vWeight: 0.48, hWeight: 0.74, counter: 0.22, crossbar: 0.64, apex: 0.24, terminalLength: 0.84,
      terminalCurl: 0.46, squareness: 0.4, extenders: 0.68, descender: 0.86, overlap: 0.77, joinRound: 0.12, tail: 0, wordSpacing: 0.421,
      sideBearing: 0.488, softSharp: 0.58, classicFuture: 0.34 }),
  style('informal', 'hand', ['informal'], 'Retro Script', ['vintage', 'playful', 'artistic', 'excited'], 'Pacifico, Lobster, Yellowtail',
    'A bold, joined-up script with a retro sign-painter swing: every letter flows into the next.',
    { weight: 0.46, width: 0.21, slant: 0.45, contrast: 0.47, roundness: 0.63, terminal: 'round', wobble: 0.25, cursive: 1, xHeight: 0.486,
      curve: 0.35, geoHuman: 0.99, vWeight: 0.46, hWeight: 0.86, counter: 1, extenders: 0.81, descender: 0.7, wordSpacing: 0.362,
      sideBearing: 0.35, classicFuture: 0, playfulFormal: 0.58 }),
  style('chancery', 'hand', ['formal'], 'Formal Script', ['fancy', 'sophisticated'], 'Great Vibes, Tangerine, Pinyon Script',
    'Copperplate elegance: a steep slant, hairline upstrokes, swelling downstrokes and a tiny x-height.',
    { weight: 0.36, width: 0.32, height: 0.75, slant: 1, contrast: 0.89, terminal: 'tapered', cursive: 1,
      xHeight: 0.499, curve: 1, geoHuman: 1, letterSpacing: 0.2 }),
  style('brush', 'hand', ['brush', 'informal'], 'Brush', ['artistic', 'loud', 'excited'], 'Kaushan Script, Oregano, Mr Dafoe',
    'Fast, heavy strokes from a loaded brush. A strong lean, tapering ends and a rough, lively rhythm.',
    { weight: 0.38, width: 0.24, slant: 0.55, terminal: 'tapered', wobble: 0.3, cursive: 0.55, xHeight: 0.499, curve: 0.4, hWeight: 0.6,
      counter: 1, roundness: 0.04, extenders: 0.46, descender: 1, joinRound: 0.87, wordSpacing: 0.414, sideBearing: 0.369, softSharp: 0.14,
      classicFuture: 0.35, playfulFormal: 0.52 }),
  style('marker', 'hand', ['handwritten', 'upright', 'marker'], 'Marker', ['loud', 'playful', 'rugged', 'excited'], 'Permanent Marker, Rock Salt, Sedgwick Ave',
    'Thick, even lines from a felt marker: narrow, tall and a bit rough, leaning slightly, with round, blunt stroke ends.',
    { weight: 0.88, width: 0.52, height: 0.7, slant: 0.14, roundness: 0.99, terminal: 'sharp', wobble: 0.8, xHeight: 0.833, extenders: 0.3,
      curve: 0.54, geoHuman: 1, counter: 0.22, aperture: 0.55, letterSpacing: 0.14, hWeight: 0.66, crossbar: 0.73, apex: 0.24,
      terminalLength: 0.58, terminalForm: 'pointed', squareness: 0.08, overlap: 0.48, joinRound: 0.02, tail: 0, wordSpacing: 0.549,
      sideBearing: 0.494, classicFuture: 0.42 }),
  style('swash', 'hand', ['formal', 'swash', 'italic'], 'Swash Script', ['fancy', 'sophisticated', 'artistic'], 'Parisienne, Alex Brush, Italianno',
    'A wedding-invitation script: a steep lean, thick and thin strokes, and every stroke end wound into a curling flourish.',
    { weight: 0.4, width: 0.36, height: 0.7, slant: 0.7, contrast: 0.84, terminal: 'tapered', cursive: 1, terminalCurl: 0.61,
      xHeight: 0.55, extenders: 0.8, curve: 1, geoHuman: 1, letterSpacing: 0.2 }),
  style('italic', 'hand', ['italic', 'formal'], 'Chancery Italic', ['sophisticated', 'vintage', 'calm'], 'Cormorant Italic, Kalam, Satisfy',
    'Written with a broad-nib pen held at an angle: a narrow, springy italic with sharp thick-and-thin, angled cuts and ends that turn up in gentle hooks.',
    { width: 0.3, height: 0.65, slant: 0.3, contrast: 0.91, terminal: 'tapered', cursive: 0.4, terminalCurl: 0.59, xHeight: 0.567, extenders: 0.62,
      curve: 0.9, geoHuman: 1, aperture: 0.08, letterSpacing: 0.1, hWeight: 0.78, counter: 0.6, crossbar: 0.55, roundness: 0.44, apex: 0,
      terminalLength: 0.57, terminalForm: 'taper', squareness: 0.17, descender: 0.74, gForm: 'double', joinRound: 0.03, qForm: 'sweep', tail: 0,
      wordSpacing: 0.416, sideBearing: 0.762, softSharp: 0.84, classicFuture: 0.42, playfulFormal: 0.68 }),
  style('monoline', 'hand', ['monoline', 'informal', 'swash'], 'Monoline Script', ['happy', 'calm', 'cute', 'playful'], 'Dancing Script, Sacramento, Cookie',
    'One even pen line looping from letter to letter, with round, curly ends and a relaxed, easy lean.',
    { weight: 0.26, width: 0.22, slant: 0.35, contrast: 0.58, roundness: 0.04, terminal: 'round', cursive: 1, terminalCurl: 0.63, xHeight: 0.147,
      extenders: 0.3, curve: 0.9, geoHuman: 0.48, counter: 0.9, descender: 0.48, joinRound: 0.23, wordSpacing: 0.348, sideBearing: 0.1,
      softSharp: 0.8, classicFuture: 1, playfulFormal: 0.46 }),
  style('curly', 'hand', ['handwritten', 'upright', 'swash'], 'Curly Hand', ['cute', 'happy', 'childlike', 'playful'], 'Sniglet, Grandstander, Chilanka',
    'Bouncy, upright printing that curls up at every end, like doodled notes in the margin of a sketchbook.',
    { weight: 0.42, width: 0.34, contrast: 0.44, roundness: 1, terminal: 'round', wobble: 0.45, terminalCurl: 0.45, xHeight: 0.743, curve: 0.14,
      geoHuman: 0.34, playfulFormal: 0.51, counter: 0.78, letterSpacing: 0.22, vWeight: 0.44, hWeight: 0.76, aperture: 0.03, apex: 0.24,
      terminalLength: 0.37, squareness: 0.08, extenders: 0.54, descender: 0.56, overlap: 0.48, joinRound: 0.2, tail: 0.54, wordSpacing: 0.391,
      sideBearing: 0.587 }),
  style('signature', 'hand', ['signature', 'informal', 'monoline'], 'Signature', ['sophisticated', 'artistic', 'excited'], 'Mrs Saint Delafield, Monsieur La Doulaise, Herr Von Muellerhoff',
    'Signed at speed: a fine, fast line, a very steep lean, a tiny lowercase under towering loops and long tails that whip out past the letters.',
    { weight: 0.14, width: 0.4, height: 0.8, slant: 0.9, contrast: 0.41, terminal: 'tapered', wobble: 0.5, cursive: 1, terminalCurl: 0.64,
      terminalLength: 0.7, tail: 0.85, xHeight: 0, extenders: 0.26, curve: 1, geoHuman: 0.36, wordSpacing: 0.566, vWeight: 0.58, counter: 1,
      roundness: 0.4, descender: 1, joinRound: 0.92, sideBearing: 0.35, classicFuture: 0.49, playfulFormal: 0.66 }),
  style('blackletter', 'hand', ['blackletter'], 'Blackletter', ['vintage', 'rugged', 'fancy'], 'UnifrakturMaguntia, Pirata One, Grenze Gotisch',
    'Gothic textura from a broad pen: tall, narrow and packed close, every curve broken into straight cuts, each stem standing on a diamond.',
    { weight: 0.62, width: 0.2, height: 0.72, contrast: 0.85, chamfer: 1, squareness: 1, curve: 1, serif: true, serifShape: 'diamond', serifSize: 0.18,
      serifThickness: 0.5, serifAngle: 1, terminal: 'angled', softSharp: 1, geoHuman: 1, xHeight: 0.743, extenders: 0.45, aperture: 0.1,
      apex: 0.1, counter: 0.3, letterSpacing: 0.12 }),
  style('sketch', 'hand', ['handwritten', 'upright'], 'Sketch', ['artistic', 'playful', 'childlike'], 'Cabin Sketch, Londrina Sketch, Rubik Doodle Shadow',
    'Outlined in pencil and never inked in: each stroke drawn as a shaky double line, like letters roughed out in a sketchbook.',
    { weight: 0.46, fill: 'wire', module: 0.3, roundness: 0.56, terminal: 'round', wobble: 1, curve: 0.42, geoHuman: 0.74, xHeight: 0.73,
      letterSpacing: 0.26, aperture: 0.29, crossbar: 0.58, apex: 0.16, terminalLength: 0.7, extenders: 0.63, descender: 0.66, overlap: 0.56,
      gForm: 'double', wordSpacing: 0.394, sideBearing: 0.531 }),
  style('comic', 'hand', ['handwritten', 'upright'], 'Comic', ['childlike', 'happy', 'playful', 'sincere'], 'Comic Neue, Short Stack, Schoolbell',
    'Speech-bubble lettering: an even, round-ended pen line, upright and open, drawn neatly enough to read at any size.',
    { weight: 0.3, width: 0.38, contrast: 0.57, roundness: 0.04, terminal: 'tapered', wobble: 0.12, curve: 0.29, geoHuman: 0.62, xHeight: 0.757,
      counter: 0.52, aperture: 0.15, story: 'single', letterSpacing: 0.18, hWeight: 0.66, crossbar: 0.58, apex: 0.91, terminalLength: 0.96,
      terminalCurl: 0.45, terminalForm: 'brush', extenders: 0.42, descender: 0.52, overlap: 0.56, joinRound: 0.22, qForm: 'inside', tail: 0.57,
      wordSpacing: 0.676, sideBearing: 0.663 }),
  style('architect', 'hand', ['handwritten', 'upright'], 'Architect', ['sincere', 'calm', 'artistic'], 'Architects Daughter, Nanum Pen Script, Covered By Your Grace',
    'Neat drafting-table lettering: a fine, tall and narrow pen hand with a lowercase almost as tall as the capitals and a slight shake.',
    { weight: 0.49, width: 0.62, height: 0.72, slant: 0.04, contrast: 0.57, roundness: 0.96, terminal: 'round', wobble: 0.45, curve: 0.98,
      geoHuman: 0.94, xHeight: 0.64, extenders: 0.84, aperture: 0, letterSpacing: 0.22, hWeight: 0.52, crossbar: 0.35, apex: 0.26,
      terminalLength: 1, terminalCurl: 0.42, squareness: 0.02, descender: 1, story: 'single', overlap: 0.93, qForm: 'inside', tail: 0.53,
      wordSpacing: 0.764, sideBearing: 0.344, softSharp: 0.48, classicFuture: 0.34, playfulFormal: 0.52 }),
  style('upscript', 'hand', ['informal', 'upright'], 'Upright Script', ['cute', 'happy', 'sincere', 'playful'], 'Sofia, Oleo Script, Damion',
    'Joined-up writing that stands straight: every letter flows into the next with no lean at all, soft and round.',
    { weight: 0.32, width: 0.43, contrast: 0.42, terminal: 'round', cursive: 1, curve: 0.9, geoHuman: 0.48, xHeight: 0.509, extenders: 0.6,
      vWeight: 0.54, hWeight: 0.42, counter: 1, descender: 1, joinRound: 0.93, wordSpacing: 0.412, sideBearing: 0.1, classicFuture: 0.68,
      playfulFormal: 0.51 }),

  /* ---- Display (Wood Type is shown with the slab serifs) */
  style('woodtype', 'slab', ['slab'], 'Wood Type', ['rugged', 'vintage', 'loud'], 'Alfa Slab One, Sancreek, Rye',
    'Poster letters cut from wood for Wild West handbills: heavy, compact and squared, with chunky slabs.',
    { weight: 1, width: 0.52, height: 0.62, contrast: 0.53, serif: true, serifShape: 'slab', serifSize: 0.22, serifThickness: 1, serifAngle: 0,
      classicFuture: 0.88, xHeight: 0.651, aperture: 0, counter: 0.24, apex: 1, letterSpacing: 0.3, hWeight: 1, crossbar: 0.52, roundness: 0.45,
      curve: 0.34, terminal: 'sharp', terminalLength: 0.18, terminalForm: 'pointed', extenders: 0.35, descender: 0.65, overlap: 0.57,
      joinRound: 0.46, tail: 0.04, serifTops: 0.42, serifArms: 1, serifArmThickness: 0.72, wordSpacing: 0.309, sideBearing: 0.369, geoHuman: 0.41,
      softSharp: 0.18, playfulFormal: 0.66 }),
  style('techno', 'display', ['superellipse'], 'Techno', ['futuristic', 'loud'], 'Orbitron, Zen Dots, Audiowide',
    'Rounded rectangles instead of circles, flat peaks and a hard forward lean, like the badge on a racing car.',
    { weight: 0.58, width: 0.64, slant: 0.4, classicFuture: 0.96, xHeight: 0.783, apex: 1, terminal: 'cut', softSharp: 0.44, counter: 0.4,
      letterSpacing: 0.26, hWeight: 0.58, aperture: 0.44, crossbar: 0.45, roundness: 0.58, curve: 0, terminalLength: 0.59, terminalCurl: 0.49,
      squareness: 0.22, extenders: 0.55, descender: 0.52, overlap: 0.88, joinRound: 0.01, tail: 0.78, wordSpacing: 0.369, sideBearing: 0.369,
      geoHuman: 0.39 }),
  style('display', 'display', ['rounded'], 'Blobby', ['cute', 'happy', 'playful', 'loud', 'excited'], 'Chewy, Sour Gummy, DynaPuff',
    'As heavy as it goes, soft and puffy, like letters squeezed out of a tube. Every letter bounces to its own beat.',
    { weight: 0.72, width: 0.3, contrast: 0.49, roundness: 0.99, terminal: 'tapered', wobble: 0.4, xHeight: 0.907, counter: 0.24, aperture: 0,
      softSharp: 0.1, playfulFormal: 0.68, geoHuman: 0.41, apex: 0.22, hWeight: 1, crossbar: 0.57, curve: 0.7, terminalLength: 0.94,
      terminalForm: 'taper', squareness: 0.09, extenders: 0.42, descender: 0.78, overlap: 0.81, joinRound: 0.17, tail: 0.67, wordSpacing: 0.367,
      sideBearing: 0.294, classicFuture: 0 }),
  style('pixel', 'display', [], 'Pixel', ['futuristic', 'playful'], 'Silkscreen, Pixelify Sans, Jersey 10',
    'Rebuilt on a coarse grid of square pixels with softened corners, like an old handheld game screen.',
    { weight: 0.55, width: 0.44, squareness: 0.06, fill: 'pixels', module: 0.78, roundness: 1, apex: 1, xHeight: 0.756, counter: 0.55,
      geoHuman: 0.2, vWeight: 0.46, hWeight: 0.52, aperture: 0.06, crossbar: 0.54, curve: 0.74, terminalLength: 0.78, tail: 0, wordSpacing: 0.894,
      sideBearing: 0.95, softSharp: 0.34, playfulFormal: 0.78 }),
  style('dotmatrix', 'display', [], 'Dot Matrix', ['futuristic', 'vintage'], 'Doto, DotGothic16, Codystar',
    'Letters printed from a grid of round dots, like a departure board or an old receipt printer. Faceted corners keep it mechanical.',
    { weight: 0.44, width: 0.46, contrast: 0.52, chamfer: 0.55, fill: 'dots', module: 0.55, apex: 1, xHeight: 0.743, counter: 0.62,
      letterSpacing: 0.22, geoHuman: 0.87, vWeight: 0.48, hWeight: 0.52, aperture: 0.48, roundness: 0.18, curve: 0.04, terminalLength: 0.82,
      squareness: 0.16, extenders: 0.34, descender: 0.52, tail: 0.98, wordSpacing: 1, sideBearing: 0.575, softSharp: 0.66, classicFuture: 0.38 }),
  style('striped', 'display', [], 'Striped', ['vintage', 'loud', 'artistic', 'excited'], 'Monoton, Tilt Prism, Bungee Inline',
    'A 70s disco face made from horizontal stripes with rounded ends: the letters appear only where the lines are.',
    { weight: 0.68, width: 0.56, contrast: 0.74, squareness: 0.16, fill: 'lines', module: 0.45, roundness: 0.68, xHeight: 0.756, apex: 1,
      letterSpacing: 0.26, vWeight: 0.84, hWeight: 0.98, aperture: 0.04, crossbar: 0.34, curve: 0.28, overlap: 0.64, tail: 0, wordSpacing: 0,
      sideBearing: 0.438, geoHuman: 0.26, classicFuture: 0.66 }),
  style('octagon', 'display', [], 'Octagonal', ['futuristic', 'rugged', 'stiff'], 'Chakra Petch, Tomorrow, Bai Jamjuree',
    'Modular letters built on a square grid, after Ben Bos and Wim Crouwel: no curves at all, just straight strokes and cut corners.',
    { weight: 0.62, width: 0.4, chamfer: 0.62, apex: 1, curve: 0.08, geoHuman: 0.38, xHeight: 0.756, counter: 0.61, aperture: 0.08,
      letterSpacing: 0.22, vWeight: 0.51, hWeight: 0.74, roundness: 0.08, terminalLength: 0.91, extenders: 0.47, descender: 0.6, overlap: 0.58,
      tail: 0.54, wordSpacing: 0.435, sideBearing: 0.594, classicFuture: 0.42 }),
  style('stencil', 'display', ['geometric'], 'Stencil', ['rugged', 'loud'], 'Stardos Stencil, Allerta Stencil, Big Shoulders Stencil',
    'Heavy, tall letters with wide gaps cut where the strokes meet, so they could be sprayed through a sheet onto a crate. Round letters split in two.',
    { weight: 0.76, width: 0.46, height: 0.66, contrast: 0.62, squareness: 0.68, stencil: 0.16, curve: 0.5, geoHuman: 0.12, apex: 0.97,
      counter: 0.18, xHeight: 0.723, letterSpacing: 0.24, aperture: 0.08, crossbar: 0.6, roundness: 0.16, terminalLength: 0.52, extenders: 0.44,
      descender: 0.61, overlap: 0.94, qForm: 'sweep', tail: 0.18, wordSpacing: 0.459, sideBearing: 0.862, softSharp: 0.51 }),
  style('split', 'display', ['superellipse'], 'Split Line', ['futuristic', 'sophisticated', 'innovative'], 'Syncopate, Michroma, Krona One',
    'Ultra-wide and squared off, with a single hairline cut running through the whole line of text.',
    { weight: 1, width: 0.84, height: 0.4, contrast: 0.58, squareness: 1, slice: 0.05, apex: 0.57, xHeight: 0.781, counter: 0.82, aperture: 0.44,
      hWeight: 0.82, crossbar: 0.62, roundness: 0.03, curve: 0.15, terminalLength: 0.82, overlap: 0.8, tail: 0, wordSpacing: 0.348,
      sideBearing: 0.887, geoHuman: 0.43, classicFuture: 0.42 }),
  style('construction', 'display', ['geometric'], 'Construction', ['artistic', 'futuristic', 'innovative'], 'Bungee Outline, Train One, Kumar One Outline',
    'Drawn as the outline of every stroke, overlaps and all, like a letter still on the drawing board.',
    { weight: 0.6, contrast: 0.5, fill: 'wire', module: 0.35, curve: 0, geoHuman: 0.25, apex: 0.1, counter: 0.62, xHeight: 0.679,
      letterSpacing: 0.3 }),
  style('inline', 'display', ['geometric'], 'Inline', ['vintage', 'fancy', 'artistic'], 'Bungee Inline, Monoton, Limelight',
    'Bold geometric capitals with a fine line cut down the middle of every stroke, like Art Deco signs and theatre posters.',
    { weight: 0.78, width: 0.6, contrast: 0.5, fill: 'inline', module: 0.3, curve: 0, geoHuman: 0.2, apex: 0.2, counter: 0.6, xHeight: 0.756,
      letterSpacing: 0.3 }),
  style('shadow', 'display', ['slab'], 'Shadow', ['vintage', 'loud', 'excited'], 'Bungee Shade, Rubik Mono One, Ewert',
    'A heavy slab with a copy of each letter set down to the right behind it, a white gap between, like a circus or saloon sign.',
    { weight: 0.56, width: 0.62, contrast: 0.99, serif: true, serifShape: 'slab', serifSize: 0.2, serifThickness: 0.2, fill: 'shadow',
      module: 0.35, curve: 0.96, xHeight: 0.756, counter: 0.64, aperture: 0.05, letterSpacing: 0.3, hWeight: 0.12, crossbar: 0.39, apex: 0.99,
      terminalLength: 0.97, terminalCurl: 0.64, squareness: 1, overlap: 0.99, joinRound: 0.02, qForm: 'inside', tail: 0.51, serifAngle: 0,
      serifTops: 0.48, serifArms: 0.98, serifArmThickness: 0, wordSpacing: 0.465, sideBearing: 0.55, geoHuman: 0.82, playfulFormal: 0.65 }),
  style('reverse', 'display', [], 'Reverse Contrast', ['futuristic', 'loud', 'artistic', 'innovative'], 'Ewert, Sancreek, Rye',
    'Contrast turned on its side: fat horizontals and hairline stems. Wide, strange and made for posters.',
    { weight: 0.87, width: 0.7, contrast: 0.66, curve: 0, squareness: 0.16, apex: 0.99, xHeight: 0.717, counter: 0.02, letterSpacing: 0.26,
      hWeight: 0.66, aperture: 0.96, crossbar: 0, roundness: 0.07, terminal: 'round', terminalLength: 0.48, terminalForm: 'droplet',
      terminalSize: 0.52, tail: 0.08, wordSpacing: 0.56, sideBearing: 1, geoHuman: 0.32, softSharp: 0.46, playfulFormal: 0.98 }),
  style('hairline', 'display', ['geometric'], 'Art Deco', ['vintage', 'sophisticated', 'artistic'], 'Poiret One, Limelight, Federo',
    'Jazz-age glamour: a fine single line, geometric circles, a tiny x-height and crossbars pushed up high.',
    { weight: 0.2, width: 0.44, contrast: 0.82, curve: 0, geoHuman: 0.16, apex: 0.95, counter: 0.71, xHeight: 0.537, height: 0.62,
      letterSpacing: 0.45, wordSpacing: 0.837, vWeight: 0.26, hWeight: 0.72, roundness: 0.04, terminalLength: 0.3, squareness: 0.04,
      extenders: 0.37, descender: 0.53, overlap: 0.58, tail: 0.68, sideBearing: 0.469, softSharp: 0.38, playfulFormal: 0.74 }),
  style('neon', 'display', ['monoline', 'informal'], 'Neon Script', ['excited', 'artistic', 'vintage'], 'Neonderthaw, Tilt Neon, Beon',
    'A glowing sign bent from glass tube: a joined-up script drawn as one outlined line with round ends and curling tips.',
    { weight: 0.42, width: 0.5, slant: 0.3, contrast: 0.5, fill: 'wire', module: 0.3, roundness: 1, terminal: 'round', cursive: 1,
      terminalCurl: 0.6, xHeight: 0.646, extenders: 0.7, curve: 0.9, geoHuman: 0.75, letterSpacing: 0.12 }),
  style('creepy', 'display', [], 'Creepy', ['loud', 'rugged', 'artistic', 'excited'], 'Creepster, Nosifer, Butcherman',
    'Horror-poster lettering: tall, jittery strokes that sharpen to thorn-like points, as if scratched out by candlelight.',
    { weight: 0.72, width: 0.1, height: 0.72, slant: 0.1, contrast: 0.44, terminalLength: 0.98, softSharp: 1, wobble: 1, curve: 0.01,
      geoHuman: 0.8, xHeight: 0.781, aperture: 0.04, counter: 0.54, letterSpacing: 0.12, vWeight: 0.48, hWeight: 0.84, crossbar: 0.6, apex: 0.56,
      terminalForm: 'flared', terminalFlare: 0, overlap: 0.82, tail: 0, wordSpacing: 0.465, sideBearing: 0.638 }),
  style('speed', 'display', [], 'Speed Lines', ['futuristic', 'excited', 'loud'], 'Faster One, Bungee Shade, Racing Sans One',
    'A heavy, wide, hard-leaning face cut into horizontal streaks, like a logo for a race car moving too fast to see.',
    { weight: 0.86, width: 0.8, slant: 0.7, contrast: 0.5, squareness: 0.5, fill: 'lines', module: 0.3, apex: 0.9, xHeight: 0.781,
      counter: 0.4, aperture: 0.25, classicFuture: 0.9, letterSpacing: 0.12 }),
  style('comicbook', 'display', [], 'Comic Book', ['loud', 'excited', 'playful'], 'Bangers, Luckiest Guy, Bowlby One',
    'Sound-effect lettering from a comic panel: black, tall and narrow, leaning forward with a little wobble. POW.',
    { weight: 0.84, width: 0.24, height: 0.7, slant: 0.22, contrast: 0.69, wobble: 0.25, curve: 0.92, squareness: 0.36, xHeight: 0.833,
      extenders: 0.25, aperture: 0, counter: 0.36, apex: 1, letterSpacing: 0.14, hWeight: 0.74, crossbar: 0.82, terminalLength: 0.53,
      overlap: 0.71, tail: 0, wordSpacing: 0.311, sideBearing: 0.2, geoHuman: 0.79, playfulFormal: 0.42 }),
  style('nouveau', 'display', ['flared'], 'Art Nouveau', ['vintage', 'artistic', 'fancy'], 'Macondo, Almendra, Federo',
    'Belle Époque poster lettering, after Mucha: flowing curves, strokes that swell and taper, a small lowercase and crossbars dropped low.',
    { weight: 0.4, width: 0.4, height: 0.72, contrast: 0.85, terminal: 'tapered', terminalLength: 0.8, terminalCurl: 0.57, curve: 1,
      geoHuman: 0.9, xHeight: 0.576, extenders: 0.8, crossbar: 0.08, aperture: 0.7, apex: 0.2, letterSpacing: 0.22 }),
  style('psychedelic', 'display', ['swash'], 'Psychedelic', ['excited', 'artistic', 'vintage', 'playful'], 'Shrikhand, Kavoon, Bagel Fat One',
    'A 60s concert poster: heavy, melting letters that lean and bounce, with every stroke end curling up.',
    { weight: 1, width: 0.62, slant: 0.25, contrast: 0.64, roundness: 0.24, terminal: 'sharp', wobble: 0.45, terminalCurl: 0.52, curve: 0.51,
      geoHuman: 0.8, xHeight: 0.916, counter: 0.2, aperture: 0.17, letterSpacing: 0.14, vWeight: 0.66, hWeight: 0.82, crossbar: 0.42, apex: 1,
      terminalLength: 0.46, terminalForm: 'pointed', squareness: 0.02, extenders: 0.6, descender: 0.44, overlap: 0.35, gForm: 'double',
      joinRound: 0.3, qForm: 'sweep', tail: 0, wordSpacing: 0.13, sideBearing: 0.787, softSharp: 0.66, classicFuture: 0.38, playfulFormal: 0.68 }),
  style('bauhaus', 'display', ['geometric'], 'Bauhaus', ['artistic', 'vintage', 'innovative'], 'Righteous, Comfortaa, Baumans',
    'Built with a compass and ruler at the 1920s Bauhaus, after Herbert Bayer: wide circles, a lowercase nearly as tall as the capitals and stubby ascenders.',
    { weight: 0.66, width: 0.32, contrast: 0.45, roundness: 0.23, terminal: 'round', curve: 0, geoHuman: 0.42, aperture: 0.36, story: 'single',
      xHeight: 0.817, extenders: 0.57, counter: 0.92, apex: 1, hWeight: 0.71, terminalLength: 0.9, squareness: 0.24, descender: 0.39,
      overlap: 0.59, qForm: 'inside', tail: 0.92, wordSpacing: 0.457, sideBearing: 0.531, classicFuture: 0.44 }),
  style('heavybox', 'display', [], 'Heavy Box', ['loud', 'futuristic', 'innovative'], 'Russo One, Goldman, Orbitron',
    'Black, wide and low, drawn in boxes: bowls with big rounds outside and square counters inside, flat into the stems, like freight stencilling or a car badge.',
    { weight: 0.58, width: 0.48, height: 0.45, contrast: 0.61, bowlForm: 'box', boxRound: 0.7, bowlJoin: 'square', squareness: 1, curve: 0.01,
      terminalRun: 'straight', apex: 1, geoHuman: 0.46, xHeight: 0.807, counter: 0.55, letterSpacing: 0.06, vWeight: 0.66, hWeight: 0.84,
      crossbar: 0.48, roundness: 0.19, terminalLength: 0.65, terminalCurl: 0.46, extenders: 0.38, wordSpacing: 0.389, sideBearing: 0.4,
      classicFuture: 0.66 }),
  style('boxcontrast', 'display', [], 'Box Contrast', ['loud', 'sophisticated', 'artistic'], 'Dela Gothic One, Syne, Bricolage Grotesque',
    'A heavy box face with thinned bars: tall stems, square counters, a two-storey a and letters set nearly touching, for big posters.',
    { weight: 0.55, width: 0.66, contrast: 0.54, bowlForm: 'box', boxRound: 0.6, bowlJoin: 'square', squareness: 1, curve: 0.34,
      terminalRun: 'straight', apex: 1, story: 'double', xHeight: 0.8, counter: 0.49, letterSpacing: 0.04, vWeight: 0.82, hWeight: 1,
      crossbar: 0.44, roundness: 0.01, terminalLength: 1, extenders: 0.54, descender: 0.54, joinRound: 0.02, wordSpacing: 0.083, geoHuman: 0.48,
      classicFuture: 0.52 }),
  style('reversebox', 'display', [], 'Reverse Box', ['futuristic', 'artistic', 'innovative'], 'Michroma, Syncopate, Krona One',
    'Wide boxes with heavy bars and hairline stems: one side of A V W stands upright, M N W turn in round bends like bent wire, and the R loops into its leg.',
    { weight: 0.52, width: 0.96, contrast: 0.16, bowlForm: 'box', bowlJoin: 'square', squareness: 1, curve: 0.04, apex: 0, terminalRun: 'straight',
      diagonals: 'upright', bends: 'round', yForm: 'cup', qForm: 'inside', rForm: 'loop', kForm: 'stem', iForm: 'bars', geoHuman: 0.9,
      xHeight: 0.766, letterSpacing: 0.16, vWeight: 0.3, hWeight: 1, counter: 0.22, aperture: 0.46, roundness: 0.86, terminal: 'sharp',
      terminalLength: 0.25, terminalForm: 'pointed', extenders: 0.43, descender: 0.41, joinRound: 0.04, tail: 0.52, serifSize: 0,
      serifThickness: 0.83, serifAngle: 0, serifBracket: 0.02, serifTops: 0.18, serifArms: 0.02, serifArmThickness: 0.02, wordSpacing: 0.291,
      sideBearing: 0.606, softSharp: 0.62, classicFuture: 0.67 }),
  style('modular', 'display', ['geometric'], 'Modular', ['artistic', 'innovative', 'playful'], 'Righteous, Syne, Unbounded',
    'Drawn on a grid with compass and ruler: perfect circles, a huge lowercase, and diagonals that turn in round bends so v w z look bent from one line.',
    { weight: 0.64, width: 0.31, contrast: 0.55, bends: 'round', curve: 0, geoHuman: 0, story: 'single', terminalRun: 'straight', xHeight: 0.804,
      extenders: 0.52, counter: 0.97, aperture: 0.34, letterSpacing: 0.04, hWeight: 0.82, roundness: 0.2, apex: 0.31, terminalLength: 0.94,
      squareness: 0.07, descender: 0.42, overlap: 0.88, qForm: 'inside', tail: 0.69, wordSpacing: 0.464, sideBearing: 0.544, playfulFormal: 0.48 }),
  style('stadium', 'display', ['geometric'], 'Stadium', ['loud', 'vintage', 'excited'], 'Bungee, Days One, Righteous',
    'A black 70s poster face: wide round letters with slit counters, bowls running square into their stems and M N V W bent round at the bottom.',
    { weight: 1, width: 0.58, contrast: 0.57, bends: 'round', bowlJoin: 'square', curve: 0.8, terminalRun: 'straight', apex: 1, xHeight: 0.839,
      counter: 0.32, aperture: 0.52, letterSpacing: 0.02, vWeight: 0.66, hWeight: 0.82, crossbar: 0.58, roundness: 0.32, terminal: 'round',
      terminalLength: 0.34, terminalForm: 'droplet', squareness: 0.76, joinRound: 0.03, qForm: 'inside', tail: 0.42, wordSpacing: 0.157,
      sideBearing: 0.737, geoHuman: 0.32, softSharp: 0.48, playfulFormal: 0.66 }),
  style('stepped', 'display', [], 'Stepped', ['futuristic', 'playful', 'innovative'], 'Workbench, Jersey 10, Pixelify Sans',
    'Wide, heavy letters built on a grid, after LOTECH: square counters, soft corners, and a stroke-wide step cut out of a corner here and there, as at the foot of the L.',
    { weight: 0.32, width: 0, hWeight: 0.84, bowlForm: 'box', boxRound: 0.12, bowlJoin: 'square', squareness: 1, curve: 0.04, steps: 1,
      roundness: 0.5, terminalRun: 'straight', apex: 0.36, iForm: 'bars', xHeight: 0.66, extenders: 0.42, counter: 0.32, aperture: 0.3,
      letterSpacing: 0.1, vWeight: 0.66, crossbar: 0.62, terminal: 'tapered', terminalLength: 1, terminalForm: 'taper', descender: 0.1, tail: 0.78,
      wordSpacing: 0.853, sideBearing: 0.525, geoHuman: 0.54, classicFuture: 0.62, playfulFormal: 0.38,
      glyphs: { O: { cornerSteps: { '0t1': 0, '0t3': 0 } }, 0: { cornerSteps: { '0t1': 0, '0t3': 0 } }, g: { cornerSteps: { '0t1': 0 } } } }),
  style('hairbox', 'display', [], 'Hairline Box', ['futuristic', 'sophisticated', 'innovative'], 'Syncopate, Michroma, Tektur',
    'A hairline drawn in rounded rectangles: A, M and N arch over, V and W cup, and wherever strokes meet the corner fills in with a curved wedge of ink.',
    { weight: 0.34, width: 1, height: 0.7, squareness: 0.98, curve: 0.17, innerRound: 0.55, diagonals: 'arch', kForm: 'stem', yForm: 'cup',
      apex: 1, terminalRun: 'straight', iForm: 'bars', xHeight: 0.839, counter: 0.6, letterSpacing: 0.05, vWeight: 0.54, aperture: 0.02,
      crossbar: 0.82, roundness: 0.34, terminalLength: 0.93, terminalCurl: 0.51, overlap: 0.98, tail: 0, wordSpacing: 0.554, sideBearing: 1,
      geoHuman: 0.57 }),
  style('pinched', 'display', ['geometric'], 'Pinched', ['artistic', 'innovative', 'sophisticated'], 'Syne, Unbounded, Righteous',
    'Heavy geometric letters pinched to a point halfway up the lowercase: stems become hourglasses and round bowls wrap almond-shaped counters, after aplo.',
    { weight: 0.76, width: 0.8, contrast: 0.51, pinch: 1, curve: 0, geoHuman: 0, story: 'single', xHeight: 0.871, extenders: 0.54, counter: 0.92,
      overlap: 0.5, letterSpacing: 0.15, vWeight: 0.66, hWeight: 0.82, aperture: 0.18, crossbar: 0.37, roundness: 0.2, apex: 0.64,
      terminalLength: 1, squareness: 0.2, descender: 0.38, joinRound: 0.76, tail: 0, wordSpacing: 0.149, sideBearing: 0.2 })
];

/* The style page's cards, in the order they are shown under each Category heading: one base font for
   each build of letters the sliders can't reach from another, chosen for its many weights and italics,
   since a setting moves the letters furthest and cleanest from a family's own nearest weight. Each was
   kept because a near card rebuilt from it with its own settings broke up (heavy and wide, fat face,
   heavy slab, slab mono, the italic); the rest are left out, as those rebuilt cleanly from a card here,
   and the display looks (box bowls, octagons, pinches, steps, hairlines) are settings over these.
   Every card is solid letters. Styles left out stay defined, so designs saved from them still open. */
const PAGE_ORDER = [
  // Sans Serif: the everyday text faces, then rounded and squared, then the wide and the heavy rounded
  'grotesque', 'humanist', 'geometric', 'soft', 'industrial', 'squircle', 'chunkyround',
  // Serif: transitional and old style book type, then the didone, its italic and its fat face
  'serif', 'oldstyle', 'didone', 'serifitalic', 'fatface',
  'softslab', 'woodtype',
  'code', 'typewriter',
  // Calligraphy: printing, handwriting, a retro and a formal script, and blackletter
  'comic', 'casual', 'informal', 'chancery', 'blackletter'
];
export const PAGE_STYLES = PAGE_ORDER.map(id => STYLES.find(s => s.id === id)!);

export const GROUPS: Record<GroupId, string> = { proportion: 'Proportions', shape: 'Shapes', details: 'Details' };
/* The pages, in the order of the navigation. The pages of a group sit together, under its name.
   They run in the order a design is made, each page fine-tuning what the ones above it set: the
   starting style, then the proportions
   (how heavy, how big, how tall, how open and how far apart the letters are), then the shapes of their
   curves, corners, ends and serifs, and last the details: single letters, the hand and the effects.
   `hint` says in a few words what the page holds; it is the page's tooltip, and search reads it too. */
export const CATEGORIES: { id: CategoryId; label: string; hint: string; group?: GroupId }[] = [
  { id: 'style', label: 'Style', hint: 'Pick a typeface to start from' },
  { id: 'weight', label: 'Weight & contrast', hint: 'Thick or thin strokes, and the difference between them', group: 'proportion' },
  { id: 'size', label: 'Size & slant', hint: 'Width, height, slant, rotation and mirroring', group: 'proportion' },
  { id: 'heights', label: 'Heights', hint: 'Lowercase height, ascenders, descenders, tails and crossbars', group: 'proportion' },
  { id: 'insides', label: 'Inner space', hint: 'The space inside letters and how open their mouths are', group: 'proportion' },
  { id: 'spacing', label: 'Spacing', hint: 'Space between letters and words, monospace', group: 'proportion' },
  { id: 'curves', label: 'Build & curves', hint: 'Strokes or blocks, round or square bowls, facets and joins', group: 'shape' },
  { id: 'corners', label: 'Corners', hint: 'Round or sharp corners, peaks, steps and ink traps', group: 'shape' },
  { id: 'ends', label: 'Stroke ends', hint: 'How the free ends of strokes finish', group: 'shape' },
  { id: 'serifs', label: 'Serifs', hint: 'Feet on the strokes: shape, tips, base and sides', group: 'shape' },
  { id: 'letters', label: 'Letters', hint: 'Other shapes for a, g, k, Q, R, s, Y and more', group: 'details' },
  { id: 'script', label: 'Handwriting', hint: 'Cursive strokes, a wobbly hand and swash capitals', group: 'details' },
  { id: 'effects', label: 'Effects', hint: 'Outlines, pixels, dots, stencil and slice', group: 'details' }
];
/** Links from before the pages were regrouped name these groups, or the Personality page, since removed. */
const OLD_GROUPS: Record<string, CategoryId> = { structure: 'weight', proportion: 'heights', personality: 'weight' };
/** The page `id` names: a page itself, or a group, which opens on its first page. */
export const pageOf = (id: string | null | undefined): CategoryId | undefined =>
  (CATEGORIES.find(c => c.id === id) ?? (id ? CATEGORIES.find(c => c.id === OLD_GROUPS[id]) : undefined) ?? CATEGORIES.find(c => c.group === id))?.id;

/* The controls, in the order each page shows them, and the sliders nested under them: read off each setting's
   spec (shared/params/spec.ts), where their words are. label = the control's short title; friendly = what it
   does in plain words; tech = the typographer's term. */
export const CONTROLS = Object.fromEntries(PARAM_KEYS.flatMap(k => {
  const c = (SPECS[k] as { control?: ControlDef }).control;
  return c ? [[k, c]] : [];
})) as Record<ControlKey, ControlDef>;
const subSpec = (k: string) => (SPECS[k as keyof typeof SPECS] as { sub?: SubControlDef & { parent: string } }).sub;
/** The sliders nested under control `parent`, in their order. */
const subsOf = <P extends ControlKey>(parent: P) => Object.fromEntries(PARAM_KEYS.flatMap(k => {
  const s = subSpec(k);
  if (!s || s.parent !== parent) return [];
  const { parent: _, ...def } = s;
  return [[k, def]];
})) as Record<SubKeyOf<P>, SubControlDef>;
/** The controls that shape letters built from blocks (see blocks.ts): their size, weight and corners, the
    hand, spacing and the effects that run on any outline. The rest shape strokes, which blocks don't have. */
export const BLOCK_CONTROLS: readonly ControlKey[] = ['weight', 'width', 'height', 'slant', 'rotation', 'build', 'roundness', 'mirror', 'wobble',
  'xHeight', 'letterSpacing', 'wordSpacing', 'mono', 'sideBearing', 'fill', 'slice'];
export const SERIF_SUBS = subsOf('serif');
/** The sliders every serif shape has, and the finer ones of each shape, shown while that shape is picked. */
export const SERIF_SIZES: SerifSubKey[] = ['serifSize', 'serifThickness', 'serifAngle'];
export const SERIF_DETAILS: Record<SerifShape, SerifSubKey[]> = { bracketed: ['serifBracket'], unbracketed: [], slab: [], wedge: [], diamond: [] };
export const SERIF_TIP_SUBS = subsOf('serifTip');
/** The finer shape sliders of each kind of serif tip, shown while that kind is picked. */
export const SERIF_TIP_DETAILS: Record<SerifTip, SerifTipSubKey[]> = { square: [], round: ['serifTipRound'], pointed: [], angled: ['serifTipSlant'] };
export const SERIF_BASE_SUBS = subsOf('serifBase');
export const SERIF_INNER_SUBS = subsOf('serifInner');
export const SERIF_ARM_SUBS = subsOf('serifArms');
export const FILL_SUBS = subsOf('fill');
export const TERMINAL_SUBS = subsOf('terminal');
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
export const DOT_SUBS = subsOf('dots');
export const BOWL_SUBS = subsOf('bowlForm');
export const WEIGHT_SUBS = subsOf('weight');
export const ROUND_SUBS = subsOf('roundness');
export const PINCH_SUBS = subsOf('pinch');
export const CROSSBAR_SUBS = subsOf('crossbar');
export const STENCIL_SUBS = subsOf('stencil');
export const SLICE_SUBS = subsOf('slice');
/** Every nested slider, whichever control it sits under. */
export const SUBS = { ...SERIF_SUBS, ...SERIF_TIP_SUBS, ...SERIF_BASE_SUBS, ...SERIF_INNER_SUBS, ...SERIF_ARM_SUBS, ...FILL_SUBS, ...TERMINAL_SUBS, ...DOT_SUBS,
  ...BOWL_SUBS, ...WEIGHT_SUBS, ...ROUND_SUBS, ...PINCH_SUBS, ...CROSSBAR_SUBS, ...STENCIL_SUBS, ...SLICE_SUBS } as Record<SubKey, SubControlDef>;
export const STORY_OPTIONS: [Exclude<Story, 'auto'>, string][] = [['double', 'Double'], ['single', 'Single']];
/** The letter-shape pickers: each option is drawn as the letter `ch` in that shape. */
export type FormKey = 'build' | 'mirror' | 'gForm' | 'kForm' | 'iForm' | 'sForm' | 'diagonals' | 'yForm' | 'qForm' | 'rForm' | 'scriptForm' | 'flourish' | 'bowlForm' | 'bends' | 'bowlJoin' | 'dots' | 'terminalRun' | 'aForm';
export const FORM_OPTIONS: { [K in FormKey]: { ch: string; options: [Exclude<Params[K], 'auto'>, string][] } } = {
  build: { ch: 'E', options: [['strokes', 'Strokes'], ['blocks', 'Blocks']] as [Build, string][] },
  gForm: { ch: 'g', options: [['hook', 'Hook'], ['mirrored', 'Mirrored'], ['double', 'Two-storey']] as [GForm, string][] },
  kForm: { ch: 'k', options: [['arm', 'From arm'], ['stem', 'From stem'], ['bar', 'On a bar']] as [KForm, string][] },
  iForm: { ch: 'i', options: [['plain', 'Plain'], ['bars', 'Bars']] as [Exclude<IForm, 'auto'>, string][] },
  sForm: { ch: 's', options: [['curved', 'Curved'], ['flat', 'Flat spine']] as [SForm, string][] },
  diagonals: { ch: 'A', options: [['symmetric', 'Symmetric'], ['upright', 'Upright'], ['arch', 'Arches']] as [Diagonals, string][] },
  mirror: { ch: 'e', options: [['normal', 'As drawn'], ['mirrored', 'Mirrored']] as [Mirror, string][] },
  yForm: { ch: 'Y', options: [['forked', 'Forked'], ['cup', 'Cup']] as [YForm, string][] },
  qForm: { ch: 'Q', options: [['crossing', 'Crossing'], ['inside', 'Inside'], ['sweep', 'Sweep']] as [QForm, string][] },
  rForm: { ch: 'R', options: [['leg', 'Leg'], ['loop', 'Loop']] as [RForm, string][] },
  scriptForm: { ch: 'R', options: [['print', 'Print'], ['script', 'Script']] as [Exclude<ScriptForm, 'auto'>, string][] },
  flourish: { ch: 'd', options: [['plain', 'Plain'], ['swash', 'Swash']] as [Flourish, string][] },
  bowlForm: { ch: 'O', options: [['oval', 'Oval'], ['box', 'Box']] as [BowlForm, string][] },
  bends: { ch: 'N', options: [['sharp', 'Sharp'], ['round', 'Round']] as [Bends, string][] },
  terminalRun: { ch: 'c', options: [['curved', 'Curved'], ['straight', 'Straight']] as [TerminalRun, string][] },
  bowlJoin: { ch: 'd', options: [['curved', 'Curved'], ['square', 'Square']] as [BowlJoin, string][] },
  dots: { ch: 'i', options: [['square', 'Square'], ['round', 'Round']] as [Exclude<Dots, 'auto'>, string][] },
  aForm: { ch: 'a', options: [['plain', 'Plain'], ['spur', 'Spur']] as [AForm, string][] }
};
export const FILL_OPTIONS: [Fill, string][] = [['solid', 'Solid'], ['wire', 'Wireframe'], ['pixels', 'Pixels'], ['dots', 'Dots'], ['lines', 'Lines'], ['inline', 'Inline'], ['outline', 'Outline'], ['shadow', 'Shadow']];
export const TERMINAL_OPTIONS: [Terminal, string][] = [['flat', 'Flat'], ['round', 'Rounded'], ['sharp', 'Sharp'], ['angled', 'Angled'], ['cut', 'Cut'], ['tapered', 'Tapered']];
export const SERIF_SHAPE_OPTIONS: [SerifShape, string][] = [['bracketed', 'Bracketed'], ['unbracketed', 'Unbracketed'], ['slab', 'Slab'], ['wedge', 'Wedge'], ['diamond', 'Diamond']];
export const SERIF_TIP_OPTIONS: [SerifTip, string][] = [['square', 'Square'], ['round', 'Round'], ['pointed', 'Pointed'], ['angled', 'Angled']];
export const SERIF_BASE_OPTIONS: [SerifBase, string][] = [['flat', 'Flat'], ['cupped', 'Cupped']];
/** Where a crossbar's Gap opens: the bar stopping short of the strokes it meets, or running through them, cut free above and below. */
export const BAR_END_OPTIONS: [BarEnds, string][] = [['short', 'Short'], ['through', 'Through']];
export const SERIF_SIDE_OPTIONS: [SerifSide, string][] = [['both', 'Both'], ['left', 'Left'], ['right', 'Right'], ['inside', 'Inside'], ['outside', 'Outside']];
export const SERIF_INNER_OPTIONS: [SerifInner, string][] = [['same', 'Same'], ...SERIF_SHAPE_OPTIONS];

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
  corner: ['Corner', 'Where a stroke turns, or a corner of a stroke end.'],
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
  crossbar: 'crossbar', bar: 'crossbar', counter: 'counter', terminal: 'terminal', corner: 'roundness', join: 'stencil',
  apex: 'apex', vertex: 'apex', serif: 'serif', entry: 'cursive',
  xHeight: 'xHeight', capHeight: 'height', ascender: 'extenders', descender: 'extenders'
};

export const TEXTS = {
  sentence: 'If you can design one thing, you can design everything.'
};

export const styleById = (id: string | null | undefined) => STYLES.find(s => s.id === id);
/** The picked tags of each facet; an empty list means no filter on that facet. `query` is typed search words. */
export interface StyleFilter { groups: StyleGroup[]; kinds: Kind[]; moods: Mood[]; query?: string }
/** Faceted like Google Fonts: any of the picked tags within a facet, every facet at once. `looks`
    are the style's Appearance as shown, which traits laid over it may change, for search to find. */
export const styleMatches = (s: StyleDef, f: StyleFilter, looks: Look[] = s.looks) =>
  (!f.groups.length || f.groups.includes(s.group)) && (!f.moods.length || s.moods.some(m => f.moods.includes(m))) &&
  (!f.kinds.length || s.kinds.some(k => f.kinds.includes(k))) && searchMatches(s, f.query ?? '', looks);

/** Everything a search can find a style by: its name, genre, feelings, looks, description and the Google Fonts families like it. */
const words = (s: StyleDef, looks: Look[]) => [
  s.name, STYLE_GROUPS.find(g => g.id === s.group)!.label, s.like, s.desc,
  ...s.kinds.map(k => KIND_SECTIONS.flatMap(x => x.tags).find(t => t.id === k)!.label),
  ...s.moods.map(m => MOODS.find(x => x.id === m)!.label), ...looks.map(l => LOOKS.find(x => x.id === l)!.label)
].join(' ');
const normal = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')}`;
/** Every word typed starts a word somewhere in the style (so "futura", "round mono" and "heavy slab" all work). */
export const searchMatches = (s: StyleDef, query: string, looks: Look[] = s.looks) => {
  const q = normal(query).split(' ').filter(Boolean);
  if (!q.length) return true;
  const w = normal(words(s, looks));
  return q.every(t => w.includes(` ${t}`));
};
/** The Appearance tags a set of params shows. */
export function looksOf(p: Params): Look[] { const e = resolve(p); return LOOKS.filter(l => l.test(e)).map(l => l.id); }

/** The starting style each Feeling chip is set in: one that carries the feeling. */
export const TAG_FACE: Record<Mood, string> = {
  business: 'grotesque', calm: 'humanist', happy: 'soft', playful: 'comic', cute: 'chunkyround', childlike: 'casual',
  fancy: 'didone', sophisticated: 'chancery', artistic: 'serifitalic', loud: 'fatface', rugged: 'woodtype', vintage: 'typewriter',
  futuristic: 'industrial', sincere: 'softslab', excited: 'informal', innovative: 'squircle', stiff: 'code'
};

/** First control of each category, opened when the category is picked. */
export const firstControl = (cat: CategoryId) =>
  (Object.keys(CONTROLS) as ControlKey[]).find(k => CONTROLS[k].cat === cat) ?? 'weight';

/** The control a key belongs to: a nested slider's parent (serif sub-sliders fold into 'serif', the module
    size into 'fill', the stroke end length into 'terminal'), else the key itself. */
export const controlFor = (key: ActiveKey): ControlKey => (subSpec(key)?.parent as ControlKey | undefined) ?? (key as ControlKey);

/* ---------- finding a setting by name */

/** Words people reach for that a control's own copy doesn't use. */
const ALSO: Partial<Record<ActiveKey, string>> = {
  weight: 'bold heavy light thick thin black', slant: 'italic oblique lean', width: 'condensed expanded narrow wide', height: 'cap height size tall',
  rotation: 'rotate turn angle', mirror: 'flip reverse backwards', contrast: 'thick thin stress', letterSpacing: 'kerning tracking',
  mono: 'typewriter code fixed width', wobble: 'rough sketchy organic jitter', cursive: 'script connected joined', flourish: 'swash flourish stylistic alternate ornament heart loop', swell: 'pressure shade pointed pen nib copperplate taper', fill: 'outline texture pattern halftone',
  terminal: 'tip ending finish', serif: 'feet slab', roundness: 'soft rounded radius', xHeight: 'lowercase', counter: 'bowl inside',
  aperture: 'opening mouth', extenders: 'ascender descender', build: 'blocks stroke construction', stencil: 'gap cut break', slice: 'cut line split',
  squareness: 'squircle', chamfer: 'octagon angular', joints: 'traps notch', swash: 'flourish', dots: 'tittle period i j'
};

export interface SettingHit {
  key: ActiveKey;
  /** the page it is on */
  page: Exclude<CategoryId, 'style'>;
  label: string;
  /** the control a nested slider sits under */
  parent?: string;
  /** the named shape the search found it by, as Slab under Serifs */
  option?: string;
}

type Entry = SettingHit & { fields: [string, number][]; shapes: string[] };
const terms = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** Whether every word of `q` starts a word of `text` (both already lowercase, split by spaces). */
const covers = (text: string, q: string[]) => q.every(w => ` ${text}`.includes(` ${w}`));
const opt = (list: readonly (readonly [string, string])[]) => list.map(o => o[1]);

let INDEX: Entry[] | null = null;
function settingIndex(): Entry[] {
  if (INDEX) return INDEX;
  // the named shapes each control lets you pick
  const shapes: Partial<Record<ControlKey, string[]>> = {
    terminal: [...opt(TERMINAL_OPTIONS), ...Object.values(TERMINAL_FORM_LABELS), ...opt(FORM_OPTIONS.terminalRun.options)],
    serif: opt(SERIF_SHAPE_OPTIONS), serifTip: opt(SERIF_TIP_OPTIONS), serifBase: opt(SERIF_BASE_OPTIONS), serifSides: opt(SERIF_SIDE_OPTIONS),
    serifInner: opt(SERIF_INNER_OPTIONS), story: [...opt(STORY_OPTIONS), ...opt(FORM_OPTIONS.aForm.options)], fill: opt(FILL_OPTIONS), crossbar: opt(BAR_END_OPTIONS)
  };
  for (const k of Object.keys(FORM_OPTIONS) as FormKey[]) if (k in CONTROLS) shapes[k as ControlKey] = opt(FORM_OPTIONS[k].options);
  const pageName = (c: ControlKey) => CATEGORIES.find(x => x.id === CONTROLS[c].cat)!.label;
  const entries: Entry[] = (Object.keys(CONTROLS) as ControlKey[]).map(k => {
    const c = CONTROLS[k], named = [...new Set(shapes[k] ?? [])];
    return { key: k, page: c.cat, label: c.label, shapes: named, fields: [[c.label, 100], [ALSO[k] ?? '', 85], [c.tech, 60], [c.friendly, 50],
      [`${c.lo ?? ''} ${c.hi ?? ''}`, 40], [named.join(' '), 65], [pageName(k), 20], [c.explain, 10]] };
  });
  for (const k of Object.keys(SUBS) as (keyof typeof SUBS)[]) {
    const d = SUBS[k], parent = controlFor(k), c = CONTROLS[parent];
    // a stencil's and a slice's thickness is their own value: the control itself already stands for it
    if (parent === k) continue;
    entries.push({ key: k, page: c.cat, label: d.label, parent: c.label, shapes: [], fields: [[`${c.label} ${d.label}`, 80], [ALSO[k] ?? '', 85], [d.tech, 60],
      [d.friendly, 50], [`${d.lo} ${d.hi}`, 30], [pageName(parent), 15]] });
  }
  return (INDEX = entries.map(e => ({ ...e, fields: e.fields.map(([t, w]) => [terms(t).join(' '), w] as [string, number]) })));
}

/** The settings whose words start with every word of `query`, best first: a match in a setting's
    name beats one in its description, and an earlier page breaks ties. A named shape the setting
    was found by, rather than its name, comes back as `option` (Slab, under Serifs). */
export function findSettings(query: string, limit = 12): SettingHit[] {
  const q = terms(query);
  if (!q.length) return [];
  const order = (h: SettingHit) => CATEGORIES.findIndex(c => c.id === h.page);
  const hits: (SettingHit & { score: number })[] = [];
  for (const e of settingIndex()) {
    let score = 0;
    for (const w of q) {
      const best = Math.max(0, ...e.fields.filter(([text]) => covers(text, [w])).map(([, weight]) => weight));
      if (!best) { score = 0; break; }
      score += best;
    }
    if (!score) continue;
    const label = e.fields[0][0];
    if (label.startsWith(q.join(' '))) score += 30;
    const option = covers(label, q) ? undefined : e.shapes.find(n => covers(terms(n).join(' '), q));
    hits.push({ key: e.key, page: e.page, label: e.label, parent: e.parent, option, score });
  }
  return hits.sort((a, b) => b.score - a.score || order(a) - order(b)).slice(0, limit).map(({ score: _, ...h }) => h);
}
