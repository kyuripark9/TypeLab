/* Compile explicit component identities against pinned bases; source geometry is never rewritten. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodedAdvance } from '../../shared/engine/spacing';
import { componentInkBounds, decodeSourceComponents, parseSourceComponents, type ComponentBinding } from '../../shared/source/components';
import { sourceDot } from '../../shared/source/features';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
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
if (!inputFile || !output || args.some(arg => arg.startsWith('--') && !['--input', '--out', '--check'].includes(arg))) {
  throw new Error('Use --input pinned-bases.json --out fonts/components [--check]');
}
function read(directory: string, digest: string): unknown {
  const bytes = readFileSync(resolve(root, 'fonts', directory, `${digest}.json`), 'utf8');
  if (hash(bytes) !== digest) throw new Error(`Immutable source changed: ${directory}/${digest}`);
  return JSON.parse(bytes);
}
const input: unknown = JSON.parse(readFileSync(resolve(inputFile), 'utf8'));
if (!Array.isArray(input) || !input.length) throw new TypeError('Component input must list explicit base/width pairs');
const inputs = input.map(entry => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !('base' in entry) || !('width' in entry)
    || Object.keys(entry).some(key => key !== 'base' && key !== 'width')) throw new TypeError('Invalid component base/width pair');
  return parseSourceProgram({ format: 'source-program-v1', base: entry.base, width: entry.width, features: null });
});
if (new Set(inputs.map(input => input.base.fontId)).size !== inputs.length) throw new TypeError('Compile one component revision per family');
const staged: { ref: SourceComponentRef; bytes: string; metadata: unknown }[] = [];
for (const input of inputs) {
  const data = parseWeightMasters(read('masters', input.base.digest)), masters = decodeWeightMasters(data);
  const basis = { ref: input.base, masters };
  const width = input.width ? { ref: input.width,
    masters: decodeWidthMasters(parseWidthMasters(read('widths', input.width.digest), basis), masters) } : undefined;
  const knots = [...masters.masters, ...(width?.masters.columns.flatMap(column => column.program.masters) ?? [])];
  const evidence: { glyph: string; id: string; min: number; max: number; normalSpacingCollisionScale: number }[] = [];
  const glyphs: ComponentBinding[] = [];
  for (const glyph of ['i', 'j']) {
    const reviewed = sourceDot(data.source.digest, glyph);
    const contours = reviewed?.contours ?? (input.base.fontId === 'Serenade:400' && glyph === 'j' ? [0] : null);
    const first = contours?.[0];
    if (!contours || first === undefined) throw new Error(`No explicit component identity for ${input.base.fontId}/${glyph}`);
    let limit = Infinity;
    for (const knot of knots) {
      const drawing = knot.font.glyphs[glyph];
      if (!drawing || contours.some(ci => !drawing.contours[ci])) throw new Error(`Component contour missing: ${input.base.fontId}/${glyph}`);
      const bounds = componentInkBounds(contours.map(ci => drawing.contours[ci])), span = bounds.x1 - bounds.x0;
      for (const scale of width ? [1] : [.65, 1]) limit = Math.min(limit, encodedAdvance(drawing.adv * scale, 0) / (span * scale));
    }
    if (!(limit > 1)) throw new Error(`Original repeated dots already overlap at a stored knot: ${input.base.fontId}/${glyph}`);
    const cap = input.base.fontId === 'Boardwalk:400' ? 1.1 : input.base.fontId === 'Orbital:600' ? 1.2 : 1.35;
    const max = Math.floor(Math.min(cap, 1 + .8 * (limit - 1)) * 1e6) / 1e6;
    const binding: ComponentBinding = { glyph, id: 'tittle', contours: [first, ...contours.slice(1)],
      size: { min: .7, max, anchor: 'ink-bottom-center' } };
    glyphs.push(binding);
    evidence.push({ glyph, id: binding.id, min: binding.size.min, max, normalSpacingCollisionScale: limit });
  }
  const component = parseSourceComponents({ format: 'source-components-v1', base: input.base, width: input.width,
    stage: 'after-proportions-before-pose-v1', glyphs,
    notes: ['Explicit i/j tittle contours; Serenade j uses its separate contour despite overlapping body/dot height ranges.',
      'Size keeps the component bottom-center, letter body, advance, and placement frame fixed. Original is an exact no-op.',
      'Large endpoints retain at least 20% of the original repeated-dot horizontal gap at stored weight/width knots and normal spacing.',
      'The knot gap calculation does not certify intermediate geometry, optical quality, arbitrary spacing, or edited contours. Full validation is deferred.'] });
  decodeSourceComponents(component, basis, width);
  const bytes = JSON.stringify(component) + '\n';
  const ref: SourceComponentRef = { kind: 'source-components-v1', digest: hash(bytes), fontId: input.base.fontId };
  staged.push({ ref, bytes, metadata: { ref, base: input.base, width: input.width, glyphs: evidence } });
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
process.stdout.write(JSON.stringify({ families: staged.length, components: staged.length * 2, output: directory, check }) + '\n');
