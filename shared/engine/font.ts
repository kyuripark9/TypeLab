/* Font engine.
   params (what the user edits, all 0..1) -> resolve() -> metrics -> glyph skeletons
   -> expanded outlines. Pure math with no DOM, so the browser (live preview) and the
   server (font export) run exactly the same code. A full rebuild of every glyph takes a
   few milliseconds, so sliders can drive it directly. */
import { DEFAULTS, endCurl, endLength, endReach, type Params } from '../params';
import { applyM, clamp, clipPoly, cmdsToD, cubicAt, lerp, lerpP, mulM, quarter, ringsD, roundContour, signedArea, subCubic, transformCmds } from './geom';
import { fillOutline, slice } from './effects';
import { autoThickness, buildSerif, expandStroke, type Expanded } from './stroke';
import type { Cmd, HalfPlane, Mark, Mat, PenCtx, Pt, StrokeOpts, Tangent } from './types';

export const CHARSET = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789', punct: '.,!?;:\'"()-/&@#$%+'
} as const;
export const ALL_CHARS = CHARSET.upper + CHARSET.lower + CHARSET.digits + CHARSET.punct;

/** Parameters after the personality macros have been applied, plus derived switches. */
export interface Effective extends Params {
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
  bar: number; apex: number; ap: number; cnt: number;
  serif: boolean;
  ctx: PenCtx;
  /** thickness of a stroke running in direction (dx, dy) */ tDir: (dx: number, dy: number) => number;
  /** thickness of a horizontal stroke */ hT: number;
  /** body width for a base design width. cls: 'r' round, 'c' classically narrow */ W: (base: number, cls?: 'r' | 'c') => number;
  sb: number; track: number; space: number; slant: number; R: number; dotRound: number;
  qpt: (x0: number, y0: number, x1: number, y1: number, mode: string, u: number) => Tangent;
}

export interface GlyphMeta { parts?: string[]; params?: string[] }
export type GlyphFn = (g: Builder, m: Metrics) => number;
interface GlyphDef { ch: string; sb: [number, number]; fn: GlyphFn; meta: GlyphMeta }

export interface GlyphStroke { part: string; cmds: Cmd[]; curved: boolean; horizontal?: boolean; dot?: boolean }

export interface Glyph {
  ch: string;
  strokes: GlyphStroke[];
  serifs: Cmd[][];
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
  e.curve = clamp(e.curve + 0.45 * gh);
  e.aperture = clamp(e.aperture + 0.3 * gh - 0.3 * future);
  e.contrast = clamp(e.contrast + 0.08 * human + 0.25 * classic + 0.1 * formal - 0.05 * future);
  e.roundness = clamp(e.roundness - 0.7 * ss + 0.15 * playful);
  e.apex = clamp(e.apex - 0.5 * ss);
  e.xHeight = clamp(e.xHeight + 0.18 * cf + 0.12 * playful);
  e.width = clamp(e.width + 0.1 * future - 0.07 * formal);
  e.letterSpacing = clamp(e.letterSpacing + 0.04 * formal);
  e.square = clamp(0.85 * future + e.squareness);
  e.classic = classic;
  e.bounce = playful;
  // italic and script hands use the single-storey a (unless one is picked) and hold the pen at a steeper angle
  e.singleStory = e.story === 'auto' ? gh < -0.3 || e.cursive >= 0.35 : e.story === 'single';
  e.stressDeg = e.curve * 10 + human * 9 + classic * 7 + e.cursive * 14;
  return e;
}

