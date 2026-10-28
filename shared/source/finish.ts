/* Source finishing separates final ink from the editable source curves. */
import type { Params } from '../params';
import type { Glyph } from '../engine/font';
import { combine, shape } from '../engine/boolean';
import { cmdsBox, cmdsToD, cubicAt, inPoly, roundContour, signedArea, subCubic, transformCmds } from '../engine/geom';
import type { Cmd, Pt } from '../engine/types';
import { compileHollow, hollowSource, type HollowPlan } from './hollow';
import { compileTraps, parseSourceTraps, sourceTrapsExtend, trapSourceInk, type SourceTrapPolicy, type TrapPlan } from './traps';
import { compileInline, compileWire, inlineSourceInk, parseSourceInline, parseSourceWire, sourceInlineExtends, sourceWireExtends, wireSourceInk,
  type InlinePlan, type SourceInlinePolicy, type SourceWirePolicy, type WirePlan } from './inline';
import { compileSourcePattern, parseSourcePatterns, patternSourceInk, sourcePatternControls, sourcePatternFills,
  sourcePatternsExtend, type SourcePatternPlan, type SourcePatternPolicy } from './patterns';
import type { SourceEffect } from './effect-error';
import { compileSourceTexture, parseSourceTexture, sourceTextureExtends, textureSourceInk, type SourceTexturePlan, type SourceTexturePolicy } from './texture';

export interface SourceFinishPolicy {
  format: 'source-finish-v1';
  tolerance: number;
  shadow: { depth: readonly [number, number]; gap: number; minAreaRatio: number };
  slice?: { maxGap: number; position: readonly [number, number] };
  outline?: { rim: readonly [number, number]; tolerance: number };
  inline?: SourceInlinePolicy;
  wire?: SourceWirePolicy;
  traps?: SourceTrapPolicy;
  patterns?: SourcePatternPolicy;
  texture?: SourceTexturePolicy;
}
type FinishCoordinates = Pick<Params, 'fill' | 'module' | 'slice' | 'slicePos' | 'sliceRound' | 'dotGain' | 'roundness' | 'wobble' | 'rough' | 'joints'>;
interface SlicePlan { at: number; gap: number; rounding: number; tolerance: number }
export type SourceFinishPlan = ({ kind: 'solid' } | {
  kind: 'shadow'; dx: number; dy: number; gap: number; tolerance: number; minArea: number;
} | ({ kind: 'outline' } & HollowPlan) | InlinePlan | WirePlan | { kind: 'pattern'; pattern: SourcePatternPlan }) & { slice?: SlicePlan; texture?: SourceTexturePlan; traps?: TrapPlan };
const FILLS: readonly Params['fill'][] = ['solid', 'shadow'];
export const sourceFinishFills = (policy: SourceFinishPolicy): readonly Params['fill'][] => [
  ...FILLS, ...(policy.outline ? ['outline' as const] : []), ...(policy.inline ? ['inline' as const] : []), ...(policy.wire ? ['wire' as const] : []),
  ...(policy.patterns ? sourcePatternFills(policy.patterns) : [])
];
export const sourceFinishControls = (policy: SourceFinishPolicy, fill?: Params['fill']): readonly (keyof Params)[] => [...new Set<keyof Params>([
  'fill', ...(fill === 'solid' ? [] : ['module'] as const), ...(policy.slice ? ['slice', 'slicePos', 'sliceRound'] as const : []),
  ...(policy.patterns ? sourcePatternControls(policy.patterns, fill) : []), ...(policy.traps ? ['joints'] as const : []),
  ...(policy.texture ? ['wobble', 'rough'] as const : [])
])];
export function sourceFinishPrecision(policy: SourceFinishPolicy, request: Pick<Params, 'fill' | 'wobble' | 'rough' | 'joints'>): SourceEffect | null {
  const { fill } = request;
  if (policy.texture && (request.wobble > 0 || request.rough > 0)) return 'texture';
  if (fill === 'outline' && policy.outline) return 'outline';
  if (fill === 'inline' && policy.inline) return 'inline';
  if (fill === 'wire' && policy.wire) return 'wire';
  if (policy.patterns && sourcePatternFills(policy.patterns).some(kind => kind === fill)) return 'pattern';
  return policy.traps && request.joints > 0 ? 'traps' : null;
}
export function sourceFinishDefaults(policy: SourceFinishPolicy, previous?: SourceFinishPolicy): Partial<FinishCoordinates> {
  return { ...(!previous ? { fill: 'solid', module: .5 } : {}),
    ...(policy.slice && !previous?.slice ? { slice: 0, slicePos: .5, sliceRound: 0 } : {}),
    ...(policy.patterns && !previous?.patterns ? { dotGain: .5, roundness: 0 } : {}),
    ...(policy.texture && !previous?.texture ? { wobble: 0, rough: 0 } : {}),
    ...(policy.traps && !previous?.traps ? { joints: 0 } : {}) };
}
export function sourceFinishBounds(plan: SourceFinishPlan): { above: number; below: number } {
  return { above: (plan.slice?.gap ?? 0) + (plan.texture?.reach ?? 0),
    below: (plan.kind === 'shadow' ? -plan.dy : 0) + (plan.texture?.reach ?? 0) };
}
export function sourceFinishExtends(previous: SourceFinishPolicy, next: SourceFinishPolicy): boolean {
  return previous.format === next.format && previous.tolerance === next.tolerance
    && previous.shadow.depth[0] === next.shadow.depth[0] && previous.shadow.depth[1] === next.shadow.depth[1]
    && previous.shadow.gap === next.shadow.gap && previous.shadow.minAreaRatio === next.shadow.minAreaRatio
    && (!previous.slice || !!next.slice && previous.slice.maxGap === next.slice.maxGap
      && previous.slice.position[0] === next.slice.position[0] && previous.slice.position[1] === next.slice.position[1])
    && (!previous.outline || !!next.outline && previous.outline.tolerance === next.outline.tolerance
      && previous.outline.rim[0] === next.outline.rim[0] && previous.outline.rim[1] === next.outline.rim[1])
    && (!previous.inline || !!next.inline && sourceInlineExtends(previous.inline, next.inline))
    && (!previous.wire || !!next.wire && sourceWireExtends(previous.wire, next.wire))
    && (!previous.traps || !!next.traps && sourceTrapsExtend(previous.traps, next.traps))
    && (!previous.patterns || !!next.patterns && sourcePatternsExtend(previous.patterns, next.patterns))
    && (!previous.texture || !!next.texture && sourceTextureExtends(previous.texture, next.texture));
}

