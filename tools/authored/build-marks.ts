/* Validate complete authored mark grids before publishing immutable assets. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeSourceComponents, parseSourceComponents } from '../../shared/source/components';
import { decodeSourceMarks, parseSourceMarks, type SourceMarkData } from '../../shared/source/marks';
import { decodeWeightMasters, parseWeightMasters } from '../../shared/source/masters';
import { decodeWidthMasters, parseWidthMasters } from '../../shared/source/width-masters';

const root = fileURLToPath(new URL('../..', import.meta.url));
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2), check = args.includes('--check');
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const input = option('--input'), output = option('--out'), style = option('--style');
if (!input || !output || args.some(arg => arg.startsWith('--') && !['--input', '--out', '--style', '--check'].includes(arg))) {
  throw new Error('Use --input candidate-directory --out fonts/marks [--style Mainline] [--check]');
}
function read(directory: string, digest: string): unknown {
  const bytes = readFileSync(resolve(root, 'fonts', directory, `${digest}.json`), 'utf8');
  if (hash(bytes) !== digest) throw new Error(`Immutable source changed: ${directory}/${digest}`);
  return JSON.parse(bytes);
}
function validate(data: SourceMarkData): void {
  const masters = decodeWeightMasters(parseWeightMasters(read('masters', data.base.digest)));
  const basis = { ref: data.base, masters };
  const width = { ref: data.width, masters: decodeWidthMasters(parseWidthMasters(read('widths', data.width.digest), basis), masters) };
  const components = { ref: data.components,
    components: decodeSourceComponents(parseSourceComponents(read('components', data.components.digest)), basis, width) };
  decodeSourceMarks(data, basis, width, components);
}
function metadata(data: SourceMarkData, digest: string) {
  const ref: { kind: 'source-marks-v1'; digest: string; fontId: string } = { kind: 'source-marks-v1', digest, fontId: data.base.fontId };
  return { ref, base: data.base, width: data.width, components: data.components,
    glyphs: data.recipes.map(recipe => recipe.glyph), cells: data.columns.reduce((sum, column) => sum + column.masters.length, 0),
    localGlyphs: data.recipes.filter(recipe => recipe.mark?.origin.kind === 'local').map(recipe => recipe.glyph),
    fixedWeightGlyphs: data.recipes.filter(recipe => recipe.mark?.origin.weight === 'fixed').map(recipe => recipe.glyph) };
}
const files = readdirSync(resolve(input)).filter(file => file.endsWith('.json') && !file.endsWith('.evidence.json')
  && file !== 'manifest.json' && (!style || file === `${style}.json`)).sort();
if (!files.length) throw new Error('No mark candidates selected');
const staged = files.map(file => {
  const data = parseSourceMarks(JSON.parse(readFileSync(resolve(input, file), 'utf8')));
  validate(data);
  const bytes = JSON.stringify(data) + '\n', digest = hash(bytes);
  return { bytes, digest, metadata: metadata(data, digest) };
});
const directory = resolve(output), entries = new Map<string, ReturnType<typeof metadata>>();
if (existsSync(directory)) for (const file of readdirSync(directory).filter(file => /^[a-f0-9]{64}\.json$/.test(file)).sort()) {
  const bytes = readFileSync(resolve(directory, file), 'utf8'), digest = file.slice(0, -5);
  if (hash(bytes) !== digest) throw new Error(`Immutable mark asset changed: ${digest}`);
  const data = parseSourceMarks(JSON.parse(bytes));
  entries.set(digest, metadata(data, digest));
}
for (const candidate of staged) {
  const file = resolve(directory, `${candidate.digest}.json`);
  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') !== candidate.bytes) throw new Error(`Immutable mark asset changed: ${candidate.digest}`);
  } else if (check) throw new Error(`Mark asset has not been generated: ${candidate.digest}`);
  entries.set(candidate.digest, candidate.metadata);
}
const manifest = JSON.stringify([...entries.values()].sort((a, b) => a.ref.fontId.localeCompare(b.ref.fontId) || a.ref.digest.localeCompare(b.ref.digest)), null, 2) + '\n';
const manifestFile = resolve(directory, 'manifest.json');
if (check) {
  if (!existsSync(manifestFile) || readFileSync(manifestFile, 'utf8') !== manifest) throw new Error('Mark manifest needs regenerating');
} else {
  mkdirSync(directory, { recursive: true });
  for (const candidate of staged) {
    const file = resolve(directory, `${candidate.digest}.json`);
    if (!existsSync(file)) writeFileSync(file, candidate.bytes, { flag: 'wx' });
  }
  writeFileSync(manifestFile, manifest);
}
process.stdout.write(JSON.stringify({ families: staged.length, glyphs: staged.reduce((sum, candidate) => sum + candidate.metadata.glyphs.length, 0),
  cells: staged.reduce((sum, candidate) => sum + candidate.metadata.cells, 0), output: directory, check }) + '\n');
