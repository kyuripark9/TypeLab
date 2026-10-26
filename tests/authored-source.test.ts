import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sourceForFont, SOURCE_REVISIONS } from '../shared/source/catalog';
import { parseSourceRef } from '../shared/source/model';
import { parseSourceData } from '../shared/source/data';
import { registerSource, sourceFont } from '../shared/source/registry';
import type { SourceRef } from '../shared/source/model';
import { DEFAULTS, PARAMS_VERSION, drawnAtOf, freeAtOf, sanitizeParams, upgradeParams, type Params } from '../shared/params';
import { styleById } from '../shared/content';
import { ALL_CHARS, buildFont, drawnCmds, packNode, registerFreeFont, type Cmd, type Glyph } from '../shared/engine';
import { cmdsBox, signedArea, toPolys } from '../shared/engine/geom';
import { combine, shape } from '../shared/engine/boolean';
import { buildOTF } from '../server/export';
import { opentype } from '../server/opentype';
import { createApp } from '../server/app';
import { originMapFor } from '../shared/source/origin-catalog';
import { masterBasisForEditing } from '../shared/source/master-catalog';
import { parseOutlineMasterMap } from '../shared/source/outline-master-map';
import { DesignStore } from '../server/db';
import { ExportPool } from '../server/export-pool';

const root = fileURLToPath(new URL('..', import.meta.url));
const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('immutable authored source files', () => {
  it('pins each catalog revision to its exact original bytes', () => {
    const files = readdirSync(join(root, 'fonts')).filter(file => file.endsWith('.json'));
    assert.ok(SOURCE_REVISIONS.length >= files.length);
    for (const ref of SOURCE_REVISIONS) {
      const bytes = readFileSync(join(root, 'fonts/sources', `${ref.digest}.json`));
      assert.equal(sha256(bytes), ref.digest, ref.fontId);
      const raw: unknown = JSON.parse(bytes.toString('utf8'));
      assert.ok(typeof raw === 'object' && raw !== null && 'id' in raw);
      assert.equal(raw.id, ref.fontId);
    }
    for (const file of files) {
      const bytes = readFileSync(join(root, 'fonts', file));
      const source = parseSourceData(JSON.parse(bytes.toString('utf8')));
      const ref = sourceForFont(source.id);
      assert.ok(ref);
      assert.equal(ref.digest, sha256(bytes), `${file} must match its current catalog revision`);
    }
    assert.equal(sourceForFont('Not a font:400'), null);
  });

  it('regenerates current sources while retaining earlier snapshots and checks without writing', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'typelab-sources-'));
    const script = join(scratch, 'tools/authored/build-sources.ts');
    mkdirSync(dirname(script), { recursive: true });
    mkdirSync(join(scratch, 'fonts'));
    mkdirSync(join(scratch, 'shared/source'), { recursive: true });
    copyFileSync(join(root, 'tools/authored/build-sources.ts'), script);
    copyFileSync(join(root, 'shared/source/data.ts'), join(scratch, 'shared/source/data.ts'));
    const source = join(scratch, 'fonts/Test-400.json');
    const data = { id: 'Test:400', family: 'Test', designers: [], copyright: '', license: '', licenseUrl: '', cap: 700, xh: 500, space: 250 };
    const original = `${JSON.stringify({ ...data, glyphs: { A: [500, []] } })}\n`;
    const revised = `${JSON.stringify({ ...data, glyphs: { A: [600, []] } })}\n`;
    const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
      cwd: root, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' },
    });
    writeFileSync(source, original);
    const built = run();
    assert.equal(built.status, 0, built.stderr);
    const oldSnapshot = join(scratch, 'fonts/sources', `${sha256(original)}.json`);
    assert.equal(readFileSync(oldSnapshot, 'utf8'), original);
    const catalog = join(scratch, 'shared/source/catalog.ts');
    const before = readFileSync(catalog, 'utf8');

    writeFileSync(source, revised);
    const stale = run('--check');
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /out of date/);
    assert.equal(readFileSync(catalog, 'utf8'), before);
    const newSnapshot = join(scratch, 'fonts/sources', `${sha256(revised)}.json`);
    assert.equal(existsSync(newSnapshot), false);

    const rebuilt = run();
    assert.equal(rebuilt.status, 0, rebuilt.stderr);
    assert.equal(readFileSync(oldSnapshot, 'utf8'), original);
    assert.equal(readFileSync(newSnapshot, 'utf8'), revised);
    assert.match(readFileSync(catalog, 'utf8'), new RegExp(sha256(original)));
    assert.match(readFileSync(catalog, 'utf8'), new RegExp(sha256(revised)));
    assert.equal(run('--check').status, 0);

    writeFileSync(oldSnapshot, revised);
    const tampered = run('--check');
    assert.equal(tampered.status, 1);
    assert.match(tampered.stderr, /Immutable source was modified/);
  });
});

