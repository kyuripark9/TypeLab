/* The breakage map: where the settings break the letters of the cards the Style page shows. Each card (PAGE_STYLES)
   at a time, in one process, each setting the panel offers on it (a control, or a slider nested under one, in the
   context that makes it show: showContext in tools/lib.ts) tried at every eighth of a slider and every other choice of
   a picker, the rest of the card as it is:

     npm run breaks                                  every card, every setting (writes .tools/out/breaks.json)
     npm run breaks -- --cards grotesque,didone      only these cards (the file keeps the others as they were)
     npm run breaks -- --keys aperture,counter       only these settings
     npm run breaks -- --report                      the ranking from the file, nothing drawn
     npm run breaks -- --report --keys aperture      and where each card breaks, value by value
     npm run breaks -- --update                      how far each slider carries each own-font card whole, the reins
                                                     off (rewrites shared/font-reins.ts; about an hour and a half)
     npm run breaks -- --tighten                     then, after the map run again: the reins drawn in where it still
                                                     breaks a letter's form (rewrites shared/font-reins.ts)
     npm run breaks -- --offs                        the pickers' choices that break each card, from the last map
                                                     (rewrites shared/font-offs.ts)
     npm run breaks -- --traits                      the Adjust tab's steps on each card, each alone and each two
                                                     together (writes .tools/out/breaks-traits.json)
     npm run breaks -- --shuffle 200 [--seed 1]      that many of the Shuffle button's mixes on each card, the ones that
       [--dense]                                     break it kept (writes .tools/out/breaks-shuffle.json); --dense
                                                     picks most traits in each mix
     npm run breaks -- --shuffle-offs                each mix that broke a card cut down to the fewest steps that still
                                                     break it, those sets added to shared/trait-offs.ts
     npm run breaks -- --sliders 200 [--seed 1]     that many mixes of sliders on each card, as the editor moves them
                                                     (one to three of Weight, Verticals, Horizontals, Contrast, Width
                                                     and Slant, none to two others, each at a value at random), the
                                                     ones that break it kept (writes .tools/out/breaks-sliders.json)
     npm run breaks -- --sliders-cut                 each mix of sliders that broke a card cut down to the fewest
                                                     that still break it, printed
     npm run breaks -- --mixed 200 [--seed 1]       that many mixes of pickers and sliders on each card together (one or
                                                     two choices, none to three body sliders, none to two others), the
                                                     ones that break it kept (writes .tools/out/breaks-mixed.json)
     npm run breaks -- --mixed-cut                   each of those cut down to the fewest steps that still break it,
                                                     printed (and written to .tools/out/breaks-mixed-cut.json)
     npm run breaks -- --update-built                how far each slider carries the blocks' and arcs' letters whole,
                                                     Weight and the rest with them (rewrites BUILT_REINS)
     npm run breaks -- --try 'weight:bold,width:condensed' --cards grotesque     one mix (steps, or key=value) on a card

   A letter is broken where the setting puts a fault on it (look, in tools/weights.ts) that the letter moved a hair the
   same way hasn't (NUDGE: a stencil's cuts, there as soon as Stencil is up, aren't pieces broken off), found again
   WINDOW either side along the slider (a notch read sharp at one step and not the next flickers): a piece more or
   fewer, a counter more or fewer or one pinched to a hairline (each found again drawn FINE times finer, so a hairline
   coming apart in the pixels isn't read), a needle out of the ink or a slit into it where the letter had no point or notch as
   sharp near and no more of them, or an outline bending back the other way BENDS times more (a nick, a lump, a wave).
   What moving a hair breaks at once (the letters leaving the font's own outline) is the side's `onset`, and counts at
   every eighth that side, but for a contour bending back more (the font's outline re-fitted as it leaves it: on the
   industrial, blackletter and chancery cards, where it was read most, unseen drawn). Crossings aren't read (a fold within a unit, unseen, flickers along a slider; tools/widths.ts).
   Settings that change no letter's shape (Height, spacing) or are textures by design (Fill, Rough edges) aren't tried,
   and a setting's own marks aren't read as faults (INTENDED: a stencil's cuts, a tapered end's point, an ink trap's
   notch, Hand-drawn's waves, a letter form's other counters; a picker's choice draws its own curves, so only its pieces,
   counters, needles and slits are read: look at its choices drawn too). A value breaks a card where BREAK letters or more are broken, or every letter
   it changes when it changes fewer (a k's form changes one letter).

   The report ranks the settings by the share of cards each breaks somewhere, and says how far from the card's own value
   each side stays whole: a setting that breaks only toward its ends can be reined in (as Width is, shared/font-widths.ts);
   one that breaks a step away on most cards is better off the panel (as Contrast and Pinch are). It takes the heavy
   checks' lock (oneAtATime).

   The Adjust tab's traits are measured as mixes: --shuffle draws the Shuffle button's mixes on each card and keeps
   those that break it in form (shatters: a piece or a counter on two letters or more), and --shuffle-offs cuts each down
   to the fewest steps that still break the card, the sets traitsOn then leaves the last step of (TRAIT_OFFS). The
   editor's sliders are measured the same way (--sliders): mixes of them at random values, read as a mix is; and with
   the pickers' and switches' choices picked too (--mixed): the choices read against the card, the sliders against the
   card with the choices picked. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFont, type Font } from '../shared/engine';
import { PAGE_STYLES, TERMINAL_SHAPES, choicesOff, controlInUse, controlOff, keepWhole, lettersOf, subInUse, type ControlKey } from '../shared/content';
import { BUILT_REINS, FONT_REINS } from '../shared/font-reins';
import { OWN_FAMILIES, STYLE_FONTS } from '../shared/free-fonts';
import { FREE_AT_KEYS, SPECS, freeAtOf, type Params } from '../shared/params';
import { TRAIT_OFFS } from '../shared/trait-offs';
import { TRAITS, TRAIT_SECTIONS, applyTraits, traitOption, traitsOn, type TraitId, type Traits } from '../shared/traits';
import { fontFile } from '../server/free-fonts';
import { FONTS_DIR, OUT, ROOT, holdFonts, letGo, oneAtATime, polys, showContext } from './lib';
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
type Kind = 'pieces' | 'counters' | 'pinched' | 'needle' | 'slit' | 'bends';
/** The pickers whose forms have other counters of their own: a two-storey g, an R's looped leg, the grid's joins and
    rows. (Read for every letter form, an A's top serif closing its counter to a teardrop passed.) */
const FORM_KEYS = ['gForm', 'rForm', 'cellJoin', 'gridRows'];
/** What a setting draws on purpose, not read as a fault on it: a stencil's and a slice's cuts part the strokes and open
    the counters, and each part's cut edge bends back against its curve; a tapered end comes to a point, an ink trap is a
    notch. A picker's every choice (PICKED) draws another shape, its curves its own, so its bends aren't read either. */
const CUTS: Kind[] = ['pieces', 'counters', 'pinched', 'bends'];
const INTENDED: Record<string, Kind[]> = {
  ...Object.fromEntries(FORM_KEYS.map(k => [k, ['counters', 'pinched'] as Kind[]])),
  stencil: CUTS, stencilPos: CUTS, stencilRound: CUTS, slice: CUTS, slicePos: CUTS, sliceRound: CUTS,
  // (Gap parts the bar from the stems; Bowl overlap steps a bowl off its stem; Steps and Cursive's flicks turn
  // a corner or an entry back on itself)
  barGap: CUTS, overlap: ['pieces'], steps: ['bends'], cursive: ['bends'],
  // (square joins meet a bowl and its stem in a corner, a raised M's vertex comes to a point: looked at drawn, whole)
  bowlJoin: ['needle', 'slit'], mForm: ['needle'],
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
type Parts = { pieces: number; counters: number; open: number };
export class Drawn {
  readonly f: Font;
  readonly p: Params;
  private read = new Map<string, { look: Look; bends: number[]; parts?: Parts; fine?: Parts } | null>();
  constructor(p: Params, held: Set<string>) { holdFonts(p, held); this.p = p; this.f = buildFont(p); }
  glyph(ch: string) { return this.f.letter(ch).glyph(ch); }
  ref(ch: string) {
    if (!this.read.has(ch)) { const g = this.glyph(ch); this.read.set(ch, g ? { look: look(g.cmds, this.f.m.cap, 120), bends: bent(g.cmds) } : null); }
    return this.read.get(ch)!;
  }
}

/** How many pieces of ink and counters outline `cmds` shows drawn PX_CAP pixels to the cap height (nonzero fill): ink
    joined across a pixel's corner is one piece, a counter is white the ink closes all round; a speck under SPECK pixels
    isn't counted. `open`, the counters with room in them: an OPEN pixels' square of white (a counter pinched to a
    hairline, as a box a's on a condensed bold grotesque, is shut to the eye though the ink still parts round it). */
const PX_CAP = 120, SPECK = 6, OPEN = 4;
/** How much finer a fault in the ink is drawn again to be kept (FINE times PX_CAP to the cap, the speck and room as
    large on the letter): a hairline a pixel or two wide at 120 px comes apart, or shuts a counter, in the pixels alone
    (the script card's swashes and its I's and s's hairlines at Black, the blackletter's d at Wide). */
const FINE = 3;
export function inkParts(cmds: Cmd[], cap: number, fine = 1): Parts {
  const rings = polys(cmds, 8), s = PX_CAP * fine / cap, speck = SPECK * fine * fine, side = Math.round(OPEN * fine);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const q of r) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  if (!rings.length) return { pieces: 0, counters: 0, open: 0 };
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
  let pieces = 0, counters = 0, open = 0;
  const room = (i: number) => {
    const x = i % W, y = (i / W) | 0;
    if (x + side > W || y + side > H) return false;
    for (let dy = 0; dy < side; dy++) for (let dx = 0; dx < side; dx++) if (ink[(y + dy) * W + x + dx]) return false;
    return true;
  };
  for (let start = 0; start < W * H; start++) {
    if (seen[start]) continue;
    const v = ink[start], diag = v === 1;
    let size = 0, edge = false, roomy = false;
    seen[start] = 1; stack.push(start);
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i / W) | 0;
      size++;
      if (!v && !roomy && room(i)) roomy = true;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!diag && dx && dy)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!seen[j] && ink[j] === v) { seen[j] = 1; stack.push(j); }
      }
    }
    if (size < speck) continue;
    if (v) pieces++; else if (!edge) { counters++; if (roomy) open++; }
  }
  return { pieces, counters, open };
}

/** The faults letter `ch` has drawn in `now` that it hasn't in `was`, setting `key`'s own marks left out (each one's,
    given several). */
