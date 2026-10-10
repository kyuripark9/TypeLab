/* A free font's letters in a design (see free-fonts.ts and free.ts): the family's nearest weight or
   italic, moved on their skeletons by the settings (skin.ts) and restyled where the settings ask for the
   engine's shapes (restyle.ts); letters in a form the font hasn't got come from its twin, the font read
   as the engine's own settings. Called by buildFont (font.ts) for a design with a freeFont. */
import type { Params } from '../params';
import { applyM, clamp } from './geom';
import { freeFont, type FreeFont } from './free';
import { FREE_FAMILIES, nearestFont, parseFontId, type FreeFontRef } from '../free-fonts';
import { drawnCmds, type Drawn, type Node } from './outline';
import { rigSkeleton, skinMeasures, skinMove, skinRig, type SkinMeasures, type SkinRig } from './skin';
import { bowlLook, cornerLooks, dotLook, restyleBowls, restyleDots, restylePeaks, restyleCorners, restyleEnds, restyleSerifs, restyleStencil, serifLook, stencilLook, type RestyleCtx } from './restyle';
import { skeleton, type Skeleton } from './scan';
import type { Pt, SerifSpec } from './types';
import { buildFont, type Effective, type Font, type Glyph, hasGlyph, type Metrics, metrics, resolve, scriptForms, termSpec } from './font';
import { placeGlyph, type Unplaced } from './glyph';

/* ---- free fonts' letters (see free-fonts.ts), moved by the settings as far as they're moved from the
   ones the font was picked at (Params.freeAt): heavier is a heavier font of the family where it has one;
   the rest of the way, and Contrast, Width, the heights, Inner space, the dots, Pinch, Joints and the serifs'
   size, move its letters on their skeletons as the engine's own letters move (skin.ts); then the shapes the
   engine draws are set on them where the settings ask for others than the font's (restyle.ts): its stroke
   ends (their kind, length, curl, openness, tails), serifs, stencil and crossbar gaps, and corners; slanted
   past half an italic's lean, its italic; and the font's own lean, rotation, spacing and fill are kept until
   the settings move. */

/** How far an italic leans, taken as a typical one's. */
const ITALIC_DEG = 12;

