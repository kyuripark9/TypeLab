/* The opening title card, played on the first visit in a browser (not with reduced motion). "TypeLab" comes up in
   the fonts saved in My designs (the designer's, but for those begun as blackletter), with TypeLab's own fonts among
   them (INTRO_OWN in shared/free-fonts.ts), no font set twice in a line and each step bringing in fonts the one
   before didn't set, and is then made as a font is made:
   - the name's first letter comes up, turning from font to font as a scramble of capitals, symbols here and there
     among them, grows from it to its right, each in a font of its own, and a few steps in, as it goes on growing, it
     settles into the name letter by letter from the left, in capitals as the logo sets it, so the name keeps one
     shape from here to the wordmark, the letters still in fonts of their own, set evenly by their ink and each
     staying put once settled;
   - the whole name cuts from font to font, four cuts slowing to a rest, each led by one font setting one of its
     letters among others in fonts of their own, some carried over from the cut before, so one cut mixes into the
     next, over the guide lines a font is drawn on (baseline, x-height, cap height), which move to each leading font's
     own heights, and upright ones parting its letters;
   all of it moving one way: a letter that changes rolls through the line's slot, as on a split-flap
   board, the old one up and out of it as the new one comes up into it from under it, all at once, each landing before
   the next comes, and a letter that stays slides along to its new place, the guide lines with it, all on one easing;
   - the name is drawn in the logo's letters, in capitals as the header sets it, as Points mode shows a letter: its
     points (corners and extremes) and handles come in along it as its outline is drawn on, the lines move to the
     logo's heights and its letters' edges, and its ink fills in, as the tagline comes in under it word by word and
     the credit after it at the card's foot;
   - the drawing gives way to the wordmark, the header's logo in its font (Lineup), the very letters drawn, the
     tagline and the credit staying, and the card fades to the app, the words first.
   A key or a click skips ahead to the fade, as a faint note at the card's foot says until the credit takes its place.
   It is one SVG, so the name keeps one baseline under every font and the lines sit true to it. The saved fonts are
   web fonts tools/fonts/intro.ts makes of them (client/fonts/intro/) and the own ones the server's (introFontUrl),
   both cut to the letters the card sets (INTRO_CHARS), so nothing is built as it waits or plays, and the drawing is the logo's capitals as tools/fonts/ui.ts writes them beside its font
   (client/fonts/Lineup.json): they are fetched first, as soon as the app's code has run (the Style page's fonts wait
   for the scramble to settle), and the card waits up to WAIT_MS for them and for the page under it to settle, plays with those that came (leaving out the drawing if its
   letters didn't), and shows the wordmark alone when too few fonts did. While it plays the editor's letters aren't
   built (lib/opening.ts), as building them stalls its steps, until the wordmark stands still. Once seen it's marked in
   localStorage under PREFS.introSeen (lib/prefs.ts), which the browser tools in tools/browser set beforehand to keep
   it out of the way. */
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import type { FreeFontData, PackedNode } from '../../shared/engine';
import { INTRO_OWN, INTRO_SYMBOLS, OWN_FAMILIES, fontId, introFontUrl } from '../../shared/free-fonts';
import { guideLines } from '../lib/guide-labels';
import { n1, useSize } from '../lib/hooks';
import { holdForOpening, letGo, openingFontsIn } from '../lib/opening';
import { PREFS, prefFlag, setPrefFlag } from '../lib/prefs';
import LOGO_LETTERS from '../fonts/Lineup.json?url';

const NAME = 'TypeLab';
/** the name as the logo sets it, in capitals (.brand-name in styles.css): the drawing and the wordmark */
const MARK = NAME.toUpperCase();
/** the card's web fonts, each by its name: the saved fonts' by their files' (the designs', as tools/fonts/intro.ts
    names them), then the own fonts mixed in among them, by their families' */
const FONTS: { name: string; url: string; own?: true }[] = [
  ...Object.entries(import.meta.glob<string>('../fonts/intro/*.otf', { query: '?url', import: 'default', eager: true }))
    .map(([path, url]) => ({ name: path.slice(path.lastIndexOf('/') + 1, -'.otf'.length), url })),
  ...INTRO_OWN.flatMap(family => {
    const o = OWN_FAMILIES[family];
    return o ? [{ name: family, url: introFontUrl(fontId({ family, weight: o.weight, italic: o.italic })), own: true as const }] : [];
  })
];
/** what the scramble shows where a letter hasn't settled yet: capitals as the name is set in, a symbol among them by
    SYMBOL's odds; and the share of those that change at each step (the rest stay, so it churns rather than flickers) */
