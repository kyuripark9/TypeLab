/* The pen: the inspected letter as anchor points and bézier handles, edited like paths in a vector
   editor. The Selection tool (the one a letter opens with) picks whole shapes and moves them (⌥ moves a
   copy), and a box round them scales them by its handles or turns them from just outside a corner, while a
   knob inside each of their corners rounds them all; the pen bar sizes, turns, flips
   and thickens them by number, and ⌘C, ⌘X and ⌘V carry them to another letter, in place. The Direct
   selection tool moves points, handles and curves; the Pen adds points (or
   draws new contours) and removes them; Convert switches points between corner and smooth; the
   Shape tool adds a stroke as thick as the letter's own (square or round ended), a rectangle, rounded
   rectangle, ellipse, triangle, hexagon or star, picked from its menu, as a new contour. Corners rounds,
   cuts or scoops corners (the picked ones, or every one, told apart as outside and inside), and a picked
   corner shows a handle to drag its radius by; Overlaps merges overlapping shapes, cuts the picked ones
   out of the rest, or breaks them apart with a gap. Hovering shows what a click will do: a
   point the pen would add on the outline (where it goes), the start it would close on. A letter
   not yet drawn shows its outline traced into points (traceOf in lib/pen: a free font's own
   points, else fitOutline), and becomes a drawing with the first edit: its shape its own, kept with the settings it
   was drawn at, which move it (weight, width, heights, slant) as they move from there. Every change is one undo
   step: with All letters (the inspector's switch) CarryOffer carries it on, once done, to the other letters shaped
   the same way there, in that same step; with Only it changes this letter alone, and is offered to them after. With Mirror, a point
   moved here moves the other way in its partner across the letter's middle. Snapping catches a dragged point or handle on points, guide
   lines, centers, midpoints, the outline, crossings and tangents (each can be turned off); ⌘ held
   while dragging places it freely. With the construction grid on, the Selection tools also take hold of its lines and
   circles (ConstructionGrid's useGridDrag): an edit of this letter's points like any other. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { CORNER_KINDS, cmdsToD, cornerRoom, drawnCmds, hasIn, hasOut, segment, type CornerKind, type Drawn, type Font, type Glyph, type GlyphGrid, type Node } from '../../shared/engine';
import { guideLines, stackLabels } from '../lib/guide-labels';
import { isTyping, n1, useDismiss, useSize } from '../lib/hooks';
import {
  anchorsIn, breakShapes, constrain, contourArea, cornerHandle, cornersAt, cutShapes, deleteAnchors, isStroke, keyRef, mergeShapes, mirrorEdit,
  boxAlong, mirrorLine, mirrorPairs, moveAnchors, nearestSegment, overlapping, pickedPoints, pointOn, pullHandles, refKey, reshapeSegment, reverseContour,
  scaleAlong, turnOf, setCorners, setHandle, setSmooth, setWeight, shapeAspect, shapeContour, shapesOf, snapIn, snapScene, splitSegment, strokeContour, strokeWidth,
  thicknessOf, toggleSmooth, traceOf, transformAnchors, turnAbout, wholeShapes,
  POINT_LINE, SHAPES, SNAP_KINDS, type Affine, type Axis, type CornerAt, type Ref, type Shape, type SnapKind, type SnapScene, type Snapped
} from '../lib/pen';
import { PREFS, prefJson, prefOneOf, writePref } from '../lib/prefs';
import { actions, fontFor, useEditor } from '../state/editor';
import { CarryOffer } from './CarryOffer';
import { GridLines, useGridDrag } from './ConstructionGrid';

type Tool = 'object' | 'select' | 'pen' | 'convert' | 'shape';
type P = { x: number; y: number };
interface View { sc: number; ox: number; oy: number }
/** The box round the picked points, standing turned `deg` anticlockwise: x0 to x1 along its turned x axis (u) and y0 to
    y1 along its y axis (v), with the ways from those to font units (`at`) and back (`of`). */
interface Frame { deg: number; x0: number; y0: number; x1: number; y1: number; at: (u: number, v: number) => P; of: (p: P) => { u: number; v: number } }
function frameOf(pts: P[], deg: number): Frame | null {
  const b = boxAlong(pts, deg);
  if (!b) return null;
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return {
    deg, ...b,
    at: (u, v) => (deg ? { x: u * c - v * s, y: u * s + v * c } : { x: u, y: v }),
    of: p => (deg ? { u: p.x * c + p.y * s, v: -p.x * s + p.y * c } : { u: p.x, v: p.y })
  };
}
const middleOf = (f: Frame) => ({ u: (f.x0 + f.x1) / 2, v: (f.y0 + f.y1) / 2 });
/** A way in font units turned `deg` anticlockwise. */
const turned2 = (p: P, deg: number): P => {
  if (!deg) return p;
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};
/** a live pointer gesture: `move` drives it and `up` finishes it, told whether the pointer moved past a click */
interface Gesture { move: (p: P, e: PointerEvent) => void; up: (moved: boolean) => void; x0: number; y0: number; moved: boolean }

const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: 'object', label: 'Selection', key: 'V', icon: <path d="M5 3l10 6.5-4.5 1L13 16l-2 1-2.5-5.5L5 15z" className="fill" /> },
  { id: 'select', label: 'Direct selection', key: 'A', icon: <path d="M5 3l10 6.5-4.5 1L13 16l-2 1-2.5-5.5L5 15z" /> },
  { id: 'pen', label: 'Pen', key: 'P', icon: <><path d="M10 2.5l5 8-2.5 6h-5l-2.5-6z" /><path d="M10 2.5v6.5" /><circle cx="10" cy="10" r="1.3" /></> },
  { id: 'convert', label: 'Convert point', key: '⇧C', icon: <><path d="M3.5 15.5L10 4l6.5 11.5" /><path d="M5 9.5h10" strokeDasharray="1.5 2" /></> }
];
/** The shapes the Shape tool draws: name, shortcut, the bar's tips (what a drag adds, and what Shift keeps it to), and a
    20 × 20 icon. */
const SHAPE_INFO: Record<Shape, { label: string; key?: string; hint: string; shift: string; icon: ReactNode }> = {
  stroke: { label: 'Stroke', key: 'K', hint: 'a stroke as thick as the letter’s', shift: 'keep it to 45°', icon: <path d="M4 14.5l9.5-9.5 2.5 2.5-9.5 9.5z" /> },
  roundstroke: { label: 'Round stroke', hint: 'a round-ended stroke', shift: 'keep it to 45°', icon: <path d="M5.2 15.8a1.77 1.77 0 010-2.5l8.1-8.1a1.77 1.77 0 012.5 2.5l-8.1 8.1a1.77 1.77 0 01-2.5 0z" /> },
  rect: { label: 'Rectangle', key: 'M', hint: 'a rectangle', shift: 'a square', icon: <rect x="3.5" y="5" width="13" height="10" rx="0.5" /> },
  round: { label: 'Rounded rectangle', hint: 'a rounded rectangle', shift: 'a square', icon: <rect x="3.5" y="5" width="13" height="10" rx="3" /> },
  ellipse: { label: 'Ellipse', key: 'L', hint: 'an ellipse', shift: 'a circle', icon: <ellipse cx="10" cy="10" rx="7" ry="5.5" /> },
  triangle: { label: 'Triangle', hint: 'a triangle', shift: 'even sides', icon: <path d="M10 3.5l7 12.5H3z" /> },
  polygon: { label: 'Hexagon', hint: 'a hexagon', shift: 'even sides', icon: <path d="M10 2.8l6.5 3.6v7.2L10 17.2l-6.5-3.6V6.4z" /> },
  star: { label: 'Star', hint: 'a star', shift: 'even points', icon: <path d="M10 2.5l2.1 4.6 5 .5-3.7 3.4 1 4.9L10 13.4l-4.4 2.5 1-4.9-3.7-3.4 5-.5z" /> }
};
/** The tool a key picks, by the letter its button shows (⇧ when it goes with Shift). */
const toolForKey = (k: string, shift: boolean): Tool | undefined =>
  TOOLS.find(t => t.key.replace('⇧', '').toLowerCase() === k && (shift || !t.key.startsWith('⇧')))?.id;
/** The shape a key picks for the Shape tool, by the letter its menu shows. */
const shapeForKey = (k: string): Shape | undefined => SHAPES.find(s => SHAPE_INFO[s].key?.toLowerCase() === k);
/** What a click would do where the pointer is, shown while it hovers. */
type Aim = { kind: 'add'; at: P } | { kind: 'close' } | { kind: 'shape'; shape: Shape };

