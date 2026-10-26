/* Publish exact basis maps after both immutable weight packages have been published. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
import { parseSourceRef, type MasterSourceRef } from '../../shared/source/model';
import type { SubdivisionRef } from '../../shared/source/program';
import { decodeMasterSubdivision, parseMasterSubdivision } from '../../shared/source/subdivision';

const root = process.env.TYPELAB_PUBLICATION_ROOT ? resolve(process.env.TYPELAB_PUBLICATION_ROOT) : fileURLToPath(new URL('../..', import.meta.url));
const dir = resolve(root, 'fonts/subdivisions'), manifest = resolve(dir, 'manifest.json');
const check = process.argv.includes('--check'), hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
function digests(input: unknown): string[] {
  if (!Array.isArray(input)) throw Error('Invalid subdivision manifest');
  const values = input.map(value => {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw Error('Invalid subdivision manifest digest');
    return value;
  });
  if (new Set(values).size !== values.length) throw Error('Duplicate subdivision manifest entry');
  return values;
}
function masterRefs(input: unknown): MasterSourceRef[] {
  if (!Array.isArray(input)) throw Error('Invalid master manifest');
  return input.map(input => {
    if (!input || typeof input !== 'object' || !('ref' in input)) throw Error('Invalid master manifest entry');
    const ref = parseSourceRef(input.ref);
    if (ref?.kind !== 'masters-v1') throw Error('Invalid published master reference');
    return ref;
  });
}
const entries = existsSync(manifest) ? digests(JSON.parse(readFileSync(manifest, 'utf8'))) : [];
const refs = masterRefs(JSON.parse(readFileSync(resolve(root, 'fonts/masters/manifest.json'), 'utf8')));
function published(ref: MasterSourceRef) {
  if (!refs.some(r => r.digest === ref.digest && r.fontId === ref.fontId)) throw Error('Subdivision bases must already be published');
  const bytes = readFileSync(resolve(root, 'fonts/masters', ref.digest + '.json'));
  if (hash(bytes) !== ref.digest) throw Error(`Master integrity check failed: ${ref.digest}`);
  return { ref, masters: decodeWeightMasters(parseWeightMasters(JSON.parse(bytes.toString()))) };
}
const staged = new Map<string, string>(), publishedRefs: SubdivisionRef[] = [];
for (const file of process.argv.slice(2).filter(arg => arg !== '--check')) {
  if (file.startsWith('--')) throw Error(`Unknown option: ${file}`);
  const data = parseMasterSubdivision(JSON.parse(readFileSync(file, 'utf8')));
  const bytes = JSON.stringify(data) + '\n', digest = hash(bytes), target = resolve(dir, digest + '.json');
  if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) throw Error(`Immutable subdivision was changed: ${digest}`);
  if (check && !existsSync(target)) throw Error(`Missing subdivision snapshot: ${digest}`);
  staged.set(digest, bytes);
  if (!entries.includes(digest)) entries.push(digest);
}
for (const digest of entries) {
  const bytes = staged.get(digest) ?? readFileSync(resolve(dir, digest + '.json'), 'utf8');
  if (hash(bytes) !== digest) throw Error(`Subdivision integrity check failed: ${digest}`);
  const data = parseMasterSubdivision(JSON.parse(bytes));
  decodeMasterSubdivision(data, { from: published(data.from), to: published(data.to) });
  publishedRefs.push({ kind: 'master-subdivision-v1', digest, fontId: data.to.fontId });
}
const contents = JSON.stringify(entries, null, 2) + '\n';
if (check) {
  if (!existsSync(manifest) || readFileSync(manifest, 'utf8') !== contents) throw Error('Generated subdivision manifest needs updating');
} else {
  mkdirSync(dir, { recursive: true });
  for (const [digest, bytes] of staged) {
    const target = resolve(dir, digest + '.json');
    if (!existsSync(target)) writeFileSync(target, bytes, { flag: 'wx' });
  }
  writeFileSync(manifest, contents);
}
process.stdout.write(JSON.stringify({ revisions: publishedRefs, check }) + '\n');
