/* Server-side export: the same engine that draws the live preview builds the font files. */
import { crc32, deflateRawSync } from 'node:zlib';
import * as opentypeNs from 'opentype.js';
import { CHARSET, ALL_CHARS, buildFont } from '../shared/engine';
import type { Cmd } from '../shared/engine';
import { TEXTS } from '../shared/content';
import { slug } from '../shared/design';
import { familyMembers, type FamilyRequest } from '../shared/family';
import { withoutReserved } from '../shared/free-fonts';
import type { Params } from '../shared/params';

// opentype.js is CommonJS: under Node its API sits on the default export
const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs) as typeof opentypeNs;

const R = Math.round;

function toPath(cmds: Cmd[]) {
  const p = new opentype.Path();
  for (const c of cmds) {
    if (c[0] === 'M') p.moveTo(R(c[1]), R(c[2]));
    else if (c[0] === 'L') p.lineTo(R(c[1]), R(c[2]));
    else if (c[0] === 'C') p.curveTo(R(c[1]), R(c[2]), R(c[3]), R(c[4]), R(c[5]), R(c[6]));
    else p.close();
  }
  return p;
}

/** How a font installs within its family: its style name, weight class and italic angle. */
export interface FontStyle { style: string; cls: number; angle: number }
const REGULAR: FontStyle = { style: 'Regular', cls: 400, angle: 0 };

/** The name a design exports under: its own, less any name the free font it's written in reserves. */
export function exportName(params: Params, name: string) {
  const free = buildFont(params).free;
  return free ? withoutReserved(name, free.family) : name;
}

/** An installable OpenType (CFF) font with every glyph TypeLab draws. A design written in a free font
    (its letters registered first, see free-fonts.ts) passes on the font's copyright notice and licence,
    as the licence asks, and doesn't take the font's own name: under the Open Font License a changed
    font may not. */
export function buildOTF(params: Params, name: string, as: FontStyle = REGULAR): Buffer {
  const font = buildFont(params), m = font.m, free = font.free;
  if (free) name = withoutReserved(name, free.family);
  const glyphs = [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: R(Math.max(40, m.space + m.track)), path: new opentype.Path() }),
    // a no-break space, as wide as a space, so text that holds one doesn't fall back to another font
    new opentype.Glyph({ name: 'uni00A0', unicode: 0xa0, advanceWidth: R(Math.max(40, m.space + m.track)), path: new opentype.Path() })
  ];
  // a free font's flourishes can reach past the design's own lines: the font's lines reach as far
  let top = Math.max(m.asc, m.cap) + 60, bottom = m.desc - 40;
  for (const ch of ALL_CHARS) {
    const g = font.glyph(ch); if (!g) continue;
    if (free) for (const c of g.cmds) for (let i = 2; i < c.length; i += 2) { top = Math.max(top, c[i] as number); bottom = Math.min(bottom, c[i] as number); }
    glyphs.push(new opentype.Glyph({
      name: 'uni' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'),
      unicode: ch.charCodeAt(0),
      advanceWidth: R(Math.max(20, g.adv + m.track)),
      path: toPath(g.cmds)
    }));
  }
  // Apps that only know Regular, Italic, Bold and Bold Italic list each other weight as a family of
  // its own ("Name Light"); the rest read the whole family from the typographic names.
  const italic = as.angle > 0, weightName = as.style.replace(/ ?Italic$/, '') || 'Regular';
  const ribbi = weightName === 'Regular' || weightName === 'Bold';
  const fsSel = (italic ? 1 : 0) | (weightName === 'Bold' ? 32 : 0) | (!italic && weightName !== 'Bold' ? 64 : 0);
  const otf = new opentype.Font({
    familyName: ribbi ? name : `${name} ${weightName}`,
    styleName: ribbi ? as.style : italic ? 'Italic' : 'Regular',
    fullName: as.style === 'Regular' ? name : `${name} ${as.style}`,
    postScriptName: `${name.replace(/[^A-Za-z0-9]/g, '') || 'TypeLab'}-${as.style.replace(/ /g, '')}`,
    weightClass: as.cls, italicAngle: -as.angle, fsSelection: fsSel, unitsPerEm: 1000,
    ascender: R(top), descender: R(bottom), glyphs
  } as unknown as opentypeNs.FontConstructorOptions);
  // opentype.js 2 keeps names per platform; its types still describe 1.x
  const platforms = otf.names as unknown as Record<'unicode' | 'macintosh' | 'windows', Record<string, { en: string }>>;
  for (const names of [platforms.unicode, platforms.macintosh, platforms.windows]) {
    names.preferredFamily = { en: name };
    names.preferredSubfamily = { en: as.style };
    if (free) {
      names.copyright = { en: `${free.copyright ? free.copyright + ' ' : ''}Changed with TypeLab.` };
      // the licence travels with the font in full, as it asks
      names.license = { en: `Based on ${free.family} by ${free.designers.join(', ')}, changed with TypeLab, under the ${free.license}. You may use, change and share this font under the same licence: ${free.licenseUrl}${free.licenseText ? `\n\n${free.licenseText}` : ''}` };
      names.licenseURL = { en: free.licenseUrl };
    }
  }
  // opentype.js marks the head table bold from SemiBold up; only Bold is
  (otf as unknown as { weightClass: number }).weightClass = weightName === 'Bold' ? 700 : 400;
  return Buffer.from(otf.toArrayBuffer());
}

