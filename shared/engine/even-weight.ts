/* Weight, Verticals, Horizontals and Contrast on a free font's letters, its drawing kept: the outline pushed out
   (heavier) or in (lighter) evenly all round, as a pen run along it a little wider or narrower would draw it, sideways
   by one distance (its upright strokes) and up and down by another (its level ones), and the letter set back on its
   lines. Every stroke, join, round and corner of the font's own drawing moves alike, so nothing the drawing hasn't comes
   out of it; and each setting reaches only so far as it can that way (PEN: shares of the font's stem at either end of
   its slider), never further in than HAIR_KEEP of its thinnest strokes, so no hairline wears away. Out, an opening
   between two of its strokes (a terminal and the bar, spine or bowl it nears, an inline's channel) narrows no further
   than OPEN_KEEP of its width as drawn: the edges either side of it go out less, eased in along the outline (openings).
   A letter whose counter or opening would close all the same, or a stroke part, or two pieces run into one, is moved
   only as far as it can be without (found in halves).

   Read stroke by stroke and drawn again from its skeleton (skin.ts, before 2026-10-22), a letter reached every weight
   but broke on the way: joins notched, edges waved, hairlines thinned away, rounds came out heavier than its stems,
   bowls beaded and blotted at Verticals or Horizontals 0 and 100.

   The outline is read as polygons (curves cut every STEP units, straight edges every EDGE_STEP), each pushed sideways
   with its corners mitred (cut across past MITRE times the push, so a sharp tip doesn't throw a spike; an edge moved
   by the sideways push as far as it faces sideways, by the other as far as it faces up or down), and the pieces
   that fold back where they cross left out by reading it only where it winds anticlockwise on balance (shape(…, true) in
   boolean.ts). It grows (or shrinks) past its lines as it does sideways, so its heights are drawn back: a top onto the
   x-height, capitals' or ascenders' line, a foot onto the baseline or descenders' line, the heights between in step.
   Then it is traced back into curves (fitOutline), its straight runs straight. */
import { fitOutline, type Node } from './outline';
import { signedArea } from './geom';
import { combine, shape } from './boolean';

interface P { x: number; y: number; line?: boolean }

/** How far each setting pushes a letter out, either side, as a share of the font's stem, at the end of its slider
    past where the font was picked (`out`), and in at the other end (`in`): Weight sideways and up and down, Verticals
    sideways, Horizontals up and down, Contrast up and down (higher, in; lower, out, and as far again turned round to
    Reversed); and no further in, all told, than HAIR_KEEP of the font's thinnest strokes. */
export const PEN = {
  weight: { out: 0.15, in: 0.1 }, verticals: { out: 0.12, in: 0.08 }, horizontals: { out: 0.12, in: 0.08 }, contrast: { out: 0.08, in: 0.08 }
}, HAIR_KEEP = 0.25;
/** How far Contrast turned round to Reversed pushes a letter in sideways, either side, as a share of the font's stem,
    its bars going out the while (PEN.contrast): the stems thinned, so Reversed draws the bars heavier than the stems;
    no further in, on its own, than HAIR_KEEP of the font's thinnest strokes. */
export const PEN_REVERSED = 0.2;
/** How far apart a curve is cut, and a straight edge, in the font's units; how many times the push a corner may reach
    out before it is cut across; how close the traced curves keep to the polygon. */
const STEP = 3, EDGE_STEP = 6, MITRE = 3, FIT_TOL = 0.8;
/** Pushed out, an opening between two of a letter's edges facing each other (OPEN_FACING: their headings no more than
    60° off head on) narrows to no less than about OPEN_KEEP of its width as drawn: each side goes out no further
    across than a quarter of it, and a corner heading into it no further than keeps it as far off; and as much less
    again toward that along the outline at OPEN_SLOPE units a unit, then averaged over OPEN_EASE units either way, so
    the push eases down to it without a step or a kink, but not round a corner sharper than OPEN_CORNER degrees, where
    each edge goes out its own way. Two edges a short way round the outline from each other, under OPEN_CROTCH times
    as far as they stand apart, are a crotch's sides, which fill in as they did. (Pushed out alike all round, a
    grotesque's openings closed at Weight 100, its a's terminal run into its bowl, its e's and s's onto their bars and
    spines, its g's tail onto its bowl, each a level jog where the slit was; and the letter pushed only as far as kept
    them open, the e 0.78 of the way, as much lighter than its o. Taken for openings, the narrow crotches of a slab's M
    and N kinked their stems.) */
