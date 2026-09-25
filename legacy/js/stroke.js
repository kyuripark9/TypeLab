/* TypeLab — stroke expander.
   A glyph is a set of skeleton strokes (centerlines). This module turns a centerline
   into an outline polygon whose thickness follows the pen model: thick where the
   stroke runs vertically, thin where it runs horizontally (scaled by Contrast),
   with styled terminals, mitered joins and optional serifs. */
(function (TL) {
  'use strict';
  const G = TL.geom;
  const { lerp, clamp, smoothstep } = G;
  const CURVE_N = 16;

  /* ---- 1. flatten path commands into runs of samples (a run has a continuous tangent) */
  function flatten(cmds, ctx, subdivLines) {
    const runs = []; let run = null, cur = null, closed = false;
    const push = samples => {
      if (!samples.length) return;
      const first = samples[0];
      if (run && run.length) {
        const last = run[run.length - 1];
        if (last.tx * first.tx + last.ty * first.ty > 0.9994) { samples = samples.slice(1); last.smooth = true; }
        else { run = []; runs.push(run); }
      } else { run = []; runs.push(run); }
      for (const s of samples) run.push(s);
    };
    const wNum = w => (w === 'thin' ? 0 : w === 'thick' ? 1 : w);
    for (const c of cmds) {
      const op = c[0];
      if (op === 'M') { cur = { x: c[1], y: c[2] }; run = null; continue; }
      if (op === 'Z') { closed = true; continue; }
      if (op === 'L') {
        const o = c[3] || {}, to = { x: c[1], y: c[2] };
        const dx = to.x - cur.x, dy = to.y - cur.y, l = Math.hypot(dx, dy);
        if (l < 0.01) continue;
        const n = subdivLines ? 8 : 1, out = [];
        for (let i = 0; i <= n; i++) {
          out.push({ x: cur.x + dx * i / n, y: cur.y + dy * i / n, tx: dx / l, ty: dy / l,
            w: o.w != null ? wNum(o.w) : null, mask: 1, smooth: i > 0 && i < n });
        }
        push(out); cur = to; continue;
      }
      let P, o;
      if (op === 'C') {
        P = [cur, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }]; o = c[7] || {};
      } else { // 'hv' | 'vh'
        o = c[3] || {};
        const dx = c[1] - cur.x, dy = c[2] - cur.y;
        // organic curves: diagonal quadrants get unequal tension, like a hand-drawn bowl
        const k = clamp(ctx.k * (1 + (dx * dy < 0 ? 0.13 : -0.09) * ctx.org), 0.3, 0.97);
        P = G.quarter(cur.x, cur.y, c[1], c[2], op, k);
      }
      P = G.subCubic(P, o.u0 || 0, o.u1 == null ? 1 : o.u1);
      const out = [];
      for (let i = 0; i <= CURVE_N; i++) {
        const u = i / CURVE_N, s = G.cubicAt(P, u);
        s.w = o.w != null ? wNum(o.w) : null;
        s.mask = smoothstep(Math.min(u, 1 - u) * 3.2);
        s.smooth = i > 0 && i < CURVE_N;
        out.push(s);
      }
      push(out); cur = P[3];
    }
    return { runs, closed };
  }

  /* ---- 2. pen model */
  function autoThickness(tx, ty, ctx, thick, thin) {
    const th = Math.atan2(ty, tx);
    const v = clamp(Math.abs(Math.sin(th - ctx.stress)) / Math.cos(ctx.stress));
    return thin + (thick - thin) * Math.pow(v, 1.15);
  }

  function cutSide(side, p, d, axis, t) {
    if (side.length < 2) return;
    const out = axis === 'h' ? { x: 0, y: Math.sign(d.y) || 1 } : { x: Math.sign(d.x) || 1, y: 0 };
    const off = q => (q.x - p.x) * out.x + (q.y - p.y) * out.y;
    while (side.length > 2 && off(side[side.length - 2]) > 1e-6 && Math.hypot(side[side.length - 2].x - p.x, side[side.length - 2].y - p.y) < t * 1.6) side.pop();
    const q = side[side.length - 1], prev = side[side.length - 2];
    let dx = q.x - prev.x, dy = q.y - prev.y; const l = Math.hypot(dx, dy);
    if (l < 1e-6) { dx = d.x; dy = d.y; } else { dx /= l; dy /= l; }
    const den = dx * out.x + dy * out.y;
    if (Math.abs(den) < 0.12) return;
    const s = clamp(-off(q) / den, -Math.max(l * 0.9, t), 4 * t);
    side[side.length - 1] = { x: q.x + dx * s, y: q.y + dy * s };
  }

  /* A is the side to the left of the outward direction d, B to the right. Returns points
     inserted between the two tails. */
  function cap(A, B, p, d, t, type, ctx, outerIsA) {
    const a = A[A.length - 1], b = B[B.length - 1];
    if (type === 'join') { a.sharp = b.sharp = true; a.smooth = b.smooth = false; return []; }
    if (type === 'h' || type === 'v') { cutSide(A, p, d, type, t); cutSide(B, p, d, type, t); return []; }
    if (type !== 'term') { a.smooth = b.smooth = false; return []; }
    a.smooth = b.smooth = false;
    switch (ctx.terminal) {
      case 'round': a.r = b.r = t / 2 + 0.5; return [];
      case 'sharp': return [{ x: p.x + d.x * t * 0.95, y: p.y + d.y * t * 0.95, sharp: true }];
      case 'angled': {
        const side = outerIsA ? A : B, q = side[side.length - 1];
        side[side.length - 1] = { x: q.x + d.x * t * 0.6, y: q.y + d.y * t * 0.6 };
        return [];
      }
      case 'cut': {
        const axis = Math.abs(d.x) > Math.abs(d.y) ? 'v' : 'h';
        cutSide(A, p, d, axis, t); cutSide(B, p, d, axis, t); return [];
      }
      default: return [];
    }
  }

  /* ---- 3. expand one stroke. Returns { contours, ends, skeleton, curved } */
  function expandStroke(cmds, o, ctx) {
    const sc = o.scale || 1;
    const thick = ctx.thick * sc, thin = Math.min(ctx.thin * sc, thick);
    let ws = o.ws == null ? 1 : o.ws, we = o.we == null ? 1 : o.we;
    if (ctx.terminal === 'tapered') {
      if (o.s === 'term') ws = Math.min(ws, 0.42);
      if (o.e === 'term') we = Math.min(we, 0.42);
    }
    const tapered = ws !== 1 || we !== 1;
    const { runs, closed } = flatten(cmds, ctx, tapered);
    if (!runs.length) return null;

    // arclength for tapers
    let total = 0; const all = [];
    runs.forEach(r => r.forEach((s, i) => {
      const prev = all[all.length - 1];
      if (prev) total += Math.hypot(s.x - prev.x, s.y - prev.y);
      s.len = total; all.push(s);
    }));
    const taperLen = Math.max(1, Math.min(total * 0.45, thick * 3));
    const pathW = o.w === 'thin' ? 0 : o.w === 'thick' ? 1 : o.w;
    for (const s of all) {
      let t = autoThickness(s.tx, s.ty, ctx, thick, thin);
      if (pathW != null) t = lerp(thin, thick, pathW);
      if (s.w != null) t = lerp(t, lerp(thin, thick, s.w), s.mask);
      if (ws !== 1) t *= lerp(ws, 1, smoothstep(s.len / taperLen));
      if (we !== 1) t *= lerp(we, 1, smoothstep((total - s.len) / taperLen));
      s.t = t;
    }

    const sideOf = (s, sg) => ({ x: s.x - sg * s.ty * s.t / 2, y: s.y + sg * s.tx * s.t / 2, smooth: s.smooth });
    const Lr = runs.map(r => r.map(s => sideOf(s, 1)));
    const Rr = runs.map(r => r.map(s => sideOf(s, -1)));
    const curved = cmds.some(c => c[0] === 'C' || c[0] === 'hv' || c[0] === 'vh');
    const skeleton = runs.map(r => r.map(s => ({ x: s.x, y: s.y })));

    const isLoop = closed && runs.length === 1 &&
      Math.hypot(all[0].x - all[all.length - 1].x, all[0].y - all[all.length - 1].y) < 0.5;
    if (isLoop) {
      Lr[0].pop(); Rr[0].pop();
      Lr[0].forEach(p => p.smooth = true); Rr[0].forEach(p => p.smooth = true);
      return { contours: [Lr[0], Rr[0]], loop: true, ends: [], skeleton, curved: true, thickness: all.map(s => s.t) };
    }

    // joins between runs
    const limit = o.miter || 5;
    const join = (i, j) => {
      const ra = runs[i], rb = runs[j], sa = ra[ra.length - 1], sb = rb[0];
      const cross = sa.tx * sb.ty - sa.ty * sb.tx;
      if (Math.abs(cross) < 1e-3) return;
      const lenA = ra[ra.length - 1].len - ra[0].len, lenB = rb[rb.length - 1].len - rb[0].len;
      for (const [sides, sg] of [[Lr, 1], [Rr, -1]]) {
        const A = sides[i][sides[i].length - 1], B = sides[j][0];
        const s = ((B.x - A.x) * sb.ty - (B.y - A.y) * sb.tx) / cross;
        const P = { x: A.x + s * sa.tx, y: A.y + s * sa.ty };
        const u = (P.x - B.x) * sb.tx + (P.y - B.y) * sb.ty;
        const outer = s > 0;
        if (outer) {
          if (Math.hypot(P.x - sa.x, P.y - sa.y) > limit * Math.max(sa.t, sb.t) / 2) continue;
        } else if (-s > lenA * 0.95 || u > lenB * 0.95) continue;
        sides[i][sides[i].length - 1] = P;
        sides[j][0] = null;
      }
    };
    for (let i = 0; i + 1 < runs.length; i++) join(i, i + 1);
    const L = [].concat(...Lr).filter(Boolean), R = [].concat(...Rr).filter(Boolean);

    const first = all[0], last = all[all.length - 1];
    const turn = (a, b) => a.tx * b.ty - a.ty * b.tx;
    const lastRun = runs[runs.length - 1], firstRun = runs[0];
    const endTurn = turn(lastRun[Math.max(0, lastRun.length - 5)], last);
    const startTurn = turn(first, firstRun[Math.min(firstRun.length - 1, 4)]);
    const pickA = (tn, aIsLeft, A, B) => {
      if (Math.abs(tn) > 1e-3) return (tn > 0) !== aIsLeft; // turning left => outer is right side
      const a = A[A.length - 1], b = B[B.length - 1];
      return a.y >= b.y;
    };
    const de = { x: last.tx, y: last.ty }, ds = { x: -first.tx, y: -first.ty };
    const endX = cap(L, R, last, de, last.t, o.e || 'flat', ctx, pickA(endTurn, true, L, R));
    L.reverse(); R.reverse();
    const startX = cap(R, L, first, ds, first.t, o.s || 'flat', ctx, pickA(startTurn, false, R, L));
    L.reverse(); R.reverse();
    const contour = [...L, ...endX, ...R.slice().reverse(), ...startX];

    const ends = [
      { x: first.x, y: first.y, dx: ds.x, dy: ds.y, t: first.t, type: o.s || 'flat', which: 's' },
      { x: last.x, y: last.y, dx: de.x, dy: de.y, t: last.t, type: o.e || 'flat', which: 'e' }
    ];
    return { contours: [contour], loop: false, ends, skeleton, curved, thickness: all.map(s => s.t) };
  }

  /* ---- 4. serifs. end: {x,y,dx,dy,t}; sides: 'both' | 'a' | 'b' (a = toward -x or -y) */
  function buildSerif(end, sides, ctx, scale) {
    const sf = ctx.serif; if (!sf) return null;
    const horiz = end.type === 'h' ? false : end.type === 'v' ? true : Math.abs(end.dx) > Math.abs(end.dy);
    const out = horiz ? { x: Math.sign(end.dx), y: 0 } : { x: 0, y: Math.sign(end.dy) || -1 };
    const u = horiz ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const along = Math.abs(end.dx * out.x + end.dy * out.y);
    const hw = (end.t / 2) / Math.max(0.35, along);
    const k = scale || 1;
    const Ln = sf.len * k;
    let th = sf.th * (horiz ? 0.9 : 1);
    const ang = sf.angle;
    let prof; // one side, [across, depth] from the tip inwards to the stem
    if (sf.shape === 'wedge') {
      prof = [[hw + Ln, 0], [hw + Ln, -Math.max(4, th * 0.2), 'sharp'], [hw, -(th * 0.6 + Ln * (0.75 + ang * 0.5))]];
    } else {
      const thTip = th * (1 - 0.65 * ang), thStem = th + Ln * ang * 0.35;
      if (sf.shape === 'bracketed') {
        const br = Ln * 0.85;
        const P = [{ x: hw + Ln, y: -thTip }, { x: hw + Ln * 0.3, y: -thTip - (thStem - thTip) * 0.6 },
          { x: hw, y: -thStem - br * 0.25 }, { x: hw, y: -(thStem + br) }];
        prof = [[hw + Ln, 0], [hw + Ln, -thTip]];
        for (let i = 1; i <= 8; i++) { const s = G.cubicAt(P, i / 8); prof.push([s.x, s.y, i < 8 ? 'smooth' : 'sharp']); }
      } else {
        prof = [[hw + Ln, 0], [hw + Ln, -thTip], [hw, -thStem, 'sharp']];
      }
    }
    const depth = -prof[prof.length - 1][1];
    const pts = [];
    // diagonal strokes: shear the serif so its inner edges follow the stroke
    const dOut = end.dx * out.x + end.dy * out.y, shear = Math.abs(dOut) > 0.3 ? (end.dx * u.x + end.dy * u.y) / dOut : 0;
    const put = (a, d, flag) => {
      a += shear * d * Math.min(1, -d / (th * 1.2 + 1));
      const p = { x: end.x + u.x * a + out.x * d, y: end.y + u.y * a + out.y * d };
      if (flag === 'smooth') p.smooth = true; if (flag === 'sharp') p.sharp = true;
      pts.push(p);
    };
    const wantB = sides !== 'a', wantA = sides !== 'b';
    if (wantB) prof.forEach(q => put(q[0], q[1], q[2])); else { put(hw, 0, 'sharp'); put(hw, -depth, 'sharp'); }
    if (wantA) prof.slice().reverse().forEach(q => put(-q[0], q[1], q[2])); else { put(-hw, -depth, 'sharp'); put(-hw, 0, 'sharp'); }
    return pts;
  }

  TL.stroke = { expandStroke, buildSerif, autoThickness };
})(window.TL);
