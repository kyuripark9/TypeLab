/* Free fonts' letters (see shared/free-fonts.ts): a design written in one draws its letters as the font
   has them instead of building them, much as a letter drawn with the pen. The server fetches a font from
   Google Fonts and sends its outlines in this form (server/free-fonts.ts); whoever draws with it
   registers them here first, the browser once they arrive and the server before it exports. */
import type { Drawn, Node } from './outline';

/** An anchor point packed small: x and y, then the handle coming in and the one going out, each pair
    there only when the point has that handle (the incoming one null when only the outgoing is there). */
export type PackedNode = [number, number] | [number, number, number | null, number | null] | [number, number, number | null, number | null, number, number];
/** A free font's letters as they travel, at 1000 units to the em, y up. */
export interface FreeFontData {
  /** the font's id (see fontId) */ id: string;
  family: string; designers: string[];
  /** the font's own copyright notice, and the licence it comes under, by name and address, and in full
      (its OFL.txt or LICENSE.txt, '' when that couldn't be had) */ copyright: string; license: string; licenseUrl: string; licenseText?: string;
  /** its cap height, x-height and space width */ cap: number; xh: number; space: number;
  /** each character it has: its advance width and outlines */ glyphs: Record<string, [number, PackedNode[][]]>;
}
/** A registered font: its letters unpacked. */
export interface FreeFont extends Omit<FreeFontData, 'glyphs'> { glyphs: Record<string, Drawn> }

const fonts = new Map<string, FreeFont>();
const listeners = new Set<(id: string) => void>();

const unpack = (n: PackedNode): Node => {
  const out: Node = { x: n[0], y: n[1] };
  if (n.length > 2 && n[2] != null && n[3] != null) { out.ix = n[2]; out.iy = n[3]; }
  if (n.length > 4) { out.ox = n[4] as number; out.oy = n[5] as number; }
  // a point whose handles run on in one line is smooth, so the pen keeps it so
  if (out.ix !== undefined && out.ox !== undefined) {
    const ax = out.x - out.ix, ay = out.y - out.iy!, bx = out.ox - out.x, by = out.oy! - out.y, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la > 0 && lb > 0 && (ax * bx + ay * by) / (la * lb) > 0.995) out.s = 1;
  }
  return out;
};
export const packNode = (n: Node): PackedNode =>
  n.ox !== undefined ? [n.x, n.y, n.ix ?? null, n.iy ?? null, n.ox, n.oy!] : n.ix !== undefined ? [n.x, n.y, n.ix, n.iy!] : [n.x, n.y];

/** Make a font's letters available to draw with. */
export function registerFreeFont(data: FreeFontData) {
  const glyphs: Record<string, Drawn> = {};
  for (const [ch, [adv, contours]] of Object.entries(data.glyphs)) glyphs[ch] = { adv, contours: contours.map(c => c.map(unpack)) };
  fonts.set(data.id, { ...data, glyphs });
  for (const fn of listeners) fn(data.id);
}
/** A font's letters, once registered. */
export const freeFont = (id: string): FreeFont | undefined => fonts.get(id);
/** Be told when a font is registered. */
export function onFreeFont(fn: (id: string) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
