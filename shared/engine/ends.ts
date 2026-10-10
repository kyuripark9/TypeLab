/* Stroke ends: the centerline sampled and measured along its arcs, an end drawn on or trimmed back
   (Length), curled on round its turn or flared out (Curl) without running into the rest of the letter,
   or turned to run straight out level or plumb; then every styled terminal of a glyph stretched at
   once (stretchTerminals), a capital's swash end, and a stroke's clip widened to follow a moved end.
   Runs on skeletons, before buildGlyph (glyph.ts) expands them. */
import { endCurl, endLength, endReach } from '../params';
import { clamp, cubicAt, lerp, lerpP, quarter, subCubic } from './geom';
import type { ClipBox, Cmd, Pt } from './types';
import { type Builder, type Metrics, quarterK, strokeWt } from './font';

/** A cubic's arc-length table: arc(u) the length up to u, uAt(s) the u at length s, `total` its whole length. */
function arcTable(P: Pt[], n = 48) {
  const cum = [0];
  let prev = P[0];
  for (let i = 1; i <= n; i++) { const q = cubicAt(P, i / n); cum.push(cum[i - 1] + Math.hypot(q.x - prev.x, q.y - prev.y)); prev = q; }
  const arc = (u: number) => { const f = clamp(u) * n, i = Math.min(n - 1, Math.floor(f)); return lerp(cum[i], cum[i + 1], f - i); };
  const uAt = (s: number) => {
    let i = 1;
    while (i < n && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1];
    return clamp((i - 1 + (seg > 0 ? (s - cum[i - 1]) / seg : 0)) / n);
  };
  return { arc, uAt, total: cum[n] };
}

/** The cubic a command draws from `cur` (a line as a straight one), or null for one that draws nothing (M, Z). */
const cmdCubic = (cur: Pt, c: Cmd, m: Metrics): Pt[] | null => {
  if (c[0] === 'L') { const to = { x: c[1], y: c[2] }; return [cur, lerpP(cur, to, 1 / 3), lerpP(cur, to, 2 / 3), to]; }
  if (c[0] === 'C') return [cur, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }];
  if (c[0] === 'hv' || c[0] === 'vh') return quarter(cur.x, cur.y, c[1], c[2], c[0], quarterK(cur, c, m));
  return null;
};

/** Points along a centerline, about `step` apart. */
export function centerPoints(cmds: Cmd[], m: Metrics, step: number): Pt[] {
  const out: Pt[] = [];
  let cur: Pt = { x: 0, y: 0 };
  for (const c of cmds) {
    if (c[0] === 'M') { cur = { x: c[1], y: c[2] }; out.push(cur); continue; }
    const P = cmdCubic(cur, c, m);
    if (!P) continue;
    // (a line is sampled whole, whatever part of it its options name)
    const o = c[0] === 'L' ? {} : (c[c[0] === 'C' ? 7 : 3] || {});
    const u0 = o.u0 || 0, u1 = o.u1 ?? 1, hull = Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y) + Math.hypot(P[2].x - P[1].x, P[2].y - P[1].y) + Math.hypot(P[3].x - P[2].x, P[3].y - P[2].y);
    const n = Math.max(1, Math.ceil(hull * (u1 - u0) / step));
    for (let k = 0; k <= n; k++) out.push(cubicAt(P, lerp(u0, u1, k / n)));
    cur = P[3];
  }
  return out;
}

/** The command at the start ('s') or end ('e') of an open centerline, the point it starts from,
    and its cubic (a line as a straight one). Null if the line isn't open or can't be read there. */
function endCmd(cmds: Cmd[], which: 's' | 'e', m: Metrics) {
  if (cmds[0]?.[0] !== 'M' || cmds.some((c, i) => i > 0 && (c[0] === 'M' || c[0] === 'Z'))) return null;
  const i = which === 's' ? 1 : cmds.length - 1, c = cmds[i];
  if (!c) return null;
  let cur: Pt = { x: cmds[0][1], y: cmds[0][2] };
  for (let j = 1; j < i; j++) { const n = cmds[j].length, off = typeof cmds[j][n - 1] === 'number' ? 2 : 3; cur = { x: cmds[j][n - off], y: cmds[j][n - off + 1] }; }
  const P = cmdCubic(cur, c, m);
  if (!P) return null;
  const oi = c[0] === 'C' ? 7 : 3;
  const o = { ...(c[oi] || {}) }, line = c[0] === 'L';
  return { i, c, cur, P, oi, o, line, u0: line ? 0 : o.u0 || 0, u1: line || o.u1 == null ? 1 : o.u1 };
}

/** An end moved: the new commands, where the end was (`from`) and now is (`to`), and for a curl how far it
    swings out left and right (`span`). */
type EndMove = { cmds: Cmd[]; from: Pt; to: Pt; span?: { x0: number; x1: number } };

