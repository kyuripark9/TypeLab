/* Pinned sources have their own cache, separate from the legacy font-name cache. */
import { decodeFreeFont, type FreeFont } from '../engine/free';
import { parseSourceData } from './data';
import type { SourceRef } from './model';
import { decodeWeightMasters, parseWeightMasters, type WeightMasters } from './masters';

const sources = new Map<string, FreeFont>();
const variations = new Map<string, WeightMasters>();
const listeners = new Set<(digest: string) => void>();
const keyOf = (ref: SourceRef) => `${ref.kind}:${ref.digest}:${ref.fontId}`;

export function registerSource(ref: SourceRef, input: unknown): void {
  const key = keyOf(ref);
  if (ref.kind === 'masters-v1') {
    const data = parseWeightMasters(input);
    if (data.source.fontId !== ref.fontId) throw new Error('Weight masters do not match the saved font');
    if (sources.has(key)) return;
    const program = decodeWeightMasters(data), original = program.masters.find(m => m.weight === program.defaultWeight);
    if (!original) throw new Error('Weight masters lack their original drawing');
    variations.set(key, program);
    sources.set(key, original.font);
    for (const listener of listeners) listener(ref.digest);
    return;
  }
  const data = parseSourceData(input);
  if (data.id !== ref.fontId) throw new Error('Source font does not match the saved reference');
  if (sources.has(key)) return;
  sources.set(key, decodeFreeFont(data));
  for (const listener of listeners) listener(ref.digest);
}

export const sourceMasters = (ref: SourceRef): WeightMasters | undefined => variations.get(keyOf(ref));

export function sourceFont(ref: SourceRef): FreeFont | undefined {
  const font = sources.get(keyOf(ref));
  return font?.id === ref.fontId ? font : undefined;
}

export function onSource(listener: (digest: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
