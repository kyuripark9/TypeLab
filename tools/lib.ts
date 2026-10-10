/* Shared helpers for the command-line tools: finding a style's settings, loading free fonts from the
   server's cache, flattening outlines and drawing them to a PNG without a browser. */
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFont, registerFreeFont, type Cmd, type Font } from '../shared/engine';
import { STYLES } from '../shared/content';
import { STYLE_FONTS } from '../shared/free-fonts';
import { DEFAULTS, FREE_AT_KEYS, sanitizeParams, type Params } from '../shared/params';
import { FreeFonts } from '../server/free-fonts';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Where tools write what they make, unless told otherwise (git-ignored). */
export const OUT = process.env.TOOLS_OUT ?? resolve(ROOT, '.tools/out');

export const styleOf = (id: string) => {
  const s = STYLES.find(x => x.id === id);
  if (!s) throw new Error(`no style '${id}'; one of: ${STYLES.map(x => x.id).join(' ')}`);
  return s;
};

let fonts: FreeFonts | null = null;
/** The free fonts, as the server keeps them in data/free-fonts (fetched from Google Fonts when missing). */
export const freeFonts = () => (fonts ??= new FreeFonts(process.env.FONTS_DIR ?? resolve(ROOT, 'data/free-fonts')));

/** Style `id`'s settings, written in its free font when `free` (the font is loaded and registered first). */
export async function styleParams(id: string, free = false): Promise<Params> {
  const st = styleOf(id);
  if (!free) return st.params;
  const fid = STYLE_FONTS[id];
  if (!fid) throw new Error(`style '${id}' has no free font`);
  registerFreeFont(await freeFonts().load(fid));
  const freeAt = Object.fromEntries(FREE_AT_KEYS.map(k => [k, st.params[k]]));
  return { ...st.params, freeFont: fid, freeAt } as Params;
}

/** `k=v` pairs laid over `p`: numbers, true/false, or option names. */
export function withSets(p: Params, sets: string[]): Params {
  const out = { ...p } as Record<string, unknown>;
  for (const kv of sets) for (const part of kv.split(',')) {
    const [k, v] = part.split('=');
    if (!(k in DEFAULTS)) throw new Error(`unknown setting '${k}'`);
    out[k] = v === 'true' ? true : v === 'false' ? false : v !== '' && !isNaN(+v) ? +v : v;
  }
  return sanitizeParams(out);
}

export type P = { x: number; y: number };
/** Outline commands (font units, y up) as closed polygons, curves flattened in `n` steps. */
export function polys(cmds: Cmd[], n = 12): P[][] {
  const out: P[][] = [];
  let cur: P[] = [], at: P = { x: 0, y: 0 };
  for (const c of cmds) {
    if (c[0] === 'M') { if (cur.length > 2) out.push(cur); cur = [{ x: c[1], y: c[2] }]; at = cur[0]; }
    else if (c[0] === 'L') { at = { x: c[1], y: c[2] }; cur.push(at); }
    else if (c[0] === 'C') {
      const [, x1, y1, x2, y2, x, y] = c as [string, number, number, number, number, number, number];
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        cur.push({ x: u * u * u * at.x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x, y: u * u * u * at.y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y });
      }
      at = { x, y };
    } else if (c[0] === 'Z') { if (cur.length > 2) out.push(cur); cur = []; }
  }
  if (cur.length > 2) out.push(cur);
  return out;
}

/** A line of `text` set in `font`: its glyphs' outlines moved into place, and how wide it runs. */
export function setLine(font: Font, text: string) {
  const [line] = font.layout(text, Infinity);
  const shapes: { x: number; cmds: Cmd[]; d: string }[] = [];
  for (const it of line?.items ?? []) {
    const g = font.letter(it.ch).glyph(it.ch);
    if (g) shapes.push({ x: it.x, cmds: g.cmds, d: g.d });
  }
  return { shapes, width: line?.width ?? 0 };
}

