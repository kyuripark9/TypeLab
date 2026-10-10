/* Building one letter: its glyph function draws a skeleton on a Builder (font.ts); its turns are marked and
   its ends shaped (corners.ts, ends.ts) and its serifs faced (serif-sides.ts); the hand wobbles it; the pen
   expands its strokes (stroke.ts); fillets go into the corners where strokes join (joins.ts); the stencil
   cuts it (stencil.ts); its corners are rounded and its serifs set on; and then it is placed: spaced,
   slanted, turned, mirrored, sliced and filled (placeGlyph). Also letters built from blocks, and drawn ones. */
import { joinGap } from '../params';
import { applyM, clamp, clipPoly, cmdsToD, cubicAt, lerp, mulM, quarter, roundContour, roundCuts, signedArea, smoothstep, splitPoly, transformCmds } from './geom';
import { blockDims, blockRings } from './blocks';
import { fillOutline, shadowShift, slice } from './effects';
import { drawnCmds, type Drawn } from './outline';
import { buildSerif, diamondCut, diamondEnd, expandStroke, type Expanded, serifPlace, type SerifPlace } from './stroke';
import type { Cmd, Mark, Mat, PenCtx, Pt } from './types';
import { Builder, filletPts, type Glyph, glyphDefOf, type GlyphStroke, type Metrics, quarterK, strokeWt } from './font';
import { barsThrough, gapOf, isBar, isHorizontal, stencilCut, stencilCuts, stencilOpens, stencilPieces, strokeJoins, turnKeep, turnPieces } from './stencil';
import { stretchTerminals } from './ends';
import { boxQuarters, endCorners, markTurns, turnsOf } from './corners';
import { joinCorners } from './joins';
import { cupSerifs, faceSerifs } from './serif-sides';

/** Fillets moved onto the edges of the strokes they round into, where those are drawn lighter or
    heavier than the stem weight the letters reckon with (weighted one by one, or thinned by a
    contrast turned round): a lighter stem pulls its edge in, and the fillet with it, so no gap
    opens between them; a heavier one pushes it out, and it rounds no further than the stroke it
    runs along reaches. */
function weighFillets(b: Builder, m: Metrics) {
  if (Math.abs(m.tDir(0, 1) - m.s) < 0.5 && !b.strokes.some((st, si) => st.cmds && strokeWt(m, si) !== 1)) return;
  const edges: { ax: 'x' | 'y'; at: number; from: number; to: number; half: number; drawn: number; f: number }[] = [];
  b.strokes.forEach((st, si) => {
    if (!st.cmds) return;
    const f = strokeWt(m, si), sc = st.o.scale || 1;
    let cur: Pt | null = null;
    for (const c of st.cmds) {
      if (c[0] === 'Z') { cur = null; continue; }
      // every command ends at its last point, which the next one runs on from
      const n = c.length, off = typeof c[n - 1] === 'number' ? 2 : 3, q = { x: c[n - off] as number, y: c[n - off + 1] as number };
      if (c[0] === 'L') {
        const w = (c[3] as { w?: unknown } | undefined)?.w ?? st.o.w;
        if (cur && (Math.abs(q.x - cur.x) < 0.5) !== (Math.abs(q.y - cur.y) < 0.5)) {
          // a plumb or level side of the stroke, how far its edges sit off its centerline as the
          // letters reckon it (a stroke, or a bar), and as the pen draws it
          const plumb = Math.abs(q.x - cur.x) < 0.5, thin = w === 'thin';
          const half = (thin ? m.thin : plumb ? m.s : m.hT) * sc / 2, drawn = (thin ? m.thin : plumb ? m.tDir(0, 1) : m.hT) * sc / 2;
          edges.push(plumb ? { ax: 'x', at: q.x, from: Math.min(cur.y, q.y), to: Math.max(cur.y, q.y), half, drawn, f }
            : { ax: 'y', at: q.y, from: Math.min(cur.x, q.x), to: Math.max(cur.x, q.x), half, drawn, f });
        }
      }
      cur = q;
    }
  });
  for (const st of b.strokes) {
    const fl = st.fillet;
    if (!fl) continue;
    // the fillet sits on the side of each edge it fills away from that stroke's centerline
    const on = edges.filter(e => {
      const [pos, along, s] = e.ax === 'x' ? [fl.x, fl.y, fl.sx] : [fl.y, fl.x, fl.sy];
      return Math.min(Math.abs(pos - (e.at + s * e.half)), Math.abs(pos - (e.at + s * e.drawn))) <= 1.5 && along >= e.from - 1 && along <= e.to + 1;
    });
    const moved = { ...fl };
    for (const e of on) if (e.f !== 1 || Math.abs(e.drawn - e.half) >= 0.5) moved[e.ax] = e.at + (e.ax === 'x' ? fl.sx : fl.sy) * e.drawn * e.f;
    if (moved.x === fl.x && moved.y === fl.y) continue;
    for (const e of on) {
      // along a level edge it reaches across in x, along a plumb one in y
      const k = e.ax === 'x' ? 'y' : 'x', s = k === 'x' ? fl.sx : fl.sy;
      moved.r = Math.min(moved.r, s > 0 ? e.to - moved[k] : moved[k] - e.from);
    }
    st.fillet = moved;
    st.poly = moved.r < 1 ? [] : filletPts(moved);
  }
}

