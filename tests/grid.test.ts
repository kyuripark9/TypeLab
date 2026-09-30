import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CHARS, buildFont, fitOutline, glyphGrid, gridGroups, gridOf, type GlyphGrid } from '../shared/engine';
import { STYLES } from '../shared/content';
import { DEFAULTS } from '../shared/params';

const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;
const level = (g: GlyphGrid) => g.lines.filter(l => l.kind === 'h').map(l => l.y);
const upright = (g: GlyphGrid) => g.lines.filter(l => l.kind === 'v').map(l => l.x);

describe('construction grids', () => {
  const font = buildFont({ ...DEFAULTS });

  it('carries a letter\'s straight edges on: H stands on its stems\' edges, the baseline, the cap height and its bar', () => {
    const g = font.glyph('H')!, { grid } = gridOf(font, 'H')!, m = font.m;
    assert.equal(grid.rounds.length, 0, 'no circles in a letter of straight strokes with sharp corners');
    assert.equal(grid.lines.filter(l => l.kind === 'd').length, 0);
    for (const x of [g.lsb, g.lsb + m.s, g.adv - g.rsb - m.s, g.adv - g.rsb]) assert.ok(upright(grid).some(v => near(v, x)), `an upright at ${x.toFixed(0)}`);
    for (const y of [0, m.cap]) assert.ok(level(grid).some(v => near(v, y)), `a level line at ${y}`);
    assert.equal(level(grid).length, 4, 'the baseline, the cap height and the two edges of the bar');
    assert.equal(upright(grid).length, 4, 'an edge hidden inside another stroke (the bar\'s ends in the stems) is no line');
  });

  it('gives diagonals their lines and round letters their ellipses', () => {
    const k = gridOf(font, 'K')!.grid;
    assert.equal(k.lines.filter(l => l.kind === 'd').length, 4, 'both edges of the arm and of the leg');
    const o = font.glyph('O')!, og = gridOf(font, 'O')!.grid;
    assert.ok(og.rounds.length >= 2, 'the outside and the inside of the bowl');
    const outer = og.rounds.reduce((a, r) => (r.rx > a.rx ? r : a));
    assert.ok(near(outer.cx, o.adv / 2, 3) && near(outer.cy, font.m.cap / 2, 3), 'centred in the letter');
    assert.ok(near(outer.rx, (o.adv - o.lsb - o.rsb) / 2, 3) && near(outer.ry, font.m.cap / 2 + font.m.os, 3), 'as wide and tall as the letter');
    // the lines a bowl turns on: its top and bottom, its sides
    assert.ok(level(og).some(y => near(y, font.m.cap + font.m.os)) && level(og).some(y => near(y, -font.m.os)));
    assert.ok(upright(og).some(x => near(x, o.lsb)) && upright(og).some(x => near(x, o.adv - o.rsb)));
  });

  it('draws the circle of a rounded corner', () => {
    const f = buildFont({ ...DEFAULTS, roundness: 0.6 }), grid = gridOf(f, 'H')!.grid;
    assert.ok(grid.rounds.length >= 2);
    for (const r of grid.rounds) assert.ok(near(r.rx, r.ry, 1.5) && r.rx <= f.m.s / 2 + 1, `a circle no wider than the stem (${r.rx.toFixed(1)})`);
    // a corner's circle touches the two edges it rounds
    const r = grid.rounds[0];
    assert.ok(upright(grid).some(x => near(Math.abs(x - r.cx), r.rx, 1.5)) && level(grid).some(y => near(Math.abs(y - r.cy), r.ry, 1.5)));
  });

  it('groups the letters built the same way, under names that stay put', () => {
    const groups = gridGroups(font), by = (name: string) => groups.find(g => g.name === name)!.chars.join('');
    assert.equal(by('Grid A'), 'EFHILT');
    assert.equal(by('Grid B'), 'AKMNVWXYZ');
    assert.equal(by('Grid C'), 'BDJPRU');
    assert.equal(by('Grid D'), 'CGOQS');
    assert.equal(by('Grid F'), 'kvwxyz');
    assert.equal(by('Grid H'), 'ceos');
    assert.equal(gridOf(font, 'K')!.group.name, 'Grid B');
    assert.equal(gridOf(font, 'K')!.group.label, 'Capitals · diagonals');
    for (const st of STYLES.filter((_, i) => i % 9 === 0)) {
      const f = buildFont(st.params), seen = new Set<string>();
      for (const g of gridGroups(f)) for (const ch of g.chars) { assert.ok(!seen.has(ch), `${st.id}: ${ch} in one group`); seen.add(ch); }
      for (const ch of ALL_CHARS) if (f.glyph(ch)) assert.ok(seen.has(ch), `${st.id}: ${ch} is in a group`);
      assert.equal(gridOf(f, 'K')!.group.set, 'upper');
      assert.equal(gridOf(f, 'o')!.group.set, 'lower');
    }
  });

  it('marks what a letter shares with its group', () => {
    const h = gridOf(font, 'H')!.grid, g = font.glyph('H')!;
    const at = (kind: 'h' | 'v', v: number) => h.lines.find(l => l.kind === kind && near(kind === 'h' ? l.y : l.x, v))!;
    assert.ok(at('h', 0).shared && at('h', font.m.cap).shared, 'the baseline and cap height, with every capital');
    assert.ok(at('v', g.lsb).shared && at('v', g.lsb + font.m.s).shared, 'its left stem, with E F L');
    assert.ok(!at('v', g.adv - g.rsb).shared, 'its right stem is its own');
    // an O's bowl is Q's bowl
    assert.ok(gridOf(font, 'O')!.grid.rounds.every(r => r.shared));
    // across every group: a line is shared when another letter of the group has one at the same height, place or angle
    const gap = (a: number, b: number) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
    let shared = 0, own = 0;
    for (const group of gridGroups(font)) {
      for (const ch of group.chars) {
        const others = group.chars.filter(c => c !== ch).flatMap(c => gridOf(font, c)!.grid.lines);
        for (const l of gridOf(font, ch)!.grid.lines) {
          const twin = others.some(o => o.kind === l.kind && (l.kind === 'h' ? near(o.y, l.y, 1.5) : l.kind === 'v' ? near(o.x, l.x, 1.5) : gap(o.a, l.a) <= 0.6 * Math.PI / 180));
          assert.equal(l.shared, twin, `${group.name} ${ch}: a ${l.kind} line`);
          if (twin) shared++; else own++;
        }
      }
    }
    assert.ok(shared > 100 && own > 100, `${shared} shared, ${own} their own`);
  });

  it('stands a slanted letter upright, and leans the grid with it', () => {
    const f = buildFont({ ...DEFAULTS, slant: 0.7 }), grid = gridOf(f, 'H')!.grid;
    assert.ok(f.m.slant > 0.1 && grid.slant === f.m.slant);
    assert.equal(grid.lines.filter(l => l.kind === 'd').length, 0, 'its stems are upright lines of a leaning grid');
    assert.equal(upright(grid).length, 4);
    assert.equal(gridOf(f, 'H')!.group.name, 'Grid A');
  });

  it('follows one letter ahead of its group, and reads a letter drawn by hand from its outline', () => {
    const bold = buildFont({ ...DEFAULTS, weight: 0.8 });
    const ahead = gridOf(bold, 'H', font)!, now = gridOf(bold, 'H')!;
    assert.equal(ahead.group, gridOf(font, 'H')!.group, 'the group as the lagging font has it');
    assert.deepEqual(ahead.grid.lines.map(l => [l.kind, Math.round(l.x), Math.round(l.y), l.shared]), now.grid.lines.map(l => [l.kind, Math.round(l.x), Math.round(l.y), l.shared]));

    const contours = fitOutline(font.glyph('K')!.cmds);
    const drawn = buildFont({ ...DEFAULTS, outlines: { K: { adv: Math.round(font.glyph('K')!.adv), contours } } });
    const k = gridOf(drawn, 'K')!;
    assert.equal(k.group.name, 'Grid B', 'still a letter of diagonals');
    assert.equal(k.grid.lines.filter(l => l.kind === 'd').length, 4);
    assert.equal(k.grid.slant, 0);
  });

  it('gives every glyph of every style a finite grid of a size that can be read', () => {
    for (const st of STYLES) {
      const f = buildFont(st.params);
      for (const ch of ALL_CHARS) {
        const g = f.glyph(ch);
        if (!g) continue;
        const grid = glyphGrid(g, f.letter(ch).m);
        assert.ok(grid.lines.length <= 40 && grid.rounds.length <= 28, `${st.id} ${ch}`);
        for (const l of grid.lines) assert.ok([l.x, l.y, l.a, l.len].every(Number.isFinite) && l.a >= 0 && l.a < Math.PI, `${st.id} ${ch}: line`);
        for (const r of grid.rounds) assert.ok([r.cx, r.cy, r.rx, r.ry].every(Number.isFinite) && r.rx >= 2 && r.ry >= 2, `${st.id} ${ch}: round`);
      }
    }
  });
});
