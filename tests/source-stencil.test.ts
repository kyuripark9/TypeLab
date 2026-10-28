/* Stencil on sources (`source-stencil-v1` in the finish policy): a stroke cut where it runs into another, the gap
   beside its host and square to the page; two strokes coming to a point cut down it; serifs and stubs left; every
   counter opened; Position and Rounding; every style's counters opened at the ends of Weight, within its ink; the
   gates, defaults, adoption, the Adjust tab, finishing order and export. */
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
import { compileStencil, parseSourceStencil, stencilSourceInk } from '../shared/source/stencil';
import { loadDesignSources, loadSource } from '../server/sources';
import { buildOTF } from '../server/export';
import { opentype } from '../server/opentype';
import { traceOf } from '../client/lib/pen';

const policy = parseSourceStencil({ format: 'source-stencil-v1', gap: .15, offset: 1.5, point: 120, span: 2, serif: .25,
  turn: [20, 60], reach: [.01, .04], run: 1.5, apart: .9, tolerance: .1 });
const at = (stencil: number, stencilPos = 0, stencilRound = 0) => compileStencil(policy, { stencil, stencilPos, stencilRound }, 700)!;
const rectangle = (x: number, y: number, w: number, h: number): Cmd[] => [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
const ink = (cmds: Cmd[]) => shape(sourceFinishPolygons(cmds, .01));
function united(cmds: Cmd[]): PolyTree64 {
  const clipper = new Clipper64(), tree = new PolyTree64();
  clipper.addSubject(sourceFinishPolygons(cmds, .05).map(p => p.map(q => ({ x: Math.round(q.x * 1e5), y: Math.round(q.y * 1e5) }))));
  clipper.execute(ClipType.Union, FillRule.NonZero, tree);
  return tree;
}
/** How many separate pieces of ink a drawing is in, and how many counters it closes. */
function count(cmds: Cmd[]): { pieces: number; counters: number } {
  let pieces = 0, counters = 0;
  const visit = (node: PolyTree64 | PolyPath64) => {
    for (let i = 0; i < node.count; i++) { const child = node.child(i); if (child.isHole) counters++; else pieces++; visit(child); }
  };
  visit(united(cmds));
  return { pieces, counters };
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
const before = (fontId: string) => PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === fontId && !entry.data.finish?.stencil)!;
function params(ref: ProgramSourceRef, stencil = 0): Params {
  const info = masterInfo(ref), width = programInfo(ref)?.width;
  assert.ok(info && width); loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min), neutral = (width.neutral - width.min) / (width.max - width.min);
  const p: Params = { ...DEFAULTS, sourceProgram: ref, freeFont: ref.fontId, weight, width: neutral, stencil,
    freeAt: { ...freeAtOf(DEFAULTS), weight, width: neutral, dotSize: .5, stencil: 0 } };
  loadDesignSources(p);
  return p;
}
const H = [...rectangle(0, 0, 120, 600), ...rectangle(380, 0, 120, 600), ...rectangle(60, 260, 380, 90)];

