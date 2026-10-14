/* The tags starting styles are filed under, like the fonts on Google Fonts (Category, Classification,
   Appearance and Feeling), and finding styles by them or by words typed in search. */
import { resolve, type Effective } from '../engine/font';
import { STYLE_FONTS, parseFontId } from '../free-fonts';
import type { Params } from '../params';
import { searchTerms, startsWords } from './search';
import type { StyleDef } from './styles';

/* Starting styles are tagged like the fonts on Google Fonts. The group is a style's Category: it
   sorts the cards on the stage and is the panel's first filter. Then come the finer
   Classification tags (Sans Serif, Serif and Calligraphy, in the order of the card groups) and
   Appearance, both of which search reads, and Feeling, the panel's other filter. Blocks are the letters built from
   blocks (Built from, see shared/engine/blocks.ts) rather than strokes. Like a Feeling, a Category's chip names it
   in the own font of the card of that kind that shows it best (`card`, a style id): Slab Serif in the wood type,
   whose slabs show at a chip's size, Monospace in the typewriter, Calligraphy in the retro script rather than the
   formal one, whose hairlines a chip loses. Display has no card on the page, so no chip and no font. */
export type StyleGroup = 'sans' | 'serif' | 'slab' | 'mono' | 'hand' | 'blocks' | 'display';
export const STYLE_GROUPS: { id: StyleGroup; label: string; hint: string; card?: string }[] = [
  { id: 'sans', label: 'Sans Serif', hint: 'Clean letters with no serifs', card: 'grotesque' },
  { id: 'serif', label: 'Serif', hint: 'Small finishing strokes on each letter', card: 'serif' },
  { id: 'slab', label: 'Slab Serif', hint: 'Heavy, block-shaped serifs', card: 'woodtype' },
  { id: 'mono', label: 'Monospace', hint: 'Every letter takes the same width', card: 'typewriter' },
  { id: 'hand', label: 'Calligraphy', hint: 'Drawn by hand with a pen or brush', card: 'informal' },
  { id: 'blocks', label: 'Blocks', hint: 'Solid block letters: plain, with slot counters, or cells on a grid', card: 'block' },
  { id: 'display', label: 'Display', hint: 'Decorative, made for headlines' }
];
export type Mood = 'business' | 'calm' | 'sincere' | 'happy' | 'excited' | 'playful' | 'cute' | 'childlike' | 'fancy' | 'sophisticated'
  | 'artistic' | 'innovative' | 'loud' | 'rugged' | 'stiff' | 'vintage' | 'futuristic';
/* Each style's moods follow the Google Fonts Feeling scores of its reference families. Listed A to Z,
   so a mood is quick to find. Search reads all seventeen; the panel's chips are those enough cards carry
   (FEELINGS, styles.ts), each named in the own font of the card that says it best (`card`, a style id): Business in
   the neo grotesque, Fancy in the formal script, Vintage in the blackletter. */
export const MOODS: { id: Mood; label: string; card: string }[] = ([
  ['artistic', 'Artistic', 'serifitalic'], ['business', 'Business', 'grotesque'], ['calm', 'Calm', 'soft'],
  ['childlike', 'Childlike', 'casual'], ['cute', 'Cute', 'chunkyround'], ['excited', 'Excited', 'informal'],
  ['fancy', 'Fancy', 'chancery'], ['futuristic', 'Futuristic', 'squircle'], ['happy', 'Happy', 'chunkyround'],
  ['innovative', 'Innovative', 'squircle'], ['loud', 'Loud', 'fatface'], ['playful', 'Playful', 'informal'],
  ['rugged', 'Rugged', 'woodtype'], ['sincere', 'Sincere', 'oldstyle'], ['sophisticated', 'Sophisticated', 'didone'],
  ['stiff', 'Stiff', 'code'], ['vintage', 'Vintage', 'blackletter']
] as [Mood, string, string][]).map(([id, label, card]) => ({ id, label, card }));

/* Appearance, like Google's tags of that name: what the letters look like, for search to find.
   Unlike the other tags these are not hand-picked but read off each style's settings, so they
   stay true as styles are tuned. */
export type Look = 'mono' | 'pixel' | 'stencil' | 'outline' | 'inline' | 'shadow' | 'techno' | 'inktrap' | 'contrast' | 'wide' | 'narrow';
const LOOKS: { id: Look; label: string; test: (e: Effective) => boolean }[] = [
  { id: 'mono', label: 'Monospace', test: e => e.mono >= 0.5 },
  { id: 'pixel', label: 'Pixel', test: e => e.fill === 'pixels' || e.fill === 'dots' },
  { id: 'stencil', label: 'Stencil', test: e => e.stencil > 0 || e.slice > 0 },
  { id: 'outline', label: 'Outline', test: e => e.fill === 'wire' || e.fill === 'outline' },
  { id: 'inline', label: 'Inline', test: e => e.fill === 'inline' },
  { id: 'shadow', label: 'Shadow', test: e => e.fill === 'shadow' },
  { id: 'techno', label: 'Techno', test: e => e.fill === 'solid' && (e.square >= 0.5 || e.chamfer >= 0.2) },
  { id: 'inktrap', label: 'Ink Traps', test: e => e.joints >= 0.4 },
  { id: 'contrast', label: 'High Contrast', test: e => e.contrast >= 0.5 },
  { id: 'wide', label: 'Wide', test: e => e.width >= 0.68 },
  { id: 'narrow', label: 'Narrow', test: e => e.width <= 0.35 }
];