/** Room above the baseline and below it, in font units, with space for overshoots and flourishes. */
const top = (f: Font) => Math.max(f.m.asc, f.m.cap) + f.m.cap * 0.15;
const bottom = (f: Font) => -f.m.desc + f.m.cap * 0.1;

export interface Row { font: Font; text: string; label?: string }
/** Rows of text as an SVG, each row `size` px to the cap height. */
export function rowsSVG(rows: Row[], size = 96, pad = 24): string {
  let y = pad, w = 0, body = '';
  for (const r of rows) {
    const s = size / r.font.m.cap, { shapes, width } = setLine(r.font, r.text);
    if (r.label) { body += `<text x="${pad}" y="${y + 12}" font-family="Inter, Helvetica, sans-serif" font-size="12" fill="#888">${esc(r.label)}</text>`; y += 20; }
    const base = y + top(r.font) * s;
    body += `<g transform="translate(${pad} ${base.toFixed(1)}) scale(${s.toFixed(5)})">`;
    for (const g of shapes) body += `<path transform="translate(${g.x.toFixed(1)} 0)" d="${g.d}"/>`;
    body += '</g>';
    y = base + bottom(r.font) * s + pad;
    w = Math.max(w, width * s + 2 * pad);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(y)}" viewBox="0 0 ${Math.ceil(w)} ${Math.ceil(y)}"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">${body}</g></svg>`;
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);

/** How much ink covers each pixel (0..1) of the rows drawn `size` px to the cap height (nonzero fill, 4×4 supersampled). */
export function coverage(rows: Row[], size = 96, pad = 24): { w: number; h: number; cover: Float32Array } {
  const placed: { rings: P[][]; dx: number; base: number; s: number }[] = [];
  let y = pad, W = 0;
  for (const r of rows) {
    const s = size / r.font.m.cap, { shapes, width } = setLine(r.font, r.text), base = y + top(r.font) * s;
    for (const g of shapes) placed.push({ rings: polys(g.cmds), dx: pad + g.x * s, base, s });
    y = base + bottom(r.font) * s + pad;
    W = Math.max(W, width * s + 2 * pad);
  }
  const w = Math.ceil(W), h = Math.ceil(y), SS = 4, cover = new Float32Array(w * h);
  for (const { rings, dx, base, s } of placed) {
    const px = rings.map(r => r.map(q => ({ x: dx + q.x * s, y: base - q.y * s })));
    let y0 = Infinity, y1 = -Infinity;
    for (const r of px) for (const q of r) { y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    for (let sy = Math.max(0, Math.floor(y0 * SS)); sy < Math.min(h * SS, Math.ceil(y1 * SS)); sy++) {
      const fy = (sy + 0.5) / SS, xs: { x: number; w: number }[] = [];
      for (const r of px) for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        if ((a.y <= fy) !== (b.y <= fy)) xs.push({ x: a.x + (fy - a.y) / (b.y - a.y) * (b.x - a.x), w: b.y > a.y ? 1 : -1 });
      }
      xs.sort((a, b) => a.x - b.x);
      let wind = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i].w;
        if (!wind) continue;
        const c0 = Math.max(0, Math.round(xs[i].x * SS)), c1 = Math.min(w * SS, Math.round(xs[i + 1].x * SS));
        for (let sx = c0; sx < c1; sx++) cover[(sy / SS | 0) * w + (sx / SS | 0)] += 1 / (SS * SS);
      }
    }
  }
  return { w, h, cover };
}

/** The same rows drawn to a greyscale PNG, with no browser. */
export function rowsPNG(rows: Row[], size = 96, pad = 24): Buffer {
  const { w, h, cover } = coverage(rows, size, pad), raw = Buffer.alloc((w + 1) * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) raw[r * (w + 1) + 1 + c] = 255 - Math.round(Math.min(1, cover[r * w + c]) * 238);
  return png(w, h, raw);
}

/** A greyscale PNG from filtered scanlines (each row a 0 filter byte, then one byte a pixel). */
function png(w: number, h: number, raw: Buffer): Buffer {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type, 'ascii'), data]), len = Buffer.alloc(4), sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export { buildFont };
