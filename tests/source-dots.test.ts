/* A source's round and square dots (`dots` on a program's `source-dots-v1` policy): the shapes each style offers, the
   style's own dots unchanged at Original, every bound dot reshaped point for point at the weight and width extremes and
   with Size, a dot's foot on the baseline, the diaeresis and dot above, Points edits carried there and back, saved
   settings, adoption, and the Letters page. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pagesFor } from '../shared/content';
import { buildFont } from '../shared/engine';
import { cmdsBox } from '../shared/engine/geom';
import { drawnCmds, type Drawn, type Node } from '../shared/engine/outline';
import { DEFAULTS, drawnAtOf, freeAtOf, type Params } from '../shared/params';
import { sourceAllows, sourceSupports } from '../shared/source/capabilities';
import { adoptProgram, programUpgrade } from '../shared/source/adoption';
import { dotShapeContour } from '../shared/source/dots';
import { sourceProgram } from '../shared/source/registry';
import { masterInfo } from '../shared/source/master-catalog';
import { PROGRAM_REVISIONS, programForFont, programInfo } from '../shared/source/program-catalog';
import type { ProgramSourceRef } from '../shared/source/model';
import { loadDesignSources, loadSource, loadSourceMarks } from '../server/sources';

function params(ref: ProgramSourceRef): Params {
  const info = masterInfo(ref), width = programInfo(ref)?.width;
  assert.ok(info && width); loadSource(ref);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min), neutral = (width.neutral - width.min) / (width.max - width.min);
  const p: Params = { ...DEFAULTS, sourceProgram: ref, freeFont: ref.fontId, weight, width: neutral, freeAt: { ...freeAtOf(DEFAULTS), weight, width: neutral, dotSize: .5 } };
  loadDesignSources(p);
  return p;
}
const current = [...new Map(PROGRAM_REVISIONS.map(entry => [entry.ref.fontId, entry])).values()].filter(entry => programForFont(entry.ref.fontId)?.digest === entry.ref.digest);
/** The revision before dots: the same program without its policy. */
const before = (fontId: string) => PROGRAM_REVISIONS.findLast(entry => entry.ref.fontId === fontId && !entry.data.dots)!;
const of = (fontId: string) => current.find(entry => entry.ref.fontId === fontId)!;
const box = (contours: readonly (readonly Node[])[]) => cmdsBox(drawnCmds(contours as Node[][]))!;
/** How much of its box a contour fills, stood upright first where the style leans. */
function fill(contour: readonly Node[], slant: number): number {
  const lean = Math.tan(slant * Math.PI / 180), upright = contour.map(n => ({ ...n, x: n.x - lean * n.y,
    ...(n.ix === undefined ? {} : { ix: n.ix - lean * n.iy! }), ...(n.ox === undefined ? {} : { ox: n.ox - lean * n.oy! }) }));
  const b = box([upright]), pts: { x: number; y: number }[] = [];
  const cmds = drawnCmds([upright]);
  let at = { x: 0, y: 0 };
  for (const c of cmds) {
    if (c[0] === 'M' || c[0] === 'L') { at = { x: c[1], y: c[2] }; pts.push(at); }
    else if (c[0] === 'C') {
      for (let k = 1; k <= 16; k++) {
        const t = k / 16, u = 1 - t;
        pts.push({ x: u * u * u * at.x + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5], y: u * u * u * at.y + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6] });
      }
      at = { x: c[5], y: c[6] };
    }
  }
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p.x * q.y - q.x * p.y; }
  return Math.abs(area / 2) / ((b.x1 - b.x0) * (b.y1 - b.y0));
}
const points = (d: Drawn) => d.contours.map(c => c.map(n => [n.x, n.y]));
/** The contour of the i's tittle in `p`'s program. */
const tittleOf = (p: Params) => sourceProgram(p.sourceProgram!)!.components!.data.glyphs.find(binding => binding.glyph === 'i')!.contours[0];

