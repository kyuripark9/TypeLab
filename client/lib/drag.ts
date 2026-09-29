/* Dragging the parts of the inspected letter. Every part is driven by one parameter, and dragging
   it finds the value that puts the grabbed thing under the pointer: a guide line or crossbar moves
   to the pointer, a stroke, counter or serif grows toward it. Like the sliders, a drag reshapes
   every letter at once, since the design is the parameters. */
import { buildFont, clamp, type Cmd, type Font, type Glyph, type Mark } from '../../shared/engine';
import { ANATOMY } from '../../shared/content';
import { endLength, type NumericParam, type Params } from '../../shared/params';

export type Axis = 'x' | 'y';

/** How pointer travel along one axis drives one parameter. */
export interface Drive {
  key: NumericParam;
  /** a length or position (font units) read from a font built with a trial value; null if missing */
  measure?: (f: Font) => number | null;
  /** how much the measure changes per unit of travel: 2 when a shape grows on both sides at once */
  gain?: number;
  /** -1 when travel toward -axis should grow the measure (grabbing the left or bottom side) */
  sign: 1 | -1;
  /** without a measure (or when it barely moves): font units of travel for the whole 0..1 range */
  span?: number;
  /** where to draw its grab handle (font units, y up): the edge or line that moves */
  at: { x: number; y: number };
  /** set only this one stroke end's length (key 'terminalLength'), not every end's, or with
      `endKey` 'corners' only this one corner's roundness (key 'roundness'), or with 'strokeWeights'
      only this one stroke's weight (key 'weight') */
  end?: string;
  endKey?: 'corners' | 'strokeWeights';
  /** that corner's roundness (or stroke's weight) as drawn before it has one of its own */
  base?: number;
  /** that end is the tip of a hook, tail or cursive stroke (see endLength) */
  hook?: boolean;
}
export type DragSpec = Partial<Record<Axis, Drive>>;

/** The value a drive moves, and the params with it set. */
export const driveValue = (d: Drive, p: Params) =>
  d.endKey ? p[d.endKey][d.end!] ?? d.base ?? 0 : d.end ? endLength(p, d.end, d.hook) : p[d.key];
export const withDrive = (d: Drive, p: Params, v: number): Params =>
  d.endKey ? { ...p, [d.endKey]: { ...p[d.endKey], [d.end!]: v } } : d.end ? { ...p, terminalEnds: { ...p.terminalEnds, [d.end]: v } } : { ...p, [d.key]: v };

/** A letter's stroke ends, top to bottom, each named by where it sits: "Top end", "Bottom left end". */
export interface StrokeEndInfo { id: string; x: number; y: number; label: string; hook: boolean }
export function strokeEnds(g: Glyph): StrokeEndInfo[] {
  // named and ordered by where each end sits before its own length and curl, so dragging one
  // doesn't reshuffle them
  return byPlace(g, g.marks.filter(k => (k.type === 'terminal' || k.type === 'end') && k.id), 'end').map(({ k, label }) => ({ id: k.id!, x: k.x, y: k.y, label, hook: !!k.hook }));
}

/** A letter's corners, top to bottom, each named by where it sits: "Top left corner", with its
    roundness as drawn: a turn's outside, and its inside in `vi` (the corners of an end have none). */
export interface CornerInfo { id: string; x: number; y: number; label: string; v: number; vi?: number; st?: number }
export function letterCorners(g: Glyph): CornerInfo[] {
  return byPlace(g, g.marks.filter(k => k.type === 'corner' && k.id), 'corner').map(({ k, label }) => ({ id: k.id!, x: k.x, y: k.y, label, v: k.v ?? 0, ...(k.vi != null ? { vi: k.vi } : {}), ...(k.st != null ? { st: k.st } : {}) }));
}

/** A letter's strokes (not its dots), each named by its part, and by where it sits when the letter
    has more than one of that part: "Stem", "Left stem", "Top arm". */
