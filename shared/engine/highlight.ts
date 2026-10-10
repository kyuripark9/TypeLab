/* Highlight layers: the part of a glyph a setting shapes (its stems, crossbars, ends, serifs...), as
   SVG path data, for the explainer and the inspector to light up. */
import { cmdsToD, ringsD } from './geom';
import type { Glyph, GlyphStroke, Metrics } from './font';
import type { MarkType } from './types';

/** The settings that shape a few points of a letter (its stroke ends, peaks, corners...), lit as rings round
    the marks of these types, `min` in radius, or `stem` stems if that is more. */
const RINGS = new Map<string, { types: MarkType[]; min: number; stem: number }>([
  ['terminal', { types: ['terminal'], min: 26, stem: 0.62 }],
  ['aperture', { types: ['terminal'], min: 26, stem: 0.62 }],
  ['apex', { types: ['apex', 'vertex'], min: 30, stem: 0.7 }],
  ['roundness', { types: ['corner'], min: 16, stem: 0.3 }],
  ['cursive', { types: ['exit', 'entry'], min: 30, stem: 0.7 }],
  ['overlap', { types: ['overlap'], min: 30, stem: 0.8 }],
  ['tail', { types: ['tail'], min: 30, stem: 0.7 }]
]);
/** The settings highlighted as rings (see RINGS), which the preview, the inspector and the explainer outline
    rather than fill. */
export const RING_KEYS: Record<string, true> = Object.fromEntries([...RINGS.keys()].map(k => [k, true as const]));

export function highlightD(g: Glyph, key: string, m: Metrics): string {
  const strokes = (f: (s: GlyphStroke) => boolean | undefined) => g.strokes.filter(f).map(s => cmdsToD(s.cmds)).join('');
  const ring = RINGS.get(key);
  if (ring) return ringsD(g.marks.filter(k => ring.types.includes(k.type)), Math.max(ring.min, m.s * ring.stem));
  switch (key) {
    case 'weight': return strokes(s => s.part === 'stem' || s.part === 'diagonal');
    case 'contrast': return strokes(s => s.horizontal || s.part === 'crossbar' || s.part === 'arm');
    case 'counter': return g.counters.map(cmdsToD).join('');
    case 'curve': return strokes(s => s.curved);
    case 'crossbar': return strokes(s => s.part === 'crossbar' || s.part === 'bar');
    case 'serif': case 'serifTip': case 'serifBase': return g.serifs.map(cmdsToD).join('');
    case 'serifBalance': case 'serifSides': case 'serifInner': return g.serifs.filter((_, i) => g.serifAt[i] !== 'arm').map(cmdsToD).join('');
    case 'serifTops': return g.serifs.filter((_, i) => g.serifAt[i] === 'top').map(cmdsToD).join('');
    case 'serifArms': return g.serifs.filter((_, i) => g.serifAt[i] === 'arm').map(cmdsToD).join('');
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
    default: return '';
  }
}
