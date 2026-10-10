/* Stencil gaps: where a stroke ends in another (its host) it is cut back so a gap opens between the
   two, parallel to the host; crossbars with Gap 'through' run on through the strokes they cross, which
   are cut free above and below them; and a turn can come apart like two strokes joined. Used by
   buildGlyph (glyph.ts) after the strokes are expanded. */
import { barCut, joinGap } from '../params';
import { clamp, clipPoly, lerpP, signedArea, splitPoly } from './geom';
import { expandStroke, type Expanded } from './stroke';
import type { Cmd, HalfPlane, PenCtx, Pt, StrokeOpts } from './types';
import type { Builder, Metrics } from './font';
import { turnsOf } from './corners';
import { inPoly } from './joins';

export function isHorizontal(cmds: Cmd[]) {
  if (cmds.length !== 2 || cmds[1][0] !== 'L') return false;
  return Math.abs(cmds[1][2] - cmds[0][2]) < Math.abs(cmds[1][1] - cmds[0][1]) * 0.2;
}

/* Stencil: where stroke i joins another stroke (its host), cut it back so a gap opens between
   the two. The cut runs parallel to the host at the point where the join lands. Moved `off` out
   from the host, the gap slides further along the stroke, still parallel to the host so every gap
   keeps the angle it has at its join (upright by a stem, level by a bar), and a stub of the stroke
   stays on the host: the far side kept and the near side too. When two strokes end in each other
   (the waist of a 3), only the later one is cut. */
interface Host { score: number; j: number; px: number; py: number; tx: number; ty: number; half: number; atEnd: boolean }
/** Where stroke i ends in another stroke (its host): the join's id (see isJoinId), the join end
    (x, y), and (nx, ny), the way a gap there opens, away from the host. `lies`: the end isn't drawn
    as a join but lies inside the host (the top arm of an F over its stem), which Stencil leaves whole. */
interface Join { id: string; x: number; y: number; nx: number; ny: number; bj: Host; lies: boolean;
  /** the way into the stroke from its end, and its thickness there */ ix: number; iy: number; t: number }
/** One join's cut, its gap `off` out and `gap` wide (times `k` when the letter sets it on its own,
    `own`, so a gap too wide for the stroke can be narrowed). `back` is the host's far edge, which the
    stub left on the host stops at: a stroke meeting its host at a slant (the arm of a y) runs on
    through it and would poke out the other side. `across(off)`: the stroke still crosses the gap
    moved `off` out steeply enough for it to cut across the stroke. */
interface StencilCut {
  x: number; y: number; host: number; nx: number; ny: number; back: HalfPlane; own: boolean;
  /** how far up its Gap scale an `own` gap is set */ v: number;
  at: (off: number, k?: number) => { far: HalfPlane; near: HalfPlane | null }; across: (off: number) => boolean;
}
export function strokeJoins(i: number, exps: (Expanded | null)[]): Join[] {
  const ex = exps[i]!, own = ex.skeleton.flat(), out: Join[] = [];
  const cx = own.reduce((a, q) => a + q.x, 0) / own.length, cy = own.reduce((a, q) => a + q.y, 0) / own.length;
  for (const end of ex.ends) {
    const lies = end.type !== 'join';
    let best: Host | null = null;
    for (let j = 0; j < exps.length; j++) {
      const h = exps[j];
      if (!h || j === i || (lies && h.loop)) continue;
      const pts = h.skeleton.flat();
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], c = pts[k + 1], dx = c.x - a.x, dy = c.y - a.y, l2 = dx * dx + dy * dy;
        if (l2 < 1e-9) continue;
        const t = clamp(((end.x - a.x) * dx + (end.y - a.y) * dy) / l2);
        const px = a.x + dx * t, py = a.y + dy * t, d = Math.hypot(end.x - px, end.y - py), half = h.thickness[k] / 2;
        if (d > half + 1) continue;
        const atEnd = (k === 0 && t < 0.01) || (k + 2 === pts.length && t > 0.99);
        const score = d / (half + 1) + (atEnd ? 1 : 0), l = Math.sqrt(l2);
        if (!best || score < best.score) best = { score, j, px, py, tx: dx / l, ty: dy / l, half, atEnd };
      }
    }
    if (!best) continue;
    const bj = best;
    if (bj.atEnd && bj.j > i && exps[bj.j]!.ends.some(e => (lies || e.type === 'join') && Math.hypot(e.x - end.x, e.y - end.y) < 1)) continue;
    let nx = -bj.ty, ny = bj.tx;
    const side = (cx - bj.px) * nx + (cy - bj.py) * ny;
    if (Math.abs(side) < 1) continue;
    if (side < 0) { nx = -nx; ny = -ny; }
    out.push({ id: `${i}${end.which}`, x: end.x, y: end.y, nx, ny, bj, lies, ix: -end.dx, iy: -end.dy, t: end.t });
  }
  return out;
}
/** The joins Stencil opens: a stroke joined at both ends (the bar of an H, an A or an e) is cut at
    one end only, so its gap moves the way every other gap does, rightwards (down an upright stroke),
    not in from both ends at once. A bowl joined twice to its stem (a P) keeps both: they move the same way. */
