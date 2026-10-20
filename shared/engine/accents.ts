/* An exported font's accented letters (server/export.ts, when the Export window asks for them): each the design's own
   letter as the font draws it (the engine's, a free font's moved by the settings, a block letter) and an accent mark
   drawn to belong to it. Export only: the glyph table, ALL_CHARS, the preview, the glyph strip and the golden outlines
   never see them.

   A mark is the design's own where it has one: the acute, grave and double acute are its grave accent (`), turned
   about for the acute; a dot and a dieresis are the i's own dot (round, square or a lozenge, as it draws it; where a
   heavy script's has run into the stem, its full stop no bigger than such a dot), a dieresis's two kept apart and inside
   their letter's advance, smaller where a heavy or narrow letter (ï) has no room for them, so two letters' dots side by
   side don't meet; the comma below, ģ's turned comma and the caron beside the stems of ď ť ľ Ľ are its comma and
   apostrophe. The rest
   (circumflex, caron, breve, macron, tilde, ring, cedilla, ogonek) are drawn by its pen through every stage a letter
   goes through (strokesGlyph in glyph.ts: its contrast and stress, Roundness, Hand-drawn, fills) at the weight its
   stems are drawn (a free font's are read off its l, i and n). A small letter's mark stands as far above its ink as
   the i's dot stands over its stem; a capital's sits closer and flatter, as type has them. Above, a mark is centred on
   the top of the letter's ink, below on its foot, both read along the way its stems lean; an ogonek hangs from the
   letter's right foot, a cedilla from the middle of its foot. Each keeps its letter's advance, but ď ľ ť Ľ, whose
   apostrophe stands out past the stem: it is drawn smaller and closer where the letter would otherwise widen much, and
   the advance widened as far as it needs to stand clear of a tall letter after it (caronMark). í ì î ï ī are drawn on
   ı, the i with its dot taken off. */
import { applyM, clipPoly, signedArea, toPolys } from './geom';
import { type Builder, type Font, type Glyph, type GlyphDef, type Metrics } from './font';
import { strokesGlyph } from './glyph';
import { oval } from './glyphs/shared';
import { POINTED } from './glyphs/turns';
import type { Cmd, Pt } from './types';

/** The marks: above the letter, below it (BELOW), or (`caroncomma`, ď ť ľ Ľ) beside the top of its stem. */
type MarkId = 'acute' | 'grave' | 'circumflex' | 'caron' | 'tilde' | 'dieresis' | 'ring' | 'macron' | 'breve' | 'dot' | 'hungarumlaut'
  | 'commaturned' | 'caroncomma' | 'cedilla' | 'ogonek' | 'commabelow';
const BELOW: MarkId[] = ['cedilla', 'ogonek', 'commabelow'];

/** A full stop standing in for the i's dot (a heavy script's runs into its stem) is made no wider than DOT_OF_STEM of
    the i's stem, nor DOT_MOST of the x-height. */
const DOT_OF_STEM = 1.25, DOT_MOST = 0.32;
/** A dieresis's dots keep DOTS_APART of a dot between them, and stand inside their letter's advance by DOTS_IN of a
    dot (so two letters' dots side by side keep twice that apart), made smaller (to DOTS_LEAST) where a heavy or narrow
    letter has no room for them; a dot stands at least DOT_CLEAR of its height clear of the letter. */
const DOTS_APART = 0.35, DOTS_IN = 0.12, DOTS_LEAST = 0.6, DOT_CLEAR = 0.2;

/** Each accented letter, by its mark: the accented letter and its letter, two by two ('ÀA'); ı for the small i's that
    lose their dot. Latin-1's, and Latin Extended-A's (and Romanian's commas below) for Central and Eastern Europe,
    Turkish and the Baltic languages. */
const MARKED: Record<MarkId, string> = {
  grave: 'ÀA ÈE ÌI ÒO ÙU àa èe ìı òo ùu',
  acute: 'ÁA ÉE ÍI ÓO ÚU ÝY áa ée íı óo úu ýy ĆC ćc ĹL ĺl ŃN ńn ŔR ŕr ŚS śs ŹZ źz',
  circumflex: 'ÂA ÊE ÎI ÔO ÛU âa êe îı ôo ûu',
  tilde: 'ÃA ÑN ÕO ãa ñn õo',
  dieresis: 'ÄA ËE ÏI ÖO ÜU ŸY äa ëe ïı öo üu ÿy',
  ring: 'ÅA ŮU åa ůu',
  caron: 'ČC ĎD ĚE ŇN ŘR ŠS ŤT ŽZ čc ěe ňn řr šs žz',
  caroncomma: 'ĽL ďd ťt ľl',
  dot: 'ĖE İI ŻZ ėe żz',
  hungarumlaut: 'ŐO ŰU őo űu',
  breve: 'ĂA ĞG ăa ğg',
  macron: 'ĀA ĒE ĪI ŌO ŪU āa ēe īı ōo ūu',
  commaturned: 'ģg',
  cedilla: 'ÇC ŞS ŢT çc şs ţt',
  ogonek: 'ĄA ĘE ĮI ŲU ąa ęe įi ųu',
  commabelow: 'ĢG ĶK ĻL ŅN ȘS ȚT ķk ļl ņn șs țt'
};
const ACCENTS = new Map<string, { base: string; mark: MarkId }>((Object.entries(MARKED) as [MarkId, string][])
  .flatMap(([mark, pairs]) => pairs.split(' ').map(p => [p[0], { base: p[1], mark }] as const)));

