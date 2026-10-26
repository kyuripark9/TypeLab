/* Author the remaining H bridges in original-sheet coordinates, then carry exact span deltas into native widths. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeFreeFont, packNode, type FreeFontData } from '../../shared/engine/free';
import { cubicAt } from '../../shared/engine/geom';
import type { Drawn, Node } from '../../shared/engine/outline';
import { parseSourceData } from '../../shared/source/data';
import { identifyAuthored, rebaseReference } from '../../shared/source/edit-transport';
import { decodeFeatureMasters, evaluateFeatureMasters, parseFeatureMasters } from '../../shared/source/feature-masters';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
import { originMapFor } from '../../shared/source/origin-catalog';
import { PROGRAM_REVISIONS } from '../../shared/source/program-catalog';
import { correspondenceCurve, decodeOutlineMasterMap, parseOutlineMasterMap, rebaseOutlineEdits, type OutlineMasterMap } from '../../shared/source/outline-master-map';
import { parseMasterSubdivision, type MasterSubdivisionData } from '../../shared/source/subdivision';
import { decodeWidthMasters, interpolateWidthMasters, parseWidthMasters } from '../../shared/source/width-masters';

type PointRef = readonly [contour: number, node: number];
type Rail = readonly [PointRef, PointRef];
interface Group {
  region: string; anchors: readonly PointRef[]; rails: readonly { rail: Rail; share: number }[];
  slidingRail?: { contour: number; segment: number };
}
interface Binding {
  fontId: string; master: string; travel: number; construction: string;
  groups: readonly Group[]; fixedPorts: readonly PointRef[];
}
const span = (contour: number, first: number, last: number): PointRef[] => Array.from({ length: last - first + 1 }, (_, i) => [contour, first + i]);
const refs = (contour: number, indices: readonly number[]): PointRef[] => indices.map(index => [contour, index]);
const rail = (contour: number, from: number, to: number): Rail => [[contour, from], [contour, to]];
const group = (region: string, anchors: readonly PointRef[], along?: Rail): Group => ({ region, anchors, rails: along ? [{ rail: along, share: 1 }] : [] });
const between = (region: string, anchor: PointRef, left: Rail, right: Rail, share: number): Group =>
  ({ region, anchors: [anchor], rails: [{ rail: left, share: 1 - share }, { rail: right, share }] });
const jotterLeft = rail(0, 39, 10), jotterRight = rail(0, 30, 18);
const boardwalkLeft = rail(0, 24, 58), boardwalkRight = rail(0, 16, 65);
const serenadeLeft = rail(1, 149, 89), serenadeRight = rail(1, 141, 99);

export const REMAINING_CROSSBARS: readonly Binding[] = [
  { fontId: 'Sonnet:400i', master: '160daa6aaeeed615152244759f3d27c62a274de63015ffe1f0b4052a74839905', travel: .07,
    construction: 'Separate hairline bar. Each side follows its own italic stem rail; the neutral overlap is retained.',
    groups: [{ ...group('left attachment', refs(0, [0, 1]), rail(2, 0, 25)), slidingRail: { contour: 2, segment: 25 } },
      { ...group('right attachment', refs(0, [2, 3]), rail(1, 25, 0)), slidingRail: { contour: 1, segment: 25 } }],
    fixedPorts: [[2, 0], [2, 25], [1, 25], [1, 0]] },
  { fontId: 'Jotter:400', master: '6cb627262b5aab591f2d5ac2a4e6ccc6d3aafe776037d7a72852426a078edf89', travel: .06,
    construction: 'Joined handwritten bridge. Both curved necks move with their own stem slant; interior anchors blend those motions.',
    groups: [group('left neck', refs(0, [11, 12, 13, 35, 36, 37, 38]), jotterLeft),
      group('right neck', refs(0, [16, 17, 31, 32, 33, 34]), jotterRight),
      between('bar interior one', [0, 14], jotterLeft, jotterRight, 1 / 3), between('bar interior two', [0, 15], jotterLeft, jotterRight, 2 / 3)],
    fixedPorts: refs(0, [10, 18, 30, 39]) },
  { fontId: 'Funnies:400', master: 'f5ab2b02de6583bdf4255d3aeb25127df0459d53e44b2996ff152a47dc0dd761', travel: .08,
    construction: 'Ascending diagonal bar on vertical stems. Tiny existing boundary knees travel with the adjoining neck.',
    groups: [group('upper boundary and knees', [...refs(0, [46]), ...span(0, 0, 10)]), group('lower boundary and knees', span(0, 23, 33))],
    fixedPorts: refs(0, [45, 11, 22, 34]) },
  { fontId: 'Turnpike:500', master: '6eb346c64e6be82aaab845475c9630d4e730d4fce3a13fb34533142113bac98c', travel: .10,
    construction: 'Joined horizontal bar with four rounded necks on vertical stems.',
    groups: [group('lower bar and necks', span(0, 7, 10)), group('upper bar and necks', span(0, 19, 22))], fixedPorts: refs(0, [6, 11, 18, 23]) },
  { fontId: 'Ballyhoo:400', master: '30648f5f599154f5393cf7d533881d4174376a21e26a96d30c9394ae1fc247ab', travel: .08,
    construction: 'Paired hairline boundaries join vertical stems; serifs remain fixed.',
    groups: [group('upper bar', refs(0, [5, 6])), group('lower bar', refs(0, [23, 24]))], fixedPorts: refs(0, [4, 7, 22, 25]) },
  { fontId: 'Boardwalk:400', master: '9b2eb66ea10d73d5829d753a25c887071fd466b5152178c508f3fefb87b1406b', travel: .025,
    construction: 'Script bridge and left stub move through four ports. The upper loop, counter and lower exit flourish stay fixed.',
    groups: [group('left attachment and stub', [...refs(0, [22, 23]), ...span(0, 28, 38), ...span(0, 59, 61)], boardwalkLeft),
      group('right attachment', [...span(0, 17, 19), ...refs(0, [63, 64])], boardwalkRight),
      between('lower bridge one', [0, 20], boardwalkLeft, boardwalkRight, .34), between('lower bridge two', [0, 21], boardwalkLeft, boardwalkRight, .29),
      between('upper bridge', [0, 62], boardwalkLeft, boardwalkRight, .54)], fixedPorts: refs(0, [16, 24, 27, 39, 58, 65]) },
  { fontId: 'Cathedral:400', master: '783a5a5cdc77d95ce7e0212a5899de26851ff1cc261ffe4b899c093a4849bc06', travel: .035,
    construction: 'Central blackletter bridge. Each upper/lower angular attachment follows its own adjacent stem rail.',
    groups: [group('upper left join', refs(0, [20, 21]), rail(0, 19, 20)), group('upper right shoulder', span(0, 22, 25), rail(0, 25, 26)),
      group('lower right join', refs(0, [33, 34]), rail(0, 32, 33)), group('lower left join', span(0, 35, 37), rail(0, 37, 38))],
    fixedPorts: refs(0, [19, 26, 32, 38]) },
  { fontId: 'Serenade:400', master: 'b14ef9c968068311f01f20a0eb664afab87e0ceed02b71067ee640301862081b', travel: .025,
    construction: 'Both bridge boundaries and their end stubs move with separate stem rails. Entry, exit and upper flourishes stay fixed.',
    groups: [group('left attachment and stub', [...span(1, 31, 40), ...refs(1, [93]), ...span(1, 146, 148)], serenadeLeft),
      group('right attachment and stub', [...refs(1, [97]), ...span(1, 107, 117), ...refs(1, [142])], serenadeRight),
      ...[94, 95, 96].map((node, i) => between(`upper bridge ${i + 1}`, [1, node], serenadeLeft, serenadeRight, (i + 1) / 4)),
      ...[143, 144, 145].map((node, i) => between(`lower bridge ${i + 1}`, [1, node], serenadeLeft, serenadeRight, (3 - i) / 4))],
    fixedPorts: refs(1, [30, 41, 92, 98, 106, 118, 141, 149]) },
  { fontId: 'Timber:400', master: '6289d00b276b5bf14cc6d8bed7c0181694bad3462858e7df95e0e0be4a2b3730', travel: .08,
    construction: 'Thick joined slab-serif bar. Paired boundaries move between fixed stem/serif ports.',
    groups: [group('lower bar', refs(0, [8, 9])), group('upper bar', refs(0, [22, 23]))], fixedPorts: refs(0, [7, 10, 21, 24]) },
];

const root = resolve(import.meta.dirname, '../..'), hash = (input: Buffer | string) => createHash('sha256').update(input).digest('hex');
const bytes = (input: unknown) => JSON.stringify(input) + '\n';
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const asset = (directory: string, digest: string): unknown => {
  const content = readFileSync(resolve(root, 'fonts', directory, digest + '.json'));
  if (hash(content) !== digest) throw Error(`Immutable ${directory} integrity mismatch`);
  return JSON.parse(content.toString());
};
const packed = (drawing: Drawn): FreeFontData['glyphs'][string] => [drawing.adv, drawing.contours.map(c => c.map(packNode))];
const key = ([contour, node]: PointRef) => `${contour}:${node}`;
const at = (drawing: Drawn, ref: PointRef): Node => {
  const value = drawing.contours[ref[0]]?.[ref[1]];
  if (!value) throw Error(`Missing authored source anchor ${key(ref)}`);
  return value;
};
function projection(drawing: Drawn, map: OutlineMasterMap): Drawn {
  const edited = rebaseOutlineEdits(identifyAuthored(drawing, { digest: map.data.from.digest, glyph: 'H' }), map, 'H');
  if (!edited) throw Error('Missing H origin correspondence');
  const reference = map.neutral.glyphs.H, slots = new Map<string, Node>();
  for (const contour of edited.drawing.contours) for (const node of contour) {
    const origin = node.authored;
    if (!origin || Math.abs(origin.t) > 1e-10 || slots.has(`${origin.contour}:${origin.segment}`)) throw Error('Origin map does not produce one canonical H node per first-master segment');
    slots.set(`${origin.contour}:${origin.segment}`, node);
  }
  return { ...drawing, contours: reference.contours.map((contour, ci) => contour.map((_, ni) => {
    const node = slots.get(`${ci}:${ni}`); if (!node) throw Error('Incomplete H origin projection'); return node;
  })) };
}
function sourceAnchor(master: Drawn, map: OutlineMasterMap, transition: MasterSubdivisionData, [ci, ni]: PointRef) {
  const contour = map.data.glyphs.H.contours.find(contour => contour.source === ci);
  const span = contour?.spans.find(span => span.kind === 'curve' && span.source.segment === ni && (span.source.t0 === 0 || span.source.t1 === 0));
  if (!contour || !span || span.kind !== 'curve') throw Error('Authored rail lacks its source-start correspondence');
  const t = span.source.t0 === 0 ? span.target.t0 : span.target.t1;
  const ranges = transition.glyphs.H[contour.target], index = ranges.findIndex(range => range.segment === span.target.segment
    && t >= Math.min(range.t0, range.t1) - 1e-10 && t <= Math.max(range.t0, range.t1) + 1e-10);
  if (index < 0) throw Error('Authored rail is absent from the current width basis');
  const range = ranges[index], local = (t - range.t0) / (range.t1 - range.t0);
  return correspondenceCurve(master, contour.target, { segment: index, t0: local, t1: local })[0];
}
function railAtHeight(drawing: Drawn, map: OutlineMasterMap, transition: MasterSubdivisionData, rail: NonNullable<Group['slidingRail']>, y: number): number {
  const contour = map.data.glyphs.H.contours.find(contour => contour.source === rail.contour);
  if (!contour) throw Error('Missing sliding stem contour');
  for (const span of contour.spans) if (span.kind === 'curve' && span.source.segment === rail.segment) {
    const ranges = transition.glyphs.H[contour.target];
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i]; if (range.segment !== span.target.segment) continue;
      const low = Math.max(Math.min(range.t0, range.t1), Math.min(span.target.t0, span.target.t1));
      const high = Math.min(Math.max(range.t0, range.t1), Math.max(span.target.t0, span.target.t1));
      if (high <= low) continue;
      const q = correspondenceCurve(drawing, contour.target, { segment: i,
        t0: (low - range.t0) / (range.t1 - range.t0), t1: (high - range.t0) / (range.t1 - range.t0) });
      if (y < Math.min(q[0].y, q[3].y) - 1e-9 || y > Math.max(q[0].y, q[3].y) + 1e-9) continue;
      const direction = Math.sign(q[3].y - q[0].y);
      if (!direction || q.some((p, j) => j > 0 && (p.y - q[j - 1].y) * direction < -1e-8)) throw Error('Sliding stem rail must be monotone in height');
      let a = 0, b = 1;
      for (let j = 0; j < 48; j++) { const t = (a + b) / 2; if ((cubicAt(q, t).y - y) * direction < 0) a = t; else b = t; }
      return cubicAt(q, (a + b) / 2).x;
    }
  }
  throw Error('Crossbar motion leaves its authored sliding stem rail');
}
function addDelta(master: Drawn, before: Drawn, after: Drawn): Drawn {
  const coordinates = ['x', 'y', 'ix', 'iy', 'ox', 'oy'] as const;
  return { ...master, contours: master.contours.map((contour, ci) => contour.map((node, ni) => {
    const a = before.contours[ci][ni], b = after.contours[ci][ni], result = { ...node };
    for (const coordinate of coordinates) if (node[coordinate] !== undefined) {
      if (a[coordinate] === undefined || b[coordinate] === undefined) throw Error('Origin projection lost a control handle');
      result[coordinate] = node[coordinate] + (b[coordinate] - a[coordinate]);
      if (!Number.isFinite(result[coordinate])) throw Error('Nonfinite authored H endpoint');
    }
    return result;
  })) };
}
function endpoint(master: Drawn, frame: Drawn, original: Drawn, neutralProjection: Drawn, map: OutlineMasterMap,
  transition: MasterSubdivisionData, binding: Binding, cap: number, sign: number): Drawn {
  const changed = { ...original, contours: original.contours.map(contour => contour.map(node => ({ ...node }))) }, dy = cap * binding.travel * sign;
  const owned = new Set<string>();
  for (const group of binding.groups) {
    const dx = group.rails.reduce((sum, { rail: [from, to], share }) => {
      const a = sourceAnchor(frame, map, transition, from), b = sourceAnchor(frame, map, transition, to);
      if (Math.abs(b.y - a.y) < 1) throw Error('Authored stem rail has no vertical extent');
      return sum + dy * (b.x - a.x) / (b.y - a.y) * share;
    }, 0);
    for (const ref of group.anchors) {
      if (owned.has(key(ref))) throw Error('Two H regions own the same anchor'); owned.add(key(ref));
      const y = sourceAnchor(frame, map, transition, ref).y;
      const movement = group.slidingRail ? railAtHeight(frame, map, transition, group.slidingRail, y + dy)
        - railAtHeight(frame, map, transition, group.slidingRail, y) : dx;
      const node = at(changed, ref); node.x += movement; node.y += dy;
      if (node.ix !== undefined && node.iy !== undefined) { node.ix += movement; node.iy += dy; }
      if (node.ox !== undefined && node.oy !== undefined) { node.ox += movement; node.oy += dy; }
    }
  }
  for (const port of binding.fixedPorts) {
    if (owned.has(key(port)) || JSON.stringify(packNode(at(changed, port))) !== JSON.stringify(packNode(at(original, port)))) throw Error('A fixed H port moved');
  }
  return addDelta(master, neutralProjection, projection(changed, map));
}

export function buildRemainingCrossbar(style: string, output: string) {
  const binding = REMAINING_CROSSBARS.find(binding => binding.fontId.split(':')[0] === style);
  if (!binding) throw Error('Unknown remaining H family');
  const program = PROGRAM_REVISIONS.findLast(program => program.ref.fontId === binding.fontId && program.data.width
    && program.data.transitions?.some(transition => transition.from.digest === binding.master));
  const sourceTransition = program?.data.transitions?.find(transition => transition.from.digest === binding.master);
  const widthRef = program?.data.width;
  if (!sourceTransition || !widthRef) throw Error('H authoring requires the published width basis and its exact original-master transition');
  const transition = parseMasterSubdivision(asset('subdivisions', sourceTransition.mapping.digest));
  if (transition.from.fontId !== binding.fontId || transition.from.digest !== binding.master) throw Error('The H recipe names a different first-master basis');
  const oldBase = parseWeightMasters(asset('masters', binding.master)), oldMasters = decodeWeightMasters(oldBase);
  const base = parseWeightMasters(asset('masters', transition.to.digest)), masters = decodeWeightMasters(base);
  const origin = originMapFor(oldBase.source, transition.from);
  if (!origin) throw Error('Missing original-sheet correspondence');
  const source = decodeFreeFont(parseSourceData(asset('sources', oldBase.source.digest)));
  const map = decodeOutlineMasterMap(parseOutlineMasterMap(asset('origins', origin.ref.digest)),
    { from: { ref: oldBase.source, font: source }, to: { ref: transition.from, masters: oldMasters } });
  const original = source.glyphs.H, neutralProjection = projection(original, map);
  const widths = decodeWidthMasters(parseWidthMasters(asset('widths', widthRef.digest), { ref: transition.to, masters }), masters);
  const knots = widths.columns.map(column => column.width);
  const controls = (width: number) => [{ control: 'crossbar', glyphs: [{ glyph: 'H', masters: oldMasters.masters.map(master => {
    const reference = master.font.glyphs.H, frame = interpolateWidthMasters(widths, master.weight, width).glyphs.H;
    const subdivided = rebaseReference(reference, transition, 'H');
    const move = (sign: number) => {
      const drawing = endpoint(reference, frame, original, neutralProjection, map, transition, binding, master.font.cap, sign);
      return packed(addDelta(frame, subdivided, rebaseReference(drawing, transition, 'H')));
    };
    return { weight: master.weight, low: move(-1), high: move(1) };
  }) }] }];
  const data = parseFeatureMasters({ format: 'feature-masters-v1', base: transition.to,
    weightRange: [oldMasters.masters[0].weight, oldMasters.masters.at(-1)!.weight], controls: controls(100),
    widthCompatibility: { kind: 'joint-grid', width: widthRef, columns: knots.filter(width => width !== 100).map(width => ({ width, controls: controls(width) })) },
    notes: ['Partial feature coverage: H crossbar only. Other letters and controls are not included.', binding.construction,
      `Travel is plus or minus ${binding.travel * 100}% of cap height. Original-sheet semantic anchors and exact origin/subdivision maps author the complete compatible weight/width grid.`,
      'Each joint endpoint is authored in its native-width stem frame. Separate bar sides follow the actual monotone stem curves at their new heights; joined bridge interiors blend their pinned port motions.',
      'Existing weight and width bases, neutral geometry, advances, and all unrelated feature assets remain unchanged.',
      'Compiler, finite-coordinate and neutral-identity checks only. Optical review and parameter sweeps are deferred.',
      'Source licences and credits are retained in the pinned master dependency.'] });
  const decoded = decodeFeatureMasters(data, { ref: transition.to, masters }, { ref: widthRef, masters: widths });
  let neutralCases = 0;
  for (const width of knots) for (const master of masters.masters) {
    const baseline = interpolateWidthMasters(widths, master.weight, width);
    if (evaluateFeatureMasters(decoded, { baseline, weight: master.weight, width, values: { crossbar: .5, tail: .5, terminalLength: .5 } }) !== baseline) throw Error('Neutral H feature changed the baseline');
    neutralCases++;
  }
  const content = bytes(data), digest = hash(content), ref = { kind: 'feature-masters-v1', digest, fontId: binding.fontId } as const;
  mkdirSync(output, { recursive: true }); writeFileSync(resolve(output, digest + '.json'), content);
  const manifest = { style, ref, file: resolve(output, digest + '.json'), base: transition.to, width: widthRef,
    origin: origin.ref, binding, neutralCases, validation: 'Compiler, finite and neutral identity only; optical review deferred.' };
  writeFileSync(resolve(output, style + '-binding.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [selected, output = '.audit/masters/crossbars-remaining'] = process.argv.slice(2);
  if (!selected) throw Error('Usage: remaining-crossbars.ts <family|--all> [output-directory]');
  if (selected === '--all') {
    const results = [];
    for (const binding of REMAINING_CROSSBARS) {
      const style = binding.fontId.split(':')[0];
      const child = spawnSync(process.execPath, ['--max-old-space-size=512', '--import', 'tsx', process.argv[1], style, output], { stdio: 'inherit' });
      if (child.status !== 0) throw Error(`${style}: H feature compilation failed`);
      results.push(read(resolve(output, style + '-binding.json')));
    }
    writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(results, null, 2) + '\n');
  } else {
    const made = buildRemainingCrossbar(selected, resolve(output));
    process.stdout.write(JSON.stringify({ style: made.style, ref: made.ref, base: made.base, width: made.width, neutralCases: made.neutralCases }) + '\n');
  }
}