export function stencilOpens(joins: Join[]): Set<string> {
  const lead = (c: Join) => c.nx - c.ny * 0.5, drawn = joins.filter(c => !c.lies);
  return new Set(drawn.filter(c => !drawn.some(k => k !== c && k.nx * c.nx + k.ny * c.ny < -0.3 && lead(k) > lead(c))).map(c => c.id));
}
/** `square`: cut straight across the stroke instead (a crossbar made shorter), where both its edges are clear of the host. */
export function stencilCut(ex: Expanded, jn: Join, gap: number, own: boolean, square = false, v = 1): StencilCut {
  const { bj, nx, ny } = jn, end = jn;
  if (square) {
    const l = Math.hypot(jn.ix, jn.iy) || 1, dx = jn.ix / l, dy = jn.iy / l, dn = dx * nx + dy * ny;
    if (dn > 0.2) {
      // how far in from the end each edge of the stroke leaves the host's far side
      const clear = Math.max(...[1, -1].map(o => {
        const qx = end.x - dy * o * jn.t / 2, qy = end.y + dx * o * jn.t / 2;
        return (bj.half - ((qx - bj.px) * nx + (qy - bj.py) * ny)) / dn;
      }));
      const at = (d: number) => ({ x: end.x + dx * d, y: end.y + dy * d });
      return { x: end.x, y: end.y, host: bj.j, nx, ny, own, v, back: { ...at(0), nx: -dx, ny: -dy }, across: () => true,
        at: (o, k = 1) => ({ far: { ...at(clear + o + gap * (own ? k : 1)), nx: -dx, ny: -dy }, near: o > 0 ? { ...at(clear + o), nx: dx, ny: dy } : null }) };
    }
  }
  const at = (d: number) => ({ x: bj.px + nx * d, y: bj.py + ny * d });
  // kept parallel to the host, a gap moved out cuts across the stroke only where the stroke leaves
  // the host steeply: the arch of an n soon does, but a straight arm meeting it at a slant (the
  // arm of a y) never does, and a gap on it would run down its length, so it stays at the join
  const across = (o: number) => {
    const d = bj.half + o + gap / 2, dist = (q: Pt) => (q.x - bj.px) * nx + (q.y - bj.py) * ny;
    let best = Infinity, steep = false;
    for (const line of ex.skeleton) for (let k = 0; k + 1 < line.length; k++) {
      const a = line[k], c = line[k + 1], da = dist(a) - d, dc = dist(c) - d;
      if (da * dc > 0) continue;
      const l = Math.hypot(c.x - a.x, c.y - a.y), near = Math.hypot((a.x + c.x) / 2 - end.x, (a.y + c.y) / 2 - end.y);
      if (l < 1e-9 || near > best) continue;
      best = near; steep = Math.abs(dc - da) / l > 0.6;
    }
    return steep;
  };
  return { x: end.x, y: end.y, host: bj.j, nx, ny, own, v, back: { ...at(-bj.half), nx: -nx, ny: -ny }, across,
    at: (o, k = 1) => ({ far: { ...at(bj.half + o + gap * (own ? k : 1)), nx: -nx, ny: -ny }, near: o > 0 ? { ...at(bj.half + o), nx, ny } : null }) };
}
/** The gap at one join of a stroke that is a crossbar (`bar`, cut square when its gap is set) or not, on the join's own Gap scale: the
    letter's own gap there, else the crossbars' Gap, else Stencil's where it opens one (`opens`). `own`:
    it is set for this join or this kind of stroke, so it narrows to fit a short stroke rather than go. */
export function gapOf(m: Metrics, id: string, bar: boolean, opens: boolean) {
  const v = m.p.joinGaps?.[id];
  if (v != null) return { v, own: true };
  if (bar && m.p.barGap > 0 && m.p.barEnds !== 'through') return { v: m.p.barGap, own: true };
  return { v: opens ? m.gap / joinGap(1, m.s) : 0, own: false };
}
export const isBar = (part?: string) => part === 'crossbar' || part === 'bar';