function faultsOf(ch: string, now: Drawn, was: Drawn, key: string | readonly string[]): Kind[] {
  const g = now.glyph(ch), wg = was.glyph(ch);
  if (!g || !wg || g.d === wg.d) return [];
  const r = was.ref(ch)!, cap = was.f.m.cap, l = look(g.cmds, cap), out: Kind[] = [];
  // (counted again as drawn when the contours say otherwise: a k's arm drawn as its own contour over the stem is one
  // piece of ink to the eye, two to the contours)
  // (and a letter with counters read for one pinched shut: fewer with room in them than it had)
  // (each kept only where it is there drawn FINE times finer too)
  if (l.pieces !== r.look.pieces || l.counters !== r.look.counters || r.look.counters) {
    const kinds = (a: Parts, b: Parts) => [...a.pieces !== b.pieces ? ['pieces' as const] : [], ...a.counters !== b.counters ? ['counters' as const] : [],
      ...a.open < b.open && a.counters >= b.counters ? ['pinched' as const] : []];
    const found = kinds(inkParts(g.cmds, cap), r.parts ??= inkParts(wg.cmds, cap));
    if (found.length) { const fine = kinds(inkParts(g.cmds, cap, FINE), r.fine ??= inkParts(wg.cmds, cap, FINE)); out.push(...found.filter(k => fine.includes(k))); }
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
  const own = (typeof key === 'string' ? [key] : key).flatMap(k => [...(INTENDED[k] ?? []), ...(specOf(k)?.kind === 'number' ? [] : PICKED)]);
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

/** Pickers the panel draws by name inside a control, not read off the spec: the crossbar's ends (panel/SliderControl.tsx),
    by the control they sit in. (The Serifs control's shapes were one, off the panel since 2026-11-09.) */
const IN_CONTROL: Record<string, string> = { barEnds: 'crossbar' };

/** The control setting `k` is, or sits in. */
const parentOf = (k: string) => { const s = specOf(k); return (s.control ? k : s.sub?.parent ?? IN_CONTROL[k]) as ControlKey; };
/** The settings the panel offers on design `p`: its controls in use and the sliders nested under them, less SKIP. */
function keysOf(p: Params): string[] {
  return Object.keys(SPECS).filter(k => {
    if (SKIP.has(k)) return false;
    const parent = parentOf(k);
    if (!parent) return false;
    if ((parent === 'cellJoin' || parent === 'gridRows') && !(p.build === 'blocks' && p.blockForm === 'grid')) return false;
    return controlInUse(parent as ControlKey, p) && subInUse(k, p);
  });
}

/** Card `id`'s design: its settings in its own font, the font registered (in `held`); the engine's letters for a card
    no font stands behind (the slot and grid blocks, the arcs). */
export function designOf(id: string, held: Set<string>): Params | null {
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
          for (const [ch, kinds] of onset) { const seen = kinds.filter(x => x !== 'bends'); if (seen.length && !bad.has(ch)) bad.set(ch, seen); }
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
const IN_CONTROL_LABEL: Record<string, string> = { barEnds: 'Bar ends' };
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

// ---- the reins ----

/** Not reined per font: Weight, Verticals, Horizontals, Contrast and Slant, which a family's weights and italics are
    solved on (shared/family.ts), Width, reined by its own measure (tools/widths.ts), and Bowl overlap, whose way to
    a bowl stood apart from its stem passes through the bowl just leaving it, notched where they part (reined, a
    grotesque's b and p kept their bowls on their stems at Bowl overlap 0). */
const NOT_REINED = new Set(['weight', 'vWeight', 'hWeight', 'contrast', 'slant', 'width', 'overlap']);
/** Sides of a slider the walk reads broken that were looked at drawn and left free, by font: the setting and its side
    ('lo' toward 0, 'hi' toward 100). The geometric's serif tips either way, the chunky round's apex down to 0, and the
    blackletter's inner corners, joins and roundness up to 100 stay whole at 120 px to the cap: a contour re-fitted, read as
    bends (2026-11-09). */
const BY_EYE: Record<string, Record<string, ('lo' | 'hi')[]>> = {
  'Compass:300': { serifTipSlant: ['lo', 'hi'] },
  'Gumdrop:700': { apex: ['lo'] },
  'Cathedral:400': { innerRound: ['hi'], roundness: ['hi'], joinRound: ['hi'] }
};
/** Sides `--tighten` leaves as the walk found them, looked at drawn and whole that far: the script and the informal
    cards' Squareness, read with a slit in the H's join and the A's swash that isn't there drawn (2026-11-09). */
const WALKED_BY_EYE: Record<string, Record<string, ('lo' | 'hi')[]>> = {
  'Boardwalk:400': { squareness: ['hi'] },
  'Serenade:400': { squareness: ['hi'] }
};
/** Reins on the sliders the walk leaves free (NOT_REINED), set from the sliders' mixes (--sliders, --try): the Block
    card's Weight, past 80 its 6's and 9's counters shut and its G slit (whole at 80 with Verticals at 100), and its
    Horizontals past its own 98, the a and e pinched; and from the pickers and sliders moved together (--mixed): the
    Didone's Apex below 50, its V's and W's points cut off at a light Weight or Horizontals (below 40 at any); the code
    card's Weight and Verticals below 20, spurs on its C, a, g and 6 and its p's bowl notched at the stem with Inner
    space low; the Wood Type's Weight below 30 and Verticals below 20, its notches cutting through the d, g and q; the
    Formal Script's Wobble past 50, its o and R apart (past 30 from --seed 10, its R apart at its lightest); the
    Didone's Wobble past 60, which slit its H's crossbar and
    shut the 8's and p's counters at a wide Width or a light Weight (2026-11-10; past 50 from --seed 10, its B's and
    p's counters shut and its a in pieces at its lightest and widest); the Chunky Round's past 60, which
    slit its D's counter and shut its a's and &'s at a heavy Weight slanted, and the Blackletter's past 60, which broke
    its B's and P's bowls slanted at a middling Width (--seed 4); the Chunky Round's Weight past 90 and Verticals past
    70, which filled its A's and &'s counters at a narrow Width (at its own width with both heavy), and the serif
    italic's Joints past 70, which cut its
    4's and 8's joins to needles at its lightest and narrowest (--seed 6); the Geometric's Weight past 90, which with
    Serifs on spurred its b's, p's and q's bowls at the stem at a Width near two thirds (--seed 7); the Rounded card's
    Wobble past 80, which at its lightest wound its d's and q's stems through their bowls and broke the 6's join off,
    and the serif italic's past 65, which broke its R and filled its b with Verticals heavy and the Crossbar low
    (--seed 10); and the Block card's Crossbar below 33, which at its lowest shut its e's aperture and with Wobble at
    Black filled its a's and e's counters (read with Wobble at its most against every slider's ends), and its stroke
    ends' Curl past 45, which at a Width below a third curled the C's, e's and 9's ends into their counters (--seed 11),
    and the Formal Script's Curl past 70, which with a long Length curled its c's, e's, u's and x's exits shut and ran
    its i's into its dot (read on every card with Curl at its most). Kept by --update. */
const REINS_BY_MIXES: Record<string, Record<string, [number, number]>> = {
  'Bulwark:700': { weight: [0, 0.8], hWeight: [0, 0.98], crossbar: [0.33, 0.887], terminalCurl: [0, 0.45] },
  'Couture:600': { apex: [0.5, 1], wobble: [0, 0.5], weight: [0, 0.85] },
  'Kernel:500': { weight: [0.2, 1], vWeight: [0.2, 1] },
  'Timber:400': { weight: [0.3, 1], vWeight: [0.2, 1], terminalLength: [0, 0.6] },
  'Serenade:400': { wobble: [0, 0.3], terminalCurl: [0.141, 0.7] },
  'Gumdrop:700': { wobble: [0, 0.6], weight: [0, 0.9], vWeight: [0, 0.7], aperture: [0, 0.64] },
  'Sonnet:400i': { joints: [0, 0.7], wobble: [0, 0.65] },
  'Cathedral:400': { wobble: [0, 0.6] },
  'Compass:300': { weight: [0, 0.9] },
  'Cotton:300': { wobble: [0, 0.8] },
  'Turnpike:500': { weight: [0, 0.8] },
  'Parlance:500': { aperture: [0.4, 1], terminalSize: [0, 0.7] },
  'Ballyhoo:400': { weight: [0, 0.92], vWeight: [0, 0.75] }
};
/** The walk's steps (of the way from the card's own value to the slider's end), and the halvings after. */
const REIN_STEPS = 16, HALVINGS = 4;
const REINS_FILE = resolve(ROOT, 'shared/font-reins.ts');

/** `fn` run with the reins off: FONT_REINS and BUILT_REINS emptied, and put back after. */
function reinsOff<T>(fn: () => T): T {
  const kept = Object.entries(FONT_REINS), built = Object.entries(BUILT_REINS);
  for (const [k] of kept) delete FONT_REINS[k];
  for (const [k] of built) delete BUILT_REINS[k];
  try { return fn(); } finally { for (const [k, v] of kept) FONT_REINS[k] = v; for (const [k, v] of built) BUILT_REINS[k] = v; }
}

/** The sliders reined on card design `p` (in a font of TypeLab's own): those the panel offers that its font follows. */
const reinKeysOf = (p: Params) => keysOf(p).filter(k => specOf(k).kind === 'number' && !NOT_REINED.has(k) && (FREE_AT_KEYS as readonly string[]).includes(k));

/** How far slider `k` carries design `base`'s letters from its own value toward `end` and leaves them whole, the reins
    off: walked in sixteenths of the way, then halved between the last whole step and the first broken one, and taken
    a WINDOW back toward the card's own (further while a fault is found there). A value is broken as the check reads it
    (`breaks`: faults against the letters moved a hair that way, found again WINDOW either side). What that hair's move
    puts on the letters at once (`onset`) is there at every value that side, so no rein keeps it off: it is told, to be
    looked at drawn, and doesn't stop the walk (on the industrial, blackletter and chancery cards a contour re-fitted as
    the letters leave the font's own outline, read as bends or a hairline's needle, unseen drawn; counted, it held a
    dozen of their sliders at the card's own value). */
function walkTo(base: Params, k: string, end: number, held: Set<string>, broken: (c: Cell) => boolean = breaks): { reach: number; whole: boolean; past: string[]; onset: string[] } {
  const a = base[k as keyof Params] as number, was = new Drawn(base, held);
  const toward = (s: number) => ({ ...base, [k]: a + (end - a) * s }) as Params;
  const ref = new Drawn(toward(NUDGE), held);
  let onset = compare(ref, was, k).bad;
  if (onset.size) { const two = new Drawn(toward(2 * NUDGE), held); onset = new Map([...onset].filter(([ch]) => faultsOf(ch, two, was, k).length)); }
  const told = listed(onset);
  const side = (v: number) => (end > a ? v > a : v < a);
  const read = (v: number): Cell => {
    const now = new Drawn({ ...base, [k]: v } as Params, held), { n, bad } = compare(now, ref, k);
    for (const w of [v - WINDOW, v + WINDOW].filter(w => w >= 0 && w <= 1 && side(w))) {
      if (!bad.size) break;
      const near = new Drawn({ ...base, [k]: w } as Params, held);
      for (const ch of [...bad.keys()]) if (!faultsOf(ch, near, ref, k).length) bad.delete(ch);
    }
    return { n, bad: listed(bad) };
  };
  let ok = a, over = NaN, past: string[] = [];
  for (let i = 1; i <= REIN_STEPS; i++) {
    const v = a + (end - a) * i / REIN_STEPS, c = read(v);
    if (broken(c)) { over = v; past = c.bad; break; }
    ok = v;
  }
  if (Number.isNaN(over)) return { reach: end, whole: true, past, onset: told };
  for (let h = 0; h < HALVINGS; h++) {
    const v = (ok + over) / 2, c = read(v);
    if (broken(c)) { over = v; past = c.bad; } else ok = v;
  }
  const back = (v: number) => (end > a ? Math.max(a, v - WINDOW) : Math.min(a, v + WINDOW));
  ok = back(ok);
  while (ok !== a && broken(read(ok))) ok = back(ok);
  return { reach: ok, whole: false, past, onset: told };
}

/** A slider's rein on a card: its least and most whole value, what broke past each, what a hair's move put on the
    letters at once each way, and the card's own value. */
interface Rein { lo: number; hi: number; past: [string[], string[]]; onset: [string[], string[]]; at: number }
/** Card `id`'s reins, each slider's least and most whole value, for the sliders in `keys` (all it reins when empty);
    null where its font isn't one of TypeLab's own or isn't kept here. */
function reinsOf(id: string, keys: string[]): { font: string; reins: Map<string, Rein> } | null {
  const fid = STYLE_FONTS[id];
  if (!fid || !((fid.split(':')[0]) in OWN_FAMILIES)) return null;
  const held = new Set<string>(), design = designOf(id, held);
  if (!design) return null;
  const out = new Map<string, Rein>();
  reinsOff(() => {
    for (const k of reinKeysOf(design).filter(k => !keys.length || keys.includes(k))) {
      const base = { ...design, ...showContext(k) } as Params, at = base[k as keyof Params] as number;
      const lo = at > 0 ? walkTo(base, k, 0, held) : { reach: 0, whole: true, past: [], onset: [] };
      const hi = at < 1 ? walkTo(base, k, 1, held) : { reach: 1, whole: true, past: [], onset: [] };
      out.set(k, { lo: lo.reach, hi: hi.reach, past: [lo.past, hi.past], onset: [lo.onset, hi.onset], at });
    }
  });
  letGo(held);
  return { font: fid, reins: out };
}

/** Whether a value broke letters in form as a mix is read (shatters): a piece or a counter lost or gained, or a counter
    pinched, on two letters or more, the counters of letters whose strokes cross (CROSSED) not read. The blocks' and
    arcs' corners and joins bend, and a slice's or step's edges come to needles and slits, on letters whole drawn: read
    as breaks, they held Joints on the slot and grid blocks to a twentieth. */
const inForm = (crossed: string) => (c: Cell) => c.bad.filter(b => {
  const [ch, k] = b.split(':'), kinds = k.split('+').filter(x => !(crossed.includes(ch) && (x === 'counters' || x === 'pinched')));
  return kinds.some(x => x === 'pieces' || x === 'counters' || x === 'pinched');
}).length >= 2;
/** The reins of card `id` whose letters the engine builds (the slot and grid blocks, the arcs): each slider it offers
    walked as reinsOf walks a font's, broken in form alone (inForm), Weight, Verticals, Horizontals, Contrast, Slant and
    Width with them; null for a card in a font. */
function builtReinsOf(id: string, keys: string[]): { letters: string; reins: Map<string, Rein> } | null {
  if (STYLE_FONTS[id]) return null;
  const held = new Set<string>(), design = designOf(id, held)!, out = new Map<string, Rein>(), read = inForm(CROSSED[lettersOf(design)] ?? '');
  reinsOff(() => {
    for (const k of keysOf(design).filter(k => specOf(k).kind === 'number' && (!keys.length || keys.includes(k)))) {
      const base = { ...design, ...showContext(k) } as Params, at = base[k as keyof Params] as number;
      const lo = at > 0 ? walkTo(base, k, 0, held, read) : { reach: 0, whole: true, past: [], onset: [] };
      const hi = at < 1 ? walkTo(base, k, 1, held, read) : { reach: 1, whole: true, past: [], onset: [] };
      out.set(k, { lo: lo.reach, hi: hi.reach, past: [lo.past, hi.past], onset: [lo.onset, hi.onset], at });
    }
  });
  letGo(held);
  return { letters: lettersOf(design), reins: out };
}
/** Reins on the engine's letters drawn in further than the walk found, from the sliders' mixes (--sliders): the arcs'
    Weight to 60, past which most stroke ends but the card's own broke them, the flat and angled ends' P's and R's
    counters shut and their F's and G's slit (OFFS_BY_MIXES leaves out those that broke sooner), and from 16, below
    which a wider Width or Wobble took the b's and p's bowls off their stems (walked alone, whole to 7); and their
    Wobble to 35, past which a wider or lighter letter's bowls came off too (70 still broke them at Width 85 to 100,
    npm run breaks -- --sliders). */
const BUILT_BY_MIXES: Record<string, Record<string, [number, number] | [number, number, number]>> = {
  'arcs': { weight: [0.16, 0.6], wobble: [0, 0.35], terminalLength: [0.45, 0.58] },
  'blocks:slots': { counter: [0.15, 1, 0.5], chamfer: [0, 0.6, 0], crossbar: [0, 0.8, 0.5] },
  'blocks:grid': { weight: [0.15, 1, 0.4] }
};
/* (and from the pickers and sliders moved together, --mixed: the arcs' stroke ends shorter than 45 parted the K's arms
   and the L's foot at a wide Width; the slot blocks' Inner space below 15 shut their a's, p's and r's slots to
   hairlines at Weight 90 and up, and their Facets past 60 cut the counters through the sides at the lightest Weight
   and narrowest Width (2026-11-10; Steps, whose notches cut them with any Facets, is off the panel there, SLIDERS_OFF
   in shared/content/controls.ts); and (--seed 4) the arcs' stroke ends longer than 58 shut the R and crossed the F's
   arms at a heavy Weight, even the card's own round ends at Length 100, and the slot blocks' Crossbar past 80 pinched
   their a's and r's slots shut at Weight 100; and (--seed 10) the grid blocks' Weight below 15, where Wobble from 50
   shook their cells apart, the d's, 9's and Q's counters open and the R in pieces (whole at 15 at any Wobble, Width
   or Slant); a third number is the card's own value, where the walk kept no row for it) */
/** shared/font-reins.ts with `table` for BUILT_REINS: by letters, each setting reined to its least and most and the
    card's own value, BUILT_BY_MIXES laid over it. */
function writeBuiltReins(table: Map<string, Map<string, [number, number, number]>>) {
  for (const [id, r] of Object.entries(BUILT_BY_MIXES)) {
    const row = table.get(id) ?? new Map<string, [number, number, number]>();
    for (const [k, [lo, hi, own]] of Object.entries(r)) { const was = row.get(k); row.set(k, [Math.max(lo, was?.[0] ?? 0), Math.min(hi, was?.[1] ?? 1), was?.[2] ?? own ?? NaN]); }
    table.set(id, row);
  }
  const src = readFileSync(REINS_FILE, 'utf8'), at = src.indexOf('BUILT_REINS'), open = src.indexOf('= {\n', at) + 4, close = src.indexOf('};', open);
  const rows = [...table].filter(([, r]) => r.size)
    .map(([id, r]) => `  '${id}': { ${[...r].map(([k, [lo, hi, own]]) => `${k}: [${lo}, ${hi}, ${own}]`).join(', ')} }`).join(',\n');
  writeFileSync(REINS_FILE, src.slice(0, open) + rows + (rows ? '\n' : '') + src.slice(close));
}

/** shared/font-reins.ts with `table` for its table: by font id, each setting reined to its least and most, rounded in
    toward the card's own (a thousandth), the sliders whole to both ends left out. */
function writeReins(table: Map<string, Map<string, [number, number]>>) {
  for (const [fid, r] of Object.entries(REINS_BY_MIXES)) { const row = table.get(fid) ?? new Map(); for (const [k, v] of Object.entries(r)) row.set(k, v); table.set(fid, row); }
  const src = readFileSync(REINS_FILE, 'utf8'), open = src.indexOf('= {\n') + 4, close = src.indexOf('};', open);
  const rows = [...table].filter(([, r]) => r.size)
    .map(([fid, r]) => `  '${fid}': { ${[...r].map(([k, [lo, hi]]) => `${k}: [${lo}, ${hi}]`).join(', ')} }`).join(',\n');
  writeFileSync(REINS_FILE, src.slice(0, open) + rows + (rows ? '\n' : '') + src.slice(close));
}

/** Whether broken letter `b` (as `listed` writes it, 'C:needle+bends') changed its form: a piece or counter more or
    fewer, a needle or a slit, not its contour bending back alone. */
const shaped = (b: string) => b.split(':')[1].split('+').some(x => x !== 'bends');

/** The reins drawn in further where the last map, drawn with them, still finds a value broken with a letter changed
    in form (`shaped`), the letters a hair's move broke at once (onset) left out: the side's rein taken back to as the slider
    draws it at the last eighth before. The walk reads the letters with the reins off against a hair's move as asked,
    the map reads them reined against a hair's move as drawn, and near BREAK letters the two read otherwise (Almanac's
    Squareness, walked whole to 0.359, broke drawn at 0.31: the C's terminal notched, the S's spine slit). A contour
    bending back alone isn't followed: read on a few letters past most reins, the 8's and the &'s, it is unseen drawn.
    A side left free by eye (BY_EYE) stays free, and one looked at whole as far as walked (WALKED_BY_EYE) stays so.
    Writes shared/font-reins.ts; run the map again after. */
function tightenReins(m: Map_) {
  const table = new Map(Object.entries(FONT_REINS).map(([f, r]) => [f, new Map(Object.entries(r) as [string, [number, number]][])]));
  let n = 0;
  for (const id of PAGE_STYLES.map(s => s.id)) {
    const fid = STYLE_FONTS[id], c = m.cards[id];
    if (!fid || !c || !((fid.split(':')[0]) in OWN_FAMILIES)) continue;
    const held = new Set<string>(), design = designOf(id, held);
    letGo(held);
    if (!design) continue;
    const row = table.get(fid) ?? new Map<string, [number, number]>();
    for (const k of reinKeysOf(design)) {
      const r = c.keys[k];
      if (!r?.changed) continue;
      const at = +r.at, [lo, hi] = row.get(k) ?? [0, 1], eye = [...BY_EYE[fid]?.[k] ?? [], ...WALKED_BY_EYE[fid]?.[k] ?? []];
      let nlo = lo, nhi = hi;
      for (const end of [0, 1]) {
        if (eye.includes(end ? 'hi' : 'lo')) continue;
        const onset = new Set(r.onset[end ? 'hi' : 'lo'].map(b => b.split(':')[0]));
        let last = at;
        for (const v of EIGHTHS.filter(v => (end ? v > at : v < at)).sort((a, b) => Math.abs(a - at) - Math.abs(b - at))) {
          // (read without the letters a hair's move already broke: no rein keeps them whole)
          const cell = r.values[fmt(v)], rest = cell ? { n: cell.n, bad: cell.bad.filter(b => !onset.has(b.split(':')[0])) } : null;
          if (rest && breaks(rest) && rest.bad.some(shaped)) {
            // (as the rein draws the slider at the last whole eighth, rounded in toward the card's own)
            if (end) nhi = Math.max(at, Math.floor((at + (last - at) * (hi - at) / (1 - at)) * 1000) / 1000);
            else nlo = Math.min(at, Math.ceil((at - (at - last) * (at - lo) / at) * 1000) / 1000);
            break;
          }
          last = v;
        }
      }
      if (nlo === lo && nhi === hi) continue;
      row.set(k, [nlo, nhi]);
      n++;
      console.log(`${id.padEnd(14)} ${fid.padEnd(16)} ${k} ${lo}..${hi} -> ${nlo}..${nhi} (at ${at})`);
    }
    table.set(fid, row);
  }
  writeReins(table);
  console.log(`${n} reins drawn in; wrote ${REINS_FILE}`);
}

// ---- the choices left out ----

const OFFS_FILE = resolve(ROOT, 'shared/font-offs.ts');
/** What a card's letters are drawn from, as FONT_OFFS keys them (lettersOf in shared/content/controls.ts). */
const lettersKey = (p: Params) => p.freeFont || (p.build === 'blocks' ? `blocks:${p.blockForm}` : p.build === 'arcs' ? 'arcs' : '');

/** Choices that break a card's letters drawn where the check reads a letter or two broken, by font: the Serifs switch
    off on the Didone (Couture) and Old Style (Vellum) cards leaves their serifs' roots behind, hairline stubs along the
    baseline, and tears Vellum's arches and its 0 (read as R's slit and E's and h's; drawn on 2026-11-09, and on every
    Shuffle mix with Serifs None that broke either card); switched on, the squircle's (Orbital) shuts its E's counters
    to slits and the chunky round's (Gumdrop) puts ragged serifs on its W and a bar on its 4 (read as the E alone, and
    with almost any other step, on the Shuffle's mixes). */
const OFFS_BY_EYE: Record<string, Record<string, string[]>> = {
  'Orbital:600': { serif: ['true'], bends: ['round'], dots: ['square', 'round'] },
  'Gumdrop:700': { serif: ['true'], kForm: ['bar'], gForm: ['double'], story: ['double'], terminal: ['flat/plain', 'flat/flared', 'angled/outer', 'angled/inner', 'cut/level', 'round/ball', 'sharp/pointed', 'sharp/clipped', 'tapered/taper', 'tapered/brush'] },
  'Vellum:400': { serif: ['false'] },
  'Couture:600': { serif: ['false'], bends: ['round'], kForm: ['bar'], qForm: ['crossing'], terminal: ['flat/plain', 'flat/flared', 'angled/outer', 'angled/inner', 'cut/level', 'round/round', 'sharp/pointed', 'sharp/clipped', 'tapered/taper', 'tapered/brush'] },
  'Almanac:500': { bends: ['round'], kForm: ['bar'], qForm: ['crossing'] },
  'Ballyhoo:400': { bends: ['round'], qForm: ['sweep'], terminal: ['flat/plain', 'flat/flared', 'angled/outer', 'angled/inner', 'cut/level', 'round/round', 'round/droplet', 'sharp/pointed', 'sharp/clipped', 'tapered/taper', 'tapered/brush'] },
  'Timber:400': { rForm: ['loop'], yForm: ['cup'], mForm: ['raised'], jForm: ['cup'], terminal: ['flat/flared', 'angled/outer', 'angled/inner', 'cut/level', 'round/round', 'round/droplet', 'round/ball', 'sharp/pointed', 'sharp/clipped', 'tapered/taper', 'tapered/brush'] },
  'Kernel:500': { bowlForm: ['box'], serif: ['true'], jForm: ['cup'], terminal: ['tapered/taper', 'tapered/brush'] },
  'Compass:300': { bowlForm: ['box'], serif: ['true'] },
  // (the Letters page's shapes, each drawn on every card at its own settings, Weight 0 and 100, Width 0 and 100, and
  // looked at, 2026-11-10: the engine's stand-in letters a font hasn't got clog or stand apart from it: a double-storey
  // g an 8 or a blot narrow (Neo Grotesque, Industrial, Chunky Round, Block) or half again as heavy as a light hand's
  // letters (the casual card), the Neo Grotesque's single-storey a and the Chunky Round's double-storey a shut heavy or
  // narrow, the Squircle's square dots sat on its stems as one bar (and round, the one left, its own all but alike), the Fat Face's sweeping Q's tail knotted and the Soft
  // Slab's squat, the Didone's, Transitional's and casual card's crossing Q light or an O, the cupped J a U or shut on
  // the casual, Wood Type and code cards)
  'Mainline:600': { gForm: ['double'], story: ['single'], serif: ['true'] },
  'Turnpike:500': { gForm: ['double'], serif: ['true'] },
  'Bulwark:700': { gForm: ['double'], terminal: ['flat/flared', 'angled/outer', 'angled/inner', 'cut/level', 'round/round', 'round/droplet', 'round/ball', 'sharp/pointed', 'sharp/clipped', 'tapered/taper', 'tapered/brush'] },
  'Jotter:400': { gForm: ['double'], jForm: ['cup'], qForm: ['crossing'], serif: ['true'] },
  'Hearth:600': { qForm: ['sweep'], terminal: ['flat/flared', 'angled/outer', 'cut/level', 'round/droplet', 'tapered/taper', 'tapered/brush'] },
  // (and the Serifs switch, flipped on every card that offers it and drawn at Weight's, Width's and Slant's ends: set on
  // the casual hand, its letters stood apart where a stem took a serif and the next none, "ni d bpq"; taken off the
  // Typewriter, specks and spurs were left at its W's and k's and x's feet; set on the Neo Grotesque, Humanist,
  // Geometric and Industrial, a serif blotted the 3's top end (and the Geometric's 6 and g, the Humanist's 4 and 5) and
  // the Humanist's x came apart in spikes at a wide Width; the Rounded and Comic cards take them clean)
  'Dispatch:400': { serif: ['false'] },
  'Parlance:500': { serif: ['true'] },
  // (and the stroke ends, each drawn on every card at Weight 0, its own and 100 and its finer sliders' ends, read by
  // five reviewers and the rows flagged looked at again, 2026-11-11: those that read as damage or foreign to the face
  // off its card. The Chunky Round's cut, pointed and tapered ends left its c and r standing apart from the next letter
  // and its r a dotless i; the Didone's and Fat Face's ends but their balls left the r a bare hairline, an i; the Soft
  // Slab's flare, slant, level, drop and tapers lightened its C or stood its caps apart heavy; the Wood Type's spiked
  // its f's top and stood its r apart; the Block card's cut its c's arms back ("c easr") and its t's foot to a nub; the
  // code card's and Comic's tapers thinned their c and C a weight lighter on a monoline face; the Blackletter's drops
  // and balls hung cedillas on its c's and e's ends)
  'Funnies:400': { terminal: ['tapered/taper', 'tapered/brush'] },
  'Cathedral:400': { terminal: ['round/droplet', 'round/ball'] }
};
/* And from the pickers and sliders moved together (--mixed, 2026-11-09), each looked at drawn alone where the mix read a
   letter or two: round bends on the Squircle, Transitional, Didone and Fat Face cards turned their M's vertex and V's
   point to notches and their Z's diagonal to a hairline loop; a barred k blotted the Chunky Round's k and K and cut the
   Transitional's and Didone's K to a hairline; the Wood Type's looped r, cupped y and raised M shut its R and y and
   notched its M at a narrow Width; the code card's box bowls slit their joins at a wide Width and its Serifs switched
   on blotted its 4; the Geometric's box bowls came to wedges where they meet the stems. */
/** Choices that break a card's letters with a slider moved too, from the sliders' mixes (--sliders): the arcs' scooped,
    notched, ball and droplet stroke ends shut their Z's and 4's counters and parted their h's and i's dots from 40 to
    60 on Weight, which BUILT_REINS stops at 60 for the ends left (BUILT_BY_MIXES). */
const OFFS_BY_MIXES: Record<string, Record<string, string[]>> = {
  'arcs': { terminal: ['flat/scooped', 'cut/notched', 'round/ball', 'round/droplet', 'angled/outer', 'angled/inner', 'tapered/taper', 'tapered/brush', 'flat/flared', 'cut/level'] },
  'Bulwark:700': { qForm: ['inside'], bowlForm: ['oval'], terminal: ['flat/flared', 'round/droplet', 'round/ball'] },
  'Gumdrop:700': { jForm: ['cup'], rForm: ['loop'] },
  'Cotton:300': { bowlForm: ['box'] },
  'Timber:400': { terminal: ['flat/scooped'] },
  'Serenade:400': { bowlForm: ['box'] },
  'Vellum:400': { bowlForm: ['box'] },
  'Couture:600': { bowlForm: ['box'] },
  'Dispatch:400': { bowlForm: ['box'] },
  'Boardwalk:400': { bowlForm: ['box'] },
  'Parlance:500': { bowlForm: ['box'] },
  'Almanac:500': { bowlForm: ['box'] },
  'Sonnet:400i': { bowlForm: ['box'] },
  'Ballyhoo:400': { bowlForm: ['box'] },
  'blocks:grid': { kForm: ['stem'] }
};
/* And from the pickers and sliders moved together (--mixed, 2026-11-09): the arcs' angled ends blotted the R and parted
   the F's arm at a narrow Width, and their tapered ends parted the B's stem from its bowl and the L's foot from its stem
   at a wide one, and their flared ends blotted the F and notched the b's and p's bowls at a long Length; the Block
   card's inside Q tail came out ragged, its oval bowls split at their corners at a light Weight, and its flared ends
   tore its C, 2 and 5 with Facets; the Chunky Round's J with a cup shut into a d at a narrow Width; the grid blocks'
   K with a stem took its arms off it; and (--seed 4, 2026-11-10) the arcs' level ends, which shut the R and crossed
   the F's arms from Length 75 at most weights (the Arcs keep Flat and Round); and (--seed 5) the Rounded card's box
   bowls, which lost their side against the stem at a sharp Box roundness and, at a light Weight with Contrast low,
   cut into the b's, d's, p's and q's stems (off on the Geometric and code cards before); and (--seed 6) the Chunky
   Round's looped R, which tangled at a narrow Width slanted, the Wood Type's scooped ends, which bit its C's and G's
   ends to pieces at a long Curl, and the Formal Script's box bowls, which pinched its I's and s's loops at a narrow
   Width with heavy Verticals; and (--seed 7) the box bowls of the Typewriter, Old Style, Didone and Informal cards,
   which came off or notched their b's, d's, p's and q's stems at Weight 10 or lighter and a sharp Box roundness, and
   of the Humanist, Transitional, serif italic and Fat Face cards, which spurred their a's, b's, 6's and 9's joins
   there with Horizontals at their lightest (the nine cards keeping them read whole at ten more corners); and
   (--seed 10) the Block card's ball and droplet ends, which filled its e's slit and the &'s counters at a narrow
   Width (its other ends whole there). */
/** Choices left out on every card in a font, from the pickers and sliders moved together (--mixed, 2026-11-09): square
    bowl joins, whole alone on most cards, notched the bowls of the a, b, d, g, p and q and shut the h's, m's and n's
    with Weight, Verticals, Joints or Wobble moved on 13 of the 22 cards (alone on the Squircle and Chunky Round); upright
    diagonals broke the A and v on 8 cards, a foot ragged on the serif cards; the serif tips', sides' and inside serifs'
    shapes, laid on a font's own serifs, shut the Didone's d and broke its p and R with almost any slider moved, and
    the Old Style's A and &, the Soft Slab's x and 3, the Block card's E and F and the Formal Script's s and z alone;
    and from a second round (--mixed 200 --seed 1): arched diagonals filled in the W, v and w at a heavy Verticals or
    a narrow Width on the Neo Grotesque, Industrial, Fat Face, Wood Type and Block cards (off on two more before); the
    k's stem and bar forms mashed the k and K together with serifs on or a narrow Width (Neo Grotesque, Old Style,
    Wood Type, Block; off on ten more before); round bends turned the Humanist's M to a U at a heavy Verticals (off on
    eleven before); cupped serif bases put a blob on the Typewriter's A and spurs on its S and 6 (off on all but six,
    those with no serifs to cup); and from a third (seed 2): the cupped Y came to a 4 at a narrow Width on the Neo
    Grotesque (off on four more before), the raised M to a hairline on the Fat Face at a wide one (off on six more); and
    from the eighth (seed 7): the looped R, a form no font here draws, filled its counter solid at a heavy Weight and a
    narrow Width on the casual card and most of the others (off on two before). And from the Letters page's shapes drawn
    on every card and looked at (2026-11-10): the barred I, i, l and J, whose J's bar across its whole width read as a
    bracket ("コ") on eight cards and whose l read as a 1, the engine's slabs standing apart from the font's; and the
    plain ones with them, which left alone drew the engine's I, i, l and J for the font's own all but alike (a J's hook
    thinned to a wedge, a Chunky Round's serifed), so the picker goes from a font's Letters page. And the notched and
    scooped stroke ends, each drawn on every card at Weight 0, its own and 100 and its Depth's and Tilt's ends: their
    notches and horns read as bites and barbs on the ends of 15 of the 22 (2026-11-11). */
const OFFS_ON_FONTS: Record<string, string[]> = {
  bowlJoin: ['square'], diagonals: ['upright', 'arch'], kForm: ['stem', 'bar'], bends: ['round'], serifBase: ['cupped'],
  yForm: ['cup'], mForm: ['raised'], rForm: ['loop'], iForm: ['bars', 'plain'], terminal: ['cut/notched', 'flat/scooped'],
  serifTip: ['round', 'pointed', 'angled'], serifSides: ['left', 'right', 'inside', 'outside'],
  serifInner: ['bracketed', 'unbracketed', 'slab', 'wedge', 'diamond']
};

/** shared/font-offs.ts from map `m`: each card's pickers' and switches' choices that break it (`breaks`), by what its
    letters are drawn from, for the pickers the panel offers on it, and those left out by eye (OFFS_BY_EYE) or from
    the sliders' mixes (OFFS_BY_MIXES, and OFFS_ON_FONTS on every card in a font). */
function writeOffs(m: Map_) {
  const rows: string[] = [];
  for (const id of PAGE_STYLES.map(s => s.id)) {
    const c = m.cards[id];
    if (!c) continue;
    const held = new Set<string>(), design = designOf(id, held);
    letGo(held);
    if (!design) continue;
    // (the settings the panel offers on it now: a run's older finds for one taken off since, Serif shape's, aren't kept)
    const offered = new Set(keysOf(design));
    const offs = Object.entries(c.keys).filter(([k, r]) => offered.has(k) && r.changed && specOf(k).kind !== 'number')
      .map(([k, r]) => [k, Object.entries(r.values).filter(([, cell]) => breaks(cell)).map(([v]) => v)] as [string, string[]]);
    const byMixes = [OFFS_BY_EYE, OFFS_BY_MIXES].flatMap(by => Object.entries(by[lettersKey(design)] ?? {}));
    for (const [k, vs] of [...byMixes, ...STYLE_FONTS[id] ? Object.entries(OFFS_ON_FONTS) : []]) {
      const row = offs.find(([o]) => o === k);
      if (row) row[1] = [...new Set([...row[1], ...vs])]; else offs.push([k, vs]);
    }
    const out = offs.filter(([, vs]) => vs.length);
    if (out.length) rows.push(`  '${lettersKey(design)}': { ${out.map(([k, vs]) => `${k}: [${vs.map(v => `'${v}'`).join(', ')}]`).join(', ')} }`);
  }
  const src = readFileSync(OFFS_FILE, 'utf8'), open = src.indexOf('= {\n') + 4, close = src.indexOf('};', open);
  writeFileSync(OFFS_FILE, src.slice(0, open) + rows.join(',\n') + (rows.length ? '\n' : '') + src.slice(close));
  console.log(`${rows.length} cards with choices left out; wrote ${OFFS_FILE}`);
}

// ---- the Adjust tab's traits ----

export const TRAITS_FILE = resolve(OUT, 'breaks-traits.json');
/** A trait's step as the file names it, 'weight:black'; two together 'weight:black+curves:box'. */
type Step = string;
/** The steps tried: every step of every trait the Adjust tab offers but Fill's (textures drawn over the letters, left
    out of the map too) and Spacing's room between the letters (Mono, which redraws them to one width, kept). */
const STEPS: Step[] = TRAITS.filter(t => t.id !== 'fill')
  .flatMap(t => t.options.filter(o => t.id !== 'spacing' || o.id === 'mono').map(o => `${t.id}:${o.id}`));
const traitsOf = (steps: Step[]): Traits => Object.fromEntries(steps.map(s => s.split(':'))) as Traits;
const keysOfSteps = (steps: Step[]) => steps.flatMap(s => { const [t, o] = s.split(':'); return Object.keys(traitOption(t as TraitId, o)!.set); });

/** Card design `design` as the Style page draws it under traits `t` (adjustedParams, client/state/editor.ts): the card's
    settings with the steps laid over, a choice its letters break put back (keepWhole), in its font picked where the
    card picks it; a set of steps its letters break together, TRAIT_OFFS, less its last (traitsOn). */
function underTraits(id: string, design: Params, t: Traits): Params {
  const st = PAGE_STYLES.find(s => s.id === id)!, letters = design.freeFont || lettersOf({ ...st.params, freeFont: '' });
  const p = keepWhole(applyTraits(st.params, traitsOn(t, letters)), st.params, letters);
  return design.freeFont ? { ...p, freeFont: design.freeFont, freeAt: design.freeAt } : p;
}

/** Letters whose strokes cross themselves, by what they are drawn from, whose counters aren't read under the traits:
    the arc letters' Q (its tail over the bowl), P (the stem through the bowl's top) and & (its loops) close and open
    small counters where the strokes cross as they grow heavier, narrower or squarer, whole drawn (2026-11-09). */
const CROSSED: Record<string, string> = { arcs: 'QP&' };
/** Letters whose hairline swashes and joins cross, touch and part as the settings move, by font, whose pieces and
    counters aren't read under mixes: the Formal Script's (Serenade) swashes over its K, Q, H, W and &, and the small
    loops of its b, f and & at a heavy weight; the serif italic's (Sonnet) a, p, q and d where the bowl meets the stem in
    a hairline, and its w's and X's hairlines at a wide Width; the informal card's (Boardwalk) a and g at the lightest;
    the blackletter's (Cathedral) G, V, e and d, whose hairline slits inside close as it grows heavier, and its q and w at
    the lightest; the slot blocks' B, b and & rotated or slanted, whose slots meet at a corner. Every one looked
    at drawn large, whole, at the mixes that read them broken (--mixed, 2026-11-09): read, they were 36, 7, 1 and 5 of
    200 mixes broken. */
const SWASHED: Record<string, string> = { 'Serenade:400': '&KfbHQCWYgVj23', 'Sonnet:400i': 'apqdwX', 'Boardwalk:400': 'ag', 'Cathedral:400': 'GVedqw', 'blocks:slots': 'B&b' };

/** The letters `now` breaks in form against `was`: a piece or counter more or fewer, a needle or a slit (a contour
    bending alone is unseen drawn, as --tighten reads it), the marks the settings `keys` draw on purpose left out. */
export function brokenInForm(now: Drawn, was: Drawn, keys: string[]): { n: number; bad: Map<string, Kind[]> } {
  let n = 0;
  const bad = new Map<string, Kind[]>(), crossed = CROSSED[lettersKey(was.p)] ?? '', swashed = SWASHED[lettersKey(was.p)] ?? '';
  for (const ch of CHARS) {
    const g = now.glyph(ch), wg = was.glyph(ch);
    if (!g || !wg || g.d === wg.d) continue;
    n++;
    const k = faultsOf(ch, now, was, keys).filter(x => x !== 'bends' && !(crossed.includes(ch) && (x === 'counters' || x === 'pinched'))
      && !(swashed.includes(ch) && (x === 'pieces' || x === 'counters' || x === 'pinched')));
    if (k.length) bad.set(ch, k);
  }
  return { n, bad };
}

/** Card `id` under the Adjust tab's traits: each step alone against the card, and each two steps of two traits
    together against the card, less what either breaks alone (what they break only together). Null where its font isn't
    kept here. */
export interface TraitsOut { seconds: number; singles: Record<Step, Cell>; pairs: Record<string, Cell> }
function traitsCard(id: string): TraitsOut | null {
  const t0 = Date.now(), held = new Set<string>(), design = designOf(id, held);
  if (!design) return null;
  const was = new Drawn(design, held), out: TraitsOut = { seconds: 0, singles: {}, pairs: {} };
  const alone = new Map<Step, Map<string, Kind[]>>();
  for (const s of STEPS) {
    const r = brokenInForm(new Drawn(underTraits(id, design, traitsOf([s])), held), was, keysOfSteps([s]));
    // (a step this card takes already, or that its letters break and keepWhole puts back, changes nothing here)
    if (!r.n) continue;
    out.singles[s] = { n: r.n, bad: listed(r.bad) };
    alone.set(s, r.bad);
  }
  // (two steps where neither breaks the card alone)
  const live = [...alone.keys()].filter(s => !breaks(out.singles[s]));
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (a.split(':')[0] === b.split(':')[0]) continue;
    const r = brokenInForm(new Drawn(underTraits(id, design, traitsOf([a, b])), held), was, keysOfSteps([a, b]));
    for (const [ch, ks] of [...r.bad]) {
      const left = ks.filter(k => !alone.get(a)!.get(ch)?.includes(k) && !alone.get(b)!.get(ch)?.includes(k));
      if (left.length) r.bad.set(ch, left); else r.bad.delete(ch);
    }
    if (r.bad.size) out.pairs[`${a}+${b}`] = { n: r.n, bad: listed(r.bad) };
  }
  letGo(held);
  out.seconds = Math.round((Date.now() - t0) / 1000);
  return out;
}

/** Shuffles drawn on each card (--shuffle), and the file they are written to. */
export const SHUFFLE_FILE = resolve(OUT, 'breaks-shuffle.json');
/** A seeded random number from 0 to 1 (mulberry32): a run draws the same shuffles again. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Steps as the Adjust tab's Shuffle picks them (shuffleTraits, client/state/editor.ts): each trait of the Body,
    Proportion and Details sections at a chance of 0.55, of Finish 0.12, one of its steps at random; Fill's and
    Spacing's room left out as STEPS leaves them. Dense, each trait at 0.85: a mix holds most traits, and so most sets of
    three steps a card breaks together, which the button's own odds draw a few times in a thousand (Neo Grotesque's
    Bold, Condensed and Box). */
function shuffled(rand: () => number, dense = false): Step[] {
  const out: Step[] = [];
  for (const sec of TRAIT_SECTIONS) for (const t of sec.traits) {
    if (rand() >= (dense ? 0.85 : sec.id === 'finish' ? 0.12 : 0.55)) continue;
    const step = `${t.id}:${t.options[Math.floor(rand() * t.options.length)].id}`;
    if (STEPS.includes(step)) out.push(step);
  }
  return out;
}
/** Whether letters broken in form `bad` break the card under a mix: a piece, a counter or the room in one lost or
    gained on two letters or more. Needles and slits alone aren't counted: under a mix of several steps they were read
    on letters that look whole drawn (the industrial card's corners, the fat face's hairlines at Light, the wood type's
    crotches at Narrow; 2026-11-09). */
export const shatters = (bad: Map<string, Kind[]>) =>
  [...bad.values()].filter(k => k.some(x => x === 'pieces' || x === 'counters' || x === 'pinched')).length >= 2;

/** Card `id` under `n` shuffles of the Adjust tab's traits, each against the card as drawn: the shuffles that break it
    and the letters they break, and how many were drawn. */
export interface ShuffleOut { seconds: number; n: number; broken: { steps: Step[]; bad: string[]; ctx?: string[] }[] }
function shuffleCard(id: string, n: number, seed = 0, dense = false): ShuffleOut | null {
  const t0 = Date.now(), held = new Set<string>(), design = designOf(id, held);
  if (!design) return null;
  const was = new Drawn(design, held), rand = seeded([...id].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0), 7) + seed), out: ShuffleOut = { seconds: 0, n, broken: [] };
  for (let i = 0; i < n; i++) {
    const steps = shuffled(rand, dense);
    if (!steps.length) continue;
    const r = brokenInForm(new Drawn(underTraits(id, design, traitsOf(steps)), held), was, keysOfSteps(steps));
    if (shatters(r.bad)) out.broken.push({ steps, bad: listed(r.bad) });
    // (the fonts drawn are let go every so often: each shuffle is a new design)
    if (i % 50 === 49) { letGo(held); designOf(id, held); }
  }
  letGo(held);
  out.seconds = Math.round((Date.now() - t0) / 1000);
  return out;
}

