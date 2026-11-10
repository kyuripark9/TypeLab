/* The editor's controls and the sliders nested under them (read off each setting's spec in
   shared/params/spec.ts), which shapes each picker offers, and which control a key belongs to. */
import { PARAM_KEYS, SPECS, formOf, type CategoryId, type ControlDef, type ControlKey, type SubControlDef, type SubKey, type SubKeyOf } from '../params';
import { CATEGORIES } from './pages';
import { FONT_OFFS } from '../font-offs';
import type { AForm, ApexForm, BarEnds, Bends, BlockForm, BowlForm, BowlJoin, CellJoin, Diagonals, GridRows, Dots, Fill, GForm, IForm, JForm, KForm, MForm, Mirror, Params, QForm, RForm, SerifBase, SerifInner, SerifShape, SerifSide, SerifTip, SForm, Story, Terminal, TerminalForm, TerminalRun, YForm } from '../params';

export type { CategoryId, ControlKey } from '../params';

/* The sliders nested under each control (see `sub` in shared/params/spec.ts). */
export type SerifTipSubKey = SubKeyOf<'serifTip'>;
export type SerifInnerSubKey = SubKeyOf<'serifInner'>;
export type FillSubKey = SubKeyOf<'fill'>;
export type TerminalSubKey = SubKeyOf<'terminal'>;
/** Anything the control panel can focus: a control or one of its nested sub-sliders. */
export type ActiveKey = ControlKey | SubKey;

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
/** The controls that shape letters built from blocks, by kind of blocks (blockForm): every kind's size, weight and
    corners, the hand, spacing and the effects that run on any outline; the basic block letters' (basic-blocks.ts)
    also their bowls, peaks and steps, the crossbars' height and how open C S G are, and the lowercase's
    ascenders and descenders; the slot blocks' (blocks.ts) and the grid letters' (grid-blocks.ts) the corners cut
    alike (block-corners.ts: Facets, Steps, Ink traps) and Stencil (counters cut open, cells drawn
    apart), the slot blocks' also the size of their slots and counters (Inner space), how deep their slots run
    (Openness) and the bars' height, the grid letters' how their cells meeting at a corner join; and the letter forms
    each draws (blocks.ts: I, J, M, Q and the dots; GRID_FORMS in grid-blocks.ts). The rest shape strokes, which
    blocks don't have. */
const SLOT_CONTROLS: readonly ControlKey[] = ['weight', 'width', 'height', 'slant', 'rotation', 'roundness', 'mirror', 'wobble',
  'xHeight', 'letterSpacing', 'wordSpacing', 'mono', 'sideBearing', 'fill', 'slice', 'rough'];
const CUT_CONTROLS: readonly ControlKey[] = ['chamfer', 'steps', 'joints', 'stencil'];
export const BLOCK_CONTROLS: Record<BlockForm, readonly ControlKey[]> = {
  basic: [...SLOT_CONTROLS, 'bowlForm', 'apex', 'steps', 'crossbar', 'aperture', 'extenders', 'descender'],
  slots: [...SLOT_CONTROLS, ...CUT_CONTROLS, 'counter', 'aperture', 'crossbar', 'iForm', 'jForm', 'mForm', 'qForm', 'dots'],
  // grid letters stand on the same five cells in either case, so the x-height doesn't reach them
  grid: [...SLOT_CONTROLS.filter(k => k !== 'xHeight'), ...CUT_CONTROLS, 'cellJoin', 'gridRows', 'story', 'kForm', 'iForm', 'jForm', 'mForm', 'qForm', 'rForm', 'yForm', 'sForm', 'dots']
};
/** On seven rows (Grid rows) the grid letters' small letters have an x-height, ascenders and descenders to set. */
const GRID7_CONTROLS: readonly ControlKey[] = ['xHeight', 'extenders', 'descender'];
/** The controls that shape the arc letters (arcs.ts): their size and weight, Width stretching every cut
    of the circle at once, Squareness squaring it off, Curves and Facets as on any curve; the x-height, the ascenders
    and descenders, the bars' height (Crossbar height), the tails (Tails & hooks), how far the open bowls run round
    (Openness) and a stem stepped off its bowl (Bowl overlap); their ends' shapes and Length (run on round the circle),
    the corners of a square end, the dots, the hand, spacing and the effects that run on any outline. They have no
    joins, serifs or other letter forms to pick. */
