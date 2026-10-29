/* A source serif style's own serifs (`source-serifs-v1` in the finish policy): found on the ink as each stroke's side
   turning out round a serif and back onto the stroke's end; taken off, drawn in another shape as large as they were,
   and reshaped by Length, Thickness, Angle, Bracket, Top serifs, Arm serifs, Sides and Balance about the style's own;
   Top serifs, Sides and Balance on serifs added to a sans; every program pinning the policy but Cathedral's, the style's
   own drawing what the program before drew; letters kept whole; adoption. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ClipType } from 'clipper2-ts';
import { buildFont } from '../shared/engine';
import type { Cmd } from '../shared/engine/types';
import { styleById } from '../shared/content/styles';
import type { Params } from '../shared/params';
import { adoptProgram } from '../shared/source/adoption';
import { sourceSupports } from '../shared/source/capabilities';
import { sourceFinishPolygons, sourceFinishPrecision } from '../shared/source/finish';
import { clip, flatten, fromGrid, toGrid, tree } from '../shared/source/ink';
import { PROGRAM_REVISIONS, programInfo } from '../shared/source/program-catalog';
import { SERIF_CONTROLS, serifHalves } from '../shared/source/serifs';
import { sourceStyleParams } from '../shared/source/style';
import { loadDesignSources } from '../server/sources';

const current = [...new Map(PROGRAM_REVISIONS.map(entry => [entry.ref.fontId, entry])).values()];
const SERIF_STYLES = ['serif', 'oldstyle', 'didone', 'serifitalic', 'fatface', 'softslab', 'woodtype', 'typewriter'];
function style(id: string, set: Partial<Params> = {}): Params {
  const p = { ...sourceStyleParams(styleById(id)!)!, ...set };
  loadDesignSources(p);
  return p;
}
const glyph = (p: Params, ch: string) => buildFont(p).glyph(ch)!;
const polys = (cmds: Cmd[]) => sourceFinishPolygons(cmds, .05);
/** The ink's area, its overlapping contours united. */
const area = (cmds: Cmd[]) => clip(ClipType.Union, flatten(cmds, .05, 'shapes').map(toGrid), [], 'shapes').map(fromGrid)
  .reduce((s, p) => s + p.reduce((t, a, i) => { const b = p[(i + 1) % p.length]; return t + a.x * b.y - b.x * a.y; }, 0) / 2, 0);
/** The ink's left and right extents within a level band. */
function extent(cmds: Cmd[], y0: number, y1: number): { x0: number; x1: number } {
  const xs = polys(cmds).flat().filter(p => p.y >= y0 && p.y <= y1).map(p => p.x);
  return { x0: Math.min(...xs), x1: Math.max(...xs) };
}
function pieces(cmds: Cmd[]): number {
  return clip(ClipType.Union, flatten(cmds, .05, 'shapes').map(toGrid), [], 'shapes').filter(path => {
    let s = 0; for (let i = 0; i < path.length; i++) { const a = path[i], b = path[(i + 1) % path.length]; s += Number(a.x) * Number(b.y) - Number(b.x) * Number(a.y); }
    return s > 0;
  }).length;
}
function halves(p: Params, ch: string) {
  const font = buildFont(p), ink = clip(ClipType.Union, flatten(font.glyph(ch)!.cmds, .025, 'shapes').map(toGrid), [], 'shapes').map(fromGrid);
  const root = tree(ink.flatMap(q => q.map((a, i) => ({ a, b: q[(i + 1) % q.length] })))), start = Math.hypot(root.x1 - root.x0, root.y1 - root.y0);
  return serifHalves(ink, font.m.cap, programInfo(p.sourceProgram)!.data.finish!.serifs!, root, start);
}

