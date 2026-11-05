"""Rebuild the twelve sans, mono, rounded and slab master packages from pinned upstream files."""
import argparse
from pathlib import Path
import subprocess

RECIPES = {
    'Mainline': ('transfer-masters.ts', '300,400,500,600,700,800'),
    'Hearth': ('transfer-masters.ts', '300,400,500,600,700,800'),
    'Parlance': ('transfer-masters.ts', '300,400,500,600,700,800'),
    'Orbital': ('transfer-masters.ts', '300,400,500,600,700'),
    'Cotton': ('sample-masters.ts', '200,300,400,500,600'),
    'Gumdrop': ('sample-masters.ts', '500,600,700'),
    'Jotter': ('sample-masters.ts', '400,500'),
    # static upstream weights whose points sit in different places: matched by their corners and extremes
    'Kernel': ('sample-masters.ts', '450,500,600', '--aligned'),
    'Compass': ('sample-masters.ts', '300,400,450', '--aligned'),
    'Dispatch': ('sample-masters.ts', '400,600'),
    'Turnpike': ('local-masters.mjs', ''),
    'Funnies': ('local-masters.mjs', ''),
}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('styles', nargs='*', help='Families to rebuild; defaults to all twelve')
    parser.add_argument('--inventory', default='tools/masters/upstream.json')
    parser.add_argument('--upstream-dir')
    parser.add_argument('--out', default='.audit/masters/outline')
    args = parser.parse_args()
    selected = args.styles or list(RECIPES)
    for style in selected:
        if style not in RECIPES:
            parser.error(f'Unknown family {style}')
    destination = Path(args.out)
    destination.mkdir(parents=True, exist_ok=True)
    for style in selected:
        script, weights, *flags = RECIPES[style]
        source = next(Path('fonts').glob(style + '-*.json'))
        extracted = destination / (style + '-extracted.json')
        output = destination / (style + '-package.json')
        extract = ['python3', 'tools/authored/extract-masters.py', '--inventory', args.inventory,
                   '--style', style, '--out', str(extracted)]
        if args.upstream_dir:
            extract += ['--upstream-dir', args.upstream_dir]
        subprocess.run(extract, check=True)
        author = ['node', '--max-old-space-size=512', '--import', 'tsx', 'tools/authored/' + script,
                  str(source), str(extracted), str(output)]
        if weights:
            author.append(weights)
        author += flags
        subprocess.run(author, check=True)
