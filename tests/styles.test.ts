/* The starting styles (shared/content/styles.ts, tags.ts): valid presets, the Style page's cards and Feeling
   chips, word spaces in joined-up scripts, and letters that must sit right (v w V W on the baseline, no gap
   after a curled Q). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KIND_SECTIONS, MOODS, PAGE_STYLES, STYLE_GROUPS, STYLES, TAG_FACE } from '../shared/content';
import { buildFont } from '../shared/engine';
import { isValidParams } from '../shared/params';

/** The lowest point of a glyph's ink, in font units above the baseline (outlines are drawn y-down). */
const inkBottom = (d: string) => {
  const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  let y = -Infinity;
  for (let i = 1; i < n.length; i += 2) y = Math.max(y, n[i]);
  return -y;
};

describe('starting styles', () => {
  it('keep every preset to valid settings, so a design saved from any of them is accepted', () => {
    for (const s of STYLES) assert.ok(isValidParams(s.params), s.id);
  });
});

describe('style page', () => {
  it('shows each style once, and only solid letters', () => {
    for (const s of PAGE_STYLES) assert.ok(s, 'every card names a defined style');
    assert.equal(new Set(PAGE_STYLES.map(s => s.id)).size, PAGE_STYLES.length);
    for (const s of PAGE_STYLES) assert.ok(s.params.fill === 'solid' && !s.params.stencil && !s.params.slice, s.id);
  });

  it('keeps every Feeling chip live, and the finder offers only Categories and genres with a card', () => {
    // the panel shows every feeling, so each needs a card; the finder leaves out answers with none
    for (const m of MOODS) assert.ok(PAGE_STYLES.some(s => s.moods.includes(m.id)), m.id);
    assert.ok(STYLE_GROUPS.filter(g => PAGE_STYLES.some(s => s.group === g.id)).length >= 2);
    for (const s of PAGE_STYLES) for (const k of s.kinds) assert.ok(KIND_SECTIONS.some(sec => sec.tags.some(t => t.id === k)), `${s.id}: ${k}`);
  });

  it('draws each Feeling chip in a style on the page that carries it', () => {
    const onPage = new Set(PAGE_STYLES.map(s => s.id));
    for (const m of MOODS) {
      const face = TAG_FACE[m.id];
      assert.ok(onPage.has(face), `${m.id} is drawn in ${face}, which has no card`);
      assert.ok(STYLES.find(s => s.id === face)!.moods.includes(m.id), `${m.id} is drawn in ${face}, which does not carry it`);
    }
  });
});

describe('word spaces', () => {
  /** The ink gap between the n and the o of "n o", in font units. */
  const wordGap = (id: string) => {
    const f = buildFont(STYLES.find(s => s.id === id)!.params), ln = f.layout('n o', Infinity)[0];
    const edge = (i: number, right: boolean) => {
      const it = ln.items[i], n = f.glyph(it.ch)!.d.match(/-?\d+(\.\d+)?/g)!.map(Number), xs = n.filter((_, k) => k % 2 === 0);
      return it.x + (right ? Math.max(...xs) : Math.min(...xs));
    };
    return (edge(2, false) - edge(0, true)) / f.m.xh;
  };
  it('keep joined-up scripts apart word by word', () => {
    for (const s of PAGE_STYLES.filter(s => s.params.cursive >= 0.5)) assert.ok(wordGap(s.id) > 0.35, `${s.id}: ${wordGap(s.id).toFixed(2)} x-heights`);
  });
});

describe('diagonal letters', () => {
  it('stand v w V W on the baseline, however narrow, heavy or round', () => {
    for (const s of PAGE_STYLES) {
      const f = buildFont(s.params);
      for (const ch of ['v', 'w', 'V', 'W']) {
        const b = inkBottom(f.glyph(ch)!.d);
        // Didone hairlines and blackletter cuts come to a point a little way up; nothing floats a stroke clear
        assert.ok(b < f.m.s * 0.8, `${s.id} ${ch} floats ${Math.round(b)} above the baseline`);
      }
    }
  });

  it('leaves no gap after a Q whose tail curls out', () => {
    for (const id of ['swash', 'nouveau']) {
      const f = buildFont(STYLES.find(s => s.id === id)!.params);
      assert.ok(f.glyph('Q')!.adv < f.glyph('O')!.adv * 1.1, id);
    }
  });
});
