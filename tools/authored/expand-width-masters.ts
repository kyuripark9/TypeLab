/* Author experimental local expanded widths. Candidate reports do not publish or enable these drawings. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeFreeFont, packNode, type FreeFontData } from '../../shared/engine/free';
import { cmdsBox } from '../../shared/engine/geom';
import { drawnCmds, type Drawn, type Node } from '../../shared/engine/outline';
import { parseWeightMasters } from '../../shared/source/masters';
import { constrain } from './serif-masters';
import { parseWidthPrototype, renderWidthGrid, reviewWidthGrid, type WeightWidthPrototype, type WidthSample } from './width-masters';

function beyond(n: Node, narrow: Node, amount: number): Node {
  const made: Node = { ...n, x: n.x + (n.x - narrow.x) * amount };
  if (n.ix !== undefined && n.iy !== undefined && narrow.ix !== undefined && narrow.iy !== undefined) {
    made.ix = n.ix + (n.ix - narrow.ix) * amount;
  }
  if (n.ox !== undefined && n.oy !== undefined && narrow.ox !== undefined && narrow.oy !== undefined) {
    made.ox = n.ox + (n.ox - narrow.ox) * amount;
  }
  return made;
}
function moved(n: Node, dx: number): Node {
  return { ...n, x: n.x + dx,
    ...(n.ix !== undefined ? { ix: n.ix + dx } : {}), ...(n.ox !== undefined ? { ox: n.ox + dx } : {}) };
}
function bodyWidth(g: Drawn): number {
  const box = cmdsBox(drawnCmds(g.contours));
  if (!box) throw Error('Local width recipe needs a nonempty drawing');
  return box.x1 - box.x0;
}
function parlanceDetails(character: string, source: Drawn, contours: Node[][], growth: number): number {
  if (character === 'v') {
    const before = source.contours[0], after = contours[0];
    const dx = (after[5].x + after[6].x - before[5].x - before[6].x) / 2;
    for (let i = 3; i <= 8; i++) after[i] = moved(before[i], dx);
  }
  if (character !== '®') return 0;
  const outer = cmdsBox(drawnCmds([source.contours[3]]));
  if (!outer) throw Error('Registered sign lacks its outer ring');
  const delta = (outer.x1 - outer.x0) * growth / 2;
  for (let ci = 0; ci < contours.length; ci++) {
    if (ci < 2) { contours[ci] = contours[ci].map(n => moved(n, delta)); continue; }
    const box = cmdsBox(drawnCmds([source.contours[ci]]));
    if (!box) throw Error('Registered sign lacks its paired ring');
    const center = (box.x0 + box.x1) / 2, scale = 1 + 2 * delta / (box.x1 - box.x0);
    const map = (x: number) => center + (x - center) * scale + delta;
    contours[ci] = source.contours[ci].map(n => ({ ...n, x: map(n.x),
      ...(n.ix !== undefined ? { ix: map(n.ix) } : {}), ...(n.ox !== undefined ? { ox: map(n.ox) } : {}) }));
  }
  return 2 * delta;
}

export function localExpansion(native: WeightWidthPrototype, widths: number[]): WeightWidthPrototype {
  if (native.axis.max !== native.axis.neutral) throw Error('This recipe extends a one-sided condensed source only');
  const selected = [...new Set(widths)].sort((a, b) => a - b);
  if (!selected.length || selected.some(w => !Number.isFinite(w) || w <= native.axis.max)) throw Error('Local widths must lie beyond the native maximum');
  const samples: WidthSample[] = [...native.samples], neutral = native.samples.filter(s => s.width === native.axis.neutral);
  for (const source of neutral) {
    const narrow = native.samples.find(s => s.weight === source.weight && s.width === native.axis.min);
    if (!narrow) throw Error('Missing native condensed endpoint');
    const base = decodeFreeFont(source.data), condensed = decodeFreeFont(narrow.data);
    for (const width of selected) {
      const amount = (width - native.axis.neutral) / (native.axis.neutral - native.axis.min), glyphs: FreeFontData['glyphs'] = {};
      const growth = (bodyWidth(base.glyphs.H) - bodyWidth(condensed.glyphs.H)) / bodyWidth(base.glyphs.H) * amount;
      for (const [ch, g] of Object.entries(base.glyphs)) {
        const small = condensed.glyphs[ch];
        const contours = g.contours.map((c, ci) => c.map((n, ni) => beyond(n, small.contours[ci][ni], amount)));
        const spacing = base.family === 'Parlance' ? parlanceDetails(ch, g, contours, growth) : 0;
        constrain(g.contours, contours);
        glyphs[ch] = [g.adv + (g.adv - small.adv) * amount + spacing,
          contours.map(c => c.map(packNode))];
      }
      samples.push({ weight: source.weight, width, data: { ...source.data, glyphs, space: base.space + (base.space - condensed.space) * amount } });
    }
  }
  return parseWidthPrototype({ ...native, axis: { ...native.axis, max: selected[selected.length - 1] }, samples,
    notes: [...native.notes, `Widths ${selected.join(', ')} are new local expanded designs, not upstream instances. They reverse the horizontal component of the family-specific condensed motion at each weight, with separate geometry and optical review.`,
      'All vertical anchor and handle coordinates remain exactly those of the existing weight family. Reversing upstream vertical movements swapped short bowl-span endpoints in o and g, so the local width recipe preserves the original vertical construction.',
      'Curve handles that were monotone along a coordinate in the original drawing remain between their endpoint coordinates, preventing extrapolated control-point overshoot.',
      ...(native.base.fontId.startsWith('Parlance:') ? ['The v inner apex (nodes 3–8) retains its weight-specific shape and translates with the aperture center. Registered-sign ring contours 2 and 3 gain the same horizontal radius increment, retaining side-stroke thickness; its inner R remains centered and its advance grows with the ring.'] : []),
      'The native width grid and neutral family remain unchanged. No new upstream width coordinates or provenance are claimed.'] });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, coordinates] = process.argv.slice(2);
  if (!input || !output || !coordinates) throw Error('Usage: expand-width-masters.ts native-prototype.json local-prototype.json 125,150');
  if (resolve(input) === resolve(output)) throw Error('Local expansion must not overwrite the native prototype');
  const native = parseWidthPrototype(JSON.parse(readFileSync(input, 'utf8')));
  const original = parseWeightMasters(JSON.parse(readFileSync(`fonts/masters/${native.base.digest}.json`, 'utf8')));
  const local = localExpansion(native, coordinates.split(',').map(Number));
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(local) + '\n');
  const review = reviewWidthGrid(local, original, process.env.WIDTH_REVIEW_CHARS);
  writeFileSync(output + '.review.json', JSON.stringify(review, null, 2) + '\n'); renderWidthGrid(local, output);
  process.stdout.write(JSON.stringify({ source: native.base.fontId, samples: local.samples.length, cases: review.cases, neutralExact: review.neutralExact,
    failureCount: review.failures.length, failures: review.failures.slice(0, 20).map(({ ch, weight, width }) => ({ ch, weight, width })) }) + '\n');
  if (!review.neutralExact || review.failures.length) process.exitCode = 1;
}
