/* Pinned drawings and their authored dependencies share one atomic readiness cache. */
import { decodeFreeFont, type FreeFont } from '../engine/free';
import { parseSourceData } from './data';
import { decodeFeatureMasters, parseFeatureMasters } from './feature-masters';
import { parseSourceRef, type MasterSourceRef, type SourceRef } from './model';
import { decodeWeightMasters, parseWeightMasters, type WeightMasters } from './masters';
import { parseSourceProgram, type ProgramAssetRef, type SourceProgramData } from './program';
import { decodeWidthMasters, parseWidthMasters } from './width-masters';
import { decodeMasterSubdivision, parseMasterSubdivision, type MasterSubdivision } from './subdivision';

export interface RegisteredSourceProgram {
  data: SourceProgramData;
  masters: WeightMasters;
  width: ReturnType<typeof decodeWidthMasters> | null;
  features: ReturnType<typeof decodeFeatureMasters> | null;
  transitions: ReadonlyMap<string, MasterSubdivision>;
}
type RegisteredSource =
  | { kind: 'outline-v1'; font: FreeFont }
  | { kind: 'masters-v1'; font: FreeFont; masters: WeightMasters }
  | { kind: 'program-v1'; font: FreeFont; program: RegisteredSourceProgram }
  | { kind: 'width-masters-v1'; base: MasterSourceRef; masters: ReturnType<typeof decodeWidthMasters> }
  | { kind: 'feature-masters-v1'; base: MasterSourceRef; masters: ReturnType<typeof decodeFeatureMasters> }
  | { kind: 'master-subdivision-v1'; subdivision: MasterSubdivision };
const sources = new Map<string, RegisteredSource>();
const listeners = new Set<(digest: string) => void>();
const keyOf = (ref: SourceRef | ProgramAssetRef) => `${ref.kind}:${ref.digest}:${ref.fontId}`;

function masterBasis(input: unknown, fontId: string) {
  const ref = parseSourceRef(input);
  if (ref?.kind !== 'masters-v1' || ref.fontId !== fontId) throw new Error('Authored asset does not match its master font');
  const masters = sourceMasters(ref);
  if (!masters) throw new Error('Authored asset requires its exact weight masters first');
  return { ref, masters };
}

