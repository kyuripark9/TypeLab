/* A finishing effect can reject a drawing without discarding the editable design. */
export type SourceEffect = 'outline' | 'inline' | 'wire' | 'traps' | 'stencil' | 'pattern' | 'texture';
export type SourceEffectFailure = 'normalization' | 'tolerance' | 'complexity' | 'precision';

export class SourceEffectError extends Error {
  constructor(readonly effect: SourceEffect, readonly reason: SourceEffectFailure, message: string) {
    super(message);
    this.name = 'SourceEffectError';
  }
}

export function sourceEffectMessage(error: SourceEffectError): string {
  if (error.effect === 'texture') return error.reason === 'complexity'
    ? 'This texture is too detailed for the drawing. Reduce Hand-drawn or Rough edges, or turn them off.'
    : 'This texture cannot preserve the small details in the drawing. Reduce Hand-drawn or Rough edges, or turn them off.';
  const name = error.effect === 'outline' ? 'Outline' : error.effect === 'inline' ? 'Inline' : error.effect === 'wire' ? 'Wireframe' : error.effect === 'traps' ? 'Ink traps' : error.effect === 'stencil' ? 'Stencil' : 'This pattern';
  return error.reason === 'complexity'
    ? `${name} is too detailed for this drawing. Try a larger pattern size or use Solid fill.`
    : `${name} cannot preserve the small details in this drawing. Adjust the fill size or use Solid fill.`;
}
