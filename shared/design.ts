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
}

export const NAME_MAX = 60;
export const DEFAULT_NAME = 'Untitled font';

/** Collapse whitespace and cap the length; empty names become the default. */
export function cleanName(name: unknown): string {
  const s = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  return s || DEFAULT_NAME;
}

/** File-name-safe version of a font name, its words joined by hyphens: "My Didone" → "My-Didone". */
export const slug = (name: string) => name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'TypeLab';