export interface StrokeInfo { id: string; label: string }
export function letterStrokes(g: Glyph): StrokeInfo[] {
  const out = g.strokes.flatMap(s => {
    const b = s.id && !s.dot ? bbox(s.cmds) : null;
    return b ? [{ id: s.id!, noun: ANATOMY[s.part]?.[0] ?? 'Stroke', x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }] : [];
  });
  return out.map(s => {
    const same = out.filter(t => t.noun === s.noun);
    if (same.length === 1) return { id: s.id, label: s.noun };
    const xs = same.map(t => t.x), ys = same.map(t => t.y), n = s.noun.toLowerCase();
    const across = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
    const at = across ? xs : ys, v = across ? s.x : s.y, lo = Math.min(...at), hi = Math.max(...at);
    const where = v <= lo + 1 ? (across ? 'Left' : 'Bottom') : v >= hi - 1 ? (across ? 'Right' : 'Top') : 'Middle';
    const twins = same.filter(t => (across ? t.x : t.y) === v).length > 1 || (where === 'Middle' && same.length > 3);
    return { id: s.id, label: twins ? `${s.noun} ${same.indexOf(s) + 1}` : `${where} ${n}` };
  });
}

/** Marks top to bottom (then left to right), each named by where it sits before it was moved: its
    third of the letter's height, then its side when two share a height, then a number. */
function byPlace(g: Glyph, ks: Mark[], noun: string): { k: Mark; label: string }[] {
  if (!ks.length) return [];
  const b = bbox(g.cmds) ?? { x0: 0, x1: g.adv, y0: 0, y1: 1 }, w = b.x1 - b.x0 || 1, h = b.y1 - b.y0 || 1;
  const v = (y: number) => ((y - b.y0) / h > 0.62 ? 'Top' : (y - b.y0) / h < 0.38 ? 'Bottom' : 'Middle');
  const hz = (x: number) => ((x - b.x0) / w < 0.5 ? 'left' : 'right');
  const home = (k: Mark) => k.home ?? k;
  const out = ks.map(k => ({ k, label: v(home(k).y) })).sort((a, c) => home(c.k).y - home(a.k).y || home(a.k).x - home(c.k).x);
  const tally = () => { const n: Record<string, number> = {}; out.forEach(e => { n[e.label] = (n[e.label] ?? 0) + 1; }); return n; };
  let n = tally();
  out.forEach(e => { if (n[e.label] > 1) e.label += ` ${hz(home(e.k).x)}`; });
  n = tally();
  const seen: Record<string, number> = {};
  return out.map(e => { seen[e.label] = (seen[e.label] ?? 0) + 1; return { k: e.k, label: `${e.label} ${noun}${n[e.label] > 1 ? ` ${seen[e.label]}` : ''}` }; });
}

interface Box { x0: number; y0: number; x1: number; y1: number }

function bbox(cmds: Cmd[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cmds) {
    for (let i = 1; i + 1 < c.length && typeof c[i] === 'number'; i += 2) {
      x0 = Math.min(x0, c[i]); x1 = Math.max(x1, c[i]);
      y0 = Math.min(y0, c[i + 1]); y1 = Math.max(y1, c[i + 1]);
    }
  }
  return x0 <= x1 ? { x0, y0, x1, y1 } : null;
}

/** The separate shapes of a part: each stroke, counter or serif. */
function pieces(g: Glyph, part: string): Cmd[][] {
  if (part === 'counter') return g.counters;
  if (part === 'serif') return g.serifs;
  return g.strokes.filter(s => s.part === part).map(s => s.cmds);
}

/** Index of the piece under (or nearest) the grab point; the smaller one wins where they overlap. */
function nearest(boxes: (Box | null)[], p: { x: number; y: number }): number {
  let best = -1, bd = Infinity;
  boxes.forEach((b, i) => {
    if (!b) return;
    const d = Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1));
    const score = d * 1e6 + (b.x1 - b.x0) * (b.y1 - b.y0);
    if (score < bd) { bd = score; best = i; }
  });
  return best;
}

