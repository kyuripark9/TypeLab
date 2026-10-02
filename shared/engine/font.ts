/* Font engine.
   params (what the user edits, all 0..1) -> resolve() -> metrics -> glyph skeletons
   -> expanded outlines. Pure math with no DOM, so the browser (live preview) and the
   server (font export) run exactly the same code. A full rebuild of every glyph takes a
   few milliseconds, so sliders can drive it directly. */
import { DEFAULTS, barCut, contrastOf, endCurl, endLength, endReach, formOf, joinGap, rotationDeg, weighed, weightScale, type Params } from '../params';
import { applyM, clamp, clipPoly, cmdsToD, cubicAt, lerp, lerpP, mulM, quarter, ringsD, roundContour, roundCuts, signedArea, splitPoly, subCubic, transformCmds } from './geom';
import { blockDims, blockRings } from './blocks';
import { fillOutline, slice } from './effects';
import { drawnCmds, type Drawn } from './outline';
import { autoThickness, buildSerif, expandStroke, innerFloor, organicK, serifCup, serifPlace, serifSides, type Expanded, type SerifPlace } from './stroke';
import type { ClipBox, Cmd, HalfPlane, Mark, Mat, PenCtx, Pt, SerifSides, StrokeOpts, Tangent, TermSpec, TurnR } from './types';

export const CHARSET = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789', punct: '.,!?;:\'"()-/&@#$%+'
} as const;
export const ALL_CHARS = CHARSET.upper + CHARSET.lower + CHARSET.digits + CHARSET.punct;

/** Parameters after the personality macros have been applied, plus derived switches. */
export interface Effective extends Params {
  /** from here on contrast is the pen's amount of thick against thin (see contrastOf), and reverse how
      far it is turned round */ reverse: number;
  square: number; classic: number; bounce: number; singleStory: boolean; stressDeg: number;
}

export interface Metrics {
  p: Effective;
  /** stem thickness */ s: number;
  cap: number; xh: number; asc: number; desc: number;
  /** overshoot of round letters */ os: number;
  /** width scale */ ws: number;
  thin: number; stress: number; k: number; org: number; sq: number;
  /** cursive amount and hand-drawn irregularity */ cur: number; wob: number;
  /** the shared advance width that monospacing pulls every glyph toward */ monoAdv: number;
  /** grid size of the pixel, dot and line fills (0 = none); advances snap to it for pixels and dots */ cell: number;
  /** stencil gap, and the band the slice removes (both 0 when off) */ gap: number; sliceY: number; sliceH: number;
  /** how far out from a join its stencil gap opens, and how far the stencil and slice round the corners they cut, 1 a half round across the stroke cut */ gapOff: number; gapRound: number; sliceRound: number;
  /** the radius Inside corners rounds the counters' corners by, whatever the weight (0 when off) */ innerR: number;
  bar: number; apex: number; ap: number; cnt: number;
  serif: boolean;
  ctx: PenCtx;
  /** thickness of a stroke running in direction (dx, dy) */ tDir: (dx: number, dy: number) => number;
  /** thickness of a horizontal stroke */ hT: number;
  /** body width for a base design width. cls: 'r' round, 'c' classically narrow */ W: (base: number, cls?: 'r' | 'c') => number;
  sb: number; track: number; space: number; slant: number; R: number; dotRound: number;
  /** how far each letter is turned, in radians clockwise */ rot: number;
  qpt: (x0: number, y0: number, x1: number, y1: number, mode: string, u: number) => Tangent;
}

export interface GlyphMeta { parts?: string[]; params?: string[] }
export type GlyphFn = (g: Builder, m: Metrics) => number;
interface GlyphDef { ch: string; sb: [number, number]; fn: GlyphFn; meta: GlyphMeta }

/** `id` is the stroke's own (see isStrokeId), for the strokes a letter can weight one by one. */
export interface GlyphStroke { part: string; cmds: Cmd[]; curved: boolean; horizontal?: boolean; dot?: boolean; id?: string }

export interface Glyph {
  ch: string;
  strokes: GlyphStroke[];
  serifs: Cmd[][];
  /** where each of the serifs sits, in their order */ serifAt: SerifPlace[];
  counters: Cmd[][];
  marks: Mark[];
  corners: Pt[];
  skeleton: Pt[][];
  meta: GlyphMeta;
  bodyW: number;
  lsb: number; rsb: number; adv: number;
  M: Mat;
  cmds: Cmd[];
  /** SVG path data (y flipped) */
  d: string;
}

export interface LineItem { ch: string; x: number; adv: number }
export interface Line { items: LineItem[]; width: number }

export interface Font {
  params: Params;
  eff: Effective;
  m: Metrics;
  glyph(ch: string): Glyph | null;
  /** The font `ch` is drawn from: one built with its own settings when it has any, else this one. */
  letter(ch: string): Font;
  /** SVG path data of the part of `ch` that parameter `key` affects ('' if none). */
  hl(ch: string, key: string): string;
  advance(ch: string): number;
  /** Lay out text into lines. maxWidth in font units (Infinity = no wrap). */
  layout(text: string, maxWidth: number): Line[];
}

const GLYPHS: Record<string, GlyphDef> = {};
/* sb: [left, right] side-bearing factors (1 = straight stem, ~.55 round, ~.25 diagonal) */
export const defGlyph = (ch: string, sb: [number, number], fn: GlyphFn, meta?: GlyphMeta) => {
  GLYPHS[ch] = { ch, sb, fn, meta: meta || {} };
};
export const hasGlyph = (ch: string) => ch in GLYPHS;

/* Personality sliders are macros: they push several low-level parameters at once. */
export function resolve(p: Partial<Params>): Effective {
  const e = { ...DEFAULTS, ...p } as Effective;
  const gh = (e.geoHuman - 0.5) * 2, ss = (e.softSharp - 0.5) * 2;
  const cf = (e.classicFuture - 0.5) * 2, pf = (e.playfulFormal - 0.5) * 2;
  const human = Math.max(0, gh), classic = Math.max(0, -cf), future = Math.max(0, cf);
  const playful = Math.max(0, -pf), formal = Math.max(0, pf);
  // each pushes a setting up to `by` (down, below 0) at full turn, but where that would run past 0 or 1,
  // only as far as 0 or 1, so the setting keeps moving all the way along the macro rather than stopping
  const push = (v: number, by: number, amt: number) => (amt ? lerp(v, clamp(v + by * Math.sign(amt)), Math.abs(amt)) : v);
  e.curve = push(e.curve, 0.45, gh);
  e.aperture = push(push(e.aperture, 0.3, gh), -0.3, future);
  const c = contrastOf(e.contrast);
  e.reverse = c.reverse;
  e.contrast = push(push(push(push(c.amount, 0.08, human), 0.25, classic), 0.1, formal), -0.05, future);
  e.roundness = push(push(e.roundness, -0.7, ss), 0.15, playful);
  e.apex = push(e.apex, -0.5, ss);
  e.xHeight = push(push(e.xHeight, 0.18, cf), 0.12, playful);
  e.width = push(push(e.width, 0.1, future), -0.07, formal);
  e.letterSpacing = push(e.letterSpacing, 0.04, formal);
  e.square = clamp(0.85 * future + e.squareness);
  e.classic = classic;
  e.bounce = playful;
  // italic and script hands use the single-storey a (unless one is picked) and hold the pen at a steeper angle
  e.singleStory = e.story === 'auto' ? gh < -0.3 || e.cursive >= 0.35 : e.story === 'single';
  e.stressDeg = e.curve * 10 + human * 9 + classic * 7 + e.cursive * 14;
  return e;
}

/** The finer shape of the picked kind and form of stroke end, for the stroke expander. */
export const termSpec = (e: Params): TermSpec => ({
  form: formOf(e.terminal, e.terminalForm), flare: lerp(1.15, 1.6, e.terminalFlare), depth: lerp(0.08, 0.45, e.terminalDepth),
  size: lerp(0.58, 1.05, e.terminalSize), clip: lerp(0.15, 0.7, e.terminalClip), round: lerp(0.1, 0.5, e.terminalRound),
  point: e.terminalPoint < 0.5 ? lerp(0.35, 0.95, e.terminalPoint * 2) : lerp(0.95, 1.4, e.terminalPoint * 2 - 1), lean: e.terminalLean - 0.5,
  slope: 0.6 * 2 ** ((e.terminalSlope - 0.5) * 2), tilt: (e.terminalTilt - 0.5) * 2 * 35 * Math.PI / 180,
  tip: Math.max(0.03, 0.84 * (1 - e.terminalTip)), taper: e.terminalTaper < 0.5 ? lerp(2.2, 3, e.terminalTaper * 2) : lerp(3, 6, e.terminalTaper * 2 - 1)
});

/** The height of the pinch's line at `pos` on its scale: the baseline, half the x-height at the middle, the cap height. */
const pinchY = (pos: number, xh: number, cap: number) => (pos < 0.5 ? lerp(0, xh / 2, pos * 2) : lerp(xh / 2, cap, pos * 2 - 1));

/** A serif measure at `v` on a scale centred on 0.5, where it is as drawn: `lo` times that at 0, `hi` times at 1. */
const serifScale = (v: number, lo: number, hi: number) => (v < 0.5 ? lerp(lo, 1, v * 2) : lerp(1, hi, v * 2 - 1));
/** How thick a serif of each shape is at `v` on the Thickness scale. */
const serifTh = (v: number, shape: string) => lerp(8, 95, v) * ({ unbracketed: 0.6, slab: 1.5 }[shape] ?? 1);
/** How far the serifs on arms lean from upright at either end of the Lean scale, in radians (35°). */
const ARM_LEAN = 0.61;

function metrics(e: Effective): Metrics {
  // Verticals weigh the stems on their own, and Horizontals the bars: each scales its side of the
  // pen, so a heavier stem leaves the bars as they were
  const s0 = 18 + 200 * Math.pow(e.weight, 1.25), s = weighed(s0, e.vWeight, 0, Math.max(s0, 300));
  const cap = lerp(560, 840, e.height);
  const xh = cap * lerp(0.5, 0.86, e.xHeight);
  const ws = e.width < 0.5 ? lerp(0.6, 1, e.width * 2) : lerp(1, 1.5, (e.width - 0.5) * 2);
  // the bars thin with contrast, from no heavier than a fifth of the x-height to no lighter than 8; past
  // its gentle start, contrast runs the whole way between the two, so neither limit stops it part way
  const thinAt = (c: number) => Math.max(8, Math.min(s0 * (1 - 0.08 - 0.84 * c), xh * 0.2));
  const thin = weighed(e.contrast <= 0.05 ? thinAt(e.contrast) : lerp(thinAt(0.05), thinAt(1), (e.contrast - 0.05) / 0.95), e.hWeight, 4, xh * 0.32);

  const stress = e.stressDeg * Math.PI / 180;
  const k = 0.5523 + 0.05 * e.curve + 0.36 * e.square;
  const org = e.curve;
  const ctx: PenCtx = {
    thick: s, thin, stress, k, org, terminal: e.terminal, chamfer: e.chamfer, joints: e.joints, reverse: e.reverse,
    term: termSpec(e),
    pinch: e.pinch > 0 ? { y: pinchY(e.pinchPos, xh, cap), amount: e.pinch, reach: xh / 2 } : undefined,
    serif: e.serif ? {
      len: lerp(28, 175, e.serifSize) * (0.75 + 0.25 * ws),
      th: serifTh(e.serifThickness, e.serifShape),
      shape: e.serifShape, angle: e.serifAngle,
      bracket: 0.85 * serifScale(e.serifBracket, 0.25, 1.8), tip: e.serifTip, tipRound: lerp(0.1, 0.5, e.serifTipRound), tipSlant: (e.serifTipSlant - 0.5) * 2,
      cup: e.serifBase === 'cupped' ? lerp(0.15, 1, e.serifCup) : 0,
      balance: (e.serifBalance - 0.5) * 2, tops: serifScale(e.serifTops, 0.4, 1.8), arms: serifScale(e.serifArms, 0.4, 1.8),
      armTh: serifScale(e.serifArmThickness, 0.3, 2.2), armLean: (e.serifArmLean - 0.5) * 2 * ARM_LEAN,
      sides: e.serifSides,
      inner: e.serifInner !== 'same' || e.serifInnerSize !== 0.5 || e.serifInnerThickness !== 0.5 ? {
        shape: e.serifInner === 'same' ? e.serifShape : e.serifInner, len: serifScale(e.serifInnerSize, 0.3, 1.8),
        th: serifTh(e.serifThickness, e.serifInner === 'same' ? e.serifShape : e.serifInner) * serifScale(e.serifInnerThickness, 0.3, 2.2)
      } : null
    } : null
  };
  const tDir = (dx: number, dy: number) => { const l = Math.hypot(dx, dy) || 1; return autoThickness(dx / l, dy / l, ctx, s, thin); };
  const cnt = (e.counter - 0.5) * 2;
  const sb = Math.max(14, 64 * (0.65 + 0.35 * ws) - (s - 80) * 0.12 + (e.sideBearing - 0.5) * 130 + (ctx.serif ? ctx.serif.len * 0.3 : 0));
  /* body width: base is drawn for a regular weight at normal width.
     cls: 'r' letters built around a counter, 'c' classically narrow caps, 'n' normal */
  const W = (base: number, cls?: 'r' | 'c') => {
    let w = base * ws;
    w *= 1 + (cls === 'r' ? 0.22 : 0.06) * cnt;
    if (cls === 'c') w *= 1 - 0.13 * e.classic;
    if (cls === 'r') w *= 1 + 0.05 * e.classic;
    return w + (s - 80) * 0.62;
  };
  // pixels and dots sit on one grid across the line, so spacing moves in whole cells
  const cell = e.fill === 'pixels' || e.fill === 'dots' || e.fill === 'lines' ? cap / lerp(30, 7, e.module) : 0;
  const snap = (v: number) => (cell && e.fill !== 'lines' ? Math.round(v / cell) * cell : v);
  // at 100 the slice takes the middle half of the x-height, short of a thin stroke's width at the top and bottom
  const sliceH = e.slice > 0 ? lerp(4, Math.max(xh * 0.14, Math.min(xh * 0.5, xh - 2 * thin)), e.slice) : 0;
  return {
    p: e, s, cap, xh,
    asc: Math.max(xh * 1.12, Math.max(cap * 1.05, xh * 1.18) + (e.extenders - 0.5) * cap * 0.5),
    desc: -cap * 0.3 * lerp(0.55, 1.45, e.extenders) * (e.descender < 0.5 ? lerp(0.45, 1, e.descender * 2) : lerp(1, 1.6, e.descender * 2 - 1)),
    os: cap * 0.014,
    ws, thin, stress, k, org, sq: e.square, cur: e.cursive, wob: e.wobble, monoAdv: W(500) + sb * 1.5,
    // a gap moved out starts a stub's width out, so it never leaves a hairline on the stroke it joins
    cell, gap: e.stencil > 0 ? joinGap(e.stencil, s) : 0, gapOff: e.stencilPos > 0 ? lerp(s * 0.55, xh * 0.4, e.stencilPos) : 0, gapRound: e.stencilRound,
    // the slice keeps a stroke's width of ink below it and above it, so at either end it still cuts through the letters
    sliceY: e.slicePos < 0.5 ? lerp(Math.min(xh * 0.5, s + sliceH / 2), xh * 0.5, e.slicePos * 2) : lerp(xh * 0.5, Math.max(xh * 0.5, cap - s - sliceH / 2), e.slicePos * 2 - 1),
    sliceH, sliceRound: e.sliceRound, innerR: e.innerRound * cap * 0.4,
    bar: e.crossbar, apex: e.apex, ap: e.aperture, cnt,
    serif: !!e.serif,
    ctx, tDir, hT: tDir(1, 0), W,
    sb,
    track: snap((e.letterSpacing - 0.2) * 260),
    // joined-up letters leave no gap of their own, and their entry and exit strokes swing out into
    // the space, so a cursive design gets a wider one (about its hooks' size) to keep words apart
    space: Math.max(snap(lerp(W(210) + (e.wordSpacing - 0.35) * 520 + (e.cursive < 0.04 ? 0 : lerp(s * 0.55, xh * 0.26 + s * 0.35, e.cursive) * 0.8),
      W(500) + sb * 1.5, e.mono)), cell),
    slant: Math.tan(e.slant * 20 * Math.PI / 180),
    rot: rotationDeg(e.rotation) * Math.PI / 180,
    R: e.roundness * s * 0.5,
    dotRound: e.dots === 'round' ? 1 : e.dots === 'square' ? 0 : Math.max(e.roundness, e.terminal === 'round' ? e.terminalRound : 0),
    qpt: (x0, y0, x1, y1, mode, u) => {
      return cubicAt(quarter(x0, y0, x1, y1, mode, organicK(k, org, x1 - x0, y1 - y0)), u);
    }
  };
}

/** A fillet's inside corner at (x, y), filling toward (sx, sy) up to a quarter circle r across. */
interface Fillet { x: number; y: number; sx: number; sy: number; r: number }
interface RawStroke { cmds?: Cmd[]; poly?: Pt[]; o: StrokeOpts; fillet?: Fillet }

function filletPts({ x, y, sx, sy, r }: Fillet): Pt[] {
  // it reaches a little into both strokes, so no hairline shows between them
  const e = 2, cx = x + sx * r, cy = y + sy * r, pts: Pt[] = [{ x: x - sx * e, y: y - sy * e, sharp: true }, { x: cx, y: y - sy * e, sharp: true }];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI / 2;
    pts.push({ x: cx - sx * r * Math.sin(a), y: cy - sy * r * Math.cos(a), smooth: i > 0 && i < 12 });
  }
  pts.push({ x: x - sx * e, y: cy, sharp: true });
  return pts;
}

/** Fillets moved onto the edges of the strokes they round into, where those are drawn lighter or
    heavier than the stem weight the letters reckon with (weighted one by one, or thinned by a
    contrast turned round): a lighter stem pulls its edge in, and the fillet with it, so no gap
    opens between them; a heavier one pushes it out, and it rounds no further than the stroke it
    runs along reaches. */
