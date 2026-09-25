/* A saved design as exchanged between client and server. */
import type { Params } from './params';

export interface Design {
  id: string;
  name: string;
  styleId: string;
  params: Params;
  createdAt: string;
  updatedAt: string;
}

export interface DesignInput {
  name: string;
  styleId: string;
  params: Params;
}

export const NAME_MAX = 60;
export const DEFAULT_NAME = 'Untitled font';

/** Collapse whitespace and cap the length; empty names become the default. */
export function cleanName(name: unknown): string {
  const s = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  return s || DEFAULT_NAME;
}

/** File-name-safe version of a font name. */
export const slug = (name: string) => name.replace(/[^A-Za-z0-9]+/g, '') || 'TypeLab';
