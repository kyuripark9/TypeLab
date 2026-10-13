/* The opening title card, played on the first visit in a browser (not with reduced motion). "TypeLab" comes up in
   TypeLab's own fonts, the ones the Style page's cards start from (all but the blackletter), and in the fonts this
   browser's owner has saved (My designs, but for those begun as blackletter), and is then made as a font is made:
   - a scramble of characters grows in from the left, each in a font of its own, and settles into the name letter by
     letter, the letters still in fonts of their own, set evenly by their ink and each staying put once settled;
   - the whole name cuts from font to font, some cuts mixing them, over the guide lines a font is drawn on (baseline,
     x-height, cap height), which move to each font's own heights;
   - the name is drawn in the logo's letters, in capitals as the header sets it, as Points mode shows a letter: its
     points (corners and extremes) and handles come in along it as its outline is drawn on, the lines move to the
     logo's heights and, standing still now, are named faintly as the inspector names them, and its ink fills in;
   - the drawing gives way to the wordmark, the header's logo in its font (Lineup), the very letters drawn, with the
     tagline under it, and the card fades to the app, the words first.
   A key or a click skips ahead to the fade. It is one SVG, so the name keeps one baseline under every font and the
   lines sit true to it. The own fonts are the cards' web fonts, a saved font is drawn as the engine builds it (as My
   designs draws its name), and the drawing is the logo's capitals as tools/fonts/ui.ts writes them beside its font
   (client/fonts/Lineup.json): the card waits up to WAIT_MS for them, plays with those that came (leaving out the
   drawing if its letters didn't), and shows the wordmark alone when too few own fonts did. Once seen it's marked in
   localStorage under PREFS.introSeen (lib/prefs.ts), which the browser tools in tools/browser set beforehand to keep
   it out of the way. */
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Design } from '../../shared/design';
import { cmdsBox, type Font, type FreeFontData, type PackedNode } from '../../shared/engine';
import { OWN_FAMILIES, STYLE_FONTS, fontId, parseFontId, type FreeFontRef } from '../../shared/free-fonts';
import { api } from '../lib/api';
import { fontStyle, loadFreeFont, webFont } from '../lib/free';
import { guideLines } from '../lib/guide-labels';
import { n1, useSize } from '../lib/hooks';
import { PREFS, prefFlag, setPrefFlag } from '../lib/prefs';
import { fontFor } from '../state/editor';

import LOGO_LETTERS from '../fonts/Lineup.json?url';
const NAME = 'TypeLab';
/** the blackletter style and its own font, which the card leaves out (its letters read as another script) */
/** the name as the logo sets it, in capitals (.brand-name in styles.css): the drawing and the wordmark */
const MARK = NAME.toUpperCase();
const BLACKLETTER = 'blackletter', BLACK_FONT = parseFontId(STYLE_FONTS[BLACKLETTER] ?? '')?.family;
const FONTS = Object.entries(OWN_FAMILIES).filter(([family]) => family !== BLACK_FONT).map(([family, o]) => fontId({ family, weight: o.weight, italic: o.italic }));
/** what the scramble shows where a letter hasn't settled yet, and the share of those that change at each step (the
    rest stay, so it churns rather than flickers) */
const NOISE = 'ABDEGHKMNQRSUWXZadfghkmnqrsuwz0123456789&?!#%@*';
const CHURN = 0.6;
/** the room between two letters in fonts of their own, ink to ink, in ems */
const LETTER_GAP = 0.07;
/** The whole name's cuts, in order: a font's name sets it in that font, and `*` gives every letter a font of its own.
    Neighbours look far apart, heavy after light, and the last, held longest, is the boldest. A font that didn't come
    is left out. */