const OPEN_KEEP = 0.5, OPEN_FACING = 0.5, OPEN_SLOPE = 0.1, OPEN_EASE = 40, OPEN_CORNER = 30, OPEN_CROTCH = 6;
/** A piece of ink or paper smaller across than this share of the capitals' height, left over, goes. */
const SPECK = 0.012;
/** How many halvings find how far a letter whose counter would close is moved. */
const CLOSE_STEPS = 5;

/** The lines a letter stands on: tops (x-height, capitals', ascenders'), and feet (baseline, descenders'). */
export interface EvenLines { tops: number[]; feet: number[] }

/** `cs` pushed out `dx` font units sideways and `dy` up and down (in where negative), set back on `lines`; `cap` the
    capitals' height. */
export function evenWeight(cs: Node[][], dx: number, dy: number, lines: EvenLines, cap: number): Node[][] {
  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return cs;
  let rings = cs.map(polygon).filter(r => r.length > 2).map(r => sharpened(r, Math.max(Math.abs(dx), Math.abs(dy))));
  // (as the engine reads ink: anticlockwise round it, clockwise round a hole; a font drawn the other way round turned)
  const lead = rings.reduce((a, r) => (Math.abs(signedArea(r)) > Math.abs(signedArea(a)) ? r : a), rings[0] ?? []);
  if (signedArea(lead) < 0) rings = rings.map(r => r.slice().reverse());
  // (as many pieces and holes as it had: none closed, parted or run together)
  const holes = (rs: P[][]) => rs.filter(r => signedArea(r) < 0).length, pieces = (rs: P[][]) => rs.length - holes(rs);
  const same = (rs: P[][]) => holes(rs) === holes(rings) && pieces(rs) === pieces(rings);
  const room = openings(rings, 2 * Math.max(dx, dy) / (1 - OPEN_KEEP));
  let out = pushedOut(rings, dx, dy, lines, cap, room);
  if (!same(out)) {
    let lo = 0, hi = 1;
    out = rings;
    for (let k = 0; k < CLOSE_STEPS; k++) {
      const t = (lo + hi) / 2, o = pushedOut(rings, dx * t, dy * t, lines, cap, room);
      if (same(o)) { lo = t; out = o; } else hi = t;
    }
  }
  // (traced, a sliver may run flat: it goes too; and one whose curves cross themselves round a sharp tip is traced
  // again closer, or else drawn as the polygon it was)
  const speck = (SPECK * cap) ** 2;
  return out.flatMap(r => {
    const cmds: [string, ...number[]][] = [...straightened(r, p => !!p.line).map((p, i): [string, ...number[]] => [i ? 'L' : 'M', p.x, p.y]), ['Z']];
    for (const tol of [FIT_TOL, FIT_TOL / 4]) { const cs = fitOutline(cmds, tol); if (!cs.some(c => crosses(polygon(c)))) return cs; }
    return [r.map((p): Node => ({ x: p.x, y: p.y }))];
  }).filter(c => Math.abs(signedArea(polygon(c))) > speck);
}

/** Whether a ring crosses itself (two of its edges, not neighbours, cross). */
function crosses(r: P[]): boolean {
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n], x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = r[j], d = r[(j + 1) % n];
      if (Math.max(c.x, d.x) < x0 || Math.min(c.x, d.x) > x1 || Math.max(c.y, d.y) < y0 || Math.min(c.y, d.y) > y1) continue;
      const side = (p: P, q: P, s: P) => (q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x);
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true;
    }
  }
  return false;
}

/** Rings (anticlockwise round their ink) pushed out `dx` sideways and `dy` up and down, each edge no further than its
    `room` lets it (openings), set back on `lines`, as polygons: their pieces and holes thinner than a speck gone, each
    point cut along a straight edge marked so. */