const side = (v: number, mid: number): 1 | -1 => (v < mid ? -1 : 1);

/** What dragging `part` of `ch` does, grabbed at `grab` (font units, y up). Null if it can't be dragged. */
export function dragSpec(part: string, font: Font, ch: string, grab: { x: number; y: number }, oneEnd = false): DragSpec | null {
  const g = font.glyph(ch);
  if (!g) return null;
  switch (part) {
    case 'xHeight': return { y: { key: 'xHeight', sign: 1, measure: f => f.m.xh, at: { x: grab.x, y: font.m.xh } } };
    case 'capHeight': return { y: { key: 'height', sign: 1, measure: f => f.m.cap, at: { x: grab.x, y: font.m.cap } } };
    case 'ascender': return { y: { key: 'extenders', sign: 1, measure: f => f.m.asc, at: { x: grab.x, y: font.m.asc } } };
    case 'descender': return { y: { key: 'extenders', sign: 1, measure: f => f.m.desc, at: { x: grab.x, y: font.m.desc } } };
    case 'advance': return { x: { key: 'width', sign: 1, measure: f => f.glyph(ch)?.adv ?? null, at: { x: g.adv, y: grab.y } } };
    case 'apex': case 'vertex': {
      const marks = g.marks.filter(k => k.type === part);
      const k = marks[nearest(marks.map(k => ({ x0: k.x, x1: k.x, y0: k.y, y1: k.y })), grab)];
      return k ? { x: { key: 'apex', sign: side(grab.x, k.x), span: 500, at: { x: k.x, y: k.y } } } : null;
    }
    case 'entry': return { x: { key: 'cursive', sign: -1, span: 600, at: grab } };
    case 'corner': {
      // pulled in toward the middle of the letter a corner rounds off, pushed out it sharpens; while
      // customizing a letter each corner goes its own way, else Roundness rounds them all, or Joins
      // the inside corners where strokes meet
      const marks = g.marks.filter(k => k.type === 'corner'), k = marks[nearest(marks.map(k => ({ x0: k.x, x1: k.x, y0: k.y, y1: k.y })), grab)];
      const b = bbox(g.cmds);
      if (!k || !b) return null;
      const d: Omit<Drive, 'sign'> = oneEnd ? { key: 'roundness', end: k.id, endKey: 'corners', base: k.v, span: 260, at: { x: k.x, y: k.y } }
        : { key: k.id?.includes('j') ? 'joinRound' : 'roundness', span: 260, at: { x: k.x, y: k.y } };
      return { x: { ...d, sign: k.x < (b.x0 + b.x1) / 2 ? 1 : -1 }, y: { ...d, sign: k.y < (b.y0 + b.y1) / 2 ? 1 : -1 } };
    }
    case 'tail': case 'terminal': {
      // the tip of a tail, hook or stroke end follows the pointer along the axis it grows on most
      // while customizing a letter, a stroke end moves on its own
      const key = part === 'tail' ? 'tail' : 'terminalLength';
      const tips = (f: Font) => f.glyph(ch)?.marks.filter(k => k.type === part) ?? [];
      const marks = tips(font), i = nearest(marks.map(k => ({ x0: k.x, x1: k.x, y0: k.y, y1: k.y })), grab), k = marks[i];
      if (!k) return null;
      const end = oneEnd && part === 'terminal' ? k.id : undefined;
      const tip = (f: Font) => (end ? tips(f).find(t => t.id === end) : tips(f)[i]);
      const d0: Drive = { key, end, hook: end ? k.hook : undefined, sign: 1, at: { x: k.x, y: k.y } };
      const lo = tip(buildFont(withDrive(d0, font.params, 0))), hi = tip(buildFont(withDrive(d0, font.params, 1)));
      const axis: Axis = !lo || !hi || Math.abs(hi.x - lo.x) >= Math.abs(hi.y - lo.y) ? 'x' : 'y';
      return { [axis]: { ...d0, measure: (f: Font) => tip(f)?.[axis] ?? null } };
    }
    case 'baseline': return null;
  }

  const boxes = pieces(g, part).map(bbox), i = nearest(boxes, grab), b = boxes[i];
  if (!b) return null;
  const piece = (f: Font) => { const pg = f.glyph(ch); return pg ? bbox(pieces(pg, part)[i] ?? []) : null; };
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, w = b.x1 - b.x0, h = b.y1 - b.y0;
  const sx = side(grab.x, cx), sy = side(grab.y, cy), ex = sx > 0 ? b.x1 : b.x0, ey = sy > 0 ? b.y1 : b.y0;

  if (part === 'crossbar' || part === 'bar') {
    return { y: { key: 'crossbar', sign: 1, measure: f => { const p = piece(f); return p && (p.y0 + p.y1) / 2; }, at: { x: grab.x, y: cy } } };
  }
  if (part === 'counter') {
    return { x: { key: 'counter', sign: sx, gain: 2, measure: f => { const p = piece(f); return p && p.x1 - p.x0; }, at: { x: ex, y: grab.y } } };
  }
  if (part === 'serif') {
    // a serif's free edge faces away from the letter: up for a foot serif, down for one on top
    const gb = bbox(g.cmds), foot = !gb || cy < (gb.y0 + gb.y1) / 2;
    return {
      x: { key: 'serifSize', sign: sx, gain: 2, measure: f => { const p = piece(f); return p && p.x1 - p.x0; }, at: { x: ex, y: cy } },
      y: { key: 'serifThickness', sign: foot ? 1 : -1, measure: f => { const p = piece(f); return p && p.y1 - p.y0; }, at: { x: cx, y: foot ? b.y1 : b.y0 } }
    };
  }
  // every other part is a stroke, and dragging it outward makes the letters heavier: a tall
  // stroke by its side, a flat one by its top or bottom, a round one by the side it was grabbed on.
  // While customizing a letter, only the stroke grabbed gets heavier
  const spec: DragSpec = {}, byX = Math.abs(grab.x - cx) / (w || 1) >= Math.abs(grab.y - cy) / (h || 1);
  const id = oneEnd ? g.strokes.filter(s => s.part === part)[i]?.id : undefined;
  const own = (f: Font) => { const s = f.glyph(ch)?.strokes.find(t => t.id === id); return s ? bbox(s.cmds) : null; };
  const one = id ? { end: id, endKey: 'strokeWeights' as const, base: 0.5 } : {};
  if (h > w * 0.6 && (w <= h * 0.6 || byX)) {
    spec.x = { key: 'weight', ...one, sign: sx, gain: 2, measure: id ? f => { const p = own(f); return p && p.x1 - p.x0; } : f => f.m.s, at: { x: ex, y: clamp(grab.y, b.y0, b.y1) } };
  }
  if (w > h * 0.6 && (h <= w * 0.6 || !byX)) {
    spec.y = { key: 'weight', ...one, sign: sy, gain: 2, measure: id ? f => { const p = own(f); return p && p.y1 - p.y0; } : f => f.m.hT, at: { x: clamp(grab.x, b.x0, b.x1), y: ey } };
  }
  return spec;
}

