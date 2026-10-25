/* Exact source revisions loaded by digest. A failed request remains visible until the user retries it. */
import { useSyncExternalStore } from 'react';
import type { SourceRef } from '../../shared/source/model';
import { onSource, registerSource, sourceFont } from '../../shared/source/registry';
import { api, errorMessage } from './api';

const loading = new Map<string, Promise<boolean>>();
const errors = new Map<string, string>();
const keyOf = (ref: SourceRef) => `${ref.kind}:${ref.fontId}:${ref.digest}`;
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; for (const listener of listeners) listener(); };
onSource(changed);

export function loadSource(ref: SourceRef): Promise<boolean> {
  if (sourceFont(ref)) return Promise.resolve(true);
  const key = keyOf(ref);
  let request = loading.get(key);
  if (!request) {
    request = api.source(ref.digest)
      .then(data => { registerSource(ref, data); return true; })
      .catch(error => { errors.set(key, errorMessage(error)); changed(); return false; });
    loading.set(key, request);
  }
  return request;
}

export function retrySource(ref: SourceRef) {
  loading.delete(keyOf(ref));
  errors.delete(keyOf(ref));
  changed();
  return loadSource(ref);
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** Refresh previews outside the active document too, such as trait samples. */
export const useSources = () => useSyncExternalStore(subscribe, () => version);
export const sourceError = (ref: SourceRef) => errors.get(keyOf(ref));
