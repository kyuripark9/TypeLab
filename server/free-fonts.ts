/* Free fonts' letters (see shared/free-fonts.ts). TypeLab's own fonts are read from fonts/ in the repository,
   where tools/fonts/import.ts writes them already in the outlines the engine draws (shared/engine/free.ts); the
   others are fetched from Google Fonts the first time a font is asked for, converted, and kept: in memory, and as
   a file in `dir` when there is one, so a font is fetched once. Only the families in FREE_FAMILIES, in the weights
   and italics they come in, are loaded (see parseFontId). Each font is also served as an OpenType file, for the
   browser to show a style's name in its own font (webFont). */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CHARS, freeFont, freeFontsWanted, packNode, registerFreeFont, type FreeFontData, type Node, type PackedNode } from '../shared/engine';
import { FREE_FAMILIES, OWN_LICENSE, ownLicense, parseFontId, type FreeFontRef } from '../shared/free-fonts';
import type { Params } from '../shared/params';
import { opentype } from './opentype';

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>;

/** The licence a font comes under, by the address its name table gives for it. */
function licenseName(url: string) {
  if (/apache/i.test(url)) return 'Apache License, Version 2.0';
  return 'SIL Open Font License, Version 1.1';
}

type PathCmd = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };

/** A glyph's path as closed contours of anchor points, `k` times the size and rounded to whole units:
    a quadratic curve (TrueType's) becomes the cubic it is, and a line back to where the contour started
    or of no length goes. */
function contoursOf(cmds: PathCmd[], k: number): PackedNode[][] {
  const r = (v: number) => Math.round(v * k);
  const out: Node[][] = [];
  let c: Node[] = [];
  const close = () => {
    const a = c[0], b = c[c.length - 1];
    if (c.length > 1 && a.x === b.x && a.y === b.y) {
      if (b.ix !== undefined) { a.ix = b.ix; a.iy = b.iy; }
      c.pop();
    }
    if (c.length > 2) out.push(c);
    c = [];
  };
  for (const cmd of cmds) {
    const last = c[c.length - 1];
    if (cmd.type === 'M') { if (c.length) close(); c.push({ x: r(cmd.x!), y: r(cmd.y!) }); }
    else if (cmd.type === 'L') { const p = { x: r(cmd.x!), y: r(cmd.y!) }; if (!last || last.x !== p.x || last.y !== p.y) c.push(p); }
    else if (cmd.type === 'Q' && last) {
      const qx = cmd.x1! * k, qy = cmd.y1! * k, x = cmd.x! * k, y = cmd.y! * k;
      last.ox = Math.round(last.x + (qx - last.x) * 2 / 3); last.oy = Math.round(last.y + (qy - last.y) * 2 / 3);
      c.push({ x: Math.round(x), y: Math.round(y), ix: Math.round(x + (qx - x) * 2 / 3), iy: Math.round(y + (qy - y) * 2 / 3) });
    } else if (cmd.type === 'C' && last) {
      last.ox = r(cmd.x1!); last.oy = r(cmd.y1!);
      c.push({ x: r(cmd.x!), y: r(cmd.y!), ix: r(cmd.x2!), iy: r(cmd.y2!) });
    } else if (cmd.type === 'Z') close();
  }
  if (c.length) close();
  return out.map(cn => cn.map(packNode));
}

/** A font file's letters, as the engine draws them. */
function convertFont(id: string, ref: FreeFontRef, buf: ArrayBuffer): FreeFontData {
  const f = opentype.parse(buf), k = 1000 / f.unitsPerEm;
  const has = (ch: string) => { const g = f.charToGlyph(ch); return g && g.index !== 0 ? g : null; };
  const glyphs: FreeFontData['glyphs'] = {};
  for (const ch of ALL_CHARS) {
    const g = has(ch);
    if (g) glyphs[ch] = [Math.round((g.advanceWidth ?? 0) * k), contoursOf(g.path.commands as PathCmd[], k)];
  }
  const top = (ch: string) => { const g = has(ch); return g ? g.getBoundingBox().y2 * k : 0; };
  const os2 = (f.tables as { os2?: { sCapHeight?: number; sxHeight?: number } }).os2 ?? {};
  // the height the font says, unless it is far off what its H (or x) measures: some say a fraction of it (Macondo
  // a cap height of 53), which would draw its letters many times too big
  const height = (said: number | undefined, ch: string, none: number) => {
    const v = (said ?? 0) * k, measured = top(ch);
    return (v && (!measured || (v > measured * 0.5 && v < measured * 1.5)) ? v : measured) || none;
  };
  // opentype.js 2 keeps names per platform
  const names = ((f.names as unknown as { windows?: Record<string, { en?: string }> }).windows ?? f.names) as Record<string, { en?: string } | undefined>;
  // (a name left blank can be a lone space)
  const name = (key: string) => names[key]?.en?.trim() ?? '';
  const licenseUrl = name('licenseURL') || 'https://openfontlicense.org';
  return {
    id, family: ref.family, designers: FREE_FAMILIES[ref.family].designers,
    copyright: name('copyright'), license: name('license') || licenseName(licenseUrl), licenseUrl,
    cap: height(os2.sCapHeight, 'H', 700), xh: height(os2.sxHeight, 'x', 500),
    space: Math.round((has(' ')?.advanceWidth ?? f.unitsPerEm / 4) * k), glyphs
  };
}

