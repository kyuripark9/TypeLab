/* Compatible weight drawings and the source they were authored from. Runtime only interpolates reviewed data. */
import { decodeFreeFont, type FreeFont, type FreeFontData } from '../engine/free';
import type { Drawn, Node } from '../engine/outline';
import type { Params } from '../params/model';
import { parseSourceData } from './data';
import { parseSourceRef, type OutlineSourceRef } from './model';

export interface MasterProvenance { family: string; url: string; revision: string; sha256: string }
export interface WeightMasterData {
  format: 'weight-masters-v1'; source: OutlineSourceRef; defaultWeight: number;
  masters: { weight: number; data: FreeFontData }[];
  provenance: MasterProvenance[]; notes: string[];
}
export interface WeightMasters extends Omit<WeightMasterData, 'masters'> {
  masters: { weight: number; font: FreeFont }[];
}

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid weight master object');
  return Object.fromEntries(Object.entries(input));
}
function text(input: unknown): string {
  if (typeof input !== 'string') throw new TypeError('Invalid weight master text');
  return input;
}

export function parseWeightMasters(input: unknown): WeightMasterData {
  const v = record(input), source = parseSourceRef(v.source);
  if (v.format !== 'weight-masters-v1' || source?.kind !== 'outline-v1'
    || typeof v.defaultWeight !== 'number' || !Array.isArray(v.masters) || v.masters.length < 2 || v.masters.length > 20
    || !Array.isArray(v.provenance) || !Array.isArray(v.notes)) throw new TypeError('Invalid weight master package');
  const masters = v.masters.map(input => {
    const m = record(input);
    if (typeof m.weight !== 'number' || !Number.isFinite(m.weight) || m.weight < 1 || m.weight > 1000) throw new TypeError('Invalid master weight');
    return { weight: m.weight, data: parseSourceData(m.data) };
  });
  const base = masters.find(m => m.weight === v.defaultWeight);
  if (!base || masters.some((m, i) => i > 0 && m.weight <= masters[i - 1].weight)) throw new TypeError('Masters must be ordered and include the original weight');
  const signature = (data: FreeFontData) => JSON.stringify(Object.entries(data.glyphs).sort(([a], [b]) => a.localeCompare(b)).map(([ch, [, cs]]) => [ch, cs.map(c => c.map(n => [n.length > 2 && n[2] !== null, n.length === 6]))]));
  const expected = signature(base.data);
  for (const m of masters) {
    if (m.data.id !== source.fontId || m.data.cap !== base.data.cap || m.data.xh !== base.data.xh || signature(m.data) !== expected) {
      throw new TypeError('Weight masters do not have compatible source geometry');
    }
  }
  const provenance = v.provenance.map(input => {
    const p = record(input), sha256 = text(p.sha256);
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new TypeError('Invalid upstream source digest');
    return { family: text(p.family), url: text(p.url), revision: text(p.revision), sha256 };
  });
  return { format: 'weight-masters-v1', source, defaultWeight: v.defaultWeight, masters, provenance, notes: v.notes.map(text) };
}

export function decodeWeightMasters(data: WeightMasterData): WeightMasters {
  return { ...data, masters: data.masters.map(m => ({ weight: m.weight, font: decodeFreeFont(m.data) })) };
}

export function weightAt(p: Pick<Params, 'weight' | 'freeAt'>, range: { min: number; max: number; defaultWeight: number }): number {
  const pick = p.freeAt.weight ?? 0.5;
  if (p.weight === pick) return range.defaultWeight;
  return p.weight < pick
    ? range.min + (range.defaultWeight - range.min) * p.weight / pick
    : range.defaultWeight + (range.max - range.defaultWeight) * (p.weight - pick) / (1 - pick);
}

export function sliderAt(weight: number, pick: number, range: { min: number; max: number; defaultWeight: number }): number {
  if (weight === range.defaultWeight) return pick;
  return weight < range.defaultWeight
    ? pick * (weight - range.min) / (range.defaultWeight - range.min)
    : pick + (1 - pick) * (weight - range.defaultWeight) / (range.max - range.defaultWeight);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function nodeAt(a: Node, b: Node, t: number): Node {
  const n: Node = { ...a, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  if (a.ix !== undefined && a.iy !== undefined && b.ix !== undefined && b.iy !== undefined) { n.ix = lerp(a.ix, b.ix, t); n.iy = lerp(a.iy, b.iy, t); }
  if (a.ox !== undefined && a.oy !== undefined && b.ox !== undefined && b.oy !== undefined) { n.ox = lerp(a.ox, b.ox, t); n.oy = lerp(a.oy, b.oy, t); }
  return n;
}

const instances = new WeakMap<WeightMasters, Map<number, FreeFont>>();
export function interpolateMasters(program: WeightMasters, weight: number): FreeFont {
  const first = program.masters[0], last = program.masters[program.masters.length - 1];
  if (weight <= first.weight) return first.font;
  if (weight >= last.weight) return last.font;
  const exact = program.masters.find(m => m.weight === weight);
  if (exact) return exact.font;
  let cache = instances.get(program);
  if (!cache) { cache = new Map(); instances.set(program, cache); }
  const kept = cache.get(weight);
  if (kept) return kept;
  const upper = program.masters.findIndex(m => m.weight > weight), a = program.masters[upper - 1], b = program.masters[upper];
  const t = (weight - a.weight) / (b.weight - a.weight), glyphs: Record<string, Drawn> = {};
  for (const [ch, d] of Object.entries(a.font.glyphs)) {
    const next = b.font.glyphs[ch];
    glyphs[ch] = { adv: lerp(d.adv, next.adv, t), contours: d.contours.map((c, i) => c.map((n, j) => nodeAt(n, next.contours[i][j], t))) };
  }
  const font = { ...a.font, space: lerp(a.font.space, b.font.space, t), glyphs };
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(weight, font);
  return font;
}
