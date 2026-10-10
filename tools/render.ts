/* Draw text in a design to a PNG or SVG, without the app or a browser.

     npm run render -- --style serif --text "Rag Hamburg" --out .tools/out/serif.png
     npm run render -- --style serif --set weight=0.8 --set serifTip=round --size 400 --text R
     npm run render -- --style didone --free --text Rag             (in the style's free font)
     npm run render -- --params design.typelab.json --text Rag      (a saved design's params)
     npm run render -- --style geometric --sweep weight --text Rag  (one row per eighth, 0 to 1)

   --out defaults to .tools/out/render.png; a .svg name writes SVG. --size is the cap height in pixels. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildFont, OUT, rowsPNG, rowsSVG, styleParams, withSets, type Row } from './lib';
import { DEFAULTS, sanitizeParams, type Params } from '../shared/params';

const { values: a } = parseArgs({
  options: {
    style: { type: 'string' }, params: { type: 'string' }, free: { type: 'boolean', default: false },
    set: { type: 'string', multiple: true, default: [] }, sweep: { type: 'string' },
    text: { type: 'string', default: 'Hamburgefonstiv RAGE Qy' }, size: { type: 'string', default: '96' },
    out: { type: 'string' }
  }
});

let base: Params;
if (a.params) {
  const j = JSON.parse(readFileSync(a.params, 'utf8'));
  base = sanitizeParams(j.params ?? j);
} else base = a.style ? await styleParams(a.style, a.free) : { ...DEFAULTS };
base = withSets(base, a.set!);

const rows: Row[] = [];
if (a.sweep) {
  for (let i = 0; i <= 8; i++) rows.push({ font: buildFont(withSets(base, [`${a.sweep}=${i / 8}`])), text: a.text!, label: `${a.sweep} ${(i / 8).toFixed(3)}` });
} else rows.push({ font: buildFont(base), text: a.text! });

const out = resolve(a.out ?? `${OUT}/render.png`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, out.endsWith('.svg') ? rowsSVG(rows, +a.size!) : rowsPNG(rows, +a.size!));
console.log(out);
