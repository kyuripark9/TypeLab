/* Types for ambient-flow.mjs: the ink field the mesh-made weights were drawn with, read by smooth-masters.ts. */
import type { Node } from '../../shared/engine/outline';

/** A letter's ink field: where `amount` of it carries the point (x, y). */
export function flowField(cs: Node[][], options?: { step?: number; blur?: number; regularization?: number }): (x: number, y: number, amount: number) => [number, number];
