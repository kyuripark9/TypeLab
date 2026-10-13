import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFont, gridOf, type GridLine, type Node } from '../shared/engine';
import { DEFAULTS } from '../shared/params';
import { lineIn, moveLine, pointsOn, slideBy, slideOf, snapTo } from '../client/lib/grid-drag';
import { traceOf } from '../client/lib/pen';

/* A line of the construction grid dragged (client/lib/grid-drag.ts): the points on it found and moved with it, level
   lines up and down, upright and steep ones across, a slanted letter's along its slant, and the same line found in
   another letter of the group. */

const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const keys = (cs: Node[][]) => cs.flatMap((con, c) => con.map((n, i) => ({ c, i, n })));

describe('dragging a line of the construction grid', () => {
  const font = buildFont({ ...DEFAULTS });
  const H = font.glyph('H')!, hGrid = gridOf(font, 'H')!.grid, doc = traceOf(H);
  const lineAt = (kind: GridLine['kind'], v: number) => hGrid.lines.find(l => l.kind === kind && near(kind === 'h' ? l.y : l.x, v, 2))!;

  it('finds the points on a line and moves only them, handles and all', () => {
    const cap = lineAt('h', font.m.cap), on = pointsOn(doc.contours, cap, hGrid);
    assert.equal(on.length, 4, 'the tops of both stems, two corners each');
    const moved = moveLine(doc.contours, on, cap, hGrid, 30);
    for (const { c, i, n } of keys(doc.contours)) {
      const m = moved[c][i], picked = on.some(r => r.c === c && r.i === i);
      assert.equal(m.y, picked ? Math.round(n.y + 30) : n.y);
      assert.equal(m.x, n.x, 'a level line moves up, not across');
    }
    assert.equal(moveLine(doc.contours, on, cap, hGrid, 0), doc.contours, 'not moved, the letter is the same');
  });

  it('moves an upright line across, and follows the pointer along the way a line moves', () => {
    const left = lineAt('v', H.lsb), on = pointsOn(doc.contours, left, hGrid);
    assert.equal(slideOf(left), 'x');
    assert.ok(near(slideBy(left, hGrid, -12, 40), -12, 1e-9), 'only the pointer\'s travel across counts');
    assert.ok(near(slideBy(lineAt('h', 0), hGrid, 25, -8), -8, 1e-9));
    const moved = moveLine(doc.contours, on, left, hGrid, -12);
    assert.ok(on.length >= 2 && on.every(({ c, i }) => moved[c][i].x === Math.round(doc.contours[c][i].x - 12) && moved[c][i].y === doc.contours[c][i].y));
  });

  it('moves a diagonal across, keeping its ends at their heights', () => {
    const v = font.glyph('V')!, grid = gridOf(font, 'V')!.grid, d = grid.lines.find(l => l.kind === 'd')!, vd = traceOf(v);
    assert.equal(slideOf(d), 'x', 'a V\'s diagonals are steep');
    const on = pointsOn(vd.contours, d, grid), moved = moveLine(vd.contours, on, d, grid, 15);
    assert.ok(on.length >= 2);
    for (const { c, i } of on) assert.ok(moved[c][i].y === vd.contours[c][i].y && moved[c][i].x === Math.round(vd.contours[c][i].x + 15));
    // the pointer moved straight across the line by t moves it so far across: t over the sine of its angle
    const t = 10, nx = -Math.sin(d.a), ny = Math.cos(d.a);
    assert.ok(near(slideBy(d, grid, nx * t, ny * t) * -Math.sin(d.a), t, 1e-9));
  });

  it('moves a slanted letter\'s level line up its slant, so its points stay on its uprights', () => {
    const f = buildFont({ ...DEFAULTS, slant: 0.7 }), grid = gridOf(f, 'H')!.grid, sd = traceOf(f.glyph('H')!);
    assert.ok(grid.slant > 0.1);
    const cap = grid.lines.find(l => l.kind === 'h' && near(l.y, f.m.cap, 2))!, stem = grid.lines.find(l => l.kind === 'v')!;
    const on = pointsOn(sd.contours, cap, grid);
    assert.equal(on.length, 4, 'found on the letter as it leans');
    const moved = moveLine(sd.contours, on, cap, grid, 40);
    const was = pointsOn(sd.contours, stem, grid), still = pointsOn(moved, stem, grid);
    assert.deepEqual(still, was, 'the stem\'s edge still has its points, its top among them');
    // the pointer dragged straight up the slant moves a level line by as much, an upright one not at all
    assert.ok(near(slideBy(cap, grid, grid.slant * 20, 20), 20, 1e-9) && near(slideBy(stem, grid, grid.slant * 20, 20), 0, 1e-9));
  });

  it('finds the same line in another letter of the group, never another at the same angle elsewhere', () => {
    const base = lineAt('h', 0), e = gridOf(font, 'E')!.grid;
    assert.ok(lineIn(base, e), 'the E stands on the baseline too');
    const v = gridOf(font, 'V')!.grid, d = v.lines.find(l => l.kind === 'd')!;
    assert.equal(lineIn({ ...d, x: d.x + 50 }, v), null);
  });

  it('snaps a position to the nearest stop within reach', () => {
    assert.equal(snapTo(503, [0, 500, 520], 6), 500);
    assert.equal(snapTo(509, [0, 500, 520], 6), 509);
    assert.equal(snapTo(511, [500, 515], 6), 515);
  });
});