function weighFillets(b: Builder, m: Metrics) {
  if (Math.abs(m.tDir(0, 1) - m.s) < 0.5 && !b.strokes.some((st, si) => st.cmds && strokeWt(m, si) !== 1)) return;
  const edges: { ax: 'x' | 'y'; at: number; from: number; to: number; half: number; drawn: number; f: number }[] = [];
  b.strokes.forEach((st, si) => {
    if (!st.cmds) return;
    const f = strokeWt(m, si), sc = st.o.scale || 1;
    let cur: Pt | null = null;
    for (const c of st.cmds) {
      if (c[0] === 'Z') { cur = null; continue; }
      // every command ends at its last point, which the next one runs on from
      const n = c.length, off = typeof c[n - 1] === 'number' ? 2 : 3, q = { x: c[n - off] as number, y: c[n - off + 1] as number };
      if (c[0] === 'L') {
        const w = (c[3] as { w?: unknown } | undefined)?.w ?? st.o.w;
        if (cur && (Math.abs(q.x - cur.x) < 0.5) !== (Math.abs(q.y - cur.y) < 0.5)) {
          // a plumb or level side of the stroke, how far its edges sit off its centerline as the
          // letters reckon it (a stroke, or a bar), and as the pen draws it
          const plumb = Math.abs(q.x - cur.x) < 0.5, thin = w === 'thin';
          const half = (thin ? m.thin : plumb ? m.s : m.hT) * sc / 2, drawn = (thin ? m.thin : plumb ? m.tDir(0, 1) : m.hT) * sc / 2;
          edges.push(plumb ? { ax: 'x', at: q.x, from: Math.min(cur.y, q.y), to: Math.max(cur.y, q.y), half, drawn, f }
            : { ax: 'y', at: q.y, from: Math.min(cur.x, q.x), to: Math.max(cur.x, q.x), half, drawn, f });
        }
      }
      cur = q;
    }
  });
  for (const st of b.strokes) {
    const fl = st.fillet;
    if (!fl) continue;
    // the fillet sits on the side of each edge it fills away from that stroke's centerline
    const on = edges.filter(e => {
      const [pos, along, s] = e.ax === 'x' ? [fl.x, fl.y, fl.sx] : [fl.y, fl.x, fl.sy];
      return Math.min(Math.abs(pos - (e.at + s * e.half)), Math.abs(pos - (e.at + s * e.drawn))) <= 1.5 && along >= e.from - 1 && along <= e.to + 1;
    });
    const moved = { ...fl };
    for (const e of on) if (e.f !== 1 || Math.abs(e.drawn - e.half) >= 0.5) moved[e.ax] = e.at + (e.ax === 'x' ? fl.sx : fl.sy) * e.drawn * e.f;
    if (moved.x === fl.x && moved.y === fl.y) continue;
    for (const e of on) {
      // along a level edge it reaches across in x, along a plumb one in y
      const k = e.ax === 'x' ? 'y' : 'x', s = k === 'x' ? fl.sx : fl.sy;
      moved.r = Math.min(moved.r, s > 0 ? e.to - moved[k] : moved[k] - e.from);
    }
    st.fillet = moved;
    st.poly = moved.r < 1 ? [] : filletPts(moved);
  }
}

/** Glyph builder handed to each glyph function. */
export class Builder {
  strokes: RawStroke[] = [];
  counters: Pt[][] = [];
  marks: Mark[] = [];
  /** how far cursive strokes reach past the body on the left (as a negative x) and right */
  reachL = 0; reachR = 0;
  /** side-bearing factors for a form of the letter with other sides than its usual one (an arched V's stems) */
  sb?: [number, number];
  constructor(public m: Metrics) {}
  path(cmds: Cmd[], o?: StrokeOpts) { this.strokes.push({ cmds, o: o || {} }); return this; }
  line(x0: number, y0: number, x1: number, y1: number, o?: StrokeOpts) { return this.path([['M', x0, y0], ['L', x1, y1]], o); }
  stem(x: number, y0: number, y1: number, o?: StrokeOpts) { return this.line(x, y0, x, y1, { part: 'stem', ...o }); }
  dot(cx: number, cy: number, size: number, part?: string) {
    const h = size / 2, r = h * this.m.dotRound;
    this.strokes.push({ poly: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]].map(p => ({ x: p[0], y: p[1], r })), o: { part: part || 'dot' } });
    return this;
  }
  /** A round in the inside corner at (x, y) where two strokes meet square, `r` across, filling the
      corner toward (sx, sy) (each ±1) up to a quarter circle. The outside of the join stays square. */
  fillet(x: number, y: number, sx: number, sy: number, r: number) {
    if (r < 1) return this;
    const fillet = { x, y, sx, sy, r };
    this.strokes.push({ poly: filletPts(fillet), o: { part: 'fillet' }, fillet });
    return this;
  }
  /** A filled shape, like a fillet, for a corner no stroke draws. */
  blob(pts: Pt[], part = 'fillet') { if (pts.length > 2) this.strokes.push({ poly: pts, o: { part } }); return this; }
  counter(pts: number[][]) { this.counters.push(pts.map(p => ({ x: p[0], y: p[1] }))); return this; }
  ellipseCounter(cx: number, cy: number, rx: number, ry: number) {
    const pts: number[][] = [];
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return this.counter(pts);
  }
  mark(type: string, x: number, y: number) { this.marks.push({ type, x, y }); return this; }
}

const hash = (n: number, k: number) => { const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

/* Hand-drawn irregularity: a smooth displacement field, different for every glyph. Every
   stroke of a glyph moves through the same field, so strokes that touch keep touching. */
function wobbler(code: number, m: Metrics) {
  const A = m.wob * m.xh * 0.085, f = 2 * Math.PI / (m.xh * 1.1);
  const p = [1, 2, 3, 4, 5, 6].map(k => hash(code, k + 10) * 2 * Math.PI);
  const dx = (x: number, y: number) => A * (0.5 * Math.sin(x * f * 0.7 + y * f * 0.5 + p[0]) + 0.3 * Math.sin(y * f * 1.3 + p[1]) + 0.2 * Math.sin(y * f * 3.1 + x * f * 0.9 + p[4]));
  const dy = (x: number, y: number) => A * 0.75 * (0.5 * Math.sin(x * f * 1.1 - y * f * 0.4 + p[2]) + 0.3 * Math.sin(x * f * 0.5 + p[3]) + 0.2 * Math.sin(x * f * 2.9 - y * f * 1.3 + p[5]));
  const pt = (x: number, y: number): [number, number] => [x + dx(x, y), y + dy(x, y)];
  const cmds = (c: Cmd[]): Cmd[] => c.map(cmd => {
    if (cmd[0] === 'Z') return cmd;
    const o = cmd.slice() as Cmd;
    for (let i = 1; i + 1 < cmd.length && typeof cmd[i] === 'number'; i += 2) [o[i], o[i + 1]] = pt(cmd[i], cmd[i + 1]);
    return o;
  });
  return { pt, cmds };
}

function isHorizontal(cmds: Cmd[]) {
  if (cmds.length !== 2 || cmds[1][0] !== 'L') return false;
  return Math.abs(cmds[1][2] - cmds[0][2]) < Math.abs(cmds[1][1] - cmds[0][1]) * 0.2;
}

/* Stencil: where stroke i joins another stroke (its host), cut it back so a gap opens between
   the two. The cut runs parallel to the host at the point where the join lands. Moved `off` out
   from the host, the gap slides further along the stroke, still parallel to the host so every gap
   keeps the angle it has at its join (upright by a stem, level by a bar), and a stub of the stroke
   stays on the host: the far side kept and the near side too. When two strokes end in each other
   (the waist of a 3), only the later one is cut. */
interface Host { score: number; j: number; px: number; py: number; tx: number; ty: number; half: number; atEnd: boolean }
/** Where stroke i ends in another stroke (its host): the join's id (see isJoinId), the join end
    (x, y), and (nx, ny), the way a gap there opens, away from the host. `lies`: the end isn't drawn
    as a join but lies inside the host (the top arm of an F over its stem), which Stencil leaves whole. */
interface Join { id: string; x: number; y: number; nx: number; ny: number; bj: Host; lies: boolean;
  /** the way into the stroke from its end, and its thickness there */ ix: number; iy: number; t: number }
/** One join's cut, its gap `off` out and `gap` wide (times `k` when the letter sets it on its own,
    `own`, so a gap too wide for the stroke can be narrowed). `back` is the host's far edge, which the
    stub left on the host stops at: a stroke meeting its host at a slant (the arm of a y) runs on
    through it and would poke out the other side. `across(off)`: the stroke still crosses the gap
    moved `off` out steeply enough for it to cut across the stroke. */
interface StencilCut {
  x: number; y: number; host: number; nx: number; ny: number; back: HalfPlane; own: boolean;
  /** how far up its Gap scale an `own` gap is set */ v: number;
  at: (off: number, k?: number) => { far: HalfPlane; near: HalfPlane | null }; across: (off: number) => boolean;
}
function strokeJoins(i: number, exps: (Expanded | null)[]): Join[] {
  const ex = exps[i]!, own = ex.skeleton.flat(), out: Join[] = [];
  const cx = own.reduce((a, q) => a + q.x, 0) / own.length, cy = own.reduce((a, q) => a + q.y, 0) / own.length;
  for (const end of ex.ends) {
    const lies = end.type !== 'join';
    let best: Host | null = null;
    for (let j = 0; j < exps.length; j++) {
      const h = exps[j];
      if (!h || j === i || (lies && h.loop)) continue;
      const pts = h.skeleton.flat();
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], c = pts[k + 1], dx = c.x - a.x, dy = c.y - a.y, l2 = dx * dx + dy * dy;
        if (l2 < 1e-9) continue;
        const t = clamp(((end.x - a.x) * dx + (end.y - a.y) * dy) / l2);
        const px = a.x + dx * t, py = a.y + dy * t, d = Math.hypot(end.x - px, end.y - py), half = h.thickness[k] / 2;
        if (d > half + 1) continue;
        const atEnd = (k === 0 && t < 0.01) || (k + 2 === pts.length && t > 0.99);
        const score = d / (half + 1) + (atEnd ? 1 : 0), l = Math.sqrt(l2);
        if (!best || score < best.score) best = { score, j, px, py, tx: dx / l, ty: dy / l, half, atEnd };
      }
    }
    if (!best) continue;
    const bj = best;
    if (bj.atEnd && bj.j > i && exps[bj.j]!.ends.some(e => (lies || e.type === 'join') && Math.hypot(e.x - end.x, e.y - end.y) < 1)) continue;
    let nx = -bj.ty, ny = bj.tx;
    const side = (cx - bj.px) * nx + (cy - bj.py) * ny;
    if (Math.abs(side) < 1) continue;
    if (side < 0) { nx = -nx; ny = -ny; }
    out.push({ id: `${i}${end.which}`, x: end.x, y: end.y, nx, ny, bj, lies, ix: -end.dx, iy: -end.dy, t: end.t });
  }
  return out;
}
/** The joins Stencil opens: a stroke joined at both ends (the bar of an H, an A or an e) is cut at
    one end only, so its gap moves the way every other gap does, rightwards (down an upright stroke),
    not in from both ends at once. A bowl joined twice to its stem (a P) keeps both: they move the same way. */
function stencilOpens(joins: Join[]): Set<string> {
  const lead = (c: Join) => c.nx - c.ny * 0.5, drawn = joins.filter(c => !c.lies);
  return new Set(drawn.filter(c => !drawn.some(k => k !== c && k.nx * c.nx + k.ny * c.ny < -0.3 && lead(k) > lead(c))).map(c => c.id));
}
/** `square`: cut straight across the stroke instead (a crossbar made shorter), where both its edges are clear of the host. */
function stencilCut(ex: Expanded, jn: Join, gap: number, own: boolean, square = false, v = 1): StencilCut {
  const { bj, nx, ny } = jn, end = jn;
  if (square) {
    const l = Math.hypot(jn.ix, jn.iy) || 1, dx = jn.ix / l, dy = jn.iy / l, dn = dx * nx + dy * ny;
    if (dn > 0.2) {
      // how far in from the end each edge of the stroke leaves the host's far side
      const clear = Math.max(...[1, -1].map(o => {
        const qx = end.x - dy * o * jn.t / 2, qy = end.y + dx * o * jn.t / 2;
        return (bj.half - ((qx - bj.px) * nx + (qy - bj.py) * ny)) / dn;
      }));
      const at = (d: number) => ({ x: end.x + dx * d, y: end.y + dy * d });
      return { x: end.x, y: end.y, host: bj.j, nx, ny, own, v, back: { ...at(0), nx: -dx, ny: -dy }, across: () => true,
        at: (o, k = 1) => ({ far: { ...at(clear + o + gap * (own ? k : 1)), nx: -dx, ny: -dy }, near: o > 0 ? { ...at(clear + o), nx: dx, ny: dy } : null }) };
    }
  }
  const at = (d: number) => ({ x: bj.px + nx * d, y: bj.py + ny * d });
  // kept parallel to the host, a gap moved out cuts across the stroke only where the stroke leaves
  // the host steeply: the arch of an n soon does, but a straight arm meeting it at a slant (the
  // arm of a y) never does, and a gap on it would run down its length, so it stays at the join
  const across = (o: number) => {
    const d = bj.half + o + gap / 2, dist = (q: Pt) => (q.x - bj.px) * nx + (q.y - bj.py) * ny;
    let best = Infinity, steep = false;
    for (const line of ex.skeleton) for (let k = 0; k + 1 < line.length; k++) {
      const a = line[k], c = line[k + 1], da = dist(a) - d, dc = dist(c) - d;
      if (da * dc > 0) continue;
      const l = Math.hypot(c.x - a.x, c.y - a.y), near = Math.hypot((a.x + c.x) / 2 - end.x, (a.y + c.y) / 2 - end.y);
      if (l < 1e-9 || near > best) continue;
      best = near; steep = Math.abs(dc - da) / l > 0.6;
    }
    return steep;
  };
  return { x: end.x, y: end.y, host: bj.j, nx, ny, own, v, back: { ...at(-bj.half), nx: -nx, ny: -ny }, across,
    at: (o, k = 1) => ({ far: { ...at(bj.half + o + gap * (own ? k : 1)), nx: -nx, ny: -ny }, near: o > 0 ? { ...at(bj.half + o), nx, ny } : null }) };
}
/** The gap at one join of a stroke that is a crossbar (`bar`, cut square when its gap is set) or not, on the join's own Gap scale: the
    letter's own gap there, else the crossbars' Gap, else Stencil's where it opens one (`opens`). `own`:
    it is set for this join or this kind of stroke, so it narrows to fit a short stroke rather than go. */
function gapOf(m: Metrics, id: string, bar: boolean, opens: boolean) {
  const v = m.p.joinGaps?.[id];
  if (v != null) return { v, own: true };
  if (bar && m.p.barGap > 0 && m.p.barEnds !== 'through') return { v: m.p.barGap, own: true };
  return { v: opens ? m.gap / joinGap(1, m.s) : 0, own: false };
}
const isBar = (part?: string) => part === 'crossbar' || part === 'bar';

/* Crossbars run through (Ends: Through): a level crossbar runs on past each stroke its ends meet, out
   to that stroke's outside edge, where it is cut square, and the strokes it meets are cut across above
   and below it, the Gap from it, so the bar stands free between their pieces (a stencil A). `bars`: the
   bars' new outlines, by stroke; `bands`: the levels cut out of the strokes they meet; `at`: the joins. */
interface Through { bars: Map<number, Pt[]>; bands: Map<number, [number, number][]>; at: Pt[] }
function barsThrough(b: Builder, exps: (Expanded | null)[], m: Metrics): Through | null {
  const cut = barCut(m.p.barGap, m.s);
  if (m.p.barEnds !== 'through' || !(cut > 0)) return null;
  const out: Through = { bars: new Map(), bands: new Map(), at: [] };
  b.strokes.forEach((st, si) => {
    const ex = exps[si];
    if (!ex || ex.loop || st.poly || !isBar(st.o.part) || !isHorizontal(st.cmds!)) return;
    // only where the bar ends in a stroke (A H e E F), not where it crosses one or ends free (t f)
    const joins = strokeJoins(si, exps).filter(jn => !jn.lies && !exps[jn.bj.j]!.loop);
    if (!joins.length) return;
    const ys = ex.contours[0].map(q => q.y), y0 = Math.min(...ys), y1 = Math.max(...ys), ym = (y0 + y1) / 2;
    let bar = ex.contours[0];
    for (const jn of joins) {
      // the host's outside edge, at the middle of the bar: the first edge past the join, going out
      const dir = jn.ix < 0 ? 1 : -1, host = exps[jn.bj.j]!.contours[0];
      let edge = jn.x;
      for (let k = 0; k < host.length; k++) {
        const a = host[k], c = host[(k + 1) % host.length];
        if ((a.y <= ym) === (c.y <= ym)) continue;
        const x = a.x + (ym - a.y) / (c.y - a.y) * (c.x - a.x);
        if ((x - jn.x) * dir > 0 && (edge === jn.x || (x - edge) * dir < 0)) edge = x;
      }
      // cut square just inside the end, then drawn out to the edge
      const px = jn.x - dir;
      bar = clipPoly(bar, { planes: [{ x: px, y: 0, nx: dir, ny: 0 }] }).map(q => (Math.abs(q.x - px) < 1e-6 ? { ...q, x: edge, sharp: true } : q));
      (out.bands.get(jn.bj.j) ?? out.bands.set(jn.bj.j, []).get(jn.bj.j)!).push([y0 - cut, y1 + cut]);
      out.at.push({ x: jn.x, y: jn.y });
    }
    out.bars.set(si, bar);
  });
  return out.bars.size ? out : null;
}
/** The cuts on stroke i: at each join, the letter's own gap there (none at 0), else the crossbars' or Stencil's (see gapOf). */
function stencilCuts(i: number, exps: (Expanded | null)[], m: Metrics, bar: boolean): StencilCut[] {
  const joins = strokeJoins(i, exps), opens = stencilOpens(joins), cuts: StencilCut[] = [];
  for (const jn of joins) {
    const { v, own } = gapOf(m, jn.id, bar, opens.has(jn.id)), gap = joinGap(v, m.s);
    if (gap > 0) cuts.push(stencilCut(exps[i]!, jn, gap, own, bar && own, v));
  }
  return cuts;
}

/** A stroke cut by one join's cut, its gap `off` out: the far side, and the near side when the gap is moved out. */
const cutBy = (q: Pt[], cut: StencilCut, off: number, k = 1) => {
  const { far, near } = cut.at(off, k);
  return [...splitPoly([q], far), ...(near ? splitPoly(splitPoly([q], near), cut.back) : [])];
};

