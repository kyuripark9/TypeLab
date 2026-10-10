import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { buildFont } from '../shared/engine';
import { DEFAULTS, PARAMS_VERSION, isValidParams, sanitizeParams, upgradeParams, xHeightFromOld, xHeightRatio } from '../shared/params';
import { DesignStore } from '../server/db';

/* Reading settings from outside (shared/params/clean.ts): sanitizeParams and isValidParams clamp, drop and fall
   back; designs saved with older settings (a separate reverse contrast, the first Lowercase height scale) come
   back on the current scales, and a database written before PARAMS_VERSION 2 is moved onto them once. */

describe('params validation', () => {
  it('clamps numbers, drops unknown keys and falls back on bad values', () => {
    const p = sanitizeParams({ weight: 7, width: -1, contrast: 'x', terminal: 'blobby', serif: 'yes', fill: 'glitter', story: 'triple', evil: '<script>' });
    assert.equal(p.weight, 1);
    assert.equal(p.width, 0);
    assert.equal(p.contrast, DEFAULTS.contrast);
    assert.equal(p.terminal, DEFAULTS.terminal);
    assert.equal(p.serif, DEFAULTS.serif);
    assert.equal(p.fill, DEFAULTS.fill);
    assert.equal(p.story, DEFAULTS.story);
    assert.ok(!('evil' in p));
  });

  it('keeps only corner ids it knows, clamped', () => {
    const p = sanitizeParams({ glyphs: { O: { corners: { '0t1': 2, '3sl': 0.4, bogus: 1, '0x': 0.2 }, innerCorners: { '0t1': -1, '3sl': 0.4 } } } });
    assert.deepEqual(p.glyphs.O?.corners, { '0t1': 1, '3sl': 0.4 });
    assert.deepEqual(p.glyphs.O?.innerCorners, { '0t1': 0 }, 'only a turn has an inside');
  });

  it('keeps only the corner ids and mirror forms it knows', () => {
    const p = sanitizeParams({ mirror: 'sideways', glyphs: { O: { cornerSteps: { '0t1': 3, '1sl': 0.2, x: 1 }, mirror: 'mirrored' } } });
    assert.equal(p.mirror, 'normal');
    assert.deepEqual(p.glyphs.O, { cornerSteps: { '0t1': 1, '1sl': 0.2 }, mirror: 'mirrored' });
  });

  it('keeps only stroke ids it knows, clamped', () => {
    const p = sanitizeParams({ ...DEFAULTS, glyphs: { H: { strokeWeights: { 0: 2, 12: 0.3, '0s': 0.5, x: 1, 1: 'a' } } } });
    assert.deepEqual(p.glyphs.H.strokeWeights, { 0: 1, 12: 0.3 });
    assert.deepEqual(sanitizeParams({ ...DEFAULTS, glyphs: { H: { strokeWeights: { x: 1 } } } }).glyphs, {});
    assert.deepEqual(sanitizeParams({ ...DEFAULTS, glyphs: { F: { joinGaps: { '1s': 2, '0t1': 0.3, '2': 0.5, '0j1': 0.5, '1x': 1 } } } }).glyphs.F.joinGaps, { '1s': 1, '0t1': 0.3 });
    assert.equal(sanitizeParams({ vWeight: 3, hWeight: -1 }).vWeight, 1);
  });

  it('keeps only valid per-letter settings, one character each', () => {
    const p = sanitizeParams({ glyphs: { R: { weight: 3, xHeight: 0.9, terminal: 'blobby', serif: true }, ab: { weight: 0.2 }, e: {}, g: 'x' } });
    assert.deepEqual(p.glyphs, { R: { weight: 1, serif: true } });
    assert.deepEqual(sanitizeParams({ glyphs: [1] }).glyphs, {});
    const ends = sanitizeParams({ glyphs: { C: { terminalEnds: { '0s': 2, '1e': 0.3, top: 0.5, '2e': 'x' } }, c: { terminalEnds: {} } } }).glyphs;
    assert.deepEqual(ends, { C: { terminalEnds: { '0s': 1, '1e': 0.3 } } });
  });

  it('fills in new settings for designs saved before they existed', () => {
    const { squareness, chamfer, fill, stencil, ...old } = DEFAULTS;
    assert.deepEqual(sanitizeParams({ ...old, weight: 0.7 }), { ...DEFAULTS, weight: 0.7 });
  });

  it('moves a contrast saved with a separate reverse onto the two-way scale', () => {
    const p = sanitizeParams({ ...DEFAULTS, contrast: 0.62, reverse: 1, glyphs: { a: { contrast: 1 }, b: { reverse: 0 } } });
    assert.ok(Math.abs(p.contrast - 0.18) < 1e-9);
    assert.ok(!('reverse' in p));
    assert.deepEqual(p.glyphs, { a: { contrast: 0 }, b: { contrast: 0.8 } });
    assert.equal(sanitizeParams({ ...DEFAULTS, contrast: 0.05, reverse: 0 }).contrast, 0.5, '0.05 with no reverse, the default on the scale with a separate reverse, comes back at the middle');
    assert.equal(sanitizeParams({ contrast: 0.3 }).contrast, 0.3, 'a contrast saved without a reverse stays as it is');
  });

  it('accepts complete, valid params and rejects anything else', () => {
    assert.ok(isValidParams({ ...DEFAULTS }));
    assert.ok(!isValidParams({ ...DEFAULTS, weight: 2 }));
    assert.ok(!isValidParams({ weight: 0.5 }));
    assert.ok(isValidParams({ ...DEFAULTS, glyphs: { R: { weight: 0.9, terminal: 'round' } } }));
    assert.ok(!isValidParams({ ...DEFAULTS, glyphs: { R: { xHeight: 0.9 } } }));
    assert.ok(isValidParams({ ...DEFAULTS, glyphs: { C: { terminalEnds: { '0s': 0.8 } } } }));
    assert.ok(!isValidParams({ ...DEFAULTS, glyphs: { C: { terminalEnds: { '0s': 3 } } } }));
    assert.ok(!isValidParams(null));
  });
});

