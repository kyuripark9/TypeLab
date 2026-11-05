/* A source's Contrast (`source-contrast-v1`): widths and heights drawn from two of the style's own weights, the style's
   letters exact at its own contrast, horizontals thinner or thicker with widths and spacing kept, every style whole at
   the ends of Contrast, Weight and Width, Points edits carried there and back, forms and marks too, the gates,
   adoption, the Adjust tab and a family. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFont } from '../shared/engine';
import { cmdsBox } from '../shared/engine/geom';
import { drawnCmds, segment, type Drawn } from '../shared/engine/outline';
import { DEFAULTS, drawnAtOf, freeAtOf, type Params } from '../shared/params';
import { familyMember } from '../shared/family';
import { TRAITS } from '../shared/traits';
import { adoptProgram, programUpgrade } from '../shared/source/adoption';
import { sourceSupports } from '../shared/source/capabilities';
import { contrastWeights } from '../shared/source/contrast';
import { masterInfo } from '../shared/source/master-catalog';
import { PROGRAM_REVISIONS, programForFont, programInfo } from '../shared/source/program-catalog';
import type { ProgramSourceRef } from '../shared/source/model';
import { sourceTraitOptions } from '../shared/source/trait-recipes';
import { loadDesignSources, loadSource, loadSourceMarks } from '../server/sources';

function params(ref: ProgramSourceRef, contrast = .5): Params {
  const info = masterInfo(ref), width = programInfo(ref)?.width;
  assert.ok(info && width); loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min), neutral = (width.neutral - width.min) / (width.max - width.min);
  const p: Params = { ...DEFAULTS, sourceProgram: ref, freeFont: ref.fontId, weight, width: neutral, contrast,
    freeAt: { ...freeAtOf(DEFAULTS), weight, width: neutral, contrast, dotSize: .5 } };
  loadDesignSources(p);
  return p;
}
const current = [...new Map(PROGRAM_REVISIONS.map(entry => [entry.ref.fontId, entry])).values()];
const before = (fontId: string) => PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === fontId && !entry.data.contrast)!;
const of = (fontId: string) => current.find(entry => entry.ref.fontId === fontId)!.ref;
const box = (contours: Drawn['contours']) => cmdsBox(drawnCmds(contours))!;
const xs = (d: Drawn) => d.contours.map(c => c.map(n => n.x));
const points = (d: Drawn) => d.contours.map(c => c.map(n => [n.x, n.y]));
/** How thick the H's crossbar is: its ink across the line half way between the stems. */
function crossbar(d: Drawn): number {
  const b = box(d.contours), mid = (b.x0 + b.x1) / 2, ys: number[] = [];
  for (const c of d.contours) c.forEach((a, i) => {
    const z = c[(i + 1) % c.length], s = segment(a, z) ?? [a, a, z, z];
    for (let k = 0; k < 64; k++) {
      const at = (t: number) => { const u = 1 - t; return { x: u * u * u * s[0].x + 3 * u * u * t * s[1].x + 3 * u * t * t * s[2].x + t * t * t * s[3].x,
        y: u * u * u * s[0].y + 3 * u * u * t * s[1].y + 3 * u * t * t * s[2].y + t * t * t * s[3].y }; };
      const p = at(k / 64), q = at((k + 1) / 64);
      if ((p.x - mid) * (q.x - mid) < 0) ys.push(p.y + (q.y - p.y) * (mid - p.x) / (q.x - p.x));
    }
  });
  return Math.max(...ys) - Math.min(...ys);
}

