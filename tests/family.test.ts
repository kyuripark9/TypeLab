/* Font families (shared/family.ts) and their export as a .zip of OpenType fonts (server/export.ts): the
   weights' names, each member's settings, and the names and style bits each font file carries. */
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { describe, it } from 'node:test';
import { STYLES } from '../shared/content';
import { anchorOf, FAMILY_STYLES, familyMember, familyMembers, ownStyle, stemRatio, WEIGHTS, weightIdOf } from '../shared/family';
import { STYLE_FONTS } from '../shared/free-fonts';
import { DEFAULTS, freeAtOf, isValidParams, sanitizeParams, weightScale, weightUnscale, type Params } from '../shared/params';
import { buildFont, freeFont, registerFreeFont, type Cmd, type Glyph } from '../shared/engine';
import { cmdsBox, toPolys } from '../shared/engine/geom';
import { buildFamilyZip } from '../server/export';
import { FreeFonts } from '../server/free-fonts';
import { opentype } from '../server/opentype';

const serif = STYLES.find(s => s.id === 'serif')!;

/** The ink's runs down the column at x (or across the row at y), as [start, end] pairs, overlapping pieces as one. */
function inkRuns(cmds: Cmd[], at: number, down: boolean): [number, number][] {
  const hits: { t: number; d: number }[] = [];
  for (const poly of toPolys(cmds)) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const [pa, pb, qa, qb] = down ? [a.x, b.x, a.y, b.y] : [a.y, b.y, a.x, b.x];
    if ((pa <= at) !== (pb <= at)) hits.push({ t: qa + (qb - qa) * (at - pa) / (pb - pa), d: pb > pa ? 1 : -1 });
  }
  hits.sort((p, q) => p.t - q.t);
  const runs: [number, number][] = [];
  let w = 0, from = 0;
  for (const h of hits) { const was = w; w += h.d; if (!was && w) from = h.t; else if (was && !w) runs.push([from, h.t]); }
  return runs;
}

/** An outline with each curve cut in four: toPolys reads a curve as six straight pieces, whose chords cut a long smooth
    curve's hairline thinner than it is. */
function finer(cmds: Cmd[]): Cmd[] {
  const out: Cmd[] = [], mix = (a: number[], b: number[], t: number) => a.map((v, k) => v + (b[k] - v) * t);
  let at = [0, 0];
  for (const c of cmds) {
    if (c[0] === 'C') {
      let p = [at, [c[1], c[2]], [c[3], c[4]], [c[5], c[6]]];
      for (let k = 4; k > 1; k--) {
        const t = 1 / k, a = mix(p[0], p[1], t), b = mix(p[1], p[2], t), d = mix(p[2], p[3], t), ab = mix(a, b, t), bd = mix(b, d, t), m = mix(ab, bd, t);
        out.push(['C', a[0], a[1], ab[0], ab[1], m[0], m[1]] as Cmd);
        p = [m, bd, d, p[3]];
      }
      out.push(['C', p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]] as Cmd);
    } else out.push(c);
    if (c[0] !== 'Z') at = [c[c.length - 2] as number, c[c.length - 1] as number];
  }
  return out;
}

/** How thick a design's letters draw their hairlines and stems: the H's crossbar down the middle of the letter, the
    o's thinnest (its top and bottom, down the middle of the bowl), and the n's stem across the middle of its height. */
