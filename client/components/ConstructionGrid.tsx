/* The construction grid in the inspector, like the grid page of a type specimen: the lines and
   circles the letter is built on (engine/grid), drawn through it, and a bar naming the grid and the
   letters that share it. What the letter has in common with its group is drawn in one colour, what
   is its own in another. The grid can be taken hold of (useGridDrag, lib/grid-drag), in Parts and, with the
   selection tools, in Points: every point of the letter on a line moves with it; a circle's rim resizes the
   curves it was read off and its middle moves them. In Parts, with All letters, a line or circle shared with
   the group changes in each of the group's letters that has the very same one too; in Points it changes the
   letter alone, and goes on to the others as any edit there does. The letters changed become drawings, as an
   edit in Points makes them. */
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { gridOf, sameRound, type Drawn, type Font, type GlyphGrid, type GridGroup, type GridLine, type GridRound, type Node } from '../../shared/engine';
import {
  chainPoints, chainsOf, leaned, lineIn, mapChains, mostScale, moveLine, pivotOf, pointsOn, scaleAbout, scaleFor, slideBy, slideOf, snapTo, withArcEnds,
  type Chain, type Lean, type Pivot
} from '../lib/grid-drag';
import { n1 } from '../lib/hooks';
import { traceOf, type Ref } from '../lib/pen';
import { actions, letterOf, useEditor } from '../state/editor';
import { nameList } from './CarryOffer';

/** Far enough, in font units, to run a line off any canvas. */
const FAR = 9000;

/** The grid of `ch` and its group while the construction grid is switched on, else null. The letter's
    own grid follows every change; its group is read from the font a moment ago, so a drag stays smooth. */
export function useGrid(font: Font, ch: string | null) {
  const on = useEditor(s => s.construction), lazy = useDeferredValue(font);
  return useMemo(() => (on && ch ? gridOf(font, ch, lazy) : null), [on, ch, font, lazy]);
}

/** The grid's lines and circles. They sit in the letter's own space (font units, y down), so they go
    inside the group that places the letter; their strokes stay a hairline at any zoom. */
export function GridLines({ grid }: { grid: GlyphGrid }) {
  const cls = (shared: boolean) => (shared ? 'shared' : undefined);
  return (
    <g className="cg" pointerEvents="none" aria-hidden="true"
      transform={grid.slant ? `matrix(1 0 ${(-grid.slant).toFixed(5)} 1 ${n1(-grid.slant * grid.pivot)} 0)` : undefined}>
      {grid.rounds.map((r, i) => <ellipse key={i} className={cls(r.shared)} cx={n1(r.cx)} cy={n1(-r.cy)} rx={n1(r.rx)} ry={n1(r.ry)} />)}
      {grid.lines.map((l, i) => {
        const dx = Math.cos(l.a) * FAR, dy = Math.sin(l.a) * FAR;
        return <line key={i} className={cls(l.shared)} x1={n1(l.x - dx)} y1={n1(-(l.y - dy))} x2={n1(l.x + dx)} y2={n1(-(l.y + dy))} />;
      })}
    </g>
  );
}

/** Under the inspector's header: which grid the letter is on, and the letters drawn on the same one. */
export function GridBar({ ch, font, group }: { ch: string; font: Font; group: GridGroup }) {
  return (
    <div className="grid-bar" role="group" aria-label={`${group.name}: ${group.label}`}>
      <span className="grid-name">{group.name}</span>
      <span className="grid-label">{group.label}</span>
      <div className="grid-chars">
        {group.chars.map(c => {
          const g = font.glyph(c);
          return (
            <button key={c} className={c === ch ? 'cell on' : 'cell'} title={c === ch ? `${c} is on this grid` : `Inspect ${c}, on the same grid`}
              aria-label={c} aria-current={c === ch || undefined} onClick={() => actions.openInspector(c)}>
              <svg viewBox="0 -880 1000 1180" aria-hidden="true"><use href={`#g${c.charCodeAt(0)}`} x={g ? n1((1000 - g.adv) / 2) : 0} /></svg>
            </button>
          );
        })}
      </div>
      <span className="grow" />
      <span className="grid-key shared"><i />Shared with the group</span>
      <span className="grid-key"><i />Only {ch}</span>
    </div>
  );
}

