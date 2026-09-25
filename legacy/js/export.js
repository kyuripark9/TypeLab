/* TypeLab — export: installable OpenType font, SVG specimen, JSON settings. */
(function (TL) {
  'use strict';

  function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const slug = s => (s || 'TypeLab').replace(/[^A-Za-z0-9]+/g, '') || 'TypeLab';

  function loadOpentype() {
    if (window.opentype) return Promise.resolve(window.opentype);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/opentype.min.js';
      s.onload = () => res(window.opentype); s.onerror = () => rej(new Error('Could not load the font writer (vendor/opentype.min.js).'));
      document.head.appendChild(s);
    });
  }

  TL.exportOTF = function (font, name) {
    return loadOpentype().then(ot => {
      const m = font.m, R = Math.round;
      const toPath = cmds => {
        const p = new ot.Path();
        for (const c of cmds) {
          if (c[0] === 'M') p.moveTo(R(c[1]), R(c[2]));
          else if (c[0] === 'L') p.lineTo(R(c[1]), R(c[2]));
          else if (c[0] === 'C') p.curveTo(R(c[1]), R(c[2]), R(c[3]), R(c[4]), R(c[5]), R(c[6]));
          else p.close();
        }
        return p;
      };
      const glyphs = [
        new ot.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new ot.Path() }),
        new ot.Glyph({ name: 'space', unicode: 32, advanceWidth: R(Math.max(40, m.space + m.track)), path: new ot.Path() })
      ];
      for (const ch of TL.ALL_CHARS) {
        const g = font.glyph(ch); if (!g) continue;
        glyphs.push(new ot.Glyph({ name: 'uni' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'), unicode: ch.charCodeAt(0),
          advanceWidth: R(Math.max(20, g.adv + m.track)), path: toPath(g.cmds) }));
      }
      const f = new ot.Font({ familyName: name || 'TypeLab', styleName: 'Regular', unitsPerEm: 1000,
        ascender: R(Math.max(m.asc, m.cap) + 60), descender: R(m.desc - 40), glyphs });
      download(slug(name) + '.otf', new Blob([f.toArrayBuffer()], { type: 'font/otf' }));
    });
  };

  TL.exportSVG = function (font, name) {
    const m = font.m, rows = [name || 'TypeLab', TL.CHARSET.upper, TL.CHARSET.lower, TL.CHARSET.digits + ' ' + TL.CHARSET.punct, TL.TEXTS.sentence];
    const lh = Math.max(m.asc, m.cap) - m.desc + 160; let body = '', maxW = 0;
    rows.forEach((t, r) => {
      const ln = font.layout(t, Infinity)[0]; maxW = Math.max(maxW, ln.width);
      const y = Math.round(Math.max(m.asc, m.cap) + 80 + r * lh);
      for (const it of ln.items) { const g = font.glyph(it.ch); if (g) body += `<path transform="translate(${Math.round(it.x)},${y})" d="${g.d}"/>`; }
    });
    const W = Math.round(maxW + 200), H = Math.round(rows.length * lh + 120);
    download(slug(name) + '-specimen.svg',
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 0 ${W} ${H}" width="${W / 4}" height="${H / 4}"><rect x="-100" width="${W}" height="${H}" fill="#fff"/><g fill="#111">${body}</g></svg>`, 'image/svg+xml');
  };

  TL.exportJSON = function (params, name) {
    download(slug(name) + '.typelab.json', JSON.stringify({ app: 'TypeLab', version: 1, name, params }, null, 2), 'application/json');
  };
})(window.TL);
