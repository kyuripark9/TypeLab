/* Evaluate original outlines with increasing height maps and affine placement. Preview and export share this path. */
import { ALL_CHARS, metrics, resolve, type Glyph, type Metrics } from '../engine/font';
import type { FreeFont } from '../engine/free';
import { applyM, cmdsBox, cmdsToD } from '../engine/geom';
import { blankParts } from '../engine/glyph';
import { cmdsContours, drawnCmds, type Drawn, type Node } from '../engine/outline';
import type { Mat } from '../engine/types';
import { DEFAULTS, type Params } from '../params';
import { inverseTransform, mapOutline, mapPoint, type OutlineTransform } from './geometry';
import type { SourceRef } from './model';
import { sourceFont } from './registry';
import { sourceControls } from './capabilities';
import { sourceDot } from './features';

export interface SourceStatus { ref: SourceRef; state: 'missing' | 'ready'; missingCharacters: string[] }
interface SourceInstance { m: Metrics; free?: FreeFont; status: SourceStatus; glyph(ch: string): Glyph | null }

/** Each side of the pick uses its complete slider range, with positive endpoints. */
function axis(value: number, pick: number, low: number, high: number): number {
  if (value === pick) return 1;
  return value < pick ? 1 + (low - 1) * (pick - value) / pick : 1 + (high - 1) * (value - pick) / (1 - pick);
}

function shape(font: FreeFont, p: Params, ch: string): OutlineTransform {
  const base = { ...DEFAULTS, ...p.freeAt };
  const sy = axis(p.height, DEFAULTS.height, 0.78, 1.28);
  const sx = axis(p.width, base.width, 0.65, 1.55);
  if (!/^[a-z]$/.test(ch)) return { xScale: sx, y: [[0, 0], [font.cap, font.cap * sy]] };
  const xh = font.xh * axis(p.xHeight, base.xHeight, 0.76, 1 + 0.6 * (font.cap / font.xh - 1));
  const ext = axis(p.extenders, base.extenders, 0.65, 1.4);
  const desc = axis(p.descender, base.descender, 0.65, 1.4) * ext;
  const transform: OutlineTransform = { xScale: sx, y: [
    [-font.cap * 0.4, -font.cap * 0.4 * desc * sy], [0, 0],
    [font.xh, xh * sy], [font.cap, (xh + (font.cap - font.xh) * ext) * sy]
  ] };
  const dot = p.sourceProgram && sourceDot(p.sourceProgram.digest, ch);
  if (!dot) return transform;
  const bottom = mapPoint({ x: 0, y: dot.bottom }, transform).y;
  const [first, second, ...rest] = transform.y;
  return { xScale: sx, y: [first, second, ...rest.filter(k => k[0] < dot.bottom),
    [dot.bottom, bottom], [dot.bottom + 1, bottom + sy]] };
}

function move(d: Drawn, M: Mat): Drawn {
  return { ...d, contours: d.contours.map(c => c.map(n => {
    const [x, y] = applyM(M, n.x, n.y), out: Node = { ...n, x, y };
    if (n.ix !== undefined && n.iy !== undefined) [out.ix, out.iy] = applyM(M, n.ix, n.iy);
    if (n.ox !== undefined && n.oy !== undefined) [out.ox, out.oy] = applyM(M, n.ox, n.oy);
    return out;
  })) };
}

