import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STYLES } from '../shared/content';
import { buildFont } from '../shared/engine';
import { combine, cutOut, shape, unite } from '../shared/engine/boolean';
import type { Node } from '../shared/engine/outline';
import { toPolys } from '../shared/engine/geom';
import { signedArea } from '../shared/engine/geom';
import { DEFAULTS, FILLS, sanitizeParams } from '../shared/params';
import { coords } from './outlines';

/* Fills: pixels and dots on one grid, every fill drawing every glyph, the Outline, Inline and Shadow, and the
   nonzero joins and cuts (boolean.ts) they are made with, and a free font's letter drawn in pieces made one (unite).
   `cmds` are font units, y up. */

describe('fills: fill, module', () => {
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
    for (const fill of FILLS.filter(f => f !== 'solid')) {
      const f = buildFont({ ...DEFAULTS, fill });
      for (const ch of 'HOag') assert.notEqual(f.glyph(ch)!.d, buildFont(DEFAULTS).glyph(ch)!.d);
    }
  });

  it('an outline draws the letter hollow, one line round its edge and nothing down its middle', () => {
    for (const ch of 'IlO') {
      const p = { ...DEFAULTS, weight: 0.7 }, solid = toPolys(buildFont(p).glyph(ch)!.cmds), f = toPolys(buildFont({ ...p, fill: 'outline' }).glyph(ch)!.cmds);
      // each contour of the letter, and one hollow turned the other way inside it
      assert.equal(f.length, solid.length * 2, ch);
      assert.equal(f.filter(q => signedArea(q) < 0).length, solid.length, ch);
    }
    // (designs saved with the fill 'outline-inline' come back as an Outline)
    assert.equal(sanitizeParams({ ...DEFAULTS, fill: 'outline-inline' }).fill, 'outline');
  });

  it('an inline cuts a line down the middle of the strokes and leaves ink either side of it', () => {
    const solid = buildFont({ ...DEFAULTS, weight: 0.7 }), f = buildFont({ ...DEFAULTS, weight: 0.7, fill: 'inline', module: 0.5 });
    const g = f.glyph('H')!, stem = solid.glyph('H')!.strokes.find(s => s.part === 'stem')!, ink = shape(toPolys(g.cmds));
    const { xs } = coords(stem.cmds), x0 = Math.min(...xs), x1 = Math.max(...xs), mid = (x0 + x1) / 2;
    assert.ok(!ink.has(mid, f.m.cap / 4), 'the middle of the stem is cut');
    assert.ok(ink.has(x0 + 3, f.m.cap / 4) && ink.has(x1 - 3, f.m.cap / 4), 'ink either side of the line');
    assert.ok(ink.has(mid, 3), 'the line stops short of the free end of the stem');
    for (const st of STYLES) for (const ch of 'BRg&@') assert.ok(buildFont({ ...st.params, fill: 'inline' }).glyph(ch)!.d, `${st.id} ${ch}`);
  });

  it('an inline only takes ink away, in joined-up scripts too, and runs on where letters join', () => {
    // a script goes back over its own lines and swells beside them, where an inline cut that comes apart
    // would fill whole counters in
    for (const id of ['monoline', 'swash', 'brush', 'signature']) {
      const p = { ...STYLES.find(s => s.id === id)!.params, weight: 0.55 }, solid = buildFont(p), f = buildFont({ ...p, fill: 'inline' });
      for (const ch of 'youcandesigthr') {
        const ink = shape(toPolys(f.glyph(ch)!.cmds)), full = shape(toPolys(solid.glyph(ch)!.cmds));
        let inside = 0, extra = 0;
        for (let x = -100; x < 900; x += 6) for (let y = -300; y < 900; y += 6) {
          if (full.has(x, y)) inside++;
          else if (ink.has(x, y)) extra++;
        }
        assert.ok(extra <= inside * 0.002, `${id} ${ch}: ${extra} of ${inside}`);
      }
      // the entry and exit strokes of an even pen line keep the line right out to their ends
      if (id !== 'monoline') continue;
      const g = f.glyph('n')!, sk = g.skeleton.flat(), ink = shape(toPolys(g.cmds));
      const exit = sk.reduce((m, q) => (q.x > m.x ? q : m)), back = sk.find(q => Math.hypot(q.x - exit.x, q.y - exit.y) > f.m.s * 0.3 && q.x > exit.x - f.m.s)!;
      assert.ok(!ink.has((exit.x * 3 + back.x) / 4, (exit.y * 3 + back.y) / 4), `${id}: the line runs out of the exit`);
    }
  });

  it('a shadow falls down to the right of the letter, a gap apart, and takes its own room', () => {
    const solid = buildFont({ ...DEFAULTS, weight: 0.7 }), f = buildFont({ ...DEFAULTS, weight: 0.7, fill: 'shadow', module: 0.5 });
    const g = f.glyph('l')!, l = solid.glyph('l')!, { xs } = coords(l.cmds);
    const x1 = Math.max(...xs), ink = shape(toPolys(g.cmds)), y = f.m.xh / 2;
    assert.ok(ink.has(x1 - 3, y), 'the letter itself');
    assert.ok(!ink.has(x1 + 2, y), 'a gap beside it');
    assert.ok(ink.has(x1 + f.m.s * 0.4, y - f.m.s * 0.5), 'the shadow beyond the gap');
    assert.ok(g.adv > l.adv, 'the shadow widens the letter');
  });

  it('makes a letter drawn in overlapping pieces one outline, keeping its curves and its winding', () => {
    const rect = (x0: number, y0: number, x1: number, y1: number): Node[] => [{ x: x0, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 }];
    const area = (c: Node[]) => c.reduce((a, p, i) => { const q = c[(i + 1) % c.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2;
    // a stem and a bar run into it, clockwise as a font's: one outline, the ink of both, clockwise still
    const T = unite([rect(250, 0, 350, 700), rect(0, 600, 600, 700)]);
    assert.equal(T.length, 1);
    assert.equal(T[0].length, 8);
    assert.ok(Math.abs(area(T[0]) + (100 * 600 + 600 * 100)) < 1e-6, `${area(T[0])}`);
    // a bowl, the lower left quarter of a ring round (400, 300), run into a stem: the bowl's curve outside the stem is
    // the very same curve
    const k = 0.5523, R = 300, r = 200;
    const bowl: Node[] = [{ x: 400, y: 0, ox: 400 - k * R, oy: 0 }, { x: 100, y: 300, ix: 100, iy: 300 - k * R }, { x: 200, y: 300, ox: 200, oy: 300 - k * r }, { x: 400, y: 100, ix: 400 - k * r, iy: 100 }];
    const one = unite([rect(350, 0, 450, 700), bowl]);
    assert.equal(one.length, 1);
    const at = (p: number[], t: number) => (1 - t) ** 3 * p[0] + 3 * (1 - t) ** 2 * t * p[1] + 3 * (1 - t) * t * t * p[2] + t ** 3 * p[3];
    const i = one[0].findIndex(n => n.x === 100 && n.y === 300), a = one[0][i - 1], b = one[0][i];
    assert.ok(a && a.ox !== undefined && b.ix !== undefined, 'the bowl\'s outer curve, cut where it meets the stem');
    // (halfway along what is left of it lies on the bowl's own curve)
    const mid = { x: at([a.x, a.ox!, b.ix!, b.x], 0.5), y: at([a.y, a.oy!, b.iy!, b.y], 0.5) };
    let near = Infinity;
    for (let t = 0; t <= 1; t += 1e-5) near = Math.min(near, Math.hypot(at([400, 400 - k * R, 100, 100], t) - mid.x, at([0, 0, 300 - k * R, 300], t) - mid.y));
    assert.ok(near < 0.01, `on the bowl's curve (${near})`);
    assert.ok(area(one[0]) < 0, 'clockwise, as the pieces were');
    // pieces apart are handed back as they are
    const apart = [rect(0, 0, 100, 100), rect(200, 0, 300, 100)];
    assert.equal(unite(apart), apart);
  });

  it('cuts one outline out of another, keeping the curves and the winding', () => {
    const rect = (x0: number, y0: number, x1: number, y1: number): Node[] => [{ x: x0, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 }];
    const area = (c: Node[]) => c.reduce((a, p, i) => { const q = c[(i + 1) % c.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2;
    // a bar across a stem cuts it in two, clockwise as the stem was
    const two = cutOut([rect(0, 0, 100, 700)], [rect(-50, 300, 200, 400)]);
    assert.equal(two.length, 2);
    assert.ok(two.every(c => area(c) < 0));
    assert.ok(Math.abs(two.reduce((a, c) => a + area(c), 0) + 100 * 600) < 1e-6);
    // a cutter inside the ink leaves a hole running the other way; one clear of it hands the outline back as it is
    const holed = cutOut([rect(0, 0, 100, 700)], [rect(30, 300, 60, 400)]);
    assert.equal(holed.length, 2);
    assert.ok(Math.sign(area(holed[0])) === -Math.sign(area(holed[1])));
    const stem = [rect(0, 0, 100, 700)];
    assert.equal(cutOut(stem, [rect(200, 0, 300, 100)]), stem);
    assert.equal(cutOut(stem, []), stem);
    // a round cutter's curve is the cut's edge
    const k = 0.5523, disc: Node[] = [{ x: 150, y: 350, ix: 150, iy: 350 - 100 * k, ox: 150, oy: 350 + 100 * k }, { x: 50, y: 450, ix: 50 + 100 * k, iy: 450, ox: 50 - 100 * k, oy: 450 }, { x: -50, y: 350, ix: -50, iy: 450 - 100 * k, ox: -50, oy: 250 + 100 * k }, { x: 50, y: 250, ix: 50 - 100 * k, iy: 250, ox: 50 + 100 * k, oy: 250 }];
    const bitten = cutOut(stem, [disc]);
    assert.equal(bitten.length, 2);
    assert.ok(bitten.every(c => c.some(n => n.ix !== undefined || n.ox !== undefined)));
  });

  it('joins and cuts outlines with the nonzero rule', () => {
    const sq = (x: number, y: number, w: number) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + w }, { x, y: y + w }];
    const a = shape([sq(0, 0, 10)]), b = shape([sq(5, 5, 10)]), hole = shape([sq(3, 3, 4)]);
    const both = combine([a, b], (x, y) => a.has(x, y) || b.has(x, y));
    assert.equal(both.length, 1);
    assert.equal(both[0].length, 8);
    assert.ok(Math.abs(signedArea(both[0]) - 175) < 1e-6);
    const cut = combine([a, hole], (x, y) => a.has(x, y) && !hole.has(x, y));
    assert.deepEqual(cut.map(p => Math.round(signedArea(p))).sort((p, q) => p - q), [-16, 100]);
    // two strokes along the same edge count once
    const c = shape([sq(0, 0, 10), sq(10, 0, 10)]);
    const joined = combine([c], c.has);
    assert.equal(joined.length, 1);
    assert.ok(Math.abs(signedArea(joined[0]) - 200) < 1e-6);
    // two strokes whose tops lie a hair apart on one line still count once
    const d = shape([sq(0, 0, 10), [{ x: 5, y: 1e-13 }, { x: 20, y: 1e-13 }, { x: 20, y: 10 + 1e-13 }, { x: 5, y: 10 + 1e-13 }]]);
    const level = combine([d], d.has);
    assert.equal(level.length, 1);
    assert.ok(Math.abs(signedArea(level[0]) - 200) < 1e-6);
    // a spike out and back along an edge leaves one closed outline
    const e = shape([sq(0, 0, 10), [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4.0001, y: 0 }, { x: 4, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }]]);
    const spiked = combine([e], e.has);
    assert.equal(spiked.length, 1);
    assert.ok(Math.abs(signedArea(spiked[0]) - 100) < 1e-6);
  });
});
