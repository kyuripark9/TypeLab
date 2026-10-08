/* The pen: the inspected letter as anchor points and bézier handles, edited like paths in a vector
   editor. The Direct selection tool moves points, handles and curves; the Pen adds points (or
   draws new contours) and removes them; Convert switches points between corner and smooth; the
   Rectangle and Ellipse add those shapes as new contours. Hovering shows what a click will do: a
   point the pen would add on the outline (where it goes), one it would delete, the start it would close on. A letter
   not yet drawn shows its outline traced into points (fitOutline), and becomes a drawing, which the
   settings no longer shape, with the first edit. Every change is one undo step. With Sync all, a
   point or handle moved here moves in the other letters with a point in the same place too; with
   Mirror, it moves the other way in its partner across the letter's middle. Snapping catches a dragged
   point or handle on points, guide lines, centers, midpoints, the outline, crossings and tangents
   (each can be turned off); ⌘ held while dragging places it freely. */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cmdsToD, drawnCmds, hasIn, hasOut, segment, type Drawn, type Font, type Glyph, type GlyphGrid, type Node } from '../../shared/engine';
import { isTyping, n1, useSize } from '../lib/hooks';
import {
  anchorsIn, constrain, contourArea, deleteAnchors, handlePeers, keyRef, mirrorEdit, mirrorLine, mirrorPairs, moveAnchors, movePeers, nearestSegment,
  peersOf, pointOn, pullHandles, refKey, reshapeSegment, reverseContour, setHandle, setSmooth, shapeContour, snapIn, snapScene, splitSegment,
  toggleSmooth, traceOf, SNAP_KINDS, type Axis, type Peer, type Ref, type Shape, type SnapKind, type SnapScene, type Snapped
} from '../lib/pen';
import { actions, useEditor } from '../state/editor';
import { GridLines } from './ConstructionGrid';

type Tool = 'select' | 'pen' | 'convert' | Shape;
type P = { x: number; y: number };
interface View { sc: number; ox: number; oy: number }
/** a live pointer gesture; `end` finishes it */
interface Gesture { move: (p: P, e: PointerEvent) => void; up: (moved: boolean) => void; x0: number; y0: number; moved: boolean }

const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Direct selection', key: 'A', icon: <path d="M5 3l10 6.5-4.5 1L13 16l-2 1-2.5-5.5L5 15z" className="fill" /> },
  { id: 'pen', label: 'Pen', key: 'P', icon: <><path d="M10 2.5l5 8-2.5 6h-5l-2.5-6z" /><path d="M10 2.5v6.5" /><circle cx="10" cy="10" r="1.3" /></> },
  { id: 'convert', label: 'Convert point', key: '⇧C', icon: <><path d="M3.5 15.5L10 4l6.5 11.5" /><path d="M5 9.5h10" strokeDasharray="1.5 2" /></> },
  { id: 'rect', label: 'Rectangle', key: 'M', icon: <rect x="3.5" y="5" width="13" height="10" rx="0.5" /> },
  { id: 'ellipse', label: 'Ellipse', key: 'L', icon: <ellipse cx="10" cy="10" rx="7" ry="5.5" /> }
];
const isShape = (t: Tool): t is Shape => t === 'rect' || t === 'ellipse';
/** What a click would do where the pointer is, shown while it hovers. */
type Aim = { kind: 'add'; at: P } | { kind: 'delete'; r: Ref } | { kind: 'close' } | { kind: 'shape'; shape: Shape };

const HIT = 7; // px around an anchor or handle that grabs it

