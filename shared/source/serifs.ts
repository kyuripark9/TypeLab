/* A serif style's own serifs, found on its filled ink so they can be taken off or reshaped. A serif is found from the
   stroke it belongs to: where a straight side of the stroke ends, the outline turns out away from the ink (through a
   bracket, if it has one), round the serif, and back across the line of that side onto the stroke's end, which runs
   on under the stroke. The part of the letter outside the side's line, between where the side ends and the stroke's
   end, is one half of the serif: feet on the baseline, serifs on top of stems and on their slanted heads, and the
   beaks on the ends of arms (E, F, L, T, Z) alike. Bars (T's, E's arms) reach too far past their stroke to count. */
import { ClipType, type Paths64 } from 'clipper2-ts';
import type { Pt } from '../engine/types';
import type { SerifSide } from '../params/options';
import { EndType } from '../vendor/clipper2-offset';
import { area, ball, clip, fromGrid, offset, toGrid, type Tree } from './ink';

/** How far past its stroke a serif may reach, as a share of the cap height and of the stroke's width; how far it may
    run along the stroke from where the side ends to the stroke's end, and how long a straight side must be, as
    shares of the cap height. */
export interface SerifFinding { reach: number; across: number; height: number; side: number }

/** The style's own serifs: how they are found; Length and Thickness at 0 and 100 as multiples of the serif's own, and
    Top serifs and Arm serifs as multiples of both; how far Angle 100 takes a serif's top down toward its tip, as a
    share of its height there; and Bracket at 0 and 100 as multiples of the bracket's own height. */
export interface SourceSerifsPolicy extends SerifFinding {
  format: 'source-serifs-v1'; length: readonly [number, number]; thick: readonly [number, number]; size: readonly [number, number];
  slope: number; bracket: readonly [number, number];
}
const KEYS = ['format', 'reach', 'across', 'height', 'side', 'length', 'thick', 'size', 'slope', 'bracket'];
const finite = (n: unknown, low: number, high: number): number => {
  if (typeof n !== 'number' || !(n >= low && n <= high)) throw new RangeError('Invalid source serif dimension');
  return n;
};
/** A range about the serif's own: below 1 at 0, above at 100. */
function about(input: unknown): [number, number] {
  if (!Array.isArray(input) || input.length !== 2) throw new RangeError('Invalid source serif interval');
  const range: [number, number] = [finite(input[0], 0, 1), finite(input[1], 1, 5)];
  if (!(range[0] < 1 && range[1] > 1)) throw new RangeError('Invalid source serif interval');
  return range;
}
export function parseSourceSerifs(input: unknown): SourceSerifsPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid source serif policy');
  const value = Object.fromEntries(Object.entries(input));
  if (value.format !== 'source-serifs-v1' || Object.keys(value).some(key => !KEYS.includes(key))) throw new TypeError('Invalid source serif policy');
  return { format: 'source-serifs-v1', reach: finite(value.reach, .01, 1), across: finite(value.across, .1, 20), height: finite(value.height, .01, 1),
    side: finite(value.side, .01, 1), length: about(value.length), thick: about(value.thick), size: about(value.size), slope: finite(value.slope, 0, .95),
    bracket: about(value.bracket) };
}
export const sourceSerifsExtend = (a: SourceSerifsPolicy, b: SourceSerifsPolicy): boolean =>
  KEYS.every(key => JSON.stringify(a[key as keyof SourceSerifsPolicy]) === JSON.stringify(b[key as keyof SourceSerifsPolicy]));
/** The serif controls this policy adds to those every source has. */
export const SERIF_CONTROLS = ['serifTops', 'serifArms', 'serifArmThickness', 'serifSides', 'serifBalance'] as const;

/** What becomes of the style's own serifs: taken off, or each half reached out and thickened by these multiples (a
    foot's, a top's and an arm's beak's alike, then a top's and a beak's again, then each side's by Balance), its top
    sloped toward the tip, its bracket raised; those on the sides Sides leaves off taken off. */
export interface SerifPlan {
  off: boolean; finding: SerifFinding; length: number; thick: number; slope: number; bracket: number;
  tops: number; arms: number; armThick: number; balance: number; sides: SerifSide;
}

