/* Original-sheet curves and first-master curves share explicit parameter spans, even across neutral repairs. */
import { cubicAt, subCubic } from '../engine/geom';
import { segment, type AuthoredPoint, type Drawn, type Node } from '../engine/outline';
import type { FreeFont } from '../engine/free';
import type { WeightMasters } from './masters';
import { parseSourceRef, type MasterSourceRef, type OutlineSourceRef } from './model';

export interface CurveInterval { segment: number; t0: number; t1: number }
export type OutlineMasterSpan =
  | { kind: 'curve'; source: CurveInterval; target: CurveInterval; parameter: 'curve' | 'line-distance' }
  | { kind: 'collapsed'; source: { segment: number; t: number }; target: CurveInterval };
export interface OutlineMasterContour { source: number; target: number; spans: OutlineMasterSpan[] }
export type NeutralRelation = { kind: 'exact' } | { kind: 'rounded' } | { kind: 'repaired'; reason: string };
export interface OutlineMasterGlyph { relation: NeutralRelation; contours: OutlineMasterContour[] }
export interface OutlineMasterMapData {
  format: 'outline-master-map-v1'; from: OutlineSourceRef; to: MasterSourceRef;
  glyphs: Record<string, OutlineMasterGlyph>;
}
export interface OutlineMasterMap { data: OutlineMasterMapData; source: FreeFont; neutral: FreeFont }

function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid outline master map object');
  const value = Object.fromEntries(Object.entries(input));
  if (Object.keys(value).some(key => !keys.includes(key))) throw new TypeError('Unknown outline master map field');
  return value;
}
function array(input: unknown): unknown[] {
  if (!Array.isArray(input)) throw new TypeError('Invalid outline master map array');
  return input;
}
function index(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) throw new RangeError('Invalid outline master map index');
  return input;
}
function interval(input: unknown): CurveInterval {
  const value = object(input, ['segment', 't0', 't1']), { t0, t1 } = value;
  if (typeof t0 !== 'number' || typeof t1 !== 'number' || ![t0, t1].every(t => Number.isFinite(t) && t >= 0 && t <= 1)) {
    throw new RangeError('Invalid outline master map parameter');
  }
  return { segment: index(value.segment), t0, t1 };
}
function relation(input: unknown): NeutralRelation {
  const value = object(input, ['kind', 'reason']);
  if (value.kind === 'repaired' && typeof value.reason === 'string' && value.reason.trim()) return { kind: value.kind, reason: value.reason };
  if ((value.kind === 'exact' || value.kind === 'rounded') && !('reason' in value)) return { kind: value.kind };
  throw new TypeError('Invalid neutral correspondence relation');
}
export function parseOutlineMasterMap(input: unknown): OutlineMasterMapData {
  const value = object(input, ['format', 'from', 'to', 'glyphs']), from = parseSourceRef(value.from), to = parseSourceRef(value.to);
  if (value.format !== 'outline-master-map-v1' || from?.kind !== 'outline-v1' || to?.kind !== 'masters-v1' || from.fontId !== to.fontId) {
    throw new TypeError('Invalid outline master map references');
  }
  if (!value.glyphs || typeof value.glyphs !== 'object' || Array.isArray(value.glyphs)) throw new TypeError('Invalid outline master glyph map');
  const glyphs: OutlineMasterMapData['glyphs'] = {};
  for (const [ch, input] of Object.entries(value.glyphs)) {
    if ([...ch].length !== 1) throw new TypeError('Mapped glyph must be one Unicode character');
    const glyph = object(input, ['relation', 'contours']);
    glyphs[ch] = { relation: relation(glyph.relation), contours: array(glyph.contours).map(input => {
      const contour = object(input, ['source', 'target', 'spans']);
      const spans = array(contour.spans).map(input => {
        const span = object(input, ['kind', 'source', 'target', 'parameter']), target = interval(span.target);
        if (target.t0 === target.t1) throw new TypeError('A target span must have parameter extent');
        if (span.kind === 'collapsed' && !('parameter' in span)) {
          const point = object(span.source, ['segment', 't']), range = interval({ segment: point.segment, t0: point.t, t1: point.t });
          return { kind: 'collapsed', source: { segment: range.segment, t: range.t0 }, target } satisfies OutlineMasterSpan;
        }
        if (span.kind !== 'curve' || span.parameter !== 'curve' && span.parameter !== 'line-distance') throw new TypeError('Invalid correspondence span kind');
        const source = interval(span.source);
        if (source.t0 === source.t1) throw new TypeError('Use an explicit collapsed slot for a zero source extent');
        return { kind: 'curve', source, target, parameter: span.parameter } satisfies OutlineMasterSpan;
      });
      if (!spans.length) throw new TypeError('Empty outline master contour map');
      return { source: index(contour.source), target: index(contour.target), spans };
    }) };
  }
  return { format: 'outline-master-map-v1', from, to, glyphs };
}

