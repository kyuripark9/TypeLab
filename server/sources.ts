/* Read immutable original fonts by digest. Both the browser and export workers use these bytes. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SOURCE_REVISIONS } from '../shared/source/catalog';
import { parseSourceData } from '../shared/source/data';
import { registerSource } from '../shared/source/registry';
import type { SourceRef } from '../shared/source/model';
import type { FreeFontData } from '../shared/engine/free';
import { ownLicense } from '../shared/free-fonts';

const cached = new Map<string, FreeFontData>();

export function loadSource(ref: SourceRef): FreeFontData {
  const kept = cached.get(ref.digest);
  if (kept) {
    if (kept.id !== ref.fontId) throw new Error('Source reference does not match its font');
    return kept;
  }
  if (!SOURCE_REVISIONS.some(r => r.digest === ref.digest && r.fontId === ref.fontId)) throw new Error('This saved source is unavailable');
  const bytes = readFileSync(new URL(`../fonts/sources/${ref.digest}.json`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== ref.digest) throw new Error('Source integrity check failed');
  const original = parseSourceData(JSON.parse(bytes.toString())), license = ownLicense();
  const data = { ...original, copyright: license.copyright, license: license.license, licenseUrl: license.licenseUrl,
    licenseText: `${license.lines.join('\n')}\n\n${readFileSync(new URL('../fonts/OFL.txt', import.meta.url), 'utf8').trim()}` };
  if (data.id !== ref.fontId) throw new Error('Source reference does not match its font');
  registerSource(ref, data);
  cached.set(ref.digest, data);
  return data;
}
