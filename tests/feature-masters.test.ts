import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { decodeFreeFont, packNode, type FreeFontData } from '../shared/engine/free';
import { FEATURE_CONTROLS, decodeFeatureMasters, evaluateFeatureMasters, featureSupportedGlyphs, parseFeatureMasters, type FeatureControl, type FeatureValues, type FeatureMasterData, type FeatureWidthGrid } from '../shared/source/feature-masters';
import { decodeWeightMasters, interpolateMasters, parseWeightMasters } from '../shared/source/masters';
import type { MasterSourceRef } from '../shared/source/model';
import type { WidthMasterRef } from '../shared/source/program';
import { decodeWidthMasters, interpolateWidthMasters, parseWidthMasters, type WidthMasters } from '../shared/source/width-masters';

const ref: MasterSourceRef = { kind: 'masters-v1', digest: 'a'.repeat(64), fontId: 'Fixture:600' };
const neutral: FeatureValues = { crossbar: .5, tail: .5, terminalLength: .5 };
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
function font(weight: number): FreeFontData {
  const i = (weight - 300) / 300, x = 10 * i;
  return { id: ref.fontId, family: 'Fixture', designers: [], copyright: '', license: 'Fixture', licenseUrl: '', cap: 700, xh: 500, space: 200,
    glyphs: { H: [500 + i * 100, [[[x, 0, null, null, x + 20, 30 + i * 10], [100 + x, 0, 80 + x, 30 + i * 10], [100 + x, 100], [x, 100]]]],
      B: [400, [[[0, 0], [100, 0], [100, 100], [0, 100]]]] } };
}
const basis = decodeWeightMasters(parseWeightMasters({ format: 'weight-masters-v1', source: { kind: 'outline-v1', digest: 'b'.repeat(64), fontId: ref.fontId },
  defaultWeight: 600, masters: [300, 600, 900].map(weight => ({ weight, data: font(weight) })), provenance: [], notes: [] }));
function endpoint(weight: number, dy: number, advance: number): FreeFontData['glyphs'][string] {
  const original = interpolateMasters(basis, weight).glyphs.H;
  return [original.adv + advance, original.contours.map(c => c.map(n => packNode({ ...n, y: n.y + dy,
    ...(n.iy === undefined ? {} : { iy: n.iy + dy }), ...(n.oy === undefined ? {} : { oy: n.oy + dy }),
  })))];
}
function asset(weights = [300, 600, 900]) {
  return parseFeatureMasters({ format: 'feature-masters-v1', base: ref, weightRange: [weights[0], weights[weights.length - 1]], widthCompatibility: 'base-only',
    controls: [{ control: 'crossbar', glyphs: [{ glyph: 'H', masters: weights.map(weight => {
      const i = (weight - 300) / 300;
      return { weight, low: endpoint(weight, -10 - 10 * i, -10 - 10 * i), high: endpoint(weight, 30 + 20 * i, 20 + 20 * i) };
    }) }] }], notes: [] });
}
const bind = (data = asset()) => decodeFeatureMasters(data, { ref, masters: basis });

