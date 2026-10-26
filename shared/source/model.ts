/* The immutable source and interpreter a design was made with. A missing source never selects another renderer. */
export interface OutlineSourceRef { readonly kind: 'outline-v1'; readonly digest: string; readonly fontId: string }
export interface MasterSourceRef { readonly kind: 'masters-v1'; readonly digest: string; readonly fontId: string }
export type SourceRef = OutlineSourceRef | MasterSourceRef;

export function parseSourceRef(input: unknown): SourceRef | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input) || !('kind' in input) || (input.kind !== 'outline-v1' && input.kind !== 'masters-v1')
    || !('digest' in input) || typeof input.digest !== 'string' || !/^[a-f0-9]{64}$/.test(input.digest)
    || !('fontId' in input) || typeof input.fontId !== 'string' || !/^[\w -]+:\d+i?$/.test(input.fontId)) {
    throw new TypeError('Invalid or unsupported source reference');
  }
  return { kind: input.kind, digest: input.digest, fontId: input.fontId };
}
