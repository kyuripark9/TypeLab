/* Publish validated weight packages under immutable hashes. Usage: node --import tsx tools/authored/build-masters.ts package.json ... */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWeightMasters } from '../../shared/source/masters';
import type { MasterInfo } from '../../shared/source/master-catalog';
import { parseSourceRef } from '../../shared/source/model';
import { SOURCE_REVISIONS } from '../../shared/source/catalog';

const root = fileURLToPath(new URL('../..', import.meta.url)), dir = resolve(root, 'fonts/masters');
const manifest = resolve(dir, 'manifest.json'), check = process.argv.includes('--check');
if (!check) mkdirSync(dir, { recursive: true });
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
for (const file of process.argv.slice(2).filter(v => v !== '--check')) {
  const data = parseWeightMasters(JSON.parse(readFileSync(file, 'utf8'))), bytes = JSON.stringify(data) + '\n';
  const digest = createHash('sha256').update(bytes).digest('hex'), target = resolve(dir, digest + '.json');
  if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) throw Error(`Immutable master was changed: ${digest}`);
  if (!existsSync(target)) {
    if (check) throw Error(`Missing master snapshot: ${digest}`);
    writeFileSync(target, bytes);
  }
  if (!entries.some(e => e.ref.digest === digest)) entries.push({
    ref: { kind: 'masters-v1', digest, fontId: data.source.fontId }, source: data.source,
    min: data.masters[0].weight, max: data.masters[data.masters.length - 1].weight, defaultWeight: data.defaultWeight
  });
}
for (const entry of entries) {
  const bytes = readFileSync(resolve(dir, entry.ref.digest + '.json'));
  if (createHash('sha256').update(bytes).digest('hex') !== entry.ref.digest) throw Error(`Master integrity check failed: ${entry.ref.digest}`);
  const data = parseWeightMasters(JSON.parse(bytes.toString()));
  if (!SOURCE_REVISIONS.some(ref => ref.digest === data.source.digest && ref.fontId === data.source.fontId)
    || entry.source.digest !== data.source.digest || entry.source.fontId !== data.source.fontId
    || data.source.fontId !== entry.ref.fontId || data.defaultWeight !== entry.defaultWeight
    || data.masters[0].weight !== entry.min || data.masters[data.masters.length - 1].weight !== entry.max) throw Error('Master metadata does not match its package');
}
const template = readFileSync(resolve(root, 'shared/source/master-catalog.ts'), 'utf8');
const catalog = template.replace(/export const MASTER_REVISIONS: readonly MasterInfo\[\] = [\s\S]*?;\n/, `export const MASTER_REVISIONS: readonly MasterInfo[] = ${JSON.stringify(entries, null, 2)};\n`);
for (const [file, content] of [[manifest, JSON.stringify(entries, null, 2) + '\n'], [resolve(root, 'shared/source/master-catalog.ts'), catalog]]) {
  if (check) { if (!existsSync(file) || readFileSync(file, 'utf8') !== content) throw Error(`Generated master data needs updating: ${file}`); }
  else writeFileSync(file, content);
}
process.stdout.write(JSON.stringify({ revisions: entries.length, fonts: new Set(entries.map(e => e.ref.fontId)).size, check }) + '\n');