const TRAIT_OFFS_FILE = resolve(ROOT, 'shared/trait-offs.ts');
/** shared/trait-offs.ts with the mixes that broke each card (SHUFFLE_FILE) added: each drawn again under the sets in
    the table and found so far (a mix one of them mends isn't looked at again), and if it still breaks the card, its
    steps left out one at a time where it breaks without them, to the fewest that still do, a set kept in STEPS order
    (traitsOn leaves out its last). Sets of one step break the card alone. The sets already there stay, so a run of other
    mixes (--seed, --dense) adds to them; to start again, empty the table. */
function writeTraitOffs(cards: string[]) {
  const file: { cards: Record<string, ShuffleOut> } = JSON.parse(readFileSync(SHUFFLE_FILE, 'utf8'));
  const table = TRAIT_OFFS;
  for (const id of cards) {
    const mixes = file.cards[id]?.broken.map(b => b.steps) ?? [];
    if (!mixes.length) continue;
    let held = new Set<string>(), design = designOf(id, held)!, drawn = 0;
    const was = new Drawn(design, held), key = lettersKey(design), sets: string[][] = (table[key] ??= []);
    const breaksIt = (steps: Step[]) => {
      if (++drawn % 50 === 0) { letGo(held); held = new Set(); design = designOf(id, held)!; }
      const r = brokenInForm(new Drawn(underTraits(id, design, traitsOf(steps)), held), was, keysOfSteps(steps));
      return shatters(r.bad) ? listed(r.bad) : null;
    };
    for (const mix of mixes) {
      let bad = breaksIt(mix);
      if (!bad) continue;
      let set = [...mix];
      for (const s of mix) {
        const less = set.filter(x => x !== s), b = less.length ? breaksIt(less) : null;
        if (b) { set = less; bad = b; }
      }
      set.sort((a, b) => STEPS.indexOf(a) - STEPS.indexOf(b));
      sets.push(set);
      console.log(`${id.padEnd(14)} ${set.join(' + ').padEnd(48)} ${bad.join(' ')}`);
    }
    letGo(held);
    if (!sets.length) delete table[key];
  }
  const rows = Object.entries(table).map(([k, sets]) => `  '${k}': [\n${sets.map(s => `    [${s.map(x => `'${x}'`).join(', ')}]`).join(',\n')}\n  ]`);
  const src = readFileSync(TRAIT_OFFS_FILE, 'utf8'), open = src.indexOf('= {\n') + 4, close = src.lastIndexOf('};');
  writeFileSync(TRAIT_OFFS_FILE, src.slice(0, open) + rows.join(',\n') + (rows.length ? '\n' : '') + src.slice(close));
  console.log(`${Object.values(table).flat().length} sets on ${rows.length} cards' letters; wrote ${TRAIT_OFFS_FILE}`);
}

