/* Verify the narrowly patched upstream offset against the installed pinned package. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
const provenance = JSON.parse(read('shared/vendor/clipper2-offset.provenance.json'));
const installed = JSON.parse(read('node_modules/clipper2-ts/package.json'));
assert.equal(installed.version, provenance.version);
for (const file of provenance.files) {
  const original = read(`node_modules/clipper2-ts/${file.upstream}`);
  assert.equal(hash(original), file.upstreamSha256);
  let expected = original.replace("from './Core.js'", "from 'clipper2-ts'").replace("from './Engine.js'", "from 'clipper2-ts'");
  if (file.local.endsWith('.js')) for (const target of ['this.solutionTree', 'this.solution']) {
    const before = `            c.execute(ClipType.Union, fillRule, ${target});`;
    assert.equal(expected.split(before).length, 2);
    expected = expected.replace(before, `            if (!c.execute(ClipType.Union, fillRule, ${target})) throw new Error('ClipperOffset union did not complete');`);
  }
  expected = expected.replace(/\n\/\/# sourceMappingURL=.*?\n?$/, '\n');
  const actual = read(`shared/vendor/${file.local}`);
  assert.equal(actual, expected);
  assert.equal(hash(actual), file.vendoredSha256);
}
assert.equal(read('shared/vendor/clipper2-LICENSE.txt'), read('node_modules/clipper2-ts/LICENSE'));
console.log(`Offset vendor matches ${provenance.package}@${provenance.version}: supported imports and two checked union results.`);
