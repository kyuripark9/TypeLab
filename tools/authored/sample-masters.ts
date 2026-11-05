import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { decodeFreeFont, packNode, type FreeFontData } from '../../shared/engine/free';
import { segment, type Drawn, type Node } from '../../shared/engine/outline';
import { parseSourceData } from '../../shared/source/data';
import { correspondences, transfer, constrain } from './serif-masters';
import { full, readUpstream, packageMasters, reviewPackage, atWeights, type Upstream } from './transfer-masters';
import { curveOf, matchContour, redrawOn, type ContourMatch } from './node-alignment';
import { cubicAt } from '../../shared/engine/geom';

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
/** How far a point moves between two upstream weights at most, in font units: corners and extremes further apart than
    this never pair. */
const WEIGHT_REACH = 90;
export interface AlignedReport { ch: string; weight: number; unpaired: number; fitError: number }
/** `target` (an upstream weight) redrawn on the points of `reference` (its default weight), matched point for point by
    their corners and extremes (node-alignment.ts) rather than by their point counts. */
export function alignedTarget(reference: Drawn, target: Drawn, report?: (unpaired: number, fitError: number) => void, name = ''): Drawn {
  const mapping = correspondences(reference.contours, target.contours);
  if (!mapping) throw Error('Upstream weight changes contour count');
  let unpaired = 0, fitError = 0;
  const contours = reference.contours.map((c, ci) => {
    const other = target.contours[mapping[ci].contour], match = matchContour(c, other, WEIGHT_REACH);
    if (!match) throw Error(`${name} contour ${ci}: the upstream weight shares no corner or extreme with the default`);
    const made = redrawOn(c, other, match);
    unpaired += match.unpaired.length; fitError = Math.max(fitError, made.fitError);
    return made.contour.map(full);
  });
  report?.(unpaired, fitError);
  return { adv: target.adv, contours };
}
/** How far a source point stands from its upstream default at most, in font units (the sheets lengthened some
    ascenders and brackets). */
const SOURCE_REACH = 160;
/** Where the source's contours keep other points than the upstream default's (Compass's 3, f and brackets), each source
    point matched to the default by shape; null for contours matched point for point. */
function sourceMatches(source: Drawn, reference: Drawn, mapping: ReturnType<typeof correspondences>): (ContourMatch | null)[] {
  return source.contours.map((c, ci) => {
    const m = mapping?.[ci];
    if (!m || m.direct) return null;
    // by place, or within each contour's bounds where the sheet stretched the letter: whichever leaves fewer corners
    // and extremes unpaired
    const options = [matchContour(c, reference.contours[m.contour], SOURCE_REACH), matchContour(c, reference.contours[m.contour], SOURCE_REACH, true)]
      .filter((x): x is ContourMatch => !!x).sort((x, y) => x.unpaired.length - y.unpaired.length);
    return options[0] ?? null;
  });
}
/** `made` (the transfer) with each shape-matched contour's points moved as the default's moves to `target` there: a
    point paired with one of the default's takes its motion and its handles' motion, a point between takes the motion
    of its place on the curve. */
