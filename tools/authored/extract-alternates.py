"""Extract direct upstream letter alternatives for later style-owned form authoring.

python3 tools/authored/extract-alternates.py --upstream .audit/masters/sources/upstream-all --out .audit/forms/native.json
Contextual substitutions are reported separately; they are not treated as standalone forms.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

from fontTools.ttLib import TTFont

spec = importlib.util.spec_from_file_location('master_extraction', Path(__file__).with_name('extract-masters.py'))
extraction = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extraction)


def extract(upstream, inventory, output):
    families = json.loads(Path(inventory).read_text())['families']
    result = {'format': 'upstream-alternates-v1', 'glyphs': 'agIlQR', 'sources': []}
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
                                targets = substitutions.get(name, [])
                                for target in [targets] if isinstance(targets, str) else targets:
                                    item = {'character': ch, 'feature': feature.FeatureTag, 'original': name, 'alternate': target}
                                    if item not in variants:
                                        variants.append(item)
                if not variants:
                    continue
                axes = {axis.axisTag: axis for axis in font['fvar'].axes} if 'fvar' in font else {}
                weights = sorted({axes['wght'].minValue, axes['wght'].defaultValue, axes['wght'].maxValue}) if 'wght' in axes else [record['declaredWeight']]
                drawings = []
                for weight in weights:
                    glyphs = font.getGlyphSet(location={'wght': weight} if axes else None)
                    shapes = {}
                    for name in sorted({name for item in variants for name in [item['original'], item['alternate']]}):
                        pen = extraction.Cubics(glyphs, 1000 / font['head'].unitsPerEm)
                        glyphs[name].draw(pen)
                        shapes[name] = {'advance': glyphs[name].width * 1000 / font['head'].unitsPerEm, 'contours': pen.contours}
                    drawings.append({'weight': weight, 'glyphs': shapes})
                result['sources'].append({'family': family['family'], 'styles': family['styles'], 'file': record['file'],
                    'sha256': record['sha256'], 'italic': record['italic'], 'variants': variants,
                    'contextualFeatures': sorted(contextual), 'drawings': drawings})
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
    args = parser.parse_args()
    extract(args.upstream, args.inventory, args.out)