export function PenCanvas({ ch, g, font, grid }: { ch: string; g: Glyph; font: Font; grid?: GlyphGrid }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const stored = useEditor(s => s.params.outlines[ch]);
  const sync = useEditor(s => s.scope === 'all');
  const mirror = useEditor(s => s.mirror);
  const snap = useEditor(s => s.snap);
  // before the first edit, the letter as the settings draw it, traced into points
  const traced = traceOf(g);
  const doc = stored ?? traced;
  const cs = doc.contours;
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<string[]>([]);
  const [drawing, setDrawing] = useState<number | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [ptr, setPtr] = useState<P | null>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [caught, setCaught] = useState<Snapped | null>(null);
  // the size of the shape being drawn, shown by the pointer
  const [sizeTag, setSizeTag] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [space, setSpace] = useState(false);
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
  const current = (): Drawn => useEditor.getState().params.outlines[ch] ?? traced;
  /** Write the letter's outline, and with `also` the other letters' a synced edit reached. */
  const write = (contours: Node[][], adv = current().adv, also: Record<string, Drawn> = {}) => {
    const s = useEditor.getState();
    actions.setParam('outlines', { ...s.params.outlines, ...also, [ch]: { adv, contours } });
  };
  const commit = (contours: Node[][], adv?: number, also?: Record<string, Drawn>) => { write(contours, adv, also); actions.commit(); };
  /** With Sync all, the other letters with points in the same places as `refs`, which move along;
      each as it is now (drawn, or as the settings draw it). */
  const peers = (refs: Ref[]): Peer[] => {
    if (!sync) return [];
    const outs = useEditor.getState().params.outlines;
    return peersOf(ch, current(), refs, o => { const og = outs[o] ? null : font.glyph(o); return outs[o] ?? (og ? traceOf(og) : null); });
  };
  /** With Mirror, `edited` (an edit of `base`) made on the other side of the letter too; `held` is the handle dragged. */
  const sym = (base: Node[][], edited: Node[][], held?: { r: Ref; side: 'i' | 'o' }) => mirrorEdit(base, edited, mirror, held);
  /** The same for the letters a synced edit reached, each across its own middle. */
  const symPeers = (along: Peer[], also: Record<string, Drawn>, side?: 'i' | 'o') => {
    if (!mirror.length) return also;
    const out: Record<string, Drawn> = {};
    for (const p of along) {
      const e = also[p.ch], r = p.refs[0];
      if (e) out[p.ch] = { adv: e.adv, contours: sym(p.doc.contours, e.contours, side && r ? { r, side } : undefined) };
    }
    return out;
  };
  /** Move points by (dx, dy), and the same points in the letters in sync with this one. */
  const nudge = (refs: Ref[], dx: number, dy: number) => {
    const base = current().contours, along = peers(refs);
    commit(sym(base, moveAnchors(base, refs, dx, dy)), undefined, symPeers(along, movePeers(along, dx, dy)));
  };
  /** Commit an edit of the outline as it is now, mirrored. */
  const edit = (f: (cs: Node[][]) => Node[][]) => { const base = current().contours; commit(sym(base, f(base))); };
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
    const r = snapIn(s, p, 6 / sc);
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
      if (!gs.moved && Math.hypot(ev.clientX - gs.x0, ev.clientY - gs.y0) < 3) return;
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
      pointer (snapped), the rest keep their places relative to it; Shift keeps to 45° steps. */
  const dragAnchors = (e: ReactPointerEvent, refs: Ref[], grab: Ref) => {
    const base = current().contours, a = base[grab.c][grab.i], skip = refs.map(refKey), along = peers(refs), from = beside(grab, skip);
    start(e, {
      move: (p, ev) => {
        const q = snapTo(ev.shiftKey ? constrain(a, p) : p, { skip, from });
        write(sym(base, moveAnchors(base, refs, q.x - a.x, q.y - a.y)), undefined, symPeers(along, movePeers(along, q.x - a.x, q.y - a.y)));
      },
      up: moved => { if (moved) actions.commit(); }
    });
  };

  const onAnchor = (r: Ref) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || space) return;
    const k = refKey(r);
    // a shape can start on a point
    if (isShape(tool)) { onBackground(e); return; }
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
      {
        // the pen on a point removes it
        e.preventDefault(); e.stopPropagation();
        commit(deleteAnchors(current().contours, [r]));
        setSel([]);
        return;
      }
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
    const base = current().contours, n = base[r.c][r.i], along = peers([r]);
    const h0 = side === 'i' ? { x: n.ix!, y: n.iy! } : { x: n.ox!, y: n.oy! };
    // Alt, or the Convert tool, moves one handle on its own and makes the point a corner
    const alone = e.altKey || tool === 'convert';
    start(e, {
      move: (p, ev) => {
        const q = snapTo(ev.shiftKey ? constrain(n, p) : p, { live: [refKey(r)], from: [n] }), f = alone || ev.altKey;
        write(sym(base, setHandle(base, r, side, q, f), { r, side }), undefined, symPeers(along, handlePeers(along, side, q.x - h0.x, q.y - h0.y, f), side));
      },
      up: moved => { if (moved) actions.commit(); }
    });
  };

  /** Pressing on the outline between points: the pen adds a point there, the other tools bend the curve. */
  const onSegment = (e: ReactPointerEvent) => {
    if (e.button !== 0 || space) return;
    if (isShape(tool)) { onBackground(e); return; }
    const p = toFont(e), hit = nearestSegment(current().contours, p);
    if (!hit || hit.d * sc > HIT + 2 || (tool === 'pen' && drawingOk !== null)) { onBackground(e); return; }
    const base = current().contours;
    if (tool === 'pen' && drawingOk === null) {
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

  /** Pressing on a filled contour with Direct selection picks all its points and drags them. */
  const onContour = (c: number) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || space || tool !== 'select') return;
    const refs = cs[c].map((_, i) => ({ c, i }));
    const keys = refs.map(refKey);
    const all = e.shiftKey ? [...new Set([...sel, ...keys])] : keys;
    setSel(all);
    dragAnchors(e, all.filter(valid).map(keyRef), { c, i: 0 });
  };

  /** Pressing on empty canvas: the pen adds a point (a drag pulls smooth handles), the Rectangle and Ellipse
      draw their shape (Shift keeps it square or round, Alt draws it from the center), Direct selection
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
        up: () => { setCaught(null); actions.commit(); }
      });
      return;
    }
    if (isShape(tool)) {
      const kind = tool, was = useEditor.getState().params.outlines, base = current().contours;
      free.current = e.metaKey || e.ctrlKey;
      const a = snapTo(p);
      // the new shape runs the way the letter's biggest contour does, so it fills as that one does
      const big = base.reduce<Node[] | null>((m, k) => !m || Math.abs(contourArea(k)) > Math.abs(contourArea(m)) ? k : m, null);
      const ccw = !big || contourArea(big) >= 0;
      let size = { w: 0, h: 0 };
      start(e, {
        move: (pp, ev) => {
          const q = snapTo(pp), dx = q.x - a.x, dy = q.y - a.y, s = Math.max(Math.abs(dx), Math.abs(dy));
          const b = ev.shiftKey ? { x: a.x + (dx < 0 ? -s : s), y: a.y + (dy < 0 ? -s : s) } : q;
          const o = ev.altKey ? { x: 2 * a.x - b.x, y: 2 * a.y - b.y } : a;
          size = { w: Math.round(Math.abs(b.x - o.x)), h: Math.round(Math.abs(b.y - o.y)) };
          write([...base, shapeContour(kind, o.x, o.y, b.x, b.y, ccw)]);
          setSizeTag({ x: b.x, y: b.y, ...size });
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
        setSel([...new Set([...keep, ...anchorsIn(current().contours, a.x, a.y, b.x, b.y).map(refKey)])]);
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

  /* ---- zoom: ⌘/Ctrl + wheel (or a pinch) about the pointer; the wheel alone pans */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view ?? fit;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
        const k = Math.exp(-e.deltaY * 0.003), s2 = Math.min(fitSc * 40, Math.max(fitSc * 0.3, v.sc * k)), f = s2 / v.sc;
        setView({ sc: s2, ox: px - (px - v.ox) * f, oy: py - (py - v.oy) * f });
      } else setView({ ...v, ox: v.ox - e.deltaX, oy: v.oy - e.deltaY });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });
  const zoomBy = (k: number) => {
    const v = view ?? fit, s2 = Math.min(fitSc * 40, Math.max(fitSc * 0.3, v.sc * k)), f = s2 / v.sc, px = W / 2, py = H / 2;
    setView({ sc: s2, ox: px - (px - v.ox) * f, oy: py - (py - v.oy) * f });
  };

  /* ---- keys. They're caught before the editor's own shortcuts, so arrows nudge points instead of
     turning to the next letter while points are picked, and Escape lets go of them first. */
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === ' ' ) { if (!space) setSpace(true); stop(); return; }
    if (mod && (k === '=' || k === '+')) { stop(); zoomBy(1.25); return; }
    if (mod && k === '-') { stop(); zoomBy(0.8); return; }
    if (mod && k === '0') { stop(); setView(null); return; }
    if (mod && k === 'a') { stop(); setSel(cs.flatMap((con, c) => con.map((_, i) => refKey({ c, i })))); return; }
    if (mod) return;
    if (e.key === 'Escape' || e.key === 'Enter') {
      if (drawingOk !== null) { stop(); finish(); return; }
      if (e.key === 'Escape' && selRefs.length) { stop(); setSel([]); return; }
      return;
    }
    if (k === 'a' || k === 'v') { stop(); setTool('select'); finish(); return; }
    if (k === 'p') { stop(); setTool('pen'); return; }
    if (k === 'c' && e.shiftKey) { stop(); setTool('convert'); finish(); return; }
    if (k === 'm') { stop(); setTool('rect'); finish(); return; }
    if (k === 'l') { stop(); setTool('ellipse'); finish(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selRefs.length) { stop(); commit(deleteAnchors(current().contours, selRefs)); setSel([]); setDrawing(null); return; }
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
  selRefs.forEach(({ c, i }) => {
    const n = cs[c].length;
    showH.add(`${c}:${i}:i`); showH.add(`${c}:${i}:o`);
    showH.add(`${c}:${(i + n - 1) % n}:o`); showH.add(`${c}:${(i + 1) % n}:i`);
  });
  const last = drawingOk !== null ? cs[drawingOk][cs[drawingOk].length - 1] : null;
  const guideLines: [number, string][] = [[0, 'Baseline'], [m.xh, 'x-height'], [m.cap, 'Cap height'], [m.asc, 'Ascender'], [m.desc, 'Descender']];
  // each label sits just above its line; when lines are too close for that (cap height and
  // ascender often are), the lower one's label drops below its line so the two never overlap
  const labelY = new Map<string, number>();
  let prevY = -Infinity;
  for (const [y, label] of [...guideLines].sort((a, b) => b[0] - a[0])) {
    const above = Y(y) - 5, ly = above >= prevY + 11 ? above : Math.max(Y(y) + 13, prevY + 11);
    labelY.set(label, ly);
    prevY = ly;
  }
  const one = selRefs.length === 1 ? cs[selRefs[0].c][selRefs[0].i] : null;
  const count = cs.reduce((a, c) => a + c.length, 0);
  const cursor = space ? 'grab' : tool === 'pen' || isShape(tool) ? 'crosshair' : 'default';
  // what a click would do under the pointer: the pen adds a point on the outline, deletes the point
  // it's over, or closes the contour being drawn on its first point; a shape tool adds its shape
  let aim: Aim | null = null;
  if (ptr && !space && !gesture.current && !box) {
    if (isShape(tool)) aim = { kind: 'shape', shape: tool };
    else if (tool === 'pen') {
      let near: Ref | null = null, nd = HIT;
      for (let c = 0; c < cs.length; c++) for (let i = 0; i < cs[c].length; i++) {
        const dd = Math.hypot(cs[c][i].x - ptr.x, cs[c][i].y - ptr.y) * sc;
        if (dd <= nd) { nd = dd; near = { c, i }; }
      }
      if (near) {
        if (drawingOk === near.c && near.i === 0 && cs[near.c].length > 1) aim = { kind: 'close' };
        else if (drawingOk === null) aim = { kind: 'delete', r: near };
      } else if (drawingOk === null) {
        const hit = nearestSegment(cs, ptr);
        if (hit && hit.d * sc <= HIT) aim = { kind: 'add', at: pointOn(cs, hit.c, hit.i, hit.t) };
      }
    }
  }
  const aimDel = aim?.kind === 'delete' ? refKey(aim.r) : null;
  // with Sync all, the letters the picked points would move in too: found again only when the picked
  // points or the drawings change, and not mid-drag (they're the letters the drag started with)
  const reachKey = sync && selRefs.length ? ch + ' ' + selRefs.map(refKey).join(' ') : '';
  const reachMemo = useRef<{ key: string; font: Font; chs: string[] }>({ key: '', font, chs: [] });
  if (reachMemo.current.key !== reachKey || (reachKey && !gesture.current && reachMemo.current.font !== font))
    reachMemo.current = { key: reachKey, font, chs: reachKey ? peers(selRefs).map(p => p.ch) : [] };
  const reach = reachMemo.current.chs;
  // with Mirror, the letter's middle on each axis, and the partners of the picked points, which move the other way
  const lines = mirror.map(axis => ({ axis, at: mirrorLine(cs, axis) }));
  const twins = new Set<string>();
  {
    let reached = selRefs.map(refKey);
    for (const { axis, at } of lines) {
      const pairs = mirrorPairs(cs, axis, at), more = reached.map(k => pairs.get(k)).filter((r): r is Ref => !!r).map(refKey);
      reached = [...new Set([...reached, ...more])];
    }
    reached.forEach(k => { if (!selSet.has(k)) twins.add(k); });
  }

  return (
    <div className="pen-wrap">
      <div className="pen-tools" role="toolbar" aria-label="Pen tools">
        {TOOLS.map(t => (
          <button key={t.id} className={tool === t.id ? 'on' : undefined} aria-pressed={tool === t.id} title={`${t.label} (${t.key})`}
            onClick={() => { setTool(t.id); if (t.id !== 'pen') finish(); }}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">{t.icon}</svg>
          </button>
        ))}
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
              {guideLines.map(([y, label]) => (
                <g key={label}>
                  <line className="i-guide" x1={0} x2={W} y1={n1(Y(y))} y2={n1(Y(y))} />
                  <text className="i-label" x={64} y={n1(labelY.get(label)!)}>{label} <tspan className="pen-num">{Math.round(y)}</tspan></text>
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
                <path key={c} className={tool === 'select' ? 'pen-fill hit' : 'pen-fill'} d={cmdsToD(drawnCmds([cs[c]]))}
                  onPointerDown={tool === 'select' ? onContour(c) : onBackground} />
              ))}
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
                <g key={k} className={['pen-pt', on && 'on', twins.has(k) && 'twin', first && 'first', aimDel === k && 'del'].filter(Boolean).join(' ')}
                  onPointerDown={onAnchor({ c, i })} onDoubleClick={() => { if (tool === 'select') edit(o => toggleSmooth(o, { c, i })); }}>
                  <circle className="grab" cx={x} cy={y} r={HIT} />
                  {n.s ? <circle cx={x} cy={y} r={4} /> : <rect x={x - 3.5} y={y - 3.5} width={7} height={7} />}
                </g>
              );
            }))}
            {aim?.kind === 'add' && (
              <g className="pen-ghost" pointerEvents="none">
                <circle cx={n1(X(aim.at.x))} cy={n1(Y(aim.at.y))} r={4.5} />
                <path d={`M${n1(X(aim.at.x) - 2.5)} ${n1(Y(aim.at.y))}h5M${n1(X(aim.at.x))} ${n1(Y(aim.at.y) - 2.5)}v5`} />
              </g>
            )}
            {aim && aim.kind !== 'add' && ptr && <AimBadge aim={aim} x={X(ptr.x)} y={Y(ptr.y)} />}
            {sizeTag && <text className="pen-size" x={n1(X(sizeTag.x) + 10)} y={n1(Y(sizeTag.y) + 20)}>{sizeTag.w} × {sizeTag.h}</text>}
            {box && <rect className="pen-box" x={box.x0} y={box.y0} width={box.x1 - box.x0} height={box.y1 - box.y0} />}
            {caught && <SnapMark hit={caught} x={X(caught.x)} y={Y(caught.y)} />}
          </svg>
        )}
        {reach.length > 0 && (
          <div className="pen-reach" role="status" title={`Moving the picked points moves them in ${reach.join(' ')} too, which become drawings`}>
            Also moves in <b>{reach.join(' ')}</b>
          </div>
        )}
      </div>

      <div className="pen-bar">
        {one ? (
          <>
            <span className="pen-bar-label">Point</span>
            <NumField label="X" value={one.x} onSet={v => nudge(selRefs, v - one.x, 0)} />
            <NumField label="Y" value={one.y} onSet={v => nudge(selRefs, 0, v - one.y)} />
            <PointKind smooth={!!one.s} onSet={s => edit(o => setSmooth(o, selRefs, s))} />
          </>
        ) : selRefs.length > 1 ? (
          <>
            <span className="pen-bar-label">{selRefs.length} points</span>
            <PointKind smooth={selRefs.every(r => cs[r.c][r.i].s)} onSet={s => edit(o => setSmooth(o, selRefs, s))} />
          </>
        ) : (
          <span className="pen-bar-label muted pen-hint">{hint(tool, drawingOk !== null)}</span>
        )}
        {selRefs.length > 0 && (
          <>
            <button className="btn ghost small" title="Run the picked contour the other way: inside another it cuts a hole, or fills one"
              onClick={() => { let out = current().contours; for (const c of new Set(selRefs.map(r => r.c))) out = reverseContour(out, c); commit(out); }}>
              Reverse direction
            </button>
            <button className="btn ghost small" title="Delete the picked points (Delete)" onClick={() => { commit(deleteAnchors(current().contours, selRefs)); setSel([]); }}>Delete</button>
          </>
        )}
        <span className="grow" />
        <Mirror axes={mirror} onSet={actions.setMirror} />
        <SnapMenu snap={snap} onSet={actions.setSnap} />
        <NumField label="Width" value={doc.adv} onSet={v => commit(current().contours, Math.max(0, v))} />
        <span className="pen-bar-label muted pen-count" title="Anchor points">{count} pts · {Math.round(sc / fitSc * 100)}%</span>
      </div>
    </div>
  );
}