const CUTS = ['Couture', 'Timber', '*', 'Serenade', 'Gumdrop', 'Dispatch', 'Orbital'];
/** the cuts the saved fonts take, the latest saved first, so as many of them come up as there are, the cuts as many */
const MINE_AT = ['Gumdrop', 'Timber', 'Dispatch'];
/** how long to wait for the fonts, and the fewest to play with */
const WAIT_MS = 1200, FEWEST = 6;
/** each step of the scramble growing and of it settling; the cuts slow from CUT_MS to CUT_MS + SLOW_MS */
const GROW_MS = 55, SETTLE_MS = 70, CUT_MS = 85, SLOW_MS = 120;
/** The drawing: its points come in over POINTS_MS while each letter's outline is drawn on (over .intro-outline's
    .42s in styles.css, a letter LETTER_MS after the one before), the ink fills in from FILL_MS as the points and
    lines go, and the wordmark follows at DRAW_MS. */
const POINTS_MS = 420, LETTER_MS = 30, FILL_MS = 760, DRAW_MS = 1100;
/** the smallest size, in px to the em, the drawing's points show their handles at; how sharply the outline turns at a
    point for it to show as a corner (the cosine of 25°), and how far apart, in units, two points it shows are at least */
const HANDLES_FROM = 80, CORNER = Math.cos(25 * Math.PI / 180), CLEAR = 50;
/** how long the wordmark shows, then how long it fades; FADE_MS matches .intro.leave's opacity transition in
    styles.css, its delay counted */
const HOLD_MS = 1100, FADE_MS = 450;
/** the window's edge to the lines' names (and the least to a scramble's letters), and the narrowest window that shows them (on phones they'd run into
    the name); lines nearer than CLOSE px set their names side by side, GAP apart, and a line within ONE px of one
    before it is left out, the two reading as one */
const EDGE = 24, NAMED_FROM = 600, CLOSE = 14, GAP = 12, ONE = 6;

/** What a letter is set in: an own font's web font, or a saved font's letters as the engine draws them. */
type Face = { web: FreeFontRef; mine?: undefined } | { mine: Font; web?: undefined };
type Letter = { ch: string; face: Face };
/** A font's heights in ems: x-height and cap height, and, in the drawing, its ascender and (below zero) descender. */
type Heights = { xh: number; cap: number; asc?: number; desc?: number };
/** One step of the card for `ms`: the name in `letters`, each in its font, or `drawn` from its points; neither is the
    wordmark. `lines` are the guide lines' heights, none before the cuts and on the wordmark. The scramble is set from
    where `from`, the settled name, starts. */
interface Step { ms: number; letters?: Letter[]; from?: Letter[]; drawn?: true; lines?: Heights }
/** The logo's letters as tools/fonts/ui.ts writes them: its heights, and each capital's advance and outline. */
type Logo = Pick<FreeFontData, 'cap' | 'xh' | 'glyphs'>;

const any = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

let ctx: CanvasRenderingContext2D | null | undefined;
/** A letter set in a web font at 100px as the SVG sets it (in the faces it falls back to), or null without a canvas. */
function measure(r: FreeFontRef, ch: string) {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  const s = fontStyle(r);
  ctx.font = `${s.fontStyle} ${s.fontWeight} 100px ${s.fontFamily}`;
  return ctx.measureText(ch);
}

/** A saved font's letter's ink, in its units, as the engine draws it. */
const boxOf = (f: Font, ch: string) => { const g = f.glyph(ch); return g ? cmdsBox(g.cmds) : null; };

/** A face's x-height and cap height, from its ink (an x's and an H's), so the lines sit on the letters as drawn: a
    heavier saved font's grow past its own measures. */
function heightsOf({ web: r, mine }: Face): Heights | undefined {
  if (mine) return { xh: (boxOf(mine, 'x')?.y1 ?? mine.m.xh) / 1000, cap: (boxOf(mine, 'H')?.y1 ?? mine.m.cap) / 1000 };
  const up = (ch: string) => (measure(r, ch)?.actualBoundingBoxAscent ?? NaN) / 100;
  const h = { xh: up('x'), cap: up('H') };
  return Number.isNaN(h.xh) ? undefined : h;
}

