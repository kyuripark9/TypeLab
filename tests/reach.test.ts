import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reachOf } from '../client/lib/reach';
import { TEXTS } from '../shared/content';
import { DEFAULTS, type Params } from '../shared/params';

const base: Params = { ...DEFAULTS };
const sentence = [...new Set(TEXTS.sentence)];

describe('whether a setting changes what is in view', () => {
  it('a setting that shapes the letter shows', () => {
    assert.equal(reachOf(base, 'weight', ['o']).shows, true);
    assert.equal(reachOf(base, 'terminal', ['c']).shows, true);
  });
  it('a part the letter lacks does not, and names letters that have it', () => {
    const r = reachOf(base, 'crossbar', ['o']);
    assert.equal(r.shows, false);
    assert.ok(r.elsewhere.length > 0 && !r.elsewhere.includes('o'), r.elsewhere.join());
    assert.equal(reachOf(base, 'terminal', ['o']).shows, false);
  });
  it('a letter shape the preview text lacks points to that letter', () => {
    const r = reachOf(base, 'kForm', sentence);
    assert.equal(r.shows, false);
    assert.ok(r.elsewhere.some(c => c === 'k' || c === 'K'), r.elsewhere.join());
  });
  it('spacing always shows', () => {
    assert.equal(reachOf(base, 'letterSpacing', ['o']).shows, true);
  });
  it('a letter with its own value is not reached by the shared one', () => {
    const p = { ...base, glyphs: { o: { weight: 0.9 } } };
    assert.equal(reachOf(p, 'weight', ['o']).shows, false);
    // while customizing o, its own value is what moves
    assert.equal(reachOf(p, 'weight', ['o'], 'o').shows, true);
  });
  it('while customizing, a letter-only setting that misses the letter reaches nothing else', () => {
    assert.deepEqual(reachOf(base, 'crossbar', ['o'], 'o'), { shows: false, elsewhere: [] });
  });
});
