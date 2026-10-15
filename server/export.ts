/* Server-side export: the same engine that draws the live preview builds the font files. */
import { crc32, deflateRawSync } from 'node:zlib';
import type { FontConstructorOptions } from 'opentype.js';
import { ACCENTED, CHARSET, ALL_CHARS, accentGlyph, buildFont, cmdsContours, cmdsToD, combine, drawnCmds, fitOutline, shape, unite } from '../shared/engine';
import { toPolys } from '../shared/engine/geom';
import type { Cmd, Font, Glyph } from '../shared/engine';
import { TEXTS } from '../shared/content';
import { slug } from '../shared/design';
import { WEIGHTS, familyMember, type FamilyRequest, type MemberRequest } from '../shared/family';
import { withoutReserved } from '../shared/free-fonts';
import type { Params } from '../shared/params';
import { opentype } from './opentype';

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

/** A letter's outline as a font file has it: a joined-up hand's (GlyphMeta.joined) made one ink, its strokes running
    over one another (a browser fills a web font's overlaps unevenly: an o's bowl, gone round past its start, came out
    half hollow), every other letter's as the engine draws it. */
function oneInk(g: Glyph): Cmd[] {
  if (!g.meta.joined) return g.cmds;
  const cs = cmdsContours(g.cmds), u = unite(cs);
  if (u !== cs || cs.length < 2) return drawnCmds(u);
  // (where unite can't make it out, its edges running right along one another as the pen goes back over a line, the
  // ink is made one as straight edges, and curves fitted to them again)
  const ink = shape(toPolys(g.cmds)), lines = combine([ink], ink.has).flatMap((p): Cmd[] => [['M', p[0].x, p[0].y], ...p.slice(1).map((q): Cmd => ['L', q.x, q.y]), ['Z']]);
  return drawnCmds(fitOutline(lines));
}

/** How a font installs within its family: its style name, weight class and italic angle. */
interface FontStyle { style: string; cls: number; angle: number }
const REGULAR: FontStyle = { style: 'Regular', cls: 400, angle: 0 };

/** The name a design exports under: its own, less any name the free font it's written in reserves (`font`, when
    the caller has built it already). */
export function exportName(params: Params, name: string, font: Font = buildFont(params)) {
  const free = font.free;
  return free ? withoutReserved(name, free.family) : name;
}

/** An installable OpenType (CFF) font with every glyph TypeLab draws. A design written in a free font
    (its letters registered first, see free-fonts.ts) passes on the font's copyright notice and licence,
    as the licence asks, and doesn't take the font's own name: under the Open Font License a changed
    font may not. TypeLab's own fonts pass on theirs the same way, TypeLab's notice and the Open Font License
    (ownLicense in shared/free-fonts.ts). `outline` is the outline
    a letter is written with: the engine's, unless asked for another (the interface's logo font writes its letters'
    overlapping pieces made one, tools/fonts/ui.ts). With `accents`, the accented letters too (ACCENTED, each its
    letter and a mark drawn for the design: accents.ts in the engine), after the rest, leaving the line spacing as it
    is. */
