/* Serif sides and cups: which way each stem's serifs reach (Sides: left, right, into the letter or out
   of it) and, for cupped serifs, how far each stroke is drawn short so its serif can arch up to it.
   Read off a glyph's skeleton by buildGlyph (glyph.ts) before its strokes are expanded. */
import { serifCup, serifPlace, serifSides } from './stroke';
import type { SerifSides } from './types';
import type { Builder, Metrics } from './font';
import { centerPoints, stretchEnd } from './ends';

/** A stem's end and the rest of the letter: the sides of the end that face into the letter, and the sides
    its serif is drawn on. */
interface SerifFacing { inward: SerifSides; sides: SerifSides }

/** How each stroke end with a serif at its foot or on top faces the rest of the letter, by stroke index and
    end, for a design whose serifs don't all reach both ways alike (else null). A side faces into the letter
    when more of the letter stands beside it on the same line: the right of an n's first stem, both sides of
    an m's middle one, neither side of an I. */
export function faceSerifs(b: Builder, m: Metrics): Map<string, SerifFacing> | null {
  const sf = m.ctx.serif!, keep = sf.sides ?? 'both';
  if (!sf.inner && keep === 'both') return null;
  const facing = new Map<string, SerifFacing>();
  const lines = sf.inner || keep === 'inside' || keep === 'outside' ? b.strokes.map(t => (t.cmds ? centerPoints(t.cmds, m, m.s * 0.25) : [])) : [];
  const band = Math.max(m.xh * 0.2, m.s * 0.75), clear = m.s * 0.6;
  b.strokes.forEach((st, si) => {
    if (!st.cmds || st.o.scale) return;
    for (const which of ['s', 'e'] as const) {
      const given = (which === 's' ? st.o.serifS : st.o.serifE) ?? null, type = (which === 's' ? st.o.s : st.o.e) || 'flat';
      const step = given && type !== 'join' ? stretchEnd(st.cmds, which, -1, m) : null;
      if (!step) continue;
      const { x, y } = step.from, dy = y - step.to.y;
      if (serifPlace({ dx: x - step.to.x, dy, type }) === 'arm') continue;
      // the line the end stands on, and the letter a little way above it (below it, on top of a stroke)
      const y0 = dy > 0 ? y - band : y - 1, y1 = dy > 0 ? y + 1 : y + band;
      let a = false, c = false;
      for (const pts of lines) for (const q of pts) if (q.y >= y0 && q.y <= y1) { if (q.x < x - clear) a = true; else if (q.x > x + clear) c = true; }
      const inward = a && c ? 'both' : a ? 'a' : c ? 'b' : null;
      facing.set(`${si}${which}`, { inward, sides: serifSides(given, keep, inward) });
    }
  });
  return facing;
}

/** Draw every stroke end that carries a cupped serif short by the height of the cup, so the serif can arch
    up under it (or down into it, on top of a stroke), and return how far short of its line each end now
    stops, by stroke index and end. An end whose serif the design leaves off (see faceSerifs) stays as drawn. */
export function cupSerifs(b: Builder, m: Metrics, facing: Map<string, SerifFacing> | null): Map<string, number> {
  const cups = new Map<string, number>(), cup = serifCup(m.ctx.serif!);
  b.strokes.forEach((st, si) => {
    if (!st.cmds || st.o.scale) return;
    for (const which of ['s', 'e'] as const) {
      const type = (which === 's' ? st.o.s : st.o.e) || 'flat';
      if (!(which === 's' ? st.o.serifS : st.o.serifE) || type === 'join' || facing?.get(`${si}${which}`)?.sides === null) continue;
      // which way the end runs, from a small step back along it
      const step = stretchEnd(st.cmds, which, -1, m);
      if (!step) continue;
      const dx = step.to.x - step.from.x, dy = step.to.y - step.from.y, l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      // the serifs at the foot and on top of strokes are cupped; one across the end of an arm stays flat
      if (serifPlace({ dx: -dx, dy: -dy, type }) === 'arm') continue;
      const r = stretchEnd(st.cmds, which, -cup / Math.max(0.35, Math.abs(dy) / l), m);
      if (!r) continue;
      st.cmds = r.cmds;
      cups.set(`${si}${which}`, Math.abs(r.to.y - r.from.y));
    }
  });
  return cups;
}