/** Move the start ('s') or end ('e') of an open centerline by `d` along it (negative trims): a terminal
    grows on along its own curve, then straight on past the curve's end, or draws back along it. Trimming
    always leaves 40% of the end segment. Returns the new commands and where that end was and now is, or
    null if it can't (the centerline isn't open or can't be read there, or its end is a line shorter than 1). */
export function stretchEnd(cmds: Cmd[], which: 's' | 'e', d: number, m: Metrics): EndMove | null {
  const e = endCmd(cmds, which, m);
  if (!e) return null;
  const { i, c, cur, P, oi, o, u0, u1 } = e, out = cmds.slice();
  if (e.line) {
    const dx = c[1] - cur.x, dy = c[2] - cur.y, l = Math.hypot(dx, dy);
    if (l < 1) return null;
    const nl = Math.max(l * 0.4, l + d), ux = dx / l, uy = dy / l;
    if (which === 'e') {
      const to = { x: cur.x + ux * nl, y: cur.y + uy * nl };
      out[i] = ['L', to.x, to.y, ...c.slice(3)];
      return { cmds: out, from: { x: c[1], y: c[2] }, to };
    }
    const to = { x: c[1] - ux * nl, y: c[2] - uy * nl };
    out[0] = ['M', to.x, to.y];
    return { cmds: out, from: cur, to };
  }
  const { arc, uAt, total } = arcTable(P), a = arc(u0), b = arc(u1);
  const next = c.slice(0, oi) as Cmd;
  next[oi] = o;
  out[i] = next;
  if (which === 'e') {
    const s = Math.max(a + (b - a) * 0.4, b + d), from = cubicAt(P, u1);
    o.u1 = s < total ? uAt(s) : 1;
    let to: Pt = cubicAt(P, o.u1);
    if (s > total) {
      const t = cubicAt(P, 1);
      to = { x: t.x + t.tx * (s - total), y: t.y + t.ty * (s - total) };
      out.push(['L', to.x, to.y, o.w != null ? { w: o.w } : {}]);
    }
    return { cmds: out, from, to };
  }
  const s = Math.min(b - (b - a) * 0.4, a - d), from = cubicAt(P, u0);
  o.u0 = s > 0 ? uAt(s) : 0;
  let to: Pt = cubicAt(P, o.u0);
  if (s < 0) {
    const t = cubicAt(P, 0);
    to = { x: t.x + t.tx * s, y: t.y + t.ty * s };
    out.splice(0, 1, ['M', to.x, to.y], ['L', t.x, t.y, o.w != null ? { w: o.w } : {}]);
  }
  return { cmds: out, from, to };
}

/** Where the start ('s') or end ('e') of an open centerline sits: stretchEnd's `from`, moving it by nothing, so null
    wherever stretchEnd can't move it. */
const endAt = (cmds: Cmd[], which: 's' | 'e', m: Metrics): Pt | null => stretchEnd(cmds, which, 0, m)?.from ?? null;

/* Curling an end: the last stretch of the stroke, up to CURL_REACH of the x-height back from its
   tip, is redrawn by following its own tangents and turning more at every step. Above 0.5 the
   end curls on round the way it already turns (a straight end toward the middle of the letter);
   below it a curved end first unbends until it is straight, and then, like a straight end, curls
   the other way. A curl winds like a volute, gently where it leaves the stroke and tighter toward
   the tip. It winds further round the further Curl is from 0.5, CURL_TURNS times round per unit
   of that at first, climbing steeply to CURL_MOST turns at either end, or as many as fit within
   CURL_WIDEST x-heights of its middle. It draws the end out as far as it needs for that, up to
   CURL_LONGEST x-heights, and never turns tighter at the tip than CURL_TIGHT of the stroke
   width, or CURL_ROUND once it winds twice round.
   Winding more than once round, it never turns so tight that a turn comes nearer the one around
   it than CURL_GAP stroke widths (centerline to centerline), and runs on a little further to
   wind round instead.
   Its length changes as with stretchEnd, and any length past what the curl takes first draws
   the end on along its own path, carrying the curl further out.
   A curl keeps CURL_CLEAR of the stroke width clear of the rest of the letter (centerline to
   centerline), and CURL_GAP clear of its own earlier turns and of the rest of its own stroke,
   bar where it leaves it. Where it would run into another stroke it draws the end on first, up
   to CURL_LEAD x-heights, winds less and smaller, or, when the length drawn on first is what
   runs into the letter, gives some of that up, whichever changes it least (see CURL_TRIES). */