export const ARC_CONTROLS: readonly ControlKey[] = ['weight', 'width', 'height', 'slant', 'rotation', 'squareness', 'curve', 'chamfer',
  'overlap', 'xHeight', 'extenders', 'descender', 'crossbar', 'tail', 'aperture', 'terminal', 'roundness', 'dots', 'mirror', 'wobble',
  'letterSpacing', 'wordSpacing', 'mono', 'sideBearing', 'fill', 'slice', 'rough'];
/** The controls letters built from strokes leave out, every card in a font among them: Stencil cut 17 of the 22 cards'
    letters into slivers and stray points at any Thickness (npm run breaks, 2026-11-09), where the slot and grid
    blocks' own stencil (block-corners.ts), cells drawn apart, stays whole; Cell joins and Grid rows shape only the
    grid blocks' cells (grid-blocks.ts), and offered on the Corners and Heights pages of every stroke card changed
    nothing there. */
const STROKES_OFF: readonly ControlKey[] = ['stencil', 'cellJoin', 'gridRows'];
/** Whether control `k` shapes letters built as `p` says: letters built from blocks take their kind's BLOCK_CONTROLS
    alone (grid letters on seven rows GRID7_CONTROLS too), letters built from arcs ARC_CONTROLS, strokes every control
    but STROKES_OFF. */
export const controlInUse = (k: ControlKey, p: Pick<Params, 'build' | 'blockForm'> & { gridRows?: GridRows }) =>
  p.build === 'blocks' ? BLOCK_CONTROLS[p.blockForm].includes(k) || (p.blockForm === 'grid' && p.gridRows === 'seven' && GRID7_CONTROLS.includes(k))
    : p.build === 'arcs' ? ARC_CONTROLS.includes(k) : !STROKES_OFF.includes(k);
/** The nested sliders letters built from arcs leave out of a control they take: Roundness's Joins and Counters filled
    an arc letter's crossings and inside corners with blots of ink, the H's, K's and A's, from a quarter on (npm run
    breaks, 2026-11-09). */
const ARC_SUBS_OFF: readonly string[] = ['joinRound', 'innerRound'];
/** The nested sliders letters drawn from a font leave out: the serif tips' Roundness and Slant and the inside serifs'
    Length and Thickness. Moved, the font's own serifs give way to the engine's, whole alone (reined, FONT_REINS) but
    not with Weight, Verticals, Horizontals or Slant moved too: the Didone card's a, d and p came apart at a light
    weight with its tips slanted, the Old Style card's N and & shut heavier with its tips rounded, the Fat Face's
    inside serifs longer at Condensed shut its g (npm run breaks -- --sliders, 2026-11-09). */
const FONT_SUBS_OFF: readonly string[] = ['serifTipRound', 'serifTipSlant', 'serifInnerSize', 'serifInnerThickness'];
/** The nested sliders letters built from blocks or arcs leave out: Weight's Verticals and Horizontals. Thinned apart,
    the grid blocks' round corners came off their bars and the slot blocks' B, b and & thinned to hairline rings, from
    a third on with the other below the card's own; the arcs' b and p bowls came off their stems with Verticals thin at
    a light weight, and their & shut and b notched with Verticals at 100. Weight alone keeps them whole to both ends
    (reined on the arcs, BUILT_REINS; npm run breaks -- --sliders, 2026-11-09). */
const BUILT_SUBS_OFF: readonly string[] = ['vWeight', 'hWeight'];
/** The sliders a card's letters leave out, by what they are drawn from (a font id, as FONT_OFFS keys them): Cursive on
    the cards with feet of serifs, whose entry and exit strokes run into them. Low, the i's and l's feet come away from
    their stems (the typewriter's and code card's, npm run breaks -- --sliders, 2026-11-09); high, the strokes cross the
    serifs in a tangle (the Old Style, Didone, Fat Face, Transitional and Soft Slab cards, looked at drawn); and on the
    Block card, whose hooks slit at the joins with its stems at a heavy Verticals (npm run breaks -- --mixed), and the
    Blackletter, where it barely shows but at a short Lowercase height ran the i's and j's dots into their stems. And
    Steps on the slot blocks, whose notches stand off their round corners as tabs and, with any Facets, cut every
    letter's sides (--mixed, 2026-11-10). The Adjust tab's Print and Script keep the card's own (keepWhole). */
