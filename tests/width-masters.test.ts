/* Designed widths through the real renderer, saved point edits, and installable exports. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_CHARS, buildFont, packNode } from '../shared/engine';
import { cmdsBox } from '../shared/engine/geom';
import type { FreeFontData } from '../shared/engine/free';
import { DEFAULTS, drawnAtOf, freeAtOf, sanitizeParams, upgradeParams, type Params } from '../shared/params';
import { masterInfo } from '../shared/source/master-catalog';
import { decodeWeightMasters, interpolateMasters } from '../shared/source/masters';
import { PROGRAM_REVISIONS, programForFont, programInfo } from '../shared/source/program-catalog';
import { sourceProgram } from '../shared/source/registry';
import { decodeWidthMasters, interpolateWidthMasters, parseWidthMasters, widthAt, type WidthMasterData } from '../shared/source/width-masters';
import { loadSource } from '../server/sources';
import { buildOTF } from '../server/export';
import { opentype } from '../server/opentype';
import { traceOf } from '../client/lib/pen';

function family(fontId: string) {
  const ref = programForFont(fontId), info = masterInfo(ref), definition = programInfo(ref);
  assert.ok(ref && info && definition);
  loadSource(ref);
  const program = sourceProgram(ref);
  assert.ok(program);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min);
  const width = definition.width ? (definition.width.neutral - definition.width.min) / (definition.width.max - definition.width.min) : DEFAULTS.width;
  const params: Params = { ...DEFAULTS, freeFont: fontId, sourceProgram: ref, weight, width,
    crossbar: .5, tail: .5, terminalLength: .5, freeAt: { ...freeAtOf(DEFAULTS), weight, width } };
  return { ref, info, definition, program, params };
}
function glyph(params: Params, ch: string) {
  const glyph = buildFont(params).glyph(ch);
  assert.ok(glyph?.drawn);
  return { ...glyph, drawn: glyph.drawn };
}
function near(actual: number, expected: number) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }

describe('designed width interpolation', () => {
  const font: FreeFontData = { id: 'Example:400', family: 'Example', designers: [], copyright: '', license: '', licenseUrl: '', cap: 700, xh: 500, space: 200,
    glyphs: { A: [500, [[[10, 20, null, null, 30, 40], [80, 120, 60, 90], [100, 0]]]] } };
  const base = { ref: { kind: 'masters-v1', digest: 'a'.repeat(64), fontId: font.id } as const,
    masters: decodeWeightMasters({ format: 'weight-masters-v1', source: { kind: 'outline-v1', digest: 'b'.repeat(64), fontId: font.id },
      defaultWeight: 400, notes: [], provenance: [], masters: [{ weight: 400, data: font },
        { weight: 600, data: { ...font, space: 240, glyphs: { A: [560, [[[30, 40, null, null, 70, 60], [100, 160, 80, 130], [140, 0]]]] } } }] }) };
  const candidate: WidthMasterData = { format: 'width-masters-v1', base: base.ref, axis: { min: 75, neutral: 100, max: 100 }, provenance: [], notes: [],
    columns: [{ width: 75, masters: [
      { weight: 400, space: 160, glyphs: { A: [400, [[[-10, 20, null, null, 10, 40], [60, 120, 40, 90], [80, 0]]]] } },
      { weight: 600, space: 200, glyphs: { A: [460, [[[10, 40, null, null, 50, 60], [80, 160, 60, 130], [120, 0]]]] } },
    ] }] };

  it('interpolates the two coordinates, handles, advance and spacing against literal values', () => {
    const grid = decodeWidthMasters(parseWidthMasters(candidate, base), base.masters);
    const font = interpolateWidthMasters(grid, 500, 87.5);
    assert.equal(font.space, 200);
    assert.equal(font.glyphs.A.adv, 480);
    assert.deepEqual(font.glyphs.A.contours[0].map(packNode), [[10, 30, null, null, 40, 50], [80, 140, 60, 110], [110, 0]]);
    assert.strictEqual(interpolateWidthMasters(grid, 500, 100), interpolateMasters(base.masters, 500));
    assert.equal(widthAt({ width: 0, freeAt: { width: 1 } }, candidate.axis), 75);
    assert.equal(widthAt({ width: .5, freeAt: { width: 1 } }, candidate.axis), 87.5);
    assert.equal(widthAt({ width: 1, freeAt: { width: 1 } }, candidate.axis), 100);
    assert.throws(() => interpolateWidthMasters(grid, 500, 101), /range/);
    assert.throws(() => interpolateWidthMasters(grid, 500, 74), /range/);
  });

  it('rejects a wrong basis, incomplete grids, duplicate columns, and incompatible contours', () => {
    assert.throws(() => parseWidthMasters({ ...candidate, base: { ...base.ref, digest: 'c'.repeat(64) } }, base), /base/);
    assert.throws(() => parseWidthMasters({ ...candidate, axis: { min: 75, neutral: 100, max: 125 } }, base), /endpoints/);
    assert.throws(() => parseWidthMasters({ ...candidate, columns: [...candidate.columns, ...candidate.columns] }, base), /ordered/);
    const broken = structuredClone(candidate); broken.columns[0].masters[1].glyphs.A[1][0].pop();
    assert.throws(() => parseWidthMasters(broken, base), /compatible/);
    const missing = structuredClone(candidate); missing.columns[0].masters.pop();
    assert.throws(() => parseWidthMasters(missing, base), /master|range|knots/);
  });
});

describe('published source programs', () => {
  it('preserves the complete weight family at neutral and draws every glyph across width and height corners', () => {
    for (const definition of PROGRAM_REVISIONS) {
      const { program, params, info } = family(definition.ref.fontId);
      for (const weight of [0, .37, 1]) {
        const original = buildFont({ ...params, sourceProgram: info.ref, width: DEFAULTS.width, freeAt: { ...params.freeAt, width: DEFAULTS.width }, weight });
        const current = buildFont({ ...params, weight });
        for (const ch of ALL_CHARS) {
          assert.deepEqual(current.glyph(ch)?.cmds, original.glyph(ch)?.cmds, `${definition.ref.fontId} ${ch} neutral width`);
          assert.equal(current.glyph(ch)?.adv, original.glyph(ch)?.adv);
        }
      }
      if (!program.width) continue;
      for (const [weight, width, height, xHeight] of [[0, 0, 0, 0], [1, 1, 1, 1], [.31, .43, .68, .23]]) {
        const font = buildFont({ ...params, weight, width, height, xHeight });
        for (const ch of ALL_CHARS) {
          const glyph = font.glyph(ch); assert.ok(glyph?.editable && glyph.cmds.length && glyph.adv > 0);
          assert.strictEqual(traceOf(glyph), glyph.editable);
          for (const cmd of glyph.cmds) for (const value of cmd.slice(1)) assert.ok(typeof value === 'number' && Number.isFinite(value));
        }
      }
    }
  });

  it('uses designed width changes instead of applying a second geometric squeeze', () => {
    const { params } = family('Mainline:600'), original = glyph(params, 'H'), narrow = glyph({ ...params, width: 0 }, 'H');
    const wideBox = cmdsBox(original.cmds), narrowBox = cmdsBox(narrow.cmds); assert.ok(wideBox && narrowBox);
    const ratio = (narrowBox.x1 - narrowBox.x0) / (wideBox.x1 - wideBox.x0);
    assert.ok(ratio > .84 && ratio < .87, `Reviewed H width ratio: ${ratio}`);
    const old = glyph({ ...params, sourceProgram: masterInfo(params.sourceProgram)!.ref, width: 0 }, 'H');
    assert.notDeepEqual(narrow.cmds, old.cmds);
  });

  it('carries point edits through native widths without changing their base identity', () => {
    const { params, info } = family('Gumdrop:700'), original = glyph(params, 'H');
    const drawing = { ...original.drawn, at: drawnAtOf(params, 'H'), contours: original.drawn.contours.map(c => c.map(n => ({ ...n,
      x: n.x + 13, ...(n.ix === undefined ? {} : { ix: n.ix + 13 }), ...(n.ox === undefined ? {} : { ox: n.ox + 13 }) }))) };
    const changed = { ...params, weight: .41, width: 0, height: .73, xHeight: .31 };
    const actual = glyph({ ...changed, outlines: { H: drawing } }, 'H'), expected = glyph(changed, 'H');
    for (const node of expected.drawn.contours.flat()) {
      assert.equal(node.authored?.digest, info.ref.digest);
      const other = actual.drawn.contours.flat().find(p => p.authored?.contour === node.authored?.contour && p.authored?.segment === node.authored?.segment && p.authored?.t === node.authored?.t);
      assert.ok(other); near(other.x, node.x + 13); near(other.y, node.y);
    }
    const saved = sanitizeParams(upgradeParams(JSON.parse(JSON.stringify({ ...changed, outlines: { H: drawing } })), 10));
    assert.deepEqual(glyph(saved, 'H').cmds, actual.cmds);
    const old = { ...params, sourceProgram: info.ref, width: .8, freeAt: { ...params.freeAt, width: .5 } };
    const oldDrawing = { ...glyph(old, 'H').drawn, at: drawnAtOf(old, 'H') };
    const adopted = glyph({ ...params, outlines: { H: oldDrawing } }, 'H');
    for (let ci = 0; ci < original.drawn.contours.length; ci++) for (let ni = 0; ni < original.drawn.contours[ci].length; ni++) {
      near(adopted.drawn.contours[ci][ni].x, original.drawn.contours[ci][ni].x);
      near(adopted.drawn.contours[ci][ni].y, original.drawn.contours[ci][ni].y);
    }
  });

  it('exports the exact designed width and weight as an installable font', () => {
    const { params } = family('Mainline:600'), current = { ...params, width: .3, weight: .7 };
    const built = buildOTF(current, 'Designed width proof');
    const font = opentype.parse(built.buffer.slice(built.byteOffset, built.byteOffset + built.byteLength));
    const preview = glyph(current, 'H'), installed = font.charToGlyph('H');
    assert.equal(font.tables.os2.usWeightClass, 650);
    assert.equal(installed.advanceWidth, Math.round(preview.adv));
    assert.equal(installed.path.commands.length, preview.cmds.length);
    for (let i = 0; i < preview.cmds.length; i++) {
      const actual = installed.path.commands[i], expected = preview.cmds[i];
      assert.equal(actual.type, expected[0]);
      if (expected[0] === 'M' || expected[0] === 'L') {
        assert.ok('x' in actual && 'y' in actual); assert.equal(actual.x, Math.round(expected[1])); assert.equal(actual.y, Math.round(expected[2]));
      } else if (expected[0] === 'C') {
        assert.ok(actual.type === 'C'); assert.deepEqual([actual.x1, actual.y1, actual.x2, actual.y2, actual.x, actual.y], expected.slice(1).map(Math.round));
      }
    }
  });

  it('transports point edits from the saved feature shape to the current feature shape', () => {
    for (const [ch, key] of [['H', 'crossbar'], ['R', 'tail'], ['c', 'terminalLength']] as const) {
      const { params, info } = family('Couture:600');
      const before: Params = { ...params, weight: .25, glyphs: { [ch]: { [key]: .2 } } };
      const source = glyph(before, ch);
      const edited = { ...source.drawn, at: drawnAtOf(before, ch), contours: source.drawn.contours.map(c => c.map(n => ({ ...n,
        x: n.x + 9, ...(n.ix === undefined ? {} : { ix: n.ix + 9 }), ...(n.ox === undefined ? {} : { ox: n.ox + 9 }) }))) };
      const after: Params = { ...before, weight: .75, glyphs: { [ch]: { [key]: .9 } } };
      const expected = glyph(after, ch), actual = glyph({ ...after, outlines: { [ch]: edited } }, ch);
      assert.notDeepEqual(expected.cmds, source.cmds);
      for (const node of expected.drawn.contours.flat()) {
        assert.equal(node.authored?.digest, info.ref.digest);
        const other = actual.drawn.contours.flat().find(p => p.authored?.contour === node.authored?.contour && p.authored?.segment === node.authored?.segment && p.authored?.t === node.authored?.t);
        assert.ok(other); near(other.x, node.x + 9); near(other.y, node.y);
      }
      const unchanged = glyph(after, 'B'), original = glyph(params, 'B');
      assert.notDeepEqual(unchanged.cmds, original.cmds, 'the global weight still moves unrelated glyphs');
      assert.deepEqual(unchanged.cmds, glyph({ ...after, glyphs: {} }, 'B').cmds, 'a letter feature stays on its letter');
    }
  });
});
