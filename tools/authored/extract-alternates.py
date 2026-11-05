"""Extract direct upstream letter alternatives for later style-owned form authoring.

python3 tools/authored/extract-alternates.py --upstream .audit/masters/sources/upstream-all --out .audit/forms/native.json
Contextual substitutions are reported separately; they are not treated as standalone forms.
"""
import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('master_extraction', Path(__file__).with_name('extract-masters.py'))
extraction = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extraction)


def program_targets(programs):
    if not programs:
        return []
    current = {item['ref']['fontId']: item for item in json.loads(Path(programs).read_text())}
    targets = []
    for font_id, item in current.items():
        data = item['data']
        base = json.loads(Path('fonts/masters', data['base']['digest'] + '.json').read_text())
        neutral = next(master['data'] for master in base['masters'] if master['weight'] == base['defaultWeight'])
        width = json.loads(Path('fonts/widths', data['width']['digest'] + '.json').read_text()) if data['width'] else None
        targets.append({'style': neutral['family'], 'fontId': font_id, 'base': data['base'], 'width': data['width'],
                        'weights': [master['weight'] for master in base['masters']],
                        'widths': sorted([width['axis']['neutral'], *[column['width'] for column in width['columns']]]) if width else [100],
                        'defaultWeight': base['defaultWeight'], 'cap': neutral['cap'], 'xh': neutral['xh'], 'space': neutral['space'],
                        'italic': font_id.endswith('i')})
    return targets


def feature_label(font, feature):
    params = feature.Feature.FeatureParams
    if params:
        for field in ['UINameID', 'FeatUILabelNameID']:
            value = getattr(params, field, None)
            if value:
                return font['name'].getDebugName(value)
    return None


def prepare_forms(result, recipes, aligned=()):
    spec = importlib.util.spec_from_file_location('mark_authoring', Path(__file__).with_name('extract-marks.py'))
    authoring = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(authoring)
    forms = []
    for recipe in recipes:
        target = next(target for target in result['targets'] if target['style'] == recipe['style'])
        sources = [source for source in result['sources'] if recipe['style'] in source['styles'] and source['italic'] == target['italic']]
        cells, used, names = [], [], set()
        for source in sources:
            variants = [variant for variant in source['variants'] if variant['character'] == recipe['glyph'] and variant['feature'] == recipe['feature']]
            names.update(variant['alternate'] for variant in variants)
            if len(variants) != 1:
                raise ValueError(f"{recipe}: expected one pinned native alternative in {source['file']}")
            variant = variants[0]
            used.append({'family': source['family'], 'url': source['url'], 'revision': result['revision'], 'sha256': source['sha256']})
            for drawing in source['drawings']:
                cells.append({key: drawing[key] for key in ['weight', 'width', 'cap', 'xh', 'space']} | {
                    'original': drawing['glyphs'][variant['original']], 'drawing': drawing['glyphs'][variant['alternate']]})
        if not cells:
            raise ValueError(f'{recipe}: no native drawings')
        cells.sort(key=lambda cell: (cell['width'], cell['weight']))
        coordinates = [(cell['weight'], cell['width']) for cell in cells]
        if len(set(coordinates)) != len(coordinates):
            raise ValueError(f'{recipe}: ambiguous native coordinates')
        before = [[len(contour) for contour in cell['drawing']['contours']] for cell in cells]
        authoring.ALIGNED = recipe['style'] in aligned
        contours = authoring.compatible([cell['drawing']['contours'] for cell in cells])
        for cell, compatible in zip(cells, contours):
            cell['drawing']['contours'] = compatible
        forms.append({'recipe': recipe, 'target': target, 'nativeNames': sorted(names), 'cells': cells, 'provenance': used,
                      'compatibility': {'originalNodes': before, 'commonNodes': [len(c) for c in contours[0]],
                                        'method': 'cyclic-alignment-or-exact-common-arclength-subdivision'}})
    return forms


