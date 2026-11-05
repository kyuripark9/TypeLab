# Master basis revisions

A saved Points edit identifies an anchor by its master digest, glyph, contour, source segment, and parameter. Adding curve cuts or reversing a contour changes that identity even when the curve stays exact. A new master package therefore needs an explicit correspondence map before older edits can adopt it.

Cotton's local width drawings use common curve cuts across all five weights. Gumdrop's H repair reverses its left-stem contour at all three weights. Compass's and Kernel's repairs redraw letters at their weights away from the default (weight-masters.md). All are published separately from their original masters. The catalog contains 26 revisions for 22 styles; all older source, master, width, and program files remain unchanged.

## Exact correspondence

[`MasterSubdivisionData`](../../shared/source/subdivision.ts) has this shape:

```ts
interface MasterSubdivisionData {
	format: 'master-subdivision-v1';
	from: MasterSourceRef;
	to: MasterSourceRef;
	glyphs: Record<string, { segment: number; t0: number; t1: number }[][]>;
}
```

Each target edge identifies one interval of an old edge on the same contour. Descending intervals reverse the curve. Straight edges use cubic controls at one-third and two-thirds of the line, so source parameters remain linear in distance.

`parseMasterSubdivision` validates the data without loading either font. `decodeMasterSubdivision` then requires the same original outline, default weight, weight knots, metrics, advances, glyph set, and contour set. Every contour must make one contiguous traversal that covers every old segment exactly once, with a consistent direction. Every target cubic control must match the corresponding exact subdivision at every weight knot within 0.0000001 font unit. Parameter coverage tolerance is 0.000000000001.

The exact control check also covers intermediate weights because compatible master interpolation and cubic subdivision are linear in the control coordinates. It permits representation changes and whole-contour reversal. It does not permit optical redrawing. Reversal can change nonzero-filled overlaps, as intended for Gumdrop's H, so a passing map still requires filled-geometry and visual review.

A repair names the letters it redraws in an optional `redrawn` string (distinct mapped glyphs in code point order). For those letters only, and only at weights other than the default, the control check is skipped: their structure, advances, metrics and default-weight curves stay exact, so every point keeps its identity and the style's own weight draws exactly as before. Saved Points cross a repair as they cross any basis change: the edits move with the difference between the old and the new letter at the saved frame. A program reached through such a map may republish its letter forms on the new basis; an upgrade carries a design's chosen form, and the drawings waiting on its forms, to the republished form with the same letter and id.

Immutable maps live in `fonts/subdivisions/<sha256>.json`. A program's optional `transitions` array pairs a historical `from` master reference with a `master-subdivision-v1` mapping reference. Each mapping targets the program's current base directly. Runtime evaluation does not follow a chain of intermediate bases.

## Saved edits

Older documents keep their original source references. An explicit upgrade is available only when the new program retains the old controls and width domain, and supplies any required basis transition. Cotton and Gumdrop's original `outline-v1` drawings match their first master bases exactly. Their older edits can use that basis identity without enabling weight controls on old outline documents.

Evaluation removes the saved placement and height transforms, splits known edited edges at the new basis boundaries, and remaps their source parameters. It subdivides the previous evaluated drawing at the same boundaries, then applies the new drawing's motion. Explicit line handles allow newly curved target segments to move correctly. Existing Pen splits, handle edits, closed-edge splits, and contour reversals retain their edited curves during this change of representation.

For a winding repair, unaffected contours establish the saved glyph's common direction. The affected contour reverses only when it follows that direction. A local manual reversal stays physical. Ambiguous or custom order does not establish a repair direction. Newly drawn or reconnected edges without a known source interval use the existing spatial edit transport; they do not claim exact segment correspondence.

Adoption leaves saved Points frames intact. A later edit records the new frame. Existing authored width coordinates, per-letter overrides, and advance edits survive the transition. The browser and export workers load the historical bases and exact mapping before registering the complete new program.

## Publication

The publishers hash canonical parsed JSON with a trailing newline. The published mapping digest can differ from the authoring file's digest if reference field order changes during parsing. Program manifests must use the published digest.

After the geometry and optical reviews, publish a revised base and its map:

```sh
node --max-old-space-size=512 --import tsx tools/authored/build-masters.ts \
	--derived .audit/width/Cotton-local-base.json .audit/width/Cotton-local-binding.json
node --max-old-space-size=512 --import tsx tools/authored/build-revisions.ts \
	.audit/width/Cotton-local-binding.json
```

The base publisher requires an already published parent and validates the complete map before writing. Both publishers preserve immutable files and validate all selected inputs before mutation. `TYPELAB_PUBLICATION_ROOT` directs them to an isolated publication directory for tests.

A repair that keeps a basis's points is carried onto it by `repair-weight-masters.ts <Family> <repaired-package.json> <out>`, which first rebuilds the published basis and width drawings from the first package exactly, then writes the repaired basis, its maps from the published basis and from the first package (naming the redrawn letters), the recompiled width drawings and the crossbar on the new basis. Compass and Kernel were published with `build-masters.ts --derived base.json from-current.json`, `build-revisions.ts` with both maps, `build-programs.ts --width-asset --feature-asset`, `build-components.ts` on the new bases, an interim `--program` (the newest program's policies on the new assets, its marks, forms and dots left out, both maps as transitions), the marks and forms charted with `--aligned`, then `--marks --forms`, `build-dots.ts`, and `--dots`.

Publish the compatible width and feature assets, then the complete program manifest:

```sh
node --max-old-space-size=512 --import tsx tools/authored/build-programs.ts \
	--width-asset .audit/masters/feature-width/Cotton-width.json \
	--feature-asset .audit/masters/feature-width/Cotton-features.json \
	--program .audit/masters/feature-width/Cotton-program.json
npm run programs:check
```

`--width-asset` and `--feature-asset` publish dependencies without selecting a new program. `--program` validates the full manifest, including the exact width required by its features and any basis transitions. A changed base requires a transition from the preceding program. Existing `--width` and `--features` shortcuts remain useful when the base is unchanged.

## Evidence and limits

The independent Python verifier checked 701,946 Cotton points at knots and midpoints, with maximum error below 3.22 × 10⁻¹³ font units. Gumdrop's 215,820 checks had zero error. Both retained all advances and font metrics. The shared runtime validator checks every cubic control at every weight knot, rather than only sampled curve positions.

[`subdivision.test.ts`](../../tests/subdivision.test.ts) covers exact literal cuts, contour reversal, malformed maps, missing coverage, changed controls, and changed metrics. [`master-publication.test.ts`](../../tests/master-publication.test.ts) runs the real publishers in a temporary directory and proves rejection before writes, immutable original bytes, catalog-helper preservation, and idempotence. [`weight-masters.test.ts`](../../tests/weight-masters.test.ts) validates every appended basis against an earlier published revision.

The saved-edit tests in [`edit-rebase.test.ts`](../../tests/edit-rebase.test.ts) and [`basis-adoption.test.ts`](../../tests/basis-adoption.test.ts) cover literal curves and real Cotton and Gumdrop documents. Geometry correspondence is one part of publication review. Width, feature, height, filled topology, text-size appearance, and export still require their own checks.

This map contract begins at a published master basis. Earlier sheet outlines with different initial point layouts need their own correspondence before they can claim the same guarantee. The new Cotton and Gumdrop maps do not prove that unrelated original-sheet edits match their first master packages.
