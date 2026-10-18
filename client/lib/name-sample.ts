/* A design's name set in its own letters as My designs shows it (shared/design.ts's NameSample): drawn as a design is
   saved and kept with it, so the list shows it without building every design's letters, which on a design in a
   dotted fill or in letters drawn in Points takes a moment, and stalled the opening title card over the page. */
import { cleanSample, type DesignInput, type NameSample, type NameSet } from '../../shared/design';
import type { Font, Line } from '../../shared/engine';
import { fontFor } from '../state/editor';
import { n1 } from './hooks';
import { overhang } from './preview';

/** A name on two lines: the second line sits this many letter heights (tallest top to descender) under the first. */
const LINE_PITCH = 1.04;
/** A card's well, width over height: .lib-open in a .lib-grid column (styles.css), in a full-width window. */
const WELL_ASPECT = 2.6;
/** A break onto two lines is taken only if it sets the name more than this much larger. */
const BREAK_GAIN = 1.12;

/** SVG path data as the engine writes it (moves, lines, curves and closes, absolute) in whole font units, each step
    relative to the point before, a command's letter only where it changes and a space only where no minus sign
    parts two numbers: about a third as long, a dotted fill's thousands of dots most of all, the outline as it was
    to half a unit. Null where it has another command. */
export function compactPath(d: string): string | null {
  const toks = d.match(/[a-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let out = '', i = 0, cmd = '', prev = '', x = 0, y = 0, sx = 0, sy = 0;
  const take = (n: number) => {
    const ps = toks.slice(i, (i += n)).map(Number);
    return ps.length === n && ps.every(Number.isFinite) ? ps.map(Math.round) : null;
  };
  const put = (c: string, ns: number[]) => {
    // (a move's letter is never left out: repeated, it would read as a line)
    if (c !== prev || c === 'm') { out += c; prev = c; } else if (ns[0] >= 0) out += ' ';
    ns.forEach((n, k) => { out += (k > 0 && n >= 0 ? ' ' : '') + n; });
  };
  while (i < toks.length) {
    if (/[a-z]/i.test(toks[i])) cmd = toks[i++];
    if (cmd === 'Z' || cmd === 'z') { out += 'z'; prev = 'z'; x = sx; y = sy; cmd = ''; continue; }
    const p = take(cmd === 'C' ? 6 : 2);
    if (!p || !'MLC'.includes(cmd) || !cmd) return null;
    if (cmd === 'C') { put('c', [p[0] - x, p[1] - y, p[2] - x, p[3] - y, p[4] - x, p[5] - y]); x = p[4]; y = p[5]; continue; }
    put(cmd === 'M' ? 'm' : 'l', [p[0] - x, p[1] - y]);
    [x, y] = p;
    // (the points after a move's are lines)
    if (cmd === 'M') { sx = x; sy = y; cmd = 'L'; }
  }
  return out;
}

/** `name` set in `f`, as large as fits the box it's shown in: on one line, and on a card, where a long name of
    several words comes out larger broken onto two, on those. Flourishes reaching out of the letters' boxes are kept
    in. */
export function drawName(f: Font, name: string): NameSample {
  const top = Math.max(f.m.asc, f.m.cap), bottom = -f.m.desc, LH = (top + bottom) * LINE_PITCH;
  const one = (t: string) => f.layout(t, Infinity)[0];
  const line = [one(name)];
  // the break between words that leaves the two lines most even, taken if the name comes out larger on a card's well
  const fit = (ls: Line[]) => Math.min(WELL_ASPECT / Math.max(...ls.map(l => l.width)), 1 / (top + bottom + (ls.length - 1) * LH));
  const words = name.split(' ');
  let best: Line[] | null = null;
  for (let i = 1; i < words.length; i++) {
    const two = [one(words.slice(0, i).join(' ')), one(words.slice(i).join(' '))];
    if (!best || fit(two) > fit(best)) best = two;
  }
  const glyphs: Record<string, string> = {};
  // each line centred (one line is as wide as the box), in the box the ink takes
  const set = (lines: Line[]): NameSet => {
    const W = Math.max(1, ...lines.map(l => l.width)), o = overhang(f, lines, W, top, bottom), at: NameSet['at'] = [];
    lines.forEach((ln, i) => {
      for (const it of ln.items) {
        const g = f.glyph(it.ch);
        if (!g?.d) continue;
        glyphs[it.ch] ??= compactPath(g.d) ?? g.d;
        at.push([it.ch, n1((W - ln.width) / 2 + it.x), n1(i * LH)]);
      }
    });
    // (`|| 0`: no ink out to the left is -0, which a save reads back as 0)
    return { box: [n1(-o.l) || 0, n1(-top - o.t), n1(W + o.l + o.r), n1(top + o.t + (lines.length - 1) * LH + bottom + o.b)], at };
  };
  return { name, glyphs, list: set(line), ...(best && fit(best) > fit(line) * BREAK_GAIN ? { card: set(best) } : {}) };
}

/** `s`, drawn in `f`, as it is kept: none while some of `f`'s letters are drawn from another font (a free font on its
    way), or where it doesn't keep (cleanSample: an outline in other commands, or too much of it). */
export const keptSample = (f: Font, s: NameSample) => (f.freeMissing.length || f.freePending ? undefined : cleanSample(s));

/** A save's design with its name's sample, drawn from the settings it saves; without one where it can't be had (a
    sample never stands in a save's way). */
export function withSample(input: DesignInput): DesignInput {
  try {
    const f = fontFor(input.params), sample = keptSample(f, drawName(f, input.name));
    return sample ? { ...input, sample } : input;
  } catch {
    return input;
  }
}
