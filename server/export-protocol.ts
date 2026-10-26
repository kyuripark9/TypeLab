/* Worker replies preserve expected drawing failures separately from server faults. */
import type { SourceEffect, SourceEffectFailure } from '../shared/source/effect-error';
import type { PieceBuilt } from './export';

export type ExportWorkerReply =
  | { kind: 'built'; out: PieceBuilt }
  | { kind: 'effect-error'; effect: SourceEffect; reason: SourceEffectFailure; message: string }
  | { kind: 'error'; message: string };