describe('source serif styles\' own serifs', () => {
  it('is pinned in every program but Cathedral\'s, and the style\'s own serifs draw what the program before drew', () => {
    for (const entry of current) {
      const serifs = entry.data.finish?.serifs, family = entry.ref.fontId.split(':')[0];
      if (family === 'Cathedral') { assert.equal(serifs, undefined); continue; }
      assert.deepEqual(serifs, { format: 'source-serifs-v1', reach: .3, across: 5, height: .25, side: .08, length: [.25, 1.75], thick: [.3, 2],
        size: [.25, 1.4], slope: .8, bracket: [.05, 2.5] }, entry.ref.fontId);
    }
    for (const id of SERIF_STYLES) {
      const p = style(id), fontId = p.freeFont!;
      const older = PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === fontId && !entry.data.finish?.serifs)!;
      const q = { ...p, sourceProgram: older.ref };
      for (const key of SERIF_CONTROLS) { assert.equal(sourceSupports(p, key), true, key); assert.equal(sourceSupports(q, key), false, key); }
      loadDesignSources(q);
      for (const ch of 'HnEk') assert.deepEqual(glyph(p, ch).cmds, glyph(q, ch).cmds, `${id} ${ch}`);
    }
  });

  it('finds both halves of every serif on an H\'s feet and tops', () => {
    for (const id of SERIF_STYLES) {
      const found = halves(style(id), 'H');
      assert.equal(found.length, 8, id);
      assert.equal(found.filter(h => h.kind === 'foot').length, 4, id);
      assert.equal(found.filter(h => h.out.x < 0).length, 4, id);
    }
    // bars reach too far past their stroke to be serifs, and a sans has none to find
    assert.ok(halves(style('didone'), 'T').every(h => h.reach < buildFont(style('didone')).m.cap * .3));
    assert.equal(halves(style('grotesque'), 'H').length, 0);
  });

  it('takes the serifs off, keeping each letter whole and its advance', () => {
    for (const id of SERIF_STYLES) {
      const p = style(id), off = style(id, { serif: false }), cap = buildFont(p).m.cap;
      // an italic n runs out of its feet with no serifs; a typewriter's l has bars, not serifs
      for (const ch of id === 'serifitalic' ? 'Hl' : id === 'typewriter' ? 'Hn' : 'Hnl') {
        const a = glyph(p, ch), b = glyph(off, ch);
        assert.ok(area(b.cmds) < area(a.cmds) * .98, `${id} ${ch}: less ink`);
        assert.equal(b.adv, a.adv, `${id} ${ch}`);
        assert.ok(pieces(b.cmds) <= pieces(a.cmds), `${id} ${ch}: came apart`);
      }
      const foot = (q: Params) => { const e = extent(glyph(q, 'H').cmds, -1, cap * .02); return e.x1 - e.x0; };
      assert.ok(foot(off) < foot(p) - cap * .04, `${id}: the feet's reach gone`);
    }
  });

  it('draws another shape as large as the style\'s own serifs', () => {
    for (const id of ['serif', 'didone', 'softslab']) {
      const p = style(id), off = glyph(style(id, { serif: false }), 'l'), own = glyph(p, 'l');
      for (const shape of ['bracketed', 'unbracketed', 'slab', 'wedge', 'diamond'] as const) {
        if (shape === p.freeAt.serifShape) continue;
        const l = glyph(style(id, { serifShape: shape }), 'l');
        assert.notDeepEqual(l.cmds, own.cmds, `${id} ${shape}`);
        assert.ok(area(l.cmds) > area(off.cmds) + 1, `${id} ${shape}: has serifs`);
        assert.equal(l.adv, own.adv);
      }
    }
  });

  it('reshapes the style\'s own serifs about their own', () => {
    const p = style('serif'), cap = buildFont(p).m.cap, H = glyph(p, 'H').cmds;
    const foot = (q: Params) => { const e = extent(glyph(q, 'H').cmds, -1, cap * .02); return e.x1 - e.x0; };
    const head = (q: Params) => { const e = extent(glyph(q, 'H').cmds, cap * .98, cap + 1); return e.x1 - e.x0; };
    assert.ok(foot(style('serif', { serifSize: 1 })) > foot(p) * 1.05, 'longer');
    assert.ok(foot(style('serif', { serifSize: 0 })) < foot(p) * .95, 'shorter');
    assert.ok(area(glyph(style('serif', { serifThickness: 1 }), 'H').cmds) > area(H) * 1.02, 'thicker');
    assert.ok(area(glyph(style('serif', { serifThickness: 0 }), 'H').cmds) < area(H) * .98, 'thinner');
    assert.ok(area(glyph(style('serif', { serifAngle: 1 }), 'H').cmds) < area(H), 'sloped toward the tip');
    assert.ok(area(glyph(style('serif', { serifBracket: 1 }), 'H').cmds) > area(H), 'a longer bracket');
    assert.ok(area(glyph(style('serif', { serifBracket: 0 }), 'H').cmds) < area(H), 'a tighter bracket');
    // Top serifs move the tops alone
    const tops = style('serif', { serifTops: 0 });
    assert.ok(head(tops) < head(p) * .95, 'smaller tops');
    assert.ok(Math.abs(foot(tops) - foot(p)) < 1, 'the feet as they were');
    // Arm serifs move the beaks at the ends of E's arms, not H's serifs
    const couture = style('didone'), arms = style('didone', { serifArms: 0 });
    assert.ok(area(glyph(arms, 'E').cmds) < area(glyph(couture, 'E').cmds) * .99, 'smaller beaks');
    // (redrawn as fine lines, within their tolerance)
    assert.ok(Math.abs(area(glyph(arms, 'H').cmds) - area(glyph(couture, 'H').cmds)) < area(glyph(couture, 'H').cmds) * 5e-4, 'an H as it was');
    // Sides keeps one side's serifs; Balance reaches further to one side
    const own = extent(glyph(p, 'I').cmds, -1, cap * .02), left = extent(glyph(style('serif', { serifSides: 'left' }), 'I').cmds, -1, cap * .02);
    assert.ok(Math.abs(left.x0 - own.x0) < 1 && left.x1 < own.x1 - 10, 'the left side only');
    const right = extent(glyph(style('serif', { serifBalance: 1 }), 'I').cmds, -1, cap * .02);
    assert.ok(right.x1 > own.x1 + 5 && right.x0 > own.x0 + 5, 'further right');
    assert.equal(sourceFinishPrecision(programInfo(p.sourceProgram)!.data.finish!, { ...p, serifTops: 0 }), 'shapes');
  });

  it('sizes the tops of serifs added to a sans, and keeps them to one side', () => {
    const p = style('grotesque', { serif: true, serifShape: 'slab' }), cap = buildFont(p).m.cap, I = glyph(p, 'I').cmds;
    const top = (cmds: Cmd[]) => { const e = extent(cmds, cap * .98, cap + 1); return e.x1 - e.x0; };
    assert.ok(top(glyph({ ...p, serifTops: 0 }, 'I').cmds) < top(I) * .9);
    const own = extent(I, -1, cap * .02), left = extent(glyph({ ...p, serifSides: 'left' }, 'I').cmds, -1, cap * .02);
    assert.ok(Math.abs(left.x0 - own.x0) < 1 && left.x1 < own.x1 - 10);
  });

  it('keeps every serif style\'s letters whole and spaced at strong settings', () => {
    const strong: Partial<Params>[] = [{ serif: false }, { serifShape: 'slab' }, { serifShape: 'diamond' }, { serifSize: 1 }, { serifSize: 0 },
      { serifThickness: 1 }, { serifAngle: 1 }, { serifBracket: 0 }, { serifBracket: 1 }, { serifTops: 1 }, { serifArms: 0 }, { serifSides: 'outside' }, { serifBalance: 0 }];
    for (const id of SERIF_STYLES) {
      const plain = buildFont(style(id));
      for (const set of strong) {
        const font = buildFont(style(id, set));
        for (const ch of 'HAEkxn') {
          const a = plain.glyph(ch)!, b = font.glyph(ch)!, what = `${id} ${ch} ${JSON.stringify(set)}`;
          assert.ok(b.cmds.every(c => c.slice(1).every(n => Number.isFinite(n))), what);
          assert.equal(b.adv, a.adv, what);
          assert.ok(pieces(b.cmds) <= pieces(a.cmds), `${what}: came apart`);
        }
      }
    }
  });

  it('leaves Cathedral\'s blackletter as drawn', () => {
    const p = style('blackletter');
    assert.equal(sourceSupports(p, 'serifTops'), false);
    for (const ch of 'Hnl') assert.deepEqual(glyph({ ...p, serif: false }, ch).cmds, glyph(p, ch).cmds);
  });

  it('starts a serif style adopting it at its own serifs, and a sans keeping the serifs it added', () => {
    const p = style('serif'), older = PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === p.freeFont && !entry.data.finish?.serifs)!;
    const saved: Params = { ...p, sourceProgram: older.ref, serifSize: .9, serifTops: .1, glyphs: { n: { serifSize: .2 } } };
    loadDesignSources(saved);
    const adopted = adoptProgram(saved)!;
    assert.equal(adopted.serifSize, p.freeAt.serifSize); assert.equal(adopted.serifTops, p.freeAt.serifTops);
    assert.equal(adopted.glyphs.n?.serifSize, undefined);
    loadDesignSources(adopted);
    for (const ch of 'Hn') assert.deepEqual(glyph(adopted, ch).cmds, glyph(saved, ch).cmds, ch);
    const sans = style('grotesque'), olderSans = PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === sans.freeFont && !entry.data.finish?.serifs)!;
    const added: Params = { ...sans, sourceProgram: olderSans.ref, serif: true, serifSize: .9 };
    loadDesignSources(added);
    const kept = adoptProgram(added)!;
    assert.equal(kept.serif, true); assert.equal(kept.serifSize, .9);
  });
});
