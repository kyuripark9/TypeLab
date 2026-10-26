import { readFileSync, writeFileSync } from 'node:fs';
import { decodeFreeFont, packNode } from '../../shared/engine/free.ts';
import { parseSourceData } from '../../shared/source/data.ts';
import { meshMasters } from '../masters/ambient-mesh.mjs';
import { readUpstream, packageMasters, reviewPackage, topology } from './transfer-masters.ts';

const [sourcePath, extractedPath, outputPath] = process.argv.slice(2);
if (!sourcePath || !extractedPath || !outputPath) throw Error('Usage: local-masters.mjs source.json extracted.json package.json');
const source = parseSourceData(JSON.parse(readFileSync(sourcePath, 'utf8')));
const settings = { Turnpike: { amount: 14, blur: 18 }, Funnies: { amount: 10, blur: 18 } }[source.family];
if (!settings) throw Error('No reviewed local master recipe for this family');
const upstream = readUpstream(extractedPath, source);
if (source.family === 'Turnpike') {
  for (const ch of ['/', '\\', 'X', ')', 'y']) {
    const glyph = decodeFreeFont(source).glyphs[ch];
    for (const contour of glyph.contours) for (let i = 0; i < contour.length; i++) {
      const a = contour[i], b = contour[(i + 1) % contour.length];
      for (const axis of ['x', 'y']) {
        const low = Math.min(a[axis], b[axis]), high = Math.max(a[axis], b[axis]);
        if (a[`o${axis}`] !== undefined) a[`o${axis}`] = Math.max(low, Math.min(high, a[`o${axis}`]));
        if (b[`i${axis}`] !== undefined) b[`i${axis}`] = Math.max(low, Math.min(high, b[`i${axis}`]));
      }
    }
    source.glyphs[ch] = [glyph.adv, glyph.contours.map(c => c.map(packNode))];
  }
}
if (source.family === 'Funnies') {
  const [advance, contours] = source.glyphs['+'];
  const transform = (node, yMap, tx = 0) => node.map((v, i) => v === null ? null : i % 2 ? yMap(v) : v + tx);
  // Comic Neue omits both daggers. Reuse its rounded cross corners and stem thickness.
  const lowerJoin = contours[0][4][1], upperJoin = contours[0][5][1];
  const map = y => y - 20 + 180 * Math.max(0, Math.min(1, (y - lowerJoin) / (upperJoin - lowerJoin)));
  source.glyphs['†'] = [advance, contours.map(c => c.map(n => transform(n, map)))];
  source.glyphs['‡'] = [advance, [
    ...contours.map(c => c.map(n => transform(n, y => y + 135))),
    ...contours.map(c => c.map(n => transform(n, y => y - 80))),
  ]];
}
const original = decodeFreeFont(source), masters = [-1, 0, 1].map(step => ({ weight: upstream.defaultWeight + step * 100, data: { ...source, glyphs: {} } }));
const records = [];
for (const [ch, glyph] of Object.entries(original.glyphs)) {
  const made = meshMasters(glyph.contours, [-settings.amount, 0, settings.amount], { grid: 48, blur: settings.blur });
  if (made.masters.some(m => m.minJacobian < .05)) throw Error(`${source.family} ${ch}: ambient map folds`);
  const before = topology(glyph.contours), after = topology(made.base);
  if (before.pieces !== after.pieces || before.counters !== after.counters) throw Error(`${source.family} ${ch}: subdivision changes measured topology`);
  for (let i = 0; i < masters.length; i++) {
    const m = made.masters[i]; masters[i].data.glyphs[ch] = [glyph.adv + m.advanceDelta, m.contours.map(c => c.map(packNode))];
  }
  records.push({ ch, nodes: made.nodes, minJacobian: Math.min(...made.masters.map(m => m.minJacobian)), areas: made.masters.map(m => topology(m.contours).area / before.area) });
}
const data = packageMasters(source, upstream, masters, [
  `The ${upstream.defaultWeight - 100} and ${upstream.defaultWeight + 100} drawings are newly authored local variants of the edited ${source.family} source, rather than the upstream weight instances.`,
  `A shared whole-ink deformation field uses regularization 0.005, blur ${settings.blur}, and endpoint amounts ±${settings.amount}. Every cubic is split exactly at the common 48-unit triangle boundaries before the affine maps are applied.`,
  'The complete map has positive endpoint and intermediate triangle Jacobians. It preserves component contacts and counters throughout interpolation. Y extent and left ink edge remain fixed; advance follows the change in ink width.',
  ...(source.family === 'Turnpike' ? ['Slash, backslash, X, closing parenthesis and y handles are clamped to their endpoint rectangles in the neutral drawing. Corrections of at most seven units remove pre-existing microscopic crossing islands at their caps. Original outline-v1 data stays unchanged.'] : []),
  ...(source.family === 'Funnies' ? ['The source and Comic Neue both omit daggers. Dagger reuses the plus outline with an extended lower stem; double dagger overlaps two plus outlines shifted vertically. These new glyphs share the same rounded corners and stroke weight.'] : []),
]);
const review = reviewPackage(data, outputPath);
writeFileSync(outputPath + '.ambient.json', JSON.stringify({ settings, records, minimumJacobian: Math.min(...records.map(r => r.minJacobian)) }, null, 2));
process.stdout.write(JSON.stringify({ source: source.id, ...review, H: records.find(r => r.ch === 'H') }) + '\n');
if (review.failures.length) process.exitCode = 1;
