/* The lighter weights' check: each card of the Style page in TypeLab's own font, as its family draws it at Thin,
   ExtraLight, Light and Regular, one card at a time in one process (a few minutes, about a gigabyte):

     npm run weights                                 check against tests/golden/weights.txt
     npm run weights -- --cards fatface,softslab     only these cards
     npm run weights -- --no-sweep                   without the Weight sweep (quicker)
     npm run weights -- --list                       every fault found, not only new ones: what is left to fix
     npm run weights:update                          keep what it draws now (after looking at what changed)

   For each card and weight it keeps a short hash of every letter, as tools/golden.ts does, so a change shows which
   letters it moved. It also looks for faults a lighter weight has and the design (the card at its own weight) hasn't:
     pieces     more or fewer separate pieces of ink than the design: a letter broken, a scrap left beside it
     counters   more or fewer counters than the design: one closed, or a slit opened at a join
     crossing   the outline running across itself, more than the design's does: strokes tangled or folded at a join
     needle     the outline turning back on itself within a few units, out of the ink, where the design has no point
                as sharp near: a spike off a serif or a join (and a script's hairline drawn to a point: finer at Thin,
                so read these with the letter in view)
     slit       the same into the ink: a crack at a join or a stem's side
     ink        no less ink than the next heavier weight
   and sweeps Weight from 0 to 1 in steps of 0.02 for a few letters, flagging where one jumps (its spacing or its
   ink changing far more in a step than in the steps about it; a jump of about a tenth of its ink shows, smaller ones
   need a finer sweep). A fault the baseline keeps is reported as kept; the check fails only on new ones. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFont, type Cmd, type Font } from '../shared/engine';
import { STYLES } from '../shared/content';
import { anchorOf, familyMember, type WeightId } from '../shared/family';
import { OWN_FAMILIES, STYLE_FONTS } from '../shared/free-fonts';
import { freeAtOf, type Params } from '../shared/params';
import { fontFile } from '../server/free-fonts';
import { glyphHash } from './golden';
import { FONTS_DIR, holdFonts, letGo, oneAtATime, polys, ROOT, type P } from './lib';

const FILE = resolve(ROOT, 'tests/golden/weights.txt');
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&?';
const LIGHTER: WeightId[] = ['thin', 'extralight', 'light', 'regular'];
/** The letters swept, and the sweep's step. */
const SWEEP_CHARS = 'AHKMRSWabghknoqrsw25&G', SWEEP_STEP = 0.02;

/** The cards drawn in TypeLab's own fonts, by style id. */
export const CARDS = STYLES.filter(s => (STYLE_FONTS[s.id]?.split(':')[0] ?? '') in OWN_FAMILIES).map(s => s.id);

// ---- reading an outline ----

const area = (r: P[]) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a.x * b.y - b.x * a.y; } return s / 2; };
const inside = (q: P, r: P[]) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

/** What a letter's outline is made of: its pieces of ink and its counters (contours inside an even or an odd number of
    others; specks under a unit square left out), its ink, how often it crosses itself, and its sharp points (where it
    turns back on itself to within `turn` degrees over `reach` units either way: a needle out of the ink, convex, or a
    slit into it), placed about the middle of its ink. */
export interface Look { pieces: number; counters: number; ink: number; crossings: number; sharp: Sharp[] }
export interface Sharp { x: number; y: number; convex: boolean; turn: number }
export function look(cmds: Cmd[], cap: number, turn = 155): Look {
  const rs = polys(cmds, 8).filter(r => Math.abs(area(r)) > 1);
  const depth = rs.map((r, i) => rs.filter((o, j) => j !== i && inside(r[0], o)).length);
  const tiny = 0.0005 * cap * cap;
  let pieces = 0, counters = 0, ink = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  rs.forEach((r, i) => {
    const a = Math.abs(area(r));
    if (depth[i] % 2 === 0) { pieces++; ink += a; } else { ink -= a; if (a > tiny) counters++; }
    for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  });
  // (each contour's points with the ink on their left: an outline's counters may run either way round)
  const sharp = rs.flatMap((r, i) => sharpPoints(r, 0.012 * cap, turn, (depth[i] % 2 === 0 ? 1 : -1) * Math.sign(area(r))))
    .map(q => ({ ...q, x: q.x - (x0 + x1) / 2, y: q.y - (y0 + y1) / 2 }));
  return { pieces, counters, ink, crossings: crossings(rs, cap), sharp };
}

