/* Authored feature endpoints share an immutable weight basis. Geometry inference stays in authoring tools. */
import type { FreeFont, FreeFontData, PackedNode } from '../engine/free';
import type { Drawn, Node } from '../engine/outline';
import { interpolateMasters, type WeightMasters } from './masters';
import { parseSourceRef, type MasterSourceRef } from './model';
import type { WidthMasterRef } from './program';
import { interpolateWidthMasters, type WidthMasters } from './width-masters';

export const FEATURE_CONTROLS: readonly ['crossbar', 'tail', 'terminalLength'] = ['crossbar', 'tail', 'terminalLength'];
export type FeatureControl = typeof FEATURE_CONTROLS[number];
export type FeatureValues = Record<FeatureControl, number>;
type PackedGlyph = FreeFontData['glyphs'][string];
export interface FeatureSample { weight: number; low: PackedGlyph; high: PackedGlyph }
export interface FeatureGlyphData { glyph: string; masters: [FeatureSample, FeatureSample, ...FeatureSample[]] }
export interface FeatureControlData { control: FeatureControl; glyphs: [FeatureGlyphData, ...FeatureGlyphData[]] }
export interface FeatureWidthGrid {
  kind: 'joint-grid'; width: WidthMasterRef;
  columns: { width: number; controls: [FeatureControlData, ...FeatureControlData[]] }[];
}
export interface FeatureMasterData {
  format: 'feature-masters-v1'; base: MasterSourceRef;
  weightRange: readonly [number, number]; widthCompatibility: 'base-only' | FeatureWidthGrid;
  controls: [FeatureControlData, ...FeatureControlData[]]; notes: string[];
}
interface DecodedSample { weight: number; low: Drawn; high: Drawn }
interface DecodedGlyph { glyph: string; masters: DecodedSample[] }
interface DecodedControl { control: FeatureControl; glyphs: DecodedGlyph[] }
export interface FeatureMasters {
  readonly data: FeatureMasterData;
  readonly basis: WeightMasters;
  readonly controls: readonly DecodedControl[];
  readonly width: { program: WidthMasters; columns: { width: number; controls: readonly DecodedControl[] }[] } | null;
}
export interface FeatureRequest {
  baseline: FreeFont; weight: number; width: number | null; values: FeatureValues;
}

function object(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid feature master object');
  const value = Object.fromEntries(Object.entries(input));
  if (Object.keys(value).some(key => !fields.includes(key))) throw new TypeError('Unknown feature master field');
  return value;
}
function array(input: unknown): unknown[] {
  if (!Array.isArray(input)) throw new TypeError('Expected feature master array');
  return input;
}
function finite(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) throw new TypeError('Expected finite feature coordinate');
  return input;
}
function text(input: unknown): string {
  if (typeof input !== 'string') throw new TypeError('Expected feature master text');
  return input;
}
function control(input: unknown): FeatureControl {
  for (const key of FEATURE_CONTROLS) if (input === key) return key;
  throw new TypeError('Unknown feature control');
}
function packedNode(input: unknown): PackedNode {
  const n = array(input), x = finite(n[0]), y = finite(n[1]);
  if (n.length === 2) return [x, y];
  if (n.length !== 4 && n.length !== 6) throw new TypeError('Invalid feature node coordinates');
  const incoming: [number | null, number | null] = n[2] === null && n[3] === null ? [null, null] : [finite(n[2]), finite(n[3])];
  return n.length === 4 ? [x, y, ...incoming] : [x, y, ...incoming, finite(n[4]), finite(n[5])];
}
function packedGlyph(input: unknown): PackedGlyph {
  const g = array(input), advance = finite(g[0]), contours = array(g[1]);
  if (g.length !== 2 || advance < 0 || !contours.length || contours.length > 200) throw new TypeError('Invalid feature glyph');
  let total = 0;
  const parsed = contours.map(input => {
    const c = array(input); total += c.length;
    if (!c.length || total > 4000) throw new TypeError('Invalid feature contour count');
    return c.map(packedNode);
  });
  return [advance, parsed];
}

