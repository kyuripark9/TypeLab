import { drawnCmds } from "../../shared/engine/outline.ts";
import { toPolys, cmdsBox } from "../../shared/engine/geom.ts";
function flowField(cs, { step = 2, blur = 18, regularization = 5e-3 } = {}) {
  const rs = toPolys(drawnCmds(cs)), b = cmdsBox(drawnCmds(cs)), pad = blur * 4 + 20;
  const ox = Math.floor((b.x0 - pad) / step) * step, oy = Math.floor((b.y0 - pad) / step) * step;
  const w = Math.ceil((b.x1 + pad - ox) / step) + 1, h = Math.ceil((b.y1 + pad - oy) / step) + 1;
  let ink = new Float64Array(w * h);
  for (let j = 0; j < h; j++) {
    const y = oy + (j + 0.5) * step, xs = [];
    for (const r of rs) for (let i = 0; i < r.length; i++) {
      const a = r[i], b2 = r[(i + 1) % r.length];
      if (a.y <= y !== b2.y <= y) xs.push({ x: a.x + (y - a.y) / (b2.y - a.y) * (b2.x - a.x), d: b2.y > a.y ? 1 : -1 });
    }
    xs.sort((a, b2) => a.x - b2.x);
    let wind = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      wind += xs[i].d;
      if (!wind) continue;
      let lo = Math.max(0, Math.ceil((xs[i].x - ox) / step - 0.5)), hi = Math.min(w, Math.ceil((xs[i + 1].x - ox) / step - 0.5));
      ink.fill(1, j * w + lo, j * w + hi);
    }
  }
  const radius = Math.max(1, Math.round(blur / step));
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Float64Array(w * h), next = new Float64Array(w * h), n = 2 * radius + 1;
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = 0; x <= radius; x++) sum += ink[y * w + x];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / n;
        if (x - radius >= 0) sum -= ink[y * w + x - radius];
        if (x + radius + 1 < w) sum += ink[y * w + x + radius + 1];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = 0; y <= radius; y++) sum += tmp[y * w + x];
      for (let y = 0; y < h; y++) {
        next[y * w + x] = sum / n;
        if (y - radius >= 0) sum -= tmp[(y - radius) * w + x];
        if (y + radius + 1 < h) sum += tmp[(y + radius + 1) * w + x];
      }
    }
    ink = next;
  }
  const vx = new Float64Array(w * h), vy = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, dx = (ink[i - 1] - ink[i + 1]) / (2 * step), dy = (ink[i - w] - ink[i + w]) / (2 * step), l = Math.hypot(dx, dy), norm = l + regularization;
    vx[i] = dx / norm;
    vy[i] = dy / norm;
  }
  const at = (x, y) => {
    const fx = (x - ox) / step - 0.5, fy = (y - oy) / step - 0.5, i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i + 1 >= w || j + 1 >= h) return [0, 0];
    const tx = fx - i, ty = fy - j, k = j * w + i;
    const val = (a) => (a[k] * (1 - tx) + a[k + 1] * tx) * (1 - ty) + (a[k + w] * (1 - tx) + a[k + w + 1] * tx) * ty;
    return [val(vx), val(vy)];
  };
  return (x, y, amount) => {
    const n = Math.max(1, Math.ceil(Math.abs(amount) / 1)), dt = amount / n;
    for (let i = 0; i < n; i++) {
      const [vx2, vy2] = at(x, y), [mx, my] = at(x + vx2 * dt / 2, y + vy2 * dt / 2);
      x += mx * dt;
      y += my * dt;
    }
    return [x, y];
  };
}
export {
  flowField
};