// ---- the sliders moved together ----

/** Mixes of sliders drawn on each card (--sliders), and the file they are written to. */
export const SLIDERS_FILE = resolve(OUT, 'breaks-sliders.json');
/** The sliders a design's body is set on, first on the Weight and Size pages, unreined (a family is solved on them):
    the ones moved most, and together. */
const BODY = ['weight', 'vWeight', 'hWeight', 'contrast', 'width', 'slant'];
/** Card `id` with sliders moved together as the editor moves them: in each of `n` mixes, one to three of the body's
    sliders (BODY) and none to two of the others the panel offers on it (less a control left out on its letters,
    controlOff), each at a value at random (to a hundredth, as the slider steps), the rest as the card has them (reined
    as the editor reins them: FONT_REINS and FONT_WIDTHS draw a slider's whole way over what stays whole alone). A
    slider shown only under a choice (a stroke end's Length under Taper: showContext) comes with that choice picked,
    if the card offers it (choicesOff), and the mix is read against the card with it picked, so the choice's own
    shape isn't read. The mixes that break the card in form (shatters), each as 'key=value' steps and the choices. */
function slidersCard(id: string, n: number, seed = 0): ShuffleOut | null {
  const t0 = Date.now();
  let held = new Set<string>(), design = designOf(id, held);
  if (!design) return null;
  const keys = keysOf(design).filter(k => specOf(k).kind === 'number' && !controlOff(parentOf(k), design!));
  const body = keys.filter(k => BODY.includes(k)), rest = keys.filter(k => !BODY.includes(k));
  const rand = seeded([...id].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0), 11) + seed), out: ShuffleOut = { seconds: 0, n, broken: [] };
  const some = (from: string[], k: number) => { const pool = [...from]; return Array.from({ length: Math.min(k, pool.length) }, () => pool.splice(Math.floor(rand() * pool.length), 1)[0]); };
  let bases = new Map<string, Drawn>();
  for (let i = 0; i < n; i++) {
    const ctx: Record<string, unknown> = {}, steps: string[] = [];
    for (const key of [...some(body, 1 + Math.floor(rand() * 3)), ...some(rest, Math.floor(rand() * 3))]) {
      const v = Math.round(rand() * 100) / 100, c = showContext(key);
      if (Object.entries(c).some(([k, x]) => (k in ctx && ctx[k] !== x) || offered(design!, c, k))) continue;
      Object.assign(ctx, c);
      steps.push(`${key}=${v}`);
    }
    const ctxSteps = Object.entries(ctx).map(([k, v]) => `${k}=${v}`), was = baseOf(bases, design, ctxSteps, held);
    const r = brokenInForm(new Drawn(withSliders(was.p, steps), held), was, steps.map(s => s.split('=')[0]));
    if (shatters(r.bad)) out.broken.push({ steps, bad: listed(r.bad), ...ctxSteps.length ? { ctx: ctxSteps } : {} });
    if (i % 50 === 49) { letGo(held); held = new Set(); design = designOf(id, held)!; bases = new Map(); }
  }
  letGo(held);
  out.seconds = Math.round((Date.now() - t0) / 1000);
  return out;
}
/** Whether choice `k` of `c` (a slider's showContext) is left out on design `p`'s letters (choicesOff): a stroke end
    as kind and form together. */
