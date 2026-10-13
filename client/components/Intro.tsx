/* The opening title card, played on the first visit in a browser (not with reduced motion). "TypeLab" comes up in
   TypeLab's own fonts, the ones the Style page's cards start from (all but the blackletter), and in the fonts this
   browser's owner has saved (My designs, but for those begun as blackletter), and is then made as a font is made:
   - the name's first letter comes up, a scramble of characters grows from it to its right, each in an own font of
     its own, and it settles into the name letter by letter, the letters still in fonts of their own, set evenly by
     their ink and each staying put once settled;
   - the whole name cuts from font to font, four cuts on one beat, each led by one font setting half its letters among
     others in fonts of their own, some carried over from the cut before, so one cut mixes into the next, over the
     guide lines a font is drawn on (baseline, x-height, cap height), which move to each leading font's own heights;
   all of it moving one way: a letter that changes rolls through the line's slot, as on a split-flap board, the old
   one up and out of it as the new one comes up into it from under it (the scramble's characters spinning through
   quickly and the name's letters landing; in a cut, each a moment after the one on its left), and a letter that
   stays slides along to its new place, the guide lines with it, all on one easing;
   - the name is drawn in the logo's letters, in capitals as the header sets it, as Points mode shows a letter: its
     points (corners and extremes) and handles come in along it as its outline is drawn on, the lines move to the
     logo's heights and its ink fills in;
   - the drawing gives way to the wordmark, the header's logo in its font (Lineup), the very letters drawn, with the
     tagline under it, and the card fades to the app, the words first.
   A key or a click skips ahead to the fade. It is one SVG, so the name keeps one baseline under every font and the
   lines sit true to it. The own fonts are the cards' web fonts, a saved font is drawn as the engine builds it (as My
   designs draws its name), and the drawing is the logo's capitals as tools/fonts/ui.ts writes them beside its font
   (client/fonts/Lineup.json): the card waits up to WAIT_MS for them, plays with those that came (leaving out the
   drawing if its letters didn't), and shows the wordmark alone when too few own fonts did. A saved font is built only
   while the card waits, its name's letters and those the lines are read off with it, so nothing is built as it plays
   (building one holds the page up). Once seen it's marked in localStorage under PREFS.introSeen (lib/prefs.ts), which
   the browser tools in tools/browser set beforehand to keep it out of the way. */
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react';
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
/** The whole name's cuts, in order, each led by a font's name setting LEAD of its letters. Neighbours look far apart,
    heavy after light, and the last, held longest, is the boldest. A font that didn't come is left out. */
const CUTS = ['Couture', 'Serenade', 'Gumdrop', 'Orbital'];
/** how long each cut shows, the last held longest, and how far apart, in ms, its letters that change start rolling,
    from the left */
const CUT_MS = 300, LAST_MS = 600, STAGGER = 14;
/** The slot the name's letters roll through, in ems over and under the baseline: what a letter draws outside it is
    cut off, so it is roomy, and .intro-roll's travel in styles.css carries a letter clear of it. */
const SLOT = [1.3, 0.55] as const;
/** the share of the name's letters a cut's leading font sets, at places drawn afresh each cut; the rest are each in a
    font of their own, a letter keeping the one it had the cut before by CHURN's odds, so one cut mixes into the next */
const LEAD = 0.5;
/** the cuts the saved fonts take, the latest saved first, so as many of them come up as there are, the cuts as many */
const MINE_AT = ['Gumdrop', 'Couture', 'Serenade'];
/** how long to wait for the fonts, and the fewest to play with */
const WAIT_MS = 900, FEWEST = 6;
/** each step of the scramble growing and of it settling */
const GROW_MS = 55, SETTLE_MS = 65;
/** The drawing: its points come in over POINTS_MS while each letter's outline is drawn on (over .intro-outline's
    .42s in styles.css, a letter LETTER_MS after the one before), the ink fills in from FILL_MS as the points and
    lines go, and the wordmark follows at DRAW_MS. */
const POINTS_MS = 420, LETTER_MS = 30, FILL_MS = 760, DRAW_MS = 1100;
/** the smallest size, in px to the em, the drawing's points show their handles at; how sharply the outline turns at a
    point for it to show as a corner (the cosine of 25°), and how far apart, in units, two points it shows are at least */
const HANDLES_FROM = 80, CORNER = Math.cos(25 * Math.PI / 180), CLEAR = 50;
/** how long the wordmark shows, then how long it fades; FADE_MS matches .intro.leave's opacity transition in
    styles.css, its delay counted */