const hash = (n: number, k: number) => { const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

/* Hand-drawn irregularity: a smooth displacement field, different for every glyph. Every
   stroke of a glyph moves through the same field, so strokes that touch keep touching. */
function wobbler(code: number, m: Metrics, pins: [number, number][] = []) {
  const A0 = m.wob * m.xh * 0.085, f = 2 * Math.PI / (m.xh * 1.1);
  const p = [1, 2, 3, 4, 5, 6].map(k => hash(code, k + 10) * 2 * Math.PI);
  // still at a pin, and coming in smoothly further off: two joined letters' wobbles differ, and
  // their joins have to lie on the one line all the same
  const A = (x: number, y: number) => A0 * pins.reduce((k, [px, py]) => k * smoothstep((Math.hypot(x - px, y - py) - m.xh * 0.2) / (m.xh * 0.4)), 1);
  const dx = (x: number, y: number) => A(x, y) * (0.5 * Math.sin(x * f * 0.7 + y * f * 0.5 + p[0]) + 0.3 * Math.sin(y * f * 1.3 + p[1]) + 0.2 * Math.sin(y * f * 3.1 + x * f * 0.9 + p[4]));
  const dy = (x: number, y: number) => A(x, y) * 0.75 * (0.5 * Math.sin(x * f * 1.1 - y * f * 0.4 + p[2]) + 0.3 * Math.sin(x * f * 0.5 + p[3]) + 0.2 * Math.sin(x * f * 2.9 - y * f * 1.3 + p[5]));
  const pt = (x: number, y: number): [number, number] => [x + dx(x, y), y + dy(x, y)];
  // A handle goes the way the field carries the bit of curve beside its point, not to where the field
  // would take the handle itself: then two curves that met smoothly still do, where moving each handle
  // on its own would put a small kink, and a notch in the outline, at every point between them.
  const handle = (a: Pt, h: Pt): Pt => {
    const e = 0.01, [ax, ay] = pt(a.x, a.y), [bx, by] = pt(a.x + (h.x - a.x) * e, a.y + (h.y - a.y) * e);
    return { x: ax + (bx - ax) / e, y: ay + (by - ay) / e };
  };
  const cmds = (c: Cmd[]): Cmd[] => {
    // a quarter turn holds its ends level and plumb, which a straight beside it tilted by the field
    // would no longer meet smoothly: it goes through the field as the cubic it stands for
    const at: Pt[] = [];
    let cur: Pt = { x: 0, y: 0 };
    const src = c.map(cmd => {
      at.push(cur);
      if (cmd[0] === 'Z') return cmd;
      let out = cmd;
      if (cmd[0] === 'hv' || cmd[0] === 'vh') {
        const P = quarter(cur.x, cur.y, cmd[1], cmd[2], cmd[0], quarterK(cur, cmd, m));
        out = ['C', P[1].x, P[1].y, P[2].x, P[2].y, P[3].x, P[3].y, ...cmd.slice(3)];
      }
      cur = out[0] === 'C' ? { x: out[5], y: out[6] } : { x: out[1], y: out[2] };
      return out;
    });
    const end = (i: number) => (src[i][0] === 'C' ? { x: src[i][5], y: src[i][6] } : { x: src[i][1], y: src[i][2] });
    const out = src.map((cmd, i): Cmd => {
      if (cmd[0] === 'Z') return cmd;
      if (cmd[0] !== 'C') return [cmd[0], ...pt(cmd[1], cmd[2]), ...cmd.slice(3)];
      const a = at[i], b = end(i), h0 = handle(a, { x: cmd[1], y: cmd[2] }), h1 = handle(b, { x: cmd[3], y: cmd[4] });
      return ['C', h0.x, h0.y, h1.x, h1.y, ...pt(b.x, b.y), ...cmd.slice(7)];
    });
    // and a curve running smoothly on from a straight (or into one) keeps on along it as it now runs
    // (handle `hi` of curve `ci` points from its point the way from `from` to `to` runs)
    const along = (ci: number, hi: number, from: Pt, to: Pt) => {
      const C = src[ci], a = hi === 1 ? at[ci] : end(ci);
      const ux = C[hi] - a.x, uy = C[hi + 1] - a.y, vx = to.x - from.x, vy = to.y - from.y, lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu < 1e-6 || lv < 1e-6 || (ux * vx + uy * vy) / (lu * lv) < 0.9995) return;
      const [fx, fy] = pt(from.x, from.y), [tx, ty] = pt(to.x, to.y), [px, py] = pt(a.x, a.y), o = out[ci];
      const l = Math.hypot(o[hi] - px, o[hi + 1] - py), d = Math.hypot(tx - fx, ty - fy) || 1;
      o[hi] = px + (tx - fx) / d * l; o[hi + 1] = py + (ty - fy) / d * l;
    };
    src.forEach((cmd, i) => {
      if (cmd[0] !== 'C') return;
      // a straight before it runs on into its first handle; one after carries on from its last
      if (i > 0 && src[i - 1][0] === 'L') along(i, 1, at[i - 1], at[i]);
      if (i + 1 < src.length && src[i + 1][0] === 'L') along(i, 3, end(i + 1), end(i));
    });
    return out;
  };
  return { pt, cmds };
}

