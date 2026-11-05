/* Smooth lighter and heavier weights for the families whose other weights the triangle mesh made (ambient-mesh.mjs:
   Turnpike and Funnies, and the five fonts that came in one weight). The mesh cut every curve where it crossed a
   48-unit triangle and moved each piece by a map of its own, so the curves broke at every cut (a few thousand small
   kinks a weight) and straight edges zigzagged. Here every point of the newest base's own weight moves by the same ink
   field, read at the point itself, and its two handles by the field's linear map there, so a smooth point stays smooth.
   Straight edges are put back on a straight line, and a short corner between two of them (a rounding, a chamfer) moves
   whole to where the new edges meet, as an offset would, so corners stay crisp instead of flaring in a light weight and
   rounding in a heavy one. Every point keeps its place, so the package has the newest base's structure exactly.

   How far a weight moves is matched to the drawing it replaces: the same ink in a set of letters (CALIBRATE). A letter
   the mesh didn't make (its weights have no more kinks than its own: slash and backslash, stretched whole) keeps its
   drawings. A letter whose pieces or holes would change keeps its curved edges, and failing that its old drawings.
   Every letter keeps the advance it had at each weight, so spacing doesn't move and a `redrawn` basis map
   (shared/source/subdivision.ts) carries saved designs across.

     node --import tsx tools/masters/smooth-masters.ts Turnpike [--out .audit/masters/smooth]

   Writes, for publishing as a repair of the newest base (docs/architecture/master-basis-revisions.md):
     <Family>-base.json          the new base (weight-masters-v1), for build-masters.ts --derived
     <Family>-from-previous.json the newest base's points to the new base's, one for one, naming the redrawn letters
     <Family>-from-first.json    the family's first base to the new one, as the newest program's map cut it
     <Family>-widths.json        the width columns compiled on the new base's own cuts (build-local-widths.ts' recipe)
   and <Family>.report.json (the amounts, each letter's outcome, kinks before and after) and <Family>-review.png (each
   other weight's old drawing above its new one). Exits 1 if a letter changes its pieces or holes beyond slivers. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { flowField } from './ambient-flow.mjs';
import { decodeWeightMasters, parseWeightMasters, assertCompatibleMasters, type WeightMasterData } from '../../shared/source/masters';
import { MASTER_REVISIONS } from '../../shared/source/master-catalog';
import { PROGRAM_REVISIONS } from '../../shared/source/program-catalog';
import { decodeMasterSubdivision, parseMasterSubdivision, type MasterSubdivisionData } from '../../shared/source/subdivision';
import { parseWidthMasters } from '../../shared/source/width-masters';
import { authorLocalWidths } from '../authored/local-width-masters';
import { LOCAL_WIDTH_RECIPES } from '../authored/build-local-widths';
import { packNode } from '../../shared/engine/free';
import { drawnCmds, type Drawn, type Node } from '../../shared/engine/outline';
import { cmdsBox, signedArea, toPolys } from '../../shared/engine/geom';
import { combine, shape } from '../../shared/engine/boolean';

const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string', default: '.audit/masters/smooth' } } });
const family = positionals[0];
/** each family's field blur, as its mesh weights were made (local-masters.mjs, author-ambient.mjs) */
const BLUR: Record<string, number> = { Turnpike: 18, Funnies: 18, Ballyhoo: 30, Timber: 30, Serenade: 14, Boardwalk: 18, Cathedral: 18 };
if (!family || !(family in BLUR)) throw Error(`Usage: smooth-masters.ts <${Object.keys(BLUR).join('|')}> [--out dir]`);
/** the letters whose ink sets how far a weight moves */
const CALIBRATE = 'HOnoaesd';
/** a straight edge at least this long (font units) sets its own line; a corner up to this long between two moves whole;
    the curve beside a straight edge's end eases into its move over this length; a corner moves at most this far to
    where two edges meet before the edges' middle is taken instead */
const MIN_RUN = 20, CORNER = 24, FADE = 24, MAX_MOVE = 6;
/** how far apart (radians) two line pieces' directions may be and still be one straight edge */
const COLLINEAR = 0.005;
/** a piece of ink or a hole smaller than this (square font units) is a sliver the drawings already carry, not a shape */
const SLIVER = 2;
const H = 1.5;

