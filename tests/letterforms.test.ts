import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STYLES } from '../shared/content';
import { ALL_CHARS, buildFont } from '../shared/engine';
import { DEFAULTS, type Params } from '../shared/params';
import { coords, xsOf } from './outlines';

/* The letters' forms and heights: the a's storey and spur, how bowls join and overlap their stems, the forms of
   g, k, Q, R, s, Y and i/l/I/J, dots, diagonals, bends, box bowls, mirrored letters, the crossbar's height, and
   the descender, stem and tail lengths. Outlines: `d` is SVG path data (y down); `cmds`, strokes, skeleton and
   marks are font units, y up (see outlines.ts). */

describe('letter forms: story, overlap, bowlJoin, gForm, qForm, kForm, dots, dotSize, iForm, diagonals, bends, bowlForm, boxRound, aForm, crossbar, rForm, yForm, sForm, mirror', () => {
  it('a picked storey overrides the one the other settings choose', () => {
    const single = (p: Partial<Params>) => buildFont({ ...DEFAULTS, ...p }).eff.singleStory;
    const a = (p: Partial<Params>) => buildFont({ ...DEFAULTS, ...p }).glyph('a')!.d;
    assert.ok(!single({}) && single({ cursive: 1 }) && single({ geoHuman: 0 }));
    assert.ok(single({ story: 'single' }) && !single({ story: 'double', cursive: 1 }) && !single({ story: 'double', geoHuman: 0 }));
    assert.equal(a({}), a({ story: 'double' }));
    assert.notEqual(a({}), a({ story: 'single' }));
    // (the storeys of the print a: a script writes its own)
    assert.equal(a({ cursive: 1, scriptForm: 'print' }), a({ cursive: 1, scriptForm: 'print', story: 'single' }));
    assert.notEqual(a({ cursive: 1, scriptForm: 'print' }), a({ cursive: 1, scriptForm: 'print', story: 'double' }));
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

  it('keeps the fillets of square joins on stems a contrast turned round draws thinner', () => {
    // evened out, the stems draw thinner than the stem weight the letters reckon with
    const g = buildFont({ ...DEFAULTS, bowlJoin: 'square', contrast: 0.45 }).glyph('d')!;
    const xs = (part: string) => g.strokes.filter(s => s.part === part).flatMap(s => s.cmds.filter(c => c[0] !== 'Z').map(c => c[c.length - 2] as number));
    const stemLeft = Math.min(...xs('stem')), filletRight = Math.max(...xs('fillet'));
    assert.ok(filletRight > stemLeft, `the fillets reach into the stem (${filletRight} against ${stemLeft})`);
  });

  it('the mirrored g drops its tail from the left of the bowl and hooks it right', () => {
    const f = (gForm: Params['gForm']) => buildFont({ ...DEFAULTS, gForm });
    const hook = f('hook').glyph('g')!, mirrored = f('mirrored').glyph('g')!;
    const tip = (g: typeof hook) => g.marks.find(k => k.type === 'tail')!;
    assert.ok(tip(hook).x < hook.bodyW / 2 && tip(mirrored).x > mirrored.bodyW / 2);
    assert.equal(f('hook').glyph('q')!.d, f('mirrored').glyph('q')!.d);
  });

  it('the two-storey g has a bowl on the x-height and a loop under the baseline', () => {
    const f = buildFont({ ...DEFAULTS, gForm: 'double' }), g = f.glyph('g')!, hook = buildFont(DEFAULTS).glyph('g')!;
    assert.notEqual(g.d, hook.d);
    const ys = g.skeleton.flat().map(q => q.y);
    assert.ok(Math.max(...ys) > f.m.xh * 0.9 && Math.min(...ys) < f.m.desc * 0.8);
    // its outline holds two counters (holes), the bowl's and the loop's
    assert.ok((g.d.match(/M/g) ?? []).length >= 3);
  });

  it('the swept Q tail runs out from under the bowl to the right, longer with Tails & hooks', () => {
    const f = (tail: number) => buildFont({ ...DEFAULTS, qForm: 'sweep', tail }), tip = (t: number) => f(t).glyph('Q')!.marks.find(k => k.type === 'tail')!;
    assert.ok(tip(0.5).y < 0 && tip(0.5).x > f(0.5).glyph('Q')!.bodyW * 0.8);
    assert.ok(tip(1).x > tip(0).x);
  });

  it('the arm and leg of k and K meet where the k form says', () => {
    const f = (kForm: Params['kForm']) => buildFont({ ...DEFAULTS, kForm });
    for (const ch of 'kK') {
      const ds = new Set((['arm', 'stem', 'bar'] as const).map(k => f(k).glyph(ch)!.d));
      assert.equal(ds.size, 3, ch);
    }
    // both forms draw the leg as a stroke of its own
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

  it('dot size grows the dots round their centres', () => {
    const dot = (dotSize: number, ch = 'i') => {
      const g = buildFont({ ...DEFAULTS, dotSize }).glyph(ch)!, d = g.strokes.find(s => s.dot)!;
      const { ys } = coords(d.cmds);
      return { h: Math.max(...ys) - Math.min(...ys), cy: (Math.max(...ys) + Math.min(...ys)) / 2 };
    };
    assert.ok(dot(1).h > dot(0.5).h && dot(0).h < dot(0.5).h);
    assert.ok(Math.abs(dot(1).cy - dot(0.5).cy) < 1);
    assert.ok(dot(1, '.').h > dot(0.5, '.').h);
    assert.equal(buildFont(DEFAULTS).glyph('i')!.d, buildFont({ ...DEFAULTS, dotSize: 0.5 }).glyph('i')!.d);
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

  it('A M N V W and v w can be drawn as arches, with no diagonals', () => {
    const f = buildFont({ ...DEFAULTS, diagonals: 'arch' });
    for (const ch of 'AMNVWvw') assert.ok(!f.glyph(ch)!.strokes.some(s => s.part === 'diagonal'), ch);
    assert.ok(f.glyph('A')!.strokes.some(s => s.part === 'crossbar'));
    assert.ok(!f.glyph('N')!.strokes.some(s => s.part === 'crossbar'));
    // their sides stand upright, so they take a stem's margins
    assert.equal(f.glyph('V')!.lsb, f.glyph('U')!.lsb);
    assert.ok(f.glyph('V')!.lsb > buildFont(DEFAULTS).glyph('V')!.lsb);
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
    // Corners, under Bowls (boxRound): sharp at 0, as drawn at 0.5, wider at 1, square inside all the way; ovals ignore it
    const [in0, out0] = rings({ bowlForm: 'box', boxRound: 0 }), [in1, out1] = rings({ bowlForm: 'box', boxRound: 1 });
    assert.ok(out0.near < 2, 'sharp box corners at 0');
    assert.ok(out1.near > outer.near * 1.5, 'wider box corners at 1');
    assert.ok(in0.near < 2 && in1.near < 2, 'square inside either way');
    assert.equal(f({ bowlForm: 'box', boxRound: 0.5 }).glyph('O')!.d, f({ bowlForm: 'box' }).glyph('O')!.d);
    assert.equal(f({ boxRound: 1 }).glyph('O')!.d, f({}).glyph('O')!.d);
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
      assert.ok(bar(ch, 0.2) < bar(ch, 0.5) && bar(ch, 0.8) > bar(ch, 0.5), `${ch}'s crossbar follows Crossbar height`);
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

  it('the flat-spined s runs its spine level between two turns', () => {
    const f = (sForm: Params['sForm']) => buildFont({ ...DEFAULTS, sForm });
    for (const ch of 'sS$') assert.notEqual(f('curved').glyph(ch)!.d, f('flat').glyph(ch)!.d, ch);
    // the middle stretch of the spine lies on one level
    const s = f('flat').glyph('s')!, mid = s.skeleton.flat().filter(q => Math.abs(q.x - s.bodyW / 2) < s.bodyW * 0.15 && q.y > 0 && q.y < f('flat').m.xh * 0.8);
    assert.ok(mid.length > 0 && Math.max(...mid.map(q => q.y)) - Math.min(...mid.map(q => q.y)) < 1);
    assert.equal(f('curved').glyph('o')!.d, f('flat').glyph('o')!.d);
  });

  it('mirrors a letter left to right, on its own', () => {
    const plain = buildFont(DEFAULTS), f = buildFont({ ...DEFAULTS, glyphs: { e: { mirror: 'mirrored' }, R: { mirror: 'mirrored' } } });
    for (const ch of 'eR') {
      const g = f.glyph(ch)!, p = plain.glyph(ch)!;
      assert.equal(Math.round(g.adv), Math.round(p.adv));
      const a = xsOf(g.d).map(x => Math.round(x)).sort((u, v) => u - v), b = xsOf(p.d).map(x => Math.round(p.adv - x)).sort((u, v) => u - v);
      assert.ok(a.every((x, i) => Math.abs(x - b[i]) <= 1), `${ch} is its mirror image`);
    }
    assert.equal(f.glyph('a')!.d, plain.glyph('a')!.d);
  });
});

describe('heights: descender, extenders, tail', () => {
  it('descender length moves the descenders only', () => {
    const f = (descender: number) => buildFont({ ...DEFAULTS, descender }).m;
    assert.ok(f(0).desc > f(0.5).desc && f(1).desc < f(0.5).desc);
    assert.equal(f(0).asc, f(1).asc);
    assert.equal(buildFont(DEFAULTS).m.desc, f(0.5).desc);
  });

  it('extenders lengthen ascenders and descenders', () => {
    const short = buildFont({ ...DEFAULTS, extenders: 0 }), long = buildFont({ ...DEFAULTS, extenders: 1 });
    assert.ok(long.m.asc > short.m.asc && long.m.desc < short.m.desc);
    // at the middle of Stem length the ascenders are the taller of 1.05 caps and 1.18 x-heights (metrics in font.ts)
    const m = buildFont(DEFAULTS).m;
    assert.equal(m.asc, Math.max(m.cap * 1.05, m.xh * 1.18));
  });

  it('keeps the hook of an f clear of its crossbar, however short the ascenders', () => {
    for (const st of STYLES) {
      if (st.params.build === 'blocks' || st.params.cursive > 0.3) continue;
      const f = buildFont({ ...st.params, fill: 'solid', stencil: 0, slice: 0, rotation: 0.5, slant: 0, wobble: 0 }), g = f.glyph('f')!;
      const stem = g.strokes.find(s => s.part === 'stem'), bar = g.strokes.find(s => s.part === 'crossbar');
      assert.ok(stem && bar, `${st.id}: the f has a stem and a crossbar`);
      const top = Math.max(...coords(stem.cmds).ys), barTop = Math.max(...coords(bar.cmds).ys);
      assert.ok(top - barTop > f.m.s * 0.6, `${st.id}: ${Math.round(top - barTop)} between the bar and the top of the hook`);
    }
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
    assert.ok(tip(f(1, { cursive: 1, scriptForm: 'print' }), 'n').x > tip(f(0, { cursive: 1, scriptForm: 'print' }), 'n').x);
  });

  it('puts the handle of every tail and exit stroke on the end of its stroke', () => {
    // (on a pen that neither wobbles nor facets its curves)
    for (const p of [{ tail: 0 }, { tail: 1 }, { cursive: 1, scriptForm: 'print' as const }, { scriptForm: 'script' as const }]) {
      const f = buildFont({ ...DEFAULTS, ...p });
      for (const ch of ALL_CHARS) {
        const g = f.glyph(ch)!, ends = g.skeleton.flatMap(l => (l.length ? [l[0], l[l.length - 1]] : []));
        for (const k of g.marks) if (k.type === 'tail' || k.type === 'exit') assert.ok(ends.some(e => Math.hypot(e.x - k.x, e.y - k.y) < 1), `${ch} ${k.type}`);
      }
    }
  });
});