function hint(tool: Tool, drawing: boolean) {
  if (tool === 'pen') return drawing ? 'Click to add points · drag to pull a curve · click the first point to close · Esc to finish'
    : 'Click the outline to add a point · click a point to delete it · click empty space to start a new shape';
  if (tool === 'convert') return 'Click a point to switch corner ↔ smooth · drag from a point to pull out handles';
  if (isShape(tool)) return `Drag to add ${tool === 'rect' ? 'a rectangle · Shift for a square' : 'an ellipse · Shift for a circle'} · ⌥ draws from the center · hold ⌘ not to snap`;
  return 'Drag points, handles or curves (hold ⌘ not to snap) · Shift-click or drag a box to pick several · arrows nudge (Shift ×10) · Space-drag to pan, ⌘-scroll to zoom';
}

/** By the pointer, a small badge for what a click will do: by a little shape, + adds that shape; −
    deletes the point under it; ○ closes the contour. (A point added on the outline shows as its ghost instead.) */
function AimBadge({ aim, x, y }: { aim: Exclude<Aim, { kind: 'add' }>; x: number; y: number }) {
  const shape = aim.kind === 'shape' ? aim.shape : null;
  const cx = x + (shape ? 25 : 13), cy = y + (shape ? 22 : 13);
  return (
    <g className={`pen-aim ${aim.kind}`} pointerEvents="none">
      {shape === 'rect' && <rect className="pen-aim-shape" x={n1(x + 10)} y={n1(y + 10)} width={14} height={11} />}
      {shape === 'ellipse' && <ellipse className="pen-aim-shape" cx={n1(x + 17)} cy={n1(y + 15.5)} rx={7.5} ry={5.5} />}
      <circle cx={n1(cx)} cy={n1(cy)} r={6} />
      {aim.kind === 'close' ? <circle className="mark" cx={n1(cx)} cy={n1(cy)} r={2.4} />
        : <path className="mark" d={`M${n1(cx - 3)} ${n1(cy)}h6` + (aim.kind === 'delete' ? '' : `M${n1(cx)} ${n1(cy - 3)}v6`)} />}
    </g>
  );
}

