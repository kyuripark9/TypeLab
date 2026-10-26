# Source components

Source components give named pieces of a glyph their own transforms. The authoring recipe binds i, j, and detached punctuation dots in all 22 bundled source styles. The Size control appears only while editing a covered glyph alone. Original, Round, and Square forms remain separate capabilities; these assets enable Size only.

The assets use 70% as the small endpoint and at most 135% as the large endpoint. Boardwalk's tittles are capped at 110%, and Orbital's at 120%. Each glyph's large endpoint can be reduced further by the stored geometry's spacing or component-clearance limits. These are linear dimensions relative to the current source component. Full optical and interaction validation is deferred.

## Asset contract

`source-components-v1` pins an exact master base and an exact native width asset, or `null` for geometric width. A source program refers to the component asset by its immutable digest. Registration rejects a different weight or width basis.

Each binding contains:

- A glyph and a component ID, such as `i` / `tittle`.
- Explicit source contour indices.
- Small and large Size multipliers.
- An `ink-bottom-center` or `ink-center` anchor.

Bindings may name arbitrary glyphs. Several independent components can belong to one glyph, allowing future colon, ellipsis, or divide recipes to resize each dot without scaling the spacing between them. Components cannot share contours. Shape inference and punctuation classification do not happen at runtime.

The declared evaluation stage is `after-proportions-before-pose-v1`. Bounds use true cubic extrema. Uniform Size scales a component about its declared anchor after weight, native width, compatible features, and height/geometric-width transforms. It then follows the same placement, rotation, slant, and finishing operations as the body. Its growth does not recalculate side bearings or advance. Size at the saved neutral is an exact no-op. Ascent and descent can grow by the component's added vertical extent.

Serenade j uses its explicit dot contour even though the body's return flourish overlaps the dot's vertical range. Selecting a component by a whole-glyph height cutoff would exclude this valid detached dot.

## Punctuation coverage

The recipe contains 17 component groups per style: 374 groups across 286 glyphs. Every punctuation dot uses its own source ink center, preserving the authored centers independently as Size changes. Saved point offsets follow the same transform, as described below.

| Glyphs | Selected groups | Preserved pieces |
| --- | --- | --- |
| i j | One tittle, anchored at its bottom-center | Letter bodies |
| . · • | The entire single-contour dot | Advance and placement |
| : | Upper and lower dots independently | Their centers and spacing |
| ; | Upper dot only | The attached comma head and tail |
| … | Left, middle, and right dots independently | Their centers and spacing |
| ! ¡ ? ¿ | The detached dot | Stroke or question body |
| ÷ | Upper and lower dots independently | The divide bar |

The explicit indices in `tools/authored/component-bindings.json` were authored from each neutral source glyph's actual contour inventory and pinned to its original outline reference. All 22 styles have the requested detached punctuation components. Neither comma tails nor question bodies are split apart, and no runtime heuristic chooses the smallest or highest contour. A whole-glyph component is valid; a remaining body is not required.

## Saved Points

The saved frame already includes `dotSize`, `freeAt`, and the exact source program. Evaluation removes the saved pose and component transform, carries the drawing through the existing source/basis/proportion transport, applies the current component transform, and restores the current pose. This scales the actual edited dot, including deliberate point offsets. For a source point P and an edit E, Size produces S(P+E).

Contour ownership is captured before generic nearest-source provenance inference. Pen splits and reversals retain their authored component identity. A contour that mixes component and body ancestry, or lacks reliable source ancestry, remains an independent user drawing. Inferred ancestry is not persisted as new component ownership on the next save. When rounded Points need conversion to curves, known component ownership also constrains provenance recovery to that component.

A change to Size alone retains saved body/unbound contour objects and advance exactly. Changes to weight, width, heights, or pose still use normal saved-edit transport. Finishing effects consume the final component geometry; editable Points remain the pre-finish drawing.

New component programs initialize `dotSize` and `freeAt.dotSize` to 0.5. Explicit adoption initializes this newly enabled control the same way and removes dormant per-letter Size values from older programs. Saved Points frames remain intact. Later component-capable revisions preserve existing Size values and their saved neutral. When coverage grows, only the newly covered glyphs start neutral; dormant values on those glyphs do not become active unexpectedly.

## Authoring and publication

The compiler takes explicit pinned pairs rather than following a mutable latest-style lookup:

```json
[
  {
    "base": {"kind":"masters-v1","digest":"…","fontId":"Mainline:600"},
    "width": {"kind":"width-masters-v1","digest":"…","fontId":"Mainline:600"}
  }
]
```

Use `null` for `width` when the program has no authored width asset. Run from the repository root:

```sh
node --max-old-space-size=512 --import tsx tools/authored/build-components.ts \
  --input tools/authored/component-bases.json --out fonts/components
```

The compiler reads published bases and width assets, loads the explicit bindings, validates every stored weight/width knot, and writes canonical immutable JSON plus `fonts/components/manifest.json`. The manifest records the exact dependencies, ranges, and measured collision limits. Existing immutable files are checked before writing; programs are not published by this command. Add `--check` to compare with generated output without writing. `--bindings` selects another explicit recipe file.

Upper endpoints retain at least 20% of a separating box gap at the stored weight/width knots. The compiler considers simultaneous growth of all dots within a punctuation glyph, its unchanged body, and neighboring copies at normal tracking. It uses true curve bounds and the encoded advance, including rounding. Geometric-width styles include their 65% minimum width. All components of one glyph share its most restrictive large endpoint. These are fixed asset limits; runtime does not clamp a user's contour edits or spacing.

The tittle recipe continues to use repeated-dot spacing rather than dot/body box clearance: Serenade j's separate dot and flourish have overlapping boxes. Punctuation requires a positive separating axis at each stored knot; a case lacking one stops generation and needs an explicit clearance recipe.

The final width-family inputs produce some narrow large-size ranges. Funnies divide is limited to 100.6818% by its tightest stored dot/bar gap; Orbital ellipsis to 104.6556%; Mainline ellipsis to 106.7541%. Their small endpoint remains 70%. More growth would need a separately authored change to spacing, placement, or shape. The compiler does not silently move a dot center to make room.

After a basis or width revision, supply a new pair file and run the same compiler. The resulting component digest changes with its exact dependencies. Publish a complete source program containing that digest, its matching base and width, and any feature/finish dependencies through `build-programs.ts --program`. Regenerate neutral preview fonts after program publication because preview fonts pin the complete program reference.

## Current validation limits

The initial tittle generator compiled 22 families and 44 bindings. The punctuation generator compiled 374 component groups across 286 glyphs against the final 22 native-width pairs; typecheck also passes. Compiler checks establish explicit references, contour presence, nonzero component bounds, and the recorded knot-spacing calculations. They do not certify the entire interpolated designspace.

The requested implementation-first sequence defers full unit/integration tests, rendered specimens, intermediate weight/width sweeps, height/pose interactions, arbitrary edited contours, browser behavior, and save/reopen/export comparisons. Accents and attached comma/quote shapes remain outside this coverage. They require explicit component identities and attachment rules before becoming available in the UI.
