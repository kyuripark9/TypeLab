/* Publish reviewed width or feature assets and their immutable program manifests. --check only verifies published data. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeFeatureMasters, FEATURE_CONTROLS, featureSupportedGlyphs, parseFeatureMasters } from '../../shared/source/feature-masters';
import { masterInfo, MASTER_REVISIONS } from '../../shared/source/master-catalog';
import { parseSourceFinish } from '../../shared/source/finish';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
import type { MasterSourceRef } from '../../shared/source/model';
import { parseSourceProgram, type ProgramAssetRef, type SourceProgramData } from '../../shared/source/program';
import { PROGRAM_REVISIONS, type ProgramInfo } from '../../shared/source/program-catalog';
import { parseWidthMasters } from '../../shared/source/width-masters';
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
  const features = data.features ? decodeFeatureMasters(parseFeatureMasters(readAsset('features', data.features.digest)), base) : null;
  if (width && features) throw Error('Width and feature combinations require reviewed interaction masters');
  if (features && (features.data.weightRange[0] !== base.data.masters[0].weight
    || features.data.weightRange[1] !== base.data.masters[base.data.masters.length - 1].weight)) throw Error('Published features must cover the whole weight family');
  return { ref: { kind: 'program-v1', digest, fontId: base.ref.fontId }, data, width: width?.axis ?? null,
    featureGlyphs: features ? Object.fromEntries(FEATURE_CONTROLS.map(key => [key, featureSupportedGlyphs(features, key)])) : {} };
}

const entries = PROGRAM_REVISIONS.map(entry => describe(parseSourceProgram(readAsset('programs', entry.ref.digest)), entry.ref.digest));
const args = process.argv.slice(2).filter(arg => arg !== '--check'), selected = new Set<string>();
function addProgram(data: SourceProgramData) {
  if (selected.has(data.base.fontId)) throw Error('Publish one reviewed program per family in each run');
  selected.add(data.base.fontId);
  const digest = hash(JSON.stringify(data) + '\n'), entry = describe(data, digest);
  publish('programs', data);
  if (!entries.some(entry => entry.ref.digest === digest)) entries.push(entry);
}
for (let i = 0; i < args.length; i += 2) {
  const mode = args[i], file = args[i + 1];
  if (!file || mode !== '--width' && mode !== '--features' && mode !== '--finish') throw Error('Use --width prototype.json, --features asset.json or --finish policy.json');
  if (mode === '--finish') {
    const finish = parseSourceFinish(JSON.parse(readFileSync(file, 'utf8')));
    for (const { ref } of new Map(MASTER_REVISIONS.map(info => [info.ref.fontId, info])).values()) {
      const previous = entries.findLast(entry => entry.ref.fontId === ref.fontId)?.data;
      addProgram(previous ? { ...previous, finish } : { format: 'source-program-v1', base: ref, width: null, features: null, finish });
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
    decodeFeatureMasters(data, basis(data.base));
    base = data.base;
    asset = { kind: 'feature-masters-v1', digest: publish('features', data), fontId: base.fontId };
  }
  const previous = entries.findLast(entry => entry.ref.fontId === base.fontId)?.data;
  if (previous && previous.base.digest !== base.digest) throw Error('A changed weight basis requires compatible replacements for every existing program asset');
  const data: SourceProgramData = { ...previous, format: 'source-program-v1', base,
    width: asset.kind === 'width-masters-v1' ? asset : previous?.width ?? null,
    features: asset.kind === 'feature-masters-v1' ? asset : previous?.features ?? null };
  addProgram(data);
}
const catalogFile = resolve(root, 'shared/source/program-catalog.ts'), template = readFileSync(catalogFile, 'utf8');
const catalog = template.replace(/export const PROGRAM_REVISIONS: readonly ProgramInfo\[\] = [\s\S]*?;\n/, `export const PROGRAM_REVISIONS: readonly ProgramInfo[] = ${JSON.stringify(entries, null, 2)};\n`);
if (!check) mkdirSync(resolve(root, 'fonts/programs'), { recursive: true });
write(resolve(root, 'fonts/programs/manifest.json'), JSON.stringify(entries, null, 2) + '\n');
write(catalogFile, catalog);
process.stdout.write(JSON.stringify({ programs: entries.length, selected: [...selected], check }) + '\n');
