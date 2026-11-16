/* TypeLab's own fonts: each starting style is written in a ready-made font, free to use, change and share, all but
   the ones built from slot or grid blocks or from arcs, which no font draws. The fonts (OWN_FAMILIES) were drawn for
   TypeLab on specimen sheets (Block's from the engine's block letters) and are kept in fonts/ as the engine draws
   them. Each style's pick (STYLE_FONTS) is in the weight and italic closest to its look, and the style's settings are
   fitted to that font (tools/fit). A design written in it keeps those settings as the ones its letters stand for
   (Params.freeAt), and its letters are drawn as the font has them until a setting moves from there (the source interpreter,
   shared/source/). No font is fetched from anywhere else: the Google Fonts families the styles off
   the page were once written in went with those styles. */

/** A family: its designers and the weights it comes in upright and in italic. */
export interface FreeFamily {
  designers: string[]; weights: number[]; italics: number[];
  /** a script whose letters stand apart, joined to none: each small letter's exit stroke ends free */ freeExits?: true;
  /** block letters (Bulwark, the engine's): their stroke ends stand out short and heavy from the strokes they leave */ blocks?: true;
  /** its letters are drawn in forms the engine's can't stand in for (a blackletter's, a joined script's, a narrow
      italic's): it has no other forms to offer but those drawn for it (a source's forms) */ ownForms?: true;
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

/** Every family a design can be written in: TypeLab's own. */
export const FREE_FAMILIES: Record<string, FreeFamily> = Object.fromEntries(Object.entries(OWN_FAMILIES).map(([family, o]): [string, FreeFamily] =>
  [family, { designers: ['TypeLab'], weights: o.italic ? [] : o.weights ?? [o.weight], italics: o.italic ? [o.weight] : [], ...(o.freeExits ? { freeExits: true } : {}), ...(o.blocks ? { blocks: true } : {}), ...(o.ownForms ? { ownForms: true } : {}) }]));

/** The font each starting style is written in, by style id, as a font id (see fontId); none for a style built
    from slot or grid blocks or from arcs. */
export const STYLE_FONTS: Record<string, string> = {
  geometric: 'Compass:300',
  grotesque: 'Mainline:600',
  humanist: 'Parlance:500',
  soft: 'Cotton:300',
  squircle: 'Orbital:600',
  industrial: 'Turnpike:500',
  chunkyround: 'Gumdrop:700',
  block: 'Bulwark:700',
  oldstyle: 'Vellum:400',
  serif: 'Almanac:500',
  didone: 'Couture:600',
  fatface: 'Ballyhoo:400',
  serifitalic: 'Sonnet:400i',
  softslab: 'Hearth:600',
  typewriter: 'Dispatch:400',
  code: 'Kernel:500',
  casual: 'Jotter:400',
  informal: 'Boardwalk:400',
  chancery: 'Serenade:400',
  blackletter: 'Cathedral:400',
  comic: 'Funnies:400',
  woodtype: 'Timber:400',
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
export const isOwnFont = (family: string) => Object.hasOwn(OWN_FAMILIES, family);

/** One font of a family: its family, weight and whether it's the italic. */
export interface FreeFontRef { family: string; weight: number; italic: boolean }
/** A font's id, as designs keep it: the family, its weight, and an i for the italic ("Mainline:600", "Sonnet:400i"). */
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
    italic. */
export function nearestFont(family: string, weight: number, italic: boolean): string | null {
  const fam = FREE_FAMILIES[family]; if (!fam) return null;
  // (a family that comes only in italic, as Sonnet does, gives its italic upright too)
  const it = fam.italics.length > 0 && (italic || !fam.weights.length), list = it ? fam.italics : fam.weights;
  if (!list.length) return null;
  const w = list.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  return fontId({ family, weight: w, italic: it });
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

/** A changed font's name with `family`'s name taken out, wherever it stands (spaces or none, any case): the Open Font
    License keeps a reserved name off changed versions, and the fonts a source's masters were made from reserve
    theirs (exportName in server/export.ts). TypeLab's own fonts reserve nothing. */
export function withoutReserved(name: string, family: string) {
  if (isOwnFont(family)) return name;
  const words = family.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return name.replace(new RegExp(words.join('\\s*'), 'gi'), ' ').replace(/\s+/g, ' ').trim() || 'TypeLab Font';
}
