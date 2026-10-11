/* Reading a specimen sheet: an Illustrator file saved PDF-compatible (Asset/After/<n>.ai), one page with a line
   of sample text at the top and then every character of the font in a grid, each above a small grey label naming
   its code point ("U+0041"), all outlined (no live type). This reads the page's drawing commands (a PDF content
   stream), keeps the black fills (the letters) and the grey ones (the labels), reads each label by comparing its
   outline with the labels of a sheet whose order is known, and hands back each character's outline in points, y up,
   with the baseline of its row. Only what such a sheet uses is understood: one page, Flate-compressed streams,
   paths filled or stroked, no images, forms or live text (any of those throws). */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** A point on a path, in points, y up (the page's own coordinates). */
export interface P { x: number; y: number }
/** One piece of a path: a line to `p`, or a cubic curve through two handles to `p`. */
export type Seg = { k: 'L'; p: P } | { k: 'C'; a: P; b: P; p: P };
/** A closed run of a path: where it starts, and its pieces back round to the start. */
export interface Sub { start: P; segs: Seg[] }
/** One painted path: its subpaths, its colour (as given: 1 grey, 3 RGB or 4 CMYK numbers), filled or stroked. */
export interface Item { subs: Sub[]; color: number[]; paint: 'fill' | 'stroke'; evenOdd: boolean }

/* ---- the file: objects, streams, the page */

function objects(buf: Buffer) {
  const s = buf.toString('latin1'), at = new Map<number, number>();
  for (const m of s.matchAll(/(?:^|[\s>])(\d+) 0 obj\b/g)) at.set(Number(m[1]), m.index! + m[0].indexOf(m[1]));
  const body = (n: number) => {
    const i = at.get(n);
    if (i === undefined) throw new Error(`object ${n} missing`);
    return s.slice(i, s.indexOf('endobj', i));
  };
  const stream = (n: number): Buffer => {
    const b = body(n), d = b.indexOf('stream'), dict = b.slice(0, d);
    let len: number;
    const lm = /\/Length\s+(\d+)(\s+0\s+R)?/.exec(dict);
    if (!lm) throw new Error(`stream ${n} has no length`);
    len = lm[2] ? Number(/(\d+)\s*$/.exec(body(Number(lm[1])).replace(/^\d+ 0 obj/, '').trim())![1]) : Number(lm[1]);
    let st = at.get(n)! + d + 6;
    if (s[st] === '\r') st++;
    if (s[st] === '\n') st++;
    const raw = buf.subarray(st, st + len), filter = /\/Filter\s*\/?(\w+)|\/Filter\s*\[\s*\/(\w+)\s*\]/.exec(dict);
    if (!filter) return raw;
    if ((filter[1] ?? filter[2]) !== 'FlateDecode') throw new Error(`stream ${n}: ${filter[1] ?? filter[2]} isn't read`);
    return inflateSync(raw);
  };
  return { at, body, stream };
}

/** The page's drawing commands. */
export function pageContent(file: string): string {
  const o = objects(readFileSync(file));
  const pages = [...o.at.keys()].filter(n => /\/Type\s*\/Page(?![s\w])/.test(o.body(n)));
  if (pages.length !== 1) throw new Error(`${file}: ${pages.length} pages, one expected`);
  const cm = /\/Contents\s*(\[[^\]]*\]|\d+\s+0\s+R)/.exec(o.body(pages[0]));
  if (!cm) throw new Error(`${file}: the page has no contents`);
  return [...cm[1].matchAll(/(\d+)\s+0\s+R/g)].map(m => o.stream(Number(m[1])).toString('latin1')).join('\n');
}

/* ---- the drawing commands */

