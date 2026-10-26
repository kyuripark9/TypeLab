/* The untouched style card uses the same source instance as its adjusted SVG preview. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PAGE_STYLES, styleById } from '../shared/content';
import { ALL_CHARS, buildFont, type Cmd, type FreeFontData } from '../shared/engine';
import { DEFAULTS, freeAtOf, type Params } from '../shared/params';
import { parsePreviewFonts, PREVIEW_FONTS, previewFontFor, previewFontUrl } from '../shared/source/preview-catalog';
import { sourceStyleParams } from '../shared/source/style';
import { registerSource, sourceReady } from '../shared/source/registry';
import { adjustedParams } from '../client/state/editor';
import { fontStyle, loadWebFont, textWidth } from '../client/lib/free';
import { createApp } from '../server/app';
import { DesignStore } from '../server/db';
import { FreeFonts } from '../server/free-fonts';
import { buildPreviewFont, previewDigest, previewFontFile, previewParamsDigest } from '../server/preview-fonts';
import { loadDesignSources } from '../server/sources';
import { opentype } from '../server/opentype';

const parseFont = (bytes: Buffer) => opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
function expectedPath(cmds: Cmd[]) {
  return cmds.map(c => c[0] === 'M' || c[0] === 'L' ? { type: c[0], x: Math.round(c[1]), y: Math.round(c[2]) }
    : c[0] === 'C' ? { type: 'C', x1: Math.round(c[1]), y1: Math.round(c[2]), x2: Math.round(c[3]), y2: Math.round(c[4]), x: Math.round(c[5]), y: Math.round(c[6]) }
      : { type: 'Z' });
}

describe('neutral source preview fonts', () => {
  it('pins every source card to the editor neutral parameters and complete immutable font bytes', () => {
    let count = 0;
    for (const style of PAGE_STYLES) {
      const params = sourceStyleParams(style);
      if (!params) continue;
      count++;
      assert.deepEqual(params, adjustedParams(style, {}));
      const info = previewFontFor(style.id, params.sourceProgram); assert.ok(info);
      assert.equal(info.paramsDigest, previewParamsDigest(params));
      const bytes = previewFontFile(info.digest); assert.ok(bytes);
      assert.equal(previewDigest(bytes), info.digest);
      const font = parseFont(bytes);
      assert.equal(font.glyphs.length, ALL_CHARS.length + 3);
      for (const ch of ALL_CHARS + ' \u00a0') assert.notEqual(font.charToGlyph(ch).index, 0, `${style.id} ${ch}`);
      assert.equal(font.ascender, Math.round(info.ascent));
      assert.equal(font.descender, -Math.round(info.descent));
      assert.equal(font.tables.hhea.lineGap, 0); assert.equal(font.tables.os2.sTypoLineGap, 0);
      assert.equal(previewFontFor(style.id, params.sourceProgram && { ...params.sourceProgram, digest: '0'.repeat(64) }), undefined);
      assert.equal(sourceReady(info.source), false, 'reading the preview must not load the master package');
    }
    assert.equal(count, 22);
    assert.deepEqual(parsePreviewFonts(JSON.parse(readFileSync('fonts/previews/manifest.json', 'utf8'))), PREVIEW_FONTS);
    assert.throws(() => parsePreviewFonts([{ ...PREVIEW_FONTS[0], source: null }]));
    assert.throws(() => parsePreviewFonts([{ ...PREVIEW_FONTS[0], digest: '../other' }]));
    assert.throws(() => parsePreviewFonts([{ ...PREVIEW_FONTS[0], ascent: Infinity }]));
  });

  it('serves only published font bytes without loading any source package', async () => {
    const info = PREVIEW_FONTS[0]; assert.ok(info);
    const store = new DesignStore(':memory:'), server = createApp(store).listen(0, '127.0.0.1');
    try {
      await new Promise<void>(resolve => server.once('listening', resolve));
      const address = server.address(); assert.ok(address && typeof address !== 'string');
      const at = `http://127.0.0.1:${address.port}`;
      const response = await fetch(at + previewFontUrl(info));
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type') ?? '', /^font\/otf/);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      assert.equal(previewDigest(Buffer.from(await response.arrayBuffer())), info.digest);
      assert.equal((await fetch(`${at}/api/source-previews/${'0'.repeat(64)}.otf`)).status, 404);
      assert.equal(sourceReady(info.source), false);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); store.close(); }
  });

  it('loads and measures the digest family with the SVG metric frame, leaving the old free-font route intact', async t => {
    const info = PREVIEW_FONTS[0]; assert.ok(info);
    const requests: { family: string; source: string; descriptors: FontFaceDescriptors }[] = [], added: unknown[] = [];
    const canvas = { font: '', measureText: (text: string) => ({ width: text.length * 40 }) };
    const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document'), oldFace = Object.getOwnPropertyDescriptor(globalThis, 'FontFace');
    t.after(() => {
      if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document');
      if (oldFace) Object.defineProperty(globalThis, 'FontFace', oldFace); else Reflect.deleteProperty(globalThis, 'FontFace');
    });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { fonts: { add: (face: unknown) => added.push(face) },
      createElement: (name: string) => { assert.equal(name, 'canvas'); return { getContext: () => canvas }; } } });
    Object.defineProperty(globalThis, 'FontFace', { configurable: true, value: class {
      constructor(family: string, source: string, descriptors: FontFaceDescriptors) { requests.push({ family, source, descriptors }); }
      load() { return Promise.resolve(this); }
    } });
    t.mock.method(globalThis, 'fetch', () => { throw Error('The font loader must not fetch JSON sources'); });
    assert.equal(await loadWebFont(info), true); assert.equal(await loadWebFont(info), true);
    assert.equal(requests.length, 1); assert.equal(added.length, 1);
    assert.deepEqual(requests[0], { family: `TypeLab Preview ${info.digest}`, source: `url(${previewFontUrl(info)})`,
      descriptors: { weight: '400', style: 'normal', ascentOverride: `${info.ascent / 10}%`, descentOverride: `${info.descent / 10}%`, lineGapOverride: '0%' } });
    assert.equal(textWidth(info, 'AB'), .8 + (info.endCorrections.B ?? 0) / 1000); assert.equal(canvas.font, `400 100px 'TypeLab Preview ${info.digest}'`);
    assert.ok(Math.abs(textWidth({ ...info, endCorrections: { B: .3 } }, 'AB') - .8003) < 1e-12);
    assert.deepEqual(fontStyle(info), { fontFamily: `'TypeLab Preview ${info.digest}', Manrope, sans-serif`, fontWeight: 400, fontStyle: 'normal', letterSpacing: 0 });
    assert.equal(sourceReady(info.source), false);
    assert.equal(await loadWebFont({ family: 'Couture', weight: 600, italic: false }), true);
    assert.match(requests[1].source, /^url\(\/api\/free-fonts\/Couture%3A600\/font\.otf\)$/);
    assert.deepEqual(requests[1].descriptors, { weight: '600', style: 'normal' });
  });

  it('encodes source advances and curves with stable timestamps and valid font checksums', t => {
    const source = { kind: 'outline-v1', fontId: 'PreviewFixture:400', digest: previewDigest('Preview fixture') } as const;
    const data: FreeFontData = { id: source.fontId, family: 'PreviewFixture', designers: [], copyright: '', license: '', licenseUrl: '',
      cap: 700, xh: 500, space: 234.4,
      glyphs: Object.fromEntries([...ALL_CHARS].map(ch => [ch, [123.3, [[[10.25, 0], [10.25, 700.25], [100.75, 700.25], [100.75, 0]]]]])) };
    registerSource(source, data);
    const params: Params = { ...DEFAULTS, sourceProgram: source, freeAt: freeAtOf(DEFAULTS) };
    t.mock.timers.enable({ apis: ['Date'], now: 946684800000 });
    const first = buildPreviewFont(params); t.mock.timers.tick(10000); const second = buildPreviewFont(params);
    assert.deepEqual(first, second);
    let sum = 0;
    for (let i = 0; i < first.bytes.length; i += 4) sum = (sum + first.bytes.readUInt32BE(i)) >>> 0;
    assert.equal(sum, 0xb1b0afba);
    const font = parseFont(first.bytes);
    assert.deepEqual([first.ascent, first.descent, font.ascender, font.descender], [700, 280, 700, -280]);
    assert.equal(font.charToGlyph('H').advanceWidth, 123); assert.equal(font.charToGlyph(' ').advanceWidth, 234);
    assert.equal(font.charToGlyph('\u00a0').advanceWidth, 234);
    assert.ok(Math.abs(first.endCorrections.H - .3) < 1e-9);
    assert.deepEqual(font.charToGlyph('H').path.commands, [
      { type: 'M', x: 10, y: 0 }, { type: 'L', x: 10, y: 700 }, { type: 'L', x: 101, y: 700 }, { type: 'L', x: 101, y: 0 }, { type: 'Z' }
    ]);
  });

  it('includes the reviewed repairs and agrees with every evaluated glyph, advance and baseline in three repaired styles', async () => {
    for (const [styleId, repaired] of [['blackletter', '\\'], ['didone', '*'], ['serifitalic', 'b']] as const) {
      const style = styleById(styleId); assert.ok(style);
      const params = sourceStyleParams(style); assert.ok(params?.sourceProgram);
      const info = previewFontFor(styleId, params.sourceProgram); assert.ok(info);
      loadDesignSources(params);
      const built = buildPreviewFont(params), bytes = previewFontFile(info.digest); assert.ok(bytes);
      assert.deepEqual(built.bytes, bytes, 'the immutable file is the deterministic evaluator output');
      const font = buildFont(params), installed = parseFont(bytes);
      assert.equal(info.ascent, Math.max(font.m.asc, font.m.cap)); assert.equal(info.descent, -font.m.desc);
      for (const ch of ALL_CHARS) {
        const glyph = font.glyph(ch); assert.ok(glyph);
        assert.deepEqual(installed.charToGlyph(ch).path.commands, expectedPath(glyph.cmds), `${styleId} ${ch}`);
      }
      for (const text of ["Rag ij.!", "''' ii", 'b\\* \u00a0']) {
        let x = 0;
        const line = font.layout(text, Infinity)[0];
        for (const item of line.items) {
          assert.equal(item.x, x, `${styleId} ${text}`);
          x += installed.charToGlyph(item.ch).advanceWidth ?? 0;
        }
        assert.ok(Math.abs(line.width - x - (info.endCorrections[line.items.at(-1)?.ch ?? ''] ?? 0)) < 1e-9,
          'the original card and SVG use the same longest-word fitting width');
      }
      const original = parseFont(await new FreeFonts(null).file(params.freeFont));
      assert.notDeepEqual(installed.charToGlyph(repaired).path.commands, original.charToGlyph(repaired).path.commands, `${styleId} contains its master repair`);
      if (styleId === 'blackletter') assert.equal(installed.charToGlyph('\\').advanceWidth, 585);
    }
  });
});