describe('sparse authored feature assets', () => {
  it('uses literal endpoints and interpolated handles while retaining the complete supplied baseline', () => {
    const features = bind(), baseline = structuredClone(interpolateMasters(basis, 750));
    baseline.space = 217; baseline.glyphs.H.adv += 11;
    const n = baseline.glyphs.H.contours[0][0]; n.x += 7; n.y += 3;
    assert.ok(n.ox !== undefined && n.oy !== undefined); n.ox += 7; n.oy += 3;
    const made = evaluateFeatureMasters(features, { baseline, weight: 750, width: null, values: { ...neutral, crossbar: 1 } });
    assert.equal(made.glyphs.H.adv, 711);
    assert.deepEqual(packNode(made.glyphs.H.contours[0][0]), [22, 63, null, null, 42, 108]);
    assert.equal(made.space, 217);
    assert.strictEqual(made.glyphs.B, baseline.glyphs.B);
    assert.deepEqual(made.glyphs.H.contours[0][0].authored, { digest: ref.digest, glyph: 'H', contour: 0, segment: 0, t: 0, segments: 4 });
    assert.deepEqual(packNode(baseline.glyphs.H.contours[0][0]), [22, 3, null, null, 42, 48]);
    const source = interpolateMasters(basis, 600), low = evaluateFeatureMasters(features, { baseline: source, weight: 600, width: null, values: { ...neutral, crossbar: 0 } });
    assert.equal(low.glyphs.H.adv, 580);
    assert.deepEqual(packNode(low.glyphs.H.contours[0][0]), [10, -20, null, null, 30, 20]);
  });

  it('returns the identical neutral baseline outside feature coverage and rejects unreviewed active coordinates', () => {
    const features = bind(asset([300, 600])), baseline = interpolateMasters(basis, 900);
    assert.strictEqual(evaluateFeatureMasters(features, { baseline, weight: 900, width: 90, values: neutral }), baseline);
    assert.deepEqual(featureSupportedGlyphs(features, 'crossbar'), ['H']);
    assert.deepEqual(featureSupportedGlyphs(features, 'tail'), []);
    assert.throws(() => evaluateFeatureMasters(features, { baseline, weight: 900, width: null, values: { ...neutral, crossbar: 1 } }), /interval/);
    assert.throws(() => evaluateFeatureMasters(features, { baseline, weight: 600, width: 90, values: { ...neutral, crossbar: 1 } }), /width/);
    for (const weight of [NaN, 0, 1000]) assert.throws(() => evaluateFeatureMasters(features, { baseline, weight, width: null, values: neutral }), /basis/);
    for (const crossbar of [NaN, -.1, 1.1]) assert.throws(() => evaluateFeatureMasters(features, { baseline, weight: 600, width: null, values: { ...neutral, crossbar } }), /0\.\.1/);
  });

  it('validates the exact base, weight bends, sparse coverage, and every handle', () => {
    const data = asset();
    assert.throws(() => decodeFeatureMasters(data, { ref: { ...ref, digest: 'c'.repeat(64) }, masters: basis }), /immutable base/);
    assert.throws(() => decodeFeatureMasters(data, { ref: { ...ref, fontId: 'Other:600' }, masters: basis }), /immutable base/);
    assert.throws(() => bind(asset([300, 900])), /skip a base weight knot/);
    const absent = structuredClone(data); absent.controls[0].glyphs[0].glyph = 'Z';
    assert.throws(() => bind(absent), /absent/);
    const count = structuredClone(data); count.controls[0].glyphs[0].masters[0].low[1][0].push([0, 1]);
    assert.throws(() => bind(count), /contours and handles/);
    const handle = structuredClone(data); handle.controls[0].glyphs[0].masters[0].high[1][0][0] = [0, 0];
    assert.throws(() => bind(handle), /contours and handles/);
    const unchanged = structuredClone(data);
    unchanged.controls[0].glyphs[0].masters.forEach(sample => { sample.low = endpoint(sample.weight, 0, 0); sample.high = endpoint(sample.weight, 0, 0); });
    assert.throws(() => bind(unchanged), /unchanged glyph/);
  });

  it('rejects unknown controls, duplicate coverage, malformed geometry, and non-increasing samples at the boundary', () => {
    const data = asset(), entry = data.controls[0], glyph = entry.glyphs[0];
    assert.throws(() => parseFeatureMasters({ ...data, controls: [{ ...entry, control: 'mystery' }] }), /Unknown feature control/);
    assert.throws(() => parseFeatureMasters({ ...data, controls: [entry, entry] }), /Duplicate feature control/);
    assert.throws(() => parseFeatureMasters({ ...data, controls: [{ ...entry, glyphs: [glyph, glyph] }] }), /duplicate feature glyph/);
    assert.throws(() => parseFeatureMasters({ ...data, controls: [] }), /authored control/);
    assert.throws(() => parseFeatureMasters({ ...data, widthCompatibility: 'all-widths' }), /domain/);
    assert.throws(() => parseFeatureMasters({ ...data, base: { ...ref, kind: 'outline-v1' } }), /domain/);
    const malformed = structuredClone(data); malformed.controls[0].glyphs[0].masters[0].low[1][0][0][0] = Infinity;
    assert.throws(() => parseFeatureMasters(malformed), /finite/);
    const duplicate = structuredClone(data); duplicate.controls[0].glyphs[0].masters[1].weight = 300;
    assert.throws(() => parseFeatureMasters(duplicate), /ordered/);
    const outside = structuredClone(data); outside.weightRange = [299, 900]; outside.controls[0].glyphs[0].masters[0].weight = 299;
    assert.throws(() => bind(parseFeatureMasters(outside)), /exceeds/);
  });

  it('allows independent coordinate changes and rejects shared coordinate or advance writes', () => {
    const data = asset(), xControl = structuredClone(data.controls[0]); xControl.control = 'tail';
    for (const sample of xControl.glyphs[0].masters) {
      const make = (dx: number): FreeFontData['glyphs'][string] => {
        const d = interpolateMasters(basis, sample.weight).glyphs.H;
        return [d.adv, d.contours.map(c => c.map(n => packNode({ ...n, x: n.x + dx,
          ...(n.ix === undefined ? {} : { ix: n.ix + dx }), ...(n.ox === undefined ? {} : { ox: n.ox + dx }),
        })))];
      };
      sample.low = make(-25); sample.high = make(25);
    }
    data.controls.push(xControl);
    const features = bind(data), made = evaluateFeatureMasters(features, { baseline: interpolateMasters(basis, 750), weight: 750, width: null, values: { ...neutral, crossbar: 1, tail: 1 } });
    assert.deepEqual(packNode(made.glyphs.H.contours[0][0]), [40, 60, null, null, 60, 105]);
    const sharedAdvance = structuredClone(data); sharedAdvance.controls[1].glyphs[0].masters[0].high[0] += 1;
    assert.throws(() => bind(sharedAdvance), /shared coordinates or advances/);
    const sharedPoint = structuredClone(data); sharedPoint.controls[1].glyphs[0].masters[0].high[1][0][0][1] += 1;
    assert.throws(() => bind(sharedPoint), /shared coordinates or advances/);
  });

  it('retains canonical point provenance and refuses a split or foreign-glyph baseline', () => {
    const features = bind(), baseline = structuredClone(interpolateMasters(basis, 600));
    const origin = { digest: ref.digest, glyph: 'H', contour: 0, segment: 0, t: 0, segments: 4 };
    baseline.glyphs.H.contours[0][0].authored = origin;
    const request = { baseline, weight: 600, width: null, values: { ...neutral, crossbar: 1 } } satisfies Parameters<typeof evaluateFeatureMasters>[1];
    assert.strictEqual(evaluateFeatureMasters(features, request).glyphs.H.contours[0][0].authored, origin);
    origin.glyph = 'B';
    assert.throws(() => evaluateFeatureMasters(features, request), /canonical source point basis/);
    origin.glyph = 'H'; baseline.glyphs.H.contours[0].push({ x: 50, y: 50 });
    assert.throws(() => evaluateFeatureMasters(features, request), /contours and handles/);
  });
});