/** Whether a letter is a capital. */
const isCap = (c: string) => c !== c.toLowerCase();
/** Every accented letter an export can add, capitals first then small letters, each in Unicode's order; with them ı, the
    i their accents stand on. */
export const ACCENTED = [...ACCENTS.keys(), 'ı'].sort((a, b) => Number(isCap(b)) - Number(isCap(a)) || a.codePointAt(0)! - b.codePointAt(0)!).join('');
/** The letter accented letter `ch` is drawn on, and its mark (null for one that isn't in ACCENTED). */
export const accentOf = (ch: string) => ACCENTS.get(ch) ?? null;

/** An accented letter: its outline (placed, y up, as Glyph.cmds) and its advance: its letter's, but for ď ľ ť Ľ,
    whose apostrophe stands out past the stem and takes the room it needs before a tall letter (caronMark). */
export interface AccentGlyph { cmds: Cmd[]; adv: number }

/** Part of an outline, with its ink's box. */
interface Part { cmds: Cmd[]; box: Box }
interface Box { x0: number; y0: number; x1: number; y1: number }

/** What is read off a design once for all its accented letters. */
interface Look {
  /** how far its stems lean (a tangent), and the x-height and cap height its letters' ink stands to */ lean: number; xh: number; cap: number;
  /** the i's dot, and how far over the stem it stands (the room a small letter's mark stands in) */ dot: Part; gap: number;
  /** its grave accent, comma and apostrophe, and whether the grave runs down to the right as a grave does (a block
      letter's is a lozenge) */ grave: Part; comma: Part; quote: Part; graveRuns: boolean;
  /** the stems' thickness as drawn, and the share of the pen the drawn marks take for it: lighter than the stems */ stem: number; pen: number;
  /** ı: the i without its dot */ dotless: Glyph | null;
}

const looks = new WeakMap<Font, Look>(), made = new WeakMap<Font, Map<string, AccentGlyph | null>>();

/** Accented letter `ch` (one of ACCENTED) in `font`, or null where the font has no letter to put it on. Kept with the
    font, as an export asks for each once. */
export function accentGlyph(font: Font, ch: string): AccentGlyph | null {
  let kept = made.get(font);
  if (!kept) { kept = new Map(); made.set(font, kept); }
  if (!kept.has(ch)) kept.set(ch, compose(font, ch));
  return kept.get(ch)!;
}

function compose(font: Font, ch: string): AccentGlyph | null {
  const look = lookOf(font);
  if (ch === 'ı') return look.dotless && { cmds: look.dotless.cmds, adv: look.dotless.adv };
  const a = ACCENTS.get(ch);
  const base = a && (a.base === 'ı' ? look.dotless : font.glyph(a.base));
  if (!a || !base) return null;
  const placed = a.mark === 'caroncomma' ? caronMark(font, look, base, isCap(a.base))
    : { cmds: placeMark(font, look, base, a.mark, isCap(a.base), ch), adv: base.adv };
  const mark = placed?.cmds;
  if (!placed || !mark) return { cmds: base.cmds, adv: base.adv };
  // the mark wound the way the letter's ink is (a free font's outlines run the other way round from the engine's
  // strokes), so where a cedilla or an ogonek runs into the letter the two fill as one ink, not cancel
  return { cmds: [...base.cmds, ...(winding(mark) * winding(base.cmds) < 0 ? reversed(mark) : mark)], adv: placed.adv };
}

/** Which way an outline's ink winds: its largest contour's turn, 1 anticlockwise (y up), -1 clockwise. */
function winding(cmds: Cmd[]): number {
  let best = 0;
  for (const r of toPolys(cmds)) { const a = signedArea(r); if (Math.abs(a) > Math.abs(best)) best = a; }
  return Math.sign(best);
}

/* ---- reading the design */

/** The outline's contours, each its own commands. */
function contours(cmds: Cmd[]): Cmd[][] {
  const out: Cmd[][] = [];
  for (const c of cmds) { if (c[0] === 'M') out.push([]); out[out.length - 1]?.push(c); }
  return out.filter(c => c.length > 1);
}