/** The hand's irregularity run through a letter's skeleton before the pen draws it: its strokes, counters
    and marks, and where its ends sat (`homes`). Returns the pen to draw it with, which then also varies
    each stroke's thickness along it, in the letter's own phase. */
function wobbleSkeleton(b: Builder, m: Metrics, code: number, homes: Map<string, Pt>): PenCtx {
  if (!(m.wob > 0)) return m.ctx;
  const wb = wobbler(code, m, b.joins);
  for (const st of b.strokes) {
    if (st.cmds) st.cmds = wb.cmds(st.cmds);
    if (st.poly) st.poly = st.poly.map(q => { const [x, y] = wb.pt(q.x, q.y); return { ...q, x, y }; });
  }
  b.counters = b.counters.map(pts => pts.map(q => { const [x, y] = wb.pt(q.x, q.y); return { x, y }; }));
  b.marks.forEach(k => { [k.x, k.y] = wb.pt(k.x, k.y); });
  homes.forEach((q, id) => { const [x, y] = wb.pt(q.x, q.y); homes.set(id, { x, y }); });
  return { ...m.ctx, wobble: m.wob, seed: hash(code, 5) * 2 * Math.PI };
}

/** A contour wound so its area has the sign of `sign` (the ink's +, a hole's -). */
const wind = (pts: Pt[], sign: number) => ((signedArea(pts) < 0) !== (sign < 0) ? pts.slice().reverse() : pts);
/** A contour as path commands, wound by `sign`, its corners rounded by `R` (see roundContour); null when it has
    fewer than three points. */
const finish = (pts: Pt[], sign: number, R: number, cornersOut?: Pt[]) => {
  if (pts.length < 3) return null;
  return roundContour(wind(pts, sign), R, cornersOut);
};
/** The corners a stencil cuts rounded: they are the points that weren't on the stroke as drawn. */
const cutRound = (m: Metrics, pts: Pt[], drawn: Set<Pt>, w: number) => roundCuts(pts, q => !!q.sharp && !drawn.has(q), m.gapRound, w);

/** Every join of a stroke into another marked (type 'join'), so the letter can open each on its own, with
    the gap it has as drawn (on its own Gap scale) and the way the gap opens; and so is every turn, which
    Stencil leaves whole. Returns each stroke's turns, with their ids. */
function markJoins(b: Builder, m: Metrics, exps: ({ ex: Expanded | null } | null)[], expanded: (Expanded | null)[], marks: Mark[]) {
  const turns = b.strokes.map((st, si) => (st.cmds && exps[si]?.ex && !exps[si]!.ex!.loop ? turnsOf(st.cmds, m).map((tn, k) => ({ ...tn, id: `${si}t${k}` })) : []));
  b.strokes.forEach((st, si) => {
    const ex = exps[si]?.ex;
    if (!ex || ex.loop || st.poly) return;
    // (clipped again, as buildGlyph's outlines are: see there)
    const joins = strokeJoins(si, expanded), opens = stencilOpens(joins), contour = st.o.clip ? clipPoly(ex.contours[0], st.o.clip) : ex.contours[0];
    for (const jn of joins) {
      // a join only where enough of its stroke reaches out of the one it meets to pull back (not the
      // short arm of a heavy z, all but buried in the diagonal)
      if (stencilPieces(contour, [stencilCut(ex, jn, m.s * 0.1, true, isBar(st.o.part))], 0, m.s, Math.min(...ex.thickness), []).off === null) continue;
      const { v } = gapOf(m, jn.id, isBar(st.o.part), opens.has(jn.id));
      marks.push({ type: 'join', x: jn.x, y: jn.y, id: jn.id, v, dx: jn.nx, dy: jn.ny });
    }
    for (const tn of turns[si]) {
      const { nx, ny } = turnKeep(tn);
      marks.push({ type: 'join', x: tn.x, y: tn.y, id: tn.id, v: m.p.joinGaps?.[tn.id] ?? 0, dx: nx, dy: ny });
    }
  });
  return turns;
}

