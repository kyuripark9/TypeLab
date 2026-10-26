/* Evaluate original outlines with increasing height maps and affine placement. Preview and export share this path. */
import { ALL_CHARS, metrics, resolve, type Glyph, type Metrics } from '../engine/font';
import type { FreeFont } from '../engine/free';
import { applyM, cmdsBox, cmdsToD } from '../engine/geom';
import { blankParts } from '../engine/glyph';
import { cmdsContours, drawnCmds, type Drawn, type Node } from '../engine/outline';
import type { Mat } from '../engine/types';
import { DEFAULTS, type Params } from '../params';
import { inverseTransform, mapPoint, type OutlineTransform } from './geometry';
import type { SourceRef } from './model';
import { designSourceDependencies } from './dependencies';
import { sourceFont, sourceMasters, sourceOriginMap, sourceProgram, sourceReady, sourceSubdivision } from './registry';
import { sourceControls } from './capabilities';
import { sourceDot } from './features';
import { interpolateMasters, weightAt } from './masters';
import { masterInfo, masterBasisForEditing } from './master-catalog';
import { basisTransition, programInfo } from './program-catalog';
import { originMapFor } from './origin-catalog';
import { rebaseOutlineEdits } from './outline-master-map';
import type { ProgramAssetRef } from './program';
import { interpolateWidthMasters, widthAt } from './width-masters';
import { evaluateFeatureMasters, FEATURE_CONTROLS } from './feature-masters';
import { identifyAuthored, inheritAuthored, mapAuthored, rebaseEdits, rebaseReference, transportEdits } from './edit-transport';
import { compileSourceFinish, finishSourceGlyph, sourceFinishBounds } from './finish';

export interface SourceStatus { ref: SourceRef | ProgramAssetRef; state: 'missing' | 'ready'; missingCharacters: string[] }
interface SourceInstance { m: Metrics; free?: FreeFont; status: SourceStatus; glyph(ch: string): Glyph | null }

/** Each side of the pick uses its complete slider range, with positive endpoints. */
function axis(value: number, pick: number, low: number, high: number): number {
  if (value === pick) return 1;
  return value < pick ? 1 + (low - 1) * (pick - value) / pick : 1 + (high - 1) * (value - pick) / (1 - pick);
}

