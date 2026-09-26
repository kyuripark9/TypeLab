import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dragSpec, handlesFor, pickAxis, solver, towardMore } from '../client/lib/drag';
import { buildFont, type Glyph } from '../shared/engine';
import { DEFAULTS, type Params } from '../shared/params';

const base: Params = { ...DEFAULTS };
const font = buildFont(base);
const center = (g: Glyph, part: string) => {
  const ys = g.strokes.filter(s => s.part === part).flatMap(s => s.cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 1) as number[]));
  return (Math.min(...ys) + Math.max(...ys)) / 2;
};

describe('dragging the inspected letter', () => {
  it('moves the x-height guide to the pointer', () => {
    const d = dragSpec('xHeight', font, 'n', { x: 0, y: font.m.xh })!.y!;
    const v = solver(d, base)(60);
    assert.ok(Math.abs(buildFont({ ...base, xHeight: v }).m.xh - (font.m.xh + 60)) < 6);
  });

  it('thickens a stem when its right side is dragged right, and its left side left', () => {
    const H = font.glyph('H')!, s = font.m.s;
    const right = dragSpec('stem', font, 'H', { x: H.adv - H.rsb - s * 0.2, y: 300 })!;
    const left = dragSpec('stem', font, 'H', { x: H.lsb + s * 0.2, y: 300 })!;
    assert.equal(pickAxis(right, 10, 1), 'x');
    const vr = solver(right.x!, base)(20), vl = solver(left.x!, base)(-20);
    assert.ok(vr > base.weight && vl > base.weight);
    assert.ok(Math.abs(buildFont({ ...base, weight: vr }).m.s - (s + 40)) < 6);
  });

  it('moves a crossbar with the pointer', () => {
    const H = font.glyph('H')!, y0 = center(H, 'crossbar');
    const d = dragSpec('crossbar', font, 'H', { x: H.adv / 2, y: y0 })!.y!;
    const v = solver(d, base)(-40);
    assert.ok(Math.abs(center(buildFont({ ...base, crossbar: v }).glyph('H')!, 'crossbar') - (y0 - 40)) < 8);
  });

  it('holds at the end of the range and starts where it was', () => {
    const d = dragSpec('advance', font, 'o', { x: font.glyph('o')!.adv, y: 200 })!.x!;
    const solve = solver(d, base);
    assert.equal(solve(0), base.width);
    assert.equal(solve(1e5), 1);
    assert.equal(solve(-1e5), 0);
  });

  it('leaves terminals and the baseline to their controls', () => {
    assert.equal(dragSpec('terminal', font, 'c', { x: 0, y: 0 }), null);
    assert.equal(dragSpec('baseline', font, 'c', { x: 0, y: 0 }), null);
  });

  it('knows which way makes more', () => {
    const H = font.glyph('H')!;
    const left = dragSpec('stem', font, 'H', { x: H.lsb + 2, y: 300 })!.x!;
    assert.equal(towardMore(left, base), -1);
    assert.equal(towardMore(dragSpec('descender', font, 'p', { x: 0, y: font.m.desc })!.y!, base), -1);
    assert.equal(towardMore(dragSpec('ascender', font, 'd', { x: 0, y: font.m.asc })!.y!, base), 1);
  });

  it('finds the handles for a control on the letter', () => {
    const weight = handlesFor('weight', font, 'H', ['stem', 'crossbar']);
    assert.deepEqual(weight.map(h => [h.part, h.axis]), [['stem', 'x'], ['stem', 'x']]);
    assert.deepEqual(handlesFor('crossbar', font, 'H', ['stem', 'crossbar']).map(h => h.axis), ['y']);
    assert.equal(handlesFor('xHeight', font, 'n', ['xHeight', 'capHeight'])[0].y, font.m.xh);
  });
});
