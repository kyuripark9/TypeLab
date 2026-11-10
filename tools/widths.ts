/* How far Width may squeeze and stretch each free font's letters and leave them whole (FONT_WIDTHS in
   shared/font-widths.ts, which freeWidth in shared/engine/free-letters.ts reins Width in to). Each card drawn in a
   free font (STYLE_FONTS) at a time, in one process:

     npm run widths                         each card at every eighth of Width: no letters broken on the way
     npm run widths -- --cards grotesque    only these cards
     npm run widths:update                  measure each card again and rewrite shared/font-widths.ts

   A letter is broken where Width puts a fault on it that the letters moved a hair that way haven't, squeezed or
   stretched plainly across as far (NUDGE; moved at all, some fonts' letters read otherwise than as the font draws them,
   a script's crossing strokes made one, and that is no more Width's than any setting's; squeezed, a w's and a y's
   crotches sharpen as a condensed face's do, and read against the letters as moved a hair, Parlance's w and y read as
   slit 2% narrower): a piece more or fewer, a counter more or fewer, a needle out of the ink or a slit into it
   (tools/weights.ts; a counter pushed shut to a crack, a tip pushed out to a point; one only where the letter so
   scaled has no point or notch near), or an outline bending back the other way twice more (BENDS, bendsBack: a nick at
   a join, a lump in a bowl, a wave down a spine), there and a
   little either side of it too (WINDOW: a hatched or inlined font's own sharp notches come and go a hair apart, a
   sketch C's at 0.504 and 0.508, not at 0.516). Crossings aren't counted: a fold within a unit, unseen, flickers on
   and off along the slider (a grotesque's d, k, q and y at a quarter). Width is broken where three letters or more
   are (BREAK): one or two alone is mostly a notch of a few units at a join the check reads sharp at one step and not
   the next (a grotesque's r at 0.375, its M at 0.125; a Didone's K and k at a hairline's join), seen only many times
   the size the editor draws; Width carried too far breaks five at once and more (a heavy face's M's, W's and w's
   crotches pushed shut squeezed, a dot font's dots run together across the alphabet).

   --update walks Width from the card's own out toward each end, the rein off, in sixteenths of the way and then four
   halvings between the last whole step and the first broken one, and keeps how wide the letters are a WINDOW back from
   the last whole one against the font's own (Metrics.ws over the card's): the least and the most; a font two cards are drawn in keeps
   the nearer of their reaches broken on the way, so both are whole. A side whole all the way keeps its end's, so the
   rein holds that end where it is and reins in only a design picked nearer it. The check reads each eighth where the
   rein puts it, the same way but a fault found again both sides of it (broken). Run it after a font's letters change (npm run fonts:import), and look at a card at Width
   0 and 100 (npm run render -- --style <id> --free --set width=1). */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { buildFont } from '../shared/engine';
import { resolve } from '../shared/engine/font';
import { freeWidth } from '../shared/engine/free-letters';
import { STYLES } from '../shared/content';
import { FONT_WIDTHS } from '../shared/font-widths';
import { STYLE_FONTS } from '../shared/free-fonts';
import { freeAtOf, type Params } from '../shared/params';
import { fontFile } from '../server/free-fonts';
import { FONTS_DIR, ROOT, holdFonts, letGo, oneAtATime } from './lib';
import { bendsBack, look, newSharp, type Look } from './weights';
import type { Cmd } from '../shared/engine/types';

const FILE = resolvePath(ROOT, 'shared/font-widths.ts');
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&?';
/** How many letters broken at once break Width; how far of the way to a slider's end the letters a fault is read
    against are moved; how far along the slider either side a letter's fault must be found again to count; the walk's
    steps (of the way from the card's own to the end), and the halvings after. */
const BREAK = 3, NUDGE = 1 / 256, WINDOW = 1 / 64, STEPS = 16, HALVINGS = 4;
/** How many more times than plainly across a letter's contour bends back before it counts as broken: two waves (one
    alone is mostly the count reading a gentle curve a hair either side of its threshold, a fat face's a and t half a
    bend more at any Width; Parlance's W, its diagonals curving into their joins, three more at Width 25, unseen). */
