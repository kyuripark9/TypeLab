/* Original attribution, reserved names and complete notices travel with master-based exports. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { DEFAULTS, freeAtOf, type Params } from '../shared/params';
import { masterInfo, mastersForFont } from '../shared/source/master-catalog';
import { sourceMasters } from '../shared/source/registry';
import { loadSource } from '../server/sources';
import { buildOTF, buildPiece, exportName } from '../server/export';
import { opentype } from '../server/opentype';

function family(fontId: string) {
  const ref = mastersForFont(fontId), info = masterInfo(ref);
  assert.ok(ref && info);
  const source = loadSource(ref), program = sourceMasters(ref);
  assert.ok(program);
  const weight = (info.defaultWeight - info.min) / (info.max - info.min);
  const params: Params = { ...DEFAULTS, freeFont: fontId, sourceProgram: ref, weight, freeAt: { ...freeAtOf(DEFAULTS), weight } };
  return { params, source, program };
}

describe('master export credits', () => {
  it('strips original family names and explicit reserved names from renamed TypeLab styles', () => {
    for (const [fontId, requested, expected] of [
      ['Ballyhoo:400', 'ABRIL Fatface Custom', 'Custom'],
      ['Ballyhoo:400', 'Abril Custom', 'Custom'],
      ['Timber:400', 'Alfa Slab Custom', 'Custom'],
      ['Kernel:500', 'Plex Custom', 'Custom'],
      ['Almanac:500', 'Libre Baskerville Custom', 'Custom'],
      ['Couture:600', 'PlayfairDisplay Custom', 'Custom'],
      ['Cathedral:400', 'UnifrakturMaguntia Custom', 'Custom'],
      ['Mainline:600', 'Roboto Custom', 'Custom'],
      ['Ballyhoo:400', 'Ballyhoo Remix', 'Ballyhoo Remix'],
      ['Bulwark:700', 'Bulwark Remix', 'Bulwark Remix'],
    ]) assert.equal(exportName(family(fontId).params, requested), expected, fontId);
    assert.equal(exportName(family('Ballyhoo:400').params, 'Abril Fatface'), 'TypeLab Font');
  });

  it('embeds original attribution, complete license text and pinned provenance in the OTF', () => {
    const { params, source, program } = family('Ballyhoo:400');
    assert.deepEqual(source.designers, ['TypeTogether', 'TypeLab']);
    const bytes = buildOTF(params, 'Abril Fatface Credits audit');
    const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const names = JSON.stringify(font.names);
    assert.match(names, /"preferredFamily":\{"en":"Credits audit"\}/);
    assert.ok(names.includes('Based on Abril Fatface by TypeTogether, TypeLab'));
    assert.ok(source.licenseText && names.includes(JSON.stringify(source.licenseText).slice(1, -1)));
    assert.ok(names.includes(JSON.stringify(source.copyright).slice(1, -1)));
    for (const origin of program.provenance) {
      assert.ok(names.includes(origin.url));
      assert.ok(names.includes(origin.revision));
      assert.ok(names.includes(origin.sha256));
    }
  });

  it('carries full Apache and OFL notices and source provenance in a family ZIP license', () => {
    const { params, source, program } = family('Hearth:600');
    const piece = buildPiece({ job: { kind: 'family', name: 'Credits audit', params,
      family: { anchor: 'semibold', styles: [{ weight: 'semibold', italic: false }] } }, part: 1 });
    assert.ok('files' in piece);
    assert.equal(piece.files.length, 1);
    assert.match(piece.files[0].name, /LICENSE\.txt$/);
    const text = inflateRawSync(piece.files[0].packed).toString('utf8');
    assert.match(text, /based on Roboto Slab by/);
    assert.ok(source.licenseText && text.includes(source.licenseText));
    assert.match(text, /Apache License/);
    assert.match(text, /OPEN FONT LICENSE/);
    for (const origin of program.provenance) assert.ok(text.includes(origin.sha256));
  });

  it('includes the locally authored Bulwark license without invented upstream attribution', () => {
    const { params, source, program } = family('Bulwark:700');
    assert.equal(program.provenance.length, 0);
    const bytes = buildOTF(params, 'Bulwark credits audit');
    const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const names = JSON.stringify(font.names);
    assert.ok(names.includes('Copyright 2026 TypeLab.'));
    assert.ok(names.includes('Based on Bulwark by TypeLab'));
    assert.ok(source.licenseText && names.includes(JSON.stringify(source.licenseText).slice(1, -1)));
    assert.ok(!names.includes('Upstream sources:'));
  });
});