interface FreeLetters {
  /** the font drawn from, and the one the settings ask for, which may not have arrived */ font?: FreeFont; want: string;
  /** design units to the font's, and how much wider (the side bearings) */ k: number; sx: number;
  /** the engine's measures of the settings the font's letters stand for, and of those asked for */ from: SkinMeasures; to: SkinMeasures;
  /** whether its letters move on their skeletons (not a pixel font's, which are only stretched) */ skin: boolean;
  /** the side bearings' scale */ sb: number;
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
  const lean = (r.italic ? ITALIC_DEG : 0) + (e.slant - b.slant) * 20, weight = r.weight + (e.weight - b.weight) * 1000;
  const want = nearestFont(r.family, weight, lean >= ITALIC_DEG / 2) ?? e.freeFont;
  const font = freeFont(want) ?? freeFont(e.freeFont), ref: FreeFontRef = font && font.id === want ? parseFontId(want)! : r;
  // Weight 0.4 is a 400: the font drawn from stands for the weight it is, and what it falls short of its
  // letters make up on their skeletons
  const from = skinMeasures(metrics({ ...b, weight: Math.max(0, b.weight + (ref.weight - r.weight) / 1000) }));
  const p: Effective = {
    ...e, fill: e.fill === b.fill ? 'solid' : e.fill, mirror: e.mirror === b.mirror ? 'normal' : 'mirrored',
    mono: Math.max(0, e.mono - b.mono), bounce: Math.max(0, e.bounce - b.bounce)
  };
  // serifs of another shape than the font's, or none, take its own off (to length 0 on their skeletons); the engine's
  // are set on where any are asked for that the font's aren't
  const to = skinMeasures(m), had = mb.ctx.serif, asked = m.ctx.serif, other = !!had && (!asked || serifLook(had) !== serifLook(asked));
  if (other) to.serif = 0;
  return {
    font, want, k: font ? m.cap / font.cap : 1, sx: m.ws / mb.ws, from, to, skin: !FREE_FAMILIES[r.family]?.grid, pick: b, now: e,
    serif: asked ?? null, serifs: !!asked && (!had || other), raw: params, rawPick: { ...params, ...params.freeAt },
    sb: Math.pow(2, (e.sideBearing - b.sideBearing) * 3),
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
const mapDrawn = (d: Drawn, adv: number, f: (x: number, y: number) => [number, number]): Drawn => ({
  adv,
  contours: d.contours.map(c => c.map(n => {
    const [x, y] = f(n.x, n.y), out: Node = { ...n, x, y };
    if (n.ix !== undefined) [out.ix, out.iy] = f(n.ix, n.iy!);
    if (n.ox !== undefined) [out.ox, out.oy] = f(n.ox, n.oy!);
    return out;
  }))
});

/** The ink's left and right edges, by its points and handles. */
function inkX(d: Drawn): [number, number] {
  let x0 = Infinity, x1 = -Infinity;
  for (const c of d.contours) for (const n of c) {
    x0 = Math.min(x0, n.x, n.ix ?? n.x, n.ox ?? n.x); x1 = Math.max(x1, n.x, n.ix ?? n.x, n.ox ?? n.x);
  }
  return x0 > x1 ? [0, 0] : [x0, x1];
}

/* ---- a free font's twin: the font read as the engine's own settings, for the letters asked for in a form the font
   hasn't got (a single-storey a, a mirrored g, a k on a bar, Arches, a script's letters), which the engine draws */

/** Whether letter `ch` is asked for in another form than the one the font's own stands for (its settings as picked). */
export function formChanged(ch: string, a: Effective, b: Effective): boolean {
  const is = (set: string) => set.includes(ch);
  if (a.build !== b.build) return true;
  if (scriptForms(a) !== scriptForms(b) || (scriptForms(b) && a.flourish !== b.flourish)) return hasGlyph(ch + '.scr');
  if ((a.cursive >= 0.35) !== (b.cursive >= 0.35) && hasGlyph(ch + '.cur')) return true;
  if ((a.swash > 0) !== (b.swash > 0) && /^[A-Z]$/.test(ch)) return true;
  return (ch === 'a' && (a.singleStory !== b.singleStory || a.aForm !== b.aForm)) || (ch === 'g' && a.gForm !== b.gForm)
    || (is('kK') && a.kForm !== b.kForm) || (is('IiJl') && a.iForm !== b.iForm) || (is('sS$') && a.sForm !== b.sForm)
    || (is('AVWvw') && a.diagonals !== b.diagonals) || (is('Yy') && a.yForm !== b.yForm) || (ch === 'Q' && a.qForm !== b.qForm)
    || (ch === 'R' && a.rForm !== b.rForm) || (is('abdgpqhmnru') && a.bowlJoin !== b.bowlJoin) || (is('AMNVWYZvwyz') && a.bends !== b.bends)
    || (is('acefjrstyCGJS235690?') && a.terminalRun !== b.terminalRun);
}

/** The engine's settings a free font's letters read as (once a font): its stems' weight, its bars' contrast against
    them, its x-height, its width (its n against the engine's) and whether it has serifs. */
const twinFits = new WeakMap<FreeFont, Partial<Params>>();
function twinFit(font: FreeFont, pick: Params): Partial<Params> {
  let fit = twinFits.get(font);
  if (fit) return fit;
  const n = skinRig(font, 'n') ?? skinRig(font, 'H'), H = skinRig(font, 'H') ?? n;
  const m = metrics(resolve(pick)), s = (n?.stem ?? 0.12) * m.cap, thin = (H?.bar ?? n?.bar ?? 0.1) * m.cap;
  const weight = clamp(Math.pow(Math.max(0, s - 18) / 200, 0.8));
  const amount = clamp((0.92 - thin / Math.max(1, s)) / 0.84), contrast = 0.5 + Math.max(0, amount - 0.05) / 0.95 * 0.5;
  const xHeight = clamp((font.xh / font.cap - 0.3) / 0.56);
  // (as wide as the font's n, against the engine's at the middle of Width)
  const g = font.glyphs.n, eng = buildFont({ ...pick, freeFont: '', freeAt: {}, glyphs: {}, outlines: {}, weight, contrast, xHeight, width: 0.5 }).glyph('n');
  let width = 0.5;
  if (g && eng) {
    const [x0, x1] = inkX(g), ws = ((x1 - x0) * m.cap / font.cap) / Math.max(1, eng.bodyW);
    width = clamp(ws < 1 ? (ws - 0.6) / 0.8 : 0.5 + (ws - 1));
  }
  fit = { weight, contrast, xHeight, width, serif: !!(n?.serifs || H?.serifs) };
  twinFits.set(font, fit);
  return fit;
}

/** Letter `ch` as the free font's twin draws it: the engine's, at the settings the font reads as (twinFit) moved as far
    as the design moves them from those it was picked at. */
const twinFonts = new Map<string, Font>();
export function twinGlyph(ch: string, fl: FreeLetters): Glyph | null {
  if (!fl.font) return null;
  const fit = twinFit(fl.font, fl.rawPick), now = fl.raw, pick = fl.rawPick;
  const moved = (k: 'weight' | 'contrast' | 'xHeight' | 'width') => clamp((fit[k] as number) + (now[k] as number) - (pick[k] as number));
  const p: Params = { ...now, freeFont: '', freeAt: {}, glyphs: {}, outlines: {}, weight: moved('weight'), contrast: moved('contrast'), xHeight: moved('xHeight'),
    width: moved('width'), serif: now.serif !== pick.serif ? now.serif : !!fit.serif };
  const key = JSON.stringify(p);
  let f = twinFonts.get(key);
  if (!f) { f = buildFont(p); if (twinFonts.size > 8) twinFonts.delete(twinFonts.keys().next().value!); twinFonts.set(key, f); }
  return f.glyph(ch);
}

/** A rigged free font's letter, moved on its skeleton, given the shapes the settings ask for past the ones
    it stands for (restyle.ts); kept with the moved outline, by the settings, as dragging a slider asks again. */
const restyles = new WeakMap<Node[][], Map<string, Node[][]>>();
function restyled(rig: SkinRig, cs: Node[][], fl: FreeLetters): Node[][] {
  const k = fl.to.s / fl.from.s, x = rig.ctx, c: RestyleCtx = { ch: x.ch, cap: x.cap, xh: x.xh, stem: rig.stem * x.cap * k, bar: rig.bar * x.cap * k };
  const a = cornerLooks(fl.pick, c), b = cornerLooks(fl.now, c);
  // the engine's serifs, set on the stems the letter's own were taken off (or on a sans's), in the font's units; the
  // lines they stand on, where the settings moved them
  const sf = fl.serifs && fl.serif ? { ...fl.serif, len: fl.serif.len / fl.k, th: fl.serif.th / fl.k, inner: fl.serif.inner && { ...fl.serif.inner, th: fl.serif.inner.th / fl.k } } : null;
  const kd = fl.to.desc / fl.from.desc, xh1 = x.lower ? x.xh * fl.to.xr / fl.from.xr : x.xh;
  const lines = [0, x.cap, xh1, x.asc + (fl.to.asc - fl.from.asc) * x.cap, x.desc * (kd < 1 ? Math.sqrt(kd) : kd)];
  const sa = stencilLook(fl.pick), sb = stencilLook(fl.now), ba = bowlLook(fl.pick), bb = bowlLook(fl.now);
  const ends = (e: Effective) => [termSpec(e), e.terminal, e.terminalLength, e.terminalCurl, e.tail, e.aperture];
  const da = [fl.pick.dots, dotLook(fl.pick)], db = [fl.now.dots, dotLook(fl.now)];
  const key = JSON.stringify([a, b, ends(fl.pick), ends(fl.now), sf, sf && lines, sa, sb, ba, bb, da, db, fl.pick.apex, fl.now.apex, fl.now.apex !== fl.pick.apex && lines]);
  let kept = restyles.get(cs);
  if (!kept) { kept = new Map(); restyles.set(cs, kept); }
  let out = kept.get(key);
  if (!out) {
    // (each step's skeleton scanned off the outline as it stands then, and only when a step needs it)
    // (the letter as the font draws it has its skeleton scanned already, with its rig)
    const scan = (o: Node[][]) => { let sk: Skeleton | undefined; return () => (sk ??= o === rig.contours ? rigSkeleton(rig) : skeleton(o)); };
    out = restyleDots(cs, c, fl.pick, fl.now);
    out = restyleBowls(out, ba, bb, scan(out));
    out = restyleEnds(out, c, fl.pick, fl.now, scan(out));
    if (sf) out = restyleSerifs(out, { ...c, lower: x.lower, lines }, sf, scan(out));
    out = restyleStencil(out, c, sa, sb, scan(out));
    out = restylePeaks(out, { ...c, lines }, fl.pick.apex, fl.now.apex);
    out = restyleCorners(out, c, a, b, scan(out));
    if (kept.size >= 6) kept.delete(kept.keys().next().value!);
    kept.set(key, out);
  }
  return out;
}

/** A free font's letter at the design's size, moved by the settings and placed like any glyph. Its
    outline as placed is kept as its drawing, for Points to start from. */
export function freeGlyph(ch: string, src: Drawn, fl: FreeLetters): Glyph {
  // the letter moved on its skeleton in the font's own units, then brought to the design's size; its side
  // bearings as the font has them, wider or narrower with the letters and by Side bearings
  // (the letter keeps the room it took before its ends, serifs and corners were drawn again, as an engine's letter's
  // serifs reach out into its side bearings, which grow by a little of their length)
  const rig = fl.skin && fl.font && skinRig(fl.font, ch), skinned = rig ? skinMove(rig, fl.from, fl.to) : null;
  const moved: Drawn = rig ? { adv: src.adv, contours: restyled(rig, skinned!, fl) } : mapDrawn(src, src.adv * fl.sx, (x, y) => [x * fl.sx, y]);
  const sized = mapDrawn(moved, moved.adv * fl.k, (x, y) => [x * fl.k, y * fl.k]);
  const [x0, x1] = skinned ? inkX({ adv: 0, contours: skinned }).map(v => v * fl.k) : inkX(sized), [i0, i1] = inkX(sized);
  // (and as far again as a serif reaches out past it, less a little, so two side by side don't run into one another: a
  // font's own side bearings are drawn for letters with no serifs)
  const sl = fl.serifs && fl.serif ? fl.serif.len : 0, room = (v: number, over: number) => (sl ? Math.max(v + sl * 0.3, over + sl * 0.15) : v);
  const [a0, a1] = inkX(src), lsb = room(a0 * fl.k * fl.sx * fl.sb, x0 - i0), rsb = room((src.adv - a1) * fl.k * fl.sx * fl.sb, i1 - x1);
  const body = mapDrawn(sized, x1 - x0, (x, y) => [x - x0, y]), cmds = drawnCmds(body.contours);
  // (the inline runs down the middle of the strokes: their skeleton, scanned off the letter as drawn)
  // (eased along, as a cell-by-cell skeleton steps)
  const ease = (l: Pt[]) => { let c = l; for (let k = 0; k < 6; k++) c = c.map((q, i) => (i === 0 || i === c.length - 1 ? q : { x: (c[i - 1].x + 2 * q.x + c[i + 1].x) / 4, y: (c[i - 1].y + 2 * q.y + c[i + 1].y) / 4 })); return c; };
  const skel = fl.m.p.fill === 'inline' ? skeleton(body.contours).edges.map(e => ease(e.pts.map(q => ({ x: q.x, y: q.y })))) : [];
  const out: Unplaced = {
    ch, strokes: [{ part: 'drawn', cmds, curved: false }], serifs: [], serifAt: [], counters: [], marks: [], corners: [], skeleton: skel, meta: {}, bodyW: x1 - x0
  };
  const g = placeGlyph(out, x1 - x0, lsb, rsb, ch.codePointAt(0)!, fl.m);
  return { ...g, drawn: mapDrawn(body, g.adv, (x, y) => applyM(g.M, x, y) as [number, number]) };
}
