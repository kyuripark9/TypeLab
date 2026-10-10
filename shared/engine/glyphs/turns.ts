/* Turns: one stroke changing direction at a point (A M N V W Y Z, v w y z ^, and the turns of Q and R).
   A turn rounds as Bends and the letter's own corners say, and a turn that has to reach a line (the apex of
   an A at the cap height, the foot of a V on the baseline) moves until the outer edge of its outline, drawn
   and rounded as the glyph will be, meets that line. */
import { ownTurn, type Builder, type Metrics } from '../font';
import { clamp, cubicAt, lerp, roundContour } from '../geom';
import { expandStroke } from '../stroke';
import type { ClipBox, Cmd, Pt, StrokeOpts, TurnR } from '../types';

/** A point, [x, y]. */
export type XY = [number, number];
/** A turn of a stroke that reaches a line: the outer edge of the turn at point `i` touches `at`
    on axis `ax` (0 = x, 1 = y), which lies beyond it in direction `dir` (+1 = up or right).
    An `inner` turn (the middle peak of a W) reaches its line with its centerline instead, and
    isn't cut off or marked there. */
export interface Reach { i: number; ax: 0 | 1; at: number; dir: 1 | -1; inner?: boolean }

/** Whether Bends rounds the turns. */
export const roundBends = (m: Metrics) => m.p.bends === 'round';
/** Radius of a round bend's centerline: wide with flat peaks, and with pointed ones half the stroke
    weight, so the bend rounds on the outside and comes to a sharp corner on the inside. */
const bendR = (m: Metrics) => m.s * lerp(0.5, 1.6, m.apex);

/** The outline radii of a round bend: its centerline turns round bendR, so the outside rounds half
    a stroke wider and the inside half a stroke tighter. */
export const bendTurn = (m: Metrics): TurnR => { const r = bendR(m); return { o: r + m.s / 2, i: r - m.s / 2 }; };

/** The radii of the turns between the ends of `pts`, drawn as stroke `si` of the glyph: each turn's
    own roundness when its letter sets one (see markTurns in corners.ts), else a round bend's with round bends,
    else none, a sharp mitred corner. */
function turnsFor(m: Metrics, pts: XY[], si: number): (TurnR | null)[] {
  return pts.slice(1, -1).map((_, k) => {
    const drawn = roundBends(m) ? bendTurn(m) : null;
    return ownTurn(m, `${si}t${k}`, m.s, drawn) ?? drawn;
  });
}
/** Whether its letter rounds any turn of `pts`, drawn as stroke `si`, one by one. */
export const ownTurns = (m: Metrics, n: number, si: number) => Array.from({ length: n - 2 }, (_, k) => ownTurn(m, `${si}t${k}`, m.s, null) != null).some(Boolean);

/** A turn fitted to a line rounds along at most half of each leg: rounding further as its point
    moves out to the line lengthens the legs, it would never get there. */
const FIT_ROOM = 0.5;

/** How far the outline of the stroke through `pts`, turning with radii `turns`, reaches on axis
    `ax` (in direction `dir`) at its turn at pts[i], drawn and rounded as the glyph will be: over the
    part of the outline nearer that turn than any other point of the stroke. */
function outlineExtent(m: Metrics, pts: XY[], turns: (TurnR | null)[], i: number, ax: 0 | 1, dir: number) {
  const cmds: Cmd[] = [['M', ...pts[0]], ...pts.slice(1).map((q, k): Cmd => ['L', q[0], q[1], k && turns[k - 1] ? { turn: turns[k - 1] } : {}])];
  const ex = expandStroke(cmds, { miter: 18, endRoom: FIT_ROOM }, m.ctx), V = { x: pts[i][0], y: pts[i][1] };
  const mine = (q: Pt) => pts.every((o, j) => j === i || Math.hypot(q.x - o[0], q.y - o[1]) >= Math.hypot(q.x - V.x, q.y - V.y));
  let most = -Infinity, cur = V;
  for (const c of ex ? roundContour(ex.contours[0], 0) : []) {
    const P = c[0] === 'C' ? [cur, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }] : c[0] === 'Z' ? null : [{ x: c[1], y: c[2] }];
    if (!P) continue;
    for (let k = 0; k <= (P.length > 1 ? 8 : 0); k++) {
      const q = P.length > 1 ? cubicAt(P, k / 8) : P[0];
      if (mine(q)) most = Math.max(most, (ax ? q.y : q.x) * dir);
    }
    cur = P[P.length - 1];
  }
  return most * dir;
}

