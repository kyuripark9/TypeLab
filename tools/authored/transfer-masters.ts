import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeFreeFont, packNode, type FreeFontData } from '../../shared/engine/free';
import { drawnCmds, type Drawn, type Node } from '../../shared/engine/outline';
import { cmdsToD, toPolys, signedArea } from '../../shared/engine/geom';
import { shape, combine } from '../../shared/engine/boolean';
import { sourceForFont } from '../../shared/source/catalog';
import { parseSourceData } from '../../shared/source/data';
import { parseWeightMasters, decodeWeightMasters, interpolateMasters, type WeightMasterData } from '../../shared/source/masters';
import { buildFont } from '../../shared/engine';
import { DEFAULTS } from '../../shared/params';
import { rowsPNG, rowsSVG } from '../lib';

type FullNode = Required<Pick<Node, 'x' | 'y' | 'ix' | 'iy' | 'ox' | 'oy'>>;
type Alignment = { contour: number; reverse: boolean; start: number; cost: number };
type UpstreamFile = { file: string; url: string; sha256: string; copyright: string };
export type Upstream = { family: string; revision: string; defaultWeight: number; cap: number; xh: number;
  masters: { weight: number; data: FreeFontData }[]; files: UpstreamFile[] };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected object');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string { if (typeof value !== 'string') throw Error('Expected text'); return value; }
