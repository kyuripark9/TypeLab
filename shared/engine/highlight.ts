/* Highlight layers: the part of a glyph a setting shapes (its stems, crossbars, ends, serifs...), as
   SVG path data, for the explainer and the inspector to light up. */
import { cmdsToD, ringsD } from './geom';
import type { Glyph, GlyphStroke, Metrics } from './font';

/* ---- highlight layers: which part of a glyph does a parameter touch? */
export const RING_KEYS: Record<string, true> = { terminal: true, aperture: true, apex: true, roundness: true, cursive: true, overlap: true, tail: true };

export function highlightD(g: Glyph, key: string, m: Metrics): string {
  const strokes = (f: (s: GlyphStroke) => boolean | undefined) => g.strokes.filter(f).map(s => cmdsToD(s.cmds)).join('');
  switch (key) {
    case 'weight': return strokes(s => s.part === 'stem' || s.part === 'diagonal');
    case 'contrast': return strokes(s => s.horizontal || s.part === 'crossbar' || s.part === 'arm');
    case 'counter': return g.counters.map(cmdsToD).join('');
    case 'curve': return strokes(s => s.curved);
    case 'crossbar': return strokes(s => s.part === 'crossbar' || s.part === 'bar');
    case 'serif': case 'serifTip': case 'serifBase': return g.serifs.map(cmdsToD).join('');
    case 'serifBalance': case 'serifSides': case 'serifInner': return g.serifs.filter((_, i) => g.serifAt[i] !== 'arm').map(cmdsToD).join('');
    case 'serifTops': return g.serifs.filter((_, i) => g.serifAt[i] === 'top').map(cmdsToD).join('');
    case 'serifArms': case 'serifArmThickness': case 'serifArmLean': return g.serifs.filter((_, i) => g.serifAt[i] === 'arm').map(cmdsToD).join('');
    case 'terminal': case 'aperture': return ringsD(g.marks.filter(k => k.type === 'terminal'), Math.max(26, m.s * 0.62));
    case 'apex': return ringsD(g.marks.filter(k => k.type === 'apex' || k.type === 'vertex'), Math.max(30, m.s * 0.7));
    case 'roundness': return ringsD(g.marks.filter(k => k.type === 'corner'), Math.max(16, m.s * 0.3));
    case 'cursive': return ringsD(g.marks.filter(k => k.type === 'exit' || k.type === 'entry'), Math.max(30, m.s * 0.7));
    case 'story': return g.ch === 'a' ? g.d : '';
    case 'gForm': return g.ch === 'g' ? g.d : '';
    case 'sForm': return /[sS$]/.test(g.ch) ? strokes(s => s.part === 'spine') : '';
    case 'kForm': return g.ch === 'k' || g.ch === 'K' ? strokes(s => s.part === 'arm' || s.part === 'leg') : '';
    case 'iForm': return /[IJil]/.test(g.ch) ? g.d : '';
    case 'diagonals': return /[AVWvw]/.test(g.ch) ? g.d : '';
    case 'yForm': return /[Yy]/.test(g.ch) ? g.d : '';
    case 'qForm': return g.ch === 'Q' ? g.d : '';
    case 'rForm': return g.ch === 'R' ? g.d : '';
    case 'scriptForm': return /^[A-Za-z]$/.test(g.ch) ? g.d : '';
    case 'bowlForm': return strokes(s => s.curved);
    case 'bends': return /[AMNVWYZvwyz]/.test(g.ch) ? g.d : '';
    case 'bowlJoin': return /[abdgpq]/.test(g.ch) ? strokes(s => s.part === 'bowl') : /[hmnru]/.test(g.ch) ? strokes(s => s.part === 'shoulder') : '';
    case 'dots': return strokes(s => !!s.dot);
    case 'overlap': return ringsD(g.marks.filter(k => k.type === 'overlap'), Math.max(30, m.s * 0.8));
    case 'tail': return ringsD(g.marks.filter(k => k.type === 'tail'), Math.max(30, m.s * 0.7));
    default: return '';
  }
}