const NOISE = 'ABCDFGHJKMNQRSUVWXZ', SYMBOL = 0.3;
const CHURN = 0.6;
/** the odds a letter not set in a cut's leading font is in one of the own fonts rather than a saved one, where it can
    be either (the own fonts are many more, and fill in where the saved ones are already in its line) */
const OWN_ODDS = 1 / 3;
/** the room between two letters in fonts of their own, ink to ink, in ems */
const LETTER_GAP = 0.07;
/** The whole name's cuts, in order, each led by a saved font, by its file's name, setting one of its letters.
    Neighbours look far apart, heavy after light, and the last is the boldest; Lineup, the logo's, leads none, as the
    drawing after them is its. One that didn't come (or has gone from My designs) is left out, and the other fonts
    take the cuts left. */
const CUTS = ['nodes', 'my-chunky-rounded', 'hand-hex', 'ink-trap-display'], LOGO_FONT = 'lineup';
/** The slot the name's letters roll through, in ems over and under the baseline: what a letter draws outside it is
    cut off, so it is roomy, and .intro-roll's travel in styles.css carries a letter clear of it. */
const SLOT = [1.3, 0.55] as const;
/** how long to wait for the fonts, how much longer for the own fonts once the saved ones and the drawing's letters
    have come (the page fetches those alongside the app's code, vite.config.ts's introPreload, and the own ones only
    after it, so on a slow connection the card plays without them rather than wait), and the fewest fonts to play with
    (a letter's font unlike both its neighbours') */
const WAIT_MS = 900, OWN_GRACE = 250, FEWEST = 3;
/** a frame at 60 Hz, in ms */
const FRAME = 1000 / 60;
/** Each step of the scramble, on one beat from its first letter to the cuts (the cuts on a slower beat of their own,
    450 ms, the card slowed halfway, and the scramble on theirs dragged): five frames at 60 Hz, a little longer than a
    letter's roll and slide (.intro-roll and .intro-at in styles.css), so each lands and stands a frame or two before
    the next comes (three frames, every one showed under its place in two of them and the line bobbed); how many steps
    the scramble grows before it starts settling (grown to its length first and then settled, its thirteen steps
    dragged); and how long the last cut shows, the cuts slowing to it from the scramble's beat, each longer than the
    one before by the same share, so the name comes to rest before the drawing (on the scramble's beat, every letter
    changing at once, they ran by in a third of a second, faster as they went) */
const STEP_MS = 5 * FRAME, AHEAD = 3, LAST_CUT_MS = 280;
/** how much sooner, in ms, a step may end than its `ms`, so it ends on the frame its time falls on (half a frame at
    60 Hz): the steps change on the frames' own clock (requestAnimationFrame), where a timer's fell a frame late now
    and then, one step of the scramble a frame longer than the next */
const SLACK = 8;
/** The drawing: its points come in over POINTS_MS while each letter's outline is drawn on (over .intro-outline's
    .42s in styles.css, a letter LETTER_MS after the one before), the ink fills in from FILL_MS as the points and
    lines go, and the wordmark follows at DRAW_MS. */
const POINTS_MS = 420, LETTER_MS = 30, FILL_MS = 760, DRAW_MS = 1100;
/** how far into the drawing the credit comes in at the card's foot: once the tagline has started and the skip note
    has gone (.intro-skip's .3s fade in styles.css) */
const CREDIT_MS = 500;
/** the smallest size, in px to the em, the drawing's points show their handles at; how sharply the outline turns at a
    point for it to show as a corner (the cosine of 25°), and how far apart, in units, two points it shows are at least */
const HANDLES_FROM = 80, CORNER = Math.cos(25 * Math.PI / 180), CLEAR = 50;
/** how long the wordmark shows, long enough for the credit under it to be read: alone, and after the drawing, where
    the credit came in CREDIT_MS into it; then how long it fades (FADE_MS matches .intro.leave's opacity transition in
    styles.css, its delay counted) */