const info = MASTER_REVISIONS.findLast(m => m.ref.fontId.startsWith(`${family}:`))!;
const raw = parseWeightMasters(JSON.parse(readFileSync(`fonts/masters/${info.ref.digest}.json`, 'utf8')));
const old = decodeWeightMasters(raw), def = raw.defaultWeight;
const neutral = old.masters.find(m => m.weight === def)!.font;
const others = old.masters.filter(m => m.weight !== def);

type Full = { x: number; y: number; ix: number; iy: number; ox: number; oy: number };
type V = { x: number; y: number };
const unit = (x: number, y: number): V => { const l = Math.hypot(x, y); return { x: x / l, y: y / l }; };
const turn = (p: V, q: V) => Math.atan2(p.x * q.y - p.y * q.x, p.x * q.x + p.y * q.y);
const rot = (v: V, t: number): V => ({ x: v.x * Math.cos(t) - v.y * Math.sin(t), y: v.x * Math.sin(t) + v.y * Math.cos(t) });
const bez = (p: Node, q: Node, t: number): V => {
  const u = 1 - t, x1 = p.ox ?? p.x, y1 = p.oy ?? p.y, x2 = q.ix ?? q.x, y2 = q.iy ?? q.y;
  return { x: u * u * u * p.x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * q.x, y: u * u * u * p.y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * q.y };
};

/** Small breaks in a curve's direction (0.5° to 25°) where two pieces meet: the mesh's cuts, or a drawing's own. */
function kinks(cs: Node[][]): number {
  let k = 0;
  for (const c of cs) for (let i = 0; i < c.length; i++) {
    const p = c[(i - 1 + c.length) % c.length], n = c[i], q = c[(i + 1) % c.length];
    let ix = n.x - (n.ix ?? n.x), iy = n.y - (n.iy ?? n.y);
    if (Math.hypot(ix, iy) < 1e-6) { ix = n.x - (p.ox ?? p.x); iy = n.y - (p.oy ?? p.y); }
    let ox = (n.ox ?? n.x) - n.x, oy = (n.oy ?? n.y) - n.y;
    if (Math.hypot(ox, oy) < 1e-6) { ox = (q.ix ?? q.x) - n.x; oy = (q.iy ?? q.y) - n.y; }
    if (Math.hypot(ix, iy) < 1e-6 || Math.hypot(ox, oy) < 1e-6) continue;
    const d = Math.abs(turn({ x: ix, y: iy }, { x: ox, y: oy })) * 180 / Math.PI;
    if (d > 0.5 && d < 25) k++;
  }
  return k;
}

/** Straight runs of the base contour (collinear line pieces in a row) put back on the least-squares line through where
    the field took them, their corners where two such lines meet, short corners between two of them moved whole, and a
    curve that left a straight edge at an angle leaving the new line at the same angle. */
