# Original outlines and first masters

An original sheet and its first authored master are not interchangeable point bases. Nine styles gained points during weight authoring. Other styles kept the same point counts but changed neutral geometry or the parameterization of straight edges. Relabeling saved original points with the first-master digest can therefore move an otherwise unchanged drawing.

`outline-master-map-v1` records the correspondence for every original glyph in all 22 styles. Each immutable map names one exact `outline-v1` source and its first `masters-v1` package. The origin catalog permits one map for that pair. Later Cotton and Gumdrop basis changes remain separate exact subdivision maps.

## Curve correspondence

Each mapped contour contains an ordered traversal of common source and target intervals. A curve interval names an edge and its start and end parameters. Either side can have extra cuts. This preserves old Pen splits without changing the published master geometry.

A `collapsed` span explicitly pairs one old source point with a target edge. Its duplicate saved point can move independently when a later weight opens that edge. Seven such slots account for Hearth's K/w knees and Bulwark's j/parenthesis corners. Slots at the contour seam retain their cyclic order, including reversed saved contours.

Straight edges have two possible parameterizations in the historical data: a linear line segment or a cubic with controls at its endpoints. `line-distance` correspondence converts a saved point's distance along the old line into the matching target parameter. It also reparameterizes still-straight edited curves to the neutral target controls. Their ink stays identical, and later curved masters do not inherit artificial handle offsets. Genuinely curved user edits retain their controls.

The decoder requires complete contour and edge coverage. It checks exact control geometry, allows the five recorded ambient families' rounding to 0.00001 font unit, and requires an explicit reason for a neutral repair. Original contours must have at least three anchors. The existing saved-point format cannot distinguish both directions of a two-anchor closed contour. Every bundled original contour satisfies this requirement.

## Neutral repairs and saved drawings

The map records these neutral repairs separately from exact correspondence:

| Style | Original glyphs | First-master change |
| --- | --- | --- |
| Hearth | `^`, `€` | Joined the small apex sliver and repaired the bowl/bar attachment. |
| Couture | `*` | Gave each petal its own central tip to remove microscopic fragments. |
| Sonnet | `b`, `p`, `¥` | Moved the recorded attachment anchors and their handles. |
| Bulwark | `‹`, `›`, `«`, `»` | Repaired chevron notches and double-chevron spacing. |
| Turnpike | `/`, `\`, `X`, `)`, `y` | Clamped endpoint handles to remove microscopic cap crossings. |
| Cathedral | `\` | Replaced the wrong slash direction and 127-unit advance with a mirrored slash and 585-unit advance. |

Cathedral's old backslash has nine edges; its replacement has eight. The two old top-terminal edges map to one split target edge. The remaining corners and long sides retain explicit corresponding roles. The old knee remains an editable point.

`rebaseOutlineEdits` returns the saved drawing in the first-master point basis, the first neutral glyph as its reference, and `sourceAdvance - neutralAdvance`. The neutral repair remains part of the saved drawing's offset from that reference. Adoption therefore preserves the old saved ink. Subsequent evaluation adds `master(current) - master(neutral)` to it. Untouched glyphs use the repaired master directly.

Placement is outside the map module. The source interpreter composes a later exact basis subdivision after the original-to-first-master conversion, then compensates the saved placement frame once against that complete reference. This matters because exact curve subdivision can change the control-handle bounds used for side bearings and the rotation center. A neutral repair can also change the advance. The interpreter preserves the old posed drawing and advance, then applies later master motion and current height/placement controls. Missing original glyphs, such as the newly authored Funnies daggers, have no origin-map entry.

## Runtime dependencies

`origin-catalog.ts` indexes maps by the exact original-outline and first-master pair. Program snapshots do not acquire new fields or new bytes. An untouched design loads only its existing program dependencies. A design with saved `Drawn.at.sourceProgram = outline-v1` additionally loads that original source and its origin map. Standalone master designs use the same catalog lookup, and derived bases load the existing first-to-current subdivision as well.

Both browser and server `loadDesignSources` resolve these saved-frame dependencies. A missing or invalid origin map appears in `SourceStatus` as its asset reference and prevents rendering or export with an incomplete correspondence. The browser retains its loading error until retry, then refreshes the editor after the exact pair and payload validate. Export workers resolve the same dependencies before building a font.

Original-sheet points use the original outline digest. A short-lived historical interpreter assigned them the first-master digest instead. When their saved frame still names `outline-v1`, the interpreter normalizes that alias before rebasing. It does not relabel points saved in an actual master or program frame.

## Rebuild and publish

The compiler reads immutable source and first-master packages and reproduces the recorded authoring recipes. Ambient cuts use the original triangle-grid root calculation without recomputing a deformation field. It never changes source or master snapshots.

```sh
node --max-old-space-size=256 --import tsx tools/authored/build-outline-maps.ts
node --max-old-space-size=256 --import tsx --test tests/outline-master-map.test.ts tests/outline-master-fonts.test.ts tests/origin-publication.test.ts
node --max-old-space-size=256 --import tsx tools/authored/publish-outline-maps.ts --from .audit/origin-maps
node --max-old-space-size=256 --import tsx tools/authored/publish-outline-maps.ts --check
```

The compiler writes `.audit/origin-maps/<Style>.json` and a candidate manifest with `{ref, from, to}` entries. The publisher validates every candidate and existing entry before writing `fonts/origins/<digest>.json`, its manifest, and the generated origin-catalog array. It rejects another digest for an existing pair, a target other than the first master for that source, incomplete coverage, undeclared geometry changes, and changed immutable bytes. Repeated publication produces the same files and preserves catalog helpers.

## Verification limits

The current 22 maps cover 2,790 original glyphs and 189,436 common spans. Real-font checks compare every rebased source curve and advance with its original drawing. Focused tests exercise collapsed slots, both contour directions, old straight-line parameters, later curved handles, a real Bulwark parenthesis Pen edit, JSON reopening, and Cathedral's changed backslash advance. A temporary publication root verifies rejection before writes and immutable repeated publication.

These checks establish correspondence and saved-geometry preservation. They do not certify the optical quality of arbitrary user edits or of every future parameter combination. Edges without reliable original provenance retain their saved geometry and continue through the editor's existing fallback transport. Runtime adoption, frame placement, and dependency loading have separate integration tests.