function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source finishing policy');
  const value = Object.fromEntries(Object.entries(input));
  if (Object.keys(value).some(key => !keys.includes(key))) throw new TypeError('Unknown source finishing field');
  return value;
}
function number(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) throw new TypeError('Expected a finite source finishing dimension');
  return input;
}
export function parseSourceFinish(input: unknown): SourceFinishPolicy {
  const value = object(input, ['format', 'tolerance', 'shadow', 'slice', 'outline', 'inline', 'wire', 'traps', 'patterns', 'texture']), shadow = object(value.shadow, ['depth', 'gap', 'minAreaRatio']);
  if (value.format !== 'source-finish-v1' || !Array.isArray(shadow.depth) || shadow.depth.length !== 2) throw new TypeError('Unsupported source finishing policy');
  const tolerance = number(value.tolerance), low = number(shadow.depth[0]), high = number(shadow.depth[1]);
  const gap = number(shadow.gap), minAreaRatio = number(shadow.minAreaRatio);
  if (tolerance <= 0 || tolerance > .25 || low <= 0 || low >= high || high > .25 || gap <= 0 || gap >= low
    || minAreaRatio < 0 || minAreaRatio > 4) throw new RangeError('Source finishing dimensions exceed the supported bounds');
  let slice: SourceFinishPolicy['slice'];
  if ('slice' in value) {
    const cut = object(value.slice, ['maxGap', 'position']);
    if (!Array.isArray(cut.position) || cut.position.length !== 2) throw new TypeError('Invalid source slice position interval');
    const maxGap = number(cut.maxGap), bottom = number(cut.position[0]), top = number(cut.position[1]);
    if (maxGap <= 0 || maxGap > .25 || bottom <= 0 || bottom >= top || top >= 1) throw new RangeError('Source slice dimensions exceed the supported bounds');
    slice = { maxGap, position: [bottom, top] };
  }
  let outline: SourceFinishPolicy['outline'];
  if ('outline' in value) {
    const hollow = object(value.outline, ['rim', 'tolerance']);
    if (!Array.isArray(hollow.rim) || hollow.rim.length !== 2) throw new TypeError('Invalid source outline rim interval');
    const low = number(hollow.rim[0]), high = number(hollow.rim[1]), tolerance = number(hollow.tolerance);
    if (low <= 0 || low >= high || high > .1 || tolerance < .01 || tolerance > .25) throw new RangeError('Source outline dimensions exceed the supported bounds');
    outline = { rim: [low, high], tolerance };
  }
  const inline = 'inline' in value ? parseSourceInline(value.inline) : undefined;
  const wire = 'wire' in value ? parseSourceWire(value.wire) : undefined;
  const traps = 'traps' in value ? parseSourceTraps(value.traps) : undefined;
  const patterns = 'patterns' in value ? parseSourcePatterns(value.patterns) : undefined;
  const texture = 'texture' in value ? parseSourceTexture(value.texture) : undefined;
  return { format: 'source-finish-v1', tolerance, shadow: { depth: [low, high], gap, minAreaRatio },
    ...(slice ? { slice } : {}), ...(outline ? { outline } : {}), ...(inline ? { inline } : {}), ...(wire ? { wire } : {}), ...(traps ? { traps } : {}),
    ...(patterns ? { patterns } : {}), ...(texture ? { texture } : {}) };
}