/* Crossbars run through (Ends: Through): a level crossbar runs on past each stroke its ends meet, out
   to that stroke's outside edge, where it is cut square, and the strokes it meets are cut across above
   and below it, the Gap from it, so the bar stands free between their pieces (a stencil A). `bars`: the
   bars' new outlines, by stroke; `bands`: the levels cut out of the strokes they meet; `at`: the joins. */
interface Through { bars: Map<number, Pt[]>; bands: Map<number, [number, number][]>; at: Pt[] }
export function barsThrough(b: Builder, exps: (Expanded | null)[], m: Metrics): Through | null {
  const cut = barCut(m.p.barGap, m.s);
  if (m.p.barEnds !== 'through' || !(cut > 0)) return null;
  const out: Through = { bars: new Map(), bands: new Map(), at: [] };
  b.strokes.forEach((st, si) => {
    const ex = exps[si];
    if (!ex || ex.loop || st.poly || !isBar(st.o.part) || !isHorizontal(st.cmds!)) return;
    // only where the bar ends in a stroke (A H e E F), not where it crosses one or ends free (t f)
    const joins = strokeJoins(si, exps).filter(jn => !jn.lies && !exps[jn.bj.j]!.loop);
    if (!joins.length) return;
    const ys = ex.contours[0].map(q => q.y), y0 = Math.min(...ys), y1 = Math.max(...ys), ym = (y0 + y1) / 2;
    let bar = ex.contours[0];
    for (const jn of joins) {
      // the host's outside edge, at the middle of the bar: the first edge past the join, going out
      const dir = jn.ix < 0 ? 1 : -1, host = exps[jn.bj.j]!.contours[0];
      let edge = jn.x;
      for (let k = 0; k < host.length; k++) {
        const a = host[k], c = host[(k + 1) % host.length];
        if ((a.y <= ym) === (c.y <= ym)) continue;
        const x = a.x + (ym - a.y) / (c.y - a.y) * (c.x - a.x);
        if ((x - jn.x) * dir > 0 && (edge === jn.x || (x - edge) * dir < 0)) edge = x;
      }
      // cut square just inside the end, then drawn out to the edge
      const px = jn.x - dir;
      bar = clipPoly(bar, { planes: [{ x: px, y: 0, nx: dir, ny: 0 }] }).map(q => (Math.abs(q.x - px) < 1e-6 ? { ...q, x: edge, sharp: true } : q));
      (out.bands.get(jn.bj.j) ?? out.bands.set(jn.bj.j, []).get(jn.bj.j)!).push([y0 - cut, y1 + cut]);
      out.at.push({ x: jn.x, y: jn.y });
    }
    out.bars.set(si, bar);
  });
  return out.bars.size ? out : null;
}
/** The cuts on stroke i: at each join, the letter's own gap there (none at 0), else the crossbars' or Stencil's (see gapOf). */
export function stencilCuts(i: number, exps: (Expanded | null)[], m: Metrics, bar: boolean): StencilCut[] {
  const joins = strokeJoins(i, exps), opens = stencilOpens(joins), cuts: StencilCut[] = [];
  for (const jn of joins) {
    const { v, own } = gapOf(m, jn.id, bar, opens.has(jn.id)), gap = joinGap(v, m.s);
    if (gap > 0) cuts.push(stencilCut(exps[i]!, jn, gap, own, bar && own, v));
  }
  return cuts;
}

/** A stroke cut by one join's cut, its gap `off` out: the far side, and the near side when the gap is moved out. */
const cutBy = (q: Pt[], cut: StencilCut, off: number, k = 1) => {
  const { far, near } = cut.at(off, k);
  return [...splitPoly([q], far), ...(near ? splitPoly(splitPoly([q], near), cut.back) : [])];
};

/* A stroke cut at its joins, its gaps moved `off` out. A gap only moves out as far as keeps ink
   past every gap (the rest of an A's bar) and every piece a solid bit of ink, no sliver: on short
   strokes (the middle arm of an E) the gaps stop where they must, or stay at the join. Nor does a gap land where another stroke joins this one (the leg of an R on the foot
   of its bowl): `others` are the other strokes' outlines, by stroke. A stroke too short to leave a
   solid piece past a gap even at the join (the spur of an a) isn't cut at all, unless the letter
   opens a join of its own there: then its gaps narrow to the widest that leaves solid ink. Returns
   the pieces and how far out the gaps went (null: not cut). */