/** Where a letter's ink runs across, in ems from where it is set. */
function inkOf({ web: r, mine }: Face, ch: string): [number, number] {
  if (mine) { const b = boxOf(mine, ch); return b ? [b.x0 / 1000, b.x1 / 1000] : [0, mine.advance(ch) / 1000]; }
  const m = measure(r, ch);
  return m ? [-m.actualBoundingBoxLeft / 100, m.actualBoundingBoxRight / 100] : [0, 0.6];
}

/** How wide a guide line's name is, in px (its type: .intro-guide text in styles.css). */
function nameWidth(name: string) {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return name.length * 5.5;
  ctx.font = `500 10px ${getComputedStyle(document.documentElement).getPropertyValue('--ui')}`;
  return ctx.measureText(name).width;
}

/** The drawing's heights: the font's own x-height and cap height, and the name's highest and lowest points. */
function drawnHeights(data: Logo): Heights {
  const ys = [...MARK].flatMap(ch => (data.glyphs[ch]?.[1] ?? []).flat().map(n => n[1]));
  return { xh: data.xh / 1000, cap: data.cap / 1000, asc: Math.max(...ys) / 1000, desc: Math.min(...ys) / 1000 };
}

/** A saved font's letters, once the free fonts it's written in have come; null when it can't draw the name. */
async function built(d: Design): Promise<Font | null> {
  await Promise.all(fontFor(d.params).freeMissing.map(loadFreeFont));
  const f = fontFor(d.params);
  return [...NAME].every(ch => f.glyph(ch)) ? f : null;
}

/** Whether a saved font was begun as blackletter, or is written in its font. */
const blackletter = (d: Design) => d.styleId === BLACKLETTER || (!!d.params.freeFont && parseFontId(d.params.freeFont)?.family === BLACK_FONT);

/** The steps, drawn afresh each time from the own fonts and saved ones that came, and the drawing's letters if they
    did. */
function plan(fonts: FreeFontRef[], mine: Font[], drawing: Logo | null): Step[] {
  const mark: Step = { ms: HOLD_MS };
  if (fonts.length < FEWEST) return [mark];
  const own = fonts.map(web => ({ web })), saved = mine.map(f => ({ mine: f })), faces: Face[] = [...own, ...saved];
  // a face other than those in `not` that draws `ch`, so letters side by side differ
  const other = (ch: string, ...not: (Face | undefined)[]) => any(faces.filter(f => !not.includes(f) && (!f.mine || f.mine.glyph(ch))));
  const mixed = (chars: string[]) => chars.reduce<Letter[]>((ls, ch) => [...ls, { ch, face: other(ch, ls.at(-1)?.face) }], []);
  // the scramble's next `n` letters after `was`, each changed by CHURN's odds (a new one always), in a face unlike
  // its neighbours' (`left` the face of the letter before them)
  const stir = (was: Letter[], n: number, left?: Face) => Array.from({ length: n }).reduce<Letter[]>((ls, _, i) => {
    const prev = ls.at(-1)?.face ?? left, kept = i < was.length && Math.random() > CHURN && was[i].face !== prev, ch = any([...NOISE]);
    return [...ls, kept ? was[i] : { ch, face: other(ch, prev, was[i + 1]?.face) }];
  }, []);
  const scramble: Letter[][] = [];
  let noise: Letter[] = [];
  for (let n = 1; n <= NAME.length; n++) scramble.push(noise = stir(noise, n));
  // settling from the left, each letter keeps the face it settled in; the full name, all mixed, stays a moment longer
  const settled: Letter[] = [];
  for (let n = 1; n <= NAME.length; n++) {
    settled.push({ ch: NAME[n - 1], face: other(NAME[n - 1], settled.at(-1)?.face, noise[1]?.face) });
    noise = stir(noise.slice(1), NAME.length - n, settled[n - 1].face);
    scramble.push([...settled, ...noise]);
  }
  // all of it set from where the settled name starts, so it grows from there and a settled letter stays put
  const steps: Step[] = scramble.map((letters, i) => ({
    ms: i < NAME.length ? GROW_MS : i < scramble.length - 1 ? SETTLE_MS : SETTLE_MS * 3, letters, from: settled
  }));
  // the cuts, a saved font in the place of an own one where there is one, the lines at each face's heights (a mixed
  // cut keeps the last face's)
  const named = new Map(own.map(f => [f.web.family, f]));
  const cuts = CUTS.flatMap((c): (Face | '*')[] => {
    const face = c === '*' ? c : saved[MINE_AT.indexOf(c)] ?? named.get(c);
    return face ? [face] : [];
  });
  let lines = heightsOf(cuts.find(c => c !== '*') ?? own[0]);
  cuts.forEach((c, k) => {
    const ms = CUT_MS + SLOW_MS * (k / Math.max(1, cuts.length - 1)) ** 2;
    if (c === '*') { steps.push({ ms, letters: mixed([...NAME]), lines }); return; }
    lines = heightsOf(c) ?? lines;
    steps.push({ ms, letters: [...NAME].map(ch => ({ ch, face: c })), lines });
  });
  if (drawing) steps.push({ ms: DRAW_MS, drawn: true, lines: drawnHeights(drawing) });
  return [...steps, mark];
}

