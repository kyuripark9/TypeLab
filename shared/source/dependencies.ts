/* Saved Points frames can retain an earlier source program than the design now uses. */
import type { Params } from '../params';
import { parseSourceRef, type SourceRef } from './model';
import { masterBasisForEditing } from './master-catalog';
import { originMapFor } from './origin-catalog';
import type { OutlineMasterMapRef, ProgramAssetRef } from './program';
import { basisTransition } from './program-catalog';

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

/** Only a saved original-sheet drawing needs its correspondence to the first masters. */
export function designOriginRefs(p: Pick<Params, 'sourceProgram' | 'outlines'>): OutlineMasterMapRef[] {
  if (!p.sourceProgram || p.sourceProgram.kind === 'outline-v1') return [];
  return designSourceRefs(p).flatMap(ref => {
    if (ref.kind !== 'outline-v1' || ref.fontId !== p.sourceProgram?.fontId) return [];
    const first = masterBasisForEditing(ref), mapping = first && originMapFor(ref, first);
    return mapping ? [mapping.ref] : [];
  });
}

export function designSourceDependencies(p: Pick<Params, 'sourceProgram' | 'outlines'>): (SourceRef | ProgramAssetRef)[] {
  const sources = designSourceRefs(p), current = p.sourceProgram;
  const transitions = current ? sources.flatMap(ref => {
    const from = masterBasisForEditing(ref), mapping = from && basisTransition(from, current);
    return mapping ? [mapping] : [];
  }) : [];
  return [...new Map([...sources, ...designOriginRefs(p), ...transitions].map(ref => [`${ref.kind}:${ref.digest}:${ref.fontId}`, ref])).values()];
}
