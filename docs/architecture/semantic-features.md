# Authored semantic features

Hearth and Couture now expose authored features in single-letter scope. Their programs enable `crossbar` for `H` and `A`, `tail` for the `R` leg, and `terminalLength` for `c`. These controls remain unavailable in **All letters** scope and on other characters. Terminal length preserves the existing terminal construction.

Vellum, Almanac, Compass, Dispatch, Kernel, Orbital, and Bulwark also publish `H` crossbar height in single-letter scope. Their other feature regions remain unreviewed.

Mainline has a reviewed feature asset, but its published program references only its native-width asset. Combining those assets awaits the interaction drawings described below. The registry rejects native width with a `base-only` feature asset before a program becomes ready.

Document version 10 supports these pinned programs. New Hearth and Couture designs start with neutral feature values. Existing source designs require explicit, undoable adoption. The [source program contract](source-program-contract.md) describes loading and adoption.

## What the current evaluator supplies

`shared/source/masters.ts` interpolates compatible glyph curves and advances. `shared/source/instance.ts` applies the supported height map and pose. `shared/source/edit-transport.ts` retains each point's source glyph, cubic, and parameter through generated height cuts, Pen subdivisions, reversal, and saved edits. Preview and export consume that same evaluator.

A semantic feature describes existing source curves and their permitted movement. Authoring recipes bind exact source node indices to an immutable master digest and glyph. Those bindings remain valid throughout that package's compatible weight range. Runtime does not reconstruct letters or detect their anatomy.

## Caller's view

```ts
const data = parseFeatureMasters(payload);
const features = decodeFeatureMasters(data, { ref: baseRef, masters });
const font = evaluateFeatureMasters(features, {
	baseline: interpolateMasters(masters, 650),
	weight: 650,
	width: 'base',
	values: { crossbar: .5, tail: .8, terminalLength: .5 },
});
```

The authoring tool compiles and reviews endpoints. Its prototype coordinates range from -1 to 1, with zero neutral. The production evaluator uses the existing parameter range 0..1, with 0.5 neutral. The master package owns the neutral drawing.

## Authoring recipes

Each recipe owns its anatomy and optical choices. Crossbars move both boundaries together. On diagonal stems, their ends follow authored stem rails to retain attachment depth. Legs leave their departure port fixed and change the distal portion while keeping the baseline. Terminal regions move along an authored direction with a fixed shoulder port and tangent. Flat, slab, and ball terminals retain their own construction. The terminal pilot changes their extension, not their construction palette.

Leg endpoints also own advance changes. Named tail and body extent anchors preserve the source's right bearing, including a source's intentional overhang. An independent review caught that geometry-only leg edits would push Mainline's right edge about 20 units beyond its unchanged advance. The compiler now stores advance deltas; evaluation and specimens use them, and unspaced `RR`, `RH`, and `Rc` expose spacing problems.

The public evaluator handles endpoint interpolation, delta accumulation, and provenance tagging in one call. Recipe-specific authoring operations stay in the compiler. Ports retain their adjacent handles, and named clearance spans provide measurements and future inspector targets.

## Alternatives and synthesis

Two structurally different designs were compared before implementation. Compatible endpoint patches were selected because their entire output is reviewable, each weight can receive optical corrections, and evaluation uses the existing interpolation model. Their cost is authoring the affected glyph coverage and interaction drawings.

Authored deformation cages would store a local frame, a boundary cage, and pinned attachment points. They can express a large continuous interval with less asset data, but runtime must solve the field, preserve curve precision through its nonlinear portions, and maintain clearances. Earlier smooth weight-flow attempts showed that an invertible continuous field can still produce invalid filled ink when approximated by long cubics. Cages remain an offline authoring tool; they are not the source evaluator's contract.

The selected design takes explicit attachment ports and region ownership from the cage approach. Independent review added leg metrics, consistent weight-range rejection, port tangents, clearance spans, and explicit coverage. Weight-only patches remain limited to neutral authored width until interaction corners are reviewed.

## Ordering and local edits

`shared/source/instance.ts` evaluates weight, applies feature patches in source coordinates, and then applies the exact height map and pose. Saved Points edits move between the complete feature-evaluated baseline at save time and the complete current baseline. `Drawn.at` retains the saved program reference and feature coordinates, including per-letter overrides.

Point identities retain the weight-master digest, glyph, contour, segment, and curve parameter. A feature asset or program revision does not change that basis. Height cuts, Pen subdivisions, contour reversal, and repeated saves retain their source correspondence. Genuinely new geometry uses spatial transport rather than unrelated array indices.