function straighten(base: Node[], m: Full[]): Full[] {
  const n = base.length, out = m.map(p => ({ ...p })), at = (i: number) => ((i % n) + n) % n;
  // a collapsed piece (points stacked to keep the weights' points one for one) belongs to the piece before it, so its
  // points stay stacked on that piece's line
  const zero = (i: number) => {
    const p = base[i], q = base[at(i + 1)], d = (x: number | undefined, y: number | undefined, r: Node) => Math.hypot((x ?? r.x) - r.x, (y ?? r.y) - r.y);
    return Math.hypot(q.x - p.x, q.y - p.y) < 1e-6 && d(p.ox, p.oy, p) < 1e-6 && d(q.ix, q.iy, q) < 1e-6;
  };
  const own = base.map((_, i) => { let j = i; for (let k = 0; k < n && zero(j); k++) j = at(j - 1); return j; });
  const isLine = (i: number) => {
    const p = base[i], q = base[at(i + 1)], dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy);
    if (L < 1e-6) return false;
    const off = (x: number, y: number) => Math.abs((x - p.x) * dy - (y - p.y) * dx) / L;
    return off(p.ox ?? p.x, p.oy ?? p.y) < 1e-4 && off(q.ix ?? q.x, q.iy ?? q.y) < 1e-4;
  };
  const line = base.map((_, i) => isLine(own[i])), dirOf = (i: number) => { const j = own[at(i)]; return unit(base[at(j + 1)].x - base[j].x, base[at(j + 1)].y - base[j].y); };
  // pieces of one straight edge, its cuts' directions apart only by the drawings' rounding
  const same = (i: number, j: number) => line[at(i)] && line[at(j)] && Math.abs(turn(dirOf(at(i)), dirOf(at(j)))) < COLLINEAR;
  if (line.every((_, i) => same(i, i + 1))) return out;
  type Run = { s: number; k: number; c: V; d: V; fit: boolean };
  const runs: Run[] = [];
  for (let i = 0; i < n; i++) if (line[i] && !same(i - 1, i)) {
    let k = 1;
    while (same(i + k - 1, i + k)) k++;
    const pts: V[] = [];
    for (let j = 0; j <= k; j++) pts.push(m[at(i + j)]);
    for (let j = 0; j < k; j++) pts.push(bez(m[at(i + j)], m[at(i + j + 1)], 0.5));
    const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    let xx = 0, xy = 0, yy = 0;
    for (const p of pts) { xx += (p.x - c.x) ** 2; xy += (p.x - c.x) * (p.y - c.y); yy += (p.y - c.y) ** 2; }
    const th = Math.atan2(2 * xy, xx - yy) / 2, chord = { x: m[at(i + k)].x - m[i].x, y: m[at(i + k)].y - m[i].y };
    let d = { x: Math.cos(th), y: Math.sin(th) };
    if (d.x * chord.x + d.y * chord.y < 0) d = { x: -d.x, y: -d.y };
    runs.push({ s: i, k, c, d, fit: Math.hypot(base[at(i + k)].x - base[i].x, base[at(i + k)].y - base[i].y) >= MIN_RUN });
  }
  const startAt = new Map<number, Run>(), endAt = new Map<number, Run>();
  for (const r of runs) if (r.fit) { startAt.set(r.s, r); endAt.set(at(r.s + r.k), r); }
  const project = (p: V, r: Run) => { const t = (p.x - r.c.x) * r.d.x + (p.y - r.c.y) * r.d.y; return { x: r.c.x + r.d.x * t, y: r.c.y + r.d.y * t }; };
  const shift = (p: Full, dx: number, dy: number) => { p.x += dx; p.y += dy; p.ix += dx; p.iy += dy; p.ox += dx; p.oy += dy; };
  /** the handle leaving point v along the curve after a straight edge `r`, at the angle it left the base's edge */
  const leave = (v: number, r: Run, baseDir: V) => {
    const p = out[v], s = base[v], len = Math.hypot(p.ox - p.x, p.oy - p.y), tb = { x: (s.ox ?? s.x) - s.x, y: (s.oy ?? s.y) - s.y };
    if (len < 1e-6 || Math.hypot(tb.x, tb.y) < 1e-6) return;
    const th = turn(baseDir, unit(tb.x, tb.y));
    if (Math.abs(th) < Math.PI / 6) { const u = rot(r.d, th); p.ox = p.x + u.x * len; p.oy = p.y + u.y * len; }
  };
  /** the handle coming into point v along the curve before a straight edge `r` */
  const arrive = (v: number, r: Run, baseDir: V) => {
    const p = out[v], s = base[v], len = Math.hypot(p.x - p.ix, p.y - p.iy), tb = { x: s.x - (s.ix ?? s.x), y: s.y - (s.iy ?? s.y) };
    if (len < 1e-6 || Math.hypot(tb.x, tb.y) < 1e-6) return;
    const th = turn(unit(tb.x, tb.y), baseDir);
    if (Math.abs(th) < Math.PI / 6) { const u = rot(r.d, -th); p.ix = p.x - u.x * len; p.iy = p.y - u.y * len; }
  };
  for (const v of new Set([...startAt.keys(), ...endAt.keys()])) {
    const A = endAt.get(v), B = startAt.get(v), p = out[v];
    let q: V;
    if (A && B) {
      const cross = A.d.x * B.d.y - A.d.y * B.d.x, pa = project(p, A), pb = project(p, B);
      q = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      if (Math.abs(cross) > Math.sin(10 * Math.PI / 180)) {
        const t = ((B.c.x - A.c.x) * B.d.y - (B.c.y - A.c.y) * B.d.x) / cross, meet = { x: A.c.x + A.d.x * t, y: A.c.y + A.d.y * t };
        if (Math.hypot(meet.x - p.x, meet.y - p.y) < MAX_MOVE) q = meet;
      }
    } else q = project(p, (A ?? B)!);
    const dx = q.x - p.x, dy = q.y - p.y;
    shift(p, dx, dy);
    // the curve beside a straight edge's end eases into the end's move, so its short first pieces don't fold
    if (!(A && B)) {
      const step = A ? 1 : -1;
      let s = 0;
      for (let j = at(v + step), prev = v; !startAt.has(j) && !endAt.has(j) && j !== v; prev = j, j = at(j + step)) {
        s += Math.hypot(base[j].x - base[prev].x, base[j].y - base[prev].y);
        const w = 1 - s / FADE;
        if (w <= 0) break;
        shift(out[j], dx * w, dy * w);
      }
    }
    if (A && !B && !line[v]) leave(v, A, dirOf(at(v - 1)));
    else if (B && !A && !line[at(v - 1)]) arrive(v, B, dirOf(v));
  }
  // a short corner between two straight edges keeps its shape and moves to where the new edges meet
  const fitted = runs.filter(r => r.fit);
  if (fitted.length > 1) for (let i = 0; i < fitted.length; i++) {
    const A = fitted[i], B = fitted[(i + 1) % fitted.length], e = at(A.s + A.k), b = B.s;
    if (e === b) continue;
    let len = 0, k = 0;
    for (let j = e; j !== b && k <= n; j = at(j + 1), k++) len += Math.hypot(base[at(j + 1)].x - base[j].x, base[at(j + 1)].y - base[j].y);
    if (k > n || len > CORNER) continue;
    const a0 = dirOf(at(e - 1)), b0 = dirOf(b), cross0 = a0.x * b0.y - a0.y * b0.x, cross = A.d.x * B.d.y - A.d.y * B.d.x;
    if (Math.abs(cross0) < Math.sin(10 * Math.PI / 180) || Math.abs(cross) < Math.sin(10 * Math.PI / 180)) continue;
    const t0 = ((base[b].x - base[e].x) * b0.y - (base[b].y - base[e].y) * b0.x) / cross0, X0 = { x: base[e].x + a0.x * t0, y: base[e].y + a0.y * t0 };
    const t = ((B.c.x - A.c.x) * B.d.y - (B.c.y - A.c.y) * B.d.x) / cross, X = { x: A.c.x + A.d.x * t, y: A.c.y + A.d.y * t };
    const dx = X.x - X0.x, dy = X.y - X0.y;
    for (let j = e; ; j = at(j + 1)) {
      const s = base[j], p = out[j];
      p.x = s.x + dx; p.y = s.y + dy; p.ix = (s.ix ?? s.x) + dx; p.iy = (s.iy ?? s.y) + dy; p.ox = (s.ox ?? s.x) + dx; p.oy = (s.oy ?? s.y) + dy;
      if (j === b) break;
    }
    for (const [v, r] of [[e, A], [b, B]] as const) { const p = out[v], q = project(p, r); shift(p, q.x - p.x, q.y - p.y); }
    if (!line[e]) leave(e, A, a0);
    if (!line[at(b - 1)]) arrive(b, B, b0);
  }
  for (const r of runs) {
    if (r.fit) {
      const b0 = base[r.s], b1 = base[at(r.s + r.k)], L = Math.hypot(b1.x - b0.x, b1.y - b0.y), P0 = out[r.s], P1 = out[at(r.s + r.k)];
      for (let j = 1; j < r.k; j++) {
        const bj = base[at(r.s + j)], u = Math.hypot(bj.x - b0.x, bj.y - b0.y) / L, p = out[at(r.s + j)];
        p.x = P0.x + (P1.x - P0.x) * u; p.y = P0.y + (P1.y - P0.y) * u;
      }
    }
    for (let j = 0; j < r.k; j++) {
      const p = out[at(r.s + j)], q = out[at(r.s + j + 1)];
      p.ox = p.x + (q.x - p.x) / 3; p.oy = p.y + (q.y - p.y) / 3; q.ix = q.x - (q.x - p.x) / 3; q.iy = q.y - (q.y - p.y) / 3;
    }
  }
  return out;
}

