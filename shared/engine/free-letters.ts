/* A free font's letters in a design (see shared/free-fonts.ts and free.ts): the family's nearest weight or
   italic, moved on their skeletons by the settings (skin.ts) and restyled where the settings ask for the
   engine's shapes (restyle.ts); letters in a form the font hasn't got come from its twin, the font read
   as the engine's own settings. Called by buildFont (font.ts) for a design with a freeFont. */
import { slantDeg, xHeightOfRatio, type Params } from '../params';
import { applyM, clamp } from './geom';
import { freeFont, type FreeFont } from './free';
import { FREE_FAMILIES, nearestFont, parseFontId, type FreeFontRef } from '../free-fonts';
import { drawnCmds, type Drawn, type Node } from './outline';
import { HAIR_KEEP, PEN, evenWeight } from './even-weight';
import { FORM_LETTERS, SPAN_TOL, descK, fontVertexed, rigSkeleton, skinMeasures, skinMove, skinRig, skinRoom, skinSpan, type SkinMeasures, type SkinRig } from './skin';
import { ENTRY_LETTERS, EXIT_LETTERS, OVERLAP_LETTERS, bowlLook, cornerLooks, dotLook, restyleBlockBowls, restyleBowls, restyleCursive, restyleDots, restyleOverlap, restylePeaks, restyleCorners, restyleEnds, restyleSerifs, restyleStencil, serifLook, stencilLook, type RestyleCtx } from './restyle';
import { nearestOn, skeleton, type Skeleton } from './scan';
import type { Pt, SerifSpec } from './types';
import { SERIF_SB, buildFont, type Effective, type Font, type Glyph, glyphDefOf, type Metrics, metrics, resolve, termSpec } from './font';
import { blankParts, placeGlyph, wobbler, type Unplaced } from './glyph';

/* ---- free fonts' letters (see shared/free-fonts.ts), moved by the settings as far as they're moved from the
   ones the font was picked at (Params.freeAt): heavier is a heavier font of the family where it has one;
   Width, the heights, Inner space, the dots' size, Pinch, Ink traps and the serifs' size move its letters on their
   skeletons as the engine's own letters move (skin.ts), and Weight the rest of the way, Verticals, Horizontals and
   Contrast push its outline out or in evenly, as far as they can its drawing kept (even-weight.ts); then the shapes
   the engine draws are set on them where the settings ask for others than the font's (restyle.ts): its dots,
   bowls (and a bowl parted from its stem), stroke ends (their kind, length, curl, openness, tails), Cursive's flicks,
   serifs, stencil and crossbar gaps, peaks and corners; slanted past half an italic's lean,
   its italic; and the font's own lean, rotation, spacing and fill are kept until the settings move. */

/** How far an italic leans, taken as a typical one's. */
const ITALIC_DEG = 12;

interface FreeLetters {
  /** the font drawn from, and the one the settings ask for, which may not have arrived */ font?: FreeFont; want: string;
  /** design units to the font's, and how much wider (the side bearings) */ k: number; sx: number;
  /** the engine's measures of the settings the font's letters stand for, and of those asked for */ from: SkinMeasures; to: SkinMeasures;
  /** what moves its letters on their skeletons (skin.ts): those asked for at the weight, Verticals, Horizontals and
      Contrast the font stands for; and how far those then push their outline out (in where negative), sideways and up
      and down, as shares of the font's stem (PEN in even-weight.ts, in step along each slider) */
  rest: SkinMeasures; pen: { x: number; y: number };
  /** whether its letters move on their skeletons (not a pixel font's, which are only stretched) */ skin: boolean;
  /** the side bearings' scale */ sb: number;
  /** how far a monospaced font is drawn back toward proportional spacing, Monospace moved below where it was picked (0
      none, 1 all the way) */ unmono: number;
  /** placing the letters: only what the settings move past the font's own (lean, turn, fill, spacing) */ m: Metrics;
  /** the settings the font's letters stand for, and those asked for, for the shapes that restyle them (restyle.ts) */ pick: Effective; now: Effective;
  /** the serifs asked for, in design units, and whether they're the engine's to set on the letters: where the font
      has none and they're asked for, or its own are another shape (they are taken off, see skin.ts) */ serif: SerifSpec | null; serifs: boolean;
  /** the settings as given, and as the font was picked at (see twinGlyph) */ raw: Params; rawPick: Params;
}