/** The box of an outline's ink (its curves followed, not their handles); null for none. */
function inkBox(cmds: Cmd[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of toPolys(cmds)) for (const p of r) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return x0 <= x1 ? { x0, y0, x1, y1 } : null;
}

/** The ink's runs along the row at height y, as [start, end] pairs (nonzero, as the font is filled), x read along the
    lean (as if the letter stood upright: x less lean times y). */
function runsAt(polys: Pt[][], y: number, lean = 0): [number, number][] {
  const xs: { x: number; w: number }[] = [];
  for (const r of polys) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    if ((a.y <= y) !== (b.y <= y)) xs.push({ x: a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x) - lean * y, w: b.y > a.y ? 1 : -1 });
  }
  xs.sort((p, q) => p.x - q.x);
  const out: [number, number][] = [];
  let w = 0, from = 0;
  for (const c of xs) { const was = w; w += c.w; if (!was && w) from = c.x; else if (was && !w) out.push([from, c.x]); }
  return out;
}

/** The box of the ink between heights y0 and y1, its x read along the lean. */
function bandBox(polys: Pt[][], y0: number, y1: number, lean: number): Box | null {
  let x0 = Infinity, x1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (let k = 0; k <= 16; k++) {
    const y = y0 + (y1 - y0) * k / 16;
    for (const [a, b] of runsAt(polys, y, lean)) { x0 = Math.min(x0, a); x1 = Math.max(x1, b); b0 = Math.min(b0, y); b1 = Math.max(b1, y); }
  }
  return x0 <= x1 ? { x0, y0: b0, x1, y1: b1 } : null;
}

const median = (v: number[]) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const union = (bs: Box[]): Box => ({ x0: Math.min(...bs.map(b => b.x0)), y0: Math.min(...bs.map(b => b.y0)), x1: Math.max(...bs.map(b => b.x1)), y1: Math.max(...bs.map(b => b.y1)) });