function sourceStyle(styleId: string, fontId: string) {
  const style = styleById(styleId), ref = sourceForFont(fontId);
  assert.ok(style && ref);
  const data = parseSourceData(JSON.parse(readFileSync(join(root, 'fonts/sources', `${ref.digest}.json`), 'utf8')));
  registerSource(ref, data);
  const params: Params = {
    ...style.params, freeFont: fontId, freeAt: freeAtOf(style.params), sourceProgram: ref,
    height: DEFAULTS.height, letterSpacing: DEFAULTS.letterSpacing, wordSpacing: DEFAULTS.wordSpacing,
  };
  return { data, ref, params };
}

function glyph(params: Params, ch: string): Glyph {
  const found = buildFont(params).glyph(ch);
  assert.ok(found, `${params.sourceProgram?.fontId} ${ch} must be present`);
  return found;
}

const INITIAL = [['grotesque', 'Mainline:600'], ['softslab', 'Hearth:600'], ['didone', 'Couture:600']];

describe('authored source rendering', () => {
  it('keeps all bundled sources exact at neutral and drawable at combined height and width endpoints', () => {
    for (const ref of SOURCE_REVISIONS) {
      const data = parseSourceData(JSON.parse(readFileSync(join(root, 'fonts/sources', `${ref.digest}.json`), 'utf8')));
      registerSource(ref, data);
      const params: Params = { ...DEFAULTS, sourceProgram: ref, freeFont: ref.fontId, freeAt: freeAtOf(DEFAULTS) };
      const neutral = buildFont(params);
      for (const ch of ALL_CHARS) {
        const original = data.glyphs[ch], actual = neutral.glyph(ch);
        if (!original?.[1].length) { assert.equal(actual, null, `${ref.fontId} ${ch} missing`); continue; }
        assert.ok(actual?.drawn, `${ref.fontId} ${ch}`);
        assert.deepEqual(actual.drawn.contours.map(contour => contour.map(packNode)), original[1], `${ref.fontId} ${ch} neutral`);
        assert.equal(actual.adv, original[0], `${ref.fontId} ${ch} advance`);
      }
      for (const change of [
        { height: 0, width: 0, xHeight: 1, extenders: 0, descender: 0 },
        { height: 1, width: 1, xHeight: 0, extenders: 1, descender: 1 },
      ]) {
        const font = buildFont({ ...params, ...change });
        for (const ch of ALL_CHARS) {
          const original = data.glyphs[ch], actual = font.glyph(ch);
          if (!original?.[1].length) { assert.equal(actual, null); continue; }
          const label = `${ref.fontId} ${ch} ${JSON.stringify(change)}`;
          assert.ok(actual, label);
          assert.equal(actual.cmds.filter(command => command[0] === 'M').length, original[1].length, label);
          assert.ok(Number.isFinite(actual.adv) && actual.adv > 0, label);
          for (const command of actual.cmds) for (const value of command.slice(1)) assert.ok(typeof value === 'number' && Number.isFinite(value), label);
        }
      }
    }
  });

  it('starts every supported character at its exact original curves, coordinates, and advance', () => {
    for (const [style, id] of INITIAL) {
      const { data, ref, params } = sourceStyle(style, id), font = buildFont(params);
      assert.deepEqual(font.source, { ref, state: 'ready', missingCharacters: [] });
      assert.equal(font.m.cap, data.cap, `${id} cap height`);
      assert.equal(font.m.xh, data.xh, `${id} x-height`);
      assert.equal(font.m.track, 0, `${id} neutral letter spacing`);
      assert.equal(font.m.space, data.space, `${id} neutral word spacing`);
      for (const ch of ALL_CHARS) {
        const actual = font.glyph(ch), original = data.glyphs[ch];
        assert.ok(actual?.drawn, `${id} ${ch}`);
        assert.deepEqual(actual.drawn.contours.map(contour => contour.map(packNode)), original[1], `${id} ${ch} source coordinates`);
        assert.deepEqual(actual.cmds, drawnCmds(actual.drawn.contours), `${id} ${ch} commands`);
        assert.equal(actual.adv, original[0], `${id} ${ch} advance`);
      }
    }
  });

  it('keeps a missing pinned source visibly missing even if a same-named legacy font is registered', () => {
    const { data, params } = sourceStyle('grotesque', 'Mainline:600');
    registerFreeFont(data);
    const missing: SourceRef = { kind: 'outline-v1', fontId: data.id, digest: 'f'.repeat(64) };
    const font = buildFont({ ...params, sourceProgram: missing });
    assert.equal(font.source?.state, 'missing');
    assert.equal(font.glyph('A'), null);
    assert.equal(font.glyph('j'), null);
    assert.throws(() => buildOTF({ ...params, sourceProgram: missing }, 'Missing source'), /source/i);
  });

  it('does not replace missing source characters with generated substitutes', () => {
    const ref = sourceForFont('Cathedral:400');
    assert.ok(ref);
    registerSource(ref, JSON.parse(readFileSync(join(root, 'fonts/sources', `${ref.digest}.json`), 'utf8')));
    const font = buildFont({ ...DEFAULTS, sourceProgram: ref, freeFont: ref.fontId, freeAt: freeAtOf(DEFAULTS) });
    assert.equal(font.source?.state, 'ready');
    assert.deepEqual(font.source?.missingCharacters, ['−', '÷']);
    assert.ok(font.glyph('A'));
    assert.equal(font.glyph('−'), null);
    assert.equal(font.glyph('÷'), null);
  });

  it('keeps a pinned design independent of later replacements in the legacy font-name cache', () => {
    const { data, ref, params } = sourceStyle('grotesque', 'Mainline:600');
    const before = glyph(params, 'A');
    registerFreeFont({ ...data, glyphs: { ...data.glyphs, A: [42, [[[0, 0], [10, 0], [10, 10]]]] } });
    assert.deepEqual(glyph(params, 'A').cmds, before.cmds);
    assert.equal(glyph(params, 'A').adv, before.adv);
    assert.equal(sourceFont(ref)?.glyphs.A.adv, data.glyphs.A[0]);
    registerFreeFont(data);
  });

  it('keeps every character finite and its contours present at individual and combined axis endpoints', () => {
    const changes: Partial<Params>[] = [
      { width: 0 }, { width: 1 }, { height: 0 }, { height: 1 },
      { xHeight: 0 }, { xHeight: 1 }, { extenders: 0 }, { extenders: 1 },
      { descender: 0 }, { descender: 1 },
      { width: 0, height: 1, xHeight: 1, extenders: 0, descender: 0 },
      { width: 1, height: 0, xHeight: 0, extenders: 1, descender: 1 },
    ];
    for (const [style, id] of INITIAL) {
      const { data, params } = sourceStyle(style, id);
      for (const change of changes) {
        const font = buildFont({ ...params, ...change });
        for (const ch of ALL_CHARS) {
          const actual = font.glyph(ch), label = `${id} ${ch} ${JSON.stringify(change)}`;
          assert.ok(actual, label);
          assert.equal(actual.cmds.filter(command => command[0] === 'M').length, data.glyphs[ch][1].length, label);
          assert.ok(Number.isFinite(actual.adv) && actual.adv > 0, label);
          for (const command of actual.cmds) for (const value of command.slice(1)) assert.ok(typeof value === 'number' && Number.isFinite(value), label);
        }
      }
    }
  });

  it('changes actual proportions continuously while keeping the i and j dots detached', () => {
    for (const [style, id] of INITIAL) {
      const { params } = sourceStyle(style, id);
      let previousWidth = -Infinity, previousHeight = -Infinity;
      for (const value of [0, 0.25, 0.5, 0.75, 1]) {
        const width = cmdsBox(glyph({ ...params, width: value }, 'H').cmds);
        const height = cmdsBox(glyph({ ...params, xHeight: value }, 'x').cmds);
        assert.ok(width && height);
        assert.ok(width.x1 - width.x0 > previousWidth, `${id} H width ${value}`);
        assert.ok(height.y1 - height.y0 > previousHeight, `${id} x height ${value}`);
        previousWidth = width.x1 - width.x0; previousHeight = height.y1 - height.y0;
        for (const ch of 'ij') {
          const contours = toPolys(glyph({ ...params, xHeight: value, extenders: 0, descender: 0 }, ch).cmds);
          const boxes = contours.map(points => ({ low: Math.min(...points.map(p => p.y)), high: Math.max(...points.map(p => p.y)) })).sort((a, b) => a.low - b.low);
          assert.equal(boxes.length, 2, `${id} ${ch} has a stem and dot`);
          assert.ok(boxes[1].low - boxes[0].high > 1, `${id} ${ch} dot gap at x-height ${value}`);
        }
      }
    }
  });

  it('keeps filled joins connected and counters open in the real source letters', () => {
    for (const [style, id] of INITIAL) {
      const { params } = sourceStyle(style, id);
      for (const change of [
        { xHeight: 0 }, { xHeight: 1 }, { height: 0 }, { height: 1 },
        { xHeight: 1, extenders: 0, descender: 0 }, { xHeight: 0, extenders: 1, descender: 1 },
      ]) {
        const font = buildFont({ ...params, ...change });
        for (const ch of 'ijyugRoa') {
          const actual = font.glyph(ch);
          assert.ok(actual);
          const ink = shape(toPolys(actual.cmds));
          const areas = combine([ink], ink.has).map(signedArea).filter(area => Math.abs(area) > 0.1);
          assert.deepEqual({ pieces: areas.filter(area => area > 0).length, counters: areas.filter(area => area < 0).length }, {
            pieces: 'ij'.includes(ch) ? 2 : 1,
            counters: 'gRoa'.includes(ch) ? 1 : 0,
          }, `${id} ${ch} ${JSON.stringify(change)}`);
        }
      }
    }
  });

  it('keeps authored dot dimensions when lowercase height and stem lengths change', () => {
    const dot = (params: Params, ch: string) => toPolys(glyph(params, ch).cmds).map(points => ({
      low: Math.min(...points.map(p => p.y)), high: Math.max(...points.map(p => p.y)),
      left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
    })).sort((a, b) => b.low - a.low)[0];
    for (const [style, id] of INITIAL) {
      const { params } = sourceStyle(style, id);
      for (const ch of 'ij') {
        const original = dot(params, ch);
        for (const xHeight of [0, 0.5, 1]) for (const extenders of [0, 1]) for (const descender of [0, 1]) {
          const actual = dot({ ...params, xHeight, extenders, descender }, ch);
          const label = `${id} ${ch} xHeight=${xHeight}, extenders=${extenders}, descender=${descender}`;
          assert.ok(Math.abs(actual.high - actual.low - (original.high - original.low)) < 1e-6, `${label}: dot height`);
          assert.ok(Math.abs(actual.right - actual.left - (original.right - original.left)) < 1e-6, `${label}: dot width`);
        }
      }
    }
  });

  it('keeps point edits dynamic after a supported setting changes and after a save round-trip', () => {
    const { params } = sourceStyle('grotesque', 'Mainline:600');
    const originalFont = buildFont(params), original = originalFont.glyph('A');
    assert.ok(original?.drawn);
    const contours = original.drawn.contours.map(contour => contour.map(node => ({ ...node })));
    contours[0][0].x += 17;
    if (contours[0][0].ix !== undefined) contours[0][0].ix += 17;
    if (contours[0][0].ox !== undefined) contours[0][0].ox += 17;
    const edited: Params = { ...params, outlines: { A: { adv: original.adv, contours, at: drawnAtOf(params, 'A') } } };
    const base = glyph(edited, 'A'), wide = glyph({ ...edited, width: 1 }, 'A');
    assert.notDeepEqual(base.cmds, original.cmds);
    assert.notDeepEqual(wide.cmds, base.cmds);
    const editedFont = buildFont(edited, originalFont), reused = editedFont.glyph('A');
    assert.equal(reused?.drawn?.contours[0][0].x, contours[0][0].x, 'the edited point replaces the previous font cache entry');
    assert.deepEqual(reused?.cmds, base.cmds, 'reuse renders the same edited outline as a fresh build');
    assert.deepEqual(buildFont(params, editedFont).glyph('A')?.cmds, original.cmds, 'reset discards the edited cached outline');
    const saved = sanitizeParams(JSON.parse(JSON.stringify({ ...edited, width: 1 })));
    assert.deepEqual(glyph(saved, 'A').cmds, wide.cmds);
    assert.deepEqual(glyph({ ...saved, width: params.width }, 'A').cmds, base.cmds);
    assert.deepEqual(glyph(edited, 'B').cmds, glyph(params, 'B').cmds);
  });

  it('returns saved point edits to the same position after mixed transforms, including a new character', () => {
    const { params } = sourceStyle('grotesque', 'Mainline:600');
    const start = { ...params, width: 0.7, height: 0.7, rotation: 0.7, slant: 0.4, sideBearing: 0.7 };
    const existing = glyph(start, 'A');
    assert.ok(existing.drawn);
    const edited = structuredClone(existing.drawn), point = edited.contours[0][0];
    point.x += 11;
    if (point.ix !== undefined) point.ix += 11;
    if (point.ox !== undefined) point.ox += 11;
    const custom = { adv: 400, contours: [[{ x: 50, y: 0 }, { x: 250, y: 0 }, { x: 150, y: 500 }]] };
    for (const [ch, drawing] of [['Ω', custom], ['A', edited]] satisfies [string, NonNullable<Glyph['drawn']>][]) {
      const document = { ...drawing, at: drawnAtOf(start, ch) };
      const next: Params = { ...start, width: 0.9, outlines: { [ch]: document } };
      const moved = glyph(next, ch);
      assert.ok(moved.drawn);
      const saved = sanitizeParams(JSON.parse(JSON.stringify({
        ...next, outlines: { [ch]: { ...moved.drawn, at: drawnAtOf(next, ch) } },
      })));
      const returned = glyph({ ...saved, width: 0.7 }, ch);
      assert.ok(Math.abs(returned.adv - drawing.adv) < 1e-8, `${ch} returns to its advance`);
      const expected = drawnCmds(drawing.contours);
      assert.equal(returned.cmds.length, expected.length, `${ch} keeps its path structure`);
      returned.cmds.forEach((command, i) => {
        assert.equal(command[0], expected[i][0]);
        assert.equal(command.length, expected[i].length);
        command.forEach((value, j) => {
          const was = expected[i][j];
          if (typeof value === 'number' && typeof was === 'number') assert.ok(Math.abs(value - was) < 1e-8, `${ch} coordinate ${i}:${j} returns to ${was}`);
        });
      });
    }
  });

  it('exports all 127 preview glyphs with matching rounded paths and spacing', () => {
    for (const [style, id] of INITIAL) {
      const { params } = sourceStyle(style, id);
      const changed = { ...params, width: 0.76, xHeight: 0.89, descender: 0.2, slant: 0.3, letterSpacing: 0.27 };
      const font = buildFont(changed), bytes = buildOTF(changed, 'Authored source test');
      const exported = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
      assert.equal(exported.glyphs.length, 130, id);
      for (const ch of ALL_CHARS) {
        const preview = font.glyph(ch);
        assert.ok(preview);
        const actual = exported.charToGlyph(ch);
        assert.notEqual(actual.index, 0, `${id} ${ch} present in OTF`);
        assert.equal(actual.advanceWidth, Math.round(Math.max(20, preview.adv + font.m.track)), `${id} ${ch} advance`);
        const commands: Cmd[] = actual.path.commands.map(command => {
          switch (command.type) {
            case 'M': return ['M', command.x, command.y];
            case 'L': return ['L', command.x, command.y];
            case 'C': return ['C', command.x1, command.y1, command.x2, command.y2, command.x, command.y];
            case 'Z': return ['Z'];
            default: throw Error(`Unexpected exported command ${command.type}`);
          }
        });
        const rounded = preview.cmds.map(command => command.map(value => typeof value === 'number' ? Math.round(value) || 0 : value));
        assert.deepEqual(commands, rounded, `${id} ${ch} OTF path`);
      }
      assert.equal(exported.charToGlyph(' ').advanceWidth, Math.round(Math.max(40, font.m.space + font.m.track)), `${id} space`);
    }
  });
});

