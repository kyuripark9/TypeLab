import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { decodeFreeFont } from '../shared/engine/free';
import { cmdsBox } from '../shared/engine/geom';
import { drawnCmds, type Node } from '../shared/engine/outline';
import { SOURCE_REVISIONS } from '../shared/source/catalog';
import { parseSourceData } from '../shared/source/data';
import { sourceDot } from '../shared/source/features';
import { inverseTransform, mapOutline, mapPoint, unmapPoint } from '../shared/source/geometry';
import type { OutlineTransform, Point, PointOrigin } from '../shared/source/geometry';

const neutral: OutlineTransform = { xScale: 1, y: [[-10, -10], [0, 0], [10, 10]] };
const bent: OutlineTransform = { xScale: 1.25, y: [[0, 0], [5, 10], [10, 12.5]] };
const crossing: Node[][] = [[{ x: 0, y: 0, ox: 10, oy: 30 }, { x: 30, y: 10, ix: 20, iy: -20 }]];

function close(actual: Point, expected: Point): void {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-8, `x: ${actual.x} ≠ ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-8, `y: ${actual.y} ≠ ${expected.y}`);
}
function at(a: Node, b: Node, t: number): Point {
  const u = 1 - t;
  return {
    x: u ** 3 * a.x + 3 * u ** 2 * t * (a.ox ?? a.x) + 3 * u * t ** 2 * (b.ix ?? b.x) + t ** 3 * b.x,
    y: u ** 3 * a.y + 3 * u ** 2 * t * (a.oy ?? a.y) + 3 * u * t ** 2 * (b.iy ?? b.y) + t ** 3 * b.y
  };
}
function firstSegmentT(origin: PointOrigin): number {
  if (origin.kind === 'split') { assert.equal(origin.from, 0); return origin.t; }
  assert.ok(origin.node === 0 || origin.node === 1);
  return origin.node;
}

describe('source curve geometry', () => {
  it('returns the exact original curves at neutral without changing the source', () => {
    const before = structuredClone(crossing), result = mapOutline(crossing, neutral);
    assert.equal(result.contours, crossing);
    assert.deepEqual(crossing, before);
    assert.deepEqual(result.origins, [[{ kind: 'node', contour: 0, node: 0 }, { kind: 'node', contour: 0, node: 1 }]]);
  });

  it('maps an affine field without adding nodes or replacing the curve structure', () => {
    const result = mapOutline(crossing, { xScale: 2, y: [[0, 3], [5, 13], [10, 23]] });
    assert.deepEqual(result.contours, [[{ x: 0, y: 3, ox: 20, oy: 63 }, { x: 60, y: 23, ix: 40, iy: -37 }]]);
    assert.equal(result.contours[0].length, 2);
  });

  it('maps the whole cubic through three height crossings, including handles beyond their interval', () => {
    const before = structuredClone(crossing), result = mapOutline(crossing, bent);
    const end = result.origins[0].findIndex(origin => origin.kind === 'node' && origin.node === 1);
    assert.equal(end, 4, 'three height crossings split the cubic into four pieces');
    for (let i = 0; i < end; i++) {
      const lo = firstSegmentT(result.origins[0][i]), hi = firstSegmentT(result.origins[0][i + 1]);
      for (const fraction of [0, 0.2, 0.5, 0.8, 1]) {
        const original = at(crossing[0][0], crossing[0][1], lo + (hi - lo) * fraction);
        const expected = { x: original.x * 1.25, y: original.y <= 5 ? original.y * 2 : 10 + (original.y - 5) * 0.5 };
        close(at(result.contours[0][i], result.contours[0][i + 1], fraction), expected);
      }
    }
    assert.deepEqual(crossing, before);
    assert.equal(result.contours.length, 1);
  });

  it('splits straight edges at a height change and keeps them straight', () => {
    const result = mapOutline([[{ x: 0, y: 0 }, { x: 20, y: 10 }, { x: 20, y: 0 }]], bent);
    const rounded = result.contours[0].map(({ x, y, ...handles }) => ({ x: Math.round(x * 1e8) / 1e8, y: Math.round(y * 1e8) / 1e8, ...handles }));
    assert.deepEqual(rounded, [{ x: 0, y: 0 }, { x: 12.5, y: 10 }, { x: 25, y: 12.5 }, { x: 25, y: 10 }, { x: 25, y: 0 }]);
  });

  it('keeps each generated node tied to the same source segment as sliders move', () => {
    const second: OutlineTransform = { xScale: 0.7, y: [[0, 0], [5, 3], [10, 20]] };
    assert.deepEqual(mapOutline(crossing, bent).origins, mapOutline(crossing, second).origins);
  });

  it('preserves authored smooth handles without smoothing corners or new bends at height knots', () => {
    const original: Node[][] = [[
      { x: 0, y: 0, ox: 4, oy: 1 },
      { x: 10, y: 2, ix: 9, iy: 1, ox: 11, oy: 3, s: 1 },
      { x: 20, y: 5, ix: 19, iy: 4, ox: 21, oy: 6, s: 1 },
      { x: 30, y: 8, ix: 29, iy: 7, ox: 31, oy: 9 }
    ]];
    const result = mapOutline(original, bent);
    const moved = (index: number) => result.contours[0][result.origins[0].findIndex(o => o.kind === 'node' && o.node === index)];
    assert.equal(moved(1).s, 1, 'smooth point inside one height interval');
    assert.equal(moved(2).s, undefined, 'a different slope on each side creates a bend');
    assert.equal(moved(3).s, undefined, 'an authored corner remains a corner');
    const vertical = mapOutline([[{ x: 0, y: 0, ox: 0, oy: 3 }, { x: 0, y: 10, ix: 0, iy: 7 }]], bent);
    const diagonal = mapOutline([[{ x: 0, y: 0, ox: 3, oy: 3 }, { x: 10, y: 10, ix: 7, iy: 7 }]], bent);
    assert.equal(vertical.contours[0][1].s, 1, 'a vertical tangent stays straight through a height knot');
    assert.equal(diagonal.contours[0][1].s, undefined, 'a diagonal tangent bends through a height knot');
  });

  it('inverts the full split curve and points beyond both ends of the height map', () => {
    for (const point of [{ x: -12, y: -50 }, { x: 30, y: 3 }, { x: 90, y: 60 }]) {
      close(unmapPoint(mapPoint(point, bent), bent), point);
    }
    const forward = mapOutline(crossing, bent), back = mapOutline(forward.contours, inverseTransform(bent));
    assert.equal(back.contours[0].length, forward.contours[0].length);
    const end = forward.origins[0].findIndex(origin => origin.kind === 'node' && origin.node === 1);
    for (let i = 0; i < end; i++) {
      const lo = firstSegmentT(forward.origins[0][i]), hi = firstSegmentT(forward.origins[0][i + 1]);
      for (const fraction of [0, 0.2, 0.5, 0.8, 1]) {
        close(at(back.contours[0][i], back.contours[0][i + 1], fraction), at(crossing[0][0], crossing[0][1], lo + (hi - lo) * fraction));
      }
    }
  });

  it('rejects a map that could fold, collapse, or produce non-finite coordinates', () => {
    const invalid: OutlineTransform[] = [
      { xScale: 0, y: [[0, 0], [1, 1]] }, { xScale: -1, y: [[0, 0], [1, 1]] },
      { xScale: Infinity, y: [[0, 0], [1, 1]] }, { xScale: 1, y: [[0, 0], [0, 1]] },
      { xScale: 1, y: [[0, 1], [1, 0]] }, { xScale: 1, y: [[0, 0], [1, 0]] },
      { xScale: 1, y: [[0, 0], [1, NaN]] }
    ];
    for (const transform of invalid) assert.throws(() => mapOutline(crossing, transform), RangeError);
  });

  it('pins each reviewed dot to the actual separated source component', () => {
    let checked = 0;
    for (const ref of SOURCE_REVISIONS) {
      const source: unknown = JSON.parse(readFileSync(new URL(`../fonts/sources/${ref.digest}.json`, import.meta.url), 'utf8'));
      const font = decodeFreeFont(parseSourceData(source));
      for (const ch of 'ij') {
        const recipe = sourceDot(ref.digest, ch);
        if (!recipe) { assert.equal(`${ref.fontId}/${ch}`, 'Serenade:400/j'); continue; }
        const contours = font.glyphs[ch].contours;
        const dot = cmdsBox(drawnCmds(contours.filter((_, i) => recipe.contours.includes(i))));
        const body = cmdsBox(drawnCmds(contours.filter((_, i) => !recipe.contours.includes(i))));
        assert.ok(dot && body);
        assert.equal(dot.y0, recipe.bottom, `${ref.fontId}/${ch}: dot bottom`);
        assert.equal(body.y1, recipe.bodyTop, `${ref.fontId}/${ch}: body top`);
        assert.ok(dot.y0 > body.y1, `${ref.fontId}/${ch}: positive clearance`);
        checked++;
      }
    }
    assert.equal(checked, 59);
    assert.equal(sourceDot('unknown-revision', 'j'), null);
    assert.equal(sourceDot(SOURCE_REVISIONS[0].digest, 'R'), null);
  });
});