/** One half of a serif: its outline (from where the stroke's side ends, round the serif, to where the stroke's end
    crosses the side's line), the side's end `s` and that crossing `f`, the way out from the stroke `out`, the way
    along the stroke to its end `t`, the stroke's end's way `e` across the stroke, how far the serif reaches past the
    side, the stroke's width, and whether it is a foot, a top or an arm's beak. */
export interface SerifHalf {
  poly: Pt[]; s: Pt; f: Pt; out: Pt; t: Pt; e: Pt; reach: number; width: number; kind: 'foot' | 'top' | 'arm';
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (v: Pt) => Math.hypot(v.x, v.y);
const unit = (v: Pt): Pt => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; };
// a side may bow a little along its length (a tapering leg), but bends at no one point
const STRAIGHT = .5 * Math.PI / 180, BENT = 8 * Math.PI / 180;

/** Every serif half on the ink's outlines (`polys`, outer outlines turning the way `sign` says). */
export function serifHalves(polys: Pt[][], cap: number, finding: SerifFinding, root: Tree, start: number): SerifHalf[] {
  const sign = area(polys.reduce((big, p) => Math.abs(area(p)) > Math.abs(area(big)) ? p : big)) > 0 ? 1 : -1;
  const out: SerifHalf[] = [];
  const most = finding.reach * cap, high = finding.height * cap, least = finding.side * cap, tiny = cap * 1e-3;
  for (const poly of polys) {
    const n = poly.length;
    if (n < 4) continue;
    const at = (i: number) => poly[((i % n) + n) % n];
    const dir = (i: number) => unit(sub(at(i + 1), at(i)));
    const turn = (i: number) => { const a = dir(i - 1), b = dir(i); return Math.atan2(a.x * b.y - a.y * b.x, dot(a, b)); };
    // the straight runs of the outline, from a vertex where it turns
    const first = Array.from({ length: n }, (_, i) => i).find(i => Math.abs(turn(i)) >= STRAIGHT);
    if (first === undefined) continue;
    const runs: [number, number][] = [];
    for (let i = first, done = 0; done < n;) {
      let j = i, bent = 0;
      while (done + (j - i) < n - 1 && Math.abs(turn(j + 1)) < STRAIGHT && Math.abs(bent + turn(j + 1)) < BENT) { bent += turn(j + 1); j++; }
      runs.push([i, j + 1]);
      done += j + 1 - i; i = j + 1;
    }
    for (const [i0, i1] of runs) {
      const way = sub(at(i1), at(i0));
      if (len(way) < least) continue;
      // the stroke's width at the middle of the side's longest edge, on the outline and clear of the serif
      let longest = i0;
      for (let i = i0; i < i1; i++) if (len(sub(at(i + 1), at(i))) > len(sub(at(longest + 1), at(longest)))) longest = i;
      const middle = { x: (at(longest).x + at(longest + 1).x) / 2, y: (at(longest).y + at(longest + 1).y) / 2 };
      const edge = unit(sub(at(longest + 1), at(longest))), width = 2 * (ball(root, middle, { x: -edge.y * sign, y: edge.x * sign }, start)?.r ?? 0);
      if (!(width > 0)) continue;
      /** the way the side runs toward its end `from`, over the last stretch before it */
      const near = (from: number, step: 1 | -1) => {
        let k = from;
        while (k !== (step > 0 ? i0 : i1) && len(sub(at(from), at(k))) < cap * .06) k -= step;
        return unit(sub(at(from), at(k)));
      };
      // each end of the side: walk on along the outline from it, away from the side
      for (const [from, step] of [[i1, 1], [i0, -1]] as const) {
        const t = near(from, step), ink = step > 0 ? { x: -t.y * sign, y: t.x * sign } : { x: t.y * sign, y: -t.x * sign };
        const s = at(from), away = { x: -ink.x, y: -ink.y }, path: Pt[] = [s];
        let prev = s, a0 = 0, walked = 0, half: SerifHalf | null = null;
        for (let k = 1; k < n; k++) {
          const p = at(from + step * k), a = dot(sub(p, s), away), b = dot(sub(p, s), t);
          walked += len(sub(p, prev));
          if (a0 > 0 && a <= 0) {
            // back across the side's line: the stroke's end, running on under the stroke
            const f = { x: prev.x + (p.x - prev.x) * a0 / (a0 - a), y: prev.y + (p.y - prev.y) * a0 / (a0 - a) };
            const e = unit(sub(p, prev)), along = dot(sub(f, s), t);
            if (along <= tiny || Math.abs(dot(e, t)) > .8) break;
            // straight on under the stroke for a good part of its width: a tail's end (t, j, f) curves round instead
            let on = len(sub(p, f)), q = p, ok = true;
            for (let m = k + 1; on < Math.max(cap * .015, width * .3) && m < k + n; m++) {
              const r = at(from + step * m);
              if (dot(unit(sub(r, q)), e) < Math.cos(12 * Math.PI / 180)) { ok = false; break; }
              on += len(sub(r, q)); q = r;
            }
            if (!ok) break;
            const reach = Math.max(...path.map(p => dot(sub(p, s), away)));
            if (reach < cap * .02 || reach > finding.across * width) break;
            // out to its tip a serif's top only falls toward the stroke's end; a hook's inside (t, j) dips and rises
            // again to its terminal
            const up = { x: -t.x, y: -t.y }, across = dot(e, away), slope = Math.abs(across) > 1e-6 ? dot(e, up) / across : 0;
            const height = (q: Pt) => dot(sub(q, f), up) - slope * dot(sub(q, f), away);
            const tip = path.findIndex(q => dot(sub(q, s), away) >= reach * .98);
            let low = Infinity, hooked = false;
            for (const q of path.slice(0, tip + 1)) { const h = height(q); low = Math.min(low, h); if (h > low + cap * .015) { hooked = true; break; } }
            if (hooked) break;
            const kind = Math.abs(t.y) >= .5 ? (t.y < 0 ? 'foot' : 'top') : 'arm';
            half = { poly: [...path, f], s, f, out: away, t, e: step > 0 ? e : { x: -e.x, y: -e.y }, reach, width, kind };
            break;
          }
          if (a < -tiny || a > most || b > high || b < -tiny * 5 || walked > (most + high) * 3) break;
          path.push(p); prev = p; a0 = a;
        }
        if (half) out.push(half);
      }
    }
  }
  return out;
}

