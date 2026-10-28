/* Explicit program upgrades preserve existing coordinates and initialize newly authored controls. */
import { DEFAULTS, type Params } from '../params';
import { FEATURE_CONTROLS } from './feature-masters';
import { masterInfo, masterBasisForEditing } from './master-catalog';
import type { SourceRef } from './model';
import { programForFont, programInfo, type ProgramInfo } from './program-catalog';
import { widthAt, widthSliderAt } from './width-masters';
import { sourceFinishDefaults, sourceFinishExtends } from './finish';
import { sourceSpacingExtends } from './spacing';
import { sourceDotsExtend } from './dots';
import { sourceContrastExtends } from './contrast';

export interface ProgramUpgrade { program: ProgramInfo; resetWidth: boolean }

/** Upgrade offers retain reviewed controls and require an exact map when the point basis changes. */
export function programUpgrade(ref: SourceRef | null): ProgramUpgrade | null {
  if (!ref) return null;
  const target = programInfo(programForFont(ref.fontId)), base = target && masterInfo(target.ref);
  if (!target || !base || ref.kind === 'program-v1' && ref.digest === target.ref.digest) return null;
  const previous = programInfo(ref), previousBase = masterBasisForEditing(ref);
  if (!previousBase || previousBase.digest !== base.ref.digest
    && !target.data.transitions?.some(t => t.from.digest === previousBase.digest && t.from.fontId === previousBase.fontId)) return null;
  if (previous?.width && (!target.width || target.width.neutral !== previous.width.neutral
    || target.width.min > previous.width.min || target.width.max < previous.width.max)) return null;
  if (FEATURE_CONTROLS.some(key => previous?.featureGlyphs[key]?.some(ch => !target.featureGlyphs[key]?.includes(ch)))) return null;
  if (previous?.data.finish && (!target.data.finish || !sourceFinishExtends(previous.data.finish, target.data.finish))) return null;
  if (previous?.data.spacing && (!target.data.spacing || !sourceSpacingExtends(previous.data.spacing, target.data.spacing))) return null;
  if (previous?.data.components && !target.data.components) return null;
  if (previous?.componentGlyphs?.some(glyph => !target.componentGlyphs?.includes(glyph))) return null;
  if (previous?.data.dots && (!target.data.dots || !sourceDotsExtend(previous.data.dots, target.data.dots))) return null;
  if (previous?.data.contrast && (!target.data.contrast || !sourceContrastExtends(previous.data.contrast, target.data.contrast))) return null;
  if (previous?.data.forms?.some(choice => !target.data.forms?.some(next => next.ref.digest === choice.ref.digest))) return null;
  return { program: target, resetWidth: !!target.width && !previous?.width };
}

export function adoptProgram(params: Params): Params | null {
  const upgrade = programUpgrade(params.sourceProgram), original = params.sourceProgram;
  if (!upgrade || !original) return null;
  const { program } = upgrade, info = masterInfo(program.ref);
  if (!info) return null;
  const previous = programInfo(original), glyphs = Object.fromEntries(Object.entries(params.glyphs).map(([ch, values]) => [ch, { ...values }]));
  const out: Params = { ...params, sourceProgram: program.ref, glyphs, freeAt: { ...params.freeAt } };
  if (original.kind === 'outline-v1') {
    out.weight = (info.defaultWeight - info.min) / (info.max - info.min);
    out.freeAt.weight = out.weight;
    for (const own of Object.values(glyphs)) delete own.weight;
  }
  const nextWidth = program.width, oldWidth = previous?.width;
  if (nextWidth && (!oldWidth || nextWidth.min !== oldWidth.min || nextWidth.max !== oldWidth.max)) {
    const pick = (nextWidth.neutral - nextWidth.min) / (nextWidth.max - nextWidth.min);
    const convert = (width: number) => oldWidth ? widthSliderAt(widthAt({ width, freeAt: params.freeAt }, oldWidth), pick, nextWidth) : pick;
    out.width = convert(params.width); out.freeAt.width = pick;
    for (const own of Object.values(glyphs)) {
      if (!oldWidth) delete own.width;
      else if (own.width !== undefined) own.width = convert(own.width);
    }
  }
  for (const key of FEATURE_CONTROLS) {
    const covered = program.featureGlyphs[key];
    if (!covered?.length) continue;
    const before = previous?.featureGlyphs[key] ?? [];
    out[key] = .5; out.freeAt[key] = .5;
    for (const [ch, own] of Object.entries(glyphs)) if (!before.includes(ch)) delete own[key];
    for (const ch of before) {
      const value = params.glyphs[ch]?.[key] ?? params[key];
      if (value !== .5) (glyphs[ch] ??= {})[key] = value;
    }
  }
  if (program.data.finish) {
    const defaults = sourceFinishDefaults(program.data.finish, previous?.data.finish);
    Object.assign(out, defaults);
    if (defaults.fill) out.freeAt.fill = defaults.fill;
    // Ink traps and a Stencil saved where the program had none drew nothing: they start at none
    for (const key of ['joints', 'stencil', 'stencilPos', 'stencilRound'] as const) if (defaults[key] !== undefined) out.freeAt[key] = defaults[key];
    for (const own of Object.values(glyphs)) for (const key of ['slice', 'slicePos', 'sliceRound', 'wobble', 'joints', 'stencil', 'stencilPos', 'stencilRound'] as const) {
      if (defaults[key] !== undefined) delete own[key];
    }
  }
  if (program.data.spacing && !previous?.data.spacing) { out.mono = 0; out.freeAt.mono = 0; }
  // a Contrast saved where the program drew none drew the style's own: it starts there
  if (program.data.contrast && !previous?.data.contrast) {
    out.contrast = out.freeAt.contrast ?? DEFAULTS.contrast;
    for (const own of Object.values(glyphs)) delete own.contrast;
  }
  // a Dots value saved where the program had no shapes drew the style's own: it starts there
  if (program.data.dots && !previous?.data.dots) {
    out.dots = 'auto'; out.freeAt.dots = 'auto';
    for (const own of Object.values(glyphs)) delete own.dots;
  }
  if (program.data.components && !previous?.data.components) {
    out.dotSize = .5;
    out.freeAt.dotSize = .5;
    for (const own of Object.values(glyphs)) delete own.dotSize;
  } else if (program.data.components) {
    const neutral = out.freeAt.dotSize ?? .5;
    for (const glyph of program.componentGlyphs ?? []) if (!previous?.componentGlyphs?.includes(glyph)) {
      if (glyphs[glyph]) delete glyphs[glyph].dotSize;
      if (out.dotSize !== neutral) (glyphs[glyph] ??= {}).dotSize = neutral;
    }
  }
  return out;
}
