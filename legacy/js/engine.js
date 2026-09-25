/* TypeLab — font engine.
   params (what the user edits, all 0..1) -> resolve() -> metrics -> glyph skeletons
   -> expanded outlines. Everything runs synchronously in the browser; a full rebuild
   of every glyph takes a few milliseconds, so sliders can drive it directly. */
(function (TL) {
  'use strict';
  const G = TL.geom, S = TL.stroke;
  const { lerp, clamp } = G;

  TL.DEFAULTS = {
    weight: 0.4, width: 0.5, height: 0.5, slant: 0, contrast: 0.05,
    xHeight: 0.5, counter: 0.5, aperture: 0.5, crossbar: 0.5,
    roundness: 0, curve: 0.2, apex: 0.4, terminal: 'flat',
    serif: false, serifSize: 0.45, serifThickness: 0.35, serifShape: 'bracketed', serifAngle: 0.2,
    letterSpacing: 0.2, wordSpacing: 0.35, sideBearing: 0.5,
    geoHuman: 0.5, softSharp: 0.5, classicFuture: 0.5, playfulFormal: 0.5
  };

  const GLYPHS = {};
  /* sb: [left, right] side-bearing factors (1 = straight stem, ~.55 round, ~.25 diagonal) */
  TL.defGlyph = (ch, sb, fn, meta) => { GLYPHS[ch] = { ch, sb, fn, meta: meta || {} }; };
  TL.CHARSET = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789', punct: '.,!?;:\'"()-/&@#$%+'
  };
  TL.ALL_CHARS = TL.CHARSET.upper + TL.CHARSET.lower + TL.CHARSET.digits + TL.CHARSET.punct;

  /* Personality sliders are macros: they push several low-level parameters at once. */
  function resolve(p) {
    const e = Object.assign({}, TL.DEFAULTS, p);
    const gh = (e.geoHuman - 0.5) * 2, ss = (e.softSharp - 0.5) * 2;
    const cf = (e.classicFuture - 0.5) * 2, pf = (e.playfulFormal - 0.5) * 2;
    const human = Math.max(0, gh), classic = Math.max(0, -cf), future = Math.max(0, cf);
    const playful = Math.max(0, -pf), formal = Math.max(0, pf);
    e.curve = clamp(e.curve + 0.45 * gh);
    e.aperture = clamp(e.aperture + 0.3 * gh - 0.3 * future);
    e.contrast = clamp(e.contrast + 0.08 * human + 0.25 * classic + 0.1 * formal - 0.05 * future);
    e.roundness = clamp(e.roundness - 0.7 * ss + 0.15 * playful);
    e.apex = clamp(e.apex - 0.5 * ss);
    e.xHeight = clamp(e.xHeight + 0.18 * cf + 0.12 * playful);
    e.width = clamp(e.width + 0.1 * future - 0.07 * formal);
    e.letterSpacing = clamp(e.letterSpacing + 0.04 * formal);
    e.square = 0.85 * future;
    e.classic = classic;
    e.bounce = playful;
    e.singleStory = gh < -0.3;
    e.stressDeg = e.curve * 10 + human * 9 + classic * 7;
    return e;
  }

  function metrics(e) {
    const m = { p: e };
    m.s = 18 + 200 * Math.pow(e.weight, 1.25);
    m.cap = lerp(560, 840, e.height);
    m.xh = m.cap * lerp(0.5, 0.86, e.xHeight);
    m.asc = Math.max(m.cap * 1.05, m.xh * 1.18);
    m.desc = -m.cap * 0.3;
    m.os = m.cap * 0.014;
    m.ws = e.width < 0.5 ? lerp(0.6, 1, e.width * 2) : lerp(1, 1.5, (e.width - 0.5) * 2);
    const ratio = 1 - 0.08 - 0.84 * e.contrast;
    m.thin = Math.max(8, Math.min(m.s * ratio, m.xh * 0.2));
    m.stress = e.stressDeg * Math.PI / 180;
    m.k = 0.5523 + 0.05 * e.curve + 0.36 * e.square;
    m.org = e.curve;
    m.sq = e.square;
    m.bar = e.crossbar; m.apex = e.apex; m.ap = e.aperture;
    m.cnt = (e.counter - 0.5) * 2;
    m.serif = !!e.serif;
    m.ctx = {
      thick: m.s, thin: m.thin, stress: m.stress, k: m.k, org: m.org, terminal: e.terminal,
      serif: e.serif ? {
        len: lerp(28, 175, e.serifSize) * (0.75 + 0.25 * m.ws),
        th: lerp(8, 95, e.serifThickness) * ({ unbracketed: 0.6, slab: 1.5, wedge: 1, bracketed: 1 }[e.serifShape] || 1),
        shape: e.serifShape, angle: e.serifAngle
      } : null
    };
    m.tDir = (dx, dy) => { const l = Math.hypot(dx, dy) || 1; return S.autoThickness(dx / l, dy / l, m.ctx, m.s, m.thin); };
    m.hT = m.tDir(1, 0);
    /* body width: base is drawn for a regular weight at normal width.
       cls: 'r' letters built around a counter, 'c' classically narrow caps, 'n' normal */
    m.W = (base, cls) => {
      let w = base * m.ws;
      w *= 1 + (cls === 'r' ? 0.22 : 0.06) * m.cnt;
      if (cls === 'c') w *= 1 - 0.13 * e.classic;
      if (cls === 'r') w *= 1 + 0.05 * e.classic;
      return w + (m.s - 80) * 0.62;
    };
    m.sb = Math.max(14, 64 * (0.65 + 0.35 * m.ws) - (m.s - 80) * 0.12 + (e.sideBearing - 0.5) * 130 + (e.serif ? m.ctx.serif.len * 0.3 : 0));
    m.track = (e.letterSpacing - 0.2) * 260;
    m.space = m.W(210) + (e.wordSpacing - 0.35) * 520;
    m.slant = Math.tan(e.slant * 20 * Math.PI / 180);
    m.R = e.roundness * m.s * 0.5;
    m.dotRound = Math.max(e.roundness, e.terminal === 'round' ? 1 : 0);
    m.qpt = (x0, y0, x1, y1, mode, u) => {
      const k = clamp(m.k * (1 + ((x1 - x0) * (y1 - y0) < 0 ? 0.13 : -0.09) * m.org), 0.3, 0.97);
      return G.cubicAt(G.quarter(x0, y0, x1, y1, mode, k), u);
    };
    return m;
  }

  /* Glyph builder handed to each glyph function. */
  class Builder {
    constructor(m) { this.m = m; this.strokes = []; this.counters = []; this.marks = []; }
    path(cmds, o) { this.strokes.push({ cmds, o: o || {} }); return this; }
    line(x0, y0, x1, y1, o) { return this.path([['M', x0, y0], ['L', x1, y1]], o); }
    stem(x, y0, y1, o) { return this.line(x, y0, x, y1, Object.assign({ part: 'stem' }, o)); }
    dot(cx, cy, size, part) {
      const h = size / 2, r = h * this.m.dotRound;
      this.strokes.push({ poly: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]].map(p => ({ x: p[0], y: p[1], r })), o: { part: part || 'dot' } });
      return this;
    }
    counter(pts) { this.counters.push(pts.map(p => ({ x: p[0], y: p[1] }))); return this; }
    ellipseCounter(cx, cy, rx, ry) {
      const pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
      return this.counter(pts);
    }
    mark(type, x, y) { this.marks.push({ type, x, y }); return this; }
  }

  const hash = (n, k) => { const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

  function buildGlyph(ch, m) {
    const def = GLYPHS[ch];
    if (!def) return null;
    const b = new Builder(m);
    const W = def.fn(b, m);
    const out = { ch, strokes: [], serifs: [], counters: [], marks: b.marks.slice(), corners: [], skeleton: [], meta: def.meta, bodyW: W };
    const finish = (pts, sign, R, cornersOut) => {
      if (pts.length < 3) return null;
      if ((G.signedArea(pts) < 0) !== (sign < 0)) pts = pts.slice().reverse();
      return G.roundContour(pts, R, cornersOut);
    };
    for (const st of b.strokes) {
      const o = st.o; let cmds = [];
      if (st.poly) {
        const c = finish(st.poly, 1, 0); if (c) cmds = c;
        out.strokes.push({ part: o.part, cmds, curved: false, dot: true });
        continue;
      }
      const serifS = m.serif && o.serifS && !o.scale, serifE = m.serif && o.serifE && !o.scale;
      const so = Object.assign({}, o);
      if (serifS && so.s === 'term') so.s = 'flat';
      if (serifE && so.e === 'term') so.e = 'flat';
      const ex = S.expandStroke(st.cmds, so, m.ctx);
      if (!ex) continue;
      const R = m.R * (o.scale || 1);
      if (ex.loop) {
        const [a, c] = ex.contours;
        const outerIsA = Math.abs(G.signedArea(a)) >= Math.abs(G.signedArea(c));
        const o1 = finish(outerIsA ? a : c, 1, 0), i1 = finish(outerIsA ? c : a, -1, 0);
        if (o1) cmds = cmds.concat(o1); if (i1) cmds = cmds.concat(i1);
        if (o.counter !== false && i1) out.counters.push(i1);
      } else {
        let pts = ex.contours[0];
        if (o.clip) pts = G.clipPoly(pts, o.clip);
        const c = finish(pts, 1, R, out.corners); if (c) cmds = c;
        if (o.counter) out.counters.push(finish([].concat(...ex.skeleton), 1, 0) || []);
      }
      out.strokes.push({ part: o.part || 'stroke', cmds, curved: ex.curved, horizontal: isHorizontal(st.cmds) });
      ex.skeleton.forEach(r => out.skeleton.push(r));
      for (const end of ex.ends) {
        const want = end.which === 's' ? serifS : serifE;
        if (want) {
          const sp = S.buildSerif(end, end.which === 's' ? o.serifS : o.serifE, m.ctx, o.serifScale);
          const c = sp && finish(sp, 1, m.R * 0.5); if (c) out.serifs.push(c);
        } else if (end.type === 'term') out.marks.push({ type: 'terminal', x: end.x, y: end.y, r: end.t * 0.5 });
      }
    }
    b.counters.forEach(pts => { const c = finish(pts, 1, 0); if (c) out.counters.push(c); });

    // place: side bearings, playful bounce, slant
    const lsb = m.sb * def.sb[0], rsb = m.sb * def.sb[1];
    out.lsb = lsb; out.rsb = rsb;
    out.adv = Math.max(10, lsb + W + rsb);
    let M = [1, 0, 0, 1, lsb, 0];
    if (m.p.bounce > 0) {
      const code = ch.charCodeAt(0), a = (hash(code, 1) - 0.5) * 2 * 0.11 * m.p.bounce, dy = (hash(code, 2) - 0.5) * 2 * 38 * m.p.bounce;
      const cx = out.adv / 2, cy = m.xh / 2, c = Math.cos(a), s = Math.sin(a);
      M = G.mulM([c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy + dy], M);
    }
    if (m.slant) M = G.mulM([1, 0, m.slant, 1, -m.slant * m.xh * 0.4, 0], M);
    out.M = M;
    const tf = c => G.transformCmds(c, M);
    out.strokes.forEach(s => s.cmds = tf(s.cmds));
    out.serifs = out.serifs.map(tf); out.counters = out.counters.map(tf);
    const tp = p => { const q = G.applyM(M, p.x, p.y); return Object.assign({}, p, { x: q[0], y: q[1] }); };
    out.marks = out.marks.map(tp); out.corners = out.corners.map(tp);
    out.skeleton = out.skeleton.map(r => r.map(tp));
    out.cmds = [].concat(...out.strokes.map(s => s.cmds), ...out.serifs);
    return out;
  }
  function isHorizontal(cmds) {
    if (cmds.length !== 2 || cmds[1][0] !== 'L') return false;
    return Math.abs(cmds[1][2] - cmds[0][2]) < Math.abs(cmds[1][1] - cmds[0][1]) * 0.2;
  }

  /* ---- highlight layers: which part of a glyph does a parameter touch? */
  const dots = (pts, r) => pts.map(p => { const R = r || p.r || 30; return `M${(p.x - R).toFixed(1)} ${(-p.y).toFixed(1)}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0Z`; }).join('');
  function highlightD(g, key, m) {
    const D = G.cmdsToD, strokes = f => g.strokes.filter(f).map(s => D(s.cmds)).join('');
    switch (key) {
      case 'weight': return strokes(s => s.part === 'stem' || s.part === 'diagonal');
      case 'contrast': return strokes(s => s.horizontal || s.part === 'crossbar' || s.part === 'arm');
      case 'counter': return g.counters.map(D).join('');
      case 'curve': return strokes(s => s.curved);
      case 'crossbar': return strokes(s => s.part === 'crossbar' || s.part === 'bar');
      case 'serif': return g.serifs.map(D).join('');
      case 'terminal': case 'aperture': return dots(g.marks.filter(k => k.type === 'terminal'), Math.max(26, m.s * 0.62));
      case 'apex': return dots(g.marks.filter(k => k.type === 'apex' || k.type === 'vertex'), Math.max(30, m.s * 0.7));
      case 'roundness': return dots(g.corners, Math.max(16, m.s * 0.3));
      default: return '';
    }
  }

  function buildFont(params) {
    const e = resolve(params), m = metrics(e), cache = {};
    const font = {
      params, eff: e, m,
      glyph(ch) {
        if (ch in cache) return cache[ch];
        let g = buildGlyph(ch === 'a' && e.singleStory ? 'a.alt' : ch, m);
        if (g) { g.ch = ch; g.d = G.cmdsToD(g.cmds); g.hl = {}; }
        return (cache[ch] = g);
      },
      hl(ch, key) {
        const g = font.glyph(ch); if (!g) return '';
        if (!(key in g.hl)) g.hl[key] = highlightD(g, key, m);
        return g.hl[key];
      },
      advance(ch) {
        if (ch === ' ' || ch === ' ') return m.space;
        const g = font.glyph(ch); return g ? g.adv : m.space * 1.4;
      },
      /* Lay out text into lines. maxWidth in font units (Infinity = no wrap). */
      layout(text, maxWidth) {
        const lines = [];
        for (const para of text.split('\n')) {
          let line = [], x = 0, lastBreak = -1;
          const flush = upto => {
            const items = upto == null ? line : line.slice(0, upto);
            while (items.length && items[items.length - 1].ch === ' ') items.pop();
            const last = items[items.length - 1];
            lines.push({ items, width: last ? last.x + last.adv : 0 });
            const rest = upto == null ? [] : line.slice(upto + 1);
            const shift = rest.length ? rest[0].x : 0;
            rest.forEach(it => it.x -= shift);
            line = rest; x = rest.length ? rest[rest.length - 1].x + rest[rest.length - 1].adv + m.track : 0;
            lastBreak = -1;
          };
          for (const ch of para) {
            const adv = font.advance(ch);
            if (ch === ' ') lastBreak = line.length;
            line.push({ ch, x, adv });
            x += adv + m.track;
            if (ch !== ' ' && x - m.track > maxWidth && line.length > 1) {
              if (lastBreak >= 0) flush(lastBreak); else { const it = line.pop(); flush(); it.x = 0; line = [it]; x = it.adv + m.track; }
            }
          }
          flush();
        }
        return lines;
      }
    };
    return font;
  }

  TL.resolve = resolve;
  TL.buildFont = buildFont;
  TL.hasGlyph = ch => ch in GLYPHS;
})(window.TL);