const BENDS = 4;
/** How tight a bend must be to be read, the radius of the circle it turns round (bendsBack): a nick or a dent turns
    tight; read at 400 units round, a script's, an italic's and a hand-drawn font's long gentle curves, a hair either side
    of flat after the push, read as waves at the first sixteenth of the way, and Sonnet, Serenade and Jotter drew at their
    own Widths only. */
const BEND_FLAT = 150;

/** Fonts whose own fine work the check reads as faults at every step (an inline's hairline hole, a sketch font's
    hatching), or here and there inside the reach the walk finds (an italic's hairline serifs' tips, its balls), their
    reach set by eye (null: not reined): squeezed and stretched across (widened), Bungee Inline's hairline, Cabin
    Sketch's hatching and Cormorant's and Libre Caslon's italics, their lean kept, look whole to either end (looked at
    their E F M w y z R a g at Width 0, 50 and 100, 2026-11-07; moved on their skeletons, Bungee Inline's F's foot had
    lipped past its stem from Width 0.5); and Turnpike's corners, each turned out a few units as drawn, Serenade's
    hairline tips and Permanent Marker's rough edges, the push drawing them a hair otherwise, read as bent or needled at
    the walk's first step, and look whole at Width 10 to 90 (looked at their E T i n, k z 2, E I M t R r 4 at 160 to 600
    px); so do the monospaces' (Kernel's, Martian Mono's) and Bricolage's narrow crotches and ink traps, Marcellus's
    flared stems, Sonnet's hairlines, Ballyhoo's beaks, Space Grotesk's M, N and W and Cathedral's blackletter points,
    read as slit, bent or needled within a sixteenth of the way (looked at M N W w 4 6, I J h i j l n, H d u, C G S, R o
    u L r at Width 0 to 100; so the Radial card's narrow a, its own Width 0.15, draws as it did). Look at them again when the engine's moves
    change (npm run render -- --style inline --free --sweep width). Ballyhoo's narrow end is reined by its mixes with
    Verticals: its own Width 0.4, narrower than 0.3 with Verticals past 0.6 shut its a and g (npm run breaks -- --sliders,
    2026-11-09), so Width 0 draws as 0.3 did, wider not reined. */
const BY_EYE: Record<string, [number, number] | null> = {
  'Bungee Inline:400': null, 'Cabin Sketch:700': null, 'Cormorant:500i': null, 'Libre Caslon Text:400i': null,
  'Turnpike:500': null, 'Serenade:400': null, 'Permanent Marker:400': null, 'Kernel:500': null, 'Martian Mono:400': null,
  'Bricolage Grotesque:700': null, 'Marcellus:400': null, 'Sonnet:400i': null, 'Ballyhoo:400': [0.913, 1.6304], 'Space Grotesk:400': null,
  'Cathedral:400': null
};

/** The cards drawn in a free font, by style id. */
const CARDS = STYLES.filter(s => STYLE_FONTS[s.id]).map(s => s.id);

/** Card `id`'s design (its settings in its free font), its fonts registered (in `held`). */
function designOf(id: string, held: Set<string>): Params | null {
  const st = STYLES.find(s => s.id === id)!, fid = STYLE_FONTS[id];
  if (!existsSync(fontFile(FONTS_DIR, fid))) return null;
  const p = { ...st.params, freeFont: fid, freeAt: freeAtOf(st.params) } as Params;
  holdFonts(p, held);
  return p;
}

