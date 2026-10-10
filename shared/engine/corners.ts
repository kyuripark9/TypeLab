/* Corners: the turns of each centerline and the square ends of strokes, each rounded by its own
   roundness (outside and inside), stepped by Steps, or squared off in box bowls. Marked on the skeleton
   before expanding, and cut into the expanded outlines after (endCorners). */
import { clamp, cubicAt, lerp, lerpP, quarter, subCubic } from './geom';
import { innerFloor, type Expanded } from './stroke';
import type { Cmd, Mark, Pt, Tangent, TurnR } from './types';
import { type Builder, type Metrics, quarterK, strokeWt } from './font';
import { innerFor } from './joins';

/* ---- corners
   A corner is where a centerline turns (a turn), or one of the two corners of an end drawn square
   across. Each has a roundness from 0 (sharp) to 1 (round), which a letter can set one by one; a
   turn has two, one for its outside and one for its inside. */

/** The outline radius of one side of a turn at roundness v, in a font whose letters stand `full`
    high (the cap height): all the way, as wide as the letter is high, round enough to take up a
    whole side (it then rounds as far as its sides let it). */
export const turnR = (v: number, full: number) => full * clamp(v) ** 1.5;
/** The roundness of one side of a turn with outline radius r. */
export const turnV = (r: number, full: number) => clamp(r / full) ** (2 / 3);
/** A turn's outline radii as its letter sets them, over those it is drawn with (`drawn`, or a sharp
    corner): the outside by the corner's own roundness, the inside by its own inside roundness, or
    else a stroke tighter than the outside, so the stroke keeps its thickness round the turn. Null
    while the letter sets neither. */
export function ownTurn(m: Metrics, id: string, t: number, drawn: TurnR | null | undefined): TurnR | null {
  const vo = m.p.corners?.[id], vi = m.p.innerCorners?.[id];
  if (vo == null && vi == null) return null;
  const o = vo != null ? turnR(vo, m.cap) : drawn?.o ?? 0;
  return { o, i: vi != null ? turnR(vi, m.cap) : vo != null ? Math.max(0, o - t) : drawn?.i ?? 0 };
}
/** The radius of an end's corner at roundness v: at 1 half the stroke, so the end rounds right off. */
const endCornerR = (v: number, t: number) => v * t / 2;

/** Every turn of a centerline, in order: where a command leaves in another direction than the last
    one arrived, with the index of that command, the point, and the directions in and out. */
export function turnsOf(cmds: Cmd[], m: Metrics) {
  const out: { ci: number; x: number; y: number; din: Tangent; dout: Tangent }[] = [];
  let cur: Pt = { x: 0, y: 0 }, din: Tangent | null = null;
  cmds.forEach((c, ci) => {
    if (c[0] === 'M') { cur = { x: c[1], y: c[2] }; din = null; return; }
    let P: Pt[];
    if (c[0] === 'L') P = [cur, lerpP(cur, { x: c[1], y: c[2] }, 1 / 3), lerpP(cur, { x: c[1], y: c[2] }, 2 / 3), { x: c[1], y: c[2] }];
    else if (c[0] === 'C') P = [cur, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }];
    else if (c[0] === 'hv' || c[0] === 'vh') { const o = c[3] || {}; P = subCubic(quarter(cur.x, cur.y, c[1], c[2], c[0], quarterK(cur, c, m)), o.u0 || 0, o.u1 ?? 1); }
    else return;
    if (Math.hypot(P[3].x - P[0].x, P[3].y - P[0].y) < 0.5) return;
    const a = cubicAt(P, 0), b = cubicAt(P, 1);
    if (din && din.tx * a.tx + din.ty * a.ty < Math.cos(0.2)) out.push({ ci, x: cur.x, y: cur.y, din, dout: a });
    din = b; cur = P[3];
  });
  return out;
}

/** Give every turn of a glyph's strokes its id, the roundness its letter sets for it (as the
    `turn` of the command leaving it), and a mark on the outside of the turn. */
