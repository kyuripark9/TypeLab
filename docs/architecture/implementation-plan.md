# Implementation plan

The editor will start new source styles from their original Bézier outlines. Saved version 7 designs will keep the existing renderer. New designs will pin an immutable source digest and the outline interpreter version.

## Decisions from the prototype

Automatic weight masters failed the first visual and topology gate: a two-unit inset introduced a counter in Couture R. The first production interpreter therefore supports source-preserving size, height, width, slant, rotation, reflection and spacing changes. Weight and alternate forms require compatible, reviewed source masters and are unavailable until those exist. The UI must state this limitation and hide controls that cannot work.

Height changes use a continuous, increasing coordinate map of complete original contours. Cubics crossing a change in slope must be split before transformation. Dots need a fixed shape and an explicit attachment relationship. This replaces independent movement of inferred strokes. Original source geometry remains authoritative.

## Work and acceptance

- [x] Ground both existing engines, saved documents, Points, family generation and export. Compare two architecture candidates. Record the evidence in proposal.md and decision.md.
- [x] Create an isolated authored-styles worktree. Preserve the user's engine-v2 worktree.
- [x] Generate and validate immutable source snapshots and a digest catalog for all bundled fonts. Preserve absent characters as absent, with diagnostics, rather than manufacturing replacements.
- [x] Add the version 8 source reference, boundary validation and explicit legacy migration. Pin sources for new style selections only.
- [x] Implement exact contour transformations and connect one evaluator to preview, Points and exports. A neutral source must reproduce all original curves and advances after the documented coordinate normalization.
- [x] Make supported controls discoverable and unsupported controls unavailable across the editor. Keep point edits attached when settings change. Include drawing histories in saved-state checks and reject stale carry results.
- [x] Add executable acceptance checks for the reported j/y failures, missing sources, document round trips, point edits and exported outlines. Render representative full alphabets and inspect them.
- [x] Run the complete existing test suite, type check, build and the applicable legacy golden checks. Verify the running editor at desktop and phone sizes.
- [x] Review the diff, update this plan with measured results and limitations, and land the tested work on main.

## Subsequent source authoring

The runtime supports only what has passed its source checks. Adding weight or anatomical alternate forms requires original compatible masters or deliberately edited masters, a named coordinate correspondence, endpoint and combination checks, and visual review. Generic contour offsets do not qualify as authored masters. The implementation must not pretend to recover absent type-design information.

Measured results and the remaining source-authoring work are in [implementation-results.md](implementation-results.md).