/** Reads a card's letters at a Width, the rein off (FONT_WIDTHS emptied while it is read), each Width once. */
class Reader {
  private seen = new Map<string, Map<string, string>>();
  constructor(private p: Params) {}
  /** Design `p`'s letters at Width `w`, as read for faults, their outlines, and how wide they are drawn (Metrics.ws). */
  looksAt(w: number): Drawn {
    return reinOff(() => {
      const f = buildFont({ ...this.p, width: w }), looks = new Map<string, Look>(), cmds = new Map<string, Cmd[]>();
      for (const ch of CHARS) { const g = f.glyph(ch); if (g) { looks.set(ch, look(g.cmds, f.m.cap, 120)); cmds.set(ch, g.cmds); } }
      return { looks, cmds, ws: f.m.ws };
    });
  }
  /** The faults Width `w` puts on the letters, against those at `was`, by letter: its sharp points read off its letters
      squeezed or stretched plainly across as far as Width has carried them (a sketch font's hatching, an inline's slits
      and an italic's serifs' tips, carried past where they were read, came out new; a w's crotch, read as drawn,
      sharpened past it). */
  faults(w: number, was: Drawn): Map<string, string> {
    const key = `${w.toFixed(6)} ${was.ws}`, kept = this.seen.get(key);
    if (kept) return kept;
    const out = reinOff(() => {
      const f = buildFont({ ...this.p, width: w }), cap = f.m.cap, k = f.m.ws / was.ws, found = new Map<string, string>();
      for (const ch of CHARS) {
        const g = f.glyph(ch), d = was.looks.get(ch), dc = was.cmds.get(ch);
        if (!g || !d || !dc) continue;
        const plain = look(acrossBy(dc, k), cap, 120);
        // (a needle or a slit only where the letter squeezed or stretched plainly has no point or notch near: pushed evenly,
        // a w's and a y's crotches and a fat face's beaks, drawn round a few units, come out a hair sharper, unseen, and
        // Parlance's w and y read as slit 2% narrower, Ballyhoo's C, G and S as needled 8% wider)
        const l = look(g.cmds, cap), s = newSharp(l.sharp, plain.sharp, cap)
          .filter(q => !plain.sharp.some(d => d.convex === q.convex && Math.hypot(d.x - q.x, d.y - q.y) < 0.1 * cap));
        const needles = s.filter(q => q.convex).length, slits = s.length - needles;
        // (and bending back the other way BENDS more often than plainly across: a nick, a lump, a wave the push put in, an
        // a's counter pinched and an s's spine waved at 1.55 times a grotesque's width; contour by contour where they're
        // the same contours, else all told)
        const bent = (o: Cmd[]) => bendsBack(o, BEND_FLAT).sort((p, q) => p - q), bn = bent(g.cmds), bp = bent(acrossBy(dc, k)), sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
        const bends = bn.length === bp.length ? bn.some((v, i) => v >= bp[i] + BENDS) : sum(bn) >= sum(bp) + BENDS;
        const kinds = [l.pieces !== d.pieces && 'pieces', l.counters !== d.counters && 'counters', needles && `needle${needles}`, slits && `slit${slits}`, bends && 'bends'].filter(Boolean);
        if (kinds.length) found.set(ch, kinds.join('+'));
      }
      return found;
    });
    this.seen.set(key, out);
    return out;
  }
  /** The letters Width `w` breaks (faults), each with what was found: those found broken again WINDOW along the slider
      one way or the other (as far as there is slider), or, `both`, both ways. The walk counts either, so it stops
      short of a fault on its way in; the check both, so a reach found so isn't failed where a fault flickers on at
      one Width the walk's steps passed between (Crete Round's M, r, 6 and 9 at 0, its A, M and v at 12.5). */
  broken(w: number, was: Drawn, both = false): string[] {
    const here = this.faults(w, was);
    if (here.size < BREAK) return [];
    const near = [w + WINDOW, w - WINDOW].filter(v => v >= 0 && v <= 1).map(v => this.faults(v, was));
    return [...here].filter(([ch]) => (both ? near.every(m => m.has(ch)) : near.some(m => m.has(ch)))).map(([ch, k]) => `${ch}(${k})`);
  }
}

/** A card's letters at a Width as read: their faults, their outlines, how wide they are drawn. */
interface Drawn { looks: Map<string, Look>; cmds: Map<string, Cmd[]>; ws: number }
/** Outline `cmds` squeezed or stretched across `k` times as wide, nothing else moved. */
const acrossBy = (cmds: Cmd[], k: number): Cmd[] => cmds.map(c => (c[0] === 'M' || c[0] === 'L' ? [c[0], c[1] * k, c[2]] : c[0] === 'C' ? [c[0], c[1] * k, c[2], c[3] * k, c[4], c[5] * k, c[6]] : c) as Cmd);

/** `fn` run with the rein off: FONT_WIDTHS emptied, and put back after. */
function reinOff<T>(fn: () => T): T {
  const kept = Object.entries(FONT_WIDTHS);
  for (const [k] of kept) delete FONT_WIDTHS[k];
  try { return fn(); } finally { for (const [k, v] of kept) FONT_WIDTHS[k] = v; }
}

/** Card `id`'s least and most stretch that leave its letters whole, the rein off (as FONT_WIDTHS keeps them), whether
    each side was whole to its slider's end, and what broke just past each. */