const HOLD_MS = 1300, DRAWN_HOLD_MS = 1000, FADE_MS = 650;
/** how long the wordmark takes to come in and the drawing under it to go (.intro-mark's and .intro-drawn's animations
    in styles.css), after which it stands still and the editor's letters are let go */
const STILL_MS = 500;
/** the least room between the window's edge and a scramble's letters, and how near, in px, a guide line can come to
    one before it without being left out, the two reading as one */
const EDGE = 24, ONE = 6;

/** One of the card's fonts, loaded: its name, the family it is set in, and whether it is an own font. */
type Face = { name: string; family: string; own?: true };
/** A letter in its face, `id` new each time one changes, so only what changed rolls. */
type Letter = { ch: string; face: Face; id: number };
/** A font's heights in ems: x-height and cap height, and, in the drawing, its ascender and (below zero) descender. */
type Heights = { xh: number; cap: number; asc?: number; desc?: number };
/** The logo's letters as tools/fonts/ui.ts writes them: its heights, and each capital's advance and outline. */
type Logo = Pick<FreeFontData, 'cap' | 'xh' | 'glyphs'>;
/** One step of the card for `ms`: the name in `letters`, each in its font, or `drawn` from its points; neither is the
    wordmark. `lines` are the guide lines' heights, none before the cuts and on the wordmark. The scramble is set from
    where `from`, the settled name, starts. */
interface Step { ms: number; letters?: Letter[]; from?: Letter[]; drawn?: true; lines?: Heights; cut?: true }

const any = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** The inline style that sets text in a face. */
const faceStyle = (f: Face) => ({ fontFamily: `'${f.family}', Manrope, sans-serif` });

/** One of the card's web fonts, loaded, or null when it couldn't be had (text not set in it falls back to Manrope);
    an own font after anything else the page fetches. */
function load({ name, url, own }: (typeof FONTS)[number]): Promise<Face | null> {
  const family = `TypeLab Intro ${name}`;
  return fetch(url, { priority: own ? 'low' : 'high' }).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
    .then(file => new FontFace(family, file).load()).then(f => { document.fonts.add(f); return { name, family, own }; }, () => null);
}

/** The card's fonts and the drawing's letters on their way, and what the app under it holds back meanwhile
    (lib/opening.ts). */
function fetchAhead() {
  holdForOpening();
  const fonts = FONTS.filter(f => !f.own).map(load), own = FONTS.filter(f => f.own).map(load);
  const drawing = fetch(LOGO_LETTERS, { priority: 'high' }).then(r => (r.ok ? r.json() as Promise<Logo> : null)).catch(() => null);
  return { fonts, own, drawing };
}

/** Resolves once `n` more frames have been drawn. */
const frames = (n: number) => new Promise<void>(done => { const next = () => (n-- > 0 ? requestAnimationFrame(next) : done()); next(); });

let ctx: CanvasRenderingContext2D | null | undefined;
/** A letter set in a web font at 100px as the SVG sets it (in the faces it falls back to), or null without a canvas. */
function measure(f: Face, ch: string) {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  ctx.font = `100px ${faceStyle(f).fontFamily}`;
  return ctx.measureText(ch);
}

/** A font's x-height and cap height, from its ink (an x's and an H's), so the lines sit on the letters as drawn. */
function heightsOf(r: Face): Heights | undefined {
  const up = (ch: string) => (measure(r, ch)?.actualBoundingBoxAscent ?? NaN) / 100;
  const h = { xh: up('x'), cap: up('H') };
  return Number.isNaN(h.xh) ? undefined : h;
}

/** Where a letter's ink runs across, in ems from where it is set. */
function inkOf(r: Face, ch: string): [number, number] {
  const m = measure(r, ch);
  return m ? [-m.actualBoundingBoxLeft / 100, m.actualBoundingBoxRight / 100] : [0, 0.6];
}

/** The drawing's heights: the font's own x-height and cap height, and the name's highest and lowest points. */
function drawnHeights(data: Logo): Heights {
  const ys = [...MARK].flatMap(ch => (data.glyphs[ch]?.[1] ?? []).flat().map(n => n[1]));
  return { xh: data.xh / 1000, cap: data.cap / 1000, asc: Math.max(...ys) / 1000, desc: Math.min(...ys) / 1000 };
}

