/* The original source drawing and coordinate frame that a new style starts with. */
import type { StyleDef } from '../content';
import { STYLE_FONTS } from '../free-fonts';
import { DEFAULTS, freeAtOf, type Params } from '../params';
import { sourceFinishDefaults } from './finish';
import { designSourceForFont, masterInfo } from './master-catalog';
import { programInfo } from './program-catalog';

export function sourceStyleParams(style: StyleDef): Params | null {
  const id = STYLE_FONTS[style.id], source = id ? designSourceForFont(id) : null;
  if (!id || !source) return null;
  const info = masterInfo(source), program = programInfo(source);
  const weight = info ? (info.defaultWeight - info.min) / (info.max - info.min) : style.params.weight;
  const width = program?.width ? (program.width.neutral - program.width.min) / (program.width.max - program.width.min) : style.params.width;
  const features = program?.data.features ? { crossbar: .5, tail: .5, terminalLength: .5 } : {};
  const components = program?.data.components ? { dotSize: .5 } : {};
  const finish: Partial<Params> = program?.data.finish ? sourceFinishDefaults(program.data.finish) : {};
  const spacing = program?.data.spacing ? { mono: 0 } : {};
  return { ...style.params, ...features, ...components, ...finish, ...spacing, freeFont: id,
    freeAt: { ...freeAtOf(style.params), ...features, ...components, ...spacing, ...(program?.data.finish ? { fill: 'solid' as const } : {}), weight, width },
    weight, width, letterSpacing: DEFAULTS.letterSpacing, wordSpacing: DEFAULTS.wordSpacing, height: DEFAULTS.height, sourceProgram: source };
}