/** The sharp points a lighter weight has that the design hasn't near (a tenth of the cap height, about the middles of
    their ink): a needle where the design has no point at least as sharp as 120°, a slit where it has no notch as
    sharp as 145°. A script's hairline drawn to a point stays one at Thin, only finer. */
export const newSharp = (now: Sharp[], design: Sharp[], cap: number) =>
  now.filter(q => !design.some(d => d.convex === q.convex && d.turn >= (q.convex ? 120 : 145) && Math.hypot(d.x - q.x, d.y - q.y) < 0.1 * cap));

/** How many times the outlines' edges cross (not counting edges that meet end to end), found cell by cell. */
function crossings(rs: P[][], cap: number): number {
  type Seg = { a: P; b: P; r: number; i: number };
  const segs: Seg[] = [];
  rs.forEach((r, ri) => r.forEach((a, i) => segs.push({ a, b: r[(i + 1) % r.length], r: ri, i })));
  const cell = cap / 24, grid = new Map<string, number[]>();
  segs.forEach((s, k) => {
    const x0 = Math.floor(Math.min(s.a.x, s.b.x) / cell), x1 = Math.floor(Math.max(s.a.x, s.b.x) / cell);
    const y0 = Math.floor(Math.min(s.a.y, s.b.y) / cell), y1 = Math.floor(Math.max(s.a.y, s.b.y) / cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const key = `${x},${y}`; const l = grid.get(key); if (l) l.push(k); else grid.set(key, [k]); }
  });
  const side = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const seen = new Set<number>();
  let n = 0;
  for (const l of grid.values()) {
    for (let u = 0; u < l.length; u++) for (let v = u + 1; v < l.length; v++) {
      const [k1, k2] = l[u] < l[v] ? [l[u], l[v]] : [l[v], l[u]], s = segs[k1], t = segs[k2];
      if (s.r === t.r) { const len = rs[s.r].length, d = Math.abs(s.i - t.i); if (d <= 1 || d === len - 1) continue; }
      const id = k1 * segs.length + k2;
      if (seen.has(id)) continue;
      seen.add(id);
      const d1 = side(s.a, s.b, t.a), d2 = side(s.a, s.b, t.b), d3 = side(t.a, t.b, s.a), d4 = side(t.a, t.b, s.b);
      if (d1 * d2 < 0 && d3 * d4 < 0) n++;
    }
  }
  return n;
}

/** Where a contour turns by `turn` degrees or more over `reach` units either way (the sharpest point of each run of
    them), and whether toward its ink (`inkLeft` 1 when the ink is on its left, as it runs): a needle out of the ink is
    convex, a slit into it not. */
function sharpPoints(r: P[], reach: number, turn: number, inkLeft: number): Sharp[] {
  const n = r.length, len = r.map((a, i) => Math.hypot(r[(i + 1) % n].x - a.x, r[(i + 1) % n].y - a.y));
  const along = (i: number, dir: 1 | -1) => {
    let j = i, d = 0;
    for (let k = 0; k < n && d < reach; k++) { const step = dir > 0 ? len[j] : len[(j - 1 + n) % n]; j = (j + dir + n) % n; d += step; }
    return r[j];
  };
  const at = r.map((p, i) => {
    const a = along(i, -1), b = along(i, 1), ux = p.x - a.x, uy = p.y - a.y, vx = b.x - p.x, vy = b.y - p.y;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (!lu || !lv) return null;
    const deg = (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))) * 180) / Math.PI;
    return deg >= turn ? { x: p.x, y: p.y, convex: (ux * vy - uy * vx) * inkLeft > 0, turn: deg } : null;
  });
  const out: Sharp[] = [];
  // (from a point that isn't sharp, so a run that wraps past the first point is one run)
  const start = at.findIndex(q => !q);
  if (start < 0) return at[0] ? [at.reduce((m, q) => (q!.turn > m!.turn ? q : m))!] : [];
  let best: Sharp | null = null;
  for (let k = 1; k <= n; k++) {
    const q = at[(start + k) % n];
    if (q && (!best || q.turn > best.turn)) best = q;
    if (!q && best) { out.push(best); best = null; }
  }
  return out;
}

// ---- one card ----

interface CardResult { key: string; hashes: Record<WeightId, string>; faults: Map<string, string>; sweep: Map<string, string> }

const inkOf = (f: Font, ch: string) => { const g = f.letter(ch).glyph(ch); return g ? Math.abs(polys(g.cmds, 6).reduce((s, r) => s + area(r), 0)) : 0; };

/** Card `id` at the lighter weights: each letter's hash, the faults found (`weight:letter:kind` with what was seen)
    and the Weight sweep's jumps (`letter@weight:room|ink`). */
