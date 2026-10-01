import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CHARS, buildFont, drawnCmds, fitOutline, type Cmd, type Node } from '../shared/engine';
import { STYLES } from '../shared/content';
import { DEFAULTS, isValidParams, sanitizeParams, type Params } from '../shared/params';
import { contourArea, deleteAnchors, mirrorEdit, mirrorLine, mirrorPairs, moveAnchors, movePeers, nearestSegment, peersOf, reshapeSegment, reverseContour, samePoints, setHandle, splitSegment, toggleSmooth, traceOf } from '../client/lib/pen';

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

describe('Sync all with the pen', () => {
  const font = buildFont(STYLES[0].params);
  const outline = (ch: string) => traceOf(font.glyph(ch)!);

  it('finds the same point in letters of other widths: as high, and as far from the nearer side or the middle', () => {
    const a = { adv: 500, contours: [[{ x: 60, y: 0 }, { x: 440, y: 0 }, { x: 250, y: 500 }]] };
    const b = { adv: 700, contours: [[{ x: 640, y: 0 }, { x: 61, y: 1 }, { x: 350, y: 500 }, { x: 350, y: 400 }]] };
    assert.deepEqual(samePoints(a, [{ c: 0, i: 0 }, { c: 0, i: 1 }, { c: 0, i: 2 }], b), [{ c: 0, i: 1 }, { c: 0, i: 0 }, { c: 0, i: 2 }]);
    // nothing in the same place, and a point taken once isn't taken again
    assert.deepEqual(samePoints(a, [{ c: 0, i: 0 }, { c: 0, i: 0 }], { adv: 500, contours: [[{ x: 60, y: 0 }, { x: 60, y: 300 }]] }), [{ c: 0, i: 0 }, null]);
  });

  it('reaches only the letters of its own kind that share the point', () => {
    const n = outline('n');
    // the foot of n's stem, at the baseline on the left
    const foot = n.contours.flatMap((con, c) => con.map((p, i) => ({ c, i, p }))).find(o => o.p.y === 0 && o.p.x < n.adv / 3)!;
    const peers = peersOf('n', n, [foot], outline);
    const chs = peers.map(p => p.ch);
    assert.ok(chs.includes('m') && chs.includes('r'), chs.join(''));
    assert.ok(chs.every(ch => /[a-z]/.test(ch)) && !chs.includes('n') && !chs.includes('o'));
    const moved = movePeers(peers, 10, 0);
    for (const p of peers) {
      const r = p.refs[0]!, was = p.doc.contours[r.c][r.i], now = moved[p.ch].contours[r.c][r.i];
      assert.deepEqual([now.x - was.x, now.y - was.y], [10, 0]);
      assert.equal(moved[p.ch].contours.flat().filter((q, k) => q.x !== p.doc.contours.flat()[k].x).length, 1);
    }
  });
});

describe('Mirror with the pen', () => {
  // a diamond, anticlockwise from the bottom: its sides are partners left and right, top and bottom on the line
  const dia: Node[][] = [[
    { x: 250, y: 0 }, { x: 450, y: 300, ix: 450, iy: 200, ox: 450, oy: 400, s: 1 }, { x: 250, y: 600, ix: 350, iy: 600, ox: 150, oy: 600, s: 1 },
    { x: 50, y: 300, ix: 50, iy: 400, ox: 50, oy: 200, s: 1 }
  ]];
  const font = buildFont(STYLES[0].params);

  it('pairs each point with the one across the middle, and points on the middle with themselves', () => {
    assert.equal(mirrorLine(dia, 'x'), 250);
    const pairs = mirrorPairs(dia, 'x', 250);
    assert.deepEqual(pairs.get('0:1'), { c: 0, i: 3 });
    assert.deepEqual(pairs.get('0:3'), { c: 0, i: 1 });
    assert.deepEqual(pairs.get('0:0'), { c: 0, i: 0 });
    // in a traced O every point has a partner
    const o = traceOf(font.glyph('O')!).contours;
    assert.equal(mirrorPairs(o, 'x', mirrorLine(o, 'x')).size, o.flat().length);
  });

  it('moves a point\'s partner the other way, handles and all', () => {
    const out = mirrorEdit(dia, moveAnchors(dia, [{ c: 0, i: 1 }], 30, 10), ['x']);
    assert.deepEqual(out[0][3], { x: 20, y: 310, ix: 20, iy: 410, ox: 20, oy: 210, s: 1 });
    const h = mirrorEdit(dia, setHandle(dia, { c: 0, i: 1 }, 'o', { x: 480, y: 400 }), ['x'], { r: { c: 0, i: 1 }, side: 'o' })[0][3];
    assert.deepEqual([h.ix, h.iy, h.s], [20, 400, 1]);
    assert.ok(h.ox! > 50 && h.oy! < 300);
  });

  it('keeps a point on the middle there, its handles mirroring each other', () => {
    const top = mirrorEdit(dia, moveAnchors(dia, [{ c: 0, i: 2 }], 40, 20), ['x'])[0][2];
    assert.deepEqual([top.x, top.y, top.ix, top.ox], [250, 620, 350, 150]);
    const peak = mirrorEdit(dia, setHandle(dia, { c: 0, i: 2 }, 'i', { x: 350, y: 560 }), ['x'], { r: { c: 0, i: 2 }, side: 'i' })[0][2];
    assert.deepEqual([peak.ox, peak.oy, peak.s], [150, 560, undefined]);
  });

  it('reaches all four corners with both flips, and leaves symmetric moves and new points alone', () => {
    const sq: Node[][] = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]];
    const out = mirrorEdit(sq, moveAnchors(sq, [{ c: 0, i: 2 }], 10, 10), ['x', 'y'])[0];
    assert.deepEqual(out.map(n => [n.x, n.y]), [[-10, -10], [110, -10], [110, 110], [-10, 110]]);
    const all = moveAnchors(dia, [0, 1, 2, 3].map(i => ({ c: 0, i })), 40, 0);
    assert.deepEqual(mirrorEdit(dia, all, ['x']), all);
    const added = splitSegment(dia, 0, 0, 0.5);
    assert.equal(mirrorEdit(dia, added, ['x']), added);
  });
});
