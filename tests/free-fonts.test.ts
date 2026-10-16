/* Free fonts: every style's font (shared/free-fonts.ts), turning a font file into outlines as the server
   does (server/free-fonts.ts), drawing a design written in one and moving its letters by the settings
   (shared/engine/free-letters.ts, skin.ts, restyle.ts), its notice in an export, and the API that serves
   them; and TypeLab's own fonts (fonts/), which the Style page's cards are written in. The Google fonts here are
   small ones made in the test, so nothing is fetched. */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import type { FontConstructorOptions } from 'opentype.js';
import { PAGE_STYLES, STYLES } from '../shared/content';
import { ALL_CHARS, CHARSET, buildFont, fitOutline, freeFont, freeFontsWanted, packNode, registerFreeFont, type FreeFontData, type Glyph } from '../shared/engine';
import { combine, shape, unite } from '../shared/engine/boolean';
import { toPolys } from '../shared/engine/geom';
import { metrics, resolve } from '../shared/engine/font';
import { formChanged, widthOfScale } from '../shared/engine/free-letters';
import { bowlLook, cornerLooks, restyleBowls, restyleCorners, restyleDots, restyleEnds, restylePeaks, restyleStencil, stencilLook } from '../shared/engine/restyle';
import { skeleton } from '../shared/engine/scan';
import { lineSkeleton } from '../shared/engine/lines';
import { SKIN_KEYS, skinFollows, skinRig } from '../shared/engine/skin';
import { familyMember } from '../shared/family';
import { OLD_FONTS, OWN_FAMILIES, STYLE_FONTS, isOwnFont, nearestFont, parseFontId } from '../shared/free-fonts';
import { DEFAULTS, FREE_AT_KEYS, freeAtOf, sanitizeParams, xHeightOfRatio, xHeightRatio, type Params } from '../shared/params';
import { createApp } from '../server/app';
import { DesignStore } from '../server/db';
import { buildOTF } from '../server/export';
import { FreeFonts } from '../server/free-fonts';
import { opentype } from '../server/opentype';

/** A small font file: an H of two stems and a bar, an o of two rings drawn with quadratic curves, and a space. */
function fontFile(upm = 2048): ArrayBuffer {
  const H = new opentype.Path();
  for (const [x0, x1, y0, y1] of [[100, 300, 0, 1400], [900, 1100, 0, 1400], [300, 900, 600, 800]]) {
    H.moveTo(x0, y0); H.lineTo(x1, y0); H.lineTo(x1, y1); H.lineTo(x0, y1); H.close();
  }
  const o = new opentype.Path();
  o.moveTo(600, 0); o.quadraticCurveTo(1100, 0, 1100, 500); o.quadraticCurveTo(1100, 1000, 600, 1000);
  o.quadraticCurveTo(100, 1000, 100, 500); o.quadraticCurveTo(100, 0, 600, 0); o.close();
  const font = new opentype.Font({
    familyName: 'Parisienne', styleName: 'Regular', unitsPerEm: upm, ascender: 1800, descender: -500,
    copyright: 'Copyright 2010 The Test Project Authors', licenseURL: 'https://openfontlicense.org',
    glyphs: [
      new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 600, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 512, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'H', unicode: 72, advanceWidth: 1200, path: H }),
      new opentype.Glyph({ name: 'o', unicode: 111, advanceWidth: 1200, path: o })
    ]
  } as unknown as FontConstructorOptions);
  return font.toArrayBuffer();
}

/** Google Fonts as the server sees it: the CSS naming a file, then the file. */
function googleFonts(file = fontFile()) {
  const asked: string[] = [];
  const get = async (url: string) => {
    asked.push(url);
    const css = url.startsWith('https://fonts.googleapis.com/css?'), license = url.startsWith('https://raw.githubusercontent.com/google/fonts/');
    return { ok: true, status: 200, text: async () => (css ? '@font-face { src: url(https://fonts.gstatic.com/s/test/v1/x.ttf) format(\'truetype\'); }' : license ? 'SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007\n' : ''), arrayBuffer: async () => file };
  };
  return { get, asked };
}

