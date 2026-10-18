/* Free fonts: each starting style can be written in a ready-made font, free to use, change and share, all but the
   ones built from blocks, which no font draws. The 22 styles on the Style page are written in TypeLab's own fonts
   (OWN_FAMILIES), drawn for it on specimen sheets (Block's from the engine's block letters) and kept in fonts/ as the
   engine draws them; the styles off
   the page keep a font from Google Fonts (SIL Open Font License or Apache 2.0), fetched and converted by the server
   (server/free-fonts.ts). Each style's pick (STYLE_FONTS) is a family like it, in the weight and italic closest to
   its look, and the style's settings are fitted to that font (tools/fit). A design written in it keeps those
   settings as the ones its letters stand for (Params.freeAt), and its letters are drawn as the font has them until a
   setting moves from there (see freeLetters in shared/engine/free-letters.ts). */

/** A family: its designers, the weights it comes in upright and in italic (up to 900, the heaviest the font
    files the server fetches come in), the licence it comes under (its folder in github.com/google/fonts; null for
    TypeLab's own, which are never fetched: theirs is ownLicense's) and the names its licence reserves, which a changed
    font may not take (see server/export.ts). */
export interface FreeFamily {
  designers: string[]; weights: number[]; italics: number[]; license: 'ofl' | 'apache' | null; reserved: string[];
  /** drawn on a grid of pixels, which moving its letters on their skeletons would break: only its own
      weights and a plain stretch reach it (see skin.ts) */ grid?: true;
  /** one of TypeLab's own fonts (OWN_FAMILIES): kept in fonts/, not fetched */ own?: true;
  /** a script whose letters stand apart, joined to none: each small letter's exit stroke ends free, and Length and
      Curl draw it on and curl it as they do a stroke end (see terminalEnds in restyle.ts) */ freeExits?: true;
  /** block letters (Bulwark, the engine's): their stroke ends stand out short and heavy from the strokes they leave, and
      a new end is drawn on the stub itself (RestyleCtx.stubs in restyle.ts) */ blocks?: true;
  /** its letters are drawn in forms the engine's can't stand in for (a blackletter's, a joined script's, a narrow
      italic's): the letter-form settings, whose other forms are the engine's letters (its twin's), keep its own
      (formChanged in free-letters.ts, skinFollows in skin.ts) */ ownForms?: true;
}

/** TypeLab's own fonts, one for each card of the Style page: drawn for TypeLab, free to use, change and share under the
    SIL Open Font License (ownLicense). Each comes in one weight, upright or italic, and is drawn on its specimen sheet
    (Asset/After/<sheet>.ai), which tools/fonts/import.ts makes into fonts/<Family>-<weight>.json; one with no sheet
    (Bulwark, the Block card's) is the engine's block letters, which tools/fonts/blocks.ts writes there in every
    weight it comes in (`weights`; `weight` is its card's), as a Google family comes in several, so Weight draws each
    from the one nearest. Their names
    are kept in saved designs (as font ids), so they never change. A script whose letters don't join is `freeExits`
    (see FreeFamily). */
export const OWN_FAMILIES: Record<string, { weight: number; weights?: number[]; italic: boolean; sheet?: number; freeExits?: true; blocks?: true; ownForms?: true }> = {
  Ballyhoo: { weight: 400, italic: false, sheet: 1 },
  Timber: { weight: 400, italic: false, sheet: 2 },
  Turnpike: { weight: 500, italic: false, sheet: 3 },
  Jotter: { weight: 400, italic: false, sheet: 4 },
  Funnies: { weight: 400, italic: false, sheet: 5 },
  Dispatch: { weight: 400, italic: false, sheet: 6 },
  Vellum: { weight: 400, italic: false, sheet: 7 },
  Gumdrop: { weight: 700, italic: false, sheet: 8 },
  Serenade: { weight: 400, italic: false, sheet: 9, freeExits: true, ownForms: true },
  Kernel: { weight: 500, italic: false, sheet: 10 },
  Almanac: { weight: 500, italic: false, sheet: 11 },
  Cotton: { weight: 300, italic: false, sheet: 12 },
  Parlance: { weight: 500, italic: false, sheet: 13 },
  Boardwalk: { weight: 400, italic: false, sheet: 14, ownForms: true },
  Sonnet: { weight: 400, italic: true, sheet: 15, ownForms: true },
  Couture: { weight: 600, italic: false, sheet: 16 },
  Compass: { weight: 300, italic: false, sheet: 17 },
  Mainline: { weight: 600, italic: false, sheet: 18 },
  Hearth: { weight: 600, italic: false, sheet: 19 },
  Orbital: { weight: 600, italic: false, sheet: 20 },
  Cathedral: { weight: 400, italic: false, sheet: 21, ownForms: true },
  Bulwark: { weight: 700, weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italic: false, blocks: true }
};

