import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CHARS, buildFont, drawnCmds, fitOutline, type Cmd, type Node } from '../shared/engine';
import { STYLES } from '../shared/content';
import { DEFAULTS, isValidParams, sanitizeParams, type Params } from '../shared/params';
import { contourArea, deleteAnchors, moveAnchors, nearestSegment, reshapeSegment, reverseContour, setHandle, splitSegment, toggleSmooth } from '../client/lib/pen';

type P = { x: number; y: number };

/** Outline commands as dense point lists, curves sampled. */
function polys(cmds: Cmd[]): P[][] {
  const out: P[][] = [];
  let cur: P[] = [];
  for (const c of cmds) {
    if (c[0] === 'M') { if (cur.length) out.push(cur); cur = [{ x: c[1], y: c[2] }]; }
    else if (c[0] === 'L') cur.push({ x: c[1], y: c[2] });
    else if (c[0] === 'C') {
      const a = cur[cur.length - 1];
      for (let k = 1; k <= 24; k++) {
        const t = k / 24, u = 1 - t;
        cur.push({ x: u * u * u * a.x + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5], y: u * u * u * a.y + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6] });
      }
    }
  }
  if (cur.length) out.push(cur);
  return out;
}
function toSeg(p: P, a: P, b: P) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const toPoly = (p: P, poly: P[]) => Math.min(...poly.map((a, i) => toSeg(p, a, poly[(i + 1) % poly.length])));

describe('pen: tracing letters into points', () => {
  it('traces every letter of several styles closely, with far fewer points', () => {
    let fitted = 0, dense = 0;
    for (const st of STYLES.slice(0, 8)) {
      const f = buildFont(st.params);
      for (const ch of ALL_CHARS) {
        const g = f.glyph(ch);
        if (!g) continue;
        const src = polys(g.cmds), fit = fitOutline(g.cmds), got = polys(drawnCmds(fit));
        assert.equal(got.length, src.length, `${st.id} ${ch}: contour count`);
        let worst = 0;
        got.forEach((poly, i) => {
          for (const p of poly) worst = Math.max(worst, toPoly(p, src[i]));
          for (const p of src[i]) worst = Math.max(worst, toPoly(p, poly));
        });
        assert.ok(worst < 4, `${st.id} ${ch}: traced ${worst.toFixed(1)} units off`);
        const n = fit.reduce((a, c) => a + c.length, 0), m = src.reduce((a, c) => a + c.length, 0);
        assert.ok(n <= m, `${st.id} ${ch}: ${n} points for ${m}`);
        fitted += n; dense += m;
        for (const c of fit) for (const p of c) assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y));
      }
    }
    assert.ok(fitted < dense * 0.3, `${fitted} points for ${dense}`);
  });

  it('puts points on the extremes of a round letter, with level and upright handles', () => {
    const g = buildFont({ ...DEFAULTS }).glyph('o')!;
    const outer = fitOutline(g.cmds).sort((a, b) => Math.abs(contourArea(b)) - Math.abs(contourArea(a)))[0];
    const top = outer.reduce((a, b) => (b.y > a.y ? b : a));
    assert.ok(top.s, 'the top point is smooth');
    assert.equal(top.iy, top.y);
    assert.equal(top.oy, top.y);
  });
});

describe('pen: drawn letters', () => {
  const square: Node[] = [{ x: 50, y: 0 }, { x: 450, y: 0 }, { x: 450, y: 400 }, { x: 50, y: 400 }];
  const p: Params = { ...DEFAULTS, outlines: { B: { adv: 500, contours: [square] } } };

  it('draws a drawn letter as it is, whatever the settings', () => {
    for (const q of [p, { ...p, weight: 1, slant: 1, glyphs: { B: { weight: 0 } } }]) {
      const g = buildFont(q).glyph('B')!;
      assert.equal(g.adv, 500);
      assert.equal(g.d, 'M50 0L450 0L450 -400L50 -400Z');
    }
    assert.notEqual(buildFont(p).glyph('A')!.d, '');
  });

  it('keeps valid drawings, in any key order, and drops broken ones', () => {
    assert.ok(isValidParams(p));
    const reordered = JSON.parse(JSON.stringify(p));
    reordered.outlines.B = { contours: [[{ y: 0, x: 50, oy: 3, ox: 60 }, ...square.slice(1)]], adv: 500 };
    assert.ok(isValidParams(reordered));
    assert.ok(!isValidParams({ ...p, outlines: { B: { adv: 500, contours: [[{ x: 'a', y: 0 }]] } } }));
    assert.ok(!isValidParams({ ...p, outlines: { BB: { adv: 500, contours: [square] } } }));
    assert.deepEqual(sanitizeParams({ ...p, outlines: { B: { adv: NaN, contours: [] }, C: p.outlines.B } }).outlines, { C: p.outlines.B });
  });
});

describe('pen: editing points', () => {
  const tri: Node[][] = [[{ x: 0, y: 0 }, { x: 100, y: 0, ox: 150, oy: 50 }, { x: 50, y: 100, ix: 100, iy: 120, ox: 0, oy: 80, s: 1 }]];

  it('moves points with their handles and leaves the original alone', () => {
    const out = moveAnchors(tri, [{ c: 0, i: 1 }], 10, -5);
    assert.deepEqual(out[0][1], { x: 110, y: -5, ox: 160, oy: 45 });
    assert.deepEqual(tri[0][1], { x: 100, y: 0, ox: 150, oy: 50 });
  });

  it('keeps a smooth point\'s handles in line, unless moved freely', () => {
    const out = setHandle(tri, { c: 0, i: 2 }, 'i', { x: 50, y: 150 });
    const n = out[0][2];
    assert.equal(n.ox, 50);
    assert.ok(n.oy! < 100 && n.s);
    const free = setHandle(tri, { c: 0, i: 2 }, 'i', { x: 50, y: 150 }, true)[0][2];
    assert.equal(free.ox, 0);
    assert.equal(free.s, undefined);
  });

  it('adds a point on a curve without changing its shape', () => {
    const before = polys(drawnCmds(tri))[0];
    const out = splitSegment(tri, 0, 1, 0.5);
    assert.equal(out[0].length, 4);
    for (const q of polys(drawnCmds(out))[0]) assert.ok(toPoly(q, before) < 1.5);
    const hit = nearestSegment(tri, { x: 50, y: -3 });
    assert.equal(hit?.i, 0);
    assert.ok(Math.abs(hit!.t - 0.5) < 0.01);
  });

  it('deletes points, converts them, bends curves and reverses contours', () => {
    assert.equal(deleteAnchors(tri, [{ c: 0, i: 0 }])[0].length, 2);
    assert.equal(deleteAnchors(tri, [{ c: 0, i: 0 }, { c: 0, i: 1 }]).length, 0);
    const smooth = toggleSmooth(tri, { c: 0, i: 0 })[0][0];
    assert.ok(smooth.s && smooth.ix !== undefined && smooth.ox !== undefined);
    assert.deepEqual(toggleSmooth(tri, { c: 0, i: 2 })[0][2], { x: 50, y: 100 });
    const bent = reshapeSegment(tri, 0, 1, 0.5, 0, 30);
    assert.notDeepEqual(bent[0][1], tri[0][1]);
    assert.equal(bent[0][1].x, 100);
    assert.ok(Math.sign(contourArea(reverseContour(tri, 0)[0])) === -Math.sign(contourArea(tri[0])));
  });
});
