/* Free fonts: every style's font (shared/free-fonts.ts), turning a font file into outlines as the server
   does (server/free-fonts.ts), drawing a design written in one and moving its letters by the settings
   (shared/engine/free-letters.ts, skin.ts, restyle.ts), its notice in an export, and the API that serves
   them. The fonts here are small ones made in the test, so nothing is fetched. */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import * as opentypeNs from 'opentype.js';
import { STYLES } from '../shared/content';
import { ALL_CHARS, buildFont, freeFont, freeFontsWanted, registerFreeFont, type FreeFontData, type Glyph } from '../shared/engine';
import { resolve } from '../shared/engine/font';
import { formChanged } from '../shared/engine/free-letters';
import { familyMember } from '../shared/family';
import { STYLE_FONTS, nearestFont, parseFontId } from '../shared/free-fonts';
import { DEFAULTS, sanitizeParams } from '../shared/params';
import { createApp } from '../server/app';
import { DesignStore } from '../server/db';
import { buildOTF } from '../server/export';
import { FreeFonts } from '../server/free-fonts';

const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs) as typeof opentypeNs;

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
    familyName: 'Great Vibes', styleName: 'Regular', unitsPerEm: upm, ascender: 1800, descender: -500,
    copyright: 'Copyright 2010 The Test Project Authors', licenseURL: 'https://openfontlicense.org',
    glyphs: [
      new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 600, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 512, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'H', unicode: 72, advanceWidth: 1200, path: H }),
      new opentype.Glyph({ name: 'o', unicode: 111, advanceWidth: 1200, path: o })
    ]
  } as unknown as opentypeNs.FontConstructorOptions);
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
  it('give every style a font that is one of the families, in a weight it comes in', () => {
    // styles off the page too: a design saved from one can still be written in its free font
    for (const s of STYLES) {
      const id = STYLE_FONTS[s.id];
      assert.ok(id, `${s.id} has a free font`);
      assert.ok(parseFontId(id), `${s.id}'s ${id} is a font the families have`);
    }
  });

  it('keep a free font in the settings only when it is one of them', () => {
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Great Vibes:400' }).freeFont, 'Great Vibes:400');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Great Vibes:700' }).freeFont, '');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Comic Sans:400' }).freeFont, '');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'constructor:400' }).freeFont, '');
    assert.equal(sanitizeParams({ ...DEFAULTS }).freeFont, '');
  });

  it('find the nearest weight of a family, and its italic where it has one', () => {
    assert.equal(nearestFont('Roboto', 950, false), 'Roboto:900');
    assert.equal(nearestFont('Roboto', 640, true), 'Roboto:600i');
    assert.equal(nearestFont('Great Vibes', 700, true), 'Great Vibes:400');
  });

  it('convert a font file into outlines at 1000 units to the em, curves as cubics, with its notice and licence', async () => {
    const g = googleFonts(), fonts = new FreeFonts(null, g.get);
    const data = await fonts.load('Great Vibes:400');
    assert.match(g.asked[0], /family=Great\+Vibes:400$/);
    assert.equal(data.glyphs.H[0], Math.round(1200 * 1000 / 2048));
    assert.equal(data.glyphs.H[1].length, 3);
    assert.ok(data.glyphs.o[1][0].every(n => n.length === 6), 'every point of the o has both handles');
    assert.equal(data.space, 250);
    assert.equal(data.license, 'SIL Open Font License, Version 1.1');
    assert.match(data.copyright, /Test Project Authors/);
    assert.ok(!data.glyphs.x, 'a character the font lacks is left out');
    assert.equal(g.asked[2], 'https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/OFL.txt');
    assert.match(data.licenseText!, /^SIL OPEN FONT LICENSE Version 1\.1/);
    // asked again, it comes from memory
    await fonts.load('Great Vibes:400');
    assert.equal(g.asked.length, 3);
    await assert.rejects(fonts.load('Comic Sans:400'));
  });

  it('draw a design written in a free font with its letters, as tall as the design\'s capitals, and the rest built', async () => {
    const fonts = new FreeFonts(null, googleFonts().get), st = STYLES.find(s => s.id === 'chancery')!;
    const params = { ...st.params, freeFont: 'Great Vibes:400' };
    assert.equal(buildFont(params).freePending, !freeFont('Great Vibes:400'));
    await fonts.ready(params);
    const f = buildFont(params), H = f.glyph('H')!, x = f.glyph('x')!;
    assert.equal(f.freePending, false);
    assert.ok(H.drawn, 'H is the font\'s');
    const top = Math.max(...H.cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 1) as number[]));
    assert.ok(Math.abs(top - f.m.cap) < 2, `the H's top ${top} stands at the cap height ${f.m.cap}`);
    assert.ok(!x.drawn, 'x, missing from the font, is built from the settings');
  });

  it('pass the font\'s notice and licence on to an export, under another name than the font\'s', async () => {
    const fonts = new FreeFonts(null, googleFonts().get), params = { ...DEFAULTS, freeFont: 'Great Vibes:400' };
    await fonts.ready(params);
    const otf = opentype.parse(buildOTF(params, 'Great Vibes').buffer as ArrayBuffer);
    const names = ((otf.names as unknown as { windows?: Record<string, { en: string }> }).windows ?? otf.names) as Record<string, { en: string }>;
    assert.match(names.copyright.en, /Test Project Authors.*TypeLab/);
    assert.match(names.license.en, /Open Font License.*\n\nSIL OPEN FONT LICENSE Version 1\.1/s);
    assert.equal(names.licenseURL.en, 'https://openfontlicense.org');
    assert.equal(names.fontFamily.en, 'TypeLab Font');
    const mine = opentype.parse(buildOTF(params, 'My greatvibes Wedding').buffer as ArrayBuffer);
    assert.equal(((mine.names as unknown as { windows: Record<string, { en: string }> }).windows).fontFamily.en, 'My Wedding');
    // a name its licence reserves goes too, not only the family's
    const mono = { ...DEFAULTS, freeFont: 'IBM Plex Mono:500' };
    await new FreeFonts(null, googleFonts().get).ready(mono);
    const plex = opentype.parse(buildOTF(mono, 'Plex Code').buffer as ArrayBuffer);
    assert.equal(((plex.names as unknown as { windows: Record<string, { en: string }> }).windows).fontFamily.en, 'Code');
  });

  it('give a family member the font of its family at the member\'s weight', () => {
    const p = { ...DEFAULTS, weight: 0.6, freeFont: 'Roboto:600', freeAt: { weight: 0.6, slant: 0 } };
    assert.ok(freeFontsWanted(familyMember(p, 'semibold', 'black', false).params).includes('Roboto:900'));
    assert.ok(freeFontsWanted(familyMember(p, 'semibold', 'semibold', true).params).includes('Roboto:600i'));
    assert.deepEqual(freeFontsWanted(familyMember(p, 'semibold', 'semibold', false).params), ['Roboto:600']);
  });

  it('move a free font\'s letters with the settings, as far as they are moved from the ones it was picked at', () => {
    // an H of two stems and a bar, as the server sends it
    const rects = [[100, 300, 0, 700], [500, 700, 0, 700], [300, 500, 300, 400]];
    registerFreeFont({ id: 'Roboto:600', family: 'Roboto', designers: ['Test'], copyright: '', license: 'OFL', licenseUrl: '', cap: 700, xh: 500, space: 250,
      glyphs: { H: [800, rects.map(([x0, x1, y0, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]])] } } as FreeFontData);
    const at = { ...DEFAULTS, weight: 0.6, freeFont: 'Roboto:600', freeAt: { weight: 0.6, width: 0.5, slant: 0, fill: 'solid' as const } };
    const box = (g: Glyph) => {
      const xs = g.cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 0) as number[]), ys = g.cmds.flatMap(c => c.slice(1).filter((_, i) => i % 2 === 1) as number[]);
      return { w: Math.max(...xs) - Math.min(...xs), topX: Math.min(...g.cmds.filter(c => c[2] === Math.max(...ys)).map(c => c[1] as number)) };
    };
    const H = buildFont(at).glyph('H')!, base = box(H);
    assert.ok(H.drawn, 'H is the font\'s');
    // heavier: Roboto 900 is asked for, and until it comes the 600's stems are pushed out
    const heavy = buildFont({ ...at, weight: 0.9 });
    assert.ok(heavy.freeMissing.includes('Roboto:900') && heavy.freePending);
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
    registerFreeFont({ id: 'Roboto:500', family: 'Roboto', designers: ['Test'], copyright: '', license: 'OFL', licenseUrl: '', cap: 700, xh: 500, space: 250,
      glyphs: {
        H: [800, [[100, 300, 0, 700], [500, 700, 0, 700], [300, 500, 300, 400]].map(rect)],
        n: [600, [[[100, 0], [200, 0], [200, 420], [400, 420], [400, 0], [500, 0], [500, 500], [100, 500]]]]
      } } as FreeFontData);
    const at = { ...DEFAULTS, weight: 0.5, freeFont: 'Roboto:500', freeAt: { weight: 0.5, contrast: 0.5, crossbar: 0.5, xHeight: DEFAULTS.xHeight, width: 0.5, slant: 0, fill: 'solid' as const } };
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
    registerFreeFont({ id: 'Roboto:400', family: 'Roboto', designers: ['Test'], copyright: '', license: 'OFL', licenseUrl: '', cap: 700, xh: 500, space: 250,
      glyphs: { H: [800, [[100, 190, 0, 700], [510, 600, 0, 700], [150, 550, 310, 390]].map(rect)], c: [700, [arc]] } } as FreeFontData);
    const at = { ...DEFAULTS, weight: 0.4, freeFont: 'Roboto:400' }, p = sanitizeParams(at);
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
    registerFreeFont({ id: 'Roboto:300', family: 'Roboto', designers: ['Test'], copyright: '', license: 'OFL', licenseUrl: '', cap: 700, xh: 500, space: 250,
      glyphs: { H: [800, [[100, 190, 0, 700], [510, 600, 0, 700], [150, 550, 310, 390]].map(rect)], a: [600, [[100, 500, 0, 500], [200, 400, 100, 400]].map(rect)] } } as FreeFontData);
    const at = sanitizeParams({ ...DEFAULTS, weight: 0.3, freeFont: 'Roboto:300' }), pick = resolve({ ...at, ...at.freeAt });
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

  it('are served by the API, and only the ones the styles name', async () => {
    const store = new DesignStore(':memory:'), server = createApp(store, { fonts: new FreeFonts(null, googleFonts().get) }).listen(0);
    await new Promise(r => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    try {
      const ok = await fetch(`${base}/free-fonts/${encodeURIComponent('Great Vibes:400')}`);
      assert.equal(ok.status, 200);
      assert.equal((await ok.json()).family, 'Great Vibes');
      assert.equal((await fetch(`${base}/free-fonts/${encodeURIComponent('Comic Sans:400')}`)).status, 404);
    } finally { server.close(); store.close(); }
  });
});