function pushedOut(rings: P[][], dx: number, dy: number, lines: EvenLines, cap: number, room: number[][] | null): P[][] {
  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return rings;
  const pushed = rings.map((r, k) => { const e = r.map((a, i) => unit(a, r[(i + 1) % r.length])); return push(r, e, dx, dy, room?.[k]); });
  const back = linesBack(dy, lines), sh = shape(pushed, true), speck = SPECK * cap;
  // (a point cut along a straight edge, pushed, still marked so: straightened traces its run straight)
  const cut = new Set(pushed.flatMap(r => r.filter(p => p.line).map(p => `${p.x},${p.y}`)));
  // (a piece of ink or paper thinner across than a speck, its area over half its length round, goes)
  return combine([sh], sh.has).map(despiked).filter(r => Math.abs(signedArea(r)) > speck * speck && 2 * Math.abs(signedArea(r)) / round(r) > speck)
    .map(r => r.map(p => ({ x: p.x, y: back(p.y), line: cut.has(`${p.x},${p.y}`) })));
}

/** How far each edge of `rings` (anticlockwise round their ink) may go out across before the opening it faces narrows
    past OPEN_KEEP of its width (Infinity where it faces none within `reach`): read along a line out from its middle,
    and from each corner the outline turns out round, to the first edge it meets, if that edge faces back (OPEN_FACING)
    across an opening, not a crotch (OPEN_CROTCH); that edge given as little; then eased along each ring (OPEN_SLOPE,
    OPEN_EASE), a straight edge of the drawing by its least all along. Null where nothing goes out. */
