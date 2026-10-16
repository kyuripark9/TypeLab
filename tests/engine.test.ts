import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONTROLS, STYLES } from '../shared/content';
import { ALL_CHARS, CHARSET, buildFont, cmdsToD, expandStroke, type Cmd, type Glyph } from '../shared/engine';
import { ARC_LETTERS } from '../shared/engine/arcs';
import { BLOCKS } from '../shared/engine/blocks';
import { BASIC } from '../shared/engine/basic-blocks';
import { GRID, gridCells } from '../shared/engine/grid-blocks';
import { glyphDefOf, glyphIds } from '../shared/engine/font';
import type { StrokeOpts } from '../shared/engine/types';
import { DEFAULTS, isValidParams, type Params } from '../shared/params';
import { contours, coords, curves, pathPts, xsOf, ysOf } from './outlines';

/* The font engine as a whole: every style and a set of extreme settings draw every glyph with finite outlines;
   spacing, letters customized on their own, and layout; the glyph registry and the stroke expander's outputs;
   block letters (build 'blocks'), rotation, and sliders that keep changing to 100. Each setting's own tests
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
  { ...DEFAULTS, build: 'blocks', blockForm: 'slots', weight: 1, width: 0, roundness: 1, joinRound: 1, vWeight: 1, hWeight: 1, slant: 1, wobble: 1, mono: 1 },
  { ...DEFAULTS, build: 'blocks', blockForm: 'slots', weight: 0, width: 1, height: 0, xHeight: 0, roundness: 0, vWeight: 0, hWeight: 0, slice: 1, fill: 'pixels' },
  { ...DEFAULTS, build: 'blocks', weight: 1, width: 1, contrast: 1, xHeight: 1, extenders: 0, descender: 0, apex: 1, steps: 1, bowlForm: 'box', boxRound: 0, innerRound: 1, fill: 'outline' },
  { ...DEFAULTS, build: 'blocks', weight: 0, width: 0, contrast: 0, xHeight: 0, extenders: 1, descender: 1, apex: 0, steps: 1, roundness: 1, joinRound: 1, rotation: 0.3, fill: 'shadow' },
  { ...DEFAULTS, build: 'blocks', weight: 1, vWeight: 0, hWeight: 1, bowlForm: 'box', boxRound: 1, height: 1, mirror: 'mirrored', fill: 'inline', glyphs: { a: { blockForm: 'slots' } } },
  { ...DEFAULTS, weight: 1, pinch: 1, pinchPos: 0, steps: 1, bowlForm: 'box', innerRound: 1, serif: true, diagonals: 'arch', mirror: 'mirrored', slant: 1 },
  { ...DEFAULTS, weight: 0, pinch: 1, pinchPos: 1, steps: 1, innerRound: 1, cursive: 1, terminal: 'round', terminalForm: 'ball', chamfer: 1, stencil: 1, fill: 'wire', diagonals: 'arch', bends: 'round' },
  { ...DEFAULTS, weight: 0.6, steps: 0.5, roundness: 1, innerRound: 0.5, wobble: 1, mono: 1, glyphs: { O: { cornerSteps: { '0t0': 0 } }, e: { mirror: 'mirrored' } } },
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

  it('keeps a stroke run back on itself on its line through the hand, so no corner throws a spike', () => {
    // a narrow or heavy loop-legged R's bar runs back to where its leg turns off; the wobble carried it a hair
    // askew, and the corner mitred out hundreds of units past the letter (Casual's R, Jotter's twin)
    for (const p of [{ width: 0.2 }, { width: 0.5, weight: 0.9 }, { ...STYLES.find(s => s.id === 'casual')!.params, width: 0.5 }] as Partial<Params>[]) {
      const font = buildFont({ ...DEFAULTS, ...p, rForm: 'loop', wobble: 1 }), g = font.glyph('R')!, xs = xsOf(g.d);
      assert.ok(Math.min(...xs) > -font.m.s && Math.max(...xs) < g.adv + font.m.s, `R within its box at ${JSON.stringify(p).slice(0, 40)}: ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}`);
    }
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

describe('basic block letters (blockForm: basic)', () => {
  const blocks = { ...DEFAULTS, build: 'blocks' as const, weight: 0.6 };
  const box = (d: string) => {
    const ys = ysOf(d).map(y => -y), xs = xsOf(d);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };

  it('has a block for every character, the lowercase among them', () => {
    assert.deepEqual(Object.keys(BASIC).sort(), [...ALL_CHARS].sort());
  });

  it('draws each character as solid blocks with their counters cut out, and a real lowercase', () => {
    const font = buildFont(blocks);
    for (const ch of ALL_CHARS) {
      const g = font.glyph(ch)!;
      assert.equal(g.strokes.length, 1, `${ch} is one block`);
      assert.equal(g.marks.length, 0, `${ch} has no stroke ends or corners to edit`);
    }
    const O = font.glyph('O')!, E = font.glyph('E')!, x = box(font.glyph('x')!.d), h = box(font.glyph('h')!.d), p = box(font.glyph('p')!.d);
    assert.equal(contours(O.d), 2);
    assert.equal(O.counters.length, 1, 'the hole of O is its counter');
    assert.equal(contours(E.d), 1);
    // the x stands at the x-height, the h's stem rises to the ascenders and the p's hangs to the descenders
    assert.ok(Math.abs(x.y1 - font.m.xh) < 2 && Math.abs(h.y1 - font.m.asc) < 2 && Math.abs(p.y0 - font.m.desc) < 2);
  });

  it('thickens every stroke with Weight and widens the letters, so their counters stay open', () => {
    const at = (w: number) => { const f = buildFont({ ...blocks, weight: w }), O = f.glyph('O')!; return { W: O.bodyW, hole: box(cmdsToD(O.counters[0])) }; };
    const light = at(0), heavy = at(1);
    assert.ok(heavy.W > light.W);
    assert.ok(heavy.hole.x1 - heavy.hole.x0 > (light.hole.x1 - light.hole.x0) * 0.9, 'the counter keeps its width');
    assert.ok(heavy.hole.y1 - heavy.hole.y0 < light.hole.y1 - light.hole.y0);
  });

  it('thins the level strokes with Contrast, and turned round, the upright ones', () => {
    const O = (c: number) => { const g = buildFont({ ...blocks, contrast: c }).glyph('O')!, h = box(cmdsToD(g.counters[0])); return { W: g.bodyW, w: h.x1 - h.x0, h: h.y1 - h.y0 }; };
    const even = O(0.5), high = O(1), reversed = O(0);
    // the counter grows taller between thinner level strokes; thinner stems narrow the letter round the same counter
    assert.ok(high.h > even.h + 20 && Math.abs(high.w - even.w) < 1 && Math.abs(high.W - even.W) < 1);
    assert.ok(reversed.W < even.W - 20 && Math.abs(reversed.w - even.w) < 1 && Math.abs(reversed.h - even.h) < 1);
  });

  it('rounds bowls by Bowls and the rest by Roundness', () => {
    const curved = (p: Partial<Params>, ch: string) => curves(buildFont({ ...blocks, ...p }).glyph(ch)!.d);
    assert.equal(curved({ bowlForm: 'box', boxRound: 0 }, 'O'), 0, 'square boxes');
    // box bowls round outside, square inside; oval ones round both
    assert.equal(curved({ bowlForm: 'box' }, 'O'), 4);
    assert.equal(curved({}, 'O'), 8);
    assert.equal(curved({ bowlForm: 'box' }, 'H'), 0, 'square letters keep square corners');
    assert.ok(curved({ roundness: 1 }, 'H') >= 8);
  });

  it('moves the bars with Crossbar height and the open ends with Openness, leaving both be at the middle', () => {
    const at = (p: Partial<Params>, ch: string) => buildFont({ ...blocks, ...p }).glyph(ch)!.d;
    // H's corners stand at four heights: the baseline, the bar's foot and top, the cap height
    const barFoot = (c: number) => [...new Set(pathPts(buildFont({ ...blocks, crossbar: c }).glyph('H')!.d).map(q => Math.round(q.y)))].sort((x, y) => x - y)[1];
    assert.ok(barFoot(0) < barFoot(0.5) - 40 && barFoot(1) > barFoot(0.5) + 40, 'the bar moves both ways');
    for (const ch of 'ABEFGHPR4') assert.notEqual(at({ crossbar: 0.9 }, ch), at({}, ch), `${ch}'s bar moves`);
    for (const ch of 'CGJS2569ces') assert.notEqual(at({ aperture: 0.1 }, ch), at({}, ch), `${ch} closes`);
    assert.equal(at({ crossbar: 0.5, aperture: 0.5 }, 'G'), at({}, 'G'));
    // C's lower end stands taller up its right side as it closes
    const end = (a: number) => {
      const f = buildFont({ ...blocks, aperture: a }), pts = pathPts(f.glyph('C')!.d), right = Math.max(...pts.map(q => q.x));
      return Math.min(...pts.filter(q => q.x > right - 1 && q.y > 5 && q.y < f.m.cap - 5).map(q => q.y));
    };
    assert.ok(end(0) > end(0.5) + 30 && end(1) < end(0.5) - 30);
  });

  it('keeps a lone bar seen at any contrast: dashes and the bars of + and = no thinner than a share of the stems', () => {
    const f = buildFont({ ...blocks, contrast: 1, hWeight: 0 }), dash = box(f.glyph('-')!.d), H = box(f.glyph('I')!.d);
    assert.ok(dash.y1 - dash.y0 >= (H.x1 - H.x0) * 0.44, 'the hyphen keeps its weight');
    // at the middle of Contrast the level strokes are heavier than that, and the hyphen is as thick as they are
    const g = buildFont(blocks), e = box(g.glyph('-')!.d), I = box(g.glyph('I')!.d);
    assert.ok(e.y1 - e.y0 > (I.x1 - I.x0) * 0.45);
  });

  it('cuts Steps into square corners only, never past the letter', () => {
    for (const ch of 'KAVWxyz4') {
      const a = box(buildFont(blocks).glyph(ch)!.d), b = box(buildFont({ ...blocks, steps: 1 }).glyph(ch)!.d);
      assert.ok(b.x0 >= a.x0 - 0.5 && b.x1 <= a.x1 + 0.5 && b.y0 >= a.y0 - 0.5 && b.y1 <= a.y1 + 0.5, ch);
    }
    assert.notEqual(buildFont({ ...blocks, steps: 1 }).glyph('E')!.d, buildFont(blocks).glyph('E')!.d);
  });
});

describe('slot blocks (the Slot Blocks card)', () => {
  const blocks = { ...DEFAULTS, build: 'blocks' as const, blockForm: 'slots' as const, weight: 0.6, roundness: 1, joinRound: 0.5 };
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

describe('grid blocks (the Grid Blocks card)', () => {
  const grid = { ...DEFAULTS, build: 'blocks' as const, blockForm: 'grid' as const, roundness: 1 };
  const size = (d: string) => {
    const ys = ysOf(d), xs = xsOf(d);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };

  it('has cells for every character, in rows of one length', () => {
    assert.deepEqual(Object.keys(GRID).sort(), [...ALL_CHARS].sort());
    for (const ch of ALL_CHARS) {
      const c = gridCells(ch)!, rows = (typeof GRID[ch] === 'string' ? GRID[ch] : GRID[ch][0]) as string;
      assert.ok(rows.split(' ').every(r => r.length === c.cols && /^[#.]+$/.test(r)), ch);
      assert.ok(c.rows - c.drop >= 5, `${ch} stands on the five rows`);
    }
  });

  it('tells apart the letters and figures alike in shape by at least two cells', () => {
    const cells = (ch: string) => GRID[ch] as string;
    const apart = (a: string, b: string) => [...cells(a)].filter((c, i) => c !== cells(b)[i]).length;
    for (const set of ['obdpq', 'g9q', '6Gb', '5Ss'])
      for (const a of set) for (const b of set) if (a < b && !(a.toLowerCase() === b.toLowerCase())) assert.ok(apart(a, b) >= 2, `${a} ${b}`);
  });

  it('draws every character on cells a fifth of the cap height, upper and lower case alike, at any weight and width', () => {
    for (const p of [grid, { ...grid, weight: 0, width: 0, roundness: 0 }, { ...grid, weight: 1, width: 1 }]) {
      const font = buildFont(p);
      for (const ch of ALL_CHARS) {
        const g = font.glyph(ch)!;
        assert.equal(g.strokes.length, 1, ch);
        assert.ok(g.d.length > 0 && !g.d.includes('NaN'), ch);
      }
    }
    const font = buildFont(grid), n = size(font.glyph('n')!.d), N = size(font.glyph('N')!.d);
    assert.ok(Math.abs(n.h - font.m.cap) < 1 && Math.abs(N.h - font.m.cap) < 1, 'a lowercase n as tall as a capital');
    assert.ok(Math.abs(n.w - n.h) < 1, 'five cells square');
  });

  it('joins strokes meeting at a corner through a neck', () => {
    const font = buildFont(grid);
    assert.equal(contours(font.glyph('o')!.d), 2, 'a ring round its counter, joined at its corners');
    assert.equal(contours(font.glyph('x')!.d), 1, 'diagonals of cells one stroke');
    assert.equal(contours(font.glyph('.')!.d), 1);
    // a single cell rounded right round is a circle: as wide as high, its outline all curves
    assert.equal(curves(font.glyph('.')!.d), 4);
    assert.equal(curves(buildFont({ ...grid, roundness: 0 }).glyph('E')!.d), 0, 'square cells at no roundness');
  });

  it('moves every edge with Weight, and makes the cells wider with Width', () => {
    const stem = (p: Partial<Params>) => size(buildFont({ ...grid, ...p }).glyph('l')!.d).w;
    assert.ok(stem({ weight: 0 }) < stem({ weight: 0.4 }) && stem({ weight: 0.4 }) < stem({ weight: 1 }));
    const w = (width: number) => size(buildFont({ ...grid, width }).glyph('o')!.d).w;
    assert.ok(w(0) < w(0.5) && w(0.5) < w(1));
  });
});

describe('arc letters (the Arcs card)', () => {
  const arcs = { ...DEFAULTS, build: 'arcs' as const, weight: 0.1 };
  /** How far each point of stroke `si`'s centreline in letter `ch` lies off its cut's ellipse, as a share of its size
      (0 on it), the letter drawn upright with `p`. */
  const offEllipse = (p: Params, ch: string, si: number) => {
    const font = buildFont(p), g = font.glyph(ch)!, m = font.m, c = ARC_LETTERS[ch].cuts[si];
    const D = (m.cap + 2 * m.os - m.hT) / 2, sx = D * m.ws, r = (c.rot ?? 0) * Math.PI / 180;
    const cx = g.lsb + m.s / 2 + c.x * sx, cy = m.cap / 2 + c.y * D;
    // the stroke's own run of the skeleton
    assert.ok(g.skeleton[si].length > 8, `${ch} ${si} has its centreline`);
    return g.skeleton[si].map(q => {
      // back through the stretch, then turned upright
      const x = (q.x - cx) / sx, y = (q.y - cy) / D, u = x * Math.cos(r) + y * Math.sin(r), v = -x * Math.sin(r) + y * Math.cos(r);
      return Math.abs(Math.hypot(u / c.a, v / c.b) - 1);
    });
  };

  it('draws every character of the set in arcs, a capital one stroke a cut, the small letters a lowercase of their own', () => {
    const font = buildFont(arcs), strokes = buildFont({ ...arcs, build: 'strokes' });
    for (const ch of [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789']) assert.ok(ARC_LETTERS[ch], ch);
    for (const ch of Object.keys(ARC_LETTERS)) assert.equal(font.glyph(ch)!.strokes.length, ARC_LETTERS[ch].cuts.length, ch);
    for (const ch of [...CHARSET.upper + CHARSET.lower + CHARSET.digits + CHARSET.punct + CHARSET.symbols, 'ı']) {
      const g = font.glyph(ch)!;
      assert.ok(g.d.length > 0 && !g.d.includes('NaN') && g.d !== strokes.glyph(ch)?.d, ch);
    }
    // the small letters stand to the x-height, their ascenders past the capitals and their descenders under the baseline
    const ys = (ch: string) => ysOf(font.glyph(ch)!.d), top = (ch: string) => Math.max(...ys(ch).map(y => -y)), foot = (ch: string) => Math.max(...ys(ch));
    for (const ch of 'acemnorsuvwxz') assert.ok(Math.abs(top(ch) - font.m.xh) < font.m.xh * 0.08, `${ch} ${top(ch).toFixed(0)}`);
    for (const ch of 'bdhkl') assert.ok(top(ch) > font.m.cap * 0.97, ch);
    for (const ch of 'gjpqy') assert.ok(foot(ch) > -font.m.desc * 0.6, ch);
    // an i's dot over its stem, a j's too, and the ı with none
    assert.equal(font.glyph('i')!.strokes.filter(st => st.dot).length, 1);
    assert.equal(font.glyph('ı')!.strokes.filter(st => st.dot).length, 0);
  });

  it('spaces the letters from their ink: a round side closer than a straight one, an open one closer still', () => {
    const font = buildFont(arcs), g = (ch: string) => font.glyph(ch)!;
    assert.ok(g('o').lsb < g('b').lsb && g('o').lsb > 0, `o ${g('o').lsb.toFixed(0)}, b ${g('b').lsb.toFixed(0)}`);
    assert.ok(g('c').rsb < g('c').lsb, 'the c\'s open side');
    // Side margins still reach them
    const wide = buildFont({ ...arcs, sideBearing: 1 });
    assert.ok(wide.glyph('n')!.lsb > g('n').lsb + 20);
  });

  it('keeps every cut on its ellipse, and Width stretches them all across with the height kept', () => {
    for (const ch of Object.keys(ARC_LETTERS)) ARC_LETTERS[ch].cuts.forEach((_, si) => assert.ok(Math.max(...offEllipse(arcs, ch, si)) < 0.01, `${ch} ${si}`));
    const H = (width: number) => buildFont({ ...arcs, width }).glyph('H')!;
    const body = (width: number) => H(width).bodyW - buildFont({ ...arcs, width }).m.s;
    assert.ok(Math.abs(body(0) / body(0.5) - 0.6) < 1e-6 && Math.abs(body(1) / body(0.5) - 1.5) < 1e-6);
    const tall = (width: number) => { const ys = ysOf(H(width).d); return Math.max(...ys) - Math.min(...ys); };
    assert.ok(Math.abs(tall(0) - tall(1)) < 1);
  });

  it('keeps every loop open however heavy, and draws heavier letters wider with Width still reaching them', () => {
    // a loop's centreline (a stroke turning 250° or more round) is at least as wide across as keeps a stroke's 0.4 open
    // inside it (a loop runs across at least 0.75 of its ellipse's narrowest width); a narrow loop that can't keep
    // that open runs less far round, so is no loop
    const turn = (pts: { x: number; y: number }[]) => {
      let t = 0;
      for (let i = 2; i < pts.length; i++) {
        const a = Math.atan2(pts[i - 1].y - pts[i - 2].y, pts[i - 1].x - pts[i - 2].x), b = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
        t += Math.atan2(Math.sin(b - a), Math.cos(b - a));
      }
      return Math.abs(t) * 180 / Math.PI;
    };
    for (const p of [{ ...arcs, weight: 1, width: 0 }, { ...arcs, weight: 1, width: 0.5, xHeight: 0 }]) {
      const font = buildFont(p), s = font.m.s;
      for (const c of CHARSET.upper + CHARSET.lower + CHARSET.digits) font.glyph(c)!.skeleton.forEach((pts, si) => {
        if (pts.length < 3 || turn(pts) < 250) return;
        let across = Infinity;
        for (let i = 0; i < 90; i++) {
          const a = i * Math.PI / 90, d = pts.map(q => q.x * Math.cos(a) + q.y * Math.sin(a));
          across = Math.min(across, Math.max(...d) - Math.min(...d));
        }
        assert.ok(across >= 0.75 * 1.4 * s, `${c} ${si}: ${across.toFixed(0)} across a ${s.toFixed(0)} stroke`);
      });
    }
    const body = (weight: number, width: number) => buildFont({ ...arcs, weight, width }).glyph('M')!.bodyW;
    assert.ok(body(1, 0.5) > body(0.5, 0.5) * 1.15 && body(0.5, 0.5) > body(0.1, 0.5));
    assert.ok(body(1, 0) < body(1, 0.5) && body(1, 0.5) < body(1, 1));
  });

  it('runs Stroke ends\' Length on round each cut\'s own circle, and cuts it back short of it', () => {
    const run = (terminalLength: number) => buildFont({ ...arcs, terminalLength }).glyph('T')!.skeleton[0];
    const span = (pts: { y: number }[]) => Math.max(...pts.map(q => q.y)) - Math.min(...pts.map(q => q.y));
    // the T's stem, a half standing upright, runs on round past its top and bottom and back toward its middle
    assert.ok(span(run(0)) < span(run(0.5)));
    const long = run(1), x = (pts: { x: number }[]) => Math.max(...pts.map(q => q.x));
    assert.ok(x(long) > x(run(0.5)) + 10, 'its ends turn in toward the right');
    for (const v of [0, 0.25, 0.75, 1]) assert.ok(Math.max(...offEllipse({ ...arcs, terminalLength: v }, 'T', 0)) < 0.01, `Length ${v}`);
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
    ['Horizontals, blocks', { build: 'blocks' }, 'hWeight', 'He'],
    ['Horizontals, slot blocks', { build: 'blocks', blockForm: 'slots' }, 'hWeight', 'He'],
    ['Contrast, blocks', { build: 'blocks' }, 'contrast', 'He'],
    ['Peaks, blocks', { build: 'blocks' }, 'apex', 'AVW'],
    ['Steps, blocks', { build: 'blocks', weight: 0.7 }, 'steps', 'LE'],
    ['Box corners, blocks', { build: 'blocks', bowlForm: 'box' }, 'boxRound', 'Oo'],
    ['Weight, heavy blocks', { build: 'blocks' }, 'weight', 'Heo']
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