type Tok = number | string | Tok[] | { name: string };
const OPS = /^[A-Za-z'"*]+$/;

/** Every painted path on the page, in page coordinates. */
export function paintedItems(content: string): Item[] {
  const items: Item[] = [];
  let ctm = [1, 0, 0, 1, 0, 0], fill: number[] = [0], stroke: number[] = [0];
  const stack: { ctm: number[]; fill: number[]; stroke: number[] }[] = [];
  let subs: Sub[] = [], cur: Sub | null = null, pt: P = { x: 0, y: 0 };
  const tr = (x: number, y: number): P => ({ x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5] });
  const paint = (kind: 'fill' | 'stroke' | null, evenOdd = false) => {
    // (a move with nothing drawn from it is no subpath)
    subs = subs.filter(sp => sp.segs.length);
    if (kind && subs.length) items.push({ subs, color: kind === 'fill' ? fill : stroke, paint: kind, evenOdd });
    subs = []; cur = null;
  };
  let args: Tok[] = [];
  const n = (i: number) => args[i] as number;
  let i = 0;
  const len = content.length;
  const skipWs = () => {
    while (i < len) {
      const c = content[i];
      if (c === '%') { while (i < len && content[i] !== '\n' && content[i] !== '\r') i++; }
      else if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0') i++;
      else break;
    }
  };
  const readTok = (): Tok | null => {
    skipWs();
    if (i >= len) return null;
    const c = content[i];
    if (c === '[') {
      i++;
      const arr: Tok[] = [];
      for (;;) { skipWs(); if (content[i] === ']') { i++; return arr; } const t = readTok(); if (t === null) return arr; arr.push(t); }
    }
    if (c === '<' && content[i + 1] === '<') {
      // a dictionary (marked-content properties): kept whole, unread
      let depth = 0;
      while (i < len) {
        if (content.startsWith('<<', i)) { depth++; i += 2; } else if (content.startsWith('>>', i)) { depth--; i += 2; if (!depth) break; } else i++;
      }
      return { name: '<<>>' };
    }
    if (c === '<') { const j = content.indexOf('>', i); i = j + 1; return { name: '<hex>' }; }
    if (c === '(') {
      let depth = 0;
      for (; i < len; i++) {
        const d = content[i];
        if (d === '\\') { i++; continue; }
        if (d === '(') depth++;
        else if (d === ')' && !--depth) { i++; break; }
      }
      return { name: '(str)' };
    }
    if (c === '/') {
      const m = /^\/[^\s/[\]()<>{}%]*/.exec(content.slice(i, i + 128))!;
      i += m[0].length;
      return { name: m[0] };
    }
    const m = /^[^\s/[\]()<>{}%]+/.exec(content.slice(i, i + 64));
    if (!m) { i++; return readTok(); }
    i += m[0].length;
    const v = Number(m[0]);
    return Number.isFinite(v) && /^[-+.\d]/.test(m[0]) ? v : m[0];
  };
  for (;;) {
    const t = readTok();
    if (t === null) break;
    if (typeof t !== 'string' || !OPS.test(t)) { args.push(t); continue; }
    switch (t) {
      case 'q': stack.push({ ctm, fill, stroke }); break;
      case 'Q': ({ ctm, fill, stroke } = stack.pop() ?? { ctm, fill, stroke }); break;
      case 'cm': {
        const [a, b, c, d, e, f] = args as number[];
        ctm = [a * ctm[0] + b * ctm[2], a * ctm[1] + b * ctm[3], c * ctm[0] + d * ctm[2], c * ctm[1] + d * ctm[3],
          e * ctm[0] + f * ctm[2] + ctm[4], e * ctm[1] + f * ctm[3] + ctm[5]];
        break;
      }
      case 'g': case 'rg': case 'k': case 'sc': case 'scn': fill = args.filter(a => typeof a === 'number') as number[]; break;
      case 'G': case 'RG': case 'K': case 'SC': case 'SCN': stroke = args.filter(a => typeof a === 'number') as number[]; break;
      case 'm': pt = tr(n(0), n(1)); cur = { start: pt, segs: [] }; subs.push(cur); break;
      case 'l': { const p = tr(n(0), n(1)); cur?.segs.push({ k: 'L', p }); pt = p; break; }
      case 'c': { const p = tr(n(4), n(5)); cur?.segs.push({ k: 'C', a: tr(n(0), n(1)), b: tr(n(2), n(3)), p }); pt = p; break; }
      case 'v': { const p = tr(n(2), n(3)); cur?.segs.push({ k: 'C', a: pt, b: tr(n(0), n(1)), p }); pt = p; break; }
      case 'y': { const p = tr(n(2), n(3)); cur?.segs.push({ k: 'C', a: tr(n(0), n(1)), b: p, p }); pt = p; break; }
      case 'h': if (cur) pt = cur.start; break;
      case 're': {
        const [x, y, w, h] = args as number[];
        cur = { start: tr(x, y), segs: [{ k: 'L', p: tr(x + w, y) }, { k: 'L', p: tr(x + w, y + h) }, { k: 'L', p: tr(x, y + h) }] };
        subs.push(cur); pt = cur.start;
        break;
      }
      case 'f': case 'F': paint('fill'); break;
      case 'f*': paint('fill', true); break;
      case 'B': case 'b': paint('fill'); break;
      case 'B*': case 'b*': paint('fill', true); break;
      case 'S': case 's': paint('stroke'); break;
      case 'n': paint(null); break;
      case 'Do': case 'BT': case 'BI': case 'sh': throw new Error(`the sheet uses '${t}', which isn't read (outline its text, expand its symbols)`);
      default: break; // clipping, graphics state, marked content
    }
    args = [];
  }
  return items;
}