const HOLD_MS = 1300, FADE_MS = 650;
/** the least room between the window's edge and a scramble's letters, and how near, in px, a guide line can come to
    one before it without being left out, the two reading as one */
const EDGE = 24, ONE = 6;

/** What a letter is set in: an own font's web font, or a saved font's letters as the engine draws them. */
type Face = { web: FreeFontRef; mine?: undefined } | { mine: Font; web?: undefined };
/** A letter in its face, `id` new each time one changes, so only what changed rolls; one of the scramble's characters
    rolls in `quick`. */
type Letter = { ch: string; face: Face; id: number; quick?: true };
/** A font's heights in ems: x-height and cap height, and, in the drawing, its ascender and (below zero) descender. */
type Heights = { xh: number; cap: number; asc?: number; desc?: number };
/** One step of the card for `ms`: the name in `letters`, each in its font, or `drawn` from its points; neither is the
    wordmark. `lines` are the guide lines' heights, none before the cuts and on the wordmark. The scramble is set from
    where `from`, the settled name, starts. In a `cut`, the letters that change roll one after another from the left;
    in the scramble, all at once. */
interface Step { ms: number; letters?: Letter[]; from?: Letter[]; drawn?: true; lines?: Heights; cut?: true }
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

/** The drawing's heights: the font's own x-height and cap height, and the name's highest and lowest points. */
function drawnHeights(data: Logo): Heights {
  const ys = [...MARK].flatMap(ch => (data.glyphs[ch]?.[1] ?? []).flat().map(n => n[1]));
  return { xh: data.xh / 1000, cap: data.cap / 1000, asc: Math.max(...ys) / 1000, desc: Math.min(...ys) / 1000 };
}

/** A saved font's letters, once the free fonts it's written in have come, built while the card still `waits`: the
    name's, and the x and the H its lines are read off; null when it can't draw the name or the card has started. */
async function built(d: Design, waits: () => boolean): Promise<Font | null> {
  await Promise.all(fontFor(d.params).freeMissing.map(loadFreeFont));
  // a moment for the card's wait to run out, as the free fonts may all come at once
  await new Promise(r => setTimeout(r));
  if (!waits()) return null;
  const f = fontFor(d.params);
  if (![...NAME].every(ch => f.glyph(ch))) return null;
  for (const ch of 'xH') f.glyph(ch);
  return f;
}

/** Whether a saved font was begun as blackletter, or is written in its font. */
const blackletter = (d: Design) => d.styleId === BLACKLETTER || (!!d.params.freeFont && parseFontId(d.params.freeFont)?.family === BLACK_FONT);

/** The steps, drawn afresh each time from the own fonts and saved ones that came, and the drawing's letters if they
    did. */
