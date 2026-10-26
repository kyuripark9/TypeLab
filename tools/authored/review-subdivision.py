"""Independently verify a master's exact old-segment parameter correspondence."""
import hashlib
import json
from math import hypot, isfinite
from pathlib import Path
import sys


def curve(contour, index):
    a, b = contour[index], contour[(index + 1) % len(contour)]
    outgoing = a[4:6] if len(a) == 6 else None
    incoming = b[2:4] if len(b) >= 4 and b[2] is not None else None
    if outgoing is None and incoming is None:
        return [a[:2], [(2 * a[k] + b[k]) / 3 for k in range(2)],
                [(a[k] + 2 * b[k]) / 3 for k in range(2)], b[:2]]
    return [a[:2], outgoing or a[:2], incoming or b[:2], b[:2]]


def point(points, t):
    u = 1 - t
    factors = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3]
    return [sum(p[k] * f for p, f in zip(points, factors)) for k in range(2)]


def mixed(a, b, blend):
    return [[x[k] + (y[k] - x[k]) * blend for k in range(2)] for x, y in zip(a, b)]


def review(old_path, new_path, binding_path):
    old_bytes, new_bytes = Path(old_path).read_bytes(), Path(new_path).read_bytes()
    old, new = json.loads(old_bytes), json.loads(new_bytes)
    binding = json.loads(Path(binding_path).read_text())
    assert binding['format'] == 'master-subdivision-v1'
    assert binding['from']['digest'] == hashlib.sha256(old_bytes).hexdigest()
    assert binding['to']['digest'] == hashlib.sha256(new_bytes).hexdigest()
    assert binding['from']['fontId'] == binding['to']['fontId'] == old['source']['fontId']
    assert old['source'] == new['source']
    weights = [m['weight'] for m in old['masters']]
    assert weights == [m['weight'] for m in new['masters']]
    old_data, new_data = old['masters'][0]['data'], new['masters'][0]['data']
    assert old_data['glyphs'].keys() == new_data['glyphs'].keys() == binding['glyphs'].keys()
    for character, contours in binding['glyphs'].items():
        assert len(contours) == len(old_data['glyphs'][character][1]) == len(new_data['glyphs'][character][1])
        for ci, intervals in enumerate(contours):
            assert len(intervals) == len(new_data['glyphs'][character][1][ci])
            coverage = [[] for _ in old_data['glyphs'][character][1][ci]]
            for interval in intervals:
                segment, start, end = interval['segment'], interval['t0'], interval['t1']
                assert isinstance(segment, int) and 0 <= segment < len(coverage)
                assert isfinite(start) and isfinite(end) and 0 <= start <= 1 and 0 <= end <= 1 and start != end
                coverage[segment].append((min(start, end), max(start, end)))
            for spans in coverage:
                at = 0
                for start, end in sorted(spans):
                    assert abs(start - at) < 1e-12, (character, ci, 'gap or overlap', start, at)
                    at = end
                assert abs(at - 1) < 1e-12, (character, ci, 'incomplete source segment')
    maximum, samples = 0.0, 0
    cases = [(i, i, 0) for i in range(len(weights))] + [(i, i + 1, .5) for i in range(len(weights) - 1)]
    for low, high, blend in cases:
        oa, ob = old['masters'][low]['data'], old['masters'][high]['data']
        na, nb = new['masters'][low]['data'], new['masters'][high]['data']
        for key in ['cap', 'xh', 'space']:
            assert oa[key] == na[key] and ob[key] == nb[key]
        for ch, contours in binding['glyphs'].items():
            assert oa['glyphs'][ch][0] == na['glyphs'][ch][0] and ob['glyphs'][ch][0] == nb['glyphs'][ch][0]
            for ci, intervals in enumerate(contours):
                for ni, interval in enumerate(intervals):
                    segment, start, end = interval['segment'], interval['t0'], interval['t1']
                    before = mixed(curve(oa['glyphs'][ch][1][ci], segment), curve(ob['glyphs'][ch][1][ci], segment), blend)
                    after = mixed(curve(na['glyphs'][ch][1][ci], ni), curve(nb['glyphs'][ch][1][ci], ni), blend)
                    for t in [0, .125, .25, .375, .5, .625, .75, .875, 1]:
                        p, q = point(before, start + (end - start) * t), point(after, t)
                        maximum = max(maximum, hypot(p[0] - q[0], p[1] - q[1]))
                        samples += 1
    assert maximum < 1e-8, maximum
    return {'samples': samples, 'weightCases': len(cases), 'maximumPointError': maximum,
            'completeParameterCoverage': True, 'metricsUnchanged': True}


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: review-subdivision.py old-base.json new-base.json binding.json')
    print(json.dumps(review(*sys.argv[1:])))