function curve(contour: Node[], i: number) {
  const a = contour[i], b = contour[(i + 1) % contour.length];
  return segment(a, b) ?? [a, { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
    { x: a.x + 2 * (b.x - a.x) / 3, y: a.y + 2 * (b.y - a.y) / 3 }, b];
}
export function correspondenceCurve(glyph: Drawn, contour: number, range: CurveInterval) {
  const original = curve(glyph.contours[contour], range.segment);
  const part = subCubic(original, Math.min(range.t0, range.t1), Math.max(range.t0, range.t1));
  return range.t1 < range.t0 ? part.reverse() : part;
}
function coverage(ranges: CurveInterval[], count: number): void {
  const first = ranges.find(r => r.t0 !== r.t1);
  if (!first) throw new TypeError('A correspondence contour must traverse source curves');
  const direction = Math.sign(first.t1 - first.t0);
  const parts: CurveInterval[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i], next = ranges[(i + 1) % ranges.length];
    if (range.segment >= count || range.t0 !== range.t1 && Math.sign(range.t1 - range.t0) !== direction) throw new TypeError('Invalid correspondence orientation or source segment');
    const distance = Math.abs(range.segment + range.t1 - next.segment - next.t0);
    if (distance > 1e-10 && Math.abs(distance - count) > 1e-10) throw new TypeError('Correspondence must form one contiguous traversal');
    if (range.t0 !== range.t1) parts[range.segment].push(range);
  }
  for (const part of parts) {
    const sorted = part.map(r => [Math.min(r.t0, r.t1), Math.max(r.t0, r.t1)]).sort((a, b) => a[0] - b[0]);
    let end = 0;
    for (const [low, high] of sorted) {
      if (Math.abs(low - end) > 1e-10) throw new TypeError('Correspondence has a parameter gap or overlap');
      end = high;
    }
    if (Math.abs(end - 1) > 1e-10) throw new TypeError('Correspondence must cover every segment');
  }
}
export function sourceInterval(span: OutlineMasterSpan): CurveInterval {
  return span.kind === 'curve' ? span.source : { segment: span.source.segment, t0: span.source.t, t1: span.source.t };
}
function straightCoordinates(points: { x: number; y: number }[]): number[] | null {
  const [a, , , b] = points, dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  if (!length) return null;
  const positions = points.map(p => ((p.x - a.x) * dx + (p.y - a.y) * dy) / length);
  if (points.some((p, i) => Math.hypot(p.x - a.x - positions[i] * dx, p.y - a.y - positions[i] * dy) > 1e-7)
    || positions.some((t, i) => t < -1e-10 || t > 1 + 1e-10 || i > 0 && t < positions[i - 1] - 1e-10)) return null;
  return positions;
}
export function decodeOutlineMasterMap(data: OutlineMasterMapData, bases: {
  from: { ref: OutlineSourceRef; font: FreeFont }; to: { ref: MasterSourceRef; masters: WeightMasters };
}): OutlineMasterMap {
  const { from, to } = bases, source = from.font, neutral = to.masters.masters.find(m => m.weight === to.masters.defaultWeight)?.font;
  if (!neutral || data.from.digest !== from.ref.digest || data.to.digest !== to.ref.digest
    || data.from.fontId !== from.ref.fontId || data.to.fontId !== to.ref.fontId
    || to.masters.source.digest !== data.from.digest || to.masters.source.fontId !== data.from.fontId
    || source.id !== data.from.fontId || neutral.id !== data.to.fontId) throw new TypeError('Outline map requires its exact original and first master');
  if (Math.max(Math.abs(source.cap - neutral.cap), Math.abs(source.xh - neutral.xh), Math.abs(source.space - neutral.space)) > 1e-9) throw new TypeError('An origin map cannot change font metrics');
  const originalKeys = Object.keys(source.glyphs).filter(ch => source.glyphs[ch].contours.length).sort();
  if (Object.keys(data.glyphs).sort().join('\0') !== originalKeys.join('\0')) throw new TypeError('Outline map must cover every nonempty original glyph');
  for (const [ch, glyph] of Object.entries(data.glyphs)) {
    const a = source.glyphs[ch], b = neutral.glyphs[ch];
    if (!b || glyph.contours.length !== a.contours.length || glyph.contours.length !== b.contours.length
      || new Set(glyph.contours.map(c => c.source)).size !== a.contours.length
      || new Set(glyph.contours.map(c => c.target)).size !== b.contours.length) throw new TypeError('Outline map must cover each contour once');
    let error = Math.abs(a.adv - b.adv);
    for (const contour of glyph.contours) {
      if (!a.contours[contour.source] || !b.contours[contour.target]) throw new TypeError('Mapped contour is missing');
      if (a.contours[contour.source].length < 3) throw new TypeError('Original contours need at least three anchors to disambiguate directed edge provenance');
      coverage(contour.spans.map(sourceInterval), a.contours[contour.source].length);
      coverage(contour.spans.map(s => s.target), b.contours[contour.target].length);
      for (const span of contour.spans) {
        const old = correspondenceCurve(a, contour.source, sourceInterval(span)), next = correspondenceCurve(b, contour.target, span.target);
        const linear = span.kind === 'curve' && span.parameter === 'line-distance';
        if (linear && (!straightCoordinates(old) || !straightCoordinates(next))) throw new TypeError('Line-distance correspondence requires two monotone straight curves');
        for (const i of linear ? [0, 3] : [0, 1, 2, 3]) error = Math.max(error, Math.hypot(old[i].x - next[i].x, old[i].y - next[i].y));
      }
    }
    const tolerance = glyph.relation.kind === 'rounded' ? Math.SQRT2 * .000005 + 1e-7 : 1e-7;
    if (glyph.relation.kind !== 'repaired' && error > tolerance) throw new TypeError(`Undeclared neutral repair in ${ch}: ${error}`);
  }
  return { data, source, neutral };
}

