/* Builds pieces of exports away from the server's main thread (export-pool.ts): a font file, a specimen, or one member
   of a family as a file of its .zip (buildPiece in export.ts). Drawing a family's fonts takes a while, and on the main
   thread every other request would wait for them. The worker loads the sources a piece's design draws from itself. */
import { parentPort } from 'node:worker_threads';
import type { Params } from '../shared/params';
import { SourceEffectError } from '../shared/source/effect-error';
import { buildPiece, type ExportPiece } from './export';
import type { ExportWorkerReply } from './export-protocol';
import { loadDesignSources } from './sources';

/** The design the last piece was of: a piece of the same design is given the very same params object, as what is kept
    of a design is kept by its params object (a family's hairlines read off its letters, shared/family.ts), and each
    piece comes as a copy of its own. */
let last: { json: string; params: Params } | null = null;

parentPort!.on('message', ({ piece }: { piece: ExportPiece }) => {
  try {
    loadDesignSources(piece.job.params);
    const json = JSON.stringify(piece.job.params);
    if (last?.json === json) piece.job.params = last.params;
    else last = { json, params: piece.job.params };
    parentPort!.postMessage({ kind: 'built', out: buildPiece(piece) } satisfies ExportWorkerReply);
  } catch (e) {
    const reply: ExportWorkerReply = e instanceof SourceEffectError
      ? { kind: 'effect-error', effect: e.effect, reason: e.reason, message: e.message }
      : { kind: 'error', message: e instanceof Error ? e.stack ?? e.message : String(e) };
    parentPort!.postMessage(reply);
  }
});
