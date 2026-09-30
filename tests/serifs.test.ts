import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_CHARS, buildFont, type Cmd, type Glyph } from '../shared/engine';
import { DEFAULTS, SERIF_BASES, SERIF_INNERS, SERIF_SHAPES, SERIF_SIDES, SERIF_TIPS, isValidParams, sanitizeParams, type Params } from '../shared/params';

const serif: Params = { ...DEFAULTS, serif: true, serifThickness: 0.5 };
const glyph = (p: Partial<Params>, ch: string) => buildFont({ ...serif, ...p }).glyph(ch)!;

/** The box round some outlines, in font units (y up). */
function box(cmds: Cmd[][]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cmds.flat()) {
    for (let i = 1; i + 1 < c.length && typeof c[i] === 'number'; i += 2) {
      x0 = Math.min(x0, c[i]); x1 = Math.max(x1, c[i]); y0 = Math.min(y0, c[i + 1]); y1 = Math.max(y1, c[i + 1]);
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
/** A glyph's serifs at one place: at the foot of its strokes, on top of them, or across the ends of its arms. */
const at = (g: Glyph, place: Glyph['serifAt'][number]) => g.serifs.filter((_, i) => g.serifAt[i] === place);
const curves = (g: Glyph) => g.serifs.flat().filter(c => c[0] === 'C').length;

describe('serif details', () => {
  it('knows where each serif sits', () => {
    const f = buildFont(serif);
    assert.deepEqual(f.glyph('I')!.serifAt.slice().sort(), ['foot', 'top']);
    assert.ok(at(f.glyph('E')!, 'arm').length >= 2);
    for (const ch of ALL_CHARS) { const g = f.glyph(ch)!; assert.equal(g.serifAt.length, g.serifs.length, ch); }
    assert.ok(f.hl('E', 'serifArms') && f.hl('I', 'serifTops'));
    assert.equal(f.hl('I', 'serifArms'), '');
  });

  it('draws every shape with every tip and base', () => {
    for (const serifShape of SERIF_SHAPES) for (const serifTip of SERIF_TIPS) for (const serifBase of SERIF_BASES) {
      const p = { ...serif, serifShape, serifTip, serifBase, serifCup: 1, serifTipSlant: serifBase === 'flat' ? 1 : 0, slant: 0.3, roundness: 0.4 };
      assert.ok(isValidParams(p));
      const f = buildFont(p);
      for (const ch of ALL_CHARS) assert.doesNotMatch(f.glyph(ch)!.d, /NaN|Infinity/, `${serifShape} ${serifTip} ${serifBase}: ${ch}`);
    }
  });

  it('finishes the tips square, round, pointed or angled', () => {
    const ds = SERIF_TIPS.map(serifTip => glyph({ serifTip }, 'I').d);
    assert.equal(new Set(ds).size, SERIF_TIPS.length);
    // round tips turn their corners, soft at first and a half circle at the far end
    const square = glyph({ serifShape: 'slab' }, 'I'), round = glyph({ serifShape: 'slab', serifTip: 'round' }, 'I');
    assert.ok(curves(round) > curves(square));
    assert.notEqual(glyph({ serifShape: 'slab', serifTip: 'round', serifTipRound: 0 }, 'I').d, round.d);
    // a pointed tip keeps its length and loses its thickness there; an angled one leans either way
    assert.ok(Math.abs(box(at(glyph({ serifTip: 'pointed' }, 'I'), 'foot')).w - box(at(glyph({}, 'I'), 'foot')).w) < 1);
    assert.notEqual(glyph({ serifTip: 'angled', serifTipSlant: 0 }, 'I').d, glyph({ serifTip: 'angled', serifTipSlant: 1 }, 'I').d);
    assert.equal(glyph({ serifTip: 'angled', serifTipSlant: 0.5 }, 'I').d, glyph({}, 'I').d);
    // the sliders of a tip that isn't picked change nothing
    assert.equal(glyph({ serifTipRound: 0, serifTipSlant: 0, serifCup: 1 }, 'I').d, glyph({}, 'I').d);
  });

  it('cups the base up under the stem and keeps the tips on the line', () => {
    const flat = glyph({}, 'H'), cup = glyph({ serifBase: 'cupped', serifCup: 1 }, 'H'), shallow = glyph({ serifBase: 'cupped', serifCup: 0 }, 'H');
    const stem = (g: Glyph) => box([g.strokes[0].cmds]);
    // the stem stops short top and bottom, and the serifs still reach the lines it stood on
    assert.ok(stem(cup).y0 > stem(flat).y0 + 8 && stem(cup).y1 < stem(flat).y1 - 8);
    assert.ok(stem(shallow).y0 > stem(flat).y0 && stem(shallow).y0 < stem(cup).y0);
    assert.ok(Math.abs(box(at(cup, 'foot')).y0 - box(at(flat, 'foot')).y0) < 0.01);
    assert.ok(Math.abs(box(at(cup, 'top')).y1 - box(at(flat, 'top')).y1) < 0.01);
    assert.ok(Math.abs(box(at(cup, 'foot')).w - box(at(flat, 'foot')).w) < 0.01);
    // the arch is drawn in the serif's own outline
    assert.ok(at(cup, 'foot').flat().length > at(flat, 'foot').flat().length + 10);
    assert.equal(cup.adv, flat.adv);
    // on diagonals too, and the serifs across the ends of arms stay flat
    const A = glyph({}, 'A'), cupA = glyph({ serifBase: 'cupped', serifCup: 1 }, 'A');
    assert.ok(Math.abs(box([cupA.cmds]).y0 - box([A.cmds]).y0) < 0.01);
    assert.notEqual(cupA.d, A.d);
    assert.deepEqual(at(glyph({ serifBase: 'cupped', serifCup: 1 }, 'E'), 'arm'), at(glyph({}, 'E'), 'arm'));
  });

  it('runs the bracket further up the stem', () => {
    const h = (serifBracket: number) => box(at(glyph({ serifBracket }, 'I'), 'foot')).h;
    assert.ok(h(0) < h(0.5) && h(0.5) < h(1));
    assert.equal(glyph({ serifShape: 'slab', serifBracket: 1 }, 'I').d, glyph({ serifShape: 'slab' }, 'I').d);
  });

  it('balances the serifs on stems to one side, and leaves those on arms alone', () => {
    const foot = (serifBalance: number) => box(at(glyph({ serifBalance }, 'I'), 'foot'));
    const mid = (foot(0.5).x0 + foot(0.5).x1) / 2;
    assert.ok(foot(1).x1 > foot(0.5).x1 + 10 && foot(1).x0 > foot(0.5).x0 + 10);
    assert.ok(foot(0).x0 < foot(0.5).x0 - 10 && foot(0).x1 < foot(0.5).x1 - 10);
    assert.ok(Math.abs((foot(1).x0 + foot(1).x1) / 2 - mid) > 10);
    assert.deepEqual(at(glyph({ serifBalance: 1 }, 'E'), 'arm'), at(glyph({}, 'E'), 'arm'));
  });

  it('reaches to one side of a stem only, or only into the letter or out of it', () => {
    const feet = (p: Partial<Params>, ch: string) => at(glyph(p, ch), 'foot').map(s => box([s])).sort((a, b) => a.x0 - b.x0);
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const [I] = feet({}, 'I'), [left] = feet({ serifSides: 'left' }, 'I'), [right] = feet({ serifSides: 'right' }, 'I');
    assert.ok(near(left.x0, I.x0) && left.x1 < I.x1 - 10);
    assert.ok(near(right.x1, I.x1) && right.x0 > I.x0 + 10);
    // an I has no inside: serifs that only reach in leave it bare, and ones that reach out are all it has
    assert.equal(glyph({ serifSides: 'inside' }, 'I').serifs.length, 0);
    assert.deepEqual(glyph({ serifSides: 'outside' }, 'I').serifs, glyph({}, 'I').serifs);
    // the feet of an H reach toward each other, or away
    const H = feet({}, 'H'), inside = feet({ serifSides: 'inside' }, 'H'), outside = feet({ serifSides: 'outside' }, 'H');
    assert.ok(inside[0].x0 > H[0].x0 + 10 && near(inside[0].x1, H[0].x1) && near(inside[1].x0, H[1].x0) && inside[1].x1 < H[1].x1 - 10);
    assert.ok(near(outside[0].x0, H[0].x0) && outside[0].x1 < H[0].x1 - 10 && outside[1].x0 > H[1].x0 + 10 && near(outside[1].x1, H[1].x1));
    assert.equal(glyph({ serifSides: 'inside' }, 'H').serifs.length, 4);
    // both sides of an m's middle stem face into it
    const m = feet({}, 'm');
    assert.equal(m.length, 3);
    assert.deepEqual(feet({ serifSides: 'inside' }, 'm')[1], m[1]);
    assert.equal(feet({ serifSides: 'outside' }, 'm').length, 2);
    // the serifs across the ends of arms stay, and so does the spacing
    for (const serifSides of SERIF_SIDES) {
      assert.deepEqual(at(glyph({ serifSides }, 'E'), 'arm'), at(glyph({}, 'E'), 'arm'), serifSides);
      assert.equal(glyph({ serifSides }, 'H').adv, glyph({}, 'H').adv, serifSides);
    }
    // a stem whose cupped serif is left off stands on its line
    assert.ok(near(box([glyph({ serifSides: 'inside', serifBase: 'cupped', serifCup: 1 }, 'I').cmds]).y0, 0));
  });

  it('shapes the serifs that reach into the letter on their own', () => {
    const feet = (p: Partial<Params>) => at(glyph(p, 'H'), 'foot').map(s => box([s])).sort((a, b) => a.x0 - b.x0);
    const H = feet({}), long = feet({ serifInnerSize: 1 }), short = feet({ serifInnerSize: 0 });
    // the halves between the stems grow and shrink, and the ones outside them stay
    assert.ok(long[0].x1 > H[0].x1 + 10 && long[1].x0 < H[1].x0 - 10 && short[0].x1 < H[0].x1 - 10);
    assert.ok(Math.abs(long[0].x0 - H[0].x0) < 0.01 && Math.abs(long[1].x1 - H[1].x1) < 0.01);
    assert.ok(feet({ serifInner: 'slab', serifInnerThickness: 1 })[0].h > H[0].h + 10);
    for (const serifInner of SERIF_INNERS) {
      const same = serifInner === 'same' || serifInner === serif.serifShape;
      assert.equal(glyph({ serifInner }, 'H').d === glyph({}, 'H').d, same, serifInner);
      // an I has no inside to shape, and the serifs on arms keep the one shape
      assert.equal(glyph({ serifInner, serifInnerSize: 1, serifInnerThickness: 0 }, 'I').d, glyph({}, 'I').d, serifInner);
      assert.deepEqual(at(glyph({ serifInner, serifInnerSize: 1 }, 'E'), 'arm'), at(glyph({}, 'E'), 'arm'), serifInner);
    }
  });

  it('draws every letter with every side and inner shape', () => {
    for (const serifSides of SERIF_SIDES) for (const serifInner of SERIF_INNERS) {
      const p = { ...serif, serifSides, serifInner, serifInnerSize: 1, serifInnerThickness: 0, serifBase: 'cupped' as const, serifTip: 'round' as const, slant: 0.3, cursive: serifInner === 'wedge' ? 1 : 0 };
      assert.ok(isValidParams(p));
      const f = buildFont(p);
      for (const ch of ALL_CHARS) assert.doesNotMatch(f.glyph(ch)!.d, /NaN|Infinity/, `${serifSides} ${serifInner}: ${ch}`);
    }
  });

  it('sizes the serifs on top of stems and on arms apart from the feet', () => {
    const I = (p: Partial<Params>) => glyph(p, 'I'), E = (p: Partial<Params>) => glyph(p, 'E');
    assert.ok(box(at(I({ serifTops: 0 }), 'top')).w < box(at(I({}), 'top')).w - 10);
    assert.ok(box(at(I({ serifTops: 1 }), 'top')).w > box(at(I({}), 'top')).w + 10);
    assert.deepEqual(at(I({ serifTops: 0 }), 'foot'), at(I({}), 'foot'));
    const arms = (g: Glyph) => Math.max(...at(g, 'arm').map(s => box([s]).h));
    assert.ok(arms(E({ serifArms: 1 })) > arms(E({})) + 10 && arms(E({ serifArms: 0 })) < arms(E({})) - 5);
    assert.deepEqual(at(E({ serifArms: 1 }), 'foot'), at(E({}), 'foot'));
  });

  it('lets one letter take serif details of its own', () => {
    const f = buildFont({ ...serif, glyphs: { n: { serifTip: 'round', serifBase: 'cupped' } } });
    assert.notEqual(f.glyph('n')!.d, buildFont(serif).glyph('n')!.d);
    assert.equal(f.glyph('m')!.d, buildFont(serif).glyph('m')!.d);
  });

  it('falls back on tips and bases it does not know', () => {
    const p = sanitizeParams({ serifTip: 'blobby', serifBase: 3, serifCup: 7, serifBalance: 'left', serifSides: 'up', serifInner: 'round', serifInnerSize: -2,
      glyphs: { n: { serifTip: 'round', serifBase: 'domed' } } });
    assert.equal(p.serifTip, 'square');
    assert.equal(p.serifBase, 'flat');
    assert.equal(p.serifCup, 1);
    assert.equal(p.serifBalance, DEFAULTS.serifBalance);
    assert.equal(p.serifSides, 'both');
    assert.equal(p.serifInner, 'same');
    assert.equal(p.serifInnerSize, 0);
    assert.deepEqual(sanitizeParams({ glyphs: { I: { serifSides: 'left', serifInner: 'wedge' } } }).glyphs, { I: { serifSides: 'left', serifInner: 'wedge' } });
    assert.deepEqual(p.glyphs, { n: { serifTip: 'round' } });
  });
});