def extract(upstream, inventory, output, programs=None, recipes=None, aligned=()):
    pinned = json.loads(Path(inventory).read_text())
    families = pinned['families']
    targets = program_targets(programs)
    result = {'format': 'upstream-alternates-v2', 'glyphs': 'agIlQR', 'revision': pinned['revision'], 'targets': targets, 'sources': []}
    for family in families:
        for record in family['files']:
            if not record['file'].endswith('.ttf'):
                continue
            path = Path(upstream) / record['file']
            if hashlib.sha256(path.read_bytes()).hexdigest() != record['sha256']:
                raise ValueError(f'Changed upstream font: {path}')
            with TTFont(path) as font:
                if 'GSUB' not in font:
                    continue
                cmap = font.getBestCmap()
                characters = {cmap[ord(ch)]: ch for ch in result['glyphs'] if ord(ch) in cmap}
                table = font['GSUB'].table
                variants, contextual = [], set()
                for feature in table.FeatureList.FeatureRecord:
                    for index in feature.Feature.LookupListIndex:
                        lookup = table.LookupList.Lookup[index]
                        for subtable in lookup.SubTable:
                            kind = lookup.LookupType
                            if kind == 7:
                                kind, subtable = subtable.ExtensionLookupType, subtable.ExtSubTable
                            if kind not in (1, 3):
                                contextual.add(feature.FeatureTag)
                                continue
                            substitutions = subtable.mapping if kind == 1 else subtable.alternates
                            for name, ch in characters.items():
                                replaced = substitutions.get(name, [])
                                for alternate in [replaced] if isinstance(replaced, str) else replaced:
                                    item = {'character': ch, 'feature': feature.FeatureTag, 'original': name, 'alternate': alternate}
                                    label = feature_label(font, feature)
                                    if label:
                                        item['label'] = label
                                    if item not in variants:
                                        variants.append(item)
                if not variants:
                    continue
                axes = {axis.axisTag: axis for axis in font['fvar'].axes} if 'fvar' in font else {}
                requested = [target for target in targets if target['style'] in family['styles'] and target['italic'] == record['italic']]
                if programs and not requested:
                    continue
                desired_weights = sorted({weight for target in requested for weight in target['weights']})
                if 'wght' in axes:
                    axis = axes['wght']
                    weights = [weight for weight in desired_weights if axis.minValue <= weight <= axis.maxValue] if programs else sorted({axis.minValue, axis.defaultValue, axis.maxValue})
                else:
                    weight = record['declaredWeight']
                    available = sorted({file['declaredWeight'] for file in family['files'] if file['file'].endswith('.ttf') and file['italic'] == record['italic']})
                    needed = set()
                    for wanted in desired_weights:
                        below = [value for value in available if value <= wanted]
                        above = [value for value in available if value >= wanted]
                        if below:
                            needed.add(below[-1])
                        if above:
                            needed.add(above[0])
                    weights = [weight] if not programs or weight in needed else []
                desired_widths = sorted({width for target in requested for width in target['widths']})
                widths = [100]
                if 'wdth' in axes:
                    axis = axes['wdth']
                    widths = sorted({axis.defaultValue, *[width for width in desired_widths if axis.minValue <= width <= axis.maxValue]}) if programs else sorted({axis.minValue, axis.defaultValue, axis.maxValue})
                drawings = []
                for weight in weights:
                    for width in widths:
                        location = {tag: axis.defaultValue for tag, axis in axes.items()}
                        if 'wght' in axes:
                            location['wght'] = weight
                        if 'wdth' in axes:
                            location['wdth'] = width
                        glyphs = font.getGlyphSet(location=location if axes else None)
                        scale = 1000 / font['head'].unitsPerEm
                        shapes = {}
                        for name in sorted({name for item in variants for name in [item['original'], item['alternate']]}):
                            pen = extraction.Cubics(glyphs, scale)
                            glyphs[name].draw(pen)
                            shapes[name] = {'advance': glyphs[name].width * scale, 'contours': pen.contours}
                        def height(field, character):
                            stated = getattr(font['OS/2'], field, 0)
                            if stated > 0:
                                return stated * scale
                            pen = BoundsPen(glyphs)
                            glyphs[cmap[ord(character)]].draw(pen)
                            return pen.bounds[3] * scale
                        drawings.append({'weight': weight, 'width': width, 'cap': height('sCapHeight', 'H'), 'xh': height('sxHeight', 'x'),
                                         'space': glyphs[cmap[32]].width * scale, 'glyphs': shapes})
                if not drawings:
                    continue
                result['sources'].append({'family': family['family'], 'styles': family['styles'], 'file': record['file'],
                    'url': record['url'], 'sha256': record['sha256'], 'italic': record['italic'], 'variants': variants,
                    'axes': {tag: {'min': axis.minValue, 'default': axis.defaultValue, 'max': axis.maxValue} for tag, axis in axes.items()},
                    'contextualFeatures': sorted(contextual), 'drawings': drawings})
    if recipes:
        if not programs:
            raise ValueError('--recipes requires --programs')
        result['forms'] = prepare_forms(result, json.loads(Path(recipes).read_text()), aligned)
    destination = Path(output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(json.dumps({'sources': len(result['sources']), 'styles': sorted({style for source in result['sources'] for style in source['styles']}),
        'variants': sum(len(source['variants']) for source in result['sources'])}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--upstream', required=True)
    parser.add_argument('--inventory', default='tools/masters/upstream.json')
    parser.add_argument('--out', required=True)
    parser.add_argument('--programs', help='Published program manifest; extract every current weight knot and native width column')
    parser.add_argument('--recipes', help='Explicit selected forms; compile their native cells to one exact common curve chart')
    parser.add_argument('--aligned', default='', help='Comma-separated styles whose cells are charted from their corners and extremes')
    args = parser.parse_args()
    extract(args.upstream, args.inventory, args.out, args.programs, args.recipes, tuple(args.aligned.split(',')) if args.aligned else ())
