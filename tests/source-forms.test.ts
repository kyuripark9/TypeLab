/* A source letter's alternate forms: picked per letter, drawn on the program's weight and width grid, with their own
   Points edits, accents, export, saved settings and the Letters page. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { controlInUse, pagesFor } from '../shared/content';
import { buildFont } from '../shared/engine';
import { cmdsBox, inPoly, toPolys } from '../shared/engine/geom';
import { drawnCmds, type Drawn, type Node } from '../shared/engine/outline';
import { DEFAULTS, drawnAtOf, freeAtOf, isValidParams, sanitizeParams, type Params } from '../shared/params';
import { glyphFormDrawing, formEditKey, type GlyphFormRef } from '../shared/source/forms';
import { designSourceDependencies } from '../shared/source/dependencies';
import { sourceAllows, sourceFormChoices, sourceSupports } from '../shared/source/capabilities';
import { masterInfo } from '../shared/source/master-catalog';
import { PROGRAM_REVISIONS, programForFont, programInfo } from '../shared/source/program-catalog';
import { sourceForm } from '../shared/source/registry';
import { loadDesignSources, loadSource, loadSourceMarks } from '../server/sources';
import { buildOTF } from '../server/export';
import { opentype } from '../server/opentype';
import { actions, useEditor } from '../client/state/editor';

function params(fontId: string): Params {
  const ref = programForFont(fontId), info = masterInfo(ref), width = programInfo(ref)?.width;
  assert.ok(ref && info && width); loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min), neutral = (width.neutral - width.min) / (width.max - width.min);
  return { ...DEFAULTS, sourceProgram: ref, freeFont: fontId, weight, width: neutral, freeAt: { ...freeAtOf(DEFAULTS), weight, width: neutral } };
}
const offered = PROGRAM_REVISIONS.filter(entry => entry.data.forms && programForFont(entry.ref.fontId)?.digest === entry.ref.digest);
const choice = (fontId: string, glyph: string) => programInfo(programForFont(fontId))!.data.forms!.find(c => c.glyph === glyph)!;
const picked = (p: Params, glyph: string, ref: GlyphFormRef): Params => {
  const q = { ...p, sourceForms: { ...p.sourceForms, [glyph]: ref } };
  loadDesignSources(q); return q;
};
const points = (d: Drawn) => d.contours.map(c => c.map(n => [n.x, n.y]));
const box = (d: Drawn) => cmdsBox(drawnCmds(d.contours))!;
const shift = (n: Node, dx: number): Node => ({ ...n, x: n.x + dx, ...(n.ix === undefined ? {} : { ix: n.ix + dx }), ...(n.ox === undefined ? {} : { ox: n.ox + dx }) });

describe('source letter forms', () => {
  it('offers forms on the current programs of seven styles, each drawing a letter its program draws, on its exact grid', () => {
    assert.deepEqual(offered.map(entry => entry.ref.fontId.split(':')[0]).sort(), ['Compass', 'Cotton', 'Hearth', 'Kernel', 'Mainline', 'Parlance', 'Vellum']);
    for (const entry of offered) for (const c of entry.data.forms!) {
      const p = picked(params(entry.ref.fontId), c.glyph, c.ref), form = sourceForm(c.ref);
      assert.ok(form, `${entry.ref.fontId} ${c.glyph} ${c.id}`);
      assert.equal(form.data.glyph, c.glyph);
      assert.deepEqual(form.columns.map(col => col.width), [...new Set([programInfo(entry.ref)!.width!.min, ...form.columns.map(col => col.width)])].sort((a, b) => a - b));
      // at the design's own settings the letter is the form's neutral drawing, point for point
      const info = masterInfo(entry.ref)!, neutral = programInfo(entry.ref)!.width!.neutral;
      assert.deepEqual(points(buildFont(p).glyph(c.glyph)!.drawn!), points(glyphFormDrawing(form, info.defaultWeight, neutral)), `${entry.ref.fontId} ${c.glyph}`);
      assert.notDeepEqual(buildFont(p).glyph(c.glyph)!.cmds, buildFont(params(entry.ref.fontId)).glyph(c.glyph)!.cmds);
    }
  });

  it('sits on the style\'s lines and changes only its letter, from the lightest to the heaviest and narrowest to widest', () => {
    for (const entry of offered) for (const c of entry.data.forms!) {
      const p = params(entry.ref.fontId);
      for (const at of [{}, { weight: 0 }, { weight: 1 }, { width: 0 }, { width: 1 }, { weight: 1, width: 0 }, { weight: 0, width: 1 }]) {
        const plain = buildFont({ ...p, ...at }), form = buildFont(picked({ ...p, ...at }, c.glyph, c.ref)), cap = plain.m.cap;
        const a = box(plain.glyph(c.glyph)!.drawn!), b = box(form.glyph(c.glyph)!.drawn!), what = `${entry.ref.fontId} ${c.glyph} ${c.id} ${JSON.stringify(at)}`;
        assert.ok(form.glyph(c.glyph)!.cmds.every(cmd => cmd.every(v => typeof v === 'string' || Number.isFinite(v))), what);
        // an a or g stands at the x-height (a g's ear may rise past it, as a two-storey g's does); any other at its original's top
        const xh = plain.m.xh;
        if (c.glyph === 'a') assert.ok(Math.abs(b.y1 - xh) < cap * .04, `${what} top ${b.y1} vs x-height ${xh}`);
        else if (c.glyph === 'g') assert.ok(b.y1 > xh - cap * .03 && b.y1 < xh + cap * .14, `${what} top ${b.y1} vs x-height ${xh}`);
        else assert.ok(Math.abs(a.y1 - b.y1) < cap * .04, `${what} top ${a.y1} vs ${b.y1}`);
        if (c.glyph !== 'Q') assert.ok(Math.abs(a.y0 - b.y0) < cap * (c.glyph === 'g' ? .08 : .03), `${what} foot ${a.y0} vs ${b.y0}`);
        // (a barred I is many times its stem, and a long-tailed Q sweeps on under the letter after it)
        assert.ok(b.x1 - b.x0 > cap * .05 && b.x1 - b.x0 < cap * (c.glyph === 'Q' ? 2.5 : 1.6), `${what} width`);
        for (const ch of 'Hnoe') assert.deepEqual(form.glyph(ch)!.cmds, plain.glyph(ch)!.cmds, `${what} ${ch}`);
      }
    }
  });

  it('keeps a form\'s Points edits with that form, through weight changes and back from the original', () => {
    const c = choice('Compass:300', 'a');
    const p = picked(params('Compass:300'), 'a', c.ref), a = buildFont(p).glyph('a')!.drawn!;
    const edited: Params = { ...p, outlines: { a: { ...a, at: drawnAtOf(p, 'a'), contours: a.contours.map(contour => contour.map(n => shift(n, 30))) } } };
    assert.equal(edited.outlines.a.at?.sourceForms?.a?.digest, c.ref.digest);
    assert.ok(Math.abs(box(buildFont(edited).glyph('a')!.drawn!).x0 - box(a).x0 - 30) < .5, 'drawn as edited');
    const heavy = buildFont({ ...edited, weight: 1 }).glyph('a')!.drawn!, plainHeavy = buildFont({ ...p, weight: 1 }).glyph('a')!.drawn!;
    assert.ok(Math.abs(box(heavy).x0 - box(plainHeavy).x0 - 30) < 1, 'the edit rides on the heavier form');
    assert.equal(heavy.contours.length, plainHeavy.contours.length);

    // in the editor: picked, edited, then the original picked again and the form after it, each one undo step
    actions.newDesign(); actions.clearTraits(); actions.loadStyle('geometric');
    const start = useEditor.getState().params; loadDesignSources(start);
    const original = buildFont(start).glyph('a')!.cmds;
    actions.setSourceForm('a', c.ref);
    const form = buildFont(useEditor.getState().params).glyph('a')!.drawn!;
    actions.setParam('outlines', { a: { ...form, contours: form.contours.map(contour => contour.map(n => shift(n, 30))) } }); actions.commit();
    const mine = useEditor.getState().params.outlines.a;
    assert.equal(mine.at?.sourceForms?.a?.digest, c.ref.digest);
    actions.setSourceForm('a', null);
    let s = useEditor.getState().params;
    assert.equal(s.sourceForms.a, undefined); assert.equal(s.outlines.a, undefined);
    assert.deepEqual(s.sourceFormEdits[formEditKey('a', c.ref)], mine, 'the form\'s drawing is kept');
    assert.deepEqual(buildFont(s).glyph('a')!.cmds, original, 'the original letter as it was');
    actions.setSourceForm('a', c.ref);
    s = useEditor.getState().params;
    assert.deepEqual(s.outlines.a, mine, 'and comes back with the form'); assert.deepEqual(s.sourceFormEdits, {});
    actions.travel(-1); assert.equal(useEditor.getState().params.sourceForms.a, undefined, 'a pick is one undo step');
    // a drawing made on another form than the one picked (a letter's History brought it back) stands as drawn
    const stray: Params = { ...params('Compass:300'), outlines: edited.outlines };
    loadDesignSources(stray);
    assert.deepEqual(points(buildFont(stray).glyph('a')!.drawn!), points(edited.outlines.a));
  });

  it('reads and checks the picked forms and kept drawings as saved settings, and loads what they name', () => {
    const c = choice('Cotton:300', 'a'), p = picked(params('Cotton:300'), 'a', c.ref), a = buildFont(p).glyph('a')!.drawn!;
    const drawn: Drawn = { ...a, at: drawnAtOf(p, 'a') };
    const saved: Params = { ...p, sourceForms: {}, outlines: {}, sourceFormEdits: { [formEditKey('a', c.ref)]: drawn } };
    assert.deepEqual(sanitizeParams(JSON.parse(JSON.stringify(p))).sourceForms, p.sourceForms);
    assert.ok(isValidParams(JSON.parse(JSON.stringify(saved))));
    const { sourceForms: _f, sourceFormEdits: _e, ...older } = JSON.parse(JSON.stringify(params('Cotton:300')));
    assert.ok(isValidParams(older), 'settings from before forms still read');
    const bad = sanitizeParams({ ...p, sourceForms: { a: { kind: 'glyph-form-masters-v1', digest: 'no' }, ab: c.ref }, sourceFormEdits: { 'x:a': drawn } });
    assert.deepEqual([bad.sourceForms, bad.sourceFormEdits], [{}, {}]);
    assert.equal('sourceFormEdits' in drawnAtOf(p, 'a'), false);
    assert.ok(designSourceDependencies(p).some(ref => ref.digest === c.ref.digest));
    assert.ok(designSourceDependencies(saved).some(ref => ref.digest === c.ref.digest), 'a kept drawing\'s form loads too');
  });

  it('places accents on a form and exports the form', () => {
    const c = choice('Compass:300', 'a'), p = picked(params('Compass:300'), 'a', c.ref);
    assert.ok(loadSourceMarks(p));
    const font = buildFont(p), letter = font.glyph('a')!.drawn!;
    for (const ch of 'áàâäãåāăą') {
      const accent = font.accent(ch)!.drawn!, body = box(letter), mark = box({ adv: 0, contours: accent.contours.slice(letter.contours.length) });
      assert.deepEqual(points({ adv: 0, contours: accent.contours.slice(0, letter.contours.length) }), points(letter), ch);
      if (ch === 'ą') { assert.ok(mark.y1 < body.y1 * .5, ch); continue; }
      const ink = toPolys(drawnCmds(letter.contours)), dots = toPolys(drawnCmds(accent.contours.slice(letter.contours.length))).flat();
      assert.ok(dots.filter(q => ink.filter(poly => inPoly(poly, q)).length % 2 === 1).length / dots.length < .25, `${ch} clear of its letter`);
      assert.ok(mark.y0 > body.y1 * .8 && (mark.x0 + mark.x1) / 2 > body.x0 && (mark.x0 + mark.x1) / 2 < body.x1, `${ch} over its letter`);
    }
    const read = (bytes: Buffer) => opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const otf = read(buildOTF(p, 'Forms proof')), plain = read(buildOTF(params('Compass:300'), 'Forms proof'));
    assert.equal(otf.charToGlyph('a').advanceWidth, Math.round(font.glyph('a')!.adv));
    assert.notDeepEqual(otf.charToGlyph('a').path.commands, plain.charToGlyph('a').path.commands);
    assert.deepEqual(otf.charToGlyph('n').path.commands, plain.charToGlyph('n').path.commands);
  });

  it('offers a letter\'s shapes only where a style has forms of it, by form and never by the generated letters\' shape names', () => {
    const hearth = params('Hearth:600'), dispatch = params('Dispatch:400');
    assert.ok(controlInUse('gForm', hearth) && pagesFor(hearth).some(page => page.id === 'letters'));
    assert.equal(controlInUse('gForm', dispatch), false);
    assert.deepEqual(sourceFormChoices(hearth, 'g').map(c => c.label), ['Two-storey']);
    assert.ok(sourceSupports(hearth, 'gForm') && sourceSupports(hearth, 'gForm', 'g'));
    assert.equal(sourceSupports(hearth, 'gForm', 'e'), false);
    assert.equal(sourceAllows(hearth, 'gForm', 'double'), false);
    assert.equal(controlInUse('gForm', hearth, 'e'), false);
    // a letter in another form has none of the original letter's features
    assert.ok(sourceSupports(hearth, 'tail', 'R'));
    assert.equal(sourceSupports({ ...hearth, sourceForms: { R: choice('Hearth:600', 'R').ref } }, 'tail', 'R'), false);
  });
});
