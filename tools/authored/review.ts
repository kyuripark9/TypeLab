/** Render original source coverage and height edits at a shared scale, without a browser or font downloads. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { styleById } from '../../shared/content';
import { CHARSET, buildFont, type Font } from '../../shared/engine';
import { DEFAULTS, freeAtOf, type Params } from '../../shared/params';
import { sourceForFont } from '../../shared/source/catalog';
import { loadSource } from '../../server/sources';
import { rowsPNG, rowsSVG, type Row } from '../lib';

const { values } = parseArgs({ options: { out: { type: 'string', default: '.tools/out/authored-review' } } });
const output = resolve(values.out ?? '.tools/out/authored-review');
mkdirSync(output, { recursive: true });

// rowsPNG scales by cap height. This display copy keeps every specimen at 56 pixels per 700 source units.
const display = (font: Font): Font => ({ ...font, m: { ...font.m, cap: 700 } });
const cases: { label: string; changes: Partial<Params> }[] = [
  { label: 'Original source', changes: {} },
  { label: 'Height 0', changes: { height: 0 } },
  { label: 'Height 1', changes: { height: 1 } },
  { label: 'Lowercase height 0', changes: { xHeight: 0 } },
  { label: 'Lowercase height 1', changes: { xHeight: 1 } },
  { label: 'Lowercase height 1, stem length 0, descender length 0', changes: { xHeight: 1, extenders: 0, descender: 0 } },
  { label: 'Lowercase height 0, stem length 1, descender length 1', changes: { xHeight: 0, extenders: 1, descender: 1 } },
];

const reports = [];
for (const [styleId, fontId] of [['grotesque', 'Mainline:600'], ['softslab', 'Hearth:600'], ['didone', 'Couture:600']]) {
  const style = styleById(styleId), ref = sourceForFont(fontId);
  if (!style || !ref) throw Error(`Missing style source: ${styleId}`);
  loadSource(ref);
  const params: Params = {
    ...style.params, freeFont: fontId, sourceProgram: ref, freeAt: freeAtOf(style.params),
    height: DEFAULTS.height, letterSpacing: DEFAULTS.letterSpacing, wordSpacing: DEFAULTS.wordSpacing,
  };
  const font = buildFont(params);
  const alphabet = Object.entries(CHARSET).map(([label, text]): Row => ({ font: display(font), text, label: `${fontId} ${label}` }));
  const heights = cases.map(({ label, changes }): Row => ({
    font: display(buildFont({ ...params, ...changes })), text: 'HhbnopqgRyjuic 012 &?', label,
  }));
  for (const [kind, rows] of [['alphabet', alphabet], ['heights', heights]] satisfies [string, Row[]][]) {
    writeFileSync(resolve(output, `${styleId}-${kind}.svg`), rowsSVG(rows, 56));
    writeFileSync(resolve(output, `${styleId}-${kind}.png`), rowsPNG(rows, 56));
  }
  reports.push({ style: styleId, source: ref, glyphs: Object.values(CHARSET).join('').length, heightRows: cases.map(({ label }) => label) });
}
writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify({ pixelsPer700Units: 56, reports }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output, sources: reports.length, images: reports.length * 2, formats: ['svg', 'png'] })}\n`);