const offered = (p: Params, c: Partial<Params>, k: string) =>
  k === 'terminalForm' ? false : choicesOff(p, k).has(k === 'terminal' ? `${c.terminal}/${c.terminalForm}` : String(c[k as keyof Params]));
/** Design `p` with choices `ctx` ('key=value') picked, drawn once (in `bases`). */
function baseOf(bases: Map<string, Drawn>, p: Params, ctx: string[], held: Set<string>): Drawn {
  const tag = ctx.join(',');
  if (!bases.has(tag)) bases.set(tag, new Drawn(withSliders(p, ctx), held));
  return bases.get(tag)!;
}
/** Each mix of sliders that broke a card (SLIDERS_FILE) cut down, one slider put back at a time, to the fewest that
    still break it, printed: the sliders that break a card together. */
function slidersCut(cards: string[]) {
  const file: { cards: Record<string, ShuffleOut> } = JSON.parse(readFileSync(SLIDERS_FILE, 'utf8'));
  for (const id of cards) {
    const mixes = file.cards[id]?.broken ?? [];
    if (!mixes.length) continue;
    let held = new Set<string>(), design = designOf(id, held)!, bases = new Map<string, Drawn>(), drawn = 0;
    const read = (steps: string[], ctx: string[]) => {
      if (++drawn % 50 === 0) { letGo(held); held = new Set(); design = designOf(id, held)!; bases = new Map(); }
      const was = baseOf(bases, design, ctx, held);
      return brokenInForm(new Drawn(withSliders(was.p, steps), held), was, steps.map(s => s.split('=')[0])).bad;
    };
    for (const { steps, ctx = [] } of mixes) {
      let set = [...steps];
      for (const s of steps) if (set.length > 1 && shatters(read(set.filter(x => x !== s), ctx))) set = set.filter(x => x !== s);
      console.log(`${id.padEnd(14)} ${[...set, ...ctx.map(c => `(${c})`)].join(' ').padEnd(44)} ${listed(read(set, ctx)).join(' ')}`);
    }
    letGo(held);
  }
}
// ---- the pickers and sliders moved together ----