/* A stroke cut at its joins, its gaps moved `off` out. A gap only moves out as far as keeps ink
   past every gap (the rest of an A's bar) and every piece a solid bit of ink, no sliver: on short
   strokes (the middle arm of an E) the gaps stop where they must, or stay at the join. Nor does a gap land where another stroke joins this one (the leg of an R on the foot
   of its bowl): `others` are the other strokes' outlines, by stroke. A stroke too short to leave a
   solid piece past a gap even at the join (the spur of an a) isn't cut at all, unless the letter
   opens a join of its own there: then its gaps narrow to the widest that leaves solid ink. Returns
   the pieces and how far out the gaps went (null: not cut). */
function stencilPieces(contour: Pt[], cuts: StencilCut[], off: number, s: number, t: number, others: (Pt[] | null)[]): { pieces: Pt[][]; off: number | null } {
  // a piece's narrowest width is about its area over its length; it has to be a good part of a
  // stem's width, or of the stroke's own where that is thinner (a hairline bar)
  const min = Math.min(s * 0.5, t * 0.9);
  const solid = (q: Pt[]) => {
    const xs = q.map(p => p.x), ys = q.map(p => p.y);
    return Math.abs(signedArea(q)) / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= min;
  };
  // the other strokes' outlines as points no further apart than a quarter stem, and those inside this stroke
  const dense = others.map(q => {
    if (!q) return [];
    const pts: Pt[] = [];
    for (let k = 0; k < q.length; k++) {
      const a = q[k], b = q[(k + 1) % q.length], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (s * 0.25));
      for (let j = 0; j < n; j++) pts.push(lerpP(a, b, j / n));
    }
    return pts.filter(p => inPoly(contour, p));
  });
  const clear = (cut: StencilCut, o: number) => {
    const { far, near } = cut.at(o, k);
    const f = (pl: HalfPlane, p: Pt) => (p.x - pl.x) * pl.nx + (p.y - pl.y) * pl.ny;
    // with a quarter stem to spare, so a stroke's corner doesn't just clip the gap
    return dense.every((pts, j) => j === cut.host || pts.every(p => !(f(far, p) > -s * 0.25 && near && f(near, p) > -s * 0.25)));
  };
  // how much of their own width the gaps the letter sets keep
  let k = 1;
  const cutAt = (o: number) => {
    if (o > 0 && !cuts.every(c => c.across(o) && clear(c, o))) return null;
    let pieces = [contour], past = [contour];
    for (const cut of cuts) {
      pieces = pieces.flatMap(q => cutBy(q, cut, o, k));
      past = past.flatMap(q => splitPoly([q], cut.at(o, k).far));
    }
    return past.length && pieces.every(solid) ? pieces : null;
  };
  if (!cuts.length) return { pieces: [contour], off: null };
  let atJoin = null;
  if (cuts.some(c => c.own)) {
    // the gaps the letter sets narrow together, in proportion to their settings, so that the widest
    // would just leave solid ink at the top of its scale: then each keeps widening all the way along
    // its scale rather than stopping where the stroke runs out
    const top = Math.max(...cuts.filter(c => c.own).map(c => c.v));
    k = 1 / top;
    if (!cutAt(0)) {
      let a = 0, b = k;
      for (let n = 0; n < 10; n++) { k = (a + b) / 2; if (cutAt(0)) a = k; else b = k; }
      k = a;
    }
    k *= top;
    if (k > 0.02) atJoin = cutAt(0);
  } else atJoin = cutAt(0);
  if (!atJoin) return { pieces: [contour], off: null };
  // the furthest out the gaps can go, so dragged past it they stay put. Where another stroke
  // joins close to the join (the leg of a K on its arm) the gaps can't sit on it, but can past it
  const lo = s * 0.55;
  if (off < lo) return { pieces: atJoin, off: 0 };
  if (cutAt(off)) return { pieces: cutAt(off)!, off };
  let a = -1, b = off;
  for (let k = 1; k <= 12 && a < 0; k++) { const c = off - (off - lo) * k / 12; if (cutAt(c)) a = c; else b = c; }
  if (a < 0) return { pieces: atJoin, off: 0 };
  for (let k = 0; k < 8; k++) { const c = (a + b) / 2; if (cutAt(c)) a = c; else b = c; }
  return { pieces: cutAt(a)!, off: a };
}

/* A stroke opened at its own turns (the top left of an F, the tops of an M's stems): at each, the
   side running more upright (the earlier one when both lean alike) stays whole, squared off past
   the turn, and the other is pulled back from it by the turn's gap, cut parallel to it, so the
   stroke comes apart there like two strokes joined. */
type Turn = ReturnType<typeof turnsOf>[number];
/** Which side of a turn stays whole (`keepIn`: the side coming in), and (nx, ny), the way its gap opens, away from that side. */
function turnKeep(tn: Turn) {
  const keepIn = Math.abs(tn.din.ty) >= Math.abs(tn.dout.ty) - 0.05, k = keepIn ? tn.din : tn.dout;
  const cx = keepIn ? tn.dout.tx : -tn.din.tx, cy = keepIn ? tn.dout.ty : -tn.din.ty;
  let nx = -k.ty, ny = k.tx;
  if (nx * cx + ny * cy < 0) { nx = -nx; ny = -ny; }
  return { keepIn, nx, ny };
}
/** The pieces of a stroke opened at the turns `open` (in order along it, each with its gap), and
    the outline points they keep as drawn; each turn's gap narrows to the widest that leaves the
    side pulled back a solid bit of ink. `cuts` are its joins' cuts, made on the piece each is on.
    Null when the stroke can't be drawn in pieces. */
function turnPieces(cmds: Cmd[], so: StrokeOpts, pen: PenCtx, open: (Turn & { gap: number })[], cuts: StencilCut[], m: Metrics, t: number, others: (Pt[] | null)[]) {
  const bounds = [1, ...open.map(tn => tn.ci), cmds.length];
  const segs: Cmd[][] = bounds.slice(0, -1).map((b, i) => [i ? ['M', open[i - 1].x, open[i - 1].y] : cmds[0], ...cmds.slice(b, bounds[i + 1])]);
  const keeps = open.map(turnKeep);
  // the side kept runs on half its width past the turn, where the turn's outside corner was
  const halfAt = (ex: Expanded, q: Pt) => {
    const pts = ex.skeleton.flat();
    let best = 0, bd = Infinity;
    pts.forEach((p, k) => { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd && ex.thickness[k] != null) { bd = d; best = ex.thickness[k] / 2; } });
    return best;
  };
  const wOf = (c: Cmd) => { const o = c[c[0] === 'C' ? 7 : 3]; return o?.w != null ? { w: o.w, even: true } : {}; };
  const optsOf = (i: number): StrokeOpts => {
    const o: StrokeOpts = { ...so, clip: undefined, s: i ? 'flat' : so.s, e: i < segs.length - 1 ? 'flat' : so.e };
    if (i) delete o.ws;
    if (i < segs.length - 1) delete o.we;
    return o;
  };
  const plain = segs.map((seg, i) => expandStroke(seg, optsOf(i), pen));
  if (plain.some(ex => !ex || ex.loop)) return null;
  open.forEach((tn, i) => {
    const { keepIn } = keeps[i], v = { x: tn.x, y: tn.y };
    if (keepIn) {
      const seg = segs[i], h = halfAt(plain[i]!, v);
      seg.push(['L', tn.x + tn.din.tx * h, tn.y + tn.din.ty * h, wOf(seg[seg.length - 1])]);
    } else {
      const seg = segs[i + 1], h = halfAt(plain[i + 1]!, v);
      seg.splice(0, 1, ['M', tn.x - tn.dout.tx * h, tn.y - tn.dout.ty * h], ['L', tn.x, tn.y, wOf(seg[1])]);
    }
  });
  const exs = segs.map((seg, i) => expandStroke(seg, optsOf(i), pen));
  if (exs.some(ex => !ex || ex.loop)) return null;
  const drawn = new Set<Pt>();
  let parts = exs.map(ex => {
    const c = so.clip ? clipPoly(ex!.contours[0], so.clip) : ex!.contours[0];
    c.forEach(q => drawn.add(q));
    return [c];
  });
  const min = Math.min(m.s * 0.5, t * 0.9);
  const solid = (q: Pt[]) => {
    const xs = q.map(p => p.x), ys = q.map(p => p.y);
    return Math.abs(signedArea(q)) / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1) >= min;
  };
  open.forEach((tn, i) => {
    const { keepIn, nx, ny } = keeps[i], j = keepIn ? i + 1 : i, h = halfAt(exs[keepIn ? i : i + 1]!, tn);
    const cutAt = (gap: number) => parts[j].flatMap(q => splitPoly([q], { x: tn.x + nx * (h + gap), y: tn.y + ny * (h + gap), nx: -nx, ny: -ny }));
    const ok = (ps: Pt[][]) => ps.length > 0 && ps.every(solid);
    let ps = cutAt(tn.gap);
    if (!ok(ps)) {
      let a = 0, b = tn.gap;
      for (let n = 0; n < 10; n++) { const c = (a + b) / 2; if (ok(cutAt(c))) a = c; else b = c; }
      ps = a > tn.gap * 0.02 ? cutAt(a) : parts[j];
    }
    parts[j] = ps;
  });
  // a join's cut falls on the piece whose end the join is
  parts = parts.map((ps, i) => {
    const sk = exs[i]!.skeleton.flat(), ends = [sk[0], sk[sk.length - 1]];
    const mine = cuts.filter(c => ends.some(q => Math.hypot(q.x - c.x, q.y - c.y) < 1));
    return mine.length ? ps.flatMap(q => stencilPieces(q, mine, m.gapOff, m.s, t, others).pieces) : ps;
  });
  return { pieces: parts.flat(), drawn };
}

/* Stroke end length: a terminal grows on along its own curve, then straight on past the curve's
   end, or draws back along it. Trimming always leaves 40% of the end segment. */
function arcTable(P: Pt[], n = 48) {
  const cum = [0];
  let prev = P[0];
  for (let i = 1; i <= n; i++) { const q = cubicAt(P, i / n); cum.push(cum[i - 1] + Math.hypot(q.x - prev.x, q.y - prev.y)); prev = q; }
  const arc = (u: number) => { const f = clamp(u) * n, i = Math.min(n - 1, Math.floor(f)); return lerp(cum[i], cum[i + 1], f - i); };
  const uAt = (s: number) => {
    let i = 1;
    while (i < n && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1];
    return clamp((i - 1 + (seg > 0 ? (s - cum[i - 1]) / seg : 0)) / n);
  };
  return { arc, uAt, total: cum[n] };
}

/** The tension of a quarter-turn command drawn from `cur`, as stroke.ts draws it. */
const quarterK = (cur: Pt, c: Cmd, m: Metrics) => organicK(m.k, m.org, c[1] - cur.x, c[2] - cur.y);

/** Points along a centerline, about `step` apart. */
function centerPoints(cmds: Cmd[], m: Metrics, step: number): Pt[] {
  const out: Pt[] = [];
  let cur: Pt = { x: 0, y: 0 };
  for (const c of cmds) {
    let P: Pt[], o;
    if (c[0] === 'M') { cur = { x: c[1], y: c[2] }; out.push(cur); continue; }
    if (c[0] === 'L') { const to = { x: c[1], y: c[2] }; P = [cur, lerpP(cur, to, 1 / 3), lerpP(cur, to, 2 / 3), to]; o = {}; }
    else if (c[0] === 'C') { P = [cur, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }]; o = c[7] || {}; }
    else if (c[0] === 'hv' || c[0] === 'vh') { P = quarter(cur.x, cur.y, c[1], c[2], c[0], quarterK(cur, c, m)); o = c[3] || {}; }
    else continue;
    const u0 = o.u0 || 0, u1 = o.u1 ?? 1, hull = Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y) + Math.hypot(P[2].x - P[1].x, P[2].y - P[1].y) + Math.hypot(P[3].x - P[2].x, P[3].y - P[2].y);
    const n = Math.max(1, Math.ceil(hull * (u1 - u0) / step));
    for (let k = 0; k <= n; k++) out.push(cubicAt(P, lerp(u0, u1, k / n)));
    cur = P[3];
  }
  return out;
}

/** The command at the start ('s') or end ('e') of an open centerline, the point it starts from,
    and its cubic (a line as a straight one). Null if the line isn't open or can't be read there. */
function endCmd(cmds: Cmd[], which: 's' | 'e', m: Metrics) {
  if (cmds[0]?.[0] !== 'M' || cmds.some((c, i) => i > 0 && (c[0] === 'M' || c[0] === 'Z'))) return null;
  const i = which === 's' ? 1 : cmds.length - 1, c = cmds[i];
  if (!c) return null;
  let cur: Pt = { x: cmds[0][1], y: cmds[0][2] };
  for (let j = 1; j < i; j++) { const n = cmds[j].length, off = typeof cmds[j][n - 1] === 'number' ? 2 : 3; cur = { x: cmds[j][n - off], y: cmds[j][n - off + 1] }; }
  let P: Pt[], oi: number;
  if (c[0] === 'L') { const to = { x: c[1], y: c[2] }; P = [cur, lerpP(cur, to, 1 / 3), lerpP(cur, to, 2 / 3), to]; oi = 3; }
  else if (c[0] === 'C') { P = [cur, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }]; oi = 7; }
  else if (c[0] === 'hv' || c[0] === 'vh') { P = quarter(cur.x, cur.y, c[1], c[2], c[0], quarterK(cur, c, m)); oi = 3; }
  else return null;
  const o = { ...(c[oi] || {}) }, line = c[0] === 'L';
  return { i, c, cur, P, oi, o, line, u0: line ? 0 : o.u0 || 0, u1: line || o.u1 == null ? 1 : o.u1 };
}

/** Move the start ('s') or end ('e') of an open centerline by `d` along it (negative trims).
    Returns the new commands and where that end was and now is, or null if it can't. */
function stretchEnd(cmds: Cmd[], which: 's' | 'e', d: number, m: Metrics): { cmds: Cmd[]; from: Pt; to: Pt } | null {
  const e = endCmd(cmds, which, m);
  if (!e) return null;
  const { i, c, cur, P, oi, o, u0, u1 } = e, out = cmds.slice();
  if (e.line) {
    const dx = c[1] - cur.x, dy = c[2] - cur.y, l = Math.hypot(dx, dy);
    if (l < 1) return null;
    const nl = Math.max(l * 0.4, l + d), ux = dx / l, uy = dy / l;
    if (which === 'e') {
      const to = { x: cur.x + ux * nl, y: cur.y + uy * nl };
      out[i] = ['L', to.x, to.y, ...c.slice(3)];
      return { cmds: out, from: { x: c[1], y: c[2] }, to };
    }
    const to = { x: c[1] - ux * nl, y: c[2] - uy * nl };
    out[0] = ['M', to.x, to.y];
    return { cmds: out, from: cur, to };
  }
  const { arc, uAt, total } = arcTable(P), a = arc(u0), b = arc(u1);
  const next = c.slice(0, oi) as Cmd;
  next[oi] = o;
  out[i] = next;
  if (which === 'e') {
    const s = Math.max(a + (b - a) * 0.4, b + d), from = cubicAt(P, u1);
    o.u1 = s < total ? uAt(s) : 1;
    let to: Pt = cubicAt(P, o.u1);
    if (s > total) {
      const t = cubicAt(P, 1);
      to = { x: t.x + t.tx * (s - total), y: t.y + t.ty * (s - total) };
      out.push(['L', to.x, to.y, o.w != null ? { w: o.w } : {}]);
    }
    return { cmds: out, from, to };
  }
  const s = Math.min(b - (b - a) * 0.4, a - d), from = cubicAt(P, u0);
  o.u0 = s > 0 ? uAt(s) : 0;
  let to: Pt = cubicAt(P, o.u0);
  if (s < 0) {
    const t = cubicAt(P, 0);
    to = { x: t.x + t.tx * s, y: t.y + t.ty * s };
    out.splice(0, 1, ['M', to.x, to.y], ['L', t.x, t.y, o.w != null ? { w: o.w } : {}]);
  }
  return { cmds: out, from, to };
}

/* Curling an end: the last stretch of the stroke, up to CURL_REACH of the x-height back from its
   tip, is redrawn by following its own tangents and turning more at every step. Above 0.5 the
   end curls on round the way it already turns (a straight end toward the middle of the letter);
   below it a curved end first unbends until it is straight, and then, like a straight end, curls
   the other way. A curl winds like a volute, gently where it leaves the stroke and tighter toward
   the tip. It winds further round the further Curl is from 0.5, CURL_TURNS times round per unit
   of that at first, climbing steeply to CURL_MOST turns at either end, or as many as fit within
   CURL_WIDEST x-heights of its middle. It draws the end out as far as it needs for that, up to
   CURL_LONGEST x-heights, and never turns tighter at the tip than CURL_TIGHT of the stroke
   width, or CURL_ROUND once it winds twice round.
   Winding more than once round, it never turns so tight that a turn comes nearer the one around
   it than CURL_GAP stroke widths (centerline to centerline), and runs on a little further to
   wind round instead.
   Its length changes as with stretchEnd, and any length past what the curl takes first draws
   the end on along its own path, carrying the curl further out.
   A curl keeps CURL_CLEAR of the stroke width clear of the rest of the letter (centerline to
   centerline), and CURL_GAP clear of its own earlier turns and of the rest of its own stroke,
   bar where it leaves it. Where it would run into another stroke it draws the end on first, up
   to CURL_LEAD x-heights, winds less and smaller, or, when the length drawn on first is what
   runs into the letter, gives some of that up, whichever changes it least (see CURL_TRIES). */
const CURL_REACH = 0.45, CURL_TURNS = 1.25, CURL_MOST = 3, CURL_WIDEST = 1.2, CURL_LONGEST = 14, CURL_TIGHT = 0.9, CURL_ROUND = 1.5, CURL_CLEAR = 1.6, CURL_GAP = 1.5;
/** How much of the lower half of Curl a curved end takes to straighten. */
const CURL_UNBEND = 0.3;
/** The ways a crowded curl can give way, as [how much further on it starts, in x-heights; its
    size; how much of the length drawn on before it it keeps], cheapest first. */