/** Where font `id` is kept in `dir` (tools/golden.ts reads the same files). */
export const keptFile = (dir: string, id: string) => join(dir, id.replace(/[^A-Za-z0-9]+/g, '-') + '.json');
/** Where TypeLab's own fonts are kept: fonts/ at the repository's root. */
export const OWN_FONTS_DIR = fileURLToPath(new URL('../fonts/', import.meta.url));
/** Where one of TypeLab's own fonts is kept (tools/fonts/import.ts writes it). */
export const ownFontFile = (id: string) => keptFile(OWN_FONTS_DIR, id);
/** Where font `id` is read from: its own file for one of TypeLab's own fonts, else where it's kept in `dir`. */
export const fontFile = (dir: string, id: string) => (FREE_FAMILIES[parseFontId(id)?.family ?? '']?.own ? ownFontFile(id) : keptFile(dir, id));

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

/** A font's letters as an installable OpenType file, for the browser to set a style's name in (a web font). */
export function webFont(data: FreeFontData): Buffer {
  const glyphs = [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: data.space, path: new opentype.Path() }),
    ...Object.entries(data.glyphs).map(([ch, [adv, contours]]) => new opentype.Glyph({
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
  constructor(private dir: string | null, private get: Fetch = fetch) {
    if (dir) mkdirSync(dir, { recursive: true });
  }
  private kept(id: string) { return this.dir && keptFile(this.dir, id); }

  /** Font `id`'s letters: TypeLab's own from fonts/, any other from what's kept or else from Google Fonts. Throws for
      an id that isn't a free font. */
  load(id: string): Promise<FreeFontData> {
    const ref = parseFontId(id);
    if (!ref) return Promise.reject(new Error(`${id} isn't one of the free fonts`));
    let p = this.loading.get(id);
    if (!p) {
      p = FREE_FAMILIES[ref.family].own ? this.readOwn(id) : this.fetchFont(id, ref);
      this.loading.set(id, p);
      // a failed fetch is tried again next time
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

  /** Font `id` as an OpenType file (see webFont), built once. */
  file(id: string): Promise<Buffer> {
    let p = this.files.get(id);
    if (!p) {
      p = this.load(id).then(webFont);
      this.files.set(id, p);
      p.catch(() => this.files.delete(id));
    }
    return p;
  }

  private async fetchFont(id: string, ref: FreeFontRef): Promise<FreeFontData> {
    const file = this.kept(id);
    if (file) {
      try {
        const kept = JSON.parse(readFileSync(file, 'utf8')) as FreeFontData;
        // a kept file is used only when it holds the licence's full text and its heights aren't far too small
        // for its letters (convertFont checks them against the letters); any other is fetched again
        if (kept.licenseText && kept.cap > 300 && kept.xh > 150) return kept;
      } catch { /* not kept yet */ }
    }
    // the first version of the CSS API answers a browser it doesn't know with TrueType files, which
    // the parser reads (the second sends WOFF2)
    const css = await this.get(`https://fonts.googleapis.com/css?family=${encodeURIComponent(ref.family).replace(/%20/g, '+')}:${ref.weight}${ref.italic ? 'i' : ''}`);
    if (!css.ok) throw new Error(`Google Fonts answered ${css.status} for ${id}`);
    const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)/.exec(await css.text())?.[1];
    if (!url) throw new Error(`No font file for ${id}`);
    const res = await this.get(url);
    if (!res.ok) throw new Error(`Google Fonts answered ${res.status} for ${id}'s file`);
    const data = { ...convertFont(id, ref, await res.arrayBuffer()), licenseText: await this.licenseText(ref.family) };
    if (file) { try { writeFileSync(file, JSON.stringify(data)); } catch { /* kept in memory only */ } }
    return data;
  }

  /** A family's licence in full, from its folder in Google's font repository ('' when it can't be had:
      the font then carries the licence's name and address only). */
  private async licenseText(family: string) {
    const fam = FREE_FAMILIES[family], dir = family.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!fam.license) return '';
    try {
      const res = await this.get(`https://raw.githubusercontent.com/google/fonts/main/${fam.license}/${dir}/${fam.license === 'ofl' ? 'OFL.txt' : 'LICENSE.txt'}`);
      return res.ok ? (await res.text()).trim() : '';
    } catch { return ''; }
  }

  /** Every free font `params` are written in, loaded: what an export's worker draws from (export-pool.ts). */
  wanted(...params: Params[]): Promise<FreeFontData[]> {
    return Promise.all([...new Set(params.flatMap(freeFontsWanted))].map(id => this.load(id)));
  }

  /** Register the free fonts `params` are written in with the engine, so it draws them here. */
  async ready(...params: Params[]) {
    for (const id of new Set(params.flatMap(freeFontsWanted))) if (!freeFont(id)) registerFreeFont(await this.load(id));
  }
}