export function markTurns(b: Builder, m: Metrics) {
  b.strokes.forEach((st, si) => {
    if (!st.cmds) return;
    const t = m.s * (st.o.scale || 1) * strokeWt(m, si);
    turnsOf(st.cmds, m).forEach((tn, k) => {
      const id = `${si}t${k}`, c = st.cmds![tn.ci], oi = c[0] === 'C' ? 7 : 3;
      let o = c[oi] || {};
      let turn: TurnR | null = ownTurn(m, id, t, o.turn) ?? o.turn ?? null;
      // Inside corners rounds the inside of every turn at least as far, and Steps cuts a step out of the
      // outside of every square one; a letter can step each of its corners its own way
      const cos = tn.din.tx * tn.dout.tx + tn.din.ty * tn.dout.ty;
      if (m.innerR > 0 && m.p.innerCorners?.[id] == null) turn = { ...turn, o: turn?.o ?? 0, i: Math.max(turn?.i ?? 0, innerFor(m, Math.acos(clamp(-cos, -1, 1)))) };
      const square = Math.abs(cos) < 0.35, sv = m.p.cornerSteps?.[id] ?? (square ? m.p.steps : 0);
      // a point the stroke's clip cuts off (the foot of a V, squared off on the baseline) has no corner left to step
      const ox = tn.din.tx - tn.dout.tx, oy = tn.din.ty - tn.dout.ty, l = Math.hypot(ox, oy) || 1;
      const h = Math.sqrt(Math.max(1e-3, 1 - l * l / 4)), cl = st.o.clip, px = tn.x + ox / l * t / 2 / h, py = tn.y + oy / l * t / 2 / h;
      const cut = !!cl && (py < (cl.y0 ?? -Infinity) - 0.5 || py > (cl.y1 ?? Infinity) + 0.5 || px < (cl.x0 ?? -Infinity) - 0.5 || px > (cl.x1 ?? Infinity) + 0.5);
      if (sv > 0 && !cut) turn = { ...(turn ?? { o: 0, i: 0 }), step: sv };
      if (turn && turn !== o.turn) {
        o = { ...o, turn };
        const nc = c.slice() as Cmd;
        nc[oi] = o;
        st.cmds![tn.ci] = nc;
      }
      // marked where the outside of the turn is drawn: its mitred point, or the middle of its round
      // (sin h: the sine of half the angle inside the turn)
      const ro = o.turn?.o ?? 0, out = t / 2 / h - ro * (1 / h - 1);
      // (at home on the turn itself, which rounding doesn't move, so the corners keep their order)
      b.marks.push({ type: 'corner', id, x: tn.x + ox / l * out, y: tn.y + oy / l * out, v: turnV(ro, m.cap), vi: turnV(Math.max(o.turn?.i ?? 0, innerFloor(ro, t, tn.din.tx * tn.dout.tx + tn.din.ty * tn.dout.ty)), m.cap), st: cut ? undefined : sv, home: { x: tn.x, y: tn.y } });
    });
  });
}

/** Box bowls: every quarter turn (hv, vh) becomes its two straight sides meeting in a corner that
    rounds on the outside and stays square on the inside: by Box corners (boxRound), from sharp
    through as wide as the stroke (at 0.5) to twice the stroke, as far as its sides let it (any wider and
    the stroke would thin to under half its weight across the corner, so the inside would round too).
    A quarter drawn only in part ends on the side its drawn part runs along, as far out as its tip
    reached (as runStraight does); the tip of a hook or tail drawn more than halfway round instead
    finishes the turn, so it keeps its hook, and its mark moves with it. */
