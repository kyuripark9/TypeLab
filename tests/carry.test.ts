/* Carrying a change made to one letter's points to the other letters shaped the same way there (client/lib/carry.ts):
   reading the change against the letter as it was, finding its old shape in other letters (close matches, where the
   outline round it is the same too, and looser ones), and putting the change in, point for point where the letter
   has the same points, else as a new stretch fitted to it. */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES } from '../shared/content';
import { buildFont, freeFont, registerFreeFont, type Drawn, type Font, type Node } from '../shared/engine';
import { STYLE_FONTS } from '../shared/free-fonts';
import { freeAtOf, type Params } from '../shared/params';
import { FreeFonts } from '../server/free-fonts';
import { carryChange, carryLetter, changesOf, sameDrawing } from '../client/lib/carry';
import { moveAnchors, splitSegment, deleteAnchors, traceOf, type Ref } from '../client/lib/pen';

describe('carry: reading what changed', () => {
  // a square of eight points, three to a side
  const sq: Node[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }, { x: 0, y: 200 }, { x: 0, y: 100 }];

  it('finds nothing when nothing changed, or when shapes came or went', () => {
    assert.deepEqual(changesOf([sq], [sq.map(n => ({ ...n }))]), []);
    assert.deepEqual(changesOf([sq], [sq, sq]), []);
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

  it('carries nothing from a contour changed all over', () => {
    assert.deepEqual(changesOf([sq], moveAnchors([sq], sq.map((_, i) => ({ c: 0, i })), 5, 5)), []);
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
    const close = out.filter(c => c.close).map(c => c.ch).join(''), all = out.map(c => c.ch).join('');
    for (const ch of 'bhkl') assert.ok(close.includes(ch), `${ch} is a close match (close: ${close}, all: ${all})`);
    for (const ch of 'aceosuACOS') assert.ok(!all.includes(ch), `${ch} has no such serif (${all})`);
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

  it('offers nothing to a letter that already looks as the change would leave it', () => {
    const d = outline('d')!, now = moveAnchors(d.contours, tip(d), -200, 0);
    assert.equal(carryLetter(changesOf(d.contours, now), 'x', { adv: d.adv, contours: now }), null);
  });
});
