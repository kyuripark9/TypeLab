/* Type2 fixed-point paths for effects whose small details integer CFF coordinates would erase. */
import type { Cmd } from '../shared/engine';
import { SourceEffectError, type SourceEffect } from '../shared/source/effect-error';

export interface PreciseCFFGlyph { readonly cmds: readonly Cmd[]; readonly advance: number }
const FIXED = 65536, MAX_STRING = 60000;
interface Index { start: number; end: number; objects: { start: number; end: number }[] }
interface Operand { value: number; at: number; bytes: number }

function failure(effect: SourceEffect, message: string): never {
  throw new SourceEffectError(effect, 'precision', message);
}
function integer(n: number): number[] {
  if (n >= -107 && n <= 107) return [n + 139];
  if (n >= 108 && n <= 1131) return [247 + ((n - 108) >> 8), (n - 108) & 255];
  if (n >= -1131 && n <= -108) return [251 + ((-n - 108) >> 8), (-n - 108) & 255];
  return [28, (n >> 8) & 255, n & 255];
}
function fixed(n: number, effect: SourceEffect): number[] {
  if (!Number.isSafeInteger(n) || n < -0x80000000 || n > 0x7fffffff) failure(effect, 'A CFF path delta exceeds the signed 16.16 coordinate range');
  return n % FIXED === 0 ? integer(n / FIXED) : [255, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}
function commands(glyph: PreciseCFFGlyph, effect: SourceEffect): Buffer[] {
  if (!Number.isInteger(glyph.advance) || glyph.advance < 0 || glyph.advance > 32767) failure(effect, 'A CFF advance exceeds the supported integer range');
  const ops: Buffer[] = [Buffer.from(integer(glyph.advance))];
  let x = 0, y = 0, open = false;
  for (const c of glyph.cmds) {
    if (c[0] === 'Z') { open = false; continue; }
    if (c[0] !== 'M' && !open) failure(effect, 'A CFF contour must start with a move');
    const data: number[] = [];
    for (let i = 1; i < c.length; i += 2) {
      const nextX = Math.round((c[i] as number) * FIXED), nextY = Math.round((c[i + 1] as number) * FIXED);
      data.push(...fixed(nextX - x, effect), ...fixed(nextY - y, effect)); x = nextX; y = nextY;
    }
    data.push(c[0] === 'M' ? 21 : c[0] === 'L' ? 5 : 8);
    ops.push(Buffer.from(data)); open = true;
  }
  return ops;
}
function encodedPaths(glyphs: readonly PreciseCFFGlyph[], effect: SourceEffect): { paths: Buffer; subrs: Buffer } {
  const subrs: Buffer[] = [], paths: (Buffer | { first: Buffer; calls: number[] })[] = [];
  for (const glyph of glyphs) {
    const ops = commands(glyph, effect), length = ops.reduce((sum, op) => sum + op.length, 1);
    if (length <= MAX_STRING) { paths.push(Buffer.concat([...ops, Buffer.from([14])])); continue; }
    // The first move consumes the explicit width before entering any subroutine.
    const first = Buffer.concat(ops.slice(0, 2)), calls: number[] = [];
    let pieces: Buffer[] = [], bytes = 1;
    const flush = () => { if (!pieces.length) return; calls.push(subrs.length); subrs.push(Buffer.concat([...pieces, Buffer.from([11])])); pieces = []; bytes = 1; };
    for (const op of ops.slice(2)) {
      if (bytes + op.length > MAX_STRING) flush();
      pieces.push(op); bytes += op.length;
    }
    flush(); paths.push({ first, calls });
  }
  if (subrs.length > 65535) failure(effect, 'The font exceeds the CFF subroutine count');
  const bias = subrs.length < 1240 ? 107 : subrs.length < 33900 ? 1131 : 32768;
  return { paths: makeIndex(paths.map(path => Buffer.isBuffer(path) ? path : Buffer.concat([
    path.first, ...path.calls.map(index => Buffer.from([...integer(index - bias), 29])), Buffer.from([14])
  ])), effect), subrs: makeIndex(subrs, effect) };
}
function makeIndex(objects: readonly Buffer[], effect: SourceEffect): Buffer {
  if (objects.length > 65535) failure(effect, 'The font exceeds the CFF glyph count');
  if (!objects.length) return Buffer.alloc(2);
  const length = objects.reduce((sum, object) => sum + object.length, 1);
  const width = length <= 255 ? 1 : length <= 65535 ? 2 : length <= 0xffffff ? 3 : 4;
  const header = Buffer.alloc(3 + (objects.length + 1) * width);
  header.writeUInt16BE(objects.length); header[2] = width;
  let offset = 1;
  objects.forEach((object, i) => { header.writeUIntBE(offset, 3 + i * width, width); offset += object.length; });
  header.writeUIntBE(offset, 3 + objects.length * width, width);
  return Buffer.concat([header, ...objects]);
}
function readIndex(data: Buffer, start: number, effect: SourceEffect): Index {
  if (start < 0 || start + 2 > data.length) failure(effect, 'Invalid CFF INDEX offset');
  const count = data.readUInt16BE(start);
  if (!count) return { start, end: start + 2, objects: [] };
  const width = data[start + 2], body = start + 3 + (count + 1) * width;
  if (width < 1 || width > 4 || body > data.length) failure(effect, 'Invalid CFF INDEX width');
  const offsets = Array.from({ length: count + 1 }, (_, i) => data.readUIntBE(start + 3 + i * width, width));
  if (offsets[0] !== 1 || offsets.some((offset, i) => i > 0 && offset < offsets[i - 1]) || body + offsets[count] - 1 > data.length) failure(effect, 'Invalid CFF INDEX contents');
  return { start, end: body + offsets[count] - 1, objects: offsets.slice(0, -1).map((offset, i) => ({ start: body + offset - 1, end: body + offsets[i + 1] - 1 })) };
}
function dict(data: Buffer, start: number, end: number, effect: SourceEffect): Map<number, Operand[]> {
  const entries = new Map<number, Operand[]>(); let args: Operand[] = [];
  for (let at = start; at < end;) {
    const begin = at, b = data[at++]; let value: number;
    if (b === 28) { value = data.readInt16BE(at); at += 2; }
    else if (b === 29) { value = data.readInt32BE(at); at += 4; }
    else if (b === 30) {
      while (at < end) { const n = data[at++]; if ((n & 15) === 15 || n >> 4 === 15) break; }
      value = NaN; // Real values are metadata; none of the relocated offsets may use this encoding.
    } else if (b >= 32 && b <= 246) value = b - 139;
    else if (b >= 247 && b <= 250) value = (b - 247) * 256 + data[at++] + 108;
    else if (b >= 251 && b <= 254) value = -(b - 251) * 256 - data[at++] - 108;
    else {
      const op = b === 12 ? 1200 + data[at++] : b;
      if (entries.has(op)) failure(effect, 'Duplicate CFF dictionary operator');
      entries.set(op, args); args = []; continue;
    }
    args.push({ value, at: begin, bytes: at - begin });
  }
  if (args.length) failure(effect, 'Unterminated CFF dictionary operands');
  return entries;
}
function replaceCFF(data: Buffer, glyphs: readonly PreciseCFFGlyph[], effect: SourceEffect): Buffer {
  if (data[0] !== 1) failure(effect, 'Precise export requires a CFF1 template');
  const names = readIndex(data, data[2], effect), top = readIndex(data, names.end, effect);
  if (names.objects.length !== 1 || top.objects.length !== 1) failure(effect, 'Precise export requires one CFF font');
  const strings = readIndex(data, top.end, effect), global = readIndex(data, strings.end, effect);
  const entries = dict(data, top.objects[0].start, top.objects[0].end, effect);
  const charset = entries.get(15), charstrings = entries.get(17), privateDict = entries.get(18);
  if (!charset || charset.length !== 1 || !charstrings || charstrings.length !== 1 || !privateDict || privateDict.length !== 2
    || privateDict[0].value !== 0 || global.objects.length || entries.has(1230) || entries.has(1236) || entries.has(1237)
    || charset[0].value !== global.end) failure(effect, 'Unsupported CFF template layout');
  const oldPaths = readIndex(data, charstrings[0].value, effect);
  if (oldPaths.objects.length !== glyphs.length || oldPaths.end !== privateDict[1].value || oldPaths.end !== data.length) failure(effect, 'CFF template glyphs or private dictionary changed');
  const encoded = encodedPaths(glyphs, effect), prefix = Buffer.from(data.subarray(0, global.start));
  const delta = encoded.subrs.length - (global.end - global.start);
  for (const [operand, value] of [[charset[0], charset[0].value + delta], [charstrings[0], charstrings[0].value + delta],
    [privateDict[1], charstrings[0].value + delta + encoded.paths.length]] as const) {
    if (operand.bytes !== 5 || prefix[operand.at] !== 29) failure(effect, 'CFF template offsets must have fixed-width encoding');
    prefix.writeInt32BE(value, operand.at + 1);
  }
  return Buffer.concat([prefix, encoded.subrs, data.subarray(global.end, oldPaths.start), encoded.paths]);
}
function checksum(data: Buffer): number {
  let value = 0;
  for (let at = 0; at < data.length; at += 4) value = (value + (((data[at] ?? 0) * 0x1000000)
    + ((data[at + 1] ?? 0) << 16) + ((data[at + 2] ?? 0) << 8) + (data[at + 3] ?? 0))) >>> 0;
  return value;
}

/** Preserve metadata and 1000-UPM metrics; replace only CFF paths and container checksums.
 * Each absolute coordinate rounds once to 16.16: at most sqrt(2)/131072 units per point.
 * Adobe Type2 specification 5177 §§3.2,4.7 and Appendix B define operands and subroutine limits. */
export function preciseCFF(template: Buffer, glyphs: readonly PreciseCFFGlyph[], effect: SourceEffect): Buffer {
  if (template.toString('ascii', 0, 4) !== 'OTTO') failure(effect, 'Precise export requires an OpenType CFF font');
  const count = template.readUInt16BE(4), header = Buffer.from(template.subarray(0, 12 + count * 16));
  const tables: { tag: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16, tag = template.toString('ascii', at, at + 4), offset = template.readUInt32BE(at + 8), length = template.readUInt32BE(at + 12);
    if (offset + length > template.length) failure(effect, 'Invalid OpenType table boundary');
    const data = Buffer.from(template.subarray(offset, offset + length));
    tables.push({ tag, data: tag === 'CFF ' ? replaceCFF(data, glyphs, effect) : data });
  }
  const head = tables.find(table => table.tag === 'head');
  if (!head || !tables.some(table => table.tag === 'CFF ')) failure(effect, 'The font is missing a required OpenType table');
  head.data.writeUInt32BE(0, 8);
  const chunks: Buffer[] = [header]; let offset = header.length, headOffset = 0;
  tables.forEach((table, i) => {
    const at = 12 + i * 16, padding = (4 - table.data.length % 4) % 4;
    header.writeUInt32BE(checksum(table.data), at + 4); header.writeUInt32BE(offset, at + 8); header.writeUInt32BE(table.data.length, at + 12);
    if (table.tag === 'head') headOffset = offset;
    chunks.push(table.data, Buffer.alloc(padding)); offset += table.data.length + padding;
  });
  const output = Buffer.concat(chunks);
  output.writeUInt32BE((0xb1b0afba - checksum(output)) >>> 0, headOffset + 8);
  return output;
}
