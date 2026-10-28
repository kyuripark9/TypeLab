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
import { sourceFont, sourceForm, sourceMarks, sourceMasters, sourceOriginMap, sourceProgram, sourceReady, sourceSubdivision } from './registry';
import { glyphFormDrawing, type GlyphForm } from './forms';
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
import { componentMembership, componentOwnership, componentPlan, mapComponents, type ComponentMembership } from './components';
import { sourceMonoAdvance, spaceSourceDrawing, unspaceSourceDrawing, type SourceMonoPlan } from './spacing';
import { omitMarkComponents, sourceMarkAnchor, sourceMarkDrawing } from './marks';
import { dotShapeContour, shapeSourceDots, sourceDotShape } from './dots';
import { contrastWeights, mixAxes, mixDrawn, strokeAxes } from './contrast';

export interface SourceStatus { ref: SourceRef | ProgramAssetRef; state: 'missing' | 'ready'; missingCharacters: string[] }
interface SourceInstance {
  m: Metrics; free?: FreeFont; monoCell?: number; status: SourceStatus; glyph(ch: string): Glyph | null;
  /** The letter an accented character is composed on, where the program's marks are loaded; null otherwise. */
  accentBase(ch: string): string | null;
  /** Accented character `ch` on its letter as this font draws it, Points edits included; null where it has none. */
  accent(ch: string): Glyph | null;
}

/** Each side of the pick uses its complete slider range, with positive endpoints. */
function axis(value: number, pick: number, low: number, high: number): number {
  if (value === pick) return 1;
  return value < pick ? 1 + (low - 1) * (pick - value) / pick : 1 + (high - 1) * (value - pick) / (1 - pick);
}

/** The form letter `ch` draws in `p`: the one its letter picked, where it was authored on the program's exact weight and
    width bases; null for the original letter. */
function formOf(p: Params, ch: string): GlyphForm | null {
  const ref = p.sourceForms?.[ch], program = ref && p.sourceProgram ? sourceProgram(p.sourceProgram) : undefined;
  const form = ref && program?.width ? sourceForm(ref) : undefined;
  return form && form.data.base.digest === program?.data.base.digest && form.data.width.digest === program.data.width?.digest ? form : null;
}
/** A form at the weight and width `p` draws its letters at. */
function formDrawing(form: GlyphForm, p: Params): Drawn {
  const program = sourceProgram(p.sourceProgram!)!, width = widthAt(p, program.width!.data.axis), { x, y } = strokeWeights(p);
  return mixDrawn(glyphFormDrawing(form, x, width), glyphFormDrawing(form, y, width));
}

/** The weights `p` draws its letters' widths (`x`) and heights (`y`) at: both its weight, but under Contrast. */
function strokeWeights(p: Params): { x: number; y: number } {
  const info = masterInfo(p.sourceProgram)!, weight = weightAt(p, info), program = programInfo(p.sourceProgram)?.data;
  const at = program?.contrast ? contrastWeights(program.contrast, weight, info, p.contrast, p.freeAt.contrast ?? DEFAULTS.contrast) : { x: weight, y: weight };
  return program?.strokes ? strokeAxes(program.strokes, at, info, p.vWeight, p.freeAt.vWeight ?? DEFAULTS.vWeight, p.hWeight, p.freeAt.hWeight ?? DEFAULTS.hWeight) : at;
}