`designSourceRefs` collects the current reference and every saved `Drawn.at.sourceProgram`. Client preview and server export load all those references and their dependencies. A missing saved baseline leaves the design unready and blocks export instead of substituting the current baseline.

Feature and width interactions are not automatically additive. These recipes were reviewed with geometric width scaling and height maps, at neutral authored width. An authored width grid needs feature patches at its interaction corners, or evidence that the recipe commutes with that axis. Larger terminal conversions and alternate `R` or `a` constructions remain discrete forms with their own compatible drawings.

## Release boundary

The compiler checks each explicit binding against the package digest and compatible curves. Review must show unchanged neutral geometry, fixed ports where declared, retained point provenance, finite metrics, and the intended direction of each edit. Filled-ink topology, minimum attachments/openings, and rendered specimens must be checked at feature, weight, and height extremes and selected intermediate values. Connectivity alone does not establish good type.

The authoring report distinguishes affected, reviewed-unaffected, and unreviewed characters. Production capabilities list only the affected characters. All remaining pilot characters are unreviewed. Partial coverage enables targeted letter editing; it does not establish whole-font parity.

## Prototype evidence

Run `node --max-old-space-size=512 --import tsx tools/authored/feature-masters.ts`. It writes compiled drawings, reports, labelled SVG specimens, PNG specimens, and point/port annotation sheets to `.audit/masters/features`. The three bindings pin the current Mainline, Hearth, and Couture master digests. A changed master revision requires an explicit binding review.

The first sweep checked 1,620 glyph/weight/feature/height combinations with no topology, neutral-identity, provenance, clearance, or bearing failures. Each existing weight master and its midpoints was checked at feature values -1, -.5, 0, .5, and 1 with three increasing height maps and two additional width scales. The narrowest measured A-bar outer margin was 3.06 units in Mainline. This constrains future range expansion even though the letter would remain connected beyond that boundary.

Display and 24-pixel cap-height specimens were inspected for all four affected letters at the light, neutral, and heavy weights, with unspaced `RR`, `RH`, and `Rc`. A Couture terminal close-up exposed a defect the topology sweep did not catch: shortening its upper `c` ball by 25 units folded the fixed neck's control polygon. The revised recipe limits shortening to 8.6 units while retaining about 25 units of extension, and adds explicit inner/outer neck-handle ordering constraints. The Couture-only 300-case recheck passed and the revised close-up retains a smooth neck. Its smallest transformed handle-order margin is 0.75 units, above the authored 0.5-unit guard.

The final report set covers 1,620 distinct combinations; Couture's 300 cases were rerun after the optical repair. These samples support the published glyph coverage, not the entire continuous domain or authored-width variations. Different controls that touch the same region require explicit interaction drawings.

An independent runtime review covered 32 Hearth and Couture cases with reversed contours, Pen splits, non-neutral heights, mirrored and rotated placement, feature and weight changes, and repeated saves. Maximum anchor error was `4.55e-13`, cubic-area error was `2.91e-10`, and advance error was zero. The local reproduction command is `node --max-old-space-size=512 --import tsx .audit/masters/runtime/feature-points-review.mjs`.

That review also found a fresh-process loading bug. A saved Hearth `R` retained an earlier feature program in `Drawn.at`, but reopening loaded only the current weight reference. The missing feature baseline changed its advance from 686 to 732.448745869. The dependency loading above fixes the error. `tests/source-reopening.test.ts` now verifies exact reopening and OTF output in separate processes; `tests/source-loading.test.ts` checks retry and redraw when the saved baseline arrives.

## Production asset boundary

`shared/source/feature-masters.ts` provides the sparse asset parser, dependency binding, coverage query, and evaluator. `tools/authored/build-features.ts` compiles the reviewed recipes into immutable files under `fonts/features`; `--check` verifies regeneration and the manifest without writing. `tools/authored/build-programs.ts` publishes the selected dependencies and per-letter capabilities. The registry, evaluator, and editor adoption action are connected.

The `feature-masters-v1` payload pins its complete `MasterSourceRef`, a weight interval, `base-only` width compatibility, and a list of controls. Each control lists its affected glyphs and their low/high endpoint drawings at each weight sample. Packed glyphs include advances. The asset contains neither the full weight font nor a duplicate neutral font. Existing parameter coordinates use 0..1 with 0.5 neutral.