const CURL_LEAD = 0.6;
const CURL_TRIES = [1, 0.5, 0].flatMap(g => [0, 0.1, 0.2, 0.3, 0.45, CURL_LEAD].flatMap(x => [1, 0.85, 0.7, 0.55, 0.42, 0.3, 0.2, 0.12, 0.06, 0].map(f => [x, f, g])))
  .map(t => ({ t, cost: t[0] * 2 + 1 - t[1] + (1 - t[2]) * 0.5 })).sort((p, q) => p.cost - q.cost).map(({ t }) => t).slice(1);

/** A dot's outline, a point every `step` along it (its own points marked `corner`), and its middle, for a curl to keep off. */
function dotPoints(poly: Pt[], step: number): (Pt & { dot: true; corner?: boolean })[] {
  const out: (Pt & { dot: true; corner?: boolean })[] = [];
  let cx = 0, cy = 0;
  poly.forEach((a, k) => {
    const b = poly[(k + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let j = 0; j < n; j++) out.push({ x: lerp(a.x, b.x, j / n), y: lerp(a.y, b.y, j / n), dot: true, corner: !j });
    cx += a.x / poly.length; cy += a.y / poly.length;
  });
  out.push({ x: cx, y: cy, dot: true });
  return out;
}

function shapeEnd(cmds: Cmd[], which: 's' | 'e', d: number, curl: number, m: Metrics, mid: Pt, crowd: () => (Pt & { dot?: boolean; corner?: boolean })[], mine = false): { cmds: Cmd[]; from: Pt; to: Pt; span?: { x0: number; x1: number } } | null {
  if (Math.abs(curl - 0.5) < 0.005) return stretchEnd(cmds, which, d, m);
  const e = endCmd(cmds, which, m);
  if (!e) return null;
  const { i, c, P, oi, o, u0, u1 } = e, { arc, uAt } = arcTable(P), a = arc(u0), b = arc(u1), len = b - a;
  if (len < 1) return null;
  // the stretch redrawn (more of it when a trim cuts deeper), and how long it becomes
  const S0 = Math.min(len * 0.98, Math.max(m.xh * CURL_REACH, 1 - d * 1.5)), Sn = S0 + Math.max(d, -len * 0.6);
  // s runs from the joint J, where the redrawn stretch leaves the stroke, out to the tip
  const at = (s: number) => {
    const t = cubicAt(P, uAt(which === 'e' ? b - S0 + s : a + S0 - s));
    return which === 'e' ? t : { ...t, tx: -t.tx, ty: -t.ty };
  };
  const N = 48, ang: number[] = [];
  for (let k = 0; k <= N; k++) {
    const t = at(S0 * k / N), v = Math.atan2(t.ty, t.tx);
    ang.push(k ? v + Math.round((ang[k - 1] - v) / (2 * Math.PI)) * 2 * Math.PI : v);
  }
  const drawn = (s: number) => { const f = clamp(s / S0) * N, k = Math.min(N - 1, Math.floor(f)); return lerp(ang[k], ang[k + 1], f - k); };
  const J = at(0), tip = at(S0), turned = ang[N] - ang[0], curved = Math.abs(turned) > 0.05;
  const way = Math.sign(curved ? turned : tip.tx * (mid.y - tip.y) - tip.ty * (mid.x - tip.x)) || 1;
  const k2 = (curl - 0.5) * 2, straighten = k2 < 0 && curved ? Math.min(1, -k2 / CURL_UNBEND) : 0;
  const amount = k2 >= 0 ? k2 : curved ? Math.max(0, (-k2 - CURL_UNBEND) / (1 - CURL_UNBEND)) : -k2;
  // the extra turn grows with the square of the distance into the curl, so its curvature is
  // tightest at the tip: 2 * turn / length there. Wound many times round it becomes an
  // Archimedean spiral, each turn `spread` further out per radian, as long as `spiral` of a turn
  const want = (CURL_TURNS * amount + (CURL_MOST - CURL_TURNS) * amount ** 4) * 2 * Math.PI;
  // (its tip rounder as it winds from once to twice round, so the last turn stays centered)
  const tight = lerp(CURL_TIGHT, CURL_ROUND, clamp(want / (2 * Math.PI) - 1));
  const rTip = Math.max(m.s * tight, m.xh * 0.08), spread = m.s * CURL_GAP * 1.15 / (2 * Math.PI);
  const spiral = (t: number) => Math.min(Math.max(2 * t * rTip, 1.2 * (rTip * t + spread * t * t / 2)), m.xh * CURL_LONGEST);
  // as many turns as fit within CURL_WIDEST (once round at least); the curl takes the stretch
  // redrawn, or as long as those need, and any length past that comes first
  const most = Math.min(want, Math.max(2 * Math.PI, (m.xh * CURL_WIDEST - rTip) / spread)), Ls = spiral(most);
  const Lc = Math.min(Math.max(Sn, Ls), Math.max(S0, Ls));
  // as many turns as that length holds
  const fits = (Math.sqrt(rTip * rTip + 2 * spread * Lc / 1.2) - rTip) / spread;
  const turn0 = (k2 >= 0 ? way : -way) * Math.min(most, Math.max(fits, Lc / (2 * rTip)));
  const M = 256;
  // the curl winding `f` as far round, as long as that needs, keeping `g` of the length drawn on
  // before it, and starting `lead` further on. With f at 0 the end keeps its own shape, and
  // `g` of the length drawn on
  const draw = (lead: number, f: number, g: number) => {
    const T = Math.abs(turn0) * f, Lq = f ? Math.max(spiral(T), Lc * f * f) : lerp(Math.min(S0, Sn), Sn, g), L0 = Math.max(0, Sn - Lq) * g + lead;
    // the extra turn along the curl, as s², except that with `left` still to wind it turns no
    // tighter than round rTip + spread * left, an Archimedean spiral that keeps its turns apart.
    // Wound twice round or more, it comes round to its outer turn within half as far again as
    // that turn is wide, rather than sweeping out a long way first
    const quick = clamp(T / (2 * Math.PI) - 1) / (1.5 * (rTip + spread * T) ** 2);
    const dh = Lq / M, turns = [0], ramp = Math.max(2 * T / (Lq * Lq), quick);
    for (let k = 0, v = 0; T ? v < T && k < 3 * M : k < M; k++) {
      v = Math.min(T, v + dh * Math.min(ramp * (k + 0.5) * dh, 1 / (rTip + spread * (T - v))));
      turns.push(v);
    }
    const extra = (s: number) => {
      const t = Math.max(0, s - L0) / dh, k = Math.min(turns.length - 2, Math.floor(t));
      return k < 0 ? 0 : t >= turns.length - 1 ? turns[turns.length - 1] : lerp(turns[k], turns[k + 1], t - k);
    };
    // traced in steps of about a third of the stroke width
    const total = L0 + (turns.length - 1) * dh, n = Math.round(clamp(total / (m.s * 0.3), 48, 320)), sign = Math.sign(turn0), h = total / n;
    const angle = (s: number) => lerp(drawn(s), ang[0], straighten) + sign * extra(s);
    const pts: Pt[] = [{ x: J.x, y: J.y }];
    for (let k = 1; k <= n; k++) { const t = angle(h * (k - 0.5)), p = pts[k - 1]; pts.push({ x: p.x + Math.cos(t) * h, y: p.y + Math.sin(t) * h }); }
    return { angle, pts, h, T, n };
  };
  // how near the curl may come to a point: `most`, or as near as the end as drawn already comes
  // (across a narrow opening, say), but no nearer
  const nOwn = Math.ceil(S0 / m.s * 5), own = Array.from({ length: nOwn + 1 }, (_, k) => at(S0 * k / nOwn));
  const room = (q: Pt, most: number) => Math.min(most, Math.min(...own.map(p => Math.hypot(p.x - q.x, p.y - q.y))));
  // Two points along the stroke touch if they are nearer than `gap` but further apart along it
  // than any bend can bring them
  const clear = m.s * CURL_CLEAR, gap = m.s * CURL_GAP, apart = Math.PI * gap;
  // the rest of the letter on a grid, each point with how near the curl may come, and for the
  // rest of this stroke how far back from J it lies along it
  const key = (x: number, y: number) => Math.floor(x / clear) * 65536 + Math.floor(y / clear);
  // `loose` is the same but for dots, which it only keeps the curl off the ink of (see below)
  type Cell = { x: number; y: number; r: number; back: number };
  const grid = new Map<number, Cell[]>(), loose = new Map<number, Cell[]>();
  const add = (to: Map<number, Cell[]>, q: Pt, r: number, back: number) => {
    const k = key(q.x, q.y), g = { x: q.x, y: q.y, r, back };
    to.get(k)?.push(g) ?? to.set(k, [g]);
  };
  const put = (q: Pt, r: number, back: number) => {
    if (r < m.s * 0.5) return;
    add(grid, q, r, back); add(loose, q, r, back);
  };
  for (const q of crowd()) {
    if (!q.dot) { put(q, room(q, clear), Infinity); continue; }
    if (q.corner) { const r = room(q, clear); if (r >= m.s * 0.5) add(grid, q, r, Infinity); }
    // (all of a dot's outline and its middle, kept off by as much as keeps the curl off its ink, and no
    // more than the end as drawn keeps off them)
    add(loose, q, Math.min(m.s * 0.55, room(q, Infinity) * 0.95), Infinity);
  }
  const line = centerPoints(cmds, m, m.s * 0.5);
  if (which === 's') line.reverse();
  let along = 0;
  const arcs = line.map((q, k) => along += k ? Math.hypot(q.x - line[k - 1].x, q.y - line[k - 1].y) : 0), upTo = along - S0;
  line.forEach((q, k) => { if (arcs[k] < upTo) put(q, room(q, gap), upTo - arcs[k]); });
  const hits = (pts: Pt[], h: number, T: number, most = Infinity, cells = grid) => {
    let n = 0;
    // less than about a turn, a curl can't come back on itself
    const wound = T > 1.6 * Math.PI;
    for (let k = 2; k < pts.length && n < most; k += 2) {
      const p = pts[k];
      let hit = false;
      for (let j = 0; wound && !hit && (k - j) * h > apart; j += 2) hit = Math.hypot(p.x - pts[j].x, p.y - pts[j].y) < gap;
      near: for (const dx of [-clear, 0, clear]) for (const dy of [-clear, 0, clear]) {
        if (hit) break near;
        for (const q of cells.get(key(p.x + dx, p.y + dy)) ?? []) if (k * h + q.back > apart && Math.hypot(p.x - q.x, p.y - q.y) < q.r) { hit = true; break near; }
      }
      if (hit) n++;
    }
    return n;
  };
  let best = draw(0, 1, 1), fewest = hits(best.pts, best.h, best.T);
  for (const [x, f, g] of CURL_TRIES) {
    if (!fewest) break;
    const r = draw(x * m.xh, f, g), n = hits(r.pts, r.h, r.T, fewest);
    if (n < fewest) { best = r; fewest = n; }
  }
  // an end curled on its own (`mine`) and left not wound at all only keeps off a dot's ink (the dot of an i
  // sits too close to its stem for more), and takes the most it can that comes no nearer than the end as
  // drawn already does (the top of the stem of an @ runs along its bowl from the start); failing that it
  // curls less, as far as fits, so its control never springs back straight as it is turned up
  if (mine && amount > 0 && best.T === 0) {
    const home = draw(0, 0, 1), base = hits(home.pts, home.h, home.T, Infinity, loose);
    for (const [x, f, g] of [[0, 1, 1], ...CURL_TRIES]) {
      if (!f) continue;
      const r = draw(x * m.xh, f, g);
      if (hits(r.pts, r.h, r.T, base + 1, loose) <= base) { best = r; break; }
    }
    if (best.T === 0 && Math.abs(curl - 0.5) > 0.04) return shapeEnd(cmds, which, d, 0.5 + (curl - 0.5) * 0.8, m, mid, crowd, true);
  }
  const { angle, pts, h, n: steps } = best;
  // back to béziers, an eighth of a turn at most each
  const pieces: Pt[][] = [];
  for (let i0 = 0, k = 1; k <= steps; k++) {
    if (k < steps && Math.abs(angle(h * k) - angle(h * i0)) < Math.PI / 4) continue;
    const A = pts[i0], B = pts[k], ta = angle(h * i0), tb = angle(h * k), L = h * (k - i0), dt = Math.abs(tb - ta);
    const hl = dt < 1e-4 ? L / 3 : (4 / 3) * Math.tan(dt / 4) * L / dt;
    pieces.push([A, { x: A.x + Math.cos(ta) * hl, y: A.y + Math.sin(ta) * hl }, { x: B.x - Math.cos(tb) * hl, y: B.y - Math.sin(tb) * hl }, B]);
    i0 = k;
  }
  const xs = pts.map(p => p.x), span = { x0: Math.min(...xs), x1: Math.max(...xs) };
  const uJ = uAt(which === 'e' ? b - S0 : a + S0), w = o.w != null ? { w: o.w, even: true } : {}, to = pts[steps], out = cmds.slice();
  if (which === 'e') {
    const keep: Cmd = e.line ? ['L', J.x, J.y, ...c.slice(3)] : [c[0], ...c.slice(1, oi), { ...o, u1: uJ }];
    out.splice(i, 1, keep, ...pieces.map(q => ['C', q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y, w] as Cmd));
    return { cmds: out, from: cubicAt(P, u1), to, span };
  }
  // at the start the stroke now begins at the new tip, so what's left of the first command is
  // written out as a plain curve from J
  const Q = subCubic(P, uJ, u1), rest = { ...o };
  delete rest.u0; delete rest.u1;
  const keep: Cmd = e.line ? c : ['C', Q[1].x, Q[1].y, Q[2].x, Q[2].y, Q[3].x, Q[3].y, rest];
  out.splice(0, 2, ['M', to.x, to.y], ...pieces.reverse().map(q => ['C', q[2].x, q[2].y, q[1].x, q[1].y, q[0].x, q[0].y, w] as Cmd), keep);
  return { cmds: out, from: cubicAt(P, u0), to, span };
}

/** Turn a curved end (the partly drawn quarter turn at the start 's' or end 'e' of an open
    centerline) onto a level or plumb line: back to where the quarter last ran that way, then
    straight out as far as the tip reached along that line. The tip of a hook or tail (`hook`)
    instead takes whichever line is nearer along the curve, so one nearly turned round finishes
    the turn rather than losing its hook; the mouth of a c or s never closes up that way. Null when
    the end isn't a partly drawn quarter turn. */
function runStraight(cmds: Cmd[], which: 's' | 'e', hook: boolean, m: Metrics): { cmds: Cmd[]; from: Pt; to: Pt } | null {
  const e = endCmd(cmds, which, m);
  if (!e || (e.c[0] !== 'hv' && e.c[0] !== 'vh')) return null;
  const { i, c, P, o, u0, u1 } = e, start = which === 's';
  // only one end of the quarter cut short, at the stroke's own end
  if (start ? u0 < 0.01 || u1 < 1 : u1 > 0.99 || u0 > 0) return null;
  const tip = cubicAt(P, start ? u0 : u1), from = { x: tip.x, y: tip.y }, out = cmds.slice(), rest = { ...o };
  delete rest.u0; delete rest.u1;
  // on round to the end of the quarter, which already runs level or plumb
  if (hook && (start ? u0 < 0.5 : u1 > 0.5)) {
    out[i] = [c[0], c[1], c[2], rest];
    const to = start ? P[0] : P[3];
    if (start) out[0] = ['M', to.x, to.y];
    return { cmds: out, from, to };
  }
  // back to the other end of it, and straight out from there
  const B = start ? P[3] : P[0], d = start ? { x: P[2].x - P[3].x, y: P[2].y - P[3].y } : { x: P[1].x - P[0].x, y: P[1].y - P[0].y };
  const l = Math.hypot(d.x, d.y) || 1, ux = d.x / l, uy = d.y / l, reach = (tip.x - B.x) * ux + (tip.y - B.y) * uy;
  if (reach < 1) return null;
  const to = { x: B.x + ux * reach, y: B.y + uy * reach }, w = o.w != null ? { w: o.w } : {};
  if (start) out.splice(0, 2, ['M', to.x, to.y], ['L', B.x, B.y, w]);
  else out[i] = ['L', to.x, to.y, w];
  return { cmds: out, from, to };
}

/* ---- corners
   A corner is where a centerline turns (a turn), or one of the two corners of an end drawn square
   across. Each has a roundness from 0 (sharp) to 1 (round), which a letter can set one by one; a
   turn has two, one for its outside and one for its inside. */

/** The outline radius of one side of a turn at roundness v, in a font whose letters stand `full`
    high (the cap height): all the way, as wide as the letter is high, round enough to take up a
    whole side (it then rounds as far as its sides let it). */
export const turnR = (v: number, full: number) => full * clamp(v) ** 1.5;
/** The roundness of one side of a turn with outline radius r. */
export const turnV = (r: number, full: number) => clamp(r / full) ** (2 / 3);
/** A turn's outline radii as its letter sets them, over those it is drawn with (`drawn`, or a sharp
    corner): the outside by the corner's own roundness, the inside by its own inside roundness, or
    else a stroke tighter than the outside, so the stroke keeps its thickness round the turn. Null
    while the letter sets neither. */
export function ownTurn(m: Metrics, id: string, t: number, drawn: TurnR | null | undefined): TurnR | null {
  const vo = m.p.corners?.[id], vi = m.p.innerCorners?.[id];
  if (vo == null && vi == null) return null;
  const o = vo != null ? turnR(vo, m.cap) : drawn?.o ?? 0;
  return { o, i: vi != null ? turnR(vi, m.cap) : vo != null ? Math.max(0, o - t) : drawn?.i ?? 0 };
}
/** The radius of an end's corner at roundness v: at 1 half the stroke, so the end rounds right off. */
const endCornerR = (v: number, t: number) => v * t / 2;

/** Every turn of a centerline, in order: where a command leaves in another direction than the last
    one arrived, with the index of that command, the point, and the directions in and out. */
function turnsOf(cmds: Cmd[], m: Metrics) {
  const out: { ci: number; x: number; y: number; din: Tangent; dout: Tangent }[] = [];
  let cur: Pt = { x: 0, y: 0 }, din: Tangent | null = null;
  cmds.forEach((c, ci) => {
    if (c[0] === 'M') { cur = { x: c[1], y: c[2] }; din = null; return; }
    let P: Pt[];
    if (c[0] === 'L') P = [cur, lerpP(cur, { x: c[1], y: c[2] }, 1 / 3), lerpP(cur, { x: c[1], y: c[2] }, 2 / 3), { x: c[1], y: c[2] }];
    else if (c[0] === 'C') P = [cur, { x: c[1], y: c[2] }, { x: c[3], y: c[4] }, { x: c[5], y: c[6] }];
    else if (c[0] === 'hv' || c[0] === 'vh') { const o = c[3] || {}; P = subCubic(quarter(cur.x, cur.y, c[1], c[2], c[0], quarterK(cur, c, m)), o.u0 || 0, o.u1 ?? 1); }
    else return;
    if (Math.hypot(P[3].x - P[0].x, P[3].y - P[0].y) < 0.5) return;
    const a = cubicAt(P, 0), b = cubicAt(P, 1);
    if (din && din.tx * a.tx + din.ty * a.ty < Math.cos(0.2)) out.push({ ci, x: cur.x, y: cur.y, din, dout: a });
    din = b; cur = P[3];
  });
  return out;
}

/** Give every turn of a glyph's strokes its id, the roundness its letter sets for it (as the
    `turn` of the command leaving it), and a mark on the outside of the turn. */
function markTurns(b: Builder, m: Metrics) {
  b.strokes.forEach((st, si) => {
    if (!st.cmds) return;
    const t = m.s * (st.o.scale || 1) * strokeWt(m, si);
    turnsOf(st.cmds, m).forEach((tn, k) => {
      const id = `${si}t${k}`, c = st.cmds![tn.ci], oi = c[0] === 'C' ? 7 : 3;
      let o = c[oi] || {};
      let turn: TurnR | null = ownTurn(m, id, t, o.turn) ?? o.turn ?? null;
      // Inside corners rounds the inside of every turn at least as far, and Steps cuts a step out of the
      // outside of every square one; a letter can step each of its corners its own way
      const cos = tn.din.tx * tn.dout.tx + tn.din.ty * tn.dout.ty;
      if (m.innerR > 0 && m.p.innerCorners?.[id] == null) turn = { ...turn, o: turn?.o ?? 0, i: Math.max(turn?.i ?? 0, innerFor(m, Math.acos(clamp(-cos, -1, 1)))) };
      const square = Math.abs(cos) < 0.35, sv = m.p.cornerSteps?.[id] ?? (square ? m.p.steps : 0);
      // a point the stroke's clip cuts off (the foot of a V, squared off on the baseline) has no corner left to step
      const ox = tn.din.tx - tn.dout.tx, oy = tn.din.ty - tn.dout.ty, l = Math.hypot(ox, oy) || 1;
      const h = Math.sqrt(Math.max(1e-3, 1 - l * l / 4)), cl = st.o.clip, px = tn.x + ox / l * t / 2 / h, py = tn.y + oy / l * t / 2 / h;
      const cut = !!cl && (py < (cl.y0 ?? -Infinity) - 0.5 || py > (cl.y1 ?? Infinity) + 0.5 || px < (cl.x0 ?? -Infinity) - 0.5 || px > (cl.x1 ?? Infinity) + 0.5);
      if (sv > 0 && !cut) turn = { ...(turn ?? { o: 0, i: 0 }), step: sv };
      if (turn && turn !== o.turn) {
        o = { ...o, turn };
        const nc = c.slice() as Cmd;
        nc[oi] = o;
        st.cmds![tn.ci] = nc;
      }
      // marked where the outside of the turn is drawn: its mitred point, or the middle of its round
      // (sin h: the sine of half the angle inside the turn)
      const ro = o.turn?.o ?? 0, out = t / 2 / h - ro * (1 / h - 1);
      // (at home on the turn itself, which rounding doesn't move, so the corners keep their order)
      b.marks.push({ type: 'corner', id, x: tn.x + ox / l * out, y: tn.y + oy / l * out, v: turnV(ro, m.cap), vi: turnV(Math.max(o.turn?.i ?? 0, innerFloor(ro, t, tn.din.tx * tn.dout.tx + tn.din.ty * tn.dout.ty)), m.cap), st: cut ? undefined : sv, home: { x: tn.x, y: tn.y } });
    });
  });
}

/** Box bowls: every quarter turn (hv, vh) becomes its two straight sides meeting in a corner that
    rounds on the outside and stays square on the inside: by Box corners (boxRound), from sharp
    through as wide as the stroke (at 0.5) to twice the stroke, as far as its sides let it (any wider and
    the stroke would thin to under half its weight across the corner, so the inside would round too).
    A quarter drawn only in part ends on the side its drawn part runs along, as far out as its tip
    reached (as runStraight does); the tip of a hook or tail drawn more than halfway round instead
    finishes the turn, so it keeps its hook, and its mark moves with it. */
/** The outside radius of a box bowl's corner at Box corners v, for a stroke t thick. */
const boxOuter = (v: number, t: number) => 2 * v * t;
function boxQuarters(b: Builder, m: Metrics) {
  for (const st of b.strokes) {
    if (!st.cmds?.some(c => c[0] === 'hv' || c[0] === 'vh')) continue;
    const out: Cmd[] = [], t = m.s * (st.o.scale || 1);
    let cur: Pt = { x: 0, y: 0 };
    for (const c of st.cmds) {
      if (c[0] === 'Z') { out.push(c); continue; }
      const n = c.length, off = typeof c[n - 1] === 'number' ? 2 : 3, to = { x: c[n - off], y: c[n - off + 1] };
      if (c[0] !== 'hv' && c[0] !== 'vh') { out.push(c); cur = to; continue; }
      const o = c[3] || {}, corner = c[0] === 'hv' ? { x: to.x, y: cur.y } : { x: cur.x, y: to.y };
      const la = Math.hypot(corner.x - cur.x, corner.y - cur.y), lb = Math.hypot(to.x - corner.x, to.y - corner.y);
      if (la < 1 || lb < 1) { out.push(c); cur = to; continue; }
      // the corner turns round half the stroke on its centerline, less where a side is too short
      const r = Math.min(t / 2, la, lb), total = la + lb, ro = Math.min(boxOuter(m.p.boxRound, t), Math.min(la, lb) + t / 2);
      const da = { x: (corner.x - cur.x) / la, y: (corner.y - cur.y) / la }, db = { x: (to.x - corner.x) / lb, y: (to.y - corner.y) / lb };
      const at = (s: number) => s <= la ? { x: cur.x + da.x * s, y: cur.y + da.y * s } : { x: corner.x + db.x * (s - la), y: corner.y + db.y * (s - la) };
      // where the drawn part of the quarter starts and ends along its two sides
      const P = quarter(cur.x, cur.y, to.x, to.y, c[0], quarterK(cur, c, m));
      const place = (u: number, drawnAfter: boolean) => {
        const tip = cubicAt(P, u), mark = b.marks.find(k => (k.type === 'tail' || k.type === 'exit') && Math.hypot(k.x - tip.x, k.y - tip.y) < 1.5);
        if (mark && (drawnAfter ? u < 0.5 : u > 0.5)) return { s: drawnAfter ? 0 : total, mark };
        const s = drawnAfter ? clamp(la + (tip.x - corner.x) * db.x + (tip.y - corner.y) * db.y, la + r, total)
          : clamp((tip.x - cur.x) * da.x + (tip.y - cur.y) * da.y, 0, la - r);
        return { s, mark };
      };
      const start = o.u0 > 0 ? place(o.u0, true) : null, end = o.u1 != null && o.u1 < 1 ? place(o.u1, false) : null;
      const s0 = start?.s ?? 0, s1 = Math.max(s0 + 1, end?.s ?? total), w = o.w != null ? { w: o.w } : {};
      if (s0 > 0) {
        const p = at(s0);
        if (out[out.length - 1]?.[0] === 'M') out[out.length - 1] = ['M', p.x, p.y]; else out.push(['L', p.x, p.y, w]);
        if (start!.mark) { start!.mark.x = p.x; start!.mark.y = p.y; }
      }
      const e = at(s1);
      if (s0 < la && s1 > la) out.push(['L', corner.x, corner.y, w], ['L', e.x, e.y, { ...w, turn: { o: ro, i: Math.max(0, r - t / 2) } }]);
      else out.push(['L', e.x, e.y, w]);
      if (end?.mark) { end.mark.x = e.x; end.mark.y = e.y; }
      cur = to;
    }
    st.cmds = out;
  }
}

/** Whether q is inside polygon poly (even-odd). */
function insidePoly(poly: Pt[], q: Pt) {
  let c = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const a = poly[i], p = poly[k];
    if ((a.y > q.y) !== (p.y > q.y) && q.x < (p.x - a.x) * (q.y - a.y) / (p.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** A corner at q between sides running off along unit directions a and b, rounded r across: where
    the round touches its sides (k along each), its center, and whether a point lies in the cap the
    round cuts off (within the corner, outside the round, on the corner's side of the line between
    where it touches). */
function cornerRound(q: Pt, a: Pt, b: Pt, r: number) {
  const half = Math.acos(clamp(a.x * b.x + a.y * b.y, -1, 1)) / 2, bl = Math.hypot(a.x + b.x, a.y + b.y) || 1;
  const bis = { x: (a.x + b.x) / bl, y: (a.y + b.y) / bl }, k = r / Math.tan(half), h = r / Math.sin(half);
  const C = { x: q.x + bis.x * h, y: q.y + bis.y * h };
  // the insides of the two sides, facing each other
  const na = { x: b.x - a.x * (a.x * b.x + a.y * b.y), y: b.y - a.y * (a.x * b.x + a.y * b.y) }, nb = { x: a.x - b.x * (a.x * b.x + a.y * b.y), y: a.y - b.y * (a.x * b.x + a.y * b.y) };
  const chord = k * Math.cos(half);
  const inCap = (p: Pt) => {
    const dx = p.x - q.x, dy = p.y - q.y;
    return dx * na.x + dy * na.y > -1 && dx * nb.x + dy * nb.y > -1 && dx * bis.x + dy * bis.y < chord - 0.01 && Math.hypot(p.x - C.x, p.y - C.y) > r + 0.01;
  };
  return { k, C, inCap, Ta: { x: q.x + a.x * k, y: q.y + a.y * k }, Tb: { x: q.x + b.x * k, y: q.y + b.y * k } };
}

/** Cut the cap of a round (see cornerRound) out of an outline in place: its sides are cut into short
    steps near the corner, and every point in the cap moves out from the round's center onto it. */
function carveRound(poly: Pt[], q: Pt, round: ReturnType<typeof cornerRound>, r: number) {
  const { C, inCap, Ta, Tb } = round, step = Math.max(1, r / 20);
  const x0 = Math.min(q.x, Ta.x, Tb.x) - 1, x1 = Math.max(q.x, Ta.x, Tb.x) + 1, y0 = Math.min(q.y, Ta.y, Tb.y) - 1, y1 = Math.max(q.y, Ta.y, Tb.y) + 1;
  const out: Pt[] = [];
  let hit = false;
  poly.forEach((p, i) => {
    const n = poly[(i + 1) % poly.length];
    out.push(p);
    if (Math.max(p.x, n.x) < x0 || Math.min(p.x, n.x) > x1 || Math.max(p.y, n.y) < y0 || Math.min(p.y, n.y) > y1) return;
    const steps = Math.ceil(Math.hypot(n.x - p.x, n.y - p.y) / step);
    for (let s = 1; s < steps; s++) out.push({ ...lerpP(p, n, s / steps), smooth: true });
  });
  for (const p of out) {
    if (!inCap(p)) continue;
    const d = Math.hypot(p.x - C.x, p.y - C.y);
    p.x = C.x + (p.x - C.x) * r / d; p.y = C.y + (p.y - C.y) * r / d;
    p.smooth = true; p.sharp = false; delete p.r;
    hit = true;
  }
  if (hit) poly.splice(0, poly.length, ...out);
}

/** The square ends' corners of a glyph's expanded strokes that show: each rounded as its letter sets
    it (or by Roundness), and marked. A corner on the edge of another stroke, or inside it, is hidden
    and left out, unless it sits on a corner of that stroke too (the top left of an E, where the stem
    and the arm both end): then the two are one corner, rounded together under the first one's id.
    A corner whose end's other corner is hidden (the top of a's stem, the other in its bowl) stands
    where the stroke that hides that one runs on from the end: it rounds across every stroke there,
    as far as the ink round it keeps most of its thickness. */
function endCorners(b: Builder, m: Metrics, exps: ({ ex: Expanded | null } | null)[], marks: Mark[], clipMade: Set<Pt>) {
  const polys = b.strokes.map((st, j) => st.poly ? [st.poly] : exps[j]?.ex?.contours ?? []);
  const inside = insidePoly;
  const edge = (poly: Pt[], q: Pt) => {
    let d = Infinity;
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const a = poly[k], p = poly[i], dx = p.x - a.x, dy = p.y - a.y, l2 = dx * dx + dy * dy;
      const u = l2 ? clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / l2) : 0;
      d = Math.min(d, Math.hypot(q.x - a.x - dx * u, q.y - a.y - dy * u));
    }
    return d;
  };
  const groups: { id: string; t: number; pts: Pt[]; partner: string; at: Pt | undefined }[] = [];
  // whether each end corner shows, by its id
  const shows = new Map<string, boolean>();
  exps.forEach((x, si) => {
    for (const c of x?.ex?.endCorners ?? []) {
      // a corner the stroke's clip cut off isn't drawn
      if (!polys[si].some(poly => poly.includes(c.pt))) continue;
      const q = c.pt, near = groups.find(g => Math.hypot(g.pts[0].x - q.x, g.pts[0].y - q.y) < 1.5), side = c.side === 'l' ? 'r' : 'l';
      shows.set(`${si}${c.which}${c.side}`, true);
      if (near) { near.pts.push(q); continue; }
      let hidden = false;
      const also: Pt[] = [];
      polys.forEach((ps, j) => {
        if (j === si || hidden) return;
        // a loop's outer ring holds its inner one: inside the stroke is inside an odd number of them
        const inStroke = ps.filter(poly => inside(poly, q)).length % 2 === 1;
        for (const poly of ps) {
          if (edge(poly, q) > 1.5) continue;
          const v = poly.find(p => !p.smooth && Math.hypot(p.x - q.x, p.y - q.y) < 1.5);
          if (v) also.push(v); else hidden = true;
        }
        if (!also.length && inStroke) hidden = true;
      });
      if (hidden) { shows.set(`${si}${c.which}${c.side}`, false); continue; }
      groups.push({ id: `${si}${c.which}${c.side}`, t: m.s * (b.strokes[si].o.scale || 1) * strokeWt(m, si), pts: [q, ...also],
        partner: `${si}${c.which}${side}`, at: x!.ex!.endCorners.find(e => e.which === c.which && e.side === side)?.pt });
    }
  });
  const ink = (p: Pt) => polys.some(ps => ps.filter(poly => insidePoly(poly, p)).length % 2 === 1);
  /** For a corner q whose end runs toward its hidden other corner `at`, the directions of the end and
      of the stroke's side from it, and the widest round that fits there. */
  const lone = (q: Pt, at: Pt, t: number) => {
    const al = Math.hypot(at.x - q.x, at.y - q.y);
    if (al < 1) return null;
    const a = { x: (at.x - q.x) / al, y: (at.y - q.y) / al }, poly = polys.flat().find(p => p.includes(q));
    if (!poly) return null;
    const i = poly.indexOf(q), side = (dir: number) => {
      for (let s = 1; s < poly.length; s++) {
        const n = poly[(i + dir * s + poly.length * s) % poly.length], d = Math.hypot(n.x - q.x, n.y - q.y);
        if (d > 1) return { x: (n.x - q.x) / d, y: (n.y - q.y) / d };
      }
      return a;
    };
    const s1 = side(1), s2 = side(-1), bdir = Math.abs(s1.x * a.x + s1.y * a.y) < Math.abs(s2.x * a.x + s2.y * a.y) ? s1 : s2;
    if (Math.abs(bdir.x * a.x + bdir.y * a.y) > 0.9) return null;
    // how deep the ink runs in from p along d, as far as `most`
    const depth = (p: Pt, d: Pt, most: number) => {
      let s = 0.5;
      while (s < most && ink({ x: p.x + d.x * s, y: p.y + d.y * s })) s += t / 12;
      return Math.min(s, most);
    };
    const fits = (r: number) => {
      const rd = cornerRound(q, a, bdir, r), toC = (p: Pt) => { const l = Math.hypot(rd.C.x - p.x, rd.C.y - p.y) || 1; return { x: (rd.C.x - p.x) / l, y: (rd.C.y - p.y) / l }; };
      const da = depth(rd.Ta, toC(rd.Ta), t), db = depth(rd.Tb, toC(rd.Tb), t);
      if (Math.min(da, db) < t * 0.3) return false;
      const need = 0.9 * Math.min(da, db);
      for (let j = 1; j < 10; j++) {
        const u = j / 10, p = { x: lerp(rd.Ta.x, rd.Tb.x, u) - rd.C.x, y: lerp(rd.Ta.y, rd.Tb.y, u) - rd.C.y }, l = Math.hypot(p.x, p.y) || 1;
        const on = { x: rd.C.x + p.x * r / l, y: rd.C.y + p.y * r / l };
        if (depth(on, toC(on), need) < need) return false;
      }
      return true;
    };
    // the widest round that fits: stepped out, then narrowed down between the last fit and the first miss
    let lo = t / 2, hi = lo;
    while (hi < m.cap && fits(hi + t / 4)) hi += t / 4;
    lo = hi; hi = Math.min(m.cap, hi + t / 4);
    for (let n = 0; n < 5 && hi - lo > 1; n++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    return { a, b: bdir, most: lo };
  };
  /** Whether a corner whose end's other corner is hidden has the edge across that end run straight on
      past it along another stroke, so the two draw one side of the letter (D's stem top and its bowl). */
  const runsOn = (g: (typeof groups)[number]) => {
    if (shows.get(g.partner) !== false || !g.at) return false;
    const q = g.pts[0], p = { x: q.x + (g.at.x - q.x) * 1.5, y: q.y + (g.at.y - q.y) * 1.5 };
    return polys.some((ps, j) => j !== +g.id.slice(0, -2) && ps.some(poly => edge(poly, p) < 1.5));
  };
  /** How deep a step the group's corner has room for: 0 unless every stroke's outline turns square
      there (not where a diagonal meets a bar in a point), and none where a stroke's clip cut the corner
      (N's diagonal, cut off at its stem), whose sides can't step back with the rest; otherwise no deeper
      than the shortest side any of them runs along from it, so each stroke steps back alike. */
  const stepRoom = (g: (typeof groups)[number]) => {
    let room = Infinity;
    for (const p of g.pts) {
      if (clipMade.has(p)) return 0;
      const poly = polys.flat().find(q => q.includes(p));
      if (!poly) return 0;
      const n = poly.length, i = poly.indexOf(p), way = (dir: number) => {
        let len = 0, o = p, d0: Pt | null = null;
        for (let k = 1; k < n; k++) {
          const q = poly[(i + dir * k + n * k) % n], l = Math.hypot(q.x - o.x, q.y - o.y);
          if (!d0 && l > 1) d0 = { x: (q.x - p.x) / Math.hypot(q.x - p.x, q.y - p.y), y: (q.y - p.y) / Math.hypot(q.x - p.x, q.y - p.y) };
          len += l; o = q;
          if (!q.smooth) break;
        }
        return { len, d: d0 };
      };
      const a = way(1), c = way(-1);
      if (!a.d || !c.d || Math.abs(a.d.x * c.d.x + a.d.y * c.d.y) > 0.35) return 0;
      room = Math.min(room, 0.95 * a.len, 0.95 * c.len);
    }
    return room >= g.t * 0.25 ? room : 0;
  };
  for (const g of groups) {
    const own = m.p.corners?.[g.id], q = g.pts[0], x = q.x, y = q.y;
    // Steps cuts a step out of a square corner of the letter, where two strokes end together (the foot of
    // an L) or where another stroke runs on flush out of the end (the top of D's stem, its bowl running on to the right)
    const room = stepRoom(g), steppable = room > 0, sv = !steppable ? 0 : m.p.cornerSteps?.[g.id] ?? (g.pts.length > 1 || runsOn(g) ? m.p.steps : 0);
    // (one size for every stroke there, at 1 as deep as it can be: 0.85 of the thinner of the stroke and the bars, so
    // they stay joined, or the room there is)
    if (sv > 0) for (const p of g.pts) p.step = sv * Math.min(0.85 * Math.min(g.t, m.hT), room);

    const alone = shows.get(g.partner) === false && g.at ? lone(q, g.at, g.t) : null;
    if (alone) {
      const r = (own ?? 0) * alone.most;
      if (own != null) {
        if (r >= 0.6) {
          // (from where the corner stood: carving moves its point onto the round)
          const at = { x, y }, rd = cornerRound(at, alone.a, alone.b, r);
          for (const ps of polys) for (const poly of ps) carveRound(poly, at, rd, r);
        } else for (const p of g.pts) { delete p.r; p.sharp = true; }
      }
      marks.push({ type: 'corner', id: g.id, x, y, v: own ?? clamp(m.R / alone.most), st: steppable ? sv : undefined });
      continue;
    }
    if (own != null) {
      const r = endCornerR(own, g.t);
      for (const p of g.pts) { if (r >= 0.6) { p.r = r; p.sharp = false; } else { delete p.r; p.sharp = true; } }
    }
    marks.push({ type: 'corner', id: g.id, x, y, v: own ?? clamp(m.R / (g.t / 2)), st: steppable ? sv : undefined });
  }
}

/* ---- joins
   Where one stroke meets another their outlines cross, and each crossing that leaves a corner
   inside the letter (under the arm of an r, beside the crossbar of a t, in the crotch of a y) is a
   corner too: 'j' and its number among the joins of the earlier of the two strokes. A join rounds
   by Joins, or by a roundness its letter gives it, filled in with a fillet that runs along both
   strokes' edges and curves across between them. */

/** How far Inside corners rounds a corner whose inside is `angle` across: all the way at a right angle
    or wider, less and less as it narrows, so a sharp crotch (the arms of a K, an X) doesn't fill in black. */
const innerFor = (m: Metrics, angle: number) => m.innerR * Math.min(1, angle / (Math.PI / 2)) ** 2;

/** The radius of a join's round at roundness v, in a font with stems `s` thick: two stems at 1. */
export const joinR = (v: number, s: number) => 2 * s * clamp(v);

/** Whether q lies inside the closed polygon `poly` (even-odd). */
function inPoly(poly: Pt[], q: Pt) {
  let c = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const a = poly[i], p = poly[k];
    if ((a.y > q.y) !== (p.y > q.y) && q.x < (p.x - a.x) * (q.y - a.y) / (p.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Mark every join of a glyph's expanded strokes and return the fillets that round them. A crossing
    counts when one wedge around it is left empty, narrower than a straight line (so not where an
    edge only runs on flush past another, as along the top of an r); the round is as wide as the
    edges on both sides let it be, following them as they curve. */
function joinCorners(b: Builder, m: Metrics, exps: ({ ex: Expanded | null } | null)[], marks: Mark[]): Pt[][] {
  // a stencil opens the joins up, and a wireframe shows every stroke as drawn
  if (m.gap || m.p.fill === 'wire') return [];
  const rings: Pt[][][] = b.strokes.map((st, si) => {
    if (st.poly) return st.poly.length > 2 ? [st.poly] : [];
    const ex = exps[si]?.ex;
    if (!ex) return [];
    return (ex.loop ? ex.contours : [st.o.clip ? clipPoly(ex.contours[0], st.o.clip) : ex.contours[0]]).filter(c => c.length > 2);
  });
  const boxOf = (pts: Pt[]) => pts.reduce((o, q) => ({ x0: Math.min(o.x0, q.x), x1: Math.max(o.x1, q.x), y0: Math.min(o.y0, q.y), y1: Math.max(o.y1, q.y) }),
    { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  const boxes = rings.map(rs => rs.map(boxOf));
  const inStroke = (si: number, q: Pt) => rings[si].filter((poly, k) => {
    const bx = boxes[si][k];
    return q.x >= bx.x0 && q.x <= bx.x1 && q.y >= bx.y0 && q.y <= bx.y1 && inPoly(poly, q);
  }).length % 2 === 1;
  const inked = (q: Pt, but = -1) => rings.some((_, si) => si !== but && inStroke(si, q));
  /* From the crossing p, on edge k of ring `ring` (stroke si), along the outline one way (dir ±1)
     for up to `want`: the points passed, stopping where it turns off by more than 50 degrees or
     runs into another stroke. Ink is looked for a hair off the edge, toward the empty wedge `bis`
     points into, so an edge another stroke's edge runs along (the waist of a B, where both bowls'
     bars lie) stays clear; and a step that runs into ink goes as far as it can first.
     At a corner of the outline that turns away from the wedge it stops sooner, short of as much of
     it as Roundness or a round terminal rounds off later (the top of a t's stem, the ends of its
     crossbar), so no round is left standing out past a corner that isn't there any more. */
  const cornerR = (si: number, q: Pt) => (q.sharp ? 0 : q.r ?? (exps[si]?.ex?.loop ? 0 : m.R * (b.strokes[si].o.scale || 1) * strokeWt(m, si)));
  const walk = (si: number, ring: Pt[], k: number, dir: 1 | -1, p: Pt, want: number, bis: Pt) => {
    const n = ring.length, pts: Pt[] = [p];
    let len = 0, at = p, i = dir > 0 ? (k + 1) % n : k, d0: Pt | null = null, wing = 0, trim = 0;
    let last: { x: number; y: number; l: number; q: Pt } | null = null;
    for (let step = 0; step < n && len < want; step++, i = (i + dir + n) % n) {
      const q = ring[i], dx = q.x - at.x, dy = q.y - at.y, l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      // (a sliver of an edge, where the outline was cut at the crossing, has no way of its own: taken as it is)
      if (l < 3 && !d0) { pts.push({ x: q.x, y: q.y }); len += l; at = q; continue; }
      if (!d0) { d0 = { x: dx / l, y: dy / l }; wing = Math.sign(d0.x * bis.y - d0.y * bis.x); }
      // the turn at the point just reached, + toward the wedge
      const turn = last ? Math.atan2(last.x * dy - last.y * dx, last.x * dx + last.y * dy) * wing : 0;
      const corner = !!last && !last.q.smooth && Math.abs(turn) >= 0.07;
      if ((dx * d0.x + dy * d0.y) / l < Math.cos(50 * Math.PI / 180) || (corner && turn < -0.25)) {
        if (corner) trim = cornerR(si, last!.q) * Math.tan(Math.min(Math.abs(turn), 2.6) / 2);
        break;
      }
      const side = -dy * bis.x + dx * bis.y > 0 ? 1.5 / l : -1.5 / l, off = { x: -dy * side, y: dx * side };
      const clear = (f: number) => !inked({ x: at.x + dx / l * f + off.x, y: at.y + dy / l * f + off.y }, si);
      let take = Math.min(l, want - len), stop = false;
      if (!clear(take)) {
        let lo = 0, hi = take;
        for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (clear(mid)) lo = mid; else hi = mid; }
        take = lo; stop = true;
      }
      if (take > 1e-6) { const e = { x: at.x + dx / l * take, y: at.y + dy / l * take }; pts.push(e); len += take; at = e; }
      if (stop) break;
      last = { x: dx / l, y: dy / l, l, q };
    }
    return { pts, len: Math.max(0, len - trim) };
  };
  const cut = (w: { pts: Pt[] }, d: number) => {
    const out = [w.pts[0]];
    let len = 0;
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], q = w.pts[i], l = Math.hypot(q.x - a.x, q.y - a.y);
      if (len + l >= d) { const f = l ? (d - len) / l : 0; out.push({ x: a.x + (q.x - a.x) * f, y: a.y + (q.y - a.y) * f }); return out; }
      out.push(q); len += l;
    }
    return out;
  };
  const fillets: Pt[][] = [], count = new Map<number, number>();
  for (let i = 0; i < b.strokes.length; i++) {
    if (!b.strokes[i].cmds) continue;
    const found: Pt[] = [];
    for (let j = i + 1; j < b.strokes.length; j++) {
      if (!b.strokes[j].cmds) continue;
      rings[i].forEach((A, ca) => rings[j].forEach((B, cb) => {
        const ba = boxes[i][ca], bb = boxes[j][cb];
        if (ba.x0 > bb.x1 || bb.x0 > ba.x1 || ba.y0 > bb.y1 || bb.y0 > ba.y1) return;
        for (let ka = 0; ka < A.length; ka++) {
          const a0 = A[ka], a1 = A[(ka + 1) % A.length];
          if (Math.max(a0.x, a1.x) < bb.x0 || Math.min(a0.x, a1.x) > bb.x1 || Math.max(a0.y, a1.y) < bb.y0 || Math.min(a0.y, a1.y) > bb.y1) continue;
          for (let kb = 0; kb < B.length; kb++) {
            const b0 = B[kb], b1 = B[(kb + 1) % B.length];
            const rx = a1.x - a0.x, ry = a1.y - a0.y, sx = b1.x - b0.x, sy = b1.y - b0.y, den = rx * sy - ry * sx;
            if (Math.abs(den) < 1e-9) continue;
            const t = ((b0.x - a0.x) * sy - (b0.y - a0.y) * sx) / den, u = ((b0.x - a0.x) * ry - (b0.y - a0.y) * rx) / den;
            if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) continue;
            const p = { x: a0.x + rx * t, y: a0.y + ry * t };
            if (found.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 1.5)) continue;
            // the four ways out of the crossing along the two edges, in order round it
            const la = Math.hypot(rx, ry), lb = Math.hypot(sx, sy);
            const rays = [
              { x: rx / la, y: ry / la, si: i, ring: A, k: ka, dir: 1 as const }, { x: -rx / la, y: -ry / la, si: i, ring: A, k: ka, dir: -1 as const },
              { x: sx / lb, y: sy / lb, si: j, ring: B, k: kb, dir: 1 as const }, { x: -sx / lb, y: -sy / lb, si: j, ring: B, k: kb, dir: -1 as const }
            ].sort((P, Q) => Math.atan2(P.y, P.x) - Math.atan2(Q.y, Q.x));
            const free = rays.map((r1, n) => {
              const r2 = rays[(n + 1) % 4];
              let span = Math.atan2(r2.y, r2.x) - Math.atan2(r1.y, r1.x);
              if (span <= 0) span += 2 * Math.PI;
              const bx = r1.x + r2.x, by = r1.y + r2.y, bl = Math.hypot(bx, by) || 1, e = 2 / Math.max(0.1, Math.sin(span / 2));
              return { r1, r2, span, bis: { x: bx / bl, y: by / bl }, empty: !inked({ x: p.x + bx / bl * e, y: p.y + by / bl * e }) };
            }).filter(w => w.empty);
            if (free.length !== 1 || free[0].span > Math.PI - 0.05) continue;
            found.push(p);
            const id = `${i}j${count.get(i) ?? 0}`;
            count.set(i, (count.get(i) ?? 0) + 1);
            const own = m.p.corners?.[id], v = own ?? m.p.joinRound, mark: Mark = { type: 'corner', id, x: p.x, y: p.y, v };
            marks.push(mark);
            // Inside corners rounds every join at least as far, unless its letter rounds it its own way
            const R = own != null ? joinR(own, m.s) : Math.max(joinR(v, m.s), innerFor(m, free[0].span));
            if (R < 0.6) continue;
            // how far along each edge the round starts: R's share of as far as the round of Joins at 1 would
            // start, or as far as both edges let it if that is nearer, so Joins rounds on all the way to 1
            // even where the edges run out first (in heavy letters)
            const { r1, r2, span, bis } = free[0], most = Math.max(R, joinR(1, m.s)), d = most / Math.tan(span / 2);
            const w1 = walk(r1.si, r1.ring, r1.k, r1.dir, p, d, bis), w2 = walk(r2.si, r2.ring, r2.k, r2.dir, p, d, bis);
            const dd = Math.min(d, w1.len * 0.95, w2.len * 0.95) * R / most;
            if (dd < 0.6) continue;
            const s1 = cut(w1, dd), s2 = cut(w2, dd), T1 = s1[s1.length - 1], T2 = s2[s2.length - 1];
            const u1 = s1.length > 1 ? s1[s1.length - 2] : p, u2 = s2.length > 1 ? s2[s2.length - 2] : p;
            const t1 = { x: T1.x - u1.x, y: T1.y - u1.y }, t2 = { x: T2.x - u2.x, y: T2.y - u2.y }, l1 = Math.hypot(t1.x, t1.y) || 1, l2 = Math.hypot(t2.x, t2.y) || 1;
            // the round across, a quarter-circle-like curve from where it leaves one edge to where it meets the other
            // (where a curve followed round has swung its edge away from the corner, turning only as far as
            // the edges' own ways at its ends, or it would overshoot them and leave a lip)
            const phi = Math.abs(Math.atan2(t1.y * t2.x - t1.x * t2.y, -(t1.x * t2.x + t1.y * t2.y))), chord = Math.hypot(T2.x - T1.x, T2.y - T1.y);
            const h = phi > Math.PI - span + 1e-3 ? (4 / 3) * Math.tan(phi / 4) * chord / (2 * Math.sin(phi / 2))
              : (4 / 3) * Math.tan((Math.PI - span) / 4) * dd * Math.tan(span / 2);
            const C = [T1, { x: T1.x - t1.x / l1 * h, y: T1.y - t1.y / l1 * h }, { x: T2.x - t2.x / l2 * h, y: T2.y - t2.y / l2 * h }, T2];
            const arc = Array.from({ length: 11 }, (_, n) => { const q = cubicAt(C, n / 10); return { x: q.x, y: q.y, smooth: n > 0 && n < 10 }; });
            // marked on the round, where the corner now is
            Object.assign(mark, { x: arc[5].x, y: arc[5].y, home: p });
            // it reaches a little into the strokes at the crossing, so no hairline shows between them
            fillets.push([{ x: p.x - bis.x * 2, y: p.y - bis.y * 2, sharp: true }, ...s1.slice(1, -1).map(q => ({ ...q, smooth: true })),
              ...arc, ...s2.slice(1, -1).reverse().map(q => ({ ...q, smooth: true }))]);
          }
        }
      }));
    }
  }
  return fillets;
}

/** Stretch or trim every styled terminal of a glyph (body width W) by the stroke end length, or
    by the length set for that one end, and curl the ends given a curl of their own. Ends with a
    serif keep theirs. Tails, hooks and cursive strokes are left to their own controls, so their
    tips move only by a length set for that one end, measured from where their own control puts
    them (0.5).
    Plain ends (the free ends of stems, legs and bars that aren't styled terminals, and not buried
    in another stroke) and ends with a serif move only by a length or curl of their own, from where
    they are drawn: the serif goes with the end, or goes when it curls. A curled plain end is cut
    straight across instead of level or plumb, and its stroke's clip gives way.
    Notes the ids of those tips in `hooks` and of plain ends in `plains`, where each end sat before
    its own length and curl in `homes`, and returns how far the ends now reach past the body on the
    left and right, to widen it by. */
function stretchTerminals(b: Builder, m: Metrics, W: number, hooks: Set<string>, plains: Set<string>, homes: Map<string, Pt>, capital = false) {
  const grow = { l: 0, r: 0 };
  // every stroke's centerline as drawn, to tell a free end from one buried in another stroke
  const drawn = b.strokes.map(t => t.cmds ? centerPoints(t.cmds, m, m.s * 0.25) : null);
  const buried = (si: number, q: Pt) => b.strokes.some((t, ti) => {
    if (ti === si) return false;
    if (t.poly) {
      const xs = t.poly.map(p => p.x), ys = t.poly.map(p => p.y);
      return q.x >= Math.min(...xs) - 1 && q.x <= Math.max(...xs) + 1 && q.y >= Math.min(...ys) - 1 && q.y <= Math.max(...ys) + 1;
    }
    const pts = drawn[ti]!, sc = t.o.scale || 1;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], c = pts[k + 1], dx = c.x - a.x, dy = c.y - a.y, l2 = dx * dx + dy * dy;
      if (l2 < 1e-9) continue;
      const u = clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / l2), half = (t.o.w === 'thin' ? m.thin : m.tDir(dx, dy)) * sc * strokeWt(m, ti) / 2;
      if (Math.hypot(q.x - a.x - dx * u, q.y - a.y - dy * u) <= half + 1) return true;
    }
    return false;
  });
  let mid: Pt | null = null;
  const middle = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const st of b.strokes) for (const c of st.cmds ?? []) if (typeof c[1] === 'number') { x0 = Math.min(x0, c[1]); x1 = Math.max(x1, c[1]); y0 = Math.min(y0, c[2]); y1 = Math.max(y1, c[2]); }
    return x0 <= x1 ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : { x: W / 2, y: m.xh / 2 };
  };
  const tipAt = (p: Pt) => b.marks.find(k => (k.type === 'tail' || k.type === 'exit') && Math.hypot(k.x - p.x, k.y - p.y) < 1);
  const swash = capital && m.p.swash > 0 ? swashEnd(b, m, W) : null;
  b.strokes.forEach((st, si) => {
    if (!st.cmds) return;
    const o = st.o, own = o.part === 'tail' || o.part === 'entry';
    for (const which of ['s', 'e'] as const) {
      const serif = m.serif && !o.scale && !!(which === 's' ? o.serifS : o.serifE), type = (which === 's' ? o.s : o.e) || 'flat';
      if (type === 'join') continue;
      if (type === 'term' && m.p.terminalRun === 'straight') {
        const at0 = stretchEnd(st.cmds, which, 0, m), tip = at0 && tipAt(at0.from), r = runStraight(st.cmds, which, !!tip, m);
        if (r) {
          st.cmds = r.cmds;
          if (tip) { tip.x = r.to.x; tip.y = r.to.y; }
          // a hook that finishes its turn can reach past the body
          grow.l = Math.max(grow.l, Math.min(0, r.from.x) - r.to.x);
          grow.r = Math.max(grow.r, r.to.x - Math.max(W, r.from.x));
        }
      }
      const plain = type !== 'term', at = stretchEnd(st.cmds, which, 0, m), sw = swash?.si === si && swash.which === which ? swash : null;
      // (a swash runs on out of the stroke it is buried in, as a P's stem out of the top of its bowl)
      if (plain && (!at || (!sw && buried(si, at.from)))) continue;
      const id = `${plain ? 'p' : ''}${si}${which}`, tip = !plain && at && tipAt(at.from);
      // an end with a serif is drawn plain, whatever its kind
      if (plain || serif) plains.add(id);
      if (!plain && (own || tip || serif)) hooks.add(id);
      if (at) homes.set(id, at.from);
      // a swash end draws on and curls out, unless the letter sets it its own way
      const d = endReach(sw && m.p.terminalEnds?.[id] == null ? sw.len : endLength(m.p, id, plain || serif || own || !!tip)) * m.xh * (o.scale || 1);
      const curl = sw && m.p.terminalCurls?.[id] == null ? sw.curl : endCurl(m.p, id);
      if (Math.abs(d) < 0.01 && curl === 0.5) continue;
      const before = st.cmds, r = shapeEnd(st.cmds, which, d, curl, m, sw && curl === sw.curl ? sw.mid : (mid ??= middle()),
        () => b.strokes.flatMap((t, ti) => ti === si ? [] : t.cmds ? centerPoints(t.cmds, m, m.s * 0.5) : t.poly ? dotPoints(t.poly, m.s * 0.25) : []),
        m.p.terminalCurls?.[id] != null);
      if (!r) continue;
      st.cmds = r.cmds;
      if (plain && type !== 'flat' && curl !== 0.5) st.o = { ...st.o, [which]: 'flat' };
      // and finishes as a stroke end does, in a ball where they have one
      if (sw) st.o = { ...st.o, [which]: 'term' };
      // a serif sits level or plumb, which a curled end no longer runs, so it lets it go
      if (serif && curl !== 0.5) st.o = { ...st.o, [which === 's' ? 'serifS' : 'serifE']: null };
      if (plain && st.o.clip) st.o = { ...st.o, clip: widenClip(st.o.clip, r.from, before, r.cmds, m) };
      if (tip) { tip.x = r.to.x; tip.y = r.to.y; }
      // a curl can swing out further than its tip ends up. A Q's tail runs on under the next letter
      // instead, as in type, so it leaves no gap after the Q
      grow.l = Math.max(grow.l, Math.min(0, r.from.x) - (r.span?.x0 ?? r.to.x));
      if (o.part !== 'tail') grow.r = Math.max(grow.r, (r.span?.x1 ?? r.to.x) - Math.max(W, r.from.x));
    }
  });
  return grow;
}

