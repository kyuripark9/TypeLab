/* The breakage map: where the settings break the letters of the cards the Style page shows. Each card (PAGE_STYLES)
   at a time, in one process, each setting the panel offers on it (a control, or a slider nested under one, in the
   context that makes it show: showContext in tools/lib.ts) tried at every eighth of a slider and every other choice of
   a picker, the rest of the card as it is:

     npm run breaks                                  every card, every setting (writes .tools/out/breaks.json)
     npm run breaks -- --cards grotesque,didone      only these cards (the file keeps the others as they were)
     npm run breaks -- --keys aperture,counter       only these settings
     npm run breaks -- --report                      the ranking from the file, nothing drawn
     npm run breaks -- --report --keys aperture      and where each card breaks, value by value

   A letter is broken where the setting puts a fault on it (look, in tools/weights.ts) that the letter moved a hair the
   same way hasn't (NUDGE: a stencil's cuts, there as soon as Stencil is up, aren't pieces broken off), found again
   WINDOW either side along the slider (a notch read sharp at one step and not the next flickers): a piece more or
   fewer, a counter more or fewer, a needle out of the ink or a slit into it where the letter had no point or notch as
   sharp near and no more of them, or an outline bending back the other way BENDS times more (a nick, a lump, a wave).
   What moving a hair breaks at once (the letters leaving the font's own outline) is the side's `onset`, and counts at
   every eighth that side. Crossings aren't read (a fold within a unit, unseen, flickers along a slider; tools/widths.ts).
   Settings that change no letter's shape (Height, spacing) or are textures by design (Fill, Rough edges) aren't tried,
   and a setting's own marks aren't read as faults (INTENDED: a stencil's cuts, a tapered end's point, an ink trap's
   notch, Hand-drawn's waves, a letter form's other counters; a picker's choice draws its own curves, so only its pieces,
   counters, needles and slits are read: look at its choices drawn too). A value breaks a card where BREAK letters or more are broken, or every letter
   it changes when it changes fewer (a k's form changes one letter).

   The report ranks the settings by the share of cards each breaks somewhere, and says how far from the card's own value
   each side stays whole: a setting that breaks only toward its ends can be reined in (as Width is, shared/font-widths.ts);
   one that breaks a step away on most cards is better off the panel (as Contrast and Pinch are). It takes the heavy
   checks' lock (oneAtATime). */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFont, type Font } from '../shared/engine';
import { PAGE_STYLES, TERMINAL_SHAPES, controlInUse, type ControlKey } from '../shared/content';
import { STYLE_FONTS } from '../shared/free-fonts';
import { SPECS, freeAtOf, type Params } from '../shared/params';
import { fontFile } from '../server/free-fonts';
import { FONTS_DIR, OUT, holdFonts, letGo, oneAtATime, polys, showContext } from './lib';
import { bendsBack, look, newSharp, type Look } from './weights';
import type { Cmd } from '../shared/engine/types';

export const FILE = resolve(OUT, 'breaks.json');
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&?';
/** How far of the way to an end the letters a fault is read against are moved; how far along the slider either side a
    fault must be found again; how many more times a contour bends back than before it counts, and how tight a bend must
    be to be read (both as tools/widths.ts reads them); how many letters broken at once break a value. */
const NUDGE = 1 / 256, WINDOW = 1 / 64, BENDS = 4, BEND_FLAT = 150, BREAK = 3;
const EIGHTHS = Array.from({ length: 9 }, (_, i) => i / 8);

/** Not tried: the size, the spacing, the fills and rough edges (textures drawn over the letters on purpose). */
const SKIP = new Set(['height', 'letterSpacing', 'wordSpacing', 'sideBearing', 'fill', 'module', 'dotGain', 'rough']);
type Kind = 'pieces' | 'counters' | 'needle' | 'slit' | 'bends';
/** The pickers that draw a letter in another form, its counters its own. */
const FORM_KEYS = ['story', 'diagonals', 'apexForm', 'gForm', 'iForm', 'jForm', 'kForm', 'mForm', 'qForm', 'rForm', 'sForm', 'yForm', 'cellJoin', 'gridRows'];
/** What a setting draws on purpose, not read as a fault on it: a stencil's and a slice's cuts part the strokes and open
    the counters, and each part's cut edge bends back against its curve; a tapered end comes to a point, an ink trap is a
    notch. A picker's every choice (PICKED) draws another shape, its curves its own, so its bends aren't read either. */