/** The ink with the style's own serifs taken off or reshaped, and where each foot and top was. Null when it has none. */
export interface Reserifed { ink: Paths64; sites: SerifSite[] }
/** Where a foot or a top was: the stroke's end crossing its side, the way it reached, how far and how thick partway out. */
export interface SerifSite { f: Pt; out: Pt; reach: number; thick: number }
export function reshapeSerifs(ink: Paths64, polys: Pt[][], plan: SerifPlan, cap: number, root: Tree, start: number): Reserifed | null {
  const halves = serifHalves(polys, cap, plan.finding, root, start);
  if (!halves.length) return null;
  // how thick a serif is partway out, where a tapering one still has body
  const body = (h: SerifHalf) => Math.max(0, ...tipOf(h).points.filter(p => p.a >= h.reach * .4 && p.a <= h.reach * .7).map(p => p.h));
  const xs = polys.flat().map(p => p.x), middle = (Math.min(...xs) + Math.max(...xs)) / 2;
  const orient = (poly: Pt[]) => toGrid(area(poly) < 0 ? [...poly].reverse() : poly);
  const kept = halves.filter(h => !plan.off && (plan.sides === 'both' || plan.sides === 'left' && h.out.x < 0 || plan.sides === 'right' && h.out.x > 0
    || plan.sides === 'inside' && h.out.x * (middle - h.s.x) > 0 || plan.sides === 'outside' && h.out.x * (middle - h.s.x) <= 0));
  // each half taken off a little past its outline, into the space round it, but not past the stroke's side: the
  // stroke is cut cleanly along the side's line, with no hairline left along the outline
  const margin = cap * .001, far = cap * 4;
  const taken = halves.flatMap(h => {
    const grown = offset([orient(h.poly)], margin, margin / 4, EndType.Polygon, 'shapes'), { s, t, out } = h;
    const outside = [add(s, t, -far), add(s, t, far), add(add(s, t, far), out, far), add(add(s, t, -far), out, far)];
    return clip(ClipType.Intersection, grown, [orient(outside)], 'shapes');
  });
  const rest = clip(ClipType.Difference, ink, taken, 'shapes');
  const out = kept.length ? clip(ClipType.Union, rest, kept.map(h => orient(reshaped(h, plan, cap * .002))), 'shapes') : rest;
  // a speck left where a cut meets the outline, too small to see, goes, and so does a hairline spike where the outline
  // runs out and straight back along itself
  const speck = (cap * .004) ** 2;
  // the feet and tops another shape takes the place of (an arm's beak has no flat end to set one on)
  return { ink: out.map(path => toGrid(unspiked(fromGrid(path)))).filter(path => path.length > 2 && Math.abs(area(fromGrid(path))) >= speck),
    sites: halves.filter(h => h.kind !== 'arm').map(h => ({ f: h.f, out: h.out, reach: h.reach, thick: body(h) })) };
}

