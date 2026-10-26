import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reverseContour, splitSegment } from '../client/lib/pen';
import { buildFont } from '../shared/engine';
import { packNode, type PackedNode } from '../shared/engine/free';
import { cubicAt, subCubic } from '../shared/engine/geom';
import { cleanDrawn, segment, type Drawn, type Node } from '../shared/engine/outline';
import { DEFAULTS, drawnAtOf, freeAtOf, sanitizeParams, type Params } from '../shared/params';
import { adoptProgram } from '../shared/source/adoption';
import { identifyAuthored, rebaseEdits, rebaseReference, transportEdits } from '../shared/source/edit-transport';
import type { MasterSourceRef } from '../shared/source/model';
import { masterInfo } from '../shared/source/master-catalog';
import { PROGRAM_REVISIONS, programForFont, programInfo } from '../shared/source/program-catalog';
import { sourceProgram } from '../shared/source/registry';
import type { MasterSubdivisionData } from '../shared/source/subdivision';
import { loadSource } from '../server/sources';

const from: MasterSourceRef = { kind: 'masters-v1', digest: 'a'.repeat(64), fontId: 'Fixture:400' };
const to: MasterSourceRef = { ...from, digest: 'b'.repeat(64) };
const oldIdentity = { digest: from.digest, glyph: 'H' }, newIdentity = { digest: to.digest, glyph: 'H' };
const original: Drawn = { adv: 160, contours: [[
  { x: 0, y: 0, ox: 40, oy: 80 }, { x: 120, y: 0, ix: 80, iy: 80 },
  { x: 120, y: -60 }, { x: 0, y: -60 },
]] };
const mapping: MasterSubdivisionData = { format: 'master-subdivision-v1', from, to, glyphs: { H: [[
  { segment: 0, t0: 0, t1: .5 }, { segment: 0, t0: .5, t1: 1 },
  { segment: 1, t0: 0, t1: 1 }, { segment: 2, t0: 0, t1: 1 }, { segment: 3, t0: 0, t1: 1 },
]] } };
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
function packed(d: Drawn): PackedNode[][] { return d.contours.map(c => c.map(packNode)); }
function expectCoordinates(actual: Drawn, expected: PackedNode[][]): void {
  const a = packed(actual);
  assert.equal(a.length, expected.length);
  a.forEach((c, ci) => {
    assert.equal(c.length, expected[ci].length);
    c.forEach((n, ni) => {
      const wanted = expected[ci][ni]; assert.equal(n.length, wanted.length);
      n.forEach((value, i) => {
        const expectedValue = wanted[i];
        if (value === null || expectedValue === null) assert.equal(value, expectedValue);
        else near(value, expectedValue);
      });
    });
  });
}
function saved(d: Drawn): Drawn {
  const result = cleanDrawn(JSON.parse(JSON.stringify(d)));
  assert.ok(result); return result;
}
function changedHandles(): Drawn {
  const d = identifyAuthored(original, oldIdentity);
  d.contours[0][0].oy = 104; d.contours[0][1].iy = 72; d.adv = 162;
  return d;
}
function target(): Drawn {
  const d = rebaseReference(original, mapping, 'H'), c = d.contours[0];
  c[0].ox = 17; c[0].oy = 45;
  Object.assign(c[1], { x: 65, y: 62, ix: 43, iy: 61, ox: 81, oy: 57 });
  Object.assign(c[2], { x: 125, ix: 102, iy: 38 });
  return d;
}
const editedHalf: PackedNode[][] = [[
  [0, 0, 0, -20, 20, 52], [60, 66, 40, 70, 80, 62],
  [120, 0, 100, 36, 120, -20], [120, -60, 120, -40, 80, -60], [0, -60, 40, -60, 0, -40],
]];
const movedHalf: PackedNode[][] = [[
  [0, 0, 0, -20, 17, 57], [65, 68, 43, 71, 81, 59],
  [125, 0, 102, 34, 120, -20], [120, -60, 120, -40, 80, -60], [0, -60, 40, -60, 0, -40],
]];
const movedQuarter: PackedNode[][] = [[
  [0, 0, 0, -20, 8.5, 28.5], [30.625, 56.5, 19.25, 46.25, 42, 66.75],
  [65, 68, 54, 69.5, 81, 59], [125, 0, 102, 34, 120, -20],
  [120, -60, 120, -40, 80, -60], [0, -60, 40, -60, 0, -40],
]];
function reversePacked(contours: PackedNode[][]): PackedNode[][] {
  return contours.map(c => c.slice().reverse().map(n => {
    assert.equal(n.length, 6);
    if (n.length !== 6 || n[2] === null || n[3] === null) throw Error('Fixture requires complete handles');
    return [n[0], n[1], n[4], n[5], n[2], n[3]];
  }));
}