export function compileSourceFinish(policy: SourceFinishPolicy, request: FinishCoordinates, measures: { capHeight: number }): SourceFinishPlan {
  if (!sourceFinishFills(policy).includes(request.fill)) throw new RangeError(`Unsupported source finish: ${request.fill}`);
  const { capHeight } = measures, size = request.module;
  const texture = policy.texture ? compileSourceTexture(policy.texture, request, capHeight) : undefined;
  let slice: SlicePlan | undefined;
  if (policy.slice && request.slice !== 0) {
    if (![request.slice, request.slicePos, request.sliceRound].every(n => Number.isFinite(n) && n >= 0 && n <= 1)
      || !Number.isFinite(capHeight) || capHeight <= 0) throw new RangeError('Invalid source slice coordinates');
    const [low, high] = policy.slice.position;
    slice = { at: capHeight * (low + (high - low) * request.slicePos), gap: capHeight * policy.slice.maxGap * request.slice,
      rounding: request.sliceRound, tolerance: policy.tolerance };
  }
  const traps = policy.traps ? compileTraps(policy.traps, request.joints, capHeight) : undefined;
  const additions = { ...(slice ? { slice } : {}), ...(texture ? { texture } : {}), ...(traps ? { traps } : {}) };
  if (request.fill === 'solid') return { kind: 'solid', ...additions };
  if (!Number.isFinite(capHeight) || capHeight <= 0 || !Number.isFinite(size) || size < 0 || size > 1) throw new RangeError('Invalid source finishing coordinates');
  if (request.fill === 'outline' && policy.outline) {
    const [low, high] = policy.outline.rim;
    return { kind: 'outline', ...compileHollow({ rim: capHeight * (low + (high - low) * size), tolerance: policy.outline.tolerance }), ...additions };
  }
  if (request.fill === 'inline' && policy.inline) return { ...compileInline(policy.inline, size, capHeight), ...additions };
  if (request.fill === 'wire' && policy.wire) return { ...compileWire(policy.wire, size, capHeight), ...additions };
  if (policy.patterns && sourcePatternFills(policy.patterns).some(kind => kind === request.fill)) {
    return { kind: 'pattern', pattern: compileSourcePattern(policy.patterns, request, { capHeight, tolerance: policy.tolerance }), ...additions };
  }
  const [low, high] = policy.shadow.depth, dx = capHeight * (low + (high - low) * size), gap = capHeight * policy.shadow.gap;
  if (gap < policy.tolerance * 4) throw new RangeError('The shadow gap is too small for its curve tolerance');
  return { kind: 'shadow', dx, dy: -dx, gap, tolerance: policy.tolerance, minArea: gap * gap * policy.shadow.minAreaRatio, ...additions };
}

type Cubic = [Pt, Pt, Pt, Pt];
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function split([a, b, c, d]: Cubic): [Cubic, Cubic] {
  const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d), abc = mid(ab, bc), bcd = mid(bc, cd), at = mid(abc, bcd);
  return [[a, ab, abc, at], [at, bcd, cd, d]];
}
function distanceSquared(p: Pt, a: Pt, b: Pt): number {
  const x = b.x - a.x, y = b.y - a.y, length = x * x + y * y;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / length)) : 0;
  return (p.x - a.x - t * x) ** 2 + (p.y - a.y - t * y) ** 2;
}

/** Flatten only the generated finish. This retains tiny straight contours and uses a geometric curve bound. */
export function sourceFinishPolygons(cmds: Cmd[], tolerance: number): Pt[][] {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError('Invalid source curve tolerance');
  const result: Pt[][] = [];
  let contour: Pt[] = [], at: Pt = { x: 0, y: 0 }, count = 0;
  const add = (point: Pt) => {
    const last = contour.at(-1);
    if (!last || point.x !== last.x || point.y !== last.y) {
      if (++count > 65536) throw new RangeError('Source finish exceeds the curve point budget');
      contour.push(point);
    }
    at = point;
  };
  const curve = (points: Cubic, depth: number) => {
    if (Math.max(distanceSquared(points[1], points[0], points[3]), distanceSquared(points[2], points[0], points[3])) <= tolerance * tolerance) {
      add(points[3]); return;
    }
    if (depth >= 24) throw new RangeError('Source finish cannot meet its curve tolerance');
    const [a, b] = split(points); curve(a, depth + 1); curve(b, depth + 1);
  };
  const close = () => {
    const first = contour[0], last = contour.at(-1);
    if (first && last && contour.length > 1 && first.x === last.x && first.y === last.y) contour.pop();
    if (contour.length > 2) result.push(contour);
    contour = [];
  };
  for (const command of cmds) {
    if (command[0] === 'M') { close(); add({ x: command[1], y: command[2] }); }
    else if (command[0] === 'L') add({ x: command[1], y: command[2] });
    else if (command[0] === 'C') curve([at, { x: command[1], y: command[2] }, { x: command[3], y: command[4] }, { x: command[5], y: command[6] }], 0);
    else close();
  }
  close();
  return result;
}