`parseFeatureMasters` validates the wire format. `decodeFeatureMasters` binds the exact base kind/digest/font ID, validates compatible contours and handle presence, and requires samples at every base weight knot inside the interval plus both interval endpoints. It rejects unchanged coverage and conflicting coordinate or advance writes by different controls. This proves compatible correspondence and non-overlap; joint optical quality still requires authoring review.

`evaluateFeatureMasters` adds endpoint deltas to the supplied complete canonical baseline. It preserves that baseline's offsets, advances, other metrics, and unaffected glyph objects. All-neutral values return the identical baseline even outside the feature interval. Active values require the reviewed interval and neutral authored width. New point provenance names the immutable base digest and glyph, never the feature asset revision. Height maps, pose, and saved Points edits follow this stage.

`featureSupportedGlyphs` exposes exact per-control coverage. Hearth and Couture publish the covered controls in single-letter scope. Mainline's feature asset remains unpublished in a program until the following interaction work passes. Both the program builder and registry reject the incompatible combination.

## Broad coverage inventory and H batch

`tools/authored/feature-coverage.ts --inventory` enumerates 46 candidate regions in each of the 22 bundled styles. The generated `.audit/masters/features-broad/inventory.json` records the pinned base, contour sizes, required attachments, interacting controls, and review state for every region. A candidate is an authoring task, not a claim that every style has the same anatomy. A missing or alternative form requires an explicit review.

The inventory includes bars and waists in `ABEFHPRaeft4`, tails and hooks in `JQRfgjty`, paired terminals in `CcSs`, and exposed ends in `GJaefgjrty235679&?`. Each terminal task first identifies the actual exposed ends. Regions such as the `R` waist and leg share geometry and need joint drawings before their controls can compose.

The next batch authors `H` crossbar height in nine additional families. Both bar boundaries move by the same amount, up to 10% of cap height in each direction. Joined bars retain their paired boundary handles; separate bars follow explicit stem rails. Fixed stem regions, bar thickness, and advance remain unchanged. This reuses compatible endpoint drawings without adding runtime anatomy detection.

| Style | H binding and review state |
| --- | --- |
| Mainline | Reviewed pilot; feature program awaits native-width interactions. |
| Hearth | Reviewed pilot; enabled in single-letter scope. |
| Couture | Reviewed pilot; enabled in single-letter scope. |
| Sonnet | Slanted stem rails authored; held for insufficient neutral overlap. |
| Vellum | Reviewed joined bar, including its curved transitions. |
| Almanac | Reviewed joined bar with fixed serif regions. |
| Parlance | Reviewed joined bar; feature program awaits native-width interactions. |
| Cotton | Reviewed joined bar with fixed rounded stem ends. |
| Gumdrop | Separate bar authored; held for opposite-winding neutral components. |
| Jotter | Needs local frames for handwritten joins and the curved bar. |
| Compass | Reviewed joined bar. |
| Dispatch | Reviewed joined bar with fixed slab-serif regions. |
| Funnies | Needs bindings over the subdivided handwritten curves. |
| Kernel | Reviewed joined bar. |
| Orbital | Reviewed separate bar with explicit stem overlap. |
| Turnpike | Needs grouping of subdivided straight spans. |
| Ballyhoo | Needs grouped spans and high-contrast join clearances. |
| Boardwalk | Needs a script attachment frame for the loop and connector. |
| Cathedral | Needs an identified bridge and protected angular counters. |
| Serenade | Needs shared entry, exit, and flourish attachments. |
| Timber | Needs grouped spans and heavy slab-serif join clearances. |
| Bulwark | Reviewed joined bar. |

The nine new families pass 975 sampled weight, feature, and height cases. Display and 24-pixel specimens retain connected joins and their original stroke construction. An independent review also checked Vellum and Bulwark. The compiler pins each accepted asset's SHA-256 in `CROSSBAR_REVIEWS`; altered output requires a new review. Seven families publish the H control. Parlance awaits native-width interactions, and Cotton awaits its new compatible width basis. Existing immutable feature files remain unchanged.

The full 1,095-case candidate run reports 80 held cases. Gumdrop fails the explicit one-piece, zero-counter H requirement in all 75 cases: its opposite-winding left stem cancels the bar overlap. Sonnet fails five clearance cases at weight 400 because its unchanged right attachment measures 1.687 units after the narrow scale, below the 2-unit requirement. Comparing only with the neutral topology would miss Gumdrop's existing defect, so the batch also checks the intended filled shape. Neither failure is waived.