const fields = new Map<string, (x: number, y: number, amount: number) => [number, number]>();
/** Letter `ch` of the base's own weight moved by `amount` of its ink field. As the mesh weights did, the letter keeps
    its height and left ink edge. */
function moved(ch: string, amount: number, straight: boolean): Node[][] {
  const g = neutral.glyphs[ch];
  let flow = fields.get(ch);
  if (!flow) { flow = flowField(g.contours, { step: 2, blur: BLUR[family] }); fields.set(ch, flow!); }
  const f = (x: number, y: number) => flow!(x, y, amount);
  const field = g.contours.map(c => c.map(n => {
    const [x, y] = f(n.x, n.y), [xa, ya] = f(n.x + H, n.y), [xb, yb] = f(n.x - H, n.y), [xc, yc] = f(n.x, n.y + H), [xd, yd] = f(n.x, n.y - H);
    const j = { a: (xa - xb) / (2 * H), b: (ya - yb) / (2 * H), c: (xc - xd) / (2 * H), d: (yc - yd) / (2 * H) };
    const lin = (hx: number, hy: number) => [x + j.a * (hx - n.x) + j.c * (hy - n.y), y + j.b * (hx - n.x) + j.d * (hy - n.y)];
    const [ix, iy] = lin(n.ix ?? n.x, n.iy ?? n.y), [ox, oy] = lin(n.ox ?? n.x, n.oy ?? n.y);
    return { x, y, ix, iy, ox, oy };
  }));
  const cs = straight ? field.map((c, i) => straighten(g.contours[i], c)) : field;
  const box = cmdsBox(drawnCmds(g.contours))!, after = cmdsBox(drawnCmds(cs))!;
  const sy = (box.y1 - box.y0) / (after.y1 - after.y0), tx = box.x0 - after.x0, ty = box.y0 - after.y0 * sy;
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  return cs.map(c => c.map(n => ({ x: r(n.x + tx), y: r(n.y * sy + ty), ix: r(n.ix + tx), iy: r(n.iy * sy + ty), ox: r(n.ox + tx), oy: r(n.oy * sy + ty) })));
}

