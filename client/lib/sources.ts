/* Exact source revisions loaded by digest. A failed request remains visible until the user retries it. */
import { useSyncExternalStore } from 'react';
import type { Params } from '../../shared/params';
import { designSourceDependencies } from '../../shared/source/dependencies';
import { parseSourceRef, type MasterSourceRef, type SourceRef } from '../../shared/source/model';
import { parseSourceProgram, sourceProgramDependencies, type ProgramAssetRef } from '../../shared/source/program';
import { onSource, registerSource, sourceReady } from '../../shared/source/registry';
import { originMapInfo } from '../../shared/source/origin-catalog';
import { parseOutlineMasterMap } from '../../shared/source/outline-master-map';
import { parseMasterSubdivision } from '../../shared/source/subdivision';
import { subdivisionInfo } from '../../shared/source/program-catalog';
import { parseSourceComponents } from '../../shared/source/components';
import { api, errorMessage } from './api';

type DependencyRef = SourceRef | ProgramAssetRef;
const loading = new Map<string, Promise<boolean>>();
const errors = new Map<string, string>();
const dependencies = new Map<string, DependencyRef[]>();
const keyOf = (ref: DependencyRef) => `${ref.kind}:${ref.fontId}:${ref.digest}`;
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; for (const listener of listeners) listener(); };
onSource(changed);

