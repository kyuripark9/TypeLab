/* The font's History (shared/font-log.ts): what a change records and when it notes how the design stood before,
   folding a change into a version, packing each version down to what changed and playing them back, reading a
   History from outside, the limits, upgrading one written by an older version, two Histories made one, and telling
   a version from the design it is. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STYLES } from '../shared/content';
import { VERSIONS_BYTES, VERSIONS_KEEP, cleanVersions, mergeVersions, packVersions, recordVersion, sameDesign, upgradeVersions, type FontLog, type Snapshot } from '../shared/font-log';
import { withOwn } from '../shared/letter-log';
import { DEFAULTS, drawnAtOf, type Params } from '../shared/params';

const serif = STYLES.find(s => s.id === 'serif')!;
const base: Params = { ...DEFAULTS, glyphs: {}, outlines: {} };
const snap = (params: Params, styleId = 'serif'): Snapshot => ({ styleId, params, key: JSON.stringify([styleId, params]) });
const box = (w: number) => ({ adv: w + 120, contours: [[{ x: 60, y: 0 }, { x: 60 + w, y: 0 }, { x: 60 + w, y: 700 }, { x: 60, y: 700 }]] });
const drawnL = (p: Params, w: number): Params => withOwn(p, 'l', { drawn: { ...box(w), at: drawnAtOf(p, 'l') } });

/** A History of `n` changes from `base`: Weight each time, a letter's own Width every third, l drawn anew every fifth. */
function made(n: number): FontLog {
  let log: FontLog = [], p = base;
  for (let i = 0; i < n; i++) {
    let next: Params = { ...p, weight: (i % 10) / 10 + 0.05 };
    if (i % 3 === 0) next = withOwn(next, 'a', { own: { width: (i % 7) / 10 } });
    if (i % 5 === 0) next = drawnL(next, 200 + i);
    log = recordVersion(log, snap(p), snap(next), { t: i + 1 });
    p = next;
  }
  return log;
}

