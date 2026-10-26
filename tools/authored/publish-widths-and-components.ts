/* Publish local width families, their exact edit mappings, and matching component programs in dependency order. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSourceFinish } from '../../shared/source/finish';
import { parseSourceProgram, type SourceComponentRef, type SourceProgramData } from '../../shared/source/program';
import { PROGRAM_REVISIONS } from '../../shared/source/program-catalog';
import { parseMasterSubdivision } from '../../shared/source/subdivision';
import { LOCAL_WIDTH_RECIPES } from './build-local-widths';

const root = resolve(import.meta.dirname, '../..');
const [input, finishFile] = process.argv.slice(2);
if (!input || !finishFile) throw Error('Usage: publish-widths-and-components.ts <local-width-directory> <finish-policy.json>');
const directory = resolve(input), staging = resolve(directory, 'publication');
const bytes = (data: unknown) => JSON.stringify(data) + '\n';
const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const read = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
const finish = parseSourceFinish(read(resolve(finishFile)));
const current = [...new Map(PROGRAM_REVISIONS.map(entry => [entry.ref.fontId, entry])).values()];
const candidates = LOCAL_WIDTH_RECIPES.map(recipe => {
  const folder = resolve(directory, recipe.style), file = (name: string) => resolve(folder, name + '.json');
  const binding = parseMasterSubdivision(read(file('binding'))), base = binding.to;
  if (base.digest !== digest(file('base'))) throw Error(`${recipe.style}: exact basis mapping does not match the generated weight package`);
  const previous = current.find(entry => entry.ref.fontId === base.fontId);
  if (!previous) throw Error(`${recipe.style}: no published program to extend`);
  if (previous.data.base.digest !== binding.from.digest && previous.data.base.digest !== base.digest) {
    throw Error(`${recipe.style}: the source basis changed after these widths were authored`);
  }
  const width = { kind: 'width-masters-v1', digest: digest(file('widths')), fontId: base.fontId };
  const features = existsSync(file('features')) ? { kind: 'feature-masters-v1', digest: digest(file('features')), fontId: base.fontId } : null;
  const mapping = { kind: 'master-subdivision-v1', digest: digest(file('binding')), fontId: base.fontId };
  const program = parseSourceProgram({ ...previous.data, base, width, features,
    transitions: [{ from: binding.from, mapping }] });
  return { file, base, program };
});
function run(tool: string, args: string[]) {
  const result = spawnSync(process.execPath, ['--max-old-space-size=512', '--import', 'tsx', resolve(root, 'tools/authored', tool), ...args],
    { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw Error(`${tool} failed; published immutable files can be retained before retrying`);
}
mkdirSync(staging, { recursive: true });
run('build-masters.ts', candidates.flatMap(candidate => ['--derived', candidate.file('base'), candidate.file('binding')]));
run('build-revisions.ts', candidates.map(candidate => candidate.file('binding')));
run('build-programs.ts', candidates.flatMap(candidate => ['--width-asset', candidate.file('widths'),
  ...(candidate.program.features ? ['--feature-asset', candidate.file('features')] : [])]));

const programs: SourceProgramData[] = current.map(entry => candidates.find(candidate => candidate.base.fontId === entry.ref.fontId)?.program ?? entry.data);
const componentInput = resolve(root, 'tools/authored/component-bases.json');
writeFileSync(componentInput, JSON.stringify(programs.map(({ base, width }) => ({ base, width })), null, 2) + '\n');
run('build-components.ts', ['--input', componentInput, '--out', resolve(root, 'fonts/components')]);
const manifest = read(resolve(root, 'fonts/components/manifest.json'));
if (!Array.isArray(manifest)) throw Error('Invalid generated component manifest');
const components = manifest.map(entry => {
  if (!entry || typeof entry !== 'object' || !('base' in entry) || !('width' in entry) || !('ref' in entry)) throw Error('Invalid generated component entry');
  const data = parseSourceProgram({ format: 'source-program-v1', base: entry.base, width: entry.width, features: null, components: entry.ref });
  if (!data.components) throw Error('Missing generated component reference');
  return { base: data.base, width: data.width, ref: data.components };
});
const args: string[] = [];
for (const program of programs) {
  const match = components.findLast(component => component.base.digest === program.base.digest
    && component.base.fontId === program.base.fontId && component.width?.digest === program.width?.digest);
  if (!match) throw Error(`Missing components for ${program.base.fontId}`);
  const component: SourceComponentRef = match.ref;
  const data = parseSourceProgram({ ...program, components: component, finish });
  const file = resolve(staging, program.base.fontId.replace(/[^a-zA-Z0-9-]/g, '-') + '.json');
  writeFileSync(file, bytes(data));
  args.push('--program', file);
}
run('build-programs.ts', args);
process.stdout.write(JSON.stringify({ widthFamilies: candidates.length, componentFamilies: programs.length, finish }) + '\n');
