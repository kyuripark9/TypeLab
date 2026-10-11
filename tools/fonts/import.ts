/* Import TypeLab's own fonts from their specimen sheets: `node --import tsx tools/fonts/import.ts [names...]`
   (`npm run fonts:import`) reads each font's sheet (Asset/After/<sheet>.ai, SHEETS moves it; OWN_FAMILIES in
   shared/free-fonts.ts names the sheet) and writes the font the engine draws (FreeFontData, shared/engine/free.ts) to
   fonts/<Family>-<weight>.json. The sheet is set at 52 pt to the em, the size the sheets were made at.

   A sheet has each letter's outline but not its spacing, so the spacing comes from the font as it was last imported
   (or, with `--from <dir>`, from <dir>/<sheet>.json, which is how they were first made, from the fonts the sheets
   began as). Each letter keeps its side bearings, so a letter drawn wider gets a wider advance, and one drawn
   narrower keeps its advance; a monospaced font keeps its one advance. Edits drawn over a whole sheet are read off it
   first, against that font: a slant added to every letter (side bearings are then measured with it taken off), and a
   widening or narrowing (which the side bearings follow). The cap height and x-height follow the sheet's H and x the
   same way. A letter that comes through unchanged stays exactly as it was, so an import changes only the letters
   drawn anew.

   Without names, every font is imported. `--check` writes nothing and reports what would change. */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_CHARS, CHARSET, packNode, type FreeFontData, type Node } from '../../shared/engine';
import { OWN_FAMILIES, fontId } from '../../shared/free-fonts';
import { ownFontFile } from '../../server/free-fonts';
import { inkBox, readLabels, sheetCells, sheetParts, union, type Cell, type P, type Sub } from './sheet';
import { ROOT } from '../lib';

/** Points to the em: the sheets set each letter at 52 pt. */
const EM_PT = 52;
const S = EM_PT / 1000;
/** A sheet with every character, its labels in ALL_CHARS order: every other sheet's labels are read by its. */
const KNOWN_SHEET = 1;
/** Where the sheets centre each letter's advance: this far right of its label's left edge, in points. */
const CELL_CENTRE = 33.5;

const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const from = opt('--from'), check = args.includes('--check');
const names = args.filter(a => !a.startsWith('--'));
const SHEETS = resolve(ROOT, process.env.SHEETS ?? 'Asset/After');

const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };

/** A subpath with each curve cut in two, for a dot drawn as two curves (or one): the engine wants three points. */
function halved(s: Sub): Sub {
  const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const segs: Sub['segs'] = [];
  let p0 = s.start;
  for (const g of s.segs) {
    if (g.k === 'C') {
      const ab = mid(p0, g.a), bc = mid(g.a, g.b), cd = mid(g.b, g.p), abc = mid(ab, bc), bcd = mid(bc, cd), m = mid(abc, bcd);
      segs.push({ k: 'C', a: ab, b: abc, p: m }, { k: 'C', a: bcd, b: cd, p: g.p });
    } else segs.push(g);
    p0 = g.p;
  }
  return { start: s.start, segs };
}

/** A contour's anchors and handles from a sheet's subpath, in font units (`f` maps a point), closed back to its start. */
function contourOf(s: Sub, f: (p: P) => [number, number]): Node[] {
  // (a round dot drawn with fewer than three points is cut into more)
  if (s.segs.length < 4 && s.segs.some(g => g.k === 'C')) s = halved(s);
  const out: Node[] = [];
  const at = (p: P): Node => { const [x, y] = f(p); return { x, y }; };
  const first = at(s.start);
  out.push(first);
  for (const g of s.segs) {
    const prev = out[out.length - 1], n = at(g.p);
    if (g.k === 'C') {
      const [ax, ay] = f(g.a), [bx, by] = f(g.b);
      // a handle on its own anchor is none
      if (ax !== prev.x || ay !== prev.y) { prev.ox = ax; prev.oy = ay; }
      if (bx !== n.x || by !== n.y) { n.ix = bx; n.iy = by; }
    }
    // a line of no length adds nothing
    if (g.k === 'L' && n.x === prev.x && n.y === prev.y) continue;
    out.push(n);
  }
  // the last piece back onto the start closes the contour: its end is the start
  const last = out[out.length - 1];
  if (out.length > 1 && last.x === first.x && last.y === first.y) {
    if (last.ix !== undefined) { first.ix = last.ix; first.iy = last.iy; }
    out.pop();
  }
  return out;
}