/** The end a swash capital curls out (see Params.swash): its first free end at the top left, as the
    top of a P's stem or the left end of a T's bar, or else at the bottom left, as the foot of an A;
    none on the right half (a C, an S). With how far it draws on, how far it curls, and the point it
    curls toward. */
function swashEnd(b: Builder, m: Metrics, W: number) {
  const ends: { si: number; which: 's' | 'e'; x: number; y: number; ox: number; oy: number; level: boolean }[] = [];
  b.strokes.forEach((st, si) => {
    if (!st.cmds || st.o.part === 'entry') return;
    for (const which of ['s', 'e'] as const) {
      if ((which === 's' ? st.o.s : st.o.e) === 'join') continue;
      const e = endCmd(st.cmds, which, m);
      if (!e) continue;
      const q = cubicAt(e.P, which === 's' ? e.u0 : e.u1), sg = which === 's' ? -1 : 1;
      if (q.x <= W * 0.5 + 1) ends.push({ si, which, x: q.x, y: q.y, ox: q.tx * sg, oy: q.ty * sg, level: Math.abs(q.ty) < 0.5 });
    }
  });
  const pick = (f: (e: typeof ends[number]) => boolean) => ends.filter(f).sort((a, c) => a.x - c.x)[0];
  const end = pick(e => e.y >= m.cap * 0.85) ?? pick(e => e.y <= m.cap * 0.15);
  if (!end) return null;
  // it curls round toward a point beside it, so it always winds the same way: counterclockwise from
  // the top or a level end (out and down), clockwise from the foot (out and up)
  const k = m.p.swash, ccw = end.level || end.y > m.cap / 2 ? 1 : -1, far = m.cap * 10;
  return { ...end, len: 0.5 + 0.25 * k, curl: 0.5 + 0.3 * k, mid: { x: end.x - end.oy * ccw * far, y: end.y + end.ox * ccw * far } };
}

