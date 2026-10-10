/* The editor's pages and the groups they sit in, in the order of the navigation. */
import type { CategoryId } from '../params';

/** An area of the design with several pages, listed under it in the navigation. */
export type GroupId = 'proportion' | 'shape' | 'details';

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
