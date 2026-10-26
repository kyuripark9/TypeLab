/* A finishing effect can reject a drawing without discarding the editable design. */
export type SourceEffect = 'outline' | 'pattern';
export type SourceEffectFailure = 'normalization' | 'tolerance' | 'complexity' | 'precision';

export class SourceEffectError extends Error {
  constructor(readonly effect: SourceEffect, readonly reason: SourceEffectFailure, message: string) {
    super(message);
    this.name = 'SourceEffectError';
  }
}

export function sourceEffectMessage(error: SourceEffectError): string {
  const name = error.effect === 'outline' ? 'Outline' : 'This pattern';
  return error.reason === 'complexity'
    ? `${name} is too detailed for this drawing. Try a larger pattern size or use Solid fill.`
    : `${name} cannot preserve the small details in this drawing. Adjust the fill size or use Solid fill.`;
}
