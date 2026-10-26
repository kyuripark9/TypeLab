# Joint weight and width masters

Mainline, Parlance, Gumdrop, and Cotton have published joint weight and width masters. Mainline, Parlance, and Gumdrop carry designed width changes from their pinned upstream fonts into the TypeLab families. Cotton uses newly authored local width drawings. The production assets live in `fonts/widths`; immutable manifests in `fonts/programs` pin each width asset and its compatible `masters-v1` base.

| Style | Upstream | Existing weights retained | Published width samples | Neutral slider position |
| --- | --- | --- | --- | --- |
| Mainline | Roboto | 300, 400, 500, 600, 700, 800 | 75, 87.5, 100, 125, 150 | 1/3 |
| Parlance | Open Sans | 300, 400, 500, 600, 700, 800 | 75, 87.5, 100, 125, 150 | 1/3 |
| Gumdrop | Fredoka | 500, 600, 700 | 75, 100, 125 | 0.5 |
| Cotton | Nunito, local width drawings | 200, 300, 400, 500, 600 | 85, 100, 115 | 0.5 |

Width values are design coordinates, not a geometric percentage to multiply into a glyph. The native samples use upstream `wdth` coordinates: Mainline and Parlance supply 75–100, and Gumdrop supplies 75–125. Mainline and Parlance's 125 and 150 drawings and Cotton's 85 and 115 drawings are local designs, described below. The full slider interval 0–1 covers the published range. Earlier native-only Mainline and Parlance programs retain their 75–100 range and endpoint neutral.

All four current programs include reviewed H crossbar motion across width and weight. Cotton's shared curve cuts and Gumdrop's H winding repair use new base revisions with [exact saved-edit mappings](master-basis-revisions.md). The earlier sources, masters, widths, and programs remain available unchanged.

## Preserve the existing family

Let `P(w)` be the current TypeLab master at weight `w`, and `U(w,d)` the original upstream drawing at weight `w`, width `d`. The candidate is:

```text
C(w,d) = P(w) + mapped[U(w,d) - U(w,100)]
```

Correspondence is established once between the original-width neutral drawings. Mainline and Parlance use the same cyclic point/contour alignment as their weight authoring. Gumdrop uses monotone contour correspondence where its edited node structure differs, plus the explicit field recipes below. That correspondence remains fixed across the grid. There is no nearest-contour search when evaluating an instance.

This preserves the authored weight residual: existing repairs and stylistic edits are already in `P(w)`. It also carries the upstream interaction between weight and width, because the width difference is calculated separately at every weight. It does not add one universal width vector to every weight.

At width 100 the tool returns each existing master data object without modifying its curves or spacing. At intermediate weights along that width, it delegates to the same weight interpolator. This guarantees an unchanged neutral-width family in the prototype representation, rather than merely matching the original default weight.

Other coordinates use bilinear interpolation between adjacent weight and width samples. No extrapolation is allowed. The pinned fonts have identity width `avar` maps (Roboto/Open Sans), or no `avar` table (Fredoka); their weight mappings are evaluated by fontTools before extraction. The prototype's existing weight knots still define its interpolation, as they do in the published weight family. Additional samples may be needed if shape review identifies nonlinear behavior between these knots.

## Module ownership and data

- [extract-width-masters.py](../../tools/authored/extract-width-masters.py) verifies the upstream font digest and extracts the existing package's exact weight knots and character set at each width. It reuses the established exact quadratic-to-cubic extraction pen.
- [width-masters.ts](../../tools/authored/width-masters.ts) owns prototype parsing, fixed correspondence, delta transfer, interpolation, topology review, stem measurements, and rendered comparison sheets.
- [review-width-heights.ts](../../tools/authored/review-width-heights.ts) projects the candidates through the existing height/x-height maps, including reviewed dot handling, and produces interaction specimens at 16px and 42px cap height.
- [build-programs.ts](../../tools/authored/build-programs.ts) converts reviewed candidates into compact production width assets and publishes their program manifests.
- [shared/source/width-masters.ts](../../shared/source/width-masters.ts) parses and interpolates production grids. [shared/source/program.ts](../../shared/source/program.ts) validates the manifest; [source evaluation](../../shared/source/instance.ts) applies its geometry.

