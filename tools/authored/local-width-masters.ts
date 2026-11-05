/* Compile local width drawings through a smooth horizontal map, with exact shared neutral cuts. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeFreeFont, packNode, type FreeFontData } from '../../shared/engine/free';
import { cmdsBox, cubicAt, subCubic, toPolys } from '../../shared/engine/geom';
import { drawnCmds, segment, type Drawn, type Node } from '../../shared/engine/outline';
import { sourceDot } from '../../shared/source/features';
import type { MasterSourceRef } from '../../shared/source/model';
import { parseWeightMasters, type WeightMasterData } from '../../shared/source/masters';
import type { MasterSubdivisionData, SubdivisionSegment } from '../../shared/source/subdivision';
import { parseWidthPrototype, renderWidthGrid, reviewWidthGrid, type WeightWidthPrototype } from './width-masters';

interface Point { x: number; y: number }
export interface LocalWidthRecipe {
  style: string; widths: number[]; columns: number; rows: number; blurCap: number;
  minDerivative: number; maxCurveError: number; rigidGlyphs: string; dotGlyphs: string;
  preserveAdvanceRatio?: boolean;
}
export type SegmentInterval = SubdivisionSegment;
export type SubdivisionBinding = MasterSubdivisionData;
interface HorizontalMap { point(x: number): number; derivative(x: number): number; minDerivative: number }
interface GlyphMap { contours: HorizontalMap[]; advance: number }
export interface LocalWidthResult {
  base: WeightMasterData; data: WeightWidthPrototype; binding: SubdivisionBinding;
  review: { minDerivative: number; maxCurveError: number; neutralError: number; oldNodes: number; newNodes: number;
    regularized: { ch: string; weight: number; floor: number }[] };
}
export interface LocalWidthFeatureDrawing { glyph: string; weight: number; drawing: Drawn }

export const COTTON_WIDTH: LocalWidthRecipe = {
  style: 'Cotton', widths: [85, 100, 115], columns: 160, rows: 80, blurCap: .014,
  minDerivative: .2, maxCurveError: .025, rigidGlyphs: 'iIl!¡|.,:;\'"‘’“”„‚·•`', dotGlyphs: 'ij?:;¿…',
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function curve(contour: Node[], index: number): Point[] {
  const a = contour[index], b = contour[(index + 1) % contour.length];
  return segment(a, b) ?? [a, { x: lerp(a.x, b.x, 1 / 3), y: lerp(a.y, b.y, 1 / 3) },
    { x: lerp(a.x, b.x, 2 / 3), y: lerp(a.y, b.y, 2 / 3) }, b];
}
function bounds(contours: Node[][]) {
  const box = cmdsBox(drawnCmds(contours));
  if (!box || box.x1 <= box.x0 || box.y1 <= box.y0) throw Error('Width recipe needs nonempty bounds');
  return box;
}
const identity: HorizontalMap = { point: x => x, derivative: () => 1, minDerivative: 1 };
const translation = (dx: number): HorizontalMap => ({ point: x => x + dx, derivative: () => 1, minDerivative: 1 });

function density(glyph: Drawn, cap: number, recipe: LocalWidthRecipe) {
  const box = bounds(glyph.contours), pad = cap * .04, left = box.x0 - pad, right = box.x1 + pad;
  const dx = (right - left) / recipe.columns, polys = toPolys(drawnCmds(glyph.contours));
  const filled = Array.from({ length: recipe.columns + 1 }, () => 0);
  for (let row = 0; row < recipe.rows; row++) {
    const y = lerp(box.y0, box.y1, (row + .5) / recipe.rows), crossings: { x: number; winding: number }[] = [];
    for (const poly of polys) for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) crossings.push({ x: a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y), winding: b.y > a.y ? 1 : -1 });
    }
    crossings.sort((a, b) => a.x - b.x);
    let winding = 0, ci = 0;
    for (let col = 0; col < filled.length; col++) {
      const x = left + col * dx;
      while (ci < crossings.length && crossings[ci].x <= x) winding += crossings[ci++].winding;
      if (winding) filled[col]++;
    }
  }
  const sigma = cap * recipe.blurCap / dx, radius = Math.ceil(sigma * 3);
  const blurred = filled.map((_value, i) => {
    let value = 0, total = 0;
    for (let j = -radius; j <= radius; j++) {
      const weight = Math.exp(-.5 * (j / sigma) ** 2);
      value += (filled[i + j] ?? 0) * weight; total += weight;
    }
    return value / total;
  });
  const peak = Math.max(...blurred);
  if (!peak) throw Error('Cannot measure an empty glyph');
  let speed = blurred.map(value => (1 - value / peak) ** 2), integral = [0];
  function integrate() {
    integral = [0];
    for (let i = 1; i < speed.length; i++) integral.push(integral[i - 1] + dx * (speed[i - 1] + speed[i]) / 2);
  }
  integrate();
  function evaluate(x: number) {
    if (x <= left) return { integral: (x - left) * speed[0], speed: speed[0] };
    if (x >= right) return { integral: integral[integral.length - 1] + (x - right) * speed[speed.length - 1], speed: speed[speed.length - 1] };
    const p = (x - left) / dx, i = Math.floor(p), t = p - i, a = speed[i], b = speed[i + 1];
    return { integral: integral[i] + dx * (a * t + (b - a) * (t ** 3 - .5 * t ** 4)), speed: a + (b - a) * t * t * (3 - 2 * t) };
  }
  const mean = (evaluate(box.x1).integral - evaluate(box.x0).integral) / (box.x1 - box.x0);
  const compression = Math.max(0, 1 - Math.min(...recipe.widths) / 100), ratio = compression ? (1 - recipe.minDerivative) / compression : Infinity;
  const floor = Math.max(.035, Number.isFinite(ratio) ? (Math.max(...speed) - ratio * mean) / (ratio - 1) + 1e-6 : .035);
  speed = speed.map(value => value + floor); integrate();
  const start = evaluate(box.x0).integral, span = evaluate(box.x1).integral - start;
  const at = (amount: number): HorizontalMap => {
    const strength = (box.x1 - box.x0) * amount / span;
    const minDerivative = 1 + strength * (strength < 0 ? Math.max(...speed) : Math.min(...speed));
    return { point: x => x + strength * (evaluate(x).integral - start), derivative: x => 1 + strength * evaluate(x).speed, minDerivative };
  };
  return { at, floor };
}

function dotContours(character: string, glyph: Drawn, cap: number, digest: string, recipe: LocalWidthRecipe): number[] {
  const declared = sourceDot(digest, character);
  if (declared) return [...declared.contours];
  if (!recipe.dotGlyphs.includes(character)) return [];
  return glyph.contours.flatMap((c, i) => {
    const b = bounds([c]), w = b.x1 - b.x0, h = b.y1 - b.y0;
    return h < cap * .23 && w / h > .65 && w / h < 1.45 ? [i] : [];
  });
}
function mappedGlyph(glyph: Drawn, width: number, field: (amount: number) => HorizontalMap, rigid: boolean, dots: number[], preserveAdvanceRatio = false): GlyphMap {
  if (width === 100) return { contours: glyph.contours.map(() => identity), advance: glyph.adv };
  const amount = width / 100 - 1;
  if (rigid) return { contours: glyph.contours.map(() => translation(glyph.adv * amount / 2)), advance: glyph.adv * (1 + amount) };
  const fieldMap = field(amount), b = bounds(glyph.contours), bodyChange = (b.x1 - b.x0) * amount;
  const advance = preserveAdvanceRatio ? glyph.adv * (1 + amount) : glyph.adv + bodyChange;
  const offset = preserveAdvanceRatio ? (advance - glyph.adv - bodyChange) / 2 : 0;
  const map: HorizontalMap = offset === 0 ? fieldMap : { ...fieldMap, point: x => fieldMap.point(x) + offset };
  return { advance, contours: glyph.contours.map((c, i) => {
    if (!dots.includes(i)) return map;
    const box = bounds([c]), center = (box.x0 + box.x1) / 2;
    return translation(map.point(center) - center);
  }) };
}
function fit(c: Point[], map: HorizontalMap): Point[] {
  const a = map.point(c[0].x), b = map.point(c[3].x);
  return [{ x: a, y: c[0].y }, { x: a + map.derivative(c[0].x) * (c[1].x - c[0].x), y: c[1].y },
    { x: b + map.derivative(c[3].x) * (c[2].x - c[3].x), y: c[2].y }, { x: b, y: c[3].y }];
}
function error(c: Point[], made: Point[], map: HorizontalMap): number {
  let maximum = 0;
  for (const t of [.125, .25, .375, .5, .625, .75, .875]) {
    const p = cubicAt(c, t), q = cubicAt(made, t);
    maximum = Math.max(maximum, Math.hypot(map.point(p.x) - q.x, p.y - q.y));
  }
  return maximum;
}
function nodes(curves: Point[][]): Node[] {
  return curves.map((c, i) => {
    const previous = curves[(i + curves.length - 1) % curves.length];
    return { x: c[0].x, y: c[0].y, ix: previous[2].x, iy: previous[2].y, ox: c[1].x, oy: c[1].y };
  });
}

export function authorLocalWidths(original: WeightMasterData, from: MasterSourceRef, recipe: LocalWidthRecipe,
  features: readonly LocalWidthFeatureDrawing[] = []): LocalWidthResult {
  const neutral = original.masters.find(m => m.weight === original.defaultWeight);
  if (!neutral || neutral.data.family !== recipe.style || !recipe.widths.includes(100)) throw Error('Recipe does not match this family');
  const fonts = original.masters.map(m => decodeFreeFont(m.data));
  const neutralFont = decodeFreeFont(neutral.data), glyphs: SubdivisionBinding['glyphs'] = {};
  const packed = recipe.widths.map(() => original.masters.map((): FreeFontData['glyphs'] => ({})));
  let minimum = 1, maximumError = 0, neutralError = 0, oldNodes = 0, newNodes = 0;
  const regularized: LocalWidthResult['review']['regularized'] = [];
  for (const ch of Object.keys(neutralFont.glyphs)) {
    const source = fonts.map(f => f.glyphs[ch]), dots = dotContours(ch, neutralFont.glyphs[ch], neutralFont.cap, original.source.digest, recipe);
    const extra = source.map((_glyph, wi) => features.filter(f => f.glyph === ch && f.weight === original.masters[wi].weight).map(f => f.drawing));
    const maps = source.map((g, wi) => {
      const field = density(g, fonts[wi].cap, recipe);
      if (field.floor > .036 && !recipe.rigidGlyphs.includes(ch)) regularized.push({ ch, weight: original.masters[wi].weight, floor: field.floor });
      return recipe.widths.map(width => mappedGlyph(g, width, field.at, recipe.rigidGlyphs.includes(ch), dots, recipe.preserveAdvanceRatio));
    });
    for (const row of maps) for (const map of row) for (const c of map.contours) minimum = Math.min(minimum, c.minDerivative);
    if (minimum < recipe.minDerivative) throw Error(`${ch}: horizontal map derivative ${minimum} is below ${recipe.minDerivative}`);
    const intervals: SegmentInterval[][] = source[0].contours.map((contour, ci) => contour.flatMap((_node, si) => {
      const curves = source.map(g => curve(g.contours[ci], si)), cuts: SegmentInterval[] = [];
      function divide(t0: number, t1: number, depth: number): void {
        let miss = 0;
        for (let wi = 0; wi < curves.length; wi++) for (let di = 0; di < recipe.widths.length; di++) {
          const c = subCubic(curves[wi], t0, t1), map = maps[wi][di].contours[ci];
          miss = Math.max(miss, error(c, fit(c, map), map));
          for (const drawing of extra[wi]) {
            const part = subCubic(curve(drawing.contours[ci], si), t0, t1);
            miss = Math.max(miss, error(part, fit(part, map), map));
          }
        }
        if (miss > recipe.maxCurveError) {
          if (depth >= 12) throw Error(`${ch}: cannot fit smooth width map within ${recipe.maxCurveError}`);
          const mid = (t0 + t1) / 2; divide(t0, mid, depth + 1); divide(mid, t1, depth + 1);
        } else { maximumError = Math.max(maximumError, miss); cuts.push({ segment: si, t0, t1 }); }
      }
      divide(0, 1, 0); return cuts;
    }));
    glyphs[ch] = intervals;
    oldNodes += source[0].contours.reduce((sum, c) => sum + c.length, 0);
    newNodes += intervals.reduce((sum, c) => sum + c.length, 0);
    for (let wi = 0; wi < source.length; wi++) for (let di = 0; di < recipe.widths.length; di++) {
      const g = source[wi], map = maps[wi][di];
      const contours = intervals.map((ranges, ci) => nodes(ranges.map(range => {
        const originalCurve = curve(g.contours[ci], range.segment), part = subCubic(originalCurve, range.t0, range.t1);
        const made = recipe.widths[di] === 100 ? part : fit(part, map.contours[ci]);
        if (recipe.widths[di] === 100) for (const t of [.25, .5, .75]) {
          const a = cubicAt(originalCurve, lerp(range.t0, range.t1, t)), b = cubicAt(made, t);
          neutralError = Math.max(neutralError, Math.hypot(a.x - b.x, a.y - b.y));
        }
        return made;
      })));
      packed[di][wi][ch] = [map.advance, contours.map(c => c.map(packNode))];
    }
  }
  const neutralIndex = recipe.widths.indexOf(100);
  const notes = [`Local width recipe ${recipe.style}: a smooth horizontal ink/space field, compiled to compatible Bézier drawings. These are new TypeLab designs, not upstream width instances.`,
    `Shared exact cuts retain the neutral family; every new segment records its old segment and parameter interval in a separate master-subdivision-v1 binding. Maximum sampled fit error ${recipe.maxCurveError} font units.`,
    `Rigid glyph constructions ${recipe.rigidGlyphs} retain their ink shape and gain centered spacing. Dots on ${recipe.dotGlyphs} translate without distortion. Other glyphs preserve vertical coordinates and distribute width through horizontal white space.`];
  const base = parseWeightMasters({ ...original, masters: original.masters.map((m, wi) => ({ weight: m.weight, data: { ...m.data, glyphs: packed[neutralIndex][wi] } })),
    notes: [...original.notes, ...notes] });
  const bytes = JSON.stringify(base) + '\n', to: MasterSourceRef = { kind: 'masters-v1', digest: createHash('sha256').update(bytes).digest('hex'), fontId: from.fontId };
  const data = parseWidthPrototype({ format: 'weight-width-prototype-v1', base: to, source: original.source, defaultWeight: original.defaultWeight,
    axis: { min: Math.min(...recipe.widths), neutral: 100, max: Math.max(...recipe.widths) },
    samples: recipe.widths.flatMap((width, di) => original.masters.map((m, wi) => ({ weight: m.weight, width,
      data: width === 100 ? base.masters[wi].data : { ...m.data, glyphs: packed[di][wi], space: m.data.space * width / 100 } }))),
    provenance: original.provenance, notes });
  return { base, data, binding: { format: 'master-subdivision-v1', from, to, glyphs },
    review: { minDerivative: minimum, maxCurveError: maximumError, neutralError, oldNodes, newNodes, regularized } };
}

/** Apply the family's same width field to a compatible feature endpoint in its shared point basis. */
export function mapLocalWidthFeature(reference: Drawn, drawing: Drawn, character: string, cap: number, digest: string,
  width: number, recipe: LocalWidthRecipe, intervals: SegmentInterval[][]): Drawn {
  const dots = dotContours(character, reference, cap, digest, recipe), field = density(reference, cap, recipe);
  const map = mappedGlyph(reference, width, field.at, recipe.rigidGlyphs.includes(character), dots, recipe.preserveAdvanceRatio);
  const contours = intervals.map((ranges, ci) => nodes(ranges.map(range => {
    const part = subCubic(curve(drawing.contours[ci], range.segment), range.t0, range.t1);
    if (width === 100) return part;
    const made = fit(part, map.contours[ci]);
    if (error(part, made, map.contours[ci]) > recipe.maxCurveError + 1e-9) throw Error(`${character}: feature width fit exceeds its authored tolerance`);
    return made;
  })));
  return { adv: width === 100 ? drawing.adv : map.advance + (drawing.adv - reference.adv), contours };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw Error('Usage: local-width-masters.ts Cotton-weight-package.json output-prefix');
  if (resolve(input) === resolve(output + '-base.json')) throw Error('Local width authoring must not overwrite its input base');
  const bytes = readFileSync(input), original = parseWeightMasters(JSON.parse(bytes.toString('utf8')));
  const from: MasterSourceRef = { kind: 'masters-v1', digest: createHash('sha256').update(bytes).digest('hex'), fontId: original.source.fontId };
  const result = authorLocalWidths(original, from, COTTON_WIDTH);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output + '-base.json', JSON.stringify(result.base) + '\n');
  writeFileSync(output + '-prototype.json', JSON.stringify(result.data) + '\n');
  writeFileSync(output + '-binding.json', JSON.stringify(result.binding) + '\n');
  const review = reviewWidthGrid(result.data, result.base, process.env.WIDTH_REVIEW_CHARS);
  writeFileSync(output + '-review.json', JSON.stringify({ ...result.review, ...review }, null, 2) + '\n');
  renderWidthGrid(result.data, output);
  const { regularized, ...measurements } = result.review;
  process.stdout.write(JSON.stringify({ style: COTTON_WIDTH.style, ...measurements, regularizedCases: regularized.length, cases: review.cases, neutralExact: review.neutralExact,
    failures: review.failures.map(({ ch, weight, width }) => ({ ch, weight, width })) }) + '\n');
  if (!review.neutralExact || review.failures.length) process.exitCode = 1;
}

/** The same field and fitting, for drawings other than a family's own letters (its alternate letter forms). */
export { curve as widthCurve, density as widthField, mappedGlyph as widthMap, fit as fitWidth, error as widthFitError, nodes as widthNodes,
  dotContours as widthDots };
