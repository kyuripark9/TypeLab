/* Fit pinned upstream alternate letters to each style's own drawings and publish them as letter forms. --check
   verifies the published forms, and that the candidate still compiles to them where it is present; --style Compass,Kernel
   publishes only those families' forms, from a candidate extracted for them alone. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packNode, unpackNode, type PackedNode } from '../../shared/engine/free';
import { cmdsBox, signedArea, subCubic, toPolys } from '../../shared/engine/geom';
import { drawnCmds, type Drawn, type Node } from '../../shared/engine/outline';
import { decodeGlyphForm, parseGlyphForm, type GlyphFormData } from '../../shared/source/forms';
import { decodeWeightMasters, parseWeightMasters, type MasterProvenance } from '../../shared/source/masters';
import type { MasterSourceRef } from '../../shared/source/model';
import { PROGRAM_REVISIONS } from '../../shared/source/program-catalog';
import type { WidthMasterRef } from '../../shared/source/program';
import { decodeWidthMasters, interpolateWidthMasters, parseWidthMasters } from '../../shared/source/width-masters';
import { LOCAL_WIDTH_RECIPES } from './build-local-widths';
import { PUBLISHED_FORMS, type FormRecipe } from './form-recipes';
import { COTTON_WIDTH, fitWidth, widthCurve, widthField, widthFitError, widthMap, widthNodes, type LocalWidthRecipe } from './local-width-masters';

const root = fileURLToPath(new URL('../..', import.meta.url)), check = process.argv.includes('--check');
const styleArg = process.argv.indexOf('--style'), only = styleArg < 0 ? null : process.argv[styleArg + 1]?.split(',') ?? [];
const candidateFile = process.argv.slice(2).find((arg, i, all) => !arg.startsWith('--') && all[i - 1] !== '--style') ?? resolve(root, '.audit/forms/alternates.json');
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function readAsset(directory: string, digest: string): unknown {
  const bytes = readFileSync(resolve(root, 'fonts', directory, digest + '.json'), 'utf8');
  if (hash(bytes) !== digest) throw Error(`Asset integrity check failed: ${directory}/${digest}`);
  return JSON.parse(bytes);
}

interface Box { x0: number; y0: number; x1: number; y1: number }
interface UpstreamCell { weight: number; width: number; cap: number; xh: number; space: number;
  original: { advance: number; contours: PackedNode[][] }; drawing: { advance: number; contours: PackedNode[][] } }
interface CandidateForm { recipe: FormRecipe; target: { fontId: string; base: MasterSourceRef; width: WidthMasterRef | null };
  cells: UpstreamCell[]; provenance: MasterProvenance[] }
interface Upstream { original: Box; originalAdvance: number; drawing: Drawn; cap: number; xh: number }

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const unpack = (contours: PackedNode[][]): Node[][] => contours.map(c => c.map(n => {
  const { s: _, ...node } = unpackNode(n); return node;
}));
const boxOf = (contours: Node[][]): Box => {
  const box = cmdsBox(drawnCmds(contours));
  if (!box || box.x1 <= box.x0 || box.y1 <= box.y0) throw Error('A letter form needs nonempty ink');
  return box;
};
function mapNodes(d: Drawn, x: (v: number) => number, y: (v: number) => number): Drawn {
  return { adv: d.adv, contours: d.contours.map(c => c.map(n => ({ x: x(n.x), y: y(n.y),
    ...(n.ix === undefined ? {} : { ix: x(n.ix), iy: y(n.iy!) }), ...(n.ox === undefined ? {} : { ox: x(n.ox), oy: y(n.oy!) }) }))) };
}
/** A contour run the other way round, each node's handles swapped. */
const reversed = (c: Node[]): Node[] => [c[0], ...c.slice(1).reverse()].map(n => {
  const out: Node = { x: n.x, y: n.y };
  if (n.ox !== undefined) { out.ix = n.ox; out.iy = n.oy; }
  if (n.ix !== undefined) { out.ox = n.ix; out.oy = n.iy; }
  return out;
});
const largestArea = (contours: Node[][]) => toPolys(drawnCmds(contours)).map(signedArea).reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0);

