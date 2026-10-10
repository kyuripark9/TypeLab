/* Settle each fit's letter forms on the letters they shape: g (gForm), Q (qForm), a (story, aForm). A form is
   switched where its letter matches the free font clearly better.
     node --import tsx tools/fit/forms.ts [ids...] */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { buildFont } from '../../shared/engine';
import { freeParams, refImages, glyphScore, SCRATCH } from './lib';
const FORMS: [string, string, unknown[]][] = [['gForm', 'g', ['hook', 'double']], ['qForm', 'Q', ['crossing', 'sweep', 'inside']], ['story', 'a', ['double', 'single']]];
const GAIN = 0.03;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(SCRATCH).filter(f => f.endsWith('.fit.json')).map(f => f.replace('.fit.json', ''));
for (const id of ids) {
  const file = `${SCRATCH}/${id}.fit.json`, d = JSON.parse(readFileSync(file, 'utf8'));
  const ref = refImages(buildFont(await freeParams(id)), 'gQa');
  const moved: string[] = [];
  for (const [k, ch, opts] of FORMS) {
    if (!ref[ch]) continue;
    const cur = d.global[k], at = (v: unknown) => glyphScore(ref[ch], buildFont({ ...d.global, [k]: v }), ch);
    let best = cur, bs = at(cur);
    for (const v of opts) if (v !== cur) { const s = at(v); if (s < bs - GAIN) { best = v; bs = s; } }
    if (best !== cur) { moved.push(`${k} ${cur}→${best}`); d.global[k] = best; d.changed[k] = [d.changed[k]?.[0] ?? cur, best]; }
  }
  if (moved.length) { d.log.push('forms: ' + moved.join(', ')); writeFileSync(file, JSON.stringify(d, null, 1)); }
  console.log(id.padEnd(14), moved.join(', '));
}
