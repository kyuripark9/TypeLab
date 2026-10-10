/* Free fonts' letters (see shared/free-fonts.ts), fetched from Google Fonts the first time a font is
   asked for, converted to the outlines the engine draws (shared/engine/free.ts) and kept: in memory,
   and as a file in `dir` when there is one, so a font is fetched once. Only the fonts the styles name
   are fetched. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as opentypeNs from 'opentype.js';
import { ALL_CHARS, freeFont, freeFontsWanted, packNode, registerFreeFont, type FreeFontData, type Node, type PackedNode } from '../shared/engine';
import { FREE_FAMILIES, parseFontId, type FreeFontRef } from '../shared/free-fonts';
import type { Params } from '../shared/params';

// opentype.js is CommonJS: under Node its API sits on the default export
const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs) as typeof opentypeNs;

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>;

/** The licence a font comes under, by the address its name table gives for it. */
function licenseName(url: string) {
  if (/apache/i.test(url)) return 'Apache License, Version 2.0';
  if (/ubuntu/i.test(url)) return 'Ubuntu Font Licence, Version 1.0';
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
export function convertFont(id: string, ref: FreeFontRef, buf: ArrayBuffer): FreeFontData {
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
  const name = (k: string) => names[k]?.en?.trim() ?? '';
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

export class FreeFonts {
  private loading = new Map<string, Promise<FreeFontData>>();
  constructor(private dir: string | null, private get: Fetch = fetch) {
    if (dir) mkdirSync(dir, { recursive: true });
  }
  private file(id: string) { return this.dir && keptFile(this.dir, id); }

  /** Font `id`'s letters, from what's kept or else from Google Fonts. Throws for an id that isn't a free font. */
  load(id: string): Promise<FreeFontData> {
    const ref = parseFontId(id);
    if (!ref) return Promise.reject(new Error(`${id} isn't one of the free fonts`));
    let p = this.loading.get(id);
    if (!p) {
      p = this.fetchFont(id, ref);
      this.loading.set(id, p);
      // a failed fetch is tried again next time
      p.catch(() => this.loading.delete(id));
    }
    return p;
  }

  private async fetchFont(id: string, ref: FreeFontRef): Promise<FreeFontData> {
    const file = this.file(id);
    if (file) {
      try {
        const kept = JSON.parse(readFileSync(file, 'utf8')) as FreeFontData;
        // (one kept before the licence's full text was, or without it, is fetched again, as is one kept with
        // heights read wrong off the font, far too small for its letters: see convertFont)
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
    try {
      const res = await this.get(`https://raw.githubusercontent.com/google/fonts/main/${fam.license}/${dir}/${fam.license === 'ofl' ? 'OFL.txt' : 'LICENSE.txt'}`);
      return res.ok ? (await res.text()).trim() : '';
    } catch { return ''; }
  }

  /** Register the free fonts `params` are written in with the engine, so it draws them (an export). */
  async ready(...params: Params[]) {
    for (const id of new Set(params.flatMap(freeFontsWanted))) if (!freeFont(id)) registerFreeFont(await this.load(id));
  }
}
