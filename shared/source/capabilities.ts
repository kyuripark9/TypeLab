/* Controls implemented by the exact-outline interpreter, shared by the editor and its navigation. */
import type { Params } from '../params';

export const sourceControls: readonly (keyof Params)[] = [
  'width', 'height', 'xHeight', 'extenders', 'descender', 'slant', 'rotation', 'mirror',
  'sideBearing', 'letterSpacing', 'wordSpacing'
];

export const sourceSupports = (p: Pick<Params, 'sourceProgram'>, key: string): boolean =>
  !p.sourceProgram || sourceControls.some(control => control === key);

export const sourceNotice = 'This style supports proportions, heights, spacing and slant. Weight, alternate letter forms and decorative effects are not available for this style yet.';