/** The filled pieces and holes of some contours (nonzero), each with its area. */
function parts(cs: Node[][]): number[] {
  const ink = shape(toPolys(drawnCmds(cs)));
  return combine([ink], ink.has).map(signedArea);
}
const count = (areas: number[], least: number) => ({ pieces: areas.filter(v => v > least).length, holes: areas.filter(v => v < -least).length });
const sameCount = (p: { pieces: number; holes: number }, q: { pieces: number; holes: number }) => p.pieces === q.pieces && p.holes === q.holes;
const mixed = (p: Node[][], q: Node[][], t: number): Node[][] => p.map((c, i) => c.map((n, j) => {
  const m = q[i][j], l = (u: number | undefined, v: number | undefined) => u === undefined || v === undefined ? undefined : u + (v - u) * t;
  return { x: l(n.x, m.x)!, y: l(n.y, m.y)!, ix: l(n.ix, m.ix), iy: l(n.iy, m.iy), ox: l(n.ox, m.ox), oy: l(n.oy, m.oy) };
}));
/** Whether a letter's drawings keep the base's pieces and holes (any bigger than a sliver) through every quarter of
    the way from the base to each other weight. */
function holds(ch: string, drawn: Map<number, Drawn>): boolean {
  const base = neutral.glyphs[ch].contours, want = count(parts(base), SLIVER);
  for (const d of drawn.values()) for (const t of [0.25, 0.5, 0.75, 1]) if (!sameCount(count(parts(mixed(base, d.contours, t)), SLIVER), want)) return false;
  return true;
}

/** How much ink the calibration letters hold in some drawings. */
const ink = (get: (ch: string) => Node[][]) => [...CALIBRATE].filter(ch => neutral.glyphs[ch]?.contours.length).reduce((s, ch) => s + parts(get(ch)).reduce((t, v) => t + v, 0), 0);
const baseInk = ink(ch => neutral.glyphs[ch].contours);
/** The field amount that gives weight `m` the ink its old drawing has (bisection: ink grows with the amount). */
function calibrate(m: typeof others[number]): number {
  const want = ink(ch => m.font.glyphs[ch].contours) / baseInk, sign = m.weight < def ? -1 : 1;
  let lo = 0, hi = 48;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2, got = ink(ch => moved(ch, sign * mid, true)) / baseInk;
    if ((got - want) * sign < 0) lo = mid; else hi = mid;
  }
  return sign * (lo + hi) / 2;
}