/** The outside radius of a box bowl's corner at Box corners v, for a stroke t thick. */
const boxOuter = (v: number, t: number) => 2 * v * t;
export function boxQuarters(b: Builder, m: Metrics) {
  for (const st of b.strokes) {
    if (!st.cmds?.some(c => c[0] === 'hv' || c[0] === 'vh')) continue;
    const out: Cmd[] = [], t = m.s * (st.o.scale || 1);
    let cur: Pt = { x: 0, y: 0 };
    for (const c of st.cmds) {
      if (c[0] === 'Z') { out.push(c); continue; }
      const n = c.length, off = typeof c[n - 1] === 'number' ? 2 : 3, to = { x: c[n - off], y: c[n - off + 1] };
      if (c[0] !== 'hv' && c[0] !== 'vh') { out.push(c); cur = to; continue; }
      const o = c[3] || {}, corner = c[0] === 'hv' ? { x: to.x, y: cur.y } : { x: cur.x, y: to.y };
      const la = Math.hypot(corner.x - cur.x, corner.y - cur.y), lb = Math.hypot(to.x - corner.x, to.y - corner.y);
      if (la < 1 || lb < 1) { out.push(c); cur = to; continue; }
      // the corner turns round half the stroke on its centerline, less where a side is too short
      const r = Math.min(t / 2, la, lb), total = la + lb, ro = Math.min(boxOuter(m.p.boxRound, t), Math.min(la, lb) + t / 2);
      const da = { x: (corner.x - cur.x) / la, y: (corner.y - cur.y) / la }, db = { x: (to.x - corner.x) / lb, y: (to.y - corner.y) / lb };
      const at = (s: number) => s <= la ? { x: cur.x + da.x * s, y: cur.y + da.y * s } : { x: corner.x + db.x * (s - la), y: corner.y + db.y * (s - la) };
      // where the drawn part of the quarter starts and ends along its two sides
      const P = quarter(cur.x, cur.y, to.x, to.y, c[0], quarterK(cur, c, m));
      const place = (u: number, drawnAfter: boolean) => {
        const tip = cubicAt(P, u), mark = b.marks.find(k => (k.type === 'tail' || k.type === 'exit') && Math.hypot(k.x - tip.x, k.y - tip.y) < 1.5);
        if (mark && (drawnAfter ? u < 0.5 : u > 0.5)) return { s: drawnAfter ? 0 : total, mark };
        const s = drawnAfter ? clamp(la + (tip.x - corner.x) * db.x + (tip.y - corner.y) * db.y, la + r, total)
          : clamp((tip.x - cur.x) * da.x + (tip.y - cur.y) * da.y, 0, la - r);
        return { s, mark };
      };
      const start = o.u0 > 0 ? place(o.u0, true) : null, end = o.u1 != null && o.u1 < 1 ? place(o.u1, false) : null;
      const s0 = start?.s ?? 0, s1 = Math.max(s0 + 1, end?.s ?? total), w = o.w != null ? { w: o.w } : {};
      if (s0 > 0) {
        const p = at(s0);
        if (out[out.length - 1]?.[0] === 'M') out[out.length - 1] = ['M', p.x, p.y]; else out.push(['L', p.x, p.y, w]);
        if (start!.mark) { start!.mark.x = p.x; start!.mark.y = p.y; }
      }
      const e = at(s1);
      if (s0 < la && s1 > la) out.push(['L', corner.x, corner.y, w], ['L', e.x, e.y, { ...w, turn: { o: ro, i: Math.max(0, r - t / 2) } }]);
      else out.push(['L', e.x, e.y, w]);
      if (end?.mark) { end.mark.x = e.x; end.mark.y = e.y; }
      cur = to;
    }
    st.cmds = out;
  }
}

