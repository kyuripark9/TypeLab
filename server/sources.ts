/* Read immutable source packages by digest for both the browser and export workers. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SOURCE_REVISIONS } from '../shared/source/catalog';
import type { Params } from '../shared/params';
import { designSourceRefs } from '../shared/source/dependencies';
import { parseSourceData } from '../shared/source/data';
import { parseFeatureMasters, type FeatureMasterData } from '../shared/source/feature-masters';
import { registerSource, sourceMasters } from '../shared/source/registry';
import type { MasterSourceRef, SourceRef } from '../shared/source/model';
import type { FreeFontData } from '../shared/engine/free';
import { ownLicense } from '../shared/free-fonts';
import { masterInfo } from '../shared/source/master-catalog';
import { parseWeightMasters, type WeightMasterData } from '../shared/source/masters';
import { parseSourceProgram, type ProgramAssetRef, type SourceProgramData } from '../shared/source/program';
import { PROGRAM_REVISIONS, programInfo } from '../shared/source/program-catalog';
import { parseWidthMasters, type WidthMasterData } from '../shared/source/width-masters';
import { parseMasterSubdivision, type MasterSubdivisionData } from '../shared/source/subdivision';

type Payload = FreeFontData | WeightMasterData | SourceProgramData | WidthMasterData | FeatureMasterData | MasterSubdivisionData;
const cached = new Map<string, FreeFontData>();
const packages = new Map<string, Payload>();
const keyOf = (ref: SourceRef | ProgramAssetRef) => `${ref.kind}:${ref.digest}:${ref.fontId}`;
const sameRef = (a: SourceRef | ProgramAssetRef | null, b: SourceRef | ProgramAssetRef | null) => a === null || b === null ? a === b : keyOf(a) === keyOf(b);

function assetBase(ref: ProgramAssetRef): MasterSourceRef | undefined {
  let base: MasterSourceRef | undefined;
  for (const program of PROGRAM_REVISIONS) {
    if (!sameRef(ref, program.data.width) && !sameRef(ref, program.data.features)
      && !program.data.transitions?.some(t => sameRef(t.mapping, ref))) continue;
    if (base && !sameRef(base, program.data.base)) throw new Error('An authored asset has conflicting catalog bases');
    base = program.data.base;
  }
  return base;
}
function readPayload(ref: SourceRef | ProgramAssetRef, directory: string): unknown {
  const bytes = readFileSync(new URL(`../fonts/${directory}/${ref.digest}.json`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== ref.digest) throw new Error('Source integrity check failed');
  return JSON.parse(bytes.toString());
}

export function sourcePayload(ref: SourceRef | ProgramAssetRef): Payload {
  const program = ref.kind === 'program-v1' ? programInfo(ref) : undefined;
  const base = ref.kind === 'width-masters-v1' || ref.kind === 'feature-masters-v1' || ref.kind === 'master-subdivision-v1' ? assetBase(ref) : undefined;
  const known = ref.kind === 'outline-v1' ? SOURCE_REVISIONS.some(r => sameRef(r, ref))
    : ref.kind === 'masters-v1' ? !!masterInfo(ref) : ref.kind === 'program-v1' ? !!program : !!base;
  if (!known) throw new Error('This saved source is unavailable');
  const key = keyOf(ref), kept = packages.get(key);
  if (kept) return kept;
  let data: Payload;
  switch (ref.kind) {
    case 'outline-v1': {
      const original = parseSourceData(readPayload(ref, 'sources')), license = ownLicense();
      data = { ...original, copyright: license.copyright, license: license.license, licenseUrl: license.licenseUrl,
        licenseText: `${license.lines.join('\n')}\n\n${readFileSync(new URL('../fonts/OFL.txt', import.meta.url), 'utf8').trim()}` };
      if (data.id !== ref.fontId) throw new Error('Source reference does not match its font');
      registerSource(ref, data);
      cached.set(key, data);
      break;
    }
    case 'masters-v1': {
      data = parseWeightMasters(readPayload(ref, 'masters'));
      if (data.source.fontId !== ref.fontId) throw new Error('Weight masters do not match their font');
      const weight = data.defaultWeight, original = data.masters.find(m => m.weight === weight);
      if (!original) throw new Error('Weight masters lack their original weight');
      registerSource(ref, data);
      cached.set(key, original.data);
      break;
    }
    case 'program-v1': {
      data = parseSourceProgram(readPayload(ref, 'programs'));
      if (!program || !sameRef(data.base, program.data.base) || !sameRef(data.width, program.data.width)
        || !sameRef(data.features, program.data.features)
        || JSON.stringify(data.transitions) !== JSON.stringify(program.data.transitions)
        || JSON.stringify(data.finish) !== JSON.stringify(program.data.finish)) throw new Error('Source program does not match its catalog');
      const original = loadSource(data.base);
      if (data.width) sourcePayload(data.width);
      if (data.features) sourcePayload(data.features);
      for (const transition of data.transitions ?? []) sourcePayload(transition.mapping);
      registerSource(ref, data);
      cached.set(key, original);
      break;
    }
    case 'width-masters-v1': {
      if (!base) throw new Error('Width masters are missing their catalog base');
      loadSource(base);
      const masters = sourceMasters(base);
      if (!masters) throw new Error('Width masters require their weight package');
      data = parseWidthMasters(readPayload(ref, 'widths'), { ref: base, masters });
      registerSource(ref, data);
      break;
    }
    case 'feature-masters-v1': {
      if (!base) throw new Error('Feature masters are missing their catalog base');
      loadSource(base);
      data = parseFeatureMasters(readPayload(ref, 'features'));
      if (!sameRef(data.base, base)) throw new Error('Feature masters do not match their catalog base');
      if (data.widthCompatibility !== 'base-only') sourcePayload(data.widthCompatibility.width);
      registerSource(ref, data);
      break;
    }
    case 'master-subdivision-v1': {
      if (!base) throw new Error('Basis transition is missing its catalog base');
      const subdivision = parseMasterSubdivision(readPayload(ref, 'subdivisions'));
      data = subdivision;
      const previous = PROGRAM_REVISIONS.flatMap(p => p.data.transitions ?? []).filter(t => sameRef(t.mapping, ref));
      if (!sameRef(subdivision.to, base) || previous.some(t => !sameRef(subdivision.from, t.from))) throw new Error('Basis transition does not match its catalog bases');
      loadSource(subdivision.from); loadSource(subdivision.to);
      registerSource(ref, data);
      break;
    }
    default: {
      const exhaustive: never = ref;
      throw new Error(`Unsupported source ${exhaustive}`);
    }
  }
  packages.set(key, data);
  return data;
}

/** Workers receive the original font while evaluation reads the complete registered program. */
export function loadSource(ref: SourceRef): FreeFontData {
  sourcePayload(ref);
  const font = cached.get(keyOf(ref));
  if (!font) throw new Error('Source program did not provide its original drawing');
  return font;
}

export function loadDesignSources(p: Pick<Params, 'sourceProgram' | 'outlines'>): void {
  for (const ref of designSourceRefs(p)) loadSource(ref);
}
