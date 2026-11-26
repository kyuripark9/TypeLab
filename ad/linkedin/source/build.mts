/* The LinkedIn carousel: seven 1080×1350 slides in TypeLab's own look (cream graph paper, warm ink, one lemon
   highlighter, a hot red for one letter alone), every specimen drawn by TypeLab's engine. Made to be read on a phone,
   where a slide shows about 390 px wide: one idea a slide, titles about 90 px, nothing under 20 px, and a line at the
   foot of each slide that gives a reason to swipe to the next. Writes slides.html beside this file; capture.mjs turns
   it into PNGs and a PDF.

     tools/node.sh node --import tsx ad/linkedin/source/build.mts      (from the repository root) */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFont, card, design, word } from './letters.mts';
import { CONTROLS, choicesOff, controlOff, type ControlKey } from '../../../shared/content/controls.ts';
import type { Params } from '../../../shared/params/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const INTRO = resolve(ROOT, 'Asset/intro');
const TOTAL = 7;
const lineup = readFileSync(resolve(ROOT, 'client/fonts/Lineup.otf')).toString('base64');
const mine = (name: string, sets: string[] = []) => design(`${INTRO}/${name}.typelab.json`, sets);

/** A slide's frame: the logo and its number at the top; the address, and the reason to swipe on, at the foot. */
function slide(n: number, body: string, next: string, cls = '') {
  const no = String(n).padStart(2, '0');
  return `<section class="slide ${cls}" id="s${no}">
  <header class="top"><span class="logo">TYPELAB</span><span class="num">${no} / ${String(TOTAL).padStart(2, '0')}</span></header>
  ${body}
  <footer class="foot"><span>typelab.ink</span><span class="next">${next}</span></footer>
</section>`;
}
const label = (t: string) => `<div class="label"><i></i>${t}</div>`;

/** Warn when a slide shows a setting the panel doesn't offer on that card. */
function offered(id: string, p: Params, sets: string[]) {
  for (const s of sets) {
    const k = s.split('=')[0] as ControlKey;
    if (k in CONTROLS && controlOff(k, p)) console.warn(`${id}: ${k} is off on this card`);
  }
  if (choicesOff(p, 'fill').has(p.fill)) console.warn(`${id}: fill ${p.fill} is off on this card`);
}
/** The largest size up to `cap` at which `text` stays within `max` px. */
function fit(p: Params, text: string, cap: number, max: number) {
  while (word(p, text, cap, { tight: true }).w > max && cap > 16) cap -= 1;
  return cap;
}

/* ---------- 01 The hook ---------- */
async function hook() {
  const rows: [string, string][] = [['ink-trap-display', 'DESIGN'], ['hand-hex', 'Design'], ['nodes', 'DESIGN'], ['my-chunky-rounded', 'Design']];
  let spec = '';
  for (const [name, text] of rows) spec += `<div class="specrow">${word(await mine(name), text, 104, { tight: true, top: 1.1, bot: 0.36 }).svg}</div>`;
  return slide(1, `
  <div class="spec">${spec}<div class="note n1">fonts I made with it</div></div>
  <h1>I couldn&rsquo;t find the font in my head. <span class="mk">So I built a tool to make it.</span></h1>`,
  'See how it works &rarr;', 'hook');
}

