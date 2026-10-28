/* Published finishes share rendering, editable Points, editor adoption, and installable output. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFont } from '../shared/engine';
import type { Cmd } from '../shared/engine/types';
import { DEFAULTS, drawnAtOf, freeAtOf, sanitizeParams, type Params } from '../shared/params';
import { MASTER_REVISIONS, masterInfo } from '../shared/source/master-catalog';
import { PROGRAM_REVISIONS, programForFont, programInfo } from '../shared/source/program-catalog';
import { sourceAllows, sourceSupports } from '../shared/source/capabilities';
import { sourceFinishFills } from '../shared/source/finish';
import { FILLS } from '../shared/params/options';
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
      const reviewed = program.data.finish ? sourceFinishFills(program.data.finish) : [];
      for (const fill of FILLS) assert.equal(sourceAllows(current, 'fill', fill), reviewed.includes(fill), `${info.ref.fontId} ${fill}`);
      for (const fill of ['inline', 'wire'] as const) assert.equal(sourceAllows(current, 'fill', fill), true);
      assert.equal(sourceSupports(current, 'dotGain'), !!program.data.finish?.patterns);
      assert.ok(program.data.finish?.slice);
      for (const key of ['slice', 'slicePos', 'sliceRound'] as const) assert.equal(sourceSupports(current, key), true);
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

  it('keeps the earlier Shadow revisions unchanged when saved Slice values are present', () => {
    for (const fontId of new Set(MASTER_REVISIONS.map(info => info.ref.fontId))) {
      const old = PROGRAM_REVISIONS.findLast(p => p.ref.fontId === fontId && p.data.finish && !p.data.finish.slice);
      assert.ok(old); loadSource(old.ref);
      const before = { ...params(fontId), sourceProgram: old.ref }, ignored = { ...before, slice: 1, slicePos: 0, sliceRound: 1 };
      assert.equal(sourceSupports(before, 'slice'), false);
      assert.deepEqual(buildFont(ignored).glyph('H')?.cmds, buildFont(before).glyph('H')?.cmds, fontId);
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
    const opened: Params = { ...edited, slice: .65, slicePos: .3, sliceRound: .75 }, face = buildFont(opened).glyph('R');
    assert.ok(face); assert.notDeepEqual(face.cmds, solid.cmds);
    const shadowed: Params = { ...opened, fill: 'shadow', module: 1 }, glyph = buildFont(shadowed).glyph('R');
    assert.ok(glyph?.editable);
    assert.deepEqual(glyph.cmds.slice(0, face.cmds.length), face.cmds);
    assert.ok(glyph.cmds.length > face.cmds.length);
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
    actions.setOption('fill', 'inline'); assert.equal(useEditor.getState().params.fill, 'inline');
    actions.setOption('fill', 'pixels'); assert.equal(useEditor.getState().params.fill, 'pixels');
    actions.setOption('fill', 'shadow'); assert.equal(useEditor.getState().params.fill, 'shadow');
    actions.resetParam('fill'); assert.equal(useEditor.getState().params.fill, 'solid');
  });

  it('adopts Slice without activating ignored coordinates or replacing saved Point frames', () => {
    const current = params('Couture:600');
    const previous = PROGRAM_REVISIONS.findLast(p => p.ref.fontId === 'Couture:600' && p.data.finish && !p.data.finish.slice);
    assert.ok(previous); loadSource(previous.ref);
    const before: Params = { ...current, sourceProgram: previous.ref, fill: 'shadow', module: .8,
      slice: .9, slicePos: .1, sliceRound: .6, glyphs: { R: { tail: .9, slice: .8, slicePos: .7, sliceRound: .3 } } };
    const clean = traceOf(buildFont(before).glyph('R')!);
    const original: Params = { ...before, outlines: { R: { ...clean, at: drawnAtOf(before, 'R') } } };
    actions.loadDesign({ id: 'slice-upgrade', name: 'Slice upgrade', styleId: 'didone', params: original, createdAt: '', updatedAt: '' });
    useEditor.setState({ scope: 'all', inspect: null }); actions.enableProgram();
    const adopted = useEditor.getState().params;
    assert.deepEqual(adopted.sourceProgram, current.sourceProgram);
    assert.equal(adopted.fill, 'shadow'); assert.equal(adopted.module, .8);
    assert.equal(adopted.slice, 0); assert.equal(adopted.slicePos, .5); assert.equal(adopted.sliceRound, 0);
    assert.deepEqual(adopted.glyphs.R, { tail: .9 });
    assert.deepEqual(adopted.outlines, original.outlines);
    // the clean saved R moves onto the current program's repaired basis: it draws as that program's own R (to rounding)
    const moved = buildFont(adopted).glyph('R')?.cmds, own = buildFont({ ...adopted, outlines: {} }).glyph('R')?.cmds;
    assert.ok(moved && own); assert.equal(moved.length, own.length);
    moved.forEach((c, i) => c.forEach((v, j) => typeof v === 'number' ? assert.ok(Math.abs(v - (own[i][j] as number)) < 1e-6) : assert.equal(v, own[i][j])));
    actions.travel(-1); assert.deepEqual(useEditor.getState().params, original);
    actions.travel(1); assert.deepEqual(useEditor.getState().params, adopted);
  });

  it('applies per-letter Slice and reserves its top allowance without changing the face measures', () => {
    const before = params('Mainline:600'), plain = buildFont(before);
    actions.loadDesign({ id: 'letter-slice', name: 'Letter slice', styleId: 'grotesque', params: before, createdAt: '', updatedAt: '' });
    useEditor.setState({ scope: 'letter', inspect: 'H' });
    actions.setOption('slice', 1); actions.setOption('slicePos', .25); actions.setOption('sliceRound', .5);
    const edited = useEditor.getState().params, font = buildFont(edited);
    assert.equal(edited.slice, 0); assert.equal(edited.glyphs.H?.slice, 1);
    assert.notDeepEqual(font.glyph('H')?.cmds, plain.glyph('H')?.cmds);
    assert.deepEqual(font.glyph('O')?.cmds, plain.glyph('O')?.cmds);
    assert.equal(font.m.cap, plain.m.cap); assert.equal(font.m.xh, plain.m.xh);
    assert.equal(font.m.asc, plain.m.asc + plain.m.cap * .14);
    assert.equal(font.m.asc, font.letter('H').m.asc);
    assert.deepEqual(traceOf(font.glyph('H')!), traceOf(plain.glyph('H')!));
    actions.resetParam('slice'); assert.equal(useEditor.getState().params.glyphs.H?.slice, undefined);
    assert.deepEqual(buildFont(useEditor.getState().params).glyph('H')?.cmds, plain.glyph('H')?.cmds);
  });

  it('applies the Slice and Ink traps Adjust choices through style selection and rejects unsupported cut choices', () => {
    actions.newDesign(); actions.clearTraits(); actions.loadStyle('grotesque');
    loadDesignSources(useEditor.getState().params);
    const plain = buildFont(useEditor.getState().params).glyph('H'); assert.ok(plain);
    actions.setTrait('cuts', 'slice');
    let state = useEditor.getState();
    assert.equal(state.traits.cuts, 'slice'); assert.equal(state.params.slice, .5);
    assert.notDeepEqual(buildFont(state.params).glyph('H')?.cmds, plain.cmds);
    actions.loadStyle('didone'); state = useEditor.getState(); loadDesignSources(state.params);
    assert.equal(state.traits.cuts, 'slice'); assert.equal(state.params.slice, .5);
    assert.equal(state.params.sourceProgram?.fontId, 'Couture:600');
    assert.notDeepEqual(buildFont(state.params).glyph('H')?.cmds, buildFont({ ...state.params, slice: 0 }).glyph('H')?.cmds);
    actions.setTrait('cuts', 'none'); state = useEditor.getState();
    assert.equal(state.traits.cuts, 'none'); assert.equal(state.params.slice, 0);
    actions.setTrait('cuts', 'inktrap'); state = useEditor.getState();
    assert.equal(state.traits.cuts, 'inktrap'); assert.equal(state.params.slice, 0); assert.equal(state.params.joints, .8);
    assert.notDeepEqual(buildFont(state.params).glyph('H')?.cmds, buildFont({ ...state.params, joints: 0 }).glyph('H')?.cmds);
    actions.setTrait('cuts', 'stencil'); state = useEditor.getState();
    assert.equal(state.traits.cuts, undefined); assert.equal(state.params.stencil, 0);
  });

  it('exports the same finished paths and advance that the preview uses', () => {
    const p: Params = { ...params('Mainline:600'), fill: 'shadow', module: .25, width: .65,
      slice: .7, slicePos: .4, sliceRound: .6 };
    const preview = buildFont(p).glyph('H'); assert.ok(preview);
    const bytes = buildOTF(p, 'Slice and Shadow proof'), font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
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