function openings(rings: P[][], reach: number): number[][] | null {
  if (!(reach > 0)) return null;
  // (the edges kept by the cells of a grid they pass through, so a line out looks only at those near it)
  const cell = Math.max(8, reach / 2), at = (v: number) => Math.floor(v / cell), key = (ix: number, iy: number) => (ix + 32768) * 65536 + iy + 32768;
  const grid = new Map<number, [number, number][]>();
  rings.forEach((r, k) => r.forEach((a, i) => {
    const b = r[(i + 1) % r.length];
    for (let ix = at(Math.min(a.x, b.x)); ix <= at(Math.max(a.x, b.x)); ix++) {
      for (let iy = at(Math.min(a.y, b.y)); iy <= at(Math.max(a.y, b.y)); iy++) {
        const q = key(ix, iy), list = grid.get(q);
        if (list) list.push([k, i]); else grid.set(q, [[k, i]]);
      }
    }
  }));
  // (how far round its ring each edge's middle stands, and each ring all round)
  const lens = rings.map(r => r.map((a, i) => Math.hypot(r[(i + 1) % r.length].x - a.x, r[(i + 1) % r.length].y - a.y)));
  const along = lens.map(ls => { let s = 0; return ls.map(l => { s += l; return s - l / 2; }); }), round = lens.map(ls => ls.reduce((s, l) => s + l, 0));
  // (the first edge a line out from (mx, my) heading (nx, ny) meets within reach, where it faces back across an
  // opening: how far, and which; the line starts `from` round ring k, on the edges `skip`)
  const faced = (k: number, from: number, mx: number, my: number, nx: number, ny: number, skip: number[]) => {
    let best = Infinity, facing = false, hit = -1, hitRing = -1;
    const seen = new Set<number>();
    // (the cells round each step out, a cell at a time, till past the nearest edge met or out of reach)
    for (let s = 0; s <= reach + cell && s <= best + cell; s += cell) {
      const cx = at(mx + nx * s), cy = at(my + ny * s);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const q = key(ix, iy);
        if (seen.has(q)) continue;
        seen.add(q);
        for (const [k2, j] of grid.get(q) ?? []) {
          if (k2 === k && skip.includes(j)) continue;
          const ring = rings[k2], c = ring[j], d = ring[(j + 1) % ring.length], ex = d.x - c.x, ey = d.y - c.y, den = nx * ey - ny * ex;
          if (Math.abs(den) < 1e-12) continue;
          const wx = c.x - mx, wy = c.y - my, t = (wx * ey - wy * ex) / den, u = (ny * wx - nx * wy) / den;
          if (t > 1e-6 && t < best && u >= 0 && u <= 1) { best = t; facing = (nx * ey - ny * ex) / Math.hypot(ex, ey) < -OPEN_FACING; hit = j; hitRing = k2; }
        }
      }
    }
    if (!facing || best > reach) return null;
    // (a crotch, not an opening: the edge it faces meets it round its tip, a short way along the ring, against how far
    // apart they stand or against the reach (a notch a unit across where a bowl meets its stem))
    if (hitRing === k) {
      const d = Math.abs(from - along[k][hit]), by = Math.min(d, round[k] - d);
      if (by < OPEN_CROTCH * best || by < 2 * reach) return null;
    }
    return { gap: best, hit, hitRing };
  };
  // (the edge each faces across an opening given as little room: a terminal's tip, heading away from the bar it nears,
  // meets nothing out from it, but the bar meets the tip)
  const raw = rings.map(r => r.map(() => Infinity)), keep = (k: number, i: number, v: number) => { raw[k][i] = Math.min(raw[k][i], v); };
  rings.forEach((r, k) => r.forEach((a, i) => {
    const n = r.length, b = r[(i + 1) % n], l = lens[k][i];
    if (l < 1e-9) return;
    const f = faced(k, along[k][i], (a.x + b.x) / 2, (a.y + b.y) / 2, (b.y - a.y) / l, -(b.x - a.x) / l, [i]);
    if (f) { keep(k, i, (1 - OPEN_KEEP) * f.gap / 2); keep(f.hitRing, f.hit, (1 - OPEN_KEEP) * f.gap / 2); }
    // (and a corner the outline turns out round, which goes out further than its edges, its edges' push over the cosine
    // of half its turn, heading between them: its edges no further than keeps it short of the opening it heads into, a
    // terminal's tip or its cut's inner end; read off its edges, an e's mouth narrowed to a quarter at Weight 95)
    const p = (i + n - 1) % n, e1 = unit(r[p], a), e2 = unit(a, b);
    if (!cornered(e1, e2) || e1.x * e2.y - e1.y * e2.x <= 0) return;
    const hx = e1.y + e2.y, hy = -(e1.x + e2.x), hl = Math.hypot(hx, hy);
    if (hl < 1e-9) return;
    const c = faced(k, along[k][i] - l / 2, a.x, a.y, hx / hl, hy / hl, [p, i]);
    if (c) { keep(k, p, (1 - OPEN_KEEP) * c.gap / 2 * hl / 2); keep(k, i, (1 - OPEN_KEEP) * c.gap / 2 * hl / 2); keep(c.hitRing, c.hit, (1 - OPEN_KEEP) * c.gap / 2); }
  }));
  return rings.map((r, k) => {
    const n = r.length;
    let room = raw[k];
    // (a straight edge of the drawing, its pieces heading alike, moved alike all along, by the least room any piece of
    // it has, so it stays straight: a terminal's cut eased along it came out bent)
    const run = straightRuns(r), flat = (v: number[]) => {
      const least = new Map<number, number>();
      v.forEach((x, i) => { if (run[i] >= 0) least.set(run[i], Math.min(least.get(run[i]) ?? Infinity, x)); });
      return v.map((x, i) => (run[i] >= 0 ? least.get(run[i])! : x));
    };
    room = flat(room);
    // (eased: no edge's room more than OPEN_SLOPE a unit along the ring past its neighbours', both ways round, twice;
    // then, past any push read as no limit, averaged over OPEN_EASE units either way, twice, so it bends without a kink)
    // (neither past a corner, where the edges either side go out as far as each may: a terminal's cut's room eased round
    // onto its outer side bent it in)
    const gap = r.map((a, i) => (Math.hypot(r[(i + 1) % n].x - a.x, r[(i + 1) % n].y - a.y) + Math.hypot(a.x - r[(i + n - 1) % n].x, a.y - r[(i + n - 1) % n].y)) / 2);
    const turn = r.map((a, i) => cornered(unit(r[(i + n - 1) % n], a), unit(a, r[(i + 1) % n])));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) { const p = (i + n - 1) % n; if (!turn[i]) room[i] = Math.min(room[i], room[p] + OPEN_SLOPE * gap[i]); }
      for (let i = n - 1; i >= 0; i--) { const p = (i + 1) % n; if (!turn[p]) room[i] = Math.min(room[i], room[p] + OPEN_SLOPE * gap[p]); }
    }
    let eased = room.map(v => Math.min(v, 2 * reach));
    if (!eased.some(v => v < 2 * reach)) return room;
    for (let pass = 0; pass < 2; pass++) {
      eased = eased.map((v, i) => {
        let sum = v * gap[i], w = gap[i];
        for (const dir of [1, -1]) {
          for (let j = (i + dir + n) % n, s = 0; j !== i; j = (j + dir + n) % n) {
            s += gap[j];
            if (s > OPEN_EASE || turn[dir > 0 ? j : (j + 1) % n]) break;
            sum += eased[j] * gap[j]; w += gap[j];
          }
        }
        return sum / w;
      });
    }
    return flat(eased).map(v => (v < 2 * reach ? v : Infinity));
  });
}

