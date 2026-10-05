/* Starting styles, navigation, and the plain-language description of every control.
   Shared by the client (UI copy) and the server (validating style ids). */
import { resolve, type Effective } from './engine/font';
import { DEFAULTS, type AForm, type BarEnds, type Mirror, type Bends, type Build, type BowlForm, type BowlJoin, type Diagonals, type Dots, type Fill, type GForm, type IForm, type KForm, type SForm, type Params, type QForm, type RForm, type SerifBase, type SerifInner, type SerifShape, type SerifSide, type SerifTip, type Story, type Terminal, type TerminalForm, type TerminalRun, type YForm } from './params';

/** A page of the editor: Style, or one set of controls. */
export type CategoryId = 'style' | 'weight' | 'size' | 'heights' | 'insides' | 'curves' | 'corners' | 'ends' | 'serifs' | 'letters' | 'script'
  | 'spacing' | 'effects';
/** An area of the design with several pages, listed under it in the navigation. */
export type GroupId = 'proportion' | 'shape' | 'details';
export type ControlKey =
  | 'weight' | 'width' | 'height' | 'slant' | 'rotation' | 'contrast' | 'pinch'
  | 'build' | 'roundness' | 'curve' | 'squareness' | 'chamfer' | 'steps' | 'swash' | 'mirror' | 'terminal' | 'story' | 'gForm' | 'kForm' | 'iForm' | 'sForm' | 'diagonals' | 'yForm' | 'qForm' | 'rForm' | 'bowlForm' | 'bowlJoin' | 'overlap' | 'dots' | 'serif' | 'serifTip' | 'serifBase' | 'serifSides' | 'serifInner' | 'serifBalance' | 'serifTops' | 'serifArms' | 'apex' | 'bends' | 'joints' | 'cursive' | 'wobble'
  | 'xHeight' | 'extenders' | 'descender' | 'tail' | 'counter' | 'aperture' | 'crossbar'
  | 'letterSpacing' | 'wordSpacing' | 'mono' | 'sideBearing'
  | 'fill' | 'stencil' | 'slice';
