import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFont, cmdsToD } from '../shared/engine';
import { DEFAULTS, sanitizeParams, type Params } from '../shared/params';
import { contours, pathPts, xsOf } from './outlines';

/* Corners: each corner of a letter rounded on its own inside and out, end corners, the inside corners where
   strokes meet (Joins), Steps, Counters (innerRound), and squared and faceted curves. Outlines: `d` is SVG path
   data (y down); `cmds` and marks are font units, y up (see outlines.ts). */

describe('corners: corners, innerCorners, joinRound, steps, cornerSteps, innerRound, squareness, chamfer', () => {
  it('rounds each corner of a letter on its own, from sharp to round inside and out', () => {
    const f = (ch: string, corners: Record<string, number> = {}, p: Partial<Params> = {}) =>
      buildFont({ ...DEFAULTS, ...p, glyphs: { [ch]: { corners } } }).glyph(ch)!;
    const ids = (g: ReturnType<typeof f>) => g.marks.filter(k => k.type === 'corner').map(k => k.id).sort();
    // a boxed O turns four times; each corner can be set without moving the others
    const box = { bowlForm: 'box' } as const, O = f('O', {}, box);
    assert.deepEqual(ids(O), ['0t0', '0t1', '0t2', '0t3']);
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    // (a box corner rounds outside as wide as the stroke: low on a scale that runs to the letter's height)
    const boxV = O.marks.find(k => k.type === 'corner')!.v!;
    assert.ok(boxV > 0.1 && boxV < 0.4);
    assert.ok(O.marks.every(k => k.type !== 'corner' || (near(k.v!, boxV) && k.vi === 0)), 'a box corner is round outside, square inside');
    const sharp = f('O', { '0t0': 0 }, box), round = f('O', { '0t0': 1 }, box);
    assert.notEqual(sharp.d, O.d);
    assert.notEqual(round.d, O.d);
    assert.equal(sharp.marks.find(k => k.id === '0t0')!.v, 0);
    assert.ok(near(sharp.marks.find(k => k.id === '0t1')!.v!, boxV));
    // rounded right up, the four corners of a box make a ring as round as an O's
    const ring = f('O', { '0t0': 1, '0t1': 1, '0t2': 1, '0t3': 1 }, box), wide = (g: ReturnType<typeof f>) => {
      const xs = g.cmds.filter(c => c[0] !== 'Z').map(c => c[c.length - 2] as number);
      return Math.max(...xs) - Math.min(...xs);
    };
    assert.ok(Math.abs(wide(ring) - wide(O)) < 2, 'rounding keeps the box as wide');
    assert.notEqual(ring.d, round.d);
    // one corner rounded right up takes what the square-ish corners beside it leave, well past half
    // of each side, sweeping round like a quarter circle
    const pts = (g: ReturnType<typeof f>) => g.cmds.filter(c => c[0] !== 'Z').map(c => ({ x: c[c.length - 2] as number, y: c[c.length - 1] as number }));
    const yTop = Math.max(...pts(O).map(p => p.y)), xs = pts(O).map(p => p.x), mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    assert.ok(pts(round).filter(p => Math.abs(p.y - yTop) < 1).every(p => p.x < mid), 'the round reaches past the middle of the top');
    // the ends of E's arms and the corners of its stem show; where the stem and an arm end together
    // they are one corner, and the stem's corners along the arms are hidden
    assert.deepEqual(ids(f('E')).filter(id => !id!.includes('j')), ['0el', '0sr', '1el', '1er', '2el', '2er', '3el', '3er']);
    assert.notEqual(f('E', { '0el': 1 }).d, f('E').d);
    // the stem of T ends inside its bar, so only its foot has corners
    assert.ok(!ids(f('T')).includes('0el') && ids(f('T')).includes('0sl'));
    // a sharpened apex still comes to the cap height
    const A = f('A', { '0t0': 0 }, { diagonals: 'upright', bends: 'round' }), m = buildFont(DEFAULTS).m;
    const top = Math.max(...A.cmds.filter(c => c[0] !== 'Z').map(c => c[c.length - 1] as number));
    assert.ok(Math.abs(top - m.cap - m.os) < 2, `apex at ${top}`);
    // the inside of a turn rounds on its own; left alone it follows the outside, keeping the stroke even
    const inner = (v: number, o?: number) => buildFont({ ...DEFAULTS, ...box, glyphs: { O: { innerCorners: { '0t0': v }, ...(o != null ? { corners: { '0t0': o } } : {}) } } }).glyph('O')!;
    assert.notEqual(inner(0.5).d, O.d);
    assert.equal(inner(0).d, O.d, 'a square inside, as a box draws it');
    assert.ok(near(inner(0.5).marks.find(k => k.id === '0t0')!.vi!, 0.5));
    assert.ok(near(inner(0.5).marks.find(k => k.id === '0t0')!.v!, boxV), 'the outside stays as drawn');
    assert.notEqual(inner(0.2, 0.6).d, round.d);
    assert.ok(round.marks.find(k => k.id === '0t0')!.vi! > 0, 'rounded wide, the outside brings the inside with it');
    assert.equal(f('E').marks.find(k => k.id === '0el')!.vi, undefined, "an end's corner has no inside");
    // a corner's own roundness belongs to its letter alone
    assert.equal(buildFont({ ...DEFAULTS, ...box, glyphs: { O: { corners: { '0t0': 0 } } } }).glyph('D')!.d, buildFont({ ...DEFAULTS, ...box }).glyph('D')!.d);
  });

  it("rounds an end's corner right round when its other corner is hidden in another stroke", () => {
    // the top of a single-story a's stem: its other corner is in the bowl, which runs on from it
    const p = { ...DEFAULTS, story: 'single', bowlJoin: 'square' } as const;
    const inset = (v?: number) => {
      const f = buildFont({ ...p, glyphs: { a: { corners: v == null ? {} : { '0er': v } } } }), g = f.glyph('a')!;
      const pts = g.cmds.filter(c => c[0] !== 'Z').map(c => ({ x: c[c.length - 2] as number, y: c[c.length - 1] as number }));
      const top = Math.max(...pts.map(q => q.y)), right = Math.max(...pts.map(q => q.x));
      // how far in from the stem's side the outline is, half a stroke down from the top
      return (right - Math.max(...pts.filter(q => q.y > top - f.m.s / 2).map(q => q.x))) / f.m.s;
    };
    assert.ok(inset() < 0.05, 'square as drawn');
    // half a stroke across (as far as an end's corner rounds when both show) would still be square there
    assert.ok(inset(1) > 1, `rounded right round, it sweeps into the bowl (${inset(1)})`);
    assert.ok(inset(0.5) > 0.2 && inset(0.5) < inset(1));
  });

  it('rounds the inside corners where strokes meet, all by Joins or each on its own', () => {
    const f = (ch: string, p: Partial<Params> = {}) => buildFont({ ...DEFAULTS, ...p }).glyph(ch)!;
    const joins = (g: ReturnType<typeof f>) => g.marks.filter(k => k.type === 'corner' && k.id!.includes('j'));
    // the crossbar of a t makes four inside corners with the stem; the bar of a T two, its top running flush
    const t = f('t');
    assert.deepEqual(joins(t).map(k => k.id).sort(), ['0j0', '0j1', '0j2', '0j3']);
    assert.equal(joins(f('T')).length, 2);
    assert.ok(joins(t).every(k => k.v === 0), 'sharp unless rounded');
    // Joins rounds them all, filling ink into the corners
    const all = f('t', { joinRound: 0.4 });
    assert.notEqual(all.d, t.d);
    assert.ok(joins(all).every(k => k.v === 0.4));
    assert.ok(all.strokes.filter(s => s.part === 'fillet').length === 4);
    // a letter rounds one on its own, leaving the rest sharp
    const below = joins(t).reduce((a, k) => (k.y < a.y || (k.y === a.y && k.x > a.x) ? k : a)).id!;
    const one = f('t', { glyphs: { t: { corners: { [below]: 0.5 } } } });
    assert.equal(one.strokes.filter(s => s.part === 'fillet').length, 1);
    assert.ok(joins(one).every(k => k.v === (k.id === below ? 0.5 : 0)));
    // a stencil keeps its gaps and a wireframe its strokes as drawn
    assert.equal(f('t', { joinRound: 0.5, stencil: 0.5 }).strokes.filter(s => s.part === 'fillet').length, 0);
    assert.equal(sanitizeParams({ glyphs: { t: { corners: { '0j2': 0.3 } } } }).glyphs.t?.corners?.['0j2'], 0.3);
  });

  it('steps cut a square notch out of the corners of a letter, and a letter can step each corner its own way', () => {
    const base = { ...DEFAULTS, weight: 0.7, contrast: 0.5, hWeight: 0.54, bowlForm: 'box' as const, boxRound: 0, bowlJoin: 'square' as const };
    const plain = buildFont(base), stepped = buildFont({ ...base, steps: 1 });
    const corner = (d: string) => { const q = pathPts(d); const x0 = Math.min(...q.map(p => p.x)), y0 = Math.min(...q.map(p => p.y)); return q.some(p => Math.hypot(p.x - x0, p.y - y0) < 2); };
    // the foot of the L, where its stem and arm end together, stands back in a step
    assert.ok(corner(plain.glyph('L')!.d) && !corner(stepped.glyph('L')!.d));
    for (const ch of 'LOEC') assert.equal(contours(stepped.glyph(ch)!.d), contours(plain.glyph(ch)!.d), `the steps leave ${ch} in one piece`);
    // every corner of a box O is a square turn, stepped by Steps
    const O = stepped.glyph('O')!.marks.filter(k => k.type === 'corner');
    assert.deepEqual(O.map(k => k.st), [1, 1, 1, 1]);
    assert.notEqual(stepped.glyph('O')!.d, plain.glyph('O')!.d);
    // a letter can take the step off each corner, or give one where Steps is off
    const own = buildFont({ ...base, steps: 1, glyphs: { O: { cornerSteps: { '0t0': 0, '0t1': 0, '0t2': 0, '0t3': 0 } } } });
    assert.equal(own.glyph('O')!.d, plain.glyph('O')!.d);
    assert.equal(buildFont({ ...base, glyphs: { O: { cornerSteps: { '0t2': 1 } } } }).glyph('O')!.marks.filter(k => k.st).length, 1);
    // joins have no step
    assert.ok(stepped.glyph('E')!.marks.filter(k => k.id?.includes('j')).every(k => k.st === undefined));
  });

  it('inside corners round the counters the same whatever the weight, filling square corners in', () => {
    const fillets = (p: Partial<Params>, ch: string) => buildFont({ ...DEFAULTS, ...p }).glyph(ch)!.strokes.filter(s => s.part === 'fillet' && s.cmds.length);
    const size = (d: string) => { const xs = xsOf(d); return Math.max(...xs) - Math.min(...xs); };
    assert.equal(fillets({ weight: 0 }, 'H').length, 0);
    const H = fillets({ weight: 0, innerRound: 0.5 }, 'H'), cap = buildFont(DEFAULTS).m.cap;
    assert.equal(H.length, 4, 'above and below the crossbar on both sides');
    assert.ok(H.every(s => size(cmdsToD(s.cmds)) > cap * 0.1), 'much wider than the hairline strokes');
    // the same size at any weight
    const heavy = fillets({ weight: 0.6, innerRound: 0.5 }, 'H');
    assert.ok(Math.abs(size(cmdsToD(heavy[0].cmds)) - size(cmdsToD(H[0].cmds))) < cap * 0.03);
    // a narrow crotch rounds less, so it doesn't fill in black
    const K = fillets({ weight: 0, innerRound: 0.5, kForm: 'stem' }, 'K');
    assert.ok(K.every(s => size(cmdsToD(s.cmds)) < size(cmdsToD(H[0].cmds))));
    // and the turns of box bowls round inside
    assert.notEqual(buildFont({ ...DEFAULTS, bowlForm: 'box', innerRound: 0.5 }).glyph('O')!.d, buildFont({ ...DEFAULTS, bowlForm: 'box' }).glyph('O')!.d);
  });

  it('squares and facets curves', () => {
    const round = buildFont(DEFAULTS), square = buildFont({ ...DEFAULTS, squareness: 1 }), cut = buildFont({ ...DEFAULTS, chamfer: 1 });
    assert.notEqual(round.glyph('O')!.d, square.glyph('O')!.d);
    // fully faceted, an O is an octagon ring: a handful of corners instead of a sampled curve
    const points = (d: string) => d.split(/[MLC]/).length - 1;
    assert.ok(points(cut.glyph('O')!.d) <= 30, `${points(cut.glyph('O')!.d)} points`);
    assert.ok(points(round.glyph('O')!.d) > 60);
  });
});
