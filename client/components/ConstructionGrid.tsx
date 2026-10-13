/* The construction grid in the inspector, like the grid page of a type specimen: the lines and
   circles the letter is built on (engine/grid), drawn through it, and a bar naming the grid and the
   letters that share it. What the letter has in common with its group is drawn in one colour, what
   is its own in another. In Parts its lines can be dragged (useGridDrag, lib/grid-drag): every point of
   the letter on a line moves with it, and with All letters a line shared with the group moves in each of
   the group's letters that has it there too; the letters moved become drawings, as an edit in Points makes
   them. */
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { gridOf, type Drawn, type Font, type GlyphGrid, type GridGroup, type GridLine } from '../../shared/engine';
import { lineIn, moveLine, pointsOn, slideBy, slideOf, snapTo, type Lean } from '../lib/grid-drag';
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

/** How far, in px, the pointer travels before a press on a line becomes a drag (as on a part of the letter). */
const DRAG_START = 4;
/** How near, in px, a dragged level or upright line comes to a guide or another such line of the letter before it
    stops there; ⌘ (or Ctrl) held, it doesn't. */
const SNAP_PX = 6;
/** How far past the advance box, in px, a line of the grid can be grabbed: out beyond it the guides take the press. */
const GRAB_PAD = 20;

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

/** A letter a dragged line moves in: as it was at the press, the line in its grid, and the points on it. */
interface Mover { ch: string; doc: Drawn; line: GridLine; lean: Lean; refs: Ref[] }
/** A line being dragged: which, how far it has moved along its way, the inspected letter's points on it where they
    are now, the pointer, and the other letters it moves in. */
interface Pull { i: number; line: GridLine; by: number; pts: P[]; x: number; y: number; others: string[] }

/** The other letters of the group that line `l` of letter `ch`'s grid moves in: with All letters, where it is shared,
    those with the same line at the same place and a point on it. */
function othersOf(font: Font, ch: string, l: GridLine, group: GridGroup, all: boolean): Mover[] {
  if (!all || !l.shared) return [];
  return group.chars.flatMap(c => {
    const info = c === ch ? null : gridOf(font, c), k = info && lineIn(l, info.grid), g = k && font.glyph(c);
    if (!info || !k || !g) return [];
    const doc = traceOf(g), refs = pointsOn(doc.contours, k, info.grid);
    return refs.length ? [{ ch: c, doc, line: k, lean: info.grid, refs }] : [];
  });
}

/**
 * Dragging the grid's lines in the inspector's canvas (Parts). `view` places the letter (font units to canvas px,
 * y up), `box` is the advance box in canvas px (the lines are grabbed there and a little past it), `size` the canvas,
 * `heights` the guides' heights (a level line stops at them), and `hold` holds the view still while a drag runs (and
 * lets it go with null). Gives the grab areas, the line in hand and its points (`lines`, for the canvas's SVG, over
 * the letter's parts) and the tip or the readout beside the pointer (`overlay`, over the canvas).
 */