export function freeLetters(params: Params, e: Effective, m: Metrics): FreeLetters | null {
  const r = parseFontId(e.freeFont);
  if (!r) return null;
  const b = resolve({ ...params, ...params.freeAt }), mb = metrics(b);
  // the lean asked for, counting the font's own, decides upright or italic
  const lean = (r.italic ? ITALIC_DEG : 0) + slantDeg(e.slant - b.slant), weight = r.weight + (e.weight - b.weight) * 1000;
  const want = nearestFont(r.family, weight, lean >= ITALIC_DEG / 2) ?? e.freeFont;
  const font = freeFont(want) ?? freeFont(e.freeFont), ref: FreeFontRef = font && font.id === want ? parseFontId(want)! : r;
  // Weight 0.4 is a 400: the font drawn from stands for the weight it is, and what it falls short of its
  // letters make up on their skeletons
  const drawnAt = Math.max(0, b.weight + (ref.weight - r.weight) / 1000), from = skinMeasures(metrics({ ...b, weight: drawnAt }));
  // placing the letters (placeGlyph in glyph.ts) counts each of its effects only as far as the settings move it from
  // where the font was picked: the fill, mirror, monospacing and bounce here, the slant, rotation, wobble and slice in
  // `m` below. An effect placeGlyph gains needs the same here, or a free font's letters change as soon as it is picked
  const p: Effective = {
    ...e, fill: e.fill === b.fill ? 'solid' : e.fill, mirror: e.mirror === b.mirror ? 'normal' : 'mirrored',
    mono: Math.max(0, e.mono - b.mono), bounce: Math.max(0, e.bounce - b.bounce)
  };
  // serifs of another shape than the font's, or none, take its own off (to length 0 on their skeletons); the engine's
  // are set on where any are asked for that the font's aren't
  const to = skinMeasures(m), had = mb.ctx.serif, asked = m.ctx.serif, other = !!had && (!asked || serifLook(had) !== serifLook(asked));
  if (other) to.serif = 0;
  // Weight, Verticals, Horizontals and Contrast push the outline (even-weight.ts), each as far along its slider from
  // where the font was picked toward either end (-1 to 1) as it is moved; the rest move it on its skeleton
  const thick = { weight: drawnAt, vWeight: b.vWeight, hWeight: b.hWeight, contrast: b.contrast };
  const moved = (Object.keys(thick) as (keyof typeof thick)[]).some(k => Math.abs(e[k] - thick[k]) > 1e-4);
  const rest = moved ? skinMeasures(metrics({ ...e, ...thick })) : to;
  if (other) rest.serif = 0;
  const along = (now: number, at: number) => (now > at ? Math.min(1, (now - at) / Math.max(1e-4, 1 - at)) : -Math.min(1, (at - now) / Math.max(1e-4, at)));
  const reach = (t: number, r: { out: number; in: number }) => (t > 0 ? t * r.out : t * r.in);
  const w = reach(along(e.weight, drawnAt), PEN.weight);
  const pen = { x: w + reach(along(e.vWeight, b.vWeight), PEN.verticals), y: w + reach(along(e.hWeight, b.hWeight), PEN.horizontals) + reach(-along(e.contrast, b.contrast), PEN.contrast) };
  // Weight alone draws the font's bars no heavier than its stems, but as far as the design's are: a heavy design's
  // Horizontals, raised to draw its bars as heavy as the font's where the measures hold them under a share of the
  // x-height, draw a lighter weight's bars as much as twice its stems (Orbital's, Gumdrop's, Timber's). The bars as
  // much heavier or lighter again as Contrast and Horizontals are asked past the pick's
  if (e.weight < b.weight) {
    const pick = { ...params, ...params.freeAt }, mw = metrics(resolve({ ...params, contrast: pick.contrast, hWeight: pick.hWeight })), rw = mw.hT / mw.tDir(0, 1), most = Math.max(1, from.hT / from.v);
    if (rw > most) to.hT *= most / rw;
  }
  return {
    font, want, k: font ? m.cap / font.cap : 1, sx: m.ws / mb.ws, from, to, rest, pen, skin: !FREE_FAMILIES[r.family]?.grid, pick: b, now: e,
    serif: asked ?? null, serifs: !!asked && (!had || other), raw: params, rawPick: { ...params, ...params.freeAt },
    sb: Math.pow(2, (e.sideBearing - b.sideBearing) * 3), unmono: b.mono > 0 && e.mono < b.mono ? (b.mono - e.mono) / b.mono : 0,
    m: { ...m, p, slant: Math.tan((lean - (ref.italic ? ITALIC_DEG : 0)) * Math.PI / 180), rot: m.rot - mb.rot,
      wob: Math.max(0, e.wobble - b.wobble), sliceH: e.slice === b.slice ? 0 : m.sliceH }
  };
}

