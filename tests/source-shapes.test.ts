/* Verticals and Horizontals (`source-strokes-v1`) and the shape controls (`source-shapes-v1` in the finish policy) on
   sources: each about the style's own, drawing what the program before drew there; the widths' and heights' weights
   moved apart; round contours squared or boxed; facets; corners rounded, sharpened, stepped and cut flat; joins and
   counters filled; a waist pinched to a point at 100 (`source-pinch-v1`) on every stroke but a level one (an S's
   spine too), joins held (a K's arm on its stem), smooth round a bowl and whole at every height; serifs added to a sans; every stroke-end form (`source-ends-v1`); counters grown
   and shrunk and curving ends opened and closed (`source-insides-v1`); every style kept whole at strong settings;
   adoption and export. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Clipper64, ClipType, FillRule, PolyTree64, type PolyPath64 } from 'clipper2-ts';
import { buildFont } from '../shared/engine';
import type { Cmd } from '../shared/engine/types';
import { DEFAULTS, freeAtOf, type Params } from '../shared/params';
import { adoptProgram } from '../shared/source/adoption';
import { sourceSupports } from '../shared/source/capabilities';
import { strokeAxes } from '../shared/source/contrast';
import { sourceFinishPolygons, sourceFinishPrecision } from '../shared/source/finish';
import { masterInfo } from '../shared/source/master-catalog';
import { PROGRAM_REVISIONS, programInfo } from '../shared/source/program-catalog';
import type { ProgramSourceRef } from '../shared/source/model';
import { END_CONTROLS, INSIDE_CONTROLS, SHAPE_CONTROLS } from '../shared/source/shapes';
import { loadDesignSources, loadSource } from '../server/sources';
import { buildOTF } from '../server/export';
import { opentype } from '../server/opentype';
import { traceOf } from '../client/lib/pen';

function united(cmds: Cmd[]): PolyTree64 {
  const clipper = new Clipper64(), tree = new PolyTree64();
  clipper.addSubject(sourceFinishPolygons(cmds, .05).map(p => p.map(q => ({ x: Math.round(q.x * 1e5), y: Math.round(q.y * 1e5) }))));
  clipper.execute(ClipType.Union, FillRule.NonZero, tree);
  return tree;
}
function measure(cmds: Cmd[]): { area: number; pieces: number } {
  let area = 0, pieces = 0;
  const visit = (node: PolyTree64 | PolyPath64) => {
    for (let i = 0; i < node.count; i++) {
      const child = node.child(i), poly = child.polygon ?? [];
      const signed = poly.reduce((s, a, k) => { const b = poly[(k + 1) % poly.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2e10;
      if (child.isHole) area -= Math.abs(signed); else { area += Math.abs(signed); pieces++; }
      visit(child);
    }
  };
  visit(united(cmds));
  return { area, pieces };
}
const box = (cmds: Cmd[]) => {
  const ps = sourceFinishPolygons(cmds, .05).flat();
  return { x0: Math.min(...ps.map(p => p.x)), x1: Math.max(...ps.map(p => p.x)), y0: Math.min(...ps.map(p => p.y)), y1: Math.max(...ps.map(p => p.y)) };
};
/** How wide the ink is along a level line at `y`. */
function across(cmds: Cmd[], y: number): number {
  const xs: number[] = [];
  for (const poly of sourceFinishPolygons(cmds, .05)) poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    if ((a.y - y) * (b.y - y) < 0) xs.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
  });
  xs.sort((a, b) => a - b);
  let w = 0; for (let i = 0; i + 1 < xs.length; i += 2) w += xs[i + 1] - xs[i];
  return w;
}

/** The ink's level runs at `y` (or, `upright`, its upright runs at x = `y`), in order. */
function runsAt(cmds: Cmd[], y: number, upright = false): [number, number][] {
  const hits: number[] = [];
  for (const poly of sourceFinishPolygons(cmds, .05)) poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length], [a, b, u, v] = upright ? [p.x, q.x, p.y, q.y] : [p.y, q.y, p.x, q.x];
    if ((a - y) * (b - y) < 0) hits.push(u + (v - u) * (y - a) / (b - a));
  });
  hits.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
  return out;
}

