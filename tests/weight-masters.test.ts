/* Reviewed masters through the editor geometry, saved Points and real font exports. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ALL_CHARS, buildFont, drawnCmds, packNode, type Cmd } from '../shared/engine';
import { decodeFreeFont, type FreeFontData } from '../shared/engine/free';
import { DEFAULTS, PARAMS_VERSION, drawnAtOf, freeAtOf, sanitizeParams, upgradeParams, type Params } from '../shared/params';
import { sourceForFont } from '../shared/source/catalog';
import { MASTER_REVISIONS, masterInfo, mastersForFont } from '../shared/source/master-catalog';
import { decodeWeightMasters, interpolateMasters, parseWeightMasters, sliderAt, weightAt, type WeightMasterData } from '../shared/source/masters';
import { sourceFont, sourceMasters } from '../shared/source/registry';
import { familyMember, familyStylesFor } from '../shared/family';
import { loadSource, sourcePayload } from '../server/sources';
import { buildOTF } from '../server/export';
import { opentype } from '../server/opentype';
import { createApp } from '../server/app';
import { DesignStore } from '../server/db';
import { ExportPool } from '../server/export-pool';
import { reverseContour, setHandle, splitSegment } from '../client/lib/pen';
import { OWN_FAMILIES } from '../shared/free-fonts';

function family(fontId = 'Mainline:600') {
  const ref = mastersForFont(fontId), info = masterInfo(ref);
  assert.ok(ref && info, `Missing reviewed package ${fontId}`);
  const data = parseWeightMasters(sourcePayload(ref));
  const pick = (info.defaultWeight - info.min) / (info.max - info.min);
  const params: Params = { ...DEFAULTS, freeFont: fontId, sourceProgram: ref, weight: pick, freeAt: { ...freeAtOf(DEFAULTS), weight: pick } };
  return { ref, info, data, params };
}
function glyph(params: Params, ch: string) {
  const g = buildFont(params).glyph(ch);
  assert.ok(g?.drawn, `Missing drawn ${ch}`);
  return { ...g, drawn: g.drawn };
}
function near(actual: number, expected: number, label: string) { assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`); }
function curveArea(cmds: Cmd[]): number {
  let area = 0, at = { x: 0, y: 0 }, first = at;
  for (const c of cmds) {
    if (c[0] === 'M') { at = { x: c[1], y: c[2] }; first = at; }
    else if (c[0] === 'C') {
      const a = at, b = { x: c[1], y: c[2] }, d = { x: c[3], y: c[4] }, e = { x: c[5], y: c[6] };
      // Three-point Gaussian integration is exact for this degree-five cubic area integrand.
      for (const [t, w] of [[.5 - Math.sqrt(3 / 5) / 2, 5 / 18], [.5, 8 / 18], [.5 + Math.sqrt(3 / 5) / 2, 5 / 18]]) {
        const u = 1 - t, x = u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * d.x + t ** 3 * e.x;
        const y = u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * d.y + t ** 3 * e.y;
        const dx = 3 * u * u * (b.x - a.x) + 6 * u * t * (d.x - b.x) + 3 * t * t * (e.x - d.x);
        const dy = 3 * u * u * (b.y - a.y) + 6 * u * t * (d.y - b.y) + 3 * t * t * (e.y - d.y);
        area += (x * dy - y * dx) * w / 2;
      }
      at = e;
    } else if (c[0] === 'L' || c[0] === 'Z') {
      const end = c[0] === 'Z' ? first : { x: c[1], y: c[2] };
      area += (at.x * end.y - at.y * end.x) / 2; at = end;
    }
  }
  return area;
}
function sameDrawing(actual: ReturnType<typeof glyph>, expected: ReturnType<typeof glyph>, label: string) {
  assert.ok(Math.abs(Math.abs(curveArea(actual.cmds)) - Math.abs(curveArea(expected.cmds))) < 1e-6, `${label}: exact cubic area`);
  near(actual.adv, expected.adv, `${label}: advance`);
  for (const n of expected.drawn.contours.flat()) if (n.authored?.t === 0) {
    const found = actual.drawn.contours.flat().find(p => p.authored?.t === 0 && p.authored.contour === n.authored?.contour && p.authored.segment === n.authored?.segment);
    assert.ok(found, `${label}: original anchor survives subdivision`);
    near(found.x, n.x, `${label}: anchor x`); near(found.y, n.y, `${label}: anchor y`);
  }
}

describe('reviewed weight packages', () => {
  it('pins every package to its bytes, compatible 127-glyph masters, credits and an explicit neutral weight', () => {
    assert.deepEqual(new Set(MASTER_REVISIONS.map(m => m.ref.fontId)),
      new Set(Object.entries(OWN_FAMILIES).map(([family, own]) => `${family}:${own.weight}${own.italic ? 'i' : ''}`)));
    for (const info of MASTER_REVISIONS) {
      const bytes = readFileSync(new URL(`../fonts/masters/${info.ref.digest}.json`, import.meta.url));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), info.ref.digest);
      const data = parseWeightMasters(JSON.parse(bytes.toString()));
      assert.deepEqual(data.source, info.source);
      assert.equal(data.defaultWeight, info.defaultWeight);
      assert.equal(data.masters[0].weight, info.min);
      assert.equal(data.masters[data.masters.length - 1].weight, info.max);
      assert.ok(data.masters.some(m => m.weight === data.defaultWeight));
      for (const master of data.masters) {
        assert.equal(master.data.id, info.ref.fontId);
        assert.equal(Object.keys(master.data.glyphs).length, 127);
        assert.match(master.data.licenseText ?? '', /FONT LICENSE|Apache License/);
        for (const ch of ALL_CHARS) {
          const [advance, contours] = master.data.glyphs[ch];
          assert.ok(advance > 0 && contours.length > 0, `${info.ref.fontId} ${master.weight} ${ch}`);
        }
      }
    }
  });

  it('interpolates anchors, handles, advances and spacing against literal compatible drawings', () => {
    const font: FreeFontData = { id: 'Example:400', family: 'Example', designers: [], copyright: '', license: '', licenseUrl: '', cap: 700, xh: 500, space: 200,
      glyphs: { A: [500, [[[10, 20, null, null, 30, 40], [80, 120, 60, 90], [100, 0]]]] } };
    const data: WeightMasterData = { format: 'weight-masters-v1', source: { kind: 'outline-v1', digest: 'a'.repeat(64), fontId: font.id }, defaultWeight: 400, provenance: [], notes: [],
      masters: [{ weight: 400, data: font }, { weight: 600, data: { ...font, space: 240, glyphs: { A: [560, [[[30, 40, null, null, 70, 60], [100, 160, 80, 130], [140, 0]]]] } } }] };
    const decoded = decodeWeightMasters(parseWeightMasters(data));
    assert.deepEqual(interpolateMasters(decoded, 400), decodeFreeFont(font));
    assert.deepEqual(interpolateMasters(decoded, 600), decodeFreeFont(data.masters[1].data));
    const middle = interpolateMasters(decoded, 500);
    assert.equal(middle.space, 220);
    assert.equal(middle.glyphs.A.adv, 530);
    assert.deepEqual(middle.glyphs.A.contours[0].map(packNode), [[20, 30, null, null, 50, 50], [90, 140, 70, 110], [120, 0]]);
    assert.deepEqual(interpolateMasters(decoded, 1), decoded.masters[0].font);
    assert.deepEqual(interpolateMasters(decoded, 999), decoded.masters[1].font);
    const broken = structuredClone(data); broken.masters[1].data.glyphs.A[1][0].pop();
    assert.throws(() => parseWeightMasters(broken), /compatible/);
  });

  it('serves the complete package and registers its neutral drawing independently of the old source', () => {
    const { ref, info, data } = family('Couture:600');
    assert.deepEqual(sourcePayload(ref), data);
    const neutral = data.masters.find(m => m.weight === data.defaultWeight);
    assert.ok(neutral);
    assert.deepEqual(loadSource(ref), neutral.data);
    assert.deepEqual(sourceFont(ref), decodeFreeFont(neutral.data));
    assert.ok(sourceMasters(ref));
    const old = loadSource(info.source);
    assert.notDeepEqual(old.glyphs['*'], neutral.data.glyphs['*'], 'the new repair is separate from the old snapshot');
    assert.deepEqual(loadSource(info.source).glyphs['*'], old.glyphs['*']);
    assert.throws(() => loadSource({ ...ref, fontId: 'Wrong:400' }), /match|unavailable/);
    assert.throws(() => loadSource({ ...ref, kind: 'outline-v1' }), /match|unavailable|reference/);
    assert.throws(() => loadSource({ ...info.source, kind: 'masters-v1' }), /match|unavailable|reference/);
    assert.equal(sourceFont({ ...ref, kind: 'outline-v1' }), undefined);
    assert.equal(sourceMasters({ ...ref, kind: 'outline-v1' }), undefined);
    assert.equal(sourceFont({ ...ref, fontId: 'Wrong:400' }), undefined);
    assert.equal(sourceMasters({ ...ref, fontId: 'Wrong:400' }), undefined);
  });

  it('draws exact master coordinates at slider endpoints and keeps all characters finite in between', () => {
    for (const fontId of ['Mainline:600', 'Couture:600', 'Sonnet:400i']) {
      const { data, info, params } = family(fontId);
      for (const master of data.masters) {
        const p = { ...params, weight: sliderAt(master.weight, params.weight, info) }, font = buildFont(p);
        assert.equal(font.source?.state, 'ready');
        for (const ch of ALL_CHARS) {
          const actual = font.glyph(ch); assert.ok(actual?.drawn);
          assert.deepEqual(actual.drawn.contours.map(c => c.map(packNode)), master.data.glyphs[ch][1], `${fontId} ${master.weight} ${ch}`);
          assert.equal(actual.adv, master.data.glyphs[ch][0]);
        }
      }
      const font = buildFont({ ...params, weight: .371, height: .84, xHeight: .19, width: .73, extenders: .61, descender: .24 });
      for (const ch of ALL_CHARS) {
        const g = font.glyph(ch); assert.ok(g && g.cmds.length > 0);
        assert.ok(g.adv > 0 && Number.isFinite(g.adv));
        for (const cmd of g.cmds) for (const value of cmd.slice(1)) assert.ok(typeof value === 'number' && Number.isFinite(value));
      }
    }
  });

  it('uses both endpoint defaults without dividing by zero', () => {
    for (const fontId of ['Sonnet:400i', 'Gumdrop:700']) {
      const { info, params } = family(fontId);
      assert.equal(weightAt(params, info), info.defaultWeight);
      assert.equal(weightAt({ ...params, weight: 0 }, info), info.min);
      assert.equal(weightAt({ ...params, weight: 1 }, info), info.max);
      assert.equal(sliderAt(info.min, params.weight, info), 0);
      assert.equal(sliderAt(info.max, params.weight, info), 1);
      near(sliderAt(weightAt({ ...params, weight: .37 }, info), params.weight, info), .37, fontId);
    }
  });
});

describe('weight edits, saved designs and export', () => {
  it('keeps generated height cuts exact through weight changes, transformed placement, and repeated saves', () => {
    for (const id of ['Mainline:600', 'Hearth:600', 'Couture:600']) {
      const { params } = family(id), p: Params = { ...params, height: .79, xHeight: .92, extenders: .18, descender: .81, width: .72, slant: .23, rotation: .62, sideBearing: .3, mirror: 'mirrored' };
      for (const ch of 'hjy') {
        const original = glyph(p, ch);
        const saved = sanitizeParams(JSON.parse(JSON.stringify({ ...p, outlines: { [ch]: { ...original.drawn, at: drawnAtOf(p, ch) } } })));
        assert.deepEqual(saved.outlines[ch].contours[0][0].authored, original.drawn.contours[0][0].authored);
        for (const weight of [0, 1]) {
          const changed = { ...saved, weight }, actual = glyph(changed, ch);
          sameDrawing(actual, glyph({ ...p, weight }, ch), `${id} ${ch} ${weight}`);
          const again = sanitizeParams(JSON.parse(JSON.stringify({ ...changed, outlines: { [ch]: { ...actual.drawn, at: drawnAtOf(changed, ch) } } })));
          sameDrawing(glyph({ ...again, weight: p.weight }, ch), original, `${id} ${ch} saved return`);
        }
      }
    }
  });

  it('keeps real point offsets through a second edit after changing lowercase heights and weight', () => {
    const { params } = family(), p: Params = { ...params, height: .8, xHeight: .9, extenders: .2, rotation: .63, mirror: 'mirrored' };
    const original = glyph(p, 'h'), changed = structuredClone(original.drawn), n = changed.contours[0][0];
    n.x += 7;
    if (n.ix !== undefined) n.ix += 7;
    if (n.ox !== undefined) n.ox += 7;
    const edited: Params = { ...p, outlines: { h: { ...changed, at: drawnAtOf(p, 'h') } } }, heavy = { ...edited, weight: 1 };
    const first = glyph(heavy, 'h'), plain = glyph({ ...p, weight: 1 }, 'h');
    near(first.drawn.contours[0][0].x, plain.drawn.contours[0][0].x + 7, 'first point offset');
    const second = structuredClone(first.drawn), point = second.contours[0][0]; point.x += 3;
    if (point.ix !== undefined) point.ix += 3;
    if (point.ox !== undefined) point.ox += 3;
    const saved = sanitizeParams(JSON.parse(JSON.stringify({ ...heavy, outlines: { h: { ...second, at: drawnAtOf(heavy, 'h') } } })));
    const returned = glyph({ ...saved, weight: p.weight }, 'h');
    near(returned.drawn.contours[0][0].x, original.drawn.contours[0][0].x + 10, 'two saved point offsets');
    near(returned.drawn.contours[0][0].y, original.drawn.contours[0][0].y, 'point y after return');
  });

  it('keeps contour reversal attached to source curves when weights change', () => {
    const { params } = family(), p = { ...params, xHeight: .9, height: .75 };
    for (const ch of 'Hh') {
      const original = glyph(p, ch);
      let reversed = original.drawn.contours;
      for (let ci = 0; ci < reversed.length; ci++) reversed = reverseContour(reversed, ci);
      const edited: Params = { ...p, outlines: { [ch]: { ...original.drawn, contours: reversed, at: drawnAtOf(p, ch) } } };
      for (const weight of [0, 1]) sameDrawing(glyph({ ...edited, weight }, ch), glyph({ ...p, weight }, ch), `${ch} reversed ${weight}`);
    }
  });

  it('keeps Pen curve subdivisions exact at Mainline a weight endpoints and after repeated saves', () => {
    const { params } = family(), p: Params = { ...params, xHeight: .9, height: .8, rotation: .61, mirror: 'mirrored' };
    const original = glyph(p, 'a'), ci = original.drawn.contours.findIndex(c => c.some(n => n.ox !== undefined));
    const ni = original.drawn.contours[ci].findIndex(n => n.ox !== undefined);
    const cut = splitSegment(original.drawn.contours, ci, ni, .4);
    assert.ok(cut[ci][ni + 1].authored, 'a Pen subdivision keeps the source parameter');
    const twice = splitSegment(cut, ci, ni, .37);
    const edited = sanitizeParams(JSON.parse(JSON.stringify({ ...p, outlines: { a: { ...original.drawn, contours: twice, at: drawnAtOf(p, 'a') } } })));
    for (const weight of [0, 1]) {
      const changed = { ...edited, weight }, actual = glyph(changed, 'a');
      sameDrawing(actual, glyph({ ...p, weight }, 'a'), `Mainline a split ${weight}`);
      const saved = sanitizeParams(JSON.parse(JSON.stringify({ ...changed, outlines: { a: { ...actual.drawn, at: drawnAtOf(changed, 'a') } } })));
      sameDrawing(glyph({ ...saved, weight: p.weight }, 'a'), original, 'Mainline a split saved return');
    }
  });

  it('keeps deliberately altered handles when their curve is split and transported twice', () => {
    const { params } = family(), p: Params = { ...params, xHeight: .88, height: .76, rotation: .58, mirror: 'mirrored' };
    const original = glyph(p, 'a'), ci = original.drawn.contours.findIndex(c => c.some(n => n.ox !== undefined));
    const ni = original.drawn.contours[ci].findIndex(n => n.ox !== undefined), n = original.drawn.contours[ci][ni];
    assert.ok(n.ox !== undefined && n.oy !== undefined);
    const altered = setHandle(original.drawn.contours, { c: ci, i: ni }, 'o', { x: n.ox + 12, y: n.oy - 9 }, true);
    const cut = splitSegment(altered, ci, ni, .43), at = drawnAtOf(p, 'a');
    const unsplit: Params = { ...p, outlines: { a: { ...original.drawn, contours: altered, at } } };
    const edited: Params = { ...p, outlines: { a: { ...original.drawn, contours: cut, at } } };
    for (const weight of [0, 1]) sameDrawing(glyph({ ...edited, weight }, 'a'), glyph({ ...unsplit, weight }, 'a'), `altered split ${weight}`);
    const heavy = { ...edited, weight: 1 }, first = glyph(heavy, 'a');
    const saved = sanitizeParams(JSON.parse(JSON.stringify({ ...heavy, outlines: { a: { ...first.drawn, at: drawnAtOf(heavy, 'a') } } })));
    sameDrawing(glyph({ ...saved, weight: p.weight }, 'a'), glyph(unsplit, 'a'), 'altered split save return');
  });

  it('carries exact source parameters across closing and reversed Pen subdivisions', () => {
    const { params } = family(), p = { ...params, xHeight: .9, height: .8 }, original = glyph(p, 'a');
    for (const reverse of [false, true]) {
      let contours = original.drawn.contours;
      if (reverse) for (let ci = 0; ci < contours.length; ci++) contours = reverseContour(contours, ci);
      const ni = contours[0].length - 1, cut = splitSegment(contours, 0, ni, .39);
      assert.ok(cut[0][ni + 1].authored, 'closing edge retains its source segment');
      const edited: Params = { ...p, outlines: { a: { ...original.drawn, contours: cut, at: drawnAtOf(p, 'a') } } };
      for (const weight of [0, 1]) sameDrawing(glyph({ ...edited, weight }, 'a'), glyph({ ...p, weight }, 'a'), `closing split ${reverse} ${weight}`);
    }
  });

  it('treats shapes pasted from another letter as new geometry instead of matching its source indices', () => {
    const { params } = family(), original = glyph(params, 'A'), copied = glyph(params, 'H');
    assert.equal(original.drawn.contours[1].length, copied.drawn.contours[1].length, 'the two crossbars have colliding contour and node indices');
    const pasted = copied.drawn.contours.map(c => c.map(n => ({ ...n })));
    const unbound = pasted.map(c => c.map(n => { const copy = { ...n }; delete copy.authored; return copy; }));
    const withPaste = (contours: typeof pasted): Params => sanitizeParams(JSON.parse(JSON.stringify({ ...params, outlines: {
      A: { ...original.drawn, contours: [...original.drawn.contours, ...contours], at: drawnAtOf(params, 'A') },
    } })));
    const saved = withPaste(pasted);
    assert.equal(saved.outlines.A.contours[original.drawn.contours.length + 1][0].authored?.glyph, 'H');
    for (const weight of [0, 1]) {
      const actual = glyph({ ...saved, weight }, 'A'), expected = glyph({ ...withPaste(unbound), weight }, 'A');
      assert.deepEqual(actual.drawn.contours.map(c => c.map(packNode)), expected.drawn.contours.map(c => c.map(packNode)));
      assert.equal(actual.drawn.contours[0][0].authored?.glyph, 'A');
    }
  });

  it('keeps a duplicated shape bound to its source when pasted within the same letter', () => {
    const { params } = family(), original = glyph(params, 'H');
    const shifted = (contours: typeof original.drawn.contours) => contours.map(c => c.map(n => ({ ...n, x: n.x + 35,
      ...(n.ix === undefined ? {} : { ix: n.ix + 35 }), ...(n.ox === undefined ? {} : { ox: n.ox + 35 }),
    })));
    const pasted = sanitizeParams(JSON.parse(JSON.stringify({ ...params, outlines: { H: { ...original.drawn,
      contours: [...original.drawn.contours, ...shifted(original.drawn.contours)], at: drawnAtOf(params, 'H'),
    } } })));
    for (const weight of [0, 1]) {
      const actual = glyph({ ...pasted, weight }, 'H'), expected = glyph({ ...params, weight }, 'H');
      const duplicate = actual.drawn.contours.slice(original.drawn.contours.length), target = shifted(expected.drawn.contours);
      assert.deepEqual(duplicate.map(c => c.length), target.map(c => c.length));
      duplicate.forEach((c, ci) => c.forEach((n, ni) => {
        const values = packNode(n), wanted = packNode(target[ci][ni]);
        assert.equal(values.length, wanted.length);
        values.forEach((v, i) => { const w = wanted[i]; if (typeof v === 'number' && typeof w === 'number') near(v, w, 'duplicate point'); else assert.equal(v, w); });
      }));
      assert.equal(actual.drawn.contours[original.drawn.contours.length][0].authored?.glyph, 'H');
    }
  });

  it('keeps a point offset while both height and weight change, then returns after saving', () => {
    const { params, data } = family(), first = glyph(params, 'H'), edited = structuredClone(first.drawn), n = edited.contours[0][0];
    n.x += 17; n.y += 3;
    if (n.ix !== undefined && n.iy !== undefined) { n.ix += 17; n.iy += 3; }
    if (n.ox !== undefined && n.oy !== undefined) { n.ox += 17; n.oy += 3; }
    const p: Params = { ...params, outlines: { H: { ...edited, at: drawnAtOf(params, 'H') } } };
    const changed = { ...p, weight: 1, height: 1 }, actual = glyph(changed, 'H'), target = data.masters[data.masters.length - 1].data.glyphs.H[1][0][0];
    near(actual.drawn.contours[0][0].x, target[0] + 17, 'edited x');
    near(actual.drawn.contours[0][0].y, (target[1] + 3) * 1.28, 'edited y');
    const saved = sanitizeParams(JSON.parse(JSON.stringify({ ...changed, outlines: { H: { ...actual.drawn, at: drawnAtOf(changed, 'H') } } })));
    const returned = glyph({ ...saved, weight: params.weight, height: params.height }, 'H');
    returned.drawn.contours.forEach((c, ci) => c.forEach((node, ni) => { near(node.x, edited.contours[ci][ni].x, 'returned x'); near(node.y, edited.contours[ci][ni].y, 'returned y'); }));
    assert.deepEqual(glyph(changed, 'B').cmds, glyph({ ...changed, outlines: {} }, 'B').cmds);
  });

  it('moves an inserted point with its authored straight edge through height and weight', () => {
    const { params, data } = family(), original = glyph(params, 'H'), edited = structuredClone(original.drawn), contour = edited.contours[0];
    const a = contour[0], b = contour[1];
    assert.equal(a.y, b.y, 'chosen edge is horizontal');
    contour.splice(1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const p: Params = { ...params, outlines: { H: { ...edited, at: drawnAtOf(params, 'H') } } };
    const made = glyph({ ...p, weight: 1, height: 1 }, 'H'), heavy = data.masters[data.masters.length - 1].data.glyphs.H[1][0];
    assert.equal(made.drawn.contours[0].length, contour.length);
    near(made.drawn.contours[0][1].x, (heavy[0][0] + heavy[1][0]) / 2, 'inserted x');
    near(made.drawn.contours[0][1].y, (heavy[0][1] + heavy[1][1]) / 2 * 1.28, 'inserted y');
    assert.notDeepEqual(made.cmds, drawnCmds(edited.contours));
    assert.deepEqual(glyph(sanitizeParams(JSON.parse(JSON.stringify(p))), 'H').cmds, drawnCmds(edited.contours));
  });

  it('keeps version 8 outline documents on their exact source until explicitly switched', () => {
    assert.equal(PARAMS_VERSION, 9);
    const ref = sourceForFont('Couture:600'); assert.ok(ref);
    loadSource(ref);
    const params: Params = { ...DEFAULTS, freeFont: ref.fontId, sourceProgram: ref, freeAt: freeAtOf(DEFAULTS) };
    const before = glyph(params, '*').cmds;
    family('Couture:600');
    const loaded = sanitizeParams(upgradeParams(JSON.parse(JSON.stringify(params)), 8));
    assert.deepEqual(loaded.sourceProgram, ref);
    assert.deepEqual(glyph(loaded, '*').cmds, before);
  });

  it('offers only the real family range and preserves the current drawing at an in-between weight', () => {
    const { params, info } = family('Couture:600');
    assert.deepEqual(familyStylesFor(params).map(m => m.style), ['Medium', 'SemiBold', 'Bold']);
    assert.throws(() => familyMember(params, 'semibold', 'regular', false), /outside/);
    assert.throws(() => familyMember(params, 'semibold', 'bold', true), /outside/);
    const medium = familyMember(params, 'semibold', 'medium', false);
    assert.equal(weightAt(medium.params, info), 500);
    const current = { ...params, weight: sliderAt(650, params.weight, info) };
    const bytes = buildOTF(current, 'Current authored family'), exported = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    assert.equal(exported.tables.os2.usWeightClass, 650);
    const previewStart = glyph(current, 'H').cmds[0], exportedStart = exported.charToGlyph('H').path.commands[0];
    assert.equal(exportedStart.type, 'M');
    assert.ok(exportedStart.type === 'M');
    assert.equal(exportedStart.x, Math.round(previewStart[1]));
    assert.equal(exportedStart.y, Math.round(previewStart[2]));
    assert.notDeepEqual(glyph(current, 'H').cmds, glyph(familyMember(params, 'semibold', 'semibold', false).params, 'H').cmds);
  });

  it('exports all 127 preview outlines and advances with only OpenType integer rounding', () => {
    const { params } = family('Couture:600'), changed = { ...params, weight: .73, height: .65, xHeight: .81, width: .74, slant: .28, letterSpacing: .25 };
    const preview = buildFont(changed), bytes = buildOTF(changed, 'Authored weight test');
    const exported = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    assert.equal(exported.glyphs.length, 130);
    for (const ch of ALL_CHARS) {
      const g = preview.glyph(ch); assert.ok(g);
      const actual = exported.charToGlyph(ch); assert.notEqual(actual.index, 0);
      assert.equal(actual.advanceWidth, Math.round(Math.max(20, g.adv + preview.m.track)));
      const commands: Cmd[] = actual.path.commands.map(command => {
        switch (command.type) {
          case 'M': return ['M', command.x, command.y];
          case 'L': return ['L', command.x, command.y];
          case 'C': return ['C', command.x1, command.y1, command.x2, command.y2, command.x, command.y];
          case 'Z': return ['Z'];
          default: throw Error(`Unexpected exported command ${command.type}`);
        }
      });
      assert.deepEqual(commands, g.cmds.map(c => c.map(v => typeof v === 'number' ? Math.round(v) || 0 : v)), ch);
    }
    assert.equal(exported.charToGlyph(' ').advanceWidth, Math.round(Math.max(40, preview.m.space + preview.m.track)));
  });

  it('serves master payloads and uses them in a fresh export worker', async () => {
    const { params, ref, data } = family('Couture:600'), store = new DesignStore(':memory:'), pool = new ExportPool(1);
    const server = createApp(store, { exports: pool }).listen(0);
    try {
      await new Promise<void>(resolve => server.once('listening', resolve));
      const address = server.address(); assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/api`, response = await fetch(`${base}/sources/${ref.digest}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      assert.deepEqual(parseWeightMasters(await response.json()), data);
      for (const requested of [{ weight: 'regular', italic: false }, { weight: 'bold', italic: true }]) {
        for (const [path, selection] of [
          ['/export/otf', { member: { anchor: 'semibold', ...requested } }],
          ['/export/family', { family: { anchor: 'semibold', styles: [requested] } }],
        ] satisfies [string, Record<string, unknown>][]) {
          const rejected = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Unavailable authored member', params, ...selection }) });
          assert.equal(rejected.status, 400, `${path} ${JSON.stringify(requested)}`);
        }
      }
      const wrongKind = await fetch(`${base}/export/otf`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Mismatched source interpreter', params: { ...params, sourceProgram: { ...ref, kind: 'outline-v1' } } }) });
      assert.equal(wrongKind.status, 409, 'a loaded digest cannot be reused with the wrong interpreter');
      const at = { ...params, weight: .67, height: .75, width: .81, xHeight: .22 };
      const changed: Params = { ...at, weight: .43, outlines: { h: { ...glyph(at, 'h').drawn, at: drawnAtOf(at, 'h') } } };
      const result = await fetch(`${base}/export/otf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Worker weight test', params: changed }) });
      assert.equal(result.status, 200);
      const actual = opentype.parse(await result.arrayBuffer()), bytes = buildOTF(changed, 'Worker weight test');
      const expected = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
      assert.equal(actual.glyphs.length, 130);
      for (const ch of ALL_CHARS) {
        assert.deepEqual(actual.charToGlyph(ch).path.commands, expected.charToGlyph(ch).path.commands, ch);
        assert.equal(actual.charToGlyph(ch).advanceWidth, expected.charToGlyph(ch).advanceWidth, ch);
      }
    } finally {
      pool.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
      store.close();
    }
  });
});
