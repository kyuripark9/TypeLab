/* TypeLab's own fonts' letters (see shared/free-fonts.ts), read from fonts/ in the repository, where
   tools/fonts/import.ts writes them already in the outlines the engine draws (shared/engine/free.ts), and kept in
   memory once read. Only the families in FREE_FAMILIES, in the weights and italics they come in, are loaded (see
   parseFontId). Each font is also served as an OpenType file, for the browser to show a style's name in its own font
   (webFont). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FreeFontData, PackedNode } from '../shared/engine';
import { OWN_LICENSE, ownLicense, parseFontId } from '../shared/free-fonts';
import { opentype } from './opentype';

/** A font's file's name in fonts/. */
const fileName = (id: string) => id.replace(/[^A-Za-z0-9]+/g, '-') + '.json';
/** Where TypeLab's own fonts are kept: fonts/ at the repository's root. */
export const OWN_FONTS_DIR = fileURLToPath(new URL('../fonts/', import.meta.url));
/** Where one of TypeLab's own fonts is kept (tools/fonts/import.ts writes it). */
export const ownFontFile = (id: string) => join(OWN_FONTS_DIR, fileName(id));

type OtfPath = InstanceType<typeof opentype.Path>;
/** One of a font's letters as an OpenType path. */
function otfPath(contours: PackedNode[][]): OtfPath {
  const p = new opentype.Path();
  for (const c of contours) {
    const n = c.length;
    p.moveTo(c[0][0], c[0][1]);
    for (let i = 1; i <= n; i++) {
      const a = c[i - 1], b = c[i % n];
      const ox = a.length > 4 ? a[4] as number : null, oy = a.length > 4 ? a[5] as number : null;
      const ix = b.length > 2 ? b[2] : null, iy = b.length > 2 ? b[3] : null;
      if (ox === null && ix === null) { if (i < n) p.lineTo(b[0], b[1]); }
      else p.curveTo(ox ?? a[0], oy ?? a[1], ix ?? b[0], iy ?? b[1], b[0], b[1]);
    }
    p.close();
  }
  return p;
}

/** A font's letters as an installable OpenType file, for the browser to set a style's name in (a web font): all of them,
    or those of `cut` alone. */
export function webFont(data: FreeFontData, cut?: string): Buffer {
  const glyphs = [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: data.space, path: new opentype.Path() }),
    ...Object.entries(data.glyphs).filter(([ch]) => !cut || cut.includes(ch)).map(([ch, [adv, contours]]) => new opentype.Glyph({
      name: 'uni' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'), unicode: ch.charCodeAt(0), advanceWidth: adv, path: otfPath(contours)
    }))
  ];
  const ys = Object.values(data.glyphs).flatMap(([, cs]) => cs.flatMap(c => c.map(n => n[1])));
  const font = new opentype.Font({
    familyName: data.family, styleName: 'Regular', unitsPerEm: 1000,
    // the font's notice and licence travel with it, as its licence asks
    ...(data.license ? { copyright: data.copyright, license: data.licenseText || data.license, licenseURL: data.licenseUrl } : {}),
    ascender: Math.round(Math.max(data.cap, ...ys)), descender: Math.round(Math.min(-200, ...ys)), glyphs
  } as unknown as ConstructorParameters<typeof opentype.Font>[0]);
  return Buffer.from(font.toArrayBuffer());
}

export class FreeFonts {
  private loading = new Map<string, Promise<FreeFontData>>();
  private files = new Map<string, Promise<Buffer>>();
  /** Font `id`'s letters, from fonts/. Throws for an id that isn't one of TypeLab's own fonts. */
  load(id: string): Promise<FreeFontData> {
    if (!parseFontId(id)) return Promise.reject(new Error(`${id} isn't one of TypeLab's fonts`));
    let p = this.loading.get(id);
    if (!p) {
      p = this.readOwn(id);
      this.loading.set(id, p);
      // a font that couldn't be read is tried again next time
      p.catch(() => this.loading.delete(id));
    }
    return p;
  }

  /** One of TypeLab's own fonts, with the notice and licence it comes under (ownLicense) laid in: its file holds only
      its letters, and the licence's text is kept once beside them, in fonts/. */
  private async readOwn(id: string): Promise<FreeFontData> {
    const data = JSON.parse(readFileSync(ownFontFile(id), 'utf8')) as FreeFontData, own = ownLicense();
    const text = readFileSync(join(OWN_FONTS_DIR, OWN_LICENSE.file), 'utf8').trim();
    return { ...data, copyright: own.copyright, license: own.license, licenseUrl: own.licenseUrl, licenseText: `${own.lines.join('\n')}\n\n${text}` };
  }

  /** Font `id` as an OpenType file (see webFont), all of it or cut to `cut`'s letters, built once. */
  file(id: string, cut?: string): Promise<Buffer> {
    const key = cut ? `${id} ${cut}` : id;
    let p = this.files.get(key);
    if (!p) {
      p = this.load(id).then(data => webFont(data, cut));
      this.files.set(key, p);
      p.catch(() => this.files.delete(key));
    }
    return p;
  }
}
