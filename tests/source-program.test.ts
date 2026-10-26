/* Referenced program identity and the editable projection of letters with finished ink. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFont } from '../shared/engine';
import { metrics, resolve } from '../shared/engine/font';
import { drawnEffects } from '../shared/engine/glyph';
import { DEFAULTS } from '../shared/params';
import { parseSourceProgram, sourceProgramDependencies, type SourceProgramData } from '../shared/source/program';
import { traceOf } from '../client/lib/pen';

const base = { kind: 'masters-v1', digest: 'a'.repeat(64), fontId: 'Mainline:600' } as const;
const width = { kind: 'width-masters-v1', digest: 'b'.repeat(64), fontId: base.fontId } as const;
const features = { kind: 'feature-masters-v1', digest: 'c'.repeat(64), fontId: base.fontId } as const;
const definition: SourceProgramData = { format: 'source-program-v1', base, width, features };

describe('source program references', () => {
  it('keeps its master basis and returns only the explicitly referenced dependencies', () => {
    const program = parseSourceProgram(JSON.parse(JSON.stringify(definition)));
    assert.deepEqual(program, definition);
    assert.deepEqual(sourceProgramDependencies(program), [base, width, features]);
    const plain = parseSourceProgram({ ...definition, width: null, features: null });
    assert.deepEqual(sourceProgramDependencies(plain), [base]);
    assert.deepEqual(sourceProgramDependencies(parseSourceProgram({ ...definition, width: null })), [base, features]);
    assert.deepEqual(sourceProgramDependencies(parseSourceProgram({ ...definition, features: null })), [base, width]);
  });

  it('rejects recursive bases, wrong asset kinds, other families, and malformed digests', () => {
    for (const bad of [
      { ...definition, base: null },
      { ...definition, base: { ...base, kind: 'outline-v1' } },
      { ...definition, base: { ...base, kind: 'program-v1' } },
      { ...definition, width: features },
      { ...definition, features: width },
      { ...definition, width: { ...width, fontId: 'Mainline:700' } },
      { ...definition, features: { ...features, fontId: 'Hearth:600' } },
      { ...definition, width: { ...width, digest: 'not-a-digest' } },
      { ...definition, features: { ...features, digest: 'd'.repeat(63) } },
    ]) assert.throws(() => parseSourceProgram(bad), /program|reference|base/);
  });

  it('requires explicit optional assets and refuses unevaluated program fields', () => {
    for (const bad of [
      null, [], { ...definition, format: 'source-program-v2' },
      { format: definition.format, base },
      { ...definition, width: undefined }, { ...definition, features: undefined },
      { ...definition, finish: { kind: 'pixels' } },
      { ...definition, forms: [] }, { ...definition, marks: [] },
    ]) assert.throws(() => parseSourceProgram(bad), /program/);
  });
});

describe('editable drawings and finished ink', () => {
  it('keeps the source points editable after a real shadow changes its rendered ink and advance', () => {
    const drawing = { adv: 320, contours: [[{ x: 60, y: 0 }, { x: 260, y: 0 }, { x: 260, y: 700 }, { x: 60, y: 700 }]] };
    const glyph = buildFont({ ...DEFAULTS, outlines: { H: drawing } }).glyph('H');
    assert.ok(glyph);
    const editable = traceOf(glyph);
    assert.deepEqual(editable.contours, drawing.contours);
    const measures = metrics(resolve({ ...DEFAULTS, fill: 'shadow', module: .6 }));
    const finished = drawnEffects({ ...glyph, editable }, measures, { slice: false, fill: true, rough: false }, () => []);
    assert.equal(finished.fx, true);
    assert.ok(finished.cmds.length > 0);
    assert.notDeepEqual(finished.cmds, glyph.cmds);
    assert.ok(finished.adv > glyph.adv);
    assert.strictEqual(traceOf(finished), editable);
    assert.strictEqual(traceOf(finished), editable, 'the cached projection retains the exact source drawing');
    assert.deepEqual(editable, drawing, 'finishing did not modify the editable geometry');
  });

  it('preserves the historical Points behavior when an evaluator supplies no editable projection', () => {
    const drawing = { adv: 320, contours: [[{ x: 60, y: 0 }, { x: 260, y: 0 }, { x: 260, y: 700 }, { x: 60, y: 700 }]] };
    const glyph = buildFont({ ...DEFAULTS, outlines: { H: drawing } }).glyph('H');
    assert.ok(glyph);
    const measures = metrics(resolve({ ...DEFAULTS, fill: 'shadow', module: .6 }));
    const finished = drawnEffects(glyph, measures, { slice: false, fill: true, rough: false }, () => []);
    const traced = traceOf(finished);
    assert.equal(traced.adv, Math.round(finished.adv));
    assert.notDeepEqual(traced.contours, drawing.contours);
    assert.deepEqual(traceOf(glyph).contours, drawing.contours);
  });
});