function parseControls(input: unknown, min: number, max: number): FeatureMasterData['controls'] {
  const seenControls = new Set<FeatureControl>();
  const controls = array(input).map(input => {
    const entry = object(input, ['control', 'glyphs']), key = control(entry.control), seenGlyphs = new Set<string>();
    if (seenControls.has(key)) throw new TypeError('Duplicate feature control');
    seenControls.add(key);
    const glyphs = array(entry.glyphs).map(input => {
      const entry = object(input, ['glyph', 'masters']), glyph = text(entry.glyph);
      if ([...glyph].length !== 1 || seenGlyphs.has(glyph)) throw new TypeError('Invalid or duplicate feature glyph');
      seenGlyphs.add(glyph);
      const samples = array(entry.masters).map(input => {
        const sample = object(input, ['weight', 'low', 'high']), weight = finite(sample.weight);
        if (weight < min || weight > max) throw new TypeError('Feature sample is outside its weight range');
        return { weight, low: packedGlyph(sample.low), high: packedGlyph(sample.high) };
      });
      const [first, second, ...rest] = samples;
      if (!first || !second || samples.length > 20 || first.weight !== min || samples[samples.length - 1].weight !== max
        || samples.some((sample, i) => i > 0 && sample.weight <= samples[i - 1].weight)) throw new TypeError('Feature samples must be ordered and cover both weight endpoints');
      return { glyph, masters: [first, second, ...rest] } satisfies FeatureGlyphData;
    });
    const [first, ...rest] = glyphs;
    if (!first || glyphs.length > 256) throw new TypeError('A feature control requires explicit glyph coverage');
    return { control: key, glyphs: [first, ...rest] } satisfies FeatureControlData;
  });
  const [first, ...rest] = controls;
  if (!first) throw new TypeError('A feature asset requires an authored control');
  return [first, ...rest];
}
function parseWidthGrid(input: unknown, fontId: string, min: number, max: number): FeatureWidthGrid {
  const value = object(input, ['kind', 'width', 'columns']), ref = object(value.width, ['kind', 'digest', 'fontId']);
  if (value.kind !== 'joint-grid' || ref.kind !== 'width-masters-v1' || ref.fontId !== fontId
    || typeof ref.digest !== 'string' || !/^[a-f0-9]{64}$/.test(ref.digest)) throw new TypeError('Invalid feature native-width dependency');
  const columns = array(value.columns).map(input => {
    const column = object(input, ['width', 'controls']), width = finite(column.width);
    if (width <= 0 || width > 1000) throw new TypeError('Invalid feature native-width coordinate');
    return { width, controls: parseControls(column.controls, min, max) };
  });
  if (!columns.length || columns.length > 19 || columns.some((c, i) => i > 0 && c.width <= columns[i - 1].width)) {
    throw new TypeError('Feature width columns must be ordered and distinct');
  }
  return { kind: 'joint-grid', width: { kind: 'width-masters-v1', digest: ref.digest, fontId }, columns };
}

/** Parse sparse endpoint drawings before their immutable dependencies are available. */
export function parseFeatureMasters(input: unknown): FeatureMasterData {
  const value = object(input, ['format', 'base', 'weightRange', 'widthCompatibility', 'controls', 'notes']);
  const base = parseSourceRef(value.base), range = array(value.weightRange), min = finite(range[0]), max = finite(range[1]);
  if (value.format !== 'feature-masters-v1' || base?.kind !== 'masters-v1'
    || range.length !== 2 || min < 1 || max > 1000 || min >= max) throw new TypeError('Invalid feature master domain');
  if (typeof value.widthCompatibility === 'string' && value.widthCompatibility !== 'base-only') throw new TypeError('Invalid feature master domain');
  const widthCompatibility = value.widthCompatibility === 'base-only' ? 'base-only' : parseWidthGrid(value.widthCompatibility, base.fontId, min, max);
  return { format: 'feature-masters-v1', base, weightRange: [min, max], widthCompatibility,
    controls: parseControls(value.controls, min, max), notes: array(value.notes).map(text) };
}

function decodeGlyph([adv, contours]: PackedGlyph): Drawn {
  return { adv, contours: contours.map(c => c.map(n => {
    const out: Node = { x: n[0], y: n[1] };
    if (n.length > 2 && typeof n[2] === 'number' && typeof n[3] === 'number') { out.ix = n[2]; out.iy = n[3]; }
    if (n.length === 6) { out.ox = n[4]; out.oy = n[5]; }
    return out;
  })) };
}
function assertCompatible(reference: Drawn, candidate: Drawn): void {
  if (reference.contours.length !== candidate.contours.length || reference.contours.some((c, ci) => {
    const other = candidate.contours[ci];
    return c.length !== other.length || c.some((n, ni) => (n.ix !== undefined) !== (other[ni].ix !== undefined) || (n.ox !== undefined) !== (other[ni].ox !== undefined));
  })) throw new TypeError('Feature glyph does not match its base contours and handles');
}
const COORDINATES: readonly ['x', 'y', 'ix', 'iy', 'ox', 'oy'] = ['x', 'y', 'ix', 'iy', 'ox', 'oy'];
function writes(reference: Drawn, target: Drawn): string[] {
  const slots: string[] = reference.adv === target.adv ? [] : ['advance'];
  reference.contours.forEach((c, ci) => c.forEach((n, ni) => {
    for (const key of COORDINATES) if (n[key] !== target.contours[ci][ni][key]) slots.push(`${ci}:${ni}:${key}`);
  }));
  return slots;
}