function lookOf(font: Font): Look {
  let look = looks.get(font);
  if (look) return look;
  const m = font.m, g = (ch: string) => font.glyph(ch), top = (ch: string, or: number) => { const q = g(ch), b = q && inkBox(q.cmds); return b ? b.y1 : or; };
  const xh = top('x', m.xh), cap = top('H', m.cap);
  // the lean: the engine leans its letters by the slant; a free font's own stems lean as the font draws them, read off
  // the middle of the ink of its l and I a fifth and four fifths of the way up (a script's l is a loop), the slant the
  // design is set to deciding between them
  let lean = m.slant;
  if (font.free) {
    const leans = ([['l', xh], ['I', cap]] as const).map(([c, h]) => {
      const q = g(c), polys = q ? toPolys(q.cmds) : [], lo = runsAt(polys, h * 0.2), hi = runsAt(polys, h * 0.8);
      return lo.length && hi.length ? ((hi[0][0] + hi[hi.length - 1][1]) - (lo[0][0] + lo[lo.length - 1][1])) / 2 / (h * 0.6) : NaN;
    });
    const l = median([...leans, m.slant]);
    if (Number.isFinite(l)) lean = Math.max(-0.2, Math.min(0.7, l));
  }
  // the stems as drawn: the narrowest run across the l, the i and the n halfway up, read across the lean
  const stems = ([['l', 0.45], ['i', 0.4], ['n', 0.5]] as const).map(([c, at]) => {
    const q = g(c), runs = q ? runsAt(toPolys(q.cmds), xh * at, lean) : [];
    return runs.length ? Math.min(...runs.map(([a, b]) => b - a)) : NaN;
  });
  const stem = Number.isFinite(median(stems)) ? median(stems) : m.s;
  // the i's dot: what stands above the first gap in its ink down from its top (a row with no ink, over most of the
  // x-height: a serif on the stem's top is no dot), not much of the x-height tall; or else the full stop's
  const i = g('i'), parts = i ? contours(i.cmds).flatMap(c => { const box = inkBox(c); return box ? [{ cmds: c, box }] : []; }) : [];
  const ip = i ? toPolys(i.cmds) : [], itop = Math.max(-Infinity, ...parts.map(p => p.box.y1));
  let split = -Infinity;
  for (let y = itop - 1, inked = false; y > xh * 0.6; y -= xh / 200) {
    if (runsAt(ip, y).length) inked = true;
    else if (inked) { split = y; break; }
  }
  const isDot = (p: Part) => p.box.y0 > split && itop - split < xh * 0.6;
  const dots = parts.filter(isDot), stemParts = parts.filter(p => !isDot(p));
  const part = (c: string, or?: Part): Part => { const q = g(c), b = q && inkBox(q.cmds); return q && b ? { cmds: q.cmds, box: b } : or ?? { cmds: [], box: { x0: 0, y0: 0, x1: 0, y1: 0 } }; };
  // (a dot run into its stem, a script's heaviest weight's, is cut off at the neck between them, neckCut, and the marks
  // take the full stop's)
  const neck = i && !dots.length ? neckCut(i, xh, lean) : null;
  let dot = dots.length ? { cmds: dots.flatMap(p => p.cmds), box: union(dots.map(p => p.box)) } : part('.');
  // (the full stop standing in, made no bigger than a dot on the i's stem would be: a little wider than the stem, and
  // well under the x-height; a heavy script's stop is a ball)
  if (!dots.length) {
    const runs = runsAt(ip, xh * 0.4, lean), iStem = runs.length ? Math.min(...runs.map(([a, b]) => b - a)) : stem;
    const size = Math.max(dot.box.x1 - dot.box.x0, dot.box.y1 - dot.box.y0), k = Math.min(1, iStem * DOT_OF_STEM / size, xh * DOT_MOST / size);
    if (k < 1) dot = scaled(dot, k);
  } else {
    // (and the i's own, well under the x-height too: a heavy script's, kept apart from its stem, is a ball over a third of it)
    const size = Math.max(dot.box.x1 - dot.box.x0, dot.box.y1 - dot.box.y0), k = Math.min(1, xh * DOT_MOST / size);
    if (k < 1) dot = scaled(dot, k);
  }
  // (a dot gone to a speck, as a block font's thinnest weight's, drawn by the pen as the engine draws one, a stem and a
  // little across)
  if (Math.min(dot.box.x1 - dot.box.x0, dot.box.y1 - dot.box.y0) < stem * 0.6) {
    const d = stem * 1.15, gl = strokesGlyph({ sb: [0, 0], fn: b => { b.dot(d / 2, xh * 1.2, d); return d; }, meta: {} }, '.'.charCodeAt(0), { ...m, slant: lean }, '.');
    const b = inkBox(gl.cmds);
    if (b) dot = { cmds: gl.cmds, box: b };
  }
  const stemTop = stemParts.length ? Math.max(...stemParts.map(p => p.box.y1)) : xh;
  const gap = dots.length ? dot.box.y0 - stemTop : xh * 0.14;
  // (a grave's ink a quarter of the way down stands well left of its ink three quarters down)
  const grave = part('`'), gp = toPolys(grave.cmds), gy = (k: number) => grave.box.y0 + (grave.box.y1 - grave.box.y0) * k;
  const middle = (y: number) => { const r = runsAt(gp, y, lean); return r.length ? (r[0][0] + r[r.length - 1][1]) / 2 : NaN; };
  // (and is about as heavy as the stems: a free font's grave, which its skin doesn't move, stays the weight it was drawn
  // while a family's lighter and heavier members' stems move; its weight read as its ink over its length)
  const gw = grave.box.x1 - grave.box.x0, ink = Math.abs(gp.reduce((a, r) => a + signedArea(r), 0)) / Math.max(1, Math.hypot(gw, grave.box.y1 - grave.box.y0));
  const graveRuns = middle(gy(0.25)) - middle(gy(0.75)) > gw * 0.2 && ink > stem * 0.45 && ink < stem * 1.35;
  look = {
    lean, xh, cap, dot, gap: Math.max(xh * 0.06, Math.min(xh * 0.24, gap)), grave, graveRuns, comma: part(','), quote: part('’', part(',')),
    stem, pen: Math.max(0.3, Math.min(1.6, 0.85 * stem / Math.max(1, m.s))),
    // ı: the i with its dot taken off (or cut off at the neck, run into the stem)
    dotless: i && (dots.length ? { ...i, cmds: stemParts.flatMap(p => p.cmds) } : neck!)
  };
  looks.set(font, look);
  return look;
}

/** An i whose dot has run into its stem, cut off level where its ink runs narrowest over the x-height (the neck between
    them), its curves followed as straight steps; the i as it is where it stands no taller than a stem or has no neck. */
function neckCut(i: Glyph, xh: number, lean: number): Glyph {
  const polys = toPolys(i.cmds), box = inkBox(i.cmds);
  if (!box || box.y1 < xh * 1.15) return i;
  const width = (y: number) => runsAt(polys, y, lean).reduce((a, [p, q]) => a + q - p, 0), stem = width(xh * 0.5);
  let least = Infinity, at = 0;
  for (let y = xh * 0.9; y < box.y1 - xh * 0.05; y += xh / 100) { const w = width(y); if (w < least) { least = w; at = y; } }
  if (!(least < stem * 0.85)) return i;
  return { ...i, cmds: polys.flatMap(r => { const q = clipPoly(r, { y1: at }); return q.length > 2 ? [['M', q[0].x, q[0].y] as Cmd, ...q.slice(1).map(p => ['L', p.x, p.y] as Cmd), ['Z'] as Cmd] : []; }) };
}