/* ---- boxes */

export interface Box { x0: number; y0: number; x1: number; y1: number }
const subPoints = (s: Sub) => [s.start, ...s.segs.flatMap(g => g.k === 'L' ? [g.p] : [g.a, g.b, g.p])];
/** A subpath's box by its points and handles (a little wider than its ink where a curve's handles reach out). */
export function subBox(s: Sub): Box {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of subPoints(s)) { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); }
  return b;
}
/** The box round several. */
export const union = (bs: Box[]): Box => bs.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }),
  { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });

/** A subpath's ink box: its curves' true extremes, not their handles. */
export function inkBox(s: Sub): Box {
  const b = { x0: s.start.x, y0: s.start.y, x1: s.start.x, y1: s.start.y };
  const add = (p: P) => { b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); };
  let p0 = s.start;
  for (const g of s.segs) {
    if (g.k === 'C') for (let k = 1; k < 32; k++) {
      const t = k / 32, u = 1 - t;
      add({ x: u * u * u * p0.x + 3 * u * u * t * g.a.x + 3 * u * t * t * g.b.x + t * t * t * g.p.x,
        y: u * u * u * p0.y + 3 * u * u * t * g.a.y + 3 * u * t * t * g.b.y + t * t * t * g.p.y });
    }
    add(g.p); p0 = g.p;
  }
  return b;
}

/* ---- the sheet: letters and their labels */

/** A label: its outline's subpaths, its box, and (once read) the character it names. */
export interface Label { subs: Sub[]; box: Box; ch?: string }
/** A character on the sheet: its label, its outline (black subpaths) and the baseline of its row, in points. */
export interface Cell { ch: string; label: Label; subs: Sub[]; baseline: number }
export interface Sheet { cells: Cell[]; sample: Sub[]; labels: Label[] }

const isBlack = (c: number[]) => (c.length === 1 && c[0] === 0) || (c.length === 3 && c.every(v => v === 0)) || (c.length === 4 && c[3] === 1 && !c[0] && !c[1] && !c[2]);
/** The labels' grey (0.6 in RGB). */
const isLabelGrey = (c: number[]) => c.length === 3 && c.every(v => Math.abs(v - 0.6) < 0.01);

/** The grey label outlines, gathered into labels: pieces on one line no further apart than a label's own letters. */
function gatherLabels(items: Item[]): Label[] {
  const pieces = items.filter(it => it.paint === 'fill' && isLabelGrey(it.color)).flatMap(it => it.subs.map(s => ({ s, b: subBox(s) })));
  // lines first (by the pieces' middles), then left to right along each, a gap wider than a space between letters
  // starting another label
  const lines: (typeof pieces)[] = [];
  for (const p of [...pieces].sort((a, b) => (b.b.y0 + b.b.y1) - (a.b.y0 + a.b.y1))) {
    const mid = (p.b.y0 + p.b.y1) / 2, line = lines.find(l => Math.abs((l[0].b.y0 + l[0].b.y1) / 2 - mid) < 2.5);
    if (line) line.push(p); else lines.push([p]);
  }
  const labels: { subs: Sub[]; box: Box }[] = [];
  for (const line of lines) {
    let open: { subs: Sub[]; box: Box } | null = null;
    for (const p of line.sort((a, b) => a.b.x0 - b.b.x0)) {
      if (open && p.b.x0 < open.box.x1 + 3) { open.subs.push(p.s); open.box = union([open.box, p.b]); }
      else labels.push(open = { subs: [p.s], box: p.b });
    }
  }
  return labels;
}

/** A label's look, to tell labels apart: each subpath's box from the label's corner, left to right. */
function labelKey(l: Label): number[] {
  return l.subs.map(subBox).sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0)
    .flatMap(b => [b.x0 - l.box.x0, b.y0 - l.box.y0, b.x1 - l.box.x0, b.y1 - l.box.y0]);
}

/** Read every label on `sheet` by the nearest-looking label on `known`, a sheet with every character of `order`
    in reading order. Throws when a label matches none closely enough, or two labels read the same. */
