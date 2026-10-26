"""Extract pinned joint weight/width drawings for the offline width prototype.

Uses the existing package's exact weight knots and character coverage. This does not
publish assets or modify an existing master package. Requires fontTools 4.61.1.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy

from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

Cubics = runpy.run_path(str(Path(__file__).with_name('extract-masters.py')))['Cubics']


def extract(inventory_path, package_path, destination, widths, upstream_dir):
    inventory = json.loads(Path(inventory_path).read_text())
    package = json.loads(Path(package_path).read_text())
    source = package['masters'][0]['data']
    style = source['family']
    family = next(item for item in inventory['families'] if style in item['styles'])
    italic = source['id'].endswith('i')
    record = next(item for item in family['files'] if item['file'].endswith('.ttf')
                  and item['italic'] == italic and any(axis['tag'] == 'wdth' for axis in item['axes']))
    file = Path(record['file'])
    if not file.exists():
        file = Path(upstream_dir) / file
    if hashlib.sha256(file.read_bytes()).hexdigest() != record['sha256']:
        raise ValueError(f'Changed upstream file: {file}')
    axis = next(axis for axis in record['axes'] if axis['tag'] == 'wdth')
    selected = sorted(set(widths or [axis['min'], axis['default'], axis['max']]))
    if len(selected) < 3:
        selected = sorted(set([*selected, (axis['min'] + axis['max']) / 2]))
    if axis['default'] not in selected or any(width < axis['min'] or width > axis['max'] for width in selected):
        raise ValueError('Widths must include the upstream default and remain inside the axis range')
    weights = [master['weight'] for master in package['masters']]
    with TTFont(file) as font:
        cmap = font.getBestCmap()
        scale = 1000 / font['head'].unitsPerEm
        neutral = font.getGlyphSet(location={'wght': package['defaultWeight'], 'wdth': axis['default']})

        def height(field, character):
            stated = getattr(font['OS/2'], field, 0)
            if stated > 0:
                return stated * scale
            pen = BoundsPen(neutral)
            neutral[cmap[ord(character)]].draw(pen)
            return pen.bounds[3] * scale

        samples = []
        for weight in weights:
            for width in selected:
                glyph_set = font.getGlyphSet(location={'wght': weight, 'wdth': width})
                glyphs = {}
                for character in source['glyphs']:
                    if ord(character) not in cmap:
                        raise ValueError(f'Missing upstream character: {character!r}')
                    glyph = glyph_set[cmap[ord(character)]]
                    pen = Cubics(glyph_set, scale)
                    glyph.draw(pen)
                    glyphs[character] = [float(glyph.width) * scale, pen.contours]
                samples.append({'weight': weight, 'width': width,
                                'space': float(glyph_set[cmap[32]].width) * scale, 'glyphs': glyphs})
        output = {'format': 'upstream-width-grid-v1', 'family': family['family'], 'style': style,
                  'defaultWeight': package['defaultWeight'], 'cap': height('sCapHeight', 'H'),
                  'xh': height('sxHeight', 'x'),
                  'axis': {'min': selected[0], 'neutral': axis['default'], 'max': selected[-1]},
                  'samples': samples, 'revision': inventory['revision'],
                  'file': {key: record[key] for key in ['url', 'sha256']}}
    Path(destination).parent.mkdir(parents=True, exist_ok=True)
    Path(destination).write_text(json.dumps(output, separators=(',', ':')) + '\n')
    return {'style': style, 'weights': weights, 'widths': selected, 'glyphs': len(source['glyphs'])}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', help='Existing published weight master JSON')
    parser.add_argument('out')
    parser.add_argument('--inventory', default='tools/masters/upstream.json')
    parser.add_argument('--upstream-dir', default=os.environ.get('TYPELAB_MASTER_UPSTREAM', '.tools/master-upstream'))
    parser.add_argument('--widths', help='Optional comma-separated axis coordinates')
    args = parser.parse_args()
    widths = [float(value) for value in args.widths.split(',')] if args.widths else None
    print(json.dumps(extract(args.inventory, args.package, args.out, widths, args.upstream_dir)))
