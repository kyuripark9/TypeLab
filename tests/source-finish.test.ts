/* Finishing changes only output ink; the authored face and its editable projection remain exact. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFont, type Glyph } from '../shared/engine';
import { shape } from '../shared/engine/boolean';
import type { Drawn } from '../shared/engine/outline';
import { DEFAULTS, freeAtOf } from '../shared/params';
import { masterInfo, mastersForFont } from '../shared/source/master-catalog';
import { compileSourceFinish, finishSourceGlyph, parseSourceFinish, sourceFinishBounds, sourceFinishControls, sourceFinishDefaults, sourceFinishExtends, sourceFinishFills, sourceFinishPolygons, type SourceFinishPlan } from '../shared/source/finish';
import { loadSource } from '../server/sources';
import { traceOf } from '../client/lib/pen';

const policy = parseSourceFinish({ format: 'source-finish-v1', tolerance: .04, shadow: { depth: [.04, .12], gap: .012, minAreaRatio: .25 } });
const shadow: SourceFinishPlan = { kind: 'shadow', dx: 60, dy: -60, gap: 10, tolerance: .04, minArea: 0 };
const sliced = parseSourceFinish({ ...policy, slice: { maxGap: .14, position: [.12, .88] } });
const opening: SourceFinishPlan = { kind: 'solid', slice: { at: 50, gap: 20, rounding: 0, tolerance: .04 } };
function drawing(contours: Drawn['contours'], adv = 180): Glyph {
  const glyph = buildFont({ ...DEFAULTS, outlines: { H: { adv, contours } } }).glyph('H');
  assert.ok(glyph?.drawn);
  return glyph;
}
const box = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

function foregroundUnchanged(before: Glyph, after: Glyph) {
  assert.equal(after.drawn, before.drawn);
  assert.equal(after.editable, before.editable ?? before.drawn);
  for (let i = 0; i < before.cmds.length; i++) assert.equal(after.cmds[i], before.cmds[i]);
  assert.equal(traceOf(after), before.editable ?? before.drawn);
}

describe('pinned source finishing policy', () => {
  it('compiles cap-based dimensions and rejects unsupported controls and unsafe ranges', () => {
    assert.deepEqual(compileSourceFinish(policy, { ...DEFAULTS, fill: 'solid', module: .5 }, { capHeight: 700 }), { kind: 'solid' });
    const small = compileSourceFinish(policy, { ...DEFAULTS, fill: 'shadow', module: 0 }, { capHeight: 700 });
    const large = compileSourceFinish(policy, { ...DEFAULTS, fill: 'shadow', module: 1 }, { capHeight: 700 });
    assert.deepEqual(small, { kind: 'shadow', dx: 28, dy: -28, gap: 8.4, tolerance: .04, minArea: 8.4 * 8.4 * .25 });
    assert.ok(large.kind === 'shadow');
    assert.equal(large.dx, 84);
    assert.equal(large.dy, -84);
    assert.throws(() => compileSourceFinish(policy, { ...DEFAULTS, fill: 'pixels', module: .5 }, { capHeight: 700 }), /Unsupported/);
    assert.throws(() => compileSourceFinish(policy, { ...DEFAULTS, fill: 'shadow', module: 2 }, { capHeight: 700 }), /coordinates/);
    assert.throws(() => parseSourceFinish({ ...policy, unknown: true }), /Unknown/);
    assert.throws(() => parseSourceFinish({ ...policy, shadow: { ...policy.shadow, gap: .05 } }), /bounds/);
    assert.throws(() => parseSourceFinish({ ...policy, shadow: { ...policy.shadow, depth: [.12, .04] } }), /bounds/);
    assert.throws(() => parseSourceFinish({ ...policy, tolerance: 0 }), /bounds/);
    assert.deepEqual(sourceFinishFills(policy), ['solid', 'shadow']);
    assert.deepEqual(sourceFinishControls(policy), ['fill', 'module']);
    assert.equal(sourceFinishExtends(policy, structuredClone(policy)), true);
    assert.equal(sourceFinishExtends(policy, { ...policy, shadow: { ...policy.shadow, gap: .01 } }), false);
    assert.equal(sourceFinishExtends(policy, { ...policy, tolerance: .05 }), false);
  });

  it('returns the original solid glyph without copying or changing its projection', () => {
    const glyph = drawing([box]);
    assert.equal(finishSourceGlyph(glyph, { kind: 'solid' }), glyph);
  });
});

describe('exact foreground shadow', () => {
  it('adds the literal swept shadow outside its gap and preserves clockwise and anticlockwise faces', () => {
    for (const contour of [box, [...box].reverse()]) {
      const glyph = drawing([contour]), before = JSON.stringify(glyph), finished = finishSourceGlyph(glyph, shadow);
      foregroundUnchanged(glyph, finished);
      assert.equal(JSON.stringify(glyph), before);
      assert.equal(finished.adv, glyph.adv + 60);
      assert.equal(finished.fx, true);
      const ink = shape(sourceFinishPolygons(finished.cmds.slice(glyph.cmds.length), .04));
      assert.equal(ink.has(150, 0), true);
      assert.equal(ink.has(60, -40), true);
      assert.equal(ink.has(105, 50), false);
      assert.equal(ink.has(50, 50), false);
      assert.equal(ink.has(-10, -20), false);
      const all = shape(sourceFinishPolygons(finished.cmds, .04));
      assert.equal(all.has(50, 50), true, 'the opposite shadow winding cannot cancel the original face');
    }
  });

  it('expands filled ink around small counters without creating inverted holes', () => {
    const counter = [{ x: 45, y: 45 }, { x: 45, y: 55 }, { x: 55, y: 55 }, { x: 55, y: 45 }];
    const glyph = drawing([box, counter]), finished = finishSourceGlyph(glyph, shadow);
    foregroundUnchanged(glyph, finished);
    const ink = shape(sourceFinishPolygons(finished.cmds, .04));
    assert.equal(ink.has(50, 50), false, 'a counter narrower than twice the gap keeps its original white space');
    assert.equal(ink.has(40, 50), true);
    assert.equal(ink.has(150, 0), true);
  });

  it('keeps thin straight contours instead of discarding them during flattening', () => {
    const thin = [{ x: 0, y: 0 }, { x: .02, y: 0 }, { x: .02, y: 100 }, { x: 0, y: 100 }];
    const glyph = drawing([thin]);
    assert.equal(sourceFinishPolygons(glyph.cmds, .04)[0].length, 4);
    const finished = finishSourceGlyph(glyph, shadow);
    foregroundUnchanged(glyph, finished);
    assert.equal(shape(sourceFinishPolygons(finished.cmds, .001)).has(.01, 50), true);
  });

  it('keeps real high-contrast, script and punctuation foregrounds exact at both shadow bounds', () => {
    for (const fontId of ['Couture:600', 'Serenade:400']) {
      const ref = mastersForFont(fontId), info = masterInfo(ref);
      assert.ok(ref && info); loadSource(ref);
      const weight = (info.defaultWeight - info.min) / (info.max - info.min);
      const font = buildFont({ ...DEFAULTS, sourceProgram: ref, freeFont: fontId, weight, freeAt: { ...freeAtOf(DEFAULTS), weight } });
      for (const size of [0, 1]) {
        const plan = compileSourceFinish(policy, { ...DEFAULTS, fill: 'shadow', module: size }, { capHeight: font.m.cap });
        for (const ch of "ci.!'") {
          const glyph = font.glyph(ch); assert.ok(glyph?.drawn);
          const finished = finishSourceGlyph(glyph, plan);
          foregroundUnchanged(glyph, finished);
          assert.ok(finished.cmds.length > glyph.cmds.length, `${fontId} ${ch} has visible shadow`);
          for (const c of finished.cmds) for (const n of c.slice(1)) assert.ok(typeof n === 'number' && Number.isFinite(n));
        }
      }
    }
  });
});

describe('source slice opens a gap', () => {
  it('adds a pinned optional capability without changing older finish policies', () => {
    const request = { ...DEFAULTS, fill: 'shadow', module: 1, slice: 1, slicePos: 0, sliceRound: 1 } satisfies typeof DEFAULTS;
    const old = compileSourceFinish(policy, request, { capHeight: 700 });
    const neutral = compileSourceFinish(policy, { ...request, slice: 0 }, { capHeight: 700 });
    assert.deepEqual(old, neutral);
    const plan = compileSourceFinish(sliced, request, { capHeight: 700 });
    assert.deepEqual(plan.slice, { at: 84, gap: 98.00000000000001, rounding: 1, tolerance: .04 });
    assert.deepEqual(sourceFinishBounds(plan), { above: 98.00000000000001, below: 84 });
    assert.deepEqual(sourceFinishDefaults(sliced, policy), { slice: 0, slicePos: .5, sliceRound: 0 });
    assert.deepEqual(sourceFinishDefaults(sliced, sliced), {});
    assert.deepEqual(sourceFinishDefaults(sliced), { fill: 'solid', module: .5, slice: 0, slicePos: .5, sliceRound: 0 });
    assert.equal(sourceFinishExtends(policy, sliced), true);
    assert.equal(sourceFinishExtends(sliced, policy), false);
    assert.equal(sourceFinishExtends(sliced, { ...sliced, slice: { maxGap: .15, position: [.12, .88] } }), false);
    assert.deepEqual(sourceFinishControls(sliced), ['fill', 'module', 'slice', 'slicePos', 'sliceRound']);
    assert.throws(() => parseSourceFinish({ ...policy, slice: { maxGap: .14, position: [0, 1] } }), /bounds/);
    const glyph = drawing([box]);
    assert.strictEqual(finishSourceGlyph(glyph, compileSourceFinish(sliced, DEFAULTS, { capHeight: 700 })), glyph);
  });

  it('leaves the lower ink in place and translates all upper ink without changing Points or advance', () => {
    for (const contour of [box, [...box].reverse()]) {
      const glyph = drawing([contour]), output = finishSourceGlyph(glyph, opening);
      const ink = shape(sourceFinishPolygons(output.cmds, .001));
      assert.equal(ink.has(50, 25), true);
      assert.equal(ink.has(50, 60), false);
      assert.equal(ink.has(50, 75), true);
      assert.equal(ink.has(50, 119), true);
      assert.equal(ink.has(50, 121), false);
      assert.strictEqual(output.editable, glyph.drawn);
      assert.strictEqual(traceOf(output), glyph.drawn);
      assert.equal(output.adv, 180);
    }
  });

  it('joins open counters across the cut and retains overlapping ink with either winding', () => {
    const hole = [{ x: 30, y: 20 }, { x: 30, y: 80 }, { x: 70, y: 80 }, { x: 70, y: 20 }];
    const overlap = box.map(p => ({ x: p.x + 80, y: p.y }));
    for (const contours of [[box, hole], [box, overlap], [[...box].reverse(), [...hole].reverse()]]) {
      const glyph = drawing(contours), before = shape(sourceFinishPolygons(glyph.cmds, .001));
      const output = finishSourceGlyph(glyph, opening), after = shape(sourceFinishPolygons(output.cmds, .001));
      for (const x of [5, 25, 35, 65, 75, 85, 95, 105, 175]) for (const y of [5, 25, 45, 55, 75, 95]) {
        assert.equal(after.has(x, y < 50 ? y : y + 20), before.has(x, y), `${x},${y}`);
      }
      for (const x of [5, 35, 75, 95, 105, 175]) assert.equal(after.has(x, 60), false);
    }
  });

  it('retains tiny cut fragments and small punctuation with no area filter or restoration jump', () => {
    const thin = [{ x: 0, y: 0 }, { x: .002, y: 0 }, { x: .002, y: 100 }, { x: 0, y: 100 }];
    const dot = [{ x: 10, y: 48 }, { x: 12, y: 48 }, { x: 12, y: 52 }, { x: 10, y: 52 }];
    const output = finishSourceGlyph(drawing([thin, dot]), opening), ink = shape(sourceFinishPolygons(output.cmds, .00001));
    assert.equal(ink.has(.001, 25), true);
    assert.equal(ink.has(.001, 95), true);
    assert.equal(ink.has(11, 49), true);
    assert.equal(ink.has(11, 71), true);
    assert.equal(ink.has(11, 60), false);
  });

  it('rounds only newly cut corners and uses every part of the rounding range', () => {
    const glyph = drawing([box]), paths = new Set<string>();
    for (const rounding of [0, .01, .25, .5, .75, 1]) {
      const output = finishSourceGlyph(glyph, { kind: 'solid', slice: { at: 50, gap: 20, rounding, tolerance: .04 } });
      const ink = shape(sourceFinishPolygons(output.cmds, .001));
      paths.add(output.d);
      assert.equal(ink.has(1, 1), true, 'the original bottom corner stays sharp');
      assert.equal(ink.has(1, 119), true, 'the original top corner stays sharp');
      assert.equal(ink.has(50, 25), true);
      assert.equal(ink.has(50, 95), true);
      if (rounding === 1) { assert.equal(ink.has(1, 49), false); assert.equal(ink.has(1, 71), false); }
    }
    assert.equal(paths.size, 6);
  });

  it('retains untouched cubic handles exactly instead of replacing the whole glyph with polygons', () => {
    const curve = [{ x: 0, y: 0, ox: 15, oy: 30 }, { x: 100, y: 0, ix: 85, iy: 30 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const glyph = drawing([curve]), output = finishSourceGlyph(glyph, opening);
    assert.ok(glyph.cmds.some(c => c[0] === 'C' && c[1] === 15 && c[2] === 30));
    assert.ok(output.cmds.some(c => c[0] === 'C' && c[1] === 15 && c[2] === 30 && c[3] === 85 && c[4] === 30 && c[5] === 100 && c[6] === 0));
  });

  it('keeps counters empty when a fillet crosses them or encloses them in its removed corner', () => {
    const centers = [{ x: 85.888671875, y: 44.5068359375 }, { x: 90, y: 48 }];
    for (const center of centers) {
      const hole = [{ x: center.x - .5, y: center.y - .5 }, { x: center.x - .5, y: center.y + .5 },
        { x: center.x + .5, y: center.y + .5 }, { x: center.x + .5, y: center.y - .5 }];
      for (const contours of [[box, hole], [[...box].reverse(), [...hole].reverse()]]) for (const above of [false, true]) {
        const glyph = drawing(above ? contours.map(contour => contour.map(p => ({ x: p.x, y: 100 - p.y }))) : contours);
        const before = shape(sourceFinishPolygons(glyph.cmds, .001));
        for (const rounding of [.25, .5, 1]) {
          const output = finishSourceGlyph(glyph, { kind: 'solid', slice: { at: 50, gap: 20, rounding, tolerance: .04 } });
          const after = shape(sourceFinishPolygons(output.cmds, .001));
          for (const dy of [-.25, 0, .25]) {
            const y = above ? 100 - center.y - dy : center.y + dy;
            assert.equal(before.has(center.x, y), false);
            assert.equal(after.has(center.x, y + (above ? 20 : 0)), false,
              `rounding ${rounding} filled counter at ${center.x},${center.y + dy}`);
          }
        }
      }
    }
  });

  it('cuts a cubic at its exact crossing, including a horizontal tangent at the cut', () => {
    const glyph = drawing([[{ x: 0, y: 0, ox: 0, oy: 100 }, { x: 100, y: 100, ix: 100, iy: 0 }, { x: 150, y: 100 }, { x: 150, y: 0 }]]);
    const output = finishSourceGlyph(glyph, opening), curves = output.cmds.filter(c => c[0] === 'C');
    assert.deepEqual(curves, [['C', 0, 50, 25, 50, 50, 50], ['C', 75, 70, 100, 70, 100, 120]]);
  });

  it('ends cap travel at a counter tangent to the cut instead of rounding across its contact', () => {
    const hole = [{ x: 75, y: 50 }, { x: 80, y: 40 }, { x: 70, y: 40 }];
    const slice = { at: 50, gap: 20, tolerance: .04 };
    for (const contours of [[box, hole], [[...box].reverse(), [...hole].reverse()]]) {
      const glyph = drawing(contours), half = finishSourceGlyph(glyph, { kind: 'solid', slice: { ...slice, rounding: .5 } });
      const full = finishSourceGlyph(glyph, { kind: 'solid', slice: { ...slice, rounding: 1 } });
      assert.notDeepEqual(half.cmds, full.cmds);
      assert.equal(shape(sourceFinishPolygons(full.cmds, .001)).has(75, 45), false);
      assert.strictEqual(traceOf(full), glyph.drawn);
    }
  });

  it('cancels an existing edge along the cut instead of rounding a zero-area retraced tip', () => {
    const contour = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 20, y: 100 }, { x: 20, y: 50 }, { x: 0, y: 50 }];
    const glyph = drawing([contour]);
    for (const rounding of [0, .01, .5, 1]) {
      const output = finishSourceGlyph(glyph, { kind: 'solid', slice: { at: 50, gap: 20, rounding, tolerance: .04 } });
      const ink = shape(sourceFinishPolygons(output.cmds, .001));
      assert.equal(ink.has(5, 45), true);
      assert.equal(ink.has(5, 75), false);
      assert.equal(ink.has(50, 90), true);
    }
  });

  it('solves intermediate rounds on curved marks rather than assuming a full round bounds every smaller setback', () => {
    for (const [fontId, ch, position] of [
      ['Vellum:400', '?', .5], ['Almanac:500', '@', 0], ['Gumdrop:700', '@', .71],
      ['Jotter:400', '&', .5], ['Kernel:500', '?', .71], ['Serenade:400', '?', .71]
    ] satisfies [string, string, number][]) {
      const ref = mastersForFont(fontId), info = masterInfo(ref); assert.ok(ref && info); loadSource(ref);
      const weight = (info.defaultWeight - info.min) / (info.max - info.min);
      const font = buildFont({ ...DEFAULTS, sourceProgram: ref, weight, freeAt: { ...freeAtOf(DEFAULTS), weight } });
      const original = font.glyph(ch); assert.ok(original);
      const paths = new Set<string>();
      for (const rounding of [.01, .25, .5, .75, 1]) {
        const plan = compileSourceFinish(sliced, { ...DEFAULTS, slice: .5, slicePos: position, sliceRound: rounding }, { capHeight: font.m.cap });
        const output = finishSourceGlyph(original, plan);
        assert.strictEqual(traceOf(output), original.drawn);
        assert.equal(output.adv, original.adv);
        assert.notEqual(output.d, original.d);
        paths.add(output.d);
      }
      assert.equal(paths.size, 5, `${fontId} ${ch} changes at every reviewed intermediate rounding value`);
    }
  });
});
