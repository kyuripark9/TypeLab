/* The pen (client/lib/pen.ts, and tracing in shared/engine/outline.ts): letters traced into points, drawn
   letters in params.outlines, editing points, Sync all, Mirror and Snapping. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CHARS, buildFont, drawnCmds, fitOutline, type Cmd, type Node } from '../shared/engine';
import { STYLES } from '../shared/content';
import { DEFAULTS, isValidParams, sanitizeParams, type Params } from '../shared/params';
import { contourArea, deleteAnchors, mirrorEdit, mirrorLine, mirrorPairs, moveAnchors, movePeers, nearestSegment, peersOf, reshapeSegment, reverseContour, samePoints, setHandle, snapIn, snapScene, splitSegment, tangentsFrom, toggleSmooth, traceOf, SNAP_KINDS } from '../client/lib/pen';

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

  it('builds the other letters once while a drag moves only drawings', () => {
    const n = outline('n'), m = font.glyph('m')!;
    const drawn = buildFont({ ...font.params, outlines: { n } }, font);
    // the letters the settings draw are the same ones, traced once, and a drawn letter is its drawing
    assert.equal(drawn.glyph('m'), m);
    assert.equal(drawn.glyph('n')!.drawn, n);
    // back to settings, n is the settings' n again; a setting changed builds every letter afresh
    assert.notEqual(buildFont({ ...drawn.params, outlines: {} }, drawn).glyph('n')!.drawn, n);
    assert.notEqual(buildFont({ ...drawn.params, weight: drawn.params.weight + 0.1 }, drawn).glyph('m'), m);
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

describe('Snapping with the pen', () => {
  const h = { xh: 500, cap: 700, asc: 750, desc: -200 };
  // a square stem and a bar crossing it, and a round bowl to the right
  const stem: Node[] = [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 700 }, { x: 100, y: 700 }];
  const bar: Node[] = [{ x: 50, y: 300 }, { x: 250, y: 300 }, { x: 250, y: 400 }, { x: 50, y: 400 }];
  const bowl: Node[] = [
    { x: 400, y: 250, ix: 400, iy: 112, ox: 400, oy: 388, s: 1 }, { x: 525, y: 500, ix: 456, iy: 500, ox: 594, oy: 500, s: 1 },
    { x: 650, y: 250, ix: 650, iy: 388, ox: 650, oy: 112, s: 1 }, { x: 525, y: 0, ix: 594, iy: 0, ox: 456, oy: 0, s: 1 }
  ];
  const cs = [stem, bar, bowl];
  const scene = (kinds = SNAP_KINDS, from: { x: number; y: number }[] = []) => snapScene(cs, 800, h, kinds, new Set(), new Set(), from);
  const has = (s: ReturnType<typeof scene>, label: string, x: number, y: number) => s.spots.some(p => p.label === label && Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1);

  it('finds the middle of the width and of each shape, and halfway along each line and curve', () => {
    const s = scene(['centers', 'midpoints']);
    // (the stem and the bar both centre at 150, 350)
    assert.ok(has(s, 'center', 150, 350) && has(s, 'center', 525, 250));
    assert.ok(s.xs.some(l => l.v === 400 && l.label === 'center') && s.ys.some(l => l.v === 250) && s.ys.some(l => l.v === 350));
    assert.ok(has(s, 'midpoint', 150, 0) && has(s, 'midpoint', 200, 350));
    // halfway along a curve is on the curve, not between its ends
    assert.ok(s.spots.some(p => p.label === 'midpoint' && Math.hypot(p.x - 525, p.y - 250) > 170));
  });

  it('finds where outlines cross each other and the guide lines, but not where they meet end to end', () => {
    const s = scene(['crossings']);
    for (const [x, y] of [[100, 300], [200, 300], [100, 400], [200, 400]]) assert.ok(has(s, 'intersect', x, y), `${x},${y}`);
    assert.ok(!has(s, 'intersect', 100, 0) && !has(s, 'intersect', 525, 500));
    // the bowl crosses the middle of the width (x 400) only at its leftmost point, which is an anchor
    assert.ok(s.spots.filter(p => p.label === 'intersect' && p.y === 700).length === 0);
  });

  it('finds where a line from a point just touches a curve', () => {
    // the bowl's top right quarter is touched once from above, nowhere from inside the bowl
    assert.equal(tangentsFrom([bowl[1], { x: 594, y: 500 }, { x: 650, y: 388 }, bowl[2]], { x: 525, y: 900 }).length, 1);
    assert.equal(tangentsFrom([bowl[1], { x: 594, y: 500 }, { x: 650, y: 388 }, bowl[2]], { x: 525, y: 250 }).length, 0);
    const s = scene(['tangents'], [{ x: 525, y: 900 }]);
    // from straight above the bowl, the lines touch its two sides
    const t = s.spots.filter(p => p.label === 'tangent');
    assert.equal(t.length, 2);
    assert.ok(t.every(p => p.y > 300 && p.y < 500) && t.some(p => p.x < 525) && t.some(p => p.x > 525));
  });

  it('catches on a place first, then on the outline, then lines up across and up', () => {
    const tol = 8;
    assert.deepEqual(snapIn(scene(), { x: 103, y: 297 }, tol).at, { x: 100, y: 300, label: 'intersect' });
    const on = snapIn(scene(['outline']), { x: 405, y: 150 }, tol);
    assert.equal(on.at?.label, 'on outline');
    assert.ok(on.x > 400 && on.x < 415 && Math.abs(on.y - 150) < 8);
    const line = snapIn(scene(['guides', 'centers']), { x: 397, y: 505 }, tol);
    assert.deepEqual([line.x, line.y, line.gx?.label, line.gy?.label, line.at], [400, 500, 'center', 'x-height', undefined]);
    const none = snapIn(scene([]), { x: 397.4, y: 505.6 }, tol);
    assert.deepEqual([none.x, none.y, none.at, none.gx, none.gy], [397, 506, undefined, undefined, undefined]);
  });

  it('leaves out the points being dragged and the curves that move with them', () => {
    const s = snapScene(cs, 800, h, ['points', 'midpoints', 'outline'], new Set(['0:2']), new Set(['0:2']));
    assert.ok(!has(s, 'anchor', 200, 700) && has(s, 'anchor', 100, 700));
    assert.ok(!has(s, 'midpoint', 200, 350) && !has(s, 'midpoint', 150, 700) && has(s, 'midpoint', 100, 350));
    assert.equal(snapIn(s, { x: 230, y: 402 }, 6).at?.label, 'on outline'); // the bar's top, still there
    assert.equal(snapIn(s, { x: 203, y: 550 }, 6).at, undefined);
  });
});