/** A half's points as how far out from the stroke's side and how high above its end each lies, the end's slope, and
    the tip's height: where the serif reaches furthest out, the bracket rising above it. */
function tipOf(half: SerifHalf): { points: { a: number; h: number }[]; slope: number; tip: number } {
  const { f, out, e } = half, up = { x: -half.t.x, y: -half.t.y };
  // the stroke's end rises `slope` for each unit out from the side, where it slants
  const across = dot(e, out), slope = Math.abs(across) > 1e-6 ? dot(e, up) / across : 0;
  const points = half.poly.map(p => { const a = dot(sub(p, f), out); return { a, h: dot(sub(p, f), up) - slope * a }; });
  return { points, slope, tip: Math.max(...points.filter(p => p.a >= half.reach * .98).map(p => p.h), 0) };
}

/** One half reshaped: each point's way out from the stroke's side and its height above the stroke's end scaled, the
    end kept where it is. It reaches `into` the stroke past the side's line, along the stroke's end and square to the
    side, so it joins the stroke along more than a line the clipping might round apart. */
function reshaped(half: SerifHalf, plan: SerifPlan, into: number): Pt[] {
  const { f, out } = half, up = { x: -half.t.x, y: -half.t.y }, { points, slope, tip } = tipOf(half);
  const side = half.out.x < 0 ? 1 - plan.balance : 1 + plan.balance;
  const kind = half.kind === 'top' ? plan.tops : half.kind === 'arm' ? plan.arms : 1;
  const long = plan.length * kind * Math.max(.1, side), thick = plan.thick * kind * (half.kind === 'arm' ? plan.armThick : 1);
  const placed = points.map(({ a, h }) => {
    // never flat to the tip's height: points laid along one line make the clipping loop
    const raised = h > tip ? tip + (h - tip) * Math.max(plan.bracket, .02) : h;
    const sloped = raised * thick * Math.max(.05, 1 - plan.slope * Math.max(0, a) / half.reach);
    const a2 = a * long;
    return { x: f.x + out.x * a2 + up.x * (sloped + slope * a2), y: f.y + out.y * a2 + up.y * (sloped + slope * a2) };
  });
  const s = placed[0], end = dot(half.e, out) < 0 ? half.e : { x: -half.e.x, y: -half.e.y };
  return [...placed, { x: f.x + end.x * into, y: f.y + end.y * into }, { x: s.x - out.x * into, y: s.y - out.y * into }];
}

/** An outline without the points where it turns straight back on itself. */
function unspiked(poly: Pt[]): Pt[] {
  const out = [...poly];
  for (let changed = true; changed && out.length > 2;) {
    changed = false;
    for (let i = 0; i < out.length && out.length > 2; i++) {
      const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const u = sub(b, a), v = sub(c, b), lu = len(u), lv = len(v);
      // a point on top of the one before, or where the way on is straight back the way it came
      if (lu < 1e-9 || lv > 0 && dot(u, v) / (lu * lv) < -.999) { out.splice(i, 1); changed = true; i--; }
    }
  }
  return out;
}
