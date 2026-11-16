/* The starting styles: each one's settings, tags and description, and the cards the Style page shows.
   tools/fit/apply.ts rewrites the settings objects in place: keep each style a `style('<id>', ...)` call whose
   settings object is the first `{` after it, with no braces in names, families or descriptions. */
import { DEFAULTS, type Params } from '../params';
import { MOODS, looksOf, type Kind, type Look, type Mood, type StyleGroup } from './tags';

export interface StyleDef {
  id: string; name: string; group: StyleGroup; kinds: Kind[]; moods: Mood[]; desc: string;
  /** Google Fonts families in the same genre, for reference */
  like: string;
  params: Params;
  /** read off the params, see LOOKS */
  looks: Look[];
}

/** A starting style, from its id, Category (group), Classification tags (kinds), name, Feeling tags (moods), Google
    Fonts families like it, description, and its settings over DEFAULTS. The settings stay the last argument, an
    object literal, as tools/fit/apply.ts finds and rewrites them there. */
const style = (id: string, group: StyleGroup, kinds: Kind[], name: string, moods: Mood[], like: string, desc: string, p: Partial<Params>): StyleDef => {
  const params = { ...DEFAULTS, ...p };
  return { id, name, group, kinds, moods, desc, like, params, looks: looksOf(params) };
};

/* Ids are stored with saved designs and deep links (?style=), so they never change, even when a style is
   renamed, and never leave STYLES: the API refuses a design whose styleId isn't here (server/app.ts
   readDesign). Each id keys STYLE_FONTS (shared/free-fonts.ts) unless the style is built from blocks or arcs, which
   no font draws. */