describe('saved edits across an exact point-basis revision', () => {
  it('materializes literal cubic halves and line handles with the new point identities', () => {
    const before = structuredClone(original), actual = rebaseReference(original, mapping, 'H');
    expectCoordinates(actual, [[
      [0, 0, 0, -20, 20, 40], [60, 60, 40, 60, 80, 60], [120, 0, 100, 40, 120, -20],
      [120, -60, 120, -40, 80, -60], [0, -60, 40, -60, 0, -40],
    ]]);
    assert.equal(actual.adv, 160);
    actual.contours[0].forEach((node, segment) => assert.deepEqual(node.authored, { ...newIdentity, contour: 0, segment, t: 0, segments: 5 }));
    assert.deepEqual(original, before);
  });

  it('splits deliberately altered handles, then applies each target cubic’s independent control motion', () => {
    const edited = saved(changedHandles()), reference = rebaseReference(original, mapping, 'H');
    const rebased = rebaseEdits(edited, original, mapping, 'H');
    expectCoordinates(rebased, editedHalf);
    assert.equal(rebased.adv, 162);
    expectCoordinates(transportEdits(rebased, reference, target(), newIdentity), movedHalf);
    assert.deepEqual(packNode(edited.contours[0][0]), [0, 0, null, null, 40, 104]);
  });

  it('keeps a Pen subdivision and a reversal exact across rebasing and repeated saved weight changes', () => {
    for (const reverse of [false, true]) {
      const edited = changedHandles(); edited.contours = splitSegment(edited.contours, 0, 0, .25);
      assert.deepEqual(edited.contours[0][1].authored, { ...oldIdentity, contour: 0, segment: 0, t: .25, segments: 4 });
      if (reverse) edited.contours = reverseContour(edited.contours, 0);
      const rebased = rebaseEdits(saved(edited), original, mapping, 'H');
      const firstTarget = target(), reference = rebaseReference(original, mapping, 'H');
      const first = transportEdits(rebased, reference, firstTarget, newIdentity);
      expectCoordinates(first, reverse ? reversePacked(movedQuarter) : movedQuarter);
      const quarter = first.contours[0].find(n => n.authored?.segment === 0 && n.authored.t === .5);
      assert.ok(quarter); assert.equal(quarter.authored?.segments, 5);
      const secondTarget = structuredClone(firstTarget); secondTarget.contours[0][0].oy = 38; secondTarget.contours[0][1].y = 82;
      const second = transportEdits(saved(first), firstTarget, secondTarget, newIdentity);
      const moved = second.contours[0].find(n => n.authored?.segment === 0 && n.authored.t === .5);
      assert.ok(moved); near(moved.x, 30.625); near(moved.y, 56.375);
      near(reverse ? moved.ox! : moved.ix!, 19.25); near(reverse ? moved.oy! : moved.iy!, 42.75);
      near(reverse ? moved.ix! : moved.ox!, 42); near(reverse ? moved.iy! : moved.oy!, 70);
      const returned = transportEdits(saved(second), secondTarget, reference, newIdentity);
      const wanted: PackedNode[][] = [[
        [0, 0, 0, -20, 10, 26], [30, 54, 20, 43.5, 40, 64.5],
        [60, 66, 50, 68, 80, 62], [120, 0, 100, 36, 120, -20],
        [120, -60, 120, -40, 80, -60], [0, -60, 40, -60, 0, -40],
      ]];
      expectCoordinates(returned, reverse ? reversePacked(wanted) : wanted);
    }
  });

  it('gives a saved straight segment real handles before its new basis introduces curvature', () => {
    const line: Drawn = { adv: 160, contours: [original.contours[0].map(({ x, y }) => ({ x, y }))] };
    const reference = rebaseReference(line, mapping, 'H'), destination = structuredClone(reference), c = destination.contours[0];
    c[0].oy = 10; Object.assign(c[1], { y: 30, iy: 20, oy: 20 }); c[2].iy = 10;
    const edited = identifyAuthored(line, oldIdentity); edited.contours[0][0].y = 12;
    const result = transportEdits(rebaseEdits(saved(edited), line, mapping, 'H'), reference, destination, newIdentity);
    expectCoordinates(result, [[
      [0, 12, 0, -12, 20, 20], [60, 36, 40, 28, 80, 24], [120, 0, 100, 12, 120, -20],
      [120, -60, 120, -40, 80, -60], [0, -60, 40, -60, 0, -36],
    ]]);
    const handled = identifyAuthored(line, oldIdentity); handled.contours[0][0].ox = 40; handled.contours[0][0].oy = 36;
    const curved = transportEdits(rebaseEdits(saved(handled), line, mapping, 'H'), reference, destination, newIdentity);
    expectCoordinates(curved, [[
      [0, 0, 0, -20, 20, 28], [75, 43.5, 50, 38, 100, 29], [120, 0, 120, 10, 120, -20],
      [120, -60, 120, -40, 80, -60], [0, -60, 40, -60, 0, -40],
    ]]);
  });
});

