/* The opening title card, played on the first visit in a browser (not with reduced motion). "TypeLab" comes up in
   TypeLab's own fonts, the ones the Style page's cards start from (all but the blackletter), and in the fonts this
   browser's owner has saved (My designs, but for those begun as blackletter), and is then made as a font is made:
   - a scramble of characters grows in from the left, each in a font of its own, popping in, jumping about the
     baseline and some in the accent, and settles into the name letter by letter, each settled letter dropping onto
     the baseline, the letters still in fonts of their own, set evenly by their ink and each staying put once settled;
   - the whole name cuts from font to font, each cut led by one font setting half its letters among others in fonts of
     their own, some carried over from the cut before, so one cut mixes into the next (one cut all mixed), over the
     guide lines a font is drawn on (baseline, x-height, cap height), which move to each leading font's own heights;
     each cut's new letters come in a way of its own (rising, stretched tall, dropped, turned), the card goes ink and
     then the accent under a few, one cut is set larger, one has the name again a row over the whole window in fonts
     of their own, and the last is slammed down onto the lines;
   - the name is drawn in the logo's letters, in capitals as the header sets it, as Points mode shows a letter: its
     points (corners and extremes) and handles come in along it as its outline is drawn on, the lines move to the
     logo's heights and its ink fills in;
   - the drawing gives way to the wordmark, the header's logo in its font (Lineup), the very letters drawn, with the
     tagline under it, and the card fades to the app, the words first.
   A key or a click skips ahead to the fade. It is one SVG, so the name keeps one baseline under every font and the
   lines sit true to it. The own fonts are the cards' web fonts, a saved font is drawn as the engine builds it (as My
   designs draws its name), and the drawing is the logo's capitals as tools/fonts/ui.ts writes them beside its font
   (client/fonts/Lineup.json): the card waits up to WAIT_MS for them, plays with those that came (leaving out the
   drawing if its letters didn't), and shows the wordmark alone when too few own fonts did. Once seen it's marked in
   localStorage under PREFS.introSeen (lib/prefs.ts), which the browser tools in tools/browser set beforehand to keep
   it out of the way. */
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
/** how far, in ems, an unsettled letter of the scramble jumps off the baseline at most, and the share of them in the
    accent */
const JUMP = 0.22, HOT = 0.3;
/** the room between two letters in fonts of their own, ink to ink, in ems */
const LETTER_GAP = 0.07;
/** How a step's new letters come in (.intro-in in styles.css): bursting in from larger, rising, dropping onto the
    baseline, stretched tall, or turned; `slam` sets the whole name down from larger. */
type Motion = 'burst' | 'rise' | 'drop' | 'stretch' | 'turn' | 'slam';
/** One cut: the font that leads it, how long it shows and how its new letters come in; the card's ground under it
    (ink or the accent, the letters in paper); how much larger it is set, as the window allows; and whether the name
    comes again a row over the whole window, each row in a font of its own and hollow. */
interface Cut { lead: string; ms: number; motion: Motion; ground?: 'ink' | 'accent'; zoom?: number; rows?: true }
/** The whole name's cuts, in order: a font's name leads the cut, setting LEAD of its letters, and `*` gives every
    letter a font of its own. Neighbours look far apart, heavy after light, and the last, held longest, is the boldest.
    The dark grounds come in one run, so the card turns dark only once and never flashes. A font that didn't come is
    left out. */
const CUTS: Cut[] = [
  { lead: 'Couture', ms: 150, motion: 'rise' },
  { lead: 'Timber', ms: 150, motion: 'stretch' },
  { lead: '*', ms: 160, motion: 'drop', ground: 'ink' },
  { lead: 'Serenade', ms: 170, motion: 'turn', ground: 'ink' },
  { lead: 'Gumdrop', ms: 260, motion: 'stretch', ground: 'accent', zoom: 1.5 },
  { lead: 'Dispatch', ms: 440, motion: 'rise', rows: true },
  { lead: 'Orbital', ms: 560, motion: 'slam' }
];
/** how far apart, in ms, a cut's new letters start coming in, left to right; the rows' pitch, in ems */
const STAGGER = 12, PITCH = 1.05;
/** the share of the name's letters a cut's leading font sets, at places drawn afresh each cut; the rest are each in a
    font of their own, a letter keeping the one it had the cut before by CHURN's odds, so one cut mixes into the next */
