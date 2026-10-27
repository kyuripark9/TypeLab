/* Authored marks follow explicit ports on the edited base; runtime never infers letter anatomy. */
import { unpackNode, type PackedNode } from '../engine/free';
import { cubicAt } from '../engine/geom';
import { segment, type AuthoredGlyph, type Drawn, type Node } from '../engine/outline';
import type { Pt } from '../engine/types';
import { componentMembership, componentOwnership, type SourceComponents } from './components';
import { parsePackedNode } from './data';
import type { MasterProvenance, WeightMasters } from './masters';
import { parseSourceRef, type MasterSourceRef } from './model';
import type { SourceComponentRef, WidthMasterRef } from './program';
import type { WidthAxis, WidthMasters } from './width-masters';

export interface MarkPort { contour: number; segment: number; t: number; weight: number }
export interface SourceMarkRecipe {
  glyph: string; base: string; omitComponents: string[];
  mark: null | {
    attachment: 'above' | 'below' | 'attached' | 'side';
    anchor: MarkPort[];
    origin: { kind: 'upstream-composite' | 'upstream-outline' | 'local'; weight: 'native' | 'interpolated' | 'local' | 'fixed'; glyphs: string[] };
  };
}
export interface SourceMarkData {
  format: 'source-marks-v1'; base: MasterSourceRef; width: WidthMasterRef; components: SourceComponentRef;
  stage: 'after-proportions-before-pose-v1';
  axes: { weight: WidthAxis; width: WidthAxis };
  recipes: SourceMarkRecipe[];
  columns: { width: number; masters: { weight: number; glyphs: Record<string, { contours: PackedNode[][]; advanceDelta: number }> }[] }[];
  provenance: MasterProvenance[]; notes: string[];
}
export interface SourceMarks {
  data: SourceMarkData;
  components: SourceComponents;
  recipes: ReadonlyMap<string, SourceMarkRecipe>;
  columns: { width: number; masters: { weight: number; glyphs: ReadonlyMap<string, Drawn> }[] }[];
}
function object(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key))) throw new TypeError('Invalid source mark object');
  return Object.fromEntries(Object.entries(input));
}
function array(input: unknown): unknown[] {
  if (!Array.isArray(input)) throw new TypeError('Expected source mark array');
  return input;
}
function finite(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) throw new TypeError('Invalid source mark coordinate');
  return input;
}
function text(input: unknown): string {
  if (typeof input !== 'string') throw new TypeError('Invalid source mark text');
  return input;
}
function axis(input: unknown): WidthAxis {
  const a = object(input, ['min', 'neutral', 'max']), min = finite(a.min), neutral = finite(a.neutral), max = finite(a.max);
  if (min <= 0 || min >= max || max > 1000 || neutral < min || neutral > max) throw new RangeError('Invalid source mark axis');
  return { min, neutral, max };
}
function ref<K extends 'width-masters-v1' | 'source-components-v1'>(input: unknown, kind: K, fontId: string): { kind: K; fontId: string; digest: string } {
  const value = object(input, ['kind', 'fontId', 'digest']), digest = text(value.digest);
  if (value.kind !== kind || value.fontId !== fontId || !/^[a-f0-9]{64}$/.test(digest)) throw new TypeError('Invalid source mark dependency');
  return { kind, fontId, digest };
}
function recipe(input: unknown): SourceMarkRecipe {
  const value = object(input, ['glyph', 'base', 'omitComponents', 'mark']), glyph = text(value.glyph), base = text(value.base);
  if ([...glyph].length !== 1 || [...base].length !== 1 || glyph === base) throw new TypeError('Invalid source composite identity');
  const omitComponents = array(value.omitComponents).map(text);
  if (omitComponents.some(id => !/^[a-z][a-z0-9-]{0,47}$/.test(id)) || new Set(omitComponents).size !== omitComponents.length) throw new TypeError('Invalid omitted component');
  if (value.mark === null) return { glyph, base, omitComponents, mark: null };
  const mark = object(value.mark, ['attachment', 'anchor', 'origin']), origin = object(mark.origin, ['kind', 'weight', 'glyphs']);
  if (mark.attachment !== 'above' && mark.attachment !== 'below' && mark.attachment !== 'attached' && mark.attachment !== 'side'
    || origin.kind !== 'upstream-composite' && origin.kind !== 'upstream-outline' && origin.kind !== 'local'
    || origin.weight !== 'native' && origin.weight !== 'interpolated' && origin.weight !== 'local' && origin.weight !== 'fixed') throw new TypeError('Invalid source mark construction');
  const anchor = array(mark.anchor).map(input => {
    const p = object(input, ['contour', 'segment', 't', 'weight']);
    const contour = finite(p.contour), segment = finite(p.segment), t = finite(p.t), weight = finite(p.weight);
    if (!Number.isInteger(contour) || contour < 0 || contour >= 200 || !Number.isInteger(segment) || segment < 0 || segment >= 4000
      || t < 0 || t > 1 || weight <= 0 || weight > 1) throw new TypeError('Invalid source mark attachment port');
    return { contour, segment, t, weight };
  });
  if (!anchor.length || anchor.length > 32 || Math.abs(anchor.reduce((sum, port) => sum + port.weight, 0) - 1) > 1e-9) throw new TypeError('Mark anchors require convex port weights');
  return { glyph, base, omitComponents, mark: { attachment: mark.attachment, anchor,
    origin: { kind: origin.kind, weight: origin.weight, glyphs: array(origin.glyphs).map(text) } } };
}
export function parseSourceMarks(input: unknown): SourceMarkData {
  const value = object(input, ['format', 'base', 'width', 'components', 'stage', 'axes', 'recipes', 'columns', 'provenance', 'notes']);
  const base = parseSourceRef(value.base), axes = object(value.axes, ['weight', 'width']);
  if (value.format !== 'source-marks-v1' || base?.kind !== 'masters-v1' || value.stage !== 'after-proportions-before-pose-v1') throw new TypeError('Invalid source marks format');
  const recipes = array(value.recipes).map(recipe), names = recipes.filter(recipe => recipe.mark).map(recipe => recipe.glyph).sort();
  if (!recipes.length || recipes.length > 256 || new Set(recipes.map(recipe => recipe.glyph)).size !== recipes.length) throw new TypeError('Invalid source composite coverage');
  const columns = array(value.columns).map(input => {
    const column = object(input, ['width', 'masters']);
    const masters = array(column.masters).map(input => {
      const sample = object(input, ['weight', 'glyphs']), glyphs = object(sample.glyphs, names);
      if (Object.keys(glyphs).sort().join('') !== names.join('')) throw new TypeError('Mark grid coverage must match its recipes');
      return { weight: finite(sample.weight), glyphs: Object.fromEntries(Object.entries(glyphs).map(([ch, input]) => {
        const glyph = object(input, ['contours', 'advanceDelta']), advanceDelta = finite(glyph.advanceDelta);
        let total = 0;
        const contours = array(glyph.contours).map(input => {
          const contour = array(input); total += contour.length;
          if (!contour.length || total > 4000) throw new TypeError('Invalid mark contour size');
          return contour.map(node => parsePackedNode(node));
        });
        if (!contours.length || contours.length > 200 || advanceDelta < 0 || advanceDelta > 2000) throw new TypeError('Invalid authored mark drawing');
        return [ch, { contours, advanceDelta }];
      })) };
    });
    if (masters.length < 2 || masters.length > 20 || masters.some((m, i) => i > 0 && m.weight <= masters[i - 1].weight)) throw new TypeError('Mark weights must be ordered');
    return { width: finite(column.width), masters };
  });
  if (columns.length < 2 || columns.length > 20 || columns.some((c, i) => i > 0 && c.width <= columns[i - 1].width)) throw new TypeError('Mark widths must be ordered');
  const provenance = array(value.provenance).map(input => {
    const p = object(input, ['family', 'url', 'revision', 'sha256']), sha256 = text(p.sha256);
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new TypeError('Invalid source mark provenance');
    return { family: text(p.family), url: text(p.url), revision: text(p.revision), sha256 };
  });
  return { format: 'source-marks-v1', base, width: ref(value.width, 'width-masters-v1', base.fontId),
    components: ref(value.components, 'source-components-v1', base.fontId), stage: value.stage,
    axes: { weight: axis(axes.weight), width: axis(axes.width) }, recipes, columns, provenance, notes: array(value.notes).map(text) };
}
export function decodeSourceMarks(data: SourceMarkData, basis: { ref: MasterSourceRef; masters: WeightMasters },
  width: { ref: WidthMasterRef; masters: WidthMasters }, components: { ref: SourceComponentRef; components: SourceComponents }): SourceMarks {
  const weights = basis.masters.masters.map(master => master.weight), widths = width.masters.columns.map(column => column.width);
  const sameAxis = (a: WidthAxis, b: WidthAxis) => a.min === b.min && a.neutral === b.neutral && a.max === b.max;
  if (data.base.digest !== basis.ref.digest || data.base.fontId !== basis.ref.fontId || data.width.digest !== width.ref.digest
    || data.width.fontId !== width.ref.fontId || data.components.fontId !== components.ref.fontId
    || data.components.digest !== components.ref.digest || components.components.data.base.digest !== basis.ref.digest
    || components.components.data.width?.digest !== width.ref.digest || width.masters.data.base.digest !== basis.ref.digest
    || !sameAxis(data.axes.width, width.masters.data.axis)
    || !sameAxis(data.axes.weight, { min: weights[0], neutral: basis.masters.defaultWeight, max: weights[weights.length - 1] })
    || data.columns.length !== widths.length || data.columns.some((column, i) => column.width !== widths[i]
      || column.masters.length !== weights.length || column.masters.some((master, i) => master.weight !== weights[i]))) throw new TypeError('Marks require their complete exact weight/width/component bases');
  const original = basis.masters.masters[0].font;
  for (const recipe of data.recipes) {
    const base = original.glyphs[recipe.base];
    if (!base || original.glyphs[recipe.glyph] || recipe.mark?.anchor.some(port => !base.contours[port.contour]?.[port.segment])
      || recipe.omitComponents.some(id => !components.components.data.glyphs.some(binding => binding.glyph === recipe.base && binding.id === id))) throw new TypeError('Mark recipe refers to an unavailable glyph, port, or component');
  }
  const shapes = (contours: PackedNode[][]) => JSON.stringify(contours.map(contour => contour.map(node => [node.length > 2 && node[2] !== null, node.length === 6])));
  const reference = data.columns[0].masters[0].glyphs;
  for (const column of data.columns) for (const sample of column.masters) for (const [ch, glyph] of Object.entries(sample.glyphs)) {
    if (shapes(glyph.contours) !== shapes(reference[ch].contours)) throw new TypeError('Mark grid contours and handles must be compatible');
  }
  return { data, components: components.components, recipes: new Map(data.recipes.map(recipe => [recipe.glyph, recipe])),
    columns: data.columns.map(column => ({ width: column.width, masters: column.masters.map(master => ({ weight: master.weight,
      glyphs: new Map(Object.entries(master.glyphs).map(([ch, glyph]) => [ch, { adv: glyph.advanceDelta, contours: glyph.contours.map(contour => contour.map(unpackNode)) }])) })) })) };
}
function interpolate(a: Drawn, b: Drawn, t: number): Drawn {
  if (t === 0) return a;
  if (t === 1) return b;
  return { adv: a.adv + (b.adv - a.adv) * t, contours: a.contours.map((contour, ci) => contour.map((point, ni) => {
    const next = b.contours[ci][ni], out = { ...point };
    for (const key of ['x', 'y', 'ix', 'iy', 'ox', 'oy'] as const) if (point[key] !== undefined && next[key] !== undefined) out[key] = point[key] + (next[key] - point[key]) * t;
    return out;
  })) };
}
export function sourceMarkDrawing(marks: SourceMarks, glyph: string, weight: number, width: number): Drawn {
  const bracket = <T>(samples: readonly T[], at: number, coordinate: (sample: T) => number): [T, T, number] => {
    const exact = samples.find(sample => coordinate(sample) === at);
    if (exact) return [exact, exact, 0];
    const index = samples.findIndex(sample => coordinate(sample) > at);
    if (!Number.isFinite(at) || index <= 0) throw new RangeError('Mark coordinate is outside its authored grid');
    const a = samples[index - 1], b = samples[index];
    return [a, b, (at - coordinate(a)) / (coordinate(b) - coordinate(a))];
  };
  const [a, b, t] = bracket(marks.columns, width, column => column.width);
  const row = (column: SourceMarks['columns'][number]) => {
    const [a, b, t] = bracket(column.masters, weight, master => master.weight);
    const first = a.glyphs.get(glyph), last = b.glyphs.get(glyph);
    if (!first || !last) throw new TypeError('No authored mark for this character');
    return interpolate(first, last, t);
  };
  return interpolate(row(a), row(b), t);
}
function portPoint(drawing: Drawn, port: MarkPort, identity: AuthoredGlyph): Pt | null {
  const same = (node: Node) => node.authored?.digest === identity.digest && node.authored.glyph === identity.glyph && node.authored.contour === port.contour;
  for (const contour of drawing.contours) for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    if (!same(a) || !a.authored) continue;
    if (a.authored.segment === port.segment && a.authored.t === port.t) return a;
    if (!same(b) || !b.authored) continue;
    const from = a.authored, to = b.authored, count = from.segments ?? to.segments;
    let start: number, end: number;
    if (from.segment === port.segment && to.segment === port.segment) { start = from.t; end = to.t; }
    else if (from.segment === port.segment && to.t === 0 && to.segment === (count ? (from.segment + 1) % count : from.segment + 1)) { start = from.t; end = 1; }
    else if (to.segment === port.segment && from.t === 0 && from.segment === (count ? (to.segment + 1) % count : to.segment + 1)) { start = 1; end = to.t; }
    else continue;
    if (start === end || port.t < Math.min(start, end) || port.t > Math.max(start, end)) continue;
    const t = (port.t - start) / (end - start), curve = segment(a, b);
    return curve ? cubicAt(curve, t) : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  return null;
}
export function sourceMarkAnchor(recipe: SourceMarkRecipe, edited: Drawn, nominal: Drawn, identity: AuthoredGlyph): Pt {
  if (!recipe.mark) throw new TypeError('A dotless form has no mark anchor');
  return recipe.mark.anchor.reduce((sum, port) => {
    const point = portPoint(edited, port, identity) ?? portPoint(nominal, port, identity);
    if (!point) throw new TypeError('The authored mark port is missing from its source');
    return { x: sum.x + point.x * port.weight, y: sum.y + point.y * port.weight };
  }, { x: 0, y: 0 });
}
export function omitMarkComponents(drawing: Drawn, marks: SourceMarks, recipe: SourceMarkRecipe): Drawn {
  const ownership = componentOwnership(marks.components, recipe.base);
  if (!ownership || !recipe.omitComponents.length) return drawing;
  const owners = componentMembership(drawing, ownership);
  return { ...drawing, contours: drawing.contours.filter((_, i) => {
    const owner = owners[i]; return typeof owner !== 'object' || !recipe.omitComponents.includes(owner.component);
  }) };
}