/** The upstream drawing at one of the style's knots: an exact native cell, or two bracketing static weights mixed. */
function upstreamAt(cells: UpstreamCell[], weight: number, width: number): Upstream | null {
  const column = cells.filter(c => near(c.width, width)).sort((a, b) => a.weight - b.weight);
  const at = (c: UpstreamCell): Upstream => {
    const original = unpack(c.original.contours);
    return { original: boxOf(original), originalAdvance: c.original.advance, cap: c.cap, xh: c.xh,
      drawing: { adv: c.drawing.advance, contours: unpack(c.drawing.contours) } };
  };
  const exact = column.find(c => near(c.weight, weight));
  if (exact) return at(exact);
  const upper = column.findIndex(c => c.weight > weight);
  if (upper <= 0) return null;
  const a = at(column[upper - 1]), b = at(column[upper]), t = (weight - column[upper - 1].weight) / (column[upper].weight - column[upper - 1].weight);
  const mix = (p: number | undefined, q: number | undefined) => p === undefined || q === undefined ? undefined : lerp(p, q, t);
  return { cap: lerp(a.cap, b.cap, t), xh: lerp(a.xh, b.xh, t), originalAdvance: lerp(a.originalAdvance, b.originalAdvance, t),
    original: { x0: lerp(a.original.x0, b.original.x0, t), y0: lerp(a.original.y0, b.original.y0, t), x1: lerp(a.original.x1, b.original.x1, t), y1: lerp(a.original.y1, b.original.y1, t) },
    drawing: { adv: lerp(a.drawing.adv, b.drawing.adv, t), contours: a.drawing.contours.map((c, ci) => c.map((n, ni) => {
      const m = b.drawing.contours[ci][ni];
      return { x: lerp(n.x, m.x, t), y: lerp(n.y, m.y, t), ...(n.ix === undefined ? {} : { ix: mix(n.ix, m.ix), iy: mix(n.iy, m.iy) }),
        ...(n.ox === undefined ? {} : { ox: mix(n.ox, m.ox), oy: mix(n.oy, m.oy) }) };
    })) } };
}

/** Heights the style's letter is drawn to, read against the upstream letter: its foot (a descender), the baseline, the
    x-height of a lowercase letter or the cap height of a capital, and the top of an ascender. Between two of them a
    height moves as the font's own proportions do; whatever more the style's letter takes (a longer ascender, say) goes
    into the middle of that stretch, where a stem runs straight, so ends, bowls and bars keep their drawn depth. */
function heightMap(ch: string, up: Upstream, ownBox: Box, own: { cap: number; xh: number }): (y: number) => number {
  const lower = ch !== ch.toUpperCase(), line = lower ? [up.xh, own.xh] : [up.cap, own.cap];
  const scale = line[1] / line[0], knots: [number, number][] = [[0, 0], line as [number, number]];
  if (up.original.y0 < -.05 * up.cap) knots.unshift([up.original.y0, ownBox.y0]);
  if (lower && up.original.y1 > up.xh + .1 * up.cap) knots.push([up.original.y1, ownBox.y1]);
  return y => {
    let i = knots.findIndex(k => k[0] > y);
    if (i === -1) return knots[knots.length - 1][1] + (y - knots[knots.length - 1][0]) * scale;
    if (i === 0) return knots[0][1] + (y - knots[0][0]) * scale;
    const [a, b] = [knots[i - 1], knots[i]], plain = a[1] + (y - a[0]) * scale, more = b[1] - (a[1] + (b[0] - a[0]) * scale);
    if (Math.abs(more) < .02 * Math.abs(b[1] - a[1])) return a[1] + (y - a[0]) * (b[1] - a[1]) / (b[0] - a[0]);
    const t = (y - a[0]) / (b[0] - a[0]);
    return plain + more * Math.min(1, Math.max(0, (t - .3) / .4));
  };
}

/** The upstream alternate set as the style draws the paired original letter there: across from its ink and spacing, and
    up through its heights. */
function calibrated(ch: string, up: Upstream, own: Drawn, ownFont: { cap: number; xh: number }): Drawn {
  const ownBox = boxOf(own.contours), ax = (ownBox.x1 - ownBox.x0) / (up.original.x1 - up.original.x0), bx = ownBox.x0 - up.original.x0 * ax;
  const mapped = mapNodes(up.drawing, x => ax * x + bx, heightMap(ch, up, ownBox, ownFont));
  return { ...mapped, adv: own.adv + (up.drawing.adv - up.originalAdvance) * ax };
}

function recipeFor(style: string, widths: number[]): LocalWidthRecipe {
  const local = LOCAL_WIDTH_RECIPES.find(r => r.style === style) ?? (style === 'Cotton' ? COTTON_WIDTH : null);
  return local ?? { ...COTTON_WIDTH, style, widths: [...new Set([100, ...widths])].sort((a, b) => a - b), minDerivative: .35, maxCurveError: .015 };
}