/** Twice a contour's area by its anchors, positive anticlockwise (y up). */
const area2 = (c: Node[]) => c.reduce((a, p, i) => { const q = c[(i + 1) % c.length]; return a + p.x * q.y - q.x * p.y; }, 0);
/** A contour run the other way round, each anchor's handles swapped. */
const reversed = (c: Node[]): Node[] => [...c].reverse().map(n => {
  const out: Node = { x: n.x, y: n.y };
  if (n.ox !== undefined) { out.ix = n.ox; out.iy = n.oy; }
  if (n.ix !== undefined) { out.ox = n.ix; out.oy = n.iy; }
  return out;
});

/** The ink's left and right edges, measured `t` slanted back (x less t·y about `base`), curves flattened. */
function slantedEdges(subs: Sub[], base: number, t: number): [number, number] {
  let x0 = Infinity, x1 = -Infinity;
  for (const p of subPolys(subs)) for (const q of p) { const x = q.x - t * (q.y - base); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  return [x0, x1];
}

/** The ink's right edge in the upper part of the x-height (`xh` points above `base`), where a script's strokes run on to
    the next letter, measured `t` slanted back. */
function bodyRight(subs: Sub[], base: number, t: number, xh: number): number {
  let x1 = -Infinity;
  for (const p of subPolys(subs)) for (const q of p) {
    const h = q.y - base;
    if (h > 0.35 * xh && h < 1.1 * xh) x1 = Math.max(x1, q.x - t * h);
  }
  return x1;
}

/** A sheet's subpaths as polygons (curves flattened). */
const subPolys = (subs: Sub[]): P[][] => subs.map(s => {
  const pts: P[] = [s.start];
  let p0 = s.start;
  for (const g of s.segs) {
    if (g.k === 'C') for (let k = 1; k < 12; k++) {
      const u = k / 12, v = 1 - u;
      pts.push({ x: v * v * v * p0.x + 3 * v * v * u * g.a.x + 3 * v * u * u * g.b.x + u * u * u * g.p.x,
        y: v * v * v * p0.y + 3 * v * v * u * g.a.y + 3 * v * u * u * g.b.y + u * u * u * g.p.y });
    }
    pts.push(g.p); p0 = g.p;
  }
  return pts;
});
/** A font's contours as polygons, at the sheet's size (`k` points to the unit). */
const packedPolys = (contours: FreeFontData['glyphs'][string][1], k: number): P[][] => contours.map(c => {
  const pts: P[] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    const ox = a.length > 4 ? a[4] as number : null, ix = b.length > 2 ? b[2] : null;
    pts.push({ x: a[0] * k, y: a[1] * k });
    if (ox === null && ix === null) continue;
    const ax = ox ?? a[0], ay = ox === null ? a[1] : a[5] as number, bx = ix ?? b[0], by = ix === null ? b[1] : b[3]!;
    for (let j = 1; j < 12; j++) {
      const u = j / 12, v = 1 - u;
      pts.push({ x: k * (v * v * v * a[0] + 3 * v * v * u * ax + 3 * v * u * u * bx + u * u * u * b[0]),
        y: k * (v * v * v * a[1] + 3 * v * v * u * ay + 3 * v * u * u * by + u * u * u * b[1]) });
    }
  }
  return pts;
});

/** How far the ink of the letter's upper half sits right of its lower half's, per point of height between them: a
    slant added to a letter adds to it, whatever the letter's shape. The ink is read by the nonzero rule. */
