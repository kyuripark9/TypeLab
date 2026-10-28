/* Ink traps on sources (`source-traps-v1` in the finish policy): notches carved into the inside corners where strokes
   join, found on the filled ink; a serif's corner and a kink in one stroke's edge passed over; every piece kept
   joined; every style changed and kept within its ink at the ends of Weight; deeper with the slider; the editable
   drawing kept; the gates, defaults, adoption, finishing order and export. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Clipper64, ClipType, FillRule, PolyTree64, type PolyPath64 } from 'clipper2-ts';
import { buildFont } from '../shared/engine';
import { shape } from '../shared/engine/boolean';
import type { Cmd, Pt } from '../shared/engine/types';
import { DEFAULTS, freeAtOf, type Params } from '../shared/params';
import { styleById } from '../shared/content';
import { adoptProgram } from '../shared/source/adoption';
import { sourceSupports } from '../shared/source/capabilities';
import { sourceFinishPolygons, sourceFinishPrecision } from '../shared/source/finish';
import { masterInfo } from '../shared/source/master-catalog';
import { PROGRAM_REVISIONS, programInfo } from '../shared/source/program-catalog';
import type { ProgramSourceRef } from '../shared/source/model';
import { sourceStyleParams } from '../shared/source/style';
import { compileTraps, parseSourceTraps, trapSourceInk } from '../shared/source/traps';
import { loadDesignSources, loadSource } from '../server/sources';
import { buildOTF } from '../server/export';
import { opentype } from '../server/opentype';
import { traceOf } from '../client/lib/pen';

const policy = parseSourceTraps({ format: 'source-traps-v1', depth: .35, mouth: .6, turn: [20, 60], reach: [.01, .04], run: 1.5, apart: .9, tolerance: .1 });
const rectangle = (x: number, y: number, w: number, h: number): Cmd[] => [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
const ink = (cmds: Cmd[]) => shape(sourceFinishPolygons(cmds, .01));
function off(p: Pt, polys: Pt[][]): number {
  let best = Infinity;
  for (const poly of polys) poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], x = b.x - a.x, y = b.y - a.y, l = x * x + y * y;
    const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / l)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y));
  });
  return best;
}
/** A drawing's ink, its overlapping contours joined. */
function united(cmds: Cmd[]): PolyTree64 {
  const clipper = new Clipper64(), tree = new PolyTree64();
  clipper.addSubject(sourceFinishPolygons(cmds, .05).map(p => p.map(q => ({ x: Math.round(q.x * 1e5), y: Math.round(q.y * 1e5) }))));
  clipper.execute(ClipType.Union, FillRule.NonZero, tree);
  return tree;
}
/** How many separate pieces of ink a drawing is in, and how much ink. */
function pieces(cmds: Cmd[]): number {
  let count = 0;
  const visit = (node: PolyTree64 | PolyPath64) => { for (let i = 0; i < node.count; i++) { const child = node.child(i); if (!child.isHole) count++; visit(child); } };
  visit(united(cmds));
  return count;
}
function area(cmds: Cmd[]): number {
  let sum = 0;
  const visit = (node: PolyTree64 | PolyPath64) => {
    for (let i = 0; i < node.count; i++) {
      const child = node.child(i), poly = child.polygon ?? [];
      const signed = poly.reduce((s, a, k) => { const b = poly[(k + 1) % poly.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2e10;
      sum += child.isHole ? -Math.abs(signed) : Math.abs(signed); visit(child);
    }
  };
  visit(united(cmds));
  return sum;
}

const current = [...new Map(PROGRAM_REVISIONS.map(entry => [entry.ref.fontId, entry])).values()];
const before = (fontId: string) => PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === fontId && !entry.data.finish?.traps)!;
function params(ref: ProgramSourceRef, joints = 0): Params {
  const info = masterInfo(ref), width = programInfo(ref)?.width;
  assert.ok(info && width); loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min), neutral = (width.neutral - width.min) / (width.max - width.min);
  const p: Params = { ...DEFAULTS, sourceProgram: ref, freeFont: ref.fontId, weight, width: neutral, joints,
    freeAt: { ...freeAtOf(DEFAULTS), weight, width: neutral, dotSize: .5, joints: 0 } };
  loadDesignSources(p);
  return p;
}

describe('source ink traps', () => {
  it('carves the inside corners where a bar joins a stem, and nothing else', () => {
    const tee = [...rectangle(0, 0, 120, 600), ...rectangle(60, 260, 300, 90)], plan = compileTraps(policy, 1, 700)!;
    const out = trapSourceInk(tee, plan), shaped = ink(out), plain = ink(tee);
    // into each inside corner along its bisector
    for (const [x, y] of [[117, 347], [117, 263]]) { assert.equal(plain.has(x, y), true); assert.equal(shaped.has(x, y), false, `${x} ${y}`); }
    // the stem's outside, the bar's end and the outer corners stay
    for (const [x, y] of [[3, 300], [355, 300], [3, 3], [117, 3], [357, 347]]) assert.equal(shaped.has(x, y), true, `${x} ${y}`);
    assert.equal(pieces(out), 1);
    assert.ok(area(out) < area(tee));
    assert.equal(compileTraps(policy, 0, 700), undefined);
  });

  it('passes over a serif\'s corners, a stroke whose edge only kinks, and a plain stroke', () => {
    const plan = compileTraps(policy, 1, 700)!;
    // a stem standing on a short slab: the slab's top turns back within its own length
    const serifed = [...rectangle(40, 0, 80, 600), ...rectangle(0, 0, 160, 30)];
    assert.equal(trapSourceInk(serifed, plan), serifed);
    // a stem with its waist drawn in: the circles from the kink reach the same far side
    const waisted: Cmd[] = [['M', 0, 0], ['L', 100, 0], ['L', 100, 600], ['L', 0, 600], ['L', 18, 300], ['Z']];
    assert.equal(trapSourceInk(waisted, plan), waisted);
    const stem = rectangle(0, 0, 100, 600);
    assert.equal(trapSourceInk(stem, plan), stem);
  });

  it('keeps every piece joined, making a notch shallower where it would cut a join through', () => {
    const deep = compileTraps(parseSourceTraps({ ...policy, depth: .9, mouth: 2 }), 1, 700)!;
    const tee = [...rectangle(0, 0, 120, 600), ...rectangle(60, 280, 300, 40)], out = trapSourceInk(tee, deep);
    assert.equal(pieces(out), 1);
  });

  it('is pinned in every current program, offered there alone, and starts at none', () => {
    for (const entry of current) {
      assert.deepEqual(entry.data.finish?.traps, policy, entry.ref.fontId);
      const p = params(entry.ref), older = params(before(entry.ref.fontId).ref);
      assert.equal(sourceSupports(p, 'joints'), true);
      assert.equal(sourceSupports(older, 'joints'), false);
      assert.deepEqual(buildFont(p).glyph('k')?.cmds, buildFont(older).glyph('k')?.cmds, `${entry.ref.fontId} untrapped as before`);
    }
    // a style starts with none, whatever its preset's legacy value
    const style = styleById('squircle'); assert.ok(style && style.params.joints > 0);
    const squircle = sourceStyleParams(style); assert.ok(squircle);
    assert.equal(squircle.joints, 0); assert.equal(squircle.freeAt.joints, 0);
  });

  it('starts a design adopting it at none, its letters as they were', () => {
    const entry = current.find(e => e.ref.fontId === 'Mainline:600')!, old = before('Mainline:600');
    const saved: Params = { ...params(old.ref), joints: .7, glyphs: { k: { joints: .4 } } };
    const adopted = adoptProgram(saved)!;
    assert.deepEqual(adopted.sourceProgram, entry.ref);
    assert.equal(adopted.joints, 0); assert.equal(adopted.freeAt.joints, 0); assert.equal(adopted.glyphs.k?.joints, undefined);
    loadDesignSources(adopted);
    for (const ch of 'kH') assert.deepEqual(buildFont(adopted).glyph(ch)?.cmds, buildFont(saved).glyph(ch)?.cmds);
  });

  it('changes letters in every style at both ends of Weight, within their ink and in one piece each', () => {
    for (const entry of current) {
      for (const weight of [0, 1]) {
        const p = { ...params(entry.ref), weight }, plain = buildFont(p), trapped = buildFont({ ...p, joints: 1 });
        let changed = 0;
        for (const ch of 'HEkMvAKyn') {
          const a = plain.glyph(ch), b = trapped.glyph(ch), what = `${entry.ref.fontId} ${ch} ${weight}`;
          if (!a?.cmds.length) continue;
          assert.ok(b && b.cmds.every(c => c.slice(1).every(n => Number.isFinite(n))), what);
          assert.equal(b.adv, a.adv, what);
          if (JSON.stringify(b.cmds) === JSON.stringify(a.cmds)) continue;
          changed++;
          assert.ok(area(b.cmds) < area(a.cmds), what);
          const outline = sourceFinishPolygons(a.cmds, .05), inside = shape(outline);
          for (const poly of sourceFinishPolygons(b.cmds, .05)) for (const q of poly.filter((_, i) => i % 5 === 0)) {
            // within the ink, or on its edge
            assert.ok(inside.has(q.x, q.y) || off(q, outline) < .6, `${what}: ink outside the letter at ${q.x} ${q.y}`);
          }
          assert.equal(pieces(b.cmds), pieces(a.cmds), `${what}: pieces`);
        }
        assert.ok(changed >= 3, `${entry.ref.fontId} ${weight}: traps in ${changed} letters`);
      }
    }
  });

  it('cuts deeper as the slider rises, keeps the editable drawing, and finishes before the fills', () => {
    const p = params(current.find(e => e.ref.fontId === 'Mainline:600')!.ref);
    const plain = buildFont(p).glyph('k')!, half = buildFont({ ...p, joints: .5 }).glyph('k')!, full = buildFont({ ...p, joints: 1 }).glyph('k')!;
    assert.ok(area(full.cmds) < area(half.cmds) && area(half.cmds) < area(plain.cmds));
    assert.deepEqual(traceOf(full), plain.editable ?? plain.drawn);
    for (const fill of ['outline', 'inline', 'pixels'] as const) {
      assert.notDeepEqual(buildFont({ ...p, fill, joints: 1 }).glyph('k')?.cmds, buildFont({ ...p, fill }).glyph('k')?.cmds, fill);
    }
  });

  it('exports as previewed, with fractional points', () => {
    const p = { ...params(current.find(e => e.ref.fontId === 'Mainline:600')!.ref), joints: .8 }, preview = buildFont(p).glyph('k')!;
    assert.equal(sourceFinishPrecision(programInfo(p.sourceProgram)!.data.finish!, p), 'traps');
    const bytes = buildOTF(p, 'Ink trap proof'), font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const installed = font.charToGlyph('k');
    assert.equal(installed.advanceWidth, Math.round(preview.adv));
    assert.equal(installed.path.commands.length, preview.cmds.length);
    installed.path.commands.forEach((actual, i) => {
      const expected = preview.cmds[i];
      assert.equal(actual.type, expected[0]);
      if ('x' in actual && (expected[0] === 'M' || expected[0] === 'L')) assert.ok(Math.abs(actual.x - expected[1]) < .01 && Math.abs(actual.y - expected[2]) < .01);
    });
  });

  it('rejects policies outside their bounds', () => {
    assert.throws(() => parseSourceTraps({ ...policy, depth: 0 }), /dimension/);
    assert.throws(() => parseSourceTraps({ ...policy, turn: [60, 20] }), /interval/);
    assert.throws(() => parseSourceTraps({ ...policy, reach: [.01] }), /interval/);
    assert.throws(() => parseSourceTraps({ ...policy, extra: 1 }), /Unknown/);
    assert.throws(() => parseSourceTraps({ ...policy, format: 'source-traps-v2' }), /Unsupported/);
  });
});
