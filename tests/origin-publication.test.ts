import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compileOutlineMasterMap, loadOriginalMaster } from '../tools/authored/build-outline-maps';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
function contents(directory: string): [string, string][] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? contents(path) : [[path, hash(path)]];
  });
}

it('publishes original-outline maps immutably after validating every candidate', t => {
  const root = mkdtempSync(resolve(tmpdir(), 'typelab-origin-publication-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ['fonts/masters', 'fonts/sources', 'shared/source']) mkdirSync(resolve(root, directory), { recursive: true });
  const fixtures = ['Hearth', 'Bulwark'].map(loadOriginalMaster);
  for (const { info } of fixtures) {
    cpSync(resolve(cwd, 'fonts/masters', info.ref.digest + '.json'), resolve(root, 'fonts/masters', info.ref.digest + '.json'));
    cpSync(resolve(cwd, 'fonts/sources', info.source.digest + '.json'), resolve(root, 'fonts/sources', info.source.digest + '.json'));
  }
  writeFileSync(resolve(root, 'fonts/masters/manifest.json'), JSON.stringify(fixtures.map(f => f.info), null, 2) + '\n');
  cpSync(resolve(cwd, 'fonts/sources/manifest.json'), resolve(root, 'fonts/sources/manifest.json'));
  const catalog = readFileSync(resolve(cwd, 'shared/source/origin-catalog.ts'), 'utf8');
  writeFileSync(resolve(root, 'shared/source/origin-catalog.ts'), catalog);
  const maps = fixtures.map(({ info, source, neutral }) => compileOutlineMasterMap(info, source, neutral));
  const files = maps.map((data, i) => {
    const file = resolve(root, 'candidate-' + i + '.json'); writeFileSync(file, JSON.stringify(data) + '\n'); return file;
  });
  const invalid = structuredClone(maps[1]); invalid.glyphs.H.contours[0].spans.pop();
  const bad = resolve(root, 'invalid.json'); writeFileSync(bad, JSON.stringify(invalid) + '\n');
  function run(args: string[], success = true): void {
    const result = spawnSync(process.execPath, ['--max-old-space-size=256', '--import', 'tsx', 'tools/authored/publish-outline-maps.ts', ...args],
      { cwd, encoding: 'utf8', env: { ...process.env, TYPELAB_PUBLICATION_ROOT: root } });
    if (success) assert.equal(result.status, 0, result.stderr);
    else assert.notEqual(result.status, 0, 'Invalid origin-map publication was accepted');
  }
  const before = contents(root);
  run([files[0], bad], false);
  assert.deepEqual(contents(root), before);
  assert.equal(existsSync(resolve(root, 'fonts/origins')), false);
  run(files);
  for (const file of files) assert.equal(hash(resolve(root, 'fonts/origins', hash(file) + '.json')), hash(file));
  const published = contents(root);
  run(files); run(['--check']);
  assert.deepEqual(contents(root), published);
  const section = /export const ORIGIN_MAP_REVISIONS: readonly OriginMapInfo\[\] = [\s\S]*?;\n/;
  assert.equal(readFileSync(resolve(root, 'shared/source/origin-catalog.ts'), 'utf8').replace(section, ''), catalog.replace(section, ''));
  const second = structuredClone(maps[0]); second.glyphs['^'].relation = { kind: 'repaired', reason: 'A differently documented repair is still a second map.' };
  const secondFile = resolve(root, 'second.json'); writeFileSync(secondFile, JSON.stringify(second) + '\n');
  const immutable = contents(root); run([secondFile], false); assert.deepEqual(contents(root), immutable);
  const wrongBasis = structuredClone(maps[0]); wrongBasis.to = { ...wrongBasis.to, digest: 'c'.repeat(64) };
  const wrongFile = resolve(root, 'wrong-basis.json'); writeFileSync(wrongFile, JSON.stringify(wrongBasis) + '\n');
  const firstOnly = contents(root); run([wrongFile], false); assert.deepEqual(contents(root), firstOnly);
});