describe('lowercase height', () => {
  it('reaches down to under a third of the cap height, and settings saved on the first scale keep their x-height', () => {
    assert.ok(Math.abs(xHeightRatio(0) - 0.3) < 1e-9 && Math.abs(xHeightRatio(1) - 0.86) < 1e-9);
    for (const v of [0, 0.22, 0.5, 0.8, 1]) assert.ok(Math.abs(xHeightRatio(xHeightFromOld(v)) - (0.5 + 0.36 * v)) < 0.001, `old ${v}`);
    const f = buildFont({ ...DEFAULTS, xHeight: 0 });
    assert.ok(f.m.xh / f.m.cap < 0.31);
    assert.deepEqual(upgradeParams({ xHeight: 0.5, weight: 0.3 }, 1), { xHeight: xHeightFromOld(0.5), weight: 0.3 });
    assert.deepEqual(upgradeParams({ xHeight: 0.5 }, PARAMS_VERSION), { xHeight: 0.5 });
  });

  it('moves the x-heights in a database written before PARAMS_VERSION 2 onto the current scale, once', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'typelab-')), 'old.db');
    // a database from before PARAMS_VERSION 2: its user_version unset (0, which DesignStore reads as version 1)
    // and its designs table written out here. The fixture keeps this shape when server/db.ts's schema grows,
    // since DesignStore must still open it.
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE designs (id TEXT PRIMARY KEY, name TEXT NOT NULL, style_id TEXT NOT NULL, params TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, owner TEXT);
      INSERT INTO designs VALUES ('a', 'Old', 'grotesk', '{"xHeight":0.5}', '2026-01-01', '2026-01-01', 'me')`);
    old.close();
    const read = () => { const s = new DesignStore(file), d = s.get('a', 'me')!; s.close(); return d.params.xHeight; };
    assert.equal(read(), xHeightFromOld(0.5));
    // opened again, its user_version is already PARAMS_VERSION, so its designs are left as they are
    assert.equal(read(), xHeightFromOld(0.5));
  });
});