The review format, `weight-width-prototype-v1`, contains a pinned `base: MasterSourceRef`, its original outline reference, default weight, `WidthAxis { min, neutral, max }`, and compatible `WidthSample { weight, width, data }` entries. The production `width-masters-v1` format retains the base, axis, provenance, and notes, but stores only non-neutral columns of `{ width, masters: [{ weight, space, glyphs }] }`. It reads the neutral column from the pinned base and does not repeat font metadata. Publishing a width program never overwrites its original outline or weight package.

The parser requires the same ordered weight coordinates in every width column, identical character coverage, and corresponding contours, nodes, and handle presence. Each width column also passes the existing weight-master parser. The neutral-width values preserve the current package's credits and all upstream provenance accompanies the candidate.

## Reproduce

Run from the repository root after downloading the [pinned upstream files](../../tools/masters/SOURCES.md). The extractor accepts `--upstream-dir` or `TYPELAB_MASTER_UPSTREAM`; it defaults to `.tools/master-upstream`.

For the native transfer, select the original master revision by its digest in `fonts/masters/manifest.json`, then run one style at a time. Cotton uses the local compiler below.

```sh
python3 tools/authored/extract-width-masters.py \
  fonts/masters/WEIGHT_PACKAGE_DIGEST.json \
  .audit/width/STYLE-upstream.json

node --max-old-space-size=512 --import tsx tools/authored/width-masters.ts \
  fonts/masters/WEIGHT_PACKAGE_DIGEST.json \
  .audit/width/STYLE-upstream.json \
  .audit/width/STYLE-prototype.json
```

The second command writes the prototype, a `.review.json` report, and `.png`/`.svg` specimens. `WIDTH_REVIEW_CHARS=HnoagRjyus\&@%` can narrow an initial diagnostic run; omit it for all-character review. Do not publish a candidate based only on a diagnostic subset.

Run `node --max-old-space-size=512 --import tsx tools/authored/review-width-heights.ts .audit/width/STYLE-prototype.json` for the height interaction report and specimens at both width extremes. `WIDTH_REVIEW_TEXT` accepts specimen text with newlines; `WIDTH_REVIEW_WEIGHTS` and `WIDTH_REVIEW_WIDTHS` select rendered coordinates without changing the geometry review. `WIDTH_REVIEW_SIZE` sets the specimen cap height in pixels.

After a candidate passes geometry and optical review, publish and verify it:

```sh
node --max-old-space-size=512 --import tsx tools/authored/build-programs.ts \
  --width .audit/width/STYLE-prototype.json
npm run programs:check
```

The publisher checks exact neutral-column equality against the referenced weight package before writing the content-addressed asset and program manifest. `programs:check` verifies published assets and references; it does not replace the candidate's optical review.

