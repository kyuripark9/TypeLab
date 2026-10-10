import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CHARSET, buildFont } from '../shared/engine';
import { glyphIds, hasGlyph } from '../shared/engine/font';
import { DEFAULTS, type Params } from '../shared/params';
import { pathPts, xsOf } from './outlines';

/* The script settings, the panel's Handwriting page: Cursive and the joined-up script letterforms (script.ts),
   Swell, Flourishes (swash.ts) and Swash capitals (`swash`). The Lowercase height scale, down to a copperplate's
   x-height, and moving older designs onto it are in params.test.ts. */

const script: Params = { ...DEFAULTS, scriptForm: 'script', weight: 0.36, contrast: 1, slant: 1, xHeight: 0.1 };
const area = (d: string) => {
  // the ink of an outline, near enough: the shoelace sum over its points and handles, contour by contour
  let a = 0;
  for (const part of d.split('M').filter(Boolean)) {
    const v = (part.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 3 < v.length; i += 2) a += v[i] * v[i + 3] - v[i + 2] * v[i + 1];
  }
  return Math.abs(a / 2);
};
const xs = (d: string) => (d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0);

describe('cursive and scriptForm', () => {
  it('cursive switches to italic letterforms and adds exit strokes', () => {
    const print = buildFont(DEFAULTS), script = buildFont({ ...DEFAULTS, cursive: 1, scriptForm: 'print' });
    assert.ok(script.glyph('n')!.marks.some(k => k.type === 'exit'));
    assert.ok(!print.glyph('n')!.marks.some(k => k.type === 'exit'));
    assert.notEqual(print.glyph('y')!.d, script.glyph('y')!.d);
  });

  it('writes the letters as a joined-up script, every small letter joining the next on one line', () => {
    const print = buildFont(DEFAULTS), script = buildFont({ ...DEFAULTS, scriptForm: 'script' }), auto = buildFont({ ...DEFAULTS, cursive: 1 });
    const xh = script.m.xh;
    for (const ch of 'abcdefghijklmnopqrstuvwxyzAQRZ') {
      const g = script.glyph(ch)!;
      assert.ok(g.d && g.d !== print.glyph(ch)!.d, ch);
    }
    // left alone, a design more than half cursive is written
    assert.ok(auto.glyph('n')!.lsb + auto.glyph('n')!.rsb === 0 && print.glyph('n')!.lsb > 0);
    assert.ok(buildFont({ ...DEFAULTS, cursive: 1, scriptForm: 'print' }).glyph('n')!.lsb > 0);
    // each small letter's join crosses its left edge and its right edge at the same height, so they meet
    const at = (pts: { x: number; y: number }[], x: number) => pts.some(p => Math.abs(p.x - x) < 1.5 && Math.abs(p.y - xh * 0.38) < 1.5);
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
      const g = script.glyph(ch)!, pts = g.skeleton.flat();
      // (b o v w finish at the top, and drop onto the join line on their way out)
      assert.ok(at(pts, 0) && ('bovw'.includes(ch) || at(pts, g.bodyW)), ch);
      assert.equal(g.lsb + g.rsb, 0, ch);
    }
  });

  it('has a script form of every letter', () => {
    // without one, a letter in a joined-up word is drawn in its print or italic form
    for (const ch of CHARSET.upper + CHARSET.lower) assert.ok(hasGlyph(`${ch}.scr`), ch);
  });
});

describe('swell', () => {
  it('starts the script downstrokes from a point, so they carry less ink, and leaves other letters be', () => {
    for (const ch of 'intu') {
      const at = area(buildFont(script).glyph(ch)!.d), sw = area(buildFont({ ...script, swell: 1 }).glyph(ch)!.d);
      assert.ok(sw < at * 0.97, `${ch}: ${sw} vs ${at}`);
    }
    assert.equal(buildFont({ ...DEFAULTS, swell: 1 }).glyph('n')!.d, buildFont(DEFAULTS).glyph('n')!.d);
  });
});

describe('flourishes', () => {
  it('write swashes on S t z r l d of a script, reaching past the letter without widening it', () => {
    const plain = buildFont(script), swash = buildFont({ ...script, flourish: 'swash' });
    for (const ch of 'Stzrld') {
      const a = plain.glyph(ch)!, b = swash.glyph(ch)!;
      assert.notEqual(a.d, b.d, ch);
      if (ch !== 'S') assert.equal(b.adv, a.adv, ch);
      const reach = Math.max(...xs(b.d)) - Math.min(...xs(b.d));
      assert.ok(reach > b.adv * 1.3, `${ch} reaches ${reach} over ${b.adv}`);
    }
    // letters without a swash, and print letters, stay as they are
    assert.equal(swash.glyph('n')!.d, plain.glyph('n')!.d);
    assert.equal(buildFont({ ...DEFAULTS, flourish: 'swash' }).glyph('t')!.d, buildFont(DEFAULTS).glyph('t')!.d);
  });

  it('can be picked for one letter alone', () => {
    const f = buildFont({ ...script, glyphs: { d: { flourish: 'swash' } } }), plain = buildFont(script), all = buildFont({ ...script, flourish: 'swash' });
    assert.equal(f.glyph('d')!.d, all.glyph('d')!.d);
    assert.equal(f.glyph('t')!.d, plain.glyph('t')!.d);
  });

  it('has swash forms of S t z r l d alone', () => {
    assert.deepEqual(glyphIds().filter(k => k.endsWith('.sw')).map(k => k[0]).sort(), [...'Sdlrtz']);
  });
});

describe('swash capitals (swash)', () => {
  it('swash capitals curl the first stroke out and leave the rest alone', () => {
    const base = { ...DEFAULTS, terminal: 'round' as const, terminalForm: 'ball' as const }, off = buildFont(base), on = buildFont({ ...base, swash: 1 });
    for (const ch of 'PRTBIAHM') {
      assert.notEqual(on.glyph(ch)!.d, off.glyph(ch)!.d, ch);
      assert.ok(on.glyph(ch)!.lsb > off.glyph(ch)!.lsb, `${ch} makes room for its curl on the left`);
    }
    for (const ch of 'COGnhe1') assert.equal(on.glyph(ch)!.d, off.glyph(ch)!.d, ch);
    // it runs on up out of the top of the P's stem and curls out to the left of it
    const P = on.glyph('P')!, left = (g: typeof P) => Math.min(...xsOf(g.d)) - g.lsb;
    assert.ok(Math.max(...pathPts(P.d).map(q => q.y)) > on.m.cap + 5);
    assert.ok(left(P) < left(off.glyph('P')!) - on.m.s);
    // a letter can set the end its own way
    const own = buildFont({ ...base, swash: 1, glyphs: { P: { terminalCurls: { p0e: 0.5 }, terminalEnds: { p0e: 0.5 } } } });
    assert.equal(own.glyph('P')!.d, off.glyph('P')!.d);
  });
});