interface SliceEdge { curve: Cubic; line: boolean; cut: boolean }
const samePoint = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;
function straight(a: Pt, b: Pt, cut = false): SliceEdge {
  return { curve: [a, { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
    { x: a.x + (b.x - a.x) * 2 / 3, y: a.y + (b.y - a.y) * 2 / 3 }, b], line: true, cut };
}
function sourceEdges(cmds: Cmd[]): SliceEdge[][] {
  const contours: SliceEdge[][] = [];
  let edges: SliceEdge[] = [], first: Pt | undefined, at: Pt = { x: 0, y: 0 };
  const close = () => {
    if (first && !samePoint(at, first)) edges.push(straight(at, first));
    if (edges.length) contours.push(edges);
    edges = []; first = undefined;
  };
  for (const cmd of cmds) {
    if (cmd[0] === 'M') { close(); first = at = { x: cmd[1], y: cmd[2] }; }
    else if (cmd[0] === 'L') { const end = { x: cmd[1], y: cmd[2] }; edges.push(straight(at, end)); at = end; }
    else if (cmd[0] === 'C') {
      const end = { x: cmd[5], y: cmd[6] };
      edges.push({ curve: [at, { x: cmd[1], y: cmd[2] }, { x: cmd[3], y: cmd[4] }, end], line: false, cut: false }); at = end;
    } else close();
  }
  close(); return contours;
}

/** Solve on monotone intervals, including tangencies. No curve sampling decides whether ink survives. */
function horizontalRoots(edge: SliceEdge, y: number): number[] {
  const q = edge.curve;
  if (edge.line) {
    const t = (y - q[0].y) / (q[3].y - q[0].y);
    return t > 0 && t < 1 ? [t] : [];
  }
  const a = -q[0].y + 3 * q[1].y - 3 * q[2].y + q[3].y;
  const b = 3 * q[0].y - 6 * q[1].y + 3 * q[2].y, c = 3 * (q[1].y - q[0].y), d = q[0].y - y;
  const at = (t: number) => t === 0 ? q[0].y - y : t === 1 ? q[3].y - y : ((a * t + b) * t + c) * t + d, turns = [0, 1];
  if (Math.abs(a) < 1e-14) { if (b !== 0) turns.push(-c / (2 * b)); }
  else {
    const disc = b * b - 3 * a * c;
    if (disc >= 0) { const root = Math.sqrt(disc); turns.push((-b - root) / (3 * a), (-b + root) / (3 * a)); }
  }
  const ts = [...new Set(turns.filter(t => t >= 0 && t <= 1))].sort((x, z) => x - z), roots: number[] = [];
  for (let i = 0; i < ts.length; i++) {
    if (ts[i] > 0 && ts[i] < 1 && Math.abs(at(ts[i])) < 1e-10) roots.push(ts[i]);
    if (i + 1 === ts.length || at(ts[i]) * at(ts[i + 1]) >= 0) continue;
    let low = ts[i], high = ts[i + 1];
    const sign = at(low) > 0;
    for (let n = 0; n < 52; n++) { const mid = (low + high) / 2; if ((at(mid) > 0) === sign) low = mid; else high = mid; }
    roots.push((low + high) / 2);
  }
  return [...new Set(roots)].sort((x, z) => x - z);
}
function edgePart(edge: SliceEdge, low: number, high: number): SliceEdge {
  if (low === 0 && high === 1) return edge;
  const q = subCubic(edge.curve, low, high);
  return { ...edge, curve: [low === 0 ? edge.curve[0] : q[0], q[1], q[2], high === 1 ? edge.curve[3] : q[3]] };
}

/** Exact nonzero winding for rounding clearance. A polygon approximation can reject every small round on a hairline. */
function sourceContains(contours: SliceEdge[][]): (x: number, y: number) => boolean {
  const pieces: { curve: Cubic; x0: number; x1: number }[] = [];
  for (const edge of contours.flat()) {
    const q = edge.curve, a = -q[0].y + 3 * q[1].y - 3 * q[2].y + q[3].y;
    const b = 3 * q[0].y - 6 * q[1].y + 3 * q[2].y, c = 3 * (q[1].y - q[0].y), turns = [0, 1];
    if (!edge.line) {
      if (Math.abs(a) < 1e-14) { if (b !== 0) turns.push(-c / (2 * b)); }
      else { const d = b * b - 3 * a * c; if (d >= 0) { const root = Math.sqrt(d); turns.push((-b - root) / (3 * a), (-b + root) / (3 * a)); } }
    }
    const ts = [...new Set(turns.filter(t => t >= 0 && t <= 1))].sort((x, y) => x - y);
    for (let i = 0; i + 1 < ts.length; i++) {
      const curve = edgePart(edge, ts[i], ts[i + 1]).curve;
      pieces.push({ curve, x0: Math.min(...curve.map(p => p.x)), x1: Math.max(...curve.map(p => p.x)) });
    }
  }
  return (x, y) => {
    let winding = 0;
    for (const { curve, x0, x1 } of pieces) {
      const up = curve[3].y > curve[0].y;
      if ((curve[0].y > y) === (curve[3].y > y) || x1 < x) continue;
      if (x0 > x) { winding += up ? 1 : -1; continue; }
      let low = 0, high = 1;
      for (let i = 0; i < 40; i++) { const t = (low + high) / 2; if ((cubicAt(curve, t).y < y) === up) low = t; else high = t; }
      if (cubicAt(curve, (low + high) / 2).x > x) winding += up ? 1 : -1;
    }
    return winding !== 0;
  };
}

/** Close clipped runs on the cut line, cancelling opposite cap edges so open counters join their outer contour. */
function clippedHalf(contours: SliceEdge[][], y: number, above: boolean): SliceEdge[][] {
  const kept: SliceEdge[] = [], caps: SliceEdge[] = [];
  for (const contour of contours) {
    const run: SliceEdge[] = [];
    for (const edge of contour) {
      const ts = [0, ...horizontalRoots(edge, y), 1];
      for (let i = 0; i + 1 < ts.length; i++) {
        if (ts[i + 1] - ts[i] < 1e-14) continue;
        const middle = cubicAt(edge.curve, (ts[i] + ts[i + 1]) / 2).y;
        if (above ? middle < y : middle > y) continue;
        const part = edgePart(edge, ts[i], ts[i + 1]), q = [...part.curve];
        if (ts[i] > 0) q[0] = { x: q[0].x, y };
        if (ts[i + 1] < 1) q[3] = { x: q[3].x, y };
        run.push({ ...part, curve: [q[0], q[1], q[2], q[3]] });
      }
    }
    if (!run.some(edge => above ? cubicAt(edge.curve, .5).y > y : cubicAt(edge.curve, .5).y < y)) continue;
    for (const edge of run) {
      if (edge.curve.every(point => point.y === y)) caps.push(edge);
      else kept.push(edge);
    }
    for (let i = 0; i < run.length; i++) {
      const end = run[i].curve[3], next = run[(i + 1) % run.length].curve[0];
      if (!samePoint(end, next)) caps.push(straight(end, next, true));
    }
  }
  const contacts = kept.flatMap(edge => [edge.curve[0], edge.curve[3]]).filter(point => point.y === y).map(point => point.x);
  const xs = [...new Set([...contacts, ...caps.flatMap(edge => [edge.curve[0].x, edge.curve[3].x])])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++) {
    const middle = (xs[i] + xs[i + 1]) / 2;
    const winding = caps.reduce((sum, edge) => {
      const a = edge.curve[0].x, b = edge.curve[3].x;
      return sum + (middle > Math.min(a, b) && middle < Math.max(a, b) ? Math.sign(b - a) : 0);
    }, 0);
    const a = { x: xs[i], y }, b = { x: xs[i + 1], y };
    const contributing = caps.filter(edge => middle > Math.min(edge.curve[0].x, edge.curve[3].x)
      && middle < Math.max(edge.curve[0].x, edge.curve[3].x) && Math.sign(edge.curve[3].x - edge.curve[0].x) === Math.sign(winding))
      .sort((a, b) => Number(a.cut) - Number(b.cut));
    for (let n = 0; n < Math.abs(winding); n++) kept.push(winding > 0 ? straight(a, b, contributing[n].cut) : straight(b, a, contributing[n].cut));
  }
  const key = (p: Pt) => `${p.x},${p.y}`, from = new Map<string, number[]>();
  kept.forEach((edge, i) => { const start = key(edge.curve[0]), list = from.get(start) ?? []; list.push(i); from.set(start, list); });
  const used = new Set<number>(), result: SliceEdge[][] = [];
  for (let i = 0; i < kept.length; i++) {
    if (used.has(i)) continue;
    const chain: SliceEdge[] = [], start = key(kept[i].curve[0]);
    let next: number | undefined = i;
    while (next !== undefined) {
      const edge = kept[next]; used.add(next); chain.push(edge);
      const end = key(edge.curve[3]);
      if (end === start) break;
      next = from.get(end)?.find(index => !used.has(index));
      if (next === undefined) throw new Error('Source slice edges did not close');
    }
    result.push(chain);
  }
  return result;
}

function edgeLengths(edge: SliceEdge, tolerance: number): { t: number; length: number }[] {
  const samples = [{ t: 0, length: 0 }];
  let previous = edge.curve[0], length = 0;
  const walk = (curve: Cubic, low: number, high: number, depth: number) => {
    if (edge.line || depth === 20 || Math.max(distanceSquared(curve[1], curve[0], curve[3]), distanceSquared(curve[2], curve[0], curve[3])) <= tolerance * tolerance) {
      length += Math.hypot(curve[3].x - previous.x, curve[3].y - previous.y); previous = curve[3];
      samples.push({ t: high, length }); return;
    }
    const [a, b] = split(curve), mid = (low + high) / 2;
    walk(a, low, mid, depth + 1); walk(b, mid, high, depth + 1);
  };
  walk(edge.curve, 0, 1, 0); return samples;
}
function atLength(samples: { t: number; length: number }[], length: number): number {
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].length < length) continue;
    const a = samples[i - 1], b = samples[i];
    return a.t + (b.t - a.t) * (length - a.length) / (b.length - a.length || 1);
  }
  return 1;
}