/** The pointer direction along the drive's axis (+1 right or up) that raises its value. */
export function towardMore(d: Drive, base: Params): 1 | -1 {
  if (!d.measure) return d.sign;
  const v = driveValue(d, base), at = (x: number) => d.measure!(buildFont(withDrive(d, base, clamp(x))));
  const a = at(v - 0.03), b = at(v + 0.03);
  if (a == null || b == null || Math.abs(b - a) < 1e-6) return d.sign;
  return (b - a) * d.sign * (d.gain ?? 1) > 0 ? 1 : -1;
}

/** Guide lines whose handles sit just left of the letter, and the drag that sets the width. */
const LINES = ['xHeight', 'capHeight', 'ascender', 'descender', 'advance'];

/**
 * Grab handles for every place on the letter that drives `key`, so pointing at a slider can show
 * where the same change can be dragged. `parts` are the letter's anatomy parts and visible guides.
 */
export interface Handle { part: string; axis: Axis; x: number; y: number }
export function handlesFor(key: NumericParam, font: Font, ch: string, parts: string[]): Handle[] {
  const g = font.glyph(ch);
  if (!g) return [];
  const out: Handle[] = [];
  const add = (part: string, grab: { x: number; y: number }) => {
    const spec = dragSpec(part, font, ch, grab);
    const axis = (['x', 'y'] as const).find(a => spec?.[a]?.key === key);
    if (axis) out.push({ part, axis, ...spec![axis]!.at });
  };
  for (const part of parts) {
    if (LINES.includes(part)) add(part, { x: -70, y: font.m.cap / 2 });
    else if (part === 'apex' || part === 'vertex') g.marks.filter(k => k.type === part).forEach(k => add(part, { x: k.x + 1, y: k.y }));
    else if (part === 'tail' || part === 'terminal' || part === 'corner') g.marks.filter(k => k.type === part).forEach(k => add(part, k));
    else if (part === 'entry') g.strokes.filter(s => s.part === part).forEach(s => { const b = bbox(s.cmds); if (b) add(part, { x: b.x0, y: (b.y0 + b.y1) / 2 }); });
    else pieces(g, part).forEach(c => { const b = bbox(c); if (b) add(part, { x: b.x1, y: (b.y0 + b.y1) / 2 + (b.y1 - b.y0) * 0.1 }); });
  }
  return out.slice(0, 6);
}