/* ---- moving outlines */

/** Commands with every point moved by `f`. */
const mapped = (cmds: Cmd[], f: (x: number, y: number) => [number, number]): Cmd[] => cmds.map(c => {
  if (c[0] === 'Z') return c;
  const out: (string | number)[] = [c[0]];
  for (let j = 1; j + 1 < c.length && typeof c[j] === 'number'; j += 2) out.push(...f(c[j] as number, c[j + 1] as number));
  return out as Cmd;
});
/** Commands moved by (dx, dy). */
const moved = (cmds: Cmd[], dx: number, dy: number) => mapped(cmds, (x, y) => [x + dx, y + dy]);
/** A part made `k` times as large about its middle. */
function scaled(p: Part, k: number): Part {
  const cx = (p.box.x0 + p.box.x1) / 2, cy = (p.box.y0 + p.box.y1) / 2, f = (x: number, y: number): [number, number] => [cx + (x - cx) * k, cy + (y - cy) * k];
  const [x0, y0] = f(p.box.x0, p.box.y0), [x1, y1] = f(p.box.x1, p.box.y1);
  return { cmds: mapped(p.cmds, f), box: { x0, y0, x1, y1 } };
}

/** Each contour run the other way round, so one turned over (mirrored) still winds as the ink does. */
function reversed(cmds: Cmd[]): Cmd[] {
  return contours(cmds).flatMap(c => {
    const pts: [number, number][] = [], segs: Cmd[] = [];
    for (const s of c) {
      if (s[0] === 'M') pts.push([s[1], s[2]]);
      else if (s[0] === 'L') { segs.push(s); pts.push([s[1], s[2]]); }
      else if (s[0] === 'C') { segs.push(s); pts.push([s[5], s[6]]); }
    }
    const out: Cmd[] = [['M', ...pts[pts.length - 1]]];
    for (let k = segs.length - 1; k >= 0; k--) {
      const s = segs[k], [x, y] = pts[k];
      out.push(s[0] === 'C' ? ['C', s[3], s[4], s[1], s[2], x, y] : ['L', x, y]);
    }
    out.push(['Z']);
    return out;
  });
}

/* ---- placing a mark */

