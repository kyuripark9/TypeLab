import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PAGE_STYLES, styleById } from '../shared/content';
import { buildFont } from '../shared/engine';
import { DEFAULTS, drawnAtOf, sanitizeParams, type Params } from '../shared/params';
import { TRAITS, applyTraits, sameTraitRecipe, traitOption, traitOptions, type TraitId } from '../shared/traits';
import { sourceForFont } from '../shared/source/catalog';
import { masterInfo } from '../shared/source/master-catalog';
import { weightAt } from '../shared/source/masters';
import { PROGRAM_REVISIONS, programInfo } from '../shared/source/program-catalog';
import { widthAt } from '../shared/source/width-masters';
import { actions, adjustedParams, traitLabels, useEditor } from '../client/state/editor';
import { traceOf } from '../client/lib/pen';
import { loadDesignSources } from '../server/sources';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function base(id: string): Params {
  const style = styleById(id); assert.ok(style);
  return adjustedParams(style, {});
}
function choose(p: Params, id: TraitId, choice: string): Params {
  assert.ok(traitOption(p, id, choice), `${id}:${choice} is available`);
  return applyTraits(p, { [id]: choice });
}
const bundled = PAGE_STYLES.map(style => ({ style, params: adjustedParams(style, {}) })).filter(row => row.params.sourceProgram);

