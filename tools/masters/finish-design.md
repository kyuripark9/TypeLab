# Source finishing

- [x] Ground the current renderer, saved Point frames, and export path.
- [x] Compare a legacy adapter with a separate source finish stage.
- [x] Agree the first pinned policy with the program publisher.
- [x] Implement Shadow and review all 22 bundled styles.
- [x] Implement Slice and review all 22 bundled styles.
- [ ] Implement and review each material before enabling its policy.
- [ ] Replace a design if its geometry or interaction gate fails.

`sourceInstance` evaluates immutable masters, semantic details, saved Points, heights, and pose. Preview and OTF already consume the resulting glyph commands and advance. `Glyph.editable` gives Points the clean source drawing. Finishing therefore belongs after source evaluation and before the glyph is cached, with the same evaluator used by preview and export.

Calling `drawnEffects` directly would reuse generated-letter stem measurements, fixed curve sampling, and coarse grid fills that erase hairline joins. The selected stage takes explicit cap-based dimensions from a pinned `SourceFinishPolicy`. Old manifests have no policy and retain their existing behavior.

The first unit is Solid and detached swept Shadow. Solid returns the exact input glyph. Shadow appends generated ink behind the original commands; it never replaces the authored foreground or the editable projection. Depth is 4–12% of the evaluated cap height, falling down and right at 45 degrees. Size retains its Small-to-Large meaning; Solid is the identity choice. The gap is 1.2% of cap height, measured with square clearance. The glyph advance gains the horizontal depth, and the font needs the matching lower descender allowance.

Clearance expands the filled shape, including counter topology, by two axis sweeps. Independently offsetting contour vertices can create inverted counter holes after a small counter collapses. Adaptive curve flattening uses a 0.04-unit bound only for generated ink. Shadow components below one quarter of the squared gap area are removed together with their holes; source ink is never filtered.

```ts
const plan = compileSourceFinish(policy, params, { capHeight: source.m.cap });
const glyph = finishSourceGlyph(editableGlyph, plan);
// Preview and export consume glyph.cmds and glyph.adv.
// Points consumes glyph.editable, retaining the original advance and provenance.
```

`verify-finishes.ts` writes real SVG/PNG specimens and reports command counts and timing. The default probe covers Mainline, Couture, and Serenade. `--all` checks all 127 glyphs at each family's original weight, plus fragile glyphs at both weight endpoints, at both shadow depths. It verifies exact foreground command identity, unchanged editable curves, finite output, visible shadow, and a clear foreground boundary.

The all-style review passed 7,068 glyph cases with no warnings. The slowest glyph took 124 ms and the largest result had 2,725 commands. The three contact sheets in `.audit/masters/finishes/review-{1,2,3}.png` cover all 22 original styles at both depth bounds. Inspection retained readable counters, detached dots, thin punctuation, and script joins. The maximum depth is a display treatment and intentionally reserves more advance. Shadow programs shipped with production preview and OTF agreement checks.

Slice opens a gap by splitting the source at a horizontal line and moving the upper ink upward. Removing a band erased small punctuation whenever the band covered a whole component. Restoring those components introduced a discontinuity at full coverage. `prototype-slice.ts` compares both designs with opening a gap on Mainline, Couture, and Serenade. Opening preserves every piece of sharp source ink, including dots and hairlines, without a component exception or area threshold.

The reviewed Slice policy allows a gap from zero to 14% of the evaluated cap height. Position moves the split from 12% to 88% of that height. Size zero returns the exact original glyph. The split uses cubic roots and exact curve subdivision; portions away from the split retain their original handles. Horizontal cap edges cancel by winding, including existing source edges on the cut line. This keeps counters open and prevents zero-area retraced tips. Endpoint coordinates stay exact so rounding error cannot break contour joins.

Roundness affects only the new cut corners. Its coordinate moves the contact along the horizontal cap, then solves the source contact inside the available ink. A tangent quadratic, represented as a cubic, joins those contacts. Exact source winding checks retain thin strokes that polygon approximations can misclassify. A valid maximum source setback does not imply that every smaller setback is valid on a curved mark, so each requested contact is solved independently. The resulting corner replaces source ink locally; uncut source corners remain untouched.

Clearance covers the whole removed corner. Point samples alone missed a one-unit counter between samples; they also missed a counter enclosed entirely inside the removed region. The conservative corner envelope now excludes every other source boundary. Cubic roots partition those boundaries into intervals with constant envelope membership. Cap travel stops at the next source contact, including a counter tangent to the cut. The source edges being trimmed must also stay on their side of the fillet's implicit parabola, checked with degree-six Bernstein bounds. A degenerate straight fillet uses a signed half-plane check. The shared tangent contact is an exact double root. These checks reject a candidate contact before it can expose a hole contour as new ink.

Slice adds its gap to the font's top allowance while cap height and x-height continue to describe the editable face. It leaves advance unchanged. Shadow follows Slice and still derives its depth from the original cap height. Points always receives the original editable curves. Earlier Shadow policies ignore Slice values. Explicit adoption resets newly interpreted Slice controls and leaves the existing finish coordinates intact.

`verify-slice.ts --all` checks all 127 glyphs at the original weight and 20 sensitive glyphs at the weight bounds. It covers low, middle, and high positions, sharp and fully rounded corners, and small and maximum gaps. The final run passed 42,408 cases with no issues; the slowest glyph took 59 ms and the largest result had 704 commands. Independent ink probes check the inverse translation of sharp slices and confirm that rounding introduces no ink outside the original face. `--all --intermediate` adds 8,800 cases at intermediate positions and roundness values, also with no issues; its largest result had 716 commands. Six contact sheets in `.audit/masters/slice-guarded` cover all 22 families, including punctuation, counters, and script joins.

The review is reproducible with these commands:

```sh
TYPELAB_SLICE_OUT=.audit/masters/slice-guarded node --max-old-space-size=512 --import tsx tools/masters/verify-slice.ts --all
TYPELAB_SLICE_OUT=.audit/masters/slice-guarded-intermediate node --max-old-space-size=512 --import tsx tools/masters/verify-slice.ts --all --intermediate
node --import tsx --test tests/source-finish.test.ts tests/source-finish-integration.test.ts
```

`tools/authored/source-finishes.json` pins the reviewed policy. Slice is published for all 22 bundled styles. The 17 finish unit tests and eight production integration tests pass. The integration checks cover unchanged older revisions, explicit adoption and undo, per-letter top allowance, the Style page's Adjust action, saved Points reopening, and combined Slice/Shadow OTF paths and advances matching the preview.

Grid materials remain a separate unit: they need a common pitch and spacing rule, plus a measured minimum feature policy that preserves thin strokes without closing counters. They do not become available merely because Shadow or Slice is enabled.