/** Boundary roots partition the curve into intervals with constant box membership. */
function entersBox(edge: SliceEdge, box: { x0: number; x1: number; y0: number; y1: number }): boolean {
  const q = edge.curve;
  if (q.every(p => p.x <= box.x0) || q.every(p => p.x >= box.x1)
    || q.every(p => p.y <= box.y0) || q.every(p => p.y >= box.y1)) return false;
  const swap = (p: Pt): Pt => ({ x: p.y, y: p.x });
  const swapped: SliceEdge = { ...edge, curve: [swap(q[0]), swap(q[1]), swap(q[2]), swap(q[3])] };
  const ts = [...new Set([0, ...horizontalRoots(edge, box.y0), ...horizontalRoots(edge, box.y1),
    ...horizontalRoots(swapped, box.x0), ...horizontalRoots(swapped, box.x1), 1])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < ts.length; i++) {
    const p = cubicAt(q, (ts[i] + ts[i + 1]) / 2);
    if (p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1) return true;
  }
  return false;
}

function nonnegativeBernstein(values: number[], error: number, depth = 0): boolean {
  if (values.every(value => value >= -error)) return true;
  if (values.every(value => value < -error) || depth === 24) return false;
  const left = [values[0]], right = [values[values.length - 1]];
  while (values.length > 1) {
    values = values.slice(1).map((value, i) => (values[i] + value) / 2);
    left.push(values[0]); right.unshift(values[values.length - 1]);
  }
  return nonnegativeBernstein(left, error, depth + 1) && nonnegativeBernstein(right, error, depth + 1);
}

