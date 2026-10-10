/* Scoring an engine design against its style's free font: each sample letter rasterized ink-centred on a
   112 px grid, compared by IoU, blurred IoU, edge chamfer distance and darkness. Used by every script in fit/. */
import { buildFont, type Font } from '../../shared/engine';
import type { Params } from '../../shared/params';
import { mkdirSync } from 'node:fs';
import { OUT, polys, type P } from '../lib';

/** Where the fits are written: one <style>.fit.json each. */
export const SCRATCH = `${OUT}/fit`;
mkdirSync(SCRATCH, { recursive: true });

/** Rasterize with nonzero winding onto a W×H grid of 0/1 pixels: font units to px by scale s, font x `x0` at the left edge and font y `yTop` at the top, rows running down. */
function raster(ps: P[][], s: number, x0: number, yTop: number, W: number, H: number): Float32Array {
  const img = new Float32Array(W * H);
  for (let r = 0; r < H; r++) {
    const fy = yTop - (r + 0.5) / s; // font y at row center
    const xs: { x: number; w: number }[] = [];
    for (const p of ps) for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      if ((a.y <= fy) !== (b.y <= fy)) xs.push({ x: a.x + (fy - a.y) / (b.y - a.y) * (b.x - a.x), w: b.y > a.y ? 1 : -1 });
    }
    xs.sort((a, b) => a.x - b.x);
    let w = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      w += xs[i].w;
      if (w !== 0) {
        const c0 = Math.max(0, Math.round((xs[i].x - x0) * s)), c1 = Math.min(W, Math.round((xs[i + 1].x - x0) * s));
        for (let c = c0; c < c1; c++) img[r * W + c] = 1;
      }
    }
  }
  return img;
}
function blur(a: Float32Array, W: number, H: number, r: number) {
  const t = new Float32Array(W * H), o = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) s += a[y * W + xx]; } t[y * W + x] = s / n; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) s += t[yy * W + x]; } o[y * W + x] = s / n; }
  return o;
}
const inkBox = (ps: P[][]) => { let a = Infinity, b = -Infinity; for (const p of ps) for (const q of p) { a = Math.min(a, q.x); b = Math.max(b, q.x); } return [a, b]; };

/** A glyph's raster, centered on its ink horizontally, baseline fixed. Cap height maps to CAPPX. */
const CAPPX = 48, W = 112, H = 112;
function glyphImage(f: Font, ch: string) {
  const g = f.glyph(ch); if (!g) return null;
  const ps = polys(g.cmds, 8); if (!ps.length) return null;
  const s = CAPPX / f.m.cap, [a, b] = inkBox(ps), cx = (a + b) / 2;
  const yTop = (H * 0.72) / s; // baseline at 72% down
  return { img: raster(ps, s, cx - (W / 2) / s, yTop, W, H), adv: g.adv };
}
const SAMPLE = 'HOAEGRSKMNabcdefghkmnoprstuy';
/** Edge pixels (ink touching paper) and the distance from every pixel to the nearest one (chamfer 3-4, in px). */
function edges(a: Float32Array) {
  const e = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!a[i]) continue;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !a[i - 1] || !a[i + 1] || !a[i - W] || !a[i + W]) e[i] = 1; }
  return e;
}
function distMap(e: Uint8Array) {
  const d = new Float32Array(W * H).fill(1e6);
  for (let i = 0; i < W * H; i++) if (e[i]) d[i] = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 3); if (y > 0) { v = Math.min(v, d[i - W] + 3); if (x > 0) v = Math.min(v, d[i - W - 1] + 4); if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4); } d[i] = v; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 3); if (y < H - 1) { v = Math.min(v, d[i + W] + 3); if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4); if (x > 0) v = Math.min(v, d[i + W - 1] + 4); } d[i] = v; }
  for (let i = 0; i < W * H; i++) d[i] /= 3;
  return d;
}
type Ref = { img: Float32Array; b: Float32Array; e: Uint8Array; dm: Float32Array; adv: number };
export function refImages(f: Font, chars = SAMPLE) {
  const m: Record<string, Ref> = {};
  for (const ch of chars) { const r = glyphImage(f, ch); if (r) { const e = edges(r.img); m[ch] = { ...r, b: blur(r.img, W, H, 2), e, dm: distMap(e) }; } }
  return m;
}
/** 0 = identical: 0.3 × (1 − IoU) + 0.2 × (1 − blurred IoU, so near misses still count) + 0.3 × how far the edges lie from each other's, both ways (6 px or more counts in full) + 0.2 × the difference in ink, as a share of the reference's. */
export function glyphScore(ref: Ref, f: Font, ch: string) {
  const r = glyphImage(f, ch); if (!r) return 1;
  let i = 0, u = 0, si = 0, su = 0; const bb = blur(r.img, W, H, 2);
  for (let k = 0; k < W * H; k++) { const a = ref.img[k], c = r.img[k]; i += Math.min(a, c); u += Math.max(a, c); si += Math.min(ref.b[k], bb[k]); su += Math.max(ref.b[k], bb[k]); }
  // outlines: how far each edge lies from the other's, both ways (a filled counter leaves the reference's counter edge far from any)
  const e = edges(r.img), dm = distMap(e); let d1 = 0, n1 = 0, d2 = 0, n2 = 0;
  for (let k = 0; k < W * H; k++) { if (e[k]) { d1 += Math.min(ref.dm[k], 12); n1++; } if (ref.e[k]) { d2 += Math.min(dm[k], 12); n2++; } }
  const ch_ = (d1 / Math.max(n1, 1) + d2 / Math.max(n2, 1)) / 2;
  // how dark: the ink each has, which the eye reads as weight
  let ia = 0, ib = 0; for (let k = 0; k < W * H; k++) { ia += ref.img[k]; ib += r.img[k]; }
  const dark = Math.min(1, Math.abs(ib - ia) / Math.max(ia, 1));
  return 0.3 * (1 - i / Math.max(u, 1)) + 0.2 * (1 - si / Math.max(su, 1)) + 0.3 * Math.min(1, ch_ / 6) + 0.2 * dark;
}
/** The design's mean glyphScore over the reference letters (each drawn at its own settings, as Font.letter gives it). */
export function score(ref: ReturnType<typeof refImages>, p: Params) {
  const f = buildFont(p); let s = 0, n = 0;
  for (const ch in ref) { s += glyphScore(ref[ch], f.letter(ch), ch); n++; }
  return s / n;
}
/** The mean IoU of the design's letters against the reference's (1 = identical), measured as score measures them; for the log. */
export function iou(ref: ReturnType<typeof refImages>, p: Params) {
  const f = buildFont(p); let s = 0, n = 0;
  for (const ch in ref) { const r = glyphImage(f.letter(ch), ch); if (!r) { n++; continue; } let i = 0, u = 0; for (let k = 0; k < W * H; k++) { i += Math.min(ref[ch].img[k], r.img[k]); u += Math.max(ref[ch].img[k], r.img[k]); } s += i / u; n++; }
  return s / n;
}