const CUTS: Kind[] = ['pieces', 'counters', 'bends'];
const INTENDED: Record<string, Kind[]> = {
  ...Object.fromEntries(FORM_KEYS.map(k => [k, ['counters'] as Kind[]])),
  stencil: CUTS, stencilPos: CUTS, stencilRound: CUTS, slice: CUTS, slicePos: CUTS, sliceRound: CUTS,
  // (Gap parts the bar from the stems; Bowl overlap steps a bowl off its stem; Steps and Cursive's flicks turn
  // a corner or an entry back on itself)
  barGap: CUTS, overlap: ['pieces'], steps: ['bends'], cursive: ['bends'],
  terminal: ['needle'], terminalPoint: ['needle'], terminalTaper: ['needle'], terminalTip: ['needle'],
  serifTip: ['needle'], serifTipSlant: ['needle'], apex: ['needle'], joints: ['slit'], wobble: ['bends']
};
const PICKED: Kind[] = ['bends'];

interface Spec { kind: string; options?: readonly unknown[]; control?: { label: string }; sub?: { label: string; parent: string } }
const specOf = (k: string) => (SPECS as unknown as Record<string, Spec>)[k];

/** What one card at one value of a setting draws: how many letters it changes, and those broken (`ch:kind+kind`). */
export interface Cell { n: number; bad: string[] }
export interface KeyOut { at: string; changed: number; onset: { lo: string[]; hi: string[] }; values: Record<string, Cell> }
export interface CardOut { font: string | null; seconds: number; keys: Record<string, KeyOut> }
export interface Map_ { date: string; chars: string; cards: Record<string, CardOut> }

// ---- reading letters ----

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const bent = (cmds: Cmd[]) => bendsBack(cmds, BEND_FLAT).sort((p, q) => p - q);

/** A design's letters as drawn, each read for faults (sharp points down to 120°, as a baseline reads them) when asked. */
class Drawn {
  readonly f: Font;
  private read = new Map<string, { look: Look; bends: number[] } | null>();
  constructor(p: Params, held: Set<string>) { holdFonts(p, held); this.f = buildFont(p); }
  glyph(ch: string) { return this.f.letter(ch).glyph(ch); }
  ref(ch: string) {
    if (!this.read.has(ch)) { const g = this.glyph(ch); this.read.set(ch, g ? { look: look(g.cmds, this.f.m.cap, 120), bends: bent(g.cmds) } : null); }
    return this.read.get(ch)!;
  }
}

/** How many pieces of ink and counters outline `cmds` shows drawn PX_CAP pixels to the cap height (nonzero fill): ink
    joined across a pixel's corner is one piece, a counter is white the ink closes all round; a speck under SPECK pixels
    isn't counted. */