function number(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Expected finite number'); return value; }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw Error('Expected array'); return value; }
export function readUpstream(file: string, source: FreeFontData): Upstream {
  const value = object(JSON.parse(readFileSync(file, 'utf8'))), cap = number(value.cap), xh = number(value.xh);
  return { family: text(value.family), revision: text(value.revision), defaultWeight: number(value.defaultWeight), cap, xh,
    masters: array(value.masters).map(input => { const m = object(input); return {
      weight: number(m.weight), data: parseSourceData({ ...source, cap, xh, space: number(m.space), glyphs: m.glyphs }),
    }; }),
    files: array(value.files).map(input => { const f = object(input); return {
      file: text(f.file), url: text(f.url), sha256: text(f.sha256), copyright: f.copyright === undefined ? '' : text(f.copyright),
    }; }),
  };
}
export const full = (n: Node): FullNode => ({ x: n.x, y: n.y, ix: n.ix ?? n.x, iy: n.iy ?? n.y, ox: n.ox ?? n.x, oy: n.oy ?? n.y });
const rotate = <T>(c: T[], start: number): T[] => c.slice(start).concat(c.slice(0, start));
const reverse = (c: Node[]): FullNode[] => c.slice().reverse().map(n => {
  const p = full(n); return { x: p.x, y: p.y, ix: p.ox, iy: p.oy, ox: p.ix, oy: p.iy };
});
function contourAlignment(a: Node[], b: Node[], sx: number, sy: number): Omit<Alignment, 'contour'> | null {
  if (a.length !== b.length) return null;
  let best: Omit<Alignment, 'contour'> | null = null;
  for (const reversed of [false, true]) for (let start = 0; start < b.length; start++) {
    const paired = rotate(reversed ? reverse(b) : b.map(full), start);
    const cost = a.reduce((sum, node, i) => {
      const p = full(node), q = paired[i];
      return sum + (p.x - q.x * sx) ** 2 + (p.y - q.y * sy) ** 2
        + .2 * ((p.ix - q.ix * sx) ** 2 + (p.iy - q.iy * sy) ** 2 + (p.ox - q.ox * sx) ** 2 + (p.oy - q.oy * sy) ** 2);
    }, 0);
    if (!best || cost < best.cost) best = { cost, start, reverse: reversed };
  }
  return best;
}
export function matchGlyph(source: Drawn, reference: Drawn, sx: number, sy: number): Alignment[] | null {
  if (source.contours.length !== reference.contours.length) return null;
  const costs = source.contours.map(c => reference.contours.map(d => contourAlignment(c, d, sx, sy)));
  const searchResult: { best: { cost: number; pairs: Alignment[] } | null } = { best: null };
  function search(i: number, used: Set<number>, cost: number, pairs: Alignment[]): void {
    if (searchResult.best && cost >= searchResult.best.cost) return;
    if (i === costs.length) { searchResult.best = { cost, pairs }; return; }
    for (let j = 0; j < costs.length; j++) {
      const pair = costs[i][j];
      if (!used.has(j) && pair) search(i + 1, new Set([...used, j]), cost + pair.cost, [...pairs, { ...pair, contour: j }]);
    }
  }
  search(0, new Set(), 0, []);
  return searchResult.best?.pairs ?? null;
}
export function aligned(glyph: Drawn, mapping: Alignment[]): Drawn {
  return { adv: glyph.adv, contours: mapping.map(p => rotate(p.reverse ? reverse(glyph.contours[p.contour]) : glyph.contours[p.contour].map(full), p.start)) };
}
export function directTransfer(source: Drawn, reference: Drawn, target: Drawn, mapping: Alignment[], sx: number, sy: number): Drawn {
  const before = aligned(reference, mapping), after = aligned(target, mapping);
  return { adv: source.adv + (after.adv - before.adv) * sx, contours: source.contours.map((c, ci) => c.map((node, ni) => {
    const n = full(node), a = full(before.contours[ci][ni]), b = full(after.contours[ci][ni]);
    return { x: n.x + (b.x - a.x) * sx, y: n.y + (b.y - a.y) * sy,
      ix: n.ix + (b.ix - a.ix) * sx, iy: n.iy + (b.iy - a.iy) * sy,
      ox: n.ox + (b.ox - a.ox) * sx, oy: n.oy + (b.oy - a.oy) * sy };
  })) };
}
function neutralGlyph(style: string, ch: string, glyph: Drawn): Drawn {
  const contours = glyph.contours.map(c => c.map(full));
  if (style === 'Hearth' && ch === 'K') contours[1].splice(2, 0, { ...contours[1][2] });
  if (style === 'Hearth' && ch === 'w') contours[0].splice(8, 0, { ...contours[0][8] });
  return { adv: glyph.adv, contours };
}
const mix = (a: Pick<Node, 'x' | 'y'>, b: Pick<Node, 'x' | 'y'>, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function repair(style: string, ch: string, glyph: Drawn): void {
  if (style !== 'Hearth') return;
  const c = glyph.contours[0];
  if (ch === '^') {
    const x = (c[6].x + c[7].x) / 2, y = (c[6].y + c[7].y) / 2;
    for (const i of [6, 7]) c[i] = { x, y, ix: x, iy: y, ox: x, oy: y };
  }
  if (ch === '€') {
    const a = full(c[2]), b = full(c[3]), p0 = a, p1 = { x: a.ox, y: a.oy }, p2 = { x: b.ix, y: b.iy }, p3 = b, target = c[5].y;
    const point = (t: number) => mix(mix(mix(p0, p1, t), mix(p1, p2, t), t), mix(mix(p1, p2, t), mix(p2, p3, t), t), t);
    if (!(target >= p0.y && target <= p3.y)) throw Error('Euro join outside cubic');
    let low = 0, high = 1;
    for (let j = 0; j < 48; j++) { const t = (low + high) / 2; if (point(t).y < target) low = t; else high = t; }
    const t = (low + high) / 2, ab = mix(p0, p1, t), bc = mix(p1, p2, t), cd = mix(p2, p3, t), abc = mix(ab, bc, t), end = mix(abc, mix(bc, cd, t), t);
    end.y = target; c[2].ox = ab.x; c[2].oy = ab.y;
    c[3] = { ...end, ix: abc.x, iy: abc.y, ox: end.x, oy: end.y };
    c[4] = { ...end, ix: end.x, iy: end.y, ox: end.x, oy: end.y };
  }
}
export function packageMasters(source: FreeFontData, upstream: Upstream, masters: WeightMasterData['masters'], notes: string[]): WeightMasterData {
  const ref = sourceForFont(source.id);
  if (!ref || ref.kind !== 'outline-v1') throw Error('Missing immutable source reference');
  const licenseFile = upstream.files.find(f => /\/(?:OFL|LICENSE)\.txt$/.test(f.file));
  if (!licenseFile) throw Error(`Missing ${upstream.family} license`);
  const notice = readFileSync(licenseFile.file, 'utf8'), apache = notice.includes('Apache License'), metadata = upstream.files.find(f => f.file.endsWith('METADATA.pb'));
  const designer = metadata ? readFileSync(metadata.file, 'utf8').match(/^designer: "([^"]+)"/m)?.[1] : undefined;
  const copyrights = [...new Set(upstream.files.map(f => f.copyright).filter(Boolean))].join('\n');
  const credits = { designers: [...new Set([...source.designers, ...(designer ? [designer] : [])])], copyright: `${source.copyright}\n${copyrights}`,
    license: apache ? 'SIL Open Font License, Version 1.1 and Apache License, Version 2.0' : 'SIL Open Font License, Version 1.1',
    licenseUrl: apache ? 'https://www.apache.org/licenses/LICENSE-2.0' : 'https://openfontlicense.org',
    licenseText: `${source.licenseText ?? readFileSync('fonts/OFL.txt', 'utf8')}\n\nAuthored upstream weight masters (${upstream.family}):\n${copyrights}\n\n${notice}` };
  return parseWeightMasters({ format: 'weight-masters-v1', source: ref, defaultWeight: upstream.defaultWeight,
    masters: masters.map(m => ({ weight: m.weight, data: { ...m.data, ...credits } })), notes,
    provenance: upstream.files.map(f => ({ family: upstream.family, url: f.url, revision: upstream.revision, sha256: f.sha256 })) });
}
export function topology(contours: Node[][]) {
  const ink = shape(toPolys(drawnCmds(contours))), areas = combine([ink], ink.has).map(signedArea).filter(a => Math.abs(a) > .1);
  return { pieces: areas.filter(a => a > 0).length, counters: areas.filter(a => a < 0).length, area: areas.reduce((sum, a) => sum + a, 0) };
}
export function atWeights(data: WeightMasterData, weights: number[]): WeightMasterData {
  const decoded = decodeWeightMasters(data), low = data.masters[0].weight, high = data.masters[data.masters.length - 1].weight;
  if (weights.some(w => w < low || w > high)) throw Error('Requested weight outside authored range');
  return parseWeightMasters({ ...data, masters: weights.map(weight => {
    const exact = data.masters.find(m => m.weight === weight);
    if (exact) return exact;
    const font = interpolateMasters(decoded, weight), glyphs: FreeFontData['glyphs'] = {};
    for (const [ch, glyph] of Object.entries(font.glyphs)) glyphs[ch] = [glyph.adv, glyph.contours.map(c => c.map(packNode))];
    return { weight, data: { ...data.masters[0].data, space: font.space, glyphs } };
  }) });
}
export function reviewPackage(data: WeightMasterData, output: string): { cases: number; failures: { ch: string; weight: number }[] } {
  const decoded = decodeWeightMasters(data), neutral = interpolateMasters(decoded, data.defaultWeight);
  const expected = Object.fromEntries(Object.entries(neutral.glyphs).map(([ch, g]) => [ch, topology(g.contours)]));
  const weights = data.masters.flatMap((m, i) => i ? [data.masters[i - 1].weight * .75 + m.weight * .25, (data.masters[i - 1].weight + m.weight) / 2, data.masters[i - 1].weight * .25 + m.weight * .75, m.weight] : [m.weight]);
  const results = weights.flatMap(weight => Object.entries(interpolateMasters(decoded, weight).glyphs).map(([ch, g]) => {
    const actual = topology(g.contours), base = expected[ch];
    return { ch, weight, actual, expected: base, same: actual.pieces === base.pieces && actual.counters === base.counters, areaRatio: actual.area / base.area };
  }));
  const failures = results.filter(r => !r.same);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(data) + '\n');
  writeFileSync(output + '.review.json', JSON.stringify({ source: data.source.fontId, cases: results.length, failures, results }, null, 2) + '\n');
  renderPackage(data, output);
  return { cases: results.length, failures: failures.map(({ ch, weight }) => ({ ch, weight })) };
}
export function renderPackage(data: WeightMasterData, output: string): void {
  const decoded = decodeWeightMasters(data), base = buildFont(DEFAULTS);
  const reviewText = process.env.REVIEW_TEXT ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789.,:;…!¡?¿\'"‘’“”‚„‹›«»\n()[]{}-–—_/\\|·•&@#$¢€£¥%+−×÷=<>±~^*°©®™§¶†‡`';
  const rows = data.masters.flatMap(master => {
    const font = interpolateMasters(decoded, master.weight);
    const display = { ...base, m: { ...base.m, cap: data.masters[0].data.cap }, letter() { return this; },
      advance(ch: string) { return font.glyphs[ch]?.adv ?? font.space; },
      layout(text: string) { let x = 0; const items = [...text].map(ch => { const adv = font.glyphs[ch]?.adv ?? font.space, item = { ch, adv, x }; x += adv; return item; }); return [{ items, width: x }]; },
      glyph(ch: string) { const d = font.glyphs[ch], g = base.glyph(ch); if (!d || !g) return g;
        const cmds = drawnCmds(d.contours); return { ...g, drawn: d, cmds, d: cmdsToD(cmds), adv: d.adv }; } };
    return reviewText.split('\n').map(text => ({ label: `${master.data.family} ${master.weight}`, text, font: display }));
  });
  writeFileSync(output + '.png', rowsPNG(rows, 46)); writeFileSync(output + '.svg', rowsSVG(rows, 46));
}
export function authorDirect(source: FreeFontData, upstream: Upstream, weights: number[]): WeightMasterData {
  const original = decodeFreeFont(source), referenceData = upstream.masters.find(m => m.weight === upstream.defaultWeight);
  if (!referenceData || !weights.includes(upstream.defaultWeight)) throw Error('Weights must include the default');
  const reference = decodeFreeFont(referenceData.data), sx = source.space / reference.space, sy = source.cap / upstream.cap;
  const neutral = Object.fromEntries(Object.entries(original.glyphs).map(([ch, g]) => [ch, neutralGlyph(source.family, ch, g)]));
  const mappings = Object.fromEntries(Object.entries(neutral).map(([ch, g]) => {
    const match = matchGlyph(g, reference.glyphs[ch], sx, sy);
    if (!match) throw Error(`${source.family} ${ch}: incompatible source nodes`);
    return [ch, match];
  }));
  const masters = upstream.masters.filter(m => weights.includes(m.weight)).map(master => {
    const target = decodeFreeFont(master.data), glyphs: FreeFontData['glyphs'] = {};
    for (const [ch, glyph] of Object.entries(neutral)) {
      if (JSON.stringify(reference.glyphs[ch].contours.map(c => c.length)) !== JSON.stringify(target.glyphs[ch].contours.map(c => c.length))) throw Error(`${source.family} ${ch} ${master.weight}: incompatible upstream nodes`);
      const made = directTransfer(glyph, reference.glyphs[ch], target.glyphs[ch], mappings[ch], sx, sy);
      repair(source.family, ch, made); glyphs[ch] = [made.adv, made.contours.map(c => c.map(packNode))];
    }
    return { weight: master.weight, data: { ...source, glyphs, space: source.space + (master.data.space - reference.space) * sx } };
  });
  if (masters.length !== weights.length) throw Error('Requested weight unavailable');
  return packageMasters(source, upstream, masters, ['Authored upstream weight deltas transferred onto the edited source after contour assignment, winding and cyclic start alignment.',
    'Straight edges are represented as degenerate cubics to preserve handle correspondence.',
    ...(source.family === 'Hearth' ? ['K contour 1 node 2 and w contour 0 node 8 gain a duplicate anchor at their source-collapsed knees.',
      'Caret contour 0 nodes 6 and 7 are merged to remove its pre-existing 2.52-square-unit self-intersection.',
      'Euro contour 0 edge 2 is split exactly at node 5 y; nodes 3 and 4 collapse at that lower-bar join, removing the reversed internal stub.'] : [])]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [sourcePath, extractedPath, outputPath, weightsText] = process.argv.slice(2);
  if (!sourcePath || !extractedPath || !outputPath || !weightsText) throw Error('Usage: transfer-masters.ts source.json extracted.json package.json 300,400,500');
  const source = parseSourceData(JSON.parse(readFileSync(sourcePath, 'utf8'))), upstream = readUpstream(extractedPath, source);
  const data = authorDirect(source, upstream, weightsText.split(',').map(Number));
  const review = reviewPackage(data, outputPath);
  process.stdout.write(JSON.stringify({ source: source.id, weights: data.masters.map(m => m.weight), ...review }) + '\n');
  if (review.failures.length) process.exitCode = 1;
}
