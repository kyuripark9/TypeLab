/* Compile the reviewed pilot recipes into sparse immutable assets. No program or UI capability is enabled here. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packNode } from '../../shared/engine/free';
import { FEATURE_CONTROLS, decodeFeatureMasters, featureSupportedGlyphs, parseFeatureMasters, type FeatureControl, type FeatureMasterData } from '../../shared/source/feature-masters';
import { MASTER_REVISIONS } from '../../shared/source/master-catalog';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
import type { MasterSourceRef } from '../../shared/source/model';
import type { FeatureMasterRef } from '../../shared/source/program';
import { decodeWidthMasters, parseWidthMasters } from '../../shared/source/width-masters';
import { PILOT_BINDINGS, authorFeatures, evaluateFeatures, type FeatureProgram } from './feature-masters';

export function compileFeatureMasters(program: FeatureProgram): FeatureMasterData {
  const controls = FEATURE_CONTROLS.flatMap(control => {
    const characters = [...new Set(program.features.filter(f => f.control === control).map(f => f.glyph))];
    if (!characters.length) return [];
    return [{ control, glyphs: characters.map(glyph => ({ glyph, masters: program.base.masters.map(master => {
      const endpoint = (value: number) => {
        const cap = master.data.cap, values = { crossbar: 0, tail: 0, terminalLength: 0, [control]: value };
        const d = evaluateFeatures(program, { glyph, weight: master.weight, values, height: { xScale: 1, y: [[0, 0], [cap, cap]] } });
        return [d.adv, d.contours.map(c => c.map(packNode))];
      };
      return { weight: master.weight, low: endpoint(-1), high: endpoint(1) };
    }) })) }];
  });
  const data = parseFeatureMasters({ format: 'feature-masters-v1', base: program.source,
    weightRange: [program.base.masters[0].weight, program.base.masters[program.base.masters.length - 1].weight],
    widthCompatibility: 'base-only', controls,
    notes: [
      'Partial authored coverage: H/A crossbar height, R leg direction, and c terminal extension. Other glyphs are unreviewed for these controls.',
      'Values use 0..1 with an unchanged source at 0.5. Compatible endpoints include every base weight master.',
      'The R leg carries an authored advance change. Fixed attachment ports, bar overlap and outer margins, aperture, and Couture neck constraints were reviewed offline.',
      'Native width interactions are not authored. A program must not combine this asset with a native width asset.',
      'Underlying source licences and credits are retained by the pinned base dependency.',
    ],
  });
  decodeFeatureMasters(data, { ref: program.source, masters: decodeWeightMasters(program.base) });
  return data;
}

interface FeatureInfo {
  ref: FeatureMasterRef; base: MasterSourceRef; weightRange: readonly [number, number];
  coverage: Record<FeatureControl, readonly string[]>;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('../..', import.meta.url)), output = resolve(root, 'fonts/features'), check = process.argv.includes('--check');
  const names = process.argv.slice(2).filter(v => v !== '--check');
  const selected = names.length ? PILOT_BINDINGS.filter(b => names.includes(b.fontId)) : PILOT_BINDINGS;
  if (names.some(name => !PILOT_BINDINGS.some(b => b.fontId === name))) throw Error('Unknown reviewed feature pilot');
  if (!check) mkdirSync(output, { recursive: true });
  const published: FeatureMasterRef[] = [];
  for (const bindings of selected) {
    // a pilot is authored on the weight masters its bindings name, not a later revision of them
    const ref = MASTER_REVISIONS.find(info => info.ref.fontId === bindings.fontId && info.ref.digest === bindings.digest)?.ref;
    if (!ref) throw Error(`Missing the weight masters ${bindings.fontId} was bound on`);
    const baseBytes = readFileSync(resolve(root, 'fonts/masters', ref.digest + '.json'));
    if (createHash('sha256').update(baseBytes).digest('hex') !== ref.digest) throw Error('Weight basis integrity check failed');
    const base = parseWeightMasters(JSON.parse(baseBytes.toString())), data = compileFeatureMasters(authorFeatures(ref, base, bindings));
    const bytes = JSON.stringify(data) + '\n', digest = createHash('sha256').update(bytes).digest('hex'), target = resolve(output, digest + '.json');
    if (existsSync(target)) {
      if (readFileSync(target, 'utf8') !== bytes) throw Error(`Immutable feature asset changed: ${digest}`);
    } else if (check) throw Error(`Missing feature asset: ${digest}`);
    else writeFileSync(target, bytes);
    published.push({ kind: 'feature-masters-v1', digest, fontId: ref.fontId });
  }
  const entries: FeatureInfo[] = readdirSync(output).filter(file => /^[a-f0-9]{64}\.json$/.test(file)).sort().map(file => {
    const bytes = readFileSync(resolve(output, file)), digest = file.slice(0, -5);
    if (createHash('sha256').update(bytes).digest('hex') !== digest) throw Error(`Feature asset integrity check failed: ${digest}`);
    const data = parseFeatureMasters(JSON.parse(bytes.toString()));
    const baseBytes = readFileSync(resolve(root, 'fonts/masters', data.base.digest + '.json'));
    if (createHash('sha256').update(baseBytes).digest('hex') !== data.base.digest) throw Error('Weight basis integrity check failed');
    const basis = decodeWeightMasters(parseWeightMasters(JSON.parse(baseBytes.toString()))), dependency = { ref: data.base, masters: basis };
    let width;
    if (data.widthCompatibility !== 'base-only') {
      const ref = data.widthCompatibility.width, content = readFileSync(resolve(root, 'fonts/widths', ref.digest + '.json'));
      if (createHash('sha256').update(content).digest('hex') !== ref.digest) throw Error('Feature width integrity check failed');
      width = { ref, masters: decodeWidthMasters(parseWidthMasters(JSON.parse(content.toString()), dependency), basis) };
    }
    const decoded = decodeFeatureMasters(data, dependency, width);
    return { ref: { kind: 'feature-masters-v1', digest, fontId: data.base.fontId }, base: data.base, weightRange: data.weightRange,
      coverage: { crossbar: featureSupportedGlyphs(decoded, 'crossbar'), tail: featureSupportedGlyphs(decoded, 'tail'), terminalLength: featureSupportedGlyphs(decoded, 'terminalLength') } };
  });
  entries.sort((a, b) => a.ref.fontId.localeCompare(b.ref.fontId) || a.ref.digest.localeCompare(b.ref.digest));
  const manifest = resolve(output, 'manifest.json'), content = JSON.stringify(entries, null, 2) + '\n';
  if (check) {
    if (!existsSync(manifest) || readFileSync(manifest, 'utf8') !== content) throw Error('Feature manifest needs updating');
  } else writeFileSync(manifest, content);
  process.stdout.write(JSON.stringify({ revisions: entries.length, published, check }) + '\n');
}