function transferMatched(source: Drawn, reference: Drawn, target: Drawn, mapping: NonNullable<ReturnType<typeof correspondences>>,
  matches: (ContourMatch | null)[], made: Drawn): Drawn {
  return { ...made, contours: made.contours.map((c, ci) => {
    const match = matches[ci];
    if (!match) return c;
    const before = reference.contours[mapping[ci].contour], after = target.contours[mapping[ci].contour];
    return source.contours[ci].map((node, ni) => {
      const loc = match.locations[ni], paired = match.paired[ni], out = { ...node };
      if (paired !== null && !match.reversed) {
        const a = full(before[paired]), b = full(after[paired]), d = { x: b.x - a.x, y: b.y - a.y };
        out.x += d.x; out.y += d.y;
        if (out.ix !== undefined && out.iy !== undefined) { out.ix += before[paired].ix !== undefined ? b.ix - a.ix : d.x; out.iy += before[paired].iy !== undefined ? b.iy - a.iy : d.y; }
        if (out.ox !== undefined && out.oy !== undefined) { out.ox += before[paired].ox !== undefined ? b.ox - a.ox : d.x; out.oy += before[paired].oy !== undefined ? b.oy - a.oy : d.y; }
        return out;
      }
      const p = cubicAt(curveOf(before, loc.seg), loc.t), q = cubicAt(curveOf(after, loc.seg), loc.t), d = { x: q.x - p.x, y: q.y - p.y };
      out.x += d.x; out.y += d.y;
      if (out.ix !== undefined && out.iy !== undefined) { out.ix += d.x; out.iy += d.y; }
      if (out.ox !== undefined && out.oy !== undefined) { out.ox += d.x; out.oy += d.y; }
      return out;
    });
  }) };
}
export function authorSampled(source: FreeFontData, upstream: Upstream, weights: number[], aligned = false, reports: AlignedReport[] = []) {
  const original = decodeFreeFont(source), refData = upstream.masters.find(m => m.weight === upstream.defaultWeight);
  if (!refData || !weights.includes(upstream.defaultWeight)) throw Error('Weights must include the default');
  const referenceFont = decodeFreeFont(refData.data), sx = source.space / referenceFont.space, sy = source.cap / upstream.cap;
  const references = Object.fromEntries(Object.entries(referenceFont.glyphs).map(([ch, g]) => [ch, scaleGlyph(g, sx, sy)]));
  const mappings = Object.fromEntries(Object.entries(original.glyphs).map(([ch, g]) => [ch, correspondences(g.contours, references[ch].contours)]));
  const matched = Object.fromEntries(Object.entries(original.glyphs).map(([ch, g]) => [ch, aligned ? sourceMatches(g, references[ch], mappings[ch]) : []]));
  const stable = upstream.masters.every(m => Object.entries(refData.data.glyphs).every(([ch, [, cs]]) => JSON.stringify(cs.map(c => c.length)) === JSON.stringify(m.data.glyphs[ch][1].map(c => c.length))));
  const masters = upstream.masters.filter(m => weights.includes(m.weight)).map(m => {
    const targetFont = decodeFreeFont(m.data), glyphs: FreeFontData['glyphs'] = {};
    for (const [ch, g] of Object.entries(original.glyphs)) {
      let target = scaleGlyph(targetFont.glyphs[ch], sx, sy);
      if (aligned && m.weight !== upstream.defaultWeight) {
        target = alignedTarget(references[ch], target, (unpaired, fitError) => reports.push({ ch, weight: m.weight, unpaired, fitError }), `${ch} ${m.weight}`);
      } else if (!stable && m.weight !== upstream.defaultWeight) target = compatibleTarget(references[ch], target);
      let made = m.weight === upstream.defaultWeight ? structuredClone(g) : transfer(g, references[ch], target, mappings[ch]);
      if (aligned && m.weight !== upstream.defaultWeight && mappings[ch]) made = transferMatched(g, references[ch], target, mappings[ch], matched[ch], made);
      if (m.weight !== upstream.defaultWeight) constrain(g.contours, made.contours);
      repair(source.family, ch, g, made);
      glyphs[ch] = [made.adv, made.contours.map(c => c.map(packNode))];
    }
    return { weight: m.weight, data: { ...source, glyphs, space: source.space + (m.data.space - refData.data.space) * sx } };
  });
  return packageMasters(source, upstream, masters, ['Authored upstream weight deltas transferred onto source curves using cyclic node alignment or monotone contour correspondence.',
    aligned ? 'Each upstream weight is redrawn on the default weight\'s points before its deltas are taken: corners pair with corners and curve extremes with extremes running the same way, in contour order, and every other point keeps its share of the curve between them. Pieces inside one upstream curve are cut from it exactly; pieces spanning several are fitted with their end directions kept.'
      : 'When static upstream files optimize away different nodes, their corresponding contours are mapped onto the neutral instance before transferring deltas.',
    'The source weight retains its exact curves. All masters use the same source node and handle correspondence.',
    ...(source.family === 'Dispatch' ? ['H, U, h and n preserve the original positive gaps between facing serif tips. Their explicit three-anchor tip groups and handles move apart symmetrically when upstream bold would close those edited gaps.'] : [])]);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const aligned = process.argv.includes('--aligned'), [sourcePath, extractedPath, outputPath, weightsText] = process.argv.slice(2).filter(a => a !== '--aligned');
  if (!sourcePath || !extractedPath || !outputPath || !weightsText) throw Error('Usage: sample-masters.ts source.json extracted.json package.json 300,400,500 [--aligned]');
  const source = parseSourceData(JSON.parse(readFileSync(sourcePath, 'utf8'))), upstream = readUpstream(extractedPath, source);
  const wanted = weightsText.split(',').map(Number), available = upstream.masters.map(m => m.weight);
  const needed = [...new Set(wanted.flatMap(w => available.includes(w) ? [w] : [available.filter(v => v < w).at(-1), available.find(v => v > w)]))];
  if (needed.some(w => w === undefined)) throw Error('Requested weight outside upstream range');
  const selected = available.filter(w => needed.includes(w));
  const reports: AlignedReport[] = [], data = atWeights(authorSampled(source, upstream, selected, aligned, reports), wanted);
  const review = reviewPackage(data, outputPath);
  const loose = reports.filter(r => r.unpaired || r.fitError > 1);
  process.stdout.write(JSON.stringify({ source: source.id, weights: data.masters.map(m => m.weight), ...review,
    ...(aligned ? { unpaired: loose.filter(r => r.unpaired).map(r => `${r.ch}@${r.weight}:${r.unpaired}`), fits: loose.filter(r => r.fitError > 1).map(r => `${r.ch}@${r.weight}:${r.fitError.toFixed(2)}`) } : {}) }) + '\n');
  if (review.failures.length) process.exitCode = 1;
}