const SLIDERS_OFF: Record<string, readonly string[]> = {
  'Dispatch:400': ['cursive'], 'Kernel:500': ['cursive'], 'Vellum:400': ['cursive'], 'Couture:600': ['cursive'],
  'Ballyhoo:400': ['cursive'], 'Almanac:500': ['cursive'], 'Hearth:600': ['cursive'], 'Bulwark:700': ['cursive'],
  'Cathedral:400': ['cursive'], 'blocks:slots': ['steps']
};
/** Whether nested slider `s` shapes letters built as `p` says, and drawn from its font if it has one (its control in
    use too: controlInUse). */
export const subInUse = (s: string, p: Pick<Params, 'build'> & { freeFont?: string }) =>
  !(p.build === 'arcs' && ARC_SUBS_OFF.includes(s)) && !((p.build === 'blocks' || p.build === 'arcs') && BUILT_SUBS_OFF.includes(s)) &&
  !(p.freeFont && FONT_SUBS_OFF.includes(s));
const PAGES = new Map<string, typeof CATEGORIES>();
/** The pages, in order, with something to shape in letters built as `p` says: the Style page and each page holding a
    control in use. Letters built from blocks have no stroke ends, serifs or other letter forms, so those pages go (and
    Inner space and Heights for the blocks that don't take their settings); letters built from arcs keep their ends,
    have no serifs, and of the letter forms only their dots. Given the design's font and choices, a page whose every
    control is left out on its letters goes too (controlOff). The same array each time for the same letters. */
export function pagesFor(p: Pick<Params, 'build' | 'blockForm'> & Partial<Params>): typeof CATEGORIES {
  const id = `${p.build === 'blocks' ? p.blockForm : p.build}${'freeFont' in p ? ` ${offsKey(p as Here)}` : ''}`;
  let pages = PAGES.get(id);
  if (!pages) {
    const keys = (Object.keys(CONTROLS) as ControlKey[]).filter(k => controlInUse(k, { build: p.build, blockForm: p.blockForm }) && !('freeFont' in p && controlOff(k, p as Here)));
    PAGES.set(id, pages = CATEGORIES.filter(c => c.id === 'style' || keys.some(k => CONTROLS[k].cat === c.id)));
  }
  return pages;
}

/** A design as the choices left out on its letters are read (FONT_OFFS): its font or build, and its choices. */
export type Here = Pick<Params, 'freeFont' | 'build' | 'blockForm'> & Partial<Params>;
/** What the letters of design `p` are drawn from, as FONT_OFFS keys them: its font, or the engine's blocks or arcs. */
export const lettersOf = (p: Here) => p.freeFont || (p.build === 'blocks' ? `blocks:${p.blockForm}` : p.build === 'arcs' ? 'arcs' : '');
/** Setting `k`'s choice in design `p`, as FONT_OFFS writes it. */
const choiceOf = (p: Here, k: string) => (k === 'terminal' ? `${p.terminal}/${p.terminalForm}` : String(p[k as keyof Params]));
/** Every choice of setting `k` the panel offers, as FONT_OFFS writes them. */
function choicesOf(k: string): string[] {
  if (k === 'terminal') return TERMINAL_SHAPES.flatMap(g => g.shapes.map(s => `${s.terminal}/${s.form}`));
  const s = SPECS[k as keyof typeof SPECS] as { kind: string; options?: readonly unknown[] };
  return s.kind === 'boolean' ? ['true', 'false'] : (s.options ?? []).filter(o => o !== 'auto').map(String);
}
const NONE: ReadonlySet<string> = new Set();
/** The choices of setting `k` that break design `p`'s letters (FONT_OFFS), which the panel leaves out: never the
    design's own. */
