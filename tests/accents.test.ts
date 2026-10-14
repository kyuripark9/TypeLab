/* The accented letters an export can add (shared/engine/accents.ts, server/export.ts): each its letter and a mark, the
   mark over the x-height or the cap height (or under the baseline), centred on the letter's top along its lean, the
   advance its letter's; ı without its dot; in an exported font only when asked for, the family's .zip built side by
   side by the export pool the same as one after another. */
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { STYLES } from '../shared/content';
import { ACCENTED, ALL_CHARS, accentGlyph, buildFont, freeFont, registerFreeFont, type Cmd, type Font } from '../shared/engine';
import { accentOf } from '../shared/engine/accents';
import { toPolys } from '../shared/engine/geom';
import { STYLE_FONTS } from '../shared/free-fonts';
import { freeAtOf, type Params } from '../shared/params';
import { anchorOf } from '../shared/family';
import { buildFamilyZip, buildOTF, buildSpecimenSVG } from '../server/export';
import { ExportPool } from '../server/export-pool';
import { FreeFonts } from '../server/free-fonts';
import { opentype } from '../server/opentype';

const style = (id: string) => STYLES.find(s => s.id === id)!.params;
const ownFonts = new FreeFonts(null, async (url: string): Promise<never> => { throw new Error(`fetched ${url}`); });
/** Style `id` written in its own font (read from fonts/, never fetched). */
async function inFont(id: string): Promise<Params> {
  const fid = STYLE_FONTS[id];
  if (!freeFont(fid)) registerFreeFont(await ownFonts.load(fid));
  return { ...style(id), freeFont: fid, freeAt: freeAtOf(style(id)) } as Params;
}

interface Box { x0: number; y0: number; x1: number; y1: number }
/** The ink's box, x read along the lean (as if the letter stood upright). */
function box(cmds: Cmd[], lean = 0): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of toPolys(cmds)) for (const p of r) { const x = p.x - lean * p.y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}
/** The part of an outline between two heights, as a box read along the lean. */
function band(cmds: Cmd[], lo: number, hi: number, lean: number): Box {
  const polys = toPolys(cmds);
  let x0 = Infinity, x1 = -Infinity;
  for (let k = 0; k <= 16; k++) {
    const y = lo + (hi - lo) * k / 16;
    for (const r of polys) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if ((a.y <= y) !== (b.y <= y)) { const x = a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x) - lean * y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    }
  }
  return { x0, y0: lo, x1, y1: hi };
}
const contourCount = (cmds: Cmd[]) => cmds.filter(c => c[0] === 'M').length;

/** Every accented letter of `font`: its letter's outline, the mark's (what follows it), and their boxes. */
function* accented(font: Font) {
  const dotless = accentGlyph(font, 'ı')!;
  for (const ch of ACCENTED) {
    if (ch === 'ı') continue;
    const a = accentOf(ch)!, base = a.base === 'ı' ? dotless : font.glyph(a.base)!, g = accentGlyph(font, ch)!;
    yield { ch, a, base, g, mark: g.cmds.slice(base.cmds.length) };
  }
}

/** The designs looked at, and how far their letters lean (a tangent; null: the engine's slant, or for a script in its
    own font, whose lean the code reads off its letters, not known here, so its marks' centring isn't checked). */
const DESIGNS: [string, () => Promise<Params>, number | null][] = [
  ['the engine\'s serif', async () => style('serif'), 0],
  ['the engine\'s grotesque, leaning', async () => ({ ...style('grotesque'), slant: 0.7 }), null],
  ['Couture (didone)', () => inFont('didone'), 0],
  ['Mainline (grotesque)', () => inFont('grotesque'), 0],
  ['Boardwalk (informal script)', () => inFont('informal'), null],
  ['Cathedral (blackletter)', () => inFont('blackletter'), 0],
  ['Bulwark (block)', () => inFont('block'), 0]
];

