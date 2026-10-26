/* Recover original-sheet parameter spans from the recorded first-master authoring recipes. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeFreeFont, type FreeFont } from '../../shared/engine/free';
import type { Drawn, Node } from '../../shared/engine/outline';
import { parseSourceData } from '../../shared/source/data';
import { MASTER_REVISIONS, type MasterInfo } from '../../shared/source/master-catalog';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
import {
  correspondenceCurve, decodeOutlineMasterMap, parseOutlineMasterMap,
  type CurveInterval, type NeutralRelation, type OutlineMasterContour, type OutlineMasterMapData, type OutlineMasterSpan,
} from '../../shared/source/outline-master-map';

const styles = ['Mainline', 'Hearth', 'Couture', 'Sonnet', 'Vellum', 'Almanac', 'Parlance', 'Cotton', 'Gumdrop', 'Jotter', 'Compass',
  'Dispatch', 'Funnies', 'Kernel', 'Orbital', 'Turnpike', 'Ballyhoo', 'Boardwalk', 'Cathedral', 'Serenade', 'Timber', 'Bulwark'];
const rounded = new Set(['Ballyhoo', 'Boardwalk', 'Cathedral', 'Serenade', 'Timber']);
const mesh = new Set([...rounded, 'Funnies', 'Turnpike']);
const root = fileURLToPath(new URL('../..', import.meta.url));
const interval = (segment: number, t0 = 0, t1 = 1): CurveInterval => ({ segment, t0, t1 });

// These thresholds and roots reproduce ambient-mesh.mjs's original triangle cuts without rebuilding its flow field.
function roots(values: number[], value: number): number[] {
  const [p0, p1, p2, p3] = values, a = -p0 + 3 * p1 - 3 * p2 + p3, b = 3 * p0 - 6 * p1 + 3 * p2, c = -3 * p0 + 3 * p1, d = p0 - value;
  if (Math.max(...values) - Math.min(...values) < 1e-9) return [];
  const q = (t: number) => ((a * t + b) * t + c) * t + d, critical: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) critical.push(-c / (2 * b));
  } else {
    const discriminant = b * b - 3 * a * c;
    if (discriminant >= 0) critical.push((-b - Math.sqrt(discriminant)) / (3 * a), (-b + Math.sqrt(discriminant)) / (3 * a));
  }
  const stops = [0, ...critical.filter(t => t > 0 && t < 1).sort((a, b) => a - b), 1], result: number[] = [];
  for (const t of stops) if (t > 1e-8 && t < 1 - 1e-8 && Math.abs(q(t)) < 1e-7) result.push(t);
  for (let i = 0; i < stops.length - 1; i++) {
    let low = stops[i], high = stops[i + 1], left = q(low);
    if (left * q(high) >= 0) continue;
    for (let j = 0; j < 45; j++) {
      const mid = (low + high) / 2, value = q(mid);
      if (left * value <= 0) high = mid; else { low = mid; left = value; }
    }
    const t = (low + high) / 2;
    if (t > 1e-8 && t < 1 - 1e-8) result.push(t);
  }
  return result;
}
function meshRanges(glyph: Drawn, contour: number, grid: number): CurveInterval[] {
  return glyph.contours[contour].flatMap((_, segment) => {
    const curve = correspondenceCurve(glyph, contour, interval(segment)), crossings: number[] = [];
    for (const axis of [(p: Node) => p.x, (p: Node) => p.y, (p: Node) => p.y - p.x]) {
      const values = curve.map(axis), low = Math.min(...values), high = Math.max(...values);
      for (let k = Math.floor(low / grid) + 1; k < Math.ceil(high / grid); k++) crossings.push(...roots(values, k * grid));
    }
    const cuts = [0, ...crossings.sort((a, b) => a - b).filter((t, i, all) => i === 0 || t - all[i - 1] > 1e-7), 1];
    return cuts.slice(1).map((t, i) => interval(segment, cuts[i], t));
  });
}
function straight(points: Node[]): boolean {
  const [a, , , b] = points, dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  if (!length) return false;
  let previous = -Infinity;
  return points.every(p => {
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
    const valid = t >= previous - 1e-10 && t >= -1e-10 && t <= 1 + 1e-10 && Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < 1e-8;
    previous = t;
    return valid;
  });
}
function pair(source: Drawn, target: Drawn, contour: number, from: CurveInterval, to: CurveInterval): OutlineMasterSpan {
  if (from.t0 === from.t1) return { kind: 'collapsed', source: { segment: from.segment, t: from.t0 }, target: to };
  const parameter = straight(correspondenceCurve(source, contour, from)) && straight(correspondenceCurve(target, contour, to)) ? 'line-distance' : 'curve';
  return { kind: 'curve', source: from, target: to, parameter };
}
function meshSource(style: string, ch: string, original: Drawn): Drawn {
  const glyph = structuredClone(original);
  if (style === 'Turnpike' && ['/', '\\', 'X', ')', 'y'].includes(ch)) {
    for (const contour of glyph.contours) for (let i = 0; i < contour.length; i++) {
      const a = contour[i], b = contour[(i + 1) % contour.length];
      const clampX = (x: number) => Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), x));
      const clampY = (y: number) => Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), y));
      if (a.ox !== undefined) a.ox = clampX(a.ox);
      if (a.oy !== undefined) a.oy = clampY(a.oy);
      if (b.ix !== undefined) b.ix = clampX(b.ix);
      if (b.iy !== undefined) b.iy = clampY(b.iy);
    }
  }
  return glyph;
}
function neutralRelation(style: string, ch: string): NeutralRelation {
  if (style === 'Turnpike' && ['/', '\\', 'X', ')', 'y'].includes(ch)) return { kind: 'repaired', reason: 'Endpoint handles were clamped to their endpoint rectangles by at most seven units, removing microscopic cap crossings.' };
  if (style === 'Hearth' && ch === '^') return { kind: 'repaired', reason: 'The two inner apex anchors were joined at their midpoint to remove a microscopic sliver.' };
  if (style === 'Hearth' && ch === '€') return { kind: 'repaired', reason: 'The bowl curve was trimmed to the bar join and its following two anchors were joined.' };
  if (style === 'Bulwark' && '‹›«»'.includes(ch)) return { kind: 'repaired', reason: 'Chevron inner notches and double-chevron spacing were repaired in the first neutral master; the ordered corner roles remain paired.' };
  if (style === 'Cathedral' && ch === '\\') return { kind: 'repaired', reason: 'The original backslash had the slash direction and a 127-unit advance. Its first master mirrors the slash within a 585-unit advance; corresponding terminal, corner, and long-side roles are paired.' };
  if (style === 'Couture' && ch === '*') return { kind: 'repaired', reason: 'Each asterisk petal received its own central tip, removing two microscopic central overlap fragments.' };
  if (style === 'Sonnet' && 'bp'.includes(ch)) return { kind: 'repaired', reason: 'Contour 0 node 4 and its handles moved seven units right to retain the bowl attachment.' };
  if (style === 'Sonnet' && ch === '¥') return { kind: 'repaired', reason: 'Contour 2 node 16 and its handles moved five units left to retain the bar attachment.' };
  return { kind: rounded.has(style) ? 'rounded' : 'exact' };
}
function correspondence(style: string, ch: string, source: Drawn, target: Drawn): OutlineMasterContour[] {
  if (style === 'Cathedral' && ch === '\\') {
    // Raw edges 0 and 1 form one top terminal. Keep their knee as an explicit split on the repaired terminal.
    const cut = .22060494679065856;
    const ranges = [interval(0, 0, cut), interval(0, cut), ...Array.from({ length: 7 }, (_, i) => interval(i + 1))];
    return [{ source: 0, target: 0, spans: ranges.map((range, i) => pair(source, target, 0, interval(i), range)) }];
  }
  if (mesh.has(style)) {
    const prepared = meshSource(style, ch, source), grid = rounded.has(style) && '/\\'.includes(ch) ? Infinity : 48;
    return source.contours.map((_, ci) => {
      const ranges = meshRanges(prepared, ci, grid);
      if (ranges.length !== target.contours[ci]?.length) throw new Error(`${style} ${ch} contour ${ci}: reproduced ${ranges.length} cuts, expected ${target.contours[ci]?.length}`);
      return { source: ci, target: ci, spans: ranges.map((range, i) => pair(source, target, ci, range, interval(i))) };
    });
  }
  return source.contours.map((contour, ci) => {
    const slots = contour.map((_, i) => i);
    if (style === 'Hearth' && ch === 'K' && ci === 1) slots.splice(2, 0, 2);
    if (style === 'Hearth' && ch === 'w' && ci === 0) slots.splice(8, 0, 8);
    if (style === 'Bulwark' && ch === 'j' && ci === 0) slots.push(0);
    if (style === 'Bulwark' && '()'.includes(ch) && ci === 0) slots.splice(4, 0, 3, 4);
    if (slots.length !== target.contours[ci]?.length) throw new Error(`${style} ${ch} contour ${ci}: unrecorded point count change`);
    return { source: ci, target: ci, spans: slots.map((segment, i) => pair(source, target, ci,
      interval(segment, 0, segment === slots[(i + 1) % slots.length] ? 0 : 1), interval(i))) };
  });
}
export function compileOutlineMasterMap(info: MasterInfo, source: FreeFont, neutral: FreeFont): OutlineMasterMapData {
  const style = source.family;
  if (!styles.includes(style)) throw new Error(`No reviewed original-outline recipe for ${style}`);
  const glyphs: OutlineMasterMapData['glyphs'] = {};
  for (const [ch, glyph] of Object.entries(source.glyphs)) {
    if (!glyph.contours.length) continue;
    if (!neutral.glyphs[ch]) throw new Error(`${style}: original ${ch} is absent from its first master`);
    glyphs[ch] = { relation: neutralRelation(style, ch), contours: correspondence(style, ch, glyph, neutral.glyphs[ch]) };
  }
  return parseOutlineMasterMap({ format: 'outline-master-map-v1', from: info.source, to: info.ref, glyphs });
}
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function snapshot(directory: string, digest: string): unknown {
  const bytes = readFileSync(resolve(root, 'fonts', directory, digest + '.json'), 'utf8');
  if (hash(bytes) !== digest) throw new Error(`Snapshot integrity check failed: ${directory}/${digest}`);
  return JSON.parse(bytes);
}
export function loadOriginalMaster(style: string) {
  const info = MASTER_REVISIONS.find(m => m.ref.fontId.split(':')[0] === style);
  if (!info) throw new Error(`Missing first master for ${style}`);
  const source = decodeFreeFont(parseSourceData(snapshot('sources', info.source.digest)));
  const masters = decodeWeightMasters(parseWeightMasters(snapshot('masters', info.ref.digest)));
  const neutral = masters.masters.find(m => m.weight === masters.defaultWeight)?.font;
  if (!neutral) throw new Error('First master lacks its neutral knot');
  return { info, source, neutral, masters };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const selected = process.argv.length > 2 ? process.argv.slice(2) : styles, out = resolve(root, '.audit/origin-maps');
  const manifest: { ref: { kind: 'outline-master-map-v1'; digest: string; fontId: string }; from: OutlineMasterMapData['from']; to: OutlineMasterMapData['to'] }[] = [];
  mkdirSync(out, { recursive: true });
  for (const style of selected) {
    const { info, source, neutral, masters } = loadOriginalMaster(style), data = compileOutlineMasterMap(info, source, neutral);
    decodeOutlineMasterMap(data, { from: { ref: info.source, font: source }, to: { ref: info.ref, masters } });
    const bytes = JSON.stringify(data) + '\n';
    writeFileSync(resolve(out, style + '.json'), bytes);
    const digest = hash(bytes);
    manifest.push({ ref: { kind: 'outline-master-map-v1', digest, fontId: data.from.fontId }, from: data.from, to: data.to });
    process.stdout.write(JSON.stringify({ style, digest, glyphs: Object.keys(data.glyphs).length,
      spans: Object.values(data.glyphs).reduce((sum, g) => sum + g.contours.reduce((sum, c) => sum + c.spans.length, 0), 0) }) + '\n');
  }
  writeFileSync(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
