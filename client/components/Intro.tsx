/* The opening title card, played on the first visit in a browser (not with reduced motion). "TypeLab" comes up in
   TypeLab's own fonts, the ones the Style page's cards start from, and is then made as a font is made:
   - a scramble of characters grows in from the left, each in a font of its own, and settles into the name letter by
     letter, the letters still in fonts of their own;
   - the whole name cuts from font to font, some cuts mixing them, over the guide lines a font is drawn on (baseline,
     x-height, cap height, named as the inspector names them), which move to each font's own heights;
   - the name is drawn as Points mode shows a letter: its anchor points and handles come in along it as its outline is
     drawn on, ascender and descender join the lines, and its ink fills in;
   - it lands on the wordmark, the header's logo, with the tagline under it, and the card fades to the app.
   A key or a click skips ahead to the fade. It is one SVG, so the name keeps one baseline under every font and the
   lines sit true to it. The fonts are the cards' web fonts, and the drawing is DRAWN's letters as the server sends
   them: the card waits up to WAIT_MS for them, plays with those that came (leaving out the drawing if its letters
   didn't), and shows the wordmark alone when too few fonts did. Once seen it's marked in localStorage under
   PREFS.introSeen (lib/prefs.ts), which the browser tools in tools/browser set beforehand to keep it out of the way. */
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { FreeFontData, PackedNode } from '../../shared/engine';
import { OWN_FAMILIES, fontId, type FreeFontRef } from '../../shared/free-fonts';
import { api } from '../lib/api';
import { fontStyle, webFont } from '../lib/free';
import { guideLines, stackLabels } from '../lib/guide-labels';
import { n1, useSize } from '../lib/hooks';
import { PREFS, prefFlag, setPrefFlag } from '../lib/prefs';

const NAME = 'TypeLab';
const FONTS = Object.entries(OWN_FAMILIES).map(([family, o]) => fontId({ family, weight: o.weight, italic: o.italic }));
/** what the scramble shows where a letter hasn't settled yet */
const NOISE = 'ABDEGHKMNQRSUWXZadfghkmnqrsuwz0123456789&?!#%@*';
/** The whole name's cuts, in order: a font's name sets it in that font, a `+` after it sets two of its letters in
    others, and `*` gives every letter a font of its own. Neighbours look far apart. A font that didn't come is left
    out. */
const CUTS = ['Cathedral', '*', 'Gumdrop', 'Serenade', 'Dispatch+', 'Orbital', 'Couture', '*', 'Boardwalk', 'Jotter'];
/** the font the name is drawn in last: a sans like the wordmark's Inter, so the wordmark reads as what was drawn */
const DRAWN = 'Mainline:600';
/** how long to wait for the fonts, and the fewest to play with */
const WAIT_MS = 1200, FEWEST = 6;
/** each step of the scramble growing and of it settling; the cuts slow from CUT_MS to CUT_MS + SLOW_MS */
const GROW_MS = 45, SETTLE_MS = 55, CUT_MS = 55, SLOW_MS = 100;
/** The drawing: its points come in over POINTS_MS while each letter's outline is drawn on (over .intro-outline's
    .42s in styles.css, a letter LETTER_MS after the one before), the ink fills in from FILL_MS as the points and
    lines go, and the wordmark follows at DRAW_MS. */
const POINTS_MS = 420, LETTER_MS = 30, FILL_MS = 760, DRAW_MS = 1100;
/** the smallest size, in px to the em, the drawing's points show their handles at */
const HANDLES_FROM = 80;
/** how long the wordmark shows, then how long it fades; FADE_MS matches .intro's opacity transition in styles.css */
const HOLD_MS = 1100, FADE_MS = 450;
/** the window's left edge to the lines' names, and the narrowest window that shows them (on phones they'd run into
    the name) */
const EDGE = 24, NAMED_FROM = 600;

type Letter = { ch: string; font: FreeFontRef };
/** A font's heights in ems: x-height and cap height, and, in the drawing, its ascender and (below zero) descender. */
type Heights = { xh: number; cap: number; asc?: number; desc?: number };
/** One step of the card for `ms`: the name in `letters`, each in its font, or `drawn` from its points; neither is the
    wordmark. `lines` are the guide lines' heights, none before the cuts and on the wordmark. */