/** Every member of a family as its own font, in one .zip with a folder named after the family; written in a
    free font, with the font's licence beside them. */
export function buildFamilyZip(params: Params, name: string, req: FamilyRequest): Buffer {
  name = exportName(params, name);
  const dir = slug(name), free = buildFont(params).free;
  return zip([
    ...familyMembers(params, req).map(f => ({ name: `${dir}/${dir}-${f.style.replace(/ /g, '')}.otf`, data: buildOTF(f.params, name, f) })),
    ...(free ? [{ name: `${dir}/LICENSE.txt`, data: Buffer.from(`${name} is based on ${free.family} by ${free.designers.join(', ')} (${free.copyright}), changed with TypeLab, and comes under the ${free.license}: ${free.licenseUrl}\n\n${free.licenseText || ''}\n`, 'utf8') }] : [])
  ]);
}

/** A .zip archive of `files`, each compressed. */
function zip(files: { name: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  // DOS time and date of now, as zip keeps them
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8'), packed = deflateRawSync(f.data), crc = crc32(f.data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(time, 10); head.writeUInt16LE(date, 12); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(f.data.length, 22); head.writeUInt16LE(nameBuf.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(time, 12); entry.writeUInt16LE(date, 14); entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(f.data.length, 24); entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    local.push(head, nameBuf, packed);
    central.push(entry, nameBuf);
    offset += head.length + nameBuf.length + packed.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

const escapeXml = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));

/** A vector specimen sheet: the name, every character and a pangram. */
export function buildSpecimenSVG(params: Params, name: string): string {
  const font = buildFont(params), m = font.m;
  const rows = [name, CHARSET.upper, CHARSET.lower, CHARSET.digits + ' ' + CHARSET.punct, CHARSET.symbols, TEXTS.sentence];
  const lh = Math.max(m.asc, m.cap) - m.desc + 160;
  let body = '', maxW = 0;
  rows.forEach((t, r) => {
    const ln = font.layout(t, Infinity)[0];
    maxW = Math.max(maxW, ln.width);
    const y = R(Math.max(m.asc, m.cap) + 80 + r * lh);
    for (const it of ln.items) { const g = font.glyph(it.ch); if (g) body += `<path transform="translate(${R(it.x)},${y})" d="${g.d}"/>`; }
  });
  const W = R(maxW + 200), H = R(rows.length * lh + 120);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 0 ${W} ${H}" width="${W / 4}" height="${H / 4}">` +
    `<title>${escapeXml(name)} — TypeLab specimen</title><rect x="-100" width="${W}" height="${H}" fill="#fff"/><g fill="#111">${body}</g></svg>`;
}