export function buildOTF(params: Params, name: string, as: FontStyle = REGULAR, outline: (g: Glyph) => Cmd[] = oneInk, accents = false): Buffer {
  const font = buildFont(params), m = font.m, free = font.free, licensed = free?.license ? free : null;
  name = exportName(params, name, font);
  // an advance width can't go below zero in a font file, and tight tracking takes it down: a space keeps at
  // least 40 units, so words stay apart, and a letter 20. .notdef, the blank shown for a character the font
  // lacks, is half an em
  const glyphs = [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: R(Math.max(40, m.space + m.track)), path: new opentype.Path() }),
    // a no-break space, as wide as a space, so text that holds one doesn't fall back to another font
    new opentype.Glyph({ name: 'uni00A0', unicode: 0xa0, advanceWidth: R(Math.max(40, m.space + m.track)), path: new opentype.Path() })
  ];
  // the font's ascender and descender (the hhea and typo metrics, with no line gap) set its line spacing on
  // most platforms: 60 units over the taller of ascender and cap height and 40 under the descender, for air
  // between lines. A free font's flourishes can reach past the design's own lines: the font's lines reach as far
  let top = Math.max(m.asc, m.cap) + 60, bottom = m.desc - 40;
  /** each character's glyph's place in the font */
  const index = new Map<string, number>();
  for (const ch of ALL_CHARS) {
    const g = font.glyph(ch); if (!g) continue;
    index.set(ch, glyphs.length);
    if (free) for (const c of g.cmds) for (let i = 2; i < c.length; i += 2) { top = Math.max(top, c[i] as number); bottom = Math.min(bottom, c[i] as number); }
    glyphs.push(new opentype.Glyph({
      name: 'uni' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'),
      unicode: ch.charCodeAt(0),
      advanceWidth: R(Math.max(20, g.adv + m.track)),
      path: toPath(outline(g))
    }));
  }
  if (accents) for (const ch of ACCENTED) {
    const g = accentGlyph(font, ch); if (!g) continue;
    glyphs.push(new opentype.Glyph({
      name: 'uni' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'),
      unicode: ch.charCodeAt(0),
      advanceWidth: R(Math.max(20, g.adv + m.track)),
      path: toPath(g.cmds)
    }));
  }
  // a joined script's small letters in the form they take after a letter whose join leaves it high (GlyphAlt in the
  // engine), with no character of their own: the calt feature below puts them in place, as the layout does
  const alts: [number, number][] = [], high: number[] = [];
  for (const [ch, i] of index) {
    const g = font.glyph(ch)!, a = font.glyph(ch, 'hi');
    if (g.meta.exitHigh) high.push(i);
    if (!a || a === g) continue;
    if (a.meta.exitHigh) high.push(glyphs.length);
    alts.push([i, glyphs.length]);
    glyphs.push(new opentype.Glyph({ name: glyphs[i].name + '.hi', advanceWidth: R(Math.max(20, a.adv + m.track)), path: toPath(outline(a)) }));
  }
  // Apps that only know Regular, Italic, Bold and Bold Italic list each other weight as a family of
  // its own ("Name Light"); the rest read the whole family from the typographic names. The style is read
  // as styleName (shared/family.ts) writes it: '<Weight>', '<Weight> Italic' or 'Italic'.
  const italic = as.angle > 0, weightName = as.style.replace(/ ?Italic$/, '') || 'Regular';
  const ribbi = weightName === 'Regular' || weightName === 'Bold';
  // fsSelection's bits: 1 ITALIC, 32 BOLD, 64 REGULAR
  const fsSel = (italic ? 1 : 0) | (weightName === 'Bold' ? 32 : 0) | (!italic && weightName !== 'Bold' ? 64 : 0);
  const otf = new opentype.Font({
    familyName: ribbi ? name : `${name} ${weightName}`,
    styleName: ribbi ? as.style : italic ? 'Italic' : 'Regular',
    fullName: as.style === 'Regular' ? name : `${name} ${as.style}`,
    postScriptName: `${name.replace(/[^A-Za-z0-9]/g, '') || 'TypeLab'}-${as.style.replace(/ /g, '')}`,
    weightClass: as.cls, italicAngle: -as.angle, fsSelection: fsSel, unitsPerEm: 1000,
    ascender: R(top), descender: R(bottom), glyphs
  } as unknown as FontConstructorOptions);
  // opentype.js 2 keeps names per platform; its types still describe 1.x
  const platforms = otf.names as unknown as Record<'unicode' | 'macintosh' | 'windows', Record<string, { en: string }>>;
  for (const names of [platforms.unicode, platforms.macintosh, platforms.windows]) {
    names.preferredFamily = { en: name };
    names.preferredSubfamily = { en: as.style };
    if (licensed) {
      names.copyright = { en: `${licensed.copyright ? licensed.copyright + ' ' : ''}Changed with TypeLab.` };
      // the licence travels with the font in full, as it asks
      names.license = { en: `Based on ${licensed.family} by ${licensed.designers.join(', ')}, changed with TypeLab, under the ${licensed.license}. You may use, change and share this font under the same licence: ${licensed.licenseUrl}${licensed.licenseText ? `\n\n${licensed.licenseText}` : ''}` };
      names.licenseURL = { en: licensed.licenseUrl };
    }
  }
  if (alts.length && high.length) (otf as unknown as { tables: Record<string, unknown> }).tables.gsub = altFeature(alts, high);
  // opentype.js reads font.weightClass only for the head table's macStyle bold bit (bold from 600 up); OS/2 keeps
  // as.cls. Only Bold sets the bit
  (otf as unknown as { weightClass: number }).weightClass = weightName === 'Bold' ? 700 : 400;
  return Buffer.from(otf.toArrayBuffer());
}