/** The mark of `ch` for its letter `base` (placed), in the letter's own space, or null where it has none. */
function placeMark(font: Font, look: Look, base: Glyph, id: MarkId, caps: boolean, ch: string): Cmd[] | null {
  const polys = toPolys(base.cmds), box = inkBox(base.cmds);
  if (!box) return null;
  const { lean } = look, below = BELOW.includes(id), u = caps ? look.cap : look.xh;
  // a capital's marks sit closer over it than a small letter's, and over a tall small letter (ĺ) a little closer too
  const tall = !caps && box.y1 > look.xh * 1.25;
  // (and over the cap height or the x-height at least, where a letter stops short of it, a script's I)
  const gap = caps ? Math.max(look.cap * 0.035, look.gap * 0.5) : look.gap * (tall ? 0.75 : 1), above = Math.max(box.y1, caps ? look.cap : look.xh) + gap;
  // the middle of the top (or foot) of the letter's ink, read along the lean, and how wide it runs there
  const h = box.y1 - Math.max(0, box.y0);
  const band = below ? bandBox(polys, Math.max(0, box.y0) + h * 0.02, Math.max(0, box.y0) + h * 0.4, lean) : bandBox(polys, box.y1 - h * 0.45, box.y1 - h * 0.02, lean);
  if (!band) return null;
  const mid = (band.x0 + band.x1) / 2, wide = band.x1 - band.x0;
  /** `cmds` moved so their ink's middle (read along the lean) stands over `x`, with their bottom (or top) at `y`. */
  const put = (cmds: Cmd[], x: number, y: number, by: 'bottom' | 'top' = 'bottom'): Cmd[] => {
    const b = inkBox(cmds);
    if (!b) return [];
    const dy = by === 'bottom' ? y - b.y0 : y - b.y1, lb = bandBox(toPolys(cmds), b.y0, b.y1, lean);
    return moved(cmds, x - (lb ? (lb.x0 + lb.x1) / 2 : (b.x0 + b.x1) / 2) + lean * dy, dy);
  };
  switch (id) {
    case 'acute': case 'grave': case 'hungarumlaut': {
      // the design's grave, as tall as a mark of its letter (within a little of its own size), a capital's flatter;
      // turned about for the acute, standing upright to be turned and leaning again after. A grave far off an
      // accent's size (block letters' is a speck) gives way to one drawn by the pen
      const gr = look.grave, gb = gr.box, want = (caps ? 0.2 : 0.3) * u + look.stem * 0.3, own = want / Math.max(1, gb.y1 - gb.y0);
      if (own > 1.7 || own < 0.5 || !look.graveRuns) {
        const drawn = drawMark(font, look, id, caps, above, ch, wide);
        return drawn && put(drawn.cmds, mid, above);
      }
      const s = Math.max(0.75, Math.min(1.3, own));
      const sy = caps ? s * 0.78 : s, cx = (gb.x0 + gb.x1) / 2, cy = (gb.y0 + gb.y1) / 2, flip = id === 'grave' ? 1 : -1;
      const one = (sx: number) => {
        const c = mapped(gr.cmds, (x, y) => { const xu = x - lean * y - (cx - lean * cy), yy = (y - cy) * sy; return [cx + xu * sx * flip + lean * yy, cy + yy]; });
        return flip < 0 ? reversed(c) : c;
      };
      if (id !== 'hungarumlaut') return put(one(s), mid, above);
      // two acutes side by side, narrower and steeper
      const a = one(s * 0.78), ab = inkBox(a)!, aw = ab.x1 - ab.x0, apart = Math.max(aw * 0.62, aw * 0.4 + look.stem * 0.8) / 2;
      return [...put(a, mid - apart, above), ...put(a, mid + apart, above)];
    }
    case 'dot': case 'dieresis': {
      // (clear of the letter by a share of the dot's height, as a heavy weight's dots stand closer)
      const d0 = look.dot, over = Math.max(above, box.y1 + (d0.box.y1 - d0.box.y0) * DOT_CLEAR);
      if (id === 'dot') return put(d0.cmds, mid, over);
      // as far apart as a small letter's are, and no further out than the letter's room (from its middle, read along
      // the lean, to the sides of its advance: the dots of the letter beside it lean as far over at the same height, so
      // what keeps them apart is where each pair stands in its own letter); the dots made smaller where even DOTS_APART
      // between them won't fit (a heavy letter's, ï's), so two letters' dots side by side don't meet
      const w0 = d0.box.x1 - d0.box.x0, room = Math.min(mid, base.adv - mid);
      const least = (1 + DOTS_APART) / 2 + 0.5 + DOTS_IN, k = Math.max(DOTS_LEAST, Math.min(1, room / (least * w0))), d = k < 1 ? scaled(d0, k) : d0, w = w0 * k;
      const want = Math.max(w * (caps ? 1.05 : 1), (caps ? 0.14 : 0.18) * u * Math.sqrt(font.m.ws));
      const apart = Math.max(w * (1 + DOTS_APART) / 2, Math.min(want, room - w * (0.5 + DOTS_IN)));
      return [...put(d.cmds, mid - apart, over), ...put(d.cmds, mid + apart, over)];
    }
    case 'commabelow': {
      const c = look.comma, k = 0.85, ox = (c.box.x0 + c.box.x1) / 2;
      return put(mapped(c.cmds, (x, y) => [ox + (x - ox) * k, y * k]), mid, Math.min(0, box.y0) - look.xh * 0.07, 'top');
    }
    case 'commaturned': {
      // the comma turned half round (as a ‘ is), over the letter
      const c = look.comma, ox = (c.box.x0 + c.box.x1) / 2, oy = (c.box.y0 + c.box.y1) / 2, k = 0.85;
      return put(mapped(c.cmds, (x, y) => [ox - (x - ox) * k, oy - (y - oy) * k]), mid, above);
    }
    // (ď ľ ť Ľ's apostrophe, which takes room of its own: caronMark)
    case 'caroncomma': return null;
    default: {
      const drawn = drawMark(font, look, id, caps, below ? 0 : above, ch, wide);
      if (!drawn) return null;
      if (id === 'ogonek') {
        // hung from the right foot: a stem's middle, or toward the right end of a foot or a bowl running wider
        const foot = Math.max(0, box.y0) + look.xh * 0.04, runs = runsAt(polys, foot, lean), last = runs[runs.length - 1];
        if (!last) return null;
        return placeAt(drawn, last[1] - last[0] < look.stem * 1.8 ? (last[0] + last[1]) / 2 : last[1] - look.stem * 0.8, look.xh * 0.03, lean);
      }
      if (id === 'cedilla') return placeAt(drawn, mid, look.xh * 0.03, lean);
      return put(drawn.cmds, mid, above);
    }
  }
}

/** The letters an apostrophe on a stem may come up against after it: a small letter's ascenders, and the i's and j's
    dots; a capital's (Ľ) the capitals' stems and the small ascenders. */
