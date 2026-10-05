import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { describe, it } from 'node:test';
import * as opentypeNs from 'opentype.js';
import { STYLES } from '../shared/content';
import { familyMember, familyMembers, WEIGHTS, weightIdOf, weightRatio } from '../shared/family';
import { DEFAULTS, isValidParams, sanitizeParams } from '../shared/params';
import { buildFamilyZip } from '../server/export';

const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs) as typeof opentypeNs;
const serif = STYLES.find(s => s.id === 'serif')!;

/** The files in a .zip, by name. */
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

describe('font family', () => {
  it('names the default weight Regular', () => {
    assert.equal(weightIdOf(DEFAULTS.weight), 'regular');
    assert.equal(weightIdOf(0), 'thin');
    assert.equal(weightIdOf(1), 'black');
  });

  it('keeps the design as the weight it is named as, and gets heavier step by step', () => {
    for (const w of [0.1, 0.4, 0.62, 0.9]) {
      for (const anchor of WEIGHTS.map(x => x.id)) {
        const p = { ...serif.params, weight: w };
        const ws = WEIGHTS.map(x => familyMember(p, anchor, x.id, false).params.weight);
        const own = familyMember(p, anchor, anchor, false).params.weight;
        assert.ok(Math.abs(own - w) < 1e-9, `${anchor} at ${w} is the design`);
        for (let i = 1; i < ws.length; i++) assert.ok(ws[i] >= ws[i - 1], `${anchor}: ${WEIGHTS[i].id} not lighter than ${WEIGHTS[i - 1].id}`);
        for (const v of ws) assert.ok(v >= 0 && v <= 1);
      }
    }
    // Regular at the default weight: Thin is a fraction as heavy, Black over twice
    assert.ok(weightRatio(0.4, 'regular', 'thin') < 0.4);
    assert.ok(weightRatio(0.4, 'regular', 'black') > 2.5);
  });

  it('reweighs and reslants letters with their own weight or slant, and keeps valid settings', () => {
    const p = sanitizeParams({ ...serif.params, glyphs: { a: { weight: 0.6, slant: 0.2 } } });
    const bold = familyMember(p, 'regular', 'bold', true);
    assert.ok(bold.params.glyphs.a.weight! > 0.6);
    assert.ok(Math.abs(bold.params.glyphs.a.slant! - (0.2 + bold.params.slant)) < 1e-9);
    assert.ok(isValidParams(bold.params));
    assert.equal(bold.style, 'Bold Italic');
    assert.equal(familyMember(p, 'regular', 'regular', true).style, 'Italic');
    // a slanted design keeps its slant in the italics and stands up in the uprights
    const slanted = { ...serif.params, slant: 0.3 };
    assert.equal(familyMember(slanted, 'regular', 'regular', true).params.slant, 0.3);
    assert.equal(familyMember(slanted, 'regular', 'regular', false).params.slant, 0);
  });

  it('exports every member as a font of one family', () => {
    const req = { anchor: 'regular' as const, weights: ['light', 'regular', 'bold'] as const, upright: true, italic: true };
    assert.equal(familyMembers(serif.params, { ...req, weights: [...req.weights] }).length, 6);
    const files = unzip(buildFamilyZip(serif.params, 'My Serif', { ...req, weights: [...req.weights] }));
    assert.deepEqual([...files.keys()], ['Light', 'LightItalic', 'Regular', 'Italic', 'Bold', 'BoldItalic'].map(s => `My-Serif/My-Serif-${s}.otf`));
    const info = (name: string) => {
      const buf = files.get(`My-Serif/My-Serif-${name}.otf`)!;
      const f = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)) as unknown as {
        getEnglishName(k: string): string; tables: { os2: { usWeightClass: number; fsSelection: number }; post: { italicAngle: number }; head: { macStyle: number } };
      };
      return { family: f.getEnglishName('fontFamily'), sub: f.getEnglishName('fontSubfamily'), typo: f.getEnglishName('preferredFamily'), typoSub: f.getEnglishName('preferredSubfamily'),
        cls: f.tables.os2.usWeightClass, sel: f.tables.os2.fsSelection, angle: f.tables.post.italicAngle, mac: f.tables.head.macStyle };
    };
    assert.deepEqual(info('Regular'), { family: 'My Serif', sub: 'Regular', typo: 'My Serif', typoSub: 'Regular', cls: 400, sel: 64, angle: 0, mac: 0 });
    assert.deepEqual(info('BoldItalic'), { family: 'My Serif', sub: 'Bold Italic', typo: 'My Serif', typoSub: 'Bold Italic', cls: 700, sel: 33, angle: -11, mac: 3 });
    assert.deepEqual(info('LightItalic'), { family: 'My Serif Light', sub: 'Italic', typo: 'My Serif', typoSub: 'Light Italic', cls: 300, sel: 1, angle: -11, mac: 2 });
    // heavier weights draw heavier: more ink in the l
    const ink = (name: string) => {
      const buf = files.get(`My-Serif/My-Serif-${name}.otf`)!;
      const bb = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)).charToGlyph('l').getBoundingBox();
      return bb.x2 - bb.x1;
    };
    assert.ok(ink('Light') < ink('Regular') && ink('Regular') < ink('Bold'));
  });
});
