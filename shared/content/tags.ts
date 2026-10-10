/* The tags starting styles are filed under, like the fonts on Google Fonts (Category, Classification,
   Appearance and Feeling), and finding styles by them or by words typed in search. */
import { resolve, type Effective } from '../engine/font';
import type { Params } from '../params';
import type { StyleDef } from './styles';

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