export const STYLES: StyleDef[] = [
  /* ---- Sans Serif */
  style('geometric', 'sans', ['geometric'], 'Geometric', ['calm', 'business'], 'Poppins, Montserrat, Jost',
    'Built from circles and straight lines, after Futura: a light, even stroke, a small lowercase under tall ascenders, pointed peaks and a single-storey a.',
    { width: 0.36, contrast: 0.582, curve: 0, apex: 0.86, counter: 0.96, xHeight: 0.849, extenders: 0.57, aperture: 0, overlap: 0.29, story: 'single',
      letterSpacing: 0.24, vWeight: 0.42, hWeight: 0.48, roundness: 0.48, terminalLength: 0.52, squareness: 0.16, descender: 0.65, joinRound: 0.01,
      tail: 0.46, wordSpacing: 0.508, sideBearing: 0.675 }),
  style('grotesque', 'sans', ['neogrotesque'], 'Neo Grotesque', ['calm', 'business', 'stiff'], 'Roboto, Inter, Work Sans',
    'The Swiss workhorse, set bold and tight. A tall lowercase, closed-in openings and level stroke endings make it dense and matter-of-fact.',
    { weight: 0.62, width: 0.46, contrast: 0.542, curve: 0.035, aperture: 0.07, xHeight: 0.792, extenders: 0.52, apex: 0.94, counter: 0.28,
      letterSpacing: 0.12, hWeight: 0.58, roundness: 0.184, terminalLength: 0.58, squareness: 0.36, descender: 0.45, overlap: 0.9, joinRound: 0.12,
      tail: 0.14, wordSpacing: 0.384, sideBearing: 0.55 }),
  style('humanist', 'sans', ['humanist'], 'Humanist', ['business', 'calm', 'sincere'], 'Open Sans, Source Sans 3, Fira Sans',
    'Shaped like writing with a pen: wide-open letterforms, angled stroke ends, gentle contrast and a human rhythm.',
    { weight: 0.5, width: 0.44, contrast: 0.523, curve: 0.038, terminal: 'angled', xHeight: 0.82, extenders: 0.56, aperture: 0.789, apex: 0.94,
      story: 'double', hWeight: 0.4, roundness: 0.07, terminalLength: 0.38, squareness: 0.2, descender: 0.58, overlap: 0.49, gForm: 'double',
      wordSpacing: 0.429, sideBearing: 0.675 }),
  style('soft', 'sans', ['rounded'], 'Rounded', ['calm', 'happy', 'cute'], 'Nunito, Varela Round, Quicksand',
    'Light and round-ended, with big airy counters and generous spacing. Easy-going and friendly.',
    { weight: 0.3, width: 0.396, contrast: 0.5, roundness: 0.586, terminal: 'round', xHeight: 0.698, counter: 0.6, aperture: 0.43, apex: 1,
      story: 'double', letterSpacing: 0.26, hWeight: 0.44, curve: 0.017, terminalLength: 0.66, extenders: 0.43, descender: 0.46, overlap: 0.56,
      joinRound: 0.04, tail: 0.63, wordSpacing: 0.477, sideBearing: 0.619, squareness: 0.136 }),
  style('squircle', 'sans', ['superellipse'], 'Superellipse', ['futuristic', 'calm', 'innovative'], 'Unbounded, Syne, Lexend Zetta',
    'Chunky squircle bowls, halfway between a circle and a square, with rounded ends and strokes that pinch in where they meet. Soft but engineered.',
    { weight: 1, width: 0.75, contrast: 0.568, squareness: 0.372, joints: 0.55, roundness: 0.259, terminal: 'flat', curve: 0.012, apex: 0.84,
      xHeight: 0.833, counter: 0.52, vWeight: 0.34, hWeight: 0.82, aperture: 0.228, terminalLength: 0.33, terminalForm: 'plain', extenders: 0.48,
      descender: 0.3, overlap: 0.74, joinRound: 0.59, tail: 0.07, wordSpacing: 0.194, sideBearing: 0.475, letterSpacing: 0.213, story: 'single' }),
  style('industrial', 'sans', ['superellipse'], 'Industrial', ['business', 'stiff', 'futuristic'], 'Barlow, Saira, Encode Sans',
    'A road-sign sans after DIN: engineered from straight sides and squarish curves, with a big lowercase, level stroke ends and even spacing.',
    { weight: 0.5, width: 0.334, contrast: 0.508, curve: 0, apex: 1, xHeight: 0.755, extenders: 0.4, aperture: 0.228, counter: 0.48, story: 'double',
      letterSpacing: 0.16, hWeight: 0.47, crossbar: 0.52, roundness: 0.256, terminalLength: 0.81, descender: 0.53, overlap: 0.61, tail: 0.3,
      wordSpacing: 0.359, sideBearing: 0.65, squareness: 0.374 }),
  style('chunkyround', 'sans', ['rounded'], 'Chunky Rounded', ['happy', 'cute', 'childlike', 'playful'], 'Fredoka, Baloo 2, Mochiy Pop One',
    'Bold, round-ended and steady: a big lowercase with a single-storey a and soft, open shapes, like a friendly app icon.',
    { weight: 0.86, width: 0.399, contrast: 0.702, roundness: 0.536, terminal: 'round', curve: 0.048, xHeight: 0.735, aperture: 0.258,
      story: 'single', letterSpacing: 0.141, hWeight: 1, crossbar: 0.43, apex: 0.24, terminalLength: 0.58, terminalForm: 'round', extenders: 0.46,
      descender: 0.56, overlap: 0.52, joinRound: 0.08, tail: 0.48, wordSpacing: 0.307, sideBearing: 0.369 }),

  /* ---- Serif */
  style('oldstyle', 'serif', ['oldstyle'], 'Old Style', ['business', 'vintage', 'sophisticated', 'sincere'], 'EB Garamond, Cormorant Garamond, Crimson Pro',
    'Renaissance book type. Angled stress, steeply sloped serifs, a tiny lowercase under long ascenders and open, calligraphic curves.',
    { weight: 0.34, width: 0.3, contrast: 0.662, serif: true, serifThickness: 0.3, serifAngle: 0.92, terminal: 'cut', curve: 0.067, xHeight: 0.554,
      extenders: 0.53, aperture: 0.752, apex: 1, crossbar: 0.49, letterSpacing: 0.22, hWeight: 0.46, counter: 0.66, roundness: 0.39,
      terminalLength: 0.82, terminalCurl: 0.43, terminalForm: 'level', squareness: 0.12, descender: 0.86, overlap: 0.89, gForm: 'double',
      joinRound: 0.38, qForm: 'sweep', tail: 0.77, serifBracket: 0.58, serifTops: 0.26, serifArms: 0.7, serifArmThickness: 0.18, wordSpacing: 0.43,
      sideBearing: 0.531 }),
  style('serif', 'serif', ['transitional'], 'Transitional', ['business', 'calm', 'sincere'], 'Libre Baskerville, Source Serif 4, Lora',
    'Crisp serifs, clear thick-and-thin strokes, upright stress and ball endings. Made for headlines and long reads alike.',
    { weight: 0.53, contrast: 0.733, serif: true, serifSize: 0.34, serifThickness: 0.38, serifAngle: 0.06, terminal: 'round', terminalForm: 'ball',
      curve: 0.105, xHeight: 0.682, apex: 0.45, hWeight: 0.46, counter: 0.42, aperture: 0.24, roundness: 0.98, terminalLength: 0.58, squareness: 0.2,
      descender: 0.58, overlap: 0.72, gForm: 'double', joinRound: 0.02, qForm: 'sweep', tail: 0.43, serifBracket: 0.46, serifTops: 0.44,
      serifArms: 0.96, serifArmThickness: 0.74, wordSpacing: 0.404, sideBearing: 0.625, width: 0.489, letterSpacing: 0.206 }),
  style('didone', 'serif', ['didone'], 'Didone', ['fancy', 'sophisticated', 'vintage'], 'Playfair Display, Bodoni Moda, Prata',
    'Extreme contrast, set tall and narrow: heavy upright stems against hairline serifs and ball-shaped endings. Built for fashion covers.',
    { weight: 0.64, width: 0.42, height: 0.72, contrast: 0.995, serif: true, serifShape: 'wedge', serifSize: 0.28, serifThickness: 0.34,
      serifAngle: 0, terminal: 'round', terminalForm: 'ball', curve: 0.187, aperture: 0.15, xHeight: 0.746, apex: 0.68, hWeight: 0.82, counter: 0.56,
      crossbar: 0.52, roundness: 0.73, terminalLength: 0.76, terminalCurl: 0.52, squareness: 0.19, extenders: 0.6, descender: 0.34, overlap: 0.98,
      qForm: 'sweep', tail: 0.48, serifTops: 0.56, serifArms: 1, serifArmThickness: 0.9, wordSpacing: 0.401, sideBearing: 0.625 }),
  style('fatface', 'serif', ['fatface', 'didone'], 'Fat Face', ['loud', 'vintage', 'rugged'], 'Abril Fatface, Rozha One, Ultra',
    'A Didone pushed to the limit: stems as heavy as they go, hairlines as thin as they go, tiny counters.',
    { weight: 0.88, width: 0.4, contrast: 1, serif: true, serifShape: 'unbracketed', serifSize: 0.14, serifThickness: 0.36, serifAngle: 0.12,
      terminal: 'round', curve: 0.216, xHeight: 0.676, aperture: 0.144, counter: 0.42, letterSpacing: 0.18, hWeight: 0.8, crossbar: 0.64,
      roundness: 0.19, apex: 0.64, terminalLength: 1, terminalCurl: 0.2, terminalForm: 'ball', squareness: 0.12, extenders: 0.54, descender: 0.66,
      serifTops: 0.48, serifArms: 1, serifArmThickness: 1, wordSpacing: 0.199, sideBearing: 0.481 }),
  style('serifitalic', 'serif', ['didone'], 'Serif Italic', ['fancy', 'sophisticated', 'artistic'], 'Playfair Display Italic, Instrument Serif Italic, Bodoni Moda Italic',
    'The true italic of a high-contrast serif: leaning, flowing letters with hairline serifs, ball endings and a cursive a, g and y.',
    { width: 0.24, height: 0.62, slant: 0.4, contrast: 0.944, serif: true, serifShape: 'unbracketed', serifSize: 0.42, serifThickness: 0.92,
      serifAngle: 1, terminal: 'round', cursive: 0.45, curve: 1, xHeight: 0.74, extenders: 0.57, aperture: 0.296, apex: 0.97, letterSpacing: 0.12,
      counter: 0.58, crossbar: 0.59, roundness: 0.27, terminalLength: 0.94, terminalCurl: 0.54, squareness: 0.28, descender: 0.34, overlap: 0.44,
      joinRound: 0.04, qForm: 'sweep', tail: 0, serifTops: 0.34, serifArms: 1, serifArmThickness: 0.66, wordSpacing: 0.377, sideBearing: 0.756 }),

  /* ---- Slab Serif */
  style('softslab', 'slab', ['slab'], 'Soft Slab', ['sincere', 'calm', 'happy', 'business'], 'Roboto Slab, Kameron, Slabo 27px',
    'A friendly modern slab after Museo Slab: sturdy, even strokes and square slabs with their corners softened, over a big lowercase.',
    { weight: 0.62, width: 0.37, contrast: 0.502, serif: true, serifShape: 'slab', serifSize: 0.28, serifThickness: 0.6, serifAngle: 0.08,
      roundness: 0.696, curve: 0.084, xHeight: 0.791, aperture: 0.018, apex: 0.982, story: 'double', letterSpacing: 0.16, crossbar: 0.54,
      terminalLength: 0.68, squareness: 0.315, extenders: 0.57, descender: 0.45, overlap: 0.76, joinRound: 0.03, tail: 0.42, serifTops: 0.61,
      serifArms: 0.88, serifArmThickness: 0.62, wordSpacing: 0.397, sideBearing: 0.669 }),

  /* ---- Monospace */
  style('typewriter', 'mono', ['slab'], 'Typewriter', ['vintage', 'sincere'], 'Courier Prime, Cutive Mono, Special Elite',
    'Every letter the same width, with soft slab serifs and slightly uneven ink, like keys struck through a ribbon.',
    { weight: 0.62, contrast: 0.613, serif: true, serifShape: 'slab', serifThickness: 0.53, serifAngle: 0, mono: 1, wobble: 0.15, roundness: 1,
      terminal: 'round', curve: 0, xHeight: 0.851, wordSpacing: 0, width: 0.57, vWeight: 0.34, counter: 0.64, aperture: 0, crossbar: 0.37, apex: 1,
      terminalLength: 0.89, squareness: 0.44, extenders: 0.62, descender: 0.48, overlap: 0.4, joinRound: 0.11, qForm: 'inside', tail: 1,
      serifTops: 0.55, serifArms: 1, serifArmThickness: 0.61, sideBearing: 0.662, letterSpacing: 0.24 }),
  style('code', 'mono', [], 'Code', ['calm', 'futuristic', 'stiff'], 'IBM Plex Mono, Space Mono, Ubuntu Mono',
    'A code-editor face: one narrow width for every character, a tall x-height, squarish bowls and slight ink traps that keep it crisp at small sizes.',
    { weight: 0.62, width: 0.4, mono: 1, squareness: 0.18, joints: 0.3, curve: 0.11, xHeight: 0.777, extenders: 0.53, aperture: 0.708, apex: 0.99,
      hWeight: 0.44, counter: 0.86, crossbar: 0.54, roundness: 0.05, terminalLength: 0.96, gForm: 'double', joinRound: 0.07, tail: 0.54,
      wordSpacing: 1, sideBearing: 0.538, contrast: 0.503 }),

  /* ---- Calligraphy */
  style('casual', 'hand', ['handwritten', 'informal', 'monoline'], 'Casual Handwriting', ['happy', 'playful', 'childlike'], 'Caveat, Indie Flower, Shadows Into Light',
    'Quick everyday handwriting with a felt pen: narrow, a little slanted, with small flicks at the stroke ends and letters that never sit quite still.',
    { weight: 0.44, width: 0.206, height: 0.62, slant: 0.25, roundness: 0.98, terminal: 'round', wobble: 0.5, cursive: 0.3, xHeight: 0.427, curve: 1,
      letterSpacing: 0.303, counter: 0.26, aperture: 0.604, crossbar: 0.88, apex: 0.96, terminalLength: 1, extenders: 0.4, descender: 0.46,
      story: 'single', joinRound: 0.04, qForm: 'sweep', tail: 0, wordSpacing: 0.483, sideBearing: 0.888, squareness: 0.272, contrast: 0.538 }),
  style('informal', 'hand', ['informal'], 'Retro Script', ['vintage', 'playful', 'artistic', 'excited'], 'Pacifico, Lobster, Yellowtail',
    'A bold, joined-up script with a retro sign-painter swing: every letter flows into the next.',
    { weight: 0.46, width: 0.199, slant: 0.45, contrast: 0.681, roundness: 0.63, terminal: 'round', wobble: 0.25, cursive: 1, xHeight: 0.37,
      curve: 0.791, vWeight: 0.46, hWeight: 0.86, counter: 1, extenders: 0.81, descender: 0.7, wordSpacing: 0.362, sideBearing: 0.35, aperture: 0.794,
      letterSpacing: 0.206 }),
  style('chancery', 'hand', ['formal'], 'Formal Script', ['fancy', 'sophisticated'], 'Great Vibes, Tangerine, Pinyon Script',
    'Copperplate elegance: a steep slant, hairline upstrokes, swelling downstrokes and a tiny x-height.',
    { weight: 0.36, width: 0.32, height: 0.75, slant: 1, contrast: 0.932, terminal: 'tapered', cursive: 1, xHeight: 0.499, curve: 1,
      letterSpacing: 0.2, aperture: 0.8 }),
  style('blackletter', 'hand', ['blackletter'], 'Blackletter', ['vintage', 'rugged', 'fancy'], 'UnifrakturMaguntia, Pirata One, Grenze Gotisch',
    'Gothic textura from a broad pen: tall, narrow and packed close, every curve broken into straight cuts, each stem standing on a diamond.',
    { weight: 0.62, width: 0.2, height: 0.72, contrast: 0.892, chamfer: 1, squareness: 1, curve: 1, serif: true, serifShape: 'diamond',
      serifSize: 0.18, serifThickness: 0.5, serifAngle: 1, terminal: 'angled', xHeight: 0.743, extenders: 0.45, aperture: 0.4, apex: 0, counter: 0.3,
      letterSpacing: 0.12 }),
  style('comic', 'hand', ['handwritten', 'upright'], 'Comic', ['childlike', 'happy', 'playful', 'sincere'], 'Comic Neue, Short Stack, Schoolbell',
    'Speech-bubble lettering: an even, round-ended pen line, upright and open, drawn neatly enough to read at any size.',
    { weight: 0.3, width: 0.38, contrast: 0.58, roundness: 0.04, terminal: 'tapered', wobble: 0.12, curve: 0.398, xHeight: 0.757, counter: 0.52,
      aperture: 0.222, story: 'single', letterSpacing: 0.18, hWeight: 0.66, crossbar: 0.58, apex: 0.91, terminalLength: 0.96, terminalCurl: 0.45,
      terminalForm: 'brush', extenders: 0.42, descender: 0.52, overlap: 0.56, joinRound: 0.22, qForm: 'inside', tail: 0.57, wordSpacing: 0.676,
      sideBearing: 0.663 }),

  /* ---- Blocks: Block is written in Bulwark, the engine's block letters made a font of TypeLab's own, so every setting
     reaches it as it reaches the other cards' fonts; the slot and grid blocks are built from blocks
     (shared/engine/blocks.ts, grid-blocks.ts), and no font stands behind them */
  style('block', 'blocks', [], 'Block', ['loud', 'futuristic', 'business'], 'Eurostile, Russo One, Michroma',
    'Plain, solid block letters: even strokes, square bowls with softly rounded corners, open counters and a real lowercase. Every setting reshapes them, serifs, stroke ends and letter forms too.',
    { weight: 0.7, width: 0.56, contrast: 0.531, hWeight: 0.98, xHeight: 0.741, bowlForm: 'box', boxRound: 0.55, curve: 0.136, overlap: 0.76,
      roundness: 0.42, joinRound: 0.07, apex: 0.81, terminalLength: 0.79, terminalCurl: 0.08, crossbar: 0.54, descender: 0.52, counter: 0.55,
      story: 'double', aperture: 0.404 }),
  style('slotblocks', 'blocks', [], 'Slot Blocks', ['loud', 'playful', 'futuristic'], 'Bungee, Dela Gothic One, Rammetto One',
    'Solid round-cornered blocks with their counters cut in as narrow slots, after a heavy 70s poster face, the small letters as small capitals. Weight closes the slots up and Roundness softens every corner.',
    { build: 'blocks', blockForm: 'slots', weight: 0.6, roundness: 1, joinRound: 0.5, sideBearing: 0.31 }),
  style('gridblocks', 'blocks', [], 'Grid Blocks', ['futuristic', 'playful'], 'Silkscreen, Pixelify Sans, Tiny5',
    'Letters of cells on a grid five high, the small letters as tall as the capitals, every corner round and cells meeting at a corner joined through a neck. Weight thickens every cell and Width stretches it.',
    { build: 'blocks', blockForm: 'grid', weight: 0.4, roundness: 1, sideBearing: 0.27 }),

  /* ---- Arcs: every letter a few cuts of one circle (shared/engine/arcs.ts); no font stands behind them */
  style('arcs', 'arcs', [], 'Arcs', ['artistic', 'playful', 'sophisticated'], 'Megrim, Poiret One, Comfortaa',
    'Every letter cut from one circle: a fine, even line of loops, half turns and three-quarter turns running into their neighbours, with a lowercase and punctuation drawn the same way. Heavier, the loops grow rounder and the letters wider.',
    { build: 'arcs', weight: 0.2, terminal: 'round', terminalForm: 'round' }),

  /* ---- Display (Wood Type is shown with the slab serifs) */
  style('woodtype', 'slab', ['slab'], 'Wood Type', ['rugged', 'vintage', 'loud'], 'Alfa Slab One, Sancreek, Rye',
    'Poster letters cut from wood for Wild West handbills: heavy, compact and squared, with chunky slabs.',
    { weight: 1, width: 0.574, height: 0.62, contrast: 0.527, serif: true, serifShape: 'slab', serifSize: 0.22, serifThickness: 1, serifAngle: 0,
      xHeight: 0.739, aperture: 0.168, counter: 0.24, apex: 1, letterSpacing: 0.313, hWeight: 1, crossbar: 0.52, roundness: 0.802, curve: 0.279,
      terminal: 'flat', terminalLength: 0.18, terminalForm: 'plain', extenders: 0.35, descender: 0.65, overlap: 0.57, joinRound: 0.46, tail: 0.04,
      serifTops: 0.42, serifArms: 1, serifArmThickness: 0.72, wordSpacing: 0.309, sideBearing: 0.369, squareness: 0.646 }),
];