const LEAD = 0.5;
/** the cuts the saved fonts take, the latest saved first, so as many of them come up as there are, the cuts as many */
const MINE_AT = ['Gumdrop', 'Timber', 'Dispatch'];
/** how long to wait for the fonts, and the fewest to play with */
const WAIT_MS = 1200, FEWEST = 6;
/** each step of the scramble growing and of it settling */
const GROW_MS = 55, SETTLE_MS = 70;
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
/** the least room between the window's edge and a scramble's letters, and how near, in px, a guide line can come to
    one before it without being left out, the two reading as one */
const EDGE = 24, ONE = 6;

/** What a letter is set in: an own font's web font, or a saved font's letters as the engine draws them. */
type Face = { web: FreeFontRef; mine?: undefined } | { mine: Font; web?: undefined };
/** A letter in its face, `id` new each time one changes, so only what changed comes in; a scramble's unsettled
    letter jumps `dy` ems off the baseline (down) and may be `hot`, in the accent. */
type Letter = { ch: string; face: Face; id: number; dy?: number; hot?: true };
/** A font's heights in ems: x-height and cap height, and, in the drawing, its ascender and (below zero) descender. */
type Heights = { xh: number; cap: number; asc?: number; desc?: number };
/** One step of the card for `ms`: the name in `letters`, each in its font, or `drawn` from its points; neither is the
    wordmark. `lines` are the guide lines' heights, none before the cuts and on the wordmark. The scramble is set from
    where `from`, the settled name, starts. Its new letters come in by `motion`, `stagger` ms apart; a cut's `ground`,
    `zoom` and `rows` (the name in each row's face) are its Cut's. */
