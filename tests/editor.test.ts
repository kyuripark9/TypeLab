/* The editor's store (client/state/editor.ts), run without a browser: starting a design in its free font,
   a customized letter's own values, a letter drawn in Points keeping the settings it was drawn at, loading a style
   over changes, renaming, a change folded into the last undo step, how far undo reaches, and each letter's record of
   its edits and the font's History (kept past undo, brought back, saved and loaded), and a control's highlight put
   away once its value is changed. Nothing here
   draws a design written in a free font, which would fetch the font from the server. */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { STYLES } from '../shared/content';
import { STYLE_FONTS } from '../shared/free-fonts';
import { DEFAULTS, freeAtOf } from '../shared/params';
import { actions, designInput, hlKeyOf, isDirty, useEditor } from '../client/state/editor';

const state = () => useEditor.getState();
const serif = STYLES.find(s => s.id === 'serif')!, slab = STYLES.find(s => s.id === 'slab')!;

describe('the editor', () => {
  beforeEach(() => {
    actions.newDesign();
    useEditor.setState({ scope: 'all', inspect: null, toast: null });
  });

  it('lights a control\'s or a part\'s parts when pointed at, and puts them away once a value changes till another is', () => {
    actions.setCategory('weight');
    actions.focusControl('serifSize');
    assert.equal(hlKeyOf(state()), 'serif');
    // a drag: each move points at the control again and sets its value
    actions.setParam('serifSize', 0.6);
    actions.focusControl('serifSize');
    actions.setParam('serifSize', 0.7);
    actions.commit();
    assert.equal(hlKeyOf(state()), null, 'the design reads in plain ink while it is adjusted');
    actions.focusControl('serifSize');
    assert.equal(hlKeyOf(state()), null, 'and stays so on the same control');
    actions.focusControl('weight');
    assert.equal(hlKeyOf(state()), 'weight');
    actions.setOption('weight', 0.7);
    actions.setHot(false);
    actions.focusControl('weight');
    assert.equal(hlKeyOf(state()), 'weight', 'coming back to the controls lights it again');
    // the inspector's letter too: a part dragged reads in plain ink till another part is pointed at
    actions.setPart('stem');
    actions.setParam('weight', 0.8);
    assert.equal(state().adjusted, true);
    actions.setPart(null);
    assert.equal(state().adjusted, true, 'moving off the part keeps it so');
    actions.setPart('bowl');
    assert.equal(state().adjusted, false);
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

  it('keeps with a letter drawn in Points the settings it was drawn at, and resets it with its own settings', () => {
    useEditor.setState({ scope: 'letter', inspect: 'l' });
    actions.setOption('weight', 0.8);
    const l = { adv: 320, contours: [[{ x: 60, y: 0 }, { x: 260, y: 0 }, { x: 260, y: 700 }, { x: 60, y: 700 }]] };
    actions.setParam('outlines', { l });
    actions.commit();
    // drawn at the letter's own weight, and at the design's other settings
    const drawn = state().params.outlines.l;
    assert.equal(drawn.at?.weight, 0.8);
    assert.equal(drawn.at?.width, state().params.width);
    assert.deepEqual(drawn.contours, l.contours);
    // a drawing written again as it was keeps its own
    actions.setOption('weight', 0.2);
    actions.setParam('outlines', { ...state().params.outlines });
    assert.equal(state().params.outlines.l, drawn);
    // Reset gives the letter back to the font: its own settings and its drawing go together, in one undo step
    actions.syncLetter('l');
    assert.ok(!('l' in state().params.glyphs) && !('l' in state().params.outlines));
    actions.travel(-1);
    assert.equal(state().params.outlines.l.at?.weight, 0.8);
    assert.equal(state().params.glyphs.l?.weight, 0.2);
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

  it('folds a change into the last undo step, so one undo takes both back, and only into the newest', () => {
    const was = [state().params.weight, state().params.contrast];
    actions.setOption('weight', 0.7);
    const steps = state().history.length;
    // (as an edit in Points carried on to the letters shaped the same way: a second write after the first's commit)
    actions.setParam('contrast', 0.9);
    actions.amend();
    assert.equal(state().history.length, steps, 'no new step');
    actions.travel(-1);
    assert.deepEqual([state().params.weight, state().params.contrast], was);
    actions.travel(1);
    assert.deepEqual([state().params.weight, state().params.contrast], [0.7, 0.9]);
    // an older step, undone to, takes nothing more
    actions.travel(-1);
    actions.setParam('contrast', 0.2);
    actions.amend();
    actions.travel(1);
    assert.equal(state().params.contrast, 0.9);
  });

  it('records each of a letter\'s own edits past undo, brings any back in one undo step, and saves the record', () => {
    useEditor.setState({ scope: 'letter', inspect: 'a' });
    actions.setOption('weight', 0.8);
    actions.setOption('width', 0.3);
    assert.deepEqual(state().log.a.map(e => e.keys), [['weight'], ['width']]);
    // undone, the edits stay in the record
    actions.travel(-2);
    assert.ok(!('a' in state().params.glyphs));
    assert.equal(state().log.a.length, 2);
    // brought back to how it stood after the first: one undo step, recorded as brought back
    const first = state().log.a[0], steps = state().hi;
    assert.equal(actions.restoreLetter('a', first), true);
    assert.deepEqual(state().params.glyphs.a, { weight: 0.8 });
    assert.equal(state().hi, steps + 1);
    assert.equal(state().log.a.at(-1)!.back, first.t);
    assert.equal(actions.restoreLetter('a', first), false, 'it stands so already');
    actions.travel(-1);
    assert.ok(!('a' in state().params.glyphs));
    // the record goes with a save, packed, and comes back with the design
    const input = designInput(state());
    actions.loadDesign({ id: 'd2', name: 'Kept', styleId: state().styleId, params: input.params, log: JSON.parse(JSON.stringify(input.log)), createdAt: '', updatedAt: '' });
    assert.deepEqual(state().log.a.map(e => e.own), [{ weight: 0.8 }, { weight: 0.8, width: 0.3 }, { weight: 0.8 }]);
  });

  it('records a Reset, so a drawn letter comes back after it, and the letters an edit in Points went on to', () => {
    useEditor.setState({ scope: 'all', inspect: 'l' });
    const box = (x: number) => ({ adv: 320, contours: [[{ x, y: 0 }, { x: 260, y: 0 }, { x: 260, y: 700 }, { x, y: 700 }]] });
    actions.setParam('outlines', { l: box(60) });
    actions.commit();
    // (carried on to the i, in the edit's undo step)
    actions.setParam('outlines', { ...state().params.outlines, i: box(80) });
    actions.amend();
    assert.deepEqual(state().log.i.map(e => [e.keys, e.by]), [[['points'], 'l']]);
    const drawn = state().params.outlines.l;
    actions.syncLetter('l');
    assert.deepEqual(state().log.l.map(e => !!e.drawn), [true, false]);
    assert.equal(actions.restoreLetter('l', state().log.l[0]), true);
    assert.deepEqual(state().params.outlines.l, drawn, 'with the settings it was drawn at');
  });

  it('records nothing for a style or a design file taking the settings\' place, and takes in the file\'s record', () => {
    useEditor.setState({ scope: 'letter', inspect: 'a' });
    actions.setOption('weight', 0.8);
    actions.loadStyle('slab');
    assert.ok(!('a' in state().params.glyphs));
    assert.equal(state().log.a.length, 1);
    const b = { t: 5, keys: ['width'], own: { width: 0.2 } };
    actions.replaceParams({ ...state().params, glyphs: { b: { width: 0.2 } } }, undefined, { b: [b] });
    assert.deepEqual(state().log, { a: state().log.a, b: [b] });
  });

  it('records every change in the font\'s History past undo, brings any version back in one undo step, and saves it', () => {
    actions.setOption('weight', 0.8);
    useEditor.setState({ scope: 'letter', inspect: 'a' });
    actions.setOption('width', 0.3);
    actions.loadStyle('slab');
    assert.deepEqual(state().versions.map(v => [v.keys, v.letters, v.made ?? null]),
      [[[], [], null], [['weight'], [], null], [[], ['a'], null], [state().versions[3].keys, ['a'], 'style']]);
    // undone, the versions stay
    actions.travel(-3);
    assert.equal(state().versions.length, 4);
    // the font as it was after the letter's edit: its style, settings and the letter's own, in one undo step (the
    // History first noting how it stood, undone to its start)
    const v = state().versions[2], steps = state().hi;
    assert.equal(actions.restoreVersion(v), true);
    assert.equal(state().hi, steps + 1);
    assert.deepEqual([state().styleId, state().params.weight, state().params.glyphs.a], [v.styleId, 0.8, { width: 0.3 }]);
    assert.equal(state().versions.at(-1)!.back, v.t);
    assert.equal(actions.restoreVersion(v), false, 'it stands so already');
    // the History goes with a save, packed, and comes back with the design
    const input = designInput(state());
    actions.loadDesign({ id: 'd3', name: 'Kept', styleId: state().styleId, params: input.params, versions: JSON.parse(JSON.stringify(input.versions)), createdAt: '', updatedAt: '' });
    assert.deepEqual(state().versions.map(x => x.params.weight), [DEFAULTS.weight, 0.8, 0.8, slab.params.weight, DEFAULTS.weight, 0.8]);
    // the first change after opening it goes on from its newest version
    actions.setOption('contrast', 0.1);
    assert.equal(state().versions.length, 7);
  });

  it('keeps the last 200 steps to undo', () => {
    for (let i = 1; i <= 250; i++) actions.setOption('weight', i / 1000);
    assert.equal(state().history.length, 200);
    assert.equal(state().hi, 199);
    for (let i = 0; i < 300; i++) actions.travel(-1);
    assert.equal(state().params.weight, 51 / 1000);
  });
});
