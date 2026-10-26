/* Source finishes retain the exact foreground curves and produce separate final ink. */
import type { Params } from '../params';
import type { Glyph } from '../engine/font';
import { combine, shape } from '../engine/boolean';
import { cmdsBox, cmdsToD, inPoly, roundContour, signedArea } from '../engine/geom';
import type { Cmd, Pt } from '../engine/types';

export interface SourceFinishPolicy {
  format: 'source-finish-v1';
  tolerance: number;
  shadow: { depth: readonly [number, number]; gap: number; minAreaRatio: number };
}
export type SourceFinishPlan = { kind: 'solid' } | {
  kind: 'shadow'; dx: number; dy: number; gap: number; tolerance: number; minArea: number;
};
const FILLS: readonly Params['fill'][] = ['solid', 'shadow'];
const CONTROLS: readonly (keyof Params)[] = ['fill', 'module'];
export const sourceFinishFills = (_policy: SourceFinishPolicy): readonly Params['fill'][] => FILLS;
export const sourceFinishControls = (_policy: SourceFinishPolicy): readonly (keyof Params)[] => CONTROLS;
export function sourceFinishExtends(previous: SourceFinishPolicy, next: SourceFinishPolicy): boolean {
  return previous.format === next.format && previous.tolerance === next.tolerance
    && previous.shadow.depth[0] === next.shadow.depth[0] && previous.shadow.depth[1] === next.shadow.depth[1]
    && previous.shadow.gap === next.shadow.gap && previous.shadow.minAreaRatio === next.shadow.minAreaRatio;
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
  const value = object(input, ['format', 'tolerance', 'shadow']), shadow = object(value.shadow, ['depth', 'gap', 'minAreaRatio']);
  if (value.format !== 'source-finish-v1' || !Array.isArray(shadow.depth) || shadow.depth.length !== 2) throw new TypeError('Unsupported source finishing policy');
  const tolerance = number(value.tolerance), low = number(shadow.depth[0]), high = number(shadow.depth[1]);
  const gap = number(shadow.gap), minAreaRatio = number(shadow.minAreaRatio);
  if (tolerance <= 0 || tolerance > .25 || low <= 0 || low >= high || high > .25 || gap <= 0 || gap >= low
    || minAreaRatio < 0 || minAreaRatio > 4) throw new RangeError('Source finishing dimensions exceed the supported bounds');
  return { format: 'source-finish-v1', tolerance, shadow: { depth: [low, high], gap, minAreaRatio } };
}

export function compileSourceFinish(policy: SourceFinishPolicy, request: Pick<Params, 'fill' | 'module'>, measures: { capHeight: number }): SourceFinishPlan {
  if (request.fill === 'solid') return { kind: 'solid' };
  if (request.fill !== 'shadow') throw new RangeError(`Unsupported source finish: ${request.fill}`);
  const { capHeight } = measures, size = request.module;
  if (!Number.isFinite(capHeight) || capHeight <= 0 || !Number.isFinite(size) || size < 0 || size > 1) throw new RangeError('Invalid source finishing coordinates');
  const [low, high] = policy.shadow.depth, dx = capHeight * (low + (high - low) * size), gap = capHeight * policy.shadow.gap;
  if (gap < policy.tolerance * 4) throw new RangeError('The shadow gap is too small for its curve tolerance');
  return { kind: 'shadow', dx, dy: -dx, gap, tolerance: policy.tolerance, minArea: gap * gap * policy.shadow.minAreaRatio };
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
  if (plan.kind === 'solid' || !glyph.cmds.length) return glyph;
  const editable = glyph.editable ?? glyph.drawn;
  if (!editable) throw new TypeError('A source finish requires its editable drawing');
  const ink = shape(sourceFinishPolygons(glyph.cmds, plan.tolerance)), solid = combine([ink], ink.has);
  // Sweeping a filled shape in both axes gives square clearance without inverted offset holes.
  const across = shape(swept(translated(solid, -plan.gap, -plan.gap), 2 * plan.gap, 0));
  const grown = shape(swept(combine([across], across.has), 0, 2 * plan.gap));
  const back = shape(swept(solid, plan.dx, plan.dy));
  const shadow = visibleComponents(combine([grown, back], (x, y) => back.has(x, y) && !grown.has(x, y)), plan.minArea);
  const cmds = [...glyph.cmds, ...shadow.flatMap(poly => roundContour(poly, 0))];
  const box = cmdsBox(cmds), adv = glyph.adv + plan.dx;
  return { ...glyph, cmds, d: cmdsToD(cmds), editable, fx: true, adv,
    ...(box ? { bodyW: box.x1 - box.x0, lsb: box.x0, rsb: adv - box.x1 } : {}) };
}
