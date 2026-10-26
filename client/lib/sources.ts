/* Exact source revisions loaded by digest. A failed request remains visible until the user retries it. */
import { useSyncExternalStore } from 'react';
import type { Params } from '../../shared/params';
import { designSourceRefs } from '../../shared/source/dependencies';
import { parseSourceRef, type MasterSourceRef, type SourceRef } from '../../shared/source/model';
import { parseSourceProgram, sourceProgramDependencies, type ProgramAssetRef } from '../../shared/source/program';
import { onSource, registerSource, sourceReady } from '../../shared/source/registry';
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
  const label = ref.kind === 'width-masters-v1' ? 'width masters' : ref.kind === 'feature-masters-v1' ? 'feature masters' : 'weight masters';
  return new Error(`Could not load ${label}: ${errors.get(keyOf(ref)) ?? 'the source is unavailable'}`);
}
function loadDependency(ref: DependencyRef, expectedBase?: MasterSourceRef): Promise<boolean> {
  if (sourceReady(ref)) return Promise.resolve(true);
  const key = keyOf(ref);
  let request = loading.get(key);
  if (!request) {
    request = api.source(ref.digest)
      .then(async data => {
        if (expectedBase) {
          const base = parseSourceRef(data && typeof data === 'object' && 'base' in data ? data.base : undefined);
          if (!base || keyOf(base) !== keyOf(expectedBase)) throw new Error('Authored asset does not match this program\'s exact master base');
        }
        if (ref.kind === 'program-v1') {
          const program = parseSourceProgram(data);
          if (program.base.fontId !== ref.fontId) throw new Error('Source program does not match the saved font');
          const [base, ...assets] = sourceProgramDependencies(program);
          dependencies.set(key, [base, ...assets]);
          if (!await loadDependency(base)) throw dependencyError(base);
          await Promise.all(assets.map(async asset => {
            if (!await loadDependency(asset, base)) throw dependencyError(asset);
          }));
          registerSource(ref, program);
        } else registerSource(ref, data);
        return true;
      })
      .catch(error => { errors.set(key, errorMessage(error)); changed(); return false; });
    loading.set(key, request);
  }
  return request;
}
export const loadSource = (ref: SourceRef): Promise<boolean> => loadDependency(ref);

export async function loadDesignSources(p: Pick<Params, 'sourceProgram' | 'outlines'>): Promise<boolean> {
  return (await Promise.all(designSourceRefs(p).map(loadSource))).every(Boolean);
}

export function retrySource(ref: SourceRef): Promise<boolean> {
  function clearFailed(dependency: DependencyRef) {
    const key = keyOf(dependency);
    for (const child of dependencies.get(key) ?? []) clearFailed(child);
    if (errors.has(key)) { loading.delete(key); errors.delete(key); }
  }
  clearFailed(ref);
  changed();
  return loadSource(ref);
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** Refresh previews outside the active document too, such as trait samples. */
export const useSources = () => useSyncExternalStore(subscribe, () => version);
export const sourceError = (ref: SourceRef) => errors.get(keyOf(ref));
