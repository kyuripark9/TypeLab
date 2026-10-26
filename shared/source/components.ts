/* Explicit component identities let a control reshape saved Points without moving the letter's body. */
import { applyM, cubicAt } from '../engine/geom';
import { segment, type Drawn, type Node } from '../engine/outline';
import type { Mat, Pt } from '../engine/types';
import type { WeightMasters } from './masters';
import { parseSourceRef, type MasterSourceRef } from './model';
import type { WidthMasterRef } from './program';
import type { WidthMasters } from './width-masters';

export interface ComponentBinding {
  glyph: string;
  id: string;
  contours: [number, ...number[]];
  size: { min: number; max: number; anchor: 'ink-bottom-center' };
}
export interface SourceComponentData {
  format: 'source-components-v1';
  base: MasterSourceRef;
  width: WidthMasterRef | null;
  stage: 'after-proportions-before-pose-v1';
  glyphs: [ComponentBinding, ...ComponentBinding[]];
  notes: string[];
}
export interface SourceComponents { readonly data: SourceComponentData }
export type ComponentMembership = { component: string } | 'body' | 'unbound';
export interface ComponentOwnership {
  readonly base: MasterSourceRef;
  readonly glyph: string;
  readonly bindings: readonly ComponentBinding[];
}
interface ComponentTransform {
  readonly binding: ComponentBinding;
  readonly scale: number;
  readonly anchor: Pt;
  readonly rise: number;
  readonly forward: Mat;
  readonly inverse: Mat;
}
export interface ComponentPlan extends ComponentOwnership { readonly transforms: readonly ComponentTransform[]; readonly rise: number }

function object(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source component object');
  const value = Object.fromEntries(Object.entries(input));
  if (Object.keys(value).some(key => !fields.includes(key))) throw new TypeError('Unknown source component field');
  return value;
}
function array(input: unknown): unknown[] {
  if (!Array.isArray(input)) throw new TypeError('Expected source component array');
  return input;
}
function finite(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) throw new TypeError('Invalid source component coordinate');
  return input;
}
function binding(input: unknown): ComponentBinding {
  const value = object(input, ['glyph', 'id', 'contours', 'size']), size = object(value.size, ['min', 'max', 'anchor']);
  const min = finite(size.min), max = finite(size.max);
  if (typeof value.glyph !== 'string' || [...value.glyph].length !== 1 || typeof value.id !== 'string'
    || !/^[a-z][a-z0-9-]{0,47}$/.test(value.id) || size.anchor !== 'ink-bottom-center'
    || min < .25 || min >= 1 || max <= 1 || max > 2) throw new TypeError('Invalid component Size domain');
  const contours = array(value.contours).map(finite), [first, ...rest] = contours;
  if (first === undefined || contours.length > 20 || new Set(contours).size !== contours.length
    || contours.some(c => !Number.isInteger(c) || c < 0 || c >= 200)) throw new TypeError('Invalid tittle contour identity');
  return { glyph: value.glyph, id: value.id, contours: [first, ...rest], size: { min, max, anchor: 'ink-bottom-center' } };
}

export function parseSourceComponents(input: unknown): SourceComponentData {
  const value = object(input, ['format', 'base', 'width', 'stage', 'glyphs', 'notes']), base = parseSourceRef(value.base);
  if (value.format !== 'source-components-v1' || base?.kind !== 'masters-v1' || value.stage !== 'after-proportions-before-pose-v1') {
    throw new TypeError('Invalid source component format or basis');
  }
  let width: WidthMasterRef | null = null;
  if (value.width !== null) {
    const ref = object(value.width, ['kind', 'digest', 'fontId']);
    if (ref.kind !== 'width-masters-v1' || ref.fontId !== base.fontId || typeof ref.digest !== 'string'
      || !/^[a-f0-9]{64}$/.test(ref.digest)) throw new TypeError('Invalid source component width dependency');
    width = { kind: 'width-masters-v1', digest: ref.digest, fontId: base.fontId };
  }
  const glyphs = array(value.glyphs).map(binding), [first, ...rest] = glyphs;
  if (!first || glyphs.length > 256) throw new TypeError('Source components require explicit glyph coverage');
  const identities = new Set<string>(), contours = new Set<string>();
  for (const entry of glyphs) {
    const id = `${entry.glyph}:${entry.id}`;
    if (identities.has(id)) throw new TypeError('Duplicate source component identity');
    identities.add(id);
    for (const contour of entry.contours) {
      const key = `${entry.glyph}:${contour}`;
      if (contours.has(key)) throw new TypeError('Source components cannot share contours');
      contours.add(key);
    }
  }
  const notes = array(value.notes).map(note => {
    if (typeof note !== 'string') throw new TypeError('Invalid source component note');
    return note;
  });
  return { format: 'source-components-v1', base, width, stage: 'after-proportions-before-pose-v1', glyphs: [first, ...rest], notes };
}