/** Bind against the exact dependency and every base weight bend. This checks correspondence, not optical quality. */
export function decodeFeatureMasters(data: FeatureMasterData, basis: { ref: MasterSourceRef; masters: WeightMasters },
  width?: { ref: WidthMasterRef; masters: WidthMasters }): FeatureMasters {
  if (data.base.kind !== basis.ref.kind || data.base.digest !== basis.ref.digest || data.base.fontId !== basis.ref.fontId
    || basis.masters.source.fontId !== basis.ref.fontId || basis.masters.masters.some(m => m.font.id !== basis.ref.fontId)) throw new TypeError('Feature masters name a different immutable base');
  const [min, max] = data.weightRange, baseMasters = basis.masters.masters;
  if (min < baseMasters[0].weight || max > baseMasters[baseMasters.length - 1].weight) throw new TypeError('Feature range exceeds its weight basis');
  const grid = data.widthCompatibility;
  if (grid !== 'base-only' && (!width || grid.width.kind !== width.ref.kind || grid.width.digest !== width.ref.digest
    || grid.width.fontId !== width.ref.fontId || width.masters.data.base.kind !== basis.ref.kind
    || width.masters.data.base.digest !== basis.ref.digest || width.masters.data.base.fontId !== basis.ref.fontId)) {
    throw new TypeError('Feature masters require their exact native-width dependency and base');
  }
  const required = [min, ...baseMasters.map(m => m.weight), ...(grid !== 'base-only' && width
    ? width.masters.columns.flatMap(c => c.program.masters.map(m => m.weight)) : []), max].filter(w => w >= min && w <= max);
  const owners = new Map<string, FeatureControl>();
  const decodeControls = (controls: FeatureMasterData['controls'], referenceProgram: WeightMasters): DecodedControl[] => controls.map(entry => ({ control: entry.control, glyphs: entry.glyphs.map(glyph => {
    if (required.some(weight => !glyph.masters.some(m => m.weight === weight))) throw new TypeError('Feature samples skip a base weight knot');
    const changed = new Set<string>();
    const masters = glyph.masters.map(sample => {
      const reference = interpolateMasters(referenceProgram, sample.weight).glyphs[glyph.glyph];
      if (!reference) throw new TypeError('Feature coverage names a glyph absent from its base');
      const low = decodeGlyph(sample.low), high = decodeGlyph(sample.high);
      for (const endpoint of [low, high]) {
        assertCompatible(reference, endpoint);
        for (const slot of writes(reference, endpoint)) changed.add(slot);
      }
      return { weight: sample.weight, low, high };
    });
    if (!changed.size) throw new TypeError('Feature coverage contains an unchanged glyph');
    for (const slot of changed) {
      const key = `${glyph.glyph}:${slot}`, owner = owners.get(key);
      if (owner && owner !== entry.control) throw new TypeError('Feature controls require an authored interaction for shared coordinates or advances');
      owners.set(key, entry.control);
    }
    return { glyph: glyph.glyph, masters };
  }) }));
  const controls = decodeControls(data.controls, basis.masters);
  let decodedWidth: FeatureMasters['width'] = null;
  if (grid !== 'base-only' && width) {
    const expected = width.masters.columns.filter(c => c.width !== width.masters.data.axis.neutral);
    if (grid.columns.length !== expected.length || grid.columns.some((c, i) => c.width !== expected[i].width)) {
      throw new TypeError('Feature width columns must cover every native-width knot and omit neutral');
    }
    const coverage = (controls: FeatureMasterData['controls']) => JSON.stringify(controls.map(c => [c.control, c.glyphs.map(g => [g.glyph, g.masters.map(m => m.weight)])]));
    const signature = coverage(data.controls);
    const columns = grid.columns.map((column, i) => {
      if (coverage(column.controls) !== signature) throw new TypeError('Feature width columns require identical controls, glyphs, and weight knots');
      return { width: column.width, controls: decodeControls(column.controls, expected[i].program) };
    });
    columns.push({ width: width.masters.data.axis.neutral, controls });
    columns.sort((a, b) => a.width - b.width);
    decodedWidth = { program: width.masters, columns };
  }
  return { data, basis: basis.masters, controls, width: decodedWidth };
}

