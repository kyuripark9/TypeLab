/* Exact correspondence between two immutable point bases, including whole-contour reversal. */
import { subCubic } from '../engine/geom';
import { segment, type Node } from '../engine/outline';
import type { WeightMasters } from './masters';
import { parseSourceRef, type MasterSourceRef } from './model';

export interface SubdivisionSegment { segment: number; t0: number; t1: number }
export interface MasterSubdivisionData {
  format: 'master-subdivision-v1';
  from: MasterSourceRef;
  to: MasterSourceRef;
  glyphs: Record<string, SubdivisionSegment[][]>;
}
export interface MasterSubdivision { data: MasterSubdivisionData }
interface Basis { ref: MasterSourceRef; masters: WeightMasters }

const PARAMETER_TOLERANCE = 1e-12, CURVE_TOLERANCE = 1e-7;
function object(input: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid master subdivision object');
  const value = Object.fromEntries(Object.entries(input));
  if (keys && Object.keys(value).some(key => !keys.includes(key))) throw new TypeError('Unknown master subdivision field');
  return value;
}
function array(input: unknown): unknown[] {
  if (!Array.isArray(input)) throw new TypeError('Invalid master subdivision array');
  return input;
}
function coordinate(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0 || input > 1) throw new RangeError('Invalid subdivision parameter');
  return input;
}
function interval(input: unknown): SubdivisionSegment {
  const value = object(input, ['segment', 't0', 't1']), index = value.segment;
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) throw new RangeError('Invalid subdivision segment');
  const t0 = coordinate(value.t0), t1 = coordinate(value.t1);
  if (t0 === t1) throw new RangeError('A subdivision interval must have nonzero extent');
  return { segment: index, t0, t1 };
}

/** Parse the pinned map before either basis has been loaded. Geometry is checked by decodeMasterSubdivision. */
export function parseMasterSubdivision(input: unknown): MasterSubdivisionData {
  const value = object(input, ['format', 'from', 'to', 'glyphs']);
  const from = parseSourceRef(value.from), to = parseSourceRef(value.to);
  if (value.format !== 'master-subdivision-v1' || from?.kind !== 'masters-v1' || to?.kind !== 'masters-v1'
    || from.fontId !== to.fontId || from.digest === to.digest) throw new TypeError('Invalid master subdivision bases');
  const glyphs: MasterSubdivisionData['glyphs'] = {};
  for (const [ch, contours] of Object.entries(object(value.glyphs))) {
    if ([...ch].length !== 1) throw new TypeError('Subdivision glyph must be one Unicode character');
    glyphs[ch] = array(contours).map(input => {
      const ranges = array(input);
      if (!ranges.length) throw new TypeError('Empty subdivision contour');
      return ranges.map(interval);
    });
  }
  return { format: 'master-subdivision-v1', from, to, glyphs };
}

function sameReference(a: MasterSourceRef, b: MasterSourceRef): boolean {
  return a.digest === b.digest && a.fontId === b.fontId;
}
function curve(contour: Node[], index: number) {
  const a = contour[index], b = contour[(index + 1) % contour.length];
  return segment(a, b) ?? [a, { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
    { x: a.x + 2 * (b.x - a.x) / 3, y: a.y + 2 * (b.y - a.y) / 3 }, b];
}
const sameKeys = (a: object, b: object) => Object.keys(a).sort().join('\0') === Object.keys(b).sort().join('\0');
function coverage(ranges: SubdivisionSegment[], count: number): void {
  const covered: SubdivisionSegment[][] = Array.from({ length: count }, () => []);
  const direction = Math.sign(ranges[0].t1 - ranges[0].t0);
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i], next = ranges[(i + 1) % ranges.length];
    if (range.segment >= count) throw new RangeError('Subdivision refers to a missing source segment');
    if (Math.sign(range.t1 - range.t0) !== direction) throw new TypeError('Subdivision contour has mixed orientations');
    const distance = Math.abs(range.segment + range.t1 - next.segment - next.t0);
    if (distance > PARAMETER_TOLERANCE && Math.abs(distance - count) > PARAMETER_TOLERANCE) {
      throw new TypeError('Subdivision contour is not a contiguous cyclic traversal');
    }
    covered[range.segment].push(range);
  }
  for (const intervals of covered) {
    const sorted = intervals.map(r => ({ low: Math.min(r.t0, r.t1), high: Math.max(r.t0, r.t1) })).sort((a, b) => a.low - b.low);
    let end = 0;
    for (const range of sorted) {
      if (Math.abs(range.low - end) > PARAMETER_TOLERANCE) throw new TypeError('Subdivision has a source-parameter gap or overlap');
      end = range.high;
    }
    if (Math.abs(end - 1) > PARAMETER_TOLERANCE) throw new TypeError('Subdivision does not cover every source segment');
  }
}

/** A basis revision changes representation and winding, never its curves, metrics, or weight coordinates. */
export function decodeMasterSubdivision(data: MasterSubdivisionData, bases: { from: Basis; to: Basis }): MasterSubdivision {
  const { from, to } = bases, before = from.masters, after = to.masters;
  if (!sameReference(data.from, from.ref) || !sameReference(data.to, to.ref)
    || before.source.fontId !== from.ref.fontId || after.source.fontId !== to.ref.fontId
    || before.source.digest !== after.source.digest || before.source.fontId !== after.source.fontId
    || before.defaultWeight !== after.defaultWeight || before.masters.length !== after.masters.length
    || before.masters.some((master, i) => master.weight !== after.masters[i].weight)) {
    throw new TypeError('Subdivision bases must match their exact source and weight coordinates');
  }
  const oldGlyphs = before.masters[0].font.glyphs, newGlyphs = after.masters[0].font.glyphs;
  if (!sameKeys(data.glyphs, oldGlyphs) || !sameKeys(data.glyphs, newGlyphs)) throw new TypeError('Subdivision must cover every glyph in both bases');
  for (const [ch, contours] of Object.entries(data.glyphs)) {
    if (contours.length !== oldGlyphs[ch].contours.length || contours.length !== newGlyphs[ch].contours.length) {
      throw new TypeError('Subdivision must retain the complete contour set');
    }
    for (let ci = 0; ci < contours.length; ci++) {
      if (contours[ci].length !== newGlyphs[ch].contours[ci].length) throw new TypeError('Subdivision must name every target edge');
      coverage(contours[ci], oldGlyphs[ch].contours[ci].length);
    }
  }
  for (let wi = 0; wi < before.masters.length; wi++) {
    const a = before.masters[wi].font, b = after.masters[wi].font;
    if (a.cap !== b.cap || a.xh !== b.xh || a.space !== b.space) throw new TypeError('Subdivision changed font metrics');
    for (const [ch, contours] of Object.entries(data.glyphs)) {
      const old = a.glyphs[ch], next = b.glyphs[ch];
      if (old.adv !== next.adv) throw new TypeError('Subdivision changed a glyph advance');
      for (let ci = 0; ci < contours.length; ci++) for (let si = 0; si < contours[ci].length; si++) {
        const range = contours[ci][si], source = curve(old.contours[ci], range.segment);
        const part = subCubic(source, Math.min(range.t0, range.t1), Math.max(range.t0, range.t1));
        if (range.t1 < range.t0) part.reverse();
        const target = curve(next.contours[ci], si);
        if (part.some((p, i) => Math.hypot(p.x - target[i].x, p.y - target[i].y) > CURVE_TOLERANCE)) {
          throw new TypeError(`Subdivision does not preserve exact curve controls: ${ch} weight ${before.masters[wi].weight} contour ${ci} edge ${si}`);
        }
      }
    }
  }
  return { data };
}