/** The free fonts a design draws from: the one it's written in, and the heavier, lighter or italic ones
    its settings and its letters' own ask for. */
export function freeFontsWanted(params: Params): string[] {
  if (!params.freeFont) return [];
  const want = (p: Params) => { const e = resolve(p); return freeLetters(p, e, metrics(e))?.want; };
  return [...new Set([params.freeFont, want(params), ...Object.values(params.glyphs ?? {}).map(g => want({ ...params, ...g, glyphs: {} }))])]
    .filter((id): id is string => !!id);
}

/** A drawn outline with every point and handle moved by `f`. */
export const mapDrawn = (d: Drawn, adv: number, f: (x: number, y: number) => [number, number]): Drawn => ({
  adv,
  contours: d.contours.map(c => c.map(n => {
    const [x, y] = f(n.x, n.y), out: Node = { ...n, x, y };
    if (n.ix !== undefined) [out.ix, out.iy] = f(n.ix, n.iy!);
    if (n.ox !== undefined) [out.ox, out.oy] = f(n.ox, n.oy!);
    return out;
  }))
});

/** The middle lines an Inline fill runs down a letter drawn as `contours`: its skeleton, scanned off the letter as drawn,
    eased along (as a cell-by-cell skeleton steps). */
export function inlineSkeleton(contours: Node[][]): Pt[][] {
  const ease = (l: Pt[]) => { let c = l; for (let k = 0; k < 6; k++) c = c.map((q, i) => (i === 0 || i === c.length - 1 ? q : { x: (c[i - 1].x + 2 * q.x + c[i + 1].x) / 4, y: (c[i - 1].y + 2 * q.y + c[i + 1].y) / 4 })); return c; };
  return skeleton(contours).edges.map(e => ease(e.pts.map(q => ({ x: q.x, y: q.y }))));
}

/** The ink's left and right edges, as far as its curves reach (a handle standing out past its curve doesn't count): the
    room a letter takes, the same whether the font drew it or the settings moved it, its handles moved otherwise (a
    blackletter's heads and feet, Vellum's o: measured by its handles a letter came out up to 19 units narrower and off
    to one side at the first nudge of any setting). */
export function inkSpan(d: Drawn): [number, number] {
  let x0 = Infinity, x1 = -Infinity;
  const at = (v: number) => { if (v < x0) x0 = v; if (v > x1) x1 = v; };
  for (const c of d.contours) for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    at(a.x);
    if (a.ox === undefined && b.ix === undefined) continue;
    // (where the curve turns back across: its x' a quadratic in t)
    const p0 = a.x, p1 = a.ox ?? a.x, p2 = b.ix ?? b.x, p3 = b.x, A = -p0 + 3 * p1 - 3 * p2 + p3, B = 2 * (p0 - 2 * p1 + p2), C = p1 - p0;
    const ts = Math.abs(A) < 1e-12 ? (Math.abs(B) < 1e-12 ? [] : [-C / B]) : B * B - 4 * A * C < 0 ? [] : [1, -1].map(sg => (-B + sg * Math.sqrt(B * B - 4 * A * C)) / (2 * A));
    for (const t of ts) if (t > 0 && t < 1) { const u = 1 - t; at(u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3); }
  }
  return x0 > x1 ? [0, 0] : [x0, x1];
}

/** The ink's left and right edges, by its points and handles. */
export function inkX(d: Drawn): [number, number] {
  let x0 = Infinity, x1 = -Infinity;
  for (const c of d.contours) for (const n of c) {
    x0 = Math.min(x0, n.x, n.ix ?? n.x, n.ox ?? n.x); x1 = Math.max(x1, n.x, n.ix ?? n.x, n.ox ?? n.x);
  }
  return x0 > x1 ? [0, 0] : [x0, x1];
}

/* ---- a free font's twin: the font read as the engine's own settings, for the letters asked for in a form the font
   hasn't got (a single-storey a, a mirrored g, a k on a bar, Arches), which the engine draws */

/** Whether letter `ch` is asked for (settings `a`) in another form than the one the font's own stands for (its settings
    as picked, `b`): built otherwise, the a's storeys (left on auto, the font's), or a letter-form setting moved on the
    letters it reaches (FORM_LETTERS in skin.ts). A font is written as it is drawn, script or print, whatever Cursive asks:
    Cursive gives the font's own letters the engine's flicks (restyleCursive in restyle.ts). Given the `font`, a font whose
    letters keep their own forms (FreeFamily.ownForms: a blackletter, a joined script) is in none, and round Bends
    reaches only a font whose letters turn in straight points as the engine's do (fontVertexed). */