interface Step {
  ms: number; letters?: Letter[]; from?: Letter[]; drawn?: true; lines?: Heights;
  motion?: Motion; stagger?: number; ground?: Cut['ground']; zoom?: number; rows?: Letter[][];
}
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
  // a new letter; one of the scramble's unsettled ones (`noise`) jumps off the baseline, and may be in the accent
  let made = 0;
  const letter = (ch: string, face: Face, noise?: boolean): Letter => {
    const l: Letter = { ch, face, id: made++ };
    if (noise) { l.dy = (Math.random() * 2 - 1) * JUMP; if (Math.random() < HOT) l.hot = true; }
    return l;
  };
  // the scramble's next `n` letters after `was`, each changed by CHURN's odds (a new one always), in a face unlike
  // its neighbours' (`left` the face of the letter before them)
  const stir = (was: Letter[], n: number, left?: Face) => Array.from({ length: n }).reduce<Letter[]>((ls, _, i) => {
    const prev = ls.at(-1)?.face ?? left, kept = i < was.length && Math.random() > CHURN && was[i].face !== prev, ch = any([...NOISE]);
    return [...ls, kept ? was[i] : letter(ch, other(ch, prev, was[i + 1]?.face), true)];
  }, []);
  const scramble: Letter[][] = [];
  let noise: Letter[] = [];
  for (let n = 1; n <= NAME.length; n++) scramble.push(noise = stir(noise, n));
  // settling from the left, each letter keeps the face it settled in; the full name, all mixed, stays a moment longer
  const settled: Letter[] = [];
  for (let n = 1; n <= NAME.length; n++) {
    settled.push(letter(NAME[n - 1], other(NAME[n - 1], settled.at(-1)?.face, noise[1]?.face)));
    noise = stir(noise.slice(1), NAME.length - n, settled[n - 1].face);
    scramble.push([...settled, ...noise]);
  }
  // all of it set from where the settled name starts, so it grows from there and a settled letter stays put; growing,
  // the new letters burst in, and settling, they drop onto the baseline
  const steps: Step[] = scramble.map((letters, i) => i < NAME.length
    ? { ms: GROW_MS, letters, from: settled, motion: 'burst' }
    : { ms: i < scramble.length - 1 ? SETTLE_MS : SETTLE_MS * 3, letters, from: settled, motion: 'drop' });
  // the cuts, a saved font in the place of an own one where there is one, each mixing into the one before: its
  // leading face sets LEAD of the letters, wherever they fall, and every other letter is in a face unlike its
  // neighbours' and the leading one, keeping the one it had the cut before by CHURN's odds; the lines at the leading
  // face's heights (a cut all mixed keeps the last's)
  const named = new Map(own.map(f => [f.web.family, f]));
  const cuts = CUTS.flatMap(cut => {
    const face = cut.lead === '*' ? undefined : saved[MINE_AT.indexOf(cut.lead)] ?? named.get(cut.lead);
    return face || cut.lead === '*' ? [{ cut, lead: face }] : [];
  });
  let lines = heightsOf(cuts.find(c => c.lead)?.lead ?? own[0]), was = settled;
  for (const { cut, lead } of cuts) {
    const at = new Set<number>();
    while (lead && at.size < Math.round(NAME.length * LEAD)) at.add(Math.floor(Math.random() * NAME.length));
    const letters = [...NAME].reduce<Letter[]>((ls, ch, i) => {
      const prev = ls.at(-1)?.face, had = was[i], kept = Math.random() > CHURN && had.face !== prev && had.face !== lead;
      return [...ls, lead && at.has(i) ? letter(ch, lead) : kept ? had : letter(ch, other(ch, prev, lead))];
    }, []);
    if (lead) lines = heightsOf(lead) ?? lines;
    // the rows: the name in every other face, in an order drawn afresh
    const rows = cut.rows && faces.filter(f => f !== lead).sort(() => Math.random() - 0.5).map(f => [...NAME].map(ch => letter(ch, f)));
    steps.push({ ms: cut.ms, letters, lines, motion: cut.motion, stagger: STAGGER, ground: cut.ground, zoom: cut.zoom, rows: rows || undefined });
    was = letters;
  }
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

/** Letters in faces of their own, set side by side: where each is set from the left and where its ink's middle is, in
    ems, and how wide they all are, each letter's ink LETTER_GAP from the one before's, so they sit evenly however
    their fonts space them and never run into each other. */
function inked(letters: Letter[]) {
  let w = 0;
  const mids: number[] = [];
  const xs = letters.map(({ ch, face }, i) => {
    const [l, r] = inkOf(face, ch), x = w - l;
    mids.push(w + (r - l) / 2);
    w += r - l + (i < letters.length - 1 ? LETTER_GAP : 0);
    return x;
  });
  return { xs, mids, w };
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
    spaces it), else letter by letter by their ink, each new letter coming in by `motion` about its ink's middle on the
    baseline, `stagger` ms after the one before (a slam sets the whole name down at once). */
