/* TypeLab — application shell. State → live font → preview, explainer diagram, inspector.
   A parameter change never leaves the browser: slider → state.params → TL.buildFont → SVG. */
(function (TL) {
  'use strict';
  const G = TL.geom;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n1 = v => Math.round(v * 10) / 10;
  const STORE = 'typelab:v1';

  const state = {
    params: Object.assign({}, TL.STYLES[0].params), styleId: TL.STYLES[0].id, name: 'My TypeLab Font',
    category: 'style', active: 'weight', hot: false,
    mode: 'sentence', custom: 'Hamburgefonstiv 123', sizes: { sentence: 76, alphabet: 62, paragraph: 30, custom: 96 },
    inspect: null, part: null, skeleton: false, dirty: false
  };
  let font = TL.buildFont(state.params);
  const hist = { stack: [], i: -1 };

  /* ------------------------------------------------------------------ state & history */
  function snapshot() { return JSON.stringify({ p: state.params, s: state.styleId }); }
  function commit() {
    const s = snapshot();
    if (hist.stack[hist.i] === s) return;
    hist.stack.splice(hist.i + 1); hist.stack.push(s);
    if (hist.stack.length > 200) hist.stack.shift();
    hist.i = hist.stack.length - 1; state.dirty = true; syncHeader();
  }
  function travel(d) {
    const j = hist.i + d; if (j < 0 || j >= hist.stack.length) return;
    hist.i = j; const o = JSON.parse(hist.stack[j]);
    state.params = o.p; state.styleId = o.s; state.dirty = true;
    syncHeader(); renderPanel(); renderStyleCards(); live();
  }
  function syncHeader() {
    $('#btn-undo').disabled = hist.i <= 0; $('#btn-redo').disabled = hist.i >= hist.stack.length - 1;
    $('#dirty').classList.toggle('on', state.dirty);
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ params: state.params, styleId: state.styleId, name: state.name, custom: state.custom })); state.dirty = false; syncHeader(); toast('Saved to this browser'); }
    catch (e) { toast('Could not save — storage is unavailable'); }
  }
  function restore() {
    try {
      const o = JSON.parse(localStorage.getItem(STORE) || 'null'); if (!o || !o.params) return false;
      state.params = Object.assign({}, TL.DEFAULTS, o.params); state.styleId = o.styleId || state.styleId;
      state.name = o.name || state.name; if (o.custom) state.custom = o.custom;
      return true;
    } catch (e) { return false; }
  }

  let raf = 0;
  function setParam(key, v) { state.params[key] = v; if (!raf) raf = requestAnimationFrame(live); }
  function live() {
    raf = 0;
    font = TL.buildFont(state.params);
    updateDefs(false); renderPreview(); renderDiagram();
    if (state.inspect) renderInspectorCanvas();
    clearTimeout(live.t); live.t = setTimeout(() => { updateDefs(true); layoutStrip(); if (state.inspect) renderInspectorSide(); }, 110);
  }

  /* ------------------------------------------------------------------ shared glyph <defs> */
  const defs = { g: {}, h: {}, stamp: {} };
  function initDefs() {
    let h = '';
    for (const ch of TL.ALL_CHARS) { const c = ch.charCodeAt(0); h += `<path id="g${c}"/><path id="h${c}"/>`; }
    $('#glyph-defs').innerHTML = h;
    for (const ch of TL.ALL_CHARS) { const c = ch.charCodeAt(0); defs.g[ch] = $('#g' + c); defs.h[ch] = $('#h' + c); }
  }
  const hlKey = () => (state.hot && state.category !== 'style' ? (TL.SERIF_SUBS[state.active] ? 'serif' : state.active) : null);
  function previewChars() {
    const set = new Set(blocks().map(b => b.text).join(''));
    if (state.inspect) set.add(state.inspect);
    return set;
  }
  function updateDefs(all) {
    const key = hlKey(), hot = all ? null : previewChars();
    for (const ch of TL.ALL_CHARS) {
      if (hot && !hot.has(ch)) continue;
      const g = font.glyph(ch); if (!g) continue;
      if (defs.stamp[ch] !== font) { defs.g[ch].setAttribute('d', g.d); defs.stamp[ch] = font; }
      const hd = key ? font.hl(ch, key) : '';
      if (defs.h[ch]._d !== hd) { defs.h[ch].setAttribute('d', hd); defs.h[ch]._d = hd; }
    }
  }

  /* ------------------------------------------------------------------ navigation */
  function renderNav() {
    $('#nav').innerHTML = `<div class="nav-title">Design</div>` + TL.CATEGORIES.map(c =>
      `<button class="nav-item${c.id === state.category ? ' on' : ''}" data-cat="${c.id}"><span class="nav-label">${c.label}</span><span class="nav-hint">${c.hint}</span></button>`).join('') +
      `<div class="nav-foot"><span>Based on</span><b>${esc(styleOf().name)}</b></div>`;
  }
  const styleOf = () => TL.STYLES.find(s => s.id === state.styleId) || TL.STYLES[0];
  function setCategory(id, active) {
    state.category = id;
    if (id === 'style') closeInspector();
    else state.active = active || Object.keys(TL.CONTROLS).find(k => TL.CONTROLS[k].cat === id);
    renderNav(); renderPanel(); renderStyleCards(); updateDefs(false); renderPreview();
  }

  /* ------------------------------------------------------------------ style cards */
  const styleFonts = {};
  function renderStyleCards() {
    const box = $('#style-cards');
    box.hidden = state.category !== 'style';
    if (box.hidden) return;
    box.innerHTML = `<div class="cards-head"><h1>Start with a style</h1><p>These aren’t finished fonts — they’re starting systems. Pick one, then reshape everything.</p></div><div class="cards">` +
      TL.STYLES.map(s => {
        const f = styleFonts[s.id] || (styleFonts[s.id] = TL.buildFont(s.params));
        const ln = f.layout('Aa', Infinity)[0];
        const paths = ln.items.map(it => `<path d="${f.glyph(it.ch).d}" transform="translate(${n1(it.x)},0)"/>`).join('');
        const pad = (1500 - ln.width) / 2;
        return `<button class="card${s.id === state.styleId ? ' on' : ''}" data-style="${s.id}">
          <svg viewBox="${-pad} -900 1500 1150" preserveAspectRatio="xMidYMid meet">${paths}</svg>
          <span class="card-name">${s.name}</span><span class="card-tags">${s.tags}</span></button>`;
      }).join('') + `</div>`;
  }
  function loadStyle(id) {
    const s = TL.STYLES.find(x => x.id === id); if (!s) return;
    state.params = Object.assign({}, s.params); state.styleId = id;
    commit(); renderNav(); renderStyleCards(); renderPanel(); live();
    toast(`${s.name} loaded — now make it yours`);
  }

  /* ------------------------------------------------------------------ preview */
  function blocks() {
    const S = state.sizes[state.mode];
    if (state.mode === 'sentence') return [{ text: TL.TEXTS.sentence, size: S }, { text: TL.TEXTS.alphabet, size: Math.max(18, S * 0.42), cls: 'sub' }];
    if (state.mode === 'alphabet') return [{ text: TL.TEXTS.alphabet + '\n' + TL.TEXTS.punct, size: S }];
    if (state.mode === 'paragraph') return [{ text: TL.TEXTS.paragraph, size: S }];
    return [{ text: state.custom || ' ', size: S }];
  }
  function renderStageBar() {
    const modes = [['sentence', 'Sentence'], ['alphabet', 'Alphabet'], ['paragraph', 'Paragraph'], ['custom', 'Custom']];
    $('#stage-bar').innerHTML = `<div class="tabs" role="tablist">` + modes.map(m =>
      `<button role="tab" class="tab${m[0] === state.mode ? ' on' : ''}" data-mode="${m[0]}">${m[1]}</button>`).join('') + `</div>
      <span class="bar-hint">Click any letter to inspect it</span>
      <label class="size"><span>Size</span><input type="range" id="size" min="14" max="220" value="${state.sizes[state.mode]}"><output id="size-out">${state.sizes[state.mode]}px</output></label>`;
    $('#custom-wrap').hidden = state.mode !== 'custom';
    if (state.mode === 'custom') $('#custom-text').value = state.custom;
  }
  function renderPreview() {
    const box = $('#preview'), m = font.m, key = hlKey();
    const widthPx = Math.max(200, $('#stage-scroll').clientWidth - 96);
    const topU = Math.max(m.asc, m.cap) + 70, LH = topU - m.desc + 150;
    const ring = key && TL.RING_KEYS[key];
    let html = '';
    for (const b of blocks()) {
      const sc = b.size / 1000, lines = font.layout(b.text, widthPx / sc);
      const H = (lines.length * LH + 40) * sc;
      let s = '';
      lines.forEach((ln, i) => {
        const y = n1(topU + i * LH);
        if (key === 'xHeight' || key === 'height') {
          const gy = key === 'height' ? m.cap : m.xh;
          s += `<line class="pv-guide" x1="0" x2="${n1(widthPx / sc)}" y1="${n1(y - gy)}" y2="${n1(y - gy)}"/><line class="pv-guide base" x1="0" x2="${n1(widthPx / sc)}" y1="${y}" y2="${y}"/>`;
        }
        ln.items.forEach((it, j) => {
          const g = font.glyph(it.ch);
          if (key === 'wordSpacing' && it.ch === ' ') s += `<rect class="pv-band" x="${n1(it.x)}" y="${n1(y - m.cap)}" width="${n1(it.adv)}" height="${n1(m.cap)}"/>`;
          if (!g) return;
          const c = it.ch.charCodeAt(0);
          if (key === 'sideBearing') s += `<rect class="pv-band" x="${n1(it.x)}" y="${n1(y - m.cap)}" width="${n1(g.lsb)}" height="${n1(m.cap)}"/><rect class="pv-band" x="${n1(it.x + it.adv - g.rsb)}" y="${n1(y - m.cap)}" width="${n1(g.rsb)}" height="${n1(m.cap)}"/>`;
          if (key === 'letterSpacing') { const nx = ln.items[j + 1], g2 = nx && font.glyph(nx.ch); if (g2) s += `<rect class="pv-band" x="${n1(it.x + it.adv - g.rsb)}" y="${n1(y - m.cap)}" width="${n1(Math.max(0, nx.x + g2.lsb - (it.x + it.adv - g.rsb)))}" height="${n1(m.cap)}"/>`; }
          s += `<g class="gl" data-c="${c}" transform="translate(${n1(it.x)},${y})"><rect x="0" y="${n1(-topU + 40)}" width="${n1(it.adv)}" height="${n1(LH - 80)}"/><use href="#g${c}"/>` +
            (key ? `<use class="${ring ? 'pv-ring' : 'pv-hl'}" href="#h${c}"/>` : '') + `</g>`;
        });
      });
      html += `<svg class="pv ${b.cls || ''}" width="${widthPx}" height="${n1(H)}" viewBox="0 0 ${widthPx} ${n1(H)}" style="--sw:${n1(1.6 / sc)}"><g transform="scale(${sc})">${s}</g></svg>`;
    }
    box.innerHTML = html;
  }

  /* ------------------------------------------------------------------ glyph strip */
  function renderStrip() {
    const groups = [['Uppercase', TL.CHARSET.upper], ['Lowercase', TL.CHARSET.lower], ['Figures', TL.CHARSET.digits], ['Punctuation', TL.CHARSET.punct]];
    $('#strip').innerHTML = groups.map(gr => `<div class="strip-group"><span class="strip-label">${gr[0]}</span>` + [...gr[1]].map(ch => {
      const c = ch.charCodeAt(0);
      return `<button class="cell" data-c="${c}" title="Inspect ${esc(ch)}"><svg viewBox="0 -880 1000 1180"><use href="#g${c}"/></svg></button>`;
    }).join('') + `</div>`).join('');
  }
  function layoutStrip() {
    $$('#strip .cell').forEach(b => {
      const ch = String.fromCharCode(+b.dataset.c), g = font.glyph(ch); if (!g) return;
      b.firstChild.firstChild.setAttribute('x', n1((1000 - g.adv) / 2));
      b.classList.toggle('on', ch === state.inspect);
    });
  }

  /* ------------------------------------------------------------------ control panel */
  const slider = (key, c, v) => `<div class="ctl${c.bipolar ? ' bipolar' : ''}" data-key="${key}">
      <div class="ctl-head"><span class="ctl-friendly">${c.friendly}</span><span class="ctl-tech">${c.tech}${c.advanced ? ' <em>Advanced</em>' : ''}</span></div>
      <input type="range" min="0" max="1000" value="${Math.round(v * 1000)}" style="--v:${v}" aria-label="${c.tech}">
      <div class="ctl-ends"><span>${c.lo}</span><span>${c.hi}</span></div></div>`;

  function renderPanel() {
    const P = state.params, panel = $('#panel');
    if (state.category === 'style') {
      const s = styleOf();
      panel.innerHTML = `<div class="panel-pad"><div class="eyebrow">Current starting style</div><h2 class="panel-title">${s.name}</h2>
        <p class="panel-tags">${s.tags}</p><p class="panel-text">${s.desc}</p>
        <button class="btn wide" id="reset-style">Reset to ${s.name} defaults</button>
        <div class="how"><div class="eyebrow">How TypeLab works</div>
        <ol><li><b>Pick a style</b> as your starting system.</li><li><b>Open a category</b> on the left — each control shows which part of the letter it changes.</li>
        <li><b>Click any letter</b> to inspect its anatomy.</li><li><b>Export</b> a real font file when you’re happy.</li></ol>
        <p class="motto">Don’t edit numbers. Design letters.</p></div></div>`;
      return;
    }
    const keys = Object.keys(TL.CONTROLS).filter(k => TL.CONTROLS[k].cat === state.category);
    let h = `<div class="explainer" id="explainer"></div><div class="ctl-list">`;
    for (const k of keys) {
      const c = TL.CONTROLS[k];
      if (c.type === 'options') {
        h += `<div class="ctl" data-key="${k}"><div class="ctl-head"><span class="ctl-friendly">${c.friendly}</span><span class="ctl-tech">${c.tech}</span></div>
          <div class="opts six">` + TL.TERMINALS.map(t => `<button class="opt${P.terminal === t[0] ? ' on' : ''}" data-opt="terminal" data-val="${t[0]}">${TL.terminalIcon(t[0])}<span>${t[1]}</span></button>`).join('') + `</div></div>`;
      } else if (c.type === 'serif') {
        h += `<div class="ctl" data-key="serif"><div class="ctl-row"><div class="ctl-head"><span class="ctl-friendly">${c.friendly}</span><span class="ctl-tech">${c.tech}</span></div>
          <button class="switch${P.serif ? ' on' : ''}" id="serif-switch" role="switch" aria-checked="${!!P.serif}" aria-label="Serifs"><i></i></button></div>
          <div class="reveal${P.serif ? ' open' : ''}" id="serif-more"><div><div class="sub-label">Serif shape</div><div class="opts four">` +
          TL.SERIF_SHAPES.map(t => `<button class="opt${P.serifShape === t[0] ? ' on' : ''}" data-opt="serifShape" data-val="${t[0]}">${TL.serifIcon(t[0])}<span>${t[1]}</span></button>`).join('') + `</div>` +
          Object.keys(TL.SERIF_SUBS).map(sk => slider(sk, TL.SERIF_SUBS[sk], P[sk])).join('') + `</div></div></div>`;
      } else h += slider(k, c, P[k]);
    }
    h += `</div>`;
    if (state.category === 'personality') h += `<p class="panel-note">Personality sliders are big gestures: each one nudges several properties at once, on top of your other settings.</p>`;
    panel.innerHTML = h;
    setActive(state.active, true);
  }
  function setActive(key, force) {
    if (!force && key === state.active) return;
    state.active = key;
    const top = TL.SERIF_SUBS[key] ? 'serif' : key, c = TL.CONTROLS[top], sub = TL.SERIF_SUBS[key];
    $$('#panel .ctl').forEach(e => e.classList.toggle('active', e.dataset.key === key || (e.dataset.key === top && !e.parentElement.closest('.ctl'))));
    const ex = $('#explainer'); if (!ex || !c) return;
    ex.innerHTML = `<div class="diagram-box" id="diagram"></div><div class="ex-text"><div class="ex-tech">${(sub || c).tech}</div><h3>${(sub || c).friendly}</h3><p>${c.explain}</p></div>`;
    renderDiagram();
    if (state.hot) { updateDefs(false); renderPreview(); }
    if (state.inspect) { renderInspectorCanvas(); markChips(); }
  }
  function renderDiagram() { const d = $('#diagram'); if (d) d.innerHTML = TL.diagram(font, state.active); }
  function setHot(v) { if (state.hot === v) return; state.hot = v; updateDefs(false); renderPreview(); }

  /* ------------------------------------------------------------------ inspector */
  function features(g, ch) {
    const out = [], seen = {}, add = id => { if (!seen[id] && TL.ANATOMY[id]) { seen[id] = 1; out.push(id); } };
    g.marks.forEach(k => add(k.type === 'terminal' ? null : k.type));
    g.strokes.forEach(s => add(s.part));
    if (g.counters.length) add('counter');
    if (g.marks.some(k => k.type === 'terminal')) add('terminal');
    if (g.serifs.length) add('serif');
    const lower = /[a-z]/.test(ch);
    if (lower) add('xHeight'); else if (/[A-Z0-9]/.test(ch)) add('capHeight');
    if (/[bdfhklt]/.test(ch)) add('ascender');
    if (/[gjpqy]/.test(ch)) add('descender');
    add('baseline');
    return out;
  }
  /* the four or five properties that matter most for this letter (serif takes a slot when on) */
  function glyphParams(g, ch) {
    let p;
    if (g.meta.params) p = g.meta.params.slice();
    else {
      p = [];
      if (g.marks.some(k => k.type === 'apex' || k.type === 'vertex')) p.push('apex');
      if (g.strokes.some(s => s.part === 'crossbar')) p.push('crossbar');
      if (g.counters.length) p.push('counter');
      if (g.marks.some(k => k.type === 'terminal')) p.push('terminal');
      if (g.strokes.some(s => s.curved)) p.push('curve');
      p.push(/[a-z]/.test(ch) ? 'xHeight' : 'height', 'weight', 'width');
    }
    if (state.params.serif) p.unshift('serif');
    return p.slice(0, 5);
  }
  function partD(g, id) {
    const D = G.cmdsToD;
    if (id === 'counter') return { d: g.counters.map(D).join('') };
    if (id === 'serif') return { d: g.serifs.map(D).join('') };
    if (id === 'terminal' || id === 'apex' || id === 'vertex') {
      const R = Math.max(34, font.m.s * 0.75);
      return { ring: true, d: g.marks.filter(k => k.type === id).map(p => `M${n1(p.x - R)} ${n1(-p.y)}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0Z`).join('') };
    }
    return { d: g.strokes.filter(s => s.part === id).map(s => D(s.cmds)).join('') };
  }
  function openInspector(ch) {
    if (!font.glyph(ch)) return;
    if (state.category === 'style') { state.category = 'structure'; state.active = 'weight'; renderNav(); renderPanel(); renderStyleCards(); }
    state.inspect = ch; state.part = null;
    const box = $('#inspector'); box.hidden = false;
    const kind = /[A-Z]/.test(ch) ? 'Uppercase' : /[a-z]/.test(ch) ? 'Lowercase' : /[0-9]/.test(ch) ? 'Figure' : 'Punctuation';
    box.innerHTML = `<div class="insp-head"><button class="btn ghost round" id="insp-prev" aria-label="Previous glyph">←</button>
      <div class="insp-title"><h2>${esc(ch)}</h2><span>${kind} · U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}</span></div>
      <button class="btn ghost round" id="insp-next" aria-label="Next glyph">→</button><span class="grow"></span>
      <label class="check"><input type="checkbox" id="insp-skel" ${state.skeleton ? 'checked' : ''}> Show skeleton</label>
      <button class="btn ghost" id="insp-close">Close ✕</button></div>
      <div class="insp-body"><div class="insp-canvas" id="insp-canvas"></div><div class="insp-side" id="insp-side"></div></div>`;
    updateDefs(false); renderInspectorCanvas(); renderInspectorSide(true); layoutStrip();
    const cell = $(`#strip .cell[data-c="${ch.charCodeAt(0)}"]`); if (cell) cell.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
  function closeInspector() { if (!state.inspect) return; state.inspect = null; $('#inspector').hidden = true; layoutStrip(); }
  function stepInspector(d) {
    const all = TL.ALL_CHARS, i = all.indexOf(state.inspect);
    openInspector(all[(i + d + all.length) % all.length]);
  }
  let sideSig = '';
  function renderInspectorSide(force) {
    const ch = state.inspect, g = font.glyph(ch); if (!g) return;
    const feats = features(g, ch), params = glyphParams(g, ch), sig = ch + feats.join() + params.join();
    if (!force && sig === sideSig) return; sideSig = sig;
    $('#insp-side').innerHTML = `<div class="eyebrow">Anatomy — hover to find it</div><ul class="anat">` +
      feats.map(f => `<li data-part="${f}"><b>${TL.ANATOMY[f][0]}</b><span>${TL.ANATOMY[f][1]}</span></li>`).join('') + `</ul>
      <div class="eyebrow">Shape this letter</div><div class="chips">` +
      params.map(k => `<button class="chip" data-param="${k}">${TL.CONTROLS[k].tech.split(' · ')[0]}</button>`).join('') + `</div>
      <p class="hint">Pick a property, then drag its control on the right. The highlighted area shows what it changes — across every letter, not just this one.</p>`;
    markChips();
  }
  function markChips() { const a = TL.SERIF_SUBS[state.active] ? 'serif' : state.active; $$('#insp-side .chip').forEach(c => c.classList.toggle('on', c.dataset.param === a)); }
  function renderInspectorCanvas() {
    const box = $('#insp-canvas'), ch = state.inspect, g = font.glyph(ch); if (!box || !g) return;
    const W = Math.max(320, box.clientWidth), H = Math.max(300, box.clientHeight), m = font.m;
    const top = Math.max(m.asc, m.cap) + 90, bot = m.desc - 60, padL = 96;
    const sc = Math.min((H - 24) / (top - bot), (W - padL - 60) / Math.max(g.adv, 500));
    const ox = padL + (W - padL - 30 - g.adv * sc) / 2, oy = 12 + top * sc;
    const Y = y => n1(oy - y * sc), X = x => n1(ox + x * sc);
    const lower = /[a-z]/.test(ch);
    const guides = [['baseline', 0, 'Baseline'], ['xHeight', m.xh, 'x-height'], ['capHeight', m.cap, 'Cap height'], ['ascender', m.asc, 'Ascender'], ['descender', m.desc, 'Descender']];
    let s = `<rect class="i-adv" x="${X(0)}" y="${Y(top - 40)}" width="${n1(g.adv * sc)}" height="${n1((top - 40 - bot - 20) * sc)}"/>`;
    for (const [id, y, label] of guides) {
      if (Math.abs(m.asc - m.cap) < 45 && id === 'ascender' && !lower) continue;
      const hotG = state.part === id || (!state.part && ((id === 'xHeight' && state.active === 'xHeight') || (id === 'capHeight' && state.active === 'height')));
      s += `<line class="i-guide${hotG ? ' hot' : ''}" x1="12" x2="${W - 12}" y1="${Y(y)}" y2="${Y(y)}"/><text class="i-label${hotG ? ' hot' : ''}" x="14" y="${Y(y) - 5}">${label}</text>`;
    }
    let hl = { d: '' };
    if (state.part) hl = partD(g, state.part);
    else { const k = TL.SERIF_SUBS[state.active] ? 'serif' : state.active; hl = { d: font.hl(ch, k), ring: TL.RING_KEYS[k] }; }
    let skel = '';
    if (state.skeleton) {
      skel = g.skeleton.map(r => `<polyline points="${r.map(p => n1(p.x) + ',' + n1(-p.y)).join(' ')}"/>`).join('') +
        g.skeleton.map(r => [r[0], r[r.length - 1]].map(p => `<circle cx="${n1(p.x)}" cy="${n1(-p.y)}" r="${n1(4 / sc)}"/>`).join('')).join('');
    }
    box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}
      <g transform="translate(${n1(ox)},${n1(oy)}) scale(${sc.toFixed(5)})" style="--sw:${n1(2 / sc)}">
      <path class="i-ink${state.skeleton ? ' dim' : ''}" d="${g.d}"/><path class="${hl.ring ? 'i-ring' : 'i-hl'}" d="${hl.d || ''}"/>
      <g class="i-skel">${skel}</g></g></svg>`;
  }

  /* ------------------------------------------------------------------ export popover & toast */
  function toggleExport(show) {
    const pop = $('#export-pop'); if (show === undefined) show = pop.hidden; pop.hidden = !show;
    if (!show) return;
    const r = $('#btn-export').getBoundingClientRect();
    pop.style.top = r.bottom + 8 + 'px'; pop.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
    pop.innerHTML = `<label class="field"><span>Font name</span><input id="font-name" value="${esc(state.name)}" maxlength="40"></label>
      <button class="exp" data-exp="otf"><b>Font file</b><span>.otf — install it and use it in any app</span></button>
      <button class="exp" data-exp="svg"><b>Specimen</b><span>.svg — vector sheet of every glyph</span></button>
      <button class="exp" data-exp="json"><b>Settings</b><span>.json — reopen this design later</span></button>
      <label class="exp import"><b>Import settings…</b><span>Load a .typelab.json file</span><input type="file" id="import" accept=".json,application/json" hidden></label>`;
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.classList.remove('show'); }, 2200);
  }

  /* ------------------------------------------------------------------ events */
  function bind() {
    $('#nav').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) setCategory(b.dataset.cat); });
    $('#style-cards').addEventListener('click', e => { const b = e.target.closest('[data-style]'); if (b) loadStyle(b.dataset.style); });
    $('#stage-bar').addEventListener('click', e => {
      const b = e.target.closest('[data-mode]'); if (!b) return;
      state.mode = b.dataset.mode; renderStageBar(); updateDefs(false); renderPreview();
      if (state.mode === 'custom') { const t = $('#custom-text'); t.value = state.custom; t.focus(); }
    });
    $('#stage-bar').addEventListener('input', e => {
      if (e.target.id !== 'size') return;
      state.sizes[state.mode] = +e.target.value; $('#size-out').textContent = e.target.value + 'px'; renderPreview();
    });
    $('#custom-text').addEventListener('input', e => { state.custom = e.target.value; updateDefs(false); renderPreview(); });
    const pick = e => { const g = e.target.closest('[data-c]'); if (g) openInspector(String.fromCharCode(+g.dataset.c)); };
    $('#preview').addEventListener('click', pick);
    $('#strip').addEventListener('click', pick);

    const panel = $('#panel');
    panel.addEventListener('input', e => {
      const c = e.target.closest('.ctl'); if (!c || e.target.type !== 'range') return;
      let v = +e.target.value / 1000;
      if (c.classList.contains('bipolar') && Math.abs(v - 0.5) < 0.025) { v = 0.5; }
      e.target.style.setProperty('--v', v); setActive(c.dataset.key); setHot(true); setParam(c.dataset.key, v);
    });
    panel.addEventListener('change', e => { if (e.target.type === 'range') { const c = e.target.closest('.ctl'); if (c && c.classList.contains('bipolar')) e.target.value = state.params[c.dataset.key] * 1000; commit(); } });
    panel.addEventListener('dblclick', e => {
      const c = e.target.closest('.ctl'); if (!c || e.target.type !== 'range') return;
      const v = styleOf().params[c.dataset.key]; e.target.value = v * 1000; e.target.style.setProperty('--v', v); setParam(c.dataset.key, v); commit();
    });
    panel.addEventListener('pointerover', e => { const c = e.target.closest('.ctl'); if (c) { setActive(c.dataset.key); setHot(true); } });
    panel.addEventListener('focusin', e => { const c = e.target.closest('.ctl'); if (c) { setActive(c.dataset.key); setHot(true); } });
    panel.addEventListener('pointerleave', () => setHot(false));
    panel.addEventListener('click', e => {
      const o = e.target.closest('[data-opt]');
      if (o) { state.params[o.dataset.opt] = o.dataset.val; $$(`[data-opt="${o.dataset.opt}"]`, panel).forEach(b => b.classList.toggle('on', b === o)); commit(); live(); return; }
      if (e.target.closest('#serif-switch')) {
        state.params.serif = !state.params.serif; const sw = $('#serif-switch');
        sw.classList.toggle('on', state.params.serif); sw.setAttribute('aria-checked', state.params.serif);
        $('#serif-more').classList.toggle('open', state.params.serif); commit(); live(); return;
      }
      if (e.target.closest('#reset-style')) loadStyle(state.styleId);
    });

    const insp = $('#inspector');
    insp.addEventListener('click', e => {
      if (e.target.closest('#insp-close')) return closeInspector();
      if (e.target.closest('#insp-prev')) return stepInspector(-1);
      if (e.target.closest('#insp-next')) return stepInspector(1);
      const chip = e.target.closest('[data-param]');
      if (chip) { const k = chip.dataset.param, cat = TL.CONTROLS[k].cat; state.part = null; if (cat !== state.category) setCategory(cat, k); else setActive(k, true); markChips(); renderInspectorCanvas(); }
    });
    insp.addEventListener('change', e => { if (e.target.id === 'insp-skel') { state.skeleton = e.target.checked; renderInspectorCanvas(); } });
    insp.addEventListener('pointerover', e => {
      const li = e.target.closest('[data-part]'), part = li ? li.dataset.part : null;
      if (part === state.part) return; state.part = part;
      $$('#insp-side [data-part]').forEach(x => x.classList.toggle('on', x === li)); renderInspectorCanvas();
    });

    $('#btn-undo').addEventListener('click', () => travel(-1));
    $('#btn-redo').addEventListener('click', () => travel(1));
    $('#btn-save').addEventListener('click', save);
    $('#btn-export').addEventListener('click', e => { e.stopPropagation(); toggleExport(); });
    const pop = $('#export-pop');
    pop.addEventListener('input', e => { if (e.target.id === 'font-name') { state.name = e.target.value; state.dirty = true; syncHeader(); } });
    pop.addEventListener('click', e => {
      e.stopPropagation();
      const b = e.target.closest('[data-exp]'); if (!b) return;
      const name = state.name.trim() || 'TypeLab';
      if (b.dataset.exp === 'otf') TL.exportOTF(font, name).then(() => toast('Font exported — open the .otf to install it')).catch(err => toast(err.message));
      if (b.dataset.exp === 'svg') { TL.exportSVG(font, name); toast('Specimen exported'); }
      if (b.dataset.exp === 'json') { TL.exportJSON(state.params, name); toast('Settings exported'); }
      toggleExport(false);
    });
    pop.addEventListener('change', e => {
      if (e.target.id !== 'import' || !e.target.files[0]) return;
      e.target.files[0].text().then(t => {
        const o = JSON.parse(t); if (!o.params) throw new Error();
        const clean = {}; for (const k in TL.DEFAULTS) { const v = o.params[k], d = TL.DEFAULTS[k]; clean[k] = typeof v === typeof d ? (typeof v === 'number' ? G.clamp(v) : v) : d; }
        state.params = clean; if (o.name) state.name = String(o.name).slice(0, 40);
        commit(); renderPanel(); live(); toast('Settings imported'); toggleExport(false);
      }).catch(() => toast('That file isn’t a TypeLab settings file'));
    });
    document.addEventListener('click', () => toggleExport(false));
    document.addEventListener('keydown', e => {
      const mod = e.metaKey || e.ctrlKey, typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox';
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); travel(e.shiftKey ? 1 : -1); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      else if (e.key === 'Escape') { if (!$('#export-pop').hidden) toggleExport(false); else closeInspector(); }
      else if (state.inspect && !typing && e.target.type !== 'range' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); stepInspector(e.key === 'ArrowLeft' ? -1 : 1); }
    });
    let rz = 0;
    new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { renderPreview(); if (state.inspect) renderInspectorCanvas(); }); }).observe($('#stage-scroll'));
    window.addEventListener('beforeunload', e => { if (state.dirty && hist.stack.length > 1) { e.preventDefault(); e.returnValue = ''; } });
  }

  function init() {
    const restored = restore();
    if (restored) state.category = 'structure';
    initDefs(); renderNav(); renderStageBar(); renderStrip(); renderStyleCards(); renderPanel(); bind();
    commit(); state.dirty = false; syncHeader();
    live(); updateDefs(true); layoutStrip();
    if (restored) toast('Welcome back — your saved design is loaded');
    TL.app = { state, openInspector, setCategory, setActive, setHot, get font() { return font; } };
    const q = new URLSearchParams(location.search); // deep links, handy for demos & tests
    if (q.get('style')) loadStyle(q.get('style'));
    if (q.get('mode')) { state.mode = q.get('mode'); renderStageBar(); }
    if (q.get('cat')) setCategory(q.get('cat'), q.get('active') || undefined);
    if (q.get('hot')) setHot(true);
    if (q.get('inspect')) openInspector(q.get('inspect'));
  }
  init();
})(window.TL);