/** A ring's outline (a stroke whose centerline closes round, as an O's can) and its hole, for the counters.
    `w` is the stroke's weight, which the corners a stencil cuts round by. */
function ringOutline(ex: Expanded, m: Metrics, w: number): { cmds: Cmd[]; hole: Cmd[] | null } {
  let cmds: Cmd[] = [];
  const [a, c] = ex.contours;
  const outerIsA = Math.abs(signedArea(a)) >= Math.abs(signedArea(c));
  const outer = outerIsA ? a : c, inner = outerIsA ? c : a;
  // a stencilled ring is split down the middle into two halves
  let xl = Infinity, xr = -Infinity;
  for (const q of outer) { xl = Math.min(xl, q.x); xr = Math.max(xr, q.x); }
  // as wide as the gaps at its joins, but at most leaving each half half its side's width, so a heavy ring isn't cut away
  let il = Infinity, ir = -Infinity;
  for (const q of inner) { il = Math.min(il, q.x); ir = Math.max(ir, q.x); }
  const cx = (xl + xr) / 2, g = m.gap && m.gap / joinGap(1, m.s) * Math.min(joinGap(1, m.s), (xr - xl + ir - il) / 2);
  if (g) {
    // each half is cut as one piece of ink, the hole with the ring, so its cut corners round the ink
    const ring = [wind(outer, 1), wind(inner, -1)], drawn = new Set(ring.flat());
    for (const pl of [{ x: cx - g / 2, y: 0, nx: 1, ny: 0 }, { x: cx + g / 2, y: 0, nx: -1, ny: 0 }]) {
      for (const q of splitPoly(ring, pl)) { const c = finish(cutRound(m, q, drawn, w), signedArea(q) < 0 ? -1 : 1, 0); if (c) cmds = cmds.concat(c); }
    }
  } else {
    const o1 = finish(outer, 1, 0), i1 = finish(inner, -1, 0);
    if (o1) cmds = cmds.concat(o1);
    if (i1) cmds = cmds.concat(i1);
  }
  return { cmds, hole: finish(inner, -1, 0) };
}

/** Build glyph `id` from the glyph table, for the character `ch` it is drawn for. The id is the character, or
    the character and the form it draws ('a.alt', 't.sw', 'S.scr'): only a plain capital's id ('S', not
    'S.scr') takes the swash end Swash capitals curls out. */
