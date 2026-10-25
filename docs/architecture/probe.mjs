// Small, repeatable observations used by the architecture proposal. No files are changed.
// Run from an installed checkout: node --import tsx docs/architecture/probe.mjs <checkout> <controls|heights|weight>
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkout, mode] = process.argv.slice(2);
if (!checkout || !['controls', 'heights', 'weight'].includes(mode)) {
  throw new Error('Usage: probe.mjs <checkout> <controls|heights|weight>');
}
const root = resolve(checkout);
const load = file => import(pathToFileURL(resolve(root, file)).href);
const hash = glyph => createHash('sha256')
  .update(JSON.stringify({ cmds: glyph.cmds, adv: glyph.adv })).digest('hex').slice(0, 12);

if (mode === 'controls') {
  const { styleParams } = await load('tools/lib.ts');
  const { buildFont } = await load(existsSync(resolve(root, 'engine/index.ts')) ? 'engine/index.ts' : 'shared/engine/index.ts');
  const base = await styleParams('grotesque', true);
  const results = [];
  for (const [key, ch] of [['aperture', 'c'], ['dotSize', 'i'], ['width', 'H'], ['weight', 'H']]) {
    const hashes = [0, 0.5, 1].map(value => hash(buildFont({ ...base, [key]: value }).glyph(ch)));
    results.push({ key, ch, values: [0, 0.5, 1], hashes, distinct: new Set(hashes).size });
  }
  console.log(JSON.stringify({ root, source: base.freeFont, results }, null, 2));
} else if (mode === 'heights') {
  const { buildFont } = await load('engine/index.ts');
  const { styleParams } = await load('tools/lib.ts');
  const { toPolys } = await load('engine/kernel/geom.ts');
  const { unite, ringArea } = await load('engine/kernel/union.ts');
  const shape = glyph => {
    const areas = unite(toPolys(glyph.cmds)).map(ringArea);
    return { pieces: areas.filter(a => a > 1).length, counters: areas.filter(a => a < -1).length };
  };
  const chars = 'HhbgpRqyj';
  let checked = 0;
  const differences = [];
  for (const style of ['grotesque', 'didone', 'softslab']) {
    const base = await styleParams(style, true);
    const font = buildFont(base);
    const expected = Object.fromEntries([...chars].map(ch => [ch, shape(font.glyph(ch))]));
    for (const key of ['height', 'xHeight', 'extenders', 'descender']) {
      for (const value of [0, 1]) {
        const changed = buildFont({ ...base, [key]: value });
        for (const ch of chars) {
          checked++;
          const actual = shape(changed.glyph(ch));
          if (JSON.stringify(actual) !== JSON.stringify(expected[ch])) {
            differences.push({ style, ch, key, value, expected: expected[ch], actual });
          }
        }
      }
    }
  }
  console.log(JSON.stringify({ root, checked, differences }, null, 2));
} else {
  const { evenWeight } = await load('shared/engine/even-weight.ts');
  const rect = (x0, y0, x1, y1) => [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
  ];
  const pair = [rect(0, 0, 100, 500), rect(130, 0, 230, 500)];
  const offsets = [14, 15, 16, 17, 18, 19, 20].map(requested => {
    const contours = evenWeight(pair, requested, 0, { tops: [500], feet: [0] }, 1000);
    return { requested, applied: -Math.min(...contours.flat().map(p => p.x)), pieces: contours.length };
  });
  const dotted = [rect(0, 0, 100, 500), rect(45, 600, 55, 610)];
  const dots = [0, 0.04, 0.06, 1].map(requested => ({
    requested, inputPieces: 2,
    outputPieces: evenWeight(dotted, requested, 0, { tops: [500], feet: [0] }, 1000).length,
  }));
  console.log(JSON.stringify({ root, synthetic: true, offsets, dots }, null, 2));
}