/** Binding validation covers every stored weight/width knot; optical range review belongs to authoring. */
export function decodeSourceComponents(data: SourceComponentData, basis: { ref: MasterSourceRef; masters: WeightMasters },
  width?: { ref: WidthMasterRef; masters: WidthMasters }): SourceComponents {
  if (data.base.kind !== basis.ref.kind || data.base.digest !== basis.ref.digest || data.base.fontId !== basis.ref.fontId
    || basis.masters.source.fontId !== basis.ref.fontId) throw new TypeError('Source components name a different master basis');
  if (data.width ? !width || data.width.digest !== width.ref.digest || data.width.fontId !== width.ref.fontId
    || width.masters.data.base.digest !== data.base.digest || width.masters.data.base.fontId !== data.base.fontId : !!width) {
    throw new TypeError('Source components require their exact width dependency');
  }
  const masters = [...basis.masters.masters, ...(width?.masters.columns.flatMap(c => c.program.masters) ?? [])];
  for (const master of masters) for (const entry of data.glyphs) {
    const glyph = master.font.glyphs[entry.glyph];
    if (!glyph || entry.contours.some(ci => !glyph.contours[ci] || glyph.contours[ci].length < 3)) throw new TypeError('Source component identity is absent from its master');
    const bounds = componentInkBounds(entry.contours.map(ci => glyph.contours[ci]));
    if (!(bounds.x1 > bounds.x0 && bounds.y1 > bounds.y0)) throw new TypeError('Source tittle has no ink extent');
  }
  return { data };
}

function turns(a: number, b: number, c: number, d: number): number[] {
  const A = -a + 3 * b - 3 * c + d, B = 2 * (a - 2 * b + c), C = b - a;
  if (Math.abs(A) < 1e-12) return Math.abs(B) < 1e-12 ? [] : [-C / B];
  const discriminant = B * B - 4 * A * C;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-B - root) / (2 * A), (-B + root) / (2 * A)];
}

/** True cubic bounds keep component anchors unchanged by exact Pen subdivisions. */
export function componentInkBounds(contours: readonly (readonly Node[])[]) {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (p: Pt) => {
    box.x0 = Math.min(box.x0, p.x); box.y0 = Math.min(box.y0, p.y);
    box.x1 = Math.max(box.x1, p.x); box.y1 = Math.max(box.y1, p.y);
  };
  for (const contour of contours) for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length]; add(a);
    const curve = segment(a, b);
    if (!curve) continue;
    const [p, q, r, s] = curve;
    for (const t of [...turns(p.x, q.x, r.x, s.x), ...turns(p.y, q.y, r.y, s.y)]) if (t > 0 && t < 1) add(cubicAt(curve, t));
  }
  return box;
}

/** Run before nearest-source provenance inference; new or merged user contours stay unbound. */
export function componentMembership(drawing: Drawn, plan: ComponentOwnership): ComponentMembership[] {
  return drawing.contours.map(contour => {
    if (!contour.length || contour.some(n => !n.authored || n.authored.digest !== plan.base.digest || n.authored.glyph !== plan.glyph)) return 'unbound';
    const binding = plan.bindings.find(binding => contour.every(n => !!n.authored && binding.contours.includes(n.authored.contour)));
    if (binding) return { component: binding.id };
    return contour.every(n => {
      const id = n.authored;
      return !!id && plan.bindings.every(binding => !binding.contours.includes(id.contour));
    }) ? 'body' : 'unbound';
  });
}

export function componentOwnership(components: SourceComponents | null | undefined, glyph: string): ComponentOwnership | null {
  const bindings = components?.data.glyphs.filter(entry => entry.glyph === glyph);
  return components && bindings?.length ? { base: components.data.base, glyph, bindings } : null;
}

export function componentPlan(components: SourceComponents | null | undefined, glyph: string, referenceAfterProportions: Drawn,
  value: number, neutral: number): ComponentPlan | null {
  const ownership = componentOwnership(components, glyph);
  if (!ownership || value === neutral) return null;
  const transforms = ownership.bindings.map(binding => {
    const { min, max } = binding.size, scale = value < neutral
      ? 1 + (min - 1) * (neutral - value) / neutral : 1 + (max - 1) * (value - neutral) / (1 - neutral);
    const box = componentInkBounds(binding.contours.map(ci => referenceAfterProportions.contours[ci]));
    const anchor = { x: (box.x0 + box.x1) / 2, y: box.y0 };
    const matrix = (s: number): Mat => [s, 0, 0, s, anchor.x * (1 - s), anchor.y * (1 - s)];
    return { binding, scale, anchor, rise: Math.max(0, (scale - 1) * (box.y1 - box.y0)), forward: matrix(scale), inverse: matrix(1 / scale) };
  });
  return { ...ownership, transforms, rise: Math.max(...transforms.map(transform => transform.rise)) };
}

export function mapComponents(drawing: Drawn, plan: ComponentPlan | null, direction: 'forward' | 'inverse',
  membership?: readonly ComponentMembership[]): Drawn {
  if (!plan) return drawing;
  const owners = membership ?? componentMembership(drawing, plan);
  return { ...drawing, contours: drawing.contours.map((contour, ci) => {
    const owner = owners[ci], transform = typeof owner === 'object' ? plan.transforms.find(part => part.binding.id === owner.component) : undefined;
    if (!transform) return contour;
    const matrix = transform[direction], radiusScale = direction === 'forward' ? transform.scale : 1 / transform.scale;
    return contour.map(node => {
    const [x, y] = applyM(matrix, node.x, node.y), out = { ...node, x, y };
    if (node.ix !== undefined && node.iy !== undefined) [out.ix, out.iy] = applyM(matrix, node.ix, node.iy);
    if (node.ox !== undefined && node.oy !== undefined) [out.ox, out.oy] = applyM(matrix, node.ox, node.oy);
    if (node.r !== undefined) out.r = node.r * radiusScale;
    return out;
    });
  }) };
}
