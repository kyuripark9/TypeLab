/* Controls implemented by the exact-outline interpreter, shared by the editor and its navigation. */
import type { Params } from '../params';
import { masterInfo } from './master-catalog';

export const sourceControls: readonly (keyof Params)[] = [
  'width', 'height', 'xHeight', 'extenders', 'descender', 'slant', 'rotation', 'mirror',
  'sideBearing', 'letterSpacing', 'wordSpacing'
];

export const sourceSupports = (p: Pick<Params, 'sourceProgram'>, key: string): boolean =>
  !p.sourceProgram || sourceControls.some(control => control === key) || key === 'weight' && !!masterInfo(p.sourceProgram);

export const sourceNotice = (p: Pick<Params, 'sourceProgram'>): string => masterInfo(p.sourceProgram)
  ? 'This style has reviewed weight variations. Proportions, heights, spacing and slant remain editable. Alternate letter forms and decorative effects are not included.'
  : 'This style supports proportions, heights, spacing and slant. Weight, alternate letter forms and decorative effects are not available for this style yet.';