describe('published partial feature drawings', () => {
  it('pins sparse assets and reproduces every authored endpoint literally', () => {
    const directory = new URL('../fonts/features/', import.meta.url), files = readdirSync(directory).filter(file => /^[a-f0-9]{64}\.json$/.test(file));
    assert.ok(files.length >= 3);
    const families = new Set<string>();
    for (const file of files) {
      const bytes = readFileSync(new URL(file, directory));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.slice(0, -5));
      const data = parseFeatureMasters(JSON.parse(bytes.toString())), masterBytes = readFileSync(new URL(`../fonts/masters/${data.base.digest}.json`, import.meta.url));
      families.add(data.base.fontId);
      assert.equal(createHash('sha256').update(masterBytes).digest('hex'), data.base.digest);
      const basis = decodeWeightMasters(parseWeightMasters(JSON.parse(masterBytes.toString()))), dependency = { ref: data.base, masters: basis };
      let width: { ref: WidthMasterRef; masters: WidthMasters } | undefined;
      if (data.widthCompatibility !== 'base-only') {
        const ref = data.widthCompatibility.width, content = readFileSync(new URL(`../fonts/widths/${ref.digest}.json`, import.meta.url));
        assert.equal(createHash('sha256').update(content).digest('hex'), ref.digest);
        width = { ref, masters: decodeWidthMasters(parseWidthMasters(JSON.parse(content.toString()), dependency), basis) };
      }
      const features = decodeFeatureMasters(data, dependency, width);
      const pilot = data.widthCompatibility === 'base-only' && ['Couture:600', 'Hearth:600', 'Mainline:600'].includes(data.base.fontId);
      const expected: Record<FeatureControl, string[]> = pilot
        ? { crossbar: ['H', 'A'], tail: ['R'], terminalLength: ['c'] }
        : { crossbar: ['H'], tail: [], terminalLength: [] };
      for (const key of FEATURE_CONTROLS) assert.deepEqual(featureSupportedGlyphs(features, key), expected[key]);
      const columns: { width: number | null; controls: FeatureMasterData['controls'] }[] = [{ width: width?.masters.data.axis.neutral ?? null, controls: data.controls }, ...(data.widthCompatibility === 'base-only' ? [] : data.widthCompatibility.columns)];
      for (const column of columns) for (const entry of column.controls) for (const glyph of entry.glyphs) for (const master of glyph.masters) for (const [value, expected] of [[0, master.low], [1, master.high]] satisfies [number, FreeFontData['glyphs'][string]][]) {
        const baseline = width && column.width !== null ? interpolateWidthMasters(width.masters, master.weight, column.width) : interpolateMasters(basis, master.weight);
        const made = evaluateFeatureMasters(features, { baseline, weight: master.weight, width: column.width, values: { ...neutral, [entry.control]: value } });
        const actual = made.glyphs[glyph.glyph];
        assert.deepEqual([actual.adv, actual.contours.map(c => c.map(packNode))], expected);
        assert.equal(actual.contours[0][0].authored?.digest, data.base.digest);
        assert.equal(actual.contours[0][0].authored?.glyph, glyph.glyph);
        for (const [ch, d] of Object.entries(baseline.glyphs)) if (!featureSupportedGlyphs(features, entry.control).includes(ch)) assert.strictEqual(made.glyphs[ch], d);
      }
      const weight = (data.weightRange[0] + data.weightRange[1]) / 2;
      const coordinate = width ? (width.masters.data.axis.min + width.masters.data.axis.max) / 2 : null;
      const baseline = width && coordinate !== null ? interpolateWidthMasters(width.masters, weight, coordinate) : interpolateMasters(basis, weight);
      const mid = evaluateFeatureMasters(features, { baseline, weight, width: coordinate, values: { crossbar: .75, tail: .25, terminalLength: .75 } });
      for (const ch of 'HARc') for (const c of mid.glyphs[ch].contours) for (const n of c) for (const value of packNode(n)) if (value !== null) assert.ok(Number.isFinite(value));
      near(mid.space, baseline.space);
    }
    for (const family of ['Almanac:500', 'Bulwark:700', 'Compass:300', 'Couture:600', 'Dispatch:400', 'Hearth:600', 'Kernel:500', 'Mainline:600', 'Orbital:600', 'Vellum:400']) assert.ok(families.has(family));
  });
});