const HIT = 7; // px around an anchor or handle that grabs it
const SNAP_REACH = 6; // px from a snap target within which a point catches on it
const DRAG_START = 3; // px the pointer travels before a press becomes a drag (less is a click)
const TURN_REACH = 22; // px outside a corner of the Selection tool's box where a drag turns the picked shapes
const ROUND_ROOM = 48; // px the Selection tool's box must be across and up for its shapes' corners to show their rounding knobs
/** A cursor drawn as SVG, 24 px, pointing at (x, y). */
const svgCursor = (body: string, x: number, y: number, or: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${body}</svg>`)}") ${x} ${y}, ${or}`;
/** The cursor over a corner's rounding knob: an arrow with a round corner by it. */
const ROUND_CURSOR = svgCursor(
  `<path d='M4 2.5V16.7l3.4-3.3 2.4 5.6 2.4-1-2.4-5.6h4.8z' fill='#fff' stroke='#000' stroke-width='1.1' stroke-linejoin='round'/>` +
  [['#fff', 3.4], ['#000', 1.4]].map(([c, w]) => `<path d='M14.5 22.5v-3a4.5 4.5 0 0 1 4.5-4.5h3' fill='none' stroke='${c}' stroke-width='${w}' stroke-linecap='round'/>`).join(''),
  4, 3, 'pointer');
/** The cursor just outside a corner of the box, where a drag turns the shapes: a curved arrow pointed at both ends,
    bowed out of the corner, which faces `deg` on screen (0 to the right, clockwise). */
const turnCursors = new Map<number, string>();
function turnCursor(deg: number): string {
  let c = turnCursors.get(deg);
  if (c) return c;
  const a = (deg * Math.PI) / 180, R = 6.5, f = (v: number) => Math.round(v * 10) / 10;
  const at = (t: number, out = 0) => [12 + (R + out) * Math.cos(t), 12 + (R + out) * Math.sin(t)];
  // a head at angle t, pointing on round the arc (dir 1 clockwise on screen)
  const head = (t: number, dir: number) => {
    const tip = at(t + dir * 0.42), l = at(t, 2.9), r = at(t, -2.9);
    return `M${f(tip[0])} ${f(tip[1])}L${f(l[0])} ${f(l[1])}L${f(r[0])} ${f(r[1])}Z`;
  };
  const t1 = a - 0.95, t2 = a + 0.95, p = at(t1), q = at(t2);
  const arc = `M${f(p[0])} ${f(p[1])}A${R} ${R} 0 0 1 ${f(q[0])} ${f(q[1])}`, heads = head(t2, 1) + head(t1, -1);
  c = svgCursor(`<path d='${arc}' fill='none' stroke='#fff' stroke-width='3.6'/><path d='${heads}' fill='#fff' stroke='#fff' stroke-width='2.2' stroke-linejoin='round'/>` +
    `<path d='${arc}' fill='none' stroke='#000' stroke-width='1.5'/><path d='${heads}' fill='#000'/>`, 12, 12, 'alias');
  turnCursors.set(deg, c);
  return c;
}
/** The tool last picked: the next letter opens with it (the Selection tool at first, as in a vector editor). */
let lastTool: Tool = 'object';
/** Shapes cut or copied (⌘X, ⌘C), to paste into this letter or another, and which way the letter they came from runs. */
let clipboard: { contours: Node[][]; way: number } | null = null;
/** Which way a letter's outline runs: its biggest contour's, anticlockwise 1, clockwise -1 (and 1 for no outline). */
const wayOf = (cs: Node[][]) => {
  const big = cs.reduce<Node[] | null>((m, k) => !m || Math.abs(contourArea(k)) > Math.abs(contourArea(m)) ? k : m, null);
  return !big || contourArea(big) >= 0 ? 1 : -1;
};
/** How far the view zooms out and in, as shares of the scale that fits the letter in it. */
const ZOOM_MIN = 0.3, ZOOM_MAX = 40;

export function PenCanvas({ ch, g, font, grid }: { ch: string; g: Glyph; font: Font; grid?: GlyphGrid }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const mirror = useEditor(s => s.mirror);
  const snap = useEditor(s => s.snap);
  // the letter as it stands: before the first edit, as the settings draw it, traced into points; after, the drawing,
  // as far as the settings have moved it since it was drawn
  const doc = traceOf(g);
  const cs = doc.contours;
  const [tool, setToolNow] = useState<Tool>(() => lastTool);
  const setTool = (t: Tool) => { lastTool = t; setToolNow(t); };
  // the shape the Shape tool draws, the one last picked
  const [shape, setShapeNow] = useState<Shape>(() => prefOneOf(PREFS.penShape, SHAPES, 'rect'));
  const pickShape = (k: Shape) => { setShapeNow(k); setTool('shape'); writePref(PREFS.penShape, k); };
  const [sel, setSel] = useState<string[]>([]);
  const [drawing, setDrawing] = useState<number | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [ptr, setPtr] = useState<P | null>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [caught, setCaught] = useState<Snapped | null>(null);
  // the size of the shape being drawn (a radius, an angle), shown by the pointer
  const [sizeTag, setSizeTag] = useState<{ x: number; y: number; text: string } | null>(null);
  // how far the picked shapes have been turned since they were picked (the bar's angle), and a turn being dragged
  const [turned, setTurned] = useState<{ key: string; deg: number }>({ key: '', deg: 0 });
  const [spin, setSpin] = useState<{ deg: number; f: Frame } | null>(null);
  const [space, setSpace] = useState(false);
  // a stroke's thickness, typed in; left alone it is the letter's own
  const [strokeW, setStrokeW] = useState<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  // ⌘ (or Ctrl) held during a drag: no snapping
  const free = useRef(false);
  const scene = useRef<{ cs: Node[][]; key: string; s: SnapScene } | null>(null);

  const W = Math.max(320, size.width), H = Math.max(300, size.height), m = font.m;
  const top = Math.max(m.asc, m.cap) + 90, bot = m.desc - 60;
  const fitSc = Math.min((H - 90) / (top - bot), (W - 180) / Math.max(doc.adv, 500));
  const fit: View = { sc: fitSc, ox: 90 + (W - 150 - doc.adv * fitSc) / 2, oy: 20 + top * fitSc };
  const { sc, ox, oy } = view ?? fit;
  const X = (x: number) => ox + x * sc, Y = (y: number) => oy - y * sc;

  // a selection or drawing left pointing past the end (after an undo) is dropped
  const valid = (k: string) => { const r = keyRef(k); return !!cs[r.c]?.[r.i]; };
  const selRefs = sel.filter(valid).map(keyRef);
  const drawingOk = drawing !== null && cs[drawing] ? drawing : null;
  useEffect(() => { if (drawing !== null && drawingOk === null) setDrawing(null); }, [drawing, drawingOk]);

  /** the outline right now, read at the time of the gesture */
  const current = (): Drawn => { const now = fontFor(useEditor.getState().params).glyph(ch); return now ? traceOf(now) : doc; };
  /** Write the letter's outline. */
  const write = (contours: Node[][], adv = current().adv) => {
    const s = useEditor.getState();
    actions.setParam('outlines', { ...s.params.outlines, [ch]: { adv, contours } });
  };
  const commit = (contours: Node[][], adv?: number) => { write(contours, adv); actions.commit(); };
  /** With Mirror, `edited` (an edit of `base`) made on the other side of the letter too; `held` is the handle dragged. */
  const sym = (base: Node[][], edited: Node[][], held?: { r: Ref; side: 'i' | 'o' }) => mirrorEdit(base, edited, mirror, held);
  /** Move points by (dx, dy). */
  const nudge = (refs: Ref[], dx: number, dy: number) => {
    const base = current().contours;
    commit(sym(base, moveAnchors(base, refs, dx, dy)));
  };
  /** Commit an edit of the outline as it is now, mirrored. */
  const edit = (f: (cs: Node[][]) => Node[][]) => { const base = current().contours; commit(sym(base, f(base))); };
  /** The contours holding any picked point. */
  const pickedContours = () => [...new Set(selRefs.map(r => r.c))];
  /** How thick the letter's strokes are, as the settings (or its font) draw it: a new stroke's thickness. (Read off the
      letter as it was, not the drawing, where shapes added or merged and corners rounded would read as strokes.) */
  const stemMemo = useRef<{ g: Glyph; w: number } | null>(null);
  const stem = () => {
    if (stemMemo.current?.g !== g) stemMemo.current = { g, w: strokeWidth(doc.contours, Math.round(font.m.s)) };
    return stemMemo.current.w;
  };
  /** Stop drawing; a contour left with a single point goes. */
  const finish = () => {
    const c = drawingOk;
    setDrawing(null);
    if (c === null) return;
    const now = current().contours;
    if (now[c] && now[c].length < 2) { commit(now.filter((_, i) => i !== c)); setSel([]); }
  };

  const toFont = (e: { clientX: number; clientY: number }): P => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / sc, y: (oy - (e.clientY - r.top)) / sc };
  };

  /** With Mirror, the partners of `keys` across the letter's middle, which move with them. */
  const withTwins = (keys: string[]) => {
    let out = keys;
    for (const axis of mirror) {
      const pairs = mirrorPairs(cs, axis, mirrorLine(cs, axis));
      out = [...new Set([...out, ...out.map(k => pairs.get(k)).filter((r): r is Ref => !!r).map(refKey)])];
    }
    return new Set(out);
  };
  /** Snap a point to whole units, and (with Snap on) to the places near it within a few pixels.
      `skip` are the points being moved, `live` the points whose curves change with the drag, `from`
      the points a tangent may be drawn from; `level` snaps only across and up, to lines. */
  const snapTo = (p: P, o: { skip?: string[]; live?: string[]; from?: P[]; level?: boolean } = {}): P => {
    if (!snap.on || !snap.kinds.length || free.current) { setCaught(null); return { x: Math.round(p.x), y: Math.round(p.y) }; }
    const skip = withTwins(o.skip ?? []), live = withTwins(o.live ?? o.skip ?? []);
    const kinds: SnapKind[] = o.level ? snap.kinds.filter(k => k === 'points' || k === 'guides' || k === 'centers') : snap.kinds;
    const key = [kinds, [...skip], [...live], (o.from ?? []).map(f => `${f.x},${f.y}`), doc.adv].join('|');
    if (scene.current?.cs !== cs || scene.current.key !== key)
      scene.current = { cs, key, s: snapScene(cs, doc.adv, m, kinds, skip, live, o.from) };
    const s = o.level ? { ...scene.current.s, spots: [], pieces: [] } : scene.current.s;
    const r = snapIn(s, p, SNAP_REACH / sc);
    setCaught(r.at || r.gx || r.gy ? r : null);
    return { x: r.x, y: r.y };
  };
  /** The points either side of `r` that stay put, which a tangent may be drawn from. */
  const beside = (r: Ref, skip: string[]): P[] => {
    const con = cs[r.c];
    if (!con || con.length < 2) return [];
    return [(r.i + con.length - 1) % con.length, (r.i + 1) % con.length].filter(i => !skip.includes(refKey({ c: r.c, i }))).map(i => con[i]);
  };

  /* ---- gestures: pointer down on something starts one, moves drive it, up ends it */
  const start = (e: ReactPointerEvent, g0: Omit<Gesture, 'x0' | 'y0' | 'moved'>) => {
    e.preventDefault();
    e.stopPropagation();
    const gs: Gesture = { ...g0, x0: e.clientX, y0: e.clientY, moved: false };
    gesture.current = gs;
    const move = (ev: PointerEvent) => {
      if (!gs.moved && Math.hypot(ev.clientX - gs.x0, ev.clientY - gs.y0) < DRAG_START) return;
      gs.moved = true;
      free.current = ev.metaKey || ev.ctrlKey;
      gs.move(toFont(ev), ev);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      gesture.current = null;
      free.current = false;
      setCaught(null);
      gs.up(gs.moved);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /** Drag anchor points from where they are when the drag starts: the grabbed one follows the
      pointer (snapped), the rest keep their places relative to it; Shift keeps to 45° steps. Pressed
      away from the grabbed point (at `from`, on a shape's fill), they move as far as the pointer does.
      With `dup`, the contours holding them are copied first and the copies move, the originals staying. */
  const dragAnchors = (e: ReactPointerEvent, refs0: Ref[], grab0: Ref, from?: P, dup = false) => {
    let base = current().contours, refs = refs0, grab = grab0;
    if (dup) {
      const cc = [...new Set(refs0.map(r => r.c))], to = new Map(cc.map((c, k) => [c, base.length + k]));
      base = [...base, ...cc.map(c => base[c].map(n => ({ ...n })))];
      refs = refs0.map(r => ({ c: to.get(r.c)!, i: r.i }));
      grab = { c: to.get(grab0.c)!, i: grab0.i };
    }
    const a = base[grab.c][grab.i], skip = refs.map(refKey), near = dup ? [] : beside(grab, skip);
    // a copy's box stands as the original's does
    const was = refs0.map(refKey).sort().join(' '), deg = dup ? (turned.key === was ? turned.deg : turnOf(base, refs0)) : 0;
    let copied = false;
    start(e, {
      move: (p, ev) => {
        const t = from ? { x: a.x + p.x - from.x, y: a.y + p.y - from.y } : p, q = snapTo(ev.shiftKey ? constrain(a, t) : t, { skip, from: near });
        const out = moveAnchors(base, refs, q.x - a.x, q.y - a.y);
        // (a copy isn't mirrored: its points sit on the originals', which Mirror would take for partners)
        write(dup ? out : sym(base, out));
        if (dup && !copied) { copied = true; setSel(skip); setTurned({ key: [...skip].sort().join(' '), deg }); }
      },
      up: moved => { if (moved) actions.commit(); }
    });
  };
  /** Of `refs`, the point nearest `p`. */
  const nearestOf = (refs: Ref[], p: P) => refs.reduce((b, r) => {
    const n = cs[r.c][r.i], m = cs[b.c][b.i];
    return Math.hypot(n.x - p.x, n.y - p.y) < Math.hypot(m.x - p.x, m.y - p.y) ? r : b;
  }, refs[0]);
  /** The outline's shapes (each contour with the holes in it), found once per outline. */
  const shapesMemo = useRef<{ cs: Node[][]; g: number[][] } | null>(null);
  const shapeGroups = () => {
    if (shapesMemo.current?.cs !== cs) shapesMemo.current = { cs, g: shapesOf(cs) };
    return shapesMemo.current.g;
  };
  /** Every point of the shape holding contour c. */
  const shapeKeys = (c: number) => (shapeGroups().find(g => g.includes(c)) ?? [c]).flatMap(k => cs[k].map((_, i) => refKey({ c: k, i })));
  /** The Selection tool pressed on contour c: its shape is picked (Shift adds it, or takes it away), and every picked
      point dragged by the one nearest the pointer; with ⌥, a copy of them. */
  const grabShape = (e: ReactPointerEvent, c: number) => {
    const keys = shapeKeys(c), had = keys.every(k => sel.includes(k));
    if (e.shiftKey) { setSel(had ? sel.filter(k => !keys.includes(k)) : [...new Set([...sel, ...keys])]); if (had) return; }
    const all = (had || e.shiftKey ? [...new Set([...sel, ...keys])] : keys).filter(valid).map(keyRef);
    if (!had && !e.shiftKey) setSel(keys);
    const p = toFont(e);
    dragAnchors(e, all, nearestOf(all, p), p, e.altKey);
  };

  const onAnchor = (r: Ref) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || space) return;
    const k = refKey(r);
    // a shape can start on a point
    if (tool === 'shape') { onBackground(e); return; }
    if (tool === 'object') { grabShape(e, r.c); return; }
    if (tool === 'pen') {
      // on the first point of the contour being drawn: close it (a drag pulls its handles)
      if (drawingOk === r.c && r.i === 0 && cs[r.c].length > 1) {
        const base = current().contours;
        start(e, {
          move: p => write(pullHandles(base, r, snapTo(p, { live: [k], from: [base[r.c][r.i]] }))),
          up: moved => { if (moved) actions.commit(); setDrawing(null); setSel([k]); }
        });
        return;
      }
      if (drawingOk !== null) { onBackground(e); return; }
      // the pen on a point removes it
      e.preventDefault(); e.stopPropagation();
      commit(deleteAnchors(current().contours, [r]));
      setSel([]);
      return;
    }
    if (tool === 'convert') {
      const base = current().contours;
      start(e, {
        move: p => write(sym(base, pullHandles(base, r, snapTo(p, { live: [k], from: [base[r.c][r.i]] })), { r, side: 'o' })),
        up: moved => { if (moved) actions.commit(); else commit(sym(base, toggleSmooth(base, r))); setSel([k]); }
      });
      return;
    }
    // select: pick the point (Shift adds or takes it away), then drag every picked point
    const picked = sel.includes(k);
    if (e.shiftKey) { setSel(picked ? sel.filter(s => s !== k) : [...sel, k]); if (picked) return; }
    const refs = picked || e.shiftKey ? [...new Set([...sel, k])].filter(valid).map(keyRef) : [r];
    if (!picked && !e.shiftKey) setSel([k]);
    dragAnchors(e, refs, r);
  };

  const onHandle = (r: Ref, side: 'i' | 'o') => (e: ReactPointerEvent) => {
    if (e.button !== 0 || space) return;
    const base = current().contours, n = base[r.c][r.i];
    // Alt, or the Convert tool, moves one handle on its own and makes the point a corner
    const alone = e.altKey || tool === 'convert';
    start(e, {
      move: (p, ev) => {
        const q = snapTo(ev.shiftKey ? constrain(n, p) : p, { live: [refKey(r)], from: [n] }), f = alone || ev.altKey;
        write(sym(base, setHandle(base, r, side, q, f), { r, side }));
      },
      up: moved => { if (moved) actions.commit(); }
    });
  };

  /** Pressing on the outline between points: the pen adds a point there, the other tools bend the curve. */
  const onSegment = (e: ReactPointerEvent) => {
    if (e.button !== 0 || space) return;
    if (tool === 'shape') { onBackground(e); return; }
    const p = toFont(e), hit = nearestSegment(current().contours, p);
    if (tool === 'object') { if (hit && hit.d * sc <= HIT + 2) grabShape(e, hit.c); else onBackground(e); return; }
    if (!hit || hit.d * sc > HIT + 2 || (tool === 'pen' && drawingOk !== null)) { onBackground(e); return; }
    const base = current().contours;
    if (tool === 'pen') {
      e.preventDefault(); e.stopPropagation();
      const out = splitSegment(base, hit.c, hit.i, hit.t);
      commit(out);
      setSel([refKey({ c: hit.c, i: hit.i + 1 })]);
      return;
    }
    const a = base[hit.c][hit.i], b = base[hit.c][(hit.i + 1) % base[hit.c].length];
    if (!e.shiftKey) setSel([refKey({ c: hit.c, i: hit.i }), refKey({ c: hit.c, i: (hit.i + 1) % base[hit.c].length })]);
    const curve = !!segment(a, b);
    start(e, {
      move: pp => {
        const q = curve ? { x: pp.x, y: pp.y } : snapTo(pp, { skip: [refKey({ c: hit.c, i: hit.i }), refKey({ c: hit.c, i: (hit.i + 1) % base[hit.c].length })] });
        write(sym(base, reshapeSegment(base, hit.c, hit.i, hit.t, q.x - p.x, q.y - p.y)));
      },
      up: moved => { if (moved) actions.commit(); }
    });
  };

  /** Pressing on a filled contour: Direct selection picks all its points and drags them, the Selection tool its shape. */
  const onContour = (c: number) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || space) return;
    if (tool === 'object') { grabShape(e, c); return; }
    if (tool !== 'select') return;
    const keys = cs[c].map((_, i) => refKey({ c, i }));
    const all = e.shiftKey ? [...new Set([...sel, ...keys])] : keys;
    setSel(all);
    const refs = all.filter(valid).map(keyRef), p = toFont(e);
    dragAnchors(e, refs, nearestOf(refs, p), p);
  };

  /** Pressing on empty canvas: the pen adds a point (a drag pulls smooth handles), the Shape tool draws
      its shape (Shift keeps it even, Alt draws it from the center), Direct selection
      draws a selection box; with Space held, or the middle button, it pans. */
  const onBackground = (e: ReactPointerEvent) => {
    if (e.button === 1 || (e.button === 0 && space)) {
      const v0 = { sc, ox, oy }, x0 = e.clientX, y0 = e.clientY;
      e.preventDefault();
      const move = (ev: PointerEvent) => setView({ ...v0, ox: v0.ox + ev.clientX - x0, oy: v0.oy + ev.clientY - y0 });
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    if (e.button !== 0) return;
    const p = toFont(e);
    if (tool === 'pen') {
      const base = current().contours;
      let out: Node[][], c: number;
      const last = drawingOk !== null ? base[drawingOk][base[drawingOk].length - 1] : null;
      free.current = e.metaKey || e.ctrlKey;
      const q = snapTo(e.shiftKey && last ? constrain(last, p) : p, { from: last ? [last] : [] });
      if (drawingOk === null) { out = [...base.map(k => k.slice()), [{ x: q.x, y: q.y }]]; c = out.length - 1; }
      else { out = base.map(k => k.slice()); c = drawingOk; out[c] = [...out[c], { x: q.x, y: q.y }]; }
      const r = { c, i: out[c].length - 1 };
      write(out);
      setDrawing(c);
      setSel([refKey(r)]);
      start(e, {
        move: (pp, ev) => { const h = snapTo(ev.shiftKey ? constrain(q, pp) : pp, { live: [refKey(r)], from: [q] }); write(pullHandles(out, r, h)); },
        up: () => actions.commit()
      });
      return;
    }
    if (tool === 'shape') {
      const kind = shape, ar = shapeAspect(kind), was = useEditor.getState().params.outlines, base = current().contours;
      free.current = e.metaKey || e.ctrlKey;
      const a = snapTo(p);
      // the new shape runs the way the letter's biggest contour does, so it fills as that one does
      const big = base.reduce<Node[] | null>((m, k) => !m || Math.abs(contourArea(k)) > Math.abs(contourArea(m)) ? k : m, null);
      const ccw = !big || contourArea(big) >= 0;
      let size = { w: 0, h: 0 };
      if (isStroke(kind)) {
        // a stroke runs from where the drag starts to the pointer (from its middle with ⌥), as thick as the letter's
        const w = strokeW ?? stem();
        start(e, {
          move: (pp, ev) => {
            const b = snapTo(ev.shiftKey ? constrain(a, pp) : pp), o = ev.altKey ? { x: 2 * a.x - b.x, y: 2 * a.y - b.y } : a;
            size = { w: Math.round(Math.hypot(b.x - o.x, b.y - o.y)), h: w };
            write([...base, strokeContour(o, b, w, kind === 'roundstroke', ccw)]);
            setSizeTag({ x: b.x, y: b.y, text: `${size.w} × ${size.h}` });
          },
          up: moved => {
            setSizeTag(null);
            if (!moved) return;
            if (size.w < 2) { actions.setParam('outlines', was); return; }
            actions.commit();
            setSel(current().contours[base.length].map((_, i) => refKey({ c: base.length, i })));
          }
        });
        return;
      }
      start(e, {
        move: (pp, ev) => {
          // Shift: as wide for its height as the shape at its most even, reaching the pointer
          const q = snapTo(pp), dx = q.x - a.x, dy = q.y - a.y, h = Math.max(Math.abs(dx) / ar, Math.abs(dy));
          const b = ev.shiftKey ? { x: a.x + (dx < 0 ? -h * ar : h * ar), y: a.y + (dy < 0 ? -h : h) } : q;
          const o = ev.altKey ? { x: 2 * a.x - b.x, y: 2 * a.y - b.y } : a;
          size = { w: Math.round(Math.abs(b.x - o.x)), h: Math.round(Math.abs(b.y - o.y)) };
          write([...base, shapeContour(kind, o.x, o.y, b.x, b.y, ccw)]);
          setSizeTag({ x: b.x, y: b.y, text: `${size.w} × ${size.h}` });
        },
        up: moved => {
          setSizeTag(null);
          if (!moved) return;
          // too small to be a shape: the letter is left as it was
          if (size.w < 2 || size.h < 2) { actions.setParam('outlines', was); return; }
          actions.commit();
          setSel(current().contours[base.length].map((_, i) => refKey({ c: base.length, i })));
        }
      });
      return;
    }
    // a selection box, in screen px while it's drawn
    const r = svgRef.current!.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, keep = e.shiftKey ? sel : [];
    if (!e.shiftKey) setSel([]);
    start(e, {
      move: (_p, ev) => {
        const ex = ev.clientX - r.left, ey = ev.clientY - r.top;
        setBox({ x0: Math.min(sx, ex), y0: Math.min(sy, ey), x1: Math.max(sx, ex), y1: Math.max(sy, ey) });
        const a = toFont({ clientX: Math.min(sx, ex) + r.left, clientY: Math.max(sy, ey) + r.top });
        const b = toFont({ clientX: Math.max(sx, ex) + r.left, clientY: Math.min(sy, ey) + r.top });
        const inBox = anchorsIn(current().contours, a.x, a.y, b.x, b.y);
        // the Selection tool picks the whole shape of any point in the box
        setSel([...new Set([...keep, ...(tool === 'object' ? [...new Set(inBox.map(k => k.c))].flatMap(shapeKeys) : inBox.map(refKey))])]);
      },
      up: () => setBox(null)
    });
  };

  /** Drag the right edge of the advance to set the letter's width. */
  const onEdge = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const base = current();
    start(e, {
      move: p => write(base.contours, Math.max(0, snapTo({ x: p.x, y: 0 }, { level: true }).x)),
      up: moved => { if (moved) actions.commit(); }
    });
  };

  /** Drag a picked corner's knob into its turn: the picked corners (with the Selection tool, every corner of the picked
      shapes) round by as much, cut or scooped as they are. ⌥-click turns them from round to cut to scooped. */
  const onCornerHandle = (r: Ref) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || space) return;
    const base = current().contours, h = cornerHandle(base, r), n = base[r.c][r.i], alt = e.altKey;
    if (!h) return;
    const refs = (selRefs.some(s => refKey(s) === refKey(r)) ? selRefs : [r]).filter(k => cornerHandle(base, k));
    const most = Math.ceil(Math.max(1, ...refs.map(k => cornerRoom(base[k.c], k.i).most))), r0 = Math.min(n.r ?? 0, most), p0 = toFont(e);
    start(e, {
      move: p => {
        const along = (p.x - p0.x) * h.ux + (p.y - p0.y) * h.uy, v = Math.round(Math.max(0, Math.min(most, r0 + along / h.perR)));
        write(sym(base, setCorners(base, refs, v)));
        setSizeTag({ x: n.x, y: n.y, text: `Radius ${v}` });
      },
      up: moved => {
        setSizeTag(null);
        if (moved) { actions.commit(); return; }
        if (alt) commit(sym(base, setCorners(base, refs, null, CORNER_KINDS[(CORNER_KINDS.indexOf(n.corner ?? 'round') + 1) % CORNER_KINDS.length])));
      }
    });
  };
  /* ---- the picked points as one: the Selection tool's box scales them by its handles and turns them from just outside
     its corners; the bar sizes, turns, flips and thickens them by number. The box stands as turned as they are: as far
     as they were turned while picked, or as their straight sides run (turnOf), and it scales them along its sides. */
  const selKey = selRefs.map(refKey).sort().join(' ');
  const boxDeg = selRefs.length > 1 ? (turned.key === selKey ? turned.deg : turnOf(cs, selRefs)) : 0;
  const frame = selRefs.length > 1 ? frameOf(pickedPoints(cs, selRefs), boxDeg) : null;
  /** An angle in degrees as -180 to 180. */
  const spun = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
  /** The picked points through `m`, mirrored unless it flips them (which runs contours the other way). */
  const mapped = (base: Node[][], m: Affine) => { const out = transformAnchors(base, selRefs, m); return m[0] * m[3] - m[1] * m[2] < 0 ? out : sym(base, out); };
  /** Drag a handle of the box (`hx`, `hy`: -1 its left or bottom, 1 its right or top, 0 its middle, along its own sides):
      the picked points scale from the side across, or with ⌥ from the middle; Shift keeps their proportions. A box
      standing upright lines the handle up with points and guides. */
  const onScale = (hx: number, hy: number) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || space || !frame) return;
    const base = current().contours, f = frame, mid = middleOf(f), skip = selRefs.map(refKey);
    const side = (h: number, lo: number, hi: number, m: number) => (h < 0 ? lo : h > 0 ? hi : m);
    const grip = { u: side(hx, f.x0, f.x1, mid.u), v: side(hy, f.y0, f.y1, mid.v) }, across = { u: side(hx, f.x1, f.x0, mid.u), v: side(hy, f.y1, f.y0, mid.v) };
    const by = (h: number, v: number, g: number, o: number) => (h && Math.abs(g - o) > 0.5 ? (v - o) / (g - o) : 1);
    start(e, {
      move: (p, ev) => {
        const o = ev.altKey ? mid : across, q = f.deg ? p : snapTo(p, { skip, level: true }), w = f.of(q);
        let sx = by(hx, w.u, grip.u, o.u), sy = by(hy, w.v, grip.v, o.v);
        if (ev.shiftKey) {
          if (hx && hy) { const k = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * k; sy = Math.sign(sy || 1) * k; }
          else if (hx) sy = Math.abs(sx); else sx = Math.abs(sy);
        }
        write(mapped(base, scaleAlong(f.at(o.u, o.v), f.deg, sx, sy)));
        setSizeTag({ x: q.x, y: q.y, text: `${Math.round(Math.abs((f.x1 - f.x0) * sx))} × ${Math.round(Math.abs((f.y1 - f.y0) * sy))}` });
      },
      up: moved => { setSizeTag(null); if (moved) actions.commit(); }
    });
  };
  /** Drag from just outside a corner of the box: the picked points turn about its middle, Shift by 15° at a time, and the
      box turns with them. */
  const onTurn = (e: ReactPointerEvent) => {
    if (e.button !== 0 || space || !frame) return;
    const base = current().contours, f = frame, m = middleOf(f), c = f.at(m.u, m.v), p0 = toFont(e), a0 = Math.atan2(p0.y - c.y, p0.x - c.x), was = boxDeg, key = selKey;
    let deg = 0;
    start(e, {
      move: (p, ev) => {
        deg = spun(((Math.atan2(p.y - c.y, p.x - c.x) - a0) * 180) / Math.PI);
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        write(mapped(base, turnAbout(c, deg)));
        setSpin({ deg, f });
        setSizeTag({ x: p.x, y: p.y, text: `${Math.round(deg)}°` });
      },
      up: moved => { setSpin(null); setSizeTag(null); if (moved) { actions.commit(); setTurned({ key, deg: spun(was + deg) }); } }
    });
  };
  /** Size the picked points to a width or height along the box's sides, its left and bottom corner staying put. */
  const resizeTo = (w: number | null, h: number | null) => {
    if (!frame) return;
    const f = frame, bw = f.x1 - f.x0, bh = f.y1 - f.y0;
    const sx = w !== null && bw > 0.5 ? Math.max(1, w) / bw : 1, sy = h !== null && bh > 0.5 ? Math.max(1, h) / bh : 1;
    edit(o => mapped(o, scaleAlong(f.at(f.x0, f.y0), f.deg, sx, sy)));
  };
  /** Turn the picked points about their box's middle, by degrees anticlockwise. */
  const turnBy = (deg: number) => {
    if (!frame || !deg) return;
    const m = middleOf(frame), c = frame.at(m.u, m.v);
    edit(o => mapped(o, turnAbout(c, deg)));
    setTurned({ key: selKey, deg: spun(boxDeg + deg) });
  };
  /** Flip the picked points across their box's middle, along its sides: left ↔ right ('x') or top ↕ bottom ('y'). The
      box stays as it stands. */
  const flip = (axis: Axis) => {
    if (!frame) return;
    const m = middleOf(frame);
    commit(transformAnchors(current().contours, selRefs, scaleAlong(frame.at(m.u, m.v), frame.deg, axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1)));
    setTurned({ key: selKey, deg: boxDeg });
  };
  /** Run the picked shapes the other way round. Their points are numbered the other way now, so the picked ones are
      picked again where they went. */
  const reversePicked = () => {
    const base = current().contours, turned = new Set(pickedContours());
    let out = base;
    for (const c of turned) out = reverseContour(out, c);
    commit(out);
    setSel(selRefs.map(r => refKey(turned.has(r.c) ? { c: r.c, i: base[r.c].length - 1 - r.i } : r)));
  };
  const deletePicked = () => { commit(deleteAnchors(current().contours, selRefs)); setSel([]); setDrawing(null); };
  /** The box as the screen shows it, turned `turn` more about its middle: its middle and the ways to its right side and
      its top, in px. */
  const boxView = (f: Frame, turn = 0) => {
    const m = middleOf(f), c = f.at(m.u, m.v), u = turned2(f.at((f.x1 - f.x0) / 2, 0), turn), v = turned2(f.at(0, (f.y1 - f.y0) / 2), turn);
    return { C: { x: X(c.x), y: Y(c.y) }, U: { x: u.x * sc, y: -u.y * sc }, V: { x: v.x * sc, y: -v.y * sc } };
  };
  /** How thick the picked shapes are (thicknessOf), read again as the outline or the picked points change, but not
      mid-drag. */
  const weightMemo = useRef<{ cs: Node[][]; key: string; w: number } | null>(null);
  const weightNow = () => {
    const w = weightMemo.current;
    if (w && w.key === selKey && (w.cs === cs || gesture.current)) return w.w;
    const g = wholeShapes(cs, pickedContours());
    return (weightMemo.current = { cs, key: selKey, w: thicknessOf(g.map(c => cs[c])) }).w;
  };
  /** The picked points' shapes, by name when they are whole shapes: "2 shapes", or else "12 points". */
  const pickName = () => {
    const keys = new Set(selRefs.map(refKey)), groups = shapeGroups().filter(g => g.some(c => cs[c].some((_, i) => keys.has(refKey({ c, i })))));
    const whole = groups.every(g => g.every(c => cs[c].every((_, i) => keys.has(refKey({ c, i })))));
    return whole ? `${groups.length} shape${groups.length > 1 ? 's' : ''}` : `${selRefs.length} points`;
  };

  /** Corners: the radius of the picked corners (or every corner) pointing out of the ink, or into it, live as a
      slider moves; inside corners of shapes that overlap are found once they are merged, which the first move
      does. One undo step per move of a slider. */
  const cornerTargets = (inside: boolean | null): CornerSet => {
    let base = current().contours;
    if (inside && overlapping(base)) base = mergeShapes(base)?.cs ?? base;
    const at = selRefs.length ? cornersAt(base, selRefs) : cornersAt(base);
    return { cs: base, at: at.filter(k => inside === null || k.inside === inside) };
  };
  const live = useRef<CornerSet | null>(null);
  const cornerSlide = (inside: boolean, kind: CornerKind) => ({
    start: () => { live.current = cornerTargets(inside); if (live.current.cs !== current().contours) setSel([]); },
    set: (v: number) => { const t = live.current ?? cornerTargets(inside); write(setCorners(t.cs, t.at.map(k => k.ref), v, kind)); },
    end: () => { live.current = null; actions.commit(); }
  });
  const cornerKind = (kind: CornerKind) => {
    const t = cornerTargets(null);
    commit(setCorners(t.cs, t.at.map(k => k.ref).filter(r => (t.cs[r.c][r.i].r ?? 0) > 0), null, kind));
  };
  /** Overlaps: the last break, so moving the gap breaks the shapes again from where they were. */
  const lastBreak = useRef<{ from: Node[][]; to: Node[][]; picked: number[] } | null>(null);
  const merge = () => { const m = mergeShapes(current().contours, pickedContours()); if (m) { commit(m.cs); setSel([]); } };
  const cutOutPicked = () => { const out = cutShapes(current().contours, pickedContours()); if (out) { commit(out); setSel([]); } };
  const breakApart = (gap: number, again = false) => {
    const now = current().contours, lb = lastBreak.current;
    const from = again && lb && lb.to === now ? lb.from : now, picked = again && lb && lb.to === now ? lb.picked : pickedContours();
    const b = breakShapes(from, picked, gap);
    if (!b) return false;
    if (again) write(b.cs); else commit(b.cs);
    lastBreak.current = { from, to: current().contours, picked };
    setSel(b.front.flatMap(c => b.cs[c].map((_, i) => refKey({ c, i }))));
    return true;
  };
  const canGapAgain = () => !!lastBreak.current && lastBreak.current.to === current().contours;

  /* ---- zoom: ⌘/Ctrl + wheel (or a pinch) about the pointer; the wheel alone pans */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view ?? fit;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
        const k = Math.exp(-e.deltaY * 0.003), s2 = Math.min(fitSc * ZOOM_MAX, Math.max(fitSc * ZOOM_MIN, v.sc * k)), f = s2 / v.sc;
        setView({ sc: s2, ox: px - (px - v.ox) * f, oy: py - (py - v.oy) * f });
      } else setView({ ...v, ox: v.ox - e.deltaX, oy: v.oy - e.deltaY });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });
  const zoomBy = (k: number) => {
    const v = view ?? fit, s2 = Math.min(fitSc * ZOOM_MAX, Math.max(fitSc * ZOOM_MIN, v.sc * k)), f = s2 / v.sc, px = W / 2, py = H / 2;
    setView({ sc: s2, ox: px - (px - v.ox) * f, oy: py - (py - v.oy) * f });
  };

  /* ---- keys. They're caught before the editor's own shortcuts, so arrows nudge points instead of
     turning to the next letter while points are picked, and Escape lets go of them first. */
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (isTyping(e.target) || (e.target instanceof HTMLInputElement && e.target.type === 'range')) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === ' ' ) { if (!space) setSpace(true); stop(); return; }
    if (mod && (k === '=' || k === '+')) { stop(); zoomBy(1.25); return; }
    if (mod && k === '-') { stop(); zoomBy(0.8); return; }
    if (mod && k === '0') { stop(); setView(null); return; }
    if (mod && k === 'a') { stop(); setSel(cs.flatMap((con, c) => con.map((_, i) => refKey({ c, i })))); return; }
    // ⌘C and ⌘X take the picked points' shapes whole; ⌘V puts them back where they were, in this letter or another
    if (mod && (k === 'c' || k === 'x') && selRefs.length) {
      stop();
      const now = current().contours, cc = wholeShapes(now, pickedContours());
      clipboard = { contours: cc.map(c => now[c].map(n => ({ ...n }))), way: wayOf(now) };
      if (k === 'x') { commit(now.filter((_, c) => !cc.includes(c))); setSel([]); setDrawing(null); }
      return;
    }
    if (mod && k === 'v' && clipboard) {
      stop();
      finish();
      // run the way this letter's outline runs, so they fill as its shapes do
      const now = current().contours, turn = now.length > 0 && wayOf(now) !== clipboard.way;
      const add = clipboard.contours.map(con => (turn ? reverseContour([con], 0)[0] : con.map(n => ({ ...n }))));
      commit([...now, ...add]);
      setSel(add.flatMap((con, j) => con.map((_, i) => refKey({ c: now.length + j, i }))));
      return;
    }
    if (mod) return;
    if (e.key === 'Escape' || e.key === 'Enter') {
      // a menu open on the bar (Snap's, the actions') takes Escape to close, and what is picked stays picked
      if (e.key === 'Escape' && bar.current?.querySelector('.popover')) return;
      if (drawingOk !== null) { stop(); finish(); return; }
      if (e.key === 'Escape' && selRefs.length) { stop(); setSel([]); return; }
      return;
    }
    const keyTool = toolForKey(k, e.shiftKey), keyShape = shapeForKey(k);
    if (keyTool) { stop(); setTool(keyTool); if (keyTool !== 'pen') finish(); return; }
    if (keyShape) { stop(); pickShape(keyShape); finish(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selRefs.length) { stop(); deletePicked(); return; }
    const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (arrow && selRefs.length) {
      stop();
      const d = e.shiftKey ? 10 : 1;
      nudge(selRefs, arrow[0] * d, arrow[1] * d);
    }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current(e);
    const up = (e: KeyboardEvent) => { if (e.key === ' ') setSpace(false); };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
  }, []);

  /* ---- drawing */
  const d = cmdsToD(drawnCmds(cs));
  // bigger contours first, so a smaller one on top (a counter) is the one clicked inside it
  const order = cs.map((con, c) => ({ c, a: Math.abs(contourArea(con)) })).sort((a, b) => b.a - a.a).map(o => o.c);
  const selSet = new Set(selRefs.map(refKey));
  // handles show on picked points and on the ends of their segments that face them
  const showH = new Set<string>();
  // (the Selection tool takes shapes whole, so it shows no handles)
  if (tool !== 'object') selRefs.forEach(({ c, i }) => {
    const n = cs[c].length;
    showH.add(`${c}:${i}:i`); showH.add(`${c}:${i}:o`);
    showH.add(`${c}:${(i + n - 1) % n}:o`); showH.add(`${c}:${(i + 1) % n}:i`);
  });
  const last = drawingOk !== null ? cs[drawingOk][cs[drawingOk].length - 1] : null;
  const guides = guideLines(m);
  const labelY = stackLabels(guides.map(([id, y]) => [id, y] as const), Y);
  // the construction grid's lines and circles, taken hold of with the selection tools (in the advance box, between the
  // letter's fill and its outline, so its points and segments still come first), changing this letter alone: what a
  // drag changed goes on to the others as any edit here does (CarryOffer). A drag lets the points picked go, as it can
  // put points in where a circle's curves end
  const gridDrag = useGridDrag({
    ch, font, grid, view: { sc, ox, oy }, box: { x0: X(0), y0: Y(top - 40), x1: X(doc.adv), y1: Y(bot + 20) }, size: { W, H },
    heights: guides.map(([, y]) => y), hold: () => {}, alone: true, enabled: tool === 'object' || tool === 'select', onStart: () => setSel([])
  });
  const one = selRefs.length === 1 ? cs[selRefs[0].c][selRefs[0].i] : null;
  // whole shapes picked, with their box: the bar gives their size, turn and weight, and the flips
  const boxed = frame !== null && (tool === 'object' || tool === 'shape');
  // the bar's actions on what is picked, each null where it doesn't apply, and those the bar shows as buttons
  const [pinned, setPinnedNow] = useState<ActId[]>(savedActs);
  const bar = useRef<HTMLDivElement>(null);
  const setPinned = (ids: ActId[]) => { setPinnedNow(ids); writePref(PREFS.penActions, JSON.stringify(ids)); };
  const acts: Record<ActId, (() => void) | null> = {
    flipX: boxed ? () => flip('x') : null, flipY: boxed ? () => flip('y') : null,
    reverse: selRefs.length ? reversePicked : null, delete: selRefs.length ? deletePicked : null
  };
  // the picked corners, each with a handle to drag its radius by; and where corners are rounded, the outline as the points draw it
  const pickedCorners = selRefs.map(r => ({ r, h: cornerHandle(cs, r) })).filter((k): k is { r: Ref; h: NonNullable<ReturnType<typeof cornerHandle>> } => !!k.h);
  const rounded = cs.some(con => con.some(n => n.r));
  const cornerR = pickedCorners.length ? Math.max(...pickedCorners.map(k => cs[k.r.c][k.r.i].r ?? 0)) : 0;
  // the rounding knobs: on Direct selection's picked corners, and on every corner of the Selection tool's picked shapes
  // while their box is big enough on screen (each where its sides leave a little room to round)
  const knobs = tool === 'select' ? pickedCorners
    : tool === 'object' && frame && !spin && drawingOk === null && (frame.x1 - frame.x0) * sc >= ROUND_ROOM && (frame.y1 - frame.y0) * sc >= ROUND_ROOM
      ? pickedCorners.filter(k => cornerRoom(cs[k.r.c], k.r.i).most * sc >= 6) : [];
  const count = cs.reduce((a, c) => a + c.length, 0);
  const cursor = space ? 'grab' : tool === 'pen' || tool === 'shape' ? 'crosshair' : 'default';
  // what a click would do under the pointer: the pen adds a point on the outline, or closes the
  // contour being drawn on its first point; the Shape tool adds its shape. (Over another point, nothing shows.)
  let aim: Aim | null = null;
  if (ptr && !space && !gesture.current && !box) {
    if (tool === 'shape') aim = { kind: 'shape', shape };
    else if (tool === 'pen') {
      let near: Ref | null = null, nd = HIT;
      for (let c = 0; c < cs.length; c++) for (let i = 0; i < cs[c].length; i++) {
        const dd = Math.hypot(cs[c][i].x - ptr.x, cs[c][i].y - ptr.y) * sc;
        if (dd <= nd) { nd = dd; near = { c, i }; }
      }
      if (near) {
        if (drawingOk === near.c && near.i === 0 && cs[near.c].length > 1) aim = { kind: 'close' };
      } else if (drawingOk === null) {
        const hit = nearestSegment(cs, ptr);
        if (hit && hit.d * sc <= HIT) aim = { kind: 'add', at: pointOn(cs, hit.c, hit.i, hit.t) };
      }
    }
  }
  // with Mirror, the letter's middle on each axis, and the partners of the picked points, which move the other way
  const lines = mirror.map(axis => ({ axis, at: mirrorLine(cs, axis) }));
  const twins = new Set([...withTwins(selRefs.map(refKey))].filter(k => !selSet.has(k)));

  return (
    <div className="pen-wrap">
      <div className="pen-tools" role="toolbar" aria-label="Pen tools">
        {TOOLS.map(t => (
          <button key={t.id} className={tool === t.id ? 'on' : undefined} aria-pressed={tool === t.id} title={`${t.label} (${t.key})`}
            onClick={() => { setTool(t.id); if (t.id !== 'pen') finish(); }}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">{t.icon}</svg>
          </button>
        ))}
        <ShapeTool shape={shape} on={tool === 'shape'} onPick={k => { pickShape(k); finish(); }} />
        <span className="pen-sep" />
        <CornerMenu cs={cs} picked={selRefs} targets={cornerTargets} slide={cornerSlide} onKind={cornerKind} />
        <OverlapMenu cs={cs} picked={pickedContours().length} stem={font.m.s} onMerge={merge} onCut={cutOutPicked} onBreak={breakApart} canAgain={canGapAgain} />
        <span className="pen-sep" />
        <button title="Zoom in (⌘+)" aria-label="Zoom in" onClick={() => zoomBy(1.25)}><svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 5v10M5 10h10" /></svg></button>
        <button title="Zoom out (⌘−)" aria-label="Zoom out" onClick={() => zoomBy(0.8)}><svg width="20" height="20" viewBox="0 0 20 20"><path d="M5 10h10" /></svg></button>
        <button title="Fit the letter (⌘0)" aria-label="Fit the letter" onClick={() => setView(null)}><svg width="20" height="20" viewBox="0 0 20 20"><path d="M4 8V4h4M12 4h4v4M16 12v4h-4M8 16H4v-4" /></svg></button>
      </div>

      <div className="pen-canvas" ref={ref} style={{ cursor }}>
        {size.width > 0 && (
          <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} onPointerMove={e => setPtr(toFont(e))} onPointerLeave={() => setPtr(null)}>
            <rect className="pen-bg" width={W} height={H} onPointerDown={onBackground} />
            <g pointerEvents="none">
              <rect className="i-adv" x={n1(X(0))} y={n1(Y(top - 40))} width={n1(doc.adv * sc)} height={n1((top - 40 - bot - 20) * sc)} />
              {guides.map(([id, y, label]) => (
                <g key={id}>
                  <line className="i-guide" x1={0} x2={W} y1={n1(Y(y))} y2={n1(Y(y))} />
                  <text className="i-label" x={64} y={n1(labelY.get(id)!)}>{label} <tspan className="pen-num">{Math.round(y)}</tspan></text>
                </g>
              ))}
              {caught?.gx && <line className="pen-snap" x1={n1(X(caught.gx.v))} x2={n1(X(caught.gx.v))} y1={0} y2={H} />}
              {caught?.gy && <line className="pen-snap" x1={0} x2={W} y1={n1(Y(caught.gy.v))} y2={n1(Y(caught.gy.v))} />}
              {lines.map(({ axis, at }) => axis === 'x'
                ? <line key={axis} className="pen-axis" x1={n1(X(at))} x2={n1(X(at))} y1={0} y2={H} />
                : <line key={axis} className="pen-axis" x1={0} x2={W} y1={n1(Y(at))} y2={n1(Y(at))} />)}
            </g>
            <g transform={`translate(${n1(ox)},${n1(oy)}) scale(${sc.toFixed(5)})`}>
              <path className="pen-ink" d={d} />
              {grid && <GridLines grid={grid} />}
              {order.map(c => (
                <path key={c} className={tool === 'select' || tool === 'object' ? 'pen-fill hit' : 'pen-fill'} d={cmdsToD(drawnCmds([cs[c]]))}
                  onPointerDown={tool === 'select' || tool === 'object' ? onContour(c) : onBackground} />
              ))}
            </g>
            {gridDrag.lines}
            <g transform={`translate(${n1(ox)},${n1(oy)}) scale(${sc.toFixed(5)})`}>
              {rounded && <path className="pen-sharp" d={cmdsToD(drawnCmds(cs, true))} />}
              <path className="pen-line" d={d} style={{ strokeWidth: 1.25 / sc }} />
              <path className="pen-seg" d={d} style={{ strokeWidth: (HIT * 2) / sc }} onPointerDown={onSegment} />
            </g>
            {/* the rubber band from the last point drawn to the pointer */}
            {last && ptr && tool === 'pen' && !gesture.current && (
              <path className="pen-band" d={`M${n1(X(last.x))} ${n1(Y(last.y))}` + (hasOut(last)
                ? `Q${n1(X(last.ox!))} ${n1(Y(last.oy!))} ${n1(X(ptr.x))} ${n1(Y(ptr.y))}` : `L${n1(X(ptr.x))} ${n1(Y(ptr.y))}`)} />
            )}
            {/* the advance's right edge sets the width */}
            <line className="pen-edge" x1={n1(X(doc.adv))} x2={n1(X(doc.adv))} y1={n1(Y(top - 40))} y2={n1(Y(bot + 20))} onPointerDown={onEdge}>
              <title>Drag to set the width</title>
            </line>
            {cs.map((con, c) => con.map((n, i) => {
              const hs: ReactNode[] = [];
              const k = `${c}:${i}`;
              if (hasIn(n) && showH.has(`${k}:i`)) hs.push(<Handle key="i" ax={X(n.x)} ay={Y(n.y)} x={X(n.ix!)} y={Y(n.iy!)} onDown={onHandle({ c, i }, 'i')} />);
              if (hasOut(n) && showH.has(`${k}:o`)) hs.push(<Handle key="o" ax={X(n.x)} ay={Y(n.y)} x={X(n.ox!)} y={Y(n.oy!)} onDown={onHandle({ c, i }, 'o')} />);
              return hs.length ? <g key={k}>{hs}</g> : null;
            }))}
            {cs.map((con, c) => con.map((n, i) => {
              const k = `${c}:${i}`, on = selSet.has(k), first = drawingOk === c && i === 0 && con.length > 1;
              const x = n1(X(n.x)), y = n1(Y(n.y));
              return (
                <g key={k} className={['pen-pt', on && 'on', twins.has(k) && 'twin', first && 'first'].filter(Boolean).join(' ')}
                  onPointerDown={onAnchor({ c, i })} onDoubleClick={() => { if (tool === 'select') edit(o => toggleSmooth(o, { c, i })); }}>
                  <circle className="grab" cx={x} cy={y} r={HIT} />
                  {n.s ? <circle cx={x} cy={y} r={4} /> : <rect x={x - 3.5} y={y - 3.5} width={7} height={7} />}
                </g>
              );
            }))}
            {tool === 'object' && drawingOk === null && (spin ? <XfBox {...boxView(spin.f, spin.deg)} />
              : frame && <XfBox {...boxView(frame)} onScale={onScale} onTurn={onTurn} />)}
            {knobs.map(({ r, h }) => {
              const n = cs[r.c][r.i], at = Math.max(h.at, 16 / sc), x = n1(X(n.x + h.ux * at)), y = n1(Y(n.y + h.uy * at));
              return (
                <g key={refKey(r)} className="pen-corner" style={{ cursor: ROUND_CURSOR }} onPointerDown={onCornerHandle(r)}>
                  <title>{tool === 'object' ? 'Drag into the corner to round the shapes’ corners · ⌥-click: round, cut or scooped' : 'Drag into the corner to round it · ⌥-click: round, cut or scooped'}</title>
                  <circle className="grab" cx={x} cy={y} r={HIT} />
                  <circle cx={x} cy={y} r={4.5} />
                  <circle className="dot" cx={x} cy={y} r={1.5} />
                </g>
              );
            })}
            {aim?.kind === 'add' && (
              <g className="pen-ghost" pointerEvents="none">
                <circle cx={n1(X(aim.at.x))} cy={n1(Y(aim.at.y))} r={4.5} />
                <path d={`M${n1(X(aim.at.x) - 2.5)} ${n1(Y(aim.at.y))}h5M${n1(X(aim.at.x))} ${n1(Y(aim.at.y) - 2.5)}v5`} />
              </g>
            )}
            {aim && aim.kind !== 'add' && ptr && <AimBadge aim={aim} x={X(ptr.x)} y={Y(ptr.y)} />}
            {sizeTag && <text className="pen-size" x={n1(X(sizeTag.x) + 10)} y={n1(Y(sizeTag.y) + 20)}>{sizeTag.text}</text>}
            {box && <rect className="pen-box" x={box.x0} y={box.y0} width={box.x1 - box.x0} height={box.y1 - box.y0} />}
            {caught && <SnapMark hit={caught} x={X(caught.x)} y={Y(caught.y)} />}
          </svg>
        )}
        {gridDrag.overlay}
        <span className="pen-stats">{count} points · {Math.round(sc / fitSc * 100)}%</span>
        <CarryOffer ch={ch} g={g} font={font} picked={sel.filter(valid)} />
      </div>

      {/* the bar: on the left what is picked and its numbers, or with nothing picked the tool and how it works, and at
          its end the actions pinned to the bar, always there and dimmed where they don't apply to what is picked (⋯ has
          them all); on the right the aids every edit goes through, Mirror and Snap, and then the letter's own width.
          (How many points and how far in sit in the canvas's corner, so the right side stays put as things are
          picked) */}
      <div className="pen-bar" ref={bar}>
        <div className="pen-bar-main">
          {one ? (
            <>
              <span className="pen-bar-label">Point</span>
              <NumField label="X" value={one.x} onSet={v => nudge(selRefs, v - one.x, 0)} />
              <NumField label="Y" value={one.y} onSet={v => nudge(selRefs, 0, v - one.y)} />
              <PointKind smooth={!!one.s} onSet={s => edit(o => setSmooth(o, selRefs, s))} />
              {pickedCorners.length > 0 && <NumField label="Radius" value={cornerR} onSet={v => edit(o => setCorners(o, pickedCorners.map(k => k.r), Math.max(0, v)))} />}
            </>
          ) : boxed ? (
            <>
              <span className="pen-bar-label">{pickName()}</span>
              <NumField label="W" name="Width of the picked shapes" title="Width, along the box’s sides" value={frame.x1 - frame.x0} onSet={v => resizeTo(v, null)} />
              <NumField label="H" name="Height of the picked shapes" title="Height, along the box’s sides" value={frame.y1 - frame.y0} onSet={v => resizeTo(null, v)} />
              <NumField label={<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 12h10M2 12l7-8.5" /><path d="M6.6 12a4.6 4.6 0 00-1.4-3.3" /></svg>}
                name="Turn" title="Turn: degrees anticlockwise about their middle (or drag just outside a corner of the box)" value={boxDeg} onSet={v => turnBy(v - boxDeg)} />
              <NumField label="Weight" title="Weight: how thick the picked shapes are. Their sides move out or in, keeping their points; a bar grows across, not along"
                value={weightNow()} onSet={v => edit(o => setWeight(o, pickedContours(), Math.max(1, v)))} />
            </>
          ) : selRefs.length > 1 ? (
            <>
              <span className="pen-bar-label">{selRefs.length} points</span>
              <PointKind smooth={selRefs.every(r => cs[r.c][r.i].s)} onSet={s => edit(o => setSmooth(o, selRefs, s))} />
              {pickedCorners.length > 0 && <NumField label="Radius" value={cornerR} onSet={v => edit(o => setCorners(o, pickedCorners.map(k => k.r), Math.max(0, v)))} />}
            </>
          ) : (
            <>
              <span className="pen-bar-label">{tool === 'shape' ? SHAPE_INFO[shape].label : TOOLS.find(t => t.id === tool)!.label}</span>
              {tool === 'shape' && isStroke(shape) && <NumField label="Thickness" value={strokeW ?? stem()} onSet={v => setStrokeW(Math.max(1, v))} />}
              <Tips tips={tipsFor(tool, drawingOk !== null, shape)} />
            </>
          )}
          <span className="pen-acts">
            {ACTS.filter(a => pinned.includes(a.id)).map(a => (
              <button key={a.id} className="pen-icon-btn" aria-label={a.label} title={a.title} disabled={!acts[a.id]} onClick={() => acts[a.id]?.()}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{a.icon}</svg>
              </button>
            ))}
            <ActMenu acts={acts} pinned={pinned} onPin={setPinned} />
          </span>
        </div>
        <div className="pen-bar-side">
          <Mirror axes={mirror} onSet={actions.setMirror} />
          <SnapMenu snap={snap} onSet={actions.setSnap} />
          <span className="pen-bar-letter">
            <NumField label="Width" title="The letter’s width: where the next letter starts" value={doc.adv} onSet={v => commit(current().contours, Math.max(0, v))} />
          </span>
        </div>
      </div>
    </div>
  );
}

