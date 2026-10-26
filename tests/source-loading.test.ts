/* A program becomes usable only after its complete immutable dependency set has loaded. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import type { FreeFontData } from '../shared/engine/free';
import { DEFAULTS, drawnAtOf, type Params } from '../shared/params';
import { designSourceRefs } from '../shared/source/dependencies';
import { parseFeatureMasters } from '../shared/source/feature-masters';
import type { WeightMasterData } from '../shared/source/masters';
import type { MasterSourceRef, ProgramSourceRef } from '../shared/source/model';
import type { FeatureMasterRef, SourceProgramData, WidthMasterRef } from '../shared/source/program';
import { onSource, registerSource, sourceFont, sourceMasters, sourceProgram, sourceReady } from '../shared/source/registry';
import type { WidthMasterData } from '../shared/source/width-masters';
import { loadDesignSources, loadSource, retrySource, sourceError } from '../client/lib/sources';
import { fontFor, useEditor } from '../client/state/editor';
import { PROGRAM_REVISIONS } from '../shared/source/program-catalog';
import { loadSource as loadServerSource, sourcePayload } from '../server/sources';

const digest = (label: string) => createHash('sha256').update(label).digest('hex');
function fixture(label: string, asset: 'width' | 'features' = 'width') {
  const fontId = `Loader${label}:400`;
  const base: MasterSourceRef = { kind: 'masters-v1', digest: digest(`${label}-base`), fontId };
  const ref: ProgramSourceRef = { kind: 'program-v1', digest: digest(`${label}-program`), fontId };
  const width: WidthMasterRef = { kind: 'width-masters-v1', digest: digest(`${label}-width`), fontId };
  const features: FeatureMasterRef = { kind: 'feature-masters-v1', digest: digest(`${label}-features`), fontId };
  const font: FreeFontData = { id: fontId, family: `Loader${label}`, designers: [], copyright: '', license: '', licenseUrl: '', cap: 700, xh: 500, space: 200,
    glyphs: { A: [500, [[[40, 0], [40, 700], [400, 700], [400, 0]]]] } };
  const masterData: WeightMasterData = { format: 'weight-masters-v1', source: { kind: 'outline-v1', digest: digest(`${label}-outline`), fontId },
    defaultWeight: 400, masters: [{ weight: 400, data: font }, { weight: 600, data: font }], provenance: [], notes: [] };
  const widthData: WidthMasterData = { format: 'width-masters-v1', base, axis: { min: 80, neutral: 100, max: 120 }, provenance: [], notes: [],
    columns: [80, 120].map(width => ({ width, masters: [400, 600].map(weight => ({ weight, space: 2 * width,
      glyphs: { A: [5 * width, [[[40, 0], [40, 700], [4 * width, 700], [4 * width, 0]]]] } })) })) };
  const featureData = parseFeatureMasters({ format: 'feature-masters-v1', base, weightRange: [400, 600], widthCompatibility: 'base-only', notes: [],
    controls: [{ control: 'crossbar', glyphs: [{ glyph: 'A', masters: [400, 600].map(weight => ({ weight,
      low: [500, [[[40, 0], [40, 660], [400, 700], [400, 0]]]], high: [500, [[[40, 0], [40, 740], [400, 700], [400, 0]]]] })) }] }] });
  const data: SourceProgramData = { format: 'source-program-v1', base, width: asset === 'width' ? width : null, features: asset === 'features' ? features : null };
  const payloads = new Map<string, unknown>([[ref.digest, data], [base.digest, masterData], [width.digest, widthData], [features.digest, featureData]]);
  return { ref, base, width, features, font, masterData, widthData, featureData, data, payloads };
}
function response(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } }); }
const requestedDigest = (input: string | URL | Request) => String(input).split('/').at(-1) ?? '';

describe('source-program registration', () => {
  it('publishes the neutral font, master basis and complete program together after all dependencies validate', () => {
    const f = fixture('Atomic', 'features');
    let notifications = 0;
    const unsubscribe = onSource(digest => {
      if (digest !== f.ref.digest) return;
      notifications++;
      assert.equal(sourceProgram(f.ref)?.width, null);
      assert.ok(sourceProgram(f.ref)?.features);
      assert.equal(sourceFont(f.ref), sourceFont(f.base));
      assert.equal(sourceMasters(f.ref), sourceMasters(f.base));
    });
    try {
      assert.throws(() => registerSource(f.ref, f.data), /weight masters first/);
      assert.equal(sourceReady(f.ref), false);
      registerSource(f.base, f.masterData);
      assert.throws(() => registerSource(f.ref, f.data), /feature masters/);
      registerSource(f.width, f.widthData);
      assert.throws(() => registerSource(f.ref, f.data), /feature masters/);
      assert.equal(sourceFont(f.ref), undefined);
      assert.equal(sourceProgram(f.ref), undefined);
      assert.equal(notifications, 0);
      registerSource(f.features, f.featureData);
      registerSource(f.ref, f.data);
      registerSource(f.ref, f.data);
      assert.equal(notifications, 1);
      assert.equal(sourceFont(f.ref)?.glyphs.A.adv, 500);
      assert.deepEqual(sourceProgram(f.ref)?.data, f.data);
      assert.equal(sourceFont({ ...f.ref, kind: 'masters-v1' }), undefined);
      assert.equal(sourceFont({ ...f.ref, fontId: 'Wrong:400' }), undefined);
    } finally { unsubscribe(); }
  });

  it('rejects width or feature assets for another revision of the same family', () => {
    const f = fixture('Exact');
    const other: MasterSourceRef = { ...f.base, digest: digest('Exact-other-base') };
    registerSource(f.base, f.masterData);
    registerSource(other, f.masterData);
    registerSource(f.width, { ...f.widthData, base: other });
    registerSource(f.features, { ...f.featureData, base: other });
    assert.throws(() => registerSource(f.ref, { ...f.data, features: null }), /exact master base/);
    assert.throws(() => registerSource(f.ref, { ...f.data, width: null, features: f.features }), /exact master base/);
    assert.equal(sourceReady(f.ref), false);
    assert.equal(sourceMasters(f.ref), undefined);
    assert.throws(() => registerSource({ ...f.width, fontId: 'Wrong:400' }, f.widthData), /master font/);
  });

  it('refuses unreviewed width and feature combinations before publishing readiness', () => {
    const f = fixture('Interaction');
    registerSource(f.base, f.masterData);
    registerSource(f.width, f.widthData);
    registerSource(f.features, f.featureData);
    assert.throws(() => registerSource(f.ref, { ...f.data, features: f.features }), /reviewed interaction/);
    assert.equal(sourceReady(f.ref), false);
    assert.equal(sourceFont(f.ref), undefined);
    assert.equal(sourceProgram(f.ref), undefined);
  });

  it('keeps narrower feature assets valid but refuses a program that exposes the full weight slider', () => {
    const f = fixture('ShortRange', 'features'), shorter = structuredClone(f.featureData);
    shorter.weightRange = [450, 550];
    shorter.controls[0].glyphs[0].masters[0].weight = 450;
    shorter.controls[0].glyphs[0].masters[1].weight = 550;
    registerSource(f.base, f.masterData);
    registerSource(f.features, shorter);
    assert.equal(sourceReady(f.features), true);
    assert.throws(() => registerSource(f.ref, f.data), /complete base weight range/);
    assert.equal(sourceReady(f.ref), false);
    assert.equal(sourceFont(f.ref), undefined);
  });
});

describe('browser source dependencies', () => {
  it('loads both point bases before their map and retries a map returned for the wrong predecessor', async t => {
    const f = fixture('Transition');
    const from: MasterSourceRef = { ...f.base, digest: digest('Transition-from') };
    const wrong: MasterSourceRef = { ...f.base, digest: digest('Transition-wrong') };
    const mapping = { kind: 'master-subdivision-v1', digest: digest('Transition-map'), fontId: f.base.fontId } as const;
    f.data.transitions = [{ from, mapping }];
    const subdivision = { format: 'master-subdivision-v1', from, to: f.base,
      glyphs: { A: [[0, 1, 2, 3].map(segment => ({ segment, t0: 0, t1: 1 }))] } };
    f.payloads.set(from.digest, f.masterData);
    let corrupt = true;
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const id = requestedDigest(input);
      if (id === mapping.digest) {
        assert.equal(sourceReady(from), true);
        assert.equal(sourceReady(f.base), true);
        return response({ ...subdivision, from: corrupt ? wrong : from });
      }
      return response(f.payloads.get(id));
    });
    assert.equal(await loadSource(f.ref), false);
    assert.match(sourceError(f.ref) ?? '', /previous master base/);
    assert.equal(sourceReady(mapping), false);
    assert.equal(sourceReady(f.ref), false);
    corrupt = false;
    assert.equal(await retrySource(f.ref), true);
    assert.deepEqual(sourceProgram(f.ref)?.transitions.get(from.digest)?.data, subdivision);
  });

  it('loads joint feature masters after the precise width package they were authored against', async t => {
    const f = fixture('Joint');
    f.data.features = f.features;
    const joint = parseFeatureMasters({ ...f.featureData, widthCompatibility: { kind: 'joint-grid', width: f.width,
      columns: f.widthData.columns.map(column => ({ width: column.width, controls: [{ control: 'crossbar', glyphs: [{ glyph: 'A',
        masters: column.masters.map(master => {
          const low = structuredClone(master.glyphs.A), high = structuredClone(master.glyphs.A);
          low[1][0][1][1] = 660; high[1][0][1][1] = 740;
          return { weight: master.weight, low, high };
        }) }] }] })) } });
    f.payloads.set(f.features.digest, joint);
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const id = requestedDigest(input);
      if (id === f.features.digest) assert.equal(sourceReady(f.width), true);
      return response(f.payloads.get(id));
    });
    assert.equal(await loadSource(f.ref), true, sourceError(f.ref));
    assert.ok(sourceProgram(f.ref)?.features?.width);
    assert.throws(() => registerSource({ ...f.ref, digest: digest('Joint-without-width') }, { ...f.data, width: null }), /exact reviewed feature width/);
  });

  it('deduplicates current and saved Points sources by their complete reference', () => {
    const f = fixture('FrameRefs', 'features');
    const p: Params = { ...DEFAULTS, sourceProgram: f.base, outlines: {} };
    const drawing = { adv: 500, contours: [[{ x: 0, y: 0 }, { x: 0, y: 700 }, { x: 400, y: 0 }]] };
    p.outlines = {
      A: { ...drawing, at: drawnAtOf({ ...p, sourceProgram: f.ref }, 'A') },
      B: { ...drawing, at: drawnAtOf({ ...p, sourceProgram: f.ref }, 'B') },
      C: { ...drawing, at: drawnAtOf({ ...p, sourceProgram: { ...f.base, kind: 'outline-v1' } }, 'C') },
    };
    assert.deepEqual(designSourceRefs(p), [f.base, f.ref, { ...f.base, kind: 'outline-v1' }]);
    assert.deepEqual(designSourceRefs({ ...p, sourceProgram: null }), []);
  });

  it('retries a missing saved Points baseline and redraws when that earlier program arrives', async t => {
    const f = fixture('SavedFrame', 'features'), previous = useEditor.getState();
    t.after(() => useEditor.setState(previous));
    let failed = true;
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const id = requestedDigest(input);
      return id === f.features.digest && failed ? response({ error: 'Saved feature frame is temporarily unavailable' }, 503) : response(f.payloads.get(id));
    });
    assert.equal(await loadSource(f.base), true);
    const p: Params = { ...DEFAULTS, sourceProgram: f.base, freeFont: f.base.fontId, outlines: {} };
    p.outlines = { A: { adv: 500, contours: [[{ x: 40, y: 0 }, { x: 40, y: 700 }, { x: 400, y: 700 }, { x: 400, y: 0 }]],
      at: drawnAtOf({ ...p, sourceProgram: f.ref }, 'A') } };
    useEditor.setState({ params: p });
    assert.deepEqual(fontFor(p).source, { ref: f.ref, state: 'missing', missingCharacters: [] });
    assert.equal(await loadDesignSources(p), false);
    assert.match(sourceError(f.ref) ?? '', /Saved feature frame is temporarily unavailable/);
    assert.equal(fontFor(p).glyph('A'), null);
    failed = false;
    assert.equal(await retrySource(f.ref), true);
    assert.notEqual(useEditor.getState().params, p, 'arrival of the earlier program refreshes the open design');
    assert.equal(fontFor(useEditor.getState().params).source?.state, 'ready');
    assert.equal(sourceError(f.ref), undefined);
  });

  it('keeps the program missing while one asset is still in flight and shares concurrent requests', async t => {
    const f = fixture('Pending', 'features'), requested: string[] = [];
    let release: (value: Response) => void = () => { throw new Error('Pending response is not initialized'); };
    const pending = new Promise<Response>(resolve => { release = resolve; });
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const id = requestedDigest(input); requested.push(id);
      return id === f.features.digest ? pending : response(f.payloads.get(id));
    });
    const first = loadSource(f.ref), second = loadSource(f.ref);
    assert.equal(first, second);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requested, [f.ref.digest, f.base.digest, f.features.digest]);
    assert.equal(sourceReady(f.base), true);
    assert.equal(sourceReady(f.features), false);
    assert.equal(sourceReady(f.ref), false);
    assert.equal(sourceFont(f.ref), undefined);
    release(response(f.featureData));
    assert.equal(await first, true);
    assert.equal(sourceReady(f.ref), true);
    assert.ok(sourceProgram(f.ref)?.features);
    assert.equal(sourceError(f.ref), undefined);
  });

  it('reports the failed dependency and retries it while retaining completed immutable assets', async t => {
    const f = fixture('Retry'), counts = new Map<string, number>();
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const id = requestedDigest(input), count = (counts.get(id) ?? 0) + 1; counts.set(id, count);
      return id === f.width.digest && count === 1 ? response({ error: 'Width package is temporarily unavailable' }, 503) : response(f.payloads.get(id));
    });
    assert.equal(await loadSource(f.ref), false);
    assert.match(sourceError(f.ref) ?? '', /width masters.*temporarily unavailable/);
    assert.equal(sourceFont(f.ref), undefined);
    assert.equal(sourceReady(f.base), true);
    assert.equal(await loadSource(f.ref), false);
    assert.equal(counts.get(f.width.digest), 1, 'failed requests wait for an explicit retry');
    assert.equal(await retrySource(f.ref), true);
    assert.equal(sourceError(f.ref), undefined);
    assert.equal(sourceFont(f.ref)?.glyphs.A.adv, 500);
    assert.equal(counts.get(f.ref.digest), 2);
    assert.equal(counts.get(f.width.digest), 2);
    assert.equal(counts.get(f.base.digest), 1);
    assert.equal(counts.get(f.features.digest), undefined);
  });

  it('does not cache an asset received for the wrong base, so a retry can repair the response', async t => {
    const f = fixture('Corrupt'), other: MasterSourceRef = { ...f.base, digest: digest('Corrupt-other-base') };
    registerSource(other, f.masterData);
    let wrong = true;
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const id = requestedDigest(input);
      return response(id === f.width.digest && wrong ? { ...f.widthData, base: other } : f.payloads.get(id));
    });
    assert.equal(await loadSource(f.ref), false);
    assert.match(sourceError(f.ref) ?? '', /exact master base/);
    assert.equal(sourceReady(f.width), false);
    assert.equal(sourceReady(f.ref), false);
    wrong = false;
    assert.equal(await retrySource(f.ref), true);
    assert.deepEqual(sourceProgram(f.ref)?.width?.data.base, f.base);
  });
});

describe('published source dependencies', () => {
  it('serves each manifest and authored asset while workers receive the neutral base font', () => {
    assert.ok(PROGRAM_REVISIONS.length > 0);
    for (const program of PROGRAM_REVISIONS) {
      assert.deepEqual(sourcePayload(program.ref), program.data);
      assert.equal(loadServerSource(program.ref), loadServerSource(program.data.base));
      assert.equal(sourceFont(program.ref), sourceFont(program.data.base));
      assert.equal(sourceMasters(program.ref), sourceMasters(program.data.base));
      const registered = sourceProgram(program.ref);
      assert.ok(registered);
      assert.equal(!!registered.width, !!program.data.width);
      assert.equal(!!registered.features, !!program.data.features);
      for (const asset of [program.data.width, program.data.features]) {
        if (!asset) continue;
        const payload = sourcePayload(asset);
        assert.ok('base' in payload);
        assert.deepEqual(payload.base, program.data.base);
        assert.throws(() => sourcePayload({ ...asset, fontId: 'Wrong:400' }), /unavailable/);
        assert.throws(() => sourcePayload({ ...asset, kind: 'masters-v1' }), /unavailable/);
      }
      assert.throws(() => sourcePayload({ ...program.ref, kind: 'masters-v1' }), /unavailable/);
      assert.throws(() => loadServerSource({ ...program.ref, fontId: 'Wrong:400' }), /unavailable/);
    }
  });
});