/* ---------- 02 The problem: a letter drawn point by point in Illustrator, and a moodboard of fonts that already exist ---------- */
/** A letter as Illustrator shows a selected path: the shape, its outline, its anchor points and their handles. */
function penLetter(p: Params, ch: string, h: number) {
  const f = buildFont(p), g = f.letter(ch).glyph(ch)!;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of g.cmds) for (let i = 1; i + 1 < c.length; i += 2) {
    const x = c[i] as number, y = -(c[i + 1] as number);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const pad = (y1 - y0) * 0.08, s = h / (y1 - y0 + 2 * pad), u = 1 / s;
  let marks = '', at: [number, number] = [0, 0];
  for (const c of g.cmds) {
    if (c[0] === 'C') {
      const [, ax, ay, bx, by, x, y] = c as unknown as [string, number, number, number, number, number, number];
      marks += `<line x1="${at[0]}" y1="${-at[1]}" x2="${ax}" y2="${-ay}"/><line x1="${x}" y1="${-y}" x2="${bx}" y2="${-by}"/>`
        + `<circle cx="${ax}" cy="${-ay}" r="${4 * u}"/><circle cx="${bx}" cy="${-by}" r="${4 * u}"/>`;
    }
    if (c[0] !== 'Z') { at = [c[c.length - 2] as number, c[c.length - 1] as number]; marks += `<rect class="anchor" x="${at[0] - 4.5 * u}" y="${-at[1] - 4.5 * u}" width="${9 * u}" height="${9 * u}"/>`; }
  }
  const vb = `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`;
  return `<svg class="pen" viewBox="${vb}" height="${h}" overflow="visible"><path d="${g.d}" fill="#1d1d1d"/><path d="${g.d}" fill="none" stroke="#1473e6" stroke-width="${1.6 * u}"/><g stroke="#1473e6" stroke-width="${1.2 * u}" fill="#fff">${marks}</g></svg>`;
}
async function problem() {
  const tools = ['M5 3l12 9-6 1 3 7-2 1-3-7-4 4z', 'M5 3l12 9-6 1 3 7-2 1-3-7-4 4z', 'M12 3l5 9-5 9-5-9z M12 3v9', 'M4 20c4-12 12-12 16 0', 'M6 5h12M12 5v15', 'M5 5h14v14H5z', 'M12 4a8 8 0 1 0 .01 0', 'M9 4h6l4 4v12H5V8z'];
  const icons = tools.map((d, i) => `<svg viewBox="0 0 24 24" class="${i === 2 ? 'on' : ''}"><path d="${d}"/></svg>`).join('');
  const boards = [16, 1, 18, 5, 8, 12].map(n => `<div class="board"><img src="img/sheets/s${n}.png" alt=""></div>`).join('');
  const layers = ['a &mdash; v7', 'a &mdash; v6', 'a &mdash; v5'].map((l, i) => `<div class="${i ? '' : 'on'}"><i></i>${l}</div>`).join('');
  const pins: [string, string[], string, string, string][] = [
    ['grotesque', [], 'Brand', '-3deg', 'too stiff'], ['didone', [], 'Serif?', '2deg', 'close, not quite'], ['woodtype', [], 'BOLD', '-2deg', 'too loud'],
    ['chancery', [], 'Script', '3deg', 'too formal'], ['squircle', ['width=1'], 'WIDE', '-1.5deg', 'almost?'], ['oldstyle', [], 'Classic', '2.5deg', 'seen it before']
  ];
  let board = '';
  for (const [id, sets, text, turn, note] of pins) {
    const p = await card(id, sets);
    board += `<div class="pin" style="--r:${turn}"><b class="tape"></b>${word(p, text, fit(p, text, 40, 200), { tight: true, top: 1.05, bot: 0.3 }).svg}<em>${note}</em></div>`;
  }
  return slide(2, `
  ${label('The problem')}
  <h2 class="h2s">Exploring type for a brand was <span class="mk">painfully slow.</span></h2>
  <div class="block">
    <div class="cap"><b>1</b>Draw every idea by hand<span>&middot; days for each one</span></div>
    <div class="scene ai">
      <div class="ai-top"><i></i><i></i><i></i><span class="tab on">TypeLab_sheets.ai @ 400%</span><span class="tab">a_sketch_v7.ai</span></div>
      <div class="ai-body">
        <div class="ai-tools">${icons}</div>
        <div class="ai-canvas"><div class="art">${penLetter(await card('didone'), 'a', 250)}</div><div class="boards">${boards}</div></div>
        <div class="ai-panel"><b>Layers</b>${layers}<div class="note n2a">day 3 of<br>the letter<br>a&hellip;</div></div>
      </div>
    </div>
  </div>
  <div class="block">
    <div class="cap"><b>2</b>Collect fonts that exist<span>&middot; never the one in my head</span></div>
    <div class="scene mood"><div class="pins">${board}</div></div>
  </div>`,
  'What if fonts had sliders? &rarr;');
}

