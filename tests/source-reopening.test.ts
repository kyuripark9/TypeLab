/* A saved feature frame must reopen and export identically in registries that have never seen it. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { buildFont, packNode } from '../shared/engine';
import { DEFAULTS, drawnAtOf, freeAtOf, type Params } from '../shared/params';
import { masterInfo } from '../shared/source/master-catalog';
import { programForFont } from '../shared/source/program-catalog';
import { loadSource } from '../server/sources';
import { buildOTF } from '../server/export';
import { ExportPool } from '../server/export-pool';
import { opentype } from '../server/opentype';

function savedFeatureFrame() {
  const ref = programForFont('Hearth:600'), info = masterInfo(ref);
  assert.ok(ref && info);
  loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min);
  const prior: Params = { ...DEFAULTS, sourceProgram: ref, freeFont: ref.fontId, weight, tail: 1, freeAt: { ...freeAtOf(DEFAULTS), weight } };
  const original = buildFont(prior).glyph('R');
  assert.ok(original?.drawn);
  const params: Params = { ...prior, sourceProgram: info.ref, tail: .5,
    outlines: { R: { ...original.drawn, at: drawnAtOf(prior, 'R') } } };
  const expected = buildFont(params).glyph('R');
  assert.ok(expected?.drawn);
  assert.equal(expected.adv, 686);
  return { params, prior: ref, drawing: [expected.adv, expected.drawn.contours.map(c => c.map(packNode))] };
}

describe('saved Points source dependencies', () => {
  it('refuses a missing prior program and reopens its exact frame in a fresh process', () => {
    const saved = savedFeatureFrame();
    const reopened = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/reopen-source-frame.ts', import.meta.url))], {
      input: JSON.stringify(saved.params), encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' },
    });
    assert.equal(reopened.status, 0, reopened.stderr);
    const result: unknown = JSON.parse(reopened.stdout);
    assert.ok(result && typeof result === 'object' && 'missing' in result && 'refusedExport' in result && 'ready' in result && 'drawing' in result);
    assert.deepEqual(result.missing, { ref: saved.prior, state: 'missing', missingCharacters: [] });
    assert.equal(result.refusedExport, true);
    assert.deepEqual(result.ready, { ref: saved.params.sourceProgram, state: 'ready', missingCharacters: [] });
    assert.deepEqual(result.drawing, saved.drawing);
  });

  it('loads prior feature frames in a fresh export worker and matches the loaded preview', async () => {
    const { params } = savedFeatureFrame(), name = 'Saved source frame', pool = new ExportPool(1);
    try {
      const built = await pool.run({ kind: 'otf', name, params, member: null }, []);
      const actual = opentype.parse(Uint8Array.from(built.data).buffer);
      const expected = opentype.parse(Uint8Array.from(buildOTF(params, name)).buffer);
      assert.equal(actual.charToGlyph('R').advanceWidth, 686);
      assert.deepEqual(actual.charToGlyph('R').path.commands, expected.charToGlyph('R').path.commands);
      assert.deepEqual(actual.charToGlyph('A').path.commands, expected.charToGlyph('A').path.commands);
      assert.equal(actual.charToGlyph('A').advanceWidth, expected.charToGlyph('A').advanceWidth);
    } finally { pool.close(); }
  });
});