export function formChanged(ch: string, a: Effective, b: Effective, font?: FreeFont | null): boolean {
  if (a.build !== b.build) return true;
  if (font && FREE_FAMILIES[font.family]?.ownForms) return false;
  // (the Letter a left on auto keeps the font's own form, which its letters are drawn in)
  return (ch === 'a' && a.story !== 'auto' && a.singleStory !== b.singleStory)
    || (Object.keys(FORM_LETTERS) as (keyof typeof FORM_LETTERS)[]).some(k => FORM_LETTERS[k].includes(ch) && a[k] !== b[k] && (k !== 'bends' || !font || fontVertexed(font)));
}

/* What a free font's width reads as, metrics() (font.ts) undone: twinFit reads the font's n back through it, and
   tests/free-fonts.test.ts runs it the other way, so a change to metrics() that leaves it behind fails there. (Its
   weight and contrast are found by asking metrics() itself, the design's Verticals and Horizontals counted.) */
/** The Width that draws letters `ws` times as wide as at its middle: metrics' ws = lerp(0.6, 1) below the middle
    and lerp(1, 1.5) above it undone. */
export const widthOfScale = (ws: number) => clamp(ws < 1 ? (ws - 0.6) / 0.8 : 0.5 + (ws - 1));

/** The ink's runs along a row at height y (across) or down a column at x (down), as [start, end] pairs. */
function inkRuns(cs: Node[][], at: number, down = false): [number, number][] {
  const xs: number[] = [];
  for (const c of cs) for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    // (each segment as its chord: the runs are read across stems and bars, not along curves)
    const [pa, pb, qa, qb] = down ? [a.x, b.x, a.y, b.y] : [a.y, b.y, a.x, b.x];
    if ((pa <= at) !== (pb <= at)) xs.push(qa + (at - pa) / (pb - pa) * (qb - qa));
  }
  xs.sort((p, q) => p - q);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

/** A free font's own measures, read straight off its letters' ink: how thick its stems are (the n's, across the middle
    of the x-height, squared to the way they lean), how thick its bar (the H's, down the middle of its width), and how
    far its stems lean from upright, in degrees (the l's and the I's, from low to high on them). */
interface FontLook { stem: number; bar: number; lean: number }
const fontLooks = new WeakMap<FreeFont, FontLook>();
function fontLook(font: FreeFont): FontLook {
  let look = fontLooks.get(font);
  if (look) return look;
  const leans: number[] = [];
  for (const [ch, top] of [['l', font.xh], ['I', font.cap], ['h', font.xh]] as const) {
    const g = font.glyphs[ch];
    if (!g) continue;
    const lo = inkRuns(g.contours, top * 0.2)[0], hi = inkRuns(g.contours, top * 0.8)[0];
    if (lo && hi) leans.push(Math.atan2((hi[0] + hi[1]) / 2 - (lo[0] + lo[1]) / 2, top * 0.6) * 180 / Math.PI);
  }
  const lean = leans.length ? leans.sort((a, b) => a - b)[leans.length >> 1] : 0;
  // (at each of a few heights, the narrowest of the runs as wide as a stem, not a hairline crossing nor a join that runs
  // into the shoulder; then the middle of those)
  const n = font.glyphs.n, stems: number[] = [];
  if (n) for (const h of [0.25, 0.35, 0.45, 0.55, 0.65]) {
    const runs = inkRuns(n.contours, font.xh * h).map(r => r[1] - r[0]), most = Math.max(0, ...runs), wide = runs.filter(w => w >= most * 0.35);
    if (wide.length) stems.push(Math.min(...wide));
  }
  stems.sort((a, b) => a - b);
  const stem = (stems.length ? stems[stems.length >> 1] : font.cap * 0.12) * Math.cos(lean * Math.PI / 180);
  let bar = 0;
  const H = font.glyphs.H;
  if (H) {
    let x0 = Infinity, x1 = -Infinity;
    for (const c of H.contours) for (const q of c) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); }
    const mid = inkRuns(H.contours, (x0 + x1) / 2, true).find(r => r[0] < font.cap * 0.75 && r[1] > font.cap * 0.25);
    if (mid) bar = mid[1] - mid[0];
  }
  look = { stem, bar: bar > 0 ? Math.min(bar, stem) : stem * 0.85, lean };
  fontLooks.set(font, look);
  return look;
}

