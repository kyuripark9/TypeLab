/* Inline and Wire on sources (`source-inline-v1`, `source-wire-v1` in the finish policy): a line cut down the middle
   of each stroke, found from the filled ink, through joins and short of stroke ends and corners, a rim kept either
   side and hairlines and dots left whole; each contour as a ring, crossings and all; every style at both ends of Size
   and Weight; the editable drawing kept and a Points edit followed; the gates, the Adjust tab, errors and export. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFont } from '../shared/engine';
import { shape } from '../shared/engine/boolean';
import type { Cmd, Pt } from '../shared/engine/types';
import { DEFAULTS, drawnAtOf, freeAtOf, type Params } from '../shared/params';
import { TRAITS } from '../shared/traits';
import { sourceAllows } from '../shared/source/capabilities';
import { sourceEffectMessage, SourceEffectError } from '../shared/source/effect-error';
import { sourceFinishPolygons, sourceFinishPrecision } from '../shared/source/finish';
import { compileInline, compileWire, inlineSourceInk, parseSourceInline, parseSourceWire, wireSourceInk } from '../shared/source/inline';
import { masterInfo } from '../shared/source/master-catalog';
import { PROGRAM_REVISIONS, programInfo } from '../shared/source/program-catalog';
import type { ProgramSourceRef } from '../shared/source/model';
import { sourceTraitOptions } from '../shared/source/trait-recipes';
import { loadDesignSources, loadSource } from '../server/sources';
import { buildOTF } from '../server/export';
import { opentype } from '../server/opentype';
import { traceOf } from '../client/lib/pen';

const inline = parseSourceInline({ format: 'source-inline-v1', width: [.12, .45], angle: [95, 150], rim: .006, tolerance: .1 });
const wire = parseSourceWire({ format: 'source-wire-v1', line: [.006, .04], tolerance: .1 });
const rectangle = (x: number, y: number, w: number, h: number, turn = 1): Cmd[] => turn > 0
  ? [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']]
  : [['M', x, y], ['L', x, y + h], ['L', x + w, y + h], ['L', x + w, y], ['Z']];
const ink = (cmds: Cmd[]) => shape(sourceFinishPolygons(cmds, .01));
const contours = (cmds: Cmd[]) => cmds.filter(c => c[0] === 'M').length;
function off(p: Pt, polys: Pt[][]): number {
  let best = Infinity;
  for (const poly of polys) poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], x = b.x - a.x, y = b.y - a.y, l = x * x + y * y;
    const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / l)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y));
  });
  return best;
}

const current = [...new Map(PROGRAM_REVISIONS.map(entry => [entry.ref.fontId, entry])).values()];
const before = (fontId: string) => PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === fontId && !entry.data.finish?.inline)!;
function params(ref: ProgramSourceRef, fill: Params['fill'] = 'solid', module = .5): Params {
  const info = masterInfo(ref), width = programInfo(ref)?.width;
  assert.ok(info && width); loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min), neutral = (width.neutral - width.min) / (width.max - width.min);
  const p: Params = { ...DEFAULTS, sourceProgram: ref, freeFont: ref.fontId, weight, width: neutral, fill, module,
    freeAt: { ...freeAtOf(DEFAULTS), weight, width: neutral, dotSize: .5 } };
  loadDesignSources(p);
  return p;
}

describe('source inline', () => {
  it('cuts one line down a stem, short of its ends, with the rim kept either side', () => {
    const stem = rectangle(0, 0, 100, 600), plan = compileInline(inline, .5, 700), out = inlineSourceInk(stem, plan), shaped = ink(out);
    assert.equal(contours(out), 2, 'the stem and the line cut in it');
    assert.equal(shaped.has(50, 300), false); assert.equal(shaped.has(50, 100), false);
    for (const [x, y] of [[3, 300], [97, 300], [50, 3], [50, 597], [50, 30]]) assert.equal(shaped.has(x, y), true, `${x} ${y}`);
    // the line is the Size's share of the stroke
    let x0 = 50, x1 = 50;
    while (!shaped.has(x0 - .5, 300)) x0 -= .5;
    while (!shaped.has(x1 + .5, 300)) x1 += .5;
    assert.ok(Math.abs(x1 - x0 - 100 * plan.width) < 1.5, `${x1 - x0}`);
    // and grows with it
    const wide = ink(inlineSourceInk(stem, compileInline(inline, 1, 700)));
    assert.equal(wide.has(50 + 100 * .2, 300), false);
  });

  it('runs on through joins, whatever the winding of overlapping strokes, and stops short of corners', () => {
    for (const turn of [1, -1]) {
      // a T: a thin bar running into a thick stem, drawn overlapping
      const tee = [...rectangle(0, 0, 160, 600, turn), ...rectangle(100, 250, 300, 80, turn)];
      const out = inlineSourceInk(tee, compileInline(inline, .5, 700)), shaped = ink(out);
      assert.equal(contours(out), 2, 'one line, through the join');
      for (const [x, y] of [[80, 450], [80, 290], [250, 290]]) assert.equal(shaped.has(x, y), false, `${x} ${y}`);
    }
    // a stroke cut level across a diagonal keeps ink in its sharp corner
    const slant: Cmd[] = [['M', 0, 0], ['L', 120, 0], ['L', 420, 500], ['L', 300, 500], ['Z']];
    const shaped = ink(inlineSourceInk(slant, compileInline(inline, 1, 700)));
    assert.equal(shaped.has(210, 250), false);
    for (const [x, y] of [[8, 3], [412, 497]]) assert.equal(shaped.has(x, y), true);
  });

  it('leaves hairlines, dots and tiny drawings whole', () => {
    const plan = compileInline(inline, .5, 700);
    for (const cmds of [rectangle(0, 0, 8, 600), rectangle(0, 0, 60, 60), rectangle(0, 0, .2, .2)]) {
      assert.equal(contours(inlineSourceInk(cmds, plan)), 1);
    }
    const disc: Cmd[] = [['M', 50, 0], ['C', 77.6, 0, 100, 22.4, 100, 50], ['C', 100, 77.6, 77.6, 100, 50, 100],
      ['C', 22.4, 100, 0, 77.6, 0, 50], ['C', 0, 22.4, 22.4, 0, 50, 0], ['Z']];
    assert.equal(contours(inlineSourceInk(disc, plan)), 1);
    assert.deepEqual(inlineSourceInk([], plan), []);
  });

  it('draws each contour as a ring, where it crosses another too', () => {
    const plan = compileWire(wire, .5, 700), cross = [...rectangle(0, 0, 100, 600), ...rectangle(-200, 250, 500, 100)];
    const shaped = ink(wireSourceInk(cross, plan));
    for (const [x, y] of [[0, 100], [100, 100], [0, 300], [50, 250], [-200, 300]]) assert.equal(shaped.has(x, y), true, `${x} ${y}`);
    for (const [x, y] of [[50, 100], [50, 300], [-100, 300]]) assert.equal(shaped.has(x, y), false, `${x} ${y}`);
    assert.ok(compileWire(wire, 1, 700).line > plan.line && compileWire(wire, 0, 700).line < plan.line);
  });

  it('is pinned in every current program, not offered by the one before it, and leaves solid letters as they were', () => {
    for (const entry of current) {
      assert.deepEqual(entry.data.finish?.inline, inline, entry.ref.fontId);
      assert.deepEqual(entry.data.finish?.wire, wire, entry.ref.fontId);
      const p = params(entry.ref), older = params(before(entry.ref.fontId).ref);
      for (const fill of ['inline', 'wire'] as const) {
        assert.equal(sourceAllows(p, 'fill', fill), true);
        assert.equal(sourceAllows(older, 'fill', fill), false);
      }
      assert.deepEqual(buildFont(p).glyph('R')?.cmds, buildFont(older).glyph('R')?.cmds, `${entry.ref.fontId} solid as before`);
    }
  });

  it('keeps every style\'s letters within their ink and rim at both ends of Size and Weight', () => {
    for (const entry of current) {
      for (const [module, weight] of [[0, 0], [1, 1]]) {
        const p = params(entry.ref, 'inline', module), at = { ...p, weight }, solid = buildFont({ ...at, fill: 'solid' }), lined = buildFont(at);
        const rim = inline.rim * solid.m.cap;
        let cut = 0;
        for (const ch of 'HRa8&') {
          const a = solid.glyph(ch), b = lined.glyph(ch), what = `${entry.ref.fontId} ${ch} ${module}`;
          if (!a?.cmds.length) continue;
          assert.ok(b && b.cmds.every(c => c.slice(1).every(n => Number.isFinite(n))), what);
          assert.equal(b.adv, a.adv, what);
          const outline = sourceFinishPolygons(a.cmds, .05), inside = shape(outline), lines = sourceFinishPolygons(b.cmds, .05);
          if (lines.length > outline.length) cut++;
          // every point of the cut lies in the ink, no nearer its edge than the rim: the ink's own edge points are on
          // its drawn contours, a cut's lie inside with the rim's circle round them in ink
          for (const poly of lines) for (const q of poly) {
            if (off(q, outline) < .5) continue;
            for (let k = 0; k < 8; k++) {
              const t = k * Math.PI / 4, x = q.x + (rim - .5) * Math.cos(t), y = q.y + (rim - .5) * Math.sin(t);
              assert.ok(inside.has(x, y), `${what}: a cut nearer the edge than ${rim} at ${q.x} ${q.y}`);
            }
          }
        }
        assert.ok(cut >= 3, `${entry.ref.fontId} ${module}: lines in ${cut} letters`);
      }
    }
  });

  it('draws Wire in every style, the editable drawing kept, and a Points edit carried', () => {
    for (const entry of current) {
      const p = params(entry.ref, 'wire'), solid = buildFont({ ...p, fill: 'solid' }).glyph('O')!, ringed = buildFont(p).glyph('O')!;
      assert.notDeepEqual(ringed.cmds, solid.cmds);
      assert.deepEqual(traceOf(ringed), solid.editable ?? solid.drawn);
      const shaped = ink(ringed.cmds), [first] = sourceFinishPolygons(solid.cmds, .05);
      assert.ok(shaped.has(first[0].x, first[0].y), entry.ref.fontId);
    }
    const p = params(current[0].ref, 'inline'), n = buildFont({ ...p, fill: 'solid' }).glyph('n')!.drawn!;
    const moved = { ...n, at: drawnAtOf(p, 'n'), contours: n.contours.map(c => c.map(node => ({ ...node, x: node.x + 40,
      ...(node.ix === undefined ? {} : { ix: node.ix + 40 }), ...(node.ox === undefined ? {} : { ox: node.ox + 40 }) }))) };
    const plain = buildFont(p).glyph('n')!, edited = buildFont({ ...p, outlines: { n: moved } }).glyph('n')!;
    assert.deepEqual(traceOf(edited).contours, moved.contours);
    const box = (cmds: Cmd[]) => Math.min(...cmds.filter(c => c[0] !== 'Z').map(c => c[1] as number));
    assert.ok(Math.abs(box(edited.cmds) - box(plain.cmds) - 40) < .5, 'the line follows the edit');
  });

  it('is offered on the Adjust tab, named in its errors and exported as previewed', () => {
    const p = params(current[0].ref), trait = TRAITS.find(t => t.id === 'fill')!;
    const labels = sourceTraitOptions(p, 'fill', trait.options).map(o => o.label);
    assert.ok(labels.includes('Inline') && labels.includes('Wireframe'), labels.join());
    assert.match(sourceEffectMessage(new SourceEffectError('inline', 'complexity', '')), /^Inline is too detailed/);
    assert.match(sourceEffectMessage(new SourceEffectError('wire', 'tolerance', '')), /^Wireframe cannot preserve/);
    for (const fill of ['inline', 'wire'] as const) {
      const q: Params = { ...p, fill, module: .4 }, preview = buildFont(q).glyph('R')!;
      assert.equal(sourceFinishPrecision(programInfo(q.sourceProgram)!.data.finish!, q), fill);
      const bytes = buildOTF(q, `${fill} proof`), font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const installed = font.charToGlyph('R');
      assert.equal(installed.advanceWidth, Math.round(preview.adv));
      assert.equal(installed.path.commands.length, preview.cmds.length);
      installed.path.commands.forEach((actual, i) => {
        const expected = preview.cmds[i];
        assert.equal(actual.type, expected[0]);
        if ('x' in actual && (expected[0] === 'M' || expected[0] === 'L')) {
          assert.ok(Math.abs(actual.x - expected[1]) < .01 && Math.abs(actual.y - expected[2]) < .01, `${fill} ${i}`);
        }
      });
    }
  });

  it('rejects policies outside their bounds', () => {
    assert.throws(() => parseSourceInline({ ...inline, width: [.5, .2] }), /interval/);
    assert.throws(() => parseSourceInline({ ...inline, angle: [80, 150] }), /interval/);
    assert.throws(() => parseSourceInline({ ...inline, rim: 0 }), /dimension/);
    assert.throws(() => parseSourceInline({ ...inline, extra: 1 }), /Unknown/);
    assert.throws(() => parseSourceWire({ ...wire, line: [0, .04] }), /interval/);
    assert.throws(() => parseSourceWire({ ...wire, format: 'source-wire-v2' }), /Unsupported/);
  });
});
