/* Reviewed letter details stay scoped to the authored characters through navigation, writes and rendering. */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { buildFont } from '../shared/engine';
import { controlInUse, pagesFor } from '../shared/content';
import { DEFAULTS, drawnAtOf, freeAtOf, type Params } from '../shared/params';
import { masterInfo, mastersForFont } from '../shared/source/master-catalog';
import { sourceForFont } from '../shared/source/catalog';
import { programForFont } from '../shared/source/program-catalog';
import { sourceControl, sourceSupports } from '../shared/source/capabilities';
import { loadSource } from '../server/sources';
import { actions, letterOf, useEditor } from '../client/state/editor';
import { reachOf } from '../client/lib/reach';

function params(fontId = 'Couture:600'): Params {
  const ref = programForFont(fontId), info = masterInfo(ref);
  assert.ok(ref && info);
  loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min);
  return { ...DEFAULTS, sourceProgram: ref, freeFont: fontId, weight, freeAt: { ...freeAtOf(DEFAULTS), weight } };
}

describe('reviewed feature scope', () => {
  it('permits only authored glyph details in single-letter scope and keeps old sources fixed', () => {
    for (const fontId of ['Couture:600', 'Hearth:600']) {
      const p = params(fontId), info = masterInfo(p.sourceProgram);
      assert.ok(info);
      for (const key of ['crossbar', 'tail', 'terminalLength']) assert.equal(sourceSupports(p, key), false);
      assert.equal(sourceSupports(p, 'crossbar', 'H'), true);
      assert.equal(sourceSupports(p, 'crossbar', 'A'), true);
      assert.equal(sourceSupports(p, 'crossbar', 'R'), false);
      assert.equal(sourceSupports(p, 'crossbar', 'h'), false);
      assert.equal(sourceSupports(p, 'tail', 'R'), true);
      assert.equal(sourceSupports(p, 'tail', 'j'), false);
      assert.equal(sourceSupports(p, 'terminalLength', 'c'), true);
      assert.equal(sourceSupports(p, 'terminalLength', 'C'), false);
      assert.equal(sourceSupports(p, 'terminal', 'c'), false);
      assert.equal(sourceSupports({ sourceProgram: info.ref }, 'crossbar', 'H'), false);
      assert.equal(sourceSupports({ sourceProgram: info.source }, 'crossbar', 'H'), false);
    }
  });

  it('uses the same glyph scope for the terminal page, its standalone length control and reach', () => {
    const p = params(), whole = pagesFor(p), covered = pagesFor(p, 'c');
    assert.equal(whole.some(page => page.id === 'ends'), false);
    assert.equal(covered.some(page => page.id === 'ends'), true);
    assert.equal(pagesFor(p, 'c'), covered);
    assert.equal(pagesFor(p), whole);
    assert.equal(pagesFor(p, 'H').some(page => page.id === 'ends'), false);
    assert.equal(pagesFor(params('Mainline:600'), 'c').some(page => page.id === 'ends'), false);
    assert.equal(controlInUse('terminal', p, 'c'), true);
    assert.equal(sourceControl(p, 'terminal', 'c'), 'terminalLength');
    assert.equal(controlInUse('terminal', p), false);
    assert.equal(controlInUse('crossbar', p, 'H'), true);
    assert.equal(controlInUse('crossbar', p, 'R'), false);
    assert.deepEqual(reachOf(p, 'crossbar', ['H']), { shows: false, elsewhere: [] });
    assert.deepEqual(reachOf(p, 'crossbar', ['H'], 'H'), { shows: true, elsewhere: [] });
    assert.deepEqual(reachOf(p, 'crossbar', ['R'], 'R'), { shows: false, elsewhere: [] });
    assert.deepEqual(reachOf(p, 'terminalLength', ['c'], 'c'), { shows: true, elsewhere: [] });
    assert.deepEqual(reachOf(p, 'terminal', ['c'], 'c'), { shows: false, elsewhere: [] });
  });
});