function author(form: CandidateForm): GlyphFormData {
  const { recipe } = form, ch = recipe.glyph;
  const program = PROGRAM_REVISIONS.findLast(p => p.ref.fontId === form.target.fontId)?.data;
  if (!program?.width || program.base.digest !== form.target.base.digest || program.width.digest !== form.target.width?.digest) {
    throw Error(`${recipe.style} ${ch}: the candidate was extracted for other weight or width masters; extract it again`);
  }
  const baseData = parseWeightMasters(readAsset('masters', program.base.digest)), base = decodeWeightMasters(baseData);
  const widths = decodeWidthMasters(parseWidthMasters(readAsset('widths', program.width.digest), { ref: program.base, masters: base }), base);
  const axis = widths.data.axis, columns = widths.columns.map(c => c.width), weights = base.masters.map(m => m.weight);
  const ownFont = (weight: number, width: number) => interpolateWidthMasters(widths, weight, width);
  const native = (width: number) => form.cells.some(c => near(c.width, width));
  const local = columns.filter(w => !native(w)), widthRecipe = recipeFor(recipe.style, local);
  if (!native(axis.neutral)) throw Error(`${recipe.style} ${ch}: no native drawing at the neutral width`);

  // native cells, the neutral column first, then each one the upstream font draws
  const cells = new Map<string, Drawn>(), key = (weight: number, width: number) => `${weight}:${width}`;
  let reverse: boolean | null = null;
  for (const width of columns.filter(native)) for (const weight of weights) {
    const up = upstreamAt(form.cells, weight, width);
    if (!up) throw Error(`${recipe.style} ${ch}: no upstream drawing at weight ${weight}, width ${width}`);
    const font = ownFont(weight, width), drawing = calibrated(ch, up, font.glyphs[ch], font);
    reverse ??= Math.sign(largestArea(drawing.contours)) !== Math.sign(largestArea(font.glyphs[ch].contours));
    cells.set(key(weight, width), reverse ? { ...drawing, contours: drawing.contours.map(reversed) } : drawing);
  }

  // widths the upstream font doesn't draw: the alternate's own ink and space mapped across as the style's own widths
  // are, as far as its paired letter moves there
  const maps = new Map<string, ReturnType<typeof widthMap>>();
  for (const width of local) for (const weight of weights) {
    const reference = cells.get(key(weight, axis.neutral))!, font = ownFont(weight, width), neutral = ownFont(weight, axis.neutral);
    const ratio = (b: Box) => b.x1 - b.x0, change = ratio(boxOf(font.glyphs[ch].contours)) / ratio(boxOf(neutral.glyphs[ch].contours));
    const field = widthField(reference, neutral.cap, widthRecipe);
    maps.set(key(weight, width), widthMap(reference, 100 * change, field.at, false, [], widthRecipe.preserveAdvanceRatio));
  }
  // one set of cuts for every cell, so the form's drawings stay point for point alike: each mapped curve split until it
  // follows its field within the recipe's tolerance, every other cell cut exactly there
  const reference = cells.get(key(weights[0], axis.neutral))!;
  const intervals = reference.contours.map((contour, ci) => contour.flatMap((_node, si) => {
    const cuts: { segment: number; t0: number; t1: number }[] = [];
    function divide(t0: number, t1: number, depth: number): void {
      let miss = 0;
      for (const width of local) for (const weight of weights) {
        const map = maps.get(key(weight, width))!.contours[ci];
        const part = subCubic(widthCurve(cells.get(key(weight, axis.neutral))!.contours[ci], si), t0, t1);
        miss = Math.max(miss, widthFitError(part, fitWidth(part, map), map));
      }
      if (miss > widthRecipe.maxCurveError && depth < 12) { const mid = (t0 + t1) / 2; divide(t0, mid, depth + 1); divide(mid, t1, depth + 1); }
      else if (miss > widthRecipe.maxCurveError) throw Error(`${recipe.style} ${ch}: cannot fit the width field within ${widthRecipe.maxCurveError}`);
      else cuts.push({ segment: si, t0, t1 });
    }
    divide(0, 1, 0); return cuts;
  }));
  const cut = (d: Drawn, map?: ReturnType<typeof widthMap>): Drawn => ({ adv: map?.advance ?? d.adv, contours: intervals.map((ranges, ci) => widthNodes(ranges.map(range => {
    const part = subCubic(widthCurve(d.contours[ci], range.segment), range.t0, range.t1);
    return map ? fitWidth(part, map.contours[ci]) : part;
  }))) });
  // a thousandth of a unit is far below anything drawn, and keeps a form's file about half the size
  const round = (v: number | null) => v === null ? v : Math.round(v * 1000) / 1000 || 0;
  const pack = (d: Drawn) => [round(d.adv), d.contours.map(c => c.map(n => packNode(n).map(round) as PackedNode))] as [number, PackedNode[][]];
  const nativeWidths = columns.filter(native), localNote = local.length
    ? [`Widths ${local.join(', ')} are local: the alternate's own ink and space mapped across by the ${widthRecipe.style} width field, as far as the paired original letter widens or narrows there.`] : [];
  return parseGlyphForm({
    format: 'glyph-form-masters-v1', base: program.base, width: program.width, glyph: ch,
    columns: columns.map(width => ({ width, masters: weights.map(weight => ({ weight,
      drawing: pack(local.includes(width) ? cut(cells.get(key(weight, axis.neutral))!, maps.get(key(weight, width))) : cut(cells.get(key(weight, width))!)) })) })),
    provenance: form.provenance,
    notes: [`${recipe.style} ${ch} ${recipe.feature}: the upstream alternate, set across from the paired original letter's ink and spacing in each cell and up through its heights; widths ${nativeWidths.join(', ')} native.`,
      ...localNote,
      ...(weights.some(weight => !form.cells.some(c => near(c.weight, weight))) ? ['Weights between two static upstream fonts mix their compatible drawings.'] : []),
      'Common exact cuts keep every cell point for point compatible; this form never interpolates with the original letter.']
  }, { ref: program.base, masters: base }, { ref: program.width, masters: widths });
}

