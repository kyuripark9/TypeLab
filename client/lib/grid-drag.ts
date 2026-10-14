/* A line or a circle of the construction grid (engine/grid.ts) dragged.

   A line: every point of the letter lying on it moves with it, its handles too, so the edges along it and the curves
   turning on it go along and the rest of the letter stays. A level line moves up and down, an upright one across; a
   diagonal moves across when steep and up and down when shallow, so its ends stay on the level (or upright) lines
   they stand on. A slanted letter's grid stands upright (`Lean`), so its upright lines move across and its level ones
   up and down the slant.

   A circle (a round): the stretches of curve it was read off (`GridRound.arcs`), found among the letter's points
   (`chainsOf`), are resized or moved with it. Resized, a stretch keeps to what it runs on into (`pivotOf`), by how
   its ends meet the rest of the outline, running on smoothly or at a corner: a whole contour (an o's bowl, a counter)
   grows about the round's middle; one whose ends both run on (a rounded corner between two edges, a shoulder, a
   quarter of a bowl) grows about the corner it rounds, so its ends slide along the edges and curves they lead into,
   or, turning back on itself (the bottom of a u, a round stroke end), only deepens or flattens; one with an end at a
   corner keeps that end where it is: a serif's bracket, ending at the serif's tip, climbs higher or lower up its stem,
   and one with both ends at corners (a c's bowl between its terminals, a b's on its stem) only bulges more or less.
   No end slides past the next point of what it runs on into (`mostScale`). Moved, a stretch moves whole, and what it
   runs on into stretches to it. Pure, tests/grid-drag.test.ts. */
import { hasIn, hasOut, sameLine, segment, type GlyphGrid, type GridArc, type GridLine, type GridRound, type Node } from '../../shared/engine';
import { moveAnchors, type Ref } from './pen';

type P = { x: number; y: number };
/** How a grid leans: by `slant` units across per unit up, about the level line y = `pivot` (GlyphGrid's). */
export type Lean = Pick<GlyphGrid, 'slant' | 'pivot'>;

/** How far off a line, in font units, a point still lies on it: the grid takes an edge a hair off level as level,
    at the height between its ends, and lines within 1.5 units of each other as one. */
export const ON_LINE = 3;

/** A point of the letter as its grid reads it, set upright. */
const upright = (q: P, lean: Lean): P => ({ x: q.x - lean.slant * (q.y - lean.pivot), y: q.y });

/** How far a point (upright) lies across a line, to its left looking along it. */
const across = (l: GridLine, q: P) => (q.y - l.y) * Math.cos(l.a) - (q.x - l.x) * Math.sin(l.a);

/** Which way a line moves: 'y' up and down for a level or shallow one, 'x' across for an upright or steep one. */
export const slideOf = (l: GridLine): 'x' | 'y' => (Math.abs(Math.sin(l.a)) >= Math.abs(Math.cos(l.a)) ? 'x' : 'y');

/** The anchor points of `cs` on line `l`. */
export function pointsOn(cs: Node[][], l: GridLine, lean: Lean, tol = ON_LINE): Ref[] {
  const out: Ref[] = [];
  cs.forEach((con, c) => con.forEach((n, i) => { if (Math.abs(across(l, upright(n, lean))) <= tol) out.push({ c, i }); }));
  return out;
}

/** How far along its way (slideOf) the line moves to stay under a pointer moved by (dx, dy) font units, as the
    letter stands (slanted). */
export function slideBy(l: GridLine, lean: Lean, dx: number, dy: number): number {
  const t = dy * Math.cos(l.a) - (dx - lean.slant * dy) * Math.sin(l.a);
  return slideOf(l) === 'x' ? -t / Math.sin(l.a) : t / Math.cos(l.a);
}

/** The letter with the points `refs` (on line `l`) moved `by` font units along the line's way. */
export function moveLine(cs: Node[][], refs: Ref[], l: GridLine, lean: Lean, by: number): Node[][] {
  if (!by) return cs;
  return slideOf(l) === 'x' ? moveAnchors(cs, refs, by, 0) : moveAnchors(cs, refs, lean.slant * by, by);
}

/** The line `l` in another letter's grid, at the same place, or null where it has none. */
export const lineIn = (l: GridLine, grid: GlyphGrid): GridLine | null => grid.lines.find(k => sameLine(l, k, true)) ?? null;

/** `at`, or the nearest of `targets` within `tol` of it. */
export function snapTo(at: number, targets: readonly number[], tol: number): number {
  let best = at, bd = tol;
  for (const t of targets) { const d = Math.abs(t - at); if (d <= bd) { best = t; bd = d; } }
  return best;
}