When a new basis also needs replacement width and feature assets, publish the complete dependency set with `--width-asset`, `--feature-asset`, and `--program`. The [basis revision guide](master-basis-revisions.md#publication) gives the command order. Publishing one asset over an incompatible earlier basis is rejected.

## Gumdrop correspondence repairs

The edited source merges components that the upstream font stores separately. Twenty-three glyphs differ in contour count. The explicit field recipe covers those glyphs plus `6`, `/`, and `®`, whose point/contour correspondence produced bad width changes. Each source anchor and handle has fixed coefficients in a local affine displacement field fitted to 24 nearby upstream curve samples. The field carries actual upstream width deltas at the current weight; it is not a generic weight offset or an x-scale. This is an approximation and its sampled topology checks are not a positive-Jacobian proof.

- Handles that collapse onto their anchor at a particular weight stay there. Without this constraint, condensation opened a 3.95-unit² spurious hole at the `R` leg.
- The expanded upstream slash has its cyclic starting point displaced by six nodes relative to the neutral outline. Aligning that endpoint before interpolation preserves its exact ink and prevents the interpolated slash from collapsing.
- The `®` inner R counter has its own contour correspondence. Its joined outer construction follows the field. A single field over the whole sign distorted that counter at the expanded end.

No character is frozen to avoid a failing width change. These recipes are recorded in the candidate notes and leave neutral width unchanged.

The current Gumdrop revision also reverses H contour 2 at every weight and width. Its left stem previously canceled overlapping bar ink because that contour had the opposite winding. The repair retains every curve and advance and changes the fill only at that overlap. Its exact reversed-interval map lets older Points edits adopt the repaired basis without replacing their geometry.

## Review contract

The review evaluates every grid node and the midpoint of every weight/width interval, including mixed cell interiors. It compares actual nonzero-filled components and counters against the current family at the same weight. It also checks exact neutral-width equality at every sampled weight. This is regression evidence, not a proof over the whole continuous domain.

The comparison sheet places the authored condensed drawing beside a geometrically scaled original with the same `H` ink width. The report measures `H` stem widths at one-quarter cap height. A useful width variation reduces body width while preserving more stem strength than geometric scaling. That measurement does not replace visual review of bowls, spacing, tails, joins, or punctuation.

When the transfer produces a bad join or corner, the next step is an explicit local repair or a narrower reviewed range. Do not silently freeze that glyph, independently reduce its requested width, or replace the candidate with geometric scaling.

## Production behavior

New designs use the latest published program for these four styles. The Width control displays authored axis coordinates. Mainline and Parlance reset to 100 one-third along the expanded slider; Gumdrop and Cotton reset to 100 at the midpoint. The older native-only programs reset at the maximum. A displayed coordinate is not an identical body-width ratio for every glyph, as the `H` measurements below demonstrate.

Older saved designs retain their original source and geometric width behavior. Explicitly adopting the newer program resets the width to its authored neutral, is undoable, and retains saved Points edit frames. It does not apply the old geometric x-scale over the authored width change.

Adoption from an earlier authored-width program preserves its actual width coordinate, including per-letter overrides. A changed point basis requires the target program's exact transition map. Saved Points frames retain their original source until a new edit is saved; evaluation splits and remaps those curves before applying the new program's motion.

Preview, per-letter overrides, Points edit transport, family instances, and export use the same grid evaluation. Authored segment provenance carries local edits as corresponding curves change. A weight/width interaction is one evaluated drawing.

The prototype currently uses a rectangular domain. If a problematic corner cannot be repaired, represent a smaller coherent rectangle or an explicitly supported region; do not clamp individual glyphs independently. Broader contrast, alternate-form, and serif work remains covered by the [feature parity map](feature-parity.md).

## Reviewed results

| Style | Grid drawings | Weight × width glyph cases | Height/x-height interaction cases | `H` body width at narrow endpoint | `H` stem thickness retained |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mainline | 18 | 6,985 | 6,096 | 85.67% | 97.26% |
| Parlance | 18 | 6,985 | 6,096 | 72.27% | 92.52% |
| Gumdrop | 9 | 3,175 | 4,572 | 78.56% | 100% |

The stem measurements use each family's default weight. Plain scaling to the same body width would retain only the body-width percentage of stem thickness. Gumdrop's native expanded endpoint reaches 149.49% of the default `H` body width while retaining its stem thickness.

All 33,909 sampled geometry cases pass, and the neutral-width family is exact at every sampled weight. Full-character specimens and mixed weight/width specimens were inspected, along with height/x-height specimens at both sizes. Height projection keeps extenders and descenders neutral; this is not a claim about every combination of every height control or a new optical height designspace.

`npm run typecheck` passed for the authoring tools. A small literal-coordinate probe also passed for mixed interpolation, the neutral edge, full slider mapping, out-of-range rejection, and incomplete-grid rejection. Candidate packages and reports remain under `.audit/width/`; the three native grids have been converted and published. Production tests cover Points transport and OTF output as well as grid evaluation. The original weight packages remain unchanged.

Mainline and Parlance's expanded endpoints restore a useful wide range. They are labeled as new local designs, reviewed across weights and heights, and stored separately from the native review files. New immutable program revisions include them; the native programs remain available to saved designs.

## Local expansion investigation

[expand-width-masters.ts](../../tools/authored/expand-width-masters.ts) writes a separate candidate with local width coordinates 125 and 150. Its initial premise was that the full native condensed displacement could simply be reversed. Both that attempt and a second attempt constraining curve handles failed in the same Mainline glyphs: `o` and `g` each held 41 failures in the diagnostic grid. The census and rejected report are retained under `.audit/width/rejected-expansion/`.

The cause was anchor ordering: reversing the upstream vertical adjustments swapped endpoints of short vertical bowl spans. Handle constraints could not repair reversed anchors. The revised local recipe changes horizontal coordinates only, preserving every vertical coordinate of the existing weight family.

Parlance's first full grid exposed 14 remaining failures in `®` and the heavy `v`. Its repair preserves the weight-specific inner-apex shape of `v` while translating it with the aperture center. The registered sign expands both ring boundaries by the same horizontal radius increment, preserving side-stroke thickness and centering the inner R in the larger advance. The repaired grid passes.

Both expanded candidates now pass 12,573 full-character mixed-grid cases and 10,160 height/x-height cases each. Full-character sheets at weights 300 and 800, width 150, were inspected at 16px and 42px cap height, along with mixed-width words and height specimens at both width extremes. At default weight, width 150 gives Mainline an `H` body width of 128.67% and stem thickness of 105.49%; Parlance reaches 155.46% and 114.95%. These are local designs with some optical stroke change, not exact stroke-preserving scaling.

The reviewed files are `.audit/width/Mainline-local-wide.json` and `.audit/width/Parlance-local-wide.json`. Their individual reports and specimens accompany them; `.audit/width/local-expansion-review-summary.json` records their digests and checks. New production width assets and program revisions now contain these drawings. The native candidate files and earlier production assets remain unchanged.

Reproduce a local candidate without changing the native file:

```sh
node --max-old-space-size=512 --import tsx tools/authored/expand-width-masters.ts \
  .audit/width/Mainline-prototype.json .audit/width/Mainline-local-wide.json 125,150
```

## Coverage beyond the three native width families

The remaining families need local width drawings. Borrowing another family's letter shapes would defeat style identity. A generic x-scale retains topology but changes stroke thickness; a sharp piecewise x-map can retain topology while putting visible tangent breaks into round letters. Neither is an adequate authoring result by itself.

Use reviewed horizontal regions and paired stroke boundaries to construct smooth endpoint drawings. Dense vertical stems receive little horizontal scaling; counters, shoulders, and inter-stem space absorb more of the width change. Smooth transitions preserve round shapes. Dots and similar small components keep their shape and move with explicit anchors. Automatic analysis may propose these regions, but a family recipe must own them before release.

| Family group | First useful local recipe | Required optical review |
| --- | --- | --- |
| Cotton, Compass, Orbital, Turnpike, Funnies | Paired stems and counter-space changes; round/dot preservation; family-owned spacing | Round `O/o`, joins in `a/e/g`, `R/Q/y` tails, numerals, and punctuation at both weight extremes |
| Hearth, Timber, Ballyhoo, Bulwark | Stem/counter width regions with explicit inner-serif gaps and attachment spans | Facing slab tips, `H/M/W/m`, bowl/stem joins, black weights, and narrow counters |
| Couture, Sonnet, Vellum, Almanac | Conservative width endpoints with separate hairline, bowl, serif, and tail regions | Hairline consistency, contrast rhythm, roundness, italic joins, and small-size text |
| Kernel, Dispatch | Coordinated cell-width and ink-width changes, preserving a common advance | All glyphs fit the cell; `M/W/@` and wide punctuation retain clearances; narrow letters remain optically centered |
| Jotter, Boardwalk, Serenade | Width motions bound to entry/exit anchors and flourish regions | Whole words and repeated connections, not just isolated glyph topology |
| Cathedral | Stem rhythm, counter openings, and explicit diamond/terminal regions | Repeated vertical texture, blackletter joins, tight counters, and baseline details |

This is a rollout order by construction, not a claim that one recipe automatically validates every family. Begin with a useful moderate range, then enlarge it through additional endpoint drawings and per-feature corrections. Each published range must cover the complete affected character set at every supported weight.

Prefer the existing compatible node structure. If a smooth endpoint cannot be represented to the declared geometric tolerance without subdivision, add common exact cuts to every weight and width drawing, preserve source-segment origins, and publish a new compatible base revision. A width column cannot gain nodes while continuing to reference an incompatible unchanged base. The old source snapshot remains available.

For each family, record stem and counter measurements, aperture and serif clearances, spacing, continuous curve quality, and text/display specimens. A positive map or a passing component count is useful structural evidence; it is not proof that the resulting font is usable. The native width work and the local expansion failures both demonstrate why the endpoint drawings need optical review.

## First local width compiler

[local-width-masters.ts](../../tools/authored/local-width-masters.ts) implements the first reusable local recipe. Cotton's published program uses its reviewed coordinates 85, 100, and 115. Other families require their own recipes and optical review.

Two constructions were considered. Explicit segment frames can translate paired stems, stretch crossbars between attachment ports, and fit the transitions; they expose local ownership well but require bindings for each glyph. The initial reusable compiler instead measures horizontal ink occupancy and integrates a smooth positive speed field: dense vertical strokes absorb less change, while counters and the gaps between stems absorb more. A family recipe owns the range, smoothing, rigid glyphs, and dot bindings. Per-glyph segment frames remain an option when this field cannot preserve a particular construction.

The field is smooth across its sampling knots. A uniform-motion floor is derived from the minimum derivative bound when a glyph has too little counter space to absorb the requested change; this keeps the same requested body width without concentrating motion into a fold. Endpoint derivatives carry through the transformed curves, so fitting does not introduce the tangent breaks seen with a sharp piecewise-linear x-map. The tool adaptively subdivides all corresponding weight and width drawings at common parameters, then fits cubic endpoints and tangents to a declared sampled error tolerance. Every vertical coordinate remains unchanged. Rigid punctuation and simple vertical constructions retain their ink shape while their spacing changes; separate dots translate with their letters.

The public authoring operation is `authorLocalWidths(original, from, recipe)`. It returns a new compatible weight base, a width prototype, numerical checks, and a `master-subdivision-v1` binding. Each new segment records `{ segment, t0, t1 }` on the old contour. Straight edges use the same linear cubic parameterization as Points transport. Neutral curves are exact subdivisions, and the compiler checks their reconstruction against the original curves. The binding must accompany any future adoption path; a new base digest cannot silently inherit old contour/node identities.

[review-subdivision.py](../../tools/authored/review-subdivision.py) independently verifies that binding using direct Bernstein evaluation, without importing the authoring geometry code. It checks content digests, complete source-parameter coverage, unchanged metrics, and curve samples at every weight knot and midpoint. Reversed intervals also support exact contour-winding repairs.

The minimum map derivative certifies the underlying horizontal field. The cubic approximation still needs topology, clearance, and optical review; sampled fit error is not a continuous-domain proof.

The current Cotton candidate passes 5,715 mixed-grid and 6,096 height/x-height cases. Its default-weight `H` body widths are 85% and 115%, while stem thickness stays at 98.18% and 101.82%. The underlying map derivative stays above 0.2000028. Maximum sampled curve-fit error is 0.024999 font units; neutral reconstruction error is below 5.1 × 10⁻¹³ units. The independent verifier passes 701,946 points across nine weight knots/midpoints, with maximum error below 3.22 × 10⁻¹³ units and complete source-parameter coverage. Shared subdivision increases the family from 2,900 to 8,666 nodes, with an explicit interval binding for each new segment.

Final full-character and punctuation sheets at weights 200 and 600, both width extremes, and 16px/42px cap height were inspected. Mixed-weight words and height specimens retain Cotton's rounded construction. The render CLI and `npm run typecheck` pass. Cotton's published program includes the new point basis, its exact mapping, and compatible H crossbar drawings across the full width range. The four-family H interaction review adds 4,020 passing cases. Cotton's x-only width map also passes an independent y-only feature composition check, with zero difference from the explicit joint grid.

Rebuild the candidate and its exact subdivision binding:

```sh
node --max-old-space-size=512 --import tsx tools/authored/local-width-masters.ts \
  fonts/masters/bbef63cb6315effcfd88971ea84aa20324700567c771b1ddbbc7e6ae215682c4.json \
  .audit/width/Cotton-local
node --max-old-space-size=512 --import tsx tools/authored/review-width-heights.ts \
  .audit/width/Cotton-local-prototype.json
python3 tools/authored/review-subdivision.py \
  fonts/masters/bbef63cb6315effcfd88971ea84aa20324700567c771b1ddbbc7e6ae215682c4.json \
  .audit/width/Cotton-local-base.json .audit/width/Cotton-local-binding.json
```

This writes `-base.json`, `-prototype.json`, `-binding.json`, `-review.json`, and word specimens. The source weight package is unchanged. Render all characters separately at each width and size without regenerating geometry:

```sh
env WIDTH_REVIEW_ALL=1 WIDTH_REVIEW_WEIGHTS=200,600 WIDTH_REVIEW_WIDTHS=85 WIDTH_REVIEW_SIZE=42 \
  node --max-old-space-size=512 --import tsx tools/authored/width-masters.ts --render \
  .audit/width/Cotton-local-prototype.json .audit/width/Cotton-all-85-42
```
