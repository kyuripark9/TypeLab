/* Every glyph of every starting style, and of every setting at its ends and in each of its options (and, with
   GOLDEN_FREE=1, each style in its free font), against the outlines kept in tests/golden/ (tools/golden.ts
   computes them). A change you meant: look at it (npm run render), then npm run golden:update and commit the
   files with the change. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { compute, diff, GOLDEN_FILE } from '../tools/golden';

describe('golden outlines', () => {
  it('engine letters match tests/golden/outlines.txt', () => {
    const changed = diff(compute('engine'), 'engine');
    assert.deepEqual(changed, [], `outlines changed (npm run golden:update if this is intended):\n${changed.join('\n')}`);
  });
  // (about half a minute, so only with GOLDEN_FREE=1; npm run golden checks the free fonts on its own)
  it('free fonts\' letters match tests/golden/free-outlines.txt (fonts kept in data/free-fonts only)', t => {
    if (!process.env.GOLDEN_FREE) { t.skip('GOLDEN_FREE=1 to check here, or npm run golden'); return; }
    const now = compute('free');
    if (!now.size || !existsSync(GOLDEN_FILE.free)) { t.skip('no free fonts kept'); return; }
    const changed = diff(now, 'free');
    assert.deepEqual(changed, [], `free fonts' outlines changed (npm run golden:update if this is intended):\n${changed.join('\n')}`);
  });
});
