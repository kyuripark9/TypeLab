/* The editor's pages and controls (shared/content/pages.ts, controls.ts, search.ts): every control on one
   page, the order of pages and of the controls on each, the pages letters built from blocks are offered, links naming
   a page or group (and reading a link into the editor, client/lib/routes.ts), finding a setting, every nested slider
   placed in the panel, the parts the letter inspector names, and the choices left out on a card's letters. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ANATOMY, CATEGORIES, CONTROLS, FILL_SUBS, GROUPS, PART_CONTROL, ROUND_SUBS, SERIF_INNER_SUBS,
  SERIF_TIP_DETAILS, SLICE_SUBS, STENCIL_SUBS, STYLES, SUBS, TERMINAL_DETAILS, TERMINAL_SHAPES, WEIGHT_SUBS, choicesOff, controlFor, controlInUse, controlOff, findSettings, firstControl,
  keepWhole, offsKey, pageOf, pagesFor, subInUse,
  type ActiveKey, type CategoryId, type ControlKey
} from '../shared/content';
import { BLOCK_FORMS, DEFAULTS, TERMINAL_FORMS, type Params } from '../shared/params';
import { FONT_OFFS } from '../shared/font-offs';
import { STYLE_FONTS } from '../shared/free-fonts';
import { readDeepLink } from '../client/lib/routes';

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

  it('offers only the pages with something to shape: letters built from blocks have no ends or serifs, and only the slot and grid blocks letter forms', () => {
    assert.deepEqual(pagesFor({ build: 'strokes', blockForm: 'basic' }), CATEGORIES);
    for (const blockForm of BLOCK_FORMS) {
      const pages = pagesFor({ build: 'blocks', blockForm }), ids = pages.map(c => c.id);
      // the same array for the same letters, as the navigation's rows are kept by it
      assert.equal(pagesFor({ build: 'blocks', blockForm }), pages);
      for (const c of CATEGORIES) {
        const used = controls.some(k => CONTROLS[k].cat === c.id && controlInUse(k, { build: 'blocks', blockForm }));
        assert.equal(ids.includes(c.id), c.id === 'style' || used, `${blockForm} ${c.id}`);
      }
      for (const id of ['ends', 'serifs']) assert.ok(!ids.includes(id as CategoryId), `${blockForm} ${id}`);
      // the slot and grid blocks draw some letter forms of their own (I J M Q and the dots; a k I i l J M Q R Y s and the dots)
      assert.equal(ids.includes('letters'), blockForm !== 'basic', `${blockForm} letters`);
      // a page left out always has one before it to give way to
      assert.equal(ids[1], 'weight', blockForm);
    }
    // letters built from arcs keep their ends, their heights and their openness but have no serifs; of the letter
    // forms only their dots
    const arcs = pagesFor({ build: 'arcs', blockForm: 'basic' }).map(c => c.id);
    assert.ok(['ends', 'heights', 'insides'].every(id => arcs.includes(id as CategoryId)) && !arcs.includes('serifs'), arcs.join());
    assert.deepEqual(controls.filter(k => CONTROLS[k].cat === 'letters' && controlInUse(k, { build: 'arcs', blockForm: 'basic' })), ['dots']);
    // and their corners' Roundness without its Joins and Counters, which blot their crossings
    assert.deepEqual(Object.keys(ROUND_SUBS).filter(s => !subInUse(s, { build: 'arcs' })), ['joinRound', 'innerRound']);
    assert.ok(Object.keys(ROUND_SUBS).every(s => subInUse(s, { build: 'strokes' })));
    // letters drawn from a font without the serif tips' and the inside serifs' sliders, which broke them moved with
    // Weight and the rest; letters the engine draws keep them
    const serifSubs = [...Object.values(SERIF_TIP_DETAILS).flat(), ...Object.keys(SERIF_INNER_SUBS)];
    assert.ok(serifSubs.length === 4 && serifSubs.every(s => !subInUse(s, { build: 'strokes', freeFont: 'Couture:600' }) && subInUse(s, { build: 'strokes', freeFont: '' })));
    assert.ok(subInUse('serifCup', { build: 'strokes', freeFont: 'Couture:600' }));
    // letters built from blocks or arcs without Weight's Verticals and Horizontals, which thinned apart broke them
    for (const build of ['blocks', 'arcs'] as const) assert.deepEqual(Object.keys(WEIGHT_SUBS).filter(s => !subInUse(s, { build })), ['vWeight', 'hWeight']);
    assert.ok(Object.keys(WEIGHT_SUBS).every(s => subInUse(s, { build: 'strokes' })));
    // what the letters are built from comes with the style they start from: no control changes it
    assert.ok(!('build' in CONTROLS) && !('blockForm' in CONTROLS));
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

  it('reads a link into the editor: the style, text, page, control, letter and modes it asks for', () => {
    const read = (q: string) => readDeepLink(new URLSearchParams(q));
    assert.deepEqual(read('style=serif&cat=serifs&active=serifTip&inspect=R&text=Hello&hot=1&pen=1'),
      { style: 'serif', text: 'Hello', page: 'serifs', active: 'serifTip', hot: true, inspect: 'R', pen: true });
    // a control opens the page it is on whatever `cat` says, a nested slider its control's
    assert.deepEqual([read('cat=effects&active=serifCup').page, read('cat=effects&active=serifCup').active], ['serifs', 'serifCup']);
    // a group opens on its first page, an older group name where it maps to, and the Style page by its name
    assert.equal(read('cat=shape').page, 'curves');
    assert.equal(read('cat=structure').page, 'weight');
    assert.equal(read('cat=style').page, 'style');
    // what it doesn't know, or is left empty, it leaves out
    assert.deepEqual(read('cat=nope&active=nope&style=&hot=&mode=paragraph'),
      { style: undefined, text: undefined, page: undefined, active: undefined, hot: false, inspect: undefined, pen: false });
  });

  it('files each setting where its name says it belongs', () => {
    // a crossbar's height is one of the heights; mirroring turns letters round, like rotation
    assert.equal(CONTROLS.crossbar.cat, 'heights');
    assert.equal(CONTROLS.mirror.cat, 'size');
    for (const c of CATEGORIES) assert.ok(c.hint.length > 0, c.id);
  });

  it("leaves out on a card's letters the choices that break them (FONT_OFFS), never the design's own", () => {
    const card = (id: string) => ({ ...DEFAULTS, ...STYLES.find(s => s.id === id)!.params, freeFont: STYLE_FONTS[id] }) as Params;
    // (switched off, the Transitional card's serifs came out ragged: its switch is off the panel, and so is the Serifs
    // page where nothing else is left on it)
    const serif = card('serif');
    assert.deepEqual(FONT_OFFS[STYLE_FONTS.serif]?.serif, ['false']);
    assert.deepEqual([...choicesOff(serif, 'serif')], ['false']);
    assert.ok(controlOff('serif', serif));
    assert.ok(!controlOff('serif', card('grotesque')), "the grotesque's serifs switch on whole");
    // (nor the Didone's and the Old Style's, which leave hairline stubs where their serifs were, looked at drawn)
    assert.ok(controlOff('serif', card('didone')) && controlOff('serif', card('oldstyle')));
    // (switched off already, as a design saved so has it, the switch is offered, to switch them back on)
    assert.ok(!controlOff('serif', { ...serif, serif: false }));
    assert.equal(choicesOff({ ...serif, serif: false }, 'serif').size, 0);
    // (on the Formal Script card, whose letters serifs break, serifs are off and stay off: nothing on the Serifs page
    // could take, so the page goes)
    const script = card('chancery');
    assert.ok(controlOff('serif', script) && controlOff('serifTip', script) && !pagesFor(script).some(c => c.id === 'serifs'));
    // (on a card in a font the serifs keep their own shapes, their tips', sides' and inside serifs' pickers off, and the
    // Serifs page its switch; square bowl joins, upright and arched diagonals, the k's stem and bar, round bends, the
    // cupped Y and the raised M are off too, OFFS_ON_FONTS, so their pickers go)
    assert.ok(pagesFor(card('grotesque')).some(c => c.id === 'serifs') && controlOff('serifTip', card('grotesque')) && !controlOff('serif', card('grotesque')));
    for (const id of Object.keys(STYLE_FONTS).filter(s => STYLE_FONTS[s] in FONT_OFFS)) for (const k of ['serifTip', 'serifSides', 'serifInner', 'bowlJoin', 'diagonals', 'kForm', 'bends', 'yForm', 'mForm'] as ControlKey[]) assert.ok(controlOff(k, card(id)), `${id} ${k}`);
    assert.ok(choicesOff(card('grotesque'), 'diagonals').has('arch') && choicesOff(card('grotesque'), 'kForm').has('bar') && !choicesOff(card('grotesque'), 'kForm').has('arm'));
    // (and each choice left out on a card is one its picker offers, and never the card's own)
    for (const [letters, offs] of Object.entries(FONT_OFFS)) for (const [k, vs] of Object.entries(offs)) {
      const id = Object.keys(STYLE_FONTS).find(s => STYLE_FONTS[s] === letters);
      if (!id) continue;
      assert.ok(!choicesOff(card(id), k).has(k === 'terminal' ? `${card(id).terminal}/${card(id).terminalForm}` : String(card(id)[k as keyof Params])), `${id}'s own ${k}`);
      assert.ok(vs.length, `${letters} ${k}`);
    }
    // (a trait of the Adjust tab laid over the card takes no shape its letters break in: the serifs stay on)
    assert.equal(keepWhole({ ...serif, serif: false }, serif, STYLE_FONTS.serif).serif, true);
    assert.equal(keepWhole({ ...serif, weight: 0.2 }, serif, STYLE_FONTS.serif).weight, 0.2);
    // (Cursive off the panel on the cards with feet of serifs, its strokes running into them, and the Adjust tab's
    // Script keeping the card's own there, on the Block card, its hooks slit at the stems, and on the Blackletter and
    // seven sans cards, the i's and j's dots run into the stems at a short Lowercase height; offered on the Rounded card)
    for (const id of ['typewriter', 'code', 'oldstyle', 'didone', 'fatface', 'serif', 'softslab', 'block', 'blackletter',
      'grotesque', 'humanist', 'geometric', 'squircle', 'chunkyround', 'woodtype', 'comic']) {
      assert.ok(controlOff('cursive', card(id)), id);
      assert.equal(keepWhole({ ...card(id), cursive: 1 }, card(id), STYLE_FONTS[id]).cursive, card(id).cursive, id);
    }
    assert.ok(!controlOff('cursive', card('soft')) && keepWhole({ ...card('soft'), cursive: 1 }, card('soft'), STYLE_FONTS.soft).cursive === 1);
    // (Steps off the slot blocks, its notches cutting their sides with Facets; offered on the grid blocks)
    assert.ok(controlOff('steps', card('slotblocks')) && !controlOff('steps', card('gridblocks')));
    assert.equal(keepWhole({ ...card('slotblocks'), steps: 1 }, card('slotblocks'), 'blocks:slots').steps, card('slotblocks').steps);
    // (the arcs keep their flat and round ends; the level ends, which shut the R at a long Length, are off)
    assert.ok(choicesOff(card('arcs'), 'terminal').has('cut/level') && !choicesOff(card('arcs'), 'terminal').has('flat/plain'));
    // (the Rounded card's box bowls off, their sides cutting into the stems at a light Weight; offered on the Neo Grotesque)
    assert.ok(choicesOff(card('soft'), 'bowlForm').has('box') && !choicesOff(card('grotesque'), 'bowlForm').has('box'));
    // (the Chunky Round's looped R, the Wood Type's scooped ends and the Formal Script's box bowls off; Slant off the
    // Formal Script, its swashes ragged stood up, and the Adjust tab's slants keeping its own; offered on a sans)
    assert.ok(choicesOff(card('chunkyround'), 'rForm').has('loop') && choicesOff(card('woodtype'), 'terminal').has('flat/scooped'));
    assert.ok(choicesOff(card('chancery'), 'bowlForm').has('box'));
    assert.ok(controlOff('slant', card('chancery')) && !controlOff('slant', card('grotesque')));
    // (and off the serif italic, its 4's diagonal dropping out slanted further at one Width)
    assert.ok(controlOff('slant', card('serifitalic')));
    assert.equal(keepWhole({ ...card('serifitalic'), slant: 1 }, card('serifitalic'), STYLE_FONTS.serifitalic).slant, card('serifitalic').slant);
    assert.equal(keepWhole({ ...card('chancery'), slant: 0 }, card('chancery'), STYLE_FONTS.chancery).slant, card('chancery').slant);
    // (the looped R off on every card in a font, filled solid heavy and narrow; the box bowls of eight more cards off,
    // apart from or spurred at their stems at the lightest)
    for (const id of ['casual', 'grotesque', 'serif', 'block']) assert.ok(controlOff('rForm', card(id)), id);
    for (const id of ['typewriter', 'oldstyle', 'didone', 'informal', 'humanist', 'serif', 'serifitalic', 'fatface']) {
      assert.ok(choicesOff(card(id), 'bowlForm').has('box'), id);
    }
    // (Wobble off the Fat Face, its small counters shut heavy, and the Arcs, their b's and p's bowls shaken off light
    // and wide, the Adjust tab keeping their own; offered on a sans; the Block card's ball and droplet ends off, its
    // e's slit filled narrow)
    assert.ok(controlOff('wobble', card('fatface')) && controlOff('wobble', card('arcs')) && !controlOff('wobble', card('grotesque')));
    assert.equal(keepWhole({ ...card('arcs'), wobble: 1 }, card('arcs'), 'arcs').wobble, card('arcs').wobble);
    assert.equal(keepWhole({ ...card('fatface'), wobble: 1 }, card('fatface'), STYLE_FONTS.fatface).wobble, card('fatface').wobble);
    for (const end of ['round/ball', 'round/droplet']) assert.ok(choicesOff(card('block'), 'terminal').has(end), end);
    // (Bowl overlap and Tails & hooks off every card in a font, a d parting into an o and an l and the tails curling
    // into hooks under the letters beside them; offered on the engine's own letters)
    for (const id of ['grotesque', 'serif', 'chancery', 'block']) {
      assert.ok(controlOff('overlap', card(id)) && controlOff('tail', card(id)), id);
      assert.equal(keepWhole({ ...card(id), overlap: 0, tail: 1 }, card(id), STYLE_FONTS[id]).tail, card(id).tail, id);
    }
    assert.ok(!controlOff('tail', card('arcs')) || !controlOff('overlap', card('arcs')));
    // (the pages and what the panel leaves out are read again when the design's own choice changes)
    assert.notEqual(offsKey(serif), offsKey({ ...serif, serif: false }));
    assert.equal(pagesFor(serif), pagesFor({ ...serif, weight: 0.2 }));
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
    // (the serifs' own shapes are off the panel; the inside serifs still take a shape of their own)
    assert.deepEqual([first('slab').key, first('slab').option], ['serifInner', 'Slab']);
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
    assert.equal(controlFor('serifTipSlant'), 'serifTip');
    assert.equal(controlFor('serifCup'), 'serifBase');
    assert.equal(controlFor('serifInnerSize'), 'serifInner');
  });

  it('offers every shape of stroke end once in the Stroke ends list, each a form of its own kind', () => {
    const listed = TERMINAL_SHAPES.flatMap(g => g.shapes.map(s => `${s.terminal}:${s.form}`));
    const all = Object.entries(TERMINAL_FORMS).flatMap(([t, fs]) => fs.map(f => `${t}:${f}`));
    assert.deepEqual([...listed].sort(), [...all].sort());
    assert.equal(new Set(TERMINAL_SHAPES.flatMap(g => g.shapes.map(s => s.label))).size, listed.length);
  });

  it('places every nested slider in the control panel', () => {
    // a nested slider shows only where the panel places it: under its control as a whole map (NESTED in
    // panel/ControlsPanel.tsx; the fill, serif inside, stencil and slice controls), as the finer shape of a form
    // or kind picked (stroke ends, serif tips), or by name (panel/ShapeControls.tsx, SliderControl.tsx)
    const placed = new Set<string>([
      ...[FILL_SUBS, SERIF_INNER_SUBS, STENCIL_SUBS, SLICE_SUBS, WEIGHT_SUBS, ROUND_SUBS].flatMap(m => Object.keys(m)),
      ...[TERMINAL_DETAILS, SERIF_TIP_DETAILS].flatMap(m => Object.values(m).flat()),
      'terminalLength', 'terminalCurl', 'serifCup', 'dotSize', 'boxRound', 'barGap'
    ]);
    for (const k of Object.keys(SUBS)) assert.ok(placed.has(k), `${k} is placed nowhere in the panel`);
  });

  it('names each part of a letter a control shapes, and the control is a real one', () => {
    // the explainer titles a part pointed at by its ANATOMY entry; a join, grabbed by its handle, has none (see PART_CONTROL)
    for (const [part, k] of Object.entries(PART_CONTROL)) {
      assert.ok(k! in CONTROLS, `${part}: ${k}`);
      if (part !== 'join') assert.ok(ANATOMY[part], part);
    }
  });
});
