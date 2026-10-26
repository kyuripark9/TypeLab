# Weight masters

All 22 bundled outline families have compatible weight masters for the full 127-character set. The runtime interpolates these drawings within each family's reviewed range. Original points and curve subdivisions retain their correspondence through Points edits; newly drawn geometry follows nearby authored motion.

Each `weight-masters-v1` package records its original `outline-v1` reference, default weight, compatible drawings, provenance, licenses, and authoring notes. Publication creates an immutable `masters-v1` snapshot under `fonts/masters/<sha256>.json`. The historical files in `fonts/` and `fonts/sources/` remain unchanged, so saved designs retain their original geometry.

## Coverage

An **upstream transfer** adds the original designer's weight deltas to TypeLab's edited source curves. A **local variant** is a newly authored lighter or heavier version of the edited source. Its numerical weight identifies the local range; it does not claim an upstream font instance at that weight.

| TypeLab family | Original family | Default | Reviewed range | Method |
| --- | --- | ---: | --- | --- |
| Almanac | Libre Baskerville | 500 | 400–600 | Upstream transfer |
| Ballyhoo | Abril Fatface | 400 | 300–500 | Local variants |
| Boardwalk | Pacifico | 400 | 300–500 | Local variants |
| Bulwark | Bundled Bulwark drawings | 700 | 100–700 | Existing authored weights |
| Cathedral | UnifrakturMaguntia | 400 | 300–500 | Local variants |
| Compass | Poppins | 300 | 300–450 | Upstream transfer |
| Cotton | Nunito | 300 | 200–600 | Upstream transfer |
| Couture | Playfair Display | 600 | 500–700 | Upstream transfer |
| Dispatch | Courier Prime | 400 | 400–600 | Upstream transfer |
| Funnies | Comic Neue | 400 | 300–500 | Local variants |
| Gumdrop | Fredoka | 700 | 500–700 | Upstream transfer |
| Hearth | Roboto Slab | 600 | 300–800 | Upstream transfer |
| Jotter | Caveat | 400 | 400–500 | Upstream transfer |
| Kernel | IBM Plex Mono | 500 | 450–600 | Upstream transfer |
| Mainline | Roboto | 600 | 300–800 | Upstream transfer |
| Orbital | Unbounded | 600 | 300–700 | Upstream transfer |
| Parlance | Open Sans | 500 | 300–800 | Upstream transfer |
| Serenade | Great Vibes | 400 | 300–500 | Local variants |
| Sonnet | Playfair Display Italic | 400 | 400–500 | Upstream transfer |
| Timber | Alfa Slab One | 400 | 300–500 | Local variants |
| Turnpike | Barlow | 500 | 400–600 | Local variants |
| Vellum | EB Garamond | 400 | 400–600 | Upstream transfer |

The ranges stop before wider experiments produce closed gaps, fragments, or lost counters. Compass and Kernel use interpolated 450 endpoints. Playfair's math operators, slashes, and daggers retain their upstream fixed strokes. Couture's degree sign and Sonnet's bullet also stay fixed.

## Authoring methods

The transfer tools match contour assignment, winding, and cyclic starting points. Where edits or static-font optimization changed node counts, they use monotone contour correspondence. The neutral weight retains the edited source curves except for the declared repairs below. Explicit cubic handles and collapsed segments provide stable correspondence without changing the represented ink.

The seven local-variant families use a shared deformation of the plane around each glyph. Every overlapping component follows the same map. Exact Bézier subdivision at triangle boundaries lets the generator transform each curve piece with one affine map. The generator checks the determinant throughout interpolation and rejects a minimum below 0.05. The five single-weight originals use a separate positive affine stretch for slash and backslash, preserving their straight diagonal sides.

Local variants keep their original vertical extent and left ink edge; advance follows the change in ink width. The single-weight generator rounds final coordinates to 0.00001 font unit. These ranges remain deliberately limited and require visual review. The map certificate establishes that the geometry does not fold, not that a design is typographically successful.

## Recorded repairs

These changes belong to the new master packages. They do not overwrite the original source snapshots.

- Hearth K and w gain duplicate anchors at collapsed knees. The caret's inner-apex points merge to remove a 2.52-square-unit source hole. An exact split trims the euro's reversed lower-bar stub.
- Couture's six asterisk petal tips move to separate points seven units from the center, removing two tiny source islands.
- Sonnet's b and p lower inner bowl attachments move seven units right, and the yen stem join moves five units left, closing microscopic source holes. The a bowl moves five units right per 100 weight units to retain stem contact.
- Vellum and Dispatch preserve positive gaps between explicit serif-tip groups. This affects Vellum W and m, and Dispatch H, U, h, and n. Their neutral drawings stay unchanged.
- Turnpike's slash, backslash, X, closing parenthesis, and y handles are clamped to their endpoint rectangles by at most seven units, removing microscopic cap crossings.
- Funnies' missing dagger and double dagger reuse its rounded plus outline, with a longer lower stem or two overlapping crosses.
- Cathedral's missing minus reuses an equals bar. Divide adds two scaled colon dots. Backslash mirrors the slash within its advance, correcting the original direction and oversized outline.
- Bulwark gains collapsed segments to make j and parentheses compatible. The 600 and 700 single guillemet notches are repaired. Double guillemets use two 190-unit chevrons with a 24-unit gap. The 800 and 900 drawings are excluded because their counters fail review.