function rectangle(left: number, right: number, bottom: number, top: number): Node[] {
  return [{ x: left, y: bottom }, { x: right, y: bottom }, { x: right, y: top }, { x: left, y: top }];
}
const badH: Drawn = { adv: 120, contours: [rectangle(0, 20, 0, 100), rectangle(10, 90, 40, 60), rectangle(80, 100, 0, 100).reverse()] };
const windingMap: MasterSubdivisionData = { format: 'master-subdivision-v1', from, to, glyphs: { H: badH.contours.map((c, ci) => c.map((_, i) => ci === 2
  ? { segment: (c.length - 2 - i + c.length) % c.length, t0: 1, t1: 0 } : { segment: i, t0: 0, t1: 1 })) } };
function windingAt(d: Drawn, x: number, y: number): number {
  let winding = 0;
  for (const c of d.contours) c.forEach((a, i) => {
    const b = c[(i + 1) % c.length], cross = (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y);
    if (a.y <= y && b.y > y && cross > 0) winding++;
    if (a.y > y && b.y <= y && cross < 0) winding--;
  });
  return winding;
}

describe('source winding repairs and deliberate Pen reversals', () => {
  it('repairs the cancelling join in an untouched saved glyph and in a globally reversed saved glyph', () => {
    assert.equal(windingAt(badH, 85, 50), 0);
    const reference = rebaseReference(badH, windingMap, 'H');
    assert.equal(windingAt(reference, 85, 50), 2);
    for (const reverse of [false, true]) {
      const edited = identifyAuthored(badH, oldIdentity);
      if (reverse) for (let ci = 0; ci < edited.contours.length; ci++) edited.contours = reverseContour(edited.contours, ci);
      const rebased = rebaseEdits(saved(edited), badH, windingMap, 'H');
      assert.equal(windingAt(rebased, 15, 50), reverse ? -2 : 2);
      assert.equal(windingAt(rebased, 85, 50), reverse ? -2 : 2);
      assert.ok(rebased.contours.flat().every(n => n.authored?.digest === to.digest));
      const target = structuredClone(reference);
      for (const n of target.contours[2]) { n.x += 7; n.ix! += 7; n.ox! += 7; }
      const moved = transportEdits(rebased, reference, target, newIdentity);
      assert.equal(windingAt(moved, 88, 50), reverse ? -2 : 2);
      assert.ok(moved.contours[2].every(n => n.x === 87 || n.x === 107));
    }
  });

  it('retains a local manual repair without reversing that contour a second time', () => {
    const edited = identifyAuthored(badH, oldIdentity); edited.contours = reverseContour(edited.contours, 2);
    assert.equal(windingAt(edited, 85, 50), 2);
    const rebased = rebaseEdits(saved(edited), badH, windingMap, 'H');
    assert.equal(windingAt(rebased, 15, 50), 2); assert.equal(windingAt(rebased, 85, 50), 2);
    assert.deepEqual(rebased.contours[2].map(n => [n.x, n.y]), [[80, 0], [100, 0], [100, 100], [80, 100]]);
    const reference = rebaseReference(badH, windingMap, 'H'), moved = transportEdits(rebased, reference, structuredClone(reference), newIdentity);
    assert.equal(windingAt(moved, 85, 50), 2);
  });

  it('retains custom contour order when deleted or new points interrupt source-edge correspondence', () => {
    for (const edit of ['deleted', 'inserted']) {
      const edited = identifyAuthored(badH, oldIdentity);
      if (edit === 'deleted') edited.contours[2].splice(1, 1);
      else edited.contours[2].splice(1, 0, { x: 90, y: 120 });
      const order = edited.contours[2].map(n => [n.x, n.y]);
      const rebased = rebaseEdits(saved(edited), badH, windingMap, 'H');
      assert.deepEqual(rebased.contours[2].map(n => [n.x, n.y]), order, edit);
    }
  });
});