/** The value between lo and hi at which f (rising, or falling with `falls`) reaches `want`. */
function solve(f: (v: number) => number, want: number, lo = 0, hi = 1, falls = false) {
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if ((f(mid) < want) !== falls) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

const twinFits = new WeakMap<FreeFont, Map<string, Partial<Params>>>();
/** The engine's settings a free font's letters read as (once a font and a design): the weight whose stems are as thick
    as its stems (with the design's own Verticals), the contrast whose bars are as thin as its bar (with its
    Horizontals), its x-height, its width (its n against the engine's), whether it has serifs, and its slant (as far as
    its stems lean). */
function twinFit(font: FreeFont, pick: Params): Partial<Params> {
  let kept = twinFits.get(font);
  if (!kept) { kept = new Map(); twinFits.set(font, kept); }
  const id = JSON.stringify(pick);
  let fit = kept.get(id);
  if (fit) return fit;
  const n = skinRig(font, 'n') ?? skinRig(font, 'H'), H = skinRig(font, 'H') ?? n, look = fontLook(font);
  const m = metrics(resolve(pick)), k = m.cap / font.cap, s = look.stem * k, thin = look.bar * k;
  const at = (q: Partial<Params>) => metrics(resolve({ ...pick, ...q }));
  const weight = solve(w => at({ weight: w }).s, s), contrast = solve(c => at({ weight, contrast: c }).hT, thin, 0.5, 1, true);
  const xHeight = clamp(xHeightOfRatio(font.xh / font.cap));
  // (as wide as the font's n, against the engine's at the middle of Width)
  const g = font.glyphs.n, eng = buildFont({ ...pick, freeFont: '', freeAt: {}, glyphs: {}, outlines: {}, weight, contrast, xHeight, width: 0.5, slant: 0 }).glyph('n');
  let width = 0.5;
  if (g && eng) {
    const [x0, x1] = inkX(g), ws = ((x1 - x0) * m.cap / font.cap) / Math.max(1, eng.bodyW);
    width = widthOfScale(ws);
  }
  fit = { weight, contrast, xHeight, width, serif: !!(n?.serifs || H?.serifs), slant: clamp(look.lean / slantDeg(1)) };
  if (kept.size > 8) kept.delete(kept.keys().next().value!);
  kept.set(id, fit);
  return fit;
}

const twinFonts = new Map<string, Font>();
/** Letter `ch` as the free font's twin draws it: the engine's, at the settings the font reads as (twinFit) moved as far
    as the design moves them from those it was picked at. */
export function twinGlyph(ch: string, fl: FreeLetters): Glyph | null {
  if (!fl.font) return null;
  const fit = twinFit(fl.font, fl.rawPick), now = fl.raw, pick = fl.rawPick;
  const moved = (k: 'weight' | 'contrast' | 'xHeight' | 'width' | 'slant') => clamp((fit[k] as number) + (now[k] as number) - (pick[k] as number));
  const p: Params = { ...now, freeFont: '', freeAt: {}, glyphs: {}, outlines: {}, weight: moved('weight'), contrast: moved('contrast'), xHeight: moved('xHeight'),
    width: moved('width'), slant: moved('slant'), serif: now.serif !== pick.serif ? now.serif : !!fit.serif };
  const key = JSON.stringify(p);
  let f = twinFonts.get(key);
  if (!f) { f = buildFont(p); if (twinFonts.size > 8) twinFonts.delete(twinFonts.keys().next().value!); twinFonts.set(key, f); }
  return f.glyph(ch);
}

const restyles = new WeakMap<Node[][], Map<string, Node[][]>>();
/** The restyled letters the engine's serifs were set on (a letter with no stem end they stand on, a script's, gets none,
    and no room for them either). */
const withSerifs = new WeakSet<Node[][]>();
/** A rigged free font's letter, moved on its skeleton, given the shapes the settings ask for past the ones
    it stands for (restyle.ts); kept with the moved outline, by the settings, as dragging a slider asks again. */
function restyled(rig: SkinRig, cs: Node[][], fl: FreeLetters): Node[][] {
  const k = fl.to.s / fl.from.s, x = rig.ctx, fam = fl.font && FREE_FAMILIES[fl.font.family], exits = fam?.freeExits;
  const c: RestyleCtx = { ch: x.ch, cap: x.cap, xh: x.xh, stem: rig.stem * x.cap * k, bar: rig.bar * x.cap * k, ...(exits ? { exits: { stem: rig.ref().stem * k } } : {}),
    ...(fam?.blocks ? { stubs: true as const } : {}) };
  const a = cornerLooks(fl.pick, c), b = cornerLooks(fl.now, c);
  // the engine's serifs, set on the stems the letter's own were taken off (or on a sans's), in the font's units; the
  // lines they stand on, where the settings moved them
  const sf = fl.serifs && fl.serif ? { ...fl.serif, len: fl.serif.len / fl.k, ref: (fl.serif.ref ?? fl.serif.len) / fl.k, th: fl.serif.th / fl.k, inner: fl.serif.inner && { ...fl.serif.inner, th: fl.serif.inner.th / fl.k } } : null;
  // (as moveMap in skin.ts moves the letter's own heights, there clamped, and the ascenders and descenders only a
  // lowercase letter's: keep the two in step)
  const kd = fl.to.desc / fl.from.desc, xh1 = x.lower ? x.xh * fl.to.xr / fl.from.xr : x.xh;
  const lines = [0, x.cap, xh1, x.asc + (fl.to.asc - fl.from.asc) * x.cap, x.desc * descK(kd)];
  const sa = stencilLook(fl.pick), sb = stencilLook(fl.now), ba = bowlLook(fl.pick), bb = bowlLook(fl.now);
  const ends = (e: Effective) => [termSpec(e), e.terminal, e.terminalLength, e.terminalCurl, e.tail, e.aperture];
  const da = [fl.pick.dots, dotLook(fl.pick)], db = [fl.now.dots, dotLook(fl.now)];
  // (every setting a restyle step below reads goes in this key: one left out leaves its slider showing the letter
  // kept from before)
  const key = JSON.stringify([a, b, ends(fl.pick), ends(fl.now), sf, sf && lines, sa, sb, ba, bb, da, db, fl.pick.apex, fl.now.apex, fl.now.apex !== fl.pick.apex && lines,
    fl.pick.overlap, fl.now.overlap, fl.pick.cursive, fl.now.cursive]);
  let kept = restyles.get(cs);
  if (!kept) { kept = new Map(); restyles.set(cs, kept); }
  let out = kept.get(key);
  if (!out) {
    // (each step's skeleton scanned off the outline as it stands then, and only when a step needs it)
    // (the letter as the font draws it has its skeleton scanned already, with its rig)
    const scan = (o: Node[][]) => { let sk: Skeleton | undefined; return () => (sk ??= o === rig.contours ? rigSkeleton(rig) : skeleton(o)); };
    // (a bowl parted from its stem is the font's o, moved as the letter is)
    const oRig = fl.now.overlap < fl.pick.overlap && OVERLAP_LETTERS.includes(x.ch) && fl.font ? skinRig(fl.font, 'o') : null;
    out = restyleOverlap(cs, c, fl.pick.overlap, fl.now.overlap, oRig && skinMove(oRig, fl.from, fl.to));
    out = restyleDots(out, c, fl.pick, fl.now);
    // (a font of block letters turns its bowls in corners: those are drawn again)
    out = c.stubs ? restyleBlockBowls(out, ba, bb, c.stem) : restyleBowls(out, ba, bb, scan(out), fl.font ? Math.tan(fontLook(fl.font).lean * Math.PI / 180) : 0);
    out = restyleEnds(out, c, fl.pick, fl.now, scan(out));
    out = restyleCursive(out, c, fl.pick.cursive, fl.now.cursive);
    const bare = out;
    if (sf) out = restyleSerifs(out, { ...c, lower: x.lower, lines }, sf, scan(out));
    const serifed = out !== bare;
    out = restyleStencil(out, c, sa, sb, scan(out));
    out = restylePeaks(out, { ...c, lines }, fl.pick.apex, fl.now.apex);
    out = restyleCorners(out, c, a, b);
    if (serifed) withSerifs.add(out);
    if (kept.size >= 6) kept.delete(kept.keys().next().value!);
    kept.set(key, out);
  }
  return out;
}

/** A letter as the settings but Weight, Verticals, Horizontals and Contrast move it, `cs`, pushed out (or in) evenly
    as far as they ask (`pen`, of the font's stem, its n's), set back on its lines as moved. In, no further all told
    than HAIR_KEEP of the font's thinnest strokes: as many times less far along each way in as the most the settings
    could ask is past that. Kept by the outline and the push. */
function weighedOut(rig: SkinRig, cs: Node[][], fl: FreeLetters): Node[][] {
  if (!fl.pen.x && !fl.pen.y) return cs;
  const stem = rig.ref().stem, room = fl.font ? HAIR_KEEP * thinnest(fl.font) : Infinity;
  const inX = Math.min(1, room / ((PEN.weight.in + PEN.verticals.in) * stem)), inY = Math.min(1, room / ((PEN.weight.in + PEN.horizontals.in + PEN.contrast.in) * stem));
  const dx = fl.pen.x * stem * (fl.pen.x < 0 ? inX : 1), dy = fl.pen.y * stem * (fl.pen.y < 0 ? inY : 1);
  const x = rig.ctx, xh = x.lower ? x.xh * fl.rest.xr / fl.from.xr : x.xh, asc = x.asc + (fl.rest.asc - fl.from.asc) * x.cap;
  const desc = x.desc * descK(fl.rest.desc / fl.from.desc);
  const lines = x.lower ? { tops: [xh, asc], feet: [0, desc] } : { tops: [x.cap], feet: [0, desc] };
  let kept = WEIGHED.get(cs);
  if (!kept) WEIGHED.set(cs, kept = new Map());
  const key = [dx, dy, ...lines.tops, ...lines.feet].map(v => v.toFixed(3)).join();
  let out = kept.get(key);
  if (!out) {
    out = evenWeight(cs, dx, dy, lines, x.cap);
    if (kept.size >= 40) kept.delete(kept.keys().next().value!);
    kept.set(key, out);
  }
  return out;
}
const WEIGHED = new WeakMap<Node[][], Map<string, Node[][]>>();

/** How thick a font's thinnest strokes are: twice the radius its letters' skeletons (scan.ts) read at a tenth of their
    points, the thinnest of THIN_LETTERS' (a Didone's hairlines, a serif's brackets and feet), once a font. */
function thinnest(font: FreeFont): number {
  let v = THINNEST.get(font);
  if (v === undefined) {
    const rs = [...THIN_LETTERS].flatMap(ch => { const rig = skinRig(font, ch); return rig ? skeleton(rig.contours, 2).edges.flatMap(e => e.pts.map(q => q.r)) : []; }).sort((a, b) => a - b);
    v = rs.length ? 2 * rs[Math.floor(rs.length / 10)] : 0;
    THINNEST.set(font, v);
  }
  return v;
}
const THINNEST = new WeakMap<FreeFont, number>(), THIN_LETTERS = 'nohaegsyHOAR';

/** A free font's letter at the design's size, moved by the settings and placed like any glyph. Its
    outline as placed is kept as its drawing, for Points to start from. */
export function freeGlyph(ch: string, src: Drawn, fl: FreeLetters): Glyph {
  // the letter moved on its skeleton in the font's own units, then brought to the design's size; its side
  // bearings as the font has them, wider or narrower with the letters and by Side margins
  // (the letter keeps the room it took before its ends, serifs and corners were drawn again, as an engine's letter's
  // serifs reach out into its side bearings, which grow by a little of their length)
  // (every setting on the letter's skeleton but Weight, Verticals, Horizontals and Contrast, as the font stands at
  // them; then those)
  const rest = { ...fl, to: fl.rest }, rig = fl.skin && fl.font && skinRig(fl.font, ch), skinned = rig ? skinMove(rig, fl.from, fl.rest) : null;
  const styled = rig ? restyled(rig, skinned!, rest) : null, weighed = rig ? weighedOut(rig, styled!, fl) : null, pushed = weighed !== styled;
  const moved: Drawn = rig ? { adv: src.adv, contours: weighed! } : mapDrawn(src, src.adv * fl.sx, (x, y) => [x * fl.sx, y]);
  const sized = mapDrawn(moved, moved.adv * fl.k, (x, y) => [x * fl.k, y * fl.k]);
  // (unmoved, by the font's own outline: the rig's has its pieces united, and a speck a corner's curl leaves outside it
  // dropped, which would move the letter's room a little as it is picked; pushed out by Weight, by its outline so)
  const own = pushed ? weighed : rig && skinned === rig.contours ? src.contours : skinned;
  const [i0, i1] = inkSpan(sized);
  let [x0, x1] = own ? inkSpan({ adv: 0, contours: own }).map(v => v * fl.k) : [i0, i1];
  // (a lighter weight's letter keeps the room its outline took as moved, where tidying it cut off a tip whose sides crossed
  // as they thinned, more than SPAN_TOL of it: cut all at once, a blackletter b's foot's spur took 46 units of room with
  // it in a step of Weight)
  const sp = rig && skinned !== rig.contours && !pushed ? skinSpan(skinned!) : undefined;
  if (sp) { x0 = Math.min(x0, (sp[0] + SPAN_TOL) * fl.k); x1 = Math.max(x1, (sp[1] - SPAN_TOL) * fl.k); }
  // (a bowl parted from its stem takes its room with it)
  if (rig && fl.now.overlap < fl.pick.overlap && OVERLAP_LETTERS.includes(ch)) { x0 = Math.min(x0, i0); x1 = Math.max(x1, i1); }
  // (and as far again as a serif reaches out past it, less a little, so two side by side don't run into one another: a
  // font's own side bearings are drawn for letters with no serifs)
  const sl = fl.serifs && fl.serif && withSerifs.has(moved.contours) ? fl.serif.len : 0, room = (v: number, over: number) => (sl ? Math.max(v + sl * SERIF_SB, over + sl * 0.15) : v);
  const [a0, a1] = inkSpan(src);
  let lsb = room(a0 * fl.k * fl.sx * fl.sb, x0 - i0), rsb = room((src.adv - a1) * fl.k * fl.sx * fl.sb, i1 - x1);
  // (a heavier letter's strokes keep the room the design gives them beside the letters either side, where they grow out
  // under a serif's tip or a bar's end its room is read off: skinRoom)
  if (rig && skinned !== rig.contours) {
    const [l, r] = skinRoom(rig, fl.from, fl.rest, skinned!, [a0 * fl.sx * fl.sb, (src.adv - a1) * fl.sx * fl.sb]);
    lsb += l * fl.k; rsb += r * fl.k;
  }
  // (Cursive's flicks get most of the room they reach out into, so they touch the letter beside instead of running
  // through it, as the engine's do: see padL and padR in buildGlyph, glyph.ts)
  if (rig && fl.now.cursive > fl.pick.cursive && (EXIT_LETTERS.includes(ch) || ENTRY_LETTERS.includes(ch))) {
    const give = fl.m.sb * 1.3;
    lsb += Math.max(0, x0 - i0 - give); rsb += Math.max(0, i1 - x1 - give);
  }
  // a monospaced font made proportional: the room a narrow letter is padded out with in its cell goes, its side bearings
  // drawn in toward the engine's for the letter (a stem's whole, a round side's about half, a diagonal's a quarter: the
  // glyph table's factors), so an i no longer stands in an m's width; a letter that fills its cell (a typewriter's i on
  // its long foot) keeps its own
  if (fl.unmono > 0) {
    const f = glyphDefOf(ch)?.sb ?? [0.6, 0.6], l1 = Math.min(lsb, room(fl.m.sb * f[0], x0 - i0)), r1 = Math.min(rsb, room(fl.m.sb * f[1], i1 - x1));
    lsb += (l1 - lsb) * fl.unmono; rsb += (r1 - rsb) * fl.unmono;
  }
  // (Hand-drawn moves the letter through the engine's field, as its strokes drift in the engine's letters)
  const flat = mapDrawn(sized, x1 - x0, (x, y) => [x - x0, y]), wb = fl.m.wob > 0 ? wobbler(ch.codePointAt(0)!, fl.m) : null;
  // (a long straight side split first, so it bends along its length as the engine's strokes do, not only at its ends)
  const step = fl.m.xh / 8, split = (c: Node[]) => c.flatMap((n, i) => {
    const b = c[(i + 1) % c.length], parts = n.ox === undefined && b.ix === undefined ? Math.floor(Math.hypot(b.x - n.x, b.y - n.y) / step) : 0;
    return [n, ...Array.from({ length: parts }, (_, k): Node => ({ x: n.x + (b.x - n.x) * (k + 1) / (parts + 1), y: n.y + (b.y - n.y) * (k + 1) / (parts + 1) }))];
  });
  // (each point goes as the middle of its stroke goes, the nearest point of the letter's skeleton, so a stroke drifts whole
  // and keeps its thickness, as the engine's do, the field moving their skeletons; a handle with its point)
  const sk = wb ? skeleton(flat.contours) : null;
  const body: Drawn = wb && sk ? { adv: flat.adv, contours: flat.contours.map(c => split(c).map(n => {
    const q = nearestOn(sk, n.x, n.y), m = q ? sk.edges[q.e].pts[q.i] : n, [mx, my] = wb.pt(m.x, m.y), dx = mx - m.x, dy = my - m.y;
    const out: Node = { ...n, x: n.x + dx, y: n.y + dy };
    if (n.ix !== undefined) { out.ix = n.ix + dx; out.iy = n.iy! + dy; }
    if (n.ox !== undefined) { out.ox = n.ox + dx; out.oy = n.oy! + dy; }
    return out;
  })) } : flat;
  const cmds = drawnCmds(body.contours);
  // (the inline runs down the middle of the strokes)
  const skel = fl.m.p.fill === 'inline' ? inlineSkeleton(body.contours) : [];
  const out: Unplaced = {
    ch, strokes: [{ part: 'drawn', cmds, curved: false }], ...blankParts(), skeleton: skel, bodyW: x1 - x0
  };
  const g = placeGlyph(out, x1 - x0, lsb, rsb, ch.codePointAt(0)!, fl.m);
  return { ...g, drawn: mapDrawn(body, g.adv, (x, y) => applyM(g.M, x, y) as [number, number]) };
}