/** Mixes of pickers and sliders drawn on each card (--mixed), and the file they are written to; those cut down. */
export const MIXED_FILE = resolve(OUT, 'breaks-mixed.json'), MIXED_CUT_FILE = resolve(OUT, 'breaks-mixed-cut.json');
/** Each choice the panel offers on design `p` for picker or switch `k` but its own, as a step ('key=value'; a stroke
    end 'terminal=kind/form', as the stroke-end picker sets both), less those left out on its letters (choicesOff). */
function choicesOf(p: Params, k: string): string[] {
  const off = choicesOff(p, k), spec = specOf(k), at = p[k as keyof Params];
  if (k === 'terminal') return TERMINAL_SHAPES.flatMap(g => g.shapes)
    .filter(s => (s.terminal !== p.terminal || s.form !== p.terminalForm) && !off.has(`${s.terminal}/${s.form}`)).map(s => `terminal=${s.terminal}/${s.form}`);
  if (spec.kind === 'boolean') return off.has(String(!at)) ? [] : [`${k}=${!at}`];
  return (spec.options ?? []).filter(o => o !== 'auto' && o !== at && !off.has(String(o))).map(o => `${k}=${o}`);
}
/** Steps as settings ('key=value'): a stroke end's kind and form from its one step. */
const expand = (steps: string[]) => steps.flatMap(s => /^terminal=.+\//.test(s) ? [`terminal=${s.slice(9).split('/')[0]}`, `terminalForm=${s.split('/')[1]}`] : [s]);
const keyOfStep = (s: string) => s.split('=')[0];
/** The pickers a design's panel offers to pick (a control left out on its letters, controlOff, isn't; the stroke end's
    form is picked with its kind). */
const pickersOf = (p: Params) => keysOf(p).filter(k => !isSlider(k) && k !== 'terminalForm' && !controlOff(parentOf(k), p) && choicesOf(p, k).length);
/** The letters design `design` breaks under choices `picks` and sliders `slid` ('key=value'), the sliders shown in
    choices `ctx`: the choices against the card (two together breaking what each alone the map read whole), the sliders
    against the card with the choices and `ctx` picked; each read in form, as a mix is (brokenInForm). */
function readMix(design: Params, picks: string[], slid: string[], ctx: string[], bases: Map<string, Drawn>, held: Set<string>) {
  const card = baseOf(bases, design, [], held), bad = new Map<string, Kind[]>();
  if (picks.length) for (const [ch, k] of brokenInForm(baseOf(bases, design, expand(picks), held), card, expand(picks).map(keyOfStep)).bad) bad.set(ch, k);
  const picked = picks.length || ctx.length ? baseOf(bases, design, [...expand(picks), ...ctx], held) : card;
  if (slid.length) for (const [ch, k] of brokenInForm(new Drawn(withSliders(picked.p, slid), held), picked, slid.map(keyOfStep)).bad) bad.set(ch, [...new Set([...bad.get(ch) ?? [], ...k])]);
  return bad;
}
/** Card `id` under `n` mixes of the panel's pickers and sliders together, as a designer might set them in the editor:
    in each, one or two pickers or switches at a choice the panel offers on the card (choicesOff), then none to three of
    the body's sliders (BODY) and none to two of the others the panel offers with those choices picked, at values at
    random (a slider shown only under another choice comes with it, as --sliders has it, unless a choice picked says
    otherwise). The mixes that break the card in form (shatters), each as its choices, its sliders and their context. */
function mixedCard(id: string, n: number, seed = 0): ShuffleOut | null {
  const t0 = Date.now();
  let held = new Set<string>(), design = designOf(id, held);
  if (!design) return null;
  const rand = seeded([...id].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0), 17) + seed), out: ShuffleOut = { seconds: 0, n, broken: [] };
  const some = (from: string[], k: number) => { const pool = [...from]; return Array.from({ length: Math.min(k, pool.length) }, () => pool.splice(Math.floor(rand() * pool.length), 1)[0]); };
  let bases = new Map<string, Drawn>();
  const pickers = pickersOf(design);
  for (let i = 0; i < n; i++) {
    const picks = some(pickers, 1 + Math.floor(rand() * 2)).map(k => { const c = choicesOf(design!, k); return c[Math.floor(rand() * c.length)]; });
    const p = withSliders(design, expand(picks)), set = new Map(expand(picks).map(s => s.split('=') as [string, string]));
    const keys = keysOf(p).filter(k => isSlider(k) && !controlOff(parentOf(k), p));
    const ctx: Record<string, unknown> = {}, slid: string[] = [];
    for (const key of [...some(keys.filter(k => BODY.includes(k)), Math.floor(rand() * 4)), ...some(keys.filter(k => !BODY.includes(k)), Math.floor(rand() * 3))]) {
      const v = Math.round(rand() * 100) / 100, c = showContext(key);
      if (Object.entries(c).some(([k, x]) => (k in ctx && ctx[k] !== x) || (set.has(k) && set.get(k) !== String(x)) || offered(p, c, k))) continue;
      for (const [k, x] of Object.entries(c)) if (!set.has(k)) ctx[k] = x;
      slid.push(`${key}=${v}`);
    }
    const ctxSteps = Object.entries(ctx).map(([k, v]) => `${k}=${v}`), bad = readMix(design, picks, slid, ctxSteps, bases, held);
    if (shatters(bad)) out.broken.push({ steps: [...picks, ...slid], bad: listed(bad), ...ctxSteps.length ? { ctx: ctxSteps } : {} });
    if (i % 25 === 24) { letGo(held); held = new Set(); design = designOf(id, held)!; bases = new Map(); }
  }
  letGo(held);
  out.seconds = Math.round((Date.now() - t0) / 1000);
  return out;
}
/** Each mix of pickers and sliders that broke a card (MIXED_FILE) cut down, one step put back at a time, to the fewest
    that still break it: printed, and written to MIXED_CUT_FILE by card. */
