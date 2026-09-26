import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STYLES } from '../shared/content';
import { ALL_CHARS, buildFont } from '../shared/engine';
import { DEFAULTS, isValidParams, sanitizeParams, type Params } from '../shared/params';

const extremes: Params[] = [
  { ...DEFAULTS, weight: 1, width: 0, height: 1, slant: 1, contrast: 1, xHeight: 1, counter: 0, roundness: 1, terminal: 'sharp', serif: true, serifShape: 'wedge', playfulFormal: 0 },
  { ...DEFAULTS, weight: 0, width: 1, height: 0, contrast: 0, xHeight: 0, counter: 1, aperture: 1, apex: 1, terminal: 'angled', serif: true, serifShape: 'slab', geoHuman: 0, classicFuture: 1 },
  { ...DEFAULTS, weight: 1, width: 0, slant: 1, contrast: 1, wobble: 1, cursive: 1, mono: 1, serif: true, terminal: 'tapered', letterSpacing: 0 },
  { ...DEFAULTS, weight: 0, width: 1, wobble: 1, cursive: 0.2, mono: 1, roundness: 1, terminal: 'round' },
  { ...DEFAULTS, weight: 1, chamfer: 1, squareness: 1, joints: 1, reverse: 1, contrast: 1, extenders: 1, stencil: 1, slice: 1, fill: 'wire', module: 1 },
  { ...DEFAULTS, weight: 0, chamfer: 0.1, joints: 1, reverse: 0.5, extenders: 0, stencil: 0.3, fill: 'pixels', module: 0, slant: 1, wobble: 1 },
  { ...DEFAULTS, weight: 1, width: 0, fill: 'dots', module: 1, cursive: 1, serif: true },
  { ...DEFAULTS, weight: 0.5, fill: 'lines', module: 0, roundness: 1, mono: 1, playfulFormal: 0 }
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

  it('monospacing gives every glyph the same advance', () => {
    const font = buildFont({ ...DEFAULTS, mono: 1 });
    const advs = new Set([...'ilmwMW0.'].map(ch => Math.round(font.glyph(ch)!.adv)));
    assert.equal(advs.size, 1);
  });

  it('cursive switches to italic letterforms and adds exit strokes', () => {
    const print = buildFont(DEFAULTS), script = buildFont({ ...DEFAULTS, cursive: 1 });
    assert.ok(script.glyph('n')!.marks.some(k => k.type === 'exit'));
    assert.ok(!print.glyph('n')!.marks.some(k => k.type === 'exit'));
    assert.notEqual(print.glyph('y')!.d, script.glyph('y')!.d);
  });

  it('a picked storey overrides the one the other settings choose', () => {
    const single = (p: Partial<Params>) => buildFont({ ...DEFAULTS, ...p }).eff.singleStory;
    const a = (p: Partial<Params>) => buildFont({ ...DEFAULTS, ...p }).glyph('a')!.d;
    assert.ok(!single({}) && single({ cursive: 1 }) && single({ geoHuman: 0 }));
    assert.ok(single({ story: 'single' }) && !single({ story: 'double', cursive: 1 }) && !single({ story: 'double', geoHuman: 0 }));
    assert.equal(a({}), a({ story: 'double' }));
    assert.notEqual(a({}), a({ story: 'single' }));
    assert.equal(a({ cursive: 1 }), a({ cursive: 1, story: 'single' }));
    assert.notEqual(a({ cursive: 1 }), a({ cursive: 1, story: 'double' }));
  });

  it('squares and facets curves', () => {
    const round = buildFont(DEFAULTS), square = buildFont({ ...DEFAULTS, squareness: 1 }), cut = buildFont({ ...DEFAULTS, chamfer: 1 });
    assert.notEqual(round.glyph('O')!.d, square.glyph('O')!.d);
    // fully faceted, an O is an octagon ring: a handful of corners instead of a sampled curve
    const points = (d: string) => d.split(/[MLC]/).length - 1;
    assert.ok(points(cut.glyph('O')!.d) <= 30, `${points(cut.glyph('O')!.d)} points`);
    assert.ok(points(round.glyph('O')!.d) > 60);
  });

  it('reverse contrast makes horizontals thicker than stems', () => {
    const f = buildFont({ ...DEFAULTS, contrast: 0.8, reverse: 1 });
    assert.ok(f.m.hT > f.m.tDir(0, 1) * 2);
  });

  it('extenders lengthen ascenders and descenders', () => {
    const short = buildFont({ ...DEFAULTS, extenders: 0 }), long = buildFont({ ...DEFAULTS, extenders: 1 });
    assert.ok(long.m.asc > short.m.asc && long.m.desc < short.m.desc);
    assert.equal(buildFont(DEFAULTS).m.asc, Math.max(buildFont(DEFAULTS).m.cap * 1.05, buildFont(DEFAULTS).m.xh * 1.18));
  });

  it('stencil cuts joined strokes apart and splits round letters', () => {
    const solid = buildFont(DEFAULTS), cut = buildFont({ ...DEFAULTS, stencil: 0.5 });
    const contours = (d: string) => d.split('M').length - 1;
    assert.ok(contours(cut.glyph('O')!.d) > contours(solid.glyph('O')!.d));
    assert.notEqual(cut.glyph('H')!.d, solid.glyph('H')!.d);
  });

  it('pixel and dot fills sit on one grid across the line', () => {
    for (const fill of ['pixels', 'dots'] as const) {
      const f = buildFont({ ...DEFAULTS, fill });
      const cell = f.m.cell;
      assert.ok(cell > 0);
      for (const ch of 'aimW.') assert.ok(Math.abs(f.glyph(ch)!.adv / cell - Math.round(f.glyph(ch)!.adv / cell)) < 1e-6, `${fill} ${ch}`);
      assert.ok(Math.abs(f.m.track / cell - Math.round(f.m.track / cell)) < 1e-6);
    }
  });

  it('every fill draws every glyph', () => {
    for (const fill of ['wire', 'pixels', 'dots', 'lines'] as const) {
      const f = buildFont({ ...DEFAULTS, fill });
      for (const ch of 'HOag') assert.notEqual(f.glyph(ch)!.d, buildFont(DEFAULTS).glyph(ch)!.d);
    }
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
    const p = sanitizeParams({ weight: 7, width: -1, contrast: 'x', terminal: 'blobby', serif: 'yes', fill: 'glitter', story: 'triple', evil: '<script>' });
    assert.equal(p.weight, 1);
    assert.equal(p.width, 0);
    assert.equal(p.contrast, DEFAULTS.contrast);
    assert.equal(p.terminal, DEFAULTS.terminal);
    assert.equal(p.serif, DEFAULTS.serif);
    assert.equal(p.fill, DEFAULTS.fill);
    assert.equal(p.story, DEFAULTS.story);
    assert.ok(!('evil' in p));
  });

  it('fills in new settings for designs saved before they existed', () => {
    const { squareness, chamfer, fill, stencil, ...old } = DEFAULTS;
    void squareness; void chamfer; void fill; void stencil;
    assert.deepEqual(sanitizeParams({ ...old, weight: 0.7 }), { ...DEFAULTS, weight: 0.7 });
  });

  it('accepts complete, valid params and rejects anything else', () => {
    assert.ok(isValidParams({ ...DEFAULTS }));
    assert.ok(!isValidParams({ ...DEFAULTS, weight: 2 }));
    assert.ok(!isValidParams({ weight: 0.5 }));
    assert.ok(!isValidParams(null));
  });
});
