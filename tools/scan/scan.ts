/* Every style's free font (a slice of them: SLICE=i/n, to run several at once), moved by each setting in VARS:
   flag letters that come out broken against the font as picked (area off, specks, spikes, grown, contours
   gained or lost). Writes one JSON line per font to OUT_FILE (default .tools/out/scan.jsonl).
     node --import tsx tools/scan/scan.ts
     VARS='weight=1 contrast=1' SLICE=0/4 node --import tsx tools/scan/scan.ts
   Fonts not kept in data/free-fonts are fetched from Google Fonts first. */
import { appendFileSync, mkdirSync } from 'node:fs';
import { registerFreeFont, buildFont, freeFont, type Glyph } from '../../shared/engine';
import { STYLES } from '../../shared/content';
import { STYLE_FONTS } from '../../shared/free-fonts';
import { FREE_AT_KEYS, type Params } from '../../shared/params';
import { freeFonts, OUT, polys, type P } from '../lib';
mkdirSync(OUT, { recursive: true });
const OUT_FILE = process.env.OUT_FILE ?? `${OUT}/scan.jsonl`;
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const VARIANTS: string[] = (process.env.VARS || 'extenders=0 extenders=1 descender=0 descender=1 counter=0 counter=1 dotSize=0 dotSize=1 pinch=1 joints=1 roundness=0 roundness=1 steps=1 innerRound=1 joinRound=1 terminal=flat terminal=round terminal=round,terminalForm=ball terminal=sharp terminal=angled terminal=cut terminal=tapered terminal=flat,terminalForm=flared').split(' ');
const [si, sn] = (process.env.SLICE || '0/1').split('/').map(Number);
const area = (r: P[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.x * q.y - q.x * p.y; } return a / 2; };
const box = (rs: P[][]) => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const r of rs) for (const p of r) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } return { w: x1 - x0, h: y1 - y0 }; };
const spikes = (rs: P[][]) => { let n = 0; for (const r of rs) { const m = r.length; for (let i = 0; i < m; i++) { const a = r[(i - 1 + m) % m], b = r[i], c = r[(i + 1) % m];
  const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y); if (l1 < 0.5 || l2 < 0.5) continue;
  if (((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (l1 * l2) < -0.7) n++; } } return n; };
const fonts = [...new Set(STYLES.map(s => STYLE_FONTS[s.id]).filter(Boolean))].filter((_, i) => i % sn === si);
for (const fid of fonts) {
  try { registerFreeFont(await freeFonts().load(fid)); } catch { /* reported as missing below */ }
  const st = STYLES.find(s => STYLE_FONTS[s.id] === fid)!;
  if (!freeFont(fid)) { appendFileSync(OUT_FILE, JSON.stringify({ font: fid, error: 'missing' }) + '\n'); continue; }
  const p0 = { ...st.params, freeFont: fid, freeAt: Object.fromEntries(FREE_AT_KEYS.map(k => [k, (st.params as any)[k]])) } as Params;
  const t = performance.now(), base = buildFont(p0), rows: any[] = [];
  for (const v of VARIANTS) {
    const p = { ...p0 } as any;
    for (const kv of v.split(',')) { const [k, x] = kv.split('='); p[k] = x === 'true' ? true : x === 'false' ? false : isNaN(+x) ? x : +x; }
    let f;
    try { f = buildFont(p); } catch (e) { rows.push({ v, error: String(e) }); continue; }
    for (const ch of CHARS) {
      let g0: Glyph | null, g: Glyph | null;
      try { g0 = base.glyph(ch); g = f.glyph(ch); } catch (e) { rows.push({ v, ch, error: String(e).slice(0, 200) }); continue; }
      if (!g0 || !g) continue;
      const r0 = polys(g0.cmds), r = polys(g.cmds);
      const a0 = r0.reduce((s, x) => s + area(x), 0), a1 = r.reduce((s, x) => s + area(x), 0);
      const tiny = (rs: P[][], A: number) => rs.filter(x => Math.abs(area(x)) < Math.abs(A) * 0.004).length;
      const b0 = box(r0), b1 = box(r);
      const flags: string[] = [];
      const ar = Math.abs(a1) / (Math.abs(a0) || 1);
      if (!(ar > 0.55 && ar < 1.8)) flags.push('area' + ar.toFixed(2));
      if (tiny(r, a0) - tiny(r0, a0) > 0) flags.push('specks');
      if (spikes(r) - spikes(r0) > 3) flags.push('spikes' + (spikes(r) - spikes(r0)));
      if (b1.w > b0.w * 1.45 + 40 || b1.h > b0.h * 1.45 + 40) flags.push('grew');
      if (Math.abs(r.length - r0.length) > 1) flags.push('contours' + (r.length - r0.length));
      if (flags.length) rows.push({ v, ch, flags });
    }
  }
  appendFileSync(OUT_FILE, JSON.stringify({ font: fid, style: st.id, ms: Math.round(performance.now() - t), rows }) + '\n');
  console.log(fid, Math.round(performance.now() - t), 'ms', rows.length);
}
