/* Author the remaining families' widths and carry their feature endpoints into the same exact basis. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeFreeFont, packNode, type FreeFontData } from '../../shared/engine/free';
import type { Drawn } from '../../shared/engine/outline';
import { parseFeatureMasters, type FeatureMasterData } from '../../shared/source/feature-masters';
import { designSourceForFont, MASTER_REVISIONS } from '../../shared/source/master-catalog';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
import { parseSourceRef } from '../../shared/source/model';
import { programInfo } from '../../shared/source/program-catalog';
import { parseWidthMasters } from '../../shared/source/width-masters';
import { authorLocalWidths, COTTON_WIDTH, mapLocalWidthFeature, type LocalWidthFeatureDrawing, type LocalWidthRecipe } from './local-width-masters';

const root = resolve(import.meta.dirname, '../..');
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const bytes = (data: unknown) => JSON.stringify(data) + '\n';
const pack = (drawing: Drawn): FreeFontData['glyphs'][string] => [drawing.adv, drawing.contours.map(c => c.map(packNode))];
const decode = (glyph: FreeFontData['glyphs'][string], font: FreeFontData): Drawn => decodeFreeFont({ ...font, glyphs: { X: glyph } }).glyphs.X;

/** Conservative first endpoints are explicit family data; optical refinement does not change the compiler. */
const WIDTH_RANGES: readonly [style: string, min: number, max: number][] = [
  ['Hearth', 90, 110], ['Couture', 92, 108], ['Sonnet', 94, 106], ['Vellum', 92, 108], ['Almanac', 90, 110],
  ['Jotter', 94, 106], ['Compass', 85, 115], ['Dispatch', 90, 110], ['Funnies', 90, 110], ['Kernel', 90, 110],
  ['Orbital', 85, 115], ['Turnpike', 90, 110], ['Ballyhoo', 90, 110], ['Boardwalk', 95, 105],
  ['Cathedral', 92, 108], ['Serenade', 95, 105], ['Timber', 90, 110], ['Bulwark', 85, 115]
];
export const LOCAL_WIDTH_RECIPES: readonly LocalWidthRecipe[] = WIDTH_RANGES.map(([style, min, max]) => ({
  ...COTTON_WIDTH, style, widths: [min, 100, max], minDerivative: .35, maxCurveError: .015,
  preserveAdvanceRatio: style === 'Dispatch' || style === 'Kernel'
}));

function readAsset(directory: string, digest: string): unknown {
  const input = readFileSync(resolve(root, 'fonts', directory, digest + '.json'));
  if (hash(input) !== digest) throw Error(`Invalid immutable ${directory} asset`);
  return JSON.parse(input.toString());
}