const CURL_REACH = 0.45, CURL_TURNS = 1.25, CURL_MOST = 3, CURL_WIDEST = 1.2, CURL_LONGEST = 14, CURL_TIGHT = 0.9, CURL_ROUND = 1.5, CURL_CLEAR = 1.6, CURL_GAP = 1.5, CURL_LEAD = 0.6;
/** How much of the lower half of Curl a curved end takes to straighten. */
const CURL_UNBEND = 0.3;
/** How much longer than its Archimedean spiral a curl is drawn: shapeEnd's spiral() multiplies by it and fits
    divides by it, solving spiral for the number of turns a length holds, so the two stay in step. */
const SPIRAL_SLACK = 1.2;
/** The ways a crowded curl can give way, as [how much further on it starts, in x-heights; its
    size; how much of the length drawn on before it it keeps], cheapest first. */
const CURL_TRIES = [1, 0.5, 0].flatMap(g => [0, 0.1, 0.2, 0.3, 0.45, CURL_LEAD].flatMap(x => [1, 0.85, 0.7, 0.55, 0.42, 0.3, 0.2, 0.12, 0.06, 0].map(f => [x, f, g])))
  .map(t => ({ t, cost: t[0] * 2 + 1 - t[1] + (1 - t[2]) * 0.5 })).sort((p, q) => p.cost - q.cost).map(({ t }) => t).slice(1);