describe('source trait recipes', () => {
  it('keeps every legacy option and its original recipe', () => {
    for (const def of TRAITS) {
      assert.strictEqual(traitOptions(DEFAULTS, def.id), def.options);
      for (const option of def.options) assert.strictEqual(traitOption(DEFAULTS, def.id, option.id), option);
    }
    const p = applyTraits(DEFAULTS, { weight: 'regular', width: 'normal', xHeight: 'caps', slant: 'italic', cuts: 'slice' });
    assert.deepEqual([p.weight, p.width, p.xHeight, p.slant, p.slice], [.44, .52, 1, .35, .05]);
    assert.equal(traitOption(DEFAULTS, 'slant', 'left'), undefined);
    assert.strictEqual(applyTraits(DEFAULTS, {}), DEFAULTS);
    const alreadyRegular = { ...DEFAULTS, weight: .44 };
    const repeated = applyTraits(alreadyRegular, { weight: 'regular' });
    assert.notStrictEqual(repeated, alreadyRegular, 'a supported legacy choice still makes its original copy');
    assert.deepEqual(repeated, alreadyRegular);
  });

  it('keeps the neutral card identity for original and unsupported choices in all 22 styles', () => {
    assert.equal(bundled.length, 22);
    for (const { style, params: p } of bundled) {
      const traits = { weight: 'regular', width: 'normal', xHeight: 'medium', slant: 'upright' };
      assert.strictEqual(applyTraits(p, traits), p, p.freeFont);
      assert.strictEqual(adjustedParams(style, traits), p, p.freeFont);
      assert.strictEqual(adjustedParams(style, { ends: 'round' }), p, p.freeFont);
      assert.strictEqual(adjustedParams(style, { weight: undefined }), p, p.freeFont);
      assert.deepEqual([p.slice, p.letterSpacing, p.fill], [0, .2, 'solid']);
      assert.strictEqual(adjustedParams(style, { cuts: 'none', spacing: 'normal', fill: 'solid' }), p, 'unsupported reset keys do not change the source');
      const wide = adjustedParams(style, { width: 'extended' });
      assert.notStrictEqual(wide, p, p.freeFont);
      assert.strictEqual(applyTraits(wide, { weight: 'regular' }), wide, 'a neutral choice keeps an already adjusted object');
    }
    const clear = { ...base('grotesque'), fill: 'solid' as const, slice: 0, joints: 0, stencil: 0 };
    assert.strictEqual(applyTraits(clear, { fill: 'solid', cuts: 'none' }), clear, 'unchanged reset fields keep the same object');
    const cut = { ...clear, stencil: .7, joints: .4 }, none = applyTraits(cut, { cuts: 'none' });
    assert.equal(none.stencil, 0, 'None clears a stencil now a source cuts one'); assert.equal(none.joints, 0);
    assert.deepEqual(none.sourceProgram, cut.sourceProgram);
  });

  it('keeps endpoint aliases on the neutral source card while retaining their intent', () => {
    for (const { style, params: p } of bundled) {
      const info = masterInfo(p.sourceProgram); assert.ok(info);
      if (info.defaultWeight === info.min) {
        assert.strictEqual(adjustedParams(style, { weight: 'thin' }), p, p.freeFont);
        assert.strictEqual(adjustedParams(style, { weight: 'light' }), p, p.freeFont);
      }
      if (info.defaultWeight === info.max) {
        assert.strictEqual(adjustedParams(style, { weight: 'bold' }), p, p.freeFont);
        assert.strictEqual(adjustedParams(style, { weight: 'black' }), p, p.freeFont);
      }
    }
  });

  it('resolves relative weights in custom frames and retains hidden endpoint intents', () => {
    for (const { params: original } of bundled) for (const pick of [.2, .8]) {
      const p = { ...original, freeAt: { ...original.freeAt, weight: pick } }, info = masterInfo(p.sourceProgram); assert.ok(info);
      const ids = ['thin', 'light', 'regular', 'bold', 'black'];
      const expected = [info.min, (info.min + info.defaultWeight) / 2, info.defaultWeight, (info.defaultWeight + info.max) / 2, info.max];
      ids.forEach((id, i) => near(weightAt(choose(p, 'weight', id), info), expected[i]));
      const visible = traitOptions(p, 'weight'), values = visible.map(o => weightAt(choose(p, 'weight', o.id), info));
      assert.ok(values.every((value, i) => i === 0 || value > values[i - 1]));
      assert.ok(visible.some(o => o.id === 'regular' && o.label === 'Original'));
      if (info.defaultWeight === info.min) {
        assert.equal(visible.some(o => o.id === 'thin'), false);
        assert.equal(sameTraitRecipe(traitOption(p, 'weight', 'thin')!, traitOption(p, 'weight', 'regular')!), true);
      }
    }
    assert.equal(traitOption(base('didone'), 'weight', 'regular')?.label, 'Original');
  });

  it('uses authored widths and retains Wide/Extended aliases on old endpoint-neutral programs', () => {
    for (const [style, expected] of [
      ['grotesque', [75, 87.5, 100, 125, 150]], ['humanist', [75, 87.5, 100, 125, 150]],
      ['soft', [85, 92.5, 100, 107.5, 115]], ['chunkyround', [75, 87.5, 100, 112.5, 125]]
    ] as const) for (const pick of [.2, .8]) {
      const original = base(style), p = { ...original, freeAt: { ...original.freeAt, width: pick } }, axis = programInfo(p.sourceProgram)?.width;
      assert.ok(axis);
      ['condensed', 'narrow', 'normal', 'wide', 'extended'].forEach((id, i) => near(widthAt(choose(p, 'width', id), axis), expected[i]));
    }
    for (const fontId of ['Mainline:600', 'Parlance:500']) {
      const old = PROGRAM_REVISIONS.find(program => program.ref.fontId === fontId && program.width?.max === 100); assert.ok(old?.width);
      for (const pick of [.2, .8]) {
        const p: Params = { ...base('grotesque'), sourceProgram: old.ref, freeAt: { ...base('grotesque').freeAt, width: pick } };
        assert.deepEqual(traitOptions(p, 'width').map(o => o.id), ['condensed', 'narrow', 'normal']);
        for (const id of ['normal', 'wide', 'extended']) {
          assert.equal(choose(p, 'width', id).width, pick);
          assert.equal(widthAt(choose(p, 'width', id), old.width), 100);
          assert.ok(sameTraitRecipe(traitOption(p, 'width', id)!, traitOption(p, 'width', 'normal')!));
          const neutral = { ...p, width: pick };
          assert.strictEqual(choose(neutral, 'width', id), neutral, `${fontId} ${id} is an unchanged endpoint alias`);
        }
      }
    }
  });

  it('gives historical outlines predictable geometric presets without adding Weight or Slice', () => {
    const source = sourceForFont('Couture:600'); assert.ok(source);
    for (const pick of [.2, .8]) {
      const p: Params = { ...base('didone'), sourceProgram: source,
        freeAt: { ...base('didone').freeAt, width: pick, xHeight: pick, slant: pick } };
      assert.deepEqual(traitOptions(p, 'weight'), []); assert.equal(traitOption(p, 'cuts', 'slice'), undefined);
      assert.deepEqual(['condensed', 'narrow', 'normal', 'wide', 'extended'].map(id => choose(p, 'width', id).width), [0, pick / 2, pick, (1 + pick) / 2, 1]);
      assert.equal(choose(p, 'xHeight', 'medium').xHeight, pick);
      assert.equal(choose(p, 'slant', 'upright').slant, pick);
      assert.strictEqual(applyTraits(p, { weight: 'regular', cuts: 'slice' }), p, 'unsupported choices never use legacy values');
    }
  });

  it('makes lowercase choices relative to the source without claiming cap height', () => {
    for (const id of ['grotesque', 'didone', 'chancery']) {
      const p = base(id); loadDesignSources(p); const font = buildFont(p), original = font.m.xh, cap = font.m.cap;
      near(buildFont(choose(p, 'xHeight', 'small')).m.xh, original * .88);
      near(buildFont(choose(p, 'xHeight', 'large')).m.xh, original + .3 * (cap - original));
      near(buildFont(choose(p, 'xHeight', 'caps')).m.xh, original + .6 * (cap - original));
      assert.equal(traitOption(p, 'xHeight', 'caps')?.label, 'Largest');
      assert.ok(buildFont(choose(p, 'xHeight', 'caps')).m.xh < cap);
    }
  });

  it('adds the named slant angle and omits unsupported directions', () => {
    for (const id of ['grotesque', 'didone', 'chancery']) {
      const p = base(id); loadDesignSources(p);
      for (const option of traitOptions(p, 'slant')) {
        const angle = option.id === 'left' ? -7 : option.id === 'italic' ? 7 : option.id === 'steep' ? 15 : 0;
        const glyph = buildFont(choose(p, 'slant', option.id)).glyph('H'); assert.ok(glyph);
        near(glyph.M[2], Math.tan(angle * Math.PI / 180));
      }
    }
    assert.deepEqual(traitOptions(base('chancery'), 'slant').map(o => o.id), ['left', 'upright']);
    assert.equal(choose(base('chancery'), 'slant', 'left').slant, .65);
    assert.equal(traitOption(base('chancery'), 'slant', 'italic'), undefined);
    assert.equal(traitOption(base('grotesque'), 'slant', 'left'), undefined);
  });

  it('compares the applied patch, including reset overrides', () => {
    assert.equal(sameTraitRecipe({ id: 'a', label: 'A', reset: { slice: 0, stencil: 0 }, set: { slice: .5 } },
      { id: 'b', label: 'B', set: { stencil: 0, slice: .5 } }), true);
    assert.equal(sameTraitRecipe({ id: 'a', label: 'A', set: { slice: .5 } },
      { id: 'b', label: 'B', reset: { stencil: 0 }, set: { slice: .5 } }), false);
  });
});

