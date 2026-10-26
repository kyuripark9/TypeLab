/* Check authored width grids through exact height maps and render specimens at text and display sizes. */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildFont } from '../../shared/engine';
import type { FreeFont } from '../../shared/engine/free';
import { cmdsBox, cmdsToD } from '../../shared/engine/geom';
import { drawnCmds } from '../../shared/engine/outline';
import { DEFAULTS } from '../../shared/params';
import { sourceDot } from '../../shared/source/features';
import { mapOutline, mapPoint, type OutlineTransform } from '../../shared/source/geometry';
import { rowsPNG, rowsSVG } from '../lib';
import { topology } from './transfer-masters';
import { decodeWidthGrid, interpolateWidthGrid, parseWidthPrototype } from './width-masters';

interface HeightCase { name: string; height: number; lowercase: 'neutral' | 'small' | 'large' }
const CASES: HeightCase[] = [
  { name: 'short', height: .78, lowercase: 'neutral' }, { name: 'tall', height: 1.28, lowercase: 'neutral' },
  { name: 'small lowercase', height: 1, lowercase: 'small' }, { name: 'large lowercase', height: 1, lowercase: 'large' },
];
function projected(font: FreeFont, digest: string, setting: HeightCase): FreeFont {
  const sy = setting.height, xh = setting.lowercase === 'small' ? font.xh * .76
    : setting.lowercase === 'large' ? font.xh + .6 * (font.cap - font.xh) : font.xh;
  const glyphs: FreeFont['glyphs'] = {};
  for (const [ch, glyph] of Object.entries(font.glyphs)) {
    let transform: OutlineTransform = /^[a-z]$/.test(ch) ? { xScale: 1, y: [
      [-font.cap * .4, -font.cap * .4 * sy], [0, 0], [font.xh, xh * sy], [font.cap, (xh + font.cap - font.xh) * sy],
    ] } : { xScale: 1, y: [[0, 0], [font.cap, font.cap * sy]] };
    const dot = sourceDot(digest, ch);
    if (dot) {
      const box = cmdsBox(drawnCmds(dot.contours.flatMap(i => glyph.contours[i] ? [glyph.contours[i]] : [])));
      const from = box?.y0 ?? dot.bottom, to = mapPoint({ x: 0, y: from }, transform).y;
      const [first, second, ...rest] = transform.y;
      transform = { xScale: 1, y: [first, second, ...rest.filter(k => k[0] < from), [from, to], [from + 1, to + sy]] };
    }
    glyphs[ch] = { ...glyph, contours: mapOutline(glyph.contours, transform).contours.map(c => [...c]) };
  }
  return { ...font, cap: font.cap * sy, xh: xh * sy, glyphs };
}
const [input] = process.argv.slice(2);
if (!input) throw Error('Usage: review-width-heights.ts width-prototype.json');
const data = parseWidthPrototype(JSON.parse(readFileSync(input, 'utf8'))), grid = decodeWidthGrid(data), base = buildFont(DEFAULTS);
const allWeights = grid.columns[0].program.masters.map(m => m.weight), first = allWeights[0], last = allWeights[allWeights.length - 1];
const weights = [...new Set([first, data.defaultWeight, (first + last) / 2, last])], widths = grid.columns.map(c => c.width);
let cases = 0;
const failures: { ch: string; weight: number; width: number; setting: string }[] = [];
const rows: Parameters<typeof rowsPNG>[0] = [];
function display(font: FreeFont, sizeCap: number) {
  const boxes = Object.values(font.glyphs).flatMap(g => { const b = cmdsBox(drawnCmds(g.contours)); return b ? [b] : []; });
  return { ...base, m: { ...base.m, cap: sizeCap, asc: Math.max(...boxes.map(b => b.y1)), desc: Math.min(...boxes.map(b => b.y0)) },
    letter() { return this; }, advance(ch: string) { return font.glyphs[ch]?.adv ?? font.space; },
    layout(text: string) { let x = 0; const items = [...text].map(ch => { const adv = font.glyphs[ch]?.adv ?? font.space, item = { ch, adv, x }; x += adv; return item; }); return [{ items, width: x }]; },
    glyph(ch: string) { const d = font.glyphs[ch], g = base.glyph(ch); if (!d || !g) return g;
      const cmds = drawnCmds(d.contours); return { ...g, drawn: d, cmds, d: cmdsToD(cmds), adv: d.adv }; },
  };
}
for (const weight of weights) for (const width of widths) {
  const original = interpolateWidthGrid(grid, weight, width);
  const expected = Object.fromEntries(Object.entries(original.glyphs).map(([ch, g]) => [ch, topology(g.contours)]));
  for (const setting of CASES) {
    const font = projected(original, data.source.digest, setting);
    for (const [ch, glyph] of Object.entries(font.glyphs)) {
      const actual = topology(glyph.contours), before = expected[ch]; cases++;
      if (actual.pieces !== before.pieces || actual.counters !== before.counters) failures.push({ ch, weight, width, setting: setting.name });
    }
    if ((weight === first || weight === last) && (width === data.axis.min || width === data.axis.max)) rows.push({
      label: `${data.base.fontId} weight ${weight}, width ${width}, ${setting.name}`,
      text: 'HnoagRjybdfiqp 0123456789', font: display(font, original.cap),
    });
  }
}
const report = { cases, weights, widths, settings: CASES, failures,
  limitation: 'Offline projection of the current height/x-height mapping with neutral extenders and descender. It is not runtime integration or a new optical height axis.' };
writeFileSync(input + '.heights.json', JSON.stringify(report, null, 2) + '\n');
writeFileSync(input + '.heights.png', rowsPNG(rows, 42)); writeFileSync(input + '.heights.svg', rowsSVG(rows, 42));
writeFileSync(input + '.heights-text.png', rowsPNG(rows, 16));
process.stdout.write(JSON.stringify({ font: data.base.fontId, cases, failures }) + '\n');
if (failures.length) process.exitCode = 1;