describe('source detail editor actions', () => {
  beforeEach(() => {
    actions.loadDesign({ id: 'scoped-source', name: 'Scoped source', styleId: 'didone', params: params(), createdAt: '', updatedAt: '' });
    useEditor.setState({ scope: 'all', inspect: null, category: 'weight' });
  });

  it('changes only the covered letter, with a visible geometry change and an undoable value', () => {
    const before = useEditor.getState().params, font = buildFont(before);
    const originalH = font.glyph('H')?.d, originalA = font.glyph('A')?.d;
    assert.ok(originalH && originalA);
    actions.openInspector('H');
    assert.equal(letterOf(useEditor.getState()), null);
    actions.setParam('crossbar', .8);
    assert.equal(useEditor.getState().params, before, 'inspection alone does not grant a whole-font detail control');
    actions.setScope('letter');
    actions.setParam('crossbar', .8);
    actions.commit();
    const changed = useEditor.getState().params;
    assert.equal(changed.crossbar, .5);
    assert.equal(changed.glyphs.H?.crossbar, .8);
    assert.equal(changed.glyphs.A, undefined);
    assert.notEqual(buildFont(changed).glyph('H')?.d, originalH);
    assert.equal(buildFont(changed).glyph('A')?.d, originalA);
    actions.travel(-1);
    assert.equal(useEditor.getState().params.glyphs.H?.crossbar, undefined);
    assert.equal(buildFont(useEditor.getState().params).glyph('H')?.d, originalH);
  });

  it('rejects unsupported letters and shape options while allowing the covered terminal length', () => {
    actions.openInspector('B');
    actions.setScope('letter');
    actions.setParam('crossbar', .8);
    assert.equal(useEditor.getState().params.glyphs.B, undefined);
    actions.openInspector('c');
    actions.setCategory('ends');
    assert.equal(useEditor.getState().category, 'ends');
    assert.equal(useEditor.getState().active, 'terminalLength');
    actions.setParam('terminalLength', .8);
    assert.equal(useEditor.getState().params.glyphs.c?.terminalLength, .8);
    actions.setParam('terminal', DEFAULTS.terminal);
    actions.setEnd('unreviewed-end', .8);
    assert.equal(useEditor.getState().params.glyphs.c?.terminal, undefined);
    assert.equal(useEditor.getState().params.glyphs.c?.terminalEnds, undefined);
    actions.setScope('all');
    actions.setParam('terminalLength', .2);
    actions.setCategory('ends');
    assert.notEqual(useEditor.getState().category, 'ends');
    assert.equal(useEditor.getState().params.terminalLength, .5);
    assert.equal(useEditor.getState().params.glyphs.c?.terminalLength, .8);
  });
});

