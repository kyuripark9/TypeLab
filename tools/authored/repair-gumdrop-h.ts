/* Reverse Gumdrop H's left stem exactly, with a correspondence map and rebased width copies. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeFreeFont, type FreeFontData, type PackedNode } from '../../shared/engine/free';
import { drawnCmds, segment, type Drawn } from '../../shared/engine/outline';
import { toPolys } from '../../shared/engine/geom';
import type { MasterSourceRef } from '../../shared/source/model';
import { decodeWeightMasters, parseWeightMasters, type WeightMasterData } from '../../shared/source/masters';
import { decodeWidthMasters, interpolateWidthMasters, parseWidthMasters, type WidthMasterData } from '../../shared/source/width-masters';
import { compileFeatureMasters } from './build-features';
import { CROSSBAR_BINDINGS } from './feature-coverage';
import { authorFeatures, renderFeatures, reviewFeatures, type Clearance, type FeatureBindings, type NodeRef } from './feature-masters';
import type { SubdivisionBinding } from './local-width-masters';
import { topology } from './transfer-masters';

const FROM: MasterSourceRef = { kind: 'masters-v1', fontId: 'Gumdrop:700', digest: '73a3ea6fabc80057f93f0e61739973da35ed789fa08b1980af73a7e91a7b8d0c' };
const WIDTH = 'f336c4a2fac997e70032cd2e6801d49b80c2fa3603884dca99d2fbf53f05e34a';
const bytesOf = (value: unknown): string => JSON.stringify(value) + '\n';
const digestOf = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

function reverseNode(n: PackedNode): PackedNode {
  const incoming: readonly [number, number] | null = n.length > 2 && typeof n[2] === 'number' && typeof n[3] === 'number' ? [n[2], n[3]] : null;
  const outgoing: readonly [number, number] | null = n.length === 6 ? [n[4], n[5]] : null;
  if (incoming) return [n[0], n[1], outgoing?.[0] ?? null, outgoing?.[1] ?? null, incoming[0], incoming[1]];
  return outgoing ? [n[0], n[1], outgoing[0], outgoing[1]] : [n[0], n[1]];
}
function repairGlyphs(glyphs: FreeFontData['glyphs']): FreeFontData['glyphs'] {
  const original = glyphs.H;
  if (!original || original[1].length !== 3 || original[1][2].length !== 14) throw Error('Gumdrop H no longer matches the pinned three-component drawing');
  return { ...glyphs, H: [original[0], original[1].map((contour, ci) => ci === 2 ? [...contour].reverse().map(reverseNode) : contour)] };
}

function repairedBindings(ref: MasterSourceRef): FeatureBindings {
  const before = CROSSBAR_BINDINGS.find(binding => binding.fontId === ref.fontId);
  if (!before) throw Error('Missing authored H binding');
  const at = ([ci, ni]: NodeRef): NodeRef => [ci, ci === 2 ? 13 - ni : ni];
  const constraints = before.clearances.map((constraint): Clearance => {
    const m = constraint.measure;
    if (m.kind === 'vertical') return { ...constraint, measure: { ...m, lower: at(m.lower), upper: at(m.upper) } };
    if (m.kind === 'overlap') return { ...constraint, measure: { ...m, tip: at(m.tip), rail: [at(m.rail[0]), at(m.rail[1])] } };
    return { ...constraint, measure: { ...m, lower: [at(m.lower[0]), m.lower[1]], upper: [at(m.upper[0]), m.upper[1]] } };
  });
  // The moving bar is contour 1; only fixed stem references need remapping.
  assert.ok(before.features.every(feature => feature.affected.every(point => point[0] === 1)));
  return { ...before, digest: ref.digest, clearances: constraints };
}

export function repairGumdropH(original: WeightMasterData, width: WidthMasterData) {
  assert.deepEqual(width.base, FROM);
  const note = 'Gumdrop H repair: reverse left-stem contour 2 and swap its handles at every weight and width. Exact curves, advances, and all other glyphs are unchanged; the bar overlap now adds ink instead of cancelling it.';
  const base = parseWeightMasters({ ...original, notes: [...original.notes, note],
    masters: original.masters.map(master => ({ ...master, data: { ...master.data, glyphs: repairGlyphs(master.data.glyphs) } })) });
  const ref: MasterSourceRef = { ...FROM, digest: digestOf(bytesOf(base)) };
  const data = parseWidthMasters({ ...width, base: ref, notes: [...width.notes, note],
    columns: width.columns.map(column => ({ ...column, masters: column.masters.map(master => ({ ...master, glyphs: repairGlyphs(master.glyphs) })) })) },
  { ref, masters: decodeWeightMasters(base) });
  const neutral = original.masters[0].data;
  const binding: SubdivisionBinding = { format: 'master-subdivision-v1', from: FROM, to: ref,
    glyphs: Object.fromEntries(Object.entries(neutral.glyphs).map(([ch, [, contours]]) => [ch, contours.map((contour, ci) => contour.map((_, si) =>
      ch === 'H' && ci === 2 ? { segment: (contour.length - 2 - si + contour.length) % contour.length, t0: 1, t1: 0 }
        : { segment: si, t0: 0, t1: 1 }))])) };
  const program = authorFeatures(ref, base, repairedBindings(ref)), features = compileFeatureMasters(program);
  features.notes = [
    'Gumdrop H crossbar height over the corrected left-stem winding. Partial H-only coverage; all other feature regions remain unreviewed.',
    'Both bar boundaries move by plus or minus 10% of cap height. Advance and unowned geometry remain unchanged.',
    'The master-subdivision-v1 binding records the exact reversed source segment parameters. Old immutable assets remain unchanged.',
    'Native-width feature interactions are not authored; this feature asset remains base-only.',
  ];
  return { base, ref, width: data, binding, features, program };
}

function edge(drawing: Drawn, ci: number, si: number) {
  const contour = drawing.contours[ci], a = contour[si], b = contour[(si + 1) % contour.length];
  return (segment(a, b) ?? [a, b]).map(p => [p.x, p.y]);
}
function exactCurves(before: FreeFontData['glyphs'], after: FreeFontData['glyphs'], font: FreeFontData, binding: SubdivisionBinding): number {
  assert.deepEqual(Object.keys(after), Object.keys(before));
  for (const ch of Object.keys(before)) if (ch !== 'H') assert.deepEqual(after[ch], before[ch]);
  assert.equal(after.H[0], before.H[0]);
  const original = decodeFreeFont({ ...font, glyphs: { H: before.H } }).glyphs.H;
  const repaired = decodeFreeFont({ ...font, glyphs: { H: after.H } }).glyphs.H;
  let edges = 0;
  binding.glyphs.H.forEach((contour, ci) => contour.forEach((range, si) => {
    const wanted = edge(original, ci, range.segment);
    assert.deepEqual(edge(repaired, ci, si), range.t0 === 1 ? wanted.reverse() : wanted);
    edges++;
  }));
  return edges;
}
function signedAreas(drawing: Drawn): number[] {
  return drawing.contours.map(contour => toPolys(drawnCmds([contour])).reduce((sum, polygon) => sum + polygon.reduce((area, p, i) => {
    const q = polygon[(i + 1) % polygon.length]; return area + p.x * q.y - q.x * p.y;
  }, 0) / 2, 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseBytes = readFileSync(`fonts/masters/${FROM.digest}.json`), widthBytes = readFileSync(`fonts/widths/${WIDTH}.json`);
  assert.equal(digestOf(baseBytes), FROM.digest); assert.equal(digestOf(widthBytes), WIDTH);
  const original = parseWeightMasters(JSON.parse(baseBytes.toString()));
  const originalWidth = parseWidthMasters(JSON.parse(widthBytes.toString()), { ref: FROM, masters: decodeWeightMasters(original) });
  const result = repairGumdropH(original, originalWidth), output = resolve('.audit/masters/gumdrop-h-repair');
  mkdirSync(output, { recursive: true });
  let exactEdges = 0;
  original.masters.forEach((master, i) => { exactEdges += exactCurves(master.data.glyphs, result.base.masters[i].data.glyphs, master.data, result.binding); });
  originalWidth.columns.forEach((column, ci) => column.masters.forEach((master, mi) => {
    exactEdges += exactCurves(master.glyphs, result.width.columns[ci].masters[mi].glyphs, original.masters[0].data, result.binding);
  }));
  writeFileSync(resolve(output, 'weight.json'), bytesOf(result.base));
  writeFileSync(resolve(output, 'width.json'), bytesOf(result.width));
  writeFileSync(resolve(output, 'binding.json'), bytesOf(result.binding));
  writeFileSync(resolve(output, 'features.json'), bytesOf(result.features));
  const manifest = { from: FROM, base: result.ref,
    width: { kind: 'width-masters-v1', fontId: FROM.fontId, digest: digestOf(bytesOf(result.width)) },
    features: { kind: 'feature-masters-v1', fontId: FROM.fontId, digest: digestOf(bytesOf(result.features)) },
    exactEdges, changedGlyphs: ['H'], published: false };
  writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(JSON.stringify(manifest) + '\n');
  if (process.argv.includes('--review')) {
    const before = decodeWidthMasters(originalWidth, decodeWeightMasters(original));
    const after = decodeWidthMasters(result.width, decodeWeightMasters(result.base));
    const weights = original.masters.flatMap((m, i, all) => i ? [(all[i - 1].weight + m.weight) / 2, m.weight] : [m.weight]);
    const widths = after.columns.flatMap((column, i, all) => i ? [(all[i - 1].width + column.width) / 2, column.width] : [column.width]);
    const rows = weights.flatMap(weight => widths.map(width => {
      const a = interpolateWidthMasters(before, weight, width).glyphs.H, b = interpolateWidthMasters(after, weight, width).glyphs.H;
      const oldInk = topology(a.contours), ink = topology(b.contours);
      assert.equal(ink.pieces, 1); assert.equal(ink.counters, 0); assert.equal(a.adv, b.adv);
      return { weight, width, before: oldInk, after: ink, beforeWinding: signedAreas(a), afterWinding: signedAreas(b) };
    }));
    const featureReview = reviewFeatures(result.program, { H: { pieces: 1, counters: 0 } });
    assert.deepEqual(featureReview.failures, []);
    const report = { exactEdges, widthCases: rows.length, rows, featureReview };
    writeFileSync(resolve(output, 'review.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ exactEdges, widthCases: rows.length, featureCases: featureReview.cases, failures: 0 }) + '\n');
  }
  if (process.argv.includes('--render')) renderFeatures(result.program, resolve(output, 'after'), 'H n H  H H');
}