/** A stroke's clip, given way where the end that sat at `from` now reaches past it: each side of
    the box that end sat at moves out as far as the stroke now reaches further, and a little more. */
function widenClip(clip: ClipBox, from: Pt, before: Cmd[], after: Cmd[], m: Metrics): ClipBox {
  const a = centerPoints(before, m, m.s * 0.5), b = centerPoints(after, m, m.s * 0.5), out = { ...clip }, near = m.s * 1.5;
  const most = (pts: Pt[], k: 'x' | 'y', s: 1 | -1) => Math.max(...pts.map(p => p[k] * s));
  const side = (key: 'x0' | 'x1' | 'y0' | 'y1', k: 'x' | 'y', s: 1 | -1) => {
    const v = out[key], past = most(b, k, s) - most(a, k, s);
    if (v != null && Math.abs(from[k] - v) < near && past > 0.5) out[key] = v + s * (past + m.s * 0.6);
  };
  side('x0', 'x', -1); side('x1', 'x', 1); side('y0', 'y', -1); side('y1', 'y', 1);
  return out;
}

/** A stem's end and the rest of the letter: the sides of the end that face into the letter, and the sides
    its serif is drawn on. */
interface SerifFacing { inward: SerifSides; sides: SerifSides }

/** How each stroke end with a serif at its foot or on top faces the rest of the letter, by stroke index and
    end, for a design whose serifs don't all reach both ways alike (else null). A side faces into the letter
    when more of the letter stands beside it on the same line: the right of an n's first stem, both sides of
    an m's middle one, neither side of an I. */