function mixedCut(cards: string[]) {
  const file: { cards: Record<string, ShuffleOut> } = JSON.parse(readFileSync(MIXED_FILE, 'utf8'));
  const cut: Record<string, { steps: string[]; ctx: string[]; bad: string[] }[]> = existsSync(MIXED_CUT_FILE) ? JSON.parse(readFileSync(MIXED_CUT_FILE, 'utf8')) : {};
  for (const id of cards) {
    const mixes = file.cards[id]?.broken ?? [];
    cut[id] = [];
    if (!mixes.length) { writeFileSync(MIXED_CUT_FILE, JSON.stringify(cut, null, 1)); continue; }
    let held = new Set<string>(), design = designOf(id, held)!, bases = new Map<string, Drawn>(), drawn = 0;
    const read = (steps: string[], ctx: string[]) => {
      if (++drawn % 25 === 0) { letGo(held); held = new Set(); design = designOf(id, held)!; bases = new Map(); }
      return readMix(design, steps.filter(s => !isSlider(keyOfStep(s))), steps.filter(s => isSlider(keyOfStep(s))), ctx, bases, held);
    };
    for (const { steps, ctx = [] } of mixes) {
      let set = [...steps];
      for (const s of steps) if (set.length > 1 && shatters(read(set.filter(x => x !== s), ctx))) set = set.filter(x => x !== s);
      const bad = listed(read(set, ctx));
      cut[id].push({ steps: set, ctx, bad });
      console.log(`${id.padEnd(14)} ${[...set, ...ctx.map(c => `(${c})`)].join(' ').padEnd(52)} ${bad.join(' ')}`);
    }
    letGo(held);
    writeFileSync(MIXED_CUT_FILE, JSON.stringify(cut, null, 1));
  }
}

/** Design `p` with sliders `steps` ('key=value') set. */
export const withSliders = (p: Params, steps: string[]): Params =>
  ({ ...p, ...Object.fromEntries(steps.map(s => { const [k, v] = s.split('='); return [k, v === 'true' ? true : v === 'false' ? false : Number.isNaN(+v) ? v : +v]; })) });

