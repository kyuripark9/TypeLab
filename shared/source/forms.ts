/* Alternate letter forms: complete drawings of one letter, each with its own weight and width masters, drawn in place
   of the original where a design picks one. A form never interpolates with the original letter or with another form,
   and its points carry its own identity, so a letter's Points edits on one form never reach another. */
import { unpackNode, type PackedNode } from '../engine/free';
import type { Drawn } from '../engine/outline';
import { parsePackedNode } from './data';
import type { MasterProvenance, WeightMasters } from './masters';
import { parseSourceRef, type MasterSourceRef } from './model';
import type { WidthMasterRef } from './program';
import type { WidthMasters } from './width-masters';

export interface GlyphFormRef { readonly kind: 'glyph-form-masters-v1'; readonly digest: string; readonly fontId: string }
/** A form a program offers for a letter, under the name the editor shows it by. */
export interface SourceFormChoice { glyph: string; id: string; label: string; ref: GlyphFormRef }
export interface GlyphFormData {
  format: 'glyph-form-masters-v1'; base: MasterSourceRef; width: WidthMasterRef; glyph: string;
  /** every width column of the program, the neutral one too, each with every weight knot */
  columns: { width: number; masters: { weight: number; drawing: [number, PackedNode[][]] }[] }[];
  provenance: MasterProvenance[]; notes: string[];
}
export interface GlyphForm {
  data: GlyphFormData; ref?: GlyphFormRef;
  columns: { width: number; masters: { weight: number; drawing: Drawn }[] }[];
}

function object(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key))) throw new TypeError('Invalid letter form object');
  return Object.fromEntries(Object.entries(input));
}
function array(input: unknown): unknown[] {
  if (!Array.isArray(input)) throw new TypeError('Expected a letter form array');
  return input;
}
function finite(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) throw new TypeError('Invalid letter form coordinate');
  return input;
}
function text(input: unknown): string {
  if (typeof input !== 'string') throw new TypeError('Invalid letter form text');
  return input;
}

export function parseGlyphFormRef(input: unknown, fontId?: string): GlyphFormRef {
  const value = object(input, ['kind', 'digest', 'fontId']), digest = text(value.digest), id = text(value.fontId);
  if (value.kind !== 'glyph-form-masters-v1' || !/^[a-f0-9]{64}$/.test(digest) || fontId !== undefined && id !== fontId) throw new TypeError('Invalid letter form reference');
  return { kind: 'glyph-form-masters-v1', digest, fontId: id };
}

export function parseSourceFormChoices(input: unknown, fontId: string): SourceFormChoice[] {
  if (!array(input).length) throw new TypeError('A source program\'s letter form list must be nonempty');
  const choices = array(input).map(entry => {
    const value = object(entry, ['glyph', 'id', 'label', 'ref']), glyph = text(value.glyph), id = text(value.id), label = text(value.label);
    if ([...glyph].length !== 1 || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(id) || id === 'original' || !label.trim() || label.length > 40) throw new TypeError('Invalid letter form choice');
    return { glyph, id, label, ref: parseGlyphFormRef(value.ref, fontId) };
  });
  const keys = choices.map(choice => `${choice.glyph}:${choice.id}`), digests = choices.map(choice => choice.ref.digest);
  if (choices.length > 64 || new Set(keys).size !== keys.length || new Set(digests).size !== digests.length) throw new TypeError('Letter form choices must be distinct');
  return choices;
}

