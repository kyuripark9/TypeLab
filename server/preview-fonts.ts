/* Compact source previews: compiled once during publication, served without loading the masters. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_CHARS, buildFont, type Cmd } from '../shared/engine';
import { encodedAdvance } from '../shared/engine/spacing';
import type { Params } from '../shared/params';
import { PREVIEW_FONTS } from '../shared/source/preview-catalog';
import { opentype } from './opentype';

export const previewDigest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const previewParamsDigest = (params: Params) => previewDigest(JSON.stringify(params));

function path(cmds: Cmd[]) {
  const out = new opentype.Path(), r = Math.round;
  for (const c of cmds) {
    if (c[0] === 'M') out.moveTo(r(c[1]), r(c[2]));
    else if (c[0] === 'L') out.lineTo(r(c[1]), r(c[2]));
    else if (c[0] === 'C') out.curveTo(r(c[1]), r(c[2]), r(c[3]), r(c[4]), r(c[5]), r(c[6]));
    else out.close();
  }
  return out;
}

function checksum(bytes: Buffer, from = 0, length = bytes.length): number {
  let sum = 0;
  for (let i = from; i < from + length; i += 4) sum = (sum + bytes.readUInt32BE(i)) >>> 0;
  return sum;
}
/** opentype.js writes the current modification time; pin both dates and repair the SFNT checksums. */
function deterministic(bytes: Buffer): Buffer {
  const count = bytes.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const entry = 12 + i * 16;
    if (bytes.toString('ascii', entry, entry + 4) !== 'head') continue;
    const offset = bytes.readUInt32BE(entry + 8), length = bytes.readUInt32BE(entry + 12);
    bytes.writeUInt32BE(0, offset + 8);
    bytes.writeBigUInt64BE(3029529600n, offset + 20);
    bytes.writeBigUInt64BE(3029529600n, offset + 28);
    bytes.writeUInt32BE(checksum(bytes, offset, Math.ceil(length / 4) * 4), entry + 4);
    bytes.writeUInt32BE((0xb1b0afba - checksum(bytes)) >>> 0, offset + 8);
    return bytes;
  }
  throw new Error('A preview font has no OpenType header');
}

export function buildPreviewFont(params: Params): { bytes: Buffer; ascent: number; descent: number; endCorrections: Record<string, number> } {
  const source = params.sourceProgram;
  if (!source) throw new Error('A preview font needs an authored source');
  const font = buildFont(params), m = font.m;
  if (font.source?.state !== 'ready') throw new Error('Load the source before generating its preview font');
  const ascent = Math.max(m.asc, m.cap), descent = -m.desc;
  const endCorrections: Record<string, number> = {};
  const advance = (ch: string, raw: number, space = false) => {
    const encoded = encodedAdvance(raw, m.track, space);
    // SVG line bounds end at the untracked final advance; preceding glyph origins use encoded advances.
    if (raw !== encoded) endCorrections[ch] = raw - encoded;
    return encoded;
  };
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    ...[32, 160].map(unicode => new opentype.Glyph({ name: unicode === 32 ? 'space' : 'uni00A0', unicode,
      advanceWidth: advance(String.fromCharCode(unicode), m.space, true), path: new opentype.Path() }))];
  for (const ch of ALL_CHARS) {
    const glyph = font.glyph(ch);
    if (!glyph) throw new Error(`Missing preview glyph ${source.fontId} ${ch}`);
    glyphs.push(new opentype.Glyph({ name: `uni${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
      unicode: ch.charCodeAt(0), advanceWidth: advance(ch, glyph.adv), path: path(glyph.cmds) }));
  }
  const free = font.free;
  const paramsDigest = previewParamsDigest(params);
  const out = new opentype.Font({ familyName: `TypeLab Preview ${source.digest.slice(0, 12)} ${paramsDigest.slice(0, 12)}`,
    styleName: 'Regular', unitsPerEm: 1000, ascender: Math.round(ascent), descender: -Math.round(descent), createdTimestamp: 946684800,
    description: JSON.stringify({ source, paramsDigest, ascent, descent, lineGap: 0, endCorrections }),
    copyright: free?.copyright ?? '', license: free?.licenseText || free?.license || '', licenseURL: free?.licenseUrl ?? '', glyphs });
  return { bytes: deterministic(Buffer.from(out.toArrayBuffer())), ascent, descent, endCorrections };
}

const files = new Map<string, Buffer>();
export function previewFontFile(digest: string): Buffer | undefined {
  if (!PREVIEW_FONTS.some(info => info.digest === digest)) return undefined;
  let bytes = files.get(digest);
  if (!bytes) {
    bytes = readFileSync(fileURLToPath(new URL(`../fonts/previews/${digest}.otf`, import.meta.url)));
    if (previewDigest(bytes) !== digest) throw new Error(`Preview font integrity check failed: ${digest}`);
    files.set(digest, bytes);
  }
  return bytes;
}
