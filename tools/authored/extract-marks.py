"""Compile source-owned accent drawings from pinned fonts and explicit local recipes.

This is offline authoring. Runtime receives only compatible curves and declared ports.
Use --input tools/authored/mark-bases.json --upstream-dir <download-cache> --out <directory>.
The TypeScript publisher validates the result before immutable publication.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import math
import os
import sys
from pathlib import Path

from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('master_extraction', Path(__file__).with_name('extract-masters.py'))
EXTRACT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXTRACT)


def read_asset(directory, ref):
    content = (ROOT / 'fonts' / directory / (ref['digest'] + '.json')).read_bytes()
    if hashlib.sha256(content).hexdigest() != ref['digest']:
        raise ValueError('Changed immutable dependency: ' + ref['digest'])
    return json.loads(content)


def point(node, index):
    return node[index:index + 2] if len(node) >= index + 2 and node[index] is not None else node[:2]


def curve(contour, index):
    a, b = contour[index], contour[(index + 1) % len(contour)]
    if len(a) < 6 and (len(b) < 4 or b[2] is None):
        return [a[:2], mix(a, b, 1 / 3), mix(a, b, 2 / 3), b[:2]]
    return [a[:2], point(a, 4), point(b, 2), b[:2]]


def mix(a, b, t):
    return [a[i] + (b[i] - a[i]) * t for i in range(2)]


def at(c, t):
    a, b, d = mix(c[0], c[1], t), mix(c[1], c[2], t), mix(c[2], c[3], t)
    return mix(mix(a, b, t), mix(b, d, t), t)


def split(c, t):
    a, b, d = mix(c[0], c[1], t), mix(c[1], c[2], t), mix(c[2], c[3], t)
    e, f = mix(a, b, t), mix(b, d, t)
    p = mix(e, f, t)
    return [c[0], a, e, p], [p, f, d, c[3]]


def subcurve(c, low, high):
    left = split(c, high)[0] if high < 1 else c
    return split(left, low / high)[1] if low > 0 else left


def pack(curves):
    return [[c[0][0], c[0][1], curves[i - 1][2][0], curves[i - 1][2][1], c[1][0], c[1][1]]
            for i, c in enumerate(curves)]


def transform(contours, sx=1, sy=1, dx=0, dy=0):
    return [[[(v * (sx if i % 2 == 0 else sy) + (dx if i % 2 == 0 else dy)) if v is not None else None
              for i, v in enumerate(n)] for n in c] for c in contours]


def matrix(contours, m, scale=1):
    a, b, c, d, x, y = m
    result = copy.deepcopy(contours)
    for contour in result:
        for node in contour:
            for i in range(0, len(node), 2):
                if node[i] is not None:
                    px, py = node[i:i + 2]
                    node[i:i + 2] = [(a * px + c * py + x) * scale, (b * px + d * py + y) * scale]
    return result


def bounds(contours):
    points = []
    for contour in contours:
        for i in range(len(contour)):
            c = curve(contour, i)
            ts = [0, 1]
            for axis in range(2):
                p, q, r, s = [p[axis] for p in c]
                A, B, C = -p + 3 * q - 3 * r + s, 2 * (p - 2 * q + r), q - p
                if abs(A) < 1e-12:
                    if abs(B) > 1e-12:
                        ts.append(-C / B)
                elif B * B - 4 * A * C >= 0:
                    root = math.sqrt(B * B - 4 * A * C)
                    ts.extend([(-B - root) / (2 * A), (-B + root) / (2 * A)])
            points.extend(at(c, t) for t in ts if 0 <= t <= 1)
    if not points:
        raise ValueError('Empty mark or base drawing')
    return [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]


def area(contour):
    ps = [at(curve(contour, i), j / 8) for i in range(len(contour)) for j in range(8)]
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ps, ps[1:] + ps[:1])) / 2


def reverse(contour):
    cs = [list(reversed(curve(contour, i))) for i in reversed(range(len(contour)))]
    return pack(cs)


def nearest_port(contours, target):
    best = None
    for ci, contour in enumerate(contours):
        for si in range(len(contour)):
            c = curve(contour, si)
            j = min(range(33), key=lambda k: math.dist(at(c, k / 32), target))
            low, high = max(0, (j - 1) / 32), min(1, (j + 1) / 32)
            for _ in range(28):
                a, b = (2 * low + high) / 3, (low + 2 * high) / 3
                if math.dist(at(c, a), target) < math.dist(at(c, b), target):
                    high = b
                else:
                    low = a
            t = (low + high) / 2
            distance = math.dist(at(c, t), target)
            if best is None or distance < best[0]:
                best = (distance, {'contour': ci, 'segment': si, 't': t, 'weight': 1})
    return best[1]


def port_point(contours, port):
    return at(curve(contours[port['contour']], port['segment']), port['t'])


def canonical_start(contour):
    # The leftmost original anchor fixes the contour seam. Reversal is handled separately.
    index = min(range(len(contour)), key=lambda i: (contour[i][0], contour[i][1]))
    return contour[index:] + contour[:index]


def path_table(contour):
    rows, lengths, total = [], [], 0
    for i in range(len(contour)):
        c = curve(contour, i)
        rows.append((total, i, 0))
        previous = c[0]
        for j in range(1, 49):
            p = at(c, j / 48)
            total += math.dist(previous, p)
            rows.append((total, i, j / 48))
            previous = p
        lengths.append(total)
    return [(distance / total, i, t) for distance, i, t in rows], [0] + [v / total for v in lengths]


# Styles whose cells are charted from their corners and extremes (set by --aligned): static upstream weights keep a
# design's corners and curve extremes but split the curves between them in places of their own, so equal point counts
# need not mean the same points, and plain arc-length shares land one weight's corner inside another's curve.
ALIGNED = False


def direction(c, end):
    """The unit direction a cubic leaves its start (or arrives at its end), skipping controls on the point."""
    p = list(reversed(c)) if end else c
    q = next((v for v in p[1:] if math.dist(v, p[0]) > 1e-9), p[-1])
    d = [q[0] - p[0][0], q[1] - p[0][1]]
    length = math.hypot(*d) or 1
    return [-d[0] / length, -d[1] / length] if end else [d[0] / length, d[1] / length]


def kinds(contour):
    """Each point's kind: a corner, an extreme running level or upright one way or the other, or free."""
    result = []
    for i in range(len(contour)):
        a, b = direction(curve(contour, i - 1), True), direction(curve(contour, i), False)
        if math.degrees(math.acos(max(-1, min(1, a[0] * b[0] + a[1] * b[1])))) > 12:
            result.append('corner')
            continue
        angle = math.degrees(math.atan2(a[1] + b[1], a[0] + b[0]))
        near = lambda deg: abs((angle - deg + 540) % 360 - 180) < 2.5
        result.append('level+' if near(0) else 'level-' if near(180) else 'upright+' if near(90) else 'upright-' if near(-90) else 'free')
    return result


