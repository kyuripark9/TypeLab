/* Each style's round and square dots: which shapes differ enough from its own dots to offer, which dots stand on the
   baseline, which accents' marks are made of dots, and the square's corner, written to fonts/dots/manifest.json for
   build-programs --dots. --check verifies the manifest; --report prints the measurements. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCENTED } from '../../shared/engine/accents';
import type { FreeFont } from '../../shared/engine/free';
import { cmdsBox } from '../../shared/engine/geom';
import { drawnCmds, segment, type Node } from '../../shared/engine/outline';
import { componentInkBounds, decodeSourceComponents, parseSourceComponents } from '../../shared/source/components';
import { dotShapeContour, parseSourceDots, DOT_SHAPES, ROUNDISH, type DotShape, type SourceDotPolicy } from '../../shared/source/dots';
import { masterInfo } from '../../shared/source/master-catalog';
import { decodeSourceMarks, parseSourceMarks, sourceMarkDrawing } from '../../shared/source/marks';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
import { parseSourceProgram } from '../../shared/source/program';
import { PROGRAM_REVISIONS } from '../../shared/source/program-catalog';
import { decodeWidthMasters, interpolateWidthMasters, parseWidthMasters } from '../../shared/source/width-masters';

/** A square dot's corner, as a share of half its shorter side, for the styles whose own corners are soft; chosen by eye
    against each style's letters. Every other style's square is sharp. */
export const DOT_CORNERS: Readonly<Record<string, number>> = {
  'Cotton:300': 0.5, 'Gumdrop:700': 0.25, 'Funnies:400': 0.5, 'Orbital:600': 0.45, 'Kernel:500': 0.25, 'Dispatch:400': 0.35
};
/** Styles whose own dots already are a shape, by eye, where the measure falls just short: Dispatch's rounded squares. */
export const OWN_SHAPES: Readonly<Record<string, DotShape>> = { 'Dispatch:400': 'square' };
/** A shape is offered unless the style's typical dot is already that shape to within this share of its size. */
const SAME = 0.04;
/** Accents whose whole mark is dots: the diaeresis and the dot above. */
const DOTTED_MARKS = [...ACCENTED].filter(ch => /[̇̈]/u.test(ch.normalize('NFD').slice(1)) && ch.normalize('NFD').length === 2).join('');

const root = fileURLToPath(new URL('../..', import.meta.url));
const check = process.argv.includes('--check'), report = process.argv.includes('--report');
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function readAsset(directory: string, digest: string): unknown {
  const bytes = readFileSync(resolve(root, 'fonts', directory, digest + '.json'), 'utf8');
  if (hash(bytes) !== digest) throw Error(`Asset integrity check failed: ${directory}/${digest}`);
  return JSON.parse(bytes);
}

/** Points along the contour, a few to each segment. */
function samples(contour: readonly Node[], each: number) {
  const out: { x: number; y: number }[] = [];
  contour.forEach((a, i) => {
    const b = contour[(i + 1) % contour.length], s = segment(a, b) ?? [a, a, b, b];
    for (let k = 0; k < each; k++) {
      const t = k / each, u = 1 - t;
      out.push({ x: u * u * u * s[0].x + 3 * u * u * t * s[1].x + 3 * u * t * t * s[2].x + t * t * t * s[3].x,
        y: u * u * u * s[0].y + 3 * u * u * t * s[1].y + 3 * u * t * t * s[2].y + t * t * t * s[3].y });
    }
  });
  return out;
}
/** How far apart two outlines run at most (both ways round), over the dot's size. */
function apart(a: readonly Node[], b: readonly Node[]): number {
  const pa = samples(a, Math.ceil(160 / a.length)), pb = samples(b, Math.ceil(160 / b.length));
  const far = (from: typeof pa, to: typeof pa) => Math.max(...from.map(p => Math.min(...to.map((q, i) => {
    const r = to[(i + 1) % to.length], dx = r.x - q.x, dy = r.y - q.y, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - q.x) * dx + (p.y - q.y) * dy) / len)) : 0;
    return Math.hypot(p.x - q.x - t * dx, p.y - q.y - t * dy);
  }))));
  const box = componentInkBounds([a]);
  return Math.max(far(pa, pb), far(pb, pa)) / Math.sqrt((box.x1 - box.x0) * (box.y1 - box.y0));
}
/** Where a line at height `y` crosses the contour, left to right. */
function crossings(contour: readonly Node[], y: number): number[] {
  const pts = samples(contour, 64), xs: number[] = [];
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    if ((p.y - y) * (q.y - y) < 0) xs.push(p.x + (q.x - p.x) * (y - p.y) / (q.y - p.y));
  });
  return xs.sort((a, b) => a - b);
}
/** How far the style's letters lean, in degrees to the right: the lean of the exclamation mark's stroke, the one letter
    every style draws as a single stroke, between a third and five sixths of its height; under two degrees is upright. */
function lean(font: FreeFont): number {
  const contours = font.glyphs['!'].contours, tops = contours.map(c => Math.max(...c.map(n => n.y)));
  const body = contours[tops.indexOf(Math.max(...tops))], top = Math.max(...body.map(n => n.y)), foot = Math.min(...body.map(n => n.y));
  const at = (share: number) => { const xs = crossings(body, foot + (top - foot) * share); return (xs[0] + xs[xs.length - 1]) / 2; };
  const degrees = Math.atan2(at(5 / 6) - at(1 / 3), (top - foot) / 2) * 180 / Math.PI;
  return Math.abs(degrees) < 2 ? 0 : Math.round(degrees * 2) / 2;
}
/** Every contour of a mark looks like a dot: closed and compact, filling most of its box. */
function dotted(contours: readonly (readonly Node[])[]): boolean {
  return contours.length > 0 && contours.every(contour => {
    const box = componentInkBounds([contour]), w = box.x1 - box.x0, h = box.y1 - box.y0;
    const pts = samples(contour, 8);
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p.x * q.y - q.x * p.y; }
    return contour.length >= 4 && w > 0 && h > 0 && w / h > 0.4 && w / h < 2.5 && Math.abs(area / 2) / (w * h) > 0.6;
  });
}