/** An anchor point of the drawing, in px: corner or smooth (a square or a round, as the pen draws them), and the
    ends of its handles. */
interface Point { x: number; y: number; smooth: boolean; handles: [number, number][] }

/** The name as the logo sets it, in the drawing's letters at `k` px a unit, centred on `cx` with its baseline at
    `base`: each letter's outline as a path, and the points a type designer would put it on: its corners, and a
    curve's only where it runs level or plumb (a font's rounds can carry many more, which crowd into a string of
    beads), each clear of those before it by CLEAR units. */
function drawName(data: Logo, k: number, cx: number, base: number) {
  const letters = [...MARK].flatMap(ch => (data.glyphs[ch] ? [data.glyphs[ch]] : []));
  let left = cx - letters.reduce((w, [adv]) => w + adv, 0) * k / 2;
  return letters.map(([adv, contours]) => {
    const X = (u: number) => n1(left + u * k), Y = (u: number) => n1(base - u * k);
    // a point's handles, coming in and going out, where it has them
    const ins = (n: PackedNode) => (n.length > 2 && n[2] != null && n[3] != null ? [n[2], n[3]] as const : null);
    const outs = (n: PackedNode) => (n.length > 4 ? [n[4] as number, n[5] as number] as const : null);
    const points: Point[] = [];
    let d = '';
    const kept: PackedNode[] = [];
    for (const c of contours) {
      c.forEach((n, i) => {
        const prev = c[(i + c.length - 1) % c.length], next = c[(i + 1) % c.length], o = outs(n), ni = ins(next), h = ins(n);
        if (i === 0) d += `M${X(n[0])} ${Y(n[1])}`;
        d += o || ni ? `C${X((o ?? n)[0])} ${Y((o ?? n)[1])} ${X((ni ?? next)[0])} ${Y((ni ?? next)[1])} ${X(next[0])} ${Y(next[1])}` : `L${X(next[0])} ${Y(next[1])}`;
        // the way the outline comes in and goes out (along a handle, or to the next point where it has none)
        type At = readonly [number, number, ...unknown[]];
        const way = (a: At, b: At) => (a[0] === b[0] && a[1] === b[1] ? null : [b[0] - a[0], b[1] - a[1]] as const);
        const into = (h && way(h, n)) ?? way(prev, n), out = (o && way(n, o)) ?? way(n, next);
        const corner = !!(into && out) && into[0] * out[0] + into[1] * out[1] < CORNER * Math.hypot(...into) * Math.hypot(...out);
        const extreme = ([0, 1] as const).some(j => (n[j] > prev[j] && n[j] >= next[j]) || (n[j] < prev[j] && n[j] <= next[j]));
        if (!(corner || extreme) || kept.some(m => Math.hypot(m[0] - n[0], m[1] - n[1]) < CLEAR)) return;
        kept.push(n);
        // smooth where its handles run on in one line (as shared/engine/free.ts reads it)
        const smooth = !!(h && o) && (() => {
          const ax = n[0] - h![0], ay = n[1] - h![1], bx = o![0] - n[0], by = o![1] - n[1], la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
          return la > 0 && lb > 0 && (ax * bx + ay * by) / (la * lb) > 0.995;
        })();
        points.push({ x: X(n[0]), y: Y(n[1]), smooth, handles: [h, o].flatMap(e => (e ? [[X(e[0]), Y(e[1])] as [number, number]] : [])) });
      });
      d += 'Z';
    }
    left += adv * k;
    return { d, points };
  });
}