function faceSerifs(b: Builder, m: Metrics): Map<string, SerifFacing> | null {
  const sf = m.ctx.serif!, keep = sf.sides ?? 'both';
  if (!sf.inner && keep === 'both') return null;
  const facing = new Map<string, SerifFacing>();
  const lines = sf.inner || keep === 'inside' || keep === 'outside' ? b.strokes.map(t => (t.cmds ? centerPoints(t.cmds, m, m.s * 0.25) : [])) : [];
  const band = Math.max(m.xh * 0.2, m.s * 0.75), clear = m.s * 0.6;
  b.strokes.forEach((st, si) => {
    if (!st.cmds || st.o.scale) return;
    for (const which of ['s', 'e'] as const) {
      const given = (which === 's' ? st.o.serifS : st.o.serifE) ?? null, type = (which === 's' ? st.o.s : st.o.e) || 'flat';
      const step = given && type !== 'join' ? stretchEnd(st.cmds, which, -1, m) : null;
      if (!step) continue;
      const { x, y } = step.from, dy = y - step.to.y;
      if (serifPlace({ dx: x - step.to.x, dy, type }) === 'arm') continue;
      // the line the end stands on, and the letter a little way above it (below it, on top of a stroke)
      const y0 = dy > 0 ? y - band : y - 1, y1 = dy > 0 ? y + 1 : y + band;
      let a = false, c = false;
      for (const pts of lines) for (const q of pts) if (q.y >= y0 && q.y <= y1) { if (q.x < x - clear) a = true; else if (q.x > x + clear) c = true; }
      const inward = a && c ? 'both' : a ? 'a' : c ? 'b' : null;
      facing.set(`${si}${which}`, { inward, sides: serifSides(given, keep, inward) });
    }
  });
  return facing;
}

/** Draw every stroke end that carries a cupped serif short by the height of the cup, so the serif can arch
    up under it (or down into it, on top of a stroke), and return how far short of its line each end now
    stops, by stroke index and end. An end whose serif the design leaves off (see faceSerifs) stays as drawn. */
function cupSerifs(b: Builder, m: Metrics, facing: Map<string, SerifFacing> | null): Map<string, number> {
  const cups = new Map<string, number>(), cup = serifCup(m.ctx.serif!);
  b.strokes.forEach((st, si) => {
    if (!st.cmds || st.o.scale) return;
    for (const which of ['s', 'e'] as const) {
      const type = (which === 's' ? st.o.s : st.o.e) || 'flat';
      if (!(which === 's' ? st.o.serifS : st.o.serifE) || type === 'join' || facing?.get(`${si}${which}`)?.sides === null) continue;
      // which way the end runs, from a small step back along it
      const step = stretchEnd(st.cmds, which, -1, m);
      if (!step) continue;
      const dx = step.to.x - step.from.x, dy = step.to.y - step.from.y, l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      // the serifs at the foot and on top of strokes are cupped; one across the end of an arm stays flat
      if (serifPlace({ dx: -dx, dy: -dy, type }) === 'arm') continue;
      const r = stretchEnd(st.cmds, which, -cup / Math.max(0.35, Math.abs(dy) / l), m);
      if (!r) continue;
      st.cmds = r.cmds;
      cups.set(`${si}${which}`, Math.abs(r.to.y - r.from.y));
    }
  });
  return cups;
}

/** How much heavier stroke `si` is drawn than the design draws it: by its own weight, if its letter gives it one. */
function strokeWt(m: Metrics, si: number) {
  const v = m.p.strokeWeights?.[si];
  return v == null ? 1 : weightScale(v);
}

function buildGlyph(ch: string, m: Metrics): Glyph | null {
  const def = GLYPHS[ch];
  if (!def) return null;
  const b = new Builder(m);
  const hooks = new Set<string>(), plains = new Set<string>(), homes = new Map<string, Pt>(), W0 = def.fn(b, m);
  if (m.p.bowlForm === 'box') boxQuarters(b, m);
  weighFillets(b, m);
  markTurns(b, m);
  const grow = stretchTerminals(b, m, W0, hooks, plains, homes, /^[A-Z]$/.test(ch)), W = W0 + grow.r;
  const facing = m.ctx.serif ? faceSerifs(b, m) : null;
  const cups = m.ctx.serif?.cup ? cupSerifs(b, m, facing) : null;
  const code = ch.charCodeAt(0);
  let ctx = m.ctx;
  if (m.wob > 0) {
    const wb = wobbler(code, m);
    for (const st of b.strokes) {
      if (st.cmds) st.cmds = wb.cmds(st.cmds);
      if (st.poly) st.poly = st.poly.map(q => { const [x, y] = wb.pt(q.x, q.y); return { ...q, x, y }; });
    }
    b.counters = b.counters.map(pts => pts.map(q => { const [x, y] = wb.pt(q.x, q.y); return { x, y }; }));
    b.marks.forEach(k => { [k.x, k.y] = wb.pt(k.x, k.y); });
    homes.forEach((q, id) => { const [x, y] = wb.pt(q.x, q.y); homes.set(id, { x, y }); });
    ctx = { ...ctx, wobble: m.wob, seed: hash(code, 5) * 2 * Math.PI };
  }
  const out = {
    ch, strokes: [] as GlyphStroke[], serifs: [] as Cmd[][], serifAt: [] as SerifPlace[], counters: [] as Cmd[][], marks: b.marks.slice(),
    corners: [] as Pt[], skeleton: [] as Pt[][], meta: def.meta, bodyW: W
  };
  const wind = (pts: Pt[], sign: number) => ((signedArea(pts) < 0) !== (sign < 0) ? pts.slice().reverse() : pts);
  const finish = (pts: Pt[], sign: number, R: number, cornersOut?: Pt[]) => {
    if (pts.length < 3) return null;
    return roundContour(wind(pts, sign), R, cornersOut);
  };
  // the corners a stencil cuts are the points that weren't on the stroke as drawn
  const cutRound = (pts: Pt[], drawn: Set<Pt>, w: number) => roundCuts(pts, q => !!q.sharp && !drawn.has(q), m.gapRound, w);
  // expand every stroke first: a stencil cut needs to know which stroke each join runs into
  const exps = b.strokes.map((st, si) => {
    if (st.poly) return null;
    const o = st.o;
    const serifS = m.serif && !!o.serifS && !o.scale, serifE = m.serif && !!o.serifE && !o.scale;
    const so = { ...o };
    if (serifS && so.s === 'term') so.s = 'flat';
    if (serifE && so.e === 'term') so.e = 'flat';
    const f = strokeWt(m, si), pen = f === 1 ? ctx : { ...ctx, thick: ctx.thick * f, thin: ctx.thin * f };
    return { ex: expandStroke(st.cmds!, so, pen), serifS, serifE, so, pen };
  });
  const expanded = exps.map(x => x?.ex ?? null);
  // each stroke clipped once, here, so the corners its clip leaves (the top left of an N, where the
  // diagonal is cut off at the stem) are the ones rounded, and drawn so (clipping again is a no-op)
  const clipMade = new Set<Pt>();
  b.strokes.forEach((st, si) => {
    const ex = exps[si]?.ex;
    if (!ex || ex.loop || !st.o.clip) return;
    const own = new Set(ex.contours[0]);
    ex.contours[0] = clipPoly(ex.contours[0], st.o.clip);
    for (const p of ex.contours[0]) if (!own.has(p)) clipMade.add(p);
  });
  endCorners(b, m, exps, out.marks, clipMade);
  for (const poly of joinCorners(b, m, exps, out.marks)) b.strokes.push({ poly, o: { part: 'fillet' } });
  // stencil every stroke first, so a fillet rounding a join (a square-joined bowl into its stem)
  // goes when the stencil cuts that join, like the fillets Roundness adds: there is no join left to round
  const outlines = b.strokes.map((st, si) => st.poly ?? exps[si]?.ex?.contours[0] ?? null);
  // every join is marked, so the letter can open each on its own, with the gap it has as drawn
  // (on its own Gap scale) and the way the gap opens
  // (on its own Gap scale) and the way the gap opens; and so is every turn, which Stencil leaves whole
  const opened = (m.p.barGap > 0 && m.p.barEnds !== 'through') || Object.values(m.p.joinGaps ?? {}).some(v => v > 0);
  const turns = b.strokes.map((st, si) => (st.cmds && exps[si]?.ex && !exps[si]!.ex!.loop ? turnsOf(st.cmds, m).map((tn, k) => ({ ...tn, id: `${si}t${k}` })) : []));
  b.strokes.forEach((st, si) => {
    const ex = exps[si]?.ex;
    if (!ex || ex.loop || st.poly) return;
    const joins = strokeJoins(si, expanded), opens = stencilOpens(joins), contour = st.o.clip ? clipPoly(ex.contours[0], st.o.clip) : ex.contours[0];
    for (const jn of joins) {
      // a join only where enough of its stroke reaches out of the one it meets to pull back (not the
      // short arm of a heavy z, all but buried in the diagonal)
      if (stencilPieces(contour, [stencilCut(ex, jn, m.s * 0.1, true, isBar(st.o.part))], 0, m.s, Math.min(...ex.thickness), []).off === null) continue;
      const { v } = gapOf(m, jn.id, isBar(st.o.part), opens.has(jn.id));
      out.marks.push({ type: 'join', x: jn.x, y: jn.y, id: jn.id, v, dx: jn.nx, dy: jn.ny });
    }
    for (const tn of turns[si]) {
      const { nx, ny } = turnKeep(tn);
      out.marks.push({ type: 'join', x: tn.x, y: tn.y, id: tn.id, v: m.p.joinGaps?.[tn.id] ?? 0, dx: nx, dy: ny });
    }
  });
  const through = barsThrough(b, expanded, m);
  const stencilled = b.strokes.map((st, si) => {
    const ex = exps[si]?.ex;
    if (!(m.gap || opened) || !ex || ex.loop || through?.bars.has(si)) return null;
    const contour = st.o.clip ? clipPoly(ex.contours[0], st.o.clip) : ex.contours[0], t = Math.min(...ex.thickness);
    const cuts = stencilCuts(si, expanded, m, isBar(st.o.part)), others = outlines.map((q, j) => (j === si || b.strokes[j].o.part === 'fillet' ? null : q));
    const open = turns[si].flatMap(tn => { const v = m.p.joinGaps?.[tn.id] ?? 0; return v > 0 ? [{ ...tn, gap: joinGap(v, m.s) }] : []; });
    const tp = open.length ? turnPieces(st.cmds!, exps[si]!.so, exps[si]!.pen, open, cuts, m, t, others) : null;
    if (tp) return { drawn: tp.drawn, cuts, pieces: tp.pieces, off: 0 };
    return { drawn: new Set(contour), cuts, ...stencilPieces(contour, cuts, m.gapOff, m.s, t, others) };
  });
  const filletCut = (poly: Pt[]) => {
    // a bar run through the strokes it met no longer meets them: no join left to round
    if (through?.at.some(j => poly.some(q => Math.hypot(q.x - j.x, q.y - j.y) < m.s))) return true;
    for (const sc of stencilled) {
      if (sc && sc.off !== null && sc.cuts.some(cut => poly.some(q => Math.hypot(q.x - cut.x, q.y - cut.y) < m.s))) return true;
    }
    return false;
  };
  let leanL = 0, leanR = 0;
  b.strokes.forEach((st, si) => {
    const o = st.o; let cmds: Cmd[] = [];
    if (st.poly) {
      if (!(o.part === 'fillet' && filletCut(st.poly))) { const c = finish(st.poly, 1, 0); if (c) cmds = c; }
      out.strokes.push({ part: o.part || 'dot', cmds, curved: false, dot: (o.part || 'dot') === 'dot' });
      return;
    }
    const { ex, serifS, serifE } = exps[si]!;
    if (!ex) return;
    const R = m.R * (o.scale || 1) * strokeWt(m, si);
    if (ex.loop) {
      const [a, c] = ex.contours;
      const outerIsA = Math.abs(signedArea(a)) >= Math.abs(signedArea(c));
      const outer = outerIsA ? a : c, inner = outerIsA ? c : a;
      // a stencilled ring is split down the middle into two halves
      let xl = Infinity, xr = -Infinity;
      for (const q of outer) { xl = Math.min(xl, q.x); xr = Math.max(xr, q.x); }
      // as wide as the gaps at its joins, but at most leaving each half half its side's width, so a heavy ring isn't cut away
      let il = Infinity, ir = -Infinity;
      for (const q of inner) { il = Math.min(il, q.x); ir = Math.max(ir, q.x); }
      const cx = (xl + xr) / 2, g = m.gap && m.gap / joinGap(1, m.s) * Math.min(joinGap(1, m.s), (xr - xl + ir - il) / 2);
      if (g) {
        // each half is cut as one piece of ink, the hole with the ring, so its cut corners round the ink
        const ring = [wind(outer, 1), wind(inner, -1)], drawn = new Set(ring.flat()), w = m.s * (o.scale || 1) * strokeWt(m, si);
        for (const pl of [{ x: cx - g / 2, y: 0, nx: 1, ny: 0 }, { x: cx + g / 2, y: 0, nx: -1, ny: 0 }]) {
          for (const q of splitPoly(ring, pl)) { const c = finish(cutRound(q, drawn, w), signedArea(q) < 0 ? -1 : 1, 0); if (c) cmds = cmds.concat(c); }
        }
      } else {
        const o1 = finish(outer, 1, 0), i1 = finish(inner, -1, 0);
        if (o1) cmds = cmds.concat(o1);
        if (i1) cmds = cmds.concat(i1);
      }
      const hole = finish(inner, -1, 0);
      if (o.counter !== false && hole) out.counters.push(hole);
    } else {
      let pieces = [ex.contours[0]];
      if (o.clip) pieces = [clipPoly(pieces[0], o.clip)];
      const sc = stencilled[si];
      if (sc) {
        const drawn = sc.drawn;
        pieces = sc.pieces.map(q => cutRound(q, drawn, m.s * (o.scale || 1) * strokeWt(m, si)));
      }
      const bar = through?.bars.get(si);
      if (bar) pieces = [bar];
      for (const [y0, y1] of through?.bands.get(si) ?? []) {
        // a wide gap leaves no sliver of the stroke past it (the foot of an A's leg)
        const cut = pieces.flatMap(q => [...splitPoly([q], { x: 0, y: y1, nx: 0, ny: -1 }), ...splitPoly([q], { x: 0, y: y0, nx: 0, ny: 1 })]);
        pieces = cut.filter(q => Math.max(...q.map(p => p.y)) - Math.min(...q.map(p => p.y)) >= m.s * 0.35);
      }
      for (const q of pieces) { const c = finish(q, 1, R, out.corners); if (c) cmds = cmds.concat(c); }
      if (o.counter) out.counters.push(finish(ex.skeleton.flat(), 1, 0) || []);
    }
    out.strokes.push({ part: o.part || 'stroke', cmds, curved: ex.curved, horizontal: isHorizontal(st.cmds!), id: String(si) });
    ex.skeleton.forEach(r => out.skeleton.push(r));
    for (const end of ex.ends) {
      // an end pulled back from the stroke it lies in leaves its serif behind with it
      const want = (end.which === 's' ? serifS : serifE) && !(stencilled[si]?.off != null && stencilled[si]!.cuts.some(c => c.own && Math.hypot(c.x - end.x, c.y - end.y) < 1));
      if (want) {
        const key = `${si}${end.which}`, face = facing?.get(key), sides = face ? face.sides : (end.which === 's' ? o.serifS : o.serifE) ?? null;
        const sp = sides && buildSerif(end, sides, ctx, o.serifScale, cups?.get(key), face?.inward);
        const c = sp && finish(sp, 1, m.R * 0.5); if (c) { out.serifs.push(c); out.serifAt.push(serifPlace(end)); }
        // a serif leaning out past the end of its arm takes the room it reaches into from the side bearing
        if (sp && ctx.serif!.armLean && serifPlace(end) === 'arm') {
          const dir = Math.sign(end.dx), past = Math.max(0, ...sp.map(q => (q.x - end.x) * dir));
          if (dir < 0) leanL = Math.max(leanL, past - end.x); else leanR = Math.max(leanR, end.x + past - W);
        }
      }
      const term = `${si}${end.which}`, id = plains.has(term) ? term : `p${term}`;
      if (!want && end.type === 'term') {
        const home = homes.get(term);
        out.marks.push({ type: 'terminal', x: end.x, y: end.y, r: end.t * 0.5, id: term, ...(hooks.has(term) && { hook: true }), ...(home && { home }) });
      } else if (plains.has(id)) {
        // a plain or serifed end keeps where it is drawn unless it has a length of its own, like a hook's tip
        const home = homes.get(id);
        out.marks.push({ type: 'end', x: end.x, y: end.y, r: end.t * 0.5, id, hook: true, ...(home && { home }) });
      }
    }
  });
  b.counters.forEach(pts => { const c = finish(pts, 1, 0); if (c) out.counters.push(c); });

  // cursive strokes that reach past the body get most of the room they need, so they
  // touch the neighbouring letter instead of running through it
  const padL = Math.max(0, -b.reachL - m.sb * 1.3), padR = Math.max(0, b.reachR - W - m.sb * 1.3);
  const sbf = b.sb ?? def.sb;
  return placeGlyph(out, W, m.sb * sbf[0] + padL + grow.l + leanL, m.sb * sbf[1] + padR + leanR, code, m);
}