const amounts = new Map(others.map(m => [m.weight, calibrate(m)]));
console.log(`${family}: amounts ${[...amounts].map(([w, v]) => `${w} ${v.toFixed(2)}`).join(', ')}`);

type Outcome = 'straight' | 'curved' | 'kept: not mesh-made' | 'kept: shape' | 'empty';
const records: { ch: string; outcome: Outcome; kinks: Record<number, [number, number]> }[] = [];
const glyphs = new Map<number, FreeFontGlyphs>(others.map(m => [m.weight, {}]));
type FreeFontGlyphs = WeightMasterData['masters'][number]['data']['glyphs'];
let done = 0;
for (const [ch, g] of Object.entries(neutral.glyphs)) {
  const own = kinks(g.contours), was = new Map(others.map(m => [m.weight, m.font.glyphs[ch]]));
  let outcome: Outcome, drawn = was;
  if (!g.contours.length) outcome = 'empty';
  else if (others.every(m => kinks(m.font.glyphs[ch].contours) <= own + 2)) outcome = 'kept: not mesh-made';
  else {
    const make = (straight: boolean) => new Map(others.map(m => [m.weight, { adv: m.font.glyphs[ch].adv, contours: moved(ch, amounts.get(m.weight)!, straight) }]));
    const straight = make(true), curved = holds(ch, straight) ? null : make(false);
    if (!curved) { outcome = 'straight'; drawn = straight; }
    else if (holds(ch, curved)) { outcome = 'curved'; drawn = curved; }
    else outcome = 'kept: shape';
  }
  for (const m of others) { const d = drawn.get(m.weight)!; glyphs.get(m.weight)![ch] = [d.adv, d.contours.map(c => c.map(packNode))]; }
  records.push({ ch, outcome, kinks: Object.fromEntries(others.map(m => [m.weight, [kinks(m.font.glyphs[ch].contours), kinks(drawn.get(m.weight)!.contours)]])) });
  if (++done % 25 === 0) console.log(`${family}: ${done}/${Object.keys(neutral.glyphs).length} letters`);
}

const data = parseWeightMasters({
  ...raw,
  masters: raw.masters.map(m => m.weight === def ? m : { weight: m.weight, data: { ...m.data, glyphs: glyphs.get(m.weight)! } }),
  notes: [...raw.notes, `The ${others.map(m => m.weight).join(' and ')} drawings are smoothed: every point of the ${def} drawing moves by the same ink field (blur ${BLUR[family]}; amounts ${[...amounts.values()].map(v => v.toFixed(3)).join(' and ')}, matched to the ink of ${CALIBRATE} in the drawings they replace) read at the point itself, its handles by the field's linear map there, instead of by a 48-unit triangle mesh. Straight edges stay straight and short corners between them move whole to where the new edges meet. Points, contours and handles match the ${def} drawing one for one. Letters the mesh did not make keep their drawings (tools/masters/smooth-masters.ts).`]
});
for (const m of data.masters) assertCompatibleMasters(data.masters.find(x => x.weight === def)!.data, m.data);

// the package review the authoring tools run, every letter at every master and quarter between
const decoded = decodeWeightMasters(data), review: { ch: string; weight: number; sliver: boolean }[] = [];
for (const [ch, g] of Object.entries(neutral.glyphs)) {
  const want = parts(g.contours);
  for (const m of others) for (const t of [0.25, 0.5, 0.75, 1]) {
    const got = parts(mixed(g.contours, decoded.masters.find(x => x.weight === m.weight)!.font.glyphs[ch].contours, t));
    if (!sameCount(count(got, 0.1), count(want, 0.1))) review.push({ ch, weight: def + (m.weight - def) * t, sliver: sameCount(count(got, SLIVER), count(want, SLIVER)) });
  }
}

