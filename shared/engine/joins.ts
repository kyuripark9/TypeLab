/* Joins: the inside corners left where one stroke's outline crosses another's (under the arm of an r,
   beside the crossbar of a t), rounded by Joins with fillets that follow both strokes' edges, and by
   Inside corners in the counters. Run by buildGlyph (glyph.ts) on the expanded strokes. */
import { clamp, clipPoly, cubicAt } from './geom';
import type { Expanded } from './stroke';
import type { Mark, Pt } from './types';
import { type Builder, type Metrics, strokeWt } from './font';

/* ---- joins
   Where one stroke meets another their outlines cross, and each crossing that leaves a corner
   inside the letter (under the arm of an r, beside the crossbar of a t, in the crotch of a y) is a
   corner too: 'j' and its number among the joins of the earlier of the two strokes. A join rounds
   by Joins, or by a roundness its letter gives it, filled in with a fillet that runs along both
   strokes' edges and curves across between them. */

/** How far Inside corners rounds a corner whose inside is `angle` across: all the way at a right angle
    or wider, less and less as it narrows, so a sharp crotch (the arms of a K, an X) doesn't fill in black. */
export const innerFor = (m: Metrics, angle: number) => m.innerR * Math.min(1, angle / (Math.PI / 2)) ** 2;

/** The radius of a join's round at roundness v, in a font with stems `s` thick: two stems at 1. */
export const joinR = (v: number, s: number) => 2 * s * clamp(v);