/** The GSUB table of a font with joined script letters (`alts`, each letter's glyph and its 'hi' form's): its contextual
    alternates (calt), a letter after one whose join leaves it high (`high`, either form) written in its 'hi' form. */
function altFeature(alts: [number, number][], high: number[]) {
  const sorted = alts.slice().sort((a, b) => a[0] - b[0]), lang = { reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: [0] };
  return {
    version: 1,
    scripts: ['DFLT', 'latn'].map(tag => ({ tag, script: { defaultLangSys: lang, langSysRecords: [] } })),
    features: [{ tag: 'calt', feature: { featureParams: 0, lookupListIndexes: [1] } }],
    lookups: [
      // (0: each letter to its 'hi' form, applied only by 1)
      { lookupType: 1, lookupFlag: 0, subtables: [{ substFormat: 2, coverage: { format: 1, glyphs: sorted.map(a => a[0]) }, substitute: sorted.map(a => a[1]) }] },
      { lookupType: 6, lookupFlag: 0, subtables: [{ substFormat: 3, backtrackCoverage: [{ format: 1, glyphs: [...new Set(high)].sort((a, b) => a - b) }],
        inputCoverage: [{ format: 1, glyphs: sorted.map(a => a[0]) }], lookaheadCoverage: [], lookupRecords: [{ sequenceIndex: 0, lookupListIndex: 0 }] }] }
    ]
  };
}

/** Every member of a family as its own font, in one .zip with a folder named after the family; written in a
    free font that comes under a licence, with the licence beside them. Built piece by piece, here one after another
    (the server builds the pieces side by side: exportPieces), with the accented letters in each font when `accents`. */
export function buildFamilyZip(params: Params, name: string, req: FamilyRequest, accents = false): Buffer {
  const job: ExportJob = { kind: 'family', name, params, family: req, accents };
  return joinPieces(job, exportPieces(job).map(buildPiece)).data;
}

/** The styles of family `req`, in the order its .zip holds them: lightest first, each upright before its italic, as
    familyMembers (shared/family.ts) lists them. */
const familyStyles = (req: FamilyRequest) =>
  WEIGHTS.flatMap(w => [false, true].filter(italic => req.styles.some(s => s.weight === w.id && s.italic === italic)).map(italic => ({ weight: w.id, italic })));

/** A file of a .zip as it is kept there: its path, its bytes deflated, their CRC-32 and how many there were. */
export interface ZipFile { name: string; packed: Uint8Array; crc: number; size: number }
const zipFile = (name: string, data: Buffer): ZipFile => ({ name, packed: deflateRawSync(data), crc: crc32(data), size: data.length });

/** A piece of an export, built on its own: all of a font file or a specimen (`part` 0); or one file of a family's
    .zip, `part` k its k-th member (familyStyles) and the part after the last its licence and the .zip's name. A
    family's members are each a couple of seconds' work where a free font's letters move, so the server builds its
    pieces side by side on its workers (export-pool.ts) and puts them together (joinPieces), which takes no time. */
