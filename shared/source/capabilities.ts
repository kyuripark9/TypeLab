/* Controls implemented by the exact-outline interpreter, shared by the editor and its navigation. */
import type { ControlKey, Params } from '../params';
import { masterInfo } from './master-catalog';
import { programInfo } from './program-catalog';

export const sourceControls: readonly (keyof Params)[] = [
  'width', 'height', 'xHeight', 'extenders', 'descender', 'slant', 'rotation', 'mirror',
  'sideBearing', 'letterSpacing', 'wordSpacing'
];

/** A glyph is supplied only when an edit targets that letter alone. */
export function sourceSupports(p: Pick<Params, 'sourceProgram'>, key: string, glyph?: string | null): boolean {
  if (!p.sourceProgram || sourceControls.some(control => control === key) || key === 'weight' && !!masterInfo(p.sourceProgram)) return true;
  if (!glyph || (key !== 'crossbar' && key !== 'tail' && key !== 'terminalLength')) return false;
  return programInfo(p.sourceProgram)?.featureGlyphs[key]?.includes(glyph) ?? false;
}

/** A source may offer an authored sub-slider without its generated shape picker. */
export function sourceControl(p: Pick<Params, 'sourceProgram'>, key: ControlKey, glyph?: string | null): ControlKey | 'terminalLength' | undefined {
  if (sourceSupports(p, key, glyph)) return key;
  if (key === 'terminal' && sourceSupports(p, 'terminalLength', glyph)) return 'terminalLength';
  return undefined;
}

export function sourceNotice(p: Pick<Params, 'sourceProgram'>): string {
  const program = programInfo(p.sourceProgram);
  if (program?.width) return 'This style has designed width and weight variations. Heights, spacing and slant remain editable.';
  if (program?.data.features) {
    const glyphs = [...new Set(Object.values(program.featureGlyphs).flat())].join(', ');
    return `This style has reviewed weight variations. Letter controls are available for ${glyphs}. Inspect one and switch from All letters to that letter alone.`;
  }
  return masterInfo(p.sourceProgram)
    ? 'This style has reviewed weight variations. Proportions, heights, spacing and slant remain editable. Alternate letter forms and decorative effects are not included.'
    : 'This style supports proportions, heights, spacing and slant. Weight, alternate letter forms and decorative effects are not available for this style yet.';
}
