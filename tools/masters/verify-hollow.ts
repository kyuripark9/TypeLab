/* Hollow-effect authoring review. Runs sequentially; no program or policy is changed. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { buildFont, ALL_CHARS, type Font, type Glyph } from '../../shared/engine/font';
import { cmdsBox, cmdsToD } from '../../shared/engine/geom';
import { DEFAULTS, freeAtOf, type Params } from '../../shared/params';
import { hollowSource, HollowError } from '../../shared/source/hollow';
import { PROGRAM_REVISIONS } from '../../shared/source/program-catalog';
import { masterInfo } from '../../shared/source/master-catalog';
import { loadSource } from '../../server/sources';
import { rowsPNG, rowsSVG, withSets } from '../lib';
import { cmdsContours, drawnCmds } from '../../shared/engine/outline';
import { reverseContour } from '../../client/lib/pen';

const flags = process.argv.slice(2), all = flags.includes('--all'), render = flags.includes('--render');
const option = (key: string) => { const index = flags.indexOf(key); return index < 0 ? undefined : flags[index + 1]; };
const output = option('--out') ?? '.audit/masters/hollow-production';
const tolerance = Number(option('--tolerance') ?? '.1'), slice = Number(option('--slice') ?? '0');
const settings = option('--set'), reverse = flags.includes('--reverse');
const requested = option('--family'), text = option('--chars') ?? (all ? ALL_CHARS : 'Hgj&');
const offset = Number(option('--from') ?? '0'), limit = Number(option('--limit') ?? '22');
if (![offset, limit].every(n => Number.isInteger(n) && n >= 0)) throw new Error('Invalid family interval');
const latest = [...new Map(PROGRAM_REVISIONS.map(program => [program.ref.fontId, program])).values()];
const programs = latest.filter(p => requested ? p.ref.fontId.startsWith(`${requested}:`)
  : all || ['Mainline:600', 'Couture:600', 'Serenade:400', 'Bulwark:700'].includes(p.ref.fontId)).slice(offset, offset + limit);
if (!programs.length) throw new Error('No matching family');
mkdirSync(output, { recursive: true });
const records: unknown[] = [], failures: unknown[] = [];
for (const program of programs) {
  const info = masterInfo(program.ref); if (!info) throw new Error('Program has no masters');
  loadSource(program.ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min);
  const params: Params = { ...DEFAULTS, freeFont: program.ref.fontId, sourceProgram: program.ref, weight,
    freeAt: { ...freeAtOf(DEFAULTS), weight }, slice, sliceRound: 1 };
  if (program.width) {
    params.width = (program.width.neutral - program.width.min) / (program.width.max - program.width.min);
    params.freeAt.width = params.width;
  }
  const font = buildFont(settings ? withSets(params, [settings]) : params), rows = [{ font, text }], beforeFailures = failures.length;
  for (const size of [0, .5, 1]) {
    const glyphs = new Map<string, Glyph>();
    for (const ch of text) {
      const glyph = font.glyph(ch); if (!glyph) continue;
      const before = JSON.stringify(glyph.editable ?? glyph.drawn), start = performance.now();
      let commands = glyph.cmds;
      if (reverse) {
        let contours = cmdsContours(commands);
        for (let i = 0; i < contours.length; i++) contours = reverseContour(contours, i);
        commands = drawnCmds(contours, true);
      }
      try {
        const result = hollowSource(commands, { rim: font.m.cap * (.006 + .018 * size), tolerance });
        if (JSON.stringify(glyph.editable ?? glyph.drawn) !== before) throw new Error('Hollow mutated source Points');
        if (result.cmds.some(c => c.slice(1).some(n => !Number.isFinite(n)))) throw new Error('Nonfinite hollow output');
        records.push({ family: info.ref.fontId, ch, size, ms: performance.now() - start, commands: result.cmds.length, ...result.diagnostics });
        glyphs.set(ch, { ...glyph, cmds: result.cmds, d: cmdsToD(result.cmds) });
      } catch (error) {
        failures.push({ family: info.ref.fontId, ch, size, ms: performance.now() - start,
          reason: error instanceof HollowError ? error.reason : 'unexpected', message: error instanceof Error ? error.message : String(error) });
      }
    }
    const display: Font = { ...font, glyph: ch => glyphs.get(ch) ?? null, letter: () => display };
    rows.push({ font: display, text });
  }
  // Contact sheets use ink bounds so script overhangs and flourishes remain visible.
  if (render && failures.length === beforeFailures) {
    const name = info.ref.fontId.split(':')[0], chars = [...text];
    for (let page = 0; page * 32 < chars.length; page++) {
      const pageChars = chars.slice(page * 32, page * 32 + 32), specimens: { font: Font; text: string }[] = [];
      for (let start = 0; start < pageChars.length; start += 8) {
        const line = pageChars.slice(start, start + 8).join('');
        let x = 0, above = font.m.asc, below = font.m.desc;
        const items = [...line].map(ch => {
          const bounds = rows.map(row => row.font.glyph(ch)).filter(g => g !== null).map(g => cmdsBox(g.cmds)).filter(b => b !== null);
          const left = Math.min(0, ...bounds.map(b => b.x0)), right = Math.max(font.advance(ch), ...bounds.map(b => b.x1));
          above = Math.max(above, ...bounds.map(b => b.y1)); below = Math.min(below, ...bounds.map(b => b.y0));
          const adv = right - left + font.m.cap * .15, at = x - left; x += adv;
          return { ch, x: at, adv };
        });
        for (const row of rows) {
          const specimen: Font = { ...row.font, m: { ...row.font.m, asc: above, desc: below },
            layout: () => [{ items, width: x }], letter: () => specimen };
          specimens.push({ font: specimen, text: line });
        }
      }
      const suffix = chars.length <= 32 ? '' : `-${page + 1}`;
      writeFileSync(`${output}/${name}${suffix}.svg`, rowsSVG(specimens, all ? 72 : 130, 22));
      writeFileSync(`${output}/${name}${suffix}.png`, rowsPNG(specimens, all ? 72 : 130, 22));
    }
  }
  writeFileSync(`${output}/report.json`, JSON.stringify({ scope: { text, families: programs.map(p => p.ref.fontId), weights: 'default', size: [0, .5, 1], tolerance, slice, settings, reverse }, records, failures }, null, 2));
  console.log(`${info.ref.fontId}: ${records.length} successful cases, ${failures.length} failures (cumulative)`);
}
if (failures.length) process.exitCode = 1;