function cubic(contour: Node[], i: number) {
  const a = contour[i], b = contour[(i + 1) % contour.length];
  return segment(a, b) ?? [a, { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
    { x: a.x + 2 * (b.x - a.x) / 3, y: a.y + 2 * (b.y - a.y) / 3 }, b];
}
function glyph(params: Params): Drawn {
  const g = buildFont(params).glyph('H'); assert.ok(g?.editable); return g.editable;
}
function expectSameCurves(actual: Drawn, expected: Drawn): void {
  near(actual.adv, expected.adv);
  for (const contour of actual.contours) contour.forEach((n, i) => {
    const origin = n.authored, next = contour[(i + 1) % contour.length].authored;
    assert.ok(origin && next); assert.equal(origin.contour, next.contour);
    const source = expected.contours[origin.contour], anchor = cubicAt(cubic(source, origin.segment), origin.t);
    near(n.x, anchor.x); near(n.y, anchor.y);
    let sourceSegment: number, start: number, end: number;
    if (origin.segment === next.segment) { sourceSegment = origin.segment; start = origin.t; end = next.t; }
    else if (next.segment === (origin.segment + 1) % source.length && next.t === 0) { sourceSegment = origin.segment; start = origin.t; end = 1; }
    else { assert.equal(origin.segment, (next.segment + 1) % source.length); assert.equal(origin.t, 0); sourceSegment = next.segment; start = 1; end = next.t; }
    const controls = subCubic(cubic(source, sourceSegment), Math.min(start, end), Math.max(start, end));
    if (start > end) controls.reverse();
    const b = contour[(i + 1) % contour.length];
    if (n.ox !== undefined && n.oy !== undefined) { near(n.ox, controls[1].x); near(n.oy, controls[1].y); }
    if (b.ix !== undefined && b.iy !== undefined) { near(b.ix, controls[2].x); near(b.iy, controls[2].y); }
  });
}
function oldProgram(fontId: string, digest: string): Params {
  const before = PROGRAM_REVISIONS.findLast(p => p.ref.fontId === fontId && p.data.base.digest === digest), current = programForFont(fontId);
  assert.ok(before && current); assert.notEqual(current.digest, before.ref.digest);
  loadSource(before.ref); loadSource(current);
  const info = masterInfo(before.ref); assert.ok(info);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min);
  const width = before.width ? (before.width.neutral - before.width.min) / (before.width.max - before.width.min) : DEFAULTS.width;
  return { ...DEFAULTS, freeFont: fontId, sourceProgram: before.ref, weight, width, height: .8, rotation: .58, mirror: 'mirrored',
    crossbar: .5, tail: .5, terminalLength: .5, freeAt: { ...freeAtOf(DEFAULTS), weight, width } };
}
const REAL_BASES = [
  ['Cotton:300', 'bbef63cb6315effcfd88971ea84aa20324700567c771b1ddbbc7e6ae215682c4'],
  ['Gumdrop:700', '73a3ea6fabc80057f93f0e61739973da35ed789fa08b1980af73a7e91a7b8d0c'],
] as const;

