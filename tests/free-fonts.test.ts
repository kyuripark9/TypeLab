/* TypeLab's own fonts (shared/free-fonts.ts, fonts/), which the Style page's cards are written in: every style's
   font, their letters, their notice in an export, and the API that serves them as web fonts. How a design's letters
   are drawn from them is the source interpreter's (tests/source-*.test.ts). */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { PAGE_STYLES, STYLES } from '../shared/content';
import { CHARSET } from '../shared/engine';
import { FREE_FAMILIES, INTRO_CHARS, INTRO_OWN, OLD_FONTS, OWN_FAMILIES, STYLE_FONTS, fontId, isOwnFont, nearestFont, parseFontId } from '../shared/free-fonts';
import { DEFAULTS, sanitizeParams } from '../shared/params';
import { sourceStyleParams } from '../shared/source/style';
import { createApp } from '../server/app';
import { DesignStore } from '../server/db';
import { buildOTF } from '../server/export';
import { FreeFonts } from '../server/free-fonts';
import { opentype } from '../server/opentype';
import { loadDesignSources } from '../server/sources';

/* A family in every weight, upright and italic, made up here: TypeLab's own come
   in one weight each (Bulwark's nine are block letters), and their names are their fonts' in fonts/. */
FREE_FAMILIES['Test Sans'] = { designers: ['Test'], weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italics: [100, 200, 300, 400, 500, 600, 700, 800, 900] };

describe('free fonts', () => {
  it('give every style a font that is one of the families, in a weight it comes in, all but those built from blocks or arcs', () => {
    // no font draws the slot and grid blocks or the arcs
    for (const s of STYLES) {
      const id = STYLE_FONTS[s.id];
      if (s.params.build !== 'strokes') { assert.equal(id, undefined, `${s.id} is built from ${s.params.build}`); continue; }
      assert.ok(id, `${s.id} has a free font`);
      assert.ok(parseFontId(id), `${s.id}'s ${id} is a font the families have`);
    }
  });

  it('keep a free font in the settings only when it is one of them', () => {
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Mainline:600' }).freeFont, 'Mainline:600');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Mainline:700' }).freeFont, '');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Comic Sans:400' }).freeFont, '');
    // a Google Fonts family the styles off the page were once written in is no longer one
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Parisienne:400' }).freeFont, '');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'constructor:400' }).freeFont, '');
    assert.equal(sanitizeParams({ ...DEFAULTS }).freeFont, '');
  });

  it('find the nearest weight of a family, and its italic where it has one', () => {
    assert.equal(nearestFont('Test Sans', 950, false), 'Test Sans:900');
    assert.equal(nearestFont('Test Sans', 640, true), 'Test Sans:600i');
    assert.equal(nearestFont('Bulwark', 640, true), 'Bulwark:600');
  });

});

