/* Exercise every published family through combined geometry controls, dot placement and real OTF export. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { MASTER_REVISIONS } from '../../shared/source/master-catalog.ts';
import { sourceMasters } from '../../shared/source/registry.ts';
import { interpolateMasters } from '../../shared/source/masters.ts';
import { sourceDot } from '../../shared/source/features.ts';
import { transportEdits } from '../../shared/source/edit-transport.ts';
import { loadSource } from '../../server/sources.ts';
import { buildFont } from '../../shared/engine/index.ts';
import { drawnCmds } from '../../shared/engine/outline.ts';
import { cmdsBox, toPolys, signedArea } from '../../shared/engine/geom.ts';
import { shape, combine } from '../../shared/engine/boolean.ts';
import { ALL_CHARS } from '../../shared/engine/font.ts';
import { DEFAULTS, freeAtOf } from '../../shared/params/index.ts';
import { buildOTF, exportName } from '../../server/export.ts';
import { opentype } from '../../server/opentype.ts';
import { topology } from './sources-topology.mjs';

const entries = [...new Map(MASTER_REVISIONS.map(entry => [entry.ref.fontId, entry])).values()];
const report = { families: entries.length, finiteChecks: 0, topologyChecks: 0, dots: [], issues: [], tinyComponents: [], pointEdit: [], exports: [] };
const box = cs => cmdsBox(drawnCmds(cs));
const nodeCount = glyph => glyph.contours.reduce((n, c) => n + c.length, 0);
// A fixed area cutoff can count an existing microscopic speck only after scaling.
// Record that case separately when the scale-independent component counts agree.
function relativeTopology(contours) {
  const ink = shape(toPolys(drawnCmds(contours))), areas = combine([ink], ink.has).map(signedArea);
  const threshold = Math.abs(areas.reduce((a, b) => a + b, 0)) * 1e-5;
  return { pieces: areas.filter(a => a > threshold).length, counters: areas.filter(a => a < -threshold).length,
    tinyAreas: areas.filter(a => Math.abs(a) <= threshold) };
}
for (const info of entries) {
  const raw = loadSource(info.ref), program = sourceMasters(info.ref), pick = (info.defaultWeight - info.min) / (info.max - info.min);
  const params = { ...DEFAULTS, freeFont: info.ref.fontId, sourceProgram: info.ref, weight: pick, freeAt: { ...freeAtOf(DEFAULTS), weight: pick } };
  for (const weight of [0, .5, 1]) {
    const actualWeight = info.min + (info.max - info.min) * weight, original = interpolateMasters(program, actualWeight);
    const expectedTopology = Object.fromEntries([...'aeogijpR&@%'].map(ch => [ch, topology(original.glyphs[ch].contours)]));
    for (const end of [0, 1]) {
      const p = { ...params, weight, height: end, xHeight: 1 - end, extenders: end, descender: end, width: end };
      const font = buildFont(p), sy = end ? 1.28 : .78;
      for (const ch of ALL_CHARS) {
        const glyph = font.glyph(ch); report.finiteChecks++;
        if (!glyph || !Number.isFinite(glyph.adv) || glyph.adv <= 0 || glyph.cmds.some(c => c.slice(1).some(v => !Number.isFinite(v)))) {
          report.issues.push({ kind: 'finite', family: info.ref.fontId, weight, end, ch });
        }
        if (glyph?.drawn && expectedTopology[ch]) {
          const expected = expectedTopology[ch], actual = topology(glyph.drawn.contours); report.topologyChecks++;
          if (expected.pieces !== actual.pieces || expected.counters !== actual.counters) {
            const a = relativeTopology(original.glyphs[ch].contours), b = relativeTopology(glyph.drawn.contours);
            const issue = { kind: 'topology', family: info.ref.fontId, weight, end, ch, actual, expected };
            if (a.pieces === b.pieces && a.counters === b.counters) report.tinyComponents.push({ ...issue, sourceTinyAreas: a.tinyAreas, transformedTinyAreas: b.tinyAreas });
            else report.issues.push(issue);
          }
        }
      }
      for (const ch of ['i', 'j']) {
        const dot = sourceDot(info.source.digest, ch); if (!dot) continue;
        const before = original.glyphs[ch], after = font.glyph(ch)?.drawn;
        const dots = cs => dot.contours.flatMap(i => cs[i] ? [cs[i]] : []);
        const body = cs => cs.filter((_, i) => !dot.contours.includes(i));
        const beforeDot = box(dots(before.contours)), afterDot = after && box(dots(after.contours)), beforeBody = box(body(before.contours)), afterBody = after && box(body(after.contours));
        if (!beforeDot || !afterDot || !beforeBody || !afterBody) { report.issues.push({ kind: 'dot-contours', family: info.ref.fontId, ch, weight, end }); continue; }
        const heightError = (afterDot.y1 - afterDot.y0) - (beforeDot.y1 - beforeDot.y0) * sy;
        const result = { family: info.ref.fontId, ch, weight, end, beforeGap: beforeDot.y0 - beforeBody.y1, afterGap: afterDot.y0 - afterBody.y1, heightError };
        report.dots.push(result);
        if (result.beforeGap <= 0 || result.afterGap <= 0 || Math.abs(heightError) > 1e-5) report.issues.push({ kind: 'dot', ...result });
      }
    }
  }
  if (['Ballyhoo:400', 'Serenade:400', 'Cathedral:400', 'Mainline:600'].includes(info.ref.fontId)) {
    const neutral = interpolateMasters(program, info.defaultWeight), target = interpolateMasters(program, info.max);
    const [ch, from] = Object.entries(neutral.glyphs).sort((a, b) => nodeCount(b[1]) - nodeCount(a[1]))[0];
    const edited = structuredClone(from), c = edited.contours[0], a = c[0], b = c[1];
    c.splice(1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const start = performance.now(), moved = transportEdits(edited, from, target.glyphs[ch], { digest: info.ref.digest, glyph: ch }), elapsedMs = performance.now() - start;
    report.pointEdit.push({ family: info.ref.fontId, ch, nodes: nodeCount(from), addedPointMs: elapsedMs, finite: moved.contours.every(c => c.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))) });
  }
  if (['Hearth:600', 'Ballyhoo:400', 'Bulwark:700'].includes(info.ref.fontId)) {
    const start = performance.now(), bytes = buildOTF(params, 'Independent export review');
    const parsed = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const names = parsed.names.windows ?? parsed.names.unicode ?? parsed.names;
    const result = { family: info.ref.fontId, bytes: bytes.length, exportMs: performance.now() - start,
      licensePresent: !!raw.licenseText && names.license?.en?.includes(raw.licenseText), copyrightPresent: !!raw.copyright && names.copyright?.en?.includes(raw.copyright), glyphs: parsed.glyphs.length,
      requestedOriginalName: 'Abril Fatface', exportedOriginalName: exportName(params, 'Abril Fatface') };
    report.exports.push(result);
    if (!result.licensePresent || !result.copyrightPresent || result.glyphs !== 130) report.issues.push({ kind: 'export', ...result });
  }
  console.log(`${info.ref.fontId}: checked`);
}
mkdirSync('.audit/masters/sources', { recursive: true });
writeFileSync('.audit/masters/sources/catalog-integration.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, dots: report.dots.length }, null, 2));
if (report.issues.length) process.exitCode = 1;
