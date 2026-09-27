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

  it('bowl overlap pulls the o of b d p q off the stem', () => {
    const f = (overlap: number) => buildFont({ ...DEFAULTS, story: 'single', overlap });
    for (const ch of 'abdgpq') {
      // from half overlap up the bowl only changes shape; below half it slides off and the letter widens
      assert.equal(f(0.5).glyph(ch)!.bodyW, f(1).glyph(ch)!.bodyW, ch);
      assert.ok(f(0).glyph(ch)!.bodyW > f(0.5).glyph(ch)!.bodyW, ch);
      assert.notEqual(f(0.75).glyph(ch)!.d, f(1).glyph(ch)!.d, ch);
    }
    assert.equal(f(0).glyph('n')!.d, f(1).glyph('n')!.d);
  });

  it('tail length stretches the tails and hooks, and nothing else', () => {
    const f = (tail: number, p: Partial<Params> = {}) => buildFont({ ...DEFAULTS, ...p, tail });
    const tip = (font: ReturnType<typeof buildFont>, ch: string) => font.glyph(ch)!.marks.find(k => k.type === 'tail')!;
    for (const ch of 'QJfgjty,') {
      assert.ok(tip(f(0.5), ch), ch);
      assert.notEqual(f(0).glyph(ch)!.d, f(0.5).glyph(ch)!.d, ch);
      assert.notEqual(f(1).glyph(ch)!.d, f(0.5).glyph(ch)!.d, ch);
    }
    assert.ok(tip(f(1), 'Q').x > tip(f(0.5), 'Q').x && tip(f(0.5), 'Q').x > tip(f(0), 'Q').x);
    assert.ok(tip(f(1), 'y').y < tip(f(0.5), 'y').y && tip(f(0.5), 'y').y < tip(f(0), 'y').y);
    for (const ch of 'nHOoe') assert.equal(f(0).glyph(ch)!.d, f(1).glyph(ch)!.d, ch);
    // cursive exit strokes flick further out
    assert.ok(tip(f(1, { cursive: 1 }), 'n').x > tip(f(0, { cursive: 1 }), 'n').x);
  });

  it('stroke end length stretches and trims the terminals, and leaves tails and hooks alone', () => {
    const f = (terminalLength: number, p: Partial<Params> = {}) => buildFont({ ...DEFAULTS, ...p, terminalLength });
    const ends = (font: ReturnType<typeof buildFont>, ch: string) => font.glyph(ch)!.marks.filter(k => k.type === 'terminal');
    for (const ch of 'CcaesrE2') {
      assert.notEqual(f(0).glyph(ch)!.d, f(0.5).glyph(ch)!.d, ch);
      assert.notEqual(f(1).glyph(ch)!.d, f(0.5).glyph(ch)!.d, ch);
      assert.equal(ends(f(0), ch).length, ends(f(0.5), ch).length, ch);
    }
    // the C's lower end reaches further right and curls further up as it grows
    const low = (font: ReturnType<typeof buildFont>) => ends(font, 'C').reduce((a, k) => (k.y < a.y ? k : a));
    assert.ok(low(f(1)).y > low(f(0.5)).y && low(f(0.5)).y > low(f(0)).y);
    // the r's arm draws on to the right
    const r = (font: ReturnType<typeof buildFont>) => Math.max(...ends(font, 'r').map(k => k.x));
    assert.ok(r(f(1)) > r(f(0.5)) && r(f(0.5)) > r(f(0)));
    // a longer arm widens its letter so it doesn't run into the next
    assert.ok(f(1).glyph('E')!.adv > f(0.5).glyph('E')!.adv);
    for (const ch of 'HOonjQy,') assert.equal(f(0).glyph(ch)!.d, f(1).glyph(ch)!.d, ch);
    assert.equal(f(0, { cursive: 1 }).glyph('n')!.d, f(1, { cursive: 1 }).glyph('n')!.d);
  });

  it('a customized letter sets each stroke end on its own', () => {
    const ends = (font: ReturnType<typeof buildFont>) => font.glyph('C')!.marks.filter(k => k.type === 'terminal');
    const base = buildFont(DEFAULTS), [a, b] = ends(base);
    assert.ok(a.id && b.id && a.id !== b.id);
    const own = buildFont({ ...DEFAULTS, glyphs: { C: { terminalEnds: { [a.id!]: 1 } } } });
    const moved = (id: string) => { const p = ends(base).find(k => k.id === id)!, q = ends(own).find(k => k.id === id)!; return Math.hypot(p.x - q.x, p.y - q.y); };
    assert.ok(moved(a.id!) > 20);
    assert.ok(moved(b.id!) < 0.01);
    // the same as setting the whole letter's Length, for that one end
    assert.deepEqual(ends(own).find(k => k.id === a.id), ends(buildFont({ ...DEFAULTS, terminalLength: 1 })).find(k => k.id === a.id));
    assert.equal(own.glyph('c')!.d, base.glyph('c')!.d);
  });

  it('sets the tip of a hook or tail only by its own length', () => {
    for (const [ch, p] of [['f', {}], ['y', {}], ['Q', {}], ['n', { cursive: 0.8 }]] as const) {
      const base = buildFont({ ...DEFAULTS, ...p }), tips = base.glyph(ch)!.marks.filter(k => k.type === 'terminal' && k.hook);
      assert.ok(tips.length, ch);
      // Length leaves it alone, so Tail (or Cursive) sets it (y and Q have no other ends to shift the letter)
      if (ch === 'y' || ch === 'Q') assert.equal(buildFont({ ...DEFAULTS, ...p, terminalLength: 1 }).glyph(ch)!.d, base.glyph(ch)!.d, ch);
      const own = buildFont({ ...DEFAULTS, ...p, glyphs: { [ch]: { terminalEnds: { [tips[0].id!]: 1 } } } }).glyph(ch)!;
      const q = own.marks.find(k => k.id === tips[0].id)!;
      assert.ok(Math.hypot(q.x - tips[0].x, q.y - tips[0].y) > 20, ch);
      // the tail's own drag handle goes with it
      if (ch !== 'n') assert.ok(own.marks.some(k => k.type === 'tail' && Math.hypot(k.x - q.x, k.y - q.y) < 1), ch);
    }
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

  it('a customized letter changes on its own, and the rest follow the design', () => {
    const base = buildFont(DEFAULTS), own = buildFont({ ...DEFAULTS, glyphs: { R: { weight: 0.9, terminal: 'round' } } });
    assert.notEqual(own.glyph('R')!.d, base.glyph('R')!.d);
    assert.equal(own.glyph('R')!.d, buildFont({ ...DEFAULTS, weight: 0.9, terminal: 'round' }).glyph('R')!.d);
    for (const ch of 'HOag') assert.equal(own.glyph(ch)!.d, base.glyph(ch)!.d);
    assert.equal(own.letter('H'), own);
    assert.equal(own.letter('R').params.weight, 0.9);
    // the lines every letter stands on stay shared
    assert.equal(own.letter('R').m.xh, own.m.xh);
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

  it('keeps only valid per-letter settings, one character each', () => {
    const p = sanitizeParams({ glyphs: { R: { weight: 3, xHeight: 0.9, terminal: 'blobby', serif: true }, ab: { weight: 0.2 }, e: {}, g: 'x' } });
    assert.deepEqual(p.glyphs, { R: { weight: 1, serif: true } });
    assert.deepEqual(sanitizeParams({ glyphs: [1] }).glyphs, {});
    const ends = sanitizeParams({ glyphs: { C: { terminalEnds: { '0s': 2, '1e': 0.3, top: 0.5, '2e': 'x' } }, c: { terminalEnds: {} } } }).glyphs;
    assert.deepEqual(ends, { C: { terminalEnds: { '0s': 1, '1e': 0.3 } } });
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
    assert.ok(isValidParams({ ...DEFAULTS, glyphs: { R: { weight: 0.9, terminal: 'round' } } }));
    assert.ok(!isValidParams({ ...DEFAULTS, glyphs: { R: { xHeight: 0.9 } } }));
    assert.ok(isValidParams({ ...DEFAULTS, glyphs: { C: { terminalEnds: { '0s': 0.8 } } } }));
    assert.ok(!isValidParams({ ...DEFAULTS, glyphs: { C: { terminalEnds: { '0s': 3 } } } }));
    assert.ok(!isValidParams(null));
  });
});
