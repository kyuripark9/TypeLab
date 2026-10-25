/** Audit original font assets without registering or deforming them.
 * node --import tsx tools/authored/source-audit.ts [font.json ...] [--out report.json]
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CHARS } from '../../shared/engine/font';
import type { FreeFontData } from '../../shared/engine/free';
import { parseSourceData } from '../../shared/source/data';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

function inventory(data: FreeFontData) {
  return Object.fromEntries(Object.entries(data.glyphs).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([ch, [advance, contours]]) => {
    const handles = contours.map(contour => contour.map(node =>
      `${node.length > 2 && node[2] !== null ? 'i' : '-'}${node.length === 6 ? 'o' : '-'}`));
    return [ch, {
      advance,
      contourNodes: contours.map(contour => contour.length),
      incomingHandles: handles.flat().filter(value => value[0] === 'i').length,
      outgoingHandles: handles.flat().filter(value => value[1] === 'o').length,
      geometrySha256: hash(JSON.stringify([advance, contours])),
      structureSha256: hash(JSON.stringify(handles)),
    }];
  }));
}

async function main() {
  const files: string[] = [];
  let output: string | undefined;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out') {
      output = args[++i];
      if (!output) throw Error('--out requires a path');
    } else if (arg.startsWith('-')) throw Error(`Unknown option: ${arg}`);
    else files.push(resolve(arg));
  }
  if (!files.length) files.push(...(await readdir(resolve(ROOT, 'fonts'))).filter(name => name.endsWith('.json')).sort().map(name => resolve(ROOT, 'fonts', name)));

  const fonts = [];
  for (const file of files) {
    const bytes = await readFile(file);
    const data = parseSourceData(JSON.parse(bytes.toString('utf8')), relative(ROOT, file));
    const glyphs = inventory(data);
    const missing = [...ALL_CHARS].filter(ch => !data.glyphs[ch]?.[1].length);
    fonts.push({
      file: relative(ROOT, file), id: data.id, family: data.family,
      sourceSha256: hash(bytes),
      geometrySha256: hash(JSON.stringify({ cap: data.cap, xh: data.xh, space: data.space, glyphs })),
      capHeight: data.cap, xHeight: data.xh, spaceWidth: data.space,
      requiredGlyphs: [...ALL_CHARS].length, glyphCount: Object.keys(glyphs).length, missing,
      glyphs,
    });
  }
  const report = { format: 1, requiredCharacters: ALL_CHARS, fonts };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true });
    await writeFile(output, json);
    process.stdout.write(`${JSON.stringify({ report: output, fonts: fonts.length, requiredGlyphs: [...ALL_CHARS].length, missing: fonts.filter(font => font.missing.length).map(font => ({ id: font.id, characters: font.missing })) })}\n`);
  } else process.stdout.write(json);
  if (fonts.some(font => font.missing.length)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
