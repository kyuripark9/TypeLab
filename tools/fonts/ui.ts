/* The interface's own logo face: the logo is set in a design made in TypeLab, Lineup, exported by the same engine as
   any font:
     npm run fonts:ui [-- design.typelab.json] [--out client/fonts/Lineup.otf]
   reads the design file (Export: Design file; by default Asset/lineup.typelab.json) and writes its letters as one
   .otf that client/styles.css loads as "TypeLab Lineup". Run it again after the design changes; every other word is
   Switzer. */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildOTF } from '../../server/export';
import { sanitizeParams, upgradeParams } from '../../shared/params';

const args = process.argv.slice(2);
const at = args.indexOf('--out');
const out = at >= 0 ? args[at + 1] : 'client/fonts/Lineup.otf';
const src = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out') ?? 'Asset/lineup.typelab.json';

const file = JSON.parse(readFileSync(src, 'utf8'));
// a design file carries the version its settings were written in, as the editor's import reads it
const params = sanitizeParams(upgradeParams(file.params, typeof file.version === 'number' ? file.version : 1));
const otf = buildOTF(params, file.name ?? 'Lineup');
writeFileSync(out, otf);
console.log(`${out}: ${file.name} (${file.styleId}), ${otf.length} bytes`);
