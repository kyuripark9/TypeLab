/* Compare Slice meanings before pinning a source policy. No runtime capability is enabled here. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildFont, type Font, type Glyph } from '../../shared/engine';
import { cutOut } from '../../shared/engine/boolean';
import { slice } from '../../shared/engine/effects';
import { cmdsBox, cmdsToD, transformCmds } from '../../shared/engine/geom';
import { cmdsContours, drawnCmds, type Node } from '../../shared/engine/outline';
import { DEFAULTS, freeAtOf } from '../../shared/params';
import { masterInfo, mastersForFont } from '../../shared/source/master-catalog';
import { loadSource } from '../../server/sources';
import { rowsPNG, rowsSVG } from '../lib';

const out = '.audit/masters/slice-design', text = "Hgoij c@& .,:;!?' -_·•";
mkdirSync(out, { recursive: true });
const rectangle = (x0: number, y0: number, x1: number, y1: number): Node[][] => [[
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }
]];
type Method = 'polygon' | 'band' | 'opened';
function prototype(glyph: Glyph, y: number, gap: number, method: Method): Glyph {
  const box = cmdsBox(glyph.cmds); if (!box) return glyph;
  const contours = cmdsContours(glyph.cmds), x0 = box.x0 - 1, x1 = box.x1 + 1;
  const cmds = method === 'polygon' ? slice(glyph.cmds, y - gap / 2, y + gap / 2, 0, 0, 0)
    : method === 'band' ? drawnCmds(cutOut(contours, rectangle(x0, y - gap / 2, x1, y + gap / 2)))
    : [
      ...drawnCmds(cutOut(contours, rectangle(x0, y, x1, box.y1 + 1))),
      ...transformCmds(drawnCmds(cutOut(contours, rectangle(x0, box.y0 - 1, x1, y))), [1, 0, 0, 1, 0, gap])
    ];
  return { ...glyph, cmds, d: cmdsToD(cmds) };
}
function display(base: Font, method: Method, gap: number, y: number): Font {
  const cache = new Map<string, Glyph | null>();
  const font: Font = { ...base,
    glyph(ch) {
      if (!cache.has(ch)) { const glyph = base.glyph(ch); cache.set(ch, glyph ? prototype(glyph, y, gap, method) : null); }
      return cache.get(ch) ?? null;
    }, letter: () => font
  };
  return font;
}
for (const fontId of ['Mainline:600', 'Couture:600', 'Serenade:400']) {
  const ref = mastersForFont(fontId), info = masterInfo(ref); assert.ok(ref && info); loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min);
  const font = buildFont({ ...DEFAULTS, sourceProgram: ref, weight, freeAt: { ...freeAtOf(DEFAULTS), weight } });
  const rows: Parameters<typeof rowsSVG>[0] = [{ font, text, label: fontId }];
  for (const position of [.18, .5]) for (const method of ['polygon', 'band', 'opened'] satisfies Method[]) {
    rows.push({ font: display(font, method, font.m.cap * .14, font.m.cap * position), text, label: `${method} at ${position}` });
  }
  const stem = fontId.replace(/[^a-zA-Z0-9]+/g, '-');
  writeFileSync(`${out}/${stem}.svg`, rowsSVG(rows, 62, 16));
  writeFileSync(`${out}/${stem}.png`, rowsPNG(rows, 62, 16));
}
