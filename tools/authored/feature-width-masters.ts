/* Compile explicit H × width drawings and compare them with a pinned orthogonal-coordinate certificate. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildFont, type Font } from '../../shared/engine';
import { decodeFreeFont, packNode, type FreeFont, type FreeFontData } from '../../shared/engine/free';
import { cmdsBox, cmdsToD, cubicAt, subCubic } from '../../shared/engine/geom';
import { drawnCmds, segment, type Drawn, type Node } from '../../shared/engine/outline';
import { DEFAULTS } from '../../shared/params';
import { identifyAuthored, mapAuthored } from '../../shared/source/edit-transport';
import { decodeFeatureMasters, evaluateFeatureMasters, parseFeatureMasters, type FeatureControlData, type FeatureMasterData } from '../../shared/source/feature-masters';
import { mapPoint, type OutlineTransform } from '../../shared/source/geometry';
import { decodeWeightMasters, interpolateMasters, parseWeightMasters, type WeightMasterData } from '../../shared/source/masters';
import type { MasterSourceRef } from '../../shared/source/model';
import type { WidthMasterRef } from '../../shared/source/program';
import { parseMasterSubdivision } from '../../shared/source/subdivision';
import { decodeWidthMasters, interpolateWidthMasters, parseWidthMasters, type WidthMasterData, type WidthMasters } from '../../shared/source/width-masters';
import { rowsPNG, rowsSVG, type Row } from '../lib';
import { compileFeatureMasters } from './build-features';
import { CROSSBAR_BINDINGS } from './feature-coverage';
import { PILOT_BINDINGS, authorFeatures, type Clearance, type NodeRef } from './feature-masters';
import type { SegmentInterval, SubdivisionBinding } from './local-width-masters';
import { topology } from './transfer-masters';
import { parseWidthPrototype } from './width-masters';

export type WidthFeatureCompatibility =
  | { kind: 'orthogonal-y'; width: WidthMasterRef }
  | { kind: 'joint-grid'; width: WidthMasterRef; columns: { width: number; controls: FeatureMasterData['controls'] }[] };
export interface WidthFeatureData extends Omit<FeatureMasterData, 'widthCompatibility'> { widthCompatibility: WidthFeatureCompatibility }
type PackedGlyph = FreeFontData['glyphs'][string];
interface Candidate {
  base: WeightMasterData; ref: MasterSourceRef; width: WidthMasters; widthRef: WidthMasterRef;
  neutral: FeatureMasterData; constraints: readonly Clearance[];
  transferError: number; sourceRecipeDigest: string;
  bar: { lower: readonly [NodeRef, NodeRef]; upper: readonly [NodeRef, NodeRef] };
}
const ROOT = resolve(import.meta.dirname, '../..');
const OUTPUT = resolve(ROOT, '.audit/masters/feature-width');
const bytes = (value: unknown) => JSON.stringify(value) + '\n';
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const read = (file: string): unknown => JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));
const pack = (d: Drawn): PackedGlyph => [d.adv, d.contours.map(c => c.map(packNode))];
const decode = (data: PackedGlyph, font: FreeFontData): Drawn => decodeFreeFont({ ...font, glyphs: { H: data } }).glyphs.H;
const coordinates: readonly ['x', 'y', 'ix', 'iy', 'ox', 'oy'] = ['x', 'y', 'ix', 'iy', 'ox', 'oy'];
const xCoordinates: readonly ['x', 'ix', 'ox'] = ['x', 'ix', 'ox'];
const yCoordinates: readonly ['y', 'iy', 'oy'] = ['y', 'iy', 'oy'];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const midpoints = (values: number[]) => values.flatMap((n, i) => i ? [(values[i - 1] + n) / 2, n] : [n]);
const sameRef = (a: MasterSourceRef | WidthMasterRef, b: MasterSourceRef | WidthMasterRef) => a.kind === b.kind && a.digest === b.digest && a.fontId === b.fontId;

function loadBase(ref: MasterSourceRef, file = `fonts/masters/${ref.digest}.json`): WeightMasterData {
  const content = readFileSync(resolve(ROOT, file));
  assert.equal(digest(content), ref.digest, 'Pinned base bytes changed');
  const data = parseWeightMasters(JSON.parse(content.toString()));
  assert.equal(data.source.fontId, ref.fontId);
  return data;
}
function curve(contour: Node[], index: number) {
  const a = contour[index], b = contour[(index + 1) % contour.length];
  return segment(a, b) ?? [a, { x: lerp(a.x, b.x, 1 / 3), y: lerp(a.y, b.y, 1 / 3) },
    { x: lerp(a.x, b.x, 2 / 3), y: lerp(a.y, b.y, 2 / 3) }, b];
}
function piece(contour: Node[], range: SegmentInterval) {
  const original = curve(contour, range.segment), low = Math.min(range.t0, range.t1), high = Math.max(range.t0, range.t1);
  const c = low === 0 && high === 1 ? original : subCubic(original, low, high);
  return range.t0 > range.t1 ? c.reverse() : c;
}
function unchangedX(before: Drawn, after: Drawn): void {
  assert.equal(before.adv, after.adv, 'Orthogonal feature must preserve advance');
  assert.equal(before.contours.length, after.contours.length);
  before.contours.forEach((c, ci) => {
    assert.equal(c.length, after.contours[ci].length);
    c.forEach((n, ni) => { for (const key of xCoordinates) assert.equal(n[key], after.contours[ci][ni][key], `Feature changes ${key}`); });
  });
}

/** Lift the exact feature curves through an authored subdivision/reversal. New width-basis x values stay literal. */
export function subdivideVerticalFeature(before: Drawn, endpoint: Drawn, target: Drawn, binding: SegmentInterval[][]): { drawing: Drawn; error: number } {
  unchangedX(before, endpoint);
  let error = 0;
  assert.equal(binding.length, target.contours.length);
  const contours = binding.map((ranges, ci) => {
    assert.equal(ranges.length, target.contours[ci].length);
    const pieces = ranges.map(range => piece(endpoint.contours[ci], range)), originals = ranges.map(range => piece(before.contours[ci], range));
    return target.contours[ci].map((n, ni) => {
      const c = pieces[ni], original = originals[ni], pi = (ni + pieces.length - 1) % pieces.length;
      const move = (current: number, from: number, to: number) => from === to ? current : current === from ? to : current + (to - from);
      const out: Node = { ...n, y: move(n.y, original[0].y, c[0].y) };
      if (n.iy !== undefined) out.iy = move(n.iy, originals[pi][2].y, pieces[pi][2].y);
      if (n.oy !== undefined) out.oy = move(n.oy, original[1].y, c[1].y);
      return out;
    });
  });
  const drawing = { adv: target.adv, contours };
  binding.forEach((ranges, ci) => ranges.forEach((range, ni) => {
    const original = curve(endpoint.contours[ci], range.segment), made = curve(drawing.contours[ci], ni);
    for (const t of [0, .25, .5, .75, 1]) {
      const a = cubicAt(original, lerp(range.t0, range.t1, t)), b = cubicAt(made, t);
      error = Math.max(error, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }));
  assert.ok(error < 1e-9, `Feature subdivision changed geometry by ${error}`);
  return { drawing, error };
}
function mappedPoint(at: NodeRef, binding: SubdivisionBinding, old: Drawn): NodeRef {
  const [ci, ni] = at, count = old.contours[ci].length;
  const found = binding.glyphs.H[ci].findIndex(range => range.t0 === 0 && range.segment === ni
    || range.t0 === 1 && (range.segment + 1) % count === ni);
  assert.ok(found >= 0, 'A clearance port was lost during subdivision');
  return [ci, found];
}
function remapConstraint(c: Clearance, at: (point: NodeRef) => NodeRef): Clearance {
  const m = c.measure;
  if (m.kind === 'vertical') return { ...c, measure: { ...m, lower: at(m.lower), upper: at(m.upper) } };
  if (m.kind === 'overlap') return { ...c, measure: { ...m, tip: at(m.tip), rail: [at(m.rail[0]), at(m.rail[1])] } };
  return { ...c, measure: { ...m, lower: [at(m.lower[0]), m.lower[1]], upper: [at(m.upper[0]), m.upper[1]] } };
}
function liftedFeatures(original: FeatureMasterData, old: WeightMasterData, base: WeightMasterData, binding: SubdivisionBinding) {
  assert.ok(sameRef(original.base, binding.from));
  let error = 0;
  const data = parseFeatureMasters({ ...original, base: binding.to, controls: original.controls.map(control => ({ ...control,
    glyphs: control.glyphs.map(glyph => ({ ...glyph, masters: glyph.masters.map(sample => {
      const source = old.masters.find(m => m.weight === sample.weight)?.data, target = base.masters.find(m => m.weight === sample.weight)?.data;
      assert.ok(source && target);
      const before = decodeFreeFont(source).glyphs.H, neutral = decodeFreeFont(target).glyphs.H;
      const lift = (g: PackedGlyph): PackedGlyph => {
        const result = subdivideVerticalFeature(before, decode(g, source), neutral, binding.glyphs.H);
        error = Math.max(error, result.error); return pack(result.drawing);
      };
      return { weight: sample.weight, low: lift(sample.low), high: lift(sample.high) };
    }) })),
  })) });
  return { data, error };
}

export function loadCandidate(style: string): Candidate {
  const recipe = [...PILOT_BINDINGS, ...CROSSBAR_BINDINGS].find(b => b.fontId.split(':')[0] === style);
  assert.ok(recipe, 'No authored H binding');
  const oldRef: MasterSourceRef = { kind: 'masters-v1', fontId: recipe.fontId, digest: recipe.digest }, old = loadBase(oldRef);
  const program = authorFeatures(oldRef, old, { ...recipe, features: recipe.features.filter(f => f.glyph === 'H'), clearances: recipe.clearances.filter(c => c.glyph === 'H') });
  let neutral = compileFeatureMasters(program), base = old, ref = oldRef, constraints = program.clearances, transferError = 0;
  const regions = CROSSBAR_BINDINGS.find(binding => binding.fontId === recipe.fontId)?.regions;
  let bar: Candidate['bar'] = regions ? { lower: regions.lower, upper: regions.upper } : { lower: [[1, 1], [1, 0]], upper: [[1, 2], [1, 3]] };
  if (style === 'Mainline') {
    const outer: readonly [readonly [NodeRef, NodeRef], readonly [NodeRef, NodeRef]] = [[[2, 1], [2, 2]], [[0, 0], [0, 3]]];
    const stemBottom: readonly [NodeRef, NodeRef] = [[2, 0], [0, 1]], stemTop: readonly [NodeRef, NodeRef] = [[2, 3], [0, 2]];
    constraints = [...constraints, ...[0, 1].flatMap(side => [
      { id: `H.crossbar.lower-room-${side}`, glyph: 'H', minimum: 32, measure: { kind: 'vertical', lower: stemBottom[side], upper: bar.lower[side] } },
      { id: `H.crossbar.upper-room-${side}`, glyph: 'H', minimum: 32, measure: { kind: 'vertical', lower: bar.upper[side], upper: stemTop[side] } },
      ...[bar.lower[side], bar.upper[side]].map((tip, edge): Clearance => ({ id: `H.crossbar.outer-margin-${side}-${edge}`, glyph: 'H', minimum: 2,
        measure: { kind: 'overlap', tip, rail: outer[side], side: side === 0 ? 'right' : 'left' } })),
    ] satisfies Clearance[])];
  }
  const sourceRecipeDigest = digest(bytes(neutral));
  if (style === 'Cotton' || style === 'Gumdrop') {
    const prefix = style === 'Cotton' ? '.audit/width/Cotton-local-' : '.audit/masters/gumdrop-h-repair/';
    const binding = parseMasterSubdivision(read(prefix + 'binding.json'));
    ref = binding.to; base = loadBase(ref, prefix + (style === 'Cotton' ? 'base.json' : 'weight.json'));
    const lifted = liftedFeatures(neutral, old, base, binding); neutral = lifted.data; transferError = lifted.error;
    const oldH = decodeFreeFont(old.masters[0].data).glyphs.H, at = (point: NodeRef) => mappedPoint(point, binding, oldH);
    constraints = constraints.map(c => remapConstraint(c, at));
    bar = { lower: [at(bar.lower[0]), at(bar.lower[1])], upper: [at(bar.upper[0]), at(bar.upper[1])] };
  }
  const basis = { ref, masters: decodeWeightMasters(base) };
  let widthData: WidthMasterData;
  if (style === 'Cotton') {
    const prototype = parseWidthPrototype(read('.audit/width/Cotton-local-prototype.json'));
    assert.ok(sameRef(prototype.base, ref));
    const widths = [...new Set(prototype.samples.map(s => s.width))].filter(w => w !== prototype.axis.neutral).sort((a, b) => a - b);
    widthData = parseWidthMasters({ format: 'width-masters-v1', base: ref, axis: prototype.axis,
      columns: widths.map(width => ({ width, masters: prototype.samples.filter(s => s.width === width).map(s => ({ weight: s.weight, space: s.data.space, glyphs: s.data.glyphs })) })),
      provenance: prototype.provenance, notes: prototype.notes }, basis);
  } else {
    const path = style === 'Gumdrop' ? '.audit/masters/gumdrop-h-repair/width.json'
      : `fonts/widths/${style === 'Mainline' ? '55e40c9a42f15d14cbd44011cbb107ef5c9b2ce08d12bbc7cf937009b19ca017' : '4bd6f693c92546671858f839a603219dca3811764becf18f587256a4d0f246b5'}.json`;
    widthData = parseWidthMasters(read(path), basis);
  }
  neutral.notes = [
    `${style} H crossbar height only. The low and high drawings retain the explicit attachment recipe and move the bar by 10% of cap height.`,
    'All other feature regions remain unreviewed by this asset. Existing A, R, and c pilot assets remain unchanged.',
    'Underlying source licences and credits are retained by the pinned master and width dependencies.',
  ];
  decodeFeatureMasters(neutral, basis);
  return { base, ref, width: decodeWidthMasters(widthData, basis.masters), widthRef: { kind: 'width-masters-v1', fontId: ref.fontId, digest: digest(bytes(widthData)) },
    neutral, constraints, transferError, sourceRecipeDigest, bar };
}

function jointControls(candidate: Candidate, width: number): FeatureMasterData['controls'] {
  const features = decodeFeatureMasters(candidate.neutral, { ref: candidate.ref, masters: candidate.width.base });
  const controls = candidate.neutral.controls.map(control => ({ ...control, glyphs: control.glyphs.map(glyph => ({ ...glyph,
    masters: glyph.masters.map(sample => {
      const baseline = interpolateWidthMasters(candidate.width, sample.weight, width);
      const endpoint = (value: number) => pack(evaluateFeatureMasters(features, { baseline, weight: sample.weight, width: null,
        values: { crossbar: value, tail: .5, terminalLength: .5 } }).glyphs[glyph.glyph]);
      return { weight: sample.weight, low: endpoint(0), high: endpoint(1) };
    }),
  })) }));
  return parseFeatureMasters({ ...candidate.neutral, controls }).controls;
}

/** This proof covers exact coordinate separability, not attachment quality; the geometry sweep is separate. */
export function assertOrthogonal(candidate: Candidate): number {
  let checked = 0;
  for (const control of candidate.neutral.controls) for (const glyph of control.glyphs) for (const sample of glyph.masters) {
    const basis = interpolateMasters(candidate.width.base, sample.weight).glyphs[glyph.glyph];
    for (const endpoint of [sample.low, sample.high]) unchangedX(basis, decode(endpoint, candidate.base.masters[0].data));
    for (const column of candidate.width.columns) {
      const other = interpolateMasters(column.program, sample.weight).glyphs[glyph.glyph];
      basis.contours.forEach((c, ci) => c.forEach((n, ni) => { for (const key of yCoordinates) {
        assert.equal(other.contours[ci][ni][key], n[key], `Native width changes ${glyph.glyph} ${key}; explicit joint drawings required`); checked++;
      } }));
    }
  }
  return checked;
}
export function authorWidthFeatures(candidate: Candidate, kind: WidthFeatureCompatibility['kind']): WidthFeatureData {
  if (kind === 'orthogonal-y') assertOrthogonal(candidate);
  const compatibility: WidthFeatureCompatibility = kind === 'orthogonal-y' ? { kind, width: candidate.widthRef }
    : { kind, width: candidate.widthRef, columns: candidate.width.columns.filter(c => c.width !== candidate.width.data.axis.neutral)
      .map(c => ({ width: c.width, controls: jointControls(candidate, c.width) })) };
  const result = { ...candidate.neutral, widthCompatibility: compatibility, notes: [...candidate.neutral.notes,
    kind === 'orthogonal-y'
      ? 'The exact pinned width drawings preserve every H y coordinate and handle y; feature endpoints preserve every x coordinate, handle x, and advance. The operators commute on this point basis.'
      : 'Explicit low/high H drawings cover every native-width and weight knot. Neutral width uses controls at the asset root; other columns store the joint endpoints.',
    'Mixed weight, width, crossbar, and height cases are reviewed separately from the structural compatibility proof.',
  ] };
  if (compatibility.kind === 'joint-grid') {
    const canonical = parseFeatureMasters(result);
    decodeFeatureMasters(canonical, { ref: candidate.ref, masters: candidate.width.base }, { ref: candidate.widthRef, masters: candidate.width });
    assert.ok(canonical.widthCompatibility !== 'base-only');
    return { ...canonical, widthCompatibility: canonical.widthCompatibility };
  }
  return result;
}
function mixDrawing(a: Drawn, b: Drawn, t: number): Drawn {
  return { adv: lerp(a.adv, b.adv, t), contours: a.contours.map((c, ci) => c.map((n, ni) => {
    const out = { ...n }, other = b.contours[ci][ni];
    for (const key of coordinates) { const x = n[key], y = other[key]; if (x !== undefined && y !== undefined) out[key] = lerp(x, y, t); }
    return out;
  })) };
}
function endpointAt(controls: readonly FeatureControlData[], font: FreeFontData, weight: number, side: 'low' | 'high'): Drawn {
  const masters = controls[0].glyphs[0].masters, exact = masters.find(m => m.weight === weight);
  if (exact) return decode(exact[side], font);
  const index = masters.findIndex(m => m.weight > weight), a = masters[index - 1], b = masters[index];
  assert.ok(a && b, 'Feature weight outside authored domain');
  return mixDrawing(decode(a[side], font), decode(b[side], font), (weight - a.weight) / (b.weight - a.weight));
}
const boundFeatures = new WeakMap<WidthFeatureData, ReturnType<typeof decodeFeatureMasters>>();
export function evaluateWidthFeatures(data: WidthFeatureData, candidate: Candidate, weight: number, width: number, value: number): Drawn {
  assert.ok(sameRef(data.widthCompatibility.width, candidate.widthRef));
  const font = interpolateWidthMasters(candidate.width, weight, width), baseline = font.glyphs.H;
  if (value === .5) return baseline;
  if (data.widthCompatibility.kind === 'joint-grid') {
    let program = boundFeatures.get(data);
    if (!program) {
      program = decodeFeatureMasters(parseFeatureMasters(data), { ref: candidate.ref, masters: candidate.width.base }, { ref: candidate.widthRef, masters: candidate.width });
      boundFeatures.set(data, program);
    }
    return evaluateFeatureMasters(program, { baseline: font, weight, width, values: { crossbar: value, tail: .5, terminalLength: .5 } }).glyphs.H;
  }
  const side = value < .5 ? 'low' : 'high', amount = Math.abs(value - .5) * 2;
  const endpoint = endpointAt(data.controls, candidate.base.masters[0].data, weight, side), reference = interpolateMasters(candidate.width.base, weight).glyphs.H;
  return { ...baseline, adv: baseline.adv + (endpoint.adv - reference.adv) * amount,
    contours: baseline.contours.map((c, ci) => c.map((n, ni) => {
      const out = { ...n }, from = reference.contours[ci][ni], to = endpoint.contours[ci][ni];
      for (const key of coordinates) { const a = n[key], b = from[key], d = to[key]; if (a !== undefined && b !== undefined && d !== undefined) out[key] = b === d ? a : a + (d - b) * amount; }
      return out;
    })) };
}

function clearance(drawing: Drawn, constraint: Clearance, height: OutlineTransform): number {
  const at = ([ci, ni]: NodeRef) => drawing.contours[ci][ni], m = constraint.measure;
  if (m.kind === 'vertical') return mapPoint(at(m.upper), height).y - mapPoint(at(m.lower), height).y;
  assert.equal(m.kind, 'overlap', 'H does not use terminal-handle constraints');
  if (m.kind !== 'overlap') throw Error('Unsupported H clearance');
  const tip = at(m.tip), a = at(m.rail[0]), b = at(m.rail[1]), x = a.x + (tip.y - a.y) * (b.x - a.x) / (b.y - a.y);
  return (m.side === 'left' ? x - tip.x : tip.x - x) * height.xScale;
}
function heights(font: FreeFont): OutlineTransform[] {
  const { cap, xh } = font;
  return [{ xScale: 1, y: [[0, 0], [cap, cap]] },
    { xScale: 1, y: [[0, 0], [cap, cap * .78]] },
    { xScale: 1, y: [[0, 0], [cap, cap * 1.28]] },
    { xScale: .8, y: [[-cap * .4, -cap * .32], [0, 0], [xh, xh * .78], [cap, cap * 1.2]] },
    { xScale: 1.2, y: [[-cap * .4, -cap * .5], [0, 0], [xh, xh * 1.12], [cap, cap * 1.28]] }];
}
function transformed(d: Drawn, candidate: Candidate, height: OutlineTransform) {
  const source = { digest: candidate.ref.digest, glyph: 'H' };
  return mapAuthored(identifyAuthored({ ...d, adv: d.adv * height.xScale }, source), height, d, source);
}
export function reviewWidthFeatures(data: WidthFeatureData, candidate: Candidate) {
  const weights = midpoints(candidate.base.masters.map(m => m.weight)), widths = midpoints(candidate.width.columns.map(c => c.width));
  const failures: { weight: number; width: number; value: number; height: number; check: string }[] = [];
  const minima = Object.fromEntries(candidate.constraints.map(c => [c.id, Infinity]));
  const explicit = data.widthCompatibility.kind === 'orthogonal-y' ? authorWidthFeatures(candidate, 'joint-grid') : null;
  let cases = 0, compositionError = 0, barThicknessError = 0;
  for (const weight of weights) for (const width of widths) {
    const font = interpolateWidthMasters(candidate.width, weight, width), baseline = font.glyphs.H;
    for (const value of [0, .25, .5, .75, 1]) {
      const canonical = evaluateWidthFeatures(data, candidate, weight, width, value);
      if (explicit) {
        const compared = evaluateWidthFeatures(explicit, candidate, weight, width, value);
        canonical.contours.forEach((c, ci) => c.forEach((n, ni) => { for (const key of coordinates) {
          const a = n[key], b = compared.contours[ci][ni][key]; if (a !== undefined && b !== undefined) compositionError = Math.max(compositionError, Math.abs(a - b));
        } }));
      }
      for (const [hi, height] of heights(font).entries()) {
        const d = transformed(canonical, candidate, height), ink = topology(d.contours); cases++;
        const fail = (check: string) => failures.push({ weight, width, value, height: hi, check });
        if (ink.pieces !== 1 || ink.counters !== 0) fail('H must have one connected ink component and no counter');
        if (value === .5 && canonical !== baseline) fail('Neutral must return the identical native-width drawing');
        if (canonical.adv !== baseline.adv) fail('H advance changed');
        for (const side of [0, 1]) {
          const at = (d: Drawn, [ci, ni]: NodeRef) => d.contours[ci][ni].y;
          const thickness = (d: Drawn) => at(d, candidate.bar.upper[side]) - at(d, candidate.bar.lower[side]);
          const error = Math.abs(thickness(canonical) - thickness(baseline)); barThicknessError = Math.max(barThicknessError, error);
          if (error > 1e-9) fail('H bar thickness changed');
        }
        canonical.contours.forEach((c, ci) => c.forEach((n, ni) => { for (const key of xCoordinates) if (n[key] !== baseline.contours[ci][ni][key]) fail(`H feature changed ${key}`); }));
        if (d.contours.flat().some(n => n.authored?.digest !== candidate.ref.digest || n.authored?.glyph !== 'H')) fail('Point provenance changed');
        if (!Number.isFinite(d.adv) || d.contours.flat().some(n => packNode(n).some(v => v !== null && !Number.isFinite(v)))) fail('Non-finite coordinate');
        for (const c of candidate.constraints) {
          const v = clearance(canonical, c, height); minima[c.id] = Math.min(minima[c.id], v);
          if (!Number.isFinite(v) || v < c.minimum) fail(c.id);
        }
      }
    }
  }
  assert.ok(compositionError < 1e-9, 'Certificate and explicit grid disagree');
  return { cases, failures, minima, weights, widths, values: [0, .25, .5, .75, 1], heights: ['neutral', 'short .78', 'tall 1.28', 'piecewise stress .8x', 'piecewise stress 1.2x'], compositionError, barThicknessError,
    transferError: candidate.transferError, kind: data.widthCompatibility.kind, base: candidate.ref, width: candidate.widthRef };
}

function renderWidthFeatures(data: WidthFeatureData, candidate: Candidate, output: string): void {
  const original = buildFont(DEFAULTS), rows: Row[] = [];
  const weights = [...new Set([candidate.base.masters[0].weight, candidate.base.defaultWeight, candidate.base.masters[candidate.base.masters.length - 1].weight])];
  for (const weight of weights) for (const width of candidate.width.columns.map(c => c.width)) {
    const font = interpolateWidthMasters(candidate.width, weight, width);
    for (const [hi, height] of heights(font).slice(0, 3).entries()) {
      const drawings = [0, .5, 1].map(value => transformed(evaluateWidthFeatures(data, candidate, weight, width, value), candidate, height));
      const pick = (ch: string) => drawings['LMH'.indexOf(ch)];
      const display: Font = { ...original, m: { ...original.m, cap: font.cap, asc: font.cap * 1.3, desc: -font.cap * .28 }, letter() { return this; },
        advance(ch) { return pick(ch)?.adv ?? font.space; },
        layout(text) { let x = 0; const items = [...text].map(ch => { const adv = pick(ch)?.adv ?? font.space, item = { ch, adv, x }; x += adv; return item; }); return [{ items, width: x }]; },
        glyph(ch) { const d = pick(ch), source = original.glyph('H'); if (!source || !d) return null;
          const cmds = drawnCmds(d.contours), box = cmdsBox(cmds); return { ...source, drawn: d, cmds, d: cmdsToD(cmds), adv: d.adv, bodyW: box ? box.x1 - box.x0 : 0 }; },
      };
      rows.push({ font: display, text: 'L M H', label: `${candidate.ref.fontId} weight ${weight}; width ${width}; height ${hi}; bar low / neutral / high` });
    }
  }
  for (const hi of [0, 1, 2]) {
    const selection = rows.filter(row => row.label?.includes(`height ${hi};`));
    writeFileSync(`${output}-height${hi}.svg`, rowsSVG(selection, 88));
    writeFileSync(`${output}-height${hi}.png`, rowsPNG(selection, 88));
    writeFileSync(`${output}-height${hi}-text.png`, rowsPNG(selection, 22));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const styles = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const selected = styles.length ? styles : ['Cotton', 'Gumdrop', 'Mainline', 'Parlance'];
  assert.ok(selected.every(style => ['Cotton', 'Gumdrop', 'Mainline', 'Parlance'].includes(style)));
  mkdirSync(OUTPUT, { recursive: true });
  const pilots = ['39c1b14d702228a5147ed56092fdaf06bd76972623260157759e030764b8b5e3', '21e9a909ea84d1fc97ab9a5de4e3a06e448aacf6aa64889b1b7534d8777926e9', '878d2b9adae57c5256e6eec6de137fae305a6d4dcd8d3e4b69444ec422d9ddd9'];
  for (const id of pilots) assert.equal(digest(readFileSync(resolve(ROOT, 'fonts/features', id + '.json'))), id, 'Existing HARc pilot changed');
  for (const style of selected) {
    const candidate = loadCandidate(style), data = authorWidthFeatures(candidate, 'joint-grid');
    const alternative = style === 'Cotton' ? authorWidthFeatures(candidate, 'orthogonal-y') : null;
    writeFileSync(resolve(OUTPUT, style + '-features.json'), bytes(data));
    if (alternative) writeFileSync(resolve(OUTPUT, style + '-orthogonal.json'), bytes(alternative));
    writeFileSync(resolve(OUTPUT, style + '-width.json'), bytes(candidate.width.data));
    writeFileSync(resolve(OUTPUT, style + '-neutral.json'), bytes(candidate.neutral));
    const report = process.argv.includes('--review') ? reviewWidthFeatures(alternative ?? data, candidate) : null;
    if (report) writeFileSync(resolve(OUTPUT, style + '-review.json'), JSON.stringify(report, null, 2) + '\n');
    if (process.argv.includes('--render')) renderWidthFeatures(data, candidate, resolve(OUTPUT, style));
    const manifest = { base: candidate.ref, width: candidate.widthRef, features: { kind: 'feature-masters-v1', fontId: candidate.ref.fontId, digest: digest(bytes(data)) },
      interaction: 'joint-grid', glyphs: ['H'], ...(alternative ? { certificateBytes: Buffer.byteLength(bytes(alternative)) } : {}), selectedBytes: Buffer.byteLength(bytes(data)), transferError: candidate.transferError,
      sourceRecipeDigest: candidate.sourceRecipeDigest, ...(alternative ? { exactCoordinatesChecked: assertOrthogonal(candidate) } : {}), published: false };
    writeFileSync(resolve(OUTPUT, style + '-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ style, ...manifest, cases: report?.cases, failures: report?.failures.length, compositionError: report?.compositionError }) + '\n');
    if (report?.failures.length) process.exitCode = 1;
  }
}
