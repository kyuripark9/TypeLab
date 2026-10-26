/* Compare translation-only spacing. This produces evidence, not a published capability. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ALL_CHARS, buildFont, type Font, type Glyph, type LineItem } from '../../shared/engine';
import { cmdsToD, transformCmds } from '../../shared/engine/geom';
import { encodedAdvance } from '../../shared/engine/spacing';
import { DEFAULTS, freeAtOf } from '../../shared/params';
import { masterInfo } from '../../shared/source/master-catalog';
import { programForFont, programInfo } from '../../shared/source/program-catalog';
import { loadSource } from '../../server/sources';
import { opentype } from '../../server/opentype';
import { rowsPNG, rowsSVG } from '../lib';

const out = process.env.TYPELAB_MONO_OUT ?? '.audit/masters/mono-design';
const render = process.argv.includes('--render');
for (const arg of process.argv.slice(2)) if (arg !== '--render') throw new Error(`Unknown argument ${arg}`);
mkdirSync(out, { recursive: true });
type Method = 'bearings' | 'ink';
function bounds(glyph: Glyph) {
  const path = new opentype.Path();
  for (const c of glyph.cmds) {
    if (c[0] === 'M') path.moveTo(c[1], c[2]);
    else if (c[0] === 'L') path.lineTo(c[1], c[2]);
    else if (c[0] === 'C') path.curveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
    else if (c[0] === 'Z') path.close();
    else throw new Error(`Unexpected source command ${c[0]}`);
  }
  return path.getBoundingBox();
}
function translate(glyph: Glyph, cell: number, amount: number, method: Method): Glyph {
  if (amount === 0) return glyph;
  const box = bounds(glyph), end = method === 'bearings' ? (cell - glyph.adv) / 2 : (cell - box.x2 - box.x1) / 2;
  const dx = end * amount, adv = glyph.adv + (cell - glyph.adv) * amount;
  const cmds = transformCmds(glyph.cmds, [1, 0, 0, 1, dx, 0]);
  for (let i = 0; i < cmds.length; i++) {
    assert.equal(cmds[i][0], glyph.cmds[i][0]);
    for (let j = 1; j < cmds[i].length; j++) assert.ok(Math.abs(cmds[i][j] - glyph.cmds[i][j] - (j % 2 ? dx : 0)) < 1e-9);
  }
  return { ...glyph, cmds, d: cmdsToD(cmds), adv, lsb: glyph.lsb + dx, rsb: glyph.rsb + adv - glyph.adv - dx };
}
function display(base: Font, cell: number, amount: number, method: Method): Font {
  const cache = new Map<string, Glyph | null>(), space = base.m.space + (cell - base.m.space) * amount;
  const font: Font = { ...base, m: { ...base.m, space },
    glyph(ch) {
      if (!cache.has(ch)) { const glyph = base.glyph(ch); cache.set(ch, glyph ? translate(glyph, cell, amount, method) : null); }
      return cache.get(ch) ?? null;
    },
    letter: () => font,
    advance: ch => ch === ' ' || ch === '\u00a0' ? space : font.glyph(ch)?.adv ?? space,
    layout(text, maxWidth) {
      assert.equal(maxWidth, Infinity, 'Prototype specimens use a single line');
      let x = 0;
      const items: LineItem[] = [...text].map(ch => {
        const item = { ch, x, adv: font.advance(ch) };
        x += encodedAdvance(item.adv, font.m.track, ch === ' ' || ch === '\u00a0'); return item;
      });
      const last = items.at(-1);
      return [{ items, width: last ? last.x + last.adv : 0 }];
    }
  };
  return font;
}

const report = [];
for (const fontId of ['Mainline:600', 'Couture:600', 'Serenade:400', 'Dispatch:400', 'Kernel:500']) {
  const ref = programForFont(fontId), info = masterInfo(ref), width = programInfo(ref)?.width; assert.ok(ref && info); loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min), neutral = width ? (width.neutral - width.min) / (width.max - width.min) : DEFAULTS.width;
  const base = buildFont({ ...DEFAULTS, sourceProgram: ref, freeFont: fontId, weight, width: neutral,
    freeAt: { ...freeAtOf(DEFAULTS), weight, width: neutral } });
  const glyphs = [...ALL_CHARS].map(ch => base.glyph(ch)).filter((glyph): glyph is Glyph => glyph !== null);
  const padding = base.m.cap * .04;
  const sorted = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'].map(ch => base.advance(ch)).sort((a, b) => a - b);
  const median = (sorted[25] + sorted[26]) / 2, text = "iii WWW mmm 012 .,:;!'";
  const rows: Parameters<typeof rowsSVG>[0] = [], methods = [];
  for (const method of ['bearings', 'ink'] satisfies Method[]) {
    const cell = Math.ceil(Math.max(base.m.space, ...glyphs.map(g => {
      const box = bounds(g), occupied = method === 'bearings' ? 2 * Math.max(g.adv / 2 - box.x1, box.x2 - g.adv / 2) : box.x2 - box.x1;
      return Math.max(g.adv, occupied + 2 * padding);
    })));
    let cases = 0;
    for (const amount of [0, .5, 1]) {
      const font = display(base, cell, amount, method);
      for (const glyph of glyphs) {
        const result = font.glyph(glyph.ch); assert.ok(result); cases++;
        if (amount === 0) assert.strictEqual(result, glyph);
        else if (amount === 1) {
          const box = bounds(result);
          assert.equal(result.adv, cell);
          assert.ok(box.x1 >= padding - 1e-8 && box.x2 <= cell - padding + 1e-8);
        }
      }
      if (amount === 1) assert.equal(font.advance(' '), cell);
      rows.push({ font, text, label: `${fontId} ${method}, Mono ${amount}, cell ${cell}` });
    }
    methods.push({ method, cell, cellToMedian: cell / median, cases });
  }
  report.push({ fontId, originalEqualAdvances: glyphs.every(g => g.adv === base.m.space), originalSpace: base.m.space, methods });
  if (render) {
    const stem = fontId.replace(/[^a-zA-Z0-9]+/g, '-');
    writeFileSync(`${out}/${stem}.svg`, rowsSVG(rows, 42, 16));
    writeFileSync(`${out}/${stem}.png`, rowsPNG(rows, 42, 16));
  }
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ out, render, report }, null, 2));