/** A guide line: its id and name, where it runs across the window (px down) and how wide its name is. */
interface Guide { id: string; name: string; at: number; w: number }

/** The guide lines at `h`'s heights over the baseline `base`, at `size` px to the em (the drawing's ascender is
    often all but its cap height). */
const guidesAt = (h: Heights, base: number, size: number): Guide[] =>
  guideLines({ xh: h.xh, cap: h.cap, asc: h.asc ?? NaN, desc: h.desc ?? NaN })
    .filter(([, y]) => !Number.isNaN(y))
    .map(([id, y, name]) => ({ id, name, at: Math.round(base - y * size) + 0.5, w: n1(nameWidth(name)) }))
    .filter((l, i, ls) => !ls.slice(0, i).some(k => Math.abs(k.at - l.at) < ONE));

/** Where each line's name starts along it, on a window wide enough to name them: near the left end, or, where the
    line runs too close under another for their names to sit one over the other, past that one's name. */
function namesAt(lines: Guide[], width: number) {
  const xs = new Map<string, number>();
  if (width < NAMED_FROM) return xs;
  let up: { at: number; end: number } | undefined;
  for (const l of [...lines].sort((a, b) => a.at - b.at)) {
    const x = up && l.at - up.at < CLOSE ? up.end + GAP : EDGE;
    xs.set(l.id, x);
    up = { at: l.at, end: x + l.w };
  }
  return xs;
}

/** The guide lines across the window, each with its name (where `xs` places one) on it, the line broken around it,
    so a name is never taken for a neighbour's. `end` fades them out with the drawing's points. */
function Guides({ lines, xs, width, end }: { lines: Guide[]; xs: Map<string, number>; width: number; end: boolean }) {
  return (
    <g className={end ? 'intro-guides end' : 'intro-guides'} style={end ? { animationDelay: `${FILL_MS}ms` } : undefined}>
      <g>{lines.map(l => <g key={l.id} className="intro-guide" style={{ transform: `translateY(${l.at}px)` }}><line x2={width} /></g>)}</g>
      <g>
        {lines.map(l => xs.has(l.id) && (
          <g key={l.id} className="intro-guide name" style={{ transform: `translate(${xs.get(l.id)}px, ${l.at}px)` }}>
            <rect x={-5} y={-6} width={l.w + 10} height={12} />
            <text y={3.5}>{l.name}</text>
          </g>
        ))}
      </g>
    </g>
  );
}

/** The drawing at `size` px to the em: each letter's outline drawn on and then filled, and its points coming in along
    it, then going. The points are as large as the pen's at the largest size and smaller under it, and below
    HANDLES_FROM, where the round letters' points crowd, they come without their handles. */