## Reconstruct the packages

Run from the repository root with project dependencies installed, Python 3, FontTools, and `curl`. Extraction was verified with FontTools 4.61.1. Run one authoring process at a time.

Download the pinned original files and licenses, then rebuild the twelve sans, mono, rounded, and slab families:

```sh
python3 tools/masters/fetch-upstream.py
python3 tools/authored/rebuild-masters.py
```

The committed inventory is [`tools/masters/upstream.json`](../../tools/masters/upstream.json). It pins Google Fonts revision `e7db6ca603fd4862010383ff17ffd6cc4ffac1c0`, source URLs, and SHA-256 digests. `fetch-upstream.py --check` verifies an existing download without network access. For another download directory, pass `--out` to the downloader and set `TYPELAB_MASTER_UPSTREAM` for the authoring commands.

Rebuild the four serif families:

```sh
while read -r family source weights; do
	python3 tools/authored/extract-masters.py --inventory tools/masters/upstream.json --style "$family" --out ".audit/masters/couture/$family-extracted.json" --weights "$weights"
	node --max-old-space-size=512 --import tsx tools/authored/serif-masters.ts "fonts/$source.json" ".audit/masters/couture/$family-extracted.json" ".audit/masters/couture/$family.package.json" "$weights"
done <<'MASTERS'
Couture Couture-600 500,600,700
Sonnet Sonnet-400i 400,500
Vellum Vellum-400 400,500,600
Almanac Almanac-500 400,500,600
MASTERS
```

Rebuild the five single-weight originals and Bulwark:

```sh
node --max-old-space-size=512 --import tsx tools/masters/author-ambient.mjs
node --max-old-space-size=512 --import tsx tools/masters/author-bulwark.mjs
```

The `.audit` paths are generated outputs. No authoring tool requires an existing audit directory or another worktree. `rebuild-masters.py --out` changes its output directory. Bulwark accepts `TYPELAB_MASTER_OUT`, and the serialized verifier accepts `TYPELAB_VERIFY_REPORT`.

Verify the serialized packages and inspect each generated full-character PNG or SVG before publication:

```sh
node --max-old-space-size=512 --import tsx tools/masters/verify-authored.mjs .audit/masters/outline/*-package.json .audit/masters/couture/*.package.json .audit/masters/sources/single/*-masters.json .audit/masters/sources/Bulwark-masters.json
node --max-old-space-size=512 --import tsx tools/authored/build-masters.ts .audit/masters/outline/*-package.json .audit/masters/couture/*.package.json .audit/masters/sources/single/*-masters.json .audit/masters/sources/Bulwark-masters.json
node --max-old-space-size=512 --import tsx tools/authored/build-masters.ts --check
```

The packer validates package structure and immutable hashes. It retains previous revisions and regenerates the shared catalog. It does not substitute for geometry checks or visual review. Packages carry provenance and license notices; the Roboto Slab derivative includes its upstream Apache 2.0 notice and the TypeLab source's OFL notice.

## Validation and limits

Run `npm run masters:check` to verify the published hashes and exercise every bundled family through combined height, width, weight, dot-placement, and export checks. The report distinguishes fixed-area threshold crossings in existing microscopic components from newly changed topology. It does not replace full-character visual review.

The initial release passed 635 tests with one existing skip. Its catalog check covered 16,764 finite-coordinate cases, 1,452 topology cases, and 258 dot-placement cases without failures. Six existing microscopic Turnpike components crossed the fixed-area reporting threshold when enlarged; their relative topology stayed unchanged. All 384 engine golden probes and 713 available free-font probes matched. Another 651 historical free-font probes could not run because their cached files were absent or differed. Desktop (1440×900) and phone (390×844) browser checks included weight changes, script specimens, family selection, and a six-font ZIP download; no browser errors were reported.

Reports compare filled component and counter counts for every glyph at every master and quarter interval. Bulwark also checks each 25-weight increment. Additional serif checks covered every ten weight units and every single weight unit for repaired glyphs. The verifier reads serialized packages through the runtime parser and interpolator, and records package size and interpolation timing.

These are finite sampling checks. The polygon-based topology measurement ignores areas of at most 0.1 square font unit and does not measure spacing quality, curve smoothness, or readability. The serif authoring report uses 0.15; the common serialized verifier uses 0.1. Positive triangle determinants certify the continuous ambient map before coordinate rounding. Serialized checks and specimens cover the rounded output.

Runtime regression tests live in [`tests/weight-masters.test.ts`](../../tests/weight-masters.test.ts). Source preservation and height behavior also have tests in [`tests/authored-source.test.ts`](../../tests/authored-source.test.ts) and [`tests/authored-geometry.test.ts`](../../tests/authored-geometry.test.ts). Any wider range or changed recipe requires regenerated packages and renewed geometry and visual review.

The detailed recipes are in [the transfer guide](../../tools/authored/weight-masters.md), [the serif guide](../../tools/authored/serif-masters.md), and [the ambient design](../../tools/masters/ambient-design.md).