const latest = new Map(PROGRAM_REVISIONS.map(entry => [entry.ref.fontId, entry]));
const manifest: { fontId: string; base: unknown; width: unknown; components: unknown; dots: SourceDotPolicy }[] = [];
for (const [fontId, entry] of latest) {
  const program = parseSourceProgram(readAsset('programs', entry.ref.digest));
  if (!program.width || !program.components) continue;
  const baseData = parseWeightMasters(readAsset('masters', program.base.digest)), base = decodeWeightMasters(baseData);
  const basis = { ref: program.base, masters: base };
  const width = { ref: program.width, masters: decodeWidthMasters(parseWidthMasters(readAsset('widths', program.width.digest), basis), base) };
  const components = decodeSourceComponents(parseSourceComponents(readAsset('components', program.components.digest)), basis, width);
  const marks = program.marks ? decodeSourceMarks(parseSourceMarks(readAsset('marks', program.marks.digest)), basis, width,
    { ref: program.components, components }) : null;
  const info = masterInfo(program.base)!, neutralWidth = width.masters.data.axis.neutral;
  const cells: { weight: number; width: number; font: FreeFont }[] = width.masters.columns.flatMap(column =>
    base.masters.map(master => ({ weight: master.weight, width: column.width, font: interpolateWidthMasters(width.masters, master.weight, column.width) })));
  const neutral = interpolateWidthMasters(width.masters, info.defaultWeight, neutralWidth);
  // a dot stands on the baseline where its foot is within a sixth of its height of it, at every weight and width
  const foot = (binding: typeof components.data.glyphs[number], font: FreeFont) => {
    const box = componentInkBounds(binding.contours.map(ci => font.glyphs[binding.glyph].contours[ci]));
    return -box.y0 / (box.y1 - box.y0);
  };
  const onBaseline = components.data.glyphs.filter(binding => cells.every(cell => Math.abs(foot(binding, cell.font)) < 1 / 6));
  const baseline = onBaseline.map(binding => `${binding.glyph}:${binding.id}`);
  // a round dot dips below it as far as the style's own round dots do, for their size; where none are round, twice as far
  // as the o does for its height, as a smaller round needs
  const roundish = (contour: readonly Node[]) => {
    const box = componentInkBounds([contour]), pts = samples(contour, 8);
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p.x * q.y - q.x * p.y; }
    return Math.abs(area / 2) / ((box.x1 - box.x0) * (box.y1 - box.y0)) < ROUNDISH;
  };
  const dips = onBaseline.flatMap(binding => cells.filter(cell => binding.contours.every(ci => roundish(cell.font.glyphs[binding.glyph].contours[ci])))
    .map(cell => foot(binding, cell.font))).sort((a, b) => a - b);
  const o = cmdsBox(drawnCmds(neutral.glyphs.o.contours))!, median = dips[Math.floor(dips.length / 2)] ?? 0;
  const overshoot = Math.round(Math.min(0.2, median > 0.01 ? median : 2 * Math.max(0, -o.y0) / (o.y1 - o.y0)) * 1e4) / 1e4;
  const corner = DOT_CORNERS[fontId] ?? 0, slant = lean(neutral);
  // each dot's furthest departure over the weights and widths; the style's typical dot decides, not one odd one
  const distance = Object.fromEntries(DOT_SHAPES.map(shape => {
    const each = components.data.glyphs.map(binding => Math.max(...cells.flatMap(cell => binding.contours.map(ci => {
      const own = cell.font.glyphs[binding.glyph].contours[ci];
      return apart(own, dotShapeContour(own, shape, { corner, overshoot, slant }, baseline.includes(`${binding.glyph}:${binding.id}`)));
    })))).sort((a, b) => a - b);
    return [shape, each[Math.floor(each.length / 2)]];
  })) as Record<DotShape, number>;
  const shapes = DOT_SHAPES.filter(shape => distance[shape] >= SAME && OWN_SHAPES[fontId] !== shape);
  const dottedMarks = marks ? [...DOTTED_MARKS].filter(ch => marks.recipes.get(ch)?.mark && marks.columns.every(column => column.masters.every(master =>
    dotted(sourceMarkDrawing(marks, ch, master.weight, column.width).contours)))).join('') : '';
  if (report) {
    console.log(`${fontId.padEnd(12)} round ${distance.round.toFixed(3)} square ${distance.square.toFixed(3)} offers ${shapes.join('+') || 'nothing'}`
      + ` | overshoot ${overshoot} | corner ${corner} | slant ${slant} | on baseline ${baseline.length} | dotted marks ${dottedMarks.length}/${DOTTED_MARKS.length}`);
  }
  const [first, ...rest] = shapes;
  if (!first) continue;
  const dots = parseSourceDots({ format: 'source-dots-v1', shapes: [first, ...rest], corner, overshoot, slant, baseline, marks: dottedMarks });
  manifest.push({ fontId, base: program.base, width: program.width, components: program.components, dots });
}
const bytes = JSON.stringify(manifest, null, 2) + '\n', file = resolve(root, 'fonts', 'dots', 'manifest.json');
if (check) {
  if (!existsSync(file) || readFileSync(file, 'utf8') !== bytes) throw Error(`Generated dot policies need updating: ${file}`);
} else if (!report) {
  mkdirSync(resolve(root, 'fonts', 'dots'), { recursive: true });
  writeFileSync(file, bytes);
}