export function buildLocalWidthFamily(style: string, output: string) {
  const recipe = LOCAL_WIDTH_RECIPES.find(recipe => recipe.style === style);
  const info = MASTER_REVISIONS.findLast(info => info.ref.fontId.split(':')[0] === style);
  const summaryFile = resolve(output, 'summary.json');
  let source = info ? designSourceForFont(info.ref.fontId) : null;
  if (existsSync(summaryFile)) {
    const previous: unknown = JSON.parse(readFileSync(summaryFile, 'utf8'));
    if (!previous || typeof previous !== 'object' || !('from' in previous)) throw Error('Invalid previous local width summary');
    source = parseSourceRef(previous.from);
  }
  const program = programInfo(source);
  if (!recipe || !info || !program || program.width) throw Error(`${style}: expected a family without native width masters`);
  if (program.ref.fontId !== info.ref.fontId) throw Error('The previous local width summary names a different family');
  const base = parseWeightMasters(readAsset('masters', program.data.base.digest));
  const features = program.data.features ? parseFeatureMasters(readAsset('features', program.data.features.digest)) : null;
  if (features && features.widthCompatibility !== 'base-only') throw Error('The current feature asset already owns a width grid');
  const extras: LocalWidthFeatureDrawing[] = [];
  for (const control of features?.controls ?? []) for (const glyph of control.glyphs) for (const sample of glyph.masters) {
    const font = base.masters.find(master => master.weight === sample.weight)?.data;
    if (!font) throw Error('A feature endpoint must have a matching stored weight knot');
    extras.push({ glyph: glyph.glyph, weight: sample.weight, drawing: decode(sample.low, font) },
      { glyph: glyph.glyph, weight: sample.weight, drawing: decode(sample.high, font) });
  }
  const result = authorLocalWidths(base, program.data.base, recipe, extras);
  const masterBasis = { ref: result.binding.to, masters: decodeWeightMasters(result.base) };
  const widths = parseWidthMasters({ format: 'width-masters-v1', base: result.binding.to, axis: result.data.axis,
    columns: recipe.widths.filter(width => width !== 100).map(width => ({ width,
      masters: result.data.samples.filter(sample => sample.width === width).map(sample => ({
        weight: sample.weight, space: sample.data.space, glyphs: sample.data.glyphs
      })) })), provenance: result.data.provenance, notes: result.data.notes }, masterBasis);
  const widthRef = { kind: 'width-masters-v1' as const, digest: hash(bytes(widths)), fontId: info.ref.fontId };
  let madeFeatures: FeatureMasterData | null = null;
  if (features) {
    const controlsAt = (width: number) => features.controls.map(control => ({ ...control,
      glyphs: control.glyphs.map(glyph => ({ ...glyph, masters: glyph.masters.map(sample => {
        const font = base.masters.find(master => master.weight === sample.weight)?.data;
        if (!font) throw Error('Missing weight knot for width-feature composition');
        const reference = decodeFreeFont(font).glyphs[glyph.glyph];
        const mapped = (drawing: FreeFontData['glyphs'][string]) => pack(mapLocalWidthFeature(reference, decode(drawing, font),
          glyph.glyph, font.cap, base.source.digest, width, recipe, result.binding.glyphs[glyph.glyph]));
        return { weight: sample.weight, low: mapped(sample.low), high: mapped(sample.high) };
      }) }))
    }));
    madeFeatures = parseFeatureMasters({ ...features, base: result.binding.to, controls: controlsAt(100),
      widthCompatibility: { kind: 'joint-grid', width: widthRef,
        columns: recipe.widths.filter(width => width !== 100).map(width => ({ width, controls: controlsAt(width) })) },
      notes: [...features.notes, 'Feature endpoints share the local width field and exact subdivision with the full family.'] });
  }
  mkdirSync(output, { recursive: true });
  for (const [name, data] of Object.entries({ base: result.base, binding: result.binding, widths, features: madeFeatures, recipe, measurements: result.review })) {
    if (data !== null) writeFileSync(resolve(output, name + '.json'), bytes(data));
  }
  const summary = { style, from: program.ref, base: result.binding.to, width: widthRef,
    features: madeFeatures ? { kind: 'feature-masters-v1', digest: hash(bytes(madeFeatures)), fontId: info.ref.fontId } : null,
    minDerivative: result.review.minDerivative, sampledFitError: result.review.maxCurveError,
    neutralError: result.review.neutralError, oldNodes: result.review.oldNodes, newNodes: result.review.newNodes,
    validation: 'Generated with structural and neutral reconstruction checks; optical and parameter sweeps deferred.' };
  writeFileSync(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), selected = args[0], output = args[1];
  if (!selected || !output) throw Error('Usage: build-local-widths.ts <family|--all> <output-directory>');
  if (selected === '--all') {
    for (const recipe of LOCAL_WIDTH_RECIPES) {
      const child = spawnSync(process.execPath, ['--max-old-space-size=512', '--import', 'tsx', process.argv[1], recipe.style, resolve(output, recipe.style)], { stdio: 'inherit' });
      if (child.status !== 0) throw Error(`${recipe.style} width generation failed`);
    }
  } else process.stdout.write(JSON.stringify(buildLocalWidthFamily(selected, resolve(output))) + '\n');
}
