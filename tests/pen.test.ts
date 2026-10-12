/* The pen (client/lib/pen.ts, and tracing in shared/engine/outline.ts): letters traced into points, drawn
   letters in params.outlines, editing points, Sync all, Mirror and Snapping; live corners (a radius kept on a
   corner point, drawn round, cut or scooped), corners told outside or inside, overlapping shapes merged, cut out
   and broken apart, and strokes drawn with the Shape tool; picked shapes scaled, turned and flipped, and made thicker
   or thinner with their points kept. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CHARS, buildFont, drawnCmds, fitOutline, type Cmd, type Node } from '../shared/engine';
import { STYLES, styleById } from '../shared/content';
import { DEFAULTS, isValidParams, sanitizeParams, type Params } from '../shared/params';
import {
  breakShapes, contourArea, cornersAt, cutShapes, deleteAnchors, inkOf, mergeShapes, mirrorEdit, mirrorLine, mirrorPairs, moveAnchors, movePeers, nearestSegment,
  overlapping, peersOf, pickedBox, reshapeSegment, reverseContour, samePoints, scaleAbout, setCorners, setHandle, setWeight, shapesOf, snapIn, snapScene, splitSegment,
  strokeContour, strokeWidth, tangentsFrom, thicken, thicknessOf, toggleSmooth, traceOf, transformAnchors, turnAbout, wholeShapes, SNAP_KINDS
} from '../client/lib/pen';

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

describe('Live corners with the pen', () => {
  // a 400 × 300 box, anticlockwise
  const box = (r?: number, corner?: Node['corner']): Node[] => [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }].map(n => (r ? { ...n, r, ...(corner ? { corner } : {}) } : n));
  const far = (p: P, c: P) => Math.hypot(p.x - c.x, p.y - c.y);

  it('draws a corner with a radius as a round, the point staying where the corner is', () => {
    const cmds = drawnCmds([box(50)]), pts = polys(cmds)[0];
    // every point of the outline lies inside the box and outside the corners' rounds' reach, and the rounds are circles
    for (const p of pts) assert.ok(p.x >= -1e-6 && p.x <= 400 + 1e-6 && p.y >= -1e-6 && p.y <= 300 + 1e-6);
    for (const p of pts.filter(q => q.x < 50 && q.y < 50)) assert.ok(Math.abs(far(p, { x: 50, y: 50 }) - 50) < 0.2, `${p.x},${p.y} on the round`);
    assert.ok(!pts.some(p => far(p, { x: 0, y: 0 }) < 20), 'the corner itself is cut away');
    // a radius with no room for it rounds as far as half of the shorter side
    const most = drawnCmds([box(1000)]).map(c => c.map(v => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
    assert.deepEqual(most.slice(0, 2), [['M', 150, 0], ['L', 250, 0]]);
    // a cut is a straight line across; a scoop is a round about the corner point
    const cut = drawnCmds([box(50, 'cut')]).map(c => c.map(v => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
    assert.ok(cut.some(c => c[0] === 'L' && c[1] === 0 && c[2] === 50) && !cut.some(c => c[0] === 'C'));
    for (const p of polys(drawnCmds([box(50, 'scoop')]))[0].filter(q => q.x < 50 && q.y < 50)) assert.ok(Math.abs(far(p, { x: 0, y: 0 }) - 50) < 0.3);
    // and no radius draws the box exactly as before
    assert.deepEqual(drawnCmds([box()]), [['M', 0, 0], ['L', 400, 0], ['L', 400, 300], ['L', 0, 300], ['Z']]);
    assert.deepEqual(drawnCmds([box(50)], true), drawnCmds([box()]));
  });

  it('keeps a corner\'s radius and kind in a saved drawing, and drops a kind without a radius', () => {
    const q: Params = { ...DEFAULTS, outlines: { B: { adv: 500, contours: [[{ x: 0, y: 0, r: 40, corner: 'scoop' }, { x: 400, y: 0, r: 12 }, { x: 400, y: 300 }]] } } };
    assert.ok(isValidParams(q));
    const loose = sanitizeParams({ ...q, outlines: { B: { adv: 500, contours: [[{ x: 0, y: 0, corner: 'cut' }, { x: 4, y: 0, r: -3 }, { x: 4, y: 4, r: 9, corner: 'wavy' }]] } } });
    assert.deepEqual(loose.outlines.B.contours[0], [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4, r: 9 }]);
    assert.notEqual(buildFont(q).glyph('B')!.d, buildFont({ ...q, outlines: { B: { adv: 500, contours: [[{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }]] } } }).glyph('B')!.d);
  });

  it('tells corners pointing out of the ink from the ones pointing in, and rounds each kind on its own', () => {
    // an L: five corners out, one in (where the foot meets the stem)
    const L: Node[][] = [[{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 500 }, { x: 0, y: 500 }]];
    const at = cornersAt(L);
    assert.equal(at.length, 6);
    assert.deepEqual(at.filter(k => k.inside).map(k => k.ref.i), [3]);
    // the same, wound the other way round, and with a radius on it already
    assert.deepEqual(cornersAt(reverseContour(L, 0)).filter(k => k.inside).map(k => L[0].length - 1 - k.ref.i), [3]);
    assert.deepEqual(cornersAt(setCorners(L, [{ c: 0, i: 3 }, { c: 0, i: 1 }], 40)).filter(k => k.inside).map(k => k.ref.i), [3]);
    const out = setCorners(L, at.filter(k => !k.inside).map(k => k.ref), 30, 'cut');
    assert.equal(out[0][3].r, undefined);
    assert.equal(out[0][0].r, 30);
    assert.equal(out[0][0].corner, 'cut');
    assert.equal(setCorners(out, [{ c: 0, i: 0 }], 0)[0][0].corner, undefined);
    assert.ok(inkOf(out)(50, 250) && !inkOf(out)(200, 300));
  });

  it('keeps radii through a reverse and a mirror', () => {
    const c = setCorners([[{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }]], [{ c: 0, i: 0 }], 20, 'scoop');
    const rev = reverseContour(c, 0)[0];
    assert.ok(rev.some(n => n.r === 20 && n.corner === 'scoop'));
    const both = mirrorEdit(c, setCorners(c, [{ c: 0, i: 1 }], 35), ['x']);
    assert.equal(both[0][0].r, 35, 'the partner across the middle takes the radius');
  });
});

describe('Overlapping shapes with the pen', () => {
  const rect = (x0: number, y0: number, x1: number, y1: number): Node[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const stem = rect(0, 0, 100, 700), bar = rect(-100, 300, 300, 400);

  it('groups contours into shapes with their holes, and finds where shapes overlap', () => {
    const o = [rect(0, 0, 400, 400), reverseContour([rect(100, 100, 300, 300)], 0)[0], rect(600, 0, 700, 100)];
    assert.deepEqual(shapesOf(o), [[0, 1], [2]]);
    assert.ok(!overlapping(o));
    assert.ok(overlapping([stem, bar]));
    assert.ok(!overlapping([stem, rect(200, 0, 300, 100)]));
  });

  it('merges overlapping shapes into one outline, keeping the corners\' radii', () => {
    const m = mergeShapes([setCorners([stem], [{ c: 0, i: 0 }], 30)[0], bar])!;
    assert.equal(m.cs.length, 1);
    assert.equal(m.cs[0].length, 12);
    assert.ok(m.cs[0].some(n => n.x === 0 && n.y === 0 && n.r === 30));
    assert.equal(mergeShapes([stem, rect(200, 0, 300, 100)]), null);
    // the corners where they meet are inside corners now
    assert.equal(cornersAt(m.cs).filter(k => k.inside).length, 4);
  });

  it('cuts a picked shape out of the shapes it overlaps, curves kept', () => {
    const k = 0.5523;
    const disc: Node[] = [{ x: 100, y: 350, ix: 100, iy: 350 - 50 * k, ox: 100, oy: 350 + 50 * k, s: 1 }, { x: 50, y: 400, ix: 50 + 50 * k, iy: 400, ox: 50 - 50 * k, oy: 400, s: 1 }, { x: 0, y: 350, ix: 0, iy: 400 - 50 * k, ox: 0, oy: 300 + 50 * k, s: 1 }, { x: 50, y: 300, ix: 50 - 50 * k, iy: 300, ox: 50 + 50 * k, oy: 300, s: 1 }];
    const out = cutShapes([stem, disc], [1])!;
    const ink = inkOf(out);
    assert.ok(!ink(50, 350) && ink(50, 200) && ink(50, 500), 'a round hole through the stem');
    assert.equal(out.length, 2);
    assert.ok(out[1].some(n => hasCurve(n)), 'the hole keeps the disc\'s curves');
    assert.equal(cutShapes([stem, rect(200, 0, 300, 100)], [1]), null);
  });

  it('breaks shapes apart, the one in front cutting a gap in the one under it', () => {
    const b = breakShapes([stem, bar], [1], 20)!;
    const ink = inkOf(b.cs);
    assert.deepEqual(b.front, [2], 'the bar, last');
    assert.ok(ink(50, 350), 'the bar runs across');
    assert.ok(!ink(50, 290) && !ink(50, 410), 'a gap above and below it');
    assert.ok(ink(50, 270) && ink(50, 430) && ink(50, 100) && ink(50, 650), 'the stem either side of the gap');
    // with nothing picked, the shape drawn last is in front
    const all = breakShapes([stem, bar], [], 20)!;
    assert.ok(inkOf(all.cs)(50, 350) && !inkOf(all.cs)(50, 290));
    // drawn the other way round, the stem is in front and the bar is broken
    const rev = inkOf(breakShapes([bar, stem], [], 20)!.cs);
    assert.ok(rev(50, 350) && !rev(110, 350) && !rev(-10, 350) && rev(-50, 350) && rev(200, 350));
    assert.equal(breakShapes([stem, rect(200, 0, 300, 100)], [], 20), null);
  });

  it('drops the little fillets joining strokes when it breaks them, and breaks engine letters cleanly', () => {
    const fillet: Node[] = [{ x: 100, y: 400 }, { x: 120, y: 400 }, { x: 100, y: 420 }];
    const b = breakShapes([stem, bar, fillet], [], 20)!;
    assert.equal(b.cs.length, 3, 'the stem in two and the bar, the fillet gone');
    const t = traceOf(buildFont(STYLES[0].params).glyph('t')!);
    const broken = breakShapes(t.contours, [], 16);
    assert.ok(broken && broken.cs.length > t.contours.length - 1);
  });
});

describe('Strokes with the pen', () => {
  it('draws a stroke as thick as asked along the line dragged, round ends half circles', () => {
    const s = strokeContour({ x: 0, y: 0 }, { x: 400, y: 0 }, 100, false);
    assert.deepEqual(s, [{ x: 0, y: -50 }, { x: 400, y: -50 }, { x: 400, y: 50 }, { x: 0, y: 50 }]);
    assert.ok(contourArea(s) > 0);
    assert.ok(contourArea(strokeContour({ x: 0, y: 0 }, { x: 400, y: 0 }, 100, false, false)) < 0);
    const pill = polys(drawnCmds([strokeContour({ x: 0, y: 0 }, { x: 400, y: 0 }, 100, true)]))[0];
    for (const p of pill.filter(q => q.x > 350)) assert.ok(Math.abs(Math.hypot(p.x - 350, p.y) - 50) < 0.3);
    assert.ok(Math.abs(Math.max(...pill.map(p => p.x)) - 400) < 0.5);
  });

  it('reads how thick a letter\'s strokes are', () => {
    const n = traceOf(buildFont(STYLES[0].params).glyph('n')!);
    const f = buildFont(STYLES[0].params);
    assert.ok(Math.abs(strokeWidth(n.contours, 0) - f.m.s) < f.m.s * 0.2, `${strokeWidth(n.contours, 0)} against ${f.m.s}`);
    assert.equal(strokeWidth([], 77), 77);
  });
});

describe('Picked shapes as one with the pen', () => {
  const rect = (x0: number, y0: number, x1: number, y1: number): Node[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const every = (cs: Node[][]) => cs.flatMap((con, c) => con.map((_, i) => ({ c, i })));
  const k = 0.5523, circle = (r: number): Node[] => [
    { x: r, y: 0, ix: r, iy: -r * k, ox: r, oy: r * k, s: 1 }, { x: 0, y: r, ix: r * k, iy: r, ox: -r * k, oy: r, s: 1 },
    { x: -r, y: 0, ix: -r, iy: r * k, ox: -r, oy: -r * k, s: 1 }, { x: 0, y: -r, ix: -r * k, iy: -r, ox: r * k, oy: -r, s: 1 }
  ];

  it('turns, scales and flips picked points about a place, a flipped contour still running the same way', () => {
    const r = [rect(0, 0, 300, 100)];
    assert.deepEqual(transformAnchors(r, every(r), turnAbout({ x: 150, y: 50 }, 90))[0], [{ x: 200, y: -100 }, { x: 200, y: 200 }, { x: 100, y: 200 }, { x: 100, y: -100 }]);
    assert.deepEqual(transformAnchors(r, every(r), scaleAbout({ x: 0, y: 0 }, 2, 1))[0], rect(0, 0, 600, 100));
    const flipped = transformAnchors(r, every(r), scaleAbout({ x: 150, y: 50 }, -1, 1));
    assert.ok(contourArea(flipped[0]) > 0, 'still filled, not a hole');
    assert.deepEqual(pickedBox(flipped, every(flipped)), { x0: 0, y0: 0, x1: 300, y1: 100 });
    // only the picked points move; a contour picked in part isn't run back
    const half = transformAnchors(r, [{ c: 0, i: 1 }, { c: 0, i: 2 }], scaleAbout({ x: 0, y: 0 }, -1, 1));
    assert.deepEqual(half[0], [{ x: 0, y: 0 }, { x: -300, y: 0 }, { x: -300, y: 100 }, { x: 0, y: 100 }]);
    // the box takes in a curve's bulge between two picked points
    assert.deepEqual(pickedBox([circle(100)], every([circle(100)])), { x0: -100, y0: -100, x1: 100, y1: 100 });
  });

  it('reads how thick a shape is: a bar\'s width, a ring\'s stroke, a letter\'s stems', () => {
    assert.equal(thicknessOf([rect(0, 0, 300, 100)]), 100);
    assert.equal(thicknessOf([rect(0, 0, 100, 120)]), 100);
    assert.equal(thicknessOf([rect(0, 0, 400, 400), reverseContour([rect(100, 100, 300, 300)], 0)[0]]), 100);
    assert.ok(Math.abs(thicknessOf([strokeContour({ x: 0, y: 0 }, { x: 300, y: 300 }, 80, false)]) - 80) <= 1);
    const f = buildFont(STYLES[0].params), o = traceOf(f.glyph('o')!);
    assert.ok(Math.abs(thicknessOf(o.contours) - f.m.s) < f.m.s * 0.2, `${thicknessOf(o.contours)} against ${f.m.s}`);
    assert.equal(thicknessOf([]), 0);
  });

  it('makes shapes thicker or thinner, their points kept: a box grows all round, a bar only across, a ring into its counter', () => {
    assert.deepEqual(thicken([rect(0, 0, 100, 100)], [0], 10)[0], rect(-10, -10, 110, 110));
    assert.deepEqual(thicken([rect(0, 0, 300, 100)], [0], 10)[0], rect(0, -10, 300, 110));
    const ring = thicken([rect(0, 0, 400, 400), reverseContour([rect(100, 100, 300, 300)], 0)[0]], [1], 10);
    assert.deepEqual(ring[0], rect(-10, -10, 410, 410), 'a hole picked thickens its whole shape');
    assert.deepEqual(pickedBox([ring[1]], every([ring[1]])), { x0: 110, y0: 110, x1: 290, y1: 290 });
    // a circle stays a circle, its handles as long as a circle's
    const c = thicken([circle(100)], [0], 20)[0];
    assert.deepEqual(c[0], { x: 120, y: 0, ix: 120, iy: -66, ox: 120, oy: 66, s: 1 });
    // a round-ended stroke keeps its ends round; corners of a box grow outside and shrink inside
    const pill = setWeight([strokeContour({ x: 0, y: 0 }, { x: 400, y: 0 }, 100, true)], [0], 60)[0];
    assert.deepEqual(pill.map(n => [n.x, n.y, n.r]), [[0, -30, 30], [400, -30, 30], [400, 30, 30], [0, 30, 30]]);
    const L: Node[] = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 100, y: 100, r: 30 }, { x: 100, y: 400 }, { x: 0, y: 400, r: 20 }];
    const Lt = thicken([L], [0], 10)[0];
    assert.equal(Lt[3].r, 20, 'the inside corner rounds less');
    assert.equal(Lt[5].r, 30, 'the outside corner rounds more');
    assert.deepEqual(Lt.map(n => [n.x, n.y]), [[-10, -10], [310, -10], [310, 110], [110, 110], [110, 410], [-10, 410]]);
    // thinner, and back
    assert.deepEqual(setWeight([rect(0, 0, 300, 100)], [0], 40)[0], rect(0, 30, 300, 70));
    assert.deepEqual(wholeShapes([rect(0, 0, 400, 400), reverseContour([rect(100, 100, 300, 300)], 0)[0], rect(500, 0, 600, 100)], [1]), [0, 1]);
  });

  it('thickens a letter evenly, so its stems read as much thicker as asked', () => {
    const f = buildFont(STYLES[0].params), o = traceOf(f.glyph('o')!), w = thicknessOf(o.contours);
    const bold = setWeight(o.contours, [0], w + 40);
    assert.ok(Math.abs(thicknessOf(bold) - (w + 40)) <= 1, `${thicknessOf(bold)} against ${w + 40}`);
    const s = traceOf(buildFont(styleById('serif')!.params).glyph('S')!), ws = thicknessOf(s.contours);
    for (const to of [ws + 30, ws - 12]) assert.ok(Math.abs(thicknessOf(setWeight(s.contours, [0], to)) - to) <= 1, `S at ${to}`);
    assert.equal(bold.length, o.contours.length);
    assert.deepEqual(bold.map(c => c.length), o.contours.map(c => c.length), 'the same points');
  });
});

const hasCurve = (n: Node) => n.ix !== undefined || n.ox !== undefined;