const out = a.out!;
mkdirSync(out, { recursive: true });
const bytes = JSON.stringify(data) + '\n', digest = createHash('sha256').update(bytes).digest('hex'), fontId = info.ref.fontId;
const masterRef = (d: string) => ({ kind: 'masters-v1' as const, digest: d, fontId });
writeFileSync(`${out}/${family}-base.json`, bytes);

// the two maps saved designs cross on: from the newest base (point for point) and from the family's first base (as
// the newest program's map cut it), each naming the letters redrawn away from the default weight
const redrawn = records.filter(r => r.outcome === 'straight' || r.outcome === 'curved').map(r => r.ch).sort((p, q) => p.codePointAt(0)! - q.codePointAt(0)!).join('');
const program = PROGRAM_REVISIONS.findLast(p => p.ref.fontId === fontId)!, transition = program.data.transitions?.find(t => t.mapping.kind === 'master-subdivision-v1');
if (program.data.base.digest !== info.ref.digest || !transition) throw Error(`${family}: the newest program isn't on the newest base, or has no map from the first`);
const first = MASTER_REVISIONS.find(m => m.ref.fontId === fontId)!;
const existing = parseMasterSubdivision(JSON.parse(readFileSync(`fonts/subdivisions/${transition.mapping.digest}.json`, 'utf8')));
if (existing.from.digest !== first.ref.digest || existing.to.digest !== info.ref.digest) throw Error(`${family}: the program's map doesn't join the first base to the newest`);
const fromPrevious: MasterSubdivisionData = parseMasterSubdivision({ format: 'master-subdivision-v1', from: info.ref, to: masterRef(digest),
  glyphs: Object.fromEntries(Object.entries(neutral.glyphs).map(([ch, g]) => [ch, g.contours.map(c => c.map((_, i) => ({ segment: i, t0: 0, t1: 1 })))])), redrawn });
const fromFirst: MasterSubdivisionData = parseMasterSubdivision({ ...existing, to: masterRef(digest), redrawn });
const firstData = parseWeightMasters(JSON.parse(readFileSync(`fonts/masters/${first.ref.digest}.json`, 'utf8')));
decodeMasterSubdivision(fromPrevious, { from: { ref: info.ref, masters: old }, to: { ref: masterRef(digest), masters: decoded } });
decodeMasterSubdivision(fromFirst, { from: { ref: first.ref, masters: decodeWeightMasters(firstData) }, to: { ref: masterRef(digest), masters: decoded } });
writeFileSync(`${out}/${family}-from-previous.json`, JSON.stringify(fromPrevious) + '\n');
writeFileSync(`${out}/${family}-from-first.json`, JSON.stringify(fromFirst) + '\n');

// the width columns, compiled on the new base's own cuts: a cut more would make yet another base, and the fit misses
// by a fraction of a unit
const recipe = LOCAL_WIDTH_RECIPES.find(r => r.style === family)!, WIDTH_FIT = 0.25;
const compiled = authorLocalWidths(data, masterRef(digest), { ...recipe, maxCurveError: WIDTH_FIT });
if (compiled.review.newNodes !== compiled.review.oldNodes) throw Error(`${family}: the width recipe needs new cuts at ${WIDTH_FIT}`);
if (JSON.stringify(compiled.base.masters) !== JSON.stringify(data.masters)) throw Error(`${family}: the neutral width no longer equals the base`);
const widths = parseWidthMasters({ format: 'width-masters-v1', base: masterRef(digest), axis: compiled.data.axis,
  columns: recipe.widths.filter(w => w !== 100).map(width => ({ width, masters: compiled.data.samples.filter(x => x.width === width)
    .map(x => ({ weight: x.weight, space: x.data.space, glyphs: x.data.glyphs })) })),
  provenance: compiled.data.provenance,
  notes: [...compiled.data.notes, `Compiled on the smoothed basis's own cuts (no new cuts); largest sampled fit error ${compiled.review.maxCurveError.toFixed(4)} font units.`] },
  { ref: masterRef(digest), masters: decoded });