export function readLabels(labels: Label[], known: Label[], order: string) {
  if (known.length !== [...order].length) throw new Error(`the known sheet has ${known.length} labels, not ${[...order].length}`);
  const keys = known.map(labelKey), chars = [...order];
  for (const l of labels) {
    const k = labelKey(l);
    let best = -1, bestD = Infinity;
    keys.forEach((kk, j) => {
      if (kk.length !== k.length) return;
      const d = Math.max(...kk.map((v, t) => Math.abs(v - k[t])));
      if (d < bestD) { bestD = d; best = j; }
    });
    if (best < 0 || bestD > 0.15) throw new Error(`a label at ${l.box.x0.toFixed(1)}, ${l.box.y0.toFixed(1)} matches no known label (${bestD.toFixed(3)})`);
    l.ch = chars[best];
  }
  const seen = new Set<string>();
  for (const l of labels) { if (seen.has(l.ch!)) throw new Error(`two labels read ${l.ch}`); seen.add(l.ch!); }
}

/** Labels in reading order: rows from the top, each left to right. */
export function readingOrder(labels: Label[]): Label[] {
  const rows: Label[][] = [];
  for (const l of [...labels].sort((a, b) => b.box.y1 - a.box.y1)) {
    const row = rows.find(r => Math.abs(r[0].box.y1 - l.box.y1) < 3);
    if (row) row.push(l); else rows.push([l]);
  }
  return rows.flatMap(r => r.sort((a, b) => a.box.x0 - b.box.x0));
}

/** The black outlines and grey labels of a sheet, with the labels unread. */
export function sheetParts(file: string) {
  const items = paintedItems(pageContent(file));
  const labels = readingOrder(gatherLabels(items));
  const black = items.filter(it => it.paint === 'fill' && isBlack(it.color));
  return { items, labels, black };
}

/** Each character's outline on a sheet whose labels have been read (see readLabels). A black item belongs to the
    label of its row and column: rows by the labels' tops (an item belongs to the nearest row whose label sits below
    most of it), columns by the labels' left edges and the cell's width. The sample line above the first row is kept
    apart. The baseline of each row is where most of its letters stand: the most common bottom among its items, read
    as the same distance above the labels on every row (the sheet sets every row so). */
export function sheetCells(labels: Label[], black: Item[]): Sheet {
  // the rows by their labels' tops (a label with a round figure stands a hair taller)
  const rowTops: number[] = [];
  for (const y of labels.map(l => l.box.y1).sort((a, b) => b - a)) if (!rowTops.some(t => Math.abs(t - y) < 3)) rowTops.push(y);
  const lefts = [...new Set(labels.map(l => Math.round(l.box.x0)))].sort((a, b) => a - b);
  const pitch = lefts.length > 1 ? Math.min(...lefts.slice(1).map((x, k) => x - lefts[k]).filter(d => d > 10)) : 72;
  const rowGap = Math.min(...rowTops.slice(1).map((y, k) => rowTops[k] - y));
  const firstTop = rowTops[0];
  const groups = new Map<Label, Sub[]>(), sample: Sub[] = [];
  for (const it of black) {
    // each letter is one compound path, placed by its middle
    const b = union(it.subs.map(inkBox)), cy = (b.y0 + b.y1) / 2, cx = (b.x0 + b.x1) / 2;
    // above the first row's letters (a row's letters reach at most a row's gap above its labels): the sample line
    if (cy > firstTop + rowGap * 1.15) { sample.push(...it.subs); continue; }
    // the row: the nearest labels below the middle (a descender reaches below its labels, its letter's middle doesn't)
    const row = rowTops.find(t => t < cy - 2) ?? rowTops[rowTops.length - 1];
    const inRow = labels.filter(l => Math.abs(l.box.y1 - row) < 3);
    // the column: the label whose cell (its left edge plus the pitch) is centred nearest the middle
    let best: Label | undefined, bestD = Infinity;
    for (const l of inRow) { const d = Math.abs(cx - (l.box.x0 + pitch / 2)); if (d < bestD) { bestD = d; best = l; } }
    if (!best || bestD > pitch * 0.75) throw new Error(`no label for an outline at ${cx.toFixed(1)}, ${cy.toFixed(1)}`);
    // a letter left in two compound paths is still one letter
    groups.set(best, [...(groups.get(best) ?? []), ...it.subs]);
  }
  const cells: Cell[] = [];
  for (const l of labels) {
    const subs = groups.get(l);
    if (subs) cells.push({ ch: l.ch!, label: l, subs, baseline: NaN });
  }
  // the baseline: the most common bottom (to a tenth of a point) of the subpaths across the sheet, measured from
  // the labels' tops
  const votes = new Map<number, number>();
  for (const c of cells) for (const s of c.subs) {
    const d = Math.round((inkBox(s).y0 - c.label.box.y1) * 10) / 10;
    votes.set(d, (votes.get(d) ?? 0) + 1);
  }
  const off = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  for (const c of cells) c.baseline = c.label.box.y1 + off;
  return { cells, sample, labels };
}