export type SerifSubKey = 'serifSize' | 'serifThickness' | 'serifAngle' | 'serifBracket';
export type SerifTipSubKey = 'serifTipRound' | 'serifTipSlant';
export type SerifBaseSubKey = 'serifCup';
export type SerifInnerSubKey = 'serifInnerSize' | 'serifInnerThickness';
export type SerifArmSubKey = 'serifArmThickness' | 'serifArmLean';
export type FillSubKey = 'module';
export type TerminalSubKey = 'terminalLength' | 'terminalCurl' | 'terminalFlare' | 'terminalDepth' | 'terminalSize' | 'terminalRound' | 'terminalPoint' | 'terminalClip' | 'terminalLean' | 'terminalSlope' | 'terminalTilt' | 'terminalTip' | 'terminalTaper';
/** Anything the control panel can focus: a control or one of its nested sub-sliders. */
export type DotSubKey = 'dotSize';
export type BowlSubKey = 'boxRound';
export type WeightSubKey = 'vWeight' | 'hWeight';
export type RoundSubKey = 'joinRound' | 'innerRound';
export type PinchSubKey = 'pinchPos';
export type CrossbarSubKey = 'barGap';
/** A stencil's and a slice's own value is their thickness, so it sits among their sub-sliders. */
export type StencilSubKey = 'stencil' | 'stencilPos' | 'stencilRound';
export type SliceSubKey = 'slice' | 'slicePos' | 'sliceRound';
export type ActiveKey = ControlKey | SerifSubKey | SerifTipSubKey | SerifBaseSubKey | SerifInnerSubKey | SerifArmSubKey | FillSubKey | TerminalSubKey | DotSubKey | BowlSubKey | WeightSubKey | RoundSubKey | PinchSubKey | CrossbarSubKey | StencilSubKey | SliceSubKey;

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
export interface SubControlDef { label: string; friendly: string; tech: string; lo: string; hi: string; bipolar?: boolean }

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
  { id: 'outline', label: 'Outline', hint: 'Drawn as lines, not filled in', test: e => e.fill === 'wire' },
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
    { weight: 0.24, width: 0.52, contrast: 0.5, curve: 0, geoHuman: 0.15, apex: 0, counter: 0.7, xHeight: 0.34, extenders: 0.85,
      aperture: 0.45, overlap: 0, story: 'single', letterSpacing: 0.24 }),
  style('grotesque', 'sans', ['neogrotesque'], 'Neo Grotesque', ['calm', 'business', 'stiff'], 'Roboto, Inter, Work Sans',
    'The Swiss workhorse, set bold and tight. A tall lowercase, closed-in openings and level stroke endings make it dense and matter-of-fact.',
    { weight: 0.62, width: 0.46, contrast: 0.51, curve: 0.1, geoHuman: 0.4, aperture: 0.1, xHeight: 0.72, extenders: 0.35, apex: 0.62,
      counter: 0.44, letterSpacing: 0.12 }),
  style('humanist', 'sans', ['humanist'], 'Humanist', ['business', 'calm', 'sincere'], 'Open Sans, Source Sans 3, Fira Sans',
    'Shaped like writing with a pen: wide-open letterforms, angled stroke ends, gentle contrast and a human rhythm.',
    { weight: 0.46, width: 0.44, contrast: 0.62, curve: 0.7, geoHuman: 1, terminal: 'angled', xHeight: 0.5, extenders: 0.62, aperture: 0.95,
      apex: 0.45, story: 'double', letterSpacing: 0.2 }),
  style('condensed', 'sans', ['grotesque'], 'Condensed', ['loud', 'rugged', 'stiff'], 'Oswald, Bebas Neue, Anton',
    'Black, tall and squeezed as narrow as it goes. Fits long headlines into tight columns without losing punch.',
    { weight: 0.7, width: 0.16, height: 0.85, xHeight: 0.72, extenders: 0.3, contrast: 0.52, aperture: 0.2, squareness: 0.25,
      classicFuture: 0.6, apex: 0.75, counter: 0.36, letterSpacing: 0.22 }),
  style('soft', 'sans', ['rounded'], 'Rounded', ['calm', 'happy', 'cute'], 'Nunito, Varela Round, Quicksand',
    'Light and round-ended, with big airy counters and generous spacing. Easy-going and friendly.',
    { weight: 0.3, width: 0.66, contrast: 0.5, roundness: 1, terminal: 'round', xHeight: 0.62, counter: 0.72, aperture: 0.6, softSharp: 0.3,
      playfulFormal: 0.4, geoHuman: 0.35, apex: 0.6, story: 'single', letterSpacing: 0.26 }),
  style('extended', 'sans', ['superellipse'], 'Squared', ['futuristic'], 'Michroma, Oxanium, Rajdhani',
    'A fine line stretched extra wide, with round letters drawn as squarish ovals and plenty of air between them. Precise and technical.',
    { weight: 0.2, width: 0.95, contrast: 0.5, curve: 0, squareness: 0.7, classicFuture: 0.8, xHeight: 0.52, apex: 0.8, counter: 0.52,
      letterSpacing: 0.34 }),
  style('tightgeo', 'sans', ['geometric'], 'Tight Geometric', ['loud', 'sophisticated'], 'Outfit, Urbanist, Lexend',
    'A black 70s logotype sans after Herb Lubalin: perfect circles, a single-storey a, towering ascenders and letters packed so close they nearly touch.',
    { weight: 0.78, width: 0.58, contrast: 0.5, curve: 0, geoHuman: 0.1, apex: 0.1, counter: 0.74, xHeight: 0.66, extenders: 1, aperture: 0.35,
      letterSpacing: 0.05 }),
  style('squircle', 'sans', ['superellipse'], 'Superellipse', ['futuristic', 'calm', 'innovative'], 'Unbounded, Syne, Lexend Zetta',
    'Chunky squircle bowls, halfway between a circle and a square, with rounded ends and strokes that pinch in where they meet. Soft but engineered.',
    { weight: 0.68, width: 0.58, contrast: 0.5, squareness: 0.7, joints: 0.55, roundness: 0.5, terminal: 'round', curve: 0, geoHuman: 0.35,
      apex: 0.7, xHeight: 0.62, counter: 0.6, letterSpacing: 0.2 }),
  style('inktrap', 'sans', ['grotesque'], 'Ink Trap', ['loud', 'artistic', 'innovative'], 'Bricolage Grotesque, Syne, Darker Grotesque',
    'A heavy display grotesque with deep ink traps: strokes narrow sharply where they branch, so the black letters stay open.',
    { weight: 0.8, width: 0.58, contrast: 0.68, squareness: 0.45, joints: 1, curve: 0.1, geoHuman: 0.4, apex: 0.6, xHeight: 0.6,
      aperture: 0.3, counter: 0.4, letterSpacing: 0.14 }),
  style('flared', 'sans', ['flared'], 'Flared', ['sophisticated', 'vintage'], 'Marcellus, Julius Sans One, Philosopher',
    'A sans serif carved like stone lettering: fine strokes swell toward their ends, with a small lowercase, high crossbars and airy spacing.',
    { weight: 0.32, width: 0.54, contrast: 0.79, terminal: 'tapered', terminalLength: 0.62, curve: 0.4, geoHuman: 0.65, classicFuture: 0.3,
      xHeight: 0.36, extenders: 0.7, aperture: 0.65, apex: 0.3, crossbar: 0.6, letterSpacing: 0.3 }),
  style('gothic', 'sans', ['grotesque'], 'Grotesk', ['business', 'rugged', 'sincere'], 'Libre Franklin, Archivo, Public Sans',
    'An American gothic after Franklin: sturdy and a little rough, with a two-storey a and g, slight contrast and stroke ends that pinch in.',
    { weight: 0.58, width: 0.44, contrast: 0.58, curve: 0.25, geoHuman: 0.55, joints: 0.2, story: 'double', xHeight: 0.56, extenders: 0.5,
      aperture: 0.35, apex: 0.5, counter: 0.42, letterSpacing: 0.16 }),
  style('wide', 'sans', ['neogrotesque'], 'Extra Wide', ['loud', 'innovative', 'business'], 'Archivo Expanded, Dela Gothic One, Krona One',
    'A black grotesque stretched as wide as it goes and set tight: short, flat and heavy, like a sports or streetwear logo.',
    { weight: 0.86, width: 1, height: 0.38, contrast: 0.52, curve: 0.1, squareness: 0.2, geoHuman: 0.35, xHeight: 0.7, extenders: 0.3,
      aperture: 0.2, apex: 0.7, counter: 0.36, letterSpacing: 0.08 }),
  style('industrial', 'sans', ['superellipse'], 'Industrial', ['business', 'stiff', 'futuristic'], 'Barlow, Saira, Encode Sans',
    'A road-sign sans after DIN: engineered from straight sides and squarish curves, with a big lowercase, level stroke ends and even spacing.',
    { weight: 0.5, width: 0.42, contrast: 0.5, squareness: 0.45, curve: 0, geoHuman: 0.3, apex: 0.7, xHeight: 0.66, extenders: 0.35,
      aperture: 0.45, counter: 0.5, classicFuture: 0.7, story: 'double', letterSpacing: 0.16 }),
  style('screen', 'sans', ['humanist'], 'Screen Sans', ['business', 'calm', 'sincere'], 'Noto Sans, Hind, Mukta',
    'Drawn for reading on screens, after Verdana: wide, open letters with a very tall lowercase, sturdy strokes and loose spacing.',
    { weight: 0.5, width: 0.6, contrast: 0.52, curve: 0.5, geoHuman: 0.8, xHeight: 0.74, extenders: 0.4, aperture: 0.8, counter: 0.62,
      apex: 0.5, story: 'double', letterSpacing: 0.24 }),
  style('softcond', 'sans', ['rounded'], 'Soft Condensed', ['calm', 'futuristic', 'stiff'], 'Big Shoulders Display, Saira Extra Condensed, Pathway Gothic One',
    'Light, tall and squeezed thin, with softened corners and straight-sided bowls: quiet, clean and made to save space.',
    { weight: 0.3, width: 0.12, height: 0.85, contrast: 0.5, squareness: 0.55, roundness: 0.5, terminal: 'round', xHeight: 0.7,
      extenders: 0.3, apex: 0.8, counter: 0.4, aperture: 0.3, classicFuture: 0.6, letterSpacing: 0.2 }),
  style('blockgothic', 'sans', ['superellipse'], 'Block Gothic', ['loud', 'rugged', 'excited'], 'Squada One, Teko, Russo One',
    'Heavy, narrow and squared off, like jersey numbers or a gig poster: flat-sided bowls, tiny counters and a big lowercase.',
    { weight: 0.9, width: 0.3, height: 0.75, contrast: 0.5, squareness: 0.8, roundness: 0.3, xHeight: 0.74, extenders: 0.25,
      aperture: 0.15, counter: 0.26, apex: 0.95, classicFuture: 0.8, letterSpacing: 0.1 }),
  style('ultrablack', 'sans', ['geometric'], 'Ultra Black', ['loud', 'playful', 'innovative', 'excited'], 'Rubik Mono One, Climate Crisis, Titan One',
    'As black as a geometric sans can go: wide letters packed close, with pinhole counters and deep ink traps where strokes meet.',
    { weight: 1, width: 0.7, contrast: 0.53, joints: 0.8, squareness: 0.2, curve: 0, geoHuman: 0.2, counter: 0.2, aperture: 0.1,
      xHeight: 0.7, extenders: 0.25, apex: 0.3, letterSpacing: 0.02 }),
  style('thinsans', 'sans', ['geometric'], 'Thin Sans', ['sophisticated', 'calm', 'fancy'], 'Raleway, Josefin Sans, Jost',
    'The thinnest line there is, drawn on round, open letters with long ascenders and airy spacing. Quiet and elegant at large sizes.',
    { weight: 0, width: 0.52, contrast: 0.5, curve: 0.2, geoHuman: 0.45, xHeight: 0.44, extenders: 0.8, apex: 0.3, counter: 0.62,
      aperture: 0.55, letterSpacing: 0.36 }),
  style('sporty', 'sans', ['neogrotesque'], 'Sport Italic', ['excited', 'loud', 'futuristic'], 'Kanit Italic, Saira Italic, Racing Sans One',
    'A bold, squarish sans leaning hard into the wind, with cut stroke ends and tight spacing, like the lettering on a team jersey.',
    { weight: 0.8, width: 0.62, slant: 0.55, contrast: 0.53, squareness: 0.35, terminal: 'cut', apex: 0.8, xHeight: 0.66, aperture: 0.25,
      counter: 0.4, classicFuture: 0.75, letterSpacing: 0.1 }),
  style('chunkyround', 'sans', ['rounded'], 'Chunky Rounded', ['happy', 'cute', 'childlike', 'playful'], 'Fredoka, Baloo 2, Mochiy Pop One',
    'Bold, round-ended and steady: a big lowercase with a single-storey a and soft, open shapes, like a friendly app icon.',
    { weight: 0.74, width: 0.56, contrast: 0.5, roundness: 1, terminal: 'round', curve: 0.3, geoHuman: 0.4, xHeight: 0.68, counter: 0.5,
      aperture: 0.55, story: 'single', softSharp: 0.1, playfulFormal: 0.45, letterSpacing: 0.14 }),
  style('radial', 'sans', ['geometric'], 'Radial', ['innovative', 'artistic', 'calm'], 'Space Grotesk, Lexend, Syne',
    'A lowercase as tall as the capitals, with perfectly round bowls running square into their stems, barred i and l, round dots and a spur on the a.',
    { weight: 0.42, width: 0.52, contrast: 0.45, xHeight: 1, counter: 1, curve: 0, terminalRun: 'straight', extenders: 0.45, descender: 0.1,
      story: 'double', bowlJoin: 'square', dots: 'round', dotSize: 0.7, iForm: 'bars', aForm: 'spur',
      glyphs: { a: { width: 0.15, aperture: 1, crossbar: 0.6, terminalEnds: { '0e': 0.15 } }, u: { width: 0.27 }, r: { width: 0.7 },
        t: { width: 0.72, terminalEnds: { p0s: 0.7 }, corners: { '0j1': 0.33 } }, f: { width: 0.68, crossbar: 0.22, corners: { '0j2': 0.33 } },
        i: { width: 0.6 }, l: { width: 0.6 }, s: { aperture: 0.2 }, y: { corners: { '0j0': 0.33 }, terminal: 'cut', terminalForm: 'level' } } }),
  style('mirrorsans', 'sans', ['geometric'], 'Mirror Sans', ['playful', 'artistic', 'innovative'], 'Space Grotesk, Syne, Unbounded',
    'A quirky geometric sans after Gebuk: an even line, round open bowls, a big lowercase and an e drawn back to front.',
    { weight: 0.42, width: 0.6, contrast: 0.5, curve: 0, geoHuman: 0.1, xHeight: 0.7, extenders: 0.45, counter: 0.8, aperture: 0.3, story: 'single',
      kForm: 'stem', letterSpacing: 0.12, glyphs: { e: { mirror: 'mirrored' } } }),

  /* ---- Serif */
  style('oldstyle', 'serif', ['oldstyle'], 'Old Style', ['business', 'vintage', 'sophisticated', 'sincere'], 'EB Garamond, Cormorant Garamond, Crimson Pro',
    'Renaissance book type. Angled stress, steeply sloped serifs, a tiny lowercase under long ascenders and open, calligraphic curves.',
    { weight: 0.34, width: 0.46, contrast: 0.69, serif: true, serifShape: 'bracketed', serifSize: 0.45, serifThickness: 0.18, serifAngle: 0.9,
      terminal: 'tapered', curve: 0.75, geoHuman: 0.9, classicFuture: 0.1, xHeight: 0.3, extenders: 0.85, aperture: 0.75, apex: 0.2,
      crossbar: 0.62, letterSpacing: 0.22 }),
  style('serif', 'serif', ['transitional'], 'Transitional', ['business', 'calm', 'sincere'], 'Libre Baskerville, Source Serif 4, Lora',
    'Crisp serifs, clear thick-and-thin strokes, upright stress and ball endings. Made for headlines and long reads alike.',
    { weight: 0.45, contrast: 0.79, serif: true, serifShape: 'bracketed', serifSize: 0.42, serifThickness: 0.22, serifAngle: 0.15,
      terminal: 'round', classicFuture: 0.3, curve: 0.4, xHeight: 0.52, apex: 0.3, letterSpacing: 0.2 }),
  style('didone', 'serif', ['didone'], 'Didone', ['fancy', 'sophisticated', 'vintage'], 'Playfair Display, Bodoni Moda, Prata',
    'Extreme contrast, set tall and narrow: heavy upright stems against hairline serifs and ball-shaped endings. Built for fashion covers.',
    { weight: 0.58, width: 0.4, height: 0.72, contrast: 1, serif: true, serifShape: 'unbracketed', serifSize: 0.26, serifThickness: 0.04, serifAngle: 0,
      terminal: 'round', curve: 0, geoHuman: 0.4, classicFuture: 0.4, aperture: 0.2, xHeight: 0.56, apex: 0.05, letterSpacing: 0.2 }),
  style('fatface', 'serif', ['fatface', 'didone'], 'Fat Face', ['loud', 'vintage', 'rugged'], 'Abril Fatface, Rozha One, Ultra',
    'A Didone pushed to the limit: stems as heavy as they go, hairlines as thin as they go, tiny counters.',
    { weight: 0.96, width: 0.72, contrast: 0.95, serif: true, serifShape: 'unbracketed', serifSize: 0.3, serifThickness: 0.12, serifAngle: 0,
      terminal: 'round', curve: 0.05, xHeight: 0.54, aperture: 0.25, counter: 0.34, letterSpacing: 0.18 }),
  style('wedge', 'serif', ['wedge'], 'Wedge Serif', ['vintage', 'fancy'], 'Cinzel, Forum, Marcellus SC',
    'Big triangular, chisel-cut serifs on wide, widely spaced letters with a small lowercase. Feels engraved, heroic and a little mythic.',
    { weight: 0.4, width: 0.66, contrast: 0.63, serif: true, serifShape: 'wedge', serifSize: 0.46, serifThickness: 0.5, serifAngle: 0.35,
      terminal: 'sharp', softSharp: 0.9, apex: 0, classicFuture: 0.3, xHeight: 0.4, curve: 0.3, letterSpacing: 0.4 }),
  style('news', 'serif', ['transitional'], 'Newspaper', ['business', 'sincere', 'stiff'], 'PT Serif, Newsreader, Merriweather',
    'Built to fit more words on a page: narrow, sturdy and set tight, with a big lowercase, sharp serifs and moderate contrast.',
    { weight: 0.5, width: 0.3, contrast: 0.71, serif: true, serifShape: 'bracketed', serifSize: 0.34, serifThickness: 0.24, serifAngle: 0.2,
      terminal: 'round', curve: 0.35, geoHuman: 0.5, xHeight: 0.66, extenders: 0.4, aperture: 0.35, apex: 0.35, counter: 0.42,
      letterSpacing: 0.1 }),
  style('softserif', 'serif', ['oldstyle'], 'Soft Serif', ['happy', 'vintage', 'playful', 'sincere'], 'Caprasimo, Fraunces, Young Serif',
    'A 70s ad face after Cooper Black: very heavy and wide, with every serif and corner melted round and small, squashed counters.',
    { weight: 0.92, width: 0.68, contrast: 0.63, serif: true, serifShape: 'bracketed', serifSize: 0.36, serifThickness: 0.6, serifAngle: 0.5,
      roundness: 1, terminal: 'round', curve: 0.7, geoHuman: 0.7, softSharp: 0, xHeight: 0.6, aperture: 0.3, counter: 0.3,
      playfulFormal: 0.3, letterSpacing: 0.12 }),
  style('hairserif', 'serif', ['didone'], 'Hairline Serif', ['fancy', 'sophisticated', 'calm'], 'Italiana, Cormorant, Bodoni Moda',
    'A fashion-magazine display serif: fine strokes against hairlines, tiny sharp serifs, tapering ends and letters set close.',
    { weight: 0.3, width: 0.44, height: 0.7, contrast: 1, serif: true, serifShape: 'unbracketed', serifSize: 0.3, serifThickness: 0.1,
      serifAngle: 0, terminal: 'tapered', curve: 0.5, geoHuman: 0.6, xHeight: 0.5, aperture: 0.6, apex: 0.1, crossbar: 0.45, story: 'double',
      letterSpacing: 0.08 }),
  style('condserif', 'serif', ['didone'], 'Condensed Serif', ['sophisticated', 'fancy', 'vintage'], 'Instrument Serif, Antic Didone, Gilda Display',
    'A tall, narrow Didone for headlines: slim stems, hairline serifs and ball endings, stacked up like a poster title.',
    { weight: 0.36, width: 0.12, height: 0.85, contrast: 0.89, serif: true, serifShape: 'unbracketed', serifSize: 0.3, serifThickness: 0.08,
      serifAngle: 0, terminal: 'round', curve: 0.1, xHeight: 0.62, apex: 0.2, counter: 0.4, aperture: 0.3, letterSpacing: 0.18 }),
  style('compressed', 'serif', ['fatface', 'didone'], 'Compressed Serif', ['loud', 'vintage', 'rugged', 'excited'], 'Rozha One, Abril Fatface, DM Serif Display',
    'A fat face squeezed tall and narrow and set tight: black stems, thin hairlines and small bracketed serifs, like a Victorian playbill.',
    { weight: 0.84, width: 0.32, height: 0.8, contrast: 0.92, serif: true, serifShape: 'bracketed', serifSize: 0.24, serifThickness: 0.12,
      serifAngle: 0, terminal: 'round', curve: 0.4, xHeight: 0.66, aperture: 0.2, counter: 0.3, apex: 0.7, letterSpacing: 0.08 }),
  style('headline', 'serif', ['transitional'], 'Headline Serif', ['sophisticated', 'business', 'loud'], 'DM Serif Display, Gloock, Rufina',
    'A bold, sharp serif for magazine headlines: strong contrast, ball endings and spacing tightened up for big sizes.',
    { weight: 0.74, width: 0.48, contrast: 0.92, serif: true, serifShape: 'bracketed', serifSize: 0.36, serifThickness: 0.12, serifAngle: 0.1,
      terminal: 'round', curve: 0.3, geoHuman: 0.5, xHeight: 0.58, aperture: 0.3, counter: 0.4, apex: 0.25, letterSpacing: 0.06 }),
  style('serifitalic', 'serif', ['didone'], 'Serif Italic', ['fancy', 'sophisticated', 'artistic'], 'Playfair Display Italic, Instrument Serif Italic, Bodoni Moda Italic',
    'The true italic of a high-contrast serif: leaning, flowing letters with hairline serifs, ball endings and a cursive a, g and y.',
    { weight: 0.4, width: 0.4, height: 0.62, slant: 0.4, contrast: 0.92, serif: true, serifShape: 'unbracketed', serifSize: 0.26,
      serifThickness: 0.06, serifAngle: 0.3, terminal: 'round', cursive: 0.45, curve: 0.6, geoHuman: 0.7, xHeight: 0.5, extenders: 0.65,
      aperture: 0.5, apex: 0.2, letterSpacing: 0.12 }),
  style('copperplate', 'serif', [], 'Copperplate', ['business', 'vintage', 'stiff'], 'Stint Ultra Expanded, Castoro Titling, Marcellus SC',
    'Wide, light, even letters with tiny spur serifs and airy spacing, like an engraved letterhead or business card.',
    { weight: 0.36, width: 0.82, height: 0.4, contrast: 0.52, serif: true, serifShape: 'unbracketed', serifSize: 0.22, serifThickness: 0.2,
      serifAngle: 0, curve: 0.2, geoHuman: 0.4, xHeight: 0.66, extenders: 0.35, aperture: 0.4, apex: 0.6, counter: 0.5, letterSpacing: 0.36 }),
  style('venetian', 'serif', ['venetian'], 'Venetian', ['vintage', 'sincere', 'sophisticated', 'calm'], 'Alegreya, Sorts Mill Goudy, Cardo',
    'The first roman type, cut in 1470s Venice: dark and even, with little contrast, steeply sloped serifs, a small lowercase and a calligraphic swing.',
    { weight: 0.46, width: 0.5, contrast: 0.59, serif: true, serifShape: 'bracketed', serifSize: 0.4, serifThickness: 0.3, serifAngle: 1,
      terminal: 'angled', curve: 0.8, geoHuman: 1, classicFuture: 0, xHeight: 0.3, extenders: 0.8, aperture: 0.8, apex: 0.15, crossbar: 0.66,
      letterSpacing: 0.18 }),
  style('swashitalic', 'serif', ['oldstyle', 'swash'], 'Swash Italic', ['fancy', 'sophisticated', 'vintage', 'artistic'], 'Libre Caslon Text Italic, EB Garamond Italic, Cormorant Italic',
    'An old-style italic after Caslon: a steady lean, bracketed serifs, ball ends, and swash capitals whose first stroke curls out into a flourish.',
    { weight: 0.4, width: 0.36, height: 0.7, slant: 0.5, contrast: 0.84, serif: true, serifShape: 'bracketed', serifSize: 0.3, serifThickness: 0.1,
      serifAngle: 0.7, terminal: 'round', terminalForm: 'ball', terminalSize: 0.55, cursive: 0.45, curve: 0.75, geoHuman: 0.8, xHeight: 0.3,
      extenders: 0.75, aperture: 0.5, apex: 0.15, swash: 0.75, letterSpacing: 0.06 }),

  /* ---- Slab Serif */
  style('slab', 'slab', ['slab'], 'Geometric Slab', ['calm', 'business', 'stiff'], 'Josefin Slab, Arvo, Rokkitt',
    'Block-shaped serifs on a light, even, geometric skeleton: perfectly round bowls, a single-storey a and open spacing. Crisp and engineered.',
    { weight: 0.28, width: 0.6, contrast: 0.5, serif: true, serifShape: 'slab', serifSize: 0.38, serifThickness: 0.35, serifAngle: 0,
      curve: 0, geoHuman: 0.25, xHeight: 0.5, apex: 0.3, counter: 0.62, story: 'single', letterSpacing: 0.3 }),
  style('clarendon', 'slab', ['clarendon', 'slab'], 'Clarendon', ['business', 'rugged', 'vintage', 'sincere'], 'Crete Round, Zilla Slab, Besley',
    'A bold, friendly slab: heavy serifs flow into the stems through soft brackets, with some contrast, ball endings and a big lowercase.',
    { weight: 0.72, width: 0.54, contrast: 0.68, serif: true, serifShape: 'bracketed', serifSize: 0.34, serifThickness: 0.7, serifAngle: 0,
      terminal: 'round', roundness: 0.4, curve: 0.5, xHeight: 0.64, aperture: 0.3, counter: 0.44, letterSpacing: 0.2 }),
  style('egyptian', 'slab', ['slab'], 'Heavy Slab', ['loud', 'rugged', 'vintage'], 'Bevan, Patua One, Holtwood One SC',
    'An Egyptian after Rockwell, set black: square-cut slabs as thick as the stems, a monoline stroke and compact, blocky letters.',
    { weight: 0.84, width: 0.56, contrast: 0.51, serif: true, serifShape: 'slab', serifSize: 0.3, serifThickness: 0.95, serifAngle: 0,
      curve: 0.1, geoHuman: 0.3, squareness: 0.15, xHeight: 0.6, aperture: 0.25, counter: 0.36, apex: 0.4, letterSpacing: 0.16 }),
  style('humanslab', 'slab', ['slab'], 'Humanist Slab', ['calm', 'sincere', 'happy'], 'Bree Serif, Aleo, Kotta One',
    'A friendly upright-italic slab: short, rounded slabs, a single-storey a, a gentle lean and ends that flick out like handwriting.',
    { weight: 0.52, width: 0.44, slant: 0.08, contrast: 0.58, serif: true, serifShape: 'slab', serifSize: 0.28, serifThickness: 0.4, serifAngle: 0.3,
      roundness: 0.5, terminal: 'angled', cursive: 0.36, curve: 0.75, geoHuman: 0.9, story: 'single', xHeight: 0.58, aperture: 0.7,
      apex: 0.4, letterSpacing: 0.16 }),
  style('softslab', 'slab', ['slab'], 'Soft Slab', ['sincere', 'calm', 'happy', 'business'], 'Roboto Slab, Kameron, Slabo 27px',
    'A friendly modern slab after Museo Slab: sturdy, even strokes and square slabs with their corners softened, over a big lowercase.',
    { weight: 0.6, width: 0.5, contrast: 0.52, serif: true, serifShape: 'slab', serifSize: 0.3, serifThickness: 0.6, serifAngle: 0,
      roundness: 0.35, curve: 0.2, geoHuman: 0.4, xHeight: 0.62, aperture: 0.4, counter: 0.5, apex: 0.4, story: 'double', letterSpacing: 0.16 }),
  style('wideslab', 'slab', ['slab'], 'Expanded Slab', ['loud', 'vintage', 'rugged'], 'Rammetto One, Bowlby One, Alfa Slab One',
    'A heavy slab stretched as wide and low as it goes, with thick square serifs. Made for circus posters and bold packaging.',
    { weight: 0.74, width: 1, height: 0.4, contrast: 0.54, serif: true, serifShape: 'slab', serifSize: 0.3, serifThickness: 0.8, serifAngle: 0,
      curve: 0.1, xHeight: 0.66, counter: 0.4, aperture: 0.3, apex: 0.6, letterSpacing: 0.14 }),

  /* ---- Monospace */
  style('typewriter', 'mono', ['slab'], 'Typewriter', ['vintage', 'sincere'], 'Courier Prime, Cutive Mono, Special Elite',
    'Every letter the same width, with soft slab serifs and slightly uneven ink, like keys struck through a ribbon.',
    { weight: 0.3, contrast: 0.5, serif: true, serifShape: 'slab', serifSize: 0.55, serifThickness: 0.3, serifAngle: 0, mono: 1, wobble: 0.15,
      roundness: 0.7, terminal: 'round', curve: 0.3, xHeight: 0.52, letterSpacing: 0.2, wordSpacing: 0.35 }),
  style('squaremono', 'mono', [], 'Square Mono', ['futuristic', 'stiff'], 'Major Mono Display, Syne Mono, Space Mono',
    'A wide monospace with square bowls and square dots. Reads like numbers on a train departure board.',
    { weight: 0.42, width: 0.68, contrast: 0.5, mono: 1, squareness: 1, curve: 0, geoHuman: 0.3, xHeight: 0.62, apex: 0.9,
      aperture: 0.35, letterSpacing: 0.22, terminal: 'cut' }),
  style('code', 'mono', [], 'Code', ['calm', 'futuristic', 'stiff'], 'IBM Plex Mono, Space Mono, Ubuntu Mono',
    'A code-editor face: one narrow width for every character, a tall x-height, squarish bowls and slight ink traps that keep it crisp at small sizes.',
    { weight: 0.48, width: 0.38, contrast: 0.5, mono: 1, squareness: 0.3, joints: 0.3, curve: 0.1, geoHuman: 0.45, xHeight: 0.68, extenders: 0.4,
      aperture: 0.5, apex: 0.6, classicFuture: 0.6, letterSpacing: 0.2 }),
  style('roundmono', 'mono', ['rounded'], 'Rounded Mono', ['calm', 'cute', 'happy'], 'M PLUS 1 Code, Azeret Mono, Red Hat Mono',
    'A soft monospace for friendly terminals: round stroke ends and softened corners on a fixed grid, light and airy.',
    { weight: 0.36, width: 0.5, contrast: 0.5, mono: 1, roundness: 1, terminal: 'round', curve: 0.2, geoHuman: 0.4, xHeight: 0.6,
      extenders: 0.45, aperture: 0.55, counter: 0.6, apex: 0.6, story: 'single', letterSpacing: 0.2 }),
  style('terminal', 'mono', [], 'Terminal', ['futuristic', 'vintage', 'stiff'], 'VT323, Press Start 2P, Share Tech Mono',
    'Green-screen computer text: tall, narrow monospace letters built from fine square pixels, as on an 80s terminal.',
    { weight: 0.4, width: 0.36, height: 0.7, contrast: 0.5, mono: 1, squareness: 0.9, fill: 'pixels', module: 0.3, curve: 0, geoHuman: 0.35,
      xHeight: 0.62, apex: 0.9, aperture: 0.35, counter: 0.5, letterSpacing: 0.2 }),
  style('cursivemono', 'mono', [], 'Cursive Mono', ['artistic', 'calm', 'sophisticated'], 'Victor Mono Italic, JetBrains Mono Italic, Courier Prime Italic',
    'A coding italic: every letter the same width, but slanted and joined up in handwritten shapes, with round, looping ends.',
    { weight: 0.3, width: 0.42, slant: 0.35, contrast: 0.53, mono: 1, cursive: 0.75, roundness: 0.6, terminal: 'round', curve: 0.8,
      geoHuman: 0.8, xHeight: 0.56, extenders: 0.55, letterSpacing: 0.2 }),
  style('boldmono', 'mono', [], 'Heavy Mono', ['loud', 'futuristic', 'innovative'], 'Space Mono Bold, Chivo Mono Black, Martian Mono',
    'A black, wide monospace with squarish bowls and ink traps where strokes meet. Blunt and technical, for headlines on a grid.',
    { weight: 0.84, width: 0.62, contrast: 0.5, mono: 1, squareness: 0.3, joints: 0.35, curve: 0.1, geoHuman: 0.4, xHeight: 0.62,
      aperture: 0.3, counter: 0.4, apex: 0.7, letterSpacing: 0.18 }),
  style('serifmono', 'mono', [], 'Serif Mono', ['sophisticated', 'vintage', 'calm'], 'Xanh Mono, Anonymous Pro, IBM Plex Mono',
    'A bookish monospace: fine bracketed serifs and real thick-and-thin strokes squeezed onto one fixed width.',
    { weight: 0.4, width: 0.44, contrast: 0.8, mono: 1, serif: true, serifShape: 'bracketed', serifSize: 0.4, serifThickness: 0.14,
      serifAngle: 0.2, terminal: 'round', curve: 0.4, geoHuman: 0.6, xHeight: 0.5, extenders: 0.6, letterSpacing: 0.2 }),
  style('boxmono', 'mono', [], 'Box Mono', ['futuristic', 'stiff', 'innovative'], 'Martian Mono, Space Mono, Major Mono Display',
    'A monospace built from boxes: straight-sided bowls whose corners round wide on the outside and stay square inside, running flat into the stems.',
    { weight: 0.38, width: 0.6, contrast: 0.5, mono: 1, bowlForm: 'box', boxRound: 0.85, bowlJoin: 'square', squareness: 1, curve: 0,
      terminalRun: 'straight', apex: 1, geoHuman: 0.3, xHeight: 0.62, letterSpacing: 0.12 }),
  style('scoreboard', 'mono', ['superellipse'], 'Scoreboard Mono', ['excited', 'futuristic', 'stiff'], 'Share Tech Mono, Azeret Mono, Chakra Petch',
    'Tall, narrow numbers for a stadium scoreboard: rounded-rectangle bowls, straight-cut ends, barred I and every character on the same width.',
    { weight: 0.42, width: 0.36, height: 0.75, contrast: 0.5, mono: 1, squareness: 0.75, curve: 0, terminalRun: 'straight', apex: 1, iForm: 'bars',
      geoHuman: 0.3, xHeight: 0.7, letterSpacing: 0.14 }),

  /* ---- Handwriting */
  style('casual', 'hand', ['handwritten', 'informal', 'monoline'], 'Casual Handwriting', ['happy', 'playful', 'childlike'], 'Caveat, Indie Flower, Shadows Into Light',
    'Quick everyday handwriting with a felt pen: narrow, a little slanted, with small flicks at the stroke ends and letters that never sit quite still.',
    { weight: 0.28, width: 0.34, height: 0.62, slant: 0.25, contrast: 0.5, roundness: 1, terminal: 'round', wobble: 0.5, cursive: 0.3,
      xHeight: 0.3, curve: 0.7, geoHuman: 0.8, letterSpacing: 0.3 }),
  style('upright', 'hand', ['handwritten', 'upright'], 'Hand Printed', ['childlike', 'happy', 'cute', 'sincere'], 'Patrick Hand, Gochi Hand, Mansalva',
    'Printed by hand, letter by letter. Upright and friendly, with round pen ends and wobbly lines.',
    { weight: 0.38, width: 0.45, contrast: 0.5, roundness: 1, terminal: 'round', wobble: 0.75, cursive: 0.12,
      xHeight: 0.55, curve: 0.6, geoHuman: 0.75, playfulFormal: 0.3 }),
  style('informal', 'hand', ['informal'], 'Retro Script', ['vintage', 'playful', 'artistic', 'excited'], 'Pacifico, Lobster, Yellowtail',
    'A bold, joined-up script with a retro sign-painter swing: every letter flows into the next.',
    { weight: 0.62, width: 0.45, slant: 0.45, contrast: 0.63, roundness: 0.8, terminal: 'round', wobble: 0.25, cursive: 1,
      xHeight: 0.45, curve: 0.35, geoHuman: 0.45, letterSpacing: 0.02 }),
  style('chancery', 'hand', ['formal'], 'Formal Script', ['fancy', 'sophisticated'], 'Great Vibes, Tangerine, Pinyon Script',
    'Copperplate elegance: a steep slant, hairline upstrokes, swelling downstrokes and a tiny x-height.',
    { weight: 0.36, width: 0.32, height: 0.75, slant: 1, contrast: 0.89, terminal: 'tapered', cursive: 1,
      xHeight: 0.22, curve: 1, geoHuman: 1, letterSpacing: 0.02 }),
  style('brush', 'hand', ['brush', 'informal'], 'Brush', ['artistic', 'loud', 'excited'], 'Kaushan Script, Oregano, Mr Dafoe',
    'Fast, heavy strokes from a loaded brush. A strong lean, tapering ends and a rough, lively rhythm.',
    { weight: 0.7, width: 0.4, slant: 0.55, contrast: 0.66, terminal: 'tapered', wobble: 0.3, cursive: 0.55,
      xHeight: 0.5, curve: 0.4, geoHuman: 0.5, letterSpacing: 0.08 }),
  style('marker', 'hand', ['handwritten', 'upright', 'marker'], 'Marker', ['loud', 'playful', 'rugged', 'excited'], 'Permanent Marker, Rock Salt, Sedgwick Ave',
    'Thick, even lines from a felt marker: narrow, tall and a bit rough, leaning slightly, with round, blunt stroke ends.',
    { weight: 0.56, width: 0.36, height: 0.7, slant: 0.14, contrast: 0.5, roundness: 1, terminal: 'round', wobble: 0.8,
      xHeight: 0.74, extenders: 0.3, curve: 0.3, geoHuman: 0.6, counter: 0.38, aperture: 0.4, letterSpacing: 0.14 }),
  style('swash', 'hand', ['formal', 'swash', 'italic'], 'Swash Script', ['fancy', 'sophisticated', 'artistic'], 'Parisienne, Alex Brush, Italianno',
    'A wedding-invitation script: a steep lean, thick and thin strokes, and every stroke end wound into a curling flourish.',
    { weight: 0.4, width: 0.36, height: 0.7, slant: 0.7, contrast: 0.84, terminal: 'tapered', cursive: 1, terminalCurl: 0.61,
      xHeight: 0.3, extenders: 0.8, curve: 1, geoHuman: 1, letterSpacing: 0.04 }),
  style('italic', 'hand', ['italic', 'formal'], 'Chancery Italic', ['sophisticated', 'vintage', 'calm'], 'Cormorant Italic, Kalam, Satisfy',
    'Written with a broad-nib pen held at an angle: a narrow, springy italic with sharp thick-and-thin, angled cuts and ends that turn up in gentle hooks.',
    { weight: 0.44, width: 0.3, height: 0.65, slant: 0.3, contrast: 0.83, terminal: 'angled', cursive: 0.4, terminalCurl: 0.58,
      xHeight: 0.42, extenders: 0.7, curve: 0.9, geoHuman: 1, aperture: 0.7, letterSpacing: 0.1 }),
  style('monoline', 'hand', ['monoline', 'informal', 'swash'], 'Monoline Script', ['happy', 'calm', 'cute', 'playful'], 'Dancing Script, Sacramento, Cookie',
    'One even pen line looping from letter to letter, with round, curly ends and a relaxed, easy lean.',
    { weight: 0.26, width: 0.46, slant: 0.35, contrast: 0.5, roundness: 1, terminal: 'round', cursive: 1, terminalCurl: 0.63,
      xHeight: 0.42, extenders: 0.7, curve: 0.9, geoHuman: 0.8, letterSpacing: 0.06 }),
  style('curly', 'hand', ['handwritten', 'upright', 'swash'], 'Curly Hand', ['cute', 'happy', 'childlike', 'playful'], 'Sniglet, Grandstander, Chilanka',
    'Bouncy, upright printing that curls up at every end, like doodled notes in the margin of a sketchbook.',
    { weight: 0.42, width: 0.5, contrast: 0.5, roundness: 1, terminal: 'round', wobble: 0.45, terminalCurl: 0.61,
      xHeight: 0.6, curve: 0.7, geoHuman: 0.7, playfulFormal: 0.15, counter: 0.6, letterSpacing: 0.22 }),
  style('signature', 'hand', ['signature', 'informal', 'monoline'], 'Signature', ['sophisticated', 'artistic', 'excited'], 'Mrs Saint Delafield, Monsieur La Doulaise, Herr Von Muellerhoff',
    'Signed at speed: a fine, fast line, a very steep lean, a tiny lowercase under towering loops and long tails that whip out past the letters.',
    { weight: 0.14, width: 0.28, height: 0.8, slant: 0.9, contrast: 0.53, terminal: 'tapered', wobble: 0.5, cursive: 1, terminalCurl: 0.64,
      terminalLength: 0.7, tail: 0.85, xHeight: 0.14, extenders: 1, curve: 1, geoHuman: 1, letterSpacing: 0, wordSpacing: 0.6 }),
  style('blackletter', 'hand', ['blackletter'], 'Blackletter', ['vintage', 'rugged', 'fancy'], 'UnifrakturMaguntia, Pirata One, Grenze Gotisch',
    'Gothic textura from a broad pen: tall, narrow and packed close, every curve broken into straight cuts, each stem standing on a diamond.',
    { weight: 0.62, width: 0.2, height: 0.72, contrast: 0.85, chamfer: 1, squareness: 1, curve: 1, serif: true, serifShape: 'diamond', serifSize: 0.18,
      serifThickness: 0.5, serifAngle: 1, terminal: 'angled', softSharp: 1, geoHuman: 1, xHeight: 0.6, extenders: 0.45, aperture: 0.1,
      apex: 0.1, counter: 0.3, letterSpacing: 0.12 }),
  style('sketch', 'hand', ['handwritten', 'upright'], 'Sketch', ['artistic', 'playful', 'childlike'], 'Cabin Sketch, Londrina Sketch, Rubik Doodle Shadow',
    'Outlined in pencil and never inked in: each stroke drawn as a shaky double line, like letters roughed out in a sketchbook.',
    { weight: 0.62, width: 0.5, contrast: 0.5, fill: 'wire', module: 0.3, roundness: 0.6, terminal: 'round', wobble: 1, curve: 0.5,
      geoHuman: 0.7, xHeight: 0.58, counter: 0.5, letterSpacing: 0.26 }),
  style('comic', 'hand', ['handwritten', 'upright'], 'Comic', ['childlike', 'happy', 'playful', 'sincere'], 'Comic Neue, Short Stack, Schoolbell',
    'Speech-bubble lettering: an even, round-ended pen line, upright and open, drawn neatly enough to read at any size.',
    { weight: 0.46, width: 0.54, contrast: 0.5, roundness: 1, terminal: 'round', wobble: 0.12, curve: 0.6, geoHuman: 0.7, playfulFormal: 0.38,
      xHeight: 0.56, counter: 0.56, aperture: 0.62, story: 'single', letterSpacing: 0.18 }),
  style('architect', 'hand', ['handwritten', 'upright'], 'Architect', ['sincere', 'calm', 'artistic'], 'Architects Daughter, Nanum Pen Script, Covered By Your Grace',
    'Neat drafting-table lettering: a fine, tall and narrow pen hand with a lowercase almost as tall as the capitals and a slight shake.',
    { weight: 0.16, width: 0.3, height: 0.72, slant: 0.04, contrast: 0.5, roundness: 1, terminal: 'round', wobble: 0.45, curve: 0.2,
      geoHuman: 0.55, xHeight: 0.72, extenders: 0.3, aperture: 0.5, letterSpacing: 0.22 }),
  style('upscript', 'hand', ['informal', 'upright'], 'Upright Script', ['cute', 'happy', 'sincere', 'playful'], 'Sofia, Oleo Script, Damion',
    'Joined-up writing that stands straight: every letter flows into the next with no lean at all, soft and round.',
    { weight: 0.46, width: 0.5, contrast: 0.58, roundness: 0.8, terminal: 'round', cursive: 1, curve: 0.9, geoHuman: 0.8, xHeight: 0.5,
      extenders: 0.6, letterSpacing: 0.04 }),

  /* ---- Display */
  style('woodtype', 'display', ['slab'], 'Wood Type', ['rugged', 'vintage', 'loud'], 'Alfa Slab One, Sancreek, Rye',
    'Poster letters cut from wood for Wild West handbills: heavy, compact and squared, with chunky slabs.',
    { weight: 0.82, width: 0.36, height: 0.62, contrast: 0.57, serif: true, serifShape: 'slab', serifSize: 0.22, serifThickness: 0.5, serifAngle: 0,
      classicFuture: 0.72, xHeight: 0.66, aperture: 0.3, counter: 0.4, apex: 0.8, letterSpacing: 0.3 }),
  style('techno', 'display', ['superellipse'], 'Techno', ['futuristic', 'loud'], 'Orbitron, Zen Dots, Audiowide',
    'Rounded rectangles instead of circles, flat peaks and a hard forward lean, like the badge on a racing car.',
    { weight: 0.66, width: 0.88, slant: 0.4, contrast: 0.5, classicFuture: 1, xHeight: 0.6, apex: 0.95, terminal: 'cut', softSharp: 0.6,
      counter: 0.5, letterSpacing: 0.26 }),
  style('display', 'display', ['rounded'], 'Blobby', ['cute', 'happy', 'playful', 'loud', 'excited'], 'Chewy, Sour Gummy, DynaPuff',
    'As heavy as it goes, soft and puffy, like letters squeezed out of a tube. Every letter bounces to its own beat.',
    { weight: 0.9, width: 0.62, contrast: 0.5, roundness: 1, terminal: 'round', wobble: 0.4, xHeight: 0.7, counter: 0.3, aperture: 0.3,
      softSharp: 0.1, playfulFormal: 0, geoHuman: 0.45, apex: 0.7, letterSpacing: 0.2 }),
  style('pixel', 'display', [], 'Pixel', ['futuristic', 'playful'], 'Silkscreen, Pixelify Sans, Jersey 10',
    'Rebuilt on a coarse grid of square pixels with softened corners, like an old handheld game screen.',
    { weight: 0.55, width: 0.6, contrast: 0.5, squareness: 0.8, fill: 'pixels', module: 0.78, roundness: 0.55, apex: 0.9, xHeight: 0.62,
      counter: 0.55, letterSpacing: 0.2, geoHuman: 0.4 }),
  style('dotmatrix', 'display', [], 'Dot Matrix', ['futuristic', 'vintage'], 'Doto, DotGothic16, Codystar',
    'Letters printed from a grid of round dots, like a departure board or an old receipt printer. Faceted corners keep it mechanical.',
    { weight: 0.62, width: 0.62, contrast: 0.5, chamfer: 0.55, fill: 'dots', module: 0.55, apex: 1, xHeight: 0.6, counter: 0.5,
      letterSpacing: 0.22, geoHuman: 0.35 }),
  style('striped', 'display', [], 'Striped', ['vintage', 'loud', 'artistic', 'excited'], 'Monoton, Tilt Prism, Bungee Inline',
    'A 70s disco face made from horizontal stripes with rounded ends: the letters appear only where the lines are.',
    { weight: 0.82, width: 0.72, contrast: 0.5, squareness: 0.35, fill: 'lines', module: 0.45, roundness: 1, xHeight: 0.62, counter: 0.5,
      apex: 0.8, letterSpacing: 0.26 }),
  style('octagon', 'display', [], 'Octagonal', ['futuristic', 'rugged', 'stiff'], 'Chakra Petch, Tomorrow, Bai Jamjuree',
    'Modular letters built on a square grid, after Ben Bos and Wim Crouwel: no curves at all, just straight strokes and cut corners.',
    { weight: 0.74, width: 0.56, contrast: 0.5, chamfer: 0.62, apex: 1, curve: 0, geoHuman: 0.3, xHeight: 0.62, counter: 0.48,
      aperture: 0.3, letterSpacing: 0.22, terminal: 'flat' }),
  style('stencil', 'display', ['geometric'], 'Stencil', ['rugged', 'loud'], 'Stardos Stencil, Allerta Stencil, Big Shoulders Stencil',
    'Heavy, tall letters with wide gaps cut where the strokes meet, so they could be sprayed through a sheet onto a crate. Round letters split in two.',
    { weight: 0.76, width: 0.46, height: 0.66, contrast: 0.5, squareness: 0.2, stencil: 0.16, curve: 0, geoHuman: 0.3, apex: 0.3,
      counter: 0.5, xHeight: 0.6, letterSpacing: 0.24 }),
  style('split', 'display', ['superellipse'], 'Split Line', ['futuristic', 'sophisticated', 'innovative'], 'Syncopate, Michroma, Krona One',
    'Ultra-wide and squared off, with a single hairline cut running through the whole line of text.',
    { weight: 0.72, width: 1, height: 0.4, contrast: 0.5, squareness: 0.85, slice: 0.05, apex: 1, xHeight: 0.66, counter: 0.5,
      aperture: 0.25, letterSpacing: 0.2 }),
  style('construction', 'display', ['geometric'], 'Construction', ['artistic', 'futuristic', 'innovative'], 'Bungee Outline, Train One, Kumar One Outline',
    'Drawn as the outline of every stroke, overlaps and all, like a letter still on the drawing board.',
    { weight: 0.6, contrast: 0.5, fill: 'wire', module: 0.35, curve: 0, geoHuman: 0.25, apex: 0.1, counter: 0.62, xHeight: 0.5,
      letterSpacing: 0.3 }),
  style('inline', 'display', ['geometric'], 'Inline', ['vintage', 'fancy', 'artistic'], 'Bungee Inline, Monoton, Limelight',
    'Bold geometric capitals with a fine line cut down the middle of every stroke, like Art Deco signs and theatre posters.',
    { weight: 0.78, width: 0.6, contrast: 0.5, fill: 'inline', module: 0.3, curve: 0, geoHuman: 0.2, apex: 0.2, counter: 0.6, xHeight: 0.62,
      letterSpacing: 0.3 }),
  style('shadow', 'display', ['slab'], 'Shadow', ['vintage', 'loud', 'excited'], 'Bungee Shade, Rubik Mono One, Ewert',
    'A heavy slab with a copy of each letter set down to the right behind it, a white gap between, like a circus or saloon sign.',
    { weight: 0.72, width: 0.62, contrast: 0.55, serif: true, serifShape: 'slab', serifSize: 0.35, serifThickness: 0.6, fill: 'shadow', module: 0.35,
      curve: 0.2, xHeight: 0.62, counter: 0.5, aperture: 0.4, letterSpacing: 0.3 }),
  style('reverse', 'display', [], 'Reverse Contrast', ['futuristic', 'loud', 'artistic', 'innovative'], 'Ewert, Sancreek, Rye',
    'Contrast turned on its side: fat horizontals and hairline stems. Wide, strange and made for posters.',
    { weight: 0.55, width: 0.86, contrast: 0.18, curve: 0, squareness: 0.3, apex: 0.8, xHeight: 0.56, counter: 0.5,
      letterSpacing: 0.26 }),
  style('hairline', 'display', ['geometric'], 'Art Deco', ['vintage', 'sophisticated', 'artistic'], 'Poiret One, Limelight, Federo',
    'Jazz-age glamour: a fine single line, geometric circles, a tiny x-height and crossbars pushed up high.',
    { weight: 0.04, width: 0.6, contrast: 0.5, curve: 0, geoHuman: 0.25, apex: 0.05, counter: 0.65, xHeight: 0, height: 0.62,
      crossbar: 0.95, letterSpacing: 0.45, wordSpacing: 0.5 }),
  style('neon', 'display', ['monoline', 'informal'], 'Neon Script', ['excited', 'artistic', 'vintage'], 'Neonderthaw, Tilt Neon, Beon',
    'A glowing sign bent from glass tube: a joined-up script drawn as one outlined line with round ends and curling tips.',
    { weight: 0.42, width: 0.5, slant: 0.3, contrast: 0.5, fill: 'wire', module: 0.3, roundness: 1, terminal: 'round', cursive: 1,
      terminalCurl: 0.6, xHeight: 0.45, extenders: 0.7, curve: 0.9, geoHuman: 0.75, letterSpacing: 0.12 }),
  style('creepy', 'display', [], 'Creepy', ['loud', 'rugged', 'artistic', 'excited'], 'Creepster, Nosifer, Butcherman',
    'Horror-poster lettering: tall, jittery strokes that sharpen to thorn-like points, as if scratched out by candlelight.',
    { weight: 0.72, width: 0.42, height: 0.72, slant: 0.1, contrast: 0.74, terminal: 'tapered', terminalLength: 0.9, softSharp: 1,
      wobble: 1, curve: 0.5, geoHuman: 0.8, xHeight: 0.66, aperture: 0.3, counter: 0.38, letterSpacing: 0.12 }),
  style('speed', 'display', [], 'Speed Lines', ['futuristic', 'excited', 'loud'], 'Faster One, Bungee Shade, Racing Sans One',
    'A heavy, wide, hard-leaning face cut into horizontal streaks, like a logo for a race car moving too fast to see.',
    { weight: 0.86, width: 0.8, slant: 0.7, contrast: 0.5, squareness: 0.5, fill: 'lines', module: 0.3, apex: 0.9, xHeight: 0.66,
      counter: 0.4, aperture: 0.25, classicFuture: 0.9, letterSpacing: 0.12 }),
  style('comicbook', 'display', [], 'Comic Book', ['loud', 'excited', 'playful'], 'Bangers, Luckiest Guy, Bowlby One',
    'Sound-effect lettering from a comic panel: black, tall and narrow, leaning forward with a little wobble. POW.',
    { weight: 0.84, width: 0.4, height: 0.7, slant: 0.22, contrast: 0.53, wobble: 0.25, curve: 0.2, squareness: 0.2, xHeight: 0.74,
      extenders: 0.25, aperture: 0.3, counter: 0.36, apex: 0.7, letterSpacing: 0.14 }),
  style('nouveau', 'display', ['flared'], 'Art Nouveau', ['vintage', 'artistic', 'fancy'], 'Macondo, Almendra, Federo',
    'Belle Époque poster lettering, after Mucha: flowing curves, strokes that swell and taper, a small lowercase and crossbars dropped low.',
    { weight: 0.4, width: 0.4, height: 0.72, contrast: 0.85, terminal: 'tapered', terminalLength: 0.8, terminalCurl: 0.57, curve: 1,
      geoHuman: 0.9, xHeight: 0.34, extenders: 0.8, crossbar: 0.08, aperture: 0.7, apex: 0.2, letterSpacing: 0.22 }),
  style('psychedelic', 'display', ['swash'], 'Psychedelic', ['excited', 'artistic', 'vintage', 'playful'], 'Shrikhand, Kavoon, Bagel Fat One',
    'A 60s concert poster: heavy, melting letters that lean and bounce, with every stroke end curling up.',
    { weight: 0.8, width: 0.62, slant: 0.25, contrast: 0.66, roundness: 1, terminal: 'round', wobble: 0.45, terminalCurl: 0.56,
      curve: 1, geoHuman: 0.8, xHeight: 0.62, counter: 0.3, aperture: 0.3, letterSpacing: 0.14 }),
  style('bauhaus', 'display', ['geometric'], 'Bauhaus', ['artistic', 'vintage', 'innovative'], 'Righteous, Comfortaa, Baumans',
    'Built with a compass and ruler at the 1920s Bauhaus, after Herbert Bayer: wide circles, a lowercase nearly as tall as the capitals and stubby ascenders.',
    { weight: 0.5, width: 0.8, contrast: 0.5, roundness: 1, terminal: 'round', curve: 0, geoHuman: 0.1, aperture: 0.8, story: 'single',
      xHeight: 0.84, extenders: 0.18, counter: 0.8, apex: 0.8, letterSpacing: 0.2 }),
  style('heavybox', 'display', [], 'Heavy Box', ['loud', 'futuristic', 'innovative'], 'Russo One, Goldman, Orbitron',
    'Black, wide and low, drawn in boxes: bowls with big rounds outside and square counters inside, flat into the stems, like freight stencilling or a car badge.',
    { weight: 0.9, width: 0.95, height: 0.45, contrast: 0.5, bowlForm: 'box', boxRound: 0.7, bowlJoin: 'square', squareness: 1, curve: 0,
      terminalRun: 'straight', apex: 1, geoHuman: 0.3, xHeight: 0.7, counter: 0.4, letterSpacing: 0.06 }),
  style('boxcontrast', 'display', [], 'Box Contrast', ['loud', 'sophisticated', 'artistic'], 'Dela Gothic One, Syne, Bricolage Grotesque',
    'A heavy box face with thinned bars: tall stems, square counters, a two-storey a and letters set nearly touching, for big posters.',
    { weight: 0.88, width: 0.62, contrast: 0.7, bowlForm: 'box', boxRound: 0.6, bowlJoin: 'square', squareness: 1, curve: 0, terminalRun: 'straight',
      apex: 1, story: 'double', xHeight: 0.72, counter: 0.45, letterSpacing: 0.04 }),
  style('reversebox', 'display', [], 'Reverse Box', ['futuristic', 'artistic', 'innovative'], 'Michroma, Syncopate, Krona One',
    'Wide boxes with heavy bars and hairline stems: one side of A V W stands upright, M N W turn in round bends like bent wire, and the R loops into its leg.',
    { weight: 0.52, width: 0.8, contrast: 0, bowlForm: 'box', bowlJoin: 'square', squareness: 1, curve: 0, apex: 0, terminalRun: 'straight',
      diagonals: 'upright', bends: 'round', yForm: 'cup', qForm: 'inside', rForm: 'loop', kForm: 'stem', iForm: 'bars', geoHuman: 0.3,
      xHeight: 0.62, letterSpacing: 0.16 }),
  style('modular', 'display', ['geometric'], 'Modular', ['artistic', 'innovative', 'playful'], 'Righteous, Syne, Unbounded',
    'Drawn on a grid with compass and ruler: perfect circles, a huge lowercase, and diagonals that turn in round bends so v w z look bent from one line.',
    { weight: 0.72, width: 0.62, contrast: 0.5, bends: 'round', curve: 0, geoHuman: 0, story: 'single', terminalRun: 'straight', xHeight: 0.85,
      extenders: 0.3, counter: 0.85, aperture: 0.3, letterSpacing: 0.04 }),
  style('stadium', 'display', ['geometric'], 'Stadium', ['loud', 'vintage', 'excited'], 'Bungee, Days One, Righteous',
    'A black 70s poster face: wide round letters with slit counters, bowls running square into their stems and M N V W bent round at the bottom.',
    { weight: 0.85, width: 0.9, height: 0.5, contrast: 0.5, bends: 'round', bowlJoin: 'square', curve: 0, terminalRun: 'straight', apex: 1,
      xHeight: 0.75, counter: 0, aperture: 0, letterSpacing: 0.02 }),
  style('stepped', 'display', [], 'Stepped', ['futuristic', 'playful', 'innovative'], 'Workbench, Jersey 10, Pixelify Sans',
    'Wide, heavy letters built on a grid, after LOTECH: square counters, soft corners, and a stroke-wide step cut out of a corner here and there, as at the foot of the L.',
    { weight: 0.8, width: 0.85, contrast: 0.5, hWeight: 0.68, bowlForm: 'box', boxRound: 0.12, bowlJoin: 'square', squareness: 1, curve: 0, steps: 1,
      roundness: 0.3, terminalRun: 'straight', apex: 1, iForm: 'bars', xHeight: 0.72, extenders: 0.3, counter: 0.4, aperture: 0.3, letterSpacing: 0.1,
      glyphs: { O: { cornerSteps: { '0t1': 0, '0t3': 0 } }, 0: { cornerSteps: { '0t1': 0, '0t3': 0 } }, g: { cornerSteps: { '0t1': 0 } } } }),
  style('hairbox', 'display', [], 'Hairline Box', ['futuristic', 'sophisticated', 'innovative'], 'Syncopate, Michroma, Tektur',
    'A hairline drawn in rounded rectangles: A, M and N arch over, V and W cup, and wherever strokes meet the corner fills in with a curved wedge of ink.',
    { weight: 0.02, width: 0.62, height: 0.7, contrast: 0.5, squareness: 1, curve: 0, innerRound: 0.55, diagonals: 'arch', kForm: 'stem', yForm: 'cup',
      apex: 1, terminalRun: 'straight', iForm: 'bars', xHeight: 0.75, counter: 0.6, letterSpacing: 0.05 }),
  style('pinched', 'display', ['geometric'], 'Pinched', ['artistic', 'innovative', 'sophisticated'], 'Syne, Unbounded, Righteous',
    'Heavy geometric letters pinched to a point halfway up the lowercase: stems become hourglasses and round bowls wrap almond-shaped counters, after aplo.',
    { weight: 0.8, width: 0.6, contrast: 0.5, pinch: 1, curve: 0, geoHuman: 0, story: 'single', xHeight: 0.55, extenders: 0.6, counter: 1,
      overlap: 0.5, letterSpacing: 0.15 })
];

