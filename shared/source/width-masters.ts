/* Designed width columns share an immutable weight family and its point correspondence. */
import { decodeFreeFont, packNode, type FreeFont, type FreeFontData } from '../engine/free';
import type { Drawn } from '../engine/outline';
import type { Params } from '../params';
import { parseSourceData } from './data';
import { assertCompatibleMasters, interpolateMasters, mixMasterFonts, parseWeightMasters, type MasterProvenance, type WeightMasters } from './masters';
import { parseSourceRef, type MasterSourceRef } from './model';

export interface WidthAxis { min: number; neutral: number; max: number }
export interface WidthMasterData {
  format: 'width-masters-v1';
  base: MasterSourceRef;
  axis: WidthAxis;
  columns: { width: number; masters: { weight: number; space: number; glyphs: FreeFontData['glyphs'] }[] }[];
  provenance: MasterProvenance[];
  notes: string[];
}
export interface WidthMasters {
  data: WidthMasterData;
  base: WeightMasters;
  columns: { width: number; program: WeightMasters }[];
}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid width master object');
  return Object.fromEntries(Object.entries(input));
}
function number(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) throw new TypeError('Invalid width coordinate');
  return input;
}
function packed(drawn: Drawn): FreeFontData['glyphs'][string] {
  return [drawn.adv, drawn.contours.map(c => c.map(packNode))];
}
function fontData(font: FreeFont): FreeFontData {
  return { ...font, glyphs: Object.fromEntries(Object.entries(font.glyphs).map(([ch, drawn]) => [ch, packed(drawn)])) };
}

export function parseWidthMasters(input: unknown, base: { ref: MasterSourceRef; masters: WeightMasters }): WidthMasterData {
  const value = object(input), reference = parseSourceRef(value.base), a = object(value.axis);
  if (value.format !== 'width-masters-v1' || reference?.kind !== 'masters-v1'
    || reference.digest !== base.ref.digest || reference.fontId !== base.ref.fontId
    || !Array.isArray(value.columns) || value.columns.length < 1 || value.columns.length > 19) {
    throw new TypeError('Width masters do not match their immutable base');
  }
  const axis = { min: number(a.min), neutral: number(a.neutral), max: number(a.max) };
  if (!(axis.min > 0 && axis.min < axis.max && axis.max <= 1000 && axis.neutral >= axis.min && axis.neutral <= axis.max)) {
    throw new TypeError('Invalid width axis');
  }
  const first = base.masters.masters[0], last = base.masters.masters.at(-1);
  if (!first || !last) throw new TypeError('Missing base weight masters');
  const referenceData = fontData(first.font);
  const parsed = value.columns.map(input => {
    const column = object(input), width = number(column.width);
    if (width < axis.min || width > axis.max || width === axis.neutral || !Array.isArray(column.masters)) {
      throw new TypeError('Width columns must omit the neutral base and stay inside their axis');
    }
    const masters = column.masters.map(input => {
      const row = object(input), weight = number(row.weight);
      const data = parseSourceData({ ...referenceData, space: row.space, glyphs: row.glyphs });
      assertCompatibleMasters(referenceData, data);
      return { weight, data };
    });
    const program = parseWeightMasters({ format: 'weight-masters-v1', source: base.masters.source, defaultWeight: base.masters.defaultWeight,
      masters, provenance: value.provenance, notes: value.notes });
    if (masters[0]?.weight !== first.weight || masters.at(-1)?.weight !== last.weight
      || base.masters.masters.some(m => !masters.some(row => row.weight === m.weight))) {
      throw new TypeError('Width columns must cover the complete base weight range and knots');
    }
    return { width, program };
  });
  const [head] = parsed;
  if (!head) throw new TypeError('Missing width columns');
  const weights = head.program.masters.map(m => m.weight);
  if (parsed.some((column, i) => i > 0 && column.width <= parsed[i - 1].width
    || column.program.masters.length !== weights.length || column.program.masters.some((m, j) => m.weight !== weights[j]))) {
    throw new TypeError('Width columns must be ordered with identical weight coordinates');
  }
  const widths = [...parsed.map(c => c.width), axis.neutral].sort((a, b) => a - b);
  if (widths[0] !== axis.min || widths.at(-1) !== axis.max) throw new TypeError('Width columns do not cover the axis endpoints');
  return { format: 'width-masters-v1', base: reference, axis,
    columns: parsed.map(c => ({ width: c.width, masters: c.program.masters.map(m => ({ weight: m.weight, space: m.data.space, glyphs: m.data.glyphs })) })),
    provenance: head.program.provenance, notes: head.program.notes };
}

export function decodeWidthMasters(data: WidthMasterData, base: WeightMasters): WidthMasters {
  const original = base.masters[0].font;
  const columns = data.columns.map(column => ({ width: column.width,
    program: { ...base, masters: column.masters.map(m => ({ weight: m.weight, font: decodeFreeFont({ ...original, space: m.space, glyphs: m.glyphs }) })) } }));
  columns.push({ width: data.axis.neutral, program: base });
  columns.sort((a, b) => a.width - b.width);
  return { data, base, columns };
}

export function widthAt(p: Pick<Params, 'width' | 'freeAt'>, axis: WidthAxis): number {
  const pick = p.freeAt.width ?? (axis.neutral - axis.min) / (axis.max - axis.min);
  if (p.width === pick) return axis.neutral;
  return p.width < pick
    ? axis.min + (axis.neutral - axis.min) * p.width / pick
    : axis.neutral + (axis.max - axis.neutral) * (p.width - pick) / (1 - pick);
}

/** Preserve a design coordinate when a reviewed program expands its slider domain. */
export function widthSliderAt(width: number, pick: number, axis: WidthAxis): number {
  if (width === axis.neutral) return pick;
  return width < axis.neutral
    ? pick * (width - axis.min) / (axis.neutral - axis.min)
    : pick + (1 - pick) * (width - axis.neutral) / (axis.max - axis.neutral);
}

const instances = new WeakMap<WidthMasters, Map<string, FreeFont>>();
export function interpolateWidthMasters(program: WidthMasters, weight: number, width: number): FreeFont {
  if (width === program.data.axis.neutral) return interpolateMasters(program.base, weight);
  const exact = program.columns.find(c => c.width === width);
  if (exact) return interpolateMasters(exact.program, weight);
  const upper = program.columns.findIndex(c => c.width > width);
  if (upper <= 0) throw new RangeError('Width is outside the reviewed design range');
  const a = program.columns[upper - 1], b = program.columns[upper];
  let cache = instances.get(program);
  if (!cache) { cache = new Map(); instances.set(program, cache); }
  const key = `${weight}:${width}`, kept = cache.get(key);
  if (kept) return kept;
  const font = mixMasterFonts(interpolateMasters(a.program, weight), interpolateMasters(b.program, weight), (width - a.width) / (b.width - a.width));
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(key, font);
  return font;
}
