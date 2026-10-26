/* Source parameters follow generated curve cuts and saved point edits. Spatial motion is only for new points. */
import { segment, type AuthoredGlyph, type AuthoredPoint, type Drawn, type Node } from '../engine/outline';
import { mapOutline, type OutlineTransform, type Point } from './geometry';
import type { MasterSubdivisionData, SubdivisionSegment } from './subdivision';

type Cubic = [Point, Point, Point, Point];
interface Motion { x: number; y: number; dx: number; dy: number }
interface Interval { contour: number; segment: number; from: number; to: number }
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function split(c: Cubic, t: number): [Cubic, Cubic] {
  const a = mix(c[0], c[1], t), b = mix(c[1], c[2], t), d = mix(c[2], c[3], t);
  const e = mix(a, b, t), f = mix(b, d, t), p = mix(e, f, t);
  return [[c[0], a, e, p], [p, f, d, c[3]]];
}
function curve(d: Drawn, ci: number, si: number): Cubic {
  const c = d.contours[ci], a = c[si], b = c[(si + 1) % c.length];
  return segment(a, b) ?? [a, mix(a, b, 1 / 3), mix(a, b, 2 / 3), b];
}
function part(d: Drawn, range: Interval): Cubic {
  const low = Math.min(range.from, range.to), high = Math.max(range.from, range.to), original = curve(d, range.contour, range.segment);
  if (high === low) { const p = split(original, low)[0][3]; return [p, p, p, p]; }
  const head = high === 1 ? original : split(original, high)[0], piece = low === 0 ? head : split(head, low / high)[1];
  return range.from <= range.to ? piece : [piece[3], piece[2], piece[1], piece[0]];
}
function valid(point: AuthoredPoint | undefined, d: Drawn, source: AuthoredGlyph): point is AuthoredPoint {
  return !!point && point.digest === source.digest && point.glyph === source.glyph && !!d.contours[point.contour]?.[point.segment]
    && (point.segments === undefined || point.segments === d.contours[point.contour].length);
}
function interval(a: AuthoredPoint | undefined, b: AuthoredPoint | undefined, d: Drawn, source: AuthoredGlyph): Interval | null {
  if (!valid(a, d, source) || !valid(b, d, source) || a.contour !== b.contour) return null;
  if (a.segment === b.segment) return { contour: a.contour, segment: a.segment, from: a.t, to: b.t };
  const length = d.contours[a.contour].length;
  if (b.segment === (a.segment + 1) % length && b.t === 0) return { contour: a.contour, segment: a.segment, from: a.t, to: 1 };
  if (a.segment === (b.segment + 1) % length && a.t === 0) return { contour: b.contour, segment: b.segment, from: 1, to: b.t };
  return null;
}
function point(d: Drawn, origin: AuthoredPoint): Point { return split(curve(d, origin.contour, origin.segment), origin.t)[0][3]; }

export function identifyAuthored(d: Drawn, source: AuthoredGlyph): Drawn {
  return { ...d, contours: d.contours.map((c, ci) => c.map((n, ni) => ({ ...n, authored: { ...source, contour: ci, segment: ni, t: 0, segments: c.length } }))) };
}

/** Older saved outlines lack provenance. Recover unchanged points and an otherwise unchanged node order. */
export function inheritAuthored(d: Drawn, expected: Drawn): Drawn {
  const known = new Map(expected.contours.flatMap(c => c.map(n => [coordinate(n.x, n.y), n.authored] satisfies [string, AuthoredPoint | undefined])));
  return { ...d, contours: d.contours.map((c, ci) => {
    const before = expected.contours[ci];
    const sameOrder = before?.length === c.length && c.filter((n, i) => coordinate(n.x, n.y) === coordinate(before[i].x, before[i].y)).length >= Math.max(2, c.length / 2);
    return c.map((n, ni) => {
      const authored = n.authored ?? known.get(coordinate(n.x, n.y)) ?? (sameOrder ? before[ni].authored : undefined);
      return authored ? { ...n, authored } : n;
    });
  }) };
}

/** Compose the height mapper's cut parameters with the saved source parameters. */
export function mapAuthored(d: Drawn, transform: OutlineTransform, reference: Drawn, source: AuthoredGlyph): Drawn {
  const mapped = mapOutline(d.contours, transform);
  return { ...d, contours: mapped.contours.map((c, ci) => c.map((n, ni) => {
    const origin = mapped.origins[ci][ni];
    let authored: AuthoredPoint | undefined;
    if (origin.kind === 'node') {
      authored = d.contours[origin.contour][origin.node].authored;
      if (valid(authored, reference, source)) authored = { ...authored, segments: reference.contours[authored.contour].length };
    }
    else {
      const before = d.contours[origin.contour], a = before[origin.from], b = before[(origin.from + 1) % before.length];
      const range = interval(a.authored, b.authored, reference, source);
      if (range) {
        const t = range.from + (range.to - range.from) * origin.t;
        authored = t > 1 - 1e-12
          ? { ...source, contour: range.contour, segment: (range.segment + 1) % reference.contours[range.contour].length, t: 0, segments: reference.contours[range.contour].length }
          : { ...source, contour: range.contour, segment: range.segment, t: Math.max(0, t), segments: reference.contours[range.contour].length };
      }
    }
    return authored ? { ...n, authored } : n;
  })) };
}