const current = [...new Map(PROGRAM_REVISIONS.map(entry => [entry.ref.fontId, entry])).values()];
const beforePinch = (fontId: string) => PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === fontId && entry.data.finish?.shapes && !entry.data.finish.pinch)!;
const before = (fontId: string) => PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === fontId && !entry.data.finish?.shapes && !entry.data.strokes)!;
const beforeEnds = (fontId: string) => PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === fontId && !entry.data.finish?.ends)!;
const of = (fontId: string) => current.find(entry => entry.ref.fontId === fontId)!.ref;
function params(ref: ProgramSourceRef, set: Partial<Params> = {}): Params {
  const info = masterInfo(ref), width = programInfo(ref)?.width;
  assert.ok(info && width); loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min), neutral = (width.neutral - width.min) / (width.max - width.min);
  const p: Params = { ...DEFAULTS, sourceProgram: ref, freeFont: ref.fontId, weight, width: neutral, freeAt: { ...freeAtOf(DEFAULTS), weight, width: neutral, dotSize: .5 }, ...set };
  loadDesignSources(p);
  return p;
}
const glyph = (p: Params, ch: string) => buildFont(p).glyph(ch)!;

describe('source strokes and shapes', () => {
  it('is pinned in every current program, and the style\'s own settings draw what the program before drew', () => {
    for (const entry of current) {
      assert.deepEqual(entry.data.strokes, { format: 'source-strokes-v1', reach: .5 }, entry.ref.fontId);
      assert.ok(entry.data.finish?.shapes, entry.ref.fontId);
      const p = params(entry.ref), older = params(before(entry.ref.fontId).ref);
      for (const key of ['vWeight', 'hWeight', ...SHAPE_CONTROLS] as const) {
        assert.equal(sourceSupports(p, key), true, key);
        if (key !== 'roundness') assert.equal(sourceSupports(older, key), false, key);
      }
      for (const ch of 'HOkA') assert.deepEqual(glyph(p, ch).cmds, glyph(older, ch).cmds, `${entry.ref.fontId} ${ch}`);
    }
  });

  it('moves the widths\' and heights\' weights apart, the rest the other way where one runs out', () => {
    const policy = { format: 'source-strokes-v1' as const, reach: .5 }, range = { min: 300, max: 800 };
    assert.deepEqual(strokeAxes(policy, { x: 600, y: 600 }, range, .5, .5, .5, .5), { x: 600, y: 600 });
    assert.deepEqual(strokeAxes(policy, { x: 600, y: 600 }, range, 1, .5, .5, .5), { x: 800, y: 550 }, 'heavier uprights, past the heaviest the level strokes lighter');
    assert.deepEqual(strokeAxes(policy, { x: 600, y: 600 }, range, .5, .5, 0, .5), { x: 600, y: 350 });
    const p = params(of('Mainline:600')), H = glyph(p, 'H'), mid = (box(H.cmds).y0 + box(H.cmds).y1) / 2;
    const stem = (q: Params) => across(glyph(q, 'H').cmds, mid * .4), bar = (q: Params) => { const g = glyph(q, 'H'); const b = box(g.cmds); return across(g.cmds, b.y0) || 1; };
    assert.ok(stem({ ...p, vWeight: 1 }) > stem(p) * 1.05, 'Verticals thickens the stems');
    assert.ok(stem({ ...p, vWeight: 0 }) < stem(p) * .95);
    assert.ok(measure(glyph({ ...p, hWeight: 1 }, 'E').cmds).area > measure(glyph(p, 'E').cmds).area, 'Horizontals thickens the arms');
    void bar;
  });

  it('squares round contours, boxes them, and cuts curves into facets', () => {
    const p = params(of('Mainline:600')), O = glyph(p, 'O'), area = measure(O.cmds).area;
    assert.ok(measure(glyph({ ...p, squareness: 1 }, 'O').cmds).area > area * 1.04, 'squarer');
    assert.ok(measure(glyph({ ...p, bowlForm: 'box' }, 'O').cmds).area > measure(glyph({ ...p, squareness: 1 }, 'O').cmds).area * .98, 'a box');
    assert.deepEqual(glyph({ ...p, squareness: 1 }, 'S').cmds, glyph(p, 'S').cmds, 'an S has no box to fill');
    const faceted = glyph({ ...p, chamfer: 1 }, 'O').cmds;
    assert.ok(faceted.every(c => c[0] !== 'C') && faceted.length < O.cmds.length * 4);
    assert.ok(glyph({ ...p, chamfer: .3 }, 'O').cmds.length > faceted.length, 'finer facets lower down');
  });

  it('rounds, steps and cuts corners, and fills joins and counters', () => {
    const p = params(of('Mainline:600')), H = measure(glyph(p, 'H').cmds).area;
    assert.ok(measure(glyph({ ...p, roundness: 1 }, 'H').cmds).area < H, 'rounded corners');
    assert.ok(measure(glyph({ ...p, steps: 1 }, 'H').cmds).area < H, 'stepped corners');
    const k = measure(glyph(p, 'k').cmds).area;
    assert.ok(measure(glyph({ ...p, joinRound: 1 }, 'k').cmds).area > k, 'filled crotches');
    const D = measure(glyph(p, 'D').cmds).area;
    assert.ok(measure(glyph({ ...p, innerRound: 1 }, 'D').cmds).area > D, 'rounded counters');
    assert.ok(measure(glyph({ ...p, apex: 1 }, 'V').cmds).area < measure(glyph(p, 'V').cmds).area, 'a point cut flat');
    assert.ok(measure(glyph({ ...p, bends: 'round' }, 'Z').cmds).area !== measure(glyph(p, 'Z').cmds).area, 'a round bend');
  });

  it('pinches the strokes round a height, and adds serifs to a sans', () => {
    const p = params(of('Mainline:600')), H = glyph(p, 'H'), cap = buildFont(p).m.cap;
    const waist = (q: Params) => across(glyph(q, 'H').cmds, cap * .3);
    assert.ok(waist({ ...p, pinch: 1, pinchPos: .3 }) < waist(p) * .8);
    assert.ok(Math.abs(across(glyph({ ...p, pinch: 1, pinchPos: .3 }, 'H').cmds, cap * .9) - across(H.cmds, cap * .9)) < 1, 'away from the waist, as drawn');
    const l = glyph(p, 'l'), serifed = glyph({ ...p, serif: true, serifShape: 'slab' }, 'l');
    assert.ok(across(serifed.cmds, 5) > across(l.cmds, 5) * 1.4, 'a foot');
    assert.equal(serifed.adv, l.adv);
    for (const shape of ['bracketed', 'unbracketed', 'wedge', 'diamond'] as const) {
      assert.notDeepEqual(glyph({ ...p, serif: true, serifShape: shape }, 'l').cmds, l.cmds, shape);
    }
    const couture = params(of('Couture:600'), { serif: true, freeAt: { ...params(of('Couture:600')).freeAt, serif: true } });
    assert.deepEqual(glyph(couture, 'l').cmds, glyph({ ...couture, serif: false, freeAt: { ...couture.freeAt, serif: false } }, 'l').cmds, 'a serif style keeps its own');
  });

  it('draws the waist to a point at 100 on every stroke but a level one, holds joins, and keeps letters smooth and whole', () => {
    for (const entry of current) assert.deepEqual(entry.data.finish?.pinch, { format: 'source-pinch-v1', depth: .985, reach: .18 }, entry.ref.fontId);
    const p = params(of('Mainline:600')), cap = buildFont(p).m.cap, waist = cap * .5, reach = cap * .18;
    // a stem takes about half at 50 and comes to a point at 100, about its middle; the program before took 60% at 100
    const stem = (q: Params) => runsAt(glyph(q, 'l').cmds, waist)[0], [a, b] = stem(p), thick = b - a;
    const half = stem({ ...p, pinch: .5 }), point = stem({ ...p, pinch: 1 });
    assert.ok(Math.abs((half[1] - half[0]) / thick - .51) < .05, 'half a pinch, half the stroke');
    assert.ok(point[1] - point[0] < thick * .05, 'to a point (a thread of it, the stroke held together)');
    assert.ok(Math.abs(point[0] + point[1] - a - b) < 1, 'about the stroke\'s middle');
    const older = stem(params(beforePinch('Mainline:600').ref, { pinch: 1 }));
    assert.ok(Math.abs((older[1] - older[0]) / thick - .4) < .05, 'the program before');
    // a bar on the waist keeps its thickness and runs on to its thinner stems; an arm's cut end stays where it was
    const H = glyph(p, 'H'), middle = (box(H.cmds).x0 + box(H.cmds).x1) / 2, bar = runsAt(H.cmds, middle, true)[0];
    assert.ok(bar[0] < waist && bar[1] > waist, 'the H\'s bar lies on the waist');
    const pinched = glyph({ ...p, pinch: 1 }, 'H'), barThere = runsAt(pinched.cmds, middle, true)[0];
    assert.ok(Math.abs(barThere[0] - bar[0]) < .5 && Math.abs(barThere[1] - bar[1]) < .5, 'the bar as thick');
    assert.equal(measure(pinched.cmds).pieces, 1);
    const armAt = (bar[0] + bar[1]) / 2, arm = runsAt(glyph(p, 'E').cmds, armAt).at(-1)!, armThere = runsAt(glyph({ ...p, pinch: 1 }, 'E').cmds, armAt).at(-1)!;
    assert.ok(Math.abs(armThere[1] - arm[1]) < .5, 'the arm\'s end where it was');
    // a stroke running at a slant thins as an upright one does: an S's spine, at its middle
    const spine = (q: Params) => { const S = glyph(q, 'S'), b = box(S.cmds), [, [y0, y1]] = runsAt(S.cmds, (b.x0 + b.x1) / 2, true); return y1 - y0; };
    assert.ok(spine({ ...p, pinch: .5 }) < spine(p) * .65 && spine({ ...p, pinch: 1 }) < spine(p) * .15, 'the S\'s spine');
    // a join holds: a K's arm and leg hang on to its stem at the waist by the ink they share, not by a thread
    const stemOf = (q: Params) => runsAt(glyph(q, 'K').cmds, waist)[0], [s0, s1] = stemOf(p), joined = stemOf({ ...p, pinch: 1 });
    assert.ok(joined[1] > s1 + (s1 - s0) * .5, 'the K\'s stem and the arm\'s root one run at the waist');
    for (let y = waist - 60; y <= waist + 60; y += 3) {
      const [a0, a1] = runsAt(glyph({ ...p, pinch: 1 }, 'K').cmds, y)[0];
      assert.ok(a1 - a0 > (s1 - s0) * .6, `the K held together ${(y - waist).toFixed(0)} from the waist`);
    }
    // round a bowl the waist narrows smoothly: the side of an O nowhere wider nearer the waist (no spike, no notch)
    for (const set of [{ pinch: .5 }, { pinch: 1 }, { pinch: .5, weight: 1, vWeight: 1, hWeight: .85, contrast: 1 }]) {
      const O = glyph({ ...p, ...set }, 'O');
      for (const way of [1, -1]) {
        let last = 0;
        for (let k = 0; k < 20; k++) {
          const [l, r] = runsAt(O.cmds, waist + way * k * reach / 20)[0], width = r - l;
          assert.ok(width >= last - .5, `${JSON.stringify(set)}: the O's side ${k} twentieths from the waist`);
          last = width;
        }
      }
    }
    // a design on the program before keeps as deep a waist when it adopts this one
    const old = params(beforePinch('Mainline:600').ref, { pinch: .5 }), adopted = adoptProgram(old)!;
    assert.equal(adopted.sourceProgram?.kind === 'program-v1' && adopted.sourceProgram.digest, of('Mainline:600').digest);
    assert.ok(Math.abs(adopted.pinch - .5 * .6 / .985) < 1e-9);
    const was = stem(old), now = stem(adopted);
    assert.ok(Math.abs(was[1] - was[0] - (now[1] - now[0])) < .05, 'as deep a waist');
  });

  it('draws every stroke-end form on the style\'s flat ends, and the style\'s own as it was', () => {
    for (const entry of current) {
      assert.deepEqual(entry.data.finish?.ends, { format: 'source-ends-v1', reach: 1.6, bulge: .45 }, entry.ref.fontId);
      const older = params(beforeEnds(entry.ref.fontId).ref);
      assert.equal(sourceSupports(params(entry.ref), 'terminal'), true); assert.equal(sourceSupports(older, 'terminal'), false);
      for (const key of END_CONTROLS) assert.equal(sourceSupports(params(entry.ref), key), true, key);
    }
    const p = params(of('Mainline:600'), { freeAt: { ...params(of('Mainline:600')).freeAt, terminal: 'flat', terminalForm: 'plain' } });
    const plain = (ch: string) => glyph(p, ch).cmds;
    for (const [terminal, form] of [['flat', 'flared'], ['flat', 'scooped'], ['round', 'round'], ['sharp', 'pointed'], ['sharp', 'clipped'],
      ['angled', 'outer'], ['angled', 'inner'], ['cut', 'notched'], ['tapered', 'taper'], ['tapered', 'brush']] as const) {
      assert.notDeepEqual(glyph({ ...p, terminal, terminalForm: form }, 'n').cmds, plain('n'), form);
    }
    // a ball ends a curving stroke, not a stem's foot
    for (const form of ['droplet', 'ball'] as const) {
      assert.notDeepEqual(glyph({ ...p, terminal: 'round', terminalForm: form }, 'c').cmds, plain('c'), form);
      assert.deepEqual(glyph({ ...p, terminal: 'round', terminalForm: form }, 'l').cmds, plain('l'), form);
    }
    assert.deepEqual(glyph({ ...p, terminal: 'flat', terminalForm: 'plain', terminalFlare: 1 }, 'n').cmds, plain('n'), 'the style\'s own');
    // the sliders move it
    const area = (set: Partial<Params>) => measure(glyph({ ...p, terminal: 'sharp', terminalForm: 'pointed', ...set }, 'l').cmds).area;
    assert.ok(area({ terminalPoint: 1 }) < area({ terminalPoint: 0 }));
    const round = (r: number) => measure(glyph({ ...p, terminal: 'round', terminalForm: 'round', terminalRound: r }, 'l').cmds).area;
    assert.ok(round(1) < round(0));
    // adopting the first program with stroke ends starts at the style's own
    const saved: Params = { ...params(beforeEnds('Mainline:600').ref), terminal: 'round', terminalForm: 'ball', glyphs: { c: { terminal: 'sharp' } } };
    const adopted = adoptProgram(saved)!;
    assert.equal(adopted.terminal, saved.freeAt.terminal); assert.equal(adopted.glyphs.c?.terminal, undefined);
  });

  it('grows and shrinks closed counters, and opens and closes curving strokes\' ends', () => {
    for (const entry of current) {
      assert.deepEqual(entry.data.finish?.insides, { format: 'source-insides-v1', counter: [.75, 1.18], open: .9, close: .3 }, entry.ref.fontId);
      for (const key of INSIDE_CONTROLS) assert.equal(sourceSupports(params(entry.ref), key), true, key);
    }
    const p = params(of('Mainline:600')), O = measure(glyph(p, 'O').cmds).area;
    assert.ok(measure(glyph({ ...p, counter: 0 }, 'O').cmds).area > O * 1.05, 'small counters, more ink');
    assert.ok(measure(glyph({ ...p, counter: 1 }, 'O').cmds).area < O * .95, 'large counters, less ink');
    const at = measure(glyph(p, '@').cmds);
    assert.equal(measure(glyph({ ...p, counter: 1 }, '@').cmds).pieces, at.pieces, 'the a in @ stays');
    assert.deepEqual(glyph({ ...p, counter: 1 }, 'n').cmds, glyph(p, 'n').cmds, 'an open counter as drawn');
    const c = measure(glyph(p, 'c').cmds).area;
    assert.ok(measure(glyph({ ...p, aperture: 1 }, 'c').cmds).area < c, 'opened');
    assert.ok(measure(glyph({ ...p, aperture: 0 }, 'c').cmds).area > c, 'closed');
    const saved: Params = { ...params(beforeEnds('Mainline:600').ref), counter: .9, aperture: .1 };
    const adopted = adoptProgram(saved)!;
    assert.equal(adopted.counter, saved.freeAt.counter); assert.equal(adopted.aperture, saved.freeAt.aperture);
  });

  it('keeps every style\'s letters whole and spaced at strong settings', () => {
    const strong: Partial<Params>[] = [{ squareness: 1 }, { bowlForm: 'box' }, { chamfer: 1 }, { roundness: 1 }, { joinRound: 1, innerRound: 1 },
      { steps: 1 }, { apex: 1 }, { bends: 'round' }, { pinch: 1 }, { pinch: 1, pinchPos: 0 }, { pinch: 1, pinchPos: .25 }, { pinch: 1, pinchPos: .75 },
      { serif: true }, { vWeight: 1, hWeight: 0 },
      { terminal: 'round', terminalForm: 'ball' }, { terminal: 'sharp', terminalForm: 'pointed', terminalPoint: 1 }, { terminal: 'tapered', terminalForm: 'taper' },
      { terminal: 'flat', terminalForm: 'flared', terminalFlare: 1 }, { counter: 0 }, { counter: 1 }, { aperture: 0 }, { aperture: 1 }];
    for (const entry of current) {
      const p = params(entry.ref), plain = buildFont(p);
      for (const set of strong) {
        const font = buildFont({ ...p, ...set });
        for (const ch of 'AHOakg8') {
          const a = plain.glyph(ch), b = font.glyph(ch), what = `${entry.ref.fontId} ${ch} ${JSON.stringify(set)}`;
          if (!a?.cmds.length) continue;
          assert.ok(b && b.cmds.every(c => c.slice(1).every(n => Number.isFinite(n))), what);
          if (!('vWeight' in set)) assert.equal(b.adv, a.adv, what);
          assert.ok(measure(b.cmds).pieces <= measure(a.cmds).pieces, `${what}: came apart`);
        }
      }
    }
  });

  it('starts a design adopting them at the style\'s own, keeps the editable drawing, and exports as previewed', () => {
    const old = before('Mainline:600'), base = params(old.ref);
    const saved: Params = { ...base, vWeight: .9, squareness: .8, steps: .6, serif: true, roundness: .4, glyphs: { H: { steps: .3 } } };
    const adopted = adoptProgram(saved)!;
    assert.equal(adopted.roundness, 0); assert.equal(adopted.freeAt.roundness, 0);
    assert.equal(adopted.vWeight, base.freeAt.vWeight); assert.equal(adopted.squareness, base.freeAt.squareness);
    assert.equal(adopted.steps, base.freeAt.steps); assert.equal(adopted.serif, base.freeAt.serif); assert.equal(adopted.glyphs.H?.steps, undefined);
    loadDesignSources(adopted);
    for (const ch of 'HO') assert.deepEqual(glyph(adopted, ch).cmds, glyph(saved, ch).cmds);
    const p = params(of('Mainline:600'), { roundness: 1 }), plain = glyph(params(of('Mainline:600')), 'H'), rounded = glyph(p, 'H');
    assert.deepEqual(traceOf(rounded), plain.editable ?? plain.drawn);
    assert.equal(sourceFinishPrecision(programInfo(p.sourceProgram)!.data.finish!, p), 'shapes');
    const bytes = buildOTF(p, 'Shape proof'), font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const installed = font.charToGlyph('H');
    assert.equal(installed.path.commands.length, rounded.cmds.length);
    installed.path.commands.forEach((actual, i) => {
      const expected = rounded.cmds[i];
      if ('x' in actual && (expected[0] === 'M' || expected[0] === 'L')) assert.ok(Math.abs(actual.x - expected[1]) < .01 && Math.abs(actual.y - expected[2]) < .01);
    });
  });
});