// ---- the run ----

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (f: string) => (args.includes(f) ? (args[args.indexOf(f) + 1] ?? '').split(',') : []);
  const CARDS = PAGE_STYLES.map(s => s.id), askedCards = opt('--cards'), askedKeys = opt('--keys');
  for (const c of askedCards) if (!CARDS.includes(c)) throw new Error(`'${c}' isn't a card on the Style page; one of: ${CARDS.join(' ')}`);
  for (const k of askedKeys) if (!(k in SPECS)) throw new Error(`unknown setting '${k}'`);
  const kept: Map_ = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { date: '', chars: CHARS, cards: {} };

  if (args.includes('--try')) {
    // (one design against its card: --try 'weight:bold,width:condensed,curves:box' --cards grotesque, steps or k=v)
    for (const id of askedCards) {
      const held = new Set<string>(), design = designOf(id, held)!, spec = opt('--try');
      const steps = spec.filter(x => x.includes(':')), sets = Object.fromEntries(spec.filter(x => x.includes('=')).map(x => { const [k, v] = x.split('='); return [k, Number.isNaN(+v) ? v : +v]; }));
      const p = { ...underTraits(id, design, traitsOf(steps)), ...sets } as Params;
      const r = brokenInForm(new Drawn(p, held), new Drawn(design, held), [...keysOfSteps(steps), ...Object.keys(sets)]);
      console.log(`${id}: ${r.n} letters changed, ${r.bad.size} broken: ${listed(r.bad).join(' ')}`);
      letGo(held);
    }
  }
  else if (args.includes('--shuffle-offs')) await oneAtATime('breaks', () => writeTraitOffs(askedCards.length ? askedCards : CARDS));
  else if (args.includes('--mixed-cut')) await oneAtATime('breaks', () => mixedCut(askedCards.length ? askedCards : CARDS));
  else if (args.includes('--mixed')) await oneAtATime('breaks', () => {
    const t0 = Date.now(), n = Number(opt('--mixed')[0]) || 200, seed = Number(opt('--seed')[0]) || 0;
    const file: { date: string; cards: Record<string, ShuffleOut> } = existsSync(MIXED_FILE) ? JSON.parse(readFileSync(MIXED_FILE, 'utf8')) : { date: '', cards: {} };
    mkdirSync(dirname(MIXED_FILE), { recursive: true });
    for (const id of askedCards.length ? askedCards : CARDS) {
      const r = mixedCard(id, n, seed);
      if (!r) { console.log(`${id.padEnd(14)} no font file for ${STYLE_FONTS[id]}; skipped`); continue; }
      file.cards[id] = r;
      file.date = new Date().toISOString().slice(0, 10);
      writeFileSync(MIXED_FILE, JSON.stringify(file));
      console.log(`${id.padEnd(14)} ${r.broken.length} of ${n} mixes of pickers and sliders break it (${r.seconds} s)`);
    }
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s; wrote ${MIXED_FILE}`);
  });
  else if (args.includes('--sliders-cut')) await oneAtATime('breaks', () => slidersCut(askedCards.length ? askedCards : CARDS));
  else if (args.includes('--sliders')) await oneAtATime('breaks', () => {
    const t0 = Date.now(), n = Number(opt('--sliders')[0]) || 200, seed = Number(opt('--seed')[0]) || 0;
    const file: { date: string; cards: Record<string, ShuffleOut> } = existsSync(SLIDERS_FILE) ? JSON.parse(readFileSync(SLIDERS_FILE, 'utf8')) : { date: '', cards: {} };
    mkdirSync(dirname(SLIDERS_FILE), { recursive: true });
    for (const id of askedCards.length ? askedCards : CARDS) {
      const r = slidersCard(id, n, seed);
      if (!r) { console.log(`${id.padEnd(14)} no font file for ${STYLE_FONTS[id]}; skipped`); continue; }
      file.cards[id] = r;
      file.date = new Date().toISOString().slice(0, 10);
      writeFileSync(SLIDERS_FILE, JSON.stringify(file));
      console.log(`${id.padEnd(14)} ${r.broken.length} of ${n} mixes of sliders break it (${r.seconds} s)`);
    }
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s; wrote ${SLIDERS_FILE}`);
  });
  else if (args.includes('--shuffle')) await oneAtATime('breaks', () => {
    const t0 = Date.now(), n = Number(opt('--shuffle')[0]) || 400, seed = Number(opt('--seed')[0]) || 0;
    const file: { date: string; cards: Record<string, ShuffleOut> } = existsSync(SHUFFLE_FILE) ? JSON.parse(readFileSync(SHUFFLE_FILE, 'utf8')) : { date: '', cards: {} };
    mkdirSync(dirname(SHUFFLE_FILE), { recursive: true });
    for (const id of askedCards.length ? askedCards : CARDS) {
      const r = shuffleCard(id, n, seed, args.includes('--dense'));
      if (!r) { console.log(`${id.padEnd(14)} no font file for ${STYLE_FONTS[id]}; skipped`); continue; }
      file.cards[id] = r;
      file.date = new Date().toISOString().slice(0, 10);
      writeFileSync(SHUFFLE_FILE, JSON.stringify(file));
      console.log(`${id.padEnd(14)} ${r.broken.length} of ${n} shuffles break it (${r.seconds} s)`);
    }
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s; wrote ${SHUFFLE_FILE}`);
  });
  else if (args.includes('--traits')) await oneAtATime('breaks', () => {
    const t0 = Date.now(), file: { date: string; cards: Record<string, TraitsOut> } = existsSync(TRAITS_FILE) ? JSON.parse(readFileSync(TRAITS_FILE, 'utf8')) : { date: '', cards: {} };
    mkdirSync(dirname(TRAITS_FILE), { recursive: true });
    for (const id of askedCards.length ? askedCards : CARDS) {
      const r = traitsCard(id);
      if (!r) { console.log(`${id.padEnd(14)} no font file for ${STYLE_FONTS[id]}; skipped`); continue; }
      file.cards[id] = r;
      file.date = new Date().toISOString().slice(0, 10);
      writeFileSync(TRAITS_FILE, JSON.stringify(file));
      const s = Object.entries(r.singles).filter(([, c]) => breaks(c)).map(([k]) => k), p = Object.entries(r.pairs).filter(([, c]) => breaks(c)).map(([k]) => k);
      console.log(`${id.padEnd(14)} ${Object.keys(r.singles).length} steps, ${s.length} break it${s.length ? ` (${s.join(' ')})` : ''}; ${p.length} pairs break it only together${p.length ? ` (${p.join(' ')})` : ''} (${r.seconds} s)`);
    }
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s; wrote ${TRAITS_FILE}`);
  });
  else if (args.includes('--report')) report(kept, askedKeys);
  else if (args.includes('--offs')) writeOffs(kept);
  else if (args.includes('--tighten')) tightenReins(kept);
  else if (args.includes('--update-built')) await oneAtATime('breaks', () => {
    const table = new Map<string, Map<string, [number, number, number]>>(Object.entries(BUILT_REINS).map(([f, r]) => [f, new Map(Object.entries(r) as [string, [number, number, number]][])]));
    for (const id of askedCards.length ? askedCards : CARDS) {
      const t1 = Date.now(), r = builtReinsOf(id, askedKeys);
      if (!r) continue;
      const row = table.get(r.letters) ?? new Map<string, [number, number, number]>(), told: string[] = [];
      for (const [k, v] of r.reins) {
        // (rounded in toward the card's own, as a font's are)
        const lo = Math.ceil(v.lo * 1000) / 1000, hi = Math.floor(v.hi * 1000) / 1000;
        if (lo <= 0 && hi >= 1) { row.delete(k); continue; }
        row.set(k, [Math.max(0, Math.min(lo, v.at)), Math.min(1, Math.max(hi, v.at)), v.at]);
        told.push(`${k} ${lo.toFixed(3)}..${hi.toFixed(3)} (at ${v.at.toFixed(3)}) past ${v.past[0].join(' ')} | ${v.past[1].join(' ')}`);
      }
      for (const [k, v] of r.reins) {
        const on = [...v.onset[0].map(f => `${f}<`), ...v.onset[1].map(f => `${f}>`)];
        if (on.length) told.push(`${k} onset ${on.join(' ')}`);
      }
      table.set(r.letters, row);
      writeBuiltReins(table);
      console.log(`${id.padEnd(14)} ${r.letters.padEnd(14)} ${row.size} of ${r.reins.size} reined (${Math.round((Date.now() - t1) / 1000)} s)`);
      for (const t of told) console.log(`  ${t}`);
    }
  });
  else if (args.includes('--update')) await oneAtATime('breaks', () => {
    const t0 = Date.now();
    // (the table as it stands, each font's settings measured now laid over its own)
    const table = new Map<string, Map<string, [number, number]>>(Object.entries(FONT_REINS).map(([f, r]) => [f, new Map(Object.entries(r) as [string, [number, number]][])]));
    for (const id of askedCards.length ? askedCards : CARDS) {
      const t1 = Date.now(), r = reinsOf(id, askedKeys);
      if (!r) continue;
      const row = table.get(r.font) ?? new Map<string, [number, number]>();
      const told: string[] = [];
      for (const [k, v] of r.reins) {
        // (rounded in toward the card's own, so the rein stops short of where the walk found them broken)
        // (a side looked at drawn and found whole, BY_EYE, left free)
        const eye = BY_EYE[r.font]?.[k] ?? [];
        const lo = eye.includes('lo') ? 0 : Math.ceil(v.lo * 1000) / 1000, hi = eye.includes('hi') ? 1 : Math.floor(v.hi * 1000) / 1000;
        const dead = (lo >= v.at && v.at > 0 ? ' DEAD below' : '') + (hi <= v.at && v.at < 1 ? ' DEAD above' : '');
        if (lo <= 0 && hi >= 1) { row.delete(k); if (eye.length) told.push(`${k} free by eye`); continue; }
        row.set(k, [Math.max(0, Math.min(lo, v.at)), Math.min(1, Math.max(hi, v.at))]);
        told.push(`${k} ${lo.toFixed(3)}..${hi.toFixed(3)} (at ${v.at.toFixed(3)})${dead}`);
      }
      for (const [k, v] of r.reins) {
        const on = [...v.onset[0].map(f => `${f}<`), ...v.onset[1].map(f => `${f}>`)];
        if (on.length) told.push(`${k} onset ${on.join(' ')}`);
      }
      table.set(r.font, row);
      writeReins(table);
      console.log(`${id.padEnd(14)} ${r.font.padEnd(18)} ${told.length} of ${r.reins.size} reined (${Math.round((Date.now() - t1) / 1000)} s)`);
      for (const t of told) console.log(`    ${t}`);
    }
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s; wrote ${REINS_FILE}`);
  });
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
