/* Publish one validated original-outline map per exact original/first-master pair. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeFreeFont } from '../../shared/engine/free';
import { parseSourceData } from '../../shared/source/data';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
import { parseSourceRef, type OutlineSourceRef } from '../../shared/source/model';
import type { MasterInfo } from '../../shared/source/master-catalog';
import type { OriginMapInfo } from '../../shared/source/origin-catalog';
import { decodeOutlineMasterMap, parseOutlineMasterMap } from '../../shared/source/outline-master-map';

const root = process.env.TYPELAB_PUBLICATION_ROOT ? resolve(process.env.TYPELAB_PUBLICATION_ROOT) : fileURLToPath(new URL('../..', import.meta.url));
const directory = resolve(root, 'fonts/origins'), manifest = resolve(directory, 'manifest.json');
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid publication manifest object');
  return Object.fromEntries(Object.entries(input));
}
function entries(input: unknown): OriginMapInfo[] {
  if (!Array.isArray(input)) throw new TypeError('Invalid origin-map manifest');
  return input.map(input => {
    const value = object(input), ref = object(value.ref), from = parseSourceRef(value.from), to = parseSourceRef(value.to);
    if (ref.kind !== 'outline-master-map-v1' || typeof ref.digest !== 'string' || !/^[a-f0-9]{64}$/.test(ref.digest)
      || from?.kind !== 'outline-v1' || to?.kind !== 'masters-v1' || from.fontId !== to.fontId || ref.fontId !== from.fontId) throw new TypeError('Invalid origin-map manifest entry');
    return { ref: { kind: ref.kind, digest: ref.digest, fontId: from.fontId }, from, to };
  });
}
function masters(input: unknown): Pick<MasterInfo, 'ref' | 'source'>[] {
  if (!Array.isArray(input)) throw new TypeError('Invalid master manifest');
  return input.map(input => {
    const value = object(input), ref = parseSourceRef(value.ref), source = parseSourceRef(value.source);
    if (ref?.kind !== 'masters-v1' || source?.kind !== 'outline-v1' || ref.fontId !== source.fontId) throw new TypeError('Invalid master manifest entry');
    return { ref, source };
  });
}
function sources(input: unknown): OutlineSourceRef[] {
  const value = object(input), revisions = object(value.revisions);
  return Object.entries(revisions).map(([digest, input]) => {
    const value = object(input), ref = parseSourceRef({ kind: 'outline-v1', digest, fontId: value.fontId });
    if (ref?.kind !== 'outline-v1') throw new TypeError('Invalid source manifest entry');
    return ref;
  });
}
const check = process.argv.includes('--check'), files: string[] = [], args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--check') continue;
  if (arg === '--from') {
    const path = args[++i];
    if (!path || path.startsWith('--')) throw new Error('--from needs a candidate directory');
    files.push(...readdirSync(path).filter(name => name.endsWith('.json') && name !== 'manifest.json').sort().map(name => resolve(path, name)));
  } else {
    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    files.push(arg);
  }
}
const published = existsSync(manifest) ? entries(JSON.parse(readFileSync(manifest, 'utf8'))) : [];
const masterEntries = masters(JSON.parse(readFileSync(resolve(root, 'fonts/masters/manifest.json'), 'utf8')));
const sourceEntries = sources(JSON.parse(readFileSync(resolve(root, 'fonts/sources/manifest.json'), 'utf8')));
const staged = new Map<string, string>();
for (const file of files) {
  const data = parseOutlineMasterMap(JSON.parse(readFileSync(file, 'utf8'))), bytes = JSON.stringify(data) + '\n', digest = hash(bytes);
  const entry: OriginMapInfo = { ref: { kind: 'outline-master-map-v1', digest, fontId: data.from.fontId }, from: data.from, to: data.to };
  const existing = published.find(e => e.from.digest === data.from.digest && e.to.digest === data.to.digest && e.from.fontId === data.from.fontId);
  if (existing && existing.ref.digest !== digest) throw new Error('An original/first-master pair already has a different immutable map');
  staged.set(digest, bytes);
  if (!existing) published.push(entry);
}
function snapshot(kind: 'sources' | 'masters', digest: string): unknown {
  const bytes = readFileSync(resolve(root, 'fonts', kind, digest + '.json'), 'utf8');
  if (hash(bytes) !== digest) throw new Error(`Snapshot integrity check failed: ${kind}/${digest}`);
  return JSON.parse(bytes);
}
const pairs = new Set<string>(), digests = new Set<string>();
for (const entry of published) {
  const pair = entry.from.digest + ':' + entry.to.digest + ':' + entry.from.fontId;
  if (pairs.has(pair) || digests.has(entry.ref.digest)) throw new Error('Duplicate origin-map manifest entry');
  pairs.add(pair); digests.add(entry.ref.digest);
  const path = resolve(directory, entry.ref.digest + '.json'), bytes = staged.get(entry.ref.digest) ?? readFileSync(path, 'utf8');
  if (hash(bytes) !== entry.ref.digest) throw new Error('Origin-map integrity check failed');
  if (existsSync(path) && readFileSync(path, 'utf8') !== bytes) throw new Error('Immutable origin-map bytes changed');
  if (check && !existsSync(path)) throw new Error('Missing published origin map');
  const data = parseOutlineMasterMap(JSON.parse(bytes));
  if (JSON.stringify(data) + '\n' !== bytes) throw new Error('Origin-map bytes must be canonical');
  if (data.from.digest !== entry.from.digest || data.to.digest !== entry.to.digest
    || data.from.fontId !== entry.ref.fontId || data.to.fontId !== entry.ref.fontId) throw new Error('Origin-map manifest differs from its payload');
  const first = masterEntries.find(m => m.source.digest === data.from.digest && m.source.fontId === data.from.fontId);
  if (!first || first.ref.digest !== data.to.digest) throw new Error('An origin map must target the first published master for its original outline');
  if (!sourceEntries.some(s => s.digest === data.from.digest && s.fontId === data.from.fontId)) throw new Error('Original outline must already be published');
  decodeOutlineMasterMap(data, {
    from: { ref: data.from, font: decodeFreeFont(parseSourceData(snapshot('sources', data.from.digest))) },
    to: { ref: data.to, masters: decodeWeightMasters(parseWeightMasters(snapshot('masters', data.to.digest))) },
  });
}
const catalogFile = resolve(root, 'shared/source/origin-catalog.ts'), template = readFileSync(catalogFile, 'utf8');
const section = /export const ORIGIN_MAP_REVISIONS: readonly OriginMapInfo\[\] = [\s\S]*?;\n/;
if (!section.test(template)) throw new Error('Origin catalog is missing its generated revision section');
const catalog = template.replace(section, `export const ORIGIN_MAP_REVISIONS: readonly OriginMapInfo[] = ${JSON.stringify(published, null, 2)};\n`);
const manifestBytes = JSON.stringify(published, null, 2) + '\n';
if (check) {
  if (!existsSync(manifest) || readFileSync(manifest, 'utf8') !== manifestBytes || template !== catalog) throw new Error('Generated origin-map catalog needs updating');
} else {
  mkdirSync(directory, { recursive: true });
  for (const [digest, bytes] of staged) {
    const path = resolve(directory, digest + '.json');
    if (!existsSync(path)) writeFileSync(path, bytes, { flag: 'wx' });
  }
  writeFileSync(manifest, manifestBytes); writeFileSync(catalogFile, catalog);
}
process.stdout.write(JSON.stringify({ revisions: published.length, check }) + '\n');