describe('accented letters', () => {
  it('cover Latin-1 and the Central and Eastern European, Turkish and Baltic letters, none of them in ALL_CHARS', () => {
    const want = 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿčďěňřšťžćńśźĺŕżėİůőűğăąęįųşţģķļņāēīōūșțı';
    for (const ch of want) {
      assert.ok(ACCENTED.includes(ch), `${ch} is an accented letter`);
      if (ch !== ch.toLowerCase() || ch === 'ı' || ch === 'İ') continue;
      assert.ok(ACCENTED.includes(ch.toUpperCase()) || ch === 'ÿ' && ACCENTED.includes('Ÿ'), `${ch}'s capital too`);
    }
    for (const ch of ACCENTED) assert.ok(!ALL_CHARS.includes(ch), `${ch} isn't one of the engine's own characters`);
  });

  for (const [name, params, leans] of DESIGNS) {
    it(`sit over the x-height or the cap height, or under the baseline, centred along the lean and keeping the advance: ${name}`, async () => {
      const font = buildFont(await params()), lean = leans ?? (font.free ? null : font.m.slant);
      const xh = box(font.glyph('x')!.cmds).y1, cap = box(font.glyph('H')!.cmds).y1;
      for (const { ch, a, base, g, mark } of accented(font)) {
        assert.equal(g.adv, base.adv, `${ch} keeps ${a.base}'s advance`);
        assert.ok(mark.length > 0, `${ch} has a mark`);
        const b = box(base.cmds), m = box(mark), caps = a.base !== a.base.toLowerCase();
        if (['cedilla', 'ogonek'].includes(a.mark)) {
          // hanging from the letter's foot: running up into it, and well down under the baseline
          assert.ok(m.y1 > 0 && m.y1 < xh * 0.3, `${ch}'s ${a.mark} meets the foot (top ${m.y1.toFixed(0)})`);
          assert.ok(m.y0 < -xh * 0.12, `${ch}'s ${a.mark} hangs under the baseline (${m.y0.toFixed(0)})`);
        } else if (a.mark === 'commabelow') {
          assert.ok(m.y1 < Math.min(0, b.y0) && m.y0 > b.y0 - xh * 0.8, `${ch}'s comma is under the letter (${m.y0.toFixed(0)} to ${m.y1.toFixed(0)})`);
        } else if (a.mark === 'caroncomma') {
          // beside the stem's top (a small letter's over the x-height), standing to its right
          assert.ok(m.y0 > (caps ? cap * 0.5 : xh), `${ch}'s caron stands high on the stem (${m.y0.toFixed(0)})`);
          assert.ok(m.y1 <= b.y1 + xh * 0.35, `${ch}'s caron is not much taller than the stem`);
          assert.ok(m.x0 > band(base.cmds, b.y1 - (b.y1 - b.y0) * 0.1, b.y1, 0).x1 - 1, `${ch}'s caron stands beside its stem`);
        } else {
          assert.ok(m.y0 > b.y1, `${ch}'s ${a.mark} stands over its letter (${m.y0.toFixed(0)} over ${b.y1.toFixed(0)})`);
          assert.ok(m.y0 > (caps ? cap : xh), `${ch}'s ${a.mark} stands over the ${caps ? 'cap height' : 'x-height'}`);
          assert.ok(m.y1 < (caps ? cap * 1.5 : Math.max(b.y1, xh) + xh * 0.8), `${ch}'s ${a.mark} isn't too tall (${m.y1.toFixed(0)})`);
          // centred over the top of the letter's ink, read along its lean
          if (lean === null) continue;
          const top = band(base.cmds, b.y1 - (b.y1 - Math.max(0, b.y0)) * 0.45, b.y1 - (b.y1 - Math.max(0, b.y0)) * 0.02, lean), ml = box(mark, lean);
          const off = (ml.x0 + ml.x1) / 2 - (top.x0 + top.x1) / 2;
          assert.ok(Math.abs(off) < Math.max(14, base.adv * 0.06), `${ch}'s ${a.mark} centred over ${a.base} (${off.toFixed(1)} off)`);
        }
      }
      // ı is the i without its dot: nothing over its stem (a script's rising a little over the x's top)
      const i = box(font.glyph('i')!.cmds), dotless = box(accentGlyph(font, 'ı')!.cmds);
      assert.ok(dotless.y1 < xh * 1.2 && dotless.y1 < i.y1 - xh * 0.1, `ı stops at its stem (${dotless.y1.toFixed(0)}; i ${i.y1.toFixed(0)})`);
      // ¨ is two of the dot ˙ is
      const mk = (ch: string) => { const a = accentOf(ch)!; return accentGlyph(font, ch)!.cmds.slice(font.glyph(a.base)!.cmds.length); };
      assert.equal(contourCount(mk('ë')), 2 * contourCount(mk('ė')), 'a dieresis is two dots');
    });
  }

  it('are in an exported font only when asked for, each as wide as its letter there', () => {
    const p = style('serif'), plain = opentype.parse(buildOTF(p, 'Plain').buffer as ArrayBuffer);
    for (const ch of 'éőıȘ') assert.equal(plain.charToGlyph(ch).index, 0, `no ${ch} unless asked`);
    const font = opentype.parse(buildOTF(p, 'Accented', undefined, undefined, true).buffer as ArrayBuffer);
    assert.equal(font.glyphs.length, 3 + ALL_CHARS.length + ACCENTED.length);
    for (const ch of ACCENTED) assert.notEqual(font.charToGlyph(ch).index, 0, `${ch} is in it`);
    assert.equal(font.charToGlyph('é').advanceWidth, font.charToGlyph('e').advanceWidth);
    assert.equal(font.charToGlyph('Ő').advanceWidth, font.charToGlyph('O').advanceWidth);
    // the line spacing stays as it is without them
    assert.deepEqual([font.ascender, font.descender], [plain.ascender, plain.descender]);
    // and the specimen shows them, capitals and small letters each a row, when asked
    const paths = (svg: string) => (svg.match(/<path /g) ?? []).length;
    assert.equal(paths(buildSpecimenSVG(p, 'x', true)) - paths(buildSpecimenSVG(p, 'x')), ACCENTED.length);
  });

  it('build a family side by side on the export pool exactly as one after another, accented letters in every member', async () => {
    const p = await inFont('didone'), anchor = anchorOf(p);
    const family = { anchor, styles: [{ weight: 'thin', italic: false }, { weight: 'bold', italic: true }, { weight: anchor, italic: false }] as const };
    const req = { anchor, styles: family.styles.map(s => ({ ...s })) };
    const one = unzip(buildFamilyZip(p, 'Side', req, true));
    const pool = new ExportPool(2, 2);
    try {
      const built = await pool.run({ kind: 'family', name: 'Side', params: p, family: req, accents: true }, [await ownFonts.load(p.freeFont)]);
      assert.match(built.file, /^Side-family\.zip$/);
      const many = unzip(built.data);
      assert.deepEqual([...many.keys()], [...one.keys()], 'the same files in the same order');
      for (const [file, data] of many) {
        assert.ok(normal(data).equals(normal(one.get(file)!)), `${file} the same either way`);
        if (!file.endsWith('.otf')) continue;
        const f = opentype.parse(new Uint8Array(data).buffer);
        for (const ch of 'ąőşı') assert.notEqual(f.charToGlyph(ch).index, 0, `${file} has ${ch}`);
      }
    } finally { pool.close(); }
  });
});

/** A .zip's files by name. */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < buf.readUInt16LE(end + 10); i++) {
    const packed = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), at = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    out.set(name, inflateRawSync(buf.subarray(start, start + packed)));
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

/** A font file with the times it was made (and the checksums they go into) left out, or any other file as it is. */
function normal(b: Buffer): Buffer {
  if (b.toString('latin1', 0, 4) !== 'OTTO') return b;
  const o = Buffer.from(b), n = o.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const rec = 12 + i * 16;
    if (o.toString('latin1', rec, rec + 4) !== 'head') continue;
    const off = o.readUInt32BE(rec + 8);
    o.writeUInt32BE(0, rec + 4);
    o.fill(0, off + 8, off + 12); o.fill(0, off + 20, off + 36);
  }
  return o;
}
