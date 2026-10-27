/* Publish reviewed width or feature assets and their immutable program manifests. --check only verifies published data. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeFeatureMasters, FEATURE_CONTROLS, featureSupportedGlyphs, parseFeatureMasters } from '../../shared/source/feature-masters';
import { decodeSourceComponents, parseSourceComponents } from '../../shared/source/components';
import { masterInfo, MASTER_REVISIONS } from '../../shared/source/master-catalog';
import { parseSourceFinish } from '../../shared/source/finish';
import { parseSourceSpacing } from '../../shared/source/spacing';
import { parseSourceMarks } from '../../shared/source/marks';
import { parseGlyphForm } from '../../shared/source/forms';
import { parseSourceDots } from '../../shared/source/dots';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
import type { MasterSourceRef } from '../../shared/source/model';
import { parseSourceProgram, type ProgramAssetRef, type SourceProgramData } from '../../shared/source/program';
import { PROGRAM_REVISIONS, type ProgramInfo } from '../../shared/source/program-catalog';
import { decodeWidthMasters, parseWidthMasters } from '../../shared/source/width-masters';
import { decodeMasterSubdivision, parseMasterSubdivision } from '../../shared/source/subdivision';
import { parseWidthPrototype } from './width-masters';

const root = fileURLToPath(new URL('../..', import.meta.url)), check = process.argv.includes('--check');
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function readAsset(directory: string, digest: string): unknown {
  const bytes = readFileSync(resolve(root, 'fonts', directory, digest + '.json'), 'utf8');
  if (hash(bytes) !== digest) throw Error(`Asset integrity check failed: ${directory}/${digest}`);
  return JSON.parse(bytes);
}
function basis(ref: MasterSourceRef) {
  const info = masterInfo(ref), data = parseWeightMasters(readAsset('masters', ref.digest));
  if (!info || info.ref.fontId !== data.source.fontId) throw Error('The program requires a published master basis');
  return { ref, data, masters: decodeWeightMasters(data) };
}
function write(file: string, bytes: string) {
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== bytes) throw Error(`Generated asset needs updating: ${file}`);
  } else writeFileSync(file, bytes);
}
function publish(directory: string, data: unknown): string {
  const bytes = JSON.stringify(data) + '\n', digest = hash(bytes), dir = resolve(root, 'fonts', directory), file = resolve(dir, digest + '.json');
  if (!check) mkdirSync(dir, { recursive: true });
  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') !== bytes) throw Error(`Immutable asset changed: ${digest}`);
  } else write(file, bytes);
  return digest;
}
function describe(data: SourceProgramData, digest: string): ProgramInfo {
  const base = basis(data.base);
  const width = data.width ? parseWidthMasters(readAsset('widths', data.width.digest), base) : null;
  const features = data.features ? decodeFeatureMasters(parseFeatureMasters(readAsset('features', data.features.digest)), base,
    width && data.width ? { ref: data.width, masters: decodeWidthMasters(width, base.masters) } : undefined) : null;
  const components = data.components ? decodeSourceComponents(parseSourceComponents(readAsset('components', data.components.digest)), base,
    width && data.width ? { ref: data.width, masters: decodeWidthMasters(width, base.masters) } : undefined) : null;
  if (width && features?.data.widthCompatibility === 'base-only') throw Error('Width and feature combinations require reviewed interaction masters');
  for (const choice of data.forms ?? []) {
    if (!width || !data.width) throw Error('Letter forms require the program\'s width masters');
    const form = parseGlyphForm(readAsset('forms', choice.ref.digest), base, { ref: data.width, masters: decodeWidthMasters(width, base.masters) });
    if (form.glyph !== choice.glyph || !base.masters.masters[0].font.glyphs[choice.glyph]) throw Error(`A letter form must replace a letter its program draws: ${choice.ref.digest}`);
  }
  if (data.dots && data.dots.baseline.some(key => !components?.data.glyphs.some(binding => `${binding.glyph}:${binding.id}` === key))) {
    throw Error('A dot policy may stand only bound dots on the baseline');
  }
  for (const transition of data.transitions ?? []) {
    decodeMasterSubdivision(parseMasterSubdivision(readAsset('subdivisions', transition.mapping.digest)), { from: basis(transition.from), to: base });
  }
  if (features && (features.data.weightRange[0] !== base.data.masters[0].weight
    || features.data.weightRange[1] !== base.data.masters[base.data.masters.length - 1].weight)) throw Error('Published features must cover the whole weight family');
  return { ref: { kind: 'program-v1', digest, fontId: base.ref.fontId }, data, width: width?.axis ?? null,
    ...(components ? { componentGlyphs: [...new Set(components.data.glyphs.map(glyph => glyph.glyph))] } : {}),
    featureGlyphs: features ? Object.fromEntries(FEATURE_CONTROLS.map(key => [key, featureSupportedGlyphs(features, key)])) : {} };
}

const entries = PROGRAM_REVISIONS.map(entry => describe(parseSourceProgram(readAsset('programs', entry.ref.digest)), entry.ref.digest));
const args = process.argv.slice(2).filter(arg => arg !== '--check'), selected = new Map<string, SourceProgramData>();
const previousProgram = (fontId: string) => selected.get(fontId) ?? entries.findLast(entry => entry.ref.fontId === fontId)?.data;
function addProgram(data: SourceProgramData) {
  // published in the order a program reads back, so its manifest entry matches the file
  selected.set(data.base.fontId, parseSourceProgram(JSON.parse(JSON.stringify(data))));
}
for (let i = 0; i < args.length; i += 2) {
  const mode = args[i], file = args[i + 1];
  if (!file || !['--width', '--features', '--finish', '--spacing', '--components', '--marks', '--forms', '--dots', '--width-asset', '--feature-asset', '--program'].includes(mode)) {
    throw Error('Use --width prototype.json, --features asset.json, --finish policy.json, --spacing policy.json, --components manifest.json, --marks manifest.json, --forms manifest.json, --dots manifest.json, --width-asset asset.json, --feature-asset asset.json, or --program manifest.json');
  }
  if (mode === '--program') {
    const data = parseSourceProgram(JSON.parse(readFileSync(file, 'utf8')));
    const previous = previousProgram(data.base.fontId);
    if (previous && previous.base.digest !== data.base.digest && !data.transitions?.some(t => t.from.digest === previous.base.digest)) {
      throw Error('A changed master basis requires an exact transition from the previous program');
    }
    addProgram(data);
    continue;
  }
  if (mode === '--width-asset') {
    const input: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!input || typeof input !== 'object' || !('base' in input)) throw Error('Width asset requires its master base');
    const parsed = parseSourceProgram({ format: 'source-program-v1', base: input.base, width: null, features: null });
    publish('widths', parseWidthMasters(input, basis(parsed.base)));
    continue;
  }
  if (mode === '--finish' || mode === '--spacing') {
    const input: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const extension = mode === '--finish' ? { finish: parseSourceFinish(input) } : { spacing: parseSourceSpacing(input) };
    for (const { ref } of new Map(MASTER_REVISIONS.map(info => [info.ref.fontId, info])).values()) {
      const previous = previousProgram(ref.fontId);
      addProgram(previous ? { ...previous, ...extension } : { format: 'source-program-v1', base: ref, width: null, features: null, ...extension });
    }
    continue;
  }
  if (mode === '--marks') {
    // each style's newest program pins the marks published for its exact weight, width and component bases
    const input: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(input)) throw new TypeError('Expected a source mark manifest');
    for (const { ref } of new Map(MASTER_REVISIONS.map(info => [info.ref.fontId, info])).values()) {
      const previous = previousProgram(ref.fontId);
      if (!previous?.width || !previous.components) throw Error(`Marks require a program with widths and components for ${ref.fontId}`);
      const match = input.findLast(entry => entry?.ref?.kind === 'source-marks-v1' && entry.base?.digest === previous.base.digest
        && entry.width?.digest === previous.width?.digest && entry.components?.digest === previous.components?.digest);
      if (!match) throw Error(`No marks match the current weight, width and component bases for ${ref.fontId}`);
      const marks = parseSourceMarks(readAsset('marks', match.ref.digest));
      if (marks.base.fontId !== ref.fontId) throw Error(`Marks name another font: ${match.ref.digest}`);
      addProgram({ ...previous, marks: { kind: 'source-marks-v1', digest: match.ref.digest, fontId: ref.fontId } });
    }
    continue;
  }
  if (mode === '--forms') {
    // each style's newest program offers the forms published on its exact weight and width bases, in manifest order
    const input: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(input)) throw new TypeError('Expected a letter form manifest');
    for (const { ref } of new Map(MASTER_REVISIONS.map(info => [info.ref.fontId, info])).values()) {
      const previous = previousProgram(ref.fontId);
      const forms = input.filter(entry => entry?.ref?.kind === 'glyph-form-masters-v1' && entry.ref.fontId === ref.fontId)
        .filter(entry => entry.base?.digest === previous?.base.digest && entry.width?.digest === previous?.width?.digest)
        .map(entry => ({ glyph: entry.glyph, id: entry.id, label: entry.label, ref: entry.ref }));
      if (input.some(entry => entry?.ref?.fontId === ref.fontId) && !forms.length) throw Error(`No letter forms match the current weight and width bases for ${ref.fontId}`);
      if (forms.length && previous) addProgram({ ...previous, forms });
    }
    continue;
  }
  if (mode === '--dots') {
    // each style's newest program offers the round and square dots measured on its exact weight, width and dot bindings
    const input: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(input)) throw new TypeError('Expected a source dot manifest');
    for (const { ref } of new Map(MASTER_REVISIONS.map(info => [info.ref.fontId, info])).values()) {
      const previous = previousProgram(ref.fontId), entry = input.find(item => item?.fontId === ref.fontId);
      if (!entry) continue;
      if (!previous?.components || entry.base?.digest !== previous.base.digest || entry.width?.digest !== previous.width?.digest
        || entry.components?.digest !== previous.components.digest) throw Error(`The dot policy for ${ref.fontId} was measured on other bases`);
      addProgram({ ...previous, dots: parseSourceDots(entry.dots) });
    }
    continue;
  }
  if (mode === '--components') {
    const input: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(input)) throw new TypeError('Expected a source component manifest');
    const components = input.map(entry => {
      if (!entry || typeof entry !== 'object' || !('base' in entry) || !('width' in entry) || !('ref' in entry)) {
        throw new TypeError('Invalid source component manifest entry');
      }
      return parseSourceProgram({ format: 'source-program-v1', base: entry.base, width: entry.width, features: null, components: entry.ref });
    });
    for (const { ref } of new Map(MASTER_REVISIONS.map(info => [info.ref.fontId, info])).values()) {
      const previous = previousProgram(ref.fontId);
      if (!previous) throw Error(`Components require an existing program for ${ref.fontId}`);
      const match = components.findLast(item => item.base.fontId === previous.base.fontId && item.base.digest === previous.base.digest
        && item.width?.digest === previous.width?.digest);
      if (!match?.components) throw Error(`No components match the current weight/width bases for ${ref.fontId}`);
      addProgram({ ...previous, components: match.components });
    }
    continue;
  }
  let base: MasterSourceRef, asset: ProgramAssetRef;
  if (mode === '--width') {
    const candidate = parseWidthPrototype(JSON.parse(readFileSync(file, 'utf8'))), original = basis(candidate.base);
    for (const sample of candidate.samples.filter(s => s.width === candidate.axis.neutral)) {
      assert.deepEqual(sample.data, original.data.masters.find(m => m.weight === sample.weight)?.data, 'Neutral width must preserve the published masters exactly');
    }
    const widths = [...new Set(candidate.samples.map(s => s.width))].filter(w => w !== candidate.axis.neutral).sort((a, b) => a - b);
    const data = parseWidthMasters({ format: 'width-masters-v1', base: candidate.base, axis: candidate.axis,
      columns: widths.map(width => ({ width, masters: candidate.samples.filter(s => s.width === width).map(s => ({ weight: s.weight, space: s.data.space, glyphs: s.data.glyphs })) })),
      provenance: candidate.provenance, notes: candidate.notes }, original);
    base = data.base;
    asset = { kind: 'width-masters-v1', digest: publish('widths', data), fontId: base.fontId };
  } else {
    const data = parseFeatureMasters(JSON.parse(readFileSync(file, 'utf8')));
    const original = basis(data.base), compatibility = data.widthCompatibility;
    decodeFeatureMasters(data, original, compatibility === 'base-only' ? undefined : { ref: compatibility.width,
      masters: decodeWidthMasters(parseWidthMasters(readAsset('widths', compatibility.width.digest), original), original.masters) });
    base = data.base;
    asset = { kind: 'feature-masters-v1', digest: publish('features', data), fontId: base.fontId };
    if (mode === '--feature-asset') continue;
  }
  const previous = previousProgram(base.fontId);
  if (previous && previous.base.digest !== base.digest) throw Error('A changed weight basis requires compatible replacements for every existing program asset');
  const data: SourceProgramData = { ...previous, format: 'source-program-v1', base,
    width: asset.kind === 'width-masters-v1' ? asset : previous?.width ?? null,
    features: asset.kind === 'feature-masters-v1' ? asset : previous?.features ?? null };
  addProgram(data);
}
for (const data of selected.values()) {
  const digest = hash(JSON.stringify(data) + '\n'), entry = describe(data, digest);
  publish('programs', data);
  if (!entries.some(entry => entry.ref.digest === digest)) entries.push(entry);
}
const catalogFile = resolve(root, 'shared/source/program-catalog.ts'), template = readFileSync(catalogFile, 'utf8');
const catalog = template.replace(/export const PROGRAM_REVISIONS: readonly ProgramInfo\[\] = [\s\S]*?;\n/, `export const PROGRAM_REVISIONS: readonly ProgramInfo[] = ${JSON.stringify(entries, null, 2)};\n`);
if (!check) mkdirSync(resolve(root, 'fonts/programs'), { recursive: true });
write(resolve(root, 'fonts/programs/manifest.json'), JSON.stringify(entries, null, 2) + '\n');
write(catalogFile, catalog);
process.stdout.write(JSON.stringify({ programs: entries.length, selected: [...selected.keys()], check }) + '\n');