interface RebasedEdge { node: Node; curve: Cubic; outgoing: boolean; incoming: boolean }
function assemble(edges: RebasedEdge[]): Node[] {
  return edges.map((edge, i) => {
    const previous = edges[(i + edges.length - 1) % edges.length];
    const { ix: _ix, iy: _iy, ox: _ox, oy: _oy, ...node } = edge.node;
    return { ...node, x: edge.curve[0].x, y: edge.curve[0].y,
      ...(edge.outgoing ? { ox: edge.curve[1].x, oy: edge.curve[1].y } : {}),
      ...(previous.incoming ? { ix: previous.curve[2].x, iy: previous.curve[2].y } : {}) };
  });
}

/** Express the previous instance in the new basis before applying its width or feature deltas. */
export function rebaseReference(reference: Drawn, mapping: MasterSubdivisionData, ch: string): Drawn {
  const contours = mapping.glyphs[ch].map((ranges, ci) => assemble(ranges.map(range => {
    const cubic = part(reference, { contour: ci, segment: range.segment, from: range.t0, to: range.t1 });
    return { node: cubic[0], curve: cubic, outgoing: true, incoming: true };
  })));
  return identifyAuthored({ ...reference, contours }, { digest: mapping.to.digest, glyph: ch });
}

function rebasedPoint(origin: AuthoredPoint, ranges: SubdivisionSegment[], digest: string): AuthoredPoint {
  const index = ranges.findIndex(r => r.segment === origin.segment
    && origin.t >= Math.min(r.t0, r.t1) - 1e-12 && origin.t <= Math.max(r.t0, r.t1) + 1e-12);
  if (index < 0) throw new Error('A validated basis transition is missing a saved source parameter');
  const range = ranges[index], t = Math.max(0, Math.min(1, (origin.t - range.t0) / (range.t1 - range.t0)));
  return { ...origin, digest, segments: ranges.length,
    segment: t >= 1 - 1e-12 ? (index + 1) % ranges.length : index, t: t >= 1 - 1e-12 ? 0 : t };
}

function orientation(contour: Node[], reference: Drawn, source: AuthoredGlyph): { contour: number; direction: number } | null {
  const edges = contour.map((node, i) => interval(node.authored, contour[(i + 1) % contour.length].authored, reference, source));
  if (edges.some(range => !range)) return null;
  const ranges = edges.flatMap(range => range && range.from !== range.to ? [range] : []);
  if (ranges.length < 2) return null;
  const first = ranges[0], direction = Math.sign(first.to - first.from);
  return ranges.every(r => r.contour === first.contour && Math.sign(r.to - r.from) === direction)
    ? { contour: first.contour, direction } : null;
}

/** Split saved curves exactly, including their edits, so every new master edge can move its own handles. */
export function rebaseEdits(edited: Drawn, reference: Drawn, mapping: MasterSubdivisionData, ch: string): Drawn {
  const source = { digest: mapping.from.digest, glyph: ch }, mapped = mapping.glyphs[ch];
  const directions = edited.contours.map(c => orientation(c, reference, source));
  const unaffected = directions.flatMap(d => d && mapped[d.contour][0].t1 > mapped[d.contour][0].t0 ? [d.direction] : []);
  const common = unaffected.length && unaffected.every(d => d === unaffected[0]) ? unaffected[0] : null;
  const contours = edited.contours.map((contour, ci) => {
    const edges: RebasedEdge[] = [];
    contour.forEach((node, ni) => {
      const next = contour[(ni + 1) % contour.length], range = interval(node.authored, next.authored, reference, source);
      const original = curve(edited, ci, ni);
      const cuts = range && range.from !== range.to ? mapped[range.contour]
        .filter(r => r.segment === range.segment).flatMap(r => [r.t0, r.t1])
        .map(t => (t - range.from) / (range.to - range.from)).filter(t => t > 1e-12 && t < 1 - 1e-12) : [];
      const boundaries = [0, ...[...new Set(cuts)].sort((a, b) => a - b), 1];
      for (let i = 0; i < boundaries.length - 1; i++) {
        const low = boundaries[i], high = boundaries[i + 1];
        const head = high === 1 ? original : split(original, high)[0];
        const cubic = low === 0 ? head : split(head, low / high)[1];
        let start = node;
        if (i && range) start = { ...cubic[0], s: 1, authored: { ...source, contour: range.contour, segment: range.segment,
          t: range.from + (range.to - range.from) * low, segments: reference.contours[range.contour].length } };
        edges.push({ node: start, curve: cubic,
          outgoing: !!range || node.ox !== undefined && node.oy !== undefined,
          incoming: !!range || next.ix !== undefined && next.iy !== undefined });
      }
    });
    let result = assemble(edges).map(node => valid(node.authored, reference, source)
      ? { ...node, authored: rebasedPoint(node.authored, mapped[node.authored.contour], mapping.to.digest) } : node);
    const direction = directions[ci];
    // Repair a source winding defect relative to the saved glyph's global orientation, retaining local reversals.
    if (direction && direction.direction === common && mapped[direction.contour][0].t1 < mapped[direction.contour][0].t0) {
      result = result.reverse().map(({ ix, iy, ox, oy, ...node }) => ({ ...node,
        ...(ox !== undefined && oy !== undefined ? { ix: ox, iy: oy } : {}),
        ...(ix !== undefined && iy !== undefined ? { ox: ix, oy: iy } : {}) }));
    }
    return result;
  });
  return { ...edited, contours };
}