/** The quadratic's implicit parabola is degree six along a cubic source edge. Its Bernstein bounds prove that the removed edge never crosses the fillet. */
function supportsFillet(edge: SliceEdge, p: Pt, control: Pt, q: Pt, corner: Pt): boolean {
  const a = p.x - 2 * control.x + q.x, b = 2 * (control.x - q.x), d = p.y - q.y;
  const y = edge.curve.map(point => point.y - q.y), v = edge.curve.map((point, i) => d * (point.x - q.x) - a * y[i]);
  const starts = samePoint(edge.curve[0], p), ends = samePoint(edge.curve[3], p);
  if (b === 0) {
    if (starts) { v[0] = 0; v[1] = 0; }
    if (ends) { v[3] = 0; v[2] = 0; }
    const sign = Math.sign(d * (corner.x - q.x));
    return sign !== 0 && nonnegativeBernstein(v.map(value => value * sign), Math.max(...v.map(Math.abs)) * Number.EPSILON * 512);
  }
  const choose3 = [1, 3, 3, 1], choose6 = [1, 6, 15, 20, 15, 6, 1], values: number[] = [];
  let magnitude = 0;
  for (let k = 0; k <= 6; k++) {
    let square = 0, height = 0;
    for (let i = Math.max(0, k - 3); i <= Math.min(3, k); i++) {
      const factor = choose3[i] * choose3[k - i] / choose6[k];
      square += factor * v[i] * v[k - i]; height += factor * y[i];
    }
    const term = b * b * d * height;
    magnitude = Math.max(magnitude, Math.abs(square), Math.abs(term)); values.push(square - term);
  }
  // The shared source contact is a double root: both curves have the same point and tangent.
  if (starts) { values[0] = 0; values[1] = 0; }
  if (ends) { values[6] = 0; values[5] = 0; }
  return nonnegativeBernstein(values, magnitude * Number.EPSILON * 512);
}

/** The whole removed corner must be clear, including a counter enclosed between the arc and its source edges. */
function clearCorner(contours: SliceEdge[][], own: SliceEdge[], trimmed: Map<number, { low: number; high: number }>, curve: Cubic, p: Pt, control: Pt, q: Pt, corner: Pt): boolean {
  const removedEdges = [...trimmed].map(([i, range]) => {
    const edge = edgePart(own[i], range.low, range.high), q = edge.curve;
    const curve: Cubic = [range.low > 0 ? p : q[0], q[1], q[2], range.high < 1 ? p : q[3]];
    return { ...edge, curve };
  });
  if (removedEdges.some(edge => !supportsFillet(edge, p, control, q, corner))) return false;
  const points = [...curve, ...removedEdges.flatMap(edge => edge.curve)];
  const margin = Math.max(1, ...points.flatMap(p => [Math.abs(p.x), Math.abs(p.y)])) * Number.EPSILON * 256;
  const box = { x0: Math.min(...points.map(p => p.x)) + margin, x1: Math.max(...points.map(p => p.x)) - margin,
    y0: Math.min(...points.map(p => p.y)) + margin, y1: Math.max(...points.map(p => p.y)) - margin };
  for (const edges of contours) for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]; if (edge.cut) continue;
    const removed = edges === own ? trimmed.get(i) : undefined;
    if (!removed) { if (entersBox(edge, box)) return false; }
    else {
      if (removed.low > 0 && entersBox(edgePart(edge, 0, removed.low), box)) return false;
      if (removed.high < 1 && entersBox(edgePart(edge, removed.high, 1), box)) return false;
    }
  }
  return true;
}