export interface ExportPiece { job: ExportJob; part: number }
/** A piece built: the export itself, or files of a family's .zip (the last piece with the .zip's own name). */
export type PieceBuilt = { built: Built } | { files: ZipFile[]; file?: string };

/** The pieces `job` is built in. */
export const exportPieces = (job: ExportJob): ExportPiece[] =>
  Array.from({ length: job.kind === 'family' ? familyStyles(job.family).length + 1 : 1 }, (_, part) => ({ job, part }));

/** One piece of an export built: what the worker it is given to does (export-worker.ts). */
export function buildPiece({ job, part }: ExportPiece): PieceBuilt {
  if (job.kind !== 'family') return { built: buildExport(job) };
  const { params, family } = job, font = buildFont(params), name = exportName(params, job.name, font), dir = slug(name), styles = familyStyles(family);
  if (part < styles.length) {
    const f = familyMember(params, family.anchor, styles[part].weight, styles[part].italic);
    return { files: [zipFile(`${dir}/${dir}-${f.style.replace(/ /g, '')}.otf`, buildOTF(f.params, name, f, undefined, job.accents))] };
  }
  const free = font.free?.license ? font.free : null;
  return {
    file: `${dir}-family.zip`,
    files: free ? [zipFile(`${dir}/LICENSE.txt`, Buffer.from(`${name} is based on ${free.family} by ${free.designers.join(', ')}${free.copyright ? ` (${free.copyright.replace(/\.$/, '')})` : ''}, changed with TypeLab, and comes under the ${free.license}: ${free.licenseUrl}\n\n${free.licenseText || ''}\n`, 'utf8'))] : []
  };
}

/** An export put together from its pieces, built (in exportPieces' order). */
export function joinPieces(job: ExportJob, pieces: PieceBuilt[]): Built {
  if (job.kind !== 'family') return (pieces[0] as { built: Built }).built;
  const files = pieces.flatMap(p => ('files' in p ? p.files : []));
  return { file: (pieces[pieces.length - 1] as { file: string }).file, type: 'application/zip', data: zip(files) };
}

/* A zip file's records and fields (PKWARE's APPNOTE.TXT): each file's local header, then its entry in the
   central directory, then the directory's end. Every file is made by and needs version 2.0 (the first with
   deflate), has flag bit 11 set (its name is UTF-8) and is stored with method 8 (deflate). */
const ZIP_LOCAL = 0x04034b50, ZIP_CENTRAL = 0x02014b50, ZIP_END = 0x06054b50;
const ZIP_VERSION = 20, ZIP_UTF8_NAMES = 0x0800, ZIP_DEFLATE = 8;