function mappedParameter(span: OutlineMasterSpan, t: number, source: Drawn, target: Drawn, contour: OutlineMasterContour): number {
  if (span.kind === 'collapsed') return span.target.t0;
  let fraction = (t - span.source.t0) / (span.source.t1 - span.source.t0);
  if (span.parameter === 'line-distance') {
    const old = correspondenceCurve(source, contour.source, span.source), next = correspondenceCurve(target, contour.target, span.target);
    const p = cubicAt(old, fraction), a = old[0], b = old[3], dx = b.x - a.x, dy = b.y - a.y;
    const distance = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    const x = next[3].x - next[0].x, y = next[3].y - next[0].y, length = x * x + y * y;
    let low = 0, high = 1;
    for (let i = 0; i < 52; i++) {
      const mid = (low + high) / 2, point = cubicAt(next, mid);
      if (((point.x - next[0].x) * x + (point.y - next[0].y) * y) / length < distance) low = mid; else high = mid;
    }
    fraction = distance <= 0 ? 0 : distance >= 1 ? 1 : (low + high) / 2;
  }
  return span.target.t0 + (span.target.t1 - span.target.t0) * fraction;
}
function targetOrigin(map: OutlineMasterMap, ch: string, contour: OutlineMasterContour, span: OutlineMasterSpan, t: number): AuthoredPoint {
  const value = Math.max(0, Math.min(1, t)), segments = map.neutral.glyphs[ch].contours[contour.target].length;
  return { digest: map.data.to.digest, glyph: ch, contour: contour.target,
    segment: value > 1 - 1e-12 ? (span.target.segment + 1) % segments : span.target.segment,
    t: value > 1 - 1e-12 ? 0 : value, segments };
}
function known(origin: AuthoredPoint | undefined, map: OutlineMasterMap, ch: string): origin is AuthoredPoint {
  const source = map.source.glyphs[ch];
  return !!origin && origin.digest === map.data.from.digest && origin.glyph === ch
    && !!source.contours[origin.contour]?.[origin.segment]
    && (origin.segments === undefined || origin.segments === source.contours[origin.contour].length);
}
function edgeInterval(a: AuthoredPoint | undefined, b: AuthoredPoint | undefined, map: OutlineMasterMap, ch: string): (CurveInterval & { contour: number }) | null {
  if (!known(a, map, ch) || !known(b, map, ch) || a.contour !== b.contour) return null;
  const count = map.source.glyphs[ch].contours[a.contour].length;
  if (a.segment === b.segment && a.t !== b.t) return { contour: a.contour, segment: a.segment, t0: a.t, t1: b.t };
  if (b.segment === (a.segment + 1) % count && b.t === 0) return { contour: a.contour, segment: a.segment, t0: a.t, t1: 1 };
  if (a.segment === (b.segment + 1) % count && a.t === 0) return { contour: a.contour, segment: b.segment, t0: 1, t1: b.t };
  return null;
}
interface EditedEdge { node: Node; curve: ReturnType<typeof curve>; explicit: boolean }

