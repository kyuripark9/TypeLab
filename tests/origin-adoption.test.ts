/* Saved original-sheet Points keep their visible geometry while adopting authored programs. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFont, packNode } from '../shared/engine';
import { transformCmds } from '../shared/engine/geom';
import type { Cmd, Pt } from '../shared/engine/types';
import type { Drawn } from '../shared/engine/outline';
import { DEFAULTS, drawnAtOf, freeAtOf, sanitizeParams, type Params } from '../shared/params';
import { adoptProgram } from '../shared/source/adoption';
import { sourceFinishPolygons } from '../shared/source/finish';
import { MASTER_REVISIONS, masterInfo, type MasterInfo } from '../shared/source/master-catalog';
import { programInfo } from '../shared/source/program-catalog';
import { loadDesignSources, loadSource } from '../server/sources';
import { buildOTF } from '../server/export';
import { ExportPool } from '../server/export-pool';
import { opentype } from '../server/opentype';

const firstMasters = MASTER_REVISIONS.filter((m, i, all) => all.findIndex(n => n.ref.fontId === m.ref.fontId) === i);
const near = (a: number, b: number, label: string, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${label}: ${a} != ${b}`);
function glyph(p: Params, ch: string) {
  const font = buildFont(p), result = font.glyph(ch);
  assert.equal(font.source?.state, 'ready'); assert.ok(result?.drawn, `${p.freeFont} ${ch}`);
  return { ...result, drawn: result.drawn };
}
function geometry(actual: Cmd[], expected: Cmd[], label: string) {
  const a = sourceFinishPolygons(actual, .008), b = sourceFinishPolygons(expected, .008);
  assert.equal(a.length, b.length, label + ' contour count');
  function directed(points: Pt[][], lines: Pt[][]) {
    const segments = lines.flatMap(c => c.map((p, i) => [p, c[(i + 1) % c.length]]));
    for (const p of points.flat()) {
      let closest = Infinity;
      for (const [a, b] of segments) {
        const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
        const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
        closest = Math.min(closest, (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2);
      }
      assert.ok(closest < .025 ** 2, `${label}: moved curve at ${p.x},${p.y} by ${Math.sqrt(closest)}`);
    }
  }
  directed(a, b); directed(b, a);
}
function edit(drawing: Drawn, dx = 11, dy = -6, local = 2): Drawn {
  return { ...drawing, adv: drawing.adv + 17, contours: drawing.contours.map(c => c.map((n, i) => ({ ...n, x: n.x + dx, y: n.y + dy + (i === 1 ? local : 0),
    ...(n.ix === undefined ? {} : { ix: n.ix + dx, iy: (n.iy ?? n.y) + dy }),
    ...(n.ox === undefined ? {} : { ox: n.ox + dx, oy: (n.oy ?? n.y) + dy }) }))) };
}
function original(info: MasterInfo, posed: boolean, characters = 'RagHij'): Params {
  loadSource(info.source);
  const p: Params = { ...DEFAULTS, sourceProgram: info.source, freeFont: info.source.fontId, freeAt: freeAtOf(DEFAULTS),
    ...(posed ? { sideBearing: .81, rotation: .68, slant: .77, mirror: 'mirrored', width: .78, height: .73, xHeight: .79, extenders: .31, descender: .7,
      glyphs: { a: { rotation: .37, slant: .32 }, g: { rotation: .23, sideBearing: .27 } } } : {}), outlines: {} };
  p.outlines = Object.fromEntries([...characters].map(ch => {
    const before = glyph(p, ch);
    return [ch, { ...edit(before.drawn), at: drawnAtOf(p, ch) }];
  }));
  return p;
}
function firstBasis(p: Params, info: MasterInfo): Params {
  const weight = (info.defaultWeight - info.min) / (info.max - info.min);
  return { ...p, sourceProgram: info.ref, weight, freeAt: { ...p.freeAt, weight } };
}
function current(p: Params): Params {
  const next = adoptProgram(p); assert.ok(next); loadDesignSources(next); return next;
}
const repairCharacters: Record<string, string> = { Hearth: 'Kw^€', Couture: '*', Sonnet: 'bp¥', Bulwark: 'j()‹›«»', Turnpike: '/\\X)y', Cathedral: '\\' };

describe('original-sheet saved Points adoption', () => {
  it('preserves neutral edited geometry and advances through first masters and current programs in all 22 styles', () => {
    assert.equal(firstMasters.length, 22);
    const selected = process.env.TYPELAB_ORIGIN_STYLE;
    if (!selected) {
      const failures: string[] = [];
      for (const info of firstMasters) {
        const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_')));
        const result = spawnSync(process.execPath, ['--max-old-space-size=384', '--import', 'tsx', '--test',
          '--test-name-pattern=preserves neutral edited geometry', fileURLToPath(import.meta.url)], {
          encoding: 'utf8', env: { ...environment, TYPELAB_ORIGIN_STYLE: info.ref.fontId }, maxBuffer: 1024 * 1024,
        });
        if (result.status !== 0 || !result.stdout.includes('preserves neutral edited geometry')) failures.push(`${info.ref.fontId}: ${result.stdout}\n${result.stderr}`);
      }
      assert.deepEqual(failures, []); return;
    }
    assert.ok(firstMasters.some(m => m.ref.fontId === selected));
    const failures: string[] = [];
    for (const info of firstMasters.filter(m => m.ref.fontId === selected)) for (const posed of [false, true]) {
      const style = info.ref.fontId.split(':')[0], characters = [...new Set('RagHij' + (repairCharacters[style] ?? ''))].join('');
      const before = original(info, posed, characters), first = firstBasis(before, info), after = current(before);
      loadDesignSources(first);
      for (const ch of characters) {
        const expected = glyph(before, ch);
        for (const [name, p] of [['first', first], ['current', after]] satisfies [string, Params][]) {
          const actual = glyph(p, ch), label = `${style} ${ch} ${name} posed=${posed}`;
          try { near(actual.adv, expected.adv, label + ' advance'); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
          try { geometry(actual.cmds, expected.cmds, label); } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
        }
      }
    }
    for (const info of firstMasters.filter(m => m.ref.fontId === selected)) {
      const before = original(info, false, 'R'), unedited = glyph({ ...before, outlines: {} }, 'R');
      before.outlines.R = { ...edit(unedited.drawn, 11, 0, 0), at: drawnAtOf(before, 'R') };
      const after = current(before), varied: Params = { ...after, weight: .73, width: .2, height: .28, xHeight: .67 };
      const actual = glyph(varied, 'R'), baseline = glyph({ ...varied, outlines: {} }, 'R');
      const sx = programInfo(after.sourceProgram)?.width ? 1 : .79;
      try {
        geometry(actual.cmds, transformCmds(baseline.cmds, [1, 0, 0, 1, 11 * sx, 0]), selected + ' later controls');
        near(actual.adv, baseline.adv + 17 * sx, selected + ' later advance');
        assert.notDeepEqual(actual.cmds, glyph(after, 'R').cmds, selected + ' controls change the drawing');
        const reopened = sanitizeParams(JSON.parse(JSON.stringify(varied)));
        geometry(glyph(reopened, 'R').cmds, actual.cmds, selected + ' reopened');
        const again: Params = { ...varied, outlines: { R: { ...actual.drawn, at: drawnAtOf(varied, 'R') } } };
        const next: Params = { ...varied, weight: .34, width: .84, height: .86 };
        const fromAgain: Params = { ...next, outlines: again.outlines };
        geometry(glyph(next, 'R').cmds, glyph(fromAgain, 'R').cmds, selected + ' saved again');
        near(glyph(next, 'R').adv, glyph(fromAgain, 'R').adv, selected + ' saved again advance');
      } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
    }
    assert.deepEqual(failures, []);
  });

  it('retains Cathedral’s original 127-unit advance after its repaired 585-unit basis is adopted', () => {
    const info = firstMasters.find(m => m.ref.fontId === 'Cathedral:400'); assert.ok(info);
    const before = original(info, false, '\\'), after = current(before);
    near(glyph(before, '\\').adv, 144, 'edited original advance');
    near(glyph(after, '\\').adv, 144, 'adopted original advance');
    near(glyph({ ...firstBasis(before, info), outlines: {} }, '\\').adv, 585, 'repaired first-master advance');
  });

  it('recognizes 5c9161b original-sheet frames whose raw points carry the first-master digest', () => {
    for (const [fontId, characters] of [['Hearth:600', 'Kw€'], ['Bulwark:700', 'j()'], ['Cotton:300', 'Ra'], ['Couture:600', '*']]) {
      const info = firstMasters.find(m => m.ref.fontId === fontId); assert.ok(info);
      const before = original(info, true, characters), aliased = structuredClone(before);
      for (const drawing of Object.values(aliased.outlines)) for (const contour of drawing.contours) for (const node of contour) {
        assert.ok(node.authored); node.authored = { ...node.authored, digest: info.ref.digest };
      }
      const expected = current(before), actual = current(sanitizeParams(JSON.parse(JSON.stringify(aliased))));
      for (const ch of characters) {
        geometry(glyph(actual, ch).cmds, glyph(expected, ch).cmds, fontId + ' old digest alias ' + ch);
        near(glyph(actual, ch).adv, glyph(expected, ch).adv, fontId + ' alias advance');
      }
      const changed = { weight: .64, width: .37, height: .42 };
      for (const ch of characters) geometry(glyph({ ...actual, ...changed }, ch).cmds, glyph({ ...expected, ...changed }, ch).cmds, fontId + ' alias later ' + ch);
    }
  });

  it('loads an old outline frame in a fresh process and exports the same geometry in a fresh worker', async () => {
    for (const [fontId, destination] of [['Cotton:300', 'current'], ['Bulwark:700', 'first']]) {
      const info = firstMasters.find(m => m.ref.fontId === fontId); assert.ok(info);
      const before = original(info, true, 'R');
      const after = destination === 'current' ? current(before) : firstBasis(before, info);
      after.weight = .62; after.height = .39; after.width = .83; loadDesignSources(after);
      const expected = glyph(after, 'R');
      const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_')));
      const reopened = spawnSync(process.execPath, ['--max-old-space-size=384', '--import', 'tsx', fileURLToPath(new URL('./fixtures/reopen-source-frame.ts', import.meta.url))], {
        input: JSON.stringify(after), encoding: 'utf8', env: environment, maxBuffer: 4 * 1024 * 1024,
      });
      assert.equal(reopened.status, 0, reopened.stderr);
      const result = JSON.parse(reopened.stdout);
      assert.deepEqual(result.missing, { ref: info.source, state: 'missing', missingCharacters: [] });
      assert.equal(result.refusedExport, true);
      assert.deepEqual(result.drawing, [expected.adv, expected.drawn.contours.map(c => c.map(packNode))]);
      const pool = new ExportPool(1);
      try {
        const built = await pool.run({ kind: 'otf', name: 'Original Points ' + destination, params: after, member: null }, []);
        const actual = opentype.parse(Uint8Array.from(built.data).buffer);
        const local = opentype.parse(Uint8Array.from(buildOTF(after, 'Original Points ' + destination)).buffer);
        assert.deepEqual(actual.charToGlyph('R').path.commands, local.charToGlyph('R').path.commands);
        assert.equal(actual.charToGlyph('R').advanceWidth, Math.round(expected.adv));
        assert.ok(expected.drawn.contours.flat().every(n => n.authored?.digest === masterInfo(after.sourceProgram)?.ref.digest));
      } finally { pool.close(); }
    }
  });
});