const TALL_AFTER = { small: 'bdfhijklt', caps: 'BDEFHIKLNPRbdfhklt' };
/** The apostrophe's sizes tried, largest first, on an ascender or a capital (ď ľ Ľ) and on a t: the first that needs
    the advance widened by no more than CARON_ROOM of the x-height is kept, else the smallest, with what it needs. */
const CARON_SIZES = { tall: [0.8, 0.7, 0.62], short: [0.68, 0.6, 0.54] }, CARON_ROOM = 0.1;

/** ď ľ ť Ľ: the apostrophe beside the top of the stem, its top as high as the stem's (a t's above its crossbar, no
    lower than the x-height), just clear of the letter's ink at the apostrophe's own heights (a blackletter d's ascender
    runs back over its bowl); and the letter's advance, widened as far as the apostrophe needs to stand clear of a tall
    letter after it (half the room the letter leaves an l at its top, or a little of the x-height, whichever is more),
    the apostrophe drawn smaller and so closer where that would widen the letter much, as type has it. */
function caronMark(font: Font, look: Look, base: Glyph, caps: boolean): { cmds: Cmd[]; adv: number } | null {
  const polys = toPolys(base.cmds), box = inkBox(base.cmds), q = look.quote, { lean, xh } = look;
  if (!box || !q.cmds.length) return null;
  const tall = caps || box.y1 > xh * 1.25;
  const rightAt = (ps: Pt[][], y: number) => { const r = runsAt(ps, y); return r.length ? r[r.length - 1][1] : -Infinity; };
  const leftAt = (ps: Pt[][], y: number) => { const r = runsAt(ps, y); return r.length ? r[0][0] : Infinity; };
  const l = font.glyph('l'), top = box.y1 - (box.y1 - Math.max(0, box.y0)) * 0.1;
  const natural = l ? base.adv - rightAt(polys, top) + leftAt(toPolys(l.cmds), top) : NaN;
  const clear = Math.max(xh * 0.06, Number.isFinite(natural) ? natural * 0.5 : 0);
  const after = [...TALL_AFTER[caps ? 'caps' : 'small']].flatMap(c => { const g = font.glyph(c); return g ? [toPolys(g.cmds)] : []; });
  let best: { cmds: Cmd[]; adv: number } | null = null;
  for (const k of CARON_SIZES[tall ? 'tall' : 'short']) {
    const cmds0 = mapped(q.cmds, (x, y) => [q.box.x0 + (x - q.box.x0) * k, q.box.y1 + (y - q.box.y1) * k]), b = inkBox(cmds0);
    if (!b) return null;
    const dy = Math.max(box.y1 - b.y1, caps ? -Infinity : xh * 1.04 - b.y0), lo = b.y0 + dy, hi = b.y1 + dy;
    const side = bandBox(polys, Math.max(lo, box.y0), Math.min(hi, box.y1), lean), lb = bandBox(toPolys(cmds0), b.y0, b.y1, lean);
    if (!side || !lb) return null;
    const cmds = moved(cmds0, side.x1 + xh * 0.05 - lb.x0 + lean * dy, dy), ap = toPolys(cmds);
    // (at each height the apostrophe spans, its right side and the left side of each tall letter that could come after)
    let adv = base.adv;
    for (let s = 0; s <= 12; s++) {
      const y = lo + (hi - lo) * s / 12, r = rightAt(ap, y);
      if (Number.isFinite(r)) for (const p of after) { const left = leftAt(p, y); if (Number.isFinite(left)) adv = Math.max(adv, r + clear - left); }
    }
    best = { cmds, adv };
    if (adv - base.adv <= xh * CARON_ROOM) break;
  }
  return best;
}

/** A drawn mark moved so its anchor (where it hangs from the letter) lands at height y, x along the lean. */
const placeAt = (d: Drawn, x: number, y: number, lean: number): Cmd[] => moved(d.cmds, x + lean * y - d.anchor.x, y - d.anchor.y);

/* ---- drawing a mark with the design's pen */

interface Drawn { cmds: Cmd[]; anchor: Pt }

/** Mark `id` drawn by the design's pen, standing on height `y` (a mark above) or hanging from the baseline (below), over
    a letter whose top runs `wide` across: its outline as placed, and its anchor (where a mark below hangs from). */