const PX_CAP = 120, SPECK = 6;
function inkParts(cmds: Cmd[], cap: number): { pieces: number; counters: number } {
  const rings = polys(cmds, 8), s = PX_CAP / cap;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  if (!rings.length) return { pieces: 0, counters: 0 };
  // (a pixel's margin all round, so the white outside is one piece)
  const W = Math.ceil((x1 - x0) * s) + 3, H = Math.ceil((y1 - y0) * s) + 3, ink = new Uint8Array(W * H);
  for (let row = 0; row < H; row++) {
    const y = y0 + (row - 1 + 0.5) / s, xs: { x: number; w: number }[] = [];
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if ((a.y <= y) !== (b.y <= y)) xs.push({ x: a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x), w: b.y > a.y ? 1 : -1 });
    }
    xs.sort((p, q) => p.x - q.x);
    let wind = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      wind += xs[i].w;
      if (!wind) continue;
      const c0 = Math.max(0, Math.round((xs[i].x - x0) * s + 1)), c1 = Math.min(W, Math.round((xs[i + 1].x - x0) * s + 1));
      for (let c = c0; c < c1; c++) ink[row * W + c] = 1;
    }
  }
  // (ink joined across corners, white only along sides, so a counter pinched to a corner is shut)
  const seen = new Uint8Array(W * H), stack: number[] = [];
  let pieces = 0, counters = 0;
  for (let start = 0; start < W * H; start++) {
    if (seen[start]) continue;
    const v = ink[start], diag = v === 1;
    let size = 0, edge = false;
    seen[start] = 1; stack.push(start);
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i / W) | 0;
      size++;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!diag && dx && dy)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!seen[j] && ink[j] === v) { seen[j] = 1; stack.push(j); }
      }
    }
    if (size < SPECK) continue;
    if (v) pieces++; else if (!edge) counters++;
  }
  return { pieces, counters };
}

/** The faults letter `ch` has drawn in `now` that it hasn't in `was`, setting `key`'s own marks left out. */
function faultsOf(ch: string, now: Drawn, was: Drawn, key: string): Kind[] {
  const g = now.glyph(ch), wg = was.glyph(ch);
  if (!g || !wg || g.d === wg.d) return [];
  const r = was.ref(ch)!, cap = was.f.m.cap, l = look(g.cmds, cap), out: Kind[] = [];
  // (counted again as drawn when the contours say otherwise: a k's arm drawn as its own contour over the stem is one
  // piece of ink to the eye, two to the contours)
  if (l.pieces !== r.look.pieces || l.counters !== r.look.counters) {
    const a = inkParts(g.cmds, cap), b = inkParts(wg.cmds, cap);
    if (a.pieces !== b.pieces) out.push('pieces');
    if (a.counters !== b.counters) out.push('counters');
  }
  // (a point new where the letter had none near, and more of them than it had: a serif's tip carried up with the
  // x-height is the same point moved, not a new one)
  const fresh = newSharp(l.sharp, r.look.sharp, cap).filter(q => !r.look.sharp.some(d => d.convex === q.convex && Math.hypot(d.x - q.x, d.y - q.y) < 0.1 * cap));
  for (const convex of [true, false]) {
    const more = l.sharp.filter(q => q.convex === convex).length > r.look.sharp.filter(q => q.convex === convex).length;
    if (more && fresh.some(q => q.convex === convex)) out.push(convex ? 'needle' : 'slit');
  }
  const bn = bent(g.cmds), bp = r.bends;
  if (bn.length === bp.length ? bn.some((v, i) => v >= bp[i] + BENDS) : sum(bn) >= sum(bp) + BENDS) out.push('bends');
  const own = [...(INTENDED[key] ?? []), ...(specOf(key).kind === 'number' ? [] : PICKED)];
  return out.filter(k => !own.includes(k));
}

/** Every letter `now` draws otherwise than `was`, and those of them broken, with what was found. */
function compare(now: Drawn, was: Drawn, key: string, only: string[] = [...CHARS]) {
  let n = 0;
  const bad = new Map<string, Kind[]>();
  for (const ch of only) {
    const g = now.glyph(ch), wg = was.glyph(ch);
    if (!g || !wg || g.d === wg.d) continue;
    n++;
    const k = faultsOf(ch, now, was, key);
    if (k.length) bad.set(ch, k);
  }
  return { n, bad };
}
const listed = (bad: Map<string, Kind[]>) => [...bad].map(([ch, k]) => `${ch}:${k.join('+')}`);

// ---- one card ----

/** Pickers the panel draws by name inside a control, not read off the spec: the Serifs control's shapes and the
    crossbar's ends (panel/ShapeControls.tsx, SliderControl.tsx), by the control they sit in. */
const IN_CONTROL: Record<string, string> = { serifShape: 'serif', barEnds: 'crossbar' };

