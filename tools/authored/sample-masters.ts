import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { decodeFreeFont, packNode, type FreeFontData } from '../../shared/engine/free';
import { segment, type Drawn, type Node } from '../../shared/engine/outline';
import { parseSourceData } from '../../shared/source/data';
import { correspondences, transfer, constrain } from './serif-masters';
import { full, readUpstream, packageMasters, reviewPackage, atWeights, type Upstream } from './transfer-masters';

function pointAt(contour: Node[], index: number, t: number): Pick<Node, 'x' | 'y'> {
  const a = contour[index], b = contour[(index + 1) % contour.length], curve = segment(a, b), u = 1 - t;
  if (!curve) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return { x: u ** 3 * a.x + 3 * u * u * t * curve[1].x + 3 * u * t * t * curve[2].x + t ** 3 * b.x,
    y: u ** 3 * a.y + 3 * u * u * t * curve[1].y + 3 * u * t * t * curve[2].y + t ** 3 * b.y };
}
function scaleGlyph(g: Drawn, sx: number, sy: number): Drawn {
  return { adv: g.adv * sx, contours: g.contours.map(c => c.map(node => {
    const n = full(node); return { x: n.x * sx, y: n.y * sy, ix: n.ix * sx, iy: n.iy * sy, ox: n.ox * sx, oy: n.oy * sy };
  })) };
}
function compatibleTarget(reference: Drawn, target: Drawn): Drawn {
  const mapping = correspondences(reference.contours, target.contours);
  if (!mapping) throw Error('Upstream weight changes contour count');
  return { adv: target.adv, contours: reference.contours.map((c, ci) => c.map((n, ni) => {
    const match = mapping[ci], contour = target.contours[match.contour];
    if (match.direct) {
      const { shift, reverse } = match.direct, node = full(contour[(shift + (reverse ? -ni : ni) + contour.length) % contour.length]);
      return reverse ? { x: node.x, y: node.y, ix: node.ox, iy: node.oy, ox: node.ix, oy: node.iy } : node;
    }
    const pos = match.positions[ni], p = pointAt(contour, pos.seg, pos.t), node = full(n), dx = p.x - n.x, dy = p.y - n.y;
    return { ...p, ix: node.ix + dx, iy: node.iy + dy, ox: node.ox + dx, oy: node.oy + dy };
  })) };
}
function repair(style: string, character: string, source: Drawn, target: Drawn): void {
  if (style !== 'Dispatch') return;
  function keepGap(left: number[], right: number[]) {
    const old = source.contours[0], next = target.contours[0];
    const gap = Math.min(...right.map(i => old[i].x)) - Math.max(...left.map(i => old[i].x));
    const now = Math.min(...right.map(i => next[i].x)) - Math.max(...left.map(i => next[i].x));
    if (now >= gap) return;
    const correction = (gap - now) / 2;
    for (const [indices, dx] of [[left, -correction], [right, correction]] satisfies [number[], number][]) for (const i of indices) {
      const node = next[i]; node.x += dx;
      if (node.ix !== undefined) node.ix += dx;
      if (node.ox !== undefined) node.ox += dx;
    }
  }
  if (character === 'H') { keepGap([20, 21, 22], [12, 13, 14]); keepGap([37, 38, 39], [46, 47, 48]); }
  if (character === 'U') keepGap([17, 18, 19], [29, 30, 31]);
  if (character === 'h') keepGap([28, 29, 30], [15, 16, 17]);
  if (character === 'n') keepGap([23, 24, 25], [10, 11, 12]);
}
export function authorSampled(source: FreeFontData, upstream: Upstream, weights: number[]) {
  const original = decodeFreeFont(source), refData = upstream.masters.find(m => m.weight === upstream.defaultWeight);
  if (!refData || !weights.includes(upstream.defaultWeight)) throw Error('Weights must include the default');
  const referenceFont = decodeFreeFont(refData.data), sx = source.space / referenceFont.space, sy = source.cap / upstream.cap;
  const references = Object.fromEntries(Object.entries(referenceFont.glyphs).map(([ch, g]) => [ch, scaleGlyph(g, sx, sy)]));
  const mappings = Object.fromEntries(Object.entries(original.glyphs).map(([ch, g]) => [ch, correspondences(g.contours, references[ch].contours)]));
  const stable = upstream.masters.every(m => Object.entries(refData.data.glyphs).every(([ch, [, cs]]) => JSON.stringify(cs.map(c => c.length)) === JSON.stringify(m.data.glyphs[ch][1].map(c => c.length))));
  const masters = upstream.masters.filter(m => weights.includes(m.weight)).map(m => {
    const targetFont = decodeFreeFont(m.data), glyphs: FreeFontData['glyphs'] = {};
    for (const [ch, g] of Object.entries(original.glyphs)) {
      let target = scaleGlyph(targetFont.glyphs[ch], sx, sy);
      if (!stable && m.weight !== upstream.defaultWeight) target = compatibleTarget(references[ch], target);
      const made = m.weight === upstream.defaultWeight ? structuredClone(g) : transfer(g, references[ch], target, mappings[ch]);
      if (m.weight !== upstream.defaultWeight) constrain(g.contours, made.contours);
      repair(source.family, ch, g, made);
      glyphs[ch] = [made.adv, made.contours.map(c => c.map(packNode))];
    }
    return { weight: m.weight, data: { ...source, glyphs, space: source.space + (m.data.space - refData.data.space) * sx } };
  });
  return packageMasters(source, upstream, masters, ['Authored upstream weight deltas transferred onto source curves using cyclic node alignment or monotone contour correspondence.',
    'When static upstream files optimize away different nodes, their corresponding contours are mapped onto the neutral instance before transferring deltas.',
    'The source weight retains its exact curves. All masters use the same source node and handle correspondence.',
    ...(source.family === 'Dispatch' ? ['H, U, h and n preserve the original positive gaps between facing serif tips. Their explicit three-anchor tip groups and handles move apart symmetrically when upstream bold would close those edited gaps.'] : [])]);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [sourcePath, extractedPath, outputPath, weightsText] = process.argv.slice(2);
  if (!sourcePath || !extractedPath || !outputPath || !weightsText) throw Error('Usage: sample-masters.ts source.json extracted.json package.json 300,400,500');
  const source = parseSourceData(JSON.parse(readFileSync(sourcePath, 'utf8'))), upstream = readUpstream(extractedPath, source);
  const wanted = weightsText.split(',').map(Number), available = upstream.masters.map(m => m.weight);
  const needed = [...new Set(wanted.flatMap(w => available.includes(w) ? [w] : [available.filter(v => v < w).at(-1), available.find(v => v > w)]))];
  if (needed.some(w => w === undefined)) throw Error('Requested weight outside upstream range');
  const selected = available.filter(w => needed.includes(w));
  const data = atWeights(authorSampled(source, upstream, selected), wanted);
  const review = reviewPackage(data, outputPath);
  process.stdout.write(JSON.stringify({ source: source.id, weights: data.masters.map(m => m.weight), ...review }) + '\n');
  if (review.failures.length) process.exitCode = 1;
}