export function stencilPieces(contour: Pt[], cuts: StencilCut[], off: number, s: number, t: number, others: (Pt[] | null)[]): { pieces: Pt[][]; off: number | null } {
  // a piece's narrowest width is about its area over its length; it has to be a good part of a
  // stem's width, or of the stroke's own where that is thinner (a hairline bar)
  const min = Math.min(s * 0.5, t * 0.9);
  const solid = (q: Pt[]) => {
    const xs = q.map(p => p.x), ys = q.map(p => p.y);
    return Math.abs(signedArea(q)) / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= min;
  };
  // the other strokes' outlines as points no further apart than a quarter stem, and those inside this stroke
  const dense = others.map(q => {
    if (!q) return [];
    const pts: Pt[] = [];
    for (let k = 0; k < q.length; k++) {
      const a = q[k], b = q[(k + 1) % q.length], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (s * 0.25));
      for (let j = 0; j < n; j++) pts.push(lerpP(a, b, j / n));
    }
    return pts.filter(p => inPoly(contour, p));
  });
  const clear = (cut: StencilCut, o: number) => {
    const { far, near } = cut.at(o, k);
    const f = (pl: HalfPlane, p: Pt) => (p.x - pl.x) * pl.nx + (p.y - pl.y) * pl.ny;
    // with a quarter stem to spare, so a stroke's corner doesn't just clip the gap
    return dense.every((pts, j) => j === cut.host || pts.every(p => !(f(far, p) > -s * 0.25 && near && f(near, p) > -s * 0.25)));
  };
  // how much of their own width the gaps the letter sets keep
  let k = 1;
  const cutAt = (o: number) => {
    if (o > 0 && !cuts.every(c => c.across(o) && clear(c, o))) return null;
    let pieces = [contour], past = [contour];
    for (const cut of cuts) {
      pieces = pieces.flatMap(q => cutBy(q, cut, o, k));
      past = past.flatMap(q => splitPoly([q], cut.at(o, k).far));
    }
    return past.length && pieces.every(solid) ? pieces : null;
  };
  if (!cuts.length) return { pieces: [contour], off: null };
  let atJoin = null;
  if (cuts.some(c => c.own)) {
    // the gaps the letter sets narrow together, in proportion to their settings, so that the widest
    // would just leave solid ink at the top of its scale: then each keeps widening all the way along
    // its scale rather than stopping where the stroke runs out
    const top = Math.max(...cuts.filter(c => c.own).map(c => c.v));
    k = 1 / top;
    if (!cutAt(0)) {
      let a = 0, b = k;
      for (let n = 0; n < 10; n++) { k = (a + b) / 2; if (cutAt(0)) a = k; else b = k; }
      k = a;
    }
    k *= top;
    if (k > 0.02) atJoin = cutAt(0);
  } else atJoin = cutAt(0);
  if (!atJoin) return { pieces: [contour], off: null };
  // the furthest out the gaps can go, so dragged past it they stay put. Where another stroke
  // joins close to the join (the leg of a K on its arm) the gaps can't sit on it, but can past it
  const lo = s * 0.55;
  if (off < lo) return { pieces: atJoin, off: 0 };
  if (cutAt(off)) return { pieces: cutAt(off)!, off };
  let a = -1, b = off;
  for (let k = 1; k <= 12 && a < 0; k++) { const c = off - (off - lo) * k / 12; if (cutAt(c)) a = c; else b = c; }
  if (a < 0) return { pieces: atJoin, off: 0 };
  for (let k = 0; k < 8; k++) { const c = (a + b) / 2; if (cutAt(c)) a = c; else b = c; }
  return { pieces: cutAt(a)!, off: a };
}

/* A stroke opened at its own turns (the top left of an F, the tops of an M's stems): at each, the
   side running more upright (the earlier one when both lean alike) stays whole, squared off past
   the turn, and the other is pulled back from it by the turn's gap, cut parallel to it, so the
   stroke comes apart there like two strokes joined. */
type Turn = ReturnType<typeof turnsOf>[number];
/** Which side of a turn stays whole (`keepIn`: the side coming in), and (nx, ny), the way its gap opens, away from that side. */
export function turnKeep(tn: Turn) {
  const keepIn = Math.abs(tn.din.ty) >= Math.abs(tn.dout.ty) - 0.05, k = keepIn ? tn.din : tn.dout;
  const cx = keepIn ? tn.dout.tx : -tn.din.tx, cy = keepIn ? tn.dout.ty : -tn.din.ty;
  let nx = -k.ty, ny = k.tx;
  if (nx * cx + ny * cy < 0) { nx = -nx; ny = -ny; }
  return { keepIn, nx, ny };
}
/** The pieces of a stroke opened at the turns `open` (in order along it, each with its gap), and
    the outline points they keep as drawn; each turn's gap narrows to the widest that leaves the
    side pulled back a solid bit of ink. `cuts` are its joins' cuts, made on the piece each is on.
    Null when the stroke can't be drawn in pieces. */