const widthRef: WidthMasterRef = { kind: 'width-masters-v1', digest: 'd'.repeat(64), fontId: ref.fontId };
function wideFont(weight: number, width: number): FreeFontData {
  const original = font(weight), dy = width < 100 ? 4 : -6, decoded = decodeFreeFont(original);
  const glyphs: FreeFontData['glyphs'] = {};
  for (const [ch, drawing] of Object.entries(decoded.glyphs)) glyphs[ch] = [drawing.adv * width / 100, drawing.contours.map(c => c.map(n => packNode({ ...n,
    x: n.x * width / 100, y: n.y + dy,
    ...(n.ix === undefined || n.iy === undefined ? {} : { ix: n.ix * width / 100, iy: n.iy + dy }),
    ...(n.ox === undefined || n.oy === undefined ? {} : { ox: n.ox * width / 100, oy: n.oy + dy }),
  })))];
  return { ...original, space: original.space * width / 100, glyphs };
}
const widthData = parseWidthMasters({ format: 'width-masters-v1', base: ref, axis: { min: 80, neutral: 100, max: 140 },
  columns: [80, 140].map(width => ({ width, masters: [300, 600, 900].map(weight => ({ weight, space: wideFont(weight, width).space, glyphs: wideFont(weight, width).glyphs })) })),
  provenance: [], notes: [] }, { ref, masters: basis });
