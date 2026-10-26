import { flowField } from "./ambient-flow.mjs";
import { drawnCmds } from "../../shared/engine/outline.ts";
import { cmdsBox } from "../../shared/engine/geom.ts";
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const at = (c, t) => {
  const a = mix(c[0], c[1], t), b = mix(c[1], c[2], t), d = mix(c[2], c[3], t);
  return mix(mix(a, b, t), mix(b, d, t), t);
};
function split(c, t) {
  const a = mix(c[0], c[1], t), b = mix(c[1], c[2], t), d = mix(c[2], c[3], t), e = mix(a, b, t), f = mix(b, d, t), p = mix(e, f, t);
  return [[c[0], a, e, p], [p, f, d, c[3]]];
}
function roots(v, value) {
  const [p0, p1, p2, p3] = v, a = -p0 + 3 * p1 - 3 * p2 + p3, b = 3 * p0 - 6 * p1 + 3 * p2, c = -3 * p0 + 3 * p1, d = p0 - value;
  if (Math.max(...v) - Math.min(...v) < 1e-9) return [];
  const q = (t) => ((a * t + b) * t + c) * t + d, critical = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) critical.push(-c / (2 * b));
  } else {
    const disc = b * b - 3 * a * c;
    if (disc >= 0) {
      critical.push((-b - Math.sqrt(disc)) / (3 * a), (-b + Math.sqrt(disc)) / (3 * a));
    }
  }
  const stops = [0, ...critical.filter((t) => t > 0 && t < 1).sort((a2, b2) => a2 - b2), 1], out = [];
  for (const t of stops) if (t > 1e-8 && t < 1 - 1e-8 && Math.abs(q(t)) < 1e-7) out.push(t);
  for (let i = 0; i < stops.length - 1; i++) {
    let lo = stops[i], hi = stops[i + 1], l = q(lo), h = q(hi);
    if (l * h >= 0) continue;
    for (let j = 0; j < 45; j++) {
      const m = (lo + hi) / 2, v2 = q(m);
      if (l * v2 <= 0) {
        hi = m;
        h = v2;
      } else {
        lo = m;
        l = v2;
      }
    }
    const t = (lo + hi) / 2;
    if (t > 1e-8 && t < 1 - 1e-8) out.push(t);
  }
  return out;
}
function pieces(cs, grid) {
  return cs.map((c) => {
    const out = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length], curved = a.ox !== void 0 || b.ix !== void 0;
      const bez = curved ? [a, { x: a.ox ?? a.x, y: a.oy ?? a.y }, { x: b.ix ?? b.x, y: b.iy ?? b.y }, b] : [a, mix(a, b, 1 / 3), mix(a, b, 2 / 3), b];
      const crossings = [];
      for (const axis of [(p) => p.x, (p) => p.y, (p) => p.y - p.x]) {
        const values = bez.map(axis), lo = Math.min(...values), hi = Math.max(...values);
        for (let k = Math.floor(lo / grid) + 1; k < Math.ceil(hi / grid); k++) crossings.push(...roots(values, k * grid));
      }
      const cuts = [...crossings.sort((a2, b2) => a2 - b2).filter((t, i2, all) => i2 === 0 || t - all[i2 - 1] > 1e-7), 1];
      let rest = bez, previous = 0;
      for (const t of cuts) {
        const [part, tail] = split(rest, (t - previous) / (1 - previous));
        out.push(part);
        rest = tail;
        previous = t;
      }
    }
    return out;
  });
}
function contours(parts, transform) {
  return parts.map((c) => {
    const moved = c.map((curve) => {
      const m = at(curve, 0.5), affine = transform(m);
      return curve.map(affine);
    });
    return moved.map((c2, i) => {
      const before = moved[(i + moved.length - 1) % moved.length];
      return { x: c2[0].x, y: c2[0].y, ix: before[2].x, iy: before[2].y, ox: c2[1].x, oy: c2[1].y };
    });
  });
}
const identity = () => (p) => ({ x: p.x, y: p.y });
function meshMasters(cs, amounts, { grid = 48, blur = 18 } = {}) {
  const parts = pieces(cs, grid), base = contours(parts, identity), box = cmdsBox(drawnCmds(cs));
  const flow = flowField(cs, { step: 2, blur }), pad = blur * 4 + 32;
  const loX = Math.floor((box.x0 - pad) / grid), hiX = Math.ceil((box.x1 + pad) / grid), loY = Math.floor((box.y0 - pad) / grid), hiY = Math.ceil((box.y1 + pad) / grid);
  const build = (amount) => {
    const vertices = /* @__PURE__ */ new Map();
    const vertex = (i, j) => {
      const key = i + "," + j;
      let p = vertices.get(key);
      if (!p) {
        const [x, y] = flow(i * grid, j * grid, amount);
        p = { x, y };
        vertices.set(key, p);
      }
      return p;
    };
    const coefficients = (i, j, upper) => {
      const p = vertex(i, j), q = vertex(i + 1, j + 1), r = vertex(i + (upper ? 0 : 1), j + (upper ? 1 : 0));
      const a = (upper ? q.x - r.x : r.x - p.x) / grid, b = (upper ? q.y - r.y : r.y - p.y) / grid;
      const c = (upper ? r.x - p.x : q.x - r.x) / grid, d = (upper ? r.y - p.y : q.y - r.y) / grid;
      return { a, b, c, d, tx: p.x - a * i * grid - c * j * grid, ty: p.y - b * i * grid - d * j * grid };
    };
    const cell = (p) => {
      const i = Math.floor(p.x / grid), j = Math.floor(p.y / grid);
      const A = coefficients(i, j, p.y / grid - j > p.x / grid - i);
      return (q) => ({ x: A.a * q.x + A.c * q.y + A.tx, y: A.b * q.x + A.d * q.y + A.ty });
    };
    let raw = contours(parts, cell), after = cmdsBox(drawnCmds(raw));
    const sy = (box.y1 - box.y0) / (after.y1 - after.y0), tx = box.x0 - after.x0, ty = box.y0 - after.y0 * sy;
    const mapped = raw.map((c) => c.map((n) => ({ x: n.x + tx, y: n.y * sy + ty, ix: n.ix + tx, iy: n.iy * sy + ty, ox: n.ox + tx, oy: n.oy * sy + ty })));
    let minJacobian = Infinity;
    for (let j = loY; j < hiY; j++) for (let i = loX; i < hiX; i++) for (const upper of [false, true]) {
      let { a, b, c, d } = coefficients(i, j, upper);
      b *= sy;
      d *= sy;
      const A = a * d - b * c - a - d + 1, B = a + d - 2, values = [1, 1 + B + A];
      if (A > 0) {
        const t = -B / (2 * A);
        if (t > 0 && t < 1) values.push(1 + B * t + A * t * t);
      }
      minJacobian = Math.min(minJacobian, ...values);
    }
    return { contours: mapped, advanceDelta: after.x1 - after.x0 - box.x1 + box.x0, minJacobian, amount };
  };
  return { base, masters: amounts.map((w) => w === 0 ? { contours: base, advanceDelta: 0, minJacobian: 1, amount: 0 } : build(w)), nodes: base.reduce((sum, c) => sum + c.length, 0) };
}
function strokeMasters(cs, amounts) {
  const base = contours(pieces(cs, Infinity), identity), box = cmdsBox(drawnCmds(cs));
  const points = cs.flat(), cx = points.reduce((v, p) => v + p.x, 0) / points.length, cy = points.reduce((v, p) => v + p.y, 0) / points.length;
  let xx = 0, xy = 0, yy = 0;
  for (const p of points) {
    xx += (p.x - cx) ** 2;
    xy += (p.x - cx) * (p.y - cy);
    yy += (p.y - cy) ** 2;
  }
  const angle = Math.atan2(2 * xy, xx - yy) / 2, nx = -Math.sin(angle), ny = Math.cos(angle);
  const masters = amounts.map((amount) => {
    if (amount === 0) return { contours: base, advanceDelta: 0, minJacobian: 1, amount };
    const delta = Math.sign(amount) * 0.2, a = 1 + delta * nx * nx, b = delta * nx * ny, c = b, d = 1 + delta * ny * ny;
    const map = (n) => {
      const move = (x2, y2) => [cx + a * (x2 - cx) + c * (y2 - cy), cy + b * (x2 - cx) + d * (y2 - cy)];
      const [x, y] = move(n.x, n.y), [ix, iy] = move(n.ix, n.iy), [ox, oy] = move(n.ox, n.oy);
      return { x, y, ix, iy, ox, oy };
    };
    const raw = base.map((c2) => c2.map(map)), after = cmdsBox(drawnCmds(raw));
    const sy = (box.y1 - box.y0) / (after.y1 - after.y0), tx = box.x0 - after.x0, ty = box.y0 - after.y0 * sy;
    const mapped = raw.map((c2) => c2.map((n) => ({ x: n.x + tx, y: n.y * sy + ty, ix: n.ix + tx, iy: n.iy * sy + ty, ox: n.ox + tx, oy: n.oy * sy + ty })));
    const A = sy * (a * d - b * c) - a - sy * d + 1, B = a + sy * d - 2, values = [1, 1 + B + A];
    if (A > 0) {
      const t = -B / (2 * A);
      if (t > 0 && t < 1) values.push(1 + B * t + A * t * t);
    }
    return { contours: mapped, advanceDelta: after.x1 - after.x0 - box.x1 + box.x0, minJacobian: Math.min(...values), amount };
  });
  return { base, masters, nodes: base.reduce((sum, c) => sum + c.length, 0) };
}
export {
  meshMasters,
  strokeMasters
};
