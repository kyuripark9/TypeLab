/* Known dense-script export reproduction. Creates an isolated in-memory policy revision; publishes no assets. */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Clipper64, ClipType, FillRule } from 'clipper2-ts';
import { PROGRAM_REVISIONS } from '../../shared/source/program-catalog.ts';
import { masterInfo } from '../../shared/source/master-catalog.ts';
import { registerSource } from '../../shared/source/registry.ts';
import { parseSourceProgram } from '../../shared/source/program.ts';
import { loadSource } from '../../server/sources.ts';
import { buildOTF } from '../../server/export.ts';
import { opentype } from '../../server/opentype.ts';
import { buildFont } from '../../shared/engine/font.ts';
import { DEFAULTS, freeAtOf } from '../../shared/params/index.ts';
import { sourceFinishPolygons } from '../../shared/source/finish.ts';
import { signedArea } from '../../shared/engine/geom.ts';
const outputDir = process.env.TYPELAB_OUTLINE_EXPORT_OUT ?? '.audit/masters/outline-export';
mkdirSync(outputDir, { recursive: true });
const topology = cmds => {
  const paths = sourceFinishPolygons(cmds, .0001).map(p => p.map(v => ({ x: Math.round(v.x * 1e5), y: Math.round(v.y * 1e5) })));
  const clipper = new Clipper64(), normalized = []; clipper.addSubject(paths);
  if (!clipper.execute(ClipType.Union, FillRule.NonZero, normalized)) throw Error('Topology union failed');
  const areas = normalized.map(p => signedArea(p) / 1e10);
  return { pieces: areas.filter(a => a > 0).length, counters: areas.filter(a => a < 0).length, minimumArea: Math.min(...areas.map(Math.abs)) };
};
const program = PROGRAM_REVISIONS.findLast(p => p.ref.fontId === 'Serenade:400'), info = masterInfo(program.ref);
loadSource(program.ref);
const data = parseSourceProgram({ ...program.data, finish: { ...program.data.finish, outline: { rim: [.006,.024], tolerance: .1 } } });
const ref = { ...program.ref, digest: createHash('sha256').update(JSON.stringify(data)).digest('hex') }; registerSource(ref, data);
PROGRAM_REVISIONS.push({ ...program, ref, data });
const weight = (info.defaultWeight - info.min) / (info.max - info.min);
const params = { ...DEFAULTS, sourceProgram: ref, freeFont: ref.fontId, fill: 'outline', module: .5, weight, freeAt: { ...freeAtOf(DEFAULTS), weight } };
const output = buildOTF(params, 'Precise Example'), parsed = opentype.parse(output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength));
const font = buildFont(params), cases = [];
for (const ch of 'Hgj&') {
  const before = font.glyph(ch).cmds;
  const after = parsed.charToGlyph(ch).path.commands.map(c => c.type === 'M' || c.type === 'L' ? [c.type,c.x,c.y] : c.type === 'C' ? ['C',c.x1,c.y1,c.x2,c.y2,c.x,c.y] : ['Z']);
  let maxError = 0;
  if (before.length !== after.length) throw Error(`${ch}: command count changed ${before.length}/${after.length}`);
  before.forEach((c,i) => { if(c[0]!==after[i][0])throw Error(`${ch}: command changed`); c.slice(1).forEach((v,j)=>maxError=Math.max(maxError,Math.abs(v-after[i][j+1]))); });
  const a = topology(before), b = topology(after);
  if (a.pieces !== b.pieces || a.counters !== b.counters || maxError > 1/131072 + 1e-9) throw Error(`${ch}: export changed topology or exceeded fixed-point bound`);
  cases.push({ch,commands:before.length,maxError,before:a,after:b,advance:parsed.charToGlyph(ch).advanceWidth});
}
const report = { unitsPerEm: parsed.unitsPerEm, bytes: output.length, globalSubroutines: parsed.gsubrs.length, cases };
writeFileSync(`${outputDir}/Serenade-fractional.otf`,output);
writeFileSync(`${outputDir}/fractional-report.json`,JSON.stringify(report,null,2)); console.log(JSON.stringify(report));