function drawMark(font: Font, look: Look, id: MarkId, caps: boolean, y: number, ch: string, wide: number): Drawn | null {
  const m: Metrics = { ...font.m, slant: look.lean }, e = font.eff;
  // sizes: a small letter's by its x-height; a capital's, flatter, by its cap height; wider with Width, and with room
  // for the pen
  const u = caps ? look.cap : look.xh, ws = Math.sqrt(m.ws), k = look.pen, t = look.stem * 0.85;
  // the ends: as the design's own where they are plainly round, else cut across
  const end = e.terminal === 'round' && e.terminalForm === 'round' ? 'term' as const : 'flat' as const;
  let anchor: Pt = { x: 0, y: 0 };
  const fn = (b: Builder): number => {
    const o = { scale: k, s: end, e: end };
    switch (id) {
      case 'acute': case 'grave': case 'hungarumlaut': {
        // a stroke thinning toward the letter, two side by side for the double acute
        const dbl = id === 'hungarumlaut', hh = (caps ? 0.17 : 0.28) * u + t * 0.3, w = (dbl ? 0.62 : 1) * ((caps ? 0.17 : 0.22) * u * ws + t * 0.35);
        const one = (x0: number) => b.line(id === 'grave' ? x0 + w : x0, y, id === 'grave' ? x0 : x0 + w, y + hh, { ...o, w: 0.75, ws: 0.7, part: 'diagonal' });
        one(0);
        if (dbl) one(w + Math.max(t * 1.1, w * 0.55));
        return dbl ? 2 * w + Math.max(t * 1.1, w * 0.55) : w;
      }
      case 'circumflex': case 'caron': {
        // two strokes of a weight between the hairline and the stem, meeting in a point
        const w = (caps ? 0.4 : 0.5) * u * ws + t, hh = (caps ? 0.15 : 0.26) * u + t * 0.4, [y0, y1] = id === 'caron' ? [y + hh, y] : [y, y + hh];
        b.path([['M', 0, y0], ['L', w / 2, y1], ['L', w, y0]], { ...o, w: 0.55, part: 'diagonal', miter: POINTED });
        return w;
      }
      case 'breve': {
        const w = (caps ? 0.36 : 0.44) * u * ws + t, hh = (caps ? 0.12 : 0.2) * u + t * 0.3;
        b.path([['M', 0, y + hh], ['vh', w / 2, y], ['hv', w, y + hh]], { ...o, part: 'bowl' });
        return w;
      }
      case 'macron': {
        // (on a narrow letter, ī, little wider than it)
        const w = Math.max(0.6, Math.min(1, (wide + 0.14 * u) / ((caps ? 0.42 : 0.48) * u * ws + t * 0.5))) * ((caps ? 0.42 : 0.48) * u * ws + t * 0.5);
        b.line(0, y, w, y, { ...o, w: 0.35, part: 'bar' });
        return w;
      }
      case 'tilde': {
        // a wave of four quarter turns: up to its crest, down through its middle to its trough, and up again
        const w = (caps ? 0.42 : 0.5) * u * ws + t, a = (caps ? 0.1 : 0.15) * u + t * 0.25;
        b.path([['M', 0, y + a * 0.3], ['vh', w * 0.27, y + a], ['hv', w * 0.5, y + a * 0.5], ['vh', w * 0.73, y], ['hv', w, y + a * 0.7]], { ...o, part: 'bowl' });
        return w;
      }
      case 'ring': {
        const d = caps ? 0.15 * u + t * 0.45 : 0.24 * u + t * 0.6;
        oval(b, 0, d, y, y + d, { scale: k * 0.85 });
        return d;
      }
      // (the hooks below turn in the quarter turns the letters' bowls are drawn in, so Facets cut them as theirs)
      case 'cedilla': {
        // a short stem down from the letter's foot, then a hook out to the right and back under it
        const s = 0.8 * u * (caps ? 0.75 : 1) + t * 0.3;
        b.path([['M', 0, s * 0.03], ['L', 0, -s * 0.07], ['hv', s * 0.15, -s * 0.18], ['vh', -s * 0.1, -s * 0.3]], { ...o, w: 0.45, we: 0.6, part: 'bowl' });
        anchor = { x: 0, y: s * 0.03 };
        return s * 0.15;
      }
      case 'ogonek': {
        // from the right foot, out to the left, down round and back under it to a point
        const s = 0.8 * u * (caps ? 0.75 : 1) + t * 0.3;
        b.path([['M', 0, s * 0.03], ['hv', -s * 0.13, -s * 0.12], ['vh', 0, -s * 0.28], ['L', s * 0.11, -s * 0.26]], { ...o, w: 0.6, we: 0.4, part: 'bowl' });
        anchor = { x: 0, y: s * 0.03 };
        return s * 0.11;
      }
      default: return 0;
    }
  };
  const def: GlyphDef = { sb: [0, 0], fn, meta: {} };
  const glyph = strokesGlyph(def, ch.charCodeAt(0), m, ch);
  if (!glyph.cmds.length) return null;
  const [ax, ay] = applyM(glyph.M, anchor.x, anchor.y);
  return { cmds: glyph.cmds, anchor: { x: ax, y: ay } };
}