export function turnPieces(cmds: Cmd[], so: StrokeOpts, pen: PenCtx, open: (Turn & { gap: number })[], cuts: StencilCut[], m: Metrics, t: number, others: (Pt[] | null)[]) {
  const bounds = [1, ...open.map(tn => tn.ci), cmds.length];
  const segs: Cmd[][] = bounds.slice(0, -1).map((b, i) => [i ? ['M', open[i - 1].x, open[i - 1].y] : cmds[0], ...cmds.slice(b, bounds[i + 1])]);
  const keeps = open.map(turnKeep);
  // the side kept runs on half its width past the turn, where the turn's outside corner was
  const halfAt = (ex: Expanded, q: Pt) => {
    const pts = ex.skeleton.flat();
    let best = 0, bd = Infinity;
    pts.forEach((p, k) => { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd && ex.thickness[k] != null) { bd = d; best = ex.thickness[k] / 2; } });
    return best;
  };
  const wOf = (c: Cmd) => { const o = c[c[0] === 'C' ? 7 : 3]; return o?.w != null ? { w: o.w, even: true } : {}; };
  const optsOf = (i: number): StrokeOpts => {
    const o: StrokeOpts = { ...so, clip: undefined, s: i ? 'flat' : so.s, e: i < segs.length - 1 ? 'flat' : so.e };
    if (i) delete o.ws;
    if (i < segs.length - 1) delete o.we;
    return o;
  };
  const plain = segs.map((seg, i) => expandStroke(seg, optsOf(i), pen));
  if (plain.some(ex => !ex || ex.loop)) return null;
  open.forEach((tn, i) => {
    const { keepIn } = keeps[i], v = { x: tn.x, y: tn.y };
    if (keepIn) {
      const seg = segs[i], h = halfAt(plain[i]!, v);
      seg.push(['L', tn.x + tn.din.tx * h, tn.y + tn.din.ty * h, wOf(seg[seg.length - 1])]);
    } else {
      const seg = segs[i + 1], h = halfAt(plain[i + 1]!, v);
      seg.splice(0, 1, ['M', tn.x - tn.dout.tx * h, tn.y - tn.dout.ty * h], ['L', tn.x, tn.y, wOf(seg[1])]);
    }
  });
  const exs = segs.map((seg, i) => expandStroke(seg, optsOf(i), pen));
  if (exs.some(ex => !ex || ex.loop)) return null;
  const drawn = new Set<Pt>();
  let parts = exs.map(ex => {
    const c = so.clip ? clipPoly(ex!.contours[0], so.clip) : ex!.contours[0];
    c.forEach(q => drawn.add(q));
    return [c];
  });
  const min = Math.min(m.s * 0.5, t * 0.9);
  const solid = (q: Pt[]) => {
    const xs = q.map(p => p.x), ys = q.map(p => p.y);
    return Math.abs(signedArea(q)) / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1) >= min;
  };
  open.forEach((tn, i) => {
    const { keepIn, nx, ny } = keeps[i], j = keepIn ? i + 1 : i, h = halfAt(exs[keepIn ? i : i + 1]!, tn);
    const cutAt = (gap: number) => parts[j].flatMap(q => splitPoly([q], { x: tn.x + nx * (h + gap), y: tn.y + ny * (h + gap), nx: -nx, ny: -ny }));
    const ok = (ps: Pt[][]) => ps.length > 0 && ps.every(solid);
    let ps = cutAt(tn.gap);
    if (!ok(ps)) {
      let a = 0, b = tn.gap;
      for (let n = 0; n < 10; n++) { const c = (a + b) / 2; if (ok(cutAt(c))) a = c; else b = c; }
      ps = a > tn.gap * 0.02 ? cutAt(a) : parts[j];
    }
    parts[j] = ps;
  });
  // a join's cut falls on the piece whose end the join is
  parts = parts.map((ps, i) => {
    const sk = exs[i]!.skeleton.flat(), ends = [sk[0], sk[sk.length - 1]];
    const mine = cuts.filter(c => ends.some(q => Math.hypot(q.x - c.x, q.y - c.y) < 1));
    return mine.length ? ps.flatMap(q => stencilPieces(q, mine, m.gapOff, m.s, t, others).pieces) : ps;
  });
  return { pieces: parts.flat(), drawn };
}