/** The steps, drawn afresh each time from the fonts that came, and the drawing's letters if they did. */
function plan(fonts: Face[], drawing: Logo | null): Step[] {
  const mark: Step = { ms: HOLD_MS };
  if (fonts.length < FEWEST) return [mark];
  const faces = (ls: Letter[]) => new Set(ls.map(l => l.face));
  // whether a line can set its next letter in a font, `taken` the fonts it sets already (and its cut's leading one):
  // one not among them, so no font shows twice in a line, or, where every font is among them (too few came), one
  // unlike `left`'s, the letter's before it
  const fits = (f: Face, taken: Set<Face>, left?: Face) => (taken.size < fonts.length ? !taken.has(f) : f !== left);
  // a font for a letter, one that fits, and, where one is left, one the line before (`before`) didn't set, so each
  // step brings in fonts not just seen: an own font by OWN_ODDS, else a saved one
  const other = (taken: Set<Face>, left: Face | undefined, before: Set<Face>) => {
    const own = Math.random() < OWN_ODDS, ok = fonts.filter(f => fits(f, taken, left)), fresh = ok.filter(f => !before.has(f));
    return any([fresh.filter(f => !!f.own === own), fresh, ok.filter(f => !!f.own === own), ok].find(p => p.length) ?? fonts);
  };
  let made = 0;
  const letter = (ch: string, face: Face): Letter => ({ ch, face, id: made++ });
  // the scramble's next `n` letters after `head`, the letters before them in its line, each in a font that fits and
  // changed by CHURN's odds from `was`'s, those in its places the step before (a new one always)
  const stir = (head: Letter[], was: Letter[], n: number, before: Set<Face>) => {
    const ls = [...head];
    for (let i = 0; i < n; i++) {
      const taken = faces(ls), left = ls.at(-1)?.face, w = was[i];
      ls.push(w && Math.random() > CHURN && fits(w.face, taken, left) ? w : letter(any([...(Math.random() < SYMBOL ? INTRO_SYMBOLS : NOISE)]), other(taken, left, before)));
    }
    return ls.slice(head.length);
  };
  // the scramble grows a character a step to the right of the name's first letter, which comes first, turning from
  // font to font, and from AHEAD steps in it settles from the left a letter a step, each keeping the face it settled
  // in, the rest growing on ahead of it
  const scramble: Letter[][] = [], settled: Letter[] = [];
  let noise: Letter[] = [], first: Letter | undefined;
  for (let s = 0; settled.length < MARK.length; s++) {
    const n = Math.min(s + 1, MARK.length), before = faces(scramble.at(-1) ?? []);
    if (s < AHEAD) {
      first = letter(MARK[0], other(new Set(first ? [first.face] : []), undefined, before));
      scramble.push([first, ...(noise = stir([first], noise, n - 1, before))]);
      continue;
    }
    const rest = settled.length ? noise.slice(1) : noise;
    settled.push(letter(MARK[settled.length], other(faces(settled), settled.at(-1)?.face, before)));
    noise = stir(settled, rest, n - settled.length, before);
    scramble.push([...settled, ...noise]);
  }
  // all of it set from where the settled name starts, so it grows from there and a settled letter stays put
  const steps: Step[] = scramble.map(letters => ({ ms: STEP_MS, letters, from: settled }));
  // the cuts, each mixing into the one before: its leading font sets one of the letters, wherever it falls, and every
  // other letter is in a font that fits, keeping the one it had the cut before by CHURN's odds; the lines at the
  // leading font's heights (the saved fonts lead, an own font only where too few came)
  const named = new Map(fonts.map(f => [f.name, f]));
  const spare = (f: Face) => !CUTS.includes(f.name) && f.name !== LOGO_FONT;
  const cuts = [...CUTS.flatMap(c => named.get(c) ?? []), ...fonts.filter(f => !f.own && spare(f)), ...fonts.filter(f => f.own)].slice(0, CUTS.length);
  // (`carried`, the letters the cut before kept from the one before it, which change now)
  let lines = heightsOf(cuts[0] ?? fonts[0]), was = settled, carried = new Set<Letter>();
  cuts.forEach((lead, k) => {
    const at = Math.floor(Math.random() * MARK.length), before = faces(was);
    const letters = [...MARK].reduce<Letter[]>((ls, ch, i) => {
      if (i === at) return [...ls, letter(ch, lead)];
      const taken = faces(ls).add(lead), left = ls.at(-1)?.face, had = was[i];
      const kept = Math.random() > CHURN && !carried.has(had) && fits(had.face, taken, left);
      return [...ls, kept ? had : letter(ch, other(taken, left, before))];
    }, []);
    lines = heightsOf(lead) ?? lines;
    steps.push({ ms: STEP_MS * (LAST_CUT_MS / STEP_MS) ** ((k + 1) / cuts.length), letters, lines, cut: true });
    carried = new Set(letters.filter((l, i) => l === was[i]));
    was = letters;
  });
  if (!drawing) return [...steps, mark];
  return [...steps, { ms: DRAW_MS, drawn: true, lines: drawnHeights(drawing) }, { ms: DRAWN_HOLD_MS }];
}

