/* Every glyph of every starting style as the engine builds it, and of every setting at its ends and in each of its
   options, against the outlines kept in tests/golden/outlines.txt (tools/golden.ts computes them). A change you
   meant: look at it (npm run render), then npm run golden:update and commit the file with the change. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compute, diff } from '../tools/golden';

describe('golden outlines', () => {
  it('engine letters match tests/golden/outlines.txt', () => {
    const changed = diff(compute());
    assert.deepEqual(changed, [], `outlines changed (npm run golden:update if this is intended):\n${changed.join('\n')}`);
  });
});
