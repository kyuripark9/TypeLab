/* Compass's and Kernel's repaired weights: the styles' own letters exactly as before, the other weights without the
   corners and tilts the earlier point matching drew into them, and designs on the earlier programs offered the
   repair with their letter forms carried across. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_CHARS, buildFont } from '../shared/engine';
import { segment, type Node } from '../shared/engine/outline';
import { STYLES } from '../shared/content/styles';
import type { Params } from '../shared/params';
import { adoptProgram, programUpgrade } from '../shared/source/adoption';
import { PROGRAM_REVISIONS, programForFont } from '../shared/source/program-catalog';
import { sourceMasters } from '../shared/source/registry';
import { sourceStyleParams } from '../shared/source/style';
import { loadDesignSources, loadSourceMarks } from '../server/sources';

type P = { x: number; y: number };
const unit = (a: P, b: P) => { const l = Math.hypot(b.x - a.x, b.y - a.y); return l < 1e-6 ? null : { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
const degrees = (a: P | null, b: P | null) => a && b ? Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) * 180 / Math.PI : 0;
/** The directions a contour arrives at and leaves point `i`. */
function turn(c: Node[], i: number) {
  const n = c[i], p = c[(i - 1 + c.length) % c.length], q = c[(i + 1) % c.length], into = segment(p, n), out = segment(n, q);
  return degrees(into ? unit(into[2], n) ?? unit(into[1], n) ?? unit(p, n) : unit(p, n), out ? unit(n, out[1]) ?? unit(n, out[2]) ?? unit(n, q) : unit(n, q));
}
/** Whether the edge from `a` to `b` is straight: no handles, or handles on its chord (the basis keeps straight edges as
    cubics where its widths cut them). */
function straight(a: Node, b: Node): boolean {
  const c = segment(a, b), d = unit(a, b);
  return !c || !!d && [c[1], c[2]].every(p => Math.abs((p.x - a.x) * d.y - (p.y - a.y) * d.x) < 1e-6);
}
/** Smooth points at the style's own weight that turn a corner at another, and level or upright straight edges that tilt. */
function faults(neutral: Record<string, { contours: Node[][] }>, other: Record<string, { contours: Node[][] }>): string[] {
  const found: string[] = [];
  for (const [ch, g] of Object.entries(neutral)) g.contours.forEach((c, ci) => c.forEach((n, ni) => {
    const h = other[ch].contours[ci];
    if (turn(c, ni) < 3 && turn(h, ni) > 8) found.push(`${ch} corner at ${ci}:${ni}`);
    const q = c[(ni + 1) % c.length], d0 = straight(n, q) ? unit(n, q) : null, d1 = unit(h[ni], h[(ni + 1) % h.length]);
    if (d0 && (Math.abs(d0.x) < 1e-3 || Math.abs(d0.y) < 1e-3) && degrees(d0, d1) > 1.5) found.push(`${ch} tilt at ${ci}:${ni}`);
  }));
  return found;
}

for (const id of ['geometric', 'code']) {
  const current = sourceStyleParams(STYLES.find(style => style.id === id)!)!, fontId = current.sourceProgram!.fontId;
  const programs = PROGRAM_REVISIONS.filter(entry => entry.ref.fontId === fontId);
  const repaired = programs.at(-1)!, repair = repaired.data.transitions!.find(t => t.mapping.digest && t.from.digest !== repaired.data.base.digest)!;
  // the newest program on the basis the repair started from: what a design saved before it draws with
  const before = programs.findLast(entry => entry.data.base.digest === repair.from.digest)!;
  const earlier: Params = { ...current, sourceProgram: before.ref };
  for (const p of [current, earlier]) { loadDesignSources(p); loadSourceMarks(p); }

  describe(`${fontId} repaired weights`, () => {
    it('starts new designs on the repaired program', () => {
      assert.equal(current.sourceProgram!.digest, programForFont(fontId)!.digest);
      assert.equal(current.sourceProgram!.digest, repaired.ref.digest);
    });

    it('draws every letter at the style\'s own weight exactly as before, at every width', () => {
      for (const width of [current.width, 0, 1]) {
        const a = buildFont({ ...earlier, width }), b = buildFont({ ...current, width });
        for (const ch of ALL_CHARS) assert.deepEqual(b.glyph(ch)?.cmds, a.glyph(ch)?.cmds, `${id} ${ch} at width ${width}`);
      }
    });

    it('keeps smooth points smooth and level or upright edges so at its other weights', () => {
      const fixed = sourceMasters(repaired.data.base)!, old = sourceMasters(before.data.base)!;
      const neutral = (m: typeof fixed) => m.masters.find(x => x.weight === m.defaultWeight)!.font.glyphs;
      for (const knot of fixed.masters.filter(m => m.weight !== fixed.defaultWeight)) {
        assert.deepEqual(faults(neutral(fixed), knot.font.glyphs), [], `${fontId} at ${knot.weight}`);
      }
      // the faults it repairs were there
      const was = old.masters.filter(knot => knot.weight !== old.defaultWeight).map(knot => faults(neutral(old), knot.font.glyphs).length);
      assert.ok(was.every(count => count > 40), `${fontId} faults before the repair: ${was.join(', ')}`);
    });

    it('offers the repair to designs on every earlier program, carrying their letter forms', () => {
      for (const entry of programs.slice(0, -1)) assert.equal(programUpgrade(entry.ref)?.program.ref.digest, repaired.ref.digest, entry.ref.digest);
      const form = before.data.forms![0], key = `${form.ref.digest}:${form.glyph}`;
      const adopted = adoptProgram({ ...earlier, sourceForms: { [form.glyph]: form.ref }, sourceFormEdits: { [key]: { adv: 1, contours: [] } } })!;
      const republished = repaired.data.forms!.find(f => f.glyph === form.glyph && f.id === form.id)!;
      assert.equal(adopted.sourceProgram!.digest, repaired.ref.digest);
      assert.deepEqual(adopted.sourceForms[form.glyph], republished.ref);
      assert.deepEqual(Object.keys(adopted.sourceFormEdits), [`${republished.ref.digest}:${form.glyph}`]);
    });
  });
}