describe('source stencil', () => {
  it('cuts a bar from the stems it runs into, upright beside them, and leaves the stems whole', () => {
    const out = stencilSourceInk(H, at(.3)), shaped = ink(out), gap = .3 * .15 * 700;
    assert.deepEqual(count(out), { pieces: 3, counters: 0 });
    for (const [x, y] of [[120 + gap / 2, 300], [380 - gap / 2, 300]]) assert.equal(shaped.has(x, y), false, `${x} ${y}`);
    for (const [x, y] of [[60, 300], [440, 300], [250, 300], [60, 20], [60, 580]]) assert.equal(shaped.has(x, y), true, `${x} ${y}`);
    assert.equal(compileStencil(policy, { stencil: 0, stencilPos: 1, stencilRound: 1 }, 700), undefined);
  });

  it('slides the gap out along the stroke with Position, and rounds its corners with Rounding', () => {
    const near = ink(stencilSourceInk(H, at(.3, 0))), far = ink(stencilSourceInk(H, at(.3, 1)));
    assert.equal(near.has(130, 300), false); assert.equal(far.has(130, 300), true);
    assert.equal(far.has(120 + 1.5 * 90 + 15, 300), false);
    assert.ok(area(stencilSourceInk(H, at(.3, 0, 1))) < area(stencilSourceInk(H, at(.3, 0, 0))));
  });

  it('opens a closed counter at the top and foot, and cuts two strokes coming to a point down the point', () => {
    const ring = [...rectangle(0, 0, 400, 600), ['M', 90, 90], ['L', 90, 510], ['L', 310, 510], ['L', 310, 90], ['Z']] satisfies Cmd[];
    const out = stencilSourceInk(ring, at(.3)), shaped = ink(out);
    assert.deepEqual(count(out), { pieces: 2, counters: 0 });
    for (const [x, y] of [[200, 45], [200, 555]]) assert.equal(shaped.has(x, y), false, `${x} ${y}`);
    for (const [x, y] of [[45, 300], [355, 300]]) assert.equal(shaped.has(x, y), true, `${x} ${y}`);
    const vee: Cmd[] = [['M', 0, 600], ['L', 110, 600], ['L', 250, 160], ['L', 390, 600], ['L', 500, 600], ['L', 300, 0], ['L', 200, 0], ['Z']];
    const cut = stencilSourceInk(vee, at(.3));
    assert.equal(count(cut).pieces, 2);
    assert.equal(ink(cut).has(250, 60), false);
  });

  it('leaves serifs, a plain stroke and an empty drawing alone', () => {
    const serifed = [...rectangle(40, 0, 80, 600), ...rectangle(0, 0, 160, 30), ...rectangle(0, 570, 160, 30)];
    assert.equal(stencilSourceInk(serifed, at(.5)), serifed);
    const stem = rectangle(0, 0, 100, 600);
    assert.equal(stencilSourceInk(stem, at(.5)), stem);
    assert.deepEqual(stencilSourceInk([], at(.5)), []);
  });

  it('is pinned in every current program, offered there alone, and starts at none', () => {
    for (const entry of current) {
      assert.deepEqual(entry.data.finish?.stencil, policy, entry.ref.fontId);
      const p = params(entry.ref), older = params(before(entry.ref.fontId).ref);
      for (const key of ['stencil', 'stencilPos', 'stencilRound'] as const) {
        assert.equal(sourceSupports(p, key), true); assert.equal(sourceSupports(older, key), false);
      }
      assert.deepEqual(buildFont(p).glyph('B')?.cmds, buildFont(older).glyph('B')?.cmds, `${entry.ref.fontId} uncut as before`);
    }
    const style = styleById('grotesque'); assert.ok(style);
    const started = sourceStyleParams(style); assert.ok(started);
    assert.equal(started.stencil, 0); assert.equal(started.freeAt.stencil, 0);
  });

  it('starts a design adopting it at none, its letters as they were', () => {
    const old = before('Mainline:600'), saved: Params = { ...params(old.ref), stencil: .4, stencilPos: .3, glyphs: { B: { stencil: .2 } } };
    const adopted = adoptProgram(saved)!;
    assert.equal(adopted.stencil, 0); assert.equal(adopted.stencilPos, 0); assert.equal(adopted.freeAt.stencil, 0);
    assert.equal(adopted.glyphs.B?.stencil, undefined);
    loadDesignSources(adopted);
    for (const ch of 'BH') assert.deepEqual(buildFont(adopted).glyph(ch)?.cmds, buildFont(saved).glyph(ch)?.cmds);
  });

  it('opens every counter in every style at both ends of Weight, within the ink', () => {
    for (const entry of current) {
      for (const weight of [0, 1]) {
        const p = { ...params(entry.ref), weight }, plain = buildFont(p), cut = buildFont({ ...p, stencil: .3 });
        for (const ch of 'ABDOPRabdeopq08') {
          const a = plain.glyph(ch), b = cut.glyph(ch), what = `${entry.ref.fontId} ${ch} ${weight}`;
          if (!a?.cmds.length) continue;
          assert.ok(b && b.cmds.every(c => c.slice(1).every(n => Number.isFinite(n))), what);
          assert.equal(b.adv, a.adv, what);
          assert.equal(count(b.cmds).counters, 0, `${what}: a counter left closed`);
          const outline = sourceFinishPolygons(a.cmds, .05), inside = shape(outline);
          for (const poly of sourceFinishPolygons(b.cmds, .05)) for (const q of poly.filter((_, i) => i % 5 === 0)) {
            assert.ok(inside.has(q.x, q.y) || off(q, outline) < .6, `${what}: ink outside the letter at ${q.x} ${q.y}`);
          }
        }
      }
    }
  });

  it('keeps the editable drawing, finishes before the fills, and offers the Adjust choice', () => {
    const p = params(current.find(e => e.ref.fontId === 'Mainline:600')!.ref);
    const plain = buildFont(p).glyph('B')!, cut = buildFont({ ...p, stencil: .3 }).glyph('B')!;
    assert.deepEqual(traceOf(cut), plain.editable ?? plain.drawn);
    assert.ok(area(cut.cmds) < area(plain.cmds));
    for (const fill of ['outline', 'inline', 'pixels'] as const) {
      assert.notDeepEqual(buildFont({ ...p, fill, stencil: .3 }).glyph('B')?.cmds, buildFont({ ...p, fill }).glyph('B')?.cmds, fill);
    }
    assert.notDeepEqual(buildFont({ ...p, stencil: .3, joints: 1 }).glyph('B')?.cmds, cut.cmds, 'on trapped ink');
  });

  it('exports as previewed, with fractional points', () => {
    const p = { ...params(current.find(e => e.ref.fontId === 'Mainline:600')!.ref), stencil: .3 }, preview = buildFont(p).glyph('B')!;
    assert.equal(sourceFinishPrecision(programInfo(p.sourceProgram)!.data.finish!, p), 'stencil');
    const bytes = buildOTF(p, 'Stencil proof'), font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const installed = font.charToGlyph('B');
    assert.equal(installed.advanceWidth, Math.round(preview.adv));
    assert.equal(installed.path.commands.length, preview.cmds.length);
    installed.path.commands.forEach((actual, i) => {
      const expected = preview.cmds[i];
      assert.equal(actual.type, expected[0]);
      if ('x' in actual && (expected[0] === 'M' || expected[0] === 'L')) assert.ok(Math.abs(actual.x - expected[1]) < .01 && Math.abs(actual.y - expected[2]) < .01);
    });
  });

  it('rejects policies outside their bounds', () => {
    assert.throws(() => parseSourceStencil({ ...policy, gap: 0 }), /dimension/);
    assert.throws(() => parseSourceStencil({ ...policy, turn: [60, 20] }), /interval/);
    assert.throws(() => parseSourceStencil({ ...policy, extra: 1 }), /Unknown/);
    assert.throws(() => parseSourceStencil({ ...policy, format: 'source-stencil-v2' }), /Unsupported/);
  });
});