function dependencyError(ref: DependencyRef): Error {
  const label = ref.kind === 'width-masters-v1' ? 'width masters' : ref.kind === 'feature-masters-v1' ? 'feature masters'
    : ref.kind === 'source-components-v1' ? 'letter components' : ref.kind === 'glyph-form-masters-v1' ? 'letter form'
    : ref.kind === 'master-subdivision-v1' ? 'basis transition' : ref.kind === 'outline-master-map-v1' ? 'original drawing correspondence'
    : ref.kind === 'outline-v1' ? 'original drawing' : 'weight masters';
  return new Error(`Could not load ${label}: ${errors.get(keyOf(ref)) ?? 'the source is unavailable'}`);
}
function loadDependency(ref: DependencyRef, expectedBase?: MasterSourceRef, expectedFrom?: MasterSourceRef): Promise<boolean> {
  if (sourceReady(ref)) return Promise.resolve(true);
  const key = keyOf(ref);
  let request = loading.get(key);
  if (!request) {
    request = api.source(ref.digest)
      .then(async data => {
        if (expectedBase) {
          const base = parseSourceRef(data && typeof data === 'object'
            ? ref.kind === 'master-subdivision-v1' && 'to' in data ? data.to : 'base' in data ? data.base : undefined : undefined);
          if (!base || keyOf(base) !== keyOf(expectedBase)) throw new Error('Authored asset does not match this program\'s exact master base');
        }
        if (expectedFrom) {
          const from = parseSourceRef(data && typeof data === 'object' && 'from' in data ? data.from : undefined);
          if (!from || keyOf(from) !== keyOf(expectedFrom)) throw new Error('Basis transition does not match the previous master base');
        }
        if (ref.kind === 'master-subdivision-v1') {
          const mapping = parseMasterSubdivision(data), expected = subdivisionInfo(ref);
          if (expected && (keyOf(mapping.from) !== keyOf(expected.from) || keyOf(mapping.to) !== keyOf(expected.to))) {
            throw new Error('Basis transition does not match its exact catalog pair');
          }
          dependencies.set(key, [mapping.from, mapping.to]);
          await Promise.all([mapping.from, mapping.to].map(async basis => {
            if (!await loadDependency(basis)) throw dependencyError(basis);
          }));
          registerSource(ref, mapping);
        } else if (ref.kind === 'outline-master-map-v1') {
          const mapping = parseOutlineMasterMap(data), expected = originMapInfo(ref);
          if (!expected || keyOf(mapping.from) !== keyOf(expected.from) || keyOf(mapping.to) !== keyOf(expected.to)) {
            throw new Error('Original drawing correspondence does not match its exact catalog pair');
          }
          dependencies.set(key, [mapping.from, mapping.to]);
          await Promise.all([mapping.from, mapping.to].map(async basis => {
            if (!await loadDependency(basis)) throw dependencyError(basis);
          }));
          registerSource(ref, mapping);
        } else if (ref.kind === 'source-components-v1') {
          const components = parseSourceComponents(data);
          dependencies.set(key, [components.base, ...(components.width ? [components.width] : [])]);
          if (!await loadDependency(components.base)) throw dependencyError(components.base);
          if (components.width && !await loadDependency(components.width, components.base)) throw dependencyError(components.width);
          registerSource(ref, components);
        } else if (ref.kind === 'glyph-form-masters-v1') {
          // a letter form needs its exact weight and width packages registered first
          const value = data && typeof data === 'object' ? data as Record<string, unknown> : {};
          const base = parseSourceRef(value.base), width = value.width && typeof value.width === 'object' ? value.width as Record<string, unknown> : {};
          if (base?.kind !== 'masters-v1' || base.fontId !== ref.fontId || width.kind !== 'width-masters-v1' || typeof width.digest !== 'string' || width.fontId !== ref.fontId) {
            throw new Error('Letter form does not name its exact bases');
          }
          const widthRef = { kind: 'width-masters-v1' as const, digest: width.digest, fontId: ref.fontId };
          dependencies.set(key, [base, widthRef]);
          if (!await loadDependency(base)) throw dependencyError(base);
          if (!await loadDependency(widthRef, base)) throw dependencyError(widthRef);
          registerSource(ref, data);
        } else if (ref.kind === 'program-v1') {
          const program = parseSourceProgram(data);
          if (program.base.fontId !== ref.fontId) throw new Error('Source program does not match the saved font');
          dependencies.set(key, sourceProgramDependencies(program));
          await Promise.all([program.base, ...(program.transitions ?? []).map(t => t.from)].map(async base => {
            if (!await loadDependency(base)) throw dependencyError(base);
          }));
          if (program.width && !await loadDependency(program.width, program.base)) throw dependencyError(program.width);
          await Promise.all([
            ...(program.components ? [loadDependency(program.components, program.base).then(ok => {
              if (!ok && program.components) throw dependencyError(program.components);
            })] : []),
            ...(program.features ? [loadDependency(program.features, program.base).then(ok => {
              if (!ok && program.features) throw dependencyError(program.features);
            })] : []),
            ...(program.transitions ?? []).map(async transition => {
              if (!await loadDependency(transition.mapping, program.base, transition.from)) throw dependencyError(transition.mapping);
            }),
          ]);
          registerSource(ref, program);
        } else registerSource(ref, data);
        return true;
      })
      .catch(error => { errors.set(key, errorMessage(error)); changed(); return false; });
    loading.set(key, request);
  }
  return request;
}
export const loadSource = (ref: DependencyRef): Promise<boolean> => loadDependency(ref);

export async function loadDesignSources(p: Pick<Params, 'sourceProgram' | 'outlines'> & Partial<Pick<Params, 'sourceForms' | 'sourceFormEdits'>>): Promise<boolean> {
  return (await Promise.all(designSourceDependencies(p).map(loadSource))).every(Boolean);
}

export function retrySource(ref: DependencyRef): Promise<boolean> {
  const visited = new Set<string>();
  function clearFailed(key: string) {
    if (visited.has(key)) return;
    visited.add(key);
    for (const child of dependencies.get(key) ?? []) clearFailed(keyOf(child));
    if (!errors.has(key)) return;
    loading.delete(key); errors.delete(key);
    // A missing sheet can also fail its correspondence request; one retry must release both requests.
    for (const [parent, children] of dependencies) {
      if (errors.has(parent) && children.some(child => keyOf(child) === key)) clearFailed(parent);
    }
  }
  clearFailed(keyOf(ref));
  changed();
  return loadSource(ref);
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** Refresh previews outside the active document too, such as trait samples. */
export const useSources = () => useSyncExternalStore(subscribe, () => version);
export const sourceError = (ref: DependencyRef) => errors.get(keyOf(ref));