/** `form`: the letter draws an alternate form, which the original letter's dot binding doesn't reach. */
function shape(font: FreeFont, p: Params, ch: string, form = false): OutlineTransform {
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
  const dot = !form && originalRef && sourceDot(originalRef.digest, ch);
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

function pose(font: FreeFont, original: Drawn, p: Params, ch: string, form = false) {
  const transform = shape(font, p, ch, form), base = { ...DEFAULTS, ...p.freeAt };
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

function componentPlanFor(source: Drawn, p: Params, ch: string, transform: OutlineTransform) {
  const components = p.sourceProgram && sourceProgram(p.sourceProgram)?.components;
  const neutral = p.freeAt.dotSize ?? DEFAULTS.dotSize;
  // an alternate form has none of the original letter's components
  if (!components || p.dotSize === neutral || formOf(p, ch) || !components.data.glyphs.some(entry => entry.glyph === ch)) return null;
  const identity = { digest: components.data.base.digest, glyph: ch };
  const reference = mapAuthored(identifyAuthored(source, identity), transform, source, identity);
  return componentPlan(components, ch, reference, p.dotSize, neutral);
}

function evaluated(font: FreeFont, p: Params, ch: string): Glyph | null {
  const form = formOf(p, ch);
  const original = form ? formDrawing(form, p) : font.glyphs[ch];
  let edited = p.outlines[ch];
  if (!original && !edited) return null;
  // A new character has a fixed placement frame. Using each posed edit as its frame would accumulate drift.
  const source = original ?? { adv: font.cap * 0.75, contours: [] };
  const target = pose(font, source, p, ch, !!form);
  // a form's points carry its own identity: edits on it never reach the original letter or another form
  const digest = form ? form.ref!.digest : p.sourceProgram?.kind === 'outline-v1' ? p.sourceProgram.digest : masterBasisForEditing(p.sourceProgram)?.digest ?? '';
  const identity = { digest, glyph: ch };
  let canonical = digest ? identifyAuthored(source, identity) : source, extraAdvance = 0;
  let componentEligible: boolean[] | undefined;
  let componentOwners: ComponentMembership[] | undefined;
  let sizeOnly = false;
  if (edited) {
    const at: Params = { ...p, ...edited.at, sourceForms: edited.at?.sourceForms ?? {}, glyphs: {}, outlines: {} };
    // a drawing made on another of the letter's forms (a letter's History brought it back) stands as it was drawn
    if ((at.sourceForms[ch]?.digest ?? null) !== (p.sourceForms?.[ch]?.digest ?? null) || !!form !== !!formOf(at, ch)) {
      return asGlyph(ch, edited, target.M, p.sourceProgram?.kind === 'program-v1');
    }
    const sameFrame = sourceControls.every(key => p[key] === at[key]) && p.weight === at.weight
      && p.sourceProgram?.digest === at.sourceProgram?.digest
      && (!programInfo(p.sourceProgram)?.data.features || FEATURE_CONTROLS.every(key => p[key] === at[key]))
      && dotShapeOf(p) === dotShapeOf(at) && (!programInfo(p.sourceProgram)?.data.contrast || p.contrast === at.contrast)
      && (!programInfo(p.sourceProgram)?.data.strokes || p.vWeight === at.vWeight && p.hWeight === at.hWeight);
    if (sameFrame && (!programInfo(p.sourceProgram)?.data.components || p.dotSize === at.dotSize)) {
      return asGlyph(ch, edited, target.M, p.sourceProgram?.kind === 'program-v1');
    }
    edited = unspaceSourceDrawing(edited);
    sizeOnly = sameFrame;
    const beforeFont = variedFont(at) ?? font;
    let beforeSource = (form ? formDrawing(form, at) : beforeFont.glyphs[ch]) ?? source;
    let beforeBasis = form ? undefined : masterBasisForEditing(at.sourceProgram);
    let beforeIdentity = { digest: form ? digest : at.sourceProgram?.kind === 'outline-v1' ? at.sourceProgram.digest : beforeBasis?.digest ?? '', glyph: ch };
    const from = pose(beforeFont, beforeSource, at, ch, !!form);
    const previousComponents = componentPlanFor(beforeSource, at, ch, from.transform);
    const beforeComponents = at.sourceProgram && sourceProgram(at.sourceProgram)?.components;
    const currentComponents = p.sourceProgram && sourceProgram(p.sourceProgram)?.components;
    const ownership = form ? null : componentOwnership(beforeComponents || (currentComponents?.data.base.digest === beforeIdentity.digest ? currentComponents : null), ch);
    if (ownership) componentOwners = componentMembership(edited, ownership);
    componentEligible = edited.contours.map(c => c.length > 0 && c.every(n => n.authored?.glyph === ch
      && (n.authored.digest === beforeIdentity.digest || at.sourceProgram?.kind === 'outline-v1' && n.authored.digest === beforeBasis?.digest)));
    const curves = edited.contours.some(c => c.some(n => n.r)) ? { ...edited, contours: cmdsContours(drawnCmds(edited.contours)) } : edited;
    let unposed = move(curves, inverse(from.M));
    unposed = mapComponents(unposed, previousComponents, 'inverse', componentOwners);
    if (at.sourceProgram?.kind === 'outline-v1' && beforeBasis) {
      // One earlier interpreter labeled raw sheet points with the first-master digest; their saved frame disambiguates them.
      const previousDigest = beforeBasis.digest;
      unposed = { ...unposed, contours: unposed.contours.map(c => c.map(n => n.authored?.digest === previousDigest
        && n.authored.glyph === ch ? { ...n, authored: { ...n.authored, digest: beforeIdentity.digest } } : n)) };
    }
    if (beforeIdentity.digest && unposed.contours.some(c => c.some(n => n.authored?.digest !== beforeIdentity.digest || n.authored.glyph !== ch))) {
      const reference = mapAuthored(identifyAuthored(beforeSource, beforeIdentity), from.transform, beforeSource, beforeIdentity);
      if (componentOwners && ownership) {
        unposed = { ...unposed, contours: unposed.contours.map((contour, ci) => {
          const owner = componentOwners?.[ci];
          const binding = typeof owner === 'object' ? ownership.bindings.find(binding => binding.id === owner.component) : undefined;
          const candidates = binding ? reference.contours.filter((_, index) => binding.contours.includes(index))
            : owner === 'body' ? reference.contours.filter((_, index) => ownership.bindings.every(binding => !binding.contours.includes(index))) : reference.contours;
          return inheritAuthored({ ...unposed, contours: [contour] }, { ...reference, contours: candidates }).contours[0];
        }) };
      } else unposed = inheritAuthored(unposed, reference);
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
      const rebasedPose = pose(rebasedFont, beforeSource, { ...at, sourceProgram: p.sourceProgram }, ch, !!form);
      const posed = move(mapAuthored(canonical, from.transform, beforeSource, beforeIdentity), from.M);
      canonical = mapAuthored(move(posed, inverse(rebasedPose.M)), inverseTransform(rebasedPose.transform), beforeSource, beforeIdentity);
      extraAdvance = (edited.adv - rebasedPose.adv) / rebasedPose.transform.xScale;
    }
    if (beforeSource !== source && digest && beforeFont.glyphs[ch] && original) canonical = transportEdits(canonical, beforeSource, source, identity);
  }
  const shaped = mapAuthored({ ...canonical, adv: Math.max(0, target.adv + extraAdvance * target.transform.xScale) }, target.transform, source, identity);
  const components = componentPlanFor(source, p, ch, target.transform);
  const owners = componentOwners ?? (components && componentEligible
    ? componentMembership(shaped, components).map((owner, ci) => componentEligible?.[ci] ? owner : 'unbound') : undefined);
  let result = mapComponents(shaped, components, 'forward', owners);
  if (programInfo(p.sourceProgram)?.data.components && componentEligible
    && componentEligible.some((eligible, ci) => !eligible || componentOwners?.[ci] === 'unbound')) {
    // Spatial transport must not turn a newly drawn contour into an owned dot on the next save.
    result = { ...result, contours: result.contours.map((contour, ci) => componentEligible?.[ci] && componentOwners?.[ci] !== 'unbound' ? contour : contour.map(node => {
      const out = { ...node }; delete out.authored; return out;
    })) };
  }
  let placed = move(result, target.M);
  if (sizeOnly && edited) placed = { ...placed, adv: edited.adv,
    contours: placed.contours.map((contour, ci) => typeof owners?.[ci] === 'object' ? contour : edited.contours[ci]) };
  return asGlyph(ch, placed, target.M, p.sourceProgram?.kind === 'program-v1');
}

/** The shape `p`'s program draws its dots in for `p`'s Dots, or null for the style's own. */
const dotShapeOf = (p: Params) => sourceDotShape(programInfo(p.sourceProgram)?.data.dots, p.dots);

function variedFont(p: Params): FreeFont | undefined {
  if (!p.sourceProgram) return undefined;
  const authored = sourceProgram(p.sourceProgram), info = masterInfo(p.sourceProgram);
  if (authored && info) {
    const width = authored.width ? widthAt(p, authored.width.data.axis) : null, strokes = strokeWeights(p);
    const at = (weight: number) => {
      const baseline = authored.width && width !== null ? interpolateWidthMasters(authored.width, weight, width) : interpolateMasters(authored.masters, weight);
      return authored.features ? evaluateFeatureMasters(authored.features, { baseline, weight,
        width,
        values: { crossbar: p.crossbar, tail: p.tail, terminalLength: p.terminalLength } }) : baseline;
    };
    // under Contrast the letters' widths and heights come from two weights, point for point
    const across = at(strokes.x), featured = strokes.y === strokes.x ? across : mixAxes(across, at(strokes.y));
    // round or square dots replace the bound ones point for point, before proportions, edits and Size
    const dots = dotShapeOf(p);
    return dots && authored.components && authored.data.dots ? shapeSourceDots(featured, authored.components, authored.data.dots, dots) : featured;
  }
  const program = sourceMasters(p.sourceProgram);
  return program && info ? interpolateMasters(program, weightAt(p, info)) : sourceFont(p.sourceProgram);
}

/** Accented `ch` before spacing and finishing: its letter as evaluated (saved Points, per-letter values and component
    sizes included), any component its recipe omits taken off (ı's dot), and the authored mark for this weight and width
    set at the port on the letter as it stands, or as the source draws it where an edit took the port away. The mark is
    placed after proportions and posed with the letter, so it keeps its drawn size whatever the heights. */
function composedAccent(font: FreeFont, p: Params, ch: string): Glyph | null {
  const program = p.sourceProgram && sourceProgram(p.sourceProgram), info = masterInfo(p.sourceProgram);
  const marks = program?.data.marks && sourceMarks(program.data.marks), recipe = marks?.recipes.get(ch);
  const basis = masterBasisForEditing(p.sourceProgram);
  if (!program?.width || !marks || !recipe || !info || !basis) return null;
  const base = evaluated(font, p, recipe.base);
  if (!base?.drawn) return null;
  const letter = unspaceSourceDrawing(base.drawn), kept = omitMarkComponents(letter, marks, recipe);
  if (!recipe.mark) return asGlyph(ch, kept, base.M);
  const identity = { digest: basis.digest, glyph: recipe.base };
  let at: { x: number; y: number };
  if (formOf(p, recipe.base)) {
    // the ports are the original letter's: the mark takes its place there, moved as far as the form's ink stands from it
    const { [recipe.base]: _form, ...forms } = p.sourceForms, { [recipe.base]: _drawn, ...outlines } = p.outlines;
    const plain = evaluated(font, { ...p, sourceForms: forms, outlines }, recipe.base)?.drawn;
    if (!plain) return null;
    const original = unspaceSourceDrawing(plain), port = sourceMarkAnchor(recipe, original, original, identity);
    const a = cmdsBox(drawnCmds(original.contours)), b = cmdsBox(drawnCmds(kept.contours)), kind = recipe.mark.attachment;
    if (!a || !b) return null;
    const dx = kind === 'above' || kind === 'below' ? (b.x0 + b.x1 - a.x0 - a.x1) / 2 : b.x1 - a.x1;
    const dy = kind === 'above' || kind === 'side' ? b.y1 - a.y1 : b.y0 - a.y0;
    at = { x: port.x + dx, y: port.y + dy };
  } else {
    const nominal = p.outlines[recipe.base] ? evaluated(font, { ...p, outlines: {} }, recipe.base)?.drawn : letter;
    at = sourceMarkAnchor(recipe, letter, nominal ?? letter, identity);
  }
  const strokes = strokeWeights(p), width = widthAt(p, program.width.data.axis), dots = dotShapeOf(p);
  const drawnMark = mixDrawn(sourceMarkDrawing(marks, ch, strokes.x, width), sourceMarkDrawing(marks, ch, strokes.y, width));
  // a diaeresis or a dot above takes the shape the letters' dots do
  const mark = dots && program.data.dots?.marks.includes(ch)
    ? { ...drawnMark, contours: drawnMark.contours.map(contour => dotShapeContour(contour, dots, program.data.dots!)) } : drawnMark;
  // the mark is drawn about its port and posed as the letter is: only the pose's turn, lean and mirror reach it
  const [a, b, c, d] = base.M, turn = (x: number, y: number) => [a * x + c * y, b * x + d * y];
  const placed = mark.contours.map(contour => contour.map(n => {
    const [x, y] = turn(n.x, n.y), out: Node = { x: at.x + x, y: at.y + y };
    if (n.ix !== undefined && n.iy !== undefined) { const [ix, iy] = turn(n.ix, n.iy); out.ix = at.x + ix; out.iy = at.y + iy; }
    if (n.ox !== undefined && n.oy !== undefined) { const [ox, oy] = turn(n.ox, n.oy); out.ox = at.x + ox; out.oy = at.y + oy; }
    return out;
  }));
  return asGlyph(ch, { adv: kept.adv + mark.adv, contours: [...kept.contours, ...placed] }, base.M);
}

function asGlyph(ch: string, drawn: Drawn, M: Mat, editable = false): Glyph {
  const cmds = drawnCmds(drawn.contours), box = cmdsBox(cmds) ?? { x0: 0, x1: 0, y0: 0, y1: 0 };
  return { ch, ...blankParts(), strokes: [{ part: 'drawn', cmds, curved: true }],
    bodyW: box.x1 - box.x0, lsb: box.x0, rsb: drawn.adv - box.x1, adv: drawn.adv,
    M, drawn, ...(editable ? { editable: drawn } : {}), cmds, d: cmdsToD(cmds) };
}

/** A source still loading draws nothing. */
const NOTHING = { glyph: () => null, accentBase: () => null, accent: () => null };

export function sourceInstance(p: Params, fallback: Metrics, parentMonoCell?: number): SourceInstance | null {
  const ref = p.sourceProgram;
  if (!ref) return null;
  for (const baseline of designSourceDependencies(p)) {
    if (!sourceReady(baseline)) return { m: fallback, status: { ref: baseline, state: 'missing', missingCharacters: [] }, ...NOTHING };
  }
  const font = variedFont(p);
  if (!font) return { m: fallback, status: { ref, state: 'missing', missingCharacters: [] }, ...NOTHING };
  const base = { ...DEFAULTS, ...p.freeAt }, sy = axis(p.height, DEFAULTS.height, 0.78, 1.28);
  const lower = shape(font, p, 'x'), xh = lower.y[2]?.[1] ?? font.xh * sy;
  let mono: SourceMonoPlan | null = null;
  if (programInfo(ref)?.data.spacing && p.mono !== 0) {
    let cell = parentMonoCell;
    if (cell === undefined) {
      cell = Math.max(20, font.space * lower.xScale);
      for (const ch of ALL_CHARS) {
        const form = formOf(p, ch), original = form ? formDrawing(form, p) : font.glyphs[ch];
        if (original) cell = Math.max(cell, pose(font, original, p, ch, !!form).adv);
      }
    }
    mono = { cell, amount: p.mono };
  }
  const policy = programInfo(ref)?.data.finish;
  const finish = policy ? compileSourceFinish(policy, p, { capHeight: font.cap * sy }) : null;
  const spaceExtension = mono && finish?.kind === 'shadow' ? finish.dx * mono.amount : 0;
  const bounds = finish ? sourceFinishBounds(finish) : { above: 0, below: 0 };
  let componentRise = 0, componentFall = 0;
  const components = sourceProgram(ref)?.components;
  if (components) for (const ch of new Set(components.data.glyphs.map(entry => entry.glyph))) {
    const own = p.glyphs[ch], values = own ? { ...p, ...own, glyphs: {} } : p;
    if (values.dotSize === (values.freeAt.dotSize ?? DEFAULTS.dotSize)) continue;
    const current = own ? variedFont(values) ?? font : font, original = current.glyphs[ch];
    if (original) {
      const plan = componentPlanFor(original, values, ch, shape(current, values, ch));
      componentRise = Math.max(componentRise, plan?.rise ?? 0);
      componentFall = Math.max(componentFall, plan?.fall ?? 0);
    }
  }
  if (policy) {
    for (const own of Object.values(p.glyphs)) {
      const ownBounds = sourceFinishBounds(compileSourceFinish(policy, { ...p, ...own }, { capHeight: font.cap * sy }));
      bounds.above = Math.max(bounds.above, ownBounds.above);
      bounds.below = Math.max(bounds.below, ownBounds.below);
    }
  }
  const m = metrics(resolve({ ...p, geoHuman: 0.5, softSharp: 0.5, classicFuture: 0.5, playfulFormal: 0.5 }));
  return {
    free: font, ...(mono ? { monoCell: mono.cell } : {}), status: { ref, state: 'ready', missingCharacters: [...ALL_CHARS].filter(ch => !font.glyphs[ch] && !p.outlines[ch]) },
    m: { ...m, cap: font.cap * sy, xh, asc: (lower.y[3]?.[1] ?? font.cap * sy) + componentRise + bounds.above,
      desc: lower.y[0][1] - componentFall - bounds.below, ws: lower.xScale, slant: Math.tan((p.slant - base.slant) * 20 * Math.PI / 180),
      space: sourceMonoAdvance(Math.max(20, font.space * lower.xScale + (p.wordSpacing - DEFAULTS.wordSpacing) * 520), mono) + spaceExtension },
    accentBase: ch => {
      const marks = programInfo(ref)?.data.marks;
      return (marks && sourceMarks(marks)?.recipes.get(ch)?.base) ?? null;
    },
    accent: ch => placed(composedAccent(font, p, ch)),
    glyph: ch => placed(evaluated(font, p, ch))
  };
  /** A letter or an accented one spaced (Mono) and finished as every glyph of the font is. */
  function placed(evaluatedGlyph: Glyph | null): Glyph | null {
    let glyph = evaluatedGlyph;
    if (glyph?.drawn && (mono || glyph.drawn.spacing)) {
      const drawn = spaceSourceDrawing(glyph.drawn, mono), shift = drawn.spacing?.shift ?? 0;
      if (drawn !== glyph.drawn || shift !== 0) {
        const M: Mat = [...glyph.M]; M[4] += shift;
        glyph = asGlyph(glyph.ch, drawn, M, !!glyph.editable);
      }
    }
    const finished = glyph && finish ? finishSourceGlyph(glyph, finish) : glyph;
    return finished && !finished.cmds.length && spaceExtension ? { ...finished, adv: finished.adv + spaceExtension, rsb: finished.rsb + spaceExtension } : finished;
  }
}
