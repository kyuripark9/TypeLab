/* A source program selects compatible authored assets without replacing its stable master basis. */
import { parseSourceRef, type MasterSourceRef } from './model';
import { parseSourceFinish, type SourceFinishPolicy } from './finish';

export interface WidthMasterRef { readonly kind: 'width-masters-v1'; readonly digest: string; readonly fontId: string }
export interface FeatureMasterRef { readonly kind: 'feature-masters-v1'; readonly digest: string; readonly fontId: string }
export type ProgramAssetRef = WidthMasterRef | FeatureMasterRef;
export interface SourceProgramData {
  format: 'source-program-v1';
  base: MasterSourceRef;
  width: WidthMasterRef | null;
  features: FeatureMasterRef | null;
  finish?: SourceFinishPolicy;
}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source program object');
  return Object.fromEntries(Object.entries(input));
}

function assetRef<K extends ProgramAssetRef['kind']>(input: unknown, kind: K, fontId: string): { kind: K; digest: string; fontId: string } | null {
  if (input === null) return null;
  const value = object(input);
  if (value.kind !== kind || typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest)
    || value.fontId !== fontId) throw new TypeError(`Invalid ${kind} reference for this source program`);
  return { kind, digest: value.digest, fontId };
}

/** Dependencies name the same family; their payloads must also be validated against the complete base reference. */
export function parseSourceProgram(input: unknown): SourceProgramData {
  const value = object(input), fields = ['format', 'base', 'width', 'features', 'finish'];
  if (value.format !== 'source-program-v1' || Object.keys(value).some(key => !fields.includes(key))) {
    throw new TypeError('Invalid or unsupported source program');
  }
  const base = parseSourceRef(value.base);
  if (base?.kind !== 'masters-v1') throw new TypeError('A source program requires an immutable weight-master base');
  return {
    format: 'source-program-v1', base,
    width: assetRef(value.width, 'width-masters-v1', base.fontId),
    features: assetRef(value.features, 'feature-masters-v1', base.fontId),
    ...('finish' in value ? { finish: parseSourceFinish(value.finish) } : {}),
  };
}

export function sourceProgramDependencies(program: SourceProgramData): [MasterSourceRef, ...ProgramAssetRef[]] {
  return [program.base, ...(program.width ? [program.width] : []), ...(program.features ? [program.features] : [])];
}
