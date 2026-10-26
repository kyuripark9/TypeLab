/* Transfer authored weight deltas onto the edited source outlines. Geometry correspondence is
   computed offline; the runtime receives ordinary compatible cubic masters. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { decodeFreeFont, packNode, type FreeFontData } from '../../shared/engine/free';
import { drawnCmds, segment, type Node, type Drawn } from '../../shared/engine/outline';
import { cmdsBox, toPolys, signedArea, cmdsToD } from '../../shared/engine/geom';
import { shape, combine } from '../../shared/engine/boolean';
import { parseSourceData } from '../../shared/source/data';
import { parseWeightMasters, decodeWeightMasters, interpolateMasters, type WeightMasterData } from '../../shared/source/masters';
import { rowsPNG, rowsSVG } from '../lib';
import { buildFont } from '../../shared/engine';
import { styleById } from '../../shared/content';
import { packageMasters, readUpstream } from './transfer-masters';

const SAMPLE_COUNT = 128;
type Point = Pick<Node, 'x' | 'y'>;
type Position = { seg: number; t: number };
type Sample = Point & Position & { nx: number; ny: number };
type Box = NonNullable<ReturnType<typeof cmdsBox>>;
type Samples = { samples: Sample[]; anchor: number[]; box: Box };
type Alignment = { cost: number; shift: number; reverse: boolean };
type Correspondence = { contour: number; positions: Position[]; direct: Alignment | null };
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function at(contour: Node[], index: number, t: number): Point {
  const a = contour[index], b = contour[(index + 1) % contour.length], curve = segment(a, b);
  if (!curve) return mix(a, b, t);
  const u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u * u * t * curve[1].x + 3 * u * t * t * curve[2].x + t ** 3 * b.x,
    y: u ** 3 * a.y + 3 * u * u * t * curve[1].y + 3 * u * t * t * curve[2].y + t ** 3 * b.y };
}
function bounds(contours: Node[][]): Box {
  const b = cmdsBox(drawnCmds(contours));
  if (!b) throw Error('Empty contour bounds');
  return b;
}
export function sample(contour: Node[]): Samples {
  const box = bounds([contour]), points: (Point & Position & { length: number })[] = [];
  let length = 0;
  for (let i = 0; i < contour.length; i++) for (let j = 0; j < 24; j++) {
    const p = at(contour, i, j / 24), previous = points.at(-1);
    if (previous) length += Math.hypot(p.x - previous.x, p.y - previous.y);
    points.push({ ...p, seg: i, t: j / 24, length });
  }
  const first = points[0], last = points[points.length - 1];
  length += Math.hypot(first.x - last.x, first.y - last.y);
  points.push({ ...first, seg: contour.length - 1, t: 1, length });
  let j = 0;
  const samples: Sample[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const distance = length * i / SAMPLE_COUNT;
    while (points[j + 1].length < distance) j++;
    const a = points[j], b = points[j + 1], t = (distance - a.length) / Math.max(1e-9, b.length - a.length), p = mix(a, b, t);
    samples.push({ ...p, seg: a.seg, t: a.t + (b.seg === a.seg ? b.t - a.t : 1 - a.t) * t,
      nx: (p.x - box.x0) / Math.max(1, box.x1 - box.x0), ny: (p.y - box.y0) / Math.max(1, box.y1 - box.y0) });
  }
  const anchor = contour.map((_, i) => points[i * 24].length / length * SAMPLE_COUNT);
  return { samples, anchor, box };
}
export function align(a: Samples, b: Samples): Alignment {
  let best: Alignment = { cost: Infinity, shift: 0, reverse: false };
  for (const reverse of [false, true]) for (let shift = 0; shift < SAMPLE_COUNT; shift++) {
    let cost = 0;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const p = a.samples[i], q = b.samples[(shift + (reverse ? -i : i) + SAMPLE_COUNT) % SAMPLE_COUNT];
      cost += (p.nx - q.nx) ** 2 + (p.ny - q.ny) ** 2;
    }
    if (cost < best.cost) best = { cost, shift, reverse };
  }
  return best;
}
function direct(source: Node[], reference: Node[]): Alignment | null {
  if (source.length !== reference.length) return null;
  let best: Alignment = { cost: Infinity, shift: 0, reverse: false };
  for (const reverse of [false, true]) for (let shift = 0; shift < source.length; shift++) {
    const paired = source.map((_, i) => reference[(shift + (reverse ? -i : i) + reference.length) % reference.length]);
    const dx = source.reduce((sum, n, i) => sum + n.x - paired[i].x, 0) / source.length;
    const dy = source.reduce((sum, n, i) => sum + n.y - paired[i].y, 0) / source.length;
    const cost = source.reduce((sum, n, i) => sum + (n.x - paired[i].x - dx) ** 2 + (n.y - paired[i].y - dy) ** 2, 0);
    if (cost < best.cost) best = { cost, shift, reverse };
  }
  return best;
}
export function positions(a: Samples, b: Samples, alignment: Alignment): Position[] {
  const paired = Array.from({ length: SAMPLE_COUNT }, (_, i) => b.samples[(alignment.shift + (alignment.reverse ? -i : i) + SAMPLE_COUNT) % SAMPLE_COUNT]);
  const size = SAMPLE_COUNT + 1, cost = new Float64Array(size * size).fill(Infinity), back = new Uint8Array(size * size);
  cost[0] = 0;
  for (let i = 1; i <= SAMPLE_COUNT; i++) for (let j = Math.max(1, i - 25); j <= Math.min(SAMPLE_COUNT, i + 25); j++) {
    const p = a.samples[i - 1], q = paired[j - 1], k = i * size + j;
    const options = [cost[k - size - 1], cost[k - size] + .0002, cost[k - 1] + .0002], value = Math.min(...options);
    cost[k] = value + (p.nx - q.nx) ** 2 + (p.ny - q.ny) ** 2;
    back[k] = options.indexOf(value);
  }
  let i = SAMPLE_COUNT, j = SAMPLE_COUNT;
  const pairs: number[][] = Array.from({ length: SAMPLE_COUNT }, () => []);
  while (i > 0 && j > 0) {
    pairs[i - 1].push(j - 1);
    const step = back[i * size + j];
    if (step === 0) { i--; j--; } else if (step === 1) i--; else j--;
  }
  const map = pairs.map((values, i) => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : i);
  return a.anchor.map(f => {
    const i = Math.floor(f) % SAMPLE_COUNT, t = f - Math.floor(f);
    const value = map[i] + t * ((i === SAMPLE_COUNT - 1 ? SAMPLE_COUNT : map[i + 1]) - map[i]);
    const index = (alignment.shift + (alignment.reverse ? -value : value) + SAMPLE_COUNT * 2) % SAMPLE_COUNT;
    const a = b.samples[Math.floor(index)], next = b.samples[(Math.floor(index) + 1) % SAMPLE_COUNT], u = index - Math.floor(index);
    return { seg: a.seg, t: a.t + (next.seg === a.seg ? next.t - a.t : 1 - a.t) * u };
  });
}
function center(box: Box, whole: Box): Point {
  return { x: ((box.x0 + box.x1) / 2 - whole.x0) / Math.max(1, whole.x1 - whole.x0),
    y: ((box.y0 + box.y1) / 2 - whole.y0) / Math.max(1, whole.y1 - whole.y0) };
}
export function correspondences(source: Node[][], reference: Node[][]): Correspondence[] | null {
  if (source.length !== reference.length) return null;
  const a = source.map(sample), b = reference.map(sample), sourceBox = bounds(source), referenceBox = bounds(reference), used = new Set<number>();
  return a.map((sampled, i) => {
    const candidates = b.map((other, j) => {
      const alignment = align(sampled, other), p = center(sampled.box, sourceBox), q = center(other.box, referenceBox);
      const size = Math.abs((sampled.box.x1 - sampled.box.x0) / Math.max(1, other.box.x1 - other.box.x0) - 1)
        + Math.abs((sampled.box.y1 - sampled.box.y0) / Math.max(1, other.box.y1 - other.box.y0) - 1);
      return { j, alignment, score: alignment.cost / SAMPLE_COUNT + .15 * (size + 10 * Math.hypot(p.x - q.x, p.y - q.y)) };
    }).filter(c => !used.has(c.j)).sort((a, b) => a.score - b.score);
    const chosen = candidates[0];
    used.add(chosen.j);
    return { contour: chosen.j, positions: positions(sampled, b[chosen.j], chosen.alignment), direct: direct(source[i], reference[chosen.j]) };
  });
}
function translated(node: Node, delta: Point): Node {
  return { ...node, x: node.x + delta.x, y: node.y + delta.y,
    ...(node.ix !== undefined && node.iy !== undefined ? { ix: node.ix + delta.x, iy: node.iy + delta.y } : {}),
    ...(node.ox !== undefined && node.oy !== undefined ? { ox: node.ox + delta.x, oy: node.oy + delta.y } : {}) };
}
export function transfer(source: Drawn, reference: Drawn, target: Drawn, correspondence: Correspondence[] | null): Drawn {
  const sourceBox = bounds(source.contours), referenceBox = bounds(reference.contours);
  const pool = reference.contours.flatMap((c, ci) => sample(c).samples.map(p => ({ ...p, ci })));
  const contours = source.contours.map((c, ci) => c.map((node, ni) => {
    const mapping = correspondence?.[ci];
    if (mapping) {
      const before = reference.contours[mapping.contour], after = target.contours[mapping.contour], match = mapping.direct;
      if (match) {
        const index = (match.shift + (match.reverse ? -ni : ni) + before.length) % before.length;
        const a = before[index], b = after[index], result = translated(node, { x: b.x - a.x, y: b.y - a.y });
        const incoming = match.reverse ? 'o' : 'i', outgoing = match.reverse ? 'i' : 'o';
        if (node.ix !== undefined && node.iy !== undefined) { result.ix = node.ix + (b[`${incoming}x`] ?? b.x) - (a[`${incoming}x`] ?? a.x); result.iy = node.iy + (b[`${incoming}y`] ?? b.y) - (a[`${incoming}y`] ?? a.y); }
        if (node.ox !== undefined && node.oy !== undefined) { result.ox = node.ox + (b[`${outgoing}x`] ?? b.x) - (a[`${outgoing}x`] ?? a.x); result.oy = node.oy + (b[`${outgoing}y`] ?? b.y) - (a[`${outgoing}y`] ?? a.y); }
        return result;
      }
      const pos = mapping.positions[ni], a = at(before, pos.seg, pos.t), b = at(after, pos.seg, pos.t);
      return translated(node, { x: b.x - a.x, y: b.y - a.y });
    }
    // A few edited italic letters merge upstream components. Match their actual positions
    // in the whole letter instead of pretending their contour indexes still correspond.
    const p = { x: referenceBox.x0 + (node.x - sourceBox.x0) / (sourceBox.x1 - sourceBox.x0) * (referenceBox.x1 - referenceBox.x0),
      y: referenceBox.y0 + (node.y - sourceBox.y0) / (sourceBox.y1 - sourceBox.y0) * (referenceBox.y1 - referenceBox.y0) };
    const nearest = pool.reduce((a, b) => Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? a : b);
    const a = at(reference.contours[nearest.ci], nearest.seg, nearest.t), b = at(target.contours[nearest.ci], nearest.seg, nearest.t);
    return translated(node, { x: b.x - a.x, y: b.y - a.y });
  }));
  return { adv: source.adv + target.adv - reference.adv, contours };
}
export function constrain(source: Node[][], target: Node[][]): void {
  for (let ci = 0; ci < source.length; ci++) for (let ni = 0; ni < source[ci].length; ni++) {
    const a = source[ci][ni], b = source[ci][(ni + 1) % source[ci].length], x = target[ci][ni], y = target[ci][(ni + 1) % target[ci].length];
    for (const axis of ['x', 'y'] satisfies ('x' | 'y')[]) {
      const values = [a[axis], a[`o${axis}`] ?? a[axis], b[`i${axis}`] ?? b[axis], b[axis]];
      if (!values.every((v, i) => !i || v >= values[i - 1]) && !values.every((v, i) => !i || v <= values[i - 1])) continue;
      const low = Math.min(x[axis], y[axis]), high = Math.max(x[axis], y[axis]);
      const outgoing = x[`o${axis}`], incoming = y[`i${axis}`];
      if (outgoing !== undefined) x[`o${axis}`] = Math.max(low, Math.min(high, outgoing));
      if (incoming !== undefined) y[`i${axis}`] = Math.max(low, Math.min(high, incoming));
    }
  }
}
function repair(style: string, character: string, source: Drawn, target: Drawn, weight: number): void {
  function keepGap(contour: number, left: number[], right: number[]) {
    const old = source.contours[contour], next = target.contours[contour];
    const gap = Math.min(...right.map(i => old[i].x)) - Math.max(...left.map(i => old[i].x));
    const now = Math.min(...right.map(i => next[i].x)) - Math.max(...left.map(i => next[i].x));
    if (now >= gap) return;
    const correction = (gap - now) / 2;
    for (const i of left) next[i] = translated(next[i], { x: -correction, y: 0 });
    for (const i of right) next[i] = translated(next[i], { x: correction, y: 0 });
  }
  if (style === 'Vellum' && character === 'W') keepGap(0, [5, 6, 7, 8], [15, 16, 17]);
  if (style === 'Vellum' && character === 'm') {
    keepGap(0, [41, 42, 43], [32, 33, 34]);
    keepGap(0, [29, 30, 31], [22, 23, 24]);
  }
  if (style === 'Sonnet') {
    if (character === 'a') target.contours[1] = target.contours[1].map(n => translated(n, { x: (weight - 400) * .05, y: 0 }));
    if (character === 'b' || character === 'p') target.contours[0][4] = translated(target.contours[0][4], { x: 7, y: 0 });
    if (character === '¥') target.contours[2][16] = translated(target.contours[2][16], { x: -5, y: 0 });
  }
  if (style !== 'Couture' || character !== '*') return;
  for (let ci = 0; ci < target.contours.length; ci++) {
    const original = source.contours[ci], dx = original.reduce((sum, n) => sum + n.x, 0) / original.length - 242;
    const dy = original.reduce((sum, n) => sum + n.y, 0) / original.length - 519, length = Math.hypot(dx, dy);
    const tip = { x: 242 + dx / length * 7, y: 519 + dy / length * 7 };
    for (let ni = 0; ni < original.length; ni++) if (Math.hypot(original[ni].x - 242, original[ni].y - 519) < 10) {
      const n = target.contours[ci][ni]; n.x = tip.x; n.y = tip.y;
      if (n.ix !== undefined) { n.ix = tip.x; n.iy = tip.y; }
      if (n.ox !== undefined) { n.ox = tip.x; n.oy = tip.y; }
    }
  }
}
export function topology(contours: Node[][]) {
  const ink = shape(toPolys(drawnCmds(contours))), areas = combine([ink], ink.has).map(signedArea).filter(a => Math.abs(a) > .15);
  return { pieces: areas.filter(a => a > 0).length, counters: areas.filter(a => a < 0).length, area: areas.reduce((sum, a) => sum + a, 0) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
const [sourcePath, extractedPath, outputPath, weightsText] = process.argv.slice(2);
if (!sourcePath || !extractedPath || !outputPath || !weightsText) throw Error('Usage: serif-masters.ts source.json extracted.json package.json 500,600,700');
const source = parseSourceData(JSON.parse(readFileSync(sourcePath, 'utf8'))), original = decodeFreeFont(source), upstream = readUpstream(extractedPath, source);
const weights = weightsText.split(',').map(Number), selected = upstream.masters.filter(m => weights.includes(m.weight));
const referenceData = upstream.masters.find(m => m.weight === upstream.defaultWeight);
if (!referenceData || !weights.includes(upstream.defaultWeight) || selected.length !== weights.length) throw Error('Weights must exist upstream and include the default');
const reference = decodeFreeFont(referenceData.data), mappings = Object.fromEntries(Object.entries(original.glyphs).map(([ch, d]) => [ch, correspondences(d.contours, reference.glyphs[ch].contours)]));
const notes = [
    `Authored ${upstream.family} weight deltas transferred onto ${source.family}'s edited outlines. Direct cyclic node matching where compatible; monotone contour correspondence where the source changed curve counts.`,
    'Original source node and handle topology remains compatible across every master. Curve correspondence is baked offline; runtime only interpolates these drawings.',
    ...(['Couture', 'Sonnet'].includes(source.family) ? ['Playfair keeps its math operators, slashes and daggers at fixed stroke weight; Couture also keeps the degree sign fixed, and Sonnet the bullet. These upstream choices remain in the transferred masters.'] : []),
    ...(source.family === 'Couture' ? ['Asterisk repair in the new masters: six inner petal tips are collapsed to six separated points seven units from (242,519), removing two spurious source islands. The original outline-v1 snapshot remains unchanged.'] : []),
    ...(source.family === 'Vellum' ? ['The W upper serif tips and the m baseline serif tips preserve their original positive gaps as strokes thicken. These explicit tip groups prevent the edited wide serifs from sealing the open letter spaces. The neutral drawing is unchanged.'] : []),
    ...(source.family === 'Sonnet' ? ['The a bowl moves right five units per 100 weight units to maintain its contact with the stem. In b and p, the lower inner bowl attachment tip moves right seven units to remove microscopic source crossing holes; the yen stem join moves left five units to remove a three-square-unit source hole. Previous outline-v1 snapshots are unchanged.'] : [])
  ];
const masters: WeightMasterData['masters'] = selected.map(master => {
    const target = decodeFreeFont(master.data), glyphs: FreeFontData['glyphs'] = {};
    for (const [ch, d] of Object.entries(original.glyphs)) {
      const made = master.weight === upstream.defaultWeight ? structuredClone(d) : transfer(d, reference.glyphs[ch], target.glyphs[ch], mappings[ch]);
      if (master.weight !== upstream.defaultWeight) constrain(d.contours, made.contours);
      repair(source.family, ch, d, made, master.weight);
      glyphs[ch] = [made.adv, made.contours.map(c => c.map(packNode))];
    }
    return { weight: master.weight, data: { ...source, glyphs, space: source.space + master.data.space - referenceData.data.space } };
  });
const validated = parseWeightMasters(packageMasters(source, upstream, masters, notes)), decoded = decodeWeightMasters(validated), neutral = interpolateMasters(decoded, upstream.defaultWeight);
const testWeights = [...new Set(selected.flatMap((m, i) => i ? [selected[i - 1].weight * .75 + m.weight * .25, (selected[i - 1].weight + m.weight) / 2, selected[i - 1].weight * .25 + m.weight * .75, m.weight] : [m.weight]))];
const results = testWeights.flatMap(weight => Object.entries(interpolateMasters(decoded, weight).glyphs).map(([ch, d]) => {
  const expected = topology(neutral.glyphs[ch].contours), actual = topology(d.contours);
  return { ch, weight, expected, actual, same: expected.pieces === actual.pieces && expected.counters === actual.counters };
}));
const repairs = Object.entries(neutral.glyphs).flatMap(([ch, d]) => {
  const before = original.glyphs[ch];
  if (JSON.stringify(before.contours) === JSON.stringify(d.contours)) return [];
  const delta = d.contours.flatMap((c, ci) => c.map((n, ni) => Math.hypot(n.x - before.contours[ci][ni].x, n.y - before.contours[ci][ni].y)));
  return [{ ch, maxAnchorDisplacement: Math.max(...delta), before: topology(before.contours), after: topology(d.contours) }];
});
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(validated) + '\n');
writeFileSync(outputPath + '.review.json', JSON.stringify({ source: source.id, weights, repairs, cases: results.length, failures: results.filter(r => !r.same), results }, null, 2) + '\n');
const style = styleById('didone');
if (!style) throw Error('Missing review style');
const base = buildFont(style.params);
const reviewText = process.env.REVIEW_TEXT ?? 'HAMBURGEFONTSIVWQ\nabcdefghijklmnopqrstuvwxyz\n0123456789!?@%&*“”';
const rows = selected.flatMap(master => {
  const font = interpolateMasters(decoded, master.weight);
  const display = { ...base, m: { ...base.m, cap: source.cap }, letter() { return this; },
    advance(ch: string) { return font.glyphs[ch]?.adv ?? font.space; },
    layout(text: string) { let x = 0; const items = [...text].map(ch => { const adv = font.glyphs[ch]?.adv ?? font.space, item = { ch, adv, x }; x += adv; return item; }); return [{ items, width: x }]; },
    glyph(ch: string) {
    const d = font.glyphs[ch], g = base.glyph(ch);
    if (!d || !g) return g;
    const cmds = drawnCmds(d.contours); return { ...g, drawn: d, cmds, d: cmdsToD(cmds), adv: d.adv };
  } };
  return reviewText.split('\n').map(text => ({ label: `${source.family} ${master.weight}`, text, font: display }));
});
writeFileSync(outputPath + '.png', rowsPNG(rows, 46));
writeFileSync(outputPath + '.svg', rowsSVG(rows, 46));
process.stdout.write(JSON.stringify({ source: source.id, weights, cases: results.length, repairs, failures: results.filter(r => !r.same).map(({ ch, weight, expected, actual }) => ({ ch, weight, expected, actual })) }) + '\n');
}