function roundedHalf(contours: SliceEdge[][], plan: SlicePlan, above: boolean, source: (x: number, y: number) => boolean): Cmd[] {
  const result: Cmd[] = [];
  for (const edges of contours) {
    if (!edges.length) continue;
    const lengths = edges.map(edge => edgeLengths(edge, plan.tolerance / 4));
    const totals = lengths.map(samples => samples[samples.length - 1].length), n = edges.length;
    const index = (i: number) => (i + n) % n, limits = edges.map(() => ({ low: 0, high: 1 }));
    const rounds = new Map<number, SliceEdge>();
    const available = (start: number, direction: -1 | 1) => {
      let total = 0, i = start;
      for (let count = 0; count < n; count++) {
        total += totals[i];
        const next = index(i + direction);
        if (edges[next].cut !== edges[i].cut) break;
        const a = cubicAt(edges[direction === 1 ? i : next].curve, 1), b = cubicAt(edges[direction === 1 ? next : i].curve, 0);
        if (a.tx * b.tx + a.ty * b.ty < .999) break;
        i = next;
      }
      return total;
    };
    const locate = (start: number, direction: -1 | 1, distance: number, apply: boolean, trimmed?: Map<number, { low: number; high: number }>) => {
      let i = start;
      for (let count = 0; count < n; count++) {
        const take = Math.min(distance, totals[i]);
        const t = atLength(lengths[i], direction === 1 ? take : totals[i] - take);
        if (apply) { if (direction === 1) limits[i].low = Math.max(limits[i].low, t); else limits[i].high = Math.min(limits[i].high, t); }
        if (trimmed) trimmed.set(i, direction === 1 ? { low: 0, high: t } : { low: t, high: 1 });
        distance -= take;
        if (distance <= 1e-10) return cubicAt(edges[i].curve, t);
        i = index(i + direction);
      }
      throw new Error('Source slice corner exceeds its available curve');
    };
    for (let i = 0; i < n; i++) {
      const previous = index(i - 1);
      if (!plan.rounding || edges[i].cut === edges[previous].cut) continue;
      const incoming = cubicAt(edges[previous].curve, 1), outgoing = cubicAt(edges[i].curve, 0);
      if (incoming.tx * outgoing.tx + incoming.ty * outgoing.ty > 1 - 1e-10) continue;
      const sourceFirst = !edges[previous].cut, sourceIndex = sourceFirst ? previous : i, sourceDirection = sourceFirst ? -1 : 1;
      const capIndex = sourceFirst ? i : previous, capDirection = sourceFirst ? 1 : -1, corner = edges[i].curve[0];
      const capSign = Math.sign(edges[capIndex].curve[3].x - edges[capIndex].curve[0].x), side = above ? 1 : -1;
      // A cap stops at the next source contact, including a counter tangent to the cut.
      const capRoom = totals[capIndex] / 2, sourceRoom = available(sourceIndex, sourceDirection) / 2;
      // The control moves the cap contact continuously. The source contact is solved for that width,
      // because a valid large fillet does not imply every smaller source setback stays inside a curve.
      const capDistance = capRoom * plan.rounding;
      const q = { x: corner.x + capSign * capDirection * capDistance, y: plan.at };
      const candidate = (distance: number): SliceEdge | null => {
        const trimmed = new Map<number, { low: number; high: number }>();
        const p = locate(sourceIndex, sourceDirection, distance, false, trimmed), intersection = p.x - (p.y - plan.at) * p.tx / p.ty;
        if (!Number.isFinite(intersection) || (sourceFirst ? q.x - intersection : intersection - q.x) * capSign < 0) return null;
        const control = { x: intersection, y: plan.at }, a = sourceFirst ? p : q, b = sourceFirst ? q : p;
        const curve: Cubic = [a, { x: a.x + (control.x - a.x) * 2 / 3, y: a.y + (control.y - a.y) * 2 / 3 },
          { x: b.x + (control.x - b.x) * 2 / 3, y: b.y + (control.y - b.y) * 2 / 3 }, b];
        if (curve.some(point => side * (point.y - plan.at) < -1e-8)) return null;
        const point = cubicAt(curve, .5);
        if (!source(point.x, point.y) || !clearCorner(contours, edges, trimmed, curve, p, control, q, corner)) return null;
        return { curve, line: false, cut: true };
      };
      let high = Math.min(sourceRoom, capRoom) * plan.rounding, low = high, round = candidate(low);
      for (let step = 0; !round && step < 40; step++) { high = low; low /= 2; round = candidate(low); }
      if (!round) throw new Error('Source slice corner has no valid rounding contact');
      if (low < high) for (let step = 0; step < 24; step++) {
        const distance = (low + high) / 2, next = candidate(distance);
        if (next) { low = distance; round = next; } else high = distance;
      }
      locate(sourceIndex, sourceDirection, low, true); locate(capIndex, capDirection, capDistance, true);
      rounds.set(i, round);
    }
    const pieces: SliceEdge[] = [];
    for (let i = 0; i < n; i++) {
      if (limits[i].high > limits[i].low) pieces.push(edgePart(edges[i], limits[i].low, limits[i].high));
      const round = rounds.get(index(i + 1)); if (round) pieces.push(round);
    }
    if (!pieces.length) continue;
    const first = pieces[0].curve[0]; result.push(['M', first.x, first.y]);
    for (const piece of pieces) {
      const q = piece.curve;
      if (piece.line) { if (!samePoint(q[0], q[3])) result.push(['L', q[3].x, q[3].y]); }
      else result.push(['C', q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y]);
    }
    const last = result[result.length - 1];
    if (last[0] === 'L' && last[1] === first.x && last[2] === first.y) result.pop();
    result.push(['Z']);
  }
  return result;
}
function openedSlice(cmds: Cmd[], plan: SlicePlan): Cmd[] {
  const contours = sourceEdges(cmds), source = sourceContains(contours);
  return [...roundedHalf(clippedHalf(contours, plan.at, false), plan, false, source),
    ...transformCmds(roundedHalf(clippedHalf(contours, plan.at, true), plan, true, source), [1, 0, 0, 1, 0, plan.gap])];
}

