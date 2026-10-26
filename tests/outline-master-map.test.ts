import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeFreeFont, packNode, type FreeFontData } from '../shared/engine/free';
import { cubicAt } from '../shared/engine/geom';
import type { Drawn, Node } from '../shared/engine/outline';
import { reverseContour, splitSegment } from '../client/lib/pen';
import { identifyAuthored, transportEdits } from '../shared/source/edit-transport';
import { decodeWeightMasters } from '../shared/source/masters';
import type { MasterSourceRef, OutlineSourceRef } from '../shared/source/model';
import { decodeOutlineMasterMap, parseOutlineMasterMap, rebaseOutlineEdits, type OutlineMasterMapData } from '../shared/source/outline-master-map';

const from: OutlineSourceRef = { kind: 'outline-v1', digest: 'a'.repeat(64), fontId: 'Example:400' };
const to: MasterSourceRef = { kind: 'masters-v1', digest: 'b'.repeat(64), fontId: from.fontId };
const metadata: FreeFontData = { id: from.fontId, family: 'Example', designers: [], copyright: '', license: '', licenseUrl: '', cap: 700, xh: 500, space: 200, glyphs: {} };
const original: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0, null, null, 0, 100], [100, 0, 100, 100], [100, -100]]]] } };
const subdivided: FreeFontData = { ...metadata, glyphs: { A: [120, [[
  [0, 0, 100 / 3, -100 / 3, 0, 50], [50, 75, 25, 75, 75, 75], [100, 0, 100, 50, 100, -100 / 3],
  [100, -100, 100, -200 / 3, 200 / 3, -200 / 3],
]]] } };
const interval = (segment: number, t0 = 0, t1 = 1) => ({ segment, t0, t1 });
const definition: OutlineMasterMapData = { format: 'outline-master-map-v1', from, to, glyphs: { A: {
  relation: { kind: 'exact' }, contours: [{ source: 0, target: 0, spans: [
    { kind: 'curve', source: interval(0, 0, .5), target: interval(0), parameter: 'curve' },
    { kind: 'curve', source: interval(0, .5, 1), target: interval(1), parameter: 'curve' },
    { kind: 'curve', source: interval(1), target: interval(2), parameter: 'curve' },
    { kind: 'curve', source: interval(2), target: interval(3), parameter: 'curve' },
  ] }],
} } };
function decode(data = definition, source = original, neutral = subdivided) {
  return decodeOutlineMasterMap(parseOutlineMasterMap(data), { from: { ref: from, font: decodeFreeFont(source) },
    to: { ref: to, masters: decodeWeightMasters({ format: 'weight-masters-v1', source: from, defaultWeight: 400, provenance: [], notes: [],
      masters: [{ weight: 400, data: neutral }, { weight: 600, data: neutral }] }) } });
}
function move(d: Drawn, dx: number): Drawn {
  return { ...d, contours: d.contours.map(c => c.map(n => ({ ...n, x: n.x + dx,
    ...(n.ix === undefined ? {} : { ix: n.ix + dx }), ...(n.ox === undefined ? {} : { ox: n.ox + dx }) }))) };
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

describe('original outline to first master correspondence', () => {
  it('subdivides saved cubic edits exactly and assigns actual master segment identities', () => {
    const map = decode(), edited = identifyAuthored(move(map.source.glyphs.A, 7), { digest: from.digest, glyph: 'A' });
    const result = rebaseOutlineEdits(edited, map, 'A'); assert.ok(result);
    assert.deepEqual(result.drawing.contours[0].map(n => [n.x, n.y]), [[7, 0], [57, 75], [107, 0], [107, -100]]);
    assert.deepEqual(result.drawing.contours[0].map(n => n.authored?.segment), [0, 1, 2, 3]);
    assert.ok(result.drawing.contours[0].every(n => n.authored?.digest === to.digest));
    const shifted = transportEdits(result.drawing, result.reference, move(result.reference, 20), { digest: to.digest, glyph: 'A' });
    assert.deepEqual(shifted.contours[0].map(n => [n.x, n.y]), [[27, 0], [77, 75], [127, 0], [127, -100]]);
  });

  it('keeps a declared neutral repair as a saved residual and uses the neutral master as the motion baseline', () => {
    const font = decodeFreeFont(subdivided), shifted = move(font.glyphs.A, 10);
    const neutral = { ...subdivided, glyphs: { A: [130, shifted.contours.map(c => c.map(packNode))] } } satisfies FreeFontData;
    const data = structuredClone(definition); data.glyphs.A.relation = { kind: 'repaired', reason: 'Reviewed neutral translation' };
    const map = decode(data, original, neutral), edited = identifyAuthored(map.source.glyphs.A, { digest: from.digest, glyph: 'A' });
    const result = rebaseOutlineEdits(edited, map, 'A'); assert.ok(result);
    assert.equal(result.advanceResidual, -10);
    near(result.drawing.contours[0][0].x, 0);
    near(result.reference.contours[0][0].x, 10);
    const moved = transportEdits(result.drawing, result.reference, move(result.reference, 20), { digest: to.digest, glyph: 'A' });
    near(moved.contours[0][0].x, 20);
    assert.throws(() => decode(definition, original, neutral), /Undeclared neutral repair/);
  });

  it('adds a master cut inside an edited Pen split in either contour direction', () => {
    const map = decode(), tagged = identifyAuthored(map.source.glyphs.A, { digest: from.digest, glyph: 'A' });
    const edited = { ...tagged, contours: splitSegment(tagged.contours, 0, 0, .3) };
    edited.contours[0][1].x += 5; edited.contours[0][1].y += 7;
    for (const reversed of [false, true]) {
      const result = rebaseOutlineEdits(reversed ? { ...edited, contours: reverseContour(edited.contours, 0) } : edited, map, 'A'); assert.ok(result);
      assert.equal(result.drawing.contours[0].length, 5);
      const saved = result.drawing.contours[0].find(n => n.authored?.segment === 0 && Math.abs(n.authored.t - .6) < 1e-10); assert.ok(saved);
      near(saved.x, 26.6); near(saved.y, 70);
      const added = result.drawing.contours[0].find(n => n.authored?.segment === 1 && n.authored.t === 0); assert.ok(added);
      near(added.x, 17775 / 343); near(added.y, 26600 / 343);
    }
  });

  it('duplicates an edited source point for an explicit collapsed slot, including reversed contours', () => {
    const a: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0], [100, 0], [0, 100]]]] } };
    const b: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0], [100, 0], [100, 0], [0, 100]]]] } };
    const data: OutlineMasterMapData = { ...definition, glyphs: { A: { relation: { kind: 'exact' }, contours: [{ source: 0, target: 0, spans: [
      { kind: 'curve', source: interval(0), target: interval(0), parameter: 'curve' },
      { kind: 'collapsed', source: { segment: 1, t: 0 }, target: interval(1) },
      { kind: 'curve', source: interval(1), target: interval(2), parameter: 'curve' },
      { kind: 'curve', source: interval(2), target: interval(3), parameter: 'curve' },
    ] }] } } };
    const map = decode(data, a, b), base = identifyAuthored(move(map.source.glyphs.A, 7), { digest: from.digest, glyph: 'A' });
    for (const reversed of [false, true]) {
      const edited = reversed ? { ...base, contours: reverseContour(base.contours, 0) } : base;
      const result = rebaseOutlineEdits(edited, map, 'A'); assert.ok(result);
      assert.deepEqual(result.drawing.contours[0].map(n => n.authored?.segment), reversed ? [3, 2, 1, 0] : [0, 1, 2, 3]);
      assert.equal(result.drawing.contours[0].filter(n => n.x === 107 && n.y === 0).length, 2);
      const target = structuredClone(result.reference); target.contours[0][2].y = 20;
      const actual = transportEdits(result.drawing, result.reference, target, { digest: to.digest, glyph: 'A' });
      const opened = actual.contours[0].find(n => n.authored?.segment === 2); assert.ok(opened);
      near(opened.x, 107); near(opened.y, 20);
    }
  });

  it('maps a saved linear split to the matching location on an eased master line', () => {
    const a: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0], [100, 0], [0, 100]]]] } };
    const b: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0, 0, 0, 0, 0], [100, 0, 100, 0, 100, 0], [0, 100, 0, 100, 0, 100]]]] } };
    const data: OutlineMasterMapData = { ...definition, glyphs: { A: { relation: { kind: 'exact' }, contours: [{ source: 0, target: 0,
      spans: [0, 1, 2].map(i => ({ kind: 'curve', source: interval(i), target: interval(i), parameter: 'line-distance' })) }] } } };
    const map = decode(data, a, b), edited = identifyAuthored(map.source.glyphs.A, { digest: from.digest, glyph: 'A' });
    const point: Node = { x: 25, y: 0, authored: { digest: from.digest, glyph: 'A', contour: 0, segment: 0, t: .25, segments: 3 } };
    edited.contours[0].splice(1, 0, point);
    const result = rebaseOutlineEdits(edited, map, 'A'); assert.ok(result);
    const origin = result.drawing.contours[0][1].authored; assert.ok(origin);
    assert.ok(origin.t > .32 && origin.t < .33);
    near(cubicAt([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }], origin.t).x, 25);
  });

  it('keeps collapsed slots in cyclic target order across the contour seam', () => {
    const a: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0], [100, 0], [0, 100]]]] } };
    const b: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0], [0, 0], [100, 0], [0, 100], [0, 0]]]] } };
    const data: OutlineMasterMapData = { ...definition, glyphs: { A: { relation: { kind: 'exact' }, contours: [{ source: 0, target: 0, spans: [
      { kind: 'collapsed', source: { segment: 0, t: 0 }, target: interval(0) },
      { kind: 'curve', source: interval(0), target: interval(1), parameter: 'curve' },
      { kind: 'curve', source: interval(1), target: interval(2), parameter: 'curve' },
      { kind: 'curve', source: interval(2), target: interval(3), parameter: 'curve' },
      { kind: 'collapsed', source: { segment: 0, t: 0 }, target: interval(4) },
    ] }] } } };
    const map = decode(data, a, b), base = identifyAuthored(map.source.glyphs.A, { digest: from.digest, glyph: 'A' });
    for (const reversed of [false, true]) {
      const edited = reversed ? { ...base, contours: reverseContour(base.contours, 0) } : base;
      const result = rebaseOutlineEdits(edited, map, 'A'); assert.ok(result);
      assert.deepEqual(result.drawing.contours[0].map(n => n.authored?.segment), reversed ? [3, 2, 1, 0, 4] : [4, 0, 1, 2, 3]);
    }
  });

  it('recognizes a collapsed slot recorded at the preceding segment endpoint', () => {
    const a: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0], [100, 0], [0, 100]]]] } };
    const b: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0], [100, 0], [100, 0], [0, 100]]]] } };
    const data: OutlineMasterMapData = { ...definition, glyphs: { A: { relation: { kind: 'exact' }, contours: [{ source: 0, target: 0, spans: [
      { kind: 'curve', source: interval(0), target: interval(0), parameter: 'curve' },
      { kind: 'collapsed', source: { segment: 0, t: 1 }, target: interval(1) },
      { kind: 'curve', source: interval(1), target: interval(2), parameter: 'curve' },
      { kind: 'curve', source: interval(2), target: interval(3), parameter: 'curve' },
    ] }] } } };
    const map = decode(data, a, b), base = identifyAuthored(map.source.glyphs.A, { digest: from.digest, glyph: 'A' });
    for (const reversed of [false, true]) {
      const result = rebaseOutlineEdits(reversed ? { ...base, contours: reverseContour(base.contours, 0) } : base, map, 'A'); assert.ok(result);
      assert.deepEqual(result.drawing.contours[0].map(n => n.authored?.segment), reversed ? [3, 2, 1, 0] : [0, 1, 2, 3]);
    }
  });

  it('does not turn straight-line parameter differences into later curved handle edits', () => {
    const a: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0], [100, 0], [0, 100]]]] } };
    const b: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0, 0, 0, 0, 0], [100, 0, 100, 0, 100, 0], [0, 100, 0, 100, 0, 100]]]] } };
    const data: OutlineMasterMapData = { ...definition, glyphs: { A: { relation: { kind: 'exact' }, contours: [{ source: 0, target: 0,
      spans: [0, 1, 2].map(i => ({ kind: 'curve', source: interval(i), target: interval(i), parameter: 'line-distance' })) }] } } };
    const map = decode(data, a, b), base = identifyAuthored(map.source.glyphs.A, { digest: from.digest, glyph: 'A' });
    const result = rebaseOutlineEdits(base, map, 'A'); assert.ok(result);
    const target = structuredClone(result.reference); target.contours[0][0].oy = 100; target.contours[0][1].iy = 100;
    const actual = transportEdits(result.drawing, result.reference, target, { digest: to.digest, glyph: 'A' });
    near(actual.contours[0][0].ox ?? NaN, 0); near(actual.contours[0][0].oy ?? NaN, 100);
    near(actual.contours[0][1].ix ?? NaN, 100); near(actual.contours[0][1].iy ?? NaN, 100);
    const edited = structuredClone(base); edited.contours[0][0].ox = 20; edited.contours[0][0].oy = 30;
    const curved = rebaseOutlineEdits(edited, map, 'A'); assert.ok(curved);
    near(curved.drawing.contours[0][0].ox ?? NaN, 20); near(curved.drawing.contours[0][0].oy ?? NaN, 30);
  });

  it('rejects missing coverage, undeclared repair, and implicit zero-length spans', () => {
    const gap = structuredClone(definition); gap.glyphs.A.contours[0].spans.pop();
    assert.throws(() => decode(gap), /traversal|cover/);
    const zero = structuredClone(definition), span = zero.glyphs.A.contours[0].spans[0];
    assert.ok(span.kind === 'curve'); span.source.t1 = span.source.t0;
    assert.throws(() => decode(zero), /collapsed slot/);
    assert.throws(() => decode({ ...definition, glyphs: {} }), /every nonempty original glyph/);
    const two: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0], [100, 0]]]] } };
    const ambiguous = { ...definition, glyphs: { A: { relation: { kind: 'exact' }, contours: [{ source: 0, target: 0,
      spans: [0, 1].map(i => ({ kind: 'curve', source: interval(i), target: interval(i), parameter: 'curve' })) }] } } } satisfies OutlineMasterMapData;
    assert.throws(() => decode(ambiguous, two, two), /directed edge provenance/);
  });
});