def anchored(contours):
    """The contours started at the same corner or extreme, with their anchors in order, where every contour has the
    same run of corners and extremes; None otherwise."""
    marked = [kinds(c) for c in contours]
    runs = [[i for i, k in enumerate(ks) if k != 'free'] for ks in marked]
    if not runs[0] or any(len(r) != len(runs[0]) for r in runs):
        return None
    reference = [marked[0][i] for i in runs[0]]
    box0 = bounds([contours[0]])
    out = []
    for contour, ks, run in zip(contours, marked, runs):
        box = bounds([contour])
        place = lambda c, i, b: [(c[i][0] - b[0]) / max(1, b[2] - b[0]), (c[i][1] - b[1]) / max(1, b[3] - b[1])]
        best = None
        for shift in range(len(run)):
            order = run[shift:] + run[:shift]
            if [ks[i] for i in order] != reference:
                continue
            cost = sum(math.dist(place(contour, i, box), place(contours[0], j, box0)) for i, j in zip(order, runs[0]))
            if best is None or cost < best[0]:
                best = (cost, order)
        if best is None:
            return None
        start = best[1][0]
        out.append((contour[start:] + contour[:start], [(i - start) % len(contour) for i in best[1]]))
    return out


def compatible(drawings):
    """Exact curve subdivision gives every cell a common approximate-arclength chart.

    Arc lengths choose correspondence only; every output cubic is an exact subcurve.
    No polygon fitting or repeated resampling changes a stored endpoint drawing.
    """
    count = len(drawings[0])
    if any(len(cs) != count for cs in drawings):
        raise ValueError('Mark contour count changes across knots')
    ordered = []
    reference = sorted(drawings[0], key=lambda c: -abs(area(c)))
    reference_box = bounds(reference)
    reference_sign = area(reference[0]) >= 0
    def center(contour, box):
        b = bounds([contour])
        return [(b[0] + b[2] - 2 * box[0]) / max(1, 2 * (box[2] - box[0])),
                (b[1] + b[3] - 2 * box[1]) / max(1, 2 * (box[3] - box[1]))]
    for cs in drawings:
        if (area(max(cs, key=lambda c: abs(area(c)))) >= 0) != reference_sign:
            cs = [reverse(c) for c in cs]
        remaining, aligned = list(cs), []
        box = bounds(cs)
        for expected in reference:
            candidates = [c for c in remaining if (area(c) >= 0) == (area(expected) >= 0)]
            if not candidates:
                raise ValueError('Mark contour winding changes across knots')
            selected = min(candidates, key=lambda c: math.dist(center(c, box), center(expected, reference_box)) * 4
                           + abs(math.log(max(1e-10, abs(area(c))) / max(1e-10, abs(area(expected))))))
            aligned.append(selected)
            remaining.remove(selected)
        ordered.append(aligned)
    outputs = [[] for _ in ordered]
    for ci in range(count):
        contours = [cs[ci] for cs in ordered]
        # A direct compatible chart retains the original authoring node structure (aligned: only where every point is
        # the same kind as its partner).
        if len({len(c) for c in contours}) == 1 and not (ALIGNED and len({tuple(kinds(c)) for c in contours}) > 1):
            first = contours[0]
            def normalized(contour):
                b = bounds([contour])
                return [[(n[0] - b[0]) / max(1, b[2] - b[0]), (n[1] - b[1]) / max(1, b[3] - b[1])] for n in contour]
            expected = normalized(first)
            for i, contour in enumerate(contours):
                points = normalized(contour)
                offset = min(range(len(contour)), key=lambda offset: sum(math.dist(p, points[(j + offset) % len(points)]) ** 2 for j, p in enumerate(expected)))
                contour = contour[offset:] + contour[:offset]
                outputs[i].append(pack([curve(contour, k) for k in range(len(contour))]))
            continue
        charted = anchored(contours) if ALIGNED else None
        contours = [c for c, _ in charted] if charted else [canonical_start(c) for c in contours]
        tables = [path_table(c) for c in contours]
        if charted:
            # each contour's arc length laid on the first's piecewise between anchors, so anchors share their cuts
            def chart(ends, anchors, reference):
                knots = [ends[i] for i in anchors] + [1]
                goals = [reference[0][i] for i in reference[1]] + [1]
                def forward(s):
                    k = max(j for j in range(len(knots) - 1) if knots[j] <= s + 1e-15)
                    return goals[k] + (s - knots[k]) / max(1e-20, knots[k + 1] - knots[k]) * (goals[k + 1] - goals[k])
                def backward(u):
                    k = max(j for j in range(len(goals) - 1) if goals[j] <= u + 1e-15)
                    return knots[k] + (u - goals[k]) / max(1e-20, goals[k + 1] - goals[k]) * (knots[k + 1] - knots[k])
                return forward, backward
            reference = (tables[0][1], charted[0][1])
            charts = [chart(ends, anchors, reference) for (_, ends), (_, anchors) in zip(tables, charted)]
            tables = [([(forward(s), i, t) for s, i, t in table], [forward(e) for e in ends]) for (table, ends), (forward, _) in zip(tables, charts)]
        cuts = sorted(set(round(t, 12) for _, ends in tables for t in ends))
        for oi, (contour, (table, ends)) in enumerate(zip(contours, tables)):
            def locate(value, si):
                if abs(value - ends[si]) < 1e-10:
                    return 0
                if abs(value - ends[si + 1]) < 1e-10:
                    return 1
                rows = [r for r in table if r[1] == si]
                for a, b in zip(rows, rows[1:]):
                    if value <= b[0] + 1e-10:
                        u = (value - a[0]) / max(1e-20, b[0] - a[0])
                        return max(0, min(1, a[2] + (b[2] - a[2]) * u))
                return 1
            curves = []
            for low, high in zip(cuts, cuts[1:]):
                middle = (low + high) / 2
                si = next((i for i, end in enumerate(ends[1:]) if middle <= end), len(contour) - 1)
                if low < ends[si] - 1e-10 or high > ends[si + 1] + 1e-10:
                    raise ValueError('Common mark cuts crossed an unsplit source edge')
                t0, t1 = locate(low, si), locate(high, si)
                curves.append(subcurve(curve(contour, si), t0, t1))
            outputs[oi].append(pack(curves))
    return outputs


