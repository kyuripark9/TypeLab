import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STYLES, TERMINAL_DETAILS } from '../shared/content';
import { buildFont } from '../shared/engine';
import { DEFAULTS, TERMINAL_FORMS, onEndScale, sanitizeParams, type Params, type TerminalForm } from '../shared/params';

/* Stroke ends: each kind of terminal and its forms and finer sliders, straight ends, the Length and Curl of every
   end and of each end on its own (terminals, hooks, tails and plain stem ends). Marks and skeletons are font
   units, y up. */

describe('stroke ends: terminal, terminalForm, terminalRun, terminalLength, terminalCurl, terminalEnds, terminalCurls', () => {
  it('a ball changes the top end of a serif face\'s c, and leaves its low end plain', () => {
    const p = { ...DEFAULTS, serif: true, terminal: 'round', terminalForm: 'ball' } as const;
    const ball = buildFont(p).glyph('c')!, plain = buildFont({ ...p, terminal: 'flat', terminalForm: 'plain' }).glyph('c')!;
    // the top end differs, the bottom one is the same plain end
    assert.notEqual(ball.d, plain.d);
    const low = (g: typeof ball) => g.skeleton.flat().filter(q => q.y < buildFont(p).m.xh * 0.3 && q.x > g.bodyW * 0.6).length;
    assert.equal(low(ball), low(plain));
  });

  it('straight stroke ends run level or plumb without closing a mouth or losing a hook', () => {
    const curved = buildFont(DEFAULTS), straight = buildFont({ ...DEFAULTS, terminalRun: 'straight' });
    // the top end of c runs level along the top of the bowl
    const c = straight.glyph('c')!, ends = c.marks.filter(k => k.type === 'terminal'), top = Math.max(...ends.map(k => k.y));
    assert.ok(Math.abs(top - Math.max(...c.skeleton.flat().map(q => q.y))) < 1);
    const terms = (font: ReturnType<typeof buildFont>, ch: string) => font.glyph(ch)!.marks.filter(k => k.type === 'terminal').length;
    for (const ch of 'cesaCGS') assert.equal(terms(straight, ch), terms(curved, ch), ch);
    // the mouth stays open: its two ends stand well apart
    assert.ok(Math.abs(ends[0].y - ends[1].y) > c.bodyW * 0.5);
    // the hook of j finishes its turn instead of straightening out
    const j = straight.glyph('j')!, tip = j.marks.find(k => k.type === 'tail')!;
    assert.ok(tip.x < j.bodyW - straight.m.s);
    for (const ch of 'noilkx') assert.equal(curved.glyph(ch)!.d, straight.glyph(ch)!.d, ch);
  });

  it('stroke end length stretches and trims the terminals, and leaves tails and hooks alone', () => {
    const f = (terminalLength: number, p: Partial<Params> = {}) => buildFont({ ...DEFAULTS, ...p, terminalLength });
    const ends = (font: ReturnType<typeof buildFont>, ch: string) => font.glyph(ch)!.marks.filter(k => k.type === 'terminal');
    for (const ch of 'CcaesrE2') {
      assert.notEqual(f(0).glyph(ch)!.d, f(0.5).glyph(ch)!.d, ch);
      assert.notEqual(f(1).glyph(ch)!.d, f(0.5).glyph(ch)!.d, ch);
      assert.equal(ends(f(0), ch).length, ends(f(0.5), ch).length, ch);
    }
    // the C's lower end reaches further right and curls further up as it grows
    const low = (font: ReturnType<typeof buildFont>) => ends(font, 'C').reduce((a, k) => (k.y < a.y ? k : a));
    assert.ok(low(f(1)).y > low(f(0.5)).y && low(f(0.5)).y > low(f(0)).y);
    // the r's arm draws on to the right
    const r = (font: ReturnType<typeof buildFont>) => Math.max(...ends(font, 'r').map(k => k.x));
    assert.ok(r(f(1)) > r(f(0.5)) && r(f(0.5)) > r(f(0)));
    // a longer arm widens its letter so it doesn't run into the next
    assert.ok(f(1).glyph('E')!.adv > f(0.5).glyph('E')!.adv);
    for (const ch of 'HOonjQy,') assert.equal(f(0).glyph(ch)!.d, f(1).glyph(ch)!.d, ch);
    assert.equal(f(0, { cursive: 1 }).glyph('n')!.d, f(1, { cursive: 1 }).glyph('n')!.d);
  });

  it('a customized letter sets each stroke end on its own', () => {
    const ends = (font: ReturnType<typeof buildFont>) => font.glyph('C')!.marks.filter(k => k.type === 'terminal');
    const base = buildFont(DEFAULTS), [a, b] = ends(base);
    assert.ok(a.id && b.id && a.id !== b.id);
    const own = buildFont({ ...DEFAULTS, glyphs: { C: { terminalEnds: { [a.id!]: 1 } } } });
    const moved = (id: string) => { const p = ends(base).find(k => k.id === id)!, q = ends(own).find(k => k.id === id)!; return Math.hypot(p.x - q.x, p.y - q.y); };
    assert.ok(moved(a.id!) > 20);
    assert.ok(moved(b.id!) < 0.01);
    assert.equal(own.glyph('c')!.d, base.glyph('c')!.d);
    // the letter's Length sits on the lower part of an end's own scale, and reaches as far there
    const at = (v: number) => ends(buildFont({ ...DEFAULTS, glyphs: { C: { terminalEnds: { [a.id!]: v } } } })).find(k => k.id === a.id)!;
    const full = ends(buildFont({ ...DEFAULTS, terminalLength: 1 })).find(k => k.id === a.id)!, v = onEndScale(1);
    assert.ok(v > 0.7 && v < 0.8, `${v}`);
    assert.ok(Math.hypot(at(v).x - full.x, at(v).y - full.y) < 0.01);
    assert.equal(onEndScale(0.3), 0.3);
    // and past it the end draws on much further than Length can take it
    assert.ok(moved(a.id!) > 3 * Math.hypot(full.x - a.x, full.y - a.y));
  });

  it('curls, straightens and flares one end on its own', () => {
    const C = (curl: number, ch = 'C') => {
      const base = buildFont(DEFAULTS), e = base.glyph(ch)!.marks.find(k => k.type === 'terminal')!;
      const g = buildFont({ ...DEFAULTS, glyphs: { [ch]: { terminalCurls: { [e.id!]: curl } } } }).glyph(ch)!;
      return { g, base: base.glyph(ch)!, e, tip: g.marks.find(k => k.id === e.id)! };
    };
    for (const ch of 'CcfrtyJ') {
      assert.equal(C(0.5, ch).g.d, C(0.5, ch).base.d, ch);
      for (const v of [0, 0.25, 0.75, 1]) {
        const { g, base } = C(v, ch);
        assert.notEqual(g.d, base.d, `${ch} ${v}`);
        assert.equal(g.marks.filter(k => k.type === 'terminal').length, base.marks.filter(k => k.type === 'terminal').length, `${ch} ${v}`);
      }
    }
    // the C's top end, curving down and round to the left, curls further round; straightened it
    // heads off to the right from where its curve starts
    const top = C(0.5), round = C(1), flat = C(0.25);
    assert.ok(round.tip.x < top.tip.x && round.tip.y < top.tip.y);
    assert.ok(flat.tip.y > top.tip.y);
    // no jump on leaving 0.5: a step half as big moves the tip half as far
    const step = (v: number) => Math.hypot(C(v).tip.x - top.tip.x, C(v).tip.y - top.tip.y);
    assert.ok(step(0.51) < 15 && Math.abs(step(0.51) - 2 * step(0.505)) < 0.3);
    // all the way, an end winds round more than once, drawing itself out as far as it needs
    const reach = (g: typeof round.g) => {
      const tip = g.marks.find(k => k.id === top.e.id)!;
      return Math.hypot(tip.x - top.e.x, tip.y - top.e.y);
    };
    assert.ok(reach(round.g) > 60 && reach(C(0).g) > 60);
    assert.ok(C(0, 'c').g.adv > C(0.5, 'c').g.adv, 'a curl swinging out widens its letter');
    // a curl winding back toward the letter keeps clear of its other strokes, however far the end is drawn on
    for (const len of [0.5, 1]) {
      const { e } = C(1, 'r'), font = buildFont({ ...DEFAULTS, glyphs: { r: { terminalCurls: { [e.id!]: 1 }, terminalEnds: { [e.id!]: len } } } });
      const [stem, arm] = font.glyph('r')!.strokes, xs = (s: typeof stem) => s.cmds.flatMap(c => typeof c[1] === 'number' ? [c[1]] : []);
      const low = arm.cmds.filter(c => typeof c[2] === 'number' && c[2] < font.m.xh * 0.5).map(c => c[1] as number);
      assert.ok(low.length && Math.min(...low) > Math.max(...xs(stem)) + font.m.s * 0.2, `r at length ${len}`);
    }
    // all the way out, a curl with room to wind winds round far more than once (along the arm,
    // which first unbends, it turns over twice)
    const wound = (weight: number) => {
      const { e } = C(0, 'r'), line = buildFont({ ...DEFAULTS, weight, glyphs: { r: { terminalCurls: { [e.id!]: 0 } } } }).glyph('r')!.skeleton.at(-1)!;
      let turned = 0;
      for (let k = 2; k < line.length; k++) {
        const a = Math.atan2(line[k - 1].y - line[k - 2].y, line[k - 1].x - line[k - 2].x), b = Math.atan2(line[k].y - line[k - 1].y, line[k].x - line[k - 1].x);
        turned += Math.atan2(Math.sin(b - a), Math.cos(b - a));
      }
      return Math.abs(turned) / (2 * Math.PI);
    };
    assert.ok(wound(0.5) > 2 && wound(0.5) < 3.5, `${wound(0.5)}`);
    // wound round more than once, a curl's tip stays clear of the turn around it, however heavy
    for (const weight of [0.3, 0.5, 0.75]) {
      const { e } = C(0, 'j'), font = buildFont({ ...DEFAULTS, weight, glyphs: { j: { terminalCurls: { [e.id!]: 0 } } } });
      for (const line of font.glyph('j')!.skeleton) {
        const tip = line[line.length - 1];
        let arc = 0;
        for (let k = line.length - 2; k >= 0; k--) {
          arc += Math.hypot(line[k + 1].x - line[k].x, line[k + 1].y - line[k].y);
          if (arc > Math.PI * font.m.s * 1.3) assert.ok(Math.hypot(line[k].x - tip.x, line[k].y - tip.y) > font.m.s * 1.5, `j at weight ${weight}`);
        }
      }
    }
    assert.equal(sanitizeParams({ glyphs: { C: { terminalCurls: { '0e': 1.4, x: 0.2 } } } }).glyphs.C.terminalCurls!['0e'], 1);
  });

  it('curls every terminal in sync with Curl, unless an end has a curl of its own', () => {
    const base = buildFont(DEFAULTS), e = base.glyph('c')!.marks.filter(k => k.type === 'terminal').map(k => k.id!);
    const one = (curls: Record<string, number>) => buildFont({ ...DEFAULTS, glyphs: { c: { terminalCurls: curls } } }).glyph('c')!.d;
    const all = (v: number, p: Partial<Params> = {}) => buildFont({ ...DEFAULTS, ...p, terminalCurl: v });
    assert.equal(all(0.5).glyph('c')!.d, base.glyph('c')!.d);
    for (const v of [0.2, 0.8]) assert.equal(all(v).glyph('c')!.d, one(Object.fromEntries(e.map(id => [id, v]))), `${v}`);
    for (const ch of 'CfrtyJ') assert.notEqual(all(0.8).glyph(ch)!.d, base.glyph(ch)!.d, ch);
    // an end's own curl wins over it, and one letter can have a Curl of its own
    assert.equal(all(0.8, { glyphs: { c: { terminalCurls: { [e[0]]: 0.5 } } } }).glyph('c')!.d, one({ [e[1]]: 0.8 }));
    const own = all(0.5, { glyphs: { c: { terminalCurl: 0.8 } } });
    assert.equal(own.glyph('c')!.d, all(0.8).glyph('c')!.d);
    assert.equal(own.glyph('C')!.d, base.glyph('C')!.d);
    assert.equal(sanitizeParams({ terminalCurl: 2 }).terminalCurl, 1);
  });

  it('draws each form of each kind of stroke end, and shapes it in finer detail', () => {
    const c = (p: Partial<Params>) => buildFont({ ...DEFAULTS, ...p }).glyph('c')!.d;
    for (const [kind, forms] of Object.entries(TERMINAL_FORMS) as [Params['terminal'], readonly TerminalForm[]][]) {
      const first = c({ terminal: kind });
      forms.forEach((form, i) => {
        const base = c({ terminal: kind, terminalForm: form });
        assert.ok(!base.includes('NaN'), form);
        // the first form is how the kind draws when no form of its own is picked; the others differ from it
        if (i === 0) assert.equal(base, first, form); else assert.notEqual(base, first, form);
        // a form of another kind leaves this one as it was
        if (i > 0) assert.equal(c({ terminal: kind === 'flat' ? 'round' : 'flat', terminalForm: form }), c({ terminal: kind === 'flat' ? 'round' : 'flat' }), `${form} elsewhere`);
        for (const k of TERMINAL_DETAILS[form]) {
          for (const v of [0, 1]) {
            if (v === DEFAULTS[k]) continue;
            const d = c({ terminal: kind, terminalForm: form, [k]: v });
            assert.notEqual(d, base, `${k} ${v} on ${form}`);
            assert.ok(!d.includes('NaN'), `${k} ${v} on ${form}`);
          }
        }
      });
    }
    // a letter can have its own
    const font = buildFont({ ...DEFAULTS, terminal: 'round', glyphs: { c: { terminalForm: 'droplet' } } });
    assert.notEqual(font.glyph('c')!.d, c({ terminal: 'round' }));
    assert.equal(font.glyph('e')!.d, buildFont({ ...DEFAULTS, terminal: 'round' }).glyph('e')!.d);
    assert.equal(sanitizeParams({ terminalForm: 'spiky' }).terminalForm, DEFAULTS.terminalForm);
  });

  it('sets the tip of a hook or tail only by its own length', () => {
    for (const [ch, p] of [['f', {}], ['y', {}], ['Q', {}], ['n', { cursive: 0.8, scriptForm: 'print' }]] as const) {
      const base = buildFont({ ...DEFAULTS, ...p }), tips = base.glyph(ch)!.marks.filter(k => k.type === 'terminal' && k.hook);
      assert.ok(tips.length, ch);
      // Length leaves it alone, so Tails & hooks (or Cursive) sets it (y and Q have no other ends to shift the letter)
      if (ch === 'y' || ch === 'Q') assert.equal(buildFont({ ...DEFAULTS, ...p, terminalLength: 1 }).glyph(ch)!.d, base.glyph(ch)!.d, ch);
      const own = buildFont({ ...DEFAULTS, ...p, glyphs: { [ch]: { terminalEnds: { [tips[0].id!]: 1 } } } }).glyph(ch)!;
      const q = own.marks.find(k => k.id === tips[0].id)!;
      assert.ok(Math.hypot(q.x - tips[0].x, q.y - tips[0].y) > 20, ch);
      // the tail's own drag handle goes with it
      if (ch !== 'n') assert.ok(own.marks.some(k => k.type === 'tail' && Math.hypot(k.x - q.x, k.y - q.y) < 1), ch);
    }
  });

  it('gives the free ends of stems, legs and diagonals a length and curl of their own', () => {
    const base = buildFont(DEFAULTS), plain = (ch: string, f = base) => f.glyph(ch)!.marks.filter(k => k.type === 'end');
    for (const ch of 'lAHkxn') assert.ok(plain(ch).length, ch);
    // an end buried in another stroke (T's stem top, under the bar) and a closed shape have none
    assert.deepEqual(plain('T').map(k => k.id), ['p0s']);
    assert.equal(plain('O').length, 0);
    // Length and Curl (at a style's own Curl, the first style that sets one) leave them where they are drawn
    const curled = STYLES.find(s => s.params.terminalCurl !== 0.5)!.params;
    for (const ch of 'lA') {
      assert.equal(buildFont({ ...DEFAULTS, terminalLength: 1 }).glyph(ch)!.d, base.glyph(ch)!.d, ch);
      assert.equal(buildFont({ ...DEFAULTS, terminalCurl: curled.terminalCurl }).glyph(ch)!.d, base.glyph(ch)!.d, ch);
    }
    // their own length draws them on, past the clip at A's feet
    const foot = plain('A').find(k => k.id === 'p0s')!;
    const long = plain('A', buildFont({ ...DEFAULTS, glyphs: { A: { terminalEnds: { p0s: 0.9 } } } })).find(k => k.id === 'p0s')!;
    assert.ok(long.y < foot.y - 100, `${long.y}`);
    // and their own curl bends them
    assert.notEqual(buildFont({ ...DEFAULTS, glyphs: { l: { terminalCurls: { p0e: 0.8 } } } }).glyph('l')!.d, base.glyph('l')!.d);
    assert.deepEqual(sanitizeParams({ terminalEnds: { p0s: 0.3, q0s: 1 } }).terminalEnds, { p0s: 0.3 });
    // with serifs on, every letter keeps the same ends: a serif goes with its end, and a curl lets it go
    const serif = buildFont({ ...DEFAULTS, serif: true }), ids = (f: typeof base, ch: string) => f.glyph(ch)!.marks.filter(k => k.id).map(k => k.id).sort();
    for (const ch of 'lHkEf') assert.deepEqual(ids(serif, ch), ids(base, ch), ch);
    const l = serif.glyph('l')!, top = l.marks.find(k => k.id === 'p0e')!;
    const tall = buildFont({ ...DEFAULTS, serif: true, glyphs: { l: { terminalEnds: { p0e: 0.9 } } } }).glyph('l')!;
    assert.ok(tall.marks.find(k => k.id === 'p0e')!.y > top.y + 100);
    assert.equal(tall.serifs.length, l.serifs.length);
    assert.equal(buildFont({ ...DEFAULTS, serif: true, glyphs: { l: { terminalCurls: { p0e: 0.8 } } } }).glyph('l')!.serifs.length, l.serifs.length - 1);
  });
});