describe('explicit source-program adoption', () => {
  it('starts native width styles at their original drawing and feature styles at neutral details', () => {
    useEditor.setState({ traits: {}, scope: 'all', inspect: null });
    for (const [style, width] of [['grotesque', 1], ['humanist', 1], ['chunkyround', .5]] satisfies [string, number][]) {
      actions.loadStyle(style);
      const p = useEditor.getState().params;
      assert.equal(p.sourceProgram?.kind, 'program-v1');
      assert.equal(p.width, width, style);
      assert.equal(p.freeAt.width, width, style);
    }
    for (const style of ['didone', 'softslab']) {
      actions.loadStyle(style);
      const p = useEditor.getState().params;
      assert.equal(p.sourceProgram?.kind, 'program-v1');
      assert.deepEqual([p.crossbar, p.tail, p.terminalLength], [.5, .5, .5]);
      assert.deepEqual([p.freeAt.crossbar, p.freeAt.tail, p.freeAt.terminalLength], [.5, .5, .5]);
    }
  });

  it('resets newly interpreted widths, keeps Points frames, and can undo, redo and reset an adoption', () => {
    for (const sourceProgram of [sourceForFont('Mainline:600'), mastersForFont('Mainline:600')]) {
      assert.ok(sourceProgram);
      const original: Params = { ...DEFAULTS, sourceProgram, freeFont: sourceProgram.fontId, width: .8, weight: .9,
        freeAt: { ...freeAtOf(DEFAULTS), width: .4, weight: .6 }, glyphs: { H: { width: .2, weight: .3, slant: .6 }, R: { width: .7 } } };
      original.outlines = { H: { adv: 500, contours: [[{ x: 40, y: 0 }, { x: 40, y: 700 }, { x: 400, y: 700 }, { x: 400, y: 0 }]], at: drawnAtOf(original, 'H') } };
      actions.loadDesign({ id: 'old-width', name: 'Old width', styleId: 'grotesque', params: original, createdAt: '', updatedAt: '' });
      useEditor.setState({ scope: 'all', inspect: null });
      const before = useEditor.getState().params;
      actions.enableProgram();
      const adopted = useEditor.getState().params;
      assert.deepEqual(adopted.sourceProgram, programForFont('Mainline:600'));
      assert.equal(adopted.width, 1);
      assert.equal(adopted.freeAt.width, 1);
      assert.equal(adopted.glyphs.H?.width, undefined);
      assert.equal(adopted.glyphs.R?.width, undefined);
      assert.equal(adopted.glyphs.H?.slant, .6);
      assert.equal(adopted.weight, sourceProgram.kind === 'outline-v1' ? .6 : .9);
      assert.equal(adopted.glyphs.H?.weight, sourceProgram.kind === 'outline-v1' ? undefined : .3);
      assert.deepEqual(adopted.outlines, before.outlines);
      assert.deepEqual(adopted.outlines.H.at?.sourceProgram, sourceProgram);
      assert.equal(adopted.outlines.H.at?.width, .2);
      actions.travel(-1);
      assert.deepEqual(useEditor.getState().params, before);
      actions.travel(1);
      assert.deepEqual(useEditor.getState().params, adopted);
      actions.setOption('width', .2);
      actions.resetParam('width');
      assert.equal(useEditor.getState().params.width, 1);
      actions.openInspector('H');
      actions.setScope('letter');
      actions.setParam('width', .15);
      actions.resetParam('width');
      assert.equal(useEditor.getState().params.glyphs.H?.width, undefined);
      assert.equal(useEditor.getState().params.width, 1);
      assert.deepEqual(useEditor.getState().params.outlines, before.outlines);
    }
  });

  it('adopts feature controls at neutral while retaining earlier Points frames and unrelated letter settings', () => {
    const sourceProgram = mastersForFont('Couture:600');
    assert.ok(sourceProgram);
    const original: Params = { ...params(), sourceProgram, width: .8, crossbar: .17, tail: .81, terminalLength: .33,
      glyphs: { H: { crossbar: .3, width: .4 }, R: { tail: .9 }, c: { terminalLength: .7 } } };
    original.outlines = { H: { adv: 500, contours: [[{ x: 40, y: 0 }, { x: 40, y: 700 }, { x: 400, y: 700 }, { x: 400, y: 0 }]], at: drawnAtOf(original, 'H') } };
    actions.loadDesign({ id: 'old-features', name: 'Old features', styleId: 'didone', params: original, createdAt: '', updatedAt: '' });
    useEditor.setState({ scope: 'all', inspect: null });
    const before = useEditor.getState().params;
    actions.enableProgram();
    const adopted = useEditor.getState().params;
    assert.deepEqual(adopted.sourceProgram, programForFont('Couture:600'));
    assert.deepEqual([adopted.crossbar, adopted.tail, adopted.terminalLength], [.5, .5, .5]);
    assert.deepEqual([adopted.freeAt.crossbar, adopted.freeAt.tail, adopted.freeAt.terminalLength], [.5, .5, .5]);
    assert.deepEqual([adopted.glyphs.H?.crossbar, adopted.glyphs.R?.tail, adopted.glyphs.c?.terminalLength], [undefined, undefined, undefined]);
    assert.equal(adopted.width, .8);
    assert.equal(adopted.glyphs.H?.width, .4);
    assert.deepEqual(adopted.outlines, before.outlines);
    assert.equal(adopted.outlines.H.at?.crossbar, .3);
    actions.travel(-1);
    assert.deepEqual(useEditor.getState().params, before);
    actions.travel(1);
    actions.openInspector('H');
    actions.setScope('letter');
    actions.setParam('crossbar', .8);
    actions.resetParam('crossbar');
    assert.equal(useEditor.getState().params.glyphs.H?.crossbar, undefined);
    assert.equal(useEditor.getState().params.crossbar, .5);
    assert.deepEqual(useEditor.getState().params.outlines, before.outlines);
  });
});
