# Source finishing

- [x] Ground the current renderer, saved Point frames, and export path.
- [x] Compare a legacy adapter with a separate source finish stage.
- [x] Agree the first pinned policy with the program publisher.
- [x] Implement Shadow and review all 22 bundled styles.
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

The all-style review passed 7,068 glyph cases with no warnings. The slowest glyph took 124 ms and the largest result had 2,725 commands. The three contact sheets in `.audit/masters/finishes/review-{1,2,3}.png` cover all 22 original styles at both depth bounds. Inspection retained readable counters, detached dots, thin punctuation, and script joins. The maximum depth is a display treatment and intentionally reserves more advance. `tools/authored/source-finishes.json` pins this reviewed policy; production preview/OTF agreement is a separate integration gate before the new program revisions ship.

Slice is the next separate unit. Its cuts must preserve untouched cubic segments and state the punctuation policy. Grid materials need a common pitch and spacing rule, plus a measured minimum feature policy that preserves thin strokes without closing counters. Neither becomes available merely because Shadow is enabled.
