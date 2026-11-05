/* Carry repaired weight drawings into a family's published point basis, its width drawings and its H crossbar.
   Compass's and Kernel's weights away from their own were transferred from static upstream weights whose points sit
   in different places (sample-masters.ts --aligned now matches them); this puts the repaired package, which keeps the
   original sheet's points, on the points the published basis cut for its widths, and recompiles each width drawing
   through the family's same horizontal field. The style's own weight, every advance and every point's identity stay;
   only letters whose curves the repair moved change, and only at the other weights.

     node --import tsx tools/authored/repair-weight-masters.ts Compass <repaired-package.json> <out-directory>

   Writes base.json (the repaired basis), from-current.json and from-first.json (its maps from the published basis and
   from the first master package, naming the redrawn letters), width.json and features.json (the width drawings and
   the H crossbar on the repaired basis), and summary.json. Every step is first checked by rebuilding the published
   basis and width drawings from the first package exactly. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeFreeFont, packNode, type FreeFontData } from '../../shared/engine/free';
import { subCubic } from '../../shared/engine/geom';
import type { Drawn } from '../../shared/engine/outline';
import { parseFeatureMasters } from '../../shared/source/feature-masters';
import { parseWeightMasters, type WeightMasterData } from '../../shared/source/masters';
import type { MasterSourceRef } from '../../shared/source/model';
import { PROGRAM_REVISIONS } from '../../shared/source/program-catalog';
import { parseMasterSubdivision, type MasterSubdivisionData, type SubdivisionSegment } from '../../shared/source/subdivision';
import { parseWidthMasters, type WidthMasterData } from '../../shared/source/width-masters';
import { decodeWeightMasters } from '../../shared/source/masters';
import { LOCAL_WIDTH_RECIPES } from './build-local-widths';
import { fitWidth, widthCurve, widthDots, widthField, widthFitError, widthMap, widthNodes } from './local-width-masters';

const root = fileURLToPath(new URL('../..', import.meta.url));
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const bytesOf = (data: unknown) => JSON.stringify(data) + '\n';
function readAsset(directory: string, digest: string): unknown {
  const bytes = readFileSync(resolve(root, 'fonts', directory, digest + '.json'), 'utf8');
  if (hash(bytes) !== digest) throw Error(`Asset integrity check failed: ${directory}/${digest}`);
  return JSON.parse(bytes);
}
type Packed = FreeFontData['glyphs'][string];
const pack = (d: Drawn): Packed => [d.adv, d.contours.map(c => c.map(packNode))];

/** A letter on the published basis's points: each of its new edges the exact piece of the old edge it names. */
function cut(glyph: Drawn, intervals: SubdivisionSegment[][]): Drawn {
  return { adv: glyph.adv, contours: intervals.map((ranges, ci) => widthNodes(ranges.map(r => subCubic(widthCurve(glyph.contours[ci], r.segment), r.t0, r.t1)))) };
}

