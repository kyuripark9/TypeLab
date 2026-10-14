/* Builds pieces of exports away from the server's main thread (export-pool.ts): a font file, a specimen, or one member
   of a family as a file of its .zip (buildPiece in export.ts). Moving a free font's letters to another weight of a
   family takes up to a second or two a font, and on the main thread every other request would wait for them. A piece
   brings the free fonts this worker hasn't been sent yet, registered here once; the letters rigged from them are
   kept from piece to piece. */
import { parentPort } from 'node:worker_threads';
import { freeFont, registerFreeFont, type FreeFontData } from '../shared/engine';
import type { Params } from '../shared/params';
import { buildPiece, type ExportPiece } from './export';

/** The design the last piece was of: a piece of the same design is given the very same params object, as what is kept
    of a design is kept by its params object (a family's hairlines read off its letters, shared/family.ts), and each
    piece comes as a copy of its own. */
let last: { json: string; params: Params } | null = null;

parentPort!.on('message', ({ piece, fonts }: { piece: ExportPiece; fonts: FreeFontData[] }) => {
  try {
    for (const f of fonts) if (!freeFont(f.id)) registerFreeFont(f);
    const json = JSON.stringify(piece.job.params);
    if (last?.json === json) piece.job.params = last.params;
    else last = { json, params: piece.job.params };
    parentPort!.postMessage({ out: buildPiece(piece) });
  } catch (e) {
    parentPort!.postMessage({ error: e instanceof Error ? e.stack ?? e.message : String(e) });
  }
});
