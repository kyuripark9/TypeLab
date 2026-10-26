import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MASTER_REVISIONS } from '../shared/source/master-catalog';
import { parseMasterSubdivision } from '../shared/source/subdivision';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const oldDigest = 'bbef63cb6315effcfd88971ea84aa20324700567c771b1ddbbc7e6ae215682c4';
const newDigest = 'e79ee882db3b4b75825be583381d1f791886c305b9b6cbecf8cce410856b14fa';
const mapDigest = '3e40a8be674e2e3da35c2937b6ee6192598a25373f2c46f9dc18c0e33907bd52';
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
function contents(directory: string): [string, string][] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? contents(path) : [[path, hash(path)]];
  });
}

it('publishes exact basis revisions immutably and rejects invalid candidates before writing', t => {
  const root = mkdtempSync(resolve(tmpdir(), 'typelab-publication-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const base = resolve(cwd, 'fonts/masters', newDigest + '.json');
  const mapping = resolve(cwd, 'fonts/subdivisions', mapDigest + '.json');
  mkdirSync(resolve(root, 'fonts/masters'), { recursive: true });
  mkdirSync(resolve(root, 'shared/source'), { recursive: true });
  cpSync(resolve(cwd, 'fonts/masters', oldDigest + '.json'), resolve(root, 'fonts/masters', oldDigest + '.json'));
  writeFileSync(resolve(root, 'fonts/masters/manifest.json'), JSON.stringify(MASTER_REVISIONS.filter(e => e.ref.digest === oldDigest), null, 2) + '\n');
  const catalog = readFileSync(resolve(cwd, 'shared/source/master-catalog.ts'), 'utf8');
  writeFileSync(resolve(root, 'shared/source/master-catalog.ts'), catalog);
  const bad = parseMasterSubdivision(JSON.parse(readFileSync(mapping, 'utf8')));
  bad.glyphs.H[0][0].t1 = (bad.glyphs.H[0][0].t0 + bad.glyphs.H[0][0].t1) / 2;
  const invalid = resolve(root, 'invalid-binding.json');
  writeFileSync(invalid, JSON.stringify(bad));
  function run(tool: string, args: string[], succeeds = true): void {
    const result = spawnSync(process.execPath, ['--max-old-space-size=256', '--import', 'tsx', 'tools/authored/' + tool + '.ts', ...args],
      { cwd, encoding: 'utf8', env: { ...process.env, TYPELAB_PUBLICATION_ROOT: root } });
    if (succeeds) assert.equal(result.status, 0, result.stderr);
    else assert.notEqual(result.status, 0, 'Invalid publication was accepted');
  }
  const before = contents(root);
  run('build-masters', [base], false);
  assert.deepEqual(contents(root), before);
  run('build-masters', ['--derived', base, invalid], false);
  assert.deepEqual(contents(root), before);
  run('build-masters', ['--derived', base, mapping]);
  const masterState = contents(root);
  run('build-masters', ['--derived', base, mapping]);
  run('build-masters', ['--check']);
  assert.deepEqual(contents(root), masterState);
  assert.equal(hash(resolve(root, 'fonts/masters', oldDigest + '.json')), oldDigest);
  assert.equal(hash(resolve(root, 'fonts/masters', newDigest + '.json')), newDigest);
  const generated = /export const MASTER_REVISIONS: readonly MasterInfo\[\] = [\s\S]*?;\n/;
  assert.equal(readFileSync(resolve(root, 'shared/source/master-catalog.ts'), 'utf8').replace(generated, ''), catalog.replace(generated, ''));
  run('build-revisions', [invalid], false);
  assert.deepEqual(contents(root), masterState);
  assert.equal(existsSync(resolve(root, 'fonts/subdivisions')), false);
  run('build-revisions', [mapping]);
  assert.equal(hash(resolve(root, 'fonts/subdivisions', mapDigest + '.json')), mapDigest);
  const final = contents(root);
  run('build-revisions', [mapping]);
  run('build-revisions', ['--check']);
  assert.deepEqual(contents(root), final);
});