interface Step { ms: number; letters?: Letter[]; drawn?: true; lines?: Heights }

const any = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

let ctx: CanvasRenderingContext2D | null | undefined;
/** A font's x-height and cap height, from its web font's ink: an x's and an H's. */
function heightsOf(r: FreeFontRef): Heights | undefined {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return undefined;
  const s = fontStyle(r);
  ctx.font = `${s.fontStyle} ${s.fontWeight} 100px ${s.fontFamily}`;
  const up = (ch: string) => ctx!.measureText(ch).actualBoundingBoxAscent / 100;
  return { xh: up('x'), cap: up('H') };
}

/** The drawing's heights: the font's own x-height and cap height, and the name's highest and lowest points. */
function drawnHeights(data: FreeFontData): Heights {
  const ys = [...NAME].flatMap(ch => (data.glyphs[ch]?.[1] ?? []).flat().map(n => n[1]));
  return { xh: data.xh / 1000, cap: data.cap / 1000, asc: Math.max(...ys) / 1000, desc: Math.min(...ys) / 1000 };
}

/** The steps, drawn afresh each time from the fonts that came, and the drawing's letters if they did. */
function plan(fonts: FreeFontRef[], drawing: FreeFontData | null): Step[] {
  const mark: Step = { ms: HOLD_MS };
  if (fonts.length < FEWEST) return [mark];
  // a font other than `not`, so letters side by side, or a word and the letters set apart in it, differ
  const other = (not?: FreeFontRef) => any(fonts.filter(f => f !== not));
  const mixed = (chars: string[]) => chars.reduce<Letter[]>((ls, ch) => [...ls, { ch, font: other(ls.at(-1)?.font) }], []);
  const noise = (n: number) => Array.from({ length: n }, () => any([...NOISE]));
  const steps: Step[] = [];
  for (let n = 1; n <= NAME.length; n++) steps.push({ ms: GROW_MS, letters: mixed(noise(n)) });
  // settling from the left, each letter keeps the font it settled in; the full name, all mixed, stays a moment longer
  const settled: Letter[] = [];
  for (let n = 1; n <= NAME.length; n++) {
    settled.push({ ch: NAME[n - 1], font: other(settled.at(-1)?.font) });
    steps.push({ ms: n === NAME.length ? SETTLE_MS * 3 : SETTLE_MS, letters: [...settled, ...mixed(noise(NAME.length - n))] });
  }
  // the cuts, the lines at each font's heights (a mixed cut keeps the last font's)
  const named = new Map(fonts.map(f => [f.family, f]));
  const cuts = CUTS.filter(c => c === '*' || named.has(c.replace('+', '')));
  let lines = heightsOf(named.get(cuts.find(c => c !== '*')?.replace('+', '') ?? '') ?? fonts[0]);
  cuts.forEach((c, k) => {
    const ms = CUT_MS + SLOW_MS * (k / Math.max(1, cuts.length - 1)) ** 2;
    if (c === '*') { steps.push({ ms, letters: mixed([...NAME]), lines }); return; }
    const font = named.get(c.replace('+', ''))!, odd = new Set<number>();
    while (c.endsWith('+') && odd.size < 2) odd.add(Math.floor(Math.random() * NAME.length));
    lines = heightsOf(font) ?? lines;
    steps.push({ ms, letters: [...NAME].map((ch, i) => ({ ch, font: odd.has(i) ? other(font) : font })), lines });
  });
  if (drawing) steps.push({ ms: DRAW_MS, drawn: true, lines: drawnHeights(drawing) });
  return [...steps, mark];
}

/** An anchor point of the drawing, in px: corner or smooth (a square or a round, as the pen draws them), and the
    ends of its handles. */
interface Point { x: number; y: number; smooth: boolean; handles: [number, number][] }

/** The name in the drawing's letters at `k` px a unit, centred on `cx` with its baseline at `base`: each letter's
    outline as a path, and its points. */