class Upstream:
    def __init__(self, family, italic, directory):
        self.family = family
        self.records = [f for f in family['files'] if f['file'].endswith('.ttf') and f['italic'] == italic]
        self.fonts = {}
        for record in self.records:
            path = directory / record['file']
            if hashlib.sha256(path.read_bytes()).hexdigest() != record['sha256']:
                raise ValueError('Changed upstream font: ' + str(path))
            self.fonts[record['file']] = TTFont(path)
        self.variable = next((r for r in self.records if any(a['tag'] == 'wght' for a in r['axes'])), None)
        self.used = set()
        self.cache = {}

    def instances(self, weight, width):
        if (weight, width) in self.cache:
            return self.cache[(weight, width)]
        if self.variable:
            records = [(self.variable, 1)]
        else:
            ordered = sorted(self.records, key=lambda r: r['declaredWeight'])
            before = max((r for r in ordered if r['declaredWeight'] <= weight), default=ordered[0], key=lambda r: r['declaredWeight'])
            after = min((r for r in ordered if r['declaredWeight'] >= weight), default=ordered[-1], key=lambda r: r['declaredWeight'])
            t = 0 if before == after else (weight - before['declaredWeight']) / (after['declaredWeight'] - before['declaredWeight'])
            records = [(before, 1)] if not t else [(before, 1 - t), (after, t)]
        result = []
        for record, factor in records:
            font = self.fonts[record['file']]
            location = {axis['tag']: max(axis['min'], min(axis['max'], weight if axis['tag'] == 'wght' else width if axis['tag'] == 'wdth' else axis['default']))
                        for axis in record['axes']}
            self.used.add(record['file'])
            result.append((font, font.getGlyphSet(location=location or None), factor))
        self.cache[(weight, width)] = result
        return result

    def close(self):
        for font in self.fonts.values():
            font.close()


