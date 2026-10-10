/* Dead zones: every slider must keep changing the letters all the way to 100. Each numeric setting is swept
   0 to 1 in eighths, in a context where it shows (serifs on for the serif sliders, its form for a stroke end's
   finer shape, ...) on a light and a heavy design, and the letters are drawn; an eighth that moves less than
   1% of the sweep's whole change is reported.

     npm run sweep                    every setting
     npm run sweep -- weight serifCup only these

   Known and kept on purpose: terminalCurl and swash (the curl grows faster toward the ends), contrast turning
   to reverse around 40-50, geoHuman's switch to the single-storey a, and the pixel and dot fills stepping in
   whole cells (module). */
import { buildFont, coverage, showContext, type Row } from './lib';
import { DEFAULTS, type NumericParam, type Params } from '../shared/params';

const TEXT = 'Hamburg AVEFT bdpq ij! Qye 4&';
const KNOWN = new Set(['terminalCurl', 'swash', 'contrast', 'geoHuman', 'module']);

const BASES: [string, Partial<Params>][] = [['light', { weight: 0.25 }], ['heavy', { weight: 0.8 }]];
const only = process.argv.slice(2);
const keys = (Object.keys(DEFAULTS) as (keyof Params)[]).filter(k => typeof DEFAULTS[k] === 'number' && (!only.length || only.includes(k))) as NumericParam[];

let flagged = 0;
for (const k of keys) {
  for (const [bname, base] of BASES) {
    const imgs = Array.from({ length: 9 }, (_, i) => {
      const rows: Row[] = [{ font: buildFont({ ...DEFAULTS, ...base, ...showContext(k), [k]: i / 8 }), text: TEXT }];
      return coverage(rows, 40, 8);
    });
    const W = Math.max(...imgs.map(m => m.w)), H = Math.max(...imgs.map(m => m.h));
    const at = (m: (typeof imgs)[number], x: number, y: number) => (x < m.w && y < m.h ? m.cover[y * m.w + x] : 0);
    const steps = imgs.slice(1).map((m, i) => { let d = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d += Math.abs(at(m, x, y) - at(imgs[i], x, y)); return d; });
    const total = steps.reduce((a, b) => a + b, 0);
    if (!total) { console.log(`${k.padEnd(20)} ${bname.padEnd(6)} no change at all${KNOWN.has(k) ? ' (known)' : ''}`); flagged++; continue; }
    const dead = steps.map((d, i) => (d / total < 0.01 ? `${i * 12.5}-${(i + 1) * 12.5}` : '')).filter(Boolean);
    if (dead.length) { console.log(`${k.padEnd(20)} ${bname.padEnd(6)} dead: ${dead.join(' ')}${KNOWN.has(k) ? ' (known)' : ''}`); if (!KNOWN.has(k)) flagged++; }
  }
}
console.log(flagged ? `${flagged} sweep(s) with dead zones` : `every slider moves the letters all the way (${keys.length} settings)`);
process.exitCode = flagged ? 1 : 0;
