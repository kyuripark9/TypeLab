/* Font engine.
   params (what the user edits, all 0..1) -> resolve() -> metrics -> glyph skeletons
   -> expanded outlines. Pure math with no DOM, so the browser (live preview) and the
   server (font export) run exactly the same code. A full rebuild of every glyph takes a
   few milliseconds, so sliders can drive it directly. */
import { DEFAULTS, type Params } from '../params';
import { applyM, clamp, clipPoly, cmdsToD, cubicAt, lerp, mulM, quarter, ringsD, roundContour, signedArea, transformCmds } from './geom';
import { autoThickness, buildSerif, expandStroke } from './stroke';
import type { Cmd, Mark, Mat, PenCtx, Pt, StrokeOpts, Tangent } from './types';

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
  e.square = 0.85 * future;
  e.classic = classic;
  e.bounce = playful;
  e.singleStory = gh < -0.3;
  e.stressDeg = e.curve * 10 + human * 9 + classic * 7;
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
    thick: s, thin, stress, k, org, terminal: e.terminal,
    serif: e.serif ? {
      len: lerp(28, 175, e.serifSize) * (0.75 + 0.25 * ws),
      th: lerp(8, 95, e.serifThickness) * ({ unbracketed: 0.6, slab: 1.5, wedge: 1, bracketed: 1 }[e.serifShape] || 1),
      shape: e.serifShape, angle: e.serifAngle
    } : null
  };
  const tDir = (dx: number, dy: number) => { const l = Math.hypot(dx, dy) || 1; return autoThickness(dx / l, dy / l, ctx, s, thin); };
  const cnt = (e.counter - 0.5) * 2;
  /* body width: base is drawn for a regular weight at normal width.
     cls: 'r' letters built around a counter, 'c' classically narrow caps, 'n' normal */
  const W = (base: number, cls?: 'r' | 'c') => {
    let w = base * ws;
    w *= 1 + (cls === 'r' ? 0.22 : 0.06) * cnt;
    if (cls === 'c') w *= 1 - 0.13 * e.classic;
    if (cls === 'r') w *= 1 + 0.05 * e.classic;
    return w + (s - 80) * 0.62;
  };
  return {
    p: e, s, cap, xh,
    asc: Math.max(cap * 1.05, xh * 1.18),
    desc: -cap * 0.3,
    os: cap * 0.014,
    ws, thin, stress, k, org, sq: e.square,
    bar: e.crossbar, apex: e.apex, ap: e.aperture, cnt,
    serif: !!e.serif,
    ctx, tDir, hT: tDir(1, 0), W,
    sb: Math.max(14, 64 * (0.65 + 0.35 * ws) - (s - 80) * 0.12 + (e.sideBearing - 0.5) * 130 + (ctx.serif ? ctx.serif.len * 0.3 : 0)),
    track: (e.letterSpacing - 0.2) * 260,
    space: W(210) + (e.wordSpacing - 0.35) * 520,
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

function isHorizontal(cmds: Cmd[]) {
  if (cmds.length !== 2 || cmds[1][0] !== 'L') return false;
  return Math.abs(cmds[1][2] - cmds[0][2]) < Math.abs(cmds[1][1] - cmds[0][1]) * 0.2;
}

function buildGlyph(ch: string, m: Metrics): Glyph | null {
  const def = GLYPHS[ch];
  if (!def) return null;
  const b = new Builder(m);
  const W = def.fn(b, m);
  const out = {
    ch, strokes: [] as GlyphStroke[], serifs: [] as Cmd[][], counters: [] as Cmd[][], marks: b.marks.slice(),
    corners: [] as Pt[], skeleton: [] as Pt[][], meta: def.meta, bodyW: W
  };
  const finish = (pts: Pt[], sign: number, R: number, cornersOut?: Pt[]) => {
    if (pts.length < 3) return null;
    if ((signedArea(pts) < 0) !== (sign < 0)) pts = pts.slice().reverse();
    return roundContour(pts, R, cornersOut);
  };
  for (const st of b.strokes) {
    const o = st.o; let cmds: Cmd[] = [];
    if (st.poly) {
      const c = finish(st.poly, 1, 0); if (c) cmds = c;
      out.strokes.push({ part: o.part || 'dot', cmds, curved: false, dot: true });
      continue;
    }
    const serifS = m.serif && !!o.serifS && !o.scale, serifE = m.serif && !!o.serifE && !o.scale;
    const so = { ...o };
    if (serifS && so.s === 'term') so.s = 'flat';
    if (serifE && so.e === 'term') so.e = 'flat';
    const ex = expandStroke(st.cmds!, so, m.ctx);
    if (!ex) continue;
    const R = m.R * (o.scale || 1);
    if (ex.loop) {
      const [a, c] = ex.contours;
      const outerIsA = Math.abs(signedArea(a)) >= Math.abs(signedArea(c));
      const o1 = finish(outerIsA ? a : c, 1, 0), i1 = finish(outerIsA ? c : a, -1, 0);
      if (o1) cmds = cmds.concat(o1);
      if (i1) cmds = cmds.concat(i1);
      if (o.counter !== false && i1) out.counters.push(i1);
    } else {
      let pts = ex.contours[0];
      if (o.clip) pts = clipPoly(pts, o.clip);
      const c = finish(pts, 1, R, out.corners); if (c) cmds = c;
      if (o.counter) out.counters.push(finish(ex.skeleton.flat(), 1, 0) || []);
    }
    out.strokes.push({ part: o.part || 'stroke', cmds, curved: ex.curved, horizontal: isHorizontal(st.cmds!) });
    ex.skeleton.forEach(r => out.skeleton.push(r));
    for (const end of ex.ends) {
      const want = end.which === 's' ? serifS : serifE;
      if (want) {
        const sp = buildSerif(end, (end.which === 's' ? o.serifS : o.serifE) ?? null, m.ctx, o.serifScale);
        const c = sp && finish(sp, 1, m.R * 0.5); if (c) out.serifs.push(c);
      } else if (end.type === 'term') out.marks.push({ type: 'terminal', x: end.x, y: end.y, r: end.t * 0.5 });
    }
  }
  b.counters.forEach(pts => { const c = finish(pts, 1, 0); if (c) out.counters.push(c); });

  // place: side bearings, playful bounce, slant
  const lsb = m.sb * def.sb[0], rsb = m.sb * def.sb[1];
  const adv = Math.max(10, lsb + W + rsb);
  let M: Mat = [1, 0, 0, 1, lsb, 0];
  if (m.p.bounce > 0) {
    const code = ch.charCodeAt(0), a = (hash(code, 1) - 0.5) * 2 * 0.11 * m.p.bounce, dy = (hash(code, 2) - 0.5) * 2 * 38 * m.p.bounce;
    const cx = adv / 2, cy = m.xh / 2, c = Math.cos(a), s = Math.sin(a);
    M = mulM([c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy + dy], M);
  }
  if (m.slant) M = mulM([1, 0, m.slant, 1, -m.slant * m.xh * 0.4, 0], M);
  const tf = (c: Cmd[]) => transformCmds(c, M);
  const tp = <T extends Pt>(p: T): T => { const q = applyM(M, p.x, p.y); return { ...p, x: q[0], y: q[1] }; };
  out.strokes.forEach(s => s.cmds = tf(s.cmds));
  const serifs = out.serifs.map(tf);
  const cmds = [...out.strokes.flatMap(s => s.cmds), ...serifs.flat()];
  return {
    ...out, serifs, counters: out.counters.map(tf),
    marks: out.marks.map(tp), corners: out.corners.map(tp), skeleton: out.skeleton.map(r => r.map(tp)),
    lsb, rsb, adv, M, cmds, d: cmdsToD(cmds)
  };
}

/* ---- highlight layers: which part of a glyph does a parameter touch? */
export const RING_KEYS: Record<string, true> = { terminal: true, aperture: true, apex: true, roundness: true };

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
    default: return '';
  }
}

export function buildFont(params: Params): Font {
  const e = resolve(params), m = metrics(e);
  const cache = new Map<string, Glyph | null>(), hlCache = new Map<string, string>();
  const font: Font = {
    params, eff: e, m,
    glyph(ch) {
      let g = cache.get(ch);
      if (g === undefined) {
        g = buildGlyph(ch === 'a' && e.singleStory ? 'a.alt' : ch, m);
        if (g) g.ch = ch;
        cache.set(ch, g);
      }
      return g;
    },
    hl(ch, key) {
      const id = ch + '\u0000' + key;
      let d = hlCache.get(id);
      if (d === undefined) {
        const g = font.glyph(ch);
        d = g ? highlightD(g, key, m) : '';
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
