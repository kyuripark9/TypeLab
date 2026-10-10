import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFont, type Cmd } from '../shared/engine';
import { DEFAULTS, type Params } from '../shared/params';
import { coords, pathPts } from './outlines';

/* Weights: Weight, Contrast both ways, Verticals and Horizontals, one stroke of a letter weighed on its own, and
   Pinch. Outlines: `d` is SVG path data (y down); `cmds` are font units, y up (see outlines.ts). */

/** How wide the ink of a letter is at height y, from its outline's points there. */
const across = (d: string, y: number) => { const xs = pathPts(d).filter(q => Math.abs(q.y - y) < 1).map(q => q.x); return Math.max(...xs) - Math.min(...xs); };

describe('weights: weight, contrast, vWeight, hWeight, strokeWeights, pinch, pinchPos', () => {
  it('reacts to parameters: heavier weight means wider stems', () => {
    const light = buildFont({ ...DEFAULTS, weight: 0.1 }), bold = buildFont({ ...DEFAULTS, weight: 0.9 });
    assert.ok(bold.m.s > light.m.s * 3);
    assert.notEqual(light.glyph('n')!.d, bold.glyph('n')!.d);
  });

  it('contrast runs both ways from the letters as drawn', () => {
    const at = (contrast: number) => { const f = buildFont({ ...DEFAULTS, contrast }); return { v: f.m.tDir(0, 1), h: f.m.tDir(1, 0) }; };
    const mid = at(0.5), high = at(1), low = at(0), rev = at(0.1);
    assert.equal(DEFAULTS.contrast, 0.5, 'the middle is the default');
    assert.ok(mid.h < mid.v && mid.h > mid.v * 0.8, 'the middle keeps the gentle contrast letters are drawn with');
    assert.ok(high.h < high.v * 0.15, 'the top thins the horizontals');
    assert.ok(Math.abs(low.v - high.h) < high.v * 0.05 && Math.abs(low.h - high.v) < high.v * 0.05, 'the bottom is its mirror');
    assert.ok(rev.h > rev.v * 2, 'below the middle the horizontals outweigh the stems');
  });

  it('weighs the verticals, the horizontals, and each stroke of one letter on their own', () => {
    const box = (cmds: Cmd[]) => {
      const { xs, ys } = coords(cmds);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    // the H: its stems' width, and its crossbar's height
    const H = (p: Partial<Params>) => {
      const g = buildFont({ ...DEFAULTS, ...p }).glyph('H')!;
      return { stem: box(g.strokes.find(s => s.part === 'stem')!.cmds).w, bar: box(g.strokes.find(s => s.part === 'crossbar')!.cmds).h };
    };
    const base = H({}), heavyV = H({ vWeight: 1 }), lightV = H({ vWeight: 0 }), heavyH = H({ hWeight: 1 }), lightH = H({ hWeight: 0 });
    assert.ok(heavyV.stem > base.stem * 1.8 && lightV.stem < base.stem * 0.5, 'Verticals weigh the stems');
    // (all but the little the pen's slant takes from the stems' weight)
    assert.ok(Math.abs(heavyV.bar - base.bar) < base.bar * 0.05 && Math.abs(lightV.bar - base.bar) < base.bar * 0.05, 'and leave the bars');
    assert.ok(heavyH.bar > base.bar * 1.5 && lightH.bar < base.bar * 0.5, 'Horizontals weigh the bars');
    assert.ok(Math.abs(heavyH.stem - base.stem) < base.stem * 0.05 && Math.abs(lightH.stem - base.stem) < base.stem * 0.05, 'and leave the stems');
    // Horizontals can outweigh Verticals, like reverse contrast
    const rev = H({ vWeight: 0.2, hWeight: 0.9, contrast: 0.5 });
    assert.ok(rev.bar > rev.stem, 'bars heavier than stems');

    // one stroke of a customized letter, and nothing else
    const f = buildFont({ ...DEFAULTS, glyphs: { H: { strokeWeights: { 0: 1 } } } }), plain = buildFont(DEFAULTS);
    const [a, b] = [f.glyph('H')!, plain.glyph('H')!];
    assert.deepEqual(a.strokes.map(s => s.id), ['0', '1', '2']);
    assert.ok(box(a.strokes[0].cmds).w > box(b.strokes[0].cmds).w * 1.8, 'the stroke weighed gets heavier');
    assert.equal(a.strokes[1].cmds.join(), b.strokes[1].cmds.join(), 'the other stem stays');
    assert.equal(a.strokes[2].cmds.join(), b.strokes[2].cmds.join(), 'the crossbar stays');
    assert.equal(f.glyph('I')!.d, plain.glyph('I')!.d, 'other letters stay');
    assert.equal(buildFont({ ...DEFAULTS, glyphs: { H: { strokeWeights: { 0: 0.5 } } } }).glyph('H')!.d, b.d, 'the middle draws it as the design does');

    // the rounds inside a square-joined bowl follow its stem's edge, lighter or heavier
    const xs = (cmds: Cmd[]) => coords(cmds).xs;
    for (const bowlForm of ['oval', 'box'] as const) for (const w of [0.1, 0.9]) {
      const g = buildFont({ ...DEFAULTS, story: 'single', bowlJoin: 'square', bowlForm, glyphs: { a: { strokeWeights: { 0: w } } } }).glyph('a')!;
      const stemL = Math.min(...xs(g.strokes[0].cmds)), fillets = g.strokes.filter(s => s.part === 'fillet');
      assert.equal(fillets.length, 2);
      for (const s of fillets) assert.ok(Math.abs(Math.max(...xs(s.cmds)) - stemL) < 3, `a ${bowlForm} bowl's round meets a stem weighed ${w}`);
      // and the bars of a bowl weighed on its own, at its top and its foot
      const h = buildFont({ ...DEFAULTS, story: 'single', bowlJoin: 'square', bowlForm, glyphs: { a: { strokeWeights: { 1: w } } } }).glyph('a')!;
      const hStem = Math.min(...xs(h.strokes[0].cmds)), pts = h.strokes[1].cmds.flatMap(c => c.slice(1).reduce<number[][]>((a, v, i, r) => i % 2 ? a : [...a, [v as number, r[i + 1] as number]], []));
      const barYs = pts.filter(([x]) => x > hStem - 30).map(([, y]) => y);
      for (const s of h.strokes.filter(t => t.part === 'fillet')) {
        const { ys } = coords(s.cmds), y0 = Math.min(...ys), y1 = Math.max(...ys);
        assert.ok(barYs.some(y => Math.abs(y - y0) < 3 || Math.abs(y - y1) < 3), `a ${bowlForm} bowl weighed ${w} keeps its round on its bar`);
      }
    }
  });

  it('pinch thins every stroke to a point on its line, and Position moves the line', () => {
    const f = (p: Partial<Params>) => buildFont({ ...DEFAULTS, ...p });
    const full = f({}), pinched = f({ pinch: 1 }), half = f({ pinch: 0.5 }), s = full.m.s, mid = full.m.xh / 2;
    assert.ok(across(pinched.glyph('l')!.d, mid) < s * 0.05, 'the l comes to a point halfway up the x-height');
    assert.ok(Math.abs(across(half.glyph('l')!.d, mid) - s / 2) < s * 0.1, 'half a pinch keeps half the stroke');
    assert.ok(Math.abs(across(pinched.glyph('l')!.d, full.m.asc) - across(full.glyph('l')!.d, full.m.asc)) < 1, 'and the top of the l keeps its weight');
    // the o's sides pinch too, and its top and bottom keep their weight
    assert.notEqual(pinched.glyph('o')!.d, full.glyph('o')!.d);
    const high = f({ pinch: 1, pinchPos: 1 });
    assert.ok(across(high.glyph('I')!.d, high.m.cap * 0.999) < s * 0.2, 'at the top, the pinch is at the cap height');
    assert.ok(across(high.glyph('l')!.d, 0) > s * 0.9, 'and far below it, full weight');
  });
});