describe('the font\'s History', () => {
  it('records the whole design after each change, with the settings and letters it changed, first noting how it stood', () => {
    const p1 = { ...base, weight: 0.8, contrast: 0.2 };
    let log = recordVersion([], snap(base), snap(p1), { t: 1 });
    assert.deepEqual(log.map(v => [v.keys, v.letters]), [[[], []], [['weight', 'contrast'], []]]);
    assert.equal(log[0].params, base);
    assert.equal(log[1].params, p1);
    // a letter on its own, and a style picked
    const p2 = withOwn(p1, 'a', { own: { weight: 0.3 } });
    log = recordVersion(log, snap(p1), snap(p2), { t: 2 });
    assert.deepEqual([log[2].keys, log[2].letters], [[], ['a']]);
    log = recordVersion(log, snap(p2), snap(serif.params, 'slab'), { t: 3, made: 'style' });
    assert.equal(log[3].made, 'style');
    assert.equal(log[3].styleId, 'slab');
    // nothing changed, nothing recorded
    assert.equal(recordVersion(log, snap(p2), snap({ ...p2 }), { t: 4 }), log);
  });

  it('notes how the design stood where a change was undone since, and folds a change into its step\'s version', () => {
    const p1 = { ...base, weight: 0.8 }, p2 = { ...base, weight: 0.2 };
    let log = recordVersion([], snap(base), snap(p1), { t: 1 });
    // undone to base, then another change: base is noted again before it
    log = recordVersion(log, snap(base), snap(p2), { t: 2 });
    assert.deepEqual(log.map(v => v.params.weight), [DEFAULTS.weight, 0.8, DEFAULTS.weight, 0.2]);
    const p3 = drawnL(p2, 220);
    log = recordVersion(log, snap(p2), snap(p3), { t: 2, fold: 2 });
    assert.equal(log.length, 4);
    assert.deepEqual([log[3].keys, log[3].letters, log[3].params], [['weight'], ['l'], p3]);
  });

  it('packs each version down to what changed from the one before, and plays them back', () => {
    const log = made(30), packed = packVersions(log);
    assert.ok(packed[0].base && !packed[1].base);
    assert.deepEqual(Object.keys(packed[1].set ?? {}), ['weight']);
    assert.ok(JSON.stringify(packed).length * 5 < JSON.stringify(log.map(v => v.params)).length);
    const back = cleanVersions(JSON.parse(JSON.stringify(packed)));
    assert.equal(back.length, log.length);
    back.forEach((v, i) => assert.ok(sameDesign(v, snap(log[i].params, log[i].styleId)), `version ${i}`));
    // a drawing that didn't change is one object from version to version
    assert.equal(back[6].params.outlines.l, back[9].params.outlines.l);
  });

  it('reads a History from outside, dropping what doesn\'t read', () => {
    const log = cleanVersions([
      { t: 1, keys: ['weight', 'nope', 'glyphs'], letters: ['a', 'ab', 3], base: true, styleId: 'nope', set: { weight: 3 }, glyphs: { a: { weight: 0.2, xHeight: 0.5 }, ab: { weight: 1 } } },
      'x',
      { keys: [], letters: [], set: { contrast: 0.9 } },
      { t: 3, keys: ['width'], letters: ['a'], made: 'nope', back: 'x', styleId: 'slab', set: { width: 0.1 }, glyphs: { a: null } }
    ]);
    assert.deepEqual(log.map(v => [v.t, v.keys, v.letters, v.styleId, v.made, v.back]), [[1, ['weight'], ['a'], STYLES[0].id, undefined, undefined], [3, ['width'], ['a'], 'slab', undefined, undefined]]);
    assert.equal(log[0].params.weight, 1);
    assert.deepEqual(log[0].params.glyphs, { a: { weight: 0.2 } });
    // a change in a version that doesn't read still holds for those after it
    assert.deepEqual([log[1].params.contrast, log[1].params.width, log[1].params.glyphs], [0.9, 0.1, {}]);
    assert.deepEqual(cleanVersions({}), []);
  });

  it('keeps VERSIONS_KEEP versions and VERSIONS_BYTES of them packed, the oldest going first', () => {
    const log = made(VERSIONS_KEEP + 10);
    assert.equal(log.length, VERSIONS_KEEP);
    // (made() notes how the design stood first, then records 210 changes)
    assert.equal(log[0].t, 11);
    // a letter drawn anew, big, at each change
    let big: FontLog = [], p = base;
    for (let i = 0; i < 100; i++) {
      const next = withOwn(p, 'l', { drawn: { adv: 600, contours: [Array.from({ length: 1500 }, (_, k) => ({ x: (k + i) % 500, y: Math.floor(k / 500) }))] } });
      big = recordVersion(big, snap(p), snap(next), { t: i });
      p = next;
    }
    assert.ok(big.length < 100 && JSON.stringify(packVersions(big)).length <= VERSIONS_BYTES);
    assert.equal(big[big.length - 1].params, p);
  });

  it('brings a History written by an older version up as a design is brought up', () => {
    // version 3 drawings kept no settings they were drawn at: read as drawn at their design's
    const up = cleanVersions(upgradeVersions([{ t: 1, keys: [], letters: ['l'], base: true, styleId: 'serif', set: { weight: 0.7 }, glyphs: {}, outlines: { l: box(200) } }], 3));
    assert.equal(up[0].params.outlines.l.at?.weight, 0.7);
  });

  it('makes two Histories one, by time, and tells a version from the design whatever its keys\' order', () => {
    const a = made(4), b = made(6);
    const both = mergeVersions(a, b);
    assert.equal(both.length, 7, 'the first five are in both');
    assert.deepEqual(both.map(v => v.t), [1, 1, 2, 3, 4, 5, 6]);
    const v = a[1], reordered = Object.fromEntries(Object.entries(v.params).reverse()) as unknown as Params;
    assert.ok(sameDesign(v, snap(reordered, v.styleId)));
    assert.ok(!sameDesign(v, snap({ ...v.params, weight: 0.99 }, v.styleId)));
  });
});
