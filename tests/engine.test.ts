import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONTROLS, STYLES } from '../shared/content';
import { ALL_CHARS, CHARSET, buildFont, cmdsToD, expandStroke, type Cmd, type Glyph } from '../shared/engine';
import { BLOCKS } from '../shared/engine/blocks';
import { glyphDefOf, glyphIds } from '../shared/engine/font';
import type { StrokeOpts } from '../shared/engine/types';
import { DEFAULTS, isValidParams, type Params } from '../shared/params';
import { contours, coords, curves, xsOf, ysOf } from './outlines';

/* The font engine as a whole: every style and a set of extreme settings draw every glyph with finite outlines;
   spacing, letters customized on their own, and layout; the glyph registry and the stroke expander's outputs;
   block letters (Built from: Blocks), rotation, and sliders that keep changing to 100. Each setting's own tests
   are in the files beside this one: letterforms, ends, corners, cuts, fills, weights, script, serifs and grid,
   and params for reading saved settings. Outlines: a glyph's `d` is SVG path data, y flipped (down); its `cmds`,
   strokes, serifs, counters, skeleton and marks are font units, y up (see outlines.ts). */

// settings at the ends of their ranges and in odd combinations: each must still draw every glyph
const extremes: Params[] = [
  { ...DEFAULTS, weight: 1, width: 0, height: 1, slant: 1, contrast: 1, xHeight: 1, counter: 0, roundness: 1, terminal: 'sharp', serif: true, serifShape: 'wedge', playfulFormal: 0 },
  { ...DEFAULTS, weight: 0, width: 1, height: 0, contrast: 0, xHeight: 0, counter: 1, aperture: 1, apex: 1, terminal: 'angled', serif: true, serifShape: 'slab', geoHuman: 0, classicFuture: 1 },
  { ...DEFAULTS, weight: 1, width: 0, slant: 1, contrast: 1, wobble: 1, cursive: 1, mono: 1, serif: true, terminal: 'tapered', letterSpacing: 0 },
  { ...DEFAULTS, weight: 0, width: 1, wobble: 1, cursive: 0.2, mono: 1, roundness: 1, terminal: 'round' },
  { ...DEFAULTS, weight: 1, chamfer: 1, squareness: 1, joints: 1, contrast: 0, extenders: 1, stencil: 1, slice: 1, fill: 'wire', module: 1 },
  { ...DEFAULTS, weight: 0, chamfer: 0.1, joints: 1, contrast: 0.45, extenders: 0, stencil: 0.3, fill: 'pixels', module: 0, slant: 1, wobble: 1 },
  { ...DEFAULTS, weight: 1, width: 0, fill: 'dots', module: 1, cursive: 1, serif: true },
  { ...DEFAULTS, weight: 0.5, fill: 'lines', module: 0, roundness: 1, mono: 1, playfulFormal: 0 },
  { ...DEFAULTS, weight: 1, width: 0, apex: 1, diagonals: 'upright', bends: 'round', yForm: 'cup', qForm: 'inside', iForm: 'bars', serif: true, cursive: 1, tail: 1, bowlForm: 'box', rForm: 'loop' },
  { ...DEFAULTS, weight: 0, width: 1, apex: 0, diagonals: 'upright', bends: 'round', yForm: 'cup', qForm: 'inside', chamfer: 1, stencil: 1, contrast: 1, tail: 0, bowlForm: 'box', rForm: 'loop', wobble: 1 },
  { ...DEFAULTS, weight: 1, width: 1, apex: 0, diagonals: 'upright', yForm: 'cup', qForm: 'inside', iForm: 'bars', serif: true, contrast: 1, squareness: 1, rForm: 'loop' },
  { ...DEFAULTS, bowlForm: 'box', cursive: 1, terminal: 'round', terminalCurl: 0.9, mono: 1, fill: 'wire' },
  { ...DEFAULTS, weight: 1, vWeight: 1, hWeight: 1, contrast: 0.5, serif: true, bowlForm: 'box' },
  { ...DEFAULTS, weight: 0, vWeight: 0, hWeight: 0, contrast: 0, terminal: 'tapered' },
  { ...DEFAULTS, vWeight: 0, hWeight: 1, glyphs: { a: { strokeWeights: { 0: 1, 1: 0 } }, H: { strokeWeights: { 2: 1 } } } },
  { ...DEFAULTS, build: 'blocks', weight: 1, width: 0, roundness: 1, joinRound: 1, vWeight: 1, hWeight: 1, slant: 1, wobble: 1, mono: 1 },
  { ...DEFAULTS, build: 'blocks', weight: 0, width: 1, height: 0, xHeight: 0, roundness: 0, vWeight: 0, hWeight: 0, slice: 1, fill: 'pixels' },
  { ...DEFAULTS, build: 'blocks', weight: 0.6, roundness: 1, joinRound: 0.5, fill: 'wire', playfulFormal: 0, softSharp: 0 },
  { ...DEFAULTS, build: 'blocks', roundness: 0.5, glyphs: { E: { build: 'strokes' }, n: { weight: 1 } } },
  { ...DEFAULTS, weight: 1, pinch: 1, pinchPos: 0, steps: 1, bowlForm: 'box', innerRound: 1, swash: 1, serif: true, diagonals: 'arch', mirror: 'mirrored', slant: 1 },
  { ...DEFAULTS, weight: 0, pinch: 1, pinchPos: 1, steps: 1, innerRound: 1, swash: 1, cursive: 1, terminal: 'round', terminalForm: 'ball', chamfer: 1, stencil: 1, fill: 'wire', diagonals: 'arch', bends: 'round' },
  { ...DEFAULTS, weight: 0.6, steps: 0.5, roundness: 1, innerRound: 0.5, swash: 0.5, wobble: 1, mono: 1, glyphs: { O: { cornerSteps: { '0t0': 0 } }, e: { mirror: 'mirrored' } } },
  { ...DEFAULTS, weight: 0, serif: true, serifSize: 1, serifThickness: 1, serifAngle: 1, serifBracket: 1, serifTip: 'round', serifBase: 'cupped', serifCup: 1, serifBalance: 1, serifTops: 0, serifArms: 1, serifSides: 'inside', serifInner: 'wedge', serifInnerSize: 1, wobble: 1, slant: 1 },
  { ...DEFAULTS, weight: 1, serif: true, serifShape: 'wedge', serifSize: 0, serifThickness: 0, serifTip: 'pointed', serifBase: 'cupped', serifCup: 1, serifBalance: 0, serifTops: 1, serifArms: 0, serifSides: 'left', serifInner: 'slab', serifInnerThickness: 0, cursive: 1, contrast: 1 },
  { ...DEFAULTS, serif: true, serifShape: 'slab', serifSize: 1, serifThickness: 0, serifTip: 'angled', serifTipSlant: 0, serifBase: 'cupped', serifCup: 1, mono: 1, fill: 'pixels', stencil: 1, bowlForm: 'box', diagonals: 'upright' },
  { ...DEFAULTS, weight: 1, serif: true, stencil: 0.5, stencilPos: 1, stencilRound: 1, wobble: 1, slant: 1, bowlForm: 'box',
    glyphs: { F: { joinGaps: { '0e': 1, '1s': 1, '2s': 1 } }, M: { joinGaps: { '2s': 1, '2e': 1, '2t0': 1 } }, A: { joinGaps: { '0t0': 1, '1s': 0 } }, B: { joinGaps: { '0t0': 1, '1t0': 1, '1t1': 1 } }, Z: { joinGaps: { '0e': 1, '1s': 1, '1e': 1, '2s': 1 } } } },
  { ...DEFAULTS, weight: 1, barGap: 1, barEnds: 'through', crossbar: 0, serif: true, stencil: 0.5, slant: 1, wobble: 1, glyphs: { A: { diagonals: 'arch' }, e: { weight: 0 } } }
];