/** How each tool works, as gestures and what they do, the most needed first: the bar shows as many as fit. */
function tipsFor(tool: Tool, drawing: boolean, shape: Shape): [string, string][] {
  if (tool === 'object') return [['Click', 'pick a shape'], ['Drag', 'move it'], ['⌥-drag', 'copy it'], ['⌘C ⌘V', 'to another letter'],
    ['Drag a handle', 'resize'], ['Drag just outside a corner', 'turn'], ['Drag the knob inside', 'round']];
  if (tool === 'pen') return drawing ? [['Click', 'add a point'], ['Drag', 'pull a curve'], ['Click the first point', 'close'], ['Esc', 'finish']]
    : [['Click the outline', 'add a point'], ['Click a point', 'delete it'], ['Click empty space', 'start a new shape']];
  if (tool === 'convert') return [['Click a point', 'corner ↔ smooth'], ['Drag from a point', 'pull out handles']];
  if (tool === 'shape') return [['Drag', `add ${SHAPE_INFO[shape].hint}`], ['Shift-drag', SHAPE_INFO[shape].shift], ['⌥-drag', 'from the center'], ['⌘-drag', 'don’t snap']];
  return [['Drag', 'points, handles, curves'], ['Shift-click', 'pick more'], ['Drag a box', 'pick several'], ['Arrows', 'nudge (Shift ×10)'],
    ['⌘-drag', 'don’t snap'], ['Space-drag', 'pan'], ['⌘-scroll', 'zoom']];
}