/** Whether q lies inside the closed polygon `poly` (even-odd). */
export function inPoly(poly: Pt[], q: Pt) {
  let c = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const a = poly[i], p = poly[k];
    if ((a.y > q.y) !== (p.y > q.y) && q.x < (p.x - a.x) * (q.y - a.y) / (p.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Mark every join of a glyph's expanded strokes and return the fillets that round them. A crossing
    counts when one wedge around it is left empty, narrower than a straight line (so not where an
    edge only runs on flush past another, as along the top of an r); the round is as wide as the
    edges on both sides let it be, following them as they curve. */
export function joinCorners(b: Builder, m: Metrics, exps: ({ ex: Expanded | null } | null)[], marks: Mark[]): Pt[][] {
  // a stencil opens the joins up, and a wireframe shows every stroke as drawn
  if (m.gap || m.p.fill === 'wire') return [];
  const rings: Pt[][][] = b.strokes.map((st, si) => {
    if (st.poly) return st.poly.length > 2 ? [st.poly] : [];
    const ex = exps[si]?.ex;
    if (!ex) return [];
    return (ex.loop ? ex.contours : [st.o.clip ? clipPoly(ex.contours[0], st.o.clip) : ex.contours[0]]).filter(c => c.length > 2);
  });
  const boxOf = (pts: Pt[]) => pts.reduce((o, q) => ({ x0: Math.min(o.x0, q.x), x1: Math.max(o.x1, q.x), y0: Math.min(o.y0, q.y), y1: Math.max(o.y1, q.y) }),
    { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  const boxes = rings.map(rs => rs.map(boxOf));
  const inStroke = (si: number, q: Pt) => rings[si].filter((poly, k) => {
    const bx = boxes[si][k];
    return q.x >= bx.x0 && q.x <= bx.x1 && q.y >= bx.y0 && q.y <= bx.y1 && inPoly(poly, q);
  }).length % 2 === 1;
  const inked = (q: Pt, but = -1) => rings.some((_, si) => si !== but && inStroke(si, q));
  /* From the crossing p, on edge k of ring `ring` (stroke si), along the outline one way (dir ±1)
     for up to `want`: the points passed, stopping where it turns off by more than 50 degrees or
     runs into another stroke. Ink is looked for a hair off the edge, toward the empty wedge `bis`
     points into, so an edge another stroke's edge runs along (the waist of a B, where both bowls'
     bars lie) stays clear; and a step that runs into ink goes as far as it can first.
     At a corner of the outline that turns away from the wedge it stops sooner, short of as much of
     it as Roundness or a round terminal rounds off later (the top of a t's stem, the ends of its
     crossbar), so no round is left standing out past a corner that isn't there any more. */
  const cornerR = (si: number, q: Pt) => (q.sharp ? 0 : q.r ?? (exps[si]?.ex?.loop ? 0 : m.R * (b.strokes[si].o.scale || 1) * strokeWt(m, si)));
  const walk = (si: number, ring: Pt[], k: number, dir: 1 | -1, p: Pt, want: number, bis: Pt) => {
    const n = ring.length, pts: Pt[] = [p];
    let len = 0, at = p, i = dir > 0 ? (k + 1) % n : k, d0: Pt | null = null, wing = 0, trim = 0;
    let last: { x: number; y: number; l: number; q: Pt } | null = null;
    for (let step = 0; step < n && len < want; step++, i = (i + dir + n) % n) {
      const q = ring[i], dx = q.x - at.x, dy = q.y - at.y, l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      // (a sliver of an edge, where the outline was cut at the crossing, has no way of its own: taken as it is)
      if (l < 3 && !d0) { pts.push({ x: q.x, y: q.y }); len += l; at = q; continue; }
      if (!d0) { d0 = { x: dx / l, y: dy / l }; wing = Math.sign(d0.x * bis.y - d0.y * bis.x); }
      // the turn at the point just reached, + toward the wedge
      const turn = last ? Math.atan2(last.x * dy - last.y * dx, last.x * dx + last.y * dy) * wing : 0;
      const corner = !!last && !last.q.smooth && Math.abs(turn) >= 0.07;
      if ((dx * d0.x + dy * d0.y) / l < Math.cos(50 * Math.PI / 180) || (corner && turn < -0.25)) {
        if (corner) trim = cornerR(si, last!.q) * Math.tan(Math.min(Math.abs(turn), 2.6) / 2);
        break;
      }
      const side = -dy * bis.x + dx * bis.y > 0 ? 1.5 / l : -1.5 / l, off = { x: -dy * side, y: dx * side };
      const clear = (f: number) => !inked({ x: at.x + dx / l * f + off.x, y: at.y + dy / l * f + off.y }, si);
      let take = Math.min(l, want - len), stop = false;
      if (!clear(take)) {
        let lo = 0, hi = take;
        for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (clear(mid)) lo = mid; else hi = mid; }
        take = lo; stop = true;
      }
      if (take > 1e-6) { const e = { x: at.x + dx / l * take, y: at.y + dy / l * take }; pts.push(e); len += take; at = e; }
      if (stop) break;
      last = { x: dx / l, y: dy / l, l, q };
    }
    return { pts, len: Math.max(0, len - trim) };
  };
  const cut = (w: { pts: Pt[] }, d: number) => {
    const out = [w.pts[0]];
    let len = 0;
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], q = w.pts[i], l = Math.hypot(q.x - a.x, q.y - a.y);
      if (len + l >= d) { const f = l ? (d - len) / l : 0; out.push({ x: a.x + (q.x - a.x) * f, y: a.y + (q.y - a.y) * f }); return out; }
      out.push(q); len += l;
    }
    return out;
  };
  const fillets: Pt[][] = [], count = new Map<number, number>();
  for (let i = 0; i < b.strokes.length; i++) {
    if (!b.strokes[i].cmds) continue;
    const found: Pt[] = [];
    for (let j = i + 1; j < b.strokes.length; j++) {
      if (!b.strokes[j].cmds) continue;
      rings[i].forEach((A, ca) => rings[j].forEach((B, cb) => {
        const ba = boxes[i][ca], bb = boxes[j][cb];
        if (ba.x0 > bb.x1 || bb.x0 > ba.x1 || ba.y0 > bb.y1 || bb.y0 > ba.y1) return;
        for (let ka = 0; ka < A.length; ka++) {
          const a0 = A[ka], a1 = A[(ka + 1) % A.length];
          if (Math.max(a0.x, a1.x) < bb.x0 || Math.min(a0.x, a1.x) > bb.x1 || Math.max(a0.y, a1.y) < bb.y0 || Math.min(a0.y, a1.y) > bb.y1) continue;
          for (let kb = 0; kb < B.length; kb++) {
            const b0 = B[kb], b1 = B[(kb + 1) % B.length];
            const rx = a1.x - a0.x, ry = a1.y - a0.y, sx = b1.x - b0.x, sy = b1.y - b0.y, den = rx * sy - ry * sx;
            if (Math.abs(den) < 1e-9) continue;
            const t = ((b0.x - a0.x) * sy - (b0.y - a0.y) * sx) / den, u = ((b0.x - a0.x) * ry - (b0.y - a0.y) * rx) / den;
            if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) continue;
            const p = { x: a0.x + rx * t, y: a0.y + ry * t };
            if (found.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 1.5)) continue;
            // the four ways out of the crossing along the two edges, in order round it
            const la = Math.hypot(rx, ry), lb = Math.hypot(sx, sy);
            const rays = [
              { x: rx / la, y: ry / la, si: i, ring: A, k: ka, dir: 1 as const }, { x: -rx / la, y: -ry / la, si: i, ring: A, k: ka, dir: -1 as const },
              { x: sx / lb, y: sy / lb, si: j, ring: B, k: kb, dir: 1 as const }, { x: -sx / lb, y: -sy / lb, si: j, ring: B, k: kb, dir: -1 as const }
            ].sort((P, Q) => Math.atan2(P.y, P.x) - Math.atan2(Q.y, Q.x));
            const free = rays.map((r1, n) => {
              const r2 = rays[(n + 1) % 4];
              let span = Math.atan2(r2.y, r2.x) - Math.atan2(r1.y, r1.x);
              if (span <= 0) span += 2 * Math.PI;
              const bx = r1.x + r2.x, by = r1.y + r2.y, bl = Math.hypot(bx, by) || 1, e = 2 / Math.max(0.1, Math.sin(span / 2));
              return { r1, r2, span, bis: { x: bx / bl, y: by / bl }, empty: !inked({ x: p.x + bx / bl * e, y: p.y + by / bl * e }) };
            }).filter(w => w.empty);
            if (free.length !== 1 || free[0].span > Math.PI - 0.05) continue;
            found.push(p);
            const id = `${i}j${count.get(i) ?? 0}`;
            count.set(i, (count.get(i) ?? 0) + 1);
            const own = m.p.corners?.[id], v = own ?? m.p.joinRound, mark: Mark = { type: 'corner', id, x: p.x, y: p.y, v };
            marks.push(mark);
            // Inside corners rounds every join at least as far, unless its letter rounds it its own way
            const R = own != null ? joinR(own, m.s) : Math.max(joinR(v, m.s), innerFor(m, free[0].span));
            if (R < 0.6) continue;
            // how far along each edge the round starts: R's share of as far as the round of Joins at 1 would
            // start, or as far as both edges let it if that is nearer, so Joins rounds on all the way to 1
            // even where the edges run out first (in heavy letters)
            const { r1, r2, span, bis } = free[0], most = Math.max(R, joinR(1, m.s)), d = most / Math.tan(span / 2);
            const w1 = walk(r1.si, r1.ring, r1.k, r1.dir, p, d, bis), w2 = walk(r2.si, r2.ring, r2.k, r2.dir, p, d, bis);
            const dd = Math.min(d, w1.len * 0.95, w2.len * 0.95) * R / most;
            if (dd < 0.6) continue;
            const s1 = cut(w1, dd), s2 = cut(w2, dd), T1 = s1[s1.length - 1], T2 = s2[s2.length - 1];
            const u1 = s1.length > 1 ? s1[s1.length - 2] : p, u2 = s2.length > 1 ? s2[s2.length - 2] : p;
            const t1 = { x: T1.x - u1.x, y: T1.y - u1.y }, t2 = { x: T2.x - u2.x, y: T2.y - u2.y }, l1 = Math.hypot(t1.x, t1.y) || 1, l2 = Math.hypot(t2.x, t2.y) || 1;
            // the round across, a quarter-circle-like curve from where it leaves one edge to where it meets the other
            // (where a curve followed round has swung its edge away from the corner, turning only as far as
            // the edges' own ways at its ends, or it would overshoot them and leave a lip)
            const phi = Math.abs(Math.atan2(t1.y * t2.x - t1.x * t2.y, -(t1.x * t2.x + t1.y * t2.y))), chord = Math.hypot(T2.x - T1.x, T2.y - T1.y);
            const h = phi > Math.PI - span + 1e-3 ? (4 / 3) * Math.tan(phi / 4) * chord / (2 * Math.sin(phi / 2))
              : (4 / 3) * Math.tan((Math.PI - span) / 4) * dd * Math.tan(span / 2);
            const C = [T1, { x: T1.x - t1.x / l1 * h, y: T1.y - t1.y / l1 * h }, { x: T2.x - t2.x / l2 * h, y: T2.y - t2.y / l2 * h }, T2];
            const arc = Array.from({ length: 11 }, (_, n) => { const q = cubicAt(C, n / 10); return { x: q.x, y: q.y, smooth: n > 0 && n < 10 }; });
            // marked on the round, where the corner now is
            Object.assign(mark, { x: arc[5].x, y: arc[5].y, home: p });
            // it reaches a little into the strokes at the crossing, so no hairline shows between them
            fillets.push([{ x: p.x - bis.x * 2, y: p.y - bis.y * 2, sharp: true }, ...s1.slice(1, -1).map(q => ({ ...q, smooth: true })),
              ...arc, ...s2.slice(1, -1).reverse().map(q => ({ ...q, smooth: true }))]);
          }
        }
      }));
    }
  }
  return fillets;
}