describe("TypeLab's own fonts", () => {
  it('start each card with no personality macro holding part of a slider flat', () => {
    // (resolve() pushes a slider by a macro as far as 0 or 1 and no further, so a card setting one off its middle leaves
    // a stretch of every slider it pushes doing nothing: Blackletter's Roundness below 70, Wood Type's Squareness above
    // 36; a card's preset sets those sliders itself)
    for (const s of PAGE_STYLES) {
      const id = STYLE_FONTS[s.id];
      if (!id || !isOwnFont(id.split(':')[0])) continue;
      for (const k of ['geoHuman', 'softSharp', 'classicFuture', 'playfulFormal'] as const) assert.equal(s.params[k], 0.5, `${s.id}'s ${k}`);
    }
  });

  it('write every card of the Style page in one, each kept in fonts/ with every letter, under the Open Font License', async () => {
    const fonts = new FreeFonts(), used = new Set<string>();
    // (but a card built from blocks or arcs, which no font draws)
    for (const st of PAGE_STYLES.filter(s => s.params.build === 'strokes')) {
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

  it('read a design saved in a font they took the place of as written in its own', () => {
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Roboto:600' }).freeFont, 'Mainline:600');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Roboto:900i' }).freeFont, 'Mainline:600');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Playfair Display:400i' }).freeFont, 'Sonnet:400i');
    assert.equal(sanitizeParams({ ...DEFAULTS, freeFont: 'Playfair Display:600' }).freeFont, 'Couture:600');
    for (const old of Object.keys(OLD_FONTS)) assert.ok(!parseFontId(`${old}:400`), `${old} is no longer offered`);
  });

  it('mix a style apiece into the opening title card, never the blackletter, each with every letter it sets', async () => {
    const fonts = new FreeFonts(), black = parseFontId(STYLE_FONTS.blackletter)?.family;
    assert.ok(INTRO_OWN.length > 0);
    for (const family of INTRO_OWN) {
      const o = OWN_FAMILIES[family];
      assert.ok(o, `${family} is one of the own fonts`);
      assert.notEqual(family, black, 'its letters read as another script');
      const data = await fonts.load(fontId({ family, weight: o.weight, italic: o.italic }));
      for (const ch of INTRO_CHARS) assert.ok(data.glyphs[ch]?.[1].length, `${family} draws ${ch}`);
    }
  });

  it('give a family in one weight, or only in italic, that font whatever is asked', () => {
    assert.equal(nearestFont('Mainline', 900, true), 'Mainline:600');
    assert.equal(nearestFont('Sonnet', 700, false), 'Sonnet:400i');
  });

  it('export under any name, passing on the notice and licence they come under', async () => {
    const params = sourceStyleParams(STYLES.find(s => s.id === 'grotesque')!)!;
    loadDesignSources(params);
    const otf = opentype.parse(buildOTF(params, 'Mainline Bold').buffer as ArrayBuffer);
    const names = (otf.names as unknown as { windows: Record<string, { en: string } | undefined> }).windows;
    // (a source exports at the weight it stands at, named beside the design's name)
    assert.match(names.fontFamily?.en ?? '', /^Mainline Bold\b/);
    // (the notices of the drawings its source was made from, and that it was changed here)
    assert.match(names.copyright?.en ?? '', /Copyright .* Changed with TypeLab\.$/s);
    assert.match(names.license?.en ?? '', /Open Font License/i);
  });

  it('are served as a web font', async () => {
    const store = new DesignStore(':memory:'), server = createApp(store, { fonts: new FreeFonts() }).listen(0);
    await new Promise(r => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    try {
      const file = await fetch(`${base}/free-fonts/${encodeURIComponent('Serenade:400')}/font.otf`);
      assert.equal(file.status, 200);
      const f = opentype.parse(await file.arrayBuffer()), names = (f.names as unknown as { windows: Record<string, { en: string }> }).windows;
      assert.equal(names.fontFamily.en, 'Serenade');
      assert.equal(names.copyright?.en, 'Copyright 2026 TypeLab.', 'the notice goes with the web font');
      assert.match(names.license?.en ?? '', /SIL OPEN FONT LICENSE Version 1\.1/, 'and the licence');
      assert.ok(f.charToGlyph('a').path.commands.length > 0, 'its letters are in it');
      assert.equal((await fetch(`${base}/free-fonts/${encodeURIComponent('Parisienne:400')}/font.otf`)).status, 404, 'only own fonts are served as files');
      const cut = opentype.parse(await (await fetch(`${base}/free-fonts/${encodeURIComponent('Serenade:400')}/intro.otf`)).arrayBuffer());
      for (const ch of INTRO_CHARS) assert.ok(cut.charToGlyph(ch).path.commands.length > 0, `the opening title card's ${ch} is in its cut`);
      assert.equal(cut.charToGlyph('a').path.commands.length, 0, 'and nothing else');
      assert.equal((await fetch(`${base}/free-fonts/${encodeURIComponent('Parisienne:400')}/intro.otf`)).status, 404);
    } finally { server.close(); store.close(); }
  });
});
