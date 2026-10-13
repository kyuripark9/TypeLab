/* A line of the construction grid (engine/grid.ts) dragged: every point of the letter lying on the line moves with it,
   its handles too, so the edges along it and the curves turning on it go along and the rest of the letter stays. A
   level line moves up and down, an upright one across; a diagonal moves across when steep and up and down when
   shallow, so its ends stay on the level (or upright) lines they stand on. A slanted letter's grid stands upright
   (`Lean`), so its upright lines move across and its level ones up and down the slant. Pure, tests/grid-drag.test.ts. */
import { sameLine, type GlyphGrid, type GridLine, type Node } from '../../shared/engine';
import { moveAnchors, type Ref } from './pen';

type P = { x: number; y: number };
/** How a grid leans: by `slant` units across per unit up, about the level line y = `pivot` (GlyphGrid's). */
export type Lean = Pick<GlyphGrid, 'slant' | 'pivot'>;

/** How far off a line, in font units, a point still lies on it: the grid takes an edge a hair off level as level,
    at the height between its ends, and lines within 1.5 units of each other as one. */
export const ON_LINE = 3;

/** A point of the letter as its grid reads it, set upright. */
const upright = (q: P, lean: Lean): P => ({ x: q.x - lean.slant * (q.y - lean.pivot), y: q.y });

/** How far a point (upright) lies across a line, to its left looking along it. */
const across = (l: GridLine, q: P) => (q.y - l.y) * Math.cos(l.a) - (q.x - l.x) * Math.sin(l.a);

/** Which way a line moves: 'y' up and down for a level or shallow one, 'x' across for an upright or steep one. */
export const slideOf = (l: GridLine): 'x' | 'y' => (Math.abs(Math.sin(l.a)) >= Math.abs(Math.cos(l.a)) ? 'x' : 'y');

/** The anchor points of `cs` on line `l`. */
export function pointsOn(cs: Node[][], l: GridLine, lean: Lean, tol = ON_LINE): Ref[] {
  const out: Ref[] = [];
  cs.forEach((con, c) => con.forEach((n, i) => { if (Math.abs(across(l, upright(n, lean))) <= tol) out.push({ c, i }); }));
  return out;
}

/** How far along its way (slideOf) the line moves to stay under a pointer moved by (dx, dy) font units, as the
    letter stands (slanted). */
export function slideBy(l: GridLine, lean: Lean, dx: number, dy: number): number {
  const t = dy * Math.cos(l.a) - (dx - lean.slant * dy) * Math.sin(l.a);
  return slideOf(l) === 'x' ? -t / Math.sin(l.a) : t / Math.cos(l.a);
}

/** The letter with the points `refs` (on line `l`) moved `by` font units along the line's way. */
export function moveLine(cs: Node[][], refs: Ref[], l: GridLine, lean: Lean, by: number): Node[][] {
  if (!by) return cs;
  return slideOf(l) === 'x' ? moveAnchors(cs, refs, by, 0) : moveAnchors(cs, refs, lean.slant * by, by);
}

/** The line `l` in another letter's grid, at the same place, or null where it has none. */
export const lineIn = (l: GridLine, grid: GlyphGrid): GridLine | null => grid.lines.find(k => sameLine(l, k, true)) ?? null;

/** `at`, or the nearest of `targets` within `tol` of it. */
export function snapTo(at: number, targets: readonly number[], tol: number): number {
  let best = at, bd = tol;
  for (const t of targets) { const d = Math.abs(t - at); if (d <= bd) { best = t; bd = d; } }
  return best;
}