DRAW_CACHE = {}


def glyph_contours(gs, name, scale):
    key = (id(gs), name, scale)
    if key in DRAW_CACHE:
        return DRAW_CACHE[key]
    pen = EXTRACT.Cubics(gs, scale)
    gs[name].draw(pen)
    DRAW_CACHE[key] = pen.contours
    return pen.contours


COMBINING = {'acute': 0x301, 'grave': 0x300, 'circumflex': 0x302, 'caron': 0x30c, 'tilde': 0x303,
             'dieresis': 0x308, 'ring': 0x30a, 'macron': 0x304, 'breve': 0x306, 'dot': 0x307,
             'hungarumlaut': 0x30b, 'commaturned': 0x312, 'caroncomma': 0x313, 'cedilla': 0x327,
             'ogonek': 0x328, 'commabelow': 0x326}


def standalone_name(cmap, gs, mark, capital):
    code = COMBINING[mark]
    name = cmap.get(code)
    names = ([str(name) + '.case', str(name) + '.cap', mark + '.case', mark + '.cap'] if capital else [])
    names += [name, mark, f'uni{code:04X}']
    return next((n for n in names if n in gs), None)


def mark_attachment(font, base_name, mark_name):
    if 'GPOS' not in font:
        return None
    for lookup in font['GPOS'].table.LookupList.Lookup:
        for table in lookup.SubTable:
            if lookup.LookupType == 9:
                if table.ExtensionLookupType != 4:
                    continue
                table = table.ExtSubTable
            elif lookup.LookupType != 4:
                continue
            if base_name not in table.BaseCoverage.glyphs or mark_name not in table.MarkCoverage.glyphs:
                continue
            record = table.MarkArray.MarkRecord[table.MarkCoverage.glyphs.index(mark_name)]
            base = table.BaseArray.BaseRecord[table.BaseCoverage.glyphs.index(base_name)].BaseAnchor[record.Class]
            if base:
                return [base.XCoordinate - record.MarkAnchor.XCoordinate, base.YCoordinate - record.MarkAnchor.YCoordinate]
    return None