/* The style page's cards, in the order they are shown under each Category heading: one base font for
   each build of letters the sliders can't reach from another card, chosen for its many weights and italics,
   since a setting moves the letters furthest and cleanest from a family's own nearest weight. The heavy
   and wide, the fat face, the heavy slab, the slab mono and the italic have cards of their own because
   rebuilding them from a nearer card with their own settings breaks their letters up; every other style
   rebuilds cleanly from a card here, and the display looks (box bowls, octagons, pinches, steps,
   hairlines) are settings over these. Letters built from blocks or arcs are builds of their own, picked only here
   (no control changes a build): under Blocks, Bulwark, the basic block letters made a font, then the slot and the
   grid blocks, and under Arcs the arc letters; no font stands behind those, so their cards draw the engine's
   letters. Every card is solid letters
   (tests/styles.test.ts checks). Styles off the page stay in STYLES, so designs saved from them still open. */
const PAGE_ORDER = [
  // Sans Serif: the everyday text faces, then rounded and squared, then the wide and the heavy rounded
  'grotesque', 'humanist', 'geometric', 'soft', 'industrial', 'squircle', 'chunkyround',
  // Serif: transitional and old style book type, then the didone, its italic and its fat face
  'serif', 'oldstyle', 'didone', 'serifitalic', 'fatface',
  'softslab', 'woodtype',
  'code', 'typewriter',
  // Calligraphy: printing, handwriting, a retro and a formal script, and blackletter
  'comic', 'casual', 'informal', 'chancery', 'blackletter',
  // Blocks: solid block letters, plain, slotted and on a grid
  'block', 'slotblocks', 'gridblocks',
  // Arcs: letters cut from one circle
  'arcs'
];
export const PAGE_STYLES = PAGE_ORDER.map(id => STYLES.find(s => s.id === id)!);

