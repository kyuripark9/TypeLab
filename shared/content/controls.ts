/* The editor's controls and the sliders nested under them (read off each setting's spec in
   shared/params/spec.ts), which shapes each picker offers, and which control a key belongs to. */
import { PARAM_KEYS, SPECS, type CategoryId, type ControlDef, type ControlKey, type SubControlDef, type SubKey, type SubKeyOf } from '../params';
import type { AForm, BarEnds, Bends, BowlForm, BowlJoin, Build, Diagonals, Dots, Fill, Flourish, GForm, IForm, KForm, Mirror, Params, QForm, RForm, ScriptForm, SerifBase, SerifInner, SerifShape, SerifSide, SerifTip, SForm, Story, Terminal, TerminalForm, TerminalRun, YForm } from '../params';

export type { CategoryId, ControlDef, ControlKey, SubControlDef } from '../params';

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

/** The control that shapes each anatomy part. Parts missing here (the baseline) have none. */
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