/** The settings the panel offers on design `p`: its controls in use and the sliders nested under them, less SKIP. */
function keysOf(p: Params): string[] {
  return Object.keys(SPECS).filter(k => {
    if (SKIP.has(k)) return false;
    const s = specOf(k), parent = s.control ? k : s.sub?.parent ?? IN_CONTROL[k];
    if (!parent) return false;
    if ((parent === 'cellJoin' || parent === 'gridRows') && !(p.build === 'blocks' && p.blockForm === 'grid')) return false;
    return controlInUse(parent as ControlKey, p);
  });
}

/** Card `id`'s design: its settings in its own font, the font registered (in `held`); the engine's letters for a card
    no font stands behind (the slot and grid blocks, the arcs). */
function designOf(id: string, held: Set<string>): Params | null {
  const st = PAGE_STYLES.find(s => s.id === id)!, fid = STYLE_FONTS[id];
  if (!fid) return st.params;
  if (!existsSync(fontFile(FONTS_DIR, fid))) return null;
  const p = { ...st.params, freeFont: fid, freeAt: freeAtOf(st.params) } as Params;
  holdFonts(p, held);
  return p;
}

const fmt = (v: number) => v.toFixed(3);

/** Card `id` under each setting in `keys` (all it offers when empty). */
function card(id: string, keys: string[]): CardOut | null {
  const t0 = Date.now(), held = new Set<string>(), design = designOf(id, held);
  if (!design) return null;
  const out: CardOut = { font: STYLE_FONTS[id] ?? null, seconds: 0, keys: {} };
  const bases = new Map<string, Drawn>();
  for (const k of keysOf(design).filter(k => !keys.length || keys.includes(k))) {
    const ctx = showContext(k), tag = JSON.stringify(ctx), base = { ...design, ...ctx } as Params;
    if (!bases.has(tag)) bases.set(tag, new Drawn(base, held));
    const was = bases.get(tag)!, spec = specOf(k), changed = new Set<string>();
    const at = base[k as keyof Params];
    const res: KeyOut = { at: typeof at === 'number' ? fmt(at) : String(at), changed: 0, onset: { lo: [], hi: [] }, values: {} };
    const tally = (now: Drawn, ref: Drawn) => { for (const ch of CHARS) { const g = now.glyph(ch), wg = was.glyph(ch); if (g && wg && g.d !== wg.d) changed.add(ch); } return compare(now, ref, k); };
    if (spec.kind === 'number') {
      const a = at as number;
      for (const end of [0, 1]) {
        if (a === end) continue;
        const toward = (s: number) => ({ ...base, [k]: a + (end - a) * s }) as Params;
        // (what a hair's move breaks at once, found again at two hairs)
        const ref = new Drawn(toward(NUDGE), held);
        let onset = compare(ref, was, k).bad;
        if (onset.size) { const two = new Drawn(toward(2 * NUDGE), held); onset = new Map([...onset].filter(([ch]) => faultsOf(ch, two, was, k).length)); }
        res.onset[end ? 'hi' : 'lo'] = listed(onset);
        const side = (v: number) => (end > a ? v > a : v < a);
        for (const v of EIGHTHS.filter(side)) {
          const now = new Drawn({ ...base, [k]: v } as Params, held), { n, bad } = tally(now, ref);
          // (found again WINDOW either side, as far as the slider and this side of the card's own go)
          for (const w of [v - WINDOW, v + WINDOW].filter(w => w >= 0 && w <= 1 && side(w))) {
            if (!bad.size) break;
            const near = new Drawn({ ...base, [k]: w } as Params, held);
            for (const ch of [...bad.keys()]) if (!faultsOf(ch, near, ref, k).length) bad.delete(ch);
          }
          for (const [ch, kinds] of onset) if (!bad.has(ch)) bad.set(ch, kinds);
          res.values[fmt(v)] = { n, bad: listed(bad) };
        }
      }
    } else {
      // (a picker's choices, each against the card as it is; the stroke ends' each shape the panel offers)
      const tries: [string, Partial<Params>][] = k === 'terminal'
        ? TERMINAL_SHAPES.flatMap(g => g.shapes).filter(s => s.terminal !== base.terminal || s.form !== base.terminalForm)
          .map(s => [`${s.terminal}/${s.form}`, { terminal: s.terminal, terminalForm: s.form } as Partial<Params>])
        : spec.kind === 'boolean' ? [[String(!at), { [k]: !at } as Partial<Params>]]
        : (spec.options ?? []).filter(o => o !== 'auto' && o !== at).map(o => [String(o), { [k]: o } as Partial<Params>]);
      if (k === 'terminal') res.at = `${base.terminal}/${base.terminalForm}`;
      for (const [label, patch] of tries) {
        const now = new Drawn({ ...base, ...patch } as Params, held), { n, bad } = tally(now, was);
        res.values[label] = { n, bad: listed(bad) };
      }
    }
    res.changed = changed.size;
    out.keys[k] = res;
  }
  letGo(held);
  out.seconds = Math.round((Date.now() - t0) / 1000);
  return out;
}