function Word({ letters, from, size, cx, base, motion, stagger = 0 }: {
  letters: Letter[]; from?: Letter[]; size: number; cx: number; base: number; motion?: Motion; stagger?: number;
}) {
  const face = letters[0]?.face, one = !from && !!face && letters.every(l => l.face === face);
  if (one && face.web) return <text className="intro-word" x={cx} y={base} textAnchor="middle" fontSize={size} style={fontStyle(face.web)}>{letters.map(l => l.ch).join('')}</text>;
  const { xs, w, mids } = one && face.mine ? { ...spaced(face.mine, letters), mids: undefined } : inked(letters);
  // set from where `from` starts, unless that runs it off the window's right (a scramble of wide letters on a phone)
  const left = from ? Math.min(cx - inked(from).w * size / 2, Math.max(EDGE, 2 * cx - EDGE - w * size)) : cx - w * size / 2;
  const k = +(size / 1000).toFixed(4), slam = motion === 'slam', moves = !!motion && !slam && !!mids;
  return (
    <g className={slam ? 'intro-word slam' : 'intro-word'} style={slam ? { transformOrigin: `${n1(cx)}px ${n1(base - 0.35 * size)}px` } : undefined}>
      {letters.map(({ ch, face: { web, mine }, id, dy = 0, hot }, i) => {
        const at = n1(left + xs[i] * size), y = n1(base + dy * size), g = mine?.glyph(ch);
        // the letter in a group of its own, which moves, as a saved font's letter is placed by its own transform
        return (
          <g key={id} className={[moves && `intro-in ${motion}`, hot && 'hot'].filter(Boolean).join(' ') || undefined}
            style={moves ? { transformOrigin: `${n1(left + mids![i] * size)}px ${y}px`, animationDelay: `${i * stagger}ms` } : undefined}>
            {web
              ? <text x={at} y={y} fontSize={size} style={fontStyle(web)}>{ch}</text>
              : g && <path d={g.d} transform={`translate(${at} ${y}) scale(${k})`} />}
          </g>
        );
      })}
    </g>
  );
}

/** The name again in `rows`, a row in each one's face over the whole window `height` high, above and below the one on
    `base`, hollow, those next to each other sliding in from either side, the nearest first. */
function Rows({ rows, size, cx, base, height }: { rows: Letter[][]; size: number; cx: number; base: number; height: number }) {
  const pitch = Math.round(size * PITCH), placed: { y: number; k: number; side: number }[] = [];
  for (let k = 1; base - k * pitch + 0.3 * size > 0 || base + k * pitch - size < height; k++) {
    placed.push({ y: base - k * pitch, k, side: 0 }, { y: base + k * pitch, k, side: 1 });
  }
  return placed.map(({ y, k, side }, j) => (
    <g key={y} className={(k + side) % 2 ? 'intro-row r' : 'intro-row l'} style={{ animationDelay: `${(k - 1) * 30}ms` }}>
      <Word letters={rows[j % rows.length]} size={size} cx={cx} base={y} />
    </g>
  ));
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
  const size = Math.min(150, Math.max(60, W * 0.1)), base = Math.round(H / 2 + 0.2 * size - 10);
  const drawn = useMemo(() => (drawing && W ? drawName(drawing, size / 1000, W / 2, base) : null), [drawing, W, size, base]);

  if (!shown) return null;
  // nothing while the fonts come (or when skipped before they did)
  const step = phase === 'wait' ? undefined : steps[at];
  // a cut set larger, as far as the window allows, its baseline lowered so it grows about its middle
  const z = step?.zoom && step.letters ? Math.max(1, Math.min(step.zoom, (W - 2 * EDGE) / (inked(step.letters).w * size))) : 1;
  const s = n1(size * z), b = Math.round(base + 0.35 * (s - size));
  const lines = step?.lines && guidesAt(step.lines, b, s);
  return (
    <div ref={ref} className={phase === 'leave' ? 'intro leave' : 'intro'} data-ground={step?.ground} onClick={() => setPhase('leave')} aria-hidden="true">
      {step && W > 0 && (
        <svg className="intro-art" width={W} height={H} style={{ '--em': `${s}px` } as CSSProperties}>
          {lines && <Guides lines={lines} width={W} end={!!step.drawn} />}
          {step.rows && <Rows key={at} rows={step.rows} size={s} cx={W / 2} base={b} height={H} />}
          {step.letters
            ? <Word key={step.motion === 'slam' ? at : undefined} letters={step.letters} from={step.from} size={s} cx={W / 2} base={b} motion={step.motion} stagger={step.stagger} />
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