/** Which straight edge of the drawing each edge of ring `r` lies along (the pieces of one cut along it, polygon's `line`
    points, heading alike), numbered; -1 for a piece of a curve. */
function straightRuns(r: P[]): number[] {
  const n = r.length, e = r.map((a, i) => unit(a, r[(i + 1) % n])), straight = r.map((a, i) => !!(a.line || r[(i + 1) % n].line));
  const goesOn = (i: number) => { const p = (i + n - 1) % n; return straight[i] && straight[p] && e[i].x * e[p].x + e[i].y * e[p].y > 0.9999; };
  const run = r.map(() => -1);
  let from = 0;
  while (from < n && goesOn(from)) from++;
  if (from === n) return run;
  for (let k = 0, id = -1; k < n; k++) {
    const i = (from + k) % n;
    if (!straight[i]) continue;
    if (!goesOn(i)) id++;
    run[i] = id;
  }
  return run;
}

/** A ring with its tiny edges taken into the corners they turn: an edge shorter than the push `d` (by TINY_SHARE),
    turning by TINY_TURN or more at both its ends (a font's corners rounded or stepped a few units, at its stroke ends
    and joins), drawn as the one corner where the edges either side of it meet, pass by pass, so a tiny round comes to
    the sharp corner it rounds. Pushed further than they are long, they turned inside out and were traced as spikes
    and nicks (an industrial's c's, s's and G's ends at Weight 0, a grotesque's at Width 100); a curve's points, turning
    a little each, are left as they are. */
function sharpened(r: P[], d: number): P[] {
  if (d < 0.5) return r;
  // (first the points nearer the last one kept than half the push, and than TINY_GAP, let go, but where the outline
  // turns a corner (TINY_CORNER): a font's tiny round, cut in points a fraction of a unit apart, each pushed by its own
  // turn, threw the edge past it out a dozen units, a fin; a curve's points, STEP apart, stay)
  const n0 = r.length, bend = (i: number) => {
    const a = r[(i - 1 + n0) % n0], b = r[i], c = r[(i + 1) % n0], ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
  };
  let pts: P[] = [];
  for (let i = 0; i < n0; i++) {
    const p = r[i], last = pts[pts.length - 1];
    if (!last || bend(i) > TINY_CORNER || Math.hypot(p.x - last.x, p.y - last.y) >= Math.min(d / 2, TINY_GAP)) pts.push(p);
  }
  if (pts.length < 4) pts = r;
  for (let pass = 0; pass < 8 && pts.length > 4; pass++) {
    const n = pts.length, at = (i: number) => pts[((i % n) + n) % n];
    const turn = (i: number) => {
      const a = at(i - 1), b = at(i), c = at(i + 1), ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
      return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
    };
    const out: P[] = [];
    let changed = false;
    for (let i = 0; i < n; i++) {
      const b = at(i), c = at(i + 1), l = Math.hypot(c.x - b.x, c.y - b.y);
      if (i < n - 1 && l < TINY_SHARE * d && turn(i) > TINY_TURN && turn(i + 1) > TINY_TURN) {
        // (where the edge in and the edge out meet, near the tiny edge; else its middle)
        const a = at(i - 1), e = at(i + 2), ux = b.x - a.x, uy = b.y - a.y, vx = e.x - c.x, vy = e.y - c.y, den = ux * vy - uy * vx;
        let m = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
        if (Math.abs(den) > 1e-9) {
          const t = ((c.x - b.x) * vy - (c.y - b.y) * vx) / den, q = { x: b.x + ux * t, y: b.y + uy * t };
          if (Math.hypot(q.x - b.x, q.y - b.y) < 2 * d && Math.hypot(q.x - c.x, q.y - c.y) < 2 * d) m = q;
        }
        out.push(m); i++; changed = true;
      } else out.push(b);
    }
    if (!changed) break;
    pts = out;
  }
  return pts.length > 2 ? pts : r;
}
const TINY_SHARE = 1, TINY_TURN = 15 * Math.PI / 180, TINY_CORNER = 30 * Math.PI / 180, TINY_GAP = 2.5;