/** Where the outer point of the sharp, mitred turn at pts[i] reaches on axis `ax`. */
function turnExtent(m: Metrics, pts: XY[], i: number, ax: 0 | 1) {
  const V = pts[i], a = pts[i - 1], b = pts[i + 1];
  const la = Math.hypot(a[0] - V[0], a[1] - V[1]) || 1, lb = Math.hypot(b[0] - V[0], b[1] - V[1]) || 1;
  const u: XY = [(a[0] - V[0]) / la, (a[1] - V[1]) / la], v: XY = [(b[0] - V[0]) / lb, (b[1] - V[1]) / lb];
  const bx = u[0] + v[0], by = u[1] + v[1], bl = Math.hypot(bx, by) || 1, bis: XY = [bx / bl, by / bl];
  const half = Math.max(0.03, Math.acos(clamp(u[0] * v[0] + u[1] * v[1], -1, 1)) / 2), t = (m.tDir(u[0], u[1]) + m.tDir(v[0], v[1])) / 2;
  return V[ax] - bis[ax] * (t / 2) / Math.sin(half);
}

/** The turning points of `pts`, each one in `reach` moved along its axis until the outer edge of
    its turn meets its line (see turnStroke). `turns` are the turns' radii (see turnsFor); `ext` is
    how far past the line a sharp turn's point reaches, to be cut off there, by default as Peaks says. */
export function placeTurns(m: Metrics, pts: XY[], reach: Reach[], turns: (TurnR | null)[], ext = m.apex > 0.03 ? m.apex * 1.5 * m.s : m.os): XY[] {
  const p = pts.map(q => [q[0], q[1]] as XY), ro = (q: Reach) => turns[q.i - 1]?.o ?? 0;
  const at = (q: Reach) => q.inner ? p[q.i][q.ax] : ro(q) > 0 ? outlineExtent(m, p, turns, q.i, q.ax, q.dir) : turnExtent(m, p, q.i, q.ax);
  // a wide bend short of room on its legs moves less than its point does, so each step goes by how
  // far a small nudge of the point moves it
  for (let k = 0; k < 12; k++) {
    let off = 0;
    for (const q of reach) {
      // a turn rounded, or sharpened by its letter, comes just past the line like a bowl; one left
      // as Peaks draws it reaches `ext` past, to be cut off there
      const want = q.inner ? q.at : q.at + q.dir * (turns[q.i - 1] ? m.os : ext), now = at(q);
      if (!Number.isFinite(now) || Math.abs(want - now) < 0.1) continue;
      off = Math.max(off, Math.abs(want - now));
      p[q.i][q.ax] += 1;
      const rate = Math.max(0.2, at(q) - now);
      p[q.i][q.ax] += (want - now) / rate - 1;
    }
    if (!off) break;
  }
  return p;
}

/** One stroke through `pts`, turning at each point between its ends: in a round bend with round
    bends, else in a mitred corner, unless its letter rounds that turn its own way. Each turn in
    `reach` moves along its axis until its outer edge meets its line: a round one overshoots it like a
    bowl, a sharp one is pointed or cut flat there as Peaks says, like the apex of an A. Marks those
    turns and returns the points as placed. */
export function turnStroke(g: Builder, m: Metrics, pts: XY[], reach: Reach[], o: StrokeOpts = {}): XY[] {
  const turns = turnsFor(m, pts, g.strokes.length), p = placeTurns(m, pts, reach, turns);
  const clip: ClipBox = { ...o.clip };
  for (const q of reach) {
    if (q.inner) continue;
    const pos: XY = [p[q.i][0], p[q.i][1]];
    pos[q.ax] = q.at;
    if (q.ax === 1) g.mark(q.dir > 0 ? 'apex' : 'vertex', pos[0], pos[1]);
    if (!turns[q.i - 1]) clip[`${q.ax ? 'y' : 'x'}${q.dir > 0 ? 1 : 0}` as 'x0'] = q.at + q.dir * (m.apex > 0.03 ? 0 : m.os);
  }
  // each leg carries the radii of the turn it leaves; sharp, the strokes rising to the right are
  // the thin ones of the pair, as in a V
  const round = roundBends(m);
  g.path([['M', p[0][0], p[0][1]], ...p.slice(1).map((q, i): Cmd => {
    const turn = i ? turns[i - 1] : null, thin = !round && q[1] > p[i][1] && Math.abs(q[0] - p[i][0]) > 1;
    return ['L', q[0], q[1], { ...(thin && { w: 'thin' }), ...(turn && { turn }) }];
  })], { miter: 18, endRoom: FIT_ROOM, ...o, clip });
  return p;
}