function shape(font: FreeFont, p: Params, ch: string): OutlineTransform {
  const base = { ...DEFAULTS, ...p.freeAt };
  const sy = axis(p.height, DEFAULTS.height, 0.78, 1.28);
  const sx = programInfo(p.sourceProgram)?.width ? 1 : axis(p.width, base.width, 0.65, 1.55);
  if (!/^[a-z]$/.test(ch)) return { xScale: sx, y: [[0, 0], [font.cap, font.cap * sy]] };
  const xh = font.xh * axis(p.xHeight, base.xHeight, 0.76, 1 + 0.6 * (font.cap / font.xh - 1));
  const ext = axis(p.extenders, base.extenders, 0.65, 1.4);
  const desc = axis(p.descender, base.descender, 0.65, 1.4) * ext;
  const transform: OutlineTransform = { xScale: sx, y: [
    [-font.cap * 0.4, -font.cap * 0.4 * desc * sy], [0, 0],
    [font.xh, xh * sy], [font.cap, (xh + (font.cap - font.xh) * ext) * sy]
  ] };
  const originalRef = masterInfo(p.sourceProgram)?.source ?? p.sourceProgram;
  const dot = originalRef && sourceDot(originalRef.digest, ch);
  if (!dot) return transform;
  const drawn = font.glyphs[ch];
  const dotBox = masterInfo(p.sourceProgram) && drawn
    ? cmdsBox(drawnCmds(dot.contours.flatMap(i => drawn.contours[i] ? [drawn.contours[i]] : []))) : null;
  const sourceBottom = dotBox?.y0 ?? dot.bottom;
  const bottom = mapPoint({ x: 0, y: sourceBottom }, transform).y;
  const [first, second, ...rest] = transform.y;
  return { xScale: sx, y: [first, second, ...rest.filter(k => k[0] < sourceBottom),
    [sourceBottom, bottom], [sourceBottom + 1, bottom + sy]] };
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
  const digest = p.sourceProgram?.kind === 'outline-v1' ? p.sourceProgram.digest : masterBasisForEditing(p.sourceProgram)?.digest ?? '';
  const identity = { digest, glyph: ch };
  let canonical = digest ? identifyAuthored(source, identity) : source, extraAdvance = 0;
  if (edited) {
    const at: Params = { ...p, ...edited.at, glyphs: {}, outlines: {} };
    if (sourceControls.every(key => p[key] === at[key]) && p.weight === at.weight
      && p.sourceProgram?.digest === at.sourceProgram?.digest
      && (!programInfo(p.sourceProgram)?.data.features || FEATURE_CONTROLS.every(key => p[key] === at[key]))) {
      return asGlyph(ch, edited, target.M, p.sourceProgram?.kind === 'program-v1');
    }
    const beforeFont = variedFont(at) ?? font;
    let beforeSource = beforeFont.glyphs[ch] ?? source;
    let beforeBasis = masterBasisForEditing(at.sourceProgram);
    let beforeIdentity = { digest: at.sourceProgram?.kind === 'outline-v1' ? at.sourceProgram.digest : beforeBasis?.digest ?? '', glyph: ch };
    const from = pose(beforeFont, beforeSource, at, ch);
    const curves = edited.contours.some(c => c.some(n => n.r)) ? { ...edited, contours: cmdsContours(drawnCmds(edited.contours)) } : edited;
    let unposed = move(curves, inverse(from.M));
    if (at.sourceProgram?.kind === 'outline-v1' && beforeBasis) {
      // One earlier interpreter labeled raw sheet points with the first-master digest; their saved frame disambiguates them.
      const previousDigest = beforeBasis.digest;
      unposed = { ...unposed, contours: unposed.contours.map(c => c.map(n => n.authored?.digest === previousDigest
        && n.authored.glyph === ch ? { ...n, authored: { ...n.authored, digest: beforeIdentity.digest } } : n)) };
    }
    if (beforeIdentity.digest && unposed.contours.some(c => c.some(n => n.authored?.digest !== beforeIdentity.digest || n.authored.glyph !== ch))) {
      unposed = inheritAuthored(unposed, mapAuthored(identifyAuthored(beforeSource, beforeIdentity), from.transform, beforeSource, beforeIdentity));
    }
    canonical = mapAuthored(unposed, inverseTransform(from.transform), beforeSource, beforeIdentity);
    extraAdvance = (edited.adv - from.adv) / from.transform.xScale;
    let changedBasis = false;
    if (at.sourceProgram?.kind === 'outline-v1' && at.sourceProgram.digest !== digest && beforeBasis && beforeFont.glyphs[ch] && original) {
      const info = originMapFor(at.sourceProgram, beforeBasis), origin = info && sourceOriginMap(info.ref);
      if (!origin) throw new Error('Saved original-sheet Points require their exact master correspondence');
      const rebased = rebaseOutlineEdits(canonical, origin, ch);
      if (!rebased) throw new Error('Original-sheet correspondence is missing its saved glyph');
      beforeSource = rebased.reference; beforeBasis = origin.data.to;
      beforeIdentity = { digest: beforeBasis.digest, glyph: ch };
      canonical = rebased.drawing;
      changedBasis = true;
    }
    if (digest && beforeIdentity.digest !== digest && beforeFont.glyphs[ch] && original) {
      const ref = p.sourceProgram && beforeBasis && basisTransition(beforeBasis, p.sourceProgram);
      const mapping = ref && sourceSubdivision(ref);
      if (!mapping) throw new Error('Saved Points require a compatible master basis transition');
      canonical = rebaseEdits(canonical, beforeSource, mapping.data, ch);
      beforeSource = rebaseReference(beforeSource, mapping.data, ch);
      beforeIdentity = identity;
      changedBasis = true;
    }
    if (changedBasis) {
      // Curve subdivision and repaired masters can change handle bounds, spacing and the placement center.
      const rebasedFont = { ...beforeFont, glyphs: { ...beforeFont.glyphs, [ch]: beforeSource } };
      const rebasedPose = pose(rebasedFont, beforeSource, { ...at, sourceProgram: p.sourceProgram }, ch);
      const posed = move(mapAuthored(canonical, from.transform, beforeSource, beforeIdentity), from.M);
      canonical = mapAuthored(move(posed, inverse(rebasedPose.M)), inverseTransform(rebasedPose.transform), beforeSource, beforeIdentity);
      extraAdvance = (edited.adv - rebasedPose.adv) / rebasedPose.transform.xScale;
    }
    if (beforeSource !== source && digest && beforeFont.glyphs[ch] && original) canonical = transportEdits(canonical, beforeSource, source, identity);
  }
  const shaped = mapAuthored({ ...canonical, adv: Math.max(0, target.adv + extraAdvance * target.transform.xScale) }, target.transform, source, identity);
  return asGlyph(ch, move(shaped, target.M), target.M, p.sourceProgram?.kind === 'program-v1');
}