/* ---- rounds */

/** A run of a contour's segments lying on a round: from point `s`, `n` segments on (round past the contour's end), or
    the whole contour (`loop`). */
export interface Chain { c: number; s: number; n: number; loop: boolean }
/** What a chain is resized about: the point `at`, every way; or, with `fix` and `along` (unit directions), the line
    through `at` running `fix` stays, and everything else moves along `along`, as far as it lies off that line. */
export interface Pivot { at: P; fix?: P; along?: P }

/** A point as the letter stands, from the grid's upright reading of it. */
export const leaned = (q: P, lean: Lean): P => ({ x: q.x + lean.slant * (q.y - lean.pivot), y: q.y });

/** The points of a chain, in order (a loop's each once). */
export const chainPoints = (cs: Node[][], { c, s, n, loop }: Chain): Ref[] =>
  Array.from({ length: loop ? cs[c].length : n + 1 }, (_, k) => ({ c, i: (s + k) % cs[c].length }));

/** The chains of `cs` round `r` was read off: each of its arcs found by the points at its two ends (the shorter way
    round the contour between them), and arcs that run on one into the next made one chain. An arc whose ends aren't
    points of the letter (within `tol` units) is found instead by its curves lying on the round, all along, between the
    arc's ends (`onArc`): a leaning letter's outline, traced as it leans, has its points where it runs level or upright
    as it leans, not where the grid read it upright. */
export function chainsOf(cs: Node[][], r: GridRound, lean: Lean, tol = 2 * ON_LINE): Chain[] {
  // each contour's segments (segment i runs from point i to the next) that lie on the round
  const on = cs.map(con => con.map(() => false));
  const nearest = (con: Node[], q: P) => {
    let best = -1, bd = tol;
    con.forEach((n, i) => { const d = Math.hypot(n.x - q.x, n.y - q.y); if (d <= bd) { best = i; bd = d; } });
    return best;
  };
  for (const arc of r.arcs) {
    const a = leaned(arc.a, lean), b = leaned(arc.b, lean);
    let best: { c: number; s: number; n: number } | null = null;
    for (let c = 0; c < cs.length; c++) {
      const con = cs[c], i = nearest(con, a), j = nearest(con, b), L = con.length;
      if (i < 0 || j < 0 || i === j) continue;
      const fwd = (j - i + L) % L, back = (i - j + L) % L, run = fwd <= back ? { c, s: i, n: fwd } : { c, s: j, n: back };
      if (!best || run.n < best.n) best = run;
    }
    if (best) for (let k = 0; k < best.n; k++) on[best.c][(best.s + k) % cs[best.c].length] = true;
    else cs.forEach((con, c) => con.forEach((n, i) => { if (onArc(r, arc, n, con[(i + 1) % con.length], lean)) on[c][i] = true; }));
  }
  const out: Chain[] = [];
  on.forEach((segs, c) => {
    const L = segs.length;
    if (segs.every(Boolean)) { if (L) out.push({ c, s: 0, n: L, loop: true }); return; }
    for (let i = 0; i < L; i++) {
      // a chain starts where the segment before it is off the round
      if (!segs[i] || segs[(i + L - 1) % L]) continue;
      let n = 0;
      while (segs[(i + n) % L]) n++;
      out.push({ c, s: i, n, loop: false });
    }
  });
  return out;
}

/** How far round a round a point (upright) lies from its middle, as an angle on it, and how far out, as a share of
    its radius. */
const roundAt = (r: GridRound, q: P) => { const u = (q.x - r.cx) / r.rx, v = (q.y - r.cy) / r.ry; return { t: Math.atan2(v, u), d: Math.hypot(u, v) }; };
/** An angle brought within half a turn either way. */
const wrap = (t: number) => Math.atan2(Math.sin(t), Math.cos(t));
/** How near the round (a share of its radius) a curve lies all along to be taken as on it. */
const ON_ROUND = 0.08;

/** Whether the curve from point a to point b lies on round `r`, all along, between the ends of `arc` (the shorter way
    round from one to the other). */
function onArc(r: GridRound, arc: GridArc, a: Node, b: Node, lean: Lean): boolean {
  const B = segment(a, b);
  if (!B) return false;
  const at = [0.25, 0.5, 0.75].map(t => {
    const u = 1 - t, q = { x: u * u * u * B[0].x + 3 * u * u * t * B[1].x + 3 * u * t * t * B[2].x + t * t * t * B[3].x, y: u * u * u * B[0].y + 3 * u * u * t * B[1].y + 3 * u * t * t * B[2].y + t * t * t * B[3].y };
    return roundAt(r, upright(q, lean));
  });
  if (!at.every(q => Math.abs(q.d - 1) <= ON_ROUND)) return false;
  const from = roundAt(r, arc.a).t, span = wrap(roundAt(r, arc.b).t - from), off = wrap(at[1].t - from);
  return span >= 0 ? off >= 0 && off <= span : off <= 0 && off >= span;
}

