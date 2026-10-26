/* Author named crossbar, leg and terminal regions with fixed attachments and review their endpoint drawings. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildFont, type Font } from '../../shared/engine';
import { decodeFreeFont, packNode } from '../../shared/engine/free';
import { cmdsBox, cmdsToD } from '../../shared/engine/geom';
import { drawnCmds, type Drawn, type Node } from '../../shared/engine/outline';
import { DEFAULTS } from '../../shared/params';
import { identifyAuthored, mapAuthored } from '../../shared/source/edit-transport';
import { mapPoint, type OutlineTransform, type Point } from '../../shared/source/geometry';
import { mastersForFont } from '../../shared/source/master-catalog';
import { decodeWeightMasters, interpolateMasters, parseWeightMasters, type WeightMasterData, type WeightMasters } from '../../shared/source/masters';
import type { MasterSourceRef } from '../../shared/source/model';
import { rowsPNG, rowsSVG, type Row } from '../lib';
import { topology } from './transfer-masters';

export type FeatureControl = 'crossbar' | 'tail' | 'terminalLength';
export type NodeRef = readonly [contour: number, node: number];
export type Attachment =
  | { kind: 'fixed-port'; nodes: readonly NodeRef[] }
  | { kind: 'shared-boundary'; nodes: readonly NodeRef[] }
  | { kind: 'overlap'; moving: number; body: readonly number[] };
export interface FeatureBinding {
  id: string; glyph: string; control: FeatureControl;
  affected: readonly NodeRef[]; attachment: Attachment;
  metrics: { kind: 'fixed' } | { kind: 'right-bearing'; anchors: readonly NodeRef[] };
}
export interface FeatureMaster { weight: number; low: Drawn; high: Drawn }
export interface AuthoredFeature extends FeatureBinding { masters: FeatureMaster[] }
export interface Clearance {
  id: string; glyph: string; minimum: number;
  measure: { kind: 'vertical'; lower: NodeRef; upper: NodeRef }
    | { kind: 'overlap'; tip: NodeRef; rail: readonly [NodeRef, NodeRef]; side: 'left' | 'right' }
    | { kind: 'handle-order'; lower: readonly [NodeRef, 'in' | 'out']; upper: readonly [NodeRef, 'in' | 'out'] };
}
export interface FeatureProgram {
  format: 'semantic-features-prototype-v1'; source: MasterSourceRef;
  base: WeightMasterData; features: AuthoredFeature[]; clearances: readonly Clearance[];
  scope: { authoredWidth: 'neutral-only'; glyphs: string; wholeFontControl: false };
  coverage: { control: FeatureControl; authored: string; reviewedUnaffected: string; unreviewed: string }[];
}
type Rail = readonly [NodeRef, NodeRef];
type Recipe =
  | { kind: 'bar'; travel: number; groups: readonly { nodes: readonly NodeRef[]; rail: Rail | null }[] }
  | { kind: 'leg'; degrees: number; root: readonly [NodeRef, NodeRef] }
  | { kind: 'terminal'; travel: { shorten: number; extend: number }; direction: readonly [number, number] };
interface FeatureRecipe extends FeatureBinding { recipe: Recipe }
export interface FeatureBindings { fontId: string; digest: string; features: readonly FeatureRecipe[]; clearances: readonly Clearance[] }
export interface FeatureRequest { glyph: string; weight: number; values: Record<FeatureControl, number>; height: OutlineTransform }

const refs = (contour: number, nodes: readonly number[]): NodeRef[] => nodes.map(node => [contour, node]);
const range = (contour: number, first: number, last: number) => refs(contour, Array.from({ length: last - first + 1 }, (_, i) => first + i));
const node = (d: Drawn, ref: NodeRef): Node => {
  const n = d.contours[ref[0]]?.[ref[1]];
  if (!n) throw Error(`Missing authored point ${ref.join(':')}`);
  return n;
};
const refKey = (ref: NodeRef) => ref.join(':');
const identity = (cap: number): OutlineTransform => ({ xScale: 1, y: [[0, 0], [cap, cap]] });
const drawing = (d: Drawn) => JSON.stringify([d.adv, d.contours.map(c => c.map(packNode))]);
const blend = (a: number, b: number, t: number) => a + (b - a) * t;
const slope = (d: Drawn, rail: Rail): number => {
  const a = node(d, rail[0]), b = node(d, rail[1]);
  if (a.y === b.y) throw Error('An authored stem rail must have distinct heights');
  return (b.x - a.x) / (b.y - a.y);
};

function moveNode(n: Node, move: (p: Point) => Point): Node {
  const out = { ...n, ...move(n) };
  if (n.ix !== undefined && n.iy !== undefined) { const p = move({ x: n.ix, y: n.iy }); out.ix = p.x; out.iy = p.y; }
  if (n.ox !== undefined && n.oy !== undefined) { const p = move({ x: n.ox, y: n.oy }); out.ox = p.x; out.oy = p.y; }
  return out;
}
function endpoint(source: Drawn, feature: FeatureRecipe, cap: number, value: number): Drawn {
  const out = { ...source, contours: source.contours.map(c => c.map(n => ({ ...n }))) }, recipe = feature.recipe;
  const apply = (at: NodeRef, move: (p: Point) => Point) => { out.contours[at[0]][at[1]] = moveNode(node(source, at), move); };
  switch (recipe.kind) {
    case 'bar': {
      const dy = cap * recipe.travel * value;
      for (const group of recipe.groups) {
        const dx = group.rail ? slope(source, group.rail) * dy : 0;
        for (const at of group.nodes) apply(at, p => ({ x: p.x + dx, y: p.y + dy }));
      }
      break;
    }
    case 'leg': {
      const root = (node(source, recipe.root[0]).y + node(source, recipe.root[1]).y) / 2;
      const shear = Math.tan(recipe.degrees * Math.PI / 180) * value;
      for (const at of feature.affected) apply(at, p => ({ x: p.x + (root - p.y) * shear, y: p.y }));
      break;
    }
    case 'terminal': {
      const [x, y] = recipe.direction, distance = cap * (value < 0 ? recipe.travel.shorten : recipe.travel.extend) * value;
      for (const at of feature.affected) apply(at, p => ({ x: p.x + x * distance, y: p.y + y * distance }));
      break;
    }
    default: { const never: never = recipe; throw Error(`Unknown feature recipe ${never}`); }
  }
  if (feature.metrics.kind === 'right-bearing') {
    const { anchors } = feature.metrics, extent = (d: Drawn) => Math.max(...anchors.map(at => node(d, at).x));
    out.adv += extent(out) - extent(source);
  }
  return out;
}

export function authorFeatures(source: MasterSourceRef, base: WeightMasterData, bindings: FeatureBindings): FeatureProgram {
  if (source.fontId !== bindings.fontId || base.source.fontId !== bindings.fontId || source.digest !== bindings.digest) throw Error('Feature bindings name another source revision');
  const features = bindings.features.map(feature => {
    const { recipe: _, ...binding } = feature;
    const masters = base.masters.map(master => {
      const font = decodeFreeFont(master.data), glyph = font.glyphs[feature.glyph];
      if (!glyph) throw Error(`Missing authored glyph ${feature.glyph}`);
      const affected = new Set(feature.affected.map(refKey));
      for (const at of feature.affected) node(glyph, at);
      if (feature.attachment.kind === 'fixed-port') for (const at of feature.attachment.nodes) {
        node(glyph, at);
        if (affected.has(refKey(at))) throw Error(`Fixed port moves in ${feature.id}`);
      }
      if (feature.attachment.kind === 'shared-boundary') for (const at of feature.attachment.nodes) {
        node(glyph, at);
        if (!affected.has(refKey(at))) throw Error(`Shared attachment is outside ${feature.id}`);
      }
      if (feature.attachment.kind === 'overlap') {
        const { moving, body } = feature.attachment;
        if (!body.length || body.includes(moving) || !glyph.contours[moving] || body.some(ci => !glyph.contours[ci])
          || feature.affected.some(at => at[0] !== moving)) throw Error(`Invalid overlap binding in ${feature.id}`);
      }
      if (feature.metrics.kind === 'right-bearing') {
        if (!feature.metrics.anchors.length) throw Error(`Missing bearing anchors in ${feature.id}`);
        for (const at of feature.metrics.anchors) node(glyph, at);
      }
      const low = endpoint(glyph, feature, font.cap, -1), high = endpoint(glyph, feature, font.cap, 1);
      const direction = feature.recipe.kind === 'bar' ? [0, 1] : feature.recipe.kind === 'leg' ? [1, 0] : feature.recipe.direction;
      for (const [made, sign] of [[low, -1], [high, 1]] satisfies [Drawn, number][]) {
        const motion = feature.affected.reduce((sum, at) => {
          const a = node(glyph, at), b = node(made, at);
          return sum + (b.x - a.x) * direction[0] + (b.y - a.y) * direction[1];
        }, 0);
        if (motion * sign <= 0) throw Error(`Feature has no intended motion: ${feature.id}`);
      }
      for (const made of [low, high]) glyph.contours.forEach((c, ci) => c.forEach((n, ni) => {
        const next = made.contours[ci][ni];
        if (packNode(next).some(v => typeof v === 'number' && !Number.isFinite(v))) throw Error(`Non-finite ${feature.id}`);
        if (!affected.has(refKey([ci, ni])) && JSON.stringify(packNode(n)) !== JSON.stringify(packNode(next))) throw Error(`Unowned point moved in ${feature.id}`);
      }));
      return { weight: master.weight, low, high };
    });
    return { ...binding, masters };
  });
  const controls: FeatureControl[] = ['crossbar', 'tail', 'terminalLength'], characters = Object.keys(base.masters[0].data.glyphs);
  const coverage = controls.map(control => {
    const authored = [...new Set(features.filter(f => f.control === control).map(f => f.glyph))].join('');
    return { control, authored, reviewedUnaffected: '', unreviewed: characters.filter(ch => !authored.includes(ch)).join('') };
  });
  return { format: 'semantic-features-prototype-v1', source, base, features, clearances: bindings.clearances,
    scope: { authoredWidth: 'neutral-only', glyphs: [...new Set(features.map(f => f.glyph))].join(''), wholeFontControl: false }, coverage };
}

function blendedNode(a: Node, b: Node, t: number): Node {
  const n = { ...a, x: blend(a.x, b.x, t), y: blend(a.y, b.y, t) };
  if (a.ix !== undefined && a.iy !== undefined && b.ix !== undefined && b.iy !== undefined) { n.ix = blend(a.ix, b.ix, t); n.iy = blend(a.iy, b.iy, t); }
  if (a.ox !== undefined && a.oy !== undefined && b.ox !== undefined && b.oy !== undefined) { n.ox = blend(a.ox, b.ox, t); n.oy = blend(a.oy, b.oy, t); }
  return n;
}
function featureDrawing(feature: AuthoredFeature, weight: number, side: 'low' | 'high'): Drawn {
  const exact = feature.masters.find(m => m.weight === weight);
  if (exact) return exact[side];
  const index = feature.masters.findIndex(m => m.weight > weight), a = feature.masters[index - 1], b = feature.masters[index];
  if (!a || !b) throw Error('Weight is outside the authored feature interval');
  const t = (weight - a.weight) / (b.weight - a.weight), before = a[side], after = b[side];
  return { adv: blend(before.adv, after.adv, t), contours: before.contours.map((c, ci) => c.map((n, ni) => blendedNode(n, after.contours[ci][ni], t))) };
}

const decodedPrograms = new WeakMap<FeatureProgram, WeightMasters>();
export function evaluateFeatures(program: FeatureProgram, request: FeatureRequest): Drawn {
  const low = program.base.masters[0].weight, high = program.base.masters[program.base.masters.length - 1].weight;
  if (!Number.isFinite(request.weight) || request.weight < low || request.weight > high) throw Error('Weight is outside the authored feature interval');
  let decoded = decodedPrograms.get(program);
  if (!decoded) { decoded = decodeWeightMasters(program.base); decodedPrograms.set(program, decoded); }
  const font = interpolateMasters(decoded, request.weight), original = font.glyphs[request.glyph];
  if (!original) throw Error(`Missing ${request.glyph}`);
  for (const value of Object.values(request.values)) if (!Number.isFinite(value) || Math.abs(value) > 1) throw Error('Feature values must be within -1..1');
  let made = original;
  for (const feature of program.features) {
    const value = request.values[feature.control];
    if (feature.glyph !== request.glyph || value === 0) continue;
    const target = featureDrawing(feature, request.weight, value < 0 ? 'low' : 'high'), amount = Math.abs(value);
    const contours = made.contours.map(c => c.map(n => ({ ...n })));
    for (const at of feature.affected) {
      const n = node(made, at), start = node(original, at), end = node(target, at);
      const delta = (current: number, before: number, after: number) => after === before ? current : current + (after - before) * amount;
      const out = { ...n, x: delta(n.x, start.x, end.x), y: delta(n.y, start.y, end.y) };
      if (n.ix !== undefined && n.iy !== undefined && start.ix !== undefined && start.iy !== undefined && end.ix !== undefined && end.iy !== undefined) {
        out.ix = delta(n.ix, start.ix, end.ix); out.iy = delta(n.iy, start.iy, end.iy);
      }
      if (n.ox !== undefined && n.oy !== undefined && start.ox !== undefined && start.oy !== undefined && end.ox !== undefined && end.oy !== undefined) {
        out.ox = delta(n.ox, start.ox, end.ox); out.oy = delta(n.oy, start.oy, end.oy);
      }
      contours[at[0]][at[1]] = out;
    }
    made = { ...made, adv: made.adv + (target.adv - original.adv) * amount, contours };
  }
  const source = { digest: program.source.digest, glyph: request.glyph };
  return mapAuthored(identifyAuthored({ ...made, adv: made.adv * request.height.xScale }, source), request.height, original, source);
}

const bar = (glyph: string, groups: Extract<Recipe, { kind: 'bar' }>['groups'], attachment: Attachment): FeatureRecipe => ({
  id: `${glyph}.crossbar`, glyph, control: 'crossbar', affected: groups.flatMap(g => g.nodes), attachment, metrics: { kind: 'fixed' },
  recipe: { kind: 'bar', travel: glyph === 'H' ? .10 : .07, groups },
});
const leg = (affected: readonly NodeRef[], ports: readonly NodeRef[], root: readonly [NodeRef, NodeRef], anchors: readonly NodeRef[]): FeatureRecipe => ({
  id: 'R.leg', glyph: 'R', control: 'tail', affected, attachment: { kind: 'fixed-port', nodes: ports }, recipe: { kind: 'leg', degrees: 8, root },
  metrics: { kind: 'right-bearing', anchors },
});
const terminal = (id: string, affected: readonly NodeRef[], ports: readonly NodeRef[], direction: readonly [number, number], travel = .04, shorten = travel): FeatureRecipe => ({
  id: `c.${id}-terminal`, glyph: 'c', control: 'terminalLength', affected, attachment: { kind: 'fixed-port', nodes: ports }, recipe: { kind: 'terminal', travel: { shorten, extend: travel }, direction },
  metrics: { kind: 'fixed' },
});
const gap = (lower: NodeRef, upper: NodeRef): Clearance => ({ id: 'c.aperture', glyph: 'c', minimum: 14, measure: { kind: 'vertical', lower, upper } });
const overlaps = (glyph: string, left: readonly NodeRef[], right: readonly NodeRef[], leftRail: Rail, rightRail: Rail): Clearance[] => [
  ...left.map((tip, i): Clearance => ({ id: `${glyph}.bar-left-${i}`, glyph, minimum: 2, measure: { kind: 'overlap', tip, rail: leftRail, side: 'left' } })),
  ...right.map((tip, i): Clearance => ({ id: `${glyph}.bar-right-${i}`, glyph, minimum: 2, measure: { kind: 'overlap', tip, rail: rightRail, side: 'right' } })),
];
const outerMargins = (left: readonly NodeRef[], right: readonly NodeRef[], leftRail: Rail, rightRail: Rail): Clearance[] => [
  ...left.map((tip, i): Clearance => ({ id: `A.bar-left-outer-${i}`, glyph: 'A', minimum: 2, measure: { kind: 'overlap', tip, rail: leftRail, side: 'right' } })),
  ...right.map((tip, i): Clearance => ({ id: `A.bar-right-outer-${i}`, glyph: 'A', minimum: 2, measure: { kind: 'overlap', tip, rail: rightRail, side: 'left' } })),
];

export const PILOT_BINDINGS: readonly FeatureBindings[] = [
  { fontId: 'Mainline:600', digest: '44ce1daebc31f46d098f0f37a84023aba0f2689404d5aa529a8c0bcb261d3033', features: [
    bar('H', [{ nodes: range(1, 0, 3), rail: null }], { kind: 'overlap', moving: 1, body: [0, 2] }),
    bar('A', [{ nodes: refs(1, [1, 2]), rail: [[2, 1], [2, 0]] }, { nodes: refs(1, [0, 3]), rail: [[0, 0], [0, 1]] }], { kind: 'overlap', moving: 1, body: [0, 2] }),
    leg(refs(0, [0, 3, 4]), refs(0, [1, 2]), [[0, 1], [0, 2]], [...refs(0, [3, 4]), [1, 4]]),
    terminal('upper', refs(0, [19, 20]), refs(0, [18, 21]), [0, -1]),
    terminal('lower', refs(0, [3, 4]), refs(0, [2, 5]), [0, 1]),
  ], clearances: [gap([0, 4], [0, 19]),
    ...overlaps('H', refs(1, [1, 2]), refs(1, [0, 3]), [[2, 0], [2, 3]], [[0, 1], [0, 2]]),
    ...overlaps('A', refs(1, [1, 2]), refs(1, [0, 3]), [[2, 1], [2, 0]], [[0, 0], [0, 1]]),
    ...outerMargins(refs(1, [1, 2]), refs(1, [0, 3]), [[2, 2], [2, 3]], [[0, 4], [0, 3]]),
  ] },
  { fontId: 'Hearth:600', digest: 'a5b2b12dbd85c33f2619533efb9309a27cabb3b95a07890bbd54d22675fda623', features: [
    bar('H', [{ nodes: refs(0, [9, 10, 25, 26]), rail: null }], { kind: 'shared-boundary', nodes: refs(0, [9, 10, 25, 26]) }),
    bar('A', [
      { nodes: refs(0, [0]), rail: [[0, 0], [0, 5]] }, { nodes: refs(0, [1]), rail: [[0, 1], [0, 2]] },
      { nodes: refs(1, [12]), rail: [[1, 13], [1, 12]] }, { nodes: refs(1, [11]), rail: [[1, 10], [1, 11]] },
    ], { kind: 'shared-boundary', nodes: [...refs(0, [0, 1]), ...refs(1, [11, 12])] }),
    leg(refs(0, [0, 3, 4, 5]), refs(0, [1, 2]), [[0, 1], [0, 2]], [...refs(0, [4, 5]), [2, 9]]),
    terminal('upper', refs(0, [10, 11]), refs(0, [9, 12]), [0, -1]),
    terminal('lower', refs(0, [23, 24, 25]), refs(0, [22, 26]), [.2, .98], .035),
  ], clearances: [gap([0, 24], [0, 11])] },
  { fontId: 'Couture:600', digest: '3c4dfe69b87c432a1d1938e53099ac0620eaa3f75a656dc08309d2eace9d5b89', features: [
    bar('H', [{ nodes: range(1, 0, 3), rail: null }], { kind: 'overlap', moving: 1, body: [0, 2] }),
    bar('A', [{ nodes: refs(0, [2, 3]), rail: [[1, 14], [1, 13]] }, { nodes: refs(0, [0, 1]), rail: [[1, 11], [1, 12]] }], { kind: 'overlap', moving: 0, body: [1] }),
    leg(range(0, 4, 17), [...range(0, 0, 3), ...range(0, 18, 20)], [[0, 3], [0, 18]], [[0, 11], [1, 7]]),
    terminal('upper', range(0, 3, 10), refs(0, [2, 11]), [0, -1], .035, .012),
    terminal('lower', refs(0, [22, 23]), refs(0, [21, 24]), [.55, .84]),
  ], clearances: [gap([0, 22], [0, 6]),
    { id: 'c.upper-terminal.outer-neck', glyph: 'c', minimum: .5, measure: { kind: 'handle-order', upper: [[0, 2], 'out'], lower: [[0, 3], 'in'] } },
    { id: 'c.upper-terminal.inner-neck', glyph: 'c', minimum: .5, measure: { kind: 'handle-order', upper: [[0, 11], 'in'], lower: [[0, 10], 'out'] } },
    ...overlaps('H', refs(1, [0, 3]), refs(1, [1, 2]), [[2, 13], [2, 12]], [[0, 5], [0, 6]]),
    ...overlaps('A', refs(0, [2, 3]), refs(0, [0, 1]), [[1, 14], [1, 13]], [[1, 11], [1, 12]]),
    ...outerMargins(refs(0, [2, 3]), refs(0, [0, 1]), [[1, 1], [1, 2]], [[1, 5], [1, 4]]),
  ] },
];

function clearance(d: Drawn, c: Clearance, height: OutlineTransform): number {
  const measure = c.measure;
  if (measure.kind === 'vertical') return mapPoint(node(d, measure.upper), height).y - mapPoint(node(d, measure.lower), height).y;
  if (measure.kind === 'handle-order') {
    const handle = ([at, side]: readonly [NodeRef, 'in' | 'out']): Point => {
      const n = node(d, at), x = side === 'in' ? n.ix : n.ox, y = side === 'in' ? n.iy : n.oy;
      if (x === undefined || y === undefined) throw Error(`Missing authored neck handle ${refKey(at)}`);
      return { x, y };
    };
    return mapPoint(handle(measure.upper), height).y - mapPoint(handle(measure.lower), height).y;
  }
  const tip = node(d, measure.tip), base = node(d, measure.rail[0]), x = base.x + (tip.y - base.y) * slope(d, measure.rail);
  return (measure.side === 'left' ? x - tip.x : tip.x - x) * height.xScale;
}
export function reviewFeatures(program: FeatureProgram) {
  const decoded = decodeWeightMasters(program.base), weights = program.base.masters.flatMap((m, i, all) => i ? [(all[i - 1].weight + m.weight) / 2, m.weight] : [m.weight]);
  const failures: { check: string; glyph: string; weight: number; value: number; height: number }[] = [];
  const minima = Object.fromEntries(program.clearances.map(c => [c.id, Infinity]));
  let cases = 0;
  for (const weight of weights) {
    const font = interpolateMasters(decoded, weight), cap = font.cap;
    const heights: OutlineTransform[] = [identity(cap), { xScale: .8, y: [[-cap * .4, -cap * .32], [0, 0], [font.xh, font.xh * .78], [cap, cap * 1.2]] },
      { xScale: 1.2, y: [[-cap * .4, -cap * .5], [0, 0], [font.xh, font.xh * 1.12], [cap, cap * 1.28]] }];
    for (const glyph of program.scope.glyphs) for (let hi = 0; hi < heights.length; hi++) {
      const height = heights[hi], source = { digest: program.source.digest, glyph };
      const plain = font.glyphs[glyph], original = mapAuthored(identifyAuthored({ ...plain, adv: plain.adv * height.xScale }, source), height, plain, source), expected = topology(original.contours);
      for (const value of [-1, -.5, 0, .5, 1]) {
        const values = { crossbar: value, tail: value, terminalLength: value }, made = evaluateFeatures(program, { glyph, weight, values, height });
        const actual = topology(made.contours); cases++;
        const fail = (check: string) => failures.push({ check, glyph, weight, value, height: hi });
        if (actual.pieces !== expected.pieces || actual.counters !== expected.counters) fail('filled topology');
        if (value === 0 && drawing(made) !== drawing(original)) fail('neutral geometry');
        if (made.contours.flat().some(n => n.authored?.digest !== source.digest || n.authored.glyph !== glyph)) fail('point provenance');
        if (!Number.isFinite(made.adv) || made.adv <= 0 || !made.contours.flat().every(n => packNode(n).every(v => v === null || Number.isFinite(v)))) fail('finite coordinates');
        const canonical = hi === 0 ? made : evaluateFeatures(program, { glyph, weight, values, height: identity(cap) });
        if (hi === 0) for (const feature of program.features.filter(f => f.glyph === glyph)) {
          if (feature.metrics.kind !== 'right-bearing') continue;
          const { anchors } = feature.metrics, bearing = (d: Drawn) => d.adv - Math.max(...anchors.map(at => node(d, at).x));
          if (bearing(canonical) < bearing(font.glyphs[glyph]) - 1e-8) fail(`${feature.id} right bearing`);
        }
        for (const constraint of program.clearances.filter(c => c.glyph === glyph)) {
          const found = clearance(canonical, constraint, height); minima[constraint.id] = Math.min(minima[constraint.id], found);
          if (found < constraint.minimum) fail(constraint.id);
        }
      }
    }
  }
  return { cases, failures, minima, weights, glyphs: program.scope.glyphs, wholeFontControl: false };
}

export function renderFeatures(program: FeatureProgram, output: string): void {
  const base = buildFont(DEFAULTS), source = decodeWeightMasters(program.base), rows: Row[] = [];
  const weights = [program.base.masters[0].weight, program.base.defaultWeight, program.base.masters[program.base.masters.length - 1].weight];
  for (const weight of [...new Set(weights)]) for (const value of [-1, 0, 1]) {
    const font = interpolateMasters(source, weight), values = { crossbar: value, tail: value, terminalLength: value };
    const drawings = new Map<string, Drawn>();
    const get = (ch: string): Drawn | undefined => {
      if (!font.glyphs[ch]) return undefined;
      let d = drawings.get(ch);
      if (!d) { d = evaluateFeatures(program, { glyph: ch, weight, values, height: identity(font.cap) }); drawings.set(ch, d); }
      return d;
    };
    const display: Font = { ...base, m: { ...base.m, cap: font.cap, asc: font.cap, desc: -font.cap * .28 }, letter() { return this; },
      advance(ch: string) { return get(ch)?.adv ?? font.space; },
      layout(text: string) { let x = 0; const items = [...text].map(ch => { const adv = get(ch)?.adv ?? font.space, item = { ch, adv, x }; x += adv; return item; }); return [{ items, width: x }]; },
      glyph(ch: string) { const original = base.glyph(ch); if (!original || !font.glyphs[ch]) return original;
        const d = get(ch); if (!d) return original;
        const cmds = drawnCmds(d.contours), box = cmdsBox(cmds);
        return { ...original, drawn: d, cmds, d: cmdsToD(cmds), adv: d.adv, bodyW: box ? box.x1 - box.x0 : 0 };
      },
    };
    rows.push({ font: display, text: 'H A R c  RR RH Rc', label: `${program.source.fontId} weight ${weight}, features ${value}` });
  }
  writeFileSync(output + '.svg', rowsSVG(rows, 100));
  writeFileSync(output + '.png', rowsPNG(rows, 100));
  writeFileSync(output + '-text.png', rowsPNG(rows, 24));
  const terminals = rows.filter(r => r.label?.includes(`weight ${program.base.defaultWeight},`)).map(r => ({ ...r, text: 'c' }));
  writeFileSync(output + '-terminals.png', rowsPNG(terminals, 350));
}

function renderBindings(program: FeatureProgram): string {
  const font = interpolateMasters(decodeWeightMasters(program.base), program.base.defaultWeight), scale = 220 / font.cap, cell = 320;
  const cells = [...program.scope.glyphs].map((glyph, i) => {
    const d = font.glyphs[glyph], features = program.features.filter(f => f.glyph === glyph);
    const affected = new Set(features.flatMap(f => f.affected.map(refKey)));
    const ports = new Set(features.flatMap(f => f.attachment.kind === 'fixed-port' ? f.attachment.nodes.map(refKey) : []));
    const points = d.contours.flatMap((c, ci) => c.map((n, ni) => {
      const key = refKey([ci, ni]), color = ports.has(key) ? '#c05a12' : affected.has(key) ? '#1473b8' : '#777';
      const x = 20 + n.x * scale, y = 275 - n.y * scale;
      return `<circle cx="${x}" cy="${y}" r="2.4" fill="${color}"/><text x="${x + 3}" y="${y - 3}" fill="${color}" font-size="8">${key}</text>`;
    })).join('');
    return `<g transform="translate(${i * cell},0)"><text x="20" y="30" font-size="18">${glyph}</text><path transform="translate(20,275) scale(${scale})" d="${cmdsToD(drawnCmds(d.contours))}" fill="#ddd"/>${points}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cell * program.scope.glyphs.length}" height="340"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif">${cells}<text x="20" y="325" font-size="12">${program.source.fontId}: blue points move; orange ports and their handles stay fixed; labels are contour:node.</text></g></svg>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2] ?? '.audit/masters/features'; mkdirSync(output, { recursive: true });
  const selected = process.argv[3] ? PILOT_BINDINGS.filter(b => b.fontId === process.argv[3]) : PILOT_BINDINGS;
  if (!selected.length) throw Error('Unknown pilot style');
  for (const bindings of selected) {
    const ref = mastersForFont(bindings.fontId);
    if (!ref) throw Error(`No master package for ${bindings.fontId}`);
    const bytes = readFileSync(`fonts/masters/${ref.digest}.json`);
    if (createHash('sha256').update(bytes).digest('hex') !== ref.digest) throw Error('Master digest mismatch');
    const base = parseWeightMasters(JSON.parse(bytes.toString())), program = authorFeatures(ref, base, bindings), report = reviewFeatures(program);
    const prefix = `${output}/${bindings.fontId.split(':')[0]}`;
    writeFileSync(prefix + '.json', JSON.stringify(program)); writeFileSync(prefix + '-review.json', JSON.stringify(report, null, 2));
    writeFileSync(prefix + '-bindings.svg', renderBindings(program));
    renderFeatures(program, prefix); console.log(JSON.stringify({ family: bindings.fontId, ...report }));
    if (report.failures.length) process.exitCode = 1;
  }
}
