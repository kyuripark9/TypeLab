import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PAGE_STYLES, searchMatches, styleById } from '../shared/content';
import { buildFont } from '../shared/engine';
import { DEFAULTS, isValidParams } from '../shared/params';
import { TRAITS, applyTraits, traitsKey } from '../shared/traits';

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
    const p = applyTraits(didone, { weight: 'black', serif: 'slab', fill: 'dots' });
    assert.equal(p.weight, 0.94);
    assert.equal(p.serifShape, 'slab');
    assert.equal(p.fill, 'dots');
    assert.equal(p.contrast, didone.contrast);
    assert.equal(applyTraits(didone, {}), didone);
    assert.notEqual(traitsKey({ weight: 'bold' }), traitsKey({ width: 'bold' }));
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
