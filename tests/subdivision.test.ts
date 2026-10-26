import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeFreeFont, packNode, type FreeFontData } from '../shared/engine/free';
import { decodeWeightMasters, parseWeightMasters, type WeightMasterData } from '../shared/source/masters';
import type { MasterSourceRef } from '../shared/source/model';
import { decodeMasterSubdivision, parseMasterSubdivision, type MasterSubdivisionData } from '../shared/source/subdivision';

const from: MasterSourceRef = { kind: 'masters-v1', digest: 'a'.repeat(64), fontId: 'Example:400' };
const to: MasterSourceRef = { kind: 'masters-v1', digest: 'b'.repeat(64), fontId: from.fontId };
const metadata: FreeFontData = { id: from.fontId, family: 'Example', cap: 700, xh: 500, space: 200,
  designers: [], copyright: '', license: '', licenseUrl: '', glyphs: {} };
const oldFont: FreeFontData = { ...metadata, glyphs: { A: [120, [[[0, 0, null, null, 0, 100], [100, 0, 100, 100]]]] } };
const newFont: FreeFontData = { ...metadata, glyphs: { A: [120, [[
  [0, 0, 100 / 3, 0, 0, 50], [50, 75, 25, 75, 75, 75], [100, 0, 100, 50, 200 / 3, 0],
]]] } };
function masters(font: FreeFontData): WeightMasterData {
  return parseWeightMasters({ format: 'weight-masters-v1', source: { kind: 'outline-v1', digest: 'c'.repeat(64), fontId: from.fontId },
    defaultWeight: 400, provenance: [], notes: [], masters: [{ weight: 400, data: font }, { weight: 600, data: { ...font, space: 240 } }] });
}
const definition: MasterSubdivisionData = { format: 'master-subdivision-v1', from, to, glyphs: { A: [[
  { segment: 0, t0: 0, t1: .5 }, { segment: 0, t0: .5, t1: 1 }, { segment: 1, t0: 0, t1: 1 },
]] } };
function decode(data = definition, target = masters(newFont)) {
  return decodeMasterSubdivision(data, { from: { ref: from, masters: decodeWeightMasters(masters(oldFont)) },
    to: { ref: to, masters: decodeWeightMasters(target) } });
}

describe('master subdivision references', () => {
  it('parses a map without loading fonts, then accepts literal exact cubic cuts', () => {
    const data = parseMasterSubdivision(JSON.parse(JSON.stringify(definition)));
    assert.deepEqual(data, definition);
    assert.deepEqual(decode(data).data, definition);
  });

  it('accepts exact closed-contour reversal and reversed parameter intervals', () => {
    const contour = decodeFreeFont(newFont).glyphs.A.contours[0].slice().reverse().map(n => packNode({
      x: n.x, y: n.y, ix: n.ox, iy: n.oy, ox: n.ix, oy: n.iy,
    }));
    const data: MasterSubdivisionData = { ...definition, glyphs: { A: [[
      { segment: 0, t0: 1, t1: .5 }, { segment: 0, t0: .5, t1: 0 }, { segment: 1, t0: 1, t1: 0 },
    ]] } };
    assert.deepEqual(decode(data, masters({ ...newFont, glyphs: { A: [120, [contour]] } })).data, data);
  });

  it('rejects malformed references, parameters and unknown fields at the boundary', () => {
    for (const input of [
      null, { ...definition, format: 'master-subdivision-v2' }, { ...definition, to: from },
      { ...definition, from: { ...from, kind: 'outline-v1' } }, { ...definition, to: { ...to, fontId: 'Other:400' } },
      { ...definition, inferred: true }, { ...definition, glyphs: { AA: [] } }, { ...definition, glyphs: { A: [[]] } },
      ...[-1, 1.1, NaN, Infinity].map(t0 => ({ ...definition, glyphs: { A: [[{ segment: 0, t0, t1: .5 }]] } })),
      { ...definition, glyphs: { A: [[{ segment: .2, t0: 0, t1: 1 }]] } },
      { ...definition, glyphs: { A: [[{ segment: 0, t0: .5, t1: .5 }]] } },
    ]) assert.throws(() => parseMasterSubdivision(input));
  });

  it('requires every target edge and a complete contiguous source traversal', () => {
    for (const ranges of [
      definition.glyphs.A[0].slice(0, 2),
      [{ segment: 0, t0: 0, t1: .4 }, { segment: 0, t0: .5, t1: 1 }, { segment: 1, t0: 0, t1: 1 }],
      [{ segment: 0, t0: 0, t1: .6 }, { segment: 0, t0: .5, t1: 1 }, { segment: 1, t0: 0, t1: 1 }],
      [{ segment: 0, t0: 0, t1: .5 }, { segment: 0, t0: 1, t1: .5 }, { segment: 1, t0: 0, t1: 1 }],
      [{ segment: 0, t0: 0, t1: .5 }, { segment: 0, t0: .5, t1: 1 }, { segment: 9, t0: 0, t1: 1 }],
      definition.glyphs.A[0].slice().reverse(),
    ]) assert.throws(() => decode({ ...definition, glyphs: { A: [ranges] } }), /edge|traversal|orientation|segment|cover/);
    assert.throws(() => decode({ ...definition, glyphs: {} }), /every glyph/);
  });

  it('checks curve controls at every weight rather than only the neutral drawing', () => {
    const bad = structuredClone(masters(newFont));
    bad.masters[1].data.glyphs.A[1][0][1][2] = 26;
    assert.throws(() => decode(definition, bad), /exact curve controls.*600/);
  });

  it('rejects changed metrics, sources, weights and mismatched loaded bases', () => {
    const metric = structuredClone(masters(newFont)); metric.masters[1].data.space++;
    assert.throws(() => decode(definition, metric), /metrics/);
    const advance = structuredClone(masters(newFont)); advance.masters[0].data.glyphs.A[0]++;
    assert.throws(() => decode(definition, advance), /advance/);
    const source = structuredClone(masters(newFont)); source.source = { ...source.source, digest: 'd'.repeat(64) };
    assert.throws(() => decode(definition, source), /source/);
    const weights = structuredClone(masters(newFont)); weights.masters[1].weight = 700;
    assert.throws(() => decode(definition, weights), /weight coordinates/);
    assert.throws(() => decodeMasterSubdivision(definition, { from: { ref: to, masters: decodeWeightMasters(masters(oldFont)) },
      to: { ref: from, masters: decodeWeightMasters(masters(newFont)) } }), /exact source/);
  });
});
