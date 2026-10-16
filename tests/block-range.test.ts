/* The slot and grid blocks' range: the settings they follow since PARAMS_VERSION 7 (Contrast, Inner space, Openness,
   the crossbars, the corners, Stencil, the letter forms, the grid's cell joins and rows), saved designs reading as they
   drew before, and the controls the editor offers for them. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFont, cmdsBox } from '../shared/engine';
import { signedArea, toPolys } from '../shared/engine/geom';
import type { Cmd } from '../shared/engine/types';
import { GRID, GRID_FORMS, gridCells } from '../shared/engine/grid-blocks';
import { CONTROLS, controlInUse, type ControlKey } from '../shared/content';
import { DEFAULTS, PARAMS_VERSION, sanitizeParams, upgradeParams, type Params } from '../shared/params';

const slots = { ...DEFAULTS, build: 'blocks', blockForm: 'slots', weight: 0.6, roundness: 1, joinRound: 0.5 } as Params;
const grid = { ...DEFAULTS, build: 'blocks', blockForm: 'grid', roundness: 1 } as Params;
const outline = (p: Params, text: string) => { const f = buildFont(p); return [...text].map(ch => f.glyph(ch)?.d ?? '').join('|'); };
const cmdsOf = (g: { strokes: { cmds: Cmd[] }[] }) => g.strokes.flatMap(s => s.cmds);

describe('slot and grid blocks follow more settings', () => {
  it('slot blocks take contrast, inner space, openness, crossbars, cut corners, the stencil and their letter forms', () => {
    const text = 'ABEHOPRSU08IJMQ.!';
    for (const [k, v] of [['contrast', 1], ['contrast', 0], ['counter', 1], ['counter', 0], ['aperture', 1], ['aperture', 0], ['crossbar', 1],
      ['crossbar', 0], ['innerRound', 1], ['chamfer', 1], ['steps', 1], ['joints', 1], ['stencil', 0.6], ['iForm', 'bars'], ['jForm', 'cup'],
      ['mForm', 'raised'], ['qForm', 'sweep'], ['dots', 'round'], ['dotSize', 1]] as const) {
      assert.notEqual(outline({ ...slots, [k]: v }, text), outline(slots, text), `${k}=${v}`);
    }
  });

  it('grid letters take contrast, their two weights, joins, counters, cut corners, the stencil, cell joins and letter forms', () => {
    const text = 'ERkxz7aIilJMQRYs.';
    for (const [k, v] of [['contrast', 1], ['vWeight', 1], ['hWeight', 0], ['joinRound', 1], ['chamfer', 1], ['steps', 1], ['joints', 1],
      ['stencil', 0.5], ['cellJoin', 'diagonal'], ['cellJoin', 'pixel'], ['story', 'single'], ['kForm', 'stem'], ['iForm', 'plain'],
      ['jForm', 'cup'], ['mForm', 'raised'], ['qForm', 'inside'], ['rForm', 'loop'], ['yForm', 'cup'], ['sForm', 'flat'], ['dots', 'square'],
      ['dotSize', 0], ['gridRows', 'seven']] as const) {
      assert.notEqual(outline({ ...grid, [k]: v }, text), outline(grid, text), `${k}=${v}`);
    }
    // Counters rounds the inside corners only where Roundness leaves them room to
    assert.notEqual(outline({ ...grid, roundness: 0.2, innerRound: 1 }, 'EFT'), outline({ ...grid, roundness: 0.2 }, 'EFT'));
  });

  it('starts a cut from nothing: a step or trap a hair deep takes a hair of ink, not the rounds of the corners', () => {
    const ink = (p: Params, ch: string) => toPolys(cmdsOf(buildFont(p).glyph(ch)!)).reduce((a, q) => a + signedArea(q), 0);
    // (a slot block's traps are in the joins it draws, as T's; a grid letter's in every corner inside it, as E's)
    for (const [k, ch] of [['steps', 'E'], ['joints', 'T'], ['steps', 'O']] as const) for (const base of [slots, grid]) {
      const a0 = ink(base, ch), a1 = ink({ ...base, [k]: 0.02 }, ch), a2 = ink({ ...base, [k]: 1 }, ch);
      assert.ok(Math.abs(a1 - a0) < Math.abs(a2 - a0) * 0.1, `${base.blockForm} ${k} ${ch}: ${a0} ${a1} ${a2}`);
    }
  });

  it('keeps the grid letter forms readable apart', () => {
    // each form's letter differs from the letters it could be taken for by two cells or more (a plain I and l are one
    // stem, as the stroke letters' plain ones are, and i keeps its dot)
    const cells = (c: unknown) => (typeof c === 'string' ? c : (c as [string, number])[0]).replace(/ /g, '');
    const near: Record<string, string[]> = { a: ['o', 'q', 'd'], k: ['K', 'x'], K: ['k', 'R'], I: ['1'], l: ['1'], i: ['l', 'I'],
      J: ['U', 'j'], M: ['N', 'W'], Q: ['O', '0'], R: ['P', 'K'], Y: ['V', 'y'], s: ['5', 'S'], S: ['5', 's'] };
    for (const [form, letters] of Object.entries(GRID_FORMS)) for (const [ch, c] of Object.entries(letters)) for (const o of near[ch] ?? []) {
      const a = cells(c), b = cells(GRID[o]);
      if (a.length !== b.length) continue;
      const diff = [...a].filter((x, i) => x !== b[i]).length;
      assert.ok(diff >= 2, `${form} ${ch} against ${o}: ${diff} cells apart`);
    }
  });

  it('stands grid letters on seven rows, the small letters\' heights in whole cells', () => {
    const seven = { ...grid, gridRows: 'seven' } as Params, cell = buildFont(seven).m.cap / 7;
    const box = (p: Partial<Params>, ch: string) => cmdsBox(cmdsOf(buildFont({ ...seven, ...p }).glyph(ch)!))!;
    // the capitals seven cells tall, the x-height five at the usual Lowercase height, ascenders as tall as the capitals
    // and descenders two cells down (Weight at its default moves no edge)
    const near = (a: number, b: number) => Math.abs(a - b) < cell * 0.05;
    assert.ok(near(box({}, 'H').y1, 7 * cell), 'H');
    assert.ok(near(box({}, 'x').y1, 5 * cell), 'x');
    assert.ok(near(box({}, 'h').y1, 7 * cell), 'h');
    assert.ok(near(box({}, 'p').y0, -2 * cell), 'p');
    // the heights step in whole cells as Lowercase height, Stem length and Descender length go
    assert.ok(near(box({ xHeight: 1 }, 'x').y1, 6 * cell) && near(box({ xHeight: 0.3 }, 'x').y1, 4 * cell), 'x-height');
    assert.ok(near(box({ extenders: 1 }, 'h').y1, 9 * cell), 'ascender');
    assert.ok(near(box({ descender: 0 }, 'p').y0, -1 * cell) && near(box({ descender: 1 }, 'p').y0, -3 * cell), 'descender');
    // every character the five-row grid draws, it draws on seven
    for (const ch of Object.keys(GRID)) assert.ok(gridCells(ch, {}, { x: 5, asc: 2, desc: 2 }), ch);
  });
});

describe('slot and grid blocks at the ends of their settings', () => {
  it('draw every character with finite outlines however far the settings go', () => {
    const lo = { contrast: 0, counter: 0, aperture: 0, crossbar: 0, innerRound: 0, chamfer: 0, steps: 1, joints: 1, stencil: 1, stencilPos: 0, stencilRound: 0, weight: 0, width: 0, dotSize: 0 };
    const hi = { contrast: 1, counter: 1, aperture: 1, crossbar: 1, innerRound: 1, chamfer: 1, steps: 1, joints: 1, stencil: 1, stencilPos: 1, stencilRound: 1, weight: 1, width: 1, dotSize: 1, roundness: 0 };
    const sets: Params[] = [
      { ...slots, ...lo }, { ...slots, ...hi, iForm: 'bars', jForm: 'cup', mForm: 'raised', qForm: 'inside', dots: 'round' },
      { ...grid, ...lo, cellJoin: 'diagonal', joinRound: 1 }, { ...grid, ...hi, cellJoin: 'pixel', stencil: 0 },
      { ...grid, gridRows: 'seven', xHeight: 0, extenders: 0, descender: 0, cellJoin: 'diagonal', steps: 1, joints: 1 },
      { ...grid, gridRows: 'seven', xHeight: 1, extenders: 1, descender: 1, stencil: 0.5, story: 'single', kForm: 'bar', iForm: 'bars', sForm: 'flat' }
    ] as Params[];
    const chars = [...new Set([...Object.keys(GRID), ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'])];
    for (const p of sets) {
      const f = buildFont(p);
      for (const ch of chars) {
        const g = f.glyph(ch);
        if (!g) continue;
        assert.ok(!/NaN|Infinity/.test(g.d) && Number.isFinite(g.adv), `${p.blockForm} ${ch}`);
      }
    }
  });
});

describe('saved slot and grid designs', () => {
  it('read the settings their letters now follow at their defaults, so they draw as before (PARAMS_VERSION 7)', () => {
    assert.ok(PARAMS_VERSION >= 7);
    const v6 = { ...slots, contrast: 0.9, counter: 0.2, stencil: 0.4, qForm: 'sweep', weight: 0.7, glyphs: { a: { contrast: 0.1, weight: 0.8 } },
      outlines: {} } as unknown as Record<string, unknown>;
    const up = upgradeParams(structuredClone(v6), 6) as Record<string, unknown> & { glyphs: Record<string, Record<string, unknown>> };
    for (const k of ['contrast', 'counter', 'stencil', 'qForm']) assert.ok(!(k in up), k);
    assert.equal(up.weight, 0.7);
    assert.deepEqual(up.glyphs.a, { weight: 0.8 });
    // the block letters draw as they did when these settings did nothing
    assert.equal(outline(sanitizeParams(up), 'AOQ8'), outline({ ...slots, weight: 0.7 }, 'AOQ8'));
    // a grid design likewise, its weights and joins included; a stroke design keeps every value
    const g6 = upgradeParams({ ...grid, vWeight: 0.9, joinRound: 0.6, story: 'single' }, 6);
    for (const k of ['vWeight', 'joinRound', 'story']) assert.ok(!(k in g6), k);
    assert.equal(upgradeParams({ ...DEFAULTS, contrast: 0.9 }, 6).contrast, 0.9);
    // a letter built from grid blocks in a stroke design loses only its own values for them
    const mixed = upgradeParams({ ...DEFAULTS, contrast: 0.9, glyphs: { E: { build: 'blocks', blockForm: 'grid', contrast: 0.2 } } }, 6) as { contrast: number; glyphs: { E: Record<string, unknown> } };
    assert.equal(mixed.contrast, 0.9);
    assert.ok(!('contrast' in mixed.glyphs.E));
  });
});

describe('the controls slot and grid blocks offer', () => {
  it('shows each setting where it reaches the letters', () => {
    const on = (k: ControlKey, p: Partial<Params>) => controlInUse(k, { build: 'blocks', blockForm: 'grid', ...p } as Params);
    for (const k of ['contrast', 'chamfer', 'steps', 'joints', 'stencil', 'iForm', 'jForm', 'mForm', 'qForm', 'dots'] as ControlKey[]) {
      assert.ok(controlInUse(k, { build: 'blocks', blockForm: 'slots' }), `slots ${k}`);
      assert.ok(on(k, {}), `grid ${k}`);
    }
    for (const k of ['counter', 'aperture', 'crossbar'] as ControlKey[]) assert.ok(controlInUse(k, { build: 'blocks', blockForm: 'slots' }) && !on(k, {}), k);
    assert.ok(on('cellJoin', {}) && on('gridRows', {}) && !controlInUse('cellJoin', { build: 'blocks', blockForm: 'slots' }));
    // the heights of the small letters only on seven rows
    for (const k of ['xHeight', 'extenders', 'descender'] as ControlKey[]) assert.ok(!on(k, { gridRows: 'five' }) && on(k, { gridRows: 'seven' }), k);
    assert.equal(CONTROLS.gridRows.cat, 'heights');
  });
});
