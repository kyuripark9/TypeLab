/* A source's accented letters: its program's authored marks composed on its own letters, as edited, in exports. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACCENTED, buildFont } from '../shared/engine';
import { cmdsBox, inPoly, toPolys } from '../shared/engine/geom';
import { drawnCmds, type Node } from '../shared/engine/outline';
import { DEFAULTS, drawnAtOf, freeAtOf, type Params } from '../shared/params';
import { MASTER_REVISIONS, masterInfo } from '../shared/source/master-catalog';
import { PROGRAM_REVISIONS, programForFont, programInfo } from '../shared/source/program-catalog';
import { sourceAccents } from '../shared/source/capabilities';
import { sourceMarks } from '../shared/source/registry';
import { componentOwnership } from '../shared/source/components';
import { loadSource, loadSourceMarks } from '../server/sources';
import { buildOTF, buildSpecimenSVG } from '../server/export';
import { opentype } from '../server/opentype';

function params(fontId: string): Params {
  const ref = programForFont(fontId), info = masterInfo(ref), width = programInfo(ref)?.width;
  assert.ok(ref && info && width); loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min), neutral = (width.neutral - width.min) / (width.max - width.min);
  return { ...DEFAULTS, sourceProgram: ref, freeFont: fontId, weight, width: neutral, freeAt: { ...freeAtOf(DEFAULTS), weight, width: neutral } };
}
const FONTS = [...new Set(MASTER_REVISIONS.map(info => info.ref.fontId))];
/** The mark's contours of an accented letter: those after its letter's. */
const markOf = (accent: { drawn?: { contours: unknown[] } }, letterContours: number) => accent.drawn!.contours.slice(letterContours);