function lean(polys: P[][]): number {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of polys) for (const q of p) { y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const mid = (y0 + y1) / 2, h = (y1 - y0) / 120, half = [{ a: 0, x: 0, y: 0 }, { a: 0, x: 0, y: 0 }];
  for (let y = y0 + h / 2; y < y1; y += h) {
    const xs: { x: number; d: number }[] = [];
    for (const p of polys) for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      if ((a.y <= y) !== (b.y <= y)) xs.push({ x: a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x), d: b.y > a.y ? 1 : -1 });
    }
    xs.sort((u, v) => u.x - v.x);
    let w = 0;
    const m = half[y < mid ? 0 : 1];
    for (let i = 0; i < xs.length - 1; i++) {
      w += xs[i].d;
      if (!w) continue;
      const len = xs[i + 1].x - xs[i].x;
      m.a += len; m.x += len * (xs[i].x + xs[i + 1].x) / 2; m.y += len * y;
    }
  }
  const [lo, hi] = half;
  if (!lo.a || !hi.a) return NaN;
  return (hi.x / hi.a - lo.x / lo.a) / (hi.y / hi.a - lo.y / lo.a);
}

/** A font's own ink box, in its units, curves flattened as the sheet's are (slantedEdges). */
function srcBox(contours: FreeFontData['glyphs'][string][1]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of packedPolys(contours, 1)) for (const q of c) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return { x0, y0, x1, y1 };
}

/** Whether two letters are the same but for where they stand, by a unit or two either way (rounding, when a letter
    comes through an import again unchanged): kept as they were, an import changes only the letters drawn anew. */
function sameLetter(a: FreeFontData['glyphs'][string], b: FreeFontData['glyphs'][string]) {
  if (Math.abs(a[0] - b[0]) > 2 || a[1].length !== b[1].length || !a[1].length) return false;
  const dx = b[1][0][0][0] - a[1][0][0][0], dy = b[1][0][0][1] - a[1][0][0][1];
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) return false;
  return a[1].every((c, i) => c.length === b[1][i].length && c.every((n, j) => {
    const m = b[1][i][j];
    return n.length === m.length && n.every((v, k) => v === null ? m[k] === null : m[k] === (v as number) + (k % 2 ? dy : dx));
  }));
}

let known: ReturnType<typeof sheetParts>['labels'] | null = null;
const knownLabels = () => known ??= sheetParts(resolve(SHEETS, `${KNOWN_SHEET}.ai`)).labels;