/** The tips in one line, each a gesture and what it does: those that don't fit drop off the end, and the line's tooltip
    lists them all. */
function Tips({ tips }: { tips: [string, string][] }) {
  return (
    <span className="pen-tips" title={tips.map(([k, v]) => `${k}: ${v}`).join('\n')}>
      {tips.map(([k, v]) => <span key={k + v} className="pen-tip"><b>{k}</b> {v}</span>)}
    </span>
  );
}

/** By the pointer, a small badge for what a click will do: by a little shape, + adds that shape; ○
    closes the contour. (A point added on the outline shows as its ghost instead.) */
function AimBadge({ aim, x, y }: { aim: Exclude<Aim, { kind: 'add' }>; x: number; y: number }) {
  const shape = aim.kind === 'shape' ? aim.shape : null;
  const cx = x + (shape ? 25 : 13), cy = y + (shape ? 22 : 13);
  return (
    <g className="pen-aim" pointerEvents="none">
      {shape && <svg className="pen-aim-shape" x={n1(x + 7)} y={n1(y + 6)} width={19} height={19} viewBox="0 0 20 20" overflow="visible">{SHAPE_INFO[shape].icon}</svg>}
      <circle cx={n1(cx)} cy={n1(cy)} r={6} />
      {aim.kind === 'close' ? <circle className="mark" cx={n1(cx)} cy={n1(cy)} r={2.4} />
        : <path className="mark" d={`M${n1(cx - 3)} ${n1(cy)}h6` + `M${n1(cx)} ${n1(cy - 3)}v6`} />}
    </g>
  );
}

