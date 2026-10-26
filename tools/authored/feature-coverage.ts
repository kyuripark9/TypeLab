/* Inventory every bundled style and author explicit H crossbar boundaries against pinned masters. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeFreeFont } from '../../shared/engine/free';
import { cmdsToD } from '../../shared/engine/geom';
import { drawnCmds } from '../../shared/engine/outline';
import { parseSourceData } from '../../shared/source/data';
import { MASTER_REVISIONS } from '../../shared/source/master-catalog';
import { parseWeightMasters } from '../../shared/source/masters';
import { PROGRAM_REVISIONS } from '../../shared/source/program-catalog';
import { compileFeatureMasters } from './build-features';
import { PILOT_BINDINGS, authorFeatures, renderFeatures, reviewFeatures, type Clearance, type FeatureBindings, type FeatureControl, type NodeRef } from './feature-masters';

type Pair = readonly [NodeRef, NodeRef];
interface CrossbarRegions { lower: Pair; upper: Pair; lowerPorts: Pair; upperPorts: Pair }
interface CrossbarBinding extends FeatureBindings { regions: CrossbarRegions }
const points = (contour: number, indices: readonly number[]): NodeRef[] => indices.map(index => [contour, index]);
const point = (index: number): NodeRef => [0, index];
const pair = (a: number, b: number): Pair => [point(a), point(b)];

function clearances(regions: CrossbarRegions): Clearance[] {
  return [0, 1].flatMap(side => [
    { id: `H.crossbar.lower-room-${side}`, glyph: 'H', minimum: 32,
      measure: { kind: 'vertical', lower: regions.lowerPorts[side], upper: regions.lower[side] } },
    { id: `H.crossbar.upper-room-${side}`, glyph: 'H', minimum: 32,
      measure: { kind: 'vertical', lower: regions.upper[side], upper: regions.upperPorts[side] } },
  ] satisfies Clearance[]);
}
function joined(fontId: string, digest: string, indices: readonly number[], regions: CrossbarRegions): CrossbarBinding {
  const affected = points(0, indices);
  return { fontId, digest, regions, features: [{ id: 'H.crossbar', glyph: 'H', control: 'crossbar', affected,
    attachment: { kind: 'shared-boundary', nodes: affected }, metrics: { kind: 'fixed' },
    recipe: { kind: 'bar', travel: .1, groups: [{ nodes: affected, rail: null }] },
  }], clearances: clearances(regions) };
}
function separate(fontId: string, digest: string, contour: number, body: readonly number[], regions: CrossbarRegions,
  rails: { inner: readonly [Pair, Pair]; outer: readonly [Pair, Pair]; slanted?: true }): CrossbarBinding {
  const affected = [...regions.lower, ...regions.upper];
  const groups = [0, 1].map(side => ({ nodes: [regions.lower[side], regions.upper[side]], rail: rails.slanted ? rails.inner[side] : null }));
  const overlap: Clearance[] = [0, 1].flatMap(side => [regions.lower[side], regions.upper[side]].flatMap((tip, edge) => [
    { id: `H.crossbar.overlap-${side}-${edge}`, glyph: 'H', minimum: 2,
      measure: { kind: 'overlap', tip, rail: rails.inner[side], side: side === 0 ? 'left' : 'right' } },
    { id: `H.crossbar.outer-margin-${side}-${edge}`, glyph: 'H', minimum: 2,
      measure: { kind: 'overlap', tip, rail: rails.outer[side], side: side === 0 ? 'right' : 'left' } },
  ] satisfies Clearance[]));
  return { fontId, digest, regions, features: [{ id: 'H.crossbar', glyph: 'H', control: 'crossbar', affected,
    attachment: { kind: 'overlap', moving: contour, body }, metrics: { kind: 'fixed' }, recipe: { kind: 'bar', travel: .1, groups },
  }], clearances: [...clearances(regions), ...overlap] };
}

export const CROSSBAR_BINDINGS: readonly CrossbarBinding[] = [
  separate('Sonnet:400i', '160daa6aaeeed615152244759f3d27c62a274de63015ffe1f0b4052a74839905', 0, [1, 2],
    { lower: [[0, 0], [0, 3]], upper: [[0, 1], [0, 2]], lowerPorts: [[2, 0], [1, 25]], upperPorts: [[2, 25], [1, 0]] },
    { inner: [[[2, 0], [2, 25]], [[1, 25], [1, 0]]], outer: [[[2, 12], [2, 13]], [[1, 13], [1, 12]]], slanted: true }),
  joined('Vellum:400', 'c72eda230c2c2d7e7489bc6ab119c3d6468b5ee7ae1c56c3ee5efd33762249c9', [9, 10, 11, 12, 30, 31, 32, 33],
    { lower: pair(32, 31), upper: pair(10, 11), lowerPorts: pair(34, 29), upperPorts: pair(8, 13) }),
  joined('Almanac:500', '7d9763e7bc6cb7a98fbf56eec740d3562e17695888517ef8b41480b61ab76626', [15, 16, 37, 38],
    { lower: pair(38, 37), upper: pair(15, 16), lowerPorts: pair(39, 36), upperPorts: pair(14, 17) }),
  joined('Parlance:500', '3f5e7e22afe6910db983a6532ae90df62aa3b3611b2698f4caedd34193ee5b95', [2, 3, 8, 9],
    { lower: pair(3, 2), upper: pair(8, 9), lowerPorts: pair(4, 1), upperPorts: pair(7, 10) }),
  joined('Cotton:300', 'bbef63cb6315effcfd88971ea84aa20324700567c771b1ddbbc7e6ae215682c4', [4, 5, 12, 13],
    { lower: pair(13, 12), upper: pair(4, 5), lowerPorts: pair(14, 11), upperPorts: pair(3, 6) }),
  separate('Gumdrop:700', '73a3ea6fabc80057f93f0e61739973da35ed789fa08b1980af73a7e91a7b8d0c', 1, [0, 2],
    { lower: [[1, 3], [1, 2]], upper: [[1, 0], [1, 1]], lowerPorts: [[2, 3], [0, 3]], upperPorts: [[2, 4], [0, 4]] },
    { inner: [[[2, 3], [2, 4]], [[0, 3], [0, 4]]], outer: [[[2, 11], [2, 10]], [[0, 11], [0, 10]]] }),
  joined('Compass:300', '01baf750ad45fa49fe3cf3fb768cd729534a416d0c63407ce179763aed49f91d', [3, 4, 9, 10],
    { lower: pair(4, 3), upper: pair(9, 10), lowerPorts: pair(5, 2), upperPorts: pair(8, 11) }),
  joined('Dispatch:400', 'c9f822303b920e03051563dd11d6792e18af9a42a4e015d44737b85003107f2c', [17, 18, 43, 44],
    { lower: pair(18, 17), upper: pair(43, 44), lowerPorts: pair(19, 16), upperPorts: pair(42, 45) }),
  joined('Kernel:500', 'edf4313600883ebd93ff0f398e95ade1d952bbc3d4fa79ef3e2c9a8f27bc654f', [0, 1, 6, 7],
    { lower: pair(1, 0), upper: pair(6, 7), lowerPorts: pair(2, 11), upperPorts: pair(5, 8) }),
  separate('Orbital:600', '4a6962ffca3871797860ddefdfacb14ae9a30f01300c40c71f7ac4203e98689b', 1, [0, 2],
    { lower: [[1, 3], [1, 2]], upper: [[1, 0], [1, 1]], lowerPorts: [[2, 2], [0, 3]], upperPorts: [[2, 1], [0, 0]] },
    { inner: [[[2, 2], [2, 1]], [[0, 3], [0, 0]]], outer: [[[2, 3], [2, 0]], [[0, 2], [0, 1]]] }),
  joined('Bulwark:700', 'f6ff9d219c8dd03f29b36f30acb13767530de4a8197f61c481eef19166848ed5', [2, 3, 8, 9],
    { lower: pair(2, 3), upper: pair(9, 8), lowerPorts: pair(1, 4), upperPorts: pair(10, 7) }),
];

type CrossbarReview = { status: 'reviewed'; digest: string } | { status: 'held'; reason: string };
export const CROSSBAR_REVIEWS: Readonly<Record<string, CrossbarReview>> = {
  'Vellum:400': { status: 'reviewed', digest: '10a7438d8039527bc56423327fcd1460df603270882a0c46bb76efda9d03380b' },
  'Almanac:500': { status: 'reviewed', digest: 'cf997a7a3ee6ad0068dbd5e2f8736f0a331622b3a73912327428ea22f848dadf' },
  'Parlance:500': { status: 'reviewed', digest: 'fd5d2e951cedb2ffcbc0ca9a122f6ed761e5b9b2cd3a25def2bce1839e718048' },
  'Cotton:300': { status: 'reviewed', digest: 'bb9a235f23a005cd5a16eb24a3dfafda4b987475f46b4a1b888535f1e16c952d' },
  'Compass:300': { status: 'reviewed', digest: '5a940dde81178a4677de5afbb05c97d738a5224589eb93fe4d340e98d47b868b' },
  'Dispatch:400': { status: 'reviewed', digest: '558f3609b3da72471e836d80241f344b170fa2219b2e2d3026b43a9f72327c11' },
  'Kernel:500': { status: 'reviewed', digest: '228ed640295144cda0ab06c7cbeb8103e70e6a6ec60c16ec80b3fea2cd5bdf49' },
  'Orbital:600': { status: 'reviewed', digest: '639185723b1256447c87ed69f6d0cfabce12a36865f01907de32f91e7467a7ad' },
  'Bulwark:700': { status: 'reviewed', digest: '31bb32851cfac965e76c6873bd99d261fe02320589014b52a5f71cc5cc2b32d4' },
  'Sonnet:400i': { status: 'held', reason: 'The neutral weight-400 right attachment has only 1.687 units of overlap at xScale .8, below the 2-unit gate.' },
  'Gumdrop:700': { status: 'held', reason: 'The opposite-winding left stem cancels the crossbar overlap, leaving two filled pieces even at neutral.' },
};

interface Region { id: string; glyph: string; control: FeatureControl; needs: readonly string[]; interactions: readonly string[] }
const region = (glyph: string, id: string, control: FeatureControl, needs: readonly string[], interactions: readonly string[] = []): Region =>
  ({ id: `${glyph}.${id}`, glyph, control, needs, interactions });
export const REQUIRED_REGIONS: readonly Region[] = [
  ...[...'AH'].map(glyph => region(glyph, 'crossbar', 'crossbar', ['paired bar boundaries', 'stem rails', 'attachment clearance'])),
  ...[...'EF'].map(glyph => region(glyph, 'middle-arm', 'crossbar', ['paired arm boundaries', 'stem port', 'upper and lower clearance'], ['terminalLength'])),
  ...[...'BPRa'].map(glyph => region(glyph, 'waist', 'crossbar', ['bowl boundary spans', 'stem ports', 'counter clearance'], glyph === 'R' ? ['tail'] : ['terminalLength'])),
  ...[...'eft4'].map(glyph => region(glyph, 'crossbar', 'crossbar', ['paired bar boundaries', 'shared joins', 'bowl or hook clearance'], ['terminalLength', 'tail'])),
  region('R', 'leg', 'tail', ['departure port', 'paired leg boundaries', 'baseline endpoint', 'advance anchors']),
  region('Q', 'tail', 'tail', ['bowl crossing', 'paired tail boundaries', 'descender limit', 'advance anchors']),
  ...[...'Jfgjty'].map(glyph => region(glyph, 'hook', 'tail', ['root port', 'hook boundary spans', 'terminal tangent', 'advance anchors'], ['terminalLength', 'crossbar'])),
  ...[...'CcSs'].flatMap(glyph => ['upper', 'lower'].map(end => region(glyph, `${end}-terminal`, 'terminalLength', ['fixed shoulder', 'paired terminal boundaries', 'neck tangents', 'aperture clearance']))),
  ...[...'GJaefgjrty235679&?'].map(glyph => region(glyph, 'terminal', 'terminalLength', ['identify exposed ends', 'fixed shoulder', 'boundary spans', 'clearance and metric anchors'], ['crossbar', 'tail'])),
];

const SPAN_REVIEW: Readonly<Record<string, string>> = {
  'Jotter:400': 'Handwritten slanted joins need left/right local frames and a shared curved bar span.',
  'Funnies:400': 'Dense compatible subdivision needs curve-span bindings before moving the handwritten bar.',
  'Turnpike:500': 'Dense compatible subdivision needs original line-span grouping at both joined bar boundaries.',
  'Ballyhoo:400': 'High-contrast serif joins need dense span grouping and hairline clearance checks.',
  'Boardwalk:400': 'Script H has a loop and connecting stroke; its shared join requires a script-specific attachment frame.',
  'Cathedral:400': 'Blackletter H requires identifying the intended bridge and protecting adjacent angular counters.',
  'Serenade:400': 'Script H has a flourish and connecting stroke; fixed entry/exit ports must be authored together.',
  'Timber:400': 'Heavy slab-serif H needs dense span grouping and join clearance checks.',
};

export function featureInventory() {
  const latest = [...new Map(MASTER_REVISIONS.map(master => [master.ref.fontId, master])).values()];
  const rows = latest.map(master => {
    const base = parseWeightMasters(JSON.parse(readFileSync(`fonts/masters/${master.ref.digest}.json`, 'utf8')));
    const original = base.masters.find(candidate => candidate.weight === base.defaultWeight);
    if (!original) throw Error(`No neutral master for ${master.ref.fontId}`);
    const originalSource = parseSourceData(JSON.parse(readFileSync(`fonts/${master.ref.fontId.replace(':', '-')}.json`, 'utf8')));
    const anchors = original.data.glyphs.H[1].flat(), oldAnchors = originalSource.glyphs.H[1].flat();
    const matches = oldAnchors.map(node => anchors.filter(other => node[0] === other[0] && node[1] === other[1]).length);
    const pilot = PILOT_BINDINGS.find(candidate => candidate.fontId === master.ref.fontId && candidate.digest === master.ref.digest);
    const next = CROSSBAR_BINDINGS.find(candidate => candidate.fontId === master.ref.fontId && candidate.digest === master.ref.digest);
    const existing = new Set(pilot?.features.map(feature => feature.id));
    return { source: master.ref, weightRange: [master.min, master.max],
      hAnchors: { source: oldAnchors.length, master: anchors.length, retainedExactly: matches.filter(count => count > 0).length,
        ambiguousCoordinates: matches.filter(count => count > 1).length },
      anatomy: SPAN_REVIEW[master.ref.fontId] ?? ((next?.features[0] ?? pilot?.features.find(feature => feature.id === 'H.crossbar'))?.attachment.kind === 'overlap' ? 'Separate crossbar with explicit stem rails.' : 'Joined crossbar with paired boundary anchors.'),
      regions: REQUIRED_REGIONS.map(binding => ({ ...binding,
        state: existing.has(binding.id) ? 'reviewed-pilot' : next && binding.id === 'H.crossbar' ? CROSSBAR_REVIEWS[master.ref.fontId]?.status ?? 'needs-review' : 'needs-binding',
        ...(next && binding.id === 'H.crossbar' ? { review: CROSSBAR_REVIEWS[master.ref.fontId] } : {}),
        contours: original.data.glyphs[binding.glyph]?.[1].map(contour => contour.length) ?? null,
      })),
    };
  });
  return { format: 'feature-coverage-inventory-v1', notes: [
    'Required regions are authoring candidates, not claims that every glyph has the same anatomy. Absence or a different form must be reviewed explicitly.',
    'Reviewed regions have passed geometry and optical review against their exact asset digest. Held bindings remain unavailable.',
    'Regions that share coordinates need jointly authored controls; a binding list does not establish composability.',
    'All current features are base-only with respect to native width. Existing geometric width and height transforms remain downstream.',
  ], styles: rows };
}

function bindingSVG(bindings: CrossbarBinding, base: ReturnType<typeof parseWeightMasters>): string {
  const original = base.masters.find(master => master.weight === base.defaultWeight);
  if (!original) throw Error('Missing neutral master');
  const font = decodeFreeFont(original.data), glyph = font.glyphs.H, scale = 310 / font.cap;
  const affected = new Set(bindings.features[0].affected.map(ref => ref.join(':')));
  const labels = glyph.contours.flatMap((contour, ci) => contour.map((n, ni) => {
    const key = `${ci}:${ni}`, color = affected.has(key) ? '#1267a7' : '#666';
    return `<circle cx="${40 + n.x * scale}" cy="${380 - n.y * scale}" r="2.5" fill="${color}"/><text x="${44 + n.x * scale}" y="${377 - n.y * scale}" fill="${color}" font-size="10">${key}</text>`;
  })).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="430"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif"><text x="24" y="28" font-size="18">${bindings.fontId}: H crossbar bindings</text><path transform="translate(40,380) scale(${scale},${-scale})" d="${cmdsToD(drawnCmds(glyph.contours))}" fill="#ddd"/>${labels}</g></svg>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = resolve('.audit/masters/features-broad'), check = process.argv.includes('--check');
  if (check && process.argv.some(arg => ['--inventory', '--review', '--render'].includes(arg))) throw Error('--check only verifies published assets and cannot write inventory or review artifacts');
  if (!check) mkdirSync(output, { recursive: true });
  if (process.argv.includes('--inventory')) {
    const inventory = featureInventory();
    writeFileSync(resolve(output, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
    const counts = Object.fromEntries(['reviewed-pilot', 'reviewed', 'held', 'needs-binding'].map(state =>
      [state, inventory.styles.reduce((count, style) => count + style.regions.filter(region => region.state === state).length, 0)]));
    process.stdout.write(JSON.stringify({ styles: inventory.styles.length, regionsPerStyle: REQUIRED_REGIONS.length, counts }) + '\n');
  } else {
    const names = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
    if (names.some(name => !CROSSBAR_BINDINGS.some(binding => binding.fontId === name))) throw Error('Unknown crossbar batch style');
    const eligible = check || process.argv.includes('--approved') ? CROSSBAR_BINDINGS.filter(binding => CROSSBAR_REVIEWS[binding.fontId]?.status === 'reviewed') : CROSSBAR_BINDINGS;
    const requested = names.length ? eligible.filter(binding => names.includes(binding.fontId)) : eligible;
    const selected = check ? requested.filter(binding => {
      const review = CROSSBAR_REVIEWS[binding.fontId];
      return review?.status === 'reviewed' && PROGRAM_REVISIONS.some(program => program.data.features?.fontId === binding.fontId && program.data.features.digest === review.digest);
    }) : requested;
    const manifest = [];
    for (const bindings of selected) {
      const bytes = readFileSync(`fonts/masters/${bindings.digest}.json`);
      if (createHash('sha256').update(bytes).digest('hex') !== bindings.digest) throw Error('Master integrity mismatch');
      const base = parseWeightMasters(JSON.parse(bytes.toString()));
      const ref = { kind: 'masters-v1', fontId: bindings.fontId, digest: bindings.digest } as const;
      const program = authorFeatures(ref, base, bindings), data = compileFeatureMasters(program);
      data.notes = [
        'Partial authored coverage: H crossbar height only. Other glyphs and controls remain unreviewed.',
        'Both bar boundaries move together. Joined ports retain their handles; separate bars follow their pinned stem rails.',
        'Bar motion is plus or minus 10% of the source cap height. Advance and all unowned geometry remain unchanged.',
        'Native width interactions are not authored. This asset must not be combined with a native width asset.',
        'Underlying source licences and credits remain in the pinned master dependency.',
      ];
      const name = bindings.fontId.split(':')[0];
      const content = JSON.stringify(data) + '\n', digest = createHash('sha256').update(content).digest('hex');
      const review = CROSSBAR_REVIEWS[bindings.fontId];
      if (review?.status === 'reviewed' && review.digest !== digest) throw Error(`Reviewed feature asset changed: ${bindings.fontId}`);
      if (check) {
        const published = readFileSync(resolve('fonts/features', digest + '.json'), 'utf8');
        if (published !== content) throw Error(`Published feature asset changed: ${bindings.fontId}`);
      } else {
        writeFileSync(resolve(output, `${name}.json`), content);
        writeFileSync(resolve(output, `${name}-bindings.svg`), bindingSVG(bindings, base));
      }
      manifest.push({ ref: { kind: 'feature-masters-v1', fontId: bindings.fontId, digest }, base: ref, coverage: { crossbar: ['H'] }, review });
      if (process.argv.includes('--review')) {
        const report = reviewFeatures(program, { H: { pieces: 1, counters: 0 } });
        writeFileSync(resolve(output, `${name}-review.json`), JSON.stringify(report, null, 2) + '\n');
        process.stdout.write(JSON.stringify({ fontId: bindings.fontId, ...report }) + '\n');
        if (report.failures.length) process.exitCode = 1;
      } else if (!check) process.stdout.write(JSON.stringify({ fontId: bindings.fontId, weights: data.weightRange, glyphs: ['H'], review: review?.status ?? 'unreviewed' }) + '\n');
      if (process.argv.includes('--render')) renderFeatures(program, resolve(output, name), 'H n H  H H');
    }
    if (check) process.stdout.write(JSON.stringify({ checked: selected.map(binding => binding.fontId), skippedUnpublished: requested.filter(binding => !selected.includes(binding)).map(binding => binding.fontId) }) + '\n');
    else writeFileSync(resolve(output, process.argv.includes('--approved') ? 'approved.json' : 'candidates.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
}