/* ---------- 03 The idea: stack a few of the controls no other tool has, and the font becomes your own ---------- */
async function idea() {
  // each step adds one control to the ones before it, as the panel shows it: a slider, or a picked choice
  const steps: [string, string, string[], string][] = [
    ['Start', 'Neo Grotesque', [], 'card'],
    ['Facets', '100', ['chamfer=1'], 'slider'],
    ['Weight', '100', ['weight=1'], 'slider'],
    ['Slant', '60', ['slant=0.6'], 'slider'],
    ['Fill', 'Inline', ['fill=inline'], 'pick']
  ];
  let rows = '', sets: string[] = [];
  for (const [name, value, add, kind] of steps) {
    sets = [...sets, ...add];
    const p = await card('grotesque', sets);
    offered('grotesque', p, add);
    const ctl = kind === 'slider'
      ? `<div class="cv"><span>${name}</span><b>${value}</b></div><div class="track"><b style="width:${value}%"></b><i style="left:${value}%"></i></div>`
      : `<div class="cv"><span>${name}</span></div><span class="pick${kind === 'card' ? ' card' : ''}">${value}</span>`;
    rows += `<div class="srow"><div class="ctl">${ctl}</div><div class="sword">${word(p, 'Galaxy', 70, { tight: true, top: 1.08, bot: 0.32 }).svg}</div></div>`;
  }
  return slide(3, `
  ${label('The idea')}
  <h2>Stack a few controls. <span class="mk">Get a font no one else has.</span></h2>
  <div class="sheet sliders">${rows}</div>
  <p class="body">55 controls in all, and every step redraws all 127 characters at once.</p>`,
  'See what I made with it &rarr;');
}

/** A numbered marker on a screenshot, at a share of its width and height. */
const pin = (n: number, x: number, y: number) => `<span class="pinmark" style="left:${x}%;top:${y}%">${n}</span>`;
const legend = (items: string[]) => `<ol class="legend">${items.map((t, i) => `<li><span class="pinmark">${i + 1}</span>${t}</li>`).join('')}</ol>`;

/* ---------- 04 My designs: the real library, with fonts I made and looks from a few settings ---------- */
function gallery() {
  return slide(4, `
  ${label('My designs')}
  <h2>One tool, <span class="mk">a whole type library.</span></h2>
  <figure class="shot ui">${pin(1, 25.7, 19.5)}${pin(2, 46.8, 38.9)}${pin(3, 64.3, 12.7)}<img src="img/library.png" alt=""></figure>
  ${legend(['Every font I save, shown in its own letters', 'Download any of them as a font in one click', 'Search and sort the whole library'])}`,
  'Then make it real &rarr;');
}

/* ---------- 05 A real font: the real Export window, and the same font installing on a Mac ---------- */
function family() {
  return slide(5, `
  ${label('A real font')}
  <h2>Export a real font <span class="mk">you can install.</span></h2>
  <div class="exp">
    <figure class="shot dlg">${pin(1, 10.5, 44)}${pin(2, 98, 19.3)}${pin(3, 98, 33.5)}<img src="img/export.png" alt=""></figure>
    <figure class="shot fb">${pin(4, 85, 86)}<img src="img/fontbook.png" alt=""></figure>
  </div>
  ${legend(['Pick weights and italics', 'Name the font', 'Download .otf files', 'Install it, use it anywhere'])}`,
  'How I built it in a month &rarr;');
}

/* ---------- 06 How I built it ---------- */
function build() {
  const rounds = [149, 19, 9, 2, 8, 1, 7, 4, 0, 1, 4, 1];
  const bars = rounds.map((v, i) => `<div class="bar${v === 0 ? ' zero' : ''}"><span class="v">${v}</span><i style="height:${Math.max(4, Math.round(v / 149 * 300))}px"></i><span class="k">${i + 1}</span></div>`).join('');
  return slide(6, `
  ${label('How I built it')}
  <h2>Built with AI in a month. The hard part: <span class="mk">making it never break.</span></h2>
  <p class="body">Endless settings meant endless ways to break, so I had TypeLab test itself: 5,000 random mixes per round.</p>
  <div class="sheet chart">
    <div class="chead"><span>Broken designs found</span><span>by test round</span></div>
    <div class="bars">${bars}</div>
  </div>
  <div class="note n8">&hellip;then I still checked every letter by eye</div>`,
  'What I learned &rarr;');
}

