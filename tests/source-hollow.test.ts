import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Clipper64, PolyTree64 } from 'clipper2-ts';
import { ClipperOffset, EndType, JoinType } from '../shared/vendor/clipper2-offset';
import { shape } from '../shared/engine/boolean';
import { cmdsContours, drawnCmds } from '../shared/engine/outline';
import { reverseContour } from '../client/lib/pen';
import type { Cmd } from '../shared/engine/types';
import { sourceFinishPolygons } from '../shared/source/finish';
import { compileHollow, HollowError, hollowSource } from '../shared/source/hollow';

const rectangle = (x: number, y: number, width: number, height: number): Cmd[] => [
  ['M', x, y], ['L', x + width, y], ['L', x + width, y + height], ['L', x, y + height], ['Z'],
];
const inside = (cmds: Cmd[], x: number, y: number) => shape(sourceFinishPolygons(cmds, .001)).has(x, y);
const reversed = (cmds: Cmd[]) => {
  let contours = cmdsContours(cmds);
  for (let i = 0; i < contours.length; i++) contours = reverseContour(contours, i);
  return drawnCmds(contours, true);
};
const plan = compileHollow({ rim: 5, tolerance: .04 });

describe('source hollow geometry', () => {
  it('keeps a literal protected rim and removes the interior of a square', () => {
    const input = rectangle(0, 0, 100, 100), before = structuredClone(input), result = hollowSource(input, plan);
    assert.deepEqual(input, before);
    for (const [x, y] of [[2, 50], [98, 50], [50, 2], [50, 98]]) assert.equal(inside(result.cmds, x, y), true);
    for (const [x, y] of [[50, 50], [10, 10], [-1, 50], [101, 50]]) assert.equal(inside(result.cmds, x, y), false);
    assert.equal(result.diagnostics.hollowEdges, 4);
    assert.ok(result.diagnostics.clearance);
    assert.ok(result.diagnostics.clearance.minimum >= 5);
    assert.ok(result.diagnostics.clearance.maximum <= 5.04);
  });

  it('retains narrow strokes and tiny dots exactly when no hollow fits', () => {
    for (const input of [rectangle(0, 0, 4, 100), rectangle(0, 0, .2, .2)]) {
      const result = hollowSource(input, plan);
      assert.equal(result.cmds, input);
      assert.equal(result.diagnostics.hollowEdges, 0);
      assert.equal(result.diagnostics.clearance, null);
    }
  });

  it('keeps a thin ring solid without filling its original counter when erosion collapses', () => {
    const ring = [...rectangle(0, 0, 100, 100), ...reversed(rectangle(3, 3, 94, 94))];
    assert.equal(hollowSource(ring, plan).cmds, ring);
    const mixed = hollowSource([...ring, ...rectangle(150, 0, 100, 100)], plan);
    assert.equal(inside(mixed.cmds, 1, 50), true);
    assert.equal(inside(mixed.cmds, 50, 50), false);
    assert.equal(inside(mixed.cmds, 200, 50), false);
    assert.equal(inside(mixed.cmds, 151, 50), true);
  });

  it('unites overlapping ink without losing a detached sub-unit dot, in either winding', () => {
    const input = [...rectangle(0, 0, 60, 100), ...rectangle(40, 0, 60, 100), ...rectangle(120, 0, .2, .2)];
    for (const original of [input, reversed(input)]) {
      const result = hollowSource(original, plan);
      assert.equal(result.diagnostics.normalization, 'polygon-union');
      assert.equal(inside(result.cmds, 50, 50), false, 'overlap must hollow rather than retain double winding');
      assert.equal(inside(result.cmds, 2, 50), true);
      assert.equal(inside(result.cmds, 120.1, .1), true, 'small independent ink stays present');
      assert.equal(inside(result.cmds, 110, 50), false);
    }

  });

  it('keeps distinct original anchors closer than the historical merge radius', () => {
    const input = [...rectangle(0, 0, 60, 100), ...rectangle(40, 0, 60, 100), ...rectangle(120, 0, .0002, .0002)];
    const result = hollowSource(input, plan);
    assert.equal(inside(result.cmds, 120.0001, .0001), true);
    assert.equal(inside(result.cmds, 50, 50), false);
  });

  it('protects a small original counter and its surrounding rim', () => {
    const input = [...rectangle(0, 0, 100, 100), ...reversed(rectangle(49, 49, 2, 2))];
    const result = hollowSource(input, plan);
    assert.equal(inside(result.cmds, 50, 50), false);
    for (const [x, y] of [[54, 50], [46, 50], [50, 54], [50, 46]]) assert.equal(inside(result.cmds, x, y), true);
    assert.equal(inside(result.cmds, 70, 50), false);
    assert.ok(result.diagnostics.clearance);
    assert.ok(result.diagnostics.clearance.minimum >= 5);
    assert.ok(result.diagnostics.clearance.maximum <= 5.04);
  });

  it('does not drop a curved counter that initially flattens to two points', () => {
    const input: Cmd[] = [...rectangle(0, 0, 100, 100), ['M', 49.99, 50],
      ['C', 49.995, 50.001, 50.005, 50.001, 50.01, 50],
      ['C', 50.005, 49.999, 49.995, 49.999, 49.99, 50], ['Z']];
    const result = hollowSource(input, plan), ink = shape(sourceFinishPolygons(result.cmds, .00001));
    assert.equal(ink.has(50, 50), false);
    assert.equal(ink.has(50, 51), true);
    assert.equal(ink.has(70, 50), false);
  });

  it('retains a valid tiny hollow when serializing its certified boundary', () => {
    const result = hollowSource(rectangle(0, 0, 10.06, 10.06), plan);
    assert.equal(inside(result.cmds, 5.03, 5.03), false);
    assert.equal(inside(result.cmds, 1, 5.03), true);
  });

  it('bounds the rendered curve approximation and leaves the edited source untouched', () => {
    const input: Cmd[] = [['M', 0, 0], ['C', 0, 110, 100, 90, 100, 0], ['L', 0, 0], ['Z']];
    const before = structuredClone(input), result = hollowSource(input, plan);
    assert.deepEqual(input, before);
    assert.equal(inside(result.cmds, 50, 10), false);
    assert.equal(inside(result.cmds, 50, 2), true);
    assert.ok(result.diagnostics.returnedBoundaryToSourceBound <= .0081);
    assert.ok(result.diagnostics.topologyWitnesses > 0);
    assert.ok(result.diagnostics.clearance);
    assert.ok(result.diagnostics.clearance.minimum >= 5);
    assert.ok(result.diagnostics.clearance.maximum <= 5.04);
  });

  it('hollows a duplicated curved contour even when one copy has a Pen subdivision', () => {
    const whole: Cmd[] = [['M', 0, 0], ['C', 0, 100, 100, 100, 100, 0], ['L', 0, 0], ['Z']];
    const divided: Cmd[] = [['M', 0, 0], ['C', 0, 50, 25, 75, 50, 75], ['C', 75, 75, 100, 50, 100, 0], ['L', 0, 0], ['Z']];
    const result = hollowSource([...whole, ...divided], plan);
    assert.equal(result.diagnostics.normalization, 'polygon-union');
    assert.equal(inside(result.cmds, 50, 10), false);
    assert.equal(inside(result.cmds, 50, 2), true);
  });

  it('normalizes nearly coincident overlapping curves and hollows the resulting ink', () => {
    const input: Cmd[] = [
      ['M', 0, 0], ['C', 0, 100, 100, 100, 100, 0], ['L', 0, 0], ['Z'],
      ['M', 0, 0], ['C', 0, 100.01, 100, 100.01, 100, 0], ['L', 0, 0], ['Z'],
    ];
    const result = hollowSource(input, plan);
    assert.equal(inside(result.cmds, 50, 10), false);
    assert.equal(inside(result.cmds, 50, 2), true);
  });

  it('detects sub-grid dots, counters, and attached long thin spikes explicitly', () => {
    const spike: Cmd[] = [['M', 0, 0], ['L', 100, 0], ['L', 100, 49.9999999],
      ['L', 300, 50], ['L', 100, 50.0000001], ['L', 100, 100], ['L', 0, 100], ['Z']];
    const lens: Cmd[] = [['M', 0, 50], ['C', 25, 50.0000001, 75, 50.0000001, 100, 50],
      ['C', 75, 49.9999999, 25, 49.9999999, 0, 50], ['Z']];
    for (const input of [spike, [...rectangle(0, 0, 100, 100), ...lens],
      [...rectangle(0, 0, 100, 100), ...rectangle(120, 0, .0000002, .0000002)]]) {
      assert.throws(() => hollowSource(input, plan), (error: unknown) => error instanceof HollowError && error.reason === 'tolerance');
    }
  });

  it('does not silently flatten an attached thin curved lens into a zero-width tail', () => {
    const make = (height: number): Cmd[] => [['M', 0, 0], ['L', 100, 0], ['L', 100, 50],
      ['C', 150, 50 - height, 250, 50 - height, 300, 50],
      ['C', 250, 50 + height, 150, 50 + height, 100, 50],
      ['L', 100, 100], ['L', 0, 100], ['Z']];
    const visible = hollowSource(make(.0002), plan);
    assert.equal(inside(visible.cmds, 200, 50), true);
    assert.throws(() => hollowSource(make(.0000002), plan),
      (error: unknown) => error instanceof HollowError && error.reason === 'tolerance');
  });

  it('rejects a tapered sub-grid roof instead of silently removing its distant tip', () => {
    const input: Cmd[] = [['M', 0, 0], ['L', 100, 0], ['L', 100, 100.0050002],
      ['L', 0, 100.0050001], ['L', 90, 100.005], ['L', 90, 100], ['L', 0, 100], ['Z']];
    assert.equal(inside(input, 50, 100.0050001), true);
    assert.throws(() => hollowSource(input, plan),
      (error: unknown) => error instanceof HollowError && error.reason === 'tolerance');
  });

  it('retains a long thin spike wider than the numerical grid', () => {
    const input: Cmd[] = [['M', 0, 0], ['L', 100, 0], ['L', 100, 49.9999],
      ['L', 300, 50], ['L', 100, 50.0001], ['L', 100, 100], ['L', 0, 100], ['Z']];
    const result = hollowSource(input, plan);
    assert.equal(inside(result.cmds, 250, 50), true);
    assert.equal(inside(result.cmds, 50, 50), false);
  });

  it('normalizes a self-crossing contour whose signed area is zero', () => {
    const input: Cmd[] = [['M', 0, 0], ['L', 100, 100], ['L', 0, 100], ['L', 100, 0], ['Z']];
    const result = hollowSource(input, plan);
    assert.equal(inside(result.cmds, 50, 2), true);
    assert.equal(inside(result.cmds, 50, 98), true);
    assert.equal(inside(result.cmds, 50, 15), false);
    assert.equal(inside(result.cmds, 50, 85), false);
  });

  it('reports both offset union failures and never treats a failed offset as an empty erosion', () => {
    const execute = mock.method(Clipper64.prototype, 'execute', () => false);
    try {
      for (const output of [[], new PolyTree64()]) {
        const offset = new ClipperOffset(2, .01);
        offset.addPaths([[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]], JoinType.Round, EndType.Polygon);
        if (Array.isArray(output)) assert.throws(() => offset.execute(-5, output), /union did not complete/);
        else assert.throws(() => offset.execute(-5, output), /union did not complete/);
      }
      assert.throws(() => hollowSource(rectangle(0, 0, 100, 100), plan),
        (error: unknown) => error instanceof HollowError && error.reason === 'normalization');
    } finally { execute.mock.restore(); }
    const offsetUnion = mock.method(Clipper64.prototype, 'execute');
    offsetUnion.mock.mockImplementationOnce(() => false, 1);
    try {
      assert.throws(() => hollowSource(rectangle(0, 0, 100, 100), plan),
        (error: unknown) => error instanceof HollowError && error.reason === 'normalization' && /offset/.test(error.message));
      assert.equal(offsetUnion.mock.callCount(), 2);
    } finally { offsetUnion.mock.restore(); }
  });

  it('rejects invalid dimensions before geometry work', () => {
    for (const invalid of [{ rim: 0, tolerance: .04 }, { rim: 2, tolerance: 0 }, { rim: NaN, tolerance: .04 }, { rim: 2, tolerance: 1 }]) {
      assert.throws(() => compileHollow(invalid), RangeError);
    }
    const input = rectangle(0, 0, 100, 100);
    assert.equal(hollowSource(input, { rim: 1e20, tolerance: .04 }).cmds, input);
    assert.throws(() => hollowSource(Array.from({ length: 4000 }, () => input).flat(), plan),
      (error: unknown) => error instanceof HollowError && error.reason === 'complexity');
  });
});