/** The axis a drag follows once it has moved: the one it moves along most, if the part allows it. */
export function pickAxis(spec: DragSpec, dx: number, dy: number): Axis | null {
  const want: Axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
  return spec[want] ? want : spec.x ? 'x' : spec.y ? 'y' : null;
}

const SAMPLES = 40;
const step = (v: number) => Math.round(v * 100) / 100;

/**
 * Sample how the drive's measure responds across 0..1 (with the rest of `base` held), then map
 * pointer travel (font units along the axis, y up) to the value whose measure lands on the pointer.
 * Where several values fit, the one nearest the last answer wins, so a drag never jumps.
 */
export function solver(d: Drive, base: Params): (travel: number) => number {
  const v0 = driveValue(d, base);
  const linear = (t: number) => step(clamp(v0 + d.sign * t / (d.span ?? 400)));
  if (!d.measure) return linear;

  const vs: number[] = [], ms: number[] = [];
  for (const v of [...Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES), v0].sort((a, b) => a - b)) {
    const m = d.measure(buildFont(withDrive(d, base, v)));
    if (m != null && Number.isFinite(m)) { vs.push(v); ms.push(m); }
  }
  const i0 = vs.indexOf(v0);
  if (i0 < 0 || Math.max(...ms) - Math.min(...ms) < 4) return linear;
  const m0 = ms[i0], gain = (d.gain ?? 1) * d.sign;
  let last = v0;

  return t => {
    const target = m0 + gain * t;
    let best = NaN;
    const take = (v: number) => { if (Number.isNaN(best) || Math.abs(v - last) < Math.abs(best - last)) best = v; };
    for (let i = 0; i + 1 < vs.length; i++) {
      const a = ms[i], b = ms[i + 1];
      if ((target - a) * (target - b) > 0) continue;
      take(a === b ? vs[i] : vs[i] + (target - a) / (b - a) * (vs[i + 1] - vs[i]));
    }
    if (Number.isNaN(best)) {
      // past what the parameter can reach: hold at the closest end
      const miss = Math.min(...ms.map(m => Math.abs(m - target)));
      vs.forEach((v, i) => { if (Math.abs(ms[i] - target) - miss < 1e-6) take(v); });
    }
    last = best;
    return step(best);
  };
}