/** A dot's outline, a point every `step` along it (its own points marked `corner`), and its middle, for a curl to keep off. */
function dotPoints(poly: Pt[], step: number): (Pt & { dot: true; corner?: boolean })[] {
  const out: (Pt & { dot: true; corner?: boolean })[] = [];
  let cx = 0, cy = 0;
  poly.forEach((a, k) => {
    const b = poly[(k + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let j = 0; j < n; j++) out.push({ x: lerp(a.x, b.x, j / n), y: lerp(a.y, b.y, j / n), dot: true, corner: !j });
    cx += a.x / poly.length; cy += a.y / poly.length;
  });
  out.push({ x: cx, y: cy, dot: true });
  return out;
}

/** A point a curl keeps clear of: a centerline's, or a dot's (on its outline, a `corner` of it, or its middle). */
type CrowdPt = Pt & { dot?: boolean; corner?: boolean };

/** What a curl on the start ('s') or end ('e') of `cmds` keeps clear of: the rest of the letter (crowd(), its other
    centerlines and dots) and the rest of its own stroke, short of the stretch it redraws (S0 long, from the joint J at
    `at(0)` out to the tip at `at(S0)`). `hits(pts, h, T, most, cells)` counts the points of a curl traced in steps `h`
    long and winding `T` round that come too near those (`cells`: the grid by default, or `loose`, which keeps it off
    only the ink of a dot) or near its own earlier turns, up to `most`. */
function curlCrowd(cmds: Cmd[], which: 's' | 'e', S0: number, at: (s: number) => Pt, m: Metrics, crowd: () => CrowdPt[]) {
  // how near the curl may come to a point: `most`, or as near as the end as drawn already comes
  // (across a narrow opening, say), but no nearer
  const nOwn = Math.ceil(S0 / m.s * 5), own = Array.from({ length: nOwn + 1 }, (_, k) => at(S0 * k / nOwn));
  const room = (q: Pt, most: number) => Math.min(most, Math.min(...own.map(p => Math.hypot(p.x - q.x, p.y - q.y))));
  // Two points along the stroke touch if they are nearer than `gap` but further apart along it
  // than any bend can bring them
  const clear = m.s * CURL_CLEAR, gap = m.s * CURL_GAP, apart = Math.PI * gap;
  // the rest of the letter on a grid, each point with how near the curl may come, and for the
  // rest of this stroke how far back from J it lies along it
  const key = (x: number, y: number) => Math.floor(x / clear) * 65536 + Math.floor(y / clear);
  // `loose` is the same but for dots, which it only keeps the curl off the ink of (see `mine` in shapeEnd)
  type Cell = { x: number; y: number; r: number; back: number };
  const grid = new Map<number, Cell[]>(), loose = new Map<number, Cell[]>();
  const add = (to: Map<number, Cell[]>, q: Pt, r: number, back: number) => {
    const k = key(q.x, q.y), g = { x: q.x, y: q.y, r, back };
    to.get(k)?.push(g) ?? to.set(k, [g]);
  };
  const put = (q: Pt, r: number, back: number) => {
    if (r < m.s * 0.5) return;
    add(grid, q, r, back); add(loose, q, r, back);
  };
  for (const q of crowd()) {
    if (!q.dot) { put(q, room(q, clear), Infinity); continue; }
    if (q.corner) { const r = room(q, clear); if (r >= m.s * 0.5) add(grid, q, r, Infinity); }
    // (all of a dot's outline and its middle, kept off by as much as keeps the curl off its ink, and no
    // more than the end as drawn keeps off them)
    add(loose, q, Math.min(m.s * 0.55, room(q, Infinity) * 0.95), Infinity);
  }
  const line = centerPoints(cmds, m, m.s * 0.5);
  if (which === 's') line.reverse();
  let along = 0;
  const arcs = line.map((q, k) => along += k ? Math.hypot(q.x - line[k - 1].x, q.y - line[k - 1].y) : 0), upTo = along - S0;
  line.forEach((q, k) => { if (arcs[k] < upTo) put(q, room(q, gap), upTo - arcs[k]); });
  const hits = (pts: Pt[], h: number, T: number, most = Infinity, cells = grid) => {
    let n = 0;
    // less than about a turn, a curl can't come back on itself
    const wound = T > 1.6 * Math.PI;
    for (let k = 2; k < pts.length && n < most; k += 2) {
      const p = pts[k];
      let hit = false;
      for (let j = 0; wound && !hit && (k - j) * h > apart; j += 2) hit = Math.hypot(p.x - pts[j].x, p.y - pts[j].y) < gap;
      near: for (const dx of [-clear, 0, clear]) for (const dy of [-clear, 0, clear]) {
        if (hit) break near;
        for (const q of cells.get(key(p.x + dx, p.y + dy)) ?? []) if (k * h + q.back > apart && Math.hypot(p.x - q.x, p.y - q.y) < q.r) { hit = true; break near; }
      }
      if (hit) n++;
    }
    return n;
  };
  return { hits, loose };
}

/** Move the start ('s') or end ('e') of an open centerline by `d` (negative trims, as stretchEnd does) and curl it
    by `curl` (0.5 leaves it as drawn; see Curling an end above), keeping it clear of crowd() (the letter's other
    centerlines and dots). A straight end curls toward `mid` above 0.5 and away from it below. `mine` when the curl
    is set for this end alone. Returns the new commands, where the end was and now is, and how far the curl swings
    out left and right, or null if it can't. */
function shapeEnd(cmds: Cmd[], which: 's' | 'e', d: number, curl: number, m: Metrics, mid: Pt, crowd: () => CrowdPt[], mine: boolean): EndMove | null {
  if (Math.abs(curl - 0.5) < 0.005) return stretchEnd(cmds, which, d, m);
  const e = endCmd(cmds, which, m);
  if (!e) return null;
  const { i, c, P, oi, o, u0, u1 } = e, { arc, uAt } = arcTable(P), a = arc(u0), b = arc(u1), len = b - a;
  if (len < 1) return null;
  // the stretch redrawn (more of it when a trim cuts deeper), and how long it becomes
  const S0 = Math.min(len * 0.98, Math.max(m.xh * CURL_REACH, 1 - d * 1.5)), Sn = S0 + Math.max(d, -len * 0.6);
  // s runs from the joint J, where the redrawn stretch leaves the stroke, out to the tip
  const at = (s: number) => {
    const t = cubicAt(P, uAt(which === 'e' ? b - S0 + s : a + S0 - s));
    return which === 'e' ? t : { ...t, tx: -t.tx, ty: -t.ty };
  };
  const N = 48, ang: number[] = [];
  for (let k = 0; k <= N; k++) {
    const t = at(S0 * k / N), v = Math.atan2(t.ty, t.tx);
    ang.push(k ? v + Math.round((ang[k - 1] - v) / (2 * Math.PI)) * 2 * Math.PI : v);
  }
  const drawn = (s: number) => { const f = clamp(s / S0) * N, k = Math.min(N - 1, Math.floor(f)); return lerp(ang[k], ang[k + 1], f - k); };
  const J = at(0), tip = at(S0), turned = ang[N] - ang[0], curved = Math.abs(turned) > 0.05;
  const way = Math.sign(curved ? turned : tip.tx * (mid.y - tip.y) - tip.ty * (mid.x - tip.x)) || 1;
  const k2 = (curl - 0.5) * 2, straighten = k2 < 0 && curved ? Math.min(1, -k2 / CURL_UNBEND) : 0;
  const amount = k2 >= 0 ? k2 : curved ? Math.max(0, (-k2 - CURL_UNBEND) / (1 - CURL_UNBEND)) : -k2;
  // the extra turn grows with the square of the distance into the curl, so its curvature is
  // tightest at the tip: 2 * turn / length there. Wound many times round it becomes an
  // Archimedean spiral, each turn `spread` further out per radian, as long as `spiral` of a turn
  const want = (CURL_TURNS * amount + (CURL_MOST - CURL_TURNS) * amount ** 4) * 2 * Math.PI;
  // (its tip rounder as it winds from once to twice round, so the last turn stays centered)
  const tight = lerp(CURL_TIGHT, CURL_ROUND, clamp(want / (2 * Math.PI) - 1));
  const rTip = Math.max(m.s * tight, m.xh * 0.08), spread = m.s * CURL_GAP * 1.15 / (2 * Math.PI);
  const spiral = (t: number) => Math.min(Math.max(2 * t * rTip, SPIRAL_SLACK * (rTip * t + spread * t * t / 2)), m.xh * CURL_LONGEST);
  // as many turns as fit within CURL_WIDEST (once round at least); the curl takes the stretch
  // redrawn, or as long as those need, and any length past that comes first
  const most = Math.min(want, Math.max(2 * Math.PI, (m.xh * CURL_WIDEST - rTip) / spread)), Ls = spiral(most);
  const Lc = Math.min(Math.max(Sn, Ls), Math.max(S0, Ls));
  // as many turns as that length holds
  const fits = (Math.sqrt(rTip * rTip + 2 * spread * Lc / SPIRAL_SLACK) - rTip) / spread;
  const turn0 = (k2 >= 0 ? way : -way) * Math.min(most, Math.max(fits, Lc / (2 * rTip)));
  const M = 256;
  // the curl winding `f` as far round, as long as that needs, keeping `g` of the length drawn on
  // before it, and starting `lead` further on. With f at 0 the end keeps its own shape, and
  // `g` of the length drawn on
  const draw = (lead: number, f: number, g: number) => {
    const T = Math.abs(turn0) * f, Lq = f ? Math.max(spiral(T), Lc * f * f) : lerp(Math.min(S0, Sn), Sn, g), L0 = Math.max(0, Sn - Lq) * g + lead;
    // the extra turn along the curl, as s², except that with `left` still to wind it turns no
    // tighter than round rTip + spread * left, an Archimedean spiral that keeps its turns apart.
    // Wound twice round or more, it comes round to its outer turn within half as far again as
    // that turn is wide, rather than sweeping out a long way first
    const quick = clamp(T / (2 * Math.PI) - 1) / (1.5 * (rTip + spread * T) ** 2);
    const dh = Lq / M, turns = [0], ramp = Math.max(2 * T / (Lq * Lq), quick);
    for (let k = 0, v = 0; T ? v < T && k < 3 * M : k < M; k++) {
      v = Math.min(T, v + dh * Math.min(ramp * (k + 0.5) * dh, 1 / (rTip + spread * (T - v))));
      turns.push(v);
    }
    const extra = (s: number) => {
      const t = Math.max(0, s - L0) / dh, k = Math.min(turns.length - 2, Math.floor(t));
      return k < 0 ? 0 : t >= turns.length - 1 ? turns[turns.length - 1] : lerp(turns[k], turns[k + 1], t - k);
    };
    // traced in steps of about a third of the stroke width
    const total = L0 + (turns.length - 1) * dh, n = Math.round(clamp(total / (m.s * 0.3), 48, 320)), sign = Math.sign(turn0), h = total / n;
    const angle = (s: number) => lerp(drawn(s), ang[0], straighten) + sign * extra(s);
    const pts: Pt[] = [{ x: J.x, y: J.y }];
    for (let k = 1; k <= n; k++) { const t = angle(h * (k - 0.5)), p = pts[k - 1]; pts.push({ x: p.x + Math.cos(t) * h, y: p.y + Math.sin(t) * h }); }
    return { angle, pts, h, T, n };
  };
  const { hits, loose } = curlCrowd(cmds, which, S0, at, m, crowd);
  let best = draw(0, 1, 1), fewest = hits(best.pts, best.h, best.T);
  for (const [x, f, g] of CURL_TRIES) {
    if (!fewest) break;
    const r = draw(x * m.xh, f, g), n = hits(r.pts, r.h, r.T, fewest);
    if (n < fewest) { best = r; fewest = n; }
  }
  // an end curled on its own (`mine`) and left not wound at all only keeps off a dot's ink (the dot of an i
  // sits too close to its stem for more), and takes the most it can that comes no nearer than the end as
  // drawn already does (the top of the stem of an @ runs along its bowl from the start); failing that it
  // curls less, as far as fits, so its control never springs back straight as it is turned up
  if (mine && amount > 0 && best.T === 0) {
    const home = draw(0, 0, 1), base = hits(home.pts, home.h, home.T, Infinity, loose);
    for (const [x, f, g] of [[0, 1, 1], ...CURL_TRIES]) {
      if (!f) continue;
      const r = draw(x * m.xh, f, g);
      if (hits(r.pts, r.h, r.T, base + 1, loose) <= base) { best = r; break; }
    }
    if (best.T === 0 && Math.abs(curl - 0.5) > 0.04) return shapeEnd(cmds, which, d, 0.5 + (curl - 0.5) * 0.8, m, mid, crowd, true);
  }
  const { angle, pts, h, n: steps } = best;
  const pieces = toBeziers(angle, pts, h, steps);
  const xs = pts.map(p => p.x), span = { x0: Math.min(...xs), x1: Math.max(...xs) };
  const uJ = uAt(which === 'e' ? b - S0 : a + S0), w = o.w != null ? { w: o.w, even: true } : {}, to = pts[steps], out = cmds.slice();
  if (which === 'e') {
    const keep: Cmd = e.line ? ['L', J.x, J.y, ...c.slice(3)] : [c[0], ...c.slice(1, oi), { ...o, u1: uJ }];
    out.splice(i, 1, keep, ...pieces.map(q => ['C', q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y, w] as Cmd));
    return { cmds: out, from: cubicAt(P, u1), to, span };
  }
  // at the start the stroke now begins at the new tip, so what's left of the first command is
  // written out as a plain curve from J
  const Q = subCubic(P, uJ, u1), rest = { ...o };
  delete rest.u0; delete rest.u1;
  const keep: Cmd = e.line ? c : ['C', Q[1].x, Q[1].y, Q[2].x, Q[2].y, Q[3].x, Q[3].y, rest];
  out.splice(0, 2, ['M', to.x, to.y], ...pieces.reverse().map(q => ['C', q[2].x, q[2].y, q[1].x, q[1].y, q[0].x, q[0].y, w] as Cmd), keep);
  return { cmds: out, from: cubicAt(P, u0), to, span };
}

/** A traced curl back to béziers, an eighth of a turn at most each: `pts` are its `steps` steps, each `h` long,
    and `angle(s)` its heading at length s along it. */
function toBeziers(angle: (s: number) => number, pts: Pt[], h: number, steps: number): Pt[][] {
  const pieces: Pt[][] = [];
  for (let i0 = 0, k = 1; k <= steps; k++) {
    if (k < steps && Math.abs(angle(h * k) - angle(h * i0)) < Math.PI / 4) continue;
    const A = pts[i0], B = pts[k], ta = angle(h * i0), tb = angle(h * k), L = h * (k - i0), dt = Math.abs(tb - ta);
    const hl = dt < 1e-4 ? L / 3 : (4 / 3) * Math.tan(dt / 4) * L / dt;
    pieces.push([A, { x: A.x + Math.cos(ta) * hl, y: A.y + Math.sin(ta) * hl }, { x: B.x - Math.cos(tb) * hl, y: B.y - Math.sin(tb) * hl }, B]);
    i0 = k;
  }
  return pieces;
}

/** Turn a curved end (the partly drawn quarter turn at the start 's' or end 'e' of an open
    centerline) onto a level or plumb line: back to where the quarter last ran that way, then
    straight out as far as the tip reached along that line. The tip of a hook or tail (`hook`)
    instead takes whichever line is nearer along the curve, so one nearly turned round finishes
    the turn rather than losing its hook; the mouth of a c or s never closes up that way. Null when
    the end isn't a partly drawn quarter turn. */
function runStraight(cmds: Cmd[], which: 's' | 'e', hook: boolean, m: Metrics): EndMove | null {
  const e = endCmd(cmds, which, m);
  if (!e || (e.c[0] !== 'hv' && e.c[0] !== 'vh')) return null;
  const { i, c, P, o, u0, u1 } = e, start = which === 's';
  // only one end of the quarter cut short, at the stroke's own end
  if (start ? u0 < 0.01 || u1 < 1 : u1 > 0.99 || u0 > 0) return null;
  const tip = cubicAt(P, start ? u0 : u1), from = { x: tip.x, y: tip.y }, out = cmds.slice(), rest = { ...o };
  delete rest.u0; delete rest.u1;
  // on round to the end of the quarter, which already runs level or plumb
  if (hook && (start ? u0 < 0.5 : u1 > 0.5)) {
    out[i] = [c[0], c[1], c[2], rest];
    const to = start ? P[0] : P[3];
    if (start) out[0] = ['M', to.x, to.y];
    return { cmds: out, from, to };
  }
  // back to the other end of it, and straight out from there
  const B = start ? P[3] : P[0], d = start ? { x: P[2].x - P[3].x, y: P[2].y - P[3].y } : { x: P[1].x - P[0].x, y: P[1].y - P[0].y };
  const l = Math.hypot(d.x, d.y) || 1, ux = d.x / l, uy = d.y / l, reach = (tip.x - B.x) * ux + (tip.y - B.y) * uy;
  if (reach < 1) return null;
  const to = { x: B.x + ux * reach, y: B.y + uy * reach }, w = o.w != null ? { w: o.w } : {};
  if (start) out.splice(0, 2, ['M', to.x, to.y], ['L', B.x, B.y, w]);
  else out[i] = ['L', to.x, to.y, w];
  return { cmds: out, from, to };
}

/** Stretch or trim every styled terminal of a glyph (body width W) by the stroke end length, or
    by the length set for that one end, and curl the ends given a curl of their own. Ends with a
    serif keep theirs. Tails, hooks and cursive strokes are left to their own controls, so their
    tips move only by a length set for that one end, measured from where their own control puts
    them (0.5).
    Plain ends (the free ends of stems, legs and bars that aren't styled terminals, and not buried
    in another stroke) and ends with a serif move only by a length or curl of their own, from where
    they are drawn: the serif goes with the end, or goes when it curls. A curled plain end is cut
    straight across instead of level or plumb, and its stroke's clip gives way.
    Notes the ids of those tips in `hooks` and of plain ends in `plains`, where each end sat before
    its own length and curl in `homes`, and returns how far the ends now reach past the body on the
    left and right, to widen it by. */
export function stretchTerminals(b: Builder, m: Metrics, W: number, hooks: Set<string>, plains: Set<string>, homes: Map<string, Pt>, capital: boolean) {
  const grow = { l: 0, r: 0 };
  // every stroke's centerline as drawn, to tell a free end from one buried in another stroke
  const drawn = b.strokes.map(t => t.cmds ? centerPoints(t.cmds, m, m.s * 0.25) : null);
  const buried = (si: number, q: Pt) => b.strokes.some((t, ti) => {
    if (ti === si) return false;
    if (t.poly) {
      const xs = t.poly.map(p => p.x), ys = t.poly.map(p => p.y);
      return q.x >= Math.min(...xs) - 1 && q.x <= Math.max(...xs) + 1 && q.y >= Math.min(...ys) - 1 && q.y <= Math.max(...ys) + 1;
    }
    const pts = drawn[ti]!, sc = t.o.scale || 1;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], c = pts[k + 1], dx = c.x - a.x, dy = c.y - a.y, l2 = dx * dx + dy * dy;
      if (l2 < 1e-9) continue;
      const u = clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / l2), half = (t.o.w === 'thin' ? m.thin : m.tDir(dx, dy)) * sc * strokeWt(m, ti) / 2;
      if (Math.hypot(q.x - a.x - dx * u, q.y - a.y - dy * u) <= half + 1) return true;
    }
    return false;
  });
  let mid: Pt | null = null;
  const middle = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const st of b.strokes) for (const c of st.cmds ?? []) if (typeof c[1] === 'number') { x0 = Math.min(x0, c[1]); x1 = Math.max(x1, c[1]); y0 = Math.min(y0, c[2]); y1 = Math.max(y1, c[2]); }
    return x0 <= x1 ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : { x: W / 2, y: m.xh / 2 };
  };
  const tipAt = (p: Pt) => b.marks.find(k => (k.type === 'tail' || k.type === 'exit') && Math.hypot(k.x - p.x, k.y - p.y) < 1);
  const swash = capital && m.p.swash > 0 ? swashEnd(b, m, W) : null;
  b.strokes.forEach((st, si) => {
    if (!st.cmds) return;
    const o = st.o, own = o.part === 'tail' || o.part === 'entry';
    for (const which of ['s', 'e'] as const) {
      const serif = m.serif && !o.scale && !!(which === 's' ? o.serifS : o.serifE), type = (which === 's' ? o.s : o.e) || 'flat';
      if (type === 'join') continue;
      if (type === 'term' && m.p.terminalRun === 'straight') {
        const at0 = endAt(st.cmds, which, m), tip = at0 && tipAt(at0), r = runStraight(st.cmds, which, !!tip, m);
        if (r) {
          st.cmds = r.cmds;
          if (tip) { tip.x = r.to.x; tip.y = r.to.y; }
          // a hook that finishes its turn can reach past the body
          grow.l = Math.max(grow.l, Math.min(0, r.from.x) - r.to.x);
          grow.r = Math.max(grow.r, r.to.x - Math.max(W, r.from.x));
        }
      }
      const plain = type !== 'term', at = endAt(st.cmds, which, m), sw = swash?.si === si && swash.which === which ? swash : null;
      // (a swash runs on out of the stroke it is buried in, as a P's stem out of the top of its bowl)
      if (plain && (!at || (!sw && buried(si, at)))) continue;
      const id = `${plain ? 'p' : ''}${si}${which}`, tip = !plain && at && tipAt(at);
      // an end with a serif is drawn plain, whatever its kind
      if (plain || serif) plains.add(id);
      if (!plain && (own || tip || serif)) hooks.add(id);
      if (at) homes.set(id, at);
      // a swash end draws on and curls out, unless the letter sets it its own way
      const d = endReach(sw && m.p.terminalEnds?.[id] == null ? sw.len : endLength(m.p, id, plain || serif || own || !!tip)) * m.xh * (o.scale || 1);
      // where letters join up (the start of an entry stroke, the tip of an exit), the stroke end curl
      // would wind a knot into the join: only a curl set for that one end turns it
      const join = o.part === 'entry' || (at && b.marks.some(k => k.type === 'exit' && Math.hypot(k.x - at.x, k.y - at.y) < 1));
      // and an end with a serif keeps it, level or plumb, as a crossbar's end runs level: only a curl set for that one
      // end bends it (and lets a serif go)
      const curl = sw && m.p.terminalCurls?.[id] == null ? sw.curl : join || serif || o.part === 'crossbar' ? m.p.terminalCurls?.[id] ?? 0.5 : endCurl(m.p, id);
      if (Math.abs(d) < 0.01 && curl === 0.5) continue;
      const before = st.cmds, r = shapeEnd(st.cmds, which, d, curl, m, sw && curl === sw.curl ? sw.mid : (mid ??= middle()),
        () => b.strokes.flatMap((t, ti) => ti === si ? [] : t.cmds ? centerPoints(t.cmds, m, m.s * 0.5) : t.poly ? dotPoints(t.poly, m.s * 0.25) : []),
        m.p.terminalCurls?.[id] != null);
      if (!r) continue;
      st.cmds = r.cmds;
      if (plain && type !== 'flat' && curl !== 0.5) st.o = { ...st.o, [which]: 'flat' };
      // and finishes as a stroke end does, in a ball where they have one
      if (sw) st.o = { ...st.o, [which]: 'term' };
      // a serif sits level or plumb, which a curled end no longer runs, so it lets it go
      if (serif && curl !== 0.5) st.o = { ...st.o, [which === 's' ? 'serifS' : 'serifE']: null };
      if (plain && st.o.clip) st.o = { ...st.o, clip: widenClip(st.o.clip, r.from, before, r.cmds, m) };
      if (tip) { tip.x = r.to.x; tip.y = r.to.y; }
      // a curl can swing out further than its tip ends up. A Q's tail runs on under the next letter
      // instead, as in type, so it leaves no gap after the Q
      grow.l = Math.max(grow.l, Math.min(0, r.from.x) - (r.span?.x0 ?? r.to.x));
      if (o.part !== 'tail') grow.r = Math.max(grow.r, (r.span?.x1 ?? r.to.x) - Math.max(W, r.from.x));
    }
  });
  return grow;
}