writeFileSync(`${out}/${family}-widths.json`, JSON.stringify(widths) + '\n');
const tally = (o: Outcome) => records.filter(r => r.outcome === o).map(r => r.ch).join('');
const sum = (w: number, i: 0 | 1) => records.reduce((s, r) => s + (r.kinks[w]?.[i] ?? 0), 0);
const summary = {
  family, from: info.ref.digest, base: digest, redrawn: redrawn.length, widthFit: +compiled.review.maxCurveError.toFixed(4), amounts: Object.fromEntries(amounts),
  ink: Object.fromEntries(others.map(m => [m.weight, { old: +(ink(ch => m.font.glyphs[ch].contours) / baseInk).toFixed(4), new: +(ink(ch => decoded.masters.find(x => x.weight === m.weight)!.font.glyphs[ch].contours) / baseInk).toFixed(4) }])),
  kinks: { [def]: records.reduce((s, r) => s + kinks(neutral.glyphs[r.ch].contours), 0), ...Object.fromEntries(others.map(m => [m.weight, { old: sum(m.weight, 0), new: sum(m.weight, 1) }])) },
  straight: records.filter(r => r.outcome === 'straight').length, curved: tally('curved'), notMeshMade: tally('kept: not mesh-made'), keptForShape: tally('kept: shape'),
  review: { slivers: review.filter(r => r.sliver).length, failures: review.filter(r => !r.sliver) }
};
writeFileSync(`${out}/${family}.report.json`, JSON.stringify({ ...summary, records }, null, 1) + '\n');

// the review sheet: each other weight's old drawing above its new one
const TEXTS = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789&@?!%$€£¥#*()[]{}'];
function sheet(rows: Record<string, Drawn>[], file: string, scale = 0.09) {
  const pad = 16, lines = rows.flatMap(g => TEXTS.map(t => ({ g, t }))), lineH = Math.ceil(1150 * scale);
  const W = Math.ceil(Math.max(...lines.map(({ g, t }) => [...t].reduce((s, ch) => s + (g[ch]?.adv ?? 0), 0))) * scale) + 2 * pad;
  const Ht = lineH * lines.length + 2 * pad, SS = 3, cover = new Float32Array(W * Ht);
  lines.forEach(({ g, t }, r) => {
    let x0 = pad;
    const base = pad + r * lineH + 820 * scale, rings: V[][] = [];
    for (const ch of t) {
      const d = g[ch];
      if (!d) continue;
      for (const c of d.contours) {
        const pts: V[] = [];
        c.forEach((n, i) => { const q = c[(i + 1) % c.length]; for (let k = 0; k < 16; k++) { const p = bez(n, q, k / 16); pts.push({ x: x0 + p.x * scale, y: base - p.y * scale }); } });
        rings.push(pts);
      }
      x0 += d.adv * scale;
    }
    for (let sy = Math.floor((base - 1000 * scale) * SS); sy < Math.ceil((base + 300 * scale) * SS); sy++) {
      if (sy < 0 || sy >= Ht * SS) continue;
      const fy = (sy + 0.5) / SS, xs: { x: number; w: number }[] = [];
      for (const ring of rings) for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        if ((p.y <= fy) !== (q.y <= fy)) xs.push({ x: p.x + (fy - p.y) / (q.y - p.y) * (q.x - p.x), w: q.y > p.y ? 1 : -1 });
      }
      xs.sort((p, q) => p.x - q.x);
      let wind = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i].w;
        if (!wind) continue;
        for (let sx = Math.max(0, Math.round(xs[i].x * SS)); sx < Math.min(W * SS, Math.round(xs[i + 1].x * SS)); sx++) cover[(sy / SS | 0) * W + (sx / SS | 0)] += 1 / (SS * SS);
      }
    }
  });
  const rawPx = Buffer.alloc((W + 1) * Ht);
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) rawPx[y * (W + 1) + 1 + x] = 255 - Math.round(Math.min(1, cover[y * W + x]) * 235);
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, body: Buffer) => { const t = Buffer.concat([Buffer.from(type, 'ascii'), body]), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(body.length); sum.writeUInt32BE(crc(t)); return Buffer.concat([len, t, sum]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(Ht, 4); ihdr[8] = 8; ihdr[9] = 0;
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rawPx)), chunk('IEND', Buffer.alloc(0))]));
}
sheet(others.flatMap(m => [m.font.glyphs, decoded.masters.find(x => x.weight === m.weight)!.font.glyphs]), `${out}/${family}-review.png`);
console.log(JSON.stringify(summary));
if (summary.review.failures.length) process.exitCode = 1;