/** A .zip archive of `files`, each compressed already (zipFile). */
function zip(files: ZipFile[]): Buffer {
  const local: Uint8Array[] = [], central: Buffer[] = [];
  let offset = 0;
  // DOS time and date of now, as zip keeps them
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8'), { packed, crc } = f;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(ZIP_LOCAL, 0); head.writeUInt16LE(ZIP_VERSION, 4); head.writeUInt16LE(ZIP_UTF8_NAMES, 6); head.writeUInt16LE(ZIP_DEFLATE, 8);
    head.writeUInt16LE(time, 10); head.writeUInt16LE(date, 12); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(f.size, 22); head.writeUInt16LE(nameBuf.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(ZIP_CENTRAL, 0); entry.writeUInt16LE(ZIP_VERSION, 4); entry.writeUInt16LE(ZIP_VERSION, 6); entry.writeUInt16LE(ZIP_UTF8_NAMES, 8); entry.writeUInt16LE(ZIP_DEFLATE, 10);
    entry.writeUInt16LE(time, 12); entry.writeUInt16LE(date, 14); entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(f.size, 24); entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    local.push(head, nameBuf, packed);
    central.push(entry, nameBuf);
    offset += head.length + nameBuf.length + packed.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(ZIP_END, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

const escapeXml = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));

/** A vector specimen sheet: the name, every character and a pangram; with `accents`, the accented letters (ACCENTED)
    too, capitals and small letters each a row, under the rest. */
export function buildSpecimenSVG(params: Params, name: string, accents = false): string {
  const font = buildFont(params), m = font.m;
  const rows = [name, CHARSET.upper, CHARSET.lower, CHARSET.digits + ' ' + CHARSET.punct, CHARSET.symbols, TEXTS.sentence];
  if (accents) rows.push(...[true, false].map(caps => [...ACCENTED].filter(ch => (ch !== ch.toLowerCase()) === caps).join('')));
  // in font units: rows as far apart as the letters reach plus 160, the first row's tallest letters 80 from the
  // top, 100 of margin each side and the sheet 120 taller than its rows; shown at a quarter size (a 1000-unit em
  // is 250 pixels)
  const lh = Math.max(m.asc, m.cap) - m.desc + 160;
  let body = '', maxW = 0;
  rows.forEach((t, r) => {
    const y = R(Math.max(m.asc, m.cap) + 80 + r * lh);
    // (an accented letter isn't one of the font's own, so it is set by its own advance)
    if (r >= 6) {
      let x = 0;
      for (const ch of t) { const g = accentGlyph(font, ch); if (!g) continue; body += `<path transform="translate(${R(x)},${y})" d="${cmdsToD(g.cmds)}"/>`; x += g.adv + m.track; }
      maxW = Math.max(maxW, x);
      return;
    }
    const ln = font.layout(t, Infinity)[0];
    maxW = Math.max(maxW, ln.width);
    for (const it of ln.items) { const g = font.glyph(it.ch, it.alt); if (g) body += `<path transform="translate(${R(it.x)},${y})" d="${g.d}"/>`; }
  });
  const W = R(maxW + 200), H = R(rows.length * lh + 120);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 0 ${W} ${H}" width="${W / 4}" height="${H / 4}">` +
    `<title>${escapeXml(name)} — TypeLab specimen</title><rect x="-100" width="${W}" height="${H}" fill="#fff"/><g fill="#111">${body}</g></svg>`;
}

/** What an export route asks for: one font file (the design as it is, or one member of its family), the family as a
    .zip, or the specimen sheet; each with the accented letters too when `accents`. */
export type ExportJob =
  | { kind: 'otf'; name: string; params: Params; member: MemberRequest | null; accents?: boolean }
  | { kind: 'family'; name: string; params: Params; family: FamilyRequest; accents?: boolean }
  | { kind: 'svg'; name: string; params: Params; accents?: boolean };

/** An export built: the file's name, its type and its bytes. */
export interface Built { file: string; type: string; data: Buffer }

/** An export built, all of it here (the server builds a family's members side by side instead: exportPieces). The free
    fonts the design and its members draw from are registered first. A font file is named for the design, less a name
    its free font reserves, and for the member picked (`<slug>-<Style>.otf`), as the family's .zip names it. */
export function buildExport(job: ExportJob): Built {
  const { name, params, accents = false } = job;
  if (job.kind === 'svg') return { file: `${slug(name)}-specimen.svg`, type: 'image/svg+xml; charset=utf-8', data: Buffer.from(buildSpecimenSVG(params, name, accents)) };
  if (job.kind === 'family') return joinPieces(job, exportPieces(job).map(buildPiece));
  const file = slug(exportName(params, name));
  const m = job.member && familyMember(params, job.member.anchor, job.member.weight, job.member.italic);
  return m ? { file: `${file}-${m.style.replace(/ /g, '')}.otf`, type: 'font/otf', data: buildOTF(m.params, name, m, undefined, accents) }
    : { file: `${file}.otf`, type: 'font/otf', data: buildOTF(params, name, undefined, undefined, accents) };
}
