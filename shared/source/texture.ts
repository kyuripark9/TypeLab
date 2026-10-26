/* Continuous, seeded shears move the whole ink together; only the finished drawing is approximated. */
import { cubicAt, subCubic } from '../engine/geom';
import type { Cmd, Pt } from '../engine/types';
import type { Params } from '../params';
import { SourceEffectError } from './effect-error';

interface TextureBand { amplitude: number; wavelength: number }
export interface SourceTexturePolicy {
  format: 'source-texture-v1';
  wobble: TextureBand;
  rough: TextureBand;
  tolerance: number;
  maxSegments: number;
  seed: number;
}
interface Shear { axis: 'x' | 'y'; amplitude: number; frequency: number; phase: number }
export interface SourceTexturePlan {
  bands: (TextureBand & { kind: 'wobble' | 'rough' })[];
  tolerance: number;
  maxSegments: number;
  seed: number;
  reach: number;
}
function object(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !keys.includes(key))) throw new TypeError('Invalid source texture policy');
  return Object.fromEntries(Object.entries(input));
}
function finite(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) throw new TypeError('Expected a finite texture dimension');
  return input;
}
export function parseSourceTexture(input: unknown): SourceTexturePolicy {
  const value = object(input, ['format', 'wobble', 'rough', 'tolerance', 'maxSegments', 'seed']);
  const band = (input: unknown): TextureBand => {
    const b = object(input, ['amplitude', 'wavelength']), amplitude = finite(b.amplitude), wavelength = finite(b.wavelength);
    if (amplitude <= 0 || amplitude > .025 || wavelength < .01 || wavelength > 1
      || amplitude * 2 * Math.PI / wavelength > .4) throw new RangeError('Texture displacement exceeds its supported slope');
    return { amplitude, wavelength };
  };
  const tolerance = finite(value.tolerance), maxSegments = finite(value.maxSegments), seed = finite(value.seed);
  if (value.format !== 'source-texture-v1' || tolerance < .001 || tolerance > .02
    || !Number.isInteger(maxSegments) || maxSegments < 1024 || maxSegments > 65536
    || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Unsupported texture policy');
  return { format: 'source-texture-v1', wobble: band(value.wobble), rough: band(value.rough), tolerance, maxSegments, seed };
}
export function sourceTextureExtends(previous: SourceTexturePolicy, next: SourceTexturePolicy): boolean {
  return previous.format === next.format && previous.tolerance === next.tolerance && previous.seed === next.seed
    && previous.maxSegments === next.maxSegments && (['wobble', 'rough'] as const).every(key =>
      previous[key].amplitude === next[key].amplitude && previous[key].wavelength === next[key].wavelength);
}
export function compileSourceTexture(policy: SourceTexturePolicy, request: Pick<Params, 'wobble' | 'rough'>, cap: number): SourceTexturePlan | undefined {
  if (![request.wobble, request.rough].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
    || !Number.isFinite(cap) || cap <= 0) throw new RangeError('Invalid texture coordinates');
  const bands = (['wobble', 'rough'] as const).flatMap(key => request[key] === 0 ? [] : [{
    kind: key, amplitude: policy[key].amplitude * request[key] * cap, wavelength: policy[key].wavelength * cap
  }]);
  return bands.length ? { bands, tolerance: policy.tolerance, maxSegments: policy.maxSegments, seed: policy.seed,
    reach: bands.reduce((sum, band) => sum + band.amplitude, 0) } : undefined;
}
function shears(plan: SourceTexturePlan, identity: string): Shear[] {
  let seed = plan.seed;
  for (const ch of identity) seed = Math.imul(seed ^ ch.codePointAt(0)!, 16777619) >>> 0;
  const phase = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000 * Math.PI * 2; };
  const identitySeed = seed;
  return plan.bands.flatMap(band => {
    seed = (identitySeed ^ (band.kind === 'wobble' ? 0x85ebca6b : 0xc2b2ae35)) >>> 0;
    return (['x', 'y'] as const).map(axis => ({ axis, amplitude: band.amplitude,
      frequency: Math.PI * 2 / band.wavelength, phase: phase() }));
  });
}
function mapped(point: Pt, tangent: Pt, fields: Shear[]): { point: Pt; tangent: Pt } {
  let { x, y } = point, dx = tangent.x, dy = tangent.y;
  for (const field of fields) {
    const t = (field.axis === 'x' ? y : x) * field.frequency + field.phase;
    const offset = field.amplitude * Math.sin(t), slope = field.amplitude * field.frequency * Math.cos(t);
    if (field.axis === 'x') { x += offset; dx += slope * dy; }
    else { y += offset; dy += slope * dx; }
  }
  return { point: { x, y }, tangent: { x: dx, y: dy } };
}
type Cubic = [Pt, Pt, Pt, Pt];
export function textureSourceInk(cmds: Cmd[], plan: SourceTexturePlan, identity: string): Cmd[] {
  const fields = shears(plan, identity), out: Cmd[] = [];
  const shortest = Math.min(...plan.bands.map(band => band.wavelength));
  let at: Pt = { x: 0, y: 0 }, start = at, segments = 0;
  const point = (p: Pt) => mapped(p, { x: 0, y: 0 }, fields).point;
  const emit = (curve: Cubic, depth = 0) => {
    if (++segments > plan.maxSegments) throw new SourceEffectError('texture', 'complexity', 'Texture exceeds its segment budget');
    const first = mapped(curve[0], { x: curve[1].x - curve[0].x, y: curve[1].y - curve[0].y }, fields);
    const last = mapped(curve[3], { x: curve[3].x - curve[2].x, y: curve[3].y - curve[2].y }, fields);
    const fit: Cubic = [first.point, { x: first.point.x + first.tangent.x, y: first.point.y + first.tangent.y },
      { x: last.point.x - last.tangent.x, y: last.point.y - last.tangent.y }, last.point];
    const length = curve.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - curve[i].x, p.y - curve[i].y), 0);
    const error = Math.max(...[.125, .25, .375, .5, .625, .75, .875].map(t => {
      const actual = point(cubicAt(curve, t)), approx = cubicAt(fit, t);
      return Math.hypot(actual.x - approx.x, actual.y - approx.y);
    }));
    if (length <= shortest / 8 && error <= plan.tolerance) {
      out.push(['C', fit[1].x, fit[1].y, fit[2].x, fit[2].y, fit[3].x, fit[3].y]); return;
    }
    if (depth >= 22) throw new SourceEffectError('texture', 'tolerance', 'Texture cannot meet its curve tolerance');
    for (const [low, high] of [[0, .5], [.5, 1]]) {
      const [a, b, c, d] = subCubic(curve, low, high); emit([a, b, c, d], depth + 1);
    }
  };
  const line = (end: Pt) => emit([at, { x: at.x + (end.x - at.x) / 3, y: at.y + (end.y - at.y) / 3 },
    { x: at.x + (end.x - at.x) * 2 / 3, y: at.y + (end.y - at.y) * 2 / 3 }, end]);
  for (const command of cmds) {
    if (command[0] === 'M') { at = start = { x: command[1], y: command[2] }; const p = point(at); out.push(['M', p.x, p.y]); }
    else if (command[0] === 'L') { const end = { x: command[1], y: command[2] }; line(end); at = end; }
    else if (command[0] === 'C') {
      const end = { x: command[5], y: command[6] };
      emit([at, { x: command[1], y: command[2] }, { x: command[3], y: command[4] }, end]); at = end;
    } else if (command[0] === 'Z') {
      if (at.x !== start.x || at.y !== start.y) line(start);
      out.push(['Z']); at = start;
    } else throw new SourceEffectError('texture', 'normalization', 'Texture requires cubic source contours');
  }
  return out;
}
