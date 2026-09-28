import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STYLES, TERMINAL_DETAILS } from '../shared/content';
import { ALL_CHARS, buildFont } from '../shared/engine';
import { DEFAULTS, TERMINAL_FORMS, isValidParams, onEndScale, sanitizeParams, type Params, type TerminalForm } from '../shared/params';

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
  { ...DEFAULTS, vWeight: 0, hWeight: 1, glyphs: { a: { strokeWeights: { 0: 1, 1: 0 } }, H: { strokeWeights: { 2: 1 } } } }
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

  it('square joins run bowls and arches flat into their stems', () => {
    const f = (bowlJoin: Params['bowlJoin']) => buildFont({ ...DEFAULTS, story: 'single', bowlJoin });
    const curved = f('curved'), square = f('square');
    for (const ch of 'abdgpqnmhru') assert.notEqual(curved.glyph(ch)!.d, square.glyph(ch)!.d, ch);
    for (const ch of 'oceilkv') assert.equal(curved.glyph(ch)!.d, square.glyph(ch)!.d, ch);
    // flat on the x-height like the stem, where a curved bowl overshoots it
    const top = (font: ReturnType<typeof buildFont>) => Math.max(...font.glyph('d')!.skeleton.flat().filter(q => q.x < font.m.s * 2).map(q => q.y));
    assert.ok(top(square) < top(curved));
  });

  it('the mirrored g drops its tail from the left of the bowl and hooks it right', () => {
    const f = (gForm: Params['gForm']) => buildFont({ ...DEFAULTS, gForm });
    const hook = f('hook').glyph('g')!, mirrored = f('mirrored').glyph('g')!;
    const tip = (g: typeof hook) => g.marks.find(k => k.type === 'tail')!;
    assert.ok(tip(hook).x < hook.bodyW / 2 && tip(mirrored).x > mirrored.bodyW / 2);
    assert.equal(f('hook').glyph('q')!.d, f('mirrored').glyph('q')!.d);
  });

  it('the arm and leg of k and K meet where the k form says', () => {
    const f = (kForm: Params['kForm']) => buildFont({ ...DEFAULTS, kForm });
    for (const ch of 'kK') {
      const ds = new Set((['arm', 'stem', 'bar'] as const).map(k => f(k).glyph(ch)!.d));
      assert.equal(ds.size, 3, ch);
    }
    // on a bar, arm and leg leave the stem a bar's length out
    const leg = (kForm: Params['kForm']) => f(kForm).glyph('k')!.strokes.find(s => s.part === 'leg')!;
    assert.ok(leg('bar') && leg('stem'));
    assert.equal(f('arm').glyph('n')!.d, f('bar').glyph('n')!.d);
  });

  it('dots can be picked round or square whatever the corners do', () => {
    const dot = (p: Partial<Params>) => buildFont({ ...DEFAULTS, ...p }).glyph('.')!.d;
    assert.equal(dot({}), dot({ dots: 'square' }));
    assert.notEqual(dot({}), dot({ dots: 'round' }));
    assert.equal(dot({ roundness: 1, dots: 'round' }), dot({ dots: 'round' }));
    assert.equal(dot({ roundness: 1, dots: 'square' }), dot({}));
  });

  it('i and l take a flag and a foot when picked, and in a monospaced sans on auto', () => {
    const w = (p: Partial<Params>, ch: string) => buildFont({ ...DEFAULTS, ...p }).glyph(ch)!.bodyW;
    for (const ch of 'il') {
      assert.ok(w({ iForm: 'bars' }, ch) > w({}, ch) * 2, ch);
      assert.equal(w({ mono: 1 }, ch), w({ mono: 1, iForm: 'bars' }, ch), ch);
      assert.ok(w({ mono: 1, iForm: 'plain' }, ch) < w({ mono: 1 }, ch), ch);
    }
  });

  it('I and J take bars with i and l', () => {
    const f = (iForm: Params['iForm']) => buildFont({ ...DEFAULTS, iForm });
    assert.ok(f('bars').glyph('I')!.bodyW > f('plain').glyph('I')!.bodyW * 2);
    assert.ok(f('bars').glyph('J')!.bodyW > f('plain').glyph('J')!.bodyW);
  });

  it('A V W and v w can stand one side upright, and the upright A has no crossbar', () => {
    const f = (diagonals: Params['diagonals']) => buildFont({ ...DEFAULTS, diagonals });
    for (const ch of 'AVWvw') assert.notEqual(f('symmetric').glyph(ch)!.d, f('upright').glyph(ch)!.d, ch);
    assert.ok(!f('upright').glyph('A')!.strokes.some(s => s.part === 'crossbar'));
    // the right side is a stem: its foot sits under its top
    const V = f('upright').glyph('V')!, xs = V.skeleton.flat().map(q => q.x);
    assert.ok(Math.max(...xs) - Math.min(...xs) > V.bodyW * 0.7);
    assert.equal(f('symmetric').glyph('X')!.d, f('upright').glyph('X')!.d);
  });

  it('round bends turn A M N V W Z in one smooth stroke that still reaches the cap height and baseline', () => {
    const f = (p: Partial<Params>) => buildFont({ ...DEFAULTS, ...p });
    for (const ch of 'AMNVWZvwz') {
      const round = f({ bends: 'round' }).glyph(ch)!, sharp = f({}).glyph(ch)!;
      assert.notEqual(round.d, sharp.d, ch);
      assert.ok(round.cmds.some(c => c[0] === 'C'), ch);
    }
    // the outline's heights, its curves sampled along their length
    const ys = (ch: string, p: Partial<Params>) => {
      const out: number[] = [];
      let y0 = 0;
      for (const c of f(p).glyph(ch)!.cmds) {
        if (c[0] === 'C') for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; out.push(u * u * u * y0 + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6]); }
        else if (c[0] !== 'Z') out.push(c[2]);
        if (c[0] !== 'Z') y0 = c[c.length - 1];
      }
      return out;
    };
    for (const apex of [0, 0.5, 1]) {
      const m = f({ bends: 'round', apex }).m, y = ys('M', { bends: 'round', apex });
      assert.ok(Math.abs(Math.max(...y) - m.cap - m.os) < 3 && Math.abs(Math.min(...y) + m.os) < 3, `M at apex ${apex}`);
    }
    // Peaks sets how wide a round bend turns
    assert.notEqual(f({ bends: 'round', apex: 0 }).glyph('N')!.d, f({ bends: 'round', apex: 1 }).glyph('N')!.d);
    assert.equal(f({ bends: 'round' }).glyph('O')!.d, f({}).glyph('O')!.d);
  });

  it('box bowls round their corners outside and keep them square inside', () => {
    const f = (p: Partial<Params>) => buildFont({ ...DEFAULTS, ...p });
    const rings = (p: Partial<Params>) => {
      const out: number[][][] = [];
      for (const c of f(p).glyph('O')!.strokes[0].cmds) {
        if (c[0] === 'M') out.push([]);
        if (c[0] !== 'Z') out[out.length - 1].push([c[c.length - 2], c[c.length - 1]]);
      }
      // each ring's bounding box corner, and how near the ring comes to it
      return out.map(r => {
        const x = Math.min(...r.map(q => q[0])), y = Math.max(...r.map(q => q[1]));
        return { w: Math.max(...r.map(q => q[0])) - x, near: Math.min(...r.map(q => Math.hypot(q[0] - x, q[1] - y))) };
      }).sort((a, b) => a.w - b.w);
    };
    const s = f({}).m.s, [inner, outer] = rings({ bowlForm: 'box' });
    assert.ok(inner.near < 2, 'square inside');
    assert.ok(outer.near > s * 0.2, 'round outside');
    assert.ok(rings({})[0].near > s * 0.2, 'an oval rounds inside too');
    // the J keeps its hook, and letters without curves don't change
    const J = f({ bowlForm: 'box' }).glyph('J')!, tip = J.marks.find(k => k.type === 'tail')!;
    assert.ok(tip.y > f({}).m.cap * 0.2);
    for (const ch of 'EHKLTX') assert.equal(f({ bowlForm: 'box' }).glyph(ch)!.d, f({}).glyph(ch)!.d, ch);
  });

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

  it('keeps the fillets of square joins on stems a contrast turned round draws thinner', () => {
    // evened out, the stems draw thinner than the stem weight the letters reckon with
    const g = buildFont({ ...DEFAULTS, bowlJoin: 'square', contrast: 0.45 }).glyph('d')!;
    const xs = (part: string) => g.strokes.filter(s => s.part === part).flatMap(s => s.cmds.filter(c => c[0] !== 'Z').map(c => c[c.length - 2] as number));
    const stemLeft = Math.min(...xs('stem')), filletRight = Math.max(...xs('fillet'));
    assert.ok(filletRight > stemLeft, `the fillets reach into the stem (${filletRight} against ${stemLeft})`);
  });

  it('gives the a a spur, a square-joined bowl, and moves the crossbars of f and t', () => {
    const f = (p: Partial<Params> = {}) => buildFont({ ...DEFAULTS, story: 'double', ...p });
    const a = f().glyph('a')!, spur = f({ aForm: 'spur' }).glyph('a')!;
    assert.ok(spur.strokes.some(s => s.part === 'spur') && spur.bodyW > a.bodyW, 'the spur runs out past the stem');
    assert.ok(!f({ aForm: 'spur', serif: true }).glyph('a')!.strokes.some(s => s.part === 'spur'), 'a serif stands in for it');
    assert.notEqual(f({ bowlJoin: 'square' }).glyph('a')!.d, a.d, 'the double-storey bowl joins square too');
    const bar = (ch: string, crossbar: number) => {
      const s = f({ crossbar }).glyph(ch)!.strokes.find(s => s.part === 'crossbar')!;
      return Math.min(...s.cmds.filter(c => c[0] !== 'Z').map(c => c[c.length - 1] as number));
    };
    for (const ch of 'ft') {
      assert.equal(f().glyph(ch)!.d, f({ crossbar: 0.5 }).glyph(ch)!.d);
      assert.ok(bar(ch, 0.2) < bar(ch, 0.5) && bar(ch, 0.8) > bar(ch, 0.5), `${ch}'s crossbar follows Crossbar`);
    }
  });

  it('the loop R turns its bowl back into the leg short of the stem', () => {
    const f = (rForm: Params['rForm']) => buildFont({ ...DEFAULTS, rForm });
    assert.notEqual(f('leg').glyph('R')!.d, f('loop').glyph('R')!.d);
    // the bowl runs on round into the leg in one stroke, beside the stem
    assert.equal(f('loop').glyph('R')!.strokes.length, 2);
    assert.equal(f('leg').glyph('P')!.d, f('loop').glyph('P')!.d);
  });

  it('the Y can be a cup, and the tail of Q can run from inside the bowl', () => {
    const f = (p: Partial<Params>) => buildFont({ ...DEFAULTS, ...p });
    for (const ch of 'Yy') assert.notEqual(f({ yForm: 'cup' }).glyph(ch)!.d, f({}).glyph(ch)!.d, ch);
    const q = f({ qForm: 'inside' }).glyph('Q')!, tip = q.marks.find(k => k.type === 'tail')!;
    assert.ok(tip.x < q.bodyW && tip.y > 0, 'the tail ends inside the bowl');
    assert.ok(f({ qForm: 'inside', tail: 1 }).glyph('Q')!.d !== q.d);
  });

  it('straight stroke ends run level or plumb without closing a mouth or losing a hook', () => {
    const curved = buildFont(DEFAULTS), straight = buildFont({ ...DEFAULTS, terminalRun: 'straight' });
    // the top end of c runs level along the top of the bowl
    const c = straight.glyph('c')!, ends = c.marks.filter(k => k.type === 'terminal'), top = Math.max(...ends.map(k => k.y));
    assert.ok(Math.abs(top - Math.max(...c.skeleton.flat().map(q => q.y))) < 1);
    const terms = (font: ReturnType<typeof buildFont>, ch: string) => font.glyph(ch)!.marks.filter(k => k.type === 'terminal').length;
    for (const ch of 'cesaCGS') assert.equal(terms(straight, ch), terms(curved, ch), ch);
    // the mouth stays open: its two ends stand well apart
    assert.ok(Math.abs(ends[0].y - ends[1].y) > c.bodyW * 0.5);
    // the hook of j finishes its turn instead of straightening out
    const j = straight.glyph('j')!, tip = j.marks.find(k => k.type === 'tail')!;
    assert.ok(tip.x < j.bodyW - straight.m.s);
    for (const ch of 'noilkx') assert.equal(curved.glyph(ch)!.d, straight.glyph(ch)!.d, ch);
  });

  it('descender length moves the descenders only', () => {
    const f = (descender: number) => buildFont({ ...DEFAULTS, descender }).m;
    assert.ok(f(0).desc > f(0.5).desc && f(1).desc < f(0.5).desc);
    assert.equal(f(0).asc, f(1).asc);
    assert.equal(buildFont(DEFAULTS).m.desc, f(0.5).desc);
  });

  it('square joins round the inside corner and keep the outside square', () => {
    const fillets = (p: Partial<Params>, ch: string) => buildFont({ ...DEFAULTS, ...p }).glyph(ch)!.strokes.filter(s => s.part === 'fillet').length;
    for (const ch of 'nmhurdbpq') {
      assert.ok(fillets({ bowlJoin: 'square' }, ch) > 0, ch);
      assert.equal(fillets({}, ch), 0, ch);
    }
    // a wireframe shows the strokes as drawn
    assert.equal(fillets({ bowlJoin: 'square', fill: 'wire' }, 'n'), 0);
    // flat on the x-height: the n's top is level all the way from the stem to its round corner
    const n = buildFont({ ...DEFAULTS, bowlJoin: 'square' }).glyph('n')!, m = buildFont(DEFAULTS).m;
    const top = n.skeleton.flat().filter(q => q.x < n.bodyW / 2).map(q => q.y);
    assert.ok(Math.max(...top) - Math.min(...top.filter(y => y > m.xh * 0.8)) < m.hT);
  });

  it('the flat-spined s runs its spine level between two turns', () => {
    const f = (sForm: Params['sForm']) => buildFont({ ...DEFAULTS, sForm });
    for (const ch of 'sS$') assert.notEqual(f('curved').glyph(ch)!.d, f('flat').glyph(ch)!.d, ch);
    // the middle stretch of the spine lies on one level
    const s = f('flat').glyph('s')!, mid = s.skeleton.flat().filter(q => Math.abs(q.x - s.bodyW / 2) < s.bodyW * 0.15 && q.y > 0 && q.y < f('flat').m.xh * 0.8);
    assert.ok(mid.length > 0 && Math.max(...mid.map(q => q.y)) - Math.min(...mid.map(q => q.y)) < 1);
    assert.equal(f('curved').glyph('o')!.d, f('flat').glyph('o')!.d);
  });

  it('dot size grows the dots round their centres', () => {
    const dot = (dotSize: number, ch = 'i') => {
      const g = buildFont({ ...DEFAULTS, dotSize }).glyph(ch)!, d = g.strokes.find(s => s.dot)!;
      const ys = d.cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 1) as number[]);
      return { h: Math.max(...ys) - Math.min(...ys), cy: (Math.max(...ys) + Math.min(...ys)) / 2 };
    };
    assert.ok(dot(1).h > dot(0.5).h && dot(0).h < dot(0.5).h);
    assert.ok(Math.abs(dot(1).cy - dot(0.5).cy) < 1);
    assert.ok(dot(1, '.').h > dot(0.5, '.').h);
    assert.equal(buildFont(DEFAULTS).glyph('i')!.d, buildFont({ ...DEFAULTS, dotSize: 0.5 }).glyph('i')!.d);
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
    assert.equal(own.glyph('c')!.d, base.glyph('c')!.d);
    // the letter's Length sits on the lower part of an end's own scale, and reaches as far there
    const at = (v: number) => ends(buildFont({ ...DEFAULTS, glyphs: { C: { terminalEnds: { [a.id!]: v } } } })).find(k => k.id === a.id)!;
    const full = ends(buildFont({ ...DEFAULTS, terminalLength: 1 })).find(k => k.id === a.id)!, v = onEndScale(1);
    assert.ok(v > 0.7 && v < 0.8, `${v}`);
    assert.ok(Math.hypot(at(v).x - full.x, at(v).y - full.y) < 0.01);
    assert.equal(onEndScale(0.3), 0.3);
    // and past it the end draws on much further than Length can take it
    assert.ok(moved(a.id!) > 3 * Math.hypot(full.x - a.x, full.y - a.y));
  });

  it('curls, straightens and flares one end on its own', () => {
    const C = (curl: number, ch = 'C') => {
      const base = buildFont(DEFAULTS), e = base.glyph(ch)!.marks.find(k => k.type === 'terminal')!;
      const g = buildFont({ ...DEFAULTS, glyphs: { [ch]: { terminalCurls: { [e.id!]: curl } } } }).glyph(ch)!;
      return { g, base: base.glyph(ch)!, e, tip: g.marks.find(k => k.id === e.id)! };
    };
    for (const ch of 'CcfrtyJ') {
      assert.equal(C(0.5, ch).g.d, C(0.5, ch).base.d, ch);
      for (const v of [0, 0.25, 0.75, 1]) {
        const { g, base } = C(v, ch);
        assert.notEqual(g.d, base.d, `${ch} ${v}`);
        assert.equal(g.marks.filter(k => k.type === 'terminal').length, base.marks.filter(k => k.type === 'terminal').length, `${ch} ${v}`);
      }
    }
    // the C's top end, curving down and round to the left, curls further round; straightened it
    // heads off to the right from where its curve starts
    const top = C(0.5), round = C(1), flat = C(0.25);
    assert.ok(round.tip.x < top.tip.x && round.tip.y < top.tip.y);
    assert.ok(flat.tip.y > top.tip.y);
    // no jump on leaving 0.5: a step half as big moves the tip half as far
    const step = (v: number) => Math.hypot(C(v).tip.x - top.tip.x, C(v).tip.y - top.tip.y);
    assert.ok(step(0.51) < 15 && Math.abs(step(0.51) - 2 * step(0.505)) < 0.3);
    // all the way, an end winds round more than once, drawing itself out as far as it needs
    const reach = (g: typeof round.g) => {
      const tip = g.marks.find(k => k.id === top.e.id)!;
      return Math.hypot(tip.x - top.e.x, tip.y - top.e.y);
    };
    assert.ok(reach(round.g) > 60 && reach(C(0).g) > 60);
    assert.ok(C(0, 'c').g.adv > C(0.5, 'c').g.adv, 'a curl swinging out widens its letter');
    // a curl winding back toward the letter keeps clear of its other strokes, however far the end is drawn on
    for (const len of [0.5, 1]) {
      const { e } = C(1, 'r'), font = buildFont({ ...DEFAULTS, glyphs: { r: { terminalCurls: { [e.id!]: 1 }, terminalEnds: { [e.id!]: len } } } });
      const [stem, arm] = font.glyph('r')!.strokes, xs = (s: typeof stem) => s.cmds.flatMap(c => typeof c[1] === 'number' ? [c[1]] : []);
      const low = arm.cmds.filter(c => typeof c[2] === 'number' && c[2] < font.m.xh * 0.5).map(c => c[1] as number);
      assert.ok(low.length && Math.min(...low) > Math.max(...xs(stem)) + font.m.s * 0.2, `r at length ${len}`);
    }
    // all the way out, a curl with room to wind winds round far more than once (along the arm,
    // which first unbends, it turns over twice)
    const wound = (weight: number) => {
      const { e } = C(0, 'r'), line = buildFont({ ...DEFAULTS, weight, glyphs: { r: { terminalCurls: { [e.id!]: 0 } } } }).glyph('r')!.skeleton.at(-1)!;
      let turned = 0;
      for (let k = 2; k < line.length; k++) {
        const a = Math.atan2(line[k - 1].y - line[k - 2].y, line[k - 1].x - line[k - 2].x), b = Math.atan2(line[k].y - line[k - 1].y, line[k].x - line[k - 1].x);
        turned += Math.atan2(Math.sin(b - a), Math.cos(b - a));
      }
      return Math.abs(turned) / (2 * Math.PI);
    };
    assert.ok(wound(0.5) > 2 && wound(0.5) < 3.5, `${wound(0.5)}`);
    // wound round more than once, a curl's tip stays clear of the turn around it, however heavy
    for (const weight of [0.3, 0.5, 0.75]) {
      const { e } = C(0, 'j'), font = buildFont({ ...DEFAULTS, weight, glyphs: { j: { terminalCurls: { [e.id!]: 0 } } } });
      for (const line of font.glyph('j')!.skeleton) {
        const tip = line[line.length - 1];
        let arc = 0;
        for (let k = line.length - 2; k >= 0; k--) {
          arc += Math.hypot(line[k + 1].x - line[k].x, line[k + 1].y - line[k].y);
          if (arc > Math.PI * font.m.s * 1.3) assert.ok(Math.hypot(line[k].x - tip.x, line[k].y - tip.y) > font.m.s * 1.5, `j at weight ${weight}`);
        }
      }
    }
    assert.equal(sanitizeParams({ glyphs: { C: { terminalCurls: { '0e': 1.4, x: 0.2 } } } }).glyphs.C.terminalCurls!['0e'], 1);
  });

  it('curls every terminal in sync with Curl, unless an end has a curl of its own', () => {
    const base = buildFont(DEFAULTS), e = base.glyph('c')!.marks.filter(k => k.type === 'terminal').map(k => k.id!);
    const one = (curls: Record<string, number>) => buildFont({ ...DEFAULTS, glyphs: { c: { terminalCurls: curls } } }).glyph('c')!.d;
    const all = (v: number, p: Partial<Params> = {}) => buildFont({ ...DEFAULTS, ...p, terminalCurl: v });
    assert.equal(all(0.5).glyph('c')!.d, base.glyph('c')!.d);
    for (const v of [0.2, 0.8]) assert.equal(all(v).glyph('c')!.d, one(Object.fromEntries(e.map(id => [id, v]))), `${v}`);
    for (const ch of 'CfrtyJ') assert.notEqual(all(0.8).glyph(ch)!.d, base.glyph(ch)!.d, ch);
    // an end's own curl wins over it, and one letter can have a Curl of its own
    assert.equal(all(0.8, { glyphs: { c: { terminalCurls: { [e[0]]: 0.5 } } } }).glyph('c')!.d, one({ [e[1]]: 0.8 }));
    const own = all(0.5, { glyphs: { c: { terminalCurl: 0.8 } } });
    assert.equal(own.glyph('c')!.d, all(0.8).glyph('c')!.d);
    assert.equal(own.glyph('C')!.d, base.glyph('C')!.d);
    assert.equal(sanitizeParams({ terminalCurl: 2 }).terminalCurl, 1);
  });

  it('draws each form of each kind of stroke end, and shapes it in finer detail', () => {
    const c = (p: Partial<Params>) => buildFont({ ...DEFAULTS, ...p }).glyph('c')!.d;
    for (const [kind, forms] of Object.entries(TERMINAL_FORMS) as [Params['terminal'], readonly TerminalForm[]][]) {
      const first = c({ terminal: kind });
      forms.forEach((form, i) => {
        const base = c({ terminal: kind, terminalForm: form });
        assert.ok(!base.includes('NaN'), form);
        // the first form is the kind as it always looked; the others differ from it
        if (i === 0) assert.equal(base, first, form); else assert.notEqual(base, first, form);
        // a form of another kind leaves this one as it was
        if (i > 0) assert.equal(c({ terminal: kind === 'flat' ? 'round' : 'flat', terminalForm: form }), c({ terminal: kind === 'flat' ? 'round' : 'flat' }), `${form} elsewhere`);
        for (const k of TERMINAL_DETAILS[form]) {
          for (const v of [0, 1]) {
            if (v === DEFAULTS[k]) continue;
            const d = c({ terminal: kind, terminalForm: form, [k]: v });
            assert.notEqual(d, base, `${k} ${v} on ${form}`);
            assert.ok(!d.includes('NaN'), `${k} ${v} on ${form}`);
          }
        }
      });
    }
    // a letter can have its own
    const font = buildFont({ ...DEFAULTS, terminal: 'round', glyphs: { c: { terminalForm: 'droplet' } } });
    assert.notEqual(font.glyph('c')!.d, c({ terminal: 'round' }));
    assert.equal(font.glyph('e')!.d, buildFont({ ...DEFAULTS, terminal: 'round' }).glyph('e')!.d);
    assert.equal(sanitizeParams({ terminalForm: 'spiky' }).terminalForm, DEFAULTS.terminalForm);
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

  it('gives the free ends of stems, legs and diagonals a length and curl of their own', () => {
    const base = buildFont(DEFAULTS), plain = (ch: string, f = base) => f.glyph(ch)!.marks.filter(k => k.type === 'end');
    for (const ch of 'lAHkxn') assert.ok(plain(ch).length, ch);
    // an end buried in another stroke (T's stem top, under the bar) and a closed shape have none
    assert.deepEqual(plain('T').map(k => k.id), ['p0s']);
    assert.equal(plain('O').length, 0);
    // Length and Curl (as a swash style sets it) leave them where they are drawn
    const swash = STYLES.find(s => s.params.terminalCurl !== 0.5)!.params;
    for (const ch of 'lA') {
      assert.equal(buildFont({ ...DEFAULTS, terminalLength: 1 }).glyph(ch)!.d, base.glyph(ch)!.d, ch);
      assert.equal(buildFont({ ...DEFAULTS, terminalCurl: swash.terminalCurl }).glyph(ch)!.d, base.glyph(ch)!.d, ch);
    }
    // their own length draws them on, past the clip at A's feet
    const foot = plain('A').find(k => k.id === 'p0s')!;
    const long = plain('A', buildFont({ ...DEFAULTS, glyphs: { A: { terminalEnds: { p0s: 0.9 } } } })).find(k => k.id === 'p0s')!;
    assert.ok(long.y < foot.y - 100, `${long.y}`);
    // and their own curl bends them
    assert.notEqual(buildFont({ ...DEFAULTS, glyphs: { l: { terminalCurls: { p0e: 0.8 } } } }).glyph('l')!.d, base.glyph('l')!.d);
    assert.deepEqual(sanitizeParams({ terminalEnds: { p0s: 0.3, q0s: 1 } }).terminalEnds, { p0s: 0.3 });
    // with serifs on, every letter keeps the same ends: a serif goes with its end, and a curl lets it go
    const serif = buildFont({ ...DEFAULTS, serif: true }), ids = (f: typeof base, ch: string) => f.glyph(ch)!.marks.filter(k => k.id).map(k => k.id).sort();
    for (const ch of 'lHkEf') assert.deepEqual(ids(serif, ch), ids(base, ch), ch);
    const l = serif.glyph('l')!, top = l.marks.find(k => k.id === 'p0e')!;
    const tall = buildFont({ ...DEFAULTS, serif: true, glyphs: { l: { terminalEnds: { p0e: 0.9 } } } }).glyph('l')!;
    assert.ok(tall.marks.find(k => k.id === 'p0e')!.y > top.y + 100);
    assert.equal(tall.serifs.length, l.serifs.length);
    assert.equal(buildFont({ ...DEFAULTS, serif: true, glyphs: { l: { terminalCurls: { p0e: 0.8 } } } }).glyph('l')!.serifs.length, l.serifs.length - 1);
  });

  it('squares and facets curves', () => {
    const round = buildFont(DEFAULTS), square = buildFont({ ...DEFAULTS, squareness: 1 }), cut = buildFont({ ...DEFAULTS, chamfer: 1 });
    assert.notEqual(round.glyph('O')!.d, square.glyph('O')!.d);
    // fully faceted, an O is an octagon ring: a handful of corners instead of a sampled curve
    const points = (d: string) => d.split(/[MLC]/).length - 1;
    assert.ok(points(cut.glyph('O')!.d) <= 30, `${points(cut.glyph('O')!.d)} points`);
    assert.ok(points(round.glyph('O')!.d) > 60);
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

  it('moves a contrast saved with a separate reverse onto the two-way scale', () => {
    const p = sanitizeParams({ ...DEFAULTS, contrast: 0.62, reverse: 1, glyphs: { a: { contrast: 1 }, b: { reverse: 0 } } });
    assert.ok(Math.abs(p.contrast - 0.18) < 1e-9);
    assert.ok(!('reverse' in p));
    assert.deepEqual(p.glyphs, { a: { contrast: 0 }, b: { contrast: 0.8 } });
    assert.equal(sanitizeParams({ ...DEFAULTS, contrast: 0.05, reverse: 0 }).contrast, 0.5, 'the old default is the middle');
    assert.equal(sanitizeParams({ contrast: 0.3 }).contrast, 0.3, 'today\'s settings stay as they are');
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

  it('weighs the verticals, the horizontals, and each stroke of one letter on their own', () => {
    const box = (cmds: (string | number)[][]) => {
      const xs = cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 0)) as number[], ys = cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 1)) as number[];
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
    const xs = (cmds: (string | number)[][]) => cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 0)) as number[];
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
        const ys = s.cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 1)) as number[], y0 = Math.min(...ys), y1 = Math.max(...ys);
        assert.ok(barYs.some(y => Math.abs(y - y0) < 3 || Math.abs(y - y1) < 3), `a ${bowlForm} bowl weighed ${w} keeps its round on its bar`);
      }
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

  it('keeps only corner ids it knows, clamped', () => {
    const p = sanitizeParams({ glyphs: { O: { corners: { '0t1': 2, '3sl': 0.4, bogus: 1, '0x': 0.2 }, innerCorners: { '0t1': -1, '3sl': 0.4 } } } });
    assert.deepEqual(p.glyphs.O?.corners, { '0t1': 1, '3sl': 0.4 });
    assert.deepEqual(p.glyphs.O?.innerCorners, { '0t1': 0 }, 'only a turn has an inside');
  });

  it('keeps only stroke ids it knows, clamped', () => {
    const p = sanitizeParams({ ...DEFAULTS, glyphs: { H: { strokeWeights: { 0: 2, 12: 0.3, '0s': 0.5, x: 1, 1: 'a' } } } });
    assert.deepEqual(p.glyphs.H.strokeWeights, { 0: 1, 12: 0.3 });
    assert.deepEqual(sanitizeParams({ ...DEFAULTS, glyphs: { H: { strokeWeights: { x: 1 } } } }).glyphs, {});
    assert.equal(sanitizeParams({ vWeight: 3, hWeight: -1 }).vWeight, 1);
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