function card(id: string, sweep: boolean): CardResult {
  const st = STYLES.find(s => s.id === id)!, fid = STYLE_FONTS[id], file = fontFile(FONTS_DIR, fid);
  const tag = createHash('sha1').update(readFileSync(file, 'utf8')).digest('base64url').slice(0, 6);
  const p = { ...st.params, freeFont: fid, freeAt: freeAtOf(st.params) } as Params;
  const held = new Set<string>();
  holdFonts(p, held);
  const design = buildFont(p), cap = design.m.cap, anchor = anchorOf(p);
  const was = new Map<string, Look>();
  for (const ch of CHARS) { const g = design.letter(ch).glyph(ch); if (g) was.set(ch, look(g.cmds, cap, 120)); }
  const hashes = {} as Record<WeightId, string>, faults = new Map<string, string>(), ink = new Map<string, number[]>();
  for (const w of LIGHTER) {
    const mp = familyMember(p, anchor, w, false).params;
    holdFonts(mp, held);
    const f = buildFont(mp);
    let line = '';
    for (const ch of CHARS) {
      const g = f.letter(ch).glyph(ch);
      line += g ? glyphHash(g.cmds, g.lsb, g.adv) : '...';
      const d = was.get(ch);
      if (!g || !d) continue;
      const l = look(g.cmds, cap), at = `${w}:${ch}`;
      if (l.pieces !== d.pieces) faults.set(`${at}:pieces`, `${l.pieces} (design ${d.pieces})`);
      if (l.counters !== d.counters) faults.set(`${at}:counters`, `${l.counters} (design ${d.counters})`);
      if (l.crossings > d.crossings) faults.set(`${at}:crossing`, `${l.crossings} (design ${d.crossings})`);
      const sharp = newSharp(l.sharp, d.sharp, cap);
      for (const convex of [true, false]) {
        const qs = sharp.filter(q => q.convex === convex);
        if (qs.length) faults.set(`${at}:${convex ? 'needle' : 'slit'}`, qs.map(q => `${Math.round(q.turn)}° at ${Math.round(q.x)},${Math.round(q.y)}`).join('; '));
      }
      ink.set(ch, [...(ink.get(ch) ?? []), l.ink]);
    }
    hashes[w] = line;
  }
  for (const [ch, v] of ink) for (let i = 0; i + 1 < v.length; i++) if (v[i] >= v[i + 1]) faults.set(`${LIGHTER[i]}:${ch}:ink`, `${Math.round(v[i])} ≥ ${LIGHTER[i + 1]}'s ${Math.round(v[i + 1])}`);
  const jumps = new Map<string, string>();
  // (not a family drawn in several weights, as Bulwark is: Weight draws each from the nearest, a step at each)
  if (sweep && !OWN_FAMILIES[fid.split(':')[0]].weights) {
    const vs = Array.from({ length: Math.round(1 / SWEEP_STEP) + 1 }, (_, i) => +(i * SWEEP_STEP).toFixed(4));
    const rows = vs.map(v => {
      const q = { ...p, weight: v } as Params;
      holdFonts(q, held);
      const f = buildFont(q);
      return Object.fromEntries([...SWEEP_CHARS].map(ch => { const g = f.letter(ch).glyph(ch); return [ch, g ? { adv: g.adv, lsb: g.lsb, ink: inkOf(f, ch) } : null]; }));
    });
    for (const ch of SWEEP_CHARS) {
      const d = rows.slice(1).map((r, i) => { const a = rows[i][ch], b = r[ch]; return a && b ? { v: vs[i + 1], room: Math.max(Math.abs(b.adv - a.adv), Math.abs(b.lsb - a.lsb)), ink: Math.abs(b.ink - a.ink) / Math.max(a.ink, 1) } : null; });
      d.forEach((x, i) => {
        if (!x) return;
        const near = [...d.slice(Math.max(0, i - 4), i), ...d.slice(i + 1, i + 5)].filter(Boolean) as { room: number; ink: number }[];
        const med = (k: 'room' | 'ink') => { const s = near.map(n => n[k]).sort((a, b) => a - b); return s[s.length >> 1] ?? 0; };
        if (x.room > 4 && x.room > 3 * med('room') + 1) jumps.set(`${ch}@${x.v}:room`, `${x.room.toFixed(0)} units`);
        if (x.ink > 0.015 && x.ink > 3 * med('ink') + 0.005) jumps.set(`${ch}@${x.v}:ink`, `${(x.ink * 100).toFixed(1)}%`);
      });
    }
  }
  letGo(held);
  return { key: `${id}@${tag}`, hashes, faults, sweep: jumps };
}

