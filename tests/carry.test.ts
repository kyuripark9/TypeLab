/* Carrying a change made to one letter's points to the other letters shaped the same way there (client/lib/carry.ts):
   reading the change against the letter as it was (stretches, corners rounded where they stand, whole contours moved
   or taken away, shapes added), finding its old shape in other letters (close matches, where the outline round it is
   the same too or a whole contour sits as high, and looser ones; the letter's own other places, not where it was
   made; where a letter has the shape only mirrored, mirrored; and in a font drawn by hand, roughly), and putting the
   change in, point for point where the letter has the same points, else as a new stretch or contour fitted to it;
   never in a grid fill's cells, each shaped as every other. */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES } from '../shared/content';
import { buildFont, freeFont, registerFreeFont, type Drawn, type Font, type Node } from '../shared/engine';
import { STYLE_FONTS } from '../shared/free-fonts';
import { freeAtOf, type Params } from '../shared/params';
import { FreeFonts } from '../server/free-fonts';
import { carryChange, carryLetter, changesOf, inCells, sameDrawing } from '../client/lib/carry';
import { contourArea, moveAnchors, splitSegment, deleteAnchors, traceOf, type Ref } from '../client/lib/pen';

describe('carry: reading what changed', () => {
  // a square of eight points, three to a side
  const sq: Node[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }, { x: 0, y: 200 }, { x: 0, y: 100 }];

  it('finds nothing when nothing changed', () => {
    assert.deepEqual(changesOf([sq], [sq.map(n => ({ ...n }))]), []);
  });

  it('reads a moved point as the stretch between the points either side of it', () => {
    const [ch, ...more] = changesOf([sq], moveAnchors([sq], [{ c: 0, i: 3 }], 30, 0));
    assert.equal(more.length, 0);
    assert.deepEqual([ch.c, ch.a, ch.b], [0, 2, 4]);
    assert.deepEqual(ch.fresh, [{ x: 230, y: 100 }]);
  });

  it('reads points added and taken away', () => {
    const added = changesOf([sq], splitSegment([sq], 0, 3, 0.5));
    assert.deepEqual(added.map(c => [c.a, c.b, c.fresh.length]), [[3, 4, 1]]);
    const gone = changesOf([sq], deleteAnchors([sq], [{ c: 0, i: 5 }]));
    assert.deepEqual(gone.map(c => [c.a, c.b, c.fresh.length]), [[4, 6, 0]]);
  });

  it("reads a change round the contour's first point as one stretch", () => {
    assert.deepEqual(changesOf([sq], moveAnchors([sq], [{ c: 0, i: 0 }], -20, -20)).map(c => [c.a, c.b]), [[7, 1]]);
  });

  it('keeps changes far apart as two, and ones a point or two apart as one', () => {
    assert.deepEqual(changesOf([sq], moveAnchors([sq], [{ c: 0, i: 1 }, { c: 0, i: 5 }], 0, 10)).map(c => [c.a, c.b]), [[0, 2], [4, 6]]);
    assert.deepEqual(changesOf([sq], moveAnchors([sq], [{ c: 0, i: 1 }, { c: 0, i: 3 }], 0, 10)).map(c => [c.a, c.b, c.fresh.length]), [[0, 4, 3]]);
  });

  it('tells a drawing read back from an undo step (a copy) as the same one, and a moved point as different', () => {
    const d = { adv: 300, contours: [sq] };
    assert.ok(sameDrawing(d, JSON.parse(JSON.stringify(d))));
    assert.ok(!sameDrawing(d, { adv: 300, contours: moveAnchors([sq], [{ c: 0, i: 2 }], 1, 0) }));
    assert.ok(!sameDrawing(d, undefined));
  });

  it('reads a contour moved whole, or taken away, as a change to the whole of it, but not a letter moved whole', () => {
    const dot: Node[] = [{ x: 400, y: 400 }, { x: 450, y: 400 }, { x: 450, y: 450 }, { x: 400, y: 450 }];
    const moved = moveAnchors([sq, dot], dot.map((_, i) => ({ c: 1, i })), 5, 5);
    assert.deepEqual(changesOf([sq, dot], moved).map(c => [c.c, c.whole, c.fresh.length]), [[1, true, 4]]);
    assert.deepEqual(changesOf([sq, dot], moveAnchors(moved, sq.map((_, i) => ({ c: 0, i })), 5, 5)), []);
    // a dot taken away, the other contour's point moved: both read, each against its own contour
    const gone = changesOf([sq, dot], moveAnchors([sq], [{ c: 0, i: 3 }], 30, 0));
    assert.deepEqual(gone.map(c => [c.c, !!c.whole, c.fresh.length]), [[0, false, 1], [1, true, 0]]);
    // a shape added, beside the others as they are read: placed by the outline of the square nearest its middle, at the
    // corner at 200,200 (the start of the top side, running from it to 100,200)
    const got = changesOf([sq], [...moveAnchors([sq], [{ c: 0, i: 3 }], 30, 0), dot]);
    assert.deepEqual(got.map(c => [c.c, c.a, c.b, c.add?.length ?? 0]), [[0, 2, 4, 0], [0, 4, 5, 4]]);
    assert.ok(got[1].at! < 0.05, `at the corner (${got[1].at})`);
    // a ball set on the top side, overlapping it: by the point under its middle, at 100,200
    const ball = changesOf([sq], [sq, [{ x: 80, y: 190 }, { x: 120, y: 190 }, { x: 120, y: 230 }, { x: 80, y: 230 }]]);
    assert.deepEqual(ball.map(c => [c.a, c.b]), [[5, 6]]);
    assert.ok(ball[0].at! < 0.05, `at the point under its middle (${ball[0].at})`);
  });

  it("reads every corner of a contour rounded, its points staying put, as a change at each corner", () => {
    const round = [sq.map((n, i) => (i % 2 ? n : { ...n, r: 20 }))];
    assert.deepEqual(changesOf([sq], round).map(c => [c.a, c.b, c.fresh[0].r]), [[7, 1, 20], [1, 3, 20], [3, 5, 20], [5, 7, 20]]);
  });
});