const widthBasis = decodeWidthMasters(widthData, basis), widthDependency = { ref: widthRef, masters: widthBasis };
function jointAsset() {
  const root = asset();
  return parseFeatureMasters({ ...root, widthCompatibility: { kind: 'joint-grid', width: widthRef, columns: [80, 140].map(width => ({ width,
    controls: root.controls.map(control => ({ ...control, glyphs: control.glyphs.map(glyph => ({ ...glyph, masters: glyph.masters.map(sample => {
      const i = (sample.weight - 300) / 300, source = interpolateWidthMasters(widthBasis, sample.weight, width).glyphs.H;
      const make = (dy: number, adv: number): FreeFontData['glyphs'][string] => [source.adv + adv * width / 100, source.contours.map(c => c.map(n => packNode({ ...n, y: n.y + dy,
        ...(n.iy === undefined ? {} : { iy: n.iy + dy }), ...(n.oy === undefined ? {} : { oy: n.oy + dy }),
      })))];
      return { weight: sample.weight, low: make(-10 - 10 * i + (width - 100) / 2, -10 - 10 * i), high: make(30 + 20 * i + (width - 100) / 2, 20 + 20 * i) };
    }) })) })),
  })) } });
}
const bindJoint = (data = jointAsset()) => decodeFeatureMasters(data, { ref, masters: basis }, widthDependency);

