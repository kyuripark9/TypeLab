/* The editor's pages and controls (shared/content/pages.ts, controls.ts, search.ts): every control on one
   page, the order of pages and of the controls on each, links naming a page or group, and finding a setting. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CATEGORIES, CONTROLS, GROUPS, SUBS, controlFor, findSettings, firstControl, pageOf, type ActiveKey, type ControlKey } from '../shared/content';
import { DEFAULTS } from '../shared/params';

const controls = Object.keys(CONTROLS) as ControlKey[];

describe('editor pages', () => {
  it('puts every control on one page, and leaves no page empty', () => {
    const pages = CATEGORIES.filter(c => c.id !== 'style');
    assert.equal(new Set(CATEGORIES.map(c => c.id)).size, CATEGORIES.length);
    for (const k of controls) assert.ok(pages.some(c => c.id === CONTROLS[k].cat), k);
    for (const c of pages) {
      assert.ok(controls.some(k => CONTROLS[k].cat === c.id), c.id);
      assert.equal(CONTROLS[firstControl(c.id)].cat, c.id);
    }
  });

  it('lists the pages of a group together, under its name', () => {
    for (const g of Object.keys(GROUPS)) {
      const at = CATEGORIES.flatMap((c, i) => (c.group === g ? [i] : []));
      assert.ok(at.length > 1, g);
      assert.equal(at[at.length - 1] - at[0], at.length - 1, `${g} is split up`);
    }
    // Serifs has a page to itself
    assert.deepEqual(new Set(controls.filter(k => CONTROLS[k].cat === 'serifs').map(k => k.slice(0, 5))), new Set(['serif']));
    for (const k of controls.filter(k => k.startsWith('serif'))) assert.equal(CONTROLS[k].cat, 'serifs', k);
  });

  it('runs from the broadest settings to the finest, on the navigation and on each page', () => {
    const at = (id: string) => CATEGORIES.findIndex(c => c.id === id || c.group === id);
    const nav = ['style', 'proportion', 'shape', 'details'];
    assert.deepEqual([...nav].sort((a, b) => at(a) - at(b)), nav);
    const on = (cat: string) => controls.filter(k => CONTROLS[k].cat === cat);
    // a choice of shape leads the sliders that tune it
    assert.ok(on('curves').indexOf('bowlForm') < on('curves').indexOf('squareness'));
    assert.ok(on('corners').indexOf('bends') < on('corners').indexOf('apex'));
    // the advanced controls close their page
    for (const c of CATEGORIES) {
      const flags = on(c.id).map(k => !!CONTROLS[k].advanced);
      assert.deepEqual(flags, [...flags].sort((a, b) => Number(a) - Number(b)), c.id);
    }
  });

  it('opens the page a link names: a page, a group on its first page, or the page an older link\'s group name (OLD_GROUPS) now maps to', () => {
    assert.equal(pageOf('serifs'), 'serifs');
    assert.equal(pageOf('structure'), 'weight');
    assert.equal(pageOf('shape'), 'curves');
    assert.equal(pageOf('proportion'), 'heights');
    assert.equal(pageOf('details'), 'letters');
    assert.equal(pageOf('effects'), 'effects');
    assert.equal(pageOf('nope'), undefined);
    assert.equal(pageOf(null), undefined);
  });

  it('files each setting where its name says it belongs', () => {
    // a crossbar's height is one of the heights; mirroring turns letters round, like rotation
    assert.equal(CONTROLS.crossbar.cat, 'heights');
    assert.equal(CONTROLS.mirror.cat, 'size');
    for (const c of CATEGORIES) assert.ok(c.hint.length > 0, c.id);
  });

  it('finds a setting by its name, a word people use for it, or a shape it offers', () => {
    const first = (q: string) => findSettings(q)[0];
    assert.equal(first('weight').key, 'weight');
    assert.equal(first('bold').key, 'weight');
    assert.equal(first('italic').key, 'slant');
    assert.equal(first('kerning').key, 'letterSpacing');
    assert.equal(first('x-height').key, 'xHeight');
    assert.equal(first('verticals').key, 'vWeight');
    assert.equal(first('verticals').parent, 'Weight');
    assert.deepEqual([first('slab').key, first('slab').option], ['serif', 'Slab']);
    assert.deepEqual([first('droplet').key, first('droplet').option], ['terminal', 'Droplet']);
    assert.equal(first('stencil position').key, 'stencilPos');
    // every word must match, and nothing comes back for nothing
    assert.equal(findSettings('zzz').length, 0);
    assert.equal(findSettings('  ').length, 0);
    // each hit opens the page its setting is on
    for (const h of findSettings('round', 50)) assert.equal(h.page, CONTROLS[controlFor(h.key)].cat, h.key);
  });

  it('files every nested slider under a control, and every one sets a real setting', () => {
    for (const k of Object.keys(SUBS) as ActiveKey[]) {
      assert.ok(controlFor(k) in CONTROLS, k);
      assert.equal(typeof DEFAULTS[k as keyof typeof DEFAULTS], 'number', k);
    }
    assert.equal(controlFor('serifBracket'), 'serif');
    assert.equal(controlFor('serifTipSlant'), 'serifTip');
    assert.equal(controlFor('serifCup'), 'serifBase');
    assert.equal(controlFor('serifInnerSize'), 'serifInner');
  });
});
