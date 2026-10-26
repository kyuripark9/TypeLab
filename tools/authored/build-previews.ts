/* Publish or check neutral source web fonts. Each style compiles in a fresh bounded process. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_STYLES, styleById } from '../../shared/content';
import { parsePreviewFonts, type PreviewFontInfo } from '../../shared/source/preview-catalog';
import { sourceStyleParams } from '../../shared/source/style';
import { buildPreviewFont, previewDigest, previewParamsDigest } from '../../server/preview-fonts';
import { loadDesignSources } from '../../server/sources';

const script = fileURLToPath(import.meta.url), project = fileURLToPath(new URL('../..', import.meta.url));
const root = process.env.TYPELAB_PUBLICATION_ROOT ? resolve(process.env.TYPELAB_PUBLICATION_ROOT) : project;
const args = process.argv.slice(2);
if (args[0] === '--one') {
  const style = styleById(args[1]), target = args[2];
  assert.ok(style && target, 'A preview child needs a style and output path');
  const params = sourceStyleParams(style); assert.ok(params?.sourceProgram);
  loadDesignSources(params);
  const { bytes, ascent, descent, endCorrections } = buildPreviewFont(params);
  const info: PreviewFontInfo = { styleId: style.id, source: params.sourceProgram, paramsDigest: previewParamsDigest(params),
    digest: previewDigest(bytes), ascent, descent, endCorrections };
  writeFileSync(target + '.otf', bytes);
  writeFileSync(target + '.json', JSON.stringify(info) + '\n');
} else {
  const check = args.includes('--check'), ids = args.filter(arg => arg !== '--check');
  for (const id of ids) assert.ok(PAGE_STYLES.some(style => style.id === id && sourceStyleParams(style)), `Unknown source style: ${id}`);
  const styles = PAGE_STYLES.filter(style => sourceStyleParams(style) && (!ids.length || ids.includes(style.id)));
  const dir = resolve(root, 'fonts/previews'), manifest = resolve(dir, 'manifest.json');
  const entries = existsSync(manifest) ? parsePreviewFonts(JSON.parse(readFileSync(manifest, 'utf8'))) : [];
  for (const info of entries) assert.equal(previewDigest(readFileSync(resolve(dir, info.digest + '.otf'))), info.digest, `Immutable preview changed: ${info.digest}`);
  const scratch = mkdtempSync(resolve(tmpdir(), 'typelab-previews-')), staged: { info: PreviewFontInfo; bytes: Buffer }[] = [];
  try {
    for (const style of styles) {
      const target = resolve(scratch, style.id);
      const result = spawnSync(process.execPath, ['--max-old-space-size=384', '--import', 'tsx', script, '--one', style.id, target],
        { cwd: project, encoding: 'utf8', maxBuffer: 1024 * 1024 });
      assert.equal(result.status, 0, `${style.id}: ${result.error?.message ?? result.stderr}`);
      const [info] = parsePreviewFonts([JSON.parse(readFileSync(target + '.json', 'utf8'))]);
      const bytes = readFileSync(target + '.otf'); assert.equal(previewDigest(bytes), info.digest);
      const previous = entries.findLast(entry => entry.styleId === style.id && entry.source.kind === info.source.kind
        && entry.source.digest === info.source.digest && entry.source.fontId === info.source.fontId);
      if (check) assert.deepEqual(previous, info, `Neutral preview needs updating: ${style.id}`);
      else if (JSON.stringify(previous) !== JSON.stringify(info)) entries.push(info);
      staged.push({ info, bytes });
    }
    const contents = JSON.stringify(entries, null, 2) + '\n';
    const catalogFile = resolve(root, 'shared/source/preview-catalog.ts'), template = readFileSync(catalogFile, 'utf8');
    const catalog = template.replace(/export const PREVIEW_FONTS: readonly PreviewFontInfo\[\] = [\s\S]*?;\n/,
      `export const PREVIEW_FONTS: readonly PreviewFontInfo[] = ${JSON.stringify(entries, null, 2)};\n`);
    if (check) {
      assert.equal(readFileSync(manifest, 'utf8'), contents, 'Preview manifest needs updating');
      assert.equal(template, catalog, 'Preview catalog needs updating');
    } else {
      mkdirSync(dir, { recursive: true });
      for (const { info, bytes } of staged) {
        const target = resolve(dir, info.digest + '.otf');
        if (existsSync(target)) assert.deepEqual(readFileSync(target), bytes, 'An immutable preview cannot be overwritten');
        else writeFileSync(target, bytes, { flag: 'wx' });
      }
      writeFileSync(manifest, contents);
      writeFileSync(catalogFile, catalog);
    }
    process.stdout.write(JSON.stringify({ styles: styles.map(style => style.id), fonts: entries.length, bytes: staged.reduce((sum, item) => sum + item.bytes.length, 0), check }) + '\n');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