describe('authored source HTTP and export worker', () => {
  it('serves pinned data immutably and exports that same source in a fresh worker', async () => {
    const { data, ref, params } = sourceStyle('grotesque', 'Mainline:600');
    const store = new DesignStore(':memory:'), pool = new ExportPool(1);
    const server = createApp(store, { exports: pool }).listen(0);
    try {
      await new Promise<void>(resolve => server.once('listening', resolve));
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/api`;
      const response = await fetch(`${base}/sources/${ref.digest}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
      const original = await response.text();
      const served = parseSourceData(JSON.parse(original));
      assert.equal(served.id, data.id);
      assert.deepEqual([served.cap, served.xh, served.space], [data.cap, data.xh, data.space]);
      assert.deepEqual(served.glyphs, data.glyphs);
      assert.equal(served.license, 'SIL Open Font License, Version 1.1');
      assert.match(served.licenseText ?? '', /SIL OPEN FONT LICENSE/);
      assert.equal(await (await fetch(`${base}/sources/${ref.digest}`)).text(), original);
      assert.equal((await fetch(`${base}/sources/${'e'.repeat(64)}`)).status, 404);
      assert.equal((await fetch(`${base}/sources/not-a-digest`)).status, 404);
      assert.equal(ref.kind, 'outline-v1');
      const first = masterBasisForEditing(ref); assert.ok(first);
      const origin = originMapFor(ref, first); assert.ok(origin);
      const correspondence = await fetch(`${base}/sources/${origin.ref.digest}`);
      assert.equal(correspondence.status, 200);
      assert.equal(correspondence.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      const mapped = parseOutlineMasterMap(await correspondence.json());
      assert.deepEqual([mapped.from, mapped.to], [ref, first]);
      assert.ok(mapped.glyphs.R);

      for (const [path, extra] of [
        ['/export/otf', { accents: true }],
        ['/export/otf', { member: { anchor: 'semibold', weight: 'bold', italic: false } }],
        ['/export/family', { family: { anchor: 'semibold', styles: [{ weight: 'bold', italic: false }] } }],
      ] satisfies [string, Record<string, unknown>][]) {
        const rejected = await fetch(base + path, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Unsupported authored variation', params, ...extra }),
        });
        assert.equal(rejected.status, 400, `${path} must refuse unavailable authored variations`);
      }

      const changed = { ...params, height: 0.65, xHeight: 0.85, width: 0.8, slant: 0.25 };
      const exported = await fetch(`${base}/export/otf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Pinned worker test', params: changed }),
      });
      assert.equal(exported.status, 200, await exported.clone().text());
      assert.equal(exported.headers.get('content-type'), 'font/otf');
      const actual = opentype.parse(await exported.arrayBuffer());
      const localBytes = buildOTF(changed, 'Pinned worker test');
      const local = opentype.parse(localBytes.buffer.slice(localBytes.byteOffset, localBytes.byteOffset + localBytes.length));
      assert.equal(actual.glyphs.length, 130);
      for (const ch of ALL_CHARS) {
        assert.deepEqual(actual.charToGlyph(ch).path.commands, local.charToGlyph(ch).path.commands, `${ch} worker geometry`);
        assert.equal(actual.charToGlyph(ch).advanceWidth, local.charToGlyph(ch).advanceWidth, `${ch} worker advance`);
      }
    } finally {
      pool.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
      store.close();
    }
  });
});

describe('authored source input', () => {
  const fixture = {
    id: 'Test:400', family: 'Test', designers: ['Test'], copyright: '', license: '', licenseUrl: '',
    cap: 700, xh: 500, space: 250,
    glyphs: { A: [500, [[[10, 20], [30, 40, null, null, 35, 45], [50, 60, 45, 55]]]] },
  };

  it('keeps original coordinate precision and handle absence', () => {
    const data = parseSourceData(fixture);
    assert.deepEqual(data, fixture);
    assert.notEqual(data.glyphs.A[1], fixture.glyphs.A[1]);
    const fractional = { ...fixture, glyphs: { A: [500.125, [[[10.25, -20.5], [30.75, 40.125]]]] } };
    assert.deepEqual(parseSourceData(fractional), fractional);
  });

  it('rejects broken source geometry at its input boundary', () => {
    const glyph = (nodes: unknown) => ({ ...fixture, glyphs: { A: [500, [nodes]] } });
    assert.throws(() => parseSourceData(glyph([[1, 2, null, 4]])), /finite number/);
    assert.throws(() => parseSourceData(glyph([[1, 2, 3]])), /2, 4, or 6/);
    assert.throws(() => parseSourceData(glyph([[1, Infinity]])), /finite number/);
    assert.throws(() => parseSourceData(glyph([])), /empty contour/);
    assert.throws(() => parseSourceData({ ...fixture, glyphs: { A: [-10, []] } }), /nonnegative/);
    assert.throws(() => parseSourceData({ ...fixture, xh: 701 }), /x-height/);
  });
});

describe('saved authored source identity', () => {
  it('keeps legacy designs on their existing renderer', () => {
    assert.ok(PARAMS_VERSION >= 9);
    const ref = sourceForFont('Mainline:600');
    assert.ok(ref);
    const old = sanitizeParams(upgradeParams({ ...DEFAULTS, freeFont: 'Mainline:600', sourceProgram: ref, width: 0.73 }, 7));
    assert.equal(old.sourceProgram, null);
    assert.equal(old.freeFont, 'Mainline:600');
    assert.equal(old.width, 0.73);
    assert.equal(sanitizeParams({ ...DEFAULTS }).sourceProgram, null);
  });

  it('round-trips source identity and rejects unsupported or malformed references', () => {
    const ref = sourceForFont('Hearth:600');
    assert.ok(ref);
    const saved = JSON.parse(JSON.stringify({ ...DEFAULTS, sourceProgram: ref }));
    assert.deepEqual(sanitizeParams(upgradeParams(saved, 8)).sourceProgram, ref);
    assert.deepEqual(parseSourceRef(ref), ref);
    assert.throws(() => parseSourceRef({ ...ref, kind: 'unknown-engine' }), /source reference/i);
    assert.throws(() => parseSourceRef({ ...ref, digest: 'not-a-digest' }), /source reference/i);
    assert.throws(() => parseSourceRef({ ...ref, fontId: '../escape' }), /source reference/i);
  });
});