/** The licence TypeLab's own fonts come under, by name and address, and the file in fonts/ holding it in full. */
export const OWN_LICENSE = { name: 'SIL Open Font License, Version 1.1', url: 'https://openfontlicense.org', file: 'OFL.txt' } as const;

/** The copyright notice and licence one of TypeLab's own fonts comes under, so they travel with it (`lines` as a
    licence file opens, `copyright` as a font's name table has it): TypeLab's, under the SIL Open Font License, which
    lets anyone use, change and share it, and sell what they make with it, though not the font by itself. */
export function ownLicense() {
  const lines = ['Copyright 2026 TypeLab.'];
  return { lines, copyright: lines.join(' '), license: OWN_LICENSE.name, licenseUrl: OWN_LICENSE.url };
}

export const FREE_FAMILIES: Record<string, FreeFamily> = {
  "Alegreya": { designers: ["Juan Pablo del Peral", "HT Fonts"], weights: [400, 500, 600, 700, 800, 900], italics: [400, 500, 600, 700, 800, 900], license: 'ofl', reserved: [] },
  "Architects Daughter": { designers: ["Kimberly Geswein"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Bangers": { designers: ["Vernon Adams"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Bevan": { designers: ["Vernon Adams"], weights: [400], italics: [400], license: 'ofl', reserved: [] },
  "Bree Serif": { designers: ["TypeTogether"], weights: [400], italics: [], license: 'ofl', reserved: ["Bree", "Bree Serif"] },
  "Bricolage Grotesque": { designers: ["Mathieu Triay"], weights: [200, 300, 400, 500, 600, 700, 800], italics: [], license: 'ofl', reserved: [] },
  "Bungee": { designers: ["David Jonathan Ross"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Bungee Inline": { designers: ["David Jonathan Ross"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Bungee Outline": { designers: ["David Jonathan Ross"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Bungee Shade": { designers: ["David Jonathan Ross"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Cabin Sketch": { designers: ["Impallari Type"], weights: [400, 700], italics: [], license: 'ofl', reserved: ["Cabin", "Cabin Sketch"] },
  "Caprasimo": { designers: ["The DocRepair Project", "Phaedra Charles", "Flavia Zimbardi"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Chakra Petch": { designers: ["Cadson Demak"], weights: [300, 400, 500, 600, 700], italics: [300, 400, 500, 600, 700], license: 'ofl', reserved: [] },
  "Chewy": { designers: ["Sideshow"], weights: [400], italics: [], license: 'apache', reserved: [] },
  "Cinzel": { designers: ["Natanael Gama"], weights: [400, 500, 600, 700, 800, 900], italics: [], license: 'ofl', reserved: [] },
  "Cormorant": { designers: ["Christian Thalmann"], weights: [300, 400, 500, 600, 700], italics: [300, 400, 500, 600, 700], license: 'ofl', reserved: [] },
  "Creepster": { designers: ["Sideshow"], weights: [400], italics: [], license: 'ofl', reserved: ["Creepster"] },
  "Crete Round": { designers: ["TypeTogether"], weights: [400], italics: [400], license: 'ofl', reserved: ["Crete", "Crete Round"] },
  "DM Serif Display": { designers: ["Colophon Foundry"], weights: [400], italics: [400], license: 'ofl', reserved: ["Source"] },
  "Dancing Script": { designers: ["Impallari Type"], weights: [400, 500, 600, 700], italics: [], license: 'ofl', reserved: ["Dancing Script"] },
  "Dela Gothic One": { designers: ["artakana"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Doto": { designers: ["\u00d3liver Lalan"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [], license: 'ofl', reserved: [] },
  "Ewert": { designers: ["Johan Kallas", "Mihkel Virkus"], weights: [400], italics: [], license: 'ofl', reserved: ["Ewert"] },
  "Faster One": { designers: ["Eduardo Tunni"], weights: [400], italics: [], license: 'ofl', reserved: ["Faster"] },
  "Instrument Serif": { designers: ["Rodrigo Fuenzalida", "Jordan Egstad"], weights: [400], italics: [400], license: 'ofl', reserved: [] },
  "Italiana": { designers: ["Santiago Orozco"], weights: [400], italics: [], license: 'ofl', reserved: ["Italiana"] },
  "Josefin Slab": { designers: ["Santiago Orozco"], weights: [100, 200, 300, 400, 500, 600, 700], italics: [100, 200, 300, 400, 500, 600, 700], license: 'ofl', reserved: ["Josefin"] },
  "Kanit": { designers: ["Cadson Demak"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [100, 200, 300, 400, 500, 600, 700, 800, 900], license: 'ofl', reserved: [] },
  "Kaushan Script": { designers: ["Impallari Type"], weights: [400], italics: [], license: 'ofl', reserved: ["Kaushan Script"] },
  "Libre Caslon Text": { designers: ["Impallari Type"], weights: [400, 700], italics: [400], license: 'ofl', reserved: [] },
  "Libre Franklin": { designers: ["Impallari Type"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [100, 200, 300, 400, 500, 600, 700, 800, 900], license: 'ofl', reserved: [] },
  "M PLUS 1 Code": { designers: ["Coji Morishita"], weights: [100, 200, 300, 400, 500, 600, 700], italics: [], license: 'ofl', reserved: [] },
  "Macondo": { designers: ["John Vargas Beltr\u00e1n"], weights: [400], italics: [], license: 'ofl', reserved: ["Macondo"] },
  "Major Mono Display": { designers: ["Emre Parlak"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Marcellus": { designers: ["Astigmatic"], weights: [400], italics: [], license: 'ofl', reserved: ["Marcellus"] },
  "Martian Mono": { designers: ["Roman Shamin", "Evil Martians"], weights: [100, 200, 300, 400, 500, 600, 700, 800], italics: [], license: 'ofl', reserved: [] },
  "Michroma": { designers: ["Vernon Adams"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Monoton": { designers: ["Vernon Adams"], weights: [400], italics: [], license: 'ofl', reserved: ["Monoton"] },
  "Mrs Saint Delafield": { designers: ["Sudtipos"], weights: [400], italics: [], license: 'ofl', reserved: ["Mrs Saint Delafield"] },
  "Neonderthaw": { designers: ["Robert Leuschke"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Noto Sans": { designers: ["Google"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [100, 200, 300, 400, 500, 600, 700, 800, 900], license: 'ofl', reserved: [] },
  "Orbitron": { designers: ["Matt McInerney"], weights: [400, 500, 600, 700, 800, 900], italics: [], license: 'ofl', reserved: ["Orbitron"] },
  "Oswald": { designers: ["Vernon Adams", "Kalapi Gajjar", "Cyreal"], weights: [200, 300, 400, 500, 600, 700], italics: [], license: 'ofl', reserved: [] },
  "Outfit": { designers: ["Smartsheet Inc", "Rodrigo Fuenzalida"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [], license: 'ofl', reserved: [] },
  "PT Serif": { designers: ["ParaType"], weights: [400, 700], italics: [400, 700], license: 'ofl', reserved: ["PT Sans", "PT Serif", "ParaType"] },
  "Parisienne": { designers: ["Astigmatic"], weights: [400], italics: [], license: 'ofl', reserved: ["Parisienne"] },
  "Patrick Hand": { designers: ["Patrick Wagesreiter"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Permanent Marker": { designers: ["Font Diner"], weights: [400], italics: [], license: 'apache', reserved: [] },
  "Poiret One": { designers: ["Denis Masharov"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Raleway": { designers: ["Matt McInerney", "Pablo Impallari", "Rodrigo Fuenzalida"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [100, 200, 300, 400, 500, 600, 700, 800, 900], license: 'ofl', reserved: ["Raleway"] },
  "Rammetto One": { designers: ["Vernon Adams"], weights: [400], italics: [], license: 'ofl', reserved: ["Rammetto"] },
  "Righteous": { designers: ["Astigmatic"], weights: [400], italics: [], license: 'ofl', reserved: ["Righteous"] },
  "Rozha One": { designers: ["Indian Type Foundry"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Rubik Mono One": { designers: ["Hubert and Fischer"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Russo One": { designers: ["Jovanny Lemonad"], weights: [400], italics: [], license: 'ofl', reserved: ["Russo"] },
  "Saira Extra Condensed": { designers: ["Omnibus-Type"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [], license: 'ofl', reserved: ["Saira"] },
  "Share Tech Mono": { designers: ["Carrois Apostrophe"], weights: [400], italics: [], license: 'ofl', reserved: ["Share"] },
  "Shrikhand": { designers: ["Jonny Pinhorn"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Silkscreen": { designers: ["Jason Kottke"], weights: [400, 700], italics: [], license: 'ofl', reserved: [], grid: true },
  "Sniglet": { designers: ["Haley Fiege"], weights: [400, 800], italics: [], license: 'ofl', reserved: [] },
  "Sofia": { designers: ["LatinoType"], weights: [400], italics: [], license: 'ofl', reserved: ["Sofia"] },
  "Space Grotesk": { designers: ["Florian Karsten"], weights: [300, 400, 500, 600, 700], italics: [], license: 'ofl', reserved: [] },
  "Space Mono": { designers: ["Colophon Foundry"], weights: [400, 700], italics: [400, 700], license: 'ofl', reserved: [] },
  "Squada One": { designers: ["Joe Prince"], weights: [400], italics: [], license: 'ofl', reserved: ["Squada", "Squada One"] },
  "Stardos Stencil": { designers: ["Vernon Adams"], weights: [400, 700], italics: [], license: 'ofl', reserved: ["Stardos", "Stardos Stencil"] },
  "Stint Ultra Expanded": { designers: ["Astigmatic"], weights: [400], italics: [], license: 'ofl', reserved: ["Stint Ultra Expanded"] },
  "Syncopate": { designers: ["Astigmatic"], weights: [400, 700], italics: [], license: 'apache', reserved: [] },
  "Syne": { designers: ["Bonjour Monde", "Lucas Descroix", "George Triantafyllakos"], weights: [400, 500, 600, 700, 800], italics: [], license: 'ofl', reserved: [] },
  "VT323": { designers: ["Peter Hull"], weights: [400], italics: [], license: 'ofl', reserved: [], grid: true },
  "Victor Mono": { designers: ["Rune Bj\u00f8rner\u00e5s"], weights: [100, 200, 300, 400, 500, 600, 700], italics: [100, 200, 300, 400, 500, 600, 700], license: 'ofl', reserved: [] },
  "Workbench": { designers: ["Jens Kut\u00edlek"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Xanh Mono": { designers: ["Yellow Type", "L\u00e2m B\u1ea3o", "Duy Dao"], weights: [400], italics: [400], license: 'ofl', reserved: [] },
  ...Object.fromEntries(Object.entries(OWN_FAMILIES).map(([family, o]): [string, FreeFamily] =>
    [family, { designers: ['TypeLab'], weights: o.italic ? [] : o.weights ?? [o.weight], italics: o.italic ? [o.weight] : [], license: null, reserved: [], own: true, ...(o.freeExits ? { freeExits: true } : {}), ...(o.blocks ? { blocks: true } : {}), ...(o.ownForms ? { ownForms: true } : {}) }]))
};

/** The free font each starting style is written in, by style id, as a font id (see fontId); none for a style built
    from blocks. */
export const STYLE_FONTS: Record<string, string> = {
  geometric: 'Compass:300',
  grotesque: 'Mainline:600',
  humanist: 'Parlance:500',
  condensed: 'Oswald:700',
  soft: 'Cotton:300',
  extended: 'Michroma:400',
  tightgeo: 'Outfit:700',
  squircle: 'Orbital:600',
  inktrap: 'Bricolage Grotesque:700',
  flared: 'Marcellus:400',
  gothic: 'Libre Franklin:600',
  wide: 'Dela Gothic One:400',
  industrial: 'Turnpike:500',
  screen: 'Noto Sans:500',
  softcond: 'Saira Extra Condensed:300',
  blockgothic: 'Squada One:400',
  ultrablack: 'Rubik Mono One:400',
  thinsans: 'Raleway:100',
  sporty: 'Kanit:700i',
  chunkyround: 'Gumdrop:700',
  block: 'Bulwark:700',
  radial: 'Space Grotesk:400',
  mirrorsans: 'Space Grotesk:400',
  oldstyle: 'Vellum:400',
  serif: 'Almanac:500',
  didone: 'Couture:600',
  fatface: 'Ballyhoo:400',
  wedge: 'Cinzel:400',
  news: 'PT Serif:400',
  softserif: 'Caprasimo:400',
  hairserif: 'Italiana:400',
  condserif: 'Instrument Serif:400',
  compressed: 'Rozha One:400',
  headline: 'DM Serif Display:400',
  serifitalic: 'Sonnet:400i',
  copperplate: 'Stint Ultra Expanded:400',
  venetian: 'Alegreya:500',
  swashitalic: 'Libre Caslon Text:400i',
  slab: 'Josefin Slab:300',
  clarendon: 'Crete Round:400',
  egyptian: 'Bevan:400',
  humanslab: 'Bree Serif:400',
  softslab: 'Hearth:600',
  wideslab: 'Rammetto One:400',
  typewriter: 'Dispatch:400',
  squaremono: 'Major Mono Display:400',
  code: 'Kernel:500',
  roundmono: 'M PLUS 1 Code:400',
  terminal: 'VT323:400',
  cursivemono: 'Victor Mono:300i',
  boldmono: 'Space Mono:700',
  serifmono: 'Xanh Mono:400',
  boxmono: 'Martian Mono:400',
  scoreboard: 'Share Tech Mono:400',
  casual: 'Jotter:400',
  upright: 'Patrick Hand:400',
  informal: 'Boardwalk:400',
  chancery: 'Serenade:400',
  brush: 'Kaushan Script:400',
  marker: 'Permanent Marker:400',
  swash: 'Parisienne:400',
  italic: 'Cormorant:500i',
  monoline: 'Dancing Script:400',
  curly: 'Sniglet:400',
  signature: 'Mrs Saint Delafield:400',
  blackletter: 'Cathedral:400',
  sketch: 'Cabin Sketch:700',
  comic: 'Funnies:400',
  architect: 'Architects Daughter:400',
  upscript: 'Sofia:400',
  woodtype: 'Timber:400',
  techno: 'Orbitron:600',
  display: 'Chewy:400',
  pixel: 'Silkscreen:400',
  dotmatrix: 'Doto:600',
  striped: 'Monoton:400',
  octagon: 'Chakra Petch:700',
  stencil: 'Stardos Stencil:700',
  split: 'Syncopate:700',
  construction: 'Bungee Outline:400',
  inline: 'Bungee Inline:400',
  shadow: 'Bungee Shade:400',
  reverse: 'Ewert:400',
  hairline: 'Poiret One:400',
  neon: 'Neonderthaw:400',
  creepy: 'Creepster:400',
  speed: 'Faster One:400',
  comicbook: 'Bangers:400',
  nouveau: 'Macondo:400',
  psychedelic: 'Shrikhand:400',
  bauhaus: 'Righteous:400',
  heavybox: 'Russo One:400',
  boxcontrast: 'Dela Gothic One:400',
  reversebox: 'Michroma:400',
  modular: 'Righteous:400',
  stadium: 'Bungee:400',
  stepped: 'Workbench:400',
  hairbox: 'Syncopate:400',
  pinched: 'Syne:700'
};

/** The Google families the Style page's styles were written in before TypeLab's own fonts, by the own family that
    took each one's place (the italic of Playfair Display went to Sonnet, its uprights to Couture): designs saved in
    one are read as written in its own font (upgradeParams in shared/params/clean.ts). */
export const OLD_FONTS: Record<string, { upright: string; italic: string }> = Object.fromEntries(([
  ['Abril Fatface', 'Ballyhoo'], ['Alfa Slab One', 'Timber'], ['Barlow', 'Turnpike'], ['Caveat', 'Jotter'], ['Comic Neue', 'Funnies'],
  ['Courier Prime', 'Dispatch'], ['EB Garamond', 'Vellum'], ['Fredoka', 'Gumdrop'], ['Great Vibes', 'Serenade'], ['IBM Plex Mono', 'Kernel'],
  ['Libre Baskerville', 'Almanac'], ['Nunito', 'Cotton'], ['Open Sans', 'Parlance'], ['Pacifico', 'Boardwalk'], ['Playfair Display', 'Couture', 'Sonnet'],
  ['Poppins', 'Compass'], ['Roboto', 'Mainline'], ['Roboto Slab', 'Hearth'], ['Unbounded', 'Orbital'], ['UnifrakturMaguntia', 'Cathedral']
] as [string, string, string?][]).map(([old, upright, italic]) => [old, { upright, italic: italic ?? upright }]));
/** The own font an old font id (one of OLD_FONTS' families) is read as, or null for any other id. */
export function ownFontOf(id: string): string | null {
  const m = /^(.+):\d{3,4}(i?)$/.exec(id), was = m && Object.hasOwn(OLD_FONTS, m[1]) ? OLD_FONTS[m[1]] : null;
  if (!m || !was) return null;
  const family = m[2] ? was.italic : was.upright, own = OWN_FAMILIES[family];
  return fontId({ family, weight: own.weight, italic: own.italic });
}

/** Whether a family is one of TypeLab's own fonts (OWN_FAMILIES). */
export const isOwnFont = (family: string) => !!(Object.hasOwn(FREE_FAMILIES, family) && FREE_FAMILIES[family].own);

/** One font of a family: its family, weight and whether it's the italic. */
export interface FreeFontRef { family: string; weight: number; italic: boolean }
/** A font's id, as designs keep it: the family, its weight, and an i for the italic ("Great Vibes:400", "Roboto:600i"). */
export const fontId = (r: FreeFontRef) => `${r.family}:${r.weight}${r.italic ? 'i' : ''}`;
/** The font an id names, or null when it isn't one of the families here in a weight it comes in. */
export function parseFontId(id: unknown): FreeFontRef | null {
  if (typeof id !== 'string') return null;
  const m = /^(.+):(\d{3,4})(i?)$/.exec(id), fam = m && FREE_FAMILIES[m[1]];
  if (!m || !fam || !Object.hasOwn(FREE_FAMILIES, m[1])) return null;
  const weight = Number(m[2]), italic = m[3] === 'i';
  return (italic ? fam.italics : fam.weights).includes(weight) ? { family: m[1], weight, italic } : null;
}
/** The font of `family` nearest `weight` (an OpenType weight, 400 regular), upright or italic as asked where the family has an
    italic: the font a free-font design draws from as its Weight and Slant move (see freeLetters in shared/engine/free-letters.ts). */
export function nearestFont(family: string, weight: number, italic: boolean): string | null {
  const fam = FREE_FAMILIES[family]; if (!fam) return null;
  // (a family that comes only in italic, as Sonnet does, gives its italic upright too)
  const it = fam.italics.length > 0 && (italic || !fam.weights.length), list = it ? fam.italics : fam.weights;
  if (!list.length) return null;
  const w = list.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  return fontId({ family, weight: w, italic: it });
}
/** The CSS a browser loads the font with from Google Fonts, for showing a style's name in it (not for TypeLab's own
    fonts, which the server serves itself, see fontFileUrl). */
export function fontCss(r: FreeFontRef) {
  const f = encodeURIComponent(r.family).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${f}:ital,wght@${r.italic ? 1 : 0},${r.weight}&display=block`;
}

/** Where the browser loads one of TypeLab's own fonts as a web font (an OpenType file the server builds from it). */
export const fontFileUrl = (id: string) => `/api/free-fonts/${encodeURIComponent(id)}/font.otf`;

/** The symbols the opening title card's scramble shows among its capitals (client/components/Intro.tsx). */
export const INTRO_SYMBOLS = '&@#$%?!*§¶©®';
/** The letters the opening title card sets: the name and the scramble in capitals, its symbols, and the x its x-height
    line is read off. Its fonts are cut to these (introFontUrl, tools/fonts/intro.ts), so a first visit fetches little. */
export const INTRO_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZx' + INTRO_SYMBOLS;
/** The own fonts the opening title card mixes in among the designs saved in My designs: all but those the saved designs
    are built on (Gumdrop, Sonnet) or read as (Bulwark, the block letters), which would show as their twins, and the
    blackletter (Cathedral), kept off the card. */
export const INTRO_OWN = [
  'Couture', 'Serenade', 'Timber', 'Kernel', 'Orbital', 'Dispatch', 'Ballyhoo', 'Turnpike', 'Jotter', 'Funnies',
  'Vellum', 'Almanac', 'Cotton', 'Parlance', 'Boardwalk', 'Compass', 'Mainline', 'Hearth'
];
/** Where the browser loads one of TypeLab's own fonts cut to INTRO_CHARS, for the opening title card. */
export const introFontUrl = (id: string) => `/api/free-fonts/${encodeURIComponent(id)}/intro.otf`;

/** A changed font's name with the free font's own and the names its licence reserves taken out, wherever
    they stand (spaces or none, any case): the Open Font License keeps a reserved name off changed versions
    ("Josefin" for Josefin Slab, "Squada" for Squada One). TypeLab's own fonts reserve nothing. */
export function withoutReserved(name: string, family: string) {
  if (FREE_FAMILIES[family]?.own) return name;
  let left = name;
  for (const n of [family, ...(FREE_FAMILIES[family]?.reserved ?? [])].sort((a, b) => b.length - a.length)) {
    const words = n.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    left = left.replace(new RegExp(words.join('\\s*'), 'gi'), ' ');
  }
  return left.replace(/\s+/g, ' ').trim() || 'TypeLab Font';
}
