/* Component-local soft fields. Source clipping is owned by patterns.ts. */
import { contours, smoothLoop } from '../engine/effects';
import type { Cmd, Pt } from '../engine/types';
import { SourceEffectError } from './effect-error';

export type OrganicPatternKind = 'blobs' | 'liquid';
interface OrganicPatternDomain {
  bounds: { x0: number; x1: number; y0: number; y1: number };
  origin: Pt;
  cell: number;
  gain: number;
}
interface PatternBudget {
  addCells(count: number): void;
  addPoints(count: number): void;
  visit(count: number): void;
}

const STEPS = 12;
const MAX_SAMPLES = 1048576;
const hash = (i: number, j: number, salt: number): number => {
  let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ salt;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
};

/** Size changes the pitch; Spread lowers a threshold on a fixed field. The anchor bead is never jittered. */
export function organicPatternContours(kind: OrganicPatternKind, domain: OrganicPatternDomain, budget: PatternBudget): Cmd[][] {
  const { bounds: box, origin, cell, gain } = domain;
  if (![box.x0, box.x1, box.y0, box.y1, origin.x, origin.y, cell, gain].every(Number.isFinite)
    || !(box.x1 > box.x0 && box.y1 > box.y0 && cell > 0 && gain >= .05 && gain <= 1)) {
    throw new SourceEffectError('pattern', 'precision', 'Invalid organic pattern domain');
  }
  const i0 = Math.floor((box.x0 - origin.x) / cell) - 2, i1 = Math.ceil((box.x1 - origin.x) / cell) + 2;
  const j0 = Math.floor((box.y0 - origin.y) / cell) - 2, j1 = Math.ceil((box.y1 - origin.y) / cell) + 2;
  const nx = (i1 - i0 + 4) * STEPS + 1, ny = (j1 - j0 + 4) * STEPS + 1, samples = nx * ny;
  budget.addCells((i1 - i0 + 1) * (j1 - j0 + 1));
  if (!Number.isSafeInteger(samples) || samples > MAX_SAMPLES) {
    throw new SourceEffectError('pattern', 'complexity', 'Organic pattern exceeds its field sample budget');
  }
  budget.visit(samples);
  const step = cell / STEPS, x0 = origin.x + (i0 - 2) * cell, y0 = origin.y + (j0 - 2) * cell;
  const field = new Float64Array(samples);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const varied = kind === 'liquid' && (i !== 0 || j !== 0);
    const x = origin.x + (i + (varied ? (hash(i, j, 0x27d4eb2d) - .5) * .4 : 0)) * cell;
    const y = origin.y + (j + (varied ? (hash(i, j, 0x165667b1) - .5) * .4 : 0)) * cell;
    const radius = cell * .72 * (varied ? .65 + hash(i, j, 0x1b873593) * .7 : 1), squared = radius * radius;
    const a0 = Math.max(1, Math.floor((x - radius - x0) / step)), a1 = Math.min(nx - 2, Math.ceil((x + radius - x0) / step));
    const b0 = Math.max(1, Math.floor((y - radius - y0) / step)), b1 = Math.min(ny - 2, Math.ceil((y + radius - y0) / step));
    budget.visit((a1 - a0 + 1) * (b1 - b0 + 1));
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
      const dx = x0 + a * step - x, dy = y0 + b * step - y, distance = (dx * dx + dy * dy) / squared;
      if (distance < 1) field[b * nx + a] += (1 - distance) ** 2;
    }
  }
  const threshold = .9 - .7 * gain;
  // Count crossings before marching allocates maps, so a valid field cannot bypass the point budget.
  let crossings = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const filled = field[j * nx + i] >= threshold;
    if (i + 1 < nx && filled !== (field[j * nx + i + 1] >= threshold)) crossings++;
    if (j + 1 < ny && filled !== (field[(j + 1) * nx + i] >= threshold)) crossings++;
  }
  budget.visit(samples); budget.addPoints(crossings);
  return contours(field, nx, ny, x0, y0, step, threshold).map(smoothLoop);
}