// ---- the baseline ----

/** The kept lines, by key: `<card>@<font hash>:<weight>` its letters' hashes, `:faults` and `:sweep` comma lists. */
function readKept(): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(FILE)) return out;
  for (const l of readFileSync(FILE, 'utf8').split('\n')) {
    if (!l || l.startsWith('#') || l.startsWith('chars ')) continue;
    const at = l.lastIndexOf(' ');
    out.set(l.slice(0, at), l.slice(at + 1));
  }
  return out;
}
const linesOf = (r: CardResult, kept: Map<string, string>, sweep: boolean): [string, string][] => [
  ...LIGHTER.map((w): [string, string] => [`${r.key}:${w}`, r.hashes[w]]),
  [`${r.key}:faults`, [...r.faults.keys()].join(',') || '-'],
  [`${r.key}:sweep`, sweep ? [...r.sweep.keys()].join(',') || '-' : kept.get(`${r.key}:sweep`) ?? '-']
];
const listOf = (v: string | undefined) => new Set(!v || v === '-' ? [] : v.split(','));

// ---- the run ----

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), has = (f: string) => args.includes(f);
  const pick = args.includes('--cards') ? args[args.indexOf('--cards') + 1].split(',') : CARDS;
  for (const c of pick) if (!CARDS.includes(c)) throw new Error(`'${c}' isn't a card in an own font; one of: ${CARDS.join(' ')}`);
  const update = has('--update'), sweep = !has('--no-sweep'), list = has('--list');
  await oneAtATime('weights', () => {
    const kept = readKept(), now = new Map(kept);
    let fresh = 0;
    const t0 = Date.now();
    for (const id of pick) {
      const r = card(id, sweep);
      for (const [k, v] of linesOf(r, kept, sweep)) now.set(k, v);
      const old = [...kept.keys()].find(k => k.startsWith(`${id}@`))?.split(':')[0];
      if (old && old !== r.key) for (const k of [...now.keys()]) if (k.startsWith(`${old}:`)) now.delete(k);
      const head = `${id.padEnd(12)}`;
      if (!kept.has(`${r.key}:faults`)) { console.log(`${head} ${kept.size ? 'not in the baseline (its font is new or changed)' : 'no baseline yet'}: ${r.faults.size} faults, ${r.sweep.size} jumps`); }
      else {
        const moved = LIGHTER.map(w => {
          const a = kept.get(`${r.key}:${w}`) ?? '', b = r.hashes[w];
          const cs = [...CHARS].filter((_, i) => a.slice(i * 3, i * 3 + 3) !== b.slice(i * 3, i * 3 + 3));
          return cs.length ? `${w} ${cs.join('')}` : '';
        }).filter(Boolean);
        const wasF = listOf(kept.get(`${r.key}:faults`)), wasS = listOf(kept.get(`${r.key}:sweep`));
        const newF = [...r.faults.keys()].filter(k => !wasF.has(k)), goneF = [...wasF].filter(k => !r.faults.has(k));
        const newS = sweep ? [...r.sweep.keys()].filter(k => !wasS.has(k)) : [], goneS = sweep ? [...wasS].filter(k => !r.sweep.has(k)) : [];
        fresh += newF.length + newS.length;
        console.log(`${head} ${r.faults.size} faults, ${sweep ? `${r.sweep.size} jumps` : 'not swept'}${moved.length ? `; moved: ${moved.join(', ')}` : ''}`);
        for (const k of newF) console.log(`  NEW  ${k}  ${r.faults.get(k)}`);
        for (const k of newS) console.log(`  NEW  ${k}  ${r.sweep.get(k)}`);
        for (const k of [...goneF, ...goneS]) console.log(`  gone ${k}`);
      }
      if (list) { for (const [k, v] of r.faults) console.log(`  ${k}  ${v}`); for (const [k, v] of r.sweep) console.log(`  ${k}  ${v}`); }
    }
    console.log(`${pick.length} cards in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    if (update) {
      const lines = [`# lighter weights: npm run weights:update rewrites this file; see tools/weights.ts`, `chars ${JSON.stringify(CHARS)}`];
      for (const [k, v] of [...now].sort(([a], [b]) => a.localeCompare(b))) lines.push(`${k} ${v}`);
      writeFileSync(FILE, lines.join('\n') + '\n');
      console.log(`wrote ${FILE}`);
    } else if (fresh) { console.log(`${fresh} new fault${fresh === 1 ? '' : 's'}`); process.exitCode = 1; }
  });
}