type P = { x: number; y: number };
/** A stretch of the canvas, in px. */
export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** How far, in px, the pointer travels before a press on the grid becomes a drag (as on a part of the letter). */
const DRAG_START = 4;
/** How near, in px, a dragged level or upright line comes to a guide or another such line of the letter before it
    stops there; ⌘ (or Ctrl) held, it doesn't. */
const SNAP_PX = 6;
/** How far past the advance box, in px, the grid can be grabbed: out beyond it the guides take the press. */
const GRAB_PAD = 20;
/** The points a round is drawn through, in canvas px, to grab and to light it. */
const ROUND_STEPS = 64;

/** The stretch of the line through `p` running `d` that lies in `r`, as x1 y1 x2 y2, or null where it misses it. */
function clip(p: P, d: P, r: Rect): [number, number, number, number] | null {
  let t0 = -Infinity, t1 = Infinity;
  for (const [dd, lo, hi, v] of [[d.x, r.x0, r.x1, p.x], [d.y, r.y0, r.y1, p.y]]) {
    if (Math.abs(dd) < 1e-9) { if (v < lo || v > hi) return null; continue; }
    const a = (lo - v) / dd, b = (hi - v) / dd;
    t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 < t1 ? [p.x + d.x * t0, p.y + d.y * t0, p.x + d.x * t1, p.y + d.y * t1] : null;
}

/** What of the grid is in hand: a line (by its place in the grid's lines), or a round (by its place in its rounds),
    by its rim, which resizes it, or by its middle, which moves it. */
interface Grab { kind: 'line' | 'rim' | 'mid'; i: number }
/** A drag's value: a line's move along its way (`x`), a round's size (`x`, times as large), or a round's move. */
type Value = P;
/** A letter a drag reshapes: as it was at the press, as the drag's value draws it, and its points that move. */
interface Mover { ch: string; doc: Drawn; draw: (v: Value) => Node[][]; refs: Ref[] }
/** A chain of a letter's points on a round, with what it is resized about, and the most times larger it can be. */
interface Held { chain: Chain; pivot: Pivot; most: number }
/** A drag under way: what is in hand, its value, the inspected letter's moving points where they are now, the pointer,
    the other letters it reshapes, and for a rim, what the round is resized about (its chain nearest the press). */
interface Pull { grab: Grab; v: Value; pts: P[]; x: number; y: number; others: string[]; pivot?: Pivot }

/** The letters line `l` of `ch`'s grid moves in: `ch`, and with All letters, where the line is shared, the group's
    letters with the same line at the same place and a point on it. */
function lineMovers(font: Font, ch: string, l: GridLine, lean: Lean, group: GridGroup | undefined, all: boolean): Mover[] {
  const one = (c: string, doc: Drawn, k: GridLine, kl: Lean): Mover => {
    const refs = pointsOn(doc.contours, k, kl);
    return { ch: c, doc, refs, draw: v => moveLine(doc.contours, refs, k, kl, v.x) };
  };
  const g = font.glyph(ch), out = g ? [one(ch, traceOf(g), l, lean)] : [];
  if (!all || !l.shared || !group) return out;
  for (const c of group.chars) {
    const info = c === ch ? null : gridOf(font, c), k = info && lineIn(l, info.grid), og = k && font.glyph(c);
    if (!info || !k || !og) continue;
    const m = one(c, traceOf(og), k, info.grid);
    if (m.refs.length) out.push(m);
  }
  return out;
}

/** The chains of points each round of a letter's grid lies on, each with what it is resized about. */
const heldOn = (cs: Node[][], r: GridRound, lean: Lean): Held[] => chainsOf(cs, r, lean).map(chain => {
  const pivot = pivotOf(cs, chain, leaned({ x: r.cx, y: r.cy }, lean));
  return { chain, pivot, most: mostScale(cs, chain, pivot) };
});

/** The letters round `r` of `ch`'s grid reshapes as its rim (`resize`) or middle is dragged: `ch`, and with All
    letters, where the round is shared, the group's letters with the very same round (of its size, at its place: a
    round of one size elsewhere does another job, a c's bowl to an o's), each chain resized about its own pivot, or
    moved as far; resized no further than each can grow. */
function roundMovers(font: Font, ch: string, r: GridRound, grid: GlyphGrid, group: GridGroup | undefined, all: boolean, resize: boolean): Mover[] {
  const one = (c: string, doc: Drawn, held: Held[]): Mover => ({
    ch: c, doc, refs: held.flatMap(h => chainPoints(doc.contours, h.chain)),
    draw: v => mapChains(doc.contours, held.map(({ chain, pivot, most }) =>
      ({ chain, f: resize ? (q: P) => scaleAbout(q, pivot, Math.min(v.x, most)) : (q: P) => ({ x: q.x + v.x, y: q.y + v.y }) })))
  });
  const out: Mover[] = [];
  for (const c of all && r.shared && group ? [ch, ...group.chars.filter(o => o !== ch)] : [ch]) {
    const info = c === ch ? { grid } : gridOf(font, c), g = info && font.glyph(c);
    if (!info || !g) continue;
    // (its curves split where the rounds' arcs end between its points, so they are resized between points)
    const rounds = c === ch ? [r] : info.grid.rounds.filter(k => sameRound(r, k)), traced = traceOf(g), cs = withArcEnds(traced.contours, rounds, info.grid);
    const doc = cs === traced.contours ? traced : { ...traced, contours: cs }, held = rounds.flatMap(k => heldOn(cs, k, info.grid));
    if (held.length || c === ch) out.push(one(c, doc, held));
  }
  return out;
}

/**
 * Dragging the grid in the inspector's canvases: its lines move the points on them, its rounds' rims resize the curves
 * they were read off and their middles move them (lib/grid-drag). `view` places the letter (font units to canvas px,
 * y up), `box` is the advance box in canvas px (the grid is grabbed there and a little past it), `size` the canvas,
 * `heights` the guides' heights (a level line stops at them), and `hold` holds the view still while a drag runs (and
 * lets it go with null). In Points (`alone`) a drag changes the letter alone, and what it changed goes on to the
 * others as any edit there does (CarryOffer); `enabled` false leaves the grid only drawn (while the pen's tools that
 * add to the letter are in hand), and `onStart` hears a drag begin. Gives the grab areas, what is in hand and its
 * points (`lines`, for the canvas's SVG) and the tip or the readout beside the pointer (`overlay`, over the canvas).
 */
export function useGridDrag({ ch, font, grid, group, view, box, size, heights, hold, alone = false, enabled = true, onStart }: {
  ch: string; font: Font; grid?: GlyphGrid; group?: GridGroup; view: { sc: number; ox: number; oy: number }; box: Rect;
  size: { W: number; H: number }; heights: number[]; hold: (v: { sc: number; ox: number; oy: number } | null) => void;
  alone?: boolean; enabled?: boolean; onStart?: () => void;
}): { lines: ReactNode; overlay: ReactNode } {
  const [hover, setHover] = useState<(Grab & P) | null>(null);
  const [pull, setPull] = useState<Pull | null>(null);
  const finish = useRef<(() => void) | null>(null);
  useEffect(() => () => finish.current?.(), []);
  const all = useEditor(s => !letterOf(s)) && !alone;
  const clipId = 'cg-grab' + useId().replace(/[^\w-]/g, '');
  const g = font.glyph(ch);
  // each round's chains of the letter's points (split where its arcs end between them): a round with none can't be
  // taken hold of
  const held = useMemo(() => (grid && g ? grid.rounds.map(r => {
    const cs = withArcEnds(traceOf(g).contours, [r], grid);
    return { cs, list: heldOn(cs, r, grid) };
  }) : []), [grid, g]);
  const pointed = hover && !pull ? hover : null;
  // the letters what is pointed at reshapes too with All letters, for the tip to name
  const pointedOthers = useMemo(() => {
    if (!pointed || !grid || alone) return [];
    const ms = pointed.kind === 'line' ? (grid.lines[pointed.i] ? lineMovers(font, ch, grid.lines[pointed.i], grid, group, true) : [])
      : grid.rounds[pointed.i] ? roundMovers(font, ch, grid.rounds[pointed.i], grid, group, true, true) : [];
    return ms.slice(1).map(m => m.ch);
  }, [pointed?.kind, pointed?.i, grid, font, ch, group, alone]);
  if (!grid || !g || !enabled) return { lines: null, overlay: null };
  const lean: Lean = { slant: grid.slant, pivot: grid.pivot };
  const { sc, ox, oy } = view;
  const X = (x: number) => ox + x * sc, Y = (y: number) => oy - y * sc;

  /** Line `l`, moved `by` along its way, where it crosses `r`, in canvas px. */
  const seg = (l: GridLine, by: number, r: Rect) => {
    const ux = l.x + (slideOf(l) === 'x' ? by : 0), uy = l.y + (slideOf(l) === 'y' ? by : 0);
    const d = { x: (Math.cos(l.a) + grid.slant * Math.sin(l.a)) * sc, y: -Math.sin(l.a) * sc };
    return clip({ x: X(ux + grid.slant * (uy - grid.pivot)), y: Y(uy) }, d, r);
  };
  /** Round `r` as the letter stands, put through `f` (as its points are), as path data in canvas px, with its middle. */
  const roundD = (r: GridRound, f: (q: P) => P = q => q) => {
    const pts = Array.from({ length: ROUND_STEPS }, (_, k) => {
      const t = (k / ROUND_STEPS) * 2 * Math.PI, q = f(leaned({ x: r.cx + r.rx * Math.cos(t), y: r.cy + r.ry * Math.sin(t) }, lean));
      return `${n1(X(q.x))} ${n1(Y(q.y))}`;
    });
    const c = f(leaned({ x: r.cx, y: r.cy }, lean));
    return { d: `M${pts.join('L')}Z`, mid: { x: X(c.x), y: Y(c.y) } };
  };
  const grab: Rect = { x0: Math.min(box.x0, box.x1) - GRAB_PAD, x1: Math.max(box.x0, box.x1) + GRAB_PAD, y0: Math.min(box.y0, box.y1), y1: Math.max(box.y0, box.y1) };
  const whole: Rect = { x0: 0, y0: 0, x1: size.W, y1: size.H };

  /** The pointer in canvas px. */
  const at = (e: { clientX: number; clientY: number }, svg: SVGSVGElement | null) => {
    const r = svg?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  /** The main chain of a round pressed at `q` (font units): the one with a point nearest it. */
  const nearestHeld = (list: Held[], cs: Node[][], q: P) => list.reduce<{ h: Held; d: number } | null>((best, h) => {
    const d = Math.min(...chainPoints(cs, h.chain).map(({ c, i }) => Math.hypot(cs[c][i].x - q.x, cs[c][i].y - q.y)));
    return !best || d < best.d ? { h, d } : best;
  }, null)?.h ?? null;

  const press = (grabbed: Grab) => (e: ReactPointerEvent<SVGElement>) => {
    if (e.button !== 0 || finish.current) return;
    const svg = e.currentTarget.ownerSVGElement, here = at(e, svg), q0 = { x: (here.x - ox) / sc, y: (oy - here.y) / sc };
    let movers: Mover[], toValue: (dx: number, dy: number, ev: PointerEvent) => Value, changed: (v: Value) => boolean, pivot: Pivot | undefined;
    if (grabbed.kind === 'line') {
      const l = grid.lines[grabbed.i];
      if (!l) return;
      movers = lineMovers(font, ch, l, lean, group, all);
      // a level line stops at the guides and the letter's other level lines, an upright one at its other uprights
      const stops = l.kind === 'h' ? [...heights, ...grid.lines.filter(k => k.kind === 'h' && k !== l).map(k => k.y)]
        : l.kind === 'v' ? grid.lines.filter(k => k.kind === 'v' && k !== l).map(k => k.x) : [];
      const from = l.kind === 'h' ? l.y : l.x;
      toValue = (dx, dy, ev) => {
        let by = slideBy(l, lean, dx, dy);
        if (stops.length && !ev.metaKey && !ev.ctrlKey) by = snapTo(from + by, stops, SNAP_PX / sc) - from;
        return { x: Math.round(by), y: 0 };
      };
      changed = v => v.x !== 0;
    } else {
      const r = grid.rounds[grabbed.i], mine = held[grabbed.i]?.list;
      if (!r || !mine?.length) return;
      movers = roundMovers(font, ch, r, grid, group, all, grabbed.kind === 'rim');
      const main = nearestHeld(mine, movers[0].doc.contours, q0)!, least = 0.3 * Math.min(r.rx, r.ry);
      pivot = main.pivot;
      toValue = grabbed.kind === 'rim'
        ? (dx, dy) => ({ x: Math.round(Math.min(main.most, scaleFor(main.pivot, q0, { x: q0.x + dx, y: q0.y + dy }, least)) * 1000) / 1000, y: 0 })
        : (dx, dy) => ({ x: Math.round(dx), y: Math.round(dy) });
      changed = v => (grabbed.kind === 'rim' ? v.x !== 1 : v.x !== 0 || v.y !== 0);
    }
    e.preventDefault();
    e.stopPropagation();
    // (held by what was pressed, so the parts under the pointer don't light up as it passes over them)
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setHover(null);
    const x0 = e.clientX, y0 = e.clientY, view0 = { sc, ox, oy }, was = useEditor.getState().params.outlines;
    let v: Value = grabbed.kind === 'rim' ? { x: 1, y: 0 } : { x: 0, y: 0 }, moving = false;
    const move = (ev: PointerEvent) => {
      if (!moving) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_START) return;
        moving = true;
        hold(view0);
        onStart?.();
      }
      v = toValue((ev.clientX - x0) / view0.sc, -(ev.clientY - y0) / view0.sc, ev);
      const s = useEditor.getState(), drawn = movers.map(m => [m.ch, { adv: m.doc.adv, contours: m.draw(v) }] as const);
      actions.setParam('outlines', { ...s.params.outlines, ...Object.fromEntries(drawn) });
      const cs = drawn[0][1].contours, r = at(ev, svg);
      setPull({ grab: grabbed, v, pts: movers[0].refs.map(({ c, i }) => ({ x: cs[c][i].x, y: cs[c][i].y })), x: r.x, y: r.y, others: movers.slice(1).map(m => m.ch), pivot });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      finish.current = null;
      if (moving) {
        // brought back as it was, it changes nothing, and leaves the letters as they were (not drawings)
        if (changed(v)) actions.commit(); else actions.setParam('outlines', was);
        hold(null);
      }
      setPull(null);
    };
    finish.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };
  const point = (grabbed: Grab) => ({
    onPointerEnter: (e: ReactPointerEvent<SVGElement>) => { if (!finish.current) setHover({ ...grabbed, ...at(e, e.currentTarget.ownerSVGElement) }); },
    onPointerMove: (e: ReactPointerEvent<SVGElement>) => { if (!finish.current) setHover({ ...grabbed, ...at(e, e.currentTarget.ownerSVGElement) }); },
    onPointerLeave: () => setHover(null),
    onPointerDown: press(grabbed)
  });

  // what is in hand (or pointed at), lit: a line run across the canvas, a round with its middle marked, and the
  // letter's points that move with it
  const lit = pull ?? (pointed ? { grab: pointed as Grab, v: pointed.kind === 'rim' ? { x: 1, y: 0 } : { x: 0, y: 0 }, pts: null } : null);
  let hot: { d: string; mid?: P; shared: boolean; pts: P[] } | null = null;
  if (lit) {
    const cs = traceOf(g).contours, { kind, i } = lit.grab;
    if (kind === 'line' && grid.lines[i]) {
      const l = grid.lines[i], s = seg(l, lit.v.x, whole);
      if (s) hot = { d: `M${n1(s[0])} ${n1(s[1])}L${n1(s[2])} ${n1(s[3])}`, shared: l.shared, pts: lit.pts ?? pointsOn(cs, l, lean).map(({ c, i: k }) => cs[c][k]) };
    } else if (kind !== 'line' && grid.rounds[i]) {
      // (a round in hand drawn as its main chain is: moved, or resized about that chain's pivot)
      const r = grid.rounds[i], v = lit.v, pv = pull?.pivot;
      const { d, mid } = roundD(r, !pull ? undefined : kind === 'mid' ? q => ({ x: q.x + v.x, y: q.y + v.y }) : pv ? q => scaleAbout(q, pv, v.x) : undefined);
      const on = held[i];
      hot = { d, mid, shared: r.shared, pts: lit.pts ?? (on ? on.list.flatMap(h => chainPoints(on.cs, h.chain)).map(({ c, i: k }) => on.cs[c][k]) : []) };
    }
  }
  const lines = (
    <g className="cg-drag">
      <clipPath id={clipId}><rect x={n1(grab.x0)} y={n1(grab.y0)} width={n1(grab.x1 - grab.x0)} height={n1(grab.y1 - grab.y0)} /></clipPath>
      <g clipPath={`url(#${clipId})`}>
        {grid.rounds.map((r, i) => held[i]?.list.length ? <path key={i} className="i-hit rim" d={roundD(r).d} {...point({ kind: 'rim', i })} /> : null)}
      </g>
      {grid.lines.map((l, i) => {
        const s = seg(l, 0, grab);
        return s && <line key={i} className={slideOf(l) === 'x' ? 'i-hit edge' : 'i-hit line'} x1={n1(s[0])} y1={n1(s[1])} x2={n1(s[2])} y2={n1(s[3])} {...point({ kind: 'line', i })} />;
      })}
      {grid.rounds.map((r, i) => {
        if (!held[i]?.list.length) return null;
        const { mid } = roundD(r);
        return <circle key={i} className="i-hit mid" cx={n1(mid.x)} cy={n1(mid.y)} r={7} {...point({ kind: 'mid', i })} />;
      })}
      {hot && (
        <g className={hot.shared ? 'cg-hot shared' : 'cg-hot'} pointerEvents="none">
          <path d={hot.d} />
          {hot.mid && <path d={`M${n1(hot.mid.x - 5)} ${n1(hot.mid.y)}h10M${n1(hot.mid.x)} ${n1(hot.mid.y - 5)}v10`} />}
          {hot.pts.map((q, k) => <rect key={k} x={n1(X(q.x) - 3)} y={n1(Y(q.y) - 3)} width={6} height={6} />)}
        </g>
      )}
    </g>
  );

  let overlay: ReactNode = null;
  if (pull) {
    const { kind, i } = pull.grab, v = pull.v, sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    const l = kind === 'line' ? grid.lines[i] : null;
    overlay = (
      <div className="i-readout" style={{ left: pull.x + 14, top: pull.y + 16 }}>
        {kind === 'rim' ? <>Size <b>{Math.round(v.x * 100)}%</b></> : kind === 'mid' ? <>Moved <b>{sign(v.x)}, {sign(v.y)}</b></>
          : l?.kind === 'h' ? <>y <b>{Math.round(l.y + v.x)}</b></> : l?.kind === 'v' ? <>x <b>{Math.round(l.x + v.x)}</b></> : <>Moved <b>{sign(v.x)}</b></>}
        {pull.others.length > 0 && <> · {pull.others.length + 1} letters</>}
      </div>
    );
  } else if (pointed) {
    const { kind, i } = pointed, l = kind === 'line' ? grid.lines[i] : null, r = kind !== 'line' ? grid.rounds[i] : null;
    if (l || r) {
      const { W, H } = size, style: CSSProperties = pointed.x > W - 300 ? { right: W - pointed.x + 18 } : { left: pointed.x + 18 };
      if (pointed.y > H - 110) style.bottom = H - pointed.y + 16; else style.top = pointed.y + 20;
      const ends = kind === 'rim' ? ['In · smaller', 'Out · larger'] : kind === 'mid' ? null : slideOf(l!) === 'y' ? ['↑ Up', '↓ Down'] : ['← Left', 'Right →'];
      overlay = (
        <div className="i-tip" style={style}>
          <div className="i-tip-row">
            <span className="i-tip-head">{kind === 'line' ? <>Drag to move <b>this line</b> and its points</>
              : kind === 'rim' ? <>Drag to resize <b>this circle</b> and the curve on it</> : <>Drag to move <b>this circle</b> and the curve on it</>}</span>
            {pointedOthers.length > 0 && (all ? <span className="i-tip-head">In <b>{nameList(pointedOthers)}</b> too, which share it</span>
              : <span className="i-tip-head">Only in {ch} · All letters {kind === 'rim' ? 'resizes' : 'moves'} it in <b>{nameList(pointedOthers)}</b> too</span>)}
            {ends && <span className="i-tip-ends"><span>{ends[0]}</span><span>{ends[1]}</span></span>}
          </div>
        </div>
      );
    }
  }
  return { lines, overlay };
}
