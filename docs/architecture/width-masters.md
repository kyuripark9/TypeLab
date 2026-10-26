# Joint weight and width masters

Mainline, Parlance, and Gumdrop now have published joint weight and width masters. The offline authoring tools carry designed width changes from their pinned upstream fonts into the existing TypeLab weight families. The production assets live in `fonts/widths`; immutable program manifests in `fonts/programs` reference each width asset and its unchanged `masters-v1` base.

| Style | Upstream | Existing weights retained | Width samples | Neutral slider position |
| --- | --- | --- | --- | --- |
| Mainline | Roboto | 300, 400, 500, 600, 700, 800 | 75, 87.5, 100 | 1 |
| Parlance | Open Sans | 300, 400, 500, 600, 700, 800 | 75, 87.5, 100 | 1 |
| Gumdrop | Fredoka | 500, 600, 700 | 75, 100, 125 | 0.5 |

Width values are the upstream `wdth` design coordinates. They are not a geometric percentage to multiply into a glyph. The full slider interval 0–1 covers the authored width interval, including styles whose original width is the maximum. Thus Mainline and Parlance can condense from their original drawing; the prototype does not invent an expanded upstream endpoint.

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

Select a style's current file by its digest in `fonts/masters/manifest.json`, then run one style at a time:

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

Run `node --max-old-space-size=512 --import tsx tools/authored/review-width-heights.ts .audit/width/STYLE-prototype.json` for the height interaction report and specimens. `WIDTH_REVIEW_TEXT` accepts specimen text with newlines; `WIDTH_REVIEW_WEIGHTS` selects rendered weights without changing the geometry review.

After a candidate passes geometry and optical review, publish and verify it:

```sh
node --max-old-space-size=512 --import tsx tools/authored/build-programs.ts \
  --width .audit/width/STYLE-prototype.json
npm run programs:check
```

The publisher checks exact neutral-column equality against the referenced weight package before writing the content-addressed asset and program manifest. `programs:check` verifies published assets and references; it does not replace the candidate's optical review.

## Gumdrop correspondence repairs

The edited source merges components that the upstream font stores separately. Twenty-three glyphs differ in contour count. The explicit field recipe covers those glyphs plus `6`, `/`, and `®`, whose point/contour correspondence produced bad width changes. Each source anchor and handle has fixed coefficients in a local affine displacement field fitted to 24 nearby upstream curve samples. The field carries actual upstream width deltas at the current weight; it is not a generic weight offset or an x-scale. This is an approximation and its sampled topology checks are not a positive-Jacobian proof.

- Handles that collapse onto their anchor at a particular weight stay there. Without this constraint, condensation opened a 3.95-unit² spurious hole at the `R` leg.
- The expanded upstream slash has its cyclic starting point displaced by six nodes relative to the neutral outline. Aligning that endpoint before interpolation preserves its exact ink and prevents the interpolated slash from collapsing.
- The `®` inner R counter has its own contour correspondence. Its joined outer construction follows the field. A single field over the whole sign distorted that counter at the expanded end.

No character is frozen to avoid a failing width change. These recipes are recorded in the candidate notes and leave neutral width unchanged.

## Review contract

The review evaluates every grid node and the midpoint of every weight/width interval, including mixed cell interiors. It compares actual nonzero-filled components and counters against the current family at the same weight. It also checks exact neutral-width equality at every sampled weight. This is regression evidence, not a proof over the whole continuous domain.

The comparison sheet places the authored condensed drawing beside a geometrically scaled original with the same `H` ink width. The report measures `H` stem widths at one-quarter cap height. A useful width variation reduces body width while preserving more stem strength than geometric scaling. That measurement does not replace visual review of bowls, spacing, tails, joins, or punctuation.

When the transfer produces a bad join or corner, the next step is an explicit local repair or a narrower reviewed range. Do not silently freeze that glyph, independently reduce its requested width, or replace the candidate with geometric scaling.

## Production behavior

New designs use the published program for these three styles. The Width control displays authored axis coordinates. Its original width can be at an endpoint: Mainline and Parlance reset to 100 at the slider's maximum; Gumdrop resets to 100 at its midpoint. A displayed coordinate is not an identical body-width ratio for every glyph, as the `H` measurements below demonstrate.

Older saved designs retain their original source and geometric width behavior. Explicitly adopting the newer program resets the width to its authored neutral, is undoable, and retains saved Points edit frames. It does not apply the old geometric x-scale over the authored width change.

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

Mainline and Parlance still need locally authored expanded endpoints to recover the original editor's useful wide range. Their local candidates are unpublished. Such endpoints must be labeled as new local designs, reviewed across weights and heights, and stored separately from the native review files.

## Local expansion investigation

[expand-width-masters.ts](../../tools/authored/expand-width-masters.ts) writes a separate candidate with local width coordinates 125 and 150. Its initial premise was that the full native condensed displacement could simply be reversed. Both that attempt and a second attempt constraining curve handles failed in the same Mainline glyphs: `o` and `g` each held 41 failures in the diagnostic grid. The census and rejected report are retained under `.audit/width/rejected-expansion/`.

The cause was anchor ordering: reversing the upstream vertical adjustments swapped endpoints of short vertical bowl spans. Handle constraints could not repair reversed anchors. The revised local recipe changes horizontal coordinates only, preserving every vertical coordinate of the existing weight family. Mainline then passes 12,573 full-character mixed-grid cases through width 150, and its existing word specimens look coherent. Height and full-character optical review are still pending for this local extension.

Parlance's full grid exposed 14 remaining failures in `®` and the heavy `v`. The authored repair under review preserves the weight-specific inner-apex shape of `v` while translating it with the aperture center. Its registered sign expands both ring boundaries by the same horizontal radius increment, preserving side-stroke thickness and centering the inner R in the larger advance. These local repairs are not yet validated; the existing `.audit/width/Parlance-local-wide.json` remains a rejected candidate until a new review passes.

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