function motions(a: Node[][], b: Node[][]): Motion[] {
  const out: Motion[] = [];
  a.forEach((contour, ci) => contour.forEach((p, ni) => {
    const q = b[ci][ni];
    out.push({ x: p.x, y: p.y, dx: q.x - p.x, dy: q.y - p.y });
    if (p.ix !== undefined && p.iy !== undefined && q.ix !== undefined && q.iy !== undefined) out.push({ x: p.ix, y: p.iy, dx: q.ix - p.ix, dy: q.iy - p.iy });
    if (p.ox !== undefined && p.oy !== undefined && q.ox !== undefined && q.oy !== undefined) out.push({ x: p.ox, y: p.oy, dx: q.ox - p.ox, dy: q.oy - p.oy });
  }));
  return out;
}
const coordinate = (x: number, y: number) => `${Math.round(x * 1e8)},${Math.round(y * 1e8)}`;
function motionAt(all: Motion[], exact: Map<string, Motion>, x: number, y: number): Point {
  const known = exact.get(coordinate(x, y));
  if (known) return { x: x + known.dx, y: y + known.dy };
  const near = all.map(p => ({ p, distance: (x - p.x) ** 2 + (y - p.y) ** 2 })).sort((a, b) => a.distance - b.distance).slice(0, 12);
  if (!near.length) return { x, y };
  if (near[0].distance < 1e-14) return { x: x + near[0].p.dx, y: y + near[0].p.dy };
  let best: { score: number; dx: number; dy: number } | null = null;
  for (let i = 0; i < near.length - 2; i++) for (let j = i + 1; j < near.length - 1; j++) for (let k = j + 1; k < near.length; k++) {
    const a = near[i].p, b = near[j].p, c = near[k].p;
    const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(det) < 1e-6) continue;
    const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / det;
    const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / det, w = 1 - u - v;
    const score = Math.max(0, -u, -v, -w) * 1e8 + near[i].distance + near[j].distance + near[k].distance;
    if (!best || score < best.score) best = { score, dx: u * a.dx + v * b.dx + w * c.dx, dy: u * a.dy + v * b.dy + w * c.dy };
  }
  return best ? { x: x + best.dx, y: y + best.dy } : { x: x + near[0].p.dx, y: y + near[0].p.dy };
}

export function transportEdits(edited: Drawn, from: Drawn, to: Drawn, source: AuthoredGlyph): Drawn {
  if (from === to) return edited;
  let field: Motion[] | undefined, exact: Map<string, Motion> | undefined;
  const fallback = (x: number, y: number): Point => {
    if (!field || !exact) { field = motions(from.contours, to.contours); exact = new Map(field.map(p => [coordinate(p.x, p.y), p])); }
    return motionAt(field, exact, x, y);
  };
  const contours = edited.contours.map(c => c.map(n => {
    const origin = n.authored;
    const delta = valid(origin, from, source) ? { a: point(from, origin), b: point(to, origin) } : null;
    const moved = delta ? { x: n.x + delta.b.x - delta.a.x, y: n.y + delta.b.y - delta.a.y } : fallback(n.x, n.y);
    return { ...n, ...moved };
  }));
  edited.contours.forEach((c, ci) => c.forEach((a, ni) => {
    const next = (ni + 1) % c.length, b = c[next], range = interval(a.authored, b.authored, from, source);
    const before = range ? part(from, range) : null, after = range ? part(to, range) : null;
    if (a.ox !== undefined && a.oy !== undefined) {
      const p = before && after ? { x: a.ox + after[1].x - before[1].x, y: a.oy + after[1].y - before[1].y } : fallback(a.ox, a.oy);
      contours[ci][ni].ox = p.x; contours[ci][ni].oy = p.y;
    }
    if (b.ix !== undefined && b.iy !== undefined) {
      const p = before && after ? { x: b.ix + after[2].x - before[2].x, y: b.iy + after[2].y - before[2].y } : fallback(b.ix, b.iy);
      contours[ci][next].ix = p.x; contours[ci][next].iy = p.y;
    }
  }));
  return { ...edited, contours };
}
