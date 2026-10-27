import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFont } from '../shared/engine';
import { DEFAULTS, drawnAtOf, freeAtOf, type Params } from '../shared/params';
import { programForFont, programInfo } from '../shared/source/program-catalog';
import { masterInfo } from '../shared/source/master-catalog';
import { sourceSupports } from '../shared/source/capabilities';
import { loadDesignSources, loadSource } from '../server/sources';
import { buildOTF } from '../server/export';
import { opentype } from '../server/opentype';
import { traceOf } from '../client/lib/pen';
import { actions, useEditor } from '../client/state/editor';

function params(fontId: string): Params {
  const ref = programForFont(fontId), info = masterInfo(ref), width = programInfo(ref)?.width;
  assert.ok(ref && info); loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min);
  const neutralWidth = width ? (width.neutral - width.min) / (width.max - width.min) : DEFAULTS.width;
  return { ...DEFAULTS, sourceProgram: ref, freeFont: fontId, weight, width: neutralWidth,
    freeAt: { ...freeAtOf(DEFAULTS), weight, width: neutralWidth } };
}

describe('source spacing', () => {
  it('uses the installed advances in text, word wrapping, and hard wrapping, including narrow marks and spaces', () => {
    const base: Params = { ...params('Serenade:400'), sideBearing: 0, wordSpacing: 0 }, mark = buildFont(base).glyph("'")?.drawn;
    assert.ok(mark);
    // no bundled width draws a mark narrower than the tightest tracking, so the apostrophe is redrawn narrow in Points
    const before: Params = { ...base, outlines: { "'": { ...mark, adv: 55, at: drawnAtOf(base, "'") } } };
    for (const letterSpacing of [0, .2, .4]) {
      const p = { ...before, letterSpacing }, preview = buildFont(p);
      const bytes = buildOTF(p, 'Source spacing proof');
      const installed = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      if (letterSpacing === 0) {
        assert.ok(preview.advance("'") + preview.m.track < 20);
        assert.ok(preview.m.space + preview.m.track < 0);
        assert.equal(installed.charToGlyph("'").advanceWidth, 20);
        assert.equal(installed.charToGlyph(' ').advanceWidth, 40);
        assert.equal(installed.charToGlyph('\u00a0').advanceWidth, 40);
        const wrapped = preview.layout("'''''''", 100);
        assert.deepEqual(wrapped.map(line => line.items.map(item => item.x)), [[0, 20, 40], [0, 20, 40], [0]]);
        assert.equal(wrapped[0].width, 40 + preview.advance("'"), 'line bounds exclude trailing tracking and advance flooring');
        assert.deepEqual(preview.layout("' '", 110).map(line => line.items.map(item => item.ch)), [["'"], ["'"]]);
        assert.deepEqual(preview.layout("' '", 120)[0].items.map(item => item.x), [0, 20, 60]);
      }
      for (const text of ["'' \u00a0'i", "'' ii '' ii", "'i'i'i'i'i"]) {
        for (const maxWidth of [120, 260, 10000]) {
          const lines = preview.layout(text, maxWidth);
          if (maxWidth === 120) assert.ok(lines.length > 1);
          for (const line of lines) {
            let expected = 0;
            for (const item of line.items) {
              assert.equal(item.x, expected, `${letterSpacing}: ${JSON.stringify(text)} at ${maxWidth}`);
              assert.equal(item.adv, preview.advance(item.ch), 'drawing bearings retain the untracked advance');
              const width = installed.charToGlyph(item.ch).advanceWidth; assert.ok(width !== undefined);
              expected += width;
            }
          }
        }
      }
    }
  });

  it('changes text placement without changing the glyph or its editable Points', () => {
    const p = params('Mainline:600'), normal = buildFont(p), loose = buildFont({ ...p, letterSpacing: .4, wordSpacing: .7 });
    const glyph = normal.glyph('H'), changed = loose.glyph('H'); assert.ok(glyph && changed);
    assert.deepEqual(changed.cmds, glyph.cmds); assert.deepEqual(traceOf(changed), traceOf(glyph));
    assert.equal(loose.layout('HH', 10000)[0].items[1].x - normal.layout('HH', 10000)[0].items[1].x, 52);
    assert.ok(loose.layout('H H', 10000)[0].items[2].x > normal.layout('H H', 10000)[0].items[2].x);
  });

  it('applies the Spacing Adjust choices and carries them through style selection without enabling Mono', () => {
    actions.newDesign(); actions.clearTraits(); actions.loadStyle('grotesque');
    useEditor.setState({ scope: 'all', inspect: null });
    for (const [choice, value] of [['tight', .04], ['normal', .2], ['loose', .4]] as const) {
      actions.setTrait('spacing', choice);
      assert.equal(useEditor.getState().traits.spacing, choice);
      assert.equal(useEditor.getState().params.letterSpacing, value);
    }
    actions.loadStyle('didone'); const p = useEditor.getState().params; loadDesignSources(p);
    assert.equal(useEditor.getState().traits.spacing, 'loose'); assert.equal(p.letterSpacing, .4);
    assert.equal(p.sourceProgram?.fontId, 'Couture:600');
    assert.ok(buildFont(p).layout('HH', 10000)[0].items[1].x > buildFont({ ...p, letterSpacing: .2 }).layout('HH', 10000)[0].items[1].x);
    assert.equal(p.mono, 0);
    assert.equal(sourceSupports(p, 'mono'), !!programInfo(p.sourceProgram)?.data.spacing);
    actions.setTrait('spacing', 'mono'); assert.equal(useEditor.getState().traits.spacing, 'mono');
    assert.equal(useEditor.getState().params.mono, 1);
    actions.setTrait('spacing', 'normal'); assert.equal(useEditor.getState().params.mono, 0);
  });

  it('keeps legacy text placement on its original unrounded rule', () => {
    const font = buildFont({ ...DEFAULTS, sourceProgram: null, letterSpacing: .137, wordSpacing: .123 });
    const line = font.layout('i i', 10000)[0];
    assert.equal(line.items[1].x, font.advance('i') + font.m.track);
    assert.equal(line.items[2].x, font.advance('i') + font.m.track + font.advance(' ') + font.m.track);
  });
});