describe('source dots', () => {
  it('offers each style the shapes its own dots are not, measured and recorded in its current program', () => {
    const offers = Object.fromEntries(current.map(entry => [entry.ref.fontId.split(':')[0], entry.data.dots?.shapes.join('+')]));
    assert.deepEqual(offers, {
      Almanac: 'square', Ballyhoo: 'square', Boardwalk: 'round+square', Bulwark: 'round', Cathedral: 'round+square', Compass: 'square',
      Cotton: 'square', Couture: 'square', Dispatch: 'round', Funnies: 'square', Gumdrop: 'round+square', Hearth: 'round',
      Jotter: 'round+square', Kernel: 'square', Mainline: 'square', Orbital: 'square', Parlance: 'square', Serenade: 'round+square',
      Sonnet: 'square', Timber: 'round', Turnpike: 'square', Vellum: 'square'
    });
    // the leaning styles' dots lean with their letters
    assert.deepEqual(current.filter(entry => entry.data.dots!.slant).map(entry => entry.ref.fontId.split(':')[0]).sort(), ['Boardwalk', 'Jotter', 'Serenade', 'Sonnet']);
  });

  it('draws the style\'s own dots exactly at Original', () => {
    for (const entry of current) {
      const now = buildFont(params(entry.ref)), then = buildFont(params(before(entry.ref.fontId).ref));
      for (const ch of 'ij.:;!?…·÷Hno') assert.deepEqual(now.glyph(ch)?.cmds, then.glyph(ch)?.cmds, `${entry.ref.fontId} ${ch}`);
    }
  });

  it('reshapes every bound dot point for point, and nothing else, from the lightest to the heaviest and narrowest to widest', () => {
    for (const entry of current) for (const shape of entry.data.dots!.shapes) {
      const p = params(entry.ref), policy = entry.data.dots!, bindings = sourceProgram(entry.ref)!.components!.data.glyphs;
      for (const at of [{}, { weight: 0 }, { weight: 1 }, { width: 0 }, { width: 1 }]) {
        const own = buildFont({ ...p, ...at }), shaped = buildFont({ ...p, ...at, dots: shape }), what = `${entry.ref.fontId} ${shape} ${JSON.stringify(at)}`;
        for (const binding of bindings) {
          const a = own.glyph(binding.glyph)!.drawn!, b = shaped.glyph(binding.glyph)!.drawn!, here = `${what} ${binding.glyph} ${binding.id}`;
          assert.equal(b.adv, a.adv, here);
          assert.deepEqual(b.contours.map(c => c.length), a.contours.map(c => c.length), here);
          a.contours.forEach((contour, ci) => {
            if (!bindings.some(other => other.glyph === binding.glyph && other.contours.includes(ci))) {
              assert.deepEqual(points({ adv: 0, contours: [b.contours[ci]] }), points({ adv: 0, contours: [contour] }), `${here} body`);
            }
          });
          for (const ci of binding.contours) {
            const ownDot = box([a.contours[ci]]), dot = box([b.contours[ci]]), h = ownDot.y1 - ownDot.y0, f = fill(b.contours[ci], policy.slant);
            if (shape === 'round') assert.ok(Math.abs(f - Math.PI / 4) < .01, `${here} round ${f}`);
            else assert.ok(f > (policy.corner ? .85 : .99), `${here} square ${f}`);
            // as much ink, about where the dot was
            assert.ok(Math.abs((dot.y0 + dot.y1) / 2 - (ownDot.y0 + ownDot.y1) / 2) < h * .25, `${here} height`);
            if (policy.baseline.includes(`${binding.glyph}:${binding.id}`)) {
              if (shape === 'square') assert.ok(Math.abs(dot.y0) < .01, `${here} foot on the baseline ${dot.y0}`);
              // as far as the style's own rounds dip: Bulwark's don't
              else assert.ok(dot.y0 <= (policy.overshoot ? 0 : 1e-9) && dot.y0 > -(dot.y1 - dot.y0) * .2, `${here} foot dips ${dot.y0}`);
            }
          }
        }
        // the i's tittle stays clear above its stem
        const i = shaped.glyph('i')!.drawn!, tittle = bindings.find(binding => binding.glyph === 'i')!.contours;
        const stem = box(i.contours.filter((_, ci) => !tittle.includes(ci))), dot = box(tittle.map(ci => i.contours[ci]));
        assert.ok(dot.y0 > stem.y1, `${what} i`);
      }
    }
  });

  it('keeps the point count, turn and ink of a dot, and stands a baseline dot on its foot', () => {
    const circle: Node[] = [[100, 50], [50, 100], [0, 50], [50, 0]].map(([x, y], i) => {
      const k = 50 * 0.5523, dirs = [[0, 1], [-1, 0], [0, -1], [1, 0]][i];
      return { x, y: y - 8, ix: x - dirs[0] * k, iy: y - 8 - dirs[1] * k, ox: x + dirs[0] * k, oy: y - 8 + dirs[1] * k };
    });
    const square = dotShapeContour(circle, 'square', { corner: 0, overshoot: .04, slant: 0 }, true), b = box([square]);
    assert.equal(square.length, 4);
    assert.ok(Math.abs(b.y0) < 1e-9, 'a square stands on the baseline');
    assert.ok(Math.abs(fill(square, 0) * (b.x1 - b.x0) * (b.y1 - b.y0) / (fill(circle, 0) * 100 * 100) - 1) < .002, 'as much ink as the round dot');
    const back = dotShapeContour(square, 'round', { corner: 0, overshoot: .04, slant: 0 }, true), r = box([back]);
    assert.ok(Math.abs(r.y0 + .04 * (r.y1 - r.y0)) < 1e-6, 'a round one dips below it');
    const turn = (c: Node[]) => Math.sign(c.reduce((s, n, i) => s + n.x * c[(i + 1) % c.length].y - c[(i + 1) % c.length].x * n.y, 0));
    assert.equal(turn(square), turn(circle)); assert.equal(turn(dotShapeContour([...circle].reverse(), 'square', { corner: 0, overshoot: 0, slant: 0 })), -turn(circle));
    // a dot of eight points takes rounded corners where a style's are soft, between a round's ink and a square's
    const period = buildFont(params(of('Mainline:600').ref)).glyph('.')!.drawn!.contours[0], soft = dotShapeContour(period, 'square', { corner: .5, overshoot: 0, slant: 0 });
    assert.equal(period.length, 8); assert.equal(soft.length, 8);
    assert.ok(fill(soft, 0) > Math.PI / 4 + .05 && fill(soft, 0) < .97);
  });

  it('shapes the dots of a diaeresis and a dot above with the letters\', and no other mark', () => {
    const p = params(of('Mainline:600').ref);
    assert.ok(loadSourceMarks(p));
    const own = buildFont(p), square = buildFont({ ...p, dots: 'square' });
    for (const [ch, dots] of [['ü', 2], ['Ä', 2], ['ė', 1], ['Ż', 1]] as const) {
      const shaped = square.accent(ch)!.drawn!;
      assert.notDeepEqual(points(shaped), points(own.accent(ch)!.drawn!), ch);
      for (const contour of shaped.contours.slice(-dots)) assert.ok(fill(contour, 0) > .99, `${ch} ${fill(contour, 0)}`);
    }
    for (const ch of 'áçñ') assert.deepEqual(points(square.accent(ch)!.drawn!), points(own.accent(ch)!.drawn!), ch);
  });

  it('carries a letter\'s Points edits through a change of dots and back', () => {
    const p = params(of('Mainline:600').ref), i = buildFont(p).glyph('i')!.drawn!, tittle = tittleOf(p);
    const moved: Drawn = { ...i, at: drawnAtOf(p, 'i'), contours: i.contours.map((c, ci) => c.map((n, ni) => ci === tittle || ni === 0
      ? { ...n, x: n.x + 20, ...(n.ix === undefined ? {} : { ix: n.ix + 20 }), ...(n.ox === undefined ? {} : { ox: n.ox + 20 }) } : n)) };
    const edited: Params = { ...p, outlines: { i: moved } };
    assert.deepEqual(points(buildFont(edited).glyph('i')!.drawn!), points(moved), 'drawn as edited');
    const square = buildFont({ ...edited, dots: 'square' }).glyph('i')!.drawn!, plain = buildFont({ ...p, dots: 'square' }).glyph('i')!.drawn!;
    const dot = box([square.contours[tittle]]), plainDot = box([plain.contours[tittle]]);
    assert.ok(Math.abs(dot.x0 - plainDot.x0 - 20) < .5 && Math.abs(dot.y0 - plainDot.y0) < .5, 'the moved dot is square where it was moved');
    assert.ok(fill(square.contours[tittle], 0) > .99);
    assert.deepEqual(square.contours.filter((_, ci) => ci !== tittle).map(c => c.map(n => [n.x, n.y])),
      moved.contours.filter((_, ci) => ci !== tittle).map(c => c.map(n => [n.x, n.y])), 'the stem as edited');
    // drawn square, then Original again: the drawing as it was
    const drawnSquare: Params = { ...p, dots: 'square', outlines: { i: { ...square, at: drawnAtOf({ ...p, dots: 'square' }, 'i') } } };
    const back = buildFont({ ...drawnSquare, dots: 'auto' }).glyph('i')!.drawn!;
    back.contours.forEach((c, ci) => c.forEach((n, ni) => assert.ok(Math.hypot(n.x - moved.contours[ci][ni].x, n.y - moved.contours[ci][ni].y) < 1e-6, `${ci}:${ni}`)));
  });

  it('sizes a shaped dot, offers only the shapes a program records, and starts older designs at their own dots', () => {
    const mainline = params(of('Mainline:600').ref), hearth = params(of('Hearth:600').ref);
    const tittle = tittleOf(mainline), square = buildFont({ ...mainline, dots: 'square' }).glyph('i')!.drawn!.contours[tittle];
    const big = buildFont({ ...mainline, dots: 'square', glyphs: { i: { dotSize: 1 } } }).glyph('i')!.drawn!.contours[tittle];
    assert.ok(box([big]).x1 - box([big]).x0 > (box([square]).x1 - box([square]).x0) * 1.2 && fill(big, 0) > .99, 'Size grows the square dot');
    assert.ok(sourceSupports(mainline, 'dots') && sourceSupports(mainline, 'dots', 'i') && sourceSupports(mainline, 'dots', '?'));
    assert.equal(sourceSupports(mainline, 'dots', 'a'), false);
    assert.ok(sourceAllows(mainline, 'dots', 'square') && sourceAllows(mainline, 'dots', 'auto'));
    assert.equal(sourceAllows(mainline, 'dots', 'round'), false);
    assert.ok(sourceAllows(hearth, 'dots', 'round')); assert.equal(sourceAllows(hearth, 'dots', 'square'), false);
    assert.ok(pagesFor(mainline).some(page => page.id === 'letters'));
    assert.equal(pagesFor(mainline, 'a').some(page => page.id === 'letters'), false);
    // an unoffered value draws the style's own dots
    assert.deepEqual(buildFont({ ...mainline, dots: 'round' }).glyph('i')!.cmds, buildFont(mainline).glyph('i')!.cmds);
    // a design on the program before dots: a Dots value it kept drew nothing, and adopting starts it at Original
    const older: Params = { ...params(before('Mainline:600').ref), dots: 'square', glyphs: { j: { dots: 'round' } } };
    assert.equal(sourceSupports(older, 'dots'), false);
    assert.equal(programUpgrade(older.sourceProgram)?.program.ref.digest, of('Mainline:600').ref.digest);
    const adopted = adoptProgram(older)!;
    assert.equal(adopted.dots, 'auto'); assert.equal(adopted.freeAt.dots, 'auto'); assert.equal(adopted.glyphs.j?.dots, undefined);
    loadDesignSources(adopted);
    assert.deepEqual(buildFont(adopted).glyph('i')!.cmds, buildFont(older).glyph('i')!.cmds);
  });
});

