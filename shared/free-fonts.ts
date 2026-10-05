/* Free fonts: each starting style can be written in a ready-made font from Google Fonts, all of
   them free to use, change and share (SIL Open Font License or Apache 2.0). The pick for each style is
   the first of its "like" families on Google Fonts, at the weight nearest the style's own (Weight 0.4
   as 400) and in italic where the style names one or leans and the family has one. The letters are
   fetched and converted by the server (server/free-fonts.ts) and drawn by the engine as they are. */

/** A family: its designers, the weights it comes in upright and in italic, the licence it comes under
    (its folder in github.com/google/fonts) and the names its licence reserves, which a changed font may
    not take (see server/export.ts). */
export interface FreeFamily { designers: string[]; weights: number[]; italics: number[]; license: 'ofl' | 'apache'; reserved: string[] }

export const FREE_FAMILIES: Record<string, FreeFamily> = {
  "Abril Fatface": { designers: ["TypeTogether"], weights: [400], italics: [], license: 'ofl', reserved: ["Abril", "Abril Fatface"] },
  "Alegreya": { designers: ["Juan Pablo del Peral", "HT Fonts"], weights: [400, 500, 600, 700, 800, 900], italics: [400, 500, 600, 700, 800, 900], license: 'ofl', reserved: [] },
  "Alfa Slab One": { designers: ["JM Sol\u00e9"], weights: [400], italics: [], license: 'ofl', reserved: ["Alfa Slab"] },
  "Architects Daughter": { designers: ["Kimberly Geswein"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Bangers": { designers: ["Vernon Adams"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Barlow": { designers: ["Jeremy Tribby"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [100, 200, 300, 400, 500, 600, 700, 800, 900], license: 'ofl', reserved: [] },
  "Bevan": { designers: ["Vernon Adams"], weights: [400], italics: [400], license: 'ofl', reserved: [] },
  "Bree Serif": { designers: ["TypeTogether"], weights: [400], italics: [], license: 'ofl', reserved: ["Bree", "Bree Serif"] },
  "Bricolage Grotesque": { designers: ["Mathieu Triay"], weights: [200, 300, 400, 500, 600, 700, 800], italics: [], license: 'ofl', reserved: [] },
  "Bungee": { designers: ["David Jonathan Ross"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Bungee Inline": { designers: ["David Jonathan Ross"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Bungee Outline": { designers: ["David Jonathan Ross"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Bungee Shade": { designers: ["David Jonathan Ross"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Cabin Sketch": { designers: ["Impallari Type"], weights: [400, 700], italics: [], license: 'ofl', reserved: ["Cabin", "Cabin Sketch"] },
  "Caprasimo": { designers: ["The DocRepair Project", "Phaedra Charles", "Flavia Zimbardi"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Caveat": { designers: ["Impallari Type"], weights: [400, 500, 600, 700], italics: [], license: 'ofl', reserved: [] },
  "Chakra Petch": { designers: ["Cadson Demak"], weights: [300, 400, 500, 600, 700], italics: [300, 400, 500, 600, 700], license: 'ofl', reserved: [] },
  "Chewy": { designers: ["Sideshow"], weights: [400], italics: [], license: 'apache', reserved: [] },
  "Cinzel": { designers: ["Natanael Gama"], weights: [400, 500, 600, 700, 800, 900], italics: [], license: 'ofl', reserved: [] },
  "Comic Neue": { designers: ["Craig Rozynski", "Hrant Papazian"], weights: [300, 400, 700], italics: [300, 400, 700], license: 'ofl', reserved: [] },
  "Cormorant": { designers: ["Christian Thalmann"], weights: [300, 400, 500, 600, 700], italics: [300, 400, 500, 600, 700], license: 'ofl', reserved: [] },
  "Courier Prime": { designers: ["Alan Dague-Greene"], weights: [400, 700], italics: [400, 700], license: 'ofl', reserved: [] },
  "Creepster": { designers: ["Sideshow"], weights: [400], italics: [], license: 'ofl', reserved: ["Creepster"] },
  "Crete Round": { designers: ["TypeTogether"], weights: [400], italics: [400], license: 'ofl', reserved: ["Crete", "Crete Round"] },
  "DM Serif Display": { designers: ["Colophon Foundry"], weights: [400], italics: [400], license: 'ofl', reserved: ["Source"] },
  "Dancing Script": { designers: ["Impallari Type"], weights: [400, 500, 600, 700], italics: [], license: 'ofl', reserved: ["Dancing Script"] },
  "Dela Gothic One": { designers: ["artakana"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Doto": { designers: ["\u00d3liver Lalan"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [], license: 'ofl', reserved: [] },
  "EB Garamond": { designers: ["Georg Duffner", "Octavio Pardo"], weights: [400, 500, 600, 700, 800], italics: [400, 500, 600, 700, 800], license: 'ofl', reserved: [] },
  "Ewert": { designers: ["Johan Kallas", "Mihkel Virkus"], weights: [400], italics: [], license: 'ofl', reserved: ["Ewert"] },
  "Faster One": { designers: ["Eduardo Tunni"], weights: [400], italics: [], license: 'ofl', reserved: ["Faster"] },
  "Fredoka": { designers: ["Milena Brand\u00e3o", "Hafontia"], weights: [300, 400, 500, 600, 700], italics: [], license: 'ofl', reserved: [] },
  "Great Vibes": { designers: ["Robert Leuschke"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "IBM Plex Mono": { designers: ["Mike Abbink", "Bold Monday"], weights: [100, 200, 300, 400, 500, 600, 700], italics: [100, 200, 300, 400, 500, 600, 700], license: 'ofl', reserved: ["Plex"] },
  "Instrument Serif": { designers: ["Rodrigo Fuenzalida", "Jordan Egstad"], weights: [400], italics: [400], license: 'ofl', reserved: [] },
  "Italiana": { designers: ["Santiago Orozco"], weights: [400], italics: [], license: 'ofl', reserved: ["Italiana"] },
  "Josefin Slab": { designers: ["Santiago Orozco"], weights: [100, 200, 300, 400, 500, 600, 700], italics: [100, 200, 300, 400, 500, 600, 700], license: 'ofl', reserved: ["Josefin"] },
  "Kanit": { designers: ["Cadson Demak"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [100, 200, 300, 400, 500, 600, 700, 800, 900], license: 'ofl', reserved: [] },
  "Kaushan Script": { designers: ["Impallari Type"], weights: [400], italics: [], license: 'ofl', reserved: ["Kaushan Script"] },
  "Libre Baskerville": { designers: ["Impallari Type"], weights: [400, 500, 600, 700], italics: [400, 500, 600, 700], license: 'ofl', reserved: ["Libre Baskerville"] },
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
  "Nunito": { designers: ["Vernon Adams", "Cyreal", "Jacques Le Bailly"], weights: [200, 300, 400, 500, 600, 700, 800, 900, 1000], italics: [200, 300, 400, 500, 600, 700, 800, 900, 1000], license: 'ofl', reserved: [] },
  "Open Sans": { designers: ["Steve Matteson"], weights: [300, 400, 500, 600, 700, 800], italics: [300, 400, 500, 600, 700, 800], license: 'ofl', reserved: [] },
  "Orbitron": { designers: ["Matt McInerney"], weights: [400, 500, 600, 700, 800, 900], italics: [], license: 'ofl', reserved: ["Orbitron"] },
  "Oswald": { designers: ["Vernon Adams", "Kalapi Gajjar", "Cyreal"], weights: [200, 300, 400, 500, 600, 700], italics: [], license: 'ofl', reserved: [] },
  "Outfit": { designers: ["Smartsheet Inc", "Rodrigo Fuenzalida"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [], license: 'ofl', reserved: [] },
  "PT Serif": { designers: ["ParaType"], weights: [400, 700], italics: [400, 700], license: 'ofl', reserved: ["PT Sans", "PT Serif", "ParaType"] },
  "Pacifico": { designers: ["Vernon Adams", "Jacques Le Bailly", "Botjo Nikoltchev", "Ani Petrova"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Parisienne": { designers: ["Astigmatic"], weights: [400], italics: [], license: 'ofl', reserved: ["Parisienne"] },
  "Patrick Hand": { designers: ["Patrick Wagesreiter"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Permanent Marker": { designers: ["Font Diner"], weights: [400], italics: [], license: 'apache', reserved: [] },
  "Playfair Display": { designers: ["Claus Eggers S\u00f8rensen"], weights: [400, 500, 600, 700, 800, 900], italics: [400, 500, 600, 700, 800, 900], license: 'ofl', reserved: ["Playfair Display"] },
  "Poiret One": { designers: ["Denis Masharov"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Poppins": { designers: ["Indian Type Foundry", "Jonny Pinhorn", "Ninad Kale"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [100, 200, 300, 400, 500, 600, 700, 800, 900], license: 'ofl', reserved: [] },
  "Raleway": { designers: ["Matt McInerney", "Pablo Impallari", "Rodrigo Fuenzalida"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [100, 200, 300, 400, 500, 600, 700, 800, 900], license: 'ofl', reserved: ["Raleway"] },
  "Rammetto One": { designers: ["Vernon Adams"], weights: [400], italics: [], license: 'ofl', reserved: ["Rammetto"] },
  "Righteous": { designers: ["Astigmatic"], weights: [400], italics: [], license: 'ofl', reserved: ["Righteous"] },
  "Roboto": { designers: ["Christian Robertson", "ParaType", "Font Bureau"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [100, 200, 300, 400, 500, 600, 700, 800, 900], license: 'ofl', reserved: [] },
  "Roboto Slab": { designers: ["Christian Robertson"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [], license: 'apache', reserved: [] },
  "Rozha One": { designers: ["Indian Type Foundry"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Rubik Mono One": { designers: ["Hubert and Fischer"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Russo One": { designers: ["Jovanny Lemonad"], weights: [400], italics: [], license: 'ofl', reserved: ["Russo"] },
  "Saira Extra Condensed": { designers: ["Omnibus-Type"], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [], license: 'ofl', reserved: ["Saira"] },
  "Share Tech Mono": { designers: ["Carrois Apostrophe"], weights: [400], italics: [], license: 'ofl', reserved: ["Share"] },
  "Shrikhand": { designers: ["Jonny Pinhorn"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Silkscreen": { designers: ["Jason Kottke"], weights: [400, 700], italics: [], license: 'ofl', reserved: [] },
  "Sniglet": { designers: ["Haley Fiege"], weights: [400, 800], italics: [], license: 'ofl', reserved: [] },
  "Sofia": { designers: ["LatinoType"], weights: [400], italics: [], license: 'ofl', reserved: ["Sofia"] },
  "Space Grotesk": { designers: ["Florian Karsten"], weights: [300, 400, 500, 600, 700], italics: [], license: 'ofl', reserved: [] },
  "Space Mono": { designers: ["Colophon Foundry"], weights: [400, 700], italics: [400, 700], license: 'ofl', reserved: [] },
  "Squada One": { designers: ["Joe Prince"], weights: [400], italics: [], license: 'ofl', reserved: ["Squada", "Squada One"] },
  "Stardos Stencil": { designers: ["Vernon Adams"], weights: [400, 700], italics: [], license: 'ofl', reserved: ["Stardos", "Stardos Stencil"] },
  "Stint Ultra Expanded": { designers: ["Astigmatic"], weights: [400], italics: [], license: 'ofl', reserved: ["Stint Ultra Expanded"] },
  "Syncopate": { designers: ["Astigmatic"], weights: [400, 700], italics: [], license: 'apache', reserved: [] },
  "Syne": { designers: ["Bonjour Monde", "Lucas Descroix", "George Triantafyllakos"], weights: [400, 500, 600, 700, 800], italics: [], license: 'ofl', reserved: [] },
  "Unbounded": { designers: ["NaN"], weights: [200, 300, 400, 500, 600, 700, 800, 900], italics: [], license: 'ofl', reserved: [] },
  "UnifrakturMaguntia": { designers: ["j. 'mach' wust"], weights: [400], italics: [], license: 'ofl', reserved: ["UnifrakturMaguntia"] },
  "VT323": { designers: ["Peter Hull"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Victor Mono": { designers: ["Rune Bj\u00f8rner\u00e5s"], weights: [100, 200, 300, 400, 500, 600, 700], italics: [100, 200, 300, 400, 500, 600, 700], license: 'ofl', reserved: [] },
  "Workbench": { designers: ["Jens Kut\u00edlek"], weights: [400], italics: [], license: 'ofl', reserved: [] },
  "Xanh Mono": { designers: ["Yellow Type", "L\u00e2m B\u1ea3o", "Duy Dao"], weights: [400], italics: [400], license: 'ofl', reserved: [] }
};

/** The free font each starting style is written in, by style id, as a font id (see fontId). */
export const STYLE_FONTS: Record<string, string> = {
  geometric: 'Poppins:300',
  grotesque: 'Roboto:600',
  humanist: 'Open Sans:500',
  condensed: 'Oswald:700',
  soft: 'Nunito:300',
  extended: 'Michroma:400',
  tightgeo: 'Outfit:700',
  squircle: 'Unbounded:600',
  inktrap: 'Bricolage Grotesque:700',
  flared: 'Marcellus:400',
  gothic: 'Libre Franklin:600',
  wide: 'Dela Gothic One:400',
  industrial: 'Barlow:500',
  screen: 'Noto Sans:500',
  softcond: 'Saira Extra Condensed:300',
  blockgothic: 'Squada One:400',
  ultrablack: 'Rubik Mono One:400',
  thinsans: 'Raleway:100',
  sporty: 'Kanit:700i',
  chunkyround: 'Fredoka:700',
  radial: 'Space Grotesk:400',
  mirrorsans: 'Space Grotesk:400',
  oldstyle: 'EB Garamond:400',
  serif: 'Libre Baskerville:500',
  didone: 'Playfair Display:600',
  fatface: 'Abril Fatface:400',
  wedge: 'Cinzel:400',
  news: 'PT Serif:400',
  softserif: 'Caprasimo:400',
  hairserif: 'Italiana:400',
  condserif: 'Instrument Serif:400',
  compressed: 'Rozha One:400',
  headline: 'DM Serif Display:400',
  serifitalic: 'Playfair Display:400i',
  copperplate: 'Stint Ultra Expanded:400',
  venetian: 'Alegreya:500',
  swashitalic: 'Libre Caslon Text:400i',
  slab: 'Josefin Slab:300',
  clarendon: 'Crete Round:400',
  egyptian: 'Bevan:400',
  humanslab: 'Bree Serif:400',
  softslab: 'Roboto Slab:600',
  wideslab: 'Rammetto One:400',
  typewriter: 'Courier Prime:400',
  squaremono: 'Major Mono Display:400',
  code: 'IBM Plex Mono:500',
  roundmono: 'M PLUS 1 Code:400',
  terminal: 'VT323:400',
  cursivemono: 'Victor Mono:300i',
  boldmono: 'Space Mono:700',
  serifmono: 'Xanh Mono:400',
  boxmono: 'Martian Mono:400',
  scoreboard: 'Share Tech Mono:400',
  casual: 'Caveat:400',
  upright: 'Patrick Hand:400',
  informal: 'Pacifico:400',
  chancery: 'Great Vibes:400',
  brush: 'Kaushan Script:400',
  marker: 'Permanent Marker:400',
  swash: 'Parisienne:400',
  italic: 'Cormorant:500i',
  monoline: 'Dancing Script:400',
  curly: 'Sniglet:400',
  signature: 'Mrs Saint Delafield:400',
  blackletter: 'UnifrakturMaguntia:400',
  sketch: 'Cabin Sketch:700',
  comic: 'Comic Neue:400',
  architect: 'Architects Daughter:400',
  upscript: 'Sofia:400',
  woodtype: 'Alfa Slab One:400',
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
/** The font of `family` nearest `weight`, upright or italic as asked where the family has that (a
    family member's weight, see family.ts). */
export function nearestFont(family: string, weight: number, italic: boolean): string | null {
  const fam = FREE_FAMILIES[family]; if (!fam) return null;
  const it = italic && fam.italics.length > 0, list = it ? fam.italics : fam.weights;
  if (!list.length) return null;
  const w = list.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  return fontId({ family, weight: w, italic: it });
}
/** The CSS a browser loads the font with from Google Fonts, for showing a style's name in it. */
export function fontCss(r: FreeFontRef) {
  const f = encodeURIComponent(r.family).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${f}:ital,wght@${r.italic ? 1 : 0},${r.weight}&display=block`;
}

/** A changed font's name with the free font's own and the names its licence reserves taken out, wherever
    they stand (spaces or none, any case): the Open Font License keeps a reserved name off changed versions
    ("Josefin" for Josefin Slab, "Plex" for IBM Plex Mono). */
export function withoutReserved(name: string, family: string) {
  let left = name;
  for (const n of [family, ...(FREE_FAMILIES[family]?.reserved ?? [])].sort((a, b) => b.length - a.length)) {
    const words = n.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    left = left.replace(new RegExp(words.join('\\s*'), 'gi'), ' ');
  }
  return left.replace(/\s+/g, ' ').trim() || 'TypeLab Font';
}