def upstream_mark(font, gs, target):
    cmap, scale = font.getBestCmap(), 1000 / font['head'].unitsPerEm
    ch, base, mark = target['glyph'], target['base'], target['mark']
    base_name = cmap.get(ord(base)) or cmap.get(ord('i' if base == 'ı' else base))
    name = cmap.get(ord(ch))
    if not base_name:
        return None
    body = glyph_contours(gs, base_name, scale)
    if base == 'ı' and ord('ı') not in cmap:
        # A font without a dotless i places its marks over its i: measure that i without the dot standing over its
        # x-height, or the marks are aligned to the dot's top and sink into the stem.
        xh = font['OS/2'].sxHeight * scale
        body = [c for c in body if bounds([c])[1] < .9 * xh] or body
    if not name:
        chosen = standalone_name(cmap, gs, mark, base.isupper())
        if not chosen:
            return None
        contours = glyph_contours(gs, chosen, scale)
        anchor = mark_attachment(font, base_name, chosen)
        if anchor:
            dx, dy = [v * scale for v in anchor]
            bb, mb = bounds(body), bounds(contours)
            # the first mark lookup covering both glyphs can hold another anchor than the one over the letter
            # (Fredoka's l sets an acute halfway down its stem): an above mark is never sunk into its letter's ink
            if mark not in ['cedilla', 'ogonek', 'commabelow', 'caroncomma'] and mb[1] + dy < bb[3] - 10:
                anchor = None
        if not anchor:
            bb, mb = bounds(body), bounds(contours)
            dx = (bb[0] + bb[2] - mb[0] - mb[2]) / 2
            if mark in ['cedilla', 'ogonek']:
                dy = bb[1] + 3 - mb[3]
                if mark == 'ogonek':
                    dx = bb[2] - .2 * (mb[2] - mb[0]) - mb[2]
            elif mark == 'commabelow':
                dy = bb[1] - 45 - mb[3]
            elif mark == 'caroncomma':
                dx, dy = bb[2] + 25 - mb[0], bb[3] - mb[3]
            else:
                dy = bb[3] + 45 - mb[1]
        return {'contours': transform(contours, dx=dx, dy=dy), 'body': body, 'advance': gs[base_name].width * scale,
                'baseAdvance': gs[base_name].width * scale, 'kind': 'upstream-outline', 'glyphs': [chosen],
                'selection': {'glyph': chosen, 'newComposition': ch, 'placement': 'GPOS' if anchor else 'authored-port'}}
    recording = RecordingPen()
    gs[name].draw(recording)
    parts = [args for command, args in recording.value if command == 'addComponent']
    if len(parts) >= 2 and len(parts) == len(recording.value):
        drawings = [matrix(glyph_contours(gs, part, 1), m, scale) for part, m in parts]
        # This decision is baked into the recipe evidence, never repeated at runtime.
        bi = max(range(len(parts)), key=lambda i: bounds(drawings[i])[3] - bounds(drawings[i])[1])
        contours = [c for i, drawing in enumerate(drawings) if i != bi for c in drawing]
        if contours:
            return {'contours': contours, 'body': drawings[bi], 'advance': gs[name].width * scale,
                    'baseAdvance': gs[parts[bi][0]].width * scale, 'kind': 'upstream-composite',
                    'glyphs': [part for i, (part, _) in enumerate(parts) if i != bi], 'selection': {'glyph': name, 'omitComponent': bi}}
    complete = glyph_contours(gs, name, scale)
    bb = bounds(body)
    below = mark in ['cedilla', 'ogonek', 'commabelow']
    detached = [i for i, contour in enumerate(complete) if (bounds([contour])[3] <= bb[1] + 1 if below else bounds([contour])[1] >= bb[3] - 1)]
    if detached:
        return {'contours': [complete[i] for i in detached], 'body': body, 'advance': gs[name].width * scale,
                'baseAdvance': gs[base_name].width * scale, 'kind': 'upstream-outline', 'glyphs': [name],
                'selection': {'glyph': name, 'contours': detached}}
    chosen = standalone_name(cmap, gs, mark, base.isupper())
    if not chosen:
        return None
    contours = glyph_contours(gs, chosen, scale)
    mb, cb = bounds(contours), bounds(complete)
    if below:
        lower = [at(curve(c, i), j / 24) for c in complete for i in range(len(c)) for j in range(25)
                 if at(curve(c, i), j / 24)[1] < bb[1] - 1]
        cx = (min(p[0] for p in lower) + max(p[0] for p in lower)) / 2 if lower else (bb[0] + bb[2]) / 2
        dx, dy = cx - (mb[0] + mb[2]) / 2, cb[1] - mb[1]
        if mark in ['cedilla', 'ogonek']:
            dy = max(dy, bb[1] + 3 - mb[3])
    else:
        dx, dy = (bb[0] + bb[2] - mb[0] - mb[2]) / 2, cb[3] - mb[3]
    return {'contours': transform(contours, dx=dx, dy=dy), 'body': body, 'advance': gs[name].width * scale,
            'baseAdvance': gs[base_name].width * scale, 'kind': 'upstream-outline', 'glyphs': [chosen, name],
            'selection': {'glyph': chosen, 'placementFrom': name, 'attachedOverlap': 3 if below else 0}}