The staged approved manifest is `.audit/masters/features-broad/approved.json`. Reproduction commands are:

```sh
node --max-old-space-size=512 --import tsx tools/authored/feature-coverage.ts --inventory
node --max-old-space-size=512 --import tsx tools/authored/feature-coverage.ts --approved --review --render
```

`--check` regenerates reviewed candidates referenced by the program catalog and compares their published bytes without writing. It skips reviewed but unpublished assets and runs as part of `npm run programs:check`.

Omitting `--approved` includes the two held candidates and returns a failing review status. The eight unbound H drawings need explicit curve spans that include every compatible subdivision, with fixed ports at both ends. Moving a selected y-band would leave intermediate points behind or distort the joins. Those spans provide the next reusable authoring step before broader bars, hooks, and terminals.

The inventory finds all 467 original H anchors exactly among those eight styles' 2,155 master anchors. This supports binding original curve spans and transporting their exact subdivision parameters. Two Funnies anchors have ambiguous coordinate matches, so contour order and curve direction must also establish correspondence.

## Gumdrop H candidate repair

`tools/authored/repair-gumdrop-h.ts` reverses only the left-stem contour of H and swaps its incoming and outgoing handles. It applies the same repair at every weight and native-width knot. Every curve and advance remains exact, and other glyphs remain unchanged. The changed winding makes the existing bar overlap add ink instead of cancel it.

The compiler checks 288 H edges against their original control points. The independent Python verifier checks 215,820 points across all weight knots and midpoints, with zero coordinate error, complete parameter coverage, and unchanged metrics. Its report is `.audit/width/Gumdrop-subdivision-review.json`.

The candidate files are in `.audit/masters/gumdrop-h-repair`; `manifest.json` pins the new weight, width, and feature assets. `binding.json` records every new segment's original segment and parameter interval. For the reversed contour, new segment `j` maps to old segment `(N - 2 - j + N) % N` from parameter 1 to 0. Future adoption must use that correspondence rather than treating the reversed indices as unchanged points.

The repair passes 25 native-width H cases and 75 crossbar/height cases. Every tested H has one filled piece and no counter, and its advance stays unchanged. Display and 24-pixel specimens show the left join restored without changing the stems or bar shape. Before and after images are `.audit/masters/features-broad/Gumdrop.png` and `.audit/masters/gumdrop-h-repair/after.png`; `review.json` records the geometry checks.

The repair remains unpublished until runtime point mapping can preserve edits across the new basis. Existing production program and master references remain unchanged. The candidate feature asset remains restricted to neutral authored width; it does not claim reviewed width-and-crossbar interactions. Reproduction uses `node --max-old-space-size=512 --import tsx tools/authored/repair-gumdrop-h.ts --review --render`.

## Next: Mainline feature and width interactions

The first joint asset should use the exact published Mainline width dependency and its compatible point basis. Its width knots are 75, 87.5, 100, 125, and 150, and its weight knots are 300, 400, 500, 600, 700, and 800. This gives 30 weight/width cells and 240 H/A/R/c low/high endpoint drawings.

1. Compile each feature against that cell's complete width-evaluated baseline. Re-evaluate the authored bar rails, leg departure and metric anchors, and terminal ports in that baseline. Preserve the existing width-100 feature drawings exactly. Do not scale the current weight-only deltas by a width ratio.
2. Check the narrow/heavy corners first. A-bar outer margins, c aperture, R departure overlap, and right bearing can become limiting even when point correspondence is unchanged. Add optical corrections to the affected cell drawings; keep one reviewed control interval across the grid.
3. Publish a joint feature format that pins both the weight basis and exact `WidthMasterRef`. Store complete feature endpoint coverage at all width and weight knots. Its runtime delta is relative to the same joint baseline; the stable Points basis remains the original weight-master digest and glyph.
4. Validate the 11 weight samples and nine width samples formed by all knots and interval midpoints, five feature values, four affected glyphs, and three height maps: 5,940 combinations. Inspect 24-pixel and display specimens, including unspaced `RR`, `RH`, `Rc`, and `cc`. Test saved Points edits and export against the complete feature-plus-width baseline.
5. Publish a combined Mainline program only after those checks pass. If the width authoring range grows, its new extreme columns need feature endpoints and review before inclusion. Keep the current separate programs immutable for saved documents. Then apply the same authoring method to additional styles and character coverage.
