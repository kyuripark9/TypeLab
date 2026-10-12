/* The order each glyph draws its strokes in, pinned in tests/stroke-order.txt. A stroke's id is its place in that
   order (Builder.strokes in shared/engine/font.ts), and a letter's own values are saved under those ids
   (strokeWeights, and the stroke ends, corners and joins named after their stroke: see shared/params/scales.ts),
   so a stroke drawn in another order, or one added before others, hands a saved design's values to the wrong
   strokes while every outline stays the same. The order is kept for the defaults, and, where it differs from
   theirs, for each letter form and a few settings that draw strokes of their own.

   The ids already shift with some settings, and that is pinned as it is: a stroke drawn only under some settings
   comes before the ones drawn after it, so the cursive entry stroke (from Cursive 0.04) is drawn before the stem
   of i j m n p r u y, and the fillets of square bowl joins before the shoulder or stem they meet (with them n is
   0 stem, 2 shoulder, but 0 stem, 1 shoulder as a wireframe or at weight 1 and width 0, where none is drawn).

   An order changed on purpose: UPDATE_STROKE_ORDER=1 node --import tsx --test tests/stroke-order.test.ts rewrites the
   file. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ALL_CHARS, buildFont } from '../shared/engine';
import { DEFAULTS, type Params } from '../shared/params';

const FILE = new URL('./stroke-order.txt', import.meta.url);

/** The designs whose order is kept: the defaults, then each letter form and the settings that draw strokes of their own. */
const DESIGNS: [string, Partial<Params>][] = [
  ['defaults', {}], ['story=single', { story: 'single' }], ['aForm=spur', { aForm: 'spur' }],
  ['gForm=mirrored', { gForm: 'mirrored' }], ['gForm=double', { gForm: 'double' }], ['kForm=stem', { kForm: 'stem' }], ['kForm=bar', { kForm: 'bar' }],
  ['iForm=bars', { iForm: 'bars' }], ['sForm=flat', { sForm: 'flat' }], ['qForm=inside', { qForm: 'inside' }], ['qForm=sweep', { qForm: 'sweep' }],
  ['rForm=loop', { rForm: 'loop' }], ['yForm=cup', { yForm: 'cup' }], ['diagonals=upright', { diagonals: 'upright' }], ['diagonals=arch', { diagonals: 'arch' }],
  ['bends=round', { bends: 'round' }], ['bowlJoin=square', { bowlJoin: 'square' }], ['bowlJoin=square,weight=1,width=0', { bowlJoin: 'square', weight: 1, width: 0 }],
  ['bowlJoin=square,fill=wire', { bowlJoin: 'square', fill: 'wire' }],
  ['cursive=0.3', { cursive: 0.3 }], ['cursive=1', { cursive: 1 }], ['scriptForm=script', { scriptForm: 'script' }],
  ['flourish=swash', { scriptForm: 'script', flourish: 'swash' }]
];

/** Each design's glyphs' strokes as `id:part` in order, by `<design> <character>`: every glyph of the defaults, and
    of the other designs those whose order differs from the defaults'. */
function strokeOrders(): Map<string, string> {
  const out = new Map<string, string>(), of = (p: Partial<Params>) => {
    const f = buildFont({ ...DEFAULTS, ...p } as Params);
    return [...ALL_CHARS].map(ch => (f.glyph(ch)?.strokes ?? []).filter(s => s.id != null).map(s => `${s.id}:${s.part}`).join(' '));
  };
  const base = of({});
  for (const [name, p] of DESIGNS) {
    const now = of(p);
    [...ALL_CHARS].forEach((ch, i) => { if (name === 'defaults' || now[i] !== base[i]) out.set(`${name} ${ch}`, now[i]); });
  }
  return out;
}

describe('stroke order', () => {
  it('draws every glyph\'s strokes in the order tests/stroke-order.txt keeps, so saved values stay on their strokes', () => {
    const now = strokeOrders();
    if (process.env.UPDATE_STROKE_ORDER) {
      const head = '# Each glyph\'s strokes in the order it draws them, as id:part (see tests/stroke-order.test.ts)';
      writeFileSync(FILE, [head, ...[...now].map(([k, v]) => `${k}\t${v}`)].join('\n') + '\n');
      return;
    }
    const was = new Map(readFileSync(FILE, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('\t') as [string, string]));
    const changed = [...new Set([...was.keys(), ...now.keys()])].filter(k => was.get(k) !== now.get(k))
      .map(k => `${k}: ${was.get(k) ?? '(as the defaults)'} -> ${now.get(k) ?? '(as the defaults)'}`);
    assert.deepEqual(changed, [], `strokes drawn in another order (UPDATE_STROKE_ORDER=1 if this is meant):\n${changed.join('\n')}`);
  });
});