export function choicesOff(p: Here, k: string): ReadonlySet<string> {
  const off = FONT_OFFS[lettersOf(p)]?.[k];
  if (!off) return NONE;
  const own = choiceOf(p, k);
  return new Set(off.filter(v => v !== own));
}
/** Whether control `k` is left out on design `p`'s letters: every choice but the design's own breaks them (on a serif
    card the Serifs switch, whose letters came out ragged with their serifs off); and the serifs' shapes where the design
    has none and its Serifs switch is left out, so nothing could switch them on (the Formal Script card, its letters
    broken with serifs, kept a Serifs page with nothing on it). */
export function controlOff(k: ControlKey, p: Here): boolean {
  if (SLIDERS_OFF[lettersOf(p)]?.includes(k)) return true;
  if (k !== 'serif' && CONTROLS[k].cat === 'serifs' && p.serif === false && controlOff('serif', p)) return true;
  const off = choicesOff(p, k);
  if (!off.size) return false;
  const own = choiceOf(p, k);
  return choicesOf(k).every(v => v === own || off.has(v));
}
/** Design `p` with each choice that breaks its letters (FONT_OFFS, read as `letters`) put back as `was` has it, and
    each slider they leave out (SLIDERS_OFF): a trait of the Style page's Adjust tab laid over a card takes no shape the
    card's letters break in. */
export function keepWhole(p: Params, was: Params, letters: string): Params {
  let out = p;
  for (const k of SLIDERS_OFF[letters] ?? []) if (out[k as keyof Params] !== was[k as keyof Params]) out = { ...out, [k]: was[k as keyof Params] };
  const offs = FONT_OFFS[letters];
  if (!offs) return out;
  for (const [k, vs] of Object.entries(offs)) {
    const now = choiceOf(p, k);
    if (!vs.includes(now) || now === choiceOf(was, k)) continue;
    out = { ...out, ...(k === 'terminal' ? { terminal: was.terminal, terminalForm: was.terminalForm } : { [k]: was[k as keyof Params] }) };
  }
  return out;
}
/** A key that changes whenever what controlOff and choicesOff say of design `p` may: its letters, and its own choice of
    each setting left out in part on them. */
export function offsKey(p: Here): string {
  const id = lettersOf(p), o = FONT_OFFS[id];
  return o ? `${id}|${Object.keys(o).map(k => choiceOf(p, k)).join('|')}` : id;
}
export const SERIF_TIP_SUBS = subsOf('serifTip');
/** The finer shape sliders of each kind of serif tip, shown while that kind is picked. */
export const SERIF_TIP_DETAILS: Record<SerifTip, SerifTipSubKey[]> = { square: [], round: ['serifTipRound'], pointed: [], angled: ['serifTipSlant'] };
export const SERIF_BASE_SUBS = subsOf('serifBase');
export const SERIF_INNER_SUBS = subsOf('serifInner');
export const FILL_SUBS = subsOf('fill');
export const TERMINAL_SUBS = subsOf('terminal');
/** The Stroke ends picker: every shape a stroke end takes, each a kind (`terminal`) and its form (`terminalForm`)
    picked together, in three families: ends cut across the stroke (square, widened, hollowed, on a slant either way,
    level, notched), rounded ones, and ends drawn to a point. Every form of TERMINAL_FORMS is here once. */
