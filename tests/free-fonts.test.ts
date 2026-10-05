import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import * as opentypeNs from 'opentype.js';
import { PAGE_STYLES, STYLES } from '../shared/content';
import { buildFont, freeFont } from '../shared/engine';
import { familyMember } from '../shared/family';
import { FREE_FAMILIES, STYLE_FONTS, nearestFont, parseFontId } from '../shared/free-fonts';
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
  it('give every style on the page a font that is one of the families, in a weight it comes in', () => {
    for (const s of PAGE_STYLES) {
      const id = STYLE_FONTS[s.id];
      assert.ok(id, `${s.id} has a free font`);
      assert.ok(parseFontId(id), `${s.id}'s ${id} is a font the families have`);
    }
    for (const id of Object.values(STYLE_FONTS)) assert.ok(FREE_FAMILIES[parseFontId(id)!.family].designers.length >= 0);
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
    const p = { ...DEFAULTS, freeFont: 'Roboto:600' };
    assert.equal(familyMember(p, 'regular', 'bold', false).params.freeFont, 'Roboto:900');
    assert.equal(familyMember(p, 'regular', 'light', true).params.freeFont, 'Roboto:500i');
    assert.equal(familyMember(p, 'regular', 'regular', false).params.freeFont, 'Roboto:600');
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