function Drawing({ letters, size }: { letters: ReturnType<typeof drawName>; size: number }) {
  const points = letters.flatMap(l => l.points), r = n1(Math.max(1.2, size / 43)), handles = size >= HANDLES_FROM;
  return (
    <g>
      {letters.map((l, i) => <path key={i} className="intro-outline" d={l.d} pathLength={1} style={{ animationDelay: `${i * LETTER_MS}ms, ${FILL_MS}ms` }} />)}
      <g className="intro-points" style={{ animationDelay: `${FILL_MS}ms` }}>
        {points.map((p, i) => (
          <g key={i} className="intro-pt" style={{ transformOrigin: `${p.x}px ${p.y}px`, animationDelay: `${Math.round(i / points.length * POINTS_MS)}ms` }}>
            {handles && p.handles.map(([x, y], j) => <Fragment key={j}><line x1={p.x} y1={p.y} x2={x} y2={y} /><circle className="h" cx={x} cy={y} r={n1(r * 0.6)} /></Fragment>)}
            {p.smooth ? <circle cx={p.x} cy={p.y} r={r} /> : <rect x={n1(p.x - r * 0.9)} y={n1(p.y - r * 0.9)} width={n1(r * 1.8)} height={n1(r * 1.8)} />}
          </g>
        ))}
      </g>
    </g>
  );
}

/** Letters in faces of their own, set side by side: where each is set from the left, in ems, and how wide they all
    are, each letter's ink LETTER_GAP from the one before's, so they sit evenly however their fonts space them and
    never run into each other. */
function inked(letters: Letter[]) {
  let w = 0;
  const xs = letters.map(({ ch, face }, i) => {
    const [l, r] = inkOf(face, ch), x = w - l;
    w += r - l + (i < letters.length - 1 ? LETTER_GAP : 0);
    return x;
  });
  return { xs, w };
}

/** A saved font's letters as the engine spaces them, set as `inked` sets them. */
function spaced(f: Font, letters: Letter[]) {
  let w = 0;
  const xs = letters.map(({ ch }, i) => {
    const x = w;
    w += (f.advance(ch) + (i < letters.length - 1 ? f.m.track : 0)) / 1000;
    return x;
  });
  return { xs, w };
}

/** The name in `letters` at `size` px to the em, centred on `cx` with its baseline at `base`, or set from where `from`
    would start: in one font as it spaces itself (a web font kerned as the browser sets it, a saved font as the engine
    spaces it), else letter by letter by their ink. */
function Word({ letters, from, size, cx, base }: { letters: Letter[]; from?: Letter[]; size: number; cx: number; base: number }) {
  const face = letters[0]?.face, one = !from && !!face && letters.every(l => l.face === face);
  if (one && face.web) return <text className="intro-word" x={cx} y={base} textAnchor="middle" fontSize={size} style={fontStyle(face.web)}>{letters.map(l => l.ch).join('')}</text>;
  const { xs, w } = one && face.mine ? spaced(face.mine, letters) : inked(letters);
  // set from where `from` starts, unless that runs it off the window's right (a scramble of wide letters on a phone)
  const left = from ? Math.min(cx - inked(from).w * size / 2, Math.max(EDGE, 2 * cx - EDGE - w * size)) : cx - w * size / 2;
  const k = +(size / 1000).toFixed(4);
  return (
    <g className="intro-word">
      {letters.map(({ ch, face: { web, mine } }, i) => {
        const at = n1(left + xs[i] * size), g = mine?.glyph(ch);
        return web
          ? <text key={i} x={at} y={base} fontSize={size} style={fontStyle(web)}>{ch}</text>
          : g && <path key={i} d={g.d} transform={`translate(${at} ${base}) scale(${k})`} />;
      })}
    </g>
  );
}

function shouldPlay() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return !prefFlag(PREFS.introSeen);
}