function write(file: string, bytes: string) {
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== bytes) throw Error(`Generated asset needs updating: ${file}`);
  } else writeFileSync(file, bytes);
}

export interface FormManifestEntry { ref: { kind: 'glyph-form-masters-v1'; digest: string; fontId: string };
  base: MasterSourceRef; width: WidthMasterRef; glyph: string; id: string; label: string }
const dir = resolve(root, 'fonts/forms'), manifestFile = resolve(dir, 'manifest.json');
const manifest: FormManifestEntry[] = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : [];
if (!check) mkdirSync(dir, { recursive: true });
if (existsSync(candidateFile)) {
  const candidate: { forms: CandidateForm[] } = JSON.parse(readFileSync(candidateFile, 'utf8'));
  // --style: only these families' forms, from a candidate extracted for them alone
  for (const published of PUBLISHED_FORMS.filter(form => !only || only.includes(form.style))) {
    const form = candidate.forms.find(f => f.recipe.style === published.style && f.recipe.glyph === published.glyph && f.recipe.id === published.id);
    if (!form) throw Error(`${published.style} ${published.glyph} ${published.id}: missing from the candidate`);
    const data = author(form), bytes = JSON.stringify(data) + '\n', digest = hash(bytes), file = resolve(dir, digest + '.json');
    if (existsSync(file) && readFileSync(file, 'utf8') !== bytes) throw Error(`Immutable asset changed: ${digest}`);
    if (!existsSync(file)) write(file, bytes);
    const entry: FormManifestEntry = { ref: { kind: 'glyph-form-masters-v1', digest, fontId: data.base.fontId }, base: data.base, width: data.width,
      glyph: data.glyph, id: published.id, label: published.label };
    const at = manifest.findIndex(e => e.ref.digest === digest);
    if (at === -1) { if (check) throw Error(`Form manifest lacks ${digest}`); manifest.push(entry); }
    else if (JSON.stringify(manifest[at]) !== JSON.stringify(entry)) { if (check) throw Error(`Form manifest entry changed: ${digest}`); manifest[at] = entry; }
  }
}
// every published form still parses against its bases
for (const entry of manifest) {
  const data = readAsset('forms', entry.ref.digest), base = parseWeightMasters(readAsset('masters', entry.base.digest)), masters = decodeWeightMasters(base);
  const widths = decodeWidthMasters(parseWidthMasters(readAsset('widths', entry.width.digest), { ref: entry.base, masters }), masters);
  decodeGlyphForm(parseGlyphForm(data, { ref: entry.base, masters }, { ref: entry.width, masters: widths }));
}
write(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify({ forms: manifest.length, check }) + '\n');
