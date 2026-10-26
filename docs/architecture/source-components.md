# Source components

Source components give named pieces of a glyph their own transforms. The first assets bind the tittles of i and j in all 22 bundled source styles. The Size control appears only while editing a covered letter alone. Original, Round, and Square forms remain separate capabilities; this unit enables Size only.

The current assets use 70% as the small endpoint. Most use 135% as the large endpoint; Boardwalk uses 110%, and Orbital uses 120%. These are linear dimensions relative to the current source component. They are implemented ranges, with full optical and interaction validation deferred.

## Asset contract

`source-components-v1` pins an exact master base and an exact native width asset, or `null` for geometric width. A source program refers to the component asset by its immutable digest. Registration rejects a different weight or width basis.

Each binding contains:

- A glyph and a component ID, such as `i` / `tittle`.
- Explicit source contour indices.
- Small and large Size multipliers.
- The `ink-bottom-center` anchor.

Bindings may name arbitrary glyphs. Several independent components can belong to one glyph, allowing future colon, ellipsis, or divide recipes to resize each dot without scaling the spacing between them. Components cannot share contours. Shape inference and punctuation classification do not happen at runtime.

The declared evaluation stage is `after-proportions-before-pose-v1`. Bounds use true cubic extrema. Uniform Size scales a component about the bottom-center of its current source ink, after weight, native width, compatible features, and height/geometric-width transforms. It then follows the same placement, rotation, slant, and finishing operations as the body. Its growth does not recalculate side bearings or advance. Size at the saved neutral is an exact no-op. Ascent can increase by the component's added vertical extent.

Serenade j uses its explicit dot contour even though the body's return flourish overlaps the dot's vertical range. Selecting a component by a whole-glyph height cutoff would exclude this valid detached dot.

## Saved Points

The saved frame already includes `dotSize`, `freeAt`, and the exact source program. Evaluation removes the saved pose and component transform, carries the drawing through the existing source/basis/proportion transport, applies the current component transform, and restores the current pose. This scales the actual edited dot, including deliberate point offsets. For a source point P and an edit E, Size produces S(P+E).

Contour ownership is captured before generic nearest-source provenance inference. Pen splits and reversals retain their authored component identity. A contour that mixes component and body ancestry, or lacks reliable source ancestry, remains an independent user drawing. Inferred ancestry is not persisted as new component ownership on the next save. When rounded Points need conversion to curves, known component ownership also constrains provenance recovery to that component.

A change to Size alone retains saved body/unbound contour objects and advance exactly. Changes to weight, width, heights, or pose still use normal saved-edit transport. Finishing effects consume the final component geometry; editable Points remain the pre-finish drawing.

New component programs initialize `dotSize` and `freeAt.dotSize` to 0.5. Explicit adoption initializes this newly enabled control the same way and removes dormant per-letter Size values from older programs. Saved Points frames remain intact. Later component-capable revisions preserve existing Size values and their saved neutral.

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

The compiler reads published bases and width assets, resolves the reviewed i/j identities, validates every stored weight/width knot, and writes canonical immutable JSON plus `fonts/components/manifest.json`. The manifest records the exact dependencies, ranges, and measured repeated-dot collision scales. Existing immutable files are checked before writing; programs are not published by this command. Add `--check` to compare with generated output without writing.

Upper endpoints retain at least 20% of the original repeated-dot horizontal gap at the stored weight/width knots and normal tracking. Geometric-width styles include their 65% minimum width in this calculation. These bounds use the encoded advance, including rounding. They are fixed asset limits; runtime does not clamp a user's contour edits or spacing.

After a basis or width revision, supply a new pair file and run the same compiler. The resulting component digest changes with its exact dependencies. Publish a complete source program containing that digest, its matching base and width, and any feature/finish dependencies through `build-programs.ts --program`. Regenerate neutral preview fonts after program publication because preview fonts pin the complete program reference.

## Current validation limits

The initial generator compiled 22 families and 44 bindings, and the application typecheck passes. Its checks prove explicit references, contour presence, nonzero component bounds, and the recorded knot-spacing calculations. They do not certify the entire interpolated designspace.

The requested implementation-first sequence defers full unit/integration tests, rendered specimens, intermediate weight/width sweeps, height/pose interactions, arbitrary edited contours, browser behavior, and save/reopen/export comparisons. Punctuation and accents are not yet bound by these assets. They require explicit component identities and anchors before becoming available in the UI.