export function buildGlyph(id: string, m: Metrics, ch = id): Glyph | null {
  const def = glyphDefOf(id);
  if (!def) return null;
  const b = new Builder(m);
  const hooks = new Set<string>(), plains = new Set<string>(), homes = new Map<string, Pt>(), W0 = def.fn(b, m);
  if (m.p.bowlForm === 'box') boxQuarters(b, m);
  weighFillets(b, m);
  markTurns(b, m);
  const grow = stretchTerminals(b, m, W0, hooks, plains, homes, /^[A-Z]$/.test(id)), W = W0 + grow.r;
  const facing = m.ctx.serif ? faceSerifs(b, m) : null;
  const cups = m.ctx.serif?.cup ? cupSerifs(b, m, facing) : null;
  const code = id.charCodeAt(0);
  const ctx = wobbleSkeleton(b, m, code, homes);
  const out = {
    ch, strokes: [] as GlyphStroke[], serifs: [] as Cmd[][], serifAt: [] as SerifPlace[], counters: [] as Cmd[][], marks: b.marks.slice(),
    corners: [] as Pt[], skeleton: [] as Pt[][], meta: def.meta, bodyW: W
  };
  // expand every stroke first: a stencil cut needs to know which stroke each join runs into
  const exps = b.strokes.map((st, si) => {
    if (st.poly) return null;
    const o = st.o;
    const serifS = m.serif && !!o.serifS && !o.scale, serifE = m.serif && !!o.serifE && !o.scale;
    const so = { ...o };
    if (serifS && so.s === 'term') so.s = 'flat';
    if (serifE && so.e === 'term') so.e = 'flat';
    const f = strokeWt(m, si), pen = f === 1 ? ctx : { ...ctx, thick: ctx.thick * f, thin: ctx.thin * f };
    return { ex: expandStroke(st.cmds!, so, pen), serifS, serifE, so, pen };
  });
  const expanded = exps.map(x => x?.ex ?? null);
  // each stroke clipped here, before its corners are found, so the corners its clip leaves (the top left
  // of an N, where the diagonal is cut off at the stem) are the ones rounded, and drawn so
  const clipMade = new Set<Pt>();
  b.strokes.forEach((st, si) => {
    const ex = exps[si]?.ex;
    if (!ex || ex.loop || !st.o.clip) return;
    const own = new Set(ex.contours[0]);
    ex.contours[0] = clipPoly(ex.contours[0], st.o.clip);
    for (const p of ex.contours[0]) if (!own.has(p)) clipMade.add(p);
  });
  endCorners(b, m, exps, out.marks, clipMade);
  for (const poly of joinCorners(b, m, exps, out.marks)) b.strokes.push({ poly, o: { part: 'fillet' } });
  // stencil every stroke first, so a fillet rounding a join (a square-joined bowl into its stem)
  // goes when the stencil cuts that join, like the fillets Roundness adds: there is no join left to round
  const outlines = b.strokes.map((st, si) => st.poly ?? exps[si]?.ex?.contours[0] ?? null);
  // a crossbar's own gap, or one a letter gives a join or turn, opens it with Stencil off
  const opened = (m.p.barGap > 0 && m.p.barEnds !== 'through') || Object.values(m.p.joinGaps ?? {}).some(v => v > 0);
  const turns = markJoins(b, m, exps, expanded, out.marks);
  const through = barsThrough(b, expanded, m);
  const stencilled = b.strokes.map((st, si) => {
    const ex = exps[si]?.ex;
    if (!(m.gap || opened) || !ex || ex.loop || through?.bars.has(si)) return null;
    // (clipped again, as the outlines are below: the stencilled pieces are drawn in their place)
    const contour = st.o.clip ? clipPoly(ex.contours[0], st.o.clip) : ex.contours[0], t = Math.min(...ex.thickness);
    const cuts = stencilCuts(si, expanded, m, isBar(st.o.part)), others = outlines.map((q, j) => (j === si || b.strokes[j].o.part === 'fillet' ? null : q));
    const open = turns[si].flatMap(tn => { const v = m.p.joinGaps?.[tn.id] ?? 0; return v > 0 ? [{ ...tn, gap: joinGap(v, m.s) }] : []; });
    const tp = open.length ? turnPieces(st.cmds!, exps[si]!.so, exps[si]!.pen, open, cuts, m, t, others) : null;
    if (tp) return { drawn: tp.drawn, cuts, pieces: tp.pieces, off: 0 };
    return { drawn: new Set(contour), cuts, ...stencilPieces(contour, cuts, m.gapOff, m.s, t, others) };
  });
  const filletCut = (poly: Pt[]) => {
    // a bar run through the strokes it met no longer meets them: no join left to round
    if (through?.at.some(j => poly.some(q => Math.hypot(q.x - j.x, q.y - j.y) < m.s))) return true;
    for (const sc of stencilled) {
      if (sc && sc.off !== null && sc.cuts.some(cut => poly.some(q => Math.hypot(q.x - cut.x, q.y - cut.y) < m.s))) return true;
    }
    return false;
  };
  let leanL = 0, leanR = 0;
  // how far the diamonds reaching out the way a neighbour's reach in go: a foot's to the left, a head's to the right
  const outward = { l: Infinity, r: -Infinity };
  // the ends a stencil gap took away with the stroke past it
  const lost = new Set<string>();
  b.strokes.forEach((st, si) => {
    const o = st.o; let cmds: Cmd[] = [];
    if (st.poly) {
      if (!(o.part === 'fillet' && filletCut(st.poly))) { const c = finish(st.poly, 1, 0); if (c) cmds = c; }
      // (every poly stroke is named: a dot, a fillet or a blob)
      out.strokes.push({ part: o.part!, cmds, curved: false, dot: o.part === 'dot' });
      return;
    }
    const { ex, serifS, serifE } = exps[si]!;
    if (!ex) return;
    const R = m.R * (o.scale || 1) * strokeWt(m, si);
    if (ex.loop) {
      const ring = ringOutline(ex, m, m.s * (o.scale || 1) * strokeWt(m, si));
      cmds = ring.cmds;
      if (ring.hole) out.counters.push(ring.hole);
    } else {
      let pieces = [ex.contours[0]];
      // clipped again, as the outlines are drawn: on a slanted half-plane (the legs of K, k and y), float
      // noise leaves the cut edge's points either side of the line, so this adds a point on that edge, and
      // leaving it out would change those letters' outlines
      if (o.clip) pieces = [clipPoly(pieces[0], o.clip)];
      const sc = stencilled[si];
      if (sc) {
        const drawn = sc.drawn;
        pieces = sc.pieces.map(q => cutRound(m, q, drawn, m.s * (o.scale || 1) * strokeWt(m, si)));
      }
      const bar = through?.bars.get(si);
      if (bar) pieces = [bar];
      // under a diamond serif the stem's end is cut off on a slant, the diamond standing on it
      for (const end of ex.ends) {
        if (!(end.which === 's' ? serifS : serifE) || !diamondEnd(end, ctx)) continue;
        const face = facing?.get(`${si}${end.which}`), sides = face ? face.sides : (end.which === 's' ? o.serifS : o.serifE) ?? null;
        if (sides) { const cut = diamondCut(end, ctx, sides); pieces = pieces.flatMap(q => cut.flatMap(pl => splitPoly([q], pl))); }
      }
      for (const [y0, y1] of through?.bands.get(si) ?? []) {
        // a wide gap leaves no sliver of the stroke past it (the foot of an A's leg), nor the serif on its end
        const cut = pieces.flatMap(q => [...splitPoly([q], { x: 0, y: y1, nx: 0, ny: -1 }), ...splitPoly([q], { x: 0, y: y0, nx: 0, ny: 1 })]);
        pieces = cut.filter(q => Math.max(...q.map(p => p.y)) - Math.min(...q.map(p => p.y)) >= m.s * 0.35);
        for (const end of ex.ends) {
          const past = (p: Pt) => (end.y < y0 ? p.y < y0 : end.y > y1 && p.y > y1) && Math.abs(p.x - end.x) < end.t;
          if (!pieces.some(q => q.some(past))) lost.add(`${si}${end.which}`);
        }
      }
      for (const q of pieces) { const c = finish(q, 1, R, out.corners); if (c) cmds = cmds.concat(c); }
      if (o.counter) out.counters.push(finish(ex.skeleton.flat(), 1, 0) || []);
    }
    out.strokes.push({ part: o.part || 'stroke', cmds, curved: ex.curved, horizontal: isHorizontal(st.cmds!), id: String(si) });
    ex.skeleton.forEach(r => out.skeleton.push(r));
    for (const end of ex.ends) {
      // an end pulled back from the stroke it lies in leaves its serif behind with it
      const want = (end.which === 's' ? serifS : serifE) && !lost.has(`${si}${end.which}`) && !(stencilled[si]?.off != null && stencilled[si]!.cuts.some(c => c.own && Math.hypot(c.x - end.x, c.y - end.y) < 1));
      if (want) {
        const key = `${si}${end.which}`, face = facing?.get(key), sides = face ? face.sides : (end.which === 's' ? o.serifS : o.serifE) ?? null;
        const sp = sides && buildSerif(end, sides, ctx, o.serifScale, cups?.get(key), face?.inward);
        const c = sp && finish(sp, 1, m.R * 0.5); if (c) { out.serifs.push(c); out.serifAt.push(serifPlace(end)); }
        const foot = serifPlace(end) === 'foot', xs = sp ? sp.map(q => q.x) : [];
        if (sp && diamondEnd(end, ctx) && sides === (foot ? 'a' : 'b')) { if (foot) outward.l = Math.min(outward.l, ...xs); else outward.r = Math.max(outward.r, ...xs); }
        // a serif leaning out past the end of its arm takes the room it reaches into from the side bearing
        if (sp && ctx.serif!.armLean && serifPlace(end) === 'arm') {
          const dir = Math.sign(end.dx), past = Math.max(0, ...sp.map(q => (q.x - end.x) * dir));
          if (dir < 0) leanL = Math.max(leanL, past - end.x); else leanR = Math.max(leanR, end.x + past - W);
        }
      }
      const term = `${si}${end.which}`, id = plains.has(term) ? term : `p${term}`;
      if (!want && end.type === 'term') {
        const home = homes.get(term);
        out.marks.push({ type: 'terminal', x: end.x, y: end.y, r: end.t * 0.5, id: term, ...(hooks.has(term) && { hook: true }), ...(home && { home }) });
      } else if (plains.has(id)) {
        // a plain or serifed end keeps where it is drawn unless it has a length of its own, like a hook's tip
        const home = homes.get(id);
        out.marks.push({ type: 'end', x: end.x, y: end.y, r: end.t * 0.5, id, hook: true, ...(home && { home }) });
      }
    }
  });
  b.counters.forEach(pts => { const c = finish(pts, 1, 0); if (c) out.counters.push(c); });

  // cursive strokes that reach past the body get most of the room they need, so they
  // touch the neighbouring letter instead of running through it
  const padL = Math.max(0, -b.reachL - m.sb * 1.3), padR = Math.max(0, b.reachR - W - m.sb * 1.3);
  const sbf = b.sb ?? def.sb;
  let lsb = m.sb * sbf[0] + padL + grow.l + leanL, rsb = m.sb * sbf[1] + padR + leanR;
  if (ctx.serif?.shape === 'diamond') [lsb, rsb] = clearStems(out, W, lsb, rsb, m, outward);
  return placeGlyph(out, W, lsb, rsb, code, m, !!b.joins);
}