describe('source accents', () => {
  it('composes every accented letter in every current program, its letter as drawn and its mark beside it', () => {
    for (const fontId of FONTS) {
      const p = params(fontId); assert.equal(sourceAccents(p), true, fontId); assert.equal(loadSourceMarks(p), true);
      const font = buildFont(p), marks = sourceMarks(programInfo(p.sourceProgram)!.data.marks!); assert.ok(marks);
      for (const ch of ACCENTED) {
        const recipe = marks.recipes.get(ch); assert.ok(recipe, `${fontId} ${ch}`);
        const accent = font.accent(ch), letter = font.glyph(recipe.base); assert.ok(accent?.drawn && letter?.drawn, `${fontId} ${ch}`);
        assert.ok(accent.cmds.every(c => c.every(v => typeof v === 'string' || Number.isFinite(v))), `${fontId} ${ch} finite`);
        assert.ok(accent.adv >= letter.adv && accent.adv < letter.adv + 400, `${fontId} ${ch} advance`);
        if (recipe.omitComponents.length) continue;
        // the letter is the font's own, point for point; the mark comes after it
        assert.deepEqual(accent.drawn.contours.slice(0, letter.drawn.contours.length), letter.drawn.contours, `${fontId} ${ch} letter`);
        const mark = cmdsBox(drawnCmds(markOf(accent, letter.drawn.contours.length) as typeof letter.drawn.contours)), body = cmdsBox(letter.cmds);
        assert.ok(mark && body, `${fontId} ${ch} mark`);
        const kind = recipe.mark?.attachment;
        // clear of its letter's ink (not its box: a g's ear, a script capital's flourish rise past the mark), save where
        // a ring or an attached mark is drawn to touch it
        if (kind === 'above') {
          const ink = toPolys(letter.cmds), points = toPolys(drawnCmds(markOf(accent, letter.drawn.contours.length) as typeof letter.drawn.contours)).flat();
          const inside = points.filter(q => ink.filter(poly => inPoly(poly, q)).length % 2 === 1).length / points.length;
          assert.ok(inside < .25, `${fontId} ${ch} stands clear of its letter: ${Math.round(inside * 100)}% inside`);
        }
        // (under the baseline: a script capital's flourish or a hand-drawn N's stroke may reach further down)
        if (kind === 'below') assert.ok(mark.y1 < 20, `${fontId} ${ch} hangs under the baseline`);
        if (kind === 'side') assert.ok(mark.x0 > body.x0 && mark.y0 > body.y1 * .4, `${fontId} ${ch} stands beside the top of its letter's stem`);
        // within a mark's width of the letter's ink (a slanted hand's comma stands under its l's foot, left of the stem)
        const reach = mark.x1 - mark.x0;
        if (kind === 'above' || kind === 'below') assert.ok(mark.x1 > body.x0 - reach && mark.x0 < body.x1 + reach, `${fontId} ${ch} by its letter's ink`);
      }
    }
  });

  it('takes the i\'s dot off for ı and the accented i\'s, and only that', () => {
    for (const fontId of FONTS) {
      const p = params(fontId); loadSourceMarks(p);
      const font = buildFont(p), i = font.glyph('i'), dotless = font.accent('ı');
      const components = programInfo(p.sourceProgram)?.data.components; assert.ok(components && i?.drawn && dotless?.drawn);
      const marks = sourceMarks(programInfo(p.sourceProgram)!.data.marks!)!, tittle = componentOwnership(marks.components, 'i')?.bindings.find(b => b.id === 'tittle');
      assert.ok(tittle, fontId);
      assert.equal(dotless.drawn.contours.length, i.drawn.contours.length - tittle.contours.length, fontId);
      assert.deepEqual(dotless.drawn.contours, i.drawn.contours.filter((_, ci) => !tittle.contours.includes(ci)), fontId);
      for (const ch of 'íìîïī') assert.deepEqual(font.accent(ch)?.drawn?.contours.slice(0, dotless.drawn.contours.length), dotless.drawn.contours, `${fontId} ${ch}`);
    }
  });

  it('follows the letter\'s Points edits, its own settings, weight, width and heights, keeping the mark\'s drawn size', () => {
    const p = params('Mainline:600'); loadSourceMarks(p);
    const plain = buildFont(p), e = plain.glyph('e'), acute = plain.accent('é'); assert.ok(e?.drawn && acute?.drawn);
    const shift = (n: Node): Node => ({ ...n, x: n.x + 30, ...(n.ix === undefined ? {} : { ix: n.ix + 30 }), ...(n.ox === undefined ? {} : { ox: n.ox + 30 }) });
    const edited: Params = { ...p, outlines: { e: { ...e.drawn, at: drawnAtOf(p, 'e'), contours: e.drawn.contours.map(c => c.map(shift)) } } };
    const moved = buildFont(edited).accent('é'); assert.ok(moved?.drawn);
    const before = cmdsBox(drawnCmds(markOf(acute, e.drawn.contours.length) as typeof e.drawn.contours))!;
    const after = cmdsBox(drawnCmds(markOf(moved, e.drawn.contours.length) as typeof e.drawn.contours))!;
    assert.ok(Math.abs(after.x0 - before.x0 - 30) < .5 && Math.abs(after.y0 - before.y0) < .5, 'the mark rides on the edited letter');

    const heavy = buildFont({ ...p, glyphs: { e: { weight: 1 } } }), heavyE = heavy.glyph('e'), heavyAcute = heavy.accent('é');
    assert.ok(heavyE?.drawn && heavyAcute?.drawn);
    assert.deepEqual(heavyAcute.drawn.contours.slice(0, heavyE.drawn.contours.length), heavyE.drawn.contours, 'the letter\'s own weight');
    assert.deepEqual(heavy.accent('á')?.cmds, plain.accent('á')?.cmds, 'another letter keeps the design\'s');

    const tall = buildFont({ ...p, xHeight: 1 }), tallE = tall.glyph('e')!, tallAcute = tall.accent('é')!;
    const size = (b: ReturnType<typeof cmdsBox>) => [b!.x1 - b!.x0, b!.y1 - b!.y0];
    const tallMark = cmdsBox(drawnCmds(markOf(tallAcute, tallE.drawn!.contours.length) as typeof e.drawn.contours))!;
    size(tallMark).forEach((v, k) => assert.ok(Math.abs(v - size(before)[k]) < .5, 'a taller lowercase keeps the mark\'s size'));
    assert.ok(tallMark.y0 > before.y0 + 50, 'and lifts it with the letter');

    for (const changes of [{ weight: 0 }, { weight: 1 }, { width: 0 }, { width: 1 }, { slant: 1 }, { mirror: 'mirrored' as const }, { rotation: .7 }]) {
      const font = buildFont({ ...p, ...changes });
      for (const ch of 'ÁÅÇĎďğľőřşŻį') assert.ok(font.accent(ch)?.cmds.length, `${JSON.stringify(changes)} ${ch}`);
    }
  });

  it('spaces and finishes an accented letter as its letter: Mono, Shadow, Outline', () => {
    const p = params('Couture:600'); loadSourceMarks(p);
    const mono = buildFont({ ...p, mono: 1 });
    assert.equal(mono.accent('é')?.adv, mono.glyph('e')?.adv);
    const shadow = buildFont({ ...p, fill: 'shadow', module: 1 }), plain = buildFont(p);
    assert.ok(shadow.accent('ü')!.cmds.length > plain.accent('ü')!.cmds.length);
    assert.equal(shadow.accent('ü')!.adv, shadow.glyph('u')!.adv);
    assert.notDeepEqual(buildFont({ ...p, fill: 'outline' }).accent('Ö')?.cmds, plain.accent('Ö')?.cmds);
  });

  it('exports the accented letters only when asked, from programs that pin marks', () => {
    const p = params('Hearth:600');
    const read = (bytes: Buffer) => opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const plain = read(buildOTF(p, 'Accents proof')), accented = read(buildOTF(p, 'Accents proof', undefined, undefined, true));
    assert.equal(accented.glyphs.length, plain.glyphs.length + ACCENTED.length);
    const font = buildFont(p);
    for (const ch of 'ÅçĎďőı') {
      assert.equal(plain.charToGlyph(ch).name, '.notdef');
      assert.equal(accented.charToGlyph(ch).advanceWidth, Math.round(font.accent(ch)!.adv), ch);
      assert.ok(accented.charToGlyph(ch).path.commands.length > 4, ch);
    }
    assert.deepEqual([accented.ascender, accented.descender], [plain.ascender, plain.descender], 'the line spacing stays');
    assert.match(buildSpecimenSVG(p, 'Accents proof', true), /<path/);
    assert.ok(buildSpecimenSVG(p, 'Accents proof', true).length > buildSpecimenSVG(p, 'Accents proof').length);

    const older = PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === 'Hearth:600' && !entry.data.marks);
    assert.ok(older); loadSource(older.ref);
    const old: Params = { ...p, sourceProgram: older.ref };
    assert.equal(sourceAccents(old), false);
    assert.equal(loadSourceMarks(old), false);
    assert.throws(() => buildOTF(old, 'Accents proof', undefined, undefined, true), /no authored accented glyphs/);
    assert.equal(buildFont(old).accent('é'), null);
  });
});