export function registerSource(ref: SourceRef | ProgramAssetRef, input: unknown): void {
  const key = keyOf(ref);
  let entry: RegisteredSource;
  switch (ref.kind) {
    case 'outline-v1': {
      const data = parseSourceData(input);
      if (data.id !== ref.fontId) throw new Error('Source font does not match the saved reference');
      if (sources.has(key)) return;
      entry = { kind: ref.kind, font: decodeFreeFont(data) };
      break;
    }
    case 'masters-v1': {
      const data = parseWeightMasters(input);
      if (data.source.fontId !== ref.fontId) throw new Error('Weight masters do not match the saved font');
      if (sources.has(key)) return;
      const masters = decodeWeightMasters(data), original = masters.masters.find(m => m.weight === masters.defaultWeight);
      if (!original) throw new Error('Weight masters lack their original drawing');
      entry = { kind: ref.kind, masters, font: original.font };
      break;
    }
    case 'width-masters-v1': {
      const basis = masterBasis(input && typeof input === 'object' && 'base' in input ? input.base : undefined, ref.fontId);
      const data = parseWidthMasters(input, basis);
      if (sources.has(key)) return;
      entry = { kind: ref.kind, base: data.base, masters: decodeWidthMasters(data, basis.masters) };
      break;
    }
    case 'feature-masters-v1': {
      const data = parseFeatureMasters(input), basis = masterBasis(data.base, ref.fontId);
      const compatibility = data.widthCompatibility;
      const width = compatibility === 'base-only' ? undefined : sources.get(keyOf(compatibility.width));
      if (compatibility !== 'base-only' && width?.kind !== 'width-masters-v1') throw new Error('Joint feature masters require their exact width package first');
      if (sources.has(key)) return;
      entry = { kind: ref.kind, base: data.base, masters: decodeFeatureMasters(data, basis,
        compatibility !== 'base-only' && width?.kind === 'width-masters-v1' ? { ref: compatibility.width, masters: width.masters } : undefined) };
      break;
    }
    case 'master-subdivision-v1': {
      const data = parseMasterSubdivision(input);
      const from = masterBasis(data.from, ref.fontId), to = masterBasis(data.to, ref.fontId);
      if (sources.has(key)) return;
      entry = { kind: ref.kind, subdivision: decodeMasterSubdivision(data, { from, to }) };
      break;
    }
    case 'program-v1': {
      const data = parseSourceProgram(input), basis = masterBasis(data.base, ref.fontId);
      const width = data.width ? sources.get(keyOf(data.width)) : undefined;
      const features = data.features ? sources.get(keyOf(data.features)) : undefined;
      if (data.width && (width?.kind !== 'width-masters-v1' || keyOf(width.base) !== keyOf(data.base))) {
        throw new Error('Source program requires width masters for its exact master base');
      }
      if (data.features && (features?.kind !== 'feature-masters-v1' || keyOf(features.base) !== keyOf(data.base))) {
        throw new Error('Source program requires feature masters for its exact master base');
      }
      const baseWeights = basis.masters.masters;
      if (features?.kind === 'feature-masters-v1' && (features.masters.data.weightRange[0] !== baseWeights[0].weight
        || features.masters.data.weightRange[1] !== baseWeights[baseWeights.length - 1].weight)) {
        throw new Error('Source program features must cover its complete base weight range');
      }
      if (width?.kind === 'width-masters-v1' && features?.kind === 'feature-masters-v1'
        && features.masters.data.widthCompatibility === 'base-only') {
        throw new Error('Authored width and base-only feature masters require a reviewed interaction');
      }
      if (features?.kind === 'feature-masters-v1' && features.masters.data.widthCompatibility !== 'base-only'
        && (!data.width || keyOf(features.masters.data.widthCompatibility.width) !== keyOf(data.width))) {
        throw new Error('Source program requires the exact reviewed feature width');
      }
      const transitions = new Map<string, MasterSubdivision>();
      for (const transition of data.transitions ?? []) {
        const asset = sources.get(keyOf(transition.mapping));
        if (asset?.kind !== 'master-subdivision-v1' || keyOf(asset.subdivision.data.from) !== keyOf(transition.from)
          || keyOf(asset.subdivision.data.to) !== keyOf(data.base)) throw new Error('Source program requires its exact basis transition');
        transitions.set(transition.from.digest, asset.subdivision);
      }
      if (sources.has(key)) return;
      const original = basis.masters.masters.find(m => m.weight === basis.masters.defaultWeight);
      if (!original) throw new Error('Source program lacks its original drawing');
      entry = { kind: ref.kind, font: original.font, program: { data, masters: basis.masters,
        width: width?.kind === 'width-masters-v1' ? width.masters : null,
        features: features?.kind === 'feature-masters-v1' ? features.masters : null, transitions } };
      break;
    }
    default: {
      const exhaustive: never = ref;
      throw new Error(`Unsupported source ${exhaustive}`);
    }
  }
  sources.set(key, entry);
  for (const listener of listeners) listener(ref.digest);
}

export const sourceReady = (ref: SourceRef | ProgramAssetRef): boolean => sources.has(keyOf(ref));
export function sourceProgram(ref: SourceRef): RegisteredSourceProgram | undefined {
  const source = sources.get(keyOf(ref));
  return source?.kind === 'program-v1' ? source.program : undefined;
}
export function sourceMasters(ref: SourceRef): WeightMasters | undefined {
  const source = sources.get(keyOf(ref));
  return source?.kind === 'masters-v1' ? source.masters : source?.kind === 'program-v1' ? source.program.masters : undefined;
}
export function sourceFont(ref: SourceRef): FreeFont | undefined {
  const source = sources.get(keyOf(ref));
  return source && 'font' in source ? source.font : undefined;
}
export function onSource(listener: (digest: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