// ---- the report ----

/** Whether a value breaks the card: BREAK letters or more broken, or all it changes when it changes fewer. */
export const breaks = (c: Cell) => c.bad.length > 0 && c.bad.length >= Math.min(BREAK, Math.max(1, c.n));
const IN_CONTROL_LABEL: Record<string, string> = { serifShape: 'Serif shape', barEnds: 'Bar ends' };
export const labelOf = (k: string) => {
  const s = specOf(k);
  if (s.control) return s.control.label;
  const parent = s.sub?.parent ?? IN_CONTROL[k];
  return `${specOf(parent)?.control?.label ?? parent} › ${s.sub?.label ?? IN_CONTROL_LABEL[k] ?? k}`;
};
export const isSlider = (k: string) => specOf(k).kind === 'number';

/** For a slider, how far of the way from the card's own value toward each end the letters stay whole (1 all the way). */
export function reach(r: KeyOut): [number, number] {
  const a = +r.at;
  return [0, 1].map(end => {
    if (Math.abs(a - end) < 1e-9) return 1;
    const vs = Object.keys(r.values).map(Number).filter(v => (end > a ? v > a : v < a)).sort((p, q) => Math.abs(p - a) - Math.abs(q - a));
    let ok = a;
    for (const v of vs) { if (breaks(r.values[fmt(v)])) return Math.abs(ok - a) / Math.abs(end - a); ok = v; }
    return 1;
  }) as [number, number];
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : NaN; };
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

export type Verdict = 'keep' | 'rein in' | 'cut or fix' | 'check by eye' | 'changes nothing';
/** One setting over the cards: how many it reaches and breaks, the median of how far a card's letters stay whole (the
    nearer side), what that suggests, and each card's own reach (1 whole; a picker 1 or 0; null where it changes nothing). */
export interface Ranked { k: string; on: number; broke: number; share: number; reach: number; verdict: Verdict; cards: Record<string, number | null> }
export function rank(m: Map_, keys: string[] = []): Ranked[] {
  const cards = Object.entries(m.cards);
  const all = [...new Set(cards.flatMap(([, c]) => Object.keys(c.keys)))].filter(k => !keys.length || keys.includes(k));
  return all.map(k => {
    const per = Object.fromEntries(cards.map(([id, c]) => {
      const r = c.keys[k];
      if (!r?.changed) return [id, null];
      return [id, isSlider(k) ? Math.min(...reach(r)) : Object.values(r.values).some(breaks) ? 0 : 1];
    })) as Record<string, number | null>;
    const on = Object.values(per).filter(v => v !== null) as number[], broke = on.filter(v => v < 1).length, share = on.length ? broke / on.length : 0;
    const mid = isSlider(k) ? median(on) : NaN;
    // (a picker's choices are read against the card as it is, not a hair along, so what it finds is looked at drawn)
    const verdict: Verdict = !on.length ? 'changes nothing' : share <= 0.1 ? 'keep' : !isSlider(k) ? 'check by eye' : mid >= 0.5 ? 'rein in' : 'cut or fix';
    return { k, on: on.length, broke, share, reach: mid, verdict, cards: per };
  }).sort((a, b) => b.share - a.share || b.broke - a.broke);
}

