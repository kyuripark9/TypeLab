/* Review source finishes against every authored foreground; --all is the bounded catalog pass. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { ALL_CHARS, buildFont, type Font, type Glyph } from '../../shared/engine';
import { shape } from '../../shared/engine/boolean';
import { DEFAULTS, freeAtOf } from '../../shared/params';
import { MASTER_REVISIONS, masterInfo, mastersForFont } from '../../shared/source/master-catalog';
import { compileSourceFinish, finishSourceGlyph, parseSourceFinish, sourceFinishPolygons, type SourceFinishPlan } from '../../shared/source/finish';
import { loadSource } from '../../server/sources';
import { traceOf } from '../../client/lib/pen';
import { rowsPNG, rowsSVG } from '../lib';

const args = process.argv.slice(2), all = args.includes('--all');
const selected = args.find(arg => arg.startsWith('--family='))?.slice('--family='.length);
for (const arg of args) if (arg !== '--all' && !arg.startsWith('--family=')) throw new Error(`Unknown argument ${arg}`);
const families = selected ? [selected] : all ? [...new Set(MASTER_REVISIONS.map(info => info.ref.fontId))] : ['Mainline:600', 'Couture:600', 'Serenade:400'];
const out = process.env.TYPELAB_FINISH_OUT ?? '.audit/masters/finishes';
const policy = parseSourceFinish(JSON.parse(readFileSync(new URL('../authored/source-finishes.json', import.meta.url), 'utf8')));
const specimen = "Hgoij c@& .,:;!?' -_·•", sensitive = "Hgoijc@&.,:;!?'\"-_·•";
mkdirSync(out, { recursive: true });

function finishedFont(base: Font, plan: SourceFinishPlan): Font {
  const cache = new Map<string, Glyph | null>();
  const font: Font = { ...base, m: { ...base.m, desc: base.m.desc + (plan.kind === 'shadow' ? plan.dy : 0) },
    glyph(ch) {
      if (!cache.has(ch)) { const glyph = base.glyph(ch); cache.set(ch, glyph ? finishSourceGlyph(glyph, plan) : null); }
      return cache.get(ch) ?? null;
    },
    letter: () => font,
    advance: ch => ch === ' ' ? font.m.space : font.glyph(ch)?.adv ?? font.m.space,
    layout(text) {
      let x = 0;
      const items = [...text].map(ch => { const adv = font.advance(ch), item = { ch, x, adv }; x += adv + font.m.track; return item; });
      return [{ items, width: x - font.m.track }];
    },
  };
  return font;
}

const report: { policy: typeof policy; families: { fontId: string; cases: number; glyphs: number; ms: number; worstGlyphMs: number; maxCommands: number; warnings: string[] }[] } = { policy, families: [] };
for (const fontId of families) {
  const ref = mastersForFont(fontId), info = masterInfo(ref);
  assert.ok(ref && info, `No reviewed weight family ${fontId}`); loadSource(ref);
  const pick = (info.defaultWeight - info.min) / (info.max - info.min);
  const rows: Parameters<typeof rowsSVG>[0] = [];
  const stats = { fontId, cases: 0, glyphs: 0, ms: 0, worstGlyphMs: 0, maxCommands: 0, warnings: new Array<string>() };
  const weights = all ? [...new Set([info.defaultWeight, info.min, info.max])] : [info.defaultWeight];
  for (const weight of weights) {
    const slider = weight === info.defaultWeight ? pick : weight === info.min ? 0 : 1;
    const base = buildFont({ ...DEFAULTS, sourceProgram: ref, freeFont: fontId, weight: slider, freeAt: { ...freeAtOf(DEFAULTS), weight: pick } });
    if (weight === info.defaultWeight) rows.push({ font: base, text: specimen, label: `${fontId} original` });
    for (const size of [0, 1]) {
      const plan = compileSourceFinish(policy, { fill: 'shadow', module: size }, { capHeight: base.m.cap });
      const finished = finishedFont(base, plan), text: string = all && weight === info.defaultWeight ? ALL_CHARS : sensitive;
      stats.cases++;
      for (const ch of text) {
        const source = base.glyph(ch); if (!source) continue;
        const before = JSON.stringify(source.drawn), start = performance.now(), output = finished.glyph(ch);
        assert.ok(output); const elapsed = performance.now() - start;
        stats.ms += elapsed; stats.worstGlyphMs = Math.max(stats.worstGlyphMs, elapsed);
        stats.glyphs++; stats.maxCommands = Math.max(stats.maxCommands, output.cmds.length);
        for (let i = 0; i < source.cmds.length; i++) assert.equal(output.cmds[i], source.cmds[i], `${fontId} ${ch}: foreground command changed`);
        assert.equal(JSON.stringify(source.drawn), before, `${fontId} ${ch}: source drawing changed`);
        assert.equal(traceOf(output), source.editable ?? source.drawn, `${fontId} ${ch}: Points lost its clean projection`);
        assert.ok(output.cmds.length > source.cmds.length, `${fontId} ${weight} ${ch}: shadow disappeared`);
        for (const command of output.cmds) for (const value of command.slice(1)) assert.ok(typeof value === 'number' && Number.isFinite(value));
        const front = sourceFinishPolygons(source.cmds, policy.tolerance), back = shape(sourceFinishPolygons(output.cmds.slice(source.cmds.length), policy.tolerance));
        assert.ok(front.every(contour => contour.every(point => !back.has(point.x, point.y))), `${fontId} ${ch}: shadow crosses its foreground`);
      }
      if (weight === info.defaultWeight) rows.push({ font: finished, text: specimen, label: `${fontId} shadow ${size === 0 ? 'small' : 'large'}` });
    }
  }
  if (stats.worstGlyphMs > 250) stats.warnings.push('A glyph exceeded the 250 ms interactive review threshold');
  if (stats.maxCommands > 12000) stats.warnings.push('A glyph exceeded the 12,000-command review threshold');
  const stem = fontId.replace(/[^a-zA-Z0-9]+/g, '-');
  writeFileSync(join(out, `${stem}.svg`), rowsSVG(rows, 76, 20));
  writeFileSync(join(out, `${stem}.png`), rowsPNG(rows, 76, 20));
  report.families.push(stats);
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(stats));
}
writeFileSync(join(out, 'policy.json'), `${JSON.stringify(policy, null, 2)}\n`);