function measure(id: string): { reach: [number, number]; whole: [boolean, boolean]; past: [string[], string[]] } | null {
  const held = new Set<string>(), p = designOf(id, held);
  if (!p) return null;
  const at = p.width, read = new Reader(p), sides: { r: number; past: string[]; whole: boolean }[] = [];
  for (const end of [0, 1]) {
    const was = read.looksAt(at + (end - at) * NUDGE);
    let ok = at, past: string[] = [], over = NaN;
    for (let i = 1; i <= STEPS && at !== end; i++) {
      const w = at + (end - at) * i / STEPS, b = read.broken(w, was);
      if (b.length >= BREAK) { over = w; past = b; break; }
      ok = w;
    }
    if (!Number.isNaN(over)) {
      for (let k = 0; k < HALVINGS; k++) {
        const w: number = (ok + over) / 2, b = read.broken(w, was);
        if (b.length >= BREAK) { over = w; past = b; } else ok = w;
      }
      // (a WINDOW back from it, so the slider's end, the rein's, stands clear of where they break, not on its edge, and
      // further a WINDOW at a time while a fault flickers on there)
      const back = (w: number) => (end > at ? Math.max(at, w - WINDOW) : Math.min(at, w + WINDOW));
      ok = back(ok);
      while (ok !== at && read.broken(ok, was).length >= BREAK) ok = back(ok);
    }
    sides.push({ r: reinOff(() => buildFont({ ...p, width: ok }).m.ws / buildFont(p).m.ws), past, whole: Number.isNaN(over) });
  }
  letGo(held);
  // (rounded inward, so the rein stops short of where the walk found them broken, never past it; to a ten-thousandth, as
  // a fault can flicker on a thousandth of the letters' width in from where the walk read them whole)
  return {
    reach: [Math.ceil(sides[0].r * 1e4) / 1e4, Math.floor(sides[1].r * 1e4) / 1e4], whole: [sides[0].whole, sides[1].whole],
    past: [sides[0].past, sides[1].past]
  };
}

/** Card `id` at every eighth of Width where the rein puts it: the letters each breaks, read as the walk reads them
    (the rein off, at the Width the slider asks for that resolves to where the rein puts it, and WINDOW either side).
    (Read with the rein on, its neighbours were the rein's steps, a third as far apart: a fault flickering on there,
    Raleway Thin's d, m and p at 0, read as broken. Read at the rein's Width with the rein off, a personality macro
    pushed it again: Russo One's 100 read past its reach.) */
function check(id: string): { w: number; bad: string[] }[] | null {
  const held = new Set<string>(), p = designOf(id, held);
  if (!p) return null;
  const at = p.width, read = new Reader(p), base = [0, 1].map(end => read.looksAt(at + (end - at) * NUDGE));
  const out = Array.from({ length: 9 }, (_, i) => i / 8).map(w => {
    const q = { ...p, width: w }, to = freeWidth(q, resolve(q)).width;
    // (the slider's Width resolving to `to`: resolve pushes Width by the macros, never back)
    let lo = 0, hi = 1;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (resolve({ ...p, width: mid }).width < to) lo = mid; else hi = mid; }
    const x = w === at ? at : (lo + hi) / 2;
    return { w, bad: x === at ? [] : read.broken(x, base[x < at ? 0 : 1], true) };
  });
  letGo(held);
  return out;
}

/** shared/font-widths.ts with `widths` for its table, by font id in the order the cards come. */
function write(widths: Map<string, [number, number]>) {
  const src = readFileSync(FILE, 'utf8'), open = src.indexOf('= {\n') + 4, close = src.indexOf('};', open);
  const rows = [...widths].map(([fid, [lo, hi]]) => `  '${fid}': [${lo}, ${hi}]`).join(',\n');
  writeFileSync(FILE, src.slice(0, open) + rows + (rows ? '\n' : '') + src.slice(close));
}

