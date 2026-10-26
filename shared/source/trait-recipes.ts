/* Adjust recipes describe changes from an authored style, within its pinned coordinates. */
import { DEFAULTS, type Params } from '../params';
import type { TraitId, TraitOption } from '../traits';
import { sourceAllows } from './capabilities';
import { masterInfo } from './master-catalog';
import { sliderAt } from './masters';
import { programInfo } from './program-catalog';
import { widthSliderAt } from './width-masters';

export function sourceTraitOptions(p: Params, id: TraitId, legacy: readonly TraitOption[]): readonly TraitOption[] {
  if (!p.sourceProgram) return legacy;
  const base = { ...DEFAULTS, ...p.freeAt };
  let options: readonly TraitOption[] = legacy;
  if (id === 'weight') {
    const info = masterInfo(p.sourceProgram);
    options = info ? [
      { id: 'thin', label: 'Lightest', weight: info.min },
      { id: 'light', label: 'Lighter', weight: (info.min + info.defaultWeight) / 2 },
      { id: 'regular', label: 'Original', weight: info.defaultWeight },
      { id: 'bold', label: 'Heavier', weight: (info.defaultWeight + info.max) / 2 },
      { id: 'black', label: 'Heaviest', weight: info.max }
    ].map(o => ({ id: o.id, label: o.label, set: { weight: sliderAt(o.weight, p.freeAt.weight ?? .5, info) } })) : [];
  } else if (id === 'width') {
    const axis = programInfo(p.sourceProgram)?.width;
    const pick = p.freeAt.width ?? (axis ? (axis.neutral - axis.min) / (axis.max - axis.min) : DEFAULTS.width);
    const values = axis ? [axis.min, (axis.min + axis.neutral) / 2, axis.neutral, (axis.neutral + axis.max) / 2, axis.max]
      .map(value => widthSliderAt(value, pick, axis)) : [0, pick / 2, pick, (1 + pick) / 2, 1];
    options = ['condensed', 'narrow', 'normal', 'wide', 'extended'].map((key, i) => ({
      id: key, label: legacy.find(o => o.id === key)!.label, set: { width: values[i] }
    }));
  } else if (id === 'xHeight') {
    options = [
      { id: 'small', label: 'Smaller', set: { xHeight: base.xHeight / 2 } },
      { id: 'medium', label: 'Original', set: { xHeight: base.xHeight } },
      { id: 'large', label: 'Larger', set: { xHeight: (1 + base.xHeight) / 2 } },
      { id: 'caps', label: 'Largest', set: { xHeight: 1 } }
    ];
  } else if (id === 'slant') {
    options = [
      { id: 'left', label: 'Left 7°', angle: -7 },
      { id: 'upright', label: 'Original', angle: 0 },
      { id: 'italic', label: 'Right 7°', angle: 7 },
      { id: 'steep', label: 'Right 15°', angle: 15 }
    ].map(o => ({ id: o.id, label: o.label, set: { slant: base.slant + o.angle / 20 } }))
      .filter(o => o.set.slant >= 0 && o.set.slant <= 1);
  } else if (id === 'cuts') {
    options = legacy.map(o => o.id === 'slice' ? { ...o, set: { slice: .5, slicePos: .5, sliceRound: 0 } } : o);
  }
  return options.filter(o => Object.entries(o.set).every(([key, value]) => sourceAllows(p, key, value)))
    .map(o => o.reset ? { ...o, reset: Object.fromEntries(Object.entries(o.reset).filter(([key, value]) => sourceAllows(p, key, value))) } : o);
}