type Unplaced = Omit<Glyph, 'lsb' | 'rsb' | 'adv' | 'M' | 'cmds' | 'd'>;

/** A block letter (see blocks.ts): its outlines rounded corner by corner, Roundness rounding the outer
    corners and the ends of arms and slots, Joins the small rounds inside, then placed like any glyph.
    A lowercase letter is its capital, drawn as a small capital at the x-height. Null when the
    character has no block shape. */
function buildBlock(ch: string, m: Metrics): Glyph | null {
  const e = m.p, small = ch !== ch.toUpperCase();
  const b = blockRings(ch, blockDims(small ? m.xh : m.cap, e), { o: e.roundness, e: Math.min(1, e.roundness), i: Math.min(2, e.joinRound * 2) });
  if (!b) return null;
  const code = ch.charCodeAt(0);
  let rings = b.rings;
  if (m.wob > 0) {
    const wb = wobbler(code, m);
    rings = rings.map(r => r.map(q => { const [x, y] = wb.pt(q.x, q.y); return { ...q, x, y }; }));
  }
  // blocks sit close: at the middle of Side margins a thirtieth of the cap height each side
  const sb = m.cap * (0.004 + 0.06 * e.sideBearing);
  const out: Unplaced = {
    ch, strokes: [{ part: 'stem', cmds: rings.flatMap(r => roundContour(r, 0)), curved: true, id: '0' }], serifs: [], serifAt: [],
    counters: rings.slice(rings.length - b.holes).map(r => roundContour(r, 0)), marks: [], corners: [], skeleton: [], meta: {}, bodyW: b.W
  };
  return placeGlyph(out, b.W, sb, sb, code, m);
}

/** Place a glyph drawn `W` wide between side bearings lsb and rsb: rotation, monospacing, the pixel grid,
    playful bounce and hand jitter, slant, then the slice and the fills, which run on its final outline. */
function placeGlyph(out: Unplaced, W: number, lsb: number, rsb: number, code: number, m: Metrics): Glyph {
  const turn = m.rot ? turnAbout(out, m.rot) : null;
  if (turn) { lsb += turn.grow; rsb += turn.grow; }
  // mirrored, the letter's margins change sides with it
  const flip = m.p.mirror === 'mirrored';
  if (flip) [lsb, rsb] = [rsb, lsb];
  let sx = 1, adv = Math.max(10, lsb + W + rsb);
  const mono = m.p.mono;
  if (mono > 0) {
    // wide letters are squeezed a little, narrow ones centred in the shared width
    const T = m.monoAdv;
    sx = lerp(1, clamp(T * 0.94 / adv, 0.62, 1), mono);
    adv = lerp(adv, T, mono);
    lsb = lerp(lsb, (adv - W * sx) / 2, mono);
    rsb = adv - lsb - W * sx;
  }
  if (m.cell && m.p.fill !== 'lines') {
    // pixels and dots: whole cells, with the letter centred in its cells
    const snapped = Math.max(m.cell, Math.round(adv / m.cell) * m.cell);
    lsb += (snapped - adv) / 2; rsb += (snapped - adv) / 2; adv = snapped;
  }
  let M: Mat = flip ? [-sx, 0, 0, 1, lsb + W * sx, 0] : [sx, 0, 0, 1, lsb, 0];
  if (turn) M = mulM(M, turn.M);
  const bounce = m.p.bounce, wob = m.wob;
  if (bounce > 0 || wob > 0) {
    const a = (hash(code, 1) - 0.5) * 2 * (0.11 * bounce + 0.05 * wob);
    const dy = (hash(code, 2) - 0.5) * 2 * (38 * bounce + 18 * wob);
    const k = 1 + (hash(code, 3) - 0.5) * 0.1 * wob;
    const cx = adv / 2, cy = m.xh / 2, c = Math.cos(a) * k, s = Math.sin(a) * k;
    M = mulM([c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy + dy], M);
  }
  if (m.slant) M = mulM([1, 0, m.slant, 1, -m.slant * m.xh * 0.4, 0], M);
  const tf = (c: Cmd[]) => transformCmds(c, M);
  const tp = <T extends Pt>(p: T): T => { const q = applyM(M, p.x, p.y); return { ...p, x: q[0], y: q[1] }; };
  out.strokes.forEach(s => s.cmds = tf(s.cmds));
  const serifs = out.serifs.map(tf);
  let cmds = [...out.strokes.flatMap(s => s.cmds), ...serifs.flat()];
  if (m.sliceH) cmds = slice(cmds, m.sliceY - m.sliceH / 2, m.sliceY + m.sliceH / 2, m.sliceRound, m.s, m.s * 0.35);
  if (m.p.fill !== 'solid') {
    cmds = fillOutline(cmds, { fill: m.p.fill, cell: m.cell, line: lerp(6, 48, m.p.module), roundness: m.p.roundness });
  }
  return {
    ...out, serifs, counters: out.counters.map(tf),
    marks: out.marks.map(k => k.home ? { ...tp(k), home: tp(k.home) } : tp(k)), corners: out.corners.map(tp), skeleton: out.skeleton.map(r => r.map(tp)),
    lsb, rsb, adv, M, cmds, d: cmdsToD(cmds)
  };
}

/** Turning a letter `a` radians clockwise about the middle of its ink, and how much wider (or, negative,
    narrower) the turned ink is on each side, so it keeps the gaps to its neighbours it had upright. */
function turnAbout(out: Unplaced, a: number): { M: Mat; grow: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of [...out.strokes.flatMap(s => s.cmds), ...out.serifs.flat()]) {
    for (let i = 1; i < c.length; i += 2) {
      x0 = Math.min(x0, c[i]); x1 = Math.max(x1, c[i]); y0 = Math.min(y0, c[i + 1]); y1 = Math.max(y1, c[i + 1]);
    }
  }
  if (x0 > x1) return null;
  const cos = Math.cos(a), sin = Math.sin(a), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0;
  return {
    M: [cos, -sin, sin, cos, cx - cos * cx - sin * cy, cy + sin * cx - cos * cy],
    grow: (Math.abs(w * cos) + Math.abs(h * sin) - w) / 2
  };
}

/** A letter drawn by hand: its outline as it is, with no parts for the controls to find. */
function drawnGlyph(ch: string, drawn: Drawn): Glyph {
  const cmds = drawnCmds(drawn.contours);
  return {
    ch, strokes: [{ part: 'drawn', cmds, curved: false }], serifs: [], serifAt: [], counters: [], marks: [], corners: [], skeleton: [], meta: {},
    bodyW: drawn.adv, lsb: 0, rsb: 0, adv: drawn.adv, M: [1, 0, 0, 1, 0, 0], cmds, d: cmdsToD(cmds)
  };
}

/* ---- highlight layers: which part of a glyph does a parameter touch? */
export const RING_KEYS: Record<string, true> = { terminal: true, aperture: true, apex: true, roundness: true, cursive: true, overlap: true, tail: true };

function highlightD(g: Glyph, key: string, m: Metrics): string {
  const strokes = (f: (s: GlyphStroke) => boolean | undefined) => g.strokes.filter(f).map(s => cmdsToD(s.cmds)).join('');
  switch (key) {
    case 'weight': return strokes(s => s.part === 'stem' || s.part === 'diagonal');
    case 'contrast': return strokes(s => s.horizontal || s.part === 'crossbar' || s.part === 'arm');
    case 'counter': return g.counters.map(cmdsToD).join('');
    case 'curve': return strokes(s => s.curved);
    case 'crossbar': return strokes(s => s.part === 'crossbar' || s.part === 'bar');
    case 'serif': case 'serifTip': case 'serifBase': return g.serifs.map(cmdsToD).join('');
    case 'serifBalance': case 'serifSides': case 'serifInner': return g.serifs.filter((_, i) => g.serifAt[i] !== 'arm').map(cmdsToD).join('');
    case 'serifTops': return g.serifs.filter((_, i) => g.serifAt[i] === 'top').map(cmdsToD).join('');
    case 'serifArms': case 'serifArmThickness': case 'serifArmLean': return g.serifs.filter((_, i) => g.serifAt[i] === 'arm').map(cmdsToD).join('');
    case 'terminal': case 'aperture': return ringsD(g.marks.filter(k => k.type === 'terminal'), Math.max(26, m.s * 0.62));
    case 'apex': return ringsD(g.marks.filter(k => k.type === 'apex' || k.type === 'vertex'), Math.max(30, m.s * 0.7));
    case 'roundness': return ringsD(g.marks.filter(k => k.type === 'corner'), Math.max(16, m.s * 0.3));
    case 'cursive': return ringsD(g.marks.filter(k => k.type === 'exit' || k.type === 'entry'), Math.max(30, m.s * 0.7));
    case 'story': return g.ch === 'a' ? g.d : '';
    case 'gForm': return g.ch === 'g' ? g.d : '';
    case 'sForm': return /[sS$]/.test(g.ch) ? strokes(s => s.part === 'spine') : '';
    case 'kForm': return g.ch === 'k' || g.ch === 'K' ? strokes(s => s.part === 'arm' || s.part === 'leg') : '';
    case 'iForm': return /[IJil]/.test(g.ch) ? g.d : '';
    case 'diagonals': return /[AVWvw]/.test(g.ch) ? g.d : '';
    case 'yForm': return /[Yy]/.test(g.ch) ? g.d : '';
    case 'qForm': return g.ch === 'Q' ? g.d : '';
    case 'rForm': return g.ch === 'R' ? g.d : '';
    case 'bowlForm': return strokes(s => s.curved);
    case 'bends': return /[AMNVWYZvwyz]/.test(g.ch) ? g.d : '';
    case 'bowlJoin': return /[abdgpq]/.test(g.ch) ? strokes(s => s.part === 'bowl') : /[hmnru]/.test(g.ch) ? strokes(s => s.part === 'shoulder') : '';
    case 'dots': return strokes(s => !!s.dot);
    case 'overlap': return ringsD(g.marks.filter(k => k.type === 'overlap'), Math.max(30, m.s * 0.8));
    case 'tail': return ringsD(g.marks.filter(k => k.type === 'tail'), Math.max(30, m.s * 0.7));
    default: return '';
  }
}

export function buildFont(params: Params): Font {
  const e = resolve(params), m = metrics(e);
  const cache = new Map<string, Glyph | null>(), hlCache = new Map<string, string>(), letters = new Map<string, Font>();
  const font: Font = {
    params, eff: e, m,
    letter(ch) {
      const own = params.glyphs?.[ch];
      if (!own) return font;
      let f = letters.get(ch);
      if (!f) { f = buildFont({ ...params, ...own, glyphs: {} }); letters.set(ch, f); }
      return f;
    },
    glyph(ch) {
      let g = cache.get(ch);
      if (g === undefined) {
        const lf = font.letter(ch), drawn = params.outlines?.[ch];
        if (drawn) g = drawnGlyph(ch, drawn);
        else if (lf !== font) g = lf.glyph(ch);
        else if (e.build === 'blocks' && (g = buildBlock(ch, m))) g.ch = ch;
        else {
          const alt = ch === 'a' && e.singleStory ? 'a.alt' : e.cursive >= 0.35 && hasGlyph(ch + '.cur') ? ch + '.cur' : ch;
          g = buildGlyph(alt, m);
          if (g) g.ch = ch;
        }
        cache.set(ch, g);
      }
      return g;
    },
    hl(ch, key) {
      const id = ch + '\u0000' + key;
      let d = hlCache.get(id);
      if (d === undefined) {
        const g = font.glyph(ch);
        d = g ? highlightD(g, key, font.letter(ch).m) : '';
        hlCache.set(id, d);
      }
      return d;
    },
    advance(ch) {
      if (ch === ' ' || ch === ' ') return m.space;
      const g = font.glyph(ch); return g ? g.adv : m.space * 1.4;
    },
    layout(text, maxWidth) {
      const lines: Line[] = [];
      for (const para of text.split('\n')) {
        let line: LineItem[] = [], x = 0, lastBreak = -1;
        const flush = (upto?: number) => {
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
            if (lastBreak >= 0) flush(lastBreak);
            else { const it = line.pop()!; flush(); it.x = 0; line = [it]; x = it.adv + m.track; }
          }
        }
        flush();
      }
      return lines;
    }
  };
  return font;
}
