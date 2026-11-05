# Authoring the sans, mono, rounded and slab weights

The source curves define the neutral master. Runtime code interpolates precomputed compatible drawings. Existing `outline-v1` snapshots are unchanged.

Download the pinned files, then rebuild all twelve families sequentially:

```sh
python3 tools/masters/fetch-upstream.py
python3 tools/authored/rebuild-masters.py
```

Append family names to rebuild a subset. Set `TYPELAB_MASTER_UPSTREAM` or pass `--upstream-dir` for another download directory. Each run verifies upstream SHA-256 digests and writes packages, geometry reports, and full-character SVG/PNG specimens to `.audit/masters/outline`. A failed geometry check exits nonzero. Inspect the specimens before passing packages to `build-masters.ts`.

| Family | Reviewed weight range | Authoring method |
| --- | --- | --- |
| Mainline | 300–800 | Aligned upstream node deltas |
| Hearth | 300–800 | Aligned upstream node deltas with two small join repairs |
| Parlance | 300–800 | Aligned upstream node deltas |
| Orbital | 300–700 | Aligned upstream node deltas |
| Cotton | 200–600 | Upstream deltas with contour correspondence |
| Gumdrop | 500–700 | Upstream deltas with contour correspondence |
| Jotter | 400–500 | Upstream deltas with contour correspondence |
| Kernel | 450–600 | Upstream deltas matched by corners and extremes (`--aligned`); 450 is between authored instances |
| Compass | 300–450 | Upstream deltas matched by corners and extremes (`--aligned`); 450 is between authored instances |
| Dispatch | 400–600 | Upstream deltas with serif gap constraints |
| Turnpike | 400–600 | Newly authored local weight drawings |
| Funnies | 300–500 | Newly authored local weight drawings |

`transfer-masters.ts` matches contour assignment, winding and cyclic start positions, then adds authored upstream deltas to the edited source. Missing handles become degenerate cubic handles without changing the source ink. `sample-masters.ts` uses monotone contour correspondence where source edits or static-font optimization changed the node counts. The ranges stop before the wider variants introduce closed gaps or spurious fragments.

Static upstream weights can keep the same number of points in different places (Poppins's s at 300 and 400), so a count says nothing about which points match. Matching them by count, or by arc length where counts differ, moved points by other points' motion and drew dents, flags, tapering stems and tilted baselines into Compass's 400 and 450 and Kernel's 450 and 600. `sample-masters.ts --aligned` (`node-alignment.ts`) redraws each upstream weight on the default weight's points first: corners pair with corners and curve extremes with extremes running the same way, in contour order, and every other point keeps its share of the curve between them; pieces inside one upstream curve are cut from it exactly, pieces spanning several fitted with their end directions kept (at most 3 units off). Where the sheet keeps other points than the upstream default (Compass's 3, f, parentheses and braces), its points are matched the same way, within each contour's bounds where the sheet stretched the letter. `repair-weight-masters.ts` carries the repaired packages onto the published bases (below).

The repairs are explicit recipes:

- Hearth K and w retain duplicate anchors at collapsed knees. The caret's inner-apex points merge to remove a 2.52-square-unit source hole. The euro's reversed lower-bar stub is trimmed by an exact Bézier split.
- Dispatch H, U, h and n keep the original positive gaps between facing serif tip groups. The neutral drawing does not change.
- Turnpike slash, backslash, X, closing parenthesis and y have endpoint handles clamped by at most seven units to remove microscopic source crossings.
- Funnies adds the missing dagger and double dagger using the rounded plus outline, preserving its stroke thickness and corners.

Turnpike and Funnies use `local-masters.mjs` with the shared ambient mesh authoring code. A single field moves all ink components together. Exact common subdivision at triangle boundaries gives compatible cubic drawings, and positive triangle Jacobians certify that intermediate maps do not fold. The endpoint changes are approximately −22%/+21% of H ink area for Turnpike and −13%/+13% for Funnies. These are new local drawings, not upstream font instances.

All packages retain the TypeLab and upstream copyright, designer, license and pinned provenance information. Roboto Slab's upstream license is Apache 2; its combined package includes that notice and the TypeLab source's OFL notice.

Geometry reports compare every character's filled components and counters at each master and quarter interval. This finite sampling checks the transferred drawings; it is not a proof of all intermediate curves. The ambient packages additionally record the positive-map certificate. Renderer specimens use each master's actual advances and show all 127 characters.
