/* A design's name sample, as My designs shows it and a save keeps it (client/lib/name-sample.ts): its outlines
   written short (compactPath) are the engine's to half a unit, and a sample drawn from a font keeps (cleanSample). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanSample } from '../shared/design';
import { buildFont } from '../shared/engine';
import { DEFAULTS, type Params } from '../shared/params';
import { compactPath, drawName, keptSample, withSample } from '../client/lib/name-sample';

/** Path data's points, absolute: the engine's as written (M, L, C, Z), or a compact one's (m, l, c, z). */
function points(d: string) {
  const toks = d.match(/[a-z]|-?\d+(?:\.\d+)?/gi) ?? [], out: number[] = [];
  let x = 0, y = 0, sx = 0, sy = 0, cmd = '';
  for (let i = 0; i < toks.length;) {
    if (/[a-z]/i.test(toks[i])) cmd = toks[i++];
    if (/z/i.test(cmd)) { x = sx; y = sy; continue; }
    const n = /c/i.test(cmd) ? 6 : 2, rel = cmd === cmd.toLowerCase(), ps = toks.slice(i, (i += n)).map(Number);
    for (let k = 0; k < n; k += 2) out.push(ps[k] + (rel ? x : 0), ps[k + 1] + (rel ? y : 0));
    [x, y] = out.slice(-2);
    if (/m/i.test(cmd)) { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
  }
  return out;
}

describe('name samples', () => {
  const fills: Params['fill'][] = ['solid', 'halftone', 'hex', 'blobs'];

  it('writes an outline short, its points the engine\'s to half a unit', () => {
    for (const fill of fills) {
      const f = buildFont({ ...DEFAULTS, fill });
      for (const ch of 'Rag&') {
        const d = f.glyph(ch)!.d, short = compactPath(d)!;
        assert.match(short, /^[mlcz\d -]*$/, `${fill} ${ch}`);
        assert.ok(short.length < d.length * 0.6, `${fill} ${ch}: ${short.length} of ${d.length}`);
        const a = points(d), b = points(short);
        assert.equal(b.length, a.length, `${fill} ${ch}`);
        assert.ok(a.every((v, i) => Math.abs(v - b[i]) <= 0.5), `${fill} ${ch}`);
      }
    }
    assert.equal(compactPath('M0 0Q5 5 10 0Z'), null);
  });

  it('draws a name that keeps, broken onto two lines on a card where that sets it larger', () => {
    for (const fill of fills) {
      const f = buildFont({ ...DEFAULTS, fill }), s = keptSample(f, drawName(f, 'Night Sunrise Dusk'));
      assert.ok(s, fill);
      assert.deepEqual(cleanSample(JSON.parse(JSON.stringify(s))), s);
      assert.equal(s.list.at.length, 16, fill);
      assert.ok(s.list.at.every(([, , y]) => y === 0) && s.list.box[2] > 0 && s.list.box[3] > 0, fill);
      assert.ok(s.card && new Set(s.card.at.map(([, , y]) => y)).size === 2, fill);
    }
    const f = buildFont(DEFAULTS);
    assert.equal(drawName(f, 'Nodes').card, undefined);
  });

  it('goes with a save, of the name and settings saved', () => {
    const input = withSample({ name: 'Heavier', styleId: 'serif', params: { ...DEFAULTS, weight: 0.8 } });
    assert.equal(input.sample?.name, 'Heavier');
    assert.deepEqual(Object.keys(input.sample!.glyphs).sort(), [...new Set('Heavier')].sort());
  });
});
