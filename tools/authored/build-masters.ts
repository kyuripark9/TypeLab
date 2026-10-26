/* Publish initial packages, or exact basis revisions with --derived package.json binding.json. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
import type { MasterInfo } from '../../shared/source/master-catalog';
import { parseSourceRef, type MasterSourceRef } from '../../shared/source/model';
import { SOURCE_REVISIONS } from '../../shared/source/catalog';
import { decodeMasterSubdivision, parseMasterSubdivision } from '../../shared/source/subdivision';

const root = process.env.TYPELAB_PUBLICATION_ROOT ? resolve(process.env.TYPELAB_PUBLICATION_ROOT) : fileURLToPath(new URL('../..', import.meta.url));
const dir = resolve(root, 'fonts/masters');
const manifest = resolve(dir, 'manifest.json'), check = process.argv.includes('--check');
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
function readEntries(input: unknown): MasterInfo[] {
  if (!Array.isArray(input)) throw Error('Invalid master manifest');
  return input.map(input => {
    if (!input || typeof input !== 'object') throw Error('Invalid master entry');
    const v = Object.fromEntries(Object.entries(input));
    const ref = parseSourceRef(v.ref), source = parseSourceRef(v.source);
    if (ref?.kind !== 'masters-v1' || source?.kind !== 'outline-v1'
      || typeof v.min !== 'number' || typeof v.max !== 'number' || typeof v.defaultWeight !== 'number') throw Error('Invalid master entry');
    return { ref, source, min: v.min, max: v.max, defaultWeight: v.defaultWeight };
  });
}
const entries = existsSync(manifest) ? readEntries(JSON.parse(readFileSync(manifest, 'utf8'))) : [];
type Publication = { kind: 'initial'; file: string } | { kind: 'derived'; file: string; mapping: string };
const jobs: Publication[] = [], args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--check') continue;
  if (arg === '--derived') {
    const file = args[++i], mapping = args[++i];
    if (!file || !mapping || file.startsWith('--') || mapping.startsWith('--')) throw Error('--derived needs a package and its exact subdivision binding');
    jobs.push({ kind: 'derived', file, mapping });
  } else {
    if (arg.startsWith('--')) throw Error(`Unknown option: ${arg}`);
    jobs.push({ kind: 'initial', file: arg });
  }
}
const staged = new Map<string, string>();
const bytesFor = (digest: string) => staged.get(digest) ?? readFileSync(resolve(dir, digest + '.json'), 'utf8');
function published(ref: MasterSourceRef) {
  if (!entries.some(e => e.ref.digest === ref.digest && e.ref.fontId === ref.fontId)) throw Error('Subdivision parent must already be published');
  const bytes = bytesFor(ref.digest);
  if (hash(bytes) !== ref.digest) throw Error(`Master integrity check failed: ${ref.digest}`);
  return { ref, masters: decodeWeightMasters(parseWeightMasters(JSON.parse(bytes))) };
}
for (const job of jobs) {
  const data = parseWeightMasters(JSON.parse(readFileSync(job.file, 'utf8'))), bytes = JSON.stringify(data) + '\n';
  const digest = hash(bytes), target = resolve(dir, digest + '.json');
  const ref: MasterSourceRef = { kind: 'masters-v1', digest, fontId: data.source.fontId };
  if (job.kind === 'derived') {
    const mapping = parseMasterSubdivision(JSON.parse(readFileSync(job.mapping, 'utf8')));
    if (mapping.to.digest !== digest || mapping.to.fontId !== ref.fontId) throw Error('Subdivision must pin the exact new master package');
    decodeMasterSubdivision(mapping, { from: published(mapping.from), to: { ref, masters: decodeWeightMasters(data) } });
  } else if (!entries.some(e => e.ref.digest === digest) && entries.some(e => e.ref.fontId === ref.fontId)) {
    throw Error('A revised master basis requires --derived with an exact subdivision binding');
  }
  if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) throw Error(`Immutable master was changed: ${digest}`);
  if (check && !existsSync(target)) throw Error(`Missing master snapshot: ${digest}`);
  staged.set(digest, bytes);
  if (!entries.some(e => e.ref.digest === digest)) entries.push({
    ref, source: data.source,
    min: data.masters[0].weight, max: data.masters[data.masters.length - 1].weight, defaultWeight: data.defaultWeight
  });
}
for (const entry of entries) {
  const bytes = bytesFor(entry.ref.digest);
  if (hash(bytes) !== entry.ref.digest) throw Error(`Master integrity check failed: ${entry.ref.digest}`);
  const data = parseWeightMasters(JSON.parse(bytes));
  if (!SOURCE_REVISIONS.some(ref => ref.digest === data.source.digest && ref.fontId === data.source.fontId)
    || entry.source.digest !== data.source.digest || entry.source.fontId !== data.source.fontId
    || data.source.fontId !== entry.ref.fontId || data.defaultWeight !== entry.defaultWeight
    || data.masters[0].weight !== entry.min || data.masters[data.masters.length - 1].weight !== entry.max) throw Error('Master metadata does not match its package');
}
const template = readFileSync(resolve(root, 'shared/source/master-catalog.ts'), 'utf8');
const section = /export const MASTER_REVISIONS: readonly MasterInfo\[\] = [\s\S]*?;\n/;
if (!section.test(template)) throw Error('Master catalog is missing its generated revision section');
const catalog = template.replace(section, `export const MASTER_REVISIONS: readonly MasterInfo[] = ${JSON.stringify(entries, null, 2)};\n`);
if (!check) {
  mkdirSync(dir, { recursive: true });
  for (const [digest, bytes] of staged) {
    const target = resolve(dir, digest + '.json');
    if (!existsSync(target)) writeFileSync(target, bytes, { flag: 'wx' });
  }
}
for (const [file, content] of [[manifest, JSON.stringify(entries, null, 2) + '\n'], [resolve(root, 'shared/source/master-catalog.ts'), catalog]]) {
  if (check) { if (!existsSync(file) || readFileSync(file, 'utf8') !== content) throw Error(`Generated master data needs updating: ${file}`); }
  else writeFileSync(file, content);
}
process.stdout.write(JSON.stringify({ revisions: entries.length, fonts: new Set(entries.map(e => e.ref.fontId)).size, check }) + '\n');