describe('carry: to the other letters of an own font', () => {
  let font: Font;
  const outline = (ch: string): Drawn | null => { const g = font.glyph(ch); return g ? traceOf(g) : null; };
  before(async () => {
    const st = STYLES.find(s => s.id === 'serif')!, id = STYLE_FONTS.serif;
    if (!freeFont(id)) registerFreeFont(await new FreeFonts(null, async (url: string): Promise<never> => { throw new Error(`fetched ${url}`); }).load(id));
    font = buildFont({ ...st.params, freeFont: id, freeAt: freeAtOf(st.params) } as Params);
  });
  /** The two points at the end of a letter's top-left serif: the furthest left up by the ascender. */
  const tip = (d: Drawn): Ref[] => {
    const top = d.contours.flatMap((con, c) => con.map((n, i) => ({ c, i, n }))).filter(p => p.n.y > 600);
    const x = Math.min(...top.map(p => p.n.x));
    return top.filter(p => Math.abs(p.n.x - x) < 2).map(({ c, i }) => ({ c, i }));
  };
  const nodes = (d: Drawn) => d.contours.flat();

  it("carries a d's longer serif to the letters with that serif, the closest picked out from the looser", () => {
    const d = outline('d')!, refs = tip(d);
    assert.equal(refs.length, 2, 'the serif ends in two points');
    const out = carryChange('d', d.contours, moveAnchors(d.contours, refs, -200, 0), outline);
    const close = out.filter(c => c.close).map(c => c.ch).join(''), all = out.filter(c => !c.mirrored).map(c => c.ch).join('');
    for (const ch of 'bhkl') assert.ok(close.includes(ch), `${ch} is a close match (close: ${close}, all: ${all})`);
    for (const ch of 'aceosuACOS') assert.ok(!all.includes(ch), `${ch} has no such serif the same way round (${all})`);
    // the l's serif is as much longer, give or take the l's own proportions
    const l = out.find(c => c.ch === 'l')!, x0 = Math.min(...nodes(outline('l')!).map(n => n.x)), x1 = Math.min(...nodes(l.doc).map(n => n.x));
    assert.ok(x1 < x0 - 140 && x1 > x0 - 280, `the l's serif reaches from ${x0.toFixed(0)} to ${x1.toFixed(0)}`);
    for (const c of out) for (const n of nodes(c.doc)) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), `${c.ch}'s points are numbers`);
  });

  it("moves the same points by as much where the letter has them, keeping the rest of it as it was", () => {
    const d = outline('d')!, l = outline('l')!, got = carryLetter(changesOf(d.contours, moveAnchors(d.contours, tip(d), -8, 0)), 'l', l);
    assert.ok(got, 'a small change is carried too');
    const was = nodes(l), now = nodes(got.doc);
    assert.equal(now.length, was.length, 'no points added or taken away');
    const moved = was.map((n, k) => ({ dx: now[k].x - n.x, dy: now[k].y - n.y })).filter(m => Math.abs(m.dx) > 0.5 || Math.abs(m.dy) > 0.5);
    assert.equal(moved.length, 2, 'only the two points at the serif\'s end move');
    for (const m of moved) assert.ok(m.dx <= -4 && m.dx >= -11 && Math.abs(m.dy) <= 1, `moved by ${m.dx.toFixed(1)}, ${m.dy.toFixed(1)}`);
  });

  it('puts in a point the other letter has no match for: a drip under the serif', () => {
    const d = outline('d')!, [end] = tip(d).sort((p, q) => d.contours[p.c][p.i].y - d.contours[q.c][q.i].y);
    // the curve from the stem out to the serif's end gets a point, pulled down
    const i = (end.i + d.contours[end.c].length - 1) % d.contours[end.c].length, split = splitSegment(d.contours, end.c, i, 0.5);
    const drip = moveAnchors(split, [{ c: end.c, i: i + 1 }], 0, -40);
    const h0 = outline('h')!, h = carryLetter(changesOf(d.contours, drip), 'h', h0);
    assert.ok(h, 'the h has that serif');
    assert.ok(nodes(h.doc).length > nodes(h0).length, 'a point more');
    // under the h's serif, between its end and its stem, a point hangs well below the serif's underside
    const ends = tip(h0).map(r => h0.contours[r.c][r.i]), under = Math.min(...ends.map(n => n.y)), x = ends[0].x;
    assert.ok(nodes(h.doc).some(n => n.x > x + 5 && n.x < x + 90 && n.y < under - 25), `a drip under the h's serif (its underside at ${under.toFixed(0)})`);
  });

  /** The contour standing highest in a letter: an i's dot. */
  const top = (d: Drawn) => d.contours.map((con, c) => ({ c, y: Math.min(...con.map(n => n.y)) })).sort((p, q) => q.y - p.y)[0].c;

  it("carries the i's dot, moved whole, to the j's (a close match), and a full stop's only as shaped the same", () => {
    const i = outline('i')!, c = top(i), up = moveAnchors(i.contours, i.contours[c].map((_, k) => ({ c, i: k })), 0, 40);
    const out = carryChange('i', i.contours, up, outline), j = out.find(o => o.ch === 'j');
    assert.ok(j?.close, `the j's dot is a close match (${out.map(o => `${o.ch}${o.close ? '' : '?'}`).join(' ')})`);
    assert.ok(!out.find(o => o.ch === '.')?.close, "a full stop isn't a close match");
    const was = outline('j')!, d = top(was);
    assert.equal(j.doc.contours.length, was.contours.length);
    j.doc.contours.forEach((con, k) => con.forEach((n, z) => {
      const dy = n.y - was.contours[k][z].y;
      assert.ok(k === d ? Math.abs(dy - 40) <= 1 : dy === 0, `the j's ${k === d ? 'dot rises by 40' : 'stem stays'} (${dy})`);
    }));
  });

  it("takes the j's dot away with the i's", () => {
    const i = outline('i')!, j = outline('j')!, got = carryLetter(changesOf(i.contours, i.contours.filter((_, c) => c !== top(i))), 'j', j);
    assert.ok(got, 'the j is offered the change');
    assert.deepEqual(got.doc.contours, j.contours.filter((_, c) => c !== top(j)));
  });

  it("rounds an h's corners where they're shaped as the l's were, when every corner of the l is rounded", () => {
    const l = outline('l')!, h = outline('h')!, round = l.contours.map(con => con.map(n => (n.s ? n : { ...n, r: 16 })));
    const got = carryLetter(changesOf(l.contours, round), 'h', h);
    assert.ok(got?.close, 'the h is a close match');
    const rounded = nodes(got.doc).filter(n => n.r === 16).length;
    assert.ok(rounded >= 3, `${rounded} of the h's corners rounded`);
    assert.deepEqual(nodes(got.doc).map(n => [n.x, n.y]), nodes(h).map(n => [n.x, n.y]), 'no point of the h moves');
  });

  it("carries a change to the letter's own other places shaped the same, not again where it was made: an n's other foot", () => {
    const n = outline('n')!, ps = n.contours.flatMap((con, c) => con.map((p, i) => ({ c, i, p })));
    // the left foot's serif, out to the left: its end, the points furthest down and left
    const best = Math.max(...ps.map(q => -q.p.x - 1.2 * q.p.y)), end = ps.filter(q => -q.p.x - 1.2 * q.p.y >= best - 25);
    const now = moveAnchors(n.contours, end, -40, 0), got = carryChange('n', n.contours, now, outline).find(c => c.ch === 'n');
    assert.ok(got?.close, 'the n itself is a close match');
    assert.equal(got.places, 1, 'one other place');
    const was = now.flat(), moved = nodes(got.doc).map((q, k) => ({ q, dx: q.x - was[k].x })).filter(m => Math.abs(m.dx) > 0.5);
    assert.ok(moved.length >= 1 && moved.every(m => m.dx <= -30 && m.dx >= -50 && m.q.x > Math.min(...was.map(q => q.x)) + 100),
      `only the right foot's serif moves out (${moved.map(m => `${m.q.x.toFixed(0)}: ${m.dx.toFixed(0)}`).join(', ')})`);
  });

  it("carries a b's bowl, made wider, to a d's mirrored (and to a p's as it is), and a bracket to its other side", () => {
    const b = outline('b')!, right = nodes(b).reduce((p, q) => (q.x > p.x ? q : p));
    const at = b.contours.flatMap((con, c) => con.map((n, i) => ({ c, i, n }))).filter(q => q.n === right);
    const out = carryChange('b', b.contours, moveAnchors(b.contours, at, 30, 0), outline);
    const d = out.find(c => c.ch === 'd'), p = out.find(c => c.ch === 'p');
    assert.ok(d?.mirrored && d.close, "the d's bowl is a close match, mirrored");
    assert.ok(p && !p.mirrored, "the p's bowl is the same way round");
    const x0 = Math.min(...nodes(outline('d')!).map(n => n.x)), x1 = Math.min(...nodes(d.doc).map(n => n.x));
    assert.ok(x1 < x0 - 15 && x1 > x0 - 45, `the d's bowl reaches out left, from ${x0.toFixed(0)} to ${x1.toFixed(0)}`);
    // a bracket's curve pushed out: the other bracket's, pushed out the other way
    const open = outline('(')!, left = nodes(open).reduce((p, q) => (q.x < p.x ? q : p));
    const where = open.contours.flatMap((con, c) => con.map((n, i) => ({ c, i, n }))).filter(q => q.n === left);
    const close = carryChange('(', open.contours, moveAnchors(open.contours, where, -30, 0), outline).find(c => c.ch === ')');
    assert.ok(close?.mirrored, 'the closing bracket is a mirrored match');
    const r0 = Math.max(...nodes(outline(')')!).map(n => n.x)), r1 = Math.max(...nodes(close.doc).map(n => n.x));
    assert.ok(r1 > r0 + 15 && r1 < r0 + 45, `the closing bracket reaches out right, from ${r0.toFixed(0)} to ${r1.toFixed(0)}`);
  });

  it("puts a shape added to an l where the other letters have the l's top serif, as it sits on it there", () => {
    const l = outline('l')!, end = tip(l).map(r => l.contours[r.c][r.i]), x = end[0].x, y = Math.max(...end.map(n => n.y));
    const out = carryChange('l', l.contours, [...l.contours, round(x, y + 18, 30)], outline);
    for (const ch of 'bhk') {
      const got = out.find(c => c.ch === ch), was = outline(ch)!;
      assert.ok(got?.close && !got.mirrored, `${ch} is a close match`);
      assert.equal(got.doc.contours.length, was.contours.length + 1, `${ch} has the shape added`);
      const [h] = tip(was).map(r => was.contours[r.c][r.i]), ball = got.doc.contours[got.doc.contours.length - 1];
      const cx = (Math.min(...ball.map(n => n.x)) + Math.max(...ball.map(n => n.x))) / 2, cy = (Math.min(...ball.map(n => n.y)) + Math.max(...ball.map(n => n.y))) / 2;
      assert.ok(Math.abs(cx - h.x) < 15 && Math.abs(cy - (Math.max(...tip(was).map(r => was.contours[r.c][r.i].y)) + 18)) < 15, `${ch}'s ball sits on its serif's end (${cx.toFixed(0)}, ${cy.toFixed(0)})`);
    }
    // carried twice, it isn't put in twice
    const h = out.find(c => c.ch === 'h')!, again = carryLetter(changesOf(l.contours, [...l.contours, round(x, y + 18, 30)]), 'h', h.doc);
    assert.equal(again, null);
  });

  it('offers nothing to a letter that already looks as the change would leave it', () => {
    const d = outline('d')!, now = moveAnchors(d.contours, tip(d), -200, 0);
    assert.equal(carryLetter(changesOf(d.contours, now), 'x', { adv: d.adv, contours: now }), null);
  });
});