/** One font, from its sheet and its spacing source. */
function importFont(family: string): { data: FreeFontData; notes: string[] } {
  const own = OWN_FAMILIES[family], id = fontId({ family, weight: own.weight, italic: own.italic });
  const notes: string[] = [];
  const prev = existsSync(ownFontFile(id)) ? JSON.parse(readFileSync(ownFontFile(id), 'utf8')) as FreeFontData : null;
  const srcFile = from ? resolve(from, `${own.sheet}.json`) : ownFontFile(id);
  if (!existsSync(srcFile)) throw new Error(`${family}: no spacing source (${srcFile}); import it first with --from`);
  const src = JSON.parse(readFileSync(srcFile, 'utf8')) as FreeFontData;
  const { labels, black } = sheetParts(resolve(SHEETS, `${own.sheet}.ai`));
  readLabels(labels, knownLabels(), ALL_CHARS);
  const sheet = sheetCells(labels, black);
  const cells = new Map<string, Cell>(sheet.cells.map(c => [c.ch, c]));
  const pairs = [...cells.values()].filter(c => src.glyphs[c.ch]?.[1].length);
  // the baseline: where the source's letters stand on the sheet, as far below each row's labels on every row
  const off = med(pairs.map(c => union(c.subs.map(inkBox)).y0 - S * srcBox(src.glyphs[c.ch][1]).y0 - c.label.box.y1));
  for (const c of cells.values()) c.baseline = c.label.box.y1 + off;
  // a slant added over the whole sheet: how much more each letter leans than the source's, typically (letters
  // narrowed on a sheet are narrowed along their own slant, which keeps their lean); then how much wider the letters
  // are drawn, measured with that slant taken off. A slant under a degree and a half is taken for none (edits to
  // single letters lean them a little)
  const upright = pairs.filter(c => { const b = srcBox(src.glyphs[c.ch][1]); return b.y1 - b.y0 > 300 && b.x1 - b.x0 > 60; });
  const leans = upright.map(c => [lean(subPolys(c.subs)), lean(packedPolys(src.glyphs[c.ch][1], S))]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const ratios = (t: number) => pairs.flatMap(c => {
    const b = srcBox(src.glyphs[c.ch][1]), [x0, x1] = slantedEdges(c.subs, c.baseline, t);
    return b.x1 - b.x0 > 80 ? [Math.log((x1 - x0) / S / (b.x1 - b.x0))] : [];
  });
  const t = med(leans.map(([a, b]) => a - b));
  const slant = Math.abs(t) < Math.tan(1.5 * Math.PI / 180) ? 0 : t, widen = Math.exp(med(ratios(slant)));
  if (Math.abs(slant) > 0.004) notes.push(`slant added ${(Math.atan(slant) * 180 / Math.PI).toFixed(1)}°`);
  if (Math.abs(widen - 1) > 0.01) notes.push(`drawn ${widen > 1 ? 'wider' : 'narrower'} ×${widen.toFixed(3)}`);
  // side bearings for a letter the source hasn't got: its asterisk's, else a twentieth of the em
  const star = src.glyphs['*'], starBox = star && srcBox(star[1]);
  const fallback = starBox ? [starBox.x0, star[0] - starBox.x1] : [50, 50];
  // a monospaced source (nine in ten of its letters as wide) keeps every letter that wide, each placed in its advance
  // as the sheet centres it
  const advs = new Map<number, number>();
  for (const [, [a]] of Object.entries(src.glyphs)) advs.set(a, (advs.get(a) ?? 0) + 1);
  const [monoAdv, monoCount] = [...advs.entries()].sort((a, b) => b[1] - a[1])[0];
  const mono = monoCount >= Object.keys(src.glyphs).length * 0.9 ? monoAdv : 0;
  if (mono) notes.push(`monospaced, ${mono} units`);
  // a script drawn in the forms that end a word: most of its small letters reach further right than the source's,
  // their left where the sheet set the source's, their last stroke swept up and out where the source's joined the
  // next letter. The next letter then starts no sooner than such a letter's body ends, in the upper part of the
  // x-height where that stroke now runs (its loops below may still reach under it): the source's join is gone with
  // its stroke
  const ending = (ch: string) => {
    const c = cells.get(ch), s0 = src.glyphs[ch], b = s0?.[1].length ? srcBox(s0[1]) : null;
    if (!c || !b) return false;
    const [x0, x1] = slantedEdges(c.subs, c.baseline, slant), origin = c.label.box.x0 + CELL_CENTRE - s0[0] * S / 2;
    return Math.abs((x0 - origin) / S - b.x0) < 15 && (x1 - origin) / S - b.x1 > 25;
  };
  const endings = [...CHARSET.lower].filter(ending).length >= CHARSET.lower.length / 3;
  if (endings) notes.push('small letters in their word-ending forms, kept apart');
  const glyphs: FreeFontData['glyphs'] = {};
  for (const ch of ALL_CHARS) {
    const c = cells.get(ch);
    if (!c) continue;
    const s0 = src.glyphs[ch], b = s0?.[1].length ? srcBox(s0[1]) : null;
    const [lsb, rsb] = b ? [b.x0, s0[0] - b.x1] : fallback;
    const [x0, x1] = slantedEdges(c.subs, c.baseline, slant), ink = (x1 - x0) / S;
    // the letter keeps the source's room on its left, and its room on both sides together, or, where that would bring
    // it closer to its neighbours than its source's advance did, its source's advance: a script's letter drawn on its
    // own, without the strokes that reach into the next letter, isn't spaced as if it had them
    let room = Math.max((lsb + rsb) * widen, b ? s0[0] * widen - ink : -Infinity);
    if (endings && CHARSET.lower.includes(ch)) room = Math.max(room, lsb * widen + (bodyRight(c.subs, c.baseline, slant, src.xh * S) - x1) / S);
    // every point rounded to a unit from the sheet, then moved by whole units onto the letter's origin and baseline
    const sx = mono ? Math.round(mono / 2 - (c.label.box.x0 + CELL_CENTRE) / S) : Math.round(lsb * widen - x0 / S);
    const sy = -Math.round(c.baseline / S), adv = mono || Math.round(ink + room);
    const f = (p: P): [number, number] => [Math.round(p.x / S) + sx, Math.round(p.y / S) + sy];
    let contours = c.subs.map(s => contourOf(s, f)).filter(cn => cn.length > 2);
    if (contours.length < c.subs.length) notes.push(`${c.subs.length - contours.length} speck${c.subs.length - contours.length > 1 ? 's' : ''} left out of ${ch}`);
    // outer contours clockwise and holes anticlockwise, as the fonts the engine reads come (TrueType's way)
    const biggest = contours.reduce((a, cn) => Math.abs(area2(cn)) > Math.abs(area2(a)) ? cn : a, contours[0]);
    if (biggest && area2(biggest) > 0) contours = contours.map(reversed);
    const letter: FreeFontData['glyphs'][string] = [adv, contours.map(cn => cn.map(packNode))], was = prev?.glyphs[ch];
    glyphs[ch] = was && sameLetter(letter, was) ? was : letter;
  }
  const missing = [...ALL_CHARS].filter(ch => !glyphs[ch]);
  if (missing.length) notes.push(`no ${missing.join(' ')} on the sheet`);
  // the cap height and x-height: the source's, as much taller as the sheet's H and x are drawn
  const tall = (ch: string, said: number) => {
    const c = cells.get(ch), g = src.glyphs[ch];
    if (!c || !g) return said;
    const b = srcBox(g[1]), ink = union(c.subs.map(inkBox));
    // (a letter drawn as tall as it was keeps the height said, not one rounded again)
    const k = ((ink.y1 - c.baseline) / S) / b.y1;
    return Math.abs(k - 1) < 0.003 ? said : Math.round(said * k);
  };
  const data: FreeFontData = {
    id, family, designers: ['TypeLab'], copyright: '', license: '', licenseUrl: '',
    cap: tall('H', src.cap), xh: tall('x', src.xh), space: mono || Math.round(src.space * widen), glyphs
  };
  return { data, notes };
}

const families = names.length ? names : Object.keys(OWN_FAMILIES);
for (const family of families) {
  if (!OWN_FAMILIES[family]) throw new Error(`${family} isn't one of TypeLab's own fonts (OWN_FAMILIES in shared/free-fonts.ts)`);
  const { data, notes } = importFont(family);
  const file = ownFontFile(data.id);
  const old = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as FreeFontData) : null;
  const changed = old ? Object.keys(data.glyphs).filter(ch => JSON.stringify(old.glyphs[ch]) !== JSON.stringify(data.glyphs[ch])).length : Object.keys(data.glyphs).length;
  console.log(`${data.id.padEnd(18)} sheet ${String(OWN_FAMILIES[family].sheet).padStart(2)}: ${Object.keys(data.glyphs).length} letters, cap ${data.cap}, x-height ${data.xh}` +
    `${old ? `, ${changed} changed` : ', new'}${notes.length ? ` (${notes.join('; ')})` : ''}`);
  if (!check) { mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, JSON.stringify(data) + '\n'); }
}