export function featureSupportedGlyphs(features: FeatureMasters, key: FeatureControl): readonly string[] {
  return features.controls.find(c => c.control === key)?.glyphs.map(g => g.glyph) ?? [];
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mixDrawing(from: Drawn, to: Drawn, t: number): Drawn {
  return { adv: lerp(from.adv, to.adv, t), contours: from.contours.map((c, ci) => c.map((n, ni) => {
    const out = { ...n }, next = to.contours[ci][ni];
    for (const key of COORDINATES) { const a = n[key], b = next[key]; if (a !== undefined && b !== undefined) out[key] = lerp(a, b, t); }
    return out;
  })) };
}
function atWeight(glyph: DecodedGlyph, weight: number, side: 'low' | 'high'): Drawn {
  const exact = glyph.masters.find(m => m.weight === weight);
  if (exact) return exact[side];
  const index = glyph.masters.findIndex(m => m.weight > weight), a = glyph.masters[index - 1], b = glyph.masters[index], t = (weight - a.weight) / (b.weight - a.weight);
  return mixDrawing(a[side], b[side], t);
}
function atWidth(width: NonNullable<FeatureMasters['width']>, control: FeatureControl, glyph: string, weight: number, coordinate: number, side: 'low' | 'high'): Drawn {
  const at = (column: typeof width.columns[number]) => {
    const drawing = column.controls.find(c => c.control === control)?.glyphs.find(g => g.glyph === glyph);
    if (!drawing) throw new TypeError('Missing bound feature width drawing');
    return atWeight(drawing, weight, side);
  };
  const exact = width.columns.find(c => c.width === coordinate);
  if (exact) return at(exact);
  const index = width.columns.findIndex(c => c.width > coordinate), a = width.columns[index - 1], b = width.columns[index];
  return mixDrawing(at(a), at(b), (coordinate - a.width) / (b.width - a.width));
}
function addDelta(current: number, before: number, after: number, amount: number): number {
  if (before === after) return current;
  if (current === before && amount === 1) return after;
  return current + (after - before) * amount;
}

/** Apply to the complete canonical baseline, before height/pose maps and saved Points edits. */
export function evaluateFeatureMasters(features: FeatureMasters, request: FeatureRequest): FreeFont {
  const { baseline, weight, values } = request, base = features.basis.masters;
  if (baseline.id !== features.data.base.fontId || !Number.isFinite(weight) || weight < base[0].weight || weight > base[base.length - 1].weight) throw new RangeError('Feature evaluation requires its valid weight basis');
  if (request.width !== null && !Number.isFinite(request.width)) throw new RangeError('Feature native width must be finite');
  for (const key of FEATURE_CONTROLS) if (!Number.isFinite(values[key]) || values[key] < 0 || values[key] > 1) throw new RangeError('Feature values must be within 0..1');
  const active = features.controls.filter(c => values[c.control] !== .5);
  if (!active.length) return baseline;
  if (features.width ? request.width === null || request.width < features.width.program.data.axis.min || request.width > features.width.program.data.axis.max
    : request.width !== null) throw new RangeError('Feature native-width coordinate is outside its authored interaction');
  if (weight < features.data.weightRange[0] || weight > features.data.weightRange[1]) throw new RangeError('Weight is outside the authored feature interval');
  const reference = features.width && request.width !== null ? interpolateWidthMasters(features.width.program, weight, request.width)
    : interpolateMasters(features.basis, weight), glyphs = { ...baseline.glyphs };
  for (const entry of active) for (const glyph of entry.glyphs) {
    const current = glyphs[glyph.glyph], before = reference.glyphs[glyph.glyph];
    if (!current) throw new TypeError('The current baseline lacks an authored feature glyph');
    assertCompatible(before, current);
    const value = values[entry.control], side = value < .5 ? 'low' : 'high';
    const after = features.width && request.width !== null ? atWidth(features.width, entry.control, glyph.glyph, weight, request.width, side)
      : atWeight(glyph, weight, side), amount = Math.abs(value - .5) * 2;
    const contours = current.contours.map((c, ci) => c.map((n, ni) => {
      const origin = n.authored;
      if (origin && (origin.digest !== features.data.base.digest || origin.glyph !== glyph.glyph || origin.contour !== ci || origin.segment !== ni || origin.t !== 0)) throw new TypeError('Features require a canonical source point basis');
      const out: Node = { ...n, authored: origin ?? { digest: features.data.base.digest, glyph: glyph.glyph, contour: ci, segment: ni, t: 0, segments: c.length } };
      const a = before.contours[ci][ni], b = after.contours[ci][ni];
      for (const key of COORDINATES) {
        const value = n[key], from = a[key], to = b[key];
        if (value !== undefined && from !== undefined && to !== undefined) out[key] = addDelta(value, from, to, amount);
      }
      return out;
    }));
    glyphs[glyph.glyph] = { ...current, adv: addDelta(current.adv, before.adv, after.adv, amount), contours };
  }
  return { ...baseline, glyphs };
}