/* ---------- 07 What I learned ---------- */
async function close() {
  const p = await mine('ink-trap-display');
  const lines = ['IF YOU CAN DESIGN', 'ONE THING, YOU CAN', 'DESIGN EVERYTHING.'];
  const cap = Math.min(...lines.map(t => fit(p, t, 96, 936)));
  const motto = lines.map(t => word(p, t, cap, { tight: true, top: 1.1, bot: 0.3 }).svg).join('');
  return slide(7, `
  <div class="motto">${motto}</div>
  <h2>AI turned my idea into a product. <span class="mk">Design judgment made it good.</span></h2>
  <div class="cta"><span class="url">typelab.ink</span><span class="go">Free to try &rarr;</span></div>
  <p class="ask">What would you design with it?</p>`,
  'Thank you!', 'last');
}

const CSS = `
@font-face { font-family: "TypeLab Lineup"; src: url(data:font/otf;base64,${lineup}) format("opentype"); }
:root {
  --paper: #fef5ec; --surface: #fdfaf6; --well: #f8f1e9;
  --ink: #201f1d; --ink-2: #46423d; --ink-3: #6b655e; --line: #e9e1d8; --line-2: #d6cec6;
  --marker: #f7f780; --custom: #ff034a;
  --ui: "Manrope", system-ui, sans-serif; --serif: "Gambetta", Georgia, serif; --mono: "Geist Mono", ui-monospace, monospace;
  --hand: "Just Me Again Down Here", cursive; --logo: "TypeLab Lineup", Georgia, serif;
  --grain: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='g' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' seed='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .125 0 0 0 0 .122 0 0 0 0 .114 1 0 0 0 0'/><feComponentTransfer><feFuncA type='table' tableValues='.14 .13 .12 .1 .08 .05 .02 .005 0 0 0 0 0 0 0 0 0 0 0 0 0'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(%23g)'/></svg>");
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { background: #d9d2ca; }
body { font: 500 36px/1.35 var(--ui); color: var(--ink); letter-spacing: -.01em; -webkit-font-smoothing: antialiased; display: grid; gap: 40px; justify-content: center; padding: 40px 0; }
.slide { width: 1080px; height: 1350px; position: relative; overflow: hidden; padding: 136px 72px 150px; display: flex; flex-direction: column; gap: 34px;
  background: linear-gradient(to right, rgba(32,31,29,.045) 1px, transparent 1px) 0 0 / 54px 54px,
              linear-gradient(to bottom, rgba(32,31,29,.045) 1px, transparent 1px) 0 0 / 54px 54px,
              var(--grain),
              radial-gradient(60% 55% at 16% 20%, rgba(32,31,29,.035), transparent 70%),
              radial-gradient(55% 60% at 86% 78%, rgba(32,31,29,.04), transparent 70%),
              var(--paper); }
.top, .foot { position: absolute; left: 72px; right: 72px; display: flex; justify-content: space-between; align-items: center; }
.top { top: 52px; padding-bottom: 20px; border-bottom: 2px solid var(--ink); font: 500 22px/1 var(--mono); letter-spacing: .06em; color: var(--ink-2); }
.logo { font: 400 34px/1 var(--logo); letter-spacing: .04em; color: var(--ink); }
.foot { bottom: 48px; font: 500 22px/1 var(--mono); letter-spacing: .06em; color: var(--ink-2); text-transform: uppercase; }
.next { font: 700 26px/1 var(--ui); letter-spacing: -.01em; text-transform: none; color: var(--ink); background: var(--marker); padding: 16px 26px; border-radius: 99px; box-shadow: inset 0 0 0 2px var(--ink); }
.label { display: flex; align-items: center; gap: 14px; font: 500 22px/1 var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--ink); }
.label i { width: 18px; height: 18px; background: var(--marker); box-shadow: inset 0 0 0 2px var(--ink); }
h1, h2 { font-family: var(--serif); font-weight: 450; letter-spacing: -.028em; line-height: 1.02; color: var(--ink); text-wrap: balance; }
h1 { font-size: 92px; }
h2 { font-size: 88px; }
.mk { background: linear-gradient(transparent 52%, var(--marker) 52%, var(--marker) 94%, transparent 94%); -webkit-box-decoration-break: clone; box-decoration-break: clone; padding: 0 .06em; margin: 0 -.06em; }
.body { font-size: 36px; line-height: 1.35; color: var(--ink-2); text-wrap: pretty; }
.sheet { background: var(--surface); box-shadow: 0 0 0 2px var(--line-2); }
.note { position: absolute; font: 400 54px/1 var(--hand); color: var(--custom); transform: rotate(-4deg); white-space: nowrap; }
svg.w { display: block; }

/* 01 */
.hook { gap: 40px; }
.spec { position: relative; border-top: 2px solid var(--ink); }
.specrow { border-bottom: 1.5px solid var(--line-2); padding: 14px 0; }
.n1 { right: 0; top: 250px; }
.hook h1 { margin-top: auto; }

/* 02 */
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; flex: 1; }
.opt { padding: 30px 30px 34px; display: flex; flex-direction: column; gap: 10px; }
.opt b { font: 700 38px/1.1 var(--ui); letter-spacing: -.02em; }
.opt > span { font-size: 30px; line-height: 1.25; color: var(--ink-2); }
.optart { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 12px; }
.files { flex-direction: column; align-items: flex-start; gap: 12px; }
.file { font: 500 23px/1 var(--mono); padding: 13px 20px; border-radius: 99px; background: var(--well); box-shadow: 0 0 0 1.5px var(--line-2); color: var(--ink-2); transform: translateX(calc(var(--i) * 12px)); }
.file:last-child { background: var(--ink); color: var(--paper); box-shadow: none; }

/* 02 */
.scene { position: relative; flex: none; }
.ai { height: 360px; background: #323232; border-radius: 12px; overflow: hidden; box-shadow: 0 24px 48px -16px rgba(32,31,29,.45); display: flex; flex-direction: column; }
.ai-top { height: 42px; background: #232323; display: flex; align-items: center; gap: 9px; padding: 0 16px; flex: none; }
.ai-top i { width: 13px; height: 13px; border-radius: 50%; background: #ff5f57; }
.ai-top i:nth-child(2) { background: #febc2e; } .ai-top i:nth-child(3) { background: #28c840; }
.ai-top .tab { margin-left: 8px; font: 500 16px/1 var(--ui); color: #9a9a9a; padding: 8px 14px; border-radius: 6px; }
.ai-top .tab.on { background: #3b3b3b; color: #ececec; }
.ai-body { flex: 1; display: grid; grid-template-columns: 52px 1fr 180px; min-height: 0; }
.ai-tools { background: #2a2a2a; display: flex; flex-direction: column; align-items: center; gap: 16px; padding-top: 16px; }
.ai-tools svg { width: 22px; height: 22px; fill: none; stroke: #bdbdbd; stroke-width: 1.6; }
.ai-tools svg.on { background: #505050; border-radius: 5px; padding: 3px; width: 30px; height: 30px; stroke: #fff; }
.ai-canvas { background: #535353; display: flex; gap: 18px; padding: 20px; overflow: hidden; }
.art { background: #fff; flex: none; width: 380px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
.boards { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-content: start; }
.board { background: #fff; aspect-ratio: 1474 / 1600; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
.board img { width: 100%; display: block; }
.ai-panel { background: #2a2a2a; color: #cfcfcf; font: 500 15px/1 var(--ui); display: flex; flex-direction: column; }
.ai-panel b { font: 700 15px/1 var(--ui); color: #f0f0f0; padding: 14px; border-bottom: 1px solid #3d3d3d; }
.ai-panel div { padding: 11px 14px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #353535; }
.ai-panel div i { width: 9px; height: 9px; background: #1473e6; }
.ai-panel div.on { background: #3a4a63; color: #fff; }
.anchor { fill: #fff; }
.h2s { font-size: 78px; }
.block { display: flex; flex-direction: column; gap: 12px; flex: none; }
.cap { display: flex; align-items: center; gap: 14px; font: 700 30px/1 var(--ui); color: var(--ink); }
.cap b { width: 38px; height: 38px; border-radius: 50%; background: var(--ink); color: #fff; font: 700 20px/38px var(--ui); font-variant-numeric: tabular-nums; letter-spacing: 0; text-align: center; flex: none; }
.cap span { font-weight: 500; color: var(--ink-2); margin-left: -4px; }
.ai-panel { position: relative; }
.n2a { left: 16px; bottom: 20px; font-size: 36px; line-height: 1.05; color: #ff5c86; white-space: normal; }
.mood { height: 272px; border-radius: 12px; background: #eadfcd; box-shadow: inset 0 0 0 2px #d9ccb6; overflow: hidden; }
.pins { position: absolute; inset: 22px 26px 20px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px 26px; }
.pin { background: #fff; position: relative; display: flex; align-items: center; justify-content: center; transform: rotate(var(--r)); box-shadow: 0 10px 18px -8px rgba(32,31,29,.5); }
.pin { flex-direction: column; gap: 4px; padding: 8px 0 6px; }
.pin em { font: 400 30px/1 var(--hand); font-style: normal; color: var(--custom); }
.tape { position: absolute; top: -11px; left: 50%; width: 80px; height: 22px; background: rgba(255,255,255,.55); box-shadow: 0 0 0 1px rgba(32,31,29,.08); transform: translateX(-50%) rotate(-5deg); }
.sticky { position: absolute; padding: 14px 18px; background: var(--marker); font: 400 34px/1 var(--hand); color: var(--custom); box-shadow: 0 10px 18px -8px rgba(32,31,29,.5); transform: rotate(var(--r)); z-index: 2; white-space: nowrap; }
.sticky.s0 { left: 214px; top: 8px; } .sticky.s1 { left: 560px; top: 128px; } .sticky.s2 { right: 24px; bottom: 26px; }

/* 03 */
.sliders { padding: 10px 34px; }
.srow { display: grid; grid-template-columns: 250px 1fr; align-items: center; gap: 40px; border-bottom: 1.5px solid var(--line); padding: 18px 0; }
.srow:last-child { border-bottom: 0; }
.ctl { display: flex; flex-direction: column; gap: 18px; }
.cv { display: flex; justify-content: space-between; align-items: baseline; font: 600 26px/1 var(--ui); color: var(--ink-2); }
.cv b { font: 500 26px/1 var(--mono); color: var(--ink); }
.track { position: relative; height: 6px; background: rgba(32,31,29,.2); border-radius: 6px; }
.track b { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); border-radius: 6px; }
.track i { position: absolute; top: 50%; width: 30px; height: 30px; border-radius: 50%; background: #fffdf9; box-shadow: 0 0 0 2px rgba(32,31,29,.85), 0 2px 5px rgba(32,31,29,.2); transform: translate(-50%, -50%); }
.sword { display: flex; }
.pick { font: 600 24px/1 var(--ui); padding: 11px 20px; border-radius: 99px; background: var(--marker); box-shadow: inset 0 0 0 2px var(--ink); align-self: flex-start; }
.pick.card { background: var(--surface); }

/* 04 */
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.dt { height: 232px; padding: 24px 28px; display: flex; flex-direction: column; }
.dt > b { font: 700 30px/1 var(--ui); letter-spacing: -.01em; }
.dart { flex: 1; display: flex; align-items: center; justify-content: center; gap: 16px; }
.dart svg.before { color: #a59d94; }
.arrow { font: 500 30px/1 var(--mono); color: var(--ink-3); }

/* 05 */
.gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.look { height: 168px; padding: 16px 22px 16px; display: flex; flex-direction: column; background: var(--surface); box-shadow: 0 0 0 2px var(--line-2); }
.look.ink { background: var(--ink); color: var(--paper); box-shadow: none; }
.look.lemon { background: var(--marker); box-shadow: 0 0 0 2px var(--ink); }
.lart { flex: 1; display: flex; align-items: center; justify-content: center; }
.lcap { font: 500 20px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; opacity: .8; }

/* 06 */
.shot { box-shadow: 0 0 0 2px var(--line-2), 0 24px 48px -16px rgba(32,31,29,.32); overflow: hidden; background: var(--surface); }
.shot img { display: block; width: 100%; }
.pts { margin: 0 -8px; }
.scopes { display: flex; flex-direction: column; gap: 16px; }
.scopes div { display: flex; align-items: center; gap: 20px; font-size: 32px; color: var(--ink-2); }
.scopes b { font: 700 26px/1 var(--ui); padding: 14px 24px; border-radius: 99px; flex: none; width: 196px; text-align: center; }
b.sync { background: var(--marker); box-shadow: inset 0 0 0 2px var(--ink); color: var(--ink); }
b.own { background: var(--custom); color: #fff; }

/* 07 */
.fam { padding: 8px 30px; }
.frow { display: grid; grid-template-columns: 180px 1fr 1fr; column-gap: 24px; align-items: center; border-bottom: 1.5px solid var(--line); padding: 10px 0; }
.frow:last-child { border-bottom: 0; }
.frow.on { background: var(--marker); margin: 0 -30px; padding: 10px 30px; box-shadow: inset 0 0 0 2px var(--ink); }
.wname { font: 500 20px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); }
.frow.on .wname { color: var(--ink); }
.fw { display: flex; }
.chips { display: flex; flex-wrap: wrap; gap: 12px; }
.chips span { font: 600 26px/1 var(--ui); padding: 15px 24px; border-radius: 99px; background: var(--surface); box-shadow: 0 0 0 2px var(--ink); }
.chips span:first-child { background: var(--marker); }

/* 05, 07: screenshots with numbered marks */
.shot.ui, .dlg, .fb { position: relative; overflow: visible; }
.shot.ui img, .dlg img, .fb img { border-radius: inherit; }
.pinmark { position: absolute; width: 38px; height: 38px; margin: -19px 0 0 -19px; border-radius: 50%; background: var(--ink); color: #fff; font: 700 20px/38px var(--ui); font-variant-numeric: tabular-nums; letter-spacing: 0; text-align: center; box-shadow: 0 0 0 2.5px #fff; z-index: 2; }
.legend { list-style: none; display: flex; flex-direction: column; gap: 16px; }
.legend li { display: flex; align-items: center; gap: 18px; font-size: 30px; line-height: 1.2; color: var(--ink-2); }
.legend .pinmark { position: static; margin: 0; flex: none; box-shadow: none; }
.exp { position: relative; height: 610px; flex: none; }
.dlg { position: absolute; left: 0; top: 0; width: 760px; }
.fb { position: absolute; right: -16px; bottom: 0; width: 540px; border-radius: 10px; box-shadow: 0 0 0 1px rgba(0,0,0,.3), 0 30px 60px -18px rgba(32,31,29,.55); }
.exp + .legend { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; }
.exp + .legend li { font-size: 27px; }

/* 08 */
.chart { padding: 24px 30px 20px; }
.chead { display: flex; justify-content: space-between; font: 500 22px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); padding-bottom: 14px; border-bottom: 1.5px solid var(--line-2); }
.bars { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; align-items: end; height: 390px; padding-top: 16px; }
.bars .bar { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 10px; height: 100%; }
.bars i { display: block; width: 100%; background: var(--ink); }
.bars .v { font: 500 24px/1 var(--mono); }
.bars .k { font: 500 20px/1 var(--mono); color: var(--ink-3); border-top: 1.5px solid var(--line-2); width: 100%; text-align: center; padding-top: 10px; }
.bars .zero i { background: var(--marker); box-shadow: 0 0 0 2px var(--ink); }
.n8 { left: 300px; bottom: 150px; font-size: 48px; transform: rotate(-3deg); }

/* 09 */
.last { gap: 40px; }
.motto { display: flex; flex-direction: column; gap: 12px; padding-bottom: 36px; border-bottom: 2px solid var(--ink); }
.last h2 { font-size: 78px; }
.cta { display: flex; align-items: center; gap: 24px; margin-top: auto; }
.cta .url { font: 450 80px/1 var(--serif); letter-spacing: -.02em; background: var(--marker); padding: 18px 40px 24px; border-radius: 999px; box-shadow: inset 0 0 0 2.5px var(--ink); }
.cta .go { font: 700 32px/1 var(--ui); }
.ask { font: 400 60px/1 var(--hand); color: var(--custom); transform: rotate(-2deg); }

@page { size: 1080px 1350px; margin: 0; }
@media print { html, body { background: none; } body { display: block; padding: 0; } .slide { break-after: page; } }
`;

const slides = [await hook(), await problem(), await idea(), gallery(), family(), build(), await close()];
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TypeLab carousel</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&family=Geist+Mono:wght@400;500&family=Just+Me+Again+Down+Here&display=block">
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=gambetta@1&display=block">
<style>${CSS}</style></head><body>
${slides.join('\n')}
</body></html>`;
writeFileSync(resolve(HERE, 'slides.html'), html);
console.log(resolve(HERE, 'slides.html'), (html.length / 1e6).toFixed(1) + ' MB');
