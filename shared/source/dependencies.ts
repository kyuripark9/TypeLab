/* Saved Points frames can retain an earlier source program than the design now uses. */
import type { Params } from '../params';
import { parseSourceRef, type SourceRef } from './model';

export function designSourceRefs(p: Pick<Params, 'sourceProgram' | 'outlines'>): SourceRef[] {
  if (!p.sourceProgram) return [];
  const refs = new Map<string, SourceRef>();
  const add = (ref: SourceRef) => refs.set(`${ref.kind}:${ref.digest}:${ref.fontId}`, ref);
  add(p.sourceProgram);
  for (const drawing of Object.values(p.outlines)) {
    const ref = parseSourceRef(drawing.at?.sourceProgram);
    if (ref) add(ref);
  }
  return [...refs.values()];
}
