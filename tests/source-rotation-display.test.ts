import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildFont } from '../shared/engine';
import { DEFAULTS, drawnAtOf, freeAtOf, rotationDeg, rotationOf, type Params } from '../shared/params';
import { programForFont } from '../shared/source/program-catalog';
import { loadSource } from '../server/sources';
import { NumberField } from '../client/components/panel/inputs';
import { numberAt, PERCENT_SCALE, rotationScale, valueAt } from '../client/lib/number-scale';
import { traceOf } from '../client/lib/pen';
import { actions, useEditor } from '../client/state/editor';

describe('source Rotation units', () => {
  it('displays and accepts the actual clockwise angle in the saved source frame', () => {
    const ref = programForFont('Mainline:600'); assert.ok(ref); loadSource(ref);
    for (const baseline of [.2, .5, .85]) {
      const scale = rotationScale(baseline);
      assert.equal(numberAt(baseline, scale), 0);
      assert.equal(numberAt(0, scale), baseline * 90);
      assert.equal(numberAt(1, scale), Number(((baseline - 1) * 90).toFixed(2)));
      for (const rotation of [0, .25, .5, .75, 1]) {
        const p = { ...DEFAULTS, sourceProgram: ref, freeFont: ref.fontId, rotation, freeAt: { ...freeAtOf(DEFAULTS), rotation: baseline } };
        const glyph = buildFont(p).glyph('H'); assert.ok(glyph);
        const actualClockwise = -Math.atan2(glyph.M[1], glyph.M[0]) * 180 / Math.PI;
        assert.ok(Math.abs(actualClockwise - numberAt(rotation, scale)) < 1e-9);
        assert.ok(Math.abs(valueAt(numberAt(rotation, scale), scale) - rotation) < 1e-12);
      }
    }
    const scale = rotationScale(.5);
    assert.equal(numberAt(.75, scale), -22.5); assert.equal(valueAt(22.5, scale), .25);
    assert.equal(valueAt(-180, scale), 1); assert.equal(valueAt(180, scale), 0);
    const field = renderToStaticMarkup(createElement(NumberField, { label: 'Rotation', value: .75, scale, onChange: () => {} }));
    assert.match(field, /value="-22.5"/); assert.match(field, /inputMode="decimal"/);
  });

  it('types a source angle through the ordinary editor coordinate and retains the saved Points frame', () => {
    const ref = programForFont('Mainline:600'); assert.ok(ref); loadSource(ref);
    const p: Params = { ...DEFAULTS, sourceProgram: ref, freeFont: ref.fontId, rotation: .75, freeAt: freeAtOf(DEFAULTS) };
    const glyph = buildFont(p).glyph('R'); assert.ok(glyph);
    const drawing = { ...traceOf(glyph), at: drawnAtOf(p, 'R') };
    const edited = { ...p, outlines: { R: drawing } };
    actions.loadDesign({ id: 'rotation-units', name: 'Rotation units', styleId: 'grotesque', params: edited, createdAt: '', updatedAt: '' });
    useEditor.setState({ scope: 'letter', inspect: 'R' });
    actions.setOption('rotation', valueAt(-22.5, rotationScale(.5)));
    assert.deepEqual(buildFont(useEditor.getState().params).glyph('R')?.cmds, glyph.cmds);
    actions.setOption('rotation', valueAt(22.5, rotationScale(.5)));
    const result = useEditor.getState().params, turned = buildFont(result).glyph('R'); assert.ok(turned);
    assert.equal(result.glyphs.R?.rotation, .25); assert.equal(result.rotation, .75);
    assert.deepEqual(result.outlines, edited.outlines);
    assert.ok(Math.abs(-Math.atan2(turned.M[1], turned.M[0]) * 180 / Math.PI - 22.5) < 1e-9);
    assert.notDeepEqual(turned.cmds, glyph.cmds);
  });

  it('retains whole-percent fields and the legacy full-turn scale', () => {
    const scale = rotationScale(null);
    for (const value of [0, .25, .499, .5, .501, .75, 1]) {
      assert.equal(numberAt(value, scale), Math.round(rotationDeg(value)) || 0);
      assert.equal(valueAt(rotationDeg(value), scale), rotationOf(Math.round(rotationDeg(value))));
    }
    assert.equal(numberAt(.075, PERCENT_SCALE), 8, 'retain the original Math.round tie behavior');
    assert.equal(numberAt(.754, PERCENT_SCALE), 75);
    assert.equal(valueAt(120, PERCENT_SCALE), 1); assert.equal(valueAt(-10, PERCENT_SCALE), 0);
  });
});
