/* Real saved drawings cross a published point-basis change, reopen, and export. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { buildFont, packNode } from '../shared/engine';
import { transformCmds } from '../shared/engine/geom';
import type { Cmd, Pt } from '../shared/engine/types';
import { DEFAULTS, drawnAtOf, freeAtOf, sanitizeParams, type Params } from '../shared/params';
import { adoptProgram, programUpgrade } from '../shared/source/adoption';
import { sourceFinishPolygons } from '../shared/source/finish';
import { masterBasisForEditing, masterInfo, MASTER_REVISIONS } from '../shared/source/master-catalog';
import { PROGRAM_REVISIONS, programForFont, programInfo } from '../shared/source/program-catalog';
import { loadSource } from '../server/sources';
import { ExportPool } from '../server/export-pool';
import { buildOTF } from '../server/export';
import { opentype } from '../server/opentype';

function near(a: number, b: number, tolerance = 1e-7) { assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`); }
function glyph(p: Params, ch: string) {
  const result = buildFont(p).glyph(ch);
  assert.ok(result?.drawn);
  return { ...result, drawn: result.drawn };
}
function geometry(a: Cmd[], b: Cmd[]) {
  const left = sourceFinishPolygons(a, .02), right = sourceFinishPolygons(b, .02);
  function distance(p: Pt, contours: Pt[][]) {
    let closest = Infinity;
    for (const c of contours) for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length], dx = b.x - a.x, dy = b.y - a.y;
      const length = dx * dx + dy * dy, t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
      closest = Math.min(closest, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
    return closest;
  }
  assert.equal(left.length, right.length);
  for (const p of left.flat()) assert.ok(distance(p, right) < .05, `Moved source curve at ${p.x},${p.y}`);
  for (const p of right.flat()) assert.ok(distance(p, left) < .05, `Moved saved curve at ${p.x},${p.y}`);
}
function saved(fontId: string, ch = 'R') {
  const current = programInfo(programForFont(fontId));
  assert.ok(current?.data.transitions?.length);
  const previous = PROGRAM_REVISIONS.findLast(p => p.ref.fontId === fontId && p.data.base.digest === current.data.transitions?.[0].from.digest);
  assert.ok(previous);
  loadSource(previous.ref); loadSource(current.ref);
  const info = masterInfo(previous.ref); assert.ok(info);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min);
  const width = previous.width ? (previous.width.neutral - previous.width.min) / (previous.width.max - previous.width.min) : DEFAULTS.width;
  const p: Params = { ...DEFAULTS, sourceProgram: previous.ref, freeFont: fontId, weight, width,
    crossbar: .5, tail: .5, terminalLength: .5, height: .72, xHeight: .81, extenders: .36,
    freeAt: { ...freeAtOf(DEFAULTS), weight, width } };
  const original = glyph(p, ch);
  p.outlines = { [ch]: { ...original.drawn, adv: original.adv + 17, at: drawnAtOf(p, ch),
    contours: original.drawn.contours.map(c => c.map(n => ({ ...n, x: n.x + 11,
      ...(n.ix === undefined ? {} : { ix: n.ix + 11 }), ...(n.ox === undefined ? {} : { ox: n.ox + 11 }) }))) } };
  const adopted = adoptProgram(p); assert.ok(adopted);
  return { before: p, after: adopted, previous: previous.ref };
}

describe('published point-basis adoption', () => {
  it('keeps historical sources pinned and uses the original basis for outline-era edits', () => {
    for (const fontId of ['Cotton:300', 'Gumdrop:700']) {
      const first = MASTER_REVISIONS.find(m => m.ref.fontId === fontId); assert.ok(first);
      assert.deepEqual(masterBasisForEditing(first.source), first.ref);
      assert.equal(masterInfo(first.source), undefined, 'an outline-era document still has no weight control');
      assert.ok(programUpgrade(first.source));
      const { before, after } = saved(fontId);
      assert.deepEqual(sanitizeParams(JSON.parse(JSON.stringify(before))).sourceProgram, before.sourceProgram);
      assert.notEqual(after.sourceProgram?.digest, before.sourceProgram?.digest);
      assert.strictEqual(after.outlines, before.outlines);
      assert.deepEqual(after.outlines.R.at?.sourceProgram, before.sourceProgram);
      near(glyph(after, 'R').adv, glyph(before, 'R').adv);
      geometry(glyph(after, 'R').cmds, glyph(before, 'R').cmds);
    }
  });

  it('carries saved points through the new width, weight, height, and crossbar masters', () => {
    for (const fontId of ['Cotton:300', 'Gumdrop:700']) for (const ch of ['R', 'H']) {
      const { after } = saved(fontId, ch);
      const varied: Params = { ...after, weight: .41, width: .18, height: .24, xHeight: .67, glyphs: { H: { crossbar: .87 } } };
      const actual = glyph(varied, ch), expected = glyph({ ...varied, outlines: {} }, ch);
      geometry(actual.cmds, transformCmds(expected.cmds, [1, 0, 0, 1, 11, 0]));
      near(actual.adv, expected.adv + 17);
      const digest = masterInfo(after.sourceProgram)?.ref.digest;
      assert.ok(digest);
      assert.ok(actual.drawn.contours.flat().every(n => n.authored?.digest === digest));
      const reopened = sanitizeParams(JSON.parse(JSON.stringify(varied)));
      assert.deepEqual(glyph(reopened, ch).cmds, actual.cmds);
      const savedAgain: Params = { ...varied, outlines: { [ch]: { ...actual.drawn, at: drawnAtOf(varied, ch) } } };
      assert.deepEqual(glyph(savedAgain, ch).cmds, actual.cmds);
    }
  });

  it('reopens the old frame in a fresh process and exports the same curves in a fresh worker', async () => {
    const { after, previous } = saved('Cotton:300');
    after.width = .83; after.weight = .61;
    const expected = glyph(after, 'R');
    const reopened = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/reopen-source-frame.ts', import.meta.url))], {
      input: JSON.stringify(after), encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' },
    });
    assert.equal(reopened.status, 0, reopened.stderr);
    const result = JSON.parse(reopened.stdout);
    assert.deepEqual(result.missing, { ref: previous, state: 'missing', missingCharacters: [] });
    assert.equal(result.refusedExport, true);
    assert.deepEqual(result.drawing, [expected.adv, expected.drawn.contours.map(c => c.map(packNode))]);
    const pool = new ExportPool(1);
    try {
      const built = await pool.run({ kind: 'otf', name: 'Rebased Cotton', params: after, member: null });
      const actual = opentype.parse(Uint8Array.from(built.data).buffer);
      const local = opentype.parse(Uint8Array.from(buildOTF(after, 'Rebased Cotton')).buffer);
      assert.deepEqual(actual.charToGlyph('R').path.commands, local.charToGlyph('R').path.commands);
      assert.equal(actual.charToGlyph('R').advanceWidth, Math.round(expected.adv));
    } finally { pool.close(); }
  });
});
