import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { buildFont } from '../shared/engine';
import { DEFAULTS, PARAMS_VERSION, upgradeParams, xHeightFromOld, xHeightRatio, type Params } from '../shared/params';
import { DesignStore } from '../server/db';

const script: Params = { ...DEFAULTS, scriptForm: 'script', weight: 0.36, contrast: 1, slant: 1, xHeight: 0.1 };
const area = (d: string) => {
  // the ink of an outline, near enough: the shoelace sum over its points and handles, contour by contour
  let a = 0;
  for (const part of d.split('M').filter(Boolean)) {
    const v = (part.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 3 < v.length; i += 2) a += v[i] * v[i + 3] - v[i + 2] * v[i + 1];
  }
  return Math.abs(a / 2);
};
const xs = (d: string) => (d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0);

describe('lowercase height', () => {
  it('reaches down to under a third of the cap height, and settings saved on the first scale keep their x-height', () => {
    assert.ok(Math.abs(xHeightRatio(0) - 0.3) < 1e-9 && Math.abs(xHeightRatio(1) - 0.86) < 1e-9);
    for (const v of [0, 0.22, 0.5, 0.8, 1]) assert.ok(Math.abs(xHeightRatio(xHeightFromOld(v)) - (0.5 + 0.36 * v)) < 0.001, `old ${v}`);
    const f = buildFont({ ...DEFAULTS, xHeight: 0 });
    assert.ok(f.m.xh / f.m.cap < 0.31);
    assert.deepEqual(upgradeParams({ xHeight: 0.5, weight: 0.3 }, 1), { xHeight: xHeightFromOld(0.5), weight: 0.3 });
    assert.deepEqual(upgradeParams({ xHeight: 0.5 }, PARAMS_VERSION), { xHeight: 0.5 });
  });

  it('moves the designs in a database from before onto the new scale, once', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'typelab-')), 'old.db');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE designs (id TEXT PRIMARY KEY, name TEXT NOT NULL, style_id TEXT NOT NULL, params TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, owner TEXT);
      INSERT INTO designs VALUES ('a', 'Old', 'grotesk', '{"xHeight":0.5}', '2026-01-01', '2026-01-01', 'me')`);
    old.close();
    const read = () => { const s = new DesignStore(file), d = s.get('a', 'me')!; s.close(); return d.params.xHeight; };
    assert.equal(read(), xHeightFromOld(0.5));
    // opened again, it is already on the new scale
    assert.equal(read(), xHeightFromOld(0.5));
  });
});

describe('swell', () => {
  it('starts the script downstrokes from a point, so they carry less ink, and leaves other letters be', () => {
    for (const ch of 'intu') {
      const at = area(buildFont(script).glyph(ch)!.d), sw = area(buildFont({ ...script, swell: 1 }).glyph(ch)!.d);
      assert.ok(sw < at * 0.97, `${ch}: ${sw} vs ${at}`);
    }
    assert.equal(buildFont({ ...DEFAULTS, swell: 1 }).glyph('n')!.d, buildFont(DEFAULTS).glyph('n')!.d);
  });
});

describe('flourishes', () => {
  it('write swashes on S t z r l d of a script, reaching past the letter without widening it', () => {
    const plain = buildFont(script), swash = buildFont({ ...script, flourish: 'swash' });
    for (const ch of 'Stzrld') {
      const a = plain.glyph(ch)!, b = swash.glyph(ch)!;
      assert.notEqual(a.d, b.d, ch);
      if (ch !== 'S') assert.equal(b.adv, a.adv, ch);
      const reach = Math.max(...xs(b.d)) - Math.min(...xs(b.d));
      assert.ok(reach > b.adv * 1.3, `${ch} reaches ${reach} over ${b.adv}`);
    }
    // letters without a swash, and print letters, stay as they are
    assert.equal(swash.glyph('n')!.d, plain.glyph('n')!.d);
    assert.equal(buildFont({ ...DEFAULTS, flourish: 'swash' }).glyph('t')!.d, buildFont(DEFAULTS).glyph('t')!.d);
  });

  it('can be picked for one letter alone', () => {
    const f = buildFont({ ...script, glyphs: { d: { flourish: 'swash' } } }), plain = buildFont(script), all = buildFont({ ...script, flourish: 'swash' });
    assert.equal(f.glyph('d')!.d, all.glyph('d')!.d);
    assert.equal(f.glyph('t')!.d, plain.glyph('t')!.d);
  });
});
