import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFont, cmdsToD, type Glyph } from '../shared/engine';
import { DEFAULTS, joinGap, type Params } from '../shared/params';
import { contours, curves, xsOf, ysOf } from './outlines';

/* Cuts through the letters: Stencil and its gaps (where they sit, how far out, how round), each join opened on
   its own, the crossbar Gap and bars run through, and the Slice. Outlines are read as SVG path data (`d`, y down;
   see outlines.ts). */

describe('cuts: stencil, stencilPos, stencilRound, joinGaps, barGap, barEnds, slice, slicePos, sliceRound', () => {
  it('stencil cuts joined strokes apart and splits round letters', () => {
    const solid = buildFont(DEFAULTS), cut = buildFont({ ...DEFAULTS, stencil: 0.5 });
    // the O's two halves are each one piece of ink, the hole cut with the ring, on either side of the gap
    const O = cut.glyph('O')!, mid = (Math.min(...xsOf(O.d)) + Math.max(...xsOf(O.d))) / 2;
    assert.equal(contours(solid.glyph('O')!.d), 2);
    assert.equal(contours(O.d), 2);
    for (const c of O.d.split('M').slice(1)) { const xs = xsOf(`M${c}`); assert.ok(Math.max(...xs) < mid || Math.min(...xs) > mid); }
    assert.notEqual(cut.glyph('H')!.d, solid.glyph('H')!.d);
  });

  it('a letter opens each join on its own, pulling the stroke back from the one it meets', () => {
    const plain = buildFont({ ...DEFAULTS, weight: 0.6 }), F = plain.glyph('F')!, s = plain.m.s;
    const xs = (g: Glyph, part: string) => xsOf(g.strokes.filter(t => t.part === part).map(t => cmdsToD(t.cmds)).join(''));
    // every join is marked: where a stroke ends in another, and where one turns
    const ids = (ch: string) => plain.glyph(ch)!.marks.filter(k => k.type === 'join').map(k => k.id);
    assert.ok(['0e', '1s', '2s'].every(id => ids('F').includes(id)), `F: ${ids('F')}`);
    assert.ok(ids('A').includes('0t0') && ids('M').includes('2s'), `A: ${ids('A')} M: ${ids('M')}`);
    // the top arm of an F, drawn over its stem, comes off it by the gap; the rest stays put
    const open = buildFont({ ...DEFAULTS, weight: 0.6, glyphs: { F: { joinGaps: { '1s': 0.2 } } } }).glyph('F')!;
    const stemRight = Math.max(...xs(F, 'stem')), armLeft = Math.min(...xs(open, 'arm'));
    assert.ok(Math.abs(armLeft - (stemRight + joinGap(0.2, s))) < 2, `arm starts at ${armLeft}, stem ends at ${stemRight}`);
    assert.equal(JSON.stringify(xs(open, 'stem')), JSON.stringify(xs(F, 'stem')));
    assert.equal(open.marks.find(k => k.id === '1s' && k.type === 'join')!.v, 0.2);
    // a turn comes apart: the A's two legs, drawn as one stroke, part at the apex
    const A = buildFont({ ...DEFAULTS, glyphs: { A: { joinGaps: { '0t0': 0.2 } } } }).glyph('A')!;
    assert.equal(contours(cmdsToD(A.strokes[0].cmds)), 2);
    // a gap wider than the stroke has room for narrows, and leaves it some ink
    const E = buildFont({ ...DEFAULTS, glyphs: { E: { joinGaps: { '2s': 1 } } } }).glyph('E')!;
    assert.equal(contours(cmdsToD(E.strokes.find(t => t.part === 'crossbar')!.cmds)), 1);
    // 0 keeps a join Stencil opens joined, and the mark shows Stencil's gap until then
    const st = buildFont({ ...DEFAULTS, stencil: 0.5 }), H = st.glyph('H')!, bar = (g: Glyph) => JSON.stringify(g.strokes.find(t => t.part === 'crossbar')!.cmds);
    const cutAt = H.marks.filter(k => k.type === 'join' && k.v! > 0).map(k => k.id!);
    assert.equal(cutAt.length, 1);
    const shut = buildFont({ ...DEFAULTS, stencil: 0.5, glyphs: { H: { joinGaps: { [cutAt[0]]: 0 } } } }).glyph('H')!;
    assert.equal(bar(shut), bar(buildFont(DEFAULTS).glyph('H')!));
    assert.notEqual(bar(H), bar(shut));
  });

  it('Gap shortens the crossbars so they stop short of the strokes they meet, cut square', () => {
    const at = (barGap: number, ch: string) => buildFont({ ...DEFAULTS, barGap }).glyph(ch)!;
    const bar = (g: Glyph) => g.strokes.find(t => t.part === 'crossbar')!;
    for (const ch of 'eAHEF') {
      const xs0 = xsOf(cmdsToD(bar(at(0, ch)).cmds)), xs1 = xsOf(cmdsToD(bar(at(0.15, ch)).cmds));
      assert.ok(Math.min(...xs1) > Math.min(...xs0) + 10, `${ch} pulls in from the left`);
      assert.equal(contours(cmdsToD(bar(at(0.15, ch)).cmds)), 1, `${ch} keeps one bar`);
    }
    // both ends of a bar joined at both, square: its ends run straight up and down
    for (const ch of 'eAH') {
      const xs = xsOf(cmdsToD(bar(at(0.15, ch)).cmds)), xs0 = xsOf(cmdsToD(bar(at(0, ch)).cmds));
      assert.ok(Math.max(...xs) < Math.max(...xs0) - 10, `${ch} pulls in from the right`);
      assert.equal(new Set(xs.map(Math.round)).size, 2, `${ch} is cut square`);
    }
    // bars that cross a stem or end free (t f) stay as they are
    for (const ch of 'tf') assert.equal(at(0.3, ch).d, at(0, ch).d);
  });

  it('a crossbar run through the strokes it meets stands free, out to their outside edges', () => {
    const at = (barGap: number, ch: string) => buildFont({ ...DEFAULTS, barGap, barEnds: 'through' }).glyph(ch)!;
    const bar = (g: Glyph) => xsOf(cmdsToD(g.strokes.find(t => t.part === 'crossbar')!.cmds));
    for (const ch of 'AH') {
      const g = at(0.4, ch), xs = bar(g), ink = xsOf(g.d), plain = bar(at(0, ch));
      assert.ok(Math.min(...xs) < Math.min(...plain) - 10 && Math.max(...xs) > Math.max(...plain) + 10, `${ch} runs out past where it met`);
      assert.ok(Math.max(...xs) - Math.min(...xs) > (Math.max(...ink) - Math.min(...ink)) * 0.6, `${ch} reaches the outside edges`);
      assert.equal(new Set(xs.map(Math.round)).size, 2, `${ch} is cut square`);
      // the strokes it meets come apart above and below it: the H's two stems in four pieces, and the bar
      if (ch === 'H') assert.equal(contours(g.d), 5);
    }
    // the E's stem is cut where its middle arm runs through it, out to its outside edge
    const E = at(0.4, 'E');
    assert.equal(Math.round(Math.min(...bar(E))), Math.round(Math.min(...xsOf(E.d))));
    // at 0 the bars stay joined, and bars that cross a stem or end free (t f) stay as they are
    assert.equal(at(0, 'A').d, buildFont(DEFAULTS).glyph('A')!.d);
    for (const ch of 'tf') assert.equal(at(0.4, ch).d, at(0, ch).d);
  });

  it('stencil gaps move out along the stroke and round their corners', () => {
    const at = (p: Partial<Params>) => buildFont({ ...DEFAULTS, stencil: 0.5, ...p }).glyph('H')!.d;
    // moved out, the bar keeps a stub on the stem it's cut from
    assert.equal(contours(at({ stencilPos: 0.5 })) - contours(at({})), 1);
    assert.ok(curves(at({ stencilRound: 1 })) > curves(at({})));
    assert.ok(curves(at({ stencilRound: 1, stencilPos: 0.5 })) > curves(at({ stencilPos: 0.5 })));
    // a rounded O rounds the corners of its halves, and they stay two pieces
    const O = buildFont({ ...DEFAULTS, stencil: 0.5, stencilRound: 1 }).glyph('O')!.d;
    assert.equal(contours(O), 2);
    assert.ok(curves(O) > curves(buildFont({ ...DEFAULTS, stencil: 0.5 }).glyph('O')!.d));
  });

  it('a stencil leaves no chips: a short spur stays whole, and a square join goes with its cut', () => {
    const at = (ch: string, stencilPos: number) => buildFont({ ...DEFAULTS, story: 'single', aForm: 'spur', weight: 0.8, bowlJoin: 'square', stencil: 0.37, stencilRound: 0.75, stencilPos }).glyph(ch)!;
    const ms = (cmds: { 0: string }[]) => cmds.filter(c => c[0] === 'M').length;
    // the spur is too short to leave a solid piece past a gap, so it stays on the stem
    assert.equal(ms(at('a', 0).strokes.find(s => s.part === 'spur')!.cmds), 1);
    // the fillets rounding a bowl into its stem go with the join they round, however far out the gap
    for (const ch of 'abdn') for (const pos of [0, 0.5]) for (const s of at(ch, pos).strokes.filter(s => s.part === 'fillet')) assert.equal(s.cmds.length, 0, `${ch} ${pos}`);
  });

  it('a gap moved out keeps off another stroke joining its stroke', () => {
    // the R's leg springs from the foot of its bowl, so the bowl's gaps stay at the stem, while
    // the leg's own gap still moves out along it
    const R = (stencilPos: number) => buildFont({ ...DEFAULTS, weight: 0.6, stencil: 0.37, stencilPos }).glyph('R')!;
    const part = (pos: number, name: string) => JSON.stringify(R(pos).strokes.find(s => s.part === name)!.cmds);
    assert.equal(part(0.6, 'bowl'), part(0, 'bowl'));
    assert.notEqual(part(0.6, 'leg'), part(0, 'leg'));
  });

  it('a gap moved out stays on its stroke and keeps the angle it has at the join', () => {
    const at = (ch: string, stencilPos: number) => buildFont({ ...DEFAULTS, stencil: 0.5, stencilPos }).glyph(ch)!;
    // each piece of a stroke as its points, and the angles its edges run at, to the degree
    const pieces = (g: Glyph, part: string) => g.strokes.filter(s => s.part === part).flatMap(s => cmdsToD(s.cmds).split('M').slice(1).map(c => {
      const xs = xsOf(`M${c}`), ys = [...`M${c}`.matchAll(/[ML]([^MLCZ]*)/g)].map(m => Number(m[1].trim().split(/\s+/)[1]));
      return xs.map((x, i) => ({ x, y: ys[i] }));
    }));
    const angles = (q: { x: number; y: number }[]) => new Set(q.map((p, i) => {
      const n = q[(i + 1) % q.length];
      return Math.hypot(n.x - p.x, n.y - p.y) < 5 ? null : Math.round((Math.atan2(n.y - p.y, n.x - p.x) * 180 / Math.PI + 360) % 180) % 180;
    }).filter(a => a !== null));
    // two pieces run their edges at the same angles, give or take two degrees
    const same = (a: Set<number>, b: Set<number>) => {
      const near = (x: number, ys: Set<number>) => [...ys].some(y => Math.min(Math.abs(x - y), 180 - Math.abs(x - y)) <= 2);
      return [...a].every(x => near(x, b)) && [...b].every(x => near(x, a));
    };
    const mid = (q: { x: number; y: number }[]) => q.reduce((a, p) => a + p.x, 0) / q.length;
    // the bar of an A is cut parallel to its legs at the join, and stays so moved out, the rest of
    // the bar always left
    const bar0 = angles(pieces(at('A', 0), 'crossbar')[0]);
    for (const stencilPos of [0.5, 1]) {
      const bar = pieces(at('A', stencilPos), 'crossbar').sort((a, b) => mid(a) - mid(b));
      assert.equal(bar.length, 2, `${stencilPos}`);
      assert.ok(same(angles(bar[1]), bar0), `${stencilPos}`);
    }
    // the leg of an R is cut level with the foot of the bowl it joins, however far down its gap goes
    const foot = (stencilPos: number) => pieces(at('R', stencilPos), 'leg').sort((a, b) => Math.max(...b.map(p => p.y)) - Math.max(...a.map(p => p.y)))[0];
    assert.ok(same(angles(foot(1)), angles(foot(0))));
    assert.notEqual(Math.min(...foot(1).map(p => p.y)), Math.min(...foot(0).map(p => p.y)));
    // the arch of an n leaves the stem along it, and its gap still moves out
    assert.notEqual(at('n', 0.5).d, at('n', 0).d);
    assert.equal(contours(at('n', 0.5).d), contours(at('n', 0).d) + 1);
  });

  it('a stroke joined at both ends is cut at one, its gap moving right like every other', () => {
    const at = (ch: string, stencilPos: number) => buildFont({ ...DEFAULTS, stencil: 0.5, stencilPos }).glyph(ch)!;
    const bar = (ch: string, part: string, stencilPos: number) => at(ch, stencilPos).strokes.filter(s => s.part === part).map(s => cmdsToD(s.cmds)).join('');
    for (const [ch, part] of [['H', 'crossbar'], ['A', 'crossbar'], ['e', 'crossbar']]) {
      // one gap, at the left end: the bar's right end still runs into the stroke it joins
      assert.equal(contours(bar(ch, part, 0)), 1, ch);
      const solid = buildFont(DEFAULTS).glyph(ch)!.strokes.filter(s => s.part === part).map(s => cmdsToD(s.cmds)).join('');
      assert.equal(Math.max(...xsOf(bar(ch, part, 0))).toFixed(1), Math.max(...xsOf(solid)).toFixed(1), ch);
      assert.ok(Math.min(...xsOf(bar(ch, part, 0))) > Math.min(...xsOf(solid)), ch);
      // moved out, it leaves a stub on the left and the rest of the bar
      assert.equal(contours(bar(ch, part, 0.5)), 2, ch);
    }
  });

  it('a gap stays at the join on a straight stroke meeting its host at a slant', () => {
    // moved parallel to the tail, a gap on the arm of a heavy y would run down the arm's length
    const y = (stencilPos: number) => buildFont({ ...DEFAULTS, weight: 0.76, width: 0.46, stencil: 0.55, stencilPos }).glyph('y')!.d;
    assert.equal(y(1), y(0));
  });

  it('the slice moves up and down and rounds its corners', () => {
    const f = (p: Partial<Params>) => buildFont({ ...DEFAULTS, slice: 0.5, ...p });
    assert.equal(f({ slicePos: 0.5 }).glyph('H')!.d, f({}).glyph('H')!.d);
    assert.notEqual(f({ slicePos: 0.8 }).glyph('H')!.d, f({}).glyph('H')!.d);
    // at the cap height it misses the lowercase
    const x = f({ slicePos: 1 }).glyph('x')!.d, plain = buildFont(DEFAULTS).glyph('x')!.d;
    assert.equal(contours(x), contours(plain));
    assert.deepEqual([Math.min(...ysOf(x)), Math.max(...ysOf(x))], [Math.min(...ysOf(plain)), Math.max(...ysOf(plain))]);
    assert.notEqual(f({ slicePos: 1 }).glyph('H')!.d, buildFont(DEFAULTS).glyph('H')!.d);
    assert.ok(curves(f({ sliceRound: 1 }).glyph('H')!.d) > curves(f({}).glyph('H')!.d));
    // a sliced o is two arcs of ink, the counter cut with them, however round the cut
    for (const sliceRound of [0, 1]) assert.equal(contours(f({ sliceRound }).glyph('o')!.d), 2);
  });

  it('one letter can have a slice of its own, the rest left as they are', () => {
    const f = buildFont({ ...DEFAULTS, glyphs: { H: { slice: 0.5, slicePos: 0.8 } } }), plain = buildFont(DEFAULTS), cut = buildFont({ ...DEFAULTS, slice: 0.5, slicePos: 0.8 });
    assert.equal(f.glyph('H')!.d, cut.glyph('H')!.d);
    assert.equal(f.glyph('E')!.d, plain.glyph('E')!.d);
    // and a letter can leave out the slice the rest share
    assert.equal(buildFont({ ...DEFAULTS, slice: 0.5, glyphs: { o: { slice: 0 } } }).glyph('o')!.d, plain.glyph('o')!.d);
  });

  it('the slice cuts through the letters at either end of its range, and leaves no slivers', () => {
    const plain = buildFont(DEFAULTS).glyph('H')!.d;
    for (const slicePos of [0, 1]) {
      const H = buildFont({ ...DEFAULTS, slice: 1, slicePos }).glyph('H')!.d;
      // the H keeps its full height, split into a piece above the cut and one below
      assert.deepEqual([Math.min(...ysOf(H)), Math.max(...ysOf(H))], [Math.min(...ysOf(plain)), Math.max(...ysOf(plain))], `${slicePos}`);
      assert.equal(contours(H), contours(plain) + 2, `${slicePos}`);
    }
    // a band grazing the e's bar takes the bar's edge with it, not a hairline of it
    const f = buildFont({ ...DEFAULTS, slice: 0.5 }), e = f.glyph('e')!.d, sliver = f.m.s * 0.35;
    for (const c of e.split('M').slice(1)) { const y = ysOf(`M${c}`); assert.ok(Math.max(...y) - Math.min(...y) >= sliver); }
    // but a hyphen the band runs through is kept
    assert.ok(f.glyph('-')!.d.length > 10);
  });
});