/* Classification, like Google's Sans Serif, Serif and Calligraphy tags: the genre a style is
   drawn in, finer than its Category. Hand-picked, and a style may carry more than one (a
   Clarendon is also a Slab); search finds a style by any of them ("didone", "humanist"). */
export type Kind = 'handwritten' | 'upright' | 'informal' | 'formal' | 'brush' | 'marker' | 'swash' | 'italic' | 'monoline' | 'signature' | 'blackletter'
  | 'venetian' | 'oldstyle' | 'transitional' | 'didone' | 'fatface' | 'wedge' | 'slab' | 'clarendon'
  | 'geometric' | 'neogrotesque' | 'grotesque' | 'humanist' | 'rounded' | 'superellipse' | 'flared';
type TagDef<T> = { id: T; label: string; hint: string };
/** Each section also names the Categories whose finer genres it holds. */
export const KIND_SECTIONS: { groups: StyleGroup[]; tags: TagDef<Kind>[] }[] = [
  { groups: ['sans'], tags: [
    { id: 'geometric', label: 'Geometric', hint: 'Built from circles and straight lines' },
    { id: 'neogrotesque', label: 'Neo Grotesque', hint: 'Neutral and even, like Helvetica' },
    { id: 'grotesque', label: 'Grotesque', hint: 'Early sans serifs, dense and gritty' },
    { id: 'humanist', label: 'Humanist', hint: 'Shaped like writing with a pen' },
    { id: 'rounded', label: 'Rounded', hint: 'Soft corners and stroke endings' },
    { id: 'superellipse', label: 'Superellipse', hint: 'Bowls halfway between a circle and a square' },
    { id: 'flared', label: 'Flared', hint: 'Strokes swell toward their ends (Google: Glyphic)' }
  ] },
  { groups: ['serif', 'slab'], tags: [
    { id: 'venetian', label: 'Venetian', hint: 'The first roman type: dark, low contrast, sloped serifs' },
    { id: 'oldstyle', label: 'Old Style', hint: 'Renaissance book type with angled stress' },
    { id: 'transitional', label: 'Transitional', hint: 'Crisp serifs and upright stress' },
    { id: 'didone', label: 'Didone', hint: 'Extreme contrast and hairline serifs' },
    { id: 'fatface', label: 'Fat Face', hint: 'A Didone as heavy as it goes' },
    { id: 'wedge', label: 'Wedge', hint: 'Triangular, chisel-cut serifs' },
    { id: 'slab', label: 'Slab', hint: 'Heavy, block-shaped serifs' },
    { id: 'clarendon', label: 'Clarendon', hint: 'A slab with soft, bracketed serifs' }
  ] },
  { groups: ['hand'], tags: [
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

/** The picked tags of each facet; an empty list means no filter on that facet. `query` is typed search words. */
export interface StyleFilter { groups: StyleGroup[]; moods: Mood[]; query?: string }
/** Faceted: any of the picked Categories (each style is one), every picked Feeling, so each feeling
    picked narrows the cards ("Vintage" and "Rugged" leave the styles that are both), and the search.
    `looks` are the style's Appearance as shown, which traits laid over it may change, for search to find. */
export const styleMatches = (s: StyleDef, f: StyleFilter, looks: Look[] = s.looks) =>
  (!f.groups.length || f.groups.includes(s.group)) && f.moods.every(m => s.moods.includes(m)) &&
  searchMatches(s, f.query ?? '', looks);

/** Everything a search can find a style by: its name, genre, feelings, looks, description, the font it's written in
    and the Google Fonts families like it. */
const words = (s: StyleDef, looks: Look[]) => [
  s.name, STYLE_GROUPS.find(g => g.id === s.group)!.label, s.like, s.desc, parseFontId(STYLE_FONTS[s.id])?.family ?? '',
  ...s.kinds.map(k => KIND_SECTIONS.flatMap(x => x.tags).find(t => t.id === k)!.label),
  ...s.moods.map(m => MOODS.find(x => x.id === m)!.label), ...looks.map(l => LOOKS.find(x => x.id === l)!.label)
].join(' ');
/** Every word typed starts a word somewhere in the style (so "futura", "round mono" and "heavy slab" all work). */
export const searchMatches = (s: StyleDef, query: string, looks: Look[] = s.looks) => {
  const q = searchTerms(query);
  return !q.length || startsWords(searchTerms(words(s, looks)).join(' '), q);
};
/** The Appearance tags a set of params shows. */
export function looksOf(p: Params): Look[] { const e = resolve(p); return LOOKS.filter(l => l.test(e)).map(l => l.id); }