/** Where a drag caught: a mark on the place it snapped to and what that is, or the names of the lines it lines up with. */
function SnapMark({ hit, x, y }: { hit: Snapped; x: number; y: number }) {
  const lines = [hit.gx, hit.gy].filter(l => l && l.label !== 'point').map(l => l!.label);
  const label = hit.at ? hit.at.label : lines.join(' · ');
  return (
    <g className="pen-catch" pointerEvents="none">
      {hit.at && <path d={`M${n1(x)} ${n1(y - 5)}l5 5-5 5-5-5z`} />}
      {label && <text x={n1(x + 9)} y={n1(y - 8)}>{label}</text>}
    </g>
  );
}

const SNAPS: { id: SnapKind; label: string; note: string; icon: ReactNode }[] = [
  { id: 'points', label: 'Points', note: 'Anchor points, and lining up with them',
    icon: <><rect x="5.5" y="5.5" width="5" height="5" /><path d="M1 8h3M12 8h3" strokeDasharray="1.5 1.5" /></> },
  { id: 'guides', label: 'Guides', note: 'Baseline, x-height, cap height, the sides',
    icon: <><path d="M1.5 4.5h13M1.5 11.5h13" /><circle className="fill" cx="8" cy="11.5" r="1.6" /></> },
  { id: 'centers', label: 'Centers', note: 'Middle of the width, the heights, each shape',
    icon: <><circle cx="8" cy="8" r="5.5" /><path d="M8 5.5v5M5.5 8h5" /></> },
  { id: 'midpoints', label: 'Midpoints', note: 'Halfway along each curve or line',
    icon: <><path d="M2 13L14 3" /><path className="fill" d="M8 5.6l2.4 2.4L8 10.4 5.6 8z" /></> },
  { id: 'outline', label: 'Point of contact', note: 'Anywhere along the outline',
    icon: <><path d="M2 13.5C3 5 13 5 14 13.5" /><circle className="fill" cx="8" cy="7.2" r="1.7" /></> },
  { id: 'crossings', label: 'Intersections', note: 'Where outlines and guide lines cross',
    icon: <><path d="M2.5 13.5l11-11M2.5 2.5l11 11" /><circle cx="8" cy="8" r="2.2" /></> },
  { id: 'tangents', label: 'Tangents', note: 'Where a line from the next point grazes a curve',
    icon: <><circle cx="9" cy="9.5" r="4.5" /><path d="M1.5 5h13" /><circle className="fill" cx="9" cy="5" r="1.5" /></> }
];