const translated = (polys: Pt[][], dx: number, dy: number): Pt[][] => polys.map(p => p.map(q => ({ x: q.x + dx, y: q.y + dy })));

/** Sweep canonical filled ink, including its counters. All swept edge bands add positive ink. */
function swept(solid: Pt[][], dx: number, dy: number): Pt[][] {
  const move = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy });
  const result = [...solid, ...solid.map(p => p.map(move))];
  for (const contour of solid) {
    const n = contour.length;
    const faces = (i: number) => {
      const a = contour[i % n], b = contour[(i + 1) % n];
      return (b.x - a.x) * dy - (b.y - a.y) * dx < -1e-9;
    };
    let start = 0;
    while (start < n && faces(start + n - 1)) start++;
    for (let i = start; i < start + n; i++) {
      if (!faces(i)) continue;
      const run = [contour[i % n]];
      while (i < start + n && faces(i)) run.push(contour[++i % n]);
      const band = [...run, ...[...run].reverse().map(move)];
      result.push(signedArea(band) < 0 ? band.reverse() : band);
    }
  }
  return result;
}

/** A tiny detached shadow component and its holes go together; retained components keep every counter. */
function visibleComponents(polys: Pt[][], minimum: number): Pt[][] {
  const areas = polys.map(signedArea), groups: { poly: Pt[]; area: number; holes: Pt[][] }[] = [];
  for (let i = 0; i < polys.length; i++) if (areas[i] > 0) groups.push({ poly: polys[i], area: areas[i], holes: [] });
  for (let i = 0; i < polys.length; i++) {
    if (areas[i] >= 0) continue;
    const hole = polys[i];
    const home = groups.filter(group => inPoly(group.poly, hole[0])).sort((a, b) => a.area - b.area)[0];
    if (home) home.holes.push(hole);
  }
  return groups.filter(group => group.area + group.holes.reduce((area, hole) => area + signedArea(hole), 0) >= minimum)
    .flatMap(group => [group.poly, ...group.holes]);
}

export function finishSourceGlyph(glyph: Glyph, plan: SourceFinishPlan): Glyph {
  if (plan.kind === 'solid' && !plan.slice && !plan.texture && !plan.traps || !glyph.cmds.length) return glyph;
  const editable = glyph.editable ?? glyph.drawn;
  if (!editable) throw new TypeError('A source finish requires its editable drawing');
  // ink traps carve the letter's joins before anything else finishes it
  const trapped = plan.traps ? trapSourceInk(glyph.cmds, plan.traps) : glyph.cmds;
  const textured = plan.texture ? textureSourceInk(trapped, plan.texture, glyph.ch) : trapped;
  const face = plan.slice ? openedSlice(textured, plan.slice) : textured;
  if (plan.kind === 'solid') {
    const box = cmdsBox(face);
    return { ...glyph, cmds: face, d: cmdsToD(face), editable, fx: true,
      ...(box ? { bodyW: box.x1 - box.x0, lsb: box.x0, rsb: glyph.adv - box.x1 } : {}) };
  }
  if (plan.kind === 'outline') {
    const { cmds } = hollowSource(face, plan), box = cmdsBox(cmds);
    return { ...glyph, cmds, d: cmdsToD(cmds), editable, fx: true,
      ...(box ? { bodyW: box.x1 - box.x0, lsb: box.x0, rsb: glyph.adv - box.x1 } : {}) };
  }
  if (plan.kind === 'inline' || plan.kind === 'wire') {
    const cmds = plan.kind === 'inline' ? inlineSourceInk(face, plan) : wireSourceInk(face, plan), box = cmdsBox(cmds);
    return { ...glyph, cmds, d: cmdsToD(cmds), editable, fx: true,
      ...(box ? { bodyW: box.x1 - box.x0, lsb: box.x0, rsb: glyph.adv - box.x1 } : {}) };
  }
  if (plan.kind === 'pattern') {
    const cmds = patternSourceInk(face, plan.pattern), box = cmdsBox(cmds);
    return { ...glyph, cmds, d: cmdsToD(cmds), editable, fx: true,
      ...(box ? { bodyW: box.x1 - box.x0, lsb: box.x0, rsb: glyph.adv - box.x1 } : {}) };
  }
  const ink = shape(sourceFinishPolygons(face, plan.tolerance)), solid = combine([ink], ink.has);
  // Sweeping a filled shape in both axes gives square clearance without inverted offset holes.
  const across = shape(swept(translated(solid, -plan.gap, -plan.gap), 2 * plan.gap, 0));
  const grown = shape(swept(combine([across], across.has), 0, 2 * plan.gap));
  const back = shape(swept(solid, plan.dx, plan.dy));
  const shadow = visibleComponents(combine([grown, back], (x, y) => back.has(x, y) && !grown.has(x, y)), plan.minArea);
  const cmds = [...face, ...shadow.flatMap(poly => roundContour(poly, 0))];
  const box = cmdsBox(cmds), adv = glyph.adv + plan.dx;
  return { ...glyph, cmds, d: cmdsToD(cmds), editable, fx: true, adv,
    ...(box ? { bodyW: box.x1 - box.x0, lsb: box.x0, rsb: adv - box.x1 } : {}) };
}