/** Side bearings that keep a letter's ink clear of the stems beside it. A blackletter is packed so close
    (its tracking tight, a diamond under each stem reaching into the next letter's room) that an arm or
    a leg reaching out past the body, the flag of an r, the leg of a k, would run into the next letter's stem:
    each side leaves at least a fifth of a stroke between its ink and a neighbouring stem standing a
    side bearing in. A stem's own diamonds clear it already, as the head reaches left at the top and
    the foot right at the bottom, past the neighbour's. One reaching the other way (`outward`: the foot of a B's
    stem, its bowl running out to the right) meets the neighbour's coming in, so it keeps a whole side bearing
    clear of that letter's edge, where a diamond reaching into the room it leaves stops a fifth of a stroke short. */
function clearStems(out: Unplaced, W: number, lsb: number, rsb: number, m: Metrics, outward: { l: number; r: number }): [number, number] {
  let x0 = Infinity, x1 = -Infinity, at = { x: 0, y: 0 };
  const see = (x: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); };
  for (const c of [...out.strokes.flatMap(st => st.cmds), ...out.serifs.flat()]) {
    if (c[0] === 'C') {
      const P = [at, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }];
      for (let i = 1; i <= 8; i++) see(cubicAt(P, i / 8).x);
      at = P[3];
    } else if (c[0] !== 'Z') { at = { x: c[c.length - 2] as number, y: c[c.length - 1] as number }; see(at.x); }
  }
  if (x0 > x1) return [lsb, rsb];
  const room = m.sb - m.s * 0.2 + m.track;
  return [Math.max(lsb, -x0 - room, -outward.l + m.sb + m.track), Math.max(rsb, x1 - W - room, outward.r - W + m.sb + m.track)];
}

