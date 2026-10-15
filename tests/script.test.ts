import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CHARSET, buildFont } from '../shared/engine';
import { hasGlyph } from '../shared/engine/font';
import { STYLES } from '../shared/content';
import { freeFont, registerFreeFont } from '../shared/engine';
import { STYLE_FONTS } from '../shared/free-fonts';
import { DEFAULTS, freeAtOf, isValidParams, sanitizeParams, type Params } from '../shared/params';
import { buildOTF } from '../server/export';
import { FreeFonts } from '../server/free-fonts';
import { opentype } from '../server/opentype';

/* The script settings, the panel's Handwriting page: Cursive, the joined-up script letters the engine writes a design
   more than half cursive in (script.ts), their high joins (the 'hi' forms, set by the layout and exported as contextual
   alternates), and Swell; and Letterforms, taken out: a design in a font is written in the font's own letters. The Lowercase height scale, down to a copperplate's x-height, and moving older designs onto it are in
   params.test.ts. */

/** A light, slanted script of high contrast and a small x-height, as a copperplate is written. */
const copperplate: Params = { ...DEFAULTS, cursive: 1, weight: 0.36, contrast: 1, slant: 1, xHeight: 0.1 };
const area = (d: string) => {
  // the ink of an outline, near enough: the shoelace sum over its points and handles, contour by contour
  let a = 0;
  for (const part of d.split('M').filter(Boolean)) {
    const v = (part.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 3 < v.length; i += 2) a += v[i] * v[i + 3] - v[i + 2] * v[i + 1];
  }
  return Math.abs(a / 2);
};

describe('cursive and the script letters', () => {
  it('cursive switches to italic letterforms and adds exit strokes', () => {
    const print = buildFont(DEFAULTS), script = buildFont({ ...DEFAULTS, cursive: 0.45 });
    assert.ok(script.glyph('n')!.marks.some(k => k.type === 'exit'));
    assert.ok(!print.glyph('n')!.marks.some(k => k.type === 'exit'));
    assert.notEqual(print.glyph('y')!.d, script.glyph('y')!.d);
  });

  it('writes the letters as a joined-up script, every small letter joining the next on one line', () => {
    const print = buildFont(DEFAULTS), script = buildFont({ ...DEFAULTS, cursive: 1 });
    const xh = script.m.xh;
    for (const ch of 'abcdefghijklmnopqrstuvwxyzAQRZ') {
      const g = script.glyph(ch)!;
      assert.ok(g.d && g.d !== print.glyph(ch)!.d, ch);
    }
    // a design the engine draws more than half cursive is written; less, printed
    assert.ok(script.glyph('n')!.lsb + script.glyph('n')!.rsb === 0 && print.glyph('n')!.lsb > 0);
    assert.ok(buildFont({ ...DEFAULTS, cursive: 0.45 }).glyph('n')!.lsb > 0);
    // each small letter's join crosses its left edge and its right edge at the same height (JY in script.ts), so they
    // meet; b o v w leave from their tops, level across the right edge at HY, where the next letter's 'hi' form comes in
    const at = (pts: { x: number; y: number }[], x: number, y: number) => pts.some(p => Math.abs(p.x - x) < 1.5 && Math.abs(p.y - xh * y) < 1.5);
    const JY = 0.5, HY = 0.84;
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
      const g = script.glyph(ch)!, hi = script.glyph(ch, 'hi')!;
      assert.ok(at(g.skeleton.flat(), 0, JY) && at(g.skeleton.flat(), g.bodyW, 'bovw'.includes(ch) ? HY : JY), ch);
      assert.ok(hi !== g && at(hi.skeleton.flat(), 0, HY) && at(hi.skeleton.flat(), hi.bodyW, 'bovw'.includes(ch) ? HY : JY), ch);
      assert.equal(g.adv, hi.adv, ch);
      assert.equal(g.lsb + g.rsb, 0, ch);
    }
  });

  it('writes a letter after b, o, v or w in the form that takes its high join, and no other', () => {
    const script = buildFont({ ...DEFAULTS, cursive: 1 }), alts = (t: string) => script.layout(t, Infinity)[0].items.map(it => it.alt ?? '-').join(' ');
    assert.equal(alts('ovo'), '- hi hi');
    assert.equal(alts('now'), '- - hi');
    assert.equal(alts('nun'), '- - -');
    assert.equal(alts('o o'), '- - -');
    assert.equal(alts('bA'), '- -');
    // print letters have no such form
    const print = buildFont(DEFAULTS);
    assert.equal(print.glyph('n', 'hi'), print.glyph('n'));
    assert.equal(print.layout('on', Infinity)[0].items[1].alt, undefined);
  });

  it('exports the high joins as contextual alternates', () => {
    const otf = opentype.parse(buildOTF({ ...DEFAULTS, cursive: 1 }, 'Joined').buffer as ArrayBuffer), gsub = otf.tables.gsub;
    assert.deepEqual(gsub.features.map((f: { tag: string }) => f.tag), ['calt']);
    const name = (i: number) => otf.glyphs.get(i).name, [single, chain] = gsub.lookups.map((l: { subtables: unknown[] }) => l.subtables[0]);
    assert.equal(single.coverage.glyphs.length, 26);
    assert.equal(name(single.substitute[single.coverage.glyphs.indexOf(otf.charToGlyphIndex('n'))]), 'uni006E.hi');
    assert.deepEqual(chain.backtrackCoverage[0].glyphs.map(name).sort(), ['uni0062', 'uni0062.hi', 'uni006F', 'uni006F.hi', 'uni0076', 'uni0076.hi', 'uni0077', 'uni0077.hi']);
    // a print design's font has none
    assert.equal(opentype.parse(buildOTF(DEFAULTS, 'Print').buffer as ArrayBuffer).tables.gsub, undefined);
  });

  it('has a script form of every letter', () => {
    // without one, a letter in a joined-up word is drawn in its print or italic form
    for (const ch of CHARSET.upper + CHARSET.lower) assert.ok(hasGlyph(`${ch}.scr`), ch);
  });
});