function hairlines(p: Params) {
  // (an italic read upright, as it was drawn before it leaned: read straight up through a leaning bowl, a hairline that
  // runs on thin further round it, as a lighter weight's does, reads thinner than it is)
  const f = buildFont(p), lean = f.m.slant;
  const upright = (g: Glyph) => finer(g.cmds.map(c => c.map((v, k) => (k % 2 && typeof v === 'number' ? v - lean * (c[k + 1] as number) : v)) as Cmd));
  const H = upright(f.glyph('H')!), o = upright(f.glyph('o')!), n = upright(f.glyph('n')!);
  const bh = cmdsBox(H)!, bo = cmdsBox(o)!, bn = cmdsBox(n)!;
  const bar = inkRuns(H, (bh.x0 + bh.x1) / 2, true).filter(([lo, hi]) => lo > bh.y1 * 0.2 && hi < bh.y1 * 0.8);
  let oThin = Infinity;
  for (let k = 0; k <= 20; k++) {
    const runs = inkRuns(o, bo.x0 + (bo.x1 - bo.x0) * (0.3 + 0.4 * k / 20), true);
    if (runs.length >= 2) oThin = Math.min(oThin, runs[0][1] - runs[0][0], runs[runs.length - 1][1] - runs[runs.length - 1][0]);
  }
  const [stem] = inkRuns(n, (bn.y0 + bn.y1) / 2, false);
  assert.equal(bar.length, 1, 'one crossbar');
  return { bar: bar[0][1] - bar[0][0], o: oThin, stem: stem[1] - stem[0] };
}

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

  it('reads a weight back off the weight scale (weightUnscale undoes weightScale)', () => {
    for (let i = 0; i <= 16; i++) assert.ok(Math.abs(weightUnscale(weightScale(i / 16)) - i / 16) < 1e-12, String(i / 16));
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
    // Regular at the default weight: Thin's stems a fraction as thick, Black's over twice
    const stem = buildFont(DEFAULTS).m.s;
    assert.ok(stemRatio(stem, 'regular', 'thin') < 0.4);
    assert.ok(stemRatio(stem, 'regular', 'black') > 2.4);
  });

  it('reads a design by its stems, and steps as the weights\' places do where Verticals already draw them heavy', () => {
    // Weight 65 is a SemiBold's, but at Verticals 97 its stems are past a Black's
    assert.equal(anchorOf({ ...DEFAULTS, weight: 0.65 }), 'semibold');
    const p = { ...DEFAULTS, weight: 0.65, vWeight: 0.97 }, anchor = anchorOf(p);
    assert.equal(anchor, 'black');
    assert.equal(ownStyle(p).style, 'Black');
    // every weight lighter than the next by about the step between their places on the slider, Thin as light as a plain Thin
    const stems = WEIGHTS.map(w => buildFont(familyMember(p, anchor, w.id, false).params).m.s);
    const places = WEIGHTS.map(w => buildFont({ ...DEFAULTS, weight: w.at }).m.s);
    for (let i = 1; i < stems.length; i++) {
      const step = stems[i] / stems[i - 1], place = places[i] / places[i - 1];
      assert.ok(step > 1.1 && step > place * 0.9 && step < place * 1.2, `${WEIGHTS[i].id}: ${stems[i - 1]} → ${stems[i]}, places ${place.toFixed(2)}`);
    }
    assert.ok(Math.abs(stems[0] - places[0]) < 0.5);
    for (const w of WEIGHTS) assert.ok(isValidParams(sanitizeParams(familyMember(p, anchor, w.id, true).params)));
  });

  it('steps on across a design that reads as Light as across a Regular: its Regular as much heavier as a Regular is than a Light', () => {
    // the Comic card, Weight 30: spread evenly either side of it, its Regular's stems were 1.22 of its own, its
    // ExtraLight's 0.57
    const p = { ...DEFAULTS, weight: 0.3 }, anchor = anchorOf(p);
    assert.equal(anchor, 'light');
    const stems = WEIGHTS.map(w => buildFont(familyMember(p, anchor, w.id, false).params).m.s);
    const places = WEIGHTS.map(w => buildFont({ ...DEFAULTS, weight: w.at }).m.s);
    assert.ok(stems[3] / stems[2] > 0.9 * places[3] / places[2], `Regular ${stems[3]} over Light ${stems[2]}`);
    for (let i = 1; i < stems.length; i++) assert.ok(stems[i] > stems[i - 1] * 1.1, `${WEIGHTS[i].id}: ${stems[i - 1]} → ${stems[i]}`);
    // a Regular design's family sits on the places
    for (const w of WEIGHTS) assert.ok(Math.abs(buildFont(familyMember(DEFAULTS, 'regular', w.id, false).params).m.s - buildFont({ ...DEFAULTS, weight: w.at }).m.s) < 1, w.id);
  });

  it('keeps a high-contrast design\'s hairlines as thick as its own in its lighter weights, with less contrast, its stems still stepping lighter', async () => {
    // the Didone card: Contrast 100, in the engine's letters and in its own font, Couture, whose lighter weights' H read
    // as II at text sizes, their crossbar half as thick as the design's
    const didone = STYLES.find(s => s.id === 'didone')!.params, id = STYLE_FONTS.didone;
    if (!freeFont(id)) registerFreeFont(await new FreeFonts(null, async (url: string): Promise<never> => { throw new Error(`fetched ${url}`); }).load(id));
    const inFont = { ...didone, freeFont: id, freeAt: freeAtOf(didone) };
    for (const [p, name] of [[didone, 'engine'], [inFont, 'Couture']] as const) {
      const anchor = anchorOf(p), a = WEIGHTS.findIndex(w => w.id === anchor);
      assert.equal(anchor, 'semibold');
      for (const italic of [false, true]) {
        const looks = WEIGHTS.map(w => hairlines(familyMember(p, anchor, w.id, italic).params)), own = looks[a];
        for (let i = 0; i < a; i++) {
          const at = `${name} ${WEIGHTS[i].id}${italic ? ' italic' : ''}`, l = looks[i];
          // the stems still step lighter, and the lighter weights draw less contrast
          assert.ok(l.stem < looks[i + 1].stem, `${at}: stems ${l.stem} → ${looks[i + 1].stem}`);
          assert.ok(familyMember(p, anchor, WEIGHTS[i].id, italic).params.contrast < p.contrast, `${at}: less contrast`);
          // its crossbar as thick as the design's (to a unit, where a font's points stand), or, where its stems are
          // thinner than the design's hairline (the engine's Thin), most of its stems' thickness; and its o's thinnest
          // about as thick (a heavier pen's bowl comes out a little thicker than its bars at the top)
          const want = (v: number) => Math.min(v, 0.85 * l.stem) - 0.5;
          assert.ok(l.bar >= want(own.bar), `${at}: crossbar ${l.bar}, the design's ${own.bar}`);
          assert.ok(l.o >= 0.9 * want(own.o), `${at}: the o's thinnest ${l.o}, the design's ${own.o}`);
          assert.ok(l.bar < l.stem, `${at}: crossbar ${l.bar} thinner than its stems ${l.stem}`);
        }
        // Couture's Thin keeps the design's hairline whole
        if (name === 'Couture') assert.ok(looks[0].bar >= own.bar - 0.5 && looks[0].o >= own.o - 0.5, `Couture Thin: ${JSON.stringify(looks[0])}, the design's ${JSON.stringify(own)}`);
        // the heavier weights as they were
        for (const w of WEIGHTS.slice(a)) {
          const m: Params = familyMember(p, anchor, w.id, italic).params;
          assert.deepEqual([m.contrast, m.hWeight], [p.contrast, p.hWeight], w.id);
        }
      }
    }
    // a letter with its own contrast has as much less
    const ownA = sanitizeParams({ ...didone, glyphs: { a: { contrast: 0.9 } } }), thin = familyMember(ownA, 'semibold', 'thin', false).params;
    assert.ok(thin.contrast < ownA.contrast && Math.abs(thin.glyphs.a.contrast! - (0.9 + thin.contrast - ownA.contrast)) < 1e-9);
    assert.ok(isValidParams(thin));
    // a sans, whose bars are nearly as heavy as its stems, thins them with its stems as before
    for (const w of WEIGHTS) {
      const m = familyMember(DEFAULTS, 'regular', w.id, false).params;
      assert.deepEqual([m.contrast, m.hWeight], [DEFAULTS.contrast, DEFAULTS.hWeight], w.id);
    }
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

  it('thickens and thins letters drawn in Points with the family, keeps them as drawn in the design, and leans them in its italics', () => {
    // an l drawn as a plain stem, standing on the baseline and reaching the capitals' height
    const l = { adv: 320, contours: [[{ x: 60, y: 0 }, { x: 260, y: 0 }, { x: 260, y: 700 }, { x: 60, y: 700 }]] };
    const p = sanitizeParams({ ...DEFAULTS, outlines: { l } }), anchor = anchorOf(p);
    const glyph = (weight: (typeof WEIGHTS)[number]['id'], italic = false) => buildFont(familyMember(p, anchor, weight, italic).params).glyph('l')!;
    const box = (g: Glyph) => {
      const xs = g.cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 0) as number[]), ys = g.cmds.flatMap(c => c.slice(2).filter((_, i) => i % 2 === 0) as number[]);
      return { w: Math.max(...xs) - Math.min(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
    // the design's own style draws it exactly as drawn
    assert.equal(glyph(anchor).d, buildFont(p).glyph('l')!.d);
    // lighter and heavier, as tall as drawn and its edges still straight (four corners)
    const thin = box(glyph('thin')), black = box(glyph('black'));
    assert.ok(thin.w < 200 * 0.6 && black.w > 200 * 1.3, `thin ${thin.w}, black ${black.w}`);
    for (const b of [thin, black]) { assert.ok(Math.abs(b.y0) < 0.5 && Math.abs(b.y1 - 700) < 0.5); }
    assert.equal(glyph('thin').cmds.filter(c => c[0] !== 'Z').length, 4);
    // leaning in the italic: its top stands further right than its foot
    const it = glyph(anchor, true).cmds, top = it.filter(c => c[2] === 700).map(c => c[1] as number), foot = it.filter(c => c[2] === 0).map(c => c[1] as number);
    assert.ok(Math.min(...top) > Math.min(...foot) + 50);
  });

  it('lists every style once, and names the design by its weight and lean', () => {
    assert.equal(new Set(FAMILY_STYLES.map(f => f.style)).size, WEIGHTS.length * 2);
    const p = { ...serif.params, weight: DEFAULTS.weight, slant: 0 };
    assert.equal(ownStyle(p).style, 'Regular');
    assert.equal(ownStyle({ ...p, weight: 0.72 }).style, 'Bold');
    assert.equal(ownStyle({ ...p, slant: 0.3 }).style, 'Italic');
    assert.equal(ownStyle({ ...p, weight: 0.03, slant: 0.3 }).style, 'Thin Italic');
  });

  it('exports every member as a font of one family', () => {
    // picked in any order, and twice: each built once, lightest first, upright before italic
    const req = { anchor: 'regular' as const, styles: (['bold', 'light', 'regular'] as const).flatMap(weight => [{ weight, italic: true }, { weight, italic: false }]) };
    assert.equal(familyMembers(serif.params, { ...req, styles: [...req.styles, ...req.styles] }).length, 6);
    // any styles, not whole weights: Regular and Bold Italic alone
    assert.deepEqual(familyMembers(serif.params, { anchor: 'regular', styles: [{ weight: 'bold', italic: true }, { weight: 'regular', italic: false }] }).map(m => m.style), ['Regular', 'Bold Italic']);
    const files = unzip(buildFamilyZip(serif.params, 'My Serif', req));
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