export function Intro() {
  const [phase, setPhase] = useState<'wait' | 'play' | 'leave' | 'done'>(() => (shouldPlay() ? 'wait' : 'done'));
  const [steps, setSteps] = useState<Step[]>([]);
  const [drawing, setDrawing] = useState<Logo | null>(null);
  const [at, setAt] = useState(0);
  const [ref, box] = useSize<HTMLDivElement>();
  const shown = phase !== 'done';

  // the fonts and the drawing's letters, as many as come within WAIT_MS
  useEffect(() => {
    if (phase !== 'wait') return;
    setPrefFlag(PREFS.introSeen, true);
    const got: FreeFontRef[] = [], mine: (Font | null)[] = [];
    let data: Logo | null = null, live = true;
    const start = () => {
      if (!live) return;
      live = false; setDrawing(data); setSteps(plan(got, mine.filter(f => f !== null), data)); setPhase('play');
    };
    const t = setTimeout(start, WAIT_MS);
    void Promise.all([
      ...FONTS.map(id => webFont(id).then(r => { if (r) got.push(r); })),
      fetch(LOGO_LETTERS).then(r => (r.ok ? r.json() as Promise<Logo> : null)).then(d => { data = d; }, () => undefined),
      // the latest saved fonts, as many as the cuts they take, kept in that order
      api.listDesigns().then(ds => Promise.all(ds.filter(d => !blackletter(d)).slice(0, MINE_AT.length)
        .map((d, i) => built(d).then(f => { mine[i] = f; }, () => undefined))), () => undefined)
    ]).then(start);
    return () => { live = false; clearTimeout(t); };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'play' && phase !== 'leave') return;
    const t = phase === 'leave' ? setTimeout(() => setPhase('done'), FADE_MS)
      : setTimeout(() => (at < steps.length - 1 ? setAt(at + 1) : setPhase('leave')), steps[at].ms);
    return () => clearTimeout(t);
  }, [phase, at, steps]);

  useEffect(() => {
    if (!shown) return;
    const skip = () => setPhase(p => (p === 'done' ? p : 'leave'));
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [shown]);

  // the name's size, and its baseline a little under the middle, so the name and the tagline under it sit centred
  const { width: W, height: H } = box;
  const size = Math.min(112, Math.max(56, W * 0.08)), base = Math.round(H / 2 + 0.2 * size - 10);
  const drawn = useMemo(() => (drawing && W ? drawName(drawing, size / 1000, W / 2, base) : null), [drawing, W, size, base]);

  if (!shown) return null;
  // nothing while the fonts come (or when skipped before they did)
  const step = phase === 'wait' ? undefined : steps[at];
  const lines = step?.lines && guidesAt(step.lines, base, size);
  return (
    <div ref={ref} className={phase === 'leave' ? 'intro leave' : 'intro'} onClick={() => setPhase('leave')} aria-hidden="true">
      {step && W > 0 && (
        <svg className="intro-art" width={W} height={H}>
          {lines && <Guides lines={lines} xs={step.drawn ? namesAt(lines, W) : new Map()} width={W} end={!!step.drawn} />}
          {step.letters
            ? <Word letters={step.letters} from={step.from} size={size} cx={W / 2} base={base} />
            : step.drawn ? drawn && <Drawing letters={drawn} size={size} />
              : <>
                {/* the drawing, filled, gives way to the wordmark as it comes in, so one reads as the other */}
                {drawn && steps[at - 1]?.drawn && <g className="intro-drawn">{drawn.map((l, i) => <path key={i} d={l.d} />)}</g>}
                <text className="intro-mark" x={W / 2} y={base} textAnchor="middle" fontSize={size}>{MARK}</text>
              </>}
        </svg>
      )}
      {step && !step.letters && !step.drawn && (
        <div className="intro-tag" style={{ top: n1(base + 0.36 * size) }}>
          {'Experiment with type.'.split(' ').map((w, i) => <span key={i} style={{ animationDelay: `${250 + i * 120}ms` }}>{w}</span>)}
        </div>
      )}
    </div>
  );
}
