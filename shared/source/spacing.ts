/* Monospacing changes placement and advances, never the source curves. */
import type { Drawn, SourceSpacingFrame } from '../engine/outline';

export interface SourceSpacingPolicy {
  format: 'source-spacing-v1';
  mono: { cell: 'widest-advance'; align: 'advance-center' };
}
export interface SourceMonoPlan { cell: number; amount: number }

export function parseSourceSpacing(input: unknown): SourceSpacingPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source spacing policy');
  const value = Object.fromEntries(Object.entries(input)), mono = value.mono;
  if (value.format !== 'source-spacing-v1' || Object.keys(value).some(key => key !== 'format' && key !== 'mono')
    || !mono || typeof mono !== 'object' || Array.isArray(mono)) throw new TypeError('Invalid source spacing policy');
  const cell = Object.fromEntries(Object.entries(mono));
  if (cell.cell !== 'widest-advance' || cell.align !== 'advance-center' || Object.keys(cell).some(key => key !== 'cell' && key !== 'align')) {
    throw new TypeError('Unsupported source monospace placement');
  }
  return { format: 'source-spacing-v1', mono: { cell: 'widest-advance', align: 'advance-center' } };
}

export function sourceSpacingExtends(before: SourceSpacingPolicy, after: SourceSpacingPolicy): boolean {
  return before.format === after.format && before.mono.cell === after.mono.cell && before.mono.align === after.mono.align;
}

export function sourceMonoAdvance(advance: number, plan: SourceMonoPlan | null): number {
  if (!plan || plan.amount === 0 || advance === plan.cell) return advance;
  return plan.amount === 1 ? plan.cell : advance + (plan.cell - advance) * plan.amount;
}

function translated(drawing: Drawn, dx: number): Drawn {
  if (dx === 0) return drawing;
  return { ...drawing, contours: drawing.contours.map(contour => contour.map(node => ({ ...node, x: node.x + dx,
    ...(node.ix === undefined ? {} : { ix: node.ix + dx }), ...(node.ox === undefined ? {} : { ox: node.ox + dx }) }))) };
}

/** The saved original advance also survives the non-invertible, fully monospaced endpoint. */
export function unspaceSourceDrawing(drawing: Drawn): Drawn {
  const frame = drawing.spacing;
  if (!frame) return drawing;
  const { spacing: _, ...plain } = translated(drawing, -frame.shift);
  return { ...plain, adv: Math.max(0, frame.originalAdvance + (drawing.adv - frame.advance)) };
}

export function spaceSourceDrawing(drawing: Drawn, plan: SourceMonoPlan | null): Drawn {
  const before = drawing.spacing;
  const originalAdvance = before ? Math.max(0, before.originalAdvance + (drawing.adv - before.advance)) : drawing.adv;
  const advance = sourceMonoAdvance(originalAdvance, plan), shift = (advance - originalAdvance) / 2;
  if (before && before.originalAdvance === originalAdvance && before.advance === advance && before.shift === shift) return drawing;
  if (!before && shift === 0) return drawing;
  const { spacing: _, ...placed } = translated(drawing, shift - (before?.shift ?? 0));
  const spacing: SourceSpacingFrame = { format: 'source-mono-v1', originalAdvance, advance, shift };
  return { ...placed, adv: advance, ...(shift === 0 ? {} : { spacing }) };
}
