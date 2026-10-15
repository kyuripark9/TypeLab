import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STYLES } from '../shared/content';
import { buildFont, freeFont, registerFreeFont } from '../shared/engine';
import { glyphIds } from '../shared/engine/font';
import { STYLE_FONTS } from '../shared/free-fonts';
import { DEFAULTS, freeAtOf, isValidParams, sanitizeParams, type Params } from '../shared/params';
import { FreeFonts } from '../server/free-fonts';

/* The Handwriting page's Cursive, and what was taken out of it: Letterforms (Print or Script) and Swell, with the
   engine's own joined script letters they drew. Scripts are the script fonts' (the Style page's script cards), and a
   design is written in its font's own letters, script or print. The Lowercase height scale, down to a copperplate's
   x-height, and moving older designs onto it are in params.test.ts. */

describe('cursive', () => {
  it('switches to italic letterforms and adds exit strokes', () => {
    const print = buildFont(DEFAULTS), cursive = buildFont({ ...DEFAULTS, cursive: 0.45 });
    assert.ok(cursive.glyph('n')!.marks.some(k => k.type === 'exit'));
    assert.ok(!print.glyph('n')!.marks.some(k => k.type === 'exit'));
    assert.notEqual(print.glyph('y')!.d, cursive.glyph('y')!.d);
  });

  it('keeps the letters print type all the way, flicking further, and never writes a joined script', () => {
    const half = buildFont({ ...DEFAULTS, cursive: 0.45 }), full = buildFont({ ...DEFAULTS, cursive: 1 });
    // (a joined-up script's letters stand on no side bearings, their joins being the neighbours' to share)
    for (const ch of 'naoRx') assert.ok(full.glyph(ch)!.lsb > 0 && full.glyph(ch)!.rsb > 0, ch);
    assert.notEqual(half.glyph('n')!.d, full.glyph('n')!.d);
    assert.ok(!glyphIds().some(id => id.endsWith('.scr')));
  });
});

describe('Letterforms and Swell, taken out', () => {
  const ownFonts = new FreeFonts(null, async (url: string): Promise<never> => { throw new Error(`fetched ${url}`); });
  const inFont = async (id: string): Promise<Params> => {
    const style = STYLES.find(s => s.id === id)!.params, fid = STYLE_FONTS[id];
    if (!freeFont(fid)) registerFreeFont(await ownFonts.load(fid));
    return { ...style, freeFont: fid, freeAt: freeAtOf(style) } as Params;
  };

  it('writes a design in its font\'s own letters, print or script, however cursive', async () => {
    for (const id of ['geometric', 'informal']) {
      const p = await inFont(id), f = buildFont(p), cur = buildFont({ ...p, cursive: 1 });
      // (Cursive gives a print font's letters flicks; a script font's are its own as they are)
      for (const ch of 'naoR') assert.ok(cur.glyph(ch)!.drawn && f.glyph(ch)!.drawn, `${id} ${ch}`);
    }
  });

  it('opens and saves a design that still carries them, without them', async () => {
    const p = await inFont('geometric');
    const old = { ...p, scriptForm: 'script', swell: 0.5, freeAt: { ...p.freeAt, scriptForm: 'auto' }, glyphs: { n: { scriptForm: 'print', contrast: 0.7 } } } as unknown as Params;
    const read = sanitizeParams(old) as unknown as Record<string, unknown>;
    assert.ok(!('scriptForm' in read) && !('swell' in read) && !('scriptForm' in (read.freeAt as object)) && !('scriptForm' in (read.glyphs as Record<string, object>).n));
    assert.equal(buildFont(read as unknown as Params).glyph('n')!.d, buildFont({ ...p, glyphs: { n: { contrast: 0.7 } } }).glyph('n')!.d);
    // a page opened before they went saves them still: read without them, not refused
    assert.ok(isValidParams(old));
    assert.ok(!isValidParams({ ...p, freeAt: { ...p.freeAt, weight: 'heavy' } }));
  });
});