export function useGridDrag({ ch, font, grid, group, view, box, size, heights, hold }: {
  ch: string; font: Font; grid?: GlyphGrid; group?: GridGroup; view: { sc: number; ox: number; oy: number }; box: Rect;
  size: { W: number; H: number }; heights: number[]; hold: (v: { sc: number; ox: number; oy: number } | null) => void;
}): { lines: ReactNode; overlay: ReactNode } {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [pull, setPull] = useState<Pull | null>(null);
  const finish = useRef<(() => void) | null>(null);
  useEffect(() => () => finish.current?.(), []);
  const all = useEditor(s => !letterOf(s));
  const { sc, ox, oy } = view;
  const X = (x: number) => ox + x * sc, Y = (y: number) => oy - y * sc;
  const hovered = hover && !pull && grid ? grid.lines[hover.i] : null;
  // the letters a line pointed at would move in too, for the tip to name
  const hoverOthers = useMemo(() => (hovered && group ? othersOf(font, ch, hovered, group, all).map(m => m.ch) : []), [hovered, group, font, ch, all]);
  if (!grid) return { lines: null, overlay: null };
  const lean: Lean = { slant: grid.slant, pivot: grid.pivot };

  /** Line `l`, moved `by` along its way, where it crosses `r`, in canvas px. */
  const seg = (l: GridLine, by: number, r: Rect) => {
    const ux = l.x + (slideOf(l) === 'x' ? by : 0), uy = l.y + (slideOf(l) === 'y' ? by : 0);
    const d = { x: (Math.cos(l.a) + grid.slant * Math.sin(l.a)) * sc, y: -Math.sin(l.a) * sc };
    return clip({ x: X(ux + grid.slant * (uy - grid.pivot)), y: Y(uy) }, d, r);
  };
  const grab: Rect = { x0: Math.min(box.x0, box.x1) - GRAB_PAD, x1: Math.max(box.x0, box.x1) + GRAB_PAD, y0: Math.min(box.y0, box.y1), y1: Math.max(box.y0, box.y1) };
  const whole: Rect = { x0: 0, y0: 0, x1: size.W, y1: size.H };

  /** The pointer in canvas px. */
  const at = (e: { clientX: number; clientY: number }, svg: SVGSVGElement | null) => {
    const r = svg?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const press = (i: number) => (e: ReactPointerEvent<SVGLineElement>) => {
    const l = grid.lines[i], g = font.glyph(ch);
    if (e.button !== 0 || !l || !g || finish.current) return;
    e.preventDefault();
    e.stopPropagation();
    // (held by the line pressed, so the parts under the pointer don't light up as it passes over them)
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const svg = e.currentTarget.ownerSVGElement;
    setHover(null);
    const doc = traceOf(g), movers: Mover[] = [{ ch, doc, line: l, lean, refs: pointsOn(doc.contours, l, lean) }];
    if (group) movers.push(...othersOf(font, ch, l, group, all));
    const x0 = e.clientX, y0 = e.clientY, held = { sc, ox, oy }, was = useEditor.getState().params.outlines;
    // a level line stops at the guides and the letter's other level lines, an upright one at its other uprights
    const kind = l.kind;
    const stops = kind === 'h' ? [...heights, ...grid.lines.filter(k => k.kind === 'h' && k !== l).map(k => k.y)]
      : kind === 'v' ? grid.lines.filter(k => k.kind === 'v' && k !== l).map(k => k.x) : [];
    const from = kind === 'h' ? l.y : l.x;
    let by = 0, moving = false;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / held.sc, dy = -(ev.clientY - y0) / held.sc;
      if (!moving) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_START) return;
        moving = true;
        hold(held);
      }
      by = slideBy(l, lean, dx, dy);
      if (stops.length && !ev.metaKey && !ev.ctrlKey) by = snapTo(from + by, stops, SNAP_PX / held.sc) - from;
      by = Math.round(by);
      const s = useEditor.getState(), moved = movers.map(m => [m.ch, { adv: m.doc.adv, contours: moveLine(m.doc.contours, m.refs, m.line, m.lean, by) }] as const);
      actions.setParam('outlines', { ...s.params.outlines, ...Object.fromEntries(moved) });
      const mine = moved[0][1].contours, r = at(ev, svg);
      setPull({ i, line: l, by, pts: movers[0].refs.map(({ c, i: k }) => ({ x: mine[c][k].x, y: mine[c][k].y })), x: r.x, y: r.y, others: movers.slice(1).map(m => m.ch) });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      finish.current = null;
      if (moving) {
        // a line brought back where it was changes nothing, and leaves the letters as they were (not drawings)
        if (by) actions.commit(); else actions.setParam('outlines', was);
        hold(null);
      }
      setPull(null);
    };
    finish.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  // the line in hand (or pointed at), drawn across the canvas, and the letter's points on it
  const lit = pull ? { l: pull.line, by: pull.by, pts: pull.pts } : hovered
    ? { l: hovered, by: 0, pts: (() => { const g = font.glyph(ch), cs = g ? traceOf(g).contours : []; return pointsOn(cs, hovered, lean).map(({ c, i }) => cs[c][i]); })() } : null;
  const litSeg = lit && seg(lit.l, lit.by, whole);
  const lines = (
    <g className="cg-drag">
      {grid.lines.map((l, i) => {
        const s = seg(l, 0, grab);
        return s && (
          <line key={i} className={slideOf(l) === 'x' ? 'i-hit edge' : 'i-hit line'} x1={n1(s[0])} y1={n1(s[1])} x2={n1(s[2])} y2={n1(s[3])}
            onPointerEnter={e => { if (!finish.current) setHover({ i, ...at(e, e.currentTarget.ownerSVGElement) }); }}
            onPointerMove={e => { if (!finish.current) setHover({ i, ...at(e, e.currentTarget.ownerSVGElement) }); }}
            onPointerLeave={() => setHover(null)} onPointerDown={press(i)} />
        );
      })}
      {lit && litSeg && (
        <g className={lit.l.shared ? 'cg-hot shared' : 'cg-hot'} pointerEvents="none">
          <line x1={n1(litSeg[0])} y1={n1(litSeg[1])} x2={n1(litSeg[2])} y2={n1(litSeg[3])} />
          {lit.pts.map((q, k) => <rect key={k} x={n1(X(q.x) - 3)} y={n1(Y(q.y) - 3)} width={6} height={6} />)}
        </g>
      )}
    </g>
  );

  let overlay: ReactNode = null;
  if (pull) {
    const l = pull.line;
    overlay = (
      <div className="i-readout" style={{ left: pull.x + 14, top: pull.y + 16 }}>
        {l.kind === 'h' ? <>y <b>{Math.round(l.y + pull.by)}</b></> : l.kind === 'v' ? <>x <b>{Math.round(l.x + pull.by)}</b></>
          : <>Moved <b>{pull.by > 0 ? '+' : ''}{pull.by}</b></>}
        {pull.others.length > 0 && <> · {pull.others.length + 1} letters</>}
      </div>
    );
  } else if (hover && hovered) {
    const { W, H } = size, style: CSSProperties = hover.x > W - 300 ? { right: W - hover.x + 18 } : { left: hover.x + 18 };
    if (hover.y > H - 110) style.bottom = H - hover.y + 16; else style.top = hover.y + 20;
    const ends = slideOf(hovered) === 'y' ? ['↑ Up', '↓ Down'] : ['← Left', 'Right →'];
    overlay = (
      <div className="i-tip" style={style}>
        <div className="i-tip-row">
          <span className="i-tip-head">Drag to move <b>this line</b> and its points</span>
          {hoverOthers.length > 0 ? <span className="i-tip-head">In <b>{nameList(hoverOthers)}</b> too, which share it</span>
            : hovered.shared && !all && <span className="i-tip-head">Only in {ch} · All letters moves it in the group</span>}
          <span className="i-tip-ends"><span>{ends[0]}</span><span>{ends[1]}</span></span>
        </div>
      </div>
    );
  }
  return { lines, overlay };
}
