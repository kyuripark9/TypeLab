/* Publish the smoothed weights smooth-masters.ts drew (bases, the maps saved designs cross on, widths) and a program
   on them for each family, in dependency order: the base as a repair of the newest one, its two maps, the width
   columns, the components and accent marks pinned to them, a program with both maps, then the H crossbar authored on
   that program and the program again with it. Every other part of a family's newest program (dots, contrast, strokes,
   finish, spacing) carries over as it is.

     node --import tsx tools/masters/publish-smooth.ts [.audit/masters/smooth] [Family ...]

   Run smooth-masters.ts for the families first, against the catalog as it stands; re-running this after a rebase
   republishes the same files (publishers only append) on top of whatever programs are newest then. Afterwards check
   the dots (build-dots.ts --report) and rebuild the cards' previews (build-previews.ts). */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSourceProgram, type SourceProgramData } from '../../shared/source/program';
import { PROGRAM_REVISIONS } from '../../shared/source/program-catalog';
import { parseMasterSubdivision } from '../../shared/source/subdivision';

const root = resolve(import.meta.dirname, '../..');
const [input = '.audit/masters/smooth', ...named] = process.argv.slice(2);
const FAMILIES = ['Turnpike', 'Funnies', 'Ballyhoo', 'Boardwalk', 'Cathedral', 'Serenade', 'Timber'];
const directory = resolve(root, input), staging = resolve(directory, 'publication');
const bytes = (data: unknown) => JSON.stringify(data) + '\n';
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const read = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
/** a map's digest as build-revisions.ts publishes it: its parsed form */
const mapDigest = (file: string) => hash(bytes(parseMasterSubdivision(read(file))));
const newest = (fontId: string) => PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === fontId)!;

const families = (named.length ? named : FAMILIES).filter(f => existsSync(resolve(directory, `${f}-base.json`)));
if (!families.length) throw Error(`No smoothed bases in ${directory}; run tools/masters/smooth-masters.ts first`);
const candidates = families.map(family => {
  const file = (name: string) => resolve(directory, `${family}-${name}.json`);
  const fromPrevious = parseMasterSubdivision(read(file('from-previous'))), fromFirst = parseMasterSubdivision(read(file('from-first')));
  const base = fromPrevious.to, previous = newest(base.fontId);
  if (base.digest !== hash(readFileSync(file('base')))) throw Error(`${family}: the map doesn't name the drawn base`);
  if (previous.data.base.digest !== fromPrevious.from.digest && previous.data.base.digest !== base.digest) {
    throw Error(`${family}: the newest program moved to another base after these weights were drawn; draw them again`);
  }
  const width = { kind: 'width-masters-v1' as const, digest: hash(readFileSync(file('widths'))), fontId: base.fontId };
  const transitions = [
    { from: fromPrevious.from, mapping: { kind: 'master-subdivision-v1' as const, digest: mapDigest(file('from-previous')), fontId: base.fontId } },
    { from: fromFirst.from, mapping: { kind: 'master-subdivision-v1' as const, digest: mapDigest(file('from-first')), fontId: base.fontId } }
  ];
  return { family, file, base, width, transitions, previous: previous.data };
});

function run(tool: string, args: string[]) {
  const result = spawnSync(process.execPath, ['--max-old-space-size=768', '--import', 'tsx', resolve(root, tool), ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw Error(`${tool} failed; published immutable files can stay before retrying`);
}
mkdirSync(staging, { recursive: true });
run('tools/authored/build-masters.ts', candidates.flatMap(c => ['--derived', c.file('base'), c.file('from-previous')]));
run('tools/authored/build-revisions.ts', candidates.flatMap(c => [c.file('from-previous'), c.file('from-first')]));
run('tools/authored/build-programs.ts', candidates.flatMap(c => ['--width-asset', c.file('widths')]));

// components for every family's newest base and width, these families' on their new ones (the input stays a record)
const componentInput = resolve(root, 'tools/authored/component-bases.json');
const current = [...new Map(PROGRAM_REVISIONS.map(entry => [entry.ref.fontId, entry])).values()];
writeFileSync(componentInput, JSON.stringify(current.map(entry => {
  const c = candidates.find(c => c.base.fontId === entry.ref.fontId);
  return c ? { base: c.base, width: c.width } : { base: entry.data.base, width: entry.data.width };
}), null, 2) + '\n');
run('tools/authored/build-components.ts', ['--input', componentInput, '--out', resolve(root, 'fonts/components')]);
const components = read(resolve(root, 'fonts/components/manifest.json')) as { ref: SourceProgramData['components']; base: { digest: string }; width: { digest: string } | null }[];

// the accent marks: the same recipes, pinned to the new base, widths and components
const marksIn = resolve(staging, 'marks');
mkdirSync(marksIn, { recursive: true });
const withParts = candidates.map(c => {
  const component = components.findLast(e => e.base.digest === c.base.digest && e.width?.digest === c.width.digest)?.ref;
  if (!component) throw Error(`${c.family}: no components compiled on the new base`);
  if (!c.previous.marks) throw Error(`${c.family}: the newest program has no marks to carry`);
  const marks = read(resolve(root, 'fonts/marks', `${c.previous.marks.digest}.json`)) as Record<string, unknown>;
  const moved = { ...marks, base: c.base, width: c.width, components: component };
  writeFileSync(resolve(marksIn, `${c.family}.json`), bytes(moved));
  return { ...c, components: component };
});
run('tools/authored/build-marks.ts', ['--input', marksIn, '--out', resolve(root, 'fonts/marks')]);
const marks = read(resolve(root, 'fonts/marks/manifest.json')) as { ref: SourceProgramData['marks']; base: { digest: string }; width: { digest: string }; components: { digest: string } }[];

// a program on the new base without the crossbar (remaining-crossbars.ts authors it on a published program), then
// the crossbar, then the program with it
const programs = withParts.map(c => {
  const mark = marks.findLast(e => e.base.digest === c.base.digest && e.width.digest === c.width.digest && e.components.digest === c.components!.digest)?.ref;
  if (!mark) throw Error(`${c.family}: no marks pinned to the new base`);
  const data = parseSourceProgram({ ...c.previous, base: c.base, width: c.width, components: c.components, marks: mark, features: null, transitions: c.transitions });
  const file = resolve(staging, `${c.family}-program.json`);
  writeFileSync(file, bytes(data));
  return { ...c, data, file };
});
run('tools/authored/build-programs.ts', programs.flatMap(p => ['--program', p.file]));
const crossbars = resolve(staging, 'crossbars'), args: string[] = [];
for (const p of programs) {
  if (!p.previous.features) continue;
  run('tools/authored/remaining-crossbars.ts', [p.family, crossbars]);
  const made = read(resolve(crossbars, `${p.family}-binding.json`)) as { ref: SourceProgramData['features']; file: string; base: { digest: string } };
  if (made.base.digest !== p.base.digest) throw Error(`${p.family}: the crossbar was authored on another base`);
  const file = resolve(staging, `${p.family}-program-crossbar.json`);
  writeFileSync(file, bytes(parseSourceProgram({ ...p.data, features: made.ref })));
  args.push('--feature-asset', made.file, '--program', file);
}
if (args.length) run('tools/authored/build-programs.ts', args);
run('tools/authored/build-features.ts', ['Mainline:600']);
process.stdout.write(JSON.stringify(programs.map(p => ({ family: p.family, base: p.base.digest, width: p.width.digest, components: p.components?.digest }))) + '\n');