/** Whether q is inside polygon poly (even-odd). */
function insidePoly(poly: Pt[], q: Pt) {
  let c = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const a = poly[i], p = poly[k];
    if ((a.y > q.y) !== (p.y > q.y) && q.x < (p.x - a.x) * (q.y - a.y) / (p.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** A corner at q between sides running off along unit directions a and b, rounded r across: where
    the round touches its sides (k along each), its center, and whether a point lies in the cap the
    round cuts off (within the corner, outside the round, on the corner's side of the line between
    where it touches). */
function cornerRound(q: Pt, a: Pt, b: Pt, r: number) {
  const half = Math.acos(clamp(a.x * b.x + a.y * b.y, -1, 1)) / 2, bl = Math.hypot(a.x + b.x, a.y + b.y) || 1;
  const bis = { x: (a.x + b.x) / bl, y: (a.y + b.y) / bl }, k = r / Math.tan(half), h = r / Math.sin(half);
  const C = { x: q.x + bis.x * h, y: q.y + bis.y * h };
  // the insides of the two sides, facing each other
  const na = { x: b.x - a.x * (a.x * b.x + a.y * b.y), y: b.y - a.y * (a.x * b.x + a.y * b.y) }, nb = { x: a.x - b.x * (a.x * b.x + a.y * b.y), y: a.y - b.y * (a.x * b.x + a.y * b.y) };
  const chord = k * Math.cos(half);
  const inCap = (p: Pt) => {
    const dx = p.x - q.x, dy = p.y - q.y;
    return dx * na.x + dy * na.y > -1 && dx * nb.x + dy * nb.y > -1 && dx * bis.x + dy * bis.y < chord - 0.01 && Math.hypot(p.x - C.x, p.y - C.y) > r + 0.01;
  };
  return { k, C, inCap, Ta: { x: q.x + a.x * k, y: q.y + a.y * k }, Tb: { x: q.x + b.x * k, y: q.y + b.y * k } };
}

/** Cut the cap of a round (see cornerRound) out of an outline in place: its sides are cut into short
    steps near the corner, and every point in the cap moves out from the round's center onto it. */
function carveRound(poly: Pt[], q: Pt, round: ReturnType<typeof cornerRound>, r: number) {
  const { C, inCap, Ta, Tb } = round, step = Math.max(1, r / 20);
  const x0 = Math.min(q.x, Ta.x, Tb.x) - 1, x1 = Math.max(q.x, Ta.x, Tb.x) + 1, y0 = Math.min(q.y, Ta.y, Tb.y) - 1, y1 = Math.max(q.y, Ta.y, Tb.y) + 1;
  const out: Pt[] = [];
  let hit = false;
  poly.forEach((p, i) => {
    const n = poly[(i + 1) % poly.length];
    out.push(p);
    if (Math.max(p.x, n.x) < x0 || Math.min(p.x, n.x) > x1 || Math.max(p.y, n.y) < y0 || Math.min(p.y, n.y) > y1) return;
    const steps = Math.ceil(Math.hypot(n.x - p.x, n.y - p.y) / step);
    for (let s = 1; s < steps; s++) out.push({ ...lerpP(p, n, s / steps), smooth: true });
  });
  for (const p of out) {
    if (!inCap(p)) continue;
    const d = Math.hypot(p.x - C.x, p.y - C.y);
    p.x = C.x + (p.x - C.x) * r / d; p.y = C.y + (p.y - C.y) * r / d;
    p.smooth = true; p.sharp = false; delete p.r;
    hit = true;
  }
  if (hit) poly.splice(0, poly.length, ...out);
}

/** The square ends' corners of a glyph's expanded strokes that show: each rounded as its letter sets
    it (or by Roundness), and marked. A corner on the edge of another stroke, or inside it, is hidden
    and left out, unless it sits on a corner of that stroke too (the top left of an E, where the stem
    and the arm both end): then the two are one corner, rounded together under the first one's id.
    A corner whose end's other corner is hidden (the top of a's stem, the other in its bowl) stands
    where the stroke that hides that one runs on from the end: it rounds across every stroke there,
    as far as the ink round it keeps most of its thickness. */
export function endCorners(b: Builder, m: Metrics, exps: ({ ex: Expanded | null } | null)[], marks: Mark[], clipMade: Set<Pt>) {
  const polys = b.strokes.map((st, j) => st.poly ? [st.poly] : exps[j]?.ex?.contours ?? []);
  const inside = insidePoly;
  const edge = (poly: Pt[], q: Pt) => {
    let d = Infinity;
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const a = poly[k], p = poly[i], dx = p.x - a.x, dy = p.y - a.y, l2 = dx * dx + dy * dy;
      const u = l2 ? clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / l2) : 0;
      d = Math.min(d, Math.hypot(q.x - a.x - dx * u, q.y - a.y - dy * u));
    }
    return d;
  };
  const groups: { id: string; t: number; pts: Pt[]; partner: string; at: Pt | undefined }[] = [];
  // whether each end corner shows, by its id
  const shows = new Map<string, boolean>();
  exps.forEach((x, si) => {
    for (const c of x?.ex?.endCorners ?? []) {
      // a corner the stroke's clip cut off isn't drawn
      if (!polys[si].some(poly => poly.includes(c.pt))) continue;
      const q = c.pt, near = groups.find(g => Math.hypot(g.pts[0].x - q.x, g.pts[0].y - q.y) < 1.5), side = c.side === 'l' ? 'r' : 'l';
      shows.set(`${si}${c.which}${c.side}`, true);
      if (near) { near.pts.push(q); continue; }
      let hidden = false;
      const also: Pt[] = [];
      polys.forEach((ps, j) => {
        if (j === si || hidden) return;
        // a loop's outer ring holds its inner one: inside the stroke is inside an odd number of them
        const inStroke = ps.filter(poly => inside(poly, q)).length % 2 === 1;
        for (const poly of ps) {
          if (edge(poly, q) > 1.5) continue;
          const v = poly.find(p => !p.smooth && Math.hypot(p.x - q.x, p.y - q.y) < 1.5);
          if (v) also.push(v); else hidden = true;
        }
        if (!also.length && inStroke) hidden = true;
      });
      if (hidden) { shows.set(`${si}${c.which}${c.side}`, false); continue; }
      groups.push({ id: `${si}${c.which}${c.side}`, t: m.s * (b.strokes[si].o.scale || 1) * strokeWt(m, si), pts: [q, ...also],
        partner: `${si}${c.which}${side}`, at: x!.ex!.endCorners.find(e => e.which === c.which && e.side === side)?.pt });
    }
  });
  const ink = (p: Pt) => polys.some(ps => ps.filter(poly => insidePoly(poly, p)).length % 2 === 1);
  /** For a corner q whose end runs toward its hidden other corner `at`, the directions of the end and
      of the stroke's side from it, and the widest round that fits there. */
  const lone = (q: Pt, at: Pt, t: number) => {
    const al = Math.hypot(at.x - q.x, at.y - q.y);
    if (al < 1) return null;
    const a = { x: (at.x - q.x) / al, y: (at.y - q.y) / al }, poly = polys.flat().find(p => p.includes(q));
    if (!poly) return null;
    const i = poly.indexOf(q), side = (dir: number) => {
      for (let s = 1; s < poly.length; s++) {
        const n = poly[(i + dir * s + poly.length * s) % poly.length], d = Math.hypot(n.x - q.x, n.y - q.y);
        if (d > 1) return { x: (n.x - q.x) / d, y: (n.y - q.y) / d };
      }
      return a;
    };
    const s1 = side(1), s2 = side(-1), bdir = Math.abs(s1.x * a.x + s1.y * a.y) < Math.abs(s2.x * a.x + s2.y * a.y) ? s1 : s2;
    if (Math.abs(bdir.x * a.x + bdir.y * a.y) > 0.9) return null;
    // how deep the ink runs in from p along d, as far as `most`
    const depth = (p: Pt, d: Pt, most: number) => {
      let s = 0.5;
      while (s < most && ink({ x: p.x + d.x * s, y: p.y + d.y * s })) s += t / 12;
      return Math.min(s, most);
    };
    const fits = (r: number) => {
      const rd = cornerRound(q, a, bdir, r), toC = (p: Pt) => { const l = Math.hypot(rd.C.x - p.x, rd.C.y - p.y) || 1; return { x: (rd.C.x - p.x) / l, y: (rd.C.y - p.y) / l }; };
      const da = depth(rd.Ta, toC(rd.Ta), t), db = depth(rd.Tb, toC(rd.Tb), t);
      if (Math.min(da, db) < t * 0.3) return false;
      const need = 0.9 * Math.min(da, db);
      for (let j = 1; j < 10; j++) {
        const u = j / 10, p = { x: lerp(rd.Ta.x, rd.Tb.x, u) - rd.C.x, y: lerp(rd.Ta.y, rd.Tb.y, u) - rd.C.y }, l = Math.hypot(p.x, p.y) || 1;
        const on = { x: rd.C.x + p.x * r / l, y: rd.C.y + p.y * r / l };
        if (depth(on, toC(on), need) < need) return false;
      }
      return true;
    };
    // the widest round that fits: stepped out, then narrowed down between the last fit and the first miss
    let lo = t / 2, hi = lo;
    while (hi < m.cap && fits(hi + t / 4)) hi += t / 4;
    lo = hi; hi = Math.min(m.cap, hi + t / 4);
    for (let n = 0; n < 5 && hi - lo > 1; n++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    return { a, b: bdir, most: lo };
  };
  /** Whether a corner whose end's other corner is hidden has the edge across that end run straight on
      past it along another stroke, so the two draw one side of the letter (D's stem top and its bowl). */
  const runsOn = (g: (typeof groups)[number]) => {
    if (shows.get(g.partner) !== false || !g.at) return false;
    const q = g.pts[0], p = { x: q.x + (g.at.x - q.x) * 1.5, y: q.y + (g.at.y - q.y) * 1.5 };
    return polys.some((ps, j) => j !== +g.id.slice(0, -2) && ps.some(poly => edge(poly, p) < 1.5));
  };
  /** How deep a step the group's corner has room for: 0 unless every stroke's outline turns square
      there (not where a diagonal meets a bar in a point), and none where a stroke's clip cut the corner
      (N's diagonal, cut off at its stem), whose sides can't step back with the rest; otherwise no deeper
      than the shortest side any of them runs along from it, so each stroke steps back alike. */
  const stepRoom = (g: (typeof groups)[number]) => {
    let room = Infinity;
    for (const p of g.pts) {
      if (clipMade.has(p)) return 0;
      const poly = polys.flat().find(q => q.includes(p));
      if (!poly) return 0;
      const n = poly.length, i = poly.indexOf(p), way = (dir: number) => {
        let len = 0, o = p, d0: Pt | null = null;
        for (let k = 1; k < n; k++) {
          const q = poly[(i + dir * k + n * k) % n], l = Math.hypot(q.x - o.x, q.y - o.y);
          if (!d0 && l > 1) d0 = { x: (q.x - p.x) / Math.hypot(q.x - p.x, q.y - p.y), y: (q.y - p.y) / Math.hypot(q.x - p.x, q.y - p.y) };
          len += l; o = q;
          if (!q.smooth) break;
        }
        return { len, d: d0 };
      };
      const a = way(1), c = way(-1);
      if (!a.d || !c.d || Math.abs(a.d.x * c.d.x + a.d.y * c.d.y) > 0.35) return 0;
      room = Math.min(room, 0.95 * a.len, 0.95 * c.len);
    }
    return room >= g.t * 0.25 ? room : 0;
  };
  for (const g of groups) {
    const own = m.p.corners?.[g.id], q = g.pts[0], x = q.x, y = q.y;
    // Steps cuts a step out of a square corner of the letter, where two strokes end together (the foot of
    // an L) or where another stroke runs on flush out of the end (the top of D's stem, its bowl running on to the right)
    const room = stepRoom(g), steppable = room > 0, sv = !steppable ? 0 : m.p.cornerSteps?.[g.id] ?? (g.pts.length > 1 || runsOn(g) ? m.p.steps : 0);
    // (one size for every stroke there, at 1 as deep as it can be: 0.85 of the thinner of the stroke and the bars, so
    // they stay joined, or the room there is)
    if (sv > 0) for (const p of g.pts) p.step = sv * Math.min(0.85 * Math.min(g.t, m.hT), room);
    const alone = shows.get(g.partner) === false && g.at ? lone(q, g.at, g.t) : null;
    if (alone) {
      const r = (own ?? 0) * alone.most;
      if (own != null) {
        if (r >= 0.6) {
          // (from where the corner stood: carving moves its point onto the round)
          const at = { x, y }, rd = cornerRound(at, alone.a, alone.b, r);
          for (const ps of polys) for (const poly of ps) carveRound(poly, at, rd, r);
        } else for (const p of g.pts) { delete p.r; p.sharp = true; }
      }
      marks.push({ type: 'corner', id: g.id, x, y, v: own ?? clamp(m.R / alone.most), st: steppable ? sv : undefined });
      continue;
    }
    if (own != null) {
      const r = endCornerR(own, g.t);
      for (const p of g.pts) { if (r >= 0.6) { p.r = r; p.sharp = false; } else { delete p.r; p.sharp = true; } }
    }
    marks.push({ type: 'corner', id: g.id, x, y, v: own ?? clamp(m.R / (g.t / 2)), st: steppable ? sv : undefined });
  }
}