function plan(fonts: FreeFontRef[], mine: Font[], drawing: Logo | null): Step[] {
  const mark: Step = { ms: HOLD_MS };
  if (fonts.length < FEWEST) return [mark];
  const own = fonts.map(web => ({ web })), saved = mine.map(f => ({ mine: f })), faces: Face[] = [...own, ...saved];
  // a face of `pool` other than those in `not` that draws `ch`, so letters side by side differ
  const other = (ch: string, pool: Face[], ...not: (Face | undefined)[]) => any(pool.filter(f => !not.includes(f) && (!f.mine || f.mine.glyph(ch))));
  let made = 0;
  const letter = (ch: string, face: Face, quick?: true): Letter => ({ ch, face, id: made++, quick });
  // the scramble's next `n` letters after `was`, each changed by CHURN's odds (a new one always), in an own face (a
  // saved one would be built letter by letter as it plays) unlike its neighbours' (`left` the face of the letter
  // before them)
  const stir = (was: Letter[], n: number, left?: Face) => Array.from({ length: n }).reduce<Letter[]>((ls, _, i) => {
    const prev = ls.at(-1)?.face ?? left, kept = i < was.length && Math.random() > CHURN && was[i].face !== prev, ch = any([...NOISE]);
    return [...ls, kept ? was[i] : letter(ch, other(ch, own, prev, was[i + 1]?.face), true)];
  }, []);
  // the name's first letter comes first, and the scramble grows from it to its right
  const settled: Letter[] = [letter(NAME[0], other(NAME[0], faces))];
  const scramble: Letter[][] = [];
  let noise: Letter[] = [];
  for (let n = 0; n < NAME.length; n++) scramble.push([settled[0], ...(noise = stir(noise, n, settled[0].face))]);
  // settling from the left, each letter keeps the face it settled in; the full name, all mixed, stays a moment longer
  for (let n = 2; n <= NAME.length; n++) {
    settled.push(letter(NAME[n - 1], other(NAME[n - 1], faces, settled.at(-1)?.face, noise[1]?.face)));
    noise = stir(noise.slice(1), NAME.length - n, settled[n - 1].face);
    scramble.push([...settled, ...noise]);
  }
  // all of it set from where the settled name starts, so it grows from there and a settled letter stays put
  const steps: Step[] = scramble.map((letters, i) => ({
    ms: i < NAME.length ? GROW_MS : i < scramble.length - 1 ? SETTLE_MS : SETTLE_MS * 3, letters, from: settled
  }));
  // the cuts, a saved font in the place of an own one where there is one, each mixing into the one before: its
  // leading face sets LEAD of the letters, wherever they fall, and every other letter is in a face unlike its
  // neighbours' and the leading one, keeping the one it had the cut before by CHURN's odds; the lines at the leading
  // face's heights
  const named = new Map(own.map(f => [f.web.family, f]));
  const cuts = CUTS.flatMap(c => {
    const lead = saved[MINE_AT.indexOf(c)] ?? named.get(c);
    return lead ? [lead] : [];
  });
  let lines = heightsOf(cuts[0] ?? own[0]), was = settled;
  cuts.forEach((lead, k) => {
    const at = new Set<number>();
    while (at.size < Math.round(NAME.length * LEAD)) at.add(Math.floor(Math.random() * NAME.length));
    const letters = [...NAME].reduce<Letter[]>((ls, ch, i) => {
      const prev = ls.at(-1)?.face, had = was[i], kept = Math.random() > CHURN && had.face !== prev && had.face !== lead;
      return [...ls, at.has(i) ? letter(ch, lead) : kept ? had : letter(ch, other(ch, faces, prev, lead))];
    }, []);
    lines = heightsOf(lead) ?? lines;
    steps.push({ ms: k < cuts.length - 1 ? CUT_MS : LAST_MS, letters, lines, cut: true });
    was = letters;
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

/** A guide line: its id, and where it runs across the window (px down). */
interface Guide { id: string; at: number }

/** The guide lines at `h`'s heights over the baseline `base`, at `size` px to the em (the drawing's ascender is
    often all but its cap height). */
const guidesAt = (h: Heights, base: number, size: number): Guide[] =>
  guideLines({ xh: h.xh, cap: h.cap, asc: h.asc ?? NaN, desc: h.desc ?? NaN })
    .filter(([, y]) => !Number.isNaN(y))
    .map(([id, y]) => ({ id, at: Math.round(base - y * size) + 0.5 }))
    .filter((l, i, ls) => !ls.slice(0, i).some(k => Math.abs(k.at - l.at) < ONE));

/** The guide lines across the window, unnamed. `end` fades them out with the drawing's points. */
function Guides({ lines, width, end }: { lines: Guide[]; width: number; end: boolean }) {
  return (
    <g className={end ? 'intro-guides end' : 'intro-guides'} style={end ? { animationDelay: `${FILL_MS}ms` } : undefined}>
      {lines.map(l => <g key={l.id} className="intro-guide" style={{ transform: `translateY(${l.at}px)` }}><line x2={width} /></g>)}
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

/** Where each of `letters` is set, in px from the window's left, at `size` px to the em: centred on `cx`, or from
    where `from` would start, unless that runs it off the window's right (a scramble of wide letters on a phone). */
function placed(letters: Letter[], size: number, cx: number, from?: Letter[]) {
  const { xs, w } = inked(letters);
  const left = from ? Math.min(cx - inked(from).w * size / 2, Math.max(EDGE, 2 * cx - EDGE - w * size)) : cx - w * size / 2;
  return xs.map(x => n1(left + x * size));
}

/** A letter gone from the line: where it stood, in px from the window's left, and its place in the line it left. */
interface Gone { letter: Letter; x: number; i: number }

/** The name's line at `size` px to the em on the baseline `base`, cut off at its slot (#intro-slot): `letters` where
    `xs` sets them, and `gone`, the letters of the step before that changed. A letter that stays slides to its new
    place; a new one rolls up into the line from under it, and one gone rolls up out of it; in a `wave`, each a
    moment after the one on its left. Each letter is two groups, the outer setting it along the line and the inner
    rolling, as a saved font's letter is placed by its own transform. */
function Line({ letters, xs, gone, size, base, wave }: { letters: Letter[]; xs: number[]; gone: Gone[]; size: number; base: number; wave: boolean }) {
  const k = +(size / 1000).toFixed(4);
  const glyph = ({ ch, face: { web, mine } }: Letter) => {
    const g = mine?.glyph(ch);
    return web ? <text y={base} fontSize={size} style={fontStyle(web)}>{ch}</text> : g && <path d={g.d} transform={`translate(0 ${base}) scale(${k})`} />;
  };
  const roll = (i: number) => (wave ? { animationDelay: `${i * STAGGER}ms` } : undefined);
  // the letters that stay first, so they keep their places among the elements and slide rather than start again
  return (
    <g className="intro-word" clipPath="url(#intro-slot)">
      {letters.map((l, i) => <g key={l.id} className="intro-at" style={{ transform: `translateX(${xs[i]}px)` }}><g className={l.quick ? 'intro-roll quick' : 'intro-roll'} style={roll(i)}>{glyph(l)}</g></g>)}
      {gone.map(({ letter, x, i }) => <g key={`-${letter.id}`} style={{ transform: `translateX(${x}px)` }}><g className={letter.quick ? 'intro-roll out quick' : 'intro-roll out'} style={roll(i)}>{glyph(letter)}</g></g>)}
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
      // the latest saved fonts, as many as the cuts they take, kept in that order, those built while the card waits
      api.listDesigns().then(ds => Promise.all(ds.filter(d => !blackletter(d)).slice(0, MINE_AT.length)
        .map((d, i) => built(d, () => live).then(f => { mine[i] = f; }, () => undefined))), () => undefined)
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
  const size = Math.min(150, Math.max(60, W * 0.1)), base = Math.round(H / 2 + 0.2 * size - 10);
  const drawn = useMemo(() => (drawing && W ? drawName(drawing, size / 1000, W / 2, base) : null), [drawing, W, size, base]);

  if (!shown) return null;
  // nothing while the fonts come (or when skipped before they did)
  const step = phase === 'wait' ? undefined : steps[at];
  const lines = step?.lines && guidesAt(step.lines, base, size);
  // the name's line: this step's letters, and those of the step before that go (all of them as the drawing follows
  // the last cut), in a cut or as the drawing follows rolling in a wave
  const prev = steps[at - 1], wave = !!step?.cut || (!!step?.drawn && !!prev?.cut);
  const xs = step?.letters ? placed(step.letters, size, W / 2, step.from) : [];
  const gone: Gone[] = [];
  if ((step?.letters || step?.drawn) && prev?.letters) {
    const was = placed(prev.letters, size, W / 2, prev.from), stays = new Set(step?.letters?.map(l => l.id));
    prev.letters.forEach((letter, i) => { if (!stays.has(letter.id)) gone.push({ letter, x: was[i], i }); });
  }
  return (
    <div ref={ref} className={phase === 'leave' ? 'intro leave' : 'intro'} onClick={() => setPhase('leave')} aria-hidden="true">
      {step && W > 0 && (
        <svg className="intro-art" width={W} height={H} style={{ '--em': `${size}px` } as CSSProperties}>
          <defs><clipPath id="intro-slot"><rect y={n1(base - SLOT[0] * size)} width={W} height={n1((SLOT[0] + SLOT[1]) * size)} /></clipPath></defs>
          {lines && <Guides lines={lines} width={W} end={!!step.drawn} />}
          {(step.letters || gone.length > 0) && <Line letters={step.letters ?? []} xs={xs} gone={gone} size={size} base={base} wave={wave} />}
          {step.drawn && drawn && <Drawing letters={drawn} size={size} />}
          {!step.letters && !step.drawn && <>
            {/* the drawing, filled, stays under the wordmark as it comes in over it, so one reads as the other */}
            {drawn && prev?.drawn && <g className="intro-drawn">{drawn.map((l, i) => <path key={i} d={l.d} />)}</g>}
            <text className="intro-mark" x={W / 2} y={base} textAnchor="middle" fontSize={size}>{MARK}</text>
          </>}
        </svg>
      )}
      {step && !step.letters && !step.drawn && (
        <div className="intro-tag" style={{ top: n1(base + 0.36 * size) }}>
          {'Experiment with type.'.split(' ').map((w, i) => <span key={i} style={{ animationDelay: `${300 + i * 150}ms` }}>{w}</span>)}
        </div>
      )}
    </div>
  );
}