function inverse(M: Mat): Mat {
  const [a, b, c, d, e, f] = M, det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

function pose(font: FreeFont, original: Drawn, p: Params, ch: string) {
  const transform = shape(font, p, ch), base = { ...DEFAULTS, ...p.freeAt };
  const box = cmdsBox(drawnCmds(original.contours)) ?? { x0: font.cap * 0.1, x1: font.cap * 0.65, y0: 0, y1: font.cap }, sx = transform.xScale;
  const bearing = 2 ** ((p.sideBearing - base.sideBearing) * 2);
  const dx = box.x0 * sx * (bearing - 1);
  const adv = original.adv * sx + Math.max(0, original.adv - box.x1 + box.x0) * sx * (bearing - 1);
  const mirror = p.mirror === base.mirror ? 1 : -1;
  const shear = Math.tan((p.slant - base.slant) * 20 * Math.PI / 180);
  const angle = (p.rotation - base.rotation) * Math.PI / 2, c = Math.cos(angle), s = Math.sin(angle);
  const cy = font.cap * axis(p.height, DEFAULTS.height, 0.78, 1.28) / 2, cx = adv / 2;
  const tx = mirror === 1 ? dx : adv - dx;
  const M: Mat = [c * mirror, s * mirror, c * shear - s, s * shear + c,
    c * (tx - cx) + s * cy + cx, s * (tx - cx) - c * cy + cy];
  return { transform, M, adv };
}

function evaluated(font: FreeFont, p: Params, ch: string): Glyph | null {
  const original = font.glyphs[ch], edited = p.outlines[ch];
  if (!original && !edited) return null;
  // A new character has a fixed placement frame. Using each posed edit as its frame would accumulate drift.
  const source = original ?? { adv: font.cap * 0.75, contours: [] };
  const target = pose(font, source, p, ch);
  let canonical = source, extraAdvance = 0;
  if (edited) {
    const at: Params = { ...p, ...edited.at, glyphs: {}, outlines: {} };
    if (sourceControls.every(key => p[key] === at[key])) return asGlyph(ch, edited, target.M);
    const from = pose(font, source, at, ch);
    const curves = edited.contours.some(c => c.some(n => n.r)) ? { ...edited, contours: cmdsContours(drawnCmds(edited.contours)) } : edited;
    canonical = { ...curves, contours: mapOutline(move(curves, inverse(from.M)).contours, inverseTransform(from.transform)).contours };
    extraAdvance = (edited.adv - from.adv) / from.transform.xScale;
  }
  const shaped: Drawn = { adv: Math.max(0, target.adv + extraAdvance * target.transform.xScale),
    contours: mapOutline(canonical.contours, target.transform).contours };
  return asGlyph(ch, move(shaped, target.M), target.M);
}

function asGlyph(ch: string, drawn: Drawn, M: Mat): Glyph {
  const cmds = drawnCmds(drawn.contours), box = cmdsBox(cmds) ?? { x0: 0, x1: 0, y0: 0, y1: 0 };
  return { ch, ...blankParts(), strokes: [{ part: 'drawn', cmds, curved: true }],
    bodyW: box.x1 - box.x0, lsb: box.x0, rsb: drawn.adv - box.x1, adv: drawn.adv,
    M, drawn, cmds, d: cmdsToD(cmds) };
}

export function sourceInstance(p: Params, fallback: Metrics): SourceInstance | null {
  const ref = p.sourceProgram;
  if (!ref) return null;
  const font = sourceFont(ref);
  if (!font) return { m: fallback, status: { ref, state: 'missing', missingCharacters: [] }, glyph: () => null };
  const base = { ...DEFAULTS, ...p.freeAt }, sy = axis(p.height, DEFAULTS.height, 0.78, 1.28);
  const lower = shape(font, p, 'x'), xh = lower.y[2]?.[1] ?? font.xh * sy;
  const m = metrics(resolve({ ...p, geoHuman: 0.5, softSharp: 0.5, classicFuture: 0.5, playfulFormal: 0.5 }));
  return {
    free: font, status: { ref, state: 'ready', missingCharacters: [...ALL_CHARS].filter(ch => !font.glyphs[ch] && !p.outlines[ch]) },
    m: { ...m, cap: font.cap * sy, xh, asc: lower.y[3]?.[1] ?? font.cap * sy,
      desc: lower.y[0][1], ws: lower.xScale, slant: Math.tan((p.slant - base.slant) * 20 * Math.PI / 180),
      space: Math.max(20, font.space * lower.xScale + (p.wordSpacing - DEFAULTS.wordSpacing) * 520) },
    glyph: ch => evaluated(font, p, ch)
  };
}