describe('source contrast', () => {
  it('is pinned in every current program, and the style\'s own contrast draws what the program before it drew', () => {
    assert.equal(programForFont('Mainline:600')?.digest, of('Mainline:600').digest);
    for (const entry of current) {
      assert.deepEqual(entry.data.contrast, { format: 'source-contrast-v1', reach: .33 }, entry.ref.fontId);
      const now = buildFont(params(entry.ref)), then = buildFont(params(before(entry.ref.fontId).ref));
      for (const ch of 'HOeaij.') assert.deepEqual(now.glyph(ch)?.cmds, then.glyph(ch)?.cmds, `${entry.ref.fontId} ${ch}`);
    }
  });

  it('draws the heights from a lighter or heavier weight, and the widths only where those run out', () => {
    const policy = { format: 'source-contrast-v1' as const, reach: .5 }, range = { min: 300, max: 800 };
    assert.deepEqual(contrastWeights(policy, 600, range, .5, .5), { x: 600, y: 600 });
    assert.deepEqual(contrastWeights(policy, 600, range, 1, .5), { x: 600, y: 350 }, 'higher: the level strokes lighter');
    assert.deepEqual(contrastWeights(policy, 600, range, 0, .5), { x: 550, y: 800 }, 'reversed: the level strokes heavier, the uprights the rest');
    assert.deepEqual(contrastWeights(policy, 300, range, 1, .5), { x: 550, y: 300 }, 'at the lightest, the uprights heavier');
    assert.deepEqual(contrastWeights(policy, 800, range, 0, .5), { x: 550, y: 800 }, 'at the heaviest, the uprights lighter');
    // every step of the slider moves something, within the authored weights
    for (const weight of [300, 420, 600, 800]) {
      let last = contrastWeights(policy, weight, range, 0, .3);
      for (let v = 1; v <= 40; v++) {
        const now = contrastWeights(policy, weight, range, v / 40, .3);
        assert.ok(now.x !== last.x || now.y !== last.y || v / 40 === .3, `${weight} ${v}`);
        for (const w of [now.x, now.y]) assert.ok(w >= 300 && w <= 800);
        last = now;
      }
    }
  });

  it('thins or thickens the level strokes while the widths and spacing stay', () => {
    const p = params(of('Mainline:600')), own = buildFont(p), high = buildFont({ ...p, contrast: 1 }), low = buildFont({ ...p, contrast: 0 });
    for (const ch of 'Haeso') {
      assert.deepEqual(xs(high.glyph(ch)!.drawn!), xs(own.glyph(ch)!.drawn!), `${ch}: the widths are the style's own`);
      assert.equal(high.glyph(ch)!.adv, own.glyph(ch)!.adv);
    }
    const bar = (f: typeof own) => crossbar(f.glyph('H')!.drawn!);
    assert.ok(bar(high) < bar(own) * .85 && bar(low) > bar(own) * 1.1, `${bar(high)} ${bar(own)} ${bar(low)}`);
  });

  it('keeps every style\'s letters whole at the ends of Contrast, Weight and Width', () => {
    for (const entry of current) {
      const p = params(entry.ref);
      for (const at of [{ weight: 0 }, { weight: 1 }, { width: 0 }, { width: 1 }]) {
        const own = buildFont({ ...p, ...at });
        for (const contrast of [0, 1]) {
          const f = buildFont({ ...p, ...at, contrast });
          for (const ch of 'AHKMRSWXagkmnosw25&?') {
            const a = own.glyph(ch)?.drawn, b = f.glyph(ch)?.drawn, what = `${entry.ref.fontId} ${ch} ${contrast} ${JSON.stringify(at)}`;
            if (!a) continue;
            assert.ok(b, what);
            assert.deepEqual(b.contours.map(c => c.length), a.contours.map(c => c.length), what);
            assert.ok(b.contours.every(c => c.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))) && Number.isFinite(b.adv), what);
          }
        }
      }
    }
  });

  it('carries a letter\'s Points edits through Contrast and back, with its forms and marks', () => {
    const p = params(of('Mainline:600')), n = buildFont(p).glyph('n')!.drawn!;
    const moved: Drawn = { ...n, at: drawnAtOf(p, 'n'), contours: n.contours.map(c => c.map((node, i) => i ? node : { ...node, x: node.x + 25 })) };
    const high = buildFont({ ...p, contrast: 1, outlines: { n: moved } }).glyph('n')!.drawn!, plain = buildFont({ ...p, contrast: 1 }).glyph('n')!.drawn!;
    assert.ok(Math.abs(high.contours[0][0].x - plain.contours[0][0].x - 25) < .5, 'the edit rides Contrast');
    const drawnHigh: Params = { ...p, contrast: 1, outlines: { n: { ...high, at: drawnAtOf({ ...p, contrast: 1 }, 'n') } } };
    const back = buildFont({ ...drawnHigh, contrast: p.contrast }).glyph('n')!.drawn!;
    back.contours.forEach((c, ci) => c.forEach((node, ni) => assert.ok(Math.hypot(node.x - moved.contours[ci][ni].x, node.y - moved.contours[ci][ni].y) < 1e-6)));
    // an alternate form and an accent's mark are drawn from the same two weights
    const form = programInfo(p.sourceProgram)!.data.forms!.find(c => c.glyph === 'g')!, picked: Params = { ...p, sourceForms: { g: form.ref } };
    loadDesignSources(picked);
    const a = buildFont(picked).glyph('g')!.drawn!, aHigh = buildFont({ ...picked, contrast: 1 }).glyph('g')!.drawn!;
    assert.deepEqual(xs(aHigh), xs(a)); assert.notDeepEqual(points(aHigh), points(a));
    assert.ok(loadSourceMarks(p));
    const e = buildFont(p).accent('é')!.drawn!, eHigh = buildFont({ ...p, contrast: 1 }).accent('é')!.drawn!;
    assert.notDeepEqual(points({ adv: 0, contours: eHigh.contours.slice(-1) }), points({ adv: 0, contours: e.contours.slice(-1) }));
  });

  it('offers Contrast only where a program pins it, starts older designs at their own, and steps it on the Adjust tab and in a family', () => {
    const p = params(of('Mainline:600'), .582);
    assert.ok(sourceSupports(p, 'contrast') && sourceSupports(p, 'contrast', 'n'));
    const older: Params = { ...params(before('Mainline:600').ref, .582), contrast: .9, glyphs: { n: { contrast: .1 } } };
    assert.equal(sourceSupports(older, 'contrast'), false);
    assert.equal(programUpgrade(older.sourceProgram)?.program.ref.digest, of('Mainline:600').digest);
    const adopted = adoptProgram(older)!;
    assert.equal(adopted.contrast, .582); assert.equal(adopted.glyphs.n?.contrast, undefined);
    loadDesignSources(adopted);
    assert.deepEqual(buildFont(adopted).glyph('H')!.cmds, buildFont(older).glyph('H')!.cmds, 'adopted, the letters as they were');
    const trait = TRAITS.find(t => t.id === 'contrast')!;
    assert.deepEqual(sourceTraitOptions(p, 'contrast', trait.options).map(o => [o.label, o.set.contrast]),
      [['Reversed', 0], ['Lower', .582 / 2], ['Original', .582], ['Higher', (1 + .582) / 2]]);
    const bold = familyMember({ ...p, contrast: 1 }, 'semibold', 'bold', false);
    assert.equal(bold.params.contrast, 1);
    assert.ok(buildFont(bold.params).glyph('H')!.drawn);
  });

  it('keeps the weights a design drew at half the range apart when it takes up the milder reach, as far as that goes', () => {
    // the newest program whose Contrast, Verticals and Horizontals reached half the weight range
    const wide = PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === 'Mainline:600' && entry.data.contrast?.reach === .5)!;
    assert.equal(wide.data.strokes?.format, 'source-strokes-v1');
    const near = (a: Drawn, b: Drawn, what: string) => a.contours.forEach((c, ci) => c.forEach((n, ni) =>
      assert.ok(Math.hypot(n.x - b.contours[ci][ni].x, n.y - b.contours[ci][ni].y) < 1e-6, `${what} ${ci}:${ni}`)));
    for (const set of [{ contrast: .582 / 2, glyphs: { n: { contrast: .582 * .8 } } }, { vWeight: .3 }, { hWeight: .75 }] as Partial<Params>[]) {
      const older: Params = { ...params(wide.ref, .582), ...set };
      assert.equal(programUpgrade(older.sourceProgram)?.program.ref.digest, of('Mainline:600').digest);
      const adopted = adoptProgram(older)!;
      loadDesignSources(adopted);
      for (const ch of 'Hneo') near(buildFont(adopted).glyph(ch)!.drawn!, buildFont(older).glyph(ch)!.drawn!, `${JSON.stringify(set)} ${ch}`);
    }
    // a Contrast past the milder reach draws as far as it goes
    const reversed = adoptProgram({ ...params(wide.ref, .582), contrast: .1 })!;
    assert.equal(reversed.contrast, 0);
  });
});
