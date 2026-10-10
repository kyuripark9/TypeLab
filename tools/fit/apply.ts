/* Write each style's fitted settings into the styles file (only those that differ from DEFAULTS), with word
   spacing matched to the free font's space.
     node --import tsx tools/fit/apply.ts [ids...] */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildFont } from '../../shared/engine';
import { DEFAULTS } from '../../shared/params';
import { STYLES } from '../../shared/content';
import { SCRATCH } from './lib';
import { ROOT, styleParams } from '../lib';
const FILE = `${ROOT}/shared/content/styles.ts`;
let src = readFileSync(FILE, 'utf8');
const only = process.argv.slice(2);
const r3 = (v: unknown) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
const lit = (v: unknown) => typeof v === 'string' ? `'${v}'` : JSON.stringify(v);
let done = 0;
for (const st of STYLES) {
  if (only.length && !only.includes(st.id)) continue;
  const fj = `${SCRATCH}/${st.id}.fit.json`;
  if (!existsSync(fj)) continue;
  const fit = JSON.parse(readFileSync(fj, 'utf8')).global;
  // word spacing: the engine's space as wide (in cap heights) as the free font's, written in it
  const free = buildFont(await styleParams(st.id, true)), want = free.m.space / free.m.cap;
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2, f = buildFont({ ...fit, wordSpacing: mid }); if (f.m.space / f.m.cap < want) lo = mid; else hi = mid; }
  fit.wordSpacing = (lo + hi) / 2;
  // (joined-up scripts keep their words as far apart, in x-heights, as the style had them, where the letters run
  // into each other)
  if (st.params.cursive >= 0.5) {
    const own = buildFont(st.params), keep = own.m.space / own.m.xh;
    lo = 0; hi = 1;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2, f = buildFont({ ...fit, wordSpacing: mid }); if (f.m.space / f.m.xh < keep) lo = mid; else hi = mid; }
    fit.wordSpacing = Math.max(fit.wordSpacing, (lo + hi) / 2);
  }
  // the style's call: style('id', ... , { params }),
  const at = src.indexOf(`style('${st.id}',`);
  if (at < 0) { console.log('no style', st.id); continue; }
  // the params object is the last argument: the first '{' after the description string, to its match
  let depth = 0, quote = '', start = -1, end = -1;
  // (the arguments before it are strings and arrays of strings, so the first '{' outside quotes opens it)
  for (let k = at + 6; k < src.length; k++) {
    const c = src[k];
    if (quote) { if (c === '\\') { k++; continue; } if (c === quote) quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') { if (depth === 0 && start < 0) start = k; depth++; }
    else if (c === '}') { depth--; if (depth === 0 && start >= 0) { end = k; break; } }
  }
  const old = src.slice(start, end + 1);
  // keys in the order the style had them, then the rest, as the fit left them where they differ from the defaults
  const oldKeys = [...old.matchAll(/(\w+):/g)].map(m => m[1]).filter(k => k in DEFAULTS);
  const keys = [...new Set([...oldKeys, ...Object.keys(DEFAULTS)])].filter(k => k !== 'glyphs' && k !== 'outlines' && k !== 'freeAt' && k !== 'freeFont');
  const parts = keys.filter(k => JSON.stringify(r3(fit[k])) !== JSON.stringify((DEFAULTS as any)[k]) && fit[k] !== undefined).map(k => `${k}: ${lit(r3(fit[k]))}`);
  // wrapped as the file has them: four spaces in, lines under 150 characters
  const lines: string[] = []; let cur = '';
  for (const p of parts) { if (cur && (cur + ', ' + p).length > 140) { lines.push(cur + ','); cur = p; } else cur = cur ? cur + ', ' + p : p; }
  if (cur) lines.push(cur);
  // the style's own letters (glyphs: { ... }) as written
  const gi = old.indexOf('glyphs:');
  if (gi >= 0) {
    let k = old.indexOf('{', gi), dp = 0, e = k;
    for (; e < old.length; e++) { if (old[e] === '{') dp++; else if (old[e] === '}' && --dp === 0) break; }
    lines.push(old.slice(gi, e + 1).replace(/\s*\n\s*/g, ' '));
    if (lines.length > 1) lines[lines.length - 2] += ',';
  }
  const neu = '{ ' + lines.join('\n      ') + ' }';
  src = src.slice(0, start) + neu + src.slice(end + 1);
  done++;
}
writeFileSync(FILE, src);
console.log('applied', done);