/** The Selection tool's box round the picked points, in screen px: its middle `C` and the ways from it to its right side
    `U` and its top `V`, which turn with it. A handle at each corner and, where there is room, in the middle of each side
    scales them, and round each corner outside the box is a place to drag that turns them. Without `onScale`, the box
    alone, as it turns. */
function XfBox({ C, U, V, onScale, onTurn }: {
  C: P; U: P; V: P; onScale?: (hx: number, hy: number) => (e: ReactPointerEvent) => void; onTurn?: (e: ReactPointerEvent) => void;
}) {
  const at = (hx: number, hy: number) => ({ x: C.x + hx * U.x + hy * V.x, y: C.y + hx * U.y + hy * V.y });
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const outline = <path className="pen-xf-box" d={'M' + corners.map(([hx, hy]) => { const p = at(hx, hy); return `${n1(p.x)} ${n1(p.y)}`; }).join('L') + 'Z'} />;
  if (!onScale || !onTurn) return outline;
  const wide = 2 * Math.hypot(U.x, U.y), tall = 2 * Math.hypot(V.x, V.y);
  const handles = [...corners, ...(wide >= 40 ? [[0, -1], [0, 1]] : []), ...(tall >= 40 ? [[-1, 0], [1, 0]] : [])];
  const unit = (p: P, or: P) => { const l = Math.hypot(p.x, p.y); return l > 0.5 ? { x: p.x / l, y: p.y / l } : or; };
  // a handle's resize cursor, by the way it lies from the middle
  const resize = (hx: number, hy: number) => {
    const p = at(hx, hy), k = ((Math.round(Math.atan2(p.y - C.y, p.x - C.x) / (Math.PI / 4)) % 4) + 4) % 4;
    return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][k];
  };
  return (
    <g className="pen-xf">
      {outline}
      {corners.map(([hx, hy]) => {
        // three quarters of a round about the corner, outside the box: from along one side, round, to along the other
        const p = at(hx, hy), e1 = unit({ x: -hx * U.x, y: -hx * U.y }, { x: -hx, y: 0 }), e2 = unit({ x: -hy * V.x, y: -hy * V.y }, { x: 0, y: hy });
        const a0 = Math.atan2(e1.y, e1.x), inside = Math.atan2(e1.y + e2.y, e1.x + e2.x), way = Math.sin(inside - a0) > 0 ? -1 : 1;
        const pts = Array.from({ length: 13 }, (_, k) => {
          const a = a0 + (way * k * 1.5 * Math.PI) / 12;
          return `${n1(p.x + TURN_REACH * Math.cos(a))} ${n1(p.y + TURN_REACH * Math.sin(a))}`;
        });
        const facing = Math.round(((Math.atan2(-(e1.y + e2.y), -(e1.x + e2.x)) * 180) / Math.PI) / 5) * 5;
        return (
          <path key={`t${hx}${hy}`} className="pen-xf-turn" style={{ cursor: turnCursor(facing) }}
            d={`M${n1(p.x)} ${n1(p.y)}L${pts.join('L')}Z`} onPointerDown={onTurn}><title>Drag to turn</title></path>
        );
      })}
      {handles.map(([hx, hy]) => {
        const p = at(hx, hy);
        return (
          <g key={`h${hx}${hy}`} className="pen-xf-h" style={{ cursor: resize(hx, hy) }} onPointerDown={onScale(hx, hy)}>
            <rect className="grab" x={n1(p.x - HIT)} y={n1(p.y - HIT)} width={HIT * 2} height={HIT * 2} />
            <rect x={n1(p.x - 3.5)} y={n1(p.y - 3.5)} width={7} height={7} transform={`rotate(${n1((Math.atan2(U.y, U.x) * 180) / Math.PI)} ${n1(p.x)} ${n1(p.y)})`} />
          </g>
        );
      })}
    </g>
  );
}