/** An anchor point of the drawing, in px: corner or smooth (a square or a round, as the pen draws them), and the
    ends of its handles. */
interface Point { x: number; y: number; smooth: boolean; handles: [number, number][] }

/** The name as the logo sets it, in the drawing's letters at `k` px a unit, centred on `cx` with its baseline at
    `base`: each letter's outline as a path, and the points a type designer would put it on: its corners, and a
    curve's only where it runs level or plumb (a font's rounds can carry many more, which crowd into a string of
    beads), each clear of those before it by CLEAR units; and where it stands across (`box`, as the font spaces it). */
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
    const box = [n1(left), n1(left + adv * k)] as const;
    left += adv * k;
    return { d, points, box };
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

/** The guide lines across the window `width` by `height`, unnamed: level ones at a font's heights, and upright ones,
    fainter, at `columns`, parting its letters, which slide with them. `end` fades them out with the drawing's points. */
function Guides({ lines, columns = [], width, height, end }: { lines: Guide[]; columns?: number[]; width: number; height: number; end: boolean }) {
  return (
    <g className={end ? 'intro-guides end' : 'intro-guides'} style={end ? { animationDelay: `${FILL_MS}ms` } : undefined}>
      {lines.map(l => <g key={l.id} className="intro-guide" style={{ transform: `translateY(${l.at}px)` }}><line x2={width} /></g>)}
      {columns.map((x, i) => <g key={`c${i}`} className="intro-guide" style={{ transform: `translateX(${x}px)` }}><line className="up" y2={height} pathLength={1} /></g>)}
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
    never run into each other; and their `edges`, where the ink starts and ends and the middle of each gap. */
function inked(letters: Letter[]) {
  let w = 0;
  const edges = [0];
  const xs = letters.map(({ ch, face }, i) => {
    const [l, r] = inkOf(face, ch), x = w - l;
    w += r - l;
    if (i < letters.length - 1) { edges.push(w + LETTER_GAP / 2); w += LETTER_GAP; }
    return x;
  });
  edges.push(w);
  return { xs, w, edges };
}

/** Where each of `letters` is set, and its `edges`, in px from the window's left, at `size` px to the em: centred on
    `cx`, or from where `from` would start, unless that runs it off the window's right (a scramble of wide letters on
    a phone). */
function placed(letters: Letter[], size: number, cx: number, from?: Letter[]) {
  const { xs, w, edges } = inked(letters);
  const left = from ? Math.min(cx - inked(from).w * size / 2, Math.max(EDGE, 2 * cx - EDGE - w * size)) : cx - w * size / 2;
  return { xs: xs.map(x => n1(left + x * size)), edges: edges.map(e => n1(left + e * size)) };
}

/** A letter gone from the line: where it stood, in px from the window's left. */
interface Gone { letter: Letter; x: number }

/** The name's line at `size` px to the em on the baseline `base`, cut off at its slot (#intro-slot): `letters` where
    `xs` sets them, and `gone`, the letters of the step before that changed. A letter that stays slides to its new
    place; a new one rolls up into the line from under it, and one gone rolls up out of it, all at once. Each letter
    is two groups, the outer setting it along the line and the inner rolling, so the two moves never undo each other. */
function Line({ letters, xs, gone, size, base }: { letters: Letter[]; xs: number[]; gone: Gone[]; size: number; base: number }) {
  const glyph = ({ ch, face }: Letter) => <text y={base} fontSize={size} style={faceStyle(face)}>{ch}</text>;
  // the letters that stay first, so they keep their places among the elements and slide rather than start again
  return (
    <g className="intro-word" clipPath="url(#intro-slot)">
      {letters.map((l, i) => <g key={l.id} className="intro-at" style={{ transform: `translateX(${xs[i]}px)` }}><g className="intro-roll">{glyph(l)}</g></g>)}
      {gone.map(({ letter, x }) => <g key={`-${letter.id}`} style={{ transform: `translateX(${x}px)` }}><g className="intro-roll out">{glyph(letter)}</g></g>)}
    </g>
  );
}

function shouldPlay() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return !prefFlag(PREFS.introSeen);
}

/** fetched as the app's code runs, before it first renders, when the card is to play */
let ahead = shouldPlay() ? fetchAhead() : null;

export function Intro() {
  const [phase, setPhase] = useState<'wait' | 'play' | 'leave' | 'done'>(() => (shouldPlay() ? 'wait' : 'done'));
  const [steps, setSteps] = useState<Step[]>([]);
  const [drawing, setDrawing] = useState<Logo | null>(null);
  const [at, setAt] = useState(0);
  // when the step showing was first shown: the frame's time it was made in (requestAnimationFrame's), and, once that
  // frame is drawn (the task after it), as much later as drawing it ran on past SLACK, up to a frame (a slower
  // computer, drawing the line afresh); the card's first a frame later again (the page had drawn nothing for some
  // frames, and the display drew the one it was made in without it): shown late, the first was a flash, two frames
  const shownAt = useRef(0);
  const stepShown = (now: number, first = false) => {
    const late = first ? FRAME : 0;
    shownAt.current = now + late;
    setTimeout(() => { shownAt.current = Math.max(now, Math.min(performance.now() - SLACK, now + FRAME)) + late; });
  };
  const [ref, box] = useSize<HTMLDivElement>();
  const shown = phase !== 'done';

  // the page's paper until the app came was the card's (vite.config.ts's introPreload): the card's own covers it now
  useEffect(() => { document.documentElement.classList.remove('intro-ahead'); }, []);

  // the fonts and the drawing's letters, as many as come within WAIT_MS (the own fonts within OWN_GRACE of the rest),
  // then, once the page under the card has drawn its first frames, the card starts at once (as each step is, below):
  // the app renders and lays itself out as it opens, and the page is first drawn (the paper's grain across the
  // window) a frame or two on, and the card's first steps, started under either, came late, the first letter standing
  // alone and then jumping on, or the first two shown a frame short
  useEffect(() => {
    if (phase !== 'wait') return;
    setPrefFlag(PREFS.introSeen, true);
    const got: Face[] = [];
    let data: Logo | null = null, live = true, planned = false, grace: ReturnType<typeof setTimeout> | undefined;
    const start = (now: number, made: Step[], letters: Logo | null) => {
      if (!live) return;
      live = false;
      flushSync(() => { setDrawing(letters); setSteps(made); setPhase('play'); });
      stepShown(now, true);
    };
    // (the frames counted from now, as the fonts come; the steps planned, their fonts measured, the frame before the
    // card starts, so its first frame, as a step's, is drawn in time)
    const drawn = frames(4), ready = () => void drawn.then(() => {
      if (planned || !live) return;
      planned = true;
      const made = plan([...got], data), letters = data;
      requestAnimationFrame(now => start(now, made, letters));
    });
    const t = setTimeout(ready, WAIT_MS);
    const { fonts, own, drawing } = ahead ??= fetchAhead();
    const came = (ps: Promise<Face | null>[]) => Promise.all(ps.map(p => p.then(r => { if (r && live) got.push(r); })));
    const owns = came(own);
    void Promise.all([came(fonts), drawing.then(d => { data = d; })]).then(() => {
      grace = setTimeout(ready, OWN_GRACE);
      return owns.then(ready);
    });
    return () => { live = false; clearTimeout(t); clearTimeout(grace); };
  }, [phase]);

  // the Style page's fonts come once the scramble has settled, at the first cut: landing as it spun, each had the page
  // under the card laid out again and the card's frames came late
  useEffect(() => { if (phase === 'play' && steps[at]?.cut) openingFontsIn(); }, [phase, at, steps]);

  // the editor's letters let go of once the wordmark stands still, where building them shows nothing, and at once when
  // the card is skipped (lib/opening.ts lets go of them itself should the card stop short)
  useEffect(() => {
    if (phase === 'leave' || phase === 'done') return letGo();
    if (phase !== 'play' || at < steps.length - 1) return;
    const t = setTimeout(letGo, STILL_MS);
    return () => clearTimeout(t);
  }, [phase, at, steps.length]);

  // each step made in the frame its time falls on, counted from the frame the one before was first drawn in (SLACK),
  // and drawn at once (flushSync): as the app opens, the editor under the card builds its letters in a deferred render
  // (GlyphDefs), which React lets no ordinary update cut into, so a step made from a timer waited it out (the name's
  // first letter stood alone for most of a second, then the rest ran on its own beat)
  useEffect(() => {
    if (phase === 'leave') {
      const t = setTimeout(() => flushSync(() => setPhase('done')), FADE_MS);
      return () => clearTimeout(t);
    }
    if (phase !== 'play') return;
    const tick = (now: number) => {
      if (now - shownAt.current < steps[at].ms - SLACK) { id = requestAnimationFrame(tick); return; }
      flushSync(() => (at < steps.length - 1 ? setAt(at + 1) : setPhase('leave')));
      stepShown(now);
    };
    let id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
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
  // the last cut)
  const prev = steps[at - 1];
  const set = step?.letters ? placed(step.letters, size, W / 2, step.from) : undefined;
  const gone: Gone[] = [];
  if ((step?.letters || step?.drawn) && prev?.letters) {
    const was = placed(prev.letters, size, W / 2, prev.from).xs, stays = new Set(step?.letters?.map(l => l.id));
    prev.letters.forEach((letter, i) => { if (!stays.has(letter.id)) gone.push({ letter, x: was[i] }); });
  }
  // the upright guide lines: parting a cut's letters, and the drawing's as its font spaces them
  const columns = step?.cut ? set?.edges : step?.drawn && drawn?.length ? [...drawn.map(l => l.box[0]), drawn.at(-1)!.box[1]] : undefined;
  return (
    <div ref={ref} className={phase === 'leave' ? 'intro leave' : 'intro'} onClick={() => setPhase('leave')} aria-hidden="true">
      {step && W > 0 && (
        <svg className="intro-art" width={W} height={H} style={{ '--em': `${size}px` } as CSSProperties}>
          <defs><clipPath id="intro-slot"><rect y={n1(base - SLOT[0] * size)} width={W} height={n1((SLOT[0] + SLOT[1]) * size)} /></clipPath></defs>
          {lines && <Guides lines={lines} columns={columns} width={W} height={H} end={!!step.drawn} />}
          {(step.letters || gone.length > 0) && <Line letters={step.letters ?? []} xs={set?.xs ?? []} gone={gone} size={size} base={base} />}
          {step.drawn && drawn && <Drawing letters={drawn} size={size} />}
          {!step.letters && !step.drawn && <>
            {/* the drawing, filled, stays under the wordmark as it comes in over it, so one reads as the other */}
            {drawn && prev?.drawn && <g className="intro-drawn">{drawn.map((l, i) => <path key={i} d={l.d} />)}</g>}
            <text className="intro-mark" x={W / 2} y={base} textAnchor="middle" fontSize={size}>{MARK}</text>
          </>}
        </svg>
      )}
      {/* the tagline, from the drawing on, so it is read before the card goes */}
      {step && !step.letters && (
        <div className="intro-tag" style={{ top: n1(base + 0.36 * size) }}>
          {'Experiment with type.'.split(' ').map((w, i) => <span key={i} style={{ animationDelay: `${200 + i * 120}ms` }}>{w}</span>)}
        </div>
      )}
      {/* how to skip it, while the name's letters are being set */}
      {step && <div className={step.letters ? 'intro-skip' : 'intro-skip gone'}>{window.matchMedia('(hover: none)').matches ? 'Tap' : 'Click'} to skip</div>}
      {/* the credit, in that note's place from the drawing on (with the wordmark, a card without its drawing) */}
      {step && !step.letters && <div className="intro-credit" style={step.drawn ? { animationDelay: `${CREDIT_MS}ms` } : undefined}>Designed by <b>Kyuri Park</b></div>}
    </div>
  );
}