/** The ways a segment runs along it, from its start to its end (a straight one's one way twice). */
function waysOf(a: Node, b: Node): P[] {
  const B = segment(a, b);
  if (!B) return [{ x: b.x - a.x, y: b.y - a.y }, { x: b.x - a.x, y: b.y - a.y }];
  return [0, 0.25, 0.5, 0.75, 1].map(t => {
    const u = 1 - t;
    return {
      x: 3 * (u * u * (B[1].x - B[0].x) + 2 * u * t * (B[2].x - B[1].x) + t * t * (B[3].x - B[2].x)),
      y: 3 * (u * u * (B[1].y - B[0].y) + 2 * u * t * (B[2].y - B[1].y) + t * t * (B[3].y - B[2].y))
    };
  }).map((d, k, all) => (Math.hypot(d.x, d.y) > 1e-6 ? d : k < 2 ? { x: B[2].x - B[0].x, y: B[2].y - B[0].y } : k > 2 ? { x: B[3].x - B[1].x, y: B[3].y - B[1].y } : all[k]));
}

const turnBetween = (u: P, v: P) => Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y);
const unit = (d: P): P => { const l = Math.hypot(d.x, d.y) || 1; return { x: d.x / l, y: d.y / l }; };
const dot = (u: P, v: P) => u.x * v.x + u.y * v.y;
/** How far a chain turns before it ends (more than this, and it is no corner's round). */
const CORNER_TURN = 150 * Math.PI / 180;
/** The ends of a U turn run this near opposite ways. */
const U_TURN = Math.cos(15 * Math.PI / 180);
/** A chain's end runs on smoothly into what follows where the two leave it this near the same way. */
const RUNS_ON = Math.cos(12 * Math.PI / 180);

/** What a chain is resized about (see the head of the file); `centre` is its round's middle, as the letter stands. */
export function pivotOf(cs: Node[][], ch: Chain, centre: P): Pivot {
  if (ch.loop) return { at: centre };
  const con = cs[ch.c], L = con.length, pt = (k: number) => con[((ch.s + k) % L + L) % L];
  const ways = Array.from({ length: ch.n }, (_, k) => waysOf(pt(k), pt(k + 1))).flat().filter(d => Math.hypot(d.x, d.y) > 1e-6);
  if (ways.length < 2) return { at: centre };
  let turn = 0;
  for (let k = 1; k < ways.length; k++) turn += turnBetween(ways[k - 1], ways[k]);
  const S = pt(0), E = pt(ch.n), d0 = unit(ways[0]), d1 = unit(ways[ways.length - 1]), chord = { x: E.x - S.x, y: E.y - S.y };
  // whether each end runs on smoothly into the segment before (or after) the chain
  const before = waysOf(pt(-1), S), after = waysOf(E, pt(ch.n + 1));
  const onS = dot(unit(before[before.length - 1]), d0) >= RUNS_ON, onE = dot(d1, unit(after[0])) >= RUNS_ON;
  // the ends stay, and it bulges more or less across the line through them
  const bulge = (): Pivot => {
    if (Math.hypot(chord.x, chord.y) < 1) return { at: centre };
    const c = unit(chord);
    return { at: { x: S.x, y: S.y }, fix: c, along: { x: -c.y, y: c.x } };
  };
  if (onS && onE) {
    // a U turn deepens or flattens
    if (dot(d0, d1) <= -U_TURN) return bulge();
    // a corner's round: about where the ways its ends lead in from and out to meet, ahead of both (S + t·d0 = E − u·d1)
    if (Math.abs(turn) < CORNER_TURN) {
      const det = d0.x * d1.y - d1.x * d0.y;
      if (Math.abs(det) > 1e-6) {
        const t = (chord.x * d1.y - d1.x * chord.y) / det, u = (d0.x * chord.y - chord.x * d0.y) / det;
        if (t > 0 && u > 0) return { at: { x: S.x + d0.x * t, y: S.y + d0.y * t } };
      }
    }
    // else about its middle brought onto the line through its ends, so they keep to that line
    const cl = Math.hypot(chord.x, chord.y);
    if (cl < 1) return { at: centre };
    const c = unit(chord), along = dot({ x: centre.x - S.x, y: centre.y - S.y }, c);
    return { at: { x: S.x + c.x * along, y: S.y + c.y * along } };
  }
  if (onS === onE) return bulge();
  // one end at a corner: the line it arrives (or leaves) along stays, and the other end slides along its own way
  const [stay, way, slide] = onE ? [S, d0, d1] : [E, d1, d0];
  if (Math.abs(way.x * slide.y - way.y * slide.x) < 0.2) return bulge();
  return { at: { x: stay.x, y: stay.y }, fix: way, along: slide };
}