describe('free fonts', () => {
  it('give every style a font that is one of the families, in a weight it comes in, all but those built from blocks', () => {
    // styles off the page too: a design saved from one can still be written in its free font; no font draws blocks
    for (const s of STYLES) {
      const id = STYLE_FONTS[s.id];
      if (s.params.build === 'blocks') { assert.equal(id, undefined, `${s.id} is built from blocks`); continue; }
      assert.ok(id, `${s.id} has a free font`);
      assert.ok(parseFontId(id), `${s.id}'s ${id} is a font the families have`);
    }
  });

  it('keep a free font in the settings only when it is one of them', () => {
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Parisienne:400' }).freeFont, 'Parisienne:400');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Parisienne:700' }).freeFont, '');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Comic Sans:400' }).freeFont, '');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'constructor:400' }).freeFont, '');
    assert.equal(sanitizeParams({ ...DEFAULTS }).freeFont, '');
  });

  it('find the nearest weight of a family, and its italic where it has one', () => {
    assert.equal(nearestFont('Noto Sans', 950, false), 'Noto Sans:900');
    assert.equal(nearestFont('Noto Sans', 640, true), 'Noto Sans:600i');
    assert.equal(nearestFont('Parisienne', 700, true), 'Parisienne:400');
  });

  it('convert a font file into outlines at 1000 units to the em, curves as cubics, with its notice and licence', async () => {
    const g = googleFonts(), fonts = new FreeFonts(null, g.get);
    const data = await fonts.load('Parisienne:400');
    assert.match(g.asked[0], /family=Parisienne:400$/);
    assert.equal(data.glyphs.H[0], Math.round(1200 * 1000 / 2048));
    assert.equal(data.glyphs.H[1].length, 3);
    assert.ok(data.glyphs.o[1][0].every(n => n.length === 6), 'every point of the o has both handles');
    assert.equal(data.space, 250);
    assert.equal(data.license, 'SIL Open Font License, Version 1.1');
    assert.match(data.copyright, /Test Project Authors/);
    assert.ok(!data.glyphs.x, 'a character the font lacks is left out');
    assert.equal(g.asked[2], 'https://raw.githubusercontent.com/google/fonts/main/ofl/parisienne/OFL.txt');
    assert.match(data.licenseText!, /^SIL OPEN FONT LICENSE Version 1\.1/);
    // asked again, it comes from memory
    await fonts.load('Parisienne:400');
    assert.equal(g.asked.length, 3);
    await assert.rejects(fonts.load('Comic Sans:400'));
  });

  it('draw a design written in a free font with its letters, as tall as the design\'s capitals, and the rest built', async () => {
    const fonts = new FreeFonts(null, googleFonts().get), st = STYLES.find(s => s.id === 'chancery')!;
    const params = { ...st.params, freeFont: 'Parisienne:400' };
    assert.equal(buildFont(params).freePending, !freeFont('Parisienne:400'));
    await fonts.ready(params);
    const f = buildFont(params), H = f.glyph('H')!, x = f.glyph('x')!;
    assert.equal(f.freePending, false);
    assert.ok(H.drawn, 'H is the font\'s');
    const top = Math.max(...H.cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 1) as number[]));
    assert.ok(Math.abs(top - f.m.cap) < 2, `the H's top ${top} stands at the cap height ${f.m.cap}`);
    assert.ok(!x.drawn, 'x, missing from the font, is built from the settings');
  });

  it('pass the font\'s notice and licence on to an export, under another name than the font\'s', async () => {
    const fonts = new FreeFonts(null, googleFonts().get), params = { ...DEFAULTS, freeFont: 'Parisienne:400' };
    await fonts.ready(params);
    const otf = opentype.parse(buildOTF(params, 'Parisienne').buffer as ArrayBuffer);
    const names = ((otf.names as unknown as { windows?: Record<string, { en: string }> }).windows ?? otf.names) as Record<string, { en: string }>;
    assert.match(names.copyright.en, /Test Project Authors.*TypeLab/);
    assert.match(names.license.en, /Open Font License.*\n\nSIL OPEN FONT LICENSE Version 1\.1/s);
    assert.equal(names.licenseURL.en, 'https://openfontlicense.org');
    assert.equal(names.fontFamily.en, 'TypeLab Font');
    const mine = opentype.parse(buildOTF(params, 'My parisienne Wedding').buffer as ArrayBuffer);
    assert.equal(((mine.names as unknown as { windows: Record<string, { en: string }> }).windows).fontFamily.en, 'My Wedding');
    // a name its licence reserves goes too, not only the family's
    const slab = { ...DEFAULTS, freeFont: 'Josefin Slab:300' };
    await new FreeFonts(null, googleFonts().get).ready(slab);
    const josefin = opentype.parse(buildOTF(slab, 'Josefin Code').buffer as ArrayBuffer);
    assert.equal(((josefin.names as unknown as { windows: Record<string, { en: string }> }).windows).fontFamily.en, 'Code');
  });

  it('give a family member the font of its family at the member\'s weight', () => {
    const p = { ...DEFAULTS, weight: 0.6, freeFont: 'Noto Sans:600', freeAt: { weight: 0.6, slant: 0 } };
    assert.ok(freeFontsWanted(familyMember(p, 'semibold', 'black', false).params).includes('Noto Sans:900'));
    assert.ok(freeFontsWanted(familyMember(p, 'semibold', 'semibold', true).params).includes('Noto Sans:600i'));
    assert.deepEqual(freeFontsWanted(familyMember(p, 'semibold', 'semibold', false).params), ['Noto Sans:600']);
  });

  it('move a free font\'s letters with the settings, as far as they are moved from the ones it was picked at', () => {
    // an H of two stems and a bar, as the server sends it
    const rects = [[100, 300, 0, 700], [500, 700, 0, 700], [300, 500, 300, 400]];
    registerFreeFont({ id: 'Noto Sans:600', family: 'Noto Sans', designers: ['Test'], copyright: '', license: 'OFL', licenseUrl: '', cap: 700, xh: 500, space: 250,
      glyphs: { H: [800, rects.map(([x0, x1, y0, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]])] } } as FreeFontData);
    const at = { ...DEFAULTS, weight: 0.6, freeFont: 'Noto Sans:600', freeAt: { weight: 0.6, width: 0.5, slant: 0, fill: 'solid' as const } };
    const box = (g: Glyph) => {
      const xs = g.cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 0) as number[]), ys = g.cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 1) as number[]);
      return { w: Math.max(...xs) - Math.min(...xs), topX: Math.min(...g.cmds.filter(c => c[2] === Math.max(...ys)).map(c => c[1] as number)) };
    };
    const H = buildFont(at).glyph('H')!, base = box(H);
    assert.ok(H.drawn, 'H is the font\'s');
    // heavier: Noto Sans 900 is asked for, and until it comes the 600's stems are pushed out
    const heavy = buildFont({ ...at, weight: 0.9 });
    assert.ok(heavy.freeMissing.includes('Noto Sans:900') && heavy.freePending);
    assert.ok(box(heavy.glyph('H')!).w > base.w + 20, 'the H is bolder');
    assert.ok(box(buildFont({ ...at, width: 1 }).glyph('H')!).w > base.w * 1.3, 'the H is wider');
    assert.ok(box(buildFont({ ...at, slant: 0.4 }).glyph('H')!).topX > box(H).topX + 50, 'the H leans');
    const px = buildFont({ ...at, fill: 'pixels' }).glyph('H')!;
    assert.notEqual(px.d, H.d, 'pixels reach it');
    assert.ok(px.drawn, 'and Points still starts from its outline');
    // the settings it was picked at leave it as the font has it
    assert.equal(buildFont({ ...at, fill: 'solid' }).glyph('H')!.d, H.d);
  });

  it('move a free font\'s letters on their skeletons: the bar by Crossbar and Contrast, the lowercase by x-height, keeping the heights', () => {
    // an H of two stems and a bar, and an n of two stems under a bar, as the server sends them
    const rect = ([x0, x1, y0, y1]: number[]): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    registerFreeFont({ id: 'Noto Sans:500', family: 'Noto Sans', designers: ['Test'], copyright: '', license: 'OFL', licenseUrl: '', cap: 700, xh: 500, space: 250,
      glyphs: {
        H: [800, [[100, 300, 0, 700], [500, 700, 0, 700], [300, 500, 300, 400]].map(rect)],
        n: [600, [[[100, 0], [200, 0], [200, 420], [400, 420], [400, 0], [500, 0], [500, 500], [100, 500]]]]
      } } as FreeFontData);
    const at = { ...DEFAULTS, weight: 0.5, freeFont: 'Noto Sans:500', freeAt: { weight: 0.5, contrast: 0.5, crossbar: 0.5, xHeight: DEFAULTS.xHeight, width: 0.5, slant: 0, fill: 'solid' as const } };
    // the ink down the column at x, as [bottom, top] runs, read off the letter's outline (nonzero)
    const column = (g: Glyph, x: number) => {
      const hits: { y: number; w: number }[] = [];
      for (const c of g.drawn!.contours) c.forEach((a, i) => {
        const b = c[(i + 1) % c.length];
        if ((a.x <= x) !== (b.x <= x)) hits.push({ y: a.y + (x - a.x) / (b.x - a.x) * (b.y - a.y), w: b.x > a.x ? 1 : -1 });
      });
      hits.sort((p, q) => p.y - q.y);
      const out: [number, number][] = [];
      let w = 0, from = 0;
      for (const h of hits) { const was = w; w += h.w; if (!was && w) from = h.y; if (was && !w) out.push([from, h.y]); }
      return out;
    };
    const H = buildFont(at).glyph('H')!, mid = (H.drawn!.contours.flat().reduce((a, n) => Math.max(a, n.x), 0)) / 2;
    const bar = (g: Glyph) => column(g, mid).find(([a, b]) => b - a < 300)!;
    const [b0, b1] = bar(H);
    // unmoved, the letters are the font's
    assert.ok(Math.abs(b0 - 300) < 1 && Math.abs(b1 - 400) < 1, `the bar is where the font has it (${b0}, ${b1})`);
    // Crossbar raises the bar and keeps it as thick; Contrast thins it
    const [r0, r1] = bar(buildFont({ ...at, crossbar: 0.9 }).glyph('H')!);
    assert.ok((r0 + r1) / 2 > (b0 + b1) / 2 + 40 && Math.abs((r1 - r0) - (b1 - b0)) < 6, `Crossbar raises the bar (${r0}, ${r1})`);
    const [c0, c1] = bar(buildFont({ ...at, contrast: 1 }).glyph('H')!);
    assert.ok(c1 - c0 < (b1 - b0) - 15, `Contrast thins the bar (${c0}, ${c1})`);
    // heavier on its skeleton, the H keeps its height, standing on the baseline
    const heavy = buildFont({ ...at, weight: 0.8 }), Hb = heavy.glyph('H')!, stem = column(Hb, 150 * heavy.m.cap / 700)[0];
    assert.ok(heavy.freePending, 'the 800 the Weight asks for has not come, so the 500 is moved the rest of the way');
    assert.ok(Math.abs(stem[0]) < 2 && Math.abs(stem[1] - heavy.m.cap) < 2, `a heavier H keeps its height (${stem})`);
    // a lower x-height lowers the n; the H keeps its height (its bar thins a little, as the engine's own
    // bars are kept under a share of the x-height)
    const low = buildFont({ ...at, xHeight: 0.2 }), n0 = column(buildFont(at).glyph('n')!, 150)[0], n1 = column(low.glyph('n')!, 150)[0];
    assert.ok(n1[1] < n0[1] - 60 && Math.abs(n1[0]) < 2, `the n is lower (${n0} to ${n1})`);
    assert.deepEqual(column(low.glyph('H')!, 150), column(H, 150), 'the capitals keep their height');
  });

  it('give a free font\'s letters the engine\'s ends, serifs, corners, stencil and inline, as far as the settings move past the ones it was picked at', () => {
    // an H of two stems and a bar, and a c: a thick arc open to the right, as the server sends them
    const rect = ([x0, x1, y0, y1]: number[]): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const arc: [number, number][] = [];
    for (let k = 0; k <= 40; k++) { const a = (40 + 280 * k / 40) * Math.PI / 180; arc.push([Math.round(350 + 300 * Math.cos(a)), Math.round(350 + 300 * Math.sin(a))]); }
    for (let k = 40; k >= 0; k--) { const a = (40 + 280 * k / 40) * Math.PI / 180; arc.push([Math.round(350 + 210 * Math.cos(a)), Math.round(350 + 210 * Math.sin(a))]); }
    registerFreeFont({ id: 'Noto Sans:400', family: 'Noto Sans', designers: ['Test'], copyright: '', license: 'OFL', licenseUrl: '', cap: 700, xh: 500, space: 250,
      glyphs: { H: [800, [[100, 190, 0, 700], [510, 600, 0, 700], [150, 550, 310, 390]].map(rect)], c: [700, [arc]] } } as FreeFontData);
    const at = { ...DEFAULTS, weight: 0.4, freeFont: 'Noto Sans:400' }, p = sanitizeParams(at);
    assert.equal(p.freeAt.terminal, DEFAULTS.terminal, 'a design written in a free font stands for every setting its letters follow');
    const H = buildFont(p).glyph('H')!, c = buildFont(p).glyph('c')!;
    // the ink along the row at height y, as [left, right] runs, read off the letter's outline (nonzero)
    const row = (g: Glyph, y: number) => {
      const hits: { x: number; w: number }[] = [];
      for (const cn of g.drawn!.contours) {
        const pts: { x: number; y: number }[] = [];
        cn.forEach((a, i) => { const b = cn[(i + 1) % cn.length]; for (let k = 0; k < 8; k++) { const t = k / 8, u = 1 - t, p1 = { x: a.ox ?? a.x, y: a.oy ?? a.y }, p2 = { x: b.ix ?? b.x, y: b.iy ?? b.y };
          pts.push({ x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y }); } });
        pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]; if ((a.y <= y) !== (b.y <= y)) hits.push({ x: a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x), w: b.y > a.y ? 1 : -1 }); });
      }
      hits.sort((a, b) => a.x - b.x);
      const out: [number, number][] = [];
      let w = 0, from = 0;
      for (const h of hits) { const was = w; w += h.w; if (!was && w) from = h.x; if (was && !w) out.push([from, h.x]); }
      return out;
    };
    const k = buildFont(p).m.cap / 700, foot = (g: Glyph) => row(g, 5 * k)[0];
    // serifs set on the stems' feet: the foot of the left stem reaches out past it both ways
    const [f0, f1] = foot(H), [s0, s1] = foot(buildFont({ ...p, serif: true }).glyph('H')!);
    assert.ok(s1 - s0 > (f1 - f0) * 1.5, `serifs reach out from the foot (${f0}..${f1} to ${s0}..${s1})`);
    // a stencil cuts the bar from a stem: across its middle, the ink runs in more pieces
    assert.ok(row(buildFont({ ...p, stencil: 0.6 }).glyph('H')!, 350 * k).length > row(H, 350 * k).length, 'the stencil opens a join');
    // round corners: the H's square corners come out curved
    assert.ok(!H.drawn!.contours.flat().some(n => n.ox !== undefined), 'the H as drawn has no curves');
    assert.ok(buildFont({ ...p, roundness: 1 }).glyph('H')!.drawn!.contours.flat().some(n => n.ox !== undefined), 'Roundness rounds its corners');
    // a round end on the c, and a ball; the H, with no such end, is left as it is
    assert.notEqual(buildFont({ ...p, terminal: 'round' }).glyph('c')!.d, c.d, 'the c takes round ends');
    assert.notEqual(buildFont({ ...p, terminal: 'round', terminalForm: 'ball' }).glyph('c')!.d, c.d, 'and balls');
    assert.equal(buildFont({ ...p, terminal: 'round' }).glyph('H')!.d, H.d, 'the H has no such ends');
    // the inline runs down the strokes, cutting a line out of them
    assert.notEqual(buildFont({ ...p, fill: 'inline' }).glyph('H')!.d, H.d, 'the inline reaches it');
  });

  it('draw a letter asked for in a form the font hasn\'t got as the engine\'s (the twin\'s), and leave the rest the font\'s', () => {
    // an H of two stems and a bar, and an a: a box with a hole, as the server sends them
    const rect = ([x0, x1, y0, y1]: number[]): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    registerFreeFont({ id: 'Noto Sans:300', family: 'Noto Sans', designers: ['Test'], copyright: '', license: 'OFL', licenseUrl: '', cap: 700, xh: 500, space: 250,
      glyphs: { H: [800, [[100, 190, 0, 700], [510, 600, 0, 700], [150, 550, 310, 390]].map(rect)], a: [600, [[100, 500, 0, 500], [200, 400, 100, 400]].map(rect)] } } as FreeFontData);
    const at = sanitizeParams({ ...DEFAULTS, weight: 0.3, freeFont: 'Noto Sans:300' }), pick = resolve({ ...at, ...at.freeAt });
    // as picked, no letter is in another form
    for (const ch of ALL_CHARS) assert.equal(formChanged(ch, resolve(at), pick), false, ch);
    const f = buildFont(at), single = buildFont({ ...at, story: 'single' });
    assert.ok(f.glyph('a')!.drawn, 'the a is the font\'s');
    // a single-storey a, which the font hasn't got: the engine draws it
    assert.deepEqual([...ALL_CHARS].filter(ch => formChanged(ch, resolve(single.params), pick)), ['a']);
    assert.notEqual(single.glyph('a')!.d, f.glyph('a')!.d);
    assert.ok(!single.glyph('a')!.drawn, 'the single-storey a is the engine\'s');
    assert.equal(single.glyph('H')!.d, f.glyph('H')!.d, 'the H is still the font\'s');
    assert.ok(single.glyph('H')!.drawn);
  });

  it('weigh only settings their letters follow when asked whether one moves a letter (skinFollows)', () => {
    // reach.ts asks skinFollows about FREE_AT_KEYS settings only: one it weighs that isn't among them is never asked
    for (const k of SKIN_KEYS) assert.ok((FREE_AT_KEYS as readonly string[]).includes(k), k);
  });

  it('hand a letter back as it is, the very same outline, from every restyle the settings leave where it was picked', () => {
    // free-letters.ts finds what it keeps of a letter (its skeleton, its ink, its restyled outlines) by the outline
    // itself, so a step that changes nothing must give back the same array, or slider drags redo it all. (Serifs
    // are set on only where asked for, so restyleSerifs has no such case.)
    const cs = fitOutline(buildFont(DEFAULTS).glyph('a')!.cmds), sk = () => skeleton(cs);
    const c = { ch: 'a', cap: 700, xh: 500, stem: 80, bar: 60 }, lines = [0, 700, 500, 760, -210];
    for (const p of [DEFAULTS, { ...DEFAULTS, serif: true, stencil: 0.5, barGap: 0.4, roundness: 1, steps: 1, innerRound: 0.5, joinRound: 0.5, dots: 'round', apex: 1, bowlForm: 'box', terminal: 'round' }] as Params[]) {
      const e = resolve(p);
      assert.equal(restyleDots(cs, c, e, e), cs, 'dots');
      assert.equal(restyleBowls(cs, bowlLook(e), bowlLook(e), sk), cs, 'bowls');
      assert.equal(restyleEnds(cs, c, e, e, sk), cs, 'ends');
      assert.equal(restyleStencil(cs, c, stencilLook(e), stencilLook(e), sk), cs, 'stencil');
      assert.equal(restylePeaks(cs, { ...c, lines }, e.apex, e.apex), cs, 'peaks');
      assert.equal(restyleCorners(cs, c, cornerLooks(e, c), cornerLooks(e, c)), cs, 'corners');
    }
  });

  it('read a font\'s width and x-height back as the settings that draw them (the twin\'s fit undoes metrics())', () => {
    const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} for ${b}`);
    for (const w of [0, 0.25, 0.5, 0.75, 1]) near(widthOfScale(metrics(resolve({ ...DEFAULTS, width: w })).ws), w, 'width');
    for (const v of [0, 0.4, 1]) near(xHeightOfRatio(xHeightRatio(v)), v, 'x-height');
  });

  it('are served by the API, and only the ones the styles name', async () => {
    const store = new DesignStore(':memory:'), server = createApp(store, { fonts: new FreeFonts(null, googleFonts().get) }).listen(0);
    await new Promise(r => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    try {
      const ok = await fetch(`${base}/free-fonts/${encodeURIComponent('Parisienne:400')}`);
      assert.equal(ok.status, 200);
      assert.equal((await ok.json()).family, 'Parisienne');
      assert.equal((await fetch(`${base}/free-fonts/${encodeURIComponent('Comic Sans:400')}`)).status, 404);
    } finally { server.close(); store.close(); }
  });
});

describe("TypeLab's own fonts", () => {
  /** A fetch that fails: an own font is never fetched. */
  const noFetch = async (url: string): Promise<never> => { throw new Error(`fetched ${url}`); };

  it('write every card of the Style page in one, each kept in fonts/ with every letter, under the Open Font License', async () => {
    const fonts = new FreeFonts(null, noFetch), used = new Set<string>();
    // (but a card built from blocks, which no font draws)
    for (const st of PAGE_STYLES.filter(s => s.params.build !== 'blocks')) {
      const id = STYLE_FONTS[st.id], r = parseFontId(id);
      assert.ok(r && isOwnFont(r.family), `${st.id} is written in one of TypeLab's own fonts`);
      used.add(r.family);
      const data = await fonts.load(id);
      assert.equal(data.id, id);
      for (const ch of CHARSET.upper + CHARSET.lower + CHARSET.digits) assert.ok(data.glyphs[ch]?.[1].length, `${r.family} has ${ch}`);
      assert.ok(data.cap > 500 && data.cap < 900 && data.xh > 250 && data.xh < data.cap, `${r.family}'s heights ${data.cap}, ${data.xh}`);
      assert.equal(data.license, 'SIL Open Font License, Version 1.1', `${r.family}'s licence`);
      assert.equal(data.copyright, 'Copyright 2026 TypeLab.');
      assert.match(data.licenseText!, /^Copyright 2026 TypeLab\.\n\n.*SIL OPEN FONT LICENSE Version 1\.1/s);
    }
    assert.deepEqual([...used].sort(), Object.keys(OWN_FAMILIES).sort(), 'one card each');
    // (each from its own sheet, but Bulwark, the engine's block letters, which have none)
    const sheets = Object.values(OWN_FAMILIES).filter(o => !o.blocks).map(o => o.sheet);
    assert.ok(sheets.every(n => n !== undefined) && new Set(sheets).size === sheets.length, 'each from its own sheet');
    assert.equal(STYLE_FONTS.block, 'Bulwark:700', 'the Block card in Bulwark');
  });

  it("give a block letter's short heavy end another kind of end on itself: Bulwark's r keeps its arm, its y its tail", async () => {
    const fonts = new FreeFonts(null, noFetch), st = STYLES.find(s => s.id === 'block')!, id = STYLE_FONTS.block;
    if (!freeFont(id)) registerFreeFont(await fonts.load(id));
    const design = (moves: Partial<Params> = {}) => buildFont({ ...st.params, freeFont: id, freeAt: freeAtOf(st.params), ...moves } as Params);
    const box = (g: Glyph) => { const ps = toPolys(g.cmds).flat(); return { x1: Math.max(...ps.map(p => p.x)), y0: Math.min(...ps.map(p => p.y)) }; };
    const flat = design();
    for (const look of [{ terminal: 'round', terminalForm: 'round' }, { terminal: 'sharp', terminalForm: 'pointed' }] as Partial<Params>[]) {
      const f = design(look), r = f.glyph('r')!, y = f.glyph('y')!;
      assert.notEqual(r.d, flat.glyph('r')!.d, `the r's end ${look.terminalForm}`);
      // (an end drawn on the arm takes off no more than its round: the arm still reaches well past the stem)
      assert.ok(box(r).x1 > box(flat.glyph('r')!).x1 - f.m.s * 0.6, `the r's arm kept (${look.terminalForm}: ${box(r).x1.toFixed(0)})`);
      assert.ok(box(y).y0 < f.m.desc * 0.6, `the y's tail kept (${look.terminalForm}: ${box(y).y0.toFixed(0)})`);
    }
  });

  it("reshape a block letter's bowls by their corners: Bulwark's o oval, square or cut, its H's corners as they are", async () => {
    const fonts = new FreeFonts(null, noFetch), st = STYLES.find(s => s.id === 'block')!, id = STYLE_FONTS.block;
    if (!freeFont(id)) registerFreeFont(await fonts.load(id));
    const design = (moves: Partial<Params> = {}) => buildFont({ ...st.params, freeFont: id, freeAt: freeAtOf(st.params), ...moves } as Params);
    // the ink along the o's top edge, a little in from it: how far its flat runs, against the o's width
    const flat = (g: Glyph) => {
      const ink = shape(toPolys(g.cmds)), ps = toPolys(g.cmds).flat(), x0 = Math.min(...ps.map(p => p.x)), x1 = Math.max(...ps.map(p => p.x)), y1 = Math.max(...ps.map(p => p.y));
      let n = 0;
      for (let x = x0; x <= x1; x += 2) if (ink.has(x, y1 - 3)) n += 2;
      return n / (x1 - x0);
    };
    const o = flat(design().glyph('o')!), oval = flat(design({ bowlForm: 'oval' }).glyph('o')!), square = flat(design({ boxRound: 0 }).glyph('o')!);
    assert.ok(oval < o - 0.2, `oval: its top as round as it goes (${oval.toFixed(2)} flat, the box's ${o.toFixed(2)})`);
    assert.ok(square > 0.97, `Corners 0: square (${square.toFixed(2)} flat)`);
    const cut = design({ chamfer: 1 }).glyph('o')!;
    assert.ok(toPolys(cut.cmds).flat().length < toPolys(design().glyph('o')!.cmds).flat().length, 'Facets: its rounds cut straight');
    // (the stems' corners, square, stay so)
    for (const moves of [{ bowlForm: 'oval' }, { chamfer: 1 }, { boxRound: 0 }] as Partial<Params>[]) assert.equal(design(moves).glyph('H')!.d, design().glyph('H')!.d, `the H's square corners (${JSON.stringify(moves)})`);
  });

  it("draw Bulwark's letters at any Weight from its nearest weight, each the block letters at that Weight: an 8 at 20 as built", async () => {
    const fonts = new FreeFonts(null, noFetch), st = STYLES.find(s => s.id === 'block')!, own = OWN_FAMILIES.Bulwark;
    assert.deepEqual(own.weights, [100, 200, 300, 400, 500, 600, 700, 800, 900], 'nine weights');
    for (const w of own.weights!) if (!freeFont(`Bulwark:${w}`)) registerFreeFont(await fonts.load(`Bulwark:${w}`));
    const p = { ...st.params, freeFont: STYLE_FONTS.block, freeAt: freeAtOf(st.params) } as Params;
    for (const [weight, id] of [[0.2, 'Bulwark:200'], [0.42, 'Bulwark:400'], [0.95, 'Bulwark:900']] as const) {
      const f = buildFont({ ...p, weight });
      assert.equal(f.free?.id, id, `Weight ${weight * 100} draws from ${id}, not ${f.free?.id}`);
      // (at a weight it comes in, its letters are that font's as they are: as a design picked in it draws them)
      const own = buildFont({ ...p, weight, freeFont: id, freeAt: freeAtOf({ ...st.params, weight } as Params) });
      if (weight === 0.2) for (const ch of '8&B3') assert.equal(f.glyph(ch)!.d, own.glyph(ch)!.d, `${ch} as Bulwark 200 draws it`);
    }
  });

  it("stand serifs on every stem's foot, a face read a unit narrower than its stroke too: Bulwark's and Mainline's R, N and K", async () => {
    const fonts = new FreeFonts(null, noFetch);
    for (const style of ['block', 'grotesque']) {
      const st = STYLES.find(s => s.id === style)!, id = STYLE_FONTS[style];
      if (!freeFont(id)) registerFreeFont(await fonts.load(id));
      const p = { ...st.params, freeFont: id, freeAt: freeAtOf(st.params) } as Params, plain = buildFont(p), serifed = buildFont({ ...p, serif: true, serifShape: 'slab' });
      // (the ink along the baseline, just above it: wider by the serifs reaching out from each foot)
      const foot = (g: Glyph) => { const ink = shape(toPolys(g.cmds)); let n = 0; for (let x = -100; x < 1000; x += 2) if (ink.has(x, 6)) n += 2; return n; };
      for (const ch of 'RNK') assert.ok(foot(serifed.glyph(ch)!) > foot(plain.glyph(ch)!) + plain.m.s * 0.5, `${style}'s ${ch} stands on serifs`);
    }
  });

  it('open a heavy letter by Stencil only where every piece stays solid ink: no slivers in Bulwark or Gumdrop', async () => {
    const fonts = new FreeFonts(null, noFetch);
    for (const style of ['block', 'chunkyround']) {
      const st = STYLES.find(s => s.id === style)!, id = STYLE_FONTS[style];
      if (!freeFont(id)) registerFreeFont(await fonts.load(id));
      const p = { ...st.params, freeFont: id, freeAt: freeAtOf(st.params) } as Params, f = buildFont({ ...p, stencil: 0.6 }), whole = buildFont(p);
      let opened = 0;
      for (const ch of 'RAQyHtPBK') {
        const sh = shape(toPolys(f.glyph(ch)!.cmds)), rings = combine([sh], sh.has).filter(r => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p.x * q.y - q.x * p.y; }, 0) > 0);
        if (f.glyph(ch)!.d !== whole.glyph(ch)!.d) opened++;
        for (const r of rings) {
          const xs = r.map(p => p.x), ys = r.map(p => p.y), area = r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2;
          const across = area / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
          assert.ok(across > f.m.s * 0.3, `${style}'s ${ch}: a piece ${across.toFixed(0)} across on the whole, against stems ${f.m.s.toFixed(0)}`);
        }
      }
      assert.ok(opened >= 4, `${style}: Stencil still opens most of them (${opened})`);
      if (style !== 'block') continue;
      // (Bulwark's slanting strokes cut where they run on alone, its A's bar square across; and its Q cut down its middle,
      // as its O, not opened where its tail leaves the ring into a C)
      for (const ch of 'RAKy') assert.notEqual(f.glyph(ch)!.d, whole.glyph(ch)!.d, `its ${ch} is cut`);
      const Q = f.glyph('Q')!, ink = shape(toPolys(Q.cmds)), ps = toPolys(whole.glyph('Q')!.cmds).flat();
      const x0 = Math.min(...ps.map(p => p.x)), x1 = Math.max(...ps.map(p => p.x)), y1 = Math.max(...ps.map(p => p.y)), mid = y1 * 0.55;
      // (the ring's right side, at half its height: some ink in the right third, past its tail)
      let right = false;
      for (let x = x1; x > x0 + (x1 - x0) * 0.66; x -= 2) if (ink.has(x, mid)) right = true;
      assert.ok(right, "its Q's ring stays shut on the right");
      assert.ok(!ink.has((x0 + x1) / 2, y1 - f.m.s * 0.3), 'and is cut at its top, as its O');
    }
  });

  it('read a design saved in a font they took the place of as written in its own', () => {
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Roboto:600' }).freeFont, 'Mainline:600');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Roboto:900i' }).freeFont, 'Mainline:600');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Playfair Display:400i' }).freeFont, 'Sonnet:400i');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Playfair Display:600' }).freeFont, 'Couture:600');
    for (const old of Object.keys(OLD_FONTS)) assert.ok(!parseFontId(`${old}:400`), `${old} is no longer offered`);
  });

  it('give a family in one weight, or only in italic, that font whatever is asked', () => {
    assert.equal(nearestFont('Mainline', 900, true), 'Mainline:600');
    assert.equal(nearestFont('Sonnet', 700, false), 'Sonnet:400i');
  });

  it('move their letters whole: a letter drawn in overlapping pieces as the same letter drawn as one outline, a stroke\'s end as wide as its stroke', async () => {
    const fonts = new FreeFonts(null, noFetch);
    const design = async (style: string, moves: Partial<Params>) => {
      const st = STYLES.find(s => s.id === style)!, id = STYLE_FONTS[style];
      if (!freeFont(id)) registerFreeFont(await fonts.load(id));
      return buildFont({ ...st.params, freeFont: id, freeAt: freeAtOf(st.params), ...moves } as Params);
    };
    // the runs of ink along a level line (y) or an upright one (x), read every half unit
    const runs = (g: Glyph, axis: 'x' | 'y', v: number) => {
      const ink = shape(toPolys(g.cmds)), out: [number, number][] = [];
      for (let u = -200, on = false; u < 1400; u += 0.5) {
        const has = axis === 'y' ? ink.has(u, v) : ink.has(v, u);
        if (has && !on) out.push([u, u]);
        if (has) out[out.length - 1][1] = u;
        on = has;
      }
      return out;
    };
    // Mainline's u is a stem drawn whole and a bowl run into it: lighter, it is the u drawn as one outline, lighter
    // (the bowl's edges inside the stem came out of it as notches at the join)
    const data = await fonts.load('Mainline:600'), u = freeFont('Mainline:600') ?? (registerFreeFont(data), freeFont('Mainline:600')!);
    assert.ok(u.glyphs.u.contours.length > 1, 'drawn in pieces');
    const light = (await design('grotesque', { weight: 0.3 })).glyph('u')!;
    registerFreeFont({ ...data, glyphs: { ...data.glyphs, u: [data.glyphs.u[0], unite(u.glyphs.u.contours).map(c => c.map(packNode))] } });
    assert.equal((await design('grotesque', { weight: 0.3 })).glyph('u')!.d, light.d);
    registerFreeFont(data);
    // wider, an l's foot is as wide as its stem (the foot widened with the letter, and the stem's sides flared out to it)
    const f = await design('grotesque', { width: 0.95 }), l = f.glyph('l')!;
    const [stem] = runs(l, 'y', f.m.cap / 2), [foot] = runs(l, 'y', 3);
    assert.ok(Math.abs((foot[1] - foot[0]) - (stem[1] - stem[0])) < 4, `the foot (${foot}) as wide as the stem (${stem})`);
    // and Gumdrop's E's arms keep their round ends (each parted in two at its middle)
    const E = (await design('chunkyround', { width: 0.95 })).glyph('E')!, xs = E.cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 0) as number[]);
    const arms = runs(E, 'x', Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * 0.6);
    assert.equal(arms.length, 3, 'three arms');
    // (read just inside the furthest the middle arm reaches)
    const [y0, y1] = arms[1];
    let tip = -Infinity;
    for (let y = y0; y <= y1; y++) tip = Math.max(tip, runs(E, 'y', y).slice(-1)[0]?.[1] ?? -Infinity);
    const near = runs(E, 'x', tip - (y1 - y0) * 0.15).filter(([a, b]) => b > y0 - 20 && a < y1 + 20);
    assert.equal(near.length, 1, `one end to the middle arm, not two (${JSON.stringify(near)})`);
  });

  it("draw a letter of straight strokes lighter as those strokes, read off their sides: Gumdrop's w and N at Regular", async () => {
    const fonts = new FreeFonts(null, noFetch), st = STYLES.find(s => s.id === 'chunkyround')!, id = STYLE_FONTS.chunkyround;
    if (!freeFont(id)) registerFreeFont(await fonts.load(id));
    // (so heavy its counters are notches: the middle of the w's ink is one bar notched above and below, the N's diagonal
    // meets its stems half way down; read along its strokes' sides, the w is one stroke through its three points, the N
    // one through its two corners)
    for (const ch of 'wN') {
      const rig = skinRig(freeFont(id)!, ch)!, sk = lineSkeleton(rig.contours, rig.ctx.cap, rig.ref().stem, 3);
      assert.ok(sk && sk.edges.length === 1 && sk.nodes.length === 2, `${ch} read as one stroke turning`);
    }
    // and drawn so at Regular: each stroke crossed once, half way up, as thick as the others
    const f = buildFont({ ...st.params, freeFont: id, freeAt: freeAtOf(st.params), weight: 0.4 } as Params);
    for (const [ch, y, n] of [['w', f.m.xh / 2, 4], ['N', f.m.cap / 2, 3]] as const) {
      const ink = shape(toPolys(f.glyph(ch)!.cmds)), runs: [number, number][] = [];
      for (let x = -200, on = false; x < 1400; x += 0.5) { const has = ink.has(x, y); if (has && !on) runs.push([x, x]); if (has) runs[runs.length - 1][1] = x; on = has; }
      const w = runs.map(([a, b]) => b - a);
      assert.equal(runs.length, n, `${ch}: ${JSON.stringify(runs)}`);
      assert.ok(Math.max(...w) < 1.5 * Math.min(...w), `${ch}'s strokes as thick as each other: ${w}`);
    }
  });

  it('answer every setting on their letters without breaking them, and each setting changes what it says', async () => {
    const fonts = new FreeFonts(null, noFetch);
    const design = async (style: string, moves: Partial<Params> = {}) => {
      const st = STYLES.find(s => s.id === style)!, id = STYLE_FONTS[style];
      if (!freeFont(id)) registerFreeFont(await fonts.load(id));
      return buildFont({ ...st.params, freeFont: id, freeAt: freeAtOf(st.params), ...moves } as Params);
    };
    // a letter's ink as one outline: how many pieces it is in, and how many holes
    const parts = (g: Glyph) => {
      const sh = shape(toPolys(g.cmds)), rings = combine([sh], sh.has), area = (r: { x: number; y: number }[]) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2;
      return { pieces: rings.filter(r => area(r) > 0).length, holes: rings.filter(r => area(r) < 0).length };
    };
    const same = (a: Glyph, b: Glyph) => a.d === b.d;
    // Contrast lowered on a Didone: its hairlines thicken toward its stems, and its letters stay whole with their counters
    const didone = await design('didone'), low = await design('didone', { contrast: 0.6 });
    for (const ch of 'aegnors') assert.deepEqual(parts(low.glyph(ch)!), parts(didone.glyph(ch)!), `Couture's ${ch} at Contrast 60`);
    // a light book face made black keeps its counters open
    const book = await design('oldstyle'), black = await design('oldstyle', { weight: 1 });
    for (const ch of 'aenob') assert.equal(parts(black.glyph(ch)!).holes, parts(book.glyph(ch)!).holes, `Vellum's ${ch} at Weight 100`);
    // Peaks reshapes the peaks of A V W and leaves the letters with none be
    const sq = await design('squircle'), pointed = await design('squircle', { apex: 0 });
    for (const ch of 'bgyQ') assert.ok(same(pointed.glyph(ch)!, sq.glyph(ch)!), `Orbital's ${ch} has no peak`);
    for (const ch of 'AVW') assert.ok(!same(pointed.glyph(ch)!, sq.glyph(ch)!), `Orbital's ${ch} comes to a point`);
    // a blackletter's corners round further at every step of Roundness, its pointed feet and heads too; its letters
    // turn in no straight points, so Peaks reaches none and round Bends keeps them its own (not the engine's sans)
    const cathedral = await design('blackletter'), cathFont = freeFont(STYLE_FONTS.blackletter)!;
    const rounder = [cathedral, ...await Promise.all([0.25, 0.5, 0.75, 1].map(v => design('blackletter', { roundness: v })))];
    for (const ch of 'npq') for (let i = 1; i < rounder.length; i++) assert.ok(!same(rounder[i].glyph(ch)!, rounder[i - 1].glyph(ch)!), `Cathedral's ${ch} rounder at Roundness ${i * 25}`);
    for (const ch of 'AMNVvw') assert.ok(!skinFollows(cathFont, ch, 'apex') && !skinFollows(cathFont, ch, 'bends'), `Cathedral's ${ch} has no straight point`);
    const bent = await design('blackletter', { bends: 'round' });
    for (const ch of 'AMNVWYZvwyz') assert.ok(bent.glyph(ch)!.drawn, `Cathedral's ${ch} stays its own under round Bends`);
    assert.ok(skinFollows(freeFont(STYLE_FONTS.squircle)!, 'V', 'bends') && skinFollows(freeFont(STYLE_FONTS.squircle)!, 'V', 'apex'), "Orbital's V turns round and comes to a point");
    // a heavy round face's stems end round without being stroke ends: a drop goes on the c, not on the h, b or n
    const gum = await design('chunkyround'), drop = await design('chunkyround', { terminal: 'round', terminalForm: 'droplet' });
    for (const ch of 'hbn') assert.ok(same(drop.glyph(ch)!, gum.glyph(ch)!), `Gumdrop's ${ch}`);
    assert.ok(!same(drop.glyph('c')!, gum.glyph('c')!), 'its c takes a drop');
    // a stroke end goes where the engine's letter of the same character has one: a Didone's balls give way to any other
    // end and grow with Size, a serif face's e flares, and no stem's or serif's end takes one
    const plainEnds = await design('didone', { terminal: 'flat', terminalForm: 'plain' });
    for (const ch of 'acfr') assert.ok(!same(plainEnds.glyph(ch)!, didone.glyph(ch)!), `Couture's ${ch} without its ball`);
    for (const ch of 'nhlH') assert.ok(same(plainEnds.glyph(ch)!, didone.glyph(ch)!), `Couture's ${ch} has no stroke end`);
    assert.ok(!same((await design('didone', { terminalSize: 0 })).glyph('c')!, (await design('didone', { terminalSize: 1 })).glyph('c')!), 'Ball size on Couture');
    const almanac = await design('serif'), flared = await design('serif', { terminal: 'flat', terminalForm: 'flared' });
    assert.ok(!same(flared.glyph('e')!, almanac.glyph('e')!), "Almanac's e flares");
    for (const ch of 'nmH') assert.ok(same(flared.glyph(ch)!, almanac.glyph(ch)!), `Almanac's ${ch} keeps its serifs`);
    // a heavy sans's ends cut on a slant take balls, and Curl and Length turn them all the way without closing a letter
    const mainline = await design('grotesque');
    for (const set of [{ terminal: 'round', terminalForm: 'ball' }, { terminalCurl: 1 }, { terminalLength: 1 }] as Partial<Params>[]) {
      const moved = await design('grotesque', set);
      for (const ch of 'csCS') {
        assert.ok(!same(moved.glyph(ch)!, mainline.glyph(ch)!), `Mainline's ${ch} at ${JSON.stringify(set)}`);
        assert.equal(parts(moved.glyph(ch)!).holes, 0, `and stays open (${ch} at ${JSON.stringify(set)})`);
      }
    }
    // drawn shorter, an end is cut back, not squeezed: squeezed, the inside of a curve folds over into a flag, an
    // outline crossing itself (Mainline's ends cut on a slant, Couture's balls)
    const crossings = (g: Glyph) => toPolys(g.cmds).reduce((n, r) => {
      const side = (p: { x: number; y: number }, q: { x: number; y: number }, s: { x: number; y: number }) => Math.sign((q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x));
      for (let i = 0; i < r.length; i++) for (let j = i + 2; j < r.length; j++) {
        if (!i && j === r.length - 1) continue;
        const a = r[i], b = r[(i + 1) % r.length], c = r[j], d = r[(j + 1) % r.length];
        if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) n++;
      }
      return n;
    }, 0);
    for (const [style, len] of [['grotesque', 0], ['grotesque', 0.25], ['didone', 0.25]] as const) {
      const short = await design(style, { terminalLength: len });
      for (const ch of 'csCS') assert.equal(crossings(short.glyph(ch)!), 0, `${style}'s ${ch} at Length ${len * 100}`);
    }
    // a script whose letters stand apart (Serenade): each small letter's exit stroke, a hairline running up out of it,
    // is drawn shorter and longer by Length and turned by Curl, back over the letter or out flat, and keeps the font's
    // own end whatever kind is picked; a joined script's exits (Boardwalk's), which meet the next letter, are no free ends
    const serenade = await design('chancery');
    for (const set of [{ terminalLength: 0 }, { terminalLength: 1 }, { terminalCurl: 0 }, { terminalCurl: 1 }] as Partial<Params>[]) {
      const moved = await design('chancery', set);
      for (const ch of 'aeinuw') {
        assert.ok(!same(moved.glyph(ch)!, serenade.glyph(ch)!), `Serenade's ${ch} at ${JSON.stringify(set)}`);
        assert.deepEqual(parts(moved.glyph(ch)!), parts(serenade.glyph(ch)!), `and stays whole (${ch} at ${JSON.stringify(set)})`);
        assert.equal(crossings(moved.glyph(ch)!), 0, `without crossing itself (${ch} at ${JSON.stringify(set)})`);
      }
    }
    const balls = await design('chancery', { terminal: 'round', terminalForm: 'ball' });
    for (const ch of 'aenuw') assert.ok(same(balls.glyph(ch)!, serenade.glyph(ch)!), `Serenade's ${ch} keeps its exit's own end`);
    assert.ok(!skinFollows(freeFont(STYLE_FONTS.chancery)!, 'n', 'terminalSize'), "Serenade's n has no end a ball's Size reaches");
    const boardwalk = await design('informal'), longer = await design('informal', { terminalLength: 1, terminalCurl: 1 });
    for (const ch of 'kopvw') assert.ok(same(longer.glyph(ch)!, boardwalk.glyph(ch)!), `Boardwalk's ${ch} joins as it did`);
    // Bowls' Corners rounds a box bowl's corners
    const box = (v: number) => design('geometric', { bowlForm: 'box', boxRound: v });
    assert.ok(!same((await box(0)).glyph('O')!, (await box(1)).glyph('O')!), 'box corners');
    // Bowl overlap parts a b's bowl from its stem
    assert.equal(parts((await design('grotesque')).glyph('b')!).pieces, 1);
    assert.equal(parts((await design('grotesque', { overlap: 0 })).glyph('b')!).pieces, 2, 'the bowl apart from the stem');
    // a wood type's slab serifs follow Serifs and their length
    const wood = await design('woodtype');
    assert.ok(!same((await design('woodtype', { serif: false })).glyph('n')!, wood.glyph('n')!), 'Timber without serifs');
    assert.ok(!same((await design('woodtype', { serifSize: 0.9 })).glyph('n')!, wood.glyph('n')!), 'Timber with longer serifs');
    // a soft sans takes serifs on its round-ended stems
    assert.ok(!same((await design('chunkyround', { serif: true })).glyph('n')!, gum.glyph('n')!), 'Gumdrop with serifs');
    // a monospaced font made proportional draws its narrow letters in less room
    assert.ok((await design('code', { mono: 0 })).glyph('i')!.adv < (await design('code')).glyph('i')!.adv, 'Kernel proportional');
    // Cursive flicks the font's own letters toward the next one, and they stay the font's (no letter changes form)
    const sans = await design('grotesque'), cursive = await design('grotesque', { cursive: 0.8 });
    assert.ok(!same(cursive.glyph('n')!, sans.glyph('n')!) && cursive.glyph('n')!.drawn, 'a flick on the font\'s n');
    for (const ch of ALL_CHARS) assert.equal(formChanged(ch, cursive.eff, resolve({ ...cursive.params, ...cursive.params.freeAt })), false, ch);
    // a letter in a form an italic hasn't got is drawn leaning as it does
    const twin = (await design('serifitalic', { gForm: 'double' })).glyph('g')!;
    assert.ok(!twin.drawn && twin.M[2] > 0.15, `the twin's g leans (${twin.M[2]})`);
    // Hand-drawn moves the font's own letters, not only where they sit
    assert.ok(!same((await design('grotesque', { wobble: 1 })).glyph('H')!, sans.glyph('H')!), 'a hand-drawn H');
    // Rough edges and the new grid fills draw on the font's own letters
    for (const more of [{ rough: 0.6 }, { fill: 'hex' }, { fill: 'blobs' }, { fill: 'liquid' }, { fill: 'halftone' }] as Partial<Params>[]) {
      assert.ok(!same((await design('grotesque', more)).glyph('a')!, sans.glyph('a')!), JSON.stringify(more));
    }
    // Joins fills the narrow crotches and Counters rounds the square corners, each leaving the other's be
    const joins = await design('grotesque', { joinRound: 1 }), counters = await design('grotesque', { innerRound: 1 });
    for (const ch of 'VvMN') assert.ok(!same(joins.glyph(ch)!, sans.glyph(ch)!) && same(counters.glyph(ch)!, sans.glyph(ch)!), `Mainline's ${ch}: crotches`);
    for (const ch of 'HLE') assert.ok(same(joins.glyph(ch)!, sans.glyph(ch)!) && !same(counters.glyph(ch)!, sans.glyph(ch)!), `Mainline's ${ch}: square corners`);
  });

  it('export under any name, passing on the notice and licence they come under', async () => {
    const params = { ...STYLES.find(s => s.id === 'grotesque')!.params, freeFont: 'Mainline:600' };
    await new FreeFonts(null, noFetch).ready(params);
    const otf = opentype.parse(buildOTF(params, 'Mainline Bold').buffer as ArrayBuffer);
    const names = (otf.names as unknown as { windows: Record<string, { en: string } | undefined> }).windows;
    assert.equal(names.fontFamily?.en, 'Mainline Bold');
    assert.match(names.copyright?.en ?? '', /^Copyright 2026 TypeLab\. Changed with TypeLab\.$/);
    assert.match(names.license?.en ?? '', /Open Font License.*\n\nCopyright 2026 TypeLab\..*SIL OPEN FONT LICENSE Version 1\.1/s);
  });

  it('are served as letters and as a web font', async () => {
    const store = new DesignStore(':memory:'), server = createApp(store, { fonts: new FreeFonts(null, noFetch) }).listen(0);
    await new Promise(r => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    try {
      const data = await fetch(`${base}/free-fonts/${encodeURIComponent('Serenade:400')}`);
      assert.equal(data.status, 200);
      assert.equal((await data.json()).family, 'Serenade');
      const file = await fetch(`${base}/free-fonts/${encodeURIComponent('Serenade:400')}/font.otf`);
      assert.equal(file.status, 200);
      const f = opentype.parse(await file.arrayBuffer()), names = (f.names as unknown as { windows: Record<string, { en: string }> }).windows;
      assert.equal(names.fontFamily.en, 'Serenade');
      assert.equal(names.copyright?.en, 'Copyright 2026 TypeLab.', 'the notice goes with the web font');
      assert.match(names.license?.en ?? '', /SIL OPEN FONT LICENSE Version 1\.1/, 'and the licence');
      assert.ok(f.charToGlyph('a').path.commands.length > 0, 'its letters are in it');
      assert.equal((await fetch(`${base}/free-fonts/${encodeURIComponent('Parisienne:400')}/font.otf`)).status, 404, 'only own fonts are served as files');
    } finally { server.close(); store.close(); }
  });
});
