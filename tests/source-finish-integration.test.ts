/* Published finishes share rendering, editable Points, editor adoption, and installable output. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFont } from '../shared/engine';
import type { Cmd } from '../shared/engine/types';
import { DEFAULTS, drawnAtOf, freeAtOf, sanitizeParams, type Params } from '../shared/params';
import { MASTER_REVISIONS, masterInfo } from '../shared/source/master-catalog';
import { programForFont, programInfo } from '../shared/source/program-catalog';
import { sourceAllows, sourceSupports } from '../shared/source/capabilities';
import { loadDesignSources, loadSource } from '../server/sources';
import { buildOTF } from '../server/export';
import { opentype } from '../server/opentype';
import { traceOf } from '../client/lib/pen';
import { actions, useEditor } from '../client/state/editor';

function params(fontId: string): Params {
  const ref = programForFont(fontId), program = programInfo(ref), info = masterInfo(ref);
  assert.ok(ref && program?.data.finish && info); loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min);
  const width = program.width ? (program.width.neutral - program.width.min) / (program.width.max - program.width.min) : DEFAULTS.width;
  return { ...DEFAULTS, sourceProgram: ref, freeFont: fontId, weight, width,
    freeAt: { ...freeAtOf(DEFAULTS), weight, width } };
}

describe('published source finishes', () => {
  it('enables only reviewed fills across every bundled family and leaves older references unchanged', () => {
    for (const info of MASTER_REVISIONS) {
      const current = params(info.ref.fontId), program = programInfo(current.sourceProgram);
      assert.ok(program);
      assert.equal(sourceSupports(current, 'fill'), true);
      assert.equal(sourceAllows(current, 'fill', 'solid'), true);
      assert.equal(sourceAllows(current, 'fill', 'shadow'), true);
      assert.equal(sourceAllows(current, 'fill', 'pixels'), false);
      assert.equal(sourceSupports(current, 'dotGain'), false);
      const old: Params = { ...current, sourceProgram: program.data.base, width: DEFAULTS.width,
        freeAt: { ...current.freeAt, width: DEFAULTS.width } };
      assert.equal(sourceSupports(old, 'fill'), false);
      const before = buildFont(old), neutral = buildFont(current), ignored = buildFont({ ...old, fill: 'shadow' });
      for (const ch of 'Hgo.,') {
        assert.deepEqual(neutral.glyph(ch)?.cmds, before.glyph(ch)?.cmds, info.ref.fontId);
        assert.deepEqual(ignored.glyph(ch)?.cmds, before.glyph(ch)?.cmds);
      }
    }
  });

  it('keeps edited foreground curves and their advance intact through finishing and reopening', () => {
    const before = params('Couture:600'), source = buildFont(before).glyph('R');
    assert.ok(source?.drawn);
    const drawing = { ...source.drawn, at: drawnAtOf(before, 'R'),
      contours: source.drawn.contours.map(c => c.map(n => ({ ...n, x: n.x + 7,
        ...(n.ix === undefined ? {} : { ix: n.ix + 7 }), ...(n.ox === undefined ? {} : { ox: n.ox + 7 }) }))) };
    const edited: Params = { ...before, outlines: { R: drawing }, weight: .8, glyphs: { R: { tail: .9 } } };
    const solid = buildFont(edited).glyph('R'); assert.ok(solid?.editable);
    const shadowed: Params = { ...edited, fill: 'shadow', module: 1 }, glyph = buildFont(shadowed).glyph('R');
    assert.ok(glyph?.editable);
    assert.deepEqual(glyph.cmds.slice(0, solid.cmds.length), solid.cmds);
    assert.ok(glyph.cmds.length > solid.cmds.length);
    assert.deepEqual(traceOf(glyph), solid.editable);
    assert.equal(traceOf(glyph).adv, solid.adv);
    assert.equal(glyph.adv, solid.adv + buildFont(edited).m.cap * .12);
    const reopened = sanitizeParams(JSON.parse(JSON.stringify(shadowed))); loadDesignSources(reopened);
    assert.deepEqual(buildFont(reopened).glyph('R')?.cmds, glyph.cmds);
  });

  it('adopts effects without activating previously ignored values and can undo the whole change', () => {
    const current = params('Couture:600'), info = masterInfo(current.sourceProgram); assert.ok(info);
    const original: Params = { ...current, sourceProgram: info.ref, fill: 'pixels', module: .91 };
    actions.loadDesign({ id: 'finish-upgrade', name: 'Finish upgrade', styleId: 'didone', params: original, createdAt: '', updatedAt: '' });
    useEditor.setState({ scope: 'all', inspect: null });
    actions.enableProgram();
    const adopted = useEditor.getState().params;
    assert.deepEqual(adopted.sourceProgram, current.sourceProgram);
    assert.equal(adopted.fill, 'solid'); assert.equal(adopted.module, .5);
    assert.deepEqual(buildFont(adopted).glyph('R')?.cmds, buildFont(original).glyph('R')?.cmds);
    actions.travel(-1); assert.deepEqual(useEditor.getState().params, original);
    actions.travel(1); assert.deepEqual(useEditor.getState().params, adopted);
    actions.setOption('fill', 'pixels'); assert.equal(useEditor.getState().params.fill, 'solid');
    actions.setOption('fill', 'shadow'); assert.equal(useEditor.getState().params.fill, 'shadow');
    actions.resetParam('fill'); assert.equal(useEditor.getState().params.fill, 'solid');
  });

  it('exports the same finished paths and advance that the preview uses', () => {
    const p: Params = { ...params('Mainline:600'), fill: 'shadow', module: .25, width: .65 };
    const preview = buildFont(p).glyph('H'); assert.ok(preview);
    const bytes = buildOTF(p, 'Shadow proof'), font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const installed = font.charToGlyph('H');
    assert.equal(installed.advanceWidth, Math.round(preview.adv));
    assert.equal(installed.path.commands.length, preview.cmds.length);
    for (let i = 0; i < preview.cmds.length; i++) {
      const actual = installed.path.commands[i], expected: Cmd = preview.cmds[i];
      assert.equal(actual.type, expected[0]);
      if (expected[0] === 'M' || expected[0] === 'L') {
        assert.ok('x' in actual && 'y' in actual);
        assert.equal(actual.x, Math.round(expected[1])); assert.equal(actual.y, Math.round(expected[2]));
      } else if (expected[0] === 'C') {
        assert.ok(actual.type === 'C');
        assert.deepEqual([actual.x1, actual.y1, actual.x2, actual.y2, actual.x, actual.y], expected.slice(1).map(Math.round));
      }
    }
  });
});
