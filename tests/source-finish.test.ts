/* Finishing changes only output ink; the authored face and its editable projection remain exact. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFont, type Glyph } from '../shared/engine';
import { shape } from '../shared/engine/boolean';
import type { Drawn } from '../shared/engine/outline';
import { DEFAULTS, freeAtOf } from '../shared/params';
import { masterInfo, mastersForFont } from '../shared/source/master-catalog';
import { compileSourceFinish, finishSourceGlyph, parseSourceFinish, sourceFinishControls, sourceFinishExtends, sourceFinishFills, sourceFinishPolygons, type SourceFinishPlan } from '../shared/source/finish';
import { loadSource } from '../server/sources';
import { traceOf } from '../client/lib/pen';

const policy = parseSourceFinish({ format: 'source-finish-v1', tolerance: .04, shadow: { depth: [.04, .12], gap: .012, minAreaRatio: .25 } });
const shadow: SourceFinishPlan = { kind: 'shadow', dx: 60, dy: -60, gap: 10, tolerance: .04, minArea: 0 };
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
    assert.deepEqual(compileSourceFinish(policy, { fill: 'solid', module: .5 }, { capHeight: 700 }), { kind: 'solid' });
    const small = compileSourceFinish(policy, { fill: 'shadow', module: 0 }, { capHeight: 700 });
    const large = compileSourceFinish(policy, { fill: 'shadow', module: 1 }, { capHeight: 700 });
    assert.deepEqual(small, { kind: 'shadow', dx: 28, dy: -28, gap: 8.4, tolerance: .04, minArea: 8.4 * 8.4 * .25 });
    assert.ok(large.kind === 'shadow');
    assert.equal(large.dx, 84);
    assert.equal(large.dy, -84);
    assert.throws(() => compileSourceFinish(policy, { fill: 'pixels', module: .5 }, { capHeight: 700 }), /Unsupported/);
    assert.throws(() => compileSourceFinish(policy, { fill: 'shadow', module: 2 }, { capHeight: 700 }), /coordinates/);
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
        const plan = compileSourceFinish(policy, { fill: 'shadow', module: size }, { capHeight: font.m.cap });
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