export type Unplaced = Omit<Glyph, 'lsb' | 'rsb' | 'adv' | 'M' | 'cmds' | 'd'>;

/** A block letter (see blocks.ts): its outlines rounded corner by corner, Roundness rounding the outer
    corners and the ends of arms and slots, Joins the small rounds inside, then placed like any glyph.
    A lowercase letter is its capital, drawn as a small capital at the x-height. Null when the
    character has no block shape. */
export function buildBlock(ch: string, m: Metrics): Glyph | null {
  const e = m.p, small = ch !== ch.toUpperCase();
  const b = blockRings(ch, blockDims(small ? m.xh : m.cap, e), { o: e.roundness, e: Math.min(1, e.roundness), i: Math.min(2, e.joinRound * 2) });
  if (!b) return null;
  const code = ch.charCodeAt(0);
  let rings = b.rings;
  if (m.wob > 0) {
    const wb = wobbler(code, m);
    rings = rings.map(r => r.map(q => { const [x, y] = wb.pt(q.x, q.y); return { ...q, x, y }; }));
  }
  // blocks sit close: at the middle of Side margins a thirtieth of the cap height each side
  const sb = m.cap * (0.004 + 0.06 * e.sideBearing);
  const out: Unplaced = {
    ch, strokes: [{ part: 'stem', cmds: rings.flatMap(r => roundContour(r, 0)), curved: true, id: '0' }], serifs: [], serifAt: [],
    counters: rings.slice(rings.length - b.holes).map(r => roundContour(r, 0)), marks: [], corners: [], skeleton: [], meta: {}, bodyW: b.W
  };
  return placeGlyph(out, b.W, sb, sb, code, m);
}

/** Place a glyph drawn `W` wide between side bearings lsb and rsb: rotation, monospacing, the pixel grid,
    playful bounce and hand jitter, slant, then the slice and the fills, which run on its final outline. */
