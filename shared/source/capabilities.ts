/* Controls implemented by the exact-outline interpreter, shared by the editor and its navigation. */
import type { ControlKey, Params } from '../params';
import { masterInfo } from './master-catalog';
import { programInfo } from './program-catalog';
import { sourceFinishControls, sourceFinishFills } from './finish';

export const sourceControls: readonly (keyof Params)[] = [
  'width', 'height', 'xHeight', 'extenders', 'descender', 'slant', 'rotation', 'mirror',
  'sideBearing', 'letterSpacing', 'wordSpacing'
];

/** A glyph is supplied only when an edit targets that letter alone. */
export function sourceSupports(p: Pick<Params, 'sourceProgram'>, key: string, glyph?: string | null): boolean {
  if (!p.sourceProgram || sourceControls.some(control => control === key) || key === 'weight' && !!masterInfo(p.sourceProgram)) return true;
  const finish = programInfo(p.sourceProgram)?.data.finish;
  if (finish && sourceFinishControls(finish).some(control => control === key)) return true;
  if (key === 'dotSize') return !!glyph && (programInfo(p.sourceProgram)?.componentGlyphs?.includes(glyph) ?? false);
  if (!glyph || (key !== 'crossbar' && key !== 'tail' && key !== 'terminalLength')) return false;
  return programInfo(p.sourceProgram)?.featureGlyphs[key]?.includes(glyph) ?? false;
}

/** Named options must be reviewed as well as their parent control. */
export function sourceAllows(p: Pick<Params, 'sourceProgram'>, key: string, value: unknown, glyph?: string | null): boolean {
  if (!sourceSupports(p, key, glyph)) return false;
  if (!p.sourceProgram || key !== 'fill') return true;
  const finish = programInfo(p.sourceProgram)?.data.finish;
  return !!finish && sourceFinishFills(finish).some(fill => fill === value);
}

/** A supported effect parameter is shown only while the selected fill uses it. */
export function sourceVisible(p: Pick<Params, 'sourceProgram'> & Partial<Pick<Params, 'fill'>>, key: string, glyph?: string | null): boolean {
  if (!sourceSupports(p, key, glyph)) return false;
  const finish = programInfo(p.sourceProgram)?.data.finish;
  return !finish || !sourceFinishControls(finish).some(control => control === key)
    || sourceFinishControls(finish, p.fill).some(control => control === key);
}

/** A source may offer an authored sub-slider without its generated shape picker. */
export function sourceControl(p: Pick<Params, 'sourceProgram'> & Partial<Pick<Params, 'fill'>>, key: ControlKey, glyph?: string | null): ControlKey | 'terminalLength' | 'dotSize' | undefined {
  if (sourceVisible(p, key, glyph)) return key;
  if (key === 'terminal' && sourceSupports(p, 'terminalLength', glyph)) return 'terminalLength';
  if (key === 'dots' && sourceSupports(p, 'dotSize', glyph)) return 'dotSize';
  return undefined;
}

export function sourceNotice(p: Pick<Params, 'sourceProgram'>): string {
  const program = programInfo(p.sourceProgram);
  const glyphs = [...new Set([...Object.values(program?.featureGlyphs ?? {}).flat(), ...(program?.componentGlyphs ?? [])])].join(', ');
  if (program?.data.finish) {
    return 'This style has authored weight variations and effects. Points edits stay editable after applying an effect.'
      + (glyphs ? ` Letter controls are available for ${glyphs} while editing that letter alone.` : '');
  }
  if (program?.data.components) return `This style has weight variations and letter controls for ${glyphs}. Inspect one and switch from All letters to that letter alone.`;
  if (program?.width) return 'This style has designed width and weight variations. Heights, spacing and slant remain editable.';
  if (program?.data.features) {
    return `This style has reviewed weight variations. Letter controls are available for ${glyphs}. Inspect one and switch from All letters to that letter alone.`;
  }
  return masterInfo(p.sourceProgram)
    ? 'This style has reviewed weight variations. Proportions, heights, spacing and slant remain editable. Alternate letter forms and decorative effects are not included.'
    : 'This style supports proportions, heights, spacing and slant. Weight, alternate letter forms and decorative effects are not available for this style yet.';
}