function drawName(data: FreeFontData, k: number, cx: number, base: number) {
  const letters = [...NAME].flatMap(ch => (data.glyphs[ch] ? [data.glyphs[ch]] : []));
  let left = cx - letters.reduce((w, [adv]) => w + adv, 0) * k / 2;
  return letters.map(([adv, contours]) => {
    const X = (u: number) => n1(left + u * k), Y = (u: number) => n1(base - u * k);
    // a point's handles, coming in and going out, where it has them
    const ins = (n: PackedNode) => (n.length > 2 && n[2] != null && n[3] != null ? [n[2], n[3]] as const : null);
    const outs = (n: PackedNode) => (n.length > 4 ? [n[4] as number, n[5] as number] as const : null);
    const points: Point[] = [];
    let d = '';
    for (const c of contours) {
      c.forEach((n, i) => {
        const next = c[(i + 1) % c.length], o = outs(n), ni = ins(next), h = ins(n);
        if (i === 0) d += `M${X(n[0])} ${Y(n[1])}`;
        d += o || ni ? `C${X((o ?? n)[0])} ${Y((o ?? n)[1])} ${X((ni ?? next)[0])} ${Y((ni ?? next)[1])} ${X(next[0])} ${Y(next[1])}` : `L${X(next[0])} ${Y(next[1])}`;
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

/** The guide lines across the window at `h`'s heights over the baseline `base`, at `size` px to the em, each named
    at its left end on a window wide enough; `end` fades them out with the drawing's points. */
function Guides({ h, base, size, width, end }: { h: Heights; base: number; size: number; width: number; end: boolean }) {
  const lines = guideLines({ xh: h.xh, cap: h.cap, asc: h.asc ?? NaN, desc: h.desc ?? NaN }).filter(([, y]) => !Number.isNaN(y));
  const labels = stackLabels(lines.map(([id, y]) => [id, y * size] as const), y => base - y);
  return (
    <g className={end ? 'intro-guides end' : 'intro-guides'} style={end ? { animationDelay: `${FILL_MS}ms` } : undefined}>
      {lines.map(([id, y, name]) => {
        const at = Math.round(base - y * size) + 0.5;
        return (
          <g key={id} className="intro-guide" style={{ transform: `translateY(${at}px)` }}>
            <line x2={width} />
            {width >= NAMED_FROM && <text x={EDGE} y={n1(labels.get(id)! - at)}>{name}</text>}
          </g>
        );
      })}
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
      {letters.map((l, i) => <path key={i} className="intro-outline" d={l.d} pathLength={1} style={{ animationDelay: `${80 + i * LETTER_MS}ms, ${FILL_MS}ms` }} />)}
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

function shouldPlay() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return !prefFlag(PREFS.introSeen);
}

export function Intro() {
  const [phase, setPhase] = useState<'wait' | 'play' | 'leave' | 'done'>(() => (shouldPlay() ? 'wait' : 'done'));
  const [steps, setSteps] = useState<Step[]>([]);
  const [drawing, setDrawing] = useState<FreeFontData | null>(null);
  const [at, setAt] = useState(0);
  const [ref, box] = useSize<HTMLDivElement>();
  const shown = phase !== 'done';

  // the fonts and the drawing's letters, as many as come within WAIT_MS
  useEffect(() => {
    if (phase !== 'wait') return;
    setPrefFlag(PREFS.introSeen, true);
    const got: FreeFontRef[] = [];
    let data: FreeFontData | null = null, live = true;
    const start = () => { if (!live) return; live = false; setDrawing(data); setSteps(plan(got, data)); setPhase('play'); };
    const t = setTimeout(start, WAIT_MS);
    void Promise.all([
      ...FONTS.map(id => webFont(id).then(r => { if (r) got.push(r); })),
      api.freeFont(DRAWN).then(d => { data = d; }, () => undefined)
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
  return (
    <div ref={ref} className={phase === 'leave' ? 'intro leave' : 'intro'} onClick={() => setPhase('leave')} aria-hidden="true">
      {step && W > 0 && (
        <svg className="intro-art" width={W} height={H}>
          {step.lines && <Guides h={step.lines} base={base} size={size} width={W} end={!!step.drawn} />}
          {step.letters
            ? <text className="intro-word" x={W / 2} y={base} textAnchor="middle" fontSize={size}>
              {step.letters.map((l, i) => <tspan key={i} style={fontStyle(l.font)}>{l.ch}</tspan>)}
            </text>
            : step.drawn ? drawn && <Drawing letters={drawn} size={size} />
              : <text className="intro-mark" x={W / 2} y={base} textAnchor="middle" fontSize={size}>{NAME}</text>}
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