describe('swell', () => {
  it('starts the script downstrokes from a point, so they carry less ink, and leaves other letters be', () => {
    for (const ch of 'intu') {
      const at = area(buildFont(copperplate).glyph(ch)!.d), sw = area(buildFont({ ...copperplate, swell: 1 }).glyph(ch)!.d);
      assert.ok(sw < at * 0.97, `${ch}: ${sw} vs ${at}`);
    }
    assert.equal(buildFont({ ...DEFAULTS, swell: 1 }).glyph('n')!.d, buildFont(DEFAULTS).glyph('n')!.d);
  });
});

describe('Letterforms, taken out', () => {
  const ownFonts = new FreeFonts(null, async (url: string): Promise<never> => { throw new Error(`fetched ${url}`); });
  const inFont = async (id: string): Promise<Params> => {
    const style = STYLES.find(s => s.id === id)!.params, fid = STYLE_FONTS[id];
    if (!freeFont(fid)) registerFreeFont(await ownFonts.load(fid));
    return { ...style, freeFont: fid, freeAt: freeAtOf(style) } as Params;
  };

  it('writes a design in its font\'s own letters, print or script, however cursive', async () => {
    for (const id of ['geometric', 'informal']) {
      const cur = buildFont({ ...(await inFont(id)), cursive: 1 });
      // (Cursive gives a print font's letters flicks, but never the engine's script letters)
      for (const ch of 'naoR') assert.ok(!cur.glyph(ch)!.meta.joined, `${id} ${ch}`);
      assert.equal(cur.layout('ovo', Infinity)[0].items.filter(it => it.alt).length, 0, id);
    }
  });

  it('opens and saves a design that still carries it, without it', async () => {
    const p = await inFont('geometric');
    const old = { ...p, scriptForm: 'script', freeAt: { ...p.freeAt, scriptForm: 'auto' }, glyphs: { n: { scriptForm: 'print', contrast: 0.7 } } } as unknown as Params;
    const read = sanitizeParams(old) as unknown as Record<string, unknown>;
    assert.ok(!('scriptForm' in read) && !('scriptForm' in (read.freeAt as object)) && !('scriptForm' in (read.glyphs as Record<string, object>).n));
    assert.equal(buildFont(read as unknown as Params).glyph('n')!.d, buildFont({ ...p, glyphs: { n: { contrast: 0.7 } } }).glyph('n')!.d);
    // a page opened before it went saves it still: read without it, not refused
    assert.ok(isValidParams(old));
    assert.ok(!isValidParams({ ...p, freeAt: { ...p.freeAt, weight: 'heavy' } }));
  });
});
