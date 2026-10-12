/* The editor's store (client/state/editor.ts), run without a browser: starting a design in its free font,
   a customized letter's own values, loading a style over changes, renaming, and how far undo reaches. Nothing here
   draws a design written in a free font, which would fetch the font from the server. */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { STYLES } from '../shared/content';
import { STYLE_FONTS } from '../shared/free-fonts';
import { DEFAULTS, freeAtOf } from '../shared/params';
import { actions, isDirty, useEditor } from '../client/state/editor';

const state = () => useEditor.getState();
const serif = STYLES.find(s => s.id === 'serif')!;

describe('the editor', () => {
  beforeEach(() => {
    actions.newDesign();
    useEditor.setState({ scope: 'all', inspect: null, toast: null });
  });

  it('starts a style in its free font, spaced as the font spaces its letters', () => {
    actions.loadStyle('serif');
    assert.equal(state().params.freeFont, STYLE_FONTS.serif);
    assert.deepEqual(state().params.freeAt, freeAtOf(serif.params));
    assert.deepEqual([state().params.letterSpacing, state().params.wordSpacing], [DEFAULTS.letterSpacing, DEFAULTS.wordSpacing]);
  });

  it('starts a style built from blocks in its own letters, as no font draws them', () => {
    actions.loadStyle('slotblocks');
    assert.equal(state().styleId, 'slotblocks');
    assert.equal(state().params.build, 'blocks');
    assert.equal(state().params.freeFont, '');
    assert.deepEqual(state().params.freeAt, {});
  });

  it('gives a letter being customized its own values, and drops what follows the rest again', () => {
    useEditor.setState({ scope: 'letter', inspect: 'a' });
    actions.setOption('weight', 0.8);
    assert.equal(state().params.glyphs.a?.weight, 0.8);
    assert.equal(state().params.weight, DEFAULTS.weight);
    actions.setEnd('0e', 0.9);
    actions.commit();
    assert.deepEqual(state().params.glyphs.a?.terminalEnds, { '0e': 0.9 });
    // an end following the letter again leaves no empty map behind, and a letter with nothing of its own goes
    actions.resetEnd('0e');
    assert.ok(!('terminalEnds' in state().params.glyphs.a!));
    actions.shareParam('a', 'weight');
    assert.ok(!('a' in state().params.glyphs));
  });

  it('loads a style in place of changes, with a way back to them', () => {
    actions.loadStyle('serif');
    actions.setOption('weight', 0.9);
    actions.loadStyle('slab');
    assert.equal(state().styleId, 'slab');
    assert.equal(state().toast?.action?.label, 'Undo');
    state().toast!.action!.run();
    assert.equal(state().styleId, 'serif');
    assert.equal(state().params.weight, 0.9);
  });

  it('counts a rename as saved, and keeps the other changes unsaved', () => {
    actions.loadDesign({ id: 'd1', name: 'Mine', styleId: 'serif', params: serif.params, createdAt: '', updatedAt: '' });
    assert.equal(isDirty(state()), false);
    actions.setOption('weight', 0.9);
    actions.markRenamed('Renamed');
    assert.equal(state().name, 'Renamed');
    assert.equal(isDirty(state()), true);
    // with the change undone, only the name differed, and that is saved
    actions.travel(-1);
    assert.equal(isDirty(state()), false);
  });

  it('keeps the last 200 steps to undo', () => {
    for (let i = 1; i <= 250; i++) actions.setOption('weight', i / 1000);
    assert.equal(state().history.length, 200);
    assert.equal(state().hi, 199);
    for (let i = 0; i < 300; i++) actions.travel(-1);
    assert.equal(state().params.weight, 51 / 1000);
  });
});