/* The style page's cards, in the order they are shown under each Category heading: the most useful
   starting points first, plain faces of middling weight and width that the sliders reshape into almost
   anything, then the ones set further out (very light or black, narrow or wide), and last those built
   on a special shape (box bowls, bent diagonals, pinches, steps, curls, swashes) that change less
   easily. Every card is solid letters, and no two are near-copies. Styles left out stay defined, so
   designs saved from them still open: those built on an effect (a fill other than solid ink, stencil
   gaps or a slice), and those too close to a card here or too rough to start from. */
const PAGE_ORDER = [
  // Sans Serif: the everyday text faces, then rounder, narrower and squarer, then the heavy and wide, then the odd one out
  'grotesque', 'humanist', 'geometric', 'soft', 'industrial', 'condensed', 'chunkyround', 'squircle', 'softcond',
  'extended', 'flared', 'inktrap', 'wide', 'mirrorsans',
  // Serif: book and news text, then the headline cuts, then the hairline, black and carved ones, then swashes
  'serif', 'news', 'oldstyle', 'venetian', 'headline', 'didone', 'serifitalic', 'condserif', 'hairserif', 'fatface',
  'wedge', 'copperplate', 'swashitalic',
  'softslab', 'slab', 'clarendon', 'humanslab', 'wideslab',
  'code', 'roundmono', 'typewriter', 'boldmono', 'scoreboard', 'boxmono', 'cursivemono',
  // Calligraphy: plain printing, then scripts from casual to formal, then the fast ones and blackletter
  'comic', 'upright', 'casual', 'marker', 'architect', 'upscript', 'informal', 'brush', 'chancery', 'swash',
  'signature', 'blackletter',
  // Display: poster letters made from the ordinary sliders, then those built on box bowls, bends, pinches and curls
  'woodtype', 'comicbook', 'display', 'bauhaus', 'octagon', 'techno', 'reverse', 'hairline', 'heavybox', 'boxcontrast',
  'modular', 'pinched', 'stepped', 'hairbox', 'nouveau'
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

/* label = the control's short title; friendly = what it does in plain words; tech = the typographer's term.
   A page shows its controls in the order they are listed here: the one used most leads, a choice of
   shape comes before the sliders that tune it (Bowls before Squareness, Bends before Peaks), the
   optional ones follow, and the advanced ones come last. The Letters page runs from a to Y. */
export const CONTROLS: Record<ControlKey, ControlDef> = {
  weight: { cat: 'weight', label: 'Weight', friendly: 'Make strokes thicker', tech: 'Weight', lo: 'Thin', hi: 'Bold', demo: 'n',
    explain: 'Letters widen a little so their insides stay open.' },
  width: { cat: 'size', label: 'Width', friendly: 'Make letters narrower or wider', tech: 'Width', lo: 'Condensed', hi: 'Expanded', demo: 'H',
    explain: 'Stretches letters sideways; strokes keep their thickness.' },
  height: { cat: 'size', label: 'Height', friendly: 'Make letters taller or shorter', tech: 'Height', lo: 'Short', hi: 'Tall', demo: 'Hx',
    explain: 'Moves the top of the capitals; lowercase follows.' },
  slant: { cat: 'size', label: 'Slant', friendly: 'Tilt the letters', tech: 'Slant', lo: 'Upright', hi: 'Italic', demo: 'Hn',
    explain: 'Leans each letter to the right, like an oblique italic.' },
  rotation: { cat: 'size', label: 'Rotation', friendly: 'Turn the letters round', tech: 'Rotation', lo: 'Anticlockwise', hi: 'Clockwise', demo: 'Hag', bipolar: true, degrees: true,
    explain: 'Turns each letter about its own middle, and spaces the letters to fit. Synced, every letter turns the same way; customize a letter to give it its own angle.' },
  contrast: { cat: 'weight', label: 'Contrast', friendly: 'Vary thick and thin strokes', tech: 'Contrast · Reverse contrast', lo: 'Reversed', hi: 'High', demo: 'HOe', bipolar: true,
    explain: 'Above the middle the horizontals thin out while the stems stay heavy; below it the stems thin out under heavy horizontals.' },
  pinch: { cat: 'weight', off: 0, label: 'Pinch', friendly: 'Thin every stroke to a point along one line', tech: 'Pinch · Waist', lo: 'Slight', hi: 'To a point', demo: 'aplo',
    explain: 'Strokes narrow in straight wedges toward a level line and swell back out above and below it: stems turn into hourglasses and round letters get almond-shaped counters. Position moves the line.' },

  build: { cat: 'curves', type: 'form', label: 'Built from', friendly: 'Draw letters as strokes or cut them from solid blocks', tech: 'Stroke or block construction', demo: 'EOS',
    explain: 'Blocks are solid shapes with their insides cut in as narrow slots. Weight closes the slots up, Roundness rounds the corners and slot ends, Joins the small inside curves. Lowercase become small capitals.' },
  bowlForm: { cat: 'curves', type: 'form', label: 'Bowls', friendly: 'Draw curves as ovals or as boxes', tech: 'Oval or box bowls', demo: 'OCS',
    explain: 'Box bowls have straight sides and corners that round on the outside and stay square on the inside. Squareness shapes the ovals.' },
  curve: { cat: 'curves', label: 'Curves', friendly: 'Make curves more geometric or organic', tech: 'Curve', lo: 'Geometric', hi: 'Organic', demo: 'Sae',
    explain: 'Compass-drawn circles, or fuller pen-like curves.' },
  squareness: { cat: 'curves', off: 0, label: 'Squareness', friendly: 'Turn circles into rounded squares', tech: 'Squareness · Superellipse', lo: 'Circle', hi: 'Square', demo: 'Oo',
    explain: 'Bowls square off while the corners stay smooth.' },
  chamfer: { cat: 'curves', off: 0, label: 'Facets', friendly: 'Cut curves into straight lines and corners', tech: 'Chamfer · Faceted', lo: 'Curved', hi: 'Cut', demo: 'Oes',
    explain: 'Curves become straight lines with cut-off corners.' },
  bowlJoin: { cat: 'curves', type: 'form', label: 'Joins', friendly: 'Curve bowls and arches out of their stems or run them in flat', tech: 'Bowl & shoulder joins', demo: 'dnu',
    explain: 'Square joins meet the stem in a flat top or bottom, like a D. Applies to b d p q g, n m h r u and a.' },
  overlap: { cat: 'curves', off: 1, label: 'Bowl overlap', friendly: 'Join or separate bowl and stem', tech: 'Bowl overlap', lo: 'Apart', hi: 'Merged', demo: 'bdpq',
    explain: 'Applies to b, d, p, q and the single-storey a.' },
  roundness: { cat: 'corners', label: 'Roundness', friendly: 'Make the letters softer or sharper', tech: 'Roundness', lo: 'Sharp', hi: 'Round', demo: 'Ek',
    explain: 'Corners and stroke ends round off; Joins rounds where strokes meet.' },
  bends: { cat: 'corners', type: 'form', label: 'Bends', friendly: 'Turn the strokes in a sharp point or a round bend', tech: 'Sharp or round vertices', demo: 'MNZ',
    explain: 'Where a stroke changes direction, as in A, M, N, V, W and Z: a point, or a round bend like bent wire. Peaks sets how wide.' },
  apex: { cat: 'corners', label: 'Peaks', friendly: 'Make peaks pointed or flat', tech: 'Apex', lo: 'Pointed', hi: 'Flat', demo: 'AV',
    explain: 'Where diagonals meet — the top of A, the bottom of V. With round bends, how wide they turn.' },
  steps: { cat: 'corners', off: 0, label: 'Steps', friendly: 'Cut a square step into the corners of the letters', tech: 'Stepped corners · Notches', lo: 'Small', hi: 'Stroke wide', demo: 'LOE',
    explain: 'Each square corner a stroke turns (every corner of box bowls), and each corner where two strokes end together (the foot of an L), gets a square notch, like a letter built on a grid. Customize a letter to step each corner its own way.' },
  joints: { cat: 'corners', off: 0, label: 'Ink traps', friendly: 'Thin the strokes where they meet', tech: 'Ink traps · Joints', lo: 'Solid', hi: 'Trapped', demo: 'nab',
    explain: 'Corners are carved out where strokes join.' },
  terminal: { cat: 'ends', type: 'options', label: 'Stroke ends', friendly: 'Choose how strokes end', tech: 'Letter endings · Terminals', demo: 'Cas',
    explain: 'The free tips of strokes, as on C, a, s and r: their shape, which way they run and how far they reach.' },
  serif: { cat: 'serifs', type: 'serif', label: 'Serifs', friendly: 'Add small feet to the strokes', tech: 'Serifs', demo: 'In',
    explain: 'Small finishing strokes at the ends of stems. Pick their shape, then set how long, how heavy and how sloped they are.' },
  serifTip: { cat: 'serifs', type: 'serifForm', zoom: true, label: 'Tips', friendly: 'Choose how the serifs finish', tech: 'Serif tips', demo: 'I',
    explain: 'The outer end of each serif: cut square, rounded off, drawn out to a point, or cut on a slant.' },
  serifBase: { cat: 'serifs', type: 'serifForm', zoom: true, label: 'Base', friendly: 'Keep the feet flat or arch them', tech: 'Flat or cupped serifs', demo: 'I',
    explain: 'A cupped serif arches up under its stem, so only its two tips touch the line, as in book faces cut by hand. The serifs across the ends of arms stay flat.' },
  serifSides: { cat: 'serifs', type: 'serifForm', label: 'Sides', friendly: 'Choose which way the serifs reach', tech: 'Serif direction · Half serifs', demo: 'Hn',
    explain: 'Serifs reach both ways from a stem, to the left or the right only, or only into the letter or out of it. A side faces into the letter where more of it stands beside the stem on the same line. The serifs across the ends of arms stay as they are.' },
  serifInner: { cat: 'serifs', type: 'serifForm', zoom: true, label: 'Inside serifs', friendly: 'Shape the serifs that reach into the letter on their own', tech: 'Inner & outer serifs', demo: 'n',
    explain: 'The serifs that reach into the letter take a shape, length and thickness of their own. The ones that reach out keep the shape picked under Serifs.' },
  serifBalance: { cat: 'serifs', zoom: true, bipolar: true, label: 'Balance', friendly: 'Reach further to one side', tech: 'Serif balance', lo: 'Left', hi: 'Right', demo: 'I',
    explain: 'The serifs on stems grow longer on one side and shorter on the other. In the middle both sides match.' },
  serifTops: { cat: 'serifs', bipolar: true, label: 'Top serifs', friendly: 'Make the serifs on top smaller or bigger', tech: 'Head serifs', lo: 'Small', hi: 'Large', demo: 'Hdn',
    explain: 'The serifs on top of stems, set apart from the feet on the baseline.' },
  serifArms: { cat: 'serifs', bipolar: true, label: 'Arm serifs', friendly: 'Make the serifs on arms smaller or bigger', tech: 'Arm serifs · Beaks', lo: 'Small', hi: 'Large', demo: 'ETZ',
    explain: 'The serifs across the ends of arms, as on E, F, L, T and Z: their length, their thickness against the other serifs, and how they lean. Leaning out, they splay away from the letter like the arms of a T bent down at the ends, cut square across at their tips.' },
  story: { cat: 'letters', type: 'story', label: 'Letter a', friendly: 'Choose the shape of the a', tech: 'Double / single storey a', demo: 'data',
    explain: 'Two-storey like book type, or one bowl like handwriting. Its foot can run out in a spur along the baseline.' },
  diagonals: { cat: 'letters', type: 'form', label: 'Letters A, V and W', friendly: 'Stand one side of A, V and W upright, or bend them into arches', tech: 'Symmetric, upright or arched diagonals', demo: 'AVW',
    explain: 'Two matching diagonals, or one diagonal leaning on an upright stem at the right (the upright A has no crossbar). Arches have no diagonals at all: A and N bend over like an upturned U, M with a stem down the middle, V is a U and W a U with a stem up the middle. Also v and w.' },
  gForm: { cat: 'letters', type: 'form', label: 'Letter g', friendly: 'Choose the shape of the g', tech: 'Single-storey g', demo: 'gag',
    explain: 'The tail hooks back under the bowl, or drops from its left side and hooks out to the right.' },
  iForm: { cat: 'letters', type: 'form', label: 'Letters I, J, i and l', friendly: 'Give I, J, i and l bars', tech: 'Barred I, J, i and l', demo: 'IJil',
    explain: 'A plain stem, or bars as in a typewriter face: i and l get a flag and a foot, I a bar at the top and foot, J a bar across the top.' },
  kForm: { cat: 'letters', type: 'form', label: 'Letter k', friendly: 'Choose where the arm and leg of k meet', tech: 'k and K junction', demo: 'kK',
    explain: 'The leg springs from the arm, both meet at the stem, or both meet at the end of a short bar.' },
  qForm: { cat: 'letters', type: 'form', label: 'Letter Q', friendly: 'Choose where the tail of Q goes', tech: 'Q tail', demo: 'QO',
    explain: 'The tail crosses the bowl at the bottom right, or runs from inside the bowl into its bottom right corner.' },
  rForm: { cat: 'letters', type: 'form', label: 'Letter R', friendly: 'Choose how the leg of R leaves the bowl', tech: 'R leg', demo: 'RP',
    explain: 'The leg runs down from the bowl, or the bowl\u2019s lower bar stops short of the stem and loops back round into the leg.' },
  sForm: { cat: 'letters', type: 'form', label: 'Letter s', friendly: 'Choose the shape of the s', tech: 'Spine of s', demo: 'sS$',
    explain: 'A spine curving from corner to corner, or running flat between two tight turns, like two rounded boxes stacked.' },
  yForm: { cat: 'letters', type: 'form', label: 'Letter Y', friendly: 'Choose the shape of the Y', tech: 'Forked or cup Y', demo: 'Yy',
    explain: 'Two arms forking off a stem, or a cup whose right side runs on down into a diagonal, like a 4. Also y.' },
  dots: { cat: 'letters', type: 'form', label: 'Dots', friendly: 'Make the dots square or round', tech: 'Tittles & periods', demo: 'ij.!',
    explain: 'The dots on i and j and in the punctuation, whatever the corners do.' },
  mirror: { cat: 'size', type: 'form', label: 'Mirror', friendly: 'Flip letters left to right', tech: 'Mirrored letters', demo: 'eRs',
    explain: 'Draws letters back to front. Customize one letter to mirror only that one, like the reversed e of a quirky display face.' },
  cursive: { cat: 'script', off: 0, label: 'Cursive', friendly: 'Add strokes that lead into the next letter', tech: 'Cursive · Entry & exit strokes', lo: 'Print', hi: 'Script', demo: 'nigu',
    explain: 'Strokes flick on toward the next letter, like script.' },
  wobble: { cat: 'script', off: 0, label: 'Hand-drawn', friendly: 'Make it look drawn by hand', tech: 'Hand-drawn · Irregularity', lo: 'Precise', hi: 'Wobbly', demo: 'Hand',
    explain: 'Strokes drift, swell and sit a little off the line.' },
  swash: { cat: 'script', off: 0, label: 'Swash capitals', friendly: 'Curl the capitals into flourishes', tech: 'Swash capitals', lo: 'Small', hi: 'Big', demo: 'PRT',
    explain: 'The first stroke of each capital runs on at the top left (the stem of P, the bar of T, or else the foot of A) and curls out, finishing like the other stroke ends: pick Rounded, Ball ends for a ball.' },

  xHeight: { cat: 'heights', label: 'Lowercase height', friendly: 'Make lowercase letters taller', tech: 'x-height', lo: 'Small', hi: 'Large', demo: 'Hxn',
    explain: 'Taller lowercase feels modern and reads well small.' },
  extenders: { cat: 'heights', label: 'Stem length', friendly: 'Make ascenders and descenders longer', tech: 'Ascenders & descenders', lo: 'Short', hi: 'Long', demo: 'hpdy',
    explain: 'The parts above (b, d, h) and below (g, p, y) the letters.' },
  tail: { cat: 'heights', label: 'Tails & hooks', friendly: 'Make tails and hooks longer or shorter', tech: 'Tail · Hook', lo: 'Short', hi: 'Long', demo: 'Qjty',
    explain: 'The trailing ends of Q, y, g, j, t, f and the comma.' },
  crossbar: { cat: 'heights', label: 'Crossbar height', friendly: 'Move the horizontal bars up or down', tech: 'Crossbar', lo: 'Low', hi: 'High', demo: 'AHe',
    explain: 'The bars in A, H and e, the waist of B, E, R, and the crossbars of f and t, and the top of the a\u2019s bowl.' },
  descender: { cat: 'heights', advanced: true, label: 'Descender length', friendly: 'Make only the descenders longer or shorter', tech: 'Descenders', lo: 'Short', hi: 'Long', demo: 'gpy',
    explain: 'The parts below the baseline, apart from the ascenders above the x-height.' },
  counter: { cat: 'insides', label: 'Inner space', friendly: 'Change the space inside letters', tech: 'Counter', lo: 'Small', hi: 'Large', demo: 'Bo',
    explain: 'The enclosed space inside O, B, a and e.' },
  aperture: { cat: 'insides', label: 'Openness', friendly: 'Open or close the mouths of letters', tech: 'Aperture', lo: 'Closed', hi: 'Open', demo: 'ces',
    explain: 'Open mouths on c, e and s stay readable when small.' },

  letterSpacing: { cat: 'spacing', label: 'Letter spacing', friendly: 'Add or remove space between letters', tech: 'Letter spacing · Tracking', lo: 'Tight', hi: 'Open', demo: 'type',
    explain: 'The same gap changes between every pair of letters.' },
  wordSpacing: { cat: 'spacing', label: 'Word spacing', friendly: 'Change the gap between words', tech: 'Word spacing', lo: 'Compact', hi: 'Spacious', demo: 'to be',
    explain: 'Too tight and words merge; too loose and lines fall apart.' },
  mono: { cat: 'spacing', off: 0, label: 'Monospace', friendly: 'Give every letter the same width', tech: 'Monospace', lo: 'Proportional', hi: 'Monospaced', demo: 'milk',
    explain: 'Every character takes the same width, like a typewriter.' },
  sideBearing: { cat: 'spacing', advanced: true, label: 'Side margins', friendly: 'Adjust the space around each letter', tech: 'Side bearing', lo: 'Narrow', hi: 'Wide', demo: 'HO',
    explain: 'The small margins built into each letter.' },

  fill: { cat: 'effects', type: 'fill', label: 'Fill', friendly: 'Build the letters from something else', tech: 'Fill', demo: 'Rg',
    explain: 'Solid ink, outlines, a grid of pixels, dots or lines, a line cut down the middle of each stroke, or a shadow cast down to the right. Size sets how coarse the grid is, how wide the line, or how far the shadow falls.' },
  stencil: { cat: 'effects', off: 0, label: 'Stencil', friendly: 'Cut gaps where the strokes meet', tech: 'Stencil', lo: 'Solid', hi: 'Wide gaps', demo: 'BOa',
    explain: 'Strokes break where they join, as if cut from a sheet. Thickness sets how wide the gaps open; Position moves the gaps out along the strokes; Rounding softens their corners.' },
  slice: { cat: 'effects', off: 0, label: 'Slice', friendly: 'Cut one line through every letter', tech: 'Slice', lo: 'None', hi: 'Wide', demo: 'type',
    explain: 'One horizontal cut runs across the whole line. Thickness sets how tall the cut is; Position moves it up or down; Rounding softens its corners.' }
};
/** The controls that shape letters built from blocks (see blocks.ts): their size, weight and corners, the
    hand, spacing and the effects that run on any outline. The rest shape strokes, which blocks don't have. */
export const BLOCK_CONTROLS: readonly ControlKey[] = ['weight', 'width', 'height', 'slant', 'rotation', 'build', 'roundness', 'mirror', 'wobble',
  'xHeight', 'letterSpacing', 'wordSpacing', 'mono', 'sideBearing', 'fill', 'slice'];
export const SERIF_SUBS: Record<SerifSubKey, SubControlDef> = {
  serifSize: { label: 'Length', friendly: 'Make the feet longer', tech: 'Serif size', lo: 'Short', hi: 'Long' },
  serifThickness: { label: 'Thickness', friendly: 'Make the feet heavier', tech: 'Serif thickness', lo: 'Hairline', hi: 'Heavy' },
  serifAngle: { label: 'Angle', friendly: 'Slope the top of the feet', tech: 'Serif angle', lo: 'Flat', hi: 'Sloped' },
  serifBracket: { label: 'Bracket', friendly: 'Curve the feet into the stem tightly or a long way up', tech: 'Bracket', lo: 'Tight', hi: 'Long', bipolar: true }
};
/** The sliders every serif shape has, and the finer ones of each shape, shown while that shape is picked. */
export const SERIF_SIZES: SerifSubKey[] = ['serifSize', 'serifThickness', 'serifAngle'];
export const SERIF_DETAILS: Record<SerifShape, SerifSubKey[]> = { bracketed: ['serifBracket'], unbracketed: [], slab: [], wedge: [], diamond: [] };
export const SERIF_TIP_SUBS: Record<SerifTipSubKey, SubControlDef> = {
  serifTipRound: { label: 'Roundness', friendly: 'Round the tips from soft corners to a half circle', tech: 'Tip radius', lo: 'Soft corners', hi: 'Half circle' },
  serifTipSlant: { label: 'Slant', friendly: 'Lean the cut under the tip or back over it', tech: 'Tip angle', lo: 'Undercut', hi: 'Sloped', bipolar: true }
};
/** The finer shape sliders of each kind of serif tip, shown while that kind is picked. */
export const SERIF_TIP_DETAILS: Record<SerifTip, SerifTipSubKey[]> = { square: [], round: ['serifTipRound'], pointed: [], angled: ['serifTipSlant'] };
export const SERIF_BASE_SUBS: Record<SerifBaseSubKey, SubControlDef> = {
  serifCup: { label: 'Depth', friendly: 'Arch the base a little or a lot', tech: 'Cup depth', lo: 'Shallow', hi: 'Deep' }
};
export const SERIF_INNER_SUBS: Record<SerifInnerSubKey, SubControlDef> = {
  serifInnerSize: { label: 'Length', friendly: 'Make the inside serifs shorter or longer than the outside ones', tech: 'Inner serif size', lo: 'Shorter', hi: 'Longer', bipolar: true },
  serifInnerThickness: { label: 'Thickness', friendly: 'Make the inside serifs lighter or heavier than the outside ones', tech: 'Inner serif thickness', lo: 'Lighter', hi: 'Heavier', bipolar: true }
};
export const SERIF_ARM_SUBS: Record<SerifArmSubKey, SubControlDef> = {
  serifArmThickness: { label: 'Thickness', friendly: 'Make the serifs on arms lighter or heavier than the rest', tech: 'Arm serif thickness', lo: 'Lighter', hi: 'Heavier', bipolar: true },
  serifArmLean: { label: 'Lean', friendly: 'Lean the serifs on arms in under the arm or splay them out', tech: 'Splayed arm serifs', lo: 'In', hi: 'Out', bipolar: true }
};
export const FILL_SUBS: Record<FillSubKey, SubControlDef> = {
  module: { label: 'Size', friendly: 'Change the size of the grid, the line or the shadow', tech: 'Module size', lo: 'Fine', hi: 'Coarse' }
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
export const BOWL_SUBS: Record<BowlSubKey, SubControlDef> = {
  boxRound: { label: 'Corners', friendly: 'Round the outside corners of box bowls tighter or wider; the inside stays square', tech: 'Box corner radius', lo: 'Sharp', hi: 'Wide' }
};
export const WEIGHT_SUBS: Record<WeightSubKey, SubControlDef> = {
  vWeight: { label: 'Verticals', friendly: 'Make the upright strokes lighter or heavier', tech: 'Stem weight', lo: 'Lighter', hi: 'Heavier', bipolar: true },
  hWeight: { label: 'Horizontals', friendly: 'Make the level strokes lighter or heavier', tech: 'Bar weight', lo: 'Lighter', hi: 'Heavier', bipolar: true }
};
export const ROUND_SUBS: Record<RoundSubKey, SubControlDef> = {
  joinRound: { label: 'Joins', friendly: 'Round the inside corners where one stroke meets another', tech: 'Fillets', lo: 'Sharp', hi: 'Round' },
  innerRound: { label: 'Counters', friendly: 'Round the corners inside the letters by the same amount, however light the strokes', tech: 'Counter corner radius', lo: 'As drawn', hi: 'Round' }
};
export const PINCH_SUBS: Record<PinchSubKey, SubControlDef> = {
  pinchPos: { label: 'Position', friendly: 'Move the pinch up or down the letters', tech: 'Pinch height', lo: 'Baseline', hi: 'Cap height' }
};
export const CROSSBAR_SUBS: Record<CrossbarSubKey, SubControlDef> = {
  barGap: { label: 'Gap', friendly: 'Open a gap where the crossbars meet other strokes: at the ends of the bars, or above and below them', tech: 'Crossbar gap', lo: 'Touching', hi: 'Apart' }
};
export const STENCIL_SUBS: Record<StencilSubKey, SubControlDef> = {
  stencil: { label: 'Thickness', friendly: 'Open the gaps wider', tech: 'Gap width', lo: 'Thin', hi: 'Thick' },
  stencilPos: { label: 'Position', friendly: 'Move the gaps out along the strokes, away from where they meet', tech: 'Gap position', lo: 'At the join', hi: 'Further out' },
  stencilRound: { label: 'Rounding', friendly: 'Round the corners the gaps cut', tech: 'Cut corner radius', lo: 'Sharp', hi: 'Round' }
};
export const SLICE_SUBS: Record<SliceSubKey, SubControlDef> = {
  slice: { label: 'Thickness', friendly: 'Make the cut taller', tech: 'Cut height', lo: 'Thin', hi: 'Thick' },
  slicePos: { label: 'Position', friendly: 'Move the cut up or down the letters', tech: 'Slice height', lo: 'Low', hi: 'High' },
  sliceRound: { label: 'Rounding', friendly: 'Round the corners the cut leaves', tech: 'Cut corner radius', lo: 'Sharp', hi: 'Round' }
};
export const SUBS: Record<SerifSubKey | SerifTipSubKey | SerifBaseSubKey | SerifInnerSubKey | SerifArmSubKey | FillSubKey | TerminalSubKey | DotSubKey | BowlSubKey | WeightSubKey | RoundSubKey | PinchSubKey | CrossbarSubKey | StencilSubKey | SliceSubKey, SubControlDef> =
  { ...SERIF_SUBS, ...SERIF_TIP_SUBS, ...SERIF_BASE_SUBS, ...SERIF_INNER_SUBS, ...SERIF_ARM_SUBS, ...FILL_SUBS, ...TERMINAL_SUBS, ...DOT_SUBS, ...BOWL_SUBS, ...WEIGHT_SUBS, ...ROUND_SUBS, ...PINCH_SUBS, ...CROSSBAR_SUBS, ...STENCIL_SUBS, ...SLICE_SUBS };
export const STORY_OPTIONS: [Exclude<Story, 'auto'>, string][] = [['double', 'Double'], ['single', 'Single']];
/** The letter-shape pickers: each option is drawn as the letter `ch` in that shape. */
export type FormKey = 'build' | 'mirror' | 'gForm' | 'kForm' | 'iForm' | 'sForm' | 'diagonals' | 'yForm' | 'qForm' | 'rForm' | 'bowlForm' | 'bends' | 'bowlJoin' | 'dots' | 'terminalRun' | 'aForm';
export const FORM_OPTIONS: { [K in FormKey]: { ch: string; options: [Exclude<Params[K], 'auto'>, string][] } } = {
  build: { ch: 'E', options: [['strokes', 'Strokes'], ['blocks', 'Blocks']] as [Build, string][] },
  gForm: { ch: 'g', options: [['hook', 'Hook'], ['mirrored', 'Mirrored']] as [GForm, string][] },
  kForm: { ch: 'k', options: [['arm', 'From arm'], ['stem', 'From stem'], ['bar', 'On a bar']] as [KForm, string][] },
  iForm: { ch: 'i', options: [['plain', 'Plain'], ['bars', 'Bars']] as [Exclude<IForm, 'auto'>, string][] },
  sForm: { ch: 's', options: [['curved', 'Curved'], ['flat', 'Flat spine']] as [SForm, string][] },
  diagonals: { ch: 'A', options: [['symmetric', 'Symmetric'], ['upright', 'Upright'], ['arch', 'Arches']] as [Diagonals, string][] },
  mirror: { ch: 'e', options: [['normal', 'As drawn'], ['mirrored', 'Mirrored']] as [Mirror, string][] },
  yForm: { ch: 'Y', options: [['forked', 'Forked'], ['cup', 'Cup']] as [YForm, string][] },
  qForm: { ch: 'Q', options: [['crossing', 'Crossing'], ['inside', 'Inside']] as [QForm, string][] },
  rForm: { ch: 'R', options: [['leg', 'Leg'], ['loop', 'Loop']] as [RForm, string][] },
  bowlForm: { ch: 'O', options: [['oval', 'Oval'], ['box', 'Box']] as [BowlForm, string][] },
  bends: { ch: 'N', options: [['sharp', 'Sharp'], ['round', 'Round']] as [Bends, string][] },
  terminalRun: { ch: 'c', options: [['curved', 'Curved'], ['straight', 'Straight']] as [TerminalRun, string][] },
  bowlJoin: { ch: 'd', options: [['curved', 'Curved'], ['square', 'Square']] as [BowlJoin, string][] },
  dots: { ch: 'i', options: [['square', 'Square'], ['round', 'Round']] as [Exclude<Dots, 'auto'>, string][] },
  aForm: { ch: 'a', options: [['plain', 'Plain'], ['spur', 'Spur']] as [AForm, string][] }
};
export const FILL_OPTIONS: [Fill, string][] = [['solid', 'Solid'], ['wire', 'Wireframe'], ['pixels', 'Pixels'], ['dots', 'Dots'], ['lines', 'Lines'], ['inline', 'Inline'], ['shadow', 'Shadow']];
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
  business: 'grotesque', calm: 'humanist', happy: 'soft', playful: 'display', cute: 'upright', childlike: 'casual',
  fancy: 'didone', sophisticated: 'chancery', artistic: 'brush', loud: 'fatface', rugged: 'marker', vintage: 'typewriter',
  futuristic: 'techno', sincere: 'clarendon', excited: 'marker', innovative: 'squircle', stiff: 'code'
};

/** First control of each category, opened when the category is picked. */
export const firstControl = (cat: CategoryId) =>
  (Object.keys(CONTROLS) as ControlKey[]).find(k => CONTROLS[k].cat === cat) ?? 'weight';

/** The control a key belongs to: serif sub-sliders fold into 'serif', the module size into 'fill',
    the stroke end length into 'terminal'. */
export const controlFor = (key: ActiveKey): ControlKey =>
  key in SERIF_SUBS ? 'serif' : key in SERIF_TIP_SUBS ? 'serifTip' : key in SERIF_BASE_SUBS ? 'serifBase' : key in SERIF_INNER_SUBS ? 'serifInner' : key in SERIF_ARM_SUBS ? 'serifArms' : key in FILL_SUBS ? 'fill' : key in TERMINAL_SUBS ? 'terminal' : key in DOT_SUBS ? 'dots' : key in BOWL_SUBS ? 'bowlForm' : key in WEIGHT_SUBS ? 'weight' : key in ROUND_SUBS ? 'roundness'
    : key in PINCH_SUBS ? 'pinch' : key in CROSSBAR_SUBS ? 'crossbar' : key in STENCIL_SUBS ? 'stencil' : key in SLICE_SUBS ? 'slice' : key as ControlKey;

/* ---------- finding a setting by name */

/** Words people reach for that a control's own copy doesn't use. */
const ALSO: Partial<Record<ActiveKey, string>> = {
  weight: 'bold heavy light thick thin black', slant: 'italic oblique lean', width: 'condensed expanded narrow wide', height: 'cap height size tall',
  rotation: 'rotate turn angle', mirror: 'flip reverse backwards', contrast: 'thick thin stress', letterSpacing: 'kerning tracking',
  mono: 'typewriter code fixed width', wobble: 'rough sketchy organic jitter', cursive: 'script connected joined', fill: 'outline texture pattern halftone',
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
