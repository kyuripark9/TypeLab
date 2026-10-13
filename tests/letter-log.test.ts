/* Each letter's record of its own edits (shared/letter-log.ts): what an edit records and when it notes how a letter
   stood before, folding a change into an edit, packing drawings' settings out and reading them back, reading a record
   from outside, the limits, upgrading one written by an older version, and two records made one. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LOG_BYTES, LOG_KEEP, cleanLog, mergeLogs, packLog, recordEdits, sameOwn, upgradeLog, withOwn, type LetterLog } from '../shared/letter-log';
import { DEFAULTS, drawnAtOf, type Params } from '../shared/params';

const base: Params = { ...DEFAULTS, glyphs: {}, outlines: {} };
const box = (w: number) => ({ adv: w + 120, contours: [[{ x: 60, y: 0 }, { x: 60 + w, y: 0 }, { x: 60 + w, y: 700 }, { x: 60, y: 700 }]] });
/** `p` with letter l drawn as a box `w` wide, drawn at the settings `p` has. */
const drawnL = (p: Params, w: number): Params => withOwn(p, 'l', { drawn: { ...box(w), at: drawnAtOf(p, 'l') } });

describe('a letter\'s record of its edits', () => {
  it('records how each changed letter stands after an edit, with what changed, and nothing for a change that changed nothing', () => {
    const a1 = withOwn(base, 'a', { own: { weight: 0.8 } });
    let log = recordEdits({}, base, a1, { t: 1, by: 'a' });
    assert.deepEqual(log, { a: [{ t: 1, keys: ['weight'], own: { weight: 0.8 } }] });
    const a2 = withOwn(a1, 'a', { own: { weight: 0.8, width: 0.3 } });
    log = recordEdits(log, a1, a2, { t: 2 });
    assert.deepEqual(log.a.map(e => e.keys), [['weight'], ['width']]);
    // the same values written again, in another order, are no edit
    assert.equal(recordEdits(log, a2, withOwn(a2, 'a', { own: { width: 0.3, weight: 0.8 } }), { t: 3 }), log);
    // a drawing, carried on from another letter, and a Reset
    const l = drawnL(a2, 200);
    log = recordEdits(log, a2, l, { t: 4, by: 'n' });
    assert.deepEqual(log.l, [{ t: 4, keys: ['points'], drawn: l.outlines.l, by: 'n' }]);
    log = recordEdits(log, l, withOwn(l, 'l', {}), { t: 5, by: 'l' });
    assert.deepEqual(log.l[1], { t: 5, keys: ['points'] });
  });

  it('notes how a letter stood before an edit where its record doesn\'t end so', () => {
    // a letter customized before the record began
    const a1 = withOwn(base, 'a', { own: { weight: 0.8 } }), a2 = withOwn(a1, 'a', { own: { weight: 0.6 } });
    let log = recordEdits({}, a1, a2, { t: 1 });
    assert.deepEqual(log.a, [{ t: 1, keys: [], own: { weight: 0.8 } }, { t: 1, keys: ['weight'], own: { weight: 0.6 } }]);
    // an edit undone, then another made: where it stood after the undo is kept too
    const a3 = withOwn(a1, 'a', { own: { weight: 0.4 } });
    log = recordEdits(log, a1, a3, { t: 2 });
    assert.deepEqual(log.a.map(e => e.own?.weight), [0.8, 0.6, 0.8, 0.4]);
    // the font's own letter needs no note: it can always be had back
    log = recordEdits({ a: [{ t: 1, keys: ['weight'], own: { weight: 0.8 } }] }, base, withOwn(base, 'a', { own: { weight: 0.2 } }), { t: 2 });
    assert.deepEqual(log.a.map(e => e.own?.weight), [0.8, 0.2]);
  });

  it('folds a change made in the same undo step into that step\'s edit', () => {
    const l1 = drawnL(base, 200), l2 = drawnL(l1, 240);
    let log = recordEdits({}, base, l1, { t: 7 });
    log = recordEdits(log, l1, withOwn(l2, 'a', { own: { weight: 0.9 } }), { t: 7, fold: 7, by: 'l' });
    assert.equal(log.l.length, 1);
    assert.deepEqual(log.l[0].drawn, l2.outlines.l);
    // a letter the step hadn't changed gets an edit of its own
    assert.deepEqual(log.a, [{ t: 7, keys: ['weight'], own: { weight: 0.9 }, by: 'l' }]);
  });

  it('packs each drawing\'s settings out where the drawing before it has the same, and reads them back', () => {
    const l1 = drawnL(base, 200), l2 = withOwn(l1, 'l', { drawn: { ...box(260), at: l1.outlines.l.at } }), l3 = drawnL({ ...l2, weight: 0.7 }, 300);
    let log: LetterLog = recordEdits({}, base, l1, { t: 1 });
    log = recordEdits(log, l1, l2, { t: 2 });
    log = recordEdits(log, l2, l3, { t: 3 });
    const packed = packLog(log);
    assert.deepEqual(packed.l.map(e => !!e.drawn?.at), [true, false, true]);
    assert.ok(JSON.stringify(packed).length < JSON.stringify(log).length);
    const back = cleanLog(JSON.parse(JSON.stringify(packed)));
    assert.deepEqual(back, log);
    assert.ok(back.l.every((e, i) => sameOwn(e, log.l[i])));
  });

  it('reads a record from outside, dropping what doesn\'t read', () => {
    const log = cleanLog({
      a: [{ t: 1, keys: ['weight', 'nope', 'points'], own: { weight: 3, width: 0.3, xHeight: 0.5 } }, { keys: [] }, 'x', { t: 2, keys: 'weight', back: 1, by: 'bb' }],
      ab: [{ t: 1, keys: [] }],
      b: 'x'
    });
    // numbers clamped, settings a letter can't own and unknown keys dropped, as sanitizeParams does
    assert.deepEqual(log, { a: [{ t: 1, keys: ['weight', 'points'], own: { weight: 1, width: 0.3 } }, { t: 2, keys: [], back: 1 }] });
    assert.deepEqual(cleanLog(null), {});
  });

  it('keeps LOG_KEEP edits a letter and LOG_BYTES a design, the oldest going first', () => {
    let log: LetterLog = {}, p = base;
    for (let i = 0; i < LOG_KEEP + 5; i++) {
      const next = withOwn(p, 'a', { own: { weight: (i % 10) / 10 + 0.05 } });
      log = recordEdits(log, p, next, { t: i });
      p = next;
    }
    assert.equal(log.a.length, LOG_KEEP);
    assert.equal(log.a[0].t, 5);
    // drawings big enough to run past LOG_BYTES across letters
    const big = (n: number) => ({ adv: 600, contours: [Array.from({ length: n }, (_, i) => ({ x: i % 500, y: Math.floor(i / 500) }))] });
    const many: LetterLog = Object.fromEntries('bcdefghijk'.split('').map((ch, k) => [ch, Array.from({ length: 10 }, (_, i) => ({ t: k * 10 + i, keys: ['points'], drawn: big(1500 + i) }))]));
    const kept = cleanLog(many);
    assert.ok(JSON.stringify(kept).length <= LOG_BYTES);
    assert.ok(!('b' in kept) && kept.k.length === 10);
  });

  it('brings a record written by an older version up as its design\'s settings', () => {
    // version 3 drawings kept no settings they were drawn at: read as drawn at their design's
    const design = { ...base, weight: 0.7 };
    const up = cleanLog(upgradeLog({ l: [{ t: 1, keys: ['points'], drawn: box(200) }] }, design, 3));
    assert.equal(up.l[0].drawn?.at?.weight, 0.7);
    assert.deepEqual(up.l[0].drawn?.contours, box(200).contours);
  });

  it('makes two records one, each letter\'s edits by time and any in both once', () => {
    const a = { t: 1, keys: ['weight'], own: { weight: 0.8 } }, b = { t: 2, keys: ['weight'], own: { weight: 0.3 } }, c = { t: 3, keys: ['width'], own: { width: 0.2 } };
    assert.deepEqual(mergeLogs({ a: [a, c] }, { a: [{ ...a }, b], n: [c] }), { a: [a, b, c], n: [c] });
  });
});
