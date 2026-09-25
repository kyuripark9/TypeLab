import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STYLES } from '../shared/content';
import { ALL_CHARS, buildFont } from '../shared/engine';
import { DEFAULTS, isValidParams, sanitizeParams, type Params } from '../shared/params';

const extremes: Params[] = [
  { ...DEFAULTS, weight: 1, width: 0, height: 1, slant: 1, contrast: 1, xHeight: 1, counter: 0, roundness: 1, terminal: 'sharp', serif: true, serifShape: 'wedge', playfulFormal: 0 },
  { ...DEFAULTS, weight: 0, width: 1, height: 0, contrast: 0, xHeight: 0, counter: 1, aperture: 1, apex: 1, terminal: 'angled', serif: true, serifShape: 'slab', geoHuman: 0, classicFuture: 1 }
];

describe('font engine', () => {
  for (const p of [...STYLES.map(s => s.params), ...extremes]) {
    it(`draws every glyph with finite outlines (${STYLES.find(s => s.params === p)?.id ?? 'extreme settings'})`, () => {
      const font = buildFont(p);
      for (const ch of ALL_CHARS) {
        const g = font.glyph(ch);
        assert.ok(g, `missing glyph ${ch}`);
        assert.ok(g.d.length > 10, `empty outline for ${ch}`);
        assert.doesNotMatch(g.d, /NaN|Infinity/, `bad number in ${ch}`);
        assert.ok(Number.isFinite(g.adv) && g.adv > 0, `bad advance for ${ch}`);
      }
    });
  }

  it('reacts to parameters: heavier weight means wider stems', () => {
    const light = buildFont({ ...DEFAULTS, weight: 0.1 }), bold = buildFont({ ...DEFAULTS, weight: 0.9 });
    assert.ok(bold.m.s > light.m.s * 3);
    assert.notEqual(light.glyph('n')!.d, bold.glyph('n')!.d);
  });

  it('wraps text to a width', () => {
    const font = buildFont(DEFAULTS);
    const lines = font.layout('the quick brown fox jumps over the lazy dog', 4000);
    assert.ok(lines.length > 1);
    for (const ln of lines) assert.ok(ln.width <= 4000 || ln.items.length === 1);
  });
});

describe('params validation', () => {
  it('clamps numbers, drops unknown keys and falls back on bad values', () => {
    const p = sanitizeParams({ weight: 7, width: -1, contrast: 'x', terminal: 'blobby', serif: 'yes', evil: '<script>' });
    assert.equal(p.weight, 1);
    assert.equal(p.width, 0);
    assert.equal(p.contrast, DEFAULTS.contrast);
    assert.equal(p.terminal, DEFAULTS.terminal);
    assert.equal(p.serif, DEFAULTS.serif);
    assert.ok(!('evil' in p));
  });

  it('accepts complete, valid params and rejects anything else', () => {
    assert.ok(isValidParams({ ...DEFAULTS }));
    assert.ok(!isValidParams({ ...DEFAULTS, weight: 2 }));
    assert.ok(!isValidParams({ weight: 0.5 }));
    assert.ok(!isValidParams(null));
  });
});