function report(m: Map_, keys: string[]) {
  const cards = Object.entries(m.cards), rows = rank(m, keys);
  console.log(`${cards.length} cards, ${rows.length} settings (${m.date})\n`);
  console.log(`${'setting'.padEnd(34)} ${'cards'.padStart(5)} ${'broken'.padStart(6)} share  whole (median)  suggests`);
  for (const r of rows) {
    console.log(`${`${labelOf(r.k)} (${r.k})`.slice(0, 34).padEnd(34)} ${String(r.on).padStart(5)} ${String(r.broke).padStart(6)}  ${pct(r.share)}  ${Number.isNaN(r.reach) ? '     -' : pct(r.reach).padStart(6)}          ${r.verdict}`);
  }
  const tally = new Map<string, number>();
  for (const r of rows) tally.set(r.verdict, (tally.get(r.verdict) ?? 0) + 1);
  console.log(`\n${[...tally].map(([v, n]) => `${n} ${v}`).join(', ')}`);
  console.log(`\nsettings each card breaks under:`);
  const count = (id: string) => rows.filter(r => r.cards[id] !== null && r.cards[id]! < 1).length;
  for (const [id] of [...cards].sort(([a], [b]) => count(b) - count(a))) console.log(`  ${id.padEnd(14)} ${String(count(id)).padStart(3)} of ${rows.filter(r => r.cards[id] !== null).length}`);
  if (keys.length) for (const { k } of rows) {
    console.log(`\n${labelOf(k)} (${k}):`);
    for (const [id, c] of cards) {
      const r = c.keys[k];
      if (!r?.changed) continue;
      const cells = Object.entries(r.values).filter(([, v]) => v.bad.length);
      const on = [...r.onset.lo, ...r.onset.hi].length ? `  onset ${[...r.onset.lo, ...r.onset.hi].join(' ')}` : '';
      console.log(`  ${id.padEnd(14)} at ${r.at}${cells.length ? '' : ' whole'}${on}`);
      for (const [v, cell] of cells) console.log(`    ${v.padStart(14)} ${breaks(cell) ? 'BROKEN' : '      '} ${cell.bad.length}/${cell.n}  ${cell.bad.join(' ')}`);
    }
  }
}

// ---- the run ----

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1].split(',') : []);
  const CARDS = PAGE_STYLES.map(s => s.id), askedCards = opt('--cards'), askedKeys = opt('--keys');
  for (const c of askedCards) if (!CARDS.includes(c)) throw new Error(`'${c}' isn't a card on the Style page; one of: ${CARDS.join(' ')}`);
  for (const k of askedKeys) if (!(k in SPECS)) throw new Error(`unknown setting '${k}'`);
  const kept: Map_ = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { date: '', chars: CHARS, cards: {} };

  if (args.includes('--report')) report(kept, askedKeys);
  else await oneAtATime('breaks', () => {
    const t0 = Date.now();
    mkdirSync(dirname(FILE), { recursive: true });
    for (const id of askedCards.length ? askedCards : CARDS) {
      const r = card(id, askedKeys);
      if (!r) { console.log(`${id.padEnd(14)} no font file for ${STYLE_FONTS[id]} in ${FONTS_DIR}; skipped`); continue; }
      // (a run over some settings keeps the card's others as the file had them)
      const was = kept.cards[id];
      kept.cards[id] = askedKeys.length && was ? { ...r, seconds: was.seconds, keys: { ...was.keys, ...r.keys } } : r;
      kept.date = new Date().toISOString().slice(0, 10);
      writeFileSync(FILE, JSON.stringify(kept));
      const broke = Object.entries(r.keys).filter(([, x]) => Object.values(x.values).some(breaks)).map(([k]) => k);
      console.log(`${id.padEnd(14)} ${Object.keys(r.keys).length} settings, ${broke.length} break it (${r.seconds} s)${broke.length ? `: ${broke.join(' ')}` : ''}`);
    }
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s; wrote ${FILE}`);
  });
}
