/* A sheet to judge fitted presets by: for each style, its free font (top), the preset before the fit, and the
   preset now, set in the same line.
     node --import tsx tools/fit/sheet.ts [ids...]      writes .tools/out/fit/sheet.png */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildFont } from '../../shared/engine';
import { STYLES } from '../../shared/content';
import { STYLE_FONTS } from '../../shared/free-fonts';
import { rowsPNG, type Row } from '../lib';
import { freeParams, SCRATCH } from './lib';

const only = process.argv.slice(2), text = 'Hamburgefonstiv RAGE Qy';
const rows: Row[] = [];
for (const st of STYLES.filter(s => STYLE_FONTS[s.id] && (!only.length || only.includes(s.id)))) {
  const fj = `${SCRATCH}/${st.id}.fit.json`, before = existsSync(fj) ? JSON.parse(readFileSync(fj, 'utf8')).start : st.params;
  rows.push({ font: buildFont(await freeParams(st.id)), text }, { font: buildFont(before), text }, { font: buildFont(st.params), text });
}
writeFileSync(`${SCRATCH}/sheet.png`, rowsPNG(rows, 28, 10));
console.log(`${SCRATCH}/sheet.png`);