def rectangle(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def turns_alike(contours):
    """Whether a drawing turned about (mirrored left to right) is much the same: a block letter's lozenge grave is (its
    points move 4% of its size on average), a grave stroke isn't (8% and more in every bundled style)."""
    ps = [at(curve(c, i), j / 16) for c in contours for i in range(len(c)) for j in range(16)]
    b = bounds(contours)
    mirrored = [(b[0] + b[2] - p[0], p[1]) for p in ps]
    return sum(min(math.dist(m, p) for p in ps) for m in mirrored) / len(ps) / max(b[2] - b[0], b[3] - b[1]) < .06


def local_mark(glyphs, reference, mark, em):
    used = []
    def sized(ch, width, height, sx=1, sy=1):
        used.append(ch)
        cs = glyphs[ch][1]
        b = bounds(reference[ch][1])
        return transform(cs, sx * width / (b[2] - b[0]), sy * height / (b[3] - b[1]),
                         -sx * width * (b[0] + b[2]) / (2 * (b[2] - b[0])), -sy * height * b[1] / (b[3] - b[1]))
    def leaned(width, height, lean):
        # the style's apostrophe, a short upright stroke, leaned about its middle: right for an acute, left for a grave
        return matrix(sized("'", width, height), [1, 0, lean, 1, -lean * height / 2, 0])
    # A grave that is much the same turned about (a block letter's lozenge) can't be told from the acute made by
    # turning it: those two, and the double acute, are leaned strokes instead.
    diagonal = not turns_alike(reference['`'][1])
    if mark in ['acute', 'grave'] and not diagonal:
        cs = leaned(.075 * em, .17 * em, .8 if mark == 'acute' else -.8)
    elif mark in ['acute', 'grave']:
        cs = sized('`', .16 * em, .16 * em, -1 if mark == 'acute' else 1)
    elif mark in ['circumflex', 'caron']:
        cs = sized('^', .29 * em, .15 * em, sy=-1 if mark == 'caron' else 1)
    elif mark == 'tilde':
        cs = sized('~', .31 * em, .10 * em)
    elif mark == 'ring':
        cs = sized('°', .19 * em, .19 * em)
    elif mark in ['dot', 'dieresis']:
        dot = sized('.', .095 * em, .095 * em)
        cs = dot if mark == 'dot' else transform(dot, dx=-.085 * em) + transform(dot, dx=.085 * em)
    elif mark == 'hungarumlaut':
        acute = sized('`', .13 * em, .16 * em, sx=-1) if diagonal else leaned(.06 * em, .16 * em, .8)
        cs = transform(acute, dx=-.10 * em) + transform(acute, dx=.10 * em)
    elif mark == 'macron':
        cs = sized('-', .29 * em, .055 * em)
    elif mark == 'breve':
        cs = sized('(', .12 * em, .29 * em)
        cs = matrix(cs, [0, 1, -1, 0, .145 * em, 0])
    elif mark == 'caroncomma':
        cs = sized("'", .08 * em, .23 * em)
    else:
        cs = sized(',', .12 * em, .19 * em, sx=-1 if mark == 'ogonek' else 1, sy=-1 if mark == 'commaturned' else 1)
        if mark in ['cedilla', 'ogonek']:
            b = bounds(cs)
            join = rectangle(-.025 * em, b[3] - .03 * em, .025 * em, b[3] + .04 * em)
            if area(join) * area(max(cs, key=lambda c: abs(area(c)))) < 0:
                join = reverse(join)
            cs.append(join)
    return cs, used


def author(entry, inventory, targets, upstream_dir):
    DRAW_CACHE.clear()
    base = read_asset('masters', entry['base'])
    width = read_asset('widths', entry['width'])
    components = read_asset('components', entry['components'])
    if width['base'] != entry['base'] or components['base'] != entry['base'] or components['width'] != entry['width']:
        raise ValueError('Accent dependencies must share an exact basis and width')
    neutral = next(m['data'] for m in base['masters'] if m['weight'] == base['defaultWeight'])
    style = neutral['family']
    family = next((f for f in inventory['families'] if style in f['styles']), None)
    upstream = Upstream(family, neutral['id'].endswith('i'), upstream_dir) if family else None
    weights = [m['weight'] for m in base['masters']]
    columns = [{'width': width['axis']['neutral'], 'masters': [{'weight': m['weight'], 'glyphs': m['data']['glyphs']} for m in base['masters']]}, *width['columns']]
    columns.sort(key=lambda c: c['width'])
    cells = [(column['width'], m['weight'], m['glyphs']) for column in columns for m in column['masters']]
    neutral_index = next(i for i, (w, weight, _) in enumerate(cells) if w == width['axis']['neutral'] and weight == base['defaultWeight'])
    tittle = next(b for b in components['glyphs'] if b['glyph'] == 'i' and b['id'] == 'tittle')
    recipes, evidence = [], []
    output_cells = [{} for _ in cells]
    for target in targets:
        ch = target['glyph']
        original_base = target.get('base', 'i')
        letter = 'i' if original_base == 'ı' or ch == 'ı' else original_base
        omit = ['tittle'] if original_base == 'ı' or ch == 'ı' else []
        if ch == 'ı':
            recipes.append({'glyph': ch, 'base': 'i', 'omitComponents': omit, 'mark': None})
            continue
        mark = target['mark']
        attachment = 'attached' if mark in ['cedilla', 'ogonek'] else 'below' if mark == 'commabelow' else 'side' if mark == 'caroncomma' else 'above'
        body_contours = lambda glyphs: [c for ci, c in enumerate(glyphs[letter][1]) if not omit or ci not in tittle['contours']]
        intermediate, selections, origins, used_names = [], [], [], set()
        for w, weight, glyphs in cells:
            body = body_contours(glyphs)
            bb = bounds(body)
            upstreams = []
            if upstream:
                for font, gs, factor in upstream.instances(weight, w):
                    result = upstream_mark(font, gs, target)
                    if result:
                        upstreams.append((result, factor, font))
            if upstreams and abs(sum(factor for _, factor, _ in upstreams) - 1) < 1e-8:
                chunks = []
                for result, factor, font in upstreams:
                    ub, mb = bounds(result['body']), bounds(result['contours'])
                    os2, scale = font['OS/2'], 1000 / font['head'].unitsPerEm
                    stated = getattr(os2, 'sCapHeight' if letter.isupper() else 'sxHeight', 0) * scale
                    size = (neutral['cap'] if letter.isupper() else neutral['xh']) / (stated or (ub[3] - min(0, ub[1])))
                    center = bb[0] + ((mb[0] + mb[2]) / 2 - ub[0]) / max(1, ub[2] - ub[0]) * (bb[2] - bb[0])
                    edge = 1 if attachment in ['below', 'attached'] else 3
                    dx = center - (mb[0] + mb[2]) * size / 2
                    dy = bb[edge] - ub[edge] * size
                    contours = transform(result['contours'], size, size, dx, dy)
                    chunks.append((contours, factor))
                    used_names.update(result['glyphs'])
                compatible_chunks = compatible([c for c, _ in chunks])
                cs = [[ [sum(compatible_chunks[k][ci][ni][axis] * chunks[k][1] for k in range(len(chunks))) for axis in range(6)]
                        for ni in range(len(contour))] for ci, contour in enumerate(compatible_chunks[0])]
                advance = sum(max(0, result['advance'] - result['baseAdvance']) * factor for result, factor, _ in upstreams) if attachment == 'side' else 0
                origins.append(upstreams[0][0]['kind'])
                selections.append(upstreams[0][0]['selection'])
            else:
                em = neutral['cap']
                cs, names = local_mark(glyphs, neutral['glyphs'], mark, em)
                used_names.update(names)
                mb = bounds(cs)
                center = bb[2] - .04 * em if mark == 'ogonek' else bb[2] + .07 * em if attachment == 'side' else (bb[0] + bb[2]) / 2
                dy = bb[1] + .025 * em - mb[3] if attachment == 'attached' else bb[1] - .07 * em - mb[3] if attachment == 'below' else bb[3] - .28 * em - mb[1] if attachment == 'side' else bb[3] + .07 * em - mb[1]
                cs = transform(cs, dx=center - (mb[0] + mb[2]) / 2, dy=dy)
                advance = max(0, bounds(cs)[2] + .05 * em - glyphs[letter][0]) if attachment == 'side' else 0
                origins.append('local')
                selections.append({'local': mark, 'glyphs': names})
            # Independent ink layers must reinforce the source body at attached ports.
            if attachment == 'attached':
                sign = area(max(body, key=lambda c: abs(area(c))))
                largest = area(max(cs, key=lambda c: abs(area(c))))
                if sign * largest < 0:
                    cs = [reverse(c) for c in cs]
            intermediate.append({'contours': cs, 'advanceDelta': advance})
        neutral_body = body_contours(cells[neutral_index][2])
        nb, nm = bounds(neutral_body), bounds(intermediate[neutral_index]['contours'])
        desired = [(nm[0] + nm[2]) / 2, nb[1] if attachment in ['below', 'attached'] else nb[3]]
        # Port indexes refer to the full source drawing, including its suppressed tittle.
        port = nearest_port(neutral_body, desired)
        if omit:
            indices = [i for i in range(len(cells[neutral_index][2][letter][1])) if i not in tittle['contours']]
            port['contour'] = indices[port['contour']]
        try:
            compatible_marks = compatible([value['contours'] for value in intermediate])
        except ValueError as error:
            raise ValueError(f'{style}/{ch}: {error}') from error
        for i, value in enumerate(intermediate):
            anchor = port_point(cells[i][2][letter][1], port)
            output_cells[i][ch] = {'contours': transform(compatible_marks[i], dx=-anchor[0], dy=-anchor[1]), 'advanceDelta': value['advanceDelta']}
        kind = 'local' if 'local' in origins else 'upstream-outline' if 'upstream-outline' in origins else 'upstream-composite'
        method = 'local' if kind == 'local' or not upstream else 'native' if upstream.variable else 'fixed' if len(upstream.records) == 1 else 'interpolated'
        recipes.append({'glyph': ch, 'base': letter, 'omitComponents': omit,
                        'mark': {'attachment': attachment, 'anchor': [port], 'origin': {'kind': kind, 'weight': method, 'glyphs': sorted(used_names)}}})
        evidence.append({'glyph': ch, 'selection': selections[neutral_index], 'cellOrigins': sorted(set(origins)), 'contours': len(compatible_marks[0]),
                         'nodes': sum(map(len, compatible_marks[0]))})
    provenance = []
    if upstream:
        provenance = [{'family': family['family'], 'url': record['url'], 'revision': inventory['revision'], 'sha256': record['sha256']}
                      for record in upstream.records if record['file'] in upstream.used]
        upstream.close()
    out_columns, offset = [], 0
    for column in columns:
        out_columns.append({'width': column['width'], 'masters': [{'weight': m['weight'], 'glyphs': output_cells[offset + i]} for i, m in enumerate(column['masters'])]})
        offset += len(column['masters'])
    data = {'format': 'source-marks-v1', **entry, 'stage': 'after-proportions-before-pose-v1',
            'axes': {'weight': {'min': weights[0], 'neutral': base['defaultWeight'], 'max': weights[-1]}, 'width': width['axis']},
            'recipes': recipes, 'columns': out_columns, 'provenance': provenance,
            'notes': ['Base letter Params and Points are shared; marks are separate authored contours, composed before placement, spacing, and finishes.',
                      'Upstream composites retain their mark curves. Detached outlines and standalone marks supply flattened upstream accents. Attached standalone marks retain a small positive overlap at the explicit port.',
                      'Common approximate-arclength cuts establish correspondence; every compiled cubic is an exact subcurve of the selected endpoint drawing. No endpoint outline is replaced by a polygon fit.',
                      'Native width is read only within the upstream width axis. Other widths preserve mark size while moving its placement with the edited base. Single-weight upstream marks remain fixed in weight.',
                      'Local marks use this style\'s punctuation and own weight drawings. Their provenance is marked local. These are new authored variants, not missing upstream instances.',
                      'This implementation batch has structural generation checks only. Optical specimens, intermediate topology, attached-mark clearance, edited-port behavior, and export review are deferred.']}
    return data, {'fontId': entry['base']['fontId'], 'glyphs': evidence}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--upstream-dir', default=os.environ.get('TYPELAB_MASTER_UPSTREAM', str(ROOT / '.tools/master-upstream')))
    parser.add_argument('--style', help='Optional comma-separated style names')
    parser.add_argument('--aligned', default='', help='Comma-separated styles whose cells are charted from their corners and extremes')
    args = parser.parse_args()
    global ALIGNED
    inventory = json.loads((ROOT / 'tools/masters/upstream.json').read_text())
    targets = json.loads((ROOT / 'tools/authored/mark-recipes.json').read_text())['characters']
    entries = json.loads(Path(args.input).read_text())
    directory = Path(args.out)
    directory.mkdir(parents=True, exist_ok=True)
    for entry in entries:
        if args.style and entry['base']['fontId'].split(':')[0] not in args.style.split(','):
            continue
        ALIGNED = entry['base']['fontId'].split(':')[0] in args.aligned.split(',')
        data, evidence = author(entry, inventory, targets, Path(args.upstream_dir))
        name = entry['base']['fontId'].split(':')[0]
        (directory / (name + '.json')).write_text(json.dumps(data, separators=(',', ':')) + '\n')
        (directory / (name + '.evidence.json')).write_text(json.dumps(evidence, indent=2) + '\n')
        print(json.dumps({'style': name, 'glyphs': len(data['recipes']), 'cells': sum(len(c['masters']) for c in data['columns']),
                          'local': sum(bool(r['mark']) and r['mark']['origin']['kind'] == 'local' for r in data['recipes'])}), flush=True)


if __name__ == '__main__':
    main()
