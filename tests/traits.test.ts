/* The Style page's trait steps (shared/traits.ts) and its style search (searchMatches, shared/content/tags.ts). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PAGE_STYLES, searchMatches, styleById } from '../shared/content';
import { buildFont } from '../shared/engine';
import { DEFAULTS, isValidParams } from '../shared/params';
import { STYLE_FONTS } from '../shared/free-fonts';
import { TRAIT_OFFS } from '../shared/trait-offs';
import { TRAITS, applyTraits, traitsKey, traitsOn, type Traits } from '../shared/traits';

describe('style page traits', () => {
  it('give every step a unique id and valid params that draw letters', () => {
    for (const t of TRAITS) {
      assert.equal(new Set(t.options.map(o => o.id)).size, t.options.length, t.id);
      for (const o of t.options) {
        const p = applyTraits(DEFAULTS, { [t.id]: o.id });
        assert.ok(isValidParams(p), `${t.id}: ${o.id}`);
        const f = buildFont(p);
        for (const ch of t.sample) assert.ok(f.glyph(ch)?.d, `${t.id}: ${o.id} draws ${ch}`);
      }
    }
  });
  it('lay the picked steps over a style and leave the rest as it was', () => {
    const didone = styleById('didone')!.params;
    const p = applyTraits(didone, { weight: 'black', serif: 'none', fill: 'dots' });
    assert.equal(p.weight, 0.94);
    assert.equal(p.serif, false);
    assert.equal(p.serifShape, didone.serifShape);
    assert.equal(p.fill, 'dots');
    assert.equal(p.contrast, didone.contrast);
    assert.equal(applyTraits(didone, {}), didone);
    assert.notEqual(traitsKey({ weight: 'bold' }), traitsKey({ width: 'bold' }));
  });
  it("leave out the last step of a set a card's letters break together (TRAIT_OFFS), picked whole", () => {
    const order = TRAITS.flatMap(t => t.options.map(o => `${t.id}:${o.id}`)), drawn = new Set([...Object.values(STYLE_FONTS), 'blocks:slots', 'blocks:grid', 'arcs']);
    const traitsOfSet = (set: string[]) => Object.fromEntries(set.map(s => s.split(':'))) as Traits;
    for (const [letters, sets] of Object.entries(TRAIT_OFFS)) {
      assert.ok(drawn.has(letters), `${letters} draws a card`);
      for (const set of sets) {
        // (steps the tab offers, of as many traits, in TRAITS order)
        assert.ok(set.length && set.every(s => order.includes(s)), `${letters}: ${set}`);
        assert.deepEqual([...set].sort((a, b) => order.indexOf(a) - order.indexOf(b)), set, `${letters}: ${set} in order`);
        assert.equal(new Set(set.map(s => s.split(':')[0])).size, set.length, `${letters}: ${set}`);
        const last = set[set.length - 1].split(':')[0] as keyof Traits, on = traitsOn(traitsOfSet(set), letters);
        assert.equal(on[last], undefined, `${letters}: ${set} less its last`);
        for (const [id, o] of Object.entries(on)) assert.ok(set.includes(`${id}:${o}`));
      }
    }
    // (another card's letters, or none of a set's steps picked, take the steps as picked)
    const t: Traits = { weight: 'bold' };
    assert.equal(traitsOn(t, 'not a font'), t);
    assert.deepEqual(traitsOn({}, STYLE_FONTS.grotesque), {});
  });
});

describe('style search', () => {
  const names = (q: string) => PAGE_STYLES.filter(s => searchMatches(s, q)).map(s => s.id);
  it('finds styles by name, genre, feeling and the fonts they are like', () => {
    assert.deepEqual(names('futura'), ['geometric']);
    assert.ok(names('Bodoni').includes('didone'));
    assert.ok(names('round mono').every(id => styleById(id)!.group === 'mono'));
    assert.ok(names('futuristic').length >= 3);
    assert.equal(names('').length, PAGE_STYLES.length);
    assert.equal(names('xyzzy').length, 0);
  });
});