export function repairFamily(style: string, repairedFile: string) {
  const program = PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId.split(':')[0] === style);
  const transition = program?.data.transitions?.[0];
  if (!program?.data.width || !program.data.features || !transition || program.data.transitions!.length !== 1) {
    throw Error(`${style}: expected a published program with widths, features and one basis transition`);
  }
  const recipe = LOCAL_WIDTH_RECIPES.find(r => r.style === style);
  if (!recipe) throw Error(`${style}: no local width recipe`);
  const first = parseWeightMasters(readAsset('masters', transition.from.digest));
  const current = parseWeightMasters(readAsset('masters', program.data.base.digest));
  const binding = parseMasterSubdivision(readAsset('subdivisions', transition.mapping.digest));
  const width = readAsset('widths', program.data.width.digest) as WidthMasterData;
  const features = parseFeatureMasters(readAsset('features', program.data.features.digest));
  const repaired = parseWeightMasters(JSON.parse(readFileSync(repairedFile, 'utf8')));
  assert.equal(binding.to.digest, program.data.base.digest, 'The published transition must reach the current basis');
  assert.deepEqual(repaired.source, first.source, 'The repair must start from the same original sheet');
  assert.equal(repaired.defaultWeight, first.defaultWeight);
  assert.deepEqual(repaired.masters.map(m => m.weight), first.masters.map(m => m.weight), 'The repair must keep the weight knots');
  const neutralIndex = first.masters.findIndex(m => m.weight === first.defaultWeight);
  assert.deepEqual(repaired.masters[neutralIndex].data, first.masters[neutralIndex].data, 'The style\'s own weight must stay exactly as published');

  const fonts = (data: WeightMasterData) => data.masters.map(m => decodeFreeFont(m.data));
  const firstFonts = fonts(first), repairedFonts = fonts(repaired), neutral = firstFonts[neutralIndex];
  const redrawn: string[] = [];
  for (const ch of Object.keys(neutral.glyphs).sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!)) {
    const changed = repaired.masters.some((m, wi) => JSON.stringify(m.data.glyphs[ch]) !== JSON.stringify(first.masters[wi].data.glyphs[ch]));
    if (!changed) continue;
    repaired.masters.forEach((m, wi) => {
      const a = m.data.glyphs[ch], b = first.masters[wi].data.glyphs[ch];
      assert.equal(a[0], b[0], `${ch}: the repair must keep the advance`);
      assert.deepEqual(a[1].map(c => c.map(n => n.length)), b[1].map(c => c.map(n => n.length)), `${ch}: the repair must keep the points`);
    });
    redrawn.push(ch);
  }

  // The published basis, from the first package and from the repair: the first must rebuild it exactly
  const onBasis = (source: ReturnType<typeof fonts>): WeightMasterData['masters'] => current.masters.map((m, wi) => ({ weight: m.weight,
    data: { ...m.data, glyphs: Object.fromEntries(Object.keys(m.data.glyphs).map(ch => [ch, pack(cut(source[wi].glyphs[ch], binding.glyphs[ch]))])) } }));
  assert.deepEqual(onBasis(firstFonts), current.masters, 'The first package must rebuild the published basis exactly');
  const base = parseWeightMasters({ ...current, masters: onBasis(repairedFonts).map((m, wi) => ({ weight: m.weight,
    data: { ...m.data, glyphs: Object.fromEntries(Object.entries(m.data.glyphs).map(([ch, g]) => [ch, redrawn.includes(ch) ? g : current.masters[wi].data.glyphs[ch]])) } })),
    notes: [...current.notes, `Repaired weights: ${redrawn.join('')} redrawn at ${current.masters.filter(m => m.weight !== current.defaultWeight).map(m => m.weight).join(' and ')} from upstream weights matched point for point by their corners and extremes (sample-masters.ts --aligned); the ${current.defaultWeight} weight, advances and points are unchanged.`] });
  const baseRef: MasterSourceRef = { kind: 'masters-v1', digest: hash(bytesOf(base)), fontId: current.source.fontId };

  // The width drawings through the same horizontal field: the first package must rebuild the published ones exactly
  let fitError = 0;
  const columns = (source: ReturnType<typeof fonts>, only: Set<string> | null) => width.columns.map(column => ({ width: column.width,
    masters: column.masters.map((m, wi) => ({ weight: m.weight, space: m.space, glyphs: Object.fromEntries(Object.entries(m.glyphs).map(([ch, published]) => {
      if (only && !only.has(ch)) return [ch, published];
      const g = source[wi].glyphs[ch], dots = widthDots(ch, neutral.glyphs[ch], neutral.cap, first.source.digest, recipe);
      const map = widthMap(g, column.width, widthField(g, source[wi].cap, recipe).at, recipe.rigidGlyphs.includes(ch), dots, recipe.preserveAdvanceRatio);
      const contours = binding.glyphs[ch].map((ranges, ci) => widthNodes(ranges.map(r => {
        const part = subCubic(widthCurve(g.contours[ci], r.segment), r.t0, r.t1), made = fitWidth(part, map.contours[ci]);
        fitError = Math.max(fitError, widthFitError(part, made, map.contours[ci]));
        return made;
      })));
      return [ch, pack({ adv: map.advance, contours })];
    })) })) }));
  assert.deepEqual(columns(firstFonts, null), width.columns, 'The first package must rebuild the published width drawings exactly');
  fitError = 0;
  const masterBasis = { ref: baseRef, masters: decodeWeightMasters(base) };
  const widths = parseWidthMasters({ ...width, base: baseRef, columns: columns(repairedFonts, new Set(redrawn)),
    notes: [...width.notes, `Width drawings of ${redrawn.join('')} recompiled through the same field from the repaired weights.`] }, masterBasis);
  const widthRef = { kind: 'width-masters-v1' as const, digest: hash(bytesOf(widths)), fontId: baseRef.fontId };

  // The H crossbar's endpoints are drawn on H, which no repair may move
  const featureGlyphs = new Set(features.controls.flatMap(c => c.glyphs.map(g => g.glyph)));
  const moved = [...featureGlyphs].filter(ch => redrawn.includes(ch));
  if (moved.length) throw Error(`${style}: the repair moved feature letters ${moved.join('')}; their endpoints need redrawing`);
  if (features.widthCompatibility === 'base-only') throw Error(`${style}: expected joint width features`);
  const madeFeatures = parseFeatureMasters({ ...features, base: baseRef, widthCompatibility: { ...features.widthCompatibility, width: widthRef } });

  const maps: MasterSubdivisionData[] = [
    { format: 'master-subdivision-v1', from: binding.to, to: baseRef,
      glyphs: Object.fromEntries(Object.entries(binding.glyphs).map(([ch, contours]) => [ch, contours.map(c => c.map((_, si) => ({ segment: si, t0: 0, t1: 1 })))])),
      ...(redrawn.length ? { redrawn: redrawn.join('') } : {}) },
    { format: 'master-subdivision-v1', from: binding.from, to: baseRef, glyphs: binding.glyphs, ...(redrawn.length ? { redrawn: redrawn.join('') } : {}) },
  ].map(m => parseMasterSubdivision(JSON.parse(JSON.stringify(m))));
  return { base, baseRef, widths, widthRef, features: madeFeatures, maps, redrawn: redrawn.join(''), widthFitError: fitError, program };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [style, repairedFile, output] = process.argv.slice(2);
  if (!style || !repairedFile || !output) throw Error('Usage: repair-weight-masters.ts <Family> <repaired-package.json> <out-directory>');
  const result = repairFamily(style, repairedFile), dir = resolve(output);
  mkdirSync(dir, { recursive: true });
  const write = (name: string, data: unknown) => writeFileSync(resolve(dir, name), bytesOf(data));
  write('base.json', result.base); write('from-current.json', result.maps[0]); write('from-first.json', result.maps[1]);
  write('width.json', result.widths); write('features.json', result.features);
  const summary = { style, from: result.program.ref, base: result.baseRef, width: result.widthRef,
    features: { kind: 'feature-masters-v1', digest: hash(bytesOf(result.features)), fontId: result.baseRef.fontId },
    redrawn: result.redrawn, widthFitError: result.widthFitError };
  writeFileSync(resolve(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  process.stdout.write(JSON.stringify(summary) + '\n');
}
