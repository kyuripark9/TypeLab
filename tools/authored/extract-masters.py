"""Read authored weight instances from pinned font files without rounding their original coordinates.

Requires fontTools. Input inventory records the downloaded files and SHA-256 digests.
python3 tools/authored/extract-masters.py --inventory inventory.json --style Mainline --out masters.json
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

class Cubics(BasePen):
    def __init__(self, glyph_set, scale):
        super().__init__(glyph_set)
        self.scale = scale
        self.contours = []
        self.current = []

    def point(self, point):
        return [float(point[0]) * self.scale, float(point[1]) * self.scale]

    def _moveTo(self, point):
        self.current = [self.point(point)]

    def _lineTo(self, point):
        self.current.append(self.point(point))

    def _curveToOne(self, first, second, end):
        previous = self.current[-1]
        previous += [None] * (4 - len(previous))
        previous[4:6] = self.point(first)
        self.current.append(self.point(end) + self.point(second))

    def _qCurveToOne(self, control, end):
        qx, qy = self.point(control)
        x, y = self.point(end)
        previous = self.current[-1]
        ox = previous[0] + (qx - previous[0]) * 2 / 3
        oy = previous[1] + (qy - previous[1]) * 2 / 3
        previous += [None] * (4 - len(previous))
        previous[4:6] = [ox, oy]
        self.current.append([x, y, x + (qx - x) * 2 / 3, y + (qy - y) * 2 / 3])

    def _closePath(self):
        contour = self.current
        if len(contour) > 1 and contour[0][:2] == contour[-1][:2]:
            if len(contour[-1]) > 2:
                contour[0] += [None] * (4 - len(contour[0]))
                contour[0][2:4] = contour[-1][2:4]
            contour.pop()
        if contour:
            self.contours.append(contour)
        self.current = []

    def _endPath(self):
        self._closePath()


def extract(inventory_path, style, destination, weights=None, upstream_dir=None):
    inventory = json.loads(Path(inventory_path).read_text())
    family = next(item for item in inventory['families'] if style in item['styles'])
    upstream_dir = Path(upstream_dir or os.environ.get('TYPELAB_MASTER_UPSTREAM', '.tools/master-upstream'))
    family = {**family, 'files': [{**record, 'file': str(Path(record['file']) if Path(record['file']).exists() else upstream_dir / record['file'])} for record in family['files']]}
    source_path = next(Path('fonts').glob(style + '-*.json'))
    source = json.loads(source_path.read_text())
    default_weight = int(source['id'].split(':')[1].rstrip('i'))
    italic = source['id'].endswith('i')
    records = [record for record in family['files'] if record['file'].endswith('.ttf') and record['italic'] == italic]
    if not records:
        raise ValueError(f'{style}: no matching upstream font')
    for record in records:
        if hashlib.sha256(Path(record['file']).read_bytes()).hexdigest() != record['sha256']:
            raise ValueError(f"Changed upstream file: {record['file']}")
    fonts = {record['file']: TTFont(record['file']) for record in records}
    variable = next((record for record in records if any(axis['tag'] == 'wght' for axis in record['axes'])), None)
    if variable:
        axis = next(axis for axis in variable['axes'] if axis['tag'] == 'wght')
        selected = weights or sorted({default_weight, int(axis['min']), int(axis['max']), *range(100, 1001, 100)})
        selected = [weight for weight in selected if axis['min'] <= weight <= axis['max']]
        instances = [(weight, variable) for weight in selected]
    else:
        selected = weights or sorted(record['declaredWeight'] for record in records)
        instances = [(weight, next(record for record in records if record['declaredWeight'] == weight)) for weight in selected]
    if default_weight not in [weight for weight, _ in instances]:
        raise ValueError(f'{style}: upstream has no source weight {default_weight}')
    masters = []
    cap = xh = None
    for weight, record in instances:
        font = fonts[record['file']]
        cmap = font.getBestCmap()
        scale = 1000 / font['head'].unitsPerEm
        glyph_set = font.getGlyphSet(location={'wght': weight} if variable else None)
        glyphs = {}
        for character in dict.fromkeys([*source['glyphs'], *'†‡−÷']):
            if ord(character) not in cmap:
                continue
            glyph = glyph_set[cmap[ord(character)]]
            pen = Cubics(glyph_set, scale)
            glyph.draw(pen)
            glyphs[character] = [float(glyph.width) * scale, pen.contours]
        if weight == default_weight:
            def height(field, character):
                stated = getattr(font['OS/2'], field, 0)
                if stated > 0:
                    return stated * scale
                pen = BoundsPen(glyph_set)
                glyph_set[cmap[ord(character)]].draw(pen)
                return pen.bounds[3] * scale
            cap = height('sCapHeight', 'H')
            xh = height('sxHeight', 'x')
        masters.append({'weight': weight, 'space': float(glyph_set[cmap[32]].width) * scale, 'glyphs': glyphs})
    output = {'family': family['family'], 'style': style, 'defaultWeight': default_weight, 'cap': cap, 'xh': xh,
              'masters': masters, 'revision': inventory['revision'], 'files': family['files']}
    Path(destination).parent.mkdir(parents=True, exist_ok=True)
    Path(destination).write_text(json.dumps(output, separators=(',', ':')) + '\n')
    for font in fonts.values():
        font.close()
    return {'style': style, 'weights': [master['weight'] for master in masters], 'glyphs': [len(master['glyphs']) for master in masters]}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', required=True)
    parser.add_argument('--style', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--weights', help='Comma-separated authored weights; otherwise all available hundreds')
    parser.add_argument('--upstream-dir', help='Downloaded upstream files; defaults to TYPELAB_MASTER_UPSTREAM or .tools/master-upstream')
    args = parser.parse_args()
    print(json.dumps(extract(args.inventory, args.style, args.out, [int(value) for value in args.weights.split(',')] if args.weights else None, args.upstream_dir)))