describe('joint native-width feature drawings', () => {
  it('interpolates weight, width, bar amount, handles, and advance against the current width baseline', () => {
    const features = bindJoint(), baseline = interpolateWidthMasters(widthBasis, 750, 120);
    const high = evaluateFeatureMasters(features, { baseline, weight: 750, width: 120, values: { ...neutral, crossbar: 1 } });
    assert.equal(high.glyphs.H.adv, 840);
    assert.deepEqual(packNode(high.glyphs.H.contours[0][0]), [18, 67, null, null, 42, 112]);
    const mid = evaluateFeatureMasters(features, { baseline, weight: 750, width: 120, values: { ...neutral, crossbar: .75 } });
    assert.equal(mid.glyphs.H.adv, 810);
    assert.deepEqual(packNode(mid.glyphs.H.contours[0][0]), [18, 32, null, null, 42, 77]);
    assert.strictEqual(mid.glyphs.B, baseline.glyphs.B);
    assert.equal(mid.space, baseline.space);
    assert.deepEqual(mid.glyphs.H.contours[0][0].authored, { digest: ref.digest, glyph: 'H', contour: 0, segment: 0, t: 0, segments: 4 });
    assert.strictEqual(evaluateFeatureMasters(features, { baseline, weight: 750, width: 120, values: neutral }), baseline);
  });

  it('returns literal joint endpoints and preserves baseline edits without adding the width displacement twice', () => {
    const features = bindJoint(), data = jointAsset();
    assert.notEqual(data.widthCompatibility, 'base-only');
    if (data.widthCompatibility === 'base-only') throw Error('Missing fixture grid');
    for (const column of data.widthCompatibility.columns) for (const sample of column.controls[0].glyphs[0].masters) for (const [value, expected] of [[0, sample.low], [1, sample.high]] satisfies [number, FreeFontData['glyphs'][string]][]) {
      const baseline = interpolateWidthMasters(widthBasis, sample.weight, column.width), made = evaluateFeatureMasters(features, { baseline, weight: sample.weight, width: column.width, values: { ...neutral, crossbar: value } });
      assert.deepEqual([made.glyphs.H.adv, made.glyphs.H.contours.map(c => c.map(packNode))], expected);
    }
    const baseline = structuredClone(interpolateWidthMasters(widthBasis, 750, 120));
    baseline.glyphs.H.adv += 11; baseline.glyphs.H.contours[0][0].y += 3;
    const made = evaluateFeatureMasters(features, { baseline, weight: 750, width: 120, values: { ...neutral, crossbar: 1 } });
    assert.equal(made.glyphs.H.adv, 851);
    assert.equal(made.glyphs.H.contours[0][0].y, 70);
    for (const width of [null, 79, 141, NaN]) assert.throws(() => evaluateFeatureMasters(features, { baseline, weight: 750, width, values: { ...neutral, crossbar: 1 } }), /width/);
  });

  it('binds the exact native-width reference and all width knots, glyph coverage, weight knots, and handles', () => {
    const data = jointAsset();
    assert.throws(() => decodeFeatureMasters(data, { ref, masters: basis }), /exact native-width/);
    assert.throws(() => decodeFeatureMasters(data, { ref, masters: basis }, { ...widthDependency, ref: { ...widthRef, digest: 'f'.repeat(64) } }), /exact native-width/);
    assert.throws(() => decodeFeatureMasters(data, { ref, masters: basis }, { ...widthDependency, ref: { ...widthRef, fontId: 'Other:600' } }), /exact native-width/);
    const change = (mutate: (grid: FeatureWidthGrid) => void) => {
      const changed = structuredClone(data);
      if (changed.widthCompatibility === 'base-only') throw Error('Missing fixture grid');
      mutate(changed.widthCompatibility); return changed;
    };
    assert.throws(() => bindJoint(change(grid => grid.columns.pop())), /every native-width knot/);
    assert.throws(() => bindJoint(change(grid => grid.columns[0].width = 90)), /every native-width knot/);
    assert.throws(() => bindJoint(change(grid => grid.columns[0].controls[0].glyphs[0].glyph = 'B')), /identical controls/);
    assert.throws(() => bindJoint(change(grid => grid.columns[0].controls[0].glyphs[0].masters.splice(1, 1))), /weight knots/);
    assert.throws(() => bindJoint(change(grid => grid.columns[0].controls[0].glyphs[0].masters[0].high[1][0][0] = [0, 0])), /contours and handles/);
    const extraBend = parseWidthMasters({ ...widthData, columns: widthData.columns.map(column => ({ ...column,
      masters: [300, 450, 600, 900].map(weight => ({ weight, space: wideFont(weight, column.width).space, glyphs: wideFont(weight, column.width).glyphs })),
    })) }, { ref, masters: basis });
    assert.throws(() => decodeFeatureMasters(data, { ref, masters: basis }, { ref: widthRef, masters: decodeWidthMasters(extraBend, basis) }), /skip a base weight knot/);
    const duplicate = change(grid => grid.columns[1].width = 80);
    assert.throws(() => parseFeatureMasters(duplicate), /ordered and distinct/);
    assert.throws(() => parseFeatureMasters({ ...data, widthCompatibility: { kind: 'orthogonal-y', width: widthRef } }), /field|dependency/);
  });

  it('detects coordinate ownership conflicts introduced only in a width column', () => {
    const data = jointAsset();
    if (data.widthCompatibility === 'base-only') throw Error('Missing fixture grid');
    const columns = [{ width: 100, controls: data.controls }, ...data.widthCompatibility.columns];
    for (const column of columns) {
      const tail = structuredClone(column.controls[0]); tail.control = 'tail';
      for (const sample of tail.glyphs[0].masters) {
        const drawing = interpolateWidthMasters(widthBasis, sample.weight, column.width).glyphs.H;
        const make = (dx: number): FreeFontData['glyphs'][string] => [drawing.adv, drawing.contours.map(c => c.map(n => packNode({ ...n, x: n.x + dx,
          ...(n.ix === undefined ? {} : { ix: n.ix + dx }), ...(n.ox === undefined ? {} : { ox: n.ox + dx }),
        })))];
        sample.low = make(-10); sample.high = make(10);
      }
      column.controls.push(tail);
    }
    assert.deepEqual(featureSupportedGlyphs(bindJoint(data), 'tail'), ['H']);
    data.widthCompatibility.columns[0].controls[0].glyphs[0].masters[0].high[1][0][0][0] += 1;
    assert.throws(() => bindJoint(data), /shared coordinates or advances/);
  });
});
