/* Compile explicit component identities against pinned bases; source geometry is never rewritten. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodedAdvance } from '../../shared/engine/spacing';
import { componentInkBounds, decodeSourceComponents, parseSourceComponents, type ComponentBinding } from '../../shared/source/components';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
import { parseSourceRef, type OutlineSourceRef } from '../../shared/source/model';
import { parseSourceProgram, type SourceComponentRef } from '../../shared/source/program';
import { decodeWidthMasters, parseWidthMasters } from '../../shared/source/width-masters';

const root = fileURLToPath(new URL('../..', import.meta.url));
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2), check = args.includes('--check');
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const inputFile = option('--input'), output = option('--out');
if (!inputFile || !output || args.some(arg => arg.startsWith('--') && !['--input', '--out', '--bindings', '--check'].includes(arg))) {
  throw new Error('Use --input pinned-bases.json --out fonts/components [--bindings recipe.json] [--check]');
}
function read(directory: string, digest: string): unknown {
  const bytes = readFileSync(resolve(root, 'fonts', directory, `${digest}.json`), 'utf8');
  if (hash(bytes) !== digest) throw new Error(`Immutable source changed: ${directory}/${digest}`);
  return JSON.parse(bytes);
}
const recipe: unknown = JSON.parse(readFileSync(option('--bindings') ?? resolve(root, 'tools/authored/component-bindings.json'), 'utf8'));
if (!recipe || typeof recipe !== 'object' || !('format' in recipe) || recipe.format !== 'component-bindings-v1'
  || !('fonts' in recipe) || !Array.isArray(recipe.fonts)) throw new TypeError('Invalid source component binding recipe');
const recipes = new Map<string, { source: OutlineSourceRef; bindings: unknown }>();
for (const entry of recipe.fonts) {
  if (!entry || typeof entry !== 'object' || !('source' in entry) || !('bindings' in entry)) throw new TypeError('Invalid component recipe entry');
  const source = parseSourceRef(entry.source);
  if (source?.kind !== 'outline-v1' || recipes.has(source.fontId)) throw new TypeError('Component recipes require unique original source references');
  recipes.set(source.fontId, { source, bindings: entry.bindings });
}
type Box = ReturnType<typeof componentInkBounds>;
interface Piece { box: Box; anchor: { x: number; y: number } | null }
/** A separating axis gives a conservative common Size limit for both pieces. */
function separationLimit(a: Piece, b: Piece): number | null {
  const limits: number[] = [];
  const gap = (distance: number, travel: number) => { if (distance > 0) limits.push(travel > 0 ? 1 + distance / travel : Infinity); };
  gap(b.box.x0 - a.box.x1, (a.anchor ? a.box.x1 - a.anchor.x : 0) + (b.anchor ? b.anchor.x - b.box.x0 : 0));
  gap(a.box.x0 - b.box.x1, (b.anchor ? b.box.x1 - b.anchor.x : 0) + (a.anchor ? a.anchor.x - a.box.x0 : 0));
  gap(b.box.y0 - a.box.y1, (a.anchor ? a.box.y1 - a.anchor.y : 0) + (b.anchor ? b.anchor.y - b.box.y0 : 0));
  gap(a.box.y0 - b.box.y1, (b.anchor ? b.box.y1 - b.anchor.y : 0) + (a.anchor ? a.anchor.y - a.box.y0 : 0));
  return limits.length ? Math.max(...limits) : null;
}
function shifted(piece: Piece, dx: number): Piece {
  return { box: { ...piece.box, x0: piece.box.x0 + dx, x1: piece.box.x1 + dx },
    anchor: piece.anchor ? { ...piece.anchor, x: piece.anchor.x + dx } : null };
}
const input: unknown = JSON.parse(readFileSync(resolve(inputFile), 'utf8'));
if (!Array.isArray(input) || !input.length) throw new TypeError('Component input must list explicit base/width pairs');
const inputs = input.map(entry => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !('base' in entry) || !('width' in entry)
    || Object.keys(entry).some(key => key !== 'base' && key !== 'width')) throw new TypeError('Invalid component base/width pair');
  return parseSourceProgram({ format: 'source-program-v1', base: entry.base, width: entry.width, features: null });
});
if (new Set(inputs.map(input => input.base.fontId)).size !== inputs.length) throw new TypeError('Compile one component revision per family');
const staged: { ref: SourceComponentRef; bytes: string; metadata: unknown; count: number; glyphCount: number }[] = [];
for (const input of inputs) {
  const data = parseWeightMasters(read('masters', input.base.digest)), masters = decodeWeightMasters(data);
  const basis = { ref: input.base, masters };
  const width = input.width ? { ref: input.width,
    masters: decodeWidthMasters(parseWidthMasters(read('widths', input.width.digest), basis), masters) } : undefined;
  const knots = [...masters.masters, ...(width?.masters.columns.flatMap(column => column.program.masters) ?? [])];
  const recipe = recipes.get(input.base.fontId);
  if (!recipe || recipe.source.digest !== data.source.digest || recipe.source.fontId !== data.source.fontId) {
    throw new Error(`No explicit component recipe for ${input.base.fontId}'s original source`);
  }
  const template = parseSourceComponents({ format: 'source-components-v1', base: input.base, width: input.width,
    stage: 'after-proportions-before-pose-v1', glyphs: recipe.bindings, notes: [] });
  const evidence: { glyph: string; id: string; min: number; max: number; normalSpacingCollisionScale: number; separationCollisionScale: number | null }[] = [];
  const glyphs: ComponentBinding[] = [];
  for (const glyph of new Set(template.glyphs.map(binding => binding.glyph))) {
    const bindings = template.glyphs.filter(binding => binding.glyph === glyph), selected = new Set(bindings.flatMap(binding => binding.contours));
    let spacingLimit = Infinity, localLimit = Infinity;
    for (const knot of knots) {
      const drawing = knot.font.glyphs[glyph];
      if (!drawing || [...selected].some(ci => !drawing.contours[ci])) throw new Error(`Component contour missing: ${input.base.fontId}/${glyph}`);
      for (const scale of width ? [1] : [.65, 1]) {
        const boxAt = (contours: number[]): Box => {
          const box = componentInkBounds(contours.map(ci => drawing.contours[ci]));
          return { ...box, x0: box.x0 * scale, x1: box.x1 * scale };
        };
        const pieces: Piece[] = bindings.map(binding => {
          const box = boxAt(binding.contours);
          return { box, anchor: { x: (box.x0 + box.x1) / 2, y: binding.size.anchor === 'ink-center' ? (box.y0 + box.y1) / 2 : box.y0 } };
        });
        const body: Piece[] = drawing.contours.flatMap((_, ci) => selected.has(ci) ? [] : [{ box: boxAt([ci]), anchor: null }]);
        const step = encodedAdvance(drawing.adv * scale, 0);
        for (const first of pieces) for (const second of pieces) {
          const limit = separationLimit(first, shifted(second, step));
          if (limit === null) throw new Error(`Repeated components have no separating axis: ${input.base.fontId}/${glyph}`);
          spacingLimit = Math.min(spacingLimit, limit);
        }
        for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
          const limit = separationLimit(pieces[i], pieces[j]);
          if (limit === null) throw new Error(`Component groups need an explicit clearance recipe: ${input.base.fontId}/${glyph}`);
          localLimit = Math.min(localLimit, limit);
        }
        // Tittles retain their earlier range recipe; Serenade j has overlapping component/body boxes.
        if (bindings.every(binding => binding.size.anchor === 'ink-center')) for (const first of pieces) for (const second of body) {
          for (const offset of [-step, 0, step]) {
            const limit = separationLimit(first, shifted(second, offset));
            if (limit === null) throw new Error(`Dot/body boxes need an explicit clearance recipe: ${input.base.fontId}/${glyph} weight ${knot.weight}`);
            localLimit = Math.min(localLimit, limit);
          }
        }
      }
    }
    const cap = Math.min(...bindings.map(binding => binding.size.max));
    const max = Math.floor(Math.min(cap, 1 + .8 * (Math.min(spacingLimit, localLimit) - 1)) * 1e6) / 1e6;
    for (const binding of bindings) {
      glyphs.push({ ...binding, size: { ...binding.size, max } });
      evidence.push({ glyph, id: binding.id, min: binding.size.min, max, normalSpacingCollisionScale: spacingLimit,
        separationCollisionScale: Number.isFinite(localLimit) ? localLimit : null });
    }
  }
  const component = parseSourceComponents({ format: 'source-components-v1', base: input.base, width: input.width,
    stage: 'after-proportions-before-pose-v1', glyphs,
    notes: ['Explicit source-pinned contour identities cover i/j and detached punctuation dots. Semicolon comma tails, question bodies, and divide bars remain unselected.',
      'Tittles keep their bottom-center; each punctuation dot keeps its own ink center. Body, advance, placement, and exact Original geometry stay unchanged.',
      'Large endpoints retain at least 20% of a separating box gap at stored weight/width knots, including simultaneous punctuation-dot growth and repeated glyphs at normal spacing.',
      'Tittle/body boxes are not constrained: Serenade j has overlapping boxes despite detached ink. Its existing Size range is retained.',
      'The knot calculations do not certify intermediate geometry, optical quality, arbitrary spacing, or edited contours. Full validation is deferred.'] });
  decodeSourceComponents(component, basis, width);
  const bytes = JSON.stringify(component) + '\n';
  const ref: SourceComponentRef = { kind: 'source-components-v1', digest: hash(bytes), fontId: input.base.fontId };
  staged.push({ ref, bytes, metadata: { ref, base: input.base, width: input.width, glyphs: evidence }, count: glyphs.length,
    glyphCount: new Set(glyphs.map(binding => binding.glyph)).size });
}
const directory = resolve(output), manifestFile = resolve(directory, 'manifest.json');
const entries = new Map<string, unknown>();
if (existsSync(manifestFile)) {
  const previous: unknown = JSON.parse(readFileSync(manifestFile, 'utf8'));
  if (!Array.isArray(previous)) throw new TypeError('Invalid source component manifest');
  for (const entry of previous) {
    if (!entry || typeof entry !== 'object' || !('ref' in entry) || !('base' in entry) || !('width' in entry)) throw new TypeError('Invalid component manifest entry');
    const parsed = parseSourceProgram({ format: 'source-program-v1', base: entry.base, width: entry.width, features: null, components: entry.ref });
    if (!parsed.components) throw new TypeError('Missing component manifest reference');
    entries.set(parsed.components.digest, entry);
  }
}
for (const candidate of staged) {
  const file = resolve(directory, `${candidate.ref.digest}.json`);
  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') !== candidate.bytes) throw new Error(`Immutable component asset changed: ${candidate.ref.digest}`);
  } else if (check) throw new Error(`Component asset has not been generated: ${candidate.ref.digest}`);
  entries.set(candidate.ref.digest, candidate.metadata);
}
const manifest = JSON.stringify([...entries.values()], null, 2) + '\n';
if (check) {
  if (!existsSync(manifestFile) || readFileSync(manifestFile, 'utf8') !== manifest) throw new Error('Component manifest needs regenerating');
} else {
  mkdirSync(directory, { recursive: true });
  for (const candidate of staged) {
    const file = resolve(directory, `${candidate.ref.digest}.json`);
    if (!existsSync(file)) writeFileSync(file, candidate.bytes, { flag: 'wx' });
  }
  writeFileSync(manifestFile, manifest);
}
process.stdout.write(JSON.stringify({ families: staged.length, components: staged.reduce((sum, entry) => sum + entry.count, 0),
  glyphs: staged.reduce((sum, entry) => sum + entry.glyphCount, 0), output: directory, check }) + '\n');
