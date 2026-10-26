/* Transfer pinned width changes onto edited weight masters, then review the complete candidate grid. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildFont } from '../../shared/engine';
import { decodeFreeFont, packNode, type FreeFont, type FreeFontData } from '../../shared/engine/free';
import { cmdsBox, cmdsToD, toPolys } from '../../shared/engine/geom';
import { drawnCmds, segment, type Drawn, type Node } from '../../shared/engine/outline';
import { DEFAULTS } from '../../shared/params';
import { parseSourceData } from '../../shared/source/data';
import { parseSourceRef, type MasterSourceRef, type OutlineSourceRef } from '../../shared/source/model';
import { decodeWeightMasters, interpolateMasters, parseWeightMasters, type MasterProvenance, type WeightMasterData, type WeightMasters } from '../../shared/source/masters';
import { rowsPNG, rowsSVG } from '../lib';
import { correspondences, constrain, sample, transfer } from './serif-masters';
import { aligned, directTransfer, full, matchGlyph, topology } from './transfer-masters';

export interface WidthAxis { min: number; neutral: number; max: number }
export interface WidthSample { weight: number; width: number; data: FreeFontData }
export interface WeightWidthPrototype {
  format: 'weight-width-prototype-v1'; base: MasterSourceRef; source: OutlineSourceRef;
  defaultWeight: number; axis: WidthAxis; samples: WidthSample[];
  provenance: MasterProvenance[]; notes: string[];
}
export interface WidthGrid {
  data: WeightWidthPrototype;
  columns: { width: number; program: WeightMasters }[];
}
export interface UpstreamWidth {
  family: string; defaultWeight: number; cap: number; xh: number; axis: WidthAxis;
  samples: WidthSample[]; provenance: MasterProvenance;
}

function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Expected width grid object');
  return Object.fromEntries(Object.entries(v));
}
function finite(v: unknown): number { if (typeof v !== 'number' || !Number.isFinite(v)) throw Error('Expected finite coordinate'); return v; }
function text(v: unknown): string { if (typeof v !== 'string') throw Error('Expected text'); return v; }
function array(v: unknown): unknown[] { if (!Array.isArray(v)) throw Error('Expected array'); return v; }
function axis(v: unknown): WidthAxis {
  const a = object(v), min = finite(a.min), neutral = finite(a.neutral), max = finite(a.max);
  if (!(min < max && min <= neutral && neutral <= max)) throw Error('Invalid width domain');
  return { min, neutral, max };
}
const unique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
const signature = (data: FreeFontData) => JSON.stringify(Object.entries(data.glyphs).sort(([a], [b]) => a.localeCompare(b))
  .map(([ch, [, cs]]) => [ch, cs.map(c => c.map(n => [n.length > 2 && n[2] !== null, n.length === 6]))]));

export function readUpstreamWidth(file: string, source: FreeFontData): UpstreamWidth {
  const v = object(JSON.parse(readFileSync(file, 'utf8'))), cap = finite(v.cap), xh = finite(v.xh), f = object(v.file);
  if (v.format !== 'upstream-width-grid-v1') throw Error('Unsupported upstream width format');
  return { family: text(v.family), defaultWeight: finite(v.defaultWeight), cap, xh, axis: axis(v.axis),
    samples: array(v.samples).map(input => { const s = object(input); return {
      weight: finite(s.weight), width: finite(s.width), data: parseSourceData({ ...source, cap, xh, space: finite(s.space), glyphs: s.glyphs }),
    }; }),
    provenance: { family: text(v.family), revision: text(v.revision), url: text(f.url), sha256: text(f.sha256) } };
}

export function parseWidthPrototype(input: unknown): WeightWidthPrototype {
  const v = object(input), base = parseSourceRef(v.base), source = parseSourceRef(v.source), a = axis(v.axis);
  if (v.format !== 'weight-width-prototype-v1' || base?.kind !== 'masters-v1' || source?.kind !== 'outline-v1' || base.fontId !== source.fontId) throw Error('Invalid width prototype reference');
  const samples = array(v.samples).map(input => { const s = object(input); return {
    weight: finite(s.weight), width: finite(s.width), data: parseSourceData(s.data),
  }; });
  const widths = unique(samples.map(s => s.width));
  if (widths[0] !== a.min || widths.at(-1) !== a.max || !widths.includes(a.neutral)) throw Error('Incomplete width domain');
  let reference: WeightMasterData | undefined, expected = '';
  for (const width of widths) {
    const column = parseWeightMasters({ format: 'weight-masters-v1', source, defaultWeight: v.defaultWeight,
      masters: samples.filter(s => s.width === width).map(s => ({ weight: s.weight, data: s.data })), provenance: v.provenance, notes: v.notes });
    if (!reference) { reference = column; expected = signature(column.masters[0].data); }
    const referenceData = reference.masters[0].data;
    if (JSON.stringify(column.masters.map(m => m.weight)) !== JSON.stringify(reference.masters.map(m => m.weight))
      || column.masters.some(m => signature(m.data) !== expected || m.data.cap !== referenceData.cap
        || m.data.xh !== referenceData.xh)) throw Error('Width columns must share weights, metrics and curve correspondence');
  }
  if (!reference) throw Error('Empty width prototype');
  return { format: 'weight-width-prototype-v1', base, source, axis: a, samples, defaultWeight: reference.defaultWeight,
    provenance: reference.provenance, notes: reference.notes };
}

function scaled(g: Drawn, sx: number, sy: number): Drawn {
  return { adv: g.adv * sx, contours: g.contours.map(c => c.map(p => {
    const n = full(p); return { x: n.x * sx, y: n.y * sy, ix: n.ix * sx, iy: n.iy * sy, ox: n.ox * sx, oy: n.oy * sy };
  })) };
}
function sampleAt(samples: WidthSample[], weight: number, width: number): WidthSample {
  const sample = samples.find(s => s.weight === weight && s.width === width);
  if (!sample) throw Error(`Missing upstream sample ${weight}/${width}`);
  return sample;
}
function preserveHandleLayout(source: Drawn, target: Drawn): Drawn {
  return { adv: target.adv, contours: source.contours.map((c, ci) => c.map((n, ni) => {
    const p = target.contours[ci][ni], result: Node = { ...n, x: p.x, y: p.y };
    if (n.ix !== undefined && n.iy !== undefined) { result.ix = p.ix; result.iy = p.iy; }
    if (n.ox !== undefined && n.oy !== undefined) { result.ox = p.ox; result.oy = p.oy; }
    return result;
  })) };
}
interface FieldPoint { contour: number; seg: number; t: number; x: number; y: number }
interface FieldLocation { indices: number[]; coefficients: number[] }
interface WidthField { points: FieldPoint[]; nodes: { anchor: FieldLocation; incoming?: FieldLocation; outgoing?: FieldLocation }[][] }
const FIELD_GUMDROP = new Set([...'1RXbdfgpqtxy“”„@€¥+±™†‡6/®']);
function curvePoint(contour: Node[], index: number, t: number) {
  const a = contour[index], b = contour[(index + 1) % contour.length], c = segment(a, b), u = 1 - t;
  return c ? { x: u ** 3 * a.x + 3 * u ** 2 * t * c[1].x + 3 * u * t ** 2 * c[2].x + t ** 3 * b.x,
    y: u ** 3 * a.y + 3 * u ** 2 * t * c[1].y + 3 * u * t ** 2 * c[2].y + t ** 3 * b.y }
    : { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}
function widthField(source: Drawn, reference: Drawn): WidthField {
  const a = cmdsBox(drawnCmds(source.contours)), b = cmdsBox(drawnCmds(reference.contours));
  if (!a || !b) throw Error('Width field requires filled source bounds');
  const sourceBox = a, referenceBox = b;
  const points = reference.contours.flatMap((c, contour) => sample(c).samples.map(p => ({ ...p, contour })));
  function location(x: number, y: number): FieldLocation {
    const q = { x: referenceBox.x0 + (x - sourceBox.x0) * (referenceBox.x1 - referenceBox.x0) / (sourceBox.x1 - sourceBox.x0),
      y: referenceBox.y0 + (y - sourceBox.y0) * (referenceBox.y1 - referenceBox.y0) / (sourceBox.y1 - sourceBox.y0) };
    const nearest = points.map((p, index) => ({ p, index, distance: (p.x - q.x) ** 2 + (p.y - q.y) ** 2 })).sort((a, b) => a.distance - b.distance).slice(0, 24);
    const radius = Math.sqrt(Math.max(1, nearest[nearest.length - 1].distance));
    const terms = nearest.map(n => ({ index: n.index, v: [1, (n.p.x - q.x) / radius, (n.p.y - q.y) / radius], w: 1 / (1 + n.distance / radius ** 2) ** 2 }));
    const matrix = Array.from({ length: 3 }, (_, row) => [...Array.from({ length: 3 }, (_, col) =>
      terms.reduce((sum, n) => sum + n.w * n.v[row] * n.v[col], 0) + (row === col && row > 0 ? 1e-8 : 0)), row === 0 ? 1 : 0]);
    for (let col = 0; col < 3; col++) {
      const pivot = col + matrix.slice(col).map(row => Math.abs(row[col])).reduce((best, value, i, values) => value > values[best] ? i : best, 0);
      [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
      const divisor = matrix[col][col];
      if (Math.abs(divisor) < 1e-12) throw Error('Unconstrained width field');
      for (let j = col; j < 4; j++) matrix[col][j] /= divisor;
      for (let row = 0; row < 3; row++) if (row !== col) {
        const factor = matrix[row][col]; for (let j = col; j < 4; j++) matrix[row][j] -= factor * matrix[col][j];
      }
    }
    const solution = matrix.map(row => row[3]);
    return { indices: terms.map(n => n.index), coefficients: terms.map(n => n.w * n.v.reduce((sum, value, i) => sum + value * solution[i], 0)) };
  }
  return { points, nodes: source.contours.map(c => c.map(n => ({ anchor: location(n.x, n.y),
    ...(n.ix !== undefined && n.iy !== undefined ? { incoming: location(n.ix, n.iy) } : {}),
    ...(n.ox !== undefined && n.oy !== undefined ? { outgoing: location(n.ox, n.oy) } : {}),
  }))) };
}
function transferField(source: Drawn, before: Drawn, after: Drawn, field: WidthField): Drawn {
  const deltas = field.points.map(p => {
    const a = curvePoint(before.contours[p.contour], p.seg, p.t), b = curvePoint(after.contours[p.contour], p.seg, p.t);
    return { x: b.x - a.x, y: b.y - a.y };
  });
  const motion = (l: FieldLocation) => l.indices.reduce((sum, index, i) => ({ x: sum.x + deltas[index].x * l.coefficients[i], y: sum.y + deltas[index].y * l.coefficients[i] }), { x: 0, y: 0 });
  return { adv: source.adv + after.adv - before.adv, contours: source.contours.map((c, ci) => c.map((n, ni) => {
    const locations = field.nodes[ci][ni], d = motion(locations.anchor), made: Node = { ...n, x: n.x + d.x, y: n.y + d.y };
    if (locations.incoming && n.ix !== undefined && n.iy !== undefined) {
      const d = n.ix === n.x && n.iy === n.y ? motion(locations.anchor) : motion(locations.incoming);
      made.ix = n.ix + d.x; made.iy = n.iy + d.y;
    }
    if (locations.outgoing && n.ox !== undefined && n.oy !== undefined) {
      const d = n.ox === n.x && n.oy === n.y ? motion(locations.anchor) : motion(locations.outgoing);
      made.ox = n.ox + d.x; made.oy = n.oy + d.y;
    }
    return made;
  })) };
}

export function authorWidthGrid(base: MasterSourceRef, original: WeightMasterData, upstream: UpstreamWidth): WeightWidthPrototype {
  if (original.defaultWeight !== upstream.defaultWeight) throw Error('Neutral weight mismatch');
  const neutralData = original.masters.find(m => m.weight === original.defaultWeight);
  if (!neutralData) throw Error('Missing source neutral');
  const neutral = decodeFreeFont(neutralData.data), ref = decodeFreeFont(sampleAt(upstream.samples, original.defaultWeight, upstream.axis.neutral).data);
  const sx = neutral.space / ref.space, sy = neutral.cap / upstream.cap;
  const references = Object.fromEntries(Object.entries(ref.glyphs).map(([ch, g]) => [ch, scaled(g, sx, sy)]));
  const registeredCounter = neutral.family === 'Gumdrop'
    ? correspondences([neutral.glyphs['®'].contours[3]], [references['®'].contours[3]]) : null;
  const mappings = Object.fromEntries(Object.entries(neutral.glyphs).map(([ch, glyph]) => {
    const field = neutral.family === 'Gumdrop' && FIELD_GUMDROP.has(ch) ? widthField(glyph, references[ch]) : null;
    const direct = field ? null : matchGlyph(glyph, ref.glyphs[ch], sx, sy);
    const sampled = direct || field ? null : correspondences(glyph.contours, references[ch].contours);
    if (!direct && !sampled && !field) throw Error(`${ch}: width needs explicit contour correspondence`);
    return [ch, { direct, sampled, field }];
  }));
  const upstreamSignature = signature(sampleAt(upstream.samples, original.defaultWeight, upstream.axis.neutral).data);
  if (upstream.samples.some(s => signature(s.data) !== upstreamSignature)) throw Error('Upstream width grid changes contour structure');
  const widths = unique(upstream.samples.map(s => s.width)), samples: WidthSample[] = [];
  for (const master of original.masters) {
    const source = decodeFreeFont(master.data), before = decodeFreeFont(sampleAt(upstream.samples, master.weight, upstream.axis.neutral).data);
    for (const width of widths) {
      if (width === upstream.axis.neutral) { samples.push({ weight: master.weight, width, data: master.data }); continue; }
      const after = decodeFreeFont(sampleAt(upstream.samples, master.weight, width).data), glyphs: FreeFontData['glyphs'] = {};
      if (neutral.family === 'Gumdrop' && width > upstream.axis.neutral) {
        const from = before.glyphs['/'], to = after.glyphs['/'], a = cmdsBox(drawnCmds(from.contours)), b = cmdsBox(drawnCmds(to.contours));
        if (!a || !b) throw Error('Missing slash bounds');
        const match = matchGlyph(from, to, (a.x1 - a.x0) / (b.x1 - b.x0), 1);
        if (!match) throw Error('Incompatible expanded slash');
        after.glyphs['/'] = aligned(to, match);
      }
      for (const [ch, glyph] of Object.entries(source.glyphs)) {
        const mapping = mappings[ch];
        const made = mapping.direct
          ? preserveHandleLayout(glyph, directTransfer(glyph, before.glyphs[ch], after.glyphs[ch], mapping.direct, sx, sy))
          : mapping.field ? transferField(glyph, scaled(before.glyphs[ch], sx, sy), scaled(after.glyphs[ch], sx, sy), mapping.field)
            : transfer(glyph, scaled(before.glyphs[ch], sx, sy), scaled(after.glyphs[ch], sx, sy), mapping.sampled);
        if (neutral.family === 'Gumdrop' && ch === '®') {
          const beforeCounter = scaled({ adv: 0, contours: [before.glyphs[ch].contours[3]] }, sx, sy);
          const afterCounter = scaled({ adv: 0, contours: [after.glyphs[ch].contours[3]] }, sx, sy);
          made.contours[3] = transfer({ adv: 0, contours: [glyph.contours[3]] }, beforeCounter, afterCounter, registeredCounter).contours[0];
        }
        if (!mapping.direct) constrain(glyph.contours, made.contours);
        glyphs[ch] = [made.adv, made.contours.map(c => c.map(packNode))];
      }
      samples.push({ weight: master.weight, width, data: { ...master.data, glyphs, space: source.space + (after.space - before.space) * sx } });
    }
  }
  return parseWidthPrototype({ format: 'weight-width-prototype-v1', base, source: original.source,
    defaultWeight: original.defaultWeight, axis: upstream.axis, samples,
    provenance: original.provenance.some(p => p.sha256 === upstream.provenance.sha256) ? original.provenance : [...original.provenance, upstream.provenance],
    notes: [...original.notes, 'Joint upstream width changes are added to each existing authored weight drawing.',
      'The neutral width preserves every published weight master exactly; interpolation there retains the existing weight family.',
      'Fixed source-to-upstream correspondence is reused across the full grid; no runtime rematching or independent contour offset.',
      ...(neutral.family === 'Gumdrop' ? ['The 26 explicitly enumerated merged or edited Gumdrop glyphs transport the upstream width displacement through a fixed local affine field, fitted to 24 nearby upstream curve samples. Handles collapsed at a weight stay attached to their anchor; source curves and joins remain intact at neutral width.'] : []),
      ...(neutral.family === 'Gumdrop' ? ['The expanded upstream slash is cyclically realigned by six nodes before interpolation; its endpoint ink is unchanged. The registered sign R counter uses its own contour correspondence while its joined outer construction follows the shared field.'] : []),
      'Sampled correspondence retains monotone curve-handle constraints. All ranges remain provisional until reviewed.'] });
}

export function decodeWidthGrid(data: WeightWidthPrototype): WidthGrid {
  return { data, columns: unique(data.samples.map(s => s.width)).map(width => ({ width,
    program: decodeWeightMasters({ format: 'weight-masters-v1', source: data.source, defaultWeight: data.defaultWeight,
      masters: data.samples.filter(s => s.width === width).map(s => ({ weight: s.weight, data: s.data })), provenance: data.provenance, notes: data.notes }),
  })) };
}
export const widthAt = (value: number, a: WidthAxis): number => {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw Error('Width slider must be in 0..1');
  return a.min + (a.max - a.min) * value;
};
export const widthSliderAt = (value: number, a: WidthAxis): number => (value - a.min) / (a.max - a.min);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function blendNode(a: Node, b: Node, t: number): Node {
  const n: Node = { ...a, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  if (a.ix !== undefined && a.iy !== undefined && b.ix !== undefined && b.iy !== undefined) { n.ix = lerp(a.ix, b.ix, t); n.iy = lerp(a.iy, b.iy, t); }
  if (a.ox !== undefined && a.oy !== undefined && b.ox !== undefined && b.oy !== undefined) { n.ox = lerp(a.ox, b.ox, t); n.oy = lerp(a.oy, b.oy, t); }
  return n;
}
export function interpolateWidthGrid(grid: WidthGrid, weight: number, width: number): FreeFont {
  const { columns, data } = grid, weights = columns[0].program.masters;
  if (!Number.isFinite(weight) || weight < weights[0].weight || weight > weights[weights.length - 1].weight
    || !Number.isFinite(width) || width < data.axis.min || width > data.axis.max) throw Error('Requested coordinates outside authored grid');
  const exact = columns.find(c => c.width === width);
  if (exact) return interpolateMasters(exact.program, weight);
  const upper = columns.findIndex(c => c.width > width), low = columns[upper - 1], high = columns[upper];
  const a = interpolateMasters(low.program, weight), b = interpolateMasters(high.program, weight), t = (width - low.width) / (high.width - low.width);
  const glyphs: FreeFont['glyphs'] = {};
  for (const [ch, g] of Object.entries(a.glyphs)) {
    const next = b.glyphs[ch];
    glyphs[ch] = { adv: lerp(g.adv, next.adv, t), contours: g.contours.map((c, ci) => c.map((n, ni) => blendNode(n, next.contours[ci][ni], t))) };
  }
  return { ...a, glyphs, space: lerp(a.space, b.space, t) };
}

function spans(g: Drawn, y: number): number[] {
  const crossings: { x: number; winding: number }[] = [];
  for (const p of toPolys(drawnCmds(g.contours))) for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if ((a.y <= y) !== (b.y <= y)) crossings.push({ x: a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x), winding: b.y > a.y ? 1 : -1 });
  }
  crossings.sort((a, b) => a.x - b.x);
  let winding = 0, start = 0; const widths: number[] = [];
  for (const point of crossings) {
    const before = winding; winding += point.winding;
    if (!before && winding) start = point.x;
    if (before && !winding && point.x > start) widths.push(point.x - start);
  }
  return widths;
}
const midpoints = (values: number[]) => unique(values.flatMap((v, i) => i ? [(values[i - 1] + v) / 2, v] : [v]));
const inkWidth = (g: Drawn) => { const box = cmdsBox(drawnCmds(g.contours)); return box ? box.x1 - box.x0 : 0; };
export function reviewWidthGrid(data: WeightWidthPrototype, original: WeightMasterData, characters?: string) {
  const grid = decodeWidthGrid(data), baseline = decodeWeightMasters(original);
  const weights = midpoints(original.masters.map(m => m.weight)), widths = midpoints(grid.columns.map(c => c.width));
  const chars = characters ? [...characters] : Object.keys(original.masters[0].data.glyphs);
  const failures: { ch: string; weight: number; width: number; expected: ReturnType<typeof topology>; actual: ReturnType<typeof topology> }[] = [];
  let cases = 0, neutralExact = true;
  for (const weight of weights) {
    const reference = interpolateMasters(baseline, weight), neutral = interpolateWidthGrid(grid, weight, data.axis.neutral);
    if (JSON.stringify(reference) !== JSON.stringify(neutral)) neutralExact = false;
    const expected = Object.fromEntries(chars.map(ch => [ch, topology(reference.glyphs[ch].contours)]));
    for (const width of widths) {
      const font = interpolateWidthGrid(grid, weight, width);
      for (const ch of chars) {
        const actual = topology(font.glyphs[ch].contours), base = expected[ch]; cases++;
        if (actual.pieces !== base.pieces || actual.counters !== base.counters) failures.push({ ch, weight, width, expected: base, actual });
      }
    }
  }
  const comparisons = weights.filter(w => original.masters.some(m => m.weight === w)).flatMap(weight => {
    const neutral = interpolateMasters(baseline, weight), base = neutral.glyphs.H, stems = spans(base, neutral.cap * .25);
    return grid.columns.filter(c => c.width !== data.axis.neutral).map(c => {
      const target = interpolateWidthGrid(grid, weight, c.width).glyphs.H, targetStems = spans(target, neutral.cap * .25);
      const widthRatio = inkWidth(target) / inkWidth(base), stemRatio = targetStems.reduce((a, b) => a + b, 0) / stems.reduce((a, b) => a + b, 0);
      return { weight, width: c.width, bodyWidthRatio: widthRatio, stemWidthRatio: stemRatio, geometricScaleStemRatio: widthRatio,
        sourceStems: stems, authoredStems: targetStems };
    });
  });
  const failureCensus: Record<string, number> = {};
  for (const failure of failures) failureCensus[failure.ch] = (failureCensus[failure.ch] ?? 0) + 1;
  return { cases, neutralExact, failures, failureCensus, comparisons, weights, widths };
}

export function renderWidthGrid(data: WeightWidthPrototype, output: string): void {
  const grid = decodeWidthGrid(data), base = buildFont(DEFAULTS), weights = unique(data.samples.map(s => s.weight));
  const display = (font: FreeFont) => ({ ...base, m: { ...base.m, cap: font.cap }, letter() { return this; },
    advance(ch: string) { return font.glyphs[ch]?.adv ?? font.space; },
    layout(text: string) { let x = 0; const items = [...text].map(ch => { const adv = font.glyphs[ch]?.adv ?? font.space, item = { ch, adv, x }; x += adv; return item; }); return [{ items, width: x }]; },
    glyph(ch: string) { const d = font.glyphs[ch], g = base.glyph(ch); if (!d || !g) return g;
      const cmds = drawnCmds(d.contours); return { ...g, drawn: d, cmds, d: cmdsToD(cmds), adv: d.adv }; },
  });
  const selected = process.env.WIDTH_REVIEW_WEIGHTS ? process.env.WIDTH_REVIEW_WEIGHTS.split(',').map(Number)
    : unique([weights[0], weights[Math.floor(weights.length / 2)], data.defaultWeight, weights[weights.length - 1]]);
  const texts = (process.env.WIDTH_REVIEW_TEXT ?? 'HnoagRjyus&@% The quick brown fox 0123456789').split('\n');
  const rows = selected.flatMap(weight => grid.columns.flatMap(c => texts.map(text => ({ label: `${data.base.fontId} weight ${weight} width ${c.width}`,
    text, font: display(interpolateWidthGrid(grid, weight, c.width)) }))));
  const neutral = interpolateWidthGrid(grid, data.defaultWeight, data.axis.neutral), condensed = interpolateWidthGrid(grid, data.defaultWeight, data.axis.min);
  const ratio = inkWidth(condensed.glyphs.H) / inkWidth(neutral.glyphs.H), stretched = { ...neutral, space: neutral.space * ratio,
    glyphs: Object.fromEntries(Object.entries(neutral.glyphs).map(([ch, glyph]) => [ch, scaled(glyph, ratio, 1)])) };
  if (!process.env.WIDTH_REVIEW_TEXT) rows.push(...[{ label: 'Comparison: original width', font: neutral }, { label: 'Comparison: authored condensed', font: condensed },
    { label: `Comparison: geometric stretch ${ratio.toFixed(3)}`, font: stretched }].map(r => ({ ...r, text: 'Hnonminimum Rg@% Thin stems keep their strength', font: display(r.font) })));
  writeFileSync(output + '.png', rowsPNG(rows, 42)); writeFileSync(output + '.svg', rowsSVG(rows, 42));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [originalPath, extractedPath, output] = process.argv.slice(2);
  if (!originalPath || !extractedPath || !output) throw Error('Usage: width-masters.ts published-weight.json extracted-width.json prototype.json');
  const bytes = readFileSync(originalPath), original = parseWeightMasters(JSON.parse(bytes.toString('utf8')));
  const upstream = readUpstreamWidth(extractedPath, original.masters[0].data);
  const base: MasterSourceRef = { kind: 'masters-v1', digest: createHash('sha256').update(bytes).digest('hex'), fontId: original.source.fontId };
  const data = authorWidthGrid(base, original, upstream);
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(data) + '\n');
  const review = reviewWidthGrid(data, original, process.env.WIDTH_REVIEW_CHARS);
  writeFileSync(output + '.review.json', JSON.stringify(review, null, 2) + '\n'); renderWidthGrid(data, output);
  process.stdout.write(JSON.stringify({ source: base.fontId, samples: data.samples.length, cases: review.cases, neutralExact: review.neutralExact,
    failureCount: review.failures.length, failures: review.failures.slice(0, 20).map(({ ch, weight, width }) => ({ ch, weight, width })) }) + '\n');
  if (!review.neutralExact || review.failures.length) process.exitCode = 1;
}
