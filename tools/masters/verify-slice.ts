/* Verify opened Slice on authored glyphs; --all covers the catalog and weight endpoints. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ALL_CHARS, buildFont, cmdsBox, type Font, type Glyph } from '../../shared/engine';
import { shape } from '../../shared/engine/boolean';
import type { Pt } from '../../shared/engine/types';
import { DEFAULTS, freeAtOf } from '../../shared/params';
import { MASTER_REVISIONS, masterInfo, mastersForFont } from '../../shared/source/master-catalog';
import { compileSourceFinish, finishSourceGlyph, parseSourceFinish, sourceFinishBounds, sourceFinishPolygons, type SourceFinishPlan } from '../../shared/source/finish';
import { loadSource } from '../../server/sources';
import { traceOf } from '../../client/lib/pen';
import { rowsPNG, rowsSVG } from '../lib';

const args = process.argv.slice(2), all = args.includes('--all'), intermediate = args.includes('--intermediate');
const selected = args.find(arg => arg.startsWith('--family='))?.slice(9);
for (const arg of args) if (arg !== '--all' && arg !== '--intermediate' && !arg.startsWith('--family=')) throw new Error(`Unknown argument ${arg}`);
const families = selected ? [selected] : all ? [...new Set(MASTER_REVISIONS.map(info => info.ref.fontId))] : ['Mainline:600', 'Couture:600', 'Serenade:400'];
const out = process.env.TYPELAB_SLICE_OUT ?? '.audit/masters/slice';
const policy = parseSourceFinish(JSON.parse(readFileSync(new URL('../authored/source-finishes.json', import.meta.url), 'utf8')));
assert.ok(policy.slice, 'The authored finish policy must include Slice');
const specimen = "Hgoij c@& .,:;!?' -_·•", sensitive = "Hgoijc@&.,:;!?'\"-_·•";
mkdirSync(out, { recursive: true });

function finishedFont(base: Font, plan: SourceFinishPlan): Font {
  const cache = new Map<string, Glyph | null>(), bounds = sourceFinishBounds(plan);
  const font: Font = { ...base, m: { ...base.m, asc: base.m.asc + bounds.above, desc: base.m.desc - bounds.below },
    glyph(ch) {
      if (!cache.has(ch)) { const glyph = base.glyph(ch); cache.set(ch, glyph ? finishSourceGlyph(glyph, plan) : null); }
      return cache.get(ch) ?? null;
    }, letter: () => font
  };
  return font;
}
function nearBoundary(polys: Pt[][], point: Pt, tolerance: number): boolean {
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) <= tolerance) return true;
  }
  return false;
}
const report: { policy: typeof policy; families: { fontId: string; cases: number; glyphs: number; worstMs: number; commands: number; issues: string[] }[] } = { policy, families: [] };
for (const fontId of families) {
  const ref = mastersForFont(fontId), info = masterInfo(ref); assert.ok(ref && info); loadSource(ref);
  const pick = (info.defaultWeight - info.min) / (info.max - info.min), rows: Parameters<typeof rowsSVG>[0] = [];
  const stats = { fontId, cases: 0, glyphs: 0, worstMs: 0, commands: 0, issues: new Array<string>() };
  const weights = all && !intermediate ? [...new Set([info.defaultWeight, info.min, info.max])] : [info.defaultWeight];
  for (const weight of weights) {
    const slider = weight === info.defaultWeight ? pick : weight === info.min ? 0 : 1;
    const base = buildFont({ ...DEFAULTS, sourceProgram: ref, freeFont: fontId, weight: slider, freeAt: { ...freeAtOf(DEFAULTS), weight: pick } });
    if (weight === info.defaultWeight) rows.push({ font: base, text: specimen, label: `${fontId} original` });
    const chars: string = all && !intermediate && weight === info.defaultWeight ? ALL_CHARS : sensitive;
    for (const position of intermediate ? [0, .29, .5, .71, 1] : [0, .5, 1])
      for (const rounding of intermediate ? [.01, .25, .5, .75] : [0, 1]) for (const size of intermediate ? [.5] : [.01, 1]) {
      const plan = compileSourceFinish(policy, { ...DEFAULTS, slice: size, slicePos: position, sliceRound: rounding }, { capHeight: base.m.cap });
      assert.ok(plan.slice); stats.cases++;
      const finished = finishedFont(base, plan);
      for (const ch of chars) {
        const source = base.glyph(ch); if (!source) continue;
        const label = `${fontId} ${weight} ${JSON.stringify(ch)} position=${position} rounding=${rounding} size=${size}`;
        try {
          const start = performance.now(), glyph = finished.glyph(ch); assert.ok(glyph?.cmds.length, 'glyph disappeared');
          stats.worstMs = Math.max(stats.worstMs, performance.now() - start); stats.commands = Math.max(stats.commands, glyph.cmds.length); stats.glyphs++;
          assert.strictEqual(traceOf(glyph), source.editable ?? source.drawn, 'editable projection changed');
          assert.equal(glyph.adv, source.adv, 'advance changed');
          for (const cmd of glyph.cmds) for (const value of cmd.slice(1)) assert.ok(typeof value === 'number' && Number.isFinite(value), 'non-finite coordinate');
          const beforePolys = sourceFinishPolygons(source.cmds, .02), before = shape(beforePolys), after = shape(sourceFinishPolygons(glyph.cmds, .02));
          const box = cmdsBox(source.cmds); assert.ok(box);
          for (let ix = 0; ix < 9; ix++) for (let iy = 0; iy < 11; iy++) {
            const x: number = box.x0 + (box.x1 - box.x0) * (ix + .372) / 9, y: number = box.y0 + (box.y1 - box.y0) * (iy + .619) / 11;
            const original = before.has(x, y), opened = after.has(x, y < plan.slice.at ? y : y + plan.slice.gap);
            if ((!rounding && original !== opened || rounding && !original && opened) && !nearBoundary(beforePolys, { x, y }, .08)) {
              throw new Error(`${rounding ? 'rounded cut added ink' : 'sharp cut changed ink'} at ${x},${y}`);
            }
            if (iy < 3) assert.equal(after.has(x, plan.slice.at + plan.slice.gap * (iy + .5) / 3), false, 'ink crosses the opened gap');
          }
        } catch (error) { stats.issues.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      if (weight === info.defaultWeight && size === 1) rows.push({ font: finished, text: specimen, label: `${fontId} position ${position} rounding ${rounding}` });
    }
  }
  const stem = fontId.replace(/[^a-zA-Z0-9]+/g, '-');
  report.families.push(stats); writeFileSync(`${out}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...stats, issues: stats.issues.length, firstIssue: stats.issues[0] }));
  if (!stats.issues.length) {
    writeFileSync(`${out}/${stem}.svg`, rowsSVG(rows, 62, 16));
    writeFileSync(`${out}/${stem}.png`, rowsPNG(rows, 62, 16));
  }
}
writeFileSync(`${out}/policy.json`, `${JSON.stringify(policy, null, 2)}\n`);
assert.equal(report.families.reduce((sum, family) => sum + family.issues.length, 0), 0, 'Slice review has unresolved geometry issues');