export function placeGlyph(out: Unplaced, W: number, lsb: number, rsb: number, code: number, m: Metrics, joined = false): Glyph {
  const turn = m.rot ? turnAbout(out, m.rot) : null;
  if (turn) { lsb += turn.grow; rsb += turn.grow; }
  // mirrored, the letter's margins change sides with it
  const flip = m.p.mirror === 'mirrored';
  if (flip) [lsb, rsb] = [rsb, lsb];
  let sx = 1, adv = Math.max(10, lsb + W + rsb);
  const mono = m.p.mono;
  if (mono > 0) {
    // wide letters are squeezed a little, narrow ones centred in the shared width
    const T = m.monoAdv;
    sx = lerp(1, clamp(T * 0.94 / adv, 0.62, 1), mono);
    adv = lerp(adv, T, mono);
    lsb = lerp(lsb, (adv - W * sx) / 2, mono);
    rsb = adv - lsb - W * sx;
  }
  if (m.cell && m.p.fill !== 'lines') {
    // pixels and dots: whole cells, with the letter centred in its cells
    const snapped = Math.max(m.cell, Math.round(adv / m.cell) * m.cell);
    lsb += (snapped - adv) / 2; rsb += (snapped - adv) / 2; adv = snapped;
  }
  // a shadow takes its own room on the right, so it doesn't run into the next letter
  if (m.p.fill === 'shadow') { const sh = shadowShift(m.s, m.p.module).dx; rsb += sh; adv += sh; }
  let M: Mat = flip ? [-sx, 0, 0, 1, lsb + W * sx, 0] : [sx, 0, 0, 1, lsb, 0];
  if (turn) M = mulM(M, turn.M);
  // (a joined-up letter isn't tipped or lifted: its joins would no longer meet its neighbours')
  const bounce = joined ? 0 : m.p.bounce, wob = joined ? 0 : m.wob;
  if (bounce > 0 || wob > 0) {
    const a = (hash(code, 1) - 0.5) * 2 * (0.11 * bounce + 0.05 * wob);
    const dy = (hash(code, 2) - 0.5) * 2 * (38 * bounce + 18 * wob);
    const k = 1 + (hash(code, 3) - 0.5) * 0.1 * wob;
    const cx = adv / 2, cy = m.xh / 2, c = Math.cos(a) * k, s = Math.sin(a) * k;
    M = mulM([c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy + dy], M);
  }
  if (m.slant) M = mulM([1, 0, m.slant, 1, -m.slant * m.xh * 0.4, 0], M);
  const tf = (c: Cmd[]) => transformCmds(c, M);
  const tp = <T extends Pt>(p: T): T => { const q = applyM(M, p.x, p.y); return { ...p, x: q[0], y: q[1] }; };
  out.strokes.forEach(s => s.cmds = tf(s.cmds));
  const serifs = out.serifs.map(tf);
  let cmds = [...out.strokes.flatMap(s => s.cmds), ...serifs.flat()];
  if (m.sliceH) cmds = slice(cmds, m.sliceY - m.sliceH / 2, m.sliceY + m.sliceH / 2, m.sliceRound, m.s, m.s * 0.35);
  const skeleton = out.skeleton.map(r => r.map(tp));
  if (m.p.fill !== 'solid') {
    cmds = fillOutline(cmds, { fill: m.p.fill, cell: m.cell, line: lerp(6, 48, m.p.module), roundness: m.p.roundness, size: m.p.module,
      // an entry or exit stroke reaches out of the letter's own room into its neighbour's, between
      // the baseline and the x-height (a tail or an overhanging f goes below or above it)
      stem: m.s, thick: m.tDir, skeleton, joins: p => (p.x < 0 || p.x > adv) && p.y > 0 && p.y < m.xh });
  }
  return {
    ...out, serifs, counters: out.counters.map(tf),
    marks: out.marks.map(k => k.home ? { ...tp(k), home: tp(k.home) } : tp(k)), corners: out.corners.map(tp), skeleton,
    lsb, rsb, adv, M, cmds, d: cmdsToD(cmds)
  };
}

/** Turning a letter `a` radians clockwise about the middle of its ink, and how much wider (or, negative,
    narrower) the turned ink is on each side, so it keeps the gaps to its neighbours it had upright. */
function turnAbout(out: Unplaced, a: number): { M: Mat; grow: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of [...out.strokes.flatMap(s => s.cmds), ...out.serifs.flat()]) {
    for (let i = 1; i < c.length; i += 2) {
      x0 = Math.min(x0, c[i]); x1 = Math.max(x1, c[i]); y0 = Math.min(y0, c[i + 1]); y1 = Math.max(y1, c[i + 1]);
    }
  }
  if (x0 > x1) return null;
  const cos = Math.cos(a), sin = Math.sin(a), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0;
  return {
    M: [cos, -sin, sin, cos, cx - cos * cx - sin * cy, cy + sin * cx - cos * cy],
    grow: (Math.abs(w * cos) + Math.abs(h * sin) - w) / 2
  };
}

/** A letter drawn by hand: its outline as it is, with no parts for the controls to find. */
export function drawnGlyph(ch: string, drawn: Drawn): Glyph {
  const cmds = drawnCmds(drawn.contours);
  return {
    ch, strokes: [{ part: 'drawn', cmds, curved: false }], serifs: [], serifAt: [], counters: [], marks: [], corners: [], skeleton: [], meta: {},
    bodyW: drawn.adv, lsb: 0, rsb: 0, adv: drawn.adv, M: [1, 0, 0, 1, 0, 0], cmds, d: cmdsToD(cmds), drawn
  };
}
