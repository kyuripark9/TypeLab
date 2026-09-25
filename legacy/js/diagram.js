/* TypeLab — live explainer diagrams. Each control gets a small figure drawn with the real
   glyph engine: the demo letters, the affected part highlighted, and a measurement or guide. */
(function (TL) {
  'use strict';
  const G = TL.geom;
  const RING_KEYS = { terminal: 1, aperture: 1, apex: 1, roundness: 1 };
  TL.RING_KEYS = RING_KEYS;
  const n1 = v => Math.round(v * 10) / 10;

  TL.diagram = function (font, key, W, H) {
    W = W || 340; H = H || 178;
    const ctl = TL.CONTROLS[key] || TL.SERIF_SUBS[key] && TL.CONTROLS.serif;
    if (!ctl) return '';
    const hlKey = TL.SERIF_SUBS[key] ? 'serif' : key;
    const m = font.m, text = ctl.demo, line = font.layout(text, Infinity)[0];
    const hasDesc = /[gjpqy]/.test(text);
    const guides = key === 'xHeight' || key === 'height';
    const top = Math.max(m.asc, m.cap) + 50, bot = hasDesc ? m.desc - 30 : (key === 'width' ? -190 : -110);
    const padL = guides ? 64 : 22, padR = 22;
    const sc = Math.min((H - 18) / (top - bot), (W - padL - padR) / Math.max(1, line.width));
    const ox = padL + (W - padL - padR - line.width * sc) / 2, oy = (H - (top - bot) * sc) / 2 + top * sc;
    const X = x => n1(ox + x * sc), Y = y => n1(oy - y * sc);
    const body = (it, x, y) => { const g = font.glyph(it.ch); const p = G.applyM(g.M, x, y); return [X(it.x + p[0]), Y(p[1])]; };

    let under = '', glyphs = '', hl = '', over = '';
    const hline = (y, cls, label) => {
      let s = `<line class="${cls}" x1="${guides ? 8 : 0}" x2="${W}" y1="${Y(y)}" y2="${Y(y)}"/>`;
      if (label) s += `<text class="d-label" x="8" y="${Y(y) - 4}">${label}</text>`;
      return s;
    };
    under += hline(0, 'd-guide', guides ? 'Baseline' : '');
    if (key === 'xHeight') {
      under += `<rect class="d-band" x="0" width="${W}" y="${Y(m.xh)}" height="${n1(m.xh * sc)}"/>`;
      under += hline(m.cap, 'd-guide', 'Cap height') + hline(m.xh, 'd-guide hot', 'x-height');
    }
    if (key === 'height') under += hline(m.cap, 'd-guide hot', 'Cap height') + hline(m.xh, 'd-guide', 'x-height');

    const items = line.items.filter(it => font.glyph(it.ch));
    for (const it of items) {
      const g = font.glyph(it.ch);
      glyphs += `<path d="${g.d}" transform="translate(${n1(it.x)},0)"/>`;
      const h = font.hl(it.ch, hlKey);
      if (h) hl += `<path d="${h}" transform="translate(${n1(it.x)},0)"/>`;
    }
    // spacing bands
    const band = (x0, x1) => `<rect class="d-band strong" x="${X(Math.min(x0, x1))}" width="${n1(Math.abs(x1 - x0) * sc)}" y="${Y(top - 40)}" height="${n1((top - 40 - bot - 10) * sc)}"/>`;
    if (key === 'letterSpacing') items.forEach((it, i) => { const nx = items[i + 1]; if (nx) { const g = font.glyph(it.ch), g2 = font.glyph(nx.ch); under += band(it.x + it.adv - g.rsb, nx.x + g2.lsb); } });
    if (key === 'wordSpacing') line.items.forEach(it => { if (it.ch === ' ') under += band(it.x, it.x + it.adv); });
    if (key === 'sideBearing') items.forEach(it => { const g = font.glyph(it.ch); under += band(it.x, it.x + g.lsb) + band(it.x + it.adv - g.rsb, it.x + it.adv); });

    const dim = (a, b, cls) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 4, ny = dx / l * 4;
      return `<g class="${cls}"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>` +
        `<line x1="${n1(a[0] - nx)}" y1="${n1(a[1] - ny)}" x2="${n1(a[0] + nx)}" y2="${n1(a[1] + ny)}"/>` +
        `<line x1="${n1(b[0] - nx)}" y1="${n1(b[1] - ny)}" x2="${n1(b[0] + nx)}" y2="${n1(b[1] + ny)}"/></g>`;
    };
    const it0 = items[0], g0 = it0 && font.glyph(it0.ch);
    if (it0) {
      if (key === 'weight') over += dim(body(it0, 0, m.xh * 0.42), body(it0, m.s, m.xh * 0.42), 'd-dim light');
      if (key === 'width') over += dim(body(it0, 0, -95), body(it0, g0.bodyW, -95), 'd-dim');
      if (key === 'height') { const x = X(it0.x) - 12; over += dim([x, Y(0)], [x, Y(m.cap)], 'd-dim'); }
      if (key === 'contrast') {
        over += dim(body(it0, 0, m.cap / 2), body(it0, m.s, m.cap / 2), 'd-dim light');
        over += dim(body(it0, g0.bodyW / 2, m.cap + m.os - m.hT), body(it0, g0.bodyW / 2, m.cap + m.os), 'd-dim light');
      }
      if (key === 'slant') {
        const cx = it0.x + g0.adv / 2, y0 = -70, y1 = m.cap + 90;
        over += `<line class="d-axis ghost" x1="${X(cx)}" x2="${X(cx)}" y1="${Y(y0)}" y2="${Y(y1)}"/>`;
        over += `<line class="d-axis" x1="${X(cx + m.slant * (y0 - m.xh * 0.4))}" x2="${X(cx + m.slant * (y1 - m.xh * 0.4))}" y1="${Y(y0)}" y2="${Y(y1)}"/>`;
      }
    }
    const ring = RING_KEYS[hlKey];
    return `<svg class="diagram" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${ctl.tech} diagram">` +
      under + `<g transform="translate(${n1(ox)},${n1(oy)}) scale(${sc.toFixed(5)})"><g class="d-ink">${glyphs}</g>` +
      `<g class="${ring ? 'd-ring' : 'd-hl'}" ${ring ? `stroke-width="${n1(1.6 / sc)}"` : ''}>${hl}</g></g>` + over + `</svg>`;
  };

  /* Small static previews for option buttons */
  function cmdsD(pts, R) { if (G.signedArea(pts) < 0) pts = pts.slice().reverse(); return G.cmdsToD(G.roundContour(pts, R || 0)); }
  TL.terminalIcon = function (kind) {
    const ctx = { thick: 64, thin: 58, stress: 0, k: 0.5523, org: 0, terminal: kind };
    const ex = TL.stroke.expandStroke([['M', -40, -46], ['C', 60, -46, 130, -10, 172, 46]], { s: 'join', e: 'term' }, ctx);
    return `<svg viewBox="-14 -100 240 190" width="60" height="46"><path d="${cmdsD(ex.contours[0])}"/></svg>`;
  };
  TL.serifIcon = function (shape) {
    const ctx = { thick: 56, thin: 40, stress: 0, k: 0.5523, org: 0, terminal: 'flat',
      serif: { len: 62, th: 22 * ({ unbracketed: 0.6, slab: 1.6 }[shape] || 1), shape, angle: 0.15 } };
    const stem = [{ x: 72, y: 150 }, { x: 72, y: 0 }, { x: 128, y: 0 }, { x: 128, y: 150 }];
    const sf = TL.stroke.buildSerif({ x: 100, y: 0, dx: 0, dy: -1, t: 56, type: 'flat' }, 'both', ctx);
    return `<svg viewBox="0 -160 200 170" width="52" height="44"><path d="${cmdsD(stem)}${cmdsD(sf)}"/></svg>`;
  };
})(window.TL);
