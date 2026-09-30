/* Traits: the Style page's Adjust tab. Each trait is a handful of named steps (Weight: Thin to
   Black, Serifs: none to wedge…); a picked step is laid over every starting style, so each card
   shows that style with it, and picking a card starts from the result. Any starting style with
   any mix of traits, so the page reaches far past its cards. A trait left unpicked keeps what
   each style has. */
import { TERMINAL_FORMS, TERMINALS, type Params } from './params';

export type TraitId = 'weight' | 'width' | 'contrast' | 'slant' | 'serif' | 'curves' | 'corners' | 'ends'
  | 'xHeight' | 'spacing' | 'fill' | 'cuts' | 'hand' | 'joined';
export interface TraitOption { id: string; label: string; set: Partial<Params> }
export interface TraitDef {
  id: TraitId; label: string; hint: string;
  /** what each option's picture draws */
  sample: string;
  options: TraitOption[];
}
/** The picked step of each trait, by option id. */
export type Traits = Partial<Record<TraitId, string>>;

const opt = (id: string, label: string, set: Partial<Params>): TraitOption => ({ id, label, set });

const ENDS: Record<(typeof TERMINALS)[number], string> = { flat: 'Flat', round: 'Round', sharp: 'Sharp', angled: 'Angled', cut: 'Cut', tapered: 'Tapered' };