describe('published Cotton and Gumdrop saved-point adoption', () => {
  it('preserves every curve after Pen splitting/reversal, adoption, new width/weight/features, and another save', () => {
    for (const [fontId, digest] of REAL_BASES) for (const reverse of [false, true]) {
      const p = oldProgram(fontId, digest), original = glyph(p), ci = original.contours.findIndex(c => c.some(n => n.ox !== undefined));
      const ni = original.contours[ci].findIndex(n => n.ox !== undefined);
      let contours = splitSegment(original.contours, ci, ni, .37);
      if (reverse) for (let index = 0; index < contours.length; index++) contours = reverseContour(contours, index);
      const saved = sanitizeParams(JSON.parse(JSON.stringify({ ...p, outlines: { H: { ...original, contours, at: drawnAtOf(p, 'H') } } })));
      const adopted = adoptProgram(saved); assert.ok(adopted);
      for (const [weight, width, crossbar] of [[0, 0, 0], [1, 1, 1]]) {
        const changed = { ...adopted, weight, width, crossbar }, made = glyph(changed), plain = glyph({ ...changed, outlines: {} });
        expectSameCurves(made, plain);
        assert.ok(made.contours.flat().every(n => n.authored?.digest === programInfo(changed.sourceProgram)?.data.base.digest));
        const again = sanitizeParams(JSON.parse(JSON.stringify({ ...changed, outlines: { H: { ...made, at: drawnAtOf(changed, 'H') } } })));
        expectSameCurves(glyph({ ...again, weight: .43, width: .62, crossbar: .27 }), glyph({ ...again, outlines: {}, weight: .43, width: .62, crossbar: .27 }));
      }
    }
  });

  it('retains literal anchor/handle edits at an old node while the native width and crossbar continue changing', () => {
    for (const [fontId, digest] of REAL_BASES) {
      const p = oldProgram(fontId, digest), original = glyph(p), edited = structuredClone(original);
      const ci = edited.contours.findIndex(c => c.some(n => n.ox !== undefined)), ni = edited.contours[ci].findIndex(n => n.ox !== undefined), node = edited.contours[ci][ni];
      assert.ok(node.authored && node.ox !== undefined && node.oy !== undefined); node.x += 7; node.ox += 11; node.oy -= 5;
      const saved = sanitizeParams(JSON.parse(JSON.stringify({ ...p, outlines: { H: { ...edited, at: drawnAtOf(p, 'H') } } })));
      const adopted = adoptProgram(saved); assert.ok(adopted?.sourceProgram);
      const transition = sourceProgram(adopted.sourceProgram)?.transitions.get(digest); assert.ok(transition);
      const ranges = transition.data.glyphs.H[ci], si = ranges.findIndex(r => r.segment === node.authored?.segment && r.t0 === 0);
      assert.ok(si >= 0); const cut = ranges[si].t1;
      const check = (params: Params) => {
        const made = glyph(params), plain = glyph({ ...params, outlines: {} });
        const at = made.contours.flat().find(n => n.authored?.contour === ci && n.authored.segment === si && n.authored.t === 0), baseline = plain.contours[ci][si];
        assert.ok(at && at.ox !== undefined && at.oy !== undefined && baseline.ox !== undefined && baseline.oy !== undefined);
        near(at.x - baseline.x, 7); near(at.y - baseline.y, 0);
        near(at.ox - baseline.ox, 7 + 4 * cut); near(at.oy - baseline.oy, -5 * cut);
        return made;
      };
      const first = { ...adopted, weight: .21, width: .18, crossbar: .78 }, made = check(first);
      const again = sanitizeParams(JSON.parse(JSON.stringify({ ...first, outlines: { H: { ...made, at: drawnAtOf(first, 'H') } } })));
      check({ ...again, weight: .89, width: .83, crossbar: .14 });
    }
  });
});
