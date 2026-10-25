/* Pinned sources have their own cache, separate from the legacy font-name cache. */
import { decodeFreeFont, type FreeFont } from '../engine/free';
import { parseSourceData } from './data';
import type { SourceRef } from './model';

const sources = new Map<string, FreeFont>();
const listeners = new Set<(digest: string) => void>();

export function registerSource(ref: SourceRef, input: unknown): void {
  const data = parseSourceData(input);
  if (data.id !== ref.fontId) throw new Error('Source font does not match the saved reference');
  if (sources.has(ref.digest)) return;
  sources.set(ref.digest, decodeFreeFont(data));
  for (const listener of listeners) listener(ref.digest);
}

export function sourceFont(ref: SourceRef): FreeFont | undefined {
  const font = sources.get(ref.digest);
  return font?.id === ref.fontId ? font : undefined;
}

export function onSource(listener: (digest: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