/** Snap: on or off, and a menu of what it catches on. */
function SnapMenu({ snap, onSet }: { snap: { on: boolean; kinds: SnapKind[] }; onSet: (s: { on: boolean; kinds: SnapKind[] }) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as globalThis.Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc, true); };
  }, [open]);
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
        <div className="popover pen-snap-menu" role="group" aria-label="Snap to">
          <div className="pen-snap-head">Snap to</div>
          {SNAPS.map(o => {
            const picked = snap.on && snap.kinds.includes(o.id);
            return (
              <button key={o.id} role="menuitemcheckbox" aria-checked={picked} className={picked ? 'on' : undefined} onClick={() => toggle(o.id)}>
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
    <div className="pen-kind" role="radiogroup" aria-label="Point type">
      <button role="radio" aria-checked={!smooth} className={!smooth ? 'on' : undefined} onClick={() => onSet(false)} title="Corner: the handles move on their own">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="3" y="3" width="6" height="6" /></svg>Corner
      </button>
      <button role="radio" aria-checked={smooth} className={smooth ? 'on' : undefined} onClick={() => onSet(true)} title="Smooth: the handles stay in line">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="3.2" /></svg>Smooth
      </button>
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

/** A number in font units you type into: Enter or leaving applies it, Escape puts it back, arrows step by 1 (Shift 10). */
function NumField({ label, value, onSet }: { label: string; value: number; onSet: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const apply = (t: string) => { const v = Math.round(Number(t)); if (t.trim() !== '' && Number.isFinite(v) && v !== value) onSet(v); };
  return (
    <label className="pen-num-field">
      <span>{label}</span>
      <input type="text" inputMode="numeric" aria-label={label} value={draft ?? String(Math.round(value))}
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
