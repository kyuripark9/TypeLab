import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFont, gridOf, sameRound, type GridLine, type GridRound, type Node } from '../shared/engine';
import { DEFAULTS } from '../shared/params';
import {
  chainPoints, chainsOf, leaned, lineIn, mapChains, mostScale, moveLine, pivotOf, pointsOn, scaleAbout, scaleFor, slideBy, slideOf, snapTo
} from '../client/lib/grid-drag';
import { traceOf } from '../client/lib/pen';

/* A line or a circle of the construction grid dragged (client/lib/grid-drag.ts). A line: the points on it found and
   moved with it, level lines up and down, upright and steep ones across, a slanted letter's along its slant, and the
   same line found in another letter of the group. A circle: the stretches of curve it was read off found among the
   letter's points, and resized about what keeps them on what they run into (a bowl about its middle, a rounded corner
   about its corner, a bracket ending at a corner up its stem, a bowl between corners only bulging), no further than
   their ends can slide, or moved. */

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

describe('dragging a circle of the construction grid', () => {
  const upright = { slant: 0, pivot: 0 };
  const pt = (x: number, y: number, h: Partial<Node> = {}): Node => ({ x, y, ...h });
  const round = (cx: number, cy: number, r: number, arcs: [number, number, number, number][]): GridRound =>
    ({ cx, cy, rx: r, ry: r, len: 1, shared: false, arcs: arcs.map(([ax, ay, bx, by]) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } })) });
  // a square with its bottom right corner rounded (radius 50, about (100, 50)), its round between two straight edges
  const square = [[pt(0, 0), pt(100, 0, { ox: 127.6, oy: 0 }), pt(150, 50, { ix: 150, iy: 22.4 }), pt(150, 150), pt(0, 150)]];
  const corner = round(100, 50, 50, [[100, 0, 150, 50]]);

  it('finds the stretches a round was read off among the letter\'s points, a whole bowl as one loop', () => {
    assert.deepEqual(chainsOf(square, corner, upright), [{ c: 0, s: 1, n: 1, loop: false }]);
    assert.deepEqual(chainsOf(square, round(0, 0, 50, [[30, 30, 60, 60]]), upright), [], 'an arc ending off the points is left out');
    const font = buildFont({ ...DEFAULTS }), o = font.glyph('O')!, grid = gridOf(font, 'O')!.grid, cs = traceOf(o).contours;
    const outer = grid.rounds.reduce((a, r) => (r.rx > a.rx ? r : a)), chains = chainsOf(cs, outer, grid);
    assert.equal(chains.length, 1);
    assert.ok(chains[0].loop && chainPoints(cs, chains[0]).length === cs[chains[0].c].length, 'the O\'s outline, all of it');
    // a bowl grows about its middle
    const c = leaned({ x: outer.cx, y: outer.cy }, grid), p = pivotOf(cs, chains[0], c);
    assert.deepEqual(p, { at: c });
    const top = cs[chains[0].c].reduce((a, n) => (n.y > a.y ? n : a)), moved = scaleAbout(top, p, 1.2);
    assert.ok(near(moved.y - c.y, (top.y - c.y) * 1.2, 1e-9));
  });

  it('finds a leaning letter\'s bowl by its curves lying on the round, its points traced where it leans', () => {
    const font = buildFont({ ...DEFAULTS, slant: 0.7 }), grid = gridOf(font, 'O')!.grid, cs = traceOf(font.glyph('O')!).contours;
    assert.ok(grid.slant > 0.1);
    for (const r of grid.rounds) {
      const chains = chainsOf(cs, r, grid);
      assert.ok(chains.length === 1 && chains[0].loop, 'each of the O\'s bowls, all of its contour');
    }
  });

  it('grows a rounded corner about its corner, its ends sliding along their edges, no further than the edges go', () => {
    const [chain] = chainsOf(square, corner, upright), p = pivotOf(square, chain, { x: 100, y: 50 });
    assert.deepEqual(p, { at: { x: 150, y: 0 } });
    const out = mapChains(square, [{ chain, f: q => scaleAbout(q, p, 1.5) }]);
    assert.deepEqual([out[0][1].x, out[0][1].y, out[0][2].x, out[0][2].y], [75, 0, 150, 75], 'still on the bottom and the right side');
    assert.deepEqual([out[0][1].ox, out[0][2].iy], [116, 34], 'its handles grown with it');
    assert.ok(out[0][0] === square[0][0] && out[0][3] === square[0][3], 'the rest of the square kept');
    assert.ok(near(mostScale(square, chain, p), 2.96, 1e-9), 'its ends stop two units short of the square\'s other corners');
    assert.equal(scaleFor(p, { x: 100, y: 0 }, { x: 100, y: 0 }, 10), 1, 'pressed and not moved, as it is');
    assert.equal(scaleFor(p, { x: 100, y: 0 }, { x: 75, y: 9 }, 10), 1.5, 'the point pressed follows the pointer along the way it moves');
  });

  it('keeps an end at a corner where it is: a bracket climbs its stem, its serif\'s tip stays', () => {
    // a stem's edge down into a bracket that ends at the serif's tip, a corner, then the serif's end down
    const serif = [[pt(100, 300), pt(100, 60, { ox: 100, oy: 40 }), pt(160, 20, { ix: 130, iy: 20 }), pt(160, 0), pt(0, 0)]];
    const [chain] = chainsOf(serif, round(160, 60, 60, [[100, 60, 160, 20]]), upright), p = pivotOf(serif, chain, { x: 160, y: 60 });
    assert.deepEqual(p, { at: { x: 160, y: 20 }, fix: { x: 1, y: 0 }, along: { x: 0, y: -1 } });
    const out = mapChains(serif, [{ chain, f: q => scaleAbout(q, p, 2) }]);
    assert.deepEqual([out[0][1].x, out[0][1].y, out[0][2].x, out[0][2].y], [100, 100, 160, 20], 'up the stem, the tip kept');
    assert.ok(near(mostScale(serif, chain, p), 6.95, 1e-9), 'no higher than the stem\'s straight edge goes');
  });

  it('only bulges a bowl between two corners, and a U turn, their ends kept', () => {
    // a D: its stem, and its bowl from the stem's top round to its foot, at corners both
    const d = [[pt(0, 0, { ix: 110, iy: 0 }), pt(0, 200, { ox: 110, oy: 200 })]];
    const [chain] = chainsOf(d, round(0, 100, 100, [[0, 200, 0, 0]]), upright), p = pivotOf(d, chain, { x: 0, y: 100 });
    assert.ok(p.fix && p.along && near(p.along.x, 1, 1e-9));
    const out = mapChains(d, [{ chain, f: q => scaleAbout(q, p, 1.5) }]);
    assert.deepEqual(out[0].map(n => [n.x, n.y, n.ix ?? n.ox]), [[0, 0, 165], [0, 200, 165]]);
    assert.equal(mostScale(d, chain, p), Infinity);
    // the bottom of a u: down one side, round, up the other, running on into both
    const u = [[pt(0, 300), pt(0, 50, { ox: 0, oy: 22 }), pt(50, 0, { ix: 22, iy: 0, ox: 78, oy: 0 }), pt(100, 50, { ix: 100, iy: 22 }), pt(100, 300)]];
    const [bottom] = chainsOf(u, round(50, 50, 50, [[0, 50, 50, 0], [50, 0, 100, 50]]), upright), pu = pivotOf(u, bottom, { x: 50, y: 50 });
    assert.deepEqual(bottom, { c: 0, s: 1, n: 2, loop: false }, 'its two quarters one stretch');
    const deeper = mapChains(u, [{ chain: bottom, f: q => scaleAbout(q, pu, 1.4) }]);
    assert.deepEqual(deeper[0].map(n => [n.x, n.y]), [[0, 300], [0, 50], [50, -20], [100, 50], [100, 300]], 'deeper, its sides where they were');
  });

  it('moves a round whole, what it runs on into stretching to it', () => {
    const [chain] = chainsOf(square, corner, upright), out = mapChains(square, [{ chain, f: q => ({ x: q.x + 10, y: q.y - 5 }) }]);
    assert.deepEqual([out[0][1].x, out[0][1].y, out[0][1].ox, out[0][2].x, out[0][2].y, out[0][2].iy], [110, -5, 138, 160, 45, 17]);
  });

  it('finds the same circle in another letter of the group, never one of its size elsewhere', () => {
    const r = round(100, 50, 50, []);
    assert.ok(sameRound(r, round(101, 51, 51, [])));
    assert.ok(!sameRound(r, round(160, 50, 50, [])), 'as large, in another place');
    const font = buildFont({ ...DEFAULTS, roundness: 0.6 }), n = gridOf(font, 'n')!.grid, m = gridOf(font, 'm')!.grid;
    const foot = n.rounds.find(k => k.cy < 40)!;
    assert.ok(m.rounds.some(k => sameRound(foot, k)), 'the m\'s first foot rounded as the n\'s');
  });
});
