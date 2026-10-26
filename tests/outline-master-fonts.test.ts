import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reverseContour, splitSegment } from '../client/lib/pen';
import { cubicAt, subCubic } from '../shared/engine/geom';
import type { Drawn, Node } from '../shared/engine/outline';
import { identifyAuthored, transportEdits } from '../shared/source/edit-transport';
import { MASTER_REVISIONS } from '../shared/source/master-catalog';
import { correspondenceCurve, decodeOutlineMasterMap, rebaseOutlineEdits, sourceInterval } from '../shared/source/outline-master-map';
import { compileOutlineMasterMap, loadOriginalMaster } from '../tools/authored/build-outline-maps';

const near = (a: number, b: number, label: string) => assert.ok(Math.abs(a - b) < 1e-7, `${label}: ${a} != ${b}`);
function sameCurve(actual: Node[], expected: Node[], line: boolean, label: string) {
  for (const i of line ? [0, 3] : [0, 1, 2, 3]) {
    near(actual[i].x, expected[i].x, label + ' x'); near(actual[i].y, expected[i].y, label + ' y');
  }
  if (line) {
    const a = expected[0], b = expected[3], dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    let previous = -Infinity;
    for (const p of actual) {
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
      assert.ok(t >= previous - 1e-9 && t >= -1e-9 && t <= 1 + 1e-9, label + ' monotone line');
      near(p.x, a.x + dx * t, label + ' line x'); near(p.y, a.y + dy * t, label + ' line y'); previous = t;
    }
  }
}
function fixture(style: string) {
  const { info, source, neutral, masters } = loadOriginalMaster(style), data = compileOutlineMasterMap(info, source, neutral);
  return { info, source, masters, map: decodeOutlineMasterMap(data, { from: { ref: info.source, font: source }, to: { ref: info.ref, masters } }) };
}

describe('published original outline correspondence', () => {
  it('preserves every original curve and advance across all 22 first-master bases', () => {
    let glyphs = 0;
    for (const style of new Set(MASTER_REVISIONS.map(m => m.ref.fontId.split(':')[0]))) {
      const { info, source, map } = fixture(style);
      for (const [ch, binding] of Object.entries(map.data.glyphs)) {
        const original = source.glyphs[ch], label = `${style} ${ch}`;
        assert.ok(original.contours.every(c => c.length > 2), label + ' has unambiguous directed edges');
        const tagged = identifyAuthored(original, { digest: info.source.digest, glyph: ch });
        const result = rebaseOutlineEdits(tagged, map, ch); assert.ok(result, label);
        near(result.reference.adv + result.advanceResidual, original.adv, label + ' advance');
        for (const contour of binding.contours) {
          const actual: Node[] = result.drawing.contours[contour.source];
          assert.equal(actual.length, contour.spans.length, label + ' every common span');
          for (const span of contour.spans) {
            const index = actual.findIndex(n => n.authored?.segment === span.target.segment && Math.abs(n.authored.t - span.target.t0) < 1e-10);
            assert.ok(index >= 0, label + ' target segment identity');
            const node = actual[index]; assert.equal(node.authored?.digest, info.ref.digest);
            const curve = correspondenceCurve(result.drawing, contour.source, { segment: index, t0: 0, t1: 1 });
            const expected = correspondenceCurve(original, contour.source, sourceInterval(span));
            sameCurve(curve, expected, span.kind === 'curve' && span.parameter === 'line-distance', label);
          }
        }
        glyphs++;
      }
    }
    assert.equal(glyphs, 2790);
  });

  it('preserves a real parenthesis Pen split and local edit through reversal and later master motion', () => {
    const { info, source, masters, map } = fixture('Bulwark'), ch = '(', parameter = .309394;
    const tagged = identifyAuthored(source.glyphs[ch], { digest: info.source.digest, glyph: ch });
    const edited: Drawn = { ...tagged, contours: splitSegment(tagged.contours, 0, 0, .37) };
    edited.contours[0][1].x += 11; edited.contours[0][1].y -= 4;
    const target = masters.masters.find(m => m.weight === 600)?.font.glyphs[ch]; assert.ok(target);
    for (const reversed of [false, true]) {
      const input = reversed ? { ...edited, contours: reverseContour(edited.contours, 0) } : edited;
      const result = rebaseOutlineEdits(input, map, ch); assert.ok(result);
      const split = result.drawing.contours[0].find(n => n.authored?.segment === 0 && Math.abs(n.authored.t - parameter) < 1e-10); assert.ok(split);
      near(split.x, edited.contours[0][1].x, 'edited anchor x'); near(split.y, edited.contours[0][1].y, 'edited anchor y');
      const actual = transportEdits(result.drawing, result.reference, target, { digest: info.ref.digest, glyph: ch });
      const moved = actual.contours[0].find(n => n.authored?.segment === 0 && Math.abs(n.authored.t - parameter) < 1e-10); assert.ok(moved);
      const before = cubicAt(correspondenceCurve(result.reference, 0, { segment: 0, t0: 0, t1: 1 }), parameter);
      const after = cubicAt(correspondenceCurve(target, 0, { segment: 0, t0: 0, t1: 1 }), parameter);
      near(moved.x, split.x + after.x - before.x, 'master anchor x'); near(moved.y, split.y + after.y - before.y, 'master anchor y');
      const reopened = transportEdits(JSON.parse(JSON.stringify(actual)), target, result.reference, { digest: info.ref.digest, glyph: ch });
      for (let i = 0; i < reopened.contours[0].length; i++) sameCurve(
        correspondenceCurve(reopened, 0, { segment: i, t0: 0, t1: 1 }),
        correspondenceCurve(result.drawing, 0, { segment: i, t0: 0, t1: 1 }), false, 'reopen round trip');
    }
  });

  it('preserves Cathedral’s old backslash knee and advance while its first master supplies later motion', () => {
    const { info, source, masters, map } = fixture('Cathedral'), ch = '\\';
    const tagged = identifyAuthored(source.glyphs[ch], { digest: info.source.digest, glyph: ch });
    const result = rebaseOutlineEdits(tagged, map, ch); assert.ok(result);
    assert.equal(result.advanceResidual, -458);
    assert.equal(result.drawing.contours[0].length, 9);
    assert.equal(result.reference.contours[0].length, 8);
    const knee = result.drawing.contours[0][1], t = .22060494679065856;
    near(knee.x, 459, 'old knee x'); near(knee.y, 651, 'old knee y'); near(knee.authored?.t ?? NaN, t, 'mapped terminal parameter');
    const target = masters.masters.find(m => m.weight === 500)?.font.glyphs[ch]; assert.ok(target);
    const actual = transportEdits(result.drawing, result.reference, target, { digest: info.ref.digest, glyph: ch });
    const before = subCubic(correspondenceCurve(result.reference, 0, { segment: 0, t0: 0, t1: 1 }), 0, t);
    const after = subCubic(correspondenceCurve(target, 0, { segment: 0, t0: 0, t1: 1 }), 0, t);
    near(actual.contours[0][1].x, knee.x + after[3].x - before[3].x, 'later knee x');
    near(actual.contours[0][1].y, knee.y + after[3].y - before[3].y, 'later knee y');
  });
});