function variedFont(p: Params): FreeFont | undefined {
  if (!p.sourceProgram) return undefined;
  const authored = sourceProgram(p.sourceProgram), info = masterInfo(p.sourceProgram);
  if (authored && info) {
    const weight = weightAt(p, info), width = authored.width ? widthAt(p, authored.width.data.axis) : null;
    const baseline = authored.width && width !== null ? interpolateWidthMasters(authored.width, weight, width) : interpolateMasters(authored.masters, weight);
    return authored.features ? evaluateFeatureMasters(authored.features, { baseline, weight,
      width,
      values: { crossbar: p.crossbar, tail: p.tail, terminalLength: p.terminalLength } }) : baseline;
  }
  const program = sourceMasters(p.sourceProgram);
  return program && info ? interpolateMasters(program, weightAt(p, info)) : sourceFont(p.sourceProgram);
}

function asGlyph(ch: string, drawn: Drawn, M: Mat, editable = false): Glyph {
  const cmds = drawnCmds(drawn.contours), box = cmdsBox(cmds) ?? { x0: 0, x1: 0, y0: 0, y1: 0 };
  return { ch, ...blankParts(), strokes: [{ part: 'drawn', cmds, curved: true }],
    bodyW: box.x1 - box.x0, lsb: box.x0, rsb: drawn.adv - box.x1, adv: drawn.adv,
    M, drawn, ...(editable ? { editable: drawn } : {}), cmds, d: cmdsToD(cmds) };
}

export function sourceInstance(p: Params, fallback: Metrics): SourceInstance | null {
  const ref = p.sourceProgram;
  if (!ref) return null;
  for (const baseline of designSourceDependencies(p)) {
    if (!sourceReady(baseline)) return { m: fallback, status: { ref: baseline, state: 'missing', missingCharacters: [] }, glyph: () => null };
  }
  const font = variedFont(p);
  if (!font) return { m: fallback, status: { ref, state: 'missing', missingCharacters: [] }, glyph: () => null };
  const base = { ...DEFAULTS, ...p.freeAt }, sy = axis(p.height, DEFAULTS.height, 0.78, 1.28);
  const lower = shape(font, p, 'x'), xh = lower.y[2]?.[1] ?? font.xh * sy;
  const policy = programInfo(ref)?.data.finish;
  const finish = policy ? compileSourceFinish(policy, p, { capHeight: font.cap * sy }) : null;
  const bounds = finish ? sourceFinishBounds(finish) : { above: 0, below: 0 };
  if (policy?.slice) {
    for (const own of Object.values(p.glyphs)) {
      bounds.above = Math.max(bounds.above, policy.slice.maxGap * (own.slice ?? p.slice) * font.cap * sy);
    }
  }
  const m = metrics(resolve({ ...p, geoHuman: 0.5, softSharp: 0.5, classicFuture: 0.5, playfulFormal: 0.5 }));
  return {
    free: font, status: { ref, state: 'ready', missingCharacters: [...ALL_CHARS].filter(ch => !font.glyphs[ch] && !p.outlines[ch]) },
    m: { ...m, cap: font.cap * sy, xh, asc: (lower.y[3]?.[1] ?? font.cap * sy) + bounds.above,
      desc: lower.y[0][1] - bounds.below, ws: lower.xScale, slant: Math.tan((p.slant - base.slant) * 20 * Math.PI / 180),
      space: Math.max(20, font.space * lower.xScale + (p.wordSpacing - DEFAULTS.wordSpacing) * 520) },
    glyph: ch => {
      const glyph = evaluated(font, p, ch);
      return glyph && finish ? finishSourceGlyph(glyph, finish) : glyph;
    }
  };
}
