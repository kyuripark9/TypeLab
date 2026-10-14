/* Exports built on worker threads (export-worker.ts), so building a family's fonts never holds the server up. An
   export comes in pieces (exportPieces in export.ts: a family's members, each a font; anything else whole), and the
   workers build the pieces side by side, taking turns between the exports in hand, so a single font asked for while a
   family builds starts at the next free worker rather than after the whole family. At most `size` workers build at
   once, one fewer than the machine has cores (up to MOST), keeping one for the server; at most `size + waiting`
   exports are in hand, and past that one is refused as busy. A worker that stops is replaced at the next piece, and the
   export it was building fails. */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { FreeFontData } from '../shared/engine';
import { exportPieces, joinPieces, type Built, type ExportJob, type ExportPiece, type PieceBuilt } from './export';

export type { Built };

/** The most workers a pool starts by itself: each holds its own copy of the fonts' rigged letters, a few hundred MB
    at its busiest. */
const MOST = 4;

/** An export in hand: its pieces, how many have been handed out and built, and what they built. */
interface Export {
  job: ExportJob; pieces: ExportPiece[]; fonts: FreeFontData[]; next: number; done: number; out: PieceBuilt[];
  resolve: (b: Built) => void; reject: (e: Error) => void; failed?: boolean;
}

/** Thrown by `run` when as many exports are in hand as the pool takes. */
export class Busy extends Error {}

export class ExportPool {
  private live = new Set<Worker>();
  private idle: Worker[] = [];
  private busy = new Map<Worker, { exp: Export; k: number }>();
  /** the free fonts each worker has been sent (it registers each once) */
  private sent = new Map<Worker, Set<string>>();
  private exports: Export[] = [];
  private turn = 0;
  constructor(private size = Math.max(1, Math.min(MOST, availableParallelism() - 1)), private waiting = 8) {}

  /** Build `job` from `fonts`, every free font it and its family's members draw from. */
  run(job: ExportJob, fonts: FreeFontData[]): Promise<Built> {
    if (this.exports.length >= this.size + this.waiting) return Promise.reject(new Busy('Too many exports are waiting'));
    return new Promise((resolve, reject) => {
      this.exports.push({ job, pieces: exportPieces(job), fonts, next: 0, done: 0, out: [], resolve, reject });
      this.pump();
    });
  }

  /** Stop every worker (the server shutting down). */
  close() { for (const w of this.live) void w.terminate(); }

  /** The next export with a piece left to hand out, the exports taking turns. */
  private pick(): Export | null {
    for (let k = 0; k < this.exports.length; k++) {
      const i = (this.turn + k) % this.exports.length, exp = this.exports[i];
      if (exp.next < exp.pieces.length) { this.turn = i + 1; return exp; }
    }
    return null;
  }

  private pump() {
    for (;;) {
      if (!this.idle.length && this.live.size >= this.size) return;
      const exp = this.pick();
      if (!exp) return;
      const w = this.idle.pop() ?? this.spawn(), k = exp.next++;
      this.busy.set(w, { exp, k });
      // (only the fonts this worker hasn't been sent yet go with the piece)
      const had = this.sent.get(w) ?? new Set<string>(), fonts = exp.fonts.filter(f => !had.has(f.id));
      for (const f of fonts) had.add(f.id);
      this.sent.set(w, had);
      // (a worker holds the process open only while it builds)
      w.ref();
      w.postMessage({ piece: exp.pieces[k], fonts });
    }
  }

  /** An export done with: out of hand, and answered. */
  private finish(exp: Export, e?: Error) {
    if (exp.failed) return;
    this.exports = this.exports.filter(x => x !== exp);
    if (e) { exp.failed = true; exp.reject(e); return; }
    try { exp.resolve(joinPieces(exp.job, exp.out)); } catch (err) { exp.reject(err as Error); }
  }

  private spawn(): Worker {
    // (a .ts worker: it is started with the server's own flags, tsx's loader among them)
    const w = new Worker(new URL('./export-worker.ts', import.meta.url));
    this.live.add(w);
    w.unref();
    w.on('message', (m: { out?: PieceBuilt; error?: string }) => {
      const t = this.busy.get(w);
      this.busy.delete(w);
      w.unref();
      this.idle.push(w);
      if (t && !t.exp.failed) {
        if (m.error || !m.out) this.finish(t.exp, new Error(m.error ?? 'The export worker built nothing'));
        else {
          t.exp.out[t.k] = asBuffers(m.out);
          if (++t.exp.done === t.exp.pieces.length) this.finish(t.exp);
        }
      }
      this.pump();
    });
    // a worker that throws or stops takes its piece's export with it; the next piece starts a new worker
    const lost = (e: Error) => {
      if (!this.live.delete(w)) return;
      this.sent.delete(w);
      this.idle = this.idle.filter(x => x !== w);
      const t = this.busy.get(w);
      this.busy.delete(w);
      if (t) this.finish(t.exp, e);
      this.pump();
    };
    w.on('error', lost);
    w.on('exit', code => lost(new Error(`The export worker stopped (${code})`)));
    return w;
  }
}

/** A piece as it comes from a worker (its bytes cloned as plain Uint8Arrays), with Buffers again. */
function asBuffers(p: PieceBuilt): PieceBuilt {
  const buf = (d: Uint8Array) => Buffer.from(d.buffer, d.byteOffset, d.byteLength);
  return 'built' in p ? { built: { ...p.built, data: buf(p.built.data) } } : { ...p, files: p.files.map(f => ({ ...f, packed: buf(f.packed) })) };
}