/** The point `q` resized `k` times about the pivot. */
export function scaleAbout(q: P, p: Pivot, k: number): P {
  const dx = q.x - p.at.x, dy = q.y - p.at.y;
  if (!p.fix || !p.along) return { x: p.at.x + dx * k, y: p.at.y + dy * k };
  const b = offFix(p, dx, dy) * (k - 1);
  return { x: q.x + p.along.x * b, y: q.y + p.along.y * b };
}

/** How far (dx, dy) from a one-way pivot's point lies off its staying line, measured along `along`. */
function offFix(p: Pivot, dx: number, dy: number): number {
  const f = p.fix!, a = p.along!;
  return (f.x * dy - f.y * dx) / (f.x * a.y - f.y * a.x);
}

/** Which way, and how far per step of the scale, point `q` moves as its chain is resized about `p`. */
function moveOf(q: P, p: Pivot): P {
  const dx = q.x - p.at.x, dy = q.y - p.at.y;
  if (!p.fix || !p.along) return { x: dx, y: dy };
  const b = offFix(p, dx, dy);
  return { x: p.along.x * b, y: p.along.y * b };
}

/** The most times larger a chain can be drawn before an end of it, sliding on, reaches the next point of the edge or
    curve it runs on into (a bracket climbs no higher than its stem's straight edge goes): two units short of it, never
    less than as it is; without end where nothing stops it (a loop, ends that stay or slide toward the next point). */
export function mostScale(cs: Node[][], ch: Chain, p: Pivot): number {
  if (ch.loop) return Infinity;
  const con = cs[ch.c], L = con.length;
  let most = Infinity;
  for (const [end, next] of [[ch.s, (ch.s + L - 1) % L], [(ch.s + ch.n) % L, (ch.s + ch.n + 1) % L]]) {
    const E = con[end], N = con[next], w = moveOf(E, p), l2 = w.x * w.x + w.y * w.y;
    if (l2 < 1) continue;
    const t = ((N.x - E.x) * w.x + (N.y - E.y) * w.y) / l2;
    if (t > 0) most = Math.min(most, 1 + t - 2 / Math.sqrt(l2));
  }
  return Math.max(1, most);
}

/** How many times larger a chain is drawn for a press on its round's rim at `from` dragged to `to` (as the letter
    stands): the point pressed moves as the pointer does, along the way the resizing moves it, taken as at least `least`
    units off the pivot (so a press near it doesn't fling it), never below a twentieth. */
export function scaleFor(p: Pivot, from: P, to: P, least: number): number {
  const w = moveOf(from, p), l = Math.hypot(w.x, w.y), way = l > 1e-9 ? { x: w.x / l, y: w.y / l } : p.along ?? { x: 1, y: 0 };
  return Math.max(0.05, 1 + dot({ x: to.x - from.x, y: to.y - from.y }, way) / Math.max(l, least));
}

/** The letter with chains' points put through their maps (their handles too): a handle at a chain's end that leads
    off it moves as far as its point, so the edge or curve the chain runs on into keeps its way there. Each is read
    from `cs` as it was; where two chains share a point, the later one places it. */
export function mapChains(cs: Node[][], list: readonly { chain: Chain; f: (q: P) => P }[]): Node[][] {
  if (!list.length) return cs;
  const out = cs.map(con => con.slice());
  for (const { chain, f } of list) {
    const refs = chainPoints(cs, chain), last = refs.length - 1;
    refs.forEach(({ c, i }, k) => {
      const n = cs[c][i], to = f(n), dx = to.x - n.x, dy = to.y - n.y, m: Node = { ...n, x: Math.round(to.x), y: Math.round(to.y) };
      const inOn = chain.loop || k > 0, outOn = chain.loop || k < last;
      if (hasIn(n)) { const h = inOn ? f({ x: n.ix!, y: n.iy! }) : { x: n.ix! + dx, y: n.iy! + dy }; m.ix = Math.round(h.x); m.iy = Math.round(h.y); }
      if (hasOut(n)) { const h = outOn ? f({ x: n.ox!, y: n.oy! }) : { x: n.ox! + dx, y: n.oy! + dy }; m.ox = Math.round(h.x); m.oy = Math.round(h.y); }
      out[c][i] = m;
    });
  }
  return out;
}
