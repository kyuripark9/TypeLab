/* A source program pins compatible authored assets and exact maps from any earlier point bases. */
import { parseSourceRef, type MasterSourceRef } from './model';
import { parseSourceFinish, type SourceFinishPolicy } from './finish';
import { parseSourceSpacing, type SourceSpacingPolicy } from './spacing';

export interface WidthMasterRef { readonly kind: 'width-masters-v1'; readonly digest: string; readonly fontId: string }
export interface FeatureMasterRef { readonly kind: 'feature-masters-v1'; readonly digest: string; readonly fontId: string }
export interface SubdivisionRef { readonly kind: 'master-subdivision-v1'; readonly digest: string; readonly fontId: string }
export interface OutlineMasterMapRef { readonly kind: 'outline-master-map-v1'; readonly digest: string; readonly fontId: string }
export interface SourceComponentRef { readonly kind: 'source-components-v1'; readonly digest: string; readonly fontId: string }
export type ProgramAssetRef = WidthMasterRef | FeatureMasterRef | SubdivisionRef | OutlineMasterMapRef | SourceComponentRef;
export interface BasisTransition { from: MasterSourceRef; mapping: SubdivisionRef }
export interface SourceProgramData {
  format: 'source-program-v1';
  base: MasterSourceRef;
  width: WidthMasterRef | null;
  features: FeatureMasterRef | null;
  components?: SourceComponentRef;
  finish?: SourceFinishPolicy;
  spacing?: SourceSpacingPolicy;
  transitions?: BasisTransition[];
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
  const value = object(input), fields = ['format', 'base', 'width', 'features', 'components', 'finish', 'spacing', 'transitions'];
  if (value.format !== 'source-program-v1' || Object.keys(value).some(key => !fields.includes(key))) {
    throw new TypeError('Invalid or unsupported source program');
  }
  const base = parseSourceRef(value.base);
  if (base?.kind !== 'masters-v1') throw new TypeError('A source program requires an immutable weight-master base');
  const components = 'components' in value ? assetRef(value.components, 'source-components-v1', base.fontId) : undefined;
  if (components === null) throw new TypeError('A source component reference must be present or omitted');
  return {
    format: 'source-program-v1', base,
    width: assetRef(value.width, 'width-masters-v1', base.fontId),
    features: assetRef(value.features, 'feature-masters-v1', base.fontId),
    ...(components ? { components } : {}),
    ...('finish' in value ? { finish: parseSourceFinish(value.finish) } : {}),
    ...('spacing' in value ? { spacing: parseSourceSpacing(value.spacing) } : {}),
    ...('transitions' in value ? { transitions: transitions(value.transitions, base) } : {}),
  };
}

function transitions(input: unknown, base: MasterSourceRef): BasisTransition[] {
  if (!Array.isArray(input) || !input.length) throw new TypeError('A source program transition list must be nonempty');
  const seen = new Set<string>();
  return input.map(entry => {
    const value = object(entry), from = parseSourceRef(value.from);
    const mapping = assetRef(value.mapping, 'master-subdivision-v1', base.fontId);
    if (Object.keys(value).some(key => key !== 'from' && key !== 'mapping') || !mapping
      || from?.kind !== 'masters-v1' || from.fontId !== base.fontId || from.digest === base.digest || seen.has(from.digest)) {
      throw new TypeError('Invalid source program basis transition');
    }
    seen.add(from.digest);
    return { from, mapping };
  });
}

export function sourceProgramDependencies(program: SourceProgramData): [MasterSourceRef, ...(MasterSourceRef | ProgramAssetRef)[]] {
  return [program.base, ...(program.transitions ?? []).flatMap(t => [t.from, t.mapping]),
    ...(program.width ? [program.width] : []), ...(program.features ? [program.features] : []), ...(program.components ? [program.components] : [])];
}