const args = process.argv.slice(2);
const asked = args.includes('--cards') ? args[args.indexOf('--cards') + 1].split(',') : CARDS;
for (const c of asked) if (!CARDS.includes(c)) throw new Error(`'${c}' isn't a card drawn in a free font; one of: ${CARDS.join(' ')}`);
await oneAtATime('widths', () => {
  const t0 = Date.now();
  if (args.includes('--update')) {
    // (every card drawn in a font one asked for is drawn in, since the font keeps the nearer of their reaches)
    const fonts = new Set(asked.map(id => STYLE_FONTS[id])), pick = CARDS.filter(id => fonts.has(STYLE_FONTS[id]));
    const kept = new Map(Object.entries(FONT_WIDTHS));
    // (each card's reach by font: a side whole to its slider's end says only that the font goes so far, and holds
    // back another card's no further; a side broken on the way holds every card's)
    const now = new Map<string, [number, number]>(), fresh = new Set<string>(), sides = new Map<string, { lo: number[]; hi: number[]; ends: [number, number] }>();
    const merged = (v: { lo: number[]; hi: number[]; ends: [number, number] }): [number, number] =>
      [v.lo.length ? Math.max(...v.lo) : v.ends[0], v.hi.length ? Math.min(...v.hi) : v.ends[1]];
    for (const id of CARDS) {
      const fid = STYLE_FONTS[id];
      if (!pick.includes(id)) { if (kept.has(fid)) now.set(fid, kept.get(fid)!); continue; }
      if (fid in BY_EYE) {
        const eye = BY_EYE[fid];
        if (eye) now.set(fid, eye);
        console.log(`${id.padEnd(14)} ${fid.padEnd(26)} ${eye ? `${eye[0]} to ${eye[1]}` : 'not reined'}, set by eye (BY_EYE)`);
        continue;
      }
      const m = measure(id);
      if (!m) { console.log(`${id.padEnd(14)} no font file for ${fid} in ${FONTS_DIR}; kept as it was`); if (kept.has(fid) && !fresh.has(fid)) now.set(fid, kept.get(fid)!); continue; }
      const other = fresh.has(fid), v = sides.get(fid) ?? { lo: [], hi: [], ends: [1, 1] };
      if (m.whole[0]) v.ends[0] = Math.min(v.ends[0], m.reach[0]); else v.lo.push(m.reach[0]);
      if (m.whole[1]) v.ends[1] = Math.max(v.ends[1], m.reach[1]); else v.hi.push(m.reach[1]);
      sides.set(fid, v);
      now.set(fid, merged(v));
      fresh.add(fid);
      const tell = (i: number) => `${m.reach[i].toFixed(3)}${m.whole[i] ? ' (whole to the end)' : ''}`;
      console.log(`${id.padEnd(14)} ${fid.padEnd(26)} ${tell(0)} to ${tell(1)}${other ? `  (with another card's: ${now.get(fid)!.join(' to ')})` : ''}`);
      for (const [i, side] of ['narrower', 'wider'].entries()) if (m.past[i].length) console.log(`  ${side}, past it: ${m.past[i].join(' ')}`);
    }
    for (const fid of fresh) {
      const was = kept.get(fid), is = now.get(fid)!;
      if (was && (was[0] !== is[0] || was[1] !== is[1])) console.log(`${fid}: ${was.join(' to ')} before, ${is.join(' to ')} now`);
    }
    write(now);
    console.log(`${pick.length} cards in ${((Date.now() - t0) / 1000).toFixed(0)} s; wrote ${FILE}`);
    return;
  }
  let bad = 0;
  for (const id of asked) {
    // (a font set by eye is looked at, not read: the check reads its own fine work as faults)
    if (STYLE_FONTS[id] in BY_EYE) { console.log(`${id.padEnd(14)} set by eye (BY_EYE)`); continue; }
    const r = check(id);
    if (!r) { console.log(`${id.padEnd(14)} no font file for ${STYLE_FONTS[id]} in ${FONTS_DIR}; skipped`); continue; }
    const worst = r.filter(s => s.bad.length >= BREAK);
    bad += worst.length;
    console.log(`${id.padEnd(14)} ${worst.length ? 'BROKEN' : 'whole '} ${r.map(s => s.bad.length).join(' ')}`);
    for (const s of worst) console.log(`  ${(s.w * 100).toFixed(1).padStart(5)}  ${s.bad.join(' ')}`);
  }
  console.log(`${asked.length} cards in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (bad) { console.log(`${bad} eighth${bad === 1 ? '' : 's'} with ${BREAK} letters or more broken`); process.exitCode = 1; }
});
