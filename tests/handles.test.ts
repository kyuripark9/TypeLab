import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_CHARS, buildFont } from '../shared/engine';
import { DEFAULTS, isTurnId, type Params } from '../shared/params';

type HandleKey = 'corners' | 'innerCorners' | 'cornerSteps' | 'terminalEnds' | 'terminalCurls' | 'strokeWeights';

/** Every handle a letter offers while it is customized, as [letter, setting, id], in a font with settings `p`. */
function handles(p: Params) {
  const f = buildFont(p), out: [string, HandleKey, string][] = [];
  for (const ch of ALL_CHARS) {
    const g = f.glyph(ch);
    if (!g) continue;
    for (const mk of g.marks) {
      if (!mk.id) continue;
      if (mk.type === 'corner') {
        out.push([ch, 'corners', mk.id]);
        if (isTurnId(mk.id)) out.push([ch, 'innerCorners', mk.id]);
        if (mk.st != null) out.push([ch, 'cornerSteps', mk.id]);
      }
      if (mk.type === 'terminal' || mk.type === 'end') out.push([ch, 'terminalEnds', mk.id], [ch, 'terminalCurls', mk.id]);
    }
    for (const s of g.strokes) if (s.id != null) out.push([ch, 'strokeWeights', s.id]);
  }
  return out;
}

/** The handles that draw the letter the same at both ends of their range. */
function dead(p: Params) {
  return handles(p).filter(([ch, k, id]) => {
    const d = (v: number) => buildFont({ ...p, glyphs: { [ch]: { [k]: { [id]: v } } } }).glyph(ch)!.d;
    return d(0) === d(1);
  }).map(([ch, k, id]) => `${ch} ${k} ${id}`);
}

describe('letter handles', () => {
  // each corner, end and stroke a letter offers a control for changes the letter: joins in narrow
  // crotches (K, the waist of B), corners a clip cuts (the top left of N), the ends beside the dot of an i
  for (const [name, p] of Object.entries<Partial<Params>>({ 'as drawn': {}, light: { weight: 0.1 }, heavy: { weight: 0.9 }, 'high contrast': { contrast: 1 }, serif: { serif: true } })) {
    it(`all do something, ${name}`, () => assert.deepEqual(dead({ ...DEFAULTS, ...p }), []));
  }
});