/** The form's whole grid must be the program's: every width column and weight knot, each drawing compatible. */
export function parseGlyphForm(input: unknown, base: { ref: MasterSourceRef; masters: WeightMasters }, width: { ref: WidthMasterRef; masters: WidthMasters }): GlyphFormData {
  const value = object(input, ['format', 'base', 'width', 'glyph', 'columns', 'provenance', 'notes']);
  const baseRef = parseSourceRef(value.base), widthRef = object(value.width, ['kind', 'digest', 'fontId']), glyph = text(value.glyph);
  if (value.format !== 'glyph-form-masters-v1' || baseRef?.kind !== 'masters-v1' || baseRef.digest !== base.ref.digest || baseRef.fontId !== base.ref.fontId
    || widthRef.kind !== 'width-masters-v1' || widthRef.digest !== width.ref.digest || widthRef.fontId !== width.ref.fontId
    || width.masters.data.base.digest !== base.ref.digest || [...glyph].length !== 1) throw new TypeError('A letter form requires its exact weight and width bases');
  const weights = base.masters.masters.map(m => m.weight), widths = width.masters.columns.map(c => c.width);
  let shape: string | undefined;
  const columns = array(value.columns).map((input, ci) => {
    const column = object(input, ['width', 'masters']), at = finite(column.width);
    const masters = array(column.masters).map((input, wi) => {
      const sample = object(input, ['weight', 'drawing']), weight = finite(sample.weight), drawing = array(sample.drawing);
      if (weight !== weights[wi] || drawing.length !== 2) throw new TypeError('A letter form must cover every weight knot in order');
      const advance = finite(drawing[0]);
      let total = 0;
      const contours = array(drawing[1]).map(input => {
        const contour = array(input); total += contour.length;
        if (contour.length < 2 || total > 4000) throw new TypeError('Invalid letter form contour');
        return contour.map(node => parsePackedNode(node));
      });
      if (!contours.length || contours.length > 64 || advance < 0 || advance > 4000) throw new TypeError('Invalid letter form drawing');
      const kind = JSON.stringify(contours.map(c => c.map(n => [n.length > 2 && n[2] !== null, n.length === 6])));
      if ((shape ??= kind) !== kind) throw new TypeError('A letter form\'s drawings must be point for point compatible');
      return { weight, drawing: [advance, contours] as [number, PackedNode[][]] };
    });
    if (at !== widths[ci] || masters.length !== weights.length) throw new TypeError('A letter form must cover every width column in order');
    return { width: at, masters };
  });
  if (columns.length !== widths.length) throw new TypeError('A letter form must cover every width column');
  const provenance = array(value.provenance).map(input => {
    const p = object(input, ['family', 'url', 'revision', 'sha256']), sha256 = text(p.sha256);
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new TypeError('Invalid letter form provenance');
    return { family: text(p.family), url: text(p.url), revision: text(p.revision), sha256 };
  });
  return { format: 'glyph-form-masters-v1', base: baseRef, width: { kind: 'width-masters-v1', digest: width.ref.digest, fontId: width.ref.fontId },
    glyph, columns, provenance, notes: array(value.notes).map(text) };
}

export function decodeGlyphForm(data: GlyphFormData, ref?: GlyphFormRef): GlyphForm {
  return { data, ...(ref ? { ref } : {}), columns: data.columns.map(column => ({ width: column.width, masters: column.masters.map(master => ({
    weight: master.weight, drawing: { adv: master.drawing[0], contours: master.drawing[1].map(c => c.map(unpackNode)) } })) })) };
}

function mix(a: Drawn, b: Drawn, t: number): Drawn {
  if (t === 0) return a;
  if (t === 1) return b;
  return { adv: a.adv + (b.adv - a.adv) * t, contours: a.contours.map((contour, ci) => contour.map((point, ni) => {
    const next = b.contours[ci][ni], out = { ...point };
    for (const key of ['x', 'y', 'ix', 'iy', 'ox', 'oy'] as const) if (point[key] !== undefined && next[key] !== undefined) out[key] = point[key] + (next[key] - point[key]) * t;
    return out;
  })) };
}
const drawings = new WeakMap<GlyphForm, Map<string, Drawn>>();
/** The form at a weight and width inside the program's grid: mixed between its knots, never past them. */
export function glyphFormDrawing(form: GlyphForm, weight: number, width: number): Drawn {
  let cache = drawings.get(form);
  if (!cache) { cache = new Map(); drawings.set(form, cache); }
  const key = `${weight}:${width}`, kept = cache.get(key);
  if (kept) return kept;
  const bracket = <T>(samples: readonly T[], at: number, coordinate: (sample: T) => number): [T, T, number] => {
    const first = samples[0], last = samples[samples.length - 1];
    if (at <= coordinate(first)) return [first, first, 0];
    if (at >= coordinate(last)) return [last, last, 0];
    const index = samples.findIndex(sample => coordinate(sample) > at), a = samples[index - 1], b = samples[index];
    return [a, b, (at - coordinate(a)) / (coordinate(b) - coordinate(a))];
  };
  const [a, b, t] = bracket(form.columns, width, column => column.width);
  const row = (column: GlyphForm['columns'][number]) => {
    const [p, q, s] = bracket(column.masters, weight, master => master.weight);
    return mix(p.drawing, q.drawing, s);
  };
  const drawing = mix(row(a), row(b), t);
  if (cache.size >= 16) cache.delete(cache.keys().next().value!);
  cache.set(key, drawing);
  return drawing;
}

/** Saved Points of a letter's forms not in use are kept under the form they were drawn on (its digest, or `original`). */
export const formEditKey = (glyph: string, form: GlyphFormRef | null | undefined) => `${form?.digest ?? 'original'}:${glyph}`;
export function parseFormEditKey(key: string): { glyph: string; digest: string | null } | null {
  const at = key.indexOf(':'), digest = key.slice(0, at), glyph = key.slice(at + 1);
  if (at < 0 || [...glyph].length !== 1 || digest !== 'original' && !/^[a-f0-9]{64}$/.test(digest)) return null;
  return { glyph, digest: digest === 'original' ? null : digest };
}
