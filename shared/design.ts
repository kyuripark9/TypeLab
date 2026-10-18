/* A saved design as exchanged between client and server. */
import type { Packed } from './font-log';
import type { LetterLog } from './letter-log';
import type { Params } from './params';

export interface Design {
  id: string;
  name: string;
  styleId: string;
  params: Params;
  /** each letter's record of its own edits, packed (shared/letter-log.ts); left out of the list of designs */
  log?: LetterLog;
  /** the font's History, packed (shared/font-log.ts); left out of the list of designs */
  versions?: Packed[];
  /** its name in its letters as My designs shows it, drawn as it was saved; null for none */
  sample?: NameSample | null;
  createdAt: string;
  updatedAt: string;
}

export interface DesignInput {
  name: string;
  styleId: string;
  params: Params;
  /** each letter's record of its own edits, packed; left out, a saved design keeps the one it has */
  log?: LetterLog;
  /** the font's History, packed; left out, a saved design keeps the one it has */
  versions?: Packed[];
  /** its name in its letters, drawn from these settings; left out, a saved design has none, as its letters may have
      changed */
  sample?: NameSample;
}

/** A design's name set in its own letters, as My designs shows it, drawn when it was saved, so the list needn't build
    every design's letters to show it: each letter's outline once, and where the name sets them, on one line (`list`)
    and, where a card breaks it onto two, on those (`card`). Outlines are SVG path data in whole font units, y down,
    each move, line and curve relative to the point before (client/lib/name-sample.ts). */
export interface NameSample { name: string; glyphs: Record<string, string>; list: NameSet; card?: NameSet }
/** A name's letters as set: the box they're drawn in (an SVG viewBox, in font units) and each letter's glyph and place. */
export interface NameSet { box: [number, number, number, number]; at: [string, number, number][] }

export const NAME_MAX = 60;
export const DEFAULT_NAME = 'Untitled font';
/** The most outline a sample keeps, in characters: a name in the dottiest fills comes to a fifth of it; one longer is
    drawn on My designs as it opens instead. */
export const SAMPLE_MAX = 800_000;

/** A name sample as it was sent or stored, if it reads as one (only the outline commands a sample is written in, its
    places all numbers, within SAMPLE_MAX), with nothing else on it; else undefined. */
export function cleanSample(x: unknown): NameSample | undefined {
  if (!x || typeof x !== 'object') return;
  const s = x as Record<string, unknown>, g = s.glyphs;
  if (typeof s.name !== 'string' || s.name.length > NAME_MAX || !g || typeof g !== 'object' || Array.isArray(g)) return;
  const glyphs: Record<string, string> = {};
  let size = 0;
  for (const [ch, d] of Object.entries(g)) {
    if (ch.length > 16 || ch === '__proto__' || typeof d !== 'string' || !/^[mlcz\d -]*$/.test(d) || (size += d.length) > SAMPLE_MAX) return;
    glyphs[ch] = d;
  }
  const set = (v: unknown): NameSet | undefined => {
    if (!v || typeof v !== 'object') return;
    const { box, at } = v as Record<string, unknown>, num = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
    if (!Array.isArray(box) || box.length !== 4 || !box.every(num) || !Array.isArray(at) || at.length > NAME_MAX * 2) return;
    if (!at.every(a => Array.isArray(a) && a.length === 3 && typeof a[0] === 'string' && Object.hasOwn(glyphs, a[0]) && num(a[1]) && num(a[2]))) return;
    return { box: box as NameSet['box'], at: at as NameSet['at'] };
  };
  const list = set(s.list), card = s.card === undefined ? undefined : set(s.card);
  if (!list || (s.card !== undefined && !card)) return;
  return { name: s.name, glyphs, list, ...(card ? { card } : {}) };
}

/** Collapse whitespace and cap the length; empty names become the default. */
export function cleanName(name: unknown): string {
  const s = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  return s || DEFAULT_NAME;
}

/** File-name-safe version of a font name, its words joined by hyphens: "My Didone" → "My-Didone". */
export const slug = (name: string) => name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'TypeLab';