/** A ring without its needles: a point the outline runs out to and straight back from (a mitre's leftover where edges
    met nearly head on round a sharp tip), traced, came out a loop of no width. */
function despiked(r: P[]): P[] {
  let pts = r;
  for (let pass = 0; pass < 8 && pts.length > 3; pass++) {
    const n = pts.length, keep = pts.map((b, i) => {
      const a = pts[(i + n - 1) % n], c = pts[(i + 1) % n], u = unit(a, b), v = unit(b, c);
      return u.x * v.x + u.y * v.y > -0.98 && Math.hypot(b.x - a.x, b.y - a.y) > 1e-3;
    });
    if (keep.every(Boolean)) break;
    pts = pts.filter((_, i) => keep[i]);
  }
  return pts;
}

/** How far round a ring is. */
const round = (r: P[]) => r.reduce((s, p, i) => s + Math.hypot(r[(i + 1) % r.length].x - p.x, r[(i + 1) % r.length].y - p.y), 0);
/** Whether an outline heading `u` and then `v` turns a corner (more than OPEN_CORNER). */
const cornered = (u: P, v: P) => u.x * v.x + u.y * v.y < Math.cos(OPEN_CORNER * Math.PI / 180);
const unit = (a: P, b: P) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };

/** A contour as a polygon: its curves cut every STEP units or so, its straight edges every EDGE_STEP. */
function polygon(c: Node[]): P[] {
  const out: P[] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    out.push({ x: a.x, y: a.y });
    const curve = a.ox !== undefined || b.ix !== undefined;
    const p1 = { x: a.ox ?? a.x, y: a.oy ?? a.y }, p2 = { x: b.ix ?? b.x, y: b.iy ?? b.y };
    const len = curve ? Math.hypot(p1.x - a.x, p1.y - a.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y) + Math.hypot(b.x - p2.x, b.y - p2.y) : Math.hypot(b.x - a.x, b.y - a.y);
    const m = curve ? Math.max(4, Math.ceil(len / STEP)) : Math.ceil(len / EDGE_STEP);
    for (let k = 1; k < m; k++) {
      const t = k / m, u = 1 - t;
      out.push(curve ? { x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y } : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, line: true });
    }
  }
  // (a point on top of the one before it would have no direction)
  return out.filter((p, i) => { const q = out[(i + out.length - 1) % out.length]; return Math.hypot(p.x - q.x, p.y - q.y) > 1e-6; });
}

/** A ring's edges each moved out (in where negative) `gx` as far as it faces sideways and `gy` as far as it faces up
    or down, out no further across than its `room` (openings), its points where its edges, moved, meet again. Where they part round a corner they meet at a mitre, cut
    across past MITRE times the push; where they close in, they meet where they cross, or, round a tip sharper than
    that, each carried to its end, the loop they make winding the other way for shape(…, true) to leave out. */
