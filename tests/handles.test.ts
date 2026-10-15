/* Every per-letter handle (the maps in ID_KEYS: corners, stroke ends, strokes, joins) changes its letter
   between the ends of its range, and is named by an id a saved design keeps. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_CHARS, buildFont } from '../shared/engine';
import { STYLES } from '../shared/content';
import { DEFAULTS, ID_KEYS, SPECS, isTurnId, type IdKey, type Params } from '../shared/params';

/** Every handle a letter offers while it is customized, as [letter, setting, id], in a font with settings `p`. */
function handles(p: Params) {
  const f = buildFont(p), out: [string, IdKey, string][] = [];
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
      if (mk.type === 'join') out.push([ch, 'joinGaps', mk.id]);
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
  it('cover every per-letter map', () => {
    assert.deepEqual(new Set(handles(DEFAULTS).map(h => h[1])), new Set(ID_KEYS));
  });

  it('names every handle by an id a saved design keeps', () => {
    // a letter's own values are saved under these ids, and sanitizeParams keeps only those its setting's spec
    // accepts (isCornerId, isJoinId, isEndId and isStrokeId in shared/params/scales.ts): a handle the engine names
    // any other way, or a letter with 100 strokes or turns, would lose its values on the next save
    const styled = (id: string) => STYLES.find(s => s.id === id)!.params;
    const designs: Params[] = [DEFAULTS, styled('blackletter'), styled('modular'), { ...DEFAULTS, cursive: 1 }, { ...DEFAULTS, cursive: 0.45, stencil: 0.5, serif: true },
      { ...DEFAULTS, story: 'single', gForm: 'double', qForm: 'sweep', rForm: 'loop', yForm: 'cup', kForm: 'bar', iForm: 'bars', bowlJoin: 'square', bends: 'round', diagonals: 'arch' }];
    for (const p of designs) for (const [ch, k, id] of handles(p)) assert.ok((SPECS[k] as { ids: (id: string) => boolean }).ids(id), `${ch} ${k} ${id}`);
  });

  // each corner, end, stroke and join a letter offers a control for changes the letter: joins in narrow
  // crotches (K, the waist of B), corners a clip cuts (the top left of N), the ends beside the dot of an i
  for (const [name, p] of Object.entries<Partial<Params>>({ 'as drawn': {}, light: { weight: 0.1 }, heavy: { weight: 0.9 }, 'high contrast': { contrast: 1 }, serif: { serif: true } })) {
    it(`all do something, ${name}`, () => assert.deepEqual(dead({ ...DEFAULTS, ...p }), []));
  }
});