/** Preserve the saved sheet ink, then let normal edit transport apply master(current) minus master(neutral). */
export function rebaseOutlineEdits(edited: Drawn, map: OutlineMasterMap, ch: string): {
  drawing: Drawn; reference: Drawn; advanceResidual: number;
} | null {
  const glyph = map.data.glyphs[ch], source = map.source.glyphs[ch], target = map.neutral.glyphs[ch];
  if (!glyph) return null;
  const mappedPoint = (node: Node): Node => {
    if (!known(node.authored, map, ch)) return node;
    const origin = node.authored, contour = glyph.contours.find(c => c.source === origin.contour);
    if (!contour) throw new Error('Validated origin map lost a contour');
    const span = contour.spans.find(s => s.kind === 'curve' && s.source.segment === origin.segment
      && origin.t >= Math.min(s.source.t0, s.source.t1) - 1e-12 && origin.t <= Math.max(s.source.t0, s.source.t1) + 1e-12);
    if (!span) throw new Error('Validated origin map lost a source point');
    return { ...node, authored: targetOrigin(map, ch, contour, span, mappedParameter(span, origin.t, source, target, contour)) };
  };
  const contours = edited.contours.map(contour => {
    const edges: EditedEdge[] = [];
    contour.forEach((node, ni) => {
      const next = contour[(ni + 1) % contour.length], range = edgeInterval(node.authored, next.authored, map, ch), original = curve(contour, ni);
      if (!range) { edges.push({ node: mappedPoint(node), curve: original, explicit: false }); return; }
      const binding = glyph.contours.find(c => c.source === range.contour);
      if (!binding) throw new Error('Validated origin map lost a source edge');
      const first = binding.spans.find(s => s.kind === 'curve');
      if (!first || first.kind !== 'curve') throw new Error('Validated origin map lost its traversal');
      const forward = Math.sign(range.t1 - range.t0) === Math.sign(first.source.t1 - first.source.t0), count = source.contours[range.contour].length;
      const parts: { low: number; high: number; span: OutlineMasterSpan; order: number; t: number }[] = [];
      binding.spans.forEach((span, order) => {
        if (span.kind === 'collapsed') {
          const point = span.source.t === 1 ? { segment: (span.source.segment + 1) % count, t: 0 } : span.source;
          const t = point.segment === range.segment ? point.t
            : point.segment === (range.segment + 1) % count && point.t === 0 ? 1 : null;
          if (t === null) return;
          const local = (t - range.t0) / (range.t1 - range.t0);
          if (local >= -1e-12 && local < 1 - 1e-12) parts.push({ low: Math.max(0, local), high: Math.max(0, local), span, order, t });
          return;
        }
        if (span.source.segment !== range.segment) return;
        const a = (span.source.t0 - range.t0) / (range.t1 - range.t0), b = (span.source.t1 - range.t0) / (range.t1 - range.t0);
        const low = Math.max(0, Math.min(a, b)), high = Math.min(1, Math.max(a, b));
        if (high > low + 1e-14) parts.push({ low, high, span, order, t: range.t0 + (range.t1 - range.t0) * low });
      });
      const cyclicOrder = (part: typeof parts[number]) => {
        const following = parts.find(p => p.span.kind === 'curve' && Math.abs(p.low - part.low) < 1e-12);
        const origin = following?.order ?? 0, count = binding.spans.length;
        return ((forward ? part.order - origin : origin - part.order) + count) % count;
      };
      parts.sort((a, b) => a.low - b.low || Number(a.span.kind !== 'collapsed') - Number(b.span.kind !== 'collapsed') || cyclicOrder(a) - cyclicOrder(b));
      for (const part of parts) {
        const q = subCubic(original, part.low, part.high), start: Node = part.low === 0 ? node : { ...q[0], s: 1 };
        const t = part.span.kind === 'collapsed' ? forward ? part.span.target.t0 : part.span.target.t1
          : mappedParameter(part.span, part.t, source, target, binding);
        if (part.span.kind === 'curve' && part.span.parameter === 'line-distance' && straightCoordinates(q)) {
          const end = mappedParameter(part.span, range.t0 + (range.t1 - range.t0) * part.high, source, target, binding);
          const reference = correspondenceCurve(target, binding.target, { segment: part.span.target.segment, t0: t, t1: end });
          const fractions = straightCoordinates(reference);
          if (!fractions) throw new Error('Validated straight correspondence became curved');
          for (const i of [1, 2]) q[i] = { x: q[0].x + (q[3].x - q[0].x) * fractions[i], y: q[0].y + (q[3].y - q[0].y) * fractions[i] };
        }
        edges.push({ node: { ...start, authored: targetOrigin(map, ch, binding, part.span, t) }, curve: [q[0], q[1], q[2], q[3]], explicit: true });
      }
    });
    return edges.map((edge, i) => {
      const previous = edges[(i + edges.length - 1) % edges.length], { ix: _ix, iy: _iy, ox: _ox, oy: _oy, ...node } = edge.node;
      return { ...node, x: edge.curve[0].x, y: edge.curve[0].y,
        ...(edge.explicit || edge.node.ox !== undefined ? { ox: edge.curve[1].x, oy: edge.curve[1].y } : {}),
        ...(previous.explicit || edge.node.ix !== undefined ? { ix: previous.curve[2].x, iy: previous.curve[2].y } : {}) };
    });
  });
  return { drawing: { ...edited, contours }, reference: target, advanceResidual: source.adv - target.adv };
}