function metrics(e: Effective): Metrics {
  const s = 18 + 200 * Math.pow(e.weight, 1.25);
  const cap = lerp(560, 840, e.height);
  const xh = cap * lerp(0.5, 0.86, e.xHeight);
  const ws = e.width < 0.5 ? lerp(0.6, 1, e.width * 2) : lerp(1, 1.5, (e.width - 0.5) * 2);
  const ratio = 1 - 0.08 - 0.84 * e.contrast;
  const thin = Math.max(8, Math.min(s * ratio, xh * 0.2));
  const stress = e.stressDeg * Math.PI / 180;
  const k = 0.5523 + 0.05 * e.curve + 0.36 * e.square;
  const org = e.curve;
  const ctx: PenCtx = {
    thick: s, thin, stress, k, org, terminal: e.terminal, chamfer: e.chamfer, joints: e.joints, reverse: e.reverse,
    serif: e.serif ? {
      len: lerp(28, 175, e.serifSize) * (0.75 + 0.25 * ws),
      th: lerp(8, 95, e.serifThickness) * ({ unbracketed: 0.6, slab: 1.5, wedge: 1, bracketed: 1 }[e.serifShape] || 1),
      shape: e.serifShape, angle: e.serifAngle
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
  const sliceH = e.slice > 0 ? lerp(4, xh * 0.14, e.slice) : 0;
  return {
    p: e, s, cap, xh,
    asc: Math.max(xh * 1.12, Math.max(cap * 1.05, xh * 1.18) + (e.extenders - 0.5) * cap * 0.5),
    desc: -cap * 0.3 * lerp(0.55, 1.45, e.extenders),
    os: cap * 0.014,
    ws, thin, stress, k, org, sq: e.square, cur: e.cursive, wob: e.wobble, monoAdv: W(500) + sb * 1.5,
    cell, gap: e.stencil > 0 ? e.stencil * (12 + s * 0.55) : 0, sliceY: xh * 0.5, sliceH,
    bar: e.crossbar, apex: e.apex, ap: e.aperture, cnt,
    serif: !!e.serif,
    ctx, tDir, hT: tDir(1, 0), W,
    sb,
    track: snap((e.letterSpacing - 0.2) * 260),
    space: Math.max(snap(lerp(W(210) + (e.wordSpacing - 0.35) * 520, W(500) + sb * 1.5, e.mono)), cell),
    slant: Math.tan(e.slant * 20 * Math.PI / 180),
    R: e.roundness * s * 0.5,
    dotRound: Math.max(e.roundness, e.terminal === 'round' ? 1 : 0),
    qpt: (x0, y0, x1, y1, mode, u) => {
      const kk = clamp(k * (1 + ((x1 - x0) * (y1 - y0) < 0 ? 0.13 : -0.09) * org), 0.3, 0.97);
      return cubicAt(quarter(x0, y0, x1, y1, mode, kk), u);
    }
  };
}

interface RawStroke { cmds?: Cmd[]; poly?: Pt[]; o: StrokeOpts }

/** Glyph builder handed to each glyph function. */
export class Builder {
  strokes: RawStroke[] = [];
  counters: Pt[][] = [];
  marks: Mark[] = [];
  /** how far cursive strokes reach past the body on the left (as a negative x) and right */
  reachL = 0; reachR = 0;
  constructor(public m: Metrics) {}
  path(cmds: Cmd[], o?: StrokeOpts) { this.strokes.push({ cmds, o: o || {} }); return this; }
  line(x0: number, y0: number, x1: number, y1: number, o?: StrokeOpts) { return this.path([['M', x0, y0], ['L', x1, y1]], o); }
  stem(x: number, y0: number, y1: number, o?: StrokeOpts) { return this.line(x, y0, x, y1, { part: 'stem', ...o }); }
  dot(cx: number, cy: number, size: number, part?: string) {
    const h = size / 2, r = h * this.m.dotRound;
    this.strokes.push({ poly: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]].map(p => ({ x: p[0], y: p[1], r })), o: { part: part || 'dot' } });
    return this;
  }
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
   the two. The cut runs parallel to the host at the point where the join lands. When two
   strokes end in each other (the waist of a 3), only the later one is cut. */
interface Host { score: number; j: number; px: number; py: number; tx: number; ty: number; half: number; atEnd: boolean }
function stencilCuts(i: number, exps: (Expanded | null)[], gap: number): HalfPlane[] {
  const ex = exps[i]!, own = ex.skeleton.flat(), planes: HalfPlane[] = [];
  const cx = own.reduce((a, q) => a + q.x, 0) / own.length, cy = own.reduce((a, q) => a + q.y, 0) / own.length;
  for (const end of ex.ends) {
    if (end.type !== 'join') continue;
    let best: Host | null = null;
    for (let j = 0; j < exps.length; j++) {
      const h = exps[j];
      if (!h || j === i) continue;
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
    if (bj.atEnd && bj.j > i && exps[bj.j]!.ends.some(e => e.type === 'join' && Math.hypot(e.x - end.x, e.y - end.y) < 1)) continue;
    let nx = -bj.ty, ny = bj.tx;
    const side = (cx - bj.px) * nx + (cy - bj.py) * ny;
    if (Math.abs(side) < 1) continue;
    if (side < 0) { nx = -nx; ny = -ny; }
    const off = bj.half + gap;
    planes.push({ x: bj.px + nx * off, y: bj.py + ny * off, nx: -nx, ny: -ny });
  }
  return planes;
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
const quarterK = (cur: Pt, c: Cmd, m: Metrics) => clamp(m.k * (1 + ((c[1] - cur.x) * (c[2] - cur.y) < 0 ? 0.13 : -0.09) * m.org), 0.3, 0.97);

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
   the tip, up to CURL_TURNS times round; it draws the end out as far as it needs for that, up to
   CURL_LONGEST x-heights, and never turns tighter at the tip than CURL_TIGHT of the stroke width.
   Its length changes as with stretchEnd, and any length past what the curl takes first draws
   the end on along its own path, carrying the curl further out.
   A curl keeps CURL_CLEAR of the stroke width clear of the rest of the letter (centerline to
   centerline). Where it would run into another stroke it draws the end on first, up to
   CURL_LEAD x-heights, winds less and smaller, or, when the length drawn on first is what runs
   into the letter, gives some of that up, whichever changes it least (see CURL_TRIES). */
const CURL_REACH = 0.45, CURL_TURNS = 1.25, CURL_LONGEST = 2.2, CURL_TIGHT = 0.7, CURL_CLEAR = 1.6;
/** How much of the lower half of Curl a curved end takes to straighten. */
const CURL_UNBEND = 0.3;
/** The ways a crowded curl can give way, as [how much further on it starts, in x-heights; its
    size; how much of the length drawn on before it it keeps], cheapest first. */
const CURL_LEAD = 0.6;
const CURL_TRIES = [1, 0.5, 0].flatMap(g => [0, 0.1, 0.2, 0.3, 0.45, CURL_LEAD].flatMap(x => [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.15, 0.08].map(f => [x, f, g])))
  .map(t => ({ t, cost: t[0] * 2 + 1 - t[1] + (1 - t[2]) * 0.5 })).sort((p, q) => p.cost - q.cost).map(({ t }) => t).slice(1);

function shapeEnd(cmds: Cmd[], which: 's' | 'e', d: number, curl: number, m: Metrics, mid: Pt, crowd: () => Pt[]): { cmds: Cmd[]; from: Pt; to: Pt; span?: { x0: number; x1: number } } | null {
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
  // tightest at the tip: 2 * turn / length there
  const rTip = Math.max(m.s * CURL_TIGHT, m.xh * 0.08);
  // the curl takes the stretch redrawn, or as long as it needs; any length past that comes first
  const Ls = Math.min(2 * amount * CURL_TURNS * 2 * Math.PI * rTip, m.xh * CURL_LONGEST), Lc = Math.min(Math.max(Sn, Ls), Math.max(S0, Ls));
  const turn0 = (k2 >= 0 ? way : -way) * Math.min(amount * CURL_TURNS * 2 * Math.PI, Lc / (2 * rTip));
  const M = 192;
  // the curl at `f` of its size, keeping `g` of the length drawn on before it, and starting
  // `lead` further on
  const draw = (lead: number, f: number, g: number) => {
    const Lq = Lc * f, turn = turn0 * f, L0 = Math.max(0, Sn - Lq) * g + lead, h = (L0 + Lq) / M;
    const angle = (s: number) => lerp(drawn(s), ang[0], straighten) + turn * (Math.max(0, s - L0) / Lq) ** 2;
    const pts: Pt[] = [{ x: J.x, y: J.y }];
    for (let k = 1; k <= M; k++) { const t = angle(h * (k - 0.5)), p = pts[k - 1]; pts.push({ x: p.x + Math.cos(t) * h, y: p.y + Math.sin(t) * h }); }
    return { angle, pts, h };
  };
  // the rest of the letter on a grid, each point with how near the curl may come: CURL_CLEAR,
  // or less where the end as drawn already comes nearer (where it leaves the stroke, or across a
  // narrow opening)
  const clear = m.s * CURL_CLEAR, key = (x: number, y: number) => Math.floor(x / clear) * 65536 + Math.floor(y / clear);
  const nOwn = Math.ceil(S0 / clear * 3), own = Array.from({ length: nOwn + 1 }, (_, k) => at(S0 * k / nOwn));
  const grid = new Map<number, { x: number; y: number; r: number }[]>();
  for (const q of crowd()) {
    const r = Math.min(clear, 0.85 * Math.min(...own.map(p => Math.hypot(p.x - q.x, p.y - q.y))));
    if (r < m.s * 0.5) continue;
    const k = key(q.x, q.y), g = { x: q.x, y: q.y, r };
    grid.get(k)?.push(g) ?? grid.set(k, [g]);
  }
  const hits = (pts: Pt[], most = Infinity) => {
    let n = 0;
    for (let k = 2; k <= M && n < most; k += 2) {
      const p = pts[k];
      near: for (const dx of [-clear, 0, clear]) for (const dy of [-clear, 0, clear]) {
        for (const q of grid.get(key(p.x + dx, p.y + dy)) ?? []) if (Math.hypot(p.x - q.x, p.y - q.y) < q.r) { n++; break near; }
      }
    }
    return n;
  };
  let best = draw(0, 1, 1), fewest = grid.size ? hits(best.pts) : 0;
  for (const [x, f, g] of CURL_TRIES) {
    if (!fewest) break;
    const r = draw(x * m.xh, f, g), n = hits(r.pts, fewest);
    if (n < fewest) { best = r; fewest = n; }
  }
  const { angle, pts, h } = best;
  // back to béziers, an eighth of a turn at most each
  const pieces: Pt[][] = [];
  for (let i0 = 0, k = 1; k <= M; k++) {
    if (k < M && Math.abs(angle(h * k) - angle(h * i0)) < Math.PI / 4) continue;
    const A = pts[i0], B = pts[k], ta = angle(h * i0), tb = angle(h * k), L = h * (k - i0), dt = Math.abs(tb - ta);
    const hl = dt < 1e-4 ? L / 3 : (4 / 3) * Math.tan(dt / 4) * L / dt;
    pieces.push([A, { x: A.x + Math.cos(ta) * hl, y: A.y + Math.sin(ta) * hl }, { x: B.x - Math.cos(tb) * hl, y: B.y - Math.sin(tb) * hl }, B]);
    i0 = k;
  }
  const xs = pts.map(p => p.x), span = { x0: Math.min(...xs), x1: Math.max(...xs) };
  const uJ = uAt(which === 'e' ? b - S0 : a + S0), w = o.w != null ? { w: o.w } : {}, to = pts[M], out = cmds.slice();
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

/** Stretch or trim every styled terminal of a glyph (body width W) by the stroke end length, or
    by the length set for that one end, and curl the ends given a curl of their own. Ends with a
    serif keep theirs. Tails, hooks and cursive strokes are left to their own controls, so their
    tips move only by a length set for that one end, measured from where their own control puts
    them (0.5).
    Notes the ids of those tips in `hooks`, where each end sat before its own length and curl in
    `homes`, and returns how far the ends now reach past the body on the left and right, to widen
    it by. */
function stretchTerminals(b: Builder, m: Metrics, W: number, hooks: Set<string>, homes: Map<string, Pt>) {
  const grow = { l: 0, r: 0 };
  let mid: Pt | null = null;
  const middle = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const st of b.strokes) for (const c of st.cmds ?? []) if (typeof c[1] === 'number') { x0 = Math.min(x0, c[1]); x1 = Math.max(x1, c[1]); y0 = Math.min(y0, c[2]); y1 = Math.max(y1, c[2]); }
    return x0 <= x1 ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : { x: W / 2, y: m.xh / 2 };
  };
  const tipAt = (p: Pt) => b.marks.find(k => (k.type === 'tail' || k.type === 'exit') && Math.hypot(k.x - p.x, k.y - p.y) < 1);
  b.strokes.forEach((st, si) => {
    if (!st.cmds) return;
    const o = st.o, own = o.part === 'tail' || o.part === 'entry';
    for (const which of ['s', 'e'] as const) {
      const serif = m.serif && !o.scale && !!(which === 's' ? o.serifS : o.serifE);
      if ((which === 's' ? o.s : o.e) !== 'term' || serif) continue;
      const id = `${si}${which}`, at = stretchEnd(st.cmds, which, 0, m), tip = at && tipAt(at.from);
      if (own || tip) hooks.add(id);
      if (at) homes.set(id, at.from);
      const d = endReach(endLength(m.p, id, own || !!tip)) * m.xh * (o.scale || 1), curl = endCurl(m.p, id);
      if (Math.abs(d) < 0.01 && curl === 0.5) continue;
      const r = shapeEnd(st.cmds, which, d, curl, m, mid ??= middle(),
        () => b.strokes.flatMap(t => t.cmds ? centerPoints(t.cmds, m, m.s * 0.5) : t.poly ?? []));
      if (!r) continue;
      st.cmds = r.cmds;
      if (tip) { tip.x = r.to.x; tip.y = r.to.y; }
      // a curl can swing out further than its tip ends up
      grow.l = Math.max(grow.l, Math.min(0, r.from.x) - (r.span?.x0 ?? r.to.x));
      grow.r = Math.max(grow.r, (r.span?.x1 ?? r.to.x) - Math.max(W, r.from.x));
    }
  });
  return grow;
}

function buildGlyph(ch: string, m: Metrics): Glyph | null {
  const def = GLYPHS[ch];
  if (!def) return null;
  const b = new Builder(m);
  const hooks = new Set<string>(), homes = new Map<string, Pt>(), W0 = def.fn(b, m), grow = stretchTerminals(b, m, W0, hooks, homes), W = W0 + grow.r;
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
    ch, strokes: [] as GlyphStroke[], serifs: [] as Cmd[][], counters: [] as Cmd[][], marks: b.marks.slice(),
    corners: [] as Pt[], skeleton: [] as Pt[][], meta: def.meta, bodyW: W
  };
  const finish = (pts: Pt[], sign: number, R: number, cornersOut?: Pt[]) => {
    if (pts.length < 3) return null;
    if ((signedArea(pts) < 0) !== (sign < 0)) pts = pts.slice().reverse();
    return roundContour(pts, R, cornersOut);
  };
  // expand every stroke first: a stencil cut needs to know which stroke each join runs into
  const exps = b.strokes.map(st => {
    if (st.poly) return null;
    const o = st.o;
    const serifS = m.serif && !!o.serifS && !o.scale, serifE = m.serif && !!o.serifE && !o.scale;
    const so = { ...o };
    if (serifS && so.s === 'term') so.s = 'flat';
    if (serifE && so.e === 'term') so.e = 'flat';
    return { ex: expandStroke(st.cmds!, so, ctx), serifS, serifE };
  });
  const expanded = exps.map(x => x?.ex ?? null);
  b.strokes.forEach((st, si) => {
    const o = st.o; let cmds: Cmd[] = [];
    if (st.poly) {
      const c = finish(st.poly, 1, 0); if (c) cmds = c;
      out.strokes.push({ part: o.part || 'dot', cmds, curved: false, dot: true });
      return;
    }
    const { ex, serifS, serifE } = exps[si]!;
    if (!ex) return;
    const R = m.R * (o.scale || 1);
    if (ex.loop) {
      const [a, c] = ex.contours;
      const outerIsA = Math.abs(signedArea(a)) >= Math.abs(signedArea(c));
      const outer = outerIsA ? a : c, inner = outerIsA ? c : a;
      // a stencilled ring is split down the middle into two halves
      let xl = Infinity, xr = -Infinity;
      for (const q of outer) { xl = Math.min(xl, q.x); xr = Math.max(xr, q.x); }
      const cx = (xl + xr) / 2, g = m.gap;
      const halves: HalfPlane[][] = g ? [[{ x: cx - g / 2, y: 0, nx: 1, ny: 0 }], [{ x: cx + g / 2, y: 0, nx: -1, ny: 0 }]] : [[]];
      for (const planes of halves) {
        const o1 = finish(planes.length ? clipPoly(outer, { planes }) : outer, 1, 0);
        const i1 = finish(planes.length ? clipPoly(inner, { planes }) : inner, -1, 0);
        if (o1) cmds = cmds.concat(o1);
        if (i1) cmds = cmds.concat(i1);
      }
      const hole = finish(inner, -1, 0);
      if (o.counter !== false && hole) out.counters.push(hole);
    } else {
      let pts = ex.contours[0];
      if (o.clip) pts = clipPoly(pts, o.clip);
      if (m.gap) { const planes = stencilCuts(si, expanded, m.gap); if (planes.length) pts = clipPoly(pts, { planes }); }
      const c = finish(pts, 1, R, out.corners); if (c) cmds = c;
      if (o.counter) out.counters.push(finish(ex.skeleton.flat(), 1, 0) || []);
    }
    out.strokes.push({ part: o.part || 'stroke', cmds, curved: ex.curved, horizontal: isHorizontal(st.cmds!) });
    ex.skeleton.forEach(r => out.skeleton.push(r));
    for (const end of ex.ends) {
      const want = end.which === 's' ? serifS : serifE;
      if (want) {
        const sp = buildSerif(end, (end.which === 's' ? o.serifS : o.serifE) ?? null, ctx, o.serifScale);
        const c = sp && finish(sp, 1, m.R * 0.5); if (c) out.serifs.push(c);
      } else if (end.type === 'term') {
        const id = `${si}${end.which}`;
        const home = homes.get(id);
        out.marks.push({ type: 'terminal', x: end.x, y: end.y, r: end.t * 0.5, id, ...(hooks.has(id) && { hook: true }), ...(home && { home }) });
      }
    }
  });
  b.counters.forEach(pts => { const c = finish(pts, 1, 0); if (c) out.counters.push(c); });

  // place: side bearings, monospacing, playful bounce and hand jitter, slant.
  // cursive strokes that reach past the body get most of the room they need, so they
  // touch the neighbouring letter instead of running through it
  const padL = Math.max(0, -b.reachL - m.sb * 1.3), padR = Math.max(0, b.reachR - W - m.sb * 1.3);
  let lsb = m.sb * def.sb[0] + padL + grow.l, rsb = m.sb * def.sb[1] + padR, sx = 1;
  let adv = Math.max(10, lsb + W + rsb);
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
  let M: Mat = [sx, 0, 0, 1, lsb, 0];
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
  if (m.sliceH) cmds = slice(cmds, m.sliceY - m.sliceH / 2, m.sliceY + m.sliceH / 2, m.R);
  if (m.p.fill !== 'solid') {
    cmds = fillOutline(cmds, { fill: m.p.fill, cell: m.cell, line: lerp(6, 48, m.p.module), roundness: m.p.roundness });
  }
  return {
    ...out, serifs, counters: out.counters.map(tf),
    marks: out.marks.map(k => k.home ? { ...tp(k), home: tp(k.home) } : tp(k)), corners: out.corners.map(tp), skeleton: out.skeleton.map(r => r.map(tp)),
    lsb, rsb, adv, M, cmds, d: cmdsToD(cmds)
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
    case 'serif': return g.serifs.map(cmdsToD).join('');
    case 'terminal': case 'aperture': return ringsD(g.marks.filter(k => k.type === 'terminal'), Math.max(26, m.s * 0.62));
    case 'apex': return ringsD(g.marks.filter(k => k.type === 'apex' || k.type === 'vertex'), Math.max(30, m.s * 0.7));
    case 'roundness': return ringsD(g.corners, Math.max(16, m.s * 0.3));
    case 'cursive': return ringsD(g.marks.filter(k => k.type === 'exit' || k.type === 'entry'), Math.max(30, m.s * 0.7));
    case 'story': return g.ch === 'a' ? g.d : '';
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
        const lf = font.letter(ch);
        if (lf !== font) g = lf.glyph(ch);
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