/** The Shape tool's button, showing the shape it draws; it opens a menu of the shapes to pick from. */
function ShapeTool({ shape, on, onPick }: { shape: Shape; on: boolean; onPick: (k: Shape) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, setOpen, wrap, true);
  const cur = SHAPE_INFO[shape];
  return (
    <div className="pen-shape-tool" ref={wrap}>
      <button className={on ? 'on' : undefined} aria-pressed={on} aria-haspopup="true" aria-expanded={open} title={`Shape: ${cur.label} (${SHAPES.flatMap(s => SHAPE_INFO[s].key ?? []).join(', ')}) · click to pick another`}
        onClick={() => { if (!on) onPick(shape); setOpen(o => !o); }}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">{cur.icon}<path className="fill corner" d="M19 15.5V19h-3.5z" /></svg>
      </button>
      {open && (
        <div className="pen-shape-menu" role="menu" aria-label="Shapes">
          {SHAPES.map(k => {
            const o = SHAPE_INFO[k];
            return (
              <button key={k} role="menuitemradio" aria-checked={k === shape} className={k === shape ? 'on' : undefined}
                onClick={() => { onPick(k); setOpen(false); }}>
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">{o.icon}</svg>
                <span>{o.label}</span>
                {o.key && <kbd>{o.key}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A corner kind's 16 × 16 icon: a round, a straight cut across, a round scooped out. */
const CORNER_INFO: Record<CornerKind, { label: string; icon: ReactNode }> = {
  round: { label: 'Round', icon: <path d="M3 13.5V8.5a5 5 0 015-5h5.5" /> },
  cut: { label: 'Cut', icon: <path d="M3 13.5V8.5l5-5h5.5" /> },
  scoop: { label: 'Scoop', icon: <path d="M3 13.5V8.5A5 5 0 008 3.5h5.5" /> }
};

/** The most common of some values (the first of those tied), or `none` when there are none. */
function most<T>(vs: T[], none: T): T {
  const n = new Map<T, number>();
  for (const v of vs) n.set(v, (n.get(v) ?? 0) + 1);
  let best = none, bn = 0;
  for (const [v, k] of n) if (k > bn) { best = v; bn = k; }
  return best;
}

/** A slider moved live, with its number beside it: `onStart` as a move begins, `onSet` with each value, `onEnd`
    once it ends (pointer up, a key let go, or the number typed). */
function LiveRange({ label, title, value, max, onStart, onSet, onEnd }: {
  label: string; title: string; value: number; max: number; onStart?: () => void; onSet: (v: number) => void; onEnd?: () => void;
}) {
  const going = useRef(false);
  // (while it moves, it shows its own value: what it reaches may be read again only once it stops)
  const [held, setHeld] = useState<number | null>(null);
  const begin = () => { if (!going.current) { going.current = true; onStart?.(); } };
  const end = () => { if (going.current) { going.current = false; setHeld(null); onEnd?.(); } };
  const v = Math.min(held ?? value, max);
  return (
    <div className="pen-range" title={title}>
      <span>{label}</span>
      <input type="range" aria-label={label} min={0} max={max} step={1} value={v} style={{ '--v': max ? v / max : 0 } as CSSProperties}
        onPointerDown={begin} onKeyDown={begin} onChange={e => { begin(); setHeld(Number(e.target.value)); onSet(Number(e.target.value)); }} onPointerUp={end} onKeyUp={end} onBlur={end} />
      <NumField label={label} value={held ?? value} onSet={x => { begin(); onSet(Math.max(0, x)); end(); }} />
    </div>
  );
}

/** What one of the Corners sliders reaches: how many corners, the radius most of them have, the most any has room for,
    and whether overlapping shapes merge first; and the corner kind most rounded corners are. */
interface CornerRead { n: number; r: number; max: number; merges: boolean }
interface CornerInfo { out: CornerRead; in: CornerRead; kind: CornerKind }
/** The corners a Corners slider reaches, and the outline they are in (the letter's, or its overlapping shapes merged). */
interface CornerSet { cs: Node[][]; at: CornerAt[] }

/** Corners: round, cut or scoop the picked corners, or every corner of the letter, by a radius for the ones pointing
    out of the ink and another for the ones pointing in (where strokes meet). */
function CornerMenu({ cs, picked, targets, slide, onKind }: {
  cs: Node[][]; picked: Ref[]; targets: (inside: boolean | null) => CornerSet;
  slide: (inside: boolean, kind: CornerKind) => { start: () => void; set: (v: number) => void; end: () => void }; onKind: (k: CornerKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, setOpen, wrap, true);
  const pickKey = picked.map(refKey).join(' ');
  // what each slider reaches, and the radius most of those corners have now: found again as the outline changes, but
  // not while a slider moves (the corners it reaches stay the ones it started with), and once more when it stops
  const sliding = useRef(false), [after, setAfter] = useState(0);
  const lastInfo = useRef<CornerInfo | null>(null);
  const info = useMemo((): CornerInfo | null => {
    if (!open) return null;
    if (sliding.current && lastInfo.current) return lastInfo.current;
    const sets = [targets(false), targets(true)];
    const read = ({ cs: c, at }: CornerSet): CornerRead =>
      ({ n: at.length, r: most(at.map(k => c[k.ref.c][k.ref.i].r ?? 0), 0), max: Math.max(1, Math.ceil(Math.max(0, ...at.map(k => k.most)))), merges: c !== cs });
    const kinds = sets.flatMap(t => t.at.map(k => t.cs[k.ref.c][k.ref.i])).filter(n => n.r).map(n => n.corner ?? 'round');
    return (lastInfo.current = { out: read(sets[0]), in: read(sets[1]), kind: most<CornerKind>(kinds, 'round') });
  }, [open, cs, pickKey, after]); // (targets reads the picked points and the outline, which pickKey and cs stand for)
  const [kind, setKind] = useState<CornerKind | null>(null);
  const k = kind ?? info?.kind ?? 'round';
  const row = (inside: boolean) => {
    const r = inside ? info!.in : info!.out, s = slide(inside, k);
    return (
      <>
        <LiveRange label={inside ? 'Inside' : 'Outside'} value={r.r} max={r.max} onSet={s.set}
          onStart={() => { sliding.current = true; s.start(); }} onEnd={() => { sliding.current = false; s.end(); setAfter(a => a + 1); }}
          title={inside ? 'Corners pointing into the ink: where strokes meet, and the corners of counters' : 'Corners pointing out of the ink: the ends of strokes, and a letter’s outer corners'} />
        {inside && r.merges && <small className="pen-menu-note">Overlapping shapes merge first, so the corners where they meet round too</small>}
      </>
    );
  };
  return (
    <div className="pen-shape-tool" ref={wrap}>
      <button className={open ? 'on' : undefined} aria-haspopup="true" aria-expanded={open} title="Corners: round the corners, out and in"
        onClick={() => { setKind(null); setOpen(o => !o); }}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16.5V10a6 6 0 016-6h6.5" /><path className="fill corner" d="M19 15.5V19h-3.5z" /></svg>
      </button>
      {open && info && (
        <div className="pen-shape-menu pen-tool-menu" role="group" aria-label="Corners">
          <div className="pen-menu-head">{picked.length ? 'Picked corners' : 'Every corner'}</div>
          <div className="pen-kind pen-corner-kinds" role="radiogroup" aria-label="Corner shape">
            {CORNER_KINDS.map(c => (
              <button key={c} role="radio" aria-checked={c === k} className={c === k ? 'on' : undefined} title={CORNER_INFO[c].label}
                onClick={() => { setKind(c); onKind(c); }}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{CORNER_INFO[c].icon}</svg>{CORNER_INFO[c].label}
              </button>
            ))}
          </div>
          {info.out.n > 0 ? row(false) : <small className="pen-menu-note">No outside corners here</small>}
          {info.in.n > 0 ? row(true) : <small className="pen-menu-note">No inside corners here</small>}
        </div>
      )}
    </div>
  );
}

/** Overlaps: shapes that run into each other merged into one outline, the picked ones cut out of the rest, or broken
    apart, the shapes underneath cut a gap short of the ones in front. */
function OverlapMenu({ cs, picked, stem, onMerge, onCut, onBreak, canAgain }: {
  cs: Node[][]; picked: number; stem: number; onMerge: () => void; onCut: () => void; onBreak: (gap: number, again?: boolean) => boolean; canAgain: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, setOpen, wrap, true);
  // whether shapes overlap, found again as the outline changes (not while the gap moves: that only breaks them again)
  const sliding = useRef(false), lastOver = useRef(false), [after, setAfter] = useState(0);
  const over = useMemo(() => (lastOver.current = !open ? false : sliding.current ? lastOver.current : overlapping(cs)), [open, cs, after]);
  const [gap, setGap] = useState<number | null>(null);
  const g = gap ?? Math.max(4, Math.round(stem * 0.25)), max = Math.max(40, Math.round(stem));
  const acts: { id: string; label: string; title: string; off: boolean; run: () => void; icon: ReactNode }[] = [
    { id: 'merge', label: 'Merge', title: picked ? 'Join the picked shapes and the ones they overlap into one outline' : 'Join the shapes that overlap into one outline', off: !over, run: onMerge,
      icon: <path d="M2.5 2.5h7v4h4v7h-7v-4h-4z" /> },
    { id: 'cut', label: 'Cut out', title: picked ? 'Cut the picked shape out of the shapes it overlaps' : 'Pick a shape to cut it out of the ones under it', off: !over || !picked, run: onCut,
      icon: <><path d="M2.5 2.5h7v4h-3v3h-4z" /><path d="M6.5 6.5h7v7h-7z" strokeDasharray="1.6 1.6" /></> },
    { id: 'break', label: 'Break apart', title: picked ? 'Cut a gap in the shapes under the picked one, so they no longer touch' : 'Cut a gap in each shape where one drawn after it runs over it', off: !over, run: () => onBreak(g),
      icon: <><path d="M6.5 2.5v4.2M6.5 9.3v4.2M9.5 2.5v4.2M9.5 9.3v4.2" /><path d="M2.5 6.5h11v3h-11z" /></> }
  ];
  return (
    <div className="pen-shape-tool" ref={wrap}>
      <button className={open ? 'on' : undefined} aria-haspopup="true" aria-expanded={open} title="Overlaps: merge, cut out or break apart shapes that overlap"
        onClick={() => setOpen(o => !o)}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="3.5" y="3.5" width="8.5" height="8.5" rx="1" /><rect x="8" y="8" width="8.5" height="8.5" rx="1" /><path className="fill corner" d="M19 15.5V19h-3.5z" /></svg>
      </button>
      {open && (
        <div className="pen-shape-menu pen-tool-menu" role="group" aria-label="Overlaps">
          <div className="pen-menu-head">{picked ? 'Picked shapes' : 'Overlapping shapes'}</div>
          {acts.map(a => (
            <button key={a.id} disabled={a.off} title={a.title} onClick={a.run}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{a.icon}</svg><span>{a.label}</span>
            </button>
          ))}
          <LiveRange label="Gap" value={g} max={max} title="How wide a gap Break apart leaves; moved after a break, it breaks them again"
            onStart={() => { sliding.current = true; }} onSet={v => { setGap(v); if (canAgain()) onBreak(v, true); }}
            onEnd={() => { sliding.current = false; if (canAgain()) actions.commit(); setAfter(a => a + 1); }} />
          {!over && !canAgain() && <small className="pen-menu-note">No shapes overlap here. Draw one over the letter with the Shape tool first.</small>}
        </div>
      )}
    </div>
  );
}

/** Where a drag caught: a mark on the place it snapped to and what that is, or the names of the lines it lines up with. */
function SnapMark({ hit, x, y }: { hit: Snapped; x: number; y: number }) {
  const lines = [hit.gx, hit.gy].filter(l => l && l.label !== POINT_LINE).map(l => l!.label);
  const label = hit.at ? hit.at.label : lines.join(' · ');
  return (
    <g className="pen-catch" pointerEvents="none">
      {hit.at && <path d={`M${n1(x)} ${n1(y - 5)}l5 5-5 5-5-5z`} />}
      {label && <text x={n1(x + 9)} y={n1(y - 8)}>{label}</text>}
    </g>
  );
}

/** The Snap menu's entries, by kind: name, what it catches on, and a 16 × 16 icon. The menu lists them in SNAP_KINDS' order. */
const SNAPS: Record<SnapKind, { label: string; note: string; icon: ReactNode }> = {
  points: { label: 'Points', note: 'Anchor points, and lining up with them',
    icon: <><rect x="5.5" y="5.5" width="5" height="5" /><path d="M1 8h3M12 8h3" strokeDasharray="1.5 1.5" /></> },
  guides: { label: 'Guides', note: 'Baseline, x-height, cap height, the sides',
    icon: <><path d="M1.5 4.5h13M1.5 11.5h13" /><circle className="fill" cx="8" cy="11.5" r="1.6" /></> },
  centers: { label: 'Centers', note: 'Middle of the width, the heights, each shape',
    icon: <><circle cx="8" cy="8" r="5.5" /><path d="M8 5.5v5M5.5 8h5" /></> },
  midpoints: { label: 'Midpoints', note: 'Halfway along each curve or line',
    icon: <><path d="M2 13L14 3" /><path className="fill" d="M8 5.6l2.4 2.4L8 10.4 5.6 8z" /></> },
  outline: { label: 'Point of contact', note: 'Anywhere along the outline',
    icon: <><path d="M2 13.5C3 5 13 5 14 13.5" /><circle className="fill" cx="8" cy="7.2" r="1.7" /></> },
  crossings: { label: 'Intersections', note: 'Where outlines and guide lines cross',
    icon: <><path d="M2.5 13.5l11-11M2.5 2.5l11 11" /><circle cx="8" cy="8" r="2.2" /></> },
  tangents: { label: 'Tangents', note: 'Where a line from the next point grazes a curve',
    icon: <><circle cx="9" cy="9.5" r="4.5" /><path d="M1.5 5h13" /><circle className="fill" cx="9" cy="5" r="1.5" /></> }
};

/** A menu opened above the bar, from the right side of its button, kept inside the window: where its left side would
    run out (on phones, where the button sits mid-row), it moves right. */
function useInWindow(menu: RefObject<HTMLElement | null>, open: boolean) {
  useLayoutEffect(() => {
    const el = menu.current, out = el ? 8 - el.getBoundingClientRect().left : 0;
    if (el && out > 0) el.style.right = `${parseFloat(getComputedStyle(el).right) - out}px`;
  }, [menu, open]);
}

/** Snap: on or off, and a menu of what it catches on. */
function SnapMenu({ snap, onSet }: { snap: { on: boolean; kinds: SnapKind[] }; onSet: (s: { on: boolean; kinds: SnapKind[] }) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null);
  useDismiss(open, setOpen, wrap, true);
  useInWindow(menu, open);
  const on = snap.on && snap.kinds.length > 0;
  // picking a kind while snapping is off turns it back on
  const toggle = (k: SnapKind) => {
    const has = snap.kinds.includes(k);
    onSet(!snap.on ? { on: true, kinds: has ? snap.kinds : SNAP_KINDS.filter(o => o === k || snap.kinds.includes(o)) }
      : { on: true, kinds: has ? snap.kinds.filter(o => o !== k) : SNAP_KINDS.filter(o => o === k || snap.kinds.includes(o)) });
  };
  return (
    <div className="pen-snapper" ref={wrap}>
      <div className="pen-kind">
        <button aria-pressed={on} className={on ? 'on' : undefined} title="Snap dragged points and handles (hold ⌘ while dragging to place one freely)"
          onClick={() => onSet({ on: !on, kinds: snap.kinds.length ? snap.kinds : [...SNAP_KINDS] })}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v6a4 4 0 008 0v-6M4 5.5h3M9 5.5h3" /></svg>Snap
        </button>
        <button aria-label="What to snap to" title="What to snap to" aria-haspopup="true" aria-expanded={open} className={open ? 'on' : undefined} onClick={() => setOpen(o => !o)}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 6.5L5 3.5l3 3" /></svg>
        </button>
      </div>
      {open && (
        <div className="popover pen-snap-menu" ref={menu} role="group" aria-label="Snap to">
          <div className="pen-snap-head">Snap to</div>
          {SNAP_KINDS.map(k => {
            const o = SNAPS[k], picked = snap.on && snap.kinds.includes(k);
            return (
              <button key={k} role="menuitemcheckbox" aria-checked={picked} className={picked ? 'on' : undefined} onClick={() => toggle(k)}>
                <svg className="pen-snap-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{o.icon}</svg>
                <span><b>{o.label}</b><small>{o.note}</small></span>
                <svg className="pen-snap-tick" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5l2.3 2.3 4.7-5" /></svg>
              </button>
            );
          })}
          <div className="pen-snap-foot">Hold ⌘ while dragging to place a point freely</div>
        </div>
      )}
    </div>
  );
}

/** A handle: a line from its anchor to a small round knob. */
function Handle({ ax, ay, x, y, onDown }: { ax: number; ay: number; x: number; y: number; onDown: (e: ReactPointerEvent) => void }) {
  return (
    <g className="pen-h" onPointerDown={onDown}>
      <line x1={n1(ax)} y1={n1(ay)} x2={n1(x)} y2={n1(y)} />
      <circle className="grab" cx={n1(x)} cy={n1(y)} r={HIT} />
      <circle cx={n1(x)} cy={n1(y)} r={3} />
    </g>
  );
}

function PointKind({ smooth, onSet }: { smooth: boolean; onSet: (smooth: boolean) => void }) {
  return (
    <div className="pen-kind pen-point-kind" role="radiogroup" aria-label="Point type">
      <button role="radio" aria-checked={!smooth} aria-label="Corner" className={!smooth ? 'on' : undefined} onClick={() => onSet(false)} title="Corner: the handles move on their own">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="3" y="3" width="6" height="6" /></svg><span>Corner</span>
      </button>
      <button role="radio" aria-checked={smooth} aria-label="Smooth" className={smooth ? 'on' : undefined} onClick={() => onSet(true)} title="Smooth: the handles stay in line">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="3.2" /></svg><span>Smooth</span>
      </button>
    </div>
  );
}

/** The actions on what is picked, by id: name, tooltip and a 16 × 16 icon, in the order the bar and its menu give them.
    Which the bar shows as buttons is kept per browser (PREFS.penActions); until changed, the flips. */
type ActId = 'flipX' | 'flipY' | 'reverse' | 'delete';
const ACTS: { id: ActId; label: string; title: string; icon: ReactNode }[] = [
  { id: 'flipX', label: 'Flip left and right', title: 'Flip left ↔ right, across the box',
    icon: <><path d="M6.3 4L2 12h4.3zM9.7 4L14 12H9.7z" /><path d="M8 1.5v13" strokeDasharray="1.5 1.5" /></> },
  { id: 'flipY', label: 'Flip top and bottom', title: 'Flip top ↕ bottom, across the box',
    icon: <><path d="M4 6.3L12 2v4.3zM4 9.7l8 4.3V9.7z" /><path d="M1.5 8h13" strokeDasharray="1.5 1.5" /></> },
  { id: 'reverse', label: 'Reverse direction', title: 'Reverse direction: run the picked contour the other way, so inside another it cuts a hole, or fills one',
    icon: <path d="M2.8 7.5a5.2 5.2 0 019.3-2.7M12.6 2v3h-3M13.2 8.5a5.2 5.2 0 01-9.3 2.7M3.4 14v-3h3" /> },
  { id: 'delete', label: 'Delete', title: 'Delete the picked points (Delete)',
    icon: <path d="M3 4.5h10M6.3 4.5V3h3.4v1.5M4.5 4.5l.7 9h5.6l.7-9" /> }
];
const ACT_IDS = ACTS.map(a => a.id);
/** The actions the bar shows, as this browser keeps them. Until they are picked, the flips; and on a touch screen
    (a tablet, with no keys for Delete), every one. */
const savedActs = (): ActId[] => {
  const v = prefJson(PREFS.penActions);
  if (Array.isArray(v)) return ACT_IDS.filter(id => v.includes(id));
  return matchMedia('(hover: none) and (pointer: coarse)').matches ? ACT_IDS : ['flipX', 'flipY'];
};

/** ⋯ at the end of the bar's actions: a menu of every one, to run it (dimmed where it doesn't apply to what is picked)
    or, by its check, to show it on the bar or take it off. */
function ActMenu({ acts, pinned, onPin }: { acts: Record<ActId, (() => void) | null>; pinned: ActId[]; onPin: (ids: ActId[]) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null);
  useDismiss(open, setOpen, wrap, true);
  useInWindow(menu, open);
  return (
    <div className="pen-act-more" ref={wrap}>
      <button className="pen-icon-btn" aria-label="More actions" title="More actions, and which show on the bar" aria-haspopup="true" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path className="fill" d="M3.5 6.8a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zM8 6.8a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zM12.5 6.8a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" /></svg>
      </button>
      {open && (
        <div className="popover pen-act-menu" ref={menu} role="group" aria-label="Actions">
          {ACTS.map(a => {
            const run = acts[a.id], on = pinned.includes(a.id);
            return (
              <div key={a.id} className="pen-act-row">
                <button className="pen-act-run" disabled={!run} title={a.title} onClick={() => { run?.(); setOpen(false); }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{a.icon}</svg>{a.label}
                </button>
                <button className={on ? 'pen-act-check on' : 'pen-act-check'} aria-pressed={on} aria-label={`${a.label} on the bar`}
                  title={on ? 'On the bar: click to take it off' : 'Show on the bar'}
                  onClick={() => onPin(on ? pinned.filter(p => p !== a.id) : ACT_IDS.filter(p => p === a.id || pinned.includes(p)))}>
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5l2.3 2.3 4.7-5" /></svg>
                </button>
              </div>
            );
          })}
          <div className="pen-act-foot">Checked ones show on the bar</div>
        </div>
      )}
    </div>
  );
}

/** Mirror: turn on either flip, or both, so an edit on one side of the letter is made on the other side too. */
function Mirror({ axes, onSet }: { axes: Axis[]; onSet: (axes: Axis[]) => void }) {
  const opts: { id: Axis; label: string; title: string; icon: ReactNode }[] = [
    { id: 'x', label: 'Mirror left and right', title: 'Mirror left ↔ right: a point moved on one side moves the other way on the other, and points on the middle stay on it',
      icon: <><path className="fill" d="M6.5 4L2 12.5h4.5z" /><path d="M9.5 4l4.5 8.5H9.5z" /><path d="M8 1.5v13" strokeDasharray="1.5 1.5" /></> },
    { id: 'y', label: 'Mirror top and bottom', title: 'Mirror top ↕ bottom: a point moved in the top half moves the other way in the bottom half, and points on the middle stay on it',
      icon: <><path className="fill" d="M4 6.5L12.5 2v4.5z" /><path d="M4 9.5l8.5 4.5V9.5z" /><path d="M1.5 8h13" strokeDasharray="1.5 1.5" /></> }
  ];
  return (
    <div className="pen-mirror" role="group" aria-label="Mirror">
      <span>Mirror</span>
      <div className="pen-kind">
        {opts.map(o => {
          const on = axes.includes(o.id);
          return (
            <button key={o.id} aria-pressed={on} aria-label={o.label} title={o.title} className={on ? 'on' : undefined}
              onClick={() => onSet(on ? axes.filter(a => a !== o.id) : [...axes, o.id].sort())}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{o.icon}</svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A number in font units you type into: Enter or leaving applies it, Escape puts it back, arrows step by 1 (Shift 10).
    `name` is what it is called aloud, where its label is short. */
function NumField({ label, name = typeof label === 'string' ? label : '', title, value, onSet }: {
  label: ReactNode; name?: string; title?: string; value: number; onSet: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const apply = (t: string) => { const v = Math.round(Number(t)); if (t.trim() !== '' && Number.isFinite(v) && v !== value) onSet(v); };
  return (
    <label className="pen-num-field" title={title ?? (name !== label ? name : undefined)}>
      <span>{label}</span>
      <input type="text" inputMode="numeric" aria-label={name} value={draft ?? String(Math.round(value))}
        onFocus={e => { cancelled.current = false; e.target.select(); }}
        onChange={e => setDraft(e.target.value.replace(/[^0-9-]/g, '').slice(0, 5))}
        onBlur={e => { if (!cancelled.current && draft !== null) apply(e.target.value); setDraft(null); }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') { e.stopPropagation(); cancelled.current = true; e.currentTarget.blur(); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            onSet(Math.round(Number(draft ?? value)) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
            setDraft(null);
          }
        }} />
    </label>
  );
}