export const TRAIT_SECTIONS: { id: string; label: string; traits: TraitDef[] }[] = [
  { id: 'body', label: 'Body', traits: [
    { id: 'weight', label: 'Weight', hint: 'How thick the strokes are', sample: 'a', options: [
      opt('thin', 'Thin', { weight: 0.04 }), opt('light', 'Light', { weight: 0.26 }), opt('regular', 'Regular', { weight: 0.44 }),
      opt('bold', 'Bold', { weight: 0.72 }), opt('black', 'Black', { weight: 0.94 })] },
    { id: 'width', label: 'Width', hint: 'How narrow or wide the letters are', sample: 'n', options: [
      opt('condensed', 'Condensed', { width: 0.12 }), opt('narrow', 'Narrow', { width: 0.34 }), opt('normal', 'Normal', { width: 0.52 }),
      opt('wide', 'Wide', { width: 0.76 }), opt('extended', 'Extended', { width: 1 })] },
    { id: 'contrast', label: 'Contrast', hint: 'How much thick and thin strokes differ', sample: 'o', options: [
      opt('reverse', 'Reverse', { contrast: 0.12 }), opt('even', 'Even', { contrast: 0.5 }), opt('moderate', 'Moderate', { contrast: 0.7 }),
      opt('high', 'High', { contrast: 0.95 })] },
    { id: 'slant', label: 'Slant', hint: 'How far the letters lean', sample: 'H', options: [
      opt('upright', 'Upright', { slant: 0 }), opt('italic', 'Italic', { slant: 0.35 }), opt('steep', 'Steep', { slant: 0.75 })] }
  ] },
  { id: 'proportion', label: 'Proportion', traits: [
    { id: 'xHeight', label: 'Lowercase', hint: 'How tall the lowercase is next to the capitals', sample: 'Hx', options: [
      opt('small', 'Small', { xHeight: 0.24 }), opt('medium', 'Medium', { xHeight: 0.5 }), opt('large', 'Large', { xHeight: 0.72 }),
      opt('caps', 'Cap high', { xHeight: 1 })] },
    { id: 'spacing', label: 'Spacing', hint: 'The room between letters', sample: 'ill', options: [
      opt('tight', 'Tight', { letterSpacing: 0.04, mono: 0 }), opt('normal', 'Normal', { letterSpacing: 0.2, mono: 0 }),
      opt('loose', 'Loose', { letterSpacing: 0.4, mono: 0 }), opt('mono', 'Mono', { mono: 1 })] }
  ] },
  { id: 'details', label: 'Details', traits: [
    { id: 'serif', label: 'Serifs', hint: 'The small feet at the ends of stems', sample: 'n', options: [
      opt('none', 'None', { serif: false }),
      opt('bracketed', 'Bracketed', { serif: true, serifShape: 'bracketed', serifSize: 0.4, serifThickness: 0.2, serifAngle: 0.2 }),
      opt('hairline', 'Hairline', { serif: true, serifShape: 'unbracketed', serifSize: 0.28, serifThickness: 0.06, serifAngle: 0 }),
      opt('slab', 'Slab', { serif: true, serifShape: 'slab', serifSize: 0.32, serifThickness: 0.65, serifAngle: 0 }),
      opt('wedge', 'Wedge', { serif: true, serifShape: 'wedge', serifSize: 0.42, serifThickness: 0.5, serifAngle: 0.35 })] },
    { id: 'curves', label: 'Curves', hint: 'How round letters like O are drawn', sample: 'o', options: [
      opt('circle', 'Circle', { bowlForm: 'oval', squareness: 0, chamfer: 0 }),
      opt('squarish', 'Squarish', { bowlForm: 'oval', squareness: 0.6, chamfer: 0 }),
      opt('box', 'Box', { bowlForm: 'box', squareness: 1, boxRound: 0.6, bowlJoin: 'square', chamfer: 0 }),
      opt('faceted', 'Faceted', { bowlForm: 'oval', squareness: 0, chamfer: 0.6 })] },
    { id: 'corners', label: 'Corners', hint: 'Sharp or rounded corners', sample: 'E', options: [
      opt('sharp', 'Sharp', { roundness: 0 }), opt('soft', 'Soft', { roundness: 0.5 }), opt('round', 'Round', { roundness: 1 })] },
    { id: 'ends', label: 'Stroke ends', hint: 'How the free ends of strokes finish', sample: 'c',
      options: TERMINALS.map(t => opt(t, ENDS[t], { terminal: t, terminalForm: TERMINAL_FORMS[t][0] })) }
  ] },
  { id: 'finish', label: 'Finish', traits: [
    { id: 'fill', label: 'Fill', hint: 'What the letters are made of', sample: 'R', options: [
      opt('solid', 'Solid', { fill: 'solid' }), opt('wire', 'Outline', { fill: 'wire' }), opt('pixels', 'Pixels', { fill: 'pixels', module: 0.55 }),
      opt('dots', 'Dots', { fill: 'dots', module: 0.5 }), opt('lines', 'Lines', { fill: 'lines', module: 0.4 })] },
    { id: 'cuts', label: 'Cuts', hint: 'Gaps cut into the letters', sample: 'B', options: [
      opt('none', 'None', { joints: 0, stencil: 0, slice: 0 }), opt('inktrap', 'Ink traps', { joints: 0.8, stencil: 0, slice: 0 }),
      opt('stencil', 'Stencil', { stencil: 0.5, joints: 0, slice: 0 }), opt('slice', 'Slice', { slice: 0.18, joints: 0, stencil: 0 })] },
    { id: 'hand', label: 'Hand-drawn', hint: 'Precise, or a little shaky like a pen', sample: 'a', options: [
      opt('precise', 'Precise', { wobble: 0 }), opt('slight', 'Slight', { wobble: 0.3 }), opt('rough', 'Rough', { wobble: 0.75 })] },
    { id: 'joined', label: 'Joined-up', hint: 'Separate printed letters, or script that flows on', sample: 'nu', options: [
      opt('print', 'Print', { cursive: 0 }), opt('script', 'Script', { cursive: 1 })] }
  ] }
];

export const TRAITS: TraitDef[] = TRAIT_SECTIONS.flatMap(s => s.traits);
export const traitById = (id: TraitId) => TRAITS.find(t => t.id === id)!;
export const traitOption = (id: TraitId, option: string | undefined) => traitById(id).options.find(o => o.id === option);

/** `p` with every picked trait laid over it, in the order the traits are listed. */
export function applyTraits(p: Params, t: Traits): Params {
  let out = p;
  for (const def of TRAITS) {
    const o = traitOption(def.id, t[def.id]);
    if (o) out = { ...out, ...o.set };
  }
  return out;
}

/** A stable key for a set of picked traits. */
export const traitsKey = (t: Traits) => TRAITS.map(d => t[d.id] ?? '').join('|');