describe('carry: to the other letters of a font drawn by hand', () => {
  let font: Font, script: Font;
  const outline = (ch: string, f = font): Drawn | null => { const g = f.glyph(ch); return g ? traceOf(g) : null; };
  const load = async (style: string) => {
    const st = STYLES.find(s => s.id === style)!, id = STYLE_FONTS[style];
    if (!freeFont(id)) registerFreeFont(await new FreeFonts(null, async (url: string): Promise<never> => { throw new Error(`fetched ${url}`); }).load(id));
    return buildFont({ ...st.params, freeFont: id, freeAt: freeAtOf(st.params) } as Params);
  };
  before(async () => { font = await load('blackletter'); script = await load('chancery'); });
  /** The biggest of a letter's counters (the contours wound against its outside). */
  const counterOf = (d: Drawn) => {
    const big = d.contours.reduce((p, q) => (Math.abs(contourArea(q)) > Math.abs(contourArea(p)) ? q : p));
    return d.contours.map((con, c) => ({ con, c })).filter(q => Math.sign(contourArea(q.con)) !== Math.sign(contourArea(big)))
      .sort((p, q) => Math.abs(contourArea(q.con)) - Math.abs(contourArea(p.con)))[0].c;
  };
  const width = (con: Node[]) => Math.max(...con.map(n => n.x)) - Math.min(...con.map(n => n.x));

  it("finds Cathedral's b counter from its o's only roughly, offered but not as alike as a strict match", () => {
    // the o's counter (wound against its outside) made wider, its right half moved out
    const o = outline('o')!, big = o.contours.reduce((p, q) => (Math.abs(contourArea(q)) > Math.abs(contourArea(p)) ? q : p));
    const c = o.contours.findIndex(con => Math.sign(contourArea(con)) !== Math.sign(contourArea(big))), con = o.contours[c];
    const cx = (Math.min(...con.map(n => n.x)) + Math.max(...con.map(n => n.x))) / 2;
    const wider = moveAnchors(o.contours, con.map((n, i) => ({ c, i, n })).filter(q => q.n.x > cx), 14, 0);
    const b = carryLetter(changesOf(o.contours, wider), 'b', outline('b')!);
    assert.ok(b?.rough && b.close, `the b's counter is a rough, close match (${b && JSON.stringify({ rough: b.rough, close: b.close })})`);
    assert.equal(b.doc.contours.length, outline('b')!.contours.length);
  });

  it("widens Serenade's b and d counters as its o's was widened, though each is drawn its own way", () => {
    const o = outline('o', script)!, c = counterOf(o), con = o.contours[c], cx = (Math.min(...con.map(n => n.x)) + Math.max(...con.map(n => n.x))) / 2;
    const wider = o.contours.map((k, i) => (i !== c ? k : k.map(n => {
      const x = (v: number) => Math.round(cx + 1.15 * (v - cx)), q: Node = { ...n, x: x(n.x) };
      if (n.ix !== undefined) q.ix = x(n.ix);
      if (n.ox !== undefined) q.ox = x(n.ox);
      return q;
    })));
    const changes = changesOf(o.contours, wider);
    for (const ch of 'bd') {
      const was = outline(ch, script)!, got = carryLetter(changes, ch, was), k = counterOf(was);
      assert.ok(got?.rough && got.close, `${ch}'s counter is offered, roughly (${got && JSON.stringify({ rough: got.rough, close: got.close })})`);
      const w0 = width(was.contours[k]), w1 = width(got.doc.contours[k]);
      assert.ok(w1 > w0 * 1.1 && w1 < w0 * 1.2, `${ch}'s counter is as much wider, from ${w0.toFixed(0)} to ${w1.toFixed(0)}`);
      assert.deepEqual(got.doc.contours.filter((_, i) => i !== k), was.contours.filter((_, i) => i !== k), `the rest of ${ch} stays`);
    }
  });
});