describe('source Adjust actions', () => {
  it('carries hidden Lightest intent through an endpoint-original style and back', () => {
    actions.newDesign(); actions.clearTraits(); actions.loadStyle('grotesque'); actions.setTrait('weight', 'thin');
    assert.equal(useEditor.getState().params.weight, 0);
    actions.loadStyle('oldstyle'); let state = useEditor.getState();
    assert.equal(state.traits.weight, 'thin'); assert.equal(state.params.weight, 0);
    assert.equal(traitOptions(base('oldstyle'), 'weight').some(o => o.id === 'thin'), false);
    assert.deepEqual(traitLabels(base('oldstyle'), state.traits), [{ id: 'weight', label: 'Weight: Lightest' }]);
    actions.loadStyle('didone'); state = useEditor.getState();
    assert.equal(state.traits.weight, 'thin'); assert.equal(state.params.weight, 0);
    assert.equal(weightAt(state.params, masterInfo(state.params.sourceProgram)!), 500);
  });

  it('applies a visible Slice gap through style selection and rejects unsupported whole-font details', () => {
    actions.newDesign(); actions.clearTraits(); actions.loadStyle('grotesque');
    loadDesignSources(useEditor.getState().params); const before = buildFont(useEditor.getState().params);
    actions.setTrait('cuts', 'slice'); let state = useEditor.getState();
    assert.deepEqual([state.params.slice, state.params.slicePos, state.params.sliceRound], [.5, .5, 0]);
    const sliced = buildFont(state.params);
    near(sliced.m.asc - before.m.asc, before.m.cap * .07);
    assert.notDeepEqual(sliced.glyph('H')?.cmds, before.glyph('H')?.cmds);
    actions.loadStyle('didone'); state = useEditor.getState(); assert.equal(state.params.slice, .5);
    assert.deepEqual(traitLabels(base('didone'), state.traits), [{ id: 'cuts', label: 'Cuts: Slice' }]);
    for (const id of ['ends', 'joined'] as const) assert.deepEqual(traitOptions(state.params, id), []);
    // serifs are added to a sans (source-shapes-v1)
    assert.ok(traitOptions(state.params, 'serif').some(o => o.set.serif === true));
    // corners round or sharpen a source's own (source-shapes-v1)
    assert.deepEqual(traitOptions(state.params, 'corners').map(o => o.label), ['Sharp', 'Soft', 'Round']);
    actions.setTrait('ends', 'round'); assert.equal(useEditor.getState().traits.ends, undefined);
  });

  it('drops source-only Left tilt when choosing a generated style and keeps legacy choices working', () => {
    for (const id of ['arcs', 'slotblocks', 'gridblocks']) {
      actions.newDesign(); actions.clearTraits(); actions.loadStyle('chancery'); actions.setTrait('slant', 'left');
      assert.equal(useEditor.getState().traits.slant, 'left');
      actions.loadStyle(id); const state = useEditor.getState();
      assert.equal(state.params.sourceProgram, null); assert.equal(state.traits.slant, undefined);
      assert.deepEqual(traitLabels(base(id), state.traits), []);
      actions.setTrait('slant', 'italic'); assert.equal(useEditor.getState().params.slant, .35);
    }
  });

  it('shuffles only available distinct source choices', t => {
    actions.newDesign(); actions.clearTraits(); actions.loadStyle('chancery');
    t.mock.method(Math, 'random', () => .1); actions.shuffleTraits();
    const state = useEditor.getState(); assert.ok(Object.keys(state.traits).length > 0);
    for (const def of TRAITS) if (state.traits[def.id]) {
      assert.ok(traitOptions(base('chancery'), def.id).some(o => o.id === state.traits[def.id]));
    }
    assert.equal(state.traits.ends, undefined);
  });

  it('leaves loaded params and Points frames untouched and undoes an explicit preset application', () => {
    const original = base('didone'); loadDesignSources(original);
    const glyph = buildFont(original).glyph('R'); assert.ok(glyph);
    const saved = sanitizeParams(JSON.parse(JSON.stringify({ ...original, weight: .44, width: .52, slant: .35, slice: .05,
      outlines: { R: { ...traceOf(glyph), at: drawnAtOf(original, 'R') } } })));
    const snapshot = structuredClone(saved);
    actions.loadDesign({ id: 'old-presets', name: 'Old presets', styleId: 'didone', params: saved, createdAt: '', updatedAt: '' });
    assert.deepEqual(useEditor.getState().params, snapshot);
    actions.setTrait('weight', 'regular'); assert.deepEqual(useEditor.getState().params, snapshot);
    actions.loadStyle('grotesque'); actions.clearTraits(); const before = useEditor.getState().params;
    actions.setTrait('width', 'wide'); const after = useEditor.getState().params;
    assert.notEqual(after.width, before.width);
    actions.travel(-1); assert.deepEqual(useEditor.getState().params, before);
    actions.travel(1); assert.deepEqual(useEditor.getState().params, after);
    assert.deepEqual(saved, snapshot);
  });
});
