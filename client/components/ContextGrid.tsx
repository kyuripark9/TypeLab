/* The font grid under the inspector: the letter being edited set among the design's other letters,
   in spacing strings (nn a nn, oo a oo) and words, so it can be judged as it will be read. The
   letter is picked out in every cell; click any letter to edit it instead. */
import type { Font } from '../../shared/engine';
import { n1 } from '../lib/hooks';
import { actions } from '../state/editor';

/** Short words that between them use every letter a few times. */
const WORDS = [
  'hamburg', 'adhesion', 'bold', 'object', 'cinema', 'jacket', 'dream', 'model', 'every', 'reflex', 'fjord', 'offset',
  'glyph', 'grove', 'hinge', 'thumb', 'ivory', 'minim', 'jazz', 'major', 'kiosk', 'bank', 'lamp', 'hello', 'moon', 'summit',
  'noun', 'banner', 'oxbow', 'orbit', 'paper', 'upset', 'quiz', 'unique', 'river', 'mirror', 'sleep', 'basis', 'tweet', 'attic',
  'unity', 'humus', 'vivid', 'velvet', 'window', 'swing', 'axis', 'xenon', 'lynx', 'yearly', 'rhythm', 'zebra', 'puzzle'
];

const SPACING_LOWER = (c: string) => [`nn${c}nn`, `oo${c}oo`, `n${c}o${c}n`];
const SPACING_UPPER = (c: string) => [`HH${c}HH`, `OO${c}OO`, `H${c}O${c}H`];

/** The strings to show for `ch`: spacing strings first, then words that use it (six cells in all). */
export function contextStrings(ch: string): string[] {
  const lo = ch.toLowerCase(), upper = ch !== lo, letter = /[a-z]/i.test(ch);
  if (!letter) {
    if (/[0-9]/.test(ch)) return [`00${ch}00`, `11${ch}11`, `${ch}0${ch}1${ch}`, `HH${ch}HH`, `nn${ch}nn`, `20${ch}6`];
    return [`nn${ch}nn`, `oo${ch}oo`, `HH${ch}HH`, `OO${ch}OO`, `n${ch}o${ch}H`, `word${ch}`];
  }
  const words = WORDS.filter(w => w.includes(lo)).slice(0, 3);
  const spacing = upper ? SPACING_UPPER(ch) : SPACING_LOWER(ch);
  // a capital also leads a word in lowercase, as it does in a sentence
  const shown = upper ? [...words.slice(0, 2).map(w => w.toUpperCase()), `${ch}${WORDS.find(w => w[0] === lo)?.slice(1) ?? ''}`] : words;
  return [...spacing.slice(0, 2), ...shown, ...spacing.slice(2)].slice(0, 6);
}

export function ContextGrid({ ch, font }: { ch: string; font: Font }) {
  const m = font.m, sc = 0.046, top = Math.max(m.asc, m.cap) + 40, Hu = top - m.desc + 40;
  return (
    <div className="ctx-grid" role="group" aria-label={`${ch} among other letters`}>
      {contextStrings(ch).map((text, i) => {
        const items = font.layout(text, 1e6)[0]?.items ?? [];
        const Wu = items.reduce((w, it) => Math.max(w, it.x + it.adv), 0);
        return (
          <div key={i} className="ctx-cell">
            <svg width={n1(Wu * sc)} height={n1(Hu * sc)} viewBox={`0 0 ${n1(Wu)} ${n1(Hu)}`} aria-label={text}>
              {items.map((it, j) => {
                const g = font.glyph(it.ch);
                return g && (
                  <g key={j} className={it.ch === ch ? 'ctx-gl on' : 'ctx-gl'} transform={`translate(${n1(it.x)},${n1(top)})`}
                    onClick={() => { if (it.ch !== ch) actions.openInspector(it.ch); }}>
                    <rect x={0} y={n1(-top)} width={n1(it.adv)} height={n1(Hu)} />
                    <path d={g.d} />
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