/** Fewest cards a Feeling holds to be one of the Style page's chips: a feeling that leaves a card or two is a way to
    those cards rather than a filter. Search still finds a style by every feeling it carries. */
export const FEELING_MIN = 3;
/** The Feelings the Style page offers as chips, read off the cards, so one comes and goes as styles are tagged. */
export const FEELINGS = MOODS.filter(m => PAGE_STYLES.filter(s => s.moods.includes(m.id)).length >= FEELING_MIN);

export const styleById = (id: string | null | undefined) => STYLES.find(s => s.id === id);

/** The card of each build of letters other than strokes, by build or kind of blocks: the basic block letters' is
    Bulwark's, the font made of them. */
const BUILT_CARDS: Record<string, string> = { arcs: 'arcs', basic: 'block', slots: 'slotblocks', grid: 'gridblocks' };
/** The style a design starts from, as its letters show it: its own, or, for a design built otherwise than its style
    (saved while Built from was still a control), the card of the letters it is built from. */
export function startStyle(styleId: string | null | undefined, p: Pick<Params, 'build' | 'blockForm'>): StyleDef | undefined {
  const s = styleById(styleId);
  if (p.build === 'strokes' || (s?.params.build === p.build && (p.build !== 'blocks' || s.params.blockForm === p.blockForm))) return s;
  return styleById(BUILT_CARDS[p.build === 'blocks' ? p.blockForm : p.build]) ?? s;
}
