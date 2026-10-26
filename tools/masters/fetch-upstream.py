#!/usr/bin/env python3
"""Fetch the exact original font revisions used to author TypeLab's weight masters."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, help='Download directory; defaults to .tools/master-upstream')
    parser.add_argument('--family', action='append', help='Fetch only this original family; may be repeated')
    parser.add_argument('--check', action='store_true', help='Verify files without downloading or writing')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    destination = args.out or root / '.tools/master-upstream'
    catalog = json.loads((Path(__file__).parent / 'upstream.json').read_text())
    selected = set(args.family or [family['family'] for family in catalog['families']])
    available = {family['family'] for family in catalog['families']}
    if selected - available:
        parser.error('Unknown original families: ' + ', '.join(sorted(selected - available)))
    checked = downloaded = 0
    missing = []
    for family in catalog['families']:
        if family['family'] not in selected:
            continue
        for record in family['files']:
            path = destination / record['file']
            if path.exists():
                data = path.read_bytes()
            elif args.check:
                missing.append(record['file'])
                continue
            else:
                response = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', record['url']],
                                          capture_output=True, check=True)
                data = response.stdout
            if hashlib.sha256(data).hexdigest() != record['sha256']:
                parser.error(f'Immutable upstream file failed its digest check: {path}')
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
                downloaded += 1
            checked += 1
    if missing:
        parser.error('Missing upstream files: ' + ', '.join(missing))
    print(json.dumps({'revision': catalog['revision'], 'families': len(selected),
                      'checked': checked, 'downloaded': downloaded, 'directory': str(destination)}))


if __name__ == '__main__':
    main()