function push(r: P[], e: P[], gx: number, gy: number, room?: number[]): P[] {
  const n = r.length, out: P[] = [], most = MITRE * Math.max(Math.abs(gx), Math.abs(gy));
  // (each edge out no further across than its room, openings, lets it; a point as far as the less of its two edges, both
  // moved by as much there, or two edges nearly in line, moved apart by different amounts, would meet far off)
  const share = (j: number) => { const across = e[j].y * e[j].y * gx + e[j].x * e[j].x * gy; return room && across > room[j] ? room[j] / across : 1; };
  for (let i = 0; i < n; i++) {
    const b = r[i], e1 = e[(i + n - 1) % n], e2 = e[i], f = room ? Math.min(share((i + n - 1) % n), share(i)) : 1;
    // (round a corner, each edge as far as its own: the two meet across it all the same)
    const f1 = room && cornered(e1, e2) ? share((i + n - 1) % n) : f, f2 = room && cornered(e1, e2) ? share(i) : f;
    const v1 = { x: e1.y * gx * f1, y: -e1.x * gy * f1 }, v2 = { x: e2.y * gx * f2, y: -e2.x * gy * f2 };
    // (how far out the corner goes, as its edges do across themselves: which way they part or close in)
    const g = (e1.y * v1.x - e1.x * v1.y + e2.y * v2.x - e2.x * v2.y) / 2;
    const cross = e1.x * e2.y - e1.y * e2.x;
    if (Math.abs(cross) < 0.02) { out.push({ x: b.x + (v1.x + v2.x) / 2, y: b.y + (v1.y + v2.y) / 2, line: b.line }); continue; }
    // where the two edges, moved, cross
    const ax = b.x + v1.x, ay = b.y + v1.y, cx = b.x + v2.x, cy = b.y + v2.y, s = ((cx - ax) * e2.y - (cy - ay) * e2.x) / cross;
    const m = { x: ax + e1.x * s, y: ay + e1.y * s }, reach = Math.hypot(m.x - b.x, m.y - b.y);
    if (reach <= most) { out.push(m); continue; }
    const parts = g > 0 ? cross > 0 : cross < 0;
    if (!parts) { out.push({ x: ax, y: ay }, { x: cx, y: cy }); continue; }
    // cut square across the mitre where it reaches MITRE times the push
    const ux = (m.x - b.x) / reach, uy = (m.y - b.y) / reach, d1 = e1.x * ux + e1.y * uy, d2 = -(e2.x * ux + e2.y * uy);
    const L1 = most - ((ax - b.x) * ux + (ay - b.y) * uy), L2 = most - ((cx - b.x) * ux + (cy - b.y) * uy);
    if (d1 < 1e-6 || d2 < 1e-6) { out.push({ x: ax, y: ay }, { x: cx, y: cy }); continue; }
    out.push({ x: ax + e1.x * L1 / d1, y: ay + e1.y * L1 / d1 }, { x: cx - e2.x * L2 / d2, y: cy - e2.y * L2 / d2 });
  }
  return out;
}

/** A ring with the points cut along its straight edges (`cut`) taken out where they still lie on a straight run (within
    a quarter unit of the line between their neighbours), so fitOutline traces them as straight edges. */
function straightened(r: P[], cut: (p: P) => boolean): P[] {
  let pts = r;
  for (let pass = 0; pass < 4; pass++) {
    const keep = pts.map(() => true);
    for (let i = 0; i < pts.length; i++) {
      if (!keep[(i + pts.length - 1) % pts.length] || !cut(pts[i])) continue;
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const l = Math.hypot(c.x - a.x, c.y - a.y);
      if (l > 1e-9 && Math.abs((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / l < 0.25 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0) keep[i] = false;
    }
    const next = pts.filter((_, i) => keep[i]);
    if (next.length === pts.length || next.length < 3) break;
    pts = next;
  }
  return pts;
}

/** Heights drawn back onto the lines the outline grew past (or shrank inside): a top `d` over its line onto it, a foot
    `d` under its line, and every height between moved in step, beyond the outermost carried on as they are. */
function linesBack(d: number, lines: EvenLines): (y: number) => number {
  const knots = [...lines.tops.map(y => [y + d, y]), ...lines.feet.map(y => [y - d, y])].sort((p, q) => p[0] - q[0]);
  // (lines nearer each other than they grew, a capital's and an ascender's, read as one)
  const ks = knots.filter((k, i) => i === 0 || k[0] - knots[i - 1][0] > 1);
  return (y: number) => {
    if (y <= ks[0][0]) return y + ks[0][1] - ks[0][0];
    const L = ks[ks.length - 1];
    if (y >= L[0]) return y + L[1] - L[0];
    let i = 1;
    while (ks[i][0] < y) i++;
    const [a, b] = [ks[i - 1], ks[i]], t = (y - a[0]) / (b[0] - a[0]);
    return a[1] + (b[1] - a[1]) * t;
  };
}