/** The end a swash capital curls out (see Params.swash): its first free end at the top left, as the
    top of a P's stem or the left end of a T's bar, or else at the bottom left, as the foot of an A;
    none on the right half (a C, an S). With how far it draws on, how far it curls, and the point it
    curls toward. */
function swashEnd(b: Builder, m: Metrics, W: number) {
  const ends: { si: number; which: 's' | 'e'; x: number; y: number; ox: number; oy: number; level: boolean }[] = [];
  b.strokes.forEach((st, si) => {
    if (!st.cmds || st.o.part === 'entry') return;
    for (const which of ['s', 'e'] as const) {
      if ((which === 's' ? st.o.s : st.o.e) === 'join') continue;
      const e = endCmd(st.cmds, which, m);
      if (!e) continue;
      const q = cubicAt(e.P, which === 's' ? e.u0 : e.u1), sg = which === 's' ? -1 : 1;
      if (q.x <= W * 0.5 + 1) ends.push({ si, which, x: q.x, y: q.y, ox: q.tx * sg, oy: q.ty * sg, level: Math.abs(q.ty) < 0.5 });
    }
  });
  const pick = (f: (e: typeof ends[number]) => boolean) => ends.filter(f).sort((a, c) => a.x - c.x)[0];
  const end = pick(e => e.y >= m.cap * 0.85) ?? pick(e => e.y <= m.cap * 0.15);
  if (!end) return null;
  // it curls round toward a point beside it, so it always winds the same way: counterclockwise from
  // the top or a level end (out and down), clockwise from the foot (out and up)
  const k = m.p.swash, ccw = end.level || end.y > m.cap / 2 ? 1 : -1, far = m.cap * 10;
  return { ...end, len: 0.5 + 0.25 * k, curl: 0.5 + 0.3 * k, mid: { x: end.x - end.oy * ccw * far, y: end.y + end.ox * ccw * far } };
}

/** A stroke's clip, given way where the end that sat at `from` now reaches past it: each side of
    the box that end sat at moves out as far as the stroke now reaches further, and a little more. */
function widenClip(clip: ClipBox, from: Pt, before: Cmd[], after: Cmd[], m: Metrics): ClipBox {
  const a = centerPoints(before, m, m.s * 0.5), b = centerPoints(after, m, m.s * 0.5), out = { ...clip }, near = m.s * 1.5;
  const most = (pts: Pt[], k: 'x' | 'y', s: 1 | -1) => Math.max(...pts.map(p => p[k] * s));
  const side = (key: 'x0' | 'x1' | 'y0' | 'y1', k: 'x' | 'y', s: 1 | -1) => {
    const v = out[key], past = most(b, k, s) - most(a, k, s);
    if (v != null && Math.abs(from[k] - v) < near && past > 0.5) out[key] = v + s * (past + m.s * 0.6);
  };
  side('x0', 'x', -1); side('x1', 'x', 1); side('y0', 'y', -1); side('y1', 'y', 1);
  return out;
}