export const TERMINAL_SHAPES: { label: string; shapes: { terminal: Terminal; form: TerminalForm; label: string }[] }[] = [
  { label: 'Straight', shapes: [
    { terminal: 'flat', form: 'plain', label: 'Flat' }, { terminal: 'flat', form: 'flared', label: 'Flared' }, { terminal: 'flat', form: 'scooped', label: 'Scooped' },
    { terminal: 'angled', form: 'outer', label: 'Slant out' }, { terminal: 'angled', form: 'inner', label: 'Slant in' },
    { terminal: 'cut', form: 'level', label: 'Level' }, { terminal: 'cut', form: 'notched', label: 'Notched' }] },
  { label: 'Round', shapes: [
    { terminal: 'round', form: 'round', label: 'Round' }, { terminal: 'round', form: 'droplet', label: 'Droplet' }, { terminal: 'round', form: 'ball', label: 'Ball' }] },
  { label: 'Pointed', shapes: [
    { terminal: 'sharp', form: 'pointed', label: 'Pointed' }, { terminal: 'sharp', form: 'clipped', label: 'Clipped' },
    { terminal: 'tapered', form: 'taper', label: 'Taper' }, { terminal: 'tapered', form: 'brush', label: 'Brush' }] }
];
/** The picker's name for stroke ends of kind `t` in form `form` (one of another kind reads as the kind's first, formOf). */
export const terminalLabel = (t: Terminal, form: string) => {
  const f = formOf(t, form);
  return TERMINAL_SHAPES.flatMap(g => g.shapes).find(s => s.terminal === t && s.form === f)!.label;
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
export const CROSSBAR_SUBS = subsOf('crossbar');
/** A stencil's and a slice's own value is their thickness, so it sits among their sub-sliders. */
export const STENCIL_SUBS = subsOf('stencil');
export const SLICE_SUBS = subsOf('slice');
const ALL_SUBS = { ...SERIF_TIP_SUBS, ...SERIF_BASE_SUBS, ...SERIF_INNER_SUBS, ...FILL_SUBS, ...TERMINAL_SUBS, ...DOT_SUBS,
  ...BOWL_SUBS, ...WEIGHT_SUBS, ...ROUND_SUBS, ...CROSSBAR_SUBS, ...STENCIL_SUBS, ...SLICE_SUBS };
// (a slider nested under a control with no *_SUBS above would be missing from SUBS, so from search and the explainer)
({}) as { [K in Exclude<SubKey, keyof typeof ALL_SUBS>]: K } satisfies Record<string, never>;
/** Every nested slider, whichever control it sits under. */
export const SUBS = ALL_SUBS as Record<SubKey, SubControlDef>;
export const STORY_OPTIONS: [Exclude<Story, 'auto'>, string][] = [['double', 'Double'], ['single', 'Single']];
/** The letter-shape pickers: each option is drawn as the letter `ch` in that shape. */
export type FormKey = 'mirror' | 'gForm' | 'kForm' | 'iForm' | 'sForm' | 'diagonals' | 'yForm' | 'qForm' | 'rForm' | 'bowlForm' | 'bends' | 'bowlJoin' | 'dots' | 'terminalRun' | 'aForm' | 'apexForm' | 'mForm' | 'jForm' | 'cellJoin' | 'gridRows';
// (a control of type 'form' draws its shapes from FORM_OPTIONS, so each needs its entry)
type FormControl = { [K in ControlKey]: (typeof SPECS)[K] extends { control: { type: 'form' } } ? K : never }[ControlKey];
({}) as { [K in Exclude<FormControl, FormKey>]: K } satisfies Record<string, never>;
export const FORM_OPTIONS: { [K in FormKey]: { ch: string; options: [Exclude<Params[K], 'auto'>, string][] } } = {
  gForm: { ch: 'g', options: [['hook', 'Hook'], ['mirrored', 'Mirrored'], ['double', 'Two-storey']] as [GForm, string][] },
  kForm: { ch: 'k', options: [['arm', 'From arm'], ['stem', 'From stem'], ['bar', 'On a bar']] as [KForm, string][] },
  jForm: { ch: 'J', options: [['hook', 'Hook'], ['cup', 'Cup']] as [JForm, string][] },
  apexForm: { ch: 'A', options: [['plain', 'Peak'], ['serif', 'Serif on top']] as [ApexForm, string][] },
  mForm: { ch: 'M', options: [['full', 'To the baseline'], ['raised', 'Raised']] as [MForm, string][] },
  iForm: { ch: 'i', options: [['plain', 'Plain'], ['bars', 'Bars']] as [Exclude<IForm, 'auto'>, string][] },
  sForm: { ch: 's', options: [['curved', 'Curved'], ['flat', 'Flat spine']] as [SForm, string][] },
  diagonals: { ch: 'A', options: [['symmetric', 'Symmetric'], ['upright', 'Upright'], ['arch', 'Arches']] as [Diagonals, string][] },
  mirror: { ch: 'e', options: [['normal', 'As drawn'], ['mirrored', 'Mirrored']] as [Mirror, string][] },
  yForm: { ch: 'Y', options: [['forked', 'Forked'], ['cup', 'Cup']] as [YForm, string][] },
  qForm: { ch: 'Q', options: [['crossing', 'Crossing'], ['inside', 'Inside'], ['sweep', 'Sweep']] as [QForm, string][] },
  rForm: { ch: 'R', options: [['leg', 'Leg'], ['loop', 'Loop']] as [RForm, string][] },
  bowlForm: { ch: 'O', options: [['oval', 'Oval'], ['box', 'Box']] as [BowlForm, string][] },
  bends: { ch: 'N', options: [['sharp', 'Sharp'], ['round', 'Round']] as [Bends, string][] },
  terminalRun: { ch: 'c', options: [['curved', 'Curved'], ['straight', 'Straight']] as [TerminalRun, string][] },
  bowlJoin: { ch: 'd', options: [['curved', 'Curved'], ['square', 'Square']] as [BowlJoin, string][] },
  dots: { ch: 'i', options: [['square', 'Square'], ['round', 'Round']] as [Exclude<Dots, 'auto'>, string][] },
  aForm: { ch: 'a', options: [['plain', 'Plain'], ['spur', 'Spur']] as [AForm, string][] },
  cellJoin: { ch: 'x', options: [['nodes', 'Nodes'], ['diagonal', 'Diagonal'], ['pixel', 'Pixel']] as [CellJoin, string][] },
  gridRows: { ch: 'g', options: [['five', 'Five'], ['seven', 'Seven']] as [GridRows, string][] }
};
export const FILL_OPTIONS: [Fill, string][] = [['solid', 'Solid'], ['wire', 'Wireframe'], ['pixels', 'Pixels'], ['hex', 'Hexagons'], ['dots', 'Dots'], ['blobs', 'Blobs'],
  ['liquid', 'Liquid'], ['halftone', 'Halftone'], ['lines', 'Lines'], ['inline', 'Inline'], ['outline', 'Outline'], ['shadow', 'Shadow']];
export const SERIF_SHAPE_OPTIONS: [SerifShape, string][] = [['bracketed', 'Bracketed'], ['unbracketed', 'Unbracketed'], ['slab', 'Slab'], ['wedge', 'Wedge'], ['diamond', 'Diamond']];
export const SERIF_TIP_OPTIONS: [SerifTip, string][] = [['square', 'Square'], ['round', 'Round'], ['pointed', 'Pointed'], ['angled', 'Angled']];
export const SERIF_BASE_OPTIONS: [SerifBase, string][] = [['flat', 'Flat'], ['cupped', 'Cupped']];
/** Where a crossbar's Gap opens: the bar stopping short of the strokes it meets, or running through them, cut free above and below. */
export const BAR_END_OPTIONS: [BarEnds, string][] = [['short', 'Short'], ['through', 'Through']];
export const SERIF_SIDE_OPTIONS: [SerifSide, string][] = [['both', 'Both'], ['left', 'Left'], ['right', 'Right'], ['inside', 'Inside'], ['outside', 'Outside']];
export const SERIF_INNER_OPTIONS: [SerifInner, string][] = [['same', 'Same'], ...SERIF_SHAPE_OPTIONS];

/** The control that shapes each anatomy part, by ANATOMY id (copy.ts), and the parts drag handles grab that have no
    ANATOMY entry (join, see dragSpec in client/lib/drag.ts). Parts missing here (the baseline) have none. */
export const PART_CONTROL: Partial<Record<string, ControlKey>> = {
  stem: 'weight', diagonal: 'weight', bowl: 'weight', arm: 'weight', leg: 'weight', tail: 'tail',
  shoulder: 'weight', spine: 'weight', hook: 'weight', dot: 'weight',
  crossbar: 'crossbar', bar: 'crossbar', counter: 'counter', terminal: 'terminal', corner: 'roundness', join: 'stencil',
  apex: 'apex', vertex: 'apex', serif: 'serif', entry: 'cursive',
  xHeight: 'xHeight', capHeight: 'height', ascender: 'extenders', descender: 'extenders'
};

/** First control of each category, opened when the category is picked. */
export const firstControl = (cat: CategoryId) =>
  (Object.keys(CONTROLS) as ControlKey[]).find(k => CONTROLS[k].cat === cat) ?? 'weight';

/** The control a key belongs to: a nested slider's parent (serif sub-sliders fold into 'serif', the module
    size into 'fill', the stroke end length into 'terminal'), else the key itself. */
export const controlFor = (key: ActiveKey): ControlKey => (subSpec(key)?.parent as ControlKey | undefined) ?? (key as ControlKey);