describe('carry: never in a grid fill\'s cells', () => {
  it('tells a letter standing in cells, as Points shows it, from one in ink, an outline or a shadow', () => {
    const a: Drawn = { adv: 500, contours: [round(250, 250, 200)] }, p = STYLES[0].params;
    const at = (fill: Params['fill']) => ({ ...a, at: { fill } });
    // set in cells, or drawn without a fill and taking them now
    assert.ok(inCells({ ...p, fill: 'dots' }, 'a'));
    assert.ok(inCells({ ...p, fill: 'hex', outlines: { a: at('solid') } }, 'a'));
    // drawn in cells (they're in its points), whatever the fill is now
    assert.ok(inCells({ ...p, fill: 'solid', outlines: { a: at('pixels') } }, 'a'));
    // ink, an outline or a shadow carry as before; a drawing that keeps no settings takes no fill
    assert.ok(!inCells({ ...p, fill: 'solid' }, 'a'));
    assert.ok(!inCells({ ...p, fill: 'shadow' }, 'a'));
    assert.ok(!inCells({ ...p, fill: 'dots', outlines: { a: at('outline') } }, 'a'));
    assert.ok(!inCells({ ...p, fill: 'dots', outlines: { a } }, 'a'));
  });
});

/** A round of four points, `r` across, about cx, cy. */
function round(cx: number, cy: number, r: number): Node[] {
  const k = 0.5523 * r;
  return [{ x: cx + r, y: cy, ix: cx + r, iy: cy - k, ox: cx + r, oy: cy + k, s: 1 }, { x: cx, y: cy + r, ix: cx + k, iy: cy + r, ox: cx - k, oy: cy + r, s: 1 },
    { x: cx - r, y: cy, ix: cx - r, iy: cy + k, ox: cx - r, oy: cy - k, s: 1 }, { x: cx, y: cy - r, ix: cx - k, iy: cy - r, ox: cx + k, oy: cy - r, s: 1 }];
}