describe('font engine', () => {
  for (const p of [...STYLES.map(s => s.params), ...extremes]) {
    it(`draws every glyph with finite outlines (${STYLES.find(s => s.params === p)?.id ?? `extreme settings ${extremes.indexOf(p)}`})`, () => {
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

  it('monospacing gives every glyph the same advance', () => {
    const font = buildFont({ ...DEFAULTS, mono: 1 });
    const advs = new Set([...'ilmwMW0.'].map(ch => Math.round(font.glyph(ch)!.adv)));
    assert.equal(advs.size, 1);
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

describe('glyph registry', () => {
  it('names in each drawing only settings the letter inspector can show', () => {
    // the inspector lists a letter's settings from its drawing's params, as controls
    for (const id of glyphIds()) for (const k of glyphDefOf(id)!.meta.params ?? []) assert.ok(k in CONTROLS, `${id}: ${k}`);
  });
});

describe('stroke expander (expandStroke)', () => {
  it('keeps a thickness for every point of the skeleton, and the corners of square ends on the outline', () => {
    // stencil.ts reads a stroke's thickness at each point of its skeleton, and corners.ts finds the corners
    // of its square ends among the outline's own points, by identity
    const hook: Cmd[] = [['M', 300, 300], ['C', 300, 450, 200, 520, 60, 480]];
    const ring: Cmd[] = [['M', 250, 0], ['C', 100, 0, 0, 100, 0, 250], ['C', 0, 400, 100, 500, 250, 500], ['C', 400, 500, 500, 400, 500, 250], ['C', 500, 100, 400, 0, 250, 0], ['Z']];
    const cases: [string, Partial<Params>, Cmd[], StrokeOpts][] = [
      ['a curve ending in a ball', { terminal: 'round', terminalForm: 'ball' }, hook, { s: 'flat', e: 'term' }],
      ['a curve ending flat', { terminal: 'flat' }, hook, { s: 'flat', e: 'term' }],
      ['a faceted bowl', { chamfer: 1 }, ring, {}],
      ['a ring', {}, ring, {}],
      ['a stem', {}, [['M', 0, 0], ['L', 0, 500]], { s: 'flat', e: 'flat' }]
    ];
    for (const [name, p, cmds, o] of cases) {
      const ex = expandStroke(cmds, o, buildFont({ ...DEFAULTS, ...p }).m.ctx)!;
      assert.equal(ex.thickness.length, ex.skeleton.flat().length, name);
      for (const c of ex.endCorners) assert.ok(ex.contours[0].includes(c.pt), `${name}: ${c.which}${c.side}`);
      if (name === 'a stem') assert.equal(ex.endCorners.length, 4, 'a stem cut square at both ends has four corners');
    }
  });
});

describe('block letters (build: blocks)', () => {
  const blocks = { ...DEFAULTS, build: 'blocks' as const, weight: 0.6, roundness: 1, joinRound: 0.5 };
  /** The height and width of the ink of path data. */
  const size = (d: string) => {
    const ys = ysOf(d), xs = xsOf(d);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };

  it('has a block for every character but the lowercase, which are drawn from the capitals', () => {
    for (const ch of Object.keys(BLOCKS)) assert.ok(ALL_CHARS.includes(ch) && !CHARSET.lower.includes(ch), ch);
    for (const ch of ALL_CHARS) if (!CHARSET.lower.includes(ch)) assert.ok(ch in BLOCKS, ch);
  });

  it('draws the capitals, figures, punctuation and symbols as blocks with slots and holes cut in', () => {
    const font = buildFont(blocks);
    for (const ch of CHARSET.upper + CHARSET.digits + CHARSET.punct + CHARSET.symbols) {
      const g = font.glyph(ch)!;
      assert.equal(g.strokes.length, 1, `${ch} is one block`);
      assert.equal(g.marks.length, 0, `${ch} has no stroke ends or corners to edit`);
    }
    const E = font.glyph('E')!, O = font.glyph('O')!, I = font.glyph('I')!;
    assert.equal(contours(E.d), 1, 'the slots of E run in from its side');
    assert.equal(contours(O.d), 2);
    assert.equal(O.counters.length, 1, 'the hole of O is its counter');
    assert.equal(contours(I.d), 2, 'I is a bar over a block');
    // wider than high, as on the design grid blocks.ts draws its letters on: 224 by 175
    assert.ok(Math.abs(E.bodyW / font.m.cap - 224 / 175) < 0.01);
  });

  it('draws the lowercase as small capitals', () => {
    const font = buildFont({ ...blocks, xHeight: 1 }), E = size(font.glyph('E')!.d), e = size(font.glyph('e')!.d);
    assert.ok(Math.abs(E.h - font.m.cap) < 2 && Math.abs(e.h - font.m.xh) < 2);
    assert.ok(Math.abs(e.w / e.h - E.w / E.h) < 0.01, 'the same shape, smaller');
  });

  it('closes the slots up as the weight grows, and rounds by Roundness', () => {
    const hole = (w: number) => size(cmdsToD(buildFont({ ...blocks, weight: w }).glyph('O')!.counters[0])).h;
    assert.ok(hole(0.2) > hole(0.6) && hole(0.6) > hole(1));
    assert.equal(curves(buildFont({ ...blocks, roundness: 0, joinRound: 0 }).glyph('E')!.d), 0, 'square blocks at no roundness');
    assert.ok(curves(buildFont(blocks).glyph('E')!.d) >= 10);
  });

  it('keeps strokes for a letter set to them on its own', () => {
    const font = buildFont({ ...blocks, glyphs: { E: { build: 'strokes' } } });
    assert.ok(font.glyph('E')!.strokes.length > 1);
    assert.equal(font.glyph('F')!.strokes.length, 1);
  });
});

describe('rotation', () => {
  /** The ink's box in font units, from the outline's points. */
  const box = (g: Glyph) => {
    const { xs, ys } = coords(g.cmds);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), x0: Math.min(...xs) };
  };

  it('turns every letter alike when synced, and spaces them to fit', () => {
    const up = buildFont({ ...DEFAULTS }), turned = buildFont({ ...DEFAULTS, rotation: 0.75 });
    for (const ch of 'lHo') {
      const a = box(up.glyph(ch)!), b = box(turned.glyph(ch)!);
      // a quarter turn swaps the ink's width and height
      assert.ok(Math.abs(a.w - b.h) < 1 && Math.abs(a.h - b.w) < 1, ch);
      // and the letter keeps its gap to the left, taking the room its turned ink needs
      assert.ok(Math.abs(up.glyph(ch)!.adv - a.w - (turned.glyph(ch)!.adv - b.w)) < 1, ch);
      assert.ok(Math.abs(a.x0 - b.x0) < 1, ch);
    }
    // half a turn either way is the same letter upside down, as wide as it was
    const half = buildFont({ ...DEFAULTS, rotation: 1 }), back = buildFont({ ...DEFAULTS, rotation: 0 });
    assert.ok(Math.abs(half.glyph('R')!.adv - up.glyph('R')!.adv) < 0.5);
    assert.equal(half.glyph('R')!.d, back.glyph('R')!.d);
    assert.equal(buildFont({ ...DEFAULTS, rotation: 0.5 }).glyph('R')!.d, up.glyph('R')!.d);
  });

  it('turns clockwise above the middle', () => {
    // the P's bowl sits at its top; a quarter turn clockwise brings it round to the right
    const g = buildFont({ ...DEFAULTS, rotation: 0.75 }).glyph('P')!, up = buildFont({ ...DEFAULTS }).glyph('P')!;
    const mid = (cs: Glyph['cmds'], i: 1 | 2) => { const v = cs.filter(c => c.length > 1).map(c => c[c.length - 3 + i]); return (Math.min(...v) + Math.max(...v)) / 2; };
    assert.ok(mid(up.counters.flat(), 2) > mid(up.cmds, 2) + 50);
    assert.ok(mid(g.counters.flat(), 1) > mid(g.cmds, 1) + 50);
  });

  it('lets one letter take its own angle while the rest stay synced', () => {
    const f = buildFont({ ...DEFAULTS, glyphs: { a: { rotation: 0.6 } } }), up = buildFont({ ...DEFAULTS });
    assert.notEqual(f.glyph('a')!.d, up.glyph('a')!.d);
    assert.equal(f.glyph('b')!.d, up.glyph('b')!.d);
    assert.equal(buildFont({ ...DEFAULTS, rotation: 0.6 }).glyph('a')!.d, f.glyph('a')!.d);
    assert.ok(isValidParams({ ...DEFAULTS, glyphs: { a: { rotation: 0.6 } } }));
  });

  it('turns block letters and every fill without breaking', () => {
    for (const p of [{ build: 'blocks' as const }, { fill: 'pixels' as const, slice: 1 }, { mono: 1, slant: 1, wobble: 1 }, { serif: true, cursive: 1 }]) {
      const f = buildFont({ ...DEFAULTS, ...p, rotation: 0.37 });
      for (const ch of ALL_CHARS) {
        const g = f.glyph(ch);
        assert.ok(g && !g.d.includes('NaN') && Number.isFinite(g.adv) && g.adv > 0, ch);
      }
    }
  });
});

describe('slider ranges', () => {
  // a slider whose last stretch changes nothing feels broken: at 87 it should look different from 100
  const d = (p: Partial<Params>, chars: string) => chars.split('').map(ch => buildFont({ ...DEFAULTS, ...p }).glyph(ch)!.d).join('|');
  const cases: [string, Partial<Params>, keyof Params, string][] = [
    ['Stencil rounding', { stencil: 0.6, weight: 0.7 }, 'stencilRound', 'HAno'],
    ['Slice rounding', { slice: 0.6, weight: 0.7 }, 'sliceRound', 'Hn'],
    ['Steps', { weight: 0.7 }, 'steps', 'LE'],
    ['Joins rounding, heavy', { weight: 1 }, 'joinRound', 'nh'],
    ['crossbar Gap, heavy', { weight: 1 }, 'barGap', 'eH'],
    ['crossbar Gap run through, heavy', { weight: 1, barEnds: 'through' }, 'barGap', 'AH'],
    ['Horizontals, heavy', { weight: 0.85 }, 'hWeight', 'He'],
    ['Verticals, heavy', { weight: 1 }, 'vWeight', 'Hn'],
    ['Horizontals, blocks', { build: 'blocks' }, 'hWeight', 'He']
  ];
  for (const [name, ctx, k, chars] of cases) {
    it(`${name} still changes the letters near the top of its scale`, () => {
      assert.notEqual(d({ ...ctx, [k]: 0.875 }, chars), d({ ...ctx, [k]: 1 }, chars));
    });
  }
  it('Contrast keeps thinning the bars of heavy letters from the middle of its scale', () => {
    const at = (v: number) => buildFont({ ...DEFAULTS, weight: 0.85, contrast: v }).m.thin;
    assert.ok(at(0.6) < at(0.5) && at(0.7) < at(0.6));
  });
});
